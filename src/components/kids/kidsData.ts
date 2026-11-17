import type { CatalogMovie, KidsAgeGroup, KidsLanguageCode } from '../../types';
import type { FlagCode } from '../ui/LanguageBadge';

export interface KidsLanguageMeta {
  code: KidsLanguageCode;
  nativeLabel: string;
  esLabel: string;
  flagCode: FlagCode;
  speechCode: string;
  preferStreamLang: string;
  greeting: string;
  accentHex: string;
}

export const KIDS_LANGUAGES: KidsLanguageMeta[] = [
  {
    code: 'es',
    nativeLabel: 'Español',
    esLabel: 'Español',
    flagCode: 'es',
    speechCode: 'es-ES',
    preferStreamLang: 'ES',
    greeting: '¡Hola! ¿Listos para jugar?',
    accentHex: '#F59E0B',
  },
  {
    code: 'ca',
    nativeLabel: 'Català',
    esLabel: 'Catalán',
    flagCode: 'ca',
    speechCode: 'ca-ES',
    preferStreamLang: 'CAT',
    greeting: 'Hola! A punt per jugar?',
    accentHex: '#EF4444',
  },
  {
    code: 'en',
    nativeLabel: 'English',
    esLabel: 'Inglés',
    flagCode: 'en',
    speechCode: 'en-US',
    preferStreamLang: 'EN',
    greeting: 'Hi! Ready to play?',
    accentHex: '#38BDF8',
  },
  {
    code: 'nl',
    nativeLabel: 'Vlaams',
    esLabel: 'Flamenco',
    flagCode: 'nl',
    speechCode: 'nl-BE',
    preferStreamLang: 'NL',
    greeting: 'Hallo! Klaar om te spelen?',
    accentHex: '#FB923C',
  },
  {
    code: 'fr',
    nativeLabel: 'Français',
    esLabel: 'Francés',
    flagCode: 'fr',
    speechCode: 'fr-FR',
    preferStreamLang: 'FR',
    greeting: 'Salut ! On s’amuse ?',
    accentHex: '#60A5FA',
  },
  {
    code: 'ar',
    nativeLabel: 'العربية',
    esLabel: 'Árabe',
    flagCode: 'ma',
    speechCode: 'ar-MA',
    preferStreamLang: 'AR',
    greeting: 'مرحباً! هيا نلعب ونتعلم!',
    accentHex: '#10B981',
  },
  {
    code: 'rif',
    nativeLabel: 'Tarifit',
    esLabel: 'Rifeño',
    flagCode: 'rif',
    speechCode: 'fr-FR',
    preferStreamLang: 'RIF',
    greeting: 'Azul! Ma twejjdem ad nirar?',
    accentHex: '#A855F7',
  },
  {
    code: 'zh',
    nativeLabel: '中文',
    esLabel: 'Chino',
    flagCode: 'zh',
    speechCode: 'zh-CN',
    preferStreamLang: 'ZH',
    greeting: '你好！一起玩吧！',
    accentHex: '#F43F5E',
  },
];

export interface KidsVocabEntry {
  id: string;
  category: 'animals' | 'nature' | 'numbers' | 'family';
  emoji: string;
  translations: Record<KidsLanguageCode, { word: string; phonetic: string }>;
}

/**
 * Complete 8-language children's vocabulary bank:
 * Español, Català, English, Vlaams (Flamenco), Français, العربية, Tarifit (authentic Riffian), 中文
 */
export const KIDS_VOCAB_BANK: KidsVocabEntry[] = [
  {
    id: 'cat',
    category: 'animals',
    emoji: '🐱',
    translations: {
      es: { word: 'Gato', phonetic: 'GA-to' },
      ca: { word: 'Gat', phonetic: 'gat' },
      en: { word: 'Cat', phonetic: 'kat' },
      nl: { word: 'Kat', phonetic: 'kat' },
      fr: { word: 'Chat', phonetic: 'sha' },
      ar: { word: 'قطة (Qitta)', phonetic: 'QIT-ta' },
      rif: { word: 'Amucc', phonetic: 'a-MUCH' },
      zh: { word: '猫 (Māo)', phonetic: 'mao' },
    },
  },
  {
    id: 'dog',
    category: 'animals',
    emoji: '🐶',
    translations: {
      es: { word: 'Perro', phonetic: 'PE-rro' },
      ca: { word: 'Gos', phonetic: 'gos' },
      en: { word: 'Dog', phonetic: 'dog' },
      nl: { word: 'Hond', phonetic: 'hont' },
      fr: { word: 'Chien', phonetic: 'shyan' },
      ar: { word: 'كلب (Kalb)', phonetic: 'kalb' },
      rif: { word: 'Aqzin', phonetic: 'aq-ZIN' },
      zh: { word: '狗 (Gǒu)', phonetic: 'gou' },
    },
  },
  {
    id: 'bird',
    category: 'animals',
    emoji: '🐦',
    translations: {
      es: { word: 'Pájaro', phonetic: 'PÁ-ja-ro' },
      ca: { word: 'Ocell', phonetic: 'u-SELL' },
      en: { word: 'Bird', phonetic: 'berd' },
      nl: { word: 'Vogel', phonetic: 'VO-jel' },
      fr: { word: 'Oiseau', phonetic: 'wa-ZÓ' },
      ar: { word: 'طائر (Ta’ir)', phonetic: 'TA-ir' },
      rif: { word: 'Ajeḍiḍ', phonetic: 'a-je-DID' },
      zh: { word: '鸟 (Niǎo)', phonetic: 'niao' },
    },
  },
  {
    id: 'fish',
    category: 'animals',
    emoji: '🐠',
    translations: {
      es: { word: 'Pez', phonetic: 'pes' },
      ca: { word: 'Peix', phonetic: 'peix' },
      en: { word: 'Fish', phonetic: 'fish' },
      nl: { word: 'Vis', phonetic: 'vis' },
      fr: { word: 'Poisson', phonetic: 'pwa-SON' },
      ar: { word: 'سمكة (Samaka)', phonetic: 'SA-ma-ka' },
      rif: { word: 'Aslem', phonetic: 'as-LEM' },
      zh: { word: '鱼 (Yú)', phonetic: 'yu' },
    },
  },
  {
    id: 'sun',
    category: 'nature',
    emoji: '☀️',
    translations: {
      es: { word: 'Sol', phonetic: 'sol' },
      ca: { word: 'Sol', phonetic: 'sol' },
      en: { word: 'Sun', phonetic: 'san' },
      nl: { word: 'Zon', phonetic: 'zon' },
      fr: { word: 'Soleil', phonetic: 'so-LEY' },
      ar: { word: 'شمس (Shams)', phonetic: 'shams' },
      rif: { word: 'Tfuct', phonetic: 't-FUCHT' },
      zh: { word: '太阳 (Tàiyáng)', phonetic: 'tai-yang' },
    },
  },
  {
    id: 'moon',
    category: 'nature',
    emoji: '🌙',
    translations: {
      es: { word: 'Luna', phonetic: 'LU-na' },
      ca: { word: 'Lluna', phonetic: 'LLU-na' },
      en: { word: 'Moon', phonetic: 'mun' },
      nl: { word: 'Maan', phonetic: 'man' },
      fr: { word: 'Lune', phonetic: 'lun' },
      ar: { word: 'قمر (Qamar)', phonetic: 'QA-mar' },
      rif: { word: 'Tziri', phonetic: 't-ZI-ri' },
      zh: { word: '月亮 (Yuèliàng)', phonetic: 'yue-liang' },
    },
  },
  {
    id: 'water',
    category: 'nature',
    emoji: '💧',
    translations: {
      es: { word: 'Agua', phonetic: 'A-gwa' },
      ca: { word: 'Aigua', phonetic: 'AI-gwa' },
      en: { word: 'Water', phonetic: 'WO-ter' },
      nl: { word: 'Water', phonetic: 'WA-ter' },
      fr: { word: 'Eau', phonetic: 'o' },
      ar: { word: 'ماء (Mā’)', phonetic: 'maa' },
      rif: { word: 'Aman', phonetic: 'a-MAN' },
      zh: { word: '水 (Shuǐ)', phonetic: 'shuei' },
    },
  },
  {
    id: 'star',
    category: 'nature',
    emoji: '⭐',
    translations: {
      es: { word: 'Estrella', phonetic: 'es-TRE-lla' },
      ca: { word: 'Estrella', phonetic: 'es-TRE-lla' },
      en: { word: 'Star', phonetic: 'star' },
      nl: { word: 'Ster', phonetic: 'ster' },
      fr: { word: 'Étoile', phonetic: 'e-TWAL' },
      ar: { word: 'نجمة (Najma)', phonetic: 'NAJ-ma' },
      rif: { word: 'Itri', phonetic: 'IT-ri' },
      zh: { word: '星星 (Xīngxing)', phonetic: 'shing-shing' },
    },
  },
  {
    id: 'one',
    category: 'numbers',
    emoji: '1️⃣',
    translations: {
      es: { word: 'Uno', phonetic: 'U-no' },
      ca: { word: 'Un', phonetic: 'un' },
      en: { word: 'One', phonetic: 'wan' },
      nl: { word: 'Een', phonetic: 'een' },
      fr: { word: 'Un', phonetic: 'an' },
      ar: { word: 'واحد (Wāḥid)', phonetic: 'WA-hid' },
      rif: { word: 'Ijjen', phonetic: 'IJ-jen' },
      zh: { word: '一 (Yī)', phonetic: 'yi' },
    },
  },
  {
    id: 'two',
    category: 'numbers',
    emoji: '2️⃣',
    translations: {
      es: { word: 'Dos', phonetic: 'dos' },
      ca: { word: 'Dos', phonetic: 'dos' },
      en: { word: 'Two', phonetic: 'tu' },
      nl: { word: 'Twee', phonetic: 'twei' },
      fr: { word: 'Deux', phonetic: 'deu' },
      ar: { word: 'اثنان (Ithnān)', phonetic: 'ith-NAN' },
      rif: { word: 'Tnayen', phonetic: 't-NA-yen' },
      zh: { word: '二 (Èr)', phonetic: 'er' },
    },
  },
  {
    id: 'three',
    category: 'numbers',
    emoji: '3️⃣',
    translations: {
      es: { word: 'Tres', phonetic: 'tres' },
      ca: { word: 'Tres', phonetic: 'tres' },
      en: { word: 'Three', phonetic: 'zri' },
      nl: { word: 'Drie', phonetic: 'dri' },
      fr: { word: 'Trois', phonetic: 'trwa' },
      ar: { word: 'ثلاثة (Thalātha)', phonetic: 'tha-LA-tha' },
      rif: { word: 'Tlata', phonetic: 'TLA-ta' },
      zh: { word: '三 (Sān)', phonetic: 'san' },
    },
  },
  {
    id: 'book',
    category: 'family',
    emoji: '📖',
    translations: {
      es: { word: 'Libro', phonetic: 'LI-bro' },
      ca: { word: 'Llibre', phonetic: 'LLI-bre' },
      en: { word: 'Book', phonetic: 'buk' },
      nl: { word: 'Boek', phonetic: 'buk' },
      fr: { word: 'Livre', phonetic: 'LIVR' },
      ar: { word: 'كتاب (Kitāb)', phonetic: 'ki-TAB' },
      rif: { word: 'Ktab', phonetic: 'k-TAB' },
      zh: { word: '书 (Shū)', phonetic: 'shu' },
    },
  },
  {
    id: 'friend',
    category: 'family',
    emoji: '🤝',
    translations: {
      es: { word: 'Amigo', phonetic: 'a-MI-go' },
      ca: { word: 'Amic', phonetic: 'a-MIK' },
      en: { word: 'Friend', phonetic: 'frend' },
      nl: { word: 'Vriend', phonetic: 'vrint' },
      fr: { word: 'Ami', phonetic: 'a-MI' },
      ar: { word: 'صديق (Ṣadīq)', phonetic: 'sa-DIQ' },
      rif: { word: 'Ameddakel', phonetic: 'a-med-DA-kel' },
      zh: { word: '朋友 (Péngyǒu)', phonetic: 'peng-you' },
    },
  },
  {
    id: 'home',
    category: 'family',
    emoji: '🏡',
    translations: {
      es: { word: 'Casa', phonetic: 'KA-sa' },
      ca: { word: 'Casa', phonetic: 'KA-sa' },
      en: { word: 'Home', phonetic: 'houm' },
      nl: { word: 'Huis', phonetic: 'haus' },
      fr: { word: 'Maison', phonetic: 'me-ZON' },
      ar: { word: 'بيت (Bayt)', phonetic: 'bayt' },
      rif: { word: 'Taddart', phonetic: 'tad-DART' },
      zh: { word: '家 (Jiā)', phonetic: 'jia' },
    },
  },
];

export interface KidsScienceFactCard {
  id: string;
  emoji: string;
  title: string;
  topicEs: string;
  summary: string;
  sampleQuestion: string;
  accentColor: string;
}

export const KIDS_SCIENCE_CARDS: KidsScienceFactCard[] = [
  {
    id: 'earth',
    emoji: '🌍',
    title: 'La Tierra y los Océanos',
    topicEs: '¿Por qué la Tierra se llama el planeta azul?',
    summary: 'El 70% de nuestro planeta está cubierto por agua líquida y una atmósfera que nos protege del Sol.',
    sampleQuestion: '¿Por qué el cielo es azul y los océanos son salados?',
    accentColor: '#38BDF8',
  },
  {
    id: 'mars',
    emoji: '🔴',
    title: 'Marte, el Planeta Rojo',
    topicEs: '¿Qué exploran los rovers en Marte?',
    summary: 'Su polvo tiene óxido de hierro (como hierro oxidado) y alberga el volcán más alto del sistema solar: el Monte Olimpo.',
    sampleQuestion: '¿Podremos vivir algún día en Marte?',
    accentColor: '#F97316',
  },
  {
    id: 'saturn',
    emoji: '🪐',
    title: 'Los Anillos de Saturno',
    topicEs: '¿De qué están hechos los anillos de Saturno?',
    summary: 'Millones de trozos de hielo, roca y polvo espacial que giran juntos como una pista gigante alrededor del planeta.',
    sampleQuestion: '¿Por qué Saturno flotaría en una piscina gigante?',
    accentColor: '#F59E0B',
  },
  {
    id: 'bees',
    emoji: '🐝',
    title: 'Abejas y Polinización',
    topicEs: '¿Cómo ayudan las abejas a las flores y frutas?',
    summary: 'Cuando buscan néctar llevan polen de flor en flor, permitiendo que nazcan manzanas, fresas y bosques enteros.',
    sampleQuestion: '¿Cómo fabrican la miel las abejas?',
    accentColor: '#EAB308',
  },
  {
    id: 'dinosaurs',
    emoji: '🦕',
    title: 'Dinosaurios y Fósiles',
    topicEs: '¿Cómo sabemos qué aspecto tenían los dinosaurios?',
    summary: 'Los paleontólogos estudian huesos fosilizados y huellas guardadas en la roca desde hace millones de años.',
    sampleQuestion: '¿Las aves actuales descienden de los dinosaurios?',
    accentColor: '#10B981',
  },
  {
    id: 'brain',
    emoji: '🧠',
    title: 'El Cerebro Curioso',
    topicEs: '¿Cómo guarda recuerdos nuestro cerebro?',
    summary: 'Cada vez que practicas idiomas, música o mates, millones de neuronas conectan caminos más rápidos como un superpoder.',
    sampleQuestion: '¿Qué pasa en el cerebro mientras dormimos?',
    accentColor: '#A855F7',
  },
];

export type KidsMascotId = 'fox' | 'dino' | 'bot' | 'cat';

export interface KidsMascotMeta {
  id: KidsMascotId;
  emoji: string;
  name: string;
  cheerEs: string;
  costStars: number;
}

export const KIDS_MASCOTS: KidsMascotMeta[] = [
  { id: 'fox', emoji: '🦊', name: 'Zorri', cheerEs: '¡Sigue así, campeón!', costStars: 0 },
  { id: 'dino', emoji: '🦕', name: 'Dino', cheerEs: '¡Roooar de alegría!', costStars: 15 },
  { id: 'bot', emoji: '🤖', name: 'Robi', cheerEs: '¡Súper cerebro activo!', costStars: 25 },
  { id: 'cat', emoji: '🐱', name: 'Michi', cheerEs: '¡Miau, qué divertido!', costStars: 35 },
];

export const KIDS_AVATAR_CHOICES = ['🦁', '🐰', '🐼', '🦊', '🦄', '🐸'];

export interface KidsBadgeMeta {
  id: string;
  emoji: string;
  label: string;
}

export const KIDS_BADGES: KidsBadgeMeta[] = [
  { id: 'explorador', emoji: '🧭', label: 'Explorador' },
  { id: 'cinefilo_kids', emoji: '🎬', label: 'Cinéfilo' },
  { id: 'artista_kids', emoji: '🎨', label: 'Artista' },
  { id: 'musico_kids', emoji: '🎹', label: 'Músico' },
  { id: 'puzzle_maestro', emoji: '🧩', label: 'Puzles' },
  { id: 'simon_musical', emoji: '🔔', label: 'Simón' },
  { id: 'math_wizard', emoji: '🧮', label: 'Mago Mates' },
  { id: 'memory_master', emoji: '🧠', label: 'Súper Memoria' },
  { id: 'story_explorer', emoji: '📖', label: 'Cuentacuentos' },
  { id: 'science_curious', emoji: '🔬', label: 'Científico' },
  { id: 'trivia_champion', emoji: '🏆', label: 'Campeón Trivia' },
  { id: 'estrella_oro', emoji: '🌟', label: 'Estrella Oro' },
  { id: 'genio_multilingue', emoji: '🌍', label: 'Políglota' },
];

export interface KidsRewardItem {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  cost: number;
}

export const KIDS_SHOP_ITEMS: KidsRewardItem[] = [
  {
    id: 'draw_neon',
    emoji: '✨',
    title: 'Pincel Neón',
    desc: 'Trazo brillante mágico en Dibujar',
    cost: 10,
  },
  {
    id: 'draw_space_stamps',
    emoji: '🦄',
    title: 'Sellos Mágicos',
    desc: 'Unicornio, OVNI, Dragón y Arcoíris',
    cost: 14,
  },
  {
    id: 'piano_cat',
    emoji: '🐱',
    title: 'Piano Miau',
    desc: 'Modo divertido de notas gatunas',
    cost: 12,
  },
  {
    id: 'piano_space',
    emoji: '🛸',
    title: 'Sinte Espacial',
    desc: 'Sonido galáctico en el Piano',
    cost: 16,
  },
];

export const DEFAULT_PARENT_SAFE_SEEDS: CatalogMovie[] = [
  {
    id: 'kids-movie-862',
    tmdbId: 862,
    mediaType: 'movie',
    title: 'Toy Story',
    year: '1995',
    rating: '8.0',
    overview: 'Los juguetes cobran vida cuando nadie mira.',
    poster: 'https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w780/lxD5ak7BOoinRNehOCA85CQ8ubr.jpg',
    languages: ['ES', 'CAT', 'EN'],
    genres: ['Infantil', 'Animación'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  },
  {
    id: 'kids-tv-82728',
    tmdbId: 82728,
    mediaType: 'tv',
    title: 'Bluey',
    year: '2018',
    rating: '8.7',
    overview: 'Aventuras familiares llenas de juegos e imaginación.',
    poster: 'https://image.tmdb.org/t/p/w500/9p4pNoVN6V70o2d7iV6k0z8oJ9.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w780/9p4pNoVN6V70o2d7iV6k0z8oJ9.jpg',
    languages: ['ES', 'EN', 'FR'],
    genres: ['Infantil', 'Serie'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  },
  {
    id: 'kids-movie-354912',
    tmdbId: 354912,
    mediaType: 'movie',
    title: 'Coco',
    year: '2017',
    rating: '8.2',
    overview: 'Un viaje musical lleno de familia y color.',
    poster: 'https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w780/askg3SMvhqEl4OL52YuvdtY40Yb.jpg',
    languages: ['ES', 'EN'],
    genres: ['Infantil', 'Música'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  },
  {
    id: 'kids-movie-8392',
    tmdbId: 8392,
    mediaType: 'movie',
    title: 'Mi vecino Totoro',
    year: '1988',
    rating: '8.1',
    overview: 'Amistad mágica en el bosque.',
    poster: 'https://image.tmdb.org/t/p/w500/rtGDOeG9LzoerkDGZF9dnVeLppL.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w780/etqr6fOOCXQOgwrQXaKwenTSuzx.jpg',
    languages: ['ES', 'CAT', 'ZH'],
    genres: ['Infantil', 'Fantasía'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  },
  {
    id: 'kids-movie-12',
    tmdbId: 12,
    mediaType: 'movie',
    title: 'Buscando a Nemo',
    year: '2003',
    rating: '7.8',
    overview: 'Una aventura submarina inolvidable.',
    poster: 'https://image.tmdb.org/t/p/w500/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w780/n2vIG0uQNp5R5gR9T2B0zJ8V6sH.jpg',
    languages: ['ES', 'EN', 'NL'],
    genres: ['Infantil', 'Animales'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  },
  {
    id: 'kids-movie-116149',
    tmdbId: 116149,
    mediaType: 'movie',
    title: 'Paddington',
    year: '2014',
    rating: '7.1',
    overview: 'Un osito amable en busca de un hogar.',
    poster: 'https://image.tmdb.org/t/p/w500/wpchRGhRhv9i3W44iW7L9p4G9k8.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w780/8e0d8xY4M0xW2n9f6sF6rN3K2oT.jpg',
    languages: ['ES', 'EN', 'FR', 'NL'],
    genres: ['Infantil', 'Familia'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  },
];

export interface KidsDailyMissions {
  date: string;
  watch: number;
  play: number;
  learn: number;
  chestClaimed: boolean;
}

export interface KidsParentPrefs {
  lockedLang: KidsLanguageCode | null;
  lockedAge: KidsAgeGroup | null;
  timerMinutes: number | null;
  timerStartedAt: number | null;
  approvedOnlyMode?: boolean;
  approvedItems?: CatalogMovie[];
}

export interface KidsProgressState {
  id?: string;
  name?: string;
  avatarEmoji?: string;
  stars: number;
  streakDays: number;
  completedLessons: number;
  badges: string[];
  ageGroup: KidsAgeGroup;
  preferredLang: KidsLanguageCode;
  mascotId: KidsMascotId;
  unlockedRewards: string[];
  recentWatched?: CatalogMovie[];
  dailyMissions?: KidsDailyMissions;
  parentPrefs: KidsParentPrefs;
}

export interface KidsProfilesStore {
  activeProfileId: string;
  profiles: KidsProgressState[];
}

const KIDS_PROGRESS_STORAGE_KEY = 'riffan_kids_progress_v1';
const KIDS_PROFILES_STORAGE_KEY = 'riffan_kids_profiles_v2';

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createFreshDailyMissions(date = getTodayIsoDate()): KidsDailyMissions {
  return {
    date,
    watch: 0,
    play: 0,
    learn: 0,
    chestClaimed: false,
  };
}

export function createDefaultKidsProfile(
  overrides: Partial<KidsProgressState> = {}
): KidsProgressState {
  return {
    id: overrides.id || 'kid-1',
    name: overrides.name || 'Peque 1',
    avatarEmoji: overrides.avatarEmoji || '🦊',
    stars: 12,
    streakDays: 1,
    completedLessons: 0,
    badges: ['explorador'],
    ageGroup: '6-8',
    preferredLang: 'es',
    mascotId: 'fox',
    unlockedRewards: [],
    recentWatched: [],
    dailyMissions: createFreshDailyMissions(),
    parentPrefs: {
      lockedLang: null,
      lockedAge: null,
      timerMinutes: null,
      timerStartedAt: null,
      approvedOnlyMode: false,
      approvedItems: DEFAULT_PARENT_SAFE_SEEDS.slice(0, 4),
    },
    ...overrides,
  };
}

function normalizeKidsState(raw: Partial<KidsProgressState>): KidsProgressState {
  const defaults = createDefaultKidsProfile();
  const today = getTodayIsoDate();
  const rawMissions = raw.dailyMissions;
  const dailyMissions: KidsDailyMissions =
    rawMissions && rawMissions.date === today
      ? {
          date: today,
          watch: Number(rawMissions.watch || 0),
          play: Number(rawMissions.play || 0),
          learn: Number(rawMissions.learn || 0),
          chestClaimed: Boolean(rawMissions.chestClaimed),
        }
      : createFreshDailyMissions(today);

  const parentPrefs: KidsParentPrefs = {
    lockedLang: raw.parentPrefs?.lockedLang ?? null,
    lockedAge: raw.parentPrefs?.lockedAge ?? null,
    timerMinutes:
      typeof raw.parentPrefs?.timerMinutes === 'number'
        ? raw.parentPrefs.timerMinutes
        : null,
    timerStartedAt:
      typeof raw.parentPrefs?.timerStartedAt === 'number'
        ? raw.parentPrefs.timerStartedAt
        : null,
    approvedOnlyMode: Boolean(raw.parentPrefs?.approvedOnlyMode),
    approvedItems: Array.isArray(raw.parentPrefs?.approvedItems)
      ? raw.parentPrefs!.approvedItems
      : defaults.parentPrefs.approvedItems,
  };

  return {
    ...defaults,
    ...raw,
    id: raw.id || defaults.id,
    name: raw.name || defaults.name,
    avatarEmoji: raw.avatarEmoji || defaults.avatarEmoji,
    stars: Number.isFinite(raw.stars) ? Number(raw.stars) : defaults.stars,
    badges: Array.isArray(raw.badges) ? raw.badges : defaults.badges,
    mascotId: raw.mascotId || defaults.mascotId,
    unlockedRewards: Array.isArray(raw.unlockedRewards) ? raw.unlockedRewards : [],
    recentWatched: Array.isArray(raw.recentWatched) ? raw.recentWatched.slice(0, 8) : [],
    dailyMissions,
    preferredLang: parentPrefs.lockedLang || raw.preferredLang || defaults.preferredLang,
    ageGroup: parentPrefs.lockedAge || raw.ageGroup || defaults.ageGroup,
    parentPrefs,
  };
}

export function loadKidsProfilesStore(): KidsProfilesStore {
  const fallbackProfile = createDefaultKidsProfile();
  const fallbackStore: KidsProfilesStore = {
    activeProfileId: fallbackProfile.id!,
    profiles: [fallbackProfile],
  };

  if (typeof localStorage === 'undefined') return fallbackStore;

  try {
    const rawStore = localStorage.getItem(KIDS_PROFILES_STORAGE_KEY);
    if (rawStore) {
      const parsed = JSON.parse(rawStore) as Partial<KidsProfilesStore>;
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        const normalized = parsed.profiles.map((p, idx) =>
          normalizeKidsState({ ...p, id: p.id || `kid-${idx + 1}` })
        );
        const activeId = normalized.some((p) => p.id === parsed.activeProfileId)
          ? parsed.activeProfileId!
          : normalized[0].id!;
        return { activeProfileId: activeId, profiles: normalized };
      }
    }

    // Migrate legacy single-profile progress if present
    const legacyRaw = localStorage.getItem(KIDS_PROGRESS_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = normalizeKidsState(JSON.parse(legacyRaw) as Partial<KidsProgressState>);
      const store: KidsProfilesStore = {
        activeProfileId: migrated.id!,
        profiles: [migrated],
      };
      saveKidsProfilesStore(store);
      return store;
    }
  } catch {
    return fallbackStore;
  }

  return fallbackStore;
}

export function saveKidsProfilesStore(store: KidsProfilesStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KIDS_PROFILES_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

export function createKidsProfile(
  store: KidsProfilesStore,
  name: string,
  avatarEmoji: string,
  ageGroup: KidsAgeGroup
): { store: KidsProfilesStore; profile: KidsProgressState } {
  const cleanName = name.trim().slice(0, 18) || `Peque ${store.profiles.length + 1}`;
  const currentActive =
    store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0];
  const profile = createDefaultKidsProfile({
    id: `kid-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    name: cleanName,
    avatarEmoji: avatarEmoji || '🦁',
    ageGroup,
    parentPrefs: currentActive?.parentPrefs
      ? { ...currentActive.parentPrefs }
      : createDefaultKidsProfile().parentPrefs,
  });
  const nextStore: KidsProfilesStore = {
    activeProfileId: profile.id!,
    profiles: [...store.profiles, profile],
  };
  saveKidsProfilesStore(nextStore);
  saveKidsProgress(profile);
  return { store: nextStore, profile };
}

export function switchKidsProfile(
  store: KidsProfilesStore,
  profileId: string
): { store: KidsProfilesStore; profile: KidsProgressState } {
  const found = store.profiles.find((p) => p.id === profileId) || store.profiles[0];
  const normalized = normalizeKidsState(found);
  const nextStore: KidsProfilesStore = {
    activeProfileId: normalized.id!,
    profiles: store.profiles.map((p) => (p.id === normalized.id ? normalized : p)),
  };
  saveKidsProfilesStore(nextStore);
  saveKidsProgress(normalized);
  return { store: nextStore, profile: normalized };
}

export function deleteKidsProfile(
  store: KidsProfilesStore,
  profileId: string
): { store: KidsProfilesStore; profile: KidsProgressState } {
  if (store.profiles.length <= 1) {
    return { store, profile: normalizeKidsState(store.profiles[0]) };
  }
  const remaining = store.profiles.filter((p) => p.id !== profileId);
  const nextActive =
    remaining.find((p) => p.id === store.activeProfileId) || remaining[0];
  const nextStore: KidsProfilesStore = {
    activeProfileId: nextActive.id!,
    profiles: remaining,
  };
  saveKidsProfilesStore(nextStore);
  saveKidsProgress(nextActive);
  return { store: nextStore, profile: normalizeKidsState(nextActive) };
}

export function loadKidsProgress(): KidsProgressState {
  if (typeof localStorage === 'undefined') return createDefaultKidsProfile();
  try {
    const storeRaw = localStorage.getItem(KIDS_PROFILES_STORAGE_KEY);
    if (storeRaw) {
      const store = loadKidsProfilesStore();
      const active =
        store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0];
      return normalizeKidsState(active);
    }
    const raw = localStorage.getItem(KIDS_PROGRESS_STORAGE_KEY);
    if (!raw) return createDefaultKidsProfile();
    return normalizeKidsState(JSON.parse(raw) as Partial<KidsProgressState>);
  } catch {
    return createDefaultKidsProfile();
  }
}

export function saveKidsProgress(state: KidsProgressState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const normalized = normalizeKidsState(state);
    localStorage.setItem(KIDS_PROGRESS_STORAGE_KEY, JSON.stringify(normalized));

    const storeRaw = localStorage.getItem(KIDS_PROFILES_STORAGE_KEY);
    if (storeRaw) {
      const parsed = JSON.parse(storeRaw) as KidsProfilesStore;
      if (Array.isArray(parsed?.profiles) && parsed.profiles.length > 0) {
        const exists = parsed.profiles.some((p) => p.id === normalized.id);
        const updatedProfiles = exists
          ? parsed.profiles.map((p) => (p.id === normalized.id ? normalized : p))
          : [...parsed.profiles, normalized];
        localStorage.setItem(
          KIDS_PROFILES_STORAGE_KEY,
          JSON.stringify({
            activeProfileId: normalized.id || parsed.activeProfileId,
            profiles: updatedProfiles,
          })
        );
      }
    }
  } catch {
    // ignore storage quota errors
  }
}

export function recordKidsWatched(
  current: KidsProgressState,
  movie: CatalogMovie
): KidsProgressState {
  const existing = current.recentWatched || [];
  const deduped = [movie, ...existing.filter((m) => m.id !== movie.id)].slice(0, 8);
  const next = trackKidsMission(
    {
      ...current,
      recentWatched: deduped,
    },
    'watch'
  );
  saveKidsProgress(next);
  return next;
}

export function trackKidsMission(
  current: KidsProgressState,
  kind: 'watch' | 'play' | 'learn'
): KidsProgressState {
  const today = getTodayIsoDate();
  const base =
    current.dailyMissions && current.dailyMissions.date === today
      ? current.dailyMissions
      : createFreshDailyMissions(today);
  const nextMissions: KidsDailyMissions = {
    ...base,
    [kind]: base[kind] + 1,
  };
  const next: KidsProgressState = {
    ...current,
    dailyMissions: nextMissions,
  };
  saveKidsProgress(next);
  return next;
}

export function isDailyMissionChestReady(state: KidsProgressState): boolean {
  const today = getTodayIsoDate();
  const m = state.dailyMissions;
  if (!m || m.date !== today || m.chestClaimed) return false;
  return m.watch >= 1 && m.play >= 1 && m.learn >= 1;
}

export function claimDailyMissionChest(
  current: KidsProgressState
): { ok: boolean; state: KidsProgressState } {
  if (!isDailyMissionChestReady(current)) {
    return { ok: false, state: current };
  }
  const today = getTodayIsoDate();
  const missions = current.dailyMissions || createFreshDailyMissions(today);
  const next: KidsProgressState = {
    ...current,
    stars: current.stars + 10,
    dailyMissions: {
      ...missions,
      chestClaimed: true,
    },
  };
  saveKidsProgress(next);
  return { ok: true, state: next };
}

export function awardKidsStars(
  current: KidsProgressState,
  deltaStars: number,
  badgeId?: string
): KidsProgressState {
  const nextStars = Math.max(0, current.stars + deltaStars);
  const badges = new Set(current.badges);
  if (badgeId) badges.add(badgeId);
  if (nextStars >= 25) badges.add('estrella_oro');
  if (nextStars >= 60) badges.add('genio_multilingue');
  const next: KidsProgressState = {
    ...current,
    stars: nextStars,
    completedLessons: current.completedLessons + 1,
    badges: Array.from(badges),
  };
  saveKidsProgress(next);
  return next;
}

export function unlockKidsReward(
  current: KidsProgressState,
  rewardId: string,
  costStars: number
): { ok: boolean; state: KidsProgressState } {
  const unlocked = new Set(current.unlockedRewards || []);
  if (unlocked.has(rewardId)) {
    return { ok: true, state: current };
  }
  if (current.stars < costStars) {
    return { ok: false, state: current };
  }
  unlocked.add(rewardId);
  const next: KidsProgressState = {
    ...current,
    stars: current.stars - costStars,
    unlockedRewards: Array.from(unlocked),
  };
  saveKidsProgress(next);
  return { ok: true, state: next };
}

export function selectKidsMascot(
  current: KidsProgressState,
  mascot: KidsMascotMeta
): { ok: boolean; state: KidsProgressState } {
  const unlockedKey = `mascot_${mascot.id}`;
  const isOwned = mascot.costStars === 0 || (current.unlockedRewards || []).includes(unlockedKey);
  if (isOwned) {
    const next: KidsProgressState = { ...current, mascotId: mascot.id };
    saveKidsProgress(next);
    return { ok: true, state: next };
  }
  if (current.stars < mascot.costStars) {
    return { ok: false, state: current };
  }
  const next: KidsProgressState = {
    ...current,
    stars: current.stars - mascot.costStars,
    mascotId: mascot.id,
    unlockedRewards: Array.from(new Set([...(current.unlockedRewards || []), unlockedKey])),
  };
  saveKidsProgress(next);
  return { ok: true, state: next };
}
