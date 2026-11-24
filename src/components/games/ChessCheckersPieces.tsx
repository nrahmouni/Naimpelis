import React from 'react';
import { Crown } from 'lucide-react';
import type { BoardClockMinutes, BoardSide } from '../../types';

export const BOARD_CLOCK_OPTIONS: BoardClockMinutes[] = [0, 3, 5, 10];
export const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function formatBoardClockMs(ms: number): string {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const StauntonChessPiece: React.FC<{
  side: BoardSide;
  kind: string;
  theme?: 'classic' | 'neon';
}> = ({ side, kind, theme = 'classic' }) => {
  const isWhite = side === 'w';
  const uid = `${isWhite ? 'w' : 'b'}-${theme}`;

  let fill = isWhite ? `url(#chess-ivory-${uid})` : `url(#chess-obsidian-${uid})`;
  let stroke = isWhite ? '#292018' : '#E2E8F0';
  let detail = isWhite ? '#5C4D3C' : '#94A3B8';
  let dropShadow = 'drop-shadow-[0_4px_6px_rgba(0,0,0,0.72)]';

  if (theme === 'neon') {
    fill = isWhite ? `url(#chess-neon-cyan-${uid})` : `url(#chess-neon-magenta-${uid})`;
    stroke = isWhite ? '#A5F3FC' : '#FBCFE8';
    detail = isWhite ? '#0891B2' : '#C026D3';
    dropShadow = isWhite
      ? 'drop-shadow-[0_0_8px_rgba(6,182,212,0.85)]'
      : 'drop-shadow-[0_0_8px_rgba(217,70,239,0.85)]';
  }

  return (
    <svg
      viewBox="0 0 45 45"
      className={`w-[84%] h-[84%] select-none pointer-events-none transition-transform duration-150 ${dropShadow}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`chess-ivory-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F5EFE0" />
          <stop offset="100%" stopColor="#D9C9A5" />
        </linearGradient>
        <linearGradient id={`chess-obsidian-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3F4657" />
          <stop offset="50%" stopColor="#1E222D" />
          <stop offset="100%" stopColor="#0A0C10" />
        </linearGradient>
        <linearGradient id={`chess-neon-cyan-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A5F3FC" />
          <stop offset="48%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#083344" />
        </linearGradient>
        <linearGradient id={`chess-neon-magenta-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBCFE8" />
          <stop offset="48%" stopColor="#D946EF" />
          <stop offset="100%" stopColor="#4A044E" />
        </linearGradient>
      </defs>

      {kind === 'K' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" stroke={stroke} strokeWidth="2.1" fill="none" />
          <path
            d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"
            fill="none"
            stroke={detail}
            strokeWidth="1.25"
          />
        </g>
      )}

      {kind === 'Q' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="14" cy="9" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="22.5" cy="8" r="2.4" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="31" cy="9" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="39" cy="12" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <path
            d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
          />
          <path
            d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
          />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke={detail} strokeWidth="1.25" />
        </g>
      )}

      {kind === 'R' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path d="M34 14l-3 3H14l-3-3" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M31 17v12.5H14V17" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M11 14h23" fill="none" stroke={detail} strokeWidth="1.3" />
        </g>
      )}

      {kind === 'B' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <circle cx="22.5" cy="8" r="2.4" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" fill="none" stroke={detail} strokeWidth="1.35" />
        </g>
      )}

      {kind === 'N' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <circle cx="15" cy="15.5" r="1.2" fill={detail} />
          <path d="M9.5 25.5a0.7 0.9 30 1 1-1.2 1" stroke={detail} strokeWidth="1.2" fill="none" />
        </g>
      )}

      {kind === 'P' && (
        <path
          d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
};

export const CheckersToken3D: React.FC<{
  isWhite: boolean;
  isKing: boolean;
  animateCrownDrop?: boolean;
}> = ({ isWhite, isKing, animateCrownDrop = false }) => (
  <div
    className={`w-[82%] h-[82%] rounded-full relative flex items-center justify-center transition-transform duration-150 ${
      isWhite
        ? 'bg-gradient-to-b from-[#FFFFFF] via-[#EFE6D4] to-[#C4B390] border border-white shadow-[0_5px_12px_rgba(0,0,0,0.7),inset_0_2px_3px_rgba(255,255,255,0.95),inset_0_-3px_5px_rgba(0,0,0,0.28)]'
        : 'bg-gradient-to-b from-[#FB7185] via-[#E11D48] to-[#7F0E28] border border-rose-300/80 shadow-[0_5px_12px_rgba(0,0,0,0.8),inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-3px_5px_rgba(50,3,15,0.7)]'
    }`}
  >
    <div
      className={`w-[78%] h-[78%] rounded-full border flex items-center justify-center ${
        isWhite
          ? 'border-[#B2A07E]/75 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]'
          : 'border-rose-950/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.55)]'
      }`}
    >
      <div
        className={`w-[66%] h-[66%] rounded-full border flex items-center justify-center ${
          isWhite
            ? 'border-white/80 bg-gradient-to-t from-[#E2D4B6] to-[#FFFFFF]'
            : 'border-rose-300/40 bg-gradient-to-t from-[#9F1239] to-[#F43F5E]'
        } ${isKing ? 'ring-2 ring-amber-300/75 shadow-[0_0_12px_rgba(251,191,36,0.45)]' : ''}`}
      >
        {isKing && (
          <div className="relative w-full h-full flex items-center justify-center">
            <Crown
              className={`w-[76%] h-[76%] fill-amber-300 text-amber-500 drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] ${
                animateCrownDrop ? 'nc-crown-drop' : ''
              }`}
            />
            <span className="absolute top-0.5 right-0.5 text-amber-200 nc-crown-sparkle text-[9px]">
              ✨
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
);
