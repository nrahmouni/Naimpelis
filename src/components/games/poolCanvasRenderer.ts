import type {
  Pool8BallState,
  PoolBallState,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from '../../types';
import {
  POOL_BALL_R,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  computeAimPrediction,
  getBallGroup,
  isOnEightBall,
} from '../../shared/pool8Ball';
import {
  drawDynamicBallShadowAndSpec,
  drawDynamicPointLight,
} from './arcade/canvas2dFxHelpers';
export {
  RAIL_PAD,
  createFeltNoisePattern,
  buildStaticTableCache,
} from './poolTableCache';

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
    half - half * 0.34,
    half - half * 0.36,
    half * 0.06,
    half,
    half,
    half * 1.06
  );
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.34)');
  shadeGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(0.84, 'rgba(0,0,0,0.34)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.56)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle green felt bounce highlight on bottom-right rim
  const bounceGrad = ctx.createRadialGradient(
    half + half * 0.35,
    half + half * 0.4,
    half * 0.05,
    half + half * 0.35,
    half + half * 0.4,
    half * 0.65
  );
  bounceGrad.addColorStop(0, 'rgba(52, 211, 153, 0.16)');
  bounceGrad.addColorStop(1, 'rgba(52, 211, 153, 0)');
  ctx.fillStyle = bounceGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath();
  ctx.ellipse(
    half - half * 0.35,
    half - half * 0.35,
    half * 0.25,
    half * 0.14,
    -Math.PI / 4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(half - half * 0.42, half - half * 0.42, half * 0.075, 0, Math.PI * 2);
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
  const grad = ctx.createRadialGradient(half, half, half * 0.32, half, half, half);
  grad.addColorStop(0, 'rgba(0,0,0,0.56)');
  grad.addColorStop(0.68, 'rgba(0,0,0,0.3)');
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

  const cueLen = 290;

  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.moveTo(pullDist, -0.2);
  ctx.lineTo(pullDist + cueLen, -3.2);
  ctx.lineTo(pullDist + cueLen, 8.4);
  ctx.lineTo(pullDist, 4.6);
  ctx.closePath();
  ctx.fill();

  // Blue chalked tip
  ctx.fillStyle = '#0EA5E9';
  ctx.beginPath();
  ctx.roundRect(pullDist, -2.1, 4.5, 4.2, 1.2);
  ctx.fill();

  // Ivory ferrule
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(pullDist + 4, -2.3, 9, 4.6);

  // Maple shaft -> brass joint -> walnut butt & linen wrap
  const shaftGrad = ctx.createLinearGradient(pullDist + 13, 0, pullDist + cueLen, 0);
  shaftGrad.addColorStop(0, '#F5E3C8');
  shaftGrad.addColorStop(0.46, '#DFB47C');
  shaftGrad.addColorStop(0.47, '#D4AF37');
  shaftGrad.addColorStop(0.49, '#B4882D');
  shaftGrad.addColorStop(0.5, '#3E1C14');
  shaftGrad.addColorStop(0.65, '#682B1E');
  shaftGrad.addColorStop(0.66, '#1E1B1A');
  shaftGrad.addColorStop(0.86, '#272424');
  shaftGrad.addColorStop(0.87, '#512116');
  shaftGrad.addColorStop(0.97, '#2A120D');
  shaftGrad.addColorStop(1, '#111827');

  ctx.fillStyle = shaftGrad;
  ctx.beginPath();
  ctx.moveTo(pullDist + 13, -2.4);
  ctx.lineTo(pullDist + cueLen, -5.4);
  ctx.lineTo(pullDist + cueLen, 5.4);
  ctx.lineTo(pullDist + 13, 2.4);
  ctx.closePath();
  ctx.fill();

  // Subtle top lacquer sheen along the stick
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(pullDist + 13, -1.6);
  ctx.lineTo(pullDist + cueLen - 4, -3.6);
  ctx.lineTo(pullDist + cueLen - 4, -1.9);
  ctx.lineTo(pullDist + 13, -0.7);
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

  const lampX = ball.x < POOL_TABLE_W * 0.5 ? POOL_TABLE_W * 0.28 : POOL_TABLE_W * 0.72;
  const lampY = POOL_TABLE_H * 0.5;
  const lampFx = drawDynamicBallShadowAndSpec(ctx, 0, 0, r, lampX - ball.x, lampY - ball.y, 0.28);
  ctx.save();
  ctx.globalAlpha *= 0.42;
  lampFx.drawShadow();
  ctx.restore();

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
  lampFx.drawSpecular();

  ctx.strokeStyle = ball.id === 8 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = Math.max(0.6, 1 / Math.max(0.5, scale));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
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
        drawDynamicPointLight(ctx, pf.x, pf.y, pf.r * 2.3, '16, 185, 129', (1 - ease) * 0.55);
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
