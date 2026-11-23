/**
 * @module server/services/urbanVpnService
 * @description Live & static registry + SSRF-safe gateway reachability prober
 * for Urban VPN Android 1.0.97 (com.urbanvpn.android, versionCode 149).
 */

import net from 'node:net';
import tls from 'node:tls';
import { ENV } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';

export interface UrbanVpnGateway {
  id: string;
  countryCode: string;
  locationName: string;
  profileLocation: string;
  hostname: string;
  port: number;
  proto: 'tcp';
  cipher: 'AES-256-CBC';
  weight: number;
  isSpain: boolean;
  isPremium?: boolean;
  ovpnContent?: string;
}

export interface UrbanVpnGatewayProbeResult {
  hostname: string;
  port: number;
  ok: boolean;
  tcpReachable: boolean;
  tlsHandshakeOk: boolean;
  latencyMs: number;
  countryCode?: string;
  locationName?: string;
  error?: string;
}

export interface UrbanVpnAuditSummary {
  packageName: string;
  versionName: string;
  versionCode: number;
  totalGateways: number;
  liveSynced: boolean;
  lastSyncedAt: number | null;
  cdnVersion: string | null;
  spainGateways: UrbanVpnGateway[];
  endpoints: {
    configApi: string;
    cdnBase: string;
    geoLookup: string;
    safeBrowsing: string;
    safeBrowsingFallback: string;
    firebaseProject: string;
  };
  tunnelProtocol: {
    engine: string;
    port: number;
    proto: 'tcp';
    cipher: string;
    authDirective: string;
  };
  limitations: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
  }>;
}

// Tuple format: [countryCode, locationName, profileLocation, weight?]
const RAW_GATEWAYS: ReadonlyArray<[string, string, string, number?]> = [
  ['ES', 'Spain · Nodo ES1', 'p-es1', 1],
  ['ES', 'Spain · Nodo ES3', 'p-es3', 5],
  ['ES', 'Spain · Nodo ES6', 'p-es6', 3],
  ['ES', 'Spain · Nodo ES7', 'p-es7', 10],
  ['ES_premium', 'Spain Premium · ES8', 'p-es8', 10],
  ['ES_premium', 'Spain Premium · ES9', 'p-es9', 10],
  ['ES', 'Spain · Nodo ES10', 'p-es10', 7],
  ['ES', 'Spain · Nodo ES11', 'p-es11', 1],
  ['ES', 'Spain (Madrid legacy)', 'p-es4', 0],
  ['US', 'United States', 'p-us1', 10],
  ['GB', 'United Kingdom', 'p-uk1', 10],
  ['AU', 'Australia', 'p-au1', 5],
  ['RU', 'Russia', 'p-ru1', 5],
  ['PT', 'Portugal', 'p-pt1', 5],
  ['HK', 'Hong Kong', 'p-hk1', 5],
  ['IN', 'India', 'p-in1', 5],
  ['TR', 'Turkey', 'p-tr1', 5],
  ['IT', 'Italy', 'p-it1', 5],
  ['JP', 'Japan', 'p-jp1', 5],
  ['CA', 'Canada (Vancouver)', 'p-ca4', 5],
  ['PL', 'Poland', 'p-pl1', 5],
  ['CN', 'China', 'p-cn1', 5],
  ['NO', 'Norway', 'p-no1', 5],
  ['DK', 'Denmark', 'p-dk1', 5],
  ['GR', 'Greece', 'p-gr1', 5],
  ['ID', 'Indonesia', 'p-id1', 5],
  ['TW', 'Taiwan', 'p-tw1', 5],
  ['CH', 'Switzerland', 'p-ch1', 5],
  ['IE', 'Ireland', 'p-ie1', 5],
  ['ZA', 'South Africa', 'p-za1', 5],
  ['LV', 'Latvia', 'p-lv1', 5],
  ['AR', 'Argentina', 'p-ar1', 5],
  ['TH', 'Thailand', 'p-th1', 5],
  ['MX', 'Mexico', 'p-mx1', 5],
  ['LT', 'Lithuania', 'p-lt1', 5],
  ['AT', 'Austria', 'p-at1', 5],
  ['SK', 'Slovakia', 'p-sk1', 5],
  ['CO', 'Colombia', 'p-co1', 5],
  ['HU', 'Hungary', 'p-hu1', 5],
  ['BY', 'Belarus', 'p-by1', 5],
  ['US', 'Los Angeles (CA)', 'p-us2', 5],
  ['US', 'Chicago (IL)', 'p-us3', 5],
  ['US', 'Atlanta (GA)', 'p-us4', 5],
  ['US', 'Columbus (OH)', 'p-us6', 5],
  ['US', 'Dallas (TX)', 'p-us8', 5],
  ['SI', 'Slovenia', 'p-si1', 5],
  ['US', 'Boston (MA)', 'p-us22', 5],
  ['US', 'Philadelphia (PA)', 'p-us16', 5],
  ['US', 'Minneapolis (MN)', 'p-us25', 5],
  ['US', 'San Francisco (CA)', 'p-us12', 5],
  ['AE', 'United Arab Emirates', 'p-ae1', 5],
  ['US', 'Houston (TX)', 'p-us17', 5],
  ['US', 'Charlotte (NC)', 'p-us18', 5],
  ['US', 'St Louis (MO)', 'p-us27', 5],
  ['US', 'Miami (FL)', 'p-us23', 5],
  ['US', 'Portland (OR)', 'p-us29', 5],
  ['EE', 'Estonia', 'p-ee1', 5],
  ['UA', 'Ukraine', 'p-ua1', 5],
  ['NZ', 'New Zealand', 'p-nz1', 5],
  ['KR', 'Korea Republic', 'p-kr1', 5],
  ['BG', 'Bulgaria', 'p-bg1', 5],
  ['CY', 'Cyprus', 'p-cy1', 5],
  ['PH', 'Philippines', 'p-ph1', 5],
  ['US', 'Seattle (WA)', 'p-us24', 5],
  ['US', 'San Diego (CA)', 'p-us9', 5],
  ['US', 'Las Vegas (NV)', 'p-us30', 5],
  ['US', 'Cary (NC)', 'p-us32', 5],
  ['US', 'New Orleans (LA)', 'p-us33', 5],
  ['PE', 'Peru', 'p-pe1', 5],
  ['US', 'Sacramento (CA)', 'p-us34', 5],
  ['US', 'Denver (CO)', 'p-us35', 5],
  ['CA', 'Canada', 'p-ca2', 5],
  ['US', 'Reston (VA)', 'p-us36', 5],
  ['LU', 'Luxembourg', 'p-lu1', 5],
  ['US', 'Tampa (FL)', 'p-us37', 5],
  ['GB', 'United Kingdom (London)', 'p-uk2', 5],
  ['RU', 'Russia R1', 'p-ru2', 5],
  ['DE', 'Germany (Frankfurt)', 'p-de2', 5],
  ['IN', 'India (Punjab)', 'p-in2', 5],
  ['CA', 'Canada (Calgary)', 'p-ca5', 5],
  ['CA', 'Canada (Toronto)', 'p-ca1', 5],
  ['AU', 'Australia (Brisbane)', 'p-au4', 5],
  ['UY', 'Uruguay', 'p-uy1', 5],
  ['IS', 'Iceland', 'p-is1', 5],
  ['HR', 'Croatia', 'p-hr1', 5],
  ['US', 'Washington DC', 'p-us39', 5],
  ['JO', 'Jordan', 'p-jo1', 5],
  ['MA', 'Morocco', 'p-ma1', 5],
  ['AT', 'Austria R1', 'p-at2', 5],
  ['DK', 'Denmark R1', 'p-dk2', 5],
  ['NL', 'Netherlands R1', 'p-nl2', 5],
  ['BR', 'Brazil', 'p-br1', 5],
  ['US', 'Newark (DE)', 'p-us45', 5],
  ['JP', 'Japan R1', 'p-jp2', 5],
  ['AU', 'Australia (Adelaide)', 'p-au2', 5],
  ['US', 'Matawan (NJ)', 'p-us43', 5],
  ['LT', 'Lithuania R1', 'p-lt2', 5],
  ['DZ', 'Algeria', 'p-dz1', 5],
  ['MN', 'Mongolia', 'p-mn1', 5],
  ['US_premium', 'United States R1', 'p-us7', 5],
  ['MT', 'Malta', 'p-mt1', 5],
  ['FR', 'France (Paris)', 'p-fr3', 5],
  ['IT', 'Italy (Milan)', 'p-it3', 5],
  ['IT', 'Italy (Rome)', 'p-it4', 5],
  ['CA', 'Canada (Montreal) R1', 'p-ca6', 5],
  ['US', 'Dallas (TX) R1', 'p-us47', 5],
  ['US', 'Seattle (WA) R1', 'p-us49', 5],
];

function buildDefaultOvpnTemplate(hostname: string, port = 443): string {
  return [
    'client',
    'dev tun',
    'proto tcp',
    `remote ${hostname} ${port}`,
    'resolv-retry infinite',
    'nobind',
    'persist-key',
    'persist-tun',
    'auth-user-pass pw.txt',
    'cipher AES-256-CBC',
    'verb 3',
    'ca ca.crt',
    'cert urban.crt',
    'key urban.key',
    '',
  ].join('\n');
}

function isSpainGatewayCode(countryCode: string, profileLocation: string): boolean {
  const cc = countryCode.toUpperCase();
  return cc === 'ES' || cc === 'ES_PREMIUM' || /^p-es\d+$/i.test(profileLocation);
}

export const STATIC_URBAN_VPN_GATEWAYS: UrbanVpnGateway[] = RAW_GATEWAYS.map(
  ([countryCode, locationName, profileLocation, weight = 5]) => ({
    id: profileLocation,
    countryCode,
    locationName,
    profileLocation,
    hostname: `${profileLocation}.urban-vpn.com`,
    port: 443,
    proto: 'tcp',
    cipher: 'AES-256-CBC',
    weight,
    isSpain: isSpainGatewayCode(countryCode, profileLocation),
    isPremium: /_premium$/i.test(countryCode),
  })
);

let runtimeGateways: UrbanVpnGateway[] = [...STATIC_URBAN_VPN_GATEWAYS];
let liveSynced = false;
let lastSyncedAt: number | null = null;
let cachedCdnVersion: string | null = null;
let syncInflight: Promise<{ synced: boolean; total: number; spainCount: number; cdnVersion: string | null }> | null =
  null;

function getAllowedGatewayMap(): Map<string, UrbanVpnGateway> {
  return new Map(runtimeGateways.map((g) => [g.hostname.toLowerCase(), g]));
}

const gatewayProbeCache = new LruTtlCache<string, UrbanVpnGatewayProbeResult>(160, 60_000);

interface RawAndroidConfigDto {
  location?: string;
  ovpnContent?: string;
  ctrCode?: string;
  ctrGroup?: string;
  ctrName?: string;
  weight?: number;
  port?: number;
  proto?: string;
}

export function parseAndroidConfigsToGateways(list: RawAndroidConfigDto[]): UrbanVpnGateway[] {
  const out: UrbanVpnGateway[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const weight = Number(row?.weight ?? 0);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const rawLoc = String(row?.location || '').trim().toLowerCase();
    if (!/^[a-z0-9-]+$/i.test(rawLoc)) continue;
    const hostname = `${rawLoc}.urban-vpn.com`;
    if (seen.has(hostname)) continue;
    seen.add(hostname);
    const cc = String(row?.ctrCode || row?.ctrGroup || 'XX').trim();
    const locName = String(row?.ctrName || rawLoc.toUpperCase()).trim();
    const port = Number(row?.port || 443);
    out.push({
      id: rawLoc,
      countryCode: cc,
      locationName: /spain|es/i.test(cc)
        ? `${locName} · ${rawLoc.toUpperCase()}${/_premium$/i.test(cc) ? ' (Premium)' : ''}`
        : locName,
      profileLocation: rawLoc,
      hostname,
      port: Number.isFinite(port) && port > 0 ? port : 443,
      proto: 'tcp',
      cipher: 'AES-256-CBC',
      weight,
      isSpain: isSpainGatewayCode(cc, rawLoc),
      isPremium: /_premium$/i.test(cc),
      ovpnContent: typeof row?.ovpnContent === 'string' ? row.ovpnContent : undefined,
    });
  }
  return out;
}

export async function fetchUrbanVpnCdnVersion(): Promise<string | null> {
  try {
    const res = await fetch('https://cdn-cfg.urban-vpn.com/version.txt', {
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return cachedCdnVersion;
    const txt = (await res.text()).trim();
    const m = txt.match(/Version\s*=\s*([^\r\n]+)/i);
    cachedCdnVersion = (m ? m[1] : txt).trim() || cachedCdnVersion;
    return cachedCdnVersion;
  } catch {
    return cachedCdnVersion;
  }
}

export async function syncLiveUrbanVpnCatalog(force = false): Promise<{
  synced: boolean;
  total: number;
  spainCount: number;
  cdnVersion: string | null;
}> {
  if (!force && lastSyncedAt && Date.now() - lastSyncedAt < 15 * 60 * 1000) {
    return {
      synced: liveSynced,
      total: runtimeGateways.length,
      spainCount: listUrbanVpnGateways({ spainOnly: true }).length,
      cdnVersion: cachedCdnVersion,
    };
  }
  if (syncInflight) return syncInflight;

  syncInflight = (async () => {
    const cdnVer = await fetchUrbanVpnCdnVersion();
    const apiUser = ENV.urbanVpnApiUser;
    const apiPass = ENV.urbanVpnApiPass;

    if (apiUser && apiPass) {
      try {
        const qs = new URLSearchParams({ user: apiUser, pass: apiPass });
        const resp = await fetch(
          `https://stats.urban-vpn.com/api/remote/android/androidConfigs?${qs.toString()}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13)' },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (resp.ok) {
          const json = (await resp.json()) as RawAndroidConfigDto[];
          if (Array.isArray(json)) {
            const parsed = parseAndroidConfigsToGateways(json);
            if (parsed.length > 0) {
              runtimeGateways = parsed;
              liveSynced = true;
              lastSyncedAt = Date.now();
            }
          }
        }
      } catch {
        // retain static verified gateway seed on network failure
      }
    }

    lastSyncedAt = lastSyncedAt || Date.now();
    return {
      synced: liveSynced,
      total: runtimeGateways.length,
      spainCount: listUrbanVpnGateways({ spainOnly: true }).length,
      cdnVersion: cdnVer,
    };
  })().finally(() => {
    syncInflight = null;
  });

  return syncInflight;
}

export function getUrbanVpnOvpnProfile(locationInput: string): {
  ok: true;
  filename: string;
  hostname: string;
  ovpnContent: string;
  isLiveFromApi: boolean;
} | { ok: false; error: string } {
  const cleanLoc = String(locationInput || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(cleanLoc)) {
    return { ok: false, error: 'Identificador de nodo Urban VPN inválido.' };
  }
  const gw = runtimeGateways.find(
    (g) => g.profileLocation.toLowerCase() === cleanLoc || g.id.toLowerCase() === cleanLoc
  );
  if (!gw) {
    return { ok: false, error: 'Nodo Urban VPN no encontrado en el registro verificado.' };
  }
  const content = gw.ovpnContent?.trim() || buildDefaultOvpnTemplate(gw.hostname, gw.port);
  return {
    ok: true,
    filename: `${gw.profileLocation}.ovpn`,
    hostname: gw.hostname,
    ovpnContent: content,
    isLiveFromApi: Boolean(gw.ovpnContent),
  };
}

export function getUrbanVpnAuditSummary(): UrbanVpnAuditSummary {
  const spainActive = listUrbanVpnGateways({ spainOnly: true });
  return {
    packageName: 'com.urbanvpn.android',
    versionName: '1.0.97',
    versionCode: 149,
    totalGateways: runtimeGateways.length,
    liveSynced,
    lastSyncedAt,
    cdnVersion: cachedCdnVersion,
    spainGateways: spainActive,
    endpoints: {
      configApi: 'https://stats.urban-vpn.com/api/remote/android/androidConfigs',
      cdnBase: 'https://cdn-cfg.urban-vpn.com',
      geoLookup: 'https://geo.geosurf.io',
      safeBrowsing: 'https://protection-toolbar.urban-vpn.com/api/rest/v1/secure/urls/checkSafety',
      safeBrowsingFallback: 'https://cs.sclpfybn.com/api/rest/v2/secure/urls/checkSafety',
      firebaseProject: 'urban-vpn',
    },
    tunnelProtocol: {
      engine: 'OpenVPN (libopenvpn.so / dev tun)',
      port: 443,
      proto: 'tcp',
      cipher: 'AES-256-CBC',
      authDirective: 'auth-user-pass pw.txt + ca.crt / urban.crt / urban.key',
    },
    limitations: [
      {
        id: 'missing-tunnel-creds',
        severity: 'critical',
        title: 'Credenciales OpenVPN (pw.txt) y certificados dentro de liburban.so',
        detail:
          'Los perfiles .ovpn requieren pw.txt, ca.crt, urban.crt y urban.key cifrados dentro del binario nativo ARM de Urban VPN. El servidor web no puede autenticar un túnel tun OpenVPN de Urban VPN directamente sin esos certificados ni privilegios TUN.',
      },
      {
        id: 'p2p-exit-eula',
        severity: 'critical',
        title: 'Riesgo de privacidad P2P en el EULA gratuito de Urban VPN',
        detail:
          'El EULA de Urban VPN indica que la versión gratuita puede usar el dispositivo como nodo de salida para tráfico de terceros.',
      },
      {
        id: 'cross-device-tun',
        severity: 'warning',
        title: 'Solución real multi-dispositivo (TV Samsung, móvil y navegador)',
        detail:
          'Activa arriba la Salida España (HTTP/SOCKS5 o Gluetun WireGuard/OpenVPN). Todas las peticiones a Antena 3, laSexta, Atresplayer y RTVE pasarán automáticamente por la IP española.',
      },
      {
        id: 'spain-tdt-ready',
        severity: 'info',
        title: 'Antena 3 y laSexta 1080p HD listas desde cabecera DVB española',
        detail:
          'Los flujos directos 90.163.85.113:8093 (/stream/20 para Antena 3 y /stream/21 para laSexta) transmiten en 1080p HD continuo desde España sin depender de proxy.',
      },
    ],
  };
}

export function listUrbanVpnGateways(opts?: {
  query?: string;
  spainOnly?: boolean;
  includeZeroWeight?: boolean;
}): UrbanVpnGateway[] {
  const q = String(opts?.query || '').trim().toLowerCase();
  return runtimeGateways
    .filter((g) => {
      if (!opts?.includeZeroWeight && g.weight <= 0 && !q) return false;
      if (opts?.spainOnly && !g.isSpain) return false;
      if (!q) return true;
      return (
        g.hostname.toLowerCase().includes(q) ||
        g.locationName.toLowerCase().includes(q) ||
        g.countryCode.toLowerCase().includes(q) ||
        g.profileLocation.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.weight - a.weight || a.profileLocation.localeCompare(b.profileLocation));
}

export async function probeUrbanVpnGateway(rawHost: string): Promise<UrbanVpnGatewayProbeResult> {
  const host = String(rawHost || '').trim().toLowerCase();
  const gateway = getAllowedGatewayMap().get(host);
  if (!gateway) {
    return {
      hostname: host,
      port: 443,
      ok: false,
      tcpReachable: false,
      tlsHandshakeOk: false,
      latencyMs: 0,
      error: 'Host fuera de la lista verificada de pasarelas Urban VPN',
    };
  }

  const cached = gatewayProbeCache.get(host);
  if (cached) return cached;

  const t0 = Date.now();
  const res = await new Promise<UrbanVpnGatewayProbeResult>((resolve) => {
    let settled = false;
    let tcpReachable = false;

    const finish = (
      out: Omit<UrbanVpnGatewayProbeResult, 'hostname' | 'port' | 'countryCode' | 'locationName'>
    ) => {
      if (settled) return;
      settled = true;
      resolve({
        hostname: gateway.hostname,
        port: gateway.port,
        countryCode: gateway.countryCode,
        locationName: gateway.locationName,
        ...out,
      });
    };

    const socket = net.createConnection({ host: gateway.hostname, port: gateway.port, timeout: 2600 });
    socket.on('connect', () => {
      tcpReachable = true;
      const tlsSock = tls.connect(
        {
          socket,
          servername: gateway.hostname,
          rejectUnauthorized: false,
          timeout: 2200,
        },
        () => {
          tlsSock.destroy();
          finish({
            ok: true,
            tcpReachable: true,
            tlsHandshakeOk: true,
            latencyMs: Date.now() - t0,
          });
        }
      );
      tlsSock.on('error', (err) => {
        tlsSock.destroy();
        finish({
          ok: tcpReachable,
          tcpReachable,
          tlsHandshakeOk: false,
          latencyMs: Date.now() - t0,
          error: err.message,
        });
      });
      tlsSock.setTimeout(2200, () => {
        tlsSock.destroy();
        finish({
          ok: tcpReachable,
          tcpReachable,
          tlsHandshakeOk: false,
          latencyMs: Date.now() - t0,
          error: 'Puerto 443 TCP abierto (protocolo OpenVPN)',
        });
      });
    });
    socket.on('timeout', () => {
      socket.destroy();
      finish({
        ok: false,
        tcpReachable: false,
        tlsHandshakeOk: false,
        latencyMs: Date.now() - t0,
        error: 'Timeout TCP/443',
      });
    });
    socket.on('error', (err) => {
      socket.destroy();
      finish({
        ok: false,
        tcpReachable: false,
        tlsHandshakeOk: false,
        latencyMs: Date.now() - t0,
        error: err.message,
      });
    });
  });

  gatewayProbeCache.set(host, res);
  return res;
}

export async function probeAllSpainUrbanGateways(): Promise<UrbanVpnGatewayProbeResult[]> {
  const spainNodes = listUrbanVpnGateways({ spainOnly: true });
  const results = await Promise.all(spainNodes.map((gw) => probeUrbanVpnGateway(gw.hostname)));
  return results.sort((a, b) => {
    if (a.tcpReachable !== b.tcpReachable) return a.tcpReachable ? -1 : 1;
    return a.latencyMs - b.latencyMs;
  });
}
