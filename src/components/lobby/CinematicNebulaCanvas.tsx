import React, { useEffect, useRef } from 'react';

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alphaBase: number;
  twinkleOffset: number;
  twinkleSpeed: number;
  tint: 'white' | 'violet' | 'cyan';
}

function createDustMotes(count: number): DustMote[] {
  const tints: DustMote['tint'][] = ['white', 'violet', 'white', 'cyan', 'violet'];
  const motes: DustMote[] = [];
  for (let i = 0; i < count; i++) {
    motes.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.000024,
      vy: -(0.000022 + Math.random() * 0.000034),
      size: 0.65 + Math.random() * 0.9,
      alphaBase: 0.18 + Math.random() * 0.34,
      twinkleOffset: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.0009 + Math.random() * 0.0014,
      tint: tints[i % tints.length],
    });
  }
  return motes;
}

function createAntiBandPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (typeof document === 'undefined') return null;
  const tile = document.createElement('canvas');
  tile.width = 96;
  tile.height = 96;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  const img = tctx.createImageData(96, 96);
  const data = img.data;
  let seed = 4242;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = (seed >>> 24) & 0xff;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 6;
  }
  tctx.putImageData(img, 0, 0);
  return ctx.createPattern(tile, 'repeat');
}

function createAuroraGlowSprite(
  radius: number,
  innerColor: string,
  midColor: string
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || radius <= 0) return null;
  const size = Math.max(4, Math.ceil(radius * 2));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cctx = c.getContext('2d');
  if (!cctx) return null;
  const grad = cctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.45, midColor);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, size, size);
  return c;
}

export const CinematicNebulaCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number; tx: number; ty: number }>({
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const antiBandPattern = createAntiBandPattern(ctx);

    const reducedMotionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let isReducedMotion = Boolean(reducedMotionQuery?.matches);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId: number | null = null;
    let lastDrawNow = 0;
    const motes = createDustMotes(36);

    // Cached offscreen assets rebuilt only on resize
    let vignetteOverlayCanvas: HTMLCanvasElement | null = null;
    let glow1Sprite: HTMLCanvasElement | null = null;
    let glow2Sprite: HTMLCanvasElement | null = null;
    let glow1Radius = 240;
    let glow2Radius = 220;
    let veilGrad: CanvasGradient | null = null;
    let strandStrokeGrad: CanvasGradient | null = null;

    const buildResizeAssets = () => {
      const maxDim = Math.max(width, height);
      glow1Radius = Math.max(180, Math.round(maxDim * 0.5));
      glow2Radius = Math.max(160, Math.round(maxDim * 0.45));
      glow1Sprite = createAuroraGlowSprite(
        glow1Radius,
        'rgba(124, 58, 237, 0.15)',
        'rgba(76, 29, 149, 0.06)'
      );
      glow2Sprite = createAuroraGlowSprite(
        glow2Radius,
        'rgba(79, 70, 229, 0.11)',
        'rgba(67, 56, 202, 0.045)'
      );

      veilGrad = ctx.createLinearGradient(0, height * 0.25, width, height * 0.85);
      veilGrad.addColorStop(0, 'rgba(145, 70, 255, 0)');
      veilGrad.addColorStop(0.38, 'rgba(124, 58, 237, 0.045)');
      veilGrad.addColorStop(0.68, 'rgba(79, 70, 229, 0.035)');
      veilGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      strandStrokeGrad = ctx.createLinearGradient(0, height * 0.5, width, height * 0.5);
      strandStrokeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      strandStrokeGrad.addColorStop(0.24, 'rgba(145, 70, 255, 0.9)');
      strandStrokeGrad.addColorStop(0.54, 'rgba(196, 181, 253, 0.95)');
      strandStrokeGrad.addColorStop(0.8, 'rgba(76, 201, 240, 0.65)');
      strandStrokeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      const vCanvas = document.createElement('canvas');
      vCanvas.width = Math.max(1, Math.floor(width * dpr));
      vCanvas.height = Math.max(1, Math.floor(height * dpr));
      const vctx = vCanvas.getContext('2d');
      if (vctx) {
        vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const vignette = vctx.createRadialGradient(
          width * 0.5,
          height * 0.48,
          Math.min(width, height) * 0.35,
          width * 0.5,
          height * 0.48,
          maxDim * 0.85
        );
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(0.65, 'rgba(0, 0, 0, 0.32)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
        vctx.fillStyle = vignette;
        vctx.fillRect(0, 0, width, height);
        if (antiBandPattern) {
          vctx.fillStyle = antiBandPattern;
          vctx.fillRect(0, 0, width, height);
        }
        vignetteOverlayCanvas = vCanvas;
      } else {
        vignetteOverlayCanvas = null;
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildResizeAssets();
    };

    const drawFrame = (timeMs: number) => {
      pointerRef.current.x += (pointerRef.current.tx - pointerRef.current.x) * 0.05;
      pointerRef.current.y += (pointerRef.current.ty - pointerRef.current.y) * 0.05;
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;
      const t = timeMs * 0.001;

      // 1. Dominant Pure OLED Black base
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // 2. Cached dark purple & indigo aurora orbs (zero per-frame gradient allocs)
      ctx.globalCompositeOperation = 'lighter';
      if (glow1Sprite) {
        const glow1X = width * 0.34 + Math.sin(t * 0.16) * (width * 0.08) + px * 16;
        const glow1Y = height * 0.42 + Math.cos(t * 0.13) * (height * 0.05) + py * 12;
        ctx.drawImage(
          glow1Sprite,
          glow1X - glow1Radius,
          glow1Y - glow1Radius,
          glow1Radius * 2,
          glow1Radius * 2
        );
      }
      if (glow2Sprite) {
        const glow2X = width * 0.68 + Math.cos(t * 0.14 + 1.4) * (width * 0.09) - px * 14;
        const glow2Y = height * 0.56 + Math.sin(t * 0.17 + 0.6) * (height * 0.06) - py * 10;
        ctx.drawImage(
          glow2Sprite,
          glow2X - glow2Radius,
          glow2Y - glow2Radius,
          glow2Radius * 2,
          glow2Radius * 2
        );
      }

      // 3. Liquid Silk Light Filaments (reusing prebuilt gradients)
      const strandCount = 10;
      const segments = 26;
      const midIndex = Math.floor(strandCount * 0.5);

      for (let i = 0; i < strandCount; i++) {
        const ratio = i / (strandCount - 1);
        const centerFade = Math.sin(ratio * Math.PI);
        const baseY = height * (0.42 + (ratio - 0.5) * 0.26) + py * (6 + ratio * 10);
        const phase = i * 0.28;
        const amp1 = height * (0.045 + centerFade * 0.035);
        const amp2 = height * 0.018;

        ctx.beginPath();
        for (let s = 0; s <= segments; s++) {
          const u = s / segments;
          const x = -24 + u * (width + 48);
          const wave =
            Math.sin(u * Math.PI * 2.1 + t * 0.32 + phase) * amp1 +
            Math.cos(u * Math.PI * 3.4 - t * 0.22 + phase * 1.4) * amp2;
          const y = baseY + wave;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        if (i === midIndex && veilGrad) {
          ctx.save();
          ctx.lineTo(width + 24, height);
          ctx.lineTo(-24, height);
          ctx.closePath();
          ctx.globalAlpha = 1;
          ctx.fillStyle = veilGrad;
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          for (let s = 0; s <= segments; s++) {
            const u = s / segments;
            const x = -24 + u * (width + 48);
            const wave =
              Math.sin(u * Math.PI * 2.1 + t * 0.32 + phase) * amp1 +
              Math.cos(u * Math.PI * 3.4 - t * 0.22 + phase * 1.4) * amp2;
            const y = baseY + wave;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }

        if (strandStrokeGrad) {
          ctx.globalAlpha = 0.055 + centerFade * 0.16;
          ctx.strokeStyle = strandStrokeGrad;
          ctx.lineWidth = i % 4 === 0 ? 1.35 : 0.85;
          ctx.stroke();
        }
      }

      // 4. Slow drifting pinpoint starlight dust
      ctx.globalAlpha = 1;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        if (!isReducedMotion) {
          m.x += m.vx;
          m.y += m.vy;
          if (m.y < -0.02) m.y = 1.02;
          if (m.x < -0.02) m.x = 1.02;
          if (m.x > 1.02) m.x = -0.02;
        }

        const mx = m.x * width + px * (10 + m.size * 8);
        const my = m.y * height + py * (8 + m.size * 6);
        const twinkle = 0.55 + 0.45 * Math.sin(timeMs * m.twinkleSpeed + m.twinkleOffset);
        const alpha = m.alphaBase * twinkle;

        let rgb = '250, 248, 255';
        if (m.tint === 'violet') rgb = '196, 181, 253';
        else if (m.tint === 'cyan') rgb = '125, 211, 252';

        ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(mx, my, m.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Stamp cached vignette & anti-band dither overlay
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (vignetteOverlayCanvas) {
        ctx.drawImage(vignetteOverlayCanvas, 0, 0, width, height);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointerRef.current.tx = (e.clientX / Math.max(1, width) - 0.5) * 2;
      pointerRef.current.ty = (e.clientY / Math.max(1, height) - 0.5) * 2;
    };

    resize();

    const startTime = performance.now();
    const loop = (now: number) => {
      if (typeof document !== 'undefined' && document.hidden) {
        rafId = null;
        return;
      }
      if (now - lastDrawNow >= 32) {
        lastDrawNow = now;
        drawFrame(now - startTime);
      }
      if (!isReducedMotion) {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    if (isReducedMotion) {
      drawFrame(1800);
    } else if (typeof document === 'undefined' || !document.hidden) {
      rafId = window.requestAnimationFrame(loop);
    }

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
      } else if (!isReducedMotion && rafId === null) {
        lastDrawNow = 0;
        rafId = window.requestAnimationFrame(loop);
      }
    };

    const handleMotionChange = (e: MediaQueryListEvent) => {
      isReducedMotion = e.matches;
      if (isReducedMotion && rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
        drawFrame(1800);
      } else if (!isReducedMotion && rafId === null && !document.hidden) {
        lastDrawNow = 0;
        rafId = window.requestAnimationFrame(loop);
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    reducedMotionQuery?.addEventListener('change', handleMotionChange);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reducedMotionQuery?.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none select-none gpu-layer"
    />
  );
};
