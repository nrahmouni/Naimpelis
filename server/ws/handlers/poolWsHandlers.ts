import {
  POOL_HEAD_STRING_X,
  POOL_FOOT_SPOT_Y,
  applyPoolShot,
  callPoolPocket,
  computePoolChecksum,
  createInitialPoolState,
  forfeitPoolMatch,
  isValidCueBallPlacement,
  joinPoolSeat,
  placePoolCueBall,
  startPoolMatch,
} from '../../../src/shared/pool8Ball.ts';
import { getRoomCompanions, hasPendingMatchResponses } from '../roomHubHelpers.ts';
import {
  wsPoolCallPocketSchema,
  wsPoolJoinSeatSchema,
  wsPoolPlaceCueSchema,
  wsPoolRoomSchema,
  wsPoolStartSchema,
  wsPoolSyncChecksumSchema,
  wsPoolTakeShotSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handlePoolWsMessage: WsMessageHandler = (type, payload, ws, ctx) => {
  const {
    rooms,
    clients,
    schedulePersistRoom,
    broadcastToRoom,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    stopPoolTurnTimer,
    schedulePoolTurnTimer,
  } = ctx;

  if (type === 'POOL_START') {
    const valid = wsPoolStartSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room) return true;

    const isHostStarter = Boolean(
      senderMeta?.userId &&
        (room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId)
    );
    const hasCompanions = getRoomCompanions(room, senderMeta?.userId).length > 0;
    const waitForHost = isHostStarter && hasCompanions;

    const humans =
      waitForHost && senderMeta?.userId
        ? [
            {
              id: senderMeta.userId,
              name: senderMeta.userName || 'Anfitrión',
              avatar: senderMeta.userAvatar || '🎱',
              color: senderMeta.userColor || '#9146FF',
            },
          ]
        : room.participants
            .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
            .slice(0, 2)
            .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));

    stopPoolTurnTimer(room.id);
    room.poolGameState = createInitialPoolState(humans, {
      difficulty: valid.data.difficulty || 'medium',
      waitForHost,
    });
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    maybeBroadcastHostGameInvite(room, ws, senderMeta, 'pool');
    schedulePoolTurnTimer(room);
    return true;
  }

  if (type === 'POOL_START_MATCH') {
    const valid = wsPoolRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.poolGameState || !senderMeta?.userId) return true;
    const isHostUser =
      room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
    if (!isHostUser) return true;

    room.poolGameState = startPoolMatch(room.poolGameState);
    clearMatchResponses(room, 'pool');
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    schedulePoolTurnTimer(room);
    return true;
  }

  if (type === 'POOL_JOIN_SEAT') {
    const valid = wsPoolJoinSeatSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.poolGameState || !senderMeta?.userId) return true;

    const res = joinPoolSeat(
      room.poolGameState,
      {
        id: senderMeta.userId,
        name: senderMeta.userName || 'Jugador',
        avatar: senderMeta.userAvatar || '🎱',
        color: senderMeta.userColor || '#9146FF',
      },
      valid.data.seatIndex,
      Date.now(),
      { keepWaiting: hasPendingMatchResponses(room, 'pool') }
    );
    if (!res.ok) return true;
    room.poolGameState = res.state;
    if (room.poolGameState.status === 'playing') {
      clearMatchResponses(room, 'pool');
    }
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    schedulePoolTurnTimer(room);
    return true;
  }

  if (type === 'POOL_CALL_POCKET') {
    const valid = wsPoolCallPocketSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.poolGameState || !senderMeta?.userId) return true;

    const res = callPoolPocket(room.poolGameState, senderMeta.userId, valid.data.pocketId);
    if (!res.ok) return true;
    room.poolGameState = res.state;
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    return true;
  }

  if (type === 'POOL_PLACE_CUE') {
    const valid = wsPoolPlaceCueSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.poolGameState || !senderMeta?.userId) return true;

    const res = placePoolCueBall(
      room.poolGameState,
      senderMeta.userId,
      valid.data.x,
      valid.data.y
    );
    if (!res.ok) return true;
    room.poolGameState = res.state;
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    return true;
  }

  if (type === 'POOL_TAKE_SHOT') {
    const valid = wsPoolTakeShotSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.poolGameState || !senderMeta?.userId) return true;

    const preShotState = room.poolGameState;
    const activeSeat = preShotState.players[preShotState.turnSeat];
    if (!activeSeat || activeSeat.userId !== senderMeta.userId) return true;

    const shot = valid.data.shot;
    const preCue = preShotState.balls.find((b) => b.id === 0);
    let cueStartX = preCue?.x ?? POOL_HEAD_STRING_X;
    let cueStartY = preCue?.y ?? POOL_FOOT_SPOT_Y;
    if (
      typeof shot.cueX === 'number' &&
      typeof shot.cueY === 'number' &&
      (preShotState.phase === 'BALL_IN_HAND' || preShotState.isBreakShot)
    ) {
      const behindHead = preShotState.isBreakShot && preShotState.breakOnlyBehindHeadString;
      if (isValidCueBallPlacement(preShotState.balls, shot.cueX, shot.cueY, behindHead)) {
        cueStartX = shot.cueX;
        cueStartY = shot.cueY;
      }
    }

    const preShotBalls = preShotState.balls.map((b) =>
      b.id === 0
        ? { ...b, x: cueStartX, y: cueStartY, vx: 0, vy: 0, pocketed: false, pocketId: null }
        : { ...b }
    );

    const res = applyPoolShot(preShotState, senderMeta.userId, shot);
    if (!res.ok) return true;

    room.poolGameState = res.state;
    schedulePersistRoom(room.id);

    broadcastToRoom(room.id, {
      type: 'POOL_SHOT_BROADCAST',
      payload: {
        shot: {
          ...shot,
          shooterUserId: senderMeta.userId,
          turnNumber: preShotState.turnNumber,
          cueStartX,
          cueStartY,
        },
        preShotBalls,
        authoritativeState: res.state,
        checksum: res.state.checksum,
      },
    });
    schedulePoolTurnTimer(room);
    return true;
  }

  if (type === 'POOL_SYNC_CHECKSUM') {
    const valid = wsPoolSyncChecksumSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.poolGameState) return true;
    if (
      valid.data.turnNumber !== room.poolGameState.turnNumber ||
      valid.data.checksum !== computePoolChecksum(room.poolGameState)
    ) {
      ws.send(
        JSON.stringify({
          type: 'POOL_STATE_UPDATED',
          payload: { poolGameState: room.poolGameState },
        })
      );
    }
    return true;
  }

  if (type === 'POOL_FORFEIT') {
    const valid = wsPoolRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.poolGameState || !senderMeta?.userId) return true;

    const forfeited = forfeitPoolMatch(room.poolGameState, senderMeta.userId, 'forfeit');
    if (!forfeited) return true;
    stopPoolTurnTimer(room.id);
    room.poolGameState = forfeited;
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    return true;
  }

  if (type === 'POOL_REMATCH') {
    const valid = wsPoolRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;

    const prev = room.poolGameState;
    let orderedHumans = room.participants
      .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
      .slice(0, 2)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));

    if (prev?.players[0] && prev?.players[1]) {
      orderedHumans = [
        {
          id: prev.players[1].userId,
          name: prev.players[1].name,
          avatar: prev.players[1].avatar,
          color: prev.players[1].color,
        },
        {
          id: prev.players[0].userId,
          name: prev.players[0].name,
          avatar: prev.players[0].avatar,
          color: prev.players[0].color,
        },
      ];
    }

    stopPoolTurnTimer(room.id);
    room.poolGameState = createInitialPoolState(orderedHumans, {
      difficulty: prev?.difficulty || 'medium',
    });
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: room.poolGameState },
    });
    schedulePoolTurnTimer(room);
    return true;
  }

  if (type === 'POOL_CLOSE') {
    const valid = wsPoolRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    stopPoolTurnTimer(room.id);
    room.poolGameState = null;
    clearMatchResponses(room, 'pool');
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'POOL_STATE_UPDATED',
      payload: { poolGameState: null },
    });
    return true;
  }

  return false;
};
