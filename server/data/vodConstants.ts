/**
 * @module server/data/vodConstants
 * @description Shared VOD provider definitions, curated 4K film/series IDs, masterpiece anime IDs, and query resolution helpers.
 */

export const MOVIE_GENRE_MAP: Record<string, number> = {
  action: 28,
  scifi: 878,
  horror: 27,
  comedy: 35,
  animation: 16,
  anime: 16,
  thriller: 53,
  adventure: 12,
  drama: 18,
  family: 10751,
  kids: 10751,
};

export const MOVIDY_GENRE_SLUGS: Record<string, string> = {
  action: 'accion',
  scifi: 'ciencia-ficcion',
  horror: 'terror',
  comedy: 'comedia',
  animation: 'animacion',
  anime: 'animacion',
  thriller: 'suspense',
  adventure: 'aventura',
  drama: 'drama',
  family: 'animacion',
  kids: 'animacion',
};

export const ANIME_PROVIDER_IDS = new Set([
  'anime_all',
  'crunchyroll',
  'animebox',
  'jkanime',
  'animeflv',
]);

// Top Legendary Masterpiece Anime (authentic & rich in Castellano / Latino / VOSE 1080p)
export const USER_MASTERPIECE_ANIME_TV_IDS = [
  1429,   // Attack on Titan (Ataque a los Titanes / Shingeki no Kyojin)
  127532, // Solo Leveling
  95479,  // Jujutsu Kaisen
  85937,  // Demon Slayer (Kimetsu no Yaiba: Guardianes de la Noche)
  31911,  // Fullmetal Alchemist: Brotherhood
  46298,  // Hunter × Hunter (2011)
  13916,  // Death Note
  37854,  // One Piece
  42509,  // Steins;Gate
  88803,  // Vinland Saga
  35935,  // Berserk: La Historia de la Espada Feroz (1997)
  66053,  // Berserk (2016)
  62104,  // Los siete pecados capitales (The Seven Deadly Sins / Nanatsu no Taizai)
];

export function matchMasterpieceAnimeIds(rawQuery: string): number[] {
  const norm = String(rawQuery || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!norm) return [];

  if (
    /^(attack on titan|ataque a los titanes|shingeki|shingeki no kyojin|aot|titanes?)$/i.test(norm) ||
    /\b(attack on titan|ataque a los titanes|shingeki no kyojin)\b/i.test(norm)
  ) {
    return [1429];
  }
  if (
    /^(fullmetal|fullmetal alchemist|brotherhood|fma|alchemist|full metal)$/i.test(norm) ||
    /\b(fullmetal|full metal alchemist)\b/i.test(norm)
  ) {
    return [31911];
  }
  if (
    /^(hunter x hunter|hunter|hunterxhunter|hxh|cazador x)$/i.test(norm) ||
    /\b(hunter x hunter|hunterxhunter)\b/i.test(norm)
  ) {
    return [46298, 45952];
  }
  if (/^(death note|deathnote|shinigami|light yagami)$/i.test(norm) || /\b(death note)\b/i.test(norm)) {
    return [13916];
  }
  if (/^(one piece|onepiece|luffy|straw hat)$/i.test(norm) || /\b(one piece)\b/i.test(norm)) {
    return [37854];
  }
  if (/^(jujutsu|jujutsu kaisen|jjk|sukuna|gojo)$/i.test(norm) || /\b(jujutsu kaisen)\b/i.test(norm)) {
    return [95479];
  }
  if (
    /^(demon slayer|kimetsu|kimetsu no yaiba|guardianes de la noche|tanjiro)$/i.test(norm) ||
    /\b(demon slayer|kimetsu no yaiba|guardianes de la noche)\b/i.test(norm)
  ) {
    return [85937];
  }
  if (/^(steins gate|steinsgate|steins|okabe)$/i.test(norm) || /\b(steins gate|steinsgate)\b/i.test(norm)) {
    return [42509];
  }
  if (/^(vinland|vinland saga|thorfinn)$/i.test(norm) || /\b(vinland saga)\b/i.test(norm)) {
    return [88803];
  }
  if (/^(berserk|berserk 1997|berserk 2016|guts)$/i.test(norm) || /\b(berserk)\b/i.test(norm)) {
    return [35935, 66053];
  }
  if (
    /^(los 7 pecados capitales|7 pecados capitales|los 7 pecados|7 pecados|los siete pecados capitales|siete pecados capitales|los siete pecados|nanatsu no taizai|nanatsu|seven deadly sins|meliodas)$/i.test(norm) ||
    /\b(7 pecados|siete pecados|nanatsu no taizai|seven deadly sins)\b/i.test(norm)
  ) {
    return [62104];
  }
  if (/^(solo leveling|sololeveling|sung jinwoo|jinwoo)$/i.test(norm) || /\b(solo leveling)\b/i.test(norm)) {
    return [127532];
  }
  return [];
}

// Selecta Visión / AnimeBox Spain flagship TV & Movie TMDB IDs
export const ANIMEBOX_CURATED_TV_IDS = [
  ...USER_MASTERPIECE_ANIME_TV_IDS,
  12971,  // Dragon Ball Z
  12609,  // Dragon Ball
  62715,  // Dragon Ball Super
  46260,  // Naruto
  31910,  // Naruto Shippuden
  203737, // Oshi no Ko
  46261,  // Fairy Tail
  60863,  // Haikyu!!
  42444,  // Saint Seiya: Los Caballeros del Zodiaco
  30669,  // Yu Yu Hakusho
  42445,  // Slam Dunk
  35610,  // Inuyasha
  61374,  // Tokyo Ghoul
  61663,  // Assassination Classroom
];

export const ANIMEBOX_CURATED_MOVIE_IDS = [
  372058, // Your Name
  916224, // Suzume
  503314, // Dragon Ball Super: Broly
  149,    // Akira
  378064, // A Silent Voice (La voz silenciosa)
  568160, // El tiempo contigo (Weathering with You)
  783675, // The First Slam Dunk
  635302, // Kimetsu no Yaiba: El tren infinito
];

export const CURATED_4K_MOVIE_IDS = [
  693134, // Dune: Parte Dos
  872585, // Oppenheimer
  157336, // Interstellar
  361743, // Top Gun: Maverick
  414906, // The Batman
  335984, // Blade Runner 2049
  569094, // Spider-Man: Cruzando el Multiverso
  76600,  // Avatar: El sentido del agua
  558449, // Gladiator II
  155,    // El caballero oscuro
  27205,  // Origen
  76341,  // Mad Max: Furia en la carretera
  603692, // John Wick 4
  299534, // Vengadores: Endgame
  533535, // Deadpool y Lobezno
  62,     // 2001: Una odisea del espacio
  603,    // Matrix
  945961, // Alien: Romulus
  933260, // La sustancia
  786892, // Furiosa: De la saga Mad Max
  634649, // Spider-Man: No Way Home
  438631, // Dune
  19995,  // Avatar
];
export const CURATED_4K_MOVIE_SET = new Set(CURATED_4K_MOVIE_IDS);

export const CURATED_4K_SERIES_IDS = [
  100088, // The Last of Us
  94997,  // La casa del dragón
  1399,   // Juego de tronos
  66732,  // Stranger Things
  1396,   // Breaking Bad
  82856,  // The Mandalorian
  106379, // Fallout
  126308, // Shōgun
  95396,  // Severance
  94605,  // Arcane
  76479,  // The Boys
  76773,  // Los Anillos de Poder
  60059,  // Better Call Saul
  87108,  // Chernobyl
  83867,  // Andor
  125988, // Silo
  42009,  // Black Mirror
  60625,  // Rick y Morty
  70523,  // Dark
];
export const CURATED_4K_SERIES_SET = new Set(CURATED_4K_SERIES_IDS);

export const CURATED_SPANISH_KIDS_MOVIE_IDS = [
  1022789, // Del revés 2
  502356,  // Super Mario Bros: La película
  1241982, // Vaiana 2
  1184918, // Robot salvaje
  519182,  // Gru 4: Mi villano favorito
  1011985, // Kung Fu Panda 4
  354912,  // Coco
  109445,  // Frozen: El reino del hielo
  568124,  // Encanto
  569094,  // Spider-Man: Cruzando el Multiverso
  862,     // Toy Story
  12,      // Buscando a Nemo
  808,     // Shrek
  8587,    // El rey león
  9806,    // Los Increíbles
];

export const CURATED_SPANISH_KIDS_TV_IDS = [
  82728,   // Bluey
  57532,   // La Patrulla Canina
  12225,   // Peppa Pig
  387,     // Bob Esponja
  65334,   // Prodigiosa: Las aventuras de Ladybug
  37606,   // El asombroso mundo de Gumball
  65733,   // Doraemon
  31135,   // Pocoyó
  15260,   // Hora de aventuras
  60572,   // Pokémon
  40075,   // Gravity Falls
  1877,    // Phineas y Ferb
];

export interface StreamingProviderConfig {
  id: string;
  label: string;
  watchProviders: string;
  tvNetworks: string;
  movieCompanies?: string;
  isAnimePortal?: boolean;
  watchRegion?: string;
}

export const STREAMING_PROVIDER_MAP: Record<string, StreamingProviderConfig> = {
  netflix: {
    id: 'netflix',
    label: 'Netflix',
    watchProviders: '8|1796',
    tvNetworks: '213',
  },
  hbomax: {
    id: 'hbomax',
    label: 'HBO Max',
    watchProviders: '1899|1825|384',
    tvNetworks: '49|3186',
    movieCompanies: '174|49',
  },
  disney: {
    id: 'disney',
    label: 'Disney+',
    watchProviders: '337',
    tvNetworks: '2739|453|88',
    movieCompanies: '2|3|420|1',
  },
  prime: {
    id: 'prime',
    label: 'Prime Video',
    watchProviders: '119|2100',
    tvNetworks: '1024',
    movieCompanies: '1024|20580',
  },
  apple: {
    id: 'apple',
    label: 'Apple TV+',
    watchProviders: '350|2243',
    tvNetworks: '2552',
    movieCompanies: '194232',
  },
  movistar: {
    id: 'movistar',
    label: 'Movistar+',
    watchProviders: '2241|149',
    tvNetworks: '678',
  },
  skyshowtime: {
    id: 'skyshowtime',
    label: 'SkyShowtime',
    watchProviders: '1773|2801',
    tvNetworks: '4330|67',
  },
  anime_all: {
    id: 'anime_all',
    label: 'Anime',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
  crunchyroll: {
    id: 'crunchyroll',
    label: 'Crunchyroll',
    watchProviders: '283|1968',
    tvNetworks: '1112',
    isAnimePortal: true,
    watchRegion: 'US',
  },
  animebox: {
    id: 'animebox',
    label: 'AnimeBox',
    watchProviders: '2735',
    tvNetworks: '',
    isAnimePortal: true,
    watchRegion: 'ES',
  },
  jkanime: {
    id: 'jkanime',
    label: 'JKAnime',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
  animeflv: {
    id: 'animeflv',
    label: 'AnimeFLV',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
};

export function resolveEffectiveProviderAndQuery(
  rawProvider: string,
  rawQuery: string
): { provider: string; query: string } {
  const cleanProvider = String(rawProvider || 'all').toLowerCase().trim();
  const cleanQuery = String(rawQuery || '').trim();
  const normQ = cleanQuery.toLowerCase().replace(/\s+/g, ' ');

  if (normQ === 'netflix') return { provider: 'netflix', query: '' };
  if (normQ === 'hbo' || normQ === 'hbo max' || normQ === 'hbomax' || normQ === 'max') {
    return { provider: 'hbomax', query: '' };
  }
  if (normQ === 'disney' || normQ === 'disney+' || normQ === 'disney plus') {
    return { provider: 'disney', query: '' };
  }
  if (
    normQ === 'prime' ||
    normQ === 'prime video' ||
    normQ === 'amazon' ||
    normQ === 'amazon prime'
  ) {
    return { provider: 'prime', query: '' };
  }
  if (normQ === 'apple tv' || normQ === 'apple tv+' || normQ === 'apple') {
    return { provider: 'apple', query: '' };
  }
  if (normQ === 'movistar' || normQ === 'movistar+' || normQ === 'movistar plus') {
    return { provider: 'movistar', query: '' };
  }
  if (normQ === 'skyshowtime') {
    return { provider: 'skyshowtime', query: '' };
  }
  if (normQ === 'crunchyroll') {
    return { provider: 'crunchyroll', query: '' };
  }
  if (normQ === 'animebox' || normQ === 'anime box') {
    return { provider: 'animebox', query: '' };
  }
  if (normQ === 'jkanime' || normQ === 'jk anime') {
    return { provider: 'jkanime', query: '' };
  }
  if (normQ === 'animeflv' || normQ === 'anime flv') {
    return { provider: 'animeflv', query: '' };
  }
  if (normQ === 'anime') {
    return { provider: 'anime_all', query: '' };
  }

  return {
    provider: STREAMING_PROVIDER_MAP[cleanProvider] ? cleanProvider : 'all',
    query: cleanQuery,
  };
}

export const ANIME_MOVIE_GENRE_EXTRAS: Record<string, string> = {
  shonen: '16,28',
  action: '16,28',
  fantasy: '16,14',
  scifi: '16,878',
  comedy: '16,35',
  drama: '16,18',
};
