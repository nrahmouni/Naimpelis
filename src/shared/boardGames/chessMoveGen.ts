import {
  cloneBoard,
  getPieceSide,
  inBounds,
  type BoardCoord,
  type BoardGameState,
  type BoardSide,
  type ChessPromotionPiece,
  type LegalBoardMove,
} from './types.ts';

export function isSquareAttacked(
  board: (string | null)[][],
  targetR: number,
  targetC: number,
  bySide: BoardSide
): boolean {
  const pawnDir = bySide === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = targetR + pawnDir;
    const pc = targetC + dc;
    if (inBounds(pr, pc) && board[pr][pc] === `${bySide}P`) {
      return true;
    }
  }

  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const nr = targetR + dr;
    const nc = targetC + dc;
    if (inBounds(nr, nc) && board[nr][nc] === `${bySide}N`) {
      return true;
    }
  }

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const kr = targetR + dr;
      const kc = targetC + dc;
      if (inBounds(kr, kc) && board[kr][kc] === `${bySide}K`) {
        return true;
      }
    }
  }

  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let r = targetR + dr;
    let c = targetC + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p === `${bySide}R` || p === `${bySide}Q`) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let r = targetR + dr;
    let c = targetC + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p === `${bySide}B` || p === `${bySide}Q`) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

export function isChessKingInCheck(board: (string | null)[][], side: BoardSide): boolean {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (board[r][c] === `${side}K`) {
        return isSquareAttacked(board, r, c, side === 'w' ? 'b' : 'w');
      }
    }
  }
  return false;
}

export function getPseudoChessMoves(
  state: BoardGameState,
  r: number,
  c: number
): LegalBoardMove[] {
  const piece = state.board[r]?.[c];
  const side = getPieceSide(piece);
  if (!piece || !side) return [];

  const kind = piece[1];
  const moves: LegalBoardMove[] = [];
  const opp: BoardSide = side === 'w' ? 'b' : 'w';

  if (kind === 'P') {
    const dir = side === 'w' ? -1 : 1;
    const startRow = side === 'w' ? 6 : 1;
    const promoRow = side === 'w' ? 0 : 7;

    if (inBounds(r + dir, c) && !state.board[r + dir][c]) {
      moves.push({
        r: r + dir,
        c,
        isPromotion: r + dir === promoRow,
      });
      if (r === startRow && inBounds(r + dir * 2, c) && !state.board[r + dir * 2][c]) {
        moves.push({ r: r + dir * 2, c });
      }
    }

    for (const dc of [-1, 1]) {
      const tr = r + dir;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const target = state.board[tr][tc];
      if (target && getPieceSide(target) === opp) {
        moves.push({
          r: tr,
          c: tc,
          isCapture: true,
          isPromotion: tr === promoRow,
        });
      } else if (
        state.enPassant &&
        state.enPassant.r === tr &&
        state.enPassant.c === tc &&
        state.board[r][tc] === `${opp}P`
      ) {
        moves.push({
          r: tr,
          c: tc,
          isCapture: true,
          isEnPassant: true,
        });
      }
    }
    return moves;
  }

  if (kind === 'N') {
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of offsets) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const target = state.board[tr][tc];
      if (!target || getPieceSide(target) === opp) {
        moves.push({ r: tr, c: tc, isCapture: Boolean(target) });
      }
    }
    return moves;
  }

  if (kind === 'B' || kind === 'R' || kind === 'Q') {
    const dirs: Array<[number, number]> = [];
    if (kind === 'R' || kind === 'Q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    if (kind === 'B' || kind === 'Q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    for (const [dr, dc] of dirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const target = state.board[tr][tc];
        if (!target) {
          moves.push({ r: tr, c: tc });
        } else {
          if (getPieceSide(target) === opp) {
            moves.push({ r: tr, c: tc, isCapture: true });
          }
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
    return moves;
  }

  if (kind === 'K') {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = state.board[tr][tc];
        if (!target || getPieceSide(target) === opp) {
          moves.push({ r: tr, c: tc, isCapture: Boolean(target) });
        }
      }
    }

    const homeRow = side === 'w' ? 7 : 0;
    if (r === homeRow && c === 4 && !isSquareAttacked(state.board, homeRow, 4, opp)) {
      const canK = side === 'w' ? state.castlingRights.wK : state.castlingRights.bK;
      const canQ = side === 'w' ? state.castlingRights.wQ : state.castlingRights.bQ;

      if (
        canK &&
        state.board[homeRow][7] === `${side}R` &&
        !state.board[homeRow][5] &&
        !state.board[homeRow][6] &&
        !isSquareAttacked(state.board, homeRow, 5, opp) &&
        !isSquareAttacked(state.board, homeRow, 6, opp)
      ) {
        moves.push({ r: homeRow, c: 6, isCastle: 'K' });
      }
      if (
        canQ &&
        state.board[homeRow][0] === `${side}R` &&
        !state.board[homeRow][1] &&
        !state.board[homeRow][2] &&
        !state.board[homeRow][3] &&
        !isSquareAttacked(state.board, homeRow, 3, opp) &&
        !isSquareAttacked(state.board, homeRow, 2, opp)
      ) {
        moves.push({ r: homeRow, c: 2, isCastle: 'Q' });
      }
    }
    return moves;
  }

  return moves;
}

export function simulateChessBoardMove(
  board: (string | null)[][],
  from: BoardCoord,
  move: LegalBoardMove,
  promotionPiece: ChessPromotionPiece = 'Q'
): (string | null)[][] {
  const next = cloneBoard(board);
  const piece = next[from.r][from.c]!;
  const side = getPieceSide(piece)!;
  next[from.r][from.c] = null;

  if (move.isEnPassant) {
    next[from.r][move.c] = null;
  }
  if (move.isCastle === 'K') {
    next[from.r][5] = next[from.r][7];
    next[from.r][7] = null;
  } else if (move.isCastle === 'Q') {
    next[from.r][3] = next[from.r][0];
    next[from.r][0] = null;
  }

  if (move.isPromotion) {
    next[move.r][move.c] = `${side}${promotionPiece}`;
  } else {
    next[move.r][move.c] = piece;
  }
  return next;
}
