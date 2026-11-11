import React, { useEffect, useId, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { playNaimcineIntroSound, triggerHaptic } from '../utils/haptics';
import { NaimBrandLogo } from './NaimBrandLogo';

interface NaimcineIntroProps {
  onComplete: () => void;
  withSound?: boolean;
  subtitle?: string;
}

interface CinemaMote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  hue: 'crimson' | 'gold' | 'platinum';
  phase: number;
}

const INTRO_DURATION_MS = 3750;

/**
 * Hyper-Realistic IMAX / Dolby Cinema Theatrical Studio Intro.
 * Features:
 * - Real-time 60fps HTML5 Optical Canvas: volumetric projector god-rays, Panavision
 *   anamorphic lens flare, spectral ruby/gold/platinum prism light ribbons, expanding
 *   acoustic shockwave ring, and 3D depth-of-field floating dust bokeh particles.
 * - Real 35mm Celluloid Film Grain procedural texture overlay.
 * - 3D perspective CNC Titanium & Dichroic Ruby NaimBrandLogo monolith reveal.
 * - Extruded brushed-platinum & crimson-chrome cinema wordmark with live specular sweep.
 */
export const NaimcineIntro: React.FC<NaimcineIntroProps> = ({
  onComplete,
  withSound = false,
  subtitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const rawId = useId();
  const grainFilterId = `nc-film-grain-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [soundActive, setSoundActive] = useState<boolean>(false);

  // Trigger audio + finish timer
  useEffect(() => {
    if (withSound) {
      const ok = playNaimcineIntroSound();
      setSoundActive(ok);
      triggerHaptic('success');
    }

    const timer = setTimeout(() => {
      onCompleteRef.current();
    }, INTRO_DURATION_MS);

    return () => clearTimeout(timer);
  }, [withSound]);

  // Real-time 60fps Cinema Optics Canvas Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize 72 3D cinema dust motes floating in projector beam
    const moteCount = prefersReduced ? 18 : 72;
    const motes: CinemaMote[] = Array.from({ length: moteCount }, (_, i) => ({
      x: (Math.random() - 0.5) * 1.6,
      y: (Math.random() - 0.5) * 1.4,
      z: 0.18 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.00028,
      vy: -0.00018 - Math.random() * 0.00034,
      size: 0.9 + Math.random() * 2.6,
      hue: i % 5 === 0 ? 'crimson' : i % 4 === 0 ? 'gold' : 'platinum',
      phase: Math.random() * Math.PI * 2,
    }));

    const startTime = performance.now();
    let rafId = 0;

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / INTRO_DURATION_MS); // 0 -> 1

      const cx = width * 0.5;
      const cy = height * 0.455;
      const minDim = Math.min(width, height);

      // 1. Deep Optical Theater Canvas (#020205)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#020205';
      ctx.fillRect(0, 0, width, height);

      // Phase envelopes
      const ignition = Math.min(1, elapsed / 450);
      const impact = elapsed < 440 ? 0 : Math.min(1, (elapsed - 440) / 260);
      const warpOut = p < 0.77 ? 0 : Math.pow((p - 0.77) / 0.23, 2.1);
      const masterFade = p > 0.91 ? Math.max(0, 1 - (p - 0.91) / 0.09) : 1;

      ctx.globalCompositeOperation = 'lighter';

      // 2. Overhead IMAX Volumetric Projector Cone (God-Rays)
      const beamAlpha = (0.06 + 0.11 * ignition) * masterFade * (1 - warpOut * 0.4);
      if (beamAlpha > 0.005) {
        const projGrad = ctx.createRadialGradient(
          cx,
          -height * 0.18,
          10,
          cx,
          cy,
          Math.max(width, height) * 0.95
        );
        projGrad.addColorStop(0, `rgba(255, 244, 246, ${beamAlpha * 1.45})`);
        projGrad.addColorStop(0.28, `rgba(225, 29, 72, ${beamAlpha * 0.85})`);
        projGrad.addColorStop(0.62, `rgba(30, 27, 46, ${beamAlpha * 0.35})`);
        projGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = projGrad;
        ctx.beginPath();
        ctx.moveTo(cx - width * 0.06, -20);
        ctx.lineTo(cx + width * 0.06, -20);
        ctx.lineTo(cx + width * 0.68, height + 20);
        ctx.lineTo(cx - width * 0.68, height + 20);
        ctx.closePath();
        ctx.fill();

        // Subtle Shimmering Projector Ray Shafts
        const rayCount = 5;
        for (let r = 0; r < rayCount; r++) {
          const offset = (r - (rayCount - 1) / 2) * 0.14;
          const sway = Math.sin(elapsed * 0.0012 + r * 1.4) * 0.022;
          const angle = offset + sway;
          const rayGrad = ctx.createLinearGradient(cx, -20, cx + Math.sin(angle) * height, height * 0.85);
          rayGrad.addColorStop(0, `rgba(255, 255, 255, ${beamAlpha * 0.42})`);
          rayGrad.addColorStop(0.45, `rgba(225, 29, 72, ${beamAlpha * 0.22})`);
          rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.save();
          ctx.translate(cx, -20);
          ctx.rotate(angle);
          ctx.fillStyle = rayGrad;
          ctx.fillRect(-width * 0.028, 0, width * 0.056, height * 1.15);
          ctx.restore();
        }
      }

      // 3. Netflix-Inspired Vertical Prismatic Spectrum Curtain ("Tudum" Light Filaments)
      if (impact > 0) {
        const prismScale = 1 + warpOut * 3.4;
        const prismAlpha = impact * (1 - warpOut * 0.42) * masterFade;

        // Ambient Center Netflix Scarlet Halo
        const haloR = minDim * (0.36 + 0.1 * Math.sin(elapsed * 0.0022)) * prismScale;
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
        halo.addColorStop(0, `rgba(255, 228, 230, ${0.24 * prismAlpha})`);
        halo.addColorStop(0.3, `rgba(229, 9, 20, ${0.34 * prismAlpha})`);
        halo.addColorStop(0.68, `rgba(136, 19, 55, ${0.11 * prismAlpha})`);
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, width, height);

        // Multi-Filament Vertical Prismatic Spectrum Bars
        const ribbons = [
          { xOff: -0.28, w: 1.6, h: 0.62, color: '185, 9, 11', a: 0.34 },
          { xOff: -0.22, w: 2.8, h: 0.78, color: '229, 9, 20', a: 0.48 },
          { xOff: -0.17, w: 1.5, h: 0.58, color: '245, 158, 11', a: 0.32 },
          { xOff: -0.125, w: 3.6, h: 0.88, color: '229, 9, 20', a: 0.56 },
          { xOff: -0.085, w: 1.8, h: 0.68, color: '56, 189, 248', a: 0.28 },
          { xOff: -0.045, w: 4.2, h: 0.94, color: '255, 36, 52', a: 0.62 },
          { xOff: 0.0, w: 5.4, h: 1.0, color: '229, 9, 20', a: 0.68 },
          { xOff: 0.045, w: 4.0, h: 0.92, color: '255, 36, 52', a: 0.58 },
          { xOff: 0.088, w: 1.8, h: 0.66, color: '251, 191, 36', a: 0.32 },
          { xOff: 0.13, w: 3.6, h: 0.86, color: '229, 9, 20', a: 0.54 },
          { xOff: 0.175, w: 1.6, h: 0.6, color: '226, 232, 240', a: 0.3 },
          { xOff: 0.225, w: 2.8, h: 0.76, color: '229, 9, 20', a: 0.46 },
          { xOff: 0.285, w: 1.6, h: 0.62, color: '185, 9, 11', a: 0.34 },
        ];

        ribbons.forEach((rb, idx) => {
          const drift = Math.sin(elapsed * 0.002 + idx * 0.9) * 5;
          const rx = cx + rb.xOff * minDim * prismScale + drift;
          const rh = height * rb.h * (0.38 + 0.62 * impact) * (1 + warpOut * 1.35);
          const rw = rb.w * (1 + warpOut * 8.5);
          const lGrad = ctx.createLinearGradient(rx, cy - rh * 0.5, rx, cy + rh * 0.5);
          lGrad.addColorStop(0, `rgba(${rb.color}, 0)`);
          lGrad.addColorStop(0.5, `rgba(${rb.color}, ${rb.a * prismAlpha})`);
          lGrad.addColorStop(1, `rgba(${rb.color}, 0)`);
          ctx.fillStyle = lGrad;
          ctx.fillRect(rx - rw * 0.5, cy - rh * 0.5, rw, rh);
        });
      }

      // 4. Acoustic Sub-Bass Shockwave Ring at +0.46s ("DUM")
      if (elapsed > 450 && elapsed < 1950) {
        const sw = (elapsed - 450) / 1500;
        const easeSw = 1 - Math.pow(1 - sw, 3);
        const ringR = minDim * (0.08 + easeSw * 0.68);
        const ringAlpha = (1 - sw) * 0.36 * masterFade;
        ctx.strokeStyle = `rgba(251, 113, 133, ${ringAlpha})`;
        ctx.lineWidth = Math.max(1, (1 - sw) * 3.2);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 5. Authentic Panavision Horizontal Anamorphic Lens Flare
      const flarePeak =
        elapsed < 560
          ? elapsed / 560
          : Math.max(0.24, 1 - (elapsed - 560) / 1600) + warpOut * 0.65;
      const flareAlpha = Math.min(1, flarePeak) * masterFade;
      if (flareAlpha > 0.01) {
        const streakW = Math.min(width * 0.92, 960) * (0.35 + 0.65 * ignition) * (1 + warpOut * 0.5);
        // Primary Horizontal Optical Streak (Ice-Cobalt + Crimson Core)
        const streakGrad = ctx.createLinearGradient(cx - streakW * 0.5, cy, cx + streakW * 0.5, cy);
        streakGrad.addColorStop(0, 'rgba(148, 163, 184, 0)');
        streakGrad.addColorStop(0.22, `rgba(186, 230, 253, ${0.16 * flareAlpha})`);
        streakGrad.addColorStop(0.45, `rgba(251, 113, 133, ${0.48 * flareAlpha})`);
        streakGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.82 * flareAlpha})`);
        streakGrad.addColorStop(0.55, `rgba(251, 113, 133, ${0.48 * flareAlpha})`);
        streakGrad.addColorStop(0.78, `rgba(186, 230, 253, ${0.16 * flareAlpha})`);
        streakGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');

        ctx.fillStyle = streakGrad;
        ctx.fillRect(cx - streakW * 0.5, cy - 1.3, streakW, 2.6);

        // Soft Wide Anamorphic Bloom Band
        const softGrad = ctx.createLinearGradient(cx - streakW * 0.38, cy, cx + streakW * 0.38, cy);
        softGrad.addColorStop(0, 'rgba(225, 29, 72, 0)');
        softGrad.addColorStop(0.5, `rgba(225, 29, 72, ${0.2 * flareAlpha})`);
        softGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
        ctx.fillStyle = softGrad;
        ctx.fillRect(cx - streakW * 0.38, cy - 14, streakW * 0.76, 28);
      }

      // 6. 3D Depth-of-Field Floating Cinema Dust Motes & Bokeh
      motes.forEach((m) => {
        m.x += m.vx;
        m.y += m.vy;
        if (warpOut > 0) {
          m.z = Math.max(0.06, m.z - warpOut * 0.045);
        }
        if (m.y < -0.75) m.y = 0.75;

        const scale = 1 / m.z;
        const sx = cx + m.x * minDim * scale;
        const sy = cy + m.y * minDim * scale;
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return;

        // Illuminate motes strongest near projector cone center
        const distFromCenter = Math.hypot((sx - cx) / (width * 0.5), (sy - cy) / (height * 0.5));
        const coneFalloff = Math.max(0.12, 1 - distFromCenter * 0.85);
        const twinkle = 0.6 + 0.4 * Math.sin(elapsed * 0.004 + m.phase);
        const radius = Math.min(16, m.size * scale);
        const isBokeh = radius > 3.6;

        const baseAlpha =
          ignition *
          coneFalloff *
          twinkle *
          (isBokeh ? 0.16 : 0.55) *
          masterFade;

        const rgb =
          m.hue === 'crimson'
            ? '251, 113, 133'
            : m.hue === 'gold'
            ? '253, 224, 71'
            : '241, 245, 249';

        if (isBokeh) {
          const bGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
          bGrad.addColorStop(0, `rgba(${rgb}, ${baseAlpha * 0.55})`);
          bGrad.addColorStop(0.75, `rgba(${rgb}, ${baseAlpha})`);
          bGrad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${rgb}, ${baseAlpha})`;
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 7. Deep Theater Vignette Around Edges
      ctx.globalCompositeOperation = 'source-over';
      const vig = ctx.createRadialGradient(
        cx,
        cy,
        minDim * 0.25,
        cx,
        cy,
        Math.max(width, height) * 0.78
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(2, 2, 5, 0.82)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);

      if (!prefersReduced && elapsed < INTRO_DURATION_MS + 120) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleManualSoundTrigger = () => {
    const ok = playNaimcineIntroSound();
    setSoundActive(ok);
    triggerHaptic('medium');
  };

  return (
    <div
      onClick={handleManualSoundTrigger}
      className="fixed inset-0 z-[100] bg-[#020205] flex flex-col items-center justify-center overflow-hidden select-none animate-naim-intro-fade"
      role="dialog"
      aria-label="NAIM CINE Studio Intro"
    >
      {/* Real-Time 60fps Cinema Projector, Prism Caustics, Anamorphic Flare & Dust Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Genuine 35mm Celluloid Film Grain Physical Texture Layer */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.055] mix-blend-overlay animate-film-grain"
      >
        <filter id={grainFilterId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.78"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grainFilterId})`} />
      </svg>

      {/* 2.39:1 CinemaScope Theatrical Matte Bars */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 inset-x-0 h-[7vh] sm:h-[9vh] bg-black/95 border-b border-white/[0.06] z-10 animate-cinemascope-top"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 inset-x-0 h-[7vh] sm:h-[9vh] bg-black/95 border-t border-white/[0.06] z-10 animate-cinemascope-bottom"
      />

      {/* 3D Perspective Hardware Monolith & Extruded Metallic Wordmark */}
      <div
        className="relative z-20 flex flex-col items-center px-6"
        style={{ perspective: '1200px' }}
      >
        {/* 3D Folded Netflix-Scarlet "N C" Ribbon Emblem */}
        <div className="relative animate-naim-monolith-3d">
          {/* Sub-Surface Volumetric Scarlet Backlight */}
          <div
            aria-hidden="true"
            className="absolute -inset-7 rounded-[46px] bg-radial from-[#E50914]/50 via-[#E50914]/14 to-transparent blur-2xl pointer-events-none"
          />

          <div className="relative rounded-[36px] shadow-[0_30px_90px_rgba(0,0,0,0.95),0_0_85px_rgba(229,9,20,0.42)] overflow-hidden">
            <NaimBrandLogo size={168} animated />

            {/* Specular Glass Glint Sweeping Across Monolith */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent -translate-x-full animate-monolith-glint"
            />
          </div>
        </div>

        {/* Extruded Brushed-Platinum & Ruby-Chrome Cinema Wordmark */}
        <div className="mt-7 sm:mt-8 text-center animate-naim-wordmark-3d">
          <div className="font-display font-extrabold text-3xl sm:text-5xl md:text-6xl tracking-[0.24em] pl-[0.24em] leading-none flex items-center justify-center gap-3 sm:gap-4">
            <span className="naim-metallic-platinum">NAIM</span>
            <span className="naim-metallic-ruby">CINE</span>
          </div>

          {/* Hairline Optical Divider */}
          <div
            aria-hidden="true"
            className="mx-auto mt-3.5 h-[1px] w-44 sm:w-64 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          />

          <p className="mt-3 text-[10px] sm:text-xs uppercase tracking-[0.28em] text-zinc-300/90 font-medium">
            {subtitle || 'Private Cinema · 1080p HDR · Real-Time Sync'}
          </p>
        </div>
      </div>

      {/* Bottom Controls Inside CinemaScope Bar */}
      <div className="absolute bottom-3 sm:bottom-4 inset-x-5 sm:inset-x-8 z-30 flex items-center justify-between gap-3">
        {!soundActive ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleManualSoundTrigger();
            }}
            className="min-h-[38px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[11px] font-medium text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#E11D48]" />
            <span>Sonido Cinema</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          className="min-h-[38px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/12 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
        >
          Saltar intro
        </button>
      </div>
    </div>
  );
};
