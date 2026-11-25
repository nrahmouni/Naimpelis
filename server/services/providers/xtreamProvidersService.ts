/**
 * @module server/services/providers/xtreamProvidersService
 * @description Multi-server Xtream IPTV / VOD / Series orchestration with auto-connect,
 * automatic account rotation, credential-free DTO projection, and opaque stream proxying.
 */
import type express from 'express';
import { Readable } from 'stream';
import {
  buildXtreamM3uUrl,
  buildXtreamMediaUrl,
  buildXtreamPlayerApiUrl,
  normalizeXtreamOrigin,
  providersConfig as serverDefaultProvidersConfig,
  type XtreamAccountCredential,
  type XtreamProviderConfig,
} from '../../config/defaultProviders.ts';
import { getAllXtreamProviders } from '../providersConfig.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { logger } from '../../utils/logger.ts';
import {
  ensureLiveDvbCleanHlsSession,
  readLiveDvbPlaylistForIptv,
} from '../../routes/proxies/dvbTranscoder.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from '../../routes/proxies/proxyUtils.ts';
import {
  buildProviderStreamUrl,
  detectProviderItemLangAndQuality,
  extractYearHint,
  fetchProviderJsonWithFallback,
  fetchProviderPlaylistText,
  isDisallowedAdultItem,
  parseM3uPlusIntoCatalog,
  rewriteProviderPlaylistWithOpaqueTokens,
  sanitizeExtension,
  sanitizePublicImageUrl,
  sortCatalogItemsForDisplay,
} from './xtreamProvidersHelpers.ts';
import type {
  ProviderCatalogItemPublic,
  ProviderCatalogQueryResult,
  ProviderCategoryPublic,
  ProviderMediaKind,
  ProviderSeriesDetailPublic,
  ProviderSeriesEpisodePublic,
  ProvidersStatusSummaryPublic,
  ProviderStatusPublic,
} from './xtreamProvidersTypes.ts';

interface ProviderRuntimeState {
  config: XtreamProviderConfig;
  connected: boolean;
  connecting: boolean;
  activeAccountIndex: number;
  liveCategories: ProviderCategoryPublic[];
  movieCategories: ProviderCategoryPublic[];
  seriesCategories: ProviderCategoryPublic[];
  liveItems: ProviderCatalogItemPublic[];
  movieItems: ProviderCatalogItemPublic[];
  seriesItems: ProviderCatalogItemPublic[];
  lastSyncedAt?: number;
  error?: string;
  connectPromise?: Promise<ProviderStatusPublic>;
}

const DEFAULT_PROVIDER_ACCENTS: Record<string, string> = {
  primary: '#E50914',
  vod4k: '#7C3AED',
  '24tv': '#06B6D4',
  '2m2h': '#0EA5E9',
  '2m2h-alt': '#38BDF8',
  dana4k: '#F59E0B',
  activecdns: '#10B981',
  octopus: '#3B82F6',
  adtupac: '#10B981',
  'ultra-vip': '#F97316',
  'sult-vo': '#F43F5E',
};

function getUnifiedProviderConfigs(): XtreamProviderConfig[] {
  const accentById = new Map<string, string>(Object.entries(DEFAULT_PROVIDER_ACCENTS));
  for (const cfg of serverDefaultProvidersConfig) {
    if (cfg.accentColor) accentById.set(cfg.id, cfg.accentColor);
  }
  const unified: XtreamProviderConfig[] = [];
  const seen = new Set<string>();
  for (const def of getAllXtreamProviders()) {
    if (!def.serverUrl || def.accounts.length === 0 || seen.has(def.id)) continue;
    seen.add(def.id);
    unified.push({
      id: def.id,
      name: def.name,
      serverUrl: def.serverUrl,
      autoConnect: true,
      accentColor: accentById.get(def.id) || '#38BDF8',
      accounts: def.accounts.map((a) => ({ username: a.username, password: a.password })),
    });
  }
  return unified;
}

const runtimeStates = new Map<string, ProviderRuntimeState>();

function ensureRuntimeState(config: XtreamProviderConfig): ProviderRuntimeState {
  let st = runtimeStates.get(config.id);
  if (!st) {
    st = {
      config,
      connected: false,
      connecting: false,
      activeAccountIndex: 0,
      liveCategories: [],
      movieCategories: [],
      seriesCategories: [],
      liveItems: [],
      movieItems: [],
      seriesItems: [],
      lastSyncedAt: undefined,
      error: undefined,
    };
    runtimeStates.set(config.id, st);
  } else {
    st.config = config;
  }
  return st;
}

for (const cfg of getUnifiedProviderConfigs()) {
  ensureRuntimeState(cfg);
}

function getOrderedAccountCandidates(
  accounts: XtreamAccountCredential[],
  startIndex = 0
): Array<{ index: number; account: XtreamAccountCredential }> {
  if (!accounts.length) return [];
  const safeStart = ((startIndex % accounts.length) + accounts.length) % accounts.length;
  const out: Array<{ index: number; account: XtreamAccountCredential }> = [];
  for (let i = 0; i < accounts.length; i++) {
    const idx = (safeStart + i) % accounts.length;
    out.push({ index: idx, account: accounts[idx] });
  }
  return out;
}

function isAuthorizedUserInfo(userInfo: any): {
  authorized: boolean;
  hasFreeSlot: boolean;
  reason?: string;
} {
  if (!userInfo || typeof userInfo !== 'object') {
    return { authorized: false, hasFreeSlot: false, reason: 'auth_missing' };
  }
  if (Number(userInfo.auth) === 0) {
    return { authorized: false, hasFreeSlot: false, reason: 'auth_rejected' };
  }
  const status = String(userInfo.status || '').trim().toLowerCase();
  if (status && ['expired', 'disabled', 'banned', 'suspended'].includes(status)) {
    return { authorized: false, hasFreeSlot: false, reason: `status_${status}` };
  }
  const active = Number(userInfo.active_cons ?? 0);
  const max = Number(userInfo.max_connections ?? 1);
  const hasFreeSlot = !Number.isFinite(max) || max <= 0 ? true : active < max;
  return { authorized: true, hasFreeSlot };
}

function toPublicStatus(st: ProviderRuntimeState): ProviderStatusPublic {
  return {
    id: st.config.id,
    name: st.config.name,
    accentColor: st.config.accentColor,
    autoConnect: st.config.autoConnect,
    connected: st.connected,
    connecting: st.connecting,
    accountCount: st.config.accounts.length,
    activeAccountSlot: st.config.accounts.length > 0 ? st.activeAccountIndex + 1 : 0,
    liveCount: st.liveItems.length,
    movieCount: st.movieItems.length,
    seriesCount: st.seriesItems.length,
    totalCount: st.liveItems.length + st.movieItems.length + st.seriesItems.length,
    liveCategories: st.liveCategories,
    movieCategories: st.movieCategories,
    seriesCategories: st.seriesCategories,
    lastSyncedAt: st.lastSyncedAt,
    error: st.error,
  };
}

function buildCategoriesWithCounts(
  rawCategories: unknown,
  items: ProviderCatalogItemPublic[],
  kind: ProviderMediaKind
): { cats: ProviderCategoryPublic[]; nameMap: Map<string, string> } {
  const nameMap = new Map<string, string>();
  const orderedIds: string[] = [];
  if (Array.isArray(rawCategories)) {
    for (const row of rawCategories) {
      const id = String((row as any)?.category_id ?? '').trim();
      const name = String((row as any)?.category_name ?? '').trim();
      if (!id || !name || isDisallowedAdultItem(name, '')) continue;
      if (!nameMap.has(id)) {
        nameMap.set(id, name);
        orderedIds.push(id);
      }
    }
  }
  const counts = new Map<string, number>();
  for (const item of items) {
    const cid = item.categoryId || 'general';
    counts.set(cid, (counts.get(cid) || 0) + 1);
    if (!nameMap.has(cid)) {
      nameMap.set(cid, item.categoryName || 'General');
      orderedIds.push(cid);
    }
  }
  const cats: ProviderCategoryPublic[] = [];
  for (const id of orderedIds) {
    const count = counts.get(id) || 0;
    if (count > 0) {
      cats.push({ id, name: nameMap.get(id) || 'General', kind, count });
    }
  }
  return { cats, nameMap };
}

async function fetchFullCatalogForAccount(
  provider: XtreamProviderConfig,
  account: XtreamAccountCredential
): Promise<{
  liveItems: ProviderCatalogItemPublic[];
  movieItems: ProviderCatalogItemPublic[];
  seriesItems: ProviderCatalogItemPublic[];
  liveCategories: ProviderCategoryPublic[];
  movieCategories: ProviderCategoryPublic[];
  seriesCategories: ProviderCategoryPublic[];
}> {
  const [liveCatRes, liveRes] = await Promise.all([
    fetchProviderJsonWithFallback(
      buildXtreamPlayerApiUrl(provider.serverUrl, account, 'get_live_categories'),
      12_000
    ).catch(() => ({ ok: false, status: 502, data: null })),
    fetchProviderJsonWithFallback(
      buildXtreamPlayerApiUrl(provider.serverUrl, account, 'get_live_streams'),
      24_000,
      { largeCatalog: true }
    ).catch(() => ({ ok: false, status: 502, data: null })),
  ]);

  const [vodCatRes, vodRes] = await Promise.all([
    fetchProviderJsonWithFallback(
      buildXtreamPlayerApiUrl(provider.serverUrl, account, 'get_vod_categories'),
      12_000
    ).catch(() => ({ ok: false, status: 502, data: null })),
    fetchProviderJsonWithFallback(
      buildXtreamPlayerApiUrl(provider.serverUrl, account, 'get_vod_streams'),
      45_000,
      { largeCatalog: true }
    ).catch(() => ({ ok: false, status: 502, data: null })),
  ]);

  const [seriesCatRes, seriesRes] = await Promise.all([
    fetchProviderJsonWithFallback(
      buildXtreamPlayerApiUrl(provider.serverUrl, account, 'get_series_categories'),
      12_000
    ).catch(() => ({ ok: false, status: 502, data: null })),
    fetchProviderJsonWithFallback(
      buildXtreamPlayerApiUrl(provider.serverUrl, account, 'get_series'),
      28_000,
      { largeCatalog: true }
    ).catch(() => ({ ok: false, status: 502, data: null })),
  ]);

  const rawLiveCatMap = new Map<string, string>();
  if (Array.isArray(liveCatRes.data)) {
    for (const c of liveCatRes.data) {
      const id = String(c?.category_id ?? '').trim();
      const name = String(c?.category_name ?? '').trim();
      if (id && name) rawLiveCatMap.set(id, name);
    }
  }
  const rawVodCatMap = new Map<string, string>();
  if (Array.isArray(vodCatRes.data)) {
    for (const c of vodCatRes.data) {
      const id = String(c?.category_id ?? '').trim();
      const name = String(c?.category_name ?? '').trim();
      if (id && name) rawVodCatMap.set(id, name);
    }
  }
  const rawSeriesCatMap = new Map<string, string>();
  if (Array.isArray(seriesCatRes.data)) {
    for (const c of seriesCatRes.data) {
      const id = String(c?.category_id ?? '').trim();
      const name = String(c?.category_name ?? '').trim();
      if (id && name) rawSeriesCatMap.set(id, name);
    }
  }

  let liveItems: ProviderCatalogItemPublic[] = [];
  if (Array.isArray(liveRes.data)) {
    for (const row of liveRes.data) {
      const streamId = String(row?.stream_id ?? '').trim();
      const name = String(row?.name ?? '').trim();
      const categoryId = String(row?.category_id ?? 'general').trim() || 'general';
      const categoryName = rawLiveCatMap.get(categoryId) || 'TV en Directo';
      if (!streamId || !name || isDisallowedAdultItem(categoryName, name)) continue;
      const meta = detectProviderItemLangAndQuality(name, categoryName, 'live');
      liveItems.push({
        id: `${provider.id}:live:${streamId}`,
        providerId: provider.id,
        providerName: provider.name,
        kind: 'live',
        streamId,
        name,
        categoryId,
        categoryName,
        lang: meta.lang,
        langLabel: meta.langLabel,
        quality: meta.quality,
        qualityTier: meta.qualityTier,
        poster: sanitizePublicImageUrl(row?.stream_icon),
        containerExtension: 'm3u8',
        streamUrl: buildProviderStreamUrl(provider.id, 'live', streamId, 'm3u8'),
      });
    }
  }

  let movieItems: ProviderCatalogItemPublic[] = [];
  if (Array.isArray(vodRes.data)) {
    for (const row of vodRes.data) {
      const streamId = String(row?.stream_id ?? '').trim();
      const name = String(row?.name ?? '').trim();
      const categoryId = String(row?.category_id ?? 'general').trim() || 'general';
      const categoryName = rawVodCatMap.get(categoryId) || 'Películas';
      if (!streamId || !name || isDisallowedAdultItem(categoryName, name)) continue;
      const ext = sanitizeExtension(row?.container_extension, 'mp4');
      const meta = detectProviderItemLangAndQuality(name, categoryName, 'movie', ext);
      movieItems.push({
        id: `${provider.id}:movie:${streamId}`,
        providerId: provider.id,
        providerName: provider.name,
        kind: 'movie',
        streamId,
        name,
        categoryId,
        categoryName,
        lang: meta.lang,
        langLabel: meta.langLabel,
        quality: meta.quality,
        qualityTier: meta.qualityTier,
        poster: sanitizePublicImageUrl(row?.stream_icon),
        rating: row?.rating ? String(row.rating).trim() : undefined,
        year: extractYearHint(name, row?.added),
        containerExtension: ext,
        streamUrl: buildProviderStreamUrl(provider.id, 'movie', streamId, ext),
      });
    }
  }

  const seriesItems: ProviderCatalogItemPublic[] = [];
  if (Array.isArray(seriesRes.data)) {
    for (const row of seriesRes.data) {
      const seriesId = String(row?.series_id ?? '').trim();
      const name = String(row?.name ?? '').trim();
      const categoryId = String(row?.category_id ?? 'general').trim() || 'general';
      const categoryName = rawSeriesCatMap.get(categoryId) || 'Series';
      if (!seriesId || !name || isDisallowedAdultItem(categoryName, name)) continue;
      const meta = detectProviderItemLangAndQuality(name, categoryName, 'series');
      seriesItems.push({
        id: `${provider.id}:series:${seriesId}`,
        providerId: provider.id,
        providerName: provider.name,
        kind: 'series',
        streamId: seriesId,
        name,
        categoryId,
        categoryName,
        lang: meta.lang,
        langLabel: meta.langLabel,
        quality: meta.quality,
        qualityTier: meta.qualityTier,
        poster: sanitizePublicImageUrl(row?.cover),
        rating: row?.rating ? String(row.rating).trim() : undefined,
        year: extractYearHint(name, row?.releaseDate || row?.last_modified),
        plot: row?.plot ? String(row.plot).trim().slice(0, 260) : undefined,
        streamUrl: '',
      });
    }
  }

  // Fallback to get.php M3U Plus if JSON live + vod endpoints both returned empty
  if (liveItems.length === 0 && movieItems.length === 0) {
    try {
      const m3uUrl = buildXtreamM3uUrl(provider.serverUrl, account);
      await assertSafeProxyUrl(m3uUrl);
      const m3uRes = await streamingFetch(m3uUrl, {
        headers: { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' },
        timeoutMs: 14000,
      });
      if (m3uRes.ok) {
        const text = await m3uRes.text();
        if (text.includes('#EXTM3U')) {
          const parsed = parseM3uPlusIntoCatalog(text);
          liveItems = parsed.live.map((item) => {
            const meta = detectProviderItemLangAndQuality(item.name, item.categoryName, 'live');
            return {
              id: `${provider.id}:live:${item.streamId}`,
              providerId: provider.id,
              providerName: provider.name,
              kind: 'live',
              streamId: item.streamId,
              name: item.name,
              categoryId: item.categoryId,
              categoryName: item.categoryName,
              lang: meta.lang,
              langLabel: meta.langLabel,
              quality: meta.quality,
              qualityTier: meta.qualityTier,
              poster: item.poster,
              containerExtension: 'm3u8',
              streamUrl: buildProviderStreamUrl(provider.id, 'live', item.streamId, 'm3u8'),
            };
          });
          movieItems = parsed.movies.map((item) => {
            const meta = detectProviderItemLangAndQuality(item.name, item.categoryName, 'movie', item.ext);
            return {
              id: `${provider.id}:movie:${item.streamId}`,
              providerId: provider.id,
              providerName: provider.name,
              kind: 'movie',
              streamId: item.streamId,
              name: item.name,
              categoryId: item.categoryId,
              categoryName: item.categoryName,
              lang: meta.lang,
              langLabel: meta.langLabel,
              quality: meta.quality,
              qualityTier: meta.qualityTier,
              poster: item.poster,
              year: extractYearHint(item.name),
              containerExtension: item.ext,
              streamUrl: buildProviderStreamUrl(provider.id, 'movie', item.streamId, item.ext),
            };
          });
        }
      }
    } catch {
      // keep empty fallback cleanly
    }
  }

  liveItems = sortCatalogItemsForDisplay(liveItems);
  movieItems = sortCatalogItemsForDisplay(movieItems);
  sortCatalogItemsForDisplay(seriesItems);

  const liveCats = buildCategoriesWithCounts(liveCatRes.data, liveItems, 'live').cats;
  const movieCats = buildCategoriesWithCounts(vodCatRes.data, movieItems, 'movie').cats;
  const seriesCats = buildCategoriesWithCounts(seriesCatRes.data, seriesItems, 'series').cats;

  return {
    liveItems,
    movieItems,
    seriesItems,
    liveCategories: liveCats,
    movieCategories: movieCats,
    seriesCategories: seriesCats,
  };
}

export async function connectProviderWithRotation(
  providerId: string,
  opts?: { force?: boolean; startOffset?: number }
): Promise<ProviderStatusPublic> {
  const configs = getUnifiedProviderConfigs();
  const provider = configs.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const st = ensureRuntimeState(provider);
  if (st.connectPromise && !opts?.force) {
    return st.connectPromise;
  }

  const run = async (): Promise<ProviderStatusPublic> => {
    st.connecting = true;
    st.error = undefined;

    try {
      const origin = normalizeXtreamOrigin(provider.serverUrl);
      await assertSafeProxyUrl(origin);

      const startIndex =
        typeof opts?.startOffset === 'number'
          ? (st.activeAccountIndex + opts.startOffset) % provider.accounts.length
          : st.activeAccountIndex;
      const candidates = getOrderedAccountCandidates(provider.accounts, startIndex);

      let chosen: { index: number; account: XtreamAccountCredential } | null = null;
      let fallbackAuthorized: { index: number; account: XtreamAccountCredential } | null = null;
      let lastReason = 'connection_failed';

      for (const candidate of candidates) {
        const authUrl = buildXtreamPlayerApiUrl(provider.serverUrl, candidate.account);
        let authRes = await fetchProviderJsonWithFallback(authUrl, 10_000).catch(() => ({
          ok: false,
          status: 502,
          data: null,
        }));
        if ((!authRes.ok || !authRes.data) && (!authRes.status || authRes.status >= 500)) {
          await new Promise((r) => setTimeout(r, 120));
          authRes = await fetchProviderJsonWithFallback(authUrl, 12_000).catch(() => ({
            ok: false,
            status: 502,
            data: null,
          }));
        }
        if (!authRes.ok || !authRes.data) {
          lastReason = `http_${authRes.status || 502}`;
          logger.info(
            { providerId: provider.id, accountSlot: candidate.index + 1, status: authRes.status },
            'provider_account_probe_failed_rotating'
          );
          continue;
        }
        const check = isAuthorizedUserInfo(authRes.data?.user_info);
        if (!check.authorized) {
          lastReason = check.reason || 'unauthorized';
          logger.info(
            { providerId: provider.id, accountSlot: candidate.index + 1, reason: lastReason },
            'provider_account_rejected_rotating'
          );
          continue;
        }
        if (check.hasFreeSlot) {
          chosen = candidate;
          break;
        }
        if (!fallbackAuthorized) {
          fallbackAuthorized = candidate;
        }
      }

      const winner = chosen || fallbackAuthorized;
      if (!winner) {
        st.connected = false;
        st.error = `No hay cuentas disponibles (${lastReason})`;
        logger.warn({ providerId: provider.id, reason: lastReason }, 'provider_all_accounts_unavailable');
        return toPublicStatus(st);
      }

      st.activeAccountIndex = winner.index;
      const catalog = await fetchFullCatalogForAccount(provider, winner.account);
      st.liveItems = catalog.liveItems;
      st.movieItems = catalog.movieItems;
      st.seriesItems = catalog.seriesItems;
      st.liveCategories = catalog.liveCategories;
      st.movieCategories = catalog.movieCategories;
      st.seriesCategories = catalog.seriesCategories;
      st.connected = true;
      st.lastSyncedAt = Date.now();
      st.error = undefined;

      logger.info(
        {
          providerId: provider.id,
          accountSlot: winner.index + 1,
          live: st.liveItems.length,
          movies: st.movieItems.length,
          series: st.seriesItems.length,
        },
        'provider_connected_catalog_loaded'
      );
      return toPublicStatus(st);
    } catch (err) {
      st.connected = false;
      st.error = err instanceof Error ? err.message : 'Error de conexión con servidor';
      logger.warn({ providerId: provider.id, err: st.error }, 'provider_connect_error');
      return toPublicStatus(st);
    } finally {
      st.connecting = false;
      st.connectPromise = undefined;
    }
  };

  st.connectPromise = run();
  return st.connectPromise;
}

export async function initDefaultProviders(opts?: { force?: boolean }): Promise<ProviderStatusPublic[]> {
  const targets = getUnifiedProviderConfigs().filter((p) => p.autoConnect);
  const results: ProviderStatusPublic[] = [];
  let cursor = 0;
  const workerCount = Math.min(5, targets.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < targets.length) {
      const idx = cursor++;
      const provider = targets[idx];
      try {
        const status = await connectProviderWithRotation(provider.id, { force: opts?.force });
        results[idx] = status;
      } catch {
        // handled cleanly by connectProviderWithRotation
      }
    }
  });

  await Promise.all(workers);
  return results.filter(Boolean);
}

export function rotateProviderAccount(providerId: string, failedIndex?: number): number {
  const st = runtimeStates.get(providerId);
  if (!st || st.config.accounts.length <= 1) return 0;
  const base = typeof failedIndex === 'number' ? failedIndex : st.activeAccountIndex;
  const next = (base + 1) % st.config.accounts.length;
  st.activeAccountIndex = next;
  return next;
}

export function getProvidersStatusSummary(): ProvidersStatusSummaryPublic {
  const configs = getUnifiedProviderConfigs();
  const providers = configs.map((cfg) => toPublicStatus(ensureRuntimeState(cfg)));
  let liveCount = 0;
  let movieCount = 0;
  let seriesCount = 0;
  let connectedCount = 0;
  for (const p of providers) {
    liveCount += p.liveCount;
    movieCount += p.movieCount;
    seriesCount += p.seriesCount;
    if (p.connected) connectedCount += 1;
  }
  return {
    providers,
    totals: {
      liveCount,
      movieCount,
      seriesCount,
      totalCount: liveCount + movieCount + seriesCount,
      connectedCount,
      totalProviders: providers.length,
    },
  };
}

export function queryProvidersCatalog(params: {
  scope?: string;
  kind?: ProviderMediaKind | 'all';
  categoryId?: string;
  lang?: string;
  quality?: string;
  q?: string;
  offset?: number;
  limit?: number;
}): ProviderCatalogQueryResult {
  const scope = String(params.scope || 'total').trim() || 'total';
  const kind: ProviderMediaKind | 'all' =
    params.kind === 'live' || params.kind === 'movie' || params.kind === 'series'
      ? params.kind
      : 'all';
  const categoryId = String(params.categoryId || '').trim();
  const langFilter = String(params.lang || 'all').trim().toUpperCase();
  const qualityFilter = String(params.quality || 'all').trim().toUpperCase();
  const q = String(params.q || '').trim().toLowerCase();
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 60));

  const configs = getUnifiedProviderConfigs();
  const states =
    scope === 'total'
      ? configs.map((cfg) => ensureRuntimeState(cfg))
      : runtimeStates.has(scope)
      ? [runtimeStates.get(scope)!]
      : [];

  let items: ProviderCatalogItemPublic[] = [];
  for (const st of states) {
    if (kind === 'all' || kind === 'live') items.push(...st.liveItems);
    if (kind === 'all' || kind === 'movie') items.push(...st.movieItems);
    if (kind === 'all' || kind === 'series') items.push(...st.seriesItems);
  }

  if (scope === 'total') {
    sortCatalogItemsForDisplay(items);
  }

  if (categoryId && categoryId !== 'all') {
    items = items.filter((item) => item.categoryId === categoryId);
  }
  if (langFilter && langFilter !== 'ALL') {
    items = items.filter((item) => (item.lang || 'INTL').toUpperCase() === langFilter);
  }
  if (qualityFilter && qualityFilter !== 'ALL') {
    items = items.filter((item) => {
      const qLabel = String(item.quality || '').toUpperCase();
      if (qualityFilter === '4K') return qLabel.includes('4K') || qLabel.includes('UHD');
      if (qualityFilter === '1080P' || qualityFilter === 'FHD') return qLabel.includes('1080') || qLabel.includes('FHD');
      if (qualityFilter === 'HD') return qLabel === 'HD' || qLabel.includes('720');
      if (qualityFilter === 'SD') return qLabel === 'SD';
      return true;
    });
  }
  if (q) {
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.providerName.toLowerCase().includes(q) ||
        (item.langLabel || '').toLowerCase().includes(q)
    );
  }

  return {
    scope,
    kind,
    lang: langFilter !== 'ALL' ? langFilter : undefined,
    quality: qualityFilter !== 'ALL' ? qualityFilter : undefined,
    total: items.length,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
  };
}

export async function getProviderSeriesDetail(
  providerId: string,
  seriesId: string
): Promise<ProviderSeriesDetailPublic | null> {
  const st = runtimeStates.get(providerId);
  if (!st || !seriesId) return null;

  const provider = st.config;
  const candidates = getOrderedAccountCandidates(provider.accounts, st.activeAccountIndex);
  let payload: any = null;

  for (const candidate of candidates) {
    const url = buildXtreamPlayerApiUrl(provider.serverUrl, candidate.account, 'get_series_info', {
      series_id: seriesId,
    });
    const res = await fetchProviderJsonWithFallback(url, 10_000).catch(() => ({
      ok: false,
      status: 502,
      data: null,
    }));
    if (res.ok && res.data && (res.data.episodes || res.data.info)) {
      payload = res.data;
      st.activeAccountIndex = candidate.index;
      break;
    }
    if (provider.accounts.length > 1) {
      rotateProviderAccount(providerId, candidate.index);
    }
  }

  if (!payload) return null;

  const info = payload.info || {};
  const episodesObj = payload.episodes && typeof payload.episodes === 'object' ? payload.episodes : {};
  const seasonNums = Object.keys(episodesObj)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  const seasons = seasonNums.map((seasonNumber) => {
    const rawList = Array.isArray(episodesObj[String(seasonNumber)])
      ? episodesObj[String(seasonNumber)]
      : [];
    const episodes: ProviderSeriesEpisodePublic[] = rawList
      .map((ep: any, idx: number): ProviderSeriesEpisodePublic | null => {
        const epId = String(ep?.id ?? '').trim();
        if (!epId) return null;
        const ext = sanitizeExtension(ep?.container_extension, 'mp4');
        const episodeNum = Number(ep?.episode_num || idx + 1);
        return {
          id: epId,
          season: seasonNumber,
          episodeNum,
          title: String(ep?.title || `Episodio ${episodeNum}`).trim(),
          duration: ep?.info?.duration ? String(ep.info.duration).trim() : undefined,
          plot: ep?.info?.plot ? String(ep.info.plot).trim().slice(0, 260) : undefined,
          still: sanitizePublicImageUrl(ep?.info?.movie_image),
          containerExtension: ext,
          streamUrl: buildProviderStreamUrl(provider.id, 'series', epId, ext),
        };
      })
      .filter((e: ProviderSeriesEpisodePublic | null): e is ProviderSeriesEpisodePublic => Boolean(e));

    return {
      seasonNumber,
      name: `Temporada ${seasonNumber}`,
      episodes,
    };
  });

  const cachedMeta = st.seriesItems.find((s) => s.streamId === seriesId);
  const backdropList = Array.isArray(info?.backdrop_path) ? info.backdrop_path : [];

  return {
    providerId: provider.id,
    providerName: provider.name,
    seriesId,
    title: String(info?.name || cachedMeta?.name || `Serie ${seriesId}`).trim(),
    poster: sanitizePublicImageUrl(info?.cover) || cachedMeta?.poster,
    backdrop: sanitizePublicImageUrl(backdropList[0]),
    plot: info?.plot ? String(info.plot).trim() : cachedMeta?.plot,
    genre: info?.genre ? String(info.genre).trim() : undefined,
    year: extractYearHint(String(info?.name || ''), info?.releaseDate) || cachedMeta?.year,
    rating: info?.rating ? String(info.rating).trim() : cachedMeta?.rating,
    seasons,
  };
}

export async function resolveProviderLiveManifest(
  providerId: string,
  streamId: string,
  originPrefix = ''
): Promise<string | null> {
  const st = runtimeStates.get(providerId);
  if (!st || !streamId) return null;

  const provider = st.config;
  const origin = normalizeXtreamOrigin(provider.serverUrl);
  const referer = `${origin}/`;
  const candidates = getOrderedAccountCandidates(provider.accounts, st.activeAccountIndex);

  for (const candidate of candidates) {
    const m3u8Url = buildXtreamMediaUrl(provider.serverUrl, candidate.account, 'live', streamId, 'm3u8');
    const loaded = await fetchProviderPlaylistText(m3u8Url, referer, 3500).catch(() => null);
    if (loaded) {
      st.activeAccountIndex = candidate.index;
      return rewriteProviderPlaylistWithOpaqueTokens(
        loaded.text,
        loaded.baseUrl,
        referer,
        originPrefix
      );
    }

    const tsUrl = buildXtreamMediaUrl(provider.serverUrl, candidate.account, 'live', streamId, 'ts');
    try {
      await assertSafeProxyUrl(tsUrl);
      const dvbPath = await ensureLiveDvbCleanHlsSession(tsUrl, 'hd', referer).catch(() => null);
      if (dvbPath) {
        const playlist = readLiveDvbPlaylistForIptv(dvbPath, originPrefix);
        if (playlist) {
          st.activeAccountIndex = candidate.index;
          return playlist;
        }
      }
    } catch {
      // rotate to next account
    }

    if (provider.accounts.length > 1) {
      rotateProviderAccount(providerId, candidate.index);
    }
  }

  return null;
}

export async function streamProviderVodOrSeries(
  providerId: string,
  kind: 'movie' | 'series',
  streamId: string,
  ext: string,
  req: express.Request,
  res: express.Response
): Promise<void> {
  const reqId = getOrCreateRequestId(req);
  const st = runtimeStates.get(providerId);
  if (!st || !streamId) {
    res.status(404).end();
    return;
  }

  const provider = st.config;
  const origin = normalizeXtreamOrigin(provider.serverUrl);
  const candidates = getOrderedAccountCandidates(provider.accounts, st.activeAccountIndex);
  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
  const cleanExt = sanitizeExtension(ext, 'mp4');

  for (const candidate of candidates) {
    const upstreamUrl = buildXtreamMediaUrl(
      provider.serverUrl,
      candidate.account,
      kind,
      streamId,
      cleanExt
    );
    try {
      await assertSafeProxyUrl(upstreamUrl);
      const headers: Record<string, string> = {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: '*/*',
        Referer: `${origin}/`,
      };
      if (rangeHeader) headers['Range'] = rangeHeader;

      const controller = new AbortController();
      const onClose = () => controller.abort();
      req.once('close', onClose);

      const upstream = await fetch(upstreamUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });

      if (upstream.url) {
        await assertSafeProxyUrl(upstream.url);
      }

      if (upstream.ok || upstream.status === 206) {
        st.activeAccountIndex = candidate.index;
        applyProxyCorsHeaders(res, reqId);
        res.status(upstream.status);
        const contentType =
          upstream.headers.get('content-type') ||
          (cleanExt === 'mkv' ? 'video/x-matroska' : 'video/mp4');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (req.method === 'HEAD' || !upstream.body) {
          req.off('close', onClose);
          res.end();
          return;
        }

        const nodeStream = Readable.fromWeb(upstream.body as any);
        nodeStream.on('error', () => {
          if (!res.writableEnded) res.end();
        });
        res.on('close', () => {
          req.off('close', onClose);
          nodeStream.destroy();
          controller.abort();
        });
        nodeStream.pipe(res);
        return;
      }

      await upstream.body?.cancel?.().catch(() => {});
      req.off('close', onClose);
    } catch {
      // rotate to next account on connection/auth failure
    }

    if (provider.accounts.length > 1) {
      rotateProviderAccount(providerId, candidate.index);
    }
  }

  if (!res.writableEnded) {
    res.status(502).json({ success: false, error: 'Stream temporalmente no disponible.' });
  }
}
