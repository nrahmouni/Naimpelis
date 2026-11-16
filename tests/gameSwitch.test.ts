import { describe, expect, it } from 'vitest';
import {
  buildSwitchedRoomGameStates,
  collectSeatedHumansFromRoom,
  type PreservedHumanPlayer,
} from '../server/ws/gameSwitchHelper';
import { wsGameSwitchSchema } from '../server/ws/wsSchemas';
import { createInitialPoolState } from '../src/shared/pool8Ball';
import { createInitialPokerState } from '../src/shared/texasHoldem';
import { createInitialBoardGameState, joinGameSeat } from '../src/shared/boardGames';
import { createInitialBlackjackState, joinBlackjackSeat } from '../src/shared/blackjack';

const ALICE: PreservedHumanPlayer = {
  id: 'u-alice',
  name: 'Alice',
  avatar: '🦊',
  color: '#9146FF',
};

const BOB: PreservedHumanPlayer = {
  id: 'u-bob',
  name: 'Bob',
  avatar: '🐯',
  color: '#38BDF8',
};

const CARLOS: PreservedHumanPlayer = {
  id: 'u-carlos',
  name: 'Carlos',
  avatar: '🦁',
  color: '#10B981',
};

describe('In-Game Switcher — Seated Player Preservation', () => {
  it('validates wsGameSwitchSchema for all 11 supported games', () => {
    const validGames = [
      'pool',
      'chapas',
      'headsoccer',
      'poker',
      'blackjack',
      'parchis',
      'uno',
      'pinturillo',
      'chess',
      'checkers',
      'connect4',
    ] as const;

    for (const targetGame of validGames) {
      expect(wsGameSwitchSchema.safeParse({ roomId: 'sala-1', targetGame }).success).toBe(true);
    }
    expect(wsGameSwitchSchema.safeParse({ roomId: 'sala-1', targetGame: 'unknown' }).success).toBe(false);
  });

  it('collects only non-bot seated humans and preserves order across games', () => {
    const poker = createInitialPokerState([ALICE, BOB, CARLOS], { fillWithBots: true });
    const humans = collectSeatedHumansFromRoom({
      participants: [ALICE, BOB, CARLOS],
      pokerGameState: poker,
    });
    expect(humans.map((h) => h.id)).toEqual(['u-alice', 'u-bob', 'u-carlos']);
  });

  it('deduplicates soloLocal board player when collecting seated humans', () => {
    const soloBoard = createInitialBoardGameState('chess', ALICE, true);
    const humans = collectSeatedHumansFromRoom({
      participants: [ALICE],
      gameState: soloBoard,
    });
    expect(humans.map((h) => h.id)).toEqual(['u-alice']);
  });

  it('switches from Pool (2 players) to UNO preserving both seated players and clearing Pool state', () => {
    const pool = createInitialPoolState([ALICE, BOB], { waitForHost: false });
    const seated = collectSeatedHumansFromRoom({
      participants: [ALICE, BOB],
      poolGameState: pool,
    });
    const switched = buildSwitchedRoomGameStates('uno', seated);

    expect(switched.poolGameState).toBeNull();
    expect(switched.partyGameState?.gameType).toBe('uno');
    expect(switched.partyGameState?.status).toBe('playing');
    const unoHumans = switched.partyGameState?.players.filter((p) => !p.isBot) ?? [];
    expect(unoHumans.map((p) => p.userId)).toEqual(['u-alice', 'u-bob']);
  });

  it('switches from Blackjack (3 players) to Poker preserving all 3 seated humans', () => {
    let bj = createInitialBlackjackState(ALICE);
    bj = joinBlackjackSeat(bj, BOB).state;
    bj = joinBlackjackSeat(bj, CARLOS).state;

    const seated = collectSeatedHumansFromRoom({
      participants: [ALICE, BOB, CARLOS],
      blackjackState: bj,
    });
    const switched = buildSwitchedRoomGameStates('poker', seated);

    expect(switched.blackjackState).toBeNull();
    expect(switched.pokerGameState).not.toBeNull();
    const pokerHumans = switched.pokerGameState?.seats.filter((s) => s && !s.isBot) ?? [];
    expect(pokerHumans.map((s) => s?.userId)).toEqual(['u-alice', 'u-bob', 'u-carlos']);
  });

  it('switches from Chess (2 players) to Head Soccer, Chapas, Pinturillo, and Blackjack preserving players', () => {
    let chess = createInitialBoardGameState('chess', ALICE, false);
    chess = joinGameSeat(chess, BOB, 'b');

    const seated = collectSeatedHumansFromRoom({
      participants: [ALICE, BOB],
      gameState: chess,
    });

    const toHs = buildSwitchedRoomGameStates('headsoccer', seated);
    expect(toHs.gameState).toBeNull();
    expect(toHs.headSoccerState?.players[0]?.userId).toBe('u-alice');
    expect(toHs.headSoccerState?.players[1]?.userId).toBe('u-bob');

    const toChapas = buildSwitchedRoomGameStates('chapas', seated);
    expect(toChapas.chapasState?.status).toBe('playing');
    const chapasHumans = toChapas.chapasState?.players.filter((p) => p && !p.isBot) ?? [];
    expect(chapasHumans.map((p) => p?.userId)).toEqual(['u-alice', 'u-bob']);

    const toPinturillo = buildSwitchedRoomGameStates('pinturillo', seated);
    expect(toPinturillo.pinturilloState?.status).toBe('choosing');
    const pintoHumans = toPinturillo.pinturilloState?.players.filter((p) => !p.isBot) ?? [];
    expect(pintoHumans.map((p) => p.userId)).toEqual(['u-alice', 'u-bob']);

    const toBlackjack = buildSwitchedRoomGameStates('blackjack', seated);
    const bjHumans = toBlackjack.blackjackState?.seats.filter(Boolean) ?? [];
    expect(bjHumans.map((s) => s?.userId)).toEqual(['u-alice', 'u-bob']);

    const toChess = buildSwitchedRoomGameStates('connect4', seated);
    expect(toChess.gameState?.gameType).toBe('connect4');
    expect(toChess.gameState?.status).toBe('playing');
    expect(toChess.gameState?.players.w?.userId).toBe('u-alice');
    expect(toChess.gameState?.players.b?.userId).toBe('u-bob');
  });
});
