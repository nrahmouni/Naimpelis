import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
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
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  SlidersHorizontal,
  Wand2,
  Trophy,
} from 'lucide-react';
import {
  AppLanguage,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  CatalaCatalogItem,
  CatalaCommunityLink,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  ChannelLiveEpg,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
  EpgProgramItem,
  FavoriteChannelItem,
  FutbolChapasState,
  LiveScoreMatch,
  Participant,
  PartyColor,
  PartyGameState,
  PartyGameType,
  PinturilloGameState,
  PinturilloStroke,
  Pool8BallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
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
import type { RoomMatchResponsesState } from '../shared/protocol';
import { UI_COPY, pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { useFocusTrap } from '../utils/useFocusTrap';
import { PosterImage } from './ui/PosterImage';
import { BottomSheet, SegmentedControl } from './ui/DesignSystem';
import { VirtualizedPosterGrid } from './VirtualizedPosterGrid';
import { usePullToRefresh } from '../lib/viewTransition';
import type { CatalogGenreItem } from './ExpandedDiscoverySection';
import {
  buildChannelFavId,
  deduplicateWatchlist,
  getCatalogFavoriteKey,
  isSameCatalogItem,
  sanitizeItemKey,
} from '../utils/storage';
import { MediaDetailsModal } from './MediaDetailsModal';
import { LatestReleasesSection } from './LatestReleasesSection';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import type { PartyOnlineAction } from './PartyGamesStage';
import {
  ChannelLogoBadge,
  getChannelRegionMeta,
  getCategoryRegion,
  type TvRegionId,
} from './ui/ChannelLogoBadge';
import { FlagBadgeSvg, type FlagCode, MediaLanguageSelector } from './ui/LanguageBadge';

const FootballMatchboard = React.lazy(() =>
  import('./FootballMatchboard').then((m) => ({ default: m.FootballMatchboard }))
);
const ExpandedDiscoverySection = React.lazy(() =>
  import('./ExpandedDiscoverySection').then((m) => ({ default: m.ExpandedDiscoverySection }))
);
const GamesHubSection = React.lazy(() =>
  import('./GamesHubSection').then((m) => ({ default: m.GamesHubSection }))
);

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
  | 'direct'
  | 'games';

export type CatalogPillar = 'explore' | 'catalog' | 'anime' | 'live' | 'games' | 'mylist';

export function normalizeCatalogPillar(
  section: CatalogSection,
  showWatchlistOnly = false
): CatalogPillar {
  if (showWatchlistOnly || section === 'direct') return 'mylist';
  if (section === 'games') return 'games';
  if (section === 'home') return 'explore';
  if (section === 'anime' || section === 'catala') return 'anime';
  if (section === 'tdt' || section === 'sports' || section === 'youtube') return 'live';
  return 'catalog';
}

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
  { id: 'bein_arabic', es: 'beIN SPORTS (العربية)', ca: 'beIN SPORTS (العربية)', en: 'beIN SPORTS (Arabic)' },
  { id: 'marruecos', es: 'Marruecos (المغرب)', ca: 'Marroc (المغرب)', en: 'Morocco TV' },
  { id: 'documentales', es: 'Nat Geo y Documentales', ca: 'Nat Geo i Documentals', en: 'Nat Geo & Docs' },
  { id: 'usa_tv', es: 'EE.UU. (FOX / CNN)', ca: 'EUA (FOX / CNN)', en: 'USA (FOX / CNN)' },
  { id: 'europa_tv', es: 'Europa (BBC / Euronews)', ca: 'Europa (BBC / Euronews)', en: 'Europe (BBC / Euronews)' },
  { id: 'noticias_intl', es: 'Al Jazeera y Noticias', ca: 'Al Jazeera i Notícies', en: 'Al Jazeera & News' },
  { id: 'china_football', es: 'Fútbol China (中文)', ca: 'Futbol Xina (中文)', en: 'China Football (中文)' },
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

export interface TvFilterGroup {
  region: TvRegionId;
  flagCode: FlagCode;
  name: { es: string; ca: string; en: string };
  sub: { es: string; ca: string; en: string };
  categories: {
    id: 'all' | 'tdt_all' | TdtCategory;
    es: string;
    ca: string;
    en: string;
  }[];
}

export const TV_FILTER_GROUPS: TvFilterGroup[] = [
  {
    region: 'es',
    flagCode: 'es',
    name: { es: 'España', ca: 'Espanya', en: 'Spain' },
    sub: {
      es: 'TDT Nacional, Movistar Plus+ y DAZN',
      ca: 'TDT Nacional, Movistar Plus+ i DAZN',
      en: 'National DTT, Movistar+ & DAZN',
    },
    categories: [
      { id: 'generalistas', es: 'Generalistas (1–6)', ca: 'Generalistes (1–6)', en: 'Main Channels (1–6)' },
      { id: 'movistar', es: 'Movistar Plus+', ca: 'Movistar Plus+', en: 'Movistar Plus+' },
      { id: 'dazn', es: 'DAZN España', ca: 'DAZN Espanya', en: 'DAZN Spain' },
      { id: 'cine_series', es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Movies & Series' },
      { id: 'entretenimiento', es: 'Entretenimiento', ca: 'Entreteniment', en: 'Entertainment' },
      { id: 'noticias_deportes', es: '24h y Deportes', ca: '24h i Esports', en: 'News & Sports' },
      { id: 'infantil_autonomicas', es: 'Infantil y Autonómicas', ca: 'Infantil i Autonòmiques', en: 'Kids & Regional' },
    ],
  },
  {
    region: 'ar',
    flagCode: 'qa',
    name: { es: 'beIN Árabe y Noticias MENA', ca: 'beIN Àrab i Notícies MENA', en: 'beIN Arabic & MENA News' },
    sub: {
      es: 'beIN SPORTS 1–9 العربية · Al Jazeera · Al Arabiya · Sky News',
      ca: 'beIN SPORTS 1–9 العربية · Al Jazeera · Al Arabiya · Sky News',
      en: 'beIN SPORTS 1–9 Arabic · Al Jazeera · Al Arabiya · Sky News',
    },
    categories: [
      { id: 'bein_arabic', es: 'beIN SPORTS (العربية 1–9)', ca: 'beIN SPORTS (العربية 1–9)', en: 'beIN SPORTS (Arabic 1–9)' },
      { id: 'noticias_intl', es: 'Al Jazeera · Al Arabiya · Noticias', ca: 'Al Jazeera · Al Arabiya · Notícies', en: 'Al Jazeera · Al Arabiya · News' },
    ],
  },
  {
    region: 'ma',
    flagCode: 'ma',
    name: { es: 'Marruecos (المغرب)', ca: 'Marroc (المغرب)', en: 'Morocco (المغرب)' },
    sub: {
      es: 'Al Aoula, Arryadia, 2M Maroc, Medi 1 TV y SNRT en directo',
      ca: 'Al Aoula, Arryadia, 2M Maroc, Medi 1 TV i SNRT en directe',
      en: 'Al Aoula, Arryadia, 2M Maroc, Medi 1 TV & SNRT Live',
    },
    categories: [
      { id: 'marruecos', es: 'Canales de Marruecos (SNRT · 2M · Medi 1)', ca: 'Canals del Marroc (SNRT · 2M · Medi 1)', en: 'Morocco Channels (SNRT · 2M · Medi 1)' },
    ],
  },
  {
    region: 'docs',
    flagCode: 'docs',
    name: { es: 'Documentales y Ciencia', ca: 'Documentals i Ciència', en: 'Documentaries & Science' },
    sub: {
      es: 'National Geographic, Nat Geo Wild, Discovery, History y Naturaleza',
      ca: 'National Geographic, Nat Geo Wild, Discovery, History i Natura',
      en: 'National Geographic, Nat Geo Wild, Discovery, History & Nature',
    },
    categories: [
      { id: 'documentales', es: 'National Geographic · Discovery · History', ca: 'National Geographic · Discovery · History', en: 'National Geographic · Discovery · History' },
    ],
  },
  {
    region: 'us',
    flagCode: 'us',
    name: { es: 'Estados Unidos (USA)', ca: 'Estats Units (EUA)', en: 'United States (USA)' },
    sub: {
      es: 'FOX, FOX News, FOX Sports 1, CNN, ABC, CBS, NBC y Bloomberg',
      ca: 'FOX, FOX News, FOX Sports 1, CNN, ABC, CBS, NBC i Bloomberg',
      en: 'FOX, FOX News, FOX Sports 1, CNN, ABC, CBS, NBC & Bloomberg',
    },
    categories: [
      { id: 'usa_tv', es: 'Canales EE.UU. (FOX · CNN · NBC · ABC)', ca: 'Canals EUA (FOX · CNN · NBC · ABC)', en: 'US TV (FOX · CNN · NBC · ABC)' },
    ],
  },
  {
    region: 'eu',
    flagCode: 'eu',
    name: { es: 'Europa', ca: 'Europa', en: 'Europe' },
    sub: {
      es: 'BBC News, Euronews, France 24, DW, BFM TV, ARD, RAI y RTP',
      ca: 'BBC News, Euronews, France 24, DW, BFM TV, ARD, RAI i RTP',
      en: 'BBC News, Euronews, France 24, DW, BFM TV, ARD, RAI & RTP',
    },
    categories: [
      { id: 'europa_tv', es: 'Canales Europeos (BBC · Euronews · RAI · DW)', ca: 'Canals Europeus (BBC · Euronews · RAI · DW)', en: 'European Channels (BBC · Euronews · RAI · DW)' },
    ],
  },
  {
    region: 'latam',
    flagCode: 'lat',
    name: { es: 'Latam e Internacional', ca: 'Latam i Internacional', en: 'LatAm & International' },
    sub: {
      es: 'En Español (Sudamérica & Caribe)',
      ca: 'En Espanyol (Sud-amèrica & Carib)',
      en: 'Spanish audio (ESPN, DSports, beIN)',
    },
    categories: [
      { id: 'espn', es: 'ESPN (1–7)', ca: 'ESPN (1–7)', en: 'ESPN (1–7)' },
      { id: 'dsports', es: 'DSports (DirecTV)', ca: 'DSports (DirecTV)', en: 'DSports (DirecTV)' },
      { id: 'beinsports', es: 'beIN SPORTS', ca: 'beIN SPORTS', en: 'beIN SPORTS' },
      { id: 'tnt_space', es: 'TNT y Space', ca: 'TNT i Space', en: 'TNT & Space' },
    ],
  },
  {
    region: 'uk',
    flagCode: 'uk',
    name: { es: 'Reino Unido (EN)', ca: 'Regne Unit (EN)', en: 'United Kingdom (English)' },
    sub: {
      es: 'Audio original en inglés (Sky Sports, Eurosport)',
      ca: 'Àudio original en anglès (Sky Sports, Eurosport)',
      en: 'Original English audio (Sky Sports, Eurosport)',
    },
    categories: [
      { id: 'uk_sports', es: 'UK Sports (Sky Sports & Eurosport)', ca: 'UK Sports (Sky Sports & Eurosport)', en: 'UK Sports (Sky Sports & Eurosport)' },
    ],
  },
  {
    region: 'cn',
    flagCode: 'cn',
    name: { es: 'China (中文)', ca: 'Xina (中文)', en: 'China (中文)' },
    sub: {
      es: 'Fútbol y deportes en chino (CCTV5, Guangdong)',
      ca: 'Futbol i esports en xinès (CCTV5, Guangdong)',
      en: 'Sports in Chinese (CCTV5, Guangdong)',
    },
    categories: [
      { id: 'china_football', es: 'Fútbol China (CCTV5 · CCTV5+ · GD)', ca: 'Futbol Xina (CCTV5 · CCTV5+ · GD)', en: 'China Sports (CCTV5 & GD)' },
    ],
  },
];

const MOVIE_SORT_OPTIONS = [
  { id: 'trending', es: 'Tendencias', ca: 'Tendències', en: 'Trending' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' },
  { id: 'now_playing', es: 'Estrenos Recientes', ca: 'Estrenes Recents', en: 'New Releases' },
] as const;

const MOVIE_GENRES = [
  { id: 'anime', es: 'Anime', ca: 'Anime', en: 'Anime' },
  { id: 'action', es: 'Acción', ca: 'Acció', en: 'Action' },
  { id: 'scifi', es: 'Sci-Fi', ca: 'Ciència-ficció', en: 'Sci-Fi' },
  { id: 'horror', es: 'Terror', ca: 'Terror', en: 'Horror' },
  { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
  { id: 'animation', es: 'Animación', ca: 'Animació', en: 'Animation' },
  { id: 'thriller', es: 'Thriller', ca: 'Thriller', en: 'Thriller' },
  { id: 'adventure', es: 'Aventura', ca: 'Aventura', en: 'Adventure' },
  { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
] as const;

const SERIES_SORT_OPTIONS = [
  { id: 'trending', es: 'Tendencias TV', ca: 'Tendències TV', en: 'Trending TV' },
  { id: 'popular', es: 'Populares', ca: 'Populars', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' },
] as const;

const SERIES_GENRES = [
  { id: 'anime', es: 'Anime', ca: 'Anime', en: 'Anime' },
  { id: 'scifi', es: 'Sci-Fi y Fantasía', ca: 'Ciència-ficció i Fantasia', en: 'Sci-Fi & Fantasy' },
  { id: 'action', es: 'Acción y Aventura', ca: 'Acció i Aventura', en: 'Action & Adventure' },
  { id: 'drama', es: 'Drama', ca: 'Drama', en: 'Drama' },
  { id: 'crime', es: 'Crimen', ca: 'Crim', en: 'Crime' },
  { id: 'comedy', es: 'Comedia', ca: 'Comèdia', en: 'Comedy' },
  { id: 'animation', es: 'Animación', ca: 'Animació', en: 'Animation' },
  { id: 'mystery', es: 'Misterio', ca: 'Misteri', en: 'Mystery' },
] as const;

const YOUTUBE_QUICK_TOPICS = [
  {
    labelEs: 'Resúmenes LaLiga y Champions',
    labelCa: 'Resums LaLiga i Champions',
    labelEn: 'Football Highlights',
    labelZh: '西语/欧冠足球集锦',
    q: 'resumen partido laliga champions highlights hd',
  },
  {
    labelEs: 'Tráilers Cine 4K',
    labelCa: 'Tràilers Cinema 4K',
    labelEn: '4K Movie Trailers',
    labelZh: '4K 电影预告片',
    q: 'official movie trailer 2025 4k',
  },
  {
    labelEs: 'Música y Videoclips',
    labelCa: 'Música i Videoclips',
    labelEn: 'Music Videos',
    labelZh: '热门音乐与 MV',
    q: 'latin hits music video oficial',
  },
  {
    labelEs: 'F1 y Motorsport',
    labelCa: 'F1 i Motorsport',
    labelEn: 'F1 Highlights',
    labelZh: 'F1 赛车集锦',
    q: 'formula 1 race highlights official',
  },
  {
    labelEs: 'Comedia y Stand-Up',
    labelCa: 'Comèdia i Stand-Up',
    labelEn: 'Stand-Up Comedy',
    labelZh: '单口喜剧专场',
    q: 'monologos comedia stand up español',
  },
  {
    labelEs: 'Lo-Fi Chill Room',
    labelCa: 'Lo-Fi Chill Room',
    labelEn: 'Lo-Fi Beats',
    labelZh: 'Lo-Fi 放松音乐',
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
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
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
  currentUser?: Participant;
  participants?: Participant[];
  roomBoardGame?: BoardGameState | null;
  roomPartyGame?: PartyGameState | null;
  roomPinturilloGame?: PinturilloGameState | null;
  roomPoolGame?: Pool8BallState | null;
  roomChapasGame?: FutbolChapasState | null;
  matchResponses?: RoomMatchResponsesState | null;
  gameMoveError?: string | null;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  requestedGameOpen?: { gameType: 'pool' | 'chapas' | 'headsoccer' | 'poker' | 'blackjack' | 'parchis' | 'uno' | 'pinturillo' | 'chess' | 'checkers' | 'connect4'; seq: number } | null;
  onSelectedGameChange?: (game: 'pool' | 'chapas' | 'headsoccer' | 'poker' | 'blackjack' | 'parchis' | 'uno' | 'pinturillo' | 'chess' | 'checkers' | 'connect4' | null) => void;
  onStartRoomBoardGame?: (
    gt: BoardGameType,
    soloLocal?: boolean,
    clockMinutes?: BoardClockMinutes
  ) => void;
  onJoinBoardSeat?: (side: 'w' | 'b' | 'spectate') => void;
  onStartBoardMatch?: () => void;
  onMoveBoardGame?: (from: BoardCoord, to: BoardCoord, promo?: ChessPromotionPiece) => void;
  onResignBoardGame?: () => void;
  onResetBoardGame?: (opts?: {
    gameType?: BoardGameType;
    swapColors?: boolean;
    clockMinutes?: BoardClockMinutes;
  }) => void;
  onCloseBoardGame?: () => void;
  onStartRoomPartyGame?: (gt: PartyGameType) => void;
  onRoomPartyAction?: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  onCloseRoomPartyGame?: () => void;
  onStartRoomPinturillo?: () => void;
  onStartPinturilloMatch?: () => void;
  onPinturilloPickWord?: (wordId: string) => void;
  onPinturilloStroke?: (stroke: PinturilloStroke) => void;
  onPinturilloUndo?: () => void;
  onPinturilloClear?: () => void;
  onPinturilloGuess?: (text: string) => void;
  onPinturilloRematch?: () => void;
  onCloseRoomPinturillo?: () => void;
  onStartRoomPool?: (difficulty?: PoolDifficulty) => void;
  onStartPoolMatch?: () => void;
  onPoolJoinSeat?: (seatIndex: 0 | 1 | 'spectate') => void;
  onPoolCallPocket?: (pocketId: PoolPocketId) => void;
  onPoolPlaceCue?: (x: number, y: number) => void;
  onPoolTakeShot?: (shot: PoolShotInput) => void;
  onPoolSyncChecksum?: (turnNumber: number, checksum: number) => void;
  onPoolForfeit?: () => void;
  onPoolRematch?: () => void;
  onCloseRoomPool?: () => void;
  onStartRoomChapas?: (opts?: { botsEnabled?: boolean }) => void;
  onChapasJoinSeat?: (seatIndex: 0 | 1 | 2 | 3 | 'spectate') => void;
  onChapasUpdateTeam?: (team: ChapasTeamId, flag: ChapasFlagId) => void;
  onChapasToggleBots?: (botsEnabled: boolean) => void;
  onChapasStartMatch?: () => void;
  onChapasShoot?: (shot: ChapasShotInput) => void;
  onChapasForfeit?: () => void;
  onChapasRematch?: () => void;
  onCloseRoomChapas?: () => void;
  onSearchWithAi?: (query: string, mediaType?: 'all' | 'movie' | 'tv') => void;
  onOpenSurpriseMe?: () => void;
  worldMode?: 'cine' | 'futbol' | 'tv' | 'youtube';
  externalSearchQuery?: string;
  onExternalSearchChange?: (val: string) => void;
  cineTab?: 'movies' | 'series';
  onCineTabChange?: (tab: 'movies' | 'series') => void;
  cineCastellano?: boolean;
  onCineCastellanoChange?: (enabled: boolean) => void;
  futbolTab?: 'matches' | 'channels';
  onFutbolTabChange?: (tab: 'matches' | 'channels') => void;
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  onChangeSection,
  lang,
  userName: _userName,
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
  onClearHistory: _onClearHistory,
  onPlaySportsMatch,
  onPlayTdtChannel,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onAddToQueue,
  onRemoveFromQueue: _onRemoveFromQueue,
  onPlayQueueItem: _onPlayQueueItem,
  onStartPollFromQueue: _onStartPollFromQueue,
  onPlaySecondaryChannel,
  showWatchlistOnly: controlledWatchlistOnly,
  onWatchlistOnlyChange,
  currentUser,
  participants = [],
  roomBoardGame = null,
  roomPartyGame = null,
  roomPinturilloGame = null,
  roomPoolGame = null,
  roomChapasGame = null,
  matchResponses = null,
  gameMoveError = null,
  isHost = false,
  voiceChat,
  requestedGameOpen = null,
  onSelectedGameChange,
  onStartRoomBoardGame,
  onJoinBoardSeat,
  onStartBoardMatch,
  onMoveBoardGame,
  onResignBoardGame,
  onResetBoardGame,
  onCloseBoardGame,
  onStartRoomPartyGame,
  onRoomPartyAction,
  onCloseRoomPartyGame,
  onStartRoomPinturillo,
  onStartPinturilloMatch,
  onPinturilloPickWord,
  onPinturilloStroke,
  onPinturilloUndo,
  onPinturilloClear,
  onPinturilloGuess,
  onPinturilloRematch,
  onCloseRoomPinturillo,
  onStartRoomPool,
  onStartPoolMatch,
  onPoolJoinSeat,
  onPoolCallPocket,
  onPoolPlaceCue,
  onPoolTakeShot,
  onPoolSyncChecksum,
  onPoolForfeit,
  onPoolRematch,
  onCloseRoomPool,
  onStartRoomChapas,
  onChapasJoinSeat,
  onChapasUpdateTeam,
  onChapasToggleBots,
  onChapasStartMatch,
  onChapasShoot,
  onChapasForfeit,
  onChapasRematch,
  onCloseRoomChapas,
  onSearchWithAi,
  onOpenSurpriseMe,
  worldMode,
  externalSearchQuery,
  onExternalSearchChange,
  cineTab: controlledCineTab,
  onCineTabChange,
  cineCastellano: controlledCineCastellano,
  onCineCastellanoChange,
  futbolTab: controlledFutbolTab,
  onFutbolTabChange,
}) => {
  const t = UI_COPY[lang];

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

  // Inicio (Home) unified discovery filters
  const [showHomeFilters, setShowHomeFilters] = useState(false);
  const [homeMediaFilter, setHomeMediaFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [homeGenreId, setHomeGenreId] = useState<number | null>(null);
  const [homeProvider, setHomeProvider] = useState<string>('all');
  const [homeSortBy, setHomeSortBy] = useState<
    'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc'
  >('popularity.desc');
  const [discoveryGenres, setDiscoveryGenres] = useState<CatalogGenreItem[]>([]);
  const heroTouchStartXRef = useRef<number | null>(null);

  // Universal Search & Showcase on Home
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

  // Movies & VO state (Sort & Genre separated)
  const [movieQuery, setMovieQuery] = useState('');
  const [debouncedMovieQuery, setDebouncedMovieQuery] = useState('');
  const [movieSort, setMovieSort] = useState<string>('trending');
  const [movieGenre, setMovieGenre] = useState<string>('');
  const [moviePage, setMoviePage] = useState<number>(1);
  const [hasMoreMovies, setHasMoreMovies] = useState<boolean>(false);
  const [movies, setMovies] = useState<CatalogMovie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
  const [spotlightImgFailed, setSpotlightImgFailed] = useState(false);

  // TV Series state (default VOSE; Sort & Genre separated)
  const [seriesQuery, setSeriesQuery] = useState('');
  const [debouncedSeriesQuery, setDebouncedSeriesQuery] = useState('');
  const [seriesSort, setSeriesSort] = useState<string>('trending');
  const [seriesGenre, setSeriesGenre] = useState<string>('');
  const [seriesLangMode, setSeriesLangMode] = useState<'ES' | 'LAT' | 'VOSE' | 'EN'>('VOSE');
  const [seriesPage, setSeriesPage] = useState<number>(1);
  const [hasMoreSeries, setHasMoreSeries] = useState<boolean>(false);
  const [seriesList, setSeriesList] = useState<CatalogMovie[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingMoreSeries, setLoadingMoreSeries] = useState(false);
  const [seriesSpotlightImgFailed, setSeriesSpotlightImgFailed] = useState(false);

  // Instant Series -> Season -> Episode Modal state
  const [selectedSeries, setSelectedSeries] = useState<TvSeriesDetails | null>(null);
  const [seriesModalLang, setSeriesModalLang] = useState<string>('ES');
  const [forceSpanishSeriesActive, setForceSpanishSeriesActive] = useState(false);
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
  const [tvRegion, setTvRegion] = useState<TvRegionId>('all');
  const [tvFavOnly, setTvFavOnly] = useState<boolean>(false);
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
    | 'all'
    | 'bein_arabic'
    | 'china_football'
    | 'uk_sports'
    | 'beinsports'
    | 'espn'
    | 'dsports'
    | 'tnt_space'
    | 'movistar'
    | 'dazn'
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

  // World Mode state (mobile-first Entrada -> Mundos architecture)
  const [internalCineTab, setInternalCineTab] = useState<'movies' | 'series'>('movies');
  const effectiveCineTab: 'movies' | 'series' = controlledCineTab ?? internalCineTab;
  const setEffectiveCineTab = (tab: 'movies' | 'series') => {
    setInternalCineTab(tab);
    onCineTabChange?.(tab);
  };

  const [internalCineCastellano, setInternalCineCastellano] = useState(false);
  const effectiveCineCastellano = controlledCineCastellano ?? internalCineCastellano;
  const setEffectiveCineCastellano = (enabled: boolean) => {
    setInternalCineCastellano(enabled);
    onCineCastellanoChange?.(enabled);
  };

  const [internalFutbolTab, setInternalFutbolTab] = useState<'matches' | 'channels'>('matches');
  const effectiveFutbolTab = controlledFutbolTab ?? internalFutbolTab;
  const setEffectiveFutbolTab = (tab: 'matches' | 'channels') => {
    setInternalFutbolTab(tab);
    onFutbolTabChange?.(tab);
  };

  const [cineSpecialPortal, setCineSpecialPortal] = useState<'none' | 'catala'>('none');
  const [cineFiltersOpen, setCineFiltersOpen] = useState(false);
  const [cineAudioOverride, setCineAudioOverride] = useState<'ES' | 'VOSE' | 'EN'>('VOSE');
  const [futbolFiltersOpen, setFutbolFiltersOpen] = useState(false);
  const [futbolLangFilter, setFutbolLangFilter] = useState<'all' | 'ZH'>('all');
  const [futbolLeagueFilter, setFutbolLeagueFilter] = useState<string>('');
  const [tvFiltersOpen, setTvFiltersOpen] = useState(false);

  // Sync external search query driven by WorldShell header
  useEffect(() => {
    if (externalSearchQuery === undefined) return;
    if (worldMode === 'cine') {
      setHomeQuery(externalSearchQuery);
      setMovieQuery(externalSearchQuery);
      setSeriesQuery(externalSearchQuery);
      setCatalaQuery(externalSearchQuery);
    } else if (worldMode === 'futbol') {
      setSportsSearch(externalSearchQuery);
    } else if (worldMode === 'tv') {
      setTdtSearch(externalSearchQuery);
    } else if (worldMode === 'youtube') {
      setYtQuery(externalSearchQuery);
    }
  }, [externalSearchQuery, worldMode]);

  // Reset platform/category focus cleanly whenever returning to Home or switching sections
  useEffect(() => {
    setShowSectionFilters(false);
    setShowSectionSearch(false);
    if (activeSection === 'home' && !worldMode) {
      setTdtCategory('all');
      setEpgFilter('all');
      setShowWatchlistOnly(false);
    }
  }, [activeSection, worldMode]);

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
      worldMode === 'tv' ||
      activeSection === 'home' ||
      activeSection === 'tdt' ||
      activeSection === 'catala';
    if (!needsEpg) return;

    fetchLiveEpg(false);
    const refreshTimer = setInterval(() => {
      fetchLiveEpg(false);
    }, 180000);
    return () => clearInterval(refreshTimer);
  }, [worldMode, activeSection, fetchLiveEpg]);

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
      (worldMode === 'tv' ||
        worldMode === 'futbol' ||
        activeSection === 'home' ||
        activeSection === 'tdt' ||
        activeSection === 'sports') &&
      tdtChannels.length === 0
    ) {
      fetchTdtCatalog();
    }
  }, [worldMode, activeSection, tdtChannels.length]);

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

  // Execute Universal Search on Home / Cine when user types
  useEffect(() => {
    const activeForHomeSearch = worldMode === 'cine' || activeSection === 'home';
    if (!activeForHomeSearch || debouncedHomeQuery.length < 2) {
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
  }, [worldMode, activeSection, debouncedHomeQuery]);

  // Fetch Movies (Spanish Cinema OR Full VO/English Catalog across unified catalog)
  useEffect(() => {
    const inCineMovies =
      worldMode === 'cine' && effectiveCineTab === 'movies' && cineSpecialPortal === 'none';
    const shouldFetch =
      inCineMovies || activeSection === 'movies' || activeSection === 'vose';
    if (!shouldFetch) return;
    if (showWatchlistOnly) return;

    let cancelled = false;
    if (moviePage === 1) {
      setLoadingMovies(true);
      setSpotlightImgFailed(false);
    } else {
      setLoadingMoreMovies(true);
    }

    const activeCatParam = movieGenre || movieSort;
    const useVose =
      activeSection === 'vose' ||
      (worldMode === 'cine' && !effectiveCineCastellano && cineAudioOverride === 'EN');
    const endpoint = useVose
      ? `/api/catalog/bingetrix?provider=all&category=${encodeURIComponent(
          activeCatParam
        )}&sort=${encodeURIComponent(movieSort)}&page=${moviePage}&query=${encodeURIComponent(
          debouncedMovieQuery
        )}`
      : `/api/catalog/movies?provider=all&category=${encodeURIComponent(
          activeCatParam
        )}&sort=${encodeURIComponent(movieSort)}&page=${moviePage}&query=${encodeURIComponent(
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
    worldMode,
    effectiveCineTab,
    effectiveCineCastellano,
    cineAudioOverride,
    cineSpecialPortal,
    activeSection,
    movieSort,
    movieGenre,
    moviePage,
    debouncedMovieQuery,
    showWatchlistOnly,
  ]);

  // Fetch TV Series Catalog (in ES or VO/EN)
  useEffect(() => {
    const inCineSeries =
      worldMode === 'cine' && effectiveCineTab === 'series' && cineSpecialPortal === 'none';
    if (!inCineSeries && activeSection !== 'series') return;
    let cancelled = false;
    if (seriesPage === 1) {
      setLoadingSeries(true);
      setSeriesSpotlightImgFailed(false);
    } else {
      setLoadingMoreSeries(true);
    }

    const activeCatParam = seriesGenre || seriesSort;
    const apiLang =
      !effectiveCineCastellano && (seriesLangMode === 'EN' || seriesLangMode === 'VOSE')
        ? 'en'
        : 'es';
    fetch(
      `/api/catalog/series?provider=all&category=${encodeURIComponent(
        activeCatParam
      )}&sort=${encodeURIComponent(seriesSort)}&page=${seriesPage}&lang=${apiLang}&query=${encodeURIComponent(
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
    worldMode,
    effectiveCineTab,
    effectiveCineCastellano,
    cineSpecialPortal,
    activeSection,
    seriesSort,
    seriesGenre,
    seriesPage,
    seriesLangMode,
    debouncedSeriesQuery,
  ]);

  // Instant 2-Step Series -> Temporada -> Capítulo Loader (Opens Modal in 0ms + Non-Blocking Language Check)
  const openSeriesDetails = (
    tmdbId: number,
    seasonNum = 1,
    seedShow?: Partial<CatalogMovie>,
    forceSpanishProbe = false
  ) => {
    const reqSeq = ++seriesFetchSeqRef.current;
    setLoadingSeriesDetails(true);
    setEpisodeSearchQuery('');
    setEpisodeSortDesc(false);
    setEpisodeRangeStart(0);
    if (forceSpanishProbe) {
      setSeriesModalLang('ES');
      setForceSpanishSeriesActive(true);
    } else if (!selectedSeries || selectedSeries.tmdbId !== tmdbId) {
      setSeriesModalLang(seriesLangMode === 'EN' || seriesLangMode === 'VOSE' ? seriesLangMode : 'ES');
      setForceSpanishSeriesActive(false);
    }

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

    const apiLang = forceSpanishProbe ? 'es' : lang === 'en' ? 'en' : 'es';
    fetch(
      `/api/catalog/tv/${tmdbId}?season=${seasonNum}&lang=${apiLang}${
        forceSpanishProbe ? '&force=1&forceSpanish=1' : ''
      }`
    )
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

          // If languages already cached in response (and not forcing Spanish re-probe), apply them; otherwise probe asynchronously
          if (
            !forceSpanishProbe &&
            Array.isArray(nextSeries.availableLanguages) &&
            nextSeries.availableLanguages.length > 0
          ) {
            setProbingSeriesLangs(false);
            const avail = nextSeries.availableLanguages;
            setSeriesModalLang((prev) =>
              avail.includes('ES' as any) ? 'ES' : avail.includes(prev as any) ? prev : avail[0]
            );
          } else {
            setProbingSeriesLangs(true);
            const firstEp = nextSeries.episodes[0]?.episodeNumber || 1;
            fetch(
              `/api/catalog/tv/${tmdbId}/languages?season=${nextSeries.activeSeason}&episode=${firstEp}&title=${encodeURIComponent(
                nextSeries.title || ''
              )}&origTitle=${encodeURIComponent(nextSeries.originalTitle || '')}${
                forceSpanishProbe ? '&force=1&forceSpanish=1' : ''
              }`
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
                  setSeriesModalLang((prev) =>
                    forceSpanishProbe
                      ? avail.includes('ES' as any)
                        ? 'ES'
                        : avail[0]
                      : avail.includes('ES' as any)
                      ? 'ES'
                      : avail.includes(prev as any)
                      ? prev
                      : avail[0]
                  );
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
    if (worldMode !== 'futbol' && activeSection !== 'sports') return;
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
  }, [worldMode, activeSection]);

  // Fetch YouTube Search Results
  useEffect(() => {
    if (worldMode !== 'youtube' && activeSection !== 'youtube') return;
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
  }, [worldMode, activeSection, debouncedYtQuery]);

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
    const inCineCatala = worldMode === 'cine' && cineSpecialPortal === 'catala';
    if (!inCineCatala && activeSection !== 'catala') return;
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
  }, [worldMode, cineSpecialPortal, activeSection, catalaCategory, debouncedCatalaQuery]);

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
      'bein_arabic',
      'china_football',
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'movistar',
      'dazn',
    ]);
    return tdtChannels.filter((ch) => {
      const isExtraSportCh = ch.id === 'ma-arryadia' || ch.id === 'us-fox-sports1';
      if (!allowedCats.has(ch.category) && !isExtraSportCh) return false;
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
          /cctv|china|chino|zh|guangdong|fengyun|xinshijue|tianjin|sky|uk|premier|eurosport|mutv|talksport|fifa|bein|arab|arabe|arryadia|maroc|marruecos|fox|espn|dsport|directv|tnt|space|movistar|dazn|laliga|campeones|vamos|f1|motor|fight/i.test(
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
    if (tvFavOnly) {
      const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
      if (!isChannelFavorited(favId)) return false;
    }

    if (tvRegion !== 'all') {
      const reg = getChannelRegionMeta(ch);
      if (reg.region !== tvRegion) return false;
    }

    if (tdtCategory === 'tdt_all') {
      if (
        ch.category === 'movistar' ||
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'china_football' ||
        ch.category === 'beinsports' ||
        ch.category === 'bein_arabic' ||
        ch.category === 'marruecos' ||
        ch.category === 'documentales' ||
        ch.category === 'usa_tv' ||
        ch.category === 'europa_tv' ||
        ch.category === 'noticias_intl' ||
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
        ch.category === 'china_football' ||
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

  const tvCategoryCounts = React.useMemo(() => {
    const perCategory: Record<string, number> = {};
    const perRegion: Record<string, number> = {};
    for (const ch of tdtChannels) {
      perCategory[ch.category] = (perCategory[ch.category] || 0) + 1;
      const reg = getChannelRegionMeta(ch).region;
      perRegion[reg] = (perRegion[reg] || 0) + 1;
    }
    return { perCategory, perRegion };
  }, [tdtChannels]);

  const footballNetworkCounts = React.useMemo(() => {
    const allowedCats = new Set([
      'bein_arabic',
      'china_football',
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'movistar',
      'dazn',
    ]);
    const counts: Record<string, number> = { all: 0 };
    for (const ch of tdtChannels) {
      const isExtraSportCh = ch.id === 'ma-arryadia' || ch.id === 'us-fox-sports1';
      if (!allowedCats.has(ch.category) && !isExtraSportCh) continue;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        continue;
      }
      counts.all += 1;
      counts[ch.category] = (counts[ch.category] || 0) + 1;
    }
    return counts;
  }, [tdtChannels]);

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
        aria-label={pickLang(lang, { es: 'Continuar viendo', ca: 'Continuar veient', en: 'Continue watching' })}
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
            {pickLang(lang, { es: 'Continuar viendo', ca: 'Continuar veient', en: 'Continue watching' })}
          </h3>
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
                    fallbackTitle={hItem.title}
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
                    <span className="w-7 h-7 rounded-full bg-[#9146FF] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(145,70,255,0.45)] shrink-0">
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
                        className="h-full bg-[#9146FF]"
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

  const futbolPull = usePullToRefresh(async () => {
    await Promise.all([fetchSportsAgenda(), fetchTdtCatalog()]);
  }, worldMode === 'futbol');

  const tvPull = usePullToRefresh(async () => {
    await Promise.all([fetchTdtCatalog(), fetchLiveEpg(true)]);
  }, worldMode === 'tv');

  const activeSectionQuery =
    activeSection === 'movies' || activeSection === 'vose'
      ? movieQuery
      : activeSection === 'series'
      ? seriesQuery
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
        (movieGenre ? 1 : 0) +
        (movieSort !== 'trending' ? 1 : 0)
      );
    }
    if (activeSection === 'series') {
      return (
        (seriesLangMode === 'EN' || seriesLangMode === 'ES' ? 1 : 0) +
        (seriesGenre ? 1 : 0) +
        (seriesSort !== 'trending' ? 1 : 0)
      );
    }
    if (activeSection === 'castellano') {
      return (
        (castellanoKind !== 'all' ? 1 : 0) +
        (castellanoProvider !== 'all' ? 1 : 0) +
        (castellanoCategory !== 'trending' ? 1 : 0)
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
    <div
      className={
        activeSection === 'games'
          ? '@container w-full min-w-0 max-w-full flex-1 min-h-0 flex flex-col gap-1.5 pb-0.5'
          : '@container w-full min-w-0 max-w-full space-y-4 pb-24 sm:pb-8'
      }
      data-pillar={activePillar}
    >
      {/* Movie / Series Rich Details & Language Selector Modal */}
      <MediaDetailsModal
        item={previewItem}
        lang={lang}
        defaultAudioLang={
          effectiveCineCastellano
            ? 'ES'
            : cineAudioOverride === 'EN'
            ? 'EN'
            : seriesLangMode === 'EN'
            ? 'EN'
            : 'VOSE'
        }
        isBookmarked={previewItem ? isBookmarked(previewItem) : false}
        onClose={() => setPreviewItem(null)}
        onPlayMovie={(m, pLang, opts) => onPlayMovie(m, pLang, opts)}
        onOpenSeriesEpisodes={(tmdbId, forceSpanish) => {
          const seed = previewItem || undefined;
          setPreviewItem(null);
          openSeriesDetails(tmdbId, seed?.seasonNumber || 1, seed, Boolean(forceSpanish));
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
                                ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_16px_rgba(145,70,255,0.35)]'
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

                      {/* "Idioma:" Dropdown with authentic SVG flags */}
                      <MediaLanguageSelector
                        labelPrefix={pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Language:' })}
                        selectedLang={seriesModalLang}
                        availableLangs={
                          Array.isArray(selectedSeries.availableLanguages) &&
                          selectedSeries.availableLanguages.length > 0
                            ? selectedSeries.availableLanguages
                            : ['ES', 'LAT', 'VOSE', 'EN']
                        }
                        onSelectLang={(code) => {
                          triggerHaptic('light');
                          setSeriesModalLang(code);
                        }}
                        probing={probingSeriesLangs}
                        size="sm"
                      />

                      <button
                        type="button"
                        disabled={probingSeriesLangs}
                        onClick={() => {
                          triggerHaptic('medium');
                          openSeriesDetails(
                            selectedSeries.tmdbId,
                            selectedSeries.activeSeason,
                            selectedSeries,
                            true
                          );
                        }}
                        className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-60 ${
                          forceSpanishSeriesActive
                            ? 'bg-[#9146FF]/25 border-[#BF94FF]/60 text-white'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] border-[#BF94FF]/35 text-[#EFEFF1]'
                        }`}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 shrink-0 text-[#BF94FF] ${
                            probingSeriesLangs ? 'animate-spin' : ''
                          }`}
                        />
                        <FlagBadgeSvg code="es" className="w-4 h-2.5 shrink-0" />
                        <span>
                          {pickLang(lang, {
                            es: 'Forzar Castellano',
                            ca: 'Forçar Castellà',
                            en: 'Force Spanish (ES)',
                          })}
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedSeries(null)}
                      aria-label="Cerrar serie"
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Series Title + Quick Resume / Play Episode 1 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-[11px] sm:text-xs text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                        <span className="text-[#BF94FF] font-semibold">
                          {pickLang(lang, { es: 'Serie TV', ca: 'Sèrie TV', en: 'TV Series' })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-zinc-200 tabular-nums">{selectedSeries.year}</span>
                        {selectedSeries.rating && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-zinc-200 font-mono font-semibold tabular-nums">
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
                        className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#9146FF]/25"
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
                            forceSpanishSeriesActive ? 'ES' : seriesModalLang,
                            forceSpanishSeriesActive ? { forceSpanish: true } : undefined
                          );
                          setSelectedSeries(null);
                        }}
                        className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#9146FF]/25"
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
                              ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_16px_rgba(145,70,255,0.35)]'
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
                                isActiveSeason ? 'text-purple-200' : 'text-zinc-400'
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
                          className="w-full h-10 pl-9 pr-8 rounded-xl bg-[#06070B] border border-white/10 focus:border-[#9146FF]/60 text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
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
                          <ArrowUpDown className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
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
                                  ? 'bg-[#9146FF] text-white shadow-sm'
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
                                  onPlaySeriesEpisode(
                                    selectedSeries,
                                    ep,
                                    forceSpanishSeriesActive ? 'ES' : seriesModalLang,
                                    forceSpanishSeriesActive ? { forceSpanish: true } : undefined
                                  );
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
                                  <div className="w-8 h-8 rounded-full bg-[#9146FF]/95 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
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
                                        epProgressPct >= 88 ? 'bg-emerald-400' : 'bg-[#9146FF]'
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
                                  <span className="text-[#BF94FF] font-semibold">
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
                                    subtitle: `${rawTitle || `Capítulo ${ep.episodeNumber}`} (${seriesModalLang})`,
                                    poster: ep.still || selectedSeries.poster,
                                    tmdbId: selectedSeries.tmdbId,
                                    season: ep.seasonNumber,
                                    episode: ep.episodeNumber,
                                    preferLang: seriesModalLang as any,
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
      {/* WORLD 1: CINE (PELÍCULAS · SERIES)                                 */}
      {/* ================================================================== */}
      {(worldMode === 'cine' || (!worldMode && activeSection === 'home')) && (() => {
        const isMoviesTab = effectiveCineTab === 'movies';
        const isSeriesTab = effectiveCineTab === 'series';
        const trimmedSearch = (externalSearchQuery ?? homeQuery).trim();
        const isUrlSearch = /^https?:\/\//i.test(trimmedSearch);
        const showUnifiedSearch = !isUrlSearch && trimmedSearch.length >= 2;

        const heroPool = isSeriesTab
          ? homeShowcaseSeries.length > 0
            ? homeShowcaseSeries
            : seriesList
          : homeShowcaseMovies.length > 0
          ? homeShowcaseMovies
          : movies;
        const heroSlides = heroPool.filter((m) => m.backdrop || m.poster).slice(0, 6);
        const activeHeroSlide = heroSlides[heroSlideIndex % Math.max(1, heroSlides.length)] || null;

        const currentSort = isSeriesTab ? seriesSort : movieSort;
        const currentGenre = isSeriesTab ? seriesGenre : movieGenre;
        const currentSortOptions = isSeriesTab ? SERIES_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
        const currentGenres = isSeriesTab ? SERIES_GENRES : MOVIE_GENRES;

        const activeAudioCode: 'ES' | 'EN' | 'CAT' | 'VOSE' =
          cineSpecialPortal === 'catala'
            ? 'CAT'
            : effectiveCineCastellano
            ? 'ES'
            : cineAudioOverride === 'EN'
            ? 'EN'
            : 'VOSE';
        const activeAudioFlag: FlagCode =
          activeAudioCode === 'ES'
            ? 'es'
            : activeAudioCode === 'EN'
            ? 'uk'
            : activeAudioCode === 'CAT'
            ? 'ca'
            : 'vose';

        const activeFilterCount =
          (activeAudioCode !== 'VOSE' ? 1 : 0) +
          (currentSort !== 'trending' ? 1 : 0) +
          (currentGenre !== '' ? 1 : 0);

        const activeSortMeta = currentSortOptions.find((o) => o.id === currentSort);
        const activeGenreMeta = currentGenres.find((g) => g.id === currentGenre);

        const openPosterItem = (item: CatalogMovie) => {
          triggerHaptic('light');
          setPreviewItem(item);
        };

        const renderPosterTile = (item: CatalogMovie, forcedKind?: 'movie' | 'tv') => {
          const normalized: CatalogMovie = forcedKind
            ? { ...item, mediaType: forcedKind }
            : item;
          return (
            <button
              key={`${normalized.id}-${normalized.mediaType || 'm'}`}
              type="button"
              onClick={() => openPosterItem(normalized)}
              className="group w-full text-left cursor-pointer active:scale-[0.98] transition-transform flex flex-col gap-1.5"
            >
              <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                <PosterImage
                  src={normalized.poster}
                  alt={normalized.title}
                  aspect="poster"
                  imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                  fallbackTitle={normalized.title}
                />
              </div>
              <div className="px-0.5 min-w-0">
                <p className="font-display font-bold text-xs text-white line-clamp-1 leading-snug group-hover:text-[#D8B4FE] transition-colors">
                  {normalized.title}
                </p>
                {(normalized.year || normalized.rating) && (
                  <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums truncate">
                    {normalized.year}
                    {normalized.year && normalized.rating ? ' · ' : ''}
                    {normalized.rating ? `★ ${normalized.rating}` : ''}
                  </p>
                )}
              </div>
            </button>
          );
        };

        return (
          <div className="space-y-5">
            {/* TOP CONTROLS: Películas | Series */}
            <div className="space-y-2.5">
              <SegmentedControl
                layoutId="cine-main-tabs"
                value={effectiveCineTab}
                onChange={(nextTab) => {
                  triggerHaptic('light');
                  setCineSpecialPortal('none');
                  setEffectiveCineTab(nextTab);
                }}
                options={[
                  { id: 'movies', label: pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' }) },
                  { id: 'series', label: pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' }) },
                ]}
              />

              {/* Compact Secondary Bar: Dynamic Audio Pill + Filtros + Sorpréndeme */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    if (cineSpecialPortal === 'catala') {
                      setCineSpecialPortal('none');
                      setEffectiveCineCastellano(false);
                      setCineAudioOverride('VOSE');
                      setSeriesLangMode('VOSE');
                      return;
                    }
                    const next = !effectiveCineCastellano;
                    setEffectiveCineCastellano(next);
                    if (next) {
                      setCineAudioOverride('ES');
                      setSeriesLangMode('ES');
                    } else {
                      setCineAudioOverride('VOSE');
                      setSeriesLangMode('VOSE');
                    }
                  }}
                  className={`min-h-11 px-3.5 rounded-2xl text-xs font-bold border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                    activeAudioCode !== 'VOSE'
                      ? 'bg-[#9146FF] border-[#9146FF] text-white'
                      : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.1]'
                  }`}
                >
                  <FlagBadgeSvg code={activeAudioFlag} className="w-4 h-2.5 shrink-0" />
                  <span>{activeAudioCode}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setCineFiltersOpen(true);
                  }}
                  className={`min-h-11 px-3.5 rounded-2xl text-xs font-bold border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                    activeFilterCount > 0
                      ? 'bg-[#9146FF]/20 border-[#9146FF]/60 text-white'
                      : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.1]'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#BF94FF]" />
                  <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
                  {activeFilterCount > 0 && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-[#9146FF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {onOpenSurpriseMe && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenSurpriseMe();
                    }}
                    className="min-h-11 px-3.5 rounded-2xl bg-white/[0.05] hover:bg-[#9146FF]/20 border border-[#9146FF]/35 text-xs font-bold text-[#D8B4FE] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{pickLang(lang, { es: 'Sorpréndeme', ca: 'Sorprèn-me', en: 'Surprise me' })}</span>
                  </button>
                )}
              </div>

              {/* Dismissible Active Filter Chips */}
              {activeFilterCount > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {activeAudioCode !== 'VOSE' && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCineSpecialPortal('none');
                        setEffectiveCineCastellano(false);
                        setCineAudioOverride('VOSE');
                        setSeriesLangMode('VOSE');
                      }}
                      className="min-h-8 px-2.5 rounded-xl bg-[#9146FF]/18 border border-[#9146FF]/45 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#9146FF]/30 transition-colors"
                    >
                      <FlagBadgeSvg code={activeAudioFlag} className="w-3.5 h-2.5 shrink-0" />
                      <span>
                        {activeAudioCode === 'ES'
                          ? 'Castellano'
                          : activeAudioCode === 'CAT'
                          ? 'Català'
                          : 'English (VO)'}
                      </span>
                      <X className="w-3 h-3 text-zinc-300" />
                    </button>
                  )}

                  {currentSort !== 'trending' && activeSortMeta && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        if (isSeriesTab) {
                          setSeriesSort('trending');
                          setSeriesPage(1);
                        } else {
                          setMovieSort('trending');
                          setMoviePage(1);
                        }
                      }}
                      className="min-h-8 px-2.5 rounded-xl bg-white/[0.07] border border-white/15 text-[11px] font-semibold text-zinc-100 inline-flex items-center gap-1.5 cursor-pointer hover:bg-white/[0.12] transition-colors"
                    >
                      <span>{pickLang(lang, activeSortMeta)}</span>
                      <X className="w-3 h-3 text-zinc-400" />
                    </button>
                  )}

                  {currentGenre !== '' && activeGenreMeta && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        if (isSeriesTab) {
                          setSeriesGenre('');
                          setSeriesPage(1);
                        } else {
                          setMovieGenre('');
                          setMoviePage(1);
                        }
                      }}
                      className="min-h-8 px-2.5 rounded-xl bg-[#9146FF]/18 border border-[#9146FF]/45 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#9146FF]/30 transition-colors"
                    >
                      <span>{pickLang(lang, activeGenreMeta)}</span>
                      <X className="w-3 h-3 text-zinc-300" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* URL DETECTED IN SEARCH */}
            {isUrlSearch && (
              <div className="p-4 rounded-2xl bg-[#11131B] border border-[#9146FF]/40 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-200">
                  <Link2 className="w-4 h-4 text-[#BF94FF] shrink-0" />
                  <span className="font-mono truncate max-w-[260px] sm:max-w-[420px]">
                    {trimmedSearch}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayCustomUrl(trimmedSearch);
                      onExternalSearchChange?.('');
                    }}
                    className="min-h-11 px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onOpenCloudBrowser(trimmedSearch);
                      onExternalSearchChange?.('');
                    }}
                    className="min-h-11 px-4 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer"
                  >
                    {t.openWebBtn}
                  </button>
                </div>
              </div>
            )}

            {/* UNIFIED SEARCH RESULTS */}
            {showUnifiedSearch ? (
              <div className="space-y-6">
                {loadingHomeSearch && (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                )}

                {homeMovieResults.length > 0 && (
                  <section className="space-y-2.5">
                    <h3 className="font-display font-bold text-base text-white">
                      {pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {homeMovieResults.map((item) => renderPosterTile(item, 'movie'))}
                    </div>
                  </section>
                )}

                {homeSeriesResults.length > 0 && (
                  <section className="space-y-2.5">
                    <h3 className="font-display font-bold text-base text-white">
                      {pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' })}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {homeSeriesResults.map((item) => renderPosterTile(item, 'tv'))}
                    </div>
                  </section>
                )}

                {!loadingHomeSearch &&
                  homeMovieResults.length === 0 &&
                  homeSeriesResults.length === 0 && (
                    <div className="py-10 px-4 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center space-y-3">
                      <p className="text-sm font-semibold text-white">
                        {pickLang(lang, {
                          es: `Sin resultados para "${trimmedSearch}"`,
                          ca: `Sense resultats per a "${trimmedSearch}"`,
                          en: `No results for "${trimmedSearch}"`,
                        })}
                      </p>
                      {onSearchWithAi && (
                        <button
                          type="button"
                          onClick={() => onSearchWithAi(trimmedSearch, isSeriesTab ? 'tv' : 'all')}
                          className="min-h-11 px-5 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Wand2 className="w-4 h-4" />
                          <span>
                            {pickLang(lang, {
                              es: 'Buscar en la web',
                              ca: 'Cercar al web',
                              en: 'Search web',
                            })}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
              </div>
            ) : cineSpecialPortal === 'catala' ? (
              /* CATALÀ ANIME PORTAL */
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCineSpecialPortal('none')}
                    className="min-h-11 px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{pickLang(lang, { es: 'Volver a Cine', ca: 'Tornar a Cine', en: 'Back to Cinema' })}</span>
                  </button>
                  <span className="text-sm font-display font-bold text-white inline-flex items-center gap-2">
                    <FlagBadgeSvg code="ca" className="w-4 h-2.5 shrink-0" />
                    <span>Anime en Català</span>
                  </span>
                </div>

                {loadingCatala ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                ) : (
                  <VirtualizedPosterGrid
                    items={catalaItems}
                    variant="poster"
                    getKey={(item) => item.id}
                    renderItem={(item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          openCatalaSeriesDetails(item, 1);
                        }}
                        className="group w-full text-left cursor-pointer flex flex-col gap-1.5"
                      >
                        <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                          <PosterImage
                            src={item.poster}
                            alt={item.title}
                            aspect="poster"
                            fallbackTitle={item.title}
                          />
                        </div>
                        <div className="px-0.5 min-w-0">
                          <div className="font-display font-bold text-xs text-white line-clamp-1">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                            {item.episodeHint}
                          </div>
                        </div>
                      </button>
                    )}
                  />
                )}
              </div>
            ) : (isMoviesTab && (movieGenre !== '' || movieSort !== 'trending')) ||
              (isSeriesTab && (seriesGenre !== '' || seriesSort !== 'trending')) ? (
              /* FILTERED SORT / GENRE CATALOG GRID */
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMovieSort('trending');
                      setMovieGenre('');
                      setSeriesSort('trending');
                      setSeriesGenre('');
                    }}
                    className="min-h-11 px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>
                      {activeGenreMeta
                        ? pickLang(lang, activeGenreMeta)
                        : activeSortMeta
                        ? pickLang(lang, activeSortMeta)
                        : pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' })}
                    </span>
                  </button>
                </div>

                {(isSeriesTab ? loadingSeries : loadingMovies) ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <VirtualizedPosterGrid
                      items={isSeriesTab ? seriesList : movies}
                      variant="poster"
                      getKey={(item) => item.id}
                      renderItem={(item) => renderPosterTile(item, isSeriesTab ? 'tv' : 'movie')}
                    />
                    {(isSeriesTab ? hasMoreSeries : hasMoreMovies) && (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          disabled={isSeriesTab ? loadingMoreSeries : loadingMoreMovies}
                          onClick={() =>
                            isSeriesTab
                              ? setSeriesPage((p) => p + 1)
                              : setMoviePage((p) => p + 1)
                          }
                          className="min-h-12 px-6 rounded-2xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-xs font-bold text-white cursor-pointer"
                        >
                          {(isSeriesTab ? loadingMoreSeries : loadingMoreMovies)
                            ? pickLang(lang, { es: 'Cargando...', ca: 'Carregant...', en: 'Loading...' })
                            : pickLang(lang, { es: 'Cargar más', ca: 'Carregar més', en: 'Load more' })}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* DEFAULT CINE VIEW: LOW HERO (<40% dvh) + HORIZONTAL POSTER ROWS */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {activeHeroSlide && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    onTouchStart={(e) => {
                      heroTouchStartXRef.current = e.touches[0]?.clientX ?? null;
                    }}
                    onTouchEnd={(e) => {
                      if (heroTouchStartXRef.current === null) return;
                      const endX = e.changedTouches[0]?.clientX ?? heroTouchStartXRef.current;
                      const dx = endX - heroTouchStartXRef.current;
                      heroTouchStartXRef.current = null;
                      if (Math.abs(dx) > 40 && heroSlides.length > 1) {
                        setHeroSlideIndex((prev) =>
                          dx < 0
                            ? (prev + 1) % heroSlides.length
                            : (prev - 1 + heroSlides.length) % heroSlides.length
                        );
                      }
                    }}
                    onMouseEnter={() => setIsHeroHovered(true)}
                    onMouseLeave={() => setIsHeroHovered(false)}
                    className="relative w-full min-h-[220px] max-h-[38dvh] aspect-[16/10] sm:aspect-[21/9] rounded-3xl overflow-hidden bg-[#11131B] border border-white/[0.1]"
                  >
                    <img
                      src={activeHeroSlide.backdrop || activeHeroSlide.poster}
                      alt={activeHeroSlide.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07080C] via-[#07080C]/55 to-transparent" />

                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => openPosterItem({ ...activeHeroSlide, mediaType: isSeriesTab ? 'tv' : 'movie' })}
                        className="text-left space-y-1 cursor-pointer focus:outline-none"
                      >
                        <h3 className="font-display font-extrabold text-xl sm:text-2xl text-white leading-tight line-clamp-2">
                          {activeHeroSlide.title}
                        </h3>
                        <p className="text-xs text-zinc-200 tabular-nums truncate">
                          {[
                            activeHeroSlide.year,
                            activeHeroSlide.rating ? `★ ${activeHeroSlide.rating}` : '',
                            ...(Array.isArray(activeHeroSlide.genres)
                              ? activeHeroSlide.genres.slice(0, 2)
                              : []),
                            activeHeroSlide.seasonsCount
                              ? `${activeHeroSlide.seasonsCount} ${pickLang(lang, {
                                  es: activeHeroSlide.seasonsCount === 1 ? 'Temp.' : 'Temps.',
                                  ca: activeHeroSlide.seasonsCount === 1 ? 'Temp.' : 'Temps.',
                                  en: activeHeroSlide.seasonsCount === 1 ? 'Season' : 'Seasons',
                                })}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </button>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('success');
                              if (isSeriesTab && activeHeroSlide.tmdbId) {
                                openSeriesDetails(activeHeroSlide.tmdbId, 1, activeHeroSlide);
                              } else {
                                onPlayMovie(
                                  activeHeroSlide,
                                  effectiveCineCastellano ? 'ES' : cineAudioOverride,
                                  effectiveCineCastellano ? { forceSpanish: true } : undefined
                                );
                              }
                            }}
                            className="min-h-11 px-5 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs sm:text-sm font-bold text-white inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all shadow-[0_6px_18px_rgba(145,70,255,0.4)]"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>
                              {isSeriesTab
                                ? pickLang(lang, { es: 'Ver episodios', ca: 'Veure episodis', en: 'Episodes' })
                                : pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleToggleBookmark({ ...activeHeroSlide, mediaType: isSeriesTab ? 'tv' : 'movie' }, e)}
                            aria-label={pickLang(lang, { es: 'Mi Lista', ca: 'La meva llista', en: 'My List' })}
                            className={`min-h-11 min-w-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                              isBookmarked(activeHeroSlide)
                                ? 'bg-[#9146FF]/25 border-[#9146FF] text-white'
                                : 'bg-black/55 hover:bg-white/15 border-white/20 text-white'
                            }`}
                          >
                            {isBookmarked(activeHeroSlide) ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Plus className="w-5 h-5" />
                            )}
                          </button>
                        </div>

                        {heroSlides.length > 1 && (
                          <div className="flex items-center gap-1.5">
                            {heroSlides.map((s, idx) => {
                              const active = idx === heroSlideIndex % heroSlides.length;
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => setHeroSlideIndex(idx)}
                                  aria-label={`Slide ${idx + 1}`}
                                  className={`h-2 rounded-full transition-all cursor-pointer ${
                                    active ? 'w-5 bg-[#9146FF]' : 'w-2 bg-white/35'
                                  }`}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ROW 1: TENDENCIAS (deduped against activeHeroSlide) */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.06 }}
                  className="space-y-2.5"
                >
                  <h3 className="font-display font-bold text-base sm:text-lg text-white">
                    {pickLang(lang, { es: 'Tendencias', ca: 'Tendències', en: 'Trending' })}
                  </h3>
                  <div className="scroll-snap-x flex gap-3 overflow-x-auto no-scrollbar pb-1">
                    {(isSeriesTab ? seriesList : movies)
                      .slice(0, 14)
                      .map((item, idx) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: Math.min(idx * 0.03, 0.25) }}
                          className="scroll-snap-item w-[132px] sm:w-[152px] shrink-0"
                        >
                          {renderPosterTile(item, isSeriesTab ? 'tv' : 'movie')}
                        </motion.div>
                      ))}
                  </div>
                </motion.section>

                {/* ROW 2: ESTRENOS RECIENTES */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.12 }}
                >
                  <LatestReleasesSection
                    lang={lang}
                    mediaTypeFilter={isSeriesTab ? 'tv' : 'movie'}
                    onSelectMovie={(m) => openPosterItem({ ...m, mediaType: 'movie' })}
                    onSelectSeries={(s, sn) =>
                      s.tmdbId ? openSeriesDetails(s.tmdbId, sn, s) : openPosterItem({ ...s, mediaType: 'tv' })
                    }
                  />
                </motion.div>

                {/* ROW 3: PARA TI / DESCUBRIR */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.18 }}
                >
                  <React.Suspense fallback={null}>
                    <ExpandedDiscoverySection
                      lang={lang}
                      filterState={{
                        mediaType: isSeriesTab ? 'tv' : 'movie',
                        genreId: homeGenreId,
                        provider: homeProvider,
                        sortBy: homeSortBy,
                      }}
                      onGenresLoaded={setDiscoveryGenres}
                      onSelectItem={(item) => openPosterItem(item)}
                    />
                  </React.Suspense>
                </motion.div>
              </motion.div>
            )}

            {/* CINE FILTERS BOTTOM SHEET (GROUPED VO / DUBBING + SORT + GENRE) */}
            <BottomSheet
              isOpen={cineFiltersOpen}
              onClose={() => setCineFiltersOpen(false)}
              lang={lang}
              title={pickLang(lang, { es: 'Filtros de Cine', ca: 'Filtres de Cine', en: 'Cinema Filters' })}
            >
              <div className="space-y-5">
                {/* Original Version Group */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, { es: 'Versión Original', ca: 'Versió Original', en: 'Original Version' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        {
                          id: 'VOSE',
                          flagCode: 'vose',
                          label: pickLang(lang, { es: 'VOSE (Subtitulada)', ca: 'VOSE (Subtitulada)', en: 'VOSE (Subtitled)' }),
                        },
                        {
                          id: 'EN',
                          flagCode: 'uk',
                          label: 'English (VO)',
                        },
                      ] as const satisfies readonly { id: 'VOSE' | 'EN'; flagCode: FlagCode; label: string }[]
                    ).map((opt) => {
                      const active =
                        cineSpecialPortal === 'none' &&
                        !effectiveCineCastellano &&
                        cineAudioOverride === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setCineSpecialPortal('none');
                            setEffectiveCineCastellano(false);
                            setCineAudioOverride(opt.id);
                            setSeriesLangMode(opt.id);
                          }}
                          className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer transition-all ${
                            active
                              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                              : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                          }`}
                        >
                          <FlagBadgeSvg code={opt.flagCode} className="w-4 h-2.5 shrink-0" />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dubbing Group */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, { es: 'Doblaje', ca: 'Doblatge', en: 'Dubbing' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCineSpecialPortal('none');
                        setEffectiveCineCastellano(true);
                        setCineAudioOverride('ES');
                        setSeriesLangMode('ES');
                      }}
                      className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer transition-all ${
                        cineSpecialPortal === 'none' && effectiveCineCastellano
                          ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                          : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <FlagBadgeSvg code="es" className="w-4 h-2.5 shrink-0" />
                      <span>Castellano (ES)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCineSpecialPortal('catala');
                        setCineFiltersOpen(false);
                      }}
                      className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer transition-all ${
                        cineSpecialPortal === 'catala'
                          ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                          : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <FlagBadgeSvg code="ca" className="w-4 h-2.5 shrink-0" />
                      <span>Català</span>
                    </button>
                  </div>
                </div>

                {/* Sort Order Group */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, { es: 'Ordenar por', ca: 'Ordenar per', en: 'Sort by' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentSortOptions.map((opt) => {
                      const active = currentSort === opt.id && cineSpecialPortal === 'none';
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setCineSpecialPortal('none');
                            if (isSeriesTab) {
                              setSeriesSort(opt.id);
                              setSeriesPage(1);
                            } else {
                              setMovieSort(opt.id);
                              setMoviePage(1);
                            }
                          }}
                          className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                            active
                              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                              : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, opt)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Genres Group (Includes Anime cleanly alongside other genres) */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, { es: 'Géneros', ca: 'Gèneres', en: 'Genres' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setCineSpecialPortal('none');
                        if (isSeriesTab) {
                          setSeriesGenre('');
                          setSeriesPage(1);
                        } else {
                          setMovieGenre('');
                          setMoviePage(1);
                        }
                      }}
                      className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                        currentGenre === '' && cineSpecialPortal === 'none'
                          ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                          : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      {pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' })}
                    </button>
                    {currentGenres.map((gen) => {
                      const active = currentGenre === gen.id && cineSpecialPortal === 'none';
                      return (
                        <button
                          key={gen.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setCineSpecialPortal('none');
                            const nextVal = currentGenre === gen.id ? '' : gen.id;
                            if (isSeriesTab) {
                              setSeriesGenre(nextVal);
                              setSeriesPage(1);
                            } else {
                              setMovieGenre(nextVal);
                              setMoviePage(1);
                            }
                          }}
                          className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                            active
                              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                              : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                          }`}
                        >
                          {pickLang(lang, gen)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEffectiveCineCastellano(false);
                      setCineAudioOverride('VOSE');
                      setSeriesLangMode('VOSE');
                      setMovieSort('trending');
                      setMovieGenre('');
                      setSeriesSort('trending');
                      setSeriesGenre('');
                      setCineSpecialPortal('none');
                    }}
                    className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCineFiltersOpen(false)}
                    className="flex-1 min-h-12 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
                  </button>
                </div>
              </div>
            </BottomSheet>
          </div>
        );
      })()}

      {/* ================================================================== */}
      {/* WORLD 2: FÚTBOL (PARTIDOS | CANALES + FILTROS INCL. CHINA 中文)    */}
      {/* ================================================================== */}
      {(worldMode === 'futbol' || (!worldMode && activeSection === 'sports')) && (() => {
        const activeFilterCount =
          (futbolLeagueFilter ? 1 : 0) +
          (footballLiveBrand !== 'all' ? 1 : 0);

        return (
          <div
            ref={futbolPull.containerRef}
            {...futbolPull.pullHandlers}
            className="space-y-4"
          >
            {futbolPull.pullDistance > 10 && (
              <div className="text-center text-xs text-[#BF94FF] font-semibold py-1">
                {futbolPull.isRefreshing
                  ? pickLang(lang, { es: 'Actualizando...', ca: 'Actualitzant...', en: 'Refreshing...' })
                  : pickLang(lang, { es: 'Suelta para actualizar', ca: 'Deixa anar per actualitzar', en: 'Release to refresh' })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <SegmentedControl
                  layoutId="futbol-main-tabs"
                  value={effectiveFutbolTab}
                  onChange={(tTab) => {
                    triggerHaptic('light');
                    setEffectiveFutbolTab(tTab);
                  }}
                  options={[
                    { id: 'matches', label: pickLang(lang, { es: 'Partidos', ca: 'Partits', en: 'Matches' }) },
                    { id: 'channels', label: pickLang(lang, { es: 'Canales', ca: 'Canals', en: 'Channels' }) },
                  ]}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setFutbolFiltersOpen(true);
                }}
                className={`min-h-12 px-3.5 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all ${
                  activeFilterCount > 0
                    ? 'bg-[#9146FF]/22 border-[#9146FF] text-white'
                    : 'bg-white/[0.05] border-white/[0.1] text-zinc-100 hover:bg-white/[0.1]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
                {activeFilterCount > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-[#9146FF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {effectiveFutbolTab === 'matches' ? (
              <React.Suspense
                fallback={
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                }
              >
                <FootballMatchboard
                  lang={lang}
                  searchQuery={sportsSearch}
                  onSearchQueryChange={setSportsSearch}
                  langFilter={futbolLangFilter}
                  leagueFilter={futbolLeagueFilter}
                  activeVideoRawUrl={activeVideoRawUrl}
                  loadingItemId={loadingItemId}
                  onPlaySportsMatch={onPlaySportsMatch}
                  onPlaySecondaryChannel={
                    onPlaySecondaryChannel
                      ? (m, idx) =>
                          onPlaySecondaryChannel({
                            sourceUrl: m.channels[idx]?.sourceUrl || '',
                            title: m.title,
                            subtitle: m.competition,
                          })
                      : undefined
                  }
                  isChannelFavorited={isChannelFavorited}
                  onToggleChannelFavorite={onToggleChannelFavorite}
                />
              </React.Suspense>
            ) : (
              <div className="space-y-2.5">
                {loadingTdt && footballSectionLiveChannels.length === 0 ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                ) : footballSectionLiveChannels.length === 0 ? (
                  <div className="py-10 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-zinc-400">
                    {pickLang(lang, {
                      es: 'No hay canales con este filtro.',
                      ca: 'No hi ha canals amb aquest filtre.',
                      en: 'No channels match this filter.',
                    })}
                  </div>
                ) : (
                  footballSectionLiveChannels.map((ch) => {
                    const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
                    const faved = isChannelFavorited(favId);
                    const regMeta = getChannelRegionMeta(ch);
                    const isPlaying = Boolean(
                      activeVideoRawUrl &&
                        ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
                    );
                    return (
                      <div
                        key={ch.id}
                        className={`relative group min-h-[76px] p-3 rounded-2xl bg-[#11131B] border flex items-center justify-between gap-3 transition-colors ${
                          isPlaying
                            ? 'border-[#9146FF] bg-[#9146FF]/[0.07]'
                            : 'border-white/[0.08] hover:border-[#9146FF]/50 hover:bg-white/[0.03]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('success');
                            onPlayTdtChannel(ch, 0);
                          }}
                          aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
                          className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
                        />

                        <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
                          <ChannelLogoBadge channel={ch} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="font-display font-bold text-sm text-white truncate flex items-center gap-1.5">
                              <span className="truncate">{ch.name}</span>
                              <span className="text-xs font-medium text-zinc-400 shrink-0">
                                · {regMeta.langTag}
                              </span>
                            </p>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {ch.category === 'china_football'
                                ? 'China (中文 · 欧冠/西甲/英超)'
                                : ch.network}
                            </p>
                          </div>
                        </div>

                        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleChannelFavorite({
                                favId,
                                title: ch.name,
                                channelLabel: ch.shortMark,
                                channelUrl: ch.channels[0]?.sourceUrl || '',
                                competition: ch.network,
                                sport: 'soccer',
                              });
                            }}
                            aria-label={pickLang(lang, { es: 'Favorito', ca: 'Favorit', en: 'Favorite' })}
                            className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                              faved
                                ? 'bg-[#9146FF]/20 border-[#9146FF] text-[#D8B4FE]'
                                : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('success');
                              onPlayTdtChannel(ch, 0);
                            }}
                            aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${ch.name}`}
                            className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer active:scale-95 transition-all ${
                              isPlaying
                                ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                                : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-[#9146FF]/20 hover:border-[#9146FF]/50 hover:text-white'
                            }`}
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* FÚTBOL FILTERS BOTTOM SHEET (WITH CUSTOM SVG FLAGS & PRESERVED CHINESE LABELS) */}
            <BottomSheet
              isOpen={futbolFiltersOpen}
              onClose={() => setFutbolFiltersOpen(false)}
              lang={lang}
              title={pickLang(lang, { es: 'Filtros de Fútbol', ca: 'Filtres de Futbol', en: 'Football Filters' })}
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, {
                      es: 'Ligas (filtra partidos)',
                      ca: 'Lligues (filtra partits)',
                      en: 'Leagues (filters matches)',
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: '', label: pickLang(lang, { es: 'Todas', ca: 'Totes', en: 'All' }) },
                      { id: 'champions', label: 'Champions League' },
                      { id: 'laliga', label: 'LaLiga' },
                      { id: 'hypermotion', label: 'LaLiga Hypermotion' },
                      { id: 'premier', label: 'Premier League' },
                      { id: 'europa', label: 'Europa League' },
                      { id: 'serie a', label: 'Serie A' },
                      { id: 'bundesliga', label: 'Bundesliga' },
                      { id: 'world', label: pickLang(lang, { es: 'Selecciones', ca: 'Seleccions', en: 'Internationals' }) },
                    ].map((lg) => (
                      <button
                        key={lg.id || 'all-lg'}
                        type="button"
                        onClick={() => setFutbolLeagueFilter(lg.id)}
                        className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                          futbolLeagueFilter === lg.id
                            ? 'bg-[#9146FF] border-[#9146FF] text-white'
                            : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.09]'
                        }`}
                      >
                        {lg.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, {
                      es: 'Redes de Canales (filtra señales)',
                      ca: 'Xarxes de Canals (filtra senyals)',
                      en: 'Channel Networks (filters feeds)',
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'all', flagCode: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
                        { id: 'bein_arabic', flagCode: 'qa', label: 'beIN SPORTS (العربية)' },
                        { id: 'china_football', flagCode: 'cn', label: 'China (中文 · 欧冠/西甲/英超)' },
                        { id: 'movistar', flagCode: 'es', label: 'Movistar+' },
                        { id: 'dazn', flagCode: 'es', label: 'DAZN' },
                        { id: 'uk_sports', flagCode: 'uk', label: 'UK Sports (EN)' },
                        { id: 'beinsports', flagCode: 'all', label: 'beIN SPORTS (Global)' },
                        { id: 'espn', flagCode: 'lat', label: 'ESPN (1–7)' },
                        { id: 'dsports', flagCode: 'lat', label: 'DSports' },
                        { id: 'tnt_space', flagCode: 'lat', label: 'TNT y Space' },
                      ] as const
                    ).map((br) => {
                      const netCount = footballNetworkCounts[br.id] ?? 0;
                      const active = footballLiveBrand === br.id;
                      return (
                        <button
                          key={br.id}
                          type="button"
                          onClick={() => {
                            setFootballLiveBrand(br.id);
                            if (br.id !== 'china_football' && br.id !== 'all') {
                              setFutbolLangFilter('all');
                            }
                          }}
                          className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#9146FF] border-[#9146FF] text-white'
                              : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.09]'
                          }`}
                        >
                          <FlagBadgeSvg code={br.flagCode} className="w-4 h-2.5 shrink-0" />
                          <span>{br.label}</span>
                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              active ? 'text-white/85' : 'text-zinc-400'
                            }`}
                          >
                            ({netCount})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFutbolLangFilter('all');
                      setFutbolLeagueFilter('');
                      setFootballLiveBrand('all');
                    }}
                    className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFutbolFiltersOpen(false)}
                    className="flex-1 min-h-12 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
                  </button>
                </div>
              </div>
            </BottomSheet>
          </div>
        );
      })()}

      {/* ================================================================== */}
      {/* WORLD 3: TV EN DIRECTO (COMPACT CHANNEL ROWS + EPG ON TAP)         */}
      {/* ================================================================== */}
      {(worldMode === 'tv' || (!worldMode && activeSection === 'tdt')) && (() => {
        const matchedAllCat = ALL_LIVE_CATEGORIES.find((c) => c.id === tdtCategory);
        const matchedNatCat = TDT_NATIONAL_CATEGORIES.find((c) => c.id === tdtCategory);
        const activeCatLabel = matchedAllCat
          ? pickLang(lang, matchedAllCat)
          : matchedNatCat
          ? pickLang(lang, matchedNatCat)
          : pickLang(lang, { es: 'Todos en Vivo', ca: 'Tots en Directe', en: 'All Live TV' });

        const tvFilterCount =
          (tvRegion !== 'all' ? 1 : 0) +
          (tdtCategory !== 'all' ? 1 : 0) +
          (epgFilter !== 'all' ? 1 : 0) +
          (tvFavOnly ? 1 : 0);

        return (
          <div
            ref={tvPull.containerRef}
            {...tvPull.pullHandlers}
            className="space-y-4"
          >
            {tvPull.pullDistance > 10 && (
              <div className="text-center text-xs text-[#BF94FF] font-semibold py-1">
                {tvPull.isRefreshing
                  ? pickLang(lang, { es: 'Actualizando guía...', ca: 'Actualitzant guia...', en: 'Refreshing guide...' })
                  : pickLang(lang, { es: 'Suelta para actualizar', ca: 'Deixa anar per actualitzar', en: 'Release to refresh' })}
              </div>
            )}

            {/* COMPACT TOP BAR: ACTIVE CATEGORY LABEL + FILTROS BUTTON */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display font-bold text-sm text-white truncate">
                  {activeCatLabel}
                </p>
                {epgMadridClock && (
                  <p className="text-xs text-zinc-400 tabular-nums">
                    {filteredTdtChannels.length}{' '}
                    {pickLang(lang, { es: 'canales', ca: 'canals', en: 'channels' })} · {epgMadridClock}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setTvFiltersOpen(true);
                }}
                className={`min-h-11 px-3.5 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all ${
                  tvFilterCount > 0
                    ? 'bg-[#9146FF]/22 border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.25)]'
                    : 'bg-white/[0.05] border-white/[0.1] text-zinc-100 hover:bg-white/[0.1]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
                {tvFilterCount > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-[#9146FF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {tvFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* QUICK REGION FILTER STRIP (FAVORITOS + CUSTOM SVG FLAGS) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setTvFavOnly((prev) => !prev);
                }}
                className={`min-h-9 px-3 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
                  tvFavOnly
                    ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                    : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.1]'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${tvFavOnly ? 'fill-current' : 'text-[#BF94FF]'}`} />
                <span>{pickLang(lang, { es: 'Favoritos', ca: 'Favorits', en: 'Favorites' })}</span>
              </button>

              {(
                [
                  { id: 'all', flagCode: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
                  { id: 'es', flagCode: 'es', label: 'España' },
                  { id: 'ar', flagCode: 'qa', label: 'beIN العربية & MENA' },
                  { id: 'ma', flagCode: 'ma', label: 'Marruecos' },
                  { id: 'docs', flagCode: 'docs', label: 'Documentales' },
                  { id: 'us', flagCode: 'us', label: 'EE.UU.' },
                  { id: 'eu', flagCode: 'eu', label: 'Europa' },
                  { id: 'latam', flagCode: 'lat', label: 'Latam / ES' },
                  { id: 'uk', flagCode: 'uk', label: 'UK (EN)' },
                  { id: 'cn', flagCode: 'cn', label: 'China (中文)' },
                ] as const
              ).map((reg) => {
                const active =
                  !tvFavOnly &&
                  tvRegion === reg.id &&
                  (reg.id === 'all' ? tdtCategory === 'all' : true);
                return (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setTvFavOnly(false);
                      setTvRegion(reg.id);
                      if (reg.id === 'all') {
                        setTdtCategory('all');
                      } else if (tdtCategory !== 'all' && getCategoryRegion(tdtCategory) !== reg.id) {
                        setTdtCategory('all');
                      }
                    }}
                    className={`min-h-9 px-3 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
                      active
                        ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                        : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.1]'
                    }`}
                  >
                    <FlagBadgeSvg code={reg.flagCode} className="w-4 h-2.5 shrink-0" />
                    <span>{reg.label}</span>
                  </button>
                );
              })}
            </div>

            {/* COMPACT ~76PX CHANNEL LIST (WHOLE ROW PLAYS, CLEAN LOGOS, GHOST PLAY ICON) */}
            {loadingTdt && filteredTdtChannels.length === 0 ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
              </div>
            ) : filteredTdtChannels.length === 0 ? (
              <div className="py-10 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-zinc-400">
                {pickLang(lang, {
                  es: 'No hay canales con este filtro.',
                  ca: 'No hi ha canals amb aquest filtre.',
                  en: 'No channels match this filter.',
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTdtChannels.map((ch) => {
                  const chEpg = getChannelLiveEpg(ch.id);
                  const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
                  const faved = isChannelFavorited(favId);
                  const regMeta = getChannelRegionMeta(ch);
                  const isPlaying = Boolean(
                    activeVideoRawUrl &&
                      ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
                  );

                  return (
                    <div
                      key={ch.id}
                      className={`relative group min-h-[76px] p-3 rounded-2xl bg-[#11131B] border flex items-center justify-between gap-3 transition-colors ${
                        isPlaying
                          ? 'border-[#9146FF] bg-[#9146FF]/[0.07]'
                          : 'border-white/[0.08] hover:border-[#9146FF]/50 hover:bg-white/[0.03]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                        }}
                        aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
                        className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
                      />

                      <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
                        <ChannelLogoBadge channel={ch} size="md" />

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="font-display font-bold text-sm text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{ch.name}</span>
                            <span className="text-xs font-medium text-zinc-400 shrink-0">
                              · {regMeta.langTag}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 truncate">
                            {chEpg?.now ? (
                              <>
                                <span className="font-mono tabular-nums text-zinc-300">
                                  {chEpg.now.startLabel} – {chEpg.now.stopLabel}
                                </span>
                                <span className="mx-1 text-zinc-600" aria-hidden="true">
                                  ·
                                </span>
                                <span>{chEpg.now.title}</span>
                              </>
                            ) : ch.category === 'china_football' ? (
                              'China (中文 · 欧冠/西甲/英超)'
                            ) : (
                              ch.network
                            )}
                          </div>
                          {chEpg?.now && (
                            <div className="h-1 w-full max-w-[200px] rounded-full bg-white/[0.08] overflow-hidden">
                              <div
                                className="h-full bg-[#9146FF] rounded-full"
                                style={{
                                  width: `${Math.max(4, Math.min(100, chEpg.progressPct))}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleChannelFavorite({
                              favId,
                              title: ch.name,
                              channelLabel: ch.shortMark,
                              channelUrl: ch.channels[0]?.sourceUrl || '',
                              competition: ch.network,
                              sport: ch.category === 'china_football' ? 'soccer' : 'tdt',
                            });
                          }}
                          aria-label={pickLang(lang, { es: 'Favorito', ca: 'Favorit', en: 'Favorite' })}
                          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                            faved
                              ? 'bg-[#9146FF]/20 border-[#9146FF] text-[#D8B4FE]'
                              : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('light');
                            setSelectedEpgChannel(ch);
                          }}
                          aria-label={pickLang(lang, {
                            es: `Guía EPG de ${ch.name}`,
                            ca: `Guia EPG de ${ch.name}`,
                            en: `EPG guide for ${ch.name}`,
                          })}
                          className="min-w-11 min-h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.09] flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('success');
                            onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                          }}
                          aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${ch.name}`}
                          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer active:scale-95 transition-all ${
                            isPlaying
                              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                              : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-[#9146FF]/20 hover:border-[#9146FF]/50 hover:text-white'
                          }`}
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TV FILTERS BOTTOM SHEET (FLAT REGION CARDS + FLEX-WRAP CHIPS WITH LIVE COUNTS) */}
            <BottomSheet
              isOpen={tvFiltersOpen}
              onClose={() => setTvFiltersOpen(false)}
              lang={lang}
              title={pickLang(lang, { es: 'Filtros de TV y Canales', ca: 'Filtres de TV i Canals', en: 'TV & Channel Filters' })}
            >
              <div className="space-y-4 max-h-[75vh] overflow-y-auto no-scrollbar pb-1">
                {/* GLOBAL ALL CHANNELS BUTTON */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setTvFavOnly(false);
                    setTvRegion('all');
                    setTdtCategory('all');
                  }}
                  className={`w-full min-h-11 px-4 rounded-2xl text-xs font-bold border flex items-center justify-between cursor-pointer transition-all ${
                    !tvFavOnly && tvRegion === 'all' && tdtCategory === 'all'
                      ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_18px_rgba(145,70,255,0.35)]'
                      : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.1]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FlagBadgeSvg code="all" className="w-4 h-2.5 shrink-0" />
                    <span>
                      {pickLang(lang, {
                        es: 'Todos los Canales en Vivo',
                        ca: 'Tots els Canals en Directe',
                        en: 'All Live Channels',
                      })}
                    </span>
                  </span>
                  <span className="text-[11px] opacity-85 tabular-nums font-mono font-semibold">
                    ({tdtChannels.length})
                  </span>
                </button>

                {/* COUNTRY / REGION GROUPS (FLAT CONTAINERS + FLEX-WRAP CHIPS) */}
                {TV_FILTER_GROUPS.map((group) => {
                  const isCurrentRegion = tvRegion === group.region;
                  const regionTotal = tvCategoryCounts.perRegion[group.region] ?? 0;
                  return (
                    <div
                      key={group.region}
                      className="p-3 rounded-2xl bg-white/[0.025] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2 min-w-0">
                          <FlagBadgeSvg code={group.flagCode} className="w-5 h-3.5 shrink-0" />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                              {pickLang(lang, group.name)}
                            </h4>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {pickLang(lang, group.sub)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setTvFavOnly(false);
                            setTvRegion(group.region);
                            setTdtCategory('all');
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-bold shrink-0 cursor-pointer transition-all ${
                            isCurrentRegion && tdtCategory === 'all'
                              ? 'bg-[#9146FF] text-white'
                              : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                          }`}
                        >
                          {pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' })}{' '}
                          ({regionTotal})
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {group.categories.map((cat) => {
                          const isCatActive =
                            tdtCategory === cat.id ||
                            (cat.id === 'all' && tvRegion === group.region && tdtCategory === 'all');
                          const catCount = tvCategoryCounts.perCategory[cat.id] ?? 0;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                setTvFavOnly(false);
                                setTvRegion(group.region);
                                setTdtCategory(cat.id);
                              }}
                              className={`min-h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                                isCatActive
                                  ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.3)]'
                                  : 'bg-white/[0.05] text-zinc-200 hover:bg-white/[0.09]'
                              }`}
                            >
                              <span>{pickLang(lang, cat)}</span>
                              <span
                                className={`text-[11px] font-mono tabular-nums ${
                                  isCatActive ? 'text-white/85' : 'text-zinc-400'
                                }`}
                              >
                                ({catCount})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* EMISIÓN ACTUAL */}
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, { es: 'Emisión actual (EPG en Vivo)', ca: 'Emissió actual (EPG en directe)', en: 'On air now (Live EPG)' })}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        id: 'all' as const,
                        icon: null,
                        label: pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'All' }),
                      },
                      {
                        id: 'sports_now' as const,
                        icon: Trophy,
                        label: pickLang(lang, { es: 'Deporte', ca: 'Esport', en: 'Sports' }),
                      },
                      {
                        id: 'cinema_now' as const,
                        icon: Film,
                        label: pickLang(lang, { es: 'Cine / Series', ca: 'Cinema / Sèries', en: 'Movies / Series' }),
                      },
                    ].map((ef) => {
                      const EpgIcon = ef.icon;
                      return (
                        <button
                          key={ef.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setEpgFilter(ef.id);
                          }}
                          className={`min-h-11 px-2.5 rounded-xl text-xs font-semibold border cursor-pointer inline-flex items-center justify-center gap-1.5 truncate ${
                            epgFilter === ef.id
                              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                              : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                          }`}
                        >
                          {EpgIcon && <EpgIcon className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate">{ef.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* STICKY ACTIONS BAR */}
                <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 bg-[#10121C]/95 backdrop-blur-md border-t border-white/[0.08] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setTvFavOnly(false);
                      setTvRegion('all');
                      setTdtCategory('all');
                      setEpgFilter('all');
                    }}
                    className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Limpiar filtros', ca: 'Netejar filtres', en: 'Reset filters' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setTvFiltersOpen(false);
                    }}
                    className="flex-1 min-h-12 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer shadow-[0_4px_20px_rgba(145,70,255,0.4)]"
                  >
                    {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
                  </button>
                </div>
              </div>
            </BottomSheet>
          </div>
        );
      })()}

      {/* ================================================================== */}
      {/* WORLD 4: YOUTUBE                                                   */}
      {/* ================================================================== */}
      {(worldMode === 'youtube' || (!worldMode && activeSection === 'youtube')) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {YOUTUBE_QUICK_TOPICS.map((topic) => {
              const label =
                lang === 'zh'
                  ? topic.labelZh
                  : lang === 'ca'
                  ? topic.labelCa
                  : lang === 'en'
                  ? topic.labelEn
                  : topic.labelEs;
              const active = debouncedYtQuery === topic.q;
              return (
                <button
                  key={topic.q}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setYtQuery(topic.q);
                    setDebouncedYtQuery(topic.q);
                  }}
                  className={`min-h-10 px-3.5 rounded-2xl text-xs font-bold border whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#9146FF] border-[#9146FF] text-white'
                      : 'bg-white/[0.05] border-white/[0.09] text-zinc-200 hover:bg-white/[0.1]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {loadingYt ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {ytResults.map((vid) => (
                <div
                  key={vid.id}
                  className="rounded-2xl overflow-hidden bg-[#11131B] border border-white/[0.08] flex flex-col justify-between"
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayYouTubeVideo(vid);
                    }}
                    className="text-left group cursor-pointer"
                  >
                    <div className="relative aspect-video bg-[#090A0F]">
                      <PosterImage
                        src={vid.thumbnail}
                        alt={vid.title}
                        aspect="video"
                        fallbackTitle={vid.title}
                        fallbackIcon={<Youtube className="w-7 h-7 text-[#BF94FF]" />}
                      />
                      {vid.duration && (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                          {vid.duration}
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <h4 className="font-display font-bold text-sm text-white line-clamp-2 leading-snug">
                        {vid.title}
                      </h4>
                      <p className="text-xs text-zinc-400 truncate">
                        {vid.channel}
                        {vid.views ? ` · ${vid.views}` : ''}
                      </p>
                    </div>
                  </button>

                  <div className="px-3 pb-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        onPlayYouTubeVideo(vid);
                      }}
                      className="flex-1 min-h-10 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onAddToQueue({
                          kind: 'youtube',
                          title: vid.title,
                          subtitle: vid.channel,
                          poster: vid.thumbnail,
                          youtubeId: vid.videoId,
                        });
                      }}
                      aria-label={t.addToQueue}
                      className="min-w-10 min-h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                className="w-full sm:max-w-xl max-h-[86vh] rounded-t-3xl sm:rounded-3xl bg-[#10121C]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.12] flex flex-col overflow-hidden shadow-2xl animate-sheet-up outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mobile Drag Handle */}
                <div className="sm:hidden w-10 h-1.5 bg-zinc-700 rounded-full mx-auto mt-3" />

                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChannelLogoBadge channel={selectedEpgChannel} size="md" />
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-base sm:text-lg text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{selectedEpgChannel.name}</span>
                        <span className="text-xs font-medium text-zinc-400 shrink-0">
                          · {getChannelRegionMeta(selectedEpgChannel).langTag}
                        </span>
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
                                    isCurrent ? 'text-[#BF94FF]' : 'text-zinc-400'
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
                                  className="h-full w-full bg-[#9146FF] rounded-full origin-left"
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
                            ? 'flex-1 bg-[#9146FF] hover:bg-[#7C2AE8] text-white'
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
