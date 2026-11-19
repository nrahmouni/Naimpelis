import type { CatalogMovie, KidsLanguageCode } from '../../types';
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

export * from './kidsProfileStorage';
export * from './kidsProgressHelpers';
