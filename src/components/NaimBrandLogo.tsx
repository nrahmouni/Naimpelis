import React from 'react';

export interface RiffanBrandLogoProps {
  size?: number;
  className?: string;
  /** Dramatic presentation flag used inside RiffanTV Intro */
  animated?: boolean;
  /** Render the Cinema Obsidian squircle chassis behind the Kinetic Blade R emblem */
  withFrame?: boolean;
  /** Render the subtle broadcast crimson live beacon on the emblem */
  live?: boolean;
  /** Display mode: 'mark' (emblem only), 'wordmark' (text lockup), 'full' (emblem + RiffanTV), 'monochrome' */
  variant?: 'mark' | 'wordmark' | 'full' | 'monochrome';
}

/**
 * Official RiffanTV (RTV) Kinetic Blade R Brand Emblem:
 * - Daring & elegant 8° forward kinetic lean
 * - Continuous brushed-platinum upper P-arch with negative ▶ Play counter
 * - Detached electric violet → indigo → cyan diagonal kicker blade
 * - Real high-fidelity multi-resolution PNG suite (/pwa-512x512.png, /pwa-192x192.png, /logo-mark.png, /logo-monochrome.png)
 * - Zero layout shift, retina crisp on mobile, desktop and 4K TV screens
 */
export const RiffanBrandLogo: React.FC<RiffanBrandLogoProps> = ({
  size = 40,
  className = '',
  animated = false,
  withFrame = true,
  live = false,
  variant = 'mark',
}) => {
  const isMonochrome = variant === 'monochrome';

  // Pick optimal PNG variant based on frame, theme and target render size
  let imgSrc = '/logo-mark.png';
  let srcSet: string | undefined;

  if (isMonochrome) {
    imgSrc = '/logo-monochrome.png';
  } else if (withFrame) {
    if (size > 96) {
      imgSrc = '/pwa-512x512.png';
      srcSet = '/pwa-192x192.png 192w, /pwa-512x512.png 512w';
    } else {
      imgSrc = '/pwa-192x192.png';
      srcSet = '/pwa-192x192.png 192w, /pwa-512x512.png 512w';
    }
  } else {
    imgSrc = '/logo-mark.png';
  }

  const markImg = (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${
        animated ? 'transition-transform duration-500 will-change-transform hover:scale-105' : ''
      } ${variant === 'mark' || variant === 'monochrome' ? className : ''}`}
      style={{ width: size, height: size }}
      aria-label="RiffanTV RTV Logo"
    >
      <img
        src={imgSrc}
        srcSet={srcSet}
        sizes={`${size}px`}
        alt="RiffanTV (RTV)"
        width={size}
        height={size}
        draggable={false}
        loading="eager"
        decoding="async"
        className={`w-full h-full object-contain pointer-events-none select-none ${
          withFrame ? 'rounded-[23%] drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]' : 'drop-shadow-[0_4px_14px_rgba(139,92,246,0.35)]'
        }`}
      />

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
      className="font-display font-bold tracking-[-0.02em] leading-none inline-flex items-baseline select-none whitespace-nowrap"
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
