import React, { useId } from 'react';

export interface RiffanBrandLogoProps {
  size?: number;
  className?: string;
  /** Dramatic presentation flag used inside RiffanTV Intro */
  animated?: boolean;
  /** Render the subtle glassmorphism container behind the 3D Folded Ribbon R emblem */
  withFrame?: boolean;
  /** Frame style: 'glass' (Cinema Obsidian translucent glass), 'none' (pure transparent), 'obsidian' (intro monolith) */
  frameStyle?: 'glass' | 'none' | 'obsidian';
  /** Render the subtle broadcast crimson live beacon on the emblem */
  live?: boolean;
  /** Display mode: 'mark' (emblem only), 'wordmark' (text lockup), 'full' (emblem + RiffanTV), 'monochrome' */
  variant?: 'mark' | 'wordmark' | 'full' | 'monochrome';
}

/**
 * Official RiffanTV (RTV) 3D Folded Ribbon R Brand Emblem:
 * - Sculpted 3-plane folded ribbon 'R' with realistic crease shadows and forward momentum
 * - Fold 1: Deep-to-Electric Violet slanted pillar
 * - Fold 2: Electric Violet -> Cyan dynamic diagonal leg
 * - Fold 3: Front Platinum Silk curved bow with soft drop shadow over lower folds
 * - Crisp gradient wordmark ('Riffan' platinum white + 'TV' Electric Violet -> Cyan accent)
 */
export const RiffanBrandLogo: React.FC<RiffanBrandLogoProps> = ({
  size = 40,
  className = '',
  animated = false,
  withFrame = true,
  frameStyle,
  live = false,
  variant = 'mark',
}) => {
  const uid = useId().replace(/:/g, '');
  const isMonochrome = variant === 'monochrome';
  const resolvedFrame: 'glass' | 'none' | 'obsidian' =
    frameStyle ?? (withFrame && !isMonochrome ? 'glass' : 'none');

  const stemGradId = `rtv-stem-${uid}`;
  const legGradId = `rtv-leg-${uid}`;
  const archGradId = `rtv-arch-${uid}`;
  const shadowLegId = `rtv-sleg-${uid}`;
  const dropFilterId = `rtv-drop-${uid}`;
  const wordGradId = `rtv-word-${uid}`;

  const svgViewBox = resolvedFrame === 'obsidian' ? '0 0 512 512' : '96 80 320 352';

  const frameClasses =
    resolvedFrame === 'glass'
      ? 'rounded-[28%] bg-gradient-to-br from-[#191B2C]/95 via-[#0E1019]/95 to-[#07080C] backdrop-blur-xl border border-white/[0.14] shadow-[0_6px_22px_rgba(0,0,0,0.48),0_0_24px_rgba(145,70,255,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] group-hover:border-[#A78BFA]/45 transition-all'
      : resolvedFrame === 'obsidian'
      ? 'rounded-[26%] bg-gradient-to-br from-[#171A2B] via-[#090B12] to-[#020306] border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.75)]'
      : 'bg-transparent';

  const svgPaddingClass =
    resolvedFrame === 'glass'
      ? 'p-[12%]'
      : resolvedFrame === 'obsidian'
      ? 'p-[6%]'
      : '';

  const markImg = (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none overflow-hidden ${frameClasses} ${
        animated ? 'transition-transform duration-500 will-change-transform hover:scale-105' : ''
      } ${variant === 'mark' || variant === 'monochrome' ? className : ''}`}
      style={{ width: size, height: size }}
      aria-label="RiffanTV RTV Logo"
    >
      {resolvedFrame !== 'none' && !isMonochrome && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/2 -left-1/4 w-[150%] h-[85%] bg-gradient-to-b from-[#9146FF]/22 via-sky-400/8 to-transparent blur-md"
        />
      )}

      <svg
        viewBox={svgViewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="RiffanTV (RTV)"
        className={`relative z-10 w-full h-full pointer-events-none select-none overflow-visible ${svgPaddingClass} ${
          resolvedFrame === 'none'
            ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]'
            : 'drop-shadow-[0_3px_8px_rgba(0,0,0,0.55)]'
        }`}
      >
        {!isMonochrome && (
          <defs>
            <linearGradient
              id={stemGradId}
              x1="165"
              y1="96"
              x2="145"
              y2="416"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="48%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#4C1D95" />
            </linearGradient>
            <linearGradient
              id={legGradId}
              x1="215"
              y1="248"
              x2="386"
              y2="416"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#7C3AED" />
              <stop offset="45%" stopColor="#9146FF" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient
              id={archGradId}
              x1="150"
              y1="96"
              x2="368"
              y2="278"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="58%" stopColor="#F1EDFF" />
              <stop offset="100%" stopColor="#C4B5FD" />
            </linearGradient>
            <linearGradient
              id={shadowLegId}
              x1="230"
              y1="246"
              x2="278"
              y2="318"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#04050A" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#04050A" stopOpacity="0" />
            </linearGradient>
            <filter id={dropFilterId} x="-15%" y="-15%" width="135%" height="135%">
              <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#03040A" floodOpacity="0.65" />
            </filter>
          </defs>
        )}

        <g id="rtv-ribbon-r">
          {/* Fold 1: Left Slanted Pillar (Back Layer) */}
          <path
            d="M 156 96 H 214 L 184 416 H 126 C 117 416 112 409 113 399 L 143 111 C 144 102 149 96 156 96 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${stemGradId})`}
            opacity={isMonochrome ? 0.72 : 1}
          />

          {/* Fold 2: Dynamic Diagonal Kick Leg (Middle Layer) */}
          <path
            d="M 204 260 L 278 248 L 386 401 C 392 409 387 416 376 416 H 320 C 314 416 310 413 306 407 L 204 260 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${legGradId})`}
            opacity={isMonochrome ? 0.86 : 1}
          />

          {/* Cast Fold Shadow under the Upper Bow */}
          {!isMonochrome && (
            <path
              d="M 204 260 L 278 248 L 315 300 L 236 306 Z"
              fill={`url(#${shadowLegId})`}
            />
          )}

          {/* Fold 3: Upper Bow Ribbon (Front Luminous Layer) */}
          <path
            filter={isMonochrome ? undefined : `url(#${dropFilterId})`}
            d="M 156 96 H 290 C 358 96 396 132 390 189 C 384 246 344 278 272 278 H 197 L 203 220 H 268 C 306 220 326 206 328 186 C 330 165 312 152 276 152 H 138.8 L 143 111 C 144 102 149 96 156 96 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${archGradId})`}
          />
        </g>
      </svg>

      {live && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center pointer-events-none z-20"
          title="En directo"
        >
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600 ring-2 ring-[#07080C]" />
        </span>
      )}
    </div>
  );

  if (variant === 'mark' || variant === 'monochrome') {
    return markImg;
  }

  const fontSizeRem = `${Math.max(0.95, (size * 0.5) / 16).toFixed(3)}rem`;

  const wordmark = (
    <span
      className="font-display font-extrabold tracking-[-0.025em] leading-none inline-flex items-baseline select-none whitespace-nowrap"
      style={{ fontSize: fontSizeRem }}
    >
      <span className="text-[#F4F5F8]">Riffan</span>
      <span
        id={wordGradId}
        className="ml-[2px] font-black bg-gradient-to-r from-[#C084FC] via-[#9146FF] to-[#38BDF8] bg-clip-text text-transparent"
      >
        TV
      </span>
    </span>
  );

  if (variant === 'wordmark') {
    return (
      <span className={`inline-flex items-center shrink-0 ${className}`}>
        {wordmark}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      {markImg}
      {wordmark}
    </span>
  );
};

export const NaimBrandLogo = RiffanBrandLogo;
