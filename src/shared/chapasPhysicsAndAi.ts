import {
  CHAPAS_ARENA_W,
  CHAPAS_BALL_RADIUS,
  CHAPAS_CAP_RADIUS,
  CHAPAS_GOAL_DEPTH,
  CHAPAS_GOAL_LEFT,
  CHAPAS_GOAL_RIGHT,
  CHAPAS_GOALPOST_RADIUS,
  CHAPAS_PITCH_BOTTOM,
  CHAPAS_PITCH_LEFT,
  CHAPAS_PITCH_RIGHT,
  CHAPAS_PITCH_TOP,
  CHAPAS_SUBSTEPS,
  type ChapasBall,
  type ChapasCap,
  type ChapasShotInput,
  type ChapasTeamId,
  type FutbolChapasState,
} from './futbolChapas.ts';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ChapasPhysicsStepResult {
  anyMoving: boolean;
  ballTouched: boolean;
  goalScoredBy: ChapasTeamId | null;
  capHitCount: number;
  ballHitCount: number;
  postHitCount: number;
}

export function stepChapasPhysicsFrame(
  caps: ChapasCap[],
  ball: ChapasBall
): ChapasPhysicsStepResult {
  let ballTouched = false;
  let goalScoredBy: ChapasTeamId | null = null;
  let capHitCount = 0;
  let ballHitCount = 0;
  let postHitCount = 0;

  const capMass = 2.6;
  const ballMass = 1.0;

  for (let sub = 0; sub < CHAPAS_SUBSTEPS; sub += 1) {
    const dt = 1 / CHAPAS_SUBSTEPS;

    // 1. Integrate positions
    for (const c of caps) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spinAngle += Math.hypot(ball.vx, ball.vy) * dt * 0.08;

    // 2. Cap-Wall collisions (keep caps inside pitch rails)
    for (const c of caps) {
      if (c.x < CHAPAS_PITCH_LEFT + CHAPAS_CAP_RADIUS) {
        c.x = CHAPAS_PITCH_LEFT + CHAPAS_CAP_RADIUS;
        c.vx = Math.abs(c.vx) * 0.78;
      } else if (c.x > CHAPAS_PITCH_RIGHT - CHAPAS_CAP_RADIUS) {
        c.x = CHAPAS_PITCH_RIGHT - CHAPAS_CAP_RADIUS;
        c.vx = -Math.abs(c.vx) * 0.78;
      }

      if (c.y < CHAPAS_PITCH_TOP + CHAPAS_CAP_RADIUS) {
        c.y = CHAPAS_PITCH_TOP + CHAPAS_CAP_RADIUS;
        c.vy = Math.abs(c.vy) * 0.78;
      } else if (c.y > CHAPAS_PITCH_BOTTOM - CHAPAS_CAP_RADIUS) {
        c.y = CHAPAS_PITCH_BOTTOM - CHAPAS_CAP_RADIUS;
        c.vy = -Math.abs(c.vy) * 0.78;
      }
    }

    // 3. Ball-Wall & Goal Mouth / Net collisions
    const inGoalMouthX =
      ball.x > CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS * 0.35 &&
      ball.x < CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS * 0.35;

    if (ball.x < CHAPAS_PITCH_LEFT + CHAPAS_BALL_RADIUS) {
      ball.x = CHAPAS_PITCH_LEFT + CHAPAS_BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.82;
    } else if (ball.x > CHAPAS_PITCH_RIGHT - CHAPAS_BALL_RADIUS) {
      ball.x = CHAPAS_PITCH_RIGHT - CHAPAS_BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.82;
    }

    // Top wall or inside Top Goal
    if (ball.y < CHAPAS_PITCH_TOP + CHAPAS_BALL_RADIUS) {
      if (inGoalMouthX) {
        if (ball.x < CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS;
          ball.vx = Math.abs(ball.vx) * 0.55;
        } else if (ball.x > CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx) * 0.55;
        }
        if (ball.y < CHAPAS_PITCH_TOP - CHAPAS_GOAL_DEPTH + CHAPAS_BALL_RADIUS) {
          ball.y = CHAPAS_PITCH_TOP - CHAPAS_GOAL_DEPTH + CHAPAS_BALL_RADIUS;
          ball.vy = Math.abs(ball.vy) * 0.35;
        }
        if (ball.y < CHAPAS_PITCH_TOP - CHAPAS_BALL_RADIUS * 0.4 && !goalScoredBy) {
          goalScoredBy = 'B';
        }
      } else {
        ball.y = CHAPAS_PITCH_TOP + CHAPAS_BALL_RADIUS;
        ball.vy = Math.abs(ball.vy) * 0.82;
      }
    }

    // Bottom wall or inside Bottom Goal
    if (ball.y > CHAPAS_PITCH_BOTTOM - CHAPAS_BALL_RADIUS) {
      if (inGoalMouthX) {
        if (ball.x < CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS;
          ball.vx = Math.abs(ball.vx) * 0.55;
        } else if (ball.x > CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx) * 0.55;
        }
        if (ball.y > CHAPAS_PITCH_BOTTOM + CHAPAS_GOAL_DEPTH - CHAPAS_BALL_RADIUS) {
          ball.y = CHAPAS_PITCH_BOTTOM + CHAPAS_GOAL_DEPTH - CHAPAS_BALL_RADIUS;
          ball.vy = -Math.abs(ball.vy) * 0.35;
        }
        if (ball.y > CHAPAS_PITCH_BOTTOM + CHAPAS_BALL_RADIUS * 0.4 && !goalScoredBy) {
          goalScoredBy = 'A';
        }
      } else {
        ball.y = CHAPAS_PITCH_BOTTOM - CHAPAS_BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy) * 0.82;
      }
    }

    // 4. Ball vs Goalposts (cylindrical posts)
    const minPostDist = CHAPAS_BALL_RADIUS + CHAPAS_GOALPOST_RADIUS;
    const goalposts = [
      { x: CHAPAS_GOAL_LEFT, y: CHAPAS_PITCH_TOP },
      { x: CHAPAS_GOAL_RIGHT, y: CHAPAS_PITCH_TOP },
      { x: CHAPAS_GOAL_LEFT, y: CHAPAS_PITCH_BOTTOM },
      { x: CHAPAS_GOAL_RIGHT, y: CHAPAS_PITCH_BOTTOM },
    ];
    for (const post of goalposts) {
      const dx = ball.x - post.x;
      const dy = ball.y - post.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0001 && dist < minPostDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minPostDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          const j = -(1 + 0.8) * vn;
          ball.vx += j * nx;
          ball.vy += j * ny;
          postHitCount += 1;
        }
      }
    }

    // 5. Cap-Cap collisions
    const minCapDist = CHAPAS_CAP_RADIUS * 2;
    for (let i = 0; i < caps.length; i += 1) {
      for (let j = i + 1; j < caps.length; j += 1) {
        const a = caps[i];
        const b = caps[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.0001 && dist < minCapDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minCapDist - dist) * 0.5;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal < 0) {
            const restitution = 0.86;
            const impulse = (-(1 + restitution) * velAlongNormal) / (1 / capMass + 1 / capMass);
            const ix = impulse * nx;
            const iy = impulse * ny;
            a.vx -= ix / capMass;
            a.vy -= iy / capMass;
            b.vx += ix / capMass;
            b.vy += iy / capMass;
            if (Math.abs(velAlongNormal) > 0.6) capHitCount += 1;
          }
        }
      }
    }

    // 6. Cap-Ball collisions
    const minCapBallDist = CHAPAS_CAP_RADIUS + CHAPAS_BALL_RADIUS;
    for (const c of caps) {
      const dx = ball.x - c.x;
      const dy = ball.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0001 && dist < minCapBallDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minCapBallDist - dist;
        c.x -= nx * overlap * 0.25;
        c.y -= ny * overlap * 0.25;
        ball.x += nx * overlap * 0.75;
        ball.y += ny * overlap * 0.75;

        const rvx = ball.vx - c.vx;
        const rvy = ball.vy - c.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          const restitution = 0.88;
          const impulse = (-(1 + restitution) * velAlongNormal) / (1 / capMass + 1 / ballMass);
          const ix = impulse * nx;
          const iy = impulse * ny;
          c.vx -= ix / capMass;
          c.vy -= iy / capMass;
          ball.vx += ix / ballMass;
          ball.vy += iy / ballMass;
          ballTouched = true;
          if (Math.abs(velAlongNormal) > 0.5) ballHitCount += 1;
        }
      }
    }
  }

  // 7. Apply smooth turf friction per 60Hz frame
  let anyMoving = false;
  for (const c of caps) {
    c.vx *= 0.962;
    c.vy *= 0.962;
    if (Math.hypot(c.vx, c.vy) < 0.065) {
      c.vx = 0;
      c.vy = 0;
    } else {
      anyMoving = true;
    }
  }

  ball.vx *= 0.976;
  ball.vy *= 0.976;
  if (Math.hypot(ball.vx, ball.vy) < 0.065) {
    ball.vx = 0;
    ball.vy = 0;
  } else {
    anyMoving = true;
  }

  return {
    anyMoving,
    ballTouched,
    goalScoredBy,
    capHitCount,
    ballHitCount,
    postHitCount,
  };
}

export function chooseChapasAiShot(state: FutbolChapasState): ChapasShotInput | null {
  if (state.status !== 'playing') return null;
  const teamCaps = state.caps.filter((c) => c.team === state.activeTeam);
  if (teamCaps.length === 0) return null;

  const ball = state.ball;
  const targetGoalY = state.activeTeam === 'A' ? CHAPAS_PITCH_BOTTOM : CHAPAS_PITCH_TOP;
  const targetGoalX = CHAPAS_ARENA_W / 2;

  const goalDx = targetGoalX - ball.x;
  const goalDy = targetGoalY - ball.y;
  const goalDist = Math.max(1, Math.hypot(goalDx, goalDy));
  const goalNx = goalDx / goalDist;
  const goalNy = goalDy / goalDist;

  const ghostX = clamp(
    ball.x - goalNx * (CHAPAS_CAP_RADIUS + CHAPAS_BALL_RADIUS * 0.85),
    CHAPAS_PITCH_LEFT + CHAPAS_CAP_RADIUS,
    CHAPAS_PITCH_RIGHT - CHAPAS_CAP_RADIUS
  );
  const ghostY = clamp(
    ball.y - goalNy * (CHAPAS_CAP_RADIUS + CHAPAS_BALL_RADIUS * 0.85),
    CHAPAS_PITCH_TOP + CHAPAS_CAP_RADIUS,
    CHAPAS_PITCH_BOTTOM - CHAPAS_CAP_RADIUS
  );

  let bestCap = teamCaps[0];
  let bestScore = -Infinity;
  let bestAngle = 0;
  let bestPower = 0.72;

  for (const cap of teamCaps) {
    const dx = ghostX - cap.x;
    const dy = ghostY - cap.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const shootNx = dx / dist;
    const shootNy = dy / dist;

    const alignment = shootNx * goalNx + shootNy * goalNy;
    const keeperPenalty = cap.number === 1 && dist > 140 ? 220 : 0;
    const score = alignment * 260 - dist * 0.85 - keeperPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestCap = cap;
      bestAngle = Math.atan2(dy, dx);
      bestPower = clamp(0.42 + dist / 460, 0.45, 0.94);
    }
  }

  return {
    capId: bestCap.id,
    angle: bestAngle,
    power: bestPower,
  };
}
