import {
  buildFourSeats,
  PARTY_COLORS,
  PARTY_TURN_DECISION_MS,
  preserveSeatsForRematch,
  type ParchisGameState,
  type ParchisPiece,
  type PartyColor,
  type PartySeatPlayer,
} from './typesAndSeats.ts';

export const PARCHIS_START_OFFSETS: Record<PartyColor, number> = {
  yellow: 4,
  blue: 21,
  red: 38,
  green: 55,
};

export const PARCHIS_SAFE_SQUARES = new Set([4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67]);

export function parchisGlobalSquare(color: PartyColor, progress: number): number | null {
  if (progress < 0 || progress > 63) return null;
  return (PARCHIS_START_OFFSETS[color] + progress) % 68;
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
    if (steps !== 5) return false;
    const startSq = PARCHIS_START_OFFSETS[color];
    const occupants = countPiecesOnRingSquare(state.pieces, startSq);
    if (occupants.length >= 2) {
      const hasOpponent = occupants.some((o) => o.color !== color);
      return hasOpponent;
    }
    return true;
  }

  const targetProg = piece.progress + steps;
  if (targetProg > 71) return false;

  for (let step = 1; step < steps; step += 1) {
    const midProg = piece.progress + step;
    if (midProg <= 63) {
      const midSq = parchisGlobalSquare(color, midProg);
      if (midSq !== null && hasBridgeAtRingSquare(state.pieces, midSq)) {
        return false;
      }
    }
  }

  if (targetProg <= 63) {
    const destSq = parchisGlobalSquare(color, targetProg);
    if (destSq !== null) {
      const occupants = countPiecesOnRingSquare(state.pieces, destSq);
      if (occupants.length >= 2) return false;
    }
  } else if (targetProg <= 70) {
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

  if (steps === 5 && state.bonusSteps === 0) {
    const inHomeExit = allCandidates.filter((p) => p.progress === -1);
    if (inHomeExit.length > 0) {
      return inHomeExit.map((p) => p.id);
    }
  }

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

  const landingSquare = parchisGlobalSquare(activeSeat.color, targetPiece.progress);
  if (landingSquare !== null) {
    if (wasInBase) {
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
