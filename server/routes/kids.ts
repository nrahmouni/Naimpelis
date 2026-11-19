import type { Express, Request, Response } from 'express';
import { fetchTmdbJson } from '../services/tmdbService.ts';
import { logger } from '../utils/logger.ts';
import type { CatalogMovie } from '../../src/types.ts';
import {
  CURATED_KIDS_QUERIES,
  KIDS_CURATED_SHOWCASE,
  KIDS_LIVE_CHANNELS,
  KIDS_THEME_QUERIES,
  KIDS_TMDB_LANG_MAP,
  kidsChannelToCatalogMovie,
  normalizeKidsLang,
  type KidsAgeGroup,
  type KidsLanguageCode,
  type KidsLiveChannelEntry,
  type TmdbResultItem,
} from './kidsData.ts';
import { mapTmdbItemToKidsCatalogMovie, registerKidsAiRoutes } from './kidsAiRoutes.ts';
import { registerKidsYoutubeRoutes } from './kidsYoutubeRoutes.ts';

export {
  KIDS_CURATED_SHOWCASE,
  KIDS_LIVE_CHANNELS,
  kidsChannelToCatalogMovie,
  type KidsAgeGroup,
  type KidsLanguageCode,
  type KidsLiveChannelEntry,
};

async function fetchKidsDiscoverItems(
  kidsLang: KidsLanguageCode,
  category: string,
  query: string,
  ageGroup: KidsAgeGroup = '6-8'
): Promise<CatalogMovie[]> {
  if (category === 'live' || category === 'canales') {
    const sortedChannels = [...KIDS_LIVE_CHANNELS].sort((a, b) => {
      if (a.langCode === kidsLang && b.langCode !== kidsLang) return -1;
      if (b.langCode === kidsLang && a.langCode !== kidsLang) return 1;
      return a.dial - b.dial;
    });
    return sortedChannels.map(kidsChannelToCatalogMovie);
  }

  const tmdbLang = KIDS_TMDB_LANG_MAP[kidsLang] || 'es-ES';
  const collected: CatalogMovie[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (item: CatalogMovie | null) => {
    if (!item) return;
    const key = `${item.mediaType || 'movie'}-${item.tmdbId || item.id}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    collected.push(item);
  };

  try {
    if (query.trim()) {
      const encodedQ = encodeURIComponent(query.trim());
      const [movieSearch, tvSearch] = await Promise.all([
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/search/movie?query=${encodedQ}&language=${tmdbLang}&include_adult=false&page=1`
        ),
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/search/tv?query=${encodedQ}&language=${tmdbLang}&include_adult=false&page=1`
        ),
      ]);

      const safeMovies = (movieSearch?.results || []).filter((m) => {
        const g = m.genre_ids || [];
        return g.includes(16) || g.includes(10751) || g.includes(12) || g.includes(35);
      });
      const safeTv = (tvSearch?.results || []).filter((t) => {
        const g = t.genre_ids || [];
        return g.includes(16) || g.includes(10751) || g.includes(10762);
      });

      safeMovies.forEach((m) => pushUnique(mapTmdbItemToKidsCatalogMovie(m, 'movie', kidsLang)));
      safeTv.forEach((t) => pushUnique(mapTmdbItemToKidsCatalogMovie(t, 'tv', kidsLang)));
      if (collected.length > 0) return collected.slice(0, 28);
    }

    if (KIDS_THEME_QUERIES[category]) {
      const themeSeeds = KIDS_THEME_QUERIES[category];
      const settled = await Promise.all(
        themeSeeds.map((seed) =>
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/search/${seed.type}?query=${encodeURIComponent(seed.q)}&language=${tmdbLang}&include_adult=false&page=1`
          ).then((data) => ({
            type: seed.type,
            items: (data?.results || []).slice(0, 2),
          }))
        )
      );
      for (const block of settled) {
        for (const rawItem of block.items) {
          pushUnique(mapTmdbItemToKidsCatalogMovie(rawItem, block.type, kidsLang));
        }
      }
      if (collected.length > 0) {
        return collected.slice(0, 24);
      }
    }

    const originCountryParam =
      kidsLang === 'nl'
        ? '&with_original_language=nl'
        : kidsLang === 'fr'
        ? '&with_original_language=fr'
        : kidsLang === 'zh'
        ? '&with_original_language=zh'
        : kidsLang === 'ar'
        ? '&with_original_language=ar'
        : kidsLang === 'ca'
        ? '&with_original_language=ca|ja|es'
        : '';

    const discoverRequests: Array<Promise<{ type: 'movie' | 'tv'; data: { results?: TmdbResultItem[] } | null }>> = [];

    if (category === 'series') {
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=10762|16&include_adult=false&page=1`
        ).then((data) => ({ type: 'tv' as const, data }))
      );
      if (originCountryParam) {
        discoverRequests.push(
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=16|10751|10762${originCountryParam}&include_adult=false&page=1`
          ).then((data) => ({ type: 'tv' as const, data }))
        );
      }
    } else if (category === 'educational') {
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/tv?language=${tmdbLang}&sort_by=vote_average.desc&vote_count.gte=25&with_genres=10762,99&include_adult=false&page=1`
        ).then((data) => ({ type: 'tv' as const, data })),
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&certification_country=ES&certification.lte=7&with_genres=99,10751&include_adult=false&page=1`
        ).then((data) => ({ type: 'movie' as const, data }))
      );
    } else if (category === 'family') {
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&certification_country=ES&certification.lte=7&with_genres=10751&without_genres=27,53&include_adult=false&page=1`
        ).then((data) => ({ type: 'movie' as const, data }))
      );
    } else {
      if (originCountryParam) {
        discoverRequests.push(
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&with_genres=16|10751${originCountryParam}&include_adult=false&page=1`
          ).then((data) => ({ type: 'movie' as const, data })),
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=16|10762${originCountryParam}&include_adult=false&page=1`
          ).then((data) => ({ type: 'tv' as const, data }))
        );
      }
      const certMax = ageGroup === '3-5' ? '0' : '7';
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&certification_country=ES&certification.lte=${certMax}&with_genres=16,10751&include_adult=false&page=1`
        ).then((data) => ({ type: 'movie' as const, data })),
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=10762|16&include_adult=false&page=1`
        ).then((data) => ({ type: 'tv' as const, data }))
      );
    }

    const curatedSeeds = CURATED_KIDS_QUERIES[kidsLang] || CURATED_KIDS_QUERIES.es;
    const curatedPromises = curatedSeeds.slice(0, 4).map((seed) =>
      fetchTmdbJson<{ results?: TmdbResultItem[] }>(
        `/search/${seed.type}?query=${encodeURIComponent(seed.q)}&language=${tmdbLang}&include_adult=false&page=1`
      ).then((data) => ({
        type: seed.type,
        data: data?.results ? { results: data.results.slice(0, 2) } : null,
      }))
    );

    const settled = await Promise.all([...curatedPromises, ...discoverRequests]);
    for (const block of settled) {
      const items = block.data?.results || [];
      for (const rawItem of items) {
        pushUnique(mapTmdbItemToKidsCatalogMovie(rawItem, block.type, kidsLang));
      }
    }
  } catch (err) {
    logger.warn({ err, kidsLang, category }, 'kids_catalog_fetch_failed');
  }

  if (collected.length < 12) {
    const showcasePool = [
      ...(KIDS_CURATED_SHOWCASE[kidsLang] || []),
      ...KIDS_CURATED_SHOWCASE.es,
    ];
    for (const item of showcasePool) {
      pushUnique(item);
    }
  }

  if (ageGroup === '3-5' && collected.length > 1) {
    const gentleRegex = /\b(peppa|pocoyo|bluey|bing|dora|paw|patrulla|clan|mickey|totoro|panda|dino|bebé|bebe|baby)\b/i;
    collected.sort((a, b) => {
      const aScore = (a.mediaType === 'tv' ? 1 : 0) + (gentleRegex.test(`${a.title} ${a.overview}`) ? 3 : 0);
      const bScore = (b.mediaType === 'tv' ? 1 : 0) + (gentleRegex.test(`${b.title} ${b.overview}`) ? 3 : 0);
      return bScore - aScore;
    });
  }

  return collected.slice(0, 28);
}

export function registerKidsRoutes(app: Express): void {
  app.get('/api/kids/catalog', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.query.lang);
    const category = String(req.query.category || 'all').trim().toLowerCase();
    const query = String(req.query.q || '').trim();
    const rawAge = String(req.query.ageGroup || '6-8').trim();
    const ageGroup: KidsAgeGroup =
      rawAge === '3-5' || rawAge === '9-12' ? rawAge : '6-8';

    const items = await fetchKidsDiscoverItems(kidsLang, category, query, ageGroup);
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({
      ok: true,
      lang: kidsLang,
      category,
      ageGroup,
      total: items.length,
      items,
    });
  });

  registerKidsAiRoutes(app);
  registerKidsYoutubeRoutes(app);
}
