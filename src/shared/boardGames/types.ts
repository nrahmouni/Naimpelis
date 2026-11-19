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

export function cloneBoard(board: (string | null)[][]): (string | null)[][] {
  return board.map((row) => [...row]);
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function coordLabel(r: number, c: number): string {
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

export function withClockTick(state: BoardGameState, now: number): {
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

export function appendHistoryEntry(
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
  opts?: {
    gameType?: BoardGameType;
    swapColors?: boolean;
    clockMinutes?: BoardClockMinutes;
    waitForHost?: boolean;
  }
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
  const waitForHost = Boolean(opts?.waitForHost) && !state.soloLocal;

  const now = Date.now();
  const nextStatus = waitForHost ? 'waiting' : bothSeated || state.soloLocal ? 'playing' : 'waiting';

  return {
    ...fresh,
    players: nextPlayers,
    awaitingHostStart: waitForHost,
    status: nextStatus,
    turnStartedAt: now,
    turnDeadlineAt: nextStatus === 'playing' ? now + BOARD_TURN_DECISION_MS : 0,
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
          name: 'Poca-solta',
          avatar: '🤪',
          color: '#9146FF',
          score: 0,
          isBot: true,
        },
    b: state.players.b
      ? { ...state.players.b }
      : {
          userId: 'bot-board-b',
          name: 'Machupichu',
          avatar: '🗿',
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
