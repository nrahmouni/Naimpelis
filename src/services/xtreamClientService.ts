/**
 * @module src/services/xtreamClientService
 * @description Multi-provider frontend client for the server-side Xtream Codes proxy (/api/xtream/*).
 * Provides per-provider 6-hour localStorage caching for full Live/VOD/Series catalogs without
 * storing or exposing any raw server URLs, usernames, or passwords.
 */
import { ensureVaultSyncedWithBackend } from './xtreamVaultConfig';
import { XTREAM_PROVIDER_UI_SPECS } from '../config/defaultProviders';

export interface XtreamAccountAttemptSummary {
  accountNumber: number;
  status: 'active' | 'inactive' | 'error';
  detail: string;
}

export interface XtreamProviderPublicSummary {
  id: string;
  name: string;
  configured: boolean;
  totalAccounts: number;
  defaultMediaFocus: 'live' | 'vod' | 'series';
}

export interface XtreamMaskedStatus {
  providerId?: string;
  providerName?: string;
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
  providerId?: string;
  providerName?: string;
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
  providerId?: string;
  providerName?: string;
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
  providerId?: string;
  providerName?: string;
}

export interface XtreamSeriesEpisodeItem {
  id: string;
  episodeNum: number;
  seasonNum: number;
  title: string;
  containerExtension: string;
  duration?: string;
  plot?: string;
  playbackUrl: string;
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
  cover?: string;
  plot?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  seasons: XtreamSeriesSeasonGroup[];
}

export interface XtreamProviderCountBreakdown {
  id: string;
  name: string;
  liveChannels: number;
  vodMovies: number;
  series: number;
  total: number;
}

export interface XtreamFullCatalogPayload {
  providerId?: string;
  providerName?: string;
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
  providers?: XtreamProviderDiagnosticSummary[];
  checkedAt: number;
  error?: string;
}

export const XTREAM_CATALOG_STORAGE_PREFIX = 'riffan_xtream_catalog_cache_v2_';
export const XTREAM_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeProviderKey(providerId = 'primary'): string {
  const clean = String(providerId || 'primary').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '');
  return clean || 'primary';
}

function getStorageKey(providerId = 'primary'): string {
  return `${XTREAM_CATALOG_STORAGE_PREFIX}${normalizeProviderKey(providerId)}`;
}

export function readCachedXtreamCatalog(providerId = 'primary'): XtreamFullCatalogPayload | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const key = getStorageKey(providerId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; catalog?: XtreamFullCatalogPayload };
    if (!parsed?.catalog || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > XTREAM_CATALOG_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { ...parsed.catalog, fromCache: true };
  } catch {
    return null;
  }
}

function compactByProvider<T extends { providerId?: string }>(items: T[], maxTotal: number): T[] {
  if (items.length <= maxTotal) return items;
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = item.providerId || 'primary';
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(item);
  }
  const perBucket = Math.max(150, Math.floor(maxTotal / Math.max(1, buckets.size)));
  const out: T[] = [];
  for (const list of buckets.values()) {
    out.push(...list.slice(0, perBucket));
  }
  return out.slice(0, maxTotal);
}

export function writeCachedXtreamCatalog(
  catalog: XtreamFullCatalogPayload,
  providerId = catalog.providerId || 'primary'
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const key = getStorageKey(providerId);
  const savedAt = Date.now();
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt, catalog }));
    return;
  } catch {
    // Fallback to balanced per-provider compaction if localStorage quota is exceeded
  }
  try {
    const entry = JSON.stringify({
      savedAt,
      catalog: {
        ...catalog,
        liveStreams: compactByProvider(catalog.liveStreams, 3500),
        vodStreams: compactByProvider(catalog.vodStreams, 2500),
        series: compactByProvider(catalog.series, 1500),
      },
    });
    window.localStorage.setItem(key, entry);
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function clearCachedXtreamCatalog(providerId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (providerId) {
      window.localStorage.removeItem(getStorageKey(providerId));
      return;
    }
    window.localStorage.removeItem('riffan_xtream_catalog_cache_v1');
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(XTREAM_CATALOG_STORAGE_PREFIX)) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}

export async function fetchXtreamProviders(): Promise<XtreamProviderPublicSummary[]> {
  await ensureVaultSyncedWithBackend().catch(() => false);
  try {
    const res = await fetch('/api/xtream/providers', { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      providers?: XtreamProviderPublicSummary[];
    } | null;
    if (res.ok && json?.success && Array.isArray(json.providers)) {
      return json.providers;
    }
  } catch {
    // fallback below
  }
  return XTREAM_PROVIDER_UI_SPECS.map((spec) => ({
    id: spec.providerId,
    name: spec.name,
    configured: false,
    totalAccounts: 0,
    defaultMediaFocus: spec.defaultMediaFocus,
  }));
}

export async function fetchXtreamStatus(
  refresh = false,
  providerId = 'primary'
): Promise<XtreamMaskedStatus> {
  await ensureVaultSyncedWithBackend(refresh).catch(() => false);
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', '1');
  if (providerId && providerId !== 'primary') params.set('provider', normalizeProviderKey(providerId));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/xtream/status${qs}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as {
    status?: XtreamMaskedStatus;
    error?: string;
  } | null;

  if (json?.status) {
    return json.status;
  }

  return {
    providerId: normalizeProviderKey(providerId),
    configured: false,
    connected: false,
    accountNumber: null,
    totalAccounts: 0,
    accountLabel: 'Sin conexión',
    serverLabel: 'Servidor no disponible',
    maskedUsername: '********',
    userStatus: 'Unavailable',
    attempts: [],
    error: json?.error || 'No se pudo consultar el estado del servicio Xtream.',
  };
}

export async function fetchXtreamFullCatalog(
  forceRefresh = false,
  providerId = 'primary'
): Promise<{
  ok: boolean;
  catalog?: XtreamFullCatalogPayload;
  status?: XtreamMaskedStatus;
  error?: string;
}> {
  const cleanProvider = normalizeProviderKey(providerId);
  if (!forceRefresh) {
    const localCached = readCachedXtreamCatalog(cleanProvider);
    if (localCached) {
      return { ok: true, catalog: localCached };
    }
  } else {
    clearCachedXtreamCatalog(cleanProvider);
  }

  await ensureVaultSyncedWithBackend(forceRefresh).catch(() => false);

  const params = new URLSearchParams();
  if (forceRefresh) params.set('refresh', '1');
  if (cleanProvider !== 'primary') params.set('provider', cleanProvider);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`/api/xtream/catalog${qs}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    catalog?: XtreamFullCatalogPayload;
    status?: XtreamMaskedStatus;
    error?: string;
  } | null;

  if (!res.ok || !json?.success || !json.catalog) {
    return {
      ok: false,
      status: json?.status,
      error: json?.error || 'Ninguna cuenta Xtream activa disponible.',
    };
  }

  writeCachedXtreamCatalog(json.catalog, cleanProvider);
  return {
    ok: true,
    catalog: json.catalog,
  };
}

export async function runXtreamConnectionTest(forceRefresh = true): Promise<XtreamDiagnosticReport> {
  await ensureVaultSyncedWithBackend(forceRefresh).catch(() => false);
  const qs = forceRefresh ? '?refresh=1' : '';
  const res = await fetch(`/api/xtream/test-connection${qs}`, {
    method: 'POST',
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as {
    report?: XtreamDiagnosticReport;
    error?: string;
  } | null;

  if (json?.report) {
    return json.report;
  }

  return {
    configured: false,
    connected: false,
    serverLabel: 'Error ejecutando prueba',
    totalAccounts: 0,
    accounts: [],
    activeAccountSummary: null,
    catalogCounts: {
      liveChannels: 0,
      vodMovies: 0,
      series: 0,
      liveCategories: 0,
      vodCategories: 0,
      seriesCategories: 0,
    },
    providers: [],
    checkedAt: Date.now(),
    error: json?.error || 'No se pudo completar la prueba de conexión.',
  };
}

export async function fetchXtreamCategories(providerId = 'primary'): Promise<{
  ok: boolean;
  liveCategories: XtreamCategoryItem[];
  vodCategories: XtreamCategoryItem[];
  error?: string;
}> {
  const cleanProvider = normalizeProviderKey(providerId);
  const qs = cleanProvider !== 'primary' ? `?provider=${encodeURIComponent(cleanProvider)}` : '';
  const res = await fetch(`/api/xtream/categories${qs}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    liveCategories?: XtreamCategoryItem[];
    vodCategories?: XtreamCategoryItem[];
    error?: string;
  } | null;

  if (!res.ok || !json?.success) {
    return {
      ok: false,
      liveCategories: [],
      vodCategories: [],
      error: json?.error || 'Ninguna cuenta Xtream activa disponible.',
    };
  }

  return {
    ok: true,
    liveCategories: Array.isArray(json.liveCategories) ? json.liveCategories : [],
    vodCategories: Array.isArray(json.vodCategories) ? json.vodCategories : [],
  };
}

export async function fetchXtreamLiveStreams(
  categoryId?: string,
  providerId = 'primary'
): Promise<{
  ok: boolean;
  streams: XtreamLiveStreamItem[];
  error?: string;
}> {
  const params = new URLSearchParams();
  if (categoryId && categoryId !== 'all') params.set('categoryId', categoryId);
  const cleanProvider = normalizeProviderKey(providerId);
  if (cleanProvider !== 'primary') params.set('provider', cleanProvider);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`/api/xtream/streams${qs}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    streams?: XtreamLiveStreamItem[];
    error?: string;
  } | null;

  if (!res.ok || !json?.success) {
    return {
      ok: false,
      streams: [],
      error: json?.error || 'No se pudieron cargar los canales de esta categoría.',
    };
  }

  return {
    ok: true,
    streams: Array.isArray(json.streams) ? json.streams : [],
  };
}

export async function fetchXtreamSeriesInfo(
  seriesId: string,
  providerId = 'primary'
): Promise<{
  ok: boolean;
  info?: XtreamSeriesInfoPayload;
  error?: string;
}> {
  const cleanId = String(seriesId || '').trim();
  const cleanProvider = normalizeProviderKey(providerId);
  if (!cleanId) {
    return { ok: false, error: 'Identificador de serie no válido.' };
  }
  await ensureVaultSyncedWithBackend(false).catch(() => false);
  const params = new URLSearchParams({ series_id: cleanId });
  if (cleanProvider !== 'primary') params.set('provider', cleanProvider);

  try {
    const res = await fetch(`/api/xtream/series-info?${params.toString()}`, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      info?: XtreamSeriesInfoPayload;
      error?: string;
    } | null;
    if (!res.ok || !json?.success || !json.info) {
      return {
        ok: false,
        error: json?.error || 'No se pudieron cargar las temporadas y episodios.',
      };
    }
    return { ok: true, info: json.info };
  } catch {
    return { ok: false, error: 'Error de red cargando episodios de la serie.' };
  }
}

export function computeProviderBreakdownCounts(
  catalog: XtreamFullCatalogPayload | null,
  scopeIds?: string[]
): {
  perServer: XtreamProviderCountBreakdown[];
  totals: {
    liveChannels: number;
    vodMovies: number;
    series: number;
    total: number;
  };
} {
  const allowedSet = scopeIds && scopeIds.length > 0 ? new Set(scopeIds) : null;
  const buckets = new Map<string, XtreamProviderCountBreakdown>();

  for (const spec of XTREAM_PROVIDER_UI_SPECS) {
    if (allowedSet && !allowedSet.has(spec.providerId)) continue;
    buckets.set(spec.providerId, {
      id: spec.providerId,
      name: spec.name,
      liveChannels: 0,
      vodMovies: 0,
      series: 0,
      total: 0,
    });
  }

  const ensureBucket = (id?: string, name?: string): XtreamProviderCountBreakdown | null => {
    const key = normalizeProviderKey(id || 'primary');
    if (allowedSet && !allowedSet.has(key)) return null;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        id: key,
        name: name || key.toUpperCase(),
        liveChannels: 0,
        vodMovies: 0,
        series: 0,
        total: 0,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  if (catalog) {
    for (const s of catalog.liveStreams) {
      const b = ensureBucket(s.providerId, s.providerName);
      if (b) {
        b.liveChannels += 1;
        b.total += 1;
      }
    }
    for (const v of catalog.vodStreams) {
      const b = ensureBucket(v.providerId, v.providerName);
      if (b) {
        b.vodMovies += 1;
        b.total += 1;
      }
    }
    for (const sr of catalog.series) {
      const b = ensureBucket(sr.providerId, sr.providerName);
      if (b) {
        b.series += 1;
        b.total += 1;
      }
    }
  }

  const perServer = Array.from(buckets.values());
  const totals = perServer.reduce(
    (acc, item) => ({
      liveChannels: acc.liveChannels + item.liveChannels,
      vodMovies: acc.vodMovies + item.vodMovies,
      series: acc.series + item.series,
      total: acc.total + item.total,
    }),
    { liveChannels: 0, vodMovies: 0, series: 0, total: 0 }
  );

  return { perServer, totals };
}

export function getXtreamPlaybackProxyUrl(streamId: string, providerId = 'primary'): string {
  const cleanId = String(streamId || '').replace(/\.m3u8$/i, '').trim();
  const cleanProvider = normalizeProviderKey(providerId);
  return cleanProvider !== 'primary'
    ? `/api/stream?provider=${encodeURIComponent(cleanProvider)}&id=${encodeURIComponent(cleanId)}`
    : `/api/xtream/stream/${encodeURIComponent(cleanId)}.m3u8`;
}

let clientPrewarmStarted = false;

/**
 * Silently prewarms the 6-hour localStorage catalog cache on app boot for all active
 * server-side providers (including DEFAULT_PROVIDERS) without exposing credentials.
 */
export function prewarmXtreamClientCatalogOnStartup(): void {
  if (clientPrewarmStarted || typeof window === 'undefined') return;
  clientPrewarmStarted = true;
  void (async () => {
    const syncedVault = await ensureVaultSyncedWithBackend(false).catch(() => false);
    const cached = readCachedXtreamCatalog('all');
    if (cached && !syncedVault) {
      window.dispatchEvent(new CustomEvent('belix-channels-synced'));
      return;
    }
    const res = await fetchXtreamFullCatalog(syncedVault, 'all').catch(() => ({ ok: false }));
    if (res.ok || syncedVault) {
      window.dispatchEvent(new CustomEvent('belix-channels-synced'));
    }
  })();
}
