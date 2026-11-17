import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { KIDS_VOCAB_BANK, type KidsVocabCategory, type KidsVocabEntry } from './kidsData';

export type ExtendedVocabCategory =
  | KidsVocabCategory
  | 'food'
  | 'colors'
  | 'body'
  | 'actions';

export interface ExtendedVocabItem {
  id: string;
  category: ExtendedVocabCategory;
  iconId: string;
  minAge: KidsAgeGroup;
  translations: Record<KidsLanguageCode, { word: string; phonetic: string }>;
}

/**
 * Rich 8-language everyday vocabulary bank (60 concepts) expanding the core 18 words.
 * Authentic everyday Riffian Tarifit (Nador / Al Hoceima), Modern Kid-Friendly Arabic,
 * Mandarin Chinese with Pinyin, Spanish, Catalan, English, Vlaams, and French.
 */
export const EXTENDED_VOCAB_ITEMS: ExtendedVocabItem[] = [
  ...KIDS_VOCAB_BANK.map((v) => ({
    id: v.id,
    category: v.category as ExtendedVocabCategory,
    iconId: v.iconId,
    minAge: '3-5' as KidsAgeGroup,
    translations: v.translations,
  })),
  {
    id: 'apple',
    category: 'food',
    iconId: 'apple',
    minAge: '3-5',
    translations: {
      es: { word: 'Manzana', phonetic: 'man-ZA-na' },
      ca: { word: 'Poma', phonetic: 'PO-ma' },
      en: { word: 'Apple', phonetic: 'AP-el' },
      nl: { word: 'Appel', phonetic: 'AP-el' },
      fr: { word: 'Pomme', phonetic: 'pom' },
      ar: { word: 'تفاحة (Tuffāḥa)', phonetic: 'tuf-FA-ha' },
      rif: { word: 'Tatteffaḥt', phonetic: 'tat-tef-FAHT' },
      zh: { word: '苹果 (Píngguǒ)', phonetic: 'ping-guo' },
    },
  },
  {
    id: 'milk',
    category: 'food',
    iconId: 'milk',
    minAge: '3-5',
    translations: {
      es: { word: 'Leche', phonetic: 'LE-che' },
      ca: { word: 'Llet', phonetic: 'llet' },
      en: { word: 'Milk', phonetic: 'milk' },
      nl: { word: 'Melk', phonetic: 'melk' },
      fr: { word: 'Lait', phonetic: 'le' },
      ar: { word: 'حليب (Ḥalīb)', phonetic: 'ha-LIB' },
      rif: { word: 'Ayefki', phonetic: 'a-yef-KI' },
      zh: { word: '牛奶 (Niúnǎi)', phonetic: 'niu-nai' },
    },
  },
  {
    id: 'honey',
    category: 'food',
    iconId: 'honey',
    minAge: '6-8',
    translations: {
      es: { word: 'Miel', phonetic: 'miel' },
      ca: { word: 'Mel', phonetic: 'mel' },
      en: { word: 'Honey', phonetic: 'JA-ni' },
      nl: { word: 'Honing', phonetic: 'HO-ning' },
      fr: { word: 'Miel', phonetic: 'myel' },
      ar: { word: 'عسل (ʻAsal)', phonetic: 'A-sal' },
      rif: { word: 'Tament', phonetic: 'ta-MENT' },
      zh: { word: '蜂蜜 (Fēngmì)', phonetic: 'feng-mi' },
    },
  },
  {
    id: 'tea',
    category: 'food',
    iconId: 'tea',
    minAge: '6-8',
    translations: {
      es: { word: 'Té', phonetic: 'te' },
      ca: { word: 'Te', phonetic: 'te' },
      en: { word: 'Tea', phonetic: 'ti' },
      nl: { word: 'Thee', phonetic: 'te' },
      fr: { word: 'Thé', phonetic: 'te' },
      ar: { word: 'شاي (Shāy)', phonetic: 'shay' },
      rif: { word: 'Atay', phonetic: 'a-TAY' },
      zh: { word: '茶 (Chá)', phonetic: 'cha' },
    },
  },
  {
    id: 'orange_fruit',
    category: 'food',
    iconId: 'orange_fruit',
    minAge: '3-5',
    translations: {
      es: { word: 'Naranja', phonetic: 'na-RAN-ja' },
      ca: { word: 'Taronja', phonetic: 'ta-RON-ja' },
      en: { word: 'Orange', phonetic: 'O-rinj' },
      nl: { word: 'Sinaasappel', phonetic: 'SI-nas-a-pel' },
      fr: { word: 'Orange', phonetic: 'o-RANJ' },
      ar: { word: 'برتقالة (Burtuqāla)', phonetic: 'bur-tu-QA-la' },
      rif: { word: 'Taccint', phonetic: 'tach-CHINT' },
      zh: { word: '橙子 (Chéngzi)', phonetic: 'cheng-zi' },
    },
  },
  {
    id: 'red',
    category: 'colors',
    iconId: 'color_red',
    minAge: '3-5',
    translations: {
      es: { word: 'Rojo', phonetic: 'RO-jo' },
      ca: { word: 'Vermell', phonetic: 'ver-MELL' },
      en: { word: 'Red', phonetic: 'red' },
      nl: { word: 'Rood', phonetic: 'root' },
      fr: { word: 'Rouge', phonetic: 'ruj' },
      ar: { word: 'أحمر (Aḥmar)', phonetic: 'AH-mar' },
      rif: { word: 'Azeggaɣ', phonetic: 'a-zeg-GAGH' },
      zh: { word: '红色 (Hóngsè)', phonetic: 'hong-se' },
    },
  },
  {
    id: 'blue',
    category: 'colors',
    iconId: 'color_blue',
    minAge: '3-5',
    translations: {
      es: { word: 'Azul', phonetic: 'a-ZUL' },
      ca: { word: 'Blau', phonetic: 'blau' },
      en: { word: 'Blue', phonetic: 'blu' },
      nl: { word: 'Blauw', phonetic: 'blau' },
      fr: { word: 'Bleu', phonetic: 'bleu' },
      ar: { word: 'أزرق (Azraq)', phonetic: 'AZ-raq' },
      rif: { word: 'Azegza', phonetic: 'a-zeg-ZA' },
      zh: { word: '蓝色 (Lánsè)', phonetic: 'lan-se' },
    },
  },
  {
    id: 'yellow',
    category: 'colors',
    iconId: 'color_yellow',
    minAge: '3-5',
    translations: {
      es: { word: 'Amarillo', phonetic: 'a-ma-RI-llo' },
      ca: { word: 'Groc', phonetic: 'groc' },
      en: { word: 'Yellow', phonetic: 'YE-lou' },
      nl: { word: 'Geel', phonetic: 'jeel' },
      fr: { word: 'Jaune', phonetic: 'jon' },
      ar: { word: 'أصفر (Aṣfar)', phonetic: 'AS-far' },
      rif: { word: 'Awraɣ', phonetic: 'aw-RAGH' },
      zh: { word: '黄色 (Huángsè)', phonetic: 'huang-se' },
    },
  },
  {
    id: 'green',
    category: 'colors',
    iconId: 'color_green',
    minAge: '3-5',
    translations: {
      es: { word: 'Verde', phonetic: 'VER-de' },
      ca: { word: 'Verd', phonetic: 'verd' },
      en: { word: 'Green', phonetic: 'grin' },
      nl: { word: 'Groen', phonetic: 'grun' },
      fr: { word: 'Vert', phonetic: 'ver' },
      ar: { word: 'أخضر (Akhḍar)', phonetic: 'AKH-dar' },
      rif: { word: 'Azegza n ttejra', phonetic: 'a-zeg-ZA' },
      zh: { word: '绿色 (Lǜsè)', phonetic: 'lyu-se' },
    },
  },
  {
    id: 'white',
    category: 'colors',
    iconId: 'color_white',
    minAge: '3-5',
    translations: {
      es: { word: 'Blanco', phonetic: 'BLAN-co' },
      ca: { word: 'Blanc', phonetic: 'blanc' },
      en: { word: 'White', phonetic: 'wait' },
      nl: { word: 'Wit', phonetic: 'wit' },
      fr: { word: 'Blanc', phonetic: 'blan' },
      ar: { word: 'أبيض (Abyaḍ)', phonetic: 'AB-yad' },
      rif: { word: 'Amellal', phonetic: 'a-mel-LAL' },
      zh: { word: '白色 (Báisè)', phonetic: 'bai-se' },
    },
  },
  {
    id: 'mother',
    category: 'family',
    iconId: 'mother',
    minAge: '3-5',
    translations: {
      es: { word: 'Mamá', phonetic: 'ma-MÁ' },
      ca: { word: 'Mama', phonetic: 'ma-MA' },
      en: { word: 'Mom', phonetic: 'mam' },
      nl: { word: 'Mama', phonetic: 'MA-ma' },
      fr: { word: 'Maman', phonetic: 'ma-MAN' },
      ar: { word: 'أمي (Ummī)', phonetic: 'UM-mi' },
      rif: { word: 'Yemma', phonetic: 'YEM-ma' },
      zh: { word: '妈妈 (Māma)', phonetic: 'ma-ma' },
    },
  },
  {
    id: 'father',
    category: 'family',
    iconId: 'father',
    minAge: '3-5',
    translations: {
      es: { word: 'Papá', phonetic: 'pa-PÁ' },
      ca: { word: 'Papa', phonetic: 'pa-PA' },
      en: { word: 'Dad', phonetic: 'dad' },
      nl: { word: 'Papa', phonetic: 'PA-pa' },
      fr: { word: 'Papa', phonetic: 'pa-PA' },
      ar: { word: 'أبي (Abī)', phonetic: 'A-bi' },
      rif: { word: 'Baba', phonetic: 'BA-ba' },
      zh: { word: '爸爸 (Bàba)', phonetic: 'ba-ba' },
    },
  },
  {
    id: 'hand',
    category: 'body',
    iconId: 'hand',
    minAge: '3-5',
    translations: {
      es: { word: 'Mano', phonetic: 'MA-no' },
      ca: { word: 'Mà', phonetic: 'ma' },
      en: { word: 'Hand', phonetic: 'jand' },
      nl: { word: 'Hand', phonetic: 'jant' },
      fr: { word: 'Main', phonetic: 'man' },
      ar: { word: 'يد (Yad)', phonetic: 'yad' },
      rif: { word: 'Fus', phonetic: 'fus' },
      zh: { word: '手 (Shǒu)', phonetic: 'shou' },
    },
  },
  {
    id: 'eye',
    category: 'body',
    iconId: 'eye',
    minAge: '3-5',
    translations: {
      es: { word: 'Ojo', phonetic: 'O-jo' },
      ca: { word: 'Ull', phonetic: 'ull' },
      en: { word: 'Eye', phonetic: 'ai' },
      nl: { word: 'Oog', phonetic: 'oj' },
      fr: { word: 'Œil', phonetic: 'euy' },
      ar: { word: 'عين (ʻAyn)', phonetic: 'ayn' },
      rif: { word: 'Tiṭ', phonetic: 'tit' },
      zh: { word: '眼睛 (Yǎnjīng)', phonetic: 'yan-jing' },
    },
  },
  {
    id: 'heart',
    category: 'body',
    iconId: 'heart_shape',
    minAge: '3-5',
    translations: {
      es: { word: 'Corazón', phonetic: 'co-ra-ZÓN' },
      ca: { word: 'Cor', phonetic: 'cor' },
      en: { word: 'Heart', phonetic: 'jart' },
      nl: { word: 'Hart', phonetic: 'jart' },
      fr: { word: 'Cœur', phonetic: 'keur' },
      ar: { word: 'قلب (Qalb)', phonetic: 'qalb' },
      rif: { word: 'Ur', phonetic: 'ur' },
      zh: { word: '心 (Xīn)', phonetic: 'shin' },
    },
  },
  {
    id: 'four',
    category: 'numbers',
    iconId: 'four',
    minAge: '3-5',
    translations: {
      es: { word: 'Cuatro', phonetic: 'CUA-tro' },
      ca: { word: 'Quatre', phonetic: 'CUA-tre' },
      en: { word: 'Four', phonetic: 'for' },
      nl: { word: 'Vier', phonetic: 'vir' },
      fr: { word: 'Quatre', phonetic: 'katr' },
      ar: { word: 'أربعة (Arbaʻa)', phonetic: 'AR-ba-a' },
      rif: { word: 'Rebɛa', phonetic: 'reb-AA' },
      zh: { word: '四 (Sì)', phonetic: 'si' },
    },
  },
  {
    id: 'five',
    category: 'numbers',
    iconId: 'five',
    minAge: '3-5',
    translations: {
      es: { word: 'Cinco', phonetic: 'CIN-co' },
      ca: { word: 'Cinc', phonetic: 'sinc' },
      en: { word: 'Five', phonetic: 'faiv' },
      nl: { word: 'Vijf', phonetic: 'vaif' },
      fr: { word: 'Cinq', phonetic: 'sank' },
      ar: { word: 'خمسة (Khamsa)', phonetic: 'KHAM-sa' },
      rif: { word: 'Xemsa', phonetic: 'KHEM-sa' },
      zh: { word: '五 (Wǔ)', phonetic: 'wu' },
    },
  },
  {
    id: 'flower',
    category: 'nature',
    iconId: 'flower',
    minAge: '3-5',
    translations: {
      es: { word: 'Flor', phonetic: 'flor' },
      ca: { word: 'Flor', phonetic: 'flor' },
      en: { word: 'Flower', phonetic: 'FLAU-er' },
      nl: { word: 'Bloem', phonetic: 'blum' },
      fr: { word: 'Fleur', phonetic: 'fleur' },
      ar: { word: 'زهرة (Zahra)', phonetic: 'ZAH-ra' },
      rif: { word: 'Tajejjigt', phonetic: 'ta-jej-JIGT' },
      zh: { word: '花 (Huā)', phonetic: 'hua' },
    },
  },
  {
    id: 'sea',
    category: 'nature',
    iconId: 'sea',
    minAge: '6-8',
    translations: {
      es: { word: 'Mar', phonetic: 'mar' },
      ca: { word: 'Mar', phonetic: 'mar' },
      en: { word: 'Sea', phonetic: 'si' },
      nl: { word: 'Zee', phonetic: 'ze' },
      fr: { word: 'Mer', phonetic: 'mer' },
      ar: { word: 'بحر (Baḥr)', phonetic: 'bahr' },
      rif: { word: 'Lebḥer', phonetic: 'leb-HER' },
      zh: { word: '海 (Hǎi)', phonetic: 'hai' },
    },
  },
  {
    id: 'run',
    category: 'actions',
    iconId: 'action_run',
    minAge: '6-8',
    translations: {
      es: { word: 'Correr', phonetic: 'co-RRER' },
      ca: { word: 'Córrer', phonetic: 'CO-rrer' },
      en: { word: 'Run', phonetic: 'ran' },
      nl: { word: 'Rennen', phonetic: 'RE-nen' },
      fr: { word: 'Courir', phonetic: 'cu-RIR' },
      ar: { word: 'يجري (Yajrī)', phonetic: 'YAJ-ri' },
      rif: { word: 'Tazzla', phonetic: 'TAZ-la' },
      zh: { word: '跑 (Pǎo)', phonetic: 'pao' },
    },
  },
  {
    id: 'eat',
    category: 'actions',
    iconId: 'action_eat',
    minAge: '3-5',
    translations: {
      es: { word: 'Comer', phonetic: 'co-MER' },
      ca: { word: 'Menjar', phonetic: 'men-JAR' },
      en: { word: 'Eat', phonetic: 'it' },
      nl: { word: 'Eten', phonetic: 'E-ten' },
      fr: { word: 'Manger', phonetic: 'man-JE' },
      ar: { word: 'يأكل (Yaʼkul)', phonetic: 'YA-kul' },
      rif: { word: 'Yecc', phonetic: 'yech' },
      zh: { word: '吃 (Chī)', phonetic: 'chi' },
    },
  },
  {
    id: 'drink',
    category: 'actions',
    iconId: 'action_drink',
    minAge: '3-5',
    translations: {
      es: { word: 'Beber', phonetic: 'be-BER' },
      ca: { word: 'Beure', phonetic: 'BEU-re' },
      en: { word: 'Drink', phonetic: 'drink' },
      nl: { word: 'Drinken', phonetic: 'DRIN-ken' },
      fr: { word: 'Boire', phonetic: 'bwar' },
      ar: { word: 'يشرب (Yashrab)', phonetic: 'YASH-rab' },
      rif: { word: 'Issu', phonetic: 'IS-su' },
      zh: { word: '喝 (Hē)', phonetic: 'he' },
    },
  },
  {
    id: 'read',
    category: 'actions',
    iconId: 'book',
    minAge: '6-8',
    translations: {
      es: { word: 'Leer', phonetic: 'le-ER' },
      ca: { word: 'Llegir', phonetic: 'lle-JIR' },
      en: { word: 'Read', phonetic: 'rid' },
      nl: { word: 'Lezen', phonetic: 'LE-zen' },
      fr: { word: 'Lire', phonetic: 'lir' },
      ar: { word: 'يقرأ (Yaqraʼ)', phonetic: 'YAQ-ra' },
      rif: { word: 'Yeqqar', phonetic: 'yeq-QAR' },
      zh: { word: '读书 (Dúshū)', phonetic: 'du-shu' },
    },
  },
  {
    id: 'play_verb',
    category: 'actions',
    iconId: 'action_play',
    minAge: '3-5',
    translations: {
      es: { word: 'Jugar', phonetic: 'ju-GAR' },
      ca: { word: 'Jugar', phonetic: 'ju-GAR' },
      en: { word: 'Play', phonetic: 'plei' },
      nl: { word: 'Spelen', phonetic: 'SPE-len' },
      fr: { word: 'Jouer', phonetic: 'ju-E' },
      ar: { word: 'يلعب (Yalʻab)', phonetic: 'YAL-ab' },
      rif: { word: 'Irar', phonetic: 'i-RAR' },
      zh: { word: '玩 (Wán)', phonetic: 'wan' },
    },
  },
  {
    id: 'sleep',
    category: 'actions',
    iconId: 'moon',
    minAge: '3-5',
    translations: {
      es: { word: 'Dormir', phonetic: 'dor-MIR' },
      ca: { word: 'Dormir', phonetic: 'dor-MIR' },
      en: { word: 'Sleep', phonetic: 'slip' },
      nl: { word: 'Slapen', phonetic: 'SLA-pen' },
      fr: { word: 'Dormir', phonetic: 'dor-MIR' },
      ar: { word: 'ينام (Yanām)', phonetic: 'ya-NAM' },
      rif: { word: 'Yettas', phonetic: 'yet-TAS' },
      zh: { word: '睡觉 (Shuìjiào)', phonetic: 'shuei-jiao' },
    },
  },
  {
    id: 'sister',
    category: 'family',
    iconId: 'friend',
    minAge: '3-5',
    translations: {
      es: { word: 'Hermana', phonetic: 'er-MA-na' },
      ca: { word: 'Germana', phonetic: 'jer-MA-na' },
      en: { word: 'Sister', phonetic: 'SIS-ter' },
      nl: { word: 'Zus', phonetic: 'zus' },
      fr: { word: 'Sœur', phonetic: 'seur' },
      ar: { word: 'أخت (Ukht)', phonetic: 'ukht' },
      rif: { word: 'Utma', phonetic: 'UT-ma' },
      zh: { word: '姐姐 (Jiějie)', phonetic: 'jie-jie' },
    },
  },
  {
    id: 'brother',
    category: 'family',
    iconId: 'friend',
    minAge: '3-5',
    translations: {
      es: { word: 'Hermano', phonetic: 'er-MA-no' },
      ca: { word: 'Germà', phonetic: 'jer-MA' },
      en: { word: 'Brother', phonetic: 'BRA-der' },
      nl: { word: 'Broer', phonetic: 'brur' },
      fr: { word: 'Frère', phonetic: 'frer' },
      ar: { word: 'أخ (Akh)', phonetic: 'akh' },
      rif: { word: 'Uma', phonetic: 'U-ma' },
      zh: { word: '哥哥 (Gēge)', phonetic: 'ge-ge' },
    },
  },
  {
    id: 'grandma',
    category: 'family',
    iconId: 'mother',
    minAge: '3-5',
    translations: {
      es: { word: 'Abuela', phonetic: 'a-BUE-la' },
      ca: { word: 'Àvia', phonetic: 'A-vi-a' },
      en: { word: 'Grandma', phonetic: 'GRAND-ma' },
      nl: { word: 'Oma', phonetic: 'O-ma' },
      fr: { word: 'Mamie', phonetic: 'ma-MI' },
      ar: { word: 'جدة (Jadda)', phonetic: 'JAD-da' },
      rif: { word: 'Ḥenna', phonetic: 'HEN-na' },
      zh: { word: '奶奶 (Nǎinai)', phonetic: 'nai-nai' },
    },
  },
  {
    id: 'grandpa',
    category: 'family',
    iconId: 'father',
    minAge: '3-5',
    translations: {
      es: { word: 'Abuelo', phonetic: 'a-BUE-lo' },
      ca: { word: 'Avi', phonetic: 'A-vi' },
      en: { word: 'Grandpa', phonetic: 'GRAND-pa' },
      nl: { word: 'Opa', phonetic: 'O-pa' },
      fr: { word: 'Papi', phonetic: 'pa-PI' },
      ar: { word: 'جد (Jadd)', phonetic: 'jadd' },
      rif: { word: 'Jeddi', phonetic: 'JED-di' },
      zh: { word: '爷爷 (Yéye)', phonetic: 'ye-ye' },
    },
  },
  {
    id: 'banana',
    category: 'food',
    iconId: 'orange_fruit',
    minAge: '3-5',
    translations: {
      es: { word: 'Plátano', phonetic: 'PLÁ-ta-no' },
      ca: { word: 'Plàtan', phonetic: 'PLA-tan' },
      en: { word: 'Banana', phonetic: 'ba-NA-na' },
      nl: { word: 'Banaan', phonetic: 'ba-NAN' },
      fr: { word: 'Banane', phonetic: 'ba-NAN' },
      ar: { word: 'موزة (Mawza)', phonetic: 'MAW-za' },
      rif: { word: 'Tabanant', phonetic: 'ta-ba-NANT' },
      zh: { word: '香蕉 (Xiāngjiāo)', phonetic: 'shiang-jiao' },
    },
  },
  {
    id: 'egg',
    category: 'food',
    iconId: 'bread',
    minAge: '3-5',
    translations: {
      es: { word: 'Huevo', phonetic: 'WE-vo' },
      ca: { word: 'Ou', phonetic: 'ou' },
      en: { word: 'Egg', phonetic: 'eg' },
      nl: { word: 'Ei', phonetic: 'ei' },
      fr: { word: 'Œuf', phonetic: 'euf' },
      ar: { word: 'بيضة (Bayḍa)', phonetic: 'BAY-da' },
      rif: { word: 'Tamellalt', phonetic: 'ta-mel-LALT' },
      zh: { word: '鸡蛋 (Jīdàn)', phonetic: 'ji-dan' },
    },
  },
  {
    id: 'cheese',
    category: 'food',
    iconId: 'bread',
    minAge: '6-8',
    translations: {
      es: { word: 'Queso', phonetic: 'KE-so' },
      ca: { word: 'Formatge', phonetic: 'for-MAT-ge' },
      en: { word: 'Cheese', phonetic: 'chiz' },
      nl: { word: 'Kaas', phonetic: 'kas' },
      fr: { word: 'Fromage', phonetic: 'fro-MAJ' },
      ar: { word: 'جبن (Jubn)', phonetic: 'jubn' },
      rif: { word: 'Ajben', phonetic: 'aj-BEN' },
      zh: { word: '奶酪 (Nǎilào)', phonetic: 'nai-lao' },
    },
  },
  {
    id: 'sheep',
    category: 'animals',
    iconId: 'cat',
    minAge: '3-5',
    translations: {
      es: { word: 'Oveja', phonetic: 'o-VE-ja' },
      ca: { word: 'Ovella', phonetic: 'o-VE-lla' },
      en: { word: 'Sheep', phonetic: 'ship' },
      nl: { word: 'Schaap', phonetic: 'sjap' },
      fr: { word: 'Mouton', phonetic: 'mu-TON' },
      ar: { word: 'خروف (Kharūf)', phonetic: 'kha-RUF' },
      rif: { word: 'Izimer', phonetic: 'i-zi-MER' },
      zh: { word: '羊 (Yáng)', phonetic: 'yang' },
    },
  },
  {
    id: 'horse',
    category: 'animals',
    iconId: 'lion',
    minAge: '6-8',
    translations: {
      es: { word: 'Caballo', phonetic: 'ca-BA-llo' },
      ca: { word: 'Cavall', phonetic: 'ca-VALL' },
      en: { word: 'Horse', phonetic: 'jors' },
      nl: { word: 'Paard', phonetic: 'part' },
      fr: { word: 'Cheval', phonetic: 'she-VAL' },
      ar: { word: 'حصان (Ḥiṣān)', phonetic: 'hi-SAN' },
      rif: { word: 'Ayis', phonetic: 'a-YIS' },
      zh: { word: '马 (Mǎ)', phonetic: 'ma' },
    },
  },
  {
    id: 'rabbit',
    category: 'animals',
    iconId: 'cat',
    minAge: '3-5',
    translations: {
      es: { word: 'Conejo', phonetic: 'co-NE-jo' },
      ca: { word: 'Conill', phonetic: 'co-NILL' },
      en: { word: 'Rabbit', phonetic: 'RA-bit' },
      nl: { word: 'Konijn', phonetic: 'ko-NEIN' },
      fr: { word: 'Lapin', phonetic: 'la-PAN' },
      ar: { word: 'أرنب (Arnab)', phonetic: 'AR-nab' },
      rif: { word: 'Aqnin', phonetic: 'aq-NIN' },
      zh: { word: '兔子 (Tùzi)', phonetic: 'tu-zi' },
    },
  },
  {
    id: 'bee',
    category: 'animals',
    iconId: 'bird',
    minAge: '6-8',
    translations: {
      es: { word: 'Abeja', phonetic: 'a-BE-ja' },
      ca: { word: 'Abella', phonetic: 'a-BE-lla' },
      en: { word: 'Bee', phonetic: 'bi' },
      nl: { word: 'Bij', phonetic: 'bei' },
      fr: { word: 'Abeille', phonetic: 'a-BEY' },
      ar: { word: 'نحلة (Naḥla)', phonetic: 'NAH-la' },
      rif: { word: 'Tizizwit', phonetic: 'ti-ziz-WIT' },
      zh: { word: '蜜蜂 (Mìfēng)', phonetic: 'mi-feng' },
    },
  },
  {
    id: 'head',
    category: 'body',
    iconId: 'eye',
    minAge: '3-5',
    translations: {
      es: { word: 'Cabeza', phonetic: 'ca-BE-za' },
      ca: { word: 'Cap', phonetic: 'cap' },
      en: { word: 'Head', phonetic: 'jed' },
      nl: { word: 'Hoofd', phonetic: 'hoft' },
      fr: { word: 'Tête', phonetic: 'tet' },
      ar: { word: 'رأس (Raʼs)', phonetic: 'ras' },
      rif: { word: 'Azedjif', phonetic: 'a-zed-JIF' },
      zh: { word: '头 (Tóu)', phonetic: 'tou' },
    },
  },
  {
    id: 'foot',
    category: 'body',
    iconId: 'hand',
    minAge: '3-5',
    translations: {
      es: { word: 'Pie', phonetic: 'pie' },
      ca: { word: 'Peu', phonetic: 'peu' },
      en: { word: 'Foot', phonetic: 'fut' },
      nl: { word: 'Voet', phonetic: 'vut' },
      fr: { word: 'Pied', phonetic: 'pye' },
      ar: { word: 'قدم (Qadam)', phonetic: 'QA-dam' },
      rif: { word: 'Aḍar', phonetic: 'a-DAR' },
      zh: { word: '脚 (Jiǎo)', phonetic: 'jiao' },
    },
  },
  {
    id: 'smile',
    category: 'actions',
    iconId: 'heart_shape',
    minAge: '3-5',
    translations: {
      es: { word: 'Sonreír', phonetic: 'son-re-ÍR' },
      ca: { word: 'Somriure', phonetic: 'som-RIU-re' },
      en: { word: 'Smile', phonetic: 'smail' },
      nl: { word: 'Glimlachen', phonetic: 'GLIM-la-jen' },
      fr: { word: 'Sourire', phonetic: 'su-RIR' },
      ar: { word: 'يبتسم (Yabtasim)', phonetic: 'yab-TA-sim' },
      rif: { word: 'Yeḍḥa', phonetic: 'yed-HA' },
      zh: { word: '微笑 (Wēixiào)', phonetic: 'wei-shiao' },
    },
  },
  {
    id: 'sing',
    category: 'actions',
    iconId: 'bird',
    minAge: '6-8',
    translations: {
      es: { word: 'Cantar', phonetic: 'can-TAR' },
      ca: { word: 'Cantar', phonetic: 'can-TAR' },
      en: { word: 'Sing', phonetic: 'sing' },
      nl: { word: 'Zingen', phonetic: 'ZIN-gen' },
      fr: { word: 'Chanter', phonetic: 'shan-TE' },
      ar: { word: 'يغني (Yughannī)', phonetic: 'yu-GHAN-ni' },
      rif: { word: 'Yeggennej', phonetic: 'yeg-GEN-nej' },
      zh: { word: '唱歌 (Chànggē)', phonetic: 'chang-ge' },
    },
  },
  {
    id: 'rain',
    category: 'nature',
    iconId: 'water',
    minAge: '6-8',
    translations: {
      es: { word: 'Lluvia', phonetic: 'LLU-via' },
      ca: { word: 'Pluja', phonetic: 'PLU-ja' },
      en: { word: 'Rain', phonetic: 'rein' },
      nl: { word: 'Regen', phonetic: 'RE-jen' },
      fr: { word: 'Pluie', phonetic: 'plwi' },
      ar: { word: 'مطر (Maṭar)', phonetic: 'MA-tar' },
      rif: { word: 'Anzar', phonetic: 'an-ZAR' },
      zh: { word: '雨 (Yǔ)', phonetic: 'yu' },
    },
  },
  {
    id: 'wind',
    category: 'nature',
    iconId: 'sea',
    minAge: '6-8',
    translations: {
      es: { word: 'Viento', phonetic: 'VIEN-to' },
      ca: { word: 'Vent', phonetic: 'vent' },
      en: { word: 'Wind', phonetic: 'wind' },
      nl: { word: 'Wind', phonetic: 'wint' },
      fr: { word: 'Vent', phonetic: 'van' },
      ar: { word: 'رياح (Riyāḥ)', phonetic: 'ri-YAH' },
      rif: { word: 'Aṣemmiḍ', phonetic: 'a-sem-MID' },
      zh: { word: '风 (Fēng)', phonetic: 'feng' },
    },
  },
  {
    id: 'school',
    category: 'family',
    iconId: 'book',
    minAge: '6-8',
    translations: {
      es: { word: 'Escuela', phonetic: 'es-CUE-la' },
      ca: { word: 'Escola', phonetic: 'es-CO-la' },
      en: { word: 'School', phonetic: 'skul' },
      nl: { word: 'School', phonetic: 'sjol' },
      fr: { word: 'École', phonetic: 'e-COL' },
      ar: { word: 'مدرسة (Madrasa)', phonetic: 'MAD-ra-sa' },
      rif: { word: 'Lmecid', phonetic: 'l-me-CHID' },
      zh: { word: '学校 (Xuéxiào)', phonetic: 'shue-shiao' },
    },
  },
];

export interface KidsSentenceExercise {
  id: string;
  unitId: string;
  iconId: string;
  minAge: KidsAgeGroup;
  translations: Record<
    KidsLanguageCode,
    {
      full: string;
      tokens: string[];
      distractor: string;
      phonetic: string;
    }
  >;
}

/**
 * Interactive multi-language sentence builder bank (meaningful phrases instead of isolated nouns).
 */
export const KIDS_SENTENCE_BANK: KidsSentenceExercise[] = [
  {
    id: 'sent-cat-water',
    unitId: 'island-animals',
    iconId: 'cat',
    minAge: '3-5',
    translations: {
      es: { full: 'El gato bebe agua', tokens: ['El', 'gato', 'bebe', 'agua'], distractor: 'sol', phonetic: 'el GA-to BE-be A-gwa' },
      ca: { full: 'El gat beu aigua', tokens: ['El', 'gat', 'beu', 'aigua'], distractor: 'sol', phonetic: 'el gat beu AI-gwa' },
      en: { full: 'The cat drinks water', tokens: ['The', 'cat', 'drinks', 'water'], distractor: 'sun', phonetic: 'da cat drinks WO-ter' },
      nl: { full: 'De kat drinkt water', tokens: ['De', 'kat', 'drinkt', 'water'], distractor: 'zon', phonetic: 'de kat drinkt WA-ter' },
      fr: { full: 'Le chat boit de l’eau', tokens: ['Le', 'chat', 'boit', 'de l’eau'], distractor: 'soleil', phonetic: 'le sha bwa de lo' },
      ar: { full: 'القطة تشرب الماء', tokens: ['القطة', 'تشرب', 'الماء'], distractor: 'الشمس', phonetic: 'al-QIT-ta TASH-rab al-MAA' },
      rif: { full: 'Amucc itess aman', tokens: ['Amucc', 'itess', 'aman'], distractor: 'tfuct', phonetic: 'a-MUCH i-TESS a-MAN' },
      zh: { full: '小猫 喝 水', tokens: ['小猫', '喝', '水'], distractor: '太阳', phonetic: 'xiao-mao he shuei' },
    },
  },
  {
    id: 'sent-eat-apple',
    unitId: 'island-food',
    iconId: 'apple',
    minAge: '3-5',
    translations: {
      es: { full: 'Quiero una manzana roja', tokens: ['Quiero', 'una', 'manzana', 'roja'], distractor: 'luna', phonetic: 'KIE-ro U-na man-ZA-na RO-ja' },
      ca: { full: 'Vull una poma vermella', tokens: ['Vull', 'una', 'poma', 'vermella'], distractor: 'lluna', phonetic: 'vull U-na PO-ma ver-ME-lla' },
      en: { full: 'I want a red apple', tokens: ['I', 'want', 'a', 'red', 'apple'], distractor: 'moon', phonetic: 'ai wont a red AP-el' },
      nl: { full: 'Ik wil een rode appel', tokens: ['Ik', 'wil', 'een', 'rode', 'appel'], distractor: 'maan', phonetic: 'ik wil en RO-de AP-el' },
      fr: { full: 'Je veux une pomme rouge', tokens: ['Je', 'veux', 'une', 'pomme', 'rouge'], distractor: 'lune', phonetic: 'je veu un pom ruj' },
      ar: { full: 'أريد تفاحة حمراء', tokens: ['أريد', 'تفاحة', 'حمراء'], distractor: 'قمر', phonetic: 'u-RID tuf-FA-ha ham-RA' },
      rif: { full: 'Xseɣ ijjen tatteffaḥt tazeggaɣt', tokens: ['Xseɣ', 'ijjen', 'tatteffaḥt', 'tazeggaɣt'], distractor: 'tziri', phonetic: 'KHSEGH ij-jen tat-tef-FAHT ta-zeg-GAGHT' },
      zh: { full: '我 想吃 红苹果', tokens: ['我', '想吃', '红苹果'], distractor: '月亮', phonetic: 'wo xiang-chi hong ping-guo' },
    },
  },
  {
    id: 'sent-mom-bread',
    unitId: 'island-family',
    iconId: 'bread',
    minAge: '3-5',
    translations: {
      es: { full: 'Mamá está en casa', tokens: ['Mamá', 'está', 'en', 'casa'], distractor: 'pez', phonetic: 'ma-MÁ es-TÁ en KA-sa' },
      ca: { full: 'La mama és a casa', tokens: ['La', 'mama', 'és', 'a casa'], distractor: 'peix', phonetic: 'la MA-ma es a KA-sa' },
      en: { full: 'Mom is at home', tokens: ['Mom', 'is', 'at', 'home'], distractor: 'fish', phonetic: 'mam is at joum' },
      nl: { full: 'Mama is thuis', tokens: ['Mama', 'is', 'thuis'], distractor: 'vis', phonetic: 'MA-ma is taus' },
      fr: { full: 'Maman est à la maison', tokens: ['Maman', 'est', 'à la', 'maison'], distractor: 'poisson', phonetic: 'ma-MAN e a la me-ZON' },
      ar: { full: 'أمي في البيت', tokens: ['أمي', 'في', 'البيت'], distractor: 'سمكة', phonetic: 'UM-mi fil BAYT' },
      rif: { full: 'Yemma deg taddart', tokens: ['Yemma', 'deg', 'taddart'], distractor: 'aslem', phonetic: 'YEM-ma deg tad-DART' },
      zh: { full: '妈妈 在 家', tokens: ['妈妈', '在', '家'], distractor: '鱼', phonetic: 'ma-ma zai jia' },
    },
  },
  {
    id: 'sent-friend-read',
    unitId: 'island-actions',
    iconId: 'book',
    minAge: '6-8',
    translations: {
      es: { full: 'Mi amigo lee un libro', tokens: ['Mi', 'amigo', 'lee', 'un libro'], distractor: 'árbol', phonetic: 'mi a-MI-go LE-e un LI-bro' },
      ca: { full: 'El meu amic llegeix un llibre', tokens: ['El meu', 'amic', 'llegeix', 'un llibre'], distractor: 'arbre', phonetic: 'el meu a-MIK lle-JEIX un LLI-bre' },
      en: { full: 'My friend reads a book', tokens: ['My', 'friend', 'reads', 'a book'], distractor: 'tree', phonetic: 'mai frend rids a buk' },
      nl: { full: 'Mijn vriend leest een boek', tokens: ['Mijn', 'vriend', 'leest', 'een boek'], distractor: 'boom', phonetic: 'main vrint lest en buk' },
      fr: { full: 'Mon ami lit un livre', tokens: ['Mon', 'ami', 'lit', 'un livre'], distractor: 'arbre', phonetic: 'mon a-MI li an LIVR' },
      ar: { full: 'صديقي يقرأ كتاباً', tokens: ['صديقي', 'يقرأ', 'كتاباً'], distractor: 'شجرة', phonetic: 'sa-DI-qi YAQ-ra ki-TA-ban' },
      rif: { full: 'Ameddakel inu yeqqar ktab', tokens: ['Ameddakel', 'inu', 'yeqqar', 'ktab'], distractor: 'ttejra', phonetic: 'a-med-DA-kel i-NU yeq-QAR k-TAB' },
      zh: { full: '我的 朋友 读书', tokens: ['我的', '朋友', '读书'], distractor: '树', phonetic: 'wo-de peng-you du-shu' },
    },
  },
  {
    id: 'sent-bird-mountain',
    unitId: 'island-nature',
    iconId: 'bird',
    minAge: '6-8',
    translations: {
      es: { full: 'El pájaro vuela sobre la montaña', tokens: ['El pájaro', 'vuela', 'sobre', 'la montaña'], distractor: 'leche', phonetic: 'el PÁ-ja-ro VUE-la SO-bre la mon-TA-ña' },
      ca: { full: 'L’ocell vola sobre la muntanya', tokens: ['L’ocell', 'vola', 'sobre', 'la muntanya'], distractor: 'llet', phonetic: 'lo-SELL VO-la SO-bra la mun-TA-nya' },
      en: { full: 'The bird flies over the mountain', tokens: ['The bird', 'flies', 'over', 'the mountain'], distractor: 'milk', phonetic: 'da berd flais OU-ver da MAUN-tin' },
      nl: { full: 'De vogel vliegt over de berg', tokens: ['De vogel', 'vliegt', 'over', 'de berg'], distractor: 'melk', phonetic: 'de VO-jel vlikt O-ver de berj' },
      fr: { full: 'L’oiseau vole sur la montagne', tokens: ['L’oiseau', 'vole', 'sur', 'la montagne'], distractor: 'lait', phonetic: 'lwa-ZO vol syr la mon-TAN-ye' },
      ar: { full: 'الطائر يطير فوق الجبل', tokens: ['الطائر', 'يطير', 'فوق', 'الجبل'], distractor: 'حليب', phonetic: 'at-TA-ir ya-TIR fawq al-JA-bal' },
      rif: { full: 'Ajeḍiḍ yettafeg x udrar', tokens: ['Ajeḍiḍ', 'yettafeg', 'x', 'udrar'], distractor: 'ayefki', phonetic: 'a-je-DID yet-TA-feg kh ud-RAR' },
      zh: { full: '小鸟 飞过 山顶', tokens: ['小鸟', '飞过', '山顶'], distractor: '牛奶', phonetic: 'xiao-niao fei-guo shan-ding' },
    },
  },
  {
    id: 'sent-sun-star',
    unitId: 'island-space',
    iconId: 'star',
    minAge: '9-12',
    translations: {
      es: { full: 'El sol brilla y la luna sale de noche', tokens: ['El sol', 'brilla', 'y la luna', 'sale'], distractor: 'pan', phonetic: 'el sol BRI-lla y la LU-na SA-le' },
      ca: { full: 'El sol brilla i la lluna surt', tokens: ['El sol', 'brilla', 'i la lluna', 'surt'], distractor: 'pa', phonetic: 'el sol BRI-lla i la LLU-na surt' },
      en: { full: 'The sun shines and the moon rises', tokens: ['The sun', 'shines', 'and the moon', 'rises'], distractor: 'bread', phonetic: 'da san shains and da mun RAI-sis' },
      nl: { full: 'De zon schijnt en de maan komt op', tokens: ['De zon', 'schijnt', 'en de maan', 'komt op'], distractor: 'brood', phonetic: 'de zon sjaint en de man komt op' },
      fr: { full: 'Le soleil brille et la lune monte', tokens: ['Le soleil', 'brille', 'et la lune', 'monte'], distractor: 'pain', phonetic: 'le so-LEY bri-ye e la lun mont' },
      ar: { full: 'الشمس تشرق والقمر يظهر ليلاً', tokens: ['الشمس', 'تشرق', 'والقمر', 'يظهر'], distractor: 'خبز', phonetic: 'ash-SHAMS tush-riq wal-QA-mar yadh-har' },
      rif: { full: 'Tfuct teccel, tziri tetteffeɣ deg yid', tokens: ['Tfuct', 'teccel', 'tziri', 'tetteffeɣ'], distractor: 'aɣrum', phonetic: 't-FUCHT tech-CHEL t-ZI-ri tet-TEF-fegh' },
      zh: { full: '太阳 发光，月亮 升起', tokens: ['太阳', '发光', '月亮', '升起'], distractor: '面包', phonetic: 'tai-yang fa-guang yue-liang sheng-qi' },
    },
  },
  {
    id: 'sent-dog-runs',
    unitId: 'island-animals',
    iconId: 'dog',
    minAge: '3-5',
    translations: {
      es: { full: 'El perro corre en el parque', tokens: ['El perro', 'corre', 'en', 'el parque'], distractor: 'libro', phonetic: 'el PE-rro KO-rre en el PAR-ke' },
      ca: { full: 'El gos corre pel parc', tokens: ['El gos', 'corre', 'pel', 'parc'], distractor: 'llibre', phonetic: 'el gos KO-rre pel park' },
      en: { full: 'The dog runs in the park', tokens: ['The dog', 'runs', 'in', 'the park'], distractor: 'book', phonetic: 'da dog rans in da park' },
      nl: { full: 'De hond rent in het park', tokens: ['De hond', 'rent', 'in', 'het park'], distractor: 'boek', phonetic: 'de jont rent in jet park' },
      fr: { full: 'Le chien court dans le parc', tokens: ['Le chien', 'court', 'dans', 'le parc'], distractor: 'livre', phonetic: 'le shyan kur dan le park' },
      ar: { full: 'الكلب يجري في الحديقة', tokens: ['الكلب', 'يجري', 'في', 'الحديقة'], distractor: 'كتاب', phonetic: 'al-KALB YAJ-ri fil ha-DI-qa' },
      rif: { full: 'Aqzin yettazzal deg rḥa', tokens: ['Aqzin', 'yettazzal', 'deg', 'rḥa'], distractor: 'ktab', phonetic: 'aq-ZIN yet-TAZ-zal deg r-HA' },
      zh: { full: '小狗 在 公园 跑步', tokens: ['小狗', '在', '公园', '跑步'], distractor: '书', phonetic: 'xiao-gou zai gong-yuan pao-bu' },
    },
  },
  {
    id: 'sent-drink-milk',
    unitId: 'island-food',
    iconId: 'milk',
    minAge: '3-5',
    translations: {
      es: { full: 'Bebo leche con miel por la mañana', tokens: ['Bebo', 'leche', 'con', 'miel'], distractor: 'mar', phonetic: 'BE-bo LE-che kon miel' },
      ca: { full: 'Bec llet amb mel', tokens: ['Bec', 'llet', 'amb', 'mel'], distractor: 'mar', phonetic: 'bek llet amb mel' },
      en: { full: 'I drink milk with honey', tokens: ['I', 'drink', 'milk', 'with honey'], distractor: 'sea', phonetic: 'ai drink milk wid JA-ni' },
      nl: { full: 'Ik drink melk met honing', tokens: ['Ik', 'drink', 'melk', 'met honing'], distractor: 'zee', phonetic: 'ik drink melk met JO-ning' },
      fr: { full: 'Je bois du lait avec du miel', tokens: ['Je bois', 'du lait', 'avec', 'du miel'], distractor: 'mer', phonetic: 'je bwa dy le a-VEK dy myel' },
      ar: { full: 'أشرب الحليب مع العسل', tokens: ['أشرب', 'الحليب', 'مع', 'العسل'], distractor: 'بحر', phonetic: 'ASH-rab al-ha-LIB ma al-A-sal' },
      rif: { full: 'Tesseɣ ayefki s tamment', tokens: ['Tesseɣ', 'ayefki', 's', 'tamment'], distractor: 'lebḥar', phonetic: 'tes-SEGH a-yef-KI s tam-MENT' },
      zh: { full: '我 喝 加 蜂蜜 的 牛奶', tokens: ['我', '喝', '蜂蜜', '牛奶'], distractor: '大海', phonetic: 'wo he feng-mi niu-nai' },
    },
  },
  {
    id: 'sent-blue-sea',
    unitId: 'island-colors',
    iconId: 'sea',
    minAge: '6-8',
    translations: {
      es: { full: 'El mar azul tiene peces', tokens: ['El mar', 'azul', 'tiene', 'peces'], distractor: 'fuego', phonetic: 'el mar a-ZUL TIE-ne PE-ses' },
      ca: { full: 'El mar blau té peixos', tokens: ['El mar', 'blau', 'té', 'peixos'], distractor: 'foc', phonetic: 'el mar blau te PEI-xos' },
      en: { full: 'The blue sea has fish', tokens: ['The blue', 'sea', 'has', 'fish'], distractor: 'fire', phonetic: 'da blu si jas fish' },
      nl: { full: 'De blauwe zee heeft vissen', tokens: ['De blauwe', 'zee', 'heeft', 'vissen'], distractor: 'vuur', phonetic: 'de BLAU-we ze jeft VI-sen' },
      fr: { full: 'La mer bleue a des poissons', tokens: ['La mer', 'bleue', 'a', 'des poissons'], distractor: 'feu', phonetic: 'la mer bleu a de pwa-SON' },
      ar: { full: 'في البحر الأزرق أسماك', tokens: ['في البحر', 'الأزرق', 'توجد', 'أسماك'], distractor: 'نار', phonetic: 'fil BAHR al-AZ-raq as-MAK' },
      rif: { full: 'Lebḥar azegza dayes iselman', tokens: ['Lebḥar', 'azegza', 'dayes', 'iselman'], distractor: 'tmes', phonetic: 'leb-HAR a-zeg-ZA da-yes i-sel-MAN' },
      zh: { full: '蓝色 的 大海 里 有 小鱼', tokens: ['蓝色的', '大海', '有', '小鱼'], distractor: '火', phonetic: 'lan-se-de da-hai you xiao-yu' },
    },
  },
  {
    id: 'sent-three-flowers',
    unitId: 'island-colors',
    iconId: 'flower',
    minAge: '3-5',
    translations: {
      es: { full: 'Veo tres flores amarillas', tokens: ['Veo', 'tres', 'flores', 'amarillas'], distractor: 'noche', phonetic: 'VE-o tres FLO-res a-ma-RI-llas' },
      ca: { full: 'Veig tres flors grogues', tokens: ['Veig', 'tres', 'flors', 'grogues'], distractor: 'nit', phonetic: 'veig tres flors GRO-gues' },
      en: { full: 'I see three yellow flowers', tokens: ['I see', 'three', 'yellow', 'flowers'], distractor: 'night', phonetic: 'ai si thri YE-lou FLAU-ers' },
      nl: { full: 'Ik zie drie gele bloemen', tokens: ['Ik zie', 'drie', 'gele', 'bloemen'], distractor: 'nacht', phonetic: 'ik zi dri JE-le BLU-men' },
      fr: { full: 'Je vois trois fleurs jaunes', tokens: ['Je vois', 'trois', 'fleurs', 'jaunes'], distractor: 'nuit', phonetic: 'je vwa trwa fleur jon' },
      ar: { full: 'أرى ثلاث زهرات صفراء', tokens: ['أرى', 'ثلاث', 'زهرات', 'صفراء'], distractor: 'ليل', phonetic: 'A-ra tha-LATH za-ha-RAT saf-RA' },
      rif: { full: 'Ttwaliɣ tlata n tnuwwacin tiwraɣin', tokens: ['Ttwaliɣ', 'tlata', 'tnuwwacin', 'tiwraɣin'], distractor: 'yid', phonetic: 't-wa-LIGH tla-ta t-nuw-WA-shin tiw-ra-GHIN' },
      zh: { full: '我 看见 三 朵 黄花', tokens: ['我看见', '三朵', '黄色', '花'], distractor: '夜晚', phonetic: 'wo kan-jian san-duo huang-hua' },
    },
  },
  {
    id: 'sent-dad-school',
    unitId: 'island-family',
    iconId: 'school',
    minAge: '6-8',
    translations: {
      es: { full: 'Papá me lleva a la escuela', tokens: ['Papá', 'me lleva', 'a la', 'escuela'], distractor: 'nube', phonetic: 'pa-PÁ me LLE-va a la es-KWE-la' },
      ca: { full: 'El papa em porta a l’escola', tokens: ['El papa', 'em porta', 'a', 'l’escola'], distractor: 'núvol', phonetic: 'el PA-pa em POR-ta a les-KO-la' },
      en: { full: 'Dad takes me to school', tokens: ['Dad', 'takes me', 'to', 'school'], distractor: 'cloud', phonetic: 'dad teiks mi tu skul' },
      nl: { full: 'Papa brengt mij naar school', tokens: ['Papa', 'brengt mij', 'naar', 'school'], distractor: 'wolk', phonetic: 'PA-pa brengt mai nar sjol' },
      fr: { full: 'Papa m’emmène à l’école', tokens: ['Papa', 'm’emmène', 'à', 'l’école'], distractor: 'nuage', phonetic: 'pa-PA man-MEN a le-KOL' },
      ar: { full: 'أبي يأخذني إلى المدرسة', tokens: ['أبي', 'يأخذني', 'إلى', 'المدرسة'], distractor: 'سحابة', phonetic: 'A-bi ya-khu-dhu-NI i-lal mad-RA-sa' },
      rif: { full: 'Baba yessawaḍ-ayi ɣer lmecid', tokens: ['Baba', 'yessawaḍ-ayi', 'ɣer', 'lmecid'], distractor: 'asigna', phonetic: 'BA-ba yes-sa-WAD-a-yi gher l-me-CHID' },
      zh: { full: '爸爸 送 我 去 学校', tokens: ['爸爸', '送我', '去', '学校'], distractor: '云', phonetic: 'ba-ba song wo qu xue-xiao' },
    },
  },
  {
    id: 'sent-play-music',
    unitId: 'island-actions',
    iconId: 'action_play',
    minAge: '6-8',
    translations: {
      es: { full: 'Jugamos juntos con alegría', tokens: ['Jugamos', 'juntos', 'con', 'alegría'], distractor: 'frío', phonetic: 'ju-GA-mos JUN-tos kon a-le-GRÍ-a' },
      ca: { full: 'Juguem junts amb alegria', tokens: ['Juguem', 'junts', 'amb', 'alegria'], distractor: 'fred', phonetic: 'ju-GUEM junts amb a-le-GRI-a' },
      en: { full: 'We play together happily', tokens: ['We', 'play', 'together', 'happily'], distractor: 'cold', phonetic: 'wi plei tu-GE-der JA-pi-li' },
      nl: { full: 'Wij spelen vrolijk samen', tokens: ['Wij', 'spelen', 'vrolijk', 'samen'], distractor: 'koud', phonetic: 'wai SPE-len VRO-lik SA-men' },
      fr: { full: 'Nous jouons ensemble avec joie', tokens: ['Nous jouons', 'ensemble', 'avec', 'joie'], distractor: 'froid', phonetic: 'nu ju-ON an-SAMBL a-VEK jwa' },
      ar: { full: 'نلعب معاً بسعادة', tokens: ['نلعب', 'معاً', 'بكل', 'سعادة'], distractor: 'برد', phonetic: 'NAL-ab MA-an bi-sa-A-da' },
      rif: { full: 'Netturar jmiɛ s lferḥ', tokens: ['Netturar', 'jmiɛ', 's', 'lferḥ'], distractor: 'asemmiḍ', phonetic: 'net-TU-rar j-MI s l-FERH' },
      zh: { full: '我们 一起 快乐 地 玩耍', tokens: ['我们', '一起', '快乐地', '玩耍'], distractor: '冷', phonetic: 'wo-men yi-qi kuai-le-de wan-shua' },
    },
  },
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
