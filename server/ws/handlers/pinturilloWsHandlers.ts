import {
  addPinturilloStroke,
  clearPinturilloCanvas,
  createInitialPinturilloState,
  selectPinturilloWord,
  startPinturilloMatch,
  submitPinturilloGuess,
  undoPinturilloStroke,
} from '../../../src/shared/pinturillo.ts';
import { getRoomCompanions, type RoomChatMessageRecord } from '../roomHubHelpers.ts';
import {
  wsPinturilloGuessSchema,
  wsPinturilloPickWordSchema,
  wsPinturilloRoomSchema,
  wsPinturilloStrokeSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handlePinturilloWsMessage: WsMessageHandler = (type, payload, ws, ctx) => {
  const {
    rooms,
    clients,
    broadcastToRoom,
    broadcastPinturilloState,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    stopPinturilloTimer,
    schedulePinturilloLifecycle,
  } = ctx;

  if (type === 'PINTURILLO_START') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
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
              avatar: senderMeta.userAvatar || '🎨',
              color: senderMeta.userColor || '#9146FF',
            },
          ]
        : room.participants
            .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
            .slice(0, 6)
            .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));

    stopPinturilloTimer(room.id);
    room.pinturilloState = createInitialPinturilloState(humans, undefined, { waitForHost });
    const sysMsg: RoomChatMessageRecord = {
      id: `pinturillo-start-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: '🎨',
      senderColor: '#F59E0B',
      text: waitForHost
        ? `Mesa de Pinturillo abierta · Esperando respuesta de invitados.`
        : `Mesa de Pinturillo abierta · ¡Dibuja y adivina la palabra!`,
      timestamp: Date.now(),
      isSystem: true,
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages = room.messages.slice(-150);
    broadcastPinturilloState(room, sysMsg);
    maybeBroadcastHostGameInvite(room, ws, senderMeta, 'pinturillo');
    schedulePinturilloLifecycle(room);
    return true;
  }

  if (type === 'PINTURILLO_START_MATCH') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pinturilloState || !senderMeta?.userId) return true;
    const isHostUser =
      room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
    if (!isHostUser) return true;
    room.pinturilloState = startPinturilloMatch(room.pinturilloState);
    clearMatchResponses(room, 'pinturillo');
    broadcastPinturilloState(room);
    schedulePinturilloLifecycle(room);
    return true;
  }

  if (type === 'PINTURILLO_PICK_WORD') {
    const valid = wsPinturilloPickWordSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pinturilloState || !senderMeta?.userId) return true;

    const res = selectPinturilloWord(room.pinturilloState, senderMeta.userId, valid.data.wordId);
    if (!res.ok) return true;
    room.pinturilloState = res.state;
    broadcastPinturilloState(room);
    schedulePinturilloLifecycle(room);
    return true;
  }

  if (type === 'PINTURILLO_STROKE') {
    const valid = wsPinturilloStrokeSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pinturilloState || !senderMeta?.userId) return true;

    const res = addPinturilloStroke(room.pinturilloState, senderMeta.userId, valid.data.stroke);
    if (!res.ok) return true;
    room.pinturilloState = res.state;
    broadcastToRoom(
      room.id,
      {
        type: 'PINTURILLO_STROKE_ADDED',
        payload: { stroke: res.state.strokes[res.state.strokes.length - 1] },
      },
      ws
    );
    return true;
  }

  if (type === 'PINTURILLO_UNDO') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pinturilloState || !senderMeta?.userId) return true;
    const res = undoPinturilloStroke(room.pinturilloState, senderMeta.userId);
    if (!res.ok) return true;
    room.pinturilloState = res.state;
    broadcastPinturilloState(room);
    return true;
  }

  if (type === 'PINTURILLO_CLEAR') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pinturilloState || !senderMeta?.userId) return true;
    const res = clearPinturilloCanvas(room.pinturilloState, senderMeta.userId);
    if (!res.ok) return true;
    room.pinturilloState = res.state;
    broadcastPinturilloState(room);
    return true;
  }

  if (type === 'PINTURILLO_GUESS') {
    const valid = wsPinturilloGuessSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pinturilloState || !senderMeta?.userId) return true;

    const res = submitPinturilloGuess(room.pinturilloState, senderMeta.userId, valid.data.text);
    if (!res.ok) return true;
    room.pinturilloState = res.state;
    broadcastPinturilloState(room);
    if (res.roundCompleted) {
      schedulePinturilloLifecycle(room);
    }
    return true;
  }

  if (type === 'PINTURILLO_REMATCH') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    const humans = room.participants
      .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));
    room.pinturilloState = createInitialPinturilloState(humans);
    broadcastPinturilloState(room);
    schedulePinturilloLifecycle(room);
    return true;
  }

  if (type === 'PINTURILLO_CLOSE') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    stopPinturilloTimer(room.id);
    room.pinturilloState = null;
    clearMatchResponses(room, 'pinturillo');
    broadcastPinturilloState(room);
    return true;
  }

  return false;
};
