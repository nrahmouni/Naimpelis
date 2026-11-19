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
import {
  createInitialChapasState,
  forfeitChapasMatch,
  joinChapasSeat,
  shootChapasCap,
  startChapasMatch,
  toggleChapasBots,
  updateChapasTeamFlag,
} from '../../../src/shared/futbolChapas.ts';
import {
  createInitialHeadSoccerOnlineState,
  joinHeadSoccerSeat,
  selectHeadSoccerSkin,
  startHeadSoccerMatch,
} from '../../../src/shared/headSoccer.ts';
import {
  getRoomCompanions,
  hasPendingMatchResponses,
  type RoomChatMessageRecord,
} from '../roomHubHelpers.ts';
import {
  wsPoolCallPocketSchema,
  wsPoolJoinSeatSchema,
  wsPoolPlaceCueSchema,
  wsPoolRoomSchema,
  wsPoolStartSchema,
  wsPoolSyncChecksumSchema,
  wsPoolTakeShotSchema,
  wsChapasJoinSeatSchema,
  wsChapasRoomSchema,
  wsChapasShootSchema,
  wsChapasToggleBotsSchema,
  wsChapasUpdateTeamSchema,
  wsHeadSoccerRoomSchema,
  wsHeadSoccerJoinSeatSchema,
  wsHeadSoccerSelectSkinSchema,
  wsHeadSoccerInputSchema,
  wsHeadSoccerSyncStateSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handleArcadeGameMessage: WsMessageHandler = (
  type,
  payload,
  ws,
  ctx
) => {
  const {
    rooms,
    headSoccerSeqByRoom,
    clients,
    schedulePersistRoom,
    broadcastToRoom,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    stopPoolTurnTimer,
    schedulePoolTurnTimer,
    stopChapasTimer,
    scheduleChapasTurnTimer,
  } = ctx;

  // Billar Bola 8 (Pro 8-Ball Pool · 1v1 Authoritative Turn & Deterministic Shot Sync)
  if (type === 'POOL_START') {
    const valid = wsPoolStartSchema.safeParse(payload);
    if (!valid.success) return true;
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room) return true;

    const isHostStarter = Boolean(
      senderMeta?.userId &&
        (room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId)
    );
    const hasCompanions = getRoomCompanions(room, senderMeta?.userId).length > 0;
    const waitForHost = isHostStarter && hasCompanions;

    const humans = waitForHost && senderMeta?.userId
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

  // Fútbol Chapas (1v1 / 2v2 Table Soccer + AI Bots)
  if (type === 'CHAPAS_START') {
    const valid = wsChapasRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room) return true;

    const starter = senderMeta?.userId
      ? [
          {
            id: senderMeta.userId,
            name: senderMeta.userName || 'Anfitrión',
            avatar: senderMeta.userAvatar || '⚽',
            color: senderMeta.userColor || '#38BDF8',
          },
        ]
      : room.participants
          .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
          .slice(0, 4)
          .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));

    stopChapasTimer(room.id);
    room.chapasState = createInitialChapasState(starter, { waitForHost: true });
    const sysMsg: RoomChatMessageRecord = {
      id: `chapas-start-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: '⚽',
      senderColor: '#22C55E',
      text: `Mesa de Fútbol Chapas abierta · Elige equipo y pulsa Play.`,
      timestamp: Date.now(),
      isSystem: true,
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages = room.messages.slice(-150);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState, message: sysMsg },
    });
    maybeBroadcastHostGameInvite(room, ws, senderMeta, 'chapas');
    return true;
  }

  if (type === 'CHAPAS_JOIN_SEAT') {
    const valid = wsChapasJoinSeatSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.chapasState || !senderMeta?.userId) return true;

    const res = joinChapasSeat(
      room.chapasState,
      {
        id: senderMeta.userId,
        name: senderMeta.userName || 'Jugador',
        avatar: senderMeta.userAvatar || '⚽',
        color: senderMeta.userColor || '#38BDF8',
      },
      valid.data.seatIndex
    );
    if (!res.ok) return true;
    room.chapasState = res.state;
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
    return true;
  }

  if (type === 'CHAPAS_UPDATE_TEAM') {
    const valid = wsChapasUpdateTeamSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.chapasState) return true;
    room.chapasState = updateChapasTeamFlag(room.chapasState, valid.data.team, valid.data.flag);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
    return true;
  }

  if (type === 'CHAPAS_TOGGLE_BOTS') {
    const valid = wsChapasToggleBotsSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.chapasState) return true;
    room.chapasState = toggleChapasBots(room.chapasState, valid.data.botsEnabled);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
    return true;
  }

  if (type === 'CHAPAS_START_MATCH') {
    const valid = wsChapasRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.chapasState || !senderMeta?.userId) return true;
    const isHostUser =
      room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
    if (!isHostUser) return true;

    const res = startChapasMatch(room.chapasState);
    if (!res.ok) {
      ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
      return true;
    }
    room.chapasState = res.state;
    clearMatchResponses(room, 'chapas');
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
    scheduleChapasTurnTimer(room);
    return true;
  }

  if (type === 'CHAPAS_SHOOT') {
    const valid = wsChapasShootSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.chapasState || !senderMeta?.userId) return true;

    const turnNum = room.chapasState.turnNumber;
    const shotInput =
      'shot' in valid.data
        ? valid.data.shot
        : { capId: valid.data.capId, angle: valid.data.angle, power: valid.data.power };
    const res = shootChapasCap(room.chapasState, senderMeta.userId, shotInput);
    if (!res.ok) return true;
    room.chapasState = res.state;
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_SHOT_BROADCAST',
      payload: {
        shot: {
          ...shotInput,
          shooterUserId: senderMeta.userId,
          turnNumber: turnNum,
        },
        preShotState: res.preShotState,
        authoritativeState: res.state,
      },
    });
    scheduleChapasTurnTimer(room);
    return true;
  }

  if (type === 'CHAPAS_FORFEIT') {
    const valid = wsChapasRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.chapasState || !senderMeta?.userId) return true;
    const forfeited = forfeitChapasMatch(room.chapasState, senderMeta.userId);
    if (!forfeited) return true;
    stopChapasTimer(room.id);
    room.chapasState = forfeited;
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
    return true;
  }

  if (type === 'CHAPAS_REMATCH') {
    const valid = wsChapasRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    const prev = room.chapasState;
    const humans = prev
      ? prev.players
          .filter((p): p is NonNullable<typeof p> => Boolean(p && !p.isBot))
          .map((p) => ({ id: p.userId, name: p.name, avatar: p.avatar, color: p.color }))
      : room.participants
          .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
          .slice(0, 4)
          .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));
    stopChapasTimer(room.id);
    room.chapasState = createInitialChapasState(humans, {
      waitForHost: false,
      botsEnabled: prev?.botsEnabled ?? true,
      teamFlags: prev?.teamFlags,
    });
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: room.chapasState },
    });
    scheduleChapasTurnTimer(room);
    return true;
  }

  if (type === 'CHAPAS_CLOSE') {
    const valid = wsChapasRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    stopChapasTimer(room.id);
    room.chapasState = null;
    clearMatchResponses(room, 'chapas');
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'CHAPAS_STATE_UPDATED',
      payload: { chapasState: null },
    });
    return true;
  }

  // Fútbol Cabezones (Head Soccer 1v1 Stadium + AI Bot)
  if (type === 'HEADSOCCER_START') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room) return true;
    const hostUser = senderMeta?.userId
      ? {
          id: senderMeta.userId,
          name: senderMeta.userName || 'Jugador 1',
          avatar: senderMeta.userAvatar || '⚽',
          color: senderMeta.userColor || '#9146FF',
        }
      : undefined;
    room.headSoccerState = createInitialHeadSoccerOnlineState(hostUser);
    headSoccerSeqByRoom.set(room.id, 0);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'HEADSOCCER_STATE_UPDATED',
      payload: { headSoccerState: room.headSoccerState },
    });
    maybeBroadcastHostGameInvite(room, ws, senderMeta, 'headsoccer');
    return true;
  }

  if (type === 'HEADSOCCER_JOIN_SEAT') {
    const valid = wsHeadSoccerJoinSeatSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.headSoccerState || !senderMeta?.userId) return true;
    const res = joinHeadSoccerSeat(
      room.headSoccerState,
      {
        id: senderMeta.userId,
        name: senderMeta.userName || 'Jugador',
        avatar: senderMeta.userAvatar || '⚽',
        color: senderMeta.userColor || '#9146FF',
      },
      valid.data.seatIndex
    );
    if (!res.ok) return true;
    room.headSoccerState = res.state;
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'HEADSOCCER_STATE_UPDATED',
      payload: { headSoccerState: room.headSoccerState },
    });
    return true;
  }

  if (type === 'HEADSOCCER_SELECT_SKIN') {
    const valid = wsHeadSoccerSelectSkinSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.headSoccerState || !senderMeta?.userId) return true;
    room.headSoccerState = selectHeadSoccerSkin(
      room.headSoccerState,
      senderMeta.userId,
      valid.data.skinId
    );
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'HEADSOCCER_STATE_UPDATED',
      payload: { headSoccerState: room.headSoccerState },
    });
    return true;
  }

  if (type === 'HEADSOCCER_START_MATCH') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.headSoccerState || !senderMeta?.userId) return true;
    const isAllowed =
      room.hostId === senderMeta.userId ||
      room.creatorId === senderMeta.userId ||
      room.headSoccerState.players[0]?.userId === senderMeta.userId;
    if (!isAllowed) return true;
    const res = startHeadSoccerMatch(room.headSoccerState);
    if (!res.ok) return true;
    room.headSoccerState = res.state;
    headSoccerSeqByRoom.set(room.id, 0);
    clearMatchResponses(room, 'headsoccer');
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'HEADSOCCER_STATE_UPDATED',
      payload: { headSoccerState: room.headSoccerState },
    });
    return true;
  }

  if (type === 'HEADSOCCER_INPUT') {
    const valid = wsHeadSoccerInputSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.headSoccerState || !senderMeta?.userId) return true;
    if (room.headSoccerState.players[valid.data.side]?.userId !== senderMeta.userId) return true;
    const nextSeq = (headSoccerSeqByRoom.get(room.id) || 0) + 1;
    headSoccerSeqByRoom.set(room.id, nextSeq);
    broadcastToRoom(
      room.id,
      {
        type: 'HEADSOCCER_INPUT_RELAY',
        payload: {
          side: valid.data.side,
          input: valid.data.input,
          seq: nextSeq,
        },
      },
      ws
    );
    return true;
  }

  if (type === 'HEADSOCCER_SYNC_STATE') {
    const valid = wsHeadSoccerSyncStateSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.headSoccerState || !senderMeta?.userId) return true;
    const isAuthority =
      room.headSoccerState.players[0]?.userId === senderMeta.userId ||
      room.hostId === senderMeta.userId ||
      room.creatorId === senderMeta.userId;
    if (!isAuthority) return true;

    const nextSeq = (headSoccerSeqByRoom.get(room.id) || 0) + 1;
    headSoccerSeqByRoom.set(room.id, nextSeq);
    const sim = valid.data.sim;
    const didFinish = sim.phase === 'finished';
    room.headSoccerState = {
      ...room.headSoccerState,
      scores: sim.scores,
      timeLeftSec: sim.timeLeftSec,
      isGoldenGoal: sim.isGoldenGoal,
      winnerSeat: sim.winnerSide,
      status: didFinish ? 'finished' : 'playing',
      updatedAt: Date.now(),
    };
    broadcastToRoom(
      room.id,
      {
        type: 'HEADSOCCER_SYNC_BROADCAST',
        payload: { seq: nextSeq, sim },
      },
      ws
    );
    if (didFinish) {
      schedulePersistRoom(room.id);
      broadcastToRoom(room.id, {
        type: 'HEADSOCCER_STATE_UPDATED',
        payload: { headSoccerState: room.headSoccerState },
      });
    }
    return true;
  }

  if (type === 'HEADSOCCER_REMATCH') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.headSoccerState) return true;
    const res = startHeadSoccerMatch(room.headSoccerState);
    if (!res.ok) return true;
    room.headSoccerState = res.state;
    headSoccerSeqByRoom.set(room.id, 0);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'HEADSOCCER_STATE_UPDATED',
      payload: { headSoccerState: room.headSoccerState },
    });
    return true;
  }

  if (type === 'HEADSOCCER_CLOSE') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    room.headSoccerState = null;
    clearMatchResponses(room, 'headsoccer');
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'HEADSOCCER_STATE_UPDATED',
      payload: { headSoccerState: null },
    });
    return true;
  }

  return false;
};
