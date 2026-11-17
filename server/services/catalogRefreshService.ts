import { ENV } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import { CHROME_UA, areTitlesStrictlyEqual, curlGetText, generateSpanishTitleHints } from '../extractors/httpHelpers.ts';
import {
  resolveActiveGnulaMirrors,
  scrapeGnulaCatalog,
} from '../extractors/gnulaHdExtractor.ts';
import { findMovidyUrlByTitle, fetchMovidyPageMetadata } from '../extractors/bingetrixMovidy.ts';
import { listVestCatalogEntries } from './vestMirrorService.ts';

export type CatalogSourceTag =
  | 'bingetrix'
  | 'tmdb'
  | 'movidy'
  | 'gnula'
  | 'serieskao'
  | 'vest';

export interface IndexedCatalogEntry {
  id: string;
  tmdbId?: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  altTitle?: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  bingetrixUrl?: string;
  movidyUrl?: string;
  gnulaUrl?: string;
  seriesKaoUrl?: string;
  vestUrl?: string;
  languages: string[];
  sources: CatalogSourceTag[];
  popularity: number;
  voteCount?: number;
  indexedAt: number;
}

export interface SourceRefreshMetric {
  source: CatalogSourceTag;
  lastRunAt: number;
  itemsIndexed: number;
  ok: boolean;
  error?: string;
}

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const ONDEMAND_CACHE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export const indexedCatalogCache = new LruTtlCache<string, IndexedCatalogEntry>(
  3000,
  INDEX_TTL_MS
);
const onDemandQueryCache = new LruTtlCache<string, IndexedCatalogEntry[]>(
  250,
  ONDEMAND_CACHE_TTL_MS
);
const tmdbSpanishMetaCache = new LruTtlCache<
  string,
  { titles: string[]; year: string; esTitle?: string }
>(500, 6 * 60 * 60 * 1000);

const indexedKeySet = new Set<string>();
const sourceMetrics = new Map<CatalogSourceTag, SourceRefreshMetric>();

let schedulerTimer: NodeJS.Timeout | null = null;
let initialWarmupTimer: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<RefreshCycleSummary> | null = null;
let lastCycleSummary: RefreshCycleSummary | null = null;

export interface RefreshCycleSummary {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  totalIndexed: number;
  sources: SourceRefreshMetric[];
}

export function correctCommonSearchTypos(input: string): string {
  return String(input || '')
    .replace(/\bsipidr?e?r?\b/gi, 'spider')
    .replace(/\bspyderman\b/gi, 'spider man')
    .replace(/\bspidermon\b/gi, 'spider man')
    .replace(/\binterstelar\b/gi, 'interstellar')
    .replace(/\bavater\b/gi, 'avatar')
    .replace(/\bavangers?\b/gi, 'avengers')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCatalogQuery(input: string): string {
  const cleaned = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return correctCommonSearchTypos(cleaned).toLowerCase();
}

export function normalizeCompactCatalogQuery(input: string): string {
  return normalizeCatalogQuery(input).replace(/\s+/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[bn][an];
}

function doTokensMatchFuzzy(queryToken: string, candToken: string): boolean {
  if (queryToken === candToken) return true;
  if (candToken.includes(queryToken) || queryToken.includes(candToken)) return true;
  if (queryToken.length >= 3 && candToken.length >= 3) {
    if (Math.abs(queryToken.length - candToken.length) <= 2) {
      const dist = levenshteinDistance(queryToken, candToken);
      if (dist <= 2 && dist <= Math.floor(queryToken.length / 2)) return true;
    }
  }
  return false;
}

/**
 * Scores how well a candidate catalog item matches a search query across
 * localized title, original title, and alternate language titles.
 * Exact / prefix / full-token matches cleanly outrank fuzzy WordPress hits.
 */
export function scoreTitleRelevance(
  title: string,
  originalTitle: string | undefined,
  query: string,
  opts?: { altTitle?: string; popularity?: number; voteCount?: number }
): number {
  const normQ = normalizeCatalogQuery(query);
  const compactQ = normalizeCompactCatalogQuery(query);
  if (!normQ || !compactQ) return 0;

  const qTokens = normQ.split(' ').filter((w) => w.length >= 2);
  const candidates = [title, originalTitle || '', opts?.altTitle || '']
    .map((s) => s.trim())
    .filter(Boolean);

  let bestTier = 0;

  for (const cand of candidates) {
    const nSpace = normalizeCatalogQuery(cand);
    const nCompact = normalizeCompactCatalogQuery(cand);
    if (!nSpace) continue;

    if (nSpace === normQ) {
      bestTier = Math.max(bestTier, 650);
      continue;
    }
    if (nCompact === compactQ) {
      bestTier = Math.max(bestTier, 580);
      continue;
    }
    if (nSpace.startsWith(normQ) || nCompact.startsWith(compactQ)) {
      bestTier = Math.max(bestTier, 420);
      continue;
    }

    const candTokens = nSpace.split(' ').filter(Boolean);
    if (qTokens.length > 0 && qTokens.every((qt) => qTokens.length <= candTokens.length && qTokens.every((qt) => candTokens.some((ct) => doTokensMatchFuzzy(qt, ct))))) {
      const closeness = Math.round((qTokens.length / Math.max(1, candTokens.length)) * 80);
      bestTier = Math.max(bestTier, 320 + closeness);
      continue;
    }

    if (nSpace.includes(normQ) || nCompact.includes(compactQ)) {
      bestTier = Math.max(bestTier, 240);
      continue;
    }

    if (qTokens.length > 0) {
      const hits = qTokens.filter((qt) => candTokens.some((ct) => doTokensMatchFuzzy(qt, ct))).length;
      if (hits > 0) {
        const ratio = hits / qTokens.length;
        if (qTokens.length === 1 || ratio >= 0.5) {
          bestTier = Math.max(bestTier, Math.round(ratio * 140));
        }
      }
    }
  }

  if (bestTier === 0) return 0;

  const votes = Number(opts?.voteCount || 0);
  const pop = Number(opts?.popularity || 0);
  const popBoost = Math.min(48, Math.log10(Math.max(1, votes + pop + 1)) * 14);
  return bestTier + popBoost;
}

function buildEntryKey(entry: Pick<IndexedCatalogEntry, 'mediaType' | 'tmdbId' | 'title'>): string {
  if (entry.tmdbId && entry.tmdbId > 0) {
    return `${entry.mediaType}:${entry.tmdbId}`;
  }
  return `${entry.mediaType}:slug:${normalizeCompactCatalogQuery(entry.title)}`;
}

export function upsertIndexedEntry(incoming: IndexedCatalogEntry): void {
  if (!incoming.title || (!incoming.poster && !incoming.backdrop)) return;
  const key = buildEntryKey(incoming);
  const existing = indexedCatalogCache.get(key);

  if (existing) {
    const mergedSources = Array.from(new Set([...existing.sources, ...incoming.sources]));
    const mergedLangs = Array.from(new Set([...existing.languages, ...incoming.languages]));
    indexedCatalogCache.set(key, {
      ...existing,
      ...incoming,
      title: existing.title || incoming.title,
      originalTitle: incoming.originalTitle || existing.originalTitle,
      altTitle:
        incoming.altTitle && incoming.altTitle !== existing.title
          ? incoming.altTitle
          : existing.altTitle || (incoming.title !== existing.title ? incoming.title : undefined),
      poster: existing.poster || incoming.poster,
      backdrop: existing.backdrop || incoming.backdrop,
      overview:
        (existing.overview?.length || 0) >= (incoming.overview?.length || 0)
          ? existing.overview
          : incoming.overview,
      bingetrixUrl: incoming.bingetrixUrl || existing.bingetrixUrl,
      movidyUrl: incoming.movidyUrl || existing.movidyUrl,
      gnulaUrl: incoming.gnulaUrl || existing.gnulaUrl,
      seriesKaoUrl: incoming.seriesKaoUrl || existing.seriesKaoUrl,
      vestUrl: incoming.vestUrl || existing.vestUrl,
      languages: mergedLangs,
      sources: mergedSources,
      popularity: Math.max(existing.popularity || 0, incoming.popularity || 0),
      indexedAt: Date.now(),
    });
  } else {
    indexedCatalogCache.set(key, { ...incoming, indexedAt: Date.now() });
  }
  indexedKeySet.add(key);
}

export function getIndexedCatalogSize(): number {
  return indexedCatalogCache.size;
}

export function searchIndexedCatalog(
  query: string,
  opts?: { mediaType?: 'movie' | 'tv' | 'all'; limit?: number }
): IndexedCatalogEntry[] {
  const cleanQ = String(query || '').trim();
  const wantType = opts?.mediaType || 'all';
  const limit = opts?.limit ?? 30;
  const results: Array<{ entry: IndexedCatalogEntry; score: number }> = [];

  for (const key of indexedKeySet) {
    const entry = indexedCatalogCache.get(key);
    if (!entry) {
      indexedKeySet.delete(key);
      continue;
    }
    if (wantType !== 'all' && entry.mediaType !== wantType) continue;

    if (!cleanQ) {
      results.push({ entry, score: entry.popularity || 1 });
      continue;
    }

    const score = scoreTitleRelevance(entry.title, entry.originalTitle, cleanQ, {
      altTitle: entry.altTitle,
      popularity: entry.popularity,
    });
    if (score >= 70) {
      results.push({ entry, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.entry);
}

async function politeDelay(ms: number): Promise<void> {
  if (ENV.nodeEnv === 'test') return;
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchHtmlSafe(url: string, referer: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA, Referer: referer },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) return await res.text();
  } catch {
    // fallback to curl with browser TLS
  }
  const fb = await curlGetText(url, { 'User-Agent': CHROME_UA, Referer: referer }, 5).catch(
    () => ({ text: '' })
  );
  return fb.text || '';
}

function mapTmdbRawToIndexed(
  raw: any,
  mediaType: 'movie' | 'tv',
  sources: CatalogSourceTag[],
  langs: string[]
): IndexedCatalogEntry | null {
  if (!raw?.id || (!raw.poster_path && !raw.backdrop_path)) return null;
  const title = raw.title || raw.name || raw.original_title || raw.original_name || 'Título';
  const originalTitle = raw.original_title || raw.original_name || title;
  return {
    id: `${sources[0] || 'tmdb'}-${mediaType}-${raw.id}`,
    tmdbId: Number(raw.id),
    mediaType,
    title,
    originalTitle,
    year: String(raw.release_date || raw.first_air_date || '').split('-')[0] || 'HD',
    rating: raw.vote_average ? Number(raw.vote_average).toFixed(1) : '',
    overview: raw.overview || '',
    poster: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : '',
    backdrop: raw.backdrop_path ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}` : '',
    bingetrixUrl:
      mediaType === 'movie'
        ? `https://bingetrix.sc/watch/${raw.id}`
        : `https://bingetrix.sc/watch/tv/${raw.id}/1/1`,
    languages: langs,
    sources,
    popularity: Number(raw.popularity || raw.vote_count || 10),
    voteCount: Number(raw.vote_count || 0),
    indexedAt: Date.now(),
  };
}

/**
 * Crawl Bingetrix homepage + TMDB dual-language feeds (en-US & es-ES)
 */
async function refreshBingetrixAndTmdb(): Promise<SourceRefreshMetric> {
  const started = Date.now();
  let count = 0;
  try {
    const apiKey = ENV.tmdbApiKey;
    const endpoints: Array<{ url: string; mediaType: 'movie' | 'tv'; lang: 'en-US' | 'es-ES' }> = [
      { url: `https://api.themoviedb.org/3/trending/movie/day?api_key=${apiKey}&language=en-US&page=1`, mediaType: 'movie', lang: 'en-US' },
      { url: `https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&language=en-US&page=1`, mediaType: 'movie', lang: 'en-US' },
      { url: `https://api.themoviedb.org/3/trending/tv/day?api_key=${apiKey}&language=en-US&page=1`, mediaType: 'tv', lang: 'en-US' },
      { url: `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&language=es-ES&page=1`, mediaType: 'movie', lang: 'es-ES' },
      { url: `https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&language=es-ES&page=1`, mediaType: 'tv', lang: 'es-ES' },
    ];

    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, { signal: AbortSignal.timeout(4500) });
        if (r.ok) {
          const json: any = await r.json();
          const rows: any[] = Array.isArray(json?.results) ? json.results : [];
          for (const row of rows) {
            const entry = mapTmdbRawToIndexed(
              row,
              ep.mediaType,
              ['bingetrix', 'tmdb'],
              ep.lang === 'en-US' ? ['English 1080p', 'VOSE'] : ['Castellano', 'Latino', 'VOSE']
            );
            if (entry) {
              upsertIndexedEntry(entry);
              count += 1;
            }
          }
        }
      } catch {
        // continue with remaining endpoints
      }
      await politeDelay(250);
    }

    // Best-effort scrape of Bingetrix watch links to catch indie/2026 premieres featured on bingetrix.sc
    const bingetrixHtml = await fetchHtmlSafe('https://bingetrix.sc/', 'https://bingetrix.sc/');
    if (bingetrixHtml) {
      const watchIds = new Set<number>();
      const re = /\/watch\/(?:movie\/)?(\d{4,9})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bingetrixHtml)) !== null && watchIds.size < 18) {
        const id = Number(m[1]);
        if (id > 0) watchIds.add(id);
      }
      for (const id of watchIds) {
        const key = `movie:${id}`;
        if (indexedCatalogCache.get(key)) continue;
        try {
          const r = await fetch(
            `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=en-US`,
            { signal: AbortSignal.timeout(3500) }
          );
          if (r.ok) {
            const raw: any = await r.json();
            const entry = mapTmdbRawToIndexed(raw, 'movie', ['bingetrix'], ['English 1080p', 'VOSE']);
            if (entry) {
              upsertIndexedEntry(entry);
              count += 1;
            }
          }
        } catch {
          // ignore
        }
        await politeDelay(200);
      }
    }

    const metric: SourceRefreshMetric = {
      source: 'bingetrix',
      lastRunAt: started,
      itemsIndexed: count,
      ok: count > 0,
    };
    sourceMetrics.set('bingetrix', metric);
    return metric;
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'bingetrix',
      lastRunAt: started,
      itemsIndexed: count,
      ok: false,
      error: err?.message || 'bingetrix_refresh_failed',
    };
    sourceMetrics.set('bingetrix', metric);
    return metric;
  }
}

/**
 * Crawl Movidy (/pelis/ and /shows/)
 */
async function refreshMovidySource(): Promise<SourceRefreshMetric> {
  const started = Date.now();
  let count = 0;
  try {
    const targets: Array<{ url: string; mediaType: 'movie' | 'tv' }> = [
      { url: 'https://movidy.work/pelis/', mediaType: 'movie' },
      { url: 'https://movidy.work/shows/', mediaType: 'tv' },
    ];
    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;

    for (const t of targets) {
      const html = await fetchHtmlSafe(t.url, 'https://movidy.work/');
      if (html) {
        let m: RegExpExecArray | null;
        itemRe.lastIndex = 0;
        while ((m = itemRe.exec(html)) !== null) {
          const rawHref = String(m[1] || '').trim();
          const rawTitle = String(m[2] || '').trim();
          const rawPoster = String(m[3] || '').trim();
          if (!rawHref || !rawTitle) continue;
          const movidyUrl = (rawHref.startsWith('http') ? rawHref : `https://movidy.work${rawHref}`)
            .replace(/^https?:\/\/(?:www\.)?movidy\.(?:pw|tv|ws)\//i, 'https://movidy.work/');
          const absPoster = (rawPoster.startsWith('//')
            ? `https:${rawPoster}`
            : rawPoster.startsWith('http')
            ? rawPoster
            : `https://movidy.work${rawPoster}`)
            .replace(/^https?:\/\/(?:www\.)?movidy\.(?:pw|tv|ws)\//i, 'https://movidy.work/');
          const slug =
            movidyUrl.split('/ver/')[1]?.replace(/\//g, '').replace(/[^a-zA-Z0-9_-]/g, '') ||
            `${count}`;
          upsertIndexedEntry({
            id: `movidy-${slug}`,
            mediaType: t.mediaType,
            title: rawTitle,
            originalTitle: rawTitle.replace(/\s*\([^)]*\)/g, '').trim() || rawTitle,
            altTitle: rawTitle.match(/\(([^)]+)\)/)?.[1]?.trim(),
            year: 'HD',
            rating: '',
            overview: 'Disponible en streaming directo Castellano, Latino y VOSE vía Movidy.',
            poster: `/api/img-proxy?url=${encodeURIComponent(absPoster)}`,
            backdrop: `/api/img-proxy?url=${encodeURIComponent(absPoster)}`,
            movidyUrl,
            languages: ['Castellano', 'Latino', 'VOSE'],
            sources: ['movidy'],
            popularity: 20,
            indexedAt: Date.now(),
          });
          count += 1;
        }
      }
      await politeDelay(300);
    }

    const metric: SourceRefreshMetric = {
      source: 'movidy',
      lastRunAt: started,
      itemsIndexed: count,
      ok: count > 0,
    };
    sourceMetrics.set('movidy', metric);
    return metric;
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'movidy',
      lastRunAt: started,
      itemsIndexed: count,
      ok: false,
      error: err?.message || 'movidy_refresh_failed',
    };
    sourceMetrics.set('movidy', metric);
    return metric;
  }
}

/**
 * Crawl GnulaHD (https://dominiosgnulahd.com/ -> ww3.gnulahd.nu, gnulahd.click, gnulahd.bid)
 * & SeriesKao (https://serieskao.top/)
 */
async function refreshGnulaAndSeriesKao(): Promise<SourceRefreshMetric[]> {
  const out: SourceRefreshMetric[] = [];

  // 1. GnulaHD across all active mirrors & sections (peliculas, series, anime)
  const gStart = Date.now();
  let gCount = 0;
  try {
    await resolveActiveGnulaMirrors();
    const [moviesP1, seriesP1] = await Promise.all([
      scrapeGnulaCatalog({ mediaType: 'movie', page: 1 }).catch(() => ({ items: [], hasMore: false })),
      scrapeGnulaCatalog({ mediaType: 'tv', page: 1 }).catch(() => ({ items: [], hasMore: false })),
    ]);
    await politeDelay(200);
    const [moviesP2, animeP1] = await Promise.all([
      scrapeGnulaCatalog({ mediaType: 'movie', page: 2 }).catch(() => ({ items: [], hasMore: false })),
      scrapeGnulaCatalog({ mediaType: 'tv', category: 'anime', page: 1 }).catch(() => ({
        items: [],
        hasMore: false,
      })),
    ]);

    for (const item of [...moviesP1.items, ...moviesP2.items, ...seriesP1.items, ...animeP1.items]) {
      upsertIndexedEntry({
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        originalTitle: item.originalTitle || item.title,
        year: item.year || 'HD',
        rating: item.rating || '',
        overview: item.overview,
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        gnulaUrl: item.gnulaUrl,
        languages: item.languages,
        sources: ['gnula'],
        popularity: 21,
        indexedAt: Date.now(),
      });
      gCount += 1;
    }

    const metric: SourceRefreshMetric = {
      source: 'gnula',
      lastRunAt: gStart,
      itemsIndexed: gCount,
      ok: gCount > 0,
    };
    sourceMetrics.set('gnula', metric);
    out.push(metric);
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'gnula',
      lastRunAt: gStart,
      itemsIndexed: gCount,
      ok: false,
      error: err?.message,
    };
    sourceMetrics.set('gnula', metric);
    out.push(metric);
  }

  await politeDelay(300);

  // 2. SeriesKao
  const sStart = Date.now();
  let sCount = 0;
  try {
    const sHtml = await fetchHtmlSafe('https://serieskao.top/', 'https://serieskao.top/');
    if (sHtml) {
      const linkRe =
        /<a[^>]+href="(https?:\/\/serieskao\.top\/(?:serie|pelicula|ver)\/[^"]+)"[^>]*>[\s\S]{0,400}?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(sHtml)) !== null && sCount < 30) {
        const href = String(m[1] || '').trim();
        const poster = String(m[2] || '').trim();
        const title = String(m[3] || '').trim();
        if (!href || !title) continue;
        const isMovie = href.includes('/pelicula');
        upsertIndexedEntry({
          id: `serieskao-${normalizeCompactCatalogQuery(title).slice(0, 32)}`,
          mediaType: isMovie ? 'movie' : 'tv',
          title,
          originalTitle: title,
          year: 'HD',
          rating: '',
          overview: 'Disponible por capítulos y HD Español vía SeriesKao.',
          poster: poster ? `/api/img-proxy?url=${encodeURIComponent(poster)}` : '',
          backdrop: poster ? `/api/img-proxy?url=${encodeURIComponent(poster)}` : '',
          seriesKaoUrl: href,
          languages: ['Latino', 'Castellano', 'VOSE'],
          sources: ['serieskao'],
          popularity: 16,
          indexedAt: Date.now(),
        });
        sCount += 1;
      }
    }
    const metric: SourceRefreshMetric = {
      source: 'serieskao',
      lastRunAt: sStart,
      itemsIndexed: sCount,
      ok: true,
    };
    sourceMetrics.set('serieskao', metric);
    out.push(metric);
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'serieskao',
      lastRunAt: sStart,
      itemsIndexed: sCount,
      ok: false,
      error: err?.message,
    };
    sourceMetrics.set('serieskao', metric);
    out.push(metric);
  }

  return out;
}

/**
 * Ingest local & mirror seeds from Vest mirrors (321moviesfree, cuevana4br, flixlat, 123pelicula)
 */
async function refreshVestMirrors(): Promise<SourceRefreshMetric> {
  const started = Date.now();
  let count = 0;
  try {
    const entries = listVestCatalogEntries({ mediaType: 'all' });
    for (const ve of entries) {
      upsertIndexedEntry({
        id: ve.id || `vest-${normalizeCompactCatalogQuery(ve.title)}`,
        tmdbId: ve.tmdbId,
        mediaType: ve.mediaType === 'tv' ? 'tv' : 'movie',
        title: ve.title,
        originalTitle: ve.originalTitle || ve.title,
        year: ve.year || 'HD',
        rating: ve.rating || '',
        overview: ve.overview || '',
        poster: ve.poster || '',
        backdrop: ve.backdrop || ve.poster || '',
        vestUrl: ve.vestUrl,
        bingetrixUrl: ve.tmdbId
          ? ve.mediaType === 'tv'
            ? `https://bingetrix.sc/watch/tv/${ve.tmdbId}/1/1`
            : `https://bingetrix.sc/watch/${ve.tmdbId}`
          : undefined,
        languages: ve.languages || ['Castellano', 'Latino', 'VOSE'],
        sources: ['vest'],
        popularity: 22,
        indexedAt: Date.now(),
      });
      count += 1;
    }
    const metric: SourceRefreshMetric = { source: 'vest', lastRunAt: started, itemsIndexed: count, ok: true };
    sourceMetrics.set('vest', metric);
    return metric;
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'vest',
      lastRunAt: started,
      itemsIndexed: count,
      ok: false,
      error: err?.message,
    };
    sourceMetrics.set('vest', metric);
    return metric;
  }
}

export async function fetchTmdbSpanishAltTitles(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{ titles: string[]; year: string; esTitle?: string }> {
  const cleanId = Number(tmdbId || 0);
  if (!cleanId) return { titles: [], year: '' };
  const cKey = `${mediaType}:${cleanId}`;
  const cached = tmdbSpanishMetaCache.get(cKey);
  if (cached) return cached;

  try {
    const apiKey = ENV.tmdbApiKey;
    const url = `https://api.themoviedb.org/3/${mediaType}/${cleanId}?api_key=${apiKey}&language=es-ES&append_to_response=translations,alternative_titles`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return { titles: [], year: '' };
    const tmJson: any = await r.json();

    const esRegions = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'UY', '419']);
    const esTranslationTitles: string[] = [];
    const esAltTitles: string[] = [];
    const otherTitles: string[] = [];
    const primary = String(tmJson?.title || tmJson?.name || '').trim();
    const orig = String(tmJson?.original_title || tmJson?.original_name || '').trim();
    const year = String(tmJson?.release_date || tmJson?.first_air_date || '').split('-')[0] || '';

    const translations: any[] = Array.isArray(tmJson?.translations?.translations)
      ? tmJson.translations.translations
      : [];
    for (const tr of translations) {
      const trName = String(tr?.data?.title || tr?.data?.name || '').trim();
      if (!trName) continue;
      const langCode = String(tr?.iso_639_1 || '').toLowerCase();
      const countryCode = String(tr?.iso_3166_1 || '').toUpperCase();
      if (langCode === 'es') {
        if (countryCode === 'ES') esTranslationTitles.unshift(trName);
        else esTranslationTitles.push(trName);
      } else if (langCode === 'en') {
        otherTitles.push(trName);
      }
    }

    const rawAltList: any[] = Array.isArray(tmJson?.alternative_titles?.titles)
      ? tmJson.alternative_titles.titles
      : Array.isArray(tmJson?.alternative_titles?.results)
      ? tmJson.alternative_titles.results
      : [];
    for (const alt of rawAltList) {
      const altTitle = String(alt?.title || alt?.name || '').trim();
      if (!altTitle) continue;
      const countryCode = String(alt?.iso_3166_1 || '').toUpperCase();
      if (esRegions.has(countryCode)) {
        if (countryCode === 'ES') esAltTitles.unshift(altTitle);
        else esAltTitles.push(altTitle);
      } else if (countryCode === 'US' || countryCode === 'GB') {
        otherTitles.push(altTitle);
      }
    }

    const deduped = Array.from(
      new Set(
        [primary, ...esTranslationTitles, ...esAltTitles, orig, ...otherTitles]
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    const out = { titles: deduped, year, esTitle: primary || esTranslationTitles[0] || esAltTitles[0] || undefined };
    tmdbSpanishMetaCache.set(cKey, out);
    return out;
  } catch {
    return { titles: [], year: '' };
  }
}

/**
 * Live On-Demand Fallback Scraper when a query misses or underperforms in cache.
 * Searches MOVIDY FIRST (including Spanish hints), then TMDB es-ES & en-US + Gnula,
 * enriches TMDB matches with TMDB Spanish alt-titles -> Movidy, caches discoveries,
 * and returns Movidy-prioritized relevance-sorted matches.
 */
export async function liveOnDemandFallbackSearch(
  rawQuery: string,
  wantMediaType: 'movie' | 'tv' | 'all' = 'all'
): Promise<IndexedCatalogEntry[]> {
  const cleanQ = String(rawQuery || '').trim();
  if (cleanQ.length < 2) return [];

  const qCacheKey = `${wantMediaType}:${normalizeCompactCatalogQuery(cleanQ)}`;
  const cached = onDemandQueryCache.get(qCacheKey);
  if (cached) return cached;

  const apiKey = ENV.tmdbApiKey;
  const correctedQ = correctCommonSearchTypos(cleanQ);
  const tmdbSearchQ = correctedQ && correctedQ.toLowerCase() !== cleanQ.toLowerCase() ? correctedQ : cleanQ;
  const discovered: IndexedCatalogEntry[] = [];
  let directMovidyEntry: IndexedCatalogEntry | null = null;

  try {
    // 1. MOVIDY SEARCH FIRST (Always primary source, using original + typo-corrected + Spanish title hints)
    try {
      const hintsToTry = Array.from(
        new Set([
          ...generateSpanishTitleHints(cleanQ),
          ...generateSpanishTitleHints(tmdbSearchQ),
          tmdbSearchQ,
          cleanQ,
        ])
      ).filter((h) => h && h.length >= 2);

      const expectedMediaType = wantMediaType === 'all' ? undefined : wantMediaType;
      const movidyUrl = await findMovidyUrlByTitle(hintsToTry[0] || cleanQ, undefined, {
        titleHints: hintsToTry,
        expectedMediaType,
      }).catch(() => null);

      if (movidyUrl) {
        const mvMeta = await fetchMovidyPageMetadata(movidyUrl).catch(() => null);
        if (mvMeta && mvMeta.cleanTitle?.trim()) {
          directMovidyEntry = {
            id: `movidy-ondemand-${normalizeCompactCatalogQuery(mvMeta.cleanTitle)}`,
            mediaType: mvMeta.isTvShow ? 'tv' : 'movie',
            title: mvMeta.cleanTitle,
            originalTitle: mvMeta.cleanTitle,
            year: mvMeta.year || 'HD',
            rating: '',
            overview: mvMeta.overview || 'Disponible en Movidy.',
            poster: '',
            backdrop: '',
            movidyUrl,
            languages: ['Castellano', 'Latino', 'VOSE', 'EN'],
            sources: ['movidy'],
            popularity: 100,
            indexedAt: Date.now(),
          };
          discovered.push(directMovidyEntry);
        }
      }
    } catch {
      // ignore
    }

    // 2. Multi-language TMDB fallback & Gnula live search (Spanish first, then English/Multi)
    const tmdbUrls: Array<{ url: string; lang: 'en-US' | 'es-ES'; forcedType?: 'movie' | 'tv' }> = [
      {
        url: `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'es-ES',
      },
      {
        url: `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'en-US',
      },
    ];
    if (wantMediaType === 'movie') {
      tmdbUrls.unshift({
        url: `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'es-ES',
        forcedType: 'movie',
      });
    } else if (wantMediaType === 'tv') {
      tmdbUrls.unshift({
        url: `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'es-ES',
        forcedType: 'tv',
      });
    }

    const [tmdbPayloads, gnulaLive] = await Promise.all([
      Promise.all(
        tmdbUrls.map(async (reqCfg) => {
          try {
            const r = await fetch(reqCfg.url, { signal: AbortSignal.timeout(4000) });
            if (!r.ok) return { rows: [] as any[], reqCfg };
            const json: any = await r.json();
            return { rows: Array.isArray(json?.results) ? json.results : [], reqCfg };
          } catch {
            return { rows: [] as any[], reqCfg };
          }
        })
      ),
      Promise.race([
        scrapeGnulaCatalog({ query: tmdbSearchQ, mediaType: wantMediaType }).catch(() => ({
          items: [],
          hasMore: false,
        })),
        new Promise<{ items: any[]; hasMore: boolean }>((r) =>
          setTimeout(() => r({ items: [], hasMore: false }), 3500)
        ),
      ]),
    ]);

    for (const { rows, reqCfg } of tmdbPayloads) {
      for (const row of rows) {
        const mType: 'movie' | 'tv' | null =
          reqCfg.forcedType ||
          (row.media_type === 'tv' ? 'tv' : row.media_type === 'movie' ? 'movie' : null);
        if (!mType) continue;
        if (wantMediaType !== 'all' && mType !== wantMediaType) continue;
        const entry = mapTmdbRawToIndexed(
          row,
          mType,
          ['bingetrix', 'tmdb'],
          ['Castellano', 'Latino', 'VOSE', 'EN']
        );
        if (entry) {
          upsertIndexedEntry(entry);
          discovered.push(entry);
        }
      }
    }

    // 2B. If Movidy hasn't been attached to top TMDB matches yet, translate top TMDB hits into Spanish
    // alternative titles (e.g. "Spider-Man: Brand New Day" -> "Spider-Man: Un nuevo día") and search Movidy!
    const topTmdbCandidates = discovered
      .filter((d) => Boolean(d.tmdbId) && !d.movidyUrl)
      .sort(
        (a, b) =>
          scoreTitleRelevance(b.title, b.originalTitle, tmdbSearchQ, {
            altTitle: b.altTitle,
            popularity: b.popularity,
            voteCount: b.voteCount,
          }) -
          scoreTitleRelevance(a.title, a.originalTitle, tmdbSearchQ, {
            altTitle: a.altTitle,
            popularity: a.popularity,
            voteCount: a.voteCount,
          })
      )
      .slice(0, 4);

    if (topTmdbCandidates.length > 0) {
      await Promise.all(
        topTmdbCandidates.map(async (cand) => {
          if (!cand.tmdbId) return;
          const esMeta = await fetchTmdbSpanishAltTitles(cand.tmdbId, cand.mediaType);
          const allCandHints = Array.from(
            new Set([cand.title, cand.originalTitle, ...esMeta.titles].filter(Boolean))
          );

          // Check if directMovidyEntry already matches one of these Spanish alt titles + compatible year
          const yearsCompatible =
            !directMovidyEntry ||
            !/^\d{4}$/.test(directMovidyEntry.year) ||
            !/^\d{4}$/.test(cand.year) ||
            Math.abs(Number(directMovidyEntry.year) - Number(cand.year)) <= 1;
          if (
            directMovidyEntry &&
            yearsCompatible &&
            directMovidyEntry.mediaType === cand.mediaType &&
            areTitlesStrictlyEqual(directMovidyEntry.title, allCandHints)
          ) {
            cand.movidyUrl = directMovidyEntry.movidyUrl;
            cand.altTitle =
              directMovidyEntry.title !== cand.title ? directMovidyEntry.title : cand.altTitle;
            if (!cand.sources.includes('movidy')) cand.sources.unshift('movidy');
            cand.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
            upsertIndexedEntry(cand);
            return;
          }

          if (esMeta.titles.length > 0) {
            const matchedMovidyUrl = await findMovidyUrlByTitle(
              esMeta.titles[0],
              esMeta.year || (cand.year !== 'HD' ? cand.year : undefined),
              {
                titleHints: allCandHints,
                expectedMediaType: cand.mediaType,
              }
            ).catch(() => null);

            if (matchedMovidyUrl) {
              cand.movidyUrl = matchedMovidyUrl;
              cand.altTitle =
                esMeta.esTitle && esMeta.esTitle !== cand.title ? esMeta.esTitle : cand.altTitle;
              if (!cand.sources.includes('movidy')) cand.sources.unshift('movidy');
              cand.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
              upsertIndexedEntry(cand);
            }
          }
        })
      );
    }

    // Attach directMovidyEntry onto the year-compatible title-matching TMDB item and remove duplicate posterless Movidy-only item
    if (directMovidyEntry) {
      const mvYr = /^\d{4}$/.test(directMovidyEntry.year) ? Number(directMovidyEntry.year) : 0;
      const matchedTmdb = discovered
        .filter((d) => {
          if (!d.tmdbId) return false;
          if (d.movidyUrl === directMovidyEntry!.movidyUrl) return true;
          if (d.mediaType !== directMovidyEntry!.mediaType) return false;
          if (
            !areTitlesStrictlyEqual(
              directMovidyEntry!.title,
              [d.title, d.originalTitle, d.altTitle || ''].filter(Boolean)
            )
          ) {
            return false;
          }
          const dYr = /^\d{4}$/.test(d.year) ? Number(d.year) : 0;
          return !mvYr || !dYr || Math.abs(mvYr - dYr) <= 1;
        })
        .sort((a, b) => (b.voteCount || b.popularity || 0) - (a.voteCount || a.popularity || 0))[0];

      if (matchedTmdb) {
        matchedTmdb.movidyUrl = matchedTmdb.movidyUrl || directMovidyEntry.movidyUrl;
        if (!matchedTmdb.sources.includes('movidy')) matchedTmdb.sources.unshift('movidy');
        matchedTmdb.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
        upsertIndexedEntry(matchedTmdb);
        const mvIdx = discovered.indexOf(directMovidyEntry);
        if (mvIdx !== -1) discovered.splice(mvIdx, 1);
      }
    }

    for (const gItem of gnulaLive.items) {
      const matchingTmdb = discovered.find(
        (d) =>
          d.mediaType === gItem.mediaType &&
          areTitlesStrictlyEqual(gItem.title, [d.title, d.originalTitle, d.altTitle || ''].filter(Boolean)) &&
          (!/^\d{4}$/.test(gItem.year) || !/^\d{4}$/.test(d.year) || gItem.year === d.year)
      );
      if (matchingTmdb) {
        matchingTmdb.gnulaUrl = matchingTmdb.gnulaUrl || gItem.gnulaUrl;
        if (!matchingTmdb.sources.includes('gnula')) matchingTmdb.sources.push('gnula');
        upsertIndexedEntry(matchingTmdb);
      } else {
        const gEntry: IndexedCatalogEntry = {
          id: gItem.id,
          mediaType: gItem.mediaType,
          title: gItem.title,
          originalTitle: gItem.originalTitle,
          year: gItem.year || 'HD',
          rating: gItem.rating || '',
          overview: gItem.overview,
          poster: gItem.poster,
          backdrop: gItem.backdrop || gItem.poster,
          gnulaUrl: gItem.gnulaUrl,
          languages: gItem.languages,
          sources: ['gnula'],
          popularity: 21,
          indexedAt: Date.now(),
        };
        upsertIndexedEntry(gEntry);
        discovered.push(gEntry);
      }
    }

    // 3. Include matching entries already discovered across Movidy / Gnula / Vest / SeriesKao
    const fromIndex = searchIndexedCatalog(cleanQ, { mediaType: wantMediaType, limit: 24 });
    const mergedMap = new Map<string, IndexedCatalogEntry>();
    for (const item of [...discovered, ...fromIndex]) {
      const k = buildEntryKey(item);
      const existing = mergedMap.get(k);
      if (!existing) {
        mergedMap.set(k, indexedCatalogCache.get(k) || item);
      } else {
        mergedMap.set(k, {
          ...existing,
          gnulaUrl: existing.gnulaUrl || item.gnulaUrl,
          movidyUrl: existing.movidyUrl || item.movidyUrl,
          altTitle:
            existing.altTitle || (item.title !== existing.title ? item.title : undefined),
          languages: existing.movidyUrl || item.movidyUrl
            ? ['Castellano', 'Latino', 'VOSE', 'EN']
            : existing.languages,
          sources: Array.from(new Set([...existing.sources, ...item.sources])),
        });
      }
    }

    const scored = Array.from(mergedMap.values())
      .map((entry) => ({
        entry,
        score: scoreTitleRelevance(entry.title, entry.originalTitle, tmdbSearchQ, {
          altTitle: entry.altTitle,
          popularity: entry.popularity,
          voteCount: entry.voteCount,
        }),
      }))
      .filter((x) => x.score >= 70)
      .sort((a, b) => {
        // Prioritize Movidy-matched items when title relevance is in the same tier
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) <= 35) {
          const aMov = a.entry.movidyUrl ? 1 : 0;
          const bMov = b.entry.movidyUrl ? 1 : 0;
          if (aMov !== bMov) return bMov - aMov;
        }
        return scoreDiff;
      })
      .map((x) => x.entry);

    onDemandQueryCache.set(qCacheKey, scored);
    return scored;
  } catch {
    return searchIndexedCatalog(cleanQ, { mediaType: wantMediaType, limit: 20 });
  }
}

export async function runRefreshCycle(): Promise<RefreshCycleSummary> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const startedAt = Date.now();
    const vestMetric = await refreshVestMirrors();
    await politeDelay(250);
    const bingetrixMetric = await refreshBingetrixAndTmdb();
    await politeDelay(300);
    const movidyMetric = await refreshMovidySource();
    await politeDelay(300);
    const [gnulaMetric, seriesKaoMetric] = await refreshGnulaAndSeriesKao();

    const finishedAt = Date.now();
    const summary: RefreshCycleSummary = {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      totalIndexed: indexedCatalogCache.size,
      sources: [vestMetric, bingetrixMetric, movidyMetric, gnulaMetric, seriesKaoMetric],
    };
    lastCycleSummary = summary;
    logger.info(
      {
        durationMs: summary.durationMs,
        totalIndexed: summary.totalIndexed,
        sources: summary.sources.map((s) => `${s.source}:${s.itemsIndexed}`),
      },
      'catalog_refresh_cycle_complete'
    );
    return summary;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export function startCatalogRefreshScheduler(
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS
): void {
  if (ENV.nodeEnv === 'test' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    return;
  }
  if (schedulerTimer) return;

  // Staggered non-blocking warm-up 12s after boot so port 3000 & interactive play stay instant
  initialWarmupTimer = setTimeout(() => {
    void runRefreshCycle();
  }, 12_000);
  initialWarmupTimer.unref?.();

  schedulerTimer = setInterval(() => {
    void runRefreshCycle();
  }, Math.max(60_000, intervalMs));
  schedulerTimer.unref?.();
}

export function stopCatalogRefreshScheduler(): void {
  if (initialWarmupTimer) {
    clearTimeout(initialWarmupTimer);
    initialWarmupTimer = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function getCatalogRefreshStatus() {
  return {
    schedulerRunning: Boolean(schedulerTimer),
    totalIndexed: indexedCatalogCache.size,
    lastCycle: lastCycleSummary,
    sources: Array.from(sourceMetrics.values()),
  };
}
