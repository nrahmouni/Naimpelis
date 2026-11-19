import {
  cloneBoard,
  getPieceSide,
  inBounds,
  type BoardCoord,
  type BoardSide,
  type LegalBoardMove,
} from './types.ts';

export type CheckersJumpMove = LegalBoardMove & {
  captureAt: BoardCoord;
};

export function getCheckersJumpsFrom(
  board: (string | null)[][],
  r: number,
  c: number
): CheckersJumpMove[] {
  const piece = board[r]?.[c];
  const side = getPieceSide(piece);
  if (!piece || !side) return [];

  const isKing = piece === 'W' || piece === 'B';
  const jumps: CheckersJumpMove[] = [];

  if (!isKing) {
    const rowDirs = side === 'w' ? [-1] : [1];
    for (const dr of rowDirs) {
      for (const dc of [-1, 1]) {
        const mr = r + dr;
        const mc = c + dc;
        const tr = r + dr * 2;
        const tc = c + dc * 2;
        if (!inBounds(tr, tc)) continue;
        const midPiece = board[mr][mc];
        const midSide = getPieceSide(midPiece);
        if (midSide && midSide !== side && board[tr][tc] === null) {
          jumps.push({
            r: tr,
            c: tc,
            isCapture: true,
            isPromotion: (side === 'w' && tr === 0) || (side === 'b' && tr === 7),
            captureAt: { r: mr, c: mc },
          });
        }
      }
    }
    return jumps;
  }

  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let nr = r + dr;
    let nc = c + dc;
    let enemyCoord: BoardCoord | null = null;
    while (inBounds(nr, nc)) {
      const cell = board[nr][nc];
      if (!enemyCoord) {
        if (!cell) {
          nr += dr;
          nc += dc;
          continue;
        }
        if (getPieceSide(cell) === side) break;
        enemyCoord = { r: nr, c: nc };
      } else {
        if (cell !== null) break;
        jumps.push({
          r: nr,
          c: nc,
          isCapture: true,
          isPromotion: false,
          captureAt: enemyCoord,
        });
      }
      nr += dr;
      nc += dc;
    }
  }
  return jumps;
}

export function getCheckersSimpleMovesFrom(
  board: (string | null)[][],
  r: number,
  c: number
): LegalBoardMove[] {
  const piece = board[r]?.[c];
  const side = getPieceSide(piece);
  if (!piece || !side) return [];

  const isKing = piece === 'W' || piece === 'B';
  const moves: LegalBoardMove[] = [];

  if (!isKing) {
    const rowDirs = side === 'w' ? [-1] : [1];
    for (const dr of rowDirs) {
      for (const dc of [-1, 1]) {
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc) || board[tr][tc] !== null) continue;
        moves.push({
          r: tr,
          c: tc,
          isCapture: false,
          isPromotion: (side === 'w' && tr === 0) || (side === 'b' && tr === 7),
        });
      }
    }
    return moves;
  }

  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let tr = r + dr;
    let tc = c + dc;
    while (inBounds(tr, tc) && board[tr][tc] === null) {
      moves.push({ r: tr, c: tc, isCapture: false, isPromotion: false });
      tr += dr;
      tc += dc;
    }
  }
  return moves;
}

export function maxCheckersCaptureChain(
  board: (string | null)[][],
  r: number,
  c: number,
  side: BoardSide
): number {
  const jumps = getCheckersJumpsFrom(board, r, c);
  if (jumps.length === 0) return 0;

  let best = 0;
  for (const j of jumps) {
    const sim = cloneBoard(board);
    const piece = sim[r][c]!;
    sim[r][c] = null;
    sim[j.captureAt.r][j.captureAt.c] = null;
    if (j.isPromotion) {
      sim[j.r][j.c] = side === 'w' ? 'W' : 'B';
      best = Math.max(best, 1);
    } else {
      sim[j.r][j.c] = piece;
      best = Math.max(best, 1 + maxCheckersCaptureChain(sim, j.r, j.c, side));
    }
  }
  return best;
}

export function getBestCaptureCountForSide(board: (string | null)[][], side: BoardSide): number {
  let maxCap = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (getPieceSide(board[r][c]) === side) {
        const cap = maxCheckersCaptureChain(board, r, c, side);
        if (cap > maxCap) maxCap = cap;
      }
    }
  }
  return maxCap;
}

export function getConnect4DropRow(board: (string | null)[][], col: number): number {
  if (col < 0 || col >= 7) return -1;
  for (let r = 5; r >= 0; r -= 1) {
    if (!board[r]?.[col]) return r;
  }
  return -1;
}

export function findConnect4WinningLine(
  board: (string | null)[][],
  side: BoardSide
): BoardCoord[] | null {
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      if (board[r]?.[c] !== side) continue;
      for (const [dr, dc] of dirs) {
        const line: BoardCoord[] = [{ r, c }];
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr]?.[nc] === side) {
          line.push({ r: nr, c: nc });
          nr += dr;
          nc += dc;
        }
        if (line.length >= 4) {
          return line;
        }
      }
    }
  }
  return null;
}

export function checkConnect4Win(
  board: (string | null)[][],
  r: number,
  c: number,
  side: BoardSide
): boolean {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let nr = r + dr * sign;
      let nc = c + dc * sign;
      while (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr][nc] === side) {
        count += 1;
        nr += dr * sign;
        nc += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}
