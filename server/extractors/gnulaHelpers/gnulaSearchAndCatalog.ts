import {
  CHROME_UA,
  areTitlesStrictlyEqual,
  curlGetText,
  normalizeTitleForMatch,
} from '../httpHelpers.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { logger } from '../../utils/logger.ts';
import {
  type GnulaCatalogCardItem,
  type GnulaSearchResultItem,
  fetchGnulaPageMetadata,
  fetchGnulaPathWithMirrorFailover,
  getOrderedGnulaMirrors,
  normalizeGnulaUrl,
  parseGnulaCardsFromHtml,
  setActiveGnulaOrigin,
  verifyGnulaMetaMatch,
} from './gnulaMirrorsAndParser.ts';

const gnulaSearchCache = new LruTtlCache<string, GnulaSearchResultItem[]>(300, 10 * 60 * 1000);
const gnulaCatalogCache = new LruTtlCache<
  string,
  { items: GnulaCatalogCardItem[]; hasMore: boolean }
>(120, 8 * 60 * 1000);

/**
 * Fast search query on Gnula HD via /wp-json/gnrd/v1/search?q= with mirror failover
 */
export async function searchGnulaHd(query: string): Promise<GnulaSearchResultItem[]> {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return [];

  const cacheKey = q.toLowerCase();
  const cached = gnulaSearchCache.get(cacheKey);
  if (cached) return cached;

  const mirrors = await getOrderedGnulaMirrors();

  for (const origin of mirrors) {
    try {
      const searchApi = `${origin}/wp-json/gnrd/v1/search?q=${encodeURIComponent(q)}`;
      const { text } = await curlGetText(
        searchApi,
        {
          'User-Agent': CHROME_UA,
          Referer: `${origin}/`,
          Accept: 'application/json',
        },
        4,
        true
      );
      if (text && text.trim().startsWith('{')) {
        const json = JSON.parse(text);
        if (Array.isArray(json?.results)) {
          setActiveGnulaOrigin(origin);
          const results: GnulaSearchResultItem[] = json.results.map((r: any) => ({
            title: String(r.title || '').trim(),
            url: normalizeGnulaUrl(String(r.url || '').trim(), origin),
            img: normalizeGnulaUrl(String(r.img || '').trim(), origin),
            type: String(r.type || 'Pelicula').trim(),
            year: String(r.year || '').replace(/\D/g, ''),
          }));
          gnulaSearchCache.set(cacheKey, results);
          return results;
        }
      }
    } catch {
      // try next mirror
    }
  }

  // HTML search fallback across mirrors
  const htmlRes = await fetchGnulaPathWithMirrorFailover(`/?s=${encodeURIComponent(q)}`, {
    timeoutMs: 4500,
  });
  if (htmlRes?.text) {
    const cards = parseGnulaCardsFromHtml(htmlRes.text, htmlRes.origin);
    if (cards.length > 0) {
      const results: GnulaSearchResultItem[] = cards.map((c) => ({
        title: c.title,
        url: c.gnulaUrl,
        img: c.poster,
        type: c.mediaType === 'tv' ? 'Serie' : 'Pelicula',
        year: /^\d{4}$/.test(c.year) ? c.year : '',
      }));
      gnulaSearchCache.set(cacheKey, results);
      return results;
    }
  }

  return [];
}

/**
 * Finds matching Gnula HD page for a movie or TV series given title hints and year
 */
export async function findGnulaHdUrlByTitle(
  searchTerms: string[],
  expectedYear?: string,
  opts?: {
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    titleHints?: string[];
    expectedMediaType?: 'movie' | 'tv';
  }
): Promise<string | null> {
  const hints = Array.from(
    new Set(
      [...searchTerms, ...(opts?.titleHints || [])]
        .map((s) => String(s || '').replace(/\s*\([^)]*\)/g, '').trim())
        .filter((s) => normalizeTitleForMatch(s).length >= 2)
    )
  );
  if (hints.length === 0) return null;

  const wantType = opts?.expectedMediaType === 'tv' ? 'serie' : opts?.expectedMediaType === 'movie' ? 'pelicula' : '';

  const pickFromHits = async (hits: GnulaSearchResultItem[]): Promise<string | null> => {
    if (hits.length === 0) return null;

    const typedHits = wantType
      ? hits.filter((h) => {
          const nt = normalizeTitleForMatch(h.type || '');
          if (!nt) return true;
          if (wantType === 'serie') return nt.includes('serie') || nt.includes('anime');
          return nt.includes('pelicula');
        })
      : hits;

    const pool = typedHits.length > 0 ? typedHits : hits;

    // Prioritize exact title or exact year hits first so we inspect minimal HTML pages
    const scoredHits = pool
      .map((h) => {
        const titleEq = areTitlesStrictlyEqual(h.title, hints) ? 100 : 0;
        const yearEq =
          expectedYear && h.year && h.year === expectedYear
            ? 50
            : expectedYear && h.year && Math.abs(parseInt(h.year, 10) - parseInt(expectedYear, 10)) <= 1
            ? 15
            : 0;
        const prefixHit = hints.some((hint) => {
          const nh = normalizeTitleForMatch(hint);
          const nt = normalizeTitleForMatch(h.title);
          return nh && nt && (nt.includes(nh) || nh.includes(nt));
        })
          ? 20
          : 0;
        return { hit: h, score: titleEq + yearEq + prefixHit };
      })
      .sort((a, b) => b.score - a.score);

    let adjacentFallback: string | null = null;
    const validHits = scoredHits
      .filter(
        ({ hit }) =>
          Boolean(hit.url) &&
          !(expectedYear && hit.year && Math.abs(parseInt(hit.year, 10) - parseInt(expectedYear, 10)) > 1)
      )
      .slice(0, 4);

    // Inspect top candidates concurrently rather than sequentially for ~3x faster resolution
    const inspectedPairs = await Promise.all(
      validHits.map(async ({ hit }) => ({
        hit,
        pageMeta: await fetchGnulaPageMetadata(hit.url).catch(() => null),
      }))
    );

    for (const { hit, pageMeta } of inspectedPairs) {
      if (!pageMeta) continue;

      const verdict = verifyGnulaMetaMatch(pageMeta, {
        titleHints: hints,
        expectedYear,
        expectedDirector: opts?.expectedDirector,
        expectedRuntimeMin: opts?.expectedRuntimeMin,
        expectedMediaType: opts?.expectedMediaType,
      });

      if (verdict.ok) {
        if (verdict.exactYear || !expectedYear) {
          return pageMeta.resolvedUrl || hit.url;
        }
        if (!adjacentFallback) {
          adjacentFallback = pageMeta.resolvedUrl || hit.url;
        }
      } else if (
        expectedYear &&
        pageMeta.year === expectedYear &&
        (!opts?.expectedMediaType ||
          (opts.expectedMediaType === 'movie' && !pageMeta.isTvShow) ||
          (opts.expectedMediaType === 'tv' && pageMeta.isTvShow)) &&
        hints.some((h) => {
          const nh = normalizeTitleForMatch(h);
          const nc = normalizeTitleForMatch(pageMeta.cleanTitle);
          const no = normalizeTitleForMatch(pageMeta.origTitle);
          return (
            (nh.length >= 4 && (nc.includes(nh) || no.includes(nh))) ||
            (nc.length >= 4 && nh.includes(nc)) ||
            (no.length >= 4 && nh.includes(no))
          );
        })
      ) {
        // Exact year + matching franchise/original title match (e.g. non-literal localized title)
        return pageMeta.resolvedUrl || hit.url;
      }
    }

    return adjacentFallback;
  };

  // Query top 4 hints concurrently for low latency (covers English + non-literal ES translations)
  const firstBatchResults = await Promise.all(hints.slice(0, 4).map((term) => searchGnulaHd(term)));
  const mergedFirst = Array.from(
    new Map(firstBatchResults.flat().map((r) => [r.url, r])).values()
  );
  const foundFirst = await pickFromHits(mergedFirst);
  if (foundFirst) return foundFirst;

  // Query remaining localized hints + franchise prefix if needed
  const remainingTerms = [...hints.slice(3, 6)];
  if (expectedYear) {
    const prefix = hints[0].split(/[:\-\u2013]/)[0]?.trim();
    if (prefix && prefix.length >= 3 && !hints.includes(prefix)) {
      remainingTerms.push(prefix);
    }
  }
  if (remainingTerms.length > 0) {
    const secondBatchResults = await Promise.all(
      remainingTerms.slice(0, 3).map((term) => searchGnulaHd(term))
    );
    const mergedSecond = Array.from(
      new Map(secondBatchResults.flat().map((r) => [r.url, r])).values()
    );
    const foundSecond = await pickFromHits(mergedSecond);
    if (foundSecond) return foundSecond;
  }

  return null;
}

/**
 * Scrapes Gnula HD catalog across operational mirrors (ww3.gnulahd.nu, gnulahd.click, gnulahd.bid)
 */
export async function scrapeGnulaCatalog(opts: {
  category?: string;
  page?: number;
  query?: string;
  mediaType?: 'movie' | 'tv' | 'all';
}): Promise<{ items: GnulaCatalogCardItem[]; hasMore: boolean }> {
  const category = String(opts.category || 'trending').toLowerCase();
  const page = Math.max(1, opts.page || 1);
  const query = String(opts.query || '').trim();
  const mediaType = opts.mediaType || 'movie';

  const cacheKey = `${mediaType}|${category}|${page}|${query.toLowerCase()}`;
  const cached = gnulaCatalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let relPath = '/ver/peliculas/';
    if (query) {
      relPath = page > 1 ? `/?s=${encodeURIComponent(query)}&pag=${page}` : `/?s=${encodeURIComponent(query)}`;
    } else if (mediaType === 'tv') {
      const base = category === 'anime' ? '/ver/anime/' : '/ver/series/';
      relPath = page > 1 ? `${base}?pag=${page}` : base;
    } else {
      const base = category === 'anime' ? '/ver/anime/' : '/ver/peliculas/';
      relPath = page > 1 ? `${base}?pag=${page}` : base;
    }

    const [res, jsonHits] = await Promise.all([
      fetchGnulaPathWithMirrorFailover(relPath, { timeoutMs: 4800 }),
      query && page === 1
        ? searchGnulaHd(query).catch(() => [] as GnulaSearchResultItem[])
        : Promise.resolve([] as GnulaSearchResultItem[]),
    ]);

    const jsonTypeByUrl = new Map<string, 'movie' | 'tv'>();
    for (const hit of jsonHits) {
      if (!hit.url) continue;
      const normHitUrl = normalizeGnulaUrl(hit.url);
      if (!normHitUrl) continue;
      const isTvHit = /serie|anime/i.test(hit.type || '') && !/pelicula/i.test(hit.type || '');
      jsonTypeByUrl.set(normHitUrl, isTvHit ? 'tv' : 'movie');
    }

    let items: GnulaCatalogCardItem[] = [];
    if (res?.text) {
      items = parseGnulaCardsFromHtml(res.text, res.origin)
        .map((it) => {
          const normUrl = normalizeGnulaUrl(it.gnulaUrl);
          const inferredType: 'movie' | 'tv' = !query
            ? mediaType === 'tv'
              ? 'tv'
              : mediaType === 'movie'
              ? 'movie'
              : it.mediaType
            : jsonTypeByUrl.get(normUrl) || it.mediaType;
          return {
            ...it,
            mediaType: inferredType,
          };
        })
        .filter((it) => {
          if (!query || mediaType === 'all') return true;
          return it.mediaType === mediaType;
        });
    }

    // Supplement search with JSON API hits when querying
    if (query && page === 1) {
      const existingUrls = new Set(items.map((it) => normalizeGnulaUrl(it.gnulaUrl)));
      for (const hit of jsonHits) {
        if (!hit.url) continue;
        const normHitUrl = normalizeGnulaUrl(hit.url);
        if (existingUrls.has(normHitUrl)) continue;
        const isTvHit = /serie|anime/i.test(hit.type || '') && !/pelicula/i.test(hit.type || '');
        if (mediaType === 'movie' && isTvHit) continue;
        if (mediaType === 'tv' && !isTvHit) continue;
        existingUrls.add(normHitUrl);
        const slug =
          normHitUrl
            .split('/ver/')[1]
            ?.replace(/\//g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '') || `${items.length}`;
        const posterUrl = hit.img
          ? `/api/img-proxy?url=${encodeURIComponent(normalizeGnulaUrl(hit.img))}`
          : '';
        items.push({
          id: `gnula-${slug}`,
          mediaType: isTvHit ? 'tv' : 'movie',
          title: hit.title,
          originalTitle: hit.title,
          year: /^\d{4}$/.test(hit.year) ? hit.year : 'HD',
          rating: '',
          overview:
            'Disponible en reproducción directa HD HLS (Castellano, Español Latino y VOSE vía GnulaHD).',
          poster: posterUrl,
          backdrop: posterUrl,
          gnulaUrl: normHitUrl,
          languages: ['Castellano', 'Latino', 'VOSE'],
          genres: [],
          sources: ['gnula'],
        });
      }
    }

    const hasMore = Boolean(res?.text && (res.text.includes('gnrd-loadmore') || items.length >= 24));
    const payload = { items, hasMore };
    if (items.length > 0) {
      gnulaCatalogCache.set(cacheKey, payload);
    }
    return payload;
  } catch (err) {
    logger.warn({ err }, 'scrapeGnulaCatalog_error');
    return { items: [], hasMore: false };
  }
}
