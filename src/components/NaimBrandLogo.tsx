import React from 'react';

interface NaimBrandLogoProps {
  size?: number;
  className?: string;
  /** Dramatic theatrical timing used inside the full-screen NaimcineIntro */
  animated?: boolean;
  /** Render the dark Obsidian Cinema squircle stage behind the N emblem */
  withFrame?: boolean;
  /** Enable subtle sheen in headers/cards */
  live?: boolean;
}

/**
 * Official NAIM CINE Brand Logo:
 * - Dark Obsidian squircle with subtle slate rim
 * - Left & Right crisp white geometric pillars with diagonal cuts
 * - Center Crimson (#E11D48) diagonal ribbon with a white Play triangle (▶) at its heart
 */
export const NaimBrandLogo: React.FC<NaimBrandLogoProps> = ({
  size = 40,
  className = '',
  withFrame = true,
}) => {
  const remSize = `${(size / 16).toFixed(3)}rem`;

  return (
    <svg
      width={remSize}
      height={remSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="NAIM CINE Logo"
    >
      {withFrame && (
        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          rx="22"
          fill="#0B0C10"
          stroke="#1E2028"
          strokeWidth="2.5"
        />
      )}
      {/* Left White Pillar with Diagonal Cut */}
      <path d="M 21 43.5 L 34.5 63.5 L 34.5 80 L 21 80 Z" fill="#F8FAFC" />
      {/* Right White Pillar with Diagonal Cut */}
      <path d="M 65.5 20 L 79 20 L 79 56.5 L 65.5 36.5 Z" fill="#F8FAFC" />
      {/* Center Crimson Diagonal Ribbon */}
      <path d="M 21 20 L 38.5 20 L 79 80 L 61.5 80 Z" fill="#E11D48" />
      {/* Center White Play Triangle */}
      <path d="M 46.8 44.2 L 56.2 50.0 L 46.8 55.8 Z" fill="#FFFFFF" />
    </svg>
  );
};
