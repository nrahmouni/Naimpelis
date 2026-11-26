import type {
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
  LegalBoardMove,
} from './shared/boardGames';
import type {
  ParchisGameState,
  PartyColor,
  PartyGameState,
  PartyGameType,
} from './shared/partyGames';
import type {
  PinturilloGameState,
  PinturilloStroke,
} from './shared/pinturillo';
import type {
  Pool8BallState,
  PoolBallGroup,
  PoolBallState,
  PoolDifficulty,
  PoolFoulType,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from './shared/pool8Ball';
import type {
  ChapasBall,
  ChapasCap,
  ChapasFlagId,
  ChapasPlayerSeat,
  ChapasShotInput,
  ChapasTeamId,
  FutbolChapasState,
} from './shared/futbolChapas';
import type {
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSeat,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
} from './shared/headSoccer';
import type {
  EvaluatedPokerHand,
  PokerActionType,
  PokerCard,
  PokerGameState,
  PokerSeat,
  PokerStreet,
} from './shared/texasHoldem';
import type {
  BjCard,
  BjHandOutcome,
  BlackjackGameState,
  BlackjackHandScore,
  BlackjackPlayerHand,
  BlackjackSeat,
} from './shared/blackjack';

export type {
  BjCard,
  BjHandOutcome,
  BlackjackGameState,
  BlackjackHandScore,
  BlackjackPlayerHand,
  BlackjackSeat,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChapasBall,
  ChapasCap,
  ChapasFlagId,
  ChapasPlayerSeat,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
  EvaluatedPokerHand,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSeat,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  LegalBoardMove,
  ParchisGameState,
  PartyColor,
  PartyGameState,
  PartyGameType,
  PinturilloGameState,
  PinturilloStroke,
  PokerActionType,
  PokerCard,
  PokerGameState,
  PokerSeat,
  PokerStreet,
  Pool8BallState,
  PoolBallGroup,
  PoolBallState,
  PoolDifficulty,
  PoolFoulType,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
};

import type {
  RoomPollState,
  RoomQueueItem,
  StreamTrack,
} from './typesMediaAndSports';
export * from './typesMediaAndSports';

export type AppLanguage = 'es' | 'ca' | 'en' | 'zh' | 'rif';
export type AppTheme = 'oled' | 'soft-dark' | 'high-contrast' | 'light' | 'dark';
export type TextDensity = 'comfortable' | 'compact';
export type RoomRole = 'host' | 'mod' | 'viewer';

export interface Participant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  role?: RoomRole;
  joinedAt: number;
  isOnline?: boolean;
}

export type PlaybackEngineMode =
  | 'idle'
  | 'hls'
  | 'direct'
  | 'youtube'
  | 'embed'
  | 'cloud';

export interface ActiveSeriesContext {
  tmdbId: number;
  seriesTitle: string;
  season: number;
  episode: number;
  episodeTitle?: string;
  totalEpisodesInSeason?: number;
  totalSeasons?: number;
  poster?: string;
  backdrop?: string;
}

export interface VideoState {
  mode: PlaybackEngineMode;
  /** Currently playing proxied HLS URL, direct MP4 URL, YouTube video ID, or remote URL */
  url: string;
  backupStreamUrl?: string;
  rawSourceUrl: string;
  title: string;
  subtitle?: string;
  poster?: string;
  backdrop?: string;
  currentTime: number;
  isPlaying: boolean;
  isLive: boolean;
  tracks: StreamTrack[];
  activeTrackIndex: number;
  subtitles?: SubtitleTrackItem[];
  tmdbId?: number;
  seriesMeta?: ActiveSeriesContext;
  lastUpdated: number;
  updatedBy?: string;
}

export const MAX_MULTI_SCREENS = 4;

export interface SecondaryStreamState {
  id: string;
  url: string;
  rawSourceUrl: string;
  title: string;
  subtitle?: string;
  mode: 'hls' | 'direct';
  layout: 'corner' | 'split';
  fallbackUrls?: string[];
  matchId?: string;
  status?: 'loading' | 'ready' | 'error';
}

export interface MultiScreenSourceInput {
  sourceUrl: string;
  title: string;
  subtitle?: string;
  preferredSlotIndex?: number;
  fallbackUrls?: string[];
  matchId?: string;
  forceLayout?: 'split' | 'corner';
}

export interface SubtitleTrackItem {
  id: string;
  label: string;
  lang: string;
  url?: string;
  rawContent?: string;
}

export interface ChatReplyReference {
  id: string;
  senderName: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: number;
  replyTo?: ChatReplyReference;
  isSystem?: boolean;
  systemUserId?: string;
  systemType?:
    | 'join'
    | 'leave'
    | 'video_change'
    | 'play'
    | 'pause'
    | 'seek'
    | 'host_change'
    | 'poll'
    | 'lock';
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  senderColor: string;
  xOffset: number;
  timestamp: number;
}

export interface CloudBrowserState {
  active: boolean;
  url: string;
  title: string;
  isLoading: boolean;
  detectedStreamUrl?: string;
}

export interface WatchHistoryItem {
  id: string;
  mediaType: 'movie' | 'tv';
  tmdbId?: number;
  title: string;
  subtitle?: string;
  poster: string;
  backdrop?: string;
  year?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT' | 'FR' | 'PT' | 'IT' | 'DE' | 'AR' | 'QUALITY';
  bingetrixUrl?: string;
  movidyUrl?: string;
  gnulaUrl?: string;
  vestUrl?: string;
  resumeTimeSec?: number;
  durationSec?: number;
  watchedAt: number;
}

export interface CloudSavedRoom {
  roomCode: string;
  roomName: string;
  hasPin: boolean;
  pinCode?: string;
  hostOnlyControl: boolean;
  lastActiveTitle?: string;
  queueItems: RoomQueueItem[];
  updatedAt: number;
}

export interface RestoredRoomBlueprint {
  roomName: string;
  hostOnlyControl: boolean;
  pinCode?: string;
  queueItems: RoomQueueItem[];
}

export type TvRemoteCommandType =
  | 'vol_up'
  | 'vol_down'
  | 'toggle_mute'
  | 'toggle_fullscreen'
  | 'toggle_aspect'
  | 'toggle_hud'
  | 'reload_tv'
  | 'toggle_ambilight'
  | 'cycle_subtitles'
  | 'cycle_audio'
  | 'disconnect_tv';

export interface LanguageNoticePopup {
  id: string;
  type: 'success' | 'warning' | 'error';
  title: string;
  subtitle?: string;
}

export interface SavedFriend {
  friendId: string;
  name: string;
  avatar: string;
  color: string;
  friendCode?: string;
  addedAt: number;
}

export interface OnlineAppUser {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  friendCode: string;
  roomId?: string;
  roomName?: string;
  mediaTitle?: string;
  lastSeen: number;
}

export interface IncomingRoomInvite {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string;
  fromUserColor: string;
  fromFriendCode?: string;
  roomId: string;
  roomName: string;
  mediaTitle?: string;
  inviteAuthToken?: string;
  timestamp: number;
}

export interface IncomingFriendAddedNotice {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string;
  fromUserColor: string;
  fromFriendCode: string;
  timestamp: number;
}

export interface RoomData {
  id: string;
  name: string;
  hostId: string;
  hasPin?: boolean;
  hostOnlyControl?: boolean;
  activePoll?: RoomPollState | null;
  gameState?: BoardGameState | null;
  partyGameState?: import('./shared/partyGames').PartyGameState | null;
  pinturilloState?: PinturilloGameState | null;
  poolGameState?: Pool8BallState | null;
  chapasState?: FutbolChapasState | null;
  headSoccerState?: HeadSoccerOnlineState | null;
  pokerGameState?: PokerGameState | null;
  blackjackState?: BlackjackGameState | null;
  matchResponses?: import('./shared/protocol').RoomMatchResponsesState | null;
  videoState: VideoState;
  queue?: RoomQueueItem[];
  cloudState?: CloudBrowserState;
  participants: Participant[];
  messages: ChatMessage[];
  pinnedMessage?: ChatMessage | null;
  createdAt: number;
}

export type NotificationCategory = 'all' | 'invite' | 'football' | 'series' | 'update' | 'system';

export interface AppNotificationItem {
  id: string;
  category: Exclude<NotificationCategory, 'all'>;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  actionLabel?: string;
  roomId?: string;
  eventId?: string;
  tmdbId?: number;
}

export interface NotificationPreferences {
  invites: boolean;
  football: boolean;
  series: boolean;
  updates: boolean;
  soundEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface SubtitleStyleSettings {
  fontScale: number;
  fontColor: string;
  bgOpacity: number;
  textOpacity?: number;
  edgeShadow: 'shadow' | 'outline' | 'none';
  fontFamily?: 'sans' | 'serif' | 'mono';
}

export interface ScheduledRoomItem {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  scheduledForIso: string;
  createdAt: number;
}


