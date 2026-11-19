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
      vx: (Math.random() - 0.5) * 0.000018,
      vy: -(0.000016 + Math.random() * 0.000028),
      size: 0.55 + Math.random() * 0.95,
      alphaBase: 0.16 + Math.random() * 0.34,
      twinkleOffset: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.0008 + Math.random() * 0.0014,
      tint: tints[i % tints.length],
    });
  }
  return motes;
}

/**
 * Subtle 96x96 monochrome anti-band film grain tile so ultra-dark OLED fades
 * stay completely smooth without gradient stepping.
 */
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
    data[i + 3] = 6; // Ultra-subtle ~2.3% anti-band dither
  }
  tctx.putImageData(img, 0, 0);
  return ctx.createPattern(tile, 'repeat');
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
    const motes = createDustMotes(54);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawFrame = (timeMs: number) => {
      pointerRef.current.x += (pointerRef.current.tx - pointerRef.current.x) * 0.035;
      pointerRef.current.y += (pointerRef.current.ty - pointerRef.current.y) * 0.035;
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;

      const t = timeMs * 0.001;
      const maxDim = Math.max(width, height);

      // 1. Dominant Pure OLED Black (#000000) base
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // 2. Very restrained nocturnal deep-violet breath (keeps >85% deep black)
      ctx.globalCompositeOperation = 'lighter';

      const glow1X = width * 0.34 + Math.sin(t * 0.16) * (width * 0.08) + px * 16;
      const glow1Y = height * 0.44 + Math.cos(t * 0.13) * (height * 0.05) + py * 12;
      const deepViolet = ctx.createRadialGradient(
        glow1X,
        glow1Y,
        0,
        glow1X,
        glow1Y,
        maxDim * 0.48
      );
      deepViolet.addColorStop(0, 'rgba(124, 58, 237, 0.12)');
      deepViolet.addColorStop(0.45, 'rgba(76, 29, 149, 0.045)');
      deepViolet.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = deepViolet;
      ctx.fillRect(0, 0, width, height);

      const glow2X = width * 0.72 + Math.cos(t * 0.14 + 1.4) * (width * 0.09) - px * 14;
      const glow2Y = height * 0.58 + Math.sin(t * 0.17 + 0.6) * (height * 0.06) - py * 10;
      const deepCyan = ctx.createRadialGradient(
        glow2X,
        glow2Y,
        0,
        glow2X,
        glow2Y,
        maxDim * 0.42
      );
      deepCyan.addColorStop(0, 'rgba(56, 189, 248, 0.065)');
      deepCyan.addColorStop(0.45, 'rgba(79, 70, 229, 0.03)');
      deepCyan.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = deepCyan;
      ctx.fillRect(0, 0, width, height);

      // 3. Liquid Silk Light Filaments (Ultra Full-HD crisp hairlines gliding calmly across OLED black)
      const strandCount = 16;
      const segments = 44;

      // Translucent silk veil fill underneath the wave crests
      const veilGrad = ctx.createLinearGradient(0, height * 0.25, width, height * 0.85);
      veilGrad.addColorStop(0, 'rgba(145, 70, 255, 0)');
      veilGrad.addColorStop(0.38, 'rgba(124, 58, 237, 0.045)');
      veilGrad.addColorStop(0.68, 'rgba(79, 70, 229, 0.035)');
      veilGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      for (let i = 0; i < strandCount; i++) {
        const ratio = i / (strandCount - 1);
        const centerFade = Math.sin(ratio * Math.PI); // strongest in center of bundle, soft at edges
        const baseY = height * (0.42 + (ratio - 0.5) * 0.26) + py * (6 + ratio * 10);
        const phase = i * 0.22;
        const amp1 = height * (0.045 + Math.sin(ratio * Math.PI) * 0.035);
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

        if (i === Math.floor(strandCount * 0.5)) {
          // Soft obsidian silk body fade beneath middle wave
          ctx.save();
          ctx.lineTo(width + 24, height);
          ctx.lineTo(-24, height);
          ctx.closePath();
          ctx.fillStyle = veilGrad;
          ctx.fill();
          ctx.restore();

          // Re-trace the single line stroke cleanly
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

        const strokeGrad = ctx.createLinearGradient(0, baseY, width, baseY);
        const alpha = (0.045 + centerFade * 0.145).toFixed(3);
        const cyanAlpha = (0.025 + centerFade * 0.095).toFixed(3);
        strokeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        strokeGrad.addColorStop(0.24, `rgba(145, 70, 255, ${alpha})`);
        strokeGrad.addColorStop(0.54, `rgba(196, 181, 253, ${alpha})`);
        strokeGrad.addColorStop(0.8, `rgba(76, 201, 240, ${cyanAlpha})`);
        strokeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = i % 5 === 0 ? 1.35 : 0.85;
        ctx.stroke();
      }

      // 4. Slow drifting pinpoint starlight dust in pure black space
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

      // 5. Crisp OLED black edge frame & anti-band dither
      ctx.globalCompositeOperation = 'source-over';
      const vignette = ctx.createRadialGradient(
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
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      if (antiBandPattern) {
        ctx.fillStyle = antiBandPattern;
        ctx.fillRect(0, 0, width, height);
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
      drawFrame(now - startTime);
      if (!isReducedMotion) {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    if (isReducedMotion) {
      drawFrame(1800);
    } else {
      rafId = window.requestAnimationFrame(loop);
    }

    const handleMotionChange = (e: MediaQueryListEvent) => {
      isReducedMotion = e.matches;
      if (isReducedMotion && rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
        drawFrame(1800);
      } else if (!isReducedMotion && rafId === null) {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    reducedMotionQuery?.addEventListener('change', handleMotionChange);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
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
