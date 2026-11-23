import crypto from 'crypto';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
} from '../extractors/httpHelpers.ts';
import {
  MAX_WS_PAYLOAD_BYTES,
  buildHostGameInvitePayload,
  createInitialRoomRecord,
  getRoomCompanions,
  sanitizeRoomFromSnapshot,
  serializeRoomForClient as serializeRoomForClientBase,
  serializeRoomSnapshot,
  type ClientMeta,
  type CloudRoomSession,
  type RoomChatMessageRecord,
  type RoomRecord,
  type TvPairingSession,
} from './roomHubHelpers.ts';

export {
  buildHostGameInvitePayload,
  type CloudRoomSession,
  type RoomChatMessageRecord,
  type RoomRecord,
};
import {
  fetchSportsHtmlHop,
  verifyM3u8HasCleanVideoFrame,
} from '../extractors/sportsExtractor.ts';
import { resolveCloudSessionLite } from '../services/streamSnifferService.ts';
import { pruneJoinCooldownCache } from '../services/roomSync.ts';
import { WsRateLimiter, wsEnvelopeSchema } from './wsSchemas.ts';
import {
  isDistributedStoreEnabled,
  loadDistributedKey,
  loadRoomsSnapshotFromDisk,
  saveDistributedKey,
  writeRoomsSnapshotToDisk,
} from '../services/distributedStore.ts';
import { redactPinturilloForUser } from '../../src/shared/pinturillo.ts';
import { redactPokerStateForUser } from '../../src/shared/texasHoldem.ts';
import { redactBlackjackState } from '../../src/shared/blackjack.ts';
import type {
  RoomGameInviteType,
  VoicePeerState,
} from '../../src/shared/protocol.ts';
import { createRoomGameTimers } from './roomGameTimers.ts';
import { registerRoomHttpRoutes } from './roomHttpRoutes.ts';
import { handleSocketDisconnect } from './roomDisconnectHandler.ts';
import { handlePresenceAndJoinMessage } from './handlers/roomPresenceAndJoinHandlers.ts';
import { handleSyncAndChatMessage } from './handlers/roomSyncAndChatHandlers.ts';
import { handleBoardAndPartyMessage } from './handlers/boardAndPartyHandlers.ts';
import { handleArcadeGameMessage } from './handlers/arcadeGameHandlers.ts';
import { handleCasinoAndVoiceMessage } from './handlers/casinoAndVoiceHandlers.ts';
import { handleRacingGyroMessage } from './handlers/racingGyroHandlers.ts';
import type { OnlineUserSnapshot, RoomHubContext, WsMessageHandler } from './handlers/types.ts';

const MESSAGE_HANDLERS: WsMessageHandler[] = [
  handlePresenceAndJoinMessage,
  handleSyncAndChatMessage,
  handleBoardAndPartyMessage,
  handleArcadeGameMessage,
  handleCasinoAndVoiceMessage,
  handleRacingGyroMessage,
];

export function createRoomHub(app: express.Express, wss: WebSocketServer) {
  const rooms = new Map<string, RoomRecord>();
  const cloudSessions = new Map<string, CloudRoomSession>();
  const roomPollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const partyBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const boardTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pinturilloTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const poolTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const poolDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const chapasTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pokerBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const headSoccerSeqByRoom = new Map<string, number>();
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

  loadRoomsSnapshotFromDisk<RoomRecord>((item) => {
    rooms.set(item.id, sanitizeRoomFromSnapshot(item));
  });

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
    const clearTimerMap = (map: Map<string, ReturnType<typeof setTimeout>>, key: string) => {
      const t = map.get(key);
      if (t) {
        clearTimeout(t);
        map.delete(key);
      }
    };
    for (const [id, r] of rooms.entries()) {
      if ((!r.participants || r.participants.length === 0) && now - (r.createdAt || 0) > maxInactiveMs) {
        rooms.delete(id);
        clearTimerMap(roomPollTimers, id);
        clearTimerMap(partyBotTimers, id);
        clearTimerMap(boardTurnTimers, id);
        clearTimerMap(pinturilloTimers, id);
        clearTimerMap(poolTurnTimers, id);
        clearTimerMap(chapasTurnTimers, id);
        clearTimerMap(pokerBotTimers, id);
        headSoccerSeqByRoom.delete(id);
        roomVoicePeers.delete(id);
        cloudSessions.delete(id);
        const prefix = `${id}:`;
        for (const [poolKey, poolTimer] of poolDisconnectTimers.entries()) {
          if (poolKey.startsWith(prefix)) {
            clearTimeout(poolTimer);
            poolDisconnectTimers.delete(poolKey);
          }
        }
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

    const created = createInitialRoomRecord(roomId, roomName);
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

  function getVoicePeersForRoom(roomId: string): VoicePeerState[] {
    const map = roomVoicePeers.get(roomId);
    return map ? Array.from(map.values()) : [];
  }

  function broadcastToRoom(roomId: string, message: unknown, excludeWs?: WebSocket) {
    const serialized = JSON.stringify(message);
    clients.forEach((meta, clientWs) => {
      if (meta.roomId === roomId && clientWs.readyState === WebSocket.OPEN && clientWs !== excludeWs) {
        clientWs.send(serialized);
      }
    });
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

  function serializeRoomForClient(room: RoomRecord, viewerUserId = '') {
    return serializeRoomForClientBase(room, viewerUserId, getVoicePeersForRoom(room.id));
  }

  function broadcastPokerState(room: RoomRecord, message?: RoomChatMessageRecord | null) {
    clients.forEach((meta, clientWs) => {
      if (meta.roomId === room.id && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'POKER_STATE_UPDATED',
            payload: {
              pokerGameState: redactPokerStateForUser(room.pokerGameState ?? null, meta.userId || ''),
              message: message ?? null,
            },
          })
        );
      }
    });
  }

  function broadcastBlackjackState(room: RoomRecord, message?: RoomChatMessageRecord | null) {
    broadcastToRoom(room.id, {
      type: 'BLACKJACK_STATE_UPDATED',
      payload: {
        blackjackState: redactBlackjackState(room.blackjackState ?? null),
        message: message ?? null,
      },
    });
  }

  function broadcastPinturilloState(room: RoomRecord, message?: RoomChatMessageRecord | null) {
    clients.forEach((meta, clientWs) => {
      if (meta.roomId === room.id && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'PINTURILLO_STATE_UPDATED',
            payload: {
              pinturilloState: redactPinturilloForUser(
                room.pinturilloState ?? null,
                meta.userId || ''
              ),
              message: message ?? null,
            },
          })
        );
      }
    });
  }

  function clearMatchResponses(room: RoomRecord, onlyGameType?: RoomGameInviteType) {
    if (!room.matchResponses) return;
    if (onlyGameType && room.matchResponses.gameType !== onlyGameType) return;
    room.matchResponses = null;
    broadcastToRoom(room.id, {
      type: 'GAME_INVITE_STATUS_UPDATED',
      payload: { matchResponses: null },
    });
  }

  function maybeBroadcastHostGameInvite(
    room: RoomRecord,
    senderWs: WebSocket,
    senderMeta: ClientMeta | undefined,
    gameType: RoomGameInviteType,
    soloLocal = false
  ) {
    const invite = buildHostGameInvitePayload({
      room,
      senderUserId: senderMeta?.userId,
      senderName: senderMeta?.userName,
      senderAvatar: senderMeta?.userAvatar,
      gameType,
      soloLocal,
    });
    if (!invite) {
      clearMatchResponses(room);
      return;
    }

    const now = Date.now();
    const companions = getRoomCompanions(room, senderMeta?.userId);
    room.matchResponses = {
      inviteId: invite.id,
      gameType,
      hostId: invite.inviterId,
      hostName: invite.inviterName,
      createdAt: now,
      responses: companions.map((p) => ({
        userId: p.id,
        userName: p.name,
        avatar: p.avatar || '🍿',
        status: 'pending',
        updatedAt: now,
      })),
    };
    broadcastToRoom(room.id, {
      type: 'GAME_INVITE_STATUS_UPDATED',
      payload: { matchResponses: room.matchResponses },
    });

    broadcastToRoom(
      room.id,
      {
        type: 'GAME_MATCH_INVITE',
        payload: invite,
      },
      senderWs
    );
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
      return { ok: false, error: 'Código de 4 dígitos no válido.' };
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
    saveDistributedKey(
      `tvpair:${code}`,
      {
        code: session.code,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        pairedPayload: session.pairedPayload,
      },
      120
    ).catch(() => {});

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

  function getOnlineUsersSnapshot(): OnlineUserSnapshot[] {
    const byUserId = new Map<string, OnlineUserSnapshot>();

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
      senderName: 'RiffanTV',
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

  const timers = createRoomGameTimers({
    rooms,
    pokerBotTimers,
    pinturilloTimers,
    poolTurnTimers,
    poolDisconnectTimers,
    chapasTurnTimers,
    boardTurnTimers,
    partyBotTimers,
    schedulePersistRoom,
    broadcastToRoom,
    broadcastPokerState,
    broadcastPinturilloState,
  });

  const ctx: RoomHubContext = {
    rooms,
    cloudSessions,
    roomPollTimers,
    partyBotTimers,
    boardTurnTimers,
    pinturilloTimers,
    poolTurnTimers,
    poolDisconnectTimers,
    chapasTurnTimers,
    pokerBotTimers,
    headSoccerSeqByRoom,
    roomVoicePeers,
    tvPairingSessions,
    tvSocketToCode,
    tvHttpHeartbeats,
    tvAuthTokens,
    clients,
    pendingDirectInvites,
    schedulePersistRoom,
    generateTvPairingCode,
    getOrCreateRoom,
    hydrateRoomFromDistributedIfMissing,
    getVoicePeersForRoom,
    removeVoicePeer,
    serializeRoomForClient,
    broadcastToRoom,
    broadcastPokerState,
    broadcastBlackjackState,
    broadcastPinturilloState,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    claimTvPairingCodeCore,
    deriveServerFriendCode,
    getOnlineUsersSnapshot,
    scheduleBroadcastOnlineUsers,
    flushPendingInvitesForClient,
    finalizeRoomPoll,
    stopCloudSession,
    startCloudSession,
    ...timers,
  };

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

        for (const handler of MESSAGE_HANDLERS) {
          const handled = await handler(type, payload, ws, ctx);
          if (handled) return;
        }
      } catch (err) {
        logger.error({ err }, 'ws_message_handling_error');
      }
    });

    ws.on('close', async () => {
      await handleSocketDisconnect(ws, ctx);
    });
  });

  registerRoomHttpRoutes(app, ctx);

  return {
    getStats: () => ({
      roomsCount: rooms.size,
      connectedClientsCount: clients.size,
    }),
  };
}
