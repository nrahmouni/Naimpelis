import {
  appendHistoryEntry,
  BOARD_TURN_DECISION_MS,
  cloneBoard,
  coordLabel,
  getPieceSide,
  inBounds,
  withClockTick,
  type BoardCoord,
  type BoardGameState,
  type BoardSide,
  type ChessPromotionPiece,
  type LegalBoardMove,
} from './types.ts';
import {
  checkConnect4Win,
  findConnect4WinningLine,
  getBestCaptureCountForSide,
  getCheckersJumpsFrom,
  getCheckersSimpleMovesFrom,
  getConnect4DropRow,
  maxCheckersCaptureChain,
  type CheckersJumpMove,
} from './checkersAndConnect4.ts';

import {
  getPseudoChessMoves,
  isChessKingInCheck,
  simulateChessBoardMove,
} from './chessMoveGen.ts';

export { isChessKingInCheck };

export function getLegalMovesForSquare(
  state: BoardGameState,
  from: BoardCoord
): LegalBoardMove[] {
  if (state.status === 'finished' || !inBounds(from.r, from.c)) return [];
  const piece = state.board[from.r][from.c];
  const side = getPieceSide(piece);
  if (!piece || side !== state.turn) return [];

  if (state.gameType === 'checkers') {
    if (
      state.mustContinueFrom &&
      (state.mustContinueFrom.r !== from.r || state.mustContinueFrom.c !== from.c)
    ) {
      return [];
    }
    const maxGlobalCaps = state.mustContinueFrom
      ? maxCheckersCaptureChain(state.board, from.r, from.c, side)
      : getBestCaptureCountForSide(state.board, side);

    if (maxGlobalCaps > 0) {
      const jumps = getCheckersJumpsFrom(state.board, from.r, from.c);
      return jumps.filter((j) => {
        const sim = cloneBoard(state.board);
        sim[from.r][from.c] = null;
        sim[j.captureAt.r][j.captureAt.c] = null;
        if (j.isPromotion) {
          return 1 === maxGlobalCaps;
        }
        sim[j.r][j.c] = piece;
        return 1 + maxCheckersCaptureChain(sim, j.r, j.c, side) === maxGlobalCaps;
      });
    }
    return getCheckersSimpleMovesFrom(state.board, from.r, from.c);
  }

  const pseudo = getPseudoChessMoves(state, from.r, from.c);
  return pseudo.filter((mv) => {
    const sim = simulateChessBoardMove(state.board, from, mv, 'Q');
    return !isChessKingInCheck(sim, side);
  });
}

export function getAllLegalMovesForSide(
  state: BoardGameState,
  side: BoardSide
): Array<{ from: BoardCoord; move: LegalBoardMove }> {
  const probeState: BoardGameState = { ...state, turn: side };
  const all: Array<{ from: BoardCoord; move: LegalBoardMove }> = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (getPieceSide(probeState.board[r][c]) === side) {
        const list = getLegalMovesForSquare(probeState, { r, c });
        for (const move of list) {
          all.push({ from: { r, c }, move });
        }
      }
    }
  }
  return all;
}

export function applyBoardMove(
  state: BoardGameState,
  actorUserId: string,
  from: BoardCoord,
  to: BoardCoord,
  promotionPiece: ChessPromotionPiece = 'Q'
):
  | { ok: true; state: BoardGameState; notation: string; finishedNow: boolean }
  | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error:
        state.status === 'waiting'
          ? 'Esperando a que el anfitrión pulse Iniciar Partida.'
          : 'La partida ya ha finalizado.',
    };
  }

  const activeSeat = state.players[state.turn];
  if (!state.soloLocal) {
    if (!activeSeat) {
      return { ok: false, error: 'Falta un jugador sentado en ese turno.' };
    }
    if (!activeSeat.isBot && activeSeat.userId !== actorUserId) {
      return { ok: false, error: 'No es tu turno.' };
    }
  }

  const now = Date.now();
  const { clocksMs, timedOutSide } = withClockTick(state, now);
  if (timedOutSide) {
    const winSide: BoardSide = timedOutSide === 'w' ? 'b' : 'w';
    const nextPlayers = { ...state.players };
    if (nextPlayers[winSide]) {
      nextPlayers[winSide] = { ...nextPlayers[winSide]!, score: nextPlayers[winSide]!.score + 1 };
    }
    return {
      ok: true,
      state: {
        ...state,
        status: 'finished',
        clocksMs,
        turnStartedAt: now,
        players: nextPlayers,
        winner: winSide,
        winReason: 'timeout',
        matchHistory: appendHistoryEntry(state, winSide, 'timeout', nextPlayers),
        updatedAt: now,
      },
      notation: 'Tiempo agotado',
      finishedNow: true,
    };
  }

  const side = state.turn;
  const opp: BoardSide = side === 'w' ? 'b' : 'w';

  if (state.gameType === 'connect4') {
    const dropRow = getConnect4DropRow(state.board, to.c);
    if (dropRow < 0) {
      return { ok: false, error: 'Columna completa.' };
    }
    const nextBoard = cloneBoard(state.board);
    nextBoard[dropRow][to.c] = side;
    const notation = `Col ${to.c + 1}`;
    const won = checkConnect4Win(nextBoard, dropRow, to.c, side);
    const winningLine = won ? findConnect4WinningLine(nextBoard, side) : null;
    const full = !won && nextBoard[0].every((cell) => cell !== null);
    const finishedNow = won || full;
    const nextPlayers = { ...state.players };
    const winner: BoardSide | 'draw' | null = won ? side : full ? 'draw' : null;
    if (won && nextPlayers[side]) {
      nextPlayers[side] = { ...nextPlayers[side]!, score: nextPlayers[side]!.score + 1 };
    }
    return {
      ok: true,
      state: {
        ...state,
        status: finishedNow ? 'finished' : 'playing',
        board: nextBoard,
        turn: opp,
        players: nextPlayers,
        winner,
        winningLine,
        winReason: won ? 'connect4' : full ? 'draw_full' : null,
        clocksMs,
        turnStartedAt: now,
        turnDeadlineAt: finishedNow ? undefined : now + BOARD_TURN_DECISION_MS,
        lastMove: { from: { r: dropRow, c: to.c }, to: { r: dropRow, c: to.c }, notation },
        moveHistory: [...state.moveHistory.slice(-39), notation],
        matchHistory: finishedNow && winner
          ? appendHistoryEntry(state, winner, won ? 'connect4' : 'draw_full', nextPlayers)
          : state.matchHistory,
        updatedAt: now,
      },
      notation,
      finishedNow,
    };
  }

  const legalMoves = getLegalMovesForSquare(state, from);
  const matched = legalMoves.find((m) => m.r === to.r && m.c === to.c);
  if (!matched) {
    return { ok: false, error: 'Movimiento no válido.' };
  }

  const piece = state.board[from.r][from.c]!;

  if (state.gameType === 'checkers') {
    const nextBoard = cloneBoard(state.board);
    nextBoard[from.r][from.c] = null;
    let capturedPiece: string | null = null;

    if (matched.isCapture) {
      const capCoord = (matched as CheckersJumpMove).captureAt;
      if (capCoord) {
        capturedPiece = nextBoard[capCoord.r][capCoord.c];
        nextBoard[capCoord.r][capCoord.c] = null;
      } else {
        const mr = Math.floor((from.r + to.r) / 2);
        const mc = Math.floor((from.c + to.c) / 2);
        capturedPiece = nextBoard[mr][mc];
        nextBoard[mr][mc] = null;
      }
    }

    let placedPiece = piece;
    const promoted =
      (piece === 'w' && to.r === 0) || (piece === 'b' && to.r === 7);
    if (promoted) {
      placedPiece = side === 'w' ? 'W' : 'B';
    }
    nextBoard[to.r][to.c] = placedPiece;

    const chainJumps =
      matched.isCapture && !promoted
        ? getCheckersJumpsFrom(nextBoard, to.r, to.c)
        : [];
    const continueSameTurn = chainJumps.length > 0;
    const nextTurn: BoardSide = continueSameTurn ? side : opp;

    const notation = `${coordLabel(from.r, from.c)}${matched.isCapture ? 'x' : '-'}${coordLabel(
      to.r,
      to.c
    )}${promoted ? ' (Dama)' : ''}`;

    let oppPieces = 0;
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        if (getPieceSide(nextBoard[r][c]) === opp) oppPieces += 1;
      }
    }

    const baseNext: BoardGameState = {
      ...state,
      status: 'playing',
      board: nextBoard,
      turn: nextTurn,
      mustContinueFrom: continueSameTurn ? { r: to.r, c: to.c } : null,
      lastMove: { from, to, notation, captured: capturedPiece, promoted },
      moveHistory: [...state.moveHistory.slice(-39), notation],
      clocksMs,
      turnStartedAt: now,
      turnDeadlineAt: now + BOARD_TURN_DECISION_MS,
      updatedAt: now,
    };

    if (oppPieces === 0) {
      const nextPlayers = { ...baseNext.players };
      if (nextPlayers[side]) {
        nextPlayers[side] = { ...nextPlayers[side]!, score: nextPlayers[side]!.score + 1 };
      }
      return {
        ok: true,
        state: {
          ...baseNext,
          status: 'finished',
          players: nextPlayers,
          winner: side,
          winReason: 'no_pieces',
          matchHistory: appendHistoryEntry(state, side, 'no_pieces', nextPlayers),
        },
        notation,
        finishedNow: true,
      };
    }

    if (!continueSameTurn && getAllLegalMovesForSide(baseNext, opp).length === 0) {
      const nextPlayers = { ...baseNext.players };
      if (nextPlayers[side]) {
        nextPlayers[side] = { ...nextPlayers[side]!, score: nextPlayers[side]!.score + 1 };
      }
      return {
        ok: true,
        state: {
          ...baseNext,
          status: 'finished',
          players: nextPlayers,
          winner: side,
          winReason: 'no_moves',
          matchHistory: appendHistoryEntry(state, side, 'no_moves', nextPlayers),
        },
        notation,
        finishedNow: true,
      };
    }

    return { ok: true, state: baseNext, notation, finishedNow: false };
  }

  const nextBoard = simulateChessBoardMove(state.board, from, matched, promotionPiece);
  const capturedPiece = matched.isEnPassant
    ? state.board[from.r][to.c]
    : state.board[to.r][to.c];

  const nextCastling = { ...state.castlingRights };
  if (piece === 'wK') {
    nextCastling.wK = false;
    nextCastling.wQ = false;
  } else if (piece === 'bK') {
    nextCastling.bK = false;
    nextCastling.bQ = false;
  } else if (piece === 'wR') {
    if (from.r === 7 && from.c === 7) nextCastling.wK = false;
    if (from.r === 7 && from.c === 0) nextCastling.wQ = false;
  } else if (piece === 'bR') {
    if (from.r === 0 && from.c === 7) nextCastling.bK = false;
    if (from.r === 0 && from.c === 0) nextCastling.bQ = false;
  }
  if (to.r === 7 && to.c === 7) nextCastling.wK = false;
  if (to.r === 7 && to.c === 0) nextCastling.wQ = false;
  if (to.r === 0 && to.c === 7) nextCastling.bK = false;
  if (to.r === 0 && to.c === 0) nextCastling.bQ = false;

  const nextEnPassant: BoardCoord | null =
    piece[1] === 'P' && Math.abs(to.r - from.r) === 2
      ? { r: (from.r + to.r) / 2, c: from.c }
      : null;

  const nextHalfmoveClock =
    piece[1] === 'P' || Boolean(capturedPiece) ? 0 : (state.halfmoveClock || 0) + 1;

  const boardSig = nextBoard.map((row) => row.map((cell) => cell || '.').join(',')).join('/');
  const castlingSig = `${nextCastling.wK ? 'K' : ''}${nextCastling.wQ ? 'Q' : ''}${nextCastling.bK ? 'k' : ''}${nextCastling.bQ ? 'q' : ''}`;
  const epSig = nextEnPassant ? `${nextEnPassant.r},${nextEnPassant.c}` : '-';
  const posKey = `${boardSig}|${opp}|${castlingSig}|${epSig}`;
  const prevCounts = state.positionCounts || {};
  const nextPosCount = (prevCounts[posKey] || 0) + 1;
  const nextPositionCounts: Record<string, number> = {
    ...prevCounts,
    [posKey]: nextPosCount,
  };

  const minors: Array<{ kind: string; color: 'l' | 'd' }> = [];
  let hasMajorOrPawn = false;
  for (let rr = 0; rr < 8 && !hasMajorOrPawn; rr += 1) {
    for (let cc = 0; cc < 8; cc += 1) {
      const p = nextBoard[rr][cc];
      if (!p || p[1] === 'K') continue;
      if (p[1] === 'P' || p[1] === 'R' || p[1] === 'Q') {
        hasMajorOrPawn = true;
        break;
      }
      minors.push({ kind: p, color: (rr + cc) % 2 === 0 ? 'l' : 'd' });
    }
  }
  const insufficientMaterial =
    !hasMajorOrPawn &&
    (minors.length === 0 ||
      minors.length === 1 ||
      (minors.length === 2 &&
        minors[0].kind[1] === 'B' &&
        minors[1].kind[1] === 'B' &&
        minors[0].kind[0] !== minors[1].kind[0] &&
        minors[0].color === minors[1].color));

  const oppInCheck = isChessKingInCheck(nextBoard, opp);
  const baseChessNext: BoardGameState = {
    ...state,
    status: 'playing',
    board: nextBoard,
    turn: opp,
    castlingRights: nextCastling,
    enPassant: nextEnPassant,
    mustContinueFrom: null,
    halfmoveClock: nextHalfmoveClock,
    positionCounts: nextPositionCounts,
    inCheck: oppInCheck ? opp : null,
    lastMove: { from, to, notation: '', captured: capturedPiece },
    moveHistory: state.moveHistory,
    clocksMs,
    turnStartedAt: now,
    turnDeadlineAt: now + BOARD_TURN_DECISION_MS,
    updatedAt: now,
  };

  const oppLegal = getAllLegalMovesForSide(baseChessNext, opp);
  const noMovesDraw = oppLegal.length === 0 && !oppInCheck;
  const checkmateWin = oppLegal.length === 0 && oppInCheck;
  const isFiftyMovesDraw = !checkmateWin && nextHalfmoveClock >= 100;
  const isThreefoldDraw = !checkmateWin && nextPosCount >= 3;
  const finishedNow =
    checkmateWin || noMovesDraw || insufficientMaterial || isFiftyMovesDraw || isThreefoldDraw;

  const winner: BoardSide | 'draw' | null = checkmateWin
    ? side
    : finishedNow
    ? 'draw'
    : null;
  const winReason: BoardGameState['winReason'] = checkmateWin
    ? 'checkmate'
    : noMovesDraw
    ? 'stalemate'
    : isThreefoldDraw
    ? 'threefold_repetition'
    : isFiftyMovesDraw
    ? 'fifty_moves'
    : insufficientMaterial
    ? 'insufficient_material'
    : null;

  const piecePrefix = piece[1] === 'P' ? '' : piece[1];
  let notation = matched.isCastle === 'K'
    ? 'O-O'
    : matched.isCastle === 'Q'
    ? 'O-O-O'
    : `${piecePrefix}${matched.isCapture ? (piece[1] === 'P' ? coordLabel(from.r, from.c)[0] : '') + 'x' : ''}${coordLabel(
        to.r,
        to.c
      )}${matched.isPromotion ? `=${promotionPiece}` : ''}`;
  if (checkmateWin) notation += '#';
  else if (oppInCheck) notation += '+';

  const nextPlayers = { ...baseChessNext.players };
  if (winner === side && nextPlayers[side]) {
    nextPlayers[side] = { ...nextPlayers[side]!, score: nextPlayers[side]!.score + 1 };
  }

  return {
    ok: true,
    state: {
      ...baseChessNext,
      status: finishedNow ? 'finished' : 'playing',
      turnDeadlineAt: finishedNow ? undefined : now + BOARD_TURN_DECISION_MS,
      winner,
      winReason,
      players: nextPlayers,
      lastMove: { from, to, notation, captured: capturedPiece },
      moveHistory: [...state.moveHistory.slice(-39), notation],
      matchHistory: finishedNow && winner
        ? appendHistoryEntry(state, winner, winReason, nextPlayers)
        : state.matchHistory,
    },
    notation,
    finishedNow,
  };
}

export function chooseAutoBoardMove(state: BoardGameState): {
  from: BoardCoord;
  to: BoardCoord;
} | null {
  if (state.status !== 'playing') return null;
  if (state.gameType === 'connect4') {
    const validCols = [3, 2, 4, 1, 5, 0, 6].filter((c) => getConnect4DropRow(state.board, c) >= 0);
    if (validCols.length === 0) return null;
    for (const col of validCols) {
      const row = getConnect4DropRow(state.board, col);
      const sim = cloneBoard(state.board);
      sim[row][col] = state.turn;
      if (checkConnect4Win(sim, row, col, state.turn)) {
        return { from: { r: 0, c: col }, to: { r: row, c: col } };
      }
    }
    const col = validCols[Math.random() < 0.5 ? 0 : Math.floor(Math.random() * validCols.length)];
    const row = getConnect4DropRow(state.board, col);
    return { from: { r: 0, c: col }, to: { r: row, c: col } };
  }

  const all = getAllLegalMovesForSide(state, state.turn);
  if (all.length === 0) return null;
  const captures = all.filter((m) => m.move.isCapture || m.move.isPromotion);
  const pickList = captures.length > 0 ? captures : all;
  const chosen = pickList[Math.floor(Math.random() * pickList.length)];
  return { from: chosen.from, to: { r: chosen.move.r, c: chosen.move.c } };
}
