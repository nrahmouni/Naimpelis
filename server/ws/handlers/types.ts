import type { WebSocket } from 'ws';
import type { LruTtlCache } from '../../utils/lruCache.ts';
import type { VoicePeerState, RoomGameInviteType } from '../../../src/shared/protocol.ts';
import type {
  ClientMeta,
  CloudRoomSession,
  RoomChatMessageRecord,
  RoomRecord,
  TvPairingSession,
  serializeRoomForClient as serializeRoomForClientBase,
} from '../roomHubHelpers.ts';

export interface OnlineUserSnapshot {
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

export interface RoomHubContext {
  rooms: Map<string, RoomRecord>;
  cloudSessions: Map<string, CloudRoomSession>;
  roomPollTimers: Map<string, ReturnType<typeof setTimeout>>;
  partyBotTimers: Map<string, ReturnType<typeof setTimeout>>;
  boardTurnTimers: Map<string, ReturnType<typeof setTimeout>>;
  pinturilloTimers: Map<string, ReturnType<typeof setTimeout>>;
  poolTurnTimers: Map<string, ReturnType<typeof setTimeout>>;
  poolDisconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  chapasTurnTimers: Map<string, ReturnType<typeof setTimeout>>;
  pokerBotTimers: Map<string, ReturnType<typeof setTimeout>>;
  headSoccerSeqByRoom: Map<string, number>;
  roomVoicePeers: Map<string, Map<string, VoicePeerState>>;
  tvPairingSessions: LruTtlCache<string, TvPairingSession>;
  tvSocketToCode: Map<WebSocket, string>;
  tvHttpHeartbeats: LruTtlCache<string, number>;
  tvAuthTokens: LruTtlCache<string, { roomId: string; expiresAt: number }>;
  clients: Map<WebSocket, ClientMeta>;
  pendingDirectInvites: LruTtlCache<string, unknown[]>;

  schedulePersistRoom: (roomId?: string) => void;
  generateTvPairingCode: () => string;
  getOrCreateRoom: (roomId: string, roomName?: string) => { room: RoomRecord; isFresh: boolean };
  hydrateRoomFromDistributedIfMissing: (roomId: string) => Promise<void>;
  getVoicePeersForRoom: (roomId: string) => VoicePeerState[];
  removeVoicePeer: (roomId: string, userId: string) => void;
  serializeRoomForClient: (room: RoomRecord, viewerUserId?: string) => ReturnType<typeof serializeRoomForClientBase>;
  broadcastToRoom: (roomId: string, message: unknown, excludeWs?: WebSocket) => void;
  broadcastPokerState: (room: RoomRecord, message?: RoomChatMessageRecord | null) => void;
  broadcastBlackjackState: (room: RoomRecord, message?: RoomChatMessageRecord | null) => void;
  broadcastPinturilloState: (room: RoomRecord, message?: RoomChatMessageRecord | null) => void;
  clearMatchResponses: (room: RoomRecord, onlyGameType?: RoomGameInviteType) => void;
  maybeBroadcastHostGameInvite: (
    room: RoomRecord,
    senderWs: WebSocket,
    senderMeta: ClientMeta | undefined,
    gameType: RoomGameInviteType,
    soloLocal?: boolean
  ) => void;
  claimTvPairingCodeCore: (params: {
    rawCode: string;
    targetRoomId: string;
    roomNameHint?: string;
    claimedByRaw?: string;
  }) =>
    | { ok: true; code: string; roomId: string; roomName: string; tvAuthToken: string }
    | { ok: false; error: string };
  deriveServerFriendCode: (userId: string) => string;
  getOnlineUsersSnapshot: () => OnlineUserSnapshot[];
  scheduleBroadcastOnlineUsers: () => void;
  flushPendingInvitesForClient: (ws: WebSocket, userId: string, friendCode: string) => void;
  finalizeRoomPoll: (roomId: string, expectedPollId: string) => void;
  stopCloudSession: (roomId: string) => Promise<void>;
  startCloudSession: (roomId: string, targetUrl: string) => Promise<void>;

  stopPokerBotTimer: (roomId: string) => void;
  schedulePokerBotTimer: (room: RoomRecord) => void;
  stopPinturilloTimer: (roomId: string) => void;
  schedulePinturilloLifecycle: (room: RoomRecord) => void;
  stopPoolTurnTimer: (roomId: string) => void;
  clearPoolDisconnectTimer: (roomId: string, userId: string) => void;
  schedulePoolTurnTimer: (room: RoomRecord) => void;
  stopChapasTimer: (roomId: string) => void;
  scheduleChapasTurnTimer: (room: RoomRecord) => void;
  stopBoardTurnTimer: (roomId: string) => void;
  scheduleBoardTurnTimer: (room: RoomRecord) => void;
  stopPartyBotTimer: (roomId: string) => void;
  schedulePartyBotTurnIfNeeded: (room: RoomRecord) => void;
}

export type WsMessageHandler = (
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ws: WebSocket,
  ctx: RoomHubContext
) => Promise<boolean> | boolean;
