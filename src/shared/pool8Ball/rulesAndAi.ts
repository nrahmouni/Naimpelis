import {
  computePoolChecksum,
  createSeededRng,
  createStandardRackBalls,
  findNearestValidCueBallSpot,
  getBallGroup,
  isOnEightBall,
  isValidCueBallPlacement,
  POOL_BALL_R,
  POOL_FOOT_SPOT_Y,
  POOL_HEAD_STRING_X,
  POOL_MIN_SHOT_POWER,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  POOL_TURN_TIMEOUT_MS,
  respotBallOnFootSpot,
  seededGaussian,
  type Pool8BallState,
  type PoolBallGroup,
  type PoolBallState,
  type PoolDifficulty,
  type PoolFoulType,
  type PoolPhysicsEvent,
  type PoolPlayerSeat,
  type PoolPocketDef,
  type PoolPocketId,
  type PoolShotInput,
  type PoolSimRuntime,
  type PoolTurnPhase,
} from './types.ts';
import { simulatePoolShot } from './physics.ts';

export function createInitialPoolState(
  humans: Array<{ id: string; name: string; avatar: string; color: string }>,
  opts?: {
    seed?: number;
    difficulty?: PoolDifficulty;
    offlineVsAi?: boolean;
    waitForHost?: boolean;
    now?: number;
  }
): Pool8BallState {
  const now = opts?.now ?? Date.now();
  const seed = opts?.seed ?? ((now ^ 0x5f3759df) >>> 0);
  const difficulty: PoolDifficulty = opts?.difficulty || 'medium';
  const balls = createStandardRackBalls(seed);
  const waitForHost = Boolean(opts?.waitForHost);

  const p0Src = humans[0] || {
    id: 'local-p1',
    name: 'Jugador 1',
    avatar: '🎱',
    color: '#9146FF',
  };
  const p0: PoolPlayerSeat = {
    seatIndex: 0,
    userId: p0Src.id,
    name: p0Src.name,
    avatar: p0Src.avatar || '🎱',
    color: p0Src.color || '#9146FF',
    isBot: false,
    group: null,
    connected: true,
  };

  let p1: PoolPlayerSeat | null = null;
  if (opts?.offlineVsAi) {
    p1 = {
      seatIndex: 1,
      userId: 'bot-pool-ai',
      name:
        difficulty === 'hard'
          ? 'Bot Maestro'
          : difficulty === 'easy'
          ? 'Bot Novato'
          : 'Bot Billar',
      avatar: '🤖',
      color: '#10B981',
      isBot: true,
      group: null,
      connected: true,
    };
  } else if (!waitForHost && humans[1]) {
    p1 = {
      seatIndex: 1,
      userId: humans[1].id,
      name: humans[1].name,
      avatar: humans[1].avatar || '🟡',
      color: humans[1].color || '#F59E0B',
      isBot: false,
      group: null,
      connected: true,
    };
  }

  const isPlaying = !waitForHost && Boolean(p0 && p1);
  const status: Pool8BallState['status'] = isPlaying ? 'playing' : 'waiting';
  const phase: PoolTurnPhase = 'AIMING';

  const base: Pool8BallState = {
    id: `pool-${seed}`,
    gameType: 'pool',
    status,
    awaitingHostStart: waitForHost,
    phase,
    players: [p0, p1],
    turnSeat: 0,
    turnNumber: 1,
    isBreakShot: true,
    breakOnlyBehindHeadString: true,
    balls,
    calledPocketId: null,
    difficulty,
    winnerSeat: null,
    winReason: null,
    lastFoul: null,
    statusMessage: isPlaying
      ? `Saque inicial · Turno de ${p0.name}`
      : waitForHost
      ? 'Esperando respuesta de los invitados en sala…'
      : 'Esperando al 2º jugador en la mesa…',
    turnDeadlineAt: isPlaying ? now + POOL_TURN_TIMEOUT_MS : 0,
    seed,
    checksum: 0,
    lastShot: null,
    updatedAt: now,
  };
  base.checksum = computePoolChecksum(base);
  return base;
}

export function startPoolMatch(
  state: Pool8BallState,
  now = Date.now()
): Pool8BallState {
  if (state.status === 'playing') return state;
  const p0 = state.players[0] || {
    seatIndex: 0 as const,
    userId: 'bot-pool-0',
    name: 'Bot Billar',
    avatar: '🤖',
    color: '#9146FF',
    isBot: true,
    group: null,
    connected: true,
  };
  const p1 = state.players[1] || {
    seatIndex: 1 as const,
    userId: 'bot-pool-ai',
    name:
      state.difficulty === 'hard'
        ? 'Bot Maestro'
        : state.difficulty === 'easy'
        ? 'Bot Novato'
        : 'Bot Billar',
    avatar: '🤖',
    color: '#10B981',
    isBot: true,
    group: null,
    connected: true,
  };
  const next: Pool8BallState = {
    ...state,
    status: 'playing',
    awaitingHostStart: false,
    players: [p0, p1],
    statusMessage: `Saque inicial · Turno de ${p0.name}`,
    turnDeadlineAt: now + POOL_TURN_TIMEOUT_MS,
    updatedAt: now,
  };
  next.checksum = computePoolChecksum(next);
  return next;
}

export function joinPoolSeat(
  state: Pool8BallState,
  user: { id: string; name: string; avatar: string; color: string },
  seatIndex: 0 | 1 | 'spectate',
  now = Date.now(),
  opts?: { keepWaiting?: boolean }
): { ok: true; state: Pool8BallState } | { ok: false; error: string } {
  if (state.status === 'finished') {
    return { ok: false, error: 'La partida ya terminó' };
  }

  const nextPlayers: [PoolPlayerSeat | null, PoolPlayerSeat | null] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
  ];

  if (seatIndex === 'spectate') {
    if (state.status === 'playing') {
      return { ok: false, error: 'No puedes abandonar una mesa en juego desde aquí' };
    }
    if (nextPlayers[0]?.userId === user.id) nextPlayers[0] = null;
    if (nextPlayers[1]?.userId === user.id) nextPlayers[1] = null;
  } else {
    const existing = nextPlayers[seatIndex];
    if (existing && !existing.isBot && existing.userId !== user.id) {
      return { ok: false, error: 'Ese asiento ya está ocupado' };
    }
    const otherIdx: 0 | 1 = seatIndex === 0 ? 1 : 0;
    if (nextPlayers[otherIdx]?.userId === user.id && state.status === 'waiting') {
      nextPlayers[otherIdx] = null;
    }
    nextPlayers[seatIndex] = {
      seatIndex,
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '🎱',
      color: user.color || '#9146FF',
      isBot: false,
      group: existing?.group ?? null,
      connected: true,
    };
  }

  const ready = Boolean(nextPlayers[0] && nextPlayers[1]);
  const keepWaiting = Boolean(opts?.keepWaiting);
  const shouldPlayNow = state.status === 'playing' || (ready && !keepWaiting);
  const nextStatus: Pool8BallState['status'] = shouldPlayNow ? 'playing' : 'waiting';

  const next: Pool8BallState = {
    ...state,
    status: nextStatus,
    awaitingHostStart: nextStatus === 'playing' ? false : state.awaitingHostStart,
    players: nextPlayers,
    statusMessage:
      nextStatus === 'playing' && state.status === 'waiting'
        ? `Mesa completa · Saque inicial de ${nextPlayers[0]!.name}`
        : ready && keepWaiting
        ? `${nextPlayers[1]?.name || 'Jugador 2'} se unió a la mesa`
        : state.statusMessage,
    turnDeadlineAt:
      nextStatus === 'playing' && state.status === 'waiting'
        ? now + POOL_TURN_TIMEOUT_MS
        : state.turnDeadlineAt,
    updatedAt: now,
  };
  next.checksum = computePoolChecksum(next);
  return { ok: true, state: next };
}

export function callPoolPocket(
  state: Pool8BallState,
  userId: string,
  pocketId: PoolPocketId,
  now = Date.now()
): { ok: true; state: Pool8BallState } | { ok: false; error: string } {
  if (state.status !== 'playing' || state.phase === 'GAME_OVER') {
    return { ok: false, error: 'Partida no activa' };
  }
  const active = state.players[state.turnSeat];
  if (!active || active.userId !== userId) {
    return { ok: false, error: 'No es tu turno' };
  }
  const next: Pool8BallState = {
    ...state,
    calledPocketId: pocketId,
    updatedAt: now,
  };
  next.checksum = computePoolChecksum(next);
  return { ok: true, state: next };
}

export function placePoolCueBall(
  state: Pool8BallState,
  userId: string,
  x: number,
  y: number,
  now = Date.now()
): { ok: true; state: Pool8BallState } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return { ok: false, error: 'Partida no activa' };
  }
  const active = state.players[state.turnSeat];
  if (!active || active.userId !== userId) {
    return { ok: false, error: 'No es tu turno' };
  }
  const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
  if (state.phase !== 'BALL_IN_HAND' && !(state.isBreakShot && state.phase === 'AIMING')) {
    return { ok: false, error: 'No tienes bola en mano ahora' };
  }
  if (!isValidCueBallPlacement(state.balls, x, y, behindHead)) {
    return { ok: false, error: 'Posición de bola blanca no válida' };
  }

  const nextBalls = state.balls.map((b) =>
    b.id === 0
      ? {
          ...b,
          x,
          y,
          vx: 0,
          vy: 0,
          pocketed: false,
          pocketId: null,
          offTable: false,
        }
      : { ...b }
  );

  const next: Pool8BallState = {
    ...state,
    balls: nextBalls,
    phase: state.phase === 'BALL_IN_HAND' ? 'AIMING' : state.phase,
    updatedAt: now,
  };
  next.checksum = computePoolChecksum(next);
  return { ok: true, state: next };
}

export function resolvePoolShotOutcome(
  state: Pool8BallState,
  runtime: PoolSimRuntime,
  calledPocketId: PoolPocketId | null,
  shot: PoolShotInput,
  now = Date.now()
): {
  nextState: Pool8BallState;
  foul: PoolFoulType | null;
  assignedGroup: PoolBallGroup | null;
  turnContinued: boolean;
} {
  const shooterSeat = state.turnSeat;
  const oppSeat: 0 | 1 = shooterSeat === 0 ? 1 : 0;
  const shooter = state.players[shooterSeat]!;
  const opp = state.players[oppSeat]!;

  const nextPlayers: [PoolPlayerSeat | null, PoolPlayerSeat | null] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
  ];

  const wasOnEight = isOnEightBall(state.balls, shooter.group);
  const pocketedEntries = runtime.pocketedOrder;
  const pocketedIds = pocketedEntries.map((e) => e.ballId);
  const cueScratched =
    pocketedIds.includes(0) || runtime.offTableBallIds.includes(0);
  const eightPocketedEntry = pocketedEntries.find((e) => e.ballId === 8) || null;
  const eightOffTable = runtime.offTableBallIds.includes(8);

  let foul: PoolFoulType | null = null;
  if (runtime.offTableBallIds.length > 0) {
    foul = 'BALL_OFF_TABLE';
  } else if (cueScratched) {
    foul = 'SCRATCH';
  } else if (runtime.firstHitBallId === null) {
    foul = 'NO_HIT';
  } else {
    const firstId = runtime.firstHitBallId;
    if (!state.isBreakShot) {
      if (shooter.group === null) {
        if (firstId === 8) foul = 'WRONG_FIRST_HIT';
      } else if (!wasOnEight) {
        if (getBallGroup(firstId) !== shooter.group) {
          foul = 'WRONG_FIRST_HIT';
        }
      } else {
        if (firstId !== 8) {
          foul = 'WRONG_FIRST_HIT';
        }
      }
    }

    if (!foul) {
      const anyObjectPocketed = pocketedIds.some((id) => id !== 0);
      if (!anyObjectPocketed && !runtime.railTouchedAfterHit) {
        foul = 'NO_RAIL';
      }
    }
  }

  let resolvedBalls = runtime.balls.map((b) => ({ ...b, vx: 0, vy: 0 }));

  if (eightOffTable) {
    const next: Pool8BallState = {
      ...state,
      status: 'finished',
      phase: 'GAME_OVER',
      balls: resolvedBalls,
      players: nextPlayers,
      winnerSeat: oppSeat,
      winReason: 'opponent_eight_ball_foul',
      lastFoul: foul || 'BALL_OFF_TABLE',
      statusMessage: `${shooter.name} sacó la bola 8 de la mesa · ¡Gana ${opp.name}!`,
      turnDeadlineAt: 0,
      updatedAt: now,
    };
    next.checksum = computePoolChecksum(next);
    return { nextState: next, foul: next.lastFoul, assignedGroup: null, turnContinued: false };
  }

  if (eightPocketedEntry) {
    if (state.isBreakShot) {
      if (cueScratched || foul) {
        const next: Pool8BallState = {
          ...state,
          status: 'finished',
          phase: 'GAME_OVER',
          balls: resolvedBalls,
          players: nextPlayers,
          winnerSeat: oppSeat,
          winReason: 'opponent_eight_ball_foul',
          lastFoul: foul || 'SCRATCH',
          statusMessage: `Falta en saque con bola 8 · ¡Gana ${opp.name}!`,
          turnDeadlineAt: 0,
          updatedAt: now,
        };
        next.checksum = computePoolChecksum(next);
        return { nextState: next, foul: next.lastFoul, assignedGroup: null, turnContinued: false };
      }
      resolvedBalls = respotBallOnFootSpot(resolvedBalls, 8);
    } else {
      const wrongPocket =
        Boolean(calledPocketId) && eightPocketedEntry.pocketId !== calledPocketId;
      const missingCall = !calledPocketId;
      if (!wasOnEight || foul !== null || wrongPocket || missingCall) {
        const reasonTxt = !wasOnEight
          ? `${shooter.name} metió la bola 8 antes de tiempo`
          : cueScratched
          ? `${shooter.name} hizo scratch con la bola 8`
          : missingCall
          ? `${shooter.name} metió la bola 8 sin cantar tronera`
          : wrongPocket
          ? `${shooter.name} metió la bola 8 en tronera distinta`
          : `${shooter.name} cometió falta al meter la bola 8`;
        const next: Pool8BallState = {
          ...state,
          status: 'finished',
          phase: 'GAME_OVER',
          balls: resolvedBalls,
          players: nextPlayers,
          winnerSeat: oppSeat,
          winReason: 'opponent_eight_ball_foul',
          lastFoul: foul,
          statusMessage: `${reasonTxt} · ¡Gana ${opp.name}!`,
          turnDeadlineAt: 0,
          updatedAt: now,
        };
        next.checksum = computePoolChecksum(next);
        return { nextState: next, foul, assignedGroup: null, turnContinued: false };
      }

      const next: Pool8BallState = {
        ...state,
        status: 'finished',
        phase: 'GAME_OVER',
        balls: resolvedBalls,
        players: nextPlayers,
        winnerSeat: shooterSeat,
        winReason: 'eight_ball_pocketed',
        lastFoul: null,
        calledPocketId: null,
        statusMessage: `🎱 ¡${shooter.name} emboca la bola 8 y gana la partida!`,
        turnDeadlineAt: 0,
        updatedAt: now,
      };
      next.checksum = computePoolChecksum(next);
      return { nextState: next, foul: null, assignedGroup: null, turnContinued: false };
    }
  }

  if (cueScratched) {
    const safeSpot = findNearestValidCueBallSpot(resolvedBalls, POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, false);
    resolvedBalls = resolvedBalls.map((b) =>
      b.id === 0
        ? { ...b, x: safeSpot.x, y: safeSpot.y, vx: 0, vy: 0, pocketed: false, pocketId: null, offTable: false }
        : b
    );
  }

  let assignedGroup: PoolBallGroup | null = null;
  const pocketedObjectIds = pocketedIds.filter((id) => id !== 0 && id !== 8);
  const activeShooterSeat = nextPlayers[shooterSeat]!;
  const activeOppSeat = nextPlayers[oppSeat]!;

  if (!foul && !state.isBreakShot && activeShooterSeat.group === null && pocketedObjectIds.length > 0) {
    const firstLegalObj = pocketedObjectIds[0];
    const g = getBallGroup(firstLegalObj);
    if (g) {
      assignedGroup = g;
      activeShooterSeat.group = g;
      activeOppSeat.group = g === 'solids' ? 'stripes' : 'solids';
    }
  }

  let legalOwnPocketed = false;
  if (!foul) {
    if (state.isBreakShot) {
      legalOwnPocketed = pocketedObjectIds.length > 0;
    } else if (activeShooterSeat.group === null) {
      legalOwnPocketed = pocketedObjectIds.length > 0;
    } else {
      legalOwnPocketed = pocketedObjectIds.some(
        (id) => getBallGroup(id) === activeShooterSeat.group
      );
    }
  }

  const nextTurnSeat: 0 | 1 = !foul && legalOwnPocketed ? shooterSeat : oppSeat;
  const nextPhase: PoolTurnPhase = foul ? 'BALL_IN_HAND' : 'AIMING';
  const foulLabelMap: Record<PoolFoulType, string> = {
    SCRATCH: 'Falta: Bola blanca embocada (Scratch)',
    NO_HIT: 'Falta: No se golpeó ninguna bola',
    WRONG_FIRST_HIT: 'Falta: Se golpeó primero una bola contraria',
    NO_RAIL: 'Falta: Ninguna bola tocó banda tras el impacto',
    BALL_OFF_TABLE: 'Falta: Bola fuera de la mesa',
  };

  const nextActivePlayer = nextPlayers[nextTurnSeat]!;
  let statusMessage = '';
  if (foul) {
    statusMessage = `${foulLabelMap[foul]} · Bola en mano para ${nextActivePlayer.name}`;
  } else if (assignedGroup) {
    const grpEs = assignedGroup === 'solids' ? 'Lisas (1–7)' : 'Rayadas (9–15)';
    statusMessage = `${shooter.name} asigna ${grpEs} y continúa`;
  } else if (legalOwnPocketed) {
    statusMessage = `¡Buena bola! Continúa ${shooter.name}`;
  } else {
    statusMessage = `Turno de ${nextActivePlayer.name}`;
  }

  const cueBall = resolvedBalls.find((b) => b.id === 0)!;
  const nextState: Pool8BallState = {
    ...state,
    status: 'playing',
    phase: nextPhase,
    players: nextPlayers,
    turnSeat: nextTurnSeat,
    turnNumber: state.turnNumber + 1,
    isBreakShot: false,
    breakOnlyBehindHeadString: false,
    balls: resolvedBalls,
    calledPocketId: null,
    winnerSeat: null,
    winReason: null,
    lastFoul: foul,
    statusMessage,
    turnDeadlineAt: now + POOL_TURN_TIMEOUT_MS,
    lastShot: {
      shooterSeat,
      shooterUserId: shooter.userId,
      turnNumber: state.turnNumber,
      angle: shot.angle,
      power: shot.power,
      spinX: shot.spinX,
      spinY: shot.spinY,
      calledPocketId,
      cueStartX: cueBall.x,
      cueStartY: cueBall.y,
      pocketedBallIds: pocketedIds,
      foul,
      checksum: 0,
      executedAt: now,
    },
    updatedAt: now,
  };
  nextState.checksum = computePoolChecksum(nextState);
  if (nextState.lastShot) {
    nextState.lastShot.checksum = nextState.checksum;
  }

  return {
    nextState,
    foul,
    assignedGroup,
    turnContinued: nextTurnSeat === shooterSeat,
  };
}

export function applyPoolShot(
  state: Pool8BallState,
  userId: string,
  shot: PoolShotInput,
  now = Date.now()
):
  | {
      ok: true;
      state: Pool8BallState;
      foul: PoolFoulType | null;
      assignedGroup: PoolBallGroup | null;
      events: PoolPhysicsEvent[];
    }
  | { ok: false; error: string } {
  if (state.status !== 'playing' || state.phase === 'GAME_OVER') {
    return { ok: false, error: 'La partida no está activa' };
  }
  const active = state.players[state.turnSeat];
  if (!active || active.userId !== userId) {
    return { ok: false, error: 'No es tu turno' };
  }
  if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power)) {
    return { ok: false, error: 'Parámetros de tiro inválidos' };
  }
  if (shot.power < POOL_MIN_SHOT_POWER) {
    return { ok: false, error: 'Potencia insuficiente (tiro cancelado)' };
  }

  let workingState = state;
  if (
    typeof shot.cueX === 'number' &&
    typeof shot.cueY === 'number' &&
    (state.phase === 'BALL_IN_HAND' || state.isBreakShot)
  ) {
    const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
    if (isValidCueBallPlacement(state.balls, shot.cueX, shot.cueY, behindHead)) {
      workingState = {
        ...state,
        balls: state.balls.map((b) =>
          b.id === 0 ? { ...b, x: shot.cueX!, y: shot.cueY!, pocketed: false } : b
        ),
      };
    }
  }

  const effectiveCall = shot.calledPocketId ?? workingState.calledPocketId;
  const sim = simulatePoolShot(workingState.balls, shot);
  const resolved = resolvePoolShotOutcome(workingState, sim.runtime, effectiveCall, shot, now);
  return {
    ok: true,
    state: resolved.nextState,
    foul: resolved.foul,
    assignedGroup: resolved.assignedGroup,
    events: sim.events,
  };
}

export function forfeitPoolMatch(
  state: Pool8BallState,
  losingUserId: string,
  reason: 'forfeit' | 'timeout_forfeit' | 'disconnect_forfeit' = 'forfeit',
  now = Date.now()
): Pool8BallState | null {
  if (state.status === 'finished') return null;
  const idx = state.players.findIndex((p) => p?.userId === losingUserId);
  if (idx === -1) return null;
  const winnerSeat: 0 | 1 = idx === 0 ? 1 : 0;
  const loser = state.players[idx]!;
  const winner = state.players[winnerSeat];
  const reasonLabel =
    reason === 'timeout_forfeit'
      ? `${loser.name} agotó su tiempo`
      : reason === 'disconnect_forfeit'
      ? `${loser.name} se desconectó`
      : `${loser.name} se retiró`;

  const next: Pool8BallState = {
    ...state,
    status: 'finished',
    phase: 'GAME_OVER',
    winnerSeat,
    winReason: reason,
    statusMessage: `${reasonLabel} · ¡Gana ${winner?.name || 'el rival'}!`,
    turnDeadlineAt: 0,
    updatedAt: now,
  };
  next.checksum = computePoolChecksum(next);
  return next;
}

function getMirroredPocketsForBankShots(): Array<{
  pocket: PoolPocketDef;
  x: number;
  y: number;
}> {
  const out: Array<{ pocket: PoolPocketDef; x: number; y: number }> = [];
  for (const p of POOL_POCKETS) {
    out.push({ pocket: p, x: p.x, y: -p.y });
    out.push({ pocket: p, x: p.x, y: 2 * POOL_TABLE_H - p.y });
    out.push({ pocket: p, x: -p.x, y: p.y });
    out.push({ pocket: p, x: 2 * POOL_TABLE_W - p.x, y: p.y });
  }
  return out;
}

function isSegmentClearOfBalls(
  balls: PoolBallState[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ignoreIds: number[]
): boolean {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-6) return true;
  const radius = POOL_BALL_R * 2 - 2;
  const rSq = radius * radius;

  for (const b of balls) {
    if (b.pocketed || ignoreIds.includes(b.id)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - x1) * vx + (b.y - y1) * vy) / lenSq));
    const px = x1 + t * vx;
    const py = y1 + t * vy;
    const dSq = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
    if (dSq < rSq) return false;
  }
  return true;
}

export function getLegalTargetBallIds(state: Pool8BallState): number[] {
  const active = state.players[state.turnSeat];
  const group = active?.group ?? null;

  if (state.isBreakShot || group === null) {
    return state.balls
      .filter((b) => !b.pocketed && b.id !== 0 && b.id !== 8)
      .map((b) => b.id);
  }
  if (isOnEightBall(state.balls, group)) {
    return state.balls.filter((b) => !b.pocketed && b.id === 8).map((b) => b.id);
  }
  return state.balls
    .filter((b) => !b.pocketed && getBallGroup(b.id) === group)
    .map((b) => b.id);
}

export function choosePoolAiShot(
  state: Pool8BallState,
  difficulty: PoolDifficulty = state.difficulty,
  rngSeed?: number
): PoolShotInput & { cueX: number; cueY: number; calledPocketId: PoolPocketId | null } {
  const rng = createSeededRng(rngSeed ?? (state.seed ^ (state.turnNumber * 2654435761)));
  const legalIds = getLegalTargetBallIds(state);
  const cueOrigin = state.balls.find((b) => b.id === 0) || {
    id: 0,
    x: POOL_HEAD_STRING_X,
    y: POOL_FOOT_SPOT_Y,
    vx: 0,
    vy: 0,
    pocketed: false,
    pocketId: null,
    rollPhase: 0,
    rollAngle: 0,
  };

  if (state.isBreakShot) {
    const noiseAngle = seededGaussian(rng) * (difficulty === 'easy' ? 0.06 : 0.015);
    return {
      angle: 0.015 + noiseAngle,
      power: difficulty === 'easy' ? 0.78 : 0.94,
      spinX: 0,
      spinY: 0.25,
      cueX: cueOrigin.x,
      cueY: cueOrigin.y,
      calledPocketId: null,
    };
  }

  const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
  const candidateCuePositions: Array<{ x: number; y: number }> = [];
  if (state.phase === 'BALL_IN_HAND') {
    for (const tid of legalIds.slice(0, difficulty === 'hard' ? 5 : 3)) {
      const tb = state.balls.find((b) => b.id === tid);
      if (!tb) continue;
      for (const p of POOL_POCKETS) {
        const dx = p.x - tb.x;
        const dy = p.y - tb.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ghostX = tb.x - (dx / dist) * (POOL_BALL_R * 2);
        const ghostY = tb.y - (dy / dist) * (POOL_BALL_R * 2);
        const placeX = ghostX - (dx / dist) * 95;
        const placeY = ghostY - (dy / dist) * 95;
        if (isValidCueBallPlacement(state.balls, placeX, placeY, behindHead)) {
          candidateCuePositions.push({ x: placeX, y: placeY });
        }
      }
    }
    if (candidateCuePositions.length === 0) {
      candidateCuePositions.push(
        findNearestValidCueBallSpot(state.balls, POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, behindHead)
      );
    }
  } else {
    candidateCuePositions.push({ x: cueOrigin.x, y: cueOrigin.y });
  }

  interface CandidateShot {
    cueX: number;
    cueY: number;
    angle: number;
    power: number;
    spinX: number;
    spinY: number;
    calledPocketId: PoolPocketId;
    heuristicScore: number;
  }

  const candidates: CandidateShot[] = [];
  const mirrored = difficulty === 'easy' ? [] : getMirroredPocketsForBankShots();

  for (const cuePos of candidateCuePositions.slice(0, difficulty === 'hard' ? 6 : 3)) {
    for (const targetId of legalIds) {
      const tb = state.balls.find((b) => b.id === targetId);
      if (!tb || tb.pocketed) continue;

      for (const p of POOL_POCKETS) {
        const toPx = p.x - tb.x;
        const toPy = p.y - tb.y;
        const toPDist = Math.hypot(toPx, toPy) || 1;
        const gx = tb.x - (toPx / toPDist) * (POOL_BALL_R * 2);
        const gy = tb.y - (toPy / toPDist) * (POOL_BALL_R * 2);
        const cueToGx = gx - cuePos.x;
        const cueToGy = gy - cuePos.y;
        const cueDist = Math.hypot(cueToGx, cueToGy) || 1;

        const dot = (cueToGx / cueDist) * (toPx / toPDist) + (cueToGy / cueDist) * (toPy / toPDist);
        if (dot < 0.22) continue;

        if (
          !isSegmentClearOfBalls(state.balls, cuePos.x, cuePos.y, gx, gy, [0, tb.id]) ||
          !isSegmentClearOfBalls(state.balls, tb.x, tb.y, p.x, p.y, [0, tb.id])
        ) {
          continue;
        }

        const heuristic =
          dot * 120 - (toPDist + cueDist) * 0.08 + (tb.id === 8 ? 15 : 0);
        candidates.push({
          cueX: cuePos.x,
          cueY: cuePos.y,
          angle: Math.atan2(cueToGy, cueToGx),
          power: Math.min(0.88, Math.max(0.36, 0.34 + (cueDist + toPDist) / 1450)),
          spinX: 0,
          spinY: dot > 0.85 ? 0.15 : -0.1,
          calledPocketId: p.id,
          heuristicScore: heuristic,
        });
      }

      if (difficulty !== 'easy') {
        for (const mp of mirrored) {
          const toMx = mp.x - tb.x;
          const toMy = mp.y - tb.y;
          const toMDist = Math.hypot(toMx, toMy) || 1;
          const gx = tb.x - (toMx / toMDist) * (POOL_BALL_R * 2);
          const gy = tb.y - (toMy / toMDist) * (POOL_BALL_R * 2);
          const cueToGx = gx - cuePos.x;
          const cueToGy = gy - cuePos.y;
          const cueDist = Math.hypot(cueToGx, cueToGy) || 1;
          const dot =
            (cueToGx / cueDist) * (toMx / toMDist) + (cueToGy / cueDist) * (toMy / toMDist);
          if (dot < 0.45) continue;
          if (!isSegmentClearOfBalls(state.balls, cuePos.x, cuePos.y, gx, gy, [0, tb.id])) {
            continue;
          }
          const bankBias = difficulty === 'medium' ? (rng() - 0.5) * 0.045 : 0;
          candidates.push({
            cueX: cuePos.x,
            cueY: cuePos.y,
            angle: Math.atan2(cueToGy, cueToGx) + bankBias,
            power: Math.min(0.92, Math.max(0.5, 0.48 + (cueDist + toMDist) / 1600)),
            spinX: 0,
            spinY: 0,
            calledPocketId: mp.pocket.id,
            heuristicScore: dot * 75 - (cueDist + toMDist) * 0.09 - 35,
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    const cuePos = candidateCuePositions[0];
    for (const tid of legalIds) {
      const tb = state.balls.find((b) => b.id === tid);
      if (!tb) continue;
      const angle = Math.atan2(tb.y - cuePos.y, tb.x - cuePos.x);
      candidates.push({
        cueX: cuePos.x,
        cueY: cuePos.y,
        angle,
        power: 0.52,
        spinX: 0,
        spinY: 0,
        calledPocketId: POOL_POCKETS[0].id,
        heuristicScore: 10,
      });
    }
  }

  candidates.sort((a, b) => b.heuristicScore - a.heuristicScore);
  const evalDepth = difficulty === 'hard' ? 14 : difficulty === 'medium' ? 8 : 4;
  const shortlist = candidates.slice(0, evalDepth);

  let bestShot = shortlist[0] || {
    cueX: cueOrigin.x,
    cueY: cueOrigin.y,
    angle: 0,
    power: 0.55,
    spinX: 0,
    spinY: 0,
    calledPocketId: POOL_POCKETS[2].id,
    heuristicScore: 0,
  };
  let bestScore = -Infinity;

  const activeSeat = state.players[state.turnSeat];
  const botGroup = activeSeat?.group ?? null;

  for (const cand of shortlist) {
    const simBalls = state.balls.map((b) =>
      b.id === 0 ? { ...b, x: cand.cueX, y: cand.cueY, pocketed: false } : { ...b }
    );
    const { runtime } = simulatePoolShot(simBalls, cand, 10);
    const resolved = resolvePoolShotOutcome(
      { ...state, balls: simBalls },
      runtime,
      cand.calledPocketId,
      cand
    );

    let score = 0;
    if (resolved.nextState.status === 'finished') {
      score += resolved.nextState.winnerSeat === state.turnSeat ? 10_000 : -10_000;
    } else {
      if (resolved.foul) score -= 1200;
      const pocketedObj = runtime.pocketedOrder.filter((e) => e.ballId !== 0);
      for (const p of pocketedObj) {
        if (p.ballId === 8) score -= 9000;
        else if (!botGroup || getBallGroup(p.ballId) === botGroup) score += 900;
        else score -= 180;
      }
      if (resolved.turnContinued) score += 350;

      const postCue = runtime.balls.find((b) => b.id === 0);
      if (postCue && !postCue.pocketed) {
        const edgeDist = Math.min(
          postCue.x,
          POOL_TABLE_W - postCue.x,
          postCue.y,
          POOL_TABLE_H - postCue.y
        );
        score += Math.min(80, edgeDist * 0.6);

        let minNextDist = 600;
        for (const b of runtime.balls) {
          if (
            !b.pocketed &&
            b.id !== 0 &&
            (botGroup ? getBallGroup(b.id) === botGroup : b.id !== 8)
          ) {
            const d = Math.hypot(b.x - postCue.x, b.y - postCue.y);
            if (d < minNextDist) minNextDist = d;
          }
        }
        score += Math.max(0, 220 - minNextDist * 0.4);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestShot = cand;
    }
  }

  const angleSigma = difficulty === 'easy' ? 0.045 : difficulty === 'medium' ? 0.017 : 0.0045;
  const powerSigma = difficulty === 'easy' ? 0.13 : difficulty === 'medium' ? 0.06 : 0.02;

  const finalAngle = bestShot.angle + seededGaussian(rng) * angleSigma;
  const finalPower = Math.max(
    POOL_MIN_SHOT_POWER + 0.06,
    Math.min(0.98, bestShot.power + seededGaussian(rng) * powerSigma)
  );

  return {
    angle: finalAngle,
    power: finalPower,
    spinX: bestShot.spinX,
    spinY: bestShot.spinY,
    cueX: bestShot.cueX,
    cueY: bestShot.cueY,
    calledPocketId: bestShot.calledPocketId,
  };
}
