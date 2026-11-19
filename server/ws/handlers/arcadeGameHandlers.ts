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
import type { RoomChatMessageRecord } from '../roomHubHelpers.ts';
import {
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
import { handlePoolWsMessage } from './poolWsHandlers.ts';

export const handleArcadeGameMessage: WsMessageHandler = (
  type,
  payload,
  ws,
  ctx
) => {
  if (handlePoolWsMessage(type, payload, ws, ctx)) return true;

  const {
    rooms,
    headSoccerSeqByRoom,
    clients,
    schedulePersistRoom,
    broadcastToRoom,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    stopChapasTimer,
    scheduleChapasTurnTimer,
  } = ctx;


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
