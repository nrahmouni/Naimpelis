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

  const platinumGradId = `rtv-plat-${uid}`;
  const bladeGradId = `rtv-blade-${uid}`;

  // Mathematically centered around the Kinetic Blade R visual center (260, 251)
  const svgViewBox = resolvedFrame === 'obsidian' ? '0 0 512 512' : '76 67 368 368';

  const frameClasses =
    resolvedFrame === 'glass'
      ? 'rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] group-hover:bg-white/[0.1] group-hover:border-white/[0.18] transition-colors'
      : resolvedFrame === 'obsidian'
      ? 'rounded-[23%] bg-gradient-to-br from-[#141726] via-[#07080C] to-[#020306] border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.6)]'
      : 'bg-transparent';

  const svgPaddingClass =
    resolvedFrame === 'glass'
      ? 'p-[15%]'
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
              id={platinumGradId}
              x1="130"
              y1="120"
              x2="410"
              y2="380"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="48%" stopColor="#F1F5F9" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </linearGradient>
            <linearGradient
              id={bladeGradId}
              x1="220"
              y1="288"
              x2="352"
              y2="384"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#C4B5FD" />
              <stop offset="48%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
          </defs>
        )}

        <g transform="matrix(1 0 -0.1405 1 36 0)">
          {/* Detached Electric Violet → Cyan Diagonal Kicker Blade */}
          <path
            d="M 230 290 H 296 L 354 382 H 288 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${bladeGradId})`}
            fillOpacity={isMonochrome ? 0.78 : 1}
          />

          {/* Continuous Brushed Platinum Upper Arch with Crisp Negative ▶ Play Counter */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M 148 120 H 304 C 362 120 384 152 384 204 C 384 256 358 280 296 280 H 218 L 210 382 H 148 Z M 216 166 V 234 L 286 200 Z"
            fill={isMonochrome ? 'currentColor' : `url(#${platinumGradId})`}
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
