import React from 'react';

interface NaimBrandLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
  withFrame?: boolean;
}

/**
 * Flat, architectural, Swiss-precision vector brand mark for NAIM CINE.
 * Zero 3D clutter — crisp 2D geometric pillars, diagonal crimson cinema beam,
 * obsidian architectural cut-lines, and a centered flat Play aperture.
 */
export const NaimBrandLogo: React.FC<NaimBrandLogoProps> = ({
  size = 40,
  className = '',
  animated = false,
  withFrame = true,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="NAIM CINE Logo"
    >
      {withFrame && (
        <>
          <rect width="100" height="100" rx="22" fill="#090A0F" />
          <rect
            x="1.5"
            y="1.5"
            width="97"
            height="97"
            rx="20.5"
            stroke="white"
            strokeOpacity="0.14"
            strokeWidth="1.5"
          />
        </>
      )}

      {/* Left Architectural Pillar (Bottom-Left segment below diagonal gap) */}
      <path
        d="M21 43.5 L34.5 63.5 V80 H21 V43.5 Z"
        fill="#F8FAFC"
        className={animated ? 'logo-pillar-left' : undefined}
      />

      {/* Right Architectural Pillar (Top-Right segment above diagonal gap) */}
      <path
        d="M65.5 20 H79 V56.5 L65.5 36.5 V20 Z"
        fill="#F8FAFC"
        className={animated ? 'logo-pillar-right' : undefined}
      />

      {/* Flat Signature Crimson Cinema Beam (Top-Left to Bottom-Right) */}
      <path
        d="M21 20 H38.5 L79 80 H61.5 L21 20 Z"
        fill="#E11D48"
        className={animated ? 'logo-beam-crimson' : undefined}
      />

      {/* Precision Flat Play Aperture Centered on the Beam */}
      <path
        d="M46.8 44.2 L56.2 50 L46.8 55.8 V44.2 Z"
        fill="#FFFFFF"
        className={animated ? 'logo-play-core' : undefined}
      />
    </svg>
  );
};
