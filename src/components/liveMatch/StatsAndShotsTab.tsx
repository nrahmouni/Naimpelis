import React from 'react';
import { Target, X } from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballMatchShotItem,
  FootballMatchStatItem,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import type { StatsPeriod } from './matchCenterUtils';

interface StatsAndShotsTabProps {
  lang: AppLanguage;
  details: FootballMatchDetails | null;
  resolvedState: 'live' | 'upcoming' | 'finished';
  statsPeriod: StatsPeriod;
  setStatsPeriod: (period: StatsPeriod) => void;
  hasFirstHalfStats: boolean;
  hasSecondHalfStats: boolean;
  possessionStat?: FootballMatchStatItem;
  otherStats: FootballMatchStatItem[];
  shotsTotalStat?: FootballMatchStatItem;
  shotsOnTargetStat?: FootballMatchStatItem;
  shotFilter: 'all' | 'onTarget';
  setShotFilter: (filter: 'all' | 'onTarget') => void;
  visibleShots: FootballMatchShotItem[];
  shotsWithGoalFrame: FootballMatchShotItem[];
  selectedShot: FootballMatchShotItem | null;
  setSelectedShot: (shot: FootballMatchShotItem | null) => void;
}

export const StatsAndShotsTab: React.FC<StatsAndShotsTabProps> = ({
  lang,
  details,
  resolvedState,
  statsPeriod,
  setStatsPeriod,
  hasFirstHalfStats,
  hasSecondHalfStats,
  possessionStat,
  otherStats,
  shotsTotalStat,
  shotsOnTargetStat,
  shotFilter,
  setShotFilter,
  visibleShots,
  shotsWithGoalFrame,
  selectedShot,
  setSelectedShot,
}) => {
  return (
    <div className="space-y-4">
      {/* Period Filter */}
      <div className="grid grid-cols-3 rounded-full bg-[#1C202B] p-1 border border-white/[0.07] max-w-sm">
        {(
          [
            { id: 'all', label: pickLang(lang, { es: 'TODOS', ca: 'TOTS', en: 'ALL' }), enabled: true },
            { id: 'firstHalf', label: pickLang(lang, { es: '1.ª', ca: '1a', en: '1st' }), enabled: hasFirstHalfStats },
            { id: 'secondHalf', label: pickLang(lang, { es: '2.ª', ca: '2a', en: '2nd' }), enabled: hasSecondHalfStats },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!p.enabled}
            onClick={() => {
              triggerHaptic('light');
              setStatsPeriod(p.id);
            }}
            className={`min-h-10 rounded-full text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
              statsPeriod === p.id
                ? 'bg-[#9146FF] text-white'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Card: Match Summary */}
        <div className="rounded-2xl bg-[#1A1E29] border border-white/[0.07] p-4 space-y-3.5">
          <h4 className="font-display font-bold text-sm text-white text-center">
            {pickLang(lang, {
              es: 'Resumen del partido',
              ca: 'Resum del partit',
              en: 'Match summary',
            })}
          </h4>

          {possessionStat && (
            <div className="space-y-1.5 pb-1">
              <div className="flex items-center justify-between text-xs">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-white font-mono font-extrabold tabular-nums">
                  {possessionStat.homeValue}
                </span>
                <span className="font-semibold text-zinc-200">
                  {possessionStat.label}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-400 text-[#0B0D14] font-mono font-extrabold tabular-nums">
                  {possessionStat.awayValue}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/[0.08] overflow-hidden flex gap-0.5">
                <div
                  style={{ width: `${possessionStat.homePct}%` }}
                  className="bg-emerald-500 h-full rounded-l-full transition-all duration-500"
                />
                <div
                  style={{ width: `${possessionStat.awayPct}%` }}
                  className="bg-indigo-400 h-full rounded-r-full transition-all duration-500"
                />
              </div>
            </div>
          )}

          {otherStats.length > 0 ? (
            <div className="space-y-3">
              {otherStats.slice(0, 14).map((st) => (
                <div key={st.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold tabular-nums text-white">
                      {st.homeValue}
                    </span>
                    <span className="text-zinc-300 font-medium text-center px-2">
                      {st.label}
                    </span>
                    <span className="font-mono font-bold tabular-nums text-white">
                      {st.awayValue}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 h-1.5">
                    <div className="bg-white/[0.07] rounded-l-full overflow-hidden flex justify-end">
                      <div
                        style={{ width: `${st.homePct}%` }}
                        className="bg-emerald-500 h-full rounded-l-full transition-all duration-500"
                      />
                    </div>
                    <div className="bg-white/[0.07] rounded-r-full overflow-hidden flex justify-start">
                      <div
                        style={{ width: `${st.awayPct}%` }}
                        className="bg-indigo-400 h-full rounded-r-full transition-all duration-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 text-center py-6">
              {resolvedState === 'upcoming'
                ? pickLang(lang, {
                    es: 'Las estadísticas comenzarán en tiempo real cuando arranque el partido.',
                    ca: 'Les estadístiques començaran en temps real quan arrenqui el partit.',
                    en: 'Live statistics will start as soon as the match kicks off.',
                  })
                : pickLang(lang, {
                    es: 'Esperando actualización de estadísticas oficiales para esta competición.',
                    ca: 'Esperant actualització d’estadístiques oficials per a aquesta competició.',
                    en: 'Waiting for official match stats update.',
                  })}
            </p>
          )}
        </div>

        {/* Right Card: Shots + Shot Map + Goal Frame */}
        <div className="rounded-2xl bg-[#1A1E29] border border-white/[0.07] p-4 space-y-3.5">
          <h4 className="font-display font-bold text-sm text-white text-center">
            {pickLang(lang, { es: 'Tiros', ca: 'Xuts', en: 'Shots' })}
          </h4>

          {(shotsTotalStat || shotsOnTargetStat) && (
            <div className="space-y-2.5">
              {[shotsTotalStat, shotsOnTargetStat].filter(Boolean).map((st) => (
                <div key={st!.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold tabular-nums text-white">
                      {st!.homeValue}
                    </span>
                    <span className="text-zinc-300">{st!.label}</span>
                    <span className="font-mono font-bold tabular-nums text-white">
                      {st!.awayValue}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 h-1.5">
                    <div className="bg-white/[0.07] rounded-l-full overflow-hidden flex justify-end">
                      <div
                        style={{ width: `${st!.homePct}%` }}
                        className="bg-emerald-500 h-full rounded-l-full"
                      />
                    </div>
                    <div className="bg-white/[0.07] rounded-r-full overflow-hidden flex justify-start">
                      <div
                        style={{ width: `${st!.awayPct}%` }}
                        className="bg-indigo-400 h-full rounded-r-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All | On target */}
          <div className="flex items-center gap-2 pt-1">
            {(
              [
                {
                  id: 'all',
                  label: `${pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' })} (${details?.shotsMap?.length || 0})`,
                },
                {
                  id: 'onTarget',
                  label: `${pickLang(lang, {
                    es: 'Tiros a puerta',
                    ca: 'Xuts a porteria',
                    en: 'On target',
                  })} (${(details?.shotsMap || []).filter((s) => s.onTarget).length})`,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setShotFilter(f.id)}
                className={`min-h-10 px-3.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                  shotFilter === f.id
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-[#252A37] text-zinc-300 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Tactical Horizontal Shot Map */}
          <div className="relative w-full h-44 sm:h-48 rounded-xl bg-[#3D5942] border border-white/20 overflow-hidden shadow-inner">
            <div className="absolute inset-2 border border-white/40 rounded pointer-events-none" />
            <div className="absolute left-1/2 top-2 bottom-2 w-[1px] bg-white/40 pointer-events-none" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border border-white/40 rounded-full pointer-events-none" />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-24 border-r border-y border-white/40 pointer-events-none" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-24 border-l border-y border-white/40 pointer-events-none" />

            {visibleShots.length > 0 ? (
              visibleShots.map((sh, sIdx) => (
                <button
                  key={sh.id || sIdx}
                  type="button"
                  onClick={() => setSelectedShot(sh)}
                  aria-label={`${sh.minute} · ${sh.player}${sh.xG ? ` · xG ${sh.xG}` : ''}`}
                  title={`${sh.minute} · ${sh.player}${sh.xG ? ` · xG ${sh.xG}` : ''}`}
                  style={{ left: `${sh.x}%`, top: `${sh.y}%` }}
                  className={`absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 -translate-y-1/2 border transition-transform hover:scale-125 cursor-pointer ${
                    sh.isGoal
                      ? 'bg-emerald-400 border-white ring-2 ring-emerald-300/70 shadow-lg z-20'
                      : sh.onTarget
                      ? 'bg-white border-emerald-600 z-10'
                      : 'bg-zinc-900/75 border-white/75'
                  }`}
                />
              ))
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-white/80 bg-black/25">
                {pickLang(lang, {
                  es: 'Sin disparos registrados aún en el campo',
                  ca: 'Sense xuts registrats encara al camp',
                  en: 'No shots recorded on the pitch yet',
                })}
              </div>
            )}
          </div>

          {/* Selected Shot Tooltip */}
          {selectedShot && (
            <div className="px-3 py-2 rounded-xl bg-[#242833] border border-white/[0.1] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-mono font-bold text-emerald-400">
                  {selectedShot.minute}
                </span>
                <span className="font-semibold text-white truncate">
                  {selectedShot.player}
                </span>
                <span className="text-zinc-400">
                  ·{' '}
                  {selectedShot.isGoal
                    ? pickLang(lang, { es: 'GOL', ca: 'GOL', en: 'GOAL' })
                    : selectedShot.onTarget
                    ? pickLang(lang, { es: 'A puerta', ca: 'A porteria', en: 'On target' })
                    : pickLang(lang, { es: 'Fuera/Bloq.', ca: 'Fora/Bloq.', en: 'Off target' })}
                  {selectedShot.xG != null ? ` · xG ${selectedShot.xG}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShot(null)}
                aria-label={pickLang(lang, {
                  es: 'Cerrar detalle de disparo',
                  ca: 'Tancar detall de xut',
                  en: 'Close shot details',
                })}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Frontal Goal Cage View */}
          {shotsWithGoalFrame.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>
                  {pickLang(lang, {
                    es: 'Precisión en Portería',
                    ca: 'Precisió a Porteria',
                    en: 'Shot Placement',
                  })}
                </span>
                <span className="text-emerald-400">
                  ● {pickLang(lang, { es: 'Gol', ca: 'Gol', en: 'Goal' })} · ○{' '}
                  {pickLang(lang, { es: 'A puerta', ca: 'A porteria', en: 'On target' })}
                </span>
              </div>
              <div className="relative w-full h-24 rounded-xl bg-[#10131A] border border-white/[0.08] overflow-hidden flex items-end justify-center px-6 pb-2">
                <div className="relative w-full max-w-[240px] h-16 border-t-2 border-x-2 border-white/70 rounded-t-sm bg-white/[0.02]">
                  {shotsWithGoalFrame.map((sh, idx) => {
                    const gx = Math.max(2, Math.min(98, (sh.onGoalShot!.x / 2) * 100));
                    const gy = Math.max(4, Math.min(96, (sh.onGoalShot!.y / 0.65) * 100));
                    return (
                      <span
                        key={`gf-${sh.id || idx}`}
                        title={`${sh.minute} · ${sh.player}`}
                        style={{ left: `${gx}%`, bottom: `${gy}%` }}
                        className={`absolute w-3 h-3 rounded-full -translate-x-1/2 translate-y-1/2 border ${
                          sh.isGoal
                            ? 'bg-emerald-400 border-white ring-2 ring-emerald-400/50'
                            : sh.onTarget
                            ? 'bg-white border-emerald-500'
                            : 'bg-zinc-500 border-white/60 opacity-75'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
