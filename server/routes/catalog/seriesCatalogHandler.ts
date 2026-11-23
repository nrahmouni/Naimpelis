import type express from 'express';
import { ENV } from '../../config/env.ts';
import { logger } from '../../utils/logger.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import {
  ANIME_PROVIDER_IDS,
  ANIMEBOX_CURATED_TV_IDS,
  CURATED_4K_SERIES_IDS,
  CURATED_4K_SERIES_SET,
  CURATED_SPANISH_KIDS_TV_IDS,
  STREAMING_PROVIDER_MAP,
  USER_MASTERPIECE_ANIME_TV_IDS,
  matchMasterpieceAnimeIds,
  resolveEffectiveProviderAndQuery,
} from '../../data/vodConstants.ts';
import {
  CHROME_UA,
  areTitlesStrictlyEqual,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
} from '../../extractors/httpHelpers.ts';
import {
  MOVIDY_ORIGIN,
  normalizeMovidyUrl,
} from '../../extractors/bingetrixMovidy.ts';
import {
  normalizeGnulaUrl,
  scrapeGnulaCatalog,
} from '../../extractors/gnulaHdExtractor.ts';
import {
  fetchTmdbJson,
  fetchTmdbUrlJson,
} from '../../services/tmdbService.ts';
import {
  listVestCatalogEntries,
} from '../../services/vestMirrorService.ts';
import {
  correctCommonSearchTypos,
  liveOnDemandFallbackSearch,
  scoreTitleRelevance,
  searchIndexedCatalog,
} from '../../services/catalogRefreshService.ts';
import {
  SERIES_GENRE_MAP,
  buildSmartConcatQueryVariants,
  fetchTmdbItemsByIds,
  mapTmdbGenreLabels,
  normalizeNoSpaceForSearch,
  rankTmdbSearchResultsForQuery,
} from '../../services/tmdbCatalogHelpers.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export const seriesCatalogCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  450,
  10 * 60 * 1000
);
export const seriesCatalogStaleCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  450,
  24 * 60 * 60 * 1000
);
export const movidyTvTmdbCache = new LruTtlCache<string, any | null>(350, 60 * 60 * 1000);

async function resolveMovidyShowToTmdbSeries(rawItem: {
  title: string;
  movidyUrl: string;
  poster: string;
  verifyShowOnMovidy?: boolean;
}): Promise<any | null> {
  const cacheKey = rawItem.movidyUrl || normalizeTitleForMatch(rawItem.title);
  if (movidyTvTmdbCache.has(cacheKey)) {
    return movidyTvTmdbCache.get(cacheKey) || null;
  }

  try {
    if (rawItem.verifyShowOnMovidy && rawItem.movidyUrl) {
      const checkUrl = normalizeMovidyUrl(rawItem.movidyUrl);
      const pageHtml = await fetchTextWithCurlFallback(
        checkUrl,
        { 'User-Agent': CHROME_UA, Referer: `${MOVIDY_ORIGIN}/` },
        3500
      );
      if (!pageHtml || !pageHtml.includes('id="eps"')) {
        movidyTvTmdbCache.set(cacheKey, null);
        return null;
      }
    }

    const cleanTitle = String(rawItem.title || '').replace(/\s*\([^)]*\)/g, '').trim();
    const parenTitle = (String(rawItem.title || '').match(/\(([^)]+)\)/)?.[1] || '').trim();
    const candidates = [cleanTitle, parenTitle].filter((c) => c.length >= 2);

    let bestMatch: any = null;
    for (const q of candidates) {
      const tJson = await fetchTmdbJson<any>(
        '/search/tv',
        { language: 'es-ES', query: q, page: 1, include_adult: false },
        15 * 60 * 1000
      ).catch(() => null);
      const results: any[] = Array.isArray(tJson?.results) ? tJson.results : [];
      if (results.length === 0) continue;

      bestMatch =
        results.find(
          (r) =>
            areTitlesStrictlyEqual(String(r.name || ''), [q]) ||
            areTitlesStrictlyEqual(String(r.original_name || ''), [q])
        ) || null;
      if (bestMatch) break;
    }

    if (!bestMatch?.id) {
      movidyTvTmdbCache.set(cacheKey, null);
      return null;
    }

    const resolved = {
      id: `tv-es-ES-${bestMatch.id}`,
      tmdbId: bestMatch.id,
      mediaType: 'tv',
      title: bestMatch.name || rawItem.title || bestMatch.original_name || 'Serie',
      originalTitle: bestMatch.original_name || bestMatch.name || rawItem.title || '',
      year: bestMatch.first_air_date
        ? String(bestMatch.first_air_date).split('-')[0]
        : 'TV',
      rating: bestMatch.vote_average ? Number(bestMatch.vote_average).toFixed(1) : '',
      overview:
        bestMatch.overview ||
        'Serie disponible en Castellano, Español Latino y VOSE por temporadas y episodios en HD.',
      poster: bestMatch.poster_path
        ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}`
        : rawItem.poster,
      backdrop: bestMatch.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`
        : rawItem.poster,
      movidyUrl: rawItem.movidyUrl,
      languages: ['Español', 'VOSE'],
    };

    movidyTvTmdbCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    movidyTvTmdbCache.set(cacheKey, null);
    return null;
  }
}

async function scrapeMovidySeriesCatalog(opts: {
  category: string;
  page: number;
  query: string;
}): Promise<{ series: any[]; hasMore: boolean }> {
  const { category, page, query } = opts;
  if (!query && category !== 'trending' && category !== 'popular') {
    return { series: [], hasMore: false };
  }

  try {
    const targetUrl = query
      ? page > 1
        ? `${MOVIDY_ORIGIN}/page/${page}/?s=${encodeURIComponent(query)}`
        : `${MOVIDY_ORIGIN}/?s=${encodeURIComponent(query)}`
      : page > 1
      ? `${MOVIDY_ORIGIN}/shows/page/${page}`
      : `${MOVIDY_ORIGIN}/shows/`;

    const html = await fetchTextWithCurlFallback(
      targetUrl,
      { 'User-Agent': CHROME_UA, Referer: `${MOVIDY_ORIGIN}/` },
      4800
    );

    if (!html) return { series: [], hasMore: false };

    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;
    const rawItems: {
      title: string;
      movidyUrl: string;
      poster: string;
      verifyShowOnMovidy: boolean;
    }[] = [];

    const maxItems = query ? 6 : 18;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(html)) !== null && rawItems.length < maxItems) {
      const rawHref = String(m[1] || '').trim();
      const rawTitle = String(m[2] || '').trim();
      const rawPoster = String(m[3] || '').trim();
      if (!rawHref || !rawTitle) continue;

      const movidyUrl = normalizeMovidyUrl(rawHref);
      const absPoster = rawPoster.startsWith('//')
        ? `https:${rawPoster}`
        : rawPoster.startsWith('http')
        ? normalizeMovidyUrl(rawPoster)
        : `${MOVIDY_ORIGIN}${rawPoster.startsWith('/') ? rawPoster : `/${rawPoster}`}`;
      const proxiedPoster = `/api/img-proxy?url=${encodeURIComponent(absPoster)}`;

      rawItems.push({
        title: rawTitle,
        movidyUrl,
        poster: proxiedPoster,
        verifyShowOnMovidy: Boolean(query),
      });
    }

    const resolvedList = await Promise.all(
      rawItems.map((it) => resolveMovidyShowToTmdbSeries(it))
    );
    const series = resolvedList.filter(Boolean);
    const hasNextPage = html.includes(`/page/${page + 1}`);
    return { series, hasMore: hasNextPage && series.length > 0 };
  } catch (err) {
    logger.warn({ err }, 'scrapeMovidySeriesCatalog error');
    return { series: [], hasMore: false };
  }
}

export async function handleSeriesCatalogRequest(
  req: express.Request,
  res: express.Response,
  deps?: {
    fetchTmdbUrlJsonFn?: typeof fetchTmdbUrlJson;
    staleCache?: typeof seriesCatalogStaleCache;
  }
) {
  const tmdbUrlJson = deps?.fetchTmdbUrlJsonFn || fetchTmdbUrlJson;
  const staleCache = deps?.staleCache || seriesCatalogStaleCache;
  try {
    const rawQuery = String(req.query.query || '').trim();
    const rawProvider = String(req.query.provider || 'all').toLowerCase().trim();
    const { provider, query } = resolveEffectiveProviderAndQuery(rawProvider, rawQuery);
    const provCfg = STREAMING_PROVIDER_MAP[provider];
    const isAnime = ANIME_PROVIDER_IDS.has(provider);
    const category = String(req.query.category || 'trending').toLowerCase();
    const sort = String(req.query.sort || '').toLowerCase();
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const isSpanishCatalog = langParam === 'es-ES';
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `v9|${langParam}|${provider}|${category}|${sort}|${page}|${query}`;
    const cached = seriesCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ success: true, series: cached.series, hasMore: cached.hasMore, page });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const recentSimulcastIso = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    let endpoint = '';
    let originalsBoostEndpoint = '';
    let curatedAnimeSeedPromise: Promise<any[]> = Promise.resolve([]);

    const ANIME_SERIES_GENRES: Record<string, string> = {
      shonen: '16,10759',
      action: '16,10759',
      fantasy: '16,10765',
      scifi: '16,10765',
      comedy: '16,35',
      drama: '16,18',
      mystery: '16,9648',
    };

    if (query) {
      const matchedMasterpieceIds = matchMasterpieceAnimeIds(query);
      if (matchedMasterpieceIds.length > 0) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(matchedMasterpieceIds, 'tv', langParam);
      }
      endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=${langParam}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    } else if (isAnime) {
      if (page === 1 && (category === 'trending' || category === 'popular' || category === 'shonen')) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(
          provider === 'animebox'
            ? [...USER_MASTERPIECE_ANIME_TV_IDS, ...ANIMEBOX_CURATED_TV_IDS]
            : USER_MASTERPIECE_ANIME_TV_IDS,
          'tv',
          langParam
        );
      }
      const animeGenreStr = ANIME_SERIES_GENRES[category] || '16';
      const isSimulcastMode =
        category === 'simulcast' || (provider === 'jkanime' && category === 'trending');
      const sortBy =
        category === 'top_rated'
          ? 'vote_average.desc'
          : provider === 'animeflv' && category === 'trending'
          ? 'vote_count.desc'
          : 'popularity.desc';
      const minVotes = category === 'top_rated' ? 200 : isSimulcastMode ? 8 : 30;
      const simulcastFilter = isSimulcastMode
        ? `&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}`
        : `&first_air_date.lte=${todayIso}`;

      if (provider === 'crunchyroll') {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=US&with_watch_providers=${encodeURIComponent(
          '283|1968'
        )}&with_watch_monetization_types=${encodeURIComponent(
          'flatrate|ads|free'
        )}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;

        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=${encodeURIComponent(
            '283|1968'
          )}&with_watch_monetization_types=${encodeURIComponent(
            'flatrate|ads|free'
          )}&with_genres=16&with_origin_country=JP&sort_by=popularity.desc&vote_count.gte=25&page=1&include_adult=false`;
        }
      } else if (provider === 'animebox') {
        if (page === 1) {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=2735&with_watch_monetization_types=${encodeURIComponent(
            'flatrate|ads|free'
          )}&sort_by=popularity.desc&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else if (provider === 'jkanime') {
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=16&with_origin_country=JP&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}&sort_by=popularity.desc&vote_count.gte=10&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else if (provider === 'animeflv') {
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=16&with_origin_country=JP&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}&sort_by=vote_count.desc&vote_count.gte=15&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      }
    } else if (provCfg) {
      const sortBy = category === 'top_rated' ? 'vote_average.desc' : 'popularity.desc';
      const minVotes = category === 'top_rated' ? 250 : 80;
      const genreParam = SERIES_GENRE_MAP[category] ? `&with_genres=${SERIES_GENRE_MAP[category]}` : '';

      if (category === 'originals') {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_networks=${encodeURIComponent(
          provCfg.tvNetworks
        )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764${genreParam}&page=${page}&include_adult=false`;
      } else {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=${encodeURIComponent(
          provCfg.watchProviders
        )}&with_watch_monetization_types=${encodeURIComponent(
          'flatrate|ads|free'
        )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764${genreParam}&page=${page}&include_adult=false`;

        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_networks=${encodeURIComponent(
            provCfg.tvNetworks
          )}&sort_by=vote_count.desc&vote_count.gte=400&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764&page=1&include_adult=false`;
        }
      }
    } else if (category === 'anime') {
      const discoverSort =
        sort === 'top_rated'
          ? 'vote_average.desc'
          : sort === 'now_playing'
          ? 'first_air_date.desc'
          : 'popularity.desc';
      const minVotes = sort === 'top_rated' ? 140 : 30;
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&with_genres=16&with_origin_country=JP&page=${page}&include_adult=false`;
    } else if (category === 'kids') {
      if (page === 1) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(CURATED_SPANISH_KIDS_TV_IDS, 'tv', 'es-ES');
      }
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc&vote_count.gte=25&first_air_date.lte=${todayIso}&with_genres=10762&without_genres=27,80,99,10763,10767&page=${page}&include_adult=false`;
    } else if (SERIES_GENRE_MAP[category]) {
      const discoverSort =
        sort === 'top_rated'
          ? 'vote_average.desc'
          : sort === 'now_playing'
          ? 'first_air_date.desc'
          : 'popularity.desc';
      const minVotes = sort === 'top_rated' ? 180 : 40;
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&without_genres=10767,10763&with_genres=${SERIES_GENRE_MAP[category]}&page=${page}`;
    } else if (category === '4k' || sort === '4k') {
      if (page === 1) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(CURATED_4K_SERIES_IDS, 'tv', langParam);
      }
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=vote_count.desc&vote_count.gte=800&vote_average.gte=7.5&first_air_date.gte=2008-01-01&page=${page}&include_adult=false`;
    } else if (category === 'popular' || (!category && sort === 'popular')) {
      endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'top_rated' || (!category && sort === 'top_rated')) {
      endpoint = `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'now_playing' || (!category && sort === 'now_playing')) {
      endpoint = `https://api.themoviedb.org/3/tv/on_the_air?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else {
      endpoint = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    }

    const mapTmdbSeriesItem = (s: any) => {
      const is4k = category === '4k' || sort === '4k' || CURATED_4K_SERIES_SET.has(Number(s.id));
      return {
        id: `tv-${langParam}-${provider}-${s.id}`,
        tmdbId: s.id,
        mediaType: 'tv' as const,
        is4k,
        quality: is4k ? '4K UHD' : 'HD',
        title: s.name || s.original_name || 'Serie',
        originalTitle: s.original_name || s.name || '',
        year: s.first_air_date ? String(s.first_air_date).split('-')[0] : 'TV',
        rating: s.vote_average ? Number(s.vote_average).toFixed(1) : '',
        overview:
          s.overview ||
          (isAnime
            ? 'Anime disponible por temporadas y capítulos en Español, Latino y VOSE (Sub Español) 1080p.'
            : isSpanishCatalog
            ? 'Serie disponible en Español (Castellano / Latino) y VO Inglés 1080p.'
            : 'Full TV series available in Original English 1080p & Spanish.'),
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : '',
        backdrop: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : '',
        languages: isAnime
          ? ['Español', 'VOSE · Sub', 'EN']
          : isSpanishCatalog
          ? ['Español', 'VOSE · EN']
          : ['English 1080p', 'Español'],
        platform: provCfg?.label,
        providerId: provCfg ? provider : undefined,
        genres: mapTmdbGenreLabels(s, langParam),
        seasonsCount: typeof s.number_of_seasons === 'number' ? s.number_of_seasons : undefined,
        popularity: Number(s.popularity || 0),
        voteCount: Number(s.vote_count || 0),
      };
    };

    const scrapeMovidySeriesFast = () => {
      if (!isSpanishCatalog || provCfg || isAnime) {
        return Promise.resolve({ series: [], hasMore: false });
      }
      const p = scrapeMovidySeriesCatalog({ category, page, query }).catch(() => ({
        series: [],
        hasMore: false,
      }));
      return Promise.race([
        p,
        new Promise<{ series: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ series: [], hasMore: false }), query ? 1600 : 2200)
        ),
      ]);
    };

    const scrapeGnulaSeriesFast = () => {
      if (!isSpanishCatalog || provCfg || isAnime) {
        return Promise.resolve({ items: [] as any[], hasMore: false });
      }
      const p = scrapeGnulaCatalog({ category, page, query, mediaType: 'tv' }).catch(() => ({
        items: [],
        hasMore: false,
      }));
      return Promise.race([
        p,
        new Promise<{ items: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ items: [], hasMore: false }), query ? 1800 : 2600)
        ),
      ]);
    };

    const [movidySeriesData, gnulaSeriesData, curatedAnimeRaw, oJson, json] = await Promise.all([
      scrapeMovidySeriesFast(),
      scrapeGnulaSeriesFast(),
      curatedAnimeSeedPromise.catch(() => []),
      originalsBoostEndpoint
        ? tmdbUrlJson<any>(originalsBoostEndpoint, 5 * 60 * 1000).catch(() => null)
        : Promise.resolve(null),
      tmdbUrlJson<any>(endpoint, 5 * 60 * 1000).catch(() => null),
    ]);

    const curatedLead = curatedAnimeRaw.map(mapTmdbSeriesItem);

    let originalsLead: any[] = [];
    if (oJson) {
      const oResults: any[] = Array.isArray(oJson?.results) ? oJson.results : [];
      originalsLead = oResults
        .filter((s) => s && s.id && (s.poster_path || s.backdrop_path))
        .slice(0, 12)
        .map(mapTmdbSeriesItem);
    }

    let tmdbSeries: any[] = [];
    let totalPages = 1;

    if (json) {
      let results: any[] = Array.isArray(json?.results) ? json.results : [];
      totalPages = Number(json?.total_pages || 1);

      if (query && page === 1) {
        const compactQ = normalizeNoSpaceForSearch(query);
        const hasStrongExactMatch = results.some(
          (s) =>
            (normalizeNoSpaceForSearch(s?.name || '') === compactQ ||
              normalizeNoSpaceForSearch(s?.original_name || '') === compactQ) &&
            Number(s?.vote_count || 0) >= 60
        );
        if (!hasStrongExactMatch) {
          const variants = buildSmartConcatQueryVariants(query);
          if (variants.length > 0) {
            const extraLists = await Promise.all(
              variants.map(async (vq) => {
                const ej = await fetchTmdbJson<any>(
                  '/search/tv',
                  { language: langParam, query: vq, page: 1, include_adult: false },
                  5 * 60 * 1000
                ).catch(() => null);
                return Array.isArray(ej?.results) ? ej.results : [];
              })
            );
            const flatExtra = extraLists.flat();
            if (flatExtra.length > 0) {
              const seenExtra = new Set<number>();
              const deduped: any[] = [];
              for (const item of [...results, ...flatExtra]) {
                if (item?.id && !seenExtra.has(item.id)) {
                  seenExtra.add(item.id);
                  deduped.push(item);
                }
              }
              results = rankTmdbSearchResultsForQuery(deduped, query, true);
            } else {
              results = rankTmdbSearchResultsForQuery(results, query, true);
            }
          } else {
            results = rankTmdbSearchResultsForQuery(results, query, true);
          }
        } else if (results.length > 0) {
          results = rankTmdbSearchResultsForQuery(results, query, true);
        }
      }

      tmdbSeries = results
        .filter((s) => {
          if (!s || !s.id || (!s.poster_path && !s.backdrop_path)) return false;
          if (isAnime && query) {
            const gIds: number[] = Array.isArray(s.genre_ids) ? s.genre_ids : [];
            const origCountries: string[] = Array.isArray(s.origin_country)
              ? s.origin_country
              : [];
            const isJa =
              String(s.original_language || '').toLowerCase() === 'ja' ||
              origCountries.includes('JP');
            if (!gIds.includes(16) && !isJa) return false;
          }
          if (isSpanishCatalog && !query && !isAnime && Array.isArray(s.genre_ids)) {
            if (s.genre_ids.includes(10767) || s.genre_ids.includes(10763)) {
              return false;
            }
          }
          return true;
        })
        .map(mapTmdbSeriesItem);
    }

    const seenTmdbIds = new Set<number>();
    const combinedSeries: any[] = [];

    for (const cs of curatedLead) {
      if (cs?.tmdbId && !seenTmdbIds.has(cs.tmdbId)) {
        seenTmdbIds.add(cs.tmdbId);
        combinedSeries.push(cs);
      }
    }

    const filteredMovidySeries = query
      ? movidySeriesData.series.filter(
          (ms: any) => scoreTitleRelevance(ms.title, ms.originalTitle, query) >= 70
        )
      : movidySeriesData.series;

    for (const ms of filteredMovidySeries) {
      if (!ms?.tmdbId) continue;
      if (seenTmdbIds.has(ms.tmdbId)) {
        const existing = combinedSeries.find((s) => Number(s.tmdbId) === Number(ms.tmdbId));
        if (existing && !existing.movidyUrl && ms.movidyUrl) {
          existing.movidyUrl = ms.movidyUrl;
          existing.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
        }
        continue;
      }
      seenTmdbIds.add(ms.tmdbId);
      combinedSeries.push(ms);
    }

    for (const orig of originalsLead) {
      if (orig?.tmdbId && !seenTmdbIds.has(orig.tmdbId)) {
        seenTmdbIds.add(orig.tmdbId);
        combinedSeries.push(orig);
      }
    }

    for (const ts of tmdbSeries) {
      if (ts?.tmdbId && !seenTmdbIds.has(ts.tmdbId)) {
        seenTmdbIds.add(ts.tmdbId);
        combinedSeries.push(ts);
      }
    }

    const filteredGnulaSeries = query
      ? gnulaSeriesData.items.filter(
          (gs: any) => scoreTitleRelevance(gs.title, gs.originalTitle, query) >= 70
        )
      : gnulaSeriesData.items;

    const seenGnulaSeriesUrls = new Set<string>();
    for (const gs of filteredGnulaSeries) {
      if (gs?.mediaType && gs.mediaType !== 'tv') continue;
      const normUrl = gs?.gnulaUrl ? normalizeGnulaUrl(gs.gnulaUrl) : '';
      if (normUrl && seenGnulaSeriesUrls.has(normUrl)) continue;
      if (normUrl) seenGnulaSeriesUrls.add(normUrl);
      const existing = combinedSeries.find((s) =>
        areTitlesStrictlyEqual(gs.title, [s.title, s.originalTitle].filter(Boolean))
      );
      if (existing) {
        if (!existing.gnulaUrl && gs.gnulaUrl) {
          existing.gnulaUrl = gs.gnulaUrl;
        }
        continue;
      }
      combinedSeries.push(gs);
    }

    if (query) {
      const cleanSeriesQ = correctCommonSearchTypos(query) || query;
      const indexedTv = searchIndexedCatalog(cleanSeriesQ, { mediaType: 'tv', limit: 16 });
      const topScore = combinedSeries.reduce(
        (mx, s) => Math.max(mx, scoreTitleRelevance(s.title, s.originalTitle, cleanSeriesQ)),
        0
      );
      const topSeriesHasMovidy = Boolean(combinedSeries[0]?.movidyUrl);
      const fallbackTv =
        topScore < 240 || !topSeriesHasMovidy
          ? await Promise.race([
              liveOnDemandFallbackSearch(cleanSeriesQ, 'tv').catch(() => []),
              new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3200)),
            ])
          : [];

      for (const extra of [...indexedTv, ...fallbackTv]) {
        if (extra.tmdbId) {
          const existingById = combinedSeries.find((s) => Number(s.tmdbId) === Number(extra.tmdbId));
          if (existingById) {
            if (!existingById.movidyUrl && extra.movidyUrl) existingById.movidyUrl = extra.movidyUrl;
            if (!existingById.gnulaUrl && extra.gnulaUrl) existingById.gnulaUrl = extra.gnulaUrl;
            if (!existingById.altTitle && extra.altTitle) existingById.altTitle = extra.altTitle;
            continue;
          }
          seenTmdbIds.add(extra.tmdbId);
        }
        if (extra.movidyUrl && combinedSeries.some((s) => s.movidyUrl === extra.movidyUrl)) {
          continue;
        }
        combinedSeries.push(extra);
      }

      combinedSeries.sort((a, b) => {
        const sA = scoreTitleRelevance(a.title, a.originalTitle, cleanSeriesQ, {
          altTitle: a.altTitle,
          popularity: a.popularity,
          voteCount: a.voteCount,
        });
        const sB = scoreTitleRelevance(b.title, b.originalTitle, cleanSeriesQ, {
          altTitle: b.altTitle,
          popularity: b.popularity,
          voteCount: b.voteCount,
        });
        const diff = sB - sA;
        if (Math.abs(diff) <= 35) {
          const aMov = a.movidyUrl ? 1 : 0;
          const bMov = b.movidyUrl ? 1 : 0;
          if (aMov !== bMov) return bMov - aMov;
        }
        return diff;
      });
    }

    if (page === 1 || query) {
      const vestSeries = listVestCatalogEntries({ mediaType: 'tv', query });
      for (const vs of vestSeries) {
        if (vs.tmdbId) {
          const existing = combinedSeries.find((s) => Number(s.tmdbId) === Number(vs.tmdbId));
          if (existing) {
            if (!existing.vestUrl) existing.vestUrl = vs.vestUrl;
            continue;
          }
          seenTmdbIds.add(vs.tmdbId);
        } else {
          const kVs = normalizeTitleForMatch(vs.title);
          if (combinedSeries.some((s) => normalizeTitleForMatch(s.title) === kVs)) continue;
        }
        combinedSeries.push(vs);
      }
    }

    if (combinedSeries.length === 0) {
      const stale = staleCache.get(cacheKey);
      if (stale && stale.series.length > 0) {
        return res.json({ success: true, series: stale.series, hasMore: stale.hasMore, page });
      }
      const indexedFallback = searchIndexedCatalog(query || 'serie', { mediaType: 'tv', limit: 24 });
      if (indexedFallback.length > 0) {
        return res.json({ success: true, series: indexedFallback, hasMore: false, page });
      }
    }

    const hasMore =
      Boolean(movidySeriesData.hasMore || gnulaSeriesData.hasMore) ||
      (page < totalPages && tmdbSeries.length > 0);
    if (combinedSeries.length > 0) {
      const entry = { series: combinedSeries, hasMore, ts: Date.now() };
      seriesCatalogCache.set(cacheKey, entry);
      staleCache.set(cacheKey, entry);
    }
    res.json({ success: true, series: combinedSeries, hasMore, page });
  } catch (err) {
    logger.warn({ err }, 'series_catalog_error_degraded');
    const rawQuery = String(req.query.query || '').trim();
    const vestFallback = listVestCatalogEntries({ mediaType: 'tv', query: rawQuery });
    res.json({ success: true, series: vestFallback, hasMore: false, page: 1 });
  }
}
