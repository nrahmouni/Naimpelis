import express from 'express';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  ANIME_PROVIDER_IDS,
  ANIMEBOX_CURATED_TV_IDS,
  CURATED_4K_SERIES_IDS,
  CURATED_4K_SERIES_SET,
  STREAMING_PROVIDER_MAP,
  USER_MASTERPIECE_ANIME_TV_IDS,
  matchMasterpieceAnimeIds,
  resolveEffectiveProviderAndQuery,
} from '../data/vodConstants.ts';
import {
  CHROME_UA,
  areTitlesStrictlyEqual,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
} from '../extractors/httpHelpers.ts';
import {
  MOVIDY_ORIGIN,
  normalizeMovidyUrl,
  probeAvailableLanguages,
} from '../extractors/bingetrixMovidy.ts';
import {
  normalizeGnulaUrl,
  scrapeGnulaCatalog,
} from '../extractors/gnulaHdExtractor.ts';
import { scrapeMovidyCatalog } from '../services/movidyCatalogService.ts';
import {
  fetchTmdbJson,
  fetchTmdbUrlJson,
} from '../services/tmdbService.ts';
import {
  fetchVestDetailPage,
  isVestMirrorUrl,
  listVestCatalogEntries,
} from '../services/vestMirrorService.ts';
import {
  correctCommonSearchTypos,
  getCatalogRefreshStatus,
  liveOnDemandFallbackSearch,
  runRefreshCycle,
  scoreTitleRelevance,
  searchIndexedCatalog,
} from '../services/catalogRefreshService.ts';
import { buildSignedApkBuffer, type ApkFlavor } from '../services/apkBuilderService.ts';
import {
  SERIES_GENRE_MAP,
  buildSmartConcatQueryVariants,
  extractLocalizedTmdbTitleHints,
  fetchTmdbItemsByIds,
  fetchTmdbMovieCatalog,
  mapTmdbGenreLabels,
  movieCatalogCache,
  normalizeNoSpaceForSearch,
  rankTmdbSearchResultsForQuery,
} from '../services/tmdbCatalogHelpers.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export const seriesCatalogCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  180,
  15 * 60 * 1000
);
export const seriesCatalogStaleCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  180,
  24 * 60 * 60 * 1000
);
const movidyTvTmdbCache = new LruTtlCache<string, any | null>(350, 60 * 60 * 1000);
const tvDetailsFastCache = new LruTtlCache<string, { details: any; ts: number }>(350, 20 * 60 * 1000);
const tvLangProbeCache = new LruTtlCache<
  string,
  { availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[]; ts: number }
>(400, 30 * 60 * 1000);

export function sendApkPackageResponse(
  req: express.Request,
  res: express.Response,
  opts: {
    rootDir: string;
    variant: ApkFlavor;
    filename: string;
    candidateFilenames: string[];
    errorMessage: string;
    logKey: string;
    getPublicOrigin: (r: express.Request) => string;
  }
) {
  const candidates: string[] = [];
  for (const name of opts.candidateFilenames) {
    candidates.push(path.resolve(opts.rootDir, 'public', name));
    candidates.push(path.resolve(opts.rootDir, 'dist', name));
  }
  const target = candidates.find((p) => fs.existsSync(p));
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${opts.filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (target) {
    return res.sendFile(target);
  }
  try {
    const apkBuf = buildSignedApkBuffer(opts.variant, opts.getPublicOrigin(req));
    res.setHeader('Content-Length', String(apkBuf.length));
    return res.send(apkBuf);
  } catch (err) {
    logger.error({ err }, opts.logKey);
    return res.status(500).json({ error: opts.errorMessage });
  }
}

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
    console.warn('scrapeMovidySeriesCatalog error:', err);
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
            }
          }
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
          ? await liveOnDemandFallbackSearch(cleanSeriesQ, 'tv').catch(() => [])
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
        const sA = scoreTitleRelevance(a.title, a.originalTitle, cleanSeriesQ, { altTitle: a.altTitle });
        const sB = scoreTitleRelevance(b.title, b.originalTitle, cleanSeriesQ, { altTitle: b.altTitle });
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

export async function handleTvDetailsRequest(req: express.Request, res: express.Response) {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false });

    const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const isEn = String(req.query.lang || 'es').toLowerCase() === 'en';
    const force = String(req.query.force || req.query.forceSpanish || '') === '1';
    const langParam = isEn ? 'en-US' : 'es-ES';
    const cacheKey = `${cleanId}:${requestedSeason}:${langParam}`;

    const cached = !force ? tvDetailsFastCache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      const cachedLangs = tvLangProbeCache.get(`v2|${cleanId}:${cached.details.activeSeason}:1`);
      return res.json({
        success: true,
        details: {
          ...cached.details,
          ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
        },
      });
    }

    const showJson = await fetchTmdbJson<any>(
      `/tv/${cleanId}`,
      { language: langParam },
      15 * 60 * 1000
    ).catch(() => null);

    if (!showJson) return res.status(404).json({ success: false });

    const baseSeasons = (Array.isArray(showJson?.seasons) ? showJson.seasons : [])
      .filter(
        (s: any) =>
          s &&
          typeof s.season_number === 'number' &&
          s.season_number >= 1 &&
          (Number(s.episode_count) > 0 || s.season_number === 1)
      )
      .sort((a: any, b: any) => a.season_number - b.season_number)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name:
          s.name && !/^season\s+\d+$/i.test(s.name)
            ? s.name
            : isEn
            ? `Season ${s.season_number}`
            : `Temporada ${s.season_number}`,
        episodeCount: Number(s.episode_count) || 0,
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : '',
      }));

    const isJjkSplit =
      cleanId === '95479' &&
      baseSeasons.length === 1 &&
      (baseSeasons[0]?.episodeCount || 0) >= 48;

    const hasFromS4Already = baseSeasons.some((s: any) => s.seasonNumber === 4);

    let seasons = baseSeasons;
    if (isJjkSplit) {
      const basePoster = baseSeasons[0]?.poster || '';
      seasons = [
        {
          seasonNumber: 1,
          name: isEn ? 'Season 1' : 'Temporada 1',
          episodeCount: 24,
          poster: basePoster,
        },
        {
          seasonNumber: 2,
          name: isEn ? 'Season 2 · Shibuya Incident' : 'Temporada 2 · Shibuya',
          episodeCount: 23,
          poster: basePoster,
        },
        {
          seasonNumber: 3,
          name: isEn ? 'Season 3 · The Culling Game' : 'Temporada 3 · Culling Game',
          episodeCount: Math.max(12, (baseSeasons[0]?.episodeCount || 59) - 47),
          poster: basePoster,
        },
      ];
    } else if (cleanId === '124364' && !hasFromS4Already) {
      seasons = [
        ...baseSeasons,
        {
          seasonNumber: 4,
          name: isEn ? 'Season 4 (New)' : 'Temporada 4 (Nueva)',
          episodeCount: 10,
          poster: baseSeasons[baseSeasons.length - 1]?.poster || '',
        },
      ];
    }

    const effectiveSeason =
      seasons.length > 0 && !seasons.some((s: any) => s.seasonNumber === requestedSeason)
        ? seasons[0].seasonNumber
        : requestedSeason;

    const tmdbSeasonToFetch = isJjkSplit ? 1 : effectiveSeason;

    const seasonRequests: Promise<any>[] = [
      fetchTmdbJson<any>(
        `/tv/${cleanId}/season/${tmdbSeasonToFetch}`,
        { language: langParam },
        15 * 60 * 1000
      ).catch(() => null),
    ];
    if (!isEn) {
      seasonRequests.push(
        fetchTmdbJson<any>(
          `/tv/${cleanId}/season/${tmdbSeasonToFetch}`,
          { language: 'en-US' },
          15 * 60 * 1000
        ).catch(() => null)
      );
    }

    const [seasonJsonRaw, seasonEnJsonRaw] = await Promise.all(seasonRequests);
    const seasonJson: any = seasonJsonRaw || { episodes: [] };
    const seasonEnJson: any = seasonEnJsonRaw || { episodes: [] };

    const enEpisodesByNum = new Map<number, any>();
    if (Array.isArray(seasonEnJson?.episodes)) {
      for (const epEn of seasonEnJson.episodes) {
        if (epEn && typeof epEn.episode_number === 'number') {
          enEpisodesByNum.set(epEn.episode_number, epEn);
        }
      }
    }

    const rawEpisodes =
      Array.isArray(seasonJson?.episodes) && seasonJson.episodes.length > 0
        ? seasonJson.episodes
        : Array.isArray(seasonEnJson?.episodes)
        ? seasonEnJson.episodes
        : [];

    let episodes = rawEpisodes
      .filter((ep: any) => ep && typeof ep.episode_number === 'number' && ep.episode_number >= 1)
      .sort((a: any, b: any) => a.episode_number - b.episode_number)
      .filter((ep: any) => {
        if (!isJjkSplit) return true;
        if (effectiveSeason === 1) return ep.episode_number >= 1 && ep.episode_number <= 24;
        if (effectiveSeason === 2) return ep.episode_number >= 25 && ep.episode_number <= 47;
        return ep.episode_number >= 48;
      })
      .map((ep: any) => {
        const origEpNum = ep.episode_number;
        const epNum = isJjkSplit
          ? effectiveSeason === 2
            ? origEpNum - 24
            : effectiveSeason === 3
            ? origEpNum - 47
            : origEpNum
          : origEpNum;
        const enFallback = enEpisodesByNum.get(origEpNum);
        const rawName = String(ep.name || '').trim();
        const isGenericEsName =
          !rawName || /^(episodio|episode|cap[ií]tulo)\s*\d+$/i.test(rawName);
        const enName = String(enFallback?.name || '').trim();
        const finalTitle =
          !isGenericEsName
            ? rawName
            : enName && !/^(episode|episodio)\s*\d+$/i.test(enName)
            ? enName
            : isEn
            ? `Episode ${epNum}`
            : `Capítulo ${epNum}`;
        const stillPath = ep.still_path || enFallback?.still_path || '';

        return {
          id: `ep-${cleanId}-${effectiveSeason}-${epNum}`,
          episodeNumber: epNum,
          seasonNumber: effectiveSeason,
          title: finalTitle,
          overview: ep.overview || enFallback?.overview || '',
          still: stillPath ? `https://image.tmdb.org/t/p/w500${stillPath}` : '',
          runtime: ep.runtime || enFallback?.runtime || undefined,
          airDate: ep.air_date || enFallback?.air_date || undefined,
          rating: ep.vote_average ? Number(ep.vote_average).toFixed(1) : undefined,
        };
      });

    if (isJjkSplit && effectiveSeason === 3 && episodes.length < 12) {
      const existingNums = new Set(episodes.map((e: any) => e.episodeNumber));
      for (let idx = 1; idx <= 12; idx++) {
        if (!existingNums.has(idx)) {
          episodes.push({
            id: `ep-${cleanId}-3-${idx}`,
            episodeNumber: idx,
            seasonNumber: 3,
            title: isEn ? `Episode ${idx}` : `Capítulo ${idx}`,
            overview: '',
            still: '',
            runtime: 24,
            airDate: '2026',
            rating: undefined,
          });
        }
      }
      episodes.sort((a: any, b: any) => a.episodeNumber - b.episodeNumber);
    }

    const activeSeasonSummary = seasons.find((s: any) => s.seasonNumber === effectiveSeason);
    if (episodes.length === 0 && activeSeasonSummary && activeSeasonSummary.episodeCount > 0) {
      episodes = Array.from({ length: activeSeasonSummary.episodeCount }, (_, idx) => ({
        id: `ep-${cleanId}-${effectiveSeason}-${idx + 1}`,
        episodeNumber: idx + 1,
        seasonNumber: effectiveSeason,
        title: isEn ? `Episode ${idx + 1}` : `Capítulo ${idx + 1}`,
        overview: '',
        still: '',
        runtime: undefined,
        airDate: undefined,
        rating: undefined,
      }));
    }

    const normalizedSeasons =
      seasons.length > 0
        ? seasons.map((s: any) =>
            s.seasonNumber === effectiveSeason && episodes.length > s.episodeCount
              ? { ...s, episodeCount: episodes.length }
              : s
          )
        : [
            {
              seasonNumber: 1,
              name: isEn ? 'Season 1' : 'Temporada 1',
              episodeCount: episodes.length,
            },
          ];

    const showTitle = showJson.name || showJson.original_name || 'Serie';
    const origTitle = showJson.original_name || showJson.name || '';

    const detailsPayload: any = {
      tmdbId: Number(cleanId),
      title: showTitle,
      originalTitle: origTitle,
      year: showJson.first_air_date ? String(showJson.first_air_date).split('-')[0] : 'TV',
      rating: showJson.vote_average ? Number(showJson.vote_average).toFixed(1) : '',
      overview: showJson.overview || '',
      poster: showJson.poster_path ? `https://image.tmdb.org/t/p/w500${showJson.poster_path}` : '',
      backdrop: showJson.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${showJson.backdrop_path}`
        : '',
      seasons: normalizedSeasons,
      activeSeason: effectiveSeason,
      episodes,
    };

    tvDetailsFastCache.set(cacheKey, { details: detailsPayload, ts: Date.now() });

    const cachedLangs = !force
      ? tvLangProbeCache.get(`v2|${cleanId}:${effectiveSeason}:1`)
      : undefined;
    res.json({
      success: true,
      details: {
        ...detailsPayload,
        ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
      },
    });
  } catch (err) {
    console.error('TV details error:', err);
    res.status(500).json({ success: false });
  }
}

export function registerVodCatalogRoutes(app: express.Express) {
  app.get('/api/catalog/movies', async (req, res) => {
    try {
      const rawQuery = String(req.query.query || '').trim();
      const rawProvider = String(req.query.provider || 'all').toLowerCase().trim();
      const { provider, query } = resolveEffectiveProviderAndQuery(rawProvider, rawQuery);
      const category = String(req.query.category || 'trending').toLowerCase();
      const sort = String(req.query.sort || '').toLowerCase();
      const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

      const mergedCacheKey = `merged-es-v13|${provider}|${category}|${sort}|${page}|${query}`;
      const cachedMerged = movieCatalogCache.get(mergedCacheKey);
      if (cachedMerged && Date.now() - cachedMerged.ts < 5 * 60 * 1000) {
        return res.json({
          success: true,
          movies: cachedMerged.movies,
          hasMore: cachedMerged.hasMore,
          page,
        });
      }

      if ((STREAMING_PROVIDER_MAP[provider] && !query) || ANIME_PROVIDER_IDS.has(provider)) {
        const tmdbData = await fetchTmdbMovieCatalog({
          lang: 'es-ES',
          category,
          sort,
          page,
          query: '',
          provider,
        });
        movieCatalogCache.set(mergedCacheKey, {
          movies: tmdbData.movies,
          hasMore: tmdbData.hasMore,
          ts: Date.now(),
        });
        return res.json({
          success: true,
          movies: tmdbData.movies,
          hasMore: tmdbData.hasMore,
          page,
        });
      }

      const scrapeGnulaMoviesFast = () => {
        if (STREAMING_PROVIDER_MAP[provider]) {
          return Promise.resolve({ items: [] as any[], hasMore: false });
        }
        return Promise.race([
          scrapeGnulaCatalog({ category, page, query, mediaType: 'movie' }).catch(() => ({
            items: [],
            hasMore: false,
          })),
          new Promise<{ items: any[]; hasMore: boolean }>((resolve) =>
            setTimeout(() => resolve({ items: [], hasMore: false }), query ? 2400 : 3200)
          ),
        ]);
      };

      const searchQueryForScrapers = query ? correctCommonSearchTypos(query) || query : '';
      const [movidyData, gnulaData, tmdbData] = await Promise.all([
        scrapeMovidyCatalog({ category, page, query: searchQueryForScrapers }),
        scrapeGnulaMoviesFast(),
        fetchTmdbMovieCatalog({ lang: 'es-ES', category, sort, page, query: searchQueryForScrapers, provider }),
      ]);

      const seenNormTitles = new Set<string>();
      const seenTmdbIds = new Set<number>();
      const combinedMovies: any[] = [];

      for (const tm of tmdbData.movies) {
        const numTmdb = Number(tm.tmdbId || 0);
        if (numTmdb > 0) {
          if (seenTmdbIds.has(numTmdb)) continue;
          seenTmdbIds.add(numTmdb);
        }
        const kTitle = normalizeTitleForMatch(tm.title);
        const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
        if (kTitle) seenNormTitles.add(kTitle);
        if (kOrig) seenNormTitles.add(kOrig);
        combinedMovies.push(tm);
      }

      const filteredMovidyMovies = searchQueryForScrapers
        ? movidyData.movies.filter(
            (mv) => scoreTitleRelevance(mv.title, mv.originalTitle, searchQueryForScrapers) >= 70
          )
        : movidyData.movies;

      for (const mv of filteredMovidyMovies) {
        const kFull = normalizeTitleForMatch(mv.title);
        const kOutside = normalizeTitleForMatch(String(mv.title || '').replace(/\s*\([^)]*\)/g, ''));
        const kInside = normalizeTitleForMatch(String(mv.title || '').match(/\(([^)]+)\)/)?.[1] || '');

        const matchedExisting = combinedMovies.find((m) =>
          areTitlesStrictlyEqual(mv.title, [m.title, m.originalTitle, m.altTitle || ''].filter(Boolean))
        );

        if (matchedExisting) {
          if (!matchedExisting.movidyUrl && mv.movidyUrl) {
            matchedExisting.movidyUrl = mv.movidyUrl;
          }
          matchedExisting.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
          continue;
        }

        if (
          (kFull && seenNormTitles.has(kFull)) ||
          (kOutside && seenNormTitles.has(kOutside))
        ) {
          continue;
        }
        if (kFull) seenNormTitles.add(kFull);
        if (kOutside) seenNormTitles.add(kOutside);
        if (kInside && !/^(?:19|20)\d{2}$/.test(kInside)) seenNormTitles.add(kInside);
        combinedMovies.push(mv);
      }

      const filteredGnulaMovies = searchQueryForScrapers
        ? gnulaData.items.filter(
            (gn: any) => scoreTitleRelevance(gn.title, gn.originalTitle, searchQueryForScrapers) >= 70
          )
        : gnulaData.items;

      for (const gn of filteredGnulaMovies) {
        const gnYear = /^\d{4}$/.test(String(gn.year || '')) ? Number(gn.year) : 0;
        const existingMatch = combinedMovies.find((m) => {
          if (!areTitlesStrictlyEqual(gn.title, [m.title, m.originalTitle].filter(Boolean))) {
            return false;
          }
          const mYear = /^\d{4}$/.test(String(m.year || '')) ? Number(m.year) : 0;
          return !gnYear || !mYear || Math.abs(gnYear - mYear) <= 1;
        });
        if (existingMatch) {
          if (!existingMatch.gnulaUrl && gn.gnulaUrl) {
            existingMatch.gnulaUrl = gn.gnulaUrl;
          }
          continue;
        }
        const kGn = normalizeTitleForMatch(gn.title);
        if (kGn && seenNormTitles.has(kGn)) continue;
        if (kGn) seenNormTitles.add(kGn);
        combinedMovies.push(gn);
      }

      if (query) {
        const indexedHits = searchIndexedCatalog(searchQueryForScrapers, { mediaType: 'movie', limit: 16 });
        const topExistingScore = combinedMovies.reduce(
          (mx, m) => Math.max(mx, scoreTitleRelevance(m.title, m.originalTitle, searchQueryForScrapers)),
          0
        );
        const topMovieHasMovidy = Boolean(combinedMovies[0]?.movidyUrl);
        const fallbackHits =
          topExistingScore < 240 || !topMovieHasMovidy
            ? await liveOnDemandFallbackSearch(searchQueryForScrapers, 'movie')
            : [];

        for (const extra of [...indexedHits, ...fallbackHits]) {
          if (extra.tmdbId) {
            const existingById = combinedMovies.find((m) => Number(m.tmdbId) === Number(extra.tmdbId));
            if (existingById) {
              if (!existingById.movidyUrl && extra.movidyUrl) existingById.movidyUrl = extra.movidyUrl;
              if (!existingById.gnulaUrl && extra.gnulaUrl) existingById.gnulaUrl = extra.gnulaUrl;
              if (!existingById.altTitle && extra.altTitle) existingById.altTitle = extra.altTitle;
              if (existingById.movidyUrl) {
                existingById.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
              }
              continue;
            }
          }
          if (!extra.tmdbId) {
            const existingByTitle = combinedMovies.find((m) =>
              areTitlesStrictlyEqual(extra.title, [m.title, m.originalTitle, m.altTitle || ''].filter(Boolean))
            );
            if (existingByTitle) {
              if (!existingByTitle.movidyUrl && extra.movidyUrl) existingByTitle.movidyUrl = extra.movidyUrl;
              if (!existingByTitle.gnulaUrl && extra.gnulaUrl) existingByTitle.gnulaUrl = extra.gnulaUrl;
              if (existingByTitle.movidyUrl) {
                existingByTitle.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
              }
              continue;
            }
          }
          if (extra.movidyUrl && combinedMovies.some((m) => m.movidyUrl === extra.movidyUrl)) {
            continue;
          }
          const kEx = normalizeTitleForMatch(extra.title);
          const kExOrig = normalizeTitleForMatch(extra.originalTitle || '');
          if ((kEx && seenNormTitles.has(kEx)) || (kExOrig && seenNormTitles.has(kExOrig))) {
            continue;
          }
          if (kEx) seenNormTitles.add(kEx);
          if (kExOrig) seenNormTitles.add(kExOrig);
          combinedMovies.push(extra);
        }

        combinedMovies.sort((a, b) => {
          const sA = scoreTitleRelevance(a.title, a.originalTitle, searchQueryForScrapers, {
            altTitle: a.altTitle,
            popularity: a.popularity,
            voteCount: a.voteCount,
          });
          const sB = scoreTitleRelevance(b.title, b.originalTitle, searchQueryForScrapers, {
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
        const vestEntries = listVestCatalogEntries({ mediaType: 'movie', query: searchQueryForScrapers || query });
        for (const ve of vestEntries) {
          const kVe = normalizeTitleForMatch(ve.title);
          if (ve.tmdbId) {
            const existing = combinedMovies.find((m) => Number(m.tmdbId) === Number(ve.tmdbId));
            if (existing) {
              if (!existing.vestUrl) existing.vestUrl = ve.vestUrl;
              continue;
            }
          }
          if (kVe && seenNormTitles.has(kVe)) continue;
          if (kVe) seenNormTitles.add(kVe);
          combinedMovies.push(ve);
        }
      }

      const hasMore = Boolean(movidyData.hasMore || gnulaData.hasMore || tmdbData.hasMore);
      movieCatalogCache.set(mergedCacheKey, {
        movies: combinedMovies,
        hasMore,
        ts: Date.now(),
      });

      res.json({ success: true, movies: combinedMovies, hasMore, page });
    } catch (err) {
      console.error('Spanish movies catalog error:', err);
      res.status(500).json({ success: false, movies: [], hasMore: false });
    }
  });

  app.get('/api/catalog/vest', async (req, res) => {
    try {
      const rawUrl = String(req.query.url || '').trim();
      const query = String(req.query.query || '').trim();
      const mediaType =
        req.query.mediaType === 'movie'
          ? 'movie'
          : req.query.mediaType === 'tv'
          ? 'tv'
          : 'all';

      if (rawUrl && isVestMirrorUrl(rawUrl)) {
        const detail = await fetchVestDetailPage(rawUrl);
        return res.json({
          success: Boolean(detail),
          detail,
          items: listVestCatalogEntries({ mediaType, query }),
        });
      }

      return res.json({
        success: true,
        items: listVestCatalogEntries({ mediaType, query }),
      });
    } catch {
      return res.status(500).json({ success: false, items: [] });
    }
  });

  app.get('/api/catalog/bingetrix', async (req, res) => {
    try {
      const query = String(req.query.query || '').trim();
      const provider = String(req.query.provider || 'all').toLowerCase().trim();
      const category = String(req.query.category || 'trending').toLowerCase();
      const sort = String(req.query.sort || '').toLowerCase();
      const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

      const data = await fetchTmdbMovieCatalog({
        lang: 'en-US',
        category,
        sort,
        page,
        query,
        provider,
      });

      const movies = [...data.movies];

      if (query) {
        const cleanBingQuery = correctCommonSearchTypos(query) || query;
        const indexedHits = searchIndexedCatalog(cleanBingQuery, { mediaType: 'all', limit: 16 });
        const topScore = movies.reduce(
          (mx, m) => Math.max(mx, scoreTitleRelevance(m.title, m.originalTitle, cleanBingQuery)),
          0
        );
        const topHasMovidy = Boolean(movies[0]?.movidyUrl);
        const fallbackHits =
          topScore < 240 || !topHasMovidy
            ? await liveOnDemandFallbackSearch(cleanBingQuery, 'all')
            : [];

        const seenIds = new Set<string>(
          movies.map((m) => `${m.mediaType || 'movie'}:${m.tmdbId || m.id}`)
        );
        for (const extra of [...indexedHits, ...fallbackHits]) {
          const k = `${extra.mediaType}:${extra.tmdbId || extra.id}`;
          if (seenIds.has(k)) {
            const existing = movies.find((m) => `${m.mediaType || 'movie'}:${m.tmdbId || m.id}` === k);
            if (existing) {
              if (!existing.movidyUrl && extra.movidyUrl) existing.movidyUrl = extra.movidyUrl;
              if (!existing.gnulaUrl && extra.gnulaUrl) existing.gnulaUrl = extra.gnulaUrl;
              if (!existing.altTitle && extra.altTitle) existing.altTitle = extra.altTitle;
            }
            continue;
          }
          if (extra.movidyUrl && movies.some((m) => m.movidyUrl === extra.movidyUrl)) {
            continue;
          }
          seenIds.add(k);
          movies.push(extra);
        }

        movies.sort((a, b) => {
          const sA = scoreTitleRelevance(a.title, a.originalTitle, cleanBingQuery, { altTitle: a.altTitle });
          const sB = scoreTitleRelevance(b.title, b.originalTitle, cleanBingQuery, { altTitle: b.altTitle });
          const diff = sB - sA;
          if (Math.abs(diff) <= 35) {
            const aMov = a.movidyUrl ? 1 : 0;
            const bMov = b.movidyUrl ? 1 : 0;
            if (aMov !== bMov) return bMov - aMov;
          }
          return diff;
        });
      }

      res.json({ success: true, movies, hasMore: data.hasMore, page });
    } catch (err) {
      console.error('Bingetrix catalog error:', err);
      res.status(500).json({ success: false, movies: [], hasMore: false });
    }
  });

  app.get('/api/catalog/refresh-status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...getCatalogRefreshStatus() });
  });

  app.post('/api/catalog/refresh', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const summary = await runRefreshCycle();
    res.json({ success: true, summary, status: getCatalogRefreshStatus() });
  });

  app.get('/api/catalog/tv/:tmdbId/languages', async (req, res) => {
    try {
      const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
      if (!cleanId) return res.status(400).json({ success: false, availableLanguages: [] });

      const seasonNum = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
      const episodeNum = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
      const force = String(req.query.force || req.query.forceSpanish || '') === '1';
      const cacheKey = `v2|${cleanId}:${seasonNum}:${episodeNum}`;

      const cached = !force ? tvLangProbeCache.get(cacheKey) : undefined;
      if (cached && cached.availableLanguages.length > 0 && Date.now() - cached.ts < 15 * 60 * 1000) {
        return res.json({ success: true, availableLanguages: cached.availableLanguages });
      }

      const titleHint = String(req.query.title || '').trim();
      const origTitleHint = String(req.query.origTitle || '').trim();
      const gnulaUrlHint = String(req.query.gnulaUrl || '').trim();
      let hints = [titleHint, origTitleHint].filter(Boolean);
      let imdbId: string | null = null;
      let yearHint = '';
      let isReleasedShow = false;

      const showRes = await fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=external_ids,translations,alternative_titles`,
        { signal: AbortSignal.timeout(3500) }
      ).catch(() => null);
      if (showRes?.ok) {
        const showJson: any = await showRes.json();
        imdbId = showJson?.external_ids?.imdb_id || null;
        const firstAirDate = String(showJson?.first_air_date || '').trim();
        yearHint = firstAirDate.split('-')[0] || '';
        const todayIso = new Date().toISOString().slice(0, 10);
        const tvStatus = String(showJson?.status || '').trim();
        isReleasedShow =
          !/^(Planned|In Production|Rumored)$/i.test(tvStatus) &&
          (!firstAirDate || firstAirDate <= todayIso);

        hints = Array.from(
          new Set([...hints, ...extractLocalizedTmdbTitleHints(showJson)].filter(Boolean))
        );
      }

      const probedLanguages = await probeAvailableLanguages({
        tmdbId: cleanId,
        imdbId,
        mediaType: 'tv',
        season: seasonNum,
        episode: episodeNum,
        titleHints: hints,
        gnulaUrl: gnulaUrlHint || undefined,
        yearHint: yearHint || undefined,
        force,
      });

      const availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[] =
        probedLanguages.length > 0 ? probedLanguages : isReleasedShow ? ['ES', 'EN'] : [];

      if (probedLanguages.length > 0) {
        tvLangProbeCache.set(cacheKey, { availableLanguages: probedLanguages, ts: Date.now() });
      }
      res.json({ success: true, availableLanguages });
    } catch {
      res.json({ success: false, availableLanguages: [] });
    }
  });
}
