import React, { useMemo, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballMatchLineupPlayer,
  FootballMatchLineupTeam,
  FootballMatchShotItem,
  FootballMatchStatItem,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';

export type MatchCenterTab = 'commentary' | 'lineups' | 'stats' | 'events';
type LineupMetric = 'rating' | 'club' | 'age' | 'marketValue' | 'height';
type StatsPeriod = 'all' | 'firstHalf' | 'secondHalf';

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
}

function getRatingBadgeClasses(ratingStr?: string): string {
  const n = ratingStr ? parseFloat(ratingStr) : NaN;
  if (!Number.isFinite(n)) return 'bg-zinc-700 text-zinc-200';
  if (n >= 8.0) return 'bg-sky-500 text-white';
  if (n >= 7.0) return 'bg-emerald-500 text-white';
  if (n >= 6.5) return 'bg-lime-500 text-[#0B1205]';
  if (n >= 6.0) return 'bg-amber-400 text-[#140F02]';
  return 'bg-rose-500 text-white';
}

function getPlayerMetricText(
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

function computeFallbackPitchCoords(
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

const PlayerAvatarImg: React.FC<{
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

const ClubLogoImg: React.FC<{ src?: string; alt: string; shortCode?: string; size?: string }> = ({
  src,
  alt,
  shortCode,
  size = 'w-8 h-8',
}) => {
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

const TacticalPitchHalf: React.FC<{
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
      {/* Scoreboard Header (Always shown in Player Dock Mode, or concise header bar) */}
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

          {/* Centered Big Live Scoreboard Row */}
          <div className="flex items-center justify-center gap-4 sm:gap-8 py-1">
            <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0">
              <span className="font-display font-bold text-sm sm:text-base text-white truncate text-right">
                {resolvedHomeTeam}
              </span>
              <ClubLogoImg src={resolvedHomeLogo} alt={resolvedHomeTeam} shortCode={homeShort} size="w-8 h-8 sm:w-9 sm:h-9" />
            </div>

            <div className="flex flex-col items-center shrink-0 min-w-[78px]">
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
              <span className="font-display font-bold text-sm sm:text-base text-white truncate text-left">
                {resolvedAwayTeam}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className={variant === 'docked' ? 'p-3.5 sm:p-4 space-y-4' : 'space-y-4'}>
          {/* 4 Main Navigation Tabs */}
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
                {
                  key: 'lineups',
                  es: 'Alineaciones',
                  ca: 'Alineacions',
                  en: 'Lineups',
                },
                {
                  key: 'stats',
                  es: 'Estadísticas',
                  ca: 'Estadístiques',
                  en: 'Statistics',
                },
                {
                  key: 'events',
                  es: 'Eventos',
                  ca: 'Esdeveniments',
                  en: 'Events',
                },
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
            /* ================================================================ */
            /* TAB: LINEUPS & TACTICAL PITCH                                    */
            /* ================================================================ */
            <div className="space-y-3.5">
              {/* Metric Filter Bar + Team View Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {(
                    [
                      { id: 'rating', es: 'Rendimiento', ca: 'Rendiment', en: 'Rating' },
                      { id: 'club', es: 'Club', ca: 'Club', en: 'Club' },
                      { id: 'age', es: 'Edad', ca: 'Edat', en: 'Age' },
                      { id: 'marketValue', es: 'Valor de mercado', ca: 'Valor de mercat', en: 'Market value' },
                      ...(hasAnyHeight ? [{ id: 'height' as const, es: 'Altura', ca: 'Alçada', en: 'Height' }] : []),
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setLineupMetric(m.id);
                      }}
                      className={`min-h-10 px-3 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                        lineupMetric === m.id
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-[#242833] hover:bg-[#313746] text-zinc-300 border border-white/[0.08]'
                      }`}
                    >
                      {pickLang(lang, m)}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-xl bg-[#1D212B] p-1 border border-white/[0.06] shrink-0">
                  {(
                    [
                      { id: 'both', label: pickLang(lang, { es: 'Ambos', ca: 'Ambdós', en: 'Both' }) },
                      { id: 'home', label: homeShort || pickLang(lang, { es: 'Local', ca: 'Local', en: 'Home' }) },
                      { id: 'away', label: awayShort || pickLang(lang, { es: 'Visit.', ca: 'Visit.', en: 'Away' }) },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setLineupTeamView(v.id)}
                      className={`min-h-10 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        lineupTeamView === v.id
                          ? 'bg-[#9146FF] text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {details?.homeLineup?.starters.length || details?.awayLineup?.starters.length ? (
                <div
                  className={`grid gap-4 ${
                    lineupTeamView === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {(lineupTeamView === 'both' || lineupTeamView === 'home') &&
                    details?.homeLineup && (
                      <TacticalPitchHalf
                        lineup={details.homeLineup}
                        side="home"
                        metric={lineupMetric}
                        lang={lang}
                        onSelectPlayer={setSelectedPlayer}
                      />
                    )}
                  {(lineupTeamView === 'both' || lineupTeamView === 'away') &&
                    details?.awayLineup && (
                      <TacticalPitchHalf
                        lineup={details.awayLineup}
                        side="away"
                        metric={lineupMetric}
                        lang={lang}
                        onSelectPlayer={setSelectedPlayer}
                      />
                    )}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-[#1A1E29] border border-white/[0.07] text-center space-y-1.5">
                  <Users className="w-6 h-6 text-zinc-500 mx-auto" />
                  <p className="text-xs sm:text-sm font-semibold text-zinc-200">
                    {resolvedState === 'upcoming'
                      ? pickLang(lang, {
                          es: 'Las alineaciones oficiales se publican ~60 minutos antes del inicio.',
                          ca: 'Les alineacions oficials es publiquen ~60 minuts abans de l’inici.',
                          en: 'Official lineups are published ~60 minutes before kickoff.',
                        })
                      : pickLang(lang, {
                          es: 'No hay alineaciones oficiales publicadas en las fuentes para esta competición.',
                          ca: 'No hi ha alineacions oficials publicades a les fonts per a aquesta competició.',
                          en: 'No official lineups published for this competition.',
                        })}
                  </p>
                </div>
              )}

              {/* Selected Player Quick Bio Strip */}
              {selectedPlayer && (
                <div className="p-3 rounded-2xl bg-[#1E2330] border border-[#9146FF]/45 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <PlayerAvatarImg
                      src={selectedPlayer.photoUrl}
                      jersey={selectedPlayer.jersey}
                      name={selectedPlayer.name}
                      sizeClass="w-11 h-11"
                    />
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>
                          #{selectedPlayer.jersey} {selectedPlayer.name}
                        </span>
                        {selectedPlayer.rating && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${getRatingBadgeClasses(
                              selectedPlayer.rating
                            )}`}
                          >
                            ★ {selectedPlayer.rating}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 mt-0.5">
                        {selectedPlayer.club && <span>Club: {selectedPlayer.club}</span>}
                        {selectedPlayer.age && (
                          <span>
                            · {selectedPlayer.age}{' '}
                            {pickLang(lang, { es: 'años', ca: 'anys', en: 'yrs' })}
                          </span>
                        )}
                        {selectedPlayer.marketValue && (
                          <span>
                            · {pickLang(lang, { es: 'Valor:', ca: 'Valor:', en: 'Value:' })}{' '}
                            {selectedPlayer.marketValue}
                          </span>
                        )}
                        {selectedPlayer.country && <span>· {selectedPlayer.country}</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPlayer(null)}
                    aria-label={pickLang(lang, {
                      es: 'Cerrar ficha de jugador',
                      ca: 'Tancar fitxa de jugador',
                      en: 'Close player card',
                    })}
                    className="p-1.5 rounded-full bg-white/[0.06] text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'stats' ? (
            /* ================================================================ */
            /* TAB: STATISTICS + SHOT MAP + GOAL FRAME (Matches Screenshot 1)   */
            /* ================================================================ */
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
          ) : activeTab === 'commentary' ? (
            /* ================================================================ */
            /* TAB: LIVE COMMENTARY + ATTACK MOMENTUM                           */
            /* ================================================================ */
            <div className="space-y-4">
              {details?.momentum && details.momentum.length > 0 && (
                <div className="rounded-2xl bg-[#1A1E29] border border-white/[0.07] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {pickLang(lang, {
                          es: 'Ritmo de Ataque en Directo',
                          ca: 'Ritme d’Atac en Directe',
                          en: 'Live Attack Momentum',
                        })}
                      </span>
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      <span className="text-emerald-400 font-semibold">
                        {homeShort || pickLang(lang, { es: 'Local', ca: 'Local', en: 'Home' })}
                      </span>
                      {' vs '}
                      <span className="text-indigo-400 font-semibold">
                        {awayShort || pickLang(lang, { es: 'Visit.', ca: 'Visit.', en: 'Away' })}
                      </span>
                    </span>
                  </div>
                  <div className="relative h-14 flex items-center gap-[1px] bg-black/25 rounded-lg px-1.5 overflow-hidden">
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/15 pointer-events-none" />
                    {details.momentum.slice(0, 95).map((pt) => {
                      const pct = Math.min(48, Math.max(4, Math.abs(pt.value) * 0.48));
                      const isHome = pt.value >= 0;
                      return (
                        <div
                          key={pt.minute}
                          title={`Min ${pt.minute}'`}
                          className="flex-1 h-full relative"
                        >
                          <div
                            style={{
                              height: `${pct}%`,
                              bottom: isHome ? '50%' : undefined,
                              top: isHome ? undefined : '50%',
                            }}
                            className={`absolute inset-x-0 rounded-[1px] ${
                              isHome ? 'bg-emerald-500/85' : 'bg-indigo-400/85'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                  <span>
                    {pickLang(lang, {
                      es: 'Minuto a Minuto en Directo',
                      ca: 'Minut a Minut en Directe',
                      en: 'Live Play-by-Play',
                    })}
                  </span>
                </h4>

                {details?.commentary && details.commentary.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {details.commentary.map((com) => (
                      <div
                        key={com.id}
                        className={`p-3 rounded-xl text-xs flex items-start gap-3 border ${
                          com.isImportant
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : 'bg-[#1A1E29] border-white/[0.06] text-zinc-200'
                        }`}
                      >
                        <span className="min-w-[44px] px-1.5 py-0.5 rounded bg-black/35 font-mono font-bold tabular-nums text-[#22C55E] text-center shrink-0">
                          {com.minute}
                        </span>
                        <p className="flex-1 leading-relaxed">{com.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 p-4 rounded-2xl bg-[#1A1E29] border border-white/[0.06]">
                    {resolvedState === 'upcoming'
                      ? pickLang(lang, {
                          es: 'La narración minuto a minuto comenzará cuando el árbitro pite el inicio.',
                          ca: 'La narració minut a minut començarà quan l’àrbitre xiuli l’inici.',
                          en: 'Live commentary will begin at kickoff.',
                        })
                      : pickLang(lang, {
                          es: 'Sin comentarios minuto a minuto disponibles para esta competición.',
                          ca: 'Sense comentaris minut a minut disponibles per a aquesta competició.',
                          en: 'No minute-by-minute commentary available for this competition.',
                        })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ================================================================ */
            /* TAB: EVENTS TIMELINE                                             */
            /* ================================================================ */
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#9146FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'Incidencias del Partido',
                    ca: 'Incidències del Partit',
                    en: 'Match Events',
                  })}
                </span>
              </h4>

              {details?.events && details.events.length > 0 ? (
                <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#1A1E29] border border-white/[0.07] max-h-80 overflow-y-auto">
                  {details.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="min-w-[38px] font-mono font-bold tabular-nums text-[#22C55E] shrink-0">
                          {ev.clock}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                            ev.type === 'goal'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                              : ev.type === 'red-card'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                              : ev.type === 'yellow-card'
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/35'
                              : 'bg-white/10 text-zinc-200'
                          }`}
                        >
                          {ev.typeLabel}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {ev.playerName}
                          </div>
                          {ev.assistOrSubName && (
                            <div className="text-[11px] text-zinc-400 truncate">
                              {ev.type === 'goal'
                                ? `${pickLang(lang, { es: 'Asistencia:', ca: 'Assistència:', en: 'Assist:' })} ${ev.assistOrSubName}`
                                : `${pickLang(lang, { es: 'Sale:', ca: 'Surt:', en: 'Out:' })} ${ev.assistOrSubName}`}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-300 shrink-0 font-mono font-bold">
                        {ev.side === 'home'
                          ? homeShort || resolvedHomeTeam.slice(0, 3).toUpperCase()
                          : ev.side === 'away'
                          ? awayShort || resolvedAwayTeam.slice(0, 3).toUpperCase()
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 p-4 rounded-2xl bg-[#1A1E29] border border-white/[0.06]">
                  {resolvedState === 'upcoming'
                    ? pickLang(lang, {
                        es: 'Aún no ha comenzado el encuentro.',
                        ca: 'Encara no ha començat el partit.',
                        en: 'Match has not kicked off yet.',
                      })
                    : pickLang(lang, {
                        es: 'Sin goles, tarjetas ni sustituciones registradas todavía.',
                        ca: 'Sense gols, targetes ni substitucions registrades encara.',
                        en: 'No goals, cards, or substitutions recorded yet.',
                      })}
                </p>
              )}
            </div>
          )}

          {/* Venue / Info Footer */}
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
