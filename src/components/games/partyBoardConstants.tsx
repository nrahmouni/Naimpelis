import React, { useEffect, useState } from 'react';
import { parchisGlobalSquare, type PartyColor } from '../../shared/partyGames';
import { triggerHaptic } from '../../utils/haptics';

export type PartyOnlineAction =
  | 'roll_dice'
  | 'move_piece'
  | 'play_card'
  | 'draw_card'
  | 'pass_turn'
  | 'call_uno'
  | 'catch_uno'
  | 'accept_wild4'
  | 'challenge_wild4'
  | 'join_seat'
  | 'start_match'
  | 'rematch';

export interface BoardBurstEvent {
  id: number;
  row: number;
  col: number;
  kind: 'capture' | 'goal';
  colorHex: string;
}

export const PARTY_COLOR_STYLES: Record<
  PartyColor,
  {
    labelEs: string;
    labelCa: string;
    labelEn: string;
    hex: string;
    darkHex: string;
    bgClass: string;
    borderClass: string;
    badgeClass: string;
    ringClass: string;
  }
> = {
  red: {
    labelEs: 'Rojo',
    labelCa: 'Vermell',
    labelEn: 'Red',
    hex: '#ef4444',
    darkHex: '#991b1b',
    bgClass: 'bg-red-500',
    borderClass: 'border-red-400',
    badgeClass: 'bg-red-500/20 text-red-200 border-red-400/45',
    ringClass: 'ring-red-400',
  },
  blue: {
    labelEs: 'Azul',
    labelCa: 'Blau',
    labelEn: 'Blue',
    hex: '#3b82f6',
    darkHex: '#1e3a8a',
    bgClass: 'bg-blue-500',
    borderClass: 'border-blue-400',
    badgeClass: 'bg-blue-500/20 text-blue-200 border-blue-400/45',
    ringClass: 'ring-blue-400',
  },
  yellow: {
    labelEs: 'Amarillo',
    labelCa: 'Groc',
    labelEn: 'Yellow',
    hex: '#eab308',
    darkHex: '#854d0e',
    bgClass: 'bg-yellow-500',
    borderClass: 'border-yellow-300',
    badgeClass: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/45',
    ringClass: 'ring-yellow-300',
  },
  green: {
    labelEs: 'Verde',
    labelCa: 'Verd',
    labelEn: 'Green',
    hex: '#22c55e',
    darkHex: '#166534',
    bgClass: 'bg-emerald-500',
    borderClass: 'border-emerald-300',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
    ringClass: 'ring-emerald-300',
  },
};

export const PARCHIS_68_COORDS: Array<[number, number]> = [
  [18, 10], [17, 10], [16, 10], [15, 10], [14, 10], [13, 10], [12, 10], [11, 10],
  [10, 11], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16], [10, 17], [10, 18],
  [9, 18],
  [8, 18], [8, 17], [8, 16], [8, 15], [8, 14], [8, 13], [8, 12], [8, 11],
  [7, 10], [6, 10], [5, 10], [4, 10], [3, 10], [2, 10], [1, 10], [0, 10],
  [0, 9],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8],
  [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [9, 0],
  [10, 0], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7],
  [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 8], [18, 8],
  [18, 9],
];

export const PARCHIS_HOME_COLUMNS: Record<PartyColor, Array<[number, number]>> = {
  red: [[1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9]],
  blue: [[9, 17], [9, 16], [9, 15], [9, 14], [9, 13], [9, 12], [9, 11]],
  yellow: [[17, 9], [16, 9], [15, 9], [14, 9], [13, 9], [12, 9], [11, 9]],
  green: [[9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7]],
};

export const PARCHIS_YARD_SLOTS: Record<PartyColor, Array<[number, number]>> = {
  red: [[2.5, 2.5], [2.5, 4.5], [4.5, 2.5], [4.5, 4.5]],
  blue: [[2.5, 13.5], [2.5, 15.5], [4.5, 13.5], [4.5, 15.5]],
  yellow: [[13.5, 13.5], [13.5, 15.5], [15.5, 13.5], [15.5, 15.5]],
  green: [[13.5, 2.5], [13.5, 4.5], [15.5, 2.5], [15.5, 4.5]],
};

export const PARCHIS_GOAL_SLOTS: Record<PartyColor, [number, number]> = {
  red: [8.2, 9],
  blue: [9, 9.8],
  yellow: [9.8, 9],
  green: [9, 8.2],
};

export function getParchisPieceCoord(
  color: PartyColor,
  pieceId: number,
  progress: number
): [number, number] {
  if (progress < 0) return PARCHIS_YARD_SLOTS[color][pieceId % 4];
  if (progress >= 71) return PARCHIS_GOAL_SLOTS[color];
  if (progress >= 64) return PARCHIS_HOME_COLUMNS[color][Math.min(6, progress - 64)];
  const sq = parchisGlobalSquare(color, progress);
  if (sq !== null && PARCHIS_68_COORDS[sq]) return PARCHIS_68_COORDS[sq];
  return PARCHIS_YARD_SLOTS[color][0];
}

const DICE_PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export const DiceFacePips: React.FC<{ value: number; className?: string; foil?: boolean }> = ({
  value,
  className = '',
  foil = false,
}) => {
  const active = DICE_PIP_POSITIONS[value] || DICE_PIP_POSITIONS[1];
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 gap-[3px] p-2 w-full h-full rounded-[11px] bg-gradient-to-br from-[#FFFDF7] via-[#F2E9D5] to-[#D4C5A3] border border-white/85 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_-2px_4px_rgba(0,0,0,0.22)] ${
        foil ? 'card-foil-shimmer' : ''
      } ${className}`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="flex items-center justify-center">
          {active.includes(i) && (
            <span
              className={`rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.75)] ${
                value === 1 ? 'bg-rose-600 w-[9px] h-[9px]' : 'bg-zinc-900 w-[6.5px] h-[6.5px]'
              }`}
            />
          )}
        </span>
      ))}
    </div>
  );
};

export const Interactive3DDice: React.FC<{
  value: number | null;
  rollingKey: number;
  accentHex?: string;
  canRoll: boolean;
  onRoll: () => void;
}> = ({ value, rollingKey, accentHex = '#9146FF', canRoll, onRoll }) => {
  const [tumbling, setTumbling] = useState(false);

  useEffect(() => {
    if (rollingKey === 0) return;
    setTumbling(true);
    const id = window.setTimeout(() => setTumbling(false), 500);
    return () => window.clearTimeout(id);
  }, [rollingKey]);

  const faceVal = value && value >= 1 && value <= 6 ? value : 5;
  const isSix = faceVal === 6 && !tumbling;

  return (
    <button
      type="button"
      disabled={!canRoll}
      onClick={() => {
        if (!canRoll) return;
        triggerHaptic('medium');
        onRoll();
      }}
      aria-label="Dado 3D · Tocar para tirar"
      className={`nc-dice-scene relative w-14 h-14 p-1 rounded-2xl shrink-0 transition-all ${
        canRoll
          ? 'cursor-pointer hover:scale-110 active:scale-95 ring-2 ring-amber-300/90 animate-pulse'
          : 'cursor-default opacity-90'
      } ${isSix ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.85)]' : ''}`}
      style={{
        boxShadow: isSix
          ? '0 0 28px rgba(251,191,36,0.85), 0 0 10px rgba(244,63,94,0.6)'
          : canRoll
          ? `0 0 24px ${accentHex}99`
          : '0 4px 12px rgba(0,0,0,0.5)',
        backgroundColor: isSix ? 'rgba(245,158,11,0.25)' : canRoll ? `${accentHex}38` : `${accentHex}20`,
      }}
    >
      {isSix && (
        <>
          <span className="absolute -top-1.5 -right-1 text-xs animate-bounce pointer-events-none z-20">✨</span>
          <span className="absolute -bottom-1 -left-1 text-xs animate-pulse pointer-events-none z-20">🔥</span>
        </>
      )}
      <div className={`nc-dice-cube ${tumbling ? 'nc-dice-tumbling' : ''}`}>
        <div className="absolute inset-0" style={{ transform: 'translateZ(24px)' }}>
          <DiceFacePips value={faceVal} foil={canRoll || isSix} />
        </div>
        <div
          className="absolute inset-0 opacity-75"
          style={{ transform: 'rotateY(90deg) translateZ(24px)' }}
        >
          <DiceFacePips value={((faceVal + 1) % 6) + 1} />
        </div>
        <div
          className="absolute inset-0 opacity-75"
          style={{ transform: 'rotateX(90deg) translateZ(24px)' }}
        >
          <DiceFacePips value={((faceVal + 3) % 6) + 1} />
        </div>
      </div>
    </button>
  );
};
