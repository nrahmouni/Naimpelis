export const POOL_TABLE_W = 1000;
export const POOL_TABLE_H = 500;
export const POOL_BALL_R = 13;
export const POOL_HEAD_STRING_X = 250;
export const POOL_FOOT_SPOT_X = 750;
export const POOL_FOOT_SPOT_Y = 250;

export const POOL_FIXED_DT = 1 / 120;
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
  coord: number;
  normal: number;
  min: number;
  max: number;
}

export const POOL_RAIL_SEGMENTS: PoolRailSegment[] = [
  { axis: 'h', coord: 0, normal: 1, min: 30, max: 474 },
  { axis: 'h', coord: 0, normal: 1, min: 526, max: 970 },
  { axis: 'h', coord: 500, normal: -1, min: 30, max: 474 },
  { axis: 'h', coord: 500, normal: -1, min: 526, max: 970 },
  { axis: 'v', coord: 0, normal: 1, min: 30, max: 470 },
  { axis: 'v', coord: 1000, normal: -1, min: 30, max: 470 },
];

export interface PoolJawKnuckle {
  x: number;
  y: number;
  r: number;
}

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
  id: number;
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
  power: number;
  spinX: number;
  spinY: number;
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
  awaitingHostStart?: boolean;
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
  cueSpinX: number;
  cueSpinY: number;
  shotDirX: number;
  shotDirY: number;
  cueFirstImpactDone: boolean;
  firstHitBallId: number | null;
  railTouchedAfterHit: boolean;
  pocketedOrder: Array<{ ballId: number; pocketId: PoolPocketId }>;
  offTableBallIds: number[];
  elapsed: number;
}

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

  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];

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

  for (const p of POOL_POCKETS) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy <= (p.captureR + 3) * (p.captureR + 3)) {
      return false;
    }
  }

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
