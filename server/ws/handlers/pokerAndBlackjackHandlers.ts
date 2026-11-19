import {
  applyPokerAction,
  createInitialPokerState,
  joinPokerSeat,
  startNextPokerHand,
  type PokerSeat,
} from '../../../src/shared/texasHoldem.ts';
import {
  applyBlackjackAction,
  createInitialBlackjackState,
  dealBlackjackRound,
  joinBlackjackSeat,
  placeBlackjackBet,
  prepareNewBlackjackBettingRound,
} from '../../../src/shared/blackjack.ts';
import {
  wsBlackjackActionSchema,
  wsBlackjackBetSchema,
  wsBlackjackJoinSeatSchema,
  wsHeadSoccerRoomSchema,
  wsPokerActionSchema,
  wsPokerJoinSeatSchema,
  wsPokerStartSchema,
  wsPokerToggleBotsSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handlePokerAndBlackjackMessage: WsMessageHandler = (
  type,
  payload,
  ws,
  ctx
) => {
  const {
    rooms,
    clients,
    schedulePersistRoom,
    broadcastPokerState,
    broadcastBlackjackState,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    stopPokerBotTimer,
    schedulePokerBotTimer,
  } = ctx;

  // Texas Hold'em Poker (No-Limit Multiplayer + Bots)
  if (type === 'POKER_START') {
    const valid = wsPokerStartSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room) return true;
    stopPokerBotTimer(room.id);
    const starter = senderMeta?.userId
      ? [
          {
            id: senderMeta.userId,
            name: senderMeta.userName || 'Jugador',
            avatar: senderMeta.userAvatar || '🃏',
            color: senderMeta.userColor || '#9146FF',
          },
        ]
      : [];
    room.pokerGameState = createInitialPokerState(starter, {
      fillWithBots: valid.data.botsEnabled ?? true,
      autoStart: false,
    });
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    maybeBroadcastHostGameInvite(room, ws, senderMeta, 'poker');
    return true;
  }

  if (type === 'POKER_JOIN_SEAT') {
    const valid = wsPokerJoinSeatSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pokerGameState || !senderMeta?.userId) return true;
    const res = joinPokerSeat(
      room.pokerGameState,
      {
        id: senderMeta.userId,
        name: senderMeta.userName || 'Jugador',
        avatar: senderMeta.userAvatar || '🃏',
        color: senderMeta.userColor || '#9146FF',
      },
      valid.data.seatIndex
    );
    if (!res.ok) return true;
    room.pokerGameState = res.state;
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    return true;
  }

  if (type === 'POKER_TOGGLE_BOTS') {
    const valid = wsPokerToggleBotsSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pokerGameState || !senderMeta?.userId) return true;
    if (room.pokerGameState.status === 'playing') return true;
    const isAllowed =
      room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
    if (!isAllowed) return true;

    const humans = room.pokerGameState.seats
      .filter((s): s is PokerSeat => Boolean(s && !s.isBot))
      .map((s) => ({ id: s.userId, name: s.name, avatar: s.avatar, color: s.color }));
    room.pokerGameState = createInitialPokerState(humans, {
      fillWithBots: valid.data.botsEnabled,
      autoStart: false,
    });
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    return true;
  }

  if (type === 'POKER_START_MATCH') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.pokerGameState) return true;
    const res = startNextPokerHand(room.pokerGameState);
    if (!res.ok) {
      ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
      return true;
    }
    room.pokerGameState = res.state;
    clearMatchResponses(room, 'poker');
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    schedulePokerBotTimer(room);
    return true;
  }

  if (type === 'POKER_ACTION') {
    const valid = wsPokerActionSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pokerGameState || !senderMeta?.userId) return true;
    const res = applyPokerAction(
      room.pokerGameState,
      senderMeta.userId,
      valid.data.action,
      valid.data.raiseTo
    );
    if (!res.ok) {
      ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
      return true;
    }
    room.pokerGameState = res.state;
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    schedulePokerBotTimer(room);
    return true;
  }

  if (type === 'POKER_REBUY') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.pokerGameState || !senderMeta?.userId) return true;
    if (room.pokerGameState.status === 'playing') return true;
    const nextSeats = room.pokerGameState.seats.map((s) =>
      s && s.userId === senderMeta.userId && s.chips < 100
        ? { ...s, chips: 1000 }
        : s
    );
    room.pokerGameState = {
      ...room.pokerGameState,
      seats: nextSeats,
      updatedAt: Date.now(),
    };
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    return true;
  }

  if (type === 'POKER_CLOSE') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    stopPokerBotTimer(room.id);
    room.pokerGameState = null;
    clearMatchResponses(room, 'poker');
    schedulePersistRoom(room.id);
    broadcastPokerState(room);
    return true;
  }

  // Blackjack 21 (Casino vs Dealer + Multi-Seat)
  if (type === 'BLACKJACK_START') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room) return true;
    const hostUser = senderMeta?.userId
      ? {
          id: senderMeta.userId,
          name: senderMeta.userName || 'Jugador',
          avatar: senderMeta.userAvatar || '🎰',
          color: senderMeta.userColor || '#10B981',
        }
      : undefined;
    room.blackjackState = createInitialBlackjackState(hostUser);
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    maybeBroadcastHostGameInvite(room, ws, senderMeta, 'blackjack');
    return true;
  }

  if (type === 'BLACKJACK_JOIN_SEAT') {
    const valid = wsBlackjackJoinSeatSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.blackjackState || !senderMeta?.userId) return true;
    const res = joinBlackjackSeat(
      room.blackjackState,
      {
        id: senderMeta.userId,
        name: senderMeta.userName || 'Jugador',
        avatar: senderMeta.userAvatar || '🎰',
        color: senderMeta.userColor || '#10B981',
      },
      valid.data.seatIndex
    );
    if (!res.ok) return true;
    room.blackjackState = res.state;
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    return true;
  }

  if (type === 'BLACKJACK_BET') {
    const valid = wsBlackjackBetSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.blackjackState || !senderMeta?.userId) return true;
    const res = placeBlackjackBet(room.blackjackState, senderMeta.userId, valid.data.op);
    if (!res.ok) return true;
    room.blackjackState = res.state;
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    return true;
  }

  if (type === 'BLACKJACK_DEAL') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.blackjackState) return true;
    const res = dealBlackjackRound(room.blackjackState);
    if (!res.ok) {
      ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
      return true;
    }
    room.blackjackState = res.state;
    clearMatchResponses(room, 'blackjack');
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    return true;
  }

  if (type === 'BLACKJACK_ACTION') {
    const valid = wsBlackjackActionSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !room.blackjackState || !senderMeta?.userId) return true;
    const res = applyBlackjackAction(
      room.blackjackState,
      senderMeta.userId,
      valid.data.action
    );
    if (!res.ok) {
      ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
      return true;
    }
    room.blackjackState = res.state;
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    return true;
  }

  if (type === 'BLACKJACK_NEW_ROUND') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room || !room.blackjackState) return true;
    room.blackjackState = prepareNewBlackjackBettingRound(room.blackjackState);
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    return true;
  }

  if (type === 'BLACKJACK_CLOSE') {
    const valid = wsHeadSoccerRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    if (!room) return true;
    room.blackjackState = null;
    clearMatchResponses(room, 'blackjack');
    schedulePersistRoom(room.id);
    broadcastBlackjackState(room);
    return true;
  }

  return false;
};
