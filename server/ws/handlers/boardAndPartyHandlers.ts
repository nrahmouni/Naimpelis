import {
  applyBoardMove,
  createInitialBoardGameState,
  joinGameSeat,
  resetBoardGame,
  resignBoardGame,
  startBoardMatch,
  type BoardClockMinutes,
  type BoardCoord,
  type BoardGameType,
  type ChessPromotionPiece,
} from '../../../src/shared/boardGames.ts';
import {
  callUnoAction,
  catchUnoFailureAction,
  claimPartyBotSeat,
  createInitialParchisState,
  createInitialUnoState,
  drawUnoCardsAndAdvance,
  moveParchisPiece,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
  startPartyMatch,
  type PartyGameType,
} from '../../../src/shared/partyGames.ts';
import {
  addPinturilloStroke,
  clearPinturilloCanvas,
  createInitialPinturilloState,
  selectPinturilloWord,
  startPinturilloMatch,
  submitPinturilloGuess,
  undoPinturilloStroke,
} from '../../../src/shared/pinturillo.ts';
import {
  getRoomCompanions,
  type RoomChatMessageRecord,
} from '../roomHubHelpers.ts';
import {
  wsGameMoveSchema,
  wsPartyGameActionSchema,
  wsPartyGameStartSchema,
  wsPinturilloGuessSchema,
  wsPinturilloPickWordSchema,
  wsPinturilloRoomSchema,
  wsPinturilloStrokeSchema,
} from '../wsSchemas.ts';
import type { WsMessageHandler } from './types.ts';

export const handleBoardAndPartyMessage: WsMessageHandler = (
  type,
  payload,
  ws,
  ctx
) => {
  const {
    rooms,
    clients,
    schedulePersistRoom,
    broadcastToRoom,
    broadcastPinturilloState,
    clearMatchResponses,
    maybeBroadcastHostGameInvite,
    stopPinturilloTimer,
    schedulePinturilloLifecycle,
    stopBoardTurnTimer,
    scheduleBoardTurnTimer,
    stopPartyBotTimer,
    schedulePartyBotTurnIfNeeded,
  } = ctx;

  // Classic Board Games: Checkers, Chess, Connect 4 + Optional Clock (0 | 3 | 5 | 10 min)
  if (type === 'GAME_START') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room) return true;

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
      senderName: 'RiffanTV',
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
    maybeBroadcastHostGameInvite(room, ws, senderMeta, gameType, soloLocal);
    scheduleBoardTurnTimer(room);
    return true;
  }

  if (type === 'GAME_START_MATCH') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.gameState || !senderMeta?.userId) return true;

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
      return true;
    }

    room.gameState = startBoardMatch(room.gameState);
    clearMatchResponses(room, room.gameState.gameType);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'GAME_STATE_UPDATED',
      payload: { gameState: room.gameState },
    });
    scheduleBoardTurnTimer(room);
    return true;
  }

  if (type === 'GAME_JOIN_SEAT') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.gameState || !senderMeta?.userId) return true;

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
      return true;
    }

    room.gameState = joinGameSeat(room.gameState, actor, side);
    broadcastToRoom(room.id, {
      type: 'GAME_STATE_UPDATED',
      payload: { gameState: room.gameState },
    });
    scheduleBoardTurnTimer(room);
    return true;
  }

  if (type === 'GAME_MOVE') {
    const valid = wsGameMoveSchema.safeParse(payload);
    if (!valid.success) return true;
    const senderMeta = clients.get(ws);
    const targetRoomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.gameState || !senderMeta?.userId) return true;

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
      return true;
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
        senderName: 'RiffanTV',
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
    return true;
  }

  if (type === 'GAME_RESIGN') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.gameState || !senderMeta?.userId) return true;

    const next = resignBoardGame(room.gameState, senderMeta.userId);
    if (!next) return true;
    room.gameState = next;
    const winnerName =
      next.winner && next.winner !== 'draw'
        ? next.players[next.winner]?.name || (next.winner === 'w' ? 'Blancas' : 'Negras')
        : 'Rival';
    const sysMsg: RoomChatMessageRecord = {
      id: `game-resign-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
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
    return true;
  }

  if (type === 'GAME_RESET') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.gameState) return true;

    const prevType = room.gameState.gameType;
    const nextType: BoardGameType | undefined =
      payload?.gameType === 'chess' ||
      payload?.gameType === 'checkers' ||
      payload?.gameType === 'connect4'
        ? payload.gameType
        : undefined;
    const switchedGame = Boolean(nextType && nextType !== prevType);
    const isHostUser = Boolean(
      senderMeta?.userId &&
        (room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId)
    );
    const companions = getRoomCompanions(room, senderMeta?.userId);
    const waitForHost =
      switchedGame && isHostUser && !room.gameState.soloLocal && companions.length > 0;

    const clockRaw = Number(payload?.clockMinutes ?? room.gameState.clockMinutes ?? 0);
    const clockMinutes: BoardClockMinutes =
      clockRaw === 3 || clockRaw === 5 || clockRaw === 10 ? clockRaw : 0;

    room.gameState = resetBoardGame(room.gameState, {
      gameType: nextType,
      swapColors: Boolean(payload?.swapColors),
      clockMinutes,
      waitForHost,
    });
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'GAME_STATE_UPDATED',
      payload: { gameState: room.gameState },
    });
    if (switchedGame && isHostUser) {
      maybeBroadcastHostGameInvite(
        room,
        ws,
        senderMeta,
        room.gameState.gameType,
        room.gameState.soloLocal
      );
    }
    if (room.gameState.status === 'playing') {
      scheduleBoardTurnTimer(room);
    } else {
      stopBoardTurnTimer(room.id);
    }
    return true;
  }

  if (type === 'GAME_CLOSE') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.gameState) return true;
    const closedType = room.gameState.gameType;
    stopBoardTurnTimer(room.id);
    room.gameState = null;
    clearMatchResponses(room, closedType);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'GAME_STATE_UPDATED',
      payload: { gameState: null },
    });
    return true;
  }

  // 4-Player Party Games (Parchís Español & UNO Oficial with waiting lobby + 15s turn timer)
  if (type === 'PARTY_GAME_START') {
    const valid = wsPartyGameStartSchema.safeParse(payload);
    if (!valid.success) return true;
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
    if (!room) return true;

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
      senderName: 'RiffanTV',
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
    maybeBroadcastHostGameInvite(room, ws, clients.get(ws), gameType);
    return true;
  }

  if (type === 'PARTY_GAME_ACTION') {
    const valid = wsPartyGameActionSchema.safeParse(payload);
    if (!valid.success) return true;
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
    const senderMeta = clients.get(ws);
    if (!room || !room.partyGameState || !senderMeta?.userId) return true;

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
        return true;
      }
      room.partyGameState = startPartyMatch(room.partyGameState);
      clearMatchResponses(room, room.partyGameState.gameType);
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
        return true;
      }
      room.partyGameState = res.state;
    } else if (room.partyGameState.gameType === 'parchis') {
      if (action === 'roll_dice') {
        const res = rollParchisDice(room.partyGameState, senderMeta.userId);
        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
          return true;
        }
        room.partyGameState = res.state;
      } else if (action === 'move_piece' && typeof pieceId === 'number') {
        const res = moveParchisPiece(room.partyGameState, senderMeta.userId, pieceId);
        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
          return true;
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
          return true;
        }
        room.partyGameState = res.state;
      } else if (action === 'draw_card' || action === 'pass_turn') {
        const res = drawUnoCardsAndAdvance(room.partyGameState, senderMeta.userId);
        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
          return true;
        }
        room.partyGameState = res.state;
      } else if (action === 'call_uno') {
        const res = callUnoAction(room.partyGameState, senderMeta.userId);
        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
          return true;
        }
        room.partyGameState = res.state;
      } else if (action === 'catch_uno') {
        const res = catchUnoFailureAction(room.partyGameState, senderMeta.userId);
        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'GAME_MOVE_REJECTED', payload: { error: res.error } }));
          return true;
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
          return true;
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
    return true;
  }

  if (type === 'PARTY_GAME_CLOSE') {
    const senderMeta = clients.get(ws);
    const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
      .trim()
      .toLowerCase();
    const room = rooms.get(targetRoomId);
    if (!room || !room.partyGameState) return true;
    const closedType = room.partyGameState.gameType;
    stopPartyBotTimer(room.id);
    room.partyGameState = null;
    clearMatchResponses(room, closedType);
    schedulePersistRoom(room.id);
    broadcastToRoom(room.id, {
      type: 'PARTY_GAME_STATE_UPDATED',
      payload: { partyGameState: null },
    });
    return true;
  }

  // Pinturillo (Draw & Guess · 2–6 Players + AI Bots)
  if (type === 'PINTURILLO_START') {
    const valid = wsPinturilloRoomSchema.safeParse(payload);
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
            avatar: senderMeta.userAvatar || '🎨',
            color: senderMeta.userColor || '#9146FF',
          },
        ]
      : room.participants
          .filter((p) => !p.name.includes('(TV)') && p.avatar !== '📺')
          .slice(0, 6)
          .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color }));

    stopPinturilloTimer(room.id);
    room.pinturilloState = createInitialPinturilloState(humans, undefined, {
      waitForHost,
    });
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
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
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
    const roomId = valid.data.roomId.toLowerCase();
    const room = rooms.get(roomId);
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
