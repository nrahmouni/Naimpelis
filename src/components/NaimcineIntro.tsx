import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Volume2 } from 'lucide-react';
import { playRiffanIntroSound, triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import type { AppLanguage } from '../types';

interface NaimcineIntroProps {
  onComplete: () => void;
  withSound?: boolean;
  subtitle?: string;
  lang?: AppLanguage;
}

const INTRO_DURATION_MS = 2450;
const WORD_LEFT = ['R', 'i', 'f', 'f', 'a', 'n'];
const WORD_RIGHT = ['T', 'V'];

const letterVariants = {
  hidden: {
    opacity: 0,
    y: 18,
    filter: 'blur(8px)',
    scale: 1.15,
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 260,
      damping: 22,
      mass: 0.75,
    },
  },
};

export const NaimcineIntro: React.FC<NaimcineIntroProps> = ({
  onComplete,
  withSound = false,
  subtitle,
  lang = 'es',
}) => {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const platId = `rtv-plat-${rawId}`;
  const bladeId = `rtv-blade-${rawId}`;
  const shimmerId = `rtv-shimmer-${rawId}`;
  const clipRId = `rtv-clip-r-${rawId}`;

  const [soundActive, setSoundActive] = useState(false);

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, idx) => ({
        id: idx,
        left: `${8 + ((idx * 19) % 84)}%`,
        top: `${10 + ((idx * 23) % 80)}%`,
        size: idx % 3 === 0 ? 3 : 2,
        delay: (idx % 6) * 0.14,
        dx: idx % 2 === 0 ? 18 : -18,
        dy: -24 - (idx % 4) * 12,
        hue: idx % 3 === 0 ? '#A78BFA' : idx % 3 === 1 ? '#38BDF8' : '#F4F5F8',
      })),
    []
  );

  useEffect(() => {
    if (withSound) {
      const ok = playRiffanIntroSound();
      setSoundActive(ok);
      triggerHaptic('success');
    }

    const timer = window.setTimeout(() => {
      onCompleteRef.current();
    }, INTRO_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [withSound]);

  const handleManualSoundTrigger = () => {
    const ok = playRiffanIntroSound();
    setSoundActive(ok);
    triggerHaptic('medium');
  };

  const wordmarkContainerVariants = {
    hidden: { letterSpacing: '0.28em' },
    visible: {
      letterSpacing: '0.07em',
      transition: {
        letterSpacing: { delay: 0.42, duration: 0.72, ease: [0.22, 1, 0.36, 1] as const },
        staggerChildren: 0.045,
        delayChildren: 0.44,
      },
    },
  };

  const resolvedSubtitle =
    subtitle ||
    pickLang(lang, {
      es: 'ENTRANDO A SALA...',
      ca: 'ENTRANT A LA SALA...',
      en: 'ENTERING ROOM...',
    });

  const content = (
    <div
      onClick={handleManualSoundTrigger}
      className="fixed inset-0 w-screen h-[100dvh] z-[9999] bg-[#050508] opacity-100 flex flex-col items-center justify-center overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="RiffanTV Studio Intro"
    >
      {/* Full-viewport atmospheric radial backdrop (opaque #050508 edge-to-edge from frame 0) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full"
        style={{
          background:
            'radial-gradient(ellipse 85% 65% at 50% 45%, rgba(145, 70, 255, 0.22) 0%, rgba(56, 189, 248, 0.08) 38%, rgba(5, 5, 8, 1) 76%)',
        }}
      />

      {/* Ambient GPU-composited floating motes across 100% viewport */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 w-full h-full overflow-hidden">
        {particles.map((pt) => (
          <motion.span
            key={pt.id}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
            animate={{
              opacity: [0, 0.75, 0],
              x: [0, pt.dx],
              y: [0, pt.dy],
              scale: [0.6, 1.2, 0.7],
            }}
            transition={{
              duration: 1.9,
              delay: pt.delay,
              ease: 'easeOut',
            }}
            style={{
              left: pt.left,
              top: pt.top,
              width: pt.size,
              height: pt.size,
              backgroundColor: pt.hue,
              boxShadow: `0 0 10px ${pt.hue}`,
            }}
            className="absolute rounded-full will-change-transform"
          />
        ))}
      </div>

      {/* Central Isotype + Wordmark Stage */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {/* Expanding optical ring on piece lock-in */}
        <motion.div
          aria-hidden="true"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.9], opacity: [0.55, 0] }}
          transition={{ delay: 0.36, duration: 0.95, ease: 'easeOut' }}
          className="absolute top-12 w-36 h-36 rounded-full border border-[#9146FF]/60 pointer-events-none will-change-transform"
        />

        {/* Obsidian Isotype Card */}
        <motion.div
          initial={{ scale: 0.88, opacity: 0.92 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-[34px] bg-gradient-to-br from-[#141726] via-[#090B12] to-[#030306] border border-white/15 shadow-[0_28px_80px_rgba(0,0,0,0.95),0_0_72px_rgba(145,70,255,0.42)] flex items-center justify-center overflow-hidden will-change-transform"
        >
          {/* Subtle animated glass border highlight sweep */}
          <motion.div
            aria-hidden="true"
            initial={{ x: '-140%', skewX: -22, opacity: 0 }}
            animate={{ x: '220%', skewX: -22, opacity: [0, 0.65, 0] }}
            transition={{ delay: 0.5, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent will-change-transform"
          />

          {/* Vector SVG Kinetic Blade R with Split Piece Spring Assembly & Interior Shimmer */}
          <svg
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="RiffanTV R Isotipo"
            className="w-[88%] h-[88%] overflow-visible drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
          >
            <defs>
              <linearGradient id={bladeId} x1="136" y1="106" x2="376" y2="406" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#C084FC" />
                <stop offset="42%" stopColor="#9146FF" />
                <stop offset="100%" stopColor="#00F593" />
              </linearGradient>
              <linearGradient id={shimmerId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="50%" stopColor="rgba(255,255,255,0.92)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              <clipPath id={clipRId}>
                <g id="rtv-clip-group">
                  <path d="M 238 290 H 294 L 376 406 H 320 Z" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M 136 106 H 290 C 346 106 376 142 376 194 C 376 246 346 282 290 282 H 192 V 406 H 136 Z M 204 152 V 236 L 284 194 Z"
                  />
                </g>
              </clipPath>
            </defs>

            <g id="rtv-intro-r">
              {/* Piece 1: Main Upper Body with Enlarged Centered Play Cutout (Unified Brand Gradient) */}
              <motion.path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M 136 106 H 290 C 346 106 376 142 376 194 C 376 246 346 282 290 282 H 192 V 406 H 136 Z M 204 152 V 236 L 284 194 Z"
                fill={`url(#${bladeId})`}
                initial={{ x: -44, y: -34, opacity: 0, scale: 0.88 }}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 250, damping: 20, mass: 0.9 }}
              />

              {/* Piece 2: Symmetrical Diagonal Lower Leg (Matching Unified Brand Gradient) */}
              <motion.path
                d="M 238 290 H 294 L 376 406 H 320 Z"
                fill={`url(#${bladeId})`}
                initial={{ x: 48, y: 44, opacity: 0, scale: 0.82 }}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 19,
                  mass: 0.85,
                  delay: 0.14,
                }}
              />
            </g>

            {/* Interior Shimmer Sweep clipped directly inside the assembled R paths */}
            <g clipPath={`url(#${clipRId})`}>
              <motion.rect
                y="70"
                width="140"
                height="380"
                rx="16"
                fill={`url(#${shimmerId})`}
                transform="rotate(20 256 256)"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 460, opacity: [0, 0.9, 0] }}
                transition={{ delay: 0.48, duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
              />
            </g>
          </svg>
        </motion.div>

        {/* Kinetic Letter-by-Letter "Riffan TV" Wordmark */}
        <motion.div
          variants={wordmarkContainerVariants}
          initial="hidden"
          animate="visible"
          className="mt-7 sm:mt-8 font-display font-black text-4xl sm:text-5xl md:text-6xl leading-none flex items-baseline justify-center"
        >
          <span className="inline-flex items-baseline">
            {WORD_LEFT.map((char, idx) => (
              <motion.span
                key={`l-${idx}`}
                variants={letterVariants}
                className="inline-block text-[#F4F5F8] will-change-transform"
              >
                {char}
              </motion.span>
            ))}
          </span>

          <span className="inline-flex items-baseline ml-2">
            {WORD_RIGHT.map((char, idx) => (
              <motion.span
                key={`r-${idx}`}
                variants={letterVariants}
                animate={{
                  opacity: 1,
                  y: 0,
                  filter: 'blur(0px)',
                  scale: 1,
                  textShadow: [
                    '0 0 0px rgba(145,70,255,0)',
                    '0 0 28px rgba(167,139,250,0.95), 0 0 54px rgba(145,70,255,0.75)',
                    '0 0 14px rgba(167,139,250,0.55)',
                  ],
                }}
                transition={{
                  opacity: { delay: 0.44 + (WORD_LEFT.length + idx) * 0.045, duration: 0.35 },
                  y: { type: 'spring', stiffness: 260, damping: 22, delay: 0.44 + (WORD_LEFT.length + idx) * 0.045 },
                  filter: { delay: 0.44 + (WORD_LEFT.length + idx) * 0.045, duration: 0.35 },
                  scale: { type: 'spring', stiffness: 260, damping: 22, delay: 0.44 + (WORD_LEFT.length + idx) * 0.045 },
                  textShadow: { delay: 0.92, duration: 0.95, ease: 'easeInOut' },
                }}
                className="inline-block text-[#A78BFA] will-change-transform"
              >
                {char}
              </motion.span>
            ))}
          </span>
        </motion.div>

        {/* Optical Accent Line */}
        <motion.div
          aria-hidden="true"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-4 h-[1.5px] w-44 sm:w-64 origin-center bg-gradient-to-r from-transparent via-[#9146FF] to-transparent will-change-transform"
        />

        {/* Subtitle ("ENTRANDO A SALA...") */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.4, ease: 'easeOut' }}
          className="mt-3 text-[11px] sm:text-xs uppercase tracking-[0.26em] text-zinc-300 font-semibold"
        >
          {resolvedSubtitle}
        </motion.p>
      </div>

      {/* Bottom Controls with mobile safe-area inset compliance */}
      <div
        className="fixed bottom-0 inset-x-0 z-20 flex items-center justify-between gap-3 px-5 sm:px-8 pointer-events-none"
        style={{
          paddingBottom: 'max(1.1rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1.25rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.25rem, env(safe-area-inset-right))',
        }}
      >
        {!soundActive ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleManualSoundTrigger();
            }}
            className="pointer-events-auto min-h-[38px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-[11px] font-medium text-zinc-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          className="pointer-events-auto min-h-[38px] px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/14 text-xs font-semibold text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};

export const RiffanIntro = NaimcineIntro;
