import type express from 'express';
import { ENV } from '../../config/env.ts';
import {
  ANIME_PROVIDER_IDS,
  STREAMING_PROVIDER_MAP,
  resolveEffectiveProviderAndQuery,
} from '../../data/vodConstants.ts';
import {
  areTitlesStrictlyEqual,
  normalizeTitleForMatch,
} from '../../extractors/httpHelpers.ts';
import { probeAvailableLanguages } from '../../extractors/bingetrixMovidy.ts';
import { scrapeGnulaCatalog } from '../../extractors/gnulaHdExtractor.ts';
import { scrapeMovidyCatalog } from '../../services/movidyCatalogService.ts';
import {
  fetchVestDetailPage,
  isVestMirrorUrl,
  listVestCatalogEntries,
} from '../../services/vestMirrorService.ts';
import {
  correctCommonSearchTypos,
  getCatalogRefreshStatus,
  liveOnDemandFallbackSearch,
  runRefreshCycle,
  scoreTitleRelevance,
  searchIndexedCatalog,
} from '../../services/catalogRefreshService.ts';
import {
  extractLocalizedTmdbTitleHints,
  fetchTmdbMovieCatalog,
  movieCatalogCache,
} from '../../services/tmdbCatalogHelpers.ts';
import { tvLangProbeCache } from './tvDetailsHandler.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export async function handleMoviesCatalogRequest(req: express.Request, res: express.Response) {
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
    const scrapeMovidyMoviesFast = () =>
      Promise.race([
        scrapeMovidyCatalog({ category, page, query: searchQueryForScrapers }).catch(() => ({
          movies: [] as any[],
          hasMore: false,
        })),
        new Promise<{ movies: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ movies: [], hasMore: false }), query ? 1900 : 2800)
        ),
      ]);

    const [movidyData, gnulaData, tmdbData] = await Promise.all([
      scrapeMovidyMoviesFast(),
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
          ? await Promise.race([
              liveOnDemandFallbackSearch(searchQueryForScrapers, 'movie').catch(() => []),
              new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3200)),
            ])
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
}

export async function handleVestCatalogRequest(req: express.Request, res: express.Response) {
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
}

export async function handleBingetrixCatalogRequest(req: express.Request, res: express.Response) {
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
          ? await Promise.race([
              liveOnDemandFallbackSearch(cleanBingQuery, 'all').catch(() => []),
              new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3200)),
            ])
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
}

export async function handleTvLanguagesRequest(req: express.Request, res: express.Response) {
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
    let isSpanishOriginShow = false;
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
      const origLang = String(showJson?.original_language || '').toLowerCase();
      const origCountries: string[] = Array.isArray(showJson?.origin_country)
        ? showJson.origin_country
        : [];
      isSpanishOriginShow = origLang === 'es' || origCountries.includes('ES');

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

    const normalizedProbed =
      isSpanishOriginShow && probedLanguages.length > 0 && !probedLanguages.includes('ES')
        ? (['ES', ...probedLanguages] as ('ES' | 'LAT' | 'VOSE' | 'EN')[])
        : probedLanguages;

    const availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[] =
      normalizedProbed.length > 0 ? normalizedProbed : isReleasedShow ? ['ES', 'EN'] : [];

    if (normalizedProbed.length > 0) {
      tvLangProbeCache.set(cacheKey, { availableLanguages: normalizedProbed, ts: Date.now() });
    }
    res.json({ success: true, availableLanguages });
  } catch {
    res.json({ success: false, availableLanguages: [] });
  }
}

export { getCatalogRefreshStatus, runRefreshCycle };
