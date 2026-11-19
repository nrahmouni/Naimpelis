/**
 * @module catalogConstants
 * @description Shared catalog domain types, helper formatters, filter definitions,
 * 4K curated IDs, and quick-topic presets for MediaCatalogHub and child views.
 */
import type { TdtCategory } from '../../types';
import type { FlagCode } from '../ui/LanguageBadge';
import type { TvRegionId } from '../ui/ChannelLogoBadge';

export function formatShortTime(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export type CatalogSection =
  | 'home'
  | 'movies'
  | 'vose'
  | 'series'
  | 'castellano'
  | 'catala'
  | 'anime'
  | 'tdt'
  | 'sports'
  | 'youtube'
  | 'direct'
  | 'games';

export type CatalogPillar = 'explore' | 'catalog' | 'anime' | 'live' | 'games' | 'mylist';

export function normalizeCatalogPillar(
  section: CatalogSection,
  showWatchlistOnly = false
): CatalogPillar {
  if (showWatchlistOnly || section === 'direct') return 'mylist';
  if (section === 'games') return 'games';
  if (section === 'home') return 'explore';
  if (section === 'anime' || section === 'catala') return 'anime';
  if (section === 'tdt' || section === 'sports' || section === 'youtube') return 'live';
  return 'catalog';
}

export const TDT_NATIONAL_CATEGORIES: {
  id: 'tdt_all' | TdtCategory;
  es: string;
  ca: string;
  en: string;
}[] = [
  { id: 'tdt_all', es: 'Toda la TDT', ca: 'Tota la TDT', en: 'All National TDT' },
  { id: 'generalistas', es: 'Generalistas (1–6)', ca: 'Generalistes (1–6)', en: 'Main Channels (1–6)' },
  { id: 'cine_series', es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Movies & Series' },
  { id: 'entretenimiento', es: 'Entretenimiento', ca: 'Entreteniment', en: 'Entertainment' },
  { id: 'noticias_deportes', es: '24h y Deportes', ca: '24h i Esports', en: 'News & Sports' },
  { id: 'infantil_autonomicas', es: 'Infantil y Autonómicas', ca: 'Infantil i Autonòmiques', en: 'Kids & Regional' },
];

export const ALL_LIVE_CATEGORIES: { id: 'all' | 'tdt_all' | TdtCategory; es: string; ca: string; en: string }[] = [
  { id: 'all', es: 'Todos en Vivo', ca: 'Tots en Directe', en: 'All Live TV' },
  { id: 'bein_arabic', es: 'beIN SPORTS (العربية)', ca: 'beIN SPORTS (العربية)', en: 'beIN SPORTS (Arabic)' },
  { id: 'marruecos', es: 'Marruecos (المغرب)', ca: 'Marroc (المغرب)', en: 'Morocco TV' },
  { id: 'documentales', es: 'Nat Geo y Documentales', ca: 'Nat Geo i Documentals', en: 'Nat Geo & Docs' },
  { id: 'usa_tv', es: 'EE.UU. (FOX / CNN)', ca: 'EUA (FOX / CNN)', en: 'USA (FOX / CNN)' },
  { id: 'europa_tv', es: 'Europa (BBC / Euronews)', ca: 'Europa (BBC / Euronews)', en: 'Europe (BBC / Euronews)' },
  { id: 'noticias_intl', es: 'Al Jazeera y Noticias', ca: 'Al Jazeera i Notícies', en: 'Al Jazeera & News' },
  { id: 'china_football', es: 'Fútbol China (中文)', ca: 'Futbol Xina (中文)', en: 'China Football (中文)' },
  { id: 'uk_sports', es: 'UK Sports (EN)', ca: 'UK Sports (EN)', en: 'UK Sports (EN)' },
  { id: 'beinsports', es: 'beIN SPORTS', ca: 'beIN SPORTS', en: 'beIN SPORTS' },
  { id: 'espn', es: 'ESPN (1–7)', ca: 'ESPN (1–7)', en: 'ESPN (1–7)' },
  { id: 'dsports', es: 'DSports', ca: 'DSports', en: 'DSports' },
  { id: 'tnt_space', es: 'TNT y Space', ca: 'TNT i Space', en: 'TNT & Space' },
  { id: 'movistar', es: 'Movistar+', ca: 'Movistar+', en: 'Movistar+' },
  { id: 'dazn', es: 'DAZN', ca: 'DAZN', en: 'DAZN' },
  { id: 'world_cricket', es: 'Cricket & Deportes (Sportzfy)', ca: 'Cricket i Esports (Sportzfy)', en: 'Cricket & Sports (Sportzfy)' },
  { id: 'elahmad_mena', es: 'Elahmad MENA (Magreb · Golfo)', ca: 'Elahmad MENA (Magrib · Golf)', en: 'Elahmad MENA (Maghreb · Gulf)' },
  { id: 'adrar_europa', es: 'ADRAR Europa (FR·DE·IT·TR·UK·NL·RU)', ca: 'ADRAR Europa (FR·DE·IT·TR·UK·NL·RU)', en: 'ADRAR Europe (FR·DE·IT·TR·UK·NL·RU)' },
  { id: 'famelack_movies', es: 'Cine 24/7 Mundial (Famelack)', ca: 'Cinema 24/7 Mundial (Famelack)', en: 'World Movies 24/7 (Famelack)' },
  { id: 'kids_world', es: 'Infantil Mundial (Kids)', ca: 'Infantil Mundial (Kids)', en: 'World Kids TV' },
  { id: 'tdt_all', es: 'TDT España', ca: 'TDT Espanya', en: 'Spain TDT' },
  { id: 'generalistas', es: 'La 1 · A3 · T5 · laSexta', ca: 'La 1 · A3 · T5 · laSexta', en: 'Main Channels (1–6)' },
];

export const ADRAR_COUNTRY_FILTERS: {
  id: string;
  flagCode: FlagCode;
  es: string;
  ca: string;
  en: string;
}[] = [
  { id: 'all', flagCode: 'eu', es: 'Toda ADRAR', ca: 'Tota ADRAR', en: 'All ADRAR' },
  { id: 'fr', flagCode: 'fr', es: 'Francia', ca: 'França', en: 'France' },
  { id: 'de', flagCode: 'de', es: 'Alemania', ca: 'Alemanya', en: 'Germany' },
  { id: 'it', flagCode: 'it', es: 'Italia', ca: 'Itàlia', en: 'Italy' },
  { id: 'tr', flagCode: 'tr', es: 'Turquía', ca: 'Turquia', en: 'Turkey' },
  { id: 'uk', flagCode: 'uk', es: 'UK', ca: 'UK', en: 'UK' },
  { id: 'nl', flagCode: 'nl', es: 'Países Bajos', ca: 'Països Baixos', en: 'Netherlands' },
  { id: 'be', flagCode: 'be', es: 'Bélgica', ca: 'Bèlgica', en: 'Belgium' },
  { id: 'ru', flagCode: 'ru', es: 'Rusia', ca: 'Rússia', en: 'Russia' },
];

export interface TvFilterGroup {
  region: TvRegionId;
  flagCode: FlagCode;
  name: { es: string; ca: string; en: string };
  sub: { es: string; ca: string; en: string };
  categories: {
    id: 'all' | 'tdt_all' | TdtCategory;
    es: string;
    ca: string;
    en: string;
  }[];
}

export const TV_FILTER_GROUPS: TvFilterGroup[] = [
  {
    region: 'es',
    flagCode: 'es',
    name: { es: 'España', ca: 'Espanya', en: 'Spain' },
    sub: {
      es: 'TDT Nacional, Movistar Plus+ y DAZN',
      ca: 'TDT Nacional, Movistar Plus+ i DAZN',
      en: 'National DTT, Movistar+ & DAZN',
    },
    categories: [
      { id: 'generalistas', es: 'Generalistas (1–6)', ca: 'Generalistes (1–6)', en: 'Main Channels (1–6)' },
      { id: 'movistar', es: 'Movistar Plus+', ca: 'Movistar Plus+', en: 'Movistar Plus+' },
      { id: 'dazn', es: 'DAZN España', ca: 'DAZN Espanya', en: 'DAZN Spain' },
      { id: 'cine_series', es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Movies & Series' },
      { id: 'entretenimiento', es: 'Entretenimiento', ca: 'Entreteniment', en: 'Entertainment' },
      { id: 'noticias_deportes', es: '24h y Deportes', ca: '24h i Esports', en: 'News & Sports' },
      { id: 'infantil_autonomicas', es: 'Infantil y Autonómicas', ca: 'Infantil i Autonòmiques', en: 'Kids & Regional' },
    ],
  },
  {
    region: 'world_cricket',
    flagCode: 'all',
    name: { es: 'Cricket & Deportes Mundial', ca: 'Cricket i Esports Mundial', en: 'World Cricket & Sports' },
    sub: {
      es: 'Sportzfy · Famelack · IPTV-Org (Willow, Sony Ten, Star Sports, Bahrain)',
      ca: 'Sportzfy · Famelack · IPTV-Org (Willow, Sony Ten, Star Sports, Bahrain)',
      en: 'Sportzfy · Famelack · IPTV-Org (Willow, Sony Ten, Star Sports, Bahrain)',
    },
    categories: [
      { id: 'world_cricket', es: 'Cricket · Famelack · Sportzfy', ca: 'Cricket · Famelack · Sportzfy', en: 'Cricket · Famelack · Sportzfy' },
    ],
  },
  {
    region: 'elahmad_mena',
    flagCode: 'dz',
    name: { es: 'Elahmad TV · Magreb y Golfo', ca: 'Elahmad TV · Magrib i Golf', en: 'Elahmad TV · Maghreb & Gulf' },
    sub: {
      es: 'Marruecos, Argelia, Egipto, Arabia Saudí, EAU, Qatar y Kuwait en directo',
      ca: 'Marroc, Algèria, Egipte, Aràbia Saudita, EAU, Qatar i Kuwait en directe',
      en: 'Morocco, Algeria, Egypt, Saudi Arabia, UAE, Qatar & Kuwait Live',
    },
    categories: [
      { id: 'elahmad_mena', es: 'Elahmad MENA (العربية en directo)', ca: 'Elahmad MENA (العربية en directe)', en: 'Elahmad MENA (Arabic Live)' },
    ],
  },
  {
    region: 'adrar_europa',
    flagCode: 'eu',
    name: { es: 'ADRAR TV Europa', ca: 'ADRAR TV Europa', en: 'ADRAR TV Europe' },
    sub: {
      es: 'Francia, Alemania, Italia, Turquía, UK, Países Bajos, Bélgica y Rusia',
      ca: 'França, Alemanya, Itàlia, Turquia, UK, Països Baixos, Bèlgica i Rússia',
      en: 'France, Germany, Italy, Turkey, UK, Netherlands, Belgium & Russia',
    },
    categories: [
      { id: 'adrar_europa', es: 'Paquete ADRAR Europa (8 países)', ca: 'Paquet ADRAR Europa (8 països)', en: 'ADRAR Europe Pack (8 countries)' },
    ],
  },
  {
    region: 'ar',
    flagCode: 'qa',
    name: { es: 'beIN Árabe y Noticias MENA', ca: 'beIN Àrab i Notícies MENA', en: 'beIN Arabic & MENA News' },
    sub: {
      es: 'beIN SPORTS 1–9 العربية · Al Jazeera · Al Arabiya · Sky News',
      ca: 'beIN SPORTS 1–9 العربية · Al Jazeera · Al Arabiya · Sky News',
      en: 'beIN SPORTS 1–9 Arabic · Al Jazeera · Al Arabiya · Sky News',
    },
    categories: [
      { id: 'bein_arabic', es: 'beIN SPORTS (العربية 1–9)', ca: 'beIN SPORTS (العربية 1–9)', en: 'beIN SPORTS (Arabic 1–9)' },
      { id: 'noticias_intl', es: 'Al Jazeera · Al Arabiya · Noticias', ca: 'Al Jazeera · Al Arabiya · Notícies', en: 'Al Jazeera · Al Arabiya · News' },
    ],
  },
  {
    region: 'ma',
    flagCode: 'ma',
    name: { es: 'Marruecos (المغرب)', ca: 'Marroc (المغرب)', en: 'Morocco (المغرب)' },
    sub: {
      es: 'Al Aoula, Arryadia, 2M Maroc, Medi 1 TV y SNRT en directo',
      ca: 'Al Aoula, Arryadia, 2M Maroc, Medi 1 TV i SNRT en directe',
      en: 'Al Aoula, Arryadia, 2M Maroc, Medi 1 TV & SNRT Live',
    },
    categories: [
      { id: 'marruecos', es: 'Canales de Marruecos (SNRT · 2M · Medi 1)', ca: 'Canals del Marroc (SNRT · 2M · Medi 1)', en: 'Morocco Channels (SNRT · 2M · Medi 1)' },
    ],
  },
  {
    region: 'docs',
    flagCode: 'docs',
    name: { es: 'Documentales y Ciencia', ca: 'Documentals i Ciència', en: 'Documentaries & Science' },
    sub: {
      es: 'National Geographic, Nat Geo Wild, Discovery, History y Naturaleza',
      ca: 'National Geographic, Nat Geo Wild, Discovery, History i Natura',
      en: 'National Geographic, Nat Geo Wild, Discovery, History & Nature',
    },
    categories: [
      { id: 'documentales', es: 'National Geographic · Discovery · History', ca: 'National Geographic · Discovery · History', en: 'National Geographic · Discovery · History' },
    ],
  },
  {
    region: 'us',
    flagCode: 'us',
    name: { es: 'Estados Unidos (USA)', ca: 'Estats Units (EUA)', en: 'United States (USA)' },
    sub: {
      es: 'FOX, FOX News, FOX Sports 1, CNN, ABC, CBS, NBC y Bloomberg',
      ca: 'FOX, FOX News, FOX Sports 1, CNN, ABC, CBS, NBC i Bloomberg',
      en: 'FOX, FOX News, FOX Sports 1, CNN, ABC, CBS, NBC & Bloomberg',
    },
    categories: [
      { id: 'usa_tv', es: 'Canales EE.UU. (FOX · CNN · NBC · ABC)', ca: 'Canals EUA (FOX · CNN · NBC · ABC)', en: 'US TV (FOX · CNN · NBC · ABC)' },
    ],
  },
  {
    region: 'eu',
    flagCode: 'eu',
    name: { es: 'Europa, Cine 24/7 e Infantil', ca: 'Europa, Cinema 24/7 i Infantil', en: 'Europe, 24/7 Movies & Kids' },
    sub: {
      es: 'BBC News, Euronews, France 24, DW, RAI y Famelack Cine/Kids',
      ca: 'BBC News, Euronews, France 24, DW, RAI i Famelack Cinema/Kids',
      en: 'BBC News, Euronews, France 24, DW, RAI & Famelack Movies/Kids',
    },
    categories: [
      { id: 'europa_tv', es: 'Canales Europeos (BBC · Euronews · RAI · DW)', ca: 'Canals Europeus (BBC · Euronews · RAI · DW)', en: 'European Channels (BBC · Euronews · RAI · DW)' },
      { id: 'famelack_movies', es: 'Cine 24/7 Mundial (Famelack)', ca: 'Cinema 24/7 Mundial (Famelack)', en: 'World Movies 24/7 (Famelack)' },
      { id: 'kids_world', es: 'Infantil Mundial (Kids)', ca: 'Infantil Mundial (Kids)', en: 'World Kids TV' },
    ],
  },
  {
    region: 'latam',
    flagCode: 'lat',
    name: { es: 'Latam e Internacional', ca: 'Latam i Internacional', en: 'LatAm & International' },
    sub: {
      es: 'En Español (Sudamérica & Caribe)',
      ca: 'En Espanyol (Sud-amèrica & Carib)',
      en: 'Spanish audio (ESPN, DSports, beIN)',
    },
    categories: [
      { id: 'espn', es: 'ESPN (1–7)', ca: 'ESPN (1–7)', en: 'ESPN (1–7)' },
      { id: 'dsports', es: 'DSports (DirecTV)', ca: 'DSports (DirecTV)', en: 'DSports (DirecTV)' },
      { id: 'beinsports', es: 'beIN SPORTS', ca: 'beIN SPORTS', en: 'beIN SPORTS' },
      { id: 'tnt_space', es: 'TNT y Space', ca: 'TNT i Space', en: 'TNT & Space' },
    ],
  },
  {
    region: 'uk',
    flagCode: 'uk',
    name: { es: 'Reino Unido (EN)', ca: 'Regne Unit (EN)', en: 'United Kingdom (English)' },
    sub: {
      es: 'Audio original en inglés (Sky Sports, Eurosport)',
      ca: 'Àudio original en anglès (Sky Sports, Eurosport)',
      en: 'Original English audio (Sky Sports, Eurosport)',
    },
    categories: [
      { id: 'uk_sports', es: 'UK Sports (Sky Sports & Eurosport)', ca: 'UK Sports (Sky Sports & Eurosport)', en: 'UK Sports (Sky Sports & Eurosport)' },
    ],
  },
  {
    region: 'cn',
    flagCode: 'cn',
    name: { es: 'China (中文)', ca: 'Xina (中文)', en: 'China (中文)' },
    sub: {
      es: 'Fútbol y deportes en chino (CCTV5, Guangdong)',
      ca: 'Futbol i esports en xinès (CCTV5, Guangdong)',
      en: 'Sports in Chinese (CCTV5, Guangdong)',
    },
    categories: [
      { id: 'china_football', es: 'Fútbol China (CCTV5 · CCTV5+ · GD)', ca: 'Futbol Xina (CCTV5 · CCTV5+ · GD)', en: 'China Sports (CCTV5 & GD)' },
    ],
  },
];

export const CURATED_4K_TMDB_SET = new Set<number>([
  693134, 872585, 157336, 361743, 414906, 335984, 569094, 76600, 558449, 155, 27205,
  76341, 603692, 299534, 533535, 62, 603, 945961, 933260, 786892, 634649, 438631, 19995,
  100088, 94997, 1399, 66732, 1396, 82856, 106379, 126308, 95396, 94605, 76479, 76773,
  60059, 87108, 83867, 125988, 42009, 60625, 70523,
]);

export const MOVIE_SORT_OPTIONS = [
  { id: 'trending', es: 'Tendencias', ca: 'Tendències', en: 'Trending' },
  { id: '4k', es: '✨ 4K Ultra HD', ca: '✨ 4K Ultra HD', en: '✨ 4K Ultra HD' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' },
  { id: 'now_playing', es: 'Estrenos Recientes', ca: 'Estrenes Recents', en: 'New Releases' },
] as const;

export const MOVIE_GENRES = [
  { id: 'anime', es: 'Anime', ca: 'Anime', en: 'Anime' },
  { id: 'action', es: 'Acción', ca: 'Acció', en: 'Action' },
  { id: 'scifi', es: 'Sci-Fi', ca: 'Ciència-ficció', en: 'Sci-Fi' },
  { id: 'horror', es: 'Terror', ca: 'Terror', en: 'Horror' },
  { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
  { id: 'animation', es: 'Animación', ca: 'Animació', en: 'Animation' },
  { id: 'thriller', es: 'Thriller', ca: 'Thriller', en: 'Thriller' },
  { id: 'adventure', es: 'Aventura', ca: 'Aventura', en: 'Adventure' },
  { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
] as const;

export const SERIES_SORT_OPTIONS = [
  { id: 'trending', es: 'Tendencias TV', ca: 'Tendències TV', en: 'Trending TV' },
  { id: '4k', es: '✨ 4K Ultra HD', ca: '✨ 4K Ultra HD', en: '✨ 4K Ultra HD' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' },
] as const;

export const SERIES_GENRES = [
  { id: 'anime', es: 'Anime', ca: 'Anime', en: 'Anime' },
  { id: 'scifi', es: 'Sci-Fi y Fantasía', ca: 'Ciència-ficció i Fantasia', en: 'Sci-Fi & Fantasy' },
  { id: 'action', es: 'Acción y Aventura', ca: 'Acció i Aventura', en: 'Action & Adventure' },
  { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
  { id: 'crime', es: 'Crimen', ca: 'Crim', en: 'Crime' },
  { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
  { id: 'animation', es: 'Animación', ca: 'Animació', en: 'Animation' },
  { id: 'mystery', es: 'Misterio', ca: 'Misteri', en: 'Mystery' },
] as const;

export const YOUTUBE_QUICK_TOPICS = [
  {
    labelEs: 'Resúmenes LaLiga y Champions',
    labelCa: 'Resums LaLiga i Champions',
    labelEn: 'Football Highlights',
    labelZh: '西语/欧冠足球集锦',
    q: 'resumen partido laliga champions highlights hd',
  },
  {
    labelEs: 'Tráilers Cine 4K',
    labelCa: 'Tràilers Cinema 4K',
    labelEn: '4K Movie Trailers',
    labelZh: '4K 电影预告片',
    q: 'official movie trailer 2025 4k',
  },
  {
    labelEs: 'Música y Videoclips',
    labelCa: 'Música i Videoclips',
    labelEn: 'Music Videos',
    labelZh: '热门音乐与 MV',
    q: 'latin hits music video oficial',
  },
  {
    labelEs: 'F1 y Motorsport',
    labelCa: 'F1 i Motorsport',
    labelEn: 'F1 Highlights',
    labelZh: 'F1 赛车集锦',
    q: 'formula 1 race highlights official',
  },
  {
    labelEs: 'Comedia y Stand-Up',
    labelCa: 'Comèdia i Stand-Up',
    labelEn: 'Stand-Up Comedy',
    labelZh: '单口喜剧专场',
    q: 'monologos comedia stand up español',
  },
  {
    labelEs: 'Lo-Fi Chill Room',
    labelCa: 'Lo-Fi Chill Room',
    labelEn: 'Lo-Fi Beats',
    labelZh: 'Lo-Fi 放松音乐',
    q: 'lofi hip hop radio beats to relax',
  },
] as const;
