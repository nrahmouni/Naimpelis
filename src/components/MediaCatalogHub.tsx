import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Film,
  Play,
  RefreshCw,
  Loader2,
  Tv,
  Sparkles,
  X,
  Heart,
  Plus,
  Youtube,
  ArrowLeft,
  Trash2,
  ListVideo,
  Link2,
  Clock,
  Star,
  RotateCcw,
  Info,
  Columns2,
  Check,
  Vote,
  Radio,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Volume2,
  VolumeX,
  Bookmark,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AppLanguage,
  CatalaCatalogItem,
  CatalaCommunityLink,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  ChannelLiveEpg,
  EpgProgramItem,
  FavoriteChannelItem,
  LiveScoreMatch,
  RoomQueueItem,
  SpanishTdtChannel,
  SportsMatch,
  StreamingProviderId,
  TdtCategory,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../types';
import { UI_COPY, pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { useFocusTrap } from '../utils/useFocusTrap';
import { PosterImage } from './ui/PosterImage';
import { VirtualizedPosterGrid } from './VirtualizedPosterGrid';
import {
  buildChannelFavId,
  deduplicateWatchlist,
  getCatalogFavoriteKey,
  isSameCatalogItem,
  sanitizeItemKey,
} from '../utils/storage';
import { MediaDetailsModal } from './MediaDetailsModal';
import { FootballMatchboard } from './FootballMatchboard';
import { ExpandedDiscoverySection } from './ExpandedDiscoverySection';
import { LatestReleasesSection } from './LatestReleasesSection';
import stadiumBackdrop from '../assets/images/sports_stadium_backdrop_1794353709543.jpg';
import f1Backdrop from '../assets/images/motorsport_f1_backdrop_1794353709150.jpg';

function formatShortTime(sec?: number): string {
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
  | 'direct';

export type CatalogPillar = 'explore' | 'catalog' | 'anime' | 'live' | 'mylist';

export function normalizeCatalogPillar(
  section: CatalogSection,
  showWatchlistOnly = false
): CatalogPillar {
  if (showWatchlistOnly || section === 'direct') return 'mylist';
  if (section === 'home') return 'explore';
  if (section === 'anime' || section === 'catala') return 'anime';
  if (section === 'tdt' || section === 'sports' || section === 'youtube') return 'live';
  return 'catalog';
}

type AnimePortalId = 'anime_all' | 'crunchyroll' | 'animebox' | 'jkanime' | 'animeflv';

type FocusedHubMode =
  | 'all'
  | 'netflix'
  | 'hbomax'
  | 'disney'
  | 'prime'
  | 'apple'
  | 'skyshowtime'
  | 'movistar'
  | 'dazn'
  | 'uk_sports'
  | 'beinsports'
  | 'espn'
  | 'dsports'
  | 'tnt_space'
  | 'tdt_es';

const TDT_NATIONAL_CATEGORIES: {
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

const ALL_LIVE_CATEGORIES: { id: 'all' | 'tdt_all' | TdtCategory; es: string; ca: string; en: string }[] = [
  { id: 'all', es: 'Todos en Vivo', ca: 'Tots en Directe', en: 'All Live TV' },
  { id: 'uk_sports', es: 'UK Sports (EN)', ca: 'UK Sports (EN)', en: 'UK Sports (EN)' },
  { id: 'beinsports', es: 'beIN SPORTS', ca: 'beIN SPORTS', en: 'beIN SPORTS' },
  { id: 'espn', es: 'ESPN (1–7)', ca: 'ESPN (1–7)', en: 'ESPN (1–7)' },
  { id: 'dsports', es: 'DSports', ca: 'DSports', en: 'DSports' },
  { id: 'tnt_space', es: 'TNT y Space', ca: 'TNT i Space', en: 'TNT & Space' },
  { id: 'movistar', es: 'Movistar+', ca: 'Movistar+', en: 'Movistar+' },
  { id: 'dazn', es: 'DAZN', ca: 'DAZN', en: 'DAZN' },
  { id: 'tdt_all', es: 'TDT España', ca: 'TDT Espanya', en: 'Spain TDT' },
  { id: 'generalistas', es: 'La 1 · A3 · T5 · laSexta', ca: 'La 1 · A3 · T5 · laSexta', en: 'Main Channels (1–6)' },
];

const STREAMING_PLATFORMS: {
  id: StreamingProviderId;
  es: string;
  ca: string;
  en: string;
  mark: string;
  accentBg: string;
  accentText: string;
  activeBorder: string;
  cardGlow: string;
  descEs: string;
  descCa: string;
  descEn: string;
}[] = [
  {
    id: 'all',
    es: 'Todo el Catálogo',
    ca: 'Tot el Catàleg',
    en: 'All Platforms',
    mark: 'ALL',
    accentBg: 'bg-white/15',
    accentText: 'text-white',
    activeBorder: 'border-white bg-white text-[#050508]',
    cardGlow: 'from-zinc-800/40 to-[#0B0C12]',
    descEs: 'Todas las plataformas unidas',
    descCa: 'Totes les plataformes juntes',
    descEn: 'Every platform combined',
  },
  {
    id: 'netflix',
    es: 'Netflix',
    ca: 'Netflix',
    en: 'Netflix',
    mark: 'N',
    accentBg: 'bg-[#E50914]',
    accentText: 'text-white',
    activeBorder:
      'border-[#E50914] bg-[#E50914]/20 text-white shadow-[0_6px_22px_rgba(229,9,20,0.28)]',
    cardGlow: 'from-[#E50914]/22 via-[#17090D] to-[#0A0B10]',
    descEs: 'Películas y series de Netflix',
    descCa: 'Pel·lícules i sèries de Netflix',
    descEn: 'Netflix movies & series',
  },
  {
    id: 'hbomax',
    es: 'HBO Max',
    ca: 'HBO Max',
    en: 'HBO Max',
    mark: 'MAX',
    accentBg: 'bg-[#6D28D9]',
    accentText: 'text-white',
    activeBorder:
      'border-[#8B5CF6] bg-[#6D28D9]/25 text-white shadow-[0_6px_22px_rgba(124,58,237,0.3)]',
    cardGlow: 'from-[#6D28D9]/25 via-[#120D24] to-[#0A0B10]',
    descEs: 'Películas y series de HBO Max',
    descCa: "Pel·lícules i sèries d'HBO Max",
    descEn: 'HBO Originals, Warner & DC',
  },
  {
    id: 'disney',
    es: 'Disney+',
    ca: 'Disney+',
    en: 'Disney+',
    mark: 'D+',
    accentBg: 'bg-[#0063E5]',
    accentText: 'text-white',
    activeBorder:
      'border-[#3B82F6] bg-[#0063E5]/25 text-white shadow-[0_6px_22px_rgba(0,99,229,0.3)]',
    cardGlow: 'from-[#0063E5]/25 via-[#091326] to-[#0A0B10]',
    descEs: 'Disney, Pixar, Marvel y Star Wars',
    descCa: 'Disney, Pixar, Marvel i Star Wars',
    descEn: 'Disney, Pixar, Marvel & Star Wars',
  },
  {
    id: 'prime',
    es: 'Prime Video',
    ca: 'Prime Video',
    en: 'Prime Video',
    mark: 'PRIME',
    accentBg: 'bg-[#00A8E1]',
    accentText: 'text-[#041118]',
    activeBorder:
      'border-[#00A8E1] bg-[#00A8E1]/20 text-white shadow-[0_6px_22px_rgba(0,168,225,0.28)]',
    cardGlow: 'from-[#00A8E1]/22 via-[#081722] to-[#0A0B10]',
    descEs: 'Películas y series de Prime Video',
    descCa: 'Pel·lícules i sèries de Prime Video',
    descEn: 'Amazon Originals & Cinema',
  },
  {
    id: 'movistar',
    es: 'Movistar+',
    ca: 'Movistar+',
    en: 'Movistar+',
    mark: 'M+',
    accentBg: 'bg-[#019DF4]',
    accentText: 'text-white',
    activeBorder: 'border-[#019DF4] bg-[#019DF4]/20 text-white',
    cardGlow: 'from-[#019DF4]/24 via-[#071624] to-[#0A0B10]',
    descEs: 'Canales en vivo, cine y series',
    descCa: 'Canals en directe, cinema i sèries',
    descEn: 'Live TV channels, movies & series',
  },
  {
    id: 'apple',
    es: 'Apple TV+',
    ca: 'Apple TV+',
    en: 'Apple TV+',
    mark: 'tv+',
    accentBg: 'bg-zinc-100',
    accentText: 'text-[#050508]',
    activeBorder: 'border-zinc-300 bg-white/15 text-white',
    cardGlow: 'from-zinc-400/18 via-[#12131A] to-[#0A0B10]',
    descEs: 'Cine y series originales Apple',
    descCa: 'Cinema i sèries originals Apple',
    descEn: 'Apple Originals in HD',
  },
  {
    id: 'skyshowtime',
    es: 'SkyShowtime',
    ca: 'SkyShowtime',
    en: 'SkyShowtime',
    mark: 'SKY',
    accentBg: 'bg-[#0D9488]',
    accentText: 'text-white',
    activeBorder: 'border-[#14B8A6] bg-[#0D9488]/20 text-white',
    cardGlow: 'from-[#0D9488]/22 via-[#081919] to-[#0A0B10]',
    descEs: 'Universal, Paramount y series',
    descCa: 'Universal, Paramount i sèries',
    descEn: 'Universal & Paramount hits',
  },
];

const MOVIE_CATEGORIES = [
  { id: 'trending', es: 'Tendencias', ca: 'Tendències', en: 'Trending' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' },
  { id: 'now_playing', es: 'Estrenos Recientes', ca: 'Estrenes Recents', en: 'New Releases' },
  { id: 'action', es: 'Acción', ca: 'Acció', en: 'Action' },
  { id: 'scifi', es: 'Sci-Fi', ca: 'Ciència-ficció', en: 'Sci-Fi' },
  { id: 'horror', es: 'Terror', ca: 'Terror', en: 'Horror' },
  { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
  { id: 'animation', es: 'Animación', ca: 'Animació', en: 'Animation' },
  { id: 'thriller', es: 'Thriller', ca: 'Thriller', en: 'Thriller' },
  { id: 'adventure', es: 'Aventura', ca: 'Aventura', en: 'Adventure' },
  { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
] as const;

const SERIES_CATEGORIES = [
  { id: 'trending', es: 'Tendencias TV', ca: 'Tendències TV', en: 'Trending TV' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' },
  { id: 'scifi', es: 'Sci-Fi y Fantasía', ca: 'Ciència-ficció i Fantasia', en: 'Sci-Fi & Fantasy' },
  { id: 'action', es: 'Acción y Aventura', ca: 'Acció i Aventura', en: 'Action & Adventure' },
  { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
  { id: 'crime', es: 'Crimen', ca: 'Crim', en: 'Crime' },
  { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
  { id: 'animation', es: 'Animación y Anime', ca: 'Animació i Anime', en: 'Animation & Anime' },
  { id: 'mystery', es: 'Misterio', ca: 'Misteri', en: 'Mystery' },
] as const;

const ANIME_PLATFORMS: {
  id: AnimePortalId;
  es: string;
  ca: string;
  en: string;
  mark: string;
  accentBg: string;
  accentText: string;
  activeBorder: string;
  cardGlow: string;
  descEs: string;
  descCa: string;
  descEn: string;
  externalUrl?: string;
}[] = [
  {
    id: 'anime_all',
    es: 'Todo el Anime',
    ca: "Tot l'Anime",
    en: 'All Anime',
    mark: 'ANIME',
    accentBg: 'bg-white/15',
    accentText: 'text-white',
    activeBorder: 'border-white bg-white/[0.14] text-white shadow-[0_8px_24px_rgba(255,255,255,0.12)]',
    cardGlow: 'from-orange-500/18 via-[#141019] to-[#0B0C12]',
    descEs: 'Todas las webs de anime unidas',
    descCa: "Tots els portals d'anime junts",
    descEn: 'All anime portals combined',
  },
  {
    id: 'crunchyroll',
    es: 'Crunchyroll',
    ca: 'Crunchyroll',
    en: 'Crunchyroll',
    mark: 'CR',
    accentBg: 'bg-[#F47521]',
    accentText: 'text-[#120902]',
    activeBorder:
      'border-[#F47521] bg-[#F47521]/20 text-white shadow-[0_8px_24px_rgba(244,117,33,0.28)]',
    cardGlow: 'from-[#F47521]/25 via-[#191009] to-[#0B0C12]',
    descEs: 'Simulcasts, Shonen y Estrenos',
    descCa: 'Simulcasts, Shonen i Estrenes',
    descEn: 'Simulcasts, Shonen & Movies',
  },
  {
    id: 'animebox',
    es: 'AnimeBox',
    ca: 'AnimeBox',
    en: 'AnimeBox',
    mark: 'ABOX',
    accentBg: 'bg-[#E11D48]',
    accentText: 'text-white',
    activeBorder:
      'border-[#FB7185] bg-[#E11D48]/22 text-white shadow-[0_8px_24px_rgba(225,29,72,0.28)]',
    cardGlow: 'from-[#E11D48]/25 via-[#190B12] to-[#0B0C12]',
    descEs: 'Castellano y VOSE · Selecta',
    descCa: 'Doblat i VOSE · Selecta',
    descEn: 'Spanish Dub & Sub · Selecta',
  },
  {
    id: 'jkanime',
    es: 'JKAnime',
    ca: 'JKAnime',
    en: 'JKAnime',
    mark: 'JK',
    accentBg: 'bg-[#0EA5E9]',
    accentText: 'text-[#04131D]',
    activeBorder:
      'border-[#38BDF8] bg-[#0EA5E9]/20 text-white shadow-[0_8px_24px_rgba(14,165,233,0.28)]',
    cardGlow: 'from-[#0EA5E9]/24 via-[#091522] to-[#0B0C12]',
    descEs: 'En Emisión · Sub Español y Latino',
    descCa: 'En Emissió · Subtitulat',
    descEn: 'Simulcast · Sub & LatAm Dub',
    externalUrl: 'https://jkanime.net/',
  },
  {
    id: 'animeflv',
    es: 'AnimeFLV',
    ca: 'AnimeFLV',
    en: 'AnimeFLV',
    mark: 'FLV',
    accentBg: 'bg-[#10B981]',
    accentText: 'text-[#03150E]',
    activeBorder:
      'border-[#34D399] bg-[#10B981]/20 text-white shadow-[0_8px_24px_rgba(16,185,129,0.28)]',
    cardGlow: 'from-[#10B981]/22 via-[#081914] to-[#0B0C12]',
    descEs: 'Directorio Anime · Sub y Doblado',
    descCa: 'Directori Anime · Sub i Doblat',
    descEn: 'Full Directory · Sub & Dub',
    externalUrl: 'https://www3.animeflv.net/',
  },
];

const ANIME_CATEGORIES = [
  { id: 'trending', es: 'Tendencias', ca: 'Tendències', en: 'Trending' },
  { id: 'simulcast', es: 'En Emisión', ca: 'En Emissió', en: 'Simulcast Airing' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'shonen', es: 'Shonen y Acción', ca: 'Shonen i Acció', en: 'Shonen & Action' },
  { id: 'fantasy', es: 'Fantasía e Isekai', ca: 'Fantasia i Isekai', en: 'Fantasy & Isekai' },
  { id: 'top_rated', es: 'Mejor Valorados', ca: 'Més Ben Valorats', en: 'Top Rated' },
  { id: 'comedy', es: 'Comedia y Romance', ca: 'Comèdia i Romanç', en: 'Comedy & Romance' },
  { id: 'drama', es: 'Drama y Seinen', ca: 'Drama i Seinen', en: 'Drama & Seinen' },
] as const;

interface MasterpieceAnimePreset {
  tmdbId: number;
  title: string;
  subtitle: string;
  tag: string;
  rating: string;
  poster: string;
  backdrop: string;
}

const MASTERPIECE_ANIME_PRESETS: MasterpieceAnimePreset[] = [
  {
    tmdbId: 1429,
    title: 'Attack on Titan',
    subtitle: 'Ataque a los Titanes · 4 Temp.',
    tag: 'Shonen',
    rating: '9.0',
    poster: 'https://image.tmdb.org/t/p/w500/yFPQ4JhhirnCVe2UIKGMYX7TOGZ.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/rqbCbjB19amtOtFQbb3K2lgm2zv.jpg',
  },
  {
    tmdbId: 127532,
    title: 'Solo Leveling',
    subtitle: 'Ore dake Level Up · 25 Caps.',
    tag: 'Acción',
    rating: '8.6',
    poster: 'https://image.tmdb.org/t/p/w500/eCD7WS9h4lCT8N4Xavc9u8R1IGk.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/xMNH87maNLt9n2bMDYeI6db5VFm.jpg',
  },
  {
    tmdbId: 95479,
    title: 'Jujutsu Kaisen',
    subtitle: '3 Temp. · Culling Game · 59 Caps.',
    tag: 'Estreno T3',
    rating: '8.8',
    poster: 'https://image.tmdb.org/t/p/w500/zKFkzRn1UyE11Jv9CJjVmvmQFvR.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg',
  },
  {
    tmdbId: 85937,
    title: 'Demon Slayer',
    subtitle: 'Kimetsu no Yaiba · 4 Temp.',
    tag: 'Fantasía',
    rating: '8.7',
    poster: 'https://image.tmdb.org/t/p/w500/inXU5hvbDbitrYOgLrq2QjYqiJD.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/nTvM4mhqNlHIvUkI1gVnW6XP7GG.jpg',
  },
  {
    tmdbId: 31911,
    title: 'Fullmetal Alchemist: Brotherhood',
    subtitle: 'Hagane no Renkinjutsushi · 64 Caps.',
    tag: 'Clásico',
    rating: '9.0',
    poster: 'https://image.tmdb.org/t/p/w500/vIkH7fUQf8Olo8Apq56FQLGDXOo.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/2UG177tWHy7xRmMKWJHB7nAUmKd.jpg',
  },
  {
    tmdbId: 46298,
    title: 'Hunter × Hunter',
    subtitle: 'Chimera Ant & Yorkshin · 148 Caps.',
    tag: 'Aventura',
    rating: '8.9',
    poster: 'https://image.tmdb.org/t/p/w500/43wEsSJxuV8SZuipKpolOsuGVRZ.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/bFKKyCI89Xq98Gul8cGox8K3sZa.jpg',
  },
  {
    tmdbId: 13916,
    title: 'Death Note',
    subtitle: 'Light & L · 37 Caps.',
    tag: 'Misterio',
    rating: '8.6',
    poster: 'https://image.tmdb.org/t/p/w500/cFirFPdzle2QYyjFlLVwWUP5YAo.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/z8IPicmEKXUO4I2UDdMEqw7RqOE.jpg',
  },
  {
    tmdbId: 37854,
    title: 'One Piece',
    subtitle: 'Egghead & Wano · 1100+ Caps.',
    tag: 'Aventura',
    rating: '8.9',
    poster: 'https://image.tmdb.org/t/p/w500/8f33Q5AuM2G5ZqFeusbIqDjr3cI.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg',
  },
  {
    tmdbId: 42509,
    title: 'Steins;Gate',
    subtitle: 'Viajes en el tiempo · 24 Caps.',
    tag: 'Sci-Fi',
    rating: '9.0',
    poster: 'https://image.tmdb.org/t/p/w500/6iysgZr6Upm5RlAlVFo5f4D9euu.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/gDvxT2z6TNxervG97WfpePRZ3aR.jpg',
  },
  {
    tmdbId: 88803,
    title: 'Vinland Saga',
    subtitle: 'Thorfinn & Askeladd · 2 Temp.',
    tag: 'Seinen',
    rating: '8.7',
    poster: 'https://image.tmdb.org/t/p/w500/ySPYLN1sHmgRdqdfLOE092JlNT.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/sPN7Ylc7swmyukJeQBNcRAl9usS.jpg',
  },
  {
    tmdbId: 35935,
    title: 'Berserk (1997)',
    subtitle: 'La Edad de Oro · 25 Caps.',
    tag: 'Seinen',
    rating: '8.7',
    poster: 'https://image.tmdb.org/t/p/w500/qsxalXLXwGqjlxG6PXfVeXYIMeu.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/99Y64VK0KwyRWfaW6VdpDfPKNMo.jpg',
  },
  {
    tmdbId: 62104,
    title: 'Los siete pecados capitales',
    subtitle: 'Nanatsu no Taizai · 5 Temp.',
    tag: 'Shonen',
    rating: '8.4',
    poster: 'https://image.tmdb.org/t/p/w500/yhmHgYvxj1Xez3q6pJKxQVFiP4S.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/cmziOVMQrqvVfrjjQdadMdi2bGL.jpg',
  },
  {
    tmdbId: 12971,
    title: 'Dragon Ball Z',
    subtitle: 'Sagas Z Completas · 291 Caps.',
    tag: 'Clásico',
    rating: '8.8',
    poster: 'https://image.tmdb.org/t/p/w500/ogH4r9HsimigseBNLzHn4uVNOxh.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/ydf1CeiBLfdxiyNTpskM0802TKl.jpg',
  },
];

const YOUTUBE_QUICK_TOPICS = [
  {
    labelEs: 'Resúmenes LaLiga y Champions',
    labelCa: 'Resums LaLiga i Champions',
    labelEn: 'Football Highlights',
    q: 'resumen partido laliga champions highlights hd',
  },
  {
    labelEs: 'Tráilers Cine 4K',
    labelCa: 'Tràilers Cinema 4K',
    labelEn: '4K Movie Trailers',
    q: 'official movie trailer 2025 4k',
  },
  {
    labelEs: 'Música y Videoclips',
    labelCa: 'Música i Videoclips',
    labelEn: 'Music Videos',
    q: 'latin hits music video oficial',
  },
  {
    labelEs: 'F1 y Motorsport',
    labelCa: 'F1 i Motorsport',
    labelEn: 'F1 Highlights',
    q: 'formula 1 race highlights official',
  },
  {
    labelEs: 'Comedia y Stand-Up',
    labelCa: 'Comèdia i Stand-Up',
    labelEn: 'Stand-Up Comedy',
    q: 'monologos comedia stand up español',
  },
  {
    labelEs: 'Lo-Fi Chill Room',
    labelCa: 'Lo-Fi Chill Room',
    labelEn: 'Lo-Fi Beats',
    q: 'lofi hip hop radio beats to relax',
  },
] as const;

interface MediaCatalogHubProps {
  activeSection: CatalogSection;
  onChangeSection: (section: CatalogSection) => void;
  lang: AppLanguage;
  userName: string;
  activeVideoRawUrl: string;
  loadingItemId: string | null;
  roomQueue: RoomQueueItem[];
  watchHistory: WatchHistoryItem[];
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlayFavoriteChannel: (channel: FavoriteChannelItem) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN'
  ) => void;
  onPlayCatalaEpisode: (series: CatalaSeriesDetails, episode: CatalaEpisodeItem) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (
    channel: SpanishTdtChannel,
    signalIndex?: number,
    liveProgramHint?: string
  ) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (url: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onPlayQueueItem: (item: RoomQueueItem) => void;
  onStartPollFromQueue?: () => void;
  onPlaySecondaryChannel?: (opts: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => void;
  hasConnectedSmartTv?: boolean;
  activeMediaTitle?: string;
  onCreateNewRoom?: (customRoomName?: string) => void;
  showWatchlistOnly?: boolean;
  onWatchlistOnlyChange?: (val: boolean) => void;
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  onChangeSection,
  lang,
  activeVideoRawUrl,
  activeMediaTitle = '',
  loadingItemId,
  roomQueue,
  watchHistory,
  watchlist,
  favoriteChannels,
  onToggleCatalogFavorite,
  onToggleChannelFavorite,
  onPlayFavoriteChannel,
  onPlayMovie,
  onPlaySeriesEpisode,
  onPlayCatalaEpisode,
  onReplayHistoryItem,
  onRemoveHistoryItem,
  onClearHistory,
  onPlaySportsMatch,
  onPlayTdtChannel,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onAddToQueue,
  onRemoveFromQueue,
  onPlayQueueItem,
  onStartPollFromQueue,
  onPlaySecondaryChannel,
  showWatchlistOnly: controlledWatchlistOnly,
  onWatchlistOnlyChange,
}) => {
  const t = UI_COPY[lang];

  const [focusedHub, setFocusedHub] = useState<FocusedHubMode>('all');
  const [internalWatchlistOnly, setInternalWatchlistOnly] = useState(false);
  const showWatchlistOnly =
    controlledWatchlistOnly !== undefined ? controlledWatchlistOnly : internalWatchlistOnly;
  const setShowWatchlistOnly = (valOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    const nextVal =
      typeof valOrUpdater === 'function' ? valOrUpdater(showWatchlistOnly) : valOrUpdater;
    if (controlledWatchlistOnly === undefined) {
      setInternalWatchlistOnly(nextVal);
    }
    onWatchlistOnlyChange?.(nextVal);
  };
  const [previewItem, setPreviewItem] = useState<CatalogMovie | null>(null);
  const [liveScores, setLiveScores] = useState<LiveScoreMatch[]>([]);
  const [showSectionFilters, setShowSectionFilters] = useState(false);
  const [showSectionSearch, setShowSectionSearch] = useState(false);
  const sectionSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Universal Search & Apple TV+ Showcase on Home
  const [homeQuery, setHomeQuery] = useState('');
  const [debouncedHomeQuery, setDebouncedHomeQuery] = useState('');
  const [homeMovieResults, setHomeMovieResults] = useState<CatalogMovie[]>([]);
  const [homeSeriesResults, setHomeSeriesResults] = useState<CatalogMovie[]>([]);
  const [loadingHomeSearch, setLoadingHomeSearch] = useState(false);
  const [homeShowcaseMovies, setHomeShowcaseMovies] = useState<CatalogMovie[]>([]);
  const [homeShowcaseSeries, setHomeShowcaseSeries] = useState<CatalogMovie[]>([]);
  const [loadingHomeShowcase, setLoadingHomeShowcase] = useState(false);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);
  const [heroTrailerKey, setHeroTrailerKey] = useState<string | null>(null);
  const [heroTrailerMuted, setHeroTrailerMuted] = useState(true);
  const heroTrailerCacheRef = useRef<Record<string, string | null>>({});

  const catalaModalRef = useRef<HTMLDivElement | null>(null);
  const seriesModalRef = useRef<HTMLDivElement | null>(null);
  const epgModalRef = useRef<HTMLDivElement | null>(null);

  // Streaming Platform Filter (Netflix, HBO Max, Disney+, Prime Video, Apple TV+, Movistar+, SkyShowtime)
  const [streamingProvider, setStreamingProvider] = useState<StreamingProviderId>('all');

  // Movies & VO state
  const [movieQuery, setMovieQuery] = useState('');
  const [debouncedMovieQuery, setDebouncedMovieQuery] = useState('');
  const [movieCategory, setMovieCategory] = useState<string>('trending');
  const [moviePage, setMoviePage] = useState<number>(1);
  const [hasMoreMovies, setHasMoreMovies] = useState<boolean>(false);
  const [movies, setMovies] = useState<CatalogMovie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
  const [spotlightImgFailed, setSpotlightImgFailed] = useState(false);

  // TV Series state
  const [seriesQuery, setSeriesQuery] = useState('');
  const [debouncedSeriesQuery, setDebouncedSeriesQuery] = useState('');
  const [seriesCategory, setSeriesCategory] = useState<string>('trending');
  const [seriesLangMode, setSeriesLangMode] = useState<'ES' | 'LAT' | 'VOSE' | 'EN'>('ES');
  const [seriesPage, setSeriesPage] = useState<number>(1);
  const [hasMoreSeries, setHasMoreSeries] = useState<boolean>(false);
  const [seriesList, setSeriesList] = useState<CatalogMovie[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingMoreSeries, setLoadingMoreSeries] = useState(false);
  const [seriesSpotlightImgFailed, setSeriesSpotlightImgFailed] = useState(false);

  // Dedicated Anime Hub state (Crunchyroll · AnimeBox · JKAnime · AnimeFLV)
  const [animePortal, setAnimePortal] = useState<AnimePortalId>('anime_all');
  const [animeMediaKind, setAnimeMediaKind] = useState<'series' | 'movies'>('series');
  const [animeLangPref, setAnimeLangPref] = useState<'ES' | 'VOSE' | 'EN'>('ES');
  const [animeQuery, setAnimeQuery] = useState('');
  const [debouncedAnimeQuery, setDebouncedAnimeQuery] = useState('');
  const [animeCategory, setAnimeCategory] = useState<string>('trending');
  const [animePage, setAnimePage] = useState<number>(1);
  const [hasMoreAnime, setHasMoreAnime] = useState<boolean>(false);
  const [animeItems, setAnimeItems] = useState<CatalogMovie[]>([]);
  const [loadingAnime, setLoadingAnime] = useState(false);
  const [loadingMoreAnime, setLoadingMoreAnime] = useState(false);
  const [animeSpotlightImgFailed, setAnimeSpotlightImgFailed] = useState(false);

  // Instant Series -> Season -> Episode Modal state
  const [selectedSeries, setSelectedSeries] = useState<TvSeriesDetails | null>(null);
  const [loadingSeriesDetails, setLoadingSeriesDetails] = useState(false);
  const [probingSeriesLangs, setProbingSeriesLangs] = useState(false);
  const [brokenEpisodeImgs, setBrokenEpisodeImgs] = useState<Record<string, boolean>>({});
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [episodeRangeStart, setEpisodeRangeStart] = useState<number>(0);
  const [episodeSortDesc, setEpisodeSortDesc] = useState<boolean>(false);
  const episodeListScrollRef = useRef<HTMLDivElement | null>(null);
  const seriesFetchSeqRef = useRef(0);

  // Spanish TDT + Movistar+ + DAZN Live Television + Real-Time EPG state
  const [tdtChannels, setTdtChannels] = useState<SpanishTdtChannel[]>([]);
  const [loadingTdt, setLoadingTdt] = useState(false);
  const [tdtCategory, setTdtCategory] = useState<'all' | 'tdt_all' | TdtCategory>('all');
  const [tdtSearch, setTdtSearch] = useState('');
  const [epgMap, setEpgMap] = useState<Record<string, ChannelLiveEpg>>({});
  const [epgMadridClock, setEpgMadridClock] = useState<string>('');
  const [loadingEpg, setLoadingEpg] = useState(false);
  const [epgFilter, setEpgFilter] = useState<'all' | 'sports_now' | 'cinema_now'>('all');
  const [selectedEpgChannel, setSelectedEpgChannel] = useState<SpanishTdtChannel | null>(null);
  const [epgClockMs, setEpgClockMs] = useState<number>(() => Date.now());

  // Sports state
  const [sportsEvents, setSportsEvents] = useState<SportsMatch[]>([]);
  const [loadingSports, setLoadingSports] = useState(false);
  const [sportFilter, setSportFilter] = useState<
    'all' | 'soccer' | 'motor' | 'basketball' | 'tennis'
  >('soccer');
  const [footballLiveBrand, setFootballLiveBrand] = useState<
    'all' | 'uk_sports' | 'beinsports' | 'espn' | 'dsports' | 'tnt_space' | 'movistar' | 'dazn'
  >('all');
  const [show247Strip, setShow247Strip] = useState(true);
  const [sportsSearch, setSportsSearch] = useState('');
  const [brokenHeroImgs, setBrokenHeroImgs] = useState<Record<string, boolean>>({});

  // YouTube state
  const [ytQuery, setYtQuery] = useState('');
  const [debouncedYtQuery, setDebouncedYtQuery] = useState(
    'resumen partido laliga champions highlights hd'
  );
  const [ytResults, setYtResults] = useState<YouTubeSearchItem[]>([]);
  const [loadingYt, setLoadingYt] = useState(false);

  // Direct link / Cloud state
  const [customUrl, setCustomUrl] = useState('');
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Reset platform/category focus cleanly whenever returning to Home or switching sections
  useEffect(() => {
    setShowSectionFilters(false);
    setShowSectionSearch(false);
    if (activeSection === 'home') {
      setFocusedHub('all');
      setStreamingProvider('all');
      setAnimePortal('anime_all');
      setAnimeCategory('trending');
      setTdtCategory('all');
      setEpgFilter('all');
      setShowWatchlistOnly(false);
    }
  }, [activeSection]);

  // Debounce Home Global Search
  useEffect(() => {
    const clean = homeQuery.trim();
    if (!clean || /^https?:\/\//i.test(clean)) {
      setDebouncedHomeQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedHomeQuery(clean);
    }, 260);
    return () => clearTimeout(timer);
  }, [homeQuery]);

  // Debounce Movie Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMovieQuery(movieQuery.trim());
      setMoviePage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [movieQuery]);

  // Debounce Series Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSeriesQuery(seriesQuery.trim());
      setSeriesPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [seriesQuery]);

  // Debounce Anime Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAnimeQuery(animeQuery.trim());
      setAnimePage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [animeQuery]);

  // Debounce YouTube Search
  useEffect(() => {
    const clean = ytQuery.trim();
    if (!clean) return;
    const timer = setTimeout(() => {
      setDebouncedYtQuery(clean);
    }, 340);
    return () => clearTimeout(timer);
  }, [ytQuery]);

  // Dedicated "Todo en Castellano (España)" Hub state
  const [castellanoKind, setCastellanoKind] = useState<'all' | 'series' | 'movies'>('all');
  const [castellanoProvider, setCastellanoProvider] = useState<StreamingProviderId>('all');
  const [castellanoCategory, setCastellanoCategory] = useState<string>('trending');
  const [castellanoQuery, setCastellanoQuery] = useState('');
  const [debouncedCastellanoQuery, setDebouncedCastellanoQuery] = useState('');
  const [castellanoPage, setCastellanoPage] = useState<number>(1);
  const [hasMoreCastellano, setHasMoreCastellano] = useState<boolean>(false);
  const [castellanoItems, setCastellanoItems] = useState<CatalogMovie[]>([]);
  const [loadingCastellano, setLoadingCastellano] = useState<boolean>(false);
  const [loadingMoreCastellano, setLoadingMoreCastellano] = useState<boolean>(false);

  // Dedicated "Català · Tot l'Anime en un sol lloc" Hub state
  const [catalaCategory, setCatalaCategory] = useState<
    'all' | 'classics' | 'shonen' | 'movies' | 'live_tv'
  >('all');
  const [catalaQuery, setCatalaQuery] = useState('');
  const [debouncedCatalaQuery, setDebouncedCatalaQuery] = useState('');
  const [catalaItems, setCatalaItems] = useState<CatalaCatalogItem[]>([]);
  const [catalaLiveChannels, setCatalaLiveChannels] = useState<SpanishTdtChannel[]>([]);
  const [catalaCommunityLinks, setCatalaCommunityLinks] = useState<CatalaCommunityLink[]>([]);
  const [loadingCatala, setLoadingCatala] = useState<boolean>(false);

  // Catalan Episode Picker Modal state
  const [selectedCatalaSeries, setSelectedCatalaSeries] = useState<CatalaSeriesDetails | null>(
    null
  );
  const [loadingCatalaEpisodes, setLoadingCatalaEpisodes] = useState<boolean>(false);
  const [catalaEpQuery, setCatalaEpQuery] = useState('');
  const [catalaEpRangeStart, setCatalaEpRangeStart] = useState<number>(0);
  const [catalaEpSortDesc, setCatalaEpSortDesc] = useState<boolean>(false);
  const catalaEpScrollRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(Boolean(selectedCatalaSeries), () => setSelectedCatalaSeries(null), catalaModalRef);
  useFocusTrap(Boolean(selectedSeries), () => setSelectedSeries(null), seriesModalRef);
  useFocusTrap(Boolean(selectedEpgChannel), () => setSelectedEpgChannel(null), epgModalRef);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCastellanoQuery(castellanoQuery.trim());
      setCastellanoPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [castellanoQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCatalaQuery(catalaQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [catalaQuery]);

  // Preload Live Channels once so Home search and instant entry to TDT/DAZN/Movistar+ are 0ms
  const fetchTdtCatalog = async () => {
    setLoadingTdt(true);
    try {
      const res = await fetch('/api/catalog/tdt');
      const data = await res.json();
      if (Array.isArray(data?.channels)) {
        setTdtChannels(data.channels);
      }
    } catch {
      // Keep cached channels
    } finally {
      setLoadingTdt(false);
    }
  };

  const fetchLiveEpg = React.useCallback(async (forceRefresh = false) => {
    setLoadingEpg(true);
    try {
      const res = await fetch(forceRefresh ? '/api/epg/live?refresh=1' : '/api/epg/live');
      const data = await res.json();
      if (data?.epg && typeof data.epg === 'object') {
        setEpgMap(data.epg);
      }
      if (typeof data?.madridTimeLabel === 'string') {
        setEpgMadridClock(data.madridTimeLabel);
      }
      setEpgClockMs(Date.now());
    } catch {
      // Keep previous EPG snapshot
    } finally {
      setLoadingEpg(false);
    }
  }, []);

  // Tick local clock every 30s so live EPG progress bars and remaining minutes advance automatically
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      setEpgClockMs(now);
      try {
        setEpgMadridClock(
          new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(now))
        );
      } catch {
        // Ignore Intl timezone fallback
      }
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  // Load and auto-refresh EPG every 3 minutes when viewing Home, Live TV, or Català TV
  useEffect(() => {
    const needsEpg =
      activeSection === 'home' ||
      activeSection === 'tdt' ||
      activeSection === 'catala';
    if (!needsEpg) return;

    fetchLiveEpg(false);
    const refreshTimer = setInterval(() => {
      fetchLiveEpg(false);
    }, 180000);
    return () => clearInterval(refreshTimer);
  }, [activeSection, fetchLiveEpg]);

  const getChannelLiveEpg = React.useCallback(
    (channelId: string): ChannelLiveEpg | null => {
      const raw = epgMap[channelId];
      if (!raw) return null;
      const schedule: EpgProgramItem[] =
        Array.isArray(raw.upcoming) && raw.upcoming.length > 0
          ? raw.upcoming
          : ([raw.now, raw.next].filter(Boolean) as EpgProgramItem[]);
      if (schedule.length === 0) return raw;

      const activeIdx = schedule.findIndex(
        (p) => p.startMs <= epgClockMs && p.stopMs > epgClockMs
      );
      if (activeIdx === -1) {
        const nextUpcoming = schedule.find((p) => p.startMs > epgClockMs) || null;
        return {
          ...raw,
          now: raw.now && raw.now.stopMs > epgClockMs ? raw.now : null,
          next: nextUpcoming,
        };
      }

      const nowProg = schedule[activeIdx];
      const nextProg = schedule[activeIdx + 1] || null;
      const duration = Math.max(60000, nowProg.stopMs - nowProg.startMs);
      const elapsed = Math.max(0, Math.min(duration, epgClockMs - nowProg.startMs));
      const progressPct = Math.max(2, Math.min(100, Math.round((elapsed / duration) * 100)));
      const remainingMin = Math.max(1, Math.ceil((nowProg.stopMs - epgClockMs) / 60000));

      return {
        channelId,
        now: nowProg,
        next: nextProg,
        progressPct,
        remainingMin,
        upcoming: schedule.filter((p) => p.stopMs > epgClockMs),
      };
    },
    [epgMap, epgClockMs]
  );

  useEffect(() => {
    if (
      (activeSection === 'home' || activeSection === 'tdt' || activeSection === 'sports') &&
      tdtChannels.length === 0
    ) {
      fetchTdtCatalog();
    }
  }, [activeSection, tdtChannels.length]);

  // Preload Apple TV+ Home Showcase (Top Movies & Featured 16:9 Series) once
  useEffect(() => {
    if (homeShowcaseMovies.length > 0 && homeShowcaseSeries.length > 0) return;
    let cancelled = false;
    setLoadingHomeShowcase(true);

    Promise.all([
      fetch('/api/catalog/movies?provider=all&category=trending&page=1')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
      fetch('/api/catalog/series?provider=all&category=trending&page=1&lang=es')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
    ])
      .then(([mData, sData]) => {
        if (cancelled) return;
        const mItems: CatalogMovie[] = Array.isArray(mData?.items)
          ? mData.items
          : Array.isArray(mData?.movies)
          ? mData.movies
          : [];
        const sItems: CatalogMovie[] = Array.isArray(sData?.items)
          ? sData.items.map((it: CatalogMovie) => ({ ...it, mediaType: 'tv' as const }))
          : Array.isArray(sData?.series)
          ? sData.series.map((it: CatalogMovie) => ({ ...it, mediaType: 'tv' as const }))
          : [];
        if (mItems.length > 0) setHomeShowcaseMovies(mItems);
        if (sItems.length > 0) setHomeShowcaseSeries(sItems);
      })
      .finally(() => {
        if (!cancelled) setLoadingHomeShowcase(false);
      });

    return () => {
      cancelled = true;
    };
  }, [homeShowcaseMovies.length, homeShowcaseSeries.length]);

  const homeHeroSlides = React.useMemo(() => {
    const interleaved: CatalogMovie[] = [];
    const validMovies = homeShowcaseMovies.filter((m) => m.backdrop || m.poster);
    const validSeries = homeShowcaseSeries.filter((s) => s.backdrop || s.poster);
    const maxCount = Math.max(validMovies.length, validSeries.length);
    for (let i = 0; i < maxCount && interleaved.length < 6; i++) {
      if (validMovies[i]) interleaved.push({ ...validMovies[i], mediaType: 'movie' });
      if (interleaved.length < 6 && validSeries[i]) {
        interleaved.push({ ...validSeries[i], mediaType: 'tv' });
      }
    }
    return interleaved;
  }, [homeShowcaseMovies, homeShowcaseSeries]);

  useEffect(() => {
    if (
      activeSection !== 'home' ||
      debouncedHomeQuery.length >= 2 ||
      homeHeroSlides.length <= 1 ||
      isHeroHovered ||
      Boolean(previewItem) ||
      Boolean(selectedSeries)
    ) {
      return;
    }
    const timer = setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % homeHeroSlides.length);
    }, 7500);
    return () => clearInterval(timer);
  }, [
    activeSection,
    debouncedHomeQuery,
    homeHeroSlides.length,
    isHeroHovered,
    previewItem,
    selectedSeries,
  ]);

  // Lazy desktop ambient trailer lookup for the active Hero slide (prefers-reduced-motion safe)
  useEffect(() => {
    if (
      activeSection !== 'home' ||
      debouncedHomeQuery.length >= 2 ||
      homeHeroSlides.length === 0
    ) {
      setHeroTrailerKey(null);
      return;
    }
    if (typeof window === 'undefined' || window.innerWidth < 1024) {
      setHeroTrailerKey(null);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setHeroTrailerKey(null);
      return;
    }
    const safeIdx = heroSlideIndex % homeHeroSlides.length;
    const currentSlide = homeHeroSlides[safeIdx];
    if (!currentSlide?.tmdbId) {
      setHeroTrailerKey(null);
      return;
    }
    const mediaKind = currentSlide.mediaType === 'tv' ? 'tv' : 'movie';
    const cacheKey = `${mediaKind}:${currentSlide.tmdbId}:${lang}`;
    if (Object.prototype.hasOwnProperty.call(heroTrailerCacheRef.current, cacheKey)) {
      setHeroTrailerKey(heroTrailerCacheRef.current[cacheKey]);
      return;
    }
    let cancelled = false;
    setHeroTrailerKey(null);
    fetch(`/api/catalog/details/${mediaKind}/${currentSlide.tmdbId}?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const key = typeof data?.details?.trailerKey === 'string' ? data.details.trailerKey : null;
        heroTrailerCacheRef.current[cacheKey] = key;
        if (!cancelled) {
          setHeroTrailerKey(key);
        }
      })
      .catch(() => {
        heroTrailerCacheRef.current[cacheKey] = null;
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection, debouncedHomeQuery, homeHeroSlides, heroSlideIndex, lang]);

  const homeFeaturedLiveChannels = React.useMemo(() => {
    if (tdtChannels.length === 0) return [];
    const priorityIds = [
      'bein-es-n',
      'espn-1',
      'dsports-1',
      'tnt-sports',
      'mplus-laliga',
      'dazn-laliga',
      'mplus-campeones',
      'tnt-vivo',
      'space-vivo',
      'la1',
      'antena3',
      'lasexta',
    ];
    const picked: SpanishTdtChannel[] = [];
    for (const pid of priorityIds) {
      const found = tdtChannels.find((c) => c.id === pid);
      if (found) picked.push(found);
    }
    for (const ch of tdtChannels) {
      if (picked.length >= 12) break;
      if (!picked.some((p) => p.id === ch.id)) picked.push(ch);
    }
    return picked;
  }, [tdtChannels]);

  // Execute Universal Search on Home when user types (non-blocking independent requests + AbortController)
  useEffect(() => {
    if (activeSection !== 'home' || debouncedHomeQuery.length < 2) {
      setHomeMovieResults([]);
      setHomeSeriesResults([]);
      setLoadingHomeSearch(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let pending = 2;
    setLoadingHomeSearch(true);

    const markDone = () => {
      pending -= 1;
      if (active && pending <= 0) {
        setLoadingHomeSearch(false);
      }
    };

    fetch(
      `/api/catalog/movies?provider=all&category=trending&page=1&query=${encodeURIComponent(
        debouncedHomeQuery
      )}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : { movies: [] }))
      .then((mData) => {
        if (!active) return;
        setHomeMovieResults(Array.isArray(mData?.movies) ? mData.movies.slice(0, 12) : []);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHomeMovieResults([]);
      })
      .finally(markDone);

    fetch(
      `/api/catalog/series?provider=all&category=trending&page=1&lang=es&query=${encodeURIComponent(
        debouncedHomeQuery
      )}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .then((sData) => {
        if (!active) return;
        setHomeSeriesResults(Array.isArray(sData?.series) ? sData.series.slice(0, 12) : []);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHomeSeriesResults([]);
      })
      .finally(markDone);

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSection, debouncedHomeQuery]);

  // Fetch Movies (Spanish Cinema OR Full VO/English Catalog across all or specific platform)
  useEffect(() => {
    if (activeSection !== 'movies' && activeSection !== 'vose') return;
    if (showWatchlistOnly) return;

    let cancelled = false;
    if (moviePage === 1) {
      setLoadingMovies(true);
      setSpotlightImgFailed(false);
    } else {
      setLoadingMoreMovies(true);
    }

    const endpoint =
      activeSection === 'vose'
        ? `/api/catalog/bingetrix?provider=${encodeURIComponent(
            streamingProvider
          )}&category=${encodeURIComponent(movieCategory)}&page=${moviePage}&query=${encodeURIComponent(
            debouncedMovieQuery
          )}`
        : `/api/catalog/movies?provider=${encodeURIComponent(
            streamingProvider
          )}&category=${encodeURIComponent(movieCategory)}&page=${moviePage}&query=${encodeURIComponent(
            debouncedMovieQuery
          )}`;

    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.movies) ? data.movies : [];
        setHasMoreMovies(Boolean(data?.hasMore));
        setMovies((prev) => {
          if (moviePage === 1) return incoming;
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
        });
      })
      .catch(() => {
        if (!cancelled && moviePage === 1) setMovies([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMovies(false);
          setLoadingMoreMovies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    streamingProvider,
    movieCategory,
    moviePage,
    debouncedMovieQuery,
    showWatchlistOnly,
  ]);

  // Fetch TV Series Catalog (across all or selected streaming platform in ES or VO/EN)
  useEffect(() => {
    if (activeSection !== 'series') return;
    let cancelled = false;
    if (seriesPage === 1) {
      setLoadingSeries(true);
      setSeriesSpotlightImgFailed(false);
    } else {
      setLoadingMoreSeries(true);
    }

    const apiLang = seriesLangMode === 'EN' || seriesLangMode === 'VOSE' ? 'en' : 'es';
    fetch(
      `/api/catalog/series?provider=${encodeURIComponent(
        streamingProvider
      )}&category=${encodeURIComponent(seriesCategory)}&page=${seriesPage}&lang=${apiLang}&query=${encodeURIComponent(
        debouncedSeriesQuery
      )}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.series) ? data.series : [];
        setHasMoreSeries(Boolean(data?.hasMore));
        setSeriesList((prev) => {
          if (seriesPage === 1) return incoming;
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...incoming.filter((s) => !seen.has(s.id))];
        });
      })
      .catch(() => {
        if (!cancelled && seriesPage === 1) setSeriesList([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSeries(false);
          setLoadingMoreSeries(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    streamingProvider,
    seriesCategory,
    seriesPage,
    seriesLangMode,
    debouncedSeriesQuery,
  ]);

  // Fetch Dedicated Anime Catalog (Crunchyroll, AnimeBox, JKAnime, AnimeFLV, or All Anime)
  useEffect(() => {
    if (activeSection !== 'anime') return;
    let cancelled = false;
    if (animePage === 1) {
      setLoadingAnime(true);
      setAnimeSpotlightImgFailed(false);
    } else {
      setLoadingMoreAnime(true);
    }

    const apiLang = animeLangPref === 'EN' ? 'en' : 'es';
    const endpoint =
      animeMediaKind === 'series'
        ? `/api/catalog/series?provider=${encodeURIComponent(
            animePortal
          )}&category=${encodeURIComponent(animeCategory)}&page=${animePage}&lang=${apiLang}&query=${encodeURIComponent(
            debouncedAnimeQuery
          )}`
        : animeLangPref === 'EN'
        ? `/api/catalog/bingetrix?provider=${encodeURIComponent(
            animePortal
          )}&category=${encodeURIComponent(animeCategory)}&page=${animePage}&query=${encodeURIComponent(
            debouncedAnimeQuery
          )}`
        : `/api/catalog/movies?provider=${encodeURIComponent(
            animePortal
          )}&category=${encodeURIComponent(animeCategory)}&page=${animePage}&query=${encodeURIComponent(
            debouncedAnimeQuery
          )}`;

    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rawList: CatalogMovie[] =
          animeMediaKind === 'series'
            ? Array.isArray(data?.series)
              ? data.series
              : []
            : Array.isArray(data?.movies)
            ? data.movies
            : [];
        const normalized = rawList.map((item) => ({
          ...item,
          mediaType: (animeMediaKind === 'series' ? 'tv' : 'movie') as 'tv' | 'movie',
        }));
        setHasMoreAnime(Boolean(data?.hasMore));
        setAnimeItems((prev) => {
          if (animePage === 1) return normalized;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...normalized.filter((a) => !seen.has(a.id))];
        });
      })
      .catch(() => {
        if (!cancelled && animePage === 1) setAnimeItems([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAnime(false);
          setLoadingMoreAnime(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    animePortal,
    animeMediaKind,
    animeCategory,
    animePage,
    animeLangPref,
    debouncedAnimeQuery,
  ]);

  // Instant 2-Step Series -> Temporada -> Capítulo Loader (Opens Modal in 0ms + Non-Blocking Language Check)
  const openSeriesDetails = (
    tmdbId: number,
    seasonNum = 1,
    seedShow?: Partial<CatalogMovie>
  ) => {
    const reqSeq = ++seriesFetchSeqRef.current;
    setLoadingSeriesDetails(true);
    setEpisodeSearchQuery('');
    setEpisodeSortDesc(false);
    setEpisodeRangeStart(0);

    // Open the Series Modal IMMEDIATELY so the user never waits for a network roundtrip
    setSelectedSeries((prev) => {
      if (prev && prev.tmdbId === tmdbId) {
        return {
          ...prev,
          activeSeason: seasonNum,
        };
      }
      return {
        tmdbId,
        title:
          seedShow?.title ||
          pickLang(lang, {
            es: 'Cargando serie...',
            ca: 'Carregant sèrie...',
            en: 'Loading series...',
          }),
        originalTitle: seedShow?.originalTitle || seedShow?.title || '',
        year: seedShow?.year || 'TV',
        rating: seedShow?.rating || '',
        overview: seedShow?.overview || '',
        poster: seedShow?.poster || '',
        backdrop: seedShow?.backdrop || seedShow?.poster || '',
        seasons: [
          {
            seasonNumber: seasonNum,
            name: pickLang(lang, {
              es: `Temporada ${seasonNum}`,
              ca: `Temporada ${seasonNum}`,
              en: `Season ${seasonNum}`,
            }),
            episodeCount: 0,
          },
        ],
        activeSeason: seasonNum,
        episodes: [],
      };
    });

    const apiLang = seriesLangMode === 'EN' ? 'en' : 'es';
    fetch(`/api/catalog/tv/${tmdbId}?season=${seasonNum}&lang=${apiLang}`)
      .then((r) => r.json())
      .then((data) => {
        if (reqSeq !== seriesFetchSeqRef.current) return;
        if (data?.success && data?.details) {
          const nextSeries: TvSeriesDetails = data.details;
          setSelectedSeries(nextSeries);
          setLoadingSeriesDetails(false);

          // Automatically open the 50-episode block containing the user's last watched episode in this season
          const savedEpInSeason = watchHistory.find(
            (h) =>
              h.mediaType === 'tv' &&
              h.tmdbId === tmdbId &&
              h.season === nextSeries.activeSeason &&
              Boolean(h.episode)
          );
          if (savedEpInSeason?.episode && nextSeries.episodes.length > 50) {
            const foundIdx = nextSeries.episodes.findIndex(
              (ep) => ep.episodeNumber === savedEpInSeason.episode
            );
            if (foundIdx >= 0) {
              setEpisodeRangeStart(Math.floor(foundIdx / 50) * 50);
            }
          }
          setTimeout(() => {
            episodeListScrollRef.current?.scrollTo({ top: 0 });
          }, 0);

          // If languages already cached in response, apply them; otherwise probe asynchronously in background
          if (
            Array.isArray(nextSeries.availableLanguages) &&
            nextSeries.availableLanguages.length > 0
          ) {
            setProbingSeriesLangs(false);
            setSeriesLangMode((prev) =>
              nextSeries.availableLanguages!.includes(prev)
                ? prev
                : nextSeries.availableLanguages![0]
            );
          } else {
            setProbingSeriesLangs(true);
            const firstEp = nextSeries.episodes[0]?.episodeNumber || 1;
            fetch(
              `/api/catalog/tv/${tmdbId}/languages?season=${nextSeries.activeSeason}&episode=${firstEp}&title=${encodeURIComponent(
                nextSeries.title || ''
              )}&origTitle=${encodeURIComponent(nextSeries.originalTitle || '')}`
            )
              .then((r2) => r2.json())
              .then((langData) => {
                if (reqSeq !== seriesFetchSeqRef.current) return;
                const avail: ('ES' | 'LAT' | 'VOSE' | 'EN')[] = Array.isArray(
                  langData?.availableLanguages
                )
                  ? langData.availableLanguages
                  : [];
                if (avail.length > 0) {
                  setSelectedSeries((curr) =>
                    curr && curr.tmdbId === tmdbId
                      ? { ...curr, availableLanguages: avail }
                      : curr
                  );
                  setSeriesLangMode((prev) => (avail.includes(prev) ? prev : avail[0]));
                }
              })
              .catch(() => {})
              .finally(() => {
                if (reqSeq === seriesFetchSeqRef.current) {
                  setProbingSeriesLangs(false);
                }
              });
          }
        } else {
          setLoadingSeriesDetails(false);
        }
      })
      .catch(() => {
        if (reqSeq === seriesFetchSeqRef.current) {
          setLoadingSeriesDetails(false);
        }
      });
  };

  // Fetch Sports Agenda + Live Real-Time Scoreboards
  const fetchSportsAgenda = () => {
    setLoadingSports(true);
    fetch('/api/catalog/sports')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.events)) {
          setSportsEvents(data.events);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSports(false));

    fetch('/api/sports/scores')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.scores)) {
          setLiveScores(data.scores);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (activeSection !== 'sports') return;
    if (sportsEvents.length === 0 || liveScores.length === 0) {
      fetchSportsAgenda();
    }
    const scoreTimer = setInterval(() => {
      fetch('/api/sports/scores')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.scores)) setLiveScores(data.scores);
        })
        .catch(() => {});
    }, 45000);
    return () => clearInterval(scoreTimer);
  }, [activeSection]);

  // Fetch YouTube Search Results
  useEffect(() => {
    if (activeSection !== 'youtube') return;
    let cancelled = false;
    setLoadingYt(true);

    fetch(`/api/catalog/youtube?q=${encodeURIComponent(debouncedYtQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.videos)) {
          setYtResults(data.videos);
        }
      })
      .catch(() => {
        if (!cancelled) setYtResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingYt(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, debouncedYtQuery]);

  // Fetch "Todo en Castellano (España)" Catalog
  useEffect(() => {
    if (activeSection !== 'castellano') return;
    let cancelled = false;
    const isLoadMore = castellanoPage > 1;
    if (isLoadMore) setLoadingMoreCastellano(true);
    else setLoadingCastellano(true);

    const params = new URLSearchParams({
      kind: castellanoKind,
      provider: castellanoProvider,
      category: castellanoCategory,
      page: String(castellanoPage),
      query: debouncedCastellanoQuery,
    });

    fetch(`/api/catalog/castellano?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.items) ? data.items : [];
        setHasMoreCastellano(Boolean(data?.hasMore));
        if (isLoadMore) {
          setCastellanoItems((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            return [...prev, ...incoming.filter((x) => !existing.has(x.id))];
          });
        } else {
          setCastellanoItems(incoming);
        }
      })
      .catch(() => {
        if (!cancelled && !isLoadMore) setCastellanoItems([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCastellano(false);
          setLoadingMoreCastellano(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    castellanoKind,
    castellanoProvider,
    castellanoCategory,
    castellanoPage,
    debouncedCastellanoQuery,
  ]);

  // Fetch "Català · Tot l'Anime en un sol lloc" Catalog
  useEffect(() => {
    if (activeSection !== 'catala') return;
    let cancelled = false;
    setLoadingCatala(true);

    const params = new URLSearchParams({
      category: catalaCategory === 'live_tv' ? 'all' : catalaCategory,
      query: debouncedCatalaQuery,
    });

    fetch(`/api/catalog/catala?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.items)) setCatalaItems(data.items);
        if (Array.isArray(data?.liveChannels)) setCatalaLiveChannels(data.liveChannels);
        if (Array.isArray(data?.communityLinks)) setCatalaCommunityLinks(data.communityLinks);
      })
      .catch(() => {
        if (!cancelled) setCatalaItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatala(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, catalaCategory, debouncedCatalaQuery]);

  const openCatalaSeriesDetails = async (item: CatalaCatalogItem, seasonNum = 1) => {
    setCatalaEpQuery('');
    setCatalaEpRangeStart(0);
    setCatalaEpSortDesc(false);
    setLoadingCatalaEpisodes(true);

    // Optimistic instant shell so modal opens in 0ms
    setSelectedCatalaSeries((prev) =>
      prev && prev.id === item.id
        ? { ...prev, activeSeason: seasonNum }
        : {
            id: item.id,
            title: item.title,
            originalTitle: item.originalTitle,
            eraTag: item.eraTag,
            year: item.year,
            rating: item.rating,
            overview: item.overview,
            poster: item.poster,
            backdrop: item.backdrop || item.poster,
            activeSeason: seasonNum,
            seasons: [{ seasonNumber: seasonNum, name: `Temporada ${seasonNum}`, episodeCount: 0 }],
            episodes: [],
          }
    );

    try {
      const res = await fetch(
        `/api/catalog/catala/${encodeURIComponent(item.id)}/episodes?season=${seasonNum}`
      );
      const data = await res.json();
      if (res.ok && data?.success && data?.details) {
        setSelectedCatalaSeries(data.details);
      }
    } catch {
      // keep shell
    } finally {
      setLoadingCatalaEpisodes(false);
    }
  };

  // Navigation Helper Actions from the Big Launcher Grid
  const goToHomeGrid = () => {
    triggerHaptic('light');
    setShowWatchlistOnly(false);
    setFocusedHub('all');
    onChangeSection('home');
  };

  const enterGeneralMovies = () => {
    triggerHaptic('light');
    setFocusedHub('all');
    setStreamingProvider('all');
    setShowWatchlistOnly(false);
    setMovieCategory('trending');
    setMoviePage(1);
    onChangeSection('movies');
  };

  const enterGeneralSeries = () => {
    triggerHaptic('light');
    setFocusedHub('all');
    setStreamingProvider('all');
    setShowWatchlistOnly(false);
    setSeriesCategory('trending');
    setSeriesPage(1);
    onChangeSection('series');
  };

  const enterAnimeHub = (
    portal: AnimePortalId = 'anime_all',
    mediaKind: 'series' | 'movies' = 'series'
  ) => {
    triggerHaptic('light');
    setFocusedHub('all');
    setShowWatchlistOnly(false);
    setAnimePortal(portal);
    setAnimeMediaKind(mediaKind);
    setAnimeQuery('');
    setAnimeCategory(portal === 'jkanime' ? 'simulcast' : 'trending');
    setAnimePage(1);
    onChangeSection('anime');
  };

  const enterStreamingPlatform = (
    provider: Exclude<StreamingProviderId, 'all' | AnimePortalId>,
    initialTab: 'movies' | 'series' = 'movies'
  ) => {
    triggerHaptic('light');
    setFocusedHub(provider);
    setStreamingProvider(provider);
    setShowWatchlistOnly(false);
    setMovieQuery('');
    setSeriesQuery('');
    setMovieCategory('trending');
    setSeriesCategory('trending');
    setMoviePage(1);
    setSeriesPage(1);
    onChangeSection(initialTab);
  };

  const enterMovistarHub = (mode: 'live' | 'movies' | 'series' = 'live') => {
    triggerHaptic('light');
    setFocusedHub('movistar');
    setStreamingProvider('movistar');
    setShowWatchlistOnly(false);
    if (mode === 'live') {
      setTdtCategory('movistar');
      setTdtSearch('');
      onChangeSection('tdt');
    } else if (mode === 'movies') {
      setMovieCategory('trending');
      setMoviePage(1);
      onChangeSection('movies');
    } else {
      setSeriesCategory('trending');
      setSeriesPage(1);
      onChangeSection('series');
    }
  };

  const enterDaznLiveHub = () => {
    triggerHaptic('light');
    setFocusedHub('dazn');
    setTdtCategory('dazn');
    setTdtSearch('');
    onChangeSection('tdt');
  };

  const enterLiveSportsBrandHub = (
    brand: 'uk_sports' | 'beinsports' | 'espn' | 'dsports' | 'tnt_space'
  ) => {
    triggerHaptic('light');
    setFocusedHub(brand);
    setTdtCategory(brand);
    setTdtSearch('');
    onChangeSection('tdt');
  };

  const enterSpanishTdtHub = () => {
    triggerHaptic('light');
    setFocusedHub('tdt_es');
    setTdtCategory('tdt_all');
    setTdtSearch('');
    onChangeSection('tdt');
  };

  const handleToggleBookmark = (item: CatalogMovie, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    onToggleCatalogFavorite(item);
  };

  const isBookmarked = (item: CatalogMovie) => {
    return watchlist.some((x) => isSameCatalogItem(x, item));
  };

  const isChannelFavorited = (favId: string) => {
    const clean = sanitizeItemKey(favId);
    return favoriteChannels.some((c) => sanitizeItemKey(c.favId) === clean);
  };

  const cleanWatchlist = React.useMemo(() => deduplicateWatchlist(watchlist), [watchlist]);
  const favoriteSeriesList = cleanWatchlist.filter((w) => w.mediaType === 'tv');

  const footballSectionLiveChannels = React.useMemo(() => {
    const allowedCats = new Set([
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'movistar',
      'dazn',
    ]);
    return tdtChannels.filter((ch) => {
      if (!allowedCats.has(ch.category)) return false;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        return false;
      }
      if (footballLiveBrand !== 'all' && ch.category !== footballLiveBrand) return false;
      if (sportsSearch.trim()) {
        const norm = (s: string) =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const q = norm(sportsSearch);
        const matchesCh =
          norm(ch.name).includes(q) ||
          norm(ch.shortMark).includes(q) ||
          norm(ch.network).includes(q);
        // Only filter the channel strip by sportsSearch if user typed a channel name; otherwise keep strip visible
        if (
          /sky|uk|premier|eurosport|mutv|talksport|fifa|bein|arab|espn|dsport|directv|tnt|space|movistar|dazn|laliga|campeones|vamos|f1|motor|fight/i.test(
            q
          )
        ) {
          return matchesCh;
        }
      }
      return true;
    });
  }, [tdtChannels, footballLiveBrand, sportsSearch]);

  const filteredTdtChannels = tdtChannels.filter((ch) => {
    if (tdtCategory === 'tdt_all') {
      if (
        ch.category === 'movistar' ||
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'beinsports' ||
        ch.category === 'espn' ||
        ch.category === 'dsports' ||
        ch.category === 'tnt_space'
      ) {
        return false;
      }
    } else if (tdtCategory !== 'all' && ch.category !== tdtCategory) {
      return false;
    }

    const chEpg = getChannelLiveEpg(ch.id);
    const epgHaystack = `${chEpg?.now?.title || ''} ${chEpg?.now?.category || ''} ${
      chEpg?.now?.description || ''
    } ${chEpg?.next?.title || ''}`.toLowerCase();

    if (epgFilter === 'sports_now') {
      const isSportsChannel =
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'beinsports' ||
        ch.category === 'espn' ||
        ch.category === 'dsports' ||
        ch.id === 'tnt-sports' ||
        ch.id.includes('laliga') ||
        ch.id.includes('champions') ||
        ch.id.includes('campeones') ||
        ch.id.includes('deportes') ||
        ch.id.includes('vamos') ||
        ch.id.includes('golf') ||
        ch.id.includes('tdp') ||
        ch.id.includes('gol') ||
        ch.id.includes('rmtv');
      const isAiringSports =
        /deporte|f[uú]tbol|laliga|champions|f1|f[oó]rmula|motogp|tenis|baloncesto|nba|acb|ciclismo|golf|motor|directo|liga/i.test(
          epgHaystack
        );
      if (!isSportsChannel && !isAiringSports) return false;
    } else if (epgFilter === 'cinema_now') {
      const isCinemaChannel =
        ch.category === 'cine_series' ||
        ch.id === 'tnt-vivo' ||
        ch.id === 'space-vivo' ||
        ch.id === 'mplus-estrenos' ||
        ch.id === 'mplus-accion' ||
        ch.id === 'mplus-series';
      const isAiringCinema =
        /cine|pel[ií]cula|serie|thriller|drama|comedia|acci[oó]n|ficci[oó]n|temporada|episodio|cap[ií]tulo/i.test(
          epgHaystack
        );
      if (!isCinemaChannel && !isAiringCinema) return false;
    }

    if (tdtSearch.trim()) {
      const norm = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const q = norm(tdtSearch);
      return (
        norm(ch.name).includes(q) ||
        norm(ch.shortMark).includes(q) ||
        norm(ch.network).includes(q) ||
        norm(ch.description).includes(q) ||
        norm(epgHaystack).includes(q) ||
        String(ch.dial) === q.trim()
      );
    }
    return true;
  });

  const homeMatchingChannels = React.useMemo(() => {
    if (!debouncedHomeQuery || debouncedHomeQuery.length < 2) return [];
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normCompact = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '');
    const q = norm(debouncedHomeQuery);
    const qCompact = normCompact(debouncedHomeQuery);
    return tdtChannels
      .filter((ch) => {
        const chEpg = getChannelLiveEpg(ch.id);
        const hay = `${ch.name} ${ch.shortMark} ${ch.network} ${chEpg?.now?.title || ''} ${chEpg?.next?.title || ''}`;
        return (
          norm(hay).includes(q) ||
          (qCompact.length >= 2 && normCompact(hay).includes(qCompact))
        );
      })
      .slice(0, 6);
  }, [debouncedHomeQuery, tdtChannels, getChannelLiveEpg]);

  const filteredSports = sportsEvents.filter((ev) => {
    if (sportFilter !== 'all' && ev.sport !== sportFilter) return false;
    if (sportsSearch.trim()) {
      const q = sportsSearch.toLowerCase();
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.competition.toLowerCase().includes(q) ||
        ev.channels.some((c) => c.label.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const multiplexChannels = filteredSports.filter(
    (e) =>
      e.is247Channel &&
      sportFilter !== 'soccer' &&
      !(sportFilter === 'all' && e.sport === 'soccer')
  );
  const scheduledMatches = filteredSports.filter(
    (e) =>
      !e.is247Channel &&
      sportFilter !== 'soccer' &&
      !(sportFilter === 'all' && e.sport === 'soccer')
  );

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    triggerHaptic('success');
    onPlayCustomUrl(customUrl.trim());
  };

  const displayedMovies = showWatchlistOnly ? cleanWatchlist : movies;
  const activePlatformMeta =
    STREAMING_PLATFORMS.find((p) => p.id === streamingProvider) || STREAMING_PLATFORMS[0];

  const isSpecificPlatformView =
    streamingProvider !== 'all' &&
    !showWatchlistOnly &&
    (activeSection === 'movies' || activeSection === 'vose' || activeSection === 'series');

  const isMovistarContext =
    focusedHub === 'movistar' ||
    streamingProvider === 'movistar' ||
    (activeSection === 'tdt' && tdtCategory === 'movistar');

  const showSpotlight =
    (activeSection === 'movies' || activeSection === 'vose') &&
    !showWatchlistOnly &&
    !debouncedMovieQuery &&
    !loadingMovies &&
    displayedMovies.length > 0;

  const spotlightMovie = showSpotlight ? displayedMovies[0] : null;
  const gridMovies = showSpotlight ? displayedMovies.slice(1) : displayedMovies;

  const showSeriesSpotlight =
    activeSection === 'series' &&
    !debouncedSeriesQuery &&
    !loadingSeries &&
    seriesList.length > 0;
  const spotlightSeries = showSeriesSpotlight ? seriesList[0] : null;
  const gridSeries = showSeriesSpotlight ? seriesList.slice(1) : seriesList;

  const activeAnimePortalMeta =
    ANIME_PLATFORMS.find((p) => p.id === animePortal) || ANIME_PLATFORMS[0];
  const showAnimeSpotlight =
    activeSection === 'anime' &&
    !debouncedAnimeQuery &&
    !loadingAnime &&
    animeItems.length > 0;
  const spotlightAnime = showAnimeSpotlight ? animeItems[0] : null;
  const gridAnime = showAnimeSpotlight ? animeItems.slice(1) : animeItems;

  // Find resume episode for currently open series modal if user watched it previously
  const selectedSeriesHistory = selectedSeries
    ? watchHistory.find(
        (h) =>
          h.mediaType === 'tv' &&
          (h.tmdbId === selectedSeries.tmdbId ||
            h.title.trim().toLowerCase() === selectedSeries.title.trim().toLowerCase())
      )
    : undefined;

  const renderContinueWatchingStrip = () => {
    if (watchHistory.length === 0) return null;
    return (
      <section
        aria-label={pickLang(lang, { es: 'Seguir viendo', ca: 'Continuar veient', en: 'Continue watching' })}
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Seguir viendo', ca: 'Continuar veient', en: 'Up Next' })}
            </h3>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              if (confirmClearHistory) {
                onClearHistory();
                setConfirmClearHistory(false);
              } else {
                setConfirmClearHistory(true);
                setTimeout(() => setConfirmClearHistory(false), 3200);
              }
            }}
            className={`min-h-[36px] px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
              confirmClearHistory
                ? 'bg-rose-500 text-white border-rose-400'
                : 'bg-white/[0.04] text-zinc-400 hover:text-white border-white/[0.08]'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {confirmClearHistory
                ? pickLang(lang, { es: '¿Confirmar?', ca: 'Confirmar?', en: 'Confirm?' })
                : pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Clear' })}
            </span>
          </button>
        </div>

        <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
          {watchHistory.map((hItem) => {
            const isLoadingThis = loadingItemId === hItem.id;
            const thumb = hItem.backdrop || hItem.poster;
            const resumeSec = hItem.resumeTimeSec || 0;
            const durSec = hItem.durationSec || 0;
            const hasResume = resumeSec > 5;
            const progressPct = hasResume
              ? durSec > 60
                ? Math.min(96, Math.max(8, Math.round((resumeSec / durSec) * 100)))
                : 28
              : 0;

            const isReadyForNextEp =
              hItem.mediaType === 'tv' &&
              Boolean(hItem.season) &&
              Boolean(hItem.episode) &&
              progressPct >= 88;

            const triggerHistoryCardPlay = () => {
              if (loadingItemId) return;
              triggerHaptic('light');
              if (isReadyForNextEp && hItem.season && hItem.episode) {
                const nextEp = hItem.episode + 1;
                onReplayHistoryItem(
                  {
                    ...hItem,
                    id: sanitizeItemKey(
                      `tv-${hItem.tmdbId || hItem.title}-${hItem.season}-${nextEp}`
                    ),
                    episode: nextEp,
                    subtitle: `${hItem.season}x${String(nextEp).padStart(2, '0')}`,
                    resumeTimeSec: 0,
                  },
                  true
                );
              } else {
                onReplayHistoryItem(hItem, false);
              }
            };

            return (
              <div
                key={hItem.id}
                className="group relative w-[220px] sm:w-[252px] shrink-0 rounded-2xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] hover:border-white/25 transition-all duration-200 hover:-translate-y-0.5 flex flex-col"
              >
                <button
                  type="button"
                  onClick={triggerHistoryCardPlay}
                  aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${hItem.title}`}
                  className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                />
                <div className="relative aspect-[16/9] w-full bg-[#0B0C12] overflow-hidden pointer-events-none z-[1]">
                  <PosterImage
                    src={thumb}
                    alt={hItem.title}
                    aspect="video"
                    imgClassName="object-cover sm:group-hover:scale-105 transition-transform duration-300"
                    fallbackIcon={
                      hItem.mediaType === 'tv' ? (
                        <Tv className="w-6 h-6 text-zinc-500" />
                      ) : (
                        <Film className="w-6 h-6 text-zinc-500" />
                      )
                    }
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 pointer-events-auto">
                    {hItem.mediaType === 'tv' && hItem.tmdbId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          openSeriesDetails(hItem.tmdbId!, hItem.season || 1, {
                            tmdbId: hItem.tmdbId,
                            title: hItem.title,
                            poster: hItem.poster,
                            backdrop: hItem.backdrop,
                            year: hItem.year,
                          });
                        }}
                        title={pickLang(lang, { es: 'Ver temporadas y capítulos', ca: 'Veure temporades i capítols', en: 'All episodes' })}
                        aria-label={pickLang(lang, { es: 'Ver capítulos', ca: 'Veure capítols', en: 'View episodes' })}
                        className="h-7 px-2.5 rounded-full bg-black/70 backdrop-blur-md hover:bg-black/90 text-[10px] font-semibold text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors whitespace-nowrap"
                      >
                        {pickLang(lang, { es: 'Capítulos', ca: 'Capítols', en: 'Episodes' })}
                      </button>
                    )}
                    {hasResume && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (loadingItemId) return;
                          triggerHaptic('light');
                          onReplayHistoryItem(hItem, true);
                        }}
                        title={pickLang(lang, { es: 'Empezar desde el principio', ca: 'Començar des del principi', en: 'Start over' })}
                        aria-label={pickLang(lang, { es: 'Empezar desde el principio', ca: 'Començar des del principi', en: 'Start over' })}
                        className="w-7 h-7 rounded-full bg-black/70 backdrop-blur-md hover:bg-black/90 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('light');
                        onRemoveHistoryItem(hItem.id);
                      }}
                      aria-label={pickLang(lang, { es: 'Quitar del historial', ca: "Treure de l'historial", en: 'Remove from history' })}
                      className="w-7 h-7 rounded-full bg-black/70 backdrop-blur-md hover:bg-black/90 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-100 truncate tabular-nums">
                      {hItem.mediaType === 'tv' && hItem.season && hItem.episode && progressPct >= 88
                        ? `${pickLang(lang, { es: 'Siguiente', ca: 'Següent', en: 'Up Next' })} · ${hItem.season}x${String(hItem.episode + 1).padStart(2, '0')}`
                        : hasResume
                        ? `${pickLang(lang, { es: 'Seguir', ca: 'Continuar', en: 'Resume' })} · ${formatShortTime(resumeSec)}`
                        : hItem.mediaType === 'tv' && hItem.season && hItem.episode
                        ? `${pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })} · ${hItem.season}x${String(hItem.episode).padStart(2, '0')}`
                        : `${pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' })} · ${hItem.year || 'HD'}`}
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white text-[#050507] flex items-center justify-center shadow-md shrink-0">
                      {isLoadingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </span>
                  </div>

                  {hasResume && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-white"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="p-2.5 flex flex-col gap-0.5 pointer-events-none relative z-[1]">
                  <h4 className="font-display font-semibold text-xs text-white line-clamp-1">
                    {hItem.title}
                  </h4>
                  <span className="text-[11px] text-zinc-400 line-clamp-1">
                    {hItem.mediaType === 'tv' && hItem.season && hItem.episode
                      ? `${hItem.season}x${String(hItem.episode).padStart(2, '0')} · ${
                          hItem.episodeTitle || pickLang(lang, { es: 'Capítulo', ca: 'Capítol', en: 'Episode' })
                        }`
                      : hItem.subtitle ||
                        (hItem.preferLang === 'EN'
                          ? pickLang(lang, { es: 'VO · Inglés', ca: 'VO · Anglès', en: 'VO · English' })
                          : pickLang(lang, { es: 'Español HD', ca: 'Castellà HD', en: 'Spanish HD' }))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const activePillar = normalizeCatalogPillar(activeSection, showWatchlistOnly);

  const activeSectionQuery =
    activeSection === 'movies' || activeSection === 'vose'
      ? movieQuery
      : activeSection === 'series'
      ? seriesQuery
      : activeSection === 'anime'
      ? animeQuery
      : activeSection === 'tdt'
      ? tdtSearch
      : activeSection === 'sports'
      ? sportsSearch
      : activeSection === 'youtube'
      ? ytQuery
      : activeSection === 'castellano'
      ? castellanoQuery
      : activeSection === 'catala'
      ? catalaQuery
      : '';

  const setActiveSectionQuery = (val: string) => {
    if (activeSection === 'movies' || activeSection === 'vose') setMovieQuery(val);
    else if (activeSection === 'series') setSeriesQuery(val);
    else if (activeSection === 'anime') setAnimeQuery(val);
    else if (activeSection === 'tdt') setTdtSearch(val);
    else if (activeSection === 'sports') setSportsSearch(val);
    else if (activeSection === 'youtube') setYtQuery(val);
    else if (activeSection === 'castellano') setCastellanoQuery(val);
    else if (activeSection === 'catala') setCatalaQuery(val);
  };

  const activeSectionFilterCount = (() => {
    if (showWatchlistOnly || activeSection === 'direct') return 0;
    if (activeSection === 'movies' || activeSection === 'vose') {
      return (
        (activeSection === 'vose' ? 1 : 0) +
        (streamingProvider !== 'all' ? 1 : 0) +
        (movieCategory !== 'trending' ? 1 : 0)
      );
    }
    if (activeSection === 'series') {
      return (
        (seriesLangMode === 'EN' || seriesLangMode === 'VOSE' ? 1 : 0) +
        (streamingProvider !== 'all' ? 1 : 0) +
        (seriesCategory !== 'trending' ? 1 : 0)
      );
    }
    if (activeSection === 'castellano') {
      return (
        (castellanoKind !== 'all' ? 1 : 0) +
        (castellanoProvider !== 'all' ? 1 : 0) +
        (castellanoCategory !== 'trending' ? 1 : 0)
      );
    }
    if (activeSection === 'anime') {
      return (
        (animeMediaKind !== 'series' ? 1 : 0) +
        (animeLangPref !== 'ES' ? 1 : 0) +
        (animePortal !== 'anime_all' ? 1 : 0) +
        (animeCategory !== 'trending' ? 1 : 0)
      );
    }
    if (activeSection === 'catala') return catalaCategory !== 'all' ? 1 : 0;
    if (activeSection === 'tdt') {
      return (tdtCategory !== 'all' ? 1 : 0) + (epgFilter !== 'all' ? 1 : 0);
    }
    if (activeSection === 'sports') return sportFilter !== 'soccer' ? 1 : 0;
    return 0;
  })();

  const isSectionSearchVisible = showSectionSearch || activeSectionQuery.trim().length > 0;

  return (
    <div className="@container w-full min-w-0 max-w-full space-y-4 pb-24 sm:pb-6" data-pillar={activePillar}>
      {/* Movie / Series Rich Details & Language Selector Modal */}
      <MediaDetailsModal
        item={previewItem}
        lang={lang}
        defaultAudioLang={
          activeSection === 'anime'
            ? animeLangPref
            : activeSection === 'vose'
            ? 'EN'
            : activeSection === 'series' && seriesLangMode === 'VOSE'
            ? 'VOSE'
            : activeSection === 'series' && seriesLangMode === 'EN'
            ? 'EN'
            : 'ES'
        }
        isBookmarked={previewItem ? isBookmarked(previewItem) : false}
        onClose={() => setPreviewItem(null)}
        onPlayMovie={(m, pLang) => onPlayMovie(m, pLang)}
        onOpenSeriesEpisodes={(tmdbId) => {
          const seed = previewItem || undefined;
          setPreviewItem(null);
          openSeriesDetails(tmdbId, seed?.seasonNumber || 1, seed);
        }}
        onToggleBookmark={(m) => onToggleCatalogFavorite(m)}
        onAddToQueue={onAddToQueue}
        onSelectSimilar={(sim) => setPreviewItem(sim)}
      />

      {/* ================================================================== */}
      {/* CATALÀ ANIME EPISODE PICKER MODAL (Z-65)                           */}
      {/* ================================================================== */}
      {selectedCatalaSeries &&
        (() => {
          const CAT_CHUNK = 50;
          const allCatEps = selectedCatalaSeries.episodes || [];
          const orderedCatEps = catalaEpSortDesc ? [...allCatEps].reverse() : allCatEps;
          const trimmedCatQ = catalaEpQuery.trim();
          const numCatTarget = /^\d+$/.test(trimmedCatQ) ? parseInt(trimmedCatQ, 10) : null;
          const lowCatQ = trimmedCatQ.toLowerCase();

          const filteredCatEps = trimmedCatQ
            ? numCatTarget !== null
              ? [
                  ...orderedCatEps.filter((ep) => ep.episodeNumber === numCatTarget),
                  ...orderedCatEps.filter(
                    (ep) =>
                      ep.episodeNumber !== numCatTarget &&
                      (String(ep.episodeNumber).includes(trimmedCatQ) ||
                        ep.title.toLowerCase().includes(lowCatQ))
                  ),
                ]
              : orderedCatEps.filter(
                  (ep) =>
                    ep.title.toLowerCase().includes(lowCatQ) ||
                    String(ep.episodeNumber).includes(lowCatQ)
                )
            : orderedCatEps;

          const totalCatChunks = Math.ceil(orderedCatEps.length / CAT_CHUNK);
          const safeCatStart =
            catalaEpRangeStart < orderedCatEps.length ? catalaEpRangeStart : 0;
          const visibleCatEps = trimmedCatQ
            ? filteredCatEps.slice(0, 80)
            : orderedCatEps.length > CAT_CHUNK
            ? orderedCatEps.slice(safeCatStart, safeCatStart + CAT_CHUNK)
            : orderedCatEps;

          return (
            <div
              onClick={() => setSelectedCatalaSeries(null)}
              className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
            >
              <div
                ref={catalaModalRef}
                role="dialog"
                aria-modal="true"
                aria-label={selectedCatalaSeries.title}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-[940px] max-h-[93dvh] sm:max-h-[89dvh] rounded-t-3xl sm:rounded-3xl bg-[#090A10] border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden outline-none"
              >
                <div className="sm:hidden pt-2 flex justify-center shrink-0">
                  <div className="w-10 h-1.5 rounded-full bg-white/25" />
                </div>

                {/* Header */}
                <div className="relative px-3.5 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-[#1A130D] to-[#090A10] border-b border-white/[0.08] space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-amber-300 font-semibold truncate">
                      <span>Anime en Català</span>
                      <span className="mx-1.5 text-zinc-500">·</span>
                      <span className="text-zinc-300 font-normal">
                        {selectedCatalaSeries.eraTag}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCatalaSeries(null)}
                      aria-label="Tancar"
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 flex items-center justify-center text-white shrink-0 cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display font-bold text-lg sm:text-2xl text-white leading-tight">
                        {selectedCatalaSeries.title}
                      </h2>
                      <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                        {selectedCatalaSeries.overview}
                      </p>
                    </div>

                    {orderedCatEps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayCatalaEpisode(selectedCatalaSeries, orderedCatEps[0]);
                          setSelectedCatalaSeries(null);
                        }}
                        className="min-h-[44px] px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Reproduir Cap. 1</span>
                      </button>
                    )}
                  </div>

                  {/* Season / Pack Tabs if multiple */}
                  {selectedCatalaSeries.seasons.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
                      {selectedCatalaSeries.seasons.map((sn) => {
                        const active = sn.seasonNumber === selectedCatalaSeries.activeSeason;
                        return (
                          <button
                            key={sn.seasonNumber}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              openCatalaSeriesDetails(
                                {
                                  id: selectedCatalaSeries.id,
                                  title: selectedCatalaSeries.title,
                                  originalTitle: selectedCatalaSeries.originalTitle || '',
                                  mediaType: 'tv',
                                  category: 'all',
                                  eraTag: selectedCatalaSeries.eraTag,
                                  episodeHint: '',
                                  year: selectedCatalaSeries.year || 'CAT',
                                  rating: selectedCatalaSeries.rating || '',
                                  overview: selectedCatalaSeries.overview,
                                  poster: selectedCatalaSeries.poster,
                                  backdrop: selectedCatalaSeries.backdrop,
                                  seasonCount: selectedCatalaSeries.seasons.length,
                                },
                                sn.seasonNumber
                              );
                            }}
                            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                              active
                                ? 'bg-white text-[#050508] border-white'
                                : 'bg-white/[0.05] text-zinc-300 border-white/10 hover:bg-white/[0.1]'
                            }`}
                          >
                            {sn.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Search & 50-Episode Range Chunks */}
                  {allCatEps.length > 6 && (
                    <div className="space-y-2 pt-0.5">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 min-w-0">
                          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={catalaEpQuery}
                            onChange={(e) => setCatalaEpQuery(e.target.value)}
                            placeholder="Cercar número o títol de capítol (ex: 42)..."
                            className="w-full h-10 pl-9 pr-8 rounded-xl bg-black/55 border border-white/12 focus:border-white/35 text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                          />
                          {catalaEpQuery && (
                            <button
                              type="button"
                              onClick={() => setCatalaEpQuery('')}
                              aria-label="Netejar cerca"
                              className="w-8 h-8 rounded-lg absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setCatalaEpSortDesc((v) => !v);
                            setCatalaEpRangeStart(0);
                          }}
                          className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span>
                            {catalaEpSortDesc ? 'Últims primer' : 'Cap. 1 primer'}
                          </span>
                        </button>
                      </div>

                      {!trimmedCatQ && totalCatChunks > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                          {Array.from({ length: totalCatChunks }).map((_, cIdx) => {
                            const startIdx = cIdx * CAT_CHUNK;
                            const firstEp = orderedCatEps[startIdx]?.episodeNumber ?? startIdx + 1;
                            const lastEp =
                              orderedCatEps[
                                Math.min(orderedCatEps.length - 1, startIdx + CAT_CHUNK - 1)
                              ]?.episodeNumber ?? Math.min(orderedCatEps.length, startIdx + CAT_CHUNK);
                            const activeChunk = safeCatStart === startIdx;
                            return (
                              <button
                                key={startIdx}
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  setCatalaEpRangeStart(startIdx);
                                  catalaEpScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                  activeChunk
                                    ? 'bg-amber-400 text-[#120D02]'
                                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                                }`}
                              >
                                {firstEp}–{lastEp}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Scrollable Catalan Episode List */}
                <div
                  ref={catalaEpScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-3"
                >
                  {loadingCatalaEpisodes ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-sm text-zinc-400">
                      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                      <span>Carregant tots els capítols en català...</span>
                    </div>
                  ) : visibleCatEps.length === 0 ? (
                    <div className="py-10 text-center text-sm text-zinc-400">
                      No s&apos;han trobat capítols per a aquesta cerca.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                      {visibleCatEps.map((ep) => (
                        <div
                          key={ep.id}
                          className="group relative min-w-0 text-left rounded-2xl bg-[#0F1119] hover:bg-[#161925] border border-white/[0.08] hover:border-amber-400/45 p-2.5 sm:p-3 flex items-center gap-3 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success');
                              onPlayCatalaEpisode(selectedCatalaSeries, ep);
                              setSelectedCatalaSeries(null);
                            }}
                            aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${ep.episodeNumber}. ${ep.title}`}
                            className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                          />
                          <div className="relative w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-[#090A10] shrink-0 pointer-events-none z-[1]">
                            <PosterImage
                              src={ep.still || selectedCatalaSeries.backdrop}
                              alt={ep.title}
                              aspect="video"
                              imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                              fallbackIcon={<Tv className="w-5 h-5 text-zinc-500" />}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              </div>
                            </div>
                            <span className="absolute bottom-1.5 left-2 text-[10px] font-mono font-bold text-white tabular-nums drop-shadow">
                              Cap. {ep.episodeNumber}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5 pointer-events-none relative z-[1]">
                            <h4 className="font-display font-semibold text-sm text-white line-clamp-1">
                              {ep.episodeNumber}. {ep.title}
                            </h4>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden tabular-nums">
                              <span className="text-amber-300 font-semibold">Català</span>
                              {ep.runtime ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{ep.runtime} min</span>
                                </>
                              ) : null}
                            </div>
                            <p className="text-xs text-zinc-400/90 line-clamp-1">
                              {ep.overview}
                            </p>
                          </div>

                          {ep.streamUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('success');
                                onAddToQueue({
                                  kind: 'direct',
                                  title: `${selectedCatalaSeries.title} · Cap. ${ep.episodeNumber}`,
                                  subtitle: `${ep.title} (Català)`,
                                  poster: selectedCatalaSeries.poster,
                                  url: ep.streamUrl,
                                });
                              }}
                              title={t.addToQueue}
                              aria-label={t.addToQueue}
                              className="relative z-10 min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* ================================================================== */}
      {/* DEDICATED 2-STEP SERIES -> TEMPORADA -> CAPÍTULO MODAL (Z-65)      */}
      {/* Opens in 0ms on click and lists ALL seasons and ALL episodes       */}
      {/* ================================================================== */}
      {selectedSeries &&
        (() => {
          const EPISODE_CHUNK_SIZE = 50;
          const allSeasonEpisodes = selectedSeries.episodes || [];
          const orderedEpisodes = episodeSortDesc
            ? [...allSeasonEpisodes].reverse()
            : allSeasonEpisodes;

          const trimmedEpQuery = episodeSearchQuery.trim();
          const numericEpTarget = /^\d+$/.test(trimmedEpQuery)
            ? parseInt(trimmedEpQuery, 10)
            : null;
          const lowerEpQuery = trimmedEpQuery.toLowerCase();

          const filteredEpisodes = trimmedEpQuery
            ? numericEpTarget !== null
              ? [
                  ...orderedEpisodes.filter((ep) => ep.episodeNumber === numericEpTarget),
                  ...orderedEpisodes.filter(
                    (ep) =>
                      ep.episodeNumber !== numericEpTarget &&
                      (String(ep.episodeNumber).includes(trimmedEpQuery) ||
                        ep.title.toLowerCase().includes(lowerEpQuery))
                  ),
                ]
              : orderedEpisodes.filter(
                  (ep) =>
                    ep.title.toLowerCase().includes(lowerEpQuery) ||
                    (ep.overview && ep.overview.toLowerCase().includes(lowerEpQuery)) ||
                    String(ep.episodeNumber).includes(lowerEpQuery)
                )
            : orderedEpisodes;

          const totalChunks = Math.ceil(orderedEpisodes.length / EPISODE_CHUNK_SIZE);
          const safeRangeStart =
            episodeRangeStart < orderedEpisodes.length ? episodeRangeStart : 0;
          const visibleEpisodes = trimmedEpQuery
            ? filteredEpisodes.slice(0, 80)
            : orderedEpisodes.length > EPISODE_CHUNK_SIZE
            ? orderedEpisodes.slice(safeRangeStart, safeRangeStart + EPISODE_CHUNK_SIZE)
            : orderedEpisodes;

          const seriesBookmarkPayload: CatalogMovie = {
            id: `series-${selectedSeries.tmdbId}`,
            tmdbId: selectedSeries.tmdbId,
            mediaType: 'tv',
            title: selectedSeries.title,
            year: selectedSeries.year,
            rating: selectedSeries.rating,
            overview: selectedSeries.overview,
            poster: selectedSeries.poster,
            backdrop: selectedSeries.backdrop,
            languages: [],
          };
          const seriesSaved = isBookmarked(seriesBookmarkPayload);

          return (
            <div
              onClick={() => setSelectedSeries(null)}
              className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
            >
              <div
                ref={seriesModalRef}
                role="dialog"
                aria-modal="true"
                aria-label={selectedSeries.title}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-[940px] max-h-[93dvh] sm:max-h-[89dvh] rounded-t-3xl sm:rounded-3xl bg-[#090A10] border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden outline-none"
              >
                {/* Mobile Grab Handle */}
                <div className="sm:hidden pt-2 flex justify-center shrink-0">
                  <div className="w-10 h-1.5 rounded-full bg-white/25" />
                </div>

                {/* Compact Series Header + Season Selector (Never crushes episodes below) */}
                <div className="relative px-3.5 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-[#131522] to-[#090A10] border-b border-white/[0.08] space-y-2.5 sm:space-y-3 shrink-0">
                  {/* Top Action Bar: Save + Audio Switcher on Left | Pinned Close Button on Right */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar">
                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(seriesBookmarkPayload, e)}
                        className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 shrink-0 ${
                            seriesSaved ? 'fill-current text-[#E11D48]' : 'text-zinc-300'
                          }`}
                        />
                        <span>
                          {seriesSaved
                            ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                            : pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                        </span>
                      </button>

                      {/* Audio Selector */}
                      <div className="flex items-center gap-1 p-1 rounded-xl bg-black/55 border border-white/10 shrink-0">
                        {(Array.isArray(selectedSeries.availableLanguages) &&
                        selectedSeries.availableLanguages.length > 0
                          ? (
                              [
                                { code: 'ES', label: 'Castellano' },
                                { code: 'LAT', label: 'Latino' },
                                { code: 'VOSE', label: 'VOSE' },
                                { code: 'EN', label: 'Inglés' },
                              ] as const
                            ).filter((opt) =>
                              selectedSeries.availableLanguages!.includes(opt.code)
                            )
                          : ([
                              { code: 'ES', label: 'Español' },
                              { code: 'EN', label: 'VO · Inglés' },
                            ] as const)
                        ).map((opt) => (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setSeriesLangMode(opt.code);
                            }}
                            className={`min-h-[32px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                              seriesLangMode === opt.code
                                ? 'bg-white text-[#050508]'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        {probingSeriesLangs && (
                          <span
                            title="Verificando pistas de audio..."
                            className="px-1.5 flex items-center text-zinc-400"
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E11D48]" />
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedSeries(null)}
                      aria-label="Cerrar serie"
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.08] hover:bg-[#E11D48] text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Series Title + Quick Resume / Play Episode 1 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-[11px] sm:text-xs text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                        <span className="text-[#FB7185] font-semibold">
                          {pickLang(lang, { es: 'Serie TV', ca: 'Sèrie TV', en: 'TV Series' })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-zinc-200 tabular-nums">{selectedSeries.year}</span>
                        {selectedSeries.rating && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-400 font-mono font-semibold tabular-nums">
                              ★ {selectedSeries.rating}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums text-zinc-200 truncate">
                          {selectedSeries.seasons.length}{' '}
                          {selectedSeries.seasons.length === 1
                            ? pickLang(lang, { es: 'Temporada', ca: 'Temporada', en: 'Season' })
                            : pickLang(lang, { es: 'Temporadas', ca: 'Temporades', en: 'Seasons' })}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-lg sm:text-2xl text-white leading-snug line-clamp-1 sm:line-clamp-2 text-balance">
                        {selectedSeries.title}
                      </h3>
                      {selectedSeries.overview && (
                        <p className="hidden sm:block text-xs text-zinc-400 line-clamp-1">
                          {selectedSeries.overview}
                        </p>
                      )}
                    </div>

                    {selectedSeriesHistory?.season && selectedSeriesHistory?.episode ? (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onReplayHistoryItem(selectedSeriesHistory, false);
                          setSelectedSeries(null);
                        }}
                        className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#E11D48]/25"
                      >
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span className="tabular-nums">
                          {pickLang(lang, {
                            es: `Seguir T${selectedSeriesHistory.season} · Cap. ${selectedSeriesHistory.episode}`,
                            ca: `Seguir T${selectedSeriesHistory.season} · Cap. ${selectedSeriesHistory.episode}`,
                            en: `Resume S${selectedSeriesHistory.season} · Ep ${selectedSeriesHistory.episode}`,
                          })}
                        </span>
                      </button>
                    ) : allSeasonEpisodes.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlaySeriesEpisode(
                            selectedSeries,
                            allSeasonEpisodes[0],
                            seriesLangMode
                          );
                          setSelectedSeries(null);
                        }}
                        className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#E11D48]/25"
                      >
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span className="tabular-nums">
                          {pickLang(lang, {
                            es: `Ver T${selectedSeries.activeSeason} · Cap. ${allSeasonEpisodes[0].episodeNumber}`,
                            ca: `Veure T${selectedSeries.activeSeason} · Cap. ${allSeasonEpisodes[0].episodeNumber}`,
                            en: `Play S${selectedSeries.activeSeason} · Ep ${allSeasonEpisodes[0].episodeNumber}`,
                          })}
                        </span>
                      </button>
                    ) : null}
                  </div>

                  {/* Step 1: Horizontal Season Selector */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
                    {selectedSeries.seasons.map((s) => {
                      const isActiveSeason = selectedSeries.activeSeason === s.seasonNumber;
                      return (
                        <button
                          key={s.seasonNumber}
                          type="button"
                          onClick={() => {
                            if (
                              s.seasonNumber === selectedSeries.activeSeason &&
                              !loadingSeriesDetails
                            )
                              return;
                            triggerHaptic('light');
                            openSeriesDetails(selectedSeries.tmdbId, s.seasonNumber);
                          }}
                          className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                            isActiveSeason
                              ? 'bg-white text-[#050508] border-white shadow-sm'
                              : 'bg-white/[0.05] hover:bg-white/[0.11] text-zinc-200 border-white/[0.1]'
                          }`}
                        >
                          <span className="tabular-nums">
                            {pickLang(lang, {
                              es: `Temporada ${s.seasonNumber}`,
                              ca: `Temporada ${s.seasonNumber}`,
                              en: `Season ${s.seasonNumber}`,
                            })}
                          </span>
                          {s.episodeCount > 0 && (
                            <span
                              className={`text-[11px] font-normal tabular-nums ${
                                isActiveSeason ? 'text-zinc-700' : 'text-zinc-400'
                              }`}
                            >
                              · {s.episodeCount} cap.
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Effortless Episode Navigation Bar (Jump to Ep #, Sort, & 50-Ep Range Tabs) */}
                {!loadingSeriesDetails && allSeasonEpisodes.length > 0 && (
                  <div className="px-3.5 py-2.5 sm:px-6 bg-[#0C0E16] border-b border-white/[0.07] space-y-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 min-w-0">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={episodeSearchQuery}
                          onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                          placeholder={pickLang(lang, {
                            es: `Ir al cap. # (1–${allSeasonEpisodes.length}) o buscar título...`,
                            ca: `Anar al cap. # (1–${allSeasonEpisodes.length}) o cercar títol...`,
                            en: `Jump to ep # (1–${allSeasonEpisodes.length}) or search title...`,
                          })}
                          className="w-full h-10 pl-9 pr-8 rounded-xl bg-[#06070B] border border-white/10 focus:border-[#E11D48]/60 text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
                        />
                        {episodeSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setEpisodeSearchQuery('')}
                            aria-label={pickLang(lang, {
                              es: 'Limpiar búsqueda de capítulo',
                              ca: 'Netejar cerca de capítol',
                              en: 'Clear episode search',
                            })}
                            className="w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {allSeasonEpisodes.length > 4 && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setEpisodeSortDesc((prev) => !prev);
                            setEpisodeRangeStart(0);
                            episodeListScrollRef.current?.scrollTo({ top: 0 });
                          }}
                          className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          title={
                            episodeSortDesc
                              ? pickLang(lang, {
                                  es: 'Ordenado de últimos a primeros',
                                  ca: 'Ordenat dels últims als primers',
                                  en: 'Sorted newest first',
                                })
                              : pickLang(lang, {
                                  es: 'Ordenado del capítulo 1 al final',
                                  ca: 'Ordenat del capítol 1 al final',
                                  en: 'Sorted episode 1 to end',
                                })
                          }
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 text-[#FB7185] shrink-0" />
                          <span className="tabular-nums">
                            {episodeSortDesc
                              ? pickLang(lang, {
                                  es: 'Últimos primero',
                                  ca: 'Últims primer',
                                  en: 'Newest first',
                                })
                              : `1 → ${allSeasonEpisodes.length}`}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* 50-Episode Range Blocks for Long Seasons (e.g. Doraemon 1464 eps, One Piece, etc.) */}
                    {!trimmedEpQuery && totalChunks > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {Array.from({ length: totalChunks }).map((_, chunkIdx) => {
                          const startIdx = chunkIdx * EPISODE_CHUNK_SIZE;
                          const chunkSlice = orderedEpisodes.slice(
                            startIdx,
                            startIdx + EPISODE_CHUNK_SIZE
                          );
                          if (chunkSlice.length === 0) return null;
                          const firstEpNum = chunkSlice[0].episodeNumber;
                          const lastEpNum = chunkSlice[chunkSlice.length - 1].episodeNumber;
                          const isCurrentChunk = safeRangeStart === startIdx;
                          return (
                            <button
                              key={startIdx}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                setEpisodeRangeStart(startIdx);
                                episodeListScrollRef.current?.scrollTo({
                                  top: 0,
                                  behavior: 'smooth',
                                });
                              }}
                              className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                isCurrentChunk
                                  ? 'bg-[#E11D48] text-white shadow-sm'
                                  : 'bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.07]'
                              }`}
                            >
                              {firstEpNum === lastEpNum
                                ? `Cap. ${firstEpNum}`
                                : `${firstEpNum} – ${lastEpNum}`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Scrollable Episode List (Full-Width Cards on Mobile, 2 Spacious Columns on Desktop lg:) */}
                <div
                  ref={episodeListScrollRef}
                  className="flex-1 overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-4 space-y-3 pb-[max(2rem,env(safe-area-inset-bottom))]"
                >
                  {loadingSeriesDetails ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-24 rounded-2xl bg-white/[0.04] border border-white/[0.07] skeleton-shimmer"
                        />
                      ))}
                    </div>
                  ) : allSeasonEpisodes.length === 0 ? (
                    <div className="py-12 text-center rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 space-y-2">
                      <Tv className="w-7 h-7 text-zinc-500 mx-auto" />
                      <p className="text-sm font-semibold text-white">
                        {pickLang(lang, {
                          es: 'No hay capítulos listados en esta temporada todavía',
                          ca: 'Encara no hi ha capítols llistats en aquesta temporada',
                          en: 'No episodes listed for this season yet',
                        })}
                      </p>
                    </div>
                  ) : visibleEpisodes.length === 0 ? (
                    <div className="py-10 text-center rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 space-y-2">
                      <Search className="w-6 h-6 text-zinc-500 mx-auto" />
                      <p className="text-sm font-semibold text-white">
                        {pickLang(lang, {
                          es: `No se encontró ningún capítulo para "${trimmedEpQuery}"`,
                          ca: `No s’ha trobat cap capítol per a "${trimmedEpQuery}"`,
                          en: `No episodes matching "${trimmedEpQuery}"`,
                        })}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEpisodeSearchQuery('')}
                        className="min-h-[38px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
                      >
                        {pickLang(lang, {
                          es: 'Ver todos los capítulos',
                          ca: 'Veure tots els capítols',
                          en: 'Show all episodes',
                        })}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                        {visibleEpisodes.map((ep) => {
                          const epLoadId = `tv-${selectedSeries.tmdbId}-${ep.seasonNumber}-${ep.episodeNumber}`;
                          const isExtractingEp = loadingItemId === epLoadId;
                          const epHistory = watchHistory.find(
                            (h) => sanitizeItemKey(h.id) === sanitizeItemKey(epLoadId)
                          );
                          const epResume = epHistory?.resumeTimeSec || 0;
                          const epDur = epHistory?.durationSec || 0;
                          const epProgressPct =
                            epResume > 5
                              ? epDur > 60
                                ? Math.min(96, Math.max(8, Math.round((epResume / epDur) * 100)))
                                : 30
                              : 0;

                          const rawTitle = (ep.title || '').trim();
                          const isRedundantEpTitle =
                            !rawTitle ||
                            new RegExp(
                              `^(episodio|episode|cap[ií]tulo|cap\\.?)\\s*0*${ep.episodeNumber}$`,
                              'i'
                            ).test(rawTitle);
                          const displayEpHeading = isRedundantEpTitle
                            ? pickLang(lang, {
                                es: `Capítulo ${ep.episodeNumber}`,
                                ca: `Capítol ${ep.episodeNumber}`,
                                en: `Episode ${ep.episodeNumber}`,
                              })
                            : `${ep.episodeNumber}. ${rawTitle}`;

                          return (
                            <div
                              key={ep.id}
                              className="group relative min-w-0 text-left rounded-2xl bg-[#0F1119] hover:bg-[#161925] border border-white/[0.08] hover:border-white/25 p-2.5 sm:p-3 flex items-center gap-3 transition-colors"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (loadingItemId) return;
                                  triggerHaptic('success');
                                  onPlaySeriesEpisode(selectedSeries, ep, seriesLangMode);
                                  setSelectedSeries(null);
                                }}
                                aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${displayEpHeading}`}
                                className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                              />
                              {/* 16:9 Episode Still with Crisp Number Overlay */}
                              <div className="relative w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-[#090A10] shrink-0 pointer-events-none z-[1]">
                                <PosterImage
                                  src={ep.still || selectedSeries.backdrop || selectedSeries.poster}
                                  alt={displayEpHeading}
                                  aspect="video"
                                  imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                                  fallbackIcon={<Tv className="w-5 h-5 text-zinc-400" />}
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-center justify-center">
                                  <div className="w-8 h-8 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                                    {isExtractingEp ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                    )}
                                  </div>
                                </div>

                                <span className="absolute bottom-1.5 left-2 text-[10px] font-mono font-bold text-white tabular-nums drop-shadow">
                                  Cap. {ep.episodeNumber}
                                </span>

                                {epProgressPct > 0 && (
                                  <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                                    <div
                                      className={`h-full ${
                                        epProgressPct >= 88 ? 'bg-emerald-400' : 'bg-[#E11D48]'
                                      }`}
                                      style={{
                                        width: `${epProgressPct >= 88 ? 100 : epProgressPct}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Clean Episode Title, Single-Line Metadata, and Synopsis */}
                              <div className="min-w-0 flex-1 space-y-0.5 pointer-events-none relative z-[1]">
                                <h4 className="font-display font-semibold text-sm text-white line-clamp-1">
                                  {displayEpHeading}
                                </h4>

                                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden tabular-nums">
                                  <span className="text-[#FB7185] font-semibold">
                                    T{ep.seasonNumber}
                                  </span>
                                  {ep.runtime ? (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{ep.runtime} min</span>
                                    </>
                                  ) : null}
                                  {epProgressPct >= 88 ? (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="inline-flex items-center gap-0.5 text-emerald-400 font-semibold">
                                        <Check className="w-3 h-3 shrink-0" />
                                        <span>{pickLang(lang, { es: 'Visto', ca: 'Vist', en: 'Watched' })}</span>
                                      </span>
                                    </>
                                  ) : epResume > 5 ? (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-amber-300">
                                        {formatShortTime(epResume)}
                                      </span>
                                    </>
                                  ) : null}
                                </div>

                                <p className="text-xs text-zinc-400/90 line-clamp-2 leading-snug">
                                  {ep.overview ||
                                    (ep.airDate
                                      ? pickLang(lang, {
                                          es: `Estreno ${ep.airDate} · Pulsa para reproducir`,
                                          ca: `Estrena ${ep.airDate} · Prem per reproduir`,
                                          en: `Aired ${ep.airDate} · Tap to play`,
                                        })
                                      : pickLang(lang, {
                                          es: 'Pulsa para reproducir en tu sala',
                                          ca: 'Prem per reproduir a la teva sala',
                                          en: 'Tap to play in room',
                                        }))}
                                </p>
                              </div>

                              {/* Add to Room Queue Hitbox (>=44x44px) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerHaptic('success');
                                  onAddToQueue({
                                    kind: 'tv',
                                    title: `${selectedSeries.title} · ${ep.seasonNumber}x${String(
                                      ep.episodeNumber
                                    ).padStart(2, '0')}`,
                                    subtitle: `${rawTitle || `Capítulo ${ep.episodeNumber}`} (${seriesLangMode})`,
                                    poster: ep.still || selectedSeries.poster,
                                    tmdbId: selectedSeries.tmdbId,
                                    season: ep.seasonNumber,
                                    episode: ep.episodeNumber,
                                    preferLang: seriesLangMode,
                                  });
                                }}
                                title={t.addToQueue}
                                aria-label={t.addToQueue}
                                className="relative z-10 min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Bottom Prev / Next 50-Episode Range Footer for Easy Sequential Navigation */}
                      {!trimmedEpQuery && totalChunks > 1 && (
                        <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/[0.06]">
                          <button
                            type="button"
                            disabled={safeRangeStart === 0}
                            onClick={() => {
                              triggerHaptic('light');
                              setEpisodeRangeStart(
                                Math.max(0, safeRangeStart - EPISODE_CHUNK_SIZE)
                              );
                              episodeListScrollRef.current?.scrollTo({
                                top: 0,
                                behavior: 'smooth',
                              });
                            }}
                            className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-35 disabled:pointer-events-none border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            <span>
                              {pickLang(lang, {
                                es: 'Anteriores 50',
                                ca: 'Anteriors 50',
                                en: 'Previous 50',
                              })}
                            </span>
                          </button>

                          <span className="text-xs text-zinc-400 tabular-nums text-center">
                            {safeRangeStart + 1}–
                            {Math.min(
                              orderedEpisodes.length,
                              safeRangeStart + EPISODE_CHUNK_SIZE
                            )}{' '}
                            {pickLang(lang, { es: 'de', ca: 'de', en: 'of' })}{' '}
                            {orderedEpisodes.length}
                          </span>

                          <button
                            type="button"
                            disabled={
                              safeRangeStart + EPISODE_CHUNK_SIZE >= orderedEpisodes.length
                            }
                            onClick={() => {
                              triggerHaptic('light');
                              setEpisodeRangeStart(safeRangeStart + EPISODE_CHUNK_SIZE);
                              episodeListScrollRef.current?.scrollTo({
                                top: 0,
                                behavior: 'smooth',
                              });
                            }}
                            className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-35 disabled:pointer-events-none border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            <span>
                              {pickLang(lang, {
                                es: 'Siguientes 50',
                                ca: 'Següents 50',
                                en: 'Next 50',
                              })}
                            </span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* ================================================================== */}
      {/* VIEW 0: APPLE TV+ LIQUID GLASS ART-FIRST HOME SHOWCASE             */}
      {/* ================================================================== */}
      {activeSection === 'home' && (
        <div className="space-y-8">
          {/* Compact Single-Line Universal Search + Direct URL Action */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={homeQuery}
                  onChange={(e) => setHomeQuery(e.target.value)}
                  placeholder={pickLang(lang, {
                    es: 'Buscar pelis, series, anime, TV o URL...',
                    ca: 'Cerca pel·lis, sèries, anime, TV o URL...',
                    en: 'Search movies, series, anime, TV or URL...',
                  })}
                  className="w-full h-9 pl-9 pr-8 rounded-full bg-white/[0.05] focus:bg-white/[0.08] border border-white/[0.09] focus:border-[#9146FF]/70 text-sm text-white placeholder:text-zinc-400 outline-none transition-all"
                />
                {homeQuery && (
                  <button
                    type="button"
                    onClick={() => setHomeQuery('')}
                    aria-label={pickLang(lang, { es: 'Limpiar búsqueda', ca: 'Netejar cerca', en: 'Clear search' })}
                    className="w-7 h-7 rounded-full absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setFocusedHub('all');
                  onChangeSection('direct');
                }}
                className="h-9 px-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Link2 className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>
                  {roomQueue.length > 0
                    ? `${pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' })} · ${roomQueue.length}`
                    : pickLang(lang, { es: 'URL', ca: 'URL', en: 'URL' })}
                </span>
              </button>
            </div>

            {/^https?:\/\//i.test(homeQuery.trim()) && (
              <div className="p-3.5 rounded-2xl liquid-glass flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-200">
                  <Link2 className="w-4 h-4 text-white shrink-0" />
                  <span className="font-mono truncate max-w-[260px] sm:max-w-[460px]">
                    {homeQuery.trim()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayCustomUrl(homeQuery.trim());
                      setHomeQuery('');
                    }}
                    className="min-h-[42px] px-4 rounded-full bg-white hover:bg-zinc-200 text-xs font-bold text-[#050507] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{pickLang(lang, { es: 'Reproducir enlace', ca: 'Reproduir enllaç', en: 'Play link' })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onOpenCloudBrowser(homeQuery.trim());
                      setHomeQuery('');
                    }}
                    className="min-h-[42px] px-4 rounded-full liquid-glass-pill hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>{t.openWebBtn}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unified Instant Search Results When Typing on Home */}
          {debouncedHomeQuery.length >= 2 ? (
            <div className="space-y-6">
              {loadingHomeSearch && (
                <div
                  className={`${
                    homeMovieResults.length > 0 ||
                    homeSeriesResults.length > 0 ||
                    homeMatchingChannels.length > 0
                      ? 'py-2.5 px-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] inline-flex'
                      : 'py-8 flex justify-center'
                  } items-center gap-2 text-xs sm:text-sm text-zinc-400`}
                >
                  <Loader2 className="w-4 h-4 animate-spin text-[#BF94FF] shrink-0" />
                  <span>{pickLang(lang, { es: 'Buscando en todo el catálogo...', ca: 'Cercant a tot el catàleg...', en: 'Searching across catalog...' })}</span>
                </div>
              )}

              {homeMatchingChannels.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white">
                    {pickLang(lang, { es: 'Canales en Directo', ca: 'Canals en Directe', en: 'Live TV Channels' })}
                  </h3>
                  <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3">
                    {homeMatchingChannels.map((ch) => {
                      const chEpg = getChannelLiveEpg(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('success');
                            onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                          }}
                          className="min-h-[72px] p-3.5 rounded-2xl bg-[#0B0C12] hover:bg-[#131520] border border-white/[0.08] hover:border-white/25 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center border border-white/15 font-display font-extrabold text-xs text-white"
                              style={{
                                background: `linear-gradient(145deg, ${ch.brandTone}33 0%, #090A10 100%)`,
                              }}
                            >
                              {ch.shortMark}
                            </div>
                            <div className="min-w-0">
                              <div className="font-display font-bold text-sm text-white truncate">
                                {ch.name}
                              </div>
                              {chEpg?.now ? (
                                <div className="text-xs text-zinc-300 truncate">
                                  <span className="font-mono tabular-nums text-emerald-400">
                                    {chEpg.now.startLabel}
                                  </span>
                                  <span className="mx-1 text-zinc-500">·</span>
                                  <span>{chEpg.now.title}</span>
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-400 truncate">
                                  {pickLang(lang, { es: 'En directo', ca: 'En directe', en: 'Live' })} · {ch.network}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="w-9 h-9 rounded-full bg-white text-[#050507] flex items-center justify-center shrink-0">
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {homeSeriesResults.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white">
                    {pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'TV Series' })}
                  </h3>
                  <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5">
                    {homeSeriesResults.map((show) => (
                      <button
                        key={`hseries-${show.id}`}
                        type="button"
                        onClick={() => {
                          if (!show.tmdbId) return;
                          triggerHaptic('light');
                          openSeriesDetails(show.tmdbId, 1, { ...show, mediaType: 'tv' });
                        }}
                        aria-label={`${show.title} · ${pickLang(lang, { es: 'Ver capítulos', ca: 'Veure capítols', en: 'Browse episodes' })}`}
                        className="group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] hover:border-white/25 cursor-pointer transition-colors text-left focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      >
                        <PosterImage
                          src={show.poster}
                          alt={show.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={show.title}
                          fallbackIcon={<Tv className="w-8 h-8 text-zinc-500" />}
                        />
                        <div className="absolute inset-x-0 bottom-0 pt-14 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent">
                          <span className="block font-display font-bold text-xs sm:text-sm text-white line-clamp-2">
                            {show.title}
                          </span>
                          <span className="block text-[11px] text-zinc-300 mt-0.5">
                            {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })} · {show.year || 'TV'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {homeMovieResults.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white">
                    {pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}
                  </h3>
                  <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5">
                    {homeMovieResults.map((movie) => (
                      <button
                        key={`hmovie-${movie.id}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setPreviewItem(movie);
                        }}
                        aria-label={`${movie.title} · ${pickLang(lang, { es: 'Ver ficha', ca: 'Veure fitxa', en: 'View info' })}`}
                        className="group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] hover:border-white/25 cursor-pointer transition-colors text-left focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      >
                        <PosterImage
                          src={movie.poster}
                          alt={movie.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={movie.title}
                          fallbackIcon={<Film className="w-8 h-8 text-zinc-500" />}
                        />
                        <div className="absolute inset-x-0 bottom-0 pt-14 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent">
                          <span className="block font-display font-bold text-xs sm:text-sm text-white line-clamp-2">
                            {movie.title}
                          </span>
                          <span className="block text-[11px] text-zinc-300 mt-0.5">
                            {pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' })} · {movie.year || 'HD'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {!loadingHomeSearch &&
                homeMovieResults.length === 0 &&
                homeSeriesResults.length === 0 &&
                homeMatchingChannels.length === 0 && (
                  <div className="py-12 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-4 space-y-2.5">
                    <p className="text-sm font-semibold text-white">
                      {pickLang(lang, {
                        es: `No encontramos resultados para «${debouncedHomeQuery}»`,
                        ca: `No hem trobat resultats per a «${debouncedHomeQuery}»`,
                        en: `No results found for "${debouncedHomeQuery}"`,
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setYtQuery(debouncedHomeQuery);
                        setDebouncedYtQuery(debouncedHomeQuery);
                        onChangeSection('youtube');
                      }}
                      className="min-h-[44px] px-5 rounded-full bg-white text-[#050507] text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Youtube className="w-4 h-4 text-[#050507]" />
                      <span>{pickLang(lang, { es: 'Buscar en YouTube', ca: 'Cercar a YouTube', en: 'Search YouTube' })}</span>
                    </button>
                  </div>
                )}
            </div>
          ) : (
            <>
              {/* ============================================================ */}
              {/* 1. APPLE TV+ PANORAMIC 16:9 HERO CAROUSEL                    */}
              {/* ============================================================ */}
              {(() => {
                const safeIdx =
                  homeHeroSlides.length > 0 ? heroSlideIndex % homeHeroSlides.length : 0;
                const heroItem = homeHeroSlides[safeIdx] || null;
                const heroImg = heroItem ? heroItem.backdrop || heroItem.poster : '';
                const heroKey = heroItem ? `hero-${heroItem.id}` : '';
                const heroBroken = heroKey ? brokenHeroImgs[heroKey] : false;

                if (loadingHomeShowcase && !heroItem) {
                  return (
                    <div className="w-full min-h-[300px] sm:min-h-[400px] rounded-[28px] bg-white/[0.03] border border-white/[0.08] skeleton-shimmer" />
                  );
                }

                if (!heroItem) return null;

                const isTv = heroItem.mediaType === 'tv';
                const heroSaved = isBookmarked(heroItem);

                return (
                  <section
                    aria-label={pickLang(lang, { es: 'Estrenos destacados', ca: 'Estrenes destacades', en: 'Featured spotlight' })}
                    onMouseEnter={() => setIsHeroHovered(true)}
                    onMouseLeave={() => setIsHeroHovered(false)}
                    className="relative w-full min-h-[320px] sm:min-h-[430px] rounded-[28px] overflow-hidden border border-white/[0.12] bg-[#0B0B10] nc-specular-surface flex flex-col justify-end p-5 sm:p-9 lg:p-11 shadow-[0_28px_70px_rgba(0,0,0,0.75)]"
                  >
                    {!heroBroken && heroImg ? (
                      <img
                        key={heroKey}
                        src={heroImg}
                        alt={heroItem.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenHeroImgs((prev) => ({ ...prev, [heroKey]: true }))
                        }
                        className="absolute inset-0 w-full h-full object-cover object-center opacity-80 transition-opacity duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 nc-aurora-ambient" />
                    )}

                    {/* Desktop ambient muted trailer preview (respects reduced motion) */}
                    {heroTrailerKey && (
                      <iframe
                        key={`trailer-${heroTrailerKey}-${heroTrailerMuted ? 'm' : 'u'}`}
                        title={`${heroItem.title} trailer`}
                        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(heroTrailerKey)}?autoplay=1&mute=${heroTrailerMuted ? 1 : 0}&controls=0&loop=1&playlist=${encodeURIComponent(heroTrailerKey)}&playsinline=1&rel=0&modestbranding=1`}
                        allow="autoplay; encrypted-media"
                        className="hidden motion-safe:lg:block absolute inset-0 w-full h-[135%] -top-[17.5%] object-cover opacity-55 pointer-events-none scale-[1.12]"
                      />
                    )}

                    {/* Cinema Scrims for Crisp Readability Without Boxy Clutter */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08080C] via-[#08080C]/55 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#08080C]/95 via-[#08080C]/45 to-transparent" />

                    {/* Optional ambient audio toggle on desktop */}
                    {heroTrailerKey && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setHeroTrailerMuted((m) => !m);
                        }}
                        aria-label={
                          heroTrailerMuted
                            ? pickLang(lang, { es: 'Activar sonido del tráiler', ca: 'Activar so del tràiler', en: 'Unmute trailer preview' })
                            : pickLang(lang, { es: 'Silenciar tráiler', ca: 'Silenciar tràiler', en: 'Mute trailer preview' })
                        }
                        className="hidden lg:flex absolute top-5 right-5 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-xl border border-white/15 text-white items-center justify-center cursor-pointer transition-colors"
                      >
                        {heroTrailerMuted ? (
                          <VolumeX className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-[#BF94FF]" />
                        )}
                      </button>
                    )}

                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
                      <div className="max-w-2xl space-y-2.5">
                        <div className="text-xs sm:text-[13px] font-medium text-zinc-300 flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-white">
                            {isTv
                              ? pickLang(lang, { es: 'Serie Destacada', ca: 'Sèrie Destacada', en: 'Featured Series' })
                              : pickLang(lang, { es: 'Película Destacada', ca: 'Pel·lícula Destacada', en: 'Featured Movie' })}
                          </span>
                          <span className="text-zinc-500" aria-hidden="true">
                            ·
                          </span>
                          <span className="tabular-nums">{heroItem.year || '2025'}</span>
                          {heroItem.rating && (
                            <>
                              <span className="text-zinc-500" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono tabular-nums text-zinc-100">
                                ★ {heroItem.rating}
                              </span>
                            </>
                          )}
                          <span className="text-zinc-500" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-zinc-300">Castellano · VO 1080p</span>
                        </div>

                        <h2 className="font-display font-bold text-2xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.06] text-balance">
                          {heroItem.title}
                        </h2>

                        {heroItem.overview && (
                          <p className="text-xs sm:text-sm text-zinc-300/95 line-clamp-2 max-w-[58ch] leading-relaxed">
                            {heroItem.overview}
                          </p>
                        )}

                        <div className="pt-2 flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success');
                              if (isTv && heroItem.tmdbId) {
                                openSeriesDetails(heroItem.tmdbId, 1, heroItem);
                              } else {
                                onPlayMovie(heroItem, 'ES');
                              }
                            }}
                            className="min-h-[46px] px-6 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-[0_10px_28px_rgba(145,70,255,0.42)] transition-all active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {loadingItemId === heroItem.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4 fill-current" />
                            )}
                            <span>
                              {isTv
                                ? pickLang(lang, { es: 'Ver Episodios', ca: 'Veure Capítols', en: 'Browse Episodes' })
                                : pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play Movie' })}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setPreviewItem(heroItem);
                            }}
                            className="min-h-[46px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-xl border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            <Info className="w-4 h-4" />
                            <span>
                              {isTv
                                ? pickLang(lang, { es: 'Ficha y Tráiler', ca: 'Fitxa i Tràiler', en: 'Info & Trailer' })
                                : pickLang(lang, { es: 'Idioma y Ficha', ca: 'Idioma i Fitxa', en: 'Audio & Info' })}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success');
                              onAddToQueue({
                                kind: isTv ? 'tv' : 'movie',
                                title: heroItem.title,
                                subtitle: `${isTv ? pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' }) : pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' })} · ${heroItem.year || 'HD'}`,
                                poster: heroItem.poster || heroItem.backdrop,
                                tmdbId: heroItem.tmdbId,
                                preferLang: 'ES',
                              });
                            }}
                            className="min-h-[46px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-xl border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            <ListVideo className="w-4 h-4 text-[#BF94FF]" />
                            <span>{pickLang(lang, { es: '+ Cola', ca: '+ Cua', en: '+ Queue' })}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleToggleBookmark(heroItem, e)}
                            aria-label={pickLang(lang, { es: 'Guardar en Mi Lista', ca: 'Desar a la Meva Llista', en: 'Save to My List' })}
                            className="min-h-[46px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-xl border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            {heroSaved ? (
                              <Check className="w-4 h-4 text-[#BF94FF]" />
                            ) : (
                              <Plus className="w-4 h-4 text-white" />
                            )}
                            <span>
                              {heroSaved
                                ? pickLang(lang, { es: 'En Mi Lista', ca: 'A la Meva Llista', en: 'In My List' })
                                : t.pillarMyList}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Discreet Apple TV Carousel Controls */}
                      {homeHeroSlides.length > 1 && (
                        <div className="flex items-center gap-2 self-end shrink-0">
                          <div className="flex items-center gap-1.5 mr-1">
                            {homeHeroSlides.map((slide, idx) => (
                              <button
                                key={slide.id}
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  setHeroSlideIndex(idx);
                                }}
                                aria-label={pickLang(lang, {
                                  es: `Ir a destacado ${idx + 1}`,
                                  ca: `Anar al destacat ${idx + 1}`,
                                  en: `Go to spotlight ${idx + 1}`,
                                })}
                                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                  idx === safeIdx
                                    ? 'w-6 bg-[#9146FF]'
                                    : 'w-1.5 bg-white/30 hover:bg-white/55'
                                }`}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setHeroSlideIndex(
                                (prev) =>
                                  (prev - 1 + homeHeroSlides.length) % homeHeroSlides.length
                              );
                            }}
                            aria-label={pickLang(lang, { es: 'Destacado anterior', ca: 'Destacat anterior', en: 'Previous spotlight' })}
                            className="w-9 h-9 rounded-full liquid-glass-pill hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setHeroSlideIndex((prev) => (prev + 1) % homeHeroSlides.length);
                            }}
                            aria-label={pickLang(lang, { es: 'Siguiente destacado', ca: 'Següent destacat', en: 'Next spotlight' })}
                            className="w-9 h-9 rounded-full liquid-glass-pill hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })()}

              {/* ============================================================ */}
              {/* 2. SEGUIR VIENDO ("UP NEXT")                                 */}
              {/* ============================================================ */}
              {renderContinueWatchingStrip()}

              {/* ============================================================ */}
              {/* 3. APPLE TV CHANNELS & PLATFORMS DOCK (MINIMALIST GLASS)     */}
              {/* ============================================================ */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
                    {pickLang(lang, { es: 'Canales y Plataformas', ca: 'Canals i Plataformes', en: 'Channels & Apps' })}
                  </h3>
                  <span className="text-xs font-medium text-zinc-500 tabular-nums">
                    17 {pickLang(lang, { es: 'plataformas', ca: 'plataformes', en: 'apps' })}
                  </span>
                </div>

                <div className="grid grid-cols-3 @sm:grid-cols-4 @md:grid-cols-6 gap-2.5 sm:gap-3">
                  {[
                    {
                      id: 'netflix',
                      label: 'Netflix',
                      mark: 'NETFLIX',
                      markClass: 'text-[#E50914] tracking-tighter text-sm sm:text-base font-black',
                      onClick: () => enterStreamingPlatform('netflix', 'movies'),
                    },
                    {
                      id: 'hbomax',
                      label: 'HBO Max',
                      mark: 'MAX',
                      markClass: 'text-white tracking-widest text-sm sm:text-base font-black',
                      onClick: () => enterStreamingPlatform('hbomax', 'movies'),
                    },
                    {
                      id: 'disney',
                      label: 'Disney+',
                      mark: 'Disney+',
                      markClass: 'text-[#60A5FA] tracking-tight text-sm sm:text-base font-extrabold',
                      onClick: () => enterStreamingPlatform('disney', 'movies'),
                    },
                    {
                      id: 'prime',
                      label: 'Prime Video',
                      mark: 'prime',
                      markClass: 'text-[#38BDF8] tracking-tight text-sm sm:text-base font-extrabold',
                      onClick: () => enterStreamingPlatform('prime', 'movies'),
                    },
                    {
                      id: 'apple',
                      label: 'Apple TV+',
                      mark: 'tv+',
                      markClass: 'text-white tracking-tight text-base sm:text-lg font-black',
                      onClick: () => enterStreamingPlatform('apple', 'movies'),
                    },
                    {
                      id: 'movistar',
                      label: 'Movistar+',
                      mark: 'M+',
                      markClass: 'text-[#019DF4] tracking-tight text-base sm:text-lg font-black',
                      onClick: () => enterMovistarHub('live'),
                    },
                    {
                      id: 'dazn',
                      label: pickLang(lang, { es: 'DAZN Vivo', ca: 'DAZN Directe', en: 'DAZN Live' }),
                      mark: 'DAZN',
                      markClass: 'text-white tracking-tighter text-sm sm:text-base font-black',
                      onClick: enterDaznLiveHub,
                    },
                    {
                      id: 'uk_sports',
                      label: 'UK Sports (EN)',
                      mark: 'SKY UK',
                      markClass: 'text-sky-300 tracking-tight text-sm sm:text-base font-black',
                      onClick: () => enterLiveSportsBrandHub('uk_sports'),
                    },
                    {
                      id: 'beinsports',
                      label: 'beIN SPORTS',
                      mark: 'beIN',
                      markClass: 'text-violet-400 tracking-tight text-sm sm:text-base font-black',
                      onClick: () => enterLiveSportsBrandHub('beinsports'),
                    },
                    {
                      id: 'espn',
                      label: pickLang(lang, { es: 'ESPN 1–7 Vivo', ca: 'ESPN 1–7 Directe', en: 'ESPN 1–7 Live' }),
                      mark: 'ESPN',
                      markClass: 'text-red-500 tracking-tight text-sm sm:text-base font-black',
                      onClick: () => enterLiveSportsBrandHub('espn'),
                    },
                    {
                      id: 'dsports',
                      label: pickLang(lang, { es: 'DSports Vivo', ca: 'DSports Directe', en: 'DSports Live' }),
                      mark: 'DSP+',
                      markClass: 'text-sky-400 tracking-tight text-sm sm:text-base font-black',
                      onClick: () => enterLiveSportsBrandHub('dsports'),
                    },
                    {
                      id: 'tnt_space',
                      label: pickLang(lang, { es: 'TNT & Space', ca: 'TNT i Space', en: 'TNT & Space' }),
                      mark: 'TNT',
                      markClass: 'text-pink-400 tracking-tight text-sm sm:text-base font-black',
                      onClick: () => enterLiveSportsBrandHub('tnt_space'),
                    },
                    {
                      id: 'tdt',
                      label: pickLang(lang, { es: 'TDT España', ca: 'TDT Espanya', en: 'Spain TDT' }),
                      mark: 'TDT',
                      markClass: 'text-emerald-400 tracking-tight text-sm sm:text-base font-black',
                      onClick: enterSpanishTdtHub,
                    },
                    {
                      id: 'anime',
                      label: 'Anime Hub',
                      mark: 'ANIME',
                      markClass: 'text-[#FB923C] tracking-wider text-xs sm:text-sm font-black',
                      onClick: () => enterAnimeHub('anime_all', 'series'),
                    },
                    {
                      id: 'castellano',
                      label: pickLang(lang, { es: 'Castellano', ca: 'Castellà', en: 'Spanish Dub' }),
                      mark: 'ES · HD',
                      markClass: 'text-amber-300 tracking-tight text-xs sm:text-sm font-black',
                      onClick: () => {
                        triggerHaptic('light');
                        setFocusedHub('all');
                        setCastellanoKind('all');
                        setCastellanoProvider('all');
                        setCastellanoCategory('trending');
                        setCastellanoQuery('');
                        setCastellanoPage(1);
                        onChangeSection('castellano');
                      },
                    },
                    {
                      id: 'catala',
                      label: 'Anime Català',
                      mark: 'CAT · SX3',
                      markClass: 'text-rose-300 tracking-tight text-xs sm:text-sm font-black',
                      onClick: () => {
                        triggerHaptic('light');
                        setFocusedHub('all');
                        setCatalaCategory('all');
                        setCatalaQuery('');
                        onChangeSection('catala');
                      },
                    },
                    {
                      id: 'youtube',
                      label: pickLang(lang, { es: 'YouTube Sala', ca: 'YouTube Sala', en: 'YouTube Party' }),
                      mark: 'YT',
                      markClass: 'text-white tracking-tight text-sm sm:text-base font-black',
                      onClick: () => {
                        triggerHaptic('light');
                        setFocusedHub('all');
                        onChangeSection('youtube');
                      },
                    },
                  ].map((tile) => (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={tile.onClick}
                      className="group h-[74px] sm:h-[82px] px-3 rounded-2xl bg-[#121218]/95 hover:bg-[#191922] nc-specular-surface nc-card-sheen border border-white/[0.08] hover:border-[#9146FF]/50 flex flex-col items-center justify-center gap-1 text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 active:scale-[0.98]"
                    >
                      <span className={`font-display leading-none ${tile.markClass}`}>
                        {tile.mark}
                      </span>
                      <span className="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-200 truncate max-w-full transition-colors">
                        {tile.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* ============================================================ */}
              {/* 4. EN DIRECTO AHORA · TV, MOVISTAR+ Y DAZN (EPG EN VIVO)     */}
              {/* ============================================================ */}
              {homeFeaturedLiveChannels.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
                        {pickLang(lang, { es: 'En Directo Ahora', ca: 'En Directe Ara', en: 'Live TV Right Now' })}
                      </h3>
                      {epgMadridClock && (
                        <span className="text-xs font-mono tabular-nums text-zinc-500 hidden sm:inline">
                          · {epgMadridClock} ES
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setFocusedHub('all');
                        setTdtCategory('all');
                        onChangeSection('tdt');
                      }}
                      className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-0.5 shrink-0 cursor-pointer transition-colors"
                    >
                      <span>{pickLang(lang, { es: 'Ver guía completa', ca: 'Veure guia completa', en: 'Full TV Guide' })}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1 min-w-0">
                    {homeFeaturedLiveChannels.map((ch) => {
                      const chEpg = getChannelLiveEpg(ch.id);
                      const isPlayingThis = ch.channels.some(
                        (sig) => activeVideoRawUrl && activeVideoRawUrl === sig.sourceUrl
                      );

                      return (
                        <button
                          key={`hlive-${ch.id}`}
                          type="button"
                          disabled={Boolean(loadingItemId)}
                          onClick={() => {
                            triggerHaptic('success');
                            onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                          }}
                          className={`group w-[236px] sm:w-[264px] shrink-0 p-3.5 rounded-2xl bg-[#0B0C12] hover:bg-[#131521] border text-left flex flex-col justify-between gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                            isPlayingThis
                              ? 'border-white/55 ring-1 ring-white/25'
                              : 'border-white/[0.08] hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border border-white/15 font-display font-extrabold text-[11px] text-white"
                                style={{
                                  background: `linear-gradient(145deg, ${ch.brandTone}30 0%, #08090F 100%)`,
                                }}
                              >
                                {ch.shortMark}
                              </div>
                              <div className="min-w-0">
                                <div className="font-display font-bold text-xs sm:text-sm text-white truncate">
                                  {ch.name}
                                </div>
                                <div className="text-[11px] text-zinc-400 truncate tabular-nums">
                                  {chEpg?.now
                                    ? `${chEpg.now.startLabel} – ${chEpg.now.stopLabel}`
                                    : `Dial ${ch.dial} · ${ch.network}`}
                                  {ch.healthSummary?.bestLatencyMs && ch.healthSummary.bestStatus !== 'down'
                                    ? ` · ${ch.healthSummary.bestLatencyMs}ms`
                                    : ''}
                                </div>
                              </div>
                            </div>

                            <span className="w-8 h-8 rounded-full bg-white text-[#050507] flex items-center justify-center shrink-0 shadow-sm">
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-xs font-semibold text-zinc-100 line-clamp-1">
                              {chEpg?.now ? chEpg.now.title : ch.description}
                            </div>
                            <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                              <div
                                className="h-full w-full bg-white/90 rounded-full origin-left"
                                style={{
                                  transform: `scaleX(${
                                    chEpg?.now
                                      ? Math.max(0.06, Math.min(1, chEpg.progressPct / 100))
                                      : 0.35
                                  })`,
                                }}
                              />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ============================================================ */}
              {/* 5. TOP 10 PELÍCULAS HOY (CLEAN POSTER ARTWORK)               */}
              {/* ============================================================ */}
              {homeShowcaseMovies.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
                      {pickLang(lang, { es: 'Top 10 Películas Hoy', ca: 'Top 10 Pel·lícules Avui', en: 'Top 10 Movies Today' })}
                    </h3>
                    <button
                      type="button"
                      onClick={enterGeneralMovies}
                      className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-0.5 shrink-0 cursor-pointer transition-colors"
                    >
                      <span>{pickLang(lang, { es: 'Ver todas', ca: 'Veure totes', en: 'See all' })}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
                    {homeShowcaseMovies.slice(0, 10).map((movie, idx) => (
                      <button
                        key={`htop-${movie.id}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setPreviewItem(movie);
                        }}
                        aria-label={`#${idx + 1} ${movie.title}`}
                        className="group relative w-[148px] sm:w-[168px] shrink-0 aspect-[2/3] rounded-2xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] hover:border-white/25 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 text-left focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      >
                        <PosterImage
                          src={movie.poster}
                          alt={movie.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={movie.title}
                          fallbackIcon={<Film className="w-7 h-7 text-zinc-500" />}
                        />

                        <span className="absolute top-2 left-2.5 font-display font-black text-2xl sm:text-3xl text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] tabular-nums select-none z-[2]">
                          {idx + 1}
                        </span>

                        <div className="absolute inset-x-0 bottom-0 pt-14 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/65 to-transparent z-[2]">
                          <span className="block font-display font-bold text-xs sm:text-[13px] text-white line-clamp-1">
                            {movie.title}
                          </span>
                          <span className="block text-[11px] text-zinc-300 mt-0.5 tabular-nums">
                            {movie.year || 'HD'}
                            {movie.rating ? ` · ★ ${movie.rating}` : ''}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* ============================================================ */}
              {/* 6. SERIES IMPRESCINDIBLES (16:9 PANORAMIC APPLE TV CARDS)    */}
              {/* ============================================================ */}
              {homeShowcaseSeries.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
                      {pickLang(lang, { es: 'Series Imprescindibles', ca: 'Sèries Imprescindibles', en: 'Essential Series' })}
                    </h3>
                    <button
                      type="button"
                      onClick={enterGeneralSeries}
                      className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-0.5 shrink-0 cursor-pointer transition-colors"
                    >
                      <span>{pickLang(lang, { es: 'Ver todas', ca: 'Veure totes', en: 'See all' })}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
                    {homeShowcaseSeries.slice(0, 10).map((show) => {
                      const art = show.backdrop || show.poster;
                      return (
                        <button
                          key={`hser-${show.id}`}
                          type="button"
                          onClick={() => {
                            if (!show.tmdbId) return;
                            triggerHaptic('light');
                            openSeriesDetails(show.tmdbId, 1, { ...show, mediaType: 'tv' });
                          }}
                          aria-label={`${show.title} · ${pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}`}
                          className="group relative w-[238px] sm:w-[276px] shrink-0 aspect-[16/9] rounded-2xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] hover:border-white/25 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 text-left focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                        >
                          <PosterImage
                            src={art}
                            alt={show.title}
                            aspect="video"
                            imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                            fallbackTitle={show.title}
                            fallbackIcon={<Tv className="w-7 h-7 text-zinc-500" />}
                          />

                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-[1]" />

                          <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2 z-[2]">
                            <div className="min-w-0">
                              <span className="block font-display font-bold text-xs sm:text-sm text-white line-clamp-1">
                                {show.title}
                              </span>
                              <span className="block text-[11px] text-zinc-300 mt-0.5 tabular-nums">
                                {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })} · {show.year || 'TV'}
                                {show.rating ? ` · ★ ${show.rating}` : ''}
                              </span>
                            </div>
                            <span className="w-8 h-8 rounded-full bg-white/95 text-[#050507] flex items-center justify-center shrink-0 opacity-90 group-hover:opacity-100 transition-opacity shadow-md">
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Expanded Discovery: 24/7 FAST Channels, 6 Editorial Collections & 14-Genre Explorer */}
              <ExpandedDiscoverySection
                lang={lang}
                onSelectItem={(item) => setPreviewItem(item)}
                onPlayFastChannel={(ch) => {
                  if (ch.mode === 'youtube' && ch.youtubeId) {
                    onPlayYouTubeVideo({
                      id: ch.id,
                      videoId: ch.youtubeId,
                      title: ch.name,
                      channel: ch.quality,
                      duration: 'LIVE',
                      views: '24/7',
                      thumbnail: `https://i.ytimg.com/vi/${ch.youtubeId}/hqdefault.jpg`,
                      url: ch.streamUrl,
                    });
                  } else {
                    onPlayCustomUrl(ch.streamUrl);
                  }
                }}
                onAddToQueue={onAddToQueue}
                isBookmarked={isBookmarked}
                onToggleBookmark={(item) => onToggleCatalogFavorite(item)}
              />

              {/* Últimos Estrenos en Cine y Nuevas Temporadas */}
              <LatestReleasesSection
                lang={lang}
                onSelectMovie={(movie) => setPreviewItem(movie)}
                onSelectSeries={(series, seasonNum) => {
                  if (series.tmdbId) {
                    openSeriesDetails(series.tmdbId, seasonNum, { ...series, mediaType: 'tv' });
                  } else {
                    setPreviewItem({ ...series, mediaType: 'tv', seasonNumber: seasonNum });
                  }
                }}
              />
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* UNIFIED COMPACT SUB-VIEW BAR + ON-DEMAND SEARCH & FILTER DRAWER    */}
      {/* Replaces stacked navigation, language, platform & category rows    */}
      {/* ================================================================== */}
      {activeSection !== 'home' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.07]">
            {/* Left: Compact back button (when deep in a hub) + single concise mode switch */}
            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
              {(focusedHub !== 'all' || streamingProvider !== 'all' || activeSection === 'direct') && (
                <button
                  type="button"
                  onClick={goToHomeGrid}
                  aria-label={pickLang(lang, { es: 'Volver al inicio', ca: 'Tornar a l’inici', en: 'Back to home' })}
                  className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              {/* CATALOG MODE SWITCH: Películas | Series | Castellano */}
              {(activeSection === 'movies' ||
                activeSection === 'vose' ||
                activeSection === 'series' ||
                activeSection === 'castellano') &&
                !isMovistarContext &&
                !showWatchlistOnly && (
                  <div className="flex items-center p-0.5 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setShowWatchlistOnly(false);
                        setMoviePage(1);
                        onChangeSection('movies');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        activeSection === 'movies' || activeSection === 'vose'
                          ? 'bg-white text-[#050508]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setShowWatchlistOnly(false);
                        setSeriesPage(1);
                        onChangeSection('series');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        activeSection === 'series'
                          ? 'bg-white text-[#050508]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' })}
                    </button>
                    {focusedHub === 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setShowWatchlistOnly(false);
                          setCastellanoPage(1);
                          onChangeSection('castellano');
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          activeSection === 'castellano'
                            ? 'bg-amber-400 text-[#140E02]'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {pickLang(lang, { es: 'Castellano', ca: 'Castellà', en: 'ES Dub' })}
                      </button>
                    )}
                  </div>
                )}

              {/* ANIME PILLAR SWITCH: Anime | Català */}
              {(activeSection === 'anime' || activeSection === 'catala') && (
                <div className="flex items-center p-0.5 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onChangeSection('anime');
                    }}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeSection === 'anime'
                        ? 'bg-[#F47521] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Anime
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onChangeSection('catala');
                    }}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeSection === 'catala'
                        ? 'bg-[#E11D48] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Català · SX3
                  </button>
                </div>
              )}

              {/* MOVISTAR+ UNIFIED 3-WAY SWITCH: Vivo | Películas | Series */}
              {isMovistarContext && !showWatchlistOnly && activeSection !== 'anime' && (
                <div className="flex items-center p-0.5 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    onClick={() => enterMovistarHub('live')}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeSection === 'tdt' && tdtCategory === 'movistar'
                        ? 'bg-[#019DF4] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pickLang(lang, { es: 'Vivo', ca: 'Directe', en: 'Live' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => enterMovistarHub('movies')}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeSection === 'movies' || activeSection === 'vose'
                        ? 'bg-white text-[#050508]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => enterMovistarHub('series')}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeSection === 'series'
                        ? 'bg-white text-[#050508]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' })}
                  </button>
                </div>
              )}

              {/* LIVE PILLAR SWITCH: TV | Fútbol | YouTube */}
              {(activeSection === 'tdt' || activeSection === 'sports' || activeSection === 'youtube') &&
                focusedHub === 'all' && (
                  <div className="flex items-center p-0.5 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onChangeSection('tdt');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        activeSection === 'tdt'
                          ? 'bg-white text-[#050508]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      TV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSportFilter('soccer');
                        onChangeSection('sports');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        activeSection === 'sports'
                          ? 'bg-[#FFBD0F] text-[#11131A]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onChangeSection('youtube');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        activeSection === 'youtube'
                          ? 'bg-[#E11D48] text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      YouTube
                    </button>
                  </div>
                )}

              {/* Focused Hub Brand Title when inside TDT España / DAZN / Sports sub-hub */}
              {(activeSection === 'tdt' || activeSection === 'sports') &&
                focusedHub !== 'all' &&
                !isMovistarContext && (
                  <span className="font-display font-bold text-sm text-white truncate px-1">
                    {activeSection === 'tdt' && tdtCategory === 'dazn'
                      ? 'DAZN Live'
                      : activeSection === 'tdt' && tdtCategory === 'uk_sports'
                      ? 'UK Sports'
                      : activeSection === 'tdt'
                      ? pickLang(lang, { es: 'TDT España', ca: 'TDT Espanya', en: 'Spain TDT' })
                      : pickLang(lang, { es: 'Deportes en Vivo', ca: 'Esports en Directe', en: 'Live Sports' })}
                  </span>
                )}

              {/* MY LIST PILLAR SWITCH: Mi Lista | Cola */}
              {(showWatchlistOnly || activeSection === 'direct') && (
                <div className="flex items-center p-0.5 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setShowWatchlistOnly(true);
                      onChangeSection('movies');
                    }}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      showWatchlistOnly && activeSection !== 'direct'
                        ? 'bg-white text-[#050508]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {t.pillarMyList} ({cleanWatchlist.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setShowWatchlistOnly(false);
                      onChangeSection('direct');
                    }}
                    className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeSection === 'direct'
                        ? 'bg-[#9146FF] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pickLang(lang, { es: 'Cola y URL', ca: 'Cua i URL', en: 'Queue & URL' })} ({roomQueue.length})
                  </button>
                </div>
              )}
            </div>

            {/* Right: Compact Search Toggle + Collapsible Filters Drawer Toggle */}
            {activeSection !== 'direct' && !showWatchlistOnly && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowSectionSearch((prev) => {
                      const next = !prev;
                      if (next) {
                        setTimeout(() => sectionSearchInputRef.current?.focus(), 40);
                      }
                      return next;
                    });
                  }}
                  aria-expanded={isSectionSearchVisible}
                  aria-label={pickLang(lang, { es: 'Buscar en esta sección', ca: 'Cercar en aquesta secció', en: 'Search this section' })}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    isSectionSearchVisible
                      ? 'bg-[#9146FF]/20 border-[#9146FF]/60 text-white'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300'
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowSectionFilters((v) => !v);
                  }}
                  aria-expanded={showSectionFilters}
                  className={`h-9 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    showSectionFilters || activeSectionFilterCount > 0
                      ? 'bg-white text-[#050508] border-white'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-zinc-200'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
                  {activeSectionFilterCount > 0 && (
                    <span
                      className={`h-4 min-w-[16px] px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums ${
                        showSectionFilters || activeSectionFilterCount > 0
                          ? 'bg-[#772CE8] text-white'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      {activeSectionFilterCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Expandable Slim Search Input (only shown when toggled or query non-empty) */}
          {activeSection !== 'direct' && !showWatchlistOnly && isSectionSearchVisible && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={sectionSearchInputRef}
                type="text"
                value={activeSectionQuery}
                onChange={(e) => setActiveSectionQuery(e.target.value)}
                placeholder={
                  activeSection === 'movies' || activeSection === 'vose'
                    ? streamingProvider !== 'all'
                      ? pickLang(lang, {
                          es: `Buscar película en ${activePlatformMeta.es}...`,
                          ca: `Cerca pel·lícula a ${activePlatformMeta.ca}...`,
                          en: `Search ${activePlatformMeta.en} movies...`,
                        })
                      : activeSection === 'vose'
                      ? t.searchVoPlaceholder
                      : t.searchMoviesPlaceholder
                    : activeSection === 'series'
                    ? streamingProvider !== 'all'
                      ? pickLang(lang, {
                          es: `Buscar serie en ${activePlatformMeta.es}...`,
                          ca: `Cerca sèrie a ${activePlatformMeta.ca}...`,
                          en: `Search ${activePlatformMeta.en} series...`,
                        })
                      : t.searchSeriesPlaceholder
                    : activeSection === 'anime'
                    ? pickLang(lang, { es: 'Buscar anime...', ca: 'Cercar anime...', en: 'Search anime...' })
                    : activeSection === 'catala'
                    ? pickLang(lang, { es: 'Buscar anime en catalán...', ca: 'Cercar anime en català...', en: 'Search Catalan anime...' })
                    : activeSection === 'castellano'
                    ? pickLang(lang, { es: 'Buscar en Castellano...', ca: 'Cercar en Castellà...', en: 'Search in Spanish...' })
                    : activeSection === 'tdt'
                    ? pickLang(lang, { es: 'Buscar canal o programa EPG...', ca: 'Cercar canal o programa EPG...', en: 'Search TV channel or EPG...' })
                    : activeSection === 'sports'
                    ? t.searchSportsPlaceholder
                    : pickLang(lang, { es: 'Buscar en YouTube o pegar enlace...', ca: 'Cercar a YouTube o enganxar enllaç...', en: 'Search YouTube or paste link...' })
                }
                className="w-full h-9 pl-9 pr-9 rounded-full bg-white/[0.06] focus:bg-white/[0.09] border border-white/[0.12] focus:border-[#9146FF]/70 text-sm text-white placeholder:text-zinc-400 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => {
                  if (activeSectionQuery) {
                    setActiveSectionQuery('');
                  } else {
                    setShowSectionSearch(false);
                  }
                }}
                aria-label={pickLang(lang, { es: 'Cerrar o limpiar búsqueda', ca: 'Tancar o netejar cerca', en: 'Close or clear search' })}
                className="w-7 h-7 rounded-full absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Collapsible Section Filters Drawer (Keeps Screen Spacious Until Needed) */}
          {showSectionFilters && activeSection !== 'direct' && !showWatchlistOnly && (
            <div className="rounded-2xl bg-[#0D0E15]/95 border border-white/[0.1] p-3 space-y-3 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {pickLang(lang, { es: 'Filtros rápidos', ca: 'Filtres ràpids', en: 'Quick Filters' })}
                </span>
                <button
                  type="button"
                  onClick={() => setShowSectionFilters(false)}
                  className="h-7 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[11px] font-bold text-white cursor-pointer transition-colors"
                >
                  {pickLang(lang, { es: 'Listo', ca: 'Fet', en: 'Done' })}
                </button>
              </div>

              {/* MOVIES / VOSE FILTERS */}
              {(activeSection === 'movies' || activeSection === 'vose') && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-zinc-400 mr-1">
                      {pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Audio:' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMoviePage(1);
                        onChangeSection('movies');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        activeSection === 'movies'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Español', ca: 'Castellà', en: 'Spanish' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMoviePage(1);
                        onChangeSection('vose');
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        activeSection === 'vose'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'VO · Inglés', ca: 'VO · Anglès', en: 'VO · English' })}
                    </button>
                  </div>

                  {focusedHub === 'all' && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {STREAMING_PLATFORMS.map((plat) => {
                        const isSelected = streamingProvider === plat.id;
                        return (
                          <button
                            key={plat.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setStreamingProvider(plat.id);
                              setMoviePage(1);
                              if (plat.id === 'all' && movieCategory === 'originals') {
                                setMovieCategory('trending');
                              }
                            }}
                            className={`h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                              isSelected
                                ? plat.activeBorder
                                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300'
                            }`}
                          >
                            {plat.id !== 'all' && (
                              <span
                                className={`h-4 px-1 rounded text-[9px] font-black flex items-center justify-center shrink-0 ${plat.accentBg} ${plat.accentText}`}
                              >
                                {plat.mark}
                              </span>
                            )}
                            <span>{pickLang(lang, plat)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!debouncedMovieQuery && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {MOVIE_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setMovieCategory(cat.id);
                            setMoviePage(1);
                          }}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            movieCategory === cat.id
                              ? 'bg-white text-[#050508] font-bold'
                              : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, cat)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SERIES FILTERS */}
              {activeSection === 'series' && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-zinc-400 mr-1">
                      {pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Audio:' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSeriesLangMode('ES');
                        setSeriesPage(1);
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        seriesLangMode !== 'EN' && seriesLangMode !== 'VOSE'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Español', ca: 'Castellà', en: 'Spanish' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSeriesLangMode('EN');
                        setSeriesPage(1);
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        seriesLangMode === 'EN' || seriesLangMode === 'VOSE'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'VO · Inglés', ca: 'VO · Anglès', en: 'VO · English' })}
                    </button>
                  </div>

                  {focusedHub === 'all' && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {STREAMING_PLATFORMS.map((plat) => {
                        const isSelected = streamingProvider === plat.id;
                        return (
                          <button
                            key={plat.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setStreamingProvider(plat.id);
                              setSeriesPage(1);
                              if (plat.id === 'all' && seriesCategory === 'originals') {
                                setSeriesCategory('trending');
                              }
                            }}
                            className={`h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                              isSelected
                                ? plat.activeBorder
                                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300'
                            }`}
                          >
                            {plat.id !== 'all' && (
                              <span
                                className={`h-4 px-1 rounded text-[9px] font-black flex items-center justify-center shrink-0 ${plat.accentBg} ${plat.accentText}`}
                              >
                                {plat.mark}
                              </span>
                            )}
                            <span>{pickLang(lang, plat)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!debouncedSeriesQuery && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {streamingProvider !== 'all' && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setSeriesCategory('originals');
                            setSeriesPage(1);
                          }}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            seriesCategory === 'originals'
                              ? 'bg-white text-[#050508] font-bold'
                              : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-200 border border-white/[0.1]'
                          }`}
                        >
                          {pickLang(lang, {
                            es: `Originales ${activePlatformMeta.es}`,
                            ca: `Originals ${activePlatformMeta.ca}`,
                            en: `${activePlatformMeta.en} Originals`,
                          })}
                        </button>
                      )}
                      {SERIES_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setSeriesCategory(cat.id);
                            setSeriesPage(1);
                          }}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            seriesCategory === cat.id
                              ? 'bg-white text-[#050508] font-bold'
                              : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, cat)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CASTELLANO FILTERS */}
              {activeSection === 'castellano' && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        { id: 'all', es: 'Todo', ca: 'Tot', en: 'All' },
                        { id: 'series', es: 'Series', ca: 'Sèries', en: 'Series' },
                        { id: 'movies', es: 'Películas', ca: 'Pel·lícules', en: 'Movies' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setCastellanoKind(tab.id);
                          setCastellanoPage(1);
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          castellanoKind === tab.id
                            ? 'bg-amber-400 text-[#140E02]'
                            : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                        }`}
                      >
                        {pickLang(lang, tab)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {STREAMING_PLATFORMS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setCastellanoProvider(p.id);
                          setCastellanoPage(1);
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                          castellanoProvider === p.id
                            ? 'bg-white text-[#050508] border-white'
                            : 'bg-white/[0.04] text-zinc-300 border-white/[0.08] hover:text-white'
                        }`}
                      >
                        {pickLang(lang, p)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {(
                      [
                        { id: 'trending', es: 'Destacados', ca: 'Destacats', en: 'Featured' },
                        { id: 'spanish_originals', es: 'Producción Española', ca: 'Producció Espanyola', en: 'Spanish Originals' },
                        { id: 'top_rated', es: 'Mejor Valorados', ca: 'Més Ben Valorats', en: 'Top Rated' },
                        { id: 'thriller', es: 'Suspense', ca: 'Suspens', en: 'Thriller' },
                        { id: 'action', es: 'Acción', ca: 'Acció', en: 'Action' },
                        { id: 'scifi', es: 'Ciencia Ficción', ca: 'Ciència-ficció', en: 'Sci-Fi' },
                        { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
                        { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setCastellanoCategory(cat.id);
                          setCastellanoPage(1);
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                          castellanoCategory === cat.id
                            ? 'bg-amber-400 text-[#140E02] border-amber-400 font-bold'
                            : 'bg-white/[0.04] text-zinc-300 border-white/[0.08]'
                        }`}
                      >
                        {pickLang(lang, cat)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ANIME FILTERS */}
              {activeSection === 'anime' && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setAnimeMediaKind('series');
                        setAnimePage(1);
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        animeMediaKind === 'series'
                          ? 'bg-white text-[#050508]'
                          : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Series Anime', ca: 'Sèries Anime', en: 'Anime Series' })}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setAnimeMediaKind('movies');
                        setAnimePage(1);
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        animeMediaKind === 'movies'
                          ? 'bg-white text-[#050508]'
                          : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pickLang(lang, { es: 'Películas Anime', ca: 'Pel·lícules Anime', en: 'Anime Movies' })}
                    </button>

                    {activeAnimePortalMeta.externalUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('medium');
                          onOpenCloudBrowser(activeAnimePortalMeta.externalUrl!);
                        }}
                        className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Tv className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>{`Web ${activeAnimePortalMeta.es}`}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        { code: 'ES', es: 'Español · Lat', ca: 'Espanyol · Lat', en: 'Spanish Dub' },
                        { code: 'VOSE', es: 'VOSE · Sub', ca: 'VOSE · Sub', en: 'Sub ES (VOSE)' },
                        { code: 'EN', es: 'Inglés', ca: 'Anglès', en: 'English' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setAnimeLangPref(opt.code);
                          setSeriesLangMode(opt.code);
                          setAnimePage(1);
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          animeLangPref === opt.code
                            ? 'bg-[#F47521] text-white'
                            : 'bg-white/[0.05] text-zinc-300 hover:text-white'
                        }`}
                      >
                        {pickLang(lang, opt)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {ANIME_PLATFORMS.map((portal) => (
                      <button
                        key={portal.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setAnimePortal(portal.id);
                          setAnimePage(1);
                          if (portal.id === 'jkanime' && animeCategory === 'trending') {
                            setAnimeCategory('simulcast');
                          }
                        }}
                        className={`h-8 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          animePortal === portal.id
                            ? portal.activeBorder
                            : 'bg-white/[0.04] border-white/[0.08] text-zinc-300'
                        }`}
                      >
                        <span className={`h-4 px-1 rounded text-[9px] font-black flex items-center justify-center ${portal.accentBg} ${portal.accentText}`}>
                          {portal.mark}
                        </span>
                        <span>{pickLang(lang, portal)}</span>
                      </button>
                    ))}
                  </div>

                  {!debouncedAnimeQuery && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {ANIME_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setAnimeCategory(cat.id);
                            setAnimePage(1);
                          }}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            animeCategory === cat.id
                              ? 'bg-[#F47521] text-white font-bold'
                              : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, cat)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CATALÀ FILTERS */}
              {activeSection === 'catala' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: 'all', es: 'Todo', ca: 'Tot', en: 'All' },
                      { id: 'classics', es: 'Clásicos TV3 · K3', ca: 'Clàssics TV3 · K3', en: 'TV3 · K3 Classics' },
                      { id: 'shonen', es: 'Shonen y Acción', ca: 'Shonen i Acció', en: 'Shonen & Action' },
                      { id: 'movies', es: 'Películas', ca: 'Pel·lícules', en: 'Movies' },
                      { id: 'live_tv', es: 'TV Directo · SX3', ca: 'TV Directe · SX3', en: 'Live TV · SX3' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCatalaCategory(tab.id);
                      }}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                        catalaCategory === tab.id
                          ? 'bg-[#E11D48] text-white border-[#E11D48]'
                          : 'bg-white/[0.04] text-zinc-300 border-white/[0.08]'
                      }`}
                    >
                      {pickLang(lang, tab)}
                    </button>
                  ))}
                </div>
              )}

              {/* TDT / LIVE TV FILTERS */}
              {activeSection === 'tdt' && (
                <div className="space-y-2.5">
                  {(focusedHub === 'tdt_es' || focusedHub === 'all') && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {(focusedHub === 'tdt_es' ? TDT_NATIONAL_CATEGORIES : ALL_LIVE_CATEGORIES).map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setTdtCategory(cat.id);
                          }}
                          className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            tdtCategory === cat.id
                              ? 'bg-white text-[#050508]'
                              : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, cat)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {(
                        [
                          { id: 'all', es: 'Toda la emisión', ca: 'Tota l’emissió', en: 'All Airing' },
                          { id: 'sports_now', es: 'Deporte ahora', ca: 'Esport ara', en: 'Sports Now' },
                          { id: 'cinema_now', es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Cinema Now' },
                        ] as const
                      ).map((flt) => (
                        <button
                          key={flt.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setEpgFilter(flt.id);
                          }}
                          className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            epgFilter === flt.id
                              ? 'bg-white text-[#050507]'
                              : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, flt)}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        fetchTdtCatalog();
                        fetchLiveEpg(true);
                      }}
                      className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingTdt || loadingEpg ? 'animate-spin' : ''}`} />
                      <span>{pickLang(lang, { es: 'Actualizar EPG', ca: 'Actualitzar EPG', en: 'Refresh EPG' })}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SPORTS FILTERS */}
              {activeSection === 'sports' && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {(
                      [
                        { id: 'soccer', label: pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' }) },
                        { id: 'basketball', label: t.basketball },
                        { id: 'tennis', label: t.tennis },
                        { id: 'motor', label: t.motor },
                        { id: 'all', label: t.allSports },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSportFilter(cat.id);
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          sportFilter === cat.id
                            ? cat.id === 'soccer'
                              ? 'bg-[#FFBD0F] text-[#11131A]'
                              : 'bg-white text-[#050508]'
                            : 'bg-white/[0.05] text-zinc-200 border border-white/[0.08]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      fetchSportsAgenda();
                    }}
                    className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSports ? 'animate-spin' : ''}`} />
                    <span>{pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Refresh' })}</span>
                  </button>
                </div>
              )}

              {/* YOUTUBE QUICK TOPICS */}
              {activeSection === 'youtube' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {YOUTUBE_QUICK_TOPICS.map((topic) => {
                    const topicLabel = pickLang(lang, {
                      es: topic.labelEs,
                      ca: topic.labelCa,
                      en: topic.labelEn,
                    });
                    return (
                      <button
                        key={topic.q}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setYtQuery(topicLabel);
                          setDebouncedYtQuery(topic.q);
                        }}
                        className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          debouncedYtQuery === topic.q
                            ? 'bg-white text-[#050508]'
                            : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
                        }`}
                      >
                        {topicLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 1 & 2: MOVIES + UNIFIED MI LISTA HUB                       */}
      {/* ================================================================== */}
      {(activeSection === 'movies' || activeSection === 'vose') && (
        <div className="space-y-4">
          {showWatchlistOnly && (
            <div className="space-y-4">
              {favoriteChannels.length > 0 && (
                <section className="rounded-3xl bg-white/[0.02] border border-white/[0.07] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Star className="w-4 h-4 text-amber-400 fill-current shrink-0" />
                      <h3 className="font-display font-bold text-sm text-white truncate">
                        {pickLang(lang, {
                          es: `Canales Favoritos (${favoriteChannels.length})`,
                          ca: `Canals Favorits (${favoriteChannels.length})`,
                          en: `Favorite Channels (${favoriteChannels.length})`,
                        })}
                      </h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {favoriteChannels.map((fCh) => {
                      const isPlayingFav = activeVideoRawUrl === fCh.channelUrl;
                      return (
                        <div
                          key={fCh.favId}
                          className={`flex items-center rounded-xl border shrink-0 transition-colors ${
                            isPlayingFav
                              ? 'bg-white text-[#050508] border-white'
                              : 'bg-[#0E0F16] border-white/[0.1] text-zinc-100 hover:border-white/25'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('medium');
                              onPlayFavoriteChannel(fCh);
                            }}
                            className="min-h-[40px] pl-3 pr-2.5 flex items-center gap-2 text-xs font-semibold whitespace-nowrap cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current text-[#E11D48]" />
                            <span>{fCh.channelLabel}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onToggleChannelFavorite(fCh);
                            }}
                            aria-label={pickLang(lang, {
                              es: `Quitar ${fCh.channelLabel} de favoritos`,
                              ca: `Treure ${fCh.channelLabel} dels favorits`,
                              en: `Remove ${fCh.channelLabel} from favorites`,
                            })}
                            className="w-9 h-9 flex items-center justify-center border-l border-white/[0.08] text-amber-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {renderContinueWatchingStrip()}
            </div>
          )}

          {/* Editorial Spotlight Feature Card */}
          {spotlightMovie && (
            <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0D0D12] min-h-[210px] sm:min-h-[265px] flex flex-col justify-end p-5 sm:p-8 shadow-2xl">
              {!spotlightImgFailed && (spotlightMovie.backdrop || spotlightMovie.poster) ? (
                <img
                  src={spotlightMovie.backdrop || spotlightMovie.poster}
                  alt={spotlightMovie.title}
                  referrerPolicy="no-referrer"
                  onError={() => setSpotlightImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1C0B12] via-[#0D0D12] to-[#050507]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/90 via-[#050507]/45 to-transparent" />

              <div className="relative z-10 max-w-xl space-y-2.5">
                <div className="text-xs text-zinc-300 font-medium">
                  <span className="text-[#FB7185] font-semibold">
                    {streamingProvider !== 'all'
                      ? `${pickLang(lang, activePlatformMeta)} · ${
                          activeSection === 'vose'
                            ? pickLang(lang, { es: 'VO Inglés', ca: 'VO Anglès', en: 'English VO' })
                            : pickLang(lang, { es: 'Película Destacada', ca: 'Pel·lícula Destacada', en: 'Featured Movie' })
                        }`
                      : activeSection === 'vose'
                      ? pickLang(lang, { es: 'VO · Inglés 1080p', ca: 'VO · Anglès 1080p', en: 'English VO · 1080p' })
                      : pickLang(lang, { es: 'Película Destacada', ca: 'Pel·lícula Destacada', en: 'Featured Movie' })}
                  </span>
                  <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                    ·
                  </span>
                  <span>{spotlightMovie.year || 'HD'}</span>
                  {spotlightMovie.rating && (
                    <>
                      <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-amber-400">
                        ★ {spotlightMovie.rating}
                      </span>
                    </>
                  )}
                </div>

                <h3 className="font-display font-bold text-xl sm:text-3xl text-white leading-tight text-balance">
                  {spotlightMovie.title}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-[54ch]">
                  {spotlightMovie.overview}
                </p>

                <div className="pt-1.5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={Boolean(loadingItemId)}
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayMovie(spotlightMovie, activeSection === 'vose' ? 'EN' : 'ES');
                    }}
                    className="min-h-[44px] px-5 rounded-full bg-white hover:bg-zinc-200 text-xs sm:text-sm font-bold text-[#050507] flex items-center gap-2 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {loadingItemId === spotlightMovie.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                    <span>{pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPreviewItem(spotlightMovie);
                    }}
                    className="min-h-[44px] px-4 rounded-full liquid-glass-pill hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Info className="w-4 h-4 text-white" />
                    <span>{pickLang(lang, { es: 'Idioma y Ficha', ca: 'Idioma i Fitxa', en: 'Audio & Info' })}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleToggleBookmark(spotlightMovie, e)}
                    className="min-h-[44px] px-4 rounded-full liquid-glass-pill hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isBookmarked(spotlightMovie) ? 'fill-current text-white' : ''
                      }`}
                    />
                    <span>
                      {isBookmarked(spotlightMovie)
                        ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                        : t.pillarMyList}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Movie Poster Grid */}
          {loadingMovies ? (
            <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : gridMovies.length === 0 && !spotlightMovie ? (
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-3">
              <Film className="w-8 h-8 text-[#E11D48] mx-auto mb-1" />
              <p className="text-sm font-bold text-white">
                {showWatchlistOnly
                  ? pickLang(lang, {
                      es: 'Tu lista de guardados (películas, series, canales y partidos) está vacía',
                      ca: 'La teva llista (pel·lícules, sèries, canals i partits) és buida',
                      en: 'Your saved list (movies, series, live channels & matches) is empty',
                    })
                  : pickLang(lang, {
                      es: 'No encontramos películas con ese título',
                      ca: 'No hem trobat pel·lícules amb aquest títol',
                      en: 'No movies found matching your search',
                    })}
              </p>
              {!showWatchlistOnly && movieQuery.trim().length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    setSeriesQuery(movieQuery.trim());
                    onChangeSection('series');
                  }}
                  className="mt-2 min-h-[44px] px-5 rounded-2xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Tv className="w-4 h-4 text-[#E11D48]" />
                  <span>
                    {pickLang(lang, {
                      es: `Buscar «${movieQuery.trim()}» en Series`,
                      ca: `Cercar «${movieQuery.trim()}» a Sèries`,
                      en: `Search "${movieQuery.trim()}" in Series`,
                    })}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <VirtualizedPosterGrid
                items={gridMovies}
                variant="poster"
                getKey={(m) => getCatalogFavoriteKey(m)}
                renderItem={(movie) => {
                  const favKey = getCatalogFavoriteKey(movie);
                  const isExtractingThis = loadingItemId === movie.id || loadingItemId === favKey;
                  const saved = isBookmarked(movie);
                  const isNowInRoom =
                    Boolean(activeMediaTitle) &&
                    activeMediaTitle.trim().toLowerCase() === movie.title.trim().toLowerCase();
                  const historyEntry = watchHistory.find(
                    (h) =>
                      (movie.tmdbId && h.tmdbId === movie.tmdbId) ||
                      h.title.trim().toLowerCase() === movie.title.trim().toLowerCase()
                  );
                  const watchedPct =
                    historyEntry?.resumeTimeSec &&
                    historyEntry?.durationSec &&
                    historyEntry.durationSec > 60
                      ? Math.min(
                          100,
                          Math.max(
                            8,
                            Math.round((historyEntry.resumeTimeSec / historyEntry.durationSec) * 100)
                          )
                        )
                      : historyEntry?.resumeTimeSec && historyEntry.resumeTimeSec > 15
                      ? 30
                      : 0;

                  return (
                    <div
                      className={`group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border transition-colors shadow-[0_12px_30px_rgba(0,0,0,0.55)] ${
                        isNowInRoom
                          ? 'border-[#E11D48] ring-1 ring-[#E11D48]/50'
                          : 'border-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          if (movie.mediaType === 'tv' && movie.tmdbId) {
                            setShowWatchlistOnly(false);
                            openSeriesDetails(movie.tmdbId, 1, movie);
                            return;
                          }
                          setPreviewItem(movie);
                        }}
                        aria-label={`${movie.title} · ${pickLang(lang, { es: 'Ver ficha', ca: 'Veure fitxa', en: 'Open details' })}`}
                        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      />

                      <div className="absolute inset-0 z-[1] pointer-events-none">
                        <PosterImage
                          src={movie.poster}
                          alt={movie.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={movie.title}
                          fallbackIcon={<Film className="w-8 h-8 text-zinc-500" />}
                        />
                      </div>

                      {isNowInRoom ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-[#E11D48] text-white text-[10px] font-bold flex items-center gap-1 shadow-md pointer-events-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          <span>{pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'Playing' })}</span>
                        </div>
                      ) : watchedPct >= 90 ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-emerald-300 text-[10px] font-bold flex items-center gap-1 pointer-events-none">
                          <Check className="w-3 h-3" />
                          <span>{pickLang(lang, { es: 'Vista', ca: 'Vista', en: 'Watched' })}</span>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(movie, e)}
                        aria-label={pickLang(lang, {
                          es: `Guardar ${movie.title} en Mi Lista`,
                          ca: `Desar ${movie.title} a la Meva Llista`,
                          en: `Save ${movie.title} to My List`,
                        })}
                        className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center cursor-pointer transition-colors ${
                          saved
                            ? 'bg-black/75 border-[#E11D48]/50 text-[#E11D48]'
                            : 'bg-black/45 hover:bg-black/75 border-white/10 text-white/80 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`} />
                      </button>

                      {isExtractingThis && (
                        <div className="absolute inset-0 z-[3] bg-black/55 flex items-center justify-center pointer-events-none">
                          <div className="w-11 h-11 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-2xl">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 z-[2] pt-16 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex items-end justify-between gap-2 pointer-events-none">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
                            {movie.title}
                          </h3>
                          <div className="text-[11px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
                            <span>{movie.year || 'HD'}</span>
                            {movie.rating && (
                              <>
                                <span className="text-zinc-500">·</span>
                                <span className="text-amber-400 font-mono font-bold tabular-nums">
                                  ★ {movie.rating}
                                </span>
                              </>
                            )}
                            {movie.mediaType === 'tv' && (
                              <>
                                <span className="text-zinc-500">·</span>
                                <span className="text-indigo-300 font-semibold">
                                  {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('success');
                            if (movie.mediaType === 'tv' && movie.tmdbId) {
                              openSeriesDetails(movie.tmdbId, 1, movie);
                              return;
                            }
                            onPlayMovie(movie, activeSection === 'vose' ? 'EN' : 'ES');
                          }}
                          title={
                            movie.mediaType === 'tv'
                              ? pickLang(lang, { es: 'Elegir temporada y capítulo', ca: 'Triar temporada i capítol', en: 'Choose season & episode' })
                              : pickLang(lang, { es: 'Reproducir directamente en la sala', ca: 'Reproduir directament a la sala', en: 'Play directly in room' })
                          }
                          aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${movie.title}`}
                          className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white hover:bg-zinc-200 text-[#050507] flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </button>
                      </div>

                      {watchedPct > 0 && watchedPct < 90 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 pointer-events-none z-[2]">
                          <div
                            className="h-full bg-white"
                            style={{ width: `${watchedPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {!showWatchlistOnly && hasMoreMovies && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreMovies}
                    onClick={() => {
                      triggerHaptic('light');
                      setMoviePage((p) => p + 1);
                    }}
                    className="min-h-[46px] px-6 rounded-2xl bg-[#0E0F16] hover:bg-white/[0.08] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {loadingMoreMovies && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                    )}
                    <span>{pickLang(lang, { es: 'Cargar más películas', ca: 'Carregar més pel·lícules', en: 'Load more movies' })}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 3: TV SERIES CATALOG (GENERAL OR SPECIFIC PLATFORM)        */}
      {/* Clicking ANY series opens 1. Temporada -> 2. Capítulo in 0ms       */}
      {/* ================================================================== */}
      {activeSection === 'series' && (
        <div className="space-y-4">
          {/* Favorite Series Quick Rail (only when browsing All Series) */}
          {!debouncedSeriesQuery && streamingProvider === 'all' && favoriteSeriesList.length > 0 && (
            <section className="rounded-3xl bg-white/[0.02] border border-white/[0.07] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 fill-current text-[#E11D48] shrink-0" />
                <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                  {pickLang(lang, {
                    es: 'Mis Series Guardadas',
                    ca: 'Les Meves Sèries Desades',
                    en: 'My Saved Series',
                  })}{' '}
                  ({favoriteSeriesList.length})
                </h3>
              </div>
              <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-0.5 min-w-0">
                {favoriteSeriesList.map((favShow) => (
                  <div
                    key={favShow.id}
                    className="group relative w-[136px] sm:w-[152px] aspect-[2/3] shrink-0 rounded-2xl overflow-hidden bg-[#090A0F] border border-white/[0.08] hover:border-white/30 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!favShow.tmdbId) return;
                        triggerHaptic('light');
                        openSeriesDetails(favShow.tmdbId, 1, favShow);
                      }}
                      aria-label={favShow.title}
                      className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                    />
                    <div className="absolute inset-0 z-[1] pointer-events-none">
                      <PosterImage
                        src={favShow.poster}
                        alt={favShow.title}
                        aspect="poster"
                        fallbackTitle={favShow.title}
                        fallbackIcon={<Tv className="w-6 h-6 text-zinc-500" />}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleToggleBookmark(favShow, e)}
                      aria-label={pickLang(lang, {
                        es: `Quitar ${favShow.title} de favoritas`,
                        ca: `Treure ${favShow.title} de favorites`,
                        en: `Remove ${favShow.title} from saved`,
                      })}
                      className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/90 text-[#E11D48] flex items-center justify-center absolute top-2 right-2 z-10 cursor-pointer"
                    >
                      <Heart className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 z-[2] pt-10 pb-2.5 px-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none">
                      <div className="font-display font-bold text-xs text-white line-clamp-2 leading-tight">
                        {favShow.title}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Editorial Spotlight Feature Card for Series */}
          {spotlightSeries && (
            <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0D0D12] min-h-[210px] sm:min-h-[265px] flex flex-col justify-end p-5 sm:p-8 shadow-2xl">
              {!seriesSpotlightImgFailed &&
              (spotlightSeries.backdrop || spotlightSeries.poster) ? (
                <img
                  src={spotlightSeries.backdrop || spotlightSeries.poster}
                  alt={spotlightSeries.title}
                  referrerPolicy="no-referrer"
                  onError={() => setSeriesSpotlightImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1C0B12] via-[#0D0D12] to-[#050507]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/90 via-[#050507]/45 to-transparent" />

              <div className="relative z-10 max-w-xl space-y-2.5">
                <div className="text-xs text-zinc-300 font-medium">
                  <span className="text-[#FB7185] font-semibold">
                    {streamingProvider !== 'all'
                      ? `${pickLang(lang, activePlatformMeta)} · ${pickLang(lang, { es: 'Serie Destacada', ca: 'Sèrie Destacada', en: 'Featured Series' })}`
                      : pickLang(lang, { es: 'Serie Destacada', ca: 'Sèrie Destacada', en: 'Featured Series' })}
                  </span>
                  <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                    ·
                  </span>
                  <span>{spotlightSeries.year || 'TV'}</span>
                  {spotlightSeries.rating && (
                    <>
                      <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-amber-400">
                        ★ {spotlightSeries.rating}
                      </span>
                    </>
                  )}
                </div>

                <h3 className="font-display font-bold text-xl sm:text-3xl text-white leading-tight text-balance">
                  {spotlightSeries.title}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-[54ch]">
                  {spotlightSeries.overview}
                </p>

                <div className="pt-1.5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!spotlightSeries.tmdbId) return;
                      triggerHaptic('success');
                      openSeriesDetails(spotlightSeries.tmdbId, 1, {
                        ...spotlightSeries,
                        mediaType: 'tv',
                      });
                    }}
                    className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-lg shadow-[#E11D48]/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current text-white" />
                    <span>
                      {pickLang(lang, {
                        es: 'Ver Temporadas y Capítulos',
                        ca: 'Veure Temporades i Capítols',
                        en: 'Choose Season & Episode',
                      })}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPreviewItem({ ...spotlightSeries, mediaType: 'tv' });
                    }}
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Info className="w-4 h-4 text-white" />
                    <span>{pickLang(lang, { es: 'Tráiler y Reparto', ca: 'Tràiler i Repartiment', en: 'Trailer & Cast' })}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) =>
                      handleToggleBookmark({ ...spotlightSeries, mediaType: 'tv' }, e)
                    }
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isBookmarked({ ...spotlightSeries, mediaType: 'tv' })
                          ? 'fill-current text-[#E11D48]'
                          : ''
                      }`}
                    />
                    <span>
                      {isBookmarked({ ...spotlightSeries, mediaType: 'tv' })
                        ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                        : t.pillarMyList}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingSeries ? (
            <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : seriesList.length === 0 ? (
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-3">
              <Tv className="w-8 h-8 text-[#E11D48] mx-auto mb-1" />
              <p className="text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'No encontramos series con ese título',
                  ca: 'No hem trobat sèries amb aquest títol',
                  en: 'No TV series found matching your search',
                })}
              </p>
              {seriesQuery.trim().length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    setMovieQuery(seriesQuery.trim());
                    onChangeSection('movies');
                  }}
                  className="mt-2 min-h-[44px] px-5 rounded-2xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Film className="w-4 h-4 text-[#E11D48]" />
                  <span>
                    {pickLang(lang, {
                      es: `Buscar «${seriesQuery.trim()}» en Películas`,
                      ca: `Cercar «${seriesQuery.trim()}» a Pel·lícules`,
                      en: `Search "${seriesQuery.trim()}" in Movies`,
                    })}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <VirtualizedPosterGrid
                items={gridSeries}
                variant="poster"
                getKey={(s) => s.id}
                renderItem={(show) => {
                  const seriesItem: CatalogMovie = { ...show, mediaType: 'tv' };
                  const savedSeries = isBookmarked(seriesItem);
                  const isSeriesInRoom =
                    Boolean(activeMediaTitle) &&
                    activeMediaTitle.toLowerCase().includes(show.title.trim().toLowerCase());
                  const seriesHistory = watchHistory.find(
                    (h) =>
                      h.mediaType === 'tv' &&
                      ((show.tmdbId && h.tmdbId === show.tmdbId) ||
                        h.title.trim().toLowerCase() === show.title.trim().toLowerCase())
                  );
                  const seriesPct =
                    seriesHistory?.resumeTimeSec &&
                    seriesHistory?.durationSec &&
                    seriesHistory.durationSec > 60
                      ? Math.min(
                          100,
                          Math.max(
                            8,
                            Math.round(
                              (seriesHistory.resumeTimeSec / seriesHistory.durationSec) * 100
                            )
                          )
                        )
                      : seriesHistory
                      ? 30
                      : 0;

                  return (
                    <div
                      className={`group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border transition-colors shadow-[0_12px_30px_rgba(0,0,0,0.55)] ${
                        isSeriesInRoom
                          ? 'border-[#E11D48] ring-1 ring-[#E11D48]/50'
                          : 'border-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!show.tmdbId) return;
                          triggerHaptic('light');
                          openSeriesDetails(show.tmdbId, seriesHistory?.season || 1, seriesItem);
                        }}
                        aria-label={`${show.title} · ${pickLang(lang, { es: 'Ver capítulos', ca: 'Veure capítols', en: 'Browse episodes' })}`}
                        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      />

                      <div className="absolute inset-0 z-[1] pointer-events-none">
                        <PosterImage
                          src={show.poster}
                          alt={show.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={show.title}
                          fallbackIcon={<Tv className="w-8 h-8 text-zinc-500" />}
                        />
                      </div>

                      {isSeriesInRoom ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-[#E11D48] text-white text-[10px] font-bold flex items-center gap-1 shadow-md pointer-events-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          <span>{pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'Playing' })}</span>
                        </div>
                      ) : seriesHistory?.season && seriesHistory?.episode ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-zinc-100 text-[10px] font-mono font-bold tabular-nums pointer-events-none">
                          T{seriesHistory.season} · {pickLang(lang, { es: 'Cap.', ca: 'Cap.', en: 'Ep.' })} {seriesHistory.episode}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(seriesItem, e)}
                        aria-label={pickLang(lang, {
                          es: `Guardar serie ${show.title}`,
                          ca: `Desar sèrie ${show.title}`,
                          en: `Save series ${show.title}`,
                        })}
                        className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center cursor-pointer transition-colors ${
                          savedSeries
                            ? 'bg-black/75 border-[#E11D48]/50 text-[#E11D48]'
                            : 'bg-black/45 hover:bg-black/75 border-white/10 text-white/80 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${savedSeries ? 'fill-current' : ''}`} />
                      </button>

                      <div className="absolute inset-x-0 bottom-0 z-[2] pt-16 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex items-end justify-between gap-2 pointer-events-none">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
                            {show.title}
                          </h3>
                          <div className="text-[11px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
                            <span>{show.year || 'TV'}</span>
                            {show.rating && (
                              <>
                                <span className="text-zinc-500">·</span>
                                <span className="text-amber-400 font-mono font-bold tabular-nums">
                                  ★ {show.rating}
                                </span>
                              </>
                            )}
                            <span className="text-zinc-500">·</span>
                            <span className="text-[#FB7185] font-semibold">
                              {pickLang(lang, { es: 'Capítulos', ca: 'Capítols', en: 'Episodes' })}
                            </span>
                          </div>
                        </div>

                        {show.tmdbId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('light');
                              setPreviewItem(seriesItem);
                            }}
                            title={pickLang(lang, { es: 'Ver Tráiler y Ficha', ca: 'Veure Tràiler i Fitxa', en: 'Trailer & Info' })}
                            aria-label={`${pickLang(lang, { es: 'Ver ficha de', ca: 'Veure fitxa de', en: 'Info for' })} ${show.title}`}
                            className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {seriesPct > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 pointer-events-none z-[2]">
                          <div
                            className="h-full bg-[#E11D48]"
                            style={{ width: `${seriesPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {hasMoreSeries && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreSeries}
                    onClick={() => {
                      triggerHaptic('light');
                      setSeriesPage((p) => p + 1);
                    }}
                    className="min-h-[46px] px-6 rounded-2xl bg-[#0E0F16] hover:bg-white/[0.08] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {loadingMoreSeries && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                    )}
                    <span>{pickLang(lang, { es: 'Cargar más series', ca: 'Carregar més sèries', en: 'Load more series' })}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 3.2: DEDICATED ANIME HUB                                   */}
      {/* Crunchyroll · AnimeBox · JKAnime · AnimeFLV (Series y Películas)   */}
      {/* ================================================================== */}
      {activeSection === 'anime' && (
        <div className="space-y-4">
          {/* Top Masterpiece Anime Requested Collection */}
          <section className="rounded-3xl bg-[#14161F] border border-white/[0.08] p-3.5 sm:p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#F47521] shrink-0" />
                <h3 className="font-display font-bold text-xs sm:text-sm text-white truncate">
                  {pickLang(lang, {
                    es: 'Obras Maestras del Anime · Temporadas Completas',
                    ca: "Obres Mestres de l'Anime · Temporades Completes",
                    en: 'Masterpiece Anime Collection · Full Seasons',
                  })}
                </h3>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 shrink-0 tabular-nums">
                100% HD
              </span>
            </div>

            <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {MASTERPIECE_ANIME_PRESETS.map((item) => (
                <button
                  key={`preset-${item.tmdbId}`}
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    openSeriesDetails(item.tmdbId, 1, {
                      id: `tv-es-${item.tmdbId}`,
                      tmdbId: item.tmdbId,
                      title: item.title,
                      mediaType: 'tv',
                      poster: item.poster,
                      backdrop: item.backdrop,
                      rating: item.rating,
                    });
                  }}
                  className="w-[125px] sm:w-[145px] shrink-0 rounded-2xl p-2 bg-[#1C1F2B] hover:bg-[#252A3A] border border-white/[0.07] hover:border-[#F47521]/60 transition-all flex flex-col justify-between gap-2 cursor-pointer group text-left focus-visible:outline-2 focus-visible:outline-[#F47521]"
                >
                  <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#0A0B10]">
                    <PosterImage
                      src={item.poster}
                      alt={item.title}
                      aspect="poster"
                      imgClassName="group-hover:scale-105 transition-transform duration-300"
                      fallbackTitle={item.title}
                      fallbackIcon={<Sparkles className="w-6 h-6 text-zinc-500" />}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-mono font-bold text-[#FFBD0F] flex items-center gap-0.5">
                      ★ {item.rating}
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-[#F47521]/90 text-[9px] font-black uppercase text-white tracking-wider">
                      {item.tag}
                    </span>
                  </div>

                  <div className="min-w-0 w-full">
                    <span className="block font-display font-bold text-xs text-white truncate group-hover:text-[#F47521] transition-colors">
                      {item.title}
                    </span>
                    <span className="block text-[10px] text-zinc-400 truncate mt-0.5">
                      {item.subtitle}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Editorial Anime Spotlight Hero Card */}
          {spotlightAnime && (
            <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0D0D12] min-h-[210px] sm:min-h-[265px] flex flex-col justify-end p-5 sm:p-8 shadow-2xl">
              {!animeSpotlightImgFailed &&
              (spotlightAnime.backdrop || spotlightAnime.poster) ? (
                <img
                  src={spotlightAnime.backdrop || spotlightAnime.poster}
                  alt={spotlightAnime.title}
                  referrerPolicy="no-referrer"
                  onError={() => setAnimeSpotlightImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#231208] via-[#0D0D12] to-[#050507]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/90 via-[#050507]/45 to-transparent" />

              <div className="relative z-10 max-w-xl space-y-2.5">
                <div className="text-xs text-zinc-300 font-medium">
                  <span className="text-[#FDBA74] font-semibold">
                    {animePortal === 'anime_all'
                      ? animeMediaKind === 'series'
                        ? pickLang(lang, { es: 'Anime Destacado · Series', ca: 'Anime Destacat · Sèries', en: 'Featured Anime · Series' })
                        : pickLang(lang, { es: 'Anime Destacado · Película', ca: 'Anime Destacat · Pel·lícula', en: 'Featured Anime · Movie' })
                      : `${pickLang(lang, activeAnimePortalMeta)} · ${
                          animeMediaKind === 'series'
                            ? pickLang(lang, { es: 'Serie Anime', ca: 'Sèrie Anime', en: 'Anime Series' })
                            : pickLang(lang, { es: 'Película Anime', ca: 'Pel·lícula Anime', en: 'Anime Movie' })
                        }`}
                  </span>
                  <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                    ·
                  </span>
                  <span>{spotlightAnime.year || 'HD'}</span>
                  {spotlightAnime.rating && (
                    <>
                      <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-amber-400">
                        ★ {spotlightAnime.rating}
                      </span>
                    </>
                  )}
                </div>

                <h3 className="font-display font-bold text-xl sm:text-3xl text-white leading-tight text-balance">
                  {spotlightAnime.title}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-[54ch]">
                  {spotlightAnime.overview}
                </p>

                <div className="pt-1.5 flex flex-wrap items-center gap-2.5">
                  {animeMediaKind === 'series' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!spotlightAnime.tmdbId) return;
                          triggerHaptic('success');
                          setSeriesLangMode(animeLangPref);
                          openSeriesDetails(spotlightAnime.tmdbId, 1, {
                            ...spotlightAnime,
                            mediaType: 'tv',
                          });
                        }}
                        className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-lg shadow-[#E11D48]/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current text-white" />
                        <span>
                          {pickLang(lang, {
                            es: 'Ver Temporadas y Capítulos',
                            ca: 'Veure Temporades i Capítols',
                            en: 'Choose Season & Episode',
                          })}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setPreviewItem({ ...spotlightAnime, mediaType: 'tv' });
                        }}
                        className="min-h-[44px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        <Info className="w-4 h-4 text-white" />
                        <span>{pickLang(lang, { es: 'Tráiler y Ficha', ca: 'Tràiler i Fitxa', en: 'Trailer & Info' })}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setPreviewItem({ ...spotlightAnime, mediaType: 'movie' });
                        }}
                        className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-lg shadow-[#E11D48]/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Info className="w-4 h-4 text-white" />
                        <span>
                          {pickLang(lang, {
                            es: 'Elegir Idioma y Ver',
                            ca: 'Triar Idioma i Veure',
                            en: 'Select Language & Watch',
                          })}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(loadingItemId)}
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayMovie(
                            { ...spotlightAnime, mediaType: 'movie' },
                            animeLangPref
                          );
                        }}
                        className="min-h-[44px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        {loadingItemId === spotlightAnime.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 fill-current text-[#E11D48]" />
                        )}
                        <span>{pickLang(lang, { es: 'Reproducir directo', ca: 'Reproduir directe', en: 'Quick Play' })}</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={(e) =>
                      handleToggleBookmark(
                        {
                          ...spotlightAnime,
                          mediaType: animeMediaKind === 'series' ? 'tv' : 'movie',
                        },
                        e
                      )
                    }
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isBookmarked({
                          ...spotlightAnime,
                          mediaType: animeMediaKind === 'series' ? 'tv' : 'movie',
                        })
                          ? 'fill-current text-[#E11D48]'
                          : ''
                      }`}
                    />
                    <span>
                      {isBookmarked({
                        ...spotlightAnime,
                        mediaType: animeMediaKind === 'series' ? 'tv' : 'movie',
                      })
                        ? pickLang(lang, { es: 'Guardado', ca: 'Desat', en: 'Saved' })
                        : t.pillarMyList}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Anime Poster Grid */}
          {loadingAnime ? (
            <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : animeItems.length === 0 ? (
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-3">
              <Sparkles className="w-8 h-8 text-[#F47521] mx-auto mb-1" />
              <p className="text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'No encontramos anime con ese título en esta vista',
                  ca: 'No hem trobat anime amb aquest títol en aquesta vista',
                  en: 'No anime found matching your search',
                })}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {animePortal !== 'anime_all' && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setAnimePortal('anime_all');
                      setAnimePage(1);
                    }}
                    className="min-h-[44px] px-5 rounded-2xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <span>
                      {pickLang(lang, { es: 'Buscar en Todo el Anime', ca: "Cercar a Tot l'Anime", en: 'Search All Anime' })}
                    </span>
                  </button>
                )}
                {animeQuery.trim().length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      setAnimeMediaKind((k) => (k === 'series' ? 'movies' : 'series'));
                      setAnimePage(1);
                    }}
                    className="min-h-[44px] px-5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/12 text-white text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <span>
                      {animeMediaKind === 'series'
                        ? pickLang(lang, {
                            es: `Buscar «${animeQuery.trim()}» en Películas Anime`,
                            ca: `Cercar «${animeQuery.trim()}» a Pel·lícules Anime`,
                            en: 'Search in Anime Movies',
                          })
                        : pickLang(lang, {
                            es: `Buscar «${animeQuery.trim()}» en Series Anime`,
                            ca: `Cercar «${animeQuery.trim()}» a Sèries Anime`,
                            en: 'Search in Anime Series',
                          })}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <VirtualizedPosterGrid
                items={gridAnime}
                variant="poster"
                getKey={(anime) =>
                  getCatalogFavoriteKey({
                    ...anime,
                    mediaType: animeMediaKind === 'series' ? 'tv' : 'movie',
                  })
                }
                renderItem={(anime) => {
                  const isSeriesCard = animeMediaKind === 'series';
                  const normalizedItem: CatalogMovie = {
                    ...anime,
                    mediaType: isSeriesCard ? 'tv' : 'movie',
                  };
                  const favKey = getCatalogFavoriteKey(normalizedItem);
                  const savedAnime = isBookmarked(normalizedItem);
                  const isExtractingThis =
                    loadingItemId === anime.id || loadingItemId === favKey;
                  const isAnimeInRoom =
                    Boolean(activeMediaTitle) &&
                    activeMediaTitle.toLowerCase().includes(anime.title.trim().toLowerCase());
                  const animeHistory = watchHistory.find(
                    (h) =>
                      (anime.tmdbId && h.tmdbId === anime.tmdbId) ||
                      h.title.trim().toLowerCase() === anime.title.trim().toLowerCase()
                  );
                  const animePct =
                    animeHistory?.resumeTimeSec &&
                    animeHistory?.durationSec &&
                    animeHistory.durationSec > 60
                      ? Math.min(
                          100,
                          Math.max(
                            8,
                            Math.round(
                              (animeHistory.resumeTimeSec / animeHistory.durationSec) * 100
                            )
                          )
                        )
                      : animeHistory
                      ? 30
                      : 0;

                  const handleCardOpen = () => {
                    if (loadingItemId) return;
                    triggerHaptic('light');
                    if (isSeriesCard && anime.tmdbId) {
                      setSeriesLangMode(animeLangPref);
                      openSeriesDetails(
                        anime.tmdbId,
                        animeHistory?.season || 1,
                        normalizedItem
                      );
                    } else {
                      setPreviewItem(normalizedItem);
                    }
                  };

                  return (
                    <div
                      className={`group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border transition-colors shadow-[0_12px_30px_rgba(0,0,0,0.55)] ${
                        isAnimeInRoom
                          ? 'border-[#F47521] ring-1 ring-[#F47521]/50'
                          : 'border-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={handleCardOpen}
                        aria-label={anime.title}
                        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#F47521]"
                      />

                      <div className="absolute inset-0 z-[1] pointer-events-none">
                        <PosterImage
                          src={anime.poster}
                          alt={anime.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={anime.title}
                          fallbackIcon={<Sparkles className="w-8 h-8 text-zinc-500" />}
                        />
                      </div>

                      {isAnimeInRoom ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-[#E11D48] text-white text-[10px] font-bold flex items-center gap-1 shadow-md pointer-events-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          <span>{pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'Playing' })}</span>
                        </div>
                      ) : isSeriesCard && animeHistory?.season && animeHistory?.episode ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-zinc-100 text-[10px] font-mono font-bold tabular-nums pointer-events-none">
                          T{animeHistory.season} · {pickLang(lang, { es: 'Cap.', ca: 'Cap.', en: 'Ep.' })} {animeHistory.episode}
                        </div>
                      ) : !isSeriesCard && animePct >= 90 ? (
                        <div className="absolute top-2.5 left-2.5 z-[2] px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-emerald-300 text-[10px] font-bold flex items-center gap-1 pointer-events-none">
                          <Check className="w-3 h-3" />
                          <span>{pickLang(lang, { es: 'Vista', ca: 'Vista', en: 'Watched' })}</span>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(normalizedItem, e)}
                        aria-label={pickLang(lang, {
                          es: `Guardar ${anime.title} en Mi Lista`,
                          ca: `Desar ${anime.title} a la Meva Llista`,
                          en: `Save ${anime.title} to My List`,
                        })}
                        className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center cursor-pointer transition-colors ${
                          savedAnime
                            ? 'bg-black/75 border-[#E11D48]/50 text-[#E11D48]'
                            : 'bg-black/45 hover:bg-black/75 border-white/10 text-white/80 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${savedAnime ? 'fill-current' : ''}`} />
                      </button>

                      {isExtractingThis && (
                        <div className="absolute inset-0 z-[3] bg-black/55 flex items-center justify-center pointer-events-none">
                          <div className="w-11 h-11 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-2xl">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 z-[2] pt-16 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex items-end justify-between gap-2 pointer-events-none">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
                            {anime.title}
                          </h3>
                          <div className="text-[11px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
                            <span>{anime.year || 'HD'}</span>
                            {anime.rating && (
                              <>
                                <span className="text-zinc-500">·</span>
                                <span className="text-amber-400 font-mono font-bold tabular-nums">
                                  ★ {anime.rating}
                                </span>
                              </>
                            )}
                            <span className="text-zinc-500">·</span>
                            <span className="text-[#FDBA74] font-semibold">
                              {isSeriesCard
                                ? pickLang(lang, { es: 'Capítulos', ca: 'Capítols', en: 'Episodes' })
                                : pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' })}
                            </span>
                          </div>
                        </div>

                        {isSeriesCard ? (
                          anime.tmdbId ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                setPreviewItem(normalizedItem);
                              }}
                              title={pickLang(lang, { es: 'Ver Tráiler y Ficha', ca: 'Veure Tràiler i Fitxa', en: 'Trailer & Info' })}
                              aria-label={`${pickLang(lang, { es: 'Ver ficha de', ca: 'Veure fitxa de', en: 'Info for' })} ${anime.title}`}
                              className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          ) : null
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (loadingItemId) return;
                              triggerHaptic('success');
                              onPlayMovie(normalizedItem, animeLangPref);
                            }}
                            title={pickLang(lang, { es: 'Reproducir película anime en la sala', ca: "Reproduir pel·lícula d'anime a la sala", en: 'Play anime movie in room' })}
                            aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${anime.title}`}
                            className="relative z-10 pointer-events-auto w-9 h-9 rounded-full bg-[#E11D48] hover:bg-[#F43F5E] text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </button>
                        )}
                      </div>

                      {animePct > 0 && animePct < 90 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 pointer-events-none z-[2]">
                          <div
                            className="h-full bg-[#E11D48]"
                            style={{ width: `${animePct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {hasMoreAnime && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreAnime}
                    onClick={() => {
                      triggerHaptic('light');
                      setAnimePage((p) => p + 1);
                    }}
                    className="min-h-[46px] px-6 rounded-2xl bg-[#0E0F16] hover:bg-white/[0.08] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {loadingMoreAnime && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#F47521]" />
                    )}
                    <span>{pickLang(lang, { es: 'Cargar más anime', ca: 'Carregar més anime', en: 'Load more anime' })}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 3.5: LIVE TELEVISION (TDT ESPAÑA · MOVISTAR+ · DAZN)       */}
      {/* Adapts cleanly whether viewing DAZN only, Movistar+ only, or TDT   */}
      {/* ================================================================== */}
      {activeSection === 'tdt' && (
        <div className="space-y-4">
          {epgMadridClock && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Calendar className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="font-semibold text-zinc-200">
                {pickLang(lang, { es: 'Guía EPG en directo', ca: 'Guia EPG en directe', en: 'Live EPG Guide' })}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {lang === 'es' ? `${epgMadridClock} h` : `${epgMadridClock} CET`}
              </span>
            </div>
          )}

          {/* Saved Favorite Channels Quick Bar */}
          {favoriteChannels.length > 0 && focusedHub === 'all' && (
            <section className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-display font-bold text-white">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                <span>
                  {pickLang(lang, {
                    es: `Mis Canales Favoritos (${favoriteChannels.length})`,
                    ca: `Els meus Canals Favorits (${favoriteChannels.length})`,
                    en: `Favorite Channels (${favoriteChannels.length})`,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {favoriteChannels.map((fCh) => {
                  const isPlayingFav = activeVideoRawUrl === fCh.channelUrl;
                  const isLoadingFav = loadingItemId === `favch-${fCh.favId}`;
                  return (
                    <div
                      key={fCh.favId}
                      className={`flex items-center rounded-xl border shrink-0 transition-colors ${
                        isPlayingFav
                          ? 'bg-white text-[#050508] border-white'
                          : 'bg-[#0E0F16] border-white/[0.1] text-zinc-100 hover:border-white/25'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={Boolean(loadingItemId)}
                        onClick={() => {
                          triggerHaptic('medium');
                          onPlayFavoriteChannel(fCh);
                        }}
                        className="min-h-[40px] pl-3 pr-2.5 flex items-center gap-2 text-xs font-semibold whitespace-nowrap cursor-pointer"
                      >
                        {isLoadingFav ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E11D48]" />
                        ) : (
                          <Play
                            className={`w-3.5 h-3.5 fill-current ${
                              isPlayingFav ? 'text-[#050508]' : 'text-[#E11D48]'
                            }`}
                          />
                        )}
                        <span>{fCh.channelLabel}</span>
                      </button>

                      {activeVideoRawUrl &&
                        activeVideoRawUrl !== fCh.channelUrl &&
                        onPlaySecondaryChannel && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('medium');
                              onPlaySecondaryChannel({
                                sourceUrl: fCh.channelUrl,
                                title: fCh.channelLabel,
                                subtitle: fCh.competition,
                              });
                            }}
                            title={pickLang(lang, {
                              es: 'Abrir en 2ª pantalla (Multiview)',
                              ca: 'Obrir a la 2a pantalla (Multiview)',
                              en: 'Open in 2nd screen (Multiview)',
                            })}
                            aria-label={pickLang(lang, {
                              es: `Abrir ${fCh.channelLabel} en 2ª pantalla`,
                              ca: `Obrir ${fCh.channelLabel} a la 2a pantalla`,
                              en: `Open ${fCh.channelLabel} in 2nd screen`,
                            })}
                            className={`w-9 h-9 flex items-center justify-center border-l cursor-pointer ${
                              isPlayingFav
                                ? 'border-black/10 text-zinc-700 hover:text-black'
                                : 'border-white/[0.08] text-sky-400 hover:text-sky-300'
                            }`}
                          >
                            <Columns2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Live Channel Grid (Virtualized) */}
          {loadingTdt && tdtChannels.length === 0 ? (
            <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3.5">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-44 rounded-2xl bg-white/[0.04] border border-white/[0.07] skeleton-shimmer"
                />
              ))}
            </div>
          ) : filteredTdtChannels.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-2">
              <Tv className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'No se encontraron canales con ese filtro',
                  ca: 'No s’han trobat canals amb aquest filtre',
                  en: 'No channels match your search',
                })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTdtSearch('');
                  setEpgFilter('all');
                  if (focusedHub === 'tdt_es') setTdtCategory('tdt_all');
                  else if (focusedHub === 'all') setTdtCategory('all');
                }}
                className="min-h-[44px] px-4 rounded-xl bg-white text-[#050508] text-xs font-bold cursor-pointer"
              >
                {pickLang(lang, {
                  es: 'Restablecer filtros',
                  ca: 'Restablir filtres',
                  en: 'Reset filter',
                })}
              </button>
            </div>
          ) : (
            <VirtualizedPosterGrid
              items={filteredTdtChannels}
              variant="wide"
              estimateRowHeight={218}
              getKey={(ch) => ch.id}
              renderItem={(ch) => {
                const primarySignal = ch.channels[0];
                const isPlayingThis = ch.channels.some(
                  (sig) => activeVideoRawUrl && activeVideoRawUrl === sig.sourceUrl
                );
                const favId = buildChannelFavId(ch.name, primarySignal?.sourceUrl || ch.id);
                const isFav = isChannelFavorited(favId);
                const chEpg = getChannelLiveEpg(ch.id);
                const health = ch.healthSummary;

                return (
                  <div
                    className={`group relative rounded-2xl p-4 bg-[#0D0E15] border transition-colors flex flex-col justify-between gap-3 h-full ${
                      isPlayingThis
                        ? 'border-white/60 ring-1 ring-white/25'
                        : 'border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    {/* Top Row: Channel Dial + Identity + Multiview/Favorite Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        disabled={Boolean(loadingItemId)}
                        onClick={() => {
                          triggerHaptic('medium');
                          onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                        }}
                        className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer"
                      >
                        <div
                          className="w-12 h-12 rounded-2xl shrink-0 flex flex-col items-center justify-center border border-white/15 shadow-inner relative overflow-hidden"
                          style={{
                            background: `linear-gradient(145deg, ${ch.brandTone}2E 0%, #090A10 100%)`,
                          }}
                        >
                          <span
                            className={`font-display font-extrabold tracking-tight text-white leading-none px-0.5 text-center ${
                              ch.shortMark.length > 4 ? 'text-[10px]' : 'text-xs'
                            }`}
                          >
                            {ch.shortMark}
                          </span>
                          <span className="mt-1 text-[10px] font-mono tabular-nums text-zinc-400 leading-none">
                            DIAL {ch.dial}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="font-display font-bold text-sm sm:text-base text-white truncate">
                              {ch.name}
                            </h3>
                            {ch.channels?.[0]?.lang === 'AR' && (
                              <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-400/35 text-[9px] font-bold uppercase tracking-wide text-violet-200 shrink-0">
                                {pickLang(lang, { es: 'Árabe', ca: 'Àrab', en: 'AR' })}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
                            <span className="text-emerald-400 font-semibold">
                              {isPlayingThis
                                ? pickLang(lang, {
                                    es: 'En pantalla',
                                    ca: 'En pantalla',
                                    en: 'Playing',
                                  })
                                : pickLang(lang, {
                                    es: 'En directo',
                                    ca: 'En directe',
                                    en: 'Live',
                                  })}
                            </span>
                            <span className="text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="truncate">{ch.network}</span>
                            <span className="text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-300 shrink-0">
                              {ch.quality || '1080p'}
                            </span>
                            {health &&
                              (health.bestStatus === 'up' || health.bestStatus === 'degraded') &&
                              typeof health.bestLatencyMs === 'number' && (
                                <>
                                  <span className="text-zinc-600" aria-hidden="true">
                                    ·
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 font-mono tabular-nums shrink-0 ${
                                      health.bestStatus === 'up'
                                        ? 'text-emerald-400'
                                        : 'text-amber-400'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        health.bestStatus === 'up'
                                          ? 'bg-emerald-400'
                                          : 'bg-amber-400'
                                      }`}
                                    />
                                    {health.bestLatencyMs}ms
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {activeVideoRawUrl &&
                          !isPlayingThis &&
                          primarySignal &&
                          onPlaySecondaryChannel && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('medium');
                                onPlaySecondaryChannel({
                                  sourceUrl: primarySignal.sourceUrl,
                                  title: ch.name,
                                  subtitle: chEpg?.now?.title
                                    ? `${chEpg.now.title} · ${ch.network}`
                                    : `${pickLang(lang, {
                                        es: 'TV en Directo',
                                        ca: 'TV en Directe',
                                        en: 'Live TV',
                                      })} · ${ch.network}`,
                                });
                              }}
                              title={pickLang(lang, {
                                es: 'Ver en 2ª pantalla simultánea',
                                ca: 'Veure a la 2a pantalla simultània',
                                en: 'Watch on 2nd screen',
                              })}
                              aria-label={pickLang(lang, {
                                es: `Ver ${ch.name} en 2ª pantalla`,
                                ca: `Veure ${ch.name} a la 2a pantalla`,
                                en: `Watch ${ch.name} on 2nd screen`,
                              })}
                              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-sky-400 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Columns2 className="w-4 h-4" />
                            </button>
                          )}

                        {primarySignal && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onToggleChannelFavorite({
                                favId,
                                channelLabel: ch.name,
                                channelUrl: primarySignal.sourceUrl,
                                sport: 'tdt',
                                competition: `${pickLang(lang, {
                                  es: 'TV en Directo',
                                  ca: 'TV en Directe',
                                  en: 'Live TV',
                                })} · ${ch.network}`,
                                title: `${ch.name} ${pickLang(lang, {
                                  es: 'en Directo',
                                  ca: 'en Directe',
                                  en: 'Live',
                                })}`,
                              });
                            }}
                            aria-label={`${pickLang(lang, {
                              es: 'Favorito',
                              ca: 'Favorit',
                              en: 'Favorite',
                            })} ${ch.name}`}
                            className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center cursor-pointer transition-colors ${
                              isFav
                                ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                                : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-zinc-400 hover:text-white'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Real-Time EPG Now & Next Block */}
                    {chEpg?.now ? (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedEpgChannel(ch);
                        }}
                        aria-label={pickLang(lang, {
                          es: `Abrir Guía EPG de ${ch.name}`,
                          ca: `Obrir Guia EPG de ${ch.name}`,
                          en: `Open EPG Guide for ${ch.name}`,
                        })}
                        className="w-full text-left pt-2.5 border-t border-white/[0.06] space-y-1.5 cursor-pointer group/epg"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span className="font-semibold text-rose-400">
                              {pickLang(lang, { es: 'Ahora', ca: 'Ara', en: 'Now' })}
                            </span>
                            <span className="text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-300">
                              {chEpg.now.startLabel} – {chEpg.now.stopLabel}
                            </span>
                            {chEpg.now.category && (
                              <>
                                <span className="text-zinc-600" aria-hidden="true">
                                  ·
                                </span>
                                <span className="truncate text-zinc-400">
                                  {chEpg.now.category}
                                </span>
                              </>
                            )}
                          </div>
                          {chEpg.remainingMin > 0 && (
                            <span className="font-mono tabular-nums text-[11px] text-zinc-400 shrink-0">
                              {lang === 'es'
                                ? `${chEpg.remainingMin} min rest.`
                                : lang === 'ca'
                                ? `${chEpg.remainingMin} min rest.`
                                : `${chEpg.remainingMin}m left`}
                            </span>
                          )}
                        </div>

                        <div className="text-xs sm:text-[13px] font-semibold text-white line-clamp-1 group-hover/epg:text-zinc-200 transition-colors">
                          {chEpg.now.title}
                        </div>

                        <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                          <div
                            className="h-full w-full bg-white/90 rounded-full origin-left"
                            style={{
                              transform: `scaleX(${Math.max(
                                0.04,
                                Math.min(1, chEpg.progressPct / 100)
                              )})`,
                            }}
                          />
                        </div>

                        {chEpg.next && (
                          <div className="text-[11px] text-zinc-400 truncate pt-0.5">
                            <span className="text-zinc-500">
                              {pickLang(lang, { es: 'Luego', ca: 'Després', en: 'Next' })}
                            </span>
                            <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-300">
                              {chEpg.next.startLabel}
                            </span>
                            <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-zinc-300">{chEpg.next.title}</span>
                          </div>
                        )}
                      </button>
                    ) : (
                      <div className="pt-2.5 border-t border-white/[0.06]">
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {ch.description}
                        </p>
                      </div>
                    )}

                    {/* Bottom Action Bar */}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06] overflow-x-auto no-scrollbar">
                      {ch.channels.slice(0, 2).map((sig, sIdx) => {
                        const sigActive = activeVideoRawUrl === sig.sourceUrl;
                        const sigLoading = loadingItemId === `tdt-${ch.id}-${sIdx}`;
                        const isPrimary = sIdx === 0;

                        return (
                          <button
                            key={sig.id}
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={() => {
                              triggerHaptic('success');
                              onPlayTdtChannel(ch, sIdx, chEpg?.now?.title);
                            }}
                            className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              sigActive
                                ? 'flex-1 bg-emerald-400 text-[#04130E]'
                                : isPrimary
                                ? 'flex-1 bg-white hover:bg-zinc-200 text-[#050507]'
                                : 'bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.09] text-zinc-200'
                            }`}
                          >
                            {sigLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            <span>
                              {sigActive
                                ? pickLang(lang, { es: 'Viendo', ca: 'Veient', en: 'Live' })
                                : isPrimary
                                ? pickLang(lang, {
                                    es: 'Ver en directo',
                                    ca: 'Veure en directe',
                                    en: 'Watch Live',
                                  })
                                : pickLang(lang, {
                                    es: `Señal ${sIdx + 1}`,
                                    ca: `Senyal ${sIdx + 1}`,
                                    en: `Signal ${sIdx + 1}`,
                                  })}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedEpgChannel(ch);
                        }}
                        aria-label={pickLang(lang, {
                          es: `Abrir Guía EPG de ${ch.name}`,
                          ca: `Obrir Guia EPG de ${ch.name}`,
                          en: `Open EPG Guide for ${ch.name}`,
                        })}
                        className="min-h-[44px] px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5 text-rose-400" />
                        <span>{pickLang(lang, { es: 'Guía', ca: 'Guia', en: 'EPG' })}</span>
                      </button>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 4: LIVE SPORTS & 24/7 MULTIPLEX CHANNELS                   */}
      {/* ================================================================== */}
      {activeSection === 'sports' && (
        <div className="space-y-4">
          {/* DIRECT LIVE SPORTS CHANNELS IN FÚTBOL SECTION */}
          {(sportFilter === 'soccer' || sportFilter === 'all') && (
            <section className="rounded-2xl bg-[#161922] border border-white/[0.08] p-3 sm:p-4 space-y-3 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShow247Strip((v) => !v);
                  }}
                  className="flex items-center gap-2 min-w-0 cursor-pointer text-left group"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <h3 className="font-display font-bold text-xs sm:text-sm text-white truncate group-hover:text-[#FFBD0F] transition-colors">
                    {pickLang(lang, {
                      es: `Canales de Fútbol en Vivo 24/7 (${footballSectionLiveChannels.length})`,
                      ca: `Canals de Futbol en Directe 24/7 (${footballSectionLiveChannels.length})`,
                      en: `24/7 Live Football Channels (${footballSectionLiveChannels.length})`,
                    })}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300 shrink-0">
                    {show247Strip
                      ? pickLang(lang, { es: 'Ocultar', ca: 'Amagar', en: 'Hide' })
                      : pickLang(lang, { es: 'Mostrar', ca: 'Mostrar', en: 'Show' })}
                  </span>
                </button>

                {show247Strip && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                    {(
                      [
                        {
                          id: 'all',
                          label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }),
                        },
                        { id: 'uk_sports', label: 'UK Sports (EN)' },
                        { id: 'beinsports', label: 'beIN SPORTS' },
                        { id: 'espn', label: 'ESPN (1–7)' },
                        { id: 'dsports', label: 'DSports' },
                        {
                          id: 'tnt_space',
                          label: pickLang(lang, {
                            es: 'TNT y Space',
                            ca: 'TNT i Space',
                            en: 'TNT & Space',
                          }),
                        },
                        { id: 'movistar', label: 'Movistar+' },
                        { id: 'dazn', label: 'DAZN' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setFootballLiveBrand(tab.id);
                        }}
                        className={`min-h-[32px] px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          footballLiveBrand === tab.id
                            ? 'bg-[#FFBD0F] text-[#141720]'
                            : 'bg-[#242833] hover:bg-[#2E3442] text-zinc-200 border border-white/[0.06]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {show247Strip && footballSectionLiveChannels.length > 0 ? (
                <div
                  className={
                    footballLiveBrand === 'all'
                      ? 'flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1'
                      : 'grid grid-cols-2 @sm:grid-cols-3 @lg:grid-cols-4 gap-2.5'
                  }
                >
                  {footballSectionLiveChannels.map((ch) => {
                    const isPlayingThis = ch.channels.some(
                      (sig) => activeVideoRawUrl && activeVideoRawUrl === sig.sourceUrl
                    );
                    const isLoadingThis = Boolean(loadingItemId?.startsWith(`tdt-${ch.id}-`));
                    const primarySig = ch.channels[0];
                    const health = ch.healthSummary;

                    return (
                      <div
                        key={`fblive-${ch.id}`}
                        className={`${
                          footballLiveBrand === 'all' ? 'w-[188px] sm:w-[206px] shrink-0' : ''
                        } rounded-xl p-2.5 bg-[#242833] hover:bg-[#2B303E] border transition-colors flex flex-col justify-between gap-2 ${
                          isPlayingThis
                            ? 'border-[#FFBD0F] ring-1 ring-[#FFBD0F]/40'
                            : 'border-white/[0.07] hover:border-white/20'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={Boolean(loadingItemId)}
                          onClick={() => {
                            triggerHaptic('success');
                            onPlayTdtChannel(ch, 0);
                          }}
                          className="flex items-center gap-2.5 min-w-0 text-left w-full cursor-pointer"
                        >
                          <div
                            className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center border border-white/15 font-display font-extrabold text-[10px] text-white leading-none text-center px-0.5"
                            style={{
                              background: `linear-gradient(145deg, ${ch.brandTone}45 0%, #11131C 100%)`,
                            }}
                          >
                            {ch.shortMark}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="font-display font-bold text-xs text-white truncate">
                                {ch.name}
                              </span>
                              {ch.channels?.[0]?.lang === 'AR' && (
                                <span className="px-1 py-0.5 rounded bg-violet-500/25 text-[8px] font-black uppercase text-violet-200 shrink-0">
                                  AR
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1">
                              {isPlayingThis ? (
                                <span className="text-[#FFBD0F] font-semibold">
                                  {pickLang(lang, {
                                    es: 'En reproducción',
                                    ca: 'En reproducció',
                                    en: 'Playing',
                                  })}
                                </span>
                              ) : (
                                <>
                                  <span className="truncate">
                                    {ch.network} · {ch.quality || '1080p'}
                                  </span>
                                  {health &&
                                    (health.bestStatus === 'up' ||
                                      health.bestStatus === 'degraded') &&
                                    typeof health.bestLatencyMs === 'number' && (
                                      <span
                                        className={`font-mono tabular-nums shrink-0 ${
                                          health.bestStatus === 'up'
                                            ? 'text-emerald-400'
                                            : 'text-amber-400'
                                        }`}
                                      >
                                        · {health.bestLatencyMs}ms
                                      </span>
                                    )}
                                </>
                              )}
                            </div>
                          </div>
                          {isLoadingThis ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#FFBD0F] shrink-0" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current text-[#FFBD0F] shrink-0" />
                          )}
                        </button>

                        {ch.channels.length > 1 && (
                          <div className="flex items-center gap-1 pt-1.5 border-t border-white/[0.06] overflow-x-auto no-scrollbar">
                            {ch.channels.slice(0, 3).map((sig, sIdx) => {
                              const sigActive = activeVideoRawUrl === sig.sourceUrl;
                              return (
                                <button
                                  key={sig.id}
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onPlayTdtChannel(ch, sIdx);
                                  }}
                                  className={`min-h-[26px] px-2 rounded-md text-[10px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                    sigActive
                                      ? 'bg-[#FFBD0F] text-[#141720]'
                                      : 'bg-[#191C26] hover:bg-[#313748] text-zinc-300'
                                  }`}
                                >
                                  {pickLang(lang, {
                                    es: `Opción ${sIdx + 1}`,
                                    ca: `Opció ${sIdx + 1}`,
                                    en: `Feed ${sIdx + 1}`,
                                  })}
                                </button>
                              );
                            })}
                            {activeVideoRawUrl &&
                              !isPlayingThis &&
                              primarySig &&
                              onPlaySecondaryChannel && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onPlaySecondaryChannel({
                                      sourceUrl: primarySig.sourceUrl,
                                      title: ch.name,
                                      subtitle: ch.network,
                                    });
                                  }}
                                  title={pickLang(lang, {
                                    es: 'Abrir en segunda pantalla Multiview',
                                    ca: 'Obrir a la segona pantalla Multiview',
                                    en: 'Open in Multiview 2nd screen',
                                  })}
                                  aria-label={`Multiview ${ch.name}`}
                                  className="min-h-[26px] px-2 rounded-md bg-[#191C26] hover:bg-[#313748] text-sky-300 flex items-center justify-center ml-auto shrink-0 cursor-pointer"
                                >
                                  <Columns2 className="w-3 h-3" />
                                </button>
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : show247Strip && loadingTdt ? (
                <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="w-[188px] h-16 rounded-xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer shrink-0"
                    />
                  ))}
                </div>
              ) : null}
            </section>
          )}

          {/* Live Football Matchboard */}
          {(sportFilter === 'soccer' || sportFilter === 'all') && (
            <FootballMatchboard
              lang={lang}
              searchQuery={sportsSearch}
              onSearchQueryChange={setSportsSearch}
              activeVideoRawUrl={activeVideoRawUrl}
              loadingItemId={loadingItemId}
              onPlaySportsMatch={onPlaySportsMatch}
              onPlaySecondaryChannel={
                onPlaySecondaryChannel
                  ? (match, chIdx) => {
                      const ch = match.channels[chIdx] || match.channels[0];
                      if (ch?.sourceUrl) {
                        onPlaySecondaryChannel({
                          sourceUrl: ch.sourceUrl,
                          title: `${match.title} · ${ch.label}`,
                          subtitle: match.competition,
                        });
                      }
                    }
                  : undefined
              }
              isChannelFavorited={isChannelFavorited}
              onToggleChannelFavorite={onToggleChannelFavorite}
            />
          )}

          {/* Non-soccer Match Scoreboards */}
          {sportFilter !== 'soccer' && sportFilter !== 'all' && liveScores.length > 0 && (
            <section className="rounded-3xl bg-white/[0.02] border border-white/[0.07] p-3.5 sm:p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="font-display font-bold text-white">
                  {pickLang(lang, {
                    es: 'Marcadores de la Jornada',
                    ca: 'Marcadors de la Jornada',
                    en: 'Matchday Scoreboard',
                  })}
                </div>
                {activeVideoRawUrl && onPlaySecondaryChannel && (
                  <span className="text-[11px] text-sky-300 flex items-center gap-1">
                    <Columns2 className="w-3.5 h-3.5" />
                    <span>
                      {pickLang(lang, {
                        es: 'Icono doble = Multiview',
                        ca: 'Icona doble = Multiview',
                        en: 'Multi-View ready',
                      })}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
                {liveScores
                  .filter((sc) => sportFilter === 'basketball' && sc.sport === 'basketball')
                  .map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSportsSearch(sc.homeTeam);
                      }}
                      title={pickLang(lang, {
                        es: `Buscar retransmisión de ${sc.homeTeam}`,
                        ca: `Cercar retransmissió de ${sc.homeTeam}`,
                        en: `Search broadcast for ${sc.homeTeam}`,
                      })}
                      className={`min-w-[178px] sm:min-w-[196px] shrink-0 rounded-2xl p-3 border flex flex-col justify-between gap-1.5 text-left cursor-pointer transition-colors ${
                        sc.isLive
                          ? 'bg-[#0E0F16] border-emerald-400/40 hover:border-emerald-400'
                          : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="font-semibold text-zinc-400">{sc.league}</span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            sc.isLive ? 'text-emerald-400' : 'text-zinc-400'
                          }`}
                        >
                          {sc.statusText}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {sc.homeLogo && (
                              <img
                                src={sc.homeLogo}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-4 h-4 object-contain shrink-0"
                              />
                            )}
                            <span className="font-semibold text-white truncate">
                              {sc.homeTeam}
                            </span>
                          </div>
                          <span className="font-mono font-bold tabular-nums text-white shrink-0">
                            {sc.homeScore}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {sc.awayLogo && (
                              <img
                                src={sc.awayLogo}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-4 h-4 object-contain shrink-0"
                              />
                            )}
                            <span className="font-semibold text-zinc-200 truncate">
                              {sc.awayTeam}
                            </span>
                          </div>
                          <span className="font-mono font-bold tabular-nums text-zinc-200 shrink-0">
                            {sc.awayScore}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          )}

          {sportFilter !== 'soccer' && loadingSports && sportsEvents.length === 0 ? (
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-3xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : (
            <>
              {multiplexChannels.length > 0 && (
                <div className="grid grid-cols-1 @md:grid-cols-2 gap-3.5">
                  {multiplexChannels.map((mux) => {
                    const bgAsset = mux.sport === 'motor' ? f1Backdrop : stadiumBackdrop;
                    const imgFailed = brokenHeroImgs[mux.id];
                    const isExtractingMux = loadingItemId?.startsWith(mux.id);

                    return (
                      <div
                        key={mux.id}
                        className="relative rounded-3xl overflow-hidden border border-white/[0.09] bg-[#0E0F16] min-h-[205px] p-5 flex flex-col justify-end gap-4 min-w-0"
                      >
                        {!imgFailed ? (
                          <img
                            src={bgAsset}
                            alt={mux.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenHeroImgs((prev) => ({ ...prev, [mux.id]: true }))
                            }
                            className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[#192236] to-[#090A0F]" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/25" />

                        <div className="relative z-10 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-[#FB7185] font-semibold">
                              {mux.competition} · {mux.time}
                            </div>
                            <h3 className="font-display font-bold text-base sm:text-xl text-white mt-0.5 text-balance">
                              {mux.title}
                            </h3>
                          </div>
                          {isExtractingMux && (
                            <Loader2 className="w-5 h-5 animate-spin text-[#E11D48] shrink-0" />
                          )}
                        </div>

                        <div className="relative z-10 flex items-center sm:flex-wrap gap-2 overflow-x-auto no-scrollbar pt-1 min-w-0">
                          {mux.channels.map((ch, idx) => {
                            const activeCh = activeVideoRawUrl === ch.sourceUrl;
                            const chFavId = buildChannelFavId(ch.sourceUrl, ch.label);
                            const chSaved = isChannelFavorited(chFavId);

                            return (
                              <div
                                key={ch.id}
                                className={`inline-flex items-center rounded-xl shrink-0 overflow-hidden transition-colors ${
                                  activeCh
                                    ? 'bg-white text-[#050508]'
                                    : 'bg-black/65 hover:bg-black/85 text-white backdrop-blur-xl border border-white/15'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('medium');
                                    onPlaySportsMatch(mux, idx);
                                  }}
                                  className="min-h-9 pl-3.5 pr-2.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{ch.label}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerHaptic('light');
                                    onToggleChannelFavorite({
                                      favId: chFavId,
                                      title: mux.title,
                                      channelLabel: ch.label,
                                      channelUrl: ch.sourceUrl,
                                      competition: mux.competition,
                                      sport: mux.sport,
                                    });
                                  }}
                                  aria-label="Marcar como canal favorito"
                                  className={`min-h-9 px-2.5 border-l flex items-center justify-center cursor-pointer ${
                                    activeCh ? 'border-black/10' : 'border-white/10'
                                  }`}
                                >
                                  <Star
                                    className={`w-3 h-3 ${
                                      chSaved
                                        ? 'fill-current text-amber-400'
                                        : activeCh
                                        ? 'text-zinc-700'
                                        : 'text-zinc-400 hover:text-amber-300'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {scheduledMatches.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white px-0.5">
                    {pickLang(lang, {
                      es: 'Agenda de Partidos en Directo Hoy',
                      ca: 'Agenda de Partits en Directe Avui',
                      en: "Today's Live Match Schedule",
                    })}
                  </h3>
                  <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3.5">
                    {scheduledMatches.map((match, mIdx) => {
                      const isExtractingMatch = loadingItemId?.startsWith(match.id);
                      const matchBackdrop =
                        match.sport === 'motor' ? f1Backdrop : stadiumBackdrop;
                      const primaryCh = match.channels[0];
                      const primaryFavId = primaryCh
                        ? buildChannelFavId(primaryCh.sourceUrl, primaryCh.label || 'Señal 1')
                        : '';
                      const isPrimarySaved = primaryFavId ? isChannelFavorited(primaryFavId) : false;

                      return (
                        <div
                          key={`${match.id}-${mIdx}`}
                          className="relative rounded-3xl overflow-hidden border border-white/[0.09] hover:border-white/25 bg-[#0D0F18] min-h-[160px] p-4 sm:p-5 flex flex-col justify-end gap-3 transition-colors min-w-0"
                        >
                          <img
                            src={matchBackdrop}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover object-center opacity-35"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/80 to-black/35" />

                          <div className="relative z-10 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-zinc-300 truncate flex items-center gap-1.5">
                                <span className="font-mono tabular-nums text-[#FB7185] font-bold">
                                  {match.time}
                                </span>
                                <span className="text-zinc-600" aria-hidden="true">
                                  ·
                                </span>
                                <span className="font-semibold text-zinc-300 truncate">
                                  {match.competition}
                                </span>
                              </div>
                              <h4 className="font-display font-bold text-base sm:text-lg text-white mt-1 line-clamp-2">
                                {match.title}
                              </h4>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isExtractingMatch && (
                                <Loader2 className="w-5 h-5 animate-spin text-[#E11D48]" />
                              )}
                              {primaryCh && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onToggleChannelFavorite({
                                      favId: primaryFavId,
                                      title: match.title,
                                      channelLabel: primaryCh.label || 'Señal 1',
                                      channelUrl: primaryCh.sourceUrl,
                                      competition: match.competition,
                                      sport: match.sport,
                                    });
                                  }}
                                  aria-label={pickLang(lang, {
                                    es: 'Guardar canal favorito',
                                    ca: 'Desar canal favorit',
                                    en: 'Save favorite channel',
                                  })}
                                  className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      isPrimarySaved
                                        ? 'fill-current text-amber-400'
                                        : 'text-zinc-300 hover:text-amber-300'
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 min-w-0">
                            {match.channels.slice(0, 6).map((ch, idx) => {
                              const activeCh = activeVideoRawUrl === ch.sourceUrl;
                              const label =
                                ch.label ||
                                pickLang(lang, {
                                  es: `Señal ${idx + 1}`,
                                  ca: `Senyal ${idx + 1}`,
                                  en: `Signal ${idx + 1}`,
                                });

                              return (
                                <button
                                  key={ch.id}
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onPlaySportsMatch(match, idx);
                                  }}
                                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                    activeCh
                                      ? 'bg-white text-[#050508]'
                                      : idx === 0
                                      ? 'bg-[#E11D48] hover:bg-[#F43F5E] text-white'
                                      : 'bg-black/65 hover:bg-black/85 text-zinc-100 backdrop-blur-xl border border-white/15'
                                  }`}
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 5: DEDICATED SYNCHRONIZED YOUTUBE PARTY HUB                */}
      {/* ================================================================== */}
      {activeSection === 'youtube' && (
        <div className="space-y-4">
          {loadingYt ? (
            <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-video rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : ytResults.length === 0 ? (
            <div className="py-12 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5">
              <Youtube className="w-8 h-8 text-[#E11D48] mx-auto mb-2" />
              <p className="text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'Busca cualquier vídeo o canal de YouTube',
                  ca: 'Cerca qualsevol vídeo o canal de YouTube',
                  en: 'Search any YouTube video or channel',
                })}
              </p>
            </div>
          ) : (
            <VirtualizedPosterGrid
              items={ytResults}
              variant="wide"
              estimateRowHeight={290}
              getKey={(vid) => vid.id}
              renderItem={(vid) => (
                <div className="group relative w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] hover:border-white/25 transition-colors flex flex-col h-full">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayYouTubeVideo(vid);
                    }}
                    aria-label={vid.title}
                    className="relative aspect-video w-full bg-black overflow-hidden cursor-pointer text-left"
                  >
                    <PosterImage
                      src={vid.thumbnail}
                      alt={vid.title}
                      aspect="video"
                      imgClassName="group-hover:scale-105 transition-transform duration-300"
                      fallbackTitle={vid.title}
                      fallbackIcon={<Youtube className="w-8 h-8 text-zinc-500" />}
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-mono tabular-nums font-bold text-white z-[2] pointer-events-none">
                      {vid.duration}
                    </div>
                  </button>

                  <div className="p-3 flex flex-col justify-between gap-2.5 flex-1">
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayYouTubeVideo(vid);
                        }}
                        className="text-left w-full font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug cursor-pointer hover:text-rose-300 transition-colors"
                      >
                        {vid.title}
                      </button>
                      <div className="text-[11px] text-zinc-400 truncate mt-1">
                        <span>{vid.channel}</span>
                        {vid.views && (
                          <>
                            <span className="mx-1 text-zinc-600">·</span>
                            <span>{vid.views}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayYouTubeVideo(vid);
                        }}
                        className="flex-1 min-h-[38px] px-3 rounded-xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {pickLang(lang, { es: 'Poner', ca: 'Posar', en: 'Play' })}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onAddToQueue({
                            kind: 'youtube',
                            title: vid.title,
                            subtitle: `YouTube · ${vid.channel}`,
                            poster: vid.thumbnail,
                            youtubeId: vid.videoId,
                            url: vid.url,
                          });
                        }}
                        className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' })}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 6: SHARED ROOM QUEUE + UNIVERSAL LINK & CLOUD BROWSER      */}
      {/* ================================================================== */}
      {activeSection === 'direct' && (
        <div className="space-y-5">
          <div className="rounded-3xl bg-[#121218]/95 nc-specular-surface border border-white/[0.09] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListVideo className="w-5 h-5 text-[#BF94FF]" />
                <h3 className="font-display font-semibold text-base sm:text-lg text-white">
                  {pickLang(lang, {
                    es: 'Cola Compartida de la Sala',
                    ca: 'Cua Compartida de la Sala',
                    en: 'Shared Room Queue',
                  })}{' '}
                  ({roomQueue.length})
                </h3>
              </div>

              {roomQueue.length >= 2 && onStartPollFromQueue && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onStartPollFromQueue();
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-all shadow-[0_6px_18px_rgba(145,70,255,0.3)]"
                >
                  <Vote className="w-4 h-4" />
                  <span>
                    {pickLang(lang, {
                      es: 'Lanzar Votación en Vivo (25s)',
                      ca: 'Llançar Votació en Directe (25s)',
                      en: 'Start Live Room Poll (25s)',
                    })}
                  </span>
                </button>
              )}
            </div>

            {roomQueue.length === 0 ? (
              <p className="text-xs sm:text-sm text-zinc-400">
                {pickLang(lang, {
                  es: 'Pulsa el botón "+" en cualquier película, capítulo o vídeo de YouTube para añadirlo a la cola.',
                  ca: 'Prem el botó "+" a qualsevol pel·lícula, capítol o vídeo de YouTube per afegir-lo a la cua.',
                  en: 'Tap "+" on any movie, episode, or YouTube video to queue it up.',
                })}
              </p>
            ) : (
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-2.5">
                {roomQueue.map((qItem) => (
                  <div
                    key={qItem.id}
                    className="rounded-2xl bg-white/[0.035] border border-white/[0.08] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">
                        {qItem.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {qItem.subtitle} ·{' '}
                        {pickLang(lang, { es: 'por', ca: 'per', en: 'by' })} {qItem.addedBy}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayQueueItem(qItem);
                        }}
                        className="min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Play' })}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFromQueue(qItem.id)}
                        aria-label={pickLang(lang, {
                          es: 'Eliminar de la cola',
                          ca: 'Eliminar de la cua',
                          en: 'Remove from queue',
                        })}
                        className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-[#121218]/95 nc-specular-surface border border-white/[0.09] p-5 sm:p-8 space-y-6">
            <div className="max-w-2xl space-y-1.5">
              <h3 className="font-display font-semibold text-lg sm:text-xl text-white">
                {t.directTitle}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">{t.directSub}</p>
            </div>

            <form onSubmit={handleDirectSubmit} className="space-y-3">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... | .m3u8 | .mp4"
                className="w-full h-12 px-4 rounded-2xl bg-white/[0.045] focus:bg-white/[0.075] border border-white/12 focus:border-[#9146FF]/70 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none font-mono transition-all"
              />
              <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  disabled={!customUrl.trim() || Boolean(loadingItemId)}
                  className="min-h-12 px-5 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 disabled:opacity-40 text-sm font-bold text-white flex items-center justify-center gap-2 transition-all shadow-[0_8px_24px_rgba(145,70,255,0.34)] whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t.playNativeBtn}</span>
                </button>
                <button
                  type="button"
                  disabled={!customUrl.trim()}
                  onClick={() => {
                    if (!customUrl.trim()) return;
                    triggerHaptic('medium');
                    onOpenCloudBrowser(customUrl.trim());
                  }}
                  className="min-h-12 px-5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 border border-white/10 text-sm font-semibold text-zinc-100 flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Tv className="w-4 h-4 text-zinc-300" />
                  <span>{t.openCloudBtn}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 7: TODO LO DISPONIBLE EN CASTELLANO (ESPAÑOL DE ESPAÑA)    */}
      {/* ================================================================== */}
      {activeSection === 'castellano' && (
        <div className="space-y-4">
          {loadingCastellano ? (
            <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 sm:gap-4">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : castellanoItems.length === 0 ? (
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-2">
              <p className="text-sm font-semibold text-white">
                {pickLang(lang, {
                  es: 'No se encontraron títulos para este filtro en Castellano.',
                  ca: 'No s’han trobat títols per a aquest filtre en Castellà.',
                  en: 'No Spanish-dubbed titles match this filter.',
                })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setCastellanoQuery('');
                  setCastellanoProvider('all');
                  setCastellanoCategory('trending');
                }}
                className="min-h-[42px] px-4 rounded-xl bg-white text-[#050508] text-xs font-bold cursor-pointer"
              >
                {pickLang(lang, {
                  es: 'Restablecer filtros',
                  ca: 'Restablir filtres',
                  en: 'Reset filters',
                })}
              </button>
            </div>
          ) : (
            <>
              <VirtualizedPosterGrid
                items={castellanoItems}
                variant="poster"
                getKey={(item) => item.id}
                renderItem={(item) => {
                  const isTv = item.mediaType === 'tv';
                  const saved = isBookmarked(item);
                  const openCastellanoItem = () => {
                    triggerHaptic('light');
                    if (isTv && item.tmdbId) {
                      setSeriesLangMode('ES');
                      openSeriesDetails(item.tmdbId, 1, { ...item, mediaType: 'tv' });
                    } else {
                      setPreviewItem({ ...item, mediaType: 'movie' });
                    }
                  };

                  return (
                    <div className="group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border border-white/[0.08] hover:border-amber-400/50 transition-colors">
                      <button
                        type="button"
                        onClick={openCastellanoItem}
                        aria-label={item.title}
                        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-amber-400"
                      />

                      <div className="absolute inset-0 z-[1] pointer-events-none">
                        <PosterImage
                          src={item.poster}
                          alt={item.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={item.title}
                          fallbackIcon={
                            isTv ? (
                              <Tv className="w-8 h-8 text-zinc-500" />
                            ) : (
                              <Film className="w-8 h-8 text-zinc-500" />
                            )
                          }
                        />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(item, e)}
                        aria-label={pickLang(lang, {
                          es: `Guardar ${item.title} en Mi Lista`,
                          ca: `Desar ${item.title} a la Meva Llista`,
                          en: `Save ${item.title} to My List`,
                        })}
                        className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center absolute top-2 right-2 z-10 cursor-pointer transition-colors"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            saved ? 'fill-current text-[#E11D48]' : 'text-zinc-200'
                          }`}
                        />
                      </button>

                      <div className="absolute inset-x-0 bottom-0 z-[2] pt-16 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent pointer-events-none">
                        <div className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-zinc-300 mt-1 flex items-center gap-1.5 whitespace-nowrap overflow-hidden tabular-nums">
                          <span className="text-amber-300 font-semibold">
                            {pickLang(lang, { es: 'Castellano', ca: 'Castellà', en: 'ES Dub' })}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {isTv
                              ? pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })
                              : pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Movie' })}
                          </span>
                          {item.year && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.year}</span>
                            </>
                          )}
                          {item.rating && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>★ {item.rating}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }}
              />

              {hasMoreCastellano && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreCastellano}
                    onClick={() => {
                      triggerHaptic('light');
                      setCastellanoPage((p) => p + 1);
                    }}
                    className="min-h-[46px] px-6 rounded-2xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/15 text-xs sm:text-sm font-bold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    {loadingMoreCastellano ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>
                      {pickLang(lang, {
                        es: 'Cargar más títulos en Castellano',
                        ca: 'Carregar més títols en Castellà',
                        en: 'Load more Spanish titles',
                      })}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 8: TOT L'ANIME EN CATALÀ EN UN SOL LLOC (`catala`)         */}
      {/* ================================================================== */}
      {activeSection === 'catala' && (
        <div className="space-y-5">
          {/* Live Catalan Channels Strip (SX3 Anime 24h, TV3, Esport3, 324) */}
          {(catalaCategory === 'all' || catalaCategory === 'live_tv') &&
            !debouncedCatalaQuery &&
            catalaLiveChannels.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white">
                    {pickLang(lang, {
                      es: 'Emisión en Directo en Catalán (SX3 · TV3 · 3Cat)',
                      ca: 'Emissió en Directe en Català (SX3 · TV3 · 3Cat)',
                      en: 'Live Catalan Channels (SX3 · TV3 · 3Cat)',
                    })}
                  </h3>
                </div>
                <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-4 gap-3">
                  {catalaLiveChannels.map((ch) => {
                    const chEpg = getChannelLiveEpg(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                        }}
                        className="min-h-[76px] p-3.5 rounded-2xl bg-[#0D0E15] hover:bg-[#141724] border border-white/[0.08] hover:border-rose-400/50 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center border border-white/15 font-display font-extrabold text-xs text-white"
                            style={{
                              background: `linear-gradient(145deg, ${ch.brandTone}40 0%, #090A10 100%)`,
                            }}
                          >
                            {ch.shortMark}
                          </div>
                          <div className="min-w-0">
                            <div className="font-display font-bold text-sm text-white truncate">
                              {ch.name}
                            </div>
                            {chEpg?.now ? (
                              <div className="text-xs text-zinc-300 truncate">
                                <span className="font-mono tabular-nums text-rose-300">
                                  {chEpg.now.startLabel}
                                </span>
                                <span className="mx-1 text-zinc-500">·</span>
                                <span>{chEpg.now.title}</span>
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-400 truncate">
                                {pickLang(lang, {
                                  es: 'Directo HD',
                                  ca: 'Directe HD',
                                  en: 'Live HD',
                                })}{' '}
                                · {ch.network}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="w-9 h-9 rounded-full bg-[#E11D48] text-white flex items-center justify-center shrink-0">
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

          {/* Catalan Anime Series & Movies Grid (Virtualized) */}
          {catalaCategory !== 'live_tv' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-sm sm:text-base text-white">
                  {pickLang(lang, {
                    es: 'Catálogo de Anime en Catalán (Pulsa para elegir temporada y capítulo)',
                    ca: "Catàleg d'Anime en Català (Prem per triar temporada i capítol)",
                    en: 'Catalan Anime Catalog (Tap to pick season & episode)',
                  })}
                </h3>
              </div>

              {loadingCatala ? (
                <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 sm:gap-4">
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                    />
                  ))}
                </div>
              ) : catalaItems.length === 0 ? (
                <div className="py-12 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-2">
                  <p className="text-sm font-semibold text-white">
                    {pickLang(lang, {
                      es: `No se encontraron resultados para «${debouncedCatalaQuery}».`,
                      ca: `No s'han trobat resultats per a «${debouncedCatalaQuery}».`,
                      en: `No results found for “${debouncedCatalaQuery}”.`,
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCatalaQuery('');
                      setCatalaCategory('all');
                    }}
                    className="min-h-[42px] px-4 rounded-xl bg-white text-[#050508] text-xs font-bold cursor-pointer"
                  >
                    {pickLang(lang, {
                      es: 'Ver todo el catálogo en catalán',
                      ca: 'Veure tot el catàleg en català',
                      en: 'View all Catalan catalog',
                    })}
                  </button>
                </div>
              ) : (
                <VirtualizedPosterGrid
                  items={catalaItems}
                  variant="poster"
                  getKey={(item) => item.id}
                  renderItem={(item) => (
                    <div className="group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border border-white/[0.08] hover:border-rose-400/55 transition-colors">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          openCatalaSeriesDetails(item, 1);
                        }}
                        aria-label={item.title}
                        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-rose-400"
                      />

                      <div className="absolute inset-0 z-[1] pointer-events-none">
                        <PosterImage
                          src={item.poster}
                          alt={item.title}
                          aspect="poster"
                          imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={item.title}
                          fallbackIcon={<Sparkles className="w-8 h-8 text-rose-400" />}
                        />
                      </div>

                      <div className="absolute inset-x-0 bottom-0 z-[2] pt-16 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent pointer-events-none">
                        <div className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-zinc-300 mt-1 line-clamp-1">
                          <span className="text-rose-300 font-semibold">
                            {pickLang(lang, { es: 'Catalán', ca: 'Català', en: 'Catalan' })}
                          </span>
                          <span className="mx-1 text-zinc-500">·</span>
                          <span>{item.episodeHint}</span>
                        </div>
                      </div>
                    </div>
                  )}
                />
              )}
            </section>
          )}

          {/* Community Portals & Reference Sources */}
          {catalaCommunityLinks.length > 0 && (
            <section className="pt-2 border-t border-white/[0.07] space-y-3">
              <h3 className="font-display font-semibold text-xs sm:text-sm text-zinc-300">
                {pickLang(lang, {
                  es: 'Fuentes y Comunidad de Anime en Catalán (Abrir en el navegador)',
                  ca: "Fonts i Comunitat d'Anime en Català (Obrir al navegador web)",
                  en: 'Catalan Anime Community Sources (Open in browser)',
                })}
              </h3>
              <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
                {catalaCommunityLinks.map((lnk) => (
                  <button
                    key={lnk.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onOpenCloudBrowser(lnk.url);
                    }}
                    className="min-h-[64px] p-3.5 rounded-2xl bg-[#0D0E15] hover:bg-white/[0.06] border border-white/[0.08] flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white truncate">
                        {lnk.label}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">{lnk.desc}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* REAL-TIME CHANNEL EPG DRAWER / MODAL (TDT · MOVISTAR+ · DAZN)      */}
      {/* ================================================================== */}
      {selectedEpgChannel &&
        (() => {
          const modalEpg = getChannelLiveEpg(selectedEpgChannel.id);
          const scheduleList = modalEpg?.upcoming || [];

          return (
            <div
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setSelectedEpgChannel(null)}
            >
              <div
                ref={epgModalRef}
                role="dialog"
                aria-modal="true"
                aria-label={selectedEpgChannel.name}
                tabIndex={-1}
                className="w-full sm:max-w-xl max-h-[86vh] rounded-t-3xl sm:rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.12] flex flex-col overflow-hidden shadow-2xl animate-sheet-up outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mobile Drag Handle */}
                <div className="sm:hidden w-10 h-1.5 bg-zinc-700 rounded-full mx-auto mt-3" />

                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-12 h-12 rounded-2xl shrink-0 flex flex-col items-center justify-center border border-white/15"
                      style={{
                        background: `linear-gradient(145deg, ${selectedEpgChannel.brandTone}38 0%, #090A10 100%)`,
                      }}
                    >
                      <span className="font-display font-extrabold text-xs text-white leading-none">
                        {selectedEpgChannel.shortMark}
                      </span>
                      <span className="mt-1 text-[10px] font-mono tabular-nums text-zinc-400 leading-none">
                        DIAL {selectedEpgChannel.dial}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-base sm:text-lg text-white truncate">
                        {selectedEpgChannel.name}
                      </h3>
                      <div className="text-xs text-zinc-400 truncate">
                        <span>
                          {pickLang(lang, {
                            es: 'Guía EPG en Tiempo Real',
                            ca: 'Guia EPG en Temps Real',
                            en: 'Real-Time EPG Guide',
                          })}
                        </span>
                        <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                          ·
                        </span>
                        <span>{selectedEpgChannel.network}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedEpgChannel(null)}
                    aria-label={pickLang(lang, {
                      es: 'Cerrar Guía EPG',
                      ca: 'Tancar Guia EPG',
                      en: 'Close EPG Guide',
                    })}
                    className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Schedule Scroll Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                  {scheduleList.length === 0 ? (
                    <div className="py-8 text-center space-y-2">
                      <Clock className="w-7 h-7 text-zinc-500 mx-auto" />
                      <p className="text-sm font-semibold text-white">
                        {selectedEpgChannel.description}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {loadingEpg
                          ? pickLang(lang, {
                              es: 'Sincronizando parrilla en directo...',
                              ca: 'Sincronitzant graella en directe...',
                              en: 'Syncing live TV guide...',
                            })
                          : pickLang(lang, {
                              es: 'Emisión continua 24/7 en directo disponible para reproducir ahora.',
                              ca: 'Emissió contínua 24/7 en directe disponible per reproduir ara.',
                              en: '24/7 continuous live broadcast ready to play now.',
                            })}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.07]">
                      {scheduleList.map((prog, idx) => {
                        const isCurrent =
                          prog.startMs <= epgClockMs && prog.stopMs > epgClockMs;

                        return (
                          <div
                            key={`${prog.startMs}-${idx}`}
                            className={`py-3.5 first:pt-0 last:pb-0 space-y-1.5 ${
                              isCurrent ? 'text-white' : 'text-zinc-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`font-mono tabular-nums font-semibold ${
                                    isCurrent ? 'text-rose-400' : 'text-zinc-400'
                                  }`}
                                >
                                  {prog.startLabel} – {prog.stopLabel}
                                </span>
                                {isCurrent && (
                                  <>
                                    <span className="text-zinc-600" aria-hidden="true">
                                      ·
                                    </span>
                                    <span className="font-semibold text-emerald-400">
                                      {pickLang(lang, {
                                        es: 'En emisión ahora',
                                        ca: 'En emissió ara',
                                        en: 'On Air Now',
                                      })}
                                    </span>
                                  </>
                                )}
                                {prog.category && (
                                  <>
                                    <span className="text-zinc-600" aria-hidden="true">
                                      ·
                                    </span>
                                    <span className="text-zinc-400 truncate">
                                      {prog.category}
                                    </span>
                                  </>
                                )}
                              </div>

                              {prog.rating && (
                                <span className="font-mono tabular-nums text-[11px] text-zinc-500 shrink-0">
                                  {prog.rating}
                                </span>
                              )}
                            </div>

                            <div className="font-display font-bold text-sm sm:text-[15px] text-white leading-snug">
                              {prog.title}
                            </div>

                            {isCurrent && modalEpg && (
                              <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                                <div
                                  className="h-full w-full bg-[#E11D48] rounded-full origin-left"
                                  style={{
                                    transform: `scaleX(${Math.max(
                                      0.04,
                                      Math.min(1, modalEpg.progressPct / 100)
                                    )})`,
                                  }}
                                />
                              </div>
                            )}

                            {prog.description && (
                              <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                                {prog.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sticky Bottom Action Bar */}
                <div className="p-4 border-t border-white/[0.08] bg-[#090A10] flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {selectedEpgChannel.channels.map((sig, sIdx) => {
                    const isPrimary = sIdx === 0;
                    return (
                      <button
                        key={sig.id}
                        type="button"
                        onClick={() => {
                          const target = selectedEpgChannel;
                          const hint = modalEpg?.now?.title;
                          setSelectedEpgChannel(null);
                          triggerHaptic('success');
                          onPlayTdtChannel(target, sIdx, hint);
                        }}
                        className={`min-h-[46px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          isPrimary
                            ? 'flex-1 bg-[#E11D48] hover:bg-[#BE123C] text-white'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          {isPrimary
                            ? pickLang(lang, {
                                es: `Ver ${selectedEpgChannel.name} en directo`,
                                ca: `Veure ${selectedEpgChannel.name} en directe`,
                                en: `Watch ${selectedEpgChannel.name} Live`,
                              })
                            : pickLang(lang, {
                                es: `Señal ${sIdx + 1}`,
                                ca: `Senyal ${sIdx + 1}`,
                                en: `Signal ${sIdx + 1}`,
                              })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    );
  };
