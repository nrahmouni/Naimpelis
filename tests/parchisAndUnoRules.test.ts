import { describe, expect, it } from 'vitest';
import {
  PARCHIS_SAFE_SQUARES,
  PARCHIS_START_OFFSETS,
  UNO_TARGET_SCORE,
  buildUnoDeck,
  calculateUnoRoundScore,
  callUnoAction,
  catchUnoFailureAction,
  createInitialParchisState,
  createInitialUnoState,
  drawUnoCardsAndAdvance,
  getLegalParchisPieceIds,
  moveParchisPiece,
  parchisGlobalSquare,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
  type ParchisGameState,
  type UnoCard,
  type UnoGameState,
} from '../src/shared/partyGames';

describe('Official Spanish Parchís Rules', () => {
  it('uses 68-square ring offsets, 12 official safe squares, and exit only on rolling a 5', () => {
    expect(PARCHIS_START_OFFSETS).toEqual({
      yellow: 4,
      blue: 21,
      red: 38,
      green: 55,
    });
    expect(PARCHIS_SAFE_SQUARES.size).toBe(12);
    expect(parchisGlobalSquare('yellow', 0)).toBe(4);
    expect(parchisGlobalSquare('red', 63)).toBe((38 + 63) % 68);
    expect(parchisGlobalSquare('red', 64)).toBeNull();

    const state = createInitialParchisState([{ id: 'u1', name: 'Ana' }]);
    expect(getLegalParchisPieceIds(state, 4)).toEqual([]);
    expect(getLegalParchisPieceIds(state, 6)).toEqual([]);
    expect(getLegalParchisPieceIds(state, 5)).toEqual([0, 1, 2, 3]);
  });

  it('forms bridges that block passage and obligates opening own bridge on rolling a 6', () => {
    const base = createInitialParchisState([{ id: 'u1', name: 'Ana' }]);
    const custom: ParchisGameState = {
      ...base,
      turnSeat: 0, // red (offset 38)
      dice: 6,
      phase: 'move',
      pieces: {
        ...base.pieces,
        // Red forms a bridge at progress 10 (ring square 48); piece #2 is at progress 4 (square 42)
        red: [
          { id: 0, color: 'red', progress: 10 },
          { id: 1, color: 'red', progress: 10 },
          { id: 2, color: 'red', progress: 4 },
          { id: 3, color: 'red', progress: -1 },
        ],
        // Blue has a piece right behind red's bridge at ring square 47 (blue offset 21 => progress 26)
        blue: [
          { id: 0, color: 'blue', progress: 26 },
          { id: 1, color: 'blue', progress: -1 },
          { id: 2, color: 'blue', progress: -1 },
          { id: 3, color: 'blue', progress: -1 },
        ],
      },
    };

    // Rolling 6 obligates opening red's bridge (pieces 0 or 1, NOT piece 2)
    expect(getLegalParchisPieceIds(custom, 6)).toEqual([0, 1]);

    // Blue behind the bridge cannot jump over red's bridge at square 48 with a roll of 3
    const blueTurn: ParchisGameState = { ...custom, turnSeat: 1, dice: 3 };
    expect(getLegalParchisPieceIds(blueTurn, 3)).toEqual([]);
    // Square 48 already has 2 pieces (bridge) so roll 1 is also blocked
    expect(getLegalParchisPieceIds(blueTurn, 1)).toEqual([]);
  });

  it('awards +20 bonus on capture, +10 on reaching Meta, and resets last ring piece on three consecutive 6s while sparing pasillo', () => {
    const base = createInitialParchisState([{ id: 'u1', name: 'Ana' }]);

    // 1. Capture grants +20 bonus steps
    const captureState: ParchisGameState = {
      ...base,
      turnSeat: 0,
      dice: 2,
      phase: 'move',
      pieces: {
        ...base.pieces,
        red: [
          { id: 0, color: 'red', progress: 3 },
          { id: 1, color: 'red', progress: 10 },
          { id: 2, color: 'red', progress: -1 },
          { id: 3, color: 'red', progress: -1 },
        ],
        blue: [
          { id: 0, color: 'blue', progress: 22 },
          { id: 1, color: 'blue', progress: -1 },
          { id: 2, color: 'blue', progress: -1 },
          { id: 3, color: 'blue', progress: -1 },
        ],
      },
    };
    const capRes = moveParchisPiece(captureState, 'u1', 0);
    expect(capRes.ok).toBe(true);
    if (capRes.ok) {
      expect(capRes.state.pieces.blue[0].progress).toBe(-1);
      expect(capRes.state.bonusSteps).toBe(20);
      expect(capRes.state.phase).toBe('move');
    }

    // 2. Reaching Meta (71) grants +10 bonus steps
    const metaState: ParchisGameState = {
      ...base,
      turnSeat: 0,
      dice: 2,
      phase: 'move',
      pieces: {
        ...base.pieces,
        red: [
          { id: 0, color: 'red', progress: 69 },
          { id: 1, color: 'red', progress: 12 },
          { id: 2, color: 'red', progress: -1 },
          { id: 3, color: 'red', progress: -1 },
        ],
      },
    };
    const metaRes = moveParchisPiece(metaState, 'u1', 0);
    expect(metaRes.ok).toBe(true);
    if (metaRes.ok) {
      expect(metaRes.state.pieces.red[0].progress).toBe(71);
      expect(metaRes.state.bonusSteps).toBe(10);
    }

    // 3. Three 6s resets lastMovedPieceId on shared ring to Casa (-1), but spares piece in pasillo (>= 64)
    const threeSixRing: ParchisGameState = {
      ...base,
      turnSeat: 0,
      phase: 'roll',
      consecutiveSixes: 2,
      lastMovedPieceId: 0,
      pieces: {
        ...base.pieces,
        red: [
          { id: 0, color: 'red', progress: 15 },
          { id: 1, color: 'red', progress: -1 },
          { id: 2, color: 'red', progress: -1 },
          { id: 3, color: 'red', progress: -1 },
        ],
      },
    };
    const penaltyRing = rollParchisDice(threeSixRing, 'u1', 6);
    expect(penaltyRing.ok).toBe(true);
    if (penaltyRing.ok) {
      expect(penaltyRing.state.pieces.red[0].progress).toBe(-1);
      expect(penaltyRing.state.turnSeat).toBe(1);
    }

    const threeSixPasillo: ParchisGameState = {
      ...threeSixRing,
      pieces: {
        ...base.pieces,
        red: [
          { id: 0, color: 'red', progress: 66 },
          { id: 1, color: 'red', progress: -1 },
          { id: 2, color: 'red', progress: -1 },
          { id: 3, color: 'red', progress: -1 },
        ],
      },
    };
    const sparedRes = rollParchisDice(threeSixPasillo, 'u1', 6);
    expect(sparedRes.ok).toBe(true);
    if (sparedRes.ok) {
      expect(sparedRes.state.pieces.red[0].progress).toBe(66);
      expect(sparedRes.state.turnSeat).toBe(1);
    }
  });
});

describe('Official 1971 Mattel UNO Rules', () => {
  it('builds an official 108-card deck and rejects +2/+4 stacking', () => {
    const deck = buildUnoDeck();
    expect(deck.length).toBe(108);
    expect(UNO_TARGET_SCORE).toBe(500);

    const state = createInitialUnoState([{ id: 'u1', name: 'Ana' }]);
    const redDraw2: UnoCard = { id: 'c-d2', color: 'red', value: 'draw2' };
    const blueDraw2: UnoCard = { id: 'c-d2-b', color: 'blue', value: 'draw2' };
    const redSkip: UnoCard = { id: 'c-sk', color: 'red', value: 'skip' };

    const custom: UnoGameState = {
      ...state,
      direction: 1,
      turnSeat: 0,
      activeColor: 'red',
      discardPile: [{ id: 'top', color: 'red', value: '4' }],
      hands: {
        0: [redDraw2, redSkip],
        1: [blueDraw2, { id: 'b-keep', color: 'green', value: '7' }],
        2: [{ id: 'c-keep', color: 'yellow', value: '1' }],
        3: [{ id: 'd-keep', color: 'red', value: '2' }],
      },
    };

    const res = playUnoCard(custom, 'u1', 'c-d2');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.hands[1].length).toBe(4);
      expect(res.state.pendingDraw).toBe(0);
      expect(res.state.turnSeat).toBe(2);
    }
  });

  it('supports drawing 1 playable card (play or pass), Wild+4 challenge (+4 guilty / +6 challenger), UNO catch (+2), and round scoring', () => {
    const base = createInitialUnoState([{ id: 'u1', name: 'Ana' }]);

    const drawState: UnoGameState = {
      ...base,
      direction: 1,
      turnSeat: 0,
      activeColor: 'blue',
      discardPile: [{ id: 'top', color: 'blue', value: '9' }],
      deck: [{ id: 'drawn-ok', color: 'blue', value: '3' }],
      hands: {
        ...base.hands,
        0: [{ id: 'no-match', color: 'red', value: '2' }],
      },
    };
    const drawRes = drawUnoCardsAndAdvance(drawState, 'u1');
    expect(drawRes.ok).toBe(true);
    if (drawRes.ok) {
      expect(drawRes.state.drawnPlayableCardId).toBe('drawn-ok');
      expect(drawRes.state.turnSeat).toBe(0);
      const passRes = drawUnoCardsAndAdvance(drawRes.state, 'u1');
      expect(passRes.ok).toBe(true);
      if (passRes.ok) {
        expect(passRes.state.drawnPlayableCardId).toBeNull();
        expect(passRes.state.turnSeat).toBe(1);
      }
    }

    const wild4State: UnoGameState = {
      ...base,
      players: base.players.map((p, i) => ({ ...p, isBot: false, userId: `u${i + 1}` })),
      turnSeat: 0,
      direction: 1,
      activeColor: 'red',
      discardPile: [{ id: 'top', color: 'red', value: '5' }],
      hands: {
        0: [
          { id: 'w4', color: 'wild', value: 'wild4' },
          { id: 'guilty-red', color: 'red', value: '7' },
        ],
        1: [{ id: 'v1', color: 'green', value: '1' }],
        2: [{ id: 'v2', color: 'blue', value: '2' }],
        3: [{ id: 'v3', color: 'yellow', value: '3' }],
      },
    };
    const afterW4 = playUnoCard(wild4State, 'u1', 'w4', 'green');
    expect(afterW4.ok).toBe(true);
    if (afterW4.ok) {
      expect(afterW4.state.pendingWild4Challenge?.wasIllegal).toBe(true);
      const wonChallenge = resolveUnoWild4Challenge(afterW4.state, 'u2', 'challenge');
      expect(wonChallenge.ok).toBe(true);
      if (wonChallenge.ok) {
        expect(wonChallenge.state.hands[0].length).toBe(5);
        expect(wonChallenge.state.turnSeat).toBe(1);
      }
    }

    const legalW4State: UnoGameState = {
      ...wild4State,
      hands: {
        ...wild4State.hands,
        0: [
          { id: 'w4', color: 'wild', value: 'wild4' },
          { id: 'ok-blue', color: 'blue', value: '7' },
        ],
      },
    };
    const afterLegalW4 = playUnoCard(legalW4State, 'u1', 'w4', 'green');
    expect(afterLegalW4.ok).toBe(true);
    if (afterLegalW4.ok) {
      expect(afterLegalW4.state.pendingWild4Challenge?.wasIllegal).toBe(false);
      const lostChallenge = resolveUnoWild4Challenge(afterLegalW4.state, 'u2', 'challenge');
      expect(lostChallenge.ok).toBe(true);
      if (lostChallenge.ok) {
        expect(lostChallenge.state.hands[1].length).toBe(7);
        expect(lostChallenge.state.turnSeat).toBe(2);
      }
    }

    const unoTrap: UnoGameState = {
      ...wild4State,
      turnSeat: 0,
      hands: {
        0: [
          { id: 'r1', color: 'red', value: '5' },
          { id: 'r2', color: 'red', value: '8' },
        ],
        1: [{ id: 'v1', color: 'green', value: '1' }],
        2: [{ id: 'v2', color: 'blue', value: '2' }],
        3: [{ id: 'v3', color: 'yellow', value: '3' }],
      },
    };
    const dropToOne = playUnoCard(unoTrap, 'u1', 'r1');
    expect(dropToOne.ok).toBe(true);
    if (dropToOne.ok) {
      expect(dropToOne.state.vulnerableUnoSeat).toBe(0);
      const caught = catchUnoFailureAction(dropToOne.state, 'u2');
      expect(caught.ok).toBe(true);
      if (caught.ok) {
        expect(caught.state.hands[0].length).toBe(3);
        expect(caught.state.vulnerableUnoSeat).toBeNull();
      }
      const called = callUnoAction(dropToOne.state, 'u1');
      expect(called.ok).toBe(true);
      if (called.ok) {
        expect(called.state.vulnerableUnoSeat).toBeNull();
      }
    }

    const pts = calculateUnoRoundScore(
      {
        0: [],
        1: [{ id: 'a', color: 'wild', value: 'wild4' }],
        2: [{ id: 'b', color: 'red', value: 'skip' }],
        3: [{ id: 'c', color: 'blue', value: '9' }],
      },
      0
    );
    expect(pts).toBe(79);
  });
});
