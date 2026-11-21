import React, { useMemo, useState } from 'react';
import { BarChart3, Flame, ListOrdered, Users } from 'lucide-react';
import type { AppLanguage, FootballMatchDetails, FootballMatchStatItem } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type { TacticalVisionAnalysis } from './tacticalVisionTypes';

type TrackerTab = 'live' | 'stats' | 'lineups';

interface SportsbookStatsAndLineupsProps {
  lang: AppLanguage;
  analysis: TacticalVisionAnalysis;
  homeTeamLabel: string;
  awayTeamLabel: string;
  details?: FootballMatchDetails | null;
}

function findStat(stats: FootballMatchStatItem[], regex: RegExp): FootballMatchStatItem | undefined {
  return stats.find((s) => regex.test(String(s.label || '')) || regex.test(String(s.key || '')));
}

export const SportsbookStatsAndLineups: React.FC<SportsbookStatsAndLineupsProps> = ({
  lang,
  analysis,
  homeTeamLabel,
  awayTeamLabel,
  details,
}) => {
  const [activeTab, setActiveTab] = useState<TrackerTab>('live');
  const homeColor = analysis.homeKitColor || '#00F593';
  const awayColor = analysis.awayKitColor || '#9146FF';
  const homeTilt = analysis.homeTiltPct ?? analysis.possession.homePct;
  const awayTilt = analysis.awayTiltPct ?? 100 - homeTilt;

  const statsList = useMemo(() => {
    return details?.statsByPeriod?.all?.length ? details.statsByPeriod.all : details?.stats || [];
  }, [details]);

  const shotsTotal = findStat(statsList, /tiros totales|total shots/i);
  const shotsTarget = findStat(statsList, /tiros a puerta|shots on target/i);
  const cornersStat = findStat(statsList, /esquina|corner/i);
  const xgStat = findStat(statsList, /xG|esperados/i);
  const bigChances = findStat(statsList, /grandes ocasiones|big chances/i);
  const dangerousTouches = findStat(statsList, /área rival|opposition box/i);

  const recentEvents = useMemo(() => (details?.events || []).slice(-5).reverse(), [details?.events]);
  const momentumBars = analysis.momentumHistory || [];

  const homeAtk = analysis.attacksSummary.homeAttacks;
  const awayAtk = analysis.attacksSummary.awayAttacks;
  const homeDang =
    analysis.attacksSummary.homeDangerousAttacks ??
    Math.max(1, Math.round(homeAtk * 0.45));
  const awayDang =
    analysis.attacksSummary.awayDangerousAttacks ??
    Math.max(1, Math.round(awayAtk * 0.45));

  const quickComparisons = [
    {
      label: pickLang(lang, { es: 'Posesión', ca: 'Possessió', en: 'Possession' }),
      homeVal: `${analysis.possession.homePct}%`,
      awayVal: `${analysis.possession.awayPct}%`,
      homePct: analysis.possession.homePct,
    },
    {
      label: pickLang(lang, { es: 'Ataques', ca: 'Atacs', en: 'Attacks' }),
      homeVal: String(homeAtk),
      awayVal: String(awayAtk),
      homePct: homeAtk + awayAtk > 0 ? Math.round((homeAtk / (homeAtk + awayAtk)) * 100) : 50,
    },
    {
      label: pickLang(lang, { es: 'Ataques peligrosos', ca: 'Atacs perillosos', en: 'Dangerous Attacks' }),
      homeVal: String(homeDang),
      awayVal: String(awayDang),
      homePct: homeDang + awayDang > 0 ? Math.round((homeDang / (homeDang + awayDang)) * 100) : 50,
    },
    {
      label: pickLang(lang, { es: 'Tiros a puerta', ca: 'Tirs a porteria', en: 'On Target' }),
      homeVal: shotsTarget?.homeValue ?? '—',
      awayVal: shotsTarget?.awayValue ?? '—',
      homePct: shotsTarget?.homePct ?? 50,
    },
    {
      label: pickLang(lang, { es: 'Tiros totales', ca: 'Tirs totals', en: 'Total Shots' }),
      homeVal: shotsTotal?.homeValue ?? '—',
      awayVal: shotsTotal?.awayValue ?? '—',
      homePct: shotsTotal?.homePct ?? 50,
    },
    {
      label: pickLang(lang, { es: 'Saques de esquina', ca: 'Córners', en: 'Corners' }),
      homeVal: cornersStat?.homeValue ?? '—',
      awayVal: cornersStat?.awayValue ?? '—',
      homePct: cornersStat?.homePct ?? 50,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Match Tilt Gauge ("¿Para dónde tira el partido?") + Momentum Graph */}
      <div className="rounded-xl bg-[#090C14] border border-white/[0.08] p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-white truncate max-w-[34%]">
            {homeTeamLabel}{' '}
            <span className="font-mono tabular-nums" style={{ color: homeColor }}>
              {homeTilt}%
            </span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 shrink-0">
            {pickLang(lang, {
              es: 'Inclinación del partido',
              ca: 'Inclinació del partit',
              en: 'Match Momentum Tilt',
            })}
          </span>
          <span className="font-bold text-white truncate max-w-[34%] text-right">
            <span className="font-mono tabular-nums" style={{ color: awayColor }}>
              {awayTilt}%
            </span>{' '}
            {awayTeamLabel}
          </span>
        </div>

        <div className="h-2 rounded-full bg-white/10 overflow-hidden flex gap-0.5">
          <div
            style={{ width: `${homeTilt}%`, backgroundColor: homeColor }}
            className="h-full transition-all duration-500"
          />
          <div
            style={{ width: `${awayTilt}%`, backgroundColor: awayColor }}
            className="h-full transition-all duration-500"
          />
        </div>

        {/* Bi-directional Momentum Sparkline (Home bars up, Away bars down) */}
        {momentumBars.length > 0 && (
          <div className="pt-1">
            <div className="relative h-11 flex items-center gap-[3px] border-y border-white/[0.05] px-1">
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/15 pointer-events-none" />
              {momentumBars.map((pt) => {
                const isHome = pt.value >= 0;
                const hPct = Math.max(12, Math.min(96, Math.abs(pt.value)));
                return (
                  <div
                    key={pt.id}
                    title={`${pt.label}: ${isHome ? homeTeamLabel : awayTeamLabel} (${Math.abs(pt.value)})`}
                    className="flex-1 h-full flex flex-col justify-center items-center"
                  >
                    <div className="w-full h-1/2 flex items-end">
                      {isHome && (
                        <div
                          style={{ height: `${hPct}%`, backgroundColor: homeColor }}
                          className="w-full rounded-t-[2px] opacity-85 transition-all duration-300"
                        />
                      )}
                    </div>
                    <div className="w-full h-1/2 flex items-start">
                      {!isHome && (
                        <div
                          style={{ height: `${hPct}%`, backgroundColor: awayColor }}
                          className="w-full rounded-b-[2px] opacity-85 transition-all duration-300"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Segmented Bookmaker Navigation Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090C14] border border-white/[0.08]">
        {(
          [
            { id: 'live', icon: Flame, es: 'En Vivo', ca: 'En Directe', en: 'Live' },
            { id: 'stats', icon: BarChart3, es: 'Estadísticas', ca: 'Estadístiques', en: 'Stats' },
            { id: 'lineups', icon: Users, es: 'Alineaciones', ca: 'Alineacions', en: 'Lineups' },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab(tab.id);
              }}
              className={`min-h-[36px] px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                active
                  ? 'bg-[#1D2538] text-white border border-white/15'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{pickLang(lang, tab)}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: BOOKMAKER LIVE METRICS & ATTACK CHANNELS */}
      {activeTab === 'live' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {quickComparisons.map((item) => (
              <div
                key={item.label}
                className="rounded-lg bg-[#090C14] border border-white/[0.07] px-2.5 py-2 space-y-1"
              >
                <div className="text-[10px] font-medium text-zinc-400 truncate text-center">
                  {item.label}
                </div>
                <div className="flex items-center justify-between text-xs font-mono font-extrabold tabular-nums">
                  <span style={{ color: homeColor }}>{item.homeVal}</span>
                  <span style={{ color: awayColor }}>{item.awayVal}</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden flex gap-0.5">
                  <div style={{ width: `${item.homePct}%`, backgroundColor: homeColor }} className="h-full" />
                  <div style={{ width: `${100 - item.homePct}%`, backgroundColor: awayColor }} className="h-full" />
                </div>
              </div>
            ))}
          </div>

          {analysis.laneActivity && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#090C14] border border-white/[0.07] text-[10px] text-zinc-400">
              <span>
                {pickLang(lang, { es: 'Banda Sup.', ca: 'Banda Sup.', en: 'Far Flank' })}:{' '}
                <strong className="font-mono tabular-nums text-zinc-200">{analysis.laneActivity.leftPct}%</strong>
              </span>
              <span>
                {pickLang(lang, { es: 'Centro', ca: 'Centre', en: 'Center' })}:{' '}
                <strong className="font-mono tabular-nums text-white">{analysis.laneActivity.centerPct}%</strong>
              </span>
              <span>
                {pickLang(lang, { es: 'Banda Inf.', ca: 'Banda Inf.', en: 'Near Flank' })}:{' '}
                <strong className="font-mono tabular-nums text-zinc-200">{analysis.laneActivity.rightPct}%</strong>
              </span>
            </div>
          )}

          {(xgStat || bigChances || dangerousTouches) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#090C14] border border-white/[0.07] text-[11px] font-mono tabular-nums">
              {xgStat && (
                <span className="text-zinc-300">
                  xG: <strong style={{ color: homeColor }}>{xgStat.homeValue}</strong> -{' '}
                  <strong style={{ color: awayColor }}>{xgStat.awayValue}</strong>
                </span>
              )}
              {bigChances && (
                <span className="text-zinc-300">
                  {pickLang(lang, { es: 'Ocasiones', ca: 'Ocasions', en: 'Big Chances' })}:{' '}
                  <strong style={{ color: homeColor }}>{bigChances.homeValue}</strong> -{' '}
                  <strong style={{ color: awayColor }}>{bigChances.awayValue}</strong>
                </span>
              )}
              {dangerousTouches && (
                <span className="text-zinc-300">
                  {pickLang(lang, { es: 'Área rival', ca: 'Àrea rival', en: 'Box Touches' })}:{' '}
                  <strong style={{ color: homeColor }}>{dangerousTouches.homeValue}</strong> -{' '}
                  <strong style={{ color: awayColor }}>{dangerousTouches.awayValue}</strong>
                </span>
              )}
            </div>
          )}

          {/* Concise Live Events Timeline */}
          {recentEvents.length > 0 && (
            <div className="space-y-1">
              {recentEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#090C14]/80 border border-white/[0.05] text-[11px]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono tabular-nums text-zinc-400 shrink-0">{ev.clock}</span>
                    <span className="shrink-0">
                      {ev.type === 'goal'
                        ? '⚽'
                        : ev.type === 'red-card'
                          ? '🟥'
                          : ev.type === 'yellow-card'
                            ? '🟨'
                            : ev.type === 'substitution'
                              ? '🔄'
                              : '•'}
                    </span>
                    <span className="text-zinc-100 font-semibold truncate">{ev.playerName}</span>
                  </div>
                  <span
                    className="text-[10px] font-bold shrink-0"
                    style={{
                      color: ev.side === 'away' ? awayColor : ev.side === 'home' ? homeColor : '#A1A1AA',
                    }}
                  >
                    {ev.side === 'home' ? homeTeamLabel : ev.side === 'away' ? awayTeamLabel : ev.typeLabel}
                  </span>
                </div>
              ))}
            </div>
          )}

          {analysis.tacticalNote && (
            <p className="text-[11px] text-zinc-300 leading-snug px-0.5">
              {analysis.tacticalNote}
            </p>
          )}
        </div>
      )}

      {/* TAB 2: COMPLETE LIVE MATCH STATS */}
      {activeTab === 'stats' && (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {(statsList.length > 0
            ? statsList.slice(0, 14)
            : quickComparisons.map((q) => ({
                key: q.label,
                label: q.label,
                homeValue: q.homeVal,
                awayValue: q.awayVal,
                homePct: q.homePct,
                awayPct: 100 - q.homePct,
              }))
          ).map((s) => (
            <div key={s.key || s.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono font-bold tabular-nums" style={{ color: homeColor }}>
                  {s.homeValue}
                </span>
                <span className="text-zinc-300 font-medium truncate px-2">{s.label}</span>
                <span className="font-mono font-bold tabular-nums" style={{ color: awayColor }}>
                  {s.awayValue}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex gap-0.5">
                <div style={{ width: `${s.homePct}%`, backgroundColor: homeColor }} className="h-full" />
                <div style={{ width: `${s.awayPct}%`, backgroundColor: awayColor }} className="h-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: FULL 11v11 LINEUPS & BENCH LIST */}
      {activeTab === 'lineups' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
          {(
            [
              {
                label: homeTeamLabel,
                color: homeColor,
                lineup: details?.homeLineup,
                dots: analysis.players.filter((p) => p.team === 'home'),
              },
              {
                label: awayTeamLabel,
                color: awayColor,
                lineup: details?.awayLineup,
                dots: analysis.players.filter((p) => p.team === 'away'),
              },
            ] as const
          ).map((side) => (
            <div
              key={side.label}
              className="rounded-lg bg-[#090C14] border border-white/[0.08] p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/[0.06]">
                <span className="text-xs font-bold truncate" style={{ color: side.color }}>
                  {side.label}
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {side.lineup?.formation || '4-3-3'}
                </span>
              </div>
              <div className="space-y-1">
                {(side.lineup?.starters?.length
                  ? side.lineup.starters
                  : side.dots.map((d) => ({
                      id: d.id,
                      jersey: d.jersey || '',
                      name: d.name,
                      position: d.roleHint || '',
                      rating: d.rating,
                      yellowCard: d.yellowCard,
                      redCard: d.redCard,
                      goals: d.goals,
                    }))
                ).map((pl) => (
                  <div
                    key={pl.id}
                    className="flex items-center justify-between gap-1.5 text-[11px] leading-tight"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-5 font-mono text-zinc-400 tabular-nums shrink-0">
                        #{pl.jersey}
                      </span>
                      <span className="text-zinc-100 truncate">{pl.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                      {pl.goals ? <span>⚽{pl.goals}</span> : null}
                      {pl.yellowCard ? <span>🟨</span> : null}
                      {pl.redCard ? <span>🟥</span> : null}
                      {pl.rating && (
                        <span className="px-1 rounded bg-white/10 text-zinc-200 tabular-nums">
                          {pl.rating}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {side.lineup?.coach && (
                <div className="pt-1 border-t border-white/[0.06] text-[10px] text-zinc-400 flex items-center gap-1">
                  <ListOrdered className="w-3 h-3 shrink-0" />
                  <span className="truncate">DT: {side.lineup.coach}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
