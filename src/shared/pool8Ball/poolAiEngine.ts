import {
  createSeededRng,
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
  seededGaussian,
  type Pool8BallState,
  type PoolBallState,
  type PoolDifficulty,
  type PoolPocketDef,
  type PoolPocketId,
  type PoolShotInput,
} from './types.ts';
import { simulatePoolShot } from './physics.ts';
import { resolvePoolShotOutcome } from './rulesAndAi.ts';

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
