import { getDefaultProvidersForServer } from '../../src/config/defaultProviders.ts';

export interface XtreamAccountCredential {
  username: string;
  password: string;
  label?: string;
}

export interface XtreamProviderDefinition {
  id: string;
  name: string;
  serverUrl: string;
  defaultMediaFocus: 'live' | 'vod' | 'series';
  accounts: XtreamAccountCredential[];
}

export function normalizeXtreamServerInput(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

export function parseXtreamAccountsJson(rawJson: string): XtreamAccountCredential[] {
  const trimmed = String(rawJson || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    const out: XtreamAccountCredential[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const username = String(rec.username ?? rec.user ?? '').trim();
      const password = String(rec.password ?? rec.pass ?? '').trim();
      if (username && password) {
        out.push({
          username,
          password,
          label: typeof rec.label === 'string' ? rec.label : undefined,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function getAllXtreamProviders(): XtreamProviderDefinition[] {
  const defaults = getDefaultProvidersForServer();
  const mapped: XtreamProviderDefinition[] = defaults.map((entry) => ({
    id: entry.id,
    name: entry.name,
    serverUrl: normalizeXtreamServerInput(entry.serverUrl) || entry.serverUrl,
    defaultMediaFocus: entry.defaultMediaFocus,
    accounts: entry.accounts.map((acc) => ({
      username: acc.user,
      password: acc.pass,
      label: acc.label,
    })),
  }));

  const envPrimaryUrl = normalizeXtreamServerInput(process.env.XTREAM_SERVER_URL || '');
  const envAccounts = parseXtreamAccountsJson(process.env.XTREAM_ACCOUNTS_JSON || '');
  if (envPrimaryUrl && envAccounts.length > 0) {
    const idx = mapped.findIndex((p) => p.id === 'primary');
    const override: XtreamProviderDefinition = {
      id: 'primary',
      name: mapped[idx]?.name || 'Shark Pro',
      serverUrl: envPrimaryUrl,
      defaultMediaFocus: 'live',
      accounts: envAccounts,
    };
    if (idx >= 0) mapped[idx] = override;
    else mapped.unshift(override);
  }

  return mapped;
}

export function getXtreamProviderById(providerId: string): XtreamProviderDefinition | undefined {
  const norm = String(providerId || '').trim().toLowerCase();
  return getAllXtreamProviders().find((p) => p.id.toLowerCase() === norm);
}
