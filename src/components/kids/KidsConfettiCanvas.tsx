import React, { useEffect, useRef } from 'react';

interface KidsConfettiCanvasProps {
  active: boolean;
  lowStimulation?: boolean;
  onComplete?: () => void;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vr: number;
  shape: 'rect' | 'circle' | 'star';
}

const CONFETTI_COLORS = [
  '#FBBF24',
  '#FB7185',
  '#38BDF8',
  '#34D399',
  '#A78BFA',
  '#FB923C',
];

/**
 * Pure Canvas 2D celebratory confetti burst for Riffan Kids.
 * Works offline inside Android/PWA without CDN dependencies and respects Calm Mode / reduced motion.
 */
export const KidsConfettiCanvas: React.FC<KidsConfettiCanvasProps> = ({
  active,
  lowStimulation = false,
  onComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active || lowStimulation || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onComplete?.();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: ConfettiParticle[] = Array.from({ length: 85 }).map((_, i) => {
      const originX = width * (0.25 + Math.random() * 0.5);
      const originY = height * 0.38;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = 4 + Math.random() * 9;
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.22,
        shape: i % 3 === 0 ? 'circle' : i % 5 === 0 ? 'star' : 'rect',
      };
    });

    let rafId = 0;
    const startedAt = performance.now();
    const durationMs = 2400;

    const frame = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed >= durationMs) {
        ctx.clearRect(0, 0, width, height);
        onComplete?.();
        return;
      }

      const alpha = Math.max(0, 1 - elapsed / durationMs);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, alpha * 1.4);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.24; // gentle gravity
        p.vx *= 0.992;
        p.rotation += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'star') {
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const outer = (k * 2 * Math.PI) / 5 - Math.PI / 2;
            const inner = outer + Math.PI / 5;
            if (k === 0) ctx.moveTo(Math.cos(outer) * p.size * 0.6, Math.sin(outer) * p.size * 0.6);
            else ctx.lineTo(Math.cos(outer) * p.size * 0.6, Math.sin(outer) * p.size * 0.6);
            ctx.lineTo(Math.cos(inner) * p.size * 0.28, Math.sin(inner) * p.size * 0.28);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65);
        }
        ctx.restore();
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [active, lowStimulation, onComplete]);

  if (!active || lowStimulation) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[310] w-full h-full"
    />
  );
};
