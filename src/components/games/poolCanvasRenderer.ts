import type {
  Pool8BallState,
  PoolBallState,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from '../../types';
import {
  POOL_BALL_R,
  POOL_FOOT_SPOT_Y,
  POOL_HEAD_STRING_X,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  computeAimPrediction,
  getBallGroup,
  isOnEightBall,
} from '../../shared/pool8Ball';

export interface SinkAnim {
  ballId: number;
  startX: number;
  startY: number;
  pocketX: number;
  pocketY: number;
  rollAngle: number;
  rollPhase: number;
  startedAt: number;
}

export interface PocketFlashAnim {
  x: number;
  y: number;
  r: number;
  startedAt: number;
}

export interface PendingStrikeShot {
  runtime: PoolSimRuntime;
  prevBalls: PoolBallState[];
  meta: {
    shot: PoolShotInput;
    baseState: Pool8BallState;
    authoritativeState?: Pool8BallState;
    expectedChecksum?: number;
  };
  startedAt: number;
  durationMs: number;
  startPullDist: number;
  angle: number;
  power: number;
  cueX: number;
  cueY: number;
}

export interface ShotAnimPayload {
  shot: PoolShotInput & {
    shooterUserId: string;
    turnNumber: number;
    cueStartX: number;
    cueStartY: number;
  };
  authoritativeState: Pool8BallState;
  checksum: number;
}

export const BALL_COLORS: Record<number, { main: string; stripe: boolean }> = {
  0: { main: '#FAF8F2', stripe: false },
  1: { main: '#FACC15', stripe: false },
  2: { main: '#2563EB', stripe: false },
  3: { main: '#DC2626', stripe: false },
  4: { main: '#7C3AED', stripe: false },
  5: { main: '#F97316', stripe: false },
  6: { main: '#16A34A', stripe: false },
  7: { main: '#881337', stripe: false },
  8: { main: '#18181B', stripe: false },
  9: { main: '#FACC15', stripe: true },
  10: { main: '#2563EB', stripe: true },
  11: { main: '#DC2626', stripe: true },
  12: { main: '#7C3AED', stripe: true },
  13: { main: '#F97316', stripe: true },
  14: { main: '#16A34A', stripe: true },
  15: { main: '#881337', stripe: true },
};

export const RAIL_PAD = 44; // Wooden/metal bezel thickness in canonical space

export function createFeltNoisePattern(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const off = document.createElement('canvas');
  off.width = 96;
  off.height = 96;
  const ctx = off.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(96, 96);
  let seed = 1337;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = (seed >>> 24) & 0xff;
    const delta = ((v & 15) - 7) * 1.4;
    img.data[i] = Math.max(0, Math.min(255, 11 + delta));
    img.data[i + 1] = Math.max(0, Math.min(255, 68 + delta));
    img.data[i + 2] = Math.max(0, Math.min(255, 51 + delta));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return off;
}

export function createBallShadeSprite(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 96;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (!ctx) return null;

  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.clip();

  const shadeGrad = ctx.createRadialGradient(
    half - half * 0.32,
    half - half * 0.35,
    half * 0.08,
    half,
    half,
    half * 1.05
  );
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.26)');
  shadeGrad.addColorStop(0.55, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.48)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.beginPath();
  ctx.ellipse(
    half - half * 0.34,
    half - half * 0.34,
    half * 0.28,
    half * 0.16,
    -Math.PI / 4,
    0,
    Math.PI * 2
  );
  ctx.fill();
  return off;
}

export function createBallShadowSprite(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(half, half, half * 0.35, half, half, half);
  grad.addColorStop(0, 'rgba(0,0,0,0.48)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return off;
}

export function drawCueStick(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  pullDist: number,
  alpha = 1
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(angle + Math.PI);

  const cueLen = 280;

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.moveTo(pullDist, -0.2);
  ctx.lineTo(pullDist + cueLen, -3.2);
  ctx.lineTo(pullDist + cueLen, 7.6);
  ctx.lineTo(pullDist, 4.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(pullDist, -2.1, 4, 4.2);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(pullDist + 4, -2.3, 8, 4.6);

  const shaftGrad = ctx.createLinearGradient(pullDist + 12, 0, pullDist + cueLen, 0);
  shaftGrad.addColorStop(0, '#F3DEC0');
  shaftGrad.addColorStop(0.58, '#E0B984');
  shaftGrad.addColorStop(0.59, '#2B1810');
  shaftGrad.addColorStop(0.88, '#5C2218');
  shaftGrad.addColorStop(1, '#111827');

  ctx.fillStyle = shaftGrad;
  ctx.beginPath();
  ctx.moveTo(pullDist + 12, -2.4);
  ctx.lineTo(pullDist + cueLen, -5.2);
  ctx.lineTo(pullDist + cueLen, 5.2);
  ctx.lineTo(pullDist + 12, 2.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawPoolBall(
  ctx: CanvasRenderingContext2D,
  ball: PoolBallState,
  scale: number,
  isPortrait: boolean,
  spin: { x: number; y: number },
  shadowSprite: HTMLCanvasElement | null,
  shadeSprite: HTMLCanvasElement | null,
  radiusOverride?: number,
  alphaOverride = 1
): void {
  const r = radiusOverride ?? POOL_BALL_R;
  const meta = BALL_COLORS[ball.id] || BALL_COLORS[1];

  ctx.save();
  if (alphaOverride < 1) ctx.globalAlpha = alphaOverride;
  ctx.translate(ball.x, ball.y);

  if (shadowSprite) {
    ctx.drawImage(shadowSprite, -r * 1.15 + 2.2, -r * 1.15 + 3.0, r * 2.3, r * 2.3);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.arc(2.4, 3.2, r * 1.02, 0, Math.PI * 2);
    ctx.fill();
  }

  if (meta.stripe) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#F7F4EC';
    ctx.fillRect(-r, -r, r * 2, r * 2);

    ctx.save();
    ctx.rotate(ball.rollAngle);
    const shift = Math.sin(ball.rollPhase) * r * 0.25;
    ctx.fillStyle = meta.main;
    ctx.fillRect(-r * 1.1, -r * 0.56 + shift * 0.35, r * 2.2, r * 1.12);
    ctx.restore();
    ctx.restore();
  } else {
    ctx.fillStyle = meta.main;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (ball.id > 0) {
    const rollOx = Math.cos(ball.rollAngle) * Math.sin(ball.rollPhase) * (r * 0.16);
    const rollOy = Math.sin(ball.rollAngle) * Math.sin(ball.rollPhase) * (r * 0.16);
    ctx.fillStyle = '#FAF8F2';
    ctx.beginPath();
    ctx.arc(rollOx, rollOy, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    if (isPortrait) {
      ctx.save();
      ctx.translate(rollOx, rollOy);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#111827';
      ctx.font = `800 ${Math.max(7, Math.round(r * 0.62))}px Plus Jakarta Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.id), 0, 0.5);
      ctx.restore();
    } else {
      ctx.fillStyle = '#111827';
      ctx.font = `800 ${Math.max(7, Math.round(r * 0.62))}px Plus Jakarta Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.id), rollOx, rollOy + 0.5);
    }
  } else {
    const sx = spin.x * r * 0.36;
    const sy = -spin.y * r * 0.36;
    if (Math.abs(sx) > 0.4 || Math.abs(sy) > 0.4) {
      ctx.fillStyle = 'rgba(225, 29, 72, 0.72)';
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (shadeSprite) {
    ctx.drawImage(shadeSprite, -r, -r, r * 2, r * 2);
  }

  ctx.strokeStyle = ball.id === 8 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = Math.max(0.6, 1 / Math.max(0.5, scale));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export function buildStaticTableCache(
  cssW: number,
  cssH: number,
  dpr: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  portrait: boolean,
  feltPatternRef: { current: CanvasPattern | null }
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = Math.floor(cssW * dpr);
  off.height = Math.floor(cssH * dpr);
  const octx = off.getContext('2d');
  if (!octx) return off;

  octx.save();
  octx.scale(dpr, dpr);
  octx.translate(offsetX, offsetY);
  octx.scale(scale, scale);

  if (portrait) {
    octx.translate(0, POOL_TABLE_W + RAIL_PAD * 2);
    octx.rotate(-Math.PI / 2);
  }

  octx.translate(RAIL_PAD, RAIL_PAD);

  const outerX = -RAIL_PAD;
  const outerY = -RAIL_PAD;
  const outerW = POOL_TABLE_W + RAIL_PAD * 2;
  const outerH = POOL_TABLE_H + RAIL_PAD * 2;

  octx.save();
  octx.shadowColor = 'rgba(0,0,0,0.65)';
  octx.shadowBlur = 22;
  octx.shadowOffsetY = 8;
  const woodGrad = octx.createLinearGradient(outerX, outerY, outerX, outerY + outerH);
  woodGrad.addColorStop(0, '#4E2A1B');
  woodGrad.addColorStop(0.5, '#331A10');
  woodGrad.addColorStop(1, '#221009');
  octx.fillStyle = woodGrad;
  octx.beginPath();
  octx.roundRect(outerX, outerY, outerW, outerH, 26);
  octx.fill();
  octx.restore();

  octx.strokeStyle = 'rgba(255,255,255,0.14)';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.roundRect(outerX + 3, outerY + 3, outerW - 6, outerH - 6, 23);
  octx.stroke();

  octx.fillStyle = '#3F4451';
  const cornerSize = 36;
  [
    [outerX, outerY],
    [outerX + outerW - cornerSize, outerY],
    [outerX, outerY + outerH - cornerSize],
    [outerX + outerW - cornerSize, outerY + outerH - cornerSize],
  ].forEach(([cx, cy]) => {
    octx.beginPath();
    octx.roundRect(cx, cy, cornerSize, cornerSize, 10);
    octx.fill();
  });

  octx.fillStyle = '#07271E';
  octx.beginPath();
  octx.roundRect(-14, -14, POOL_TABLE_W + 28, POOL_TABLE_H + 28, 12);
  octx.fill();

  octx.save();
  octx.beginPath();
  octx.rect(0, 0, POOL_TABLE_W, POOL_TABLE_H);
  octx.clip();

  if (!feltPatternRef.current) {
    const patCanvas = createFeltNoisePattern();
    if (patCanvas) {
      feltPatternRef.current = octx.createPattern(patCanvas, 'repeat');
    }
  }
  octx.fillStyle = feltPatternRef.current || '#0B4635';
  octx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  const feltLight = octx.createRadialGradient(
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    40,
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    POOL_TABLE_W * 0.65
  );
  feltLight.addColorStop(0, 'rgba(34, 197, 94, 0.14)');
  feltLight.addColorStop(0.6, 'rgba(6, 78, 59, 0.05)');
  feltLight.addColorStop(1, 'rgba(2, 18, 14, 0.45)');
  octx.fillStyle = feltLight;
  octx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  octx.strokeStyle = 'rgba(0,0,0,0.48)';
  octx.lineWidth = 10;
  octx.strokeRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  octx.strokeStyle = 'rgba(255,255,255,0.16)';
  octx.lineWidth = 1.5;
  octx.setLineDash([6, 6]);
  octx.beginPath();
  octx.moveTo(POOL_HEAD_STRING_X, 0);
  octx.lineTo(POOL_HEAD_STRING_X, POOL_TABLE_H);
  octx.stroke();
  octx.setLineDash([]);

  octx.fillStyle = 'rgba(255,255,255,0.28)';
  octx.beginPath();
  octx.arc(750, POOL_FOOT_SPOT_Y, 4, 0, Math.PI * 2);
  octx.fill();
  octx.beginPath();
  octx.arc(POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, 3, 0, Math.PI * 2);
  octx.fill();
  octx.restore();

  octx.fillStyle = '#0D5742';
  octx.strokeStyle = 'rgba(255,255,255,0.12)';
  octx.lineWidth = 1;
  const drawRail = (pts: Array<[number, number]>) => {
    octx.beginPath();
    octx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) octx.lineTo(pts[i][0], pts[i][1]);
    octx.closePath();
    octx.fill();
    octx.stroke();
  };
  drawRail([[20, -14], [478, -14], [472, 0], [30, 0]]);
  drawRail([[522, -14], [980, -14], [970, 0], [528, 0]]);
  drawRail([[20, POOL_TABLE_H + 14], [478, POOL_TABLE_H + 14], [472, POOL_TABLE_H], [30, POOL_TABLE_H]]);
  drawRail([[522, POOL_TABLE_H + 14], [980, POOL_TABLE_H + 14], [970, POOL_TABLE_H], [528, POOL_TABLE_H]]);
  drawRail([[-14, 20], [0, 30], [0, 470], [-14, 480]]);
  drawRail([[POOL_TABLE_W + 14, 20], [POOL_TABLE_W, 30], [POOL_TABLE_W, 470], [POOL_TABLE_W + 14, 480]]);

  octx.fillStyle = '#E5D3B3';
  const diamondX = [125, 250, 375, 625, 750, 875];
  const diamondY = [125, 250, 375];
  const drawDiamond = (x: number, y: number) => {
    octx.beginPath();
    octx.moveTo(x, y - 3.5);
    octx.lineTo(x + 3.5, y);
    octx.lineTo(x, y + 3.5);
    octx.lineTo(x - 3.5, y);
    octx.closePath();
    octx.fill();
  };
  for (const dx of diamondX) {
    drawDiamond(dx, -25);
    drawDiamond(dx, POOL_TABLE_H + 25);
  }
  for (const dy of diamondY) {
    drawDiamond(-25, dy);
    drawDiamond(POOL_TABLE_W + 25, dy);
  }

  for (const p of POOL_POCKETS) {
    octx.fillStyle = '#1E1510';
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR + 5, 0, Math.PI * 2);
    octx.fill();

    const pGrad = octx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.captureR);
    pGrad.addColorStop(0, '#020305');
    pGrad.addColorStop(0.75, '#090B10');
    pGrad.addColorStop(1, '#1A1C22');
    octx.fillStyle = pGrad;
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
  return off;
}

export interface PoolDynamicDrawParams {
  ctx: CanvasRenderingContext2D;
  now: number;
  scale: number;
  portrait: boolean;
  state: Pool8BallState | null;
  renderBalls: PoolBallState[] | null;
  isSimulating: boolean;
  isOffline: boolean;
  currentUserId: string;
  aiThinking: boolean;
  calledPocket: PoolPocketId | null;
  cueGhost: { x: number; y: number; valid: boolean } | null;
  spin: { x: number; y: number };
  currentAimAngle: number;
  pullPower: number;
  strikeCuePullDist: number | null;
  pendingStrike: PendingStrikeShot | null;
  cueFollowThrough: { active: boolean; startedAt: number; angle: number; cueX: number; cueY: number };
  pocketFlashesRef: { current: PocketFlashAnim[] };
  sinkAnimsRef: { current: SinkAnim[] };
  shadowSprite: HTMLCanvasElement | null;
  shadeSprite: HTMLCanvasElement | null;
}

export function drawPoolDynamicOverlay(p: PoolDynamicDrawParams): void {
  const {
    ctx,
    now,
    scale,
    portrait,
    state,
    renderBalls,
    isSimulating,
    isOffline,
    currentUserId,
    aiThinking,
    calledPocket,
    cueGhost,
    spin,
    currentAimAngle,
    pullPower,
    strikeCuePullDist,
    pendingStrike,
    cueFollowThrough,
    pocketFlashesRef,
    sinkAnimsRef,
    shadowSprite,
    shadeSprite,
  } = p;

  const activeTurnSeat = state ? state.players[state.turnSeat] : null;
  const activeUserIsMe = Boolean(
    state &&
      state.status === 'playing' &&
      !isSimulating &&
      !pendingStrike &&
      (isOffline ? state.turnSeat === 0 : activeTurnSeat?.userId === currentUserId)
  );
  const showPocketCallTargets = Boolean(
    state &&
      activeUserIsMe &&
      activeTurnSeat &&
      isOnEightBall(state.balls, activeTurnSeat.group)
  );

  if (calledPocket || showPocketCallTargets) {
    for (const pk of POOL_POCKETS) {
      if (calledPocket === pk.id) {
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, pk.captureR + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (showPocketCallTargets) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.35 + pulse * 0.45})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, pk.captureR + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  if (pocketFlashesRef.current.length > 0) {
    const nextFlashes: PocketFlashAnim[] = [];
    for (const pf of pocketFlashesRef.current) {
      const prog = (now - pf.startedAt) / 280;
      if (prog < 1) {
        nextFlashes.push(pf);
        const ease = 1 - Math.pow(1 - prog, 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${(1 - ease) * 0.85})`;
        ctx.lineWidth = 2.8 * (1 - ease * 0.5);
        ctx.beginPath();
        ctx.arc(pf.x, pf.y, pf.r + ease * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    pocketFlashesRef.current = nextFlashes;
  }

  if (sinkAnimsRef.current.length > 0) {
    const nextAnims: SinkAnim[] = [];
    for (const sa of sinkAnimsRef.current) {
      const prog = Math.min(1, (now - sa.startedAt) / 240);
      if (prog < 1) {
        nextAnims.push(sa);
        const ease = 1 - Math.pow(1 - prog, 2);
        const bx = sa.startX + (sa.pocketX - sa.startX) * ease;
        const by = sa.startY + (sa.pocketY - sa.startY) * ease;
        const sinkBall: PoolBallState = {
          id: sa.ballId,
          x: bx,
          y: by,
          vx: 0,
          vy: 0,
          pocketed: false,
          pocketId: null,
          rollPhase: sa.rollPhase + ease * 3.5,
          rollAngle: sa.rollAngle,
        };
        drawPoolBall(
          ctx,
          sinkBall,
          scale,
          portrait,
          spin,
          shadowSprite,
          shadeSprite,
          POOL_BALL_R * (1 - ease * 0.56),
          1 - ease * 0.92
        );
      }
    }
    sinkAnimsRef.current = nextAnims;
  }

  const ballsToDraw =
    renderBalls || (pendingStrike ? pendingStrike.prevBalls : null) || state?.balls || [];

  for (const b of ballsToDraw) {
    if (b.pocketed) continue;
    if (b.id === 0 && cueGhost) continue;
    drawPoolBall(ctx, b, scale, portrait, spin, shadowSprite, shadeSprite);
  }

  if (cueGhost && state) {
    ctx.save();
    ctx.globalAlpha = 0.78;
    drawPoolBall(
      ctx,
      {
        id: 0,
        x: cueGhost.x,
        y: cueGhost.y,
        vx: 0,
        vy: 0,
        pocketed: false,
        pocketId: null,
        rollPhase: 0,
        rollAngle: 0,
      },
      scale,
      portrait,
      spin,
      shadowSprite,
      shadeSprite
    );
    ctx.strokeStyle = cueGhost.valid ? '#10B981' : '#F43F5E';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cueGhost.x, cueGhost.y, POOL_BALL_R + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const cueBall = ballsToDraw.find((b) => b.id === 0);
  if (
    state?.phase === 'BALL_IN_HAND' &&
    activeUserIsMe &&
    cueBall &&
    !cueGhost &&
    !pendingStrike
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.007);
    ctx.strokeStyle = `rgba(16, 185, 129, ${0.45 + pulse * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cueBall.x, cueBall.y, POOL_BALL_R + 6 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const showAiming =
    state &&
    state.status === 'playing' &&
    !isSimulating &&
    !pendingStrike &&
    cueBall &&
    !cueBall.pocketed &&
    !cueGhost &&
    (activeUserIsMe || (isOffline && state.players[state.turnSeat]?.isBot && aiThinking));

  if (showAiming && cueBall) {
    const pred = computeAimPrediction(ballsToDraw, currentAimAngle, spin.y);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.68)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(pred.ghostX, pred.ghostY);
    ctx.stroke();
    ctx.setLineDash([]);

    const hitBall =
      pred.hitBallId !== null ? ballsToDraw.find((b) => b.id === pred.hitBallId) : null;
    const targetLegal = (() => {
      if (!hitBall || !activeTurnSeat) return true;
      if (state.isBreakShot || activeTurnSeat.group === null) return hitBall.id !== 8;
      if (isOnEightBall(ballsToDraw, activeTurnSeat.group)) return hitBall.id === 8;
      return getBallGroup(hitBall.id) === activeTurnSeat.group;
    })();

    ctx.strokeStyle =
      pred.hitType === 'ball'
        ? targetLegal
          ? 'rgba(255,255,255,0.85)'
          : 'rgba(244, 63, 94, 0.9)'
        : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(pred.ghostX, pred.ghostY, POOL_BALL_R, 0, Math.PI * 2);
    ctx.stroke();

    if (pred.hitType === 'ball') {
      ctx.strokeStyle = targetLegal
        ? 'rgba(250, 204, 21, 0.85)'
        : 'rgba(244, 63, 94, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitBall!.x, hitBall!.y);
      ctx.lineTo(pred.targetEndX, pred.targetEndY);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pred.ghostX, pred.ghostY);
      ctx.lineTo(pred.cueDeflectX, pred.cueDeflectY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    const pullDist = 18 + pullPower * 92;
    drawCueStick(ctx, cueBall.x, cueBall.y, currentAimAngle, pullDist, 1);
  } else if (strikeCuePullDist !== null && pendingStrike) {
    drawCueStick(
      ctx,
      pendingStrike.cueX,
      pendingStrike.cueY,
      pendingStrike.angle,
      strikeCuePullDist,
      1
    );
  } else if (cueFollowThrough.active) {
    const elapsed = now - cueFollowThrough.startedAt;
    if (elapsed >= 140) {
      cueFollowThrough.active = false;
    } else {
      const prog = elapsed / 140;
      const easeOut = 1 - Math.pow(1 - prog, 2);
      const followDist = POOL_BALL_R - easeOut * 14;
      drawCueStick(ctx, cueFollowThrough.cueX, cueFollowThrough.cueY, cueFollowThrough.angle, followDist, 1 - easeOut);
    }
  }
}
