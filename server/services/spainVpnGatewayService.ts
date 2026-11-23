/**
 * @module server/services/spainVpnGatewayService
 * @description Cross-device server-side Spanish VPN / Egress Proxy gateway.
 * Routes Spanish broadcasters (Atresplayer, Mediaset, RTVE, TDT) through a
 * configured HTTP/HTTPS/SOCKS5 Spanish exit node so Web, Mobile, PWA, Android,
 * Google TV, and Samsung Tizen TV all appear inside Spain automatically.
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
    note: string;
  };
  atresplayerApi: {
    reachable: boolean;
    status: number;
  };
  urbanVpnAudit: ReturnType<typeof getUrbanVpnAuditSummary>;
  spainUrbanGateways: ReturnType<typeof listUrbanVpnGateways>;
}

const SPANISH_GEO_ROUTING_PATTERNS: RegExp[] = [
  /(?:^|\.)atresplayer\.com$/i,
  /(?:^|\.)atresmedia\.com$/i,
  /(?:^|\.)atres\.com$/i,
  /(?:^|\.)mediaset\.es$/i,
  /(?:^|\.)mitele\.es$/i,
  /(?:^|\.)telecinco\.es$/i,
  /(?:^|\.)cuatro\.com$/i,
  /(?:^|\.)rtve\.es$/i,
  /(?:^|\.)ccma\.cat$/i,
  /(?:^|\.)3cat\.cat$/i,
  /(?:^|\.)eitb\.eus$/i,
  /(?:^|\.)telemadrid\.es$/i,
  /(?:^|\.)canalsur\.es$/i,
  /(?:^|\.)tdtchannels\.com$/i,
  /(?:^|\.)sharkpro\.ink$/i,
  /^90\.163\.85\.113$/i,
  /^103\.163\.132\.49$/i,
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
        message?: string;
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
    // fallback below to Urban VPN's own geo.geosurf.io endpoint
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
    state.proxyUrl = validation.normalizedUrl;
    state.source = 'runtime';
  }

  state.scope = nextScope;
  state.enabled = input.enabled !== undefined ? Boolean(input.enabled) && Boolean(state.proxyUrl) : Boolean(state.proxyUrl) && nextScope !== 'off';
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
  state.proxyUrl = '';
  state.enabled = false;
  state.source = 'none';
  state.scope = 'auto_spanish';
  state.updatedAt = Date.now();
  geoCache.clear();
  return getSpainGatewayPublicConfig();
}

async function checkDvbHeadendHead(url: string): Promise<boolean> {
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    });
    await res.body?.cancel?.().catch(() => {});
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSpainGatewayOverview(): Promise<SpainGatewayOverview> {
  const config = getSpainGatewayPublicConfig();
  const atresDispatcher = getSpainProxyDispatcherForTarget(
    'https://api.atresplayer.com/client/v1/row/live'
  );
  const [directGeo, tunneledGeo, a3Ok, sextaOk, atresResp] = await Promise.all([
    probeGeoExitInfo(undefined),
    config.enabled && state.proxyUrl ? probeGeoExitInfo(state.proxyUrl) : Promise.resolve(null),
    checkDvbHeadendHead('http://90.163.85.113:8093/stream/20/index.m3u8'),
    checkDvbHeadendHead('http://90.163.85.113:8093/stream/21/index.m3u8'),
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
      antena3Ready: a3Ok,
      lasextaReady: sextaOk,
      note: 'Cabecera DVB España 1080p HD directa (Antena 3 / laSexta)',
    },
    atresplayerApi: atresResp,
    urbanVpnAudit: getUrbanVpnAuditSummary(),
    spainUrbanGateways: listUrbanVpnGateways({ spainOnly: true }),
  };
}
