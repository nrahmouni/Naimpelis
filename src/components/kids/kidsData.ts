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

export type KidsVocabCategory = 'animals' | 'nature' | 'numbers' | 'family';

export interface KidsVocabEntry {
  id: string;
  category: KidsVocabCategory;
  iconId: string;
  translations: Record<KidsLanguageCode, { word: string; phonetic: string }>;
}

/**
 * Authentic 8-language vocabulary bank featuring everyday Riffian Berber (Tarifit)
 * alongside Español, Català, English, Vlaams, Français, العربية, and 中文.
 */
export const KIDS_VOCAB_BANK: KidsVocabEntry[] = [
  {
    id: 'cat',
    category: 'animals',
    iconId: 'cat',
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
    iconId: 'dog',
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
    iconId: 'bird',
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
    iconId: 'fish',
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
    id: 'lion',
    category: 'animals',
    iconId: 'lion',
    translations: {
      es: { word: 'León', phonetic: 'le-ÓN' },
      ca: { word: 'Lleó', phonetic: 'lle-Ó' },
      en: { word: 'Lion', phonetic: 'LAI-on' },
      nl: { word: 'Leeuw', phonetic: 'leeu' },
      fr: { word: 'Lion', phonetic: 'lyon' },
      ar: { word: 'أسد (Asad)', phonetic: 'A-sad' },
      rif: { word: 'Ayrad', phonetic: 'ay-RAD' },
      zh: { word: '狮子 (Shīzi)', phonetic: 'shi-zi' },
    },
  },
  {
    id: 'sun',
    category: 'nature',
    iconId: 'sun',
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
    iconId: 'moon',
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
    iconId: 'water',
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
    iconId: 'star',
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
    id: 'mountain',
    category: 'nature',
    iconId: 'mountain',
    translations: {
      es: { word: 'Montaña', phonetic: 'mon-TA-ña' },
      ca: { word: 'Muntanya', phonetic: 'mun-TA-nya' },
      en: { word: 'Mountain', phonetic: 'MAUN-tin' },
      nl: { word: 'Berg', phonetic: 'berj' },
      fr: { word: 'Montagne', phonetic: 'mon-TAN-ye' },
      ar: { word: 'جبل (Jabal)', phonetic: 'JA-bal' },
      rif: { word: 'Adrar', phonetic: 'ad-RAR' },
      zh: { word: '山 (Shān)', phonetic: 'shan' },
    },
  },
  {
    id: 'tree',
    category: 'nature',
    iconId: 'tree',
    translations: {
      es: { word: 'Árbol', phonetic: 'ÁR-bol' },
      ca: { word: 'Arbre', phonetic: 'AR-bra' },
      en: { word: 'Tree', phonetic: 'tri' },
      nl: { word: 'Boom', phonetic: 'bom' },
      fr: { word: 'Arbre', phonetic: 'ARBR' },
      ar: { word: 'شجرة (Shajara)', phonetic: 'SHA-ja-ra' },
      rif: { word: 'Ttejra', phonetic: 't-TEJ-ra' },
      zh: { word: '树 (Shù)', phonetic: 'shu' },
    },
  },
  {
    id: 'one',
    category: 'numbers',
    iconId: 'one',
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
    iconId: 'two',
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
    iconId: 'three',
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
    iconId: 'book',
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
    iconId: 'friend',
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
    iconId: 'home',
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
  {
    id: 'bread',
    category: 'family',
    iconId: 'bread',
    translations: {
      es: { word: 'Pan', phonetic: 'pan' },
      ca: { word: 'Pa', phonetic: 'pa' },
      en: { word: 'Bread', phonetic: 'bred' },
      nl: { word: 'Brood', phonetic: 'broot' },
      fr: { word: 'Pain', phonetic: 'pan' },
      ar: { word: 'خبز (Khubz)', phonetic: 'khubz' },
      rif: { word: 'Aɣrum', phonetic: 'agh-RUM' },
      zh: { word: '面包 (Miànbāo)', phonetic: 'mian-bao' },
    },
  },
];

export type KidsMascotId = 'fox' | 'dino' | 'bot' | 'cat';

export interface KidsMascotMeta {
  id: KidsMascotId;
  name: string;
  cheerEs: string;
  costStars: number;
}

export const KIDS_MASCOTS: KidsMascotMeta[] = [
  { id: 'fox', name: 'Zorri', cheerEs: 'Sigue así, campeón.', costStars: 0 },
  { id: 'dino', name: 'Dino', cheerEs: '¡Gran salto de aventura!', costStars: 15 },
  { id: 'bot', name: 'Robi', cheerEs: '¡Súper mente activa!', costStars: 25 },
  { id: 'cat', name: 'Michi', cheerEs: '¡A por otro reto!', costStars: 35 },
];

export type KidsAvatarId = 'fennec' | 'lion' | 'owl' | 'dolphin' | 'panda' | 'falcon';

export const KIDS_AVATAR_CHOICES: KidsAvatarId[] = [
  'fennec',
  'lion',
  'owl',
  'dolphin',
  'panda',
  'falcon',
];

export interface KidsBadgeMeta {
  id: string;
  iconId: string;
  label: string;
}

export const KIDS_BADGES: KidsBadgeMeta[] = [
  { id: 'explorador', iconId: 'compass', label: 'Explorador' },
  { id: 'cinefilo_kids', iconId: 'film', label: 'Cinéfilo' },
  { id: 'arcade_estrella', iconId: 'rocket', label: 'Estelar' },
  { id: 'simon_musical', iconId: 'bell', label: 'Simón' },
  { id: 'math_wizard', iconId: 'calc', label: 'Mago Mates' },
  { id: 'memory_master', iconId: 'brain', label: 'Súper Memoria' },
  { id: 'tarifit_friend', iconId: 'globe', label: '8 Idiomas' },
  { id: 'estrella_oro', iconId: 'star', label: 'Estrella Oro' },
  { id: 'genio_multilingue', iconId: 'trophy', label: 'Políglota' },
];

export interface KidsRewardItem {
  id: string;
  iconId: string;
  title: string;
  desc: string;
  cost: number;
}

export const KIDS_SHOP_ITEMS: KidsRewardItem[] = [
  {
    id: 'math_galaxy_theme',
    iconId: 'planets',
    title: 'Mates Galaxia',
    desc: 'Burbujas cósmicas brillantes en Mates',
    cost: 12,
  },
  {
    id: 'rocket_golden_skin',
    iconId: 'rocket',
    title: 'Nave Dorada',
    desc: 'Cohete estelar dorado en Atrapa Estrellas',
    cost: 15,
  },
  {
    id: 'confetti_rainbow',
    iconId: 'sparkles',
    title: 'Súper Confeti',
    desc: 'Lluvia mágica extra al ganar juegos',
    cost: 18,
  },
  {
    id: 'tarifit_crown_frame',
    iconId: 'crown',
    title: 'Marco Atlas',
    desc: 'Borde especial dorado para tu perfil',
    cost: 22,
  },
];

export const DEFAULT_PARENT_SAFE_SEEDS: CatalogMovie[] = [
  {
    id: 'yt-kids-pocoyo',
    mediaType: 'movie',
    title: 'Pocoyó en Español — Aventura Oficial',
    year: 'YouTube Kids',
    rating: '9.5',
    overview: 'Pocoyó Oficial',
    poster: '',
    backdrop: '',
    languages: ['ES'],
    genres: ['YouTube Kids'],
    platform: 'YouTube Kids',
    quality: 'HD',
    bingetrixUrl: 'bO0y0N2wS0U',
  },
  {
    id: 'yt-kids-bluey',
    mediaType: 'movie',
    title: 'Bluey — Juegos en Familia',
    year: 'YouTube Kids',
    rating: '9.6',
    overview: 'Bluey Oficial',
    poster: '',
    backdrop: '',
    languages: ['ES', 'EN'],
    genres: ['YouTube Kids'],
    platform: 'YouTube Kids',
    quality: 'HD',
    bingetrixUrl: 'W1yK9N5bM3Q',
  },
];

export interface KidsSavedStory {
  id: string;
  title: string;
  lang: KidsLanguageCode;
  chapters: string[];
  featuredWords: string[];
  createdAt: string;
}

export interface KidsPetCareState {
  energy: number;
  happiness: number;
  xp: number;
  level: number;
}

export interface KidsLearningAnalytics {
  date: string;
  learnMinutesToday: number;
  cinemaMinutesToday: number;
  domainCorrect: {
    lang: number;
    math: number;
    music: number;
    logic: number;
  };
  domainTotal: {
    lang: number;
    math: number;
    music: number;
    logic: number;
  };
  practicedWords: string[];
}

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
  earnCinemaByLearning?: boolean;
  earnedCinemaMinutes?: number;
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
  unlockedStickers?: string[];
  roomDecor?: string[];
  completedNodes?: Record<string, boolean>;
  placementDone?: boolean;
  petCare?: KidsPetCareState;
  savedStories?: KidsSavedStory[];
  analytics?: KidsLearningAnalytics;
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
const KIDS_PARENT_PIN_STORAGE_KEY = 'riffan_kids_parent_pin_v1';

export const KIDS_EXIT_PIN = '1122';

export function loadKidsParentPin(): string {
  if (typeof localStorage === 'undefined') return KIDS_EXIT_PIN;
  try {
    const raw = (localStorage.getItem(KIDS_PARENT_PIN_STORAGE_KEY) || '').trim();
    if (/^\d{4}$/.test(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return KIDS_EXIT_PIN;
}

export function saveKidsParentPin(pin: string): boolean {
  const clean = pin.trim();
  if (!/^\d{4}$/.test(clean)) return false;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(KIDS_PARENT_PIN_STORAGE_KEY, clean);
    } catch {
      return false;
    }
  }
  return true;
}

export function resetKidsParentPin(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(KIDS_PARENT_PIN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function isValidKidsExitPin(pin: string): boolean {
  return pin.trim() === loadKidsParentPin();
}

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

export function createFreshPetCare(): KidsPetCareState {
  return {
    energy: 80,
    happiness: 85,
    xp: 0,
    level: 1,
  };
}

export function createFreshAnalytics(date = getTodayIsoDate()): KidsLearningAnalytics {
  return {
    date,
    learnMinutesToday: 0,
    cinemaMinutesToday: 0,
    domainCorrect: { lang: 0, math: 0, music: 0, logic: 0 },
    domainTotal: { lang: 0, math: 0, music: 0, logic: 0 },
    practicedWords: [],
  };
}

export function createDefaultKidsProfile(
  overrides: Partial<KidsProgressState> = {}
): KidsProgressState {
  return {
    id: overrides.id || 'kid-1',
    name: overrides.name || 'Peque 1',
    avatarEmoji: overrides.avatarEmoji || 'fennec',
    stars: 12,
    streakDays: 1,
    completedLessons: 0,
    badges: ['explorador'],
    ageGroup: '6-8',
    preferredLang: 'es',
    mascotId: 'fox',
    unlockedRewards: [],
    unlockedStickers: ['stk-lion'],
    roomDecor: ['room-bookshelf'],
    completedNodes: {},
    placementDone: false,
    petCare: createFreshPetCare(),
    savedStories: [],
    analytics: createFreshAnalytics(),
    recentWatched: [],
    dailyMissions: createFreshDailyMissions(),
    parentPrefs: {
      lockedLang: null,
      lockedAge: null,
      timerMinutes: null,
      timerStartedAt: null,
      approvedOnlyMode: false,
      approvedItems: [],
      earnCinemaByLearning: false,
      earnedCinemaMinutes: 15,
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

  const rawAnalytics = raw.analytics;
  const analytics: KidsLearningAnalytics =
    rawAnalytics && rawAnalytics.date === today
      ? {
          date: today,
          learnMinutesToday: Number(rawAnalytics.learnMinutesToday || 0),
          cinemaMinutesToday: Number(rawAnalytics.cinemaMinutesToday || 0),
          domainCorrect: {
            lang: Number(rawAnalytics.domainCorrect?.lang || 0),
            math: Number(rawAnalytics.domainCorrect?.math || 0),
            music: Number(rawAnalytics.domainCorrect?.music || 0),
            logic: Number(rawAnalytics.domainCorrect?.logic || 0),
          },
          domainTotal: {
            lang: Number(rawAnalytics.domainTotal?.lang || 0),
            math: Number(rawAnalytics.domainTotal?.math || 0),
            music: Number(rawAnalytics.domainTotal?.music || 0),
            logic: Number(rawAnalytics.domainTotal?.logic || 0),
          },
          practicedWords: Array.isArray(rawAnalytics.practicedWords)
            ? rawAnalytics.practicedWords.slice(0, 30)
            : [],
        }
      : createFreshAnalytics(today);

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
    earnCinemaByLearning: Boolean(raw.parentPrefs?.earnCinemaByLearning),
    earnedCinemaMinutes:
      typeof raw.parentPrefs?.earnedCinemaMinutes === 'number'
        ? Math.max(0, raw.parentPrefs.earnedCinemaMinutes)
        : 15,
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
    unlockedStickers: Array.isArray(raw.unlockedStickers)
      ? raw.unlockedStickers
      : defaults.unlockedStickers,
    roomDecor: Array.isArray(raw.roomDecor) ? raw.roomDecor : defaults.roomDecor,
    completedNodes:
      raw.completedNodes && typeof raw.completedNodes === 'object'
        ? raw.completedNodes
        : {},
    placementDone: Boolean(raw.placementDone),
    petCare: raw.petCare
      ? {
          energy: Math.max(0, Math.min(100, Number(raw.petCare.energy ?? 80))),
          happiness: Math.max(0, Math.min(100, Number(raw.petCare.happiness ?? 85))),
          xp: Math.max(0, Number(raw.petCare.xp ?? 0)),
          level: Math.max(1, Number(raw.petCare.level ?? 1)),
        }
      : createFreshPetCare(),
    savedStories: Array.isArray(raw.savedStories) ? raw.savedStories.slice(0, 16) : [],
    analytics,
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
  avatarId: string,
  ageGroup: KidsAgeGroup
): { store: KidsProfilesStore; profile: KidsProgressState } {
  const cleanName = name.trim().slice(0, 18) || `Peque ${store.profiles.length + 1}`;
  const currentActive =
    store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0];
  const profile = createDefaultKidsProfile({
    id: `kid-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    name: cleanName,
    avatarEmoji: avatarId || 'lion',
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

export interface KidsLevelInfo {
  level: number;
  rankKey: 'explorer' | 'adventurer' | 'starMaster' | 'superGenius';
  starsIntoLevel: number;
  starsForNextLevel: number;
  progressPct: number;
}

export function getKidsLevelInfo(stars: number): KidsLevelInfo {
  const safeStars = Math.max(0, Math.floor(stars));
  if (safeStars < 20) {
    return {
      level: 1,
      rankKey: 'explorer',
      starsIntoLevel: safeStars,
      starsForNextLevel: 20,
      progressPct: Math.min(100, Math.round((safeStars / 20) * 100)),
    };
  }
  if (safeStars < 50) {
    const into = safeStars - 20;
    return {
      level: 2,
      rankKey: 'adventurer',
      starsIntoLevel: into,
      starsForNextLevel: 30,
      progressPct: Math.min(100, Math.round((into / 30) * 100)),
    };
  }
  if (safeStars < 100) {
    const into = safeStars - 50;
    return {
      level: 3,
      rankKey: 'starMaster',
      starsIntoLevel: into,
      starsForNextLevel: 50,
      progressPct: Math.min(100, Math.round((into / 50) * 100)),
    };
  }
  const into = (safeStars - 100) % 50;
  return {
    level: 4 + Math.floor((safeStars - 100) / 50),
    rankKey: 'superGenius',
    starsIntoLevel: into,
    starsForNextLevel: 50,
    progressPct: Math.min(100, Math.round((into / 50) * 100)),
  };
}

export type LeitnerBoxesMap = Record<string, 1 | 2 | 3>;

export function loadLeitnerBoxes(profileId = 'kid-1'): LeitnerBoxesMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`riffan_kids_leitner_v1_${profileId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: LeitnerBoxesMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 1 || v === 2 || v === 3) clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveLeitnerBoxes(boxes: LeitnerBoxesMap, profileId = 'kid-1'): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`riffan_kids_leitner_v1_${profileId}`, JSON.stringify(boxes));
  } catch {
    // ignore storage errors
  }
}

export function updateLeitnerBox(
  boxes: LeitnerBoxesMap,
  wordId: string,
  correct: boolean,
  profileId = 'kid-1'
): LeitnerBoxesMap {
  const prev = boxes[wordId] || 1;
  const nextLevel: 1 | 2 | 3 = correct
    ? prev === 1
      ? 2
      : 3
    : 1;
  const next: LeitnerBoxesMap = { ...boxes, [wordId]: nextLevel };
  saveLeitnerBoxes(next, profileId);
  return next;
}

export function pickLeitnerEntries(
  bank: KidsVocabEntry[],
  boxes: LeitnerBoxesMap,
  count: number
): KidsVocabEntry[] {
  return [...bank]
    .sort((a, b) => (boxes[a.id] || 1) - (boxes[b.id] || 1))
    .slice(0, Math.max(1, Math.min(bank.length, count)));
}
