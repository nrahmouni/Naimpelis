export interface Participant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  joinedAt: number;
}

export type VideoSourceType = 'youtube' | 'vimeo' | 'direct' | 'iframe';

export interface VideoState {
  url: string;
  title: string;
  sourceType: VideoSourceType;
  currentTime: number;
  isPlaying: boolean;
  lastUpdated: number;
  updatedBy?: string;
  poster?: string;
  overview?: string;
  releaseYear?: string;
  originalPortalUrl?: string;
  altEmbeds?: string[];
  trailerUrl?: string;
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
  systemType?: 'join' | 'leave' | 'video_change' | 'play' | 'pause' | 'seek' | 'host_change';
  videoTime?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  senderColor: string;
  timestamp: number;
}

export interface RoomData {
  id: string;
  name: string;
  hostId: string;
  videoState: VideoState;
  participants: Participant[];
  messages: ChatMessage[];
  createdAt: number;
}

export interface SampleVideo {
  id: string;
  title: string;
  category: string;
  duration: string;
  thumbnail: string;
  url: string;
  description: string;
}
