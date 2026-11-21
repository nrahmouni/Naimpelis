import React, { useId } from 'react';

export interface RiffanMusicLogoProps {
  size?: number;
  className?: string;
  withFrame?: boolean;
  variant?: 'mark' | 'wordmark' | 'full';
  animated?: boolean;
}

/**
 * Official Riffan Music Brand Emblem:
 * Built directly from RiffanTV's iconic 3D Folded Ribbon "R" geometry,
 * reimagined in a Sonic Studio Crimson-Coral & Analog Amber aesthetic
 * with subtle harmonic sound-wave arcs radiating from the upper bow.
 */
export const RiffanMusicLogo: React.FC<RiffanMusicLogoProps> = ({
  size = 34,
  className = '',
  withFrame = true,
  variant = 'mark',
  animated = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const stemId = `rm-stem-${uid}`;
  const legId = `rm-leg-${uid}`;
  const bowId = `rm-bow-${uid}`;
  const shadowId = `rm-sh-${uid}`;
  const waveId = `rm-wv-${uid}`;
  const dropId = `rm-dp-${uid}`;

  const frameClass = withFrame
    ? 'rounded-[28%] bg-gradient-to-br from-[#280B18]/95 via-[#110A11]/95 to-[#160B06] backdrop-blur-xl border border-[#FF4D6D]/35 shadow-[0_6px_20px_rgba(0,0,0,0.55),0_0_20px_rgba(255,51,102,0.24),inset_0_1px_0_rgba(255,255,255,0.2)]'
    : 'bg-transparent';

  const markEl = (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none overflow-hidden ${frameClass} ${
        animated ? 'transition-transform duration-300 hover:scale-105' : ''
      } ${variant === 'mark' ? className : ''}`}
      style={{ width: size, height: size }}
      aria-label="Riffan Music Logo"
    >
      {withFrame && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/3 -right-1/4 w-[130%] h-[85%] bg-gradient-to-bl from-[#FF3366]/30 via-[#F59E0B]/15 to-transparent blur-md"
        />
      )}

      <svg
        viewBox="88 74 344 362"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Riffan Music"
        className={`relative z-10 w-full h-full pointer-events-none select-none overflow-visible ${
          withFrame ? 'p-[12%]' : ''
        } drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]`}
      >
        <defs>
          <linearGradient id={stemId} x1="160" y1="96" x2="145" y2="416" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF3366" />
            <stop offset="52%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </linearGradient>
          <linearGradient id={legId} x1="215" y1="248" x2="392" y2="416" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF2E63" />
            <stop offset="50%" stopColor="#FF6B4A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id={bowId} x1="145" y1="96" x2="375" y2="278" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#FFE4E9" />
            <stop offset="100%" stopColor="#FDA4AF" />
          </linearGradient>
          <linearGradient id={shadowId} x1="230" y1="246" x2="278" y2="318" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#070409" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#070409" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={waveId} x1="340" y1="88" x2="418" y2="210" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FF3366" />
          </linearGradient>
          <filter id={dropId} x="-15%" y="-15%" width="135%" height="135%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#040206" floodOpacity="0.68" />
          </filter>
        </defs>

        {/* Subtle Acoustic Harmonic Waves */}
        <path
          d="M 380 102 C 408 130 412 178 388 214"
          stroke={`url(#${waveId})`}
          strokeWidth="13"
          strokeLinecap="round"
          opacity="0.92"
        />
        <path
          d="M 404 86 C 436 125 440 186 410 232"
          stroke="#FBBF24"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.58"
        />

        {/* Fold 1: Left Slanted Pillar (Crimson Acoustic Stem) */}
        <path
          d="M 156 96 H 214 L 184 416 H 126 C 117 416 112 409 113 399 L 143 111 C 144 102 149 96 156 96 Z"
          fill={`url(#${stemId})`}
        />

        {/* Fold 2: Dynamic Diagonal Kick Leg (Crimson -> Sonic Coral -> Analog Amber) */}
        <path
          d="M 204 260 L 278 248 L 386 401 C 392 409 387 416 376 416 H 320 C 314 416 310 413 306 407 L 204 260 Z"
          fill={`url(#${legId})`}
        />

        {/* Cast Fold Shadow under Bow */}
        <path d="M 204 260 L 278 248 L 315 300 L 236 306 Z" fill={`url(#${shadowId})`} />

        {/* Fold 3: Upper Bow Ribbon (Platinum Rose Silk) */}
        <path
          filter={`url(#${dropId})`}
          d="M 156 96 H 290 C 358 96 396 132 390 189 C 384 246 344 278 272 278 H 197 L 203 220 H 268 C 306 220 326 206 328 186 C 330 165 312 152 276 152 H 138.8 L 143 111 C 144 102 149 96 156 96 Z"
          fill={`url(#${bowId})`}
        />

        {/* Precision Equalizer Notch Accent inside Stem */}
        <rect x="148" y="330" width="24" height="7" rx="3.5" fill="#FBBF24" opacity="0.85" />
      </svg>
    </div>
  );

  if (variant === 'mark') return markEl;

  const fontSizeRem = `${Math.max(0.78, (size * 0.62) / 16).toFixed(3)}rem`;

  const wordmark = (
    <span
      className="font-display font-extrabold tracking-[-0.025em] leading-none inline-flex items-baseline select-none whitespace-nowrap"
      style={{ fontSize: fontSizeRem }}
    >
      <span className="text-[#FFF5F7]">Riffan</span>
      <span className="ml-[3px] font-black tracking-[0.02em] bg-gradient-to-r from-[#FF3366] via-[#FF6B4A] to-[#F59E0B] bg-clip-text text-transparent">
        MUSIC
      </span>
    </span>
  );

  if (variant === 'wordmark') {
    return <span className={`inline-flex items-center shrink-0 ${className}`}>{wordmark}</span>;
  }

  return (
    <span className={`inline-flex items-center ${size <= 20 ? 'gap-1.5' : 'gap-2'} shrink-0 ${className}`}>
      {markEl}
      {wordmark}
    </span>
  );
};
