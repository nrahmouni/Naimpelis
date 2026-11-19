import type { WebSocket } from 'ws';
import type { TrackRecord } from '../extractors/httpHelpers.ts';
import type { CloudSessionLite } from '../services/streamSnifferService.ts';
import type { BoardGameState } from '../../src/shared/boardGames.ts';
import type { PartyGameState } from '../../src/shared/partyGames.ts';
import {
  redactPinturilloForUser,
  type PinturilloGameState,
} from '../../src/shared/pinturillo.ts';
import type { Pool8BallState } from '../../src/shared/pool8Ball.ts';
import type { FutbolChapasState } from '../../src/shared/futbolChapas.ts';
import type { HeadSoccerOnlineState } from '../../src/shared/headSoccer.ts';
import {
  redactPokerStateForUser,
  type PokerGameState,
} from '../../src/shared/texasHoldem.ts';
import {
  redactBlackjackState,
  type BlackjackGameState,
} from '../../src/shared/blackjack.ts';
import type {
  RoomGameInvite,
  RoomGameInviteType,
  RoomMatchResponsesState,
  VoicePeerState,
} from '../../src/shared/protocol.ts';

export const MAX_WS_PAYLOAD_BYTES = 32_768;

export interface CloudRoomSession extends CloudSessionLite {
  closed: boolean;
}

export interface RoomChatMessageRecord {
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

export interface RoomRecord {
  id: string;
  name: string;
  creatorId: string;
  hostId: string;
  coHostIds: string[];
  videoState: {
    mode: 'idle' | 'hls' | 'direct' | 'youtube' | 'embed' | 'cloud';
    url: string;
    rawSourceUrl: string;
    title: string;
    subtitle?: string;
    poster?: string;
    backdrop?: string;
    currentTime: number;
    isPlaying: boolean;
    isLive: boolean;
    tracks: TrackRecord[];
    activeTrackIndex: number;
    seriesMeta?: Record<string, unknown>;
    lastUpdated: number;
    updatedBy?: string;
  };
  pinCode?: string;
  hostOnlyControl: boolean;
  activePoll: {
    id: string;
    question: string;
    createdBy: string;
    createdAt: number;
    endsAt: number;
    isClosed: boolean;
    winnerOptionId?: string;
    options: {
      id: string;
      item: Record<string, unknown>;
      voterIds: string[];
    }[];
  } | null;
  queue: Array<{
    id: string;
    title: string;
    voterIds?: string[];
    voteCount?: number;
    [key: string]: unknown;
  }>;
  participants: {
    id: string;
    name: string;
    avatar: string;
    color: string;
    isHost: boolean;
    role?: 'host' | 'mod' | 'viewer';
    joinedAt: number;
  }[];
  messages: RoomChatMessageRecord[];
  pinnedMessage?: RoomChatMessageRecord | null;
  lastTvRemoteCommand?: {
    seq: number;
    command: string;
    senderName: string;
    ts: number;
  };
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
}

export interface TvPairingSession {
  code: string;
  ws?: WebSocket | null;
  createdAt: number;
  expiresAt: number;
  pairedPayload?: {
    roomId: string;
    roomName: string;
    tvAuthToken: string;
    claimedBy: string;
  };
}

export interface ClientMeta {
  ws: WebSocket;
  roomId?: string;
  roomName?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  userColor?: string;
  friendCode?: string;
  verifiedUid?: string;
  lastSeen?: number;
}

export function buildHostGameInvitePayload(params: {
  room: {
    id: string;
    name: string;
    hostId: string;
    creatorId: string;
    participants: Array<{ id: string; name: string; avatar: string }>;
  };
  senderUserId?: string;
  senderName?: string;
  senderAvatar?: string;
  gameType: RoomGameInviteType;
  soloLocal?: boolean;
}): RoomGameInvite | null {
  const { room, senderUserId, senderName, senderAvatar, gameType, soloLocal } = params;
  if (soloLocal || !senderUserId) return null;
  const isHostStarter = room.hostId === senderUserId || room.creatorId === senderUserId;
  if (!isHostStarter) return null;

  const hasCompanion = room.participants.some(
    (p) => p.id !== senderUserId && !p.name.includes('(TV)') && p.avatar !== '📺'
  );
  if (!hasCompanion) return null;

  const actor = room.participants.find((p) => p.id === senderUserId);
  const now = Date.now();
  return {
    id: `g-inv-${gameType}-${now}-${Math.random().toString(36).slice(2, 7)}`,
    roomId: room.id,
    gameType,
    inviterId: senderUserId,
    inviterName: actor?.name || senderName || 'Anfitrión',
    inviterAvatar: actor?.avatar || senderAvatar || '🎮',
    roomName: room.name || `Sala ${room.id.toUpperCase()}`,
    createdAt: now,
  };
}

export function sanitizeRoomFromSnapshot(item: RoomRecord): RoomRecord {
  const validModes = new Set(['idle', 'hls', 'direct', 'youtube', 'embed', 'cloud']);
  const vs = item.videoState;
  const isInvalidOrGame =
    !vs ||
    !validModes.has(vs.mode) ||
    (typeof vs.url === 'string' && vs.url.startsWith('arcade://'));

  const resolvedCreatorId = item.creatorId || item.hostId || '';
  return {
    ...item,
    creatorId: resolvedCreatorId,
    hostId: resolvedCreatorId,
    coHostIds: Array.isArray(item.coHostIds) ? item.coHostIds : [],
    hostOnlyControl: typeof item.hostOnlyControl === 'boolean' ? item.hostOnlyControl : true,
    videoState: isInvalidOrGame
      ? {
          mode: 'idle',
          url: '',
          rawSourceUrl: '',
          title: 'RiffanTV · Elige película, serie, partido o YouTube',
          subtitle: 'Proyección sincronizada en alta definición sin anuncios',
          currentTime: 0,
          isPlaying: false,
          isLive: false,
          tracks: [],
          activeTrackIndex: 0,
          lastUpdated: Date.now(),
        }
      : vs,
    participants: [],
    activePoll: null,
  };
}

export function serializeRoomSnapshot(r: RoomRecord) {
  return {
    id: r.id,
    name: r.name,
    creatorId: r.creatorId || r.hostId,
    hostId: r.creatorId || r.hostId,
    coHostIds: r.coHostIds || [],
    pinCode: r.pinCode,
    hostOnlyControl: r.hostOnlyControl,
    pinnedMessage: r.pinnedMessage ?? null,
    videoState:
      r.videoState.mode === 'cloud'
        ? {
            ...r.videoState,
            mode: 'idle' as const,
            url: '',
            isPlaying: false,
          }
        : r.videoState,
    queue: (r.queue || []).slice(0, 20),
    messages: (r.messages || []).slice(-60),
    gameState: r.gameState ?? null,
    partyGameState: r.partyGameState ?? null,
    createdAt: r.createdAt,
  };
}

export function createInitialRoomRecord(roomId: string, roomName?: string): RoomRecord {
  const now = Date.now();
  return {
    id: roomId,
    name: roomName || `Sala ${roomId.toUpperCase()}`,
    creatorId: '',
    hostId: '',
    coHostIds: [],
    pinCode: undefined,
    hostOnlyControl: true,
    activePoll: null,
    gameState: null,
    partyGameState: null,
    chapasState: null,
    headSoccerState: null,
    pokerGameState: null,
    blackjackState: null,
    matchResponses: null,
    pinnedMessage: null,
    videoState: {
      mode: 'idle',
      url: '',
      rawSourceUrl: '',
      title: 'RiffanTV · Elige película, serie, partido o YouTube',
      subtitle: 'Reproducción HD sincronizada sin anuncios',
      currentTime: 0,
      isPlaying: false,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      lastUpdated: now,
    },
    queue: [],
    participants: [],
    messages: [
      {
        id: `sys-welcome-${now}`,
        senderId: 'system',
        senderName: 'RiffanTV',
        senderAvatar: '🎬',
        senderColor: '#9146FF',
        text: 'Bienvenido a RiffanTV. Elige cualquier película en Español o VO, serie, fútbol en vivo o vídeo para ver juntos sin anuncios.',
        timestamp: now,
        isSystem: true,
      },
    ],
    createdAt: now,
  };
}

export function computeAuthoritativeVideoState(room: RoomRecord) {
  const now = Date.now();
  const vs = { ...room.videoState };
  if (
    vs.isPlaying &&
    !vs.isLive &&
    (vs.mode === 'hls' || vs.mode === 'direct' || vs.mode === 'youtube') &&
    Number.isFinite(vs.lastUpdated) &&
    vs.lastUpdated > 0
  ) {
    const elapsedSec = Math.max(0, (now - vs.lastUpdated) / 1000);
    vs.currentTime = (Number.isFinite(vs.currentTime) ? vs.currentTime : 0) + elapsedSec;
    vs.lastUpdated = now;
  }
  return vs;
}

export function serializeRoomForClient(
  room: RoomRecord,
  viewerUserId = '',
  voicePeers: VoicePeerState[] = []
) {
  const { pinCode, ...safeRoom } = room;
  return {
    ...safeRoom,
    pinturilloState: redactPinturilloForUser(room.pinturilloState ?? null, viewerUserId),
    pokerGameState: redactPokerStateForUser(room.pokerGameState ?? null, viewerUserId),
    blackjackState: redactBlackjackState(room.blackjackState ?? null),
    hasPin: Boolean(pinCode),
    voicePeers,
    videoState: computeAuthoritativeVideoState(room),
  };
}

export function getRoomCompanions(room: RoomRecord, excludeUserId?: string) {
  return room.participants.filter(
    (p) => p.id !== excludeUserId && !p.name.includes('(TV)') && p.avatar !== '📺'
  );
}

export function hasPendingMatchResponses(room: RoomRecord, gameType: RoomGameInviteType): boolean {
  if (!room.matchResponses || room.matchResponses.gameType !== gameType) return false;
  return room.matchResponses.responses.some((r) => r.status === 'pending');
}
