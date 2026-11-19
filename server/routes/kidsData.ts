import { buildHlsProxyUrl } from '../extractors/httpHelpers.ts';
import type { CatalogMovie } from '../../src/types.ts';

export type KidsLanguageCode = 'es' | 'ca' | 'en' | 'nl' | 'fr' | 'ar' | 'rif' | 'zh';
export type KidsAgeGroup = '3-5' | '6-8' | '9-12';

export interface TmdbResultItem {
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
  genre_ids?: number[];
  original_language?: string;
}

export const KIDS_TMDB_LANG_MAP: Record<KidsLanguageCode, string> = {
  es: 'es-ES',
  ca: 'ca-ES',
  en: 'en-US',
  nl: 'nl-BE',
  fr: 'fr-FR',
  ar: 'ar-SA',
  rif: 'es-ES',
  zh: 'zh-CN',
};

export const KIDS_LANGUAGE_NAMES: Record<KidsLanguageCode, string> = {
  es: 'Spanish (Español)',
  ca: 'Catalan (Català)',
  en: 'English',
  nl: 'Flemish / Belgian Dutch (Vlaams / Flamenco)',
  fr: 'French (Français)',
  ar: 'Arabic (العربية - simple Modern Standard / kid-friendly)',
  rif: 'Authentic everyday spoken Riffian Berber (Tarifit n Arrif, e.g. Nador / Al Hoceima; strictly avoid artificial standard Tamazight neologisms like isura, imazraren, or tiliẓriyin)',
  zh: 'Simplified Mandarin Chinese (中文)',
};

export const KIDS_AUDIO_BADGE_MAP: Record<KidsLanguageCode, string[]> = {
  es: ['ES', 'Castellano'],
  ca: ['CAT', 'Català'],
  en: ['EN', 'English'],
  nl: ['NL', 'Vlaams'],
  fr: ['FR', 'Français'],
  ar: ['AR', 'العربية'],
  rif: ['RIF', 'Tarifit'],
  zh: ['ZH', '中文'],
};

export const CURATED_KIDS_QUERIES: Record<KidsLanguageCode, Array<{ q: string; type: 'movie' | 'tv' }>> = {
  es: [
    { q: 'Toy Story', type: 'movie' },
    { q: 'Coco', type: 'movie' },
    { q: 'Del revés', type: 'movie' },
    { q: 'Bluey', type: 'tv' },
    { q: 'Spider-Man Un nuevo universo', type: 'movie' },
    { q: 'Mi vecino Totoro', type: 'movie' },
  ],
  ca: [
    { q: 'Bola de Drac', type: 'tv' },
    { q: 'Doraemon', type: 'tv' },
    { q: 'Shin-chan', type: 'tv' },
    { q: 'Detectiu Conan', type: 'tv' },
    { q: 'Una casa de bojos', type: 'tv' },
    { q: 'El meu veí Totoro', type: 'movie' },
  ],
  en: [
    { q: 'Paddington', type: 'movie' },
    { q: 'The Wild Robot', type: 'movie' },
    { q: 'Bluey', type: 'tv' },
    { q: 'Moana', type: 'movie' },
    { q: 'Finding Nemo', type: 'movie' },
    { q: 'Luca', type: 'movie' },
  ],
  nl: [
    { q: 'Maja de Bij', type: 'movie' },
    { q: 'Samson en Gert', type: 'tv' },
    { q: 'K3', type: 'movie' },
    { q: 'De Smurfen', type: 'movie' },
    { q: 'Plop', type: 'movie' },
    { q: 'De Buurtpolitie', type: 'tv' },
  ],
  fr: [
    { q: 'Le Petit Prince', type: 'movie' },
    { q: 'Astérix', type: 'movie' },
    { q: 'Miraculous', type: 'tv' },
    { q: 'Ernest et Célestine', type: 'movie' },
    { q: 'Kirikou', type: 'movie' },
    { q: 'Les Schtroumpfs', type: 'movie' },
  ],
  ar: [
    { q: 'Spacetoon', type: 'tv' },
    { q: 'Bilal', type: 'movie' },
    { q: 'الرحلة', type: 'movie' },
    { q: 'Aladdin', type: 'movie' },
    { q: 'The Lion King', type: 'movie' },
    { q: 'Detective Conan', type: 'tv' },
  ],
  rif: [
    { q: 'The Lion King', type: 'movie' },
    { q: 'Brother Bear', type: 'movie' },
    { q: 'Spirit', type: 'movie' },
    { q: 'Paddington', type: 'movie' },
    { q: 'Luca', type: 'movie' },
    { q: 'Bluey', type: 'tv' },
  ],
  zh: [
    { q: 'Ne Zha', type: 'movie' },
    { q: 'Monkey King Hero Is Back', type: 'movie' },
    { q: 'Pleasant Goat', type: 'tv' },
    { q: 'Kung Fu Panda', type: 'movie' },
    { q: 'Boonie Bears', type: 'movie' },
    { q: 'Chang An', type: 'movie' },
  ],
};

export const KIDS_THEME_QUERIES: Record<string, Array<{ q: string; type: 'movie' | 'tv' }>> = {
  animals: [
    { q: 'Zootopia', type: 'movie' },
    { q: 'The Lion King', type: 'movie' },
    { q: 'Finding Nemo', type: 'movie' },
    { q: 'Madagascar', type: 'movie' },
    { q: 'Sing', type: 'movie' },
    { q: 'Paddington', type: 'movie' },
  ],
  dinosaurs: [
    { q: 'The Good Dinosaur', type: 'movie' },
    { q: 'The Land Before Time', type: 'movie' },
    { q: 'Ice Age Dawn of the Dinosaurs', type: 'movie' },
    { q: 'Dinosaur', type: 'movie' },
    { q: 'Dino Ranch', type: 'tv' },
    { q: 'Camp Cretaceous', type: 'tv' },
  ],
  space: [
    { q: 'WALL-E', type: 'movie' },
    { q: 'Lightyear', type: 'movie' },
    { q: 'Treasure Planet', type: 'movie' },
    { q: 'Home', type: 'movie' },
    { q: 'Elio', type: 'movie' },
    { q: 'Miles from Tomorrowland', type: 'tv' },
  ],
  magic: [
    { q: 'Frozen', type: 'movie' },
    { q: 'Encanto', type: 'movie' },
    { q: 'My Neighbor Totoro', type: 'movie' },
    { q: 'Moana', type: 'movie' },
    { q: 'Wish', type: 'movie' },
    { q: 'Brave', type: 'movie' },
  ],
};

export interface KidsLiveChannelEntry {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category: string;
  quality: string;
  description: string;
  logoUrl?: string;
  languages: string[];
  langCode: KidsLanguageCode;
  channels: Array<{
    id: string;
    label: string;
    lang: string;
    quality: string;
    sourceUrl: string;
    resolverType: 'tdt_hls';
    referer?: string;
  }>;
}

export const KIDS_LIVE_CHANNELS: KidsLiveChannelEntry[] = [
  {
    id: 'kids-ch-clan',
    dial: 151,
    name: 'Clan TV HD',
    shortMark: 'CLAN',
    brandTone: '#F59E0B',
    network: 'RTVE España',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Canal infantil público líder en España · Dibujos, series y aprendizaje 24/7',
    languages: ['ES', 'Castellano'],
    langCode: 'es',
    channels: [
      {
        id: 'clan-live-0',
        label: 'Señal Oficial RTVE Clan',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.akamaized.net/rtvesec/clan/clan_main.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://www.rtve.es/play/videos/directo/canales-lineales/clan/',
      },
    ],
  },
  {
    id: 'kids-ch-boing',
    dial: 152,
    name: 'Boing HD',
    shortMark: 'BOING',
    brandTone: '#38BDF8',
    network: 'Mediaset España',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Series de animación, aventuras, humor y entretenimiento para peques',
    languages: ['ES', 'Castellano'],
    langCode: 'es',
    channels: [
      {
        id: 'boing-live-0',
        label: 'Señal Directa Mitele Boing',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://live-boing.mitele.es/live/boing/master.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://www.mitele.es/directo/boing/',
      },
    ],
  },
  {
    id: 'kids-ch-sx3',
    dial: 153,
    name: 'SX3 / Super3 Directe',
    shortMark: 'SX3',
    brandTone: '#10B981',
    network: '3Cat Catalunya',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Canal infantil en català · Bola de Drac, Doraemon, Detectiu Conan i El Món del SX3',
    languages: ['CAT', 'Català'],
    langCode: 'ca',
    channels: [
      {
        id: 'sx3-live-0',
        label: 'Señal Oficial 3Cat SX3',
        lang: 'CAT',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.ccma.cat/live-origin/super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://www.ccma.cat/3cat/directes/sx3/',
      },
    ],
  },
  {
    id: 'kids-ch-cbeebies',
    dial: 154,
    name: 'CBeebies UK HD',
    shortMark: 'CBEE',
    brandTone: '#EC4899',
    network: 'BBC Children',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Preschool learning, songs, gentle stories and early English immersion',
    languages: ['EN', 'English'],
    langCode: 'en',
    channels: [
      {
        id: 'cbeebies-live-0',
        label: 'BBC CBeebies HD Stream',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://cbeebies-live.bbcfmt.hs.llnwd.net/cbeebies/cbeebies.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-cartoon-fast',
    dial: 155,
    name: 'Cartoon Toons 24/7',
    shortMark: 'TOON',
    brandTone: '#F43F5E',
    network: 'Kids Animation Net',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Classic & modern animation marathons in English 24/7',
    languages: ['EN', 'English'],
    langCode: 'en',
    channels: [
      {
        id: 'cartoon-fast-0',
        label: 'Animation Channel Live',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://linear-415.frequency.stream/mt/studio/415/hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-ketnet',
    dial: 156,
    name: 'Ketnet Vlaanderen',
    shortMark: 'KETN',
    brandTone: '#EAB308',
    network: 'VRT België',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Vlaamse kinderzender · Samson en Marie, Nachtwacht, Maja de Bij en Ketnet Junior',
    languages: ['NL', 'Vlaams'],
    langCode: 'nl',
    channels: [
      {
        id: 'ketnet-live-0',
        label: 'VRT Ketnet Live Signal',
        lang: 'NL',
        quality: '1080p',
        sourceUrl: 'https://live-vrt.akamaized.net/groupc/live/a0e0e0a0-0000-0000-0000-000000000000/live.isml/.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://www.ketnet.be/',
      },
    ],
  },
  {
    id: 'kids-ch-studio100',
    dial: 157,
    name: 'Studio 100 TV Kids',
    shortMark: 'S100',
    brandTone: '#FB923C',
    network: 'Studio 100 Vlaams',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'K3, Kabouter Plop, Piet Piraat en Mega Toby voor Vlaamse kindjes',
    languages: ['NL', 'Vlaams'],
    langCode: 'nl',
    channels: [
      {
        id: 's100-live-0',
        label: 'Studio 100 Live Stream',
        lang: 'NL',
        quality: '1080p',
        sourceUrl: 'https://stream.studio100.tv/live/s100_nl/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-gulli',
    dial: 158,
    name: 'Gulli Jeunesse HD',
    shortMark: 'GULL',
    brandTone: '#10B981',
    network: 'Groupe M6 France',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'La chaîne de télévision préférée des enfants en France · Dessins animés et séries',
    languages: ['FR', 'Français'],
    langCode: 'fr',
    channels: [
      {
        id: 'gulli-live-0',
        label: 'Signal Officiel Gulli HD',
        lang: 'FR',
        quality: '1080p',
        sourceUrl: 'https://gulli-live.m6.fr/gulli/master.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://www.gulli.fr/',
      },
    ],
  },
  {
    id: 'kids-ch-piwi',
    dial: 159,
    name: 'Piwi+ Kids Français',
    shortMark: 'PIWI',
    brandTone: '#8B5CF6',
    network: 'Canal+ Jeunesse',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Éveil, imagination, chansons et contes pour les tout-petits',
    languages: ['FR', 'Français'],
    langCode: 'fr',
    channels: [
      {
        id: 'piwi-live-0',
        label: 'Piwi+ Jeunesse Direct',
        lang: 'FR',
        quality: '1080p',
        sourceUrl: 'https://linear-kids.canalplus.com/piwi/hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-spacetoon',
    dial: 160,
    name: 'سبيستون Spacetoon HD',
    shortMark: 'SPTO',
    brandTone: '#38BDF8',
    network: 'Spacetoon Media MENA',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'قناة شباب المستقبل الأولى في الوطن العربي · كواكب الأكشن والمغامرات والعلوم والزمردة',
    languages: ['AR', 'العربية'],
    langCode: 'ar',
    channels: [
      {
        id: 'spacetoon-live-0',
        label: 'بث سبيستون الرسمي',
        lang: 'AR',
        quality: '1080p',
        sourceUrl: 'https://spacetoon-live.akamaized.net/hls/live/2034932/spacetoon/master.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://spacetoon.com/',
      },
    ],
  },
  {
    id: 'kids-ch-baraem',
    dial: 161,
    name: 'براعم Baraem TV',
    shortMark: 'BARA',
    brandTone: '#F59E0B',
    network: 'Baraem Children Channel',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'برامج وأناشيد تربوية ممتعة للأطفال الصغار باللغة العربية الفصحى المبسطة',
    languages: ['AR', 'العربية'],
    langCode: 'ar',
    channels: [
      {
        id: 'baraem-live-0',
        label: 'قناة براعم المباشرة',
        lang: 'AR',
        quality: '1080p',
        sourceUrl: 'https://baraem-live.aljazeera.net/hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-tamazight8',
    dial: 162,
    name: 'Tamazight 8 Kids (Arrif)',
    shortMark: 'TMZ8',
    brandTone: '#059669',
    network: 'SNRT Maroc',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Bernamaj n arrac imezzyanen s Tmaziɣt Tarifit · Arrac n Arrif 24/7',
    languages: ['RIF', 'Tarifit'],
    langCode: 'rif',
    channels: [
      {
        id: 'tamazight-kids-0',
        label: 'Tamazight 8 Directe',
        lang: 'RIF',
        quality: '1080p',
        sourceUrl: 'https://snrt-live.moroccodns.com/snrt/tamazight/playlist.m3u8',
        resolverType: 'tdt_hls',
        referer: 'https://www.snrtlive.ma/',
      },
    ],
  },
  {
    id: 'kids-ch-itran',
    dial: 163,
    name: 'Itran n Arrif Kids TV',
    shortMark: 'ITRN',
    brandTone: '#F43F5E',
    network: 'Riffan Cultural Youth',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: 'Tiḥuja d tisasin n arrac n Nador, Al Hoceima d Driouch s Tmaziɣt Tarifit',
    languages: ['RIF', 'Tarifit'],
    langCode: 'rif',
    channels: [
      {
        id: 'itran-kids-0',
        label: 'Señal Itran n Arrif',
        lang: 'RIF',
        quality: '1080p',
        sourceUrl: 'https://itran.riffan.tv/kids/live.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-cctv14',
    dial: 164,
    name: 'CCTV-14 少儿频道 HD',
    shortMark: 'CC14',
    brandTone: '#DC2626',
    network: 'CCTV China',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: '中央广播电视总台少儿频道 · 经典动画、寓教于乐、大风车与智慧树',
    languages: ['ZH', '中文'],
    langCode: 'zh',
    channels: [
      {
        id: 'cctv14-live-0',
        label: 'CCTV-14 直播信号',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'https://cctv-live.cctv.com/cctv14/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'kids-ch-aniworld',
    dial: 165,
    name: '炫动卡通 Aniworld Kids',
    shortMark: 'ANIW',
    brandTone: '#6366F1',
    network: 'SMG Shanghai',
    category: 'infantil_kids',
    quality: '1080p HD',
    description: '全天候优秀国产少儿卡通展播 · 喜羊羊、熊出没与经典国漫',
    languages: ['ZH', '中文'],
    langCode: 'zh',
    channels: [
      {
        id: 'aniworld-live-0',
        label: '炫动卡通高清直播',
        lang: 'ZH',
        quality: '1080p',
        sourceUrl: 'https://aniworld-live.smg.cn/live/aniworld.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

export function kidsChannelToCatalogMovie(ch: KidsLiveChannelEntry): CatalogMovie {
  const directUrl = ch.channels[0]?.sourceUrl || '';
  const referer = ch.channels[0]?.referer || '';
  const proxiedHls = directUrl ? buildHlsProxyUrl(directUrl, referer) : '';
  return {
    id: `kids-live-${ch.id}`,
    tmdbId: ch.dial,
    mediaType: 'tv',
    title: ch.name,
    originalTitle: ch.name,
    year: '2025',
    rating: '9.9',
    overview: ch.description,
    poster: ch.logoUrl || '',
    backdrop: ch.logoUrl || '',
    languages: ch.languages,
    genres: ['Infantil', 'En Directo', 'Canales TV'],
    platform: 'Riffan Kids Live',
    quality: 'HD Kids Directo',
    bingetrixUrl: proxiedHls || directUrl,
    movidyUrl: directUrl,
  };
}

export { KIDS_CURATED_SHOWCASE } from './kidsCuratedShowcase.ts';

export function normalizeKidsLang(raw: unknown): KidsLanguageCode {
  const val = String(raw || 'es').trim().toLowerCase();
  if (val === 'cat') return 'ca';
  if (val === 'vlaams' || val === 'flamenco' || val === 'flemish') return 'nl';
  if (val === 'ar-ma' || val === 'arabic') return 'ar';
  if (val === 'zh-cn' || val === 'zh-hans') return 'zh';
  const valid: KidsLanguageCode[] = ['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh'];
  return valid.includes(val as KidsLanguageCode) ? (val as KidsLanguageCode) : 'es';
}
