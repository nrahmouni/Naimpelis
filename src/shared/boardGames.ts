/**
 * NAIM CINE — Server-Authoritative Multiplayer Board Game Engine
 * Supports full Checkers (Damas) and Chess (Ajedrez) rules, shared cleanly
 * between server WebSocket validation and client optimistic rendering.
 */

export type BoardGameType = 'checkers' | 'chess' | 'connect4';
export type BoardSide = 'w' | 'b';
export type ChessPromotionPiece = 'Q' | 'R' | 'B' | 'N';
export type BoardClockMinutes = 0 | 3 | 5 | 10;
export const BOARD_TURN_DECISION_MS = 15_000;

export interface BoardCoord {
  r: number;
  c: number;
}

export interface LegalBoardMove {
  r: number;
  c: number;
  isCapture?: boolean;
  isCastle?: 'K' | 'Q';
  isEnPassant?: boolean;
  isPromotion?: boolean;
}

export interface BoardPlayerSeat {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  score: number;
  isBot?: boolean;
}

export interface BoardGameState {
  id: string;
  gameType: BoardGameType;
  status: 'waiting' | 'playing' | 'finished';
  board: (string | null)[][];
  turn: BoardSide;
  players: {
    w: BoardPlayerSeat | null;
    b: BoardPlayerSeat | null;
  };
  winner: BoardSide | 'draw' | null;
  winReason?:
    | 'checkmate'
    | 'stalemate'
    | 'threefold_repetition'
    | 'fifty_moves'
    | 'insufficient_material'
    | 'no_pieces'
    | 'no_moves'
    | 'resign'
    | 'connect4'
    | 'draw_full'
    | 'timeout'
    | null;
  inCheck: BoardSide | null;
  winningLine?: BoardCoord[] | null;
  lastMove: {
    from: BoardCoord;
    to: BoardCoord;
    notation: string;
    captured?: string | null;
    promoted?: boolean;
  } | null;
  moveHistory: string[];
  castlingRights: {
    wK: boolean;
    wQ: boolean;
    bK: boolean;
    bQ: boolean;
  };
  enPassant: BoardCoord | null;
  mustContinueFrom: BoardCoord | null;
  halfmoveClock?: number;
  positionCounts?: Record<string, number>;
  soloLocal: boolean;
  awaitingHostStart?: boolean;
  clockMinutes?: BoardClockMinutes;
  clocksMs?: { w: number; b: number };
  turnStartedAt?: number;
  turnDeadlineAt?: number;
  matchHistory?: Array<{
    id: string;
    gameType: BoardGameType;
    winnerName: string;
    winnerSide: BoardSide | 'draw';
    reason?: string | null;
    endedAt: number;
  }>;
  updatedAt: number;
}

export interface BoardParticipantInput {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

function cloneBoard(board: (string | null)[][]): (string | null)[][] {
  return board.map((row) => [...row]);
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function coordLabel(r: number, c: number): string {
  const files = 'abcdefgh';
  return `${files[c] || '?'}${8 - r}`;
}

export function getPieceSide(piece: string | null): BoardSide | null {
  if (!piece) return null;
  if (piece === 'w' || piece === 'W' || piece.startsWith('w')) return 'w';
  if (piece === 'b' || piece === 'B' || piece.startsWith('b')) return 'b';
  return null;
}

export function createInitialCheckersBoard(): (string | null)[][] {
  const board: (string | null)[][] = Array.from({ length: 8 }, () =>
    Array<string | null>(8).fill(null)
  );
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if ((r + c) % 2 === 1) {
        if (r < 3) board[r][c] = 'b';
        else if (r > 4) board[r][c] = 'w';
      }
    }
  }
  return board;
}

export function createInitialChessBoard(): (string | null)[][] {
  return [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
  ];
}

export function createInitialConnect4Board(): (string | null)[][] {
  return Array.from({ length: 6 }, () => Array<string | null>(7).fill(null));
}

export function createInitialBoardGameState(
  gameType: BoardGameType,
  starter?: BoardParticipantInput,
  soloLocal = false,
  existingScores?: { w?: number; b?: number },
  clockMinutes: BoardClockMinutes = 0,
  existingMatchHistory: BoardGameState['matchHistory'] = [],
  waitForHost = false
): BoardGameState {
  const starterSeat: BoardPlayerSeat | null = starter
    ? {
        userId: starter.id,
        name: starter.name,
        avatar: starter.avatar || '🎮',
        color: starter.color || '#9146FF',
        score: existingScores?.w ?? 0,
      }
    : null;

  const now = Date.now();
  const initialClockMs = clockMinutes > 0 ? clockMinutes * 60 * 1000 : 0;
  const startImmediately = soloLocal && !waitForHost;

  return {
    id: `game-${now}-${Math.random().toString(36).slice(2, 6)}`,
    gameType,
    status: startImmediately ? 'playing' : 'waiting',
    board:
      gameType === 'chess'
        ? createInitialChessBoard()
        : gameType === 'connect4'
          ? createInitialConnect4Board()
          : createInitialCheckersBoard(),
    turn: 'w',
    players: {
      w: starterSeat,
      b: soloLocal && starterSeat ? { ...starterSeat, score: existingScores?.b ?? 0 } : null,
    },
    winner: null,
    winReason: null,
    inCheck: null,
    lastMove: null,
    moveHistory: [],
    castlingRights: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    mustContinueFrom: null,
    soloLocal,
    awaitingHostStart: waitForHost,
    ...(clockMinutes > 0
      ? {
          clockMinutes,
          clocksMs: { w: initialClockMs, b: initialClockMs },
          turnStartedAt: now,
        }
      : {}),
    ...(startImmediately ? { turnDeadlineAt: now + BOARD_TURN_DECISION_MS } : {}),
    matchHistory: existingMatchHistory.slice(-15),
    updatedAt: now,
  };
}

// ============================================================================
// CHECKERS (DAMAS ESPAÑOLAS OFICIALES: Vuelo Largo + Ley de la Cantidad)
// ============================================================================

type CheckersJumpMove = LegalBoardMove & {
  captureAt: BoardCoord;
};

function getCheckersJumpsFrom(
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
    // Peón español: avanza y captura solo 1 salto en diagonal hacia delante
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

  // Dama / Reina española (Vuelo Largo): salta 1 pieza rival en cualquier diagonal y cae en cualquier casilla libre detrás
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
        if (getPieceSide(cell) === side) break; // Blocked by own piece
        enemyCoord = { r: nr, c: nc };
      } else {
        if (cell !== null) break; // Second piece along diagonal blocks landing further
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

function getCheckersSimpleMovesFrom(
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

  // Dama española (Vuelo Largo): recorre cualquier número de casillas libres en las 4 diagonales
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

function maxCheckersCaptureChain(
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

function getBestCaptureCountForSide(board: (string | null)[][], side: BoardSide): number {
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

// ============================================================================
// CHESS (AJEDREZ) RULES
// ============================================================================

function isSquareAttacked(
  board: (string | null)[][],
  targetR: number,
  targetC: number,
  bySide: BoardSide
): boolean {
  // Pawn attacks
  const pawnDir = bySide === 'w' ? 1 : -1; // Reverse direction from target square
  for (const dc of [-1, 1]) {
    const pr = targetR + pawnDir;
    const pc = targetC + dc;
    if (inBounds(pr, pc) && board[pr][pc] === `${bySide}P`) {
      return true;
    }
  }

  // Knight attacks
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

  // King attacks
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

  // Rook / Queen orthogonal rays
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

  // Bishop / Queen diagonal rays
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

function getPseudoChessMoves(
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

    // Castling
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

function simulateChessBoardMove(
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
      // Ley de la Cantidad (Damas Españolas): solo son legales los saltos que alcanzan el máximo número de capturas posible
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

  // Chess: filter out moves leaving own king in check
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

export function joinGameSeat(
  state: BoardGameState,
  user: BoardParticipantInput,
  side: 'w' | 'b' | 'spectate'
): BoardGameState {
  const nextPlayers = {
    w: state.players.w ? { ...state.players.w } : null,
    b: state.players.b ? { ...state.players.b } : null,
  };

  if (side === 'spectate') {
    if (nextPlayers.w?.userId === user.id) nextPlayers.w = null;
    if (nextPlayers.b?.userId === user.id) nextPlayers.b = null;
  } else {
    const prevScore =
      (nextPlayers[side]?.userId === user.id ? nextPlayers[side]?.score : 0) || 0;
    const otherSide: BoardSide = side === 'w' ? 'b' : 'w';
    if (!state.soloLocal && nextPlayers[otherSide]?.userId === user.id) {
      nextPlayers[otherSide] = null;
    }
    nextPlayers[side] = {
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '🎮',
      color: user.color || '#9146FF',
      score: prevScore,
    };
  }

  const bothSeated = Boolean(nextPlayers.w && nextPlayers.b);
  const nextSolo =
    Boolean(nextPlayers.w && nextPlayers.b && nextPlayers.w.userId === nextPlayers.b.userId) ||
    (state.soloLocal && !(nextPlayers.w && nextPlayers.b && nextPlayers.w.userId !== nextPlayers.b.userId));

  const now = Date.now();
  const nextStatus =
    state.status === 'finished'
      ? 'finished'
      : state.awaitingHostStart && state.status === 'waiting'
      ? 'waiting'
      : bothSeated || nextSolo
      ? 'playing'
      : 'waiting';

  return {
    ...state,
    players: nextPlayers,
    soloLocal: nextSolo,
    status: nextStatus,
    turnStartedAt: nextStatus === 'playing' && state.status !== 'playing' ? now : state.turnStartedAt,
    turnDeadlineAt:
      nextStatus === 'playing'
        ? state.turnDeadlineAt || now + BOARD_TURN_DECISION_MS
        : undefined,
    updatedAt: now,
  };
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

function checkConnect4Win(board: (string | null)[][], r: number, c: number, side: BoardSide): boolean {
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

function withClockTick(state: BoardGameState, now: number): {
  clocksMs?: { w: number; b: number };
  timedOutSide?: BoardSide;
} {
  if (!state.clockMinutes || !state.clocksMs || !state.turnStartedAt || state.status !== 'playing') {
    return { clocksMs: state.clocksMs };
  }
  const elapsed = Math.max(0, now - state.turnStartedAt);
  const nextClocks = {
    w: state.clocksMs.w,
    b: state.clocksMs.b,
  };
  nextClocks[state.turn] = Math.max(0, nextClocks[state.turn] - elapsed);
  return {
    clocksMs: nextClocks,
    timedOutSide: nextClocks[state.turn] <= 0 ? state.turn : undefined,
  };
}

function appendHistoryEntry(
  state: BoardGameState,
  winner: BoardSide | 'draw',
  reason: BoardGameState['winReason'],
  players: BoardGameState['players']
) {
  const winnerName =
    winner === 'draw'
      ? 'Empate'
      : players[winner]?.name || (winner === 'w' ? 'Jugador 1' : 'Jugador 2');
  return [
    ...(state.matchHistory || []).slice(-14),
    {
      id: `mh-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      gameType: state.gameType,
      winnerName,
      winnerSide: winner,
      reason: reason || null,
      endedAt: Date.now(),
    },
  ];
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

    // Multi-jump chain continuation (stops if freshly promoted to Dama or no further jumps)
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

    // Check win conditions for opponent
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

  // CHESS MOVE APPLICATION (Leyes Oficiales de la FIDE)
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

  // FIDE 50-move clock: reset on pawn move or any capture
  const nextHalfmoveClock =
    piece[1] === 'P' || Boolean(capturedPiece) ? 0 : (state.halfmoveClock || 0) + 1;

  // FIDE Threefold repetition tracking key (board + turn + castling + ep)
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

  // FIDE Insufficient material check
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

export function resignBoardGame(
  state: BoardGameState,
  userId: string
): BoardGameState | null {
  if (state.status === 'finished') return null;
  let resignSide: BoardSide | null = null;
  if (state.players.w?.userId === userId && state.players.b?.userId !== userId) {
    resignSide = 'w';
  } else if (state.players.b?.userId === userId && state.players.w?.userId !== userId) {
    resignSide = 'b';
  } else if (state.players.w?.userId === userId && state.players.b?.userId === userId) {
    resignSide = state.turn;
  }
  if (!resignSide) return null;

  const winner: BoardSide = resignSide === 'w' ? 'b' : 'w';
  const nextPlayers = { ...state.players };
  if (nextPlayers[winner]) {
    nextPlayers[winner] = { ...nextPlayers[winner]!, score: nextPlayers[winner]!.score + 1 };
  }
  return {
    ...state,
    status: 'finished',
    players: nextPlayers,
    winner,
    winReason: 'resign',
    matchHistory: appendHistoryEntry(state, winner, 'resign', nextPlayers),
    updatedAt: Date.now(),
  };
}

export function resetBoardGame(
  state: BoardGameState,
  opts?: { gameType?: BoardGameType; swapColors?: boolean; clockMinutes?: BoardClockMinutes }
): BoardGameState {
  const nextType = opts?.gameType || state.gameType;
  const clockMinutes = opts?.clockMinutes ?? state.clockMinutes ?? 0;
  const fresh = createInitialBoardGameState(
    nextType,
    undefined,
    state.soloLocal,
    undefined,
    clockMinutes,
    state.matchHistory || []
  );
  const wSeat = opts?.swapColors ? state.players.b : state.players.w;
  const bSeat = opts?.swapColors ? state.players.w : state.players.b;

  const nextPlayers = {
    w: wSeat ? { ...wSeat } : null,
    b: bSeat ? { ...bSeat } : null,
  };
  const bothSeated = Boolean(nextPlayers.w && nextPlayers.b);

  const now = Date.now();
  const nextStatus = bothSeated || state.soloLocal ? 'playing' : 'waiting';

  return {
    ...fresh,
    players: nextPlayers,
    awaitingHostStart: false,
    status: nextStatus,
    turnStartedAt: now,
    turnDeadlineAt: nextStatus === 'playing' ? now + BOARD_TURN_DECISION_MS : undefined,
    updatedAt: now,
  };
}

export function startBoardMatch(state: BoardGameState): BoardGameState {
  if (state.status === 'playing') return state;
  const now = Date.now();
  const nextPlayers = {
    w: state.players.w
      ? { ...state.players.w }
      : {
          userId: 'bot-board-w',
          name: 'Bot NAIM IA',
          avatar: '🤖',
          color: '#9146FF',
          score: 0,
          isBot: true,
        },
    b: state.players.b
      ? { ...state.players.b }
      : {
          userId: 'bot-board-b',
          name: 'Bot NAIM IA',
          avatar: '🤖',
          color: '#E11D48',
          score: 0,
          isBot: true,
        },
  };
  return {
    ...state,
    players: nextPlayers,
    awaitingHostStart: false,
    status: 'playing',
    turnStartedAt: now,
    turnDeadlineAt: now + BOARD_TURN_DECISION_MS,
    updatedAt: now,
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
    // Prefer an immediate winning column if one exists
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
