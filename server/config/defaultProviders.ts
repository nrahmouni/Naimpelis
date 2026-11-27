import {
  buildXtreamPlayerApiUrl as buildSharedPlayerApiUrl,
  getDefaultProvidersForServer,
} from '../../src/config/defaultProviders.ts';

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

export function normalizeXtreamOrigin(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin.replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function buildXtreamPlayerApiUrl(
  serverUrl: string,
  account: XtreamAccountCredential,
  action?: string,
  extraParams?: Record<string, string | number>
): string {
  return buildSharedPlayerApiUrl(normalizeXtreamOrigin(serverUrl), account, action, extraParams);
}

export function buildXtreamMediaUrl(
  serverUrl: string,
  account: XtreamAccountCredential,
  kind: 'live' | 'movie' | 'series',
  streamId: string,
  ext: string
): string {
  const origin = normalizeXtreamOrigin(serverUrl);
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  const s = encodeURIComponent(String(streamId || '').trim());
  const cleanExt = String(ext || (kind === 'live' ? 'm3u8' : 'mp4'))
    .trim()
    .replace(/^\.+/, '');
  return `${origin}/${kind}/${u}/${p}/${s}.${cleanExt}`;
}

export function buildXtreamM3uUrl(
  serverUrl: string,
  account: XtreamAccountCredential
): string {
  const origin = normalizeXtreamOrigin(serverUrl);
  return `${origin}/get.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}&type=m3u_plus&output=ts`;
}

export const providersConfig: XtreamProviderConfig[] = getDefaultProvidersForServer().map((entry) => ({
  id: entry.id,
  name: entry.name,
  serverUrl: normalizeXtreamOrigin(entry.serverUrl),
  autoConnect: true,
  accentColor: '#8B5CF6',
  accounts: entry.accounts.map((a) => ({
    username: a.user,
    password: a.pass,
  })),
}));
