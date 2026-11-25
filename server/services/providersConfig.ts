/**
 * @module server/services/providersConfig
 * @description Centralized Xtream Codes provider registry reading credentials exclusively
 * from server-side process.env (including VITE_-prefixed env vars) and optional
 * Base64-encoded session vault payloads synced in server RAM (never writing or hardcoding
 * real credentials to source files or disk).
 */
import crypto from 'node:crypto';
import { logger } from '../utils/logger.ts';
import {
  getDefaultProvidersForServer,
  type DefaultProviderEntry,
} from '../../src/config/defaultProviders.ts';
import { providersConfig as serverDefaultProvidersConfig } from '../config/defaultProviders.ts';

export interface XtreamAccountCredential {
  username: string;
  password: string;
  label?: string;
}

export interface ExtraProviderSlotConfig {
  id: string;
  name: string;
  serverUrl: string;
  user: string;
  pass: string;
  defaultMediaFocus?: 'live' | 'vod' | 'series';
}

export interface XtreamProviderDefinition {
  id: string;
  name: string;
  serverUrl: string;
  accounts: XtreamAccountCredential[];
  defaultMediaFocus: 'live' | 'vod' | 'series';
}

export const DEFAULT_EXTRA_XTREAM_PROVIDERS: ExtraProviderSlotConfig[] = [
  {
    id: '24tv',
    name: '24TV',
    serverUrl: 'http://a1.24tv.tn:2052',
    user: '',
    pass: '',
    defaultMediaFocus: 'live',
  },
  {
    id: '2m2h',
    name: '2M2H',
    serverUrl: 'http://2kzbmq.2m2h.im:80',
    user: '',
    pass: '',
    defaultMediaFocus: 'live',
  },
];

let runtimeUserVaultEnv: Record<string, string> = {};
let runtimeViteVaultEnv: Record<string, string> = {};
let runtimeExtraCustomProviders: XtreamProviderDefinition[] = [];

function getDefaultProviderByIdFromRegistry(id: string): DefaultProviderEntry | undefined {
  return getDefaultProvidersForServer().find((entry) => entry.id === id);
}

function toAccountCredentials(entry?: DefaultProviderEntry): XtreamAccountCredential[] {
  if (!entry) return [];
  return entry.accounts
    .filter((a) => a.user.trim() && a.pass.trim())
    .map((a) => ({ username: a.user, password: a.pass, label: a.label }));
}

const ENV_KEY_LIST = [
  'XTREAM_SERVER_URL',
  'XTREAM_ACCOUNTS_JSON',
  'VOD4K_SERVER_URL',
  'VOD4K_USERNAME',
  'VOD4K_PASSWORD',
  'EXTRA_PROVIDERS_JSON',
  'DANA4K_SERVER_URL',
  'DANA4K_ACCOUNTS_JSON',
  'DANA4K_USERNAME',
  'DANA4K_PASSWORD',
  'ACTIVE_CDNS_SERVER_URL',
  'ACTIVE_CDNS_USERNAME',
  'ACTIVE_CDNS_PASSWORD',
  'OCTOPUS_SERVER_URL',
  'OCTOPUS_USERNAME',
  'OCTOPUS_PASSWORD',
] as const;

function readEnvOrVault(key: string): string {
  const direct = process.env[key];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const userVal = runtimeUserVaultEnv[key];
  if (typeof userVal === 'string' && userVal.length > 0) return userVal;
  const viteServerVal = process.env[`VITE_${key}`];
  if (typeof viteServerVal === 'string' && viteServerVal.length > 0) return viteServerVal;
  const viteClientVal = runtimeViteVaultEnv[key];
  if (typeof viteClientVal === 'string' && viteClientVal.length > 0) return viteClientVal;
  return '';
}

function decodeUtf8Base64(b64: string): string {
  const clean = String(b64 || '').trim();
  if (!clean) return '';
  return Buffer.from(clean, 'base64').toString('utf8');
}

function serializeIfStructured(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) || (val && typeof val === 'object')) {
    return JSON.stringify(val);
  }
  return '';
}

function extractVaultAccounts(obj: Record<string, unknown>): XtreamAccountCredential[] {
  const out: XtreamAccountCredential[] = [];
  if (Array.isArray(obj.accounts)) {
    for (const item of obj.accounts) {
      if (!item || typeof item !== 'object') continue;
      const a = item as Record<string, unknown>;
      const u = String(a.username ?? a.user ?? '');
      const p = String(a.password ?? a.pass ?? '');
      if (u.trim() && p.trim()) {
        out.push({ username: u, password: p, label: typeof a.label === 'string' ? a.label : undefined });
      }
    }
  }
  const singleUser = String(obj.username ?? obj.user ?? '');
  const singlePass = String(obj.password ?? obj.pass ?? '');
  if (singleUser.trim() && singlePass.trim()) {
    out.push({ username: singleUser, password: singlePass });
  }
  return out;
}

function parseVaultObjectToEnvMap(rawJson: string): {
  envMap: Record<string, string>;
  customProviders: XtreamProviderDefinition[];
} {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid vault JSON');
  }

  const envMap: Record<string, string> = {};
  const customProviders: XtreamProviderDefinition[] = [];

  if (Array.isArray(parsed)) {
    envMap.EXTRA_PROVIDERS_JSON = JSON.stringify(parsed);
    return { envMap, customProviders };
  }

  const root = parsed as Record<string, unknown>;

  // 1. Direct env-style keys (with or without VITE_ prefix)
  for (const key of ENV_KEY_LIST) {
    const rawVal = root[key] ?? root[`VITE_${key}`];
    if (rawVal === undefined || rawVal === null) continue;
    const strVal =
      key.endsWith('_JSON') ? serializeIfStructured(rawVal) : String(rawVal);
    if (strVal.length > 0) {
      envMap[key] = strVal;
    }
  }

  // 2. Named provider objects or `providers` array/map
  const providerList: Array<[string, Record<string, unknown>]> = [];
  if (Array.isArray(root.providers)) {
    for (const item of root.providers) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const id = String(rec.id ?? rec.name ?? '').trim().toLowerCase();
        if (id) providerList.push([id, rec]);
      }
    }
  } else if (root.providers && typeof root.providers === 'object') {
    for (const [k, v] of Object.entries(root.providers as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        providerList.push([k.trim().toLowerCase(), v as Record<string, unknown>]);
      }
    }
  }

  for (const slotKey of ['primary', 'sharkpro', 'vod4k', '24tv', '2m2h', 'dana4k', 'activecdns', 'octopus']) {
    const candidate = root[slotKey];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      providerList.push([slotKey, candidate as Record<string, unknown>]);
    }
  }

  const extraArray: Array<Record<string, unknown>> = [];

  for (const [rawKey, rec] of providerList) {
    const cleanId = rawKey.replace(/[^a-z0-9_-]+/g, '');
    const serverUrl = String(rec.serverUrl ?? rec.url ?? rec.server ?? '');
    const accounts = extractVaultAccounts(rec);

    if (cleanId === 'primary' || cleanId === 'sharkpro' || cleanId === 'principal') {
      if (serverUrl) envMap.XTREAM_SERVER_URL = serverUrl;
      if (accounts.length > 0) envMap.XTREAM_ACCOUNTS_JSON = JSON.stringify(accounts);
    } else if (cleanId === 'vod4k') {
      if (serverUrl) envMap.VOD4K_SERVER_URL = serverUrl;
      if (accounts[0]) {
        envMap.VOD4K_USERNAME = accounts[0].username;
        envMap.VOD4K_PASSWORD = accounts[0].password;
      }
    } else if (cleanId === 'dana4k') {
      if (serverUrl) envMap.DANA4K_SERVER_URL = serverUrl;
      if (accounts.length > 0) envMap.DANA4K_ACCOUNTS_JSON = JSON.stringify(accounts);
    } else if (cleanId === 'activecdns') {
      if (serverUrl) envMap.ACTIVE_CDNS_SERVER_URL = serverUrl;
      if (accounts[0]) {
        envMap.ACTIVE_CDNS_USERNAME = accounts[0].username;
        envMap.ACTIVE_CDNS_PASSWORD = accounts[0].password;
      }
    } else if (cleanId === 'octopus' || cleanId === 'octopustv') {
      if (serverUrl) envMap.OCTOPUS_SERVER_URL = serverUrl;
      if (accounts[0]) {
        envMap.OCTOPUS_USERNAME = accounts[0].username;
        envMap.OCTOPUS_PASSWORD = accounts[0].password;
      }
    } else if (cleanId === '24tv' || cleanId === '2m2h') {
      extraArray.push({
        id: cleanId,
        name: String(rec.name || cleanId.toUpperCase()),
        serverUrl,
        accounts,
      });
    } else if (cleanId && serverUrl && accounts.length > 0) {
      customProviders.push({
        id: cleanId,
        name: String(rec.name || cleanId.toUpperCase()),
        serverUrl: normalizeXtreamServerInput(serverUrl),
        accounts,
        defaultMediaFocus:
          rec.defaultMediaFocus === 'vod' || rec.defaultMediaFocus === 'series'
            ? rec.defaultMediaFocus
            : 'live',
      });
    }
  }

  if (extraArray.length > 0 && !envMap.EXTRA_PROVIDERS_JSON) {
    envMap.EXTRA_PROVIDERS_JSON = JSON.stringify(extraArray);
  }

  return { envMap, customProviders };
}

export function getRuntimeVaultFingerprint(): string {
  const payload = JSON.stringify({
    u: runtimeUserVaultEnv,
    v: runtimeViteVaultEnv,
    c: runtimeExtraCustomProviders.map((p) => [p.id, p.serverUrl, p.accounts.length]),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function clearRuntimeVaultProviders(): void {
  runtimeUserVaultEnv = {};
  runtimeViteVaultEnv = {};
  runtimeExtraCustomProviders = [];
}

export function applyRuntimeVaultBase64(params: {
  vaultB64?: string;
  viteEnvB64?: string;
}): { ok: boolean; changed: boolean; error?: string } {
  const prevFp = getRuntimeVaultFingerprint();
  let nextUserEnv: Record<string, string> = {};
  let nextViteEnv: Record<string, string> = {};
  let nextCustom: XtreamProviderDefinition[] = [];

  try {
    if (params.vaultB64 && params.vaultB64.trim()) {
      const decoded = decodeUtf8Base64(params.vaultB64);
      const parsed = parseVaultObjectToEnvMap(decoded);
      nextUserEnv = parsed.envMap;
      nextCustom = parsed.customProviders;
    }
    if (params.viteEnvB64 && params.viteEnvB64.trim()) {
      const decodedVite = decodeUtf8Base64(params.viteEnvB64);
      const parsedVite = parseVaultObjectToEnvMap(decodedVite);
      nextViteEnv = parsedVite.envMap;
      if (nextCustom.length === 0) {
        nextCustom = parsedVite.customProviders;
      }
    }
  } catch {
    return {
      ok: false,
      changed: false,
      error: 'El bloque JSON de configuración privada no es válido.',
    };
  }

  if (params.vaultB64 !== undefined) {
    runtimeUserVaultEnv = nextUserEnv;
    runtimeExtraCustomProviders = nextCustom;
  }
  if (params.viteEnvB64 !== undefined) {
    runtimeViteVaultEnv = nextViteEnv;
  }

  const nextFp = getRuntimeVaultFingerprint();
  return {
    ok: true,
    changed: prevFp !== nextFp,
  };
}

export function normalizeXtreamServerInput(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function parseXtreamAccountsJson(rawJson: string): XtreamAccountCredential[] {
  const raw = String(rawJson || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const accounts: XtreamAccountCredential[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const username = String(obj.username ?? obj.user ?? '');
      const password = String(obj.password ?? obj.pass ?? '');
      const label = typeof obj.label === 'string' ? obj.label.trim() : undefined;
      if (username.trim() && password.trim()) {
        accounts.push({ username, password, label });
      }
    }
    return accounts;
  } catch {
    logger.warn({ event: 'xtream_accounts_json_invalid' }, 'Xtream accounts JSON is invalid');
    return [];
  }
}

export function getVod4kConfig(): XtreamProviderDefinition {
  const def = getDefaultProviderByIdFromRegistry('vod4k');
  const srvDef = serverDefaultProvidersConfig.find((p) => p.id === 'vod4k');
  const serverUrl = normalizeXtreamServerInput(
    readEnvOrVault('VOD4K_SERVER_URL') || srvDef?.serverUrl || def?.serverUrl || 'http://vod4k.cc:80'
  );
  const username = readEnvOrVault('VOD4K_USERNAME');
  const password = readEnvOrVault('VOD4K_PASSWORD');
  const explicitAccounts: XtreamAccountCredential[] =
    username.trim() && password.trim() ? [{ username, password, label: 'VOD 4K' }] : [];

  const mergedDefaultAccounts: XtreamAccountCredential[] = [];
  const seenUserPass = new Set<string>();
  const pushUnique = (u: string, p: string, label?: string) => {
    const cleanU = u.trim();
    const cleanP = p.trim();
    if (!cleanU || !cleanP) return;
    const key = `${cleanU}:${cleanP}`;
    if (seenUserPass.has(key)) return;
    seenUserPass.add(key);
    mergedDefaultAccounts.push({ username: u, password: p, label });
  };
  for (const a of srvDef?.accounts || []) {
    pushUnique(a.username, a.password, 'VOD 4K');
  }
  for (const a of def?.accounts || []) {
    pushUnique(a.user, a.pass, a.label);
  }

  return {
    id: 'vod4k',
    name: 'VOD 4K',
    serverUrl,
    accounts: explicitAccounts.length > 0 ? explicitAccounts : mergedDefaultAccounts,
    defaultMediaFocus: 'vod',
  };
}

export function getExtraXtreamProviders(
  rawExtraJson = readEnvOrVault('EXTRA_PROVIDERS_JSON')
): XtreamProviderDefinition[] {
  const mergedSlots = new Map<string, XtreamProviderDefinition>();

  for (const base of DEFAULT_EXTRA_XTREAM_PROVIDERS) {
    const def = getDefaultProviderByIdFromRegistry(base.id);
    const baseAccounts =
      base.user.trim() && base.pass.trim()
        ? [{ username: base.user, password: base.pass, label: base.name }]
        : toAccountCredentials(def);
    mergedSlots.set(base.id, {
      id: base.id,
      name: base.name,
      serverUrl: normalizeXtreamServerInput(def?.serverUrl || base.serverUrl),
      accounts: baseAccounts,
      defaultMediaFocus: base.defaultMediaFocus || 'live',
    });
  }

  const raw = String(rawExtraJson || '').trim();
  if (!raw) {
    return Array.from(mergedSlots.values());
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return Array.from(mergedSlots.values());

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const rawName = String(obj.name ?? obj.label ?? obj.id ?? '').trim();
      const rawId = String(obj.id ?? rawName)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '');
      if (!rawId) continue;

      const existing = mergedSlots.get(rawId);
      const serverUrl = normalizeXtreamServerInput(
        String(obj.serverUrl ?? obj.url ?? existing?.serverUrl ?? '')
      );
      const name = rawName || existing?.name || rawId.toUpperCase();

      const explicitAccounts: XtreamAccountCredential[] = [];
      if (Array.isArray(obj.accounts)) {
        for (const acc of obj.accounts) {
          if (!acc || typeof acc !== 'object') continue;
          const a = acc as Record<string, unknown>;
          const u = String(a.username ?? a.user ?? '');
          const p = String(a.password ?? a.pass ?? '');
          if (u.trim() && p.trim()) {
            explicitAccounts.push({ username: u, password: p });
          }
        }
      }
      const singleUser = String(obj.username ?? obj.user ?? '');
      const singlePass = String(obj.password ?? obj.pass ?? '');
      if (singleUser.trim() && singlePass.trim()) {
        explicitAccounts.push({ username: singleUser, password: singlePass });
      }

      mergedSlots.set(rawId, {
        id: rawId,
        name,
        serverUrl,
        accounts: explicitAccounts.length > 0 ? explicitAccounts : existing?.accounts || [],
        defaultMediaFocus:
          obj.defaultMediaFocus === 'vod' || obj.defaultMediaFocus === 'series'
            ? obj.defaultMediaFocus
            : existing?.defaultMediaFocus || 'live',
      });
    }
  } catch {
    logger.warn({ event: 'extra_providers_json_invalid' }, 'EXTRA_PROVIDERS_JSON is invalid JSON');
  }

  return Array.from(mergedSlots.values());
}

export const DANA_ACTIVE_DEFAULTS = {
  dana4k: {
    id: 'dana4k',
    name: 'Dana 4K Pro',
    defaultServerUrl: 'http://dana4kpro.com:8080',
  },
  activecdns: {
    id: 'activecdns',
    name: 'Active CDNS',
    defaultServerUrl: 'http://active.cdns.today:80',
  },
} as const;

export function getDanaActiveConfigs(): XtreamProviderDefinition[] {
  const danaDef = getDefaultProviderByIdFromRegistry('dana4k');
  const danaServerUrl = normalizeXtreamServerInput(
    readEnvOrVault('DANA4K_SERVER_URL') ||
      danaDef?.serverUrl ||
      DANA_ACTIVE_DEFAULTS.dana4k.defaultServerUrl
  );
  const danaJsonAccounts = parseXtreamAccountsJson(readEnvOrVault('DANA4K_ACCOUNTS_JSON'));
  const danaUser = readEnvOrVault('DANA4K_USERNAME');
  const danaPass = readEnvOrVault('DANA4K_PASSWORD');
  const danaAccounts: XtreamAccountCredential[] =
    danaJsonAccounts.length > 0
      ? danaJsonAccounts
      : danaUser.trim() && danaPass.trim()
        ? [{ username: danaUser, password: danaPass, label: 'Dana 4K Pro' }]
        : toAccountCredentials(danaDef);

  const activeDef = getDefaultProviderByIdFromRegistry('activecdns');
  const activeServerUrl = normalizeXtreamServerInput(
    readEnvOrVault('ACTIVE_CDNS_SERVER_URL') ||
      activeDef?.serverUrl ||
      DANA_ACTIVE_DEFAULTS.activecdns.defaultServerUrl
  );
  const activeUser = readEnvOrVault('ACTIVE_CDNS_USERNAME');
  const activePass = readEnvOrVault('ACTIVE_CDNS_PASSWORD');
  const activeAccounts: XtreamAccountCredential[] =
    activeUser.trim() && activePass.trim()
      ? [{ username: activeUser, password: activePass, label: 'Active CDNS' }]
      : toAccountCredentials(activeDef);

  return [
    {
      id: DANA_ACTIVE_DEFAULTS.dana4k.id,
      name: DANA_ACTIVE_DEFAULTS.dana4k.name,
      serverUrl: danaServerUrl,
      accounts: danaAccounts,
      defaultMediaFocus: 'live',
    },
    {
      id: DANA_ACTIVE_DEFAULTS.activecdns.id,
      name: DANA_ACTIVE_DEFAULTS.activecdns.name,
      serverUrl: activeServerUrl,
      accounts: activeAccounts,
      defaultMediaFocus: 'live',
    },
  ];
}

export const danaActiveConfig = {
  defaults: DANA_ACTIVE_DEFAULTS,
  getProviders: getDanaActiveConfigs,
};

export function getOctopusTvConfig(): XtreamProviderDefinition {
  const def = getDefaultProviderByIdFromRegistry('octopus');
  const serverUrl = normalizeXtreamServerInput(
    readEnvOrVault('OCTOPUS_SERVER_URL') || def?.serverUrl || 'http://octopustv.xyz:80'
  );
  const username = readEnvOrVault('OCTOPUS_USERNAME');
  const password = readEnvOrVault('OCTOPUS_PASSWORD');
  const explicitAccounts: XtreamAccountCredential[] =
    username.trim() && password.trim()
      ? [{ username, password, label: 'Octopus TV' }]
      : [];

  return {
    id: 'octopus',
    name: 'Octopus TV',
    serverUrl,
    accounts: explicitAccounts.length > 0 ? explicitAccounts : toAccountCredentials(def),
    defaultMediaFocus: 'live',
  };
}

export const EXTRA_XTREAM_PROVIDERS: ExtraProviderSlotConfig[] = DEFAULT_EXTRA_XTREAM_PROVIDERS;

export function getAllXtreamProviders(): XtreamProviderDefinition[] {
  const primaryDef = getDefaultProviderByIdFromRegistry('primary');
  const envPrimaryAccounts = parseXtreamAccountsJson(readEnvOrVault('XTREAM_ACCOUNTS_JSON'));
  const primary: XtreamProviderDefinition = {
    id: 'primary',
    name: 'Shark Pro',
    serverUrl: normalizeXtreamServerInput(
      readEnvOrVault('XTREAM_SERVER_URL') || primaryDef?.serverUrl || ''
    ),
    accounts:
      envPrimaryAccounts.length > 0 ? envPrimaryAccounts : toAccountCredentials(primaryDef),
    defaultMediaFocus: 'live',
  };

  const serverOnlyProviders: XtreamProviderDefinition[] =
    typeof process !== 'undefined' && process.env?.XTREAM_DISABLE_DEFAULTS === '1'
      ? []
      : serverDefaultProvidersConfig
          .filter((p) => p.id !== 'vod4k')
          .map((p) => ({
            id: p.id,
            name: p.name,
            serverUrl: normalizeXtreamServerInput(p.serverUrl),
            accounts: p.accounts
              .filter((a) => a.username.trim() && a.password.trim())
              .map((a, idx) => ({
                username: a.username,
                password: a.password,
                label: `${p.name} #${idx + 1}`,
              })),
            defaultMediaFocus: 'live' as const,
          }));

  const baseList = [
    primary,
    getVod4kConfig(),
    ...getExtraXtreamProviders(),
    ...getDanaActiveConfigs(),
    getOctopusTvConfig(),
    ...serverOnlyProviders,
  ];

  const existingIds = new Set(baseList.map((p) => p.id));
  const customExtras = runtimeExtraCustomProviders.filter((p) => !existingIds.has(p.id));
  return [...baseList, ...customExtras];
}

export function getXtreamProviderById(providerId = 'primary'): XtreamProviderDefinition | null {
  const cleanId = String(providerId || 'primary').trim().toLowerCase() || 'primary';
  return getAllXtreamProviders().find((p) => p.id === cleanId) || null;
}
