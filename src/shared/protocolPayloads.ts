import type {
  BoardGameState,
  FutbolChapasState,
  HeadSoccerOnlineState,
  PartyGameState,
  PinturilloGameState,
  PokerGameState,
  Pool8BallState,
  BlackjackGameState,
} from './protocolGameTypes.ts';

export type MediaType = 'movie' | 'tv' | 'youtube' | 'direct' | 'stream' | 'cloud';

export type VideoSyncAction = 'play' | 'pause' | 'seek' | 'change_url' | 'sync_request';

export type RoomRole = 'host' | 'mod' | 'viewer';

export interface AuthoritativeVideoState {
  url: string;
  playing: boolean;
  currentTime: number;
  lastUpdated: number;
  updatedBy: string;
  playbackRate?: number;
  mediaType?: MediaType;
  title?: string;
  poster?: string;
  backdrop?: string;
  mode?: 'hls' | 'direct' | 'cloud' | 'youtube';
  tmdbId?: string;
  season?: number;
  episode?: number;
  preferLang?: string;
}

export interface RoomParticipant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  role?: RoomRole;
  joinedAt: number;
  isOnline?: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
  systemUserId?: string;
  systemType?: 'join' | 'leave' | 'video_change' | 'host_transfer' | 'host_change' | 'poll' | 'lock';
}

export interface FloatingReactionEvent {
  id: string;
  emoji: string;
  senderName: string;
  senderColor: string;
  xOffset: number;
  timestamp: number;
}

export interface VoicePeerState {
  userId: string;
  userName: string;
  avatar: string;
  color: string;
  isMuted: boolean;
  joinedAt: number;
}

export interface VoiceSignalPayload {
  roomId: string;
  targetUserId: string;
  signalType: 'offer' | 'answer' | 'ice';
  sdp?: { type: string; sdp?: string };
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export type RoomGameInviteType =
  | 'pool'
  | 'chapas'
  | 'headsoccer'
  | 'poker'
  | 'blackjack'
  | 'parchis'
  | 'uno'
  | 'pinturillo'
  | 'chess'
  | 'checkers'
  | 'connect4';

export interface RoomGameInvite {
  id: string;
  roomId: string;
  gameType: RoomGameInviteType;
  inviterId: string;
  inviterName: string;
  inviterAvatar: string;
  roomName: string;
  createdAt: number;
}

export type RoomMatchInviteResponseStatus = 'pending' | 'accepted' | 'declined';

export interface RoomMatchInviteResponseEntry {
  userId: string;
  userName: string;
  avatar: string;
  status: RoomMatchInviteResponseStatus;
  updatedAt: number;
}

export interface RoomMatchResponsesState {
  inviteId: string;
  gameType: RoomGameInviteType;
  hostId: string;
  hostName: string;
  createdAt: number;
  responses: RoomMatchInviteResponseEntry[];
}

export interface RoomStatePayload {
  id: string;
  name: string;
  hostId: string;
  creatorId?: string;
  coHostIds?: string[];
  participants: RoomParticipant[];
  voicePeers?: VoicePeerState[];
  videoState: AuthoritativeVideoState;
  messages: RoomChatMessage[];
  pinnedMessage?: RoomChatMessage | null;
  hasPin: boolean;
  hostOnlyControl?: boolean;
  gameState?: BoardGameState | null;
  partyGameState?: PartyGameState | null;
  pinturilloState?: PinturilloGameState | null;
  poolGameState?: Pool8BallState | null;
  chapasState?: FutbolChapasState | null;
  headSoccerState?: HeadSoccerOnlineState | null;
  pokerGameState?: PokerGameState | null;
  blackjackState?: BlackjackGameState | null;
  matchResponses?: RoomMatchResponsesState | null;
  createdAt: number;
  serverTime?: number;
}

export interface TypingUserPayload {
  roomId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}
