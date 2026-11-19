import {
  applyBoardMove,
  chooseAutoBoardMove,
} from '../../src/shared/boardGames.ts';
import {
  chooseBotParchisAction,
  chooseBotUnoMove,
  drawUnoCardsAndAdvance,
  moveParchisPiece,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
} from '../../src/shared/partyGames.ts';
import {
  addPinturilloStroke,
  advancePinturilloRound,
  buildBotSketchStrokes,
  endPinturilloRound,
  pickBotPinturilloGuess,
  revealPinturilloHintIfDue,
  selectPinturilloWord,
  submitPinturilloGuess,
} from '../../src/shared/pinturillo.ts';
import { forfeitPoolMatch } from '../../src/shared/pool8Ball.ts';
import {
  chooseChapasAiShot,
  shootChapasCap,
} from '../../src/shared/futbolChapas.ts';
import {
  applyPokerAction,
  choosePokerBotAction,
} from '../../src/shared/texasHoldem.ts';
import type { RoomChatMessageRecord, RoomRecord } from './roomHubHelpers.ts';

export interface GameTimerDeps {
  rooms: Map<string, RoomRecord>;
  pokerBotTimers: Map<string, ReturnType<typeof setTimeout>>;
  pinturilloTimers: Map<string, ReturnType<typeof setTimeout>>;
  poolTurnTimers: Map<string, ReturnType<typeof setTimeout>>;
  poolDisconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  chapasTurnTimers: Map<string, ReturnType<typeof setTimeout>>;
  boardTurnTimers: Map<string, ReturnType<typeof setTimeout>>;
  partyBotTimers: Map<string, ReturnType<typeof setTimeout>>;
  schedulePersistRoom: (roomId?: string) => void;
  broadcastToRoom: (roomId: string, message: unknown) => void;
  broadcastPokerState: (room: RoomRecord, message?: RoomChatMessageRecord | null) => void;
  broadcastPinturilloState: (room: RoomRecord, message?: RoomChatMessageRecord | null) => void;
}

export function createRoomGameTimers(deps: GameTimerDeps) {
  const {
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
  } = deps;

  function stopPokerBotTimer(roomId: string) {
    const t = pokerBotTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      pokerBotTimers.delete(roomId);
    }
  }

  function schedulePokerBotTimer(room: RoomRecord) {
    stopPokerBotTimer(room.id);
    const ps = room.pokerGameState;
    if (!ps || ps.status !== 'playing') return;
    const activeSeat = ps.seats[ps.turnSeat];
    if (!activeSeat || !activeSeat.isBot) return;

    const expectedUpdatedAt = ps.updatedAt;
    const expectedSeat = ps.turnSeat;

    const timer = setTimeout(() => {
      pokerBotTimers.delete(room.id);
      const latestRoom = rooms.get(room.id);
      const curr = latestRoom?.pokerGameState;
      if (
        !latestRoom ||
        !curr ||
        curr.status !== 'playing' ||
        curr.turnSeat !== expectedSeat ||
        curr.updatedAt !== expectedUpdatedAt
      ) {
        return;
      }
      if (latestRoom.participants.length === 0) return;
      const actor = curr.seats[curr.turnSeat];
      if (!actor || !actor.isBot) return;

      const move = choosePokerBotAction(curr);
      const res = applyPokerAction(curr, actor.userId, move.action, move.raiseTo);
      if (!res.ok) return;
      latestRoom.pokerGameState = res.state;
      schedulePersistRoom(latestRoom.id);
      broadcastPokerState(latestRoom);
      schedulePokerBotTimer(latestRoom);
    }, 900);
    timer.unref?.();
    pokerBotTimers.set(room.id, timer);
  }

  function stopPinturilloTimer(roomId: string) {
    const t = pinturilloTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      pinturilloTimers.delete(roomId);
    }
  }

  function schedulePinturilloLifecycle(room: RoomRecord) {
    stopPinturilloTimer(room.id);
    const ps = room.pinturilloState;
    if (!ps || ps.status === 'finished' || ps.status === 'waiting') return;

    const drawer = ps.players[ps.drawerSeat];
    const now = Date.now();
    let delayMs = 950;
    if (ps.status === 'choosing') {
      delayMs = drawer?.isBot ? 1100 : Math.max(250, ps.phaseDeadlineAt - now);
    } else if (ps.status === 'round_end') {
      delayMs = Math.max(250, ps.phaseDeadlineAt - now);
    } else if (ps.status === 'drawing') {
      delayMs = drawer?.isBot ? 850 : 1200;
    }

    const t = setTimeout(() => {
      pinturilloTimers.delete(room.id);
      const latestRoom = rooms.get(room.id);
      const curr = latestRoom?.pinturilloState;
      if (!latestRoom || !curr || curr.status === 'finished') return;
      if (latestRoom.participants.length === 0) return;

      const tickNow = Date.now();
      let changed = false;

      if (curr.status === 'choosing') {
        const curDrawer = curr.players[curr.drawerSeat];
        if ((curDrawer?.isBot || tickNow >= curr.phaseDeadlineAt) && curr.wordChoices.length > 0) {
          const picked = curr.wordChoices[Math.floor(Math.random() * curr.wordChoices.length)];
          const res = selectPinturilloWord(curr, curDrawer?.userId || '', picked.id);
          if (res.ok) {
            latestRoom.pinturilloState = res.state;
            changed = true;
          }
        }
      } else if (curr.status === 'round_end') {
        if (tickNow >= curr.phaseDeadlineAt) {
          latestRoom.pinturilloState = advancePinturilloRound(curr);
          changed = true;
        }
      } else if (curr.status === 'drawing') {
        let nextState = curr;
        if (tickNow >= nextState.phaseDeadlineAt) {
          nextState = endPinturilloRound(nextState, tickNow);
          latestRoom.pinturilloState = nextState;
          changed = true;
        } else {
          const hinted = revealPinturilloHintIfDue(nextState, tickNow);
          if (hinted !== nextState) {
            nextState = hinted;
            changed = true;
          }
          const curDrawer = nextState.players[nextState.drawerSeat];
          if (curDrawer?.isBot && nextState.secretWord) {
            const template = buildBotSketchStrokes(nextState.secretWord.id);
            if (nextState.strokes.length < template.length) {
              const strokeToAdd = template[nextState.strokes.length];
              const sRes = addPinturilloStroke(nextState, curDrawer.userId, strokeToAdd);
              if (sRes.ok) {
                nextState = sRes.state;
                changed = true;
              }
            }
          }
          if (nextState.status === 'drawing' && Math.random() < 0.34) {
            const botGuess = pickBotPinturilloGuess(nextState);
            if (botGuess) {
              const gRes = submitPinturilloGuess(nextState, botGuess.botUserId, botGuess.guessText);
              if (gRes.ok) {
                nextState = gRes.state;
                changed = true;
              }
            }
          }
          if (changed) {
            latestRoom.pinturilloState = nextState;
          }
        }
      }

      if (changed) {
        broadcastPinturilloState(latestRoom);
      }
      schedulePinturilloLifecycle(latestRoom);
    }, delayMs);
    t.unref?.();
    pinturilloTimers.set(room.id, t);
  }

  function stopPoolTurnTimer(roomId: string) {
    const t = poolTurnTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      poolTurnTimers.delete(roomId);
    }
  }

  function clearPoolDisconnectTimer(roomId: string, userId: string) {
    const key = `${roomId}:${userId}`;
    const t = poolDisconnectTimers.get(key);
    if (t) {
      clearTimeout(t);
      poolDisconnectTimers.delete(key);
    }
  }

  function schedulePoolTurnTimer(room: RoomRecord) {
    stopPoolTurnTimer(room.id);
    const ps = room.poolGameState;
    if (!ps || ps.status !== 'playing' || !ps.turnDeadlineAt) return;
    const delayMs = Math.max(250, ps.turnDeadlineAt - Date.now());
    const expectedTurn = ps.turnNumber;
    const expectedSeat = ps.turnSeat;

    const timer = setTimeout(() => {
      poolTurnTimers.delete(room.id);
      const latestRoom = rooms.get(room.id);
      const curr = latestRoom?.poolGameState;
      if (
        !latestRoom ||
        !curr ||
        curr.status !== 'playing' ||
        curr.turnNumber !== expectedTurn ||
        curr.turnSeat !== expectedSeat
      ) {
        return;
      }
      const timedOutSeat = curr.players[curr.turnSeat];
      if (!timedOutSeat) return;
      const forfeited = forfeitPoolMatch(curr, timedOutSeat.userId, 'timeout_forfeit');
      if (!forfeited) return;
      latestRoom.poolGameState = forfeited;
      schedulePersistRoom(latestRoom.id);
      broadcastToRoom(latestRoom.id, {
        type: 'POOL_STATE_UPDATED',
        payload: { poolGameState: latestRoom.poolGameState },
      });
    }, delayMs);
    timer.unref?.();
    poolTurnTimers.set(room.id, timer);
  }

  function stopChapasTimer(roomId: string) {
    const t = chapasTurnTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      chapasTurnTimers.delete(roomId);
    }
  }

  function scheduleChapasTurnTimer(room: RoomRecord) {
    stopChapasTimer(room.id);
    const cs = room.chapasState;
    if (!cs || cs.status !== 'playing') return;
    const activeSeat = cs.players[cs.activeSeatIndex];
    const isBot = Boolean(activeSeat?.isBot);
    const delayMs = isBot
      ? 950
      : cs.turnDeadlineAt
        ? Math.max(250, cs.turnDeadlineAt - Date.now())
        : 15_000;
    const expectedTurn = cs.turnNumber;

    const timer = setTimeout(() => {
      chapasTurnTimers.delete(room.id);
      const latestRoom = rooms.get(room.id);
      const curr = latestRoom?.chapasState;
      if (!latestRoom || !curr || curr.status !== 'playing' || curr.turnNumber !== expectedTurn) {
        return;
      }
      if (latestRoom.participants.length === 0) return;
      const seat = curr.players[curr.activeSeatIndex];
      const shot = chooseChapasAiShot(curr);
      if (!shot) return;
      const res = shootChapasCap(curr, seat?.userId || `bot-chapas-${curr.activeSeatIndex}`, shot);
      if (!res.ok) return;
      latestRoom.chapasState = res.state;
      schedulePersistRoom(latestRoom.id);
      broadcastToRoom(latestRoom.id, {
        type: 'CHAPAS_SHOT_BROADCAST',
        payload: {
          shot: {
            ...shot,
            shooterUserId: seat?.userId || `bot-chapas-${curr.activeSeatIndex}`,
            turnNumber: curr.turnNumber,
          },
          preShotState: res.preShotState,
          authoritativeState: res.state,
        },
      });
      scheduleChapasTurnTimer(latestRoom);
    }, delayMs);
    timer.unref?.();
    chapasTurnTimers.set(room.id, timer);
  }

  function stopBoardTurnTimer(roomId: string) {
    const existing = boardTurnTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      boardTurnTimers.delete(roomId);
    }
  }

  function scheduleBoardTurnTimer(room: RoomRecord): void {
    stopBoardTurnTimer(room.id);
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
          senderName: 'RiffanTV',
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
          senderName: 'RiffanTV',
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

  function stopPartyBotTimer(roomId: string) {
    const existingTimer = partyBotTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      partyBotTimers.delete(roomId);
    }
  }

  function schedulePartyBotTurnIfNeeded(room: RoomRecord): void {
    stopPartyBotTimer(room.id);

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

  return {
    stopPokerBotTimer,
    schedulePokerBotTimer,
    stopPinturilloTimer,
    schedulePinturilloLifecycle,
    stopPoolTurnTimer,
    clearPoolDisconnectTimer,
    schedulePoolTurnTimer,
    stopChapasTimer,
    scheduleChapasTurnTimer,
    stopBoardTurnTimer,
    scheduleBoardTurnTimer,
    stopPartyBotTimer,
    schedulePartyBotTurnIfNeeded,
  };
}
