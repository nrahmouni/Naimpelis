import type { KidsLanguageCode } from '../../types';
import type { KidsVocabCategory, KidsVocabEntry } from './kidsData';
import {
  EXTENDED_VOCAB_ITEMS_PART1,
  type ExtendedVocabCategory,
  type ExtendedVocabItem,
} from './kidsCurriculumVocab';
import {
  EXTENDED_VOCAB_ITEMS_PART2,
  KIDS_SENTENCE_BANK,
  type KidsSentenceExercise,
} from './kidsCurriculumSentences';

export type { ExtendedVocabCategory, ExtendedVocabItem, KidsSentenceExercise };
export { KIDS_SENTENCE_BANK };

/**
 * Rich 8-language everyday vocabulary bank (60 concepts) expanding the core 18 words.
 * Authentic everyday Riffian Tarifit (Nador / Al Hoceima), Modern Kid-Friendly Arabic,
 * Mandarin Chinese with Pinyin, Spanish, Catalan, English, Vlaams, and French.
 */
export const EXTENDED_VOCAB_ITEMS: ExtendedVocabItem[] = [
  ...EXTENDED_VOCAB_ITEMS_PART1,
  ...EXTENDED_VOCAB_ITEMS_PART2,
];

export interface KidsIslandUnit {
  id: string;
  order: number;
  iconId: string;
  accentHex: string;
  titleByLang: Record<'es' | 'en' | 'fr' | 'ar' | 'ca' | 'nl' | 'rif' | 'zh', string>;
  vocabIds: string[];
  nodes: Array<{
    id: string;
    kind: 'vocab' | 'phonics' | 'sentence' | 'boss';
    labelEs: string;
    rewardStars: number;
  }>;
}

/**
 * 6 progressive curriculum islands (4 structured steps each = 24 structured path nodes).
 */
export const KIDS_LEARNING_ISLANDS: KidsIslandUnit[] = [
  {
    id: 'island-family',
    order: 1,
    iconId: 'home',
    accentHex: '#F59E0B',
    titleByLang: {
      es: '1. Hogar y Familia',
      ca: '1. Llar i Família',
      en: '1. Home & Family',
      nl: '1. Thuis & Familie',
      fr: '1. Maison & Famille',
      ar: '1. البيت والعائلة',
      rif: '1. Taddart d Lɛayla',
      zh: '1. 家与家人',
    },
    vocabIds: ['mother', 'father', 'home', 'friend', 'book'],
    nodes: [
      { id: 'family-vocab', kind: 'vocab', labelEs: 'Palabras del hogar', rewardStars: 3 },
      { id: 'family-phonics', kind: 'phonics', labelEs: 'Sílabas y sonidos', rewardStars: 3 },
      { id: 'family-sentence', kind: 'sentence', labelEs: 'Construye la frase', rewardStars: 4 },
      { id: 'family-boss', kind: 'boss', labelEs: 'Reto de la Isla 1', rewardStars: 6 },
    ],
  },
  {
    id: 'island-animals',
    order: 2,
    iconId: 'lion',
    accentHex: '#EC4899',
    titleByLang: {
      es: '2. Mundo Animal',
      ca: '2. Món Animal',
      en: '2. Animal Kingdom',
      nl: '2. Dierenrijk',
      fr: '2. Monde Animal',
      ar: '2. عالم الحيوانات',
      rif: '2. Lḥayawanat',
      zh: '2. 动物世界',
    },
    vocabIds: ['cat', 'dog', 'bird', 'fish', 'lion'],
    nodes: [
      { id: 'animals-vocab', kind: 'vocab', labelEs: 'Animales amigos', rewardStars: 3 },
      { id: 'animals-phonics', kind: 'phonics', labelEs: 'Oído y sonidos', rewardStars: 3 },
      { id: 'animals-sentence', kind: 'sentence', labelEs: 'Frases vivas', rewardStars: 4 },
      { id: 'animals-boss', kind: 'boss', labelEs: 'Reto de la Isla 2', rewardStars: 6 },
    ],
  },
  {
    id: 'island-food',
    order: 3,
    iconId: 'apple',
    accentHex: '#10B981',
    titleByLang: {
      es: '3. Mesa y Frutas',
      ca: '3. Taula i Fruita',
      en: '3. Kitchen & Food',
      nl: '3. Keuken & Eten',
      fr: '3. Cuisine & Fruits',
      ar: '3. المائدة والفواكه',
      rif: '3. Lmakla d Lfakya',
      zh: '3. 美食与水果',
    },
    vocabIds: ['apple', 'bread', 'milk', 'honey', 'tea', 'orange_fruit'],
    nodes: [
      { id: 'food-vocab', kind: 'vocab', labelEs: 'En la cocina', rewardStars: 3 },
      { id: 'food-phonics', kind: 'phonics', labelEs: 'Sílabas ricas', rewardStars: 3 },
      { id: 'food-sentence', kind: 'sentence', labelEs: 'Pedir comida', rewardStars: 4 },
      { id: 'food-boss', kind: 'boss', labelEs: 'Reto de la Isla 3', rewardStars: 6 },
    ],
  },
  {
    id: 'island-colors',
    order: 4,
    iconId: 'flower',
    accentHex: '#38BDF8',
    titleByLang: {
      es: '4. Colores y Números',
      ca: '4. Colors i Números',
      en: '4. Colors & Numbers',
      nl: '4. Kleuren & Cijfers',
      fr: '4. Couleurs & Nombres',
      ar: '4. الألوان والأرقام',
      rif: '4. Lwan d Leḥsab',
      zh: '4. 颜色与数字',
    },
    vocabIds: ['red', 'blue', 'yellow', 'green', 'white', 'one', 'two', 'three', 'four', 'five'],
    nodes: [
      { id: 'colors-vocab', kind: 'vocab', labelEs: 'Colores del arcoíris', rewardStars: 3 },
      { id: 'colors-phonics', kind: 'phonics', labelEs: 'Contar y pronunciar', rewardStars: 3 },
      { id: 'colors-sentence', kind: 'sentence', labelEs: 'Frases con color', rewardStars: 4 },
      { id: 'colors-boss', kind: 'boss', labelEs: 'Reto de la Isla 4', rewardStars: 6 },
    ],
  },
  {
    id: 'island-nature',
    order: 5,
    iconId: 'mountain',
    accentHex: '#8B5CF6',
    titleByLang: {
      es: '5. Naturaleza y Cielo',
      ca: '5. Natura i Cel',
      en: '5. Nature & Sky',
      nl: '5. Natuur & Hemel',
      fr: '5. Nature & Ciel',
      ar: '5. الطبيعة والسماء',
      rif: '5. Ttebiɛa d Ujenna',
      zh: '5. 自然与星空',
    },
    vocabIds: ['sun', 'moon', 'star', 'water', 'mountain', 'tree', 'flower', 'sea'],
    nodes: [
      { id: 'nature-vocab', kind: 'vocab', labelEs: 'Montaña y mar', rewardStars: 3 },
      { id: 'nature-phonics', kind: 'phonics', labelEs: 'Sonidos del cielo', rewardStars: 3 },
      { id: 'nature-sentence', kind: 'sentence', labelEs: 'Historias de campo', rewardStars: 4 },
      { id: 'nature-boss', kind: 'boss', labelEs: 'Reto de la Isla 5', rewardStars: 6 },
    ],
  },
  {
    id: 'island-actions',
    order: 6,
    iconId: 'action_play',
    accentHex: '#F97316',
    titleByLang: {
      es: '6. Cuerpo y Acciones',
      ca: '6. Cos i Accions',
      en: '6. Body & Actions',
      nl: '6. Lichaam & Acties',
      fr: '6. Corps & Actions',
      ar: '6. الجسم والأفعال',
      rif: '6. Lfɛayel d Ddat',
      zh: '6. 身体与动作',
    },
    vocabIds: ['hand', 'eye', 'heart', 'run', 'eat', 'drink', 'read', 'play_verb', 'sleep'],
    nodes: [
      { id: 'actions-vocab', kind: 'vocab', labelEs: 'Verbos diarios', rewardStars: 3 },
      { id: 'actions-phonics', kind: 'phonics', labelEs: 'Pares mínimos', rewardStars: 4 },
      { id: 'actions-sentence', kind: 'sentence', labelEs: 'Diálogo en acción', rewardStars: 4 },
      { id: 'actions-boss', kind: 'boss', labelEs: 'Gran Maestro', rewardStars: 8 },
    ],
  },
];

export interface PhonicsBlendDrill {
  id: string;
  lang: KidsLanguageCode;
  leftPart: string;
  rightPart: string;
  combined: string;
  meaningEs: string;
  iconId: string;
  tip: string;
}

export const KIDS_PHONICS_DRILLS: PhonicsBlendDrill[] = [
  { id: 'ph-es-1', lang: 'es', leftPart: 'GA', rightPart: 'TO', combined: 'Gato', meaningEs: 'Animal doméstico', iconId: 'cat', tip: 'Une ga + to suavemente' },
  { id: 'ph-es-2', lang: 'es', leftPart: 'LU', rightPart: 'NA', combined: 'Luna', meaningEs: 'Brilla de noche', iconId: 'moon', tip: 'lu + na con sonido largo' },
  { id: 'ph-en-1', lang: 'en', leftPart: 'S', rightPart: 'UN', combined: 'Sun', meaningEs: 'Sol', iconId: 'sun', tip: 'Suena "san", no "sun"' },
  { id: 'ph-en-2', lang: 'en', leftPart: 'B', rightPart: 'OOK', combined: 'Book', meaningEs: 'Libro', iconId: 'book', tip: 'Doble oo corta: "buk"' },
  { id: 'ph-fr-1', lang: 'fr', leftPart: 'CH', rightPart: 'AT', combined: 'Chat', meaningEs: 'Gato', iconId: 'cat', tip: 'La T final es muda: "sha"' },
  { id: 'ph-fr-2', lang: 'fr', leftPart: 'L', rightPart: 'UNE', combined: 'Lune', meaningEs: 'Luna', iconId: 'moon', tip: 'U francesa con labios redondeados' },
  { id: 'ph-rif-1', lang: 'rif', leftPart: 'A', rightPart: 'MAN', combined: 'Aman', meaningEs: 'Agua', iconId: 'water', tip: 'A-man claro y natural' },
  { id: 'ph-rif-2', lang: 'rif', leftPart: 'A', rightPart: 'MUCC', combined: 'Amucc', meaningEs: 'Gato', iconId: 'cat', tip: 'cc suena fuerte como "ch"' },
  { id: 'ph-rif-3', lang: 'rif', leftPart: 'T', rightPart: 'FUCT', combined: 'Tfuct', meaningEs: 'Sol', iconId: 'sun', tip: 'c = sonido "ch": t-fucht' },
  { id: 'ph-ar-1', lang: 'ar', leftPart: 'قـ', rightPart: 'مَر', combined: 'قمر', meaningEs: 'Luna (Qamar)', iconId: 'moon', tip: 'Empieza con ق (Qaf) desde la garganta' },
  { id: 'ph-ar-2', lang: 'ar', leftPart: 'شَـ', rightPart: 'مـس', combined: 'شمس', meaningEs: 'Sol (Shams)', iconId: 'sun', tip: 'ش suena como "sh"' },
  { id: 'ph-zh-1', lang: 'zh', leftPart: 'MĀO', rightPart: '猫', combined: '猫 (Māo)', meaningEs: 'Gato', iconId: 'cat', tip: 'Primer tono alto y plano' },
  { id: 'ph-ca-1', lang: 'ca', leftPart: 'LLE', rightPart: 'Ó', combined: 'Lleó', meaningEs: 'León', iconId: 'lion', tip: 'Ll inicial suave palatal' },
  { id: 'ph-nl-1', lang: 'nl', leftPart: 'Z', rightPart: 'ON', combined: 'Zon', meaningEs: 'Sol', iconId: 'sun', tip: 'Z vibrante al principio' },
];

export interface MinimalAcousticPair {
  id: string;
  lang: KidsLanguageCode;
  wordA: string;
  phoneticA: string;
  wordB: string;
  phoneticB: string;
  contrastNote: string;
}

export const KIDS_MINIMAL_PAIRS: MinimalAcousticPair[] = [
  { id: 'mp-en-1', lang: 'en', wordA: 'Cat', phoneticA: '/kæt/', wordB: 'Hat', phoneticB: '/hæt/', contrastNote: 'Sonido C fuerte vs H suave' },
  { id: 'mp-en-2', lang: 'en', wordA: 'Tree', phoneticA: '/triː/', wordB: 'Three', phoneticB: '/θriː/', contrastNote: 'T seca vs TH interdental' },
  { id: 'mp-rif-1', lang: 'rif', wordA: 'Aɣrum', phoneticA: 'Pan (ɣ suave)', wordB: 'Aqzin', phoneticB: 'Perro (q profunda)', contrastNote: 'Distingue ɣ (gh) de q gutural' },
  { id: 'mp-ar-1', lang: 'ar', wordA: 'قلم', phoneticA: 'Qalam (pluma)', wordB: 'كلب', phoneticB: 'Kalb (perro)', contrastNote: 'ق profunda vs ك frontal' },
  { id: 'mp-zh-1', lang: 'zh', wordA: '书', phoneticA: 'Shū (libro · tono 1)', wordB: '树', phoneticB: 'Shù (árbol · tono 4)', contrastNote: 'Tono plano alto vs tono descendente' },
  { id: 'mp-fr-1', lang: 'fr', wordA: 'Pain', phoneticA: '/pɛ̃/ (pan)', wordB: 'Lune', phoneticB: '/lyn/ (luna)', contrastNote: 'Vocal nasal /ɛ̃/ vs /y/' },
  { id: 'mp-es-1', lang: 'es', wordA: 'Perro', phoneticA: 'PE-rro', wordB: 'Casa', phoneticB: 'CA-sa', contrastNote: 'R fuerte vibrante vs S suave' },
  { id: 'mp-ca-1', lang: 'ca', wordA: 'Pa', phoneticA: 'pa (pan)', wordB: 'Peix', phoneticB: 'peix (pez)', contrastNote: 'A abierta vs diptongo ei+x' },
  { id: 'mp-nl-1', lang: 'nl', wordA: 'Kat', phoneticA: 'kat', wordB: 'Hond', phoneticB: 'jont', contrastNote: 'Vocal corta A vs O' },
];

export interface TracingGlyphMeta {
  id: string;
  glyph: string;
  scriptTag: 'Latin' | 'Arabe' | 'Hanzi' | 'Numero';
  label: string;
  spoken: string;
  lang: KidsLanguageCode;
  guideStrokes: string[];
}

export const KIDS_TRACING_GLYPHS: TracingGlyphMeta[] = [
  { id: 'tr-a', glyph: 'A', scriptTag: 'Latin', label: 'A de Agua / Aman', spoken: 'A, Aman', lang: 'es', guideStrokes: ['M 50 18 L 22 84', 'M 50 18 L 78 84', 'M 32 58 L 68 58'] },
  { id: 'tr-b', glyph: 'B', scriptTag: 'Latin', label: 'B de Book / Baba', spoken: 'B, Baba', lang: 'en', guideStrokes: ['M 30 18 L 30 84', 'M 30 18 C 72 18 72 50 30 50', 'M 30 50 C 76 50 76 84 30 84'] },
  { id: 'tr-s', glyph: 'S', scriptTag: 'Latin', label: 'S de Sol / Sun', spoken: 'S, Sol', lang: 'es', guideStrokes: ['M 70 24 C 24 12 24 48 50 50 C 76 52 76 88 28 78'] },
  { id: 'tr-m', glyph: 'M', scriptTag: 'Latin', label: 'M de Mamá / Montaña', spoken: 'M, Mamá', lang: 'es', guideStrokes: ['M 20 84 L 24 20 L 50 56 L 76 20 L 80 84'] },
  { id: 'tr-1', glyph: '1', scriptTag: 'Numero', label: '1 · Uno / Ijjen', spoken: 'Uno', lang: 'es', guideStrokes: ['M 36 32 L 54 18 L 54 84'] },
  { id: 'tr-3', glyph: '3', scriptTag: 'Numero', label: '3 · Tres / Tlata', spoken: 'Tres', lang: 'es', guideStrokes: ['M 30 26 C 72 14 74 48 44 50 C 76 52 74 88 28 78'] },
  { id: 'tr-ar-alif', glyph: 'أ', scriptTag: 'Arabe', label: 'أ · Alif (أمي / أسد)', spoken: 'ألف، أسد', lang: 'ar', guideStrokes: ['M 50 28 L 50 84', 'M 60 14 C 42 14 44 24 62 24'] },
  { id: 'tr-ar-ba', glyph: 'ب', scriptTag: 'Arabe', label: 'ب · Ba (بيت / باب)', spoken: 'باء، بيت', lang: 'ar', guideStrokes: ['M 82 44 C 82 72 18 72 18 44', 'M 50 82 L 50 84'] },
  { id: 'tr-ar-mim', glyph: 'م', scriptTag: 'Arabe', label: 'م · Mim (ماء)', spoken: 'ميم، ماء', lang: 'ar', guideStrokes: ['M 68 42 C 56 28 42 42 54 54 L 32 54 L 32 84'] },
  { id: 'tr-zh-san', glyph: '山', scriptTag: 'Hanzi', label: '山 · Shān (Montaña)', spoken: '山', lang: 'zh', guideStrokes: ['M 50 18 L 50 78', 'M 24 38 L 24 78 L 78 78', 'M 78 36 L 78 82'] },
  { id: 'tr-zh-shui', glyph: '水', scriptTag: 'Hanzi', label: '水 · Shuǐ (Agua)', spoken: '水', lang: 'zh', guideStrokes: ['M 50 16 L 50 84', 'M 20 44 L 40 44 L 22 74', 'M 76 34 L 54 52 L 80 78'] },
  { id: 'tr-zh-yi', glyph: '一', scriptTag: 'Hanzi', label: '一 · Yī (Uno)', spoken: '一', lang: 'zh', guideStrokes: ['M 18 52 L 82 52'] },
];

export interface InteractiveSceneSpec {
  id: 'kitchen' | 'forest' | 'space';
  titleEs: string;
  bgGradient: string;
  hotspots: Array<{
    vocabId: string;
    xPct: number;
    yPct: number;
    iconId: string;
  }>;
}

export const KIDS_EXPLORE_SCENES: InteractiveSceneSpec[] = [
  {
    id: 'kitchen',
    titleEs: 'La Cocina Viva',
    bgGradient: 'from-amber-950/80 via-[#1E293B] to-[#0F172A]',
    hotspots: [
      { vocabId: 'bread', xPct: 22, yPct: 58, iconId: 'bread' },
      { vocabId: 'apple', xPct: 45, yPct: 48, iconId: 'apple' },
      { vocabId: 'milk', xPct: 72, yPct: 52, iconId: 'milk' },
      { vocabId: 'water', xPct: 86, yPct: 68, iconId: 'water' },
      { vocabId: 'tea', xPct: 33, yPct: 74, iconId: 'tea' },
      { vocabId: 'honey', xPct: 58, yPct: 72, iconId: 'honey' },
    ],
  },
  {
    id: 'forest',
    titleEs: 'Bosque y Naturaleza',
    bgGradient: 'from-emerald-950/85 via-[#064E3B] to-[#0B1726]',
    hotspots: [
      { vocabId: 'tree', xPct: 20, yPct: 42, iconId: 'tree' },
      { vocabId: 'bird', xPct: 36, yPct: 24, iconId: 'bird' },
      { vocabId: 'lion', xPct: 64, yPct: 68, iconId: 'lion' },
      { vocabId: 'flower', xPct: 34, yPct: 78, iconId: 'flower' },
      { vocabId: 'mountain', xPct: 78, yPct: 32, iconId: 'mountain' },
      { vocabId: 'sun', xPct: 54, yPct: 16, iconId: 'sun' },
    ],
  },
  {
    id: 'space',
    titleEs: 'Noche Estelar y Hogar',
    bgGradient: 'from-indigo-950 via-[#1E1B4B] to-[#090D24]',
    hotspots: [
      { vocabId: 'moon', xPct: 24, yPct: 22, iconId: 'moon' },
      { vocabId: 'star', xPct: 74, yPct: 22, iconId: 'star' },
      { vocabId: 'home', xPct: 48, yPct: 66, iconId: 'home' },
      { vocabId: 'cat', xPct: 24, yPct: 72, iconId: 'cat' },
      { vocabId: 'dog', xPct: 76, yPct: 72, iconId: 'dog' },
      { vocabId: 'book', xPct: 50, yPct: 40, iconId: 'book' },
    ],
  },
];

export interface KidsStickerItem {
  id: string;
  album: 'Atlas' | 'Cosmos' | 'Sabores' | 'Música';
  vocabId: string;
  iconId: string;
  titleEs: string;
  factEs: string;
  costStars: number;
}

export const KIDS_STICKER_ALBUM: KidsStickerItem[] = [
  { id: 'stk-lion', album: 'Atlas', vocabId: 'lion', iconId: 'lion', titleEs: 'León del Atlas', factEs: 'En Tarifit se llama Ayrad y su rugido se oye a 8 km.', costStars: 5 },
  { id: 'stk-cat', album: 'Atlas', vocabId: 'cat', iconId: 'cat', titleEs: 'Gato Curioso', factEs: 'Los gatos duermen más de 12 horas para ahorrar energía.', costStars: 4 },
  { id: 'stk-bird', album: 'Atlas', vocabId: 'bird', iconId: 'bird', titleEs: 'Pájaro Cantor', factEs: 'Las aves usan el sol y las estrellas como brújula al viajar.', costStars: 4 },
  { id: 'stk-fish', album: 'Atlas', vocabId: 'fish', iconId: 'fish', titleEs: 'Pez del Arrecife', factEs: 'Respiran por branquias y ayudan a mantener limpios los corales.', costStars: 4 },
  { id: 'stk-sun', album: 'Cosmos', vocabId: 'sun', iconId: 'sun', titleEs: 'Estrella Solar', factEs: 'La luz del Sol tarda 8 minutos en llegar a tu ventana.', costStars: 5 },
  { id: 'stk-moon', album: 'Cosmos', vocabId: 'moon', iconId: 'moon', titleEs: 'Luna Llena', factEs: 'La gravedad de la Luna mueve las mareas de todos los océanos.', costStars: 5 },
  { id: 'stk-star', album: 'Cosmos', vocabId: 'star', iconId: 'star', titleEs: 'Estrella Polar', factEs: 'Las estrellas nacen dentro de nubes gigantes de polvo cósmico.', costStars: 6 },
  { id: 'stk-mountain', album: 'Cosmos', vocabId: 'mountain', iconId: 'mountain', titleEs: 'Pico del Rif', factEs: 'Las montañas atrapan las nubes para crear ríos de agua dulce.', costStars: 6 },
  { id: 'stk-bread', album: 'Sabores', vocabId: 'bread', iconId: 'bread', titleEs: 'Pan Recién Hecho', factEs: 'Aɣrum en Tarifit: se hornea desde hace miles de años.', costStars: 4 },
  { id: 'stk-honey', album: 'Sabores', vocabId: 'honey', iconId: 'honey', titleEs: 'Miel Pura', factEs: 'Las abejas visitan miles de flores para llenar un solo tarro.', costStars: 5 },
  { id: 'stk-apple', album: 'Sabores', vocabId: 'apple', iconId: 'apple', titleEs: 'Manzana Roja', factEs: 'Flota en el agua porque un 25% de su interior es aire.', costStars: 4 },
  { id: 'stk-tea', album: 'Sabores', vocabId: 'tea', iconId: 'tea', titleEs: 'Té Hospitalario', factEs: 'En Marruecos y China servir té es símbolo de amistad.', costStars: 5 },
  { id: 'stk-book', album: 'Música', vocabId: 'book', iconId: 'book', titleEs: 'Libro Viajero', factEs: 'Leer 15 minutos al día multiplica tu vocabulario por 3.', costStars: 5 },
  { id: 'stk-heart', album: 'Música', vocabId: 'heart', iconId: 'heart_shape', titleEs: 'Corazón Valiente', factEs: 'Tu corazón late más de 100.000 veces cada día sin parar.', costStars: 6 },
  { id: 'stk-flower', album: 'Música', vocabId: 'flower', iconId: 'flower', titleEs: 'Flor del Jardín', factEs: 'Los girasoles siguen lentamente al Sol durante todo el día.', costStars: 4 },
  { id: 'stk-sea', album: 'Música', vocabId: 'sea', iconId: 'sea', titleEs: 'Ola Azul', factEs: 'El océano produce más de la mitad del oxígeno que respiramos.', costStars: 6 },
];

export interface KidsPetTreat {
  id: string;
  label: string;
  costStars: number;
  energyGain: number;
  happyGain: number;
  xpGain: number;
  iconId: string;
}

export const KIDS_PET_TREATS: KidsPetTreat[] = [
  { id: 'treat-apple', label: 'Manzana Fresca', costStars: 2, energyGain: 20, happyGain: 15, xpGain: 12, iconId: 'apple' },
  { id: 'treat-honey', label: 'Pan con Miel', costStars: 4, energyGain: 35, happyGain: 28, xpGain: 22, iconId: 'honey' },
  { id: 'treat-play', label: 'Juego de Pelota', costStars: 3, energyGain: -8, happyGain: 40, xpGain: 25, iconId: 'action_play' },
  { id: 'treat-story', label: 'Lectura Juntos', costStars: 3, energyGain: 15, happyGain: 32, xpGain: 30, iconId: 'book' },
];

export interface KidsRoomDecorItem {
  id: string;
  title: string;
  factEs: string;
  vocabId: string;
  costStars: number;
  iconId: string;
}

export const KIDS_ROOM_DECOR_ITEMS: KidsRoomDecorItem[] = [
  { id: 'room-globe', title: 'Telescopio Estelar', factEs: 'Con un telescopio puedes ver los cráteres de la Luna.', vocabId: 'moon', costStars: 8, iconId: 'star' },
  { id: 'room-plant', title: 'Árbol Bonsai', factEs: 'Un árbol joven limpia el aire mientras creces tú.', vocabId: 'tree', costStars: 7, iconId: 'tree' },
  { id: 'room-bookshelf', title: 'Estantería de Cuentos', factEs: 'Cada libro abre un mundo nuevo en 8 idiomas.', vocabId: 'book', costStars: 9, iconId: 'book' },
  { id: 'room-aquarium', title: 'Acuario Coral', factEs: 'Los peces payaso viven protegidos dentro de anémonas.', vocabId: 'fish', costStars: 10, iconId: 'fish' },
];

export function findExtendedVocabEntry(id: string): KidsVocabEntry {
  const found = EXTENDED_VOCAB_ITEMS.find((v) => v.id === id) || EXTENDED_VOCAB_ITEMS[0];
  return {
    id: found.id,
    category: (found.category as KidsVocabCategory) || 'animals',
    iconId: found.iconId,
    translations: found.translations,
  };
}
