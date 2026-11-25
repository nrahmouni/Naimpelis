export type ReelsMoodFilter =
  | 'para_ti'
  | 'estrenos'
  | 'accion'
  | 'thriller'
  | 'scifi'
  | 'comedia'
  | 'series';

export type ReelsContentMode = 'all' | 'trailers' | 'scenes';

export interface ReelClipSource {
  id: string;
  kind: 'trailer' | 'pro_scene';
  label: string;
  videoId: string;
  title: string;
  startSec: number;
  durationLabel?: string;
}

export interface ReelHostComment {
  hook: string;
  whyForYou: string;
  proMoment: string;
  moodLabel: string;
  aiGenerated: boolean;
}

export interface MovieReelItem {
  id: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  year: string;
  rating: string;
  genres: string[];
  genreIds: number[];
  overview: string;
  poster: string;
  backdrop: string;
  logoUrl?: string;
  clips: ReelClipSource[];
  defaultClipIndex: number;
  hostComment: ReelHostComment;
  recommendationReason: string;
  seedMatchTitle?: string;
}

export interface ReelsTasteSeed {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title?: string;
}

export interface ReelsTasteProfile {
  likedIds: string[];
  dislikedIds: string[];
  seenIds: string[];
  genreScores: Record<number, number>;
  likedSeeds: ReelsTasteSeed[];
  likedTitles: string[];
  voiceEnabled: boolean;
  autoAdvance: boolean;
  muted: boolean;
}
