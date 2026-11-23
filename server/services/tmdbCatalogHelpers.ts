import { ENV } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  ANIME_MOVIE_GENRE_EXTRAS,
  ANIME_PROVIDER_IDS,
  ANIMEBOX_CURATED_MOVIE_IDS,
  CURATED_4K_MOVIE_IDS,
  CURATED_4K_MOVIE_SET,
  CURATED_SPANISH_KIDS_MOVIE_IDS,
  MOVIE_GENRE_MAP,
  STREAMING_PROVIDER_MAP,
  resolveEffectiveProviderAndQuery,
} from '../data/vodConstants.ts';
import {
  areTitlesStrictlyEqual,
  normalizeTitleForMatch,
} from '../extractors/httpHelpers.ts';
import { fetchTmdbJson, fetchTmdbUrlJson } from './tmdbService.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export const movieCatalogCache = new LruTtlCache<string, { movies: any[]; hasMore: boolean; ts: number }>(
  180,
  15 * 60 * 1000
);

export const SERIES_GENRE_MAP: Record<string, number> = {
  action: 10759,
  scifi: 10765,
  drama: 18,
  crime: 80,
  comedy: 35,
  animation: 16,
  anime: 16,
  family: 10751,
  kids: 10762,
  mystery: 9648,
};

export async function fetchTmdbItemsByIds(
  ids: number[],
  mediaType: 'movie' | 'tv',
  lang: 'es-ES' | 'en-US'
): Promise<any[]> {
  const results = await Promise.all(
    ids.map((id) =>
      fetchTmdbJson<any>(`/${mediaType}/${id}`, { language: lang }, 30 * 60 * 1000).catch(() => null)
    )
  );
  return results.filter((x) => x && x.id && (x.poster_path || x.backdrop_path));
}

export function normalizeNoSpaceForSearch(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function buildSmartConcatQueryVariants(rawQuery: string): string[] {
  const q = String(rawQuery || '').trim();
  if (!q || /\s/.test(q) || q.length < 5 || q.length > 18) return [];
  if (!/^[a-zA-Z0-9\u00C0-\u017F]+$/.test(q)) return [];

  const candidates: string[] = [];
  const camelSplit = q.replace(/([a-z\u00E0-\u00FF])([A-Z\u00C0-\u00DF])/g, '$1 $2').trim();
  if (camelSplit !== q && camelSplit.includes(' ')) {
    candidates.push(camelSplit);
  }

  const splitIndices = Array.from(
    new Set([2, 3, 4, Math.floor(q.length / 2)].filter((i) => i >= 2 && i <= q.length - 2))
  );
  for (const idx of splitIndices) {
    const splitStr = `${q.slice(0, idx)} ${q.slice(idx)}`;
    if (!candidates.includes(splitStr)) {
      candidates.push(splitStr);
    }
  }
  return candidates.slice(0, 3);
}

export function rankTmdbSearchResultsForQuery(items: any[], rawQuery: string, isTv = false): any[] {
  const normQSpace = normalizeTitleForMatch(rawQuery);
  const normQCompact = normalizeNoSpaceForSearch(rawQuery);
  if (!normQCompact) return items;

  const scoreItem = (item: any): number => {
    const t1 = String((isTv ? item?.name : item?.title) || item?.title || item?.name || '');
    const t2 = String(
      (isTv ? item?.original_name : item?.original_title) ||
        item?.originalTitle ||
        item?.original_name ||
        item?.original_title ||
        ''
    );
    const n1Space = normalizeTitleForMatch(t1);
    const n2Space = normalizeTitleForMatch(t2);
    const n1Compact = normalizeNoSpaceForSearch(t1);
    const n2Compact = normalizeNoSpaceForSearch(t2);

    let tier = 0;
    if (n1Space === normQSpace || n2Space === normQSpace) tier = 500;
    else if (n1Compact === normQCompact || n2Compact === normQCompact) tier = 420;
    else if (
      n1Space.startsWith(normQSpace) ||
      n2Space.startsWith(normQSpace) ||
      n1Compact.startsWith(normQCompact) ||
      n2Compact.startsWith(normQCompact)
    ) {
      tier = 260;
    } else if (
      n1Space.includes(normQSpace) ||
      n2Space.includes(normQSpace) ||
      n1Compact.includes(normQCompact) ||
      n2Compact.includes(normQCompact)
    ) {
      tier = 140;
    }

    const votes = Number(item?.vote_count || 0);
    const pop = Number(item?.popularity || 0);
    const popBoost = Math.min(95, Math.log10(Math.max(1, votes + pop + 1)) * 22);
    return tier + popBoost;
  };

  return [...items].sort((a, b) => scoreItem(b) - scoreItem(a));
}

const TMDB_GENRE_LABEL_ES: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción',
  10765: 'Sci-Fi',
};

const TMDB_GENRE_LABEL_EN: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action',
  10765: 'Sci-Fi',
};

export function mapTmdbGenreLabels(item: any, lang: 'es-ES' | 'en-US'): string[] {
  const dict = lang === 'en-US' ? TMDB_GENRE_LABEL_EN : TMDB_GENRE_LABEL_ES;
  if (Array.isArray(item?.genres) && item.genres.length > 0) {
    return item.genres
      .map((g: any) => dict[Number(g?.id)] || g?.name)
      .filter(Boolean)
      .slice(0, 2);
  }
  const ids: number[] = Array.isArray(item?.genre_ids) ? item.genre_ids : [];
  const isJa = String(item?.original_language || '').toLowerCase() === 'ja';
  const labels: string[] = [];
  if (ids.includes(16) && isJa) {
    labels.push('Anime');
  }
  for (const id of ids) {
    const label = dict[Number(id)];
    if (label && !labels.includes(label)) {
      if (label === 'Animación' && labels.includes('Anime')) continue;
      if (label === 'Animation' && labels.includes('Anime')) continue;
      labels.push(label);
    }
    if (labels.length >= 2) break;
  }
  return labels.slice(0, 2);
}

export async function fetchTmdbMovieCatalog(opts: {
  lang: 'es-ES' | 'en-US';
  category: string;
  sort?: string;
  page: number;
  query: string;
  provider?: string;
}) {
  const { lang, category, sort = '', page } = opts;
  const { provider, query } = resolveEffectiveProviderAndQuery(opts.provider || 'all', opts.query);
  const provCfg = STREAMING_PROVIDER_MAP[provider];
  const isAnime = ANIME_PROVIDER_IDS.has(provider);

  const cacheKey = `v7|${lang}|${provider}|${category}|${sort}|${page}|${query}`;
  const cached = movieCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  let endpoint = '';
  let curatedSeedItems: any[] = [];

  if (query) {
    endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  } else if (isAnime) {
    const animeGenres = ANIME_MOVIE_GENRE_EXTRAS[category] || '16';
    const sortBy =
      category === 'top_rated'
        ? 'vote_average.desc'
        : category === 'simulcast' || category === 'now_playing' || provider === 'jkanime'
        ? 'primary_release_date.desc'
        : provider === 'animeflv' && category === 'trending'
        ? 'vote_count.desc'
        : 'popularity.desc';
    const minVotes =
      category === 'top_rated'
        ? 180
        : sortBy === 'primary_release_date.desc'
        ? 15
        : 45;

    if (provider === 'crunchyroll') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=US&with_watch_providers=283&with_watch_monetization_types=${encodeURIComponent(
        'flatrate|ads|free'
      )}&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=15&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    } else if (provider === 'animebox') {
      if (page === 1 && (category === 'trending' || category === 'popular')) {
        curatedSeedItems = await fetchTmdbItemsByIds(ANIMEBOX_CURATED_MOVIE_IDS, 'movie', lang);
      }
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=ES&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    } else {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    }
  } else if (provCfg) {
    const sortBy =
      category === 'top_rated'
        ? 'vote_average.desc'
        : category === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = category === 'top_rated' ? 300 : 120;
    const genreParam = MOVIE_GENRE_MAP[category] ? `&with_genres=${MOVIE_GENRE_MAP[category]}` : '';
    const companyParam =
      category === 'originals' && provCfg.movieCompanies
        ? `&with_companies=${encodeURIComponent(provCfg.movieCompanies)}`
        : '';
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=ES&with_watch_providers=${encodeURIComponent(
      provCfg.watchProviders
    )}&with_watch_monetization_types=${encodeURIComponent(
      'flatrate|ads|free'
    )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}${genreParam}${companyParam}&page=${page}&include_adult=false`;
  } else if (category === 'anime') {
    const discoverSort =
      sort === 'top_rated'
        ? 'vote_average.desc'
        : sort === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = sort === 'top_rated' ? 160 : 30;
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&with_genres=16&with_original_language=ja&page=${page}&include_adult=false`;
  } else if (category === 'kids') {
    if (page === 1) {
      curatedSeedItems = await fetchTmdbItemsByIds(CURATED_SPANISH_KIDS_MOVIE_IDS, 'movie', 'es-ES');
    }
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc&vote_count.gte=120&primary_release_date.lte=${todayIso}&with_genres=10751,16&without_genres=27,53,80,10752&certification_country=ES&certification.lte=7&page=${page}&include_adult=false`;
  } else if (MOVIE_GENRE_MAP[category]) {
    const discoverSort =
      sort === 'top_rated'
        ? 'vote_average.desc'
        : sort === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = sort === 'top_rated' ? 220 : 45;
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&with_genres=${MOVIE_GENRE_MAP[category]}&page=${page}&include_adult=false`;
  } else if (category === '4k' || sort === '4k') {
    if (page === 1) {
      curatedSeedItems = await fetchTmdbItemsByIds(CURATED_4K_MOVIE_IDS, 'movie', lang);
    }
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=vote_count.desc&vote_count.gte=1000&vote_average.gte=7.2&primary_release_date.gte=2008-01-01&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
  } else if (category === 'popular' || (!category && sort === 'popular')) {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'top_rated' || (!category && sort === 'top_rated')) {
    endpoint = `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'now_playing' || (!category && sort === 'now_playing')) {
    endpoint = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else {
    endpoint = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  }

  const json: any =
    (await fetchTmdbUrlJson<any>(endpoint, 5 * 60 * 1000).catch(() => null)) || {
      results: [],
      total_pages: 1,
    };
  let results: any[] = Array.isArray(json?.results) ? json.results : [];
  let totalPages = Number(json?.total_pages || 1);

  if (query && page === 1) {
    const compactQ = normalizeNoSpaceForSearch(query);
    const hasStrongExactMatch = results.some(
      (r) =>
        (normalizeNoSpaceForSearch(r?.title || '') === compactQ ||
          normalizeNoSpaceForSearch(r?.original_title || '') === compactQ) &&
        Number(r?.vote_count || 0) >= 40
    );

    const otherLang = lang === 'es-ES' ? 'en-US' : 'es-ES';
    const [otherLangRes, multiRes] = await Promise.all([
      fetchTmdbJson<any>(
        '/search/movie',
        { language: otherLang, query, page: 1, include_adult: false },
        5 * 60 * 1000
      ).catch(() => null),
      fetchTmdbJson<any>(
        '/search/multi',
        { language: 'en-US', query, page: 1, include_adult: false },
        5 * 60 * 1000
      ).catch(() => null),
    ]);

    const extraRows: any[] = [
      ...(Array.isArray(otherLangRes?.results) ? otherLangRes.results : []),
      ...(Array.isArray(multiRes?.results)
        ? multiRes.results.filter((x: any) => !x?.media_type || x.media_type === 'movie')
        : []),
    ];

    if (!hasStrongExactMatch) {
      const variants = buildSmartConcatQueryVariants(query);
      if (variants.length > 0) {
        const extraLists = await Promise.all(
          variants.map(async (vq) => {
            const ej = await fetchTmdbJson<any>(
              '/search/movie',
              { language: lang, query: vq, page: 1, include_adult: false },
              5 * 60 * 1000
            ).catch(() => null);
            return Array.isArray(ej?.results) ? ej.results : [];
          })
        );
        extraRows.push(...extraLists.flat());
      }
    }

    if (extraRows.length > 0) {
      const byId = new Map<number, any>();
      for (const r of [...results, ...extraRows]) {
        if (!r?.id) continue;
        if (!byId.has(r.id)) byId.set(r.id, r);
      }
      results = rankTmdbSearchResultsForQuery(Array.from(byId.values()), query, false);
    } else if (results.length > 0) {
      results = rankTmdbSearchResultsForQuery(results, query, false);
    }
  }

  if (isAnime && provider === 'crunchyroll' && !query && results.length < 4) {
    const animeGenres = ANIME_MOVIE_GENRE_EXTRAS[category] || '16';
    const fbJson = await fetchTmdbJson<any>(
      '/discover/movie',
      {
        language: lang,
        with_genres: animeGenres,
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
        'vote_count.gte': 30,
        'primary_release_date.lte': todayIso,
        page,
        include_adult: false,
      },
      5 * 60 * 1000
    ).catch(() => null);
    if (Array.isArray(fbJson?.results) && fbJson.results.length > results.length) {
      results = fbJson.results;
      totalPages = Number(fbJson?.total_pages || 1);
    }
  }

  const mergedRaw: any[] = [];
  const seenIds = new Set<number>();
  for (const item of [...curatedSeedItems, ...results]) {
    if (item?.id && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      mergedRaw.push(item);
    }
  }

  const isEn = lang === 'en-US';
  const movies = mergedRaw
    .filter((m) => {
      if (!m || !m.id || (!m.poster_path && !m.backdrop_path)) return false;
      if (isAnime && query) {
        const gIds: number[] = Array.isArray(m.genre_ids) ? m.genre_ids : [];
        const isJa = String(m.original_language || '').toLowerCase() === 'ja';
        if (!gIds.includes(16) && !isJa) return false;
      }
      if (!query && !isAnime) {
        if (Number(m.vote_count || 0) < 35 || Number(m.vote_average || 0) <= 0) {
          return false;
        }
        if (m.release_date && String(m.release_date) > todayIso) {
          return false;
        }
      }
      return true;
    })
    .map((m) => {
      const is4k = category === '4k' || sort === '4k' || CURATED_4K_MOVIE_SET.has(Number(m.id));
      return {
        id: `${isEn ? 'bingetrix' : 'es'}-${provider}-movie-${m.id}`,
        tmdbId: m.id,
        mediaType: 'movie' as const,
        is4k,
        quality: is4k ? '4K UHD' : 'HD',
        title: m.title || m.original_title || 'Película',
        originalTitle: m.original_title || m.title || '',
        year: m.release_date ? String(m.release_date).split('-')[0] : 'HD',
        rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
        overview:
          m.overview ||
          (isAnime
            ? 'Película de anime disponible en Español, Latino y VOSE (Japonés Sub Español) en 1080p.'
            : isEn
            ? 'Available in 1080p Original English ad-free streaming.'
            : 'Disponible en reproducción directa HD sin anuncios (Castellano, Latino y VO Inglés 1080p).'),
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
        backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
        bingetrixUrl: `https://bingetrix.sc/watch/${m.id}`,
        languages: isAnime
          ? ['Español', 'Latino', 'VOSE', 'EN']
          : isEn
          ? ['English 1080p', 'VOSE', 'ES']
          : ['Castellano', 'Latino', 'VOSE', 'EN'],
        platform: provCfg?.label,
        providerId: provCfg ? provider : undefined,
        genres: mapTmdbGenreLabels(m, lang),
        popularity: Number(m.popularity || 0),
        voteCount: Number(m.vote_count || 0),
      };
    });

  const payload = {
    movies,
    hasMore: page < totalPages && movies.length > 0,
    ts: Date.now(),
  };
  movieCatalogCache.set(cacheKey, payload);
  return payload;
}

export function extractLocalizedTmdbTitleHints(tmJson: any): string[] {
  if (!tmJson || typeof tmJson !== 'object') return [];
  const esRegions = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'UY', '419']);
  const enRegions = new Set(['US', 'GB', 'AU', 'CA']);

  const esTitles: string[] = [];
  const esAltTitles: string[] = [];
  const enTitles: string[] = [];
  const otherTitles: string[] = [];

  const primary = String(tmJson?.title || tmJson?.name || '').trim();
  const orig = String(tmJson?.original_title || tmJson?.original_name || '').trim();

  const translations: any[] = Array.isArray(tmJson?.translations?.translations)
    ? tmJson.translations.translations
    : [];
  for (const tr of translations) {
    const trName = String(tr?.data?.title || tr?.data?.name || '').trim();
    if (!trName) continue;
    const langCode = String(tr?.iso_639_1 || '').toLowerCase();
    const countryCode = String(tr?.iso_3166_1 || '').toUpperCase();
    if (langCode === 'es') {
      if (countryCode === 'ES') esTitles.unshift(trName);
      else esTitles.push(trName);
    } else if (langCode === 'en' || enRegions.has(countryCode)) {
      enTitles.push(trName);
    } else {
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
    } else if (enRegions.has(countryCode)) {
      enTitles.push(altTitle);
    } else {
      otherTitles.push(altTitle);
    }
  }

  const ordered =
    esTitles.length > 0 && primary && orig && normalizeTitleForMatch(primary) === normalizeTitleForMatch(orig)
      ? [...esTitles, primary, ...esAltTitles, orig, ...enTitles, ...otherTitles]
      : [primary, ...esTitles, ...esAltTitles, orig, ...enTitles, ...otherTitles];

  return Array.from(new Set(ordered.filter(Boolean)));
}

export async function resolveTmdbIdByTitle(
  title: string,
  mediaType: 'movie' | 'tv',
  expectedYear?: string
): Promise<number | null> {
  try {
    const rawStr = String(title || '').trim();
    const clean = rawStr
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+(?:la\s+serie|serie\s+completa|serie)$/i, '')
      .trim();
    const parenYear = rawStr.match(/\(((?:19|20)\d{2})\)/)?.[1] || '';
    if (!clean || normalizeTitleForMatch(clean).length < 2) return null;

    const yearHint =
      expectedYear && /^(?:19|20)\d{2}$/.test(expectedYear.trim())
        ? expectedYear.trim()
        : parenYear;
    const yearNum = yearHint ? Number(yearHint) : 0;

    const matchesTitle = (r: any): boolean => {
      const rTitle = String(r?.title || r?.name || '').trim();
      const rOrig = String(r?.original_title || r?.original_name || '').trim();
      return (
        areTitlesStrictlyEqual(rawStr, [rTitle, rOrig].filter(Boolean)) ||
        areTitlesStrictlyEqual(clean, [rTitle, rOrig].filter(Boolean))
      );
    };

    const pickFromResults = (results: any[]): number | null => {
      if (results.length === 0) return null;
      if (yearNum > 0) {
        const exactYearHit = results.find(
          (r) =>
            matchesTitle(r) &&
            Number(String(r?.release_date || r?.first_air_date || '').split('-')[0]) === yearNum
        );
        if (exactYearHit?.id) return Number(exactYearHit.id);
        const adjacentYearHit = results.find((r) => {
          if (!matchesTitle(r)) return false;
          const ry = Number(String(r?.release_date || r?.first_air_date || '').split('-')[0]);
          return ry > 1900 && Math.abs(ry - yearNum) <= 1;
        });
        return adjacentYearHit?.id ? Number(adjacentYearHit.id) : null;
      }
      const exactTitleHit = results.find((r) => matchesTitle(r));
      return exactTitleHit?.id ? Number(exactTitleHit.id) : null;
    };

    for (const lang of ['es-ES', 'en-US'] as const) {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(clean)}&page=1&include_adult=false`,
        { signal: AbortSignal.timeout(3500) }
      ).catch(() => null);
      if (!res?.ok) continue;
      const json: any = await res.json().catch(() => null);
      const results: any[] = Array.isArray(json?.results) ? json.results : [];
      const foundId = pickFromResults(results);
      if (foundId) return foundId;
    }
    return null;
  } catch {
    return null;
  }
}
