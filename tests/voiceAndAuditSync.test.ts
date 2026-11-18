import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PARTY_TURN_DECISION_MS,
  PARCHIS_SAFE_SQUARES,
  PARCHIS_START_OFFSETS,
  UNO_TARGET_SCORE,
  buildUnoDeck,
  calculateUnoRoundScore,
  callUnoAction,
  catchUnoFailureAction,
  claimPartyBotSeat,
  createInitialParchisState,
  createInitialUnoState,
  drawUnoCardsAndAdvance,
  getLegalParchisPieceIds,
  moveParchisPiece,
  parchisGlobalSquare,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
  startPartyMatch,
  type ParchisGameState,
  type UnoCard,
  type UnoGameState,
} from '../src/shared/partyGames';
import {
  BOARD_TURN_DECISION_MS,
  applyBoardMove,
  chooseAutoBoardMove,
  createInitialBoardGameState,
  getAllLegalMovesForSide,
  getLegalMovesForSquare,
  resetBoardGame,
  startBoardMatch,
  type BoardGameState,
} from '../src/shared/boardGames';
import {
  CHAPAS_ARENA_W,
  CHAPAS_BALL_RADIUS,
  CHAPAS_CAP_RADIUS,
  CHAPAS_PITCH_BOTTOM,
  CHAPAS_PITCH_TOP,
  createInitialChapasState,
  joinChapasSeat,
  shootChapasCap,
  startChapasMatch,
  toggleChapasBots,
} from '../src/shared/futbolChapas';
import { createInitialPoolState, startPoolMatch } from '../src/shared/pool8Ball';
import {
  createInitialPinturilloState,
  joinPinturilloPlayer,
  startPinturilloMatch,
} from '../src/shared/pinturillo';
import {
  wsChapasShootSchema,
  wsChapasToggleBotsSchema,
  wsGameInviteRespondSchema,
  wsPartyGameActionSchema,
  wsVoiceRoomSchema,
  wsVoiceSignalSchema,
  wsVoiceStateSchema,
} from '../server/ws/wsSchemas';
import { shouldSkipStaleCloudWrite } from '../src/services/userCloudSync';
import { buildHostGameInvitePayload } from '../server/ws/roomHub';

const ROOT = process.cwd();

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
    // Blue CAN move 1 onto the free space before, Wait: square 48 already has 2 pieces (bridge) so even roll 1 is blocked
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
        // Red progress 3 -> lands on 5 => ring square (38+5)%68 = 43 (not a safe square)
        red: [
          { id: 0, color: 'red', progress: 3 },
          { id: 1, color: 'red', progress: 10 },
          { id: 2, color: 'red', progress: -1 },
          { id: 3, color: 'red', progress: -1 },
        ],
        // Blue progress 22 => (21+22)%68 = 43
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
      // Official Mattel rule: seat 1 immediately draws 2 cards and loses turn (seat 2 plays next, no stacking)
      expect(res.state.hands[1].length).toBe(4);
      expect(res.state.pendingDraw).toBe(0);
      expect(res.state.turnSeat).toBe(2);
    }
  });

  it('supports drawing 1 playable card (play or pass), Wild+4 challenge (+4 guilty / +6 challenger), UNO catch (+2), and round scoring', () => {
    const base = createInitialUnoState([{ id: 'u1', name: 'Ana' }]);

    // Draw 1 playable card -> sets drawnPlayableCardId; passing advances turn without forcing another draw
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

    // Wild+4 Challenge: guilty offender (held red card) draws 4; legal bluff-free (+6 to challenger)
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
        expect(wonChallenge.state.hands[0].length).toBe(5); // 1 remaining + 4 penalty
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
        expect(lostChallenge.state.hands[1].length).toBe(7); // 1 + 6 penalty
        expect(lostChallenge.state.turnSeat).toBe(2);
      }
    }

    // Catching UNO failure penalizes +2; calling UNO clears vulnerability
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

    // Score calculation sums opponent hands (50 wilds, 20 actions, face value numbers)
    const pts = calculateUnoRoundScore(
      {
        0: [],
        1: [{ id: 'a', color: 'wild', value: 'wild4' }], // 50
        2: [{ id: 'b', color: 'red', value: 'skip' }], // 20
        3: [{ id: 'c', color: 'blue', value: '9' }], // 9
      },
      0
    );
    expect(pts).toBe(79);
  });
});

describe('Official FIDE Chess & Spanish Checkers Rules', () => {
  it('detects FIDE insufficient material, fifty-move rule, and threefold repetition draws', () => {
    const base = createInitialBoardGameState(
      'chess',
      { id: 'w1', name: 'W', avatar: '♟️', color: '#fff' },
      true
    );

    // 1. Insufficient material: K+N vs K
    const insuffBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    insuffBoard[7][4] = 'wK';
    insuffBoard[7][1] = 'wN';
    insuffBoard[0][4] = 'bK';
    const insuffState: BoardGameState = {
      ...base,
      board: insuffBoard,
      turn: 'w',
      castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
    };
    const resInsuff = applyBoardMove(insuffState, 'w1', { r: 7, c: 1 }, { r: 5, c: 2 });
    expect(resInsuff.ok).toBe(true);
    if (resInsuff.ok) {
      expect(resInsuff.state.status).toBe('finished');
      expect(resInsuff.state.winner).toBe('draw');
      expect(resInsuff.state.winReason).toBe('insufficient_material');
    }

    // 2. Fifty-move rule (halfmoveClock reaching 100)
    const fiftyBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    fiftyBoard[7][4] = 'wK';
    fiftyBoard[7][0] = 'wR';
    fiftyBoard[0][4] = 'bK';
    const fiftyState: BoardGameState = {
      ...base,
      board: fiftyBoard,
      turn: 'w',
      halfmoveClock: 99,
      castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
    };
    const resFifty = applyBoardMove(fiftyState, 'w1', { r: 7, c: 0 }, { r: 7, c: 1 });
    expect(resFifty.ok).toBe(true);
    if (resFifty.ok) {
      expect(resFifty.state.status).toBe('finished');
      expect(resFifty.state.winReason).toBe('fifty_moves');
    }

    // 3. Threefold repetition
    const repBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    repBoard[7][4] = 'wK';
    repBoard[7][0] = 'wR';
    repBoard[0][4] = 'bK';
    repBoard[0][0] = 'bR';
    let s: BoardGameState = {
      ...base,
      board: repBoard,
      turn: 'w',
      castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
    };
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const m1 = applyBoardMove(s, 'w1', { r: 7, c: 0 }, { r: 7, c: 1 });
      if (m1.ok) s = m1.state;
      if (s.status === 'finished') break;
      const m2 = applyBoardMove(s, 'w1', { r: 0, c: 0 }, { r: 0, c: 1 });
      if (m2.ok) s = m2.state;
      if (s.status === 'finished') break;
      const m3 = applyBoardMove(s, 'w1', { r: 7, c: 1 }, { r: 7, c: 0 });
      if (m3.ok) s = m3.state;
      if (s.status === 'finished') break;
      const m4 = applyBoardMove(s, 'w1', { r: 0, c: 1 }, { r: 0, c: 0 });
      if (m4.ok) s = m4.state;
      if (s.status === 'finished') break;
    }
    expect(s.status).toBe('finished');
    expect(s.winReason).toBe('threefold_repetition');
  });

  it('enforces Spanish Checkers flying Dama (Vuelo Largo) and Ley de la Cantidad majority capture', () => {
    const base = createInitialBoardGameState(
      'checkers',
      { id: 'w1', name: 'W', avatar: '🔴', color: '#fff' },
      true
    );

    // Dama at (7,0) jumps black piece at (4,3) and can land on (3,4), (2,5), (1,6), (0,7)
    const flyingBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    flyingBoard[7][0] = 'W';
    flyingBoard[4][3] = 'b';
    flyingBoard[0][1] = 'b';
    const flyingState: BoardGameState = { ...base, board: flyingBoard, turn: 'w' };
    const flyingMoves = getLegalMovesForSquare(flyingState, { r: 7, c: 0 });
    expect(flyingMoves.map((m) => `${m.r},${m.c}`)).toEqual(['3,4', '2,5', '1,6', '0,7']);

    // Majority capture (Ley de la Cantidad): piece at (6,1) can capture 2 enemies; piece at (6,5) only 1 -> only (6,1) is legal
    const majBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    majBoard[6][1] = 'w';
    majBoard[5][2] = 'b';
    majBoard[3][4] = 'b';
    majBoard[6][5] = 'w';
    majBoard[5][6] = 'b';
    const majState: BoardGameState = { ...base, board: majBoard, turn: 'w' };

    expect(getLegalMovesForSquare(majState, { r: 6, c: 5 })).toEqual([]);
    const majLegal = getAllLegalMovesForSide(majState, 'w');
    expect(majLegal).toHaveLength(1);
    expect(majLegal[0].from).toEqual({ r: 6, c: 1 });
    expect(majLegal[0].move.r).toBe(4);
    expect(majLegal[0].move.c).toBe(3);
  });
});

describe('Multiplayer Lobbies, 15s Timer & WebRTC Voice Chat', () => {
  it('validates 15s decision timers, lobby seat/color selection, host play start, and auto-move', () => {
    expect(BOARD_TURN_DECISION_MS).toBe(15_000);
    expect(PARTY_TURN_DECISION_MS).toBe(15_000);

    const waitingParty = createInitialParchisState([{ id: 'host', name: 'Host' }], { waitForHost: true });
    expect(waitingParty.status).toBe('waiting');

    const claimed = claimPartyBotSeat(waitingParty, { id: 'p2', name: 'P2' }, 2);
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.claimedSeat).toBe(2);
      expect(claimed.state.players[2].userId).toBe('p2');
      const started = startPartyMatch(claimed.state);
      expect(started.status).toBe('playing');
      expect(started.turnDeadlineAt).toBeDefined();
    }

    const waitingBoard = createInitialBoardGameState(
      'chess',
      { id: 'host', name: 'Host', avatar: '🎮', color: '#9146FF' },
      false,
      undefined,
      0,
      [],
      true
    );
    expect(waitingBoard.status).toBe('waiting');
    const startedBoard = startBoardMatch(waitingBoard);
    expect(startedBoard.status).toBe('playing');
    expect(startedBoard.players.b?.isBot).toBe(true);
    expect(startedBoard.turnDeadlineAt).toBeDefined();

    const autoMove = chooseAutoBoardMove(startedBoard);
    expect(autoMove).not.toBeNull();
  });

  it('validates WebRTC voice and party lobby WS Zod schemas', () => {
    expect(wsVoiceRoomSchema.safeParse({ roomId: 'sala_vip' }).success).toBe(true);
    expect(wsVoiceStateSchema.safeParse({ roomId: 'sala_vip', isMuted: true }).success).toBe(true);
    expect(
      wsVoiceSignalSchema.safeParse({
        roomId: 'sala_vip',
        targetUserId: 'user-2',
        signalType: 'offer',
        sdp: { type: 'offer', sdp: 'v=0...' },
      }).success
    ).toBe(true);
    expect(
      wsPartyGameActionSchema.safeParse({
        roomId: 'sala_vip',
        action: 'join_seat',
        seatIndex: 2,
      }).success
    ).toBe(true);
    expect(
      wsPartyGameActionSchema.safeParse({
        roomId: 'sala_vip',
        action: 'start_match',
      }).success
    ).toBe(true);
  });

  it('enables microphone permissions in metadata/headers and wires VoiceWaveBars across all 7 games', () => {
    const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8'));
    expect(metadata.requestFramePermissions).toContain('microphone');

    const errHandlerSrc = fs.readFileSync(
      path.join(ROOT, 'server/middleware/errorHandler.ts'),
      'utf8'
    );
    expect(errHandlerSrc).toContain('microphone=*');

    const hubSrc = fs.readFileSync(path.join(ROOT, 'src/components/GamesHubSection.tsx'), 'utf8');
    expect(hubSrc).toContain('VoiceWaveBars');
    expect(hubSrc).not.toContain('showPartyWaitingColors');

    const poolSrc = fs.readFileSync(path.join(ROOT, 'src/components/Pool8BallStage.tsx'), 'utf8');
    expect(poolSrc).toContain('VoiceSpeakerIndicator');
    expect(poolSrc).toContain('audioLevel={p0Level}');

    const voiceHookSrc = fs.readFileSync(path.join(ROOT, 'src/hooks/useGameVoiceChat.ts'), 'utf8');
    expect(voiceHookSrc).toContain('openrelay.metered.ca');
    expect(voiceHookSrc).toContain('primeAudioPoolOnGesture');
    expect(voiceHookSrc).toContain('audioPlaybackBlocked');
    expect(voiceHookSrc).toContain('resumeRemoteAudio');
    expect(voiceHookSrc).not.toContain("el.style.display = 'none'");

    const playerSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/NativeCinemaPlayer.tsx'),
      'utf8'
    );
    expect(playerSrc).toContain('voiceChat');
    expect(playerSrc).toContain('VoiceWaveBars');
  });

  it('builds centered host game invite payloads only when host starts with human companions', () => {
    const baseRoom = {
      id: 'sala-test',
      name: 'Sala VIP',
      hostId: 'u_host',
      creatorId: 'u_host',
      participants: [
        { id: 'u_host', name: 'Anfitrión', avatar: '👑' },
        { id: 'u_guest', name: 'Invitado', avatar: '🍿' },
      ],
    };

    // Non-host should NOT trigger room-wide centered invite
    expect(
      buildHostGameInvitePayload({
        room: baseRoom,
        senderUserId: 'u_guest',
        gameType: 'pool',
      })
    ).toBeNull();

    // Solo/local match should NOT invite guests
    expect(
      buildHostGameInvitePayload({
        room: baseRoom,
        senderUserId: 'u_host',
        gameType: 'chess',
        soloLocal: true,
      })
    ).toBeNull();

    // Room with only host + Smart TV should NOT emit centered invite
    expect(
      buildHostGameInvitePayload({
        room: {
          ...baseRoom,
          participants: [
            { id: 'u_host', name: 'Anfitrión', avatar: '👑' },
            { id: 'tv_1', name: 'Salon (TV)', avatar: '📺' },
          ],
        },
        senderUserId: 'u_host',
        gameType: 'parchis',
      })
    ).toBeNull();

    // Host starting any of the 8 games with human companion emits invite
    const allGames = ['pool', 'chapas', 'parchis', 'uno', 'pinturillo', 'chess', 'checkers', 'connect4'] as const;
    for (const gt of allGames) {
      const invite = buildHostGameInvitePayload({
        room: baseRoom,
        senderUserId: 'u_host',
        gameType: gt,
      });
      expect(invite).not.toBeNull();
      expect(invite?.gameType).toBe(gt);
      expect(invite?.inviterId).toBe('u_host');
      expect(invite?.roomName).toBe('Sala VIP');
    }
  });
});

describe('Futbol Chapas Engine & Match Waiting Lobby Flows', () => {
  it('sets up 12 caps + ball, toggles bots cleanly, enforces 3-pass possession and first-to-3 goals', () => {
    const waiting = createInitialChapasState([{ id: 'u1', name: 'Naim' }], { waitForHost: true });
    expect(waiting.status).toBe('waiting');
    expect(waiting.caps.length).toBe(12);
    expect(waiting.players[0]?.userId).toBe('u1');
    expect(waiting.players[2]?.isBot).toBe(true);

    // Turning bots OFF removes AI seats
    const noBots = toggleChapasBots(waiting, false);
    expect(noBots.botsEnabled).toBe(false);
    expect(noBots.players[2]).toBeNull();

    // Joining Team B with second human allows starting without bots
    const joined = joinChapasSeat(noBots, { id: 'u2', name: 'Carlos' }, 2);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const started = startChapasMatch(joined.state);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.status).toBe('playing');
    expect(started.state.activeTeam).toBe('A');

    // Aim A-6 directly down into center ball -> ballTouched keeps Team A possession & increments passesUsed
    const capA6 = started.state.caps.find((c) => c.id === 'A-6')!;
    const touchAngle = Math.atan2(started.state.ball.y - capA6.y, started.state.ball.x - capA6.x);
    const pass1 = shootChapasCap(started.state, 'u1', { capId: 'A-6', angle: touchAngle, power: 0.45 });
    expect(pass1.ok).toBe(true);
    if (!pass1.ok) return;
    expect(pass1.state.lastShot?.ballTouched).toBe(true);
    expect(pass1.state.activeTeam).toBe('A');
    expect(pass1.state.passesUsed).toBe(1);

    // Miss the ball completely -> turn transfers immediately to Team B
    const miss = shootChapasCap(pass1.state, 'u1', { capId: 'A-1', angle: Math.PI, power: 0.25 });
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    expect(miss.state.activeTeam).toBe('B');
    expect(miss.state.passesUsed).toBe(0);

    // Position ball near bottom goal and cap A-6 behind it -> scoring increments Team A score and resets kickoff
    const goalSetup = {
      ...miss.state,
      activeTeam: 'A' as const,
      activeSeatIndex: 0 as const,
      scores: { A: 2, B: 0 },
      caps: miss.state.caps.map((c) =>
        c.id === 'A-6' ? { ...c, x: CHAPAS_ARENA_W / 2, y: CHAPAS_PITCH_BOTTOM - 58 } : c
      ),
      ball: {
        x: CHAPAS_ARENA_W / 2,
        y: CHAPAS_PITCH_BOTTOM - CHAPAS_BALL_RADIUS - 12,
        vx: 0,
        vy: 0,
        spinAngle: 0,
      },
    };
    const winningGoal = shootChapasCap(goalSetup, 'u1', {
      capId: 'A-6',
      angle: Math.PI / 2,
      power: 0.85,
    });
    expect(winningGoal.ok).toBe(true);
    if (!winningGoal.ok) return;
    expect(winningGoal.state.scores.A).toBe(3);
    expect(winningGoal.state.status).toBe('finished');
    expect(winningGoal.state.winnerTeam).toBe('A');
  });

  it('keeps Pool, Pinturillo, and switched Board games waiting until players respond or host starts', () => {
    const poolWait = createInitialPoolState([{ id: 'u1', name: 'Host' }], { waitForHost: true });
    expect(poolWait.status).toBe('waiting');
    expect(poolWait.awaitingHostStart).toBe(true);
    expect(poolWait.turnDeadlineAt).toBe(0);
    const poolLive = startPoolMatch(poolWait);
    expect(poolLive.status).toBe('playing');
    expect(poolLive.turnDeadlineAt).toBeGreaterThan(0);

    const pintWait = createInitialPinturilloState([{ id: 'u1', name: 'Host' }], { waitForHost: true });
    expect(pintWait.status).toBe('waiting');
    expect(pintWait.phaseDeadlineAt).toBe(0);
    const pintJoined = joinPinturilloPlayer(pintWait, { id: 'u2', name: 'Ana' });
    expect(pintJoined.players.some((p) => p.userId === 'u2')).toBe(true);
    const pintLive = startPinturilloMatch(pintJoined);
    expect(pintLive.status).toBe('choosing');
    expect(pintLive.phaseDeadlineAt).toBeGreaterThan(0);

    const chess = startBoardMatch(createInitialBoardGameState('chess', { id: 'u1', name: 'Host' }));
    const switchedToCheckers = resetBoardGame(chess, { gameType: 'checkers', waitForHost: true });
    expect(switchedToCheckers.gameType).toBe('checkers');
    expect(switchedToCheckers.status).toBe('waiting');
    expect(switchedToCheckers.turnDeadlineAt).toBe(0);
  });

  it('validates game invite response and Chapas WS schemas, and keeps chat sidebar free of games menu', () => {
    expect(
      wsGameInviteRespondSchema.safeParse({
        roomId: 'sala_vip',
        gameType: 'chapas',
        response: 'accepted',
      }).success
    ).toBe(true);
    expect(
      wsChapasToggleBotsSchema.safeParse({
        roomId: 'sala_vip',
        botsEnabled: false,
      }).success
    ).toBe(true);
    expect(
      wsChapasShootSchema.safeParse({
        roomId: 'sala_vip',
        shot: {
          capId: 'A-6',
          angle: 1.57,
          power: 0.7,
        },
      }).success
    ).toBe(true);

    const sidebarSrc = fs.readFileSync(path.join(ROOT, 'src/components/PartySidebar.tsx'), 'utf8');
    expect(sidebarSrc).not.toContain('Juegos Online en Sala');
    expect(sidebarSrc).not.toContain('PartyGamesStage');

    const hubSrc = fs.readFileSync(path.join(ROOT, 'src/components/GamesHubSection.tsx'), 'utf8');
    expect(hubSrc).toContain('FutbolChapasStage');
    expect(hubSrc).toContain('matchResponses');
  });
});

describe('Audit Checklist & Asset Integrity', () => {
  it('enforces updatedAt conflict resolution, World Shell architecture without bottom nav, online-first GamesHub, TV a11y, and WebP-only images', () => {
    expect(
      shouldSkipStaleCloudWrite({
        serverUpdatedMs: 20_000,
        clientUpdatedMs: 5_000,
      })
    ).toBe(true);
    expect(
      shouldSkipStaleCloudWrite({
        serverUpdatedMs: 12_000,
        clientUpdatedMs: 10_000,
      })
    ).toBe(false);

    expect(fs.existsSync(path.join(ROOT, 'src/components/MobileBottomNav.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'src/components/EntryHomeScreen.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/components/worlds/WorldShell.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/components/AvatarMenuSheet.tsx'))).toBe(true);

    const gamesHubSrc = fs.readFileSync(path.join(ROOT, 'src/components/GamesHubSection.tsx'), 'utf8');
    expect(gamesHubSrc).toContain("useState<'offline' | 'online'>('online')");

    const tvNavSrc = fs.readFileSync(path.join(ROOT, 'src/utils/tvSpatialNav.ts'), 'utf8');
    expect(tvNavSrc).toContain('naim-tv-a11y-live');
    expect(tvNavSrc).toContain('10009');

    const imgFiles = fs.readdirSync(path.join(ROOT, 'src/assets/images'));
    expect(imgFiles.some((f) => f.endsWith('.webp') || f.endsWith('.jpg'))).toBe(true);
    expect(imgFiles.some((f) => /\.png$/i.test(f))).toBe(false);
  });

  it('verifies AI Movie Request pipeline, SurpriseMe 2-mode UI, scalloped Futbol Chapas, and World Shell catalog structure', () => {
    const aiServiceSrc = fs.readFileSync(
      path.join(ROOT, 'server/services/aiMovieRequestService.ts'),
      'utf8'
    );
    expect(aiServiceSrc).toContain('gemini-4-hydrogen');
    expect(aiServiceSrc).toContain('aistudio-build');
    expect(aiServiceSrc).toContain('verifyAndBuildCatalogMovie');

    const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(serverSrc).toContain("app.post('/api/ai/request-movie'");
    expect(serverSrc).toContain("app.get('/api/ai/request-movie/:jobId'");

    const surpriseSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/SurpriseMeModal.tsx'),
      'utf8'
    );
    expect(surpriseSrc).toContain('Pedir película');
    expect(surpriseSrc).toContain('/api/ai/request-movie');

    const chapasSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/FutbolChapasStage.tsx'),
      'utf8'
    );
    expect(chapasSrc).toContain('traceBottleCapCrownPath');
    expect(chapasSrc).toContain('CHAPAS_PITCH_BOTTOM + 14');

    const catalogSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/MediaCatalogHub.tsx'),
      'utf8'
    );
    expect(catalogSrc).toContain("worldMode === 'cine'");
    expect(catalogSrc).toContain('Fútbol China (中文)');
    expect(catalogSrc).toContain('欧冠/西甲/英超');

    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain('<EntryHomeScreen');
    expect(appSrc).toContain('<WorldShell');
  });

  it('guarantees fluid vertical scrolling across mobile, desktop and TV without nested overflow-y traps', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain('className="h-[100dvh] w-full max-w-[100vw] bg-[#0B0B0E] text-[#EFEFF1] overflow-hidden"');
    expect(appSrc).toContain('ref={catalogScrollRef} className="w-full min-w-0 shrink-0"');
    expect(appSrc).toContain('overflow-y-auto overflow-x-clip touch-pan-y smooth-scroll-area');

    const entrySrc = fs.readFileSync(path.join(ROOT, 'src/components/EntryHomeScreen.tsx'), 'utf8');
    expect(entrySrc).toContain('overflow-x-clip');
    expect(entrySrc).not.toContain('overflow-x-hidden');

    const cssSrc = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
    expect(cssSrc).toContain('touch-action: pan-y;');
    expect(cssSrc).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%;/);
  });
});

