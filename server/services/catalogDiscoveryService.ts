import type { CatalogMovie, StreamingProviderId } from '../../src/types.ts';
import { buildTmdbImageUrl, fetchTmdbJson, resolveTmdbLanguageTag } from './tmdbService.ts';
import { LruTtlCache } from '../utils/lruCache.ts';

export interface CatalogGenreItem {
  id: number;
  slug: string;
  es: string;
  ca: string;
  en: string;
  mediaType: 'movie' | 'tv' | 'both';
}

export interface EditorialCollection {
  id: string;
  titleEs: string;
  titleCa: string;
  titleEn: string;
  subtitleEs: string;
  subtitleCa: string;
  subtitleEn: string;
  mediaType: 'movie' | 'tv';
  items: CatalogMovie[];
}

export interface FastChannelItem {
  id: string;
  name: string;
  category: 'cinema' | 'sports' | 'documentary' | 'music' | 'anime' | 'news';
  descriptionEs: string;
  descriptionCa: string;
  descriptionEn: string;
  streamUrl: string;
  mode: 'hls' | 'youtube';
  youtubeId?: string;
  quality: string;
  tone: string;
  mark: string;
}

export const EXPANDED_GENRES: CatalogGenreItem[] = [
  { id: 28, slug: 'action', es: 'Acción', ca: 'Acció', en: 'Action', mediaType: 'movie' },
  { id: 878, slug: 'scifi', es: 'Ciencia Ficción', ca: 'Ciència-ficció', en: 'Sci-Fi', mediaType: 'movie' },
  { id: 53, slug: 'thriller', es: 'Thriller', ca: 'Thriller', en: 'Thriller', mediaType: 'movie' },
  { id: 27, slug: 'horror', es: 'Terror', ca: 'Terror', en: 'Horror', mediaType: 'movie' },
  { id: 35, slug: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy', mediaType: 'both' },
  { id: 18, slug: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama', mediaType: 'both' },
  { id: 16, slug: 'animation', es: 'Animación', ca: 'Animació', en: 'Animation', mediaType: 'both' },
  { id: 99, slug: 'documentary', es: 'Documentales', ca: 'Documentals', en: 'Documentary', mediaType: 'both' },
  { id: 80, slug: 'crime', es: 'Crimen', ca: 'Crim', en: 'Crime', mediaType: 'both' },
  { id: 14, slug: 'fantasy', es: 'Fantasía', ca: 'Fantasia', en: 'Fantasy', mediaType: 'movie' },
  { id: 12, slug: 'adventure', es: 'Aventura', ca: 'Aventura', en: 'Adventure', mediaType: 'movie' },
  { id: 10751, slug: 'family', es: 'Familia e Infantil', ca: 'Família i Infantil', en: 'Family & Kids', mediaType: 'both' },
  { id: 9648, slug: 'mystery', es: 'Misterio', ca: 'Misteri', en: 'Mystery', mediaType: 'both' },
  { id: 10765, slug: 'scifi-tv', es: 'Sci-Fi & Fantasía TV', ca: 'Ciència-ficció TV', en: 'Sci-Fi & Fantasy TV', mediaType: 'tv' },
];

export const FAST_THEMATIC_CHANNELS: FastChannelItem[] = [
  {
    id: 'fast-rtve-play-24h',
    name: '24h Noticias RTVE',
    category: 'news',
    descriptionEs: 'Información continua en directo 24 horas desde España.',
    descriptionCa: 'Informació contínua en directe 24 hores.',
    descriptionEn: 'Continuous live news coverage 24/7.',
    streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/24h/24h_main_dvr.m3u8',
    mode: 'hls',
    quality: '1080p HD',
    tone: '#0284C7',
    mark: '24H',
  },
  {
    id: 'fast-tdp-deportes',
    name: 'Teledeporte HD',
    category: 'sports',
    descriptionEs: 'Deporte en directo, ciclismo, tenis, atletismo y resúmenes.',
    descriptionCa: 'Esport en directe, ciclisme, tennis i resums.',
    descriptionEn: 'Live sports, cycling, tennis & highlights.',
    streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
    mode: 'hls',
    quality: '1080p HD',
    tone: '#E11D48',
    mark: 'TDP',
  },
  {
    id: 'fast-3cat-esport3',
    name: 'Esport3 3Cat HD',
    category: 'sports',
    descriptionEs: 'Retransmissions esportives, futbol sala, motor i programes en directe.',
    descriptionCa: 'Retransmissions esportives, motor i programes en directe.',
    descriptionEn: 'Live Catalan sports & motorsport broadcasts.',
    streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
    mode: 'hls',
    quality: '1080p HD',
    tone: '#F59E0B',
    mark: 'E3',
  },
  {
    id: 'fast-3cat-sx3',
    name: 'SX3 · Super3 & Anime',
    category: 'anime',
    descriptionEs: 'Anime, animación y programación juvenil en emisión continua.',
    descriptionCa: 'Anime, animació i programació juvenil en emissió contínua.',
    descriptionEn: 'Continuous anime & family animation channel.',
    streamUrl: 'https://directes-tv-cat.3catdirectes.cat/live-origin/super3-hls/master.m3u8',
    mode: 'hls',
    quality: '1080p HD',
    tone: '#8B5CF6',
    mark: 'SX3',
  },
  {
    id: 'fast-lofi-cinema',
    name: 'Lofi Beats & Chill Radio',
    category: 'music',
    descriptionEs: 'Música instrumental 24/7 para estudiar, relajarse o esperar en sala.',
    descriptionCa: 'Música instrumental 24/7 per relaxar-se o esperar a la sala.',
    descriptionEn: '24/7 instrumental beats while waiting in your watch party.',
    streamUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    mode: 'youtube',
    youtubeId: 'jfKfPfyJRdk',
    quality: 'HD Audio',
    tone: '#EC4899',
    mark: 'LOFI',
  },
  {
    id: 'fast-nasa-earth',
    name: 'NASA Live · Espacio & Tierra',
    category: 'documentary',
    descriptionEs: 'Vistas espaciales de la Tierra en directo y documentales científicos.',
    descriptionCa: 'Vistes espacials de la Terra en directe i documentals.',
    descriptionEn: 'Live views of Earth from orbit & space documentaries.',
    streamUrl: 'https://www.youtube.com/watch?v=21X5lGlDOfg',
    mode: 'youtube',
    youtubeId: '21X5lGlDOfg',
    quality: '1080p HD',
    tone: '#10B981',
    mark: 'NASA',
  },
  {
    id: 'fast-euronews-es',
    name: 'Euronews Español Live',
    category: 'news',
    descriptionEs: 'Actualidad europea e internacional en directo sin cortes.',
    descriptionCa: 'Actualitat europea i internacional en directe.',
    descriptionEn: 'European & global breaking news live.',
    streamUrl: 'https://www.youtube.com/watch?v=O9mOtdZ-nSk',
    mode: 'youtube',
    youtubeId: 'O9mOtdZ-nSk',
    quality: '1080p HD',
    tone: '#3B82F6',
    mark: 'EURO',
  },
  {
    id: 'fast-dw-documental',
    name: 'DW Documental · Ciencia y Cine',
    category: 'documentary',
    descriptionEs: 'Documentales de investigación, naturaleza y cultura en español.',
    descriptionCa: 'Documentals d’investigació, natura i cultura.',
    descriptionEn: 'Investigative, science & nature documentaries.',
    streamUrl: 'https://www.youtube.com/watch?v=LuJYMCbBiZc',
    mode: 'youtube',
    youtubeId: 'LuJYMCbBiZc',
    quality: '1080p HD',
    tone: '#06B6D4',
    mark: 'DW',
  },
];

const PROVIDER_TMDB_IDS: Record<string, string> = {
  netflix: '8',
  prime: '119',
  disney: '337',
  hbomax: '1899|384',
  apple: '350',
  movistar: '149',
  skyshowtime: '1773',
  filmin: '63',
  crunchyroll: '283',
};

const collectionsCache = new LruTtlCache<string, EditorialCollection[]>(20, 10 * 60 * 1000);
const discoverCache = new LruTtlCache<string, { items: CatalogMovie[]; hasMore: boolean }>(120, 5 * 60 * 1000);
const latestReleasesCache = new LruTtlCache<
  string,
  { cinemaReleases: CatalogMovie[]; newSeasons: CatalogMovie[]; updatedAt: number }
>(10, 10 * 60 * 1000);

interface TmdbDiscoverResult {
  page?: number;
  total_pages?: number;
  results?: Array<{
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
  }>;
}

function mapTmdbRowToCatalogItem(
  row: NonNullable<TmdbDiscoverResult['results']>[number],
  mediaType: 'movie' | 'tv',
  providerId?: StreamingProviderId
): CatalogMovie {
  const title = row.title || row.name || row.original_title || row.original_name || 'Título';
  const rawDate = row.release_date || row.first_air_date || '';
  const year = rawDate ? rawDate.slice(0, 4) : '';
  return {
    id: `${mediaType === 'tv' ? 'series' : 'tmdb'}-${row.id}`,
    tmdbId: row.id,
    mediaType,
    title,
    originalTitle: row.original_title || row.original_name || title,
    year,
    rating: row.vote_average ? row.vote_average.toFixed(1) : '7.5',
    overview: row.overview || '',
    poster: buildTmdbImageUrl(row.poster_path, 'w500'),
    backdrop: buildTmdbImageUrl(row.backdrop_path, 'w1280'),
    languages: ['Castellano', 'VOSE', 'EN'],
    providerId,
  };
}

export async function discoverExpandedCatalog(params: {
  mediaType?: 'movie' | 'tv';
  genreId?: number;
  provider?: string;
  sort?: string;
  year?: string;
  minRating?: number;
  lang?: string;
  page?: number;
}): Promise<{ items: CatalogMovie[]; hasMore: boolean; page: number }> {
  const mediaType = params.mediaType === 'tv' ? 'tv' : 'movie';
  const page = Math.max(1, Math.min(50, params.page || 1));
  const tmdbLang = resolveTmdbLanguageTag(params.lang);
  const cacheKey = JSON.stringify({ ...params, mediaType, page, tmdbLang });

  const cached = discoverCache.get(cacheKey);
  if (cached) {
    return { ...cached, page };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const queryParams: Record<string, string | number | boolean | undefined> = {
    language: tmdbLang,
    page,
    include_adult: false,
    sort_by: params.sort || 'popularity.desc',
    'vote_count.gte': params.sort === 'vote_average.desc' ? 250 : 40,
  };

  if (params.genreId && params.genreId > 0) {
    queryParams.with_genres = String(params.genreId);
  }
  if (params.minRating && params.minRating > 0) {
    queryParams['vote_average.gte'] = params.minRating;
  }
  if (params.year && /^\d{4}$/.test(params.year)) {
    if (mediaType === 'movie') {
      queryParams.primary_release_year = params.year;
    } else {
      queryParams.first_air_date_year = params.year;
    }
  } else {
    if (mediaType === 'movie') {
      queryParams['primary_release_date.lte'] = todayIso;
    } else {
      queryParams['first_air_date.lte'] = todayIso;
    }
  }

  const cleanProvider = String(params.provider || 'all').toLowerCase();
  if (cleanProvider !== 'all' && PROVIDER_TMDB_IDS[cleanProvider]) {
    queryParams.watch_region = 'ES';
    queryParams.with_watch_providers = PROVIDER_TMDB_IDS[cleanProvider];
  }

  const data = await fetchTmdbJson<TmdbDiscoverResult>(`/discover/${mediaType}`, queryParams);
  const items = (data?.results || [])
    .filter((r) => Boolean(r.poster_path))
    .map((r) =>
      mapTmdbRowToCatalogItem(
        r,
        mediaType,
        cleanProvider !== 'all' ? (cleanProvider as StreamingProviderId) : undefined
      )
    );

  const hasMore = Boolean(data?.total_pages && page < Math.min(data.total_pages, 50));
  discoverCache.set(cacheKey, { items, hasMore });
  return { items, hasMore, page };
}

export async function getEditorialCollections(lang = 'es'): Promise<EditorialCollection[]> {
  const tmdbLang = resolveTmdbLanguageTag(lang);
  const cached = collectionsCache.get(tmdbLang);
  if (cached) return cached;

  const [trendingMovies, topRatedGems, spanishCinema, sciFiVault, bingeSeries, docsWorld] =
    await Promise.all([
      fetchTmdbJson<TmdbDiscoverResult>('/trending/movie/day', { language: tmdbLang, page: 1 }),
      discoverExpandedCatalog({
        mediaType: 'movie',
        sort: 'vote_average.desc',
        minRating: 8.0,
        lang,
        page: 1,
      }),
      fetchTmdbJson<TmdbDiscoverResult>('/discover/movie', {
        language: tmdbLang,
        with_original_language: 'es',
        sort_by: 'popularity.desc',
        'vote_count.gte': 60,
        page: 1,
      }),
      discoverExpandedCatalog({
        mediaType: 'movie',
        genreId: 878,
        sort: 'popularity.desc',
        lang,
        page: 1,
      }),
      fetchTmdbJson<TmdbDiscoverResult>('/trending/tv/week', { language: tmdbLang, page: 1 }),
      discoverExpandedCatalog({
        mediaType: 'movie',
        genreId: 99,
        sort: 'popularity.desc',
        lang,
        page: 1,
      }),
    ]);

  const rawCollections: EditorialCollection[] = [
    {
      id: 'top-10-today',
      titleEs: 'Tendencias Hoy · Top 10 Global',
      titleCa: 'Tendències Avui · Top 10 Global',
      titleEn: 'Trending Today · Global Top 10',
      subtitleEs: 'Lo más proyectado ahora en salas NAIM CINE',
      subtitleCa: 'El més projectat ara a les sales NAIM CINE',
      subtitleEn: 'Most watched right now in NAIM CINE rooms',
      mediaType: 'movie',
      items: (trendingMovies?.results || [])
        .filter((r) => r.poster_path)
        .slice(0, 12)
        .map((r) => mapTmdbRowToCatalogItem(r, 'movie')),
    },
    {
      id: 'binge-series-week',
      titleEs: 'Series para Maratón',
      titleCa: 'Sèries per a Marató',
      titleEn: 'Binge-Worthy Series',
      subtitleEs: 'Temporadas completas en Castellano, Latino y VOSE',
      subtitleCa: 'Temporades completes en Català, Castellà i VOSE',
      subtitleEn: 'Full seasons in multi-audio HD',
      mediaType: 'tv',
      items: (bingeSeries?.results || [])
        .filter((r) => r.poster_path)
        .slice(0, 12)
        .map((r) => mapTmdbRowToCatalogItem(r, 'tv')),
    },
    {
      id: 'hidden-gems-8plus',
      titleEs: 'Joyas Imprescindibles (+8.0★)',
      titleCa: 'Joies Imprescindibles (+8.0★)',
      titleEn: 'Acclaimed Masterpieces (+8.0★)',
      subtitleEs: 'Obras maestras mejor valoradas por la crítica',
      subtitleCa: 'Obres mestres més ben valorades',
      subtitleEn: 'Critically acclaimed cinema essentials',
      mediaType: 'movie',
      items: topRatedGems.items.slice(0, 12),
    },
    {
      id: 'scifi-futures',
      titleEs: 'Universo Ciencia Ficción',
      titleCa: 'Univers Ciència-Ficció',
      titleEn: 'Sci-Fi & Cyberpunk Vault',
      subtitleEs: 'Futuros distópicos, espacio y thrillers tecnológicos',
      subtitleCa: 'Futurs distòpics, espai i thrillers tecnològics',
      subtitleEn: 'Dystopian futures, space epics & mind-benders',
      mediaType: 'movie',
      items: sciFiVault.items.slice(0, 12),
    },
    {
      id: 'cine-espanol',
      titleEs: 'Cine Español Destacado',
      titleCa: 'Cinema Espanyol Destacat',
      titleEn: 'Spanish Cinema Spotlight',
      subtitleEs: 'Producciones nacionales y thrillers en versión original',
      subtitleCa: 'Produccions nacionals en versió original',
      subtitleEn: 'Acclaimed Spanish films & thrillers',
      mediaType: 'movie',
      items: (spanishCinema?.results || [])
        .filter((r) => r.poster_path)
        .slice(0, 12)
        .map((r) => mapTmdbRowToCatalogItem(r, 'movie')),
    },
    {
      id: 'docs-impact',
      titleEs: 'Documentales & Naturaleza',
      titleCa: 'Documentals & Natura',
      titleEn: 'Documentaries & Non-Fiction',
      subtitleEs: 'Historias reales, ciencia, música e investigación',
      subtitleCa: 'Històries reals, ciència, música i investigació',
      subtitleEn: 'True stories, science, music & investigative docs',
      mediaType: 'movie',
      items: docsWorld.items.slice(0, 12),
    },
  ];
  const collections = rawCollections.filter((c) => c.items.length > 0);

  collectionsCache.set(tmdbLang, collections);
  return collections;
}

export async function getLatestCinemaAndSeasons(lang = 'es'): Promise<{
  cinemaReleases: CatalogMovie[];
  newSeasons: CatalogMovie[];
  updatedAt: number;
}> {
  const tmdbLang = resolveTmdbLanguageTag(lang);
  const cached = latestReleasesCache.get(tmdbLang);
  if (cached) return cached;

  const isEn = tmdbLang.startsWith('en');

  const [nowPlayingRes, upcomingMoviesRes, onTheAirRes, airingTodayRes] = await Promise.all([
    fetchTmdbJson<TmdbDiscoverResult>('/movie/now_playing', {
      language: tmdbLang,
      region: 'ES',
      page: 1,
    }),
    fetchTmdbJson<TmdbDiscoverResult>('/movie/now_playing', {
      language: tmdbLang,
      region: 'US',
      page: 1,
    }),
    fetchTmdbJson<TmdbDiscoverResult>('/tv/on_the_air', {
      language: tmdbLang,
      page: 1,
    }),
    fetchTmdbJson<TmdbDiscoverResult>('/tv/airing_today', {
      language: tmdbLang,
      page: 1,
    }),
  ]);

  const seenMovies = new Set<number>();
  const cinemaReleases: CatalogMovie[] = [];
  for (const row of [
    ...(nowPlayingRes?.results || []),
    ...(upcomingMoviesRes?.results || []),
  ]) {
    if (!row?.id || !row.poster_path || seenMovies.has(row.id)) continue;
    seenMovies.add(row.id);
    cinemaReleases.push(mapTmdbRowToCatalogItem(row, 'movie'));
    if (cinemaReleases.length >= 16) break;
  }

  // Highlighted verified new seasons from DramasFree & 321MoviesFree first, then live TMDB on_the_air / airing_today
  const featuredNewSeasons: CatalogMovie[] = [
    {
      id: 'latest-from-s4',
      tmdbId: 124364,
      mediaType: 'tv',
      seasonNumber: 4,
      title: isEn ? 'From · Season 4' : 'From · Temporada 4',
      originalTitle: 'From',
      year: '2026',
      rating: '8.4',
      overview: isEn
        ? 'New Season 4 (10 episodes) available in Español Dubbed & VOSE with synced subtitles.'
        : 'Nueva Temporada 4 completa (10 capítulos) en Doblaje Español y VOSE con subtítulos.',
      poster:
        'https://img.321moviesfree.com/cover/20260518/1779099655641_9b678d1469ec7cc0b2e3a72dff432890From%20Season%204.webp',
      backdrop: 'https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg',
      vestUrl:
        'https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/',
      languages: ['Castellano', 'VOSE'],
      platform: isEn ? 'New Season 4' : 'Estreno T4',
    },
    {
      id: 'latest-jjk-s3',
      tmdbId: 95479,
      mediaType: 'tv',
      seasonNumber: 3,
      title: isEn ? 'Jujutsu Kaisen · Season 3' : 'Jujutsu Kaisen · Temporada 3',
      originalTitle: 'Jujutsu Kaisen',
      year: '2026',
      rating: '9.0',
      overview: isEn
        ? 'The Culling Game arc (Season 3 · 12 episodes) now streaming in Español Dubbed & VOSE.'
        : 'Arco del Juego del Sacrificio (Temporada 3 · 12 capítulos) en Doblaje Español y VOSE.',
      poster:
        'https://img.dramasfree.com/cover/20251230/1767080544319_4eb5f2c10b0df3bd35bca2f45b23390c5TmWcu2Gs0uhyCQXle3cCvgrbIA.webp',
      backdrop: 'https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg',
      vestUrl:
        'https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/',
      languages: ['Castellano', 'VOSE'],
      platform: isEn ? 'New Season 3' : 'Estreno T3',
    },
  ];

  const seenTv = new Set<number>(
    featuredNewSeasons.map((s) => s.tmdbId).filter((id): id is number => Boolean(id))
  );
  const newSeasons: CatalogMovie[] = [...featuredNewSeasons];

  for (const row of [
    ...(onTheAirRes?.results || []),
    ...(airingTodayRes?.results || []),
  ]) {
    if (!row?.id || !row.poster_path || seenTv.has(row.id)) continue;
    seenTv.add(row.id);
    const mapped = mapTmdbRowToCatalogItem(row, 'tv');
    newSeasons.push({
      ...mapped,
      platform: isEn ? 'New Episodes' : 'En Emisión',
    });
    if (newSeasons.length >= 16) break;
  }

  const payload = {
    cinemaReleases,
    newSeasons,
    updatedAt: Date.now(),
  };
  latestReleasesCache.set(tmdbLang, payload);
  return payload;
}
