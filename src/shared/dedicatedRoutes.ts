/**
 * @module dedicatedRoutes
 * @description Single source of truth for RiffanTV universal semantic links,
 * reserved route segments, slug normalization, route parsing, and canonical URL building.
 * Shared across frontend (React router / share actions) and backend (deepLinkResolver / OG SSR).
 */

export const PUBLIC_PRODUCTION_DOMAIN = 'riffan.ai.studio';
export const PUBLIC_PRODUCTION_ORIGIN = `https://${PUBLIC_PRODUCTION_DOMAIN}`;

export function slugify(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export interface TvPackMapping {
  slug: string;
  topLevel: boolean;
  labelEs: string;
  labelCa: string;
  labelEn: string;
  tvRegion: string;
  tdtCategory: string;
  adrarCountryFilter?: string;
  footballLiveBrand?: string;
}

export const TV_PACK_MAPPINGS: Record<string, TvPackMapping> = {
  dazn: {
    slug: 'dazn',
    topLevel: true,
    labelEs: 'DAZN España en Directo',
    labelCa: 'DAZN Espanya en Directe',
    labelEn: 'DAZN Spain Live',
    tvRegion: 'es',
    tdtCategory: 'dazn',
    footballLiveBrand: 'dazn',
  },
  movistar: {
    slug: 'movistar',
    topLevel: true,
    labelEs: 'Movistar Plus+ en Directo',
    labelCa: 'Movistar Plus+ en Directe',
    labelEn: 'Movistar Plus+ Live',
    tvRegion: 'es',
    tdtCategory: 'movistar',
    footballLiveBrand: 'movistar',
  },
  tdt: {
    slug: 'tdt',
    topLevel: true,
    labelEs: 'TDT España en Directo',
    labelCa: 'TDT Espanya en Directe',
    labelEn: 'Spain DTT Live',
    tvRegion: 'es',
    tdtCategory: 'tdt_all',
  },
  generalistas: {
    slug: 'generalistas',
    topLevel: false,
    labelEs: 'Canales Generalistas (La 1 · A3 · T5 · laSexta)',
    labelCa: 'Canals Generalistes (La 1 · A3 · T5 · laSexta)',
    labelEn: 'Spain Main Channels (La 1 · A3 · T5 · laSexta)',
    tvRegion: 'es',
    tdtCategory: 'generalistas',
  },
  beinsports: {
    slug: 'beinsports',
    topLevel: true,
    labelEs: 'beIN SPORTS en Directo',
    labelCa: 'beIN SPORTS en Directe',
    labelEn: 'beIN SPORTS Live',
    tvRegion: 'ar',
    tdtCategory: 'bein_arabic',
    footballLiveBrand: 'bein_arabic',
  },
  bein: {
    slug: 'beinsports',
    topLevel: true,
    labelEs: 'beIN SPORTS en Directo',
    labelCa: 'beIN SPORTS en Directe',
    labelEn: 'beIN SPORTS Live',
    tvRegion: 'ar',
    tdtCategory: 'bein_arabic',
    footballLiveBrand: 'bein_arabic',
  },
  espn: {
    slug: 'espn',
    topLevel: true,
    labelEs: 'ESPN en Directo (1–7)',
    labelCa: 'ESPN en Directe (1–7)',
    labelEn: 'ESPN Live (1–7)',
    tvRegion: 'latam',
    tdtCategory: 'espn',
    footballLiveBrand: 'espn',
  },
  dsports: {
    slug: 'dsports',
    topLevel: false,
    labelEs: 'DSports DirecTV',
    labelCa: 'DSports DirecTV',
    labelEn: 'DSports DirecTV',
    tvRegion: 'latam',
    tdtCategory: 'dsports',
    footballLiveBrand: 'dsports',
  },
  adrar: {
    slug: 'adrar',
    topLevel: true,
    labelEs: 'ADRAR TV Europa',
    labelCa: 'ADRAR TV Europa',
    labelEn: 'ADRAR TV Europe',
    tvRegion: 'adrar_europa',
    tdtCategory: 'adrar_europa',
    adrarCountryFilter: 'all',
  },
  elahmad: {
    slug: 'elahmad',
    topLevel: true,
    labelEs: 'Elahmad TV · Magreb y Golfo',
    labelCa: 'Elahmad TV · Magrib i Golf',
    labelEn: 'Elahmad TV · Maghreb & Gulf',
    tvRegion: 'elahmad_mena',
    tdtCategory: 'elahmad_mena',
  },
  marruecos: {
    slug: 'marruecos',
    topLevel: true,
    labelEs: 'Canales de Marruecos (SNRT · 2M · Arryadia)',
    labelCa: 'Canals del Marroc (SNRT · 2M · Arryadia)',
    labelEn: 'Morocco TV Channels',
    tvRegion: 'ma',
    tdtCategory: 'marruecos',
  },
  documentales: {
    slug: 'documentales',
    topLevel: true,
    labelEs: 'Documentales y Ciencia (Nat Geo · Discovery)',
    labelCa: 'Documentals i Ciència (Nat Geo · Discovery)',
    labelEn: 'Documentaries & Science',
    tvRegion: 'docs',
    tdtCategory: 'documentales',
  },
  usa: {
    slug: 'usa',
    topLevel: true,
    labelEs: 'Canales de EE.UU. (FOX · CNN · NBC · ABC)',
    labelCa: 'Canals dels EUA (FOX · CNN · NBC · ABC)',
    labelEn: 'USA Live TV',
    tvRegion: 'us',
    tdtCategory: 'usa_tv',
  },
  europa: {
    slug: 'europa',
    topLevel: true,
    labelEs: 'Europa, Cine e Infantil',
    labelCa: 'Europa, Cinema i Infantil',
    labelEn: 'Europe, Movies & Kids TV',
    tvRegion: 'eu',
    tdtCategory: 'europa_tv',
  },
  famelack: {
    slug: 'famelack',
    topLevel: true,
    labelEs: 'Cine 24/7 Mundial (Famelack)',
    labelCa: 'Cinema 24/7 Mundial (Famelack)',
    labelEn: 'World 24/7 Movies (Famelack)',
    tvRegion: 'eu',
    tdtCategory: 'famelack_movies',
  },
  cricket: {
    slug: 'cricket',
    topLevel: true,
    labelEs: 'Cricket & Deportes Mundial (Sportzfy)',
    labelCa: 'Cricket i Esports Mundial (Sportzfy)',
    labelEn: 'World Cricket & Sports',
    tvRegion: 'world_cricket',
    tdtCategory: 'world_cricket',
    footballLiveBrand: 'world_cricket',
  },
  latam: {
    slug: 'latam',
    topLevel: true,
    labelEs: 'Canales Latam e Internacional',
    labelCa: 'Canals Latam i Internacional',
    labelEn: 'LatAm & International TV',
    tvRegion: 'latam',
    tdtCategory: 'all',
  },
  uk: {
    slug: 'uk',
    topLevel: false,
    labelEs: 'Reino Unido Deportes (Sky Sports · Eurosport)',
    labelCa: 'Regne Unit Esports (Sky Sports · Eurosport)',
    labelEn: 'UK Sports (EN)',
    tvRegion: 'uk',
    tdtCategory: 'uk_sports',
    footballLiveBrand: 'uk_sports',
  },
  china: {
    slug: 'china',
    topLevel: false,
    labelEs: 'Fútbol China (CCTV-5 · Guangdong)',
    labelCa: 'Futbol Xina (CCTV-5 · Guangdong)',
    labelEn: 'China Football (CCTV-5)',
    tvRegion: 'cn',
    tdtCategory: 'china_football',
    footballLiveBrand: 'china_football',
  },
  espana: {
    slug: 'espana',
    topLevel: false,
    labelEs: 'Televisión de España en Directo',
    labelCa: 'Televisió d’Espanya en Directe',
    labelEn: 'Spain Live TV',
    tvRegion: 'es',
    tdtCategory: 'all',
  },
  'kids-tv': {
    slug: 'kids-tv',
    topLevel: false,
    labelEs: 'Canales Infantiles en Directo',
    labelCa: 'Canals Infantils en Directe',
    labelEn: 'World Kids Live TV',
    tvRegion: 'eu',
    tdtCategory: 'kids_world',
  },
};

export function resolveTvPackMapping(slugRaw: string): TvPackMapping | null {
  const s = slugify(slugRaw);
  if (!s) return null;
  if (TV_PACK_MAPPINGS[s]) return TV_PACK_MAPPINGS[s];
  if (s.startsWith('adrar-')) {
    const country = s.slice('adrar-'.length);
    if (['fr', 'de', 'it', 'tr', 'uk', 'nl', 'be', 'ru'].includes(country)) {
      return {
        slug: s,
        topLevel: false,
        labelEs: `ADRAR Europa · ${country.toUpperCase()}`,
        labelCa: `ADRAR Europa · ${country.toUpperCase()}`,
        labelEn: `ADRAR Europe · ${country.toUpperCase()}`,
        tvRegion: 'adrar_europa',
        tdtCategory: 'adrar_europa',
        adrarCountryFilter: country,
      };
    }
  }
  return null;
}

export const TOP_CHANNEL_ALIASES: Record<string, string> = {
  'dazn-laliga': 'dazn-laliga',
  'dazn-la-liga': 'dazn-laliga',
  'dazn-1': 'dazn-1',
  dazn1: 'dazn-1',
  'dazn-2': 'dazn-2',
  dazn2: 'dazn-2',
  'dazn-3': 'dazn-3',
  dazn3: 'dazn-3',
  'dazn-4': 'dazn-4',
  dazn4: 'dazn-4',
  'dazn-f1': 'dazn-f1',
  daznf1: 'dazn-f1',
  'dazn-combat': 'dazn-combat',
  'movistar-plus': 'mplus-canal',
  'movistar-vamos': 'mplus-vamos',
  vamos: 'mplus-vamos',
  'movistar-laliga': 'mplus-laliga',
  'laliga-tv': 'mplus-laliga',
  'movistar-campeones': 'mplus-champions',
  'liga-de-campeones': 'mplus-champions',
  'movistar-deportes': 'mplus-deportes',
  'la-1': 'tdt-la1',
  la1: 'tdt-la1',
  'la-2': 'tdt-la2',
  la2: 'tdt-la2',
  'antena-3': 'tdt-antena3',
  antena3: 'tdt-antena3',
  cuatro: 'tdt-cuatro',
  telecinco: 'tdt-telecinco',
  lasexta: 'tdt-lasexta',
  'la-sexta': 'tdt-lasexta',
  teledeporte: 'tdt-tdp',
  'real-madrid-tv': 'tdt-rmtv',
  'gol-play': 'tdt-gol',
};

export const CHANNEL_ID_TO_TOP_ALIAS: Record<string, string> = {
  'dazn-laliga': 'dazn-laliga',
  'dazn-1': 'dazn-1',
  'dazn-2': 'dazn-2',
  'dazn-3': 'dazn-3',
  'dazn-4': 'dazn-4',
  'dazn-f1': 'dazn-f1',
  'dazn-combat': 'dazn-combat',
  'mplus-canal': 'movistar-plus',
  'mplus-vamos': 'vamos',
  'mplus-laliga': 'movistar-laliga',
  'mplus-champions': 'movistar-campeones',
  'mplus-deportes': 'movistar-deportes',
  'tdt-la1': 'la-1',
  'tdt-la2': 'la-2',
  'tdt-antena3': 'antena-3',
  'tdt-cuatro': 'cuatro',
  'tdt-telecinco': 'telecinco',
  'tdt-lasexta': 'lasexta',
  'tdt-tdp': 'teledeporte',
  'tdt-rmtv': 'real-madrid-tv',
  'tdt-gol': 'gol-play',
};

export interface FootballScopeConfig {
  scope: string;
  labelEs: string;
  labelCa: string;
  labelEn: string;
  dayOffset?: number;
  statusTab?: 'live' | 'upcoming' | 'all';
  leagueFilter?: string;
  searchQuery?: string;
  futbolTab?: 'matches' | 'channels';
  brandFilter?: string;
}

export const FOOTBALL_SCOPE_MAP: Record<string, FootballScopeConfig> = {
  hoy: {
    scope: 'hoy',
    labelEs: 'Fútbol Hoy · Partidos y Horarios',
    labelCa: 'Futbol Avui · Partits i Horaris',
    labelEn: "Football Today · Fixtures & Live TV",
    dayOffset: 0,
    futbolTab: 'matches',
  },
  manana: {
    scope: 'manana',
    labelEs: 'Fútbol Mañana · Horarios y Canales',
    labelCa: 'Futbol Demà · Horaris i Canals',
    labelEn: "Football Tomorrow · Schedule",
    dayOffset: 1,
    statusTab: 'all',
    futbolTab: 'matches',
  },
  ayer: {
    scope: 'ayer',
    labelEs: 'Fútbol Ayer · Resultados',
    labelCa: 'Futbol Ahir · Resultats',
    labelEn: 'Football Yesterday · Results',
    dayOffset: -1,
    statusTab: 'all',
    futbolTab: 'matches',
  },
  'en-vivo': {
    scope: 'en-vivo',
    labelEs: 'Fútbol En Vivo Ahora',
    labelCa: 'Futbol En Directe Ara',
    labelEn: 'Live Football Now',
    dayOffset: 0,
    statusTab: 'live',
    futbolTab: 'matches',
  },
  directo: {
    scope: 'en-vivo',
    labelEs: 'Fútbol En Vivo Ahora',
    labelCa: 'Futbol En Directe Ara',
    labelEn: 'Live Football Now',
    dayOffset: 0,
    statusTab: 'live',
    futbolTab: 'matches',
  },
  laliga: {
    scope: 'laliga',
    labelEs: 'LaLiga EA Sports · Partidos y TV',
    labelCa: 'LaLiga EA Sports · Partits i TV',
    labelEn: 'LaLiga EA Sports · Matches & TV',
    leagueFilter: 'laliga',
    futbolTab: 'matches',
  },
  hypermotion: {
    scope: 'hypermotion',
    labelEs: 'LaLiga Hypermotion',
    labelCa: 'LaLiga Hypermotion',
    labelEn: 'LaLiga Hypermotion',
    leagueFilter: 'hypermotion',
    futbolTab: 'matches',
  },
  champions: {
    scope: 'champions',
    labelEs: 'UEFA Champions League · Partidos y Canales',
    labelCa: 'UEFA Champions League · Partits i Canals',
    labelEn: 'UEFA Champions League · Matches & TV',
    leagueFilter: 'champions',
    futbolTab: 'matches',
  },
  premier: {
    scope: 'premier',
    labelEs: 'Premier League · Partidos y TV',
    labelCa: 'Premier League · Partits i TV',
    labelEn: 'Premier League · Matches & TV',
    leagueFilter: 'premier',
    futbolTab: 'matches',
  },
  'europa-league': {
    scope: 'europa-league',
    labelEs: 'UEFA Europa League',
    labelCa: 'UEFA Europa League',
    labelEn: 'UEFA Europa League',
    leagueFilter: 'europa',
    futbolTab: 'matches',
  },
  europa: {
    scope: 'europa-league',
    labelEs: 'UEFA Europa League',
    labelCa: 'UEFA Europa League',
    labelEn: 'UEFA Europa League',
    leagueFilter: 'europa',
    futbolTab: 'matches',
  },
  'serie-a': {
    scope: 'serie-a',
    labelEs: 'Serie A Italia',
    labelCa: 'Serie A Itàlia',
    labelEn: 'Italian Serie A',
    leagueFilter: 'serie a',
    futbolTab: 'matches',
  },
  bundesliga: {
    scope: 'bundesliga',
    labelEs: 'Bundesliga',
    labelCa: 'Bundesliga',
    labelEn: 'Bundesliga',
    leagueFilter: 'bundesliga',
    futbolTab: 'matches',
  },
  selecciones: {
    scope: 'selecciones',
    labelEs: 'Selecciones y Mundial',
    labelCa: 'Seleccions i Mundial',
    labelEn: 'Internationals & World Cup',
    leagueFilter: 'world',
    futbolTab: 'matches',
  },
  barcelona: {
    scope: 'barcelona',
    labelEs: 'FC Barcelona · Próximos Partidos',
    labelCa: 'FC Barcelona · Pròxims Partits',
    labelEn: 'FC Barcelona · Fixtures',
    searchQuery: 'barcelona',
    statusTab: 'all',
    futbolTab: 'matches',
  },
  barca: {
    scope: 'barcelona',
    labelEs: 'FC Barcelona · Próximos Partidos',
    labelCa: 'FC Barcelona · Pròxims Partits',
    labelEn: 'FC Barcelona · Fixtures',
    searchQuery: 'barcelona',
    statusTab: 'all',
    futbolTab: 'matches',
  },
  'real-madrid': {
    scope: 'real-madrid',
    labelEs: 'Real Madrid · Próximos Partidos',
    labelCa: 'Real Madrid · Pròxims Partits',
    labelEn: 'Real Madrid · Fixtures',
    searchQuery: 'real madrid',
    statusTab: 'all',
    futbolTab: 'matches',
  },
  'barca-madrid': {
    scope: 'barca-madrid',
    labelEs: 'Barça y Real Madrid · Calendario',
    labelCa: 'Barça i Real Madrid · Calendari',
    labelEn: 'Barça & Real Madrid · Schedule',
    searchQuery: 'barca madrid',
    statusTab: 'all',
    futbolTab: 'matches',
  },
  canales: {
    scope: 'canales',
    labelEs: 'Canales de Fútbol 24/7 en Directo',
    labelCa: 'Canals de Futbol 24/7 en Directe',
    labelEn: '24/7 Live Football Channels',
    futbolTab: 'channels',
  },
};

export const GAME_SLUG_TO_ID: Record<string, string> = {
  billar: 'pool',
  pool: 'pool',
  '8-ball': 'pool',
  pinturillo: 'pinturillo',
  poker: 'poker',
  blackjack: 'blackjack',
  chapas: 'chapas',
  'futbol-chapas': 'chapas',
  headsoccer: 'headsoccer',
  'head-soccer': 'headsoccer',
  parchis: 'parchis',
  uno: 'uno',
  chess: 'chess',
  ajedrez: 'chess',
  checkers: 'checkers',
  damas: 'checkers',
  connect4: 'connect4',
  conecta4: 'connect4',
  'conecta-4': 'connect4',
  penaltis: 'penalty',
  penalty: 'penalty',
  'penaltis-mundial': 'penalty',
  coches: 'racing3d',
  'coches-3d': 'racing3d',
  racing: 'racing3d',
  racing3d: 'racing3d',
  'nitro-gp': 'racing3d',
  f1: 'racing3d',
  'air-hockey': 'gyrohockey',
  'hockey-gyro': 'gyrohockey',
  gyrohockey: 'gyrohockey',
  'galaxia-gyro': 'gyrospace',
  'space-gyro': 'gyrospace',
  'nave-3d': 'gyrospace',
  gyrospace: 'gyrospace',
};

export const GAME_ID_TO_SLUG: Record<string, string> = {
  pool: 'billar',
  pinturillo: 'pinturillo',
  poker: 'poker',
  blackjack: 'blackjack',
  chapas: 'chapas',
  headsoccer: 'head-soccer',
  penalty: 'penaltis',
  racing3d: 'coches-3d',
  gyrohockey: 'air-hockey',
  gyrospace: 'galaxia-gyro',
  parchis: 'parchis',
  uno: 'uno',
  chess: 'ajedrez',
  checkers: 'damas',
  connect4: 'conecta4',
};

export const GAME_TITLES: Record<string, { es: string; ca: string; en: string }> = {
  pool: { es: 'Billar 8-Ball', ca: 'Billar 8-Ball', en: '8-Ball Pool' },
  pinturillo: { es: 'Pinturillo', ca: 'Pinturillo', en: 'Pinturillo' },
  poker: { es: 'Texas Hold’em Poker', ca: 'Texas Hold’em Poker', en: 'Texas Hold’em Poker' },
  blackjack: { es: 'Blackjack 21', ca: 'Blackjack 21', en: 'Blackjack 21' },
  chapas: { es: 'Fútbol Chapas', ca: 'Futbol Xapes', en: 'Bottlecap Football' },
  headsoccer: { es: 'Head Soccer', ca: 'Head Soccer', en: 'Head Soccer' },
  penalty: { es: 'Penaltis Mundial Pro', ca: 'Penals Mundial Pro', en: 'World Cup Penalties Pro' },
  racing3d: { es: 'Nitro GP 3D · Volante Móvil', ca: 'Nitro GP 3D · Volant Mòbil', en: 'Nitro GP 3D · Phone Wheel' },
  gyrohockey: { es: 'Neon Air Hockey Gyro', ca: 'Neon Air Hockey Gyro', en: 'Neon Air Hockey Gyro' },
  gyrospace: { es: 'Galaxia Interceptor Gyro', ca: 'Galàxia Interceptor Gyro', en: 'Galaxy Interceptor Gyro' },
  parchis: { es: 'Parchís', ca: 'Parxís', en: 'Parchís' },
  uno: { es: 'UNO', ca: 'UNO', en: 'UNO' },
  chess: { es: 'Ajedrez', ca: 'Escacs', en: 'Chess' },
  checkers: { es: 'Damas', ca: 'Dames', en: 'Checkers' },
  connect4: { es: 'Conecta 4', ca: 'Connecta 4', en: 'Connect 4' },
};

export const DEDICATED_WORLD_ROUTES = new Set([
  'cine',
  'series',
  'directo',
  'canales',
  'futbol',
  'juegos',
  'youtube',
  'clipbox',
  'rbtv',
  'belix',
  'atresplayer',
  'movistar-dazn',
  'dazn-movistar',
  'musica',
  'music',
]);

export const SYSTEM_RESERVED_SLUGS = new Set([
  'api',
  'assets',
  'src',
  'public',
  'dist',
  'ws',
  'favicon',
  'manifest',
  'sw',
  'epg',
  'riffantv',
  'tv',
  'tvlg',
  'ads',
  'naimcine-ads',
  'auth-bridge',
  'design-system',
  'admin',
  'samsung',
  'webos',
  'lg',
  'volante',
  'controller',
  'sala',
  's',
  'r',
  'pelicula',
  'serie',
  'canal',
  'pack',
  'partido',
]);

export const ALL_RESERVED_SLUGS = new Set<string>([
  ...SYSTEM_RESERVED_SLUGS,
  ...DEDICATED_WORLD_ROUTES,
  ...Object.keys(TV_PACK_MAPPINGS),
  ...Object.keys(TOP_CHANNEL_ALIASES),
  ...Object.keys(GAME_SLUG_TO_ID),
  'hoy',
  'manana',
  'laliga',
  'champions',
  'premier',
  'barcelona',
  'real-madrid',
]);

export type AppRouteTarget =
  | { kind: 'home'; roomId?: string }
  | { kind: 'system'; systemType: 'tv' | 'ads' | 'auth-bridge' | 'design-system' | 'admin' | 'samsung' | 'webos' | 'controller'; roomId?: string; pairCode?: string }
  | { kind: 'room'; roomId: string; gameType?: string; isTvMode?: boolean }
  | {
      kind: 'world';
      world: 'cine' | 'futbol' | 'tv' | 'juegos' | 'youtube' | 'clipbox' | 'rbtv' | 'belix' | 'atresplayer' | 'movistardazn' | 'music';
      cineTab?: 'movies' | 'series';
      cineCastellano?: boolean;
      cineCategory?: string;
      futbolTab?: 'matches' | 'channels';
      musicTrackParam?: string;
      musicQuery?: string;
      roomId?: string;
    }
  | { kind: 'movie'; idOrSlug: string; tmdbId?: number; roomId?: string }
  | {
      kind: 'series';
      idOrSlug: string;
      tmdbId?: number;
      season?: number;
      episode?: number;
      roomId?: string;
    }
  | { kind: 'channel'; channelSlug: string; channelIdAlias?: string; roomId?: string }
  | { kind: 'pack'; packSlug: string; pack: TvPackMapping; roomId?: string }
  | { kind: 'footballScope'; scope: string; config: FootballScopeConfig; roomId?: string }
  | { kind: 'match'; matchIdOrSlug: string; roomId?: string }
  | { kind: 'game'; gameSlug: string; gameId: string; roomId?: string };

function parseLeadingTmdbId(idOrSlug: string): number | undefined {
  const clean = decodeURIComponent(String(idOrSlug || '')).trim();
  const m = clean.match(/^(\d{1,10})(?:-|$)/);
  if (!m) return undefined;
  const num = Number(m[1]);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function parseSeasonSegment(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const clean = decodeURIComponent(raw).trim().toLowerCase();
  const m = clean.match(/^(?:t|s|temporada-?|season-?)?(\d{1,3})$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

function parseEpisodeSegment(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const clean = decodeURIComponent(raw).trim().toLowerCase();
  const m = clean.match(/^(?:e|c|cap-?|ep-?|episodio-?)?(\d{1,4})$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

export function parseAppRoute(pathname: string, search = ''): AppRouteTarget {
  const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(cleanSearch);
  const rawRoomParam = params.get('room')?.trim().toLowerCase() || '';
  const queryRoomId =
    rawRoomParam && /^[a-z0-9-_]{2,32}$/.test(rawRoomParam) && !ALL_RESERVED_SLUGS.has(rawRoomParam)
      ? rawRoomParam
      : undefined;
  const rawGame = params.get('game')?.trim().toLowerCase() || '';
  const queryGameType = /^[a-z0-9_-]{2,24}$/.test(rawGame) ? rawGame : undefined;
  const isTvMode = params.get('tv') === '1';
  const musicTrackParam = params.get('track')?.trim() || undefined;
  const musicQuery = params.get('musicq')?.trim() || undefined;

  const segments = String(pathname || '/')
    .split('/')
    .map((s) => decodeURIComponent(s).trim())
    .filter(Boolean);
  const seg0 = (segments[0] || '').toLowerCase();
  const seg1 = (segments[1] || '').toLowerCase();
  const seg2 = (segments[2] || '').toLowerCase();
  const seg3 = (segments[3] || '').toLowerCase();

  if (params.get('authbridge') === '1' || seg0 === 'auth-bridge') {
    return { kind: 'system', systemType: 'auth-bridge', roomId: queryRoomId };
  }
  if (params.get('ads') === '1' || seg0 === 'ads' || seg0 === 'naimcine-ads') {
    return { kind: 'system', systemType: 'ads', roomId: queryRoomId };
  }
  if (seg0 === 'design-system') {
    return { kind: 'system', systemType: 'design-system', roomId: queryRoomId };
  }
  if (seg0 === 'admin') {
    return { kind: 'system', systemType: 'admin', roomId: queryRoomId };
  }
  if (seg0 === 'samsung' || params.get('samsung') === '1') {
    return { kind: 'system', systemType: 'samsung', roomId: queryRoomId };
  }
  if (seg0 === 'webos' || seg0 === 'lg' || params.get('webos') === '1') {
    return { kind: 'system', systemType: 'webos', roomId: queryRoomId };
  }
  if (seg0 === 'volante' || seg0 === 'controller' || params.get('volante') === '1') {
    const rawPair = (params.get('pair') || '').replace(/\D/g, '').slice(0, 4);
    return {
      kind: 'system',
      systemType: 'controller',
      roomId: queryRoomId,
      pairCode: rawPair.length === 4 ? rawPair : undefined,
    };
  }
  if (params.get('tvpair') === '1' || seg0 === 'tv' || seg0 === 'tvlg') {
    return { kind: 'system', systemType: 'tv', roomId: queryRoomId };
  }

  // Root /
  if (segments.length === 0) {
    if (musicTrackParam || musicQuery) {
      return {
        kind: 'world',
        world: 'music',
        musicTrackParam,
        musicQuery,
        roomId: queryRoomId,
      };
    }
    if (queryRoomId) {
      return { kind: 'room', roomId: queryRoomId, gameType: queryGameType, isTvMode };
    }
    return { kind: 'home' };
  }

  // Room prefix /s/:code or /r/:code or /sala/:code
  if (segments.length === 2 && (seg0 === 's' || seg0 === 'r' || seg0 === 'sala')) {
    if (!seg1.includes('.') && /^[a-z0-9-_]{2,32}$/.test(seg1) && !ALL_RESERVED_SLUGS.has(seg1)) {
      return { kind: 'room', roomId: seg1, gameType: queryGameType, isTvMode };
    }
  }
  if (segments.length === 1 && seg0 === 'sala') {
    if (queryRoomId) {
      return { kind: 'room', roomId: queryRoomId, gameType: queryGameType, isTvMode };
    }
  }

  // Typed Movie route: /pelicula/:idOrSlug
  if (seg0 === 'pelicula' && segments[1]) {
    const idOrSlug = segments[1];
    return {
      kind: 'movie',
      idOrSlug,
      tmdbId: parseLeadingTmdbId(idOrSlug),
      roomId: queryRoomId,
    };
  }

  // Typed Series route: /serie/:idOrSlug(/t:season)?(/e:episode)?
  if (seg0 === 'serie' && segments[1]) {
    const idOrSlug = segments[1];
    const seasonFromPath = parseSeasonSegment(seg2);
    const epFromPath = parseEpisodeSegment(seg3);
    const seasonFromQuery = parseSeasonSegment(params.get('t') || params.get('season'));
    const epFromQuery = parseEpisodeSegment(params.get('e') || params.get('episode'));
    return {
      kind: 'series',
      idOrSlug,
      tmdbId: parseLeadingTmdbId(idOrSlug),
      season: seasonFromPath ?? seasonFromQuery,
      episode: epFromPath ?? epFromQuery,
      roomId: queryRoomId,
    };
  }

  // Typed Channel route: /canal/:slug
  if (seg0 === 'canal' && segments[1]) {
    const slug = slugify(segments[1]);
    return {
      kind: 'channel',
      channelSlug: slug || seg1,
      channelIdAlias: TOP_CHANNEL_ALIASES[slug],
      roomId: queryRoomId,
    };
  }

  // Typed Pack route: /pack/:packSlug
  if (seg0 === 'pack' && segments[1]) {
    const mapped = resolveTvPackMapping(seg1);
    if (mapped) {
      return { kind: 'pack', packSlug: mapped.slug, pack: mapped, roomId: queryRoomId };
    }
  }

  // Typed Match route: /partido/:idOrSlug
  if (seg0 === 'partido' && segments[1]) {
    return {
      kind: 'match',
      matchIdOrSlug: segments.slice(1).join('/'),
      roomId: queryRoomId,
    };
  }

  // Football world & scopes: /futbol or /futbol/:scope
  if (seg0 === 'futbol') {
    if (seg1) {
      const cfg = FOOTBALL_SCOPE_MAP[slugify(seg1)] || FOOTBALL_SCOPE_MAP[seg1];
      if (cfg) {
        return { kind: 'footballScope', scope: cfg.scope, config: cfg, roomId: queryRoomId };
      }
      // Also allow /futbol/:teamOrLeagueSlug fallback to scope search
      return {
        kind: 'footballScope',
        scope: slugify(seg1),
        config: {
          scope: slugify(seg1),
          labelEs: `Fútbol · ${segments[1]}`,
          labelCa: `Futbol · ${segments[1]}`,
          labelEn: `Football · ${segments[1]}`,
          searchQuery: segments[1].replace(/-/g, ' '),
          statusTab: 'all',
          futbolTab: 'matches',
        },
        roomId: queryRoomId,
      };
    }
    return { kind: 'world', world: 'futbol', futbolTab: 'matches', roomId: queryRoomId };
  }

  // Games world & specific game: /juegos or /juegos/:gameSlug
  if (seg0 === 'juegos') {
    if (seg1) {
      const norm = slugify(seg1);
      const mappedGameId = GAME_SLUG_TO_ID[norm] || GAME_SLUG_TO_ID[seg1];
      if (mappedGameId) {
        return {
          kind: 'game',
          gameSlug: GAME_ID_TO_SLUG[mappedGameId] || norm,
          gameId: mappedGameId,
          roomId: queryRoomId,
        };
      }
    }
    return { kind: 'world', world: 'juegos', roomId: queryRoomId };
  }

  // Cine & Series world routes: /cine, /cine/:filter, /series, /series/:filter
  if (seg0 === 'cine') {
    return {
      kind: 'world',
      world: 'cine',
      cineTab: 'movies',
      cineCategory: seg1 || undefined,
      cineCastellano: seg1 === 'vose' || seg1 === 'en' ? false : undefined,
      roomId: queryRoomId,
    };
  }
  if (seg0 === 'series') {
    return {
      kind: 'world',
      world: 'cine',
      cineTab: 'series',
      cineCategory: seg1 || undefined,
      cineCastellano: seg1 === 'vose' || seg1 === 'en' ? false : undefined,
      roomId: queryRoomId,
    };
  }

  // Live TV world routes: /directo, /canales
  if (seg0 === 'directo' || seg0 === 'canales') {
    if (seg1) {
      const pack = resolveTvPackMapping(seg1);
      if (pack) {
        return { kind: 'pack', packSlug: pack.slug, pack, roomId: queryRoomId };
      }
    }
    return { kind: 'world', world: 'tv', roomId: queryRoomId };
  }

  if (seg0 === 'youtube') {
    return { kind: 'world', world: 'youtube', roomId: queryRoomId };
  }

  if (seg0 === 'clipbox') {
    return { kind: 'world', world: 'clipbox', roomId: queryRoomId };
  }

  if (seg0 === 'rbtv') {
    return { kind: 'world', world: 'rbtv', roomId: queryRoomId };
  }

  if (seg0 === 'belix') {
    return { kind: 'world', world: 'belix', roomId: queryRoomId };
  }

  if (seg0 === 'atresplayer') {
    return { kind: 'world', world: 'atresplayer', roomId: queryRoomId };
  }

  if (seg0 === 'movistar-dazn' || seg0 === 'dazn-movistar') {
    return { kind: 'world', world: 'movistardazn', roomId: queryRoomId };
  }

  if (seg0 === 'musica' || seg0 === 'music') {
    return {
      kind: 'world',
      world: 'music',
      musicTrackParam,
      musicQuery,
      roomId: queryRoomId,
    };
  }

  // Single-segment shortcuts (Packs, Top Channels, Top Games, else Room code!)
  if (segments.length === 1) {
    const norm = slugify(seg0);
    const topPack = resolveTvPackMapping(norm || seg0);
    if (topPack) {
      return { kind: 'pack', packSlug: topPack.slug, pack: topPack, roomId: queryRoomId };
    }
    if (TOP_CHANNEL_ALIASES[norm] || TOP_CHANNEL_ALIASES[seg0]) {
      return {
        kind: 'channel',
        channelSlug: norm || seg0,
        channelIdAlias: TOP_CHANNEL_ALIASES[norm] || TOP_CHANNEL_ALIASES[seg0],
        roomId: queryRoomId,
      };
    }
    if (GAME_SLUG_TO_ID[norm] || GAME_SLUG_TO_ID[seg0]) {
      const gid = GAME_SLUG_TO_ID[norm] || GAME_SLUG_TO_ID[seg0];
      return {
        kind: 'game',
        gameSlug: GAME_ID_TO_SLUG[gid] || norm,
        gameId: gid,
        roomId: queryRoomId,
      };
    }

    if (!seg0.includes('.') && !ALL_RESERVED_SLUGS.has(seg0) && /^[a-z0-9-_]{2,32}$/.test(seg0)) {
      return { kind: 'room', roomId: seg0, gameType: queryGameType, isTvMode };
    }
  }

  if (queryRoomId) {
    return { kind: 'room', roomId: queryRoomId, gameType: queryGameType, isTvMode };
  }
  return { kind: 'home' };
}

export type CanonicalLinkInput =
  | { kind: 'home' }
  | { kind: 'world'; world: 'cine' | 'futbol' | 'tv' | 'juegos' | 'youtube' | 'clipbox' | 'rbtv' | 'belix' | 'atresplayer' | 'movistardazn' | 'music'; cineTab?: 'movies' | 'series'; cineCategory?: string; futbolTab?: 'matches' | 'channels' }
  | { kind: 'movie'; tmdbId?: number; id?: string; title?: string }
  | { kind: 'series'; tmdbId?: number; id?: string; title?: string; season?: number; episode?: number }
  | { kind: 'channel'; id: string; name?: string }
  | { kind: 'pack'; packSlug: string }
  | { kind: 'footballScope'; scope: string }
  | { kind: 'match'; id?: string; eventId?: string; homeTeam?: string; awayTeam?: string; slug?: string }
  | { kind: 'game'; gameId: string }
  | { kind: 'room'; roomId: string; tvMode?: boolean; gameType?: string };

export function buildCanonicalRoute(
  input: CanonicalLinkInput,
  opts?: { roomId?: string }
): string {
  let basePath = '/';

  switch (input.kind) {
    case 'home':
      basePath = '/';
      break;
    case 'world':
      if (input.world === 'cine') {
        const root = input.cineTab === 'series' ? '/series' : '/cine';
        basePath = input.cineCategory ? `${root}/${slugify(input.cineCategory)}` : root;
      } else if (input.world === 'futbol') {
        basePath = input.futbolTab === 'channels' ? '/futbol/canales' : '/futbol';
      } else if (input.world === 'tv') {
        basePath = '/directo';
      } else if (input.world === 'juegos') {
        basePath = '/juegos';
      } else if (input.world === 'youtube') {
        basePath = '/youtube';
      } else if (input.world === 'clipbox') {
        basePath = '/clipbox';
      } else if (input.world === 'rbtv') {
        basePath = '/rbtv';
      } else if (input.world === 'belix') {
        basePath = '/belix';
      } else if (input.world === 'atresplayer') {
        basePath = '/atresplayer';
      } else if (input.world === 'movistardazn') {
        basePath = '/movistar-dazn';
      } else if (input.world === 'music') {
        basePath = '/musica';
      }
      break;
    case 'movie': {
      const titleSlug = input.title ? slugify(input.title) : '';
      if (input.tmdbId && input.tmdbId > 0) {
        basePath = titleSlug ? `/pelicula/${input.tmdbId}-${titleSlug}` : `/pelicula/${input.tmdbId}`;
      } else {
        basePath = `/pelicula/${titleSlug || slugify(input.id || 'pelicula')}`;
      }
      break;
    }
    case 'series': {
      const titleSlug = input.title ? slugify(input.title) : '';
      const baseSlug =
        input.tmdbId && input.tmdbId > 0
          ? titleSlug
            ? `${input.tmdbId}-${titleSlug}`
            : String(input.tmdbId)
          : titleSlug || slugify(input.id || 'serie');
      let suffix = '';
      if (input.season && input.season > 0) {
        suffix += `/t${input.season}`;
        if (input.episode && input.episode > 0) {
          suffix += `/e${input.episode}`;
        }
      }
      basePath = `/serie/${baseSlug}${suffix}`;
      break;
    }
    case 'channel': {
      const topAlias = CHANNEL_ID_TO_TOP_ALIAS[input.id];
      if (topAlias) {
        basePath = `/${topAlias}`;
      } else {
        const chSlug = slugify(input.name || input.id);
        if (TOP_CHANNEL_ALIASES[chSlug]) {
          basePath = `/${chSlug}`;
        } else {
          basePath = `/canal/${chSlug || slugify(input.id)}`;
        }
      }
      break;
    }
    case 'pack': {
      const mapped = resolveTvPackMapping(input.packSlug);
      if (mapped?.topLevel) {
        basePath = `/${mapped.slug}`;
      } else {
        basePath = `/pack/${slugify(input.packSlug)}`;
      }
      break;
    }
    case 'footballScope': {
      const cleanScope = slugify(input.scope);
      basePath = cleanScope ? `/futbol/${cleanScope}` : '/futbol';
      break;
    }
    case 'match': {
      if (input.slug) {
        basePath = `/partido/${input.slug}`;
      } else {
        const teamsSlug =
          input.homeTeam && input.awayTeam
            ? `${slugify(input.homeTeam)}-vs-${slugify(input.awayTeam)}`
            : '';
        const rawId = String(input.eventId || input.id || '').trim();
        const combined =
          rawId && teamsSlug && !rawId.includes('vs')
            ? `${slugify(rawId)}-${teamsSlug}`
            : teamsSlug || slugify(rawId) || 'directo';
        basePath = `/partido/${combined}`;
      }
      break;
    }
    case 'game': {
      const canonicalSlug = GAME_ID_TO_SLUG[input.gameId] || slugify(input.gameId);
      basePath = `/juegos/${canonicalSlug}`;
      break;
    }
    case 'room': {
      const cleanRoom = encodeURIComponent(input.roomId.trim().toLowerCase());
      const q = new URLSearchParams();
      if (input.tvMode) q.set('tv', '1');
      if (input.gameType) q.set('game', input.gameType.trim().toLowerCase());
      const qs = q.toString();
      return qs ? `/${cleanRoom}?${qs}` : `/${cleanRoom}`;
    }
  }

  const roomAttach = opts?.roomId?.trim().toLowerCase();
  if (roomAttach && /^[a-z0-9-_]{2,32}$/.test(roomAttach)) {
    const sep = basePath.includes('?') ? '&' : '?';
    return `${basePath}${sep}room=${encodeURIComponent(roomAttach)}`;
  }
  return basePath;
}

export function resolveConfiguredPublicOrigin(): string {
  if (typeof window !== 'undefined') {
    const host = (window.location.hostname || '').toLowerCase();
    if (host === PUBLIC_PRODUCTION_DOMAIN || host.endsWith(`.${PUBLIC_PRODUCTION_DOMAIN}`)) {
      return window.location.origin;
    }
  }
  return PUBLIC_PRODUCTION_ORIGIN;
}

export function buildCanonicalShareUrl(
  input: CanonicalLinkInput,
  opts?: { roomId?: string; origin?: string }
): string {
  const origin = (opts?.origin || resolveConfiguredPublicOrigin()).replace(/\/+$/, '');
  const path = buildCanonicalRoute(input, { roomId: opts?.roomId });
  return `${origin}${path}`;
}

export function resolveActiveTvPackSlug(params: {
  tvRegion: string;
  tdtCategory: string;
  adrarCountryFilter?: string;
}): string | null {
  const { tvRegion, tdtCategory, adrarCountryFilter } = params;
  if (tdtCategory === 'dazn') return 'dazn';
  if (tdtCategory === 'movistar') return 'movistar';
  if (tdtCategory === 'tdt_all') return 'tdt';
  if (tdtCategory === 'generalistas') return 'generalistas';
  if (tdtCategory === 'bein_arabic') return 'beinsports';
  if (tdtCategory === 'beinsports') return 'beinsports-global';
  if (tdtCategory === 'espn') return 'espn';
  if (tdtCategory === 'dsports') return 'dsports';
  if (tdtCategory === 'marruecos' || tvRegion === 'ma') return 'marruecos';
  if (tdtCategory === 'documentales' || tvRegion === 'docs') return 'documentales';
  if (tdtCategory === 'usa_tv' || tvRegion === 'us') return 'usa';
  if (tdtCategory === 'famelack_movies') return 'famelack';
  if (tdtCategory === 'kids_world') return 'kids-tv';
  if (tdtCategory === 'world_cricket' || tvRegion === 'world_cricket') return 'cricket';
  if (tdtCategory === 'elahmad_mena' || tvRegion === 'elahmad_mena') return 'elahmad';
  if (tdtCategory === 'adrar_europa' || tvRegion === 'adrar_europa') {
    if (adrarCountryFilter && adrarCountryFilter !== 'all') {
      return `adrar-${adrarCountryFilter.toLowerCase()}`;
    }
    return 'adrar';
  }
  if (tvRegion === 'eu' || tdtCategory === 'europa_tv') return 'europa';
  if (tvRegion === 'latam') return 'latam';
  if (tvRegion === 'uk' || tdtCategory === 'uk_sports') return 'uk';
  if (tvRegion === 'cn' || tdtCategory === 'china_football') return 'china';
  if (tvRegion === 'es') return 'espana';
  if (tvRegion === 'ar') return 'beinsports';
  return null;
}

export function isDedicatedAppPath(pathname: string): boolean {
  const parsed = parseAppRoute(pathname);
  return parsed.kind !== 'home' && parsed.kind !== 'room';
}
