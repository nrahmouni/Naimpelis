import { WebSocket } from 'ws';
import { vacatePartySeatToBot } from '../../src/shared/partyGames.ts';
import {
  POOL_DISCONNECT_GRACE_MS,
  forfeitPoolMatch,
  type Pool8BallState,
} from '../../src/shared/pool8Ball.ts';
import type { FutbolChapasState } from '../../src/shared/futbolChapas.ts';
import type { RoomChatMessageRecord } from './roomHubHelpers.ts';
import type { RoomHubContext } from './handlers/types.ts';

export async function handleSocketDisconnect(
  ws: WebSocket,
  ctx: RoomHubContext
): Promise<void> {
  const {
    rooms,
    poolDisconnectTimers,
    tvPairingSessions,
    tvSocketToCode,
    clients,
    schedulePersistRoom,
    removeVoicePeer,
    broadcastToRoom,
    scheduleBroadcastOnlineUsers,
    stopCloudSession,
    stopPokerBotTimer,
    stopPinturilloTimer,
    stopPoolTurnTimer,
    clearPoolDisconnectTimer,
    stopChapasTimer,
    schedulePartyBotTurnIfNeeded,
  } = ctx;

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

  let poolSeatDisconnected = false;
  if (room.poolGameState && room.poolGameState.status === 'playing' && meta.userId) {
    const seatIdx = room.poolGameState.players.findIndex((p) => p?.userId === meta.userId);
    if (seatIdx !== -1 && room.poolGameState.players[seatIdx]) {
      const updatedPlayers: Pool8BallState['players'] = [
        room.poolGameState.players[0] ? { ...room.poolGameState.players[0] } : null,
        room.poolGameState.players[1] ? { ...room.poolGameState.players[1] } : null,
      ];
      updatedPlayers[seatIdx]!.connected = false;
      updatedPlayers[seatIdx]!.disconnectedAt = Date.now();
      room.poolGameState = {
        ...room.poolGameState,
        players: updatedPlayers,
        updatedAt: Date.now(),
      };
      poolSeatDisconnected = true;

      const dcRoomId = meta.roomId;
      const dcUserId = meta.userId;
      clearPoolDisconnectTimer(dcRoomId, dcUserId);
      const dcTimer = setTimeout(() => {
        poolDisconnectTimers.delete(`${dcRoomId}:${dcUserId}`);
        const latestRoom = rooms.get(dcRoomId);
        const curr = latestRoom?.poolGameState;
        if (!latestRoom || !curr || curr.status !== 'playing') return;
        const seat = curr.players.find((p) => p?.userId === dcUserId);
        if (!seat || seat.connected !== false) return;
        const forfeited = forfeitPoolMatch(curr, dcUserId, 'disconnect_forfeit');
        if (!forfeited) return;
        latestRoom.poolGameState = forfeited;
        stopPoolTurnTimer(dcRoomId);
        schedulePersistRoom(dcRoomId);
        broadcastToRoom(dcRoomId, {
          type: 'POOL_STATE_UPDATED',
          payload: { poolGameState: latestRoom.poolGameState },
        });
      }, POOL_DISCONNECT_GRACE_MS);
      dcTimer.unref?.();
      poolDisconnectTimers.set(`${dcRoomId}:${dcUserId}`, dcTimer);
    }
  }

  let chapasSeatChanged = false;
  if (room.chapasState && room.chapasState.status === 'waiting' && meta.userId) {
    const idx = room.chapasState.players.findIndex((p) => p && !p.isBot && p.userId === meta.userId);
    if (idx !== -1) {
      const nextPlayers = [...room.chapasState.players] as FutbolChapasState['players'];
      nextPlayers[idx] = null;
      room.chapasState = { ...room.chapasState, players: nextPlayers, updatedAt: Date.now() };
      chapasSeatChanged = true;
    }
  }

  let matchResponseChanged = false;
  if (room.matchResponses && meta.userId) {
    const idx = room.matchResponses.responses.findIndex(
      (r) => r.userId === meta.userId && r.status === 'pending'
    );
    if (idx !== -1) {
      const nextResp = room.matchResponses.responses.map((r, i) =>
        i === idx ? { ...r, status: 'declined' as const, updatedAt: Date.now() } : r
      );
      room.matchResponses = { ...room.matchResponses, responses: nextResp };
      matchResponseChanged = true;
    }
  }

  schedulePersistRoom(meta.roomId);
  if (room.participants.length === 0) {
    stopPinturilloTimer(meta.roomId);
    stopPoolTurnTimer(meta.roomId);
    stopChapasTimer(meta.roomId);
    stopPokerBotTimer(meta.roomId);
    await stopCloudSession(meta.roomId);
    return;
  }

  if (room.creatorId) {
    room.hostId = room.creatorId;
  }

  const leaveMsg: RoomChatMessageRecord = {
    id: `leave-${Date.now()}`,
    senderId: 'system',
    senderName: 'RiffanTV',
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
  if (poolSeatDisconnected && room.poolGameState) {
    broadcastToRoom(meta.roomId, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
  }
  if (chapasSeatChanged && room.chapasState) {
    broadcastToRoom(meta.roomId, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
  }
  if (matchResponseChanged) {
    broadcastToRoom(meta.roomId, {
      type: 'GAME_INVITE_STATUS_UPDATED',
      payload: { matchResponses: room.matchResponses ?? null },
    });
  }
}
