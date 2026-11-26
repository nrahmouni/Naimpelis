import crypto from 'node:crypto';
import type express from 'express';
import { Readable } from 'node:stream';
import {
  buildXtreamPlayerApiUrl,
  DEFAULT_PROVIDERS,
  getDefaultProviderById,
  type DefaultProviderConfig,
  type XtreamAccountCredential,
} from '../../../src/config/defaultProviders.ts';
import type {
  ProviderCatalogData,
  ProviderCategoryItem,
  ProviderLiveItem,
  ProviderMovieItem,
  ProviderSeriesEpisodeItem,
  ProviderSeriesInfoResult,
  ProviderSeriesItem,
} from '../../../src/types/providers.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { curlGetBufferWithStatus, curlGetText } from '../../extractors/httpHelpers.ts';
import {
  ensureLiveDvbCleanHlsSession,
  getActiveDvbSessionPath,
  readLiveDvbPlaylistForIptv,
} from '../../routes/proxies/dvbTranscoder.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from '../../routes/proxies/proxyUtils.ts';

const SERVER_SYNC_TTL_MS = 6 * 60 * 60 * 1000;
const XTREAM_ACTION_TIMEOUT_MS = 12_000;
const ARTWORK_SEAL_KEY = crypto
  .createHash('sha256')
  .update(process.env.PROVIDER_ARTWORK_SECRET || 'riffantv-providers-artwork-seal-v1')
  .digest();

const activeAccountIndexMap = new Map<string, number>();
const serverCatalogCache = new Map<string, { data: ProviderCatalogData; expiresAt: number }>();
const inFlightSyncMap = new Map<string, Promise<ProviderCatalogData>>();

interface OpaqueProxyEntry {
  rawUrl: string;
  referer: string;
  ts: number;
  liveSessionKey?: string;
}

interface LiveSessionEntry {
  finalUrl: string;
  referer: string;
  accountIndex: number;
}

interface RollingProviderStreamState {
  mediaSequence: number;
  discontinuitySeq: number;
  nextSeq: number;
  segsByUrl: Map<string, number>;
  updatedAt: number;
}

const opaqueSubPlaylistCache = new LruTtlCache<string, OpaqueProxyEntry>(2500, 15 * 60 * 1000);
const opaqueSegmentCache = new LruTtlCache<string, OpaqueProxyEntry>(8000, 8 * 60 * 1000);
const liveSessionUrlCache = new LruTtlCache<string, LiveSessionEntry>(400, 90_000);
const liveRollingSeqCache = new LruTtlCache<string, RollingProviderStreamState>(400, 120_000);

const KNOWN_PROVIDER_HOSTNAMES = new Set(
  DEFAULT_PROVIDERS.map((p) => {
    try {
      return new URL(p.baseUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  }).filter(Boolean)
);

function createOpaqueToken(rawUrl: string): string {
  return crypto.createHash('sha1').update(rawUrl).digest('hex').slice(0, 20);
}

export function encryptOpaqueArtworkToken(rawUrl: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ARTWORK_SEAL_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(rawUrl, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptOpaqueArtworkToken(token: string): string | null {
  try {
    const raw = Buffer.from(String(token || '').trim(), 'base64url');
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ARTWORK_SEAL_KEY, iv);
    decipher.setAuthTag(tag);
    const decoded = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = new URL(decoded);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function sanitizeProviderArtworkUrl(rawValue: unknown): string {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && !KNOWN_PROVIDER_HOSTNAMES.has(hostname)) {
      return parsed.href;
    }
    return `/api/providers/artwork?k=${encodeURIComponent(encryptOpaqueArtworkToken(parsed.href))}`;
  } catch {
    return '';
  }
}

export function getRotatedAccountOrder(provider: DefaultProviderConfig): Array<{
  account: XtreamAccountCredential;
  index: number;
}> {
  const count = provider.accounts.length;
  if (count === 0) return [];
  const startIdx = activeAccountIndexMap.get(provider.id) ?? 0;
  const order: Array<{ account: XtreamAccountCredential; index: number }> = [];
  for (let offset = 0; offset < count; offset++) {
    const index = (startIdx + offset) % count;
    order.push({ account: provider.accounts[index], index });
  }
  return order;
}

export function clearProviderRuntimeStateForTest(): void {
  activeAccountIndexMap.clear();
  serverCatalogCache.clear();
  inFlightSyncMap.clear();
  opaqueSubPlaylistCache.clear();
  opaqueSegmentCache.clear();
  liveSessionUrlCache.clear();
  liveRollingSeqCache.clear();
}

function isAccountRejectedPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const rec = data as { user_info?: { auth?: unknown; status?: unknown } };
  if (!rec.user_info) return false;
  if (Number(rec.user_info.auth) === 0) return true;
  const status = String(rec.user_info.status || '').trim().toLowerCase();
  return status === 'expired' || status === 'disabled' || status === 'banned';
}

export async function fetchXtreamJsonAction(
  baseUrl: string,
  account: XtreamAccountCredential,
  action?: string,
  extraParams?: Record<string, string | number>,
  timeoutMs = XTREAM_ACTION_TIMEOUT_MS
): Promise<{ ok: true; data: unknown } | { ok: false; accountRejected: boolean }> {
  const targetUrl = buildXtreamPlayerApiUrl(baseUrl, account, action, extraParams);
  await assertSafeProxyUrl(targetUrl);

  const headers: Record<string, string> = {
    'User-Agent': 'IPTVSmartersPlayer',
    Accept: 'application/json, text/plain, */*',
  };

  let gotHttpResponse = false;
  try {
    const res = await streamingFetch(targetUrl, { headers, timeoutMs });
    gotHttpResponse = true;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, accountRejected: true };
    }
    if (res.ok) {
      const rawText = await res.text();
      if (rawText && !/^\s*<!doctype|^\s*<html/i.test(rawText)) {
        const parsed = JSON.parse(rawText) as unknown;
        if (isAccountRejectedPayload(parsed)) {
          return { ok: false, accountRejected: true };
        }
        return { ok: true, data: parsed };
      }
    }
  } catch {
    // Fallback to curlGetText for HTTP/1.0 or TLS compatibility
  }

  if (gotHttpResponse) {
    return { ok: false, accountRejected: false };
  }

  try {
    const fb = await curlGetText(
      targetUrl,
      headers,
      Math.min(6, Math.max(3, Math.ceil(timeoutMs / 1500))),
      false,
      true
    );
    if (fb.text && !/^\s*<!doctype|^\s*<html/i.test(fb.text)) {
      const parsed = JSON.parse(fb.text) as unknown;
      if (isAccountRejectedPayload(parsed)) {
        return { ok: false, accountRejected: true };
      }
      return { ok: true, data: parsed };
    }
  } catch {
    // ignore parse failure
  }

  return { ok: false, accountRejected: false };
}

function normalizeCategories(raw: unknown): ProviderCategoryItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProviderCategoryItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.category_id ?? '').trim();
    const name = String(r.category_name ?? '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

function buildCategoryLookup(categories: ProviderCategoryItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cat of categories) {
    map.set(cat.id, cat.name);
  }
  return map;
}

function sanitizeExt(raw: unknown, fallback = 'mp4'): string {
  const cleaned = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned === 'mp4' || cleaned === 'mkv' || cleaned === 'avi' || cleaned === 'webm' || cleaned === 'm3u8' || cleaned === 'ts') {
    return cleaned;
  }
  return fallback;
}

function normalizeLiveStreams(
  provider: DefaultProviderConfig,
  raw: unknown,
  catMap: Map<string, string>
): ProviderLiveItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderLiveItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const streamId = String(r.stream_id ?? r.id ?? '').trim();
    const name = String(r.name ?? '').trim();
    if (!streamId || !name) continue;
    const categoryId = String(r.category_id ?? '').trim();
    out.push({
      id: `${provider.id}-live-${streamId}`,
      streamId,
      providerId: provider.id,
      providerName: provider.name,
      name,
      categoryId,
      categoryName: catMap.get(categoryId) || 'TV en Vivo',
      logo: sanitizeProviderArtworkUrl(r.stream_icon),
      playbackUrl: `/api/providers/live/${encodeURIComponent(provider.id)}/${encodeURIComponent(streamId)}.m3u8`,
    });
  }
  return out;
}

function extractYearFromRecord(r: Record<string, unknown>): string {
  const candidate = String(r.releaseDate ?? r.releasedate ?? r.year ?? r.added ?? '').trim();
  const m = candidate.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : '';
}

function normalizeVodStreams(
  provider: DefaultProviderConfig,
  raw: unknown,
  catMap: Map<string, string>
): ProviderMovieItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderMovieItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const streamId = String(r.stream_id ?? r.id ?? '').trim();
    const name = String(r.name ?? r.title ?? '').trim();
    if (!streamId || !name) continue;
    const categoryId = String(r.category_id ?? '').trim();
    const ext = sanitizeExt(r.container_extension, 'mp4');
    out.push({
      id: `${provider.id}-vod-${streamId}`,
      streamId,
      providerId: provider.id,
      providerName: provider.name,
      name,
      categoryId,
      categoryName: catMap.get(categoryId) || 'Películas',
      poster: sanitizeProviderArtworkUrl(r.stream_icon ?? r.cover),
      rating: String(r.rating ?? r.rating_5based ?? '').trim(),
      year: extractYearFromRecord(r),
      ext,
      playbackUrl: `/api/providers/vod/${encodeURIComponent(provider.id)}/${encodeURIComponent(streamId)}.${ext}`,
    });
  }
  return out;
}

function normalizeSeriesList(
  provider: DefaultProviderConfig,
  raw: unknown,
  catMap: Map<string, string>
): ProviderSeriesItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderSeriesItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const seriesId = String(r.series_id ?? r.id ?? '').trim();
    const name = String(r.name ?? r.title ?? '').trim();
    if (!seriesId || !name) continue;
    const categoryId = String(r.category_id ?? '').trim();
    out.push({
      id: `${provider.id}-series-${seriesId}`,
      seriesId,
      providerId: provider.id,
      providerName: provider.name,
      name,
      categoryId,
      categoryName: catMap.get(categoryId) || 'Series',
      poster: sanitizeProviderArtworkUrl(r.cover ?? r.stream_icon),
      rating: String(r.rating ?? r.rating_5based ?? '').trim(),
      year: extractYearFromRecord(r),
      plot: String(r.plot ?? '').trim().slice(0, 280),
    });
  }
  return out;
}

async function fetchFullCatalogForAccount(
  provider: DefaultProviderConfig,
  account: XtreamAccountCredential
): Promise<ProviderCatalogData | null> {
  const probe = await fetchXtreamJsonAction(
    provider.baseUrl,
    account,
    'get_live_categories',
    undefined,
    5500
  );
  if (!probe.ok) return null;

  const [liveStreamsRes, vodCatsRes, vodStreamsRes, seriesCatsRes, seriesRes] =
    await Promise.allSettled([
      fetchXtreamJsonAction(provider.baseUrl, account, 'get_live_streams'),
      fetchXtreamJsonAction(provider.baseUrl, account, 'get_vod_categories'),
      fetchXtreamJsonAction(provider.baseUrl, account, 'get_vod_streams'),
      fetchXtreamJsonAction(provider.baseUrl, account, 'get_series_categories'),
      fetchXtreamJsonAction(provider.baseUrl, account, 'get_series'),
    ]);

  const rawLiveStreams =
    liveStreamsRes.status === 'fulfilled' && liveStreamsRes.value.ok
      ? liveStreamsRes.value.data
      : [];
  const rawVodCats =
    vodCatsRes.status === 'fulfilled' && vodCatsRes.value.ok ? vodCatsRes.value.data : [];
  const rawVodStreams =
    vodStreamsRes.status === 'fulfilled' && vodStreamsRes.value.ok
      ? vodStreamsRes.value.data
      : [];
  const rawSeriesCats =
    seriesCatsRes.status === 'fulfilled' && seriesCatsRes.value.ok
      ? seriesCatsRes.value.data
      : [];
  const rawSeries =
    seriesRes.status === 'fulfilled' && seriesRes.value.ok ? seriesRes.value.data : [];

  const liveCategories = normalizeCategories(probe.data);
  const vodCategories = normalizeCategories(rawVodCats);
  const seriesCategories = normalizeCategories(rawSeriesCats);

  const liveStreams = normalizeLiveStreams(
    provider,
    rawLiveStreams,
    buildCategoryLookup(liveCategories)
  );
  const vodStreams = normalizeVodStreams(
    provider,
    rawVodStreams,
    buildCategoryLookup(vodCategories)
  );
  const seriesList = normalizeSeriesList(
    provider,
    rawSeries,
    buildCategoryLookup(seriesCategories)
  );

  if (liveStreams.length === 0 && vodStreams.length === 0 && seriesList.length === 0) {
    return null;
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    syncedAt: Date.now(),
    status: 'ready',
    counts: {
      live: liveStreams.length,
      movies: vodStreams.length,
      series: seriesList.length,
    },
    liveCategories,
    vodCategories,
    seriesCategories,
    liveStreams,
    vodStreams,
    seriesList,
  };
}

export async function syncProviderCatalog(
  providerId: string,
  forceRefresh = false
): Promise<ProviderCatalogData | null> {
  const provider = getDefaultProviderById(providerId);
  if (!provider) return null;

  if (!forceRefresh) {
    const cached = serverCatalogCache.get(providerId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const existingFlight = inFlightSyncMap.get(providerId);
  if (existingFlight && !forceRefresh) {
    return existingFlight;
  }

  const flight = (async (): Promise<ProviderCatalogData> => {
    const orderedAccounts = getRotatedAccountOrder(provider);
    for (const { account, index } of orderedAccounts) {
      try {
        const result = await fetchFullCatalogForAccount(provider, account);
        if (result) {
          activeAccountIndexMap.set(provider.id, index);
          serverCatalogCache.set(provider.id, {
            data: result,
            expiresAt: Date.now() + SERVER_SYNC_TTL_MS,
          });
          return result;
        }
      } catch {
        // Rotate to next configured account silently
      }
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      syncedAt: Date.now(),
      status: 'error',
      errorMessage: 'No disponible temporalmente',
      counts: { live: 0, movies: 0, series: 0 },
      liveCategories: [],
      vodCategories: [],
      seriesCategories: [],
      liveStreams: [],
      vodStreams: [],
      seriesList: [],
    };
  })();

  inFlightSyncMap.set(providerId, flight);
  try {
    return await flight;
  } finally {
    if (inFlightSyncMap.get(providerId) === flight) {
      inFlightSyncMap.delete(providerId);
    }
  }
}

export function getCachedProviderCatalogSnapshot(providerId: string): ProviderCatalogData | null {
  const cached = serverCatalogCache.get(providerId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

export function getAllCachedProviderCatalogs(): ProviderCatalogData[] {
  const now = Date.now();
  const list: ProviderCatalogData[] = [];
  for (const p of DEFAULT_PROVIDERS) {
    const cached = serverCatalogCache.get(p.id);
    if (cached && cached.expiresAt > now && cached.data.status === 'ready') {
      list.push(cached.data);
    }
  }
  return list;
}

export function getProviderStatusSummaries(): Array<{
  providerId: string;
  providerName: string;
  accentColor: string;
  status: 'loading' | 'ready' | 'error';
  counts: { live: number; movies: number; series: number };
  syncedAt: number | null;
}> {
  const now = Date.now();
  return DEFAULT_PROVIDERS.map((p) => {
    const cached = serverCatalogCache.get(p.id);
    if (cached && cached.expiresAt > now) {
      return {
        providerId: p.id,
        providerName: p.name,
        accentColor: p.accentColor,
        status: cached.data.status,
        counts: cached.data.counts,
        syncedAt: cached.data.syncedAt,
      };
    }
    return {
      providerId: p.id,
      providerName: p.name,
      accentColor: p.accentColor,
      status: 'loading',
      counts: { live: 0, movies: 0, series: 0 },
      syncedAt: null,
    };
  });
}

let backgroundWarmStarted = false;
export function warmDefaultProvidersBackground(): void {
  if (backgroundWarmStarted) return;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  backgroundWarmStarted = true;
  void Promise.allSettled(DEFAULT_PROVIDERS.map((p) => syncProviderCatalog(p.id, false)));
}

export async function fetchProviderSeriesInfo(
  providerId: string,
  seriesId: string
): Promise<ProviderSeriesInfoResult | null> {
  const provider = getDefaultProviderById(providerId);
  const cleanSeriesId = String(seriesId || '').trim();
  if (!provider || !/^[a-zA-Z0-9_-]{1,32}$/.test(cleanSeriesId)) return null;

  const orderedAccounts = getRotatedAccountOrder(provider);
  for (const { account, index } of orderedAccounts) {
    try {
      const res = await fetchXtreamJsonAction(provider.baseUrl, account, 'get_series_info', {
        series_id: cleanSeriesId,
      });
      if (!res.ok || !res.data || typeof res.data !== 'object') continue;
      const raw = res.data as {
        info?: Record<string, unknown>;
        episodes?: Record<string, unknown[]>;
      };
      if (!raw.episodes || typeof raw.episodes !== 'object') continue;

      activeAccountIndexMap.set(provider.id, index);
      const episodesBySeason: Record<string, ProviderSeriesEpisodeItem[]> = {};
      const seasonNums: number[] = [];

      for (const [seasonKey, epList] of Object.entries(raw.episodes)) {
        if (!Array.isArray(epList)) continue;
        const seasonNum = Number(seasonKey) || 1;
        const normalizedEps: ProviderSeriesEpisodeItem[] = [];
        for (const epRaw of epList) {
          if (!epRaw || typeof epRaw !== 'object') continue;
          const ep = epRaw as Record<string, unknown>;
          const episodeId = String(ep.id ?? '').trim();
          if (!episodeId) continue;
          const epInfo = (ep.info && typeof ep.info === 'object' ? ep.info : {}) as Record<
            string,
            unknown
          >;
          const ext = sanitizeExt(ep.container_extension, 'mp4');
          const episodeNum = Number(ep.episode_num ?? 0) || normalizedEps.length + 1;
          normalizedEps.push({
            id: `${provider.id}-ep-${episodeId}`,
            episodeId,
            season: seasonNum,
            episodeNum,
            title: String(ep.title ?? `Episodio ${episodeNum}`).trim(),
            duration: String(epInfo.duration ?? '').trim(),
            poster: sanitizeProviderArtworkUrl(epInfo.movie_image ?? raw.info?.cover),
            ext,
            playbackUrl: `/api/providers/series-stream/${encodeURIComponent(
              provider.id
            )}/${encodeURIComponent(episodeId)}.${ext}`,
          });
        }
        if (normalizedEps.length > 0) {
          normalizedEps.sort((a, b) => a.episodeNum - b.episodeNum);
          episodesBySeason[String(seasonNum)] = normalizedEps;
          seasonNums.push(seasonNum);
        }
      }

      seasonNums.sort((a, b) => a - b);
      return {
        providerId: provider.id,
        providerName: provider.name,
        seriesId: cleanSeriesId,
        title: String(raw.info?.name ?? 'Serie').trim(),
        poster: sanitizeProviderArtworkUrl(raw.info?.cover),
        plot: String(raw.info?.plot ?? '').trim(),
        seasons: seasonNums,
        episodesBySeason,
      };
    } catch {
      // rotate
    }
  }
  return null;
}

function rewriteProviderUriAttributes(
  rawLine: string,
  trimmed: string,
  baseUrl: string,
  referer: string,
  originPrefix: string,
  now: number,
  liveSessionKey?: string
): string {
  const absSuffix = originPrefix ? '?abs=1' : '';
  return rawLine.replace(/URI="([^"]+)"/g, (_m, uriVal) => {
    try {
      const absUri = new URL(uriVal, baseUrl).href;
      const token = createOpaqueToken(absUri);
      if (trimmed.startsWith('#EXT-X-MEDIA') || /\.m3u8(\?|$)/i.test(absUri)) {
        opaqueSubPlaylistCache.set(token, {
          rawUrl: absUri,
          referer,
          ts: now,
          liveSessionKey,
        });
        return `URI="${originPrefix}/api/providers/sub/${token}.m3u8${absSuffix}"`;
      }
      opaqueSegmentCache.set(token, { rawUrl: absUri, referer, ts: now });
      return `URI="${originPrefix}/api/providers/seg/${token}.bin"`;
    } catch {
      return _m;
    }
  });
}

export function rewriteProviderPlaylist(
  manifestText: string,
  baseUrl: string,
  referer: string,
  originPrefix = '',
  liveSessionKey?: string
): string {
  const lines = manifestText.split(/\r?\n/);
  const now = Date.now();
  const isMasterOrVod =
    manifestText.includes('#EXT-X-STREAM-INF') || manifestText.includes('#EXT-X-ENDLIST');

  if (liveSessionKey && !isMasterOrVod) {
    interface ParsedLiveSeg {
      absUrl: string;
      proxiedUrl: string;
      tags: string[];
      hadDiscontinuityBefore: boolean;
    }

    let targetDur = '4';
    let rawMediaSeq = 0;
    let pendingTags: string[] = [];
    let pendingDisc = false;
    const segments: ParsedLiveSeg[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#')) {
        if (/^#EXT-X-TARGETDURATION:(\d+)/i.test(trimmed)) {
          targetDur = trimmed.split(':')[1]?.trim() || targetDur;
        } else if (/^#EXT-X-MEDIA-SEQUENCE:(\d+)/i.test(trimmed)) {
          rawMediaSeq = parseInt(trimmed.split(':')[1] || '0', 10) || 0;
        } else if (trimmed === '#EXT-X-DISCONTINUITY') {
          pendingDisc = true;
        } else if (
          trimmed === '#EXTM3U' ||
          trimmed.startsWith('#EXT-X-VERSION:') ||
          trimmed.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:') ||
          trimmed.startsWith('#EXT-X-ALLOW-CACHE:') ||
          trimmed.startsWith('#EXT-X-PLAYLIST-TYPE:')
        ) {
          // emitted normalized below
        } else if (trimmed.includes('URI="')) {
          pendingTags.push(
            rewriteProviderUriAttributes(rawLine, trimmed, baseUrl, referer, originPrefix, now)
          );
        } else {
          pendingTags.push(rawLine);
        }
        continue;
      }

      try {
        const absUrl = new URL(trimmed, baseUrl).href;
        const token = createOpaqueToken(absUrl);
        const extMatch = absUrl.match(/\.(m4s|mp4|aac|ts)(\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'ts';
        opaqueSegmentCache.set(token, { rawUrl: absUrl, referer, ts: now });
        segments.push({
          absUrl,
          proxiedUrl: `${originPrefix}/api/providers/seg/${token}.${ext}`,
          tags: pendingTags,
          hadDiscontinuityBefore: pendingDisc,
        });
      } catch {
        // ignore malformed segment line
      }
      pendingTags = [];
      pendingDisc = false;
    }

    if (segments.length > 0) {
      const prev = liveRollingSeqCache.get(liveSessionKey);
      let baseSeq = rawMediaSeq > 0 ? rawMediaSeq : 0;
      let discSeq = 0;
      let needsTransitionDisc = false;

      if (prev) {
        let anchorIdx = -1;
        let anchorPrevSeq = -1;
        for (let i = 0; i < segments.length; i++) {
          const matchedSeq = prev.segsByUrl.get(segments[i].absUrl);
          if (matchedSeq !== undefined) {
            anchorIdx = i;
            anchorPrevSeq = matchedSeq;
            break;
          }
        }
        if (anchorIdx >= 0) {
          baseSeq = Math.max(prev.mediaSequence, anchorPrevSeq - anchorIdx);
          discSeq = prev.discontinuitySeq;
          needsTransitionDisc = false;
        } else {
          baseSeq = prev.nextSeq;
          discSeq = prev.discontinuitySeq + 1;
          needsTransitionDisc = true;
        }
      }

      const nextSegsByUrl = new Map<string, number>();
      if (prev) {
        const keepMinSeq = Math.max(0, baseSeq - 60);
        for (const [u, s] of prev.segsByUrl.entries()) {
          if (s >= keepMinSeq) nextSegsByUrl.set(u, s);
        }
      }
      for (let i = 0; i < segments.length; i++) {
        nextSegsByUrl.set(segments[i].absUrl, baseSeq + i);
      }
      liveRollingSeqCache.set(liveSessionKey, {
        mediaSequence: baseSeq,
        discontinuitySeq: discSeq,
        nextSeq: baseSeq + segments.length,
        segsByUrl: nextSegsByUrl,
        updatedAt: now,
      });

      const out: string[] = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${targetDur}`,
        `#EXT-X-MEDIA-SEQUENCE:${baseSeq}`,
      ];
      if (discSeq > 0) {
        out.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`);
      }
      if (needsTransitionDisc) {
        out.push('#EXT-X-DISCONTINUITY');
      }
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (i > 0 && seg.hadDiscontinuityBefore) {
          out.push('#EXT-X-DISCONTINUITY');
        }
        for (const tag of seg.tags) out.push(tag);
        out.push(seg.proxiedUrl);
      }
      return out.join('\n') + '\n';
    }
  }

  let nextIsPlaylist = false;
  const out: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#EXT-X-STREAM-INF')) nextIsPlaylist = true;
      if (trimmed.includes('URI="')) {
        out.push(
          rewriteProviderUriAttributes(
            rawLine,
            trimmed,
            baseUrl,
            referer,
            originPrefix,
            now,
            liveSessionKey
          )
        );
        continue;
      }
      out.push(rawLine);
      continue;
    }

    try {
      const absUrl = new URL(trimmed, baseUrl).href;
      const isPlaylist = nextIsPlaylist || /\.m3u8(\?|$)/i.test(absUrl);
      nextIsPlaylist = false;
      const token = createOpaqueToken(absUrl);
      const absSuffix = originPrefix ? '?abs=1' : '';
      if (isPlaylist) {
        opaqueSubPlaylistCache.set(token, {
          rawUrl: absUrl,
          referer,
          ts: now,
          liveSessionKey,
        });
        out.push(`${originPrefix}/api/providers/sub/${token}.m3u8${absSuffix}`);
      } else {
        const extMatch = absUrl.match(/\.(m4s|mp4|aac|ts)(\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'ts';
        opaqueSegmentCache.set(token, { rawUrl: absUrl, referer, ts: now });
        out.push(`${originPrefix}/api/providers/seg/${token}.${ext}`);
      }
    } catch {
      nextIsPlaylist = false;
      out.push(rawLine);
    }
  }

  return out.join('\n') + '\n';
}

async function fetchProviderPlaylistText(
  targetUrl: string,
  referer: string,
  timeoutMs = 2400
): Promise<{ text: string; baseUrl: string } | null> {
  await assertSafeProxyUrl(targetUrl);
  const headers: Record<string, string> = {
    Accept: '*/*',
    Referer: referer,
    'User-Agent': 'IPTVSmartersPlayer',
  };

  try {
    const res = await streamingFetch(targetUrl, { headers, timeoutMs });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(text)) {
        const finalUrl = res.url || targetUrl;
        await assertSafeProxyUrl(finalUrl);
        return { text, baseUrl: finalUrl };
      }
    }
  } catch {
    // fallback to curl
  }

  const fb = await curlGetText(targetUrl, headers, 3, false, true).catch(() => ({
    text: '',
    effectiveUrl: targetUrl,
  }));
  if (fb.text && fb.text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(fb.text)) {
    const finalUrl = fb.effectiveUrl || targetUrl;
    await assertSafeProxyUrl(finalUrl);
    return { text: fb.text, baseUrl: finalUrl };
  }
  return null;
}

export async function resolveProviderLiveManifest(
  providerId: string,
  streamId: string,
  originPrefix = ''
): Promise<string | null> {
  const provider = getDefaultProviderById(providerId);
  const cleanId = String(streamId || '').replace(/\.m3u8$/i, '').trim();
  if (!provider || !/^[a-zA-Z0-9_-]{1,32}$/.test(cleanId)) return null;

  const cleanOrigin = provider.baseUrl.replace(/\/+$/, '');
  const referer = `${cleanOrigin}/`;
  const idEnc = encodeURIComponent(cleanId);
  const sessionKey = `${provider.id}:${cleanId}`;
  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  // Reuse sticky redirected edge session URL so consecutive polls stay on the same stream window
  const sticky = liveSessionUrlCache.get(sessionKey);
  if (sticky) {
    const stickyLoaded = await fetchProviderPlaylistText(
      sticky.finalUrl,
      sticky.referer,
      isTestEnv ? 2200 : 3000
    ).catch(() => null);
    if (stickyLoaded) {
      liveSessionUrlCache.set(sessionKey, {
        finalUrl: stickyLoaded.baseUrl,
        referer: sticky.referer,
        accountIndex: sticky.accountIndex,
      });
      activeAccountIndexMap.set(provider.id, sticky.accountIndex);
      return rewriteProviderPlaylist(
        stickyLoaded.text,
        stickyLoaded.baseUrl,
        sticky.referer,
        originPrefix,
        sessionKey
      );
    }
    liveSessionUrlCache.delete(sessionKey);
  }

  for (const { account, index } of getRotatedAccountOrder(provider)) {
    const u = encodeURIComponent(account.username);
    const p = encodeURIComponent(account.password);
    const tsUrl = `${cleanOrigin}/live/${u}/${p}/${idEnc}.ts`;
    await assertSafeProxyUrl(tsUrl);

    const warmPath = getActiveDvbSessionPath(tsUrl, 'hd');
    if (warmPath) {
      const warmManifest = readLiveDvbPlaylistForIptv(warmPath, originPrefix);
      if (warmManifest) {
        activeAccountIndexMap.set(provider.id, index);
        return warmManifest;
      }
    }

    const m3u8Url = `${cleanOrigin}/live/${u}/${p}/${idEnc}.m3u8`;
    const loaded = await fetchProviderPlaylistText(m3u8Url, referer, isTestEnv ? 2200 : 2800).catch(
      () => null
    );
    if (loaded) {
      activeAccountIndexMap.set(provider.id, index);
      liveSessionUrlCache.set(sessionKey, {
        finalUrl: loaded.baseUrl,
        referer,
        accountIndex: index,
      });
      return rewriteProviderPlaylist(loaded.text, loaded.baseUrl, referer, originPrefix, sessionKey);
    }

    if (!isTestEnv) {
      const dvbPath = await ensureLiveDvbCleanHlsSession(tsUrl, 'hd', referer).catch(() => null);
      if (dvbPath) {
        const tsManifest = readLiveDvbPlaylistForIptv(dvbPath, originPrefix);
        if (tsManifest) {
          activeAccountIndexMap.set(provider.id, index);
          return tsManifest;
        }
      }
    }
  }

  return null;
}

export async function resolveProviderSubPlaylist(
  tokenWithExt: string,
  originPrefix = ''
): Promise<string | null> {
  const token = String(tokenWithExt || '').replace(/\.m3u8$/i, '').trim();
  const entry = opaqueSubPlaylistCache.get(token);
  if (!entry) return null;
  const loaded = await fetchProviderPlaylistText(entry.rawUrl, entry.referer, 3000).catch(() => null);
  if (!loaded) return null;
  return rewriteProviderPlaylist(
    loaded.text,
    loaded.baseUrl,
    entry.referer,
    originPrefix,
    entry.liveSessionKey
  );
}

export async function fetchProviderOpaqueSegment(
  tokenWithExt: string,
  rangeHeader?: string
): Promise<{ status: number; contentType: string; buffer: Buffer } | null> {
  const token = String(tokenWithExt || '').replace(/\.[a-z0-9]+$/i, '').trim();
  const entry = opaqueSegmentCache.get(token);
  if (!entry) return null;

  await assertSafeProxyUrl(entry.rawUrl);
  const headers: Record<string, string> = {
    'User-Agent': 'IPTVSmartersPlayer',
    Accept: '*/*',
    Referer: entry.referer,
  };
  if (rangeHeader) headers['Range'] = rangeHeader;

  try {
    const res = await streamingFetch(entry.rawUrl, { headers, timeoutMs: 8000 });
    if (res.ok || res.status === 206) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) {
        return {
          status: res.status,
          contentType: res.headers.get('content-type') || 'video/mp2t',
          buffer: buf,
        };
      }
    }
  } catch {
    // curl fallback
  }

  const curlRes = await curlGetBufferWithStatus(entry.rawUrl, headers, 8).catch(() => ({
    buf: Buffer.alloc(0),
    status: 502,
  }));
  if (curlRes.buf.length > 0 && curlRes.status >= 200 && curlRes.status < 400) {
    return {
      status: curlRes.status,
      contentType: 'video/mp2t',
      buffer: curlRes.buf,
    };
  }
  return null;
}

export async function streamProviderVodOrSeries(
  req: express.Request,
  res: express.Response,
  kind: 'movie' | 'series',
  providerId: string,
  rawIdWithExt: string,
  originPrefix = ''
): Promise<void> {
  const reqId = getOrCreateRequestId(req);
  const provider = getDefaultProviderById(providerId);
  const cleaned = String(rawIdWithExt || '').trim();
  const match = cleaned.match(/^([a-zA-Z0-9_-]{1,32})(?:\.([a-zA-Z0-9]{2,5}))?$/);
  if (!provider || !match) {
    res.status(404).json({ success: false, error: 'Contenido no disponible' });
    return;
  }

  const streamId = match[1];
  const ext = sanitizeExt(match[2], 'mp4');
  const cleanOrigin = provider.baseUrl.replace(/\/+$/, '');
  const referer = `${cleanOrigin}/`;

  if (ext === 'm3u8') {
    for (const { account, index } of getRotatedAccountOrder(provider)) {
      const u = encodeURIComponent(account.username);
      const p = encodeURIComponent(account.password);
      const targetUrl = `${cleanOrigin}/${kind}/${u}/${p}/${encodeURIComponent(streamId)}.m3u8`;
      const loaded = await fetchProviderPlaylistText(targetUrl, referer, 3500).catch(() => null);
      if (loaded) {
        activeAccountIndexMap.set(provider.id, index);
        const manifest = rewriteProviderPlaylist(loaded.text, loaded.baseUrl, referer, originPrefix);
        applyProxyCorsHeaders(res, reqId);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(manifest);
        return;
      }
    }
    res.status(502).json({ success: false, error: 'Stream no disponible temporalmente' });
    return;
  }

  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
  const contentTypeFallback =
    ext === 'mkv'
      ? 'video/x-matroska'
      : ext === 'webm'
      ? 'video/webm'
      : ext === 'ts'
      ? 'video/mp2t'
      : 'video/mp4';

  for (const { account, index } of getRotatedAccountOrder(provider)) {
    const u = encodeURIComponent(account.username);
    const p = encodeURIComponent(account.password);
    const targetUrl = `${cleanOrigin}/${kind}/${u}/${p}/${encodeURIComponent(streamId)}.${ext}`;
    try {
      await assertSafeProxyUrl(targetUrl);
      const controller = new AbortController();
      req.once('close', () => controller.abort());
      const headers: Record<string, string> = {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: '*/*',
        Referer: referer,
      };
      if (rangeHeader) headers['Range'] = rangeHeader;

      const upstream = await streamingFetch(targetUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        signal: controller.signal,
        timeoutMs: 12_000,
      });

      if (!upstream.ok && upstream.status !== 206) {
        void upstream.body?.cancel().catch(() => {});
        continue;
      }

      activeAccountIndexMap.set(provider.id, index);
      applyProxyCorsHeaders(res, reqId);
      res.status(upstream.status);
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') || contentTypeFallback
      );
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);

      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as never);
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      nodeStream.pipe(res);
      return;
    } catch {
      if (req.destroyed || res.writableEnded) return;
      // try next rotated account
    }
  }

  if (!res.writableEnded) {
    res.status(502).json({ success: false, error: 'Stream no disponible temporalmente' });
  }
}
