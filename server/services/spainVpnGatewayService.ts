/**
 * @module server/services/spainVpnGatewayService
 * @description Cross-device server-side Spanish VPN / Egress Proxy gateway.
 * Routes Spanish broadcasters (Atresplayer, Antena 3, laSexta, Mediaset, RTVE, TDT)
 * through a configured HTTP/HTTPS/SOCKS5 Spanish exit node (with automatic loopback
 * HTTP->SOCKS5 relay so FFmpeg/FFprobe also honor SOCKS5 tunnels) so Web, Mobile,
 * PWA, Android, Google TV, and Samsung Tizen TV appear inside Spain automatically.
 */

import dns from 'node:dns/promises';
import net from 'node:net';
import {
  ProxyAgent,
  Socks5ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from 'undici';
import { ENV } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  isDisallowedHostnameSyntax,
  isPrivateIpAddress,
} from '../utils/ssrfGuard.ts';
import { getUrbanVpnAuditSummary, listUrbanVpnGateways } from './urbanVpnService.ts';

export type SpainProxyScope = 'auto_spanish' | 'all_streaming' | 'off';

export interface GeoExitInfo {
  ok: boolean;
  ip: string;
  countryCode: string;
  country: string;
  city: string;
  isp: string;
  isSpain: boolean;
  provider: string;
  checkedAt: number;
  error?: string;
}

export interface SpainGatewayPublicConfig {
  enabled: boolean;
  configured: boolean;
  source: 'env' | 'runtime' | 'none';
  protocol: 'http' | 'https' | 'socks5' | 'socks5h' | 'none';
  maskedProxyUrl: string;
  scope: SpainProxyScope;
  updatedAt: number;
}

export interface SpainGatewayOverview {
  config: SpainGatewayPublicConfig;
  directGeo: GeoExitInfo;
  tunneledGeo: GeoExitInfo | null;
  spanishDvbHeadend: {
    host: string;
    antena3Ready: boolean;
    lasextaReady: boolean;
    energyReady: boolean;
    note: string;
  };
  atresplayerApi: {
    reachable: boolean;
    status: number;
  };
  urbanVpnAudit: ReturnType<typeof getUrbanVpnAuditSummary>;
  spainUrbanGateways: ReturnType<typeof listUrbanVpnGateways>;
}

export interface VerifiedSpanishChannelStatus {
  id: string;
  name: string;
  route: string;
  routedViaProxy: boolean;
  ok: boolean;
  status: number;
  latencyMs: number;
  detail: string;
}

const SPANISH_GEO_ROUTING_PATTERNS: RegExp[] = [
  /(?:^|\.)atresplayer\.com$/i,
  /(?:^|\.)atresmedia\.com$/i,
  /(?:^|\.)atres\.com$/i,
  /(?:^|\.)a3player\.com$/i,
  /(?:^|\.)mediaset\.es$/i,
  /(?:^|\.)mediaset\.net$/i,
  /(?:^|\.)mediaset\.it$/i,
  /(?:^|\.)mediasetplay\.mediaset\.it$/i,
  /(?:^|\.)mediasetinfinity\.es$/i,
  /(?:^|\.)energytv\.es$/i,
  /(?:^|\.)bemad\.es$/i,
  /(?:^|\.)divinity\.es$/i,
  /(?:^|\.)mitele\.es$/i,
  /(?:^|\.)telecinco\.es$/i,
  /(?:^|\.)cuatro\.com$/i,
  /(?:^|\.)rtve\.es$/i,
  /(?:^|\.)ccma\.cat$/i,
  /(?:^|\.)3cat\.cat$/i,
  /(?:^|\.)3catdirectes\.cat$/i,
  /(?:^|\.)eitb\.eus$/i,
  /(?:^|\.)telemadrid\.es$/i,
  /(?:^|\.)canalsur\.es$/i,
  /(?:^|\.)tdtchannels\.com$/i,
  /(?:^|\.)otteravision\.com$/i,
  /(?:^|\.)ottera\.tv$/i,
  /(?:^|\.)sharkpro\.ink$/i,
  /^90\.163\.85\.113$/i,
  /^103\.163\.132\.49$/i,
  /^185\.217\.39\.251$/i,
];

const BYPASS_PROXY_HOST_PATTERNS: RegExp[] = [
  /(?:^|\.)themoviedb\.org$/i,
  /(?:^|\.)tmdb\.org$/i,
  /(?:^|\.)googleapis\.com$/i,
  /(?:^|\.)firebaseio\.com$/i,
  /(?:^|\.)google\.com$/i,
];

interface RuntimeProxyState {
  proxyUrl: string;
  scope: SpainProxyScope;
  enabled: boolean;
  source: 'env' | 'runtime' | 'none';
  updatedAt: number;
}

const state: RuntimeProxyState = {
  proxyUrl: ENV.spainProxyUrl || '',
  scope: ENV.spainProxyUrl ? ENV.spainProxyScope : 'auto_spanish',
  enabled: Boolean(ENV.spainProxyUrl && ENV.spainProxyScope !== 'off'),
  source: ENV.spainProxyUrl ? 'env' : 'none',
  updatedAt: Date.now(),
};

const dispatcherCache = new Map<string, Dispatcher>();
const geoCache = new LruTtlCache<string, GeoExitInfo>(16, 45_000);

// Loopback HTTP CONNECT bridge -> upstream SOCKS5 proxy for FFmpeg / FFprobe
let socksBridgeServer: net.Server | null = null;
let socksBridgePort = 0;
let socksBridgeUpstreamUrl = '';

function closeSocksBridge(): void {
  if (socksBridgeServer) {
    try {
      socksBridgeServer.close();
    } catch {
      // ignore
    }
    socksBridgeServer = null;
  }
  socksBridgePort = 0;
  socksBridgeUpstreamUrl = '';
}

function dialThroughSocks5(
  proxyParsed: URL,
  destHost: string,
  destPort: number,
  timeoutMs = 5500
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const proxyHost = proxyParsed.hostname.replace(/^\[|\]$/g, '');
    const proxyPort = Number(proxyParsed.port || 1080);
    const username = decodeURIComponent(proxyParsed.username || '');
    const password = decodeURIComponent(proxyParsed.password || '');

    let settled = false;
    const sock = net.createConnection({ host: proxyHost, port: proxyPort, timeout: timeoutMs });

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      reject(err);
    };

    sock.on('error', fail);
    sock.on('timeout', () => fail(new Error('SOCKS5 bridge timeout')));

    const readExact = (bytesNeeded: number): Promise<Buffer> =>
      new Promise((res, rej) => {
        let buf = Buffer.alloc(0);
        const onData = (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          if (buf.length >= bytesNeeded) {
            cleanup();
            if (buf.length > bytesNeeded) {
              sock.unshift(buf.subarray(bytesNeeded));
            }
            res(buf.subarray(0, bytesNeeded));
          }
        };
        const onErr = (e: Error) => {
          cleanup();
          rej(e);
        };
        const onClose = () => {
          cleanup();
          rej(new Error('SOCKS5 socket closed early'));
        };
        const cleanup = () => {
          sock.off('data', onData);
          sock.off('error', onErr);
          sock.off('close', onClose);
        };
        sock.on('data', onData);
        sock.once('error', onErr);
        sock.once('close', onClose);
      });

    sock.once('connect', async () => {
      try {
        const useUserPass = Boolean(username || password);
        const methods = useUserPass ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]);
        sock.write(methods);
        const greeting = await readExact(2);
        if (greeting[0] !== 0x05 || greeting[1] === 0xff) {
          throw new Error('SOCKS5 auth method rejected');
        }
        if (greeting[1] === 0x02) {
          const uBuf = Buffer.from(username, 'utf8');
          const pBuf = Buffer.from(password, 'utf8');
          if (uBuf.length > 255 || pBuf.length > 255) throw new Error('SOCKS5 credentials too long');
          const authPacket = Buffer.concat([
            Buffer.from([0x01, uBuf.length]),
            uBuf,
            Buffer.from([pBuf.length]),
            pBuf,
          ]);
          sock.write(authPacket);
          const authResp = await readExact(2);
          if (authResp[1] !== 0x00) {
            throw new Error('SOCKS5 username/password rejected');
          }
        }

        const hostBuf = Buffer.from(destHost, 'utf8');
        if (hostBuf.length === 0 || hostBuf.length > 255) throw new Error('Invalid destination host');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(destPort, 0);
        const reqPacket = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
          hostBuf,
          portBuf,
        ]);
        sock.write(reqPacket);

        const repHead = await readExact(4);
        if (repHead[0] !== 0x05 || repHead[1] !== 0x00) {
          throw new Error(`SOCKS5 CONNECT rejected (${repHead[1]})`);
        }
        const atyp = repHead[3];
        if (atyp === 0x01) await readExact(6);
        else if (atyp === 0x04) await readExact(18);
        else if (atyp === 0x03) {
          const lenB = await readExact(1);
          await readExact(lenB[0] + 2);
        }

        if (!settled) {
          settled = true;
          sock.setTimeout(0);
          sock.off('error', fail);
          resolve(sock);
        }
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

function ensureSocksToHttpBridge(proxyUrl: string): number {
  if (socksBridgeServer && socksBridgePort > 0 && socksBridgeUpstreamUrl === proxyUrl) {
    return socksBridgePort;
  }
  closeSocksBridge();

  let parsedProxy: URL;
  try {
    parsedProxy = new URL(proxyUrl);
  } catch {
    return 0;
  }

  const server = net.createServer((clientSock) => {
    let headerBuf = Buffer.alloc(0);
    const onData = async (chunk: Buffer) => {
      headerBuf = Buffer.concat([headerBuf, chunk]);
      const sepIdx = headerBuf.indexOf('\r\n\r\n');
      if (sepIdx === -1) {
        if (headerBuf.length > 16_384) clientSock.destroy();
        return;
      }
      clientSock.off('data', onData);
      const rawHead = headerBuf.subarray(0, sepIdx).toString('latin1');
      const remainder = headerBuf.subarray(sepIdx + 4);
      const firstLine = rawHead.split('\r\n')[0] || '';
      const [method = '', target = ''] = firstLine.split(' ');

      let destHost = '';
      let destPort = 80;
      if (method.toUpperCase() === 'CONNECT') {
        const idx = target.lastIndexOf(':');
        destHost = idx > 0 ? target.slice(0, idx) : target;
        destPort = idx > 0 ? Number(target.slice(idx + 1)) || 443 : 443;
      } else {
        try {
          const u = new URL(target);
          destHost = u.hostname;
          destPort = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
        } catch {
          clientSock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
          return;
        }
      }

      const cleanDestHost = destHost.replace(/^\[|\]$/g, '').toLowerCase();
      if (!cleanDestHost || isDisallowedHostnameSyntax(cleanDestHost) || (net.isIP(cleanDestHost) && isPrivateIpAddress(cleanDestHost))) {
        clientSock.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }

      try {
        const upstreamSock = await dialThroughSocks5(parsedProxy, cleanDestHost, destPort);
        if (method.toUpperCase() === 'CONNECT') {
          clientSock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        } else {
          const u = new URL(target);
          const relTarget = `${u.pathname || '/'}${u.search || ''}`;
          const lines = rawHead.split('\r\n');
          lines[0] = `${method} ${relTarget} HTTP/1.1`;
          const filteredLines = lines.filter((l) => !/^proxy-/i.test(l));
          upstreamSock.write(filteredLines.join('\r\n') + '\r\n\r\n');
        }
        if (remainder.length > 0) upstreamSock.write(remainder);
        clientSock.pipe(upstreamSock);
        upstreamSock.pipe(clientSock);
        const destroyBoth = () => {
          clientSock.destroy();
          upstreamSock.destroy();
        };
        clientSock.on('error', destroyBoth);
        upstreamSock.on('error', destroyBoth);
      } catch {
        clientSock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }
    };
    clientSock.on('data', onData);
    clientSock.on('error', () => {});
  });

  server.listen(0, '127.0.0.1');
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    socksBridgeServer = server;
    socksBridgePort = addr.port;
    socksBridgeUpstreamUrl = proxyUrl;
    server.unref?.();
    return socksBridgePort;
  }
  server.close();
  return 0;
}

export function maskProxyUrl(rawUrl: string): string {
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';
  try {
    const u = new URL(clean);
    const authPart = u.username ? `${u.username.slice(0, 2)}***@` : '';
    const portPart = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${authPart}${u.hostname}${portPart}`;
  } catch {
    return '***';
  }
}

export async function validateSpainProxyUrl(
  rawProxyUrl: string,
  options?: { allowPrivateEnv?: boolean }
): Promise<{ ok: true; normalizedUrl: string; protocol: 'http' | 'https' | 'socks5' | 'socks5h' } | { ok: false; error: string }> {
  const clean = String(rawProxyUrl || '').trim();
  if (!clean) {
    return { ok: false, error: 'Introduce una URL de proxy válida (http://, https:// o socks5h://).' };
  }
  if (clean.length > 512) {
    return { ok: false, error: 'URL de proxy demasiado larga.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return { ok: false, error: 'Formato de URL inválido. Ejemplo: socks5h://usuario:clave@ip-espana:1080' };
  }

  const proto = parsed.protocol.replace(':', '').toLowerCase();
  if (proto !== 'http' && proto !== 'https' && proto !== 'socks5' && proto !== 'socks5h') {
    return { ok: false, error: 'Protocolo no compatible. Usa http://, https://, socks5:// o socks5h://' };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) {
    return { ok: false, error: 'Falta el servidor o IP del proxy.' };
  }

  if (!options?.allowPrivateEnv) {
    if (isDisallowedHostnameSyntax(host)) {
      return { ok: false, error: 'Host privado o local bloqueado por seguridad SSRF.' };
    }
    if (!net.isIP(host)) {
      try {
        const records = await dns.lookup(host, { all: true });
        if (!records.length || records.some((r) => isPrivateIpAddress(r.address))) {
          return { ok: false, error: 'El host del proxy resuelve a una IP privada o inválida.' };
        }
      } catch {
        return { ok: false, error: 'No se pudo resolver el dominio del proxy.' };
      }
    }
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    protocol: proto,
  };
}

function createDispatcherForProxy(proxyUrl: string): Dispatcher {
  const existing = dispatcherCache.get(proxyUrl);
  if (existing) return existing;

  const normalizedForUndici = proxyUrl.replace(/^socks5h:\/\//i, 'socks5://');
  const agent: Dispatcher = /^socks5/i.test(normalizedForUndici)
    ? new Socks5ProxyAgent(normalizedForUndici)
    : new ProxyAgent({
        uri: normalizedForUndici,
        requestTls: { rejectUnauthorized: false },
      });

  if (dispatcherCache.size > 8) {
    const firstKey = dispatcherCache.keys().next().value;
    if (firstKey) dispatcherCache.delete(firstKey);
  }
  dispatcherCache.set(proxyUrl, agent);
  return agent;
}

export function getSpainGatewayPublicConfig(): SpainGatewayPublicConfig {
  let protocol: SpainGatewayPublicConfig['protocol'] = 'none';
  if (state.proxyUrl) {
    const m = state.proxyUrl.match(/^(socks5h|socks5|https|http):\/\//i);
    if (m) protocol = m[1].toLowerCase() as SpainGatewayPublicConfig['protocol'];
  }
  return {
    enabled: state.enabled && Boolean(state.proxyUrl) && state.scope !== 'off',
    configured: Boolean(state.proxyUrl),
    source: state.proxyUrl ? state.source : 'none',
    protocol,
    maskedProxyUrl: maskProxyUrl(state.proxyUrl),
    scope: state.scope,
    updatedAt: state.updatedAt,
  };
}

export function shouldRouteThroughSpainProxy(targetUrl: string): boolean {
  if (!state.enabled || !state.proxyUrl || state.scope === 'off') return false;
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return false;
  }
  if (BYPASS_PROXY_HOST_PATTERNS.some((rx) => rx.test(host))) {
    return false;
  }
  if (state.scope === 'all_streaming') {
    return true;
  }
  if (
    /(?:^|\.)(akamaihd|akamaized)\.net$/i.test(host) &&
    /\/(cuatro|telecinco|fdf|bemad|energy|divinity|atres|mediaset|mitele)\b/i.test(parsed.pathname)
  ) {
    return true;
  }
  return SPANISH_GEO_ROUTING_PATTERNS.some((rx) => rx.test(host));
}

export function getSpainProxyUrlForTarget(targetUrl: string): string | null {
  if (!shouldRouteThroughSpainProxy(targetUrl)) return null;
  return state.proxyUrl;
}

export function getSpainProxyDispatcherForTarget(targetUrl: string): Dispatcher | undefined {
  const proxyUrl = getSpainProxyUrlForTarget(targetUrl);
  if (!proxyUrl) return undefined;
  return createDispatcherForProxy(proxyUrl);
}

export function getSpainFfmpegHttpProxyArgs(targetUrl: string): string[] {
  const proxyUrl = getSpainProxyUrlForTarget(targetUrl);
  if (!proxyUrl) return [];
  if (/^https?:\/\//i.test(proxyUrl)) {
    return ['-http_proxy', proxyUrl];
  }
  if (/^socks5h?:\/\//i.test(proxyUrl) && !process.env.VITEST) {
    const port = ensureSocksToHttpBridge(proxyUrl);
    if (port > 0) {
      return ['-http_proxy', `http://127.0.0.1:${port}`];
    }
  }
  return [];
}

export async function probeGeoExitInfo(proxyUrl?: string): Promise<GeoExitInfo> {
  const cacheKey = proxyUrl ? `proxy:${proxyUrl}` : 'direct';
  const cached = geoCache.get(cacheKey);
  if (cached) return cached;

  const dispatcher = proxyUrl ? createDispatcherForProxy(proxyUrl) : undefined;
  const fallbackInfo = (errMsg: string): GeoExitInfo => ({
    ok: false,
    ip: '',
    countryCode: '',
    country: '',
    city: '',
    isp: '',
    isSpain: false,
    provider: 'ipwho.is',
    checkedAt: Date.now(),
    error: errMsg,
  });

  try {
    const res = await undiciFetch('https://ipwho.is/', {
      dispatcher,
      headers: { Accept: 'application/json', 'User-Agent': 'RiffanTV/3.3' },
      signal: AbortSignal.timeout(5500),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        ip?: string;
        country_code?: string;
        country?: string;
        city?: string;
        connection?: { isp?: string };
      };
      if (data && data.ip) {
        const cc = String(data.country_code || '').toUpperCase();
        const info: GeoExitInfo = {
          ok: data.success !== false,
          ip: String(data.ip),
          countryCode: cc,
          country: String(data.country || ''),
          city: String(data.city || ''),
          isp: String(data.connection?.isp || ''),
          isSpain: cc === 'ES',
          provider: 'ipwho.is',
          checkedAt: Date.now(),
        };
        geoCache.set(cacheKey, info);
        return info;
      }
    }
  } catch (err) {
    logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'ipwhois_geo_probe_fallback');
  }

  try {
    const res2 = await undiciFetch('https://geo.geosurf.io/', {
      dispatcher,
      headers: { Accept: 'application/json', 'User-Agent': 'RiffanTV/3.3' },
      signal: AbortSignal.timeout(5000),
    });
    if (res2.ok) {
      const data2 = (await res2.json()) as {
        ip?: string;
        country?: string;
        city?: string;
        isp?: string;
        organization?: string;
      };
      const cc = String(data2?.country || '').toUpperCase();
      const info2: GeoExitInfo = {
        ok: Boolean(data2?.ip),
        ip: String(data2?.ip || ''),
        countryCode: cc,
        country: cc === 'ES' ? 'Spain' : cc,
        city: String(data2?.city || ''),
        isp: String(data2?.isp || data2?.organization || ''),
        isSpain: cc === 'ES' || /^spain$/i.test(cc),
        provider: 'geo.geosurf.io',
        checkedAt: Date.now(),
      };
      geoCache.set(cacheKey, info2);
      return info2;
    }
    return fallbackInfo(`HTTP ${res2.status}`);
  } catch (err) {
    return fallbackInfo(err instanceof Error ? err.message : String(err));
  }
}

export async function setRuntimeSpainProxyConfig(input: {
  proxyUrl?: string;
  scope?: SpainProxyScope;
  enabled?: boolean;
  skipGeoProbe?: boolean;
}): Promise<{ ok: true; config: SpainGatewayPublicConfig; tunneledGeo: GeoExitInfo | null } | { ok: false; error: string }> {
  const nextScope: SpainProxyScope =
    input.scope === 'all_streaming' || input.scope === 'off' ? input.scope : 'auto_spanish';

  if (input.proxyUrl !== undefined) {
    const clean = String(input.proxyUrl || '').trim();
    if (!clean) {
      closeSocksBridge();
      state.proxyUrl = '';
      state.enabled = false;
      state.source = 'none';
      state.scope = nextScope;
      state.updatedAt = Date.now();
      return { ok: true, config: getSpainGatewayPublicConfig(), tunneledGeo: null };
    }
    const validation = await validateSpainProxyUrl(clean);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
    if (state.proxyUrl !== validation.normalizedUrl) {
      closeSocksBridge();
    }
    state.proxyUrl = validation.normalizedUrl;
    state.source = 'runtime';
  }

  state.scope = nextScope;
  state.enabled =
    input.enabled !== undefined
      ? Boolean(input.enabled) && Boolean(state.proxyUrl)
      : Boolean(state.proxyUrl) && nextScope !== 'off';
  state.updatedAt = Date.now();
  geoCache.clear();

  const shouldProbe =
    state.enabled &&
    Boolean(state.proxyUrl) &&
    !input.skipGeoProbe &&
    !process.env.VITEST;
  const tunneledGeo = shouldProbe ? await probeGeoExitInfo(state.proxyUrl) : null;
  logger.info(
    {
      enabled: state.enabled,
      scope: state.scope,
      maskedProxyUrl: maskProxyUrl(state.proxyUrl),
      tunneledCountry: tunneledGeo?.countryCode || null,
    },
    'spain_vpn_gateway_updated'
  );
  return {
    ok: true,
    config: getSpainGatewayPublicConfig(),
    tunneledGeo,
  };
}

export function clearRuntimeSpainProxyConfig(): SpainGatewayPublicConfig {
  closeSocksBridge();
  state.proxyUrl = '';
  state.enabled = false;
  state.source = 'none';
  state.scope = 'auto_spanish';
  state.updatedAt = Date.now();
  geoCache.clear();
  return getSpainGatewayPublicConfig();
}

async function checkDvbHeadendHead(url: string): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  const t0 = Date.now();
  const dispatcher = getSpainProxyDispatcherForTarget(url);
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      dispatcher,
      signal: AbortSignal.timeout(2800),
    });
    const text = res.ok ? await res.text() : '';
    const isValidM3u = res.ok && text.includes('#EXTM3U');
    return { ok: isValidM3u, status: res.status, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, status: 0, latencyMs: Date.now() - t0 };
  }
}

export async function verifySpanishChannelsDirectAccess(): Promise<{
  checkedAt: number;
  proxyActive: boolean;
  channels: VerifiedSpanishChannelStatus[];
}> {
  const config = getSpainGatewayPublicConfig();
  const targets = [
    {
      id: 'tdt-antena3',
      name: 'Antena 3 HD (Directa DVB España)',
      url: 'http://90.163.85.113:8093/stream/20/index.m3u8',
      kind: 'hls' as const,
    },
    {
      id: 'tdt-lasexta',
      name: 'laSexta HD (Directa DVB España)',
      url: 'http://90.163.85.113:8093/stream/21/index.m3u8',
      kind: 'hls' as const,
    },
    {
      id: 'tdt-energy',
      name: 'Energy HD (Directa DVB España)',
      url: 'http://90.163.85.113:8093/stream/18/index.m3u8',
      kind: 'hls' as const,
    },
    {
      id: 'mediaset-energy',
      name: 'Mediaset Infinity Directo (Energy TV)',
      url: 'https://directos.energytv.es/orilinear03/live/linear03/main/main.isml/main-audio_spa=128000-video=1500000.m3u8',
      kind: 'hls' as const,
    },
    {
      id: 'atresplayer-guide',
      name: 'Atresplayer Guía Oficial (Antena 3 & laSexta)',
      url: 'https://api.atresplayer.com/client/v1/row/live',
      kind: 'json' as const,
    },
    {
      id: 'atresplayer-a3-player',
      name: 'Atresplayer Oficial Stream (Antena 3)',
      url: 'https://api.atresplayer.com/player/v1/live/5a6a165a7ed1a834493ebf6a',
      kind: 'json' as const,
    },
    {
      id: 'atresplayer-lasexta-player',
      name: 'Atresplayer Oficial Stream (laSexta)',
      url: 'https://api.atresplayer.com/player/v1/live/5a6a172c7ed1a834493ebf6b',
      kind: 'json' as const,
    },
    {
      id: 'tdt-3cat',
      name: 'TV3 / 3Cat Directo CDN Público',
      url: 'https://directes-tv-es.3catdirectes.cat/live-content/tv3-hls/master.m3u8',
      kind: 'hls' as const,
    },
  ];

  const checks = await Promise.all(
    targets.map(async (t): Promise<VerifiedSpanishChannelStatus> => {
      const t0 = Date.now();
      const routedViaProxy = shouldRouteThroughSpainProxy(t.url);
      const dispatcher = getSpainProxyDispatcherForTarget(t.url);
      try {
        const res = await undiciFetch(t.url, {
          method: 'GET',
          dispatcher,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4500),
        });
        const body = await res.text();
        const latencyMs = Date.now() - t0;
        const ok = t.kind === 'hls' ? res.ok && body.includes('#EXTM3U') : res.ok;
        let detail = ok ? 'Emisión en directo operativa' : `HTTP ${res.status}`;
        if (!ok && t.id.startsWith('atresplayer-') && res.status === 403) {
          detail = routedViaProxy
            ? 'Atresplayer requiere cuenta/sesión activa (HTTP 403) · usa señal Directa HD 1080p'
            : 'Bloqueo geo/cuenta Atresplayer · activa Proxy España o usa señal Directa HD';
        }
        return {
          id: t.id,
          name: t.name,
          route: t.url,
          routedViaProxy,
          ok,
          status: res.status,
          latencyMs,
          detail,
        };
      } catch (err) {
        return {
          id: t.id,
          name: t.name,
          route: t.url,
          routedViaProxy,
          ok: false,
          status: 0,
          latencyMs: Date.now() - t0,
          detail: err instanceof Error ? err.message : 'Timeout',
        };
      }
    })
  );

  return {
    checkedAt: Date.now(),
    proxyActive: config.enabled,
    channels: checks,
  };
}

export async function getSpainGatewayOverview(): Promise<SpainGatewayOverview> {
  const config = getSpainGatewayPublicConfig();
  const atresDispatcher = getSpainProxyDispatcherForTarget(
    'https://api.atresplayer.com/client/v1/row/live'
  );
  const [directGeo, tunneledGeo, a3Check, sextaCheck, energyCheck, atresResp] = await Promise.all([
    probeGeoExitInfo(undefined),
    config.enabled && state.proxyUrl ? probeGeoExitInfo(state.proxyUrl) : Promise.resolve(null),
    checkDvbHeadendHead('http://90.163.85.113:8093/stream/20/index.m3u8'),
    checkDvbHeadendHead('http://90.163.85.113:8093/stream/21/index.m3u8'),
    checkDvbHeadendHead('http://90.163.85.113:8093/stream/18/index.m3u8'),
    (atresDispatcher
      ? undiciFetch('https://api.atresplayer.com/client/v1/row/live', {
          dispatcher: atresDispatcher,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4500),
        })
      : fetch('https://api.atresplayer.com/client/v1/row/live', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4500),
        })
    )
      .then(async (r) => {
        await r.body?.cancel?.().catch(() => {});
        return { reachable: r.ok, status: r.status };
      })
      .catch(() => ({ reachable: false, status: 0 })),
  ]);

  return {
    config,
    directGeo,
    tunneledGeo,
    spanishDvbHeadend: {
      host: '90.163.85.113:8093',
      antena3Ready: a3Check.ok,
      lasextaReady: sextaCheck.ok,
      energyReady: energyCheck.ok,
      note: 'Cabecera DVB España 1080p HD directa (Antena 3 / laSexta / Energy)',
    },
    atresplayerApi: atresResp,
    urbanVpnAudit: getUrbanVpnAuditSummary(),
    spainUrbanGateways: listUrbanVpnGateways({ spainOnly: true }),
  };
}

function testTcpConnect(host: string, port: number, timeoutMs = 1800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port, timeout: timeoutMs });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

export interface AutoSpainProxyDiscoveryResult {
  connected: boolean;
  testedCount: number;
  tcpReachableCount: number;
  proxyUrl?: string;
  geo?: GeoExitInfo | null;
  energyDirectOk?: boolean;
  config: SpainGatewayPublicConfig;
  message: string;
}

export async function discoverAndConnectWorkingSpainProxy(): Promise<AutoSpainProxyDiscoveryResult> {
  const candidates = new Set<string>();
  const feedUrls = [
    {
      url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/ES/data.txt',
      kind: 'txt' as const,
    },
    {
      url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&country=ES&timeout=3500',
      kind: 'http-txt' as const,
    },
    {
      url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&country=ES&timeout=3500',
      kind: 'socks5-txt' as const,
    },
    {
      url: 'https://proxylist.geonode.com/api/proxy-list?country=ES&limit=20&page=1&sort_by=lastChecked&sort_type=desc',
      kind: 'geonode' as const,
    },
  ];

  await Promise.allSettled(
    feedUrls.map(async (feed) => {
      try {
        const res = await undiciFetch(feed.url, {
          headers: { 'User-Agent': 'RiffanTV/3.4' },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const raw = await res.text();
        if (feed.kind === 'geonode') {
          const parsed = JSON.parse(raw) as {
            data?: Array<{ ip?: string; port?: string | number; protocols?: string[] }>;
          };
          for (const row of parsed?.data || []) {
            if (!row?.ip || !row?.port) continue;
            const proto = row.protocols?.includes('socks5') ? 'socks5' : 'http';
            candidates.add(`${proto}://${row.ip}:${row.port}`);
          }
        } else {
          for (const line of raw.split(/\r?\n/)) {
            const clean = line.trim();
            if (!clean) continue;
            if (/^(https?|socks5h?):\/\//i.test(clean)) {
              candidates.add(clean);
            } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$/.test(clean)) {
              const prefix = feed.kind === 'socks5-txt' ? 'socks5://' : 'http://';
              candidates.add(`${prefix}${clean}`);
            }
          }
        }
      } catch {
        // ignore feed errors
      }
    })
  );

  const list = Array.from(candidates).slice(0, 36);
  const validated: Array<{ url: string; host: string; port: number }> = [];
  for (const rawUrl of list) {
    const check = await validateSpainProxyUrl(rawUrl);
    if (!check.ok) continue;
    try {
      const u = new URL(check.normalizedUrl);
      const port = Number(u.port || (u.protocol.startsWith('socks') ? 1080 : 80));
      if (port > 0 && port <= 65535) {
        validated.push({ url: check.normalizedUrl, host: u.hostname, port });
      }
    } catch {
      // ignore
    }
  }

  // Probe TCP liveness first in batches of 12
  const tcpOpen: string[] = [];
  for (let i = 0; i < validated.length; i += 12) {
    const batch = validated.slice(i, i + 12);
    const hits = await Promise.all(
      batch.map(async (item) => ((await testTcpConnect(item.host, item.port, 1600)) ? item.url : null))
    );
    for (const h of hits) {
      if (h) tcpOpen.push(h);
    }
    if (tcpOpen.length >= 10) break;
  }

  for (const proxyUrl of tcpOpen.slice(0, 10)) {
    const geo = await probeGeoExitInfo(proxyUrl);
    if (!geo.ok || !geo.isSpain) continue;
    try {
      const dispatcher = createDispatcherForProxy(proxyUrl);
      const probeEnergy = await undiciFetch(
        'https://directos.energytv.es/orilinear03/live/linear03/main/main.isml/main-audio_spa=128000-video=1500000.m3u8',
        {
          dispatcher,
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.mediasetinfinity.es/' },
          signal: AbortSignal.timeout(4500),
        }
      );
      const txt = probeEnergy.ok ? await probeEnergy.text() : '';
      const energyOk = probeEnergy.ok && txt.includes('#EXTM3U');
      const applied = await setRuntimeSpainProxyConfig({
        proxyUrl,
        scope: 'auto_spanish',
        enabled: true,
        skipGeoProbe: true,
      });
      if (applied.ok) {
        return {
          connected: true,
          testedCount: validated.length,
          tcpReachableCount: tcpOpen.length,
          proxyUrl: maskProxyUrl(proxyUrl),
          geo,
          energyDirectOk: energyOk,
          config: applied.config,
          message: energyOk
            ? `Nodo España verificado (${geo.ip} · ${geo.city || 'ES'}) con Mediaset/Energy operativo`
            : `Proxy España conectado (${geo.ip} · ${geo.city || 'ES'}) para todos los dispositivos`,
        };
      }
    } catch {
      // try next reachable ES node
    }
  }

  return {
    connected: false,
    testedCount: validated.length,
    tcpReachableCount: tcpOpen.length,
    config: getSpainGatewayPublicConfig(),
    message:
      `Se probaron ${validated.length} nodos públicos ES (${tcpOpen.length} TCP abiertos), pero ninguno reenvió tráfico HTTPS español en vivo. Energy funciona directamente vía DVB España HD o conectando tu propio proxy HTTP/SOCKS5 ES o perfil .ovpn de Urban VPN.`,
  };
}

