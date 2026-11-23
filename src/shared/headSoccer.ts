/**
 * Head Soccer ("Fútbol Cabezones") — Deterministic 2D Arcade Physics & Room Match State
 */

import {
  HS_ARENA_W,
  HS_ARENA_H,
  HS_GROUND_Y,
  HS_GOAL_W,
  HS_GOAL_H,
  HS_CROSSBAR_Y,
  HS_POST_RADIUS,
  HS_HEAD_RADIUS,
  HS_BALL_RADIUS,
  HS_MATCH_DURATION_SEC,
} from './headSoccerConstants.ts';

export {
  HS_ARENA_W,
  HS_ARENA_H,
  HS_GROUND_Y,
  HS_GOAL_W,
  HS_GOAL_H,
  HS_CROSSBAR_Y,
  HS_POST_RADIUS,
  HS_HEAD_RADIUS,
  HS_BALL_RADIUS,
  HS_MATCH_DURATION_SEC,
};

export type HeadSoccerSkinId =
  | 'striker'
  | 'maestro'
  | 'furia'
  | 'astro'
  | 'titan'
  | 'ninja';

export interface HeadSoccerSkin {
  id: HeadSoccerSkinId;
  name: string;
  primary: string;
  secondary: string;
  hair: string;
  skinTone: string;
  boot: string;
}

export const HS_SKINS: HeadSoccerSkin[] = [
  {
    id: 'striker',
    name: 'El Rayo',
    primary: '#9146FF',
    secondary: '#FACC15',
    hair: '#1E1B4B',
    skinTone: '#F6C6A5',
    boot: '#FACC15',
  },
  {
    id: 'maestro',
    name: 'El Mago',
    primary: '#06B6D4',
    secondary: '#FFFFFF',
    hair: '#27272A',
    skinTone: '#EDC19E',
    boot: '#38BDF8',
  },
  {
    id: 'furia',
    name: 'Furia Roja',
    primary: '#EF4444',
    secondary: '#FDE047',
    hair: '#451A03',
    skinTone: '#F3B890',
    boot: '#FB7185',
  },
  {
    id: 'astro',
    name: 'Astro Verde',
    primary: '#10B981',
    secondary: '#ECFDF5',
    hair: '#064E3B',
    skinTone: '#C98A63',
    boot: '#34D399',
  },
  {
    id: 'titan',
    name: 'Titán Azul',
    primary: '#2563EB',
    secondary: '#E2E8F0',
    hair: '#FACC15',
    skinTone: '#F9D2B5',
    boot: '#F8FAFC',
  },
  {
    id: 'ninja',
    name: 'Sombra Neo',
    primary: '#EC4899',
    secondary: '#18181B',
    hair: '#09090B',
    skinTone: '#E8B899',
    boot: '#F472B6',
  },
];

export function getHeadSoccerSkin(id?: string): HeadSoccerSkin {
  return HS_SKINS.find((s) => s.id === id) || HS_SKINS[0];
}

export interface HeadSoccerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  kick: boolean;
}

export interface HeadSoccerSimPlayer {
  side: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: -1 | 1;
  kickTimer: number;
  kickCooldown: number;
  skinId: HeadSoccerSkinId;
}

export interface HeadSoccerSimBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
  lastTouchSide: 0 | 1 | null;
}

export interface HeadSoccerSimulation {
  phase: 'playing' | 'goal' | 'finished';
  players: [HeadSoccerSimPlayer, HeadSoccerSimPlayer];
  ball: HeadSoccerSimBall;
  scores: [number, number];
  timeLeftSec: number;
  isGoldenGoal: boolean;
  goalBannerSide: 0 | 1 | null;
  goalPauseTimer: number;
  winnerSide: 0 | 1 | null;
  tick: number;
}

export interface HeadSoccerSeat {
  seatIndex: 0 | 1;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  skinId: HeadSoccerSkinId;
  isBot?: boolean;
  connected?: boolean;
}

export interface HeadSoccerOnlineState {
  status: 'waiting' | 'playing' | 'finished';
  players: [HeadSoccerSeat | null, HeadSoccerSeat | null];
  scores: [number, number];
  timeLeftSec: number;
  isGoldenGoal: boolean;
  winnerSeat: 0 | 1 | null;
  updatedAt: number;
  startedAt: number | null;
}

export function createHeadSoccerSimulation(
  leftSkin: HeadSoccerSkinId = 'striker',
  rightSkin: HeadSoccerSkinId = 'furia'
): HeadSoccerSimulation {
  return {
    phase: 'playing',
    players: [
      {
        side: 0,
        x: 210,
        y: HS_GROUND_Y - HS_HEAD_RADIUS,
        vx: 0,
        vy: 0,
        onGround: true,
        facing: 1,
        kickTimer: 0,
        kickCooldown: 0,
        skinId: leftSkin,
      },
      {
        side: 1,
        x: HS_ARENA_W - 210,
        y: HS_GROUND_Y - HS_HEAD_RADIUS,
        vx: 0,
        vy: 0,
        onGround: true,
        facing: -1,
        kickTimer: 0,
        kickCooldown: 0,
        skinId: rightSkin,
      },
    ],
    ball: {
      x: HS_ARENA_W / 2,
      y: 190,
      vx: 0,
      vy: 0,
      angle: 0,
      angularVel: 0,
      lastTouchSide: null,
    },
    scores: [0, 0],
    timeLeftSec: HS_MATCH_DURATION_SEC,
    isGoldenGoal: false,
    goalBannerSide: null,
    goalPauseTimer: 0,
    winnerSide: null,
    tick: 0,
  };
}

function resetPositionsForKickoff(sim: HeadSoccerSimulation) {
  sim.players[0].x = 210;
  sim.players[0].y = HS_GROUND_Y - HS_HEAD_RADIUS;
  sim.players[0].vx = 0;
  sim.players[0].vy = 0;
  sim.players[0].onGround = true;
  sim.players[0].kickTimer = 0;

  sim.players[1].x = HS_ARENA_W - 210;
  sim.players[1].y = HS_GROUND_Y - HS_HEAD_RADIUS;
  sim.players[1].vx = 0;
  sim.players[1].vy = 0;
  sim.players[1].onGround = true;
  sim.players[1].kickTimer = 0;

  sim.ball.x = HS_ARENA_W / 2;
  sim.ball.y = 170;
  sim.ball.vx = 0;
  sim.ball.vy = 0;
  sim.ball.angularVel = 0;
}

function collideCircleCircle(
  ax: number,
  ay: number,
  avx: number,
  avy: number,
  ar: number,
  bx: number,
  by: number,
  bvx: number,
  bvy: number,
  br: number,
  massRatioA: number,
  restitution: number
): { hit: boolean; ax: number; ay: number; avx: number; avy: number; bx: number; by: number; bvx: number; bvy: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const distSq = dx * dx + dy * dy;
  const minDist = ar + br;
  if (distSq >= minDist * minDist || distSq < 0.0001) {
    return { hit: false, ax, ay, avx, avy, bx, by, bvx, bvy };
  }
  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;

  const invMassA = 1 / massRatioA;
  const invMassB = 1;
  const totalInv = invMassA + invMassB;

  const nax = ax - nx * overlap * (invMassA / totalInv);
  const nay = ay - ny * overlap * (invMassA / totalInv);
  const nbx = bx + nx * overlap * (invMassB / totalInv);
  const nby = by + ny * overlap * (invMassB / totalInv);

  const rvx = bvx - avx;
  const rvy = bvy - avy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal > 0) {
    return { hit: true, ax: nax, ay: nay, avx, avy, bx: nbx, by: nby, bvx, bvy };
  }

  const j = (-(1 + restitution) * velAlongNormal) / totalInv;
  return {
    hit: true,
    ax: nax,
    ay: nay,
    avx: avx - j * invMassA * nx,
    avy: avy - j * invMassA * ny,
    bx: nbx,
    by: nby,
    bvx: bvx + j * invMassB * nx,
    bvy: bvy + j * invMassB * ny,
  };
}

export interface HeadSoccerStepEvents {
  kicked?: boolean;
  headed?: boolean;
  postHit?: boolean;
  goalScoredBy?: 0 | 1;
  matchEnded?: boolean;
}

export function stepHeadSoccerFrame(
  sim: HeadSoccerSimulation,
  inputs: [HeadSoccerInput, HeadSoccerInput],
  rawDt: number
): HeadSoccerStepEvents {
  const dt = Math.min(0.033, Math.max(0.001, rawDt));
  const events: HeadSoccerStepEvents = {};

  if (sim.phase === 'finished') return events;

  if (sim.phase === 'goal') {
    sim.goalPauseTimer -= dt;
    if (sim.goalPauseTimer <= 0) {
      if (sim.isGoldenGoal) {
        sim.phase = 'finished';
        sim.winnerSide = sim.scores[0] > sim.scores[1] ? 0 : 1;
        events.matchEnded = true;
        return events;
      }
      resetPositionsForKickoff(sim);
      sim.goalBannerSide = null;
      sim.phase = 'playing';
    }
    return events;
  }

  sim.tick += 1;

  if (!sim.isGoldenGoal) {
    sim.timeLeftSec = Math.max(0, sim.timeLeftSec - dt);
    if (sim.timeLeftSec <= 0) {
      if (sim.scores[0] === sim.scores[1]) {
        sim.isGoldenGoal = true;
      } else {
        sim.phase = 'finished';
        sim.winnerSide = sim.scores[0] > sim.scores[1] ? 0 : 1;
        events.matchEnded = true;
        return events;
      }
    }
  }

  const subSteps = 2;
  const subDt = dt / subSteps;

  const PLAYER_SPEED = 365;
  const PLAYER_GRAVITY = 1750;
  const JUMP_VEL = -690;
  const BALL_GRAVITY = 1280;

  for (let step = 0; step < subSteps; step += 1) {
    // 1. Update players
    for (let i = 0; i < 2; i += 1) {
      const p = sim.players[i];
      const inp = inputs[i];

      let targetVx = 0;
      if (inp.left && !inp.right) targetVx = -PLAYER_SPEED;
      else if (inp.right && !inp.left) targetVx = PLAYER_SPEED;

      p.vx += (targetVx - p.vx) * Math.min(1, subDt * 18);

      if (inp.jump && p.onGround) {
        p.vy = JUMP_VEL;
        p.onGround = false;
      }

      if (p.kickCooldown > 0) p.kickCooldown = Math.max(0, p.kickCooldown - subDt);
      if (p.kickTimer > 0) p.kickTimer = Math.max(0, p.kickTimer - subDt);
      if (inp.kick && p.kickCooldown <= 0) {
        p.kickTimer = 0.2;
        p.kickCooldown = 0.34;
      }

      p.vy += PLAYER_GRAVITY * subDt;
      p.x += p.vx * subDt;
      p.y += p.vy * subDt;

      // Ground
      if (p.y >= HS_GROUND_Y - HS_HEAD_RADIUS) {
        p.y = HS_GROUND_Y - HS_HEAD_RADIUS;
        p.vy = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
      }

      // Arena walls (keep slightly inside goals so you can still scoop balls out)
      const minX = 24 + HS_HEAD_RADIUS;
      const maxX = HS_ARENA_W - 24 - HS_HEAD_RADIUS;
      if (p.x < minX) {
        p.x = minX;
        p.vx = 0;
      } else if (p.x > maxX) {
        p.x = maxX;
        p.vx = 0;
      }
    }

    // 2. Player vs Player bump
    const pvp = collideCircleCircle(
      sim.players[0].x,
      sim.players[0].y,
      sim.players[0].vx,
      sim.players[0].vy,
      HS_HEAD_RADIUS,
      sim.players[1].x,
      sim.players[1].y,
      sim.players[1].vx,
      sim.players[1].vy,
      HS_HEAD_RADIUS,
      1,
      0.35
    );
    if (pvp.hit) {
      sim.players[0].x = pvp.ax;
      sim.players[0].y = pvp.ay;
      sim.players[0].vx = pvp.avx;
      sim.players[0].vy = pvp.avy;
      sim.players[1].x = pvp.bx;
      sim.players[1].y = pvp.by;
      sim.players[1].vx = pvp.bvx;
      sim.players[1].vy = pvp.bvy;
    }

    // 3. Ball physics
    const b = sim.ball;
    b.vy += BALL_GRAVITY * subDt;
    b.vx *= Math.pow(0.992, subDt * 60);
    b.x += b.vx * subDt;
    b.y += b.vy * subDt;
    b.angle += (b.vx / Math.max(10, HS_BALL_RADIUS)) * subDt + b.angularVel * subDt;
    b.angularVel *= 0.985;

    // Ground bounce
    if (b.y + HS_BALL_RADIUS > HS_GROUND_Y) {
      b.y = HS_GROUND_Y - HS_BALL_RADIUS;
      if (Math.abs(b.vy) > 45) {
        b.vy = -b.vy * 0.77;
      } else {
        b.vy = 0;
      }
      b.vx *= 0.965;
    }

    // Ceiling
    if (b.y - HS_BALL_RADIUS < 16) {
      b.y = 16 + HS_BALL_RADIUS;
      b.vy = Math.abs(b.vy) * 0.78;
    }

    // Crossbar & goal roof collisions (Left & Right goals)
    // Top roof of left goal: x in [0, HS_GOAL_W], y = HS_CROSSBAR_Y
    if (b.x - HS_BALL_RADIUS < HS_GOAL_W && b.y < HS_CROSSBAR_Y + HS_POST_RADIUS) {
      if (b.y + HS_BALL_RADIUS > HS_CROSSBAR_Y - HS_POST_RADIUS && b.vy > 0 && b.x < HS_GOAL_W - 6) {
        b.y = HS_CROSSBAR_Y - HS_POST_RADIUS - HS_BALL_RADIUS;
        b.vy = -Math.abs(b.vy) * 0.75;
      }
    }
    if (b.x + HS_BALL_RADIUS > HS_ARENA_W - HS_GOAL_W && b.y < HS_CROSSBAR_Y + HS_POST_RADIUS) {
      if (b.y + HS_BALL_RADIUS > HS_CROSSBAR_Y - HS_POST_RADIUS && b.vy > 0 && b.x > HS_ARENA_W - HS_GOAL_W + 6) {
        b.y = HS_CROSSBAR_Y - HS_POST_RADIUS - HS_BALL_RADIUS;
        b.vy = -Math.abs(b.vy) * 0.75;
      }
    }

    // Crossbar edge corners (posts)
    const posts = [
      { x: HS_GOAL_W, y: HS_CROSSBAR_Y },
      { x: HS_ARENA_W - HS_GOAL_W, y: HS_CROSSBAR_Y },
    ];
    for (const post of posts) {
      const hitPost = collideCircleCircle(
        post.x,
        post.y,
        0,
        0,
        HS_POST_RADIUS,
        b.x,
        b.y,
        b.vx,
        b.vy,
        HS_BALL_RADIUS,
        1000,
        0.84
      );
      if (hitPost.hit) {
        b.x = hitPost.bx;
        b.y = hitPost.by;
        b.vx = hitPost.bvx;
        b.vy = hitPost.bvy;
        events.postHit = true;
      }
    }

    // Side walls ABOVE crossbar
    if (b.y < HS_CROSSBAR_Y) {
      if (b.x - HS_BALL_RADIUS < 8) {
        b.x = 8 + HS_BALL_RADIUS;
        b.vx = Math.abs(b.vx) * 0.82;
      } else if (b.x + HS_BALL_RADIUS > HS_ARENA_W - 8) {
        b.x = HS_ARENA_W - 8 - HS_BALL_RADIUS;
        b.vx = -Math.abs(b.vx) * 0.82;
      }
    } else {
      // Inside goal back-net limit
      if (b.x - HS_BALL_RADIUS < 8) {
        b.x = 8 + HS_BALL_RADIUS;
        b.vx = Math.abs(b.vx) * 0.35;
      } else if (b.x + HS_BALL_RADIUS > HS_ARENA_W - 8) {
        b.x = HS_ARENA_W - 8 - HS_BALL_RADIUS;
        b.vx = -Math.abs(b.vx) * 0.35;
      }
    }

    // 4. Player Head vs Ball + Boot Kick hitbox
    for (let i = 0; i < 2; i += 1) {
      const p = sim.players[i];
      const hitHead = collideCircleCircle(
        p.x,
        p.y,
        p.vx,
        p.vy,
        HS_HEAD_RADIUS,
        b.x,
        b.y,
        b.vx,
        b.vy,
        HS_BALL_RADIUS,
        6.5,
        0.86
      );
      if (hitHead.hit) {
        b.x = hitHead.bx;
        b.y = hitHead.by;
        b.vx = hitHead.bvx + p.vx * 0.32;
        b.vy = hitHead.bvy - (p.vy < -40 ? 90 : 35);
        b.lastTouchSide = i as 0 | 1;
        events.headed = true;
      }

      // Articulated Boot Kick
      const bootDir = p.facing;
      const swingProgress = p.kickTimer > 0 ? 1 - p.kickTimer / 0.2 : 0;
      const bootOffsetX = bootDir * (14 + Math.sin(swingProgress * Math.PI) * 24);
      const bootOffsetY = HS_HEAD_RADIUS - 2 - Math.sin(swingProgress * Math.PI) * 14;
      const bootX = p.x + bootOffsetX;
      const bootY = p.y + bootOffsetY;
      const bootR = p.kickTimer > 0 ? 20 : 13;

      const dx = b.x - bootX;
      const dy = b.y - bootY;
      const minD = bootR + HS_BALL_RADIUS;
      if (dx * dx + dy * dy < minD * minD) {
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = bootX + nx * (minD + 1);
        b.y = bootY + ny * (minD + 1);
        if (p.kickTimer > 0) {
          b.vx = bootDir * 680 + p.vx * 0.45;
          b.vy = -440 + Math.min(0, p.vy * 0.25);
          b.angularVel = bootDir * 14;
          p.kickTimer = 0.04;
          b.lastTouchSide = i as 0 | 1;
          events.kicked = true;
        } else {
          b.vx += p.vx * 0.55 + nx * 120;
          b.vy = Math.min(b.vy, -120);
          b.lastTouchSide = i as 0 | 1;
        }
      }
    }

    // Clamp max ball speed for stability
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 1050) {
      const k = 1050 / speed;
      b.vx *= k;
      b.vy *= k;
    }

    // 5. Goal check (cleanly past goal line under crossbar)
    if (b.y > HS_CROSSBAR_Y + 2) {
      if (b.x + HS_BALL_RADIUS * 0.45 < HS_GOAL_W) {
        sim.scores[1] += 1;
        sim.phase = 'goal';
        sim.goalBannerSide = 1;
        sim.goalPauseTimer = 1.6;
        events.goalScoredBy = 1;
        return events;
      }
      if (b.x - HS_BALL_RADIUS * 0.45 > HS_ARENA_W - HS_GOAL_W) {
        sim.scores[0] += 1;
        sim.phase = 'goal';
        sim.goalBannerSide = 0;
        sim.goalPauseTimer = 1.6;
        events.goalScoredBy = 0;
        return events;
      }
    }
  }

  return events;
}

export function chooseHeadSoccerAiInput(
  sim: HeadSoccerSimulation,
  side: 0 | 1 = 1
): HeadSoccerInput {
  const ai = sim.players[side];
  const b = sim.ball;
  const myGoalX = side === 0 ? HS_GOAL_W : HS_ARENA_W - HS_GOAL_W;
  const attackDir = side === 0 ? 1 : -1;

  // Target point behind the ball from our attacking side
  const behindOffset = -attackDir * 24;
  const desiredX =
    side === 1
      ? Math.max(HS_GOAL_W + 45, Math.min(HS_ARENA_W - HS_GOAL_W - 20, b.x + behindOffset))
      : Math.min(HS_ARENA_W - HS_GOAL_W - 45, Math.max(HS_GOAL_W + 20, b.x + behindOffset));

  // If ball threatens our goal, sprint back defensively
  const ballThreat =
    side === 1 ? b.x > HS_ARENA_W - 220 && ai.x < b.x : b.x < 220 && ai.x > b.x;

  let left = false;
  let right = false;
  if (ballThreat) {
    const defX = side === 1 ? Math.min(HS_ARENA_W - 85, b.x + 36) : Math.max(85, b.x - 36);
    if (ai.x < defX - 10) right = true;
    else if (ai.x > defX + 10) left = true;
  } else {
    if (ai.x < desiredX - 12) right = true;
    else if (ai.x > desiredX + 12) left = true;
  }

  const distToBall = Math.hypot(b.x - ai.x, b.y - ai.y);
  const ballAbove = b.y < ai.y - 24 && Math.abs(b.x - ai.x) < 88 && b.y > 160;
  const jump = ballAbove && ai.onGround && Math.abs(myGoalX - ai.x) > 40;

  const ballInKickZone =
    distToBall < 66 &&
    (side === 1 ? b.x <= ai.x + 8 : b.x >= ai.x - 8) &&
    b.y > HS_GROUND_Y - 125;

  return {
    left,
    right,
    jump,
    kick: ballInKickZone,
  };
}

export {
  createInitialHeadSoccerOnlineState,
  joinHeadSoccerSeat,
  selectHeadSoccerSkin,
  startHeadSoccerMatch,
} from './headSoccerOnline.ts';
