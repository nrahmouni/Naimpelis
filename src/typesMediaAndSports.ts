export type ChannelHealthStatus = 'up' | 'degraded' | 'down' | 'unknown';

export interface TrackHealthInfo {
  status: ChannelHealthStatus;
  latencyMs?: number;
  failCount?: number;
  checkedAt?: number;
  statusCode?: number;
}

export interface ChannelHealthSummary {
  bestStatus: ChannelHealthStatus;
  upCount: number;
  totalCount: number;
  bestLatencyMs?: number;
}

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
    | 'vest_hls'
    | 'embed_sniff'
    | 'bingetrix_en'
    | 'sports_channel'
    | 'tdt_hls'
    | 'elahmad_live'
    | 'direct_hls'
    | 'direct_mp4'
    | 'youtube'
    | 'web_embed'
    | 'cloud_browser';
  /** Cached proxied HLS or direct URL ready for <video> */
  resolvedStreamUrl?: string;
  /** Live health status measured by server channel health monitor */
  health?: TrackHealthInfo;
}

export type StreamingProviderId =
  | 'all'
  | 'netflix'
  | 'hbomax'
  | 'disney'
  | 'prime'
  | 'apple'
  | 'movistar'
  | 'skyshowtime'
  | 'anime_all'
  | 'crunchyroll'
  | 'animebox'
  | 'jkanime'
  | 'animeflv';

export interface CatalogMovie {
  id: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  seasonNumber?: number;
  episodeNumber?: number;
  title: string;
  originalTitle?: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  movidyUrl?: string;
  gnulaUrl?: string;
  vestUrl?: string;
  bingetrixUrl?: string;
  languages: string[];
  platform?: string;
  providerId?: StreamingProviderId;
  genres?: string[];
  seasonsCount?: number;
  addedAt?: number;
  is4k?: boolean;
  quality?: string;
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
  logoUrl?: string;
  dominantColor?: string;
  trailerKey?: string;
  directorOrCreator?: string;
  cast: CastMemberItem[];
  similar: CatalogMovie[];
  availableLanguages?: ('ES' | 'LAT' | 'VOSE' | 'EN')[];
  watchProviders?: string[];
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
  availableLanguages?: ('ES' | 'LAT' | 'VOSE' | 'EN')[];
}

export interface CatalaCatalogItem {
  id: string;
  title: string;
  originalTitle: string;
  tmdbId?: number;
  mediaType: 'tv' | 'movie';
  category: 'classics' | 'shonen' | 'movies' | 'all';
  eraTag: string;
  episodeHint: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  seasonCount: number;
}

export interface CatalaEpisodeItem {
  id: string;
  episodeNumber: number;
  detectedNumber?: number;
  seasonNumber: number;
  title: string;
  overview: string;
  still: string;
  runtime?: number;
  streamUrl?: string;
  youtubeVideoId?: string;
  ccmaVideoId?: string;
  audioNote?: string;
  sourceType: 'archive_mp4' | 'ccma_3cat' | 'youtube';
  tracks?: StreamTrack[];
}

export interface CatalaSeriesDetails {
  id: string;
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  eraTag: string;
  year?: string;
  rating?: string;
  overview: string;
  poster: string;
  backdrop: string;
  activeSeason: number;
  seasons: TvSeasonSummary[];
  episodes: CatalaEpisodeItem[];
}

export interface CatalaCommunityLink {
  id: string;
  label: string;
  url: string;
  desc: string;
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
  gnulaUrl?: string;
  vestUrl?: string;
  preferLang?: 'ES' | 'LAT' | 'VOSE' | 'EN';
  addedBy: string;
  voterIds?: string[];
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
  healthSummary?: ChannelHealthSummary;
  matchMeta?: {
    eventId?: string;
    fotmobMatchId?: string;
    leagueSlug?: string;
    leagueName?: string;
    homeTeam: string;
    awayTeam: string;
    homeShort?: string;
    awayShort?: string;
    homeLogo?: string;
    awayLogo?: string;
    homeScore?: string;
    awayScore?: string;
    statusState?: 'live' | 'upcoming' | 'finished';
    statusLabel?: string;
    kickoffMs?: number;
    kickoffIso?: string;
    kickoffTime?: string;
    spanishBroadcaster?: FootballMatchboardItem['spanishBroadcaster'];
  };
}

export interface FootballMatchboardItem {
  id: string;
  eventId: string;
  fotmobMatchId?: string;
  leagueSlug: string;
  regionName: string;
  leagueName: string;
  groupTitle: string;
  regionFlagUrl: string;
  leagueLogoUrl?: string;
  kickoffIso: string;
  kickoffTime: string;
  kickoffMs?: number;
  kickoffDateLabel?: string;
  statusState: 'live' | 'upcoming' | 'finished';
  statusLabel: string;
  matchdayLabel?: string;
  spanishBroadcaster?: { name: string; brand: 'movistar' | 'dazn' | 'dazn_mplus' | 'rtve'; badgeColor: string } | null;
  verifiedTvGuide?: { checked: boolean; es?: string[]; en?: string[]; zh?: string[] };
  homeTeam: string;
  awayTeam: string;
  homeShort: string;
  awayShort: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: string;
  awayScore: string;
  homeRedCards?: number;
  awayRedCards?: number;
  channels: StreamTrack[];
}

export interface FootballMatchStatItem {
  key: string;
  label: string;
  homeValue: string;
  awayValue: string;
  homePct: number;
  awayPct: number;
}

export interface FootballMatchTimelineEvent {
  id: string;
  clock: string;
  type: 'goal' | 'yellow-card' | 'red-card' | 'substitution' | 'var' | 'other';
  typeLabel: string;
  playerName: string;
  assistOrSubName?: string;
  side: 'home' | 'away' | 'neutral';
  detailText?: string;
}

export interface FootballMatchLineupPlayer {
  id: string;
  jersey: string;
  name: string;
  shortName?: string;
  position: string;
  starter: boolean;
  age?: number;
  club?: string;
  country?: string;
  height?: string;
  marketValue?: string;
  marketValueNum?: number;
  rating?: string;
  photoUrl?: string;
  isCaptain?: boolean;
  goals?: number;
  assists?: number;
  yellowCard?: boolean;
  redCard?: boolean;
  subInMinute?: string;
  subOutMinute?: string;
  layout?: {
    x: number;
    y: number;
  };
}

export interface FootballMatchLineupTeam {
  teamName: string;
  formation?: string;
  coach?: string;
  starters: FootballMatchLineupPlayer[];
  substitutes: FootballMatchLineupPlayer[];
  unavailable?: { id: string; name: string; reason?: string; photoUrl?: string }[];
  avgRating?: string;
  totalMarketValue?: string;
  averageAge?: number;
}

export interface FootballMatchCommentaryItem {
  id: string;
  minute: string;
  text: string;
  type?: string;
  isImportant?: boolean;
}

export interface FootballMatchShotItem {
  id?: string;
  x: number;
  y: number;
  onTarget: boolean;
  isGoal?: boolean;
  isBlocked?: boolean;
  home: boolean;
  minute: string;
  player: string;
  xG?: number;
  shotType?: string;
  situation?: string;
  period?: string;
  onGoalShot?: {
    x: number;
    y: number;
  } | null;
}

export interface FootballMomentumPoint {
  minute: number;
  value: number;
}

export interface FootballStandingRow {
  rank: number;
  teamId?: string;
  teamName: string;
  shortName?: string;
  logo?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  pts: number;
  deduction?: number;
  qualColor?: string;
  isHomeTeam?: boolean;
  isAwayTeam?: boolean;
  isPlayingLive?: boolean;
  liveMatchLabel?: string;
}

export interface FootballStandingsLegendItem {
  title: string;
  color: string;
}

export interface FootballStandingsGroup {
  groupName: string;
  all: FootballStandingRow[];
  home?: FootballStandingRow[];
  away?: FootballStandingRow[];
}

export interface FootballStandingsData {
  leagueId?: string;
  leagueName?: string;
  hasLiveMatches?: boolean;
  legend?: FootballStandingsLegendItem[];
  groups: FootballStandingsGroup[];
}

export interface FootballMatchDetails {
  eventId: string;
  fotmobMatchId?: string;
  source?: string;
  venue?: string;
  referee?: string;
  attendance?: string;
  tournamentName?: string;
  roundName?: string;
  statusState?: 'live' | 'upcoming' | 'finished';
  statusLabel?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeShort?: string;
  awayShort?: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: string;
  awayScore?: string;
  homeColor?: string;
  awayColor?: string;
  lineupsConfirmed?: boolean;
  stats: FootballMatchStatItem[];
  statsByPeriod?: {
    all: FootballMatchStatItem[];
    firstHalf: FootballMatchStatItem[];
    secondHalf: FootballMatchStatItem[];
  };
  events: FootballMatchTimelineEvent[];
  homeLineup?: FootballMatchLineupTeam;
  awayLineup?: FootballMatchLineupTeam;
  commentary?: FootballMatchCommentaryItem[];
  shotsMap?: FootballMatchShotItem[];
  momentum?: FootballMomentumPoint[];
  standings?: FootballStandingsData;
  updatedAt?: number;
}

export type TdtCategory =
  | 'movistar'
  | 'dazn'
  | 'uk_sports'
  | 'china_football'
  | 'beinsports'
  | 'bein_arabic'
  | 'marruecos'
  | 'documentales'
  | 'usa_tv'
  | 'europa_tv'
  | 'noticias_intl'
  | 'espn'
  | 'dsports'
  | 'tnt_space'
  | 'generalistas'
  | 'cine_series'
  | 'entretenimiento'
  | 'noticias_deportes'
  | 'infantil_autonomicas'
  | 'world_cricket'
  | 'elahmad_mena'
  | 'adrar_europa'
  | 'famelack_movies'
  | 'kids_world'
  | 'belix_live'
  | 'rbtv_sports';

export interface SpanishTdtChannel {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  logoUrl?: string;
  network: string;
  category: TdtCategory;
  quality: string;
  description: string;
  countryCode?: string;
  sourceHub?: 'tdt' | 'famelack' | 'elahmad' | 'freetv' | 'iptvorg' | 'sportzfy' | 'belix' | 'rbtv';
  channels: StreamTrack[];
  healthSummary?: ChannelHealthSummary;
}

export interface EpgProgramItem {
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  rating?: string;
  icon?: string;
  startMs: number;
  stopMs: number;
  startLabel: string;
  stopLabel: string;
  isLiveSport?: boolean;
}

export interface ChannelLiveEpg {
  channelId: string;
  now: EpgProgramItem | null;
  next: EpgProgramItem | null;
  upcoming: EpgProgramItem[];
  progressPct: number;
  remainingMin: number;
}

export interface FavoriteChannelItem {
  favId: string;
  title: string;
  channelLabel: string;
  channelUrl: string;
  competition: string;
  sport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'tdt' | 'other';
  poster?: string;
  addedAt: number;
}
