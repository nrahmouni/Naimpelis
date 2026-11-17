import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { RiffanVolumeIcon } from './ui/RiffanIcons';
import { playRiffanIntroSound, triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import type { AppLanguage } from '../types';

interface NaimcineIntroProps {
  onComplete: () => void;
  withSound?: boolean;
  subtitle?: string;
  lang?: AppLanguage;
}

const INTRO_DURATION_MS = 3500;
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

export const RiffanIntroLogoSvg: React.FC<{ className?: string }> = ({ className = '' }) => {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const iconBgId = `rtv-in-bg-${rawId}`;
  const iconBorderId = `rtv-in-bd-${rawId}`;
  const ambientGlowId = `rtv-in-ag-${rawId}`;
  const stemGradId = `rtv-in-sg-${rawId}`;
  const stemHiId = `rtv-in-sh-${rawId}`;
  const stemTopShId = `rtv-in-sts-${rawId}`;
  const legGradId = `rtv-in-lg-${rawId}`;
  const legTopShId = `rtv-in-lts-${rawId}`;
  const bowlGradId = `rtv-in-bgw-${rawId}`;
  const sheenGradId = `rtv-in-sheen-${rawId}`;
  const pStemId = `rtv-in-ps-${rawId}`;
  const pLegId = `rtv-in-pl-${rawId}`;
  const pBowlId = `rtv-in-pb-${rawId}`;
  const clipStemId = `rtv-in-cs-${rawId}`;
  const clipLegId = `rtv-in-cl-${rawId}`;
  const clipRId = `rtv-in-cr-${rawId}`;
  const clipBowlId = `rtv-in-cb-${rawId}`;
  const maskStemId = `rtv-in-ms-${rawId}`;
  const maskBowlId = `rtv-in-mb-${rawId}`;
  const maskLegId = `rtv-in-ml-${rawId}`;
  const blurId = `rtv-in-blur-${rawId}`;
  const dropShadowId = `rtv-in-ds-${rawId}`;

  return (
    <svg
      className={`rtv-intro-r-play block w-full h-auto overflow-visible drop-shadow-[0_24px_60px_rgba(0,0,0,0.9)] ${className}`}
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Logo R animado"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={iconBgId} x1="64" y1="36" x2="448" y2="476" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E2638" />
          <stop offset="42%" stopColor="#111622" />
          <stop offset="100%" stopColor="#07090F" />
        </linearGradient>
        <linearGradient id={iconBorderId} x1="80" y1="24" x2="432" y2="488" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B9AC0" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#273045" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#181E2C" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id={ambientGlowId} cx="252" cy="248" r="185" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.24" />
          <stop offset="65%" stopColor="#3B82F6" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#07090F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={stemGradId} x1="142" y1="148" x2="192" y2="396" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="28%" stopColor="#8B46F6" />
          <stop offset="68%" stopColor="#6929D4" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id={stemHiId} x1="126" y1="260" x2="196" y2="268" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A855F7" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#3B0764" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id={stemTopShId} x1="184" y1="148" x2="181" y2="176" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#170636" stopOpacity="0.82" />
          <stop offset="55%" stopColor="#2E1065" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#5B21B6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={legGradId} x1="238" y1="264" x2="392" y2="396" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5B21B6" />
          <stop offset="26%" stopColor="#6D28D9" />
          <stop offset="56%" stopColor="#4F46E5" />
          <stop offset="82%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#4CC9F0" />
        </linearGradient>
        <linearGradient id={legTopShId} x1="258" y1="264" x2="275" y2="294" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#12052E" stopOpacity="0.84" />
          <stop offset="55%" stopColor="#280D5C" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={bowlGradId} x1="158" y1="100" x2="322" y2="264" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="36%" stopColor="#FAF8FF" />
          <stop offset="64%" stopColor="#ECE7FF" />
          <stop offset="85%" stopColor="#DDD5FF" />
          <stop offset="100%" stopColor="#C9BEFF" />
        </linearGradient>
        <linearGradient id={sheenGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        <path
          id={pStemId}
          d="M 155.2 148 L 217.2 148 L 188.28 389.05 Q 187.44 396 180.44 396 L 132.44 396 Q 125.44 396 126.28 389.05 Z"
        />
        <path
          id={pLegId}
          d="M 228 264 L 294 264 L 391.55 390.46 Q 396 396 389 396 L 341 396 Q 334 396 329.72 390.46 Z"
        />
        <path
          id={pBowlId}
          d="M 167.93 96 L 326.08 96 C 372.47 96, 405.57 133.61, 400 180 C 394.43 226.39, 352.31 264, 305.92 264 L 207.28 264 Q 203.28 264 203.76 260.03 L 209.52 212 L 312.16 212 C 329.83 212, 345.88 197.67, 348 180 C 350.12 162.33, 337.51 148, 319.84 148 L 156.72 148 Q 151.76 148 152.35 143.07 L 156.81 105.93 Q 158 96 167.93 96 Z"
        />
        <clipPath id={clipStemId}>
          <use href={`#${pStemId}`} />
        </clipPath>
        <clipPath id={clipLegId}>
          <use href={`#${pLegId}`} />
        </clipPath>
        <clipPath id={clipRId}>
          <use href={`#${pStemId}`} />
          <use href={`#${pLegId}`} />
          <use href={`#${pBowlId}`} />
        </clipPath>
        <mask id={maskStemId} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-intro-mk rtv-intro-mk-stem"
            pathLength={1}
            strokeWidth="150"
            d="M148 420 L194 130"
          />
        </mask>
        <mask id={maskBowlId} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-intro-mk rtv-intro-mk-bowl"
            pathLength={1}
            strokeWidth="110"
            d="M140 122 H322 C362 122 380 150 374 182 C368 214 340 238 306 238 H196"
          />
        </mask>
        <mask id={maskLegId} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-intro-mk rtv-intro-mk-leg"
            pathLength={1}
            strokeWidth="150"
            d="M236 236 L372 420"
          />
        </mask>
        <clipPath id={clipBowlId}>
          <use href={`#${pBowlId}`} />
        </clipPath>
        <filter id={blurId}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={dropShadowId} x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#03050A" floodOpacity="0.6" />
        </filter>
      </defs>

      <circle className="rtv-intro-ring rtv-intro-tb" cx="256" cy="256" r="150" stroke="#8B5CF6" strokeWidth="3" />

      <g className="rtv-intro-tile rtv-intro-tb">
        <rect x="24" y="24" width="464" height="464" rx="116" fill={`url(#${iconBgId})`} />
        <rect className="rtv-intro-glow" x="24" y="24" width="464" height="464" rx="116" fill={`url(#${ambientGlowId})`} />
        <rect
          className="rtv-intro-rim"
          pathLength={1}
          x="25.25"
          y="25.25"
          width="461.5"
          height="461.5"
          rx="114.75"
          stroke={`url(#${iconBorderId})`}
          strokeWidth="2.5"
        />
      </g>

      <g className="rtv-intro-float rtv-intro-tb">
        <g filter={`url(#${dropShadowId})`}>
          <g mask={`url(#${maskStemId})`}>
            <g clipPath={`url(#${clipStemId})`}>
              <rect x="120" y="144" width="104" height="256" fill={`url(#${stemGradId})`} />
              <rect x="120" y="144" width="104" height="256" fill={`url(#${stemHiId})`} />
              <rect className="rtv-intro-shade" x="120" y="148" width="104" height="30" fill={`url(#${stemTopShId})`} />
            </g>
          </g>
          <g mask={`url(#${maskLegId})`}>
            <g clipPath={`url(#${clipLegId})`}>
              <rect x="224" y="260" width="176" height="140" fill={`url(#${legGradId})`} />
              <rect className="rtv-intro-shade" x="224" y="264" width="176" height="32" fill={`url(#${legTopShId})`} />
            </g>
          </g>
          <g mask={`url(#${maskBowlId})`}>
            <use href={`#${pBowlId}`} fill={`url(#${bowlGradId})`} />
          </g>
        </g>

        <g clipPath={`url(#${clipBowlId})`}>
          <path
            className="rtv-intro-comet"
            pathLength={1}
            d="M140 122 H322 C362 122 380 150 374 182 C368 214 340 238 306 238 H196"
            stroke="#B9A4FF"
            strokeWidth="40"
            strokeLinecap="round"
            strokeDasharray=".07 2"
            filter={`url(#${blurId})`}
            style={{ strokeDashoffset: 0.07 }}
          />
        </g>

        <use
          className="rtv-intro-flash"
          href={`#${pBowlId}`}
          fill="#fff"
          style={{ opacity: 0, mixBlendMode: 'soft-light' }}
        />

        <g clipPath={`url(#${clipRId})`}>
          <g className="rtv-intro-sheen" style={{ transform: 'translateX(0)' }}>
            <rect x="-260" y="60" width="90" height="360" fill={`url(#${sheenGradId})`} transform="skewX(-20)" />
          </g>
        </g>
      </g>
    </svg>
  );
};

export const NaimcineIntro: React.FC<NaimcineIntroProps> = ({
  onComplete,
  withSound = false,
  subtitle,
  lang = 'es',
}) => {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const tiltRef = useRef<HTMLDivElement>(null);

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

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 16).toFixed(1)}deg`);
    el.style.setProperty('--ry', `${(x * 16).toFixed(1)}deg`);
  };

  const resetTilt = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const wordmarkContainerVariants = {
    hidden: { letterSpacing: '0.28em' },
    visible: {
      letterSpacing: '0.07em',
      transition: {
        letterSpacing: { delay: 0.7, duration: 0.85, ease: [0.22, 1, 0.36, 1] as const },
        staggerChildren: 0.045,
        delayChildren: 0.72,
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
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerUp={resetTilt}
      className="fixed inset-0 w-screen h-[100dvh] z-[9999] bg-[#05060a] opacity-100 flex flex-col items-center justify-center overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="RiffanTV Studio Intro"
    >
      {/* Full-viewport atmospheric radial backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full"
        style={{
          background:
            'radial-gradient(ellipse 75% 60% at 50% 45%, rgba(124, 58, 237, 0.2) 0%, rgba(56, 189, 248, 0.07) 40%, rgba(5, 6, 10, 1) 76%)',
        }}
      />

      {/* Ambient GPU-composited floating motes */}
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
              duration: 2.4,
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
        {/* 3D Perspective Stage for User's Animated R Logo SVG */}
        <div style={{ perspective: '900px' }} className="touch-none">
          <div
            ref={tiltRef}
            className="w-40 h-40 sm:w-48 sm:h-48 transition-transform duration-200 ease-out will-change-transform"
            style={{
              transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
            }}
          >
            <RiffanIntroLogoSvg />
          </div>
        </div>

        {/* Kinetic Letter-by-Letter "Riffan TV" Wordmark */}
        <motion.div
          variants={wordmarkContainerVariants}
          initial="hidden"
          animate="visible"
          className="mt-6 sm:mt-7 font-display font-black text-4xl sm:text-5xl md:text-6xl leading-none flex items-baseline justify-center"
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
                    '0 0 28px rgba(167,139,250,0.9), 0 0 54px rgba(56,189,248,0.65)',
                    '0 0 14px rgba(145,70,255,0.45)',
                  ],
                }}
                transition={{
                  opacity: { delay: 0.72 + (WORD_LEFT.length + idx) * 0.045, duration: 0.35 },
                  y: { type: 'spring', stiffness: 260, damping: 22, delay: 0.72 + (WORD_LEFT.length + idx) * 0.045 },
                  filter: { delay: 0.72 + (WORD_LEFT.length + idx) * 0.045, duration: 0.35 },
                  scale: { type: 'spring', stiffness: 260, damping: 22, delay: 0.72 + (WORD_LEFT.length + idx) * 0.045 },
                  textShadow: { delay: 1.4, duration: 1.0, ease: 'easeInOut' },
                }}
                className="inline-block bg-gradient-to-r from-[#C084FC] via-[#9146FF] to-[#38BDF8] bg-clip-text text-transparent will-change-transform"
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
          transition={{ delay: 1.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-4 h-[1.5px] w-44 sm:w-64 origin-center bg-gradient-to-r from-transparent via-[#9146FF] to-transparent will-change-transform"
        />

        {/* Subtitle ("ENTRANDO A SALA...") */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.25, duration: 0.45, ease: 'easeOut' }}
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
            <RiffanVolumeIcon size={15} animate="hover" />
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
