/**
 * NAIM CINE — Server-Authoritative Multiplayer Board Game Engine
 * Supports full Checkers (Damas) and Chess (Ajedrez) rules, shared cleanly
 * between server WebSocket validation and client optimistic rendering.
 */

export type BoardGameType = 'checkers' | 'chess';
export type BoardSide = 'w' | 'b';
export type ChessPromotionPiece = 'Q' | 'R' | 'B' | 'N';

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
  winReason?: 'checkmate' | 'stalemate' | 'no_pieces' | 'no_moves' | 'resign' | null;
  inCheck: BoardSide | null;
  lastMove: {
    from: BoardCoord;
    to: BoardCoord;
    notation: string;
    captured?: string | null;
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
  soloLocal: boolean;
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

export function createInitialBoardGameState(
  gameType: BoardGameType,
  starter?: BoardParticipantInput,
  soloLocal = false,
  existingScores?: { w?: number; b?: number }
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

  return {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    gameType,
    status: soloLocal ? 'playing' : 'waiting',
    board:
      gameType === 'chess' ? createInitialChessBoard() : createInitialCheckersBoard(),
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
    updatedAt: Date.now(),
  };
}

// ============================================================================
// CHECKERS (DAMAS) RULES
// ============================================================================

function getCheckersJumpsFrom(
  board: (string | null)[][],
  r: number,
  c: number
): LegalBoardMove[] {
  const piece = board[r]?.[c];
  const side = getPieceSide(piece);
  if (!piece || !side) return [];

  const isKing = piece === 'W' || piece === 'B';
  const rowDirs = isKing ? [-1, 1] : side === 'w' ? [-1] : [1];
  const jumps: LegalBoardMove[] = [];

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
          isPromotion: !isKing && ((side === 'w' && tr === 0) || (side === 'b' && tr === 7)),
        });
      }
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
  const rowDirs = isKing ? [-1, 1] : side === 'w' ? [-1] : [1];
  const moves: LegalBoardMove[] = [];

  for (const dr of rowDirs) {
    for (const dc of [-1, 1]) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc) || board[tr][tc] !== null) continue;
      moves.push({
        r: tr,
        c: tc,
        isCapture: false,
        isPromotion: !isKing && ((side === 'w' && tr === 0) || (side === 'b' && tr === 7)),
      });
    }
  }
  return moves;
}

function sideHasAnyCheckersJump(board: (string | null)[][], side: BoardSide): boolean {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (getPieceSide(board[r][c]) === side && getCheckersJumpsFrom(board, r, c).length > 0) {
        return true;
      }
    }
  }
  return false;
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
    const mustJump = sideHasAnyCheckersJump(state.board, side);
    if (mustJump) {
      return getCheckersJumpsFrom(state.board, from.r, from.c);
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

  return {
    ...state,
    players: nextPlayers,
    soloLocal: nextSolo,
    status:
      state.status === 'finished'
        ? 'finished'
        : bothSeated || nextSolo
        ? 'playing'
        : 'waiting',
    updatedAt: Date.now(),
  };
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
  if (state.status === 'finished') {
    return { ok: false, error: 'La partida ya ha finalizado.' };
  }

  const activeSeat = state.players[state.turn];
  if (!state.soloLocal) {
    if (!activeSeat) {
      return { ok: false, error: 'Falta un jugador sentado en ese turno.' };
    }
    if (activeSeat.userId !== actorUserId) {
      return { ok: false, error: 'No es tu turno.' };
    }
  }

  const legalMoves = getLegalMovesForSquare(state, from);
  const matched = legalMoves.find((m) => m.r === to.r && m.c === to.c);
  if (!matched) {
    return { ok: false, error: 'Movimiento no válido.' };
  }

  const side = state.turn;
  const opp: BoardSide = side === 'w' ? 'b' : 'w';
  const piece = state.board[from.r][from.c]!;

  if (state.gameType === 'checkers') {
    const nextBoard = cloneBoard(state.board);
    nextBoard[from.r][from.c] = null;
    let capturedPiece: string | null = null;

    if (matched.isCapture) {
      const mr = (from.r + to.r) / 2;
      const mc = (from.c + to.c) / 2;
      capturedPiece = nextBoard[mr][mc];
      nextBoard[mr][mc] = null;
    }

    let placedPiece = piece;
    const promoted =
      (piece === 'w' && to.r === 0) || (piece === 'b' && to.r === 7);
    if (promoted) {
      placedPiece = side === 'w' ? 'W' : 'B';
    }
    nextBoard[to.r][to.c] = placedPiece;

    // Multi-jump chain continuation (stops if freshly promoted to king or no further jumps)
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
      lastMove: { from, to, notation, captured: capturedPiece },
      moveHistory: [...state.moveHistory.slice(-39), notation],
      updatedAt: Date.now(),
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
        },
        notation,
        finishedNow: true,
      };
    }

    return { ok: true, state: baseNext, notation, finishedNow: false };
  }

  // CHESS MOVE APPLICATION
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

  const oppInCheck = isChessKingInCheck(nextBoard, opp);
  const baseChessNext: BoardGameState = {
    ...state,
    status: 'playing',
    board: nextBoard,
    turn: opp,
    castlingRights: nextCastling,
    enPassant: nextEnPassant,
    mustContinueFrom: null,
    inCheck: oppInCheck ? opp : null,
    lastMove: { from, to, notation: '', captured: capturedPiece },
    moveHistory: state.moveHistory,
    updatedAt: Date.now(),
  };

  const oppLegal = getAllLegalMovesForSide(baseChessNext, opp);
  const finishedNow = oppLegal.length === 0;
  const winner: BoardSide | 'draw' | null = finishedNow
    ? oppInCheck
      ? side
      : 'draw'
    : null;
  const winReason = finishedNow ? (oppInCheck ? 'checkmate' : 'stalemate') : null;

  const piecePrefix = piece[1] === 'P' ? '' : piece[1];
  let notation = matched.isCastle === 'K'
    ? 'O-O'
    : matched.isCastle === 'Q'
    ? 'O-O-O'
    : `${piecePrefix}${matched.isCapture ? (piece[1] === 'P' ? coordLabel(from.r, from.c)[0] : '') + 'x' : ''}${coordLabel(
        to.r,
        to.c
      )}${matched.isPromotion ? `=${promotionPiece}` : ''}`;
  if (finishedNow && oppInCheck) notation += '#';
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
      winner,
      winReason,
      players: nextPlayers,
      lastMove: { from, to, notation, captured: capturedPiece },
      moveHistory: [...state.moveHistory.slice(-39), notation],
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
    updatedAt: Date.now(),
  };
}

export function resetBoardGame(
  state: BoardGameState,
  opts?: { gameType?: BoardGameType; swapColors?: boolean }
): BoardGameState {
  const nextType = opts?.gameType || state.gameType;
  const fresh = createInitialBoardGameState(nextType, undefined, state.soloLocal);
  const wSeat = opts?.swapColors ? state.players.b : state.players.w;
  const bSeat = opts?.swapColors ? state.players.w : state.players.b;

  const nextPlayers = {
    w: wSeat ? { ...wSeat } : null,
    b: bSeat ? { ...bSeat } : null,
  };
  const bothSeated = Boolean(nextPlayers.w && nextPlayers.b);

  return {
    ...fresh,
    players: nextPlayers,
    status: bothSeated || state.soloLocal ? 'playing' : 'waiting',
    updatedAt: Date.now(),
  };
}
