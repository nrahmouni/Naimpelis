import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Radio,
  RefreshCw,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballMatchLineupPlayer,
  FootballMatchShotItem,
  FootballMatchStatItem,
  StreamTrack,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import {
  ClubLogoImg,
  LineupMetric,
  MatchCenterTab,
  StatsPeriod,
} from './liveMatch/matchCenterUtils';
import { LineupsTab } from './liveMatch/LineupsTab';
import { StatsAndShotsTab } from './liveMatch/StatsAndShotsTab';
import { CommentaryTab, EventsTab } from './liveMatch/CommentaryAndEventsTabs';

export type { MatchCenterTab };

interface LiveMatchCenterProps {
  lang: AppLanguage;
  details: FootballMatchDetails | null;
  loading?: boolean;
  homeTeam: string;
  awayTeam: string;
  homeShort?: string;
  awayShort?: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: string;
  awayScore?: string;
  statusState?: 'live' | 'upcoming' | 'finished';
  statusLabel?: string;
  competition?: string;
  variant?: 'expanded' | 'docked';
  onRefresh?: () => void;
  onCloseDock?: () => void;
  defaultTab?: MatchCenterTab;
  tracks?: StreamTrack[];
  activeTrackIndex?: number;
  onSelectTrack?: (index: number) => void;
}

export const LiveMatchCenter: React.FC<LiveMatchCenterProps> = ({
  lang,
  details,
  loading = false,
  homeTeam,
  awayTeam,
  homeShort,
  awayShort,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  statusState,
  statusLabel,
  competition,
  variant = 'expanded',
  onRefresh,
  onCloseDock,
  defaultTab = 'lineups',
  tracks,
  activeTrackIndex,
  onSelectTrack,
}) => {
  const [activeTab, setActiveTab] = useState<MatchCenterTab>(defaultTab);
  const [lineupMetric, setLineupMetric] = useState<LineupMetric>('rating');
  const [lineupTeamView, setLineupTeamView] = useState<'both' | 'home' | 'away'>('both');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [shotFilter, setShotFilter] = useState<'all' | 'onTarget'>('all');
  const [selectedShot, setSelectedShot] = useState<FootballMatchShotItem | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<FootballMatchLineupPlayer | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const resolvedHomeTeam = details?.homeTeam || homeTeam;
  const resolvedAwayTeam = details?.awayTeam || awayTeam;
  const resolvedHomeLogo = details?.homeLogo || homeLogo;
  const resolvedAwayLogo = details?.awayLogo || awayLogo;
  const resolvedHomeScore = details?.homeScore ?? homeScore ?? '-';
  const resolvedAwayScore = details?.awayScore ?? awayScore ?? '-';
  const resolvedState = details?.statusState || statusState || 'upcoming';
  const resolvedStatusLabel = details?.statusLabel || statusLabel || '';

  const periodStats: FootballMatchStatItem[] = useMemo(() => {
    if (!details) return [];
    if (statsPeriod === 'firstHalf' && details.statsByPeriod?.firstHalf?.length) {
      return details.statsByPeriod.firstHalf;
    }
    if (statsPeriod === 'secondHalf' && details.statsByPeriod?.secondHalf?.length) {
      return details.statsByPeriod.secondHalf;
    }
    return details.statsByPeriod?.all?.length ? details.statsByPeriod.all : details.stats || [];
  }, [details, statsPeriod]);

  const possessionStat = useMemo(
    () => periodStats.find((s) => /posesi|possess/i.test(s.label) || /possess/i.test(s.key)),
    [periodStats]
  );

  const otherStats = useMemo(
    () =>
      periodStats.filter(
        (s) =>
          s !== possessionStat &&
          !/xG en jugada|xG a balón parado|Toques en área/i.test(s.label)
      ),
    [periodStats, possessionStat]
  );

  const shotsTotalStat = useMemo(
    () => periodStats.find((s) => s.key === 'total_shots' || /tiros totales/i.test(s.label)),
    [periodStats]
  );
  const shotsOnTargetStat = useMemo(
    () => periodStats.find((s) => s.key === 'ShotsOnTarget' || /tiros a puerta/i.test(s.label)),
    [periodStats]
  );

  const visibleShots = useMemo(() => {
    const list = details?.shotsMap || [];
    if (shotFilter === 'onTarget') return list.filter((s) => s.onTarget);
    return list;
  }, [details?.shotsMap, shotFilter]);

  const shotsWithGoalFrame = useMemo(
    () => visibleShots.filter((s) => s.onGoalShot != null),
    [visibleShots]
  );

  const hasFirstHalfStats = Boolean(details?.statsByPeriod?.firstHalf?.length);
  const hasSecondHalfStats = Boolean(details?.statsByPeriod?.secondHalf?.length);
  const hasAnyHeight = Boolean(
    details?.homeLineup?.starters.some((p) => Boolean(p.height)) ||
      details?.awayLineup?.starters.some((p) => Boolean(p.height))
  );

  return (
    <div
      className={
        variant === 'docked'
          ? 'rounded-3xl nc-specular-surface border border-white/[0.11] shadow-[0_24px_60px_rgba(0,0,0,0.84)] overflow-hidden'
          : 'space-y-4'
      }
    >
      {/* Scoreboard Header */}
      {variant === 'docked' && (
        <div className="px-4 py-3.5 bg-gradient-to-r from-[#171B27] via-[#131722] to-[#171B27] border-b border-white/[0.08] space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              {resolvedState === 'live' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE' })}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-white/[0.08] text-zinc-300 font-semibold">
                  {resolvedState === 'finished'
                    ? pickLang(lang, { es: 'Finalizado', ca: 'Finalitzat', en: 'Finished' })
                    : pickLang(lang, { es: 'Previa', ca: 'Prèvia', en: 'Preview' })}
                </span>
              )}
              <span className="text-zinc-400 truncate">
                {details?.tournamentName ||
                  competition ||
                  pickLang(lang, { es: 'Fútbol en Directo', ca: 'Futbol en Directe', en: 'Live Football' })}
                {details?.venue ? ` · ${details.venue}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onRefresh && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onRefresh();
                  }}
                  aria-label={pickLang(lang, {
                    es: 'Actualizar datos en vivo',
                    ca: 'Actualitzar dades en directe',
                    en: 'Refresh live data',
                  })}
                  title={pickLang(lang, {
                    es: 'Actualizar datos en vivo',
                    ca: 'Actualitzar dades en directe',
                    en: 'Refresh live data',
                  })}
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#9146FF]' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCollapsed((c) => !c)}
                aria-label={
                  isCollapsed
                    ? pickLang(lang, {
                        es: 'Expandir estadísticas y alineaciones',
                        ca: 'Expandir estadístiques i alineacions',
                        en: 'Expand stats and lineups',
                      })
                    : pickLang(lang, {
                        es: 'Contraer panel',
                        ca: 'Contraure panell',
                        en: 'Collapse panel',
                      })
                }
                title={
                  isCollapsed
                    ? pickLang(lang, {
                        es: 'Expandir estadísticas y alineaciones',
                        ca: 'Expandir estadístiques i alineacions',
                        en: 'Expand stats and lineups',
                      })
                    : pickLang(lang, {
                        es: 'Contraer panel',
                        ca: 'Contraure panell',
                        en: 'Collapse panel',
                      })
                }
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              {onCloseDock && (
                <button
                  type="button"
                  onClick={onCloseDock}
                  aria-label={pickLang(lang, {
                    es: 'Cerrar panel de datos en vivo',
                    ca: 'Tancar panell de dades en directe',
                    en: 'Close live match panel',
                  })}
                  title={pickLang(lang, {
                    es: 'Cerrar panel de datos en vivo',
                    ca: 'Tancar panell de dades en directe',
                    en: 'Close live match panel',
                  })}
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-rose-500/20 flex items-center justify-center text-zinc-400 hover:text-rose-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-6 py-1">
            <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0">
              <span className="font-display font-bold text-xs sm:text-sm md:text-base text-white line-clamp-2 leading-tight text-right break-words">
                {resolvedHomeTeam}
              </span>
              <ClubLogoImg src={resolvedHomeLogo} alt={resolvedHomeTeam} shortCode={homeShort} size="w-8 h-8 sm:w-9 sm:h-9" />
            </div>

            <div className="flex flex-col items-center shrink-0 min-w-[72px]">
              <div
                className={`text-xl sm:text-2xl font-mono font-black tabular-nums tracking-tight ${
                  resolvedState === 'live' ? 'text-rose-400' : 'text-white'
                }`}
              >
                {resolvedHomeScore} - {resolvedAwayScore}
              </div>
              {resolvedStatusLabel && (
                <span className="text-[11px] font-mono font-bold text-rose-300 tabular-nums">
                  {resolvedStatusLabel}
                </span>
              )}
            </div>

            <div className="flex items-center justify-start gap-2.5 flex-1 min-w-0">
              <ClubLogoImg src={resolvedAwayLogo} alt={resolvedAwayTeam} shortCode={awayShort} size="w-8 h-8 sm:w-9 sm:h-9" />
              <span className="font-display font-bold text-xs sm:text-sm md:text-base text-white line-clamp-2 leading-tight text-left break-words">
                {resolvedAwayTeam}
              </span>
            </div>
          </div>

          {tracks && tracks.length > 0 && onSelectTrack && (
            <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <Radio className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'Canales de emisión disponibles',
                    ca: 'Canals d’emissió disponibles',
                    en: 'Available Broadcast Channels',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {tracks.map((tr, idx) => {
                  const isActiveSignal = idx === (activeTrackIndex ?? 0);
                  return (
                    <button
                      key={tr.id || idx}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onSelectTrack(idx);
                      }}
                      className={`min-h-9 px-3 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border flex items-center gap-1.5 ${
                        isActiveSignal
                          ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.35)]'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.09] text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActiveSignal ? 'bg-[#00F593]' : 'bg-zinc-500'
                        }`}
                      />
                      <span>{tr.label || `Canal ${idx + 1}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div className={variant === 'docked' ? 'p-3.5 sm:p-4 space-y-4' : 'space-y-4'}>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 border-b border-white/[0.08]">
            {(
              [
                {
                  key: 'commentary',
                  es: 'Comentario',
                  ca: 'Comentari',
                  en: 'Commentary',
                  liveDot: resolvedState === 'live',
                },
                { key: 'lineups', es: 'Alineaciones', ca: 'Alineacions', en: 'Lineups' },
                { key: 'stats', es: 'Estadísticas', ca: 'Estadístiques', en: 'Statistics' },
                { key: 'events', es: 'Eventos', ca: 'Esdeveniments', en: 'Events' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(tab.key);
                }}
                className={`min-h-12 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-[#9146FF] text-white shadow-sm'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 hover:text-white'
                }`}
              >
                {'liveDot' in tab && tab.liveDot && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EB0400]" />
                )}
                <span>{pickLang(lang, tab)}</span>
              </button>
            ))}

            <div className="ml-auto pb-2 flex items-center gap-2 text-[11px] text-zinc-400 shrink-0">
              {details?.referee && (
                <span className="hidden md:inline truncate max-w-[160px]">
                  {pickLang(lang, { es: 'Árb:', ca: 'Àrb:', en: 'Ref:' })} {details.referee}
                </span>
              )}
              {variant === 'expanded' && onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  aria-label={pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Refresh' })}
                  className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                  title={pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Refresh' })}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#9146FF]' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {loading && !details ? (
            <div className="py-10 flex items-center justify-center gap-2.5 text-xs text-zinc-300">
              <Loader2 className="w-5 h-5 animate-spin text-[#9146FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Sincronizando datos en tiempo real del partido...',
                  ca: 'Sincronitzant dades en temps real del partit...',
                  en: 'Syncing live match intelligence...',
                })}
              </span>
            </div>
          ) : activeTab === 'lineups' ? (
            <LineupsTab
              lang={lang}
              details={details}
              resolvedState={resolvedState}
              homeShort={homeShort}
              awayShort={awayShort}
              hasAnyHeight={hasAnyHeight}
              lineupMetric={lineupMetric}
              setLineupMetric={setLineupMetric}
              lineupTeamView={lineupTeamView}
              setLineupTeamView={setLineupTeamView}
              selectedPlayer={selectedPlayer}
              setSelectedPlayer={setSelectedPlayer}
            />
          ) : activeTab === 'stats' ? (
            <StatsAndShotsTab
              lang={lang}
              details={details}
              resolvedState={resolvedState}
              statsPeriod={statsPeriod}
              setStatsPeriod={setStatsPeriod}
              hasFirstHalfStats={hasFirstHalfStats}
              hasSecondHalfStats={hasSecondHalfStats}
              possessionStat={possessionStat}
              otherStats={otherStats}
              shotsTotalStat={shotsTotalStat}
              shotsOnTargetStat={shotsOnTargetStat}
              shotFilter={shotFilter}
              setShotFilter={setShotFilter}
              visibleShots={visibleShots}
              shotsWithGoalFrame={shotsWithGoalFrame}
              selectedShot={selectedShot}
              setSelectedShot={setSelectedShot}
            />
          ) : activeTab === 'commentary' ? (
            <CommentaryTab
              lang={lang}
              details={details}
              resolvedState={resolvedState}
              homeShort={homeShort}
              awayShort={awayShort}
            />
          ) : (
            <EventsTab
              lang={lang}
              details={details}
              resolvedState={resolvedState}
              resolvedHomeTeam={resolvedHomeTeam}
              resolvedAwayTeam={resolvedAwayTeam}
              homeShort={homeShort}
              awayShort={awayShort}
            />
          )}

          {(details?.venue || details?.attendance) && variant === 'expanded' && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 px-1 pt-1">
              {details.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                  {details.venue}
                </span>
              )}
              {details.attendance && (
                <span className="inline-flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
                  {details.attendance}{' '}
                  {pickLang(lang, { es: 'espectadores', ca: 'espectadors', en: 'attendance' })}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
