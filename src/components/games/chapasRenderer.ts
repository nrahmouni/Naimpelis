import type { ChapasCap, ChapasFlagId } from '../../types';
import { getCircleFlagCdnUrl } from '../../shared/gameAssetsCdn';
import {
  type ChapasBall,
  CHAPAS_ARENA_H,
  CHAPAS_ARENA_W,
  CHAPAS_BALL_RADIUS,
  CHAPAS_CAP_RADIUS,
  CHAPAS_GOAL_DEPTH,
  CHAPAS_GOAL_LEFT,
  CHAPAS_GOAL_RIGHT,
  CHAPAS_MIN_POWER,
  CHAPAS_PITCH_BOTTOM,
  CHAPAS_PITCH_H,
  CHAPAS_PITCH_LEFT,
  CHAPAS_PITCH_RIGHT,
  CHAPAS_PITCH_TOP,
  CHAPAS_PITCH_W,
} from '../../shared/futbolChapas';
import {
  drawDynamicBallShadowAndSpec,
  drawMotionSmearTrail,
  drawStadiumCameraFlashes,
} from './arcade/canvas2dFxHelpers';

export interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  maxR?: number;
  alpha: number;
  color: string;
  kind: 'spark' | 'ring';
}

export interface CrowdSpectator {
  x: number;
  y: number;
  color: string;
  skin: string;
  phase: number;
}

export interface AimDragVisual {
  capId: string;
  angle: number;
  power: number;
}

const CROWD_PALETTE = [
  '#EF4444',
  '#F59E0B',
  '#38BDF8',
  '#FFFFFF',
  '#10B981',
  '#F472B6',
  '#FACC15',
  '#3B82F6',
  '#E5E7EB',
  '#FB923C',
];

const CROWD_SKINS = ['#F5CBA7', '#E0AC69', '#C68642', '#8D5524', '#FDEBD0'];

const FLAG_SVG_CACHE = new Map<string, { img: HTMLImageElement; loaded: boolean; failed: boolean }>();

export function getChapasFlagImage(flag: ChapasFlagId): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const cached = FLAG_SVG_CACHE.get(flag);
  if (!cached) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const entry = { img, loaded: false, failed: false };
    img.onload = () => {
      entry.loaded = true;
    };
    img.onerror = () => {
      entry.failed = true;
    };
    img.src = getCircleFlagCdnUrl(flag);
    FLAG_SVG_CACHE.set(flag, entry);
    return null;
  }
  if (!cached.failed && cached.loaded && cached.img.complete && cached.img.naturalWidth > 0) {
    return cached.img;
  }
  return null;
}

let CACHED_TURF_PATTERN: CanvasPattern | null = null;
let CACHED_TURF_CTX: CanvasRenderingContext2D | null = null;

function getTurfGrainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (typeof document === 'undefined') return null;
  if (CACHED_TURF_PATTERN && CACHED_TURF_CTX === ctx) return CACHED_TURF_PATTERN;
  const tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  let seed = 9001;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * 160;
    const y = rnd() * 160;
    const bright = rnd() > 0.5;
    tctx.fillStyle = bright ? 'rgba(217, 249, 157, 0.14)' : 'rgba(15, 36, 10, 0.17)';
    tctx.fillRect(x, y, 1.5, 2.2);
  }
  CACHED_TURF_PATTERN = ctx.createPattern(tile, 'repeat');
  CACHED_TURF_CTX = ctx;
  return CACHED_TURF_PATTERN;
}

function buildGrandstandCrowd(): CrowdSpectator[] {
  const specs: CrowdSpectator[] = [];
  const rows = 5;
  const cols = 54;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let side = 0; side < 2; side += 1) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const baseX = side === 0 ? 7 + r * 6.8 : CHAPAS_ARENA_W - 7 - r * 6.8;
        const t = c / (cols - 1);
        const yMin = 104 + r * 3.5;
        const yMax = CHAPAS_ARENA_H - 104 - r * 3.5;
        const y = yMin + t * (yMax - yMin) + (rand() - 0.5) * 2.2;
        const x = baseX + (rand() - 0.5) * 1.8;
        specs.push({
          x,
          y,
          color: CROWD_PALETTE[Math.floor(rand() * CROWD_PALETTE.length)],
          skin: CROWD_SKINS[Math.floor(rand() * CROWD_SKINS.length)],
          phase: rand() * Math.PI * 2,
        });
      }
    }
  }
  return specs;
}

export const GRANDSTAND_CROWD = buildGrandstandCrowd();

export function traceBottleCapCrownPath(
  ctx: CanvasRenderingContext2D,
  outerRadius: number,
  flutes = 21,
  notchDepth = 0.9
): void {
  const steps = flutes * 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const rad = i % 2 === 0 ? outerRadius : outerRadius - notchDepth;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawFlagEmblem(
  ctx: CanvasRenderingContext2D,
  flag: ChapasFlagId,
  r: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  const cdnFlag = getChapasFlagImage(flag);
  if (cdnFlag) {
    ctx.drawImage(cdnFlag, -r, -r, r * 2, r * 2);
    ctx.restore();
    return;
  }

  if (flag === 'ar') {
    ctx.fillStyle = '#6FAEE3';
    ctx.fillRect(-r, -r, r * 2, r * 0.67);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r, -r * 0.33, r * 2, r * 0.66);
    ctx.fillStyle = '#6FAEE3';
    ctx.fillRect(-r, r * 0.33, r * 2, r * 0.67);
    ctx.fillStyle = '#F6B40E';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.23, 0, Math.PI * 2);
    ctx.fill();
  } else if (flag === 'es') {
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(-r, -r, r * 2, r * 0.52);
    ctx.fillStyle = '#FFC400';
    ctx.fillRect(-r, -r * 0.48, r * 2, r * 0.96);
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(-r, r * 0.48, r * 2, r * 0.52);
    ctx.fillStyle = '#AD1519';
    ctx.fillRect(-r * 0.36, -r * 0.22, r * 0.28, r * 0.42);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-r * 0.34, -r * 0.3, r * 0.24, r * 0.1);
  } else if (flag === 'br') {
    ctx.fillStyle = '#009C3B';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = '#FFDF00';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.72);
    ctx.lineTo(r * 0.78, 0);
    ctx.lineTo(0, r * 0.72);
    ctx.lineTo(-r * 0.78, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#002776';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 0.38, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  } else if (flag === 'fr') {
    ctx.fillStyle = '#002395';
    ctx.fillRect(-r, -r, r * 0.67, r * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.33, -r, r * 0.66, r * 2);
    ctx.fillStyle = '#ED2939';
    ctx.fillRect(r * 0.33, -r, r * 0.67, r * 2);
  } else if (flag === 'ma') {
    ctx.fillStyle = '#C1272D';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = '#006233';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const idx = (i * 2) % 5;
      const ang = -Math.PI / 2 + (idx * 2 * Math.PI) / 5;
      const px = Math.cos(ang) * r * 0.44;
      const py = Math.sin(ang) * r * 0.44;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (flag === 'pt') {
    ctx.fillStyle = '#046A38';
    ctx.fillRect(-r, -r, r * 0.85, r * 2);
    ctx.fillStyle = '#DA291C';
    ctx.fillRect(-r * 0.15, -r, r * 1.15, r * 2);
    ctx.fillStyle = '#FFE900';
    ctx.beginPath();
    ctx.arc(-r * 0.15, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.25, -r * 0.15, r * 0.2, r * 0.3);
  } else if (flag === 'it') {
    ctx.fillStyle = '#009246';
    ctx.fillRect(-r, -r, r * 0.67, r * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.33, -r, r * 0.66, r * 2);
    ctx.fillStyle = '#CE2B37';
    ctx.fillRect(r * 0.33, -r, r * 0.67, r * 2);
  } else {
    ctx.fillStyle = '#111111';
    ctx.fillRect(-r, -r, r * 2, r * 0.67);
    ctx.fillStyle = '#DD0000';
    ctx.fillRect(-r, -r * 0.33, r * 2, r * 0.66);
    ctx.fillStyle = '#FFCE00';
    ctx.fillRect(-r, r * 0.33, r * 2, r * 0.67);
  }

  ctx.restore();
}

export function drawBleacherWing(ctx: CanvasRenderingContext2D, side: 'left' | 'right'): void {
  ctx.save();
  const isL = side === 'left';
  const outerX = isL ? 2 : CHAPAS_ARENA_W - 2;
  const innerX = isL ? 44 : CHAPAS_ARENA_W - 44;

  // Cast shadow on outer grass
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.moveTo(outerX, 98);
  ctx.lineTo(innerX + (isL ? 5 : -5), 118);
  ctx.lineTo(innerX + (isL ? 5 : -5), CHAPAS_ARENA_H - 118);
  ctx.lineTo(outerX, CHAPAS_ARENA_H - 98);
  ctx.closePath();
  ctx.fill();

  const wingGrad = ctx.createLinearGradient(outerX, 0, innerX, 0);
  wingGrad.addColorStop(0, '#334155');
  wingGrad.addColorStop(0.55, '#475569');
  wingGrad.addColorStop(1, '#1E293B');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(outerX, 94);
  ctx.lineTo(innerX, 114);
  ctx.lineTo(innerX, CHAPAS_ARENA_H - 114);
  ctx.lineTo(outerX, CHAPAS_ARENA_H - 94);
  ctx.closePath();
  ctx.fill();

  // Outer trim edge
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Tier steps
  ctx.strokeStyle = 'rgba(15,23,42,0.55)';
  ctx.lineWidth = 1.2;
  for (let r = 1; r <= 4; r += 1) {
    const rx = outerX + (innerX - outerX) * (r / 5);
    const pad = r * 4;
    ctx.beginPath();
    ctx.moveTo(rx, 94 + pad);
    ctx.lineTo(rx, CHAPAS_ARENA_H - 94 - pad);
    ctx.stroke();
  }

  // Brushed metallic front guardrail
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(innerX, 114);
  ctx.lineTo(innerX, CHAPAS_ARENA_H - 114);
  ctx.stroke();
  ctx.restore();
}

export function drawChapasStadiumBackdrop(
  ctx: CanvasRenderingContext2D,
  ts: number,
  crowdExcite: boolean,
  netRipple: number
): void {
  const turfPattern = getTurfGrainPattern(ctx);

  // Seamless textured grass apron surrounding the arena
  const apronGrad = ctx.createRadialGradient(
    CHAPAS_ARENA_W / 2,
    CHAPAS_ARENA_H / 2,
    75,
    CHAPAS_ARENA_W / 2,
    CHAPAS_ARENA_H / 2,
    480
  );
  apronGrad.addColorStop(0, '#5A8B2E');
  apronGrad.addColorStop(0.65, '#4B7825');
  apronGrad.addColorStop(1, '#3D621D');
  ctx.fillStyle = apronGrad;
  ctx.fillRect(0, 0, CHAPAS_ARENA_W, CHAPAS_ARENA_H);
  if (turfPattern) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = turfPattern;
    ctx.fillRect(0, 0, CHAPAS_ARENA_W, CHAPAS_ARENA_H);
    ctx.restore();
  }

  drawBleacherWing(ctx, 'left');
  drawBleacherWing(ctx, 'right');

  for (const sp of GRANDSTAND_CROWD) {
    const wave = Math.sin(ts * 0.004 + sp.phase);
    const bounce = crowdExcite
      ? Math.abs(Math.sin(ts * 0.018 + sp.phase)) * 4.2
      : wave > 0.92
      ? 1.2
      : 0;
    const sy = sp.y - bounce;
    ctx.fillStyle = sp.color;
    ctx.beginPath();
    ctx.arc(sp.x, sy, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sp.skin;
    ctx.beginPath();
    ctx.arc(sp.x, sy - 1.2, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
  drawStadiumCameraFlashes(ctx, CHAPAS_ARENA_W, 95, CHAPAS_ARENA_H - 95, ts * 0.001, crowdExcite ? 0.95 : 0.25);

  // Alternating mowed green grass stripes inside pitch + organic grain
  ctx.save();
  ctx.beginPath();
  ctx.rect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, CHAPAS_PITCH_W, CHAPAS_PITCH_H);
  ctx.clip();

  const stripeCount = 10;
  const stripeH = CHAPAS_PITCH_H / stripeCount;
  for (let i = 0; i < stripeCount; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#69A83B' : '#58942E';
    ctx.fillRect(
      CHAPAS_PITCH_LEFT,
      CHAPAS_PITCH_TOP + i * stripeH,
      CHAPAS_PITCH_W,
      stripeH + 0.5
    );
  }
  if (turfPattern) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = turfPattern;
    ctx.fillRect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, CHAPAS_PITCH_W, CHAPAS_PITCH_H);
    ctx.globalAlpha = 1;
  }

  const turfGlow = ctx.createRadialGradient(
    CHAPAS_ARENA_W / 2,
    CHAPAS_ARENA_H / 2,
    20,
    CHAPAS_ARENA_W / 2,
    CHAPAS_ARENA_H / 2,
    270
  );
  turfGlow.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
  turfGlow.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  ctx.fillStyle = turfGlow;
  ctx.fillRect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, CHAPAS_PITCH_W, CHAPAS_PITCH_H);

  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 2.6;
  const midX = CHAPAS_ARENA_W / 2;
  const midY = (CHAPAS_PITCH_TOP + CHAPAS_PITCH_BOTTOM) / 2;

  ctx.strokeRect(
    CHAPAS_PITCH_LEFT + 1.5,
    CHAPAS_PITCH_TOP + 1.5,
    CHAPAS_PITCH_W - 3,
    CHAPAS_PITCH_H - 3
  );

  ctx.beginPath();
  ctx.moveTo(CHAPAS_PITCH_LEFT, midY);
  ctx.lineTo(CHAPAS_PITCH_RIGHT, midY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(midX, midY, 64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(midX, midY, 5.5, 0, Math.PI * 2);
  ctx.fill();

  const penW = 224;
  const penH = 98;
  const goalBoxW = 144;
  const goalBoxH = 38;

  ctx.strokeRect(midX - penW / 2, CHAPAS_PITCH_TOP, penW, penH);
  ctx.strokeRect(midX - goalBoxW / 2, CHAPAS_PITCH_TOP, goalBoxW, goalBoxH);
  ctx.beginPath();
  ctx.arc(midX, CHAPAS_PITCH_TOP + 68, 44, 0.24 * Math.PI, 0.76 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(midX, CHAPAS_PITCH_TOP + 68, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeRect(midX - penW / 2, CHAPAS_PITCH_BOTTOM - penH, penW, penH);
  ctx.strokeRect(midX - goalBoxW / 2, CHAPAS_PITCH_BOTTOM - goalBoxH, goalBoxW, goalBoxH);
  ctx.beginPath();
  ctx.arc(midX, CHAPAS_PITCH_BOTTOM - 68, 44, 1.24 * Math.PI, 1.76 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(midX, CHAPAS_PITCH_BOTTOM - 68, 3.2, 0, Math.PI * 2);
  ctx.fill();

  const cR = 14;
  const corners: Array<[number, number, number, number]> = [
    [CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, 0, Math.PI * 0.5],
    [CHAPAS_PITCH_RIGHT, CHAPAS_PITCH_TOP, Math.PI * 0.5, Math.PI],
    [CHAPAS_PITCH_RIGHT, CHAPAS_PITCH_BOTTOM, Math.PI, Math.PI * 1.5],
    [CHAPAS_PITCH_LEFT, CHAPAS_PITCH_BOTTOM, Math.PI * 1.5, Math.PI * 2],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, cR, a0, a1);
    ctx.stroke();
  }
  ctx.restore();

  // Silver Beveled Stadium Perimeter Rails + Corner Flags
  const railW = 9;
  const railGrad = ctx.createLinearGradient(CHAPAS_PITCH_LEFT, 0, CHAPAS_PITCH_RIGHT, 0);
  railGrad.addColorStop(0, '#CBD5E1');
  railGrad.addColorStop(0.5, '#F8FAFC');
  railGrad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = railGrad;

  // Cast outer shadow under perimeter rail
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(CHAPAS_PITCH_LEFT - railW - 2, CHAPAS_PITCH_TOP - railW + 2, CHAPAS_PITCH_W + railW * 2 + 4, CHAPAS_PITCH_H + railW * 2 + 2);

  ctx.fillStyle = railGrad;
  ctx.fillRect(CHAPAS_PITCH_LEFT - railW, CHAPAS_PITCH_TOP - railW, railW, CHAPAS_PITCH_H + railW * 2);
  ctx.fillRect(CHAPAS_PITCH_RIGHT, CHAPAS_PITCH_TOP - railW, railW, CHAPAS_PITCH_H + railW * 2);
  ctx.fillRect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP - railW, CHAPAS_GOAL_LEFT - CHAPAS_PITCH_LEFT, railW);
  ctx.fillRect(CHAPAS_GOAL_RIGHT, CHAPAS_PITCH_TOP - railW, CHAPAS_PITCH_RIGHT - CHAPAS_GOAL_RIGHT, railW);
  ctx.fillRect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_BOTTOM, CHAPAS_GOAL_LEFT - CHAPAS_PITCH_LEFT, railW);
  ctx.fillRect(CHAPAS_GOAL_RIGHT, CHAPAS_PITCH_BOTTOM, CHAPAS_PITCH_RIGHT - CHAPAS_GOAL_RIGHT, railW);

  // Joint notches along the silver rail for physical modular look
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';
  ctx.lineWidth = 1.2;
  for (let y = CHAPAS_PITCH_TOP + 54; y < CHAPAS_PITCH_BOTTOM; y += 64) {
    ctx.beginPath();
    ctx.moveTo(CHAPAS_PITCH_LEFT - railW, y);
    ctx.lineTo(CHAPAS_PITCH_LEFT, y);
    ctx.moveTo(CHAPAS_PITCH_RIGHT, y);
    ctx.lineTo(CHAPAS_PITCH_RIGHT + railW, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(
    CHAPAS_PITCH_LEFT - railW,
    CHAPAS_PITCH_TOP - railW,
    CHAPAS_PITCH_W + railW * 2,
    CHAPAS_PITCH_H + railW * 2
  );

  const flagSway = Math.sin(ts * 0.008) * 1.4;
  const drawCornerFlag = (x: number, y: number, color: string, flipX: number, flipY: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(flipX * 8, flipY * 10);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(flipX * 8, flipY * 10);
    ctx.lineTo(flipX * 19, flipY * 5 + flagSway);
    ctx.lineTo(flipX * 6, flipY * 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawCornerFlag(CHAPAS_PITCH_LEFT - 2, CHAPAS_PITCH_TOP - 2, '#EF4444', -1, -1);
  drawCornerFlag(CHAPAS_PITCH_RIGHT + 2, CHAPAS_PITCH_TOP - 2, '#EF4444', 1, -1);
  drawCornerFlag(CHAPAS_PITCH_LEFT - 2, CHAPAS_PITCH_BOTTOM + 2, '#38BDF8', -1, 1);
  drawCornerFlag(CHAPAS_PITCH_RIGHT + 2, CHAPAS_PITCH_BOTTOM + 2, '#38BDF8', 1, 1);

  const drawGoalNet = (isTop: boolean) => {
    const yMouth = isTop ? CHAPAS_PITCH_TOP : CHAPAS_PITCH_BOTTOM;
    const yBack = isTop
      ? CHAPAS_PITCH_TOP - CHAPAS_GOAL_DEPTH + netRipple
      : CHAPAS_PITCH_BOTTOM + CHAPAS_GOAL_DEPTH + netRipple;
    const gx0 = CHAPAS_GOAL_LEFT;
    const gx1 = CHAPAS_GOAL_RIGHT;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
    ctx.beginPath();
    ctx.moveTo(gx0, yMouth);
    ctx.lineTo(gx0 + 6, yBack);
    ctx.lineTo(gx1 - 6, yBack);
    ctx.lineTo(gx1, yMouth);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 1.2;
    const cols = 13;
    for (let i = 0; i <= cols; i += 1) {
      const frac = i / cols;
      const xM = gx0 + (gx1 - gx0) * frac;
      const xB = gx0 + 6 + (gx1 - gx0 - 12) * frac;
      ctx.beginPath();
      ctx.moveTo(xM, yMouth);
      ctx.lineTo(xB, yBack);
      ctx.stroke();
    }
    const rows = 4;
    for (let r = 1; r <= rows; r += 1) {
      const frac = r / rows;
      const ry = yMouth + (yBack - yMouth) * frac;
      ctx.beginPath();
      ctx.moveTo(gx0 + 6 * frac, ry);
      ctx.lineTo(gx1 - 6 * frac, ry);
      ctx.stroke();
    }

    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(gx0, yMouth);
    ctx.lineTo(gx0 + 6, yBack);
    ctx.lineTo(gx1 - 6, yBack);
    ctx.lineTo(gx1, yMouth);
    ctx.stroke();

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(gx0, yMouth);
    ctx.lineTo(gx1, yMouth);
    ctx.stroke();

    for (const px of [gx0, gx1]) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, yMouth, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  };

  drawGoalNet(true);
  drawGoalNet(false);
}

export function drawChapasAimingGuides(
  ctx: CanvasRenderingContext2D,
  draggedCap: ChapasCap,
  drag: AimDragVisual,
  flipped: boolean
): void {
  const ringR = CHAPAS_CAP_RADIUS + 18 + drag.power * 52;
  const belowMin = drag.power < CHAPAS_MIN_POWER;

  ctx.save();
  ctx.translate(draggedCap.x, draggedCap.y);

  ctx.fillStyle = belowMin ? 'rgba(244, 63, 94, 0.24)' : 'rgba(15, 23, 42, 0.44)';
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = belowMin ? 'rgba(251, 113, 133, 0.9)' : 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!belowMin) {
    const pullDist = drag.power * 68;
    const bandColor = drag.power > 0.75 ? '#EF4444' : drag.power > 0.4 ? '#F59E0B' : '#10B981';
    ctx.save();
    ctx.rotate(drag.angle);
    ctx.strokeStyle = bandColor;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-CHAPAS_CAP_RADIUS * 0.75, -CHAPAS_CAP_RADIUS * 0.6);
    ctx.lineTo(-CHAPAS_CAP_RADIUS - pullDist, 0);
    ctx.lineTo(-CHAPAS_CAP_RADIUS * 0.75, CHAPAS_CAP_RADIUS * 0.6);
    ctx.stroke();

    const guideLen = 90 + drag.power * 160;
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(CHAPAS_CAP_RADIUS + 8, 0);
    ctx.lineTo(guideLen, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    const arrowLen = CHAPAS_CAP_RADIUS + 20 + drag.power * 68;
    const arrowGrad = ctx.createLinearGradient(CHAPAS_CAP_RADIUS + 4, 0, arrowLen, 0);
    arrowGrad.addColorStop(0, '#10B981');
    arrowGrad.addColorStop(0.5, '#FACC15');
    arrowGrad.addColorStop(1, '#EF4444');

    ctx.fillStyle = arrowGrad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 5;

    ctx.beginPath();
    ctx.moveTo(CHAPAS_CAP_RADIUS + 4, -5.5);
    ctx.lineTo(arrowLen - 17, -5.5);
    ctx.lineTo(arrowLen - 17, -13);
    ctx.lineTo(arrowLen, 0);
    ctx.lineTo(arrowLen - 17, 13);
    ctx.lineTo(arrowLen - 17, 5.5);
    ctx.lineTo(CHAPAS_CAP_RADIUS + 4, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const pct = Math.round(drag.power * 100);
    ctx.save();
    if (flipped) ctx.rotate(Math.PI);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.beginPath();
    ctx.roundRect(-22, -ringR - 22, 44, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 10px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, 0, -ringR - 13);
    ctx.restore();
  }

  ctx.restore();
}

export function drawChapasBallAndParticles(
  ctx: CanvasRenderingContext2D,
  renderBall: ChapasBall,
  ballTrail: Array<{ x: number; y: number }> | undefined,
  particles: ImpactParticle[]
): void {
  if (ballTrail && ballTrail.length > 1) {
    drawMotionSmearTrail(ctx, ballTrail, CHAPAS_BALL_RADIUS * 0.85, '255, 255, 255', 0.3);
  }

  ctx.save();
  ctx.translate(renderBall.x, renderBall.y);
  const br = CHAPAS_BALL_RADIUS;
  const lampFx = drawDynamicBallShadowAndSpec(
    ctx,
    0,
    0,
    br,
    CHAPAS_ARENA_W * 0.5 - renderBall.x,
    CHAPAS_ARENA_H * 0.5 - renderBall.y,
    0.42
  );
  lampFx.drawShadow();

  const ballGrad = ctx.createRadialGradient(-br * 0.35, -br * 0.35, 1, 0, 0, br);
  ballGrad.addColorStop(0, '#FFFFFF');
  ballGrad.addColorStop(0.75, '#E2E8F0');
  ballGrad.addColorStop(1, '#94A3B8');
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(renderBall.spinAngle);

  ctx.fillStyle = '#111827';
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const px = Math.cos(a) * br * 0.38;
    const py = Math.sin(a) * br * 0.38;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * br * 0.96, Math.sin(a) * br * 0.96, br * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  lampFx.drawSpecular();

  ctx.strokeStyle = 'rgba(15,23,42,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
