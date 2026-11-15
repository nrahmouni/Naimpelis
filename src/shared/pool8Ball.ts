/**
 * NAIM CINE — Pro 8-Ball Pool ("Billar Bola 8") Pure Physics, WPA Rules & AI Engine
 * 100% deterministic (seeded PRNG, zero Math.random inside simulation), headless-capable,
 * shared between Browser 60fps Renderer/AI and Node Server Authority.
 */

export const POOL_TABLE_W = 1000;
export const POOL_TABLE_H = 500;
export const POOL_BALL_R = 13;
export const POOL_HEAD_STRING_X = 250;
export const POOL_FOOT_SPOT_X = 750;
export const POOL_FOOT_SPOT_Y = 250;

export const POOL_FIXED_DT = 1 / 120; // 120 Hz physics substep (2 substeps per 60fps frame)
export const POOL_MAX_FRAME_DT = 1 / 15;
export const POOL_BALL_RESTITUTION = 0.95;
export const POOL_CUSHION_RESTITUTION = 0.75;
export const POOL_ROLL_DECEL = 165;
export const POOL_LINEAR_DRAG = 0.38;
export const POOL_STOP_SPEED = 4.5;
export const POOL_MIN_SHOT_POWER = 0.06;
export const POOL_MIN_SHOT_SPEED = 150;
export const POOL_MAX_SHOT_SPEED = 1620;
export const POOL_TURN_TIMEOUT_MS = 45_000;
export const POOL_DISCONNECT_GRACE_MS = 25_000;

export type PoolPocketId = 'TL' | 'TM' | 'TR' | 'BL' | 'BM' | 'BR';
export type PoolBallGroup = 'solids' | 'stripes';
export type PoolDifficulty = 'easy' | 'medium' | 'hard';

export type PoolTurnPhase =
  | 'AIMING'
  | 'SHOOTING'
  | 'SIMULATING'
  | 'RESOLVING'
  | 'NEXT_TURN'
  | 'BALL_IN_HAND'
  | 'GAME_OVER';

export type PoolFoulType =
  | 'SCRATCH'
  | 'NO_HIT'
  | 'WRONG_FIRST_HIT'
  | 'NO_RAIL'
  | 'BALL_OFF_TABLE';

export interface PoolPocketDef {
  id: PoolPocketId;
  x: number;
  y: number;
  captureR: number;
  label: string;
}

export const POOL_POCKETS: PoolPocketDef[] = [
  { id: 'TL', x: 2, y: 2, captureR: 25, label: 'Sup. Izq.' },
  { id: 'TM', x: 500, y: -6, captureR: 23.5, label: 'Centro Sup.' },
  { id: 'TR', x: 998, y: 2, captureR: 25, label: 'Sup. Der.' },
  { id: 'BL', x: 2, y: 498, captureR: 25, label: 'Inf. Izq.' },
  { id: 'BM', x: 500, y: 506, captureR: 23.5, label: 'Centro Inf.' },
  { id: 'BR', x: 998, y: 498, captureR: 25, label: 'Inf. Der.' },
];

export interface PoolRailSegment {
  axis: 'h' | 'v';
  coord: number; // y for 'h', x for 'v'
  normal: number; // +1 or -1 pointing inward into table
  min: number;
  max: number;
}

export const POOL_RAIL_SEGMENTS: PoolRailSegment[] = [
  // Top left & top right cushions (y = 0, normal = +1)
  { axis: 'h', coord: 0, normal: 1, min: 30, max: 474 },
  { axis: 'h', coord: 0, normal: 1, min: 526, max: 970 },
  // Bottom left & bottom right cushions (y = 500, normal = -1)
  { axis: 'h', coord: 500, normal: -1, min: 30, max: 474 },
  { axis: 'h', coord: 500, normal: -1, min: 526, max: 970 },
  // Left cushion (x = 0, normal = +1)
  { axis: 'v', coord: 0, normal: 1, min: 30, max: 470 },
  // Right cushion (x = 1000, normal = -1)
  { axis: 'v', coord: 1000, normal: -1, min: 30, max: 470 },
];

export interface PoolJawKnuckle {
  x: number;
  y: number;
  r: number;
}

// Recessed by 1.5px so balls rolling flush along flat rails do not snag, while pocket-mouth hits deflect realistically.
export const POOL_JAW_KNUCKLES: PoolJawKnuckle[] = [
  { x: 30, y: -1.5, r: 1.5 },
  { x: 474, y: -1.5, r: 1.5 },
  { x: 526, y: -1.5, r: 1.5 },
  { x: 970, y: -1.5, r: 1.5 },
  { x: 30, y: 501.5, r: 1.5 },
  { x: 474, y: 501.5, r: 1.5 },
  { x: 526, y: 501.5, r: 1.5 },
  { x: 970, y: 501.5, r: 1.5 },
  { x: -1.5, y: 30, r: 1.5 },
  { x: -1.5, y: 470, r: 1.5 },
  { x: 1001.5, y: 30, r: 1.5 },
  { x: 1001.5, y: 470, r: 1.5 },
];

export interface PoolBallState {
  id: number; // 0 = cue, 1..7 = solids, 8 = black 8-ball, 9..15 = stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
  pocketId: PoolPocketId | null;
  offTable?: boolean;
  rollPhase: number;
  rollAngle: number;
}

export interface PoolPlayerSeat {
  seatIndex: 0 | 1;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  isBot?: boolean;
  group: PoolBallGroup | null;
  connected?: boolean;
  disconnectedAt?: number | null;
}

export interface PoolShotInput {
  angle: number;
  power: number; // 0..1
  spinX: number; // -1..1 (left/right side English)
  spinY: number; // -1..1 (-1 backspin/draw .. +1 topspin/follow)
  calledPocketId?: PoolPocketId | null;
  cueX?: number;
  cueY?: number;
}

export interface PoolLastShotRecord {
  shooterSeat: 0 | 1;
  shooterUserId: string;
  turnNumber: number;
  angle: number;
  power: number;
  spinX: number;
  spinY: number;
  calledPocketId: PoolPocketId | null;
  cueStartX: number;
  cueStartY: number;
  pocketedBallIds: number[];
  foul: PoolFoulType | null;
  checksum: number;
  executedAt: number;
}

export interface Pool8BallState {
  id: string;
  gameType: 'pool';
  status: 'waiting' | 'playing' | 'finished';
  phase: PoolTurnPhase;
  players: [PoolPlayerSeat | null, PoolPlayerSeat | null];
  turnSeat: 0 | 1;
  turnNumber: number;
  isBreakShot: boolean;
  breakOnlyBehindHeadString: boolean;
  balls: PoolBallState[];
  calledPocketId: PoolPocketId | null;
  difficulty: PoolDifficulty;
  winnerSeat: 0 | 1 | null;
  winReason:
    | 'eight_ball_pocketed'
    | 'opponent_eight_ball_foul'
    | 'forfeit'
    | 'timeout_forfeit'
    | 'disconnect_forfeit'
    | null;
  lastFoul: PoolFoulType | null;
  statusMessage: string;
  turnDeadlineAt: number;
  seed: number;
  checksum: number;
  lastShot: PoolLastShotRecord | null;
  updatedAt: number;
}

export interface PoolPhysicsEvent {
  type: 'ball_ball' | 'cushion' | 'pocket_drop';
  time: number;
  ballA: number;
  ballB?: number;
  pocketId?: PoolPocketId;
  speed: number;
  x: number;
  y: number;
}

export interface PoolSimRuntime {
  balls: PoolBallState[];
  cueSpinX: number; // normalized side spin velocity reserve
  cueSpinY: number; // longitudinal topspin/backspin velocity reserve
  shotDirX: number;
  shotDirY: number;
  cueFirstImpactDone: boolean;
  firstHitBallId: number | null;
  railTouchedAfterHit: boolean;
  pocketedOrder: Array<{ ballId: number; pocketId: PoolPocketId }>;
  offTableBallIds: number[];
  elapsed: number;
}

// ============================================================================
// DETERMINISTIC SEEDED PRNG (mulberry32)
// ============================================================================

export function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededGaussian(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ============================================================================
// BALL HELPERS & CHECKSUM
// ============================================================================

export function getBallGroup(ballId: number): PoolBallGroup | null {
  if (ballId >= 1 && ballId <= 7) return 'solids';
  if (ballId >= 9 && ballId <= 15) return 'stripes';
  return null;
}

export function countRemainingGroupBalls(
  balls: PoolBallState[],
  group: PoolBallGroup
): number {
  let count = 0;
  for (const b of balls) {
    if (!b.pocketed && getBallGroup(b.id) === group) count += 1;
  }
  return count;
}

export function isOnEightBall(
  balls: PoolBallState[],
  group: PoolBallGroup | null
): boolean {
  if (!group) return false;
  return countRemainingGroupBalls(balls, group) === 0;
}

export function computePoolChecksum(state: {
  balls: PoolBallState[];
  turnSeat: number;
  turnNumber: number;
  phase: PoolTurnPhase;
  players: [PoolPlayerSeat | null, PoolPlayerSeat | null];
  winnerSeat: 0 | 1 | null;
}): number {
  let hash = 2166136261 >>> 0;
  const mix = (n: number) => {
    hash ^= n >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  };
  mix(state.turnSeat + 11);
  mix(state.turnNumber + 37);
  mix(state.phase.length);
  mix((state.winnerSeat ?? 9) + 1);
  mix(state.players[0]?.group === 'solids' ? 1 : state.players[0]?.group === 'stripes' ? 2 : 0);
  mix(state.players[1]?.group === 'solids' ? 1 : state.players[1]?.group === 'stripes' ? 2 : 0);
  for (const b of state.balls) {
    mix(b.id);
    mix(Math.round(b.x * 100));
    mix(Math.round(b.y * 100));
    mix(b.pocketed ? 1 : 0);
    mix(b.pocketId ? b.pocketId.charCodeAt(0) * 31 + b.pocketId.charCodeAt(1) : 0);
  }
  return hash >>> 0;
}

// ============================================================================
// RACK INITIALIZATION & BALL-IN-HAND VALIDATION
// ============================================================================

export function createStandardRackBalls(seed = 80801): PoolBallState[] {
  const rng = createSeededRng(seed);
  const balls: PoolBallState[] = [
    {
      id: 0,
      x: POOL_HEAD_STRING_X,
      y: POOL_FOOT_SPOT_Y,
      vx: 0,
      vy: 0,
      pocketed: false,
      pocketId: null,
      rollPhase: 0,
      rollAngle: 0,
    },
  ];

  // Standard WPA triangle: apex at foot spot, 8-ball at center (row 2 col 1),
  // opposite back corners contain 1 solid and 1 stripe.
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];

  // Deterministic shuffle of non-corner / non-8 balls
  const shuffle = (arr: number[]) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  };
  shuffle(solids);
  shuffle(stripes);

  const cornerSolid = solids.pop()!;
  const cornerStripe = stripes.pop()!;
  const pool = [...solids, ...stripes];
  shuffle(pool);

  // 15 slots in triangle (row 0..4, col 0..row)
  // Slot indices:
  // r0: [0]
  // r1: [1, 2]
  // r2: [3, 4(eight!), 5]
  // r3: [6, 7, 8, 9]
  // r4: [10(cornerA), 11, 12, 13, 14(cornerB)]
  const slotIds = new Array<number>(15);
  slotIds[4] = 8;
  slotIds[10] = cornerSolid;
  slotIds[14] = cornerStripe;
  let poolIdx = 0;
  for (let i = 0; i < 15; i += 1) {
    if (slotIds[i] === undefined) {
      slotIds[i] = pool[poolIdx++];
    }
  }

  const spacing = POOL_BALL_R * 2 + 0.35;
  const dx = spacing * Math.sqrt(3) * 0.5;
  const dy = spacing;

  let slot = 0;
  for (let row = 0; row < 5; row += 1) {
    const startY = POOL_FOOT_SPOT_Y - (row * dy) / 2;
    const x = POOL_FOOT_SPOT_X + row * dx;
    for (let col = 0; col <= row; col += 1) {
      const y = startY + col * dy;
      const jitterX = (rng() - 0.5) * 0.08;
      const jitterY = (rng() - 0.5) * 0.08;
      balls.push({
        id: slotIds[slot++],
        x: x + jitterX,
        y: y + jitterY,
        vx: 0,
        vy: 0,
        pocketed: false,
        pocketId: null,
        rollPhase: rng() * Math.PI * 2,
        rollAngle: 0,
      });
    }
  }

  balls.sort((a, b) => a.id - b.id);
  return balls;
}

export function isValidCueBallPlacement(
  balls: PoolBallState[],
  x: number,
  y: number,
  behindHeadString = false
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const minX = POOL_BALL_R + 2;
  const maxX = behindHeadString ? POOL_HEAD_STRING_X : POOL_TABLE_W - POOL_BALL_R - 2;
  const minY = POOL_BALL_R + 2;
  const maxY = POOL_TABLE_H - POOL_BALL_R - 2;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;

  // Must not overlap pocket mouths
  for (const p of POOL_POCKETS) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy <= (p.captureR + 3) * (p.captureR + 3)) {
      return false;
    }
  }

  // Must not overlap any active object ball
  const minSepSq = (POOL_BALL_R * 2 + 1.5) * (POOL_BALL_R * 2 + 1.5);
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy < minSepSq) {
      return false;
    }
  }

  return true;
}

export function findNearestValidCueBallSpot(
  balls: PoolBallState[],
  targetX = POOL_HEAD_STRING_X,
  targetY = POOL_FOOT_SPOT_Y,
  behindHeadString = false
): { x: number; y: number } {
  const maxX = behindHeadString ? POOL_HEAD_STRING_X : POOL_TABLE_W - POOL_BALL_R - 3;
  const cx = Math.max(POOL_BALL_R + 3, Math.min(maxX, targetX));
  const cy = Math.max(POOL_BALL_R + 3, Math.min(POOL_TABLE_H - POOL_BALL_R - 3, targetY));
  if (isValidCueBallPlacement(balls, cx, cy, behindHeadString)) {
    return { x: cx, y: cy };
  }
  for (let radius = 10; radius <= 420; radius += 14) {
    for (let step = 0; step < 16; step += 1) {
      const a = (step / 16) * Math.PI * 2;
      const tx = cx + Math.cos(a) * radius;
      const ty = cy + Math.sin(a) * radius;
      if (isValidCueBallPlacement(balls, tx, ty, behindHeadString)) {
        return { x: tx, y: ty };
      }
    }
  }
  return { x: POOL_HEAD_STRING_X, y: POOL_FOOT_SPOT_Y };
}

export function respotBallOnFootSpot(balls: PoolBallState[], ballId: number): PoolBallState[] {
  const next = balls.map((b) => ({ ...b }));
  const target = next.find((b) => b.id === ballId);
  if (!target) return next;

  let spotX = POOL_FOOT_SPOT_X;
  const spotY = POOL_FOOT_SPOT_Y;
  const minSepSq = (POOL_BALL_R * 2 + 1) * (POOL_BALL_R * 2 + 1);
  while (spotX <= POOL_TABLE_W - POOL_BALL_R - 4) {
    const blocked = next.some(
      (b) =>
        b.id !== ballId &&
        !b.pocketed &&
        (b.x - spotX) * (b.x - spotX) + (b.y - spotY) * (b.y - spotY) < minSepSq
    );
    if (!blocked) break;
    spotX += POOL_BALL_R * 2 + 2;
  }

  target.x = spotX;
  target.y = spotY;
  target.vx = 0;
  target.vy = 0;
  target.pocketed = false;
  target.pocketId = null;
  target.offTable = false;
  return next;
}

// ============================================================================
// CONTINUOUS COLLISION DETECTION (SWEPT TOI) & SPIN PHYSICS
// ============================================================================

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

  // 1. Pocket capture check (earliest TOI entering pocket capture circle)
  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i];
    if (b.pocketed) continue;
    for (const p of POOL_POCKETS) {
      const t = solveCircleCircleToi(b.x - p.x, b.y - p.y, b.vx, b.vy, p.captureR, maxDt);
      if (t !== null && (!best || t < best.t)) {
        best = { t, kind: 'pocket', idxA: i, pocket: p };
      }
      // Also check static containment at t=0
      const d2 = (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y);
      if (d2 <= p.captureR * p.captureR) {
        return { t: 0, kind: 'pocket', idxA: i, pocket: p };
      }
    }
  }

  // 2. Ball-ball collisions
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      if (b.pocketed) continue;
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

  // 3. Ball-rail collisions
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

    // Cue ball topspin / backspin continuous follow/draw sliding curve before/after impact
    if (b.id === 0 && (Math.abs(runtime.cueSpinY) > 1 || Math.abs(runtime.cueSpinX) > 1)) {
      if (runtime.cueFirstImpactDone && Math.abs(runtime.cueSpinY) > 1) {
        const spinTransfer = runtime.cueSpinY * Math.min(1, dt * 6.5);
        b.vx += runtime.shotDirX * spinTransfer;
        b.vy += runtime.shotDirY * spinTransfer;
        runtime.cueSpinY -= spinTransfer;
      } else {
        // Gentle felt spin decay while sliding before impact
        const decay = Math.exp(-0.55 * dt);
        runtime.cueSpinY *= decay;
      }
      // Subtle English swerve on very slow shots
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

    // Safety containment for extreme corners outside pocket throats
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

/**
 * Advances the deterministic physics by one fixed substep (dt = POOL_FIXED_DT = 1/120s),
 * solving continuous time-of-impact events so fast balls never tunnel through balls or rails.
 */
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

      // Separate tiny numerical overlap symmetrically
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
        // Elastic impulse with momentum conservation:
        // (va' + vb') = (va + vb) is exact for equal masses with impulse = 0.5 * (1 + e) * vn
        const j = 0.5 * (1 + POOL_BALL_RESTITUTION) * vn;
        a.vx -= j * nx;
        a.vy -= j * ny;
        b.vx += j * nx;
        b.vy += j * ny;

        // Track first ball hit by cue ball
        if ((a.id === 0 || b.id === 0) && runtime.firstHitBallId === null) {
          runtime.firstHitBallId = a.id === 0 ? b.id : a.id;
          runtime.cueFirstImpactDone = true;

          // Apply immediate longitudinal spin impulse (topspin follow / backspin draw)
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
          // Apply cue-ball side English on cushion bounce
          if (b.id === 0 && Math.abs(runtime.cueSpinX) > 1) {
            // Side English deflects parallel to rail based on inward normal
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

  // Ensure crisp stop if maxTicks reached
  for (const b of runtime.balls) {
    b.vx = 0;
    b.vy = 0;
  }

  return { runtime, events, ticks };
}

// ============================================================================
// WPA 8-BALL RULES & TURN STATE MACHINE
// ============================================================================

export function createInitialPoolState(
  humans: Array<{ id: string; name: string; avatar: string; color: string }>,
  opts?: {
    seed?: number;
    difficulty?: PoolDifficulty;
    offlineVsAi?: boolean;
    now?: number;
  }
): Pool8BallState {
  const now = opts?.now ?? Date.now();
  const seed = opts?.seed ?? ((now ^ 0x5f3759df) >>> 0);
  const difficulty: PoolDifficulty = opts?.difficulty || 'medium';
  const balls = createStandardRackBalls(seed);

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
  } else if (humans[1]) {
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

  const isPlaying = Boolean(p0 && p1);
  const status: Pool8BallState['status'] = isPlaying ? 'playing' : 'waiting';
  const phase: PoolTurnPhase = 'AIMING';

  const base: Pool8BallState = {
    id: `pool-${seed}`,
    gameType: 'pool',
    status,
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

export function joinPoolSeat(
  state: Pool8BallState,
  user: { id: string; name: string; avatar: string; color: string },
  seatIndex: 0 | 1 | 'spectate',
  now = Date.now()
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
  const nextStatus: Pool8BallState['status'] =
    state.status === 'playing' ? 'playing' : ready ? 'playing' : 'waiting';

  const next: Pool8BallState = {
    ...state,
    status: nextStatus,
    players: nextPlayers,
    statusMessage:
      nextStatus === 'playing' && state.status === 'waiting'
        ? `Mesa completa · Saque inicial de ${nextPlayers[0]!.name}`
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

  // Snapshot balls BEFORE resolution checks (using pre-shot state for group clearance!)
  const wasOnEight = isOnEightBall(state.balls, shooter.group);
  const pocketedEntries = runtime.pocketedOrder;
  const pocketedIds = pocketedEntries.map((e) => e.ballId);
  const cueScratched =
    pocketedIds.includes(0) || runtime.offTableBallIds.includes(0);
  const eightPocketedEntry = pocketedEntries.find((e) => e.ballId === 8) || null;
  const eightOffTable = runtime.offTableBallIds.includes(8);

  // Detect standard WPA fouls
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
        // Table is open: hitting 8-ball first is illegal
        if (firstId === 8) foul = 'WRONG_FIRST_HIT';
      } else if (!wasOnEight) {
        if (getBallGroup(firstId) !== shooter.group) {
          foul = 'WRONG_FIRST_HIT';
        }
      } else {
        // Group cleared -> must contact 8-ball first
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

  // Check 8-Ball Win / Loss first
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
      // Clean 8-ball on break -> re-spot 8-ball at foot spot per tournament tie-free play
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

      // Legal 8-ball pocketed into called pocket -> Shooter wins!
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

  // Handle cue ball re-placement readiness if scratched
  if (cueScratched) {
    const safeSpot = findNearestValidCueBallSpot(resolvedBalls, POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, false);
    resolvedBalls = resolvedBalls.map((b) =>
      b.id === 0
        ? { ...b, x: safeSpot.x, y: safeSpot.y, vx: 0, vy: 0, pocketed: false, pocketId: null, offTable: false }
        : b
    );
  }

  // Group assignment on first legal non-break pocketed object ball
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

  // Did shooter pocket a ball of their own group (or any object ball when open)?
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

// ============================================================================
// AIMING PREVIEW GEOMETRY (Ghost Ball, Target Path & Cue Post-Impact Line)
// ============================================================================

export interface PoolAimPrediction {
  hitType: 'ball' | 'rail' | 'none';
  hitBallId: number | null;
  ghostX: number;
  ghostY: number;
  targetEndX: number;
  targetEndY: number;
  cueDeflectX: number;
  cueDeflectY: number;
  cutAngleRad: number;
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
    if (proj >= 0) continue; // Behind ray
    const c = ocX * ocX + ocY * ocY - minDist * minDist;
    const disc = proj * proj - c;
    if (disc < 0) continue;
    const t = -proj - Math.sqrt(disc);
    if (t >= 0 && t < minT) {
      minT = t;
      hitBall = b;
    }
  }

  // Cushion raycast bound
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

    // 90-degree tangent vector adjusted by topspin/backspin
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

    // Blend follow/draw spin influence into visual post-impact cue guide
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

// ============================================================================
// AI OPPONENT PLANNER (Easy / Medium / Hard)
// Enumerates Direct + 1-Cushion Bank shots, simulates headlessly, scores
// pot probability, cue-ball leave, and scratch risk + Gaussian noise.
// ============================================================================

function getMirroredPocketsForBankShots(): Array<{
  pocket: PoolPocketDef;
  x: number;
  y: number;
}> {
  const out: Array<{ pocket: PoolPocketDef; x: number; y: number }> = [];
  for (const p of POOL_POCKETS) {
    // Mirror across top (y=0), bottom (y=H), left (x=0), right (x=W)
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

  // Break shot
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

  // Generate candidate cue placements if BALL_IN_HAND
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

      // A) Direct Shots
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
        if (dot < 0.22) continue; // Impossible thin cut > ~77deg

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

      // B) One-Cushion Bank Shots (Medium/Hard)
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
          // Intentional misjudged bank bias on medium difficulty
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

  // Fallback legal safety shot if all pots are snookered/blocked
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

      // Evaluate cue-ball leave (distance to next remaining target + avoid rail lock)
      const postCue = runtime.balls.find((b) => b.id === 0);
      if (postCue && !postCue.pocketed) {
        const edgeDist = Math.min(
          postCue.x,
          POOL_TABLE_W - postCue.x,
          postCue.y,
          POOL_TABLE_H - postCue.y
        );
        score += Math.min(80, edgeDist * 0.6);

        // Prefer leaving cue near center or good angle to remaining group balls
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

  // Apply human-like Gaussian noise based on difficulty
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
