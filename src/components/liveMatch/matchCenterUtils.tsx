import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import type { AppLanguage, FootballMatchLineupPlayer } from '../../types';
import { pickLang } from '../../utils/i18n';

export type MatchCenterTab = 'commentary' | 'lineups' | 'stats' | 'events' | 'standings';
export type LineupMetric = 'rating' | 'club' | 'age' | 'marketValue' | 'height';
export type StatsPeriod = 'all' | 'firstHalf' | 'secondHalf';

export function getRatingBadgeClasses(ratingStr?: string): string {
  const n = ratingStr ? parseFloat(ratingStr) : NaN;
  if (!Number.isFinite(n)) return 'bg-zinc-700 text-zinc-200';
  if (n >= 8.0) return 'bg-sky-500 text-white';
  if (n >= 7.0) return 'bg-emerald-500 text-white';
  if (n >= 6.5) return 'bg-lime-500 text-[#0B1205]';
  if (n >= 6.0) return 'bg-amber-400 text-[#140F02]';
  return 'bg-rose-500 text-white';
}

export function getPlayerMetricText(
  player: FootballMatchLineupPlayer,
  metric: LineupMetric,
  lang: AppLanguage
): { text: string; isRating: boolean } {
  switch (metric) {
    case 'club':
      return {
        text: player.club || '—',
        isRating: false,
      };
    case 'age':
      return {
        text: player.age
          ? `${player.age} ${pickLang(lang, { es: 'años', ca: 'anys', en: 'yrs' })}`
          : '—',
        isRating: false,
      };
    case 'marketValue':
      return {
        text: player.marketValue || '—',
        isRating: false,
      };
    case 'height':
      return {
        text: player.height || '—',
        isRating: false,
      };
    case 'rating':
    default:
      return {
        text: player.rating || player.position || '—',
        isRating: Boolean(player.rating),
      };
  }
}

export function computeFallbackPitchCoords(
  starters: FootballMatchLineupPlayer[],
  formationStr?: string
): { x: number; y: number }[] {
  const parsedRows = (formationStr || '4-3-3')
    .split('-')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const rows = [1, ...(parsedRows.length > 0 ? parsedRows : [4, 3, 3])];
  const coords: { x: number; y: number }[] = [];
  let cursor = 0;
  const totalLines = rows.length;
  for (let r = 0; r < totalLines; r++) {
    const count = rows[r];
    const y = 0.1 + (r / Math.max(1, totalLines - 1)) * 0.78;
    for (let c = 0; c < count; c++) {
      if (cursor >= starters.length) break;
      const x = count === 1 ? 0.5 : 0.14 + (c / Math.max(1, count - 1)) * 0.72;
      coords.push({ x, y });
      cursor++;
    }
  }
  while (coords.length < starters.length) {
    coords.push({ x: 0.5, y: 0.55 });
  }
  return coords;
}

export const PlayerAvatarImg: React.FC<{
  src?: string;
  jersey: string;
  name: string;
  sizeClass?: string;
}> = ({ src, jersey, name, sizeClass = 'w-10 h-10 sm:w-11 sm:h-11' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-[#1C212D] border-2 border-white/30 flex items-center justify-center font-mono font-bold text-xs text-white shadow-md`}
        title={name}
      >
        {jersey}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-full object-cover bg-[#1C212D] border-2 border-white/40 shadow-md`}
    />
  );
};

export const ClubLogoImg: React.FC<{
  src?: string;
  alt: string;
  shortCode?: string;
  size?: string;
}> = ({ src, alt, shortCode, size = 'w-8 h-8' }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className={`${size} rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0`}
      >
        {shortCode?.slice(0, 3) || <Shield className="w-4 h-4 text-zinc-400" />}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${size} object-contain shrink-0`}
    />
  );
};
