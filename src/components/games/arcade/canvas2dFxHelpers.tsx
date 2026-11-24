import React from 'react';

/**
 * Retro CRT scanline & subtle phosphor triad overlay component.
 * Uses strictly CSS gradients (ZERO backdrop-filter for WebGL & Smart TV safety).
 */
export const CrtOverlayLayer: React.FC<{ enabled: boolean; className?: string }> = ({
  enabled,
  className = '',
}) => {
  if (!enabled) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-20 overflow-hidden ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(2,6,23,0.34) 2px, rgba(2,6,23,0.34) 4px), repeating-linear-gradient(to right, rgba(255,0,70,0.03) 0px, rgba(0,255,140,0.03) 1px, rgba(0,180,255,0.03) 2px, transparent 3px)',
        boxShadow: 'inset 0 0 64px rgba(2,6,23,0.68)',
      }}
    />
  );
};

/**
 * Draws optional CRT scanlines directly onto a 2D Canvas.
 */
export function drawCanvas2dCrtOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity = 0.22
): void {
  ctx.save();
  ctx.fillStyle = `rgba(2, 6, 23, ${intensity})`;
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1.5);
  }
  const vig = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    Math.min(w, h) * 0.32,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(2,6,23,${Math.min(0.65, intensity * 2.1)})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Additive radial dynamic 2D point-light glow for lasers, bombs, power-ups, and puck hits.
 */
export function drawDynamicPointLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgbTuple: string,
  alpha = 0.45
): void {
  if (radius <= 0 || alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, `rgba(${rgbTuple}, ${alpha})`);
  grad.addColorStop(0.45, `rgba(${rgbTuple}, ${alpha * 0.38})`);
  grad.addColorStop(1, `rgba(${rgbTuple}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Computes overhead directional lamp drop shadow & dynamic specular offset for balls/pucks/caps.
 */
export function drawDynamicBallShadowAndSpec(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lampX: number,
  lampY: number,
  specAlpha = 0.55
): { drawShadow: () => void; drawSpecular: () => void } {
  const dx = cx - lampX;
  const dy = cy - lampY;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const stretch = Math.min(0.62, dist * 0.0012);

  return {
    drawShadow: () => {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.46)';
      ctx.beginPath();
      ctx.ellipse(
        cx + nx * r * (0.28 + stretch * 0.55),
        cy + ny * r * (0.28 + stretch * 0.55),
        r * (1.02 + stretch * 0.16),
        r * 0.92,
        Math.atan2(ny, nx),
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    },
    drawSpecular: () => {
      ctx.save();
      const sx = cx - nx * r * 0.36;
      const sy = cy - ny * r * 0.36;
      const sg = ctx.createRadialGradient(sx, sy, 0.5, sx, sy, r * 0.65);
      sg.addColorStop(0, `rgba(255,255,255,${specAlpha})`);
      sg.addColorStop(0.45, `rgba(255,255,255,${specAlpha * 0.25})`);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };
}

/**
 * Volume-preserving elastic squash & stretch factor from velocity / impulse timer.
 */
export function computeSquashStretch(
  impactTimer: number,
  vy = 0,
  impulseStrength = 0.32
): { scaleX: number; scaleY: number } {
  const impact = Math.max(0, Math.min(1, impactTimer)) * impulseStrength;
  const airStretch = Math.max(-0.18, Math.min(0.22, (Math.abs(vy) / 600) * 0.16));
  const scaleY = Math.max(0.66, Math.min(1.36, 1 - impact + airStretch));
  const scaleX = 1 / Math.max(0.62, scaleY);
  return { scaleX, scaleY };
}

/**
 * Smooth additive motion-smear trail behind fast balls, pucks, and planes.
 */
export function drawMotionSmearTrail(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
  headRadius: number,
  rgbTuple: string,
  maxAlpha = 0.42
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = points.length;
  for (let i = 1; i < n; i += 1) {
    const t = 1 - i / n;
    ctx.strokeStyle = `rgba(${rgbTuple}, ${(t * t * maxAlpha).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, headRadius * 1.45 * t);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Multi-layer animated procedural cosmic nebula & parallax stars for space/sky games.
 */
export function drawProceduralNebulaBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number,
  theme: 'space' | 'cyber' | 'sky' = 'space'
): void {
  ctx.save();
  if (theme === 'sky') {
    // Drifting sunlit cumulus cloud silhouettes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (let i = 0; i < 6; i += 1) {
      const speed = 14 + (i % 3) * 9;
      const cx = (((w + 180) - ((timeSec * speed + i * 165) % (w + 220))) + (w + 220)) % (w + 220) - 90;
      const cy = 42 + ((i * 53) % Math.max(60, h * 0.45));
      const rw = 44 + (i % 3) * 18;
      ctx.beginPath();
      ctx.arc(cx, cy, rw * 0.55, 0, Math.PI * 2);
      ctx.arc(cx + rw * 0.42, cy + 5, rw * 0.42, 0, Math.PI * 2);
      ctx.arc(cx - rw * 0.42, cy + 7, rw * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = 'lighter';
  const blobs =
    theme === 'cyber'
      ? [
          { bx: 0.28, by: 0.26, r: 220, col: '56, 189, 248', a: 0.12 },
          { bx: 0.74, by: 0.38, r: 240, col: '168, 85, 247', a: 0.11 },
        ]
      : [
          { bx: 0.25, by: 0.32, r: 230, col: '99, 102, 241', a: 0.14 },
          { bx: 0.72, by: 0.24, r: 210, col: '236, 72, 153', a: 0.1 },
          { bx: 0.5, by: 0.68, r: 260, col: '14, 165, 233', a: 0.09 },
        ];
  for (let i = 0; i < blobs.length; i += 1) {
    const b = blobs[i];
    const ox = Math.sin(timeSec * 0.22 + i * 2.1) * 34;
    const oy = Math.cos(timeSec * 0.17 + i * 1.6) * 22;
    const gx = b.bx * w + ox;
    const gy = b.by * h + oy;
    const g = ctx.createRadialGradient(gx, gy, 10, gx, gy, b.r);
    g.addColorStop(0, `rgba(${b.col}, ${b.a})`);
    g.addColorStop(1, `rgba(${b.col}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(gx, gy, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Deterministic twinkling stadium crowd camera flashes during goals/smashes.
 */
export function drawStadiumCameraFlashes(
  ctx: CanvasRenderingContext2D,
  w: number,
  topY: number,
  bottomY: number,
  timeSec: number,
  excitement = 0.35
): void {
  const count = excitement > 0.7 ? 16 : 6;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const spanY = Math.max(20, bottomY - topY);
  for (let i = 0; i < count; i += 1) {
    const bucket = Math.floor(timeSec * (excitement > 0.7 ? 10 : 4) + i * 1.7);
    const seed = (bucket * 1103515245 + 12345 + i * 97) & 0x7fffffff;
    if ((seed % 100) > (excitement > 0.7 ? 52 : 24)) continue;
    const fx = ((seed * 37) % Math.max(40, Math.floor(w - 30))) + 15;
    const fy = topY + ((seed * 53) % Math.floor(spanY));
    const rad = 8 + (seed % 10);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, rad);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    g.addColorStop(0.35, 'rgba(186, 230, 253, 0.45)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, fy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
