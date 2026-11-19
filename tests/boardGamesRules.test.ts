import { describe, expect, it } from 'vitest';
import {
  applyBoardMove,
  createInitialBoardGameState,
  getAllLegalMovesForSide,
  getLegalMovesForSquare,
  type BoardGameState,
} from '../src/shared/boardGames';

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

    const flyingBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    flyingBoard[7][0] = 'W';
    flyingBoard[4][3] = 'b';
    flyingBoard[0][1] = 'b';
    const flyingState: BoardGameState = { ...base, board: flyingBoard, turn: 'w' };
    const flyingMoves = getLegalMovesForSquare(flyingState, { r: 7, c: 0 });
    expect(flyingMoves.map((m) => `${m.r},${m.c}`)).toEqual(['3,4', '2,5', '1,6', '0,7']);

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
