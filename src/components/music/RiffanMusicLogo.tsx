import React, { useId } from 'react';

export interface RiffanMusicLogoProps {
  size?: number;
  className?: string;
  withFrame?: boolean;
  frameStyle?: 'glass' | 'none' | 'obsidian';
  variant?: 'mark' | 'wordmark' | 'full' | 'monochrome';
  animated?: boolean;
}

/**
 * Riffan Music (RM) — Inspired directly by RiffanTV's 3D Folded Ribbon "R" architecture:
 * - Same sculpted 3-plane folded ribbon geometry and tight viewBox proportions
 * - Refined Hi-Res Studio palette: Deep Teal-Emerald pillar, Studio Emerald -> Electric Cyan kick leg,
 *   and Platinum-Ice Silk upper bow — clean, architectural, and zero visual clutter.
 */
export const RiffanMusicLogo: React.FC<RiffanMusicLogoProps> = ({
  size = 34,
  className = '',
  withFrame = true,
  frameStyle,
  variant = 'mark',
  animated = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const isMonochrome = variant === 'monochrome';
  const resolvedFrame: 'glass' | 'none' | 'obsidian' =
    frameStyle ?? (withFrame && !isMonochrome ? 'glass' : 'none');

  const stemId = `rm-stem-${uid}`;
  const legId = `rm-leg-${uid}`;
  const bowId = `rm-bow-${uid}`;
  const shadowId = `rm-sh-${uid}`;
  const dropId = `rm-dp-${uid}`;

  const svgViewBox = resolvedFrame === 'obsidian' ? '0 0 512 512' : '96 80 320 352';

  const frameClass =
    resolvedFrame === 'glass'
      ? 'rounded-[28%] bg-gradient-to-br from-[#0F1B24]/95 via-[#091017]/95 to-[#05080D] backdrop-blur-xl border border-[#34D399]/25 shadow-[0_6px_22px_rgba(0,0,0,0.52),0_0_22px_rgba(16,185,129,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] group-hover:border-[#34D399]/50 transition-all'
      : resolvedFrame === 'obsidian'
      ? 'rounded-[26%] bg-gradient-to-br from-[#101C26] via-[#080E14] to-[#030508] border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.75)]'
      : 'bg-transparent';

  const svgPaddingClass =
    resolvedFrame === 'glass'
      ? 'p-[12%]'
      : resolvedFrame === 'obsidian'
      ? 'p-[6%]'
      : '';

  const markEl = (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none overflow-hidden ${frameClass} ${
        animated ? 'transition-transform duration-500 will-change-transform hover:scale-105' : ''
      } ${variant === 'mark' || variant === 'monochrome' ? className : ''}`}
      style={{ width: size, height: size }}
      aria-label="Riffan Music Logo"
    >
      {resolvedFrame !== 'none' && !isMonochrome && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/2 -left-1/4 w-[150%] h-[85%] bg-gradient-to-b from-[#10B981]/22 via-[#22D3EE]/10 to-transparent blur-md"
        />
      )}

      <svg
        viewBox={svgViewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Riffan Music"
        className={`relative z-10 w-full h-full pointer-events-none select-none overflow-visible ${svgPaddingClass} ${
          resolvedFrame === 'none'
            ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]'
            : 'drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]'
        }`}
      >
        {!isMonochrome && (
          <defs>
            <linearGradient id={stemId} x1="165" y1="96" x2="145" y2="416" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="48%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#065F46" />
            </linearGradient>
            <linearGradient id={legId} x1="215" y1="248" x2="386" y2="416" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="48%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>
            <linearGradient id={bowId} x1="150" y1="96" x2="368" y2="278" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="58%" stopColor="#ECFEFF" />
              <stop offset="100%" stopColor="#A7F3D0" />
            </linearGradient>
            <linearGradient id={shadowId} x1="230" y1="246" x2="278" y2="318" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#03070B" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#03070B" stopOpacity="0" />
            </linearGradient>
            <filter id={dropId} x="-15%" y="-15%" width="135%" height="135%">
              <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#02060A" floodOpacity="0.66" />
            </filter>
          </defs>
        )}

        <g id={`rm-ribbon-r-${uid}`}>
          {/* Fold 1: Left Slanted Pillar (Deep Emerald Acoustic Stem) */}
          <path
            d="M 156 96 H 214 L 184 416 H 126 C 117 416 112 409 113 399 L 143 111 C 144 102 149 96 156 96 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${stemId})`}
            opacity={isMonochrome ? 0.72 : 1}
          />

          {/* Fold 2: Dynamic Diagonal Kick Leg (Emerald -> Electric Cyan) */}
          <path
            d="M 204 260 L 278 248 L 386 401 C 392 409 387 416 376 416 H 320 C 314 416 310 413 306 407 L 204 260 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${legId})`}
            opacity={isMonochrome ? 0.86 : 1}
          />

          {/* Cast Fold Shadow under the Upper Bow */}
          {!isMonochrome && (
            <path d="M 204 260 L 278 248 L 315 300 L 236 306 Z" fill={`url(#${shadowId})`} />
          )}

          {/* Fold 3: Upper Bow Ribbon (Platinum-Mint Silk) */}
          <path
            filter={isMonochrome ? undefined : `url(#${dropId})`}
            d="M 156 96 H 290 C 358 96 396 132 390 189 C 384 246 344 278 272 278 H 197 L 203 220 H 268 C 306 220 326 206 328 186 C 330 165 312 152 276 152 H 138.8 L 143 111 C 144 102 149 96 156 96 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${bowId})`}
          />
        </g>
      </svg>
    </div>
  );

  if (variant === 'mark' || variant === 'monochrome') return markEl;

  const fontSizeRem = `${Math.max(0.86, (size * 0.56) / 16).toFixed(3)}rem`;

  const wordmark = (
    <span
      className="font-display font-extrabold tracking-[-0.025em] leading-none inline-flex items-baseline select-none whitespace-nowrap"
      style={{ fontSize: fontSizeRem }}
    >
      <span className="text-[#F4F5F8]">Riffan</span>
      <span className="ml-[3px] font-black bg-gradient-to-r from-[#6EE7B7] via-[#10B981] to-[#22D3EE] bg-clip-text text-transparent">
        Music
      </span>
    </span>
  );

  if (variant === 'wordmark') {
    return <span className={`inline-flex items-center shrink-0 ${className}`}>{wordmark}</span>;
  }

  return (
    <span className={`inline-flex items-center ${size <= 20 ? 'gap-1.5' : 'gap-2.5'} shrink-0 ${className}`}>
      {markEl}
      {wordmark}
    </span>
  );
};
