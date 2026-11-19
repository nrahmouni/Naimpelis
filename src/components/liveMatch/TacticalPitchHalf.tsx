import React, { useMemo } from 'react';
import type {
  AppLanguage,
  FootballMatchLineupPlayer,
  FootballMatchLineupTeam,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import {
  computeFallbackPitchCoords,
  getPlayerMetricText,
  getRatingBadgeClasses,
  LineupMetric,
  PlayerAvatarImg,
} from './matchCenterUtils';

export const TacticalPitchHalf: React.FC<{
  lineup: FootballMatchLineupTeam;
  side: 'home' | 'away';
  metric: LineupMetric;
  lang: AppLanguage;
  onSelectPlayer: (p: FootballMatchLineupPlayer) => void;
}> = ({ lineup, side, metric, lang, onSelectPlayer }) => {
  const starters = lineup.starters || [];
  const fallbackCoords = useMemo(
    () => computeFallbackPitchCoords(starters, lineup.formation),
    [starters, lineup.formation]
  );

  return (
    <div className="space-y-2.5">
      {/* Team Header Strip matching Sofascore screenshots */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-[#1A1E29] border border-white/[0.08]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-display font-bold text-sm text-white truncate">
            {lineup.teamName}
          </span>
          {lineup.avgRating && (
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-mono font-extrabold tabular-nums ${getRatingBadgeClasses(
                lineup.avgRating
              )}`}
            >
              {lineup.avgRating}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-300">
          {lineup.totalMarketValue && (
            <span className="text-[11px] text-zinc-400">
              XI: <strong className="text-white font-mono">{lineup.totalMarketValue}</strong>
            </span>
          )}
          <span className="px-2 py-0.5 rounded-md bg-white/[0.08] font-mono font-bold text-white">
            {lineup.formation || '4-3-3'}
          </span>
        </div>
      </div>

      {/* Vertical Tactical Pitch */}
      <div
        className={`relative w-full h-[390px] sm:h-[430px] rounded-2xl overflow-hidden border border-white/[0.1] shadow-inner select-none ${
          side === 'home'
            ? 'bg-gradient-to-b from-[#16271D] via-[#132018] to-[#101816]'
            : 'bg-gradient-to-b from-[#101816] via-[#131C26] to-[#13202B]'
        }`}
      >
        {/* Regulation Pitch Lines */}
        <div className="absolute inset-2.5 border border-white/20 rounded-lg pointer-events-none" />
        {/* Penalty Box */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-[54%] h-[18%] border-x border-white/20 pointer-events-none ${
            side === 'home' ? 'top-2.5 border-b' : 'bottom-2.5 border-t'
          }`}
        />
        {/* 6-yard box */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-[26%] h-[7%] border-x border-white/20 pointer-events-none ${
            side === 'home' ? 'top-2.5 border-b' : 'bottom-2.5 border-t'
          }`}
        />
        {/* Halfway circle arc */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-24 h-12 border-white/20 pointer-events-none ${
            side === 'home'
              ? 'bottom-2.5 border-t border-x rounded-t-full'
              : 'top-2.5 border-b border-x rounded-b-full'
          }`}
        />

        {/* Players Positioned by Real FotMob Formation Coordinates */}
        {starters.map((player, idx) => {
          const rawCoord = player.layout || fallbackCoords[idx] || { x: 0.5, y: 0.5 };
          const posX = rawCoord.x * 100;
          const posY = side === 'home' ? rawCoord.y * 100 : (1 - rawCoord.y) * 100;
          const metricBadge = getPlayerMetricText(player, metric, lang);

          return (
            <button
              key={`${player.id}-${idx}`}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onSelectPlayer(player);
              }}
              style={{
                left: `${Math.max(8, Math.min(92, posX))}%`,
                top: `${Math.max(9, Math.min(89, posY))}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer focus:outline-none z-10 max-w-[78px]"
            >
              <div className="relative">
                <PlayerAvatarImg
                  src={player.photoUrl}
                  jersey={player.jersey}
                  name={player.name}
                  sizeClass="w-9 h-9 sm:w-10 sm:h-10 group-hover:scale-110 transition-transform"
                />
                {/* Goal / Assist / Card Micro-Badges */}
                {player.goals ? (
                  <span className="absolute -top-1 -right-1.5 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black shadow">
                    ⚽{player.goals > 1 ? player.goals : ''}
                  </span>
                ) : null}
                {player.assists ? (
                  <span className="absolute -top-1 -left-1.5 px-1 rounded-full bg-sky-500 text-white text-[9px] font-black shadow">
                    👟
                  </span>
                ) : null}
                {player.redCard ? (
                  <span className="absolute bottom-0 -right-1 w-2.5 h-3.5 rounded-[2px] bg-rose-500 border border-black shadow" />
                ) : player.yellowCard ? (
                  <span className="absolute bottom-0 -right-1 w-2.5 h-3.5 rounded-[2px] bg-amber-400 border border-black shadow" />
                ) : null}
                {player.subOutMinute ? (
                  <span className="absolute bottom-0 -left-1.5 px-1 rounded bg-black/80 text-rose-300 text-[8px] font-mono">
                    ↓{player.subOutMinute}
                  </span>
                ) : null}
              </div>

              {/* Dynamic Metric Badge (Rating / Market Value / Club / Age / Height) */}
              <span
                className={`-mt-1.5 px-1.5 py-[1px] rounded text-[10px] font-mono font-extrabold tabular-nums shadow border border-black/40 whitespace-nowrap ${
                  metricBadge.isRating
                    ? getRatingBadgeClasses(metricBadge.text)
                    : 'bg-[#0C0E14]/95 text-white border-white/25'
                }`}
              >
                {metricBadge.text}
              </span>

              {/* Jersey + Name */}
              <span className="mt-0.5 px-1 rounded bg-black/55 text-[10px] font-semibold text-white truncate max-w-[78px] leading-tight">
                <span className="text-zinc-400 font-mono mr-0.5">{player.jersey}</span>
                {player.isCaptain ? <span className="text-amber-300 mr-0.5">(c)</span> : null}
                {player.shortName || player.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Coach + Substitutes */}
      <div className="rounded-2xl bg-[#1A1E29] border border-white/[0.07] p-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs border-b border-white/[0.06] pb-2">
          <span className="font-bold uppercase tracking-wider text-zinc-400 text-[10px]">
            {pickLang(lang, { es: 'Suplentes', ca: 'Suplents', en: 'Substitutes' })} ({lineup.substitutes.length})
          </span>
          {lineup.coach && (
            <span className="text-zinc-300 text-[11px]">
              {pickLang(lang, { es: 'DT:', ca: 'Entr.:', en: 'Coach:' })}{' '}
              <strong className="text-white">{lineup.coach}</strong>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
          {lineup.substitutes.map((sub, idx) => {
            const metricBadge = getPlayerMetricText(sub, metric, lang);
            return (
              <button
                key={`${sub.id}-${idx}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSelectPlayer(sub);
                }}
                className="p-2 rounded-xl bg-[#242833] hover:bg-[#2C313E] flex items-center justify-between gap-2 text-left text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PlayerAvatarImg
                    src={sub.photoUrl}
                    jersey={sub.jersey}
                    name={sub.name}
                    sizeClass="w-7 h-7"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">
                      <span className="text-zinc-400 font-mono mr-1">{sub.jersey}</span>
                      {sub.name}
                    </div>
                    {sub.subInMinute && (
                      <div className="text-[10px] text-emerald-400 font-mono">
                        ↑ {pickLang(lang, { es: 'Entró', ca: 'Entrà', en: 'Subbed in' })} {sub.subInMinute}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                    metricBadge.isRating
                      ? getRatingBadgeClasses(metricBadge.text)
                      : 'bg-black/40 text-zinc-200 border border-white/10'
                  }`}
                >
                  {metricBadge.text}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
