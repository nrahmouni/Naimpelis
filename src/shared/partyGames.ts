/**
 * NAIM CINE — 4-Player Party Games Engine
 * Authentic Official Rules:
 * 1. Parchís Español (68-square board, 12 safe squares, exit on 5, bridges/barriers, +20 capture, +10 goal, 3 sixes penalty)
 * 2. UNO (1971 Merle Robbins / Mattel official 108-card rules, no +2/+4 stacking, playable drawn card, Wild+4 challenge, UNO! call & +2 catch, 500-pt scoring)
 */

export type PartyColor = 'red' | 'blue' | 'yellow' | 'green';
export type PartyGameType = 'parchis' | 'uno';

export const PARTY_COLORS: PartyColor[] = ['red', 'blue', 'yellow', 'green'];
export const PARTY_TURN_DECISION_MS = 15_000;

export interface PartySeatPlayer {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: PartyColor;
  isBot: boolean;
  score: number;
}

// ============================================================================
// PARCHÍS ESPAÑOL OFICIAL (68 CASILLAS · 4 JUGADORES)
// ============================================================================
export interface ParchisPiece {
  id: number; // 0..3
  color: PartyColor;
  /**
   * -1 = En Casa
   * 0..63 = Recorrido común de 68 casillas (0 = casilla de salida, 63 = entrada a pasillo propio)
   * 64..70 = 7 casillas de pasillo de meta exclusivo del color
   * 71 = META
   */
  progress: number;
}

export interface ParchisGameState {
  id: string;
  gameType: 'parchis';
  status: 'waiting' | 'playing' | 'finished';
  players: PartySeatPlayer[];
  turnSeat: number;
  dice: number | null;
  phase: 'roll' | 'move';
  consecutiveSixes: number;
  lastMovedPieceId?: number | null;
  bonusSteps: number; // +20 al comer, +10 al llegar a meta
  pieces: Record<PartyColor, ParchisPiece[]>;
  winnerSeat: number | null;
  log: string[];
  turnDeadlineAt?: number;
  updatedAt: number;
}

/**
 * 0-indexed positions on the 68-square Spanish ring (physical squares 1..68).
 * Physical squares: Yellow=5(4), Blue=22(21), Red=39(38), Green=56(55).
 */
export const PARCHIS_START_OFFSETS: Record<PartyColor, number> = {
  yellow: 4, // Casilla 5
  blue: 21,  // Casilla 22
  red: 38,   // Casilla 39
  green: 55, // Casilla 56
};

/**
 * Official 12 Safe Squares on Spanish 68-square ring (0-indexed):
 * Salidas: 5(4), 22(21), 39(38), 56(55)
 * Seguros: 12(11), 17(16), 29(28), 34(33), 46(45), 51(50), 63(62), 68(67)
 */
export const PARCHIS_SAFE_SQUARES = new Set([4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67]);

export function parchisGlobalSquare(color: PartyColor, progress: number): number | null {
  if (progress < 0 || progress > 63) return null;
  return (PARCHIS_START_OFFSETS[color] + progress) % 68;
}

const BOT_PROFILES: Array<{ name: string; avatar: string }> = [
  { name: 'Bot Nova', avatar: '🤖' },
  { name: 'Bot Vega', avatar: '🦾' },
  { name: 'Bot Orion', avatar: '👾' },
  { name: 'Bot Lyra', avatar: '🎯' },
];

export function buildFourSeats(
  humanParticipants: Array<{ id: string; name: string; avatar?: string }>
): PartySeatPlayer[] {
  const uniqueHumans: Array<{ id: string; name: string; avatar?: string }> = [];
  const seen = new Set<string>();
  for (const h of humanParticipants) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    uniqueHumans.push(h);
    if (uniqueHumans.length >= 4) break;
  }

  const seats: PartySeatPlayer[] = [];
  for (let i = 0; i < 4; i += 1) {
    const color = PARTY_COLORS[i];
    const h = uniqueHumans[i];
    if (h) {
      seats.push({
        seatIndex: i,
        userId: h.id,
        name: h.name,
        avatar: h.avatar || '🎮',
        color,
        isBot: false,
        score: 0,
      });
    } else {
      const bot = BOT_PROFILES[i % BOT_PROFILES.length];
      seats.push({
        seatIndex: i,
        userId: `bot-seat-${i}-${color}`,
        name: bot.name,
        avatar: bot.avatar,
        color,
        isBot: true,
        score: 0,
      });
    }
  }
  return seats;
}

export function preserveSeatsForRematch(
  prevPlayers: PartySeatPlayer[],
  humans: Array<{ id: string; name: string; avatar?: string }>
): PartySeatPlayer[] {
  const humanMap = new Map(humans.filter((h) => h?.id).map((h) => [h.id, h]));
  const alreadySeated = new Set<string>();
  const seats: PartySeatPlayer[] = prevPlayers.map((pl, idx) => {
    const color = pl.color || PARTY_COLORS[idx % PARTY_COLORS.length];
    if (!pl.isBot && humanMap.has(pl.userId)) {
      const h = humanMap.get(pl.userId)!;
      alreadySeated.add(h.id);
      return {
        ...pl,
        seatIndex: idx,
        userId: h.id,
        name: h.name || pl.name,
        avatar: h.avatar || pl.avatar || '🎮',
        color,
        isBot: false,
      };
    }
    const bot = BOT_PROFILES[idx % BOT_PROFILES.length];
    return {
      seatIndex: idx,
      userId: `bot-seat-${idx}-${color}`,
      name: bot.name,
      avatar: bot.avatar,
      color,
      isBot: true,
      score: pl.isBot ? pl.score : 0,
    };
  });

  // Assign any newly arrived humans into remaining bot seats
  for (const h of humans) {
    if (!h?.id || alreadySeated.has(h.id)) continue;
    const botIdx = seats.findIndex((s) => s.isBot);
    if (botIdx === -1) break;
    alreadySeated.add(h.id);
    seats[botIdx] = {
      ...seats[botIdx],
      userId: h.id,
      name: h.name || 'Jugador',
      avatar: h.avatar || '🎮',
      isBot: false,
      score: 0,
    };
  }
  return seats;
}

export function createInitialParchisState(
  humans: Array<{ id: string; name: string; avatar?: string }>,
  opts?: { waitForHost?: boolean; preservedSeats?: PartySeatPlayer[] }
): ParchisGameState {
  const players = opts?.preservedSeats
    ? preserveSeatsForRematch(opts.preservedSeats, humans).map((p) => ({ ...p, score: 0 }))
    : buildFourSeats(humans);
  const waitForHost = Boolean(opts?.waitForHost);
  const now = Date.now();
  const pieces: Record<PartyColor, ParchisPiece[]> = {
    red: [0, 1, 2, 3].map((id) => ({ id, color: 'red', progress: -1 })),
    blue: [0, 1, 2, 3].map((id) => ({ id, color: 'blue', progress: -1 })),
    yellow: [0, 1, 2, 3].map((id) => ({ id, color: 'yellow', progress: -1 })),
    green: [0, 1, 2, 3].map((id) => ({ id, color: 'green', progress: -1 })),
  };
  return {
    id: `parchis-${now}`,
    gameType: 'parchis',
    status: waitForHost ? 'waiting' : 'playing',
    players,
    turnSeat: 0,
    dice: null,
    phase: 'roll',
    consecutiveSixes: 0,
    lastMovedPieceId: null,
    bonusSteps: 0,
    pieces,
    winnerSeat: null,
    log: [
      waitForHost
        ? 'Mesa de Parchís Español (68 casillas) · Elige color y espera al anfitrión.'
        : 'Partida de Parchís Español iniciada (68 casillas · Sal con 5 · Puentes y +20/+10).',
    ],
    turnDeadlineAt: waitForHost ? undefined : now + PARTY_TURN_DECISION_MS,
    updatedAt: now,
  };
}

function countPiecesOnRingSquare(
  pieces: Record<PartyColor, ParchisPiece[]>,
  sq: number
): Array<{ color: PartyColor; id: number }> {
  const found: Array<{ color: PartyColor; id: number }> = [];
  for (const c of PARTY_COLORS) {
    for (const p of pieces[c]) {
      if (parchisGlobalSquare(c, p.progress) === sq) {
        found.push({ color: c, id: p.id });
      }
    }
  }
  return found;
}

function hasBridgeAtRingSquare(pieces: Record<PartyColor, ParchisPiece[]>, sq: number): boolean {
  const occupants = countPiecesOnRingSquare(pieces, sq);
  // In Spanish Parchís a bridge/barrera is formed by 2 pieces of the same color on a ring square.
  return occupants.length >= 2 && occupants[0].color === occupants[1].color;
}

function canPieceAdvanceSteps(
  state: ParchisGameState,
  color: PartyColor,
  piece: ParchisPiece,
  steps: number
): boolean {
  if (piece.progress === 71 || steps <= 0) return false;

  if (piece.progress === -1) {
    // Official Spanish Parchís rule: ONLY 5 allows exiting Casa (unless exit blocked by 2 own pieces)
    if (steps !== 5) return false;
    const startSq = PARCHIS_START_OFFSETS[color];
    const occupants = countPiecesOnRingSquare(state.pieces, startSq);
    if (occupants.length >= 2) {
      // Blocked only if 2 of own pieces occupy the start square; mixed/rival 2-piece barrier eats opponent on entry
      const hasOpponent = occupants.some((o) => o.color !== color);
      return hasOpponent;
    }
    return true;
  }

  const targetProg = piece.progress + steps;
  if (targetProg > 71) return false;

  // Cannot pass over any bridge on the outer shared ring (progress + 1 .. targetProg - 1)
  for (let step = 1; step < steps; step += 1) {
    const midProg = piece.progress + step;
    if (midProg <= 63) {
      const midSq = parchisGlobalSquare(color, midProg);
      if (midSq !== null && hasBridgeAtRingSquare(state.pieces, midSq)) {
        return false;
      }
    }
  }

  // Destination square checks
  if (targetProg <= 63) {
    const destSq = parchisGlobalSquare(color, targetProg);
    if (destSq !== null) {
      const occupants = countPiecesOnRingSquare(state.pieces, destSq);
      // Max 2 pieces on any outer ring square
      if (occupants.length >= 2) return false;
    }
  } else if (targetProg <= 70) {
    // Private home pasillo: max 2 pieces per step square
    const sameStepCount = state.pieces[color].filter((p) => p.progress === targetProg).length;
    if (sameStepCount >= 2) return false;
  }

  return true;
}

export function getLegalParchisPieceIds(state: ParchisGameState, steps: number): number[] {
  const seat = state.players[state.turnSeat];
  if (!seat || state.status === 'finished') return [];
  const own = state.pieces[seat.color];

  const allCandidates = own.filter((p) => canPieceAdvanceSteps(state, seat.color, p, steps));
  if (allCandidates.length === 0) return [];

  // Rule: Rolling a 5 OBLIGATES exiting a piece from Casa if start square is free/valid (only when normal dice roll, not +10/+20 bonus)
  if (steps === 5 && state.bonusSteps === 0) {
    const inHomeExit = allCandidates.filter((p) => p.progress === -1);
    if (inHomeExit.length > 0) {
      return inHomeExit.map((p) => p.id);
    }
  }

  // Rule: Rolling a 6 (normal dice roll, not bonus) OBLIGATES opening an own bridge if any piece in a bridge can move legally
  if (steps === 6 && state.bonusSteps === 0) {
    const bridgePieceIds = new Set<number>();
    for (const p of own) {
      const sq = parchisGlobalSquare(seat.color, p.progress);
      if (sq !== null) {
        const sameColorHere = own.filter((other) => parchisGlobalSquare(seat.color, other.progress) === sq);
        if (sameColorHere.length >= 2) {
          for (const bp of sameColorHere) bridgePieceIds.add(bp.id);
        }
      }
    }
    if (bridgePieceIds.size > 0) {
      const bridgeMovers = allCandidates.filter((p) => bridgePieceIds.has(p.id));
      if (bridgeMovers.length > 0) {
        return bridgeMovers.map((p) => p.id);
      }
    }
  }

  return allCandidates.map((p) => p.id);
}

export function rollParchisDice(
  state: ParchisGameState,
  actorUserId: string,
  forcedRoll?: number
): { ok: true; state: ParchisGameState } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error: state.status === 'waiting' ? 'Esperando a que el anfitrión inicie la partida.' : 'Partida terminada.',
    };
  }
  if (state.phase !== 'roll') return { ok: false, error: 'Mueve una ficha antes de tirar.' };
  const activeSeat = state.players[state.turnSeat];
  if (!activeSeat.isBot && activeSeat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const now = Date.now();
  const roll =
    typeof forcedRoll === 'number' && forcedRoll >= 1 && forcedRoll <= 6
      ? Math.floor(forcedRoll)
      : 1 + Math.floor(Math.random() * 6);
  const nextSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;

  // Official rule: 3 consecutive 6s returns last moved piece (if on shared ring, NOT pasillo/meta) to Casa
  if (nextSixes >= 3) {
    const nextPieces: Record<PartyColor, ParchisPiece[]> = {
      red: state.pieces.red.map((p) => ({ ...p })),
      blue: state.pieces.blue.map((p) => ({ ...p })),
      yellow: state.pieces.yellow.map((p) => ({ ...p })),
      green: state.pieces.green.map((p) => ({ ...p })),
    };

    let penaltyText = `${activeSeat.name} sacó tres 6 seguidos · pierde el turno.`;
    if (typeof state.lastMovedPieceId === 'number') {
      const penalizedPiece = nextPieces[activeSeat.color].find((p) => p.id === state.lastMovedPieceId);
      if (penalizedPiece && penalizedPiece.progress >= 0 && penalizedPiece.progress <= 63) {
        penalizedPiece.progress = -1;
        penaltyText = `${activeSeat.name} sacó tres 6 seguidos · ficha #${penalizedPiece.id + 1} vuelve a casa.`;
      } else if (penalizedPiece && penalizedPiece.progress >= 64) {
        penaltyText = `${activeSeat.name} sacó tres 6 seguidos · ficha #${penalizedPiece.id + 1} a salvo en pasillo.`;
      }
    }

    const nextSeat = (state.turnSeat + 1) % 4;
    return {
      ok: true,
      state: {
        ...state,
        pieces: nextPieces,
        dice: roll,
        phase: 'roll',
        consecutiveSixes: 0,
        lastMovedPieceId: null,
        turnSeat: nextSeat,
        log: [...state.log.slice(-14), penaltyText],
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  const legal = getLegalParchisPieceIds(state, roll);
  if (legal.length === 0) {
    const nextSeat = roll === 6 ? state.turnSeat : (state.turnSeat + 1) % 4;
    return {
      ok: true,
      state: {
        ...state,
        dice: roll,
        phase: 'roll',
        consecutiveSixes: roll === 6 ? nextSixes : 0,
        turnSeat: nextSeat,
        log: [
          ...state.log.slice(-14),
          `${activeSeat.name} sacó ${roll} (sin movimiento${roll === 6 ? ', repite tirada' : ''}).`,
        ],
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      dice: roll,
      phase: 'move',
      consecutiveSixes: nextSixes,
      log: [...state.log.slice(-14), `${activeSeat.name} sacó un ${roll}.`],
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function moveParchisPiece(
  state: ParchisGameState,
  actorUserId: string,
  pieceId: number
): { ok: true; state: ParchisGameState; finishedNow: boolean } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error: state.status === 'waiting' ? 'Esperando a que el anfitrión inicie la partida.' : 'Partida terminada.',
    };
  }
  if (state.phase !== 'move') return { ok: false, error: 'Primero tira el dado.' };
  const activeSeat = state.players[state.turnSeat];
  if (!activeSeat.isBot && activeSeat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const steps = state.bonusSteps > 0 ? state.bonusSteps : state.dice || 0;
  if (steps <= 0) return { ok: false, error: 'Dado inválido.' };
  const legal = getLegalParchisPieceIds(state, steps);
  if (!legal.includes(pieceId)) {
    return { ok: false, error: 'Movimiento no permitido por las reglas del Parchís.' };
  }

  const nextPieces: Record<PartyColor, ParchisPiece[]> = {
    red: state.pieces.red.map((p) => ({ ...p })),
    blue: state.pieces.blue.map((p) => ({ ...p })),
    yellow: state.pieces.yellow.map((p) => ({ ...p })),
    green: state.pieces.green.map((p) => ({ ...p })),
  };

  const targetPiece = nextPieces[activeSeat.color].find((p) => p.id === pieceId)!;
  const wasInBase = targetPiece.progress === -1;
  targetPiece.progress = wasInBase ? 0 : targetPiece.progress + steps;

  const logs = [...state.log.slice(-13)];
  let nextBonus = 0;

  // Capture check on shared ring
  const landingSquare = parchisGlobalSquare(activeSeat.color, targetPiece.progress);
  if (landingSquare !== null) {
    if (wasInBase) {
      // Salida con 5: only eats an opponent if 2 pieces already blocked salida (including rival)
      const othersAtStart = PARTY_COLORS.filter((c) => c !== activeSeat.color).flatMap((c) =>
        nextPieces[c].filter((op) => parchisGlobalSquare(c, op.progress) === landingSquare)
      );
      const totalBeforeEntry = countPiecesOnRingSquare(state.pieces, landingSquare).length;
      if (totalBeforeEntry >= 2 && othersAtStart.length > 0) {
        const victim = othersAtStart[othersAtStart.length - 1];
        victim.progress = -1;
        nextBonus = 20;
        logs.push(`${activeSeat.name} comió al salir en casilla segura (+20 pasos).`);
      }
    } else if (!PARCHIS_SAFE_SQUARES.has(landingSquare)) {
      for (const c of PARTY_COLORS) {
        if (c === activeSeat.color) continue;
        for (const oppPiece of nextPieces[c]) {
          if (parchisGlobalSquare(c, oppPiece.progress) === landingSquare) {
            oppPiece.progress = -1;
            nextBonus = 20;
            logs.push(`${activeSeat.name} comió una ficha ${c} (+20 pasos extra).`);
            break;
          }
        }
        if (nextBonus === 20) break;
      }
    }
  }

  if (targetPiece.progress === 71) {
    nextBonus = Math.max(nextBonus, 10);
    logs.push(`${activeSeat.name} metió una ficha en Meta (+10 pasos).`);
  }

  const wonNow = nextPieces[activeSeat.color].every((p) => p.progress === 71);
  if (wonNow) {
    const nextPlayers = state.players.map((pl, idx) =>
      idx === state.turnSeat ? { ...pl, score: pl.score + 1 } : pl
    );
    return {
      ok: true,
      finishedNow: true,
      state: {
        ...state,
        status: 'finished',
        players: nextPlayers,
        pieces: nextPieces,
        winnerSeat: state.turnSeat,
        phase: 'roll',
        bonusSteps: 0,
        lastMovedPieceId: null,
        log: [...logs, `🏆 ${activeSeat.name} ha ganado el Parchís Español!`],
        updatedAt: Date.now(),
      },
    };
  }

  const now = Date.now();
  const tempState: ParchisGameState = {
    ...state,
    pieces: nextPieces,
    bonusSteps: nextBonus,
    lastMovedPieceId: targetPiece.id,
  };
  if (nextBonus > 0 && getLegalParchisPieceIds(tempState, nextBonus).length > 0) {
    return {
      ok: true,
      finishedNow: false,
      state: {
        ...tempState,
        phase: 'move',
        log: logs,
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  const extraTurn = state.dice === 6;
  const nextSeat = extraTurn ? state.turnSeat : (state.turnSeat + 1) % 4;

  return {
    ok: true,
    finishedNow: false,
    state: {
      ...state,
      pieces: nextPieces,
      turnSeat: nextSeat,
      phase: 'roll',
      bonusSteps: 0,
      lastMovedPieceId: extraTurn ? targetPiece.id : null,
      consecutiveSixes: extraTurn ? state.consecutiveSixes : 0,
      log: logs,
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function chooseBotParchisAction(state: ParchisGameState): {
  action: 'roll_dice' | 'move_piece';
  pieceId?: number;
} {
  if (state.phase === 'roll') return { action: 'roll_dice' };
  const steps = state.bonusSteps > 0 ? state.bonusSteps : state.dice || 0;
  const legal = getLegalParchisPieceIds(state, steps);
  if (legal.length === 0) return { action: 'roll_dice' };

  const activeColor = state.players[state.turnSeat].color;
  const own = state.pieces[activeColor];

  let bestId = legal[0];
  let bestScore = -999;

  for (const id of legal) {
    const p = own.find((x) => x.id === id)!;
    const nextProg = p.progress === -1 ? 0 : p.progress + steps;
    let score = nextProg;
    if (p.progress === -1) score += 95;
    if (nextProg === 71) score += 130;
    const sq = parchisGlobalSquare(activeColor, nextProg);
    if (sq !== null && !PARCHIS_SAFE_SQUARES.has(sq)) {
      const canCapture = PARTY_COLORS.some(
        (c) => c !== activeColor && state.pieces[c].some((op) => parchisGlobalSquare(c, op.progress) === sq)
      );
      if (canCapture) score += 180;
    }
    if (sq !== null && PARCHIS_SAFE_SQUARES.has(sq)) score += 35;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return { action: 'move_piece', pieceId: bestId };
}

// ============================================================================
// UNO OFICIAL (1971 MERLE ROBBINS / MATTEL · 108 CARTAS · 4 JUGADORES)
// ============================================================================
export type UnoCardColor = PartyColor | 'wild';
export type UnoCardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface UnoCard {
  id: string;
  color: UnoCardColor;
  value: UnoCardValue;
}

export interface UnoGameState {
  id: string;
  gameType: 'uno';
  status: 'waiting' | 'playing' | 'finished';
  players: PartySeatPlayer[];
  hands: Record<number, UnoCard[]>; // keyed by seatIndex 0..3
  deck: UnoCard[];
  discardPile: UnoCard[];
  activeColor: PartyColor;
  turnSeat: number;
  direction: 1 | -1;
  pendingDraw: number;
  /** Official Mattel Wild+4 challenge window */
  pendingWild4Challenge?: {
    offenderSeat: number;
    victimSeat: number;
    wasIllegal: boolean;
    chosenColor: PartyColor;
  } | null;
  /** When player draws 1 card and it is immediately playable */
  drawnPlayableCardId?: string | null;
  /** Seat with 1 card that hasn't yelled UNO yet (vulnerable to +2 catch before next play/draw) */
  vulnerableUnoSeat?: number | null;
  roundPointsWon?: number;
  winnerSeat: number | null;
  unoCalledSeats: number[];
  log: string[];
  turnDeadlineAt?: number;
  updatedAt: number;
}

export const UNO_TARGET_SCORE = 500;

export function buildUnoDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let seq = 1;
  const push = (color: UnoCardColor, value: UnoCardValue) => {
    cards.push({ id: `u-${seq++}`, color, value });
  };
  for (const c of PARTY_COLORS) {
    push(c, '0');
    const vals: UnoCardValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    for (const v of vals) {
      push(c, v);
      push(c, v);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    push('wild', 'wild');
    push('wild', 'wild4');
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function getUnoCardPoints(card: UnoCard): number {
  if (card.value === 'wild' || card.value === 'wild4') return 50;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  return Number.parseInt(card.value, 10) || 0;
}

export function calculateUnoRoundScore(hands: Record<number, UnoCard[]>, winnerSeat: number): number {
  let total = 0;
  for (const [seatStr, hand] of Object.entries(hands)) {
    if (Number(seatStr) === winnerSeat) continue;
    for (const c of hand) total += getUnoCardPoints(c);
  }
  return total;
}

export function createInitialUnoState(
  humans: Array<{ id: string; name: string; avatar?: string }>,
  opts?: { waitForHost?: boolean; existingScores?: number[]; preservedSeats?: PartySeatPlayer[] }
): UnoGameState {
  const basePlayers = opts?.preservedSeats
    ? preserveSeatsForRematch(opts.preservedSeats, humans)
    : buildFourSeats(humans);
  const players = basePlayers.map((pl, idx) => ({
    ...pl,
    score: opts?.existingScores?.[idx] ?? pl.score,
  }));
  const waitForHost = Boolean(opts?.waitForHost);
  const now = Date.now();
  const deck = buildUnoDeck();
  const hands: Record<number, UnoCard[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (let r = 0; r < 7; r += 1) {
    for (let s = 0; s < 4; s += 1) {
      hands[s].push(deck.pop()!);
    }
  }

  // Official Mattel setup: flip top card. If Wild Draw Four (+4), return to deck, shuffle, and flip a new card.
  let topCard = deck.pop()!;
  while (topCard.value === 'wild4') {
    deck.unshift(topCard);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    topCard = deck.pop()!;
  }

  // Seat 0 = host/dealer left starts unless flipped action card changes turn/direction:
  let initialDirection: 1 | -1 = 1;
  let initialTurnSeat = 0;
  const setupLogs: string[] = [];

  if (topCard.value === 'reverse') {
    initialDirection = -1;
    initialTurnSeat = 3;
    setupLogs.push('Carta inicial Cambio de Sentido: empieza en sentido antihorario.');
  } else if (topCard.value === 'skip') {
    initialTurnSeat = 1;
    setupLogs.push(`Carta inicial Salto: ${players[0].name} pierde primer turno.`);
  } else if (topCard.value === 'draw2') {
    // Dealer = seat 0 -> left player (seat 1) draws 2 and is skipped so seat 0 hand remains exact 7-card deal
    const drawn = [deck.pop()!, deck.pop()!].filter(Boolean);
    hands[1].push(...drawn);
    initialTurnSeat = 2;
    setupLogs.push(`Carta inicial +2: ${players[1].name} roba 2 cartas y pierde turno.`);
  }

  const initialColor: PartyColor =
    topCard.color === 'wild' ? 'red' : topCard.color;

  return {
    id: `uno-${now}`,
    gameType: 'uno',
    status: waitForHost ? 'waiting' : 'playing',
    players,
    hands,
    deck,
    discardPile: [topCard],
    activeColor: initialColor,
    turnSeat: initialTurnSeat,
    direction: initialDirection,
    pendingDraw: 0,
    pendingWild4Challenge: null,
    drawnPlayableCardId: null,
    vulnerableUnoSeat: null,
    roundPointsWon: 0,
    winnerSeat: null,
    unoCalledSeats: [],
    log: [
      ...setupLogs,
      waitForHost
        ? 'Mesa UNO Oficial (108 cartas) · Elige color y espera al anfitrión.'
        : 'UNO Oficial (Mattel 1971) iniciado · Sin acumular +2/+4 · Desafío +4 activo.',
    ],
    turnDeadlineAt: waitForHost ? undefined : now + PARTY_TURN_DECISION_MS,
    updatedAt: now,
  };
}

export function isUnoCardPlayable(state: UnoGameState, card: UnoCard): boolean {
  if (state.pendingWild4Challenge) return false;
  if (state.drawnPlayableCardId) {
    return card.id === state.drawnPlayableCardId;
  }
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return true;
  if (card.color === 'wild') return true;
  return card.color === state.activeColor || card.value === top.value;
}

function drawFromDeck(
  deck: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; deck: UnoCard[]; discardPile: UnoCard[] } {
  const nextDeck = [...deck];
  let nextDiscard = [...discardPile];
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i += 1) {
    if (nextDeck.length === 0 && nextDiscard.length > 1) {
      const top = nextDiscard.pop()!;
      for (let k = nextDiscard.length - 1; k > 0; k -= 1) {
        const j = Math.floor(Math.random() * (k + 1));
        [nextDiscard[k], nextDiscard[j]] = [nextDiscard[j], nextDiscard[k]];
      }
      nextDeck.push(...nextDiscard);
      nextDiscard = [top];
    }
    if (nextDeck.length > 0) {
      drawn.push(nextDeck.pop()!);
    }
  }
  return { drawn, deck: nextDeck, discardPile: nextDiscard };
}

export function playUnoCard(
  state: UnoGameState,
  actorUserId: string,
  cardId: string,
  chosenColor?: PartyColor
): { ok: true; state: UnoGameState; finishedNow: boolean } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error: state.status === 'waiting' ? 'Esperando a que el anfitrión inicie la partida.' : 'Partida finalizada.',
    };
  }
  if (state.pendingWild4Challenge) {
    return { ok: false, error: 'Primero hay que aceptar o desafiar el +4 activo.' };
  }
  const seat = state.players[state.turnSeat];
  if (!seat.isBot && seat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const hand = state.hands[state.turnSeat] || [];
  const cardIdx = hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Carta no encontrada.' };
  const card = hand[cardIdx];
  if (!isUnoCardPlayable(state, card)) {
    return { ok: false, error: 'Esa carta no coincide con el color, número o símbolo activo.' };
  }

  const nextHand = hand.filter((c) => c.id !== cardId);
  let nextHands: Record<number, UnoCard[]> = { ...state.hands, [state.turnSeat]: nextHand };
  let nextDeck = state.deck;
  let nextDiscard = [...state.discardPile, card];
  const prevColor = state.activeColor;
  const nextColor: PartyColor =
    card.color === 'wild' ? chosenColor || 'red' : card.color;

  // Check if player dropped to 0 cards -> round win!
  if (nextHand.length === 0) {
    const pts = calculateUnoRoundScore(nextHands, state.turnSeat);
    const nextPlayers = state.players.map((pl, idx) =>
      idx === state.turnSeat ? { ...pl, score: pl.score + pts } : pl
    );
    const totalScore = nextPlayers[state.turnSeat].score;
    return {
      ok: true,
      finishedNow: true,
      state: {
        ...state,
        status: 'finished',
        players: nextPlayers,
        hands: nextHands,
        discardPile: nextDiscard,
        activeColor: nextColor,
        winnerSeat: state.turnSeat,
        pendingDraw: 0,
        pendingWild4Challenge: null,
        drawnPlayableCardId: null,
        vulnerableUnoSeat: null,
        roundPointsWon: pts,
        log: [
          ...state.log.slice(-14),
          `🏆 ¡${seat.name} se quedó sin cartas (+${pts} pts · Total ${totalScore}/${UNO_TARGET_SCORE})!`,
        ],
        updatedAt: Date.now(),
      },
    };
  }

  const now = Date.now();
  const nextUnoCalled = state.unoCalledSeats.includes(state.turnSeat);
  const nextVulnerable =
    nextHand.length === 1 && !nextUnoCalled ? state.turnSeat : null;
  const logs = [...state.log.slice(-13)];

  // Handle Wild +4 challenge window (Mattel rule: illegal if offender held any card matching prevColor)
  if (card.value === 'wild4') {
    const wasIllegal = nextHand.some((c) => c.color === prevColor);
    const victimSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;
    logs.push(`${seat.name} lanzó +4 (${nextColor.toUpperCase()}) · ${state.players[victimSeat].name} decide si acepta o desafía.`);
    return {
      ok: true,
      finishedNow: false,
      state: {
        ...state,
        hands: nextHands,
        discardPile: nextDiscard,
        activeColor: nextColor,
        turnSeat: victimSeat,
        pendingWild4Challenge: {
          offenderSeat: state.turnSeat,
          victimSeat,
          wasIllegal,
          chosenColor: nextColor,
        },
        drawnPlayableCardId: null,
        vulnerableUnoSeat: nextVulnerable,
        unoCalledSeats: nextHand.length === 1 ? state.unoCalledSeats : state.unoCalledSeats.filter((s) => s !== state.turnSeat),
        log: logs,
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  let nextDir = state.direction;
  let stepCount = 1;

  if (card.value === 'reverse') {
    nextDir = (state.direction * -1) as 1 | -1;
    logs.push(`${seat.name} jugó Cambio de Sentido (${nextColor}).`);
  } else if (card.value === 'skip') {
    stepCount = 2;
    const skippedSeat = ((state.turnSeat + nextDir) % 4 + 4) % 4;
    logs.push(`${seat.name} saltó a ${state.players[skippedSeat].name}.`);
  } else if (card.value === 'draw2') {
    // Official Mattel rule: Next player draws 2 immediately and loses turn (NO stacking!)
    const victimSeat = ((state.turnSeat + nextDir) % 4 + 4) % 4;
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 2);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands = {
      ...nextHands,
      [victimSeat]: [...(nextHands[victimSeat] || []), ...drawRes.drawn],
    };
    stepCount = 2;
    logs.push(`${seat.name} tiró +2 · ${state.players[victimSeat].name} roba 2 y pierde turno.`);
  } else {
    logs.push(`${seat.name} jugó ${card.value.toUpperCase()} (${nextColor}).`);
  }

  const nextSeat = ((state.turnSeat + nextDir * stepCount) % 4 + 4) % 4;
  return {
    ok: true,
    finishedNow: false,
    state: {
      ...state,
      hands: nextHands,
      deck: nextDeck,
      discardPile: nextDiscard,
      activeColor: nextColor,
      direction: nextDir,
      turnSeat: nextSeat,
      pendingDraw: 0,
      pendingWild4Challenge: null,
      drawnPlayableCardId: null,
      vulnerableUnoSeat: nextVulnerable,
      unoCalledSeats: nextHand.length === 1 ? state.unoCalledSeats : state.unoCalledSeats.filter((s) => s !== state.turnSeat),
      log: logs,
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function resolveUnoWild4Challenge(
  state: UnoGameState,
  actorUserId: string,
  decision: 'accept' | 'challenge'
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status !== 'playing' || !state.pendingWild4Challenge) {
    return { ok: false, error: 'No hay ningún +4 pendiente de respuesta.' };
  }
  const { offenderSeat, victimSeat, wasIllegal } = state.pendingWild4Challenge;
  const victim = state.players[victimSeat];
  if (!victim.isBot && victim.userId !== actorUserId) {
    return { ok: false, error: 'Solo el jugador afectado puede responder al +4.' };
  }

  const now = Date.now();
  let nextDeck = state.deck;
  let nextDiscard = state.discardPile;
  const nextHands = { ...state.hands };
  let nextTurnSeat = victimSeat;
  const logs = [...state.log.slice(-13)];

  if (decision === 'accept') {
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 4);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands[victimSeat] = [...(nextHands[victimSeat] || []), ...drawRes.drawn];
    nextTurnSeat = ((victimSeat + state.direction) % 4 + 4) % 4;
    logs.push(`${victim.name} aceptó el +4, robó 4 cartas y perdió turno.`);
  } else if (wasIllegal) {
    // Offender was caught bluffing! Offender draws 4 cards, victim gets to play.
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 4);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands[offenderSeat] = [...(nextHands[offenderSeat] || []), ...drawRes.drawn];
    nextTurnSeat = victimSeat;
    logs.push(
      `⚖️ ¡Desafío ganado! ${state.players[offenderSeat].name} tenía carta del color y roba 4 cartas.`
    );
  } else {
    // Offender played Wild+4 legally! Challenger draws 6 cards and loses turn.
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 6);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands[victimSeat] = [...(nextHands[victimSeat] || []), ...drawRes.drawn];
    nextTurnSeat = ((victimSeat + state.direction) % 4 + 4) % 4;
    logs.push(`❌ Desafío fallido · ${victim.name} roba 6 cartas (4+2) y pierde turno.`);
  }

  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck: nextDeck,
      discardPile: nextDiscard,
      turnSeat: nextTurnSeat,
      pendingWild4Challenge: null,
      unoCalledSeats: state.unoCalledSeats.filter((s) => s !== victimSeat && s !== offenderSeat),
      log: logs,
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function drawUnoCardsAndAdvance(
  state: UnoGameState,
  actorUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error: state.status === 'waiting' ? 'Esperando a que el anfitrión inicie la partida.' : 'Partida finalizada.',
    };
  }
  if (state.pendingWild4Challenge) {
    return resolveUnoWild4Challenge(state, actorUserId, 'accept');
  }
  const seat = state.players[state.turnSeat];
  if (!seat.isBot && seat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const now = Date.now();

  // Passing after drawing a playable card
  if (state.drawnPlayableCardId) {
    const nextSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;
    return {
      ok: true,
      state: {
        ...state,
        turnSeat: nextSeat,
        drawnPlayableCardId: null,
        vulnerableUnoSeat: null,
        log: [...state.log.slice(-14), `${seat.name} decidió guardar la carta robada y pasó.`],
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  // Official Mattel rule: Draw 1 card; if playable, player may immediately play it or pass
  const { drawn, deck, discardPile } = drawFromDeck(state.deck, state.discardPile, 1);
  const drawnCard = drawn[0];
  const nextHands = {
    ...state.hands,
    [state.turnSeat]: [...(state.hands[state.turnSeat] || []), ...drawn],
  };

  if (drawnCard && isUnoCardPlayable(state, drawnCard)) {
    return {
      ok: true,
      state: {
        ...state,
        hands: nextHands,
        deck,
        discardPile,
        drawnPlayableCardId: drawnCard.id,
        vulnerableUnoSeat: null,
        unoCalledSeats: state.unoCalledSeats.filter((s) => s !== state.turnSeat),
        log: [...state.log.slice(-14), `${seat.name} robó 1 carta jugable (puede jugarla o pasar).`],
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  const nextSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;
  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck,
      discardPile,
      pendingDraw: 0,
      drawnPlayableCardId: null,
      vulnerableUnoSeat: null,
      turnSeat: nextSeat,
      unoCalledSeats: state.unoCalledSeats.filter((s) => s !== state.turnSeat),
      log: [...state.log.slice(-14), `${seat.name} robó 1 carta.`],
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function callUnoAction(
  state: UnoGameState,
  actorUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status === 'finished') return { ok: false, error: 'Partida finalizada.' };
  const seatIdx = state.players.findIndex((p) => !p.isBot && p.userId === actorUserId);
  if (seatIdx === -1) return { ok: false, error: 'No estás sentado en la mesa.' };
  const hand = state.hands[seatIdx] || [];
  if (hand.length > 2) return { ok: false, error: 'Solo puedes cantar ¡UNO! con 1 o 2 cartas.' };
  const seat = state.players[seatIdx];
  return {
    ok: true,
    state: {
      ...state,
      unoCalledSeats: Array.from(new Set([...state.unoCalledSeats, seatIdx])),
      vulnerableUnoSeat: state.vulnerableUnoSeat === seatIdx ? null : state.vulnerableUnoSeat,
      log: [...state.log.slice(-14), `📣 ¡${seat.name} gritó ¡UNO!!`],
      updatedAt: Date.now(),
    },
  };
}

export function catchUnoFailureAction(
  state: UnoGameState,
  catcherUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status !== 'playing') return { ok: false, error: 'Partida inactiva.' };
  const targetSeat = state.vulnerableUnoSeat;
  if (targetSeat === null || targetSeat === undefined) {
    return { ok: false, error: 'Nadie olvidó decir ¡UNO! ahora mismo.' };
  }
  const victim = state.players[targetSeat];
  if (!victim || victim.userId === catcherUserId) {
    return { ok: false, error: 'No puedes pillarte a ti mismo.' };
  }
  const catcher = state.players.find((p) => p.userId === catcherUserId)?.name || 'Un jugador';
  const { drawn, deck, discardPile } = drawFromDeck(state.deck, state.discardPile, 2);
  const nextHands = {
    ...state.hands,
    [targetSeat]: [...(state.hands[targetSeat] || []), ...drawn],
  };
  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck,
      discardPile,
      vulnerableUnoSeat: null,
      log: [
        ...state.log.slice(-14),
        `🚨 ¡${catcher} pilló a ${victim.name} sin gritar UNO! (+2 cartas de penalización).`,
      ],
      updatedAt: Date.now(),
    },
  };
}

export function chooseBotUnoMove(state: UnoGameState): {
  action: 'play_card' | 'draw_card' | 'pass_turn' | 'accept_wild4' | 'challenge_wild4';
  cardId?: string;
  chosenColor?: PartyColor;
} {
  if (state.pendingWild4Challenge) {
    return { action: Math.random() < 0.3 ? 'challenge_wild4' : 'accept_wild4' };
  }
  if (state.drawnPlayableCardId) {
    const hand = state.hands[state.turnSeat] || [];
    const card = hand.find((c) => c.id === state.drawnPlayableCardId);
    if (card) {
      let chosenColor: PartyColor = 'red';
      if (card.color === 'wild') {
        const counts: Record<PartyColor, number> = { red: 0, blue: 0, yellow: 0, green: 0 };
        for (const c of hand) if (c.color !== 'wild') counts[c.color] += 1;
        chosenColor = PARTY_COLORS.reduce((best, col) => (counts[col] > counts[best] ? col : best), 'red' as PartyColor);
      }
      return { action: 'play_card', cardId: card.id, chosenColor };
    }
    return { action: 'pass_turn' };
  }

  const hand = state.hands[state.turnSeat] || [];
  const playable = hand.filter((c) => isUnoCardPlayable(state, c));
  if (playable.length === 0) {
    return { action: 'draw_card' };
  }
  const hasMatchingColor = hand.some((c) => c.color === state.activeColor);
  const sorted = [...playable].sort((a, b) => {
    const score = (c: UnoCard) => {
      if (c.value === 'wild4') return hasMatchingColor ? -10 : 1; // Respect official +4 color check!
      if (c.color === 'wild') return 2;
      if (c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse') return 10;
      return 6;
    };
    return score(b) - score(a);
  });
  const pick = sorted[0];
  let chosenColor: PartyColor = 'red';
  if (pick.color === 'wild') {
    const counts: Record<PartyColor, number> = { red: 0, blue: 0, yellow: 0, green: 0 };
    for (const c of hand) {
      if (c.color !== 'wild') counts[c.color] += 1;
    }
    chosenColor = PARTY_COLORS.reduce((best, col) => (counts[col] > counts[best] ? col : best), 'red' as PartyColor);
  }
  return { action: 'play_card', cardId: pick.id, chosenColor };
}

export function claimPartyBotSeat(
  state: PartyGameState,
  human: { id: string; name: string; avatar?: string },
  preferredSeatIndex?: number
): { ok: true; state: PartyGameState; claimedSeat: number } | { ok: false; error: string } {
  const existingIdx = state.players.findIndex((p) => !p.isBot && p.userId === human.id);
  if (existingIdx !== -1) {
    if (
      state.status === 'waiting' &&
      typeof preferredSeatIndex === 'number' &&
      preferredSeatIndex >= 0 &&
      preferredSeatIndex < state.players.length &&
      preferredSeatIndex !== existingIdx &&
      state.players[preferredSeatIndex]?.isBot
    ) {
      const oldSeat = state.players[existingIdx];
      const oldBot = BOT_PROFILES[existingIdx % BOT_PROFILES.length];
      const nextPlayers = state.players.map((pl, idx) => {
        if (idx === existingIdx) {
          return {
            ...pl,
            userId: `bot-seat-${existingIdx}-${oldSeat.color}`,
            name: oldBot.name,
            avatar: oldBot.avatar,
            isBot: true,
          };
        }
        if (idx === preferredSeatIndex) {
          return {
            ...pl,
            userId: human.id,
            name: human.name || pl.name,
            avatar: human.avatar || '🎮',
            isBot: false,
          };
        }
        return pl;
      });
      return {
        ok: true,
        claimedSeat: preferredSeatIndex,
        state: {
          ...state,
          players: nextPlayers,
          log: [
            ...state.log.slice(-14),
            `🎨 ${human.name || 'Jugador'} eligió el color ${state.players[preferredSeatIndex].color.toUpperCase()}.`,
          ],
          updatedAt: Date.now(),
        },
      };
    }
    return { ok: true, state, claimedSeat: existingIdx };
  }

  let targetIdx = -1;
  if (
    typeof preferredSeatIndex === 'number' &&
    preferredSeatIndex >= 0 &&
    preferredSeatIndex < state.players.length &&
    state.players[preferredSeatIndex]?.isBot
  ) {
    targetIdx = preferredSeatIndex;
  } else {
    targetIdx = state.players.findIndex((p) => p.isBot);
  }

  if (targetIdx === -1) {
    return { ok: false, error: 'La mesa está completa (4/4 jugadores).' };
  }

  const nextPlayers = state.players.map((pl, idx) =>
    idx === targetIdx
      ? {
          ...pl,
          userId: human.id,
          name: human.name || pl.name,
          avatar: human.avatar || '🎮',
          isBot: false,
        }
      : pl
  );

  return {
    ok: true,
    claimedSeat: targetIdx,
    state: {
      ...state,
      players: nextPlayers,
      log: [
        ...state.log.slice(-14),
        `🪑 ${human.name || 'Jugador'} ocupó el asiento #${targetIdx + 1}.`,
      ],
      updatedAt: Date.now(),
    },
  };
}

export function startPartyMatch(state: PartyGameState): PartyGameState {
  if (state.status === 'playing') return state;
  const now = Date.now();
  return {
    ...state,
    status: 'playing',
    turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
    log: [...state.log.slice(-14), '🚀 ¡El anfitrión inició la partida! Turnos de 15 segundos.'],
    updatedAt: now,
  };
}

export function vacatePartySeatToBot(
  state: PartyGameState,
  userId: string
): { state: PartyGameState; changed: boolean } {
  const idx = state.players.findIndex((p) => !p.isBot && p.userId === userId);
  if (idx === -1) {
    return { state, changed: false };
  }

  const prevSeat = state.players[idx];
  const bot = BOT_PROFILES[idx % BOT_PROFILES.length];
  const nextPlayers = state.players.map((pl, i) =>
    i === idx
      ? {
          ...pl,
          userId: `bot-seat-${idx}-${prevSeat.color}`,
          name: bot.name,
          avatar: bot.avatar,
          isBot: true,
        }
      : pl
  );

  return {
    changed: true,
    state: {
      ...state,
      players: nextPlayers,
      log: [
        ...state.log.slice(-14),
        `🤖 ${bot.name} tomó el relevo de ${prevSeat.name}.`,
      ],
      updatedAt: Date.now(),
    },
  };
}

export type PartyGameState = ParchisGameState | UnoGameState;
