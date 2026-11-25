/**
 * @module server/services/xtreamService
 * @description Multi-provider server-side Xtream Codes client reading Principal, VOD 4K,
 * 24TV, 2M2H, and custom providers exclusively from process.env via providersConfig.
 * Uses encodeURIComponent() on credentials, automatic multi-account failover,
 * 6-hour catalog caching, masked diagnostics Test Mode, and CORS/Mixed-Content proxies.
 */
import crypto from 'node:crypto';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import {
  ensureLiveDvbCleanHlsSession,
  getActiveDvbSessionPath,
  isDvbUpstreamCoolingDown,
  readLiveDvbPlaylistForIptv,
} from '../routes/proxies/dvbTranscoder.ts';
import {
  getAllXtreamProviders,
  getXtreamProviderById,
  normalizeXtreamServerInput,
  parseXtreamAccountsJson,
  type XtreamAccountCredential,
  type XtreamProviderDefinition,
} from './providersConfig.ts';

export type { XtreamAccountCredential, XtreamProviderDefinition };

export interface XtreamAccountAttemptSummary {
  accountNumber: number;
  status: 'active' | 'inactive' | 'error';
  detail: string;
}

export interface XtreamMaskedStatus {
  providerId: string;
  providerName: string;
  configured: boolean;
  connected: boolean;
  accountNumber: number | null;
  totalAccounts: number;
  accountLabel: string;
  serverLabel: string;
  maskedUsername: string;
  userStatus: string;
  activeConnections?: string;
  maxConnections?: string;
  expDate?: string;
  expDateReadable?: string;
  attempts: XtreamAccountAttemptSummary[];
  error?: string;
}

export interface XtreamProviderPublicSummary {
  id: string;
  name: string;
  configured: boolean;
  totalAccounts: number;
  defaultMediaFocus: 'live' | 'vod' | 'series';
}

export interface XtreamCategoryItem {
  id: string;
  name: string;
  parentId?: string;
  type: 'live' | 'vod' | 'series';
  providerId?: string;
  providerName?: string;
}

export interface XtreamLiveStreamItem {
  num: number;
  streamId: string;
  name: string;
  categoryId: string;
  streamIcon?: string;
  epgChannelId?: string;
  playbackUrl: string;
  providerId: string;
  providerName: string;
}

export interface XtreamVodStreamItem {
  num: number;
  streamId: string;
  name: string;
  categoryId: string;
  streamIcon?: string;
  containerExtension: string;
  rating?: string;
  added?: string;
  playbackUrl: string;
  providerId: string;
  providerName: string;
}

export interface XtreamSeriesItem {
  num: number;
  seriesId: string;
  name: string;
  categoryId: string;
  cover?: string;
  plot?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  providerId: string;
  providerName: string;
}

export interface XtreamSeriesEpisodeItem {
  id: string;
  episodeNum: number;
  seasonNum: number;
  title: string;
  containerExtension: string;
  duration?: string;
  plot?: string;
  cover?: string;
  playbackUrl: string;
  providerId: string;
}

export interface XtreamSeriesSeasonGroup {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  episodes: XtreamSeriesEpisodeItem[];
}

export interface XtreamSeriesInfoPayload {
  seriesId: string;
  providerId: string;
  providerName: string;
  title: string;
  name: string;
  cover?: string;
  plot?: string;
  genre?: string;
  cast?: string;
  director?: string;
  releaseDate?: string;
  rating?: string;
  seasons: XtreamSeriesSeasonGroup[];
}

export interface XtreamFullCatalogPayload {
  providerId: string;
  providerName: string;
  liveCategories: XtreamCategoryItem[];
  liveStreams: XtreamLiveStreamItem[];
  vodCategories: XtreamCategoryItem[];
  vodStreams: XtreamVodStreamItem[];
  seriesCategories: XtreamCategoryItem[];
  series: XtreamSeriesItem[];
  counts: {
    liveCategories: number;
    liveStreams: number;
    vodCategories: number;
    vodStreams: number;
    seriesCategories: number;
    series: number;
  };
  accountNumber: number;
  syncedAt: number;
  expiresAt: number;
  fromCache: boolean;
}

export interface XtreamDiagnosticAccountResult {
  accountNumber: number;
  statusLabel: 'Activa' | 'Inactiva' | 'Error';
  userStatus: string;
  activeConnections: string;
  maxConnections: string;
  expDate?: string;
  expDateReadable: string;
  detail: string;
}

export interface XtreamProviderDiagnosticSummary {
  id: string;
  name: string;
  state: 'Activo' | 'Sin configurar' | 'Error';
  configured: boolean;
  connected: boolean;
  totalAccounts: number;
  activeAccountNumber: number | null;
  expDateReadable?: string;
  activeConnections?: string;
  maxConnections?: string;
  counts: {
    liveChannels: number;
    vodMovies: number;
    series: number;
    liveCategories?: number;
    vodCategories?: number;
    seriesCategories?: number;
  };
  accounts: XtreamDiagnosticAccountResult[];
  detail: string;
}

export interface XtreamDiagnosticReport {
  configured: boolean;
  connected: boolean;
  serverLabel: string;
  totalAccounts: number;
  accounts: XtreamDiagnosticAccountResult[];
  activeAccountSummary: {
    accountNumber: number;
    label: string;
    expDateReadable: string;
    activeConnections: string;
    maxConnections: string;
  } | null;
  catalogCounts: {
    liveChannels: number;
    vodMovies: number;
    series: number;
    liveCategories: number;
    vodCategories: number;
    seriesCategories: number;
  };
  providers: XtreamProviderDiagnosticSummary[];
  checkedAt: number;
  error?: string;
}

export type XtreamAllowedProxyAction =
  | 'account_info'
  | 'get_live_categories'
  | 'get_vod_categories'
  | 'get_live_streams'
  | 'get_vod_streams'
  | 'get_series_categories'
  | 'get_series'
  | 'get_series_info'
  | 'get_short_epg';

export const ALLOWED_XTREAM_PROXY_ACTIONS = new Set<XtreamAllowedProxyAction>([
  'account_info',
  'get_live_categories',
  'get_vod_categories',
  'get_live_streams',
  'get_vod_streams',
  'get_series_categories',
  'get_series',
  'get_series_info',
  'get_short_epg',
]);

interface ActiveSessionCache {
  envFingerprint: string;
  serverOrigin: string;
  accountIndex: number;
  userStatus: string;
  activeConnections: string;
  maxConnections: string;
  expDate?: string;
  expDateReadable: string;
  attempts: XtreamAccountAttemptSummary[];
  validatedAt: number;
}

interface CatalogRamCache {
  envFingerprint: string;
  payload: XtreamFullCatalogPayload;
}

interface OpaqueSegmentEntry {
  url: string;
  serverOrigin: string;
  kind: 'sub' | 'seg';
}

const SESSION_CACHE_TTL_MS = 15 * 60_000;
const SESSION_STALE_REFRESH_MS = 10 * 60_000;
export const XTREAM_CATALOG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4_500;

const providerSessionCaches = new Map<string, ActiveSessionCache>();
const backgroundSessionRefreshes = new Set<string>();
const providerCatalogCaches = new Map<string, CatalogRamCache>();
const inflightCatalogSyncs = new Map<
  string,
  Promise<{
    ok: boolean;
    catalog?: XtreamFullCatalogPayload;
    status?: XtreamMaskedStatus;
    error?: string;
  }>
>();

const opaqueTokenCache = new LruTtlCache<string, OpaqueSegmentEntry>(4_000, 10 * 60_000);
const urlToOpaqueTokenCache = new LruTtlCache<string, string>(4_000, 10 * 60_000);
const opaqueIconCache = new LruTtlCache<string, string>(12_000, 12 * 60 * 60_000);
const urlToOpaqueIconTokenCache = new LruTtlCache<string, string>(12_000, 12 * 60 * 60_000);
const liveManifestRamCache = new LruTtlCache<string, string>(350, 7_500);

function maskSensitive(_value: string): string {
  return '********';
}

export function formatXtreamExpDate(rawExpDate: unknown): string {
  const raw = String(rawExpDate ?? '').trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'unlimited') {
    return 'Sin expiración / Ilimitada';
  }
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) {
    const ms = num > 10_000_000_000 ? num : num * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      try {
        return new Intl.DateTimeFormat('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(d);
      } catch {
        return d.toISOString().slice(0, 10);
      }
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
}

function getProviderFingerprint(provider: XtreamProviderDefinition): string {
  return crypto
    .createHash('sha256')
    .update(
      `${provider.id}|${provider.serverUrl}|${provider.accounts
        .map((a) => `${a.username}:${a.password}`)
        .join(',')}`
    )
    .digest('hex')
    .slice(0, 16);
}

export { normalizeXtreamServerInput };

export function parseXtreamAccountsFromEnv(
  rawJson = process.env.XTREAM_ACCOUNTS_JSON || ''
): XtreamAccountCredential[] {
  return parseXtreamAccountsJson(rawJson);
}

export function clearXtreamSessionCache(): void {
  providerSessionCaches.clear();
  backgroundSessionRefreshes.clear();
  providerCatalogCaches.clear();
  inflightCatalogSyncs.clear();
  opaqueTokenCache.clear();
  urlToOpaqueTokenCache.clear();
  opaqueIconCache.clear();
  urlToOpaqueIconTokenCache.clear();
  liveManifestRamCache.clear();
}

export function listXtreamProviderSummaries(): XtreamProviderPublicSummary[] {
  return getAllXtreamProviders().map((p) => ({
    id: p.id,
    name: p.name,
    configured: Boolean(normalizeXtreamServerInput(p.serverUrl) && p.accounts.length > 0),
    totalAccounts: p.accounts.length,
    defaultMediaFocus: p.defaultMediaFocus,
  }));
}

/**
 * Builds player_api.php URL using explicit encodeURIComponent(user) and encodeURIComponent(pass)
 * so credentials containing whitespace encode safely as %20 without breaking HTTP requests.
 */
export function buildPlayerApiUrl(
  serverOrigin: string,
  account: XtreamAccountCredential,
  action?: XtreamAllowedProxyAction,
  extraParams?: Record<string, string | undefined>
): string {
  const origin = serverOrigin.replace(/\/+$/, '');
  const parts: string[] = [
    `username=${encodeURIComponent(account.username)}`,
    `password=${encodeURIComponent(account.password)}`,
  ];
  if (action && action !== 'account_info') {
    parts.push(`action=${encodeURIComponent(action)}`);
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== '') {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
    }
  }
  return `${origin}/player_api.php?${parts.join('&')}`;
}

/**
 * Builds upstream `${serverOrigin}/${user}/${pass}/${stream_id}.m3u8` strictly in server RAM.
 */
export function buildUpstreamStreamUrl(
  serverOrigin: string,
  account: XtreamAccountCredential,
  streamId: string,
  variant: 'root' | 'live' | 'ts' | 'root-ts' = 'root'
): string {
  const cleanId = String(streamId || '').replace(/\.(?:m3u8|ts)$/i, '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    throw new Error('Identificador de canal inválido.');
  }
  const origin = serverOrigin.replace(/\/+$/, '');
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  const id = encodeURIComponent(cleanId);
  if (variant === 'ts') return `${origin}/live/${u}/${p}/${id}.ts`;
  if (variant === 'root-ts') return `${origin}/${u}/${p}/${id}.ts`;
  return variant === 'live'
    ? `${origin}/live/${u}/${p}/${id}.m3u8`
    : `${origin}/${u}/${p}/${id}.m3u8`;
}

export function buildUpstreamVodUrl(
  serverOrigin: string,
  account: XtreamAccountCredential,
  streamId: string,
  ext = 'mp4'
): string {
  const cleanId = String(streamId || '').trim();
  const cleanExt =
    String(ext || 'mp4')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || 'mp4';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    throw new Error('Identificador VOD inválido.');
  }
  const origin = serverOrigin.replace(/\/+$/, '');
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  return `${origin}/movie/${u}/${p}/${encodeURIComponent(cleanId)}.${cleanExt}`;
}

export function getClientProxiedPlaybackUrl(streamId: string, providerId = 'primary'): string {
  const cleanId = String(streamId || '').replace(/\.m3u8$/i, '').trim();
  const cleanProv = encodeURIComponent(providerId || 'primary');
  return providerId && providerId !== 'primary'
    ? `/api/xtream/stream/${encodeURIComponent(cleanId)}.m3u8?provider=${cleanProv}`
    : `/api/xtream/stream/${encodeURIComponent(cleanId)}.m3u8`;
}

export function buildUpstreamSeriesUrl(
  serverOrigin: string,
  account: XtreamAccountCredential,
  episodeId: string,
  ext = 'mp4'
): string {
  const cleanId = String(episodeId || '').trim();
  const cleanExt =
    String(ext || 'mp4')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || 'mp4';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    throw new Error('Identificador de episodio inválido.');
  }
  const origin = serverOrigin.replace(/\/+$/, '');
  const u = encodeURIComponent(account.username);
  const p = encodeURIComponent(account.password);
  return `${origin}/series/${u}/${p}/${encodeURIComponent(cleanId)}.${cleanExt}`;
}

export function getClientProxiedSeriesEpisodeUrl(
  episodeId: string,
  ext = 'mp4',
  providerId = 'primary'
): string {
  const cleanId = String(episodeId || '').trim();
  const cleanExt =
    String(ext || 'mp4')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || 'mp4';
  const cleanProv = encodeURIComponent(providerId || 'primary');
  return `/api/stream?provider=${cleanProv}&id=${encodeURIComponent(cleanId)}&type=series&ext=${cleanExt}`;
}

export function getClientProxiedVodUrl(
  streamId: string,
  ext = 'mp4',
  providerId = 'primary'
): string {
  const cleanId = String(streamId || '').trim();
  const cleanExt =
    String(ext || 'mp4')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || 'mp4';
  const cleanProv = encodeURIComponent(providerId || 'primary');
  return providerId && providerId !== 'primary'
    ? `/api/xtream/vod/${encodeURIComponent(cleanId)}.${cleanExt}?provider=${cleanProv}`
    : `/api/xtream/vod/${encodeURIComponent(cleanId)}.${cleanExt}`;
}

function registerOpaqueIconUrl(absUrl: string): string {
  const existing = urlToOpaqueIconTokenCache.get(absUrl);
  if (existing && opaqueIconCache.get(existing)) {
    return `/api/xtream/icon/${existing}`;
  }
  const token = crypto.createHash('sha256').update(absUrl).digest('hex').slice(0, 24);
  opaqueIconCache.set(token, absUrl);
  urlToOpaqueIconTokenCache.set(absUrl, token);
  return `/api/xtream/icon/${token}`;
}

function sanitizeImageUrl(raw: unknown): string | undefined {
  const val = String(raw || '').trim();
  if (!val || !/^https?:\/\/[a-z0-9]/i.test(val)) return undefined;
  try {
    const parsed = new URL(val);
    if (parsed.username || parsed.password) return undefined;
    if (parsed.protocol === 'https:') return parsed.toString();
    if (parsed.protocol === 'http:') return registerOpaqueIconUrl(parsed.toString());
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchXtreamJson(
  url: string,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await streamingFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: 'application/json, text/plain, */*',
      },
      timeoutMs,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, data: null };
    }
    const text = await res.text();
    try {
      return { ok: true, status: res.status, data: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, status: res.status, data: null };
    }
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

export async function validateAccountStatus(
  serverOrigin: string,
  account: XtreamAccountCredential
): Promise<{
  active: boolean;
  statusLabel: 'Activa' | 'Inactiva' | 'Error';
  userStatus: string;
  activeConnections: string;
  maxConnections: string;
  expDate?: string;
  expDateReadable: string;
  detail: string;
}> {
  const url = buildPlayerApiUrl(serverOrigin, account);
  const res = await fetchXtreamJson(url, REQUEST_TIMEOUT_MS);
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    return {
      active: false,
      statusLabel: 'Error',
      userStatus: 'Unavailable',
      activeConnections: '0',
      maxConnections: '0',
      expDateReadable: 'N/D',
      detail: `Error de conexión (HTTP ${res.status || 502})`,
    };
  }

  const payload = res.data as {
    user_info?: {
      auth?: number | string;
      status?: string;
      active_cons?: string | number;
      max_connections?: string | number;
      exp_date?: string | number;
    };
  };

  const userInfo = payload.user_info;
  if (!userInfo || Number(userInfo.auth) === 0) {
    return {
      active: false,
      statusLabel: 'Inactiva',
      userStatus: String(userInfo?.status || 'AuthFailed'),
      activeConnections: '0',
      maxConnections: '0',
      expDateReadable: 'N/D',
      detail: 'Autenticación rechazada',
    };
  }

  const expDate = userInfo.exp_date ? String(userInfo.exp_date) : undefined;
  const expDateReadable = formatXtreamExpDate(userInfo.exp_date);
  const rawStatus = String(userInfo.status || '').trim();
  if (rawStatus !== 'Active') {
    return {
      active: false,
      statusLabel: 'Inactiva',
      userStatus: rawStatus || 'Inactive',
      activeConnections: String(userInfo.active_cons ?? '0'),
      maxConnections: String(userInfo.max_connections ?? '0'),
      expDate,
      expDateReadable,
      detail: `Estado no activo (${rawStatus || 'desconocido'})`,
    };
  }

  return {
    active: true,
    statusLabel: 'Activa',
    userStatus: 'Active',
    activeConnections: String(userInfo.active_cons ?? '0'),
    maxConnections: String(userInfo.max_connections ?? '1'),
    expDate,
    expDateReadable,
    detail: 'Activa',
  };
}

function getProviderOrFailoverNull(providerId = 'primary'): {
  provider: XtreamProviderDefinition;
  normalizedServer: string;
  fingerprint: string;
} | { missingProvider: true } | { unconfigured: true; provider: XtreamProviderDefinition } {
  const provider = getXtreamProviderById(providerId);
  if (!provider) {
    return { missingProvider: true };
  }
  const normalizedServer = normalizeXtreamServerInput(provider.serverUrl);
  if (!normalizedServer || provider.accounts.length === 0) {
    return { unconfigured: true, provider };
  }
  return {
    provider,
    normalizedServer,
    fingerprint: getProviderFingerprint(provider),
  };
}

export async function resolveActiveXtreamSession(opts?: {
  forceRefresh?: boolean;
  startFromIndex?: number;
  providerId?: string;
}): Promise<{
  ok: boolean;
  providerId: string;
  providerName: string;
  serverOrigin: string;
  account?: XtreamAccountCredential;
  accountIndex: number;
  status: XtreamMaskedStatus;
}> {
  const targetProviderId = String(opts?.providerId || 'primary').trim().toLowerCase() || 'primary';
  const resolvedCfg = getProviderOrFailoverNull(targetProviderId);

  if ('missingProvider' in resolvedCfg) {
    return {
      ok: false,
      providerId: targetProviderId,
      providerName: targetProviderId,
      serverOrigin: '',
      accountIndex: -1,
      status: {
        providerId: targetProviderId,
        providerName: targetProviderId,
        configured: false,
        connected: false,
        accountNumber: null,
        totalAccounts: 0,
        accountLabel: 'Proveedor no encontrado',
        serverLabel: 'Proveedor desconocido',
        maskedUsername: maskSensitive(''),
        userStatus: 'Unavailable',
        attempts: [],
        error: 'El proveedor seleccionado no existe en la configuración.',
      },
    };
  }

  if ('unconfigured' in resolvedCfg) {
    const p = resolvedCfg.provider;
    const hint =
      p.id === 'primary'
        ? 'Configura XTREAM_SERVER_URL y XTREAM_ACCOUNTS_JSON en las variables de entorno privadas del servidor.'
        : p.id === 'vod4k'
          ? 'Configura VOD4K_SERVER_URL, VOD4K_USERNAME y VOD4K_PASSWORD en las variables de entorno privadas.'
          : p.id === 'dana4k'
            ? 'Configura DANA4K_SERVER_URL y DANA4K_ACCOUNTS_JSON en las variables de entorno privadas.'
            : p.id === 'activecdns'
              ? 'Configura ACTIVE_CDNS_SERVER_URL, ACTIVE_CDNS_USERNAME y ACTIVE_CDNS_PASSWORD en las variables de entorno privadas.'
              : p.id === 'octopus'
                ? 'Configura OCTOPUS_SERVER_URL, OCTOPUS_USERNAME y OCTOPUS_PASSWORD en las variables de entorno privadas.'
                : `Configura las credenciales de ${p.name} en EXTRA_PROVIDERS_JSON dentro de las variables de entorno privadas.`;
    return {
      ok: false,
      providerId: p.id,
      providerName: p.name,
      serverOrigin: '',
      accountIndex: -1,
      status: {
        providerId: p.id,
        providerName: p.name,
        configured: false,
        connected: false,
        accountNumber: null,
        totalAccounts: 0,
        accountLabel: `${p.name}: Sin configurar`,
        serverLabel: 'Servidor no configurado',
        maskedUsername: maskSensitive(''),
        userStatus: 'Unconfigured',
        attempts: [],
        error: hint,
      },
    };
  }

  const { provider, normalizedServer, fingerprint } = resolvedCfg;

  let parsedServer: URL;
  try {
    parsedServer = await assertSafeProxyUrl(normalizedServer);
  } catch {
    return {
      ok: false,
      providerId: provider.id,
      providerName: provider.name,
      serverOrigin: '',
      accountIndex: -1,
      status: {
        providerId: provider.id,
        providerName: provider.name,
        configured: true,
        connected: false,
        accountNumber: null,
        totalAccounts: provider.accounts.length,
        accountLabel: `${provider.name}: Bloqueado`,
        serverLabel: 'Servidor bloqueado',
        maskedUsername: maskSensitive(''),
        userStatus: 'Blocked',
        attempts: [],
        error: `La URL configurada para ${provider.name} no es válida o apunta a una red privada.`,
      },
    };
  }

  const serverOrigin = parsedServer.origin;
  const cached = providerSessionCaches.get(provider.id);

  if (
    !opts?.forceRefresh &&
    opts?.startFromIndex === undefined &&
    cached &&
    cached.envFingerprint === fingerprint &&
    Date.now() - cached.validatedAt < SESSION_CACHE_TTL_MS
  ) {
    const cachedAccount = provider.accounts[cached.accountIndex];
    if (cachedAccount) {
      if (
        Date.now() - cached.validatedAt > SESSION_STALE_REFRESH_MS &&
        !backgroundSessionRefreshes.has(provider.id)
      ) {
        backgroundSessionRefreshes.add(provider.id);
        void validateAccountStatus(serverOrigin, cachedAccount)
          .then((freshCheck) => {
            if (freshCheck.active) {
              providerSessionCaches.set(provider.id, {
                ...cached,
                userStatus: freshCheck.userStatus,
                activeConnections: freshCheck.activeConnections,
                maxConnections: freshCheck.maxConnections,
                expDate: freshCheck.expDate,
                expDateReadable: freshCheck.expDateReadable,
                validatedAt: Date.now(),
              });
            }
          })
          .catch(() => undefined)
          .finally(() => {
            backgroundSessionRefreshes.delete(provider.id);
          });
      }
      const accountNumber = cached.accountIndex + 1;
      const accountLabel =
        provider.id === 'vod4k'
          ? 'VOD 4K: Conectado'
          : provider.id === 'primary'
            ? `Cuenta ${accountNumber}: Activa`
            : provider.accounts.length > 1
              ? `${provider.name} · Cuenta ${accountNumber}: Activa`
              : `${provider.name}: Activo`;
      return {
        ok: true,
        providerId: provider.id,
        providerName: provider.name,
        serverOrigin,
        account: cachedAccount,
        accountIndex: cached.accountIndex,
        status: {
          providerId: provider.id,
          providerName: provider.name,
          configured: true,
          connected: true,
          accountNumber,
          totalAccounts: provider.accounts.length,
          accountLabel,
          serverLabel: 'Servidor Activo',
          maskedUsername: maskSensitive(cachedAccount.username),
          userStatus: cached.userStatus,
          activeConnections: cached.activeConnections,
          maxConnections: cached.maxConnections,
          expDate: cached.expDate,
          expDateReadable: cached.expDateReadable,
          attempts: cached.attempts,
        },
      };
    }
  }

  const total = provider.accounts.length;
  const start = opts?.startFromIndex !== undefined ? Math.max(0, opts.startFromIndex) : 0;
  const order: number[] = [];
  for (let i = start; i < total; i++) order.push(i);
  for (let i = 0; i < start; i++) order.push(i);

  const attempts: XtreamAccountAttemptSummary[] = [];

  let fallbackActive: {
    idx: number;
    check: Awaited<ReturnType<typeof validateAccountStatus>>;
  } | null = null;

  const activateAccount = (
    idx: number,
    check: Awaited<ReturnType<typeof validateAccountStatus>>
  ) => {
    const acc = provider.accounts[idx];
    const accountNumber = idx + 1;
    providerSessionCaches.set(provider.id, {
      envFingerprint: fingerprint,
      serverOrigin,
      accountIndex: idx,
      userStatus: check.userStatus,
      activeConnections: check.activeConnections,
      maxConnections: check.maxConnections,
      expDate: check.expDate,
      expDateReadable: check.expDateReadable,
      attempts,
      validatedAt: Date.now(),
    });
    logger.info(
      {
        event: 'xtream_account_selected',
        providerId: provider.id,
        accountNumber,
        totalAccounts: total,
      },
      'Xtream account activated'
    );

    const accountLabel =
      provider.id === 'vod4k'
        ? 'VOD 4K: Conectado'
        : provider.id === 'primary'
          ? `Cuenta ${accountNumber}: Activa`
          : provider.accounts.length > 1
            ? `${provider.name} · Cuenta ${accountNumber}: Activa`
            : `${provider.name}: Activo`;

    return {
      ok: true,
      providerId: provider.id,
      providerName: provider.name,
      serverOrigin,
      account: acc,
      accountIndex: idx,
      status: {
        providerId: provider.id,
        providerName: provider.name,
        configured: true,
        connected: true,
        accountNumber,
        totalAccounts: total,
        accountLabel,
        serverLabel: 'Servidor Activo',
        maskedUsername: maskSensitive(acc.username),
        userStatus: check.userStatus,
        activeConnections: check.activeConnections,
        maxConnections: check.maxConnections,
        expDate: check.expDate,
        expDateReadable: check.expDateReadable,
        attempts,
      },
    };
  };

  for (let bStart = 0; bStart < order.length; bStart += 3) {
    const batchIndices = order.slice(bStart, bStart + 3);
    const checks = await Promise.all(
      batchIndices.map(async (idx) => ({
        idx,
        check: await validateAccountStatus(serverOrigin, provider.accounts[idx]),
      }))
    );

    for (const { idx, check } of checks) {
      const accountNumber = idx + 1;
      if (check.active) {
        attempts.push({
          accountNumber,
          status: 'active',
          detail: check.detail,
        });
        const activeCons = Number(check.activeConnections);
        const maxCons = Number(check.maxConnections);
        const isCongested =
          Number.isFinite(maxCons) && maxCons > 0 && Number.isFinite(activeCons) && activeCons >= maxCons;
        if (isCongested && total > 1 && idx !== order[order.length - 1]) {
          if (!fallbackActive) fallbackActive = { idx, check };
          continue;
        }
        return activateAccount(idx, check);
      }

      attempts.push({
        accountNumber,
        status: check.statusLabel === 'Error' ? 'error' : 'inactive',
        detail: check.detail,
      });
    }
  }

  if (fallbackActive) {
    return activateAccount(fallbackActive.idx, fallbackActive.check);
  }

  providerSessionCaches.delete(provider.id);
  logger.warn(
    { event: 'xtream_all_accounts_unavailable', providerId: provider.id, totalAccounts: total },
    'No active Xtream account available after failover rotation'
  );

  return {
    ok: false,
    providerId: provider.id,
    providerName: provider.name,
    serverOrigin,
    accountIndex: -1,
    status: {
      providerId: provider.id,
      providerName: provider.name,
      configured: true,
      connected: false,
      accountNumber: null,
      totalAccounts: total,
      accountLabel: 'Ninguna cuenta disponible',
      serverLabel: 'Servidor sin cuenta activa',
      maskedUsername: maskSensitive(''),
      userStatus: 'Unavailable',
      attempts,
      error: `Ninguna cuenta de ${provider.name} está en estado Active en este momento.`,
    },
  };
}

export async function getXtreamConnectionStatus(
  forceRefresh = false,
  providerId = 'primary'
): Promise<XtreamMaskedStatus> {
  if (providerId === 'all' || providerId === 'dana_active') {
    const allProviders = getAllXtreamProviders();
    const providers =
      providerId === 'dana_active'
        ? allProviders.filter((p) => p.id === 'dana4k' || p.id === 'activecdns')
        : allProviders;
    const groupLabel = providerId === 'dana_active' ? 'Dana & Active' : 'Todos los servidores';
    const results = await Promise.all(
      providers.map((p) => resolveActiveXtreamSession({ forceRefresh, providerId: p.id }))
    );
    const activeOnes = results.filter((r) => r.ok);
    const configuredCount = results.filter((r) => r.status.configured).length;
    if (activeOnes.length > 0) {
      return {
        providerId,
        providerName: groupLabel,
        configured: true,
        connected: true,
        accountNumber: activeOnes.length,
        totalAccounts: configuredCount,
        accountLabel: `${activeOnes.length} de ${providers.length} servidores activos`,
        serverLabel: providerId === 'dana_active' ? 'Dana & Active Activo' : 'Multi-Proveedor Activo',
        maskedUsername: '********',
        userStatus: 'Active',
        attempts: [],
      };
    }
    return {
      providerId,
      providerName: groupLabel,
      configured: configuredCount > 0,
      connected: false,
      accountNumber: null,
      totalAccounts: configuredCount,
      accountLabel: configuredCount === 0 ? `${groupLabel}: Sin configurar` : 'Ningún servidor activo',
      serverLabel: configuredCount === 0 ? 'Servidor no configurado' : 'Sin proveedores activos',
      maskedUsername: '********',
      userStatus: configuredCount === 0 ? 'Unconfigured' : 'Unavailable',
      attempts: [],
      error:
        configuredCount === 0
          ? providerId === 'dana_active'
            ? 'Configura DANA4K_* y ACTIVE_CDNS_* en los Secrets privados del entorno.'
            : 'Configura las variables de entorno privadas para activar los servidores.'
          : 'Ningún proveedor configurado tiene una cuenta Active disponible.',
    };
  }
  const res = await resolveActiveXtreamSession({ forceRefresh, providerId });
  return res.status;
}

async function runWithAccountFailover<T>(
  providerId: string,
  worker: (ctx: {
    providerId: string;
    providerName: string;
    serverOrigin: string;
    account: XtreamAccountCredential;
    accountIndex: number;
    accountNumber: number;
  }) => Promise<{ ok: boolean; value?: T; shouldRotate?: boolean }>
): Promise<{ ok: true; value: T; accountNumber: number } | { ok: false; status: XtreamMaskedStatus }> {
  const initial = await resolveActiveXtreamSession({ providerId });
  if (!initial.ok || !initial.account) {
    return { ok: false, status: initial.status };
  }

  const firstAttempt = await worker({
    providerId: initial.providerId,
    providerName: initial.providerName,
    serverOrigin: initial.serverOrigin,
    account: initial.account,
    accountIndex: initial.accountIndex,
    accountNumber: initial.accountIndex + 1,
  });
  if (firstAttempt.ok && firstAttempt.value !== undefined) {
    return { ok: true, value: firstAttempt.value, accountNumber: initial.accountIndex + 1 };
  }

  if (!firstAttempt.shouldRotate) {
    return {
      ok: false,
      status: {
        ...initial.status,
        connected: false,
        error: 'El servidor de streaming no respondió correctamente.',
      },
    };
  }

  const resolvedCfg = getProviderOrFailoverNull(initial.providerId);
  if ('missingProvider' in resolvedCfg || 'unconfigured' in resolvedCfg) {
    return { ok: false, status: initial.status };
  }

  const { provider, fingerprint } = resolvedCfg;
  const total = provider.accounts.length;
  for (let offset = 1; offset < total; offset++) {
    const nextIndex = (initial.accountIndex + offset) % total;
    const candidate = provider.accounts[nextIndex];
    const check = await validateAccountStatus(initial.serverOrigin, candidate);
    if (!check.active) continue;

    const retry = await worker({
      providerId: provider.id,
      providerName: provider.name,
      serverOrigin: initial.serverOrigin,
      account: candidate,
      accountIndex: nextIndex,
      accountNumber: nextIndex + 1,
    });
    if (retry.ok && retry.value !== undefined) {
      providerSessionCaches.set(provider.id, {
        envFingerprint: fingerprint,
        serverOrigin: initial.serverOrigin,
        accountIndex: nextIndex,
        userStatus: check.userStatus,
        activeConnections: check.activeConnections,
        maxConnections: check.maxConnections,
        expDate: check.expDate,
        expDateReadable: check.expDateReadable,
        attempts: [{ accountNumber: nextIndex + 1, status: 'active', detail: 'Activa (respaldo)' }],
        validatedAt: Date.now(),
      });
      return { ok: true, value: retry.value, accountNumber: nextIndex + 1 };
    }
  }

  providerSessionCaches.delete(provider.id);
  return {
    ok: false,
    status: {
      ...initial.status,
      connected: false,
      accountNumber: null,
      accountLabel: 'Ninguna cuenta disponible',
      userStatus: 'Unavailable',
      error: 'Ninguna cuenta de respaldo pudo completar la petición.',
    },
  };
}

function normalizeCategoryList(
  rawList: unknown,
  type: 'live' | 'vod' | 'series',
  providerId: string,
  providerName: string
): XtreamCategoryItem[] {
  if (!Array.isArray(rawList)) return [];
  const categories: XtreamCategoryItem[] = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.category_id ?? '').trim();
    const name = String(r.category_name ?? '').trim();
    if (!id || !name) continue;
    categories.push({
      id,
      name,
      parentId: r.parent_id !== undefined ? String(r.parent_id) : undefined,
      type,
      providerId,
      providerName,
    });
  }
  return categories;
}

function normalizeLiveStreamsList(
  rawList: unknown,
  providerId: string,
  providerName: string,
  fallbackCategoryId?: string
): XtreamLiveStreamItem[] {
  if (!Array.isArray(rawList)) return [];
  const streams: XtreamLiveStreamItem[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const streamId = String(r.stream_id ?? '').trim();
    const name = String(r.name ?? '').trim();
    if (!streamId || !name || !/^[a-zA-Z0-9_-]{1,64}$/.test(streamId)) continue;
    const parsedNum = Number(r.num);
    streams.push({
      num: Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : i + 1,
      streamId,
      name,
      categoryId: String(r.category_id ?? fallbackCategoryId ?? '0').trim(),
      streamIcon: sanitizeImageUrl(r.stream_icon),
      epgChannelId: String(r.epg_channel_id ?? '').trim() || undefined,
      playbackUrl: getClientProxiedPlaybackUrl(streamId, providerId),
      providerId,
      providerName,
    });
  }
  return streams;
}

function normalizeVodStreamsList(
  rawList: unknown,
  providerId: string,
  providerName: string
): XtreamVodStreamItem[] {
  if (!Array.isArray(rawList)) return [];
  const items: XtreamVodStreamItem[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const streamId = String(r.stream_id ?? '').trim();
    const name = String(r.name ?? '').trim();
    if (!streamId || !name || !/^[a-zA-Z0-9_-]{1,64}$/.test(streamId)) continue;
    const parsedNum = Number(r.num);
    const ext =
      String(r.container_extension ?? 'mp4')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase() || 'mp4';
    items.push({
      num: Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : i + 1,
      streamId,
      name,
      categoryId: String(r.category_id ?? '0').trim(),
      streamIcon: sanitizeImageUrl(r.stream_icon),
      containerExtension: ext,
      rating: r.rating !== undefined ? String(r.rating) : undefined,
      added: r.added !== undefined ? String(r.added) : undefined,
      playbackUrl: getClientProxiedVodUrl(streamId, ext, providerId),
      providerId,
      providerName,
    });
  }
  return items;
}

function normalizeSeriesList(
  rawList: unknown,
  providerId: string,
  providerName: string
): XtreamSeriesItem[] {
  if (!Array.isArray(rawList)) return [];
  const items: XtreamSeriesItem[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const seriesId = String(r.series_id ?? '').trim();
    const name = String(r.name ?? '').trim();
    if (!seriesId || !name || !/^[a-zA-Z0-9_-]{1,64}$/.test(seriesId)) continue;
    const parsedNum = Number(r.num);
    items.push({
      num: Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : i + 1,
      seriesId,
      name,
      categoryId: String(r.category_id ?? '0').trim(),
      cover: sanitizeImageUrl(r.cover),
      plot: typeof r.plot === 'string' ? r.plot.slice(0, 280) : undefined,
      genre: typeof r.genre === 'string' ? r.genre : undefined,
      releaseDate: typeof r.releaseDate === 'string' ? r.releaseDate : undefined,
      rating: r.rating !== undefined ? String(r.rating) : undefined,
      providerId,
      providerName,
    });
  }
  return items;
}

export async function getLiveCategories(providerId = 'primary'): Promise<{
  ok: boolean;
  categories: XtreamCategoryItem[];
  status?: XtreamMaskedStatus;
  error?: string;
}> {
  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account, providerId: pid, providerName }) => {
    const url = buildPlayerApiUrl(serverOrigin, account, 'get_live_categories');
    const res = await fetchXtreamJson(url);
    if (!res.ok || !Array.isArray(res.data)) {
      return { ok: false, shouldRotate: true };
    }
    return { ok: true, value: normalizeCategoryList(res.data, 'live', pid, providerName) };
  });

  if (!result.ok) {
    return {
      ok: false,
      categories: [],
      status: result.status,
      error: result.status.error || 'No se pudieron cargar las categorías en directo.',
    };
  }
  return { ok: true, categories: result.value };
}

export async function getVodCategories(providerId = 'primary'): Promise<{
  ok: boolean;
  categories: XtreamCategoryItem[];
  status?: XtreamMaskedStatus;
  error?: string;
}> {
  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account, providerId: pid, providerName }) => {
    const url = buildPlayerApiUrl(serverOrigin, account, 'get_vod_categories');
    const res = await fetchXtreamJson(url);
    if (!res.ok || !Array.isArray(res.data)) {
      return { ok: false, shouldRotate: true };
    }
    return { ok: true, value: normalizeCategoryList(res.data, 'vod', pid, providerName) };
  });

  if (!result.ok) {
    return {
      ok: false,
      categories: [],
      status: result.status,
      error: result.status.error || 'No se pudieron cargar las categorías VOD.',
    };
  }
  return { ok: true, categories: result.value };
}

export async function getLiveStreams(categoryId?: string, providerId = 'primary'): Promise<{
  ok: boolean;
  streams: XtreamLiveStreamItem[];
  status?: XtreamMaskedStatus;
  error?: string;
}> {
  const cleanCatId = String(categoryId || '').trim();
  if (cleanCatId && !/^[a-zA-Z0-9_-]{1,64}$/.test(cleanCatId)) {
    return { ok: false, streams: [], error: 'Identificador de categoría inválido.' };
  }

  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account, providerId: pid, providerName }) => {
    const url = buildPlayerApiUrl(
      serverOrigin,
      account,
      'get_live_streams',
      cleanCatId && cleanCatId !== 'all' ? { category_id: cleanCatId } : undefined
    );
    const res = await fetchXtreamJson(url, 15_000);
    if (!res.ok || !Array.isArray(res.data)) {
      return { ok: false, shouldRotate: true };
    }
    return { ok: true, value: normalizeLiveStreamsList(res.data, pid, providerName, cleanCatId) };
  });

  if (!result.ok) {
    return {
      ok: false,
      streams: [],
      status: result.status,
      error: result.status.error || 'No se pudieron obtener los canales en directo.',
    };
  }
  return { ok: true, streams: result.value };
}

export async function syncFullCatalog(
  forceRefresh = false,
  providerId = 'primary'
): Promise<{
  ok: boolean;
  catalog?: XtreamFullCatalogPayload;
  status?: XtreamMaskedStatus;
  error?: string;
}> {
  const targetId = String(providerId || 'primary').trim().toLowerCase() || 'primary';

  if (targetId === 'all' || targetId === 'dana_active') {
    const scopeIds = targetId === 'dana_active' ? new Set(['dana4k', 'activecdns']) : null;
    const providers = getAllXtreamProviders().filter(
      (p) =>
        (!scopeIds || scopeIds.has(p.id)) &&
        Boolean(normalizeXtreamServerInput(p.serverUrl) && p.accounts.length > 0)
    );
    if (providers.length === 0) {
      const status = await getXtreamConnectionStatus(false, targetId);
      return { ok: false, status, error: status.error };
    }
    const settled = await Promise.all(
      providers.map((p) =>
        Promise.race([
          syncFullCatalog(forceRefresh, p.id),
          new Promise<{ ok: false; error: string }>((resolve) =>
            setTimeout(
              () => resolve({ ok: false, error: `Tiempo agotado sincronizando ${p.name}` }),
              20_000
            )
          ),
        ])
      )
    );
    const okCatalogs = settled
      .filter((r): r is { ok: true; catalog: XtreamFullCatalogPayload } => Boolean(r.ok && r.catalog))
      .map((r) => r.catalog);

    if (okCatalogs.length === 0) {
      const firstErr = settled.find((s) => s.error)?.error;
      return {
        ok: false,
        error: firstErr || 'Ningún proveedor configurado pudo sincronizar su catálogo.',
      };
    }

    const liveCategories = okCatalogs.flatMap((c) =>
      c.liveCategories.map((cat) => ({
        ...cat,
        id: `${c.providerId}:${cat.id}`,
        name: `[${c.providerName}] ${cat.name}`,
      }))
    );
    const liveStreams = okCatalogs.flatMap((c) =>
      c.liveStreams.map((s) => ({ ...s, categoryId: `${c.providerId}:${s.categoryId}` }))
    );
    const vodCategories = okCatalogs.flatMap((c) =>
      c.vodCategories.map((cat) => ({
        ...cat,
        id: `${c.providerId}:${cat.id}`,
        name: `[${c.providerName}] ${cat.name}`,
      }))
    );
    const vodStreams = okCatalogs.flatMap((c) =>
      c.vodStreams.map((s) => ({ ...s, categoryId: `${c.providerId}:${s.categoryId}` }))
    );
    const seriesCategories = okCatalogs.flatMap((c) =>
      c.seriesCategories.map((cat) => ({
        ...cat,
        id: `${c.providerId}:${cat.id}`,
        name: `[${c.providerName}] ${cat.name}`,
      }))
    );
    const series = okCatalogs.flatMap((c) =>
      c.series.map((s) => ({ ...s, categoryId: `${c.providerId}:${s.categoryId}` }))
    );

    const syncedAt = Date.now();
    return {
      ok: true,
      catalog: {
        providerId: targetId,
        providerName: targetId === 'dana_active' ? 'Dana & Active' : 'Todos los servidores',
        liveCategories,
        liveStreams,
        vodCategories,
        vodStreams,
        seriesCategories,
        series,
        counts: {
          liveCategories: liveCategories.length,
          liveStreams: liveStreams.length,
          vodCategories: vodCategories.length,
          vodStreams: vodStreams.length,
          seriesCategories: seriesCategories.length,
          series: series.length,
        },
        accountNumber: okCatalogs.length,
        syncedAt,
        expiresAt: syncedAt + XTREAM_CATALOG_CACHE_TTL_MS,
        fromCache: okCatalogs.every((c) => c.fromCache),
      },
    };
  }

  const resolvedCfg = getProviderOrFailoverNull(targetId);
  if ('missingProvider' in resolvedCfg || 'unconfigured' in resolvedCfg) {
    const statusRes = await resolveActiveXtreamSession({ forceRefresh: false, providerId: targetId });
    return {
      ok: false,
      status: statusRes.status,
      error: statusRes.status.error,
    };
  }

  const { provider, fingerprint } = resolvedCfg;
  const cached = providerCatalogCaches.get(provider.id);

  if (
    !forceRefresh &&
    cached &&
    cached.envFingerprint === fingerprint &&
    Date.now() < cached.payload.expiresAt
  ) {
    return {
      ok: true,
      catalog: {
        ...cached.payload,
        fromCache: true,
      },
    };
  }

  const existingInflight = inflightCatalogSyncs.get(provider.id);
  if (!forceRefresh && existingInflight) {
    return existingInflight;
  }

  const runSync = async () => {
    const result = await runWithAccountFailover(
      provider.id,
      async ({ serverOrigin, account, accountNumber, providerId: pid, providerName }) => {
        const [
          liveCatRes,
          liveStreamsRes,
          vodCatRes,
          vodStreamsRes,
          seriesCatRes,
          seriesRes,
        ] = await Promise.all([
          fetchXtreamJson(buildPlayerApiUrl(serverOrigin, account, 'get_live_categories'), 15_000),
          fetchXtreamJson(buildPlayerApiUrl(serverOrigin, account, 'get_live_streams'), 25_000),
          fetchXtreamJson(buildPlayerApiUrl(serverOrigin, account, 'get_vod_categories'), 15_000),
          fetchXtreamJson(buildPlayerApiUrl(serverOrigin, account, 'get_vod_streams'), 25_000),
          fetchXtreamJson(buildPlayerApiUrl(serverOrigin, account, 'get_series_categories'), 15_000),
          fetchXtreamJson(buildPlayerApiUrl(serverOrigin, account, 'get_series'), 25_000),
        ]);

        // Fail over if all primary catalog calls failed
        if (
          !liveCatRes.ok &&
          !liveStreamsRes.ok &&
          !vodCatRes.ok &&
          !vodStreamsRes.ok &&
          !seriesRes.ok
        ) {
          return { ok: false, shouldRotate: true };
        }

        const liveCategories = normalizeCategoryList(liveCatRes.data, 'live', pid, providerName);
        const liveStreams = normalizeLiveStreamsList(liveStreamsRes.data, pid, providerName);
        const vodCategories = normalizeCategoryList(vodCatRes.data, 'vod', pid, providerName);
        const vodStreams = normalizeVodStreamsList(vodStreamsRes.data, pid, providerName);
        const seriesCategories = normalizeCategoryList(seriesCatRes.data, 'series', pid, providerName);
        const series = normalizeSeriesList(seriesRes.data, pid, providerName);

        const syncedAt = Date.now();
        const payload: XtreamFullCatalogPayload = {
          providerId: pid,
          providerName,
          liveCategories,
          liveStreams,
          vodCategories,
          vodStreams,
          seriesCategories,
          series,
          counts: {
            liveCategories: liveCategories.length,
            liveStreams: liveStreams.length,
            vodCategories: vodCategories.length,
            vodStreams: vodStreams.length,
            seriesCategories: seriesCategories.length,
            series: series.length,
          },
          accountNumber,
          syncedAt,
          expiresAt: syncedAt + XTREAM_CATALOG_CACHE_TTL_MS,
          fromCache: false,
        };
        return { ok: true, value: payload };
      }
    );

    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.status.error || `No se pudo sincronizar el catálogo de ${provider.name}.`,
      };
    }

    providerCatalogCaches.set(provider.id, {
      envFingerprint: fingerprint,
      payload: result.value,
    });

    return {
      ok: true,
      catalog: result.value,
    };
  };

  const task = runSync().finally(() => {
    if (inflightCatalogSyncs.get(provider.id) === task) {
      inflightCatalogSyncs.delete(provider.id);
    }
  });
  inflightCatalogSyncs.set(provider.id, task);

  return task;
}

export async function runXtreamConnectionDiagnostics(
  forceRefreshCatalog = false
): Promise<XtreamDiagnosticReport> {
  const checkedAt = Date.now();
  const allProviders = getAllXtreamProviders();
  const providerSummaries: XtreamProviderDiagnosticSummary[] = [];

  for (const provider of allProviders) {
    const normalizedServer = normalizeXtreamServerInput(provider.serverUrl);
    if (!normalizedServer || provider.accounts.length === 0) {
      providerSummaries.push({
        id: provider.id,
        name: provider.name,
        state: 'Sin configurar',
        configured: false,
        connected: false,
        totalAccounts: 0,
        activeAccountNumber: null,
        counts: { liveChannels: 0, vodMovies: 0, series: 0, liveCategories: 0, vodCategories: 0, seriesCategories: 0 },
        accounts: [],
        detail: 'Credenciales pendientes en variables de entorno',
      });
      continue;
    }

    let parsedServer: URL;
    try {
      parsedServer = await assertSafeProxyUrl(normalizedServer);
    } catch {
      providerSummaries.push({
        id: provider.id,
        name: provider.name,
        state: 'Error',
        configured: true,
        connected: false,
        totalAccounts: provider.accounts.length,
        activeAccountNumber: null,
        counts: { liveChannels: 0, vodMovies: 0, series: 0, liveCategories: 0, vodCategories: 0, seriesCategories: 0 },
        accounts: [],
        detail: 'URL de servidor bloqueada o inválida',
      });
      continue;
    }

    const serverOrigin = parsedServer.origin;
    const accounts: XtreamDiagnosticAccountResult[] = [];
    let firstActiveIdx = -1;
    let firstActiveCheck: Awaited<ReturnType<typeof validateAccountStatus>> | null = null;

    for (let i = 0; i < provider.accounts.length; i++) {
      const check = await validateAccountStatus(serverOrigin, provider.accounts[i]);
      accounts.push({
        accountNumber: i + 1,
        statusLabel: check.statusLabel,
        userStatus: check.userStatus,
        activeConnections: check.activeConnections,
        maxConnections: check.maxConnections,
        expDate: check.expDate,
        expDateReadable: check.expDateReadable,
        detail: check.detail,
      });
      if (check.active && firstActiveIdx === -1) {
        firstActiveIdx = i;
        firstActiveCheck = check;
      }
    }

    if (firstActiveIdx === -1 || !firstActiveCheck) {
      providerSessionCaches.delete(provider.id);
      providerSummaries.push({
        id: provider.id,
        name: provider.name,
        state: 'Error',
        configured: true,
        connected: false,
        totalAccounts: provider.accounts.length,
        activeAccountNumber: null,
        counts: { liveChannels: 0, vodMovies: 0, series: 0, liveCategories: 0, vodCategories: 0, seriesCategories: 0 },
        accounts,
        detail: 'Ninguna cuenta devolvió estado Active',
      });
      continue;
    }

    const activeAccountNumber = firstActiveIdx + 1;
    providerSessionCaches.set(provider.id, {
      envFingerprint: getProviderFingerprint(provider),
      serverOrigin,
      accountIndex: firstActiveIdx,
      userStatus: firstActiveCheck.userStatus,
      activeConnections: firstActiveCheck.activeConnections,
      maxConnections: firstActiveCheck.maxConnections,
      expDate: firstActiveCheck.expDate,
      expDateReadable: firstActiveCheck.expDateReadable,
      attempts: accounts.map((a) => ({
        accountNumber: a.accountNumber,
        status: a.statusLabel === 'Activa' ? 'active' : a.statusLabel === 'Error' ? 'error' : 'inactive',
        detail: a.detail,
      })),
      validatedAt: Date.now(),
    });

    const catRes = await syncFullCatalog(forceRefreshCatalog, provider.id);
    const counts =
      catRes.ok && catRes.catalog
        ? {
            liveChannels: catRes.catalog.counts.liveStreams,
            vodMovies: catRes.catalog.counts.vodStreams,
            series: catRes.catalog.counts.series,
            liveCategories: catRes.catalog.counts.liveCategories,
            vodCategories: catRes.catalog.counts.vodCategories,
            seriesCategories: catRes.catalog.counts.seriesCategories,
          }
        : {
            liveChannels: 0,
            vodMovies: 0,
            series: 0,
            liveCategories: 0,
            vodCategories: 0,
            seriesCategories: 0,
          };

    providerSummaries.push({
      id: provider.id,
      name: provider.name,
      state: 'Activo',
      configured: true,
      connected: true,
      totalAccounts: provider.accounts.length,
      activeAccountNumber,
      expDateReadable: firstActiveCheck.expDateReadable,
      activeConnections: firstActiveCheck.activeConnections,
      maxConnections: firstActiveCheck.maxConnections,
      counts,
      accounts,
      detail: `${counts.liveChannels} TV · ${counts.vodMovies} VOD · ${counts.series} Series`,
    });
  }

  const primaryDiag = providerSummaries.find((p) => p.id === 'primary');
  const firstActiveProvider = providerSummaries.find((p) => p.connected) || null;
  const anyConfigured = providerSummaries.some((p) => p.configured);
  const anyConnected = providerSummaries.some((p) => p.connected);

  const totalCounts = providerSummaries.reduce(
    (acc, p) => {
      acc.liveChannels += p.counts.liveChannels;
      acc.vodMovies += p.counts.vodMovies;
      acc.series += p.counts.series;
      acc.liveCategories += p.counts.liveCategories || 0;
      acc.vodCategories += p.counts.vodCategories || 0;
      acc.seriesCategories += p.counts.seriesCategories || 0;
      return acc;
    },
    {
      liveChannels: 0,
      vodMovies: 0,
      series: 0,
      liveCategories: 0,
      vodCategories: 0,
      seriesCategories: 0,
    }
  );

  const primaryActive = primaryDiag && primaryDiag.connected ? primaryDiag : firstActiveProvider;

  return {
    configured: anyConfigured,
    connected: anyConnected,
    serverLabel: anyConnected
      ? `${providerSummaries.filter((p) => p.connected).length} proveedor(es) activo(s)`
      : anyConfigured
        ? 'Servidor sin cuenta activa'
        : 'Servidor no configurado',
    totalAccounts: primaryDiag?.totalAccounts || primaryActive?.totalAccounts || 0,
    accounts: primaryDiag?.accounts.length ? primaryDiag.accounts : primaryActive?.accounts || [],
    activeAccountSummary: primaryActive
      ? {
          accountNumber: primaryActive.activeAccountNumber || 1,
          label: `${primaryActive.name} · Cuenta ${primaryActive.activeAccountNumber || 1}: Activa`,
          expDateReadable: primaryActive.expDateReadable || 'N/D',
          activeConnections: primaryActive.activeConnections || '0',
          maxConnections: primaryActive.maxConnections || '1',
        }
      : null,
    catalogCounts: totalCounts,
    providers: providerSummaries,
    checkedAt,
    error: !anyConfigured
      ? 'Configura las variables de entorno privadas para activar los proveedores.'
      : !anyConnected
        ? 'Ningún proveedor configurado devolvió una cuenta en estado Active.'
        : undefined,
  };
}

function sanitizeProxyPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const obj = { ...(data as Record<string, unknown>) };
  if ('user_info' in obj && obj.user_info && typeof obj.user_info === 'object') {
    const ui = { ...(obj.user_info as Record<string, unknown>) };
    if ('username' in ui) ui.username = maskSensitive(String(ui.username));
    if ('password' in ui) ui.password = maskSensitive(String(ui.password));
    obj.user_info = ui;
  }
  if ('server_info' in obj && obj.server_info && typeof obj.server_info === 'object') {
    const si = { ...(obj.server_info as Record<string, unknown>) };
    if ('url' in si) si.url = maskSensitive(String(si.url));
    obj.server_info = si;
  }
  return obj;
}

export async function proxyPlayerApiRequest(params: {
  action: XtreamAllowedProxyAction;
  categoryId?: string;
  streamId?: string;
  seriesId?: string;
  providerId?: string;
}): Promise<{
  ok: boolean;
  data?: unknown;
  accountNumber?: number;
  error?: string;
}> {
  const extra: Record<string, string | undefined> = {};
  if (params.categoryId) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(params.categoryId)) {
      return { ok: false, error: 'category_id inválido.' };
    }
    extra.category_id = params.categoryId;
  }
  if (params.streamId) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(params.streamId)) {
      return { ok: false, error: 'stream_id inválido.' };
    }
    extra.stream_id = params.streamId;
  }
  if (params.seriesId) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(params.seriesId)) {
      return { ok: false, error: 'series_id inválido.' };
    }
    extra.series_id = params.seriesId;
  }

  const res = await runWithAccountFailover(
    params.providerId || 'primary',
    async ({ serverOrigin, account }) => {
      const url = buildPlayerApiUrl(serverOrigin, account, params.action, extra);
      const fetched = await fetchXtreamJson(url, 15_000);
      if (!fetched.ok || fetched.data === null) {
        return { ok: false, shouldRotate: true };
      }
      return { ok: true, value: sanitizeProxyPayload(fetched.data) };
    }
  );

  if (!res.ok) {
    return { ok: false, error: res.status.error || 'Servicio Xtream no disponible.' };
  }
  return { ok: true, data: res.value, accountNumber: res.accountNumber };
}

export async function getSeriesInfo(
  seriesId: string,
  providerId = 'primary'
): Promise<{
  ok: boolean;
  info?: XtreamSeriesInfoPayload;
  error?: string;
}> {
  const cleanSeriesId = String(seriesId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanSeriesId)) {
    return { ok: false, error: 'series_id inválido.' };
  }

  const res = await runWithAccountFailover(
    providerId,
    async ({ serverOrigin, account, providerId: pid, providerName }) => {
      const url = buildPlayerApiUrl(serverOrigin, account, 'get_series_info', {
        series_id: cleanSeriesId,
      });
      const fetched = await fetchXtreamJson(url, 15_000);
      if (!fetched.ok || !fetched.data || typeof fetched.data !== 'object') {
        return { ok: false, shouldRotate: true };
      }
      const raw = fetched.data as {
        info?: Record<string, unknown>;
        seasons?: Array<Record<string, unknown>>;
        episodes?: Record<string, Array<Record<string, unknown>>>;
      };
      const meta = raw.info || {};
      const seasonMap = new Map<number, XtreamSeriesEpisodeItem[]>();
      const episodesObj = raw.episodes && typeof raw.episodes === 'object' ? raw.episodes : {};

      for (const [seasonKey, epList] of Object.entries(episodesObj)) {
        if (!Array.isArray(epList)) continue;
        const fallbackSeason = Number(seasonKey) || 1;
        for (let i = 0; i < epList.length; i++) {
          const ep = epList[i];
          if (!ep || typeof ep !== 'object') continue;
          const epId = String(ep.id ?? '').trim();
          if (!epId || !/^[a-zA-Z0-9_-]{1,64}$/.test(epId)) continue;
          const seasonNum = Number(ep.season ?? fallbackSeason) || fallbackSeason;
          const episodeNum = Number(ep.episode_num ?? i + 1) || i + 1;
          const ext =
            String(ep.container_extension ?? 'mp4')
              .replace(/[^a-zA-Z0-9]/g, '')
              .toLowerCase() || 'mp4';
          const epInfo = (ep.info && typeof ep.info === 'object' ? ep.info : {}) as Record<
            string,
            unknown
          >;

          const bucket = seasonMap.get(seasonNum) || [];
          bucket.push({
            id: epId,
            episodeNum,
            seasonNum,
            title: String(ep.title || `Episodio ${episodeNum}`).trim(),
            containerExtension: ext,
            duration: typeof epInfo.duration === 'string' ? epInfo.duration : undefined,
            plot: typeof epInfo.plot === 'string' ? epInfo.plot.slice(0, 260) : undefined,
            cover: sanitizeImageUrl(epInfo.movie_image ?? epInfo.cover),
            playbackUrl: getClientProxiedSeriesEpisodeUrl(epId, ext, pid),
            providerId: pid,
          });
          seasonMap.set(seasonNum, bucket);
        }
      }

      const seasonNames = new Map<number, string>();
      if (Array.isArray(raw.seasons)) {
        for (const s of raw.seasons) {
          if (!s || typeof s !== 'object') continue;
          const num = Number(s.season_number);
          const nm = String(s.name || '').trim();
          if (Number.isFinite(num) && nm) seasonNames.set(num, nm);
        }
      }

      const seasons: XtreamSeriesSeasonGroup[] = Array.from(seasonMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([seasonNumber, eps]) => {
          const sortedEps = eps.sort((a, b) => a.episodeNum - b.episodeNum);
          return {
            seasonNumber,
            name: seasonNames.get(seasonNumber) || `Temporada ${seasonNumber}`,
            episodeCount: sortedEps.length,
            episodes: sortedEps,
          };
        });

      const resolvedTitle = String(meta.name || `Serie ${cleanSeriesId}`).trim();
      return {
        ok: true,
        value: {
          seriesId: cleanSeriesId,
          providerId: pid,
          providerName,
          title: resolvedTitle,
          name: resolvedTitle,
          cover: sanitizeImageUrl(meta.cover),
          plot: typeof meta.plot === 'string' ? meta.plot.slice(0, 400) : undefined,
          genre: typeof meta.genre === 'string' ? meta.genre : undefined,
          cast: typeof meta.cast === 'string' ? meta.cast : undefined,
          director: typeof meta.director === 'string' ? meta.director : undefined,
          releaseDate: typeof meta.releaseDate === 'string' ? meta.releaseDate : undefined,
          rating: meta.rating !== undefined ? String(meta.rating) : undefined,
          seasons,
        } satisfies XtreamSeriesInfoPayload,
      };
    }
  );

  if (!res.ok) {
    return {
      ok: false,
      error: res.status.error || 'No se pudieron cargar las temporadas y episodios.',
    };
  }
  return { ok: true, info: res.value };
}

function registerOpaqueToken(absUrl: string, serverOrigin: string, kind: 'sub' | 'seg'): string {
  const cacheKey = `${kind}:${absUrl}`;
  const existing = urlToOpaqueTokenCache.get(cacheKey);
  if (existing && opaqueTokenCache.get(existing)) return existing;
  const token = crypto.randomBytes(14).toString('hex');
  opaqueTokenCache.set(token, { url: absUrl, serverOrigin, kind });
  urlToOpaqueTokenCache.set(cacheKey, token);
  return token;
}

function rewriteManifestLines(
  rawText: string,
  baseUrl: string,
  serverOrigin: string,
  originPrefix: string
): string {
  const lines = rawText.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith('#')) {
      out.push(
        line.replace(/URI="([^"]+)"/gi, (_m, rawUri: string) => {
          try {
            const abs = new URL(rawUri, baseUrl).toString();
            const token = registerOpaqueToken(abs, serverOrigin, 'seg');
            return `URI="${originPrefix}/api/xtream/seg/${token}"`;
          } catch {
            return `URI="${rawUri}"`;
          }
        })
      );
      continue;
    }

    try {
      const abs = new URL(trimmed, baseUrl).toString();
      const isPlaylist = /\.m3u8(\?|$|#)/i.test(abs);
      const token = registerOpaqueToken(abs, serverOrigin, isPlaylist ? 'sub' : 'seg');
      out.push(`${originPrefix}/api/xtream/seg/${token}`);
    } catch {
      out.push(line);
    }
  }

  return out.join('\n');
}

const providerPreferredLiveVariant = new Map<string, 'live' | 'root' | 'ts' | 'root-ts'>();

export async function fetchProxiedXtreamManifest(
  streamId: string,
  originPrefix = '',
  providerId = 'primary'
): Promise<string | null> {
  const cleanId = String(streamId || '').replace(/\.(?:m3u8|ts)$/i, '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) return null;

  const manifestCacheKey = `${providerId}:${cleanId}:${originPrefix || 'rel'}`;
  const cachedManifest = liveManifestRamCache.get(manifestCacheKey);
  if (cachedManifest) {
    return cachedManifest;
  }

  const knownPreferred = providerPreferredLiveVariant.get(providerId);
  const m3u8Variants: Array<'live' | 'root'> =
    knownPreferred === 'root' ? ['root', 'live'] : ['live', 'root'];
  const tsVariants: Array<'ts' | 'root-ts'> =
    knownPreferred === 'root-ts' ? ['root-ts', 'ts'] : ['ts', 'root-ts'];

  const probeM3u8Variant = async (
    serverOrigin: string,
    account: XtreamAccountCredential,
    variant: 'live' | 'root'
  ): Promise<string | null> => {
    const targetUrl = buildUpstreamStreamUrl(serverOrigin, account, cleanId, variant);
    const uaList = ['IPTVSmartersPlayer', 'VLC/3.0.20 LibVLC/3.0.20'];
    for (let uIdx = 0; uIdx < uaList.length; uIdx++) {
      try {
        const res = await streamingFetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': uaList[uIdx],
            Accept: '*/*',
          },
          timeoutMs: 2_400,
        });
        if (!res.ok) {
          if (res.body) void res.body.cancel().catch(() => undefined);
          // Retry with VLC UA only when portal returns 406/403 against default UA
          if ((res.status === 406 || res.status === 403) && uIdx === 0) continue;
          return null;
        }
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (ct.startsWith('text/html') || ct.includes('video/mp2t') || ct.includes('octet-stream')) {
          if (res.body) void res.body.cancel().catch(() => undefined);
          return null;
        }
        const text = await res.text();
        if (text.includes('#EXTM3U')) {
          providerPreferredLiveVariant.set(providerId, variant);
          return rewriteManifestLines(text, res.url || targetUrl, serverOrigin, originPrefix);
        }
        return null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const probeTsRelay = async (
    serverOrigin: string,
    account: XtreamAccountCredential
  ): Promise<string | null> => {
    for (const tsVariant of tsVariants) {
      const tsUrl = buildUpstreamStreamUrl(serverOrigin, account, cleanId, tsVariant);
      const warmPath = getActiveDvbSessionPath(tsUrl, 'hd');
      if (warmPath) {
        const warmPl = readLiveDvbPlaylistForIptv(warmPath, originPrefix);
        if (warmPl) {
          providerPreferredLiveVariant.set(providerId, tsVariant);
          return warmPl;
        }
      }
      if (isDvbUpstreamCoolingDown(tsUrl)) continue;
      try {
        await assertSafeProxyUrl(tsUrl);
        const dvbPath = await ensureLiveDvbCleanHlsSession(
          tsUrl,
          'hd',
          `${serverOrigin.replace(/\/+$/, '')}/`
        ).catch(() => null);
        if (dvbPath) {
          const playlist = readLiveDvbPlaylistForIptv(dvbPath, originPrefix);
          if (playlist) {
            providerPreferredLiveVariant.set(providerId, tsVariant);
            return playlist;
          }
        }
      } catch {
        // try next variant
      }
    }
    return null;
  };

  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account }) => {
    // 1) Fast path if a warm MPEG-TS DVB relay session already exists (never serve stale rolling playlist from RAM cache)
    for (const tsVariant of tsVariants) {
      const tsUrl = buildUpstreamStreamUrl(serverOrigin, account, cleanId, tsVariant);
      const warmPath = getActiveDvbSessionPath(tsUrl, 'hd');
      if (warmPath) {
        const warmPl = readLiveDvbPlaylistForIptv(warmPath, originPrefix);
        if (warmPl) {
          return { ok: true, value: warmPl };
        }
      }
    }

    // 2) If provider is NOT known to require .ts relay, try direct upstream HLS (.m3u8) first
    if (knownPreferred !== 'ts' && knownPreferred !== 'root-ts') {
      if (!knownPreferred) {
        try {
          const winner = await Promise.any(
            m3u8Variants.map(async (v) => {
              const rewritten = await probeM3u8Variant(serverOrigin, account, v);
              if (!rewritten) throw new Error('variant_miss');
              return rewritten;
            })
          );
          liveManifestRamCache.set(manifestCacheKey, winner);
          return { ok: true, value: winner };
        } catch {
          // fall through to MPEG-TS DVB relay
        }
      } else {
        for (const variant of m3u8Variants) {
          const rewritten = await probeM3u8Variant(serverOrigin, account, variant);
          if (rewritten) {
            liveManifestRamCache.set(manifestCacheKey, rewritten);
            return { ok: true, value: rewritten };
          }
        }
      }
    }

    // 3) Fallback (or primary for .ts-only providers like Shark Pro / Octopus / VOD4K / 24TV / Ultra VIP): MPEG-TS -> clean HLS relay
    const dvbPlaylist = await probeTsRelay(serverOrigin, account);
    if (dvbPlaylist) {
      return { ok: true, value: dvbPlaylist };
    }

    return { ok: false, shouldRotate: true };
  });

  return result.ok ? result.value : null;
}

export async function probeXtreamLiveStreamLatency(
  streamId: string,
  providerId = 'primary',
  timeoutMs = 3_000
): Promise<{
  ok: boolean;
  latencyMs: number;
  variant?: 'live' | 'root' | 'ts' | 'root-ts';
  lineCount: number;
}> {
  const cleanId = String(streamId || '').replace(/\.(?:m3u8|ts)$/i, '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    return { ok: false, latencyMs: timeoutMs, lineCount: 0 };
  }
  const preferred = providerPreferredLiveVariant.get(providerId) || 'live';
  const m3u8Variants: Array<'live' | 'root'> =
    preferred === 'root' ? ['root', 'live'] : ['live', 'root'];
  const tsVariants: Array<'ts' | 'root-ts'> =
    preferred === 'root-ts' ? ['root-ts', 'ts'] : ['ts', 'root-ts'];

  const startedAt = Date.now();
  const result = await runWithAccountFailover<{
    ok: boolean;
    latencyMs: number;
    variant?: 'live' | 'root' | 'root-ts' | 'ts';
    lineCount: number;
  }>(providerId, async ({ serverOrigin, account }) => {
    if (preferred !== 'ts' && preferred !== 'root-ts') {
      for (const variant of m3u8Variants) {
        const targetUrl = buildUpstreamStreamUrl(serverOrigin, account, cleanId, variant);
        try {
          const t0 = Date.now();
          const res = await streamingFetch(targetUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'IPTVSmartersPlayer',
              Accept: '*/*',
            },
            timeoutMs: Math.min(timeoutMs, 2_200),
          });
          if (!res.ok) {
            if (res.body) void res.body.cancel().catch(() => undefined);
            continue;
          }
          const ct = String(res.headers.get('content-type') || '').toLowerCase();
          if (ct.startsWith('text/html') || ct.includes('video/mp2t') || ct.includes('octet-stream')) {
            if (res.body) void res.body.cancel().catch(() => undefined);
            continue;
          }
          const text = await res.text();
          if (text.includes('#EXTM3U')) {
            providerPreferredLiveVariant.set(providerId, variant);
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            const hasSeg = lines.some((l) => !l.startsWith('#'));
            if (!hasSeg && !text.includes('#EXT-X-STREAM-INF')) continue;
            return {
              ok: true,
              value: {
                ok: true,
                latencyMs: Math.max(1, Date.now() - t0),
                variant,
                lineCount: lines.length,
              },
            };
          }
        } catch {
          // try next variant
        }
      }
    }

    // Lightweight single-socket MPEG-TS byte probe (no FFmpeg spawn during probes)
    for (const tsVariant of tsVariants) {
      const targetUrl = buildUpstreamStreamUrl(serverOrigin, account, cleanId, tsVariant);
      const t0 = Date.now();
      try {
        const res = await streamingFetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'IPTVSmartersPlayer',
            Accept: '*/*',
          },
          headersTimeoutOnly: true,
          timeoutMs: Math.min(timeoutMs, 2_600),
        });
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        if ((!res.ok && res.status !== 206) || ct.startsWith('text/html')) {
          if (res.body) void res.body.cancel().catch(() => undefined);
          continue;
        }
        const body = res.body as ReadableStream<Uint8Array> | null;
        if (!body) continue;
        const reader = body.getReader();
        let bytesRead = 0;
        try {
          const chunkPromise = Promise.race([
            reader.read(),
            new Promise<{ done: true; value: undefined }>((resolve) =>
              setTimeout(() => resolve({ done: true, value: undefined }), 1_600)
            ),
          ]);
          const first = await chunkPromise;
          if (!first.done && first.value) {
            bytesRead = first.value.byteLength;
          }
        } finally {
          void reader.cancel().catch(() => undefined);
        }
        if (bytesRead >= 188) {
          providerPreferredLiveVariant.set(providerId, tsVariant);
          return {
            ok: true,
            value: {
              ok: true,
              latencyMs: Math.max(1, Date.now() - t0),
              variant: tsVariant,
              lineCount: 1,
            },
          };
        }
      } catch {
        // try next variant
      }
    }

    return { ok: false, shouldRotate: false };
  });

  if (result.ok && result.value) {
    return result.value;
  }
  return { ok: false, latencyMs: Math.max(1, Date.now() - startedAt), lineCount: 0 };
}

export async function fetchProxiedXtreamVodStream(
  streamId: string,
  ext = 'mp4',
  rangeHeader?: string,
  providerId = 'primary',
  signal?: AbortSignal
): Promise<Response | null> {
  const cleanId = String(streamId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) return null;

  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account }) => {
    const targetUrl = buildUpstreamVodUrl(serverOrigin, account, cleanId, ext);
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: '*/*',
      };
      if (rangeHeader) headers.Range = rangeHeader;
      const res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers,
        headersTimeoutOnly: true,
        timeoutMs: 15_000,
        signal,
      });
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if ((res.ok || res.status === 206) && !ct.startsWith('text/html')) {
        return { ok: true, value: res };
      }
      if (res.body) {
        void res.body.cancel().catch(() => undefined);
      }
      if (res.status === 401 || res.status === 403 || ct.startsWith('text/html')) {
        return { ok: false, shouldRotate: true };
      }
      return { ok: false, shouldRotate: false };
    } catch {
      if (signal?.aborted) return { ok: false, shouldRotate: false };
      return { ok: false, shouldRotate: true };
    }
  });

  return result.ok ? result.value : null;
}

export async function fetchProxiedXtreamSeriesStream(
  episodeId: string,
  ext = 'mp4',
  rangeHeader?: string,
  providerId = 'primary',
  signal?: AbortSignal
): Promise<Response | null> {
  const cleanId = String(episodeId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) return null;

  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account }) => {
    const targetUrl = buildUpstreamSeriesUrl(serverOrigin, account, cleanId, ext);
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: '*/*',
      };
      if (rangeHeader) headers.Range = rangeHeader;
      const res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers,
        headersTimeoutOnly: true,
        timeoutMs: 15_000,
        signal,
      });
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if ((res.ok || res.status === 206) && !ct.startsWith('text/html')) {
        return { ok: true, value: res };
      }
      if (res.body) {
        void res.body.cancel().catch(() => undefined);
      }
      if (res.status === 401 || res.status === 403 || ct.startsWith('text/html')) {
        return { ok: false, shouldRotate: true };
      }
      return { ok: false, shouldRotate: false };
    } catch {
      if (signal?.aborted) return { ok: false, shouldRotate: false };
      return { ok: false, shouldRotate: true };
    }
  });

  return result.ok ? result.value : null;
}

export async function resolveUpstreamVodOrSeriesUrl(
  streamId: string,
  ext = 'mp4',
  providerId = 'primary',
  mediaType: 'vod' | 'series' = 'vod'
): Promise<{ ok: boolean; url?: string }> {
  const cleanId = String(streamId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) {
    return { ok: false };
  }
  const result = await runWithAccountFailover(providerId, async ({ serverOrigin, account }) => {
    const targetUrl =
      mediaType === 'series'
        ? buildUpstreamSeriesUrl(serverOrigin, account, cleanId, ext)
        : buildUpstreamVodUrl(serverOrigin, account, cleanId, ext);
    try {
      const res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'IPTVSmartersPlayer',
          Accept: '*/*',
          Range: 'bytes=0-63',
        },
        headersTimeoutOnly: true,
        timeoutMs: 8_000,
      });
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      const finalUrl = res.url || targetUrl;
      if (res.body) {
        void res.body.cancel().catch(() => undefined);
      }
      if ((res.ok || res.status === 206) && !ct.startsWith('text/html')) {
        return { ok: true, value: finalUrl };
      }
      return { ok: false, shouldRotate: res.status === 401 || res.status === 403 || ct.startsWith('text/html') };
    } catch {
      return { ok: false, shouldRotate: true };
    }
  });

  if (!result.ok || !result.value) {
    return { ok: false };
  }
  return { ok: true, url: result.value };
}

export async function fetchXtreamOpaqueIcon(token: string): Promise<{
  status: number;
  contentType: string;
  body: Buffer;
} | null> {
  const cleanToken = String(token || '').trim();
  if (!/^[a-f0-9]{16,40}$/i.test(cleanToken)) return null;
  const rawUrl = opaqueIconCache.get(cleanToken);
  if (!rawUrl) return null;

  try {
    const safeUrl = await assertSafeProxyUrl(rawUrl);
    const res = await streamingFetch(safeUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: 'image/*,*/*;q=0.8',
      },
      timeoutMs: 8_000,
    });
    if (!res.ok) return null;
    const ct = String(res.headers.get('content-type') || 'image/png').split(';')[0].trim();
    if (!ct.toLowerCase().startsWith('image/') && ct !== 'application/octet-stream') {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 4 * 1024 * 1024) return null;
    return {
      status: 200,
      contentType: ct.startsWith('image/') ? ct : 'image/png',
      body: buf,
    };
  } catch {
    return null;
  }
}

export async function openXtreamOpaqueSegmentStream(
  token: string,
  rangeHeader?: string,
  signal?: AbortSignal
): Promise<{
  kind: 'stream' | 'playlist';
  status: number;
  contentType: string;
  contentLength?: string | null;
  acceptRanges?: string | null;
  body?: ReadableStream<Uint8Array>;
  buffer?: Buffer;
} | null> {
  const entry = opaqueTokenCache.get(token);
  if (!entry) return null;

  try {
    const safeUrl = await assertSafeProxyUrl(entry.url);
    const headers: Record<string, string> = {
      'User-Agent': 'IPTVSmartersPlayer',
      Accept: '*/*',
    };
    if (rangeHeader) headers.Range = rangeHeader;

    const isSubManifest = entry.kind === 'sub' || /\.m3u8(\?|$)/i.test(entry.url);
    const res = await streamingFetch(safeUrl.toString(), {
      method: 'GET',
      headers,
      headersTimeoutOnly: !isSubManifest,
      timeoutMs: isSubManifest ? 3_500 : 10_000,
      signal,
    });
    if (!res.ok && res.status !== 206) {
      if (res.body) void res.body.cancel().catch(() => undefined);
      return null;
    }

    const ct = String(res.headers.get('content-type') || 'application/octet-stream');
    if (isSubManifest || ct.toLowerCase().includes('mpegurl')) {
      const text = await res.text();
      if (text.includes('#EXTM3U')) {
        const rewritten = rewriteManifestLines(text, res.url || entry.url, entry.serverOrigin, '');
        return {
          kind: 'playlist',
          status: 200,
          contentType: 'application/vnd.apple.mpegurl',
          buffer: Buffer.from(rewritten, 'utf8'),
        };
      }
      return {
        kind: 'playlist',
        status: res.status,
        contentType: ct,
        buffer: Buffer.from(text, 'utf8'),
      };
    }

    if (!res.body) return null;
    return {
      kind: 'stream',
      status: res.status,
      contentType: ct,
      contentLength: res.headers.get('content-length'),
      acceptRanges: res.headers.get('accept-ranges'),
      body: res.body as ReadableStream<Uint8Array>,
    };
  } catch {
    return null;
  }
}

export async function fetchXtreamOpaqueResource(
  token: string,
  originPrefix = '',
  rangeHeader?: string
): Promise<{
  status: number;
  contentType: string;
  body: Buffer;
} | null> {
  const entry = opaqueTokenCache.get(token);
  if (!entry) return null;

  try {
    const safeUrl = await assertSafeProxyUrl(entry.url);
    const headers: Record<string, string> = {
      'User-Agent': 'IPTVSmartersPlayer',
      Accept: '*/*',
    };
    if (rangeHeader) headers.Range = rangeHeader;

    const res = await streamingFetch(safeUrl.toString(), {
      method: 'GET',
      headers,
      timeoutMs: 12_000,
    });
    if (!res.ok && res.status !== 206) return null;

    const ct = String(res.headers.get('content-type') || 'application/octet-stream');
    if (entry.kind === 'sub' || ct.toLowerCase().includes('mpegurl') || /\.m3u8(\?|$)/i.test(entry.url)) {
      const text = await res.text();
      if (text.includes('#EXTM3U')) {
        const rewritten = rewriteManifestLines(text, res.url || entry.url, entry.serverOrigin, originPrefix);
        return {
          status: 200,
          contentType: 'application/vnd.apple.mpegurl',
          body: Buffer.from(rewritten, 'utf8'),
        };
      }
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      contentType: ct,
      body: buf,
    };
  } catch {
    return null;
  }
}

export function isXtreamEnvConfigured(): boolean {
  return getAllXtreamProviders().some((p) =>
    Boolean(normalizeXtreamServerInput(p.serverUrl) && p.accounts.length > 0)
  );
}

export async function initXtreamEnvFromEnv(): Promise<void> {
  if (!isXtreamEnvConfigured()) return;
  await syncFullCatalog(false, 'all').catch(() => undefined);
}

export interface XtreamIntegratedTdtChannel {
  id: string;
  streamId: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category:
    | 'movistar'
    | 'dazn'
    | 'uk_sports'
    | 'beinsports'
    | 'bein_arabic'
    | 'documentales'
    | 'usa_tv'
    | 'europa_tv'
    | 'noticias_intl'
    | 'espn'
    | 'dsports'
    | 'generalistas'
    | 'cine_series'
    | 'entretenimiento'
    | 'noticias_deportes'
    | 'infantil_autonomicas'
    | 'belix_live';
  quality: string;
  countryCode?: string;
  logoUrl?: string;
  description: string;
  epgChannelId?: string;
  channels: Array<{
    id: string;
    label: string;
    lang: string;
    langLabel?: string;
    quality: string;
    providerId?: string;
    providerName?: string;
    sourceUrl: string;
    resolverType: 'direct_hls';
  }>;
}

function inferLiveQualityLabel(rawName: string, catName: string): string {
  const hay = `${rawName} ${catName}`
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ')
    .toLowerCase();
  if (/(?:\b4k\b|\buhd\b|\b2160p?\b)/i.test(hay)) return '4K UHD';
  if (/\b(?:fhd|1080p?|full\s*hd)\b/i.test(hay)) return '1080p FHD';
  if (/\b(?:576p?|480p?|360p?|sd)\b/i.test(hay)) return 'SD';
  return 'HD';
}

function inferLiveLangAndCountry(rawName: string, catName: string): {
  lang: string;
  langLabel: string;
  countryCode?: string;
} {
  const name = String(rawName || '').trim();
  const cat = String(catName || '').trim();
  const combined = `${cat} ${name}`;
  if (
    /^(?:\[?\s*(?:UK|US|USA|FR|DE|GER|IT|ITA|PT|POR|AR|ARB|LAT|LA|MX|ARG|NL|PL|RO|GR|BG|RS|MK|TR|IR|RU|FI|NO|SE|DK|BE|AT|CH|AL|IND)\s*\]?\s*[|:/-·•▎┃│◈])/i.test(
      name
    ) ||
    /^[┃│▎◈•]/.test(name)
  ) {
    // Let explicit foreign prefix below classify its real language/country
  } else if (
    /\b(?:spain|espa[ñn]a|tdt|tivify|tivfiy|movistar|atresmedia|mediaset|rtve|laliga|hypermotion)\b|أسبانيا|^(?:tivif?y\s*es\s*[:|]|vip\s*es\s*[:|]|\[?\s*(?:es|esp)\s*\]?\s*[|:/-])/i.test(
      combined
    ) &&
    !/^(?:\[?\s*(?:UK|US|USA|FR|DE|GER|IT|PT|AR|ARB|LAT|MX|NL|PL|RO|GR|TR|FI|NO|SE|DK|BE|AT|AL|IND)\s*\]?\s*[|:/-])/i.test(cat)
  ) {
    return { lang: 'ES', langLabel: 'Castellano', countryCode: 'ES' };
  }
  if (/[\u0600-\u06FF]|^(?:\[?\s*(?:AR|ARB)\s*\]?\s*[|:/-])|\b(?:arabic|arabia|egypt|maroc|morocco|mbc|rotana|al\s*jazeera|nile)\b/i.test(combined)) {
    return { lang: 'AR', langLabel: 'Árabe', countryCode: 'AR' };
  }
  if (/^(?:\[?\s*CAT\s*\]?\s*[|:/-])|\b(?:catal[aà]|tv3|3cat|esport3|sx3)\b/i.test(combined)) {
    return { lang: 'CAT', langLabel: 'Català', countryCode: 'ES' };
  }
  if (/^(?:\|?\s*(?:LAT|LA|MX|ARG|COL|CHL|PER|PE)\s*\]?\s*[|:/-])|\b(?:latino|latam|m[eé]xico|argentina|colombia|chile|dsports)\b/i.test(combined)) {
    return { lang: 'LAT', langLabel: 'Latino', countryCode: 'LAT' };
  }
  if (/^(?:\[?\s*(?:FR|VF)\s*\]?\s*[|:/-])|\b(?:france|french|fran[çc]ais|canal\+|tf1|rmc\s*sport|m6)\b/i.test(combined)) {
    return { lang: 'FR', langLabel: 'Francés', countryCode: 'FR' };
  }
  if (/^(?:\[?\s*(?:PT|BR)\s*\]?\s*[|:/-])|\b(?:portugal|sport\s*tv|tvi|sic|rtp|brasil|globo)\b/i.test(combined)) {
    return { lang: 'PT', langLabel: 'Portugués', countryCode: 'PT' };
  }
  if (/^(?:\[?\s*IT\s*\]?\s*[|:/-])|\b(?:italy|italia|italiano|rai|mediaset\s*italia|sky\s*italia|serie\s*a)\b/i.test(combined)) {
    return { lang: 'IT', langLabel: 'Italiano', countryCode: 'IT' };
  }
  if (/^(?:\[?\s*(?:DE|GER|AT|CH)\s*\]?\s*[|:/-])|\b(?:germany|deutsch|zdf|ard|rtl|sky\s*sport\s*de|bundesliga)\b/i.test(combined)) {
    return { lang: 'DE', langLabel: 'Alemán', countryCode: 'DE' };
  }
  if (/^(?:\[?\s*(?:UK|US|USA|EN|ENG|CA|AU)\s*\]?\s*[|:/-])|\b(?:uk|usa|united\s*states|english|sky\s*sports|tnt\s*sports|bbc|itv|nbc|cbs|abc|fox|espn|premier\s*league)\b/i.test(combined)) {
    return {
      lang: 'EN',
      langLabel: 'Inglés',
      countryCode: /\b(?:us|usa|nba|nfl|mlb|espn|cbs|nbc|abc|fox)\b/i.test(combined) ? 'US' : 'GB',
    };
  }
  const euroMatch = combined.match(/^(?:\[?\s*|┃)(NL|PL|RO|GR|BG|RS|MK|TR|IR|RU|FI|NO|SE|DK|BE|AL|IND)\b/i);
  if (euroMatch) {
    const cc = euroMatch[1].toUpperCase();
    return { lang: cc, langLabel: cc, countryCode: cc };
  }
  return { lang: 'INT', langLabel: 'Internacional' };
}

function inferLiveChannelCategory(
  name: string,
  catName: string,
  lang: string
): XtreamIntegratedTdtChannel['category'] {
  const hay = `${name} ${catName}`.toLowerCase();
  if (/\bdazn\b/.test(hay)) return 'dazn';
  if (/\b(?:movistar|m\+|laliga|hypermotion|campeones|vamos)\b/.test(hay)) return 'movistar';
  if (/\bbein\b/.test(hay) && (lang === 'AR' || /[\u0600-\u06FF]|arab|max/i.test(hay))) return 'bein_arabic';
  if (/\bbein\b/.test(hay)) return 'beinsports';
  if (/\bespn\b/.test(hay)) return 'espn';
  if (/\bdsports\b/.test(hay)) return 'dsports';
  if (/\b(?:sky\s*sports|tnt\s*sports|premier\s*sports|bt\s*sport)\b/.test(hay)) return 'uk_sports';
  if (/\b(?:eurosport|deporte|sport|futbol|football|nba|f1|motor|golf|tennis)\b/.test(hay)) return 'noticias_deportes';
  if (/\b(?:cine|movies?|cinema|peliculas|series|axn|warner|amc|hbo|fox|hollywood|tcm|calle\s*13|syfy)\b/.test(hay)) return 'cine_series';
  if (/\b(?:doc|discovery|nat\s*geo|national\s*geo|historia|history|odisea|dmax|animal)\b/.test(hay)) return 'documentales';
  if (/\b(?:news|noticias|24\s*h|cnn|bbc\s*world|al\s*jazeera|euronews|bloomberg)\b/.test(hay)) return 'noticias_intl';
  if (/\b(?:kids|infantil|clan|boing|disney|nick|cartoon)\b/.test(hay)) return 'infantil_autonomicas';
  if (lang === 'EN' && /\b(?:us|usa)\b/i.test(hay)) return 'usa_tv';
  if (['FR', 'PT', 'IT', 'DE'].includes(lang)) return 'europa_tv';
  if (lang === 'ES') return 'entretenimiento';
  return 'belix_live';
}

export function getCachedXtreamProviderCatalogs(): XtreamFullCatalogPayload[] {
  const providers = getAllXtreamProviders();
  const out: XtreamFullCatalogPayload[] = [];
  for (const p of providers) {
    const cache = providerCatalogCaches.get(p.id);
    if (!cache || cache.envFingerprint !== getProviderFingerprint(p)) continue;
    out.push(cache.payload);
  }
  return out;
}

export function getCachedXtreamLiveTdtChannels(): XtreamIntegratedTdtChannel[] {
  const providers = getAllXtreamProviders();
  const out: XtreamIntegratedTdtChannel[] = [];
  const seen = new Set<string>();

  for (const p of providers) {
    const cache = providerCatalogCaches.get(p.id);
    if (!cache || cache.envFingerprint !== getProviderFingerprint(p)) continue;

    const catNameById = new Map(cache.payload.liveCategories.map((c) => [c.id, c.name]));
    for (let idx = 0; idx < cache.payload.liveStreams.length; idx++) {
      const item = cache.payload.liveStreams[idx];
      const dedupeKey = `${p.id}:${item.streamId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const catName = catNameById.get(item.categoryId) || p.name;
      const inferredQuality = inferLiveQualityLabel(item.name, catName);
      const { lang, langLabel, countryCode } = inferLiveLangAndCountry(item.name, catName);
      const category = inferLiveChannelCategory(item.name, catName, lang);
      const shortMark =
        item.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Za-z0-9]/g, '')
          .toUpperCase()
          .slice(0, 4) || 'XTR';

      out.push({
        id: `xtream-${p.id}-${item.streamId}`,
        streamId: item.streamId,
        dial: item.num || 1000 + out.length,
        name: item.name,
        shortMark,
        brandTone: lang === 'ES' ? '#10B981' : '#38BDF8',
        network: p.id === 'primary' ? catName : `${p.name} · ${catName}`,
        category,
        quality: inferredQuality,
        ...(countryCode ? { countryCode } : {}),
        logoUrl: item.streamIcon,
        description: `${p.name} · ${catName} · ${langLabel} · ${inferredQuality}`,
        epgChannelId: item.epgChannelId,
        channels: [
          {
            id: `xtream-trk-${p.id}-${item.streamId}`,
            label: `${p.name} · ${langLabel} · ${inferredQuality}`,
            lang,
            langLabel,
            quality: inferredQuality,
            providerId: p.id,
            providerName: p.name,
            sourceUrl: item.playbackUrl,
            resolverType: 'direct_hls',
          },
        ],
      });
    }
  }

  return out;
}
