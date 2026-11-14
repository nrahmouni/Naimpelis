import React from 'react';

interface NaimBrandLogoProps {
  size?: number;
  className?: string;
  /** Dramatic theatrical timing used inside the full-screen NaimcineIntro */
  animated?: boolean;
  /** Render the dark Broadcast Obsidian frame behind the emblem */
  withFrame?: boolean;
  /** Enable subtle sheen in headers/cards */
  live?: boolean;
}

/**
 * Official NAIM CINE Brand Logo — Twitch-Style Broadcast Edition:
 * - Deep Broadcast Obsidian squircle (#0E0E10)
 * - Electric Violet (#9146FF) beveled broadcast chassis frame
 * - Crisp white play-monolith & signal pillars for instant legibility across Web, Android APK & Google TV
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
          fill="#0E0E10"
          stroke="#27272F"
          strokeWidth="2.5"
        />
      )}
      {/* Electric Violet Broadcast Bubble / Screen Silhouette */}
      <path
        d="M 22 18 H 82 V 63 L 68 77 H 52 L 40 87 V 77 H 22 V 32 L 22 18 Z"
        fill="#9146FF"
      />
      {/* Crisp Dark Inner Monitor Window */}
      <path
        d="M 31 27 H 73 V 58 L 63 68 H 47 L 39 75 V 68 H 31 V 27 Z"
        fill="#0E0E10"
      />
      {/* Twin Broadcast Bars + Play Arrow */}
      <rect x="41" y="37" width="5.5" height="17" rx="2.75" fill="#FFFFFF" />
      <rect x="52" y="37" width="5.5" height="17" rx="2.75" fill="#FFFFFF" />
      <path d="M 62.5 38.5 L 70 45.5 L 62.5 52.5 Z" fill="#FFFFFF" />
    </svg>
  );
};
