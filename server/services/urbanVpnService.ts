/**
 * @module server/services/urbanVpnService
 * @description Static analysis registry & SSRF-safe gateway reachability prober
 * for Urban VPN Android 1.0.97 (com.urbanvpn.android, versionCode 149).
 */

import net from 'node:net';
import tls from 'node:tls';
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
  isSpain: boolean;
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

const RAW_GATEWAYS: ReadonlyArray<[string, string, string]> = [
  ['ES', 'Spain', 'p-es1'],
  ['ES', 'Spain (Madrid)', 'p-es4'],
  ['US', 'United States', 'p-us1'],
  ['GB', 'United Kingdom', 'p-uk1'],
  ['AU', 'Australia', 'p-au1'],
  ['RU', 'Russia', 'p-ru1'],
  ['PT', 'Portugal', 'p-pt1'],
  ['HK', 'Hong Kong', 'p-hk1'],
  ['IN', 'India', 'p-in1'],
  ['TR', 'Turkey', 'p-tr1'],
  ['IT', 'Italy', 'p-it1'],
  ['JP', 'Japan', 'p-jp1'],
  ['CA', 'Canada (Vancouver)', 'p-ca4'],
  ['PL', 'Poland', 'p-pl1'],
  ['CN', 'China', 'p-cn1'],
  ['NO', 'Norway', 'p-no1'],
  ['DK', 'Denmark', 'p-dk1'],
  ['GR', 'Greece', 'p-gr1'],
  ['ID', 'Indonesia', 'p-id1'],
  ['TW', 'Taiwan', 'p-tw1'],
  ['CH', 'Switzerland', 'p-ch1'],
  ['IE', 'Ireland', 'p-ie1'],
  ['ZA', 'South Africa', 'p-za1'],
  ['LV', 'Latvia', 'p-lv1'],
  ['AR', 'Argentina', 'p-ar1'],
  ['TH', 'Thailand', 'p-th1'],
  ['MX', 'Mexico', 'p-mx1'],
  ['LT', 'Lithuania', 'p-lt1'],
  ['AT', 'Austria', 'p-at1'],
  ['SK', 'Slovakia', 'p-sk1'],
  ['CO', 'Colombia', 'p-co1'],
  ['HU', 'Hungary', 'p-hu1'],
  ['BY', 'Belarus', 'p-by1'],
  ['US', 'Los Angeles (CA)', 'p-us2'],
  ['US', 'Chicago (IL)', 'p-us3'],
  ['US', 'Atlanta (GA)', 'p-us4'],
  ['US', 'Columbus (OH)', 'p-us6'],
  ['US', 'Dallas (TX)', 'p-us8'],
  ['SI', 'Slovenia', 'p-si1'],
  ['US', 'Boston (MA)', 'p-us22'],
  ['US', 'Philadelphia (PA)', 'p-us16'],
  ['US', 'Minneapolis (MN)', 'p-us25'],
  ['US', 'San Francisco (CA)', 'p-us12'],
  ['AE', 'United Arab Emirates', 'p-ae1'],
  ['US', 'Houston (TX)', 'p-us17'],
  ['US', 'Charlotte (NC)', 'p-us18'],
  ['US', 'St Louis (MO)', 'p-us27'],
  ['US', 'Miami (FL)', 'p-us23'],
  ['US', 'Portland (OR)', 'p-us29'],
  ['EE', 'Estonia', 'p-ee1'],
  ['UA', 'Ukraine', 'p-ua1'],
  ['NZ', 'New Zealand', 'p-nz1'],
  ['KR', 'Korea Republic', 'p-kr1'],
  ['BG', 'Bulgaria', 'p-bg1'],
  ['CY', 'Cyprus', 'p-cy1'],
  ['PH', 'Philippines', 'p-ph1'],
  ['US', 'Seattle (WA)', 'p-us24'],
  ['US', 'San Diego (CA)', 'p-us9'],
  ['US', 'Las Vegas (NV)', 'p-us30'],
  ['US', 'Cary (NC)', 'p-us32'],
  ['US', 'New Orleans (LA)', 'p-us33'],
  ['PE', 'Peru', 'p-pe1'],
  ['US', 'Sacramento (CA)', 'p-us34'],
  ['US', 'Denver (CO)', 'p-us35'],
  ['CA', 'Canada', 'p-ca2'],
  ['US', 'Reston (VA)', 'p-us36'],
  ['LU', 'Luxembourg', 'p-lu1'],
  ['US', 'Tampa (FL)', 'p-us37'],
  ['GB', 'United Kingdom (London)', 'p-uk2'],
  ['RU', 'Russia R1', 'p-ru2'],
  ['DE', 'Germany (Frankfurt)', 'p-de2'],
  ['IN', 'India (Punjab)', 'p-in2'],
  ['CA', 'Canada (Calgary)', 'p-ca5'],
  ['CA', 'Canada (Toronto)', 'p-ca1'],
  ['AU', 'Australia (Brisbane)', 'p-au4'],
  ['UY', 'Uruguay', 'p-uy1'],
  ['IS', 'Iceland', 'p-is1'],
  ['HR', 'Croatia', 'p-hr1'],
  ['US', 'Washington DC', 'p-us39'],
  ['JO', 'Jordan', 'p-jo1'],
  ['MA', 'Morocco', 'p-ma1'],
  ['AT', 'Austria R1', 'p-at2'],
  ['DK', 'Denmark R1', 'p-dk2'],
  ['NL', 'Netherlands R1', 'p-nl2'],
  ['BR', 'Brazil', 'p-br1'],
  ['US', 'Newark (DE)', 'p-us45'],
  ['JP', 'Japan R1', 'p-jp2'],
  ['AU', 'Australia (Adelaide)', 'p-au2'],
  ['US', 'Matawan (NJ)', 'p-us43'],
  ['LT', 'Lithuania R1', 'p-lt2'],
  ['DZ', 'Algeria', 'p-dz1'],
  ['MN', 'Mongolia', 'p-mn1'],
  ['US_premium', 'United States R1', 'p-us7'],
  ['MT', 'Malta', 'p-mt1'],
  ['FR', 'France (Paris)', 'p-fr3'],
  ['IT', 'Italy (Milan)', 'p-it3'],
  ['IT', 'Italy (Rome)', 'p-it4'],
  ['CA', 'Canada (Montreal) R1', 'p-ca6'],
  ['US', 'Dallas (TX) R1', 'p-us47'],
  ['US', 'Seattle (WA) R1', 'p-us49'],
];

export const URBAN_VPN_GATEWAYS: UrbanVpnGateway[] = RAW_GATEWAYS.map(
  ([countryCode, locationName, profileLocation]) => ({
    id: profileLocation,
    countryCode,
    locationName,
    profileLocation,
    hostname: `${profileLocation}.urban-vpn.com`,
    port: 443,
    proto: 'tcp',
    cipher: 'AES-256-CBC',
    isSpain: countryCode === 'ES',
  })
);

const ALLOWED_GATEWAY_HOSTS = new Map<string, UrbanVpnGateway>(
  URBAN_VPN_GATEWAYS.map((g) => [g.hostname.toLowerCase(), g])
);

const gatewayProbeCache = new LruTtlCache<string, UrbanVpnGatewayProbeResult>(120, 60_000);

export function getUrbanVpnAuditSummary(): UrbanVpnAuditSummary {
  return {
    packageName: 'com.urbanvpn.android',
    versionName: '1.0.97',
    versionCode: 149,
    totalGateways: URBAN_VPN_GATEWAYS.length,
    spainGateways: URBAN_VPN_GATEWAYS.filter((g) => g.isSpain),
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
        title: 'Credenciales OpenVPN (pw.txt) y certificados no incluidos en el APK',
        detail:
          'Los 100 perfiles apuntan a pw.txt, ca.crt, urban.crt y urban.key, que no están en el paquete. El par urbanvpn@urban-vpn.com solo consulta la lista de servidores en stats.urban-vpn.com; las claves de config2.dat residen cifradas en código nativo (liburban.so).',
      },
      {
        id: 'p2p-exit-eula',
        severity: 'critical',
        title: 'Riesgo de privacidad P2P en el EULA gratuito de Urban VPN',
        detail:
          'El EULA de Urban VPN advierte que la versión gratuita convierte el dispositivo del usuario en nodo de salida para tráfico de terceros y puede recopilar URLs y capturas de pantalla.',
      },
      {
        id: 'cross-device-tun',
        severity: 'warning',
        title: 'Navegadores, iOS y Samsung Tizen TV no admiten interfaces OpenVPN dev tun',
        detail:
          'Una app web o Tizen (.wgt) no puede levantar un túnel OpenVPN en JavaScript. La solución real multi-dispositivo es enrutar desde el servidor RiffanTV (Proxy HTTP/SOCKS5 o contenedor VPN en España), cubriendo TV, móvil y PC a la vez.',
      },
      {
        id: 'spain-tdt-ready',
        severity: 'info',
        title: 'Antena 3 y laSexta 1080p HD ya salen desde cabecera española directa',
        detail:
          'La señal directa DVB (90.163.85.113) opera en 1080p HD desde España sin exigir VPN en el televisor. Añadir una Salida España HTTP/SOCKS5 en el servidor desbloquea además Atresplayer oficial y consultas geo-restringidas para todos tus dispositivos.',
      },
    ],
  };
}

export function listUrbanVpnGateways(opts?: { query?: string; spainOnly?: boolean }): UrbanVpnGateway[] {
  const q = String(opts?.query || '').trim().toLowerCase();
  return URBAN_VPN_GATEWAYS.filter((g) => {
    if (opts?.spainOnly && !g.isSpain) return false;
    if (!q) return true;
    return (
      g.hostname.toLowerCase().includes(q) ||
      g.locationName.toLowerCase().includes(q) ||
      g.countryCode.toLowerCase().includes(q) ||
      g.profileLocation.toLowerCase().includes(q)
    );
  });
}

export async function probeUrbanVpnGateway(rawHost: string): Promise<UrbanVpnGatewayProbeResult> {
  const host = String(rawHost || '').trim().toLowerCase();
  const gateway = ALLOWED_GATEWAY_HOSTS.get(host);
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

    const finish = (out: Omit<UrbanVpnGatewayProbeResult, 'hostname' | 'port' | 'countryCode' | 'locationName'>) => {
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
        // OpenVPN TCP servers often speak OpenVPN TLS-crypt / raw protocol on 443 instead of standard HTTPS
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
