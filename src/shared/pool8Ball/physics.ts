import {
  POOL_BALL_R,
  POOL_BALL_RESTITUTION,
  POOL_CUSHION_RESTITUTION,
  POOL_FIXED_DT,
  POOL_JAW_KNUCKLES,
  POOL_LINEAR_DRAG,
  POOL_MAX_SHOT_SPEED,
  POOL_MIN_SHOT_POWER,
  POOL_MIN_SHOT_SPEED,
  POOL_POCKETS,
  POOL_RAIL_SEGMENTS,
  POOL_ROLL_DECEL,
  POOL_STOP_SPEED,
  POOL_TABLE_H,
  POOL_TABLE_W,
  type PoolAimPrediction,
  type PoolBallState,
  type PoolJawKnuckle,
  type PoolPhysicsEvent,
  type PoolPocketDef,
  type PoolRailSegment,
  type PoolShotInput,
  type PoolSimRuntime,
} from './types.ts';

interface ToiHit {
  t: number;
  kind: 'ball_ball' | 'rail' | 'jaw' | 'pocket';
  idxA: number;
  idxB?: number;
  rail?: PoolRailSegment;
  jaw?: PoolJawKnuckle;
  pocket?: PoolPocketDef;
}

function solveCircleCircleToi(
  dx: number,
  dy: number,
  dvx: number,
  dvy: number,
  minDist: number,
  maxDt: number
): number | null {
  const a = dvx * dvx + dvy * dvy;
  const b = dx * dvx + dy * dvy;
  const c = dx * dx + dy * dy - minDist * minDist;

  if (c <= 0) {
    return b < -1e-9 ? 0 : null;
  }
  if (a <= 1e-12 || b >= 0) return null;

  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t >= 0 && t <= maxDt) return t;
  return null;
}

function solveBallRailToi(
  ball: PoolBallState,
  seg: PoolRailSegment,
  maxDt: number
): number | null {
  if (seg.axis === 'h') {
    const vn = ball.vy * seg.normal;
    if (vn >= -1e-9) return null;
    const plane = seg.coord + seg.normal * POOL_BALL_R;
    const distPast = (ball.y - plane) * seg.normal;
    let t = distPast <= 0 ? 0 : (plane - ball.y) / ball.vy;
    if (t < 0) t = 0;
    if (t > maxDt) return null;
    const xAtT = ball.x + ball.vx * t;
    if (xAtT >= seg.min && xAtT <= seg.max) return t;
    return null;
  } else {
    const vn = ball.vx * seg.normal;
    if (vn >= -1e-9) return null;
    const plane = seg.coord + seg.normal * POOL_BALL_R;
    const distPast = (ball.x - plane) * seg.normal;
    let t = distPast <= 0 ? 0 : (plane - ball.x) / ball.vx;
    if (t < 0) t = 0;
    if (t > maxDt) return null;
    const yAtT = ball.y + ball.vy * t;
    if (yAtT >= seg.min && yAtT <= seg.max) return t;
    return null;
  }
}

function findEarliestHit(balls: PoolBallState[], maxDt: number): ToiHit | null {
  let best: ToiHit | null = null;
  const minBallDist = POOL_BALL_R * 2;

  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i];
    if (b.pocketed) continue;
    const moving = b.vx !== 0 || b.vy !== 0;
    for (const p of POOL_POCKETS) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx * dx + dy * dy <= p.captureR * p.captureR) {
        return { t: 0, kind: 'pocket', idxA: i, pocket: p };
      }
      if (moving) {
        const t = solveCircleCircleToi(dx, dy, b.vx, b.vy, p.captureR, maxDt);
        if (t !== null && (!best || t < best.t)) {
          best = { t, kind: 'pocket', idxA: i, pocket: p };
        }
      }
    }
  }

  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];
    if (a.pocketed) continue;
    const aMoving = a.vx !== 0 || a.vy !== 0;
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      if (b.pocketed) continue;
      if (!aMoving && b.vx === 0 && b.vy === 0) continue;
      const t = solveCircleCircleToi(
        a.x - b.x,
        a.y - b.y,
        a.vx - b.vx,
        a.vy - b.vy,
        minBallDist,
        best ? best.t : maxDt
      );
      if (t !== null && (!best || t < best.t)) {
        best = { t, kind: 'ball_ball', idxA: i, idxB: j };
      }
    }
  }

  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i];
    if (b.pocketed) continue;
    if (b.vx === 0 && b.vy === 0) continue;
    for (const seg of POOL_RAIL_SEGMENTS) {
      const t = solveBallRailToi(b, seg, best ? best.t : maxDt);
      if (t !== null && (!best || t < best.t)) {
        best = { t, kind: 'rail', idxA: i, rail: seg };
      }
    }
    for (const jaw of POOL_JAW_KNUCKLES) {
      const t = solveCircleCircleToi(
        b.x - jaw.x,
        b.y - jaw.y,
        b.vx,
        b.vy,
        POOL_BALL_R + jaw.r,
        best ? best.t : maxDt
      );
      if (t !== null && (!best || t < best.t)) {
        best = { t, kind: 'jaw', idxA: i, jaw };
      }
    }
  }

  return best;
}

function advanceBallsAndApplyFriction(runtime: PoolSimRuntime, dt: number): void {
  if (dt <= 0) return;

  for (const b of runtime.balls) {
    if (b.pocketed) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.id === 0 && (Math.abs(runtime.cueSpinY) > 1 || Math.abs(runtime.cueSpinX) > 1)) {
      if (runtime.cueFirstImpactDone && Math.abs(runtime.cueSpinY) > 1) {
        const spinTransfer = runtime.cueSpinY * Math.min(1, dt * 6.5);
        b.vx += runtime.shotDirX * spinTransfer;
        b.vy += runtime.shotDirY * spinTransfer;
        runtime.cueSpinY -= spinTransfer;
      } else {
        const decay = Math.exp(-0.55 * dt);
        runtime.cueSpinY *= decay;
      }
      if (!runtime.cueFirstImpactDone && Math.abs(runtime.cueSpinX) > 1) {
        const perpX = -runtime.shotDirY;
        const perpY = runtime.shotDirX;
        b.vx += perpX * runtime.cueSpinX * 0.025 * dt;
        b.vy += perpY * runtime.cueSpinX * 0.025 * dt;
      }
    }

    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      b.rollAngle = Math.atan2(b.vy, b.vx);
      b.rollPhase += (speed * dt) / POOL_BALL_R;
      const decel = POOL_ROLL_DECEL + speed * POOL_LINEAR_DRAG;
      const nextSpeed = Math.max(0, speed - decel * dt);
      if (nextSpeed < POOL_STOP_SPEED) {
        b.vx = 0;
        b.vy = 0;
        if (b.id === 0 && Math.abs(runtime.cueSpinY) < 40) {
          runtime.cueSpinX = 0;
          runtime.cueSpinY = 0;
        }
      } else {
        const scale = nextSpeed / speed;
        b.vx *= scale;
        b.vy *= scale;
      }
    }

    if (b.x < -30 || b.x > POOL_TABLE_W + 30 || b.y < -30 || b.y > POOL_TABLE_H + 30) {
      b.pocketed = true;
      b.offTable = true;
      b.vx = 0;
      b.vy = 0;
      runtime.offTableBallIds.push(b.id);
    }
  }
}

export function createPoolSimRuntime(
  balls: PoolBallState[],
  shot: PoolShotInput
): PoolSimRuntime {
  const power = Math.max(POOL_MIN_SHOT_POWER, Math.min(1, shot.power));
  const speed = POOL_MIN_SHOT_SPEED + (POOL_MAX_SHOT_SPEED - POOL_MIN_SHOT_SPEED) * power * power * 0.72 + (POOL_MAX_SHOT_SPEED - POOL_MIN_SHOT_SPEED) * power * 0.28;
  const dirX = Math.cos(shot.angle);
  const dirY = Math.sin(shot.angle);

  const cloned = balls.map((b) => ({
    ...b,
    vx: 0,
    vy: 0,
  }));
  const cue = cloned.find((b) => b.id === 0);
  if (cue) {
    if (typeof shot.cueX === 'number' && typeof shot.cueY === 'number') {
      cue.x = shot.cueX;
      cue.y = shot.cueY;
    }
    cue.pocketed = false;
    cue.pocketId = null;
    cue.offTable = false;
    cue.vx = dirX * speed;
    cue.vy = dirY * speed;
  }

  const spinX = Math.max(-1, Math.min(1, shot.spinX || 0));
  const spinY = Math.max(-1, Math.min(1, shot.spinY || 0));

  return {
    balls: cloned,
    cueSpinX: spinX * speed * 0.42,
    cueSpinY: spinY * speed * 0.68,
    shotDirX: dirX,
    shotDirY: dirY,
    cueFirstImpactDone: false,
    firstHitBallId: null,
    railTouchedAfterHit: false,
    pocketedOrder: [],
    offTableBallIds: [],
    elapsed: 0,
  };
}

export function isPoolRuntimeMoving(runtime: PoolSimRuntime): boolean {
  if (Math.abs(runtime.cueSpinY) > 12 && runtime.cueFirstImpactDone) {
    return true;
  }
  for (const b of runtime.balls) {
    if (!b.pocketed && (b.vx !== 0 || b.vy !== 0)) return true;
  }
  return false;
}

export function stepPoolPhysicsSubstep(
  runtime: PoolSimRuntime,
  dt = POOL_FIXED_DT
): PoolPhysicsEvent[] {
  const events: PoolPhysicsEvent[] = [];
  let remaining = dt;
  let iterations = 0;

  while (remaining > 1e-7 && iterations < 18) {
    iterations += 1;
    const hit = findEarliestHit(runtime.balls, remaining);
    if (!hit) {
      advanceBallsAndApplyFriction(runtime, remaining);
      runtime.elapsed += remaining;
      remaining = 0;
      break;
    }

    if (hit.t > 0) {
      advanceBallsAndApplyFriction(runtime, hit.t);
      runtime.elapsed += hit.t;
      remaining -= hit.t;
    }

    if (hit.kind === 'pocket' && hit.pocket) {
      const b = runtime.balls[hit.idxA];
      const speed = Math.hypot(b.vx, b.vy);
      b.pocketed = true;
      b.pocketId = hit.pocket.id;
      b.vx = 0;
      b.vy = 0;
      runtime.pocketedOrder.push({ ballId: b.id, pocketId: hit.pocket.id });
      events.push({
        type: 'pocket_drop',
        time: runtime.elapsed,
        ballA: b.id,
        pocketId: hit.pocket.id,
        speed,
        x: hit.pocket.x,
        y: hit.pocket.y,
      });
    } else if (hit.kind === 'ball_ball' && hit.idxB !== undefined) {
      const a = runtime.balls[hit.idxA];
      const b = runtime.balls[hit.idxB];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const nx = dist > 1e-8 ? dx / dist : 1;
      const ny = dist > 1e-8 ? dy / dist : 0;

      const overlap = POOL_BALL_R * 2 - dist;
      if (overlap > 0) {
        const push = overlap * 0.5 + 0.002;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        dist = POOL_BALL_R * 2;
      }

      const rvx = a.vx - b.vx;
      const rvy = a.vy - b.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn > 0) {
        const j = 0.5 * (1 + POOL_BALL_RESTITUTION) * vn;
        a.vx -= j * nx;
        a.vy -= j * ny;
        b.vx += j * nx;
        b.vy += j * ny;

        if ((a.id === 0 || b.id === 0) && runtime.firstHitBallId === null) {
          runtime.firstHitBallId = a.id === 0 ? b.id : a.id;
          runtime.cueFirstImpactDone = true;

          const cue = a.id === 0 ? a : b;
          if (Math.abs(runtime.cueSpinY) > 1) {
            const kick = runtime.cueSpinY * 0.52;
            cue.vx += runtime.shotDirX * kick;
            cue.vy += runtime.shotDirY * kick;
            runtime.cueSpinY -= kick;
          }
        }

        events.push({
          type: 'ball_ball',
          time: runtime.elapsed,
          ballA: a.id,
          ballB: b.id,
          speed: vn,
          x: (a.x + b.x) * 0.5,
          y: (a.y + b.y) * 0.5,
        });
      }
    } else if (hit.kind === 'rail' && hit.rail) {
      const b = runtime.balls[hit.idxA];
      const seg = hit.rail;
      if (seg.axis === 'h') {
        const vn = b.vy * seg.normal;
        if (vn < 0) {
          const impact = Math.abs(vn);
          b.y = seg.coord + seg.normal * (POOL_BALL_R + 0.01);
          b.vy = -b.vy * POOL_CUSHION_RESTITUTION;
          if (b.id === 0 && Math.abs(runtime.cueSpinX) > 1) {
            const tangentImpulse = runtime.cueSpinX * 0.34 * seg.normal;
            b.vx += tangentImpulse;
            runtime.cueSpinX *= 0.55;
          }
          if (runtime.firstHitBallId !== null) {
            runtime.railTouchedAfterHit = true;
          }
          events.push({
            type: 'cushion',
            time: runtime.elapsed,
            ballA: b.id,
            speed: impact,
            x: b.x,
            y: seg.coord,
          });
        }
      } else {
        const vn = b.vx * seg.normal;
        if (vn < 0) {
          const impact = Math.abs(vn);
          b.x = seg.coord + seg.normal * (POOL_BALL_R + 0.01);
          b.vx = -b.vx * POOL_CUSHION_RESTITUTION;
          if (b.id === 0 && Math.abs(runtime.cueSpinX) > 1) {
            const tangentImpulse = -runtime.cueSpinX * 0.34 * seg.normal;
            b.vy += tangentImpulse;
            runtime.cueSpinX *= 0.55;
          }
          if (runtime.firstHitBallId !== null) {
            runtime.railTouchedAfterHit = true;
          }
          events.push({
            type: 'cushion',
            time: runtime.elapsed,
            ballA: b.id,
            speed: impact,
            x: seg.coord,
            y: b.y,
          });
        }
      }
    } else if (hit.kind === 'jaw' && hit.jaw) {
      const b = runtime.balls[hit.idxA];
      const dx = b.x - hit.jaw.x;
      const dy = b.y - hit.jaw.y;
      const dist = Math.hypot(dx, dy);
      const nx = dist > 1e-8 ? dx / dist : 1;
      const ny = dist > 1e-8 ? dy / dist : 0;
      const minD = POOL_BALL_R + hit.jaw.r;
      if (dist < minD) {
        b.x = hit.jaw.x + nx * (minD + 0.01);
        b.y = hit.jaw.y + ny * (minD + 0.01);
      }
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + POOL_CUSHION_RESTITUTION) * vn * nx;
        b.vy -= (1 + POOL_CUSHION_RESTITUTION) * vn * ny;
        if (runtime.firstHitBallId !== null) {
          runtime.railTouchedAfterHit = true;
        }
        events.push({
          type: 'cushion',
          time: runtime.elapsed,
          ballA: b.id,
          speed: Math.abs(vn),
          x: hit.jaw.x,
          y: hit.jaw.y,
        });
      }
    }
  }

  return events;
}

export function simulatePoolShot(
  balls: PoolBallState[],
  shot: PoolShotInput,
  maxSeconds = 18
): {
  runtime: PoolSimRuntime;
  events: PoolPhysicsEvent[];
  ticks: number;
} {
  const runtime = createPoolSimRuntime(balls, shot);
  const events: PoolPhysicsEvent[] = [];
  const maxTicks = Math.round(maxSeconds / POOL_FIXED_DT);
  let ticks = 0;

  while (ticks < maxTicks && isPoolRuntimeMoving(runtime)) {
    const stepEvents = stepPoolPhysicsSubstep(runtime, POOL_FIXED_DT);
    if (stepEvents.length > 0) events.push(...stepEvents);
    ticks += 1;
  }

  for (const b of runtime.balls) {
    b.vx = 0;
    b.vy = 0;
  }

  return { runtime, events, ticks };
}

export function computeAimPrediction(
  balls: PoolBallState[],
  angle: number,
  spinY = 0
): PoolAimPrediction {
  const cue = balls.find((b) => b.id === 0);
  if (!cue || cue.pocketed) {
    return {
      hitType: 'none',
      hitBallId: null,
      ghostX: 0,
      ghostY: 0,
      targetEndX: 0,
      targetEndY: 0,
      cueDeflectX: 0,
      cueDeflectY: 0,
      cutAngleRad: 0,
    };
  }

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minT = Infinity;
  let hitBall: PoolBallState | null = null;
  const minDist = POOL_BALL_R * 2;

  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const ocX = cue.x - b.x;
    const ocY = cue.y - b.y;
    const proj = ocX * dx + ocY * dy;
    if (proj >= 0) continue;
    const c = ocX * ocX + ocY * ocY - minDist * minDist;
    const disc = proj * proj - c;
    if (disc < 0) continue;
    const t = -proj - Math.sqrt(disc);
    if (t >= 0 && t < minT) {
      minT = t;
      hitBall = b;
    }
  }

  let wallT = Infinity;
  if (dx > 1e-6) wallT = Math.min(wallT, (POOL_TABLE_W - POOL_BALL_R - cue.x) / dx);
  if (dx < -1e-6) wallT = Math.min(wallT, (POOL_BALL_R - cue.x) / dx);
  if (dy > 1e-6) wallT = Math.min(wallT, (POOL_TABLE_H - POOL_BALL_R - cue.y) / dy);
  if (dy < -1e-6) wallT = Math.min(wallT, (POOL_BALL_R - cue.y) / dy);

  if (hitBall && minT <= wallT) {
    const gx = cue.x + dx * minT;
    const gy = cue.y + dy * minT;
    const tx = hitBall.x - gx;
    const ty = hitBall.y - gy;
    const tLen = Math.hypot(tx, ty) || 1;
    const nX = tx / tLen;
    const nY = ty / tLen;

    let tangX = dx - (dx * nX + dy * nY) * nX;
    let tangY = dy - (dx * nX + dy * nY) * nY;
    const tangLen = Math.hypot(tangX, tangY);
    if (tangLen > 1e-4) {
      tangX /= tangLen;
      tangY /= tangLen;
    } else {
      tangX = dx;
      tangY = dy;
    }

    const cueGuideX = tangX + dx * (spinY * 0.65);
    const cueGuideY = tangY + dy * (spinY * 0.65);
    const cgLen = Math.hypot(cueGuideX, cueGuideY) || 1;
    const guideDist = 85;
    const targetDist = 115;

    return {
      hitType: 'ball',
      hitBallId: hitBall.id,
      ghostX: gx,
      ghostY: gy,
      targetEndX: hitBall.x + nX * targetDist,
      targetEndY: hitBall.y + nY * targetDist,
      cueDeflectX: gx + (cueGuideX / cgLen) * guideDist,
      cueDeflectY: gy + (cueGuideY / cgLen) * guideDist,
      cutAngleRad: Math.acos(Math.max(-1, Math.min(1, dx * nX + dy * nY))),
    };
  }

  const finalT = Number.isFinite(wallT) ? Math.max(0, wallT) : 300;
  return {
    hitType: 'rail',
    hitBallId: null,
    ghostX: cue.x + dx * finalT,
    ghostY: cue.y + dy * finalT,
    targetEndX: cue.x + dx * finalT,
    targetEndY: cue.y + dy * finalT,
    cueDeflectX: cue.x + dx * finalT,
    cueDeflectY: cue.y + dy * finalT,
    cutAngleRad: 0,
  };
}
