import type { CatalogMovie, SpanishTdtChannel, SportsMatch } from '../../../src/types.ts';

export type VoiceIntent =
  | 'play_channel'
  | 'play_match'
  | 'play_movie'
  | 'play_series'
  | 'recommend_movies'
  | 'recommend_series'
  | 'browse_channels'
  | 'select_ordinal'
  | 'resume_history'
  | 'sports_info'
  | 'open_world'
  | 'player_control'
  | 'chat';

export interface VoiceAssistantAction {
  type: 'open_world' | 'player_control' | 'open_friends' | 'surprise_me';
  payload?: string;
}

export interface VoiceChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface VoiceAssistantCandidateItem {
  kind: 'channel' | 'movie' | 'series' | 'match';
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  targetSeason?: number;
  targetEpisode?: number;
  channel?: SpanishTdtChannel & { logoUrl?: string };
  media?: CatalogMovie & { targetSeason?: number; targetEpisode?: number };
  match?: SportsMatch;
}

export interface ParsedVoiceIntent {
  spokenReply: string;
  intent: VoiceIntent;
  autoPlay: boolean;
  action?: VoiceAssistantAction;
  channelKeywords: string[];
  categoryHint: string;
  matchKeywords: string[];
  targetSeason?: number;
  targetEpisode?: number;
  tmdbQuery: {
    mediaType: 'movie' | 'tv' | 'multi';
    genreId?: number;
    timeframe?: 'this_month' | 'this_year' | 'all_time' | 'trending';
    sortBy?: 'top_rated' | 'popular' | 'newest';
    limit: number;
    titleSearch?: string;
    personSearch?: string;
    personRole?: 'director' | 'actor' | 'any';
  };
}

export interface RegisterVoiceAssistantDeps {
  getChannels: () => Array<SpanishTdtChannel & { logoUrl?: string }>;
  resolveLogoUrl: (ch: { id: string; name?: string; shortMark?: string; logoUrl?: string | null }) => string | null | undefined;
  getSportsMatches: () => Promise<SportsMatch[]>;
}

export interface TmdbDiscoverResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  media_type?: 'movie' | 'tv' | 'person';
}
