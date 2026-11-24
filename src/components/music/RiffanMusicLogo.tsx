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
 * Riffan Music (RM) v4.0 — "La Cinta Acústica 3D"
 * - Obsidian tile (#18181F -> #0B0B0E -> #030304) with subtle specular rim
 * - Cobalt Stem (#3B82F6 -> #2563EB -> #1D4ED8)
 * - Liquid Chrome Ribbon (#FFFFFF -> #E2E8F0 -> #94A3B8)
 * - 4 Resonant Equalizer Bars (#60A5FA -> #3B82F6 -> #FF2D55)
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

  const tileId = `rmTile-${uid}`;
  const stemId = `rmStem-${uid}`;
  const ribbonId = `rmRibbon-${uid}`;
  const eqId = `rmEq-${uid}`;
  const shadowId = `rmShadow-${uid}`;

  const svgViewBox = resolvedFrame === 'none' ? '100 80 320 336' : '0 0 512 512';

  const frameClass =
    resolvedFrame === 'glass'
      ? 'rounded-[26%] bg-gradient-to-br from-[#18181F] via-[#0B0B0E] to-[#030304] backdrop-blur-xl border border-white/[0.16] shadow-[0_8px_24px_rgba(0,0,0,0.65),0_0_24px_rgba(59,130,246,0.22),inset_0_1px_0_rgba(255,255,255,0.16)] group-hover:border-[#3B82F6]/50 transition-all'
      : resolvedFrame === 'obsidian'
      ? 'rounded-[26%] bg-gradient-to-br from-[#18181F] via-[#0B0B0E] to-[#030304] border border-white/[0.16] shadow-[0_14px_38px_rgba(0,0,0,0.8)]'
      : 'bg-transparent';

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
          className="pointer-events-none absolute -top-1/2 -left-1/4 w-[150%] h-[85%] bg-gradient-to-b from-[#3B82F6]/22 via-[#60A5FA]/10 to-transparent blur-md"
        />
      )}

      <svg
        viewBox={svgViewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Riffan Music"
        className={`relative z-10 w-full h-full pointer-events-none select-none overflow-visible ${
          resolvedFrame === 'none'
            ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]'
            : 'drop-shadow-[0_4px_10px_rgba(0,0,0,0.65)]'
        }`}
      >
        {!isMonochrome && (
          <defs>
            <linearGradient id={tileId} x1="20" y1="20" x2="492" y2="492" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#071926" />
              <stop offset="52%" stopColor="#050D17" />
              <stop offset="100%" stopColor="#020408" />
            </linearGradient>
            <linearGradient id={stemId} x1="155" y1="148" x2="155" y2="396" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="50%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient id={ribbonId} x1="156" y1="96" x2="395" y2="264" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="58%" stopColor="#E0F2FE" />
              <stop offset="100%" stopColor="#7DD3FC" />
            </linearGradient>
            <linearGradient id={eqId} x1="230" y1="274" x2="396" y2="396" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="52%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
            <filter id={shadowId} x="-15%" y="-15%" width="135%" height="135%">
              <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#000000" floodOpacity="0.65" />
            </filter>
          </defs>
        )}

        {resolvedFrame !== 'none' && !isMonochrome && (
          <rect
            x="20"
            y="20"
            width="472"
            height="472"
            rx="116"
            fill={`url(#${tileId})`}
            stroke="rgba(34,211,238,0.28)"
            strokeWidth="3"
          />
        )}

        <g id={`rm-acoustic-ribbon-${uid}`}>
          {/* Sonic Cyan-Cobalt Stem */}
          <path
            fill={isMonochrome ? 'currentColor' : `url(#${stemId})`}
            opacity={isMonochrome ? 0.78 : 1}
            d="M155.2 148L217.2 148L188.3 389Q187.4 396 180.4 396L132.4 396Q125.4 396 126.3 389Z"
          />

          {/* Liquid Chrome Acoustic Ribbon */}
          <path
            filter={isMonochrome ? undefined : `url(#${shadowId})`}
            fill={isMonochrome ? 'currentColor' : `url(#${ribbonId})`}
            d="M167.9 96L326 96C372.5 96 405.6 133.6 400 180C394.4 226.4 352.3 264 305.9 264L207.3 264Q203.3 264 203.8 260L209.5 212L312.2 212C329.8 212 345.9 197.7 348 180C350.1 162.3 337.5 148 319.8 148L156.7 148Q151.8 148 152.4 143.1L156.8 105.9Q158 96 167.9 96Z"
          />

          {/* 4 Resonant Equalizer Bars */}
          <rect
            x="230"
            y="274"
            width="34"
            height="122"
            rx="14"
            fill={isMonochrome ? 'currentColor' : `url(#${eqId})`}
            opacity={isMonochrome ? 0.9 : 1}
          />
          <rect
            x="274"
            y="302"
            width="34"
            height="94"
            rx="14"
            fill={isMonochrome ? 'currentColor' : `url(#${eqId})`}
            opacity={isMonochrome ? 0.85 : 1}
          />
          <rect
            x="318"
            y="330"
            width="34"
            height="66"
            rx="14"
            fill={isMonochrome ? 'currentColor' : `url(#${eqId})`}
            opacity={isMonochrome ? 0.8 : 1}
          />
          <rect
            x="362"
            y="358"
            width="34"
            height="38"
            rx="14"
            fill={isMonochrome ? 'currentColor' : `url(#${eqId})`}
            opacity={isMonochrome ? 0.75 : 1}
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
      <span className="ml-[3px] font-black bg-gradient-to-r from-[#67E8F9] via-[#38BDF8] to-[#34D399] bg-clip-text text-transparent">
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
