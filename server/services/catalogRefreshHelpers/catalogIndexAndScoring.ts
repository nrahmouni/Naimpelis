import { ENV } from '../../config/env.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { CHROME_UA, curlGetText } from '../../extractors/httpHelpers.ts';

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

export interface RefreshCycleSummary {
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  totalIndexed: number;
  sources: SourceRefreshMetric[];
}

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const ONDEMAND_CACHE_TTL_MS = 20 * 60 * 1000;

export const indexedCatalogCache = new LruTtlCache<string, IndexedCatalogEntry>(
  3000,
  INDEX_TTL_MS
);
export const onDemandQueryCache = new LruTtlCache<string, IndexedCatalogEntry[]>(
  250,
  ONDEMAND_CACHE_TTL_MS
);

const indexedKeySet = new Set<string>();
export const sourceMetrics = new Map<CatalogSourceTag, SourceRefreshMetric>();

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
          Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1)
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
    if (
      qTokens.length > 0 &&
      qTokens.length <= candTokens.length &&
      qTokens.every((qt) => candTokens.some((ct) => doTokensMatchFuzzy(qt, ct)))
    ) {
      const closeness = Math.round((qTokens.length / Math.max(1, candTokens.length)) * 80);
      const phraseBonus = nSpace.includes(normQ) ? 60 : 0;
      bestTier = Math.max(bestTier, 320 + closeness + phraseBonus);
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

export function buildEntryKey(entry: Pick<IndexedCatalogEntry, 'mediaType' | 'tmdbId' | 'title'>): string {
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

export async function politeDelay(ms: number): Promise<void> {
  if (ENV.nodeEnv === 'test') return;
  await new Promise((r) => setTimeout(r, ms));
}

export async function fetchHtmlSafe(url: string, referer: string): Promise<string> {
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

export function mapTmdbRawToIndexed(
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
