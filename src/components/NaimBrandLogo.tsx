import React, { useId } from 'react';

export interface RiffanBrandLogoProps {
  size?: number;
  className?: string;
  /** Dramatic presentation flag used inside RiffanTV Intro */
  animated?: boolean;
  /** Render the subtle glassmorphism container behind the Kinetic Blade R emblem */
  withFrame?: boolean;
  /** Frame style: 'glass' (subtle translucent glassmorphism), 'none' (pure transparent), 'obsidian' (intro monolith) */
  frameStyle?: 'glass' | 'none' | 'obsidian';
  /** Render the subtle broadcast crimson live beacon on the emblem */
  live?: boolean;
  /** Display mode: 'mark' (emblem only), 'wordmark' (text lockup), 'full' (emblem + RiffanTV), 'monochrome' */
  variant?: 'mark' | 'wordmark' | 'full' | 'monochrome';
}

/**
 * Official RiffanTV (RTV) Kinetic Blade R Brand Emblem:
 * - Pure transparent inline SVG with zero opaque dark box background
 * - Daring & elegant 8° forward kinetic lean
 * - Continuous brushed-platinum upper P-arch with negative ▶ Play counter
 * - Detached electric violet → indigo → cyan diagonal kicker blade
 * - Subtle glassmorphism container (backdrop-blur, border-white/10, rounded-xl) by default
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

  const brandGradId = `rtv-brand-${uid}`;

  // Mathematically centered around the R visual center (256, 256)
  const svgViewBox = resolvedFrame === 'obsidian' ? '0 0 512 512' : '108 80 296 348';

  const frameClasses =
    resolvedFrame === 'glass'
      ? 'rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] group-hover:bg-white/[0.1] group-hover:border-white/[0.18] transition-colors'
      : resolvedFrame === 'obsidian'
      ? 'rounded-[23%] bg-gradient-to-br from-[#141726] via-[#07080C] to-[#020306] border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.6)]'
      : 'bg-transparent';

  const svgPaddingClass =
    resolvedFrame === 'glass'
      ? 'p-[12%]'
      : resolvedFrame === 'obsidian'
      ? 'p-[4%]'
      : '';

  const markImg = (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${frameClasses} ${
        animated ? 'transition-transform duration-500 will-change-transform hover:scale-105' : ''
      } ${variant === 'mark' || variant === 'monochrome' ? className : ''}`}
      style={{ width: size, height: size }}
      aria-label="RiffanTV RTV Logo"
    >
      <svg
        viewBox={svgViewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="RiffanTV (RTV)"
        className={`w-full h-full pointer-events-none select-none overflow-visible ${svgPaddingClass} ${
          resolvedFrame === 'none'
            ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]'
            : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]'
        }`}
      >
        {!isMonochrome && (
          <defs>
            <linearGradient
              id={brandGradId}
              x1="136"
              y1="106"
              x2="376"
              y2="406"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#C084FC" />
              <stop offset="42%" stopColor="#9146FF" />
              <stop offset="100%" stopColor="#00F593" />
            </linearGradient>
          </defs>
        )}

        {/* Unified R Isotype with Perfectly Centered Enlarged Play Triangle */}
        <g id="rtv-r-emblem">
          {/* Main Upper P-Body with Enlarged Centered Play Counter Cutout */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M 136 106 H 290 C 346 106 376 142 376 194 C 376 246 346 282 290 282 H 192 V 406 H 136 Z M 204 152 V 236 L 284 194 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${brandGradId})`}
          />

          {/* Symmetrical Lower Diagonal Leg with Parallel 56px Stroke & Baseline Alignment */}
          <path
            d="M 238 290 H 294 L 376 406 H 320 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${brandGradId})`}
          />
        </g>
      </svg>

      {live && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center pointer-events-none"
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

  const fontSizeRem = `${Math.max(0.875, (size * 0.48) / 16).toFixed(3)}rem`;

  const wordmark = (
    <span
      className="font-display font-bold tracking-[-0.02em] leading-none inline-flex items-center select-none whitespace-nowrap"
      style={{ fontSize: fontSizeRem }}
    >
      <span className="text-[#F4F5F8]">Riffan</span>
      <span className="text-[#A78BFA] ml-0.5 font-extrabold">TV</span>
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
