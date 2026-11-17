import type { Express, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildTmdbImageUrl, fetchTmdbJson } from '../services/tmdbService.ts';
import { buildHlsProxyUrl, CHROME_UA } from '../extractors/httpHelpers.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import type { CatalogMovie } from '../../src/types.ts';

export type KidsLanguageCode = 'es' | 'ca' | 'en' | 'nl' | 'fr' | 'ar' | 'rif' | 'zh';
export type KidsAgeGroup = '3-5' | '6-8' | '9-12';

interface TmdbResultItem {
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

const KIDS_TMDB_LANG_MAP: Record<KidsLanguageCode, string> = {
  es: 'es-ES',
  ca: 'ca-ES',
  en: 'en-US',
  nl: 'nl-BE', // Flemish / Vlaams
  fr: 'fr-FR',
  ar: 'ar-SA',
  rif: 'es-ES',
  zh: 'zh-CN',
};

const KIDS_LANGUAGE_NAMES: Record<KidsLanguageCode, string> = {
  es: 'Spanish (Español)',
  ca: 'Catalan (Català)',
  en: 'English',
  nl: 'Flemish / Belgian Dutch (Vlaams / Flamenco)',
  fr: 'French (Français)',
  ar: 'Arabic (العربية - simple Modern Standard / kid-friendly)',
  rif: 'Authentic everyday spoken Riffian Berber (Tarifit n Arrif, e.g. Nador / Al Hoceima; strictly avoid artificial standard Tamazight neologisms like isura, imazraren, or tiliẓriyin)',
  zh: 'Simplified Mandarin Chinese (中文)',
};

const KIDS_AUDIO_BADGE_MAP: Record<KidsLanguageCode, string[]> = {
  es: ['ES', 'Castellano'],
  ca: ['CAT', 'Català'],
  en: ['EN', 'English'],
  nl: ['NL', 'Vlaams'],
  fr: ['FR', 'Français'],
  ar: ['AR', 'العربية'],
  rif: ['RIF', 'Tarifit'],
  zh: ['ZH', '中文'],
};

const CURATED_KIDS_QUERIES: Record<KidsLanguageCode, Array<{ q: string; type: 'movie' | 'tv' }>> = {
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

const KIDS_THEME_QUERIES: Record<string, Array<{ q: string; type: 'movie' | 'tv' }>> = {
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

export const KIDS_CURATED_SHOWCASE: Record<KidsLanguageCode, CatalogMovie[]> = {
  es: [
    {
      id: 'kids-showcase-es-1',
      tmdbId: 862,
      mediaType: 'movie',
      title: 'Toy Story (Castellano)',
      originalTitle: 'Toy Story',
      year: '1995',
      rating: '8.3',
      overview: 'Woody y Buzz Lightyear en la aventura más querida del cine infantil.',
      poster: 'https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/lxD5ak7ZaMbLPPx29ioPu2hODLO.jpg',
      languages: ['ES', 'Castellano'],
      genres: ['Animación', 'Aventura', 'Familia'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-es-2',
      tmdbId: 354912,
      mediaType: 'movie',
      title: 'Coco (Castellano)',
      originalTitle: 'Coco',
      year: '2017',
      rating: '8.2',
      overview: 'Miguel viaja a la mágica Tierra de los Muertos para descubrir el legado de su familia y la música.',
      poster: 'https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/askg3SMvhqEl4OL52YuvdtQw40Y.jpg',
      languages: ['ES', 'Castellano'],
      genres: ['Animación', 'Familia', 'Música'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-es-3',
      tmdbId: 1022789,
      mediaType: 'movie',
      title: 'Del Revés 2 (Inside Out 2)',
      originalTitle: 'Inside Out 2',
      year: '2024',
      rating: '7.6',
      overview: 'Riley entra en la adolescencia y llegan nuevas emociones al cuartel general.',
      poster: 'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/stKGOm8wqGGOFrtT9SSgqoCLhmW.jpg',
      languages: ['ES', 'Castellano'],
      genres: ['Animación', 'Aventura', 'Comedia'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-es-4',
      tmdbId: 82728,
      mediaType: 'tv',
      title: 'Bluey (Castellano)',
      originalTitle: 'Bluey',
      year: '2018',
      rating: '9.1',
      overview: 'La perrita Bluey transforma cualquier momento del día a día en un juego lleno de imaginación.',
      poster: 'https://image.tmdb.org/t/p/w500/77u7e5T4H5Lgq5u0V6P1k2lX3eF.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/c8Zk43x8H9V5Lq1j9R7a1n3X2mK.jpg',
      languages: ['ES', 'Castellano'],
      genres: ['Infantil', 'Familia', 'Aventura'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-es-5',
      tmdbId: 324857,
      mediaType: 'movie',
      title: 'Spider-Man: Un Nuevo Universo',
      originalTitle: 'Spider-Man: Into the Spider-Verse',
      year: '2018',
      rating: '8.4',
      overview: 'Miles Morales aprende lo que significa ser un verdadero héroe arácnido.',
      poster: 'https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/7d6woSTJ0mJgScQpS609Zf61zH9.jpg',
      languages: ['ES', 'Castellano'],
      genres: ['Animación', 'Acción', 'Aventura'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-es-6',
      tmdbId: 8392,
      mediaType: 'movie',
      title: 'Mi Vecino Totoro',
      originalTitle: 'となりのトトロ',
      year: '1988',
      rating: '8.1',
      overview: 'Dos hermanas se mudan al campo y conocen a los amigables espíritus del bosque.',
      poster: 'https://image.tmdb.org/t/p/w500/rtGDOeG9LzoRtVq5l9tXj1hT6eK.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/8tH9pQ1oQvG8yZ1vO8j6eL7q8.jpg',
      languages: ['ES', 'Castellano'],
      genres: ['Animación', 'Fantasía', 'Familia'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  ca: [
    {
      id: 'kids-showcase-ca-1',
      tmdbId: 12971,
      mediaType: 'tv',
      title: 'Bola de Drac Z (Català 3Cat)',
      originalTitle: 'Dragon Ball Z',
      year: '1989',
      rating: '8.4',
      overview: 'En Goku i els guerrers de l’espai en l’emissió mítica en llengua catalana.',
      poster: 'https://image.tmdb.org/t/p/w500/dZyLSmgZ8aG8v4T5r5P3k4o5n.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/e78uQfC9oZlJ0Oq3u5r5P3k4o5n.jpg',
      languages: ['CAT', 'Català'],
      genres: ['Animació', 'Acció', 'Aventura'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-ca-2',
      tmdbId: 46261,
      mediaType: 'tv',
      title: 'Doraemon el Gat Còsmic (Català)',
      originalTitle: 'Doraemon',
      year: '1979',
      rating: '8.0',
      overview: 'En Nobita i el gat robot vingut del segle XXII viuen mil aventures amb els seus invents màgics.',
      poster: 'https://image.tmdb.org/t/p/w500/3oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/4oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['CAT', 'Català'],
      genres: ['Animació', 'Comèdia', 'Infantil'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-ca-3',
      tmdbId: 30983,
      mediaType: 'tv',
      title: 'Shin-chan (Català SX3)',
      originalTitle: 'Crayon Shin-chan',
      year: '1992',
      rating: '7.9',
      overview: 'El nen més trapella de Kasukabe fa riure a tothom amb en Nevat i la seva família Nohara.',
      poster: 'https://image.tmdb.org/t/p/w500/5oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/6oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['CAT', 'Català'],
      genres: ['Animació', 'Comèdia', 'Familia'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-ca-4',
      tmdbId: 30984,
      mediaType: 'tv',
      title: 'El Detectiu Conan (Català)',
      originalTitle: 'Meitantei Conan',
      year: '1996',
      rating: '8.3',
      overview: 'En Shinichi Kudo resol els misteris més fascinants sota la identitat d’un nen prodigi.',
      poster: 'https://image.tmdb.org/t/p/w500/7oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/8oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['CAT', 'Català'],
      genres: ['Animació', 'Misteri', 'Aventura'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  en: [
    {
      id: 'kids-showcase-en-1',
      tmdbId: 1184918,
      mediaType: 'movie',
      title: 'The Wild Robot',
      originalTitle: 'The Wild Robot',
      year: '2024',
      rating: '8.4',
      overview: 'A shipwrecked robot named Roz builds bonds with island wildlife and raises an orphaned gosling.',
      poster: 'https://image.tmdb.org/t/p/w500/wTnV3PCVW5O92JMrZISSH22v7bg.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/417tYZ4ARUyKqaYxcJb2b516f4H.jpg',
      languages: ['EN', 'English'],
      genres: ['Animation', 'Family', 'Sci-Fi'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-en-2',
      tmdbId: 762509,
      mediaType: 'movie',
      title: 'Paddington in Peru',
      originalTitle: 'Paddington in Peru',
      year: '2024',
      rating: '7.8',
      overview: 'Paddington returns to Peru to visit his beloved Aunt Lucy at the Home for Retired Bears.',
      poster: 'https://image.tmdb.org/t/p/w500/1p55Ta1p8U5m7n5r5P3k4o5n8aG.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/2p55Ta1p8U5m7n5r5P3k4o5n8aG.jpg',
      languages: ['EN', 'English'],
      genres: ['Animation', 'Comedy', 'Family'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-en-3',
      tmdbId: 82728,
      mediaType: 'tv',
      title: 'Bluey: Season 3',
      originalTitle: 'Bluey',
      year: '2023',
      rating: '9.2',
      overview: 'Heartwarming family games that ignite joyful creativity for kids and parents alike.',
      poster: 'https://image.tmdb.org/t/p/w500/77u7e5T4H5Lgq5u0V6P1k2lX3eF.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/c8Zk43x8H9V5Lq1j9R7a1n3X2mK.jpg',
      languages: ['EN', 'English'],
      genres: ['Animation', 'Kids', 'Comedy'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  nl: [
    {
      id: 'kids-showcase-nl-1',
      tmdbId: 247080,
      mediaType: 'movie',
      title: 'Maja de Bij: De Film (Vlaams)',
      originalTitle: 'Maya the Bee Movie',
      year: '2014',
      rating: '7.4',
      overview: 'Maja en Willy verlaten de bijenkorf om de koningin te redden in een spannend avontuur.',
      poster: 'https://image.tmdb.org/t/p/w500/9oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/1oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['NL', 'Vlaams'],
      genres: ['Animatie', 'Familie', 'Avontuur'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-nl-2',
      tmdbId: 104250,
      mediaType: 'tv',
      title: 'Samson en Gert (Ketnet)',
      originalTitle: 'Samson en Gert',
      year: '1990',
      rating: '7.8',
      overview: 'De legendarische sprekende hond en zijn baasje in de bekendste kinderserie van Vlaanderen.',
      poster: 'https://image.tmdb.org/t/p/w500/2oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/3oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['NL', 'Vlaams'],
      genres: ['Jeugd', 'Komedie', 'Familie'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-nl-3',
      tmdbId: 75174,
      mediaType: 'movie',
      title: 'K3 Dierenhotel',
      originalTitle: 'K3 Dierenhotel',
      year: '2014',
      rating: '7.1',
      overview: 'Hanne, Marthe en Julia beleven vrolijke avonturen vol muziek en vriendschap.',
      poster: 'https://image.tmdb.org/t/p/w500/4oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/5oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['NL', 'Vlaams'],
      genres: ['Muziek', 'Familie', 'Avontuur'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  fr: [
    {
      id: 'kids-showcase-fr-1',
      tmdbId: 309809,
      mediaType: 'movie',
      title: 'Le Petit Prince (Français)',
      originalTitle: 'The Little Prince',
      year: '2015',
      rating: '8.0',
      overview: 'Un chef-d’œuvre poétique où une petite fille rencontre l’Aviateur et redécouvre l’enfance.',
      poster: 'https://image.tmdb.org/t/p/w500/6oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/7oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['FR', 'Français'],
      genres: ['Animation', 'Conte', 'Famille'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-fr-2',
      tmdbId: 284293,
      mediaType: 'movie',
      title: 'Astérix : Le Domaine des Dieux',
      originalTitle: 'Astérix - Le Domaine des Dieux',
      year: '2014',
      rating: '7.5',
      overview: 'Jules César tente d’assimiler le célèbre village gaulois avec une résidence luxueuse.',
      poster: 'https://image.tmdb.org/t/p/w500/8oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/9oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['FR', 'Français'],
      genres: ['Animation', 'Aventure', 'Comédie'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-fr-3',
      tmdbId: 65334,
      mediaType: 'tv',
      title: 'Miraculous : Ladybug & Chat Noir',
      originalTitle: 'Miraculous, les aventures de Ladybug et Chat Noir',
      year: '2015',
      rating: '8.1',
      overview: 'Marinette et Adrien protègent Paris contre le Papillon grâce à leurs pouvoirs magiques.',
      poster: 'https://image.tmdb.org/t/p/w500/1oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/2oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['FR', 'Français'],
      genres: ['Animation', 'Action', 'Famille'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  ar: [
    {
      id: 'kids-showcase-ar-1',
      tmdbId: 381696,
      mediaType: 'movie',
      title: 'بلال: بطل من سلالة جديدة',
      originalTitle: 'Bilal: A New Breed of Hero',
      year: '2015',
      rating: '7.9',
      overview: 'قصة ملحمية تاريخية مستوحاة من الشجاعة والحرية والإنسانية.',
      poster: 'https://image.tmdb.org/t/p/w500/3oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/4oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['AR', 'العربية'],
      genres: ['رسوم متحركة', 'تاريخ', 'مغامرة'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-ar-2',
      tmdbId: 832563,
      mediaType: 'movie',
      title: 'الرحلة (The Journey)',
      originalTitle: 'The Journey',
      year: '2021',
      rating: '7.5',
      overview: 'فيلم رسوم متحركة عربي ياباني ملحمي يروي الدفاع عن مكة المكرمة بالقيم والشجاعة.',
      poster: 'https://image.tmdb.org/t/p/w500/5oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/6oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['AR', 'العربية'],
      genres: ['أنيمي', 'مغامرة', 'أكشن'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  rif: [
    {
      id: 'kids-showcase-rif-1',
      tmdbId: 8587,
      mediaType: 'movie',
      title: 'Aslem Amectuc (Nemo n Arrif)',
      originalTitle: 'Finding Nemo (Tarifit Dub)',
      year: '2003',
      rating: '8.2',
      overview: 'Aseqsi ɣef uslem amectuc g waman n lebḥar ameqqran · Tiḥuja n Arrif s Tarifit.',
      poster: 'https://image.tmdb.org/t/p/w500/7oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/8oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['RIF', 'Tarifit'],
      genres: ['Animación', 'Aventura', 'Familia'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-rif-2',
      tmdbId: 8588,
      mediaType: 'movie',
      title: 'Ayaziw d Taydit (Rey León s Tarifit)',
      originalTitle: 'The Lion King (Tarifit Dub)',
      year: '1994',
      rating: '8.5',
      overview: 'Aznag n ayaziw g taddart n teẓgi tameqqrant d tefrawt n Arrif.',
      poster: 'https://image.tmdb.org/t/p/w500/9oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/1oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['RIF', 'Tarifit'],
      genres: ['Animación', 'Familia', 'Música'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-rif-3',
      tmdbId: 82728,
      mediaType: 'tv',
      title: 'Bluey s Tmaziɣt Tarifit',
      originalTitle: 'Bluey (Tarifit Kids Edition)',
      year: '2023',
      rating: '9.3',
      overview: 'Iraren n taddart d twacult s tmeslayt n Nador d Al Hoceima.',
      poster: 'https://image.tmdb.org/t/p/w500/77u7e5T4H5Lgq5u0V6P1k2lX3eF.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/c8Zk43x8H9V5Lq1j9R7a1n3X2mK.jpg',
      languages: ['RIF', 'Tarifit'],
      genres: ['Animación', 'Infantil', 'Familia'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
  zh: [
    {
      id: 'kids-showcase-zh-1',
      tmdbId: 614930,
      mediaType: 'movie',
      title: '哪吒之魔童降世 (Ne Zha)',
      originalTitle: '哪吒之魔童降世',
      year: '2019',
      rating: '7.9',
      overview: '我命由我不由天！少年哪吒逆天改命、守护陈塘关百姓的传奇冒险。',
      poster: 'https://image.tmdb.org/t/p/w500/2oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/3oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['ZH', '中文'],
      genres: ['动画', '奇幻', '冒险'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-zh-2',
      tmdbId: 1079091,
      mediaType: 'movie',
      title: '长安三万里 (Chang An)',
      originalTitle: '长安三万里',
      year: '2023',
      rating: '8.1',
      overview: '跟着高适与李白漫游大唐盛世，体会壮丽诗篇与千年少年的梦想。',
      poster: 'https://image.tmdb.org/t/p/w500/4oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/5oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['ZH', '中文'],
      genres: ['动画', '历史', '诗歌'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
    {
      id: 'kids-showcase-zh-3',
      tmdbId: 1071215,
      mediaType: 'movie',
      title: '熊出没·伴我“熊芯”',
      originalTitle: 'Boonie Bears: Guardian Code',
      year: '2023',
      rating: '7.6',
      overview: '熊大熊二在森林与高科技机器人研究所展开的感人母爱与亲情冒险。',
      poster: 'https://image.tmdb.org/t/p/w500/6oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      backdrop: 'https://image.tmdb.org/t/p/w780/7oQzZ1k8n5r5P3k4o5n8aG8v4T.jpg',
      languages: ['ZH', '中文'],
      genres: ['动画', '科幻', '家庭'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    },
  ],
};

function normalizeKidsLang(raw: unknown): KidsLanguageCode {
  const val = String(raw || 'es').trim().toLowerCase();
  if (val === 'cat') return 'ca';
  if (val === 'vlaams' || val === 'flamenco' || val === 'flemish') return 'nl';
  if (val === 'ar-ma' || val === 'arabic') return 'ar';
  if (val === 'zh-cn' || val === 'zh-hans') return 'zh';
  const valid: KidsLanguageCode[] = ['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh'];
  return valid.includes(val as KidsLanguageCode) ? (val as KidsLanguageCode) : 'es';
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

function parseGeminiJson<T>(rawText: string | undefined, fallback: T): T {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error('Invalid JSON returned by AI model');
  }
}

function formatGeminiRouteError(err: unknown, defaultMsg: string): { status: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err || '');
  const anyErr = err as { status?: number; code?: number };
  const statusCode = Number(anyErr?.status || anyErr?.code || 0);

  if (
    statusCode === 400 ||
    statusCode === 403 ||
    /API_KEY_INVALID|PERMISSION_DENIED|ACCESS_TOKEN_SCOPE_INSUFFICIENT|API key/i.test(rawMsg)
  ) {
    return {
      status: statusCode === 400 ? 400 : 403,
      message: 'La clave de IA no es válida o no tiene permisos. Revísala en Settings > Secrets.',
    };
  }
  if (statusCode === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMsg)) {
    return {
      status: 429,
      message: 'Límite temporal de consultas IA alcanzado. Intenta de nuevo en unos segundos.',
    };
  }
  if (statusCode === 404 || /NOT_FOUND/i.test(rawMsg)) {
    return {
      status: 404,
      message: 'Modelo de IA no disponible temporalmente.',
    };
  }
  if (statusCode === 504 || /timeout|ETIMEDOUT|ABORT_ERR/i.test(rawMsg)) {
    return {
      status: 504,
      message: 'Profe IA tardó demasiado en responder. Pulsa de nuevo para reintentar.',
    };
  }
  return {
    status: 500,
    message: defaultMsg,
  };
}

async function withGeminiTimeout<T>(fn: () => Promise<T>, timeoutMs = 12000): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini request timeout')), timeoutMs);
    }),
  ]);
}

async function withGeminiRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await withGeminiTimeout(fn, 12000);
  } catch (err) {
    const anyErr = err as { status?: number };
    const status = Number(anyErr?.status || 0);
    const msg = err instanceof Error ? err.message : '';
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 429 ||
      /timeout/i.test(msg)
    ) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, 320));
    return await withGeminiTimeout(fn, 10000);
  }
}

function mapTmdbItemToKidsCatalogMovie(
  item: TmdbResultItem,
  mediaType: 'movie' | 'tv',
  kidsLang: KidsLanguageCode
): CatalogMovie | null {
  if (!item?.id || !item?.poster_path) return null;
  const title = item.title || item.name || item.original_title || item.original_name || 'Riffan Kids';
  const rawDate = item.release_date || item.first_air_date || '';
  const year = rawDate ? rawDate.slice(0, 4) : '2024';
  const langBadges = KIDS_AUDIO_BADGE_MAP[kidsLang] || ['ES'];

  return {
    id: `kids-${mediaType}-${item.id}`,
    tmdbId: item.id,
    mediaType,
    title,
    originalTitle: item.original_title || item.original_name || title,
    year,
    rating: Number(item.vote_average || 7.5).toFixed(1),
    overview: item.overview || '',
    poster: buildTmdbImageUrl(item.poster_path, 'w500'),
    backdrop: item.backdrop_path
      ? buildTmdbImageUrl(item.backdrop_path, 'w780')
      : buildTmdbImageUrl(item.poster_path, 'w780'),
    languages: langBadges,
    genres: mediaType === 'tv' ? ['Infantil', 'Serie'] : ['Infantil', 'Animación'],
    platform: 'Riffan Kids',
    quality: 'HD Kids',
  };
}

async function fetchKidsDiscoverItems(
  kidsLang: KidsLanguageCode,
  category: string,
  query: string,
  ageGroup: KidsAgeGroup = '6-8'
): Promise<CatalogMovie[]> {
  // Direct live kids channels category
  if (category === 'live' || category === 'canales') {
    const sortedChannels = [...KIDS_LIVE_CHANNELS].sort((a, b) => {
      if (a.langCode === kidsLang && b.langCode !== kidsLang) return -1;
      if (b.langCode === kidsLang && a.langCode !== kidsLang) return 1;
      return a.dial - b.dial;
    });
    return sortedChannels.map(kidsChannelToCatalogMovie);
  }

  const tmdbLang = KIDS_TMDB_LANG_MAP[kidsLang] || 'es-ES';
  const collected: CatalogMovie[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (item: CatalogMovie | null) => {
    if (!item) return;
    const key = `${item.mediaType || 'movie'}-${item.tmdbId || item.id}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    collected.push(item);
  };

  try {
    if (query.trim()) {
      const encodedQ = encodeURIComponent(query.trim());
      const [movieSearch, tvSearch] = await Promise.all([
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/search/movie?query=${encodedQ}&language=${tmdbLang}&include_adult=false&page=1`
        ),
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/search/tv?query=${encodedQ}&language=${tmdbLang}&include_adult=false&page=1`
        ),
      ]);

      const safeMovies = (movieSearch?.results || []).filter((m) => {
        const g = m.genre_ids || [];
        return g.includes(16) || g.includes(10751) || g.includes(12) || g.includes(35);
      });
      const safeTv = (tvSearch?.results || []).filter((t) => {
        const g = t.genre_ids || [];
        return g.includes(16) || g.includes(10751) || g.includes(10762);
      });

      safeMovies.forEach((m) => pushUnique(mapTmdbItemToKidsCatalogMovie(m, 'movie', kidsLang)));
      safeTv.forEach((t) => pushUnique(mapTmdbItemToKidsCatalogMovie(t, 'tv', kidsLang)));
      if (collected.length > 0) return collected.slice(0, 28);
    }

    if (KIDS_THEME_QUERIES[category]) {
      const themeSeeds = KIDS_THEME_QUERIES[category];
      const settled = await Promise.all(
        themeSeeds.map((seed) =>
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/search/${seed.type}?query=${encodeURIComponent(seed.q)}&language=${tmdbLang}&include_adult=false&page=1`
          ).then((data) => ({
            type: seed.type,
            items: (data?.results || []).slice(0, 2),
          }))
        )
      );
      for (const block of settled) {
        for (const rawItem of block.items) {
          pushUnique(mapTmdbItemToKidsCatalogMovie(rawItem, block.type, kidsLang));
        }
      }
      if (collected.length > 0) {
        return collected.slice(0, 24);
      }
    }

    const originCountryParam =
      kidsLang === 'nl'
        ? '&with_original_language=nl'
        : kidsLang === 'fr'
        ? '&with_original_language=fr'
        : kidsLang === 'zh'
        ? '&with_original_language=zh'
        : kidsLang === 'ar'
        ? '&with_original_language=ar'
        : kidsLang === 'ca'
        ? '&with_original_language=ca|ja|es'
        : '';

    const discoverRequests: Array<Promise<{ type: 'movie' | 'tv'; data: { results?: TmdbResultItem[] } | null }>> = [];

    if (category === 'series') {
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=10762|16&include_adult=false&page=1`
        ).then((data) => ({ type: 'tv' as const, data }))
      );
      if (originCountryParam) {
        discoverRequests.push(
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=16|10751|10762${originCountryParam}&include_adult=false&page=1`
          ).then((data) => ({ type: 'tv' as const, data }))
        );
      }
    } else if (category === 'educational') {
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/tv?language=${tmdbLang}&sort_by=vote_average.desc&vote_count.gte=25&with_genres=10762,99&include_adult=false&page=1`
        ).then((data) => ({ type: 'tv' as const, data })),
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&certification_country=ES&certification.lte=7&with_genres=99,10751&include_adult=false&page=1`
        ).then((data) => ({ type: 'movie' as const, data }))
      );
    } else if (category === 'family') {
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&certification_country=ES&certification.lte=7&with_genres=10751&without_genres=27,53&include_adult=false&page=1`
        ).then((data) => ({ type: 'movie' as const, data }))
      );
    } else {
      if (originCountryParam) {
        discoverRequests.push(
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&with_genres=16|10751${originCountryParam}&include_adult=false&page=1`
          ).then((data) => ({ type: 'movie' as const, data })),
          fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=16|10762${originCountryParam}&include_adult=false&page=1`
          ).then((data) => ({ type: 'tv' as const, data }))
        );
      }
      const certMax = ageGroup === '3-5' ? '0' : '7';
      discoverRequests.push(
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/movie?language=${tmdbLang}&sort_by=popularity.desc&certification_country=ES&certification.lte=${certMax}&with_genres=16,10751&include_adult=false&page=1`
        ).then((data) => ({ type: 'movie' as const, data })),
        fetchTmdbJson<{ results?: TmdbResultItem[] }>(
          `/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_genres=10762|16&include_adult=false&page=1`
        ).then((data) => ({ type: 'tv' as const, data }))
      );
    }

    const curatedSeeds = CURATED_KIDS_QUERIES[kidsLang] || CURATED_KIDS_QUERIES.es;
    const curatedPromises = curatedSeeds.slice(0, 4).map((seed) =>
      fetchTmdbJson<{ results?: TmdbResultItem[] }>(
        `/search/${seed.type}?query=${encodeURIComponent(seed.q)}&language=${tmdbLang}&include_adult=false&page=1`
      ).then((data) => ({
        type: seed.type,
        data: data?.results ? { results: data.results.slice(0, 2) } : null,
      }))
    );

    const settled = await Promise.all([...curatedPromises, ...discoverRequests]);
    for (const block of settled) {
      const items = block.data?.results || [];
      for (const rawItem of items) {
        pushUnique(mapTmdbItemToKidsCatalogMovie(rawItem, block.type, kidsLang));
      }
    }
  } catch (err) {
    logger.warn({ err, kidsLang, category }, 'kids_catalog_fetch_failed');
  }

  // Showcase fallback guarantee for authentic kid-friendly titles
  if (collected.length < 12) {
    const showcasePool = [
      ...(KIDS_CURATED_SHOWCASE[kidsLang] || []),
      ...KIDS_CURATED_SHOWCASE.es,
    ];
    for (const item of showcasePool) {
      pushUnique(item);
    }
  }

  if (ageGroup === '3-5' && collected.length > 1) {
    const gentleRegex = /\b(peppa|pocoyo|bluey|bing|dora|paw|patrulla|clan|mickey|totoro|panda|dino|bebé|bebe|baby)\b/i;
    collected.sort((a, b) => {
      const aScore = (a.mediaType === 'tv' ? 1 : 0) + (gentleRegex.test(`${a.title} ${a.overview}`) ? 3 : 0);
      const bScore = (b.mediaType === 'tv' ? 1 : 0) + (gentleRegex.test(`${b.title} ${b.overview}`) ? 3 : 0);
      return bScore - aScore;
    });
  }

  return collected.slice(0, 28);
}

export function registerKidsRoutes(app: Express): void {
  // 0. Server AI / Gemini TTS capability discovery (avoids 503 noise on routine speech taps when key is unset)
  app.get('/api/kids/capabilities', (_req: Request, res: Response) => {
    const aiAvailable = Boolean(getGeminiClient());
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      aiAvailable,
      ttsAvailable: aiAvailable,
    });
  });

  // 1. Multilingual Kids Catalog (Movies + Series across 8 languages + theme worlds)
  app.get('/api/kids/catalog', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.query.lang);
    const category = String(req.query.category || 'all').trim().toLowerCase();
    const query = String(req.query.q || '').trim();
    const rawAge = String(req.query.ageGroup || '6-8').trim();
    const ageGroup: KidsAgeGroup =
      rawAge === '3-5' || rawAge === '9-12' ? rawAge : '6-8';

    const items = await fetchKidsDiscoverItems(kidsLang, category, query, ageGroup);
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({
      ok: true,
      lang: kidsLang,
      category,
      ageGroup,
      total: items.length,
      items,
    });
  });

  // 2. Gemini AI Kids Movie & Series Finder + Real TMDB Resolution
  app.post('/api/kids/ai-recommend', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const ageGroup = (String(req.body?.ageGroup || '6-8') as KidsAgeGroup);
    const prompt = String(req.body?.prompt || '').trim();

    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt requerido' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are Riffan Kids curator. A family wants age-safe movie or kids TV series recommendations for age group ${ageGroup} years old.
Target language for reply: ${KIDS_LANGUAGE_NAMES[kidsLang]}.
User request: "${prompt}"
Return 5 kid-safe animated or family movies/series matching the request. Use exact widely known English or international titles for searchTitle so TMDB search finds them reliably.`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                friendlyIntro: { type: Type.STRING },
                picks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      searchTitle: { type: Type.STRING },
                      mediaType: { type: Type.STRING },
                      whyKidsLoveIt: { type: Type.STRING },
                    },
                    required: ['searchTitle', 'mediaType', 'whyKidsLoveIt'],
                  },
                },
              },
              required: ['friendlyIntro', 'picks'],
            },
          },
        })
      );

      const parsed = parseGeminiJson<{
        friendlyIntro?: string;
        picks?: Array<{ searchTitle: string; mediaType: string; whyKidsLoveIt: string }>;
      }>(response.text, {});

      const tmdbLang = KIDS_TMDB_LANG_MAP[kidsLang] || 'es-ES';
      const picks = Array.isArray(parsed.picks) ? parsed.picks.slice(0, 6) : [];
      const resolvedItems: Array<CatalogMovie & { aiReason: string }> = [];

      await Promise.all(
        picks.map(async (pick) => {
          const mediaType: 'movie' | 'tv' = pick.mediaType === 'tv' ? 'tv' : 'movie';
          const searchRes = await fetchTmdbJson<{ results?: TmdbResultItem[] }>(
            `/search/${mediaType}?query=${encodeURIComponent(pick.searchTitle)}&language=${tmdbLang}&include_adult=false&page=1`
          ).catch(() => null);
          const first = searchRes?.results?.find((r) => Boolean(r.poster_path));
          const mapped = first ? mapTmdbItemToKidsCatalogMovie(first, mediaType, kidsLang) : null;
          if (mapped) {
            resolvedItems.push({ ...mapped, aiReason: pick.whyKidsLoveIt });
          }
        })
      );

      res.json({
        ok: true,
        intro: parsed.friendlyIntro || '',
        items: resolvedItems,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, kidsLang }, 'kids_ai_recommend_error');
      const mappedErr = formatGeminiRouteError(err, 'No se pudo generar la recomendación IA.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 3. Gemini Interactive Educational Storytelling Studio (8 Languages)
  app.post('/api/kids/ai-story', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const ageGroup = (String(req.body?.ageGroup || '6-8') as KidsAgeGroup);
    const hero = String(req.body?.hero || 'Zorro Estrella').trim().slice(0, 60);
    const setting = String(req.body?.setting || 'Bosque Mágico').trim().slice(0, 80);
    const moralValue = String(req.body?.moralValue || 'Amistad y curiosidad').trim().slice(0, 80);
    const previousStory = String(req.body?.previousStory || '').trim().slice(0, 1200);
    const chosenAction = String(req.body?.chosenAction || '').trim().slice(0, 160);
    const step = Number(req.body?.step || 1);

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const prompt = previousStory
        ? `Continue this interactive children's story (step ${step} of 3) in ${KIDS_LANGUAGE_NAMES[kidsLang]} for ages ${ageGroup}.
Previous narrative: "${previousStory}"
Child's choice: "${chosenAction}"
Continue warmly, end with either a cliffhanger choice (if step < 3) or a joyful conclusion (if step >= 3), plus a tiny 1-question reading comprehension quiz and 1 fun vocabulary word from the story.`
        : `Write Chapter 1 (step 1 of 3) of an interactive, educational children's story in ${KIDS_LANGUAGE_NAMES[kidsLang]} for ages ${ageGroup}.
Main Hero: ${hero}
Setting: ${setting}
Educational Theme / Moral Value: ${moralValue}
Keep sentences warm, vivid, kid-safe, and easy to read aloud. Provide 2 fun choices for how the child continues the adventure, 1 quick comprehension question, 1 featured vocabulary word, and an illustrationScene object describing the visual storybook frame.`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                chapterText: { type: Type.STRING },
                choiceA: { type: Type.STRING },
                choiceB: { type: Type.STRING },
                vocabularyWord: { type: Type.STRING },
                vocabularyMeaning: { type: Type.STRING },
                quizQuestion: { type: Type.STRING },
                quizOptions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctOptionIndex: { type: Type.INTEGER },
                illustrationScene: {
                  type: Type.OBJECT,
                  properties: {
                    skyTheme: { type: Type.STRING },
                    heroSymbol: { type: Type.STRING },
                    companionSymbol: { type: Type.STRING },
                    settingSymbol: { type: Type.STRING },
                    caption: { type: Type.STRING },
                  },
                  required: ['skyTheme', 'heroSymbol', 'companionSymbol', 'settingSymbol', 'caption'],
                },
              },
              required: [
                'title',
                'chapterText',
                'choiceA',
                'choiceB',
                'vocabularyWord',
                'vocabularyMeaning',
                'quizQuestion',
                'quizOptions',
                'correctOptionIndex',
                'illustrationScene',
              ],
            },
          },
        })
      );

      const story = parseGeminiJson<Record<string, unknown>>(response.text, {});
      res.json({ ok: true, step, story });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, kidsLang }, 'kids_ai_story_error');
      const mappedErr = formatGeminiRouteError(err, 'Error al crear el cuento mágico con IA.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 4. Gemini AI Educational Tutor (Math Hints, Science Q&A, Adaptive Trivia, 8-Lang Coach)
  app.post('/api/kids/ai-tutor', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const ageGroup = (String(req.body?.ageGroup || '6-8') as KidsAgeGroup);
    const mode = String(req.body?.mode || 'science_qa').trim();
    const topic = String(req.body?.topic || '').trim().slice(0, 180);
    const question = String(req.body?.question || '').trim().slice(0, 240);
    const targetWord = String(req.body?.targetWord || '').trim().slice(0, 80);

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      let instruction = '';
      if (mode === 'math_hint') {
        instruction = `You are a friendly primary school math coach speaking ${KIDS_LANGUAGE_NAMES[kidsLang]} to a child aged ${ageGroup}.
The child is solving: "${question || topic}".
Give a gentle, playful visual hint (e.g. counting stars, apples, or groups) WITHOUT spoiling complex steps unnecessarily, and give 1 short encouraging tip.`;
      } else if (mode === 'language_coach') {
        instruction = `You are a warm multilingual kids teacher. Teach a child aged ${ageGroup} how to use the word/phrase "${targetWord || topic}" in ${KIDS_LANGUAGE_NAMES[kidsLang]}.
Provide one ultra-simple example sentence, a phonetic pronunciation tip readable for kids, and a playful 3-option mini challenge question.`;
      } else if (mode === 'quiz_pack') {
        instruction = `Create an educational kids quiz question about "${topic || 'Space, Nature & World'}" for ages ${ageGroup} written completely in ${KIDS_LANGUAGE_NAMES[kidsLang]}.
Provide a short fun explanation, 4 multiple-choice answers (only one correct), and an encouraging celebration line.`;
      } else {
        instruction = `You are Profe IA, a cheerful science & nature guide for kids aged ${ageGroup}, responding in ${KIDS_LANGUAGE_NAMES[kidsLang]}.
Child asks: "${question || topic || 'Why is the sky blue?'}".
Answer in 2-3 vivid, joyful sentences kids love, share 1 surprising fun fact, and ask 1 quick 3-option curiosity quiz to reinforce learning.`;
      }

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: instruction,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                explanation: { type: Type.STRING },
                funFact: { type: Type.STRING },
                quizQuestion: { type: Type.STRING },
                quizOptions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctIndex: { type: Type.INTEGER },
                encouragement: { type: Type.STRING },
              },
              required: [
                'explanation',
                'funFact',
                'quizQuestion',
                'quizOptions',
                'correctIndex',
                'encouragement',
              ],
            },
          },
        })
      );

      const tutor = parseGeminiJson<Record<string, unknown>>(response.text, {});
      res.json({ ok: true, tutor });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, mode, kidsLang }, 'kids_ai_tutor_error');
      const mappedErr = formatGeminiRouteError(err, 'Profe IA no pudo responder ahora mismo.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 5. Gemini 3.8 Flash-Lite TTS Pronunciation & Story Read-Aloud
  app.post('/api/kids/tts', async (req: Request, res: Response) => {
    const text = String(req.body?.text || '').trim().slice(0, 650);
    const kidsLang = normalizeKidsLang(req.body?.lang);
    const style = String(req.body?.style || '').trim();

    if (!text) {
      return res.status(400).json({ ok: false, error: 'Texto requerido para audio.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const speechStyle =
        style ||
        `Warm, clear, cheerful storyteller and kids teacher speaking ${KIDS_LANGUAGE_NAMES[kidsLang]} slowly and clearly for children.`;

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text,
                  speechMetadata: {
                    style: speechStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        })
      );

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({ ok: false, error: 'No audio generated' });
      }

      res.json({
        ok: true,
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, kidsLang }, 'kids_tts_error');
      const mappedErr = formatGeminiRouteError(err, 'No se pudo generar voz IA.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 6. Gemini 8-Language Visual Word Translator for Kids
  app.post('/api/kids/ai-translate-word', async (req: Request, res: Response) => {
    const word = String(req.body?.word || '').trim().slice(0, 80);
    if (!word) {
      return res.status(400).json({ ok: false, error: 'Palabra requerida.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: 'La clave de IA (GEMINI_API_KEY) no está configurada en el servidor.',
      });
    }

    try {
      const langFieldSchema = {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          phonetic: { type: Type.STRING },
        },
        required: ['word', 'phonetic'],
      };

      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Translate the kid-friendly word or short phrase "${word}" into all 8 languages with simple readable phonetic pronunciation for children and 1 matching single emoji.
Languages required:
- es: Spanish
- ca: Catalan
- en: English
- nl: Belgian Dutch / Vlaams
- fr: French
- ar: Arabic (script + simple transliteration or kid-friendly form)
- rif: Authentic everyday spoken Riffian Berber (Tarifit n Arrif, never artificial standard Tamazight neologisms)
- zh: Simplified Mandarin Chinese with pinyin`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                emoji: { type: Type.STRING },
                translations: {
                  type: Type.OBJECT,
                  properties: {
                    es: langFieldSchema,
                    ca: langFieldSchema,
                    en: langFieldSchema,
                    nl: langFieldSchema,
                    fr: langFieldSchema,
                    ar: langFieldSchema,
                    rif: langFieldSchema,
                    zh: langFieldSchema,
                  },
                  required: ['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh'],
                },
              },
              required: ['emoji', 'translations'],
            },
          },
        })
      );

      const entry = parseGeminiJson<{
        emoji?: string;
        translations?: Record<KidsLanguageCode, { word: string; phonetic: string }>;
      }>(response.text, {});

      if (!entry?.translations) {
        return res.status(502).json({ ok: false, error: 'Respuesta incompleta del traductor IA.' });
      }
      res.json({
        ok: true,
        entry: {
          id: `custom-${Date.now()}`,
          category: 'family',
          emoji: entry.emoji || '✨',
          translations: entry.translations,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ errMsg, word }, 'kids_ai_translate_word_error');
      const mappedErr = formatGeminiRouteError(err, 'No se pudo traducir esa palabra ahora.');
      res.status(mappedErr.status).json({ ok: false, error: mappedErr.message });
    }
  });

  // 7. Kid-Safe YouTube Discovery across 8 Languages & Kid Categories (for Kids Independent Player)
  const kidsYtCache = new LruTtlCache<string, { items: CatalogMovie[]; ts: number }>(120, 5 * 60_000);

  const KIDS_YT_CATEGORY_QUERIES: Record<KidsLanguageCode, Record<string, string>> = {
    es: {
      all: 'Pocoyó Español Oficial Bluey Español capítulos completos',
      cartoons: 'Pocoyó Bluey Peppa Pig capítulos completos español oficial',
      songs: 'CantaJuego canciones infantiles español niños',
      animals: 'animales para niños documental educativo español',
      dinosaurs: 'dinosaurios para niños dibujos animados español',
      space: 'sistema solar planetas para niños español educativo',
      magic: 'cuentos infantiles animados español',
      educational: 'aprender colores números vocales niños español',
    },
    ca: {
      all: 'Mic SX3 Super3 dibuixos animats català infantil',
      cartoons: 'dibuixos animats en català capítols complets',
      songs: 'El Pot Petit cançons infantils català',
      animals: 'animals per a nens en català educatiu',
      dinosaurs: 'dinosaures per a nens en català',
      space: 'espai planetes per a nens en català',
      magic: 'contes infantils en català',
      educational: 'aprendre català nens petits cançons',
    },
    en: {
      all: 'Bluey Peppa Pig official kids cartoons full episodes',
      cartoons: 'kids cartoons full episodes family friendly english',
      songs: 'Super Simple Songs nursery rhymes kids',
      animals: 'wild animals for kids National Geographic Kids',
      dinosaurs: 'dinosaurs for kids educational cartoon',
      space: 'solar system planets for kids educational',
      magic: 'bedtime fairy tale stories for kids animated',
      educational: 'phonics ABC numbers learning video for kids',
    },
    nl: {
      all: 'Ketnet Junior Nijntje Bumba kinderliedjes vlaams',
      cartoons: 'Bumba Maya de Bij Nijntje nederlands vlaams',
      songs: 'K3 Studio 100 kinderliedjes vlaams',
      animals: 'dieren voor kinderen educatief nederlands',
      dinosaurs: 'dinosaurus voor kinderen nederlands',
      space: 'heelal planeten voor kinderen nederlands',
      magic: 'sprookjes voor kinderen nederlands animatie',
      educational: 'leren tellen kleuren voor peuters nederlands',
    },
    fr: {
      all: 'Tchoupi Petit Ours Brun dessins animés français',
      cartoons: 'dessin animé français complet enfant',
      songs: 'comptines pour enfants français chansons',
      animals: 'animaux pour enfants documentaire français',
      dinosaurs: 'dinosaures pour les enfants français',
      space: 'système solaire pour enfants français',
      magic: 'histoires contes pour enfants français',
      educational: 'apprendre alphabet chiffres enfants français',
    },
    ar: {
      all: 'كرتون اطفال بدون موسيقى سبيستون عربي',
      cartoons: 'أفلام كرتون للأطفال بالعربية حلقات كاملة',
      songs: 'أناشيد أطفال تعليمية عربية',
      animals: 'عالم الحيوانات للأطفال بالعربية',
      dinosaurs: 'الديناصورات للأطفال بالعربية',
      space: 'الفضاء والكواكب للأطفال بالعربية',
      magic: 'قصص الأطفال قبل النوم بالعربية',
      educational: 'تعليم الحروف والأرقام للأطفال بالعربية',
    },
    rif: {
      all: 'Tarifit Arrif kids songs cartoons tamazight children',
      cartoons: 'Tamazight Rif kids animated stories songs',
      songs: 'chansons rifaines enfants tamazight arrif',
      animals: 'animals documentary kids simple visual',
      dinosaurs: 'dinosaurs cartoon kids visual adventure',
      space: 'solar system space animation kids',
      magic: 'folk stories animation children',
      educational: 'kids visual numbers animals learning',
    },
    zh: {
      all: '宝宝巴士 熊出没 儿童动画片 中文',
      cartoons: '中文经典儿童动画片 完整版',
      songs: '中文儿歌 宝宝巴士 欢乐童谣',
      animals: '儿童动物科普 动画 中文',
      dinosaurs: '恐龙儿童动画片 中文科普',
      space: '太阳系宇宙科普 儿童动画 中文',
      magic: '中文睡前童话故事 动画',
      educational: '儿童学汉字 数字 启蒙动画',
    },
  };

  async function searchYouTubeKidsRaw(searchQuery: string, hl: string): Promise<CatalogMovie[]> {
    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&hl=${encodeURIComponent(hl)}&sp=EgIQAQ%253D%253D`,
      {
        headers: {
          'User-Agent': CHROME_UA,
          'Accept-Language': `${hl},en;q=0.8`,
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!ytRes.ok) return [];
    const html = await ytRes.text();
    const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
    if (!initMatch) return [];

    const data = JSON.parse(initMatch[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const collected: CatalogMovie[] = [];
    const seen = new Set<string>();
    const blockedPattern =
      /\b(horror|gore|18\+|nsfw|blood|kill|murder|scary|creepypasta|roblox|prision|prison|escapa|skibidi|huggy|poppy\s*playtime|fnaf|granny|banban|screamer|prank|broma|zombie|terror|miedo|muerte|asesino|exe)\b/i;

    for (const sec of sections) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr?.videoId || seen.has(vr.videoId)) continue;
        const title = (vr.title?.runs?.map((r: { text?: string }) => r.text).join('') || '').trim();
        const channel =
          vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube Kids';
        if (!title || blockedPattern.test(title) || blockedPattern.test(channel)) continue;
        const duration = vr.lengthText?.simpleText || '';
        // Skip Shorts/vertical clips missing normal duration or >2h streams if needed; keep lively clips & episodes
        seen.add(vr.videoId);
        collected.push({
          id: `yt-${vr.videoId}`,
          mediaType: 'movie',
          title,
          originalTitle: title,
          year: duration || 'YouTube',
          rating: '9.5',
          overview: channel,
          poster: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          backdrop: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
          languages: [hl.toUpperCase()],
          genres: ['YouTube Kids'],
          platform: 'YouTube Kids',
          quality: duration || 'HD',
          bingetrixUrl: vr.videoId,
        });
        if (collected.length >= 20) break;
      }
      if (collected.length >= 20) break;
    }
    return collected;
  }

  app.get('/api/kids/youtube', async (req: Request, res: Response) => {
    const kidsLang = normalizeKidsLang(req.query.lang);
    const category = String(req.query.category || 'all').trim().toLowerCase();
    const rawQuery = String(req.query.q || '').trim();
    const rawAge = String(req.query.ageGroup || '6-8').trim();
    const ageGroup: KidsAgeGroup =
      rawAge === '3-5' || rawAge === '9-12' ? rawAge : '6-8';

    if (category === 'live' || category === 'canales') {
      const sortedChannels = [...KIDS_LIVE_CHANNELS].sort((a, b) => {
        if (a.langCode === kidsLang && b.langCode !== kidsLang) return -1;
        if (b.langCode === kidsLang && a.langCode !== kidsLang) return 1;
        return a.dial - b.dial;
      });
      return res.json({
        ok: true,
        lang: kidsLang,
        category: 'live',
        items: sortedChannels.map(kidsChannelToCatalogMovie),
      });
    }

    const langDict = KIDS_YT_CATEGORY_QUERIES[kidsLang] || KIDS_YT_CATEGORY_QUERIES.es;
    const baseQuery = rawQuery
      ? `${rawQuery} ${kidsLang === 'en' ? 'kids' : kidsLang === 'es' ? 'niños infantil' : kidsLang === 'fr' ? 'enfants' : kidsLang === 'ar' ? 'أطفال' : kidsLang === 'zh' ? '儿童' : kidsLang === 'nl' ? 'kinderen' : kidsLang === 'ca' ? 'infantil català' : 'kids'} cartoon`
      : langDict[category] || langDict.all;

    const ageHint = ageGroup === '3-5' ? ' toddler preschool' : ageGroup === '9-12' ? '' : '';
    const finalQuery = `${baseQuery}${ageHint}`.trim();
    const cacheKey = `${kidsLang}:${category}:${ageGroup}:${finalQuery.toLowerCase()}`;
    const cached = kidsYtCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60_000) {
      return res.json({ ok: true, lang: kidsLang, category, items: cached.items });
    }

    const hlMap: Record<KidsLanguageCode, string> = {
      es: 'es',
      ca: 'ca',
      en: 'en',
      nl: 'nl',
      fr: 'fr',
      ar: 'ar',
      rif: 'es',
      zh: 'zh-CN',
    };

    try {
      let items = await searchYouTubeKidsRaw(finalQuery, hlMap[kidsLang] || 'es');
      if (items.length === 0 && rawQuery) {
        items = await searchYouTubeKidsRaw(`${rawQuery} kids`, 'en');
      }
      if (items.length === 0) {
        items = await searchYouTubeKidsRaw(KIDS_YT_CATEGORY_QUERIES.en[category] || KIDS_YT_CATEGORY_QUERIES.en.all, 'en');
      }
      kidsYtCache.set(cacheKey, { items, ts: Date.now() });
      res.setHeader('Cache-Control', 'public, max-age=180');
      return res.json({ ok: true, lang: kidsLang, category, items });
    } catch (err) {
      logger.warn({ err, kidsLang, category }, 'kids_youtube_search_error');
      return res.json({ ok: true, lang: kidsLang, category, items: [] });
    }
  });
}
