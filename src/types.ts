export type AppLanguage = 'es' | 'en';

export interface Participant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  joinedAt: number;
}

export type PlaybackEngineMode =
  | 'idle'
  | 'hls'
  | 'direct'
  | 'youtube'
  | 'cloud';

export interface StreamTrack {
  id: string;
  label: string;
  lang: string;
  quality?: string;
  /** Raw upstream reference */
  sourceUrl: string;
  /** Kind of resolver needed when switching to this track */
  resolverType:
    | 'movidy_embed'
    | 'vidhide_hls'
    | 'bingetrix_en'
    | 'sports_channel'
    | 'direct_hls'
    | 'direct_mp4'
    | 'youtube';
  /** Cached proxied HLS or direct URL ready for <video> */
  resolvedStreamUrl?: string;
}

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
  /** Currently playing proxied HLS URL, direct MP4 URL, YouTube video ID, or Cloud Browser URL */
  url: string;
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
  seriesMeta?: ActiveSeriesContext;
  lastUpdated: number;
  updatedBy?: string;
}

export interface SecondaryStreamState {
  url: string;
  rawSourceUrl: string;
  title: string;
  subtitle?: string;
  mode: 'hls' | 'direct';
  layout: 'corner' | 'split';
}

export interface SubtitleTrackItem {
  id: string;
  label: string;
  lang: string;
  url?: string;
  rawContent?: string;
}

export interface CatalogMovie {
  id: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  movidyUrl?: string;
  bingetrixUrl?: string;
  languages: string[];
}

export interface CastMemberItem {
  id: number;
  name: string;
  character: string;
  photo?: string;
}

export interface MediaRichDetails {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  tagline?: string;
  year: string;
  rating: string;
  runtimeText?: string;
  genres: string[];
  overview: string;
  poster: string;
  backdrop: string;
  trailerKey?: string;
  directorOrCreator?: string;
  cast: CastMemberItem[];
  similar: CatalogMovie[];
}

export interface TvSeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  poster?: string;
}

export interface TvEpisodeItem {
  id: string;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  overview: string;
  still: string;
  runtime?: number;
  airDate?: string;
  rating?: string;
}

export interface TvSeriesDetails {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  seasons: TvSeasonSummary[];
  activeSeason: number;
  episodes: TvEpisodeItem[];
}

export interface YouTubeSearchItem {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  views: string;
  thumbnail: string;
  url: string;
}

export interface RoomQueueItem {
  id: string;
  kind: 'movie' | 'tv' | 'youtube' | 'direct';
  title: string;
  subtitle: string;
  poster?: string;
  tmdbId?: number;
  season?: number;
  episode?: number;
  youtubeId?: string;
  url?: string;
  preferLang?: 'ES' | 'LAT' | 'VOSE' | 'EN';
  addedBy: string;
}

export type PollProposalItem = Omit<RoomQueueItem, 'id' | 'addedBy'>;

export interface RoomPollOption {
  id: string;
  item: PollProposalItem;
  voterIds: string[];
}

export interface RoomPollState {
  id: string;
  question: string;
  createdBy: string;
  createdAt: number;
  endsAt: number;
  isClosed: boolean;
  winnerOptionId?: string;
  options: RoomPollOption[];
}

export interface LiveScoreMatch {
  id: string;
  league: string;
  sport: 'soccer' | 'motor' | 'basketball';
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  homeLogo?: string;
  awayLogo?: string;
  statusText: string;
  isLive: boolean;
}

export interface SportsMatch {
  id: string;
  title: string;
  competition: string;
  sport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other';
  time: string;
  isLive: boolean;
  is247Channel?: boolean;
  channels: StreamTrack[];
}

export interface FavoriteChannelItem {
  favId: string;
  title: string;
  channelLabel: string;
  channelUrl: string;
  competition: string;
  sport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other';
  poster?: string;
  addedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
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
  preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN';
  bingetrixUrl?: string;
  movidyUrl?: string;
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
  videoState: VideoState;
  queue?: RoomQueueItem[];
  cloudState?: CloudBrowserState;
  participants: Participant[];
  messages: ChatMessage[];
  createdAt: number;
}


