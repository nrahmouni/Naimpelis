import crypto from 'crypto';
import { WebSocket } from 'ws';
import { verifyFirebaseIdToken } from '../../services/firebaseAuthVerify.ts';
import {
  isDistributedStoreEnabled,
  loadDistributedKey,
  saveDistributedKey,
} from '../../services/distributedStore.ts';
import {
  canUserControlRoom,
  shouldEmitJoinSystemMessage,
} from '../../services/roomSync.ts';
import type { Pool8BallState } from '../../../src/shared/pool8Ball.ts';
import type { RoomChatMessageRecord, TvPairingSession } from '../roomHubHelpers.ts';
import {
  wsJoinRoomSchema,
  wsRegisterPresenceSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handlePresenceAndJoinMessage: WsMessageHandler = async (
  type,
  payload,
  ws,
  ctx
) => {
  const {
    rooms,
    tvPairingSessions,
    tvSocketToCode,
    tvAuthTokens,
    clients,
    pendingDirectInvites,
    schedulePersistRoom,
    generateTvPairingCode,
    getOrCreateRoom,
    hydrateRoomFromDistributedIfMissing,
    removeVoicePeer,
    serializeRoomForClient,
    broadcastToRoom,
    claimTvPairingCodeCore,
    deriveServerFriendCode,
    getOnlineUsersSnapshot,
    scheduleBroadcastOnlineUsers,
    flushPendingInvitesForClient,
    clearPoolDisconnectTimer,
  } = ctx;

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
    return true;
  }

  if (type === 'REGISTER_PRESENCE') {
    const valid = wsRegisterPresenceSchema.safeParse(payload);
    if (!valid.success) return true;
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
        return true;
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
    return true;
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
    return true;
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
      return true;
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
        return true;
      }
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
        return true;
      }
    }

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

    let poolReconnected = false;
    if (room.poolGameState) {
      clearPoolDisconnectTimer(roomId, userId);
      const seatIdx = room.poolGameState.players.findIndex((p) => p?.userId === userId);
      if (seatIdx !== -1 && room.poolGameState.players[seatIdx]) {
        const updatedPlayers: Pool8BallState['players'] = [
          room.poolGameState.players[0] ? { ...room.poolGameState.players[0] } : null,
          room.poolGameState.players[1] ? { ...room.poolGameState.players[1] } : null,
        ];
        updatedPlayers[seatIdx]!.connected = true;
        updatedPlayers[seatIdx]!.disconnectedAt = null;
        room.poolGameState = {
          ...room.poolGameState,
          players: updatedPlayers,
          updatedAt: Date.now(),
        };
        poolReconnected = true;
      }
    }

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
        senderName: 'RiffanTV',
        senderAvatar: userAvatar,
        senderColor: '#10b981',
        text: `${userName} se ha unido a la sala`,
        timestamp: Date.now(),
        isSystem: true,
        systemUserId: userId,
        systemType: 'join',
      };
      room.messages.push(joinMsg);
      if (room.messages.length > 150) room.messages.shift();
    }

    schedulePersistRoom(roomId);

    ws.send(
      JSON.stringify({
        type: 'ROOM_STATE',
        payload: { ...serializeRoomForClient(room, userId), serverTime: Date.now() },
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
    if (poolReconnected && room.poolGameState) {
      broadcastToRoom(
        roomId,
        {
          type: 'POOL_STATE_UPDATED',
          payload: { poolGameState: room.poolGameState },
        },
        ws
      );
    }
    return true;
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
      return true;
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
    return true;
  }

  if (type === 'TV_REMOTE_COMMAND') {
    const { roomId: rawRoomId, command, senderName } = payload || {};
    const room = rooms.get(String(rawRoomId || '').toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !command) return true;
    if (
      !canUserControlRoom({
        hostOnlyControl: room.hostOnlyControl,
        creatorId: room.creatorId,
        hostId: room.hostId,
        userId: senderMeta?.userId,
        participants: room.participants,
      })
    ) {
      return true;
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
    return true;
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
    if (!targetRoomId) return true;

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
    return true;
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
    if (!fromUserId) return true;

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
    return true;
  }

  return false;
};
