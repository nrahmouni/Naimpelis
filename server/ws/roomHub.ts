import crypto from 'crypto';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import {
  fetchSportsHtmlHop,
  verifyM3u8HasCleanVideoFrame,
} from '../extractors/sportsExtractor.ts';
import { resolveCloudSessionLite, type CloudSessionLite } from '../services/streamSnifferService.ts';
import {
  assignParticipantRole,
  canUserChangeRoomMedia,
  canUserControlRoom,
  pruneJoinCooldownCache,
  shouldEmitJoinSystemMessage,
  toggleQueueItemVote,
} from '../services/roomSync.ts';
import { verifyFirebaseIdToken } from '../services/firebaseAuthVerify.ts';
import {
  wsEnvelopeSchema,
  wsGameMoveSchema,
  wsJoinRoomSchema,
  wsPartyGameActionSchema,
  wsPartyGameStartSchema,
  wsPinChatSchema,
  wsPollStartSchema,
  wsQueueReorderSchema,
  WsRateLimiter,
  wsRegisterPresenceSchema,
  wsSendChatSchema,
  wsTypingStateSchema,
  wsVoiceRoomSchema,
  wsVoiceSignalSchema,
  wsVoiceStateSchema,
} from './wsSchemas.ts';
import {
  isDistributedStoreEnabled,
  loadDistributedKey,
  loadRoomsSnapshotFromDisk,
  saveDistributedKey,
  writeRoomsSnapshotToDisk,
} from '../services/distributedStore.ts';
import {
  applyBoardMove,
  chooseAutoBoardMove,
  createInitialBoardGameState,
  joinGameSeat,
  resetBoardGame,
  resignBoardGame,
  startBoardMatch,
  type BoardClockMinutes,
  type BoardCoord,
  type BoardGameState,
  type BoardGameType,
  type ChessPromotionPiece,
} from '../../src/shared/boardGames.ts';
import {
  callUnoAction,
  catchUnoFailureAction,
  chooseBotParchisAction,
  chooseBotUnoMove,
  claimPartyBotSeat,
  createInitialParchisState,
  createInitialUnoState,
  drawUnoCardsAndAdvance,
  moveParchisPiece,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
  startPartyMatch,
  vacatePartySeatToBot,
  type PartyGameState,
  type PartyGameType,
} from '../../src/shared/partyGames.ts';
import type { VoicePeerState } from '../../src/shared/protocol.ts';

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
  createdAt: number;
}

interface TvPairingSession {
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

interface ClientMeta {
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

const MAX_WS_PAYLOAD_BYTES = 32_768;

export function createRoomHub(app: express.Express, wss: WebSocketServer) {
  const rooms = new Map<string, RoomRecord>();
  const cloudSessions = new Map<string, CloudRoomSession>();
  const roomPollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const partyBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const boardTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const roomVoicePeers = new Map<string, Map<string, VoicePeerState>>();

  const tvPairingSessions = new LruTtlCache<string, TvPairingSession>(400, 15 * 60 * 1000);
  const tvSocketToCode = new Map<WebSocket, string>();
  const tvHttpHeartbeats = new LruTtlCache<string, number>(500, 60_000);
  const tvAuthTokens = new LruTtlCache<string, { roomId: string; expiresAt: number }>(
    1000,
    2 * 60 * 60 * 1000
  );

  const clients = new Map<WebSocket, ClientMeta>();
  const pendingDirectInvites = new LruTtlCache<string, unknown[]>(500, 120_000);
  const rateLimiter = new WsRateLimiter();

  function sanitizeRoomFromSnapshot(item: RoomRecord): RoomRecord {
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
            title: 'NAIM CINE · Elige película, serie, partido o YouTube',
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

  loadRoomsSnapshotFromDisk<RoomRecord>((item) => {
    rooms.set(item.id, sanitizeRoomFromSnapshot(item));
  });

  function serializeRoomSnapshot(r: RoomRecord) {
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

  let persistDiskTimer: ReturnType<typeof setTimeout> | null = null;
  function schedulePersistRoom(roomId?: string) {
    if (roomId && isDistributedStoreEnabled()) {
      const target = rooms.get(roomId);
      if (target) {
        saveDistributedKey(`room:${roomId}`, serializeRoomSnapshot(target), 86_400).catch(() => {});
      }
    }
    if (persistDiskTimer) return;
    persistDiskTimer = setTimeout(() => {
      persistDiskTimer = null;
      const serializable = Array.from(rooms.values())
        .slice(-100)
        .map(serializeRoomSnapshot);
      writeRoomsSnapshotToDisk(serializable);
    }, 1200);
  }

  function cleanupInactiveRooms() {
    const now = Date.now();
    const maxInactiveMs = 24 * 60 * 60 * 1000;
    for (const [id, r] of rooms.entries()) {
      if ((!r.participants || r.participants.length === 0) && now - (r.createdAt || 0) > maxInactiveMs) {
        rooms.delete(id);
      }
    }
    pruneJoinCooldownCache(now);
  }
  setInterval(cleanupInactiveRooms, 15 * 60 * 1000).unref();

  function generateTvPairingCode(): string {
    const now = Date.now();
    for (const [k, session] of tvPairingSessions.entries()) {
      if (session.expiresAt <= now) {
        tvPairingSessions.delete(k);
        if (session.ws) tvSocketToCode.delete(session.ws);
      }
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      if (!tvPairingSessions.has(code)) return code;
    }
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function getOrCreateRoom(roomId: string, roomName?: string): { room: RoomRecord; isFresh: boolean } {
    const existing = rooms.get(roomId);
    if (existing) return { room: existing, isFresh: false };

    const created: RoomRecord = {
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
      pinnedMessage: null,
      videoState: {
        mode: 'idle',
        url: '',
        rawSourceUrl: '',
        title: 'NAIM CINE · Elige película, serie, partido o YouTube',
        subtitle: 'Reproducción HD sincronizada sin anuncios',
        currentTime: 0,
        isPlaying: false,
        isLive: false,
        tracks: [],
        activeTrackIndex: 0,
        lastUpdated: Date.now(),
      },
      queue: [],
      participants: [],
      messages: [
        {
          id: `sys-welcome-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIM CINE',
          senderAvatar: '🎬',
          senderColor: '#e11d48',
          text: 'Bienvenido a NAIM CINE. Elige cualquier película en Español o VO, serie, fútbol en vivo o vídeo para ver juntos sin anuncios.',
          timestamp: Date.now(),
          isSystem: true,
        },
      ],
      createdAt: Date.now(),
    };

    rooms.set(roomId, created);
    schedulePersistRoom(roomId);
    return { room: created, isFresh: true };
  }

  async function hydrateRoomFromDistributedIfMissing(roomId: string): Promise<void> {
    if (rooms.has(roomId) || !isDistributedStoreEnabled()) return;
    const remote = await loadDistributedKey<RoomRecord>(`room:${roomId}`);
    if (remote && typeof remote.id === 'string' && !rooms.has(roomId)) {
      rooms.set(roomId, sanitizeRoomFromSnapshot(remote));
    }
  }

  function computeAuthoritativeVideoState(room: RoomRecord) {
    const vs = { ...room.videoState };
    if (vs.isPlaying && !vs.isLive && (vs.mode === 'hls' || vs.mode === 'direct' || vs.mode === 'youtube')) {
      const elapsedSec = Math.max(0, (Date.now() - vs.lastUpdated) / 1000);
      vs.currentTime = vs.currentTime + elapsedSec;
    }
    return vs;
  }

  function getVoicePeersForRoom(roomId: string): VoicePeerState[] {
    const map = roomVoicePeers.get(roomId);
    return map ? Array.from(map.values()) : [];
  }

  function removeVoicePeer(roomId: string, userId: string): void {
    const map = roomVoicePeers.get(roomId);
    if (!map || !map.has(userId)) return;
    map.delete(userId);
    if (map.size === 0) {
      roomVoicePeers.delete(roomId);
    }
    broadcastToRoom(roomId, {
      type: 'VOICE_PARTICIPANTS_UPDATED',
      payload: {
        roomId,
        peers: getVoicePeersForRoom(roomId),
      },
    });
  }

  function serializeRoomForClient(room: RoomRecord) {
    const { pinCode, ...safeRoom } = room;
    return {
      ...safeRoom,
      hasPin: Boolean(pinCode),
      voicePeers: getVoicePeersForRoom(room.id),
      videoState: computeAuthoritativeVideoState(room),
    };
  }

  function broadcastToRoom(roomId: string, message: unknown, excludeWs?: WebSocket) {
    const serialized = JSON.stringify(message);
    clients.forEach((meta, clientWs) => {
      if (meta.roomId === roomId && clientWs.readyState === WebSocket.OPEN && clientWs !== excludeWs) {
        clientWs.send(serialized);
      }
    });
  }

  function claimTvPairingCodeCore(params: {
    rawCode: string;
    targetRoomId: string;
    roomNameHint?: string;
    claimedByRaw?: string;
  }):
    | { ok: true; code: string; roomId: string; roomName: string; tvAuthToken: string }
    | { ok: false; error: string } {
    const code = String(params.rawCode || '')
      .replace(/\D/g, '')
      .slice(0, 4);
    const targetRoomId = String(params.targetRoomId || '')
      .trim()
      .toLowerCase();

    if (code.length !== 4 || !targetRoomId) {
      return {
        ok: false,
        error: 'Código de 4 dígitos no válido.',
      };
    }

    const session = tvPairingSessions.get(code);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) {
        tvPairingSessions.delete(code);
        if (session.ws) tvSocketToCode.delete(session.ws);
      }
      return {
        ok: false,
        error:
          'Código no encontrado o caducado. Revisa los 4 números que aparecen en tu Smart TV.',
      };
    }

    const { room } = getOrCreateRoom(targetRoomId, params.roomNameHint);
    const tvAuthToken = crypto.randomBytes(16).toString('hex');
    const tokenEntry = {
      roomId: targetRoomId,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    };
    tvAuthTokens.set(tvAuthToken, tokenEntry);
    saveDistributedKey(`tvtoken:${tvAuthToken}`, tokenEntry, 7200).catch(() => {});

    const claimedBy = String(params.claimedByRaw || 'Móvil')
      .trim()
      .slice(0, 32);

    session.pairedPayload = {
      roomId: targetRoomId,
      roomName: room.name,
      tvAuthToken,
      claimedBy,
    };
    session.expiresAt = Date.now() + 90 * 1000;
    tvPairingSessions.set(code, session, 90_000);
    saveDistributedKey(`tvpair:${code}`, {
      code: session.code,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      pairedPayload: session.pairedPayload,
    }, 120).catch(() => {});

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      try {
        session.ws.send(
          JSON.stringify({
            type: 'TV_PAIRED_REDIRECT',
            payload: {
              roomId: targetRoomId,
              roomName: room.name,
              tvAuthToken,
              claimedBy,
              pairedBy: claimedBy,
            },
          })
        );
      } catch {
        // HTTP polling fallback on TV will pick up session.pairedPayload
      }
    }

    return {
      ok: true,
      code,
      roomId: targetRoomId,
      roomName: room.name,
      tvAuthToken,
    };
  }

  function deriveServerFriendCode(userId: string): string {
    const clean = String(userId || 'user').trim();
    let hash = 2166136261;
    for (let i = 0; i < clean.length; i += 1) {
      hash ^= clean.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(-5);
  }

  function getOnlineUsersSnapshot() {
    const byUserId = new Map<
      string,
      {
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
    >();

    clients.forEach((meta, clientWs) => {
      if (clientWs.readyState !== WebSocket.OPEN || !meta.userId || !meta.userName) {
        return;
      }
      if (meta.userName.includes('(TV)') || meta.userAvatar === '📺') {
        return;
      }
      const activeRoom = meta.roomId ? rooms.get(meta.roomId) : undefined;
      const activeMedia =
        activeRoom && activeRoom.videoState.mode !== 'idle'
          ? activeRoom.videoState.title
          : undefined;

      byUserId.set(meta.userId, {
        userId: meta.userId,
        name: meta.userName,
        avatar: meta.userAvatar || '🍿',
        color: meta.userColor || '#E11D48',
        friendCode: meta.friendCode || deriveServerFriendCode(meta.userId),
        roomId: meta.roomId,
        roomName: activeRoom?.name || meta.roomName,
        mediaTitle: activeMedia,
        lastSeen: meta.lastSeen || Date.now(),
      });
    });

    return Array.from(byUserId.values());
  }

  let broadcastPresenceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleBroadcastOnlineUsers() {
    if (broadcastPresenceTimer) return;
    broadcastPresenceTimer = setTimeout(() => {
      broadcastPresenceTimer = null;
      const snapshot = getOnlineUsersSnapshot();
      const packet = JSON.stringify({
        type: 'ONLINE_USERS_UPDATED',
        payload: { users: snapshot },
      });
      clients.forEach((_meta, clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          try {
            clientWs.send(packet);
          } catch {
            // ignore
          }
        }
      });
    }, 150);
  }

  function flushPendingInvitesForClient(ws: WebSocket, userId: string, friendCode: string) {
    const now = Date.now();
    const keys = [userId, friendCode.toUpperCase()];
    for (const key of keys) {
      const list = pendingDirectInvites.get(key) as Array<{ timestamp: number }> | undefined;
      if (!list || list.length === 0) continue;
      const valid = list.filter((inv) => now - inv.timestamp < 90_000);
      pendingDirectInvites.delete(key);
      for (const inv of valid) {
        try {
          ws.send(JSON.stringify({ type: 'INCOMING_ROOM_INVITE', payload: inv }));
        } catch {
          // ignore
        }
      }
    }
  }

  function finalizeRoomPoll(roomId: string, expectedPollId: string) {
    const timer = roomPollTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      roomPollTimers.delete(roomId);
    }
    const room = rooms.get(roomId);
    if (!room || !room.activePoll || room.activePoll.id !== expectedPollId || room.activePoll.isClosed) {
      return;
    }

    room.activePoll.isClosed = true;
    let bestOpt = room.activePoll.options[0];
    for (const opt of room.activePoll.options) {
      if (opt.voterIds.length > (bestOpt?.voterIds.length || 0)) {
        bestOpt = opt;
      }
    }
    room.activePoll.winnerOptionId = bestOpt?.id;

    const totalVotes = room.activePoll.options.reduce((acc, o) => acc + o.voterIds.length, 0);
    const sysMsg: RoomChatMessageRecord = {
      id: `poll-win-${Date.now()}`,
      senderId: 'system',
      senderName: 'NAIMCINE',
      senderAvatar: '🏆',
      senderColor: '#f59e0b',
      text: bestOpt
        ? `Votación cerrada (${totalVotes} voto${totalVotes === 1 ? '' : 's'}): ganó "${bestOpt.item?.title || 'Opción'}"`
        : 'Votación finalizada',
      timestamp: Date.now(),
      isSystem: true,
      systemType: 'poll',
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages.shift();

    broadcastToRoom(roomId, {
      type: 'POLL_UPDATED',
      payload: {
        poll: room.activePoll,
        winnerItem: bestOpt?.item || null,
        justFinished: true,
        message: sysMsg,
      },
    });
  }

  async function stopCloudSession(roomId: string) {
    const existing = cloudSessions.get(roomId);
    if (!existing) return;
    existing.closed = true;
    cloudSessions.delete(roomId);
  }

  async function startCloudSession(roomId: string, targetUrl: string) {
    await stopCloudSession(roomId);

    const lite = await resolveCloudSessionLite(targetUrl);
    let proxiedDetectedStream: string | undefined;

    if (lite.detectedStreamUrl) {
      if (/\.mp4(\?|$)/i.test(lite.detectedStreamUrl)) {
        proxiedDetectedStream = buildTsProxyUrl(lite.detectedStreamUrl, lite.url);
      } else {
        try {
          const m3uText = await fetchSportsHtmlHop(lite.detectedStreamUrl, lite.url);
          if (
            !m3uText.includes('#EXTM3U') ||
            (await verifyM3u8HasCleanVideoFrame(m3uText, lite.detectedStreamUrl, lite.url))
          ) {
            proxiedDetectedStream = buildHlsProxyUrl(lite.detectedStreamUrl, lite.url);
          }
        } catch {
          proxiedDetectedStream = buildHlsProxyUrl(lite.detectedStreamUrl, lite.url);
        }
      }
    }

    const session: CloudRoomSession = {
      ...lite,
      detectedStreamUrl: proxiedDetectedStream || undefined,
      closed: false,
    };
    cloudSessions.set(roomId, session);

    broadcastToRoom(roomId, {
      type: 'CLOUD_BROWSER_FRAME',
      payload: {
        image: '',
        url: session.url,
        title: session.title,
        isLoading: false,
        detectedStreamUrl: session.detectedStreamUrl,
      },
    });
  }

  function scheduleBoardTurnTimer(room: RoomRecord): void {
    const existing = boardTurnTimers.get(room.id);
    if (existing) {
      clearTimeout(existing);
      boardTurnTimers.delete(room.id);
    }
    const gs = room.gameState;
    if (!gs || gs.status !== 'playing') return;
    const activeSeat = gs.players[gs.turn];
    const delayMs = activeSeat?.isBot
      ? 750
      : Math.max(250, (gs.turnDeadlineAt || Date.now() + 15_000) - Date.now());
    const expectedUpdatedAt = gs.updatedAt;
    const expectedTurn = gs.turn;

    const timer = setTimeout(() => {
      boardTurnTimers.delete(room.id);
      const latestRoom = rooms.get(room.id);
      const state = latestRoom?.gameState;
      if (
        !latestRoom ||
        !state ||
        state.status !== 'playing' ||
        state.turn !== expectedTurn ||
        state.updatedAt !== expectedUpdatedAt
      ) {
        return;
      }
      const seat = state.players[state.turn];
      const autoMove = chooseAutoBoardMove(state);
      if (!autoMove) return;

      const res = applyBoardMove(
        state,
        seat?.userId || `bot-board-${state.turn}`,
        autoMove.from,
        autoMove.to,
        'Q'
      );
      if (!res.ok) return;

      latestRoom.gameState = res.state;
      let finishMsg: RoomChatMessageRecord | null = null;
      if (!seat?.isBot && !res.finishedNow) {
        finishMsg = {
          id: `game-auto-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIM CINE',
          senderAvatar: '⏱️',
          senderColor: '#f59e0b',
          text: `⏱️ 15s agotados · La máquina movió por ${seat?.name || 'el jugador'} (${res.notation}).`,
          timestamp: Date.now(),
          isSystem: true,
        };
      } else if (res.finishedNow) {
        const winnerName =
          res.state.winner === 'draw'
            ? null
            : res.state.winner
              ? res.state.players[res.state.winner]?.name ||
                (res.state.winner === 'w' ? 'Blancas' : 'Negras')
              : null;
        finishMsg = {
          id: `game-end-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIM CINE',
          senderAvatar: '🏆',
          senderColor: '#10b981',
          text:
            res.state.winner === 'draw'
              ? 'Tablas / empate en el tablero.'
              : `🏆 ${winnerName} gana la partida (${res.notation}).`,
          timestamp: Date.now(),
          isSystem: true,
        };
      }
      if (finishMsg) {
        latestRoom.messages.push(finishMsg);
        if (latestRoom.messages.length > 150) latestRoom.messages = latestRoom.messages.slice(-150);
      }

      schedulePersistRoom(latestRoom.id);
      broadcastToRoom(latestRoom.id, {
        type: 'GAME_STATE_UPDATED',
        payload: {
          gameState: latestRoom.gameState,
          message: finishMsg,
        },
      });
      scheduleBoardTurnTimer(latestRoom);
    }, delayMs);
    timer.unref?.();
    boardTurnTimers.set(room.id, timer);
  }

  function schedulePartyBotTurnIfNeeded(room: RoomRecord): void {
    const existingTimer = partyBotTimers.get(room.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      partyBotTimers.delete(room.id);
    }

    const pg = room.partyGameState;
    if (!pg || pg.status !== 'playing') return;
    const currentSeat = pg.players[pg.turnSeat];
    if (!currentSeat) return;

    const isBotTurn = Boolean(currentSeat.isBot);
    const delayMs = isBotTurn
      ? 850
      : Math.max(250, (pg.turnDeadlineAt || Date.now() + 15_000) - Date.now());
    const expectedUpdatedAt = pg.updatedAt;
    const expectedTurnSeat = pg.turnSeat;

    const t = setTimeout(() => {
      partyBotTimers.delete(room.id);
      const latestRoom = rooms.get(room.id);
      const state = latestRoom?.partyGameState;
      if (
        !latestRoom ||
        !state ||
        state.status !== 'playing' ||
        state.turnSeat !== expectedTurnSeat ||
        state.updatedAt !== expectedUpdatedAt
      ) {
        return;
      }
      const activeSeat = state.players[state.turnSeat];
      if (!activeSeat) return;

      if (state.gameType === 'parchis') {
        const moveSpec = chooseBotParchisAction(state);
        if (moveSpec.action === 'roll_dice') {
          const res = rollParchisDice(state, activeSeat.userId);
          if (res.ok) latestRoom.partyGameState = res.state;
        } else if (typeof moveSpec.pieceId === 'number') {
          const res = moveParchisPiece(state, activeSeat.userId, moveSpec.pieceId);
          if (res.ok) latestRoom.partyGameState = res.state;
        }
      } else {
        const unoMove = chooseBotUnoMove(state);
        if (unoMove.action === 'accept_wild4' || unoMove.action === 'challenge_wild4') {
          const res = resolveUnoWild4Challenge(
            state,
            activeSeat.userId,
            unoMove.action === 'challenge_wild4' && isBotTurn ? 'challenge' : 'accept'
          );
          if (res.ok) latestRoom.partyGameState = res.state;
        } else if (unoMove.action === 'play_card' && unoMove.cardId) {
          const res = playUnoCard(state, activeSeat.userId, unoMove.cardId, unoMove.chosenColor);
          if (res.ok) {
            let nextUno = res.state;
            // Bot automatically calls UNO most of the time when dropping to 1 card
            if (
              isBotTurn &&
              nextUno.status === 'playing' &&
              nextUno.vulnerableUnoSeat === activeSeat.seatIndex &&
              Math.random() < 0.78
            ) {
              nextUno = {
                ...nextUno,
                vulnerableUnoSeat: null,
                unoCalledSeats: Array.from(new Set([...nextUno.unoCalledSeats, activeSeat.seatIndex])),
                log: [...nextUno.log.slice(-14), `📣 ¡${activeSeat.name} gritó ¡UNO!!`],
              };
            }
            latestRoom.partyGameState = nextUno;
          }
        } else {
          const res = drawUnoCardsAndAdvance(state, activeSeat.userId);
          if (res.ok) latestRoom.partyGameState = res.state;
        }
      }

      if (!isBotTurn && latestRoom.partyGameState) {
        latestRoom.partyGameState = {
          ...latestRoom.partyGameState,
          log: [
            ...latestRoom.partyGameState.log.slice(-13),
            `⏱️ 15s agotados · Máquina movió por ${activeSeat.name}`,
          ],
        };
      }

      schedulePersistRoom(latestRoom.id);
      broadcastToRoom(latestRoom.id, {
        type: 'PARTY_GAME_STATE_UPDATED',
        payload: { partyGameState: latestRoom.partyGameState },
      });
      schedulePartyBotTurnIfNeeded(latestRoom);
    }, delayMs);
    t.unref?.();
    partyBotTimers.set(room.id, t);
  }

  wss.on('connection', (ws) => {
    clients.set(ws, { ws });

    ws.on('message', async (raw) => {
      try {
        const rawText = raw.toString();
        if (Buffer.byteLength(rawText, 'utf8') > MAX_WS_PAYLOAD_BYTES) {
          ws.send(JSON.stringify({ type: 'WS_ERROR', payload: { error: 'Payload too large' } }));
          return;
        }

        const parsedRaw = JSON.parse(rawText);
        const env = wsEnvelopeSchema.safeParse(parsedRaw);
        if (!env.success) {
          ws.send(JSON.stringify({ type: 'WS_ERROR', payload: { error: 'Invalid envelope' } }));
          return;
        }

        const type = env.data.type;
        const payload = env.data.payload;

        if (!rateLimiter.allow(ws, type)) {
          ws.send(JSON.stringify({ type: 'WS_RATE_LIMITED', payload: { type } }));
          return;
        }

        if (type === 'PING') {
          const currentMeta = clients.get(ws);
          const now = Date.now();
          if (currentMeta) currentMeta.lastSeen = now;
          ws.send(
            JSON.stringify({
              type: 'PONG',
              payload: { clientTs: Number(payload?.clientTs) || now, serverTs: now },
            })
          );
          return;
        }

        if (type === 'REGISTER_PRESENCE') {
          const valid = wsRegisterPresenceSchema.safeParse(payload);
          if (!valid.success) return;
          const d = valid.data;

          let resolvedUserId = d.user.id;
          let verifiedUid: string | undefined;
          if (d.firebaseIdToken) {
            const verified = await verifyFirebaseIdToken(d.firebaseIdToken);
            if (!verified) {
              ws.send(
                JSON.stringify({
                  type: 'AUTH_ERROR',
                  payload: { error: 'Token de sesión Firebase inválido o caducado.' },
                })
              );
              return;
            }
            resolvedUserId = verified.uid;
            verifiedUid = verified.uid;
          }

          const existingMeta = clients.get(ws) || { ws };
          const friendCode = deriveServerFriendCode(resolvedUserId);
          clients.set(ws, {
            ...existingMeta,
            ws,
            userId: resolvedUserId,
            userName: d.user.name,
            userAvatar: d.user.avatar,
            userColor: d.user.color,
            friendCode,
            verifiedUid: verifiedUid || existingMeta.verifiedUid,
            roomId: d.roomId ? d.roomId.trim().toLowerCase() : existingMeta.roomId,
            roomName: d.roomName ? d.roomName.trim().slice(0, 60) : existingMeta.roomName,
            lastSeen: Date.now(),
          });

          ws.send(
            JSON.stringify({
              type: 'ONLINE_USERS_UPDATED',
              payload: { users: getOnlineUsersSnapshot() },
            })
          );
          flushPendingInvitesForClient(ws, resolvedUserId, friendCode);
          scheduleBroadcastOnlineUsers();
          return;
        }

        if (type === 'TV_REGISTER_PAIRING') {
          const requestedExisting = String(payload?.existingCode || '')
            .replace(/\D/g, '')
            .slice(0, 4);
          const now = Date.now();
          const existingSession =
            requestedExisting.length === 4 ? tvPairingSessions.get(requestedExisting) : undefined;

          let code: string;
          let expiresAt: number;

          if (existingSession && existingSession.expiresAt > now && !existingSession.pairedPayload) {
            code = existingSession.code;
            expiresAt = existingSession.expiresAt;
            existingSession.ws = ws;
            tvSocketToCode.set(ws, code);
          } else {
            const prevCode = tvSocketToCode.get(ws);
            if (prevCode) {
              const prevSession = tvPairingSessions.get(prevCode);
              if (prevSession && !prevSession.pairedPayload) {
                tvPairingSessions.delete(prevCode);
              }
            }
            code = generateTvPairingCode();
            expiresAt = now + 15 * 60 * 1000;
            const sess: TvPairingSession = { code, ws, createdAt: now, expiresAt };
            tvPairingSessions.set(code, sess);
            saveDistributedKey(`tvpair:${code}`, { code, createdAt: now, expiresAt }, 900).catch(
              () => {}
            );
            tvSocketToCode.set(ws, code);
          }

          ws.send(
            JSON.stringify({
              type: 'TV_PAIRING_READY',
              payload: { code, expiresAt },
            })
          );
          return;
        }

        if (type === 'JOIN_ROOM') {
          const valid = wsJoinRoomSchema.safeParse(payload);
          if (!valid.success) {
            ws.send(
              JSON.stringify({
                type: 'WS_ERROR',
                payload: { error: 'Datos de sala inválidos.' },
              })
            );
            return;
          }
          const d = valid.data;
          const roomId = d.roomId.toLowerCase();

          let userId = d.user.id;
          let verifiedUid: string | undefined;
          if (d.firebaseIdToken) {
            const verified = await verifyFirebaseIdToken(d.firebaseIdToken);
            if (!verified) {
              ws.send(
                JSON.stringify({
                  type: 'AUTH_ERROR',
                  payload: { error: 'Token Firebase inválido al entrar a la sala.' },
                })
              );
              return;
            }
            // Enforce authoritative Firebase UID — prevents impersonating host or friend
            userId = verified.uid;
            verifiedUid = verified.uid;
          }

          const userName = d.user.name;
          const userAvatar = d.user.avatar || '🍿';
          const userColor = d.user.color || '#e11d48';

          await hydrateRoomFromDistributedIfMissing(roomId);
          const { room, isFresh } = getOrCreateRoom(roomId, d.roomName);

          const isTvClient =
            Boolean(d.tvAuthToken) ||
            userName.includes('(TV)') ||
            userAvatar === '📺';

          // Only the room creator (first non-TV human participant if creatorId is empty) can EVER be host
          if (!room.creatorId && !isTvClient) {
            room.creatorId = userId;
            room.hostId = userId;
          }

          const bp = d.restoredBlueprint;
          if (bp && (isFresh || !room.creatorId || room.creatorId === userId) && !isTvClient) {
            if (bp.roomName?.trim()) room.name = bp.roomName.trim().slice(0, 60);
            if (typeof bp.hostOnlyControl === 'boolean') room.hostOnlyControl = bp.hostOnlyControl;
            if (bp.pinCode && /^[0-9]{4}$/.test(bp.pinCode)) room.pinCode = bp.pinCode;
            if (Array.isArray(bp.queueItems) && room.queue.length === 0) {
              room.queue = bp.queueItems.slice(0, 12);
            }
            if (!room.creatorId) {
              room.creatorId = userId;
            }
            room.hostId = room.creatorId;
            schedulePersistRoom(roomId);
          }

          if (room.pinCode) {
            const incomingPin = (d.pin || '').trim();
            const incomingTvToken = (d.tvAuthToken || '').trim();
            let validTvToken = false;
            if (incomingTvToken) {
              let tokenEntry = tvAuthTokens.get(incomingTvToken);
              if (!tokenEntry && isDistributedStoreEnabled()) {
                const remoteTok = await loadDistributedKey<{ roomId: string; expiresAt: number }>(
                  `tvtoken:${incomingTvToken}`
                );
                if (remoteTok) {
                  tvAuthTokens.set(incomingTvToken, remoteTok);
                  tokenEntry = remoteTok;
                }
              }
              if (tokenEntry && tokenEntry.roomId === roomId && tokenEntry.expiresAt > Date.now()) {
                validTvToken = true;
              }
            }

            const isReturningHost = Boolean(
              (room.creatorId && room.creatorId === userId) || (room.hostId && room.hostId === userId)
            );
            if (!isReturningHost && !validTvToken && incomingPin !== room.pinCode) {
              ws.send(
                JSON.stringify({
                  type: 'ROOM_PIN_REQUIRED',
                  payload: {
                    roomId,
                    roomName: room.name,
                    invalidAttempt: Boolean(incomingPin),
                  },
                })
              );
              return;
            }
          }

          // Keep hostId strictly locked to creatorId (never reassign host to guests)
          if (room.creatorId) {
            room.hostId = room.creatorId;
          }

          const isHost = Boolean(room.creatorId && room.creatorId === userId);
          const isCoHost = !isHost && (room.coHostIds || []).includes(userId);
          const alreadyInRoom = room.participants.some((p) => p.id === userId);
          const existingMember = room.participants.find((p) => p.id === userId);
          room.participants = room.participants.filter((p) => p.id !== userId);

          room.participants.push({
            id: userId,
            name: userName,
            avatar: userAvatar,
            color: userColor,
            isHost,
            role: isHost ? 'host' : isCoHost || existingMember?.role === 'mod' ? 'mod' : 'viewer',
            joinedAt: existingMember?.joinedAt || Date.now(),
          });

          const prevMeta = clients.get(ws);
          if (prevMeta?.roomId && prevMeta.roomId !== roomId && prevMeta.userId) {
            removeVoicePeer(prevMeta.roomId, prevMeta.userId);
          }

          const friendCode = deriveServerFriendCode(userId);
          clients.set(ws, {
            ws,
            roomId,
            roomName: room.name,
            userId,
            userName,
            userAvatar,
            userColor,
            friendCode,
            verifiedUid,
            lastSeen: Date.now(),
          });
          flushPendingInvitesForClient(ws, userId, friendCode);
          scheduleBroadcastOnlineUsers();

          let joinMsg: RoomChatMessageRecord | null = null;
          if (
            shouldEmitJoinSystemMessage({
              roomId,
              userId,
              userName,
              alreadyInRoom,
              existingMessages: room.messages,
            })
          ) {
            joinMsg = {
              id: `join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderId: 'system',
              senderName: 'NAIM CINE',
              senderAvatar: userAvatar,
              senderColor: '#10b981',
              text: `${userName} se ha unido a la sala`,
              timestamp: Date.now(),
              isSystem: true,
              systemType: 'join',
            };
            room.messages.push(joinMsg);
            if (room.messages.length > 150) room.messages.shift();
          }

          schedulePersistRoom(roomId);

          ws.send(
            JSON.stringify({
              type: 'ROOM_STATE',
              payload: { ...serializeRoomForClient(room), serverTime: Date.now() },
            })
          );

          broadcastToRoom(
            roomId,
            {
              type: 'PARTICIPANTS_UPDATED',
              payload: {
                participants: room.participants,
                hostId: room.hostId,
                message: joinMsg,
              },
            },
            ws
          );
          return;
        }

        if (type === 'SYNC_REQUEST') {
          const senderMeta = clients.get(ws);
          const roomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          ws.send(
            JSON.stringify({
              type: 'ROOM_STATE',
              payload: { ...serializeRoomForClient(room), serverTime: Date.now() },
            })
          );
          return;
        }

        if (type === 'SYNC_VIDEO_STATE') {
          const { roomId: rawRoomId, action, videoState: incomingState, updatedBy } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          if (!room || !incomingState) return;

          const senderMeta = clients.get(ws);
          const isMediaChange =
            action === 'change_url' ||
            (typeof incomingState.url === 'string' && incomingState.url !== room.videoState.url);

          const isAuthorized = isMediaChange
            ? canUserChangeRoomMedia({
                creatorId: room.creatorId,
                hostId: room.hostId,
                userId: senderMeta?.userId,
                participants: room.participants,
              })
            : canUserControlRoom({
                hostOnlyControl: room.hostOnlyControl,
                creatorId: room.creatorId,
                hostId: room.hostId,
                userId: senderMeta?.userId,
                participants: room.participants,
              });

          if (!isAuthorized) {
            const hostMember = room.participants.find(
              (p) => p.id === (room.creatorId || room.hostId)
            );
            ws.send(
              JSON.stringify({
                type: 'HOST_LOCK_REJECTED',
                payload: {
                  videoState: computeAuthoritativeVideoState(room),
                  hostName: hostMember?.name || 'el anfitrión',
                  reason: isMediaChange
                    ? 'Solo el anfitrión o un Co-anfitrión puede cambiar de canal o película.'
                    : undefined,
                },
              })
            );
            return;
          }

          room.videoState = {
            ...room.videoState,
            ...incomingState,
            lastUpdated: Date.now(),
            updatedBy: String(updatedBy || senderMeta?.userName || 'Anfitrión'),
          };

          if (room.videoState.mode !== 'cloud') {
            await stopCloudSession(roomId);
          }

          let sysMsg: RoomChatMessageRecord | null = null;
          if (action === 'change_url') {
            sysMsg = {
              id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              senderId: 'system',
              senderName: 'NAIMCINE',
              senderAvatar: '🎬',
              senderColor: '#e11d48',
              text: `${room.videoState.updatedBy} puso "${room.videoState.title}"`,
              timestamp: Date.now(),
              isSystem: true,
              systemType: 'video_change',
            };
            room.messages.push(sysMsg);
            if (room.messages.length > 150) room.messages.shift();
          }

          schedulePersistRoom(roomId);

          broadcastToRoom(
            roomId,
            {
              type: 'VIDEO_STATE_UPDATED',
              payload: {
                videoState: room.videoState,
                action,
                message: sysMsg,
              },
            },
            action === 'play' || action === 'pause' || action === 'seek' ? ws : undefined
          );
          if (action === 'change_url') {
            scheduleBroadcastOnlineUsers();
          }
          return;
        }

        if (type === 'QUEUE_ADD') {
          const { roomId: rawRoomId, item } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          if (!room || !item || typeof item.id !== 'string') return;
          room.queue = [...room.queue, item].slice(0, 30);
          const sysMsg: RoomChatMessageRecord = {
            id: `qmsg-${Date.now()}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: '➕',
            senderColor: '#f59e0b',
            text: `${item.addedBy || 'Un amigo'} añadió "${item.title}" a la cola`,
            timestamp: Date.now(),
            isSystem: true,
          };
          room.messages.push(sysMsg);
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'QUEUE_UPDATED',
            payload: { queue: room.queue, message: sysMsg },
          });
          return;
        }

        if (type === 'QUEUE_REMOVE') {
          const { roomId: rawRoomId, itemId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !itemId) return;
          if (
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }
          room.queue = room.queue.filter((q) => q.id !== itemId);
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'QUEUE_UPDATED',
            payload: { queue: room.queue },
          });
          return;
        }

        if (type === 'QUEUE_PROMOTE') {
          const { roomId: rawRoomId, itemId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !itemId) return;
          if (
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }
          const target = room.queue.find((q) => q.id === itemId);
          if (!target) return;
          room.queue = [target, ...room.queue.filter((q) => q.id !== itemId)];
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'QUEUE_UPDATED',
            payload: { queue: room.queue },
          });
          return;
        }

        if (type === 'QUEUE_REORDER') {
          const valid = wsQueueReorderSchema.safeParse(payload);
          if (!valid.success) return;
          const { roomId: rawRoomId, itemId, direction, targetIndex } = valid.data;
          const roomId = rawRoomId.toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room) return;
          if (
            !canUserControlRoom({
              hostOnlyControl: true,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }
          const curIdx = room.queue.findIndex((q) => q.id === itemId);
          if (curIdx === -1) return;
          let nextIdx = curIdx;
          if (typeof targetIndex === 'number') {
            nextIdx = Math.max(0, Math.min(room.queue.length - 1, targetIndex));
          } else if (direction === 'up') {
            nextIdx = Math.max(0, curIdx - 1);
          } else if (direction === 'down') {
            nextIdx = Math.min(room.queue.length - 1, curIdx + 1);
          }
          if (nextIdx === curIdx) return;
          const nextQueue = [...room.queue];
          const [moved] = nextQueue.splice(curIdx, 1);
          nextQueue.splice(nextIdx, 0, moved);
          room.queue = nextQueue;
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'QUEUE_UPDATED',
            payload: { queue: room.queue },
          });
          return;
        }

        if (type === 'QUEUE_VOTE') {
          const { roomId: rawRoomId, itemId, userId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          const voterId = senderMeta?.userId || userId;
          if (!room || !itemId || !voterId) return;
          room.queue = toggleQueueItemVote(room.queue, String(itemId), String(voterId));
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'QUEUE_UPDATED',
            payload: { queue: room.queue },
          });
          return;
        }

        if (type === 'SET_PARTICIPANT_ROLE') {
          const { roomId: rawRoomId, targetUserId, role } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          const effectiveCreatorId = room?.creatorId || room?.hostId;
          if (!room || !senderMeta?.userId || senderMeta.userId !== effectiveCreatorId) return;
          const cleanTargetId = String(targetUserId || '').trim();
          if (!cleanTargetId || cleanTargetId === effectiveCreatorId) return;
          if (role !== 'mod' && role !== 'viewer') return;

          room.participants = assignParticipantRole(
            room.participants as never,
            cleanTargetId,
            role
          );
          const prevCoHosts = Array.isArray(room.coHostIds) ? room.coHostIds : [];
          room.coHostIds =
            role === 'mod'
              ? Array.from(new Set([...prevCoHosts, cleanTargetId]))
              : prevCoHosts.filter((id) => id !== cleanTargetId);

          const targetMember = room.participants.find((p) => p.id === cleanTargetId);
          const sysMsg: RoomChatMessageRecord = {
            id: `cohost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: role === 'mod' ? '🛡️' : '👤',
            senderColor: role === 'mod' ? '#10b981' : '#71717a',
            text:
              role === 'mod'
                ? `${senderMeta.userName || 'El anfitrión'} asignó a ${targetMember?.name || 'un participante'} como Co-anfitrión (puede cambiar canales y películas)`
                : `${senderMeta.userName || 'El anfitrión'} retiró el permiso de Co-anfitrión a ${targetMember?.name || 'un participante'}`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'host_change',
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();
          schedulePersistRoom(roomId);

          broadcastToRoom(roomId, {
            type: 'PARTICIPANTS_UPDATED',
            payload: { participants: room.participants, hostId: room.hostId, message: sysMsg },
          });
          return;
        }

        if (type === 'TYPING_STATE') {
          const valid = wsTypingStateSchema.safeParse(payload);
          if (!valid.success) return;
          const senderMeta = clients.get(ws);
          const roomId = valid.data.roomId.toLowerCase();
          const uid = senderMeta?.userId || valid.data.userId;
          const room = rooms.get(roomId);
          if (!room || !uid) return;
          broadcastToRoom(
            roomId,
            {
              type: 'TYPING_UPDATED',
              payload: {
                userId: uid,
                userName: senderMeta?.userName || valid.data.userName || 'Amigo',
                isTyping: Boolean(valid.data.isTyping),
              },
            },
            ws
          );
          return;
        }

        if (type === 'SEND_CHAT') {
          const valid = wsSendChatSchema.safeParse(payload);
          if (!valid.success) return;
          const roomId = valid.data.roomId.toLowerCase();
          const room = rooms.get(roomId);
          if (!room) return;

          const senderMeta = clients.get(ws);
          const msg: RoomChatMessageRecord = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: senderMeta?.userId || valid.data.user?.id || 'anon',
            senderName: senderMeta?.userName || valid.data.user?.name || 'Invitado',
            senderAvatar: senderMeta?.userAvatar || valid.data.user?.avatar || '🍿',
            senderColor: senderMeta?.userColor || valid.data.user?.color || '#e11d48',
            text: valid.data.text,
            timestamp: Date.now(),
          };

          room.messages.push(msg);
          if (room.messages.length > 150) room.messages.shift();
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, { type: 'NEW_CHAT_MESSAGE', payload: msg });
          return;
        }

        if (type === 'PIN_CHAT_MESSAGE' || type === 'UNPIN_CHAT_MESSAGE') {
          const valid = wsPinChatSchema.safeParse(payload);
          if (!valid.success) return;
          const roomId = valid.data.roomId.toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room) return;
          if (
            !canUserControlRoom({
              hostOnlyControl: true,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }

          if (type === 'UNPIN_CHAT_MESSAGE' || !valid.data.messageId) {
            room.pinnedMessage = null;
          } else {
            const targetMsg = room.messages.find((m) => m.id === valid.data.messageId);
            if (!targetMsg) return;
            room.pinnedMessage = targetMsg;
          }

          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'PINNED_MESSAGE_UPDATED',
            payload: { pinnedMessage: room.pinnedMessage ?? null },
          });
          return;
        }

        if (type === 'SEND_REACTION') {
          const { roomId: rawRoomId, emoji, user } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          if (!rooms.has(roomId) || typeof emoji !== 'string' || !emoji) return;
          const senderMeta = clients.get(ws);
          broadcastToRoom(roomId, {
            type: 'FLOATING_REACTION',
            payload: {
              id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              emoji: emoji.slice(0, 16),
              senderName: senderMeta?.userName || user?.name || 'Invitado',
              senderColor: senderMeta?.userColor || user?.color || '#e11d48',
              xOffset: 12 + Math.floor(Math.random() * 76),
              timestamp: Date.now(),
            },
          });
          return;
        }

        if (type === 'TRANSFER_HOST') {
          // Only the room creator can ever be the Host; co-hosts should be assigned via SET_PARTICIPANT_ROLE ('mod').
          const { roomId: rawRoomId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const hostMember = room?.participants.find(
            (p) => p.id === (room.creatorId || room.hostId)
          );
          ws.send(
            JSON.stringify({
              type: 'HOST_LOCK_REJECTED',
              payload: {
                videoState: room ? computeAuthoritativeVideoState(room) : undefined,
                hostName: hostMember?.name || 'el creador',
                reason:
                  'Solo el creador de la sala puede ser anfitrión. Asigna a un participante como Co-anfitrión para compartir el control.',
              },
            })
          );
          return;
        }

        if (type === 'UPDATE_PROFILE') {
          const { roomId: rawRoomId, userId, userName, userAvatar, userColor } = payload || {};
          const currentMeta = clients.get(ws);
          const effectiveUid = currentMeta?.userId || userId;
          if (currentMeta && effectiveUid) {
            if (userName) currentMeta.userName = String(userName).slice(0, 40);
            if (userAvatar) currentMeta.userAvatar = String(userAvatar).slice(0, 16);
            if (userColor) currentMeta.userColor = String(userColor).slice(0, 16);
            currentMeta.lastSeen = Date.now();
            scheduleBroadcastOnlineUsers();
          }
          const roomId = String(rawRoomId || currentMeta?.roomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          if (!room) return;
          const member = room.participants.find((p) => p.id === effectiveUid);
          if (member) {
            if (userName) member.name = String(userName).slice(0, 40);
            if (userAvatar) member.avatar = String(userAvatar).slice(0, 16);
            if (userColor) member.color = String(userColor).slice(0, 16);
            broadcastToRoom(roomId, {
              type: 'PARTICIPANTS_UPDATED',
              payload: { participants: room.participants, hostId: room.hostId },
            });
          }
          return;
        }

        if (type === 'WEBRTC_SIGNAL') {
          const { roomId: rawRoomId, signalData, targetId, senderId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          if (!roomId) return;
          broadcastToRoom(roomId, { type: 'WEBRTC_SIGNAL', payload: { signalData, targetId, senderId } }, ws);
          return;
        }

        if (type === 'CLOUD_BROWSER_START') {
          const { roomId: rawRoomId, url, updatedBy } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          if (!room || typeof url !== 'string' || !url) return;

          const senderMeta = clients.get(ws);
          if (
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            const hostMember = room.participants.find(
              (p) => p.id === (room.creatorId || room.hostId)
            );
            ws.send(
              JSON.stringify({
                type: 'HOST_LOCK_REJECTED',
                payload: {
                  videoState: computeAuthoritativeVideoState(room),
                  hostName: hostMember?.name || 'el anfitrión',
                  reason: 'Solo el anfitrión o un Co-anfitrión puede abrir enlaces o canales.',
                },
              })
            );
            return;
          }

          room.videoState = {
            mode: 'cloud',
            url,
            rawSourceUrl: url,
            title: `Navegador remoto · ${url}`,
            subtitle: 'Sesión web aislada sin ventanas emergentes',
            currentTime: 0,
            isPlaying: true,
            isLive: true,
            tracks: [],
            activeTrackIndex: 0,
            lastUpdated: Date.now(),
            updatedBy: String(updatedBy || senderMeta?.userName || 'Anfitrión'),
          };

          broadcastToRoom(roomId, {
            type: 'VIDEO_STATE_UPDATED',
            payload: { videoState: room.videoState, action: 'change_url' },
          });

          await startCloudSession(roomId, url);
          return;
        }

        if (type === 'CLOUD_BROWSER_INPUT') {
          const { roomId: rawRoomId, input } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const session = cloudSessions.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !session || session.closed || !input) return;
          if (
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }

          try {
            if (input.type === 'navigate' && typeof input.url === 'string') {
              await startCloudSession(roomId, input.url);
            } else if (input.type === 'reload') {
              await startCloudSession(roomId, session.url);
            }
          } catch {
            // ignore
          }
          return;
        }

        if (type === 'CLOUD_BROWSER_STOP') {
          const roomId = String(payload?.roomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (
            room &&
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }
          await stopCloudSession(roomId);
          return;
        }

        if (type === 'SET_HOST_LOCK') {
          const { roomId: rawRoomId, hostOnlyControl } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return;

          room.hostOnlyControl = Boolean(hostOnlyControl);
          const sysMsg: RoomChatMessageRecord = {
            id: `lock-${Date.now()}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: room.hostOnlyControl ? '🔒' : '🔓',
            senderColor: '#f59e0b',
            text: room.hostOnlyControl
              ? `${senderMeta.userName || 'El anfitrión'} activó el Modo Cineasta (solo el anfitrión controla el reproductor)`
              : `${senderMeta.userName || 'El anfitrión'} permitió control compartido en la sala`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'lock',
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();
          schedulePersistRoom(roomId);

          broadcastToRoom(roomId, {
            type: 'HOST_LOCK_UPDATED',
            payload: {
              hostOnlyControl: room.hostOnlyControl,
              message: sysMsg,
            },
          });
          return;
        }

        if (type === 'POLL_START') {
          const valid = wsPollStartSchema.safeParse(payload);
          if (!valid.success) return;
          const { roomId: rawRoomId, question, options, durationSec } = valid.data;
          const roomId = rawRoomId.toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room) return;
          if (
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }

          const existingTimer = roomPollTimers.get(roomId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            roomPollTimers.delete(roomId);
          }

          const clampedSec = Math.max(12, Math.min(90, Number(durationSec) || 25));
          const now = Date.now();
          const pollId = `poll-${now}-${Math.random().toString(36).slice(2, 6)}`;
          room.activePoll = {
            id: pollId,
            question: question.slice(0, 100),
            createdBy: senderMeta?.userName || 'Anfitrión',
            createdAt: now,
            endsAt: now + clampedSec * 1000,
            isClosed: false,
            options: options.slice(0, 5).map((item, idx) => ({
              id: `opt-${idx + 1}`,
              item: item as Record<string, unknown>,
              voterIds: [],
            })),
          };

          const sysMsg: RoomChatMessageRecord = {
            id: `poll-start-${now}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: '🗳️',
            senderColor: '#38bdf8',
            text: `${room.activePoll.createdBy} inició una votación en vivo (${clampedSec}s)`,
            timestamp: now,
            isSystem: true,
            systemType: 'poll',
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();

          const t = setTimeout(() => {
            finalizeRoomPoll(roomId, pollId);
          }, clampedSec * 1000);
          roomPollTimers.set(roomId, t);

          broadcastToRoom(roomId, {
            type: 'POLL_UPDATED',
            payload: {
              poll: room.activePoll,
              justFinished: false,
              message: sysMsg,
            },
          });
          return;
        }

        if (type === 'POLL_VOTE') {
          const { roomId: rawRoomId, pollId, optionId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (
            !room ||
            !room.activePoll ||
            room.activePoll.id !== pollId ||
            room.activePoll.isClosed ||
            !senderMeta?.userId
          ) {
            return;
          }

          const voterId = senderMeta.userId;
          for (const opt of room.activePoll.options) {
            opt.voterIds = opt.voterIds.filter((id) => id !== voterId);
            if (opt.id === optionId) {
              opt.voterIds.push(voterId);
            }
          }

          broadcastToRoom(roomId, {
            type: 'POLL_UPDATED',
            payload: {
              poll: room.activePoll,
              justFinished: false,
            },
          });
          return;
        }

        if (type === 'POLL_CLOSE') {
          const { roomId: rawRoomId, pollId } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !room.activePoll || room.activePoll.id !== pollId) return;
          if (
            !canUserChangeRoomMedia({
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }
          finalizeRoomPoll(roomId, String(pollId));
          return;
        }

        if (type === 'SET_ROOM_PIN') {
          const { roomId: rawRoomId, pinCode } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return;

          const cleanPin = typeof pinCode === 'string' ? pinCode.trim() : '';
          if (cleanPin && !/^[0-9]{4}$/.test(cleanPin)) return;

          room.pinCode = cleanPin || undefined;
          schedulePersistRoom(roomId);

          const sysMsg: RoomChatMessageRecord = {
            id: `pin-${Date.now()}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: room.pinCode ? '🔐' : '🔓',
            senderColor: '#f59e0b',
            text: room.pinCode
              ? `${senderMeta.userName || 'El anfitrión'} protegió la sala con un PIN privado de 4 dígitos`
              : `${senderMeta.userName || 'El anfitrión'} quitó el PIN de la sala (acceso libre con enlace)`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'lock',
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();

          broadcastToRoom(roomId, {
            type: 'ROOM_PIN_UPDATED',
            payload: {
              hasPin: Boolean(room.pinCode),
              message: sysMsg,
            },
          });
          return;
        }

        if (type === 'RENAME_ROOM') {
          const { roomId: rawRoomId, roomName } = payload || {};
          const roomId = String(rawRoomId || '').trim().toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return;
          const cleanName = typeof roomName === 'string' ? roomName.trim().slice(0, 60) : '';
          if (!cleanName) return;

          room.name = cleanName;
          schedulePersistRoom(roomId);
          broadcastToRoom(roomId, {
            type: 'ROOM_RENAMED',
            payload: { roomName: room.name },
          });
          return;
        }

        if (type === 'TV_CLAIM_CODE') {
          const result = claimTvPairingCodeCore({
            rawCode: String(payload?.code || ''),
            targetRoomId: String(payload?.roomId || ''),
            roomNameHint: typeof payload?.roomName === 'string' ? payload.roomName : undefined,
            claimedByRaw: typeof payload?.claimedBy === 'string' ? payload.claimedBy : undefined,
          });

          if (!result.ok) {
            ws.send(
              JSON.stringify({
                type: 'TV_CLAIM_RESULT',
                payload: { success: false, error: result.error },
              })
            );
            return;
          }

          ws.send(
            JSON.stringify({
              type: 'TV_CLAIM_RESULT',
              payload: {
                success: true,
                code: result.code,
                roomId: result.roomId,
              },
            })
          );
          return;
        }

        if (type === 'TV_REMOTE_COMMAND') {
          const { roomId: rawRoomId, command, senderName } = payload || {};
          const room = rooms.get(String(rawRoomId || '').toLowerCase());
          const senderMeta = clients.get(ws);
          if (!room || !command) return;
          if (
            !canUserControlRoom({
              hostOnlyControl: room.hostOnlyControl,
              creatorId: room.creatorId,
              hostId: room.hostId,
              userId: senderMeta?.userId,
              participants: room.participants,
            })
          ) {
            return;
          }
          const resolvedSender = senderName || senderMeta?.userName || 'Mando móvil';
          room.lastTvRemoteCommand = {
            seq: (room.lastTvRemoteCommand?.seq || 0) + 1,
            command: String(command),
            senderName: String(resolvedSender),
            ts: Date.now(),
          };
          broadcastToRoom(room.id, {
            type: 'TV_REMOTE_COMMAND',
            payload: {
              command,
              senderName: resolvedSender,
              seq: room.lastTvRemoteCommand.seq,
            },
          });
          return;
        }

        if (type === 'SEND_ROOM_INVITE') {
          const senderMeta = clients.get(ws);
          const fromUser = payload?.fromUser || {};
          const fromUserId = String(fromUser.id || senderMeta?.userId || '').trim();
          const fromUserName = String(fromUser.name || senderMeta?.userName || 'Tu amigo')
            .trim()
            .slice(0, 40);
          const fromUserAvatar = String(fromUser.avatar || senderMeta?.userAvatar || '🍿').slice(0, 16);
          const fromUserColor = String(fromUser.color || senderMeta?.userColor || '#E11D48').slice(0, 16);

          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          if (!targetRoomId) return;

          const { room } = getOrCreateRoom(targetRoomId, payload?.roomName);
          const inviteAuthToken = crypto.randomBytes(16).toString('hex');
          tvAuthTokens.set(inviteAuthToken, {
            roomId: targetRoomId,
            expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          });

          const mediaTitle =
            payload?.mediaTitle ||
            (room.videoState.mode !== 'idle' ? room.videoState.title : undefined);

          const inviteObj = {
            id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromUserId,
            fromUserName,
            fromUserAvatar,
            fromUserColor,
            fromFriendCode: deriveServerFriendCode(fromUserId),
            roomId: targetRoomId,
            roomName: room.name || payload?.roomName || `Sala ${targetRoomId.toUpperCase()}`,
            mediaTitle,
            inviteAuthToken,
            timestamp: Date.now(),
          };

          const toUserId = String(payload?.toUserId || '').trim();
          const toFriendCode = String(payload?.toFriendCode || '')
            .trim()
            .replace(/^#/, '')
            .toUpperCase();
          const toUserNameLower = String(payload?.toUserName || '')
            .trim()
            .toLowerCase();

          let deliveredCount = 0;
          clients.forEach((meta, clientWs) => {
            if (clientWs.readyState !== WebSocket.OPEN || clientWs === ws) return;
            if (meta.userId === fromUserId) return;

            const matchById = Boolean(toUserId && meta.userId === toUserId);
            const matchByCode = Boolean(
              toFriendCode &&
                (meta.friendCode === toFriendCode ||
                  deriveServerFriendCode(meta.userId || '') === toFriendCode)
            );
            const matchByName = Boolean(
              toUserNameLower &&
                meta.userName &&
                meta.userName.trim().toLowerCase() === toUserNameLower
            );

            if (matchById || matchByCode || matchByName) {
              try {
                clientWs.send(
                  JSON.stringify({
                    type: 'INCOMING_ROOM_INVITE',
                    payload: inviteObj,
                  })
                );
                deliveredCount += 1;
              } catch {
                // ignore
              }
            }
          });

          if (deliveredCount === 0) {
            const queueKey = toFriendCode || toUserId;
            if (queueKey) {
              const existing = (pendingDirectInvites.get(queueKey) as unknown[]) || [];
              pendingDirectInvites.set(queueKey, [...existing.slice(-4), inviteObj]);
            }
          }

          ws.send(
            JSON.stringify({
              type: 'ROOM_INVITE_SENT_ACK',
              payload: {
                toUserId,
                toUserName: payload?.toUserName || 'Amigo',
                deliveredLive: deliveredCount > 0,
              },
            })
          );
          return;
        }

        if (type === 'NOTIFY_FRIEND_ADDED') {
          const senderMeta = clients.get(ws);
          const fromUser = payload?.fromUser || {};
          const fromUserId = String(fromUser.id || senderMeta?.userId || '').trim();
          const fromUserName = String(fromUser.name || senderMeta?.userName || 'Un amigo')
            .trim()
            .slice(0, 40);
          const fromUserAvatar = String(fromUser.avatar || senderMeta?.userAvatar || '🍿').slice(0, 16);
          const fromUserColor = String(fromUser.color || senderMeta?.userColor || '#E11D48').slice(0, 16);
          if (!fromUserId) return;

          const toUserId = String(payload?.toUserId || '').trim();
          const toFriendCode = String(payload?.toFriendCode || '')
            .trim()
            .replace(/^#/, '')
            .toUpperCase();

          const noticeObj = {
            id: `fadd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromUserId,
            fromUserName,
            fromUserAvatar,
            fromUserColor,
            fromFriendCode: deriveServerFriendCode(fromUserId),
            timestamp: Date.now(),
          };

          clients.forEach((meta, clientWs) => {
            if (clientWs.readyState !== WebSocket.OPEN || clientWs === ws) return;
            if (meta.userId === fromUserId) return;
            const matchById = Boolean(toUserId && meta.userId === toUserId);
            const matchByCode = Boolean(toFriendCode && meta.friendCode === toFriendCode);
            if (matchById || matchByCode) {
              try {
                clientWs.send(JSON.stringify({ type: 'INCOMING_FRIEND_ADDED', payload: noticeObj }));
              } catch {
                // ignore
              }
            }
          });
          return;
        }

        // Classic Board Games: Checkers, Chess, Connect 4 + Optional Clock (0 | 3 | 5 | 10 min)
        if (type === 'GAME_START') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room) return;

          const gameType: BoardGameType =
            payload?.gameType === 'chess'
              ? 'chess'
              : payload?.gameType === 'connect4'
                ? 'connect4'
                : 'checkers';
          const clockRaw = Number(payload?.clockMinutes || 0);
          const clockMinutes: BoardClockMinutes =
            clockRaw === 3 || clockRaw === 5 || clockRaw === 10 ? clockRaw : 0;
          const soloLocal = Boolean(payload?.soloLocal);
          const actor =
            room.participants.find((p) => p.id === senderMeta?.userId) ||
            (senderMeta?.userId
              ? {
                  id: senderMeta.userId,
                  name: senderMeta.userName || 'Jugador',
                  avatar: senderMeta.userAvatar || '🎮',
                  color: senderMeta.userColor || '#9146FF',
                }
              : undefined);

          room.gameState = createInitialBoardGameState(
            gameType,
            actor,
            soloLocal,
            undefined,
            clockMinutes,
            room.gameState?.matchHistory || [],
            !soloLocal
          );

          const gameLabel =
            gameType === 'chess' ? 'Ajedrez' : gameType === 'connect4' ? 'Conecta 4' : 'Damas Españolas';
          const sysMsg: RoomChatMessageRecord = {
            id: `game-start-${Date.now()}`,
            senderId: 'system',
            senderName: 'NAIM CINE',
            senderAvatar: gameType === 'chess' ? '♟️' : gameType === 'connect4' ? '🟡' : '🔴',
            senderColor: '#9146FF',
            text: `${actor?.name || 'Un participante'} abrió mesa de ${gameLabel}${
              clockMinutes > 0 ? ` (${clockMinutes} min)` : ''
            }${soloLocal ? ' · Modo libre' : ' · Elige color y espera al anfitrión'}.`,
            timestamp: Date.now(),
            isSystem: true,
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages = room.messages.slice(-150);
          schedulePersistRoom(room.id);

          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: {
              gameState: room.gameState,
              message: sysMsg,
            },
          });
          scheduleBoardTurnTimer(room);
          return;
        }

        if (type === 'GAME_START_MATCH') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.gameState || !senderMeta?.userId) return;

          const isHostUser =
            room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
          if (!isHostUser && !room.gameState.soloLocal) {
            ws.send(
              JSON.stringify({
                type: 'GAME_MOVE_REJECTED',
                payload: {
                  error: 'Solo el anfitrión puede pulsar Play para iniciar la partida.',
                  gameState: room.gameState,
                },
              })
            );
            return;
          }

          room.gameState = startBoardMatch(room.gameState);
          schedulePersistRoom(room.id);
          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: { gameState: room.gameState },
          });
          scheduleBoardTurnTimer(room);
          return;
        }

        if (type === 'GAME_JOIN_SEAT') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.gameState || !senderMeta?.userId) return;

          const side: 'w' | 'b' | 'spectate' =
            payload?.side === 'w' ? 'w' : payload?.side === 'b' ? 'b' : 'spectate';
          const actor = room.participants.find((p) => p.id === senderMeta.userId) || {
            id: senderMeta.userId,
            name: senderMeta.userName || 'Jugador',
            avatar: senderMeta.userAvatar || '🎮',
            color: senderMeta.userColor || '#9146FF',
          };

          if (
            side !== 'spectate' &&
            !room.gameState.soloLocal &&
            room.gameState.players[side] &&
            room.gameState.players[side]!.userId !== actor.id
          ) {
            ws.send(
              JSON.stringify({
                type: 'GAME_MOVE_REJECTED',
                payload: {
                  error: 'Ese asiento ya está ocupado por otro jugador.',
                  gameState: room.gameState,
                },
              })
            );
            return;
          }

          room.gameState = joinGameSeat(room.gameState, actor, side);
          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: { gameState: room.gameState },
          });
          scheduleBoardTurnTimer(room);
          return;
        }

        if (type === 'GAME_MOVE') {
          const valid = wsGameMoveSchema.safeParse(payload);
          if (!valid.success) return;
          const senderMeta = clients.get(ws);
          const targetRoomId = valid.data.roomId.toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.gameState || !senderMeta?.userId) return;

          const from = valid.data.from as BoardCoord;
          const to = valid.data.to as BoardCoord;
          const rawPromo = String(valid.data.promotionPiece || 'q').toUpperCase();
          const promo: ChessPromotionPiece =
            rawPromo === 'R' || rawPromo === 'B' || rawPromo === 'N' ? rawPromo : 'Q';

          const result = applyBoardMove(room.gameState, senderMeta.userId, from, to, promo);
          if (!result.ok) {
            ws.send(
              JSON.stringify({
                type: 'GAME_MOVE_REJECTED',
                payload: {
                  error: result.error,
                  gameState: room.gameState,
                },
              })
            );
            return;
          }

          room.gameState = result.state;
          let finishMsg: RoomChatMessageRecord | null = null;
          if (result.finishedNow) {
            const winnerName =
              result.state.winner === 'draw'
                ? null
                : result.state.winner
                  ? result.state.players[result.state.winner]?.name ||
                    (result.state.winner === 'w' ? 'Blancas' : 'Negras')
                  : null;
            finishMsg = {
              id: `game-end-${Date.now()}`,
              senderId: 'system',
              senderName: 'NAIM CINE',
              senderAvatar: '🏆',
              senderColor: '#10b981',
              text:
                result.state.winner === 'draw'
                  ? 'Tablas / empate en el tablero.'
                  : `🏆 ${winnerName} gana la partida (${result.notation}).`,
              timestamp: Date.now(),
              isSystem: true,
            };
            room.messages.push(finishMsg);
            if (room.messages.length > 150) room.messages = room.messages.slice(-150);
            schedulePersistRoom(room.id);
          }

          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: {
              gameState: room.gameState,
              message: finishMsg,
            },
          });
          scheduleBoardTurnTimer(room);
          return;
        }

        if (type === 'GAME_RESIGN') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.gameState || !senderMeta?.userId) return;

          const next = resignBoardGame(room.gameState, senderMeta.userId);
          if (!next) return;
          room.gameState = next;
          const winnerName =
            next.winner && next.winner !== 'draw'
              ? next.players[next.winner]?.name || (next.winner === 'w' ? 'Blancas' : 'Negras')
              : 'Rival';
          const sysMsg: RoomChatMessageRecord = {
            id: `game-resign-${Date.now()}`,
            senderId: 'system',
            senderName: 'NAIM CINE',
            senderAvatar: '🏳️',
            senderColor: '#f59e0b',
            text: `${senderMeta.userName || 'Un jugador'} se rindió · Gana ${winnerName}.`,
            timestamp: Date.now(),
            isSystem: true,
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages = room.messages.slice(-150);
          schedulePersistRoom(room.id);

          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: { gameState: room.gameState, message: sysMsg },
          });
          scheduleBoardTurnTimer(room);
          return;
        }

        if (type === 'GAME_RESET') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.gameState) return;

          const nextType: BoardGameType | undefined =
            payload?.gameType === 'chess' ||
            payload?.gameType === 'checkers' ||
            payload?.gameType === 'connect4'
              ? payload.gameType
              : undefined;
          const clockRaw = Number(payload?.clockMinutes ?? room.gameState.clockMinutes ?? 0);
          const clockMinutes: BoardClockMinutes =
            clockRaw === 3 || clockRaw === 5 || clockRaw === 10 ? clockRaw : 0;

          room.gameState = resetBoardGame(room.gameState, {
            gameType: nextType,
            swapColors: Boolean(payload?.swapColors),
            clockMinutes,
          });
          schedulePersistRoom(room.id);
          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: { gameState: room.gameState },
          });
          scheduleBoardTurnTimer(room);
          return;
        }

        if (type === 'GAME_CLOSE') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.gameState) return;
          const existingTimer = boardTurnTimers.get(room.id);
          if (existingTimer) {
            clearTimeout(existingTimer);
            boardTurnTimers.delete(room.id);
          }
          room.gameState = null;
          schedulePersistRoom(room.id);
          broadcastToRoom(room.id, {
            type: 'GAME_STATE_UPDATED',
            payload: { gameState: null },
          });
          return;
        }

        // 4-Player Party Games (Parchís Español & UNO Oficial with waiting lobby + 15s turn timer)
        if (type === 'PARTY_GAME_START') {
          const valid = wsPartyGameStartSchema.safeParse(payload);
          if (!valid.success) return;
          const roomId = valid.data.roomId.toLowerCase();
          const room = rooms.get(roomId);
          if (!room) return;

          const humans = room.participants
            .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
            .slice(0, 4)
            .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }));

          const gameType: PartyGameType = valid.data.gameType;
          room.partyGameState =
            gameType === 'uno'
              ? createInitialUnoState(humans, { waitForHost: true })
              : createInitialParchisState(humans, { waitForHost: true });

          const sysMsg: RoomChatMessageRecord = {
            id: `party-start-${Date.now()}`,
            senderId: 'system',
            senderName: 'NAIM CINE',
            senderAvatar: gameType === 'uno' ? '🃏' : '🎲',
            senderColor: '#10b981',
            text: `Mesa de ${gameType === 'uno' ? 'UNO Oficial (108 cartas)' : 'Parchís Español (68 casillas)'} abierta · Escoge color y espera al anfitrión.`,
            timestamp: Date.now(),
            isSystem: true,
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages = room.messages.slice(-150);
          schedulePersistRoom(room.id);

          broadcastToRoom(room.id, {
            type: 'PARTY_GAME_STATE_UPDATED',
            payload: { partyGameState: room.partyGameState, message: sysMsg },
          });
          return;
        }

        if (type === 'PARTY_GAME_ACTION') {
          const valid = wsPartyGameActionSchema.safeParse(payload);
          if (!valid.success) return;
          const roomId = valid.data.roomId.toLowerCase();
          const room = rooms.get(roomId);
          const senderMeta = clients.get(ws);
          if (!room || !room.partyGameState || !senderMeta?.userId) return;

          const { action, pieceId, cardId, chosenColor, seatIndex } = valid.data;
          if (action === 'rematch') {
            const existingScores = room.partyGameState.players.map((p) => p.score);
            const humans = room.participants
              .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
              .slice(0, 4)
              .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }));
            const maxScore = Math.max(...existingScores, 0);
            room.partyGameState =
              room.partyGameState.gameType === 'uno'
                ? createInitialUnoState(humans, {
                    waitForHost: false,
                    preservedSeats: room.partyGameState.players,
                    existingScores: maxScore >= 500 ? [0, 0, 0, 0] : existingScores,
                  })
                : createInitialParchisState(humans, {
                    waitForHost: false,
                    preservedSeats: room.partyGameState.players,
                  });
          } else if (action === 'start_match') {
            const isHostUser =
              room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
            if (!isHostUser) {
              ws.send(
                JSON.stringify({
                  type: 'GAME_MOVE_REJECTED',
                  payload: { error: 'Solo el anfitrión puede pulsar Play para comenzar.' },
                })
              );
              return;
            }
            room.partyGameState = startPartyMatch(room.partyGameState);
          } else if (action === 'join_seat') {
            const res = claimPartyBotSeat(
              room.partyGameState,
              {
                id: senderMeta.userId,
                name: senderMeta.userName || 'Jugador',
                avatar: senderMeta.userAvatar || '🎮',
              },
              seatIndex
            );
            if (!res.ok) {
              ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
              return;
            }
            room.partyGameState = res.state;
          } else if (room.partyGameState.gameType === 'parchis') {
            if (action === 'roll_dice') {
              const res = rollParchisDice(room.partyGameState, senderMeta.userId);
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            } else if (action === 'move_piece' && typeof pieceId === 'number') {
              const res = moveParchisPiece(room.partyGameState, senderMeta.userId, pieceId);
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            }
          } else if (room.partyGameState.gameType === 'uno') {
            if (action === 'play_card' && cardId) {
              const res = playUnoCard(
                room.partyGameState,
                senderMeta.userId,
                cardId,
                chosenColor
              );
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            } else if (action === 'draw_card' || action === 'pass_turn') {
              const res = drawUnoCardsAndAdvance(room.partyGameState, senderMeta.userId);
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            } else if (action === 'call_uno') {
              const res = callUnoAction(room.partyGameState, senderMeta.userId);
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            } else if (action === 'catch_uno') {
              const res = catchUnoFailureAction(room.partyGameState, senderMeta.userId);
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            } else if (action === 'accept_wild4' || action === 'challenge_wild4') {
              const res = resolveUnoWild4Challenge(
                room.partyGameState,
                senderMeta.userId,
                action === 'challenge_wild4' ? 'challenge' : 'accept'
              );
              if (!res.ok) {
                ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
                return;
              }
              room.partyGameState = res.state;
            }
          }

          schedulePersistRoom(room.id);
          broadcastToRoom(room.id, {
            type: 'PARTY_GAME_STATE_UPDATED',
            payload: { partyGameState: room.partyGameState },
          });
          schedulePartyBotTurnIfNeeded(room);
          return;
        }

        if (type === 'PARTY_GAME_CLOSE') {
          const senderMeta = clients.get(ws);
          const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
            .trim()
            .toLowerCase();
          const room = rooms.get(targetRoomId);
          if (!room || !room.partyGameState) return;
          const timer = partyBotTimers.get(room.id);
          if (timer) {
            clearTimeout(timer);
            partyBotTimers.delete(room.id);
          }
          room.partyGameState = null;
          schedulePersistRoom(room.id);
          broadcastToRoom(room.id, {
            type: 'PARTY_GAME_STATE_UPDATED',
            payload: { partyGameState: null },
          });
          return;
        }

        // WebRTC Live Voice Chat Signaling for Multiplayer Games
        if (type === 'VOICE_JOIN') {
          const valid = wsVoiceRoomSchema.safeParse(payload);
          if (!valid.success) return;
          const senderMeta = clients.get(ws);
          const roomId = valid.data.roomId.toLowerCase();
          if (!senderMeta?.userId || senderMeta.roomId !== roomId) return;

          let peersMap = roomVoicePeers.get(roomId);
          if (!peersMap) {
            peersMap = new Map();
            roomVoicePeers.set(roomId, peersMap);
          }
          peersMap.set(senderMeta.userId, {
            userId: senderMeta.userId,
            userName: senderMeta.userName || 'Jugador',
            avatar: senderMeta.userAvatar || '🎮',
            color: senderMeta.userColor || '#9146FF',
            isMuted: false,
            joinedAt: Date.now(),
          });

          broadcastToRoom(roomId, {
            type: 'VOICE_PARTICIPANTS_UPDATED',
            payload: {
              roomId,
              peers: getVoicePeersForRoom(roomId),
            },
          });
          return;
        }

        if (type === 'VOICE_LEAVE') {
          const valid = wsVoiceRoomSchema.safeParse(payload);
          if (!valid.success) return;
          const senderMeta = clients.get(ws);
          const roomId = valid.data.roomId.toLowerCase();
          if (!senderMeta?.userId || senderMeta.roomId !== roomId) return;
          removeVoicePeer(roomId, senderMeta.userId);
          return;
        }

        if (type === 'VOICE_STATE_UPDATE') {
          const valid = wsVoiceStateSchema.safeParse(payload);
          if (!valid.success) return;
          const senderMeta = clients.get(ws);
          const roomId = valid.data.roomId.toLowerCase();
          if (!senderMeta?.userId || senderMeta.roomId !== roomId) return;
          const peersMap = roomVoicePeers.get(roomId);
          const existing = peersMap?.get(senderMeta.userId);
          if (!existing) return;
          peersMap!.set(senderMeta.userId, {
            ...existing,
            isMuted: valid.data.isMuted,
          });
          broadcastToRoom(roomId, {
            type: 'VOICE_PARTICIPANTS_UPDATED',
            payload: {
              roomId,
              peers: getVoicePeersForRoom(roomId),
            },
          });
          return;
        }

        if (type === 'VOICE_SIGNAL') {
          const valid = wsVoiceSignalSchema.safeParse(payload);
          if (!valid.success) return;
          const senderMeta = clients.get(ws);
          const roomId = valid.data.roomId.toLowerCase();
          if (!senderMeta?.userId || senderMeta.roomId !== roomId) return;
          const { targetUserId, signalType, sdp, candidate } = valid.data;
          if (!targetUserId || targetUserId === senderMeta.userId) return;

          const packet = JSON.stringify({
            type: 'VOICE_SIGNAL',
            payload: {
              roomId,
              fromUserId: senderMeta.userId,
              targetUserId,
              signalType,
              sdp,
              candidate,
            },
          });
          clients.forEach((meta, clientWs) => {
            if (
              meta.roomId === roomId &&
              meta.userId === targetUserId &&
              clientWs.readyState === WebSocket.OPEN
            ) {
              clientWs.send(packet);
            }
          });
        }
      } catch (err) {
        logger.error({ err }, 'ws_message_handling_error');
      }
    });

    ws.on('close', async () => {
      const pairedCode = tvSocketToCode.get(ws);
      if (pairedCode) {
        const sess = tvPairingSessions.get(pairedCode);
        if (sess) sess.ws = null;
        tvSocketToCode.delete(ws);
      }

      const meta = clients.get(ws);
      clients.delete(ws);
      scheduleBroadcastOnlineUsers();
      if (!meta?.roomId || !meta?.userId) return;

      // Guard: if the same user still has another open socket in this room (reconnect/tab/auth refresh),
      // NEVER vacate their participant record, voice slot, or active game seat!
      let hasOtherOpenSocketInRoom = false;
      clients.forEach((otherMeta, otherWs) => {
        if (
          otherWs !== ws &&
          otherWs.readyState === WebSocket.OPEN &&
          otherMeta.roomId === meta.roomId &&
          otherMeta.userId === meta.userId
        ) {
          hasOtherOpenSocketInRoom = true;
        }
      });
      if (hasOtherOpenSocketInRoom) {
        return;
      }

      removeVoicePeer(meta.roomId, meta.userId);

      const room = rooms.get(meta.roomId);
      if (!room) return;

      room.participants = room.participants.filter((p) => p.id !== meta.userId);

      let gameSeatChanged = false;
      if (room.gameState) {
        const nextPlayers = { ...room.gameState.players };
        if (nextPlayers.w?.userId === meta.userId) {
          nextPlayers.w = null;
          gameSeatChanged = true;
        }
        if (nextPlayers.b?.userId === meta.userId) {
          nextPlayers.b = null;
          gameSeatChanged = true;
        }
        if (gameSeatChanged) {
          room.gameState = {
            ...room.gameState,
            players: nextPlayers,
            status:
              room.gameState.status === 'finished'
                ? 'finished'
                : nextPlayers.w && nextPlayers.b
                  ? 'playing'
                  : 'waiting',
            updatedAt: Date.now(),
          };
        }
      }

      let partySeatChanged = false;
      if (room.partyGameState) {
        const vacated = vacatePartySeatToBot(room.partyGameState, meta.userId);
        if (vacated.changed) {
          room.partyGameState = vacated.state;
          partySeatChanged = true;
        }
      }

      schedulePersistRoom(meta.roomId);
      if (room.participants.length === 0) {
        await stopCloudSession(meta.roomId);
        return;
      }

      // Keep room.hostId strictly pinned to room.creatorId even when the creator leaves temporarily.
      if (room.creatorId) {
        room.hostId = room.creatorId;
      }

      const leaveMsg: RoomChatMessageRecord = {
        id: `leave-${Date.now()}`,
        senderId: 'system',
        senderName: 'NAIM CINE',
        senderAvatar: '👋',
        senderColor: '#71717a',
        text: `${meta.userName || 'Un participante'} salió de la sala`,
        timestamp: Date.now(),
        isSystem: true,
        systemType: 'leave',
      };
      room.messages.push(leaveMsg);
      schedulePersistRoom(meta.roomId);

      broadcastToRoom(meta.roomId, {
        type: 'PARTICIPANTS_UPDATED',
        payload: {
          participants: room.participants,
          hostId: room.hostId,
          message: leaveMsg,
        },
      });
      if (gameSeatChanged) {
        broadcastToRoom(meta.roomId, {
          type: 'GAME_STATE_UPDATED',
          payload: { gameState: room.gameState ?? null },
        });
      }
      if (partySeatChanged) {
        broadcastToRoom(meta.roomId, {
          type: 'PARTY_GAME_STATE_UPDATED',
          payload: { partyGameState: room.partyGameState ?? null },
        });
        schedulePartyBotTurnIfNeeded(room);
      }
    });
  });

  // SMART TV (SAMSUNG TIZEN / LG WEBOS / ANDROID TV) HTTP PAIRING & SYNC FALLBACK
  app.post('/api/tv/register', (req, res) => {
    const forceNew = Boolean(req.body?.forceNew);
    const existingCode = String(req.body?.existingCode || '')
      .replace(/\D/g, '')
      .slice(0, 4);
    const now = Date.now();

    if (!forceNew && existingCode.length === 4) {
      const existing = tvPairingSessions.get(existingCode);
      if (existing && existing.expiresAt > now && !existing.pairedPayload) {
        existing.expiresAt = now + 15 * 60 * 1000;
        tvPairingSessions.set(existingCode, existing, 15 * 60 * 1000);
        return res.json({
          success: true,
          code: existing.code,
          expiresAt: existing.expiresAt,
        });
      }
    }

    const code = generateTvPairingCode();
    const expiresAt = now + 15 * 60 * 1000;
    tvPairingSessions.set(code, {
      code,
      ws: null,
      createdAt: now,
      expiresAt,
    });
    saveDistributedKey(`tvpair:${code}`, { code, createdAt: now, expiresAt }, 900).catch(() => {});

    return res.json({
      success: true,
      code,
      expiresAt,
    });
  });

  app.get('/api/tv/poll/:code', async (req, res) => {
    const code = String(req.params.code || '')
      .replace(/\D/g, '')
      .slice(0, 4);
    let session = tvPairingSessions.get(code);
    if (!session && isDistributedStoreEnabled()) {
      const remote = await loadDistributedKey<TvPairingSession>(`tvpair:${code}`);
      if (remote) {
        session = remote;
        tvPairingSessions.set(code, remote);
      }
    }
    if (!session || session.expiresAt <= Date.now()) {
      return res.json({ success: false, expired: true, paired: false });
    }
    if (session.pairedPayload) {
      return res.json({
        success: true,
        paired: true,
        ...session.pairedPayload,
      });
    }
    return res.json({
      success: true,
      paired: false,
      expiresAt: session.expiresAt,
    });
  });

  app.post('/api/tv/claim', (req, res) => {
    const result = claimTvPairingCodeCore({
      rawCode: req.body?.code,
      targetRoomId: req.body?.roomId,
      roomNameHint: req.body?.roomName,
      claimedByRaw: req.body?.claimedBy,
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      code: result.code,
      roomId: result.roomId,
      roomName: result.roomName,
    });
  });

  app.post('/api/tv/remote', (req, res) => {
    const roomId = String(req.body?.roomId || '')
      .trim()
      .toLowerCase();
    const command = String(req.body?.command || '').trim();
    const senderName = String(req.body?.senderName || 'Mando móvil')
      .trim()
      .slice(0, 32);
    const userId = String(req.body?.userId || '').trim();

    const room = rooms.get(roomId);
    if (!room || !command) {
      return res.status(404).json({ success: false, error: 'Sala no encontrada' });
    }
    if (
      !canUserControlRoom({
        hostOnlyControl: room.hostOnlyControl,
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: userId || undefined,
        participants: room.participants,
      })
    ) {
      return res.status(403).json({
        success: false,
        error: 'Solo el anfitrión o un Co-anfitrión controla la sala',
      });
    }

    room.lastTvRemoteCommand = {
      seq: (room.lastTvRemoteCommand?.seq || 0) + 1,
      command,
      senderName,
      ts: Date.now(),
    };

    broadcastToRoom(room.id, {
      type: 'TV_REMOTE_COMMAND',
      payload: {
        command,
        senderName,
        seq: room.lastTvRemoteCommand.seq,
      },
    });

    return res.json({ success: true, seq: room.lastTvRemoteCommand.seq });
  });

  app.get('/api/rooms/:roomId', async (req, res) => {
    const roomId = String(req.params.roomId || '').toLowerCase();
    await hydrateRoomFromDistributedIfMissing(roomId);
    const { room } = getOrCreateRoom(roomId);

    if (room.pinCode) {
      const incomingPin = typeof req.query.pin === 'string' ? req.query.pin.trim() : '';
      const incomingTvToken =
        typeof req.query.tvAuthToken === 'string' ? req.query.tvAuthToken.trim() : '';
      let validTvToken = false;
      if (incomingTvToken) {
        let tokenEntry = tvAuthTokens.get(incomingTvToken);
        if (!tokenEntry && isDistributedStoreEnabled()) {
          const remoteTok = await loadDistributedKey<{ roomId: string; expiresAt: number }>(
            `tvtoken:${incomingTvToken}`
          );
          if (remoteTok) {
            tvAuthTokens.set(incomingTvToken, remoteTok);
            tokenEntry = remoteTok;
          }
        }
        if (tokenEntry && tokenEntry.roomId === roomId && tokenEntry.expiresAt > Date.now()) {
          validTvToken = true;
        }
      }
      if (!validTvToken && incomingPin !== room.pinCode) {
        return res.status(403).json({
          error: 'PIN required',
          hasPin: true,
          roomName: room.name,
        });
      }
    }

    if (req.query.tv === '1') {
      const ua = String(req.headers['user-agent'] || '');
      const defaultTvName = /Web0S|WebOS|LG/i.test(ua)
        ? 'LG webOS Smart TV'
        : /Tizen|Samsung/i.test(ua)
          ? 'Samsung Smart TV'
          : 'Smart TV';
      const tvId =
        typeof req.query.tvId === 'string' && req.query.tvId.trim()
          ? req.query.tvId.trim().slice(0, 40)
          : `tv-http-${roomId}`;
      const tvNameRaw =
        typeof req.query.tvName === 'string' && req.query.tvName.trim()
          ? req.query.tvName.trim().slice(0, 28)
          : defaultTvName;
      const tvDisplayName = tvNameRaw.includes('(TV)') ? tvNameRaw : `${tvNameRaw} (TV)`;
      tvHttpHeartbeats.set(`${roomId}:${tvId}`, Date.now());

      const exists = room.participants.some((p) => p.id === tvId);
      if (!exists) {
        room.participants.push({
          id: tvId,
          name: tvDisplayName,
          avatar: '📺',
          color: '#E11D48',
          isHost: false,
          joinedAt: Date.now(),
        });
        broadcastToRoom(roomId, {
          type: 'PARTICIPANTS_UPDATED',
          payload: {
            participants: room.participants,
            hostId: room.hostId,
          },
        });
      }
    }

    const now = Date.now();
    let pruned = false;
    for (const [key, lastSeen] of tvHttpHeartbeats.entries()) {
      if (now - lastSeen > 12_000) {
        tvHttpHeartbeats.delete(key);
        const [rId, pId] = key.split(':');
        if (rId === roomId && pId) {
          const before = room.participants.length;
          room.participants = room.participants.filter((p) => p.id !== pId);
          if (room.participants.length !== before) pruned = true;
        }
      }
    }
    if (pruned) {
      broadcastToRoom(roomId, {
        type: 'PARTICIPANTS_UPDATED',
        payload: {
          participants: room.participants,
          hostId: room.hostId,
        },
      });
    }

    res.json(serializeRoomForClient(room));
  });

  return {
    getStats: () => ({
      roomsCount: rooms.size,
      connectedClientsCount: clients.size,
    }),
  };
}
