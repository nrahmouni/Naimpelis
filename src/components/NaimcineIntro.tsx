import React, { useEffect, useId, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { playRiffanIntroSound, triggerHaptic } from '../utils/haptics';
import { RiffanBrandLogo } from './NaimBrandLogo';
import { pickLang } from '../utils/i18n';
import type { AppLanguage } from '../types';

interface NaimcineIntroProps {
  onComplete: () => void;
  withSound?: boolean;
  subtitle?: string;
  lang?: AppLanguage;
}

interface OpticalMote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  hue: 'violet' | 'indigo' | 'platinum';
  phase: number;
}

const INTRO_DURATION_MS = 2350;

/**
 * RiffanTV (RTV) "Optic Sweep" Studio Intro (2.35s, 60fps Canvas + GPU CSS):
 * - Act 1 (0.0s–0.45s): Three architectural light shafts (R · T · V) ignite across Obsidian space.
 * - Act 2 (0.45s–0.95s): Prismatic violet/indigo horizon streak, acoustic ring & 3D RTV monolith lockup.
 * - Act 3 (0.95s–2.35s): Specular 14° glass glint sweep across the RTV monolith & RiffanTV wordmark reveal.
 */
export const NaimcineIntro: React.FC<NaimcineIntroProps> = ({
  onComplete,
  withSound = false,
  subtitle,
  lang = 'es',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const rawId = useId();
  const grainFilterId = `rtv-film-grain-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [soundActive, setSoundActive] = useState<boolean>(false);

  useEffect(() => {
    if (withSound) {
      const ok = playRiffanIntroSound();
      setSoundActive(ok);
      triggerHaptic('success');
    }

    const timer = setTimeout(() => {
      onCompleteRef.current();
    }, INTRO_DURATION_MS);

    return () => clearTimeout(timer);
  }, [withSound]);

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

    const moteCount = prefersReduced ? 12 : 56;
    const motes: OpticalMote[] = Array.from({ length: moteCount }, (_, i) => ({
      x: (Math.random() - 0.5) * 1.5,
      y: (Math.random() - 0.5) * 1.3,
      z: 0.25 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.00026,
      vy: -0.00018 - Math.random() * 0.00032,
      size: 0.8 + Math.random() * 2.2,
      hue: i % 5 === 0 ? 'indigo' : i % 3 === 0 ? 'violet' : 'platinum',
      phase: Math.random() * Math.PI * 2,
    }));

    const startTime = performance.now();
    let rafId = 0;

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / INTRO_DURATION_MS);

      const cx = width * 0.5;
      const cy = height * 0.455;
      const minDim = Math.min(width, height);

      // 1. Cinema Obsidian Optical Void (#05060A)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05060A';
      ctx.fillRect(0, 0, width, height);

      const ignition = Math.min(1, elapsed / 320);
      const converge = elapsed < 140 ? 0 : Math.min(1, (elapsed - 140) / 420);
      const impact = elapsed < 440 ? 0 : Math.min(1, (elapsed - 440) / 260);
      const warpOut = p < 0.8 ? 0 : Math.pow((p - 0.8) / 0.2, 2.0);
      const masterFade = p > 0.88 ? Math.max(0, 1 - (p - 0.88) / 0.12) : 1;

      ctx.globalCompositeOperation = 'lighter';

      // 2. Central Optical Prism Spotlight
      const spotAlpha = (0.08 + 0.16 * ignition) * masterFade * (1 - warpOut * 0.35);
      if (spotAlpha > 0.005) {
        const spot = ctx.createRadialGradient(cx, cy - minDim * 0.06, 0, cx, cy, minDim * 0.65);
        spot.addColorStop(0, `rgba(192, 132, 252, ${spotAlpha * 1.15})`);
        spot.addColorStop(0.32, `rgba(139, 92, 246, ${spotAlpha * 0.78})`);
        spot.addColorStop(0.68, `rgba(99, 102, 241, ${spotAlpha * 0.28})`);
        spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = spot;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Three Architectural Light Shafts (R · T · V Convergence) with 14° optical tilt
      const spread = (1 - Math.pow(converge, 0.72)) * minDim * 0.28 + warpOut * minDim * 0.36;
      const shafts = [
        { offset: -spread, w: 3.4, h: 0.76, color: '244, 245, 248', alpha: 0.42 },
        { offset: 0, w: 5.2, h: 0.92, color: '139, 92, 246', alpha: 0.68 },
        { offset: spread, w: 3.4, h: 0.76, color: '99, 102, 241', alpha: 0.46 },
      ];

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.244); // ~14° signature RiffanTV optical cut angle
      shafts.forEach((s, idx) => {
        const sway = Math.sin(elapsed * 0.0028 + idx * 1.2) * 3;
        const sx = s.offset + sway;
        const sh = height * s.h * (0.35 + 0.65 * ignition);
        const sw = s.w * (1 + warpOut * 4.5);
        const sGrad = ctx.createLinearGradient(sx, -sh * 0.5, sx, sh * 0.5);
        sGrad.addColorStop(0, `rgba(${s.color}, 0)`);
        sGrad.addColorStop(0.5, `rgba(${s.color}, ${s.alpha * ignition * (1 - impact * 0.35) * masterFade})`);
        sGrad.addColorStop(1, `rgba(${s.color}, 0)`);
        ctx.fillStyle = sGrad;
        ctx.fillRect(sx - sw * 0.5, -sh * 0.5, sw, sh);
      });
      ctx.restore();

      // 4. Dual Acoustic Shockwave Pulse Rings (+0.52s)
      if (elapsed > 500 && elapsed < 1850) {
        const sw = (elapsed - 500) / 1350;
        const easeSw = 1 - Math.pow(1 - sw, 3);
        const ringR = minDim * (0.09 + easeSw * 0.64);
        const ringAlpha = (1 - sw) * 0.42 * masterFade;
        ctx.strokeStyle = `rgba(167, 139, 250, ${ringAlpha})`;
        ctx.lineWidth = Math.max(1, (1 - sw) * 3.0);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 5. Horizontal Anamorphic Broadcast Streak
      const flarePeak =
        elapsed < 540
          ? elapsed / 540
          : Math.max(0.22, 1 - (elapsed - 540) / 1200) + warpOut * 0.5;
      const flareAlpha = Math.min(1, flarePeak) * masterFade;
      if (flareAlpha > 0.01) {
        const streakW = Math.min(width * 0.9, 920) * (0.35 + 0.65 * ignition);
        const streakGrad = ctx.createLinearGradient(cx - streakW * 0.5, cy, cx + streakW * 0.5, cy);
        streakGrad.addColorStop(0, 'rgba(99, 102, 241, 0)');
        streakGrad.addColorStop(0.25, `rgba(139, 92, 246, ${0.22 * flareAlpha})`);
        streakGrad.addColorStop(0.46, `rgba(192, 132, 252, ${0.58 * flareAlpha})`);
        streakGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.88 * flareAlpha})`);
        streakGrad.addColorStop(0.54, `rgba(192, 132, 252, ${0.58 * flareAlpha})`);
        streakGrad.addColorStop(0.75, `rgba(99, 102, 241, ${0.22 * flareAlpha})`);
        streakGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.fillStyle = streakGrad;
        ctx.fillRect(cx - streakW * 0.5, cy - 1.2, streakW, 2.4);
      }

      // 6. 3D Optical Dust & Ambient Bokeh
      motes.forEach((m) => {
        m.x += m.vx;
        m.y += m.vy;
        if (warpOut > 0) {
          m.z = Math.max(0.08, m.z - warpOut * 0.04);
        }
        if (m.y < -0.75) m.y = 0.75;

        const scale = 1 / m.z;
        const sx = cx + m.x * minDim * scale;
        const sy = cy + m.y * minDim * scale;
        if (sx < -30 || sx > width + 30 || sy < -30 || sy > height + 30) return;

        const dist = Math.hypot((sx - cx) / (width * 0.5), (sy - cy) / (height * 0.5));
        const falloff = Math.max(0.14, 1 - dist * 0.85);
        const twinkle = 0.6 + 0.4 * Math.sin(elapsed * 0.0045 + m.phase);
        const radius = Math.min(13, m.size * scale);
        const isBokeh = radius > 3.2;
        const baseAlpha = ignition * falloff * twinkle * (isBokeh ? 0.16 : 0.52) * masterFade;

        const rgb =
          m.hue === 'violet'
            ? '167, 139, 250'
            : m.hue === 'indigo'
            ? '99, 102, 241'
            : '244, 245, 248';

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

      // 7. Theater Optical Vignette
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
      vig.addColorStop(1, 'rgba(5, 6, 10, 0.84)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);

      if (!prefersReduced && elapsed < INTRO_DURATION_MS + 100) {
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
    const ok = playRiffanIntroSound();
    setSoundActive(ok);
    triggerHaptic('medium');
  };

  return (
    <div
      onClick={handleManualSoundTrigger}
      className="fixed inset-0 z-[100] bg-[#05060A] flex flex-col items-center justify-center overflow-hidden select-none animate-rtv-intro-fade"
      role="dialog"
      aria-label="RiffanTV Studio Intro"
    >
      {/* Real-Time 60fps Optical Beams & Anamorphic Prism Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* 35mm Film Grain Physical Texture Layer */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.045] mix-blend-overlay"
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

      {/* 2.39:1 CinemaScope Matte Framing Bars */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 inset-x-0 h-[6.5vh] sm:h-[8.5vh] bg-black/95 border-b border-white/[0.06] z-10 animate-rtv-scope-top"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 inset-x-0 h-[6.5vh] sm:h-[8.5vh] bg-black/95 border-t border-white/[0.06] z-10 animate-rtv-scope-bottom"
      />

      {/* 3D Architectural RTV Monolith & Wordmark Lockup */}
      <div
        className="relative z-20 flex flex-col items-center px-6"
        style={{ perspective: '1200px' }}
      >
        <div className="relative animate-rtv-monolith">
          <div
            aria-hidden="true"
            className="absolute -inset-7 rounded-[44px] bg-radial from-[#8B5CF6]/50 via-[#6366F1]/18 to-transparent blur-2xl pointer-events-none"
          />

          <div className="relative rounded-[36px] shadow-[0_30px_90px_rgba(0,0,0,0.95),0_0_80px_rgba(139,92,246,0.42)] overflow-hidden">
            <RiffanBrandLogo size={160} animated />

            {/* Specular 14° Glass Glint Sweep */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-2/3 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-rtv-glint"
            />
          </div>
        </div>

        <div className="mt-7 sm:mt-8 text-center animate-rtv-wordmark">
          <div className="font-display font-extrabold text-4xl sm:text-5xl md:text-6xl tracking-[0.14em] pl-[0.14em] leading-none flex items-baseline justify-center">
            <span className="text-[#F4F5F8]">Riffan</span>
            <span className="text-[#A78BFA] ml-1.5">TV</span>
          </div>

          <div
            aria-hidden="true"
            className="mx-auto mt-3.5 h-[1px] w-44 sm:w-64 bg-gradient-to-r from-transparent via-[#8B5CF6]/75 to-transparent animate-rtv-divider"
          />

          <p className="mt-3 text-[11px] sm:text-xs uppercase tracking-[0.26em] text-zinc-300/90 font-medium">
            {subtitle ||
              pickLang(lang, {
                es: 'RTV Broadcast · Cine · Directos · Sala Sincronizada',
                ca: 'RTV Broadcast · Cinema · Directes · Sala Sincronitzada',
                en: 'RTV Broadcast · Cinema · Live TV · Real-Time Sync',
              })}
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
            className="min-h-[38px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[11px] font-medium text-zinc-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>
              {pickLang(lang, {
                es: 'Sonido RTV',
                ca: 'So RTV',
                en: 'RTV Sound',
              })}
            </span>
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
          className="min-h-[38px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/12 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {pickLang(lang, {
            es: 'Saltar intro',
            ca: 'Saltar intro',
            en: 'Skip intro',
          })}
        </button>
      </div>
    </div>
  );
};

export const RiffanIntro = NaimcineIntro;
