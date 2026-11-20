/**
 * @module server/routes/castellanoCatalog
 * @description Dedicated "Todo en Castellano (España)" hub (`/api/catalog/castellano`) combining curated Spanish hits, TMDB Spain, Movidy, GnulaHD & Vest mirror.
 */
import type { Express } from 'express';
import { ENV } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { areTitlesStrictlyEqual, normalizeTitleForMatch } from '../extractors/httpHelpers.ts';
import { scrapeGnulaCatalog } from '../extractors/gnulaHdExtractor.ts';
import { STREAMING_PROVIDER_MAP } from '../data/vodConstants.ts';
import { scrapeMovidyCatalog } from '../services/movidyCatalogService.ts';
import { listVestCatalogEntries } from '../services/vestMirrorService.ts';
import {
  liveOnDemandFallbackSearch,
  scoreTitleRelevance,
} from '../services/catalogRefreshService.ts';

const CURATED_CASTELLANO_SERIES_SEEDS: {
  tmdbId: number;
  providerId: string;
  platform: string;
}[] = [
  { tmdbId: 35338, providerId: 'prime', platform: 'Prime Video / Mediaset' }, // La que se avecina
  { tmdbId: 2282, providerId: 'netflix', platform: 'Netflix / Atresmedia' }, // Aquí no hay quien viva
  { tmdbId: 215092, providerId: 'netflix', platform: 'Netflix' }, // Machos alfa
  { tmdbId: 63980, providerId: 'movistar', platform: 'Telecinco' }, // Camera Café
  { tmdbId: 89427, providerId: 'prime', platform: 'Prime Video' }, // El pueblo
  { tmdbId: 1032, providerId: 'netflix', platform: 'Telecinco' }, // Aída
  { tmdbId: 7283, providerId: 'prime', platform: 'Telecinco' }, // Los Serrano
  { tmdbId: 111, providerId: 'movistar', platform: 'Telecinco' }, // 7 vidas
  { tmdbId: 21631, providerId: 'netflix', platform: 'Atresplayer' }, // Física o química
  { tmdbId: 34376, providerId: 'netflix', platform: 'Atresplayer' }, // Los hombres de Paco
  { tmdbId: 66806, providerId: 'netflix', platform: 'Netflix' }, // Paquita Salas
  { tmdbId: 226469, providerId: 'movistar', platform: 'Movistar+' }, // Poquita fe
  { tmdbId: 237964, providerId: 'movistar', platform: 'Movistar+' }, // Muertos S.L.
  { tmdbId: 62865, providerId: 'prime', platform: 'Cuatro' }, // Gym Tony
  { tmdbId: 61776, providerId: 'netflix', platform: 'Antena 3' }, // Manos a la obra
  { tmdbId: 203667, providerId: 'prime', platform: 'Prime Video' }, // Reina Roja
  { tmdbId: 146176, providerId: 'netflix', platform: 'Netflix' }, // Berlín
  { tmdbId: 128015, providerId: 'netflix', platform: 'Netflix' }, // Entrevías
  { tmdbId: 96005, providerId: 'movistar', platform: 'Movistar+' }, // Antidisturbios
  { tmdbId: 89844, providerId: 'hbomax', platform: 'HBO Max' }, // 30 Monedas
  { tmdbId: 241539, providerId: 'movistar', platform: 'Movistar+' }, // Celeste
  { tmdbId: 227042, providerId: 'netflix', platform: 'Netflix' }, // Clanes
  { tmdbId: 229962, providerId: 'netflix', platform: 'Netflix' }, // El cuerpo en llamas
  { tmdbId: 71446, providerId: 'netflix', platform: 'Netflix' }, // La Casa de Papel
  { tmdbId: 62099, providerId: 'hbomax', platform: 'RTVE / HBO' }, // El Ministerio del Tiempo
  { tmdbId: 124364, providerId: 'hbomax', platform: 'HBO Max' }, // From
  { tmdbId: 94997, providerId: 'hbomax', platform: 'HBO Max' }, // La Casa del Dragón
  { tmdbId: 100088, providerId: 'hbomax', platform: 'HBO Max' }, // The Last of Us
  { tmdbId: 106379, providerId: 'prime', platform: 'Prime Video' }, // Fallout
  { tmdbId: 66732, providerId: 'netflix', platform: 'Netflix' }, // Stranger Things
  { tmdbId: 76479, providerId: 'prime', platform: 'Prime Video' }, // The Boys
  { tmdbId: 1399, providerId: 'hbomax', platform: 'HBO Max' }, // Juego de Tronos
  { tmdbId: 95396, providerId: 'apple', platform: 'Apple TV+' }, // Severance
  { tmdbId: 125988, providerId: 'apple', platform: 'Apple TV+' }, // Silo
  { tmdbId: 93405, providerId: 'netflix', platform: 'Netflix' }, // El juego del calamar
];

const CURATED_CASTELLANO_MOVIE_SEEDS: {
  tmdbId: number;
  providerId: string;
  platform: string;
}[] = [
  { tmdbId: 906126, providerId: 'netflix', platform: 'Netflix' }, // La sociedad de la nieve
  { tmdbId: 1154766, providerId: 'movistar', platform: 'Movistar+' }, // La infiltrada
  { tmdbId: 1125510, providerId: 'netflix', platform: 'Netflix' }, // El hoyo 2
  { tmdbId: 693134, providerId: 'hbomax', platform: 'HBO Max' }, // Dune: Parte Dos
  { tmdbId: 558449, providerId: 'movistar', platform: 'Movistar+' }, // Gladiator II
  { tmdbId: 533535, providerId: 'disney', platform: 'Disney+' }, // Deadpool y Lobezno
  { tmdbId: 1022789, providerId: 'disney', platform: 'Disney+' }, // Del revés 2
  { tmdbId: 762504, providerId: 'movistar', platform: 'Movistar+' }, // As bestas
  { tmdbId: 1059264, providerId: 'movistar', platform: 'Movistar+' }, // CampeoneX
  { tmdbId: 872585, providerId: 'skyshowtime', platform: 'SkyShowtime' }, // Oppenheimer
  { tmdbId: 1184918, providerId: 'movistar', platform: 'Movistar+' }, // Robot salvaje
  { tmdbId: 912649, providerId: 'movistar', platform: 'Movistar+' }, // Venom: El último baile
];

const castellanoSeedHydrationCache = new LruTtlCache<string, { item: any; ts: number }>(
  200,
  6 * 60 * 60 * 1000
);
const castellanoCatalogCache = new LruTtlCache<string, { items: any[]; hasMore: boolean; ts: number }>(
  120,
  15 * 60 * 1000
);

async function hydrateCastellanoSeed(
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  providerId: string,
  platform: string
): Promise<any | null> {
  const key = `${mediaType}:${tmdbId}`;
  const cached = castellanoSeedHydrationCache.get(key);
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
    return cached.item;
  }
  try {
    const url =
      mediaType === 'tv'
        ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${ENV.tmdbApiKey}&language=es-ES`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${ENV.tmdbApiKey}&language=es-ES`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const m: any = await res.json();
    if (!m?.id || (!m.poster_path && !m.backdrop_path)) return null;

    const item = {
      id: `castellano-${mediaType}-${m.id}`,
      tmdbId: m.id,
      mediaType,
      title: m.name || m.title || m.original_name || m.original_title || 'Título',
      originalTitle: m.original_name || m.original_title || m.name || m.title || '',
      year: String(m.first_air_date || m.release_date || '').split('-')[0] || 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        'Disponible en Castellano (Español de España) 1080p sin anuncios.',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl:
        mediaType === 'movie' ? `https://bingetrix.sc/watch/${m.id}` : undefined,
      languages: ['Castellano', 'VOSE', 'EN'],
      platform,
      providerId,
    };
    castellanoSeedHydrationCache.set(key, { item, ts: Date.now() });
    return item;
  } catch {
    return null;
  }
}

export function registerCastellanoCatalogRoutes(app: Express): void {
  app.get('/api/catalog/castellano', async (req, res) => {
    try {
      const kind = String(req.query.kind || 'all').toLowerCase();
      const provider = String(req.query.provider || 'all').toLowerCase();
      const category = String(req.query.category || 'trending').toLowerCase();
      const query = String(req.query.query || '').trim();
      const page = Math.max(1, Math.min(50, parseInt(String(req.query.page || '1'), 10) || 1));

      const cacheKey = `v3|${kind}|${provider}|${category}|${page}|${query.toLowerCase()}`;
      const cached = castellanoCatalogCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        return res.json({
          success: true,
          items: cached.items,
          hasMore: cached.hasMore,
          page,
        });
      }

      const provCfg = STREAMING_PROVIDER_MAP[provider];
      const items: any[] = [];
      const seenKeys = new Set<string>();

      const pushUnique = (entry: any) => {
        if (!entry || (!entry.poster && !entry.backdrop)) return;
        const k = `${entry.mediaType || 'movie'}:${entry.tmdbId || normalizeTitleForMatch(entry.title || '')}`;
        if (seenKeys.has(k)) return;
        seenKeys.add(k);
        items.push({
          ...entry,
          languages: Array.from(new Set(['Castellano', ...(entry.languages || [])])),
        });
      };

      if (page === 1 && !query && (category === 'trending' || category === 'popular')) {
        const wantSeries = kind === 'all' || kind === 'series';
        const wantMovies = kind === 'all' || kind === 'movies';

        const seriesSeeds = wantSeries
          ? CURATED_CASTELLANO_SERIES_SEEDS.filter(
              (s) => provider === 'all' || s.providerId === provider
            )
          : [];
        const movieSeeds = wantMovies
          ? CURATED_CASTELLANO_MOVIE_SEEDS.filter(
              (m) => provider === 'all' || m.providerId === provider
            )
          : [];

        const [hydratedSeries, hydratedMovies] = await Promise.all([
          Promise.all(
            seriesSeeds.map((s) =>
              hydrateCastellanoSeed(s.tmdbId, 'tv', s.providerId, s.platform)
            )
          ),
          Promise.all(
            movieSeeds.map((m) =>
              hydrateCastellanoSeed(m.tmdbId, 'movie', m.providerId, m.platform)
            )
          ),
        ]);

        if (kind === 'series') {
          hydratedSeries.forEach(pushUnique);
        } else if (kind === 'movies') {
          hydratedMovies.forEach(pushUnique);
        } else {
          const maxLen = Math.max(hydratedSeries.length, hydratedMovies.length);
          for (let i = 0; i < maxLen; i++) {
            if (hydratedSeries[i]) pushUnique(hydratedSeries[i]);
            if (hydratedMovies[i]) pushUnique(hydratedMovies[i]);
          }
        }
      }

      const todayIso = new Date().toISOString().split('T')[0];
      const buildTmdbDiscoverUrl = (mType: 'tv' | 'movie') => {
        if (query) {
          return `https://api.themoviedb.org/3/search/${mType}?api_key=${ENV.tmdbApiKey}&language=es-ES&query=${encodeURIComponent(
            query
          )}&page=${page}&include_adult=false`;
        }
        const params = new URLSearchParams({
          api_key: ENV.tmdbApiKey,
          language: 'es-ES',
          page: String(page),
          include_adult: 'false',
          watch_region: 'ES',
          with_watch_monetization_types: 'flatrate|free|ads|rent|buy',
        });
        if (mType === 'movie') {
          params.set('primary_release_date.lte', todayIso);
        } else {
          params.set('first_air_date.lte', todayIso);
        }
        if (provCfg) {
          params.set('with_watch_providers', provCfg.id);
        }
        if (category === 'spanish_originals') {
          params.set('with_origin_country', 'ES');
          params.set('sort_by', 'popularity.desc');
        } else if (category === 'top_rated') {
          params.set('sort_by', 'vote_average.desc');
          params.set('vote_count.gte', '200');
        } else {
          params.set('sort_by', 'popularity.desc');
          params.set('vote_count.gte', '40');
        }
        const movieGenreMap: Record<string, string> = {
          action: '28',
          drama: '18',
          thriller: '53',
          comedy: '35',
          scifi: '878',
          horror: '27',
        };
        const tvGenreMap: Record<string, string> = {
          action: '10759',
          drama: '18',
          thriller: '80,9648',
          comedy: '35',
          scifi: '10765',
          horror: '9648',
        };
        const gVal = mType === 'tv' ? tvGenreMap[category] : movieGenreMap[category];
        if (gVal) params.set('with_genres', gVal);

        return `https://api.themoviedb.org/3/discover/${mType}?${params.toString()}`;
      };

      const wantFallbackType = kind === 'series' ? 'tv' : kind === 'movies' ? 'movie' : 'all';
      const [tvRes, movRes, movidyData, gnulaMoviesData, gnulaSeriesData, fallbackEntries] =
        await Promise.all([
          kind === 'all' || kind === 'series'
            ? fetch(buildTmdbDiscoverUrl('tv'), { signal: AbortSignal.timeout(4500) })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            : Promise.resolve(null),
          kind === 'all' || kind === 'movies'
            ? fetch(buildTmdbDiscoverUrl('movie'), { signal: AbortSignal.timeout(4500) })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            : Promise.resolve(null),
          (kind === 'all' || kind === 'movies') && provider === 'all' && category !== 'spanish_originals'
            ? Promise.race([
                scrapeMovidyCatalog({ category: 'trending', page, query }).catch(() => ({
                  movies: [],
                  hasMore: false,
                })),
                new Promise<{ movies: any[]; hasMore: boolean }>((r) =>
                  setTimeout(() => r({ movies: [], hasMore: false }), 2800)
                ),
              ])
            : Promise.resolve({ movies: [], hasMore: false }),
          (kind === 'all' || kind === 'movies') && provider === 'all' && category !== 'spanish_originals'
            ? Promise.race([
                scrapeGnulaCatalog({ category: 'trending', page, query, mediaType: 'movie' }).catch(
                  () => ({
                    items: [],
                    hasMore: false,
                  })
                ),
                new Promise<{ items: any[]; hasMore: boolean }>((r) =>
                  setTimeout(() => r({ items: [], hasMore: false }), 2800)
                ),
              ])
            : Promise.resolve({ items: [], hasMore: false }),
          (kind === 'all' || kind === 'series') && provider === 'all' && category !== 'spanish_originals'
            ? Promise.race([
                scrapeGnulaCatalog({ category: 'trending', page, query, mediaType: 'tv' }).catch(
                  () => ({
                    items: [],
                    hasMore: false,
                  })
                ),
                new Promise<{ items: any[]; hasMore: boolean }>((r) =>
                  setTimeout(() => r({ items: [], hasMore: false }), 2800)
                ),
              ])
            : Promise.resolve({ items: [], hasMore: false }),
          query
            ? Promise.race([
                liveOnDemandFallbackSearch(query, wantFallbackType).catch(() => [] as any[]),
                new Promise<any[]>((r) => setTimeout(() => r([]), 3800)),
              ])
            : Promise.resolve([] as any[]),
        ]);

      const mapTmdbEntry = (raw: any, mType: 'tv' | 'movie') => {
        if (!raw?.id || (!raw.poster_path && !raw.backdrop_path)) return null;
        return {
          id: `castellano-${mType}-${raw.id}`,
          tmdbId: raw.id,
          mediaType: mType,
          title: raw.name || raw.title || raw.original_name || raw.original_title || 'Título',
          originalTitle: raw.original_name || raw.original_title || '',
          year: String(raw.first_air_date || raw.release_date || '').split('-')[0] || 'HD',
          rating: raw.vote_average ? Number(raw.vote_average).toFixed(1) : '',
          overview:
            raw.overview ||
            'Disponible en Castellano (Español de España) y VO Subtitulado en 1080p.',
          poster: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : '',
          backdrop: raw.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}`
            : '',
          bingetrixUrl: mType === 'movie' ? `https://bingetrix.sc/watch/${raw.id}` : undefined,
          languages: ['Castellano', 'VOSE', 'EN'],
          platform: provCfg?.label || (category === 'spanish_originals' ? 'España' : undefined),
          providerId: provCfg ? provider : undefined,
        };
      };

      const tvArr: any[] = Array.isArray(tvRes?.results) ? tvRes.results : [];
      const movArr: any[] = Array.isArray(movRes?.results) ? movRes.results : [];
      const maxDisc = Math.max(tvArr.length, movArr.length);
      for (let i = 0; i < maxDisc; i++) {
        if (tvArr[i]) pushUnique(mapTmdbEntry(tvArr[i], 'tv'));
        if (movArr[i]) pushUnique(mapTmdbEntry(movArr[i], 'movie'));
      }

      const movidyCastellanoFiltered = query
        ? movidyData.movies.filter(
            (mv) => scoreTitleRelevance(mv.title, mv.originalTitle, query) >= 70
          )
        : movidyData.movies;

      for (const mv of movidyCastellanoFiltered.slice(0, 12)) {
        if (
          items.some((existing) =>
            areTitlesStrictlyEqual(mv.title, [existing.title, existing.originalTitle].filter(Boolean))
          )
        ) {
          continue;
        }
        pushUnique({
          ...mv,
          mediaType: 'movie',
          languages: ['Castellano', 'Latino', 'VOSE'],
        });
      }

      const gnulaAllRaw = [...gnulaMoviesData.items, ...gnulaSeriesData.items];
      const gnulaCastellanoFiltered = query
        ? gnulaAllRaw.filter(
            (gn: any) => scoreTitleRelevance(gn.title, gn.originalTitle, query) >= 70
          )
        : gnulaAllRaw;

      for (const gn of gnulaCastellanoFiltered.slice(0, 20)) {
        const existing = items.find((ex) =>
          areTitlesStrictlyEqual(gn.title, [ex.title, ex.originalTitle].filter(Boolean))
        );
        if (existing) {
          if (!existing.gnulaUrl && gn.gnulaUrl) existing.gnulaUrl = gn.gnulaUrl;
          continue;
        }
        pushUnique(gn);
      }

      if (page === 1 || query) {
        const vestEntries = listVestCatalogEntries({
          mediaType: kind === 'series' ? 'tv' : kind === 'movies' ? 'movie' : 'all',
          query,
        });
        for (const ve of vestEntries) {
          if (
            !ve.tmdbId &&
            items.some((existing) =>
              areTitlesStrictlyEqual(ve.title, [existing.title, existing.originalTitle].filter(Boolean))
            )
          ) {
            continue;
          }
          pushUnique(ve);
        }
      }

      if (query) {
        for (const fe of fallbackEntries) {
          if (
            !fe.tmdbId &&
            items.some((existing) =>
              areTitlesStrictlyEqual(fe.title, [existing.title, existing.originalTitle].filter(Boolean))
            )
          ) {
            continue;
          }
          pushUnique(fe);
        }
        items.sort(
          (a, b) =>
            scoreTitleRelevance(b.title, b.originalTitle, query, { altTitle: b.altTitle }) -
            scoreTitleRelevance(a.title, a.originalTitle, query, { altTitle: a.altTitle })
        );
      }

      const hasMore =
        page < Math.max(Number(tvRes?.total_pages || 1), Number(movRes?.total_pages || 1));

      castellanoCatalogCache.set(cacheKey, { items, hasMore, ts: Date.now() });
      res.json({ success: true, items, hasMore, page });
    } catch (err) {
      console.error('Castellano catalog error:', err);
      res.status(500).json({ success: false, items: [], hasMore: false });
    }
  });
}
