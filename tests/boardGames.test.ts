import { describe, it, expect } from 'vitest';
import {
  applyBoardMove,
  createInitialBoardGameState,
  getLegalMovesForSquare,
  joinGameSeat,
  resetBoardGame,
  resignBoardGame,
  type BoardGameState,
} from '../src/shared/boardGames';

const alice = { id: 'u-alice', name: 'Alice', avatar: '👩', color: '#9146FF' };
const bob = { id: 'u-bob', name: 'Bob', avatar: '🧑', color: '#10b981' };

function emptyBoard(): (string | null)[][] {
  return Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
}

describe('Multiplayer Board Games Engine (Checkers & Chess)', () => {
  it('enforces seats, turns, and forced jump captures in Checkers', () => {
    let state = createInitialBoardGameState('checkers', alice, false);
    expect(state.status).toBe('waiting');
    state = joinGameSeat(state, bob, 'b');
    expect(state.status).toBe('playing');

    // Bob cannot move before Alice
    const earlyMove = applyBoardMove(state, bob.id, { r: 2, c: 1 }, { r: 3, c: 0 });
    expect(earlyMove.ok).toBe(false);

    // Custom position testing forced jump + multi-jump
    const board = emptyBoard();
    board[5][2] = 'w';
    board[4][3] = 'b';
    board[2][5] = 'b';
    board[5][0] = 'w';
    const custom: BoardGameState = {
      ...state,
      board,
      turn: 'w',
    };

    // Simple move from (5,0) is blocked because a forced jump exists from (5,2) -> (3,4)
    expect(getLegalMovesForSquare(custom, { r: 5, c: 0 })).toHaveLength(0);
    const jumpMoves = getLegalMovesForSquare(custom, { r: 5, c: 2 });
    expect(jumpMoves).toEqual([expect.objectContaining({ r: 3, c: 4, isCapture: true })]);

    // First jump captures (4,3) and requires chain continuation from (3,4)
    const step1 = applyBoardMove(custom, alice.id, { r: 5, c: 2 }, { r: 3, c: 4 });
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    expect(step1.state.board[4][3]).toBeNull();
    expect(step1.state.turn).toBe('w');
    expect(step1.state.mustContinueFrom).toEqual({ r: 3, c: 4 });

    // Second jump captures (2,5) and wins ('no_pieces')
    const step2 = applyBoardMove(step1.state, alice.id, { r: 3, c: 4 }, { r: 1, c: 6 });
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(step2.finishedNow).toBe(true);
    expect(step2.state.winner).toBe('w');
    expect(step2.state.winReason).toBe('no_pieces');
    expect(step2.state.players.w?.score).toBe(1);
  });

  it('promotes checkers piece to king upon reaching last rank', () => {
    let state = createInitialBoardGameState('checkers', alice, true);
    const board = emptyBoard();
    board[1][2] = 'w';
    board[4][5] = 'b';
    state = { ...state, board, turn: 'w' };

    const res = applyBoardMove(state, alice.id, { r: 1, c: 2 }, { r: 0, c: 3 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.board[0][3]).toBe('W');
  });

  it('detects Fool’s Mate checkmate in Chess and supports swapColors rematch', () => {
    let state = createInitialBoardGameState('chess', alice, false);
    state = joinGameSeat(state, bob, 'b');

    // 1. f3 e5 2. g4 Qh4#
    const moves: Array<[string, [number, number], [number, number]]> = [
      [alice.id, [6, 5], [5, 5]], // f3
      [bob.id, [1, 4], [3, 4]],   // e5
      [alice.id, [6, 6], [4, 6]], // g4
      [bob.id, [0, 3], [4, 7]],   // Qh4#
    ];

    for (const [uid, from, to] of moves) {
      const res = applyBoardMove(state, uid, { r: from[0], c: from[1] }, { r: to[0], c: to[1] });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      state = res.state;
    }

    expect(state.status).toBe('finished');
    expect(state.winner).toBe('b');
    expect(state.winReason).toBe('checkmate');
    expect(state.inCheck).toBe('w');
    expect(state.players.b?.score).toBe(1);

    // Rematch swapping colors gives Alice Black and Bob White while preserving scores
    const rematch = resetBoardGame(state, { swapColors: true });
    expect(rematch.status).toBe('playing');
    expect(rematch.players.w?.userId).toBe(bob.id);
    expect(rematch.players.w?.score).toBe(1);
    expect(rematch.players.b?.userId).toBe(alice.id);
  });

  it('supports Chess castling, en passant, and pawn promotion', () => {
    const board = emptyBoard();
    board[7][4] = 'wK';
    board[7][7] = 'wR';
    board[0][4] = 'bK';
    board[3][4] = 'wP';
    board[1][3] = 'bP';

    let state: BoardGameState = {
      ...createInitialBoardGameState('chess', alice, true),
      board,
      turn: 'w',
    };

    // White castles kingside O-O
    const castle = applyBoardMove(state, alice.id, { r: 7, c: 4 }, { r: 7, c: 6 });
    expect(castle.ok).toBe(true);
    if (!castle.ok) return;
    expect(castle.notation).toBe('O-O');
    expect(castle.state.board[7][6]).toBe('wK');
    expect(castle.state.board[7][5]).toBe('wR');

    // Black double-pushes d7 -> d5 next to White e5 pawn
    const blackPush = applyBoardMove(castle.state, alice.id, { r: 1, c: 3 }, { r: 3, c: 3 });
    expect(blackPush.ok).toBe(true);
    if (!blackPush.ok) return;
    expect(blackPush.state.enPassant).toEqual({ r: 2, c: 3 });

    // White captures en passant exd6
    const ep = applyBoardMove(blackPush.state, alice.id, { r: 3, c: 4 }, { r: 2, c: 3 });
    expect(ep.ok).toBe(true);
    if (!ep.ok) return;
    expect(ep.state.board[3][3]).toBeNull();
    expect(ep.state.board[2][3]).toBe('wP');
  });

  it('allows a seated player to resign cleanly', () => {
    let state = createInitialBoardGameState('chess', alice, false);
    state = joinGameSeat(state, bob, 'b');
    const resigned = resignBoardGame(state, alice.id);
    expect(resigned).not.toBeNull();
    expect(resigned?.winner).toBe('b');
    expect(resigned?.winReason).toBe('resign');
    expect(resigned?.players.b?.score).toBe(1);
  });
});
