import React, { useId } from 'react';
import type { KidsAvatarId, KidsMascotId } from '../kidsData';

export const KidsAvatarArtworkSvg: React.FC<{
  avatarId: KidsAvatarId | string;
  size?: number;
  className?: string;
}> = ({ avatarId, size = 44, className = '' }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {avatarId === 'lion' ? (
        <g>
          <circle cx="32" cy="32" r="24" fill="#9A3412" />
          <circle cx="32" cy="32" r="17" fill="#FBBF24" />
          <circle cx="26" cy="29" r="2.5" fill="#0F172A" />
          <circle cx="38" cy="29" r="2.5" fill="#0F172A" />
          <polygon points="32,36 28,32 36,32" fill="#78350F" />
        </g>
      ) : avatarId === 'owl' ? (
        <g>
          <circle cx="32" cy="34" r="22" fill="#7C3AED" />
          <circle cx="24" cy="30" r="8" fill="#FFFFFF" />
          <circle cx="40" cy="30" r="8" fill="#FFFFFF" />
          <circle cx="24" cy="30" r="3.5" fill="#0F172A" />
          <circle cx="40" cy="30" r="3.5" fill="#0F172A" />
          <polygon points="32,40 28,34 36,34" fill="#F59E0B" />
        </g>
      ) : avatarId === 'dolphin' ? (
        <g>
          <circle cx="32" cy="32" r="22" fill="#0284C7" />
          <path d="M16 38 Q26 16 44 26 Q52 32 46 42 Q34 36 22 44 Z" fill="#BAE6FD" />
          <circle cx="39" cy="28" r="2.5" fill="#0F172A" />
        </g>
      ) : avatarId === 'panda' ? (
        <g>
          <circle cx="19" cy="18" r="7" fill="#0F172A" />
          <circle cx="45" cy="18" r="7" fill="#0F172A" />
          <circle cx="32" cy="34" r="20" fill="#F8FAFC" />
          <ellipse cx="24" cy="31" rx="5" ry="6" fill="#0F172A" />
          <ellipse cx="40" cy="31" rx="5" ry="6" fill="#0F172A" />
          <circle cx="24" cy="30" r="2" fill="#FFFFFF" />
          <circle cx="40" cy="30" r="2" fill="#FFFFFF" />
          <ellipse cx="32" cy="39" rx="3.5" ry="2.5" fill="#0F172A" />
        </g>
      ) : avatarId === 'falcon' ? (
        <g>
          <circle cx="32" cy="32" r="22" fill="#0F766E" />
          <path d="M14 40 L32 16 L50 40 L32 34 Z" fill="#FDE047" />
          <circle cx="32" cy="28" r="3" fill="#0F172A" />
        </g>
      ) : (
        <g>
          <polygon points="20,28 13,9 29,19" fill="#EA580C" />
          <polygon points="44,28 51,9 35,19" fill="#EA580C" />
          <circle cx="32" cy="36" r="19" fill="#EA580C" />
          <path d="M16 39 Q24 50 32 46 Q40 50 48 39 Q40 33 32 35 Q24 33 16 39 Z" fill="#FFFFFF" />
          <circle cx="25" cy="34" r="2.5" fill="#0F172A" />
          <circle cx="39" cy="34" r="2.5" fill="#0F172A" />
          <polygon points="32,42 29,39 35,39" fill="#0F172A" />
        </g>
      )}
    </svg>
  );
};

export interface KidsAvatarSpec {
  mascotId: KidsMascotId;
  avatarId: KidsAvatarId;
  bgStart: string;
  bgEnd: string;
  ringColor: string;
  initial: string;
}

const AVATAR_PALETTES = [
  { bgStart: '#F59E0B', bgEnd: '#B45309', ringColor: '#FDE68A' },
  { bgStart: '#38BDF8', bgEnd: '#0369A1', ringColor: '#BAE6FD' },
  { bgStart: '#EC4899', bgEnd: '#9D174D', ringColor: '#FBCFE8' },
  { bgStart: '#10B981', bgEnd: '#047857', ringColor: '#A7F3D0' },
  { bgStart: '#8B5CF6', bgEnd: '#5B21B6', ringColor: '#DDD6FE' },
  { bgStart: '#FB923C', bgEnd: '#C2410C', ringColor: '#FED7AA' },
];

const VALID_AVATAR_IDS: KidsAvatarId[] = ['fennec', 'lion', 'owl', 'dolphin', 'panda', 'falcon'];

export function generateKidsAvatarSpec(name: string, fallbackAvatarId = 'fennec'): KidsAvatarSpec {
  const clean = (name || 'Peque').trim();
  const lower = clean.toLowerCase();
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }

  let mascotId: KidsMascotId = (['fox', 'dino', 'bot', 'cat'] as KidsMascotId[])[hash % 4];
  let avatarId: KidsAvatarId = VALID_AVATAR_IDS.includes(fallbackAvatarId as KidsAvatarId)
    ? (fallbackAvatarId as KidsAvatarId)
    : 'fennec';

  if (/leo|leon|simba|rey/.test(lower)) {
    mascotId = 'cat';
    avatarId = 'lion';
  } else if (/dino|rex|dragon/.test(lower)) {
    mascotId = 'dino';
    avatarId = 'falcon';
  } else if (/bot|robo|max|neo/.test(lower)) {
    mascotId = 'bot';
    avatarId = 'owl';
  } else if (/zor|fox|luna|mia/.test(lower)) {
    mascotId = 'fox';
    avatarId = 'fennec';
  }

  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  return {
    mascotId,
    avatarId,
    ...palette,
    initial: clean.charAt(0).toUpperCase() || 'R',
  };
}

export const KidsUniqueNameAvatarSvg: React.FC<{
  name: string;
  fallbackAvatarId?: string;
  size?: number;
  className?: string;
}> = ({ name, fallbackAvatarId = 'fennec', size = 44, className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const spec = generateKidsAvatarSpec(name, fallbackAvatarId);

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 inline-flex items-center justify-center ${className}`}
      aria-label={name || 'Avatar Kids'}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id={`avbg-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={spec.bgStart} />
            <stop offset="100%" stopColor={spec.bgEnd} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#avbg-${uid})`} stroke={spec.ringColor} strokeWidth="5" />
        <circle cx="32" cy="28" r="10" fill="#FFFFFF" opacity="0.16" />
        <g transform="translate(18, 18)">
          <KidsAvatarArtworkSvg avatarId={spec.avatarId} size={64} />
        </g>
        <circle cx="77" cy="77" r="16" fill="#0F172A" stroke={spec.ringColor} strokeWidth="3" />
        <text
          x="77"
          y="83"
          textAnchor="middle"
          fontSize="16"
          fontWeight="900"
          fill="#FFFFFF"
          fontFamily="Fredoka, system-ui, sans-serif"
        >
          {spec.initial}
        </text>
      </svg>
    </div>
  );
};
