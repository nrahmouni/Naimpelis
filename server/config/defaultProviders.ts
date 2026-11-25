/**
 * @module server/config/defaultProviders
 * @description Server-side only Xtream IPTV / VOD / Series provider registry.
 * NEVER import this file from client (`src/`) modules so credentials stay strictly on the server.
 */

export interface XtreamAccountCredential {
  username: string;
  password: string;
}

export interface XtreamProviderConfig {
  id: string;
  name: string;
  serverUrl: string;
  autoConnect: boolean;
  accentColor: string;
  accounts: XtreamAccountCredential[];
}

export const providersConfig: XtreamProviderConfig[] = [
  {
    id: 'vod4k',
    name: 'VOD 4K',
    serverUrl: 'http://vod4k.cc:80',
    autoConnect: true,
    accentColor: '#7C3AED',
    accounts: [
      {
        username: '4413658251491390',
        password: '4413658251491390',
      },
      {
        username: '3178886199166690',
        password: '8242297241',
      },
    ],
  },
  {
    id: '2m2h-alt',
    name: '2M2H Alt',
    serverUrl: 'http://3jrg5v.2m2h.im:80',
    autoConnect: true,
    accentColor: '#38BDF8',
    accounts: [
      {
        username: 'NBA00382',
        password: '9100177277',
      },
    ],
  },
  {
    id: 'adtupac',
    name: 'Adtupac',
    serverUrl: 'http://a.adtupac.top:80',
    autoConnect: true,
    accentColor: '#10B981',
    accounts: [
      {
        username: 'Ricardo-alves@2023@R',
        password: '7X4EuvXdEdYr2C',
      },
    ],
  },
  {
    id: 'ultra-vip',
    name: 'Ultra VIP',
    serverUrl: 'http://ultra-vip.net:8080',
    autoConnect: true,
    accentColor: '#F59E0B',
    accounts: [
      {
        username: 'GzheRdD6J',
        password: 'c78sXxk15',
      },
    ],
  },
  {
    id: 'sult-vo',
    name: 'Sult-Vo',
    serverUrl: 'http://sult-vo.xyz:80',
    autoConnect: true,
    accentColor: '#F43F5E',
    accounts: [
      {
        username: '4426530274896970',
        password: '4426530274896970',
      },
      {
        username: '2225190801115579',
        password: '2225190801115579',
      },
    ],
  },
];

export const defaultProviders = providersConfig;

export function normalizeXtreamOrigin(rawServerUrl: string): string {
  const clean = String(rawServerUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  const withScheme = /^https?:\/\//i.test(clean) ? clean : `http://${clean}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return withScheme;
  }
}

export function buildXtreamPlayerApiUrl(
  serverUrl: string,
  account: XtreamAccountCredential,
  action?: string,
  extraParams?: Record<string, string | number>
): string {
  const origin = normalizeXtreamOrigin(serverUrl);
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  const parts = [`username=${u}`, `password=${p}`];
  if (action) {
    parts.push(`action=${encodeURIComponent(action)}`);
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
    }
  }
  return `${origin}/player_api.php?${parts.join('&')}`;
}

export function buildXtreamM3uUrl(
  serverUrl: string,
  account: XtreamAccountCredential
): string {
  const origin = normalizeXtreamOrigin(serverUrl);
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  return `${origin}/get.php?username=${u}&password=${p}&type=m3u_plus&output=ts`;
}

export function buildXtreamMediaUrl(
  serverUrl: string,
  account: XtreamAccountCredential,
  kind: 'live' | 'movie' | 'series',
  streamId: string,
  extension: string
): string {
  const origin = normalizeXtreamOrigin(serverUrl);
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  const id = encodeURIComponent(String(streamId || '').trim());
  const ext = String(extension || (kind === 'live' ? 'm3u8' : 'mp4'))
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase() || (kind === 'live' ? 'm3u8' : 'mp4');
  return `${origin}/${kind}/${u}/${p}/${id}.${ext}`;
}
