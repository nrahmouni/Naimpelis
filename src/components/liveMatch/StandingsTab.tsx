import React, { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballStandingRow,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { ClubLogoImg } from './matchCenterUtils';

interface StandingsTabProps {
  lang: AppLanguage;
  details: FootballMatchDetails | null;
  resolvedHomeTeam: string;
  resolvedAwayTeam: string;
  homeShort?: string;
  awayShort?: string;
  resolvedState: 'live' | 'upcoming' | 'finished';
}

type TableScope = 'all' | 'home' | 'away';

function matchesMatchTeam(row: FootballStandingRow, side: 'home' | 'away', fallbackName: string): boolean {
  if (side === 'home' && row.isHomeTeam) return true;
  if (side === 'away' && row.isAwayTeam) return true;
  const target = fallbackName.trim().toLowerCase();
  const rowName = row.teamName.trim().toLowerCase();
  if (!target || target.length < 3 || !rowName) return false;
  return rowName === target || rowName.includes(target) || target.includes(rowName);
}

export const StandingsTab: React.FC<StandingsTabProps> = ({
  lang,
  details,
  resolvedHomeTeam,
  resolvedAwayTeam,
  homeShort,
  awayShort,
  resolvedState,
}) => {
  const standings = details?.standings;
  const groups = standings?.groups || [];

  const defaultGroupIdx = useMemo(() => {
    const idx = groups.findIndex((g) =>
      g.all.some(
        (r) =>
          r.isHomeTeam ||
          r.isAwayTeam ||
          matchesMatchTeam(r, 'home', resolvedHomeTeam) ||
          matchesMatchTeam(r, 'away', resolvedAwayTeam)
      )
    );
    return idx >= 0 ? idx : 0;
  }, [groups, resolvedHomeTeam, resolvedAwayTeam]);

  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number>(defaultGroupIdx);
  const [scope, setScope] = useState<TableScope>('all');

  useEffect(() => {
    setSelectedGroupIdx(defaultGroupIdx);
  }, [defaultGroupIdx]);

  const activeGroup = groups[selectedGroupIdx] || groups[0];
  const hasHomeAwaySplits = Boolean(activeGroup?.home?.length && activeGroup?.away?.length);

  const rows: FootballStandingRow[] = useMemo(() => {
    if (!activeGroup) return [];
    if (scope === 'home' && activeGroup.home?.length) return activeGroup.home;
    if (scope === 'away' && activeGroup.away?.length) return activeGroup.away;
    return activeGroup.all || [];
  }, [activeGroup, scope]);

  if (!standings || rows.length === 0) {
    return (
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.08] py-10 px-4 text-center space-y-2">
        <Trophy className="w-7 h-7 text-zinc-500 mx-auto" />
        <p className="text-xs sm:text-sm font-semibold text-zinc-300">
          {pickLang(lang, {
            es: 'Clasificación no disponible para esta competición o eliminatoria',
            ca: 'Classificació no disponible per a aquesta competició o eliminatòria',
            en: 'Standings are not available for this competition or knockout tie',
          })}
        </p>
        <p className="text-[11px] text-zinc-500">
          {pickLang(lang, {
            es: 'Disponible automáticamente en ligas y fases de grupos en directo.',
            ca: 'Disponible automàticament en lligues i fases de grups en directe.',
            en: 'Available automatically for live leagues and group-stage competitions.',
          })}
        </p>
      </div>
    );
  }

  const showLiveBadge = Boolean(standings.hasLiveMatches || resolvedState === 'live');
  const legendItems = standings.legend || [];

  return (
    <div className="space-y-3">
      {/* Competition header + scope filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-4 h-4 text-[#BF94FF] shrink-0" />
          <span className="text-xs sm:text-sm font-bold text-white truncate">
            {standings.leagueName || details?.tournamentName || pickLang(lang, { es: 'Clasificación', ca: 'Classificació', en: 'Standings' })}
          </span>
          {showLiveBadge && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {pickLang(lang, { es: 'En directo', ca: 'En directe', en: 'Live' })}
            </span>
          )}
        </div>

        {hasHomeAwaySplits && (
          <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
            {(
              [
                { key: 'all', es: 'Total', ca: 'Total', en: 'All' },
                { key: 'home', es: 'Casa', ca: 'Casa', en: 'Home' },
                { key: 'away', es: 'Fuera', ca: 'Fora', en: 'Away' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setScope(opt.key);
                }}
                className={`min-h-7 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                  scope === opt.key
                    ? 'bg-[#9146FF] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {pickLang(lang, opt)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-group selector for tournaments (e.g. World Cup, Copa, etc.) */}
      {groups.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {groups.map((grp, idx) => {
            const hasMatchTeam = grp.all.some(
              (r) =>
                r.isHomeTeam ||
                r.isAwayTeam ||
                matchesMatchTeam(r, 'home', resolvedHomeTeam) ||
                matchesMatchTeam(r, 'away', resolvedAwayTeam)
            );
            const active = idx === selectedGroupIdx;
            return (
              <button
                key={`${grp.groupName}-${idx}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedGroupIdx(idx);
                }}
                className={`min-h-8 px-3 rounded-xl text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all border flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#9146FF] border-[#9146FF] text-white'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300'
                }`}
              >
                {hasMatchTeam && <span className="w-1.5 h-1.5 rounded-full bg-[#00F593]" />}
                <span>{grp.groupName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Responsive Table */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <th className="py-2.5 pl-3 pr-1.5 w-9 text-center">#</th>
                <th className="py-2.5 px-2">
                  {pickLang(lang, { es: 'Equipo', ca: 'Equip', en: 'Team' })}
                </th>
                <th className="py-2.5 px-1.5 sm:px-2 text-center tabular-nums">
                  {pickLang(lang, { es: 'PJ', ca: 'PJ', en: 'PL' })}
                </th>
                <th className="hidden min-[380px]:table-cell py-2.5 px-1.5 sm:px-2 text-center tabular-nums">
                  {pickLang(lang, { es: 'G', ca: 'G', en: 'W' })}
                </th>
                <th className="hidden min-[380px]:table-cell py-2.5 px-1.5 sm:px-2 text-center tabular-nums">
                  {pickLang(lang, { es: 'E', ca: 'E', en: 'D' })}
                </th>
                <th className="hidden min-[380px]:table-cell py-2.5 px-1.5 sm:px-2 text-center tabular-nums">
                  {pickLang(lang, { es: 'P', ca: 'P', en: 'L' })}
                </th>
                <th className="hidden md:table-cell py-2.5 px-2 text-center tabular-nums">
                  {pickLang(lang, { es: 'GF:GC', ca: 'GF:GC', en: 'GF:GA' })}
                </th>
                <th className="py-2.5 px-1.5 sm:px-2 text-center tabular-nums">
                  {pickLang(lang, { es: 'DG', ca: 'DG', en: 'GD' })}
                </th>
                <th className="py-2.5 pl-1.5 pr-3 text-right tabular-nums text-white">
                  {pickLang(lang, { es: 'Pts', ca: 'Pts', en: 'Pts' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-xs sm:text-[13px]">
              {rows.map((row) => {
                const isHome = matchesMatchTeam(row, 'home', resolvedHomeTeam);
                const isAway = matchesMatchTeam(row, 'away', resolvedAwayTeam);
                const isHighlighted = isHome || isAway;
                const gdPositive = row.goalDiff > 0;
                const gdNegative = row.goalDiff < 0;

                return (
                  <tr
                    key={`${row.teamId || row.teamName}-${row.rank}`}
                    className={`relative transition-colors ${
                      isHighlighted
                        ? 'bg-[#9146FF]/15 hover:bg-[#9146FF]/20'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="py-2.5 pl-3 pr-1.5 text-center font-mono font-bold tabular-nums relative">
                      {row.qualColor && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                          style={{ backgroundColor: row.qualColor }}
                        />
                      )}
                      <span className={isHighlighted ? 'text-white' : 'text-zinc-300'}>
                        {row.rank}
                      </span>
                    </td>

                    <td className="py-2 px-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <ClubLogoImg
                          src={row.logo}
                          alt={row.teamName}
                          shortCode={
                            isHome
                              ? homeShort || row.shortName
                              : isAway
                                ? awayShort || row.shortName
                                : row.shortName || row.teamName.slice(0, 3).toUpperCase()
                          }
                          size="w-5 h-5 sm:w-6 sm:h-6"
                        />
                        <span
                          className={`truncate ${
                            isHighlighted ? 'font-extrabold text-white' : 'font-semibold text-zinc-200'
                          }`}
                        >
                          {row.teamName}
                        </span>
                        {row.isPlayingLive && row.liveMatchLabel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-[10px] font-mono font-bold text-emerald-300 tabular-nums shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {row.liveMatchLabel}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-1.5 sm:px-2 text-center font-mono tabular-nums text-zinc-300">
                      {row.played}
                    </td>
                    <td className="hidden min-[380px]:table-cell py-2.5 px-1.5 sm:px-2 text-center font-mono tabular-nums text-zinc-300">
                      {row.wins}
                    </td>
                    <td className="hidden min-[380px]:table-cell py-2.5 px-1.5 sm:px-2 text-center font-mono tabular-nums text-zinc-400">
                      {row.draws}
                    </td>
                    <td className="hidden min-[380px]:table-cell py-2.5 px-1.5 sm:px-2 text-center font-mono tabular-nums text-zinc-400">
                      {row.losses}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-2 text-center font-mono tabular-nums text-zinc-400">
                      {row.goalsFor}:{row.goalsAgainst}
                    </td>
                    <td
                      className={`py-2.5 px-1.5 sm:px-2 text-center font-mono font-semibold tabular-nums ${
                        gdPositive
                          ? 'text-emerald-400'
                          : gdNegative
                            ? 'text-rose-400'
                            : 'text-zinc-400'
                      }`}
                    >
                      {gdPositive ? `+${row.goalDiff}` : row.goalDiff}
                    </td>
                    <td className="py-2.5 pl-1.5 pr-3 text-right font-mono font-black tabular-nums">
                      <span
                        className={`inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg ${
                          isHighlighted
                            ? 'bg-[#9146FF] text-white'
                            : 'bg-white/[0.06] text-white'
                        }`}
                      >
                        {row.pts}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Qualification / Relegation Legend */}
      {legendItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pt-0.5">
          {legendItems.map((item) => (
            <div key={`${item.title}-${item.color}`} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
