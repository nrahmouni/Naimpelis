import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Star,
  Tv,
  X,
} from 'lucide-react';
import {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchDetails,
  FootballMatchboardItem,
  SportsMatch,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { buildChannelFavId } from '../utils/storage';

interface FootballMatchboardProps {
  lang: AppLanguage;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  activeVideoRawUrl?: string;
  loadingItemId?: string | null;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel?: (match: SportsMatch, channelIndex: number) => void;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (item: Omit<FavoriteChannelItem, 'addedAt'>) => void;
}

type StatusTab = 'all' | 'live' | 'upcoming' | 'finished';

function formatOffsetDateKey(dayOffset: number): { dateKey: string; labelEs: string; labelEn: string } {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(d)
    .replace(/-/g, '');
  if (dayOffset === 0) {
    return { dateKey, labelEs: 'Hoy', labelEn: 'Today' };
  }
  if (dayOffset === -1) {
    return { dateKey, labelEs: 'Ayer', labelEn: 'Yesterday' };
  }
  if (dayOffset === 1) {
    return { dateKey, labelEs: 'Mañana', labelEn: 'Tomorrow' };
  }
  const shortEs = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  const shortEn = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  return { dateKey, labelEs: shortEs, labelEn: shortEn };
}

function toSportsMatch(item: FootballMatchboardItem): SportsMatch {
  return {
    id: item.id,
    title: `${item.homeTeam} vs ${item.awayTeam}`,
    competition: item.groupTitle,
    sport: 'soccer',
    time: item.statusState === 'live' ? item.statusLabel || 'EN DIRECTO' : item.kickoffTime,
    isLive: item.statusState === 'live',
    is247Channel: false,
    channels: item.channels,
  };
}

const TeamCrestImg: React.FC<{
  src?: string;
  shortCode: string;
  alt: string;
}> = ({ src, shortCode, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-[9px] font-bold text-zinc-200 shrink-0"
      >
        {shortCode.slice(0, 2) || <Shield className="w-3 h-3 text-zinc-400" />}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-5 h-5 object-contain shrink-0"
    />
  );
};

const RegionFlagImg: React.FC<{
  src?: string;
  alt: string;
}> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <Shield className="w-4 h-4 text-zinc-400 shrink-0" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-5 h-3.5 rounded-[2px] object-cover shrink-0 border border-white/10"
    />
  );
};

export const FootballMatchboard: React.FC<FootballMatchboardProps> = ({
  lang,
  searchQuery,
  onSearchQueryChange,
  activeVideoRawUrl,
  loadingItemId,
  onPlaySportsMatch,
  onPlaySecondaryChannel,
  isChannelFavorited,
  onToggleChannelFavorite,
}) => {
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [matches, setMatches] = useState<FootballMatchboardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasAutoSelectedTab, setHasAutoSelectedTab] = useState<boolean>(false);

  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'lineups'>('overview');
  const [detailsMap, setDetailsMap] = useState<Record<string, FootballMatchDetails>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const activeDateInfo = useMemo(() => formatOffsetDateKey(dayOffset), [dayOffset]);

  const fetchBoard = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/sports/football-board?date=${activeDateInfo.dateKey}`);
        const data = await res.json();
        if (Array.isArray(data?.matches)) {
          const incoming: FootballMatchboardItem[] = data.matches;
          setMatches(incoming);
          if (!hasAutoSelectedTab && dayOffset === 0) {
            const liveTotal = incoming.filter((m) => m.statusState === 'live').length;
            if (liveTotal > 0) {
              setStatusTab('live');
            }
            setHasAutoSelectedTab(true);
          }
        }
      } catch {
        // retain previous matches on transient network hiccup
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeDateInfo.dateKey, dayOffset, hasAutoSelectedTab]
  );

  useEffect(() => {
    fetchBoard(false);
    const interval = setInterval(() => {
      fetchBoard(true);
    }, 35000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  const loadMatchDetails = useCallback(
    async (item: FootballMatchboardItem) => {
      if (detailsMap[item.eventId] && item.statusState === 'finished') {
        return;
      }
      setLoadingDetailId(item.id);
      try {
        const res = await fetch(
          `/api/sports/match-details?eventId=${encodeURIComponent(
            item.eventId
          )}&leagueSlug=${encodeURIComponent(item.leagueSlug)}`
        );
        const data = await res.json();
        if (data?.details) {
          setDetailsMap((prev) => ({ ...prev, [item.eventId]: data.details }));
        }
      } catch {
        // ignore
      } finally {
        setLoadingDetailId((curr) => (curr === item.id ? null : curr));
      }
    },
    [detailsMap]
  );

  const liveCount = useMemo(
    () => matches.filter((m) => m.statusState === 'live').length,
    [matches]
  );
  const upcomingCount = useMemo(
    () => matches.filter((m) => m.statusState === 'upcoming').length,
    [matches]
  );
  const finishedCount = useMemo(
    () => matches.filter((m) => m.statusState === 'finished').length,
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (statusTab === 'live' && m.statusState !== 'live') return false;
      if (statusTab === 'upcoming' && m.statusState !== 'upcoming') return false;
      if (statusTab === 'finished' && m.statusState !== 'finished') return false;
      if (q) {
        const hay = `${m.homeTeam} ${m.awayTeam} ${m.groupTitle} ${m.regionName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [matches, statusTab, searchQuery]);

  const groupedCompetitions = useMemo(() => {
    const groups: {
      key: string;
      groupTitle: string;
      regionName: string;
      regionFlagUrl: string;
      items: FootballMatchboardItem[];
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const item of filteredMatches) {
      const key = `${item.leagueSlug}-${item.groupTitle}`;
      let grp = map.get(key);
      if (!grp) {
        grp = {
          key,
          groupTitle: item.groupTitle,
          regionName: item.regionName,
          regionFlagUrl: item.regionFlagUrl,
          items: [],
        };
        map.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(item);
    }
    return groups;
  }, [filteredMatches]);

  const handleToggleExpand = (item: FootballMatchboardItem) => {
    triggerHaptic('light');
    if (expandedMatchId === item.id) {
      setExpandedMatchId(null);
      return;
    }
    setExpandedMatchId(item.id);
    setDetailTab('overview');
    loadMatchDetails(item);
  };

  const handleQuickPlayTv = (e: React.MouseEvent, item: FootballMatchboardItem) => {
    e.stopPropagation();
    triggerHaptic('medium');
    setExpandedMatchId(item.id);
    loadMatchDetails(item);
    if (item.channels.length > 0) {
      onPlaySportsMatch(toSportsMatch(item), 0);
    }
  };

  return (
    <section className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#1B1E28] shadow-xl">
      {/* Top Toolbar: Status Filter Buttons + Day Switcher + Search */}
      <div className="p-3 sm:p-4 bg-[#171A23] border-b border-white/[0.07] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Status Filter Buttons: Todas | En vivo(N) | Próximos | Terminados */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStatusTab('all');
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusTab === 'all'
                  ? 'bg-[#FFBD0F] text-[#141720]'
                  : 'bg-[#2A2F3D] hover:bg-[#343A4B] text-zinc-300'
              }`}
            >
              {lang === 'es' ? `Todas (${matches.length})` : `All (${matches.length})`}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStatusTab('live');
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusTab === 'live'
                  ? 'bg-[#FFBD0F] text-[#141720]'
                  : 'bg-[#2A2F3D] hover:bg-[#343A4B] text-zinc-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>
                {lang === 'es' ? `En vivo(${liveCount})` : `Live(${liveCount})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStatusTab('upcoming');
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusTab === 'upcoming'
                  ? 'bg-[#FFBD0F] text-[#141720]'
                  : 'bg-[#2A2F3D] hover:bg-[#343A4B] text-zinc-300'
              }`}
            >
              {lang === 'es' ? `Próximos (${upcomingCount})` : `Upcoming (${upcomingCount})`}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStatusTab('finished');
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusTab === 'finished'
                  ? 'bg-[#FFBD0F] text-[#141720]'
                  : 'bg-[#2A2F3D] hover:bg-[#343A4B] text-zinc-300'
              }`}
            >
              {lang === 'es' ? `Terminados (${finishedCount})` : `Finished (${finishedCount})`}
            </button>
          </div>

          {/* Date Navigation (Ayer / Hoy / Mañana) + Refresh */}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="inline-flex items-center rounded-lg bg-[#242833] border border-white/[0.07]">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset((d) => Math.max(-2, d - 1));
                  setStatusTab('all');
                }}
                aria-label="Día anterior"
                className="min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset(0);
                }}
                className="px-2.5 min-h-[38px] text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              >
                {lang === 'es' ? activeDateInfo.labelEs : activeDateInfo.labelEn}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset((d) => Math.min(2, d + 1));
                  setStatusTab('all');
                }}
                aria-label="Día siguiente"
                className="min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                fetchBoard(false);
              }}
              aria-label="Actualizar marcadores y señales"
              className="min-w-[38px] min-h-[38px] rounded-lg bg-[#242833] hover:bg-[#2E3442] border border-white/[0.07] flex items-center justify-center text-zinc-200 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#FFBD0F]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Inline Quick Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={
              lang === 'es'
                ? 'Buscar selección, club o liga (España, Real Madrid, Champions, LaLiga...)'
                : 'Search national team, club or league...'
            }
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-[#242833] border border-white/[0.07] focus:border-[#FFBD0F]/60 text-sm text-white placeholder:text-zinc-400 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              aria-label="Limpiar búsqueda"
              className="w-9 h-9 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Matchboard Body */}
      {loading && matches.length === 0 ? (
        <div className="divide-y divide-white/[0.05]">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-16 bg-[#242833] px-4 flex items-center justify-between animate-pulse">
              <div className="w-12 h-7 rounded bg-white/[0.06]" />
              <div className="flex-1 mx-4 space-y-2">
                <div className="w-40 h-3.5 rounded bg-white/[0.07]" />
                <div className="w-32 h-3.5 rounded bg-white/[0.05]" />
              </div>
              <div className="w-16 h-8 rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      ) : groupedCompetitions.length === 0 ? (
        <div className="p-8 text-center bg-[#242833] space-y-3">
          <p className="text-sm text-zinc-300 font-medium">
            {statusTab === 'live'
              ? lang === 'es'
                ? 'No hay partidos en juego en este preciso instante.'
                : 'No matches are currently in play right now.'
              : lang === 'es'
              ? 'No se encontraron partidos con ese filtro.'
              : 'No matches found for this filter.'}
          </p>
          {statusTab !== 'all' && matches.length > 0 && (
            <button
              type="button"
              onClick={() => setStatusTab('all')}
              className="min-h-[40px] px-4 rounded-lg bg-[#FFBD0F] text-[#141720] text-xs font-bold cursor-pointer"
            >
              {lang === 'es'
                ? `Ver todos los partidos de ${activeDateInfo.labelEs.toLowerCase()} (${matches.length})`
                : `View all matches (${matches.length})`}
            </button>
          )}
        </div>
      ) : (
        <div>
          {groupedCompetitions.map((group) => (
            <div key={group.key}>
              {/* Competition Group Header with Region Flag */}
              <div className="px-3.5 sm:px-4 py-2 bg-[#181B24] border-y border-white/[0.06] flex items-center gap-2.5">
                <RegionFlagImg src={group.regionFlagUrl} alt={group.regionName} />
                <h3 className="text-xs sm:text-[13px] font-semibold text-zinc-300 truncate">
                  {group.groupTitle}
                </h3>
              </div>

              {/* Match Rows */}
              <div className="divide-y divide-white/[0.06]">
                {group.items.map((item) => {
                  const isExpanded = expandedMatchId === item.id;
                  const sportsMatchObj = toSportsMatch(item);
                  const primaryCh = item.channels[0];
                  const favId = primaryCh
                    ? buildChannelFavId(primaryCh.sourceUrl, `${item.homeTeam} vs ${item.awayTeam}`)
                    : '';
                  const isSaved = favId ? isChannelFavorited(favId) : false;
                  const isPlayingThisMatch = item.channels.some(
                    (c) => activeVideoRawUrl && c.sourceUrl === activeVideoRawUrl
                  );
                  const isExtracting = Boolean(loadingItemId?.startsWith(item.id));
                  const details = detailsMap[item.eventId];

                  return (
                    <div key={item.id} className="bg-[#242833]">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleToggleExpand(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleToggleExpand(item);
                          }
                        }}
                        className={`px-3 sm:px-4 py-2.5 min-h-[68px] flex items-center gap-3 cursor-pointer transition-colors ${
                          isPlayingThisMatch
                            ? 'bg-[#2C3242]'
                            : isExpanded
                            ? 'bg-[#292E3C]'
                            : 'hover:bg-[#2A2F3D]'
                        }`}
                      >
                        {/* Left Column: Kickoff HH:MM + Live Minute / Status */}
                        <div className="w-12 sm:w-14 shrink-0 flex flex-col items-center justify-center text-center">
                          <span className="text-xs font-mono tabular-nums text-zinc-300">
                            {item.kickoffTime}
                          </span>
                          {item.statusLabel ? (
                            <span
                              className={`text-[11px] font-mono font-bold tabular-nums mt-1 ${
                                item.statusState === 'live'
                                  ? 'text-[#22C55E]'
                                  : 'text-zinc-400'
                              }`}
                            >
                              {item.statusLabel}
                            </span>
                          ) : null}
                        </div>

                        {/* Middle Column: Flags / Club Crests + Home & Away Team Names */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamCrestImg
                              src={item.homeLogo}
                              shortCode={item.homeShort}
                              alt={item.homeTeam}
                            />
                            <span className="text-sm font-medium text-white truncate">
                              {item.homeTeam}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamCrestImg
                              src={item.awayLogo}
                              shortCode={item.awayShort}
                              alt={item.awayTeam}
                            />
                            <span className="text-sm font-medium text-zinc-100 truncate">
                              {item.awayTeam}
                            </span>
                          </div>
                        </div>

                        {/* Score Column (Tabular Numerals) */}
                        <div className="w-7 shrink-0 flex flex-col items-end justify-center space-y-2 text-right">
                          <span
                            className={`text-sm font-mono font-bold tabular-nums ${
                              item.statusState === 'live' ? 'text-white' : 'text-zinc-200'
                            }`}
                          >
                            {item.homeScore}
                          </span>
                          <span
                            className={`text-sm font-mono font-bold tabular-nums ${
                              item.statusState === 'live' ? 'text-white' : 'text-zinc-200'
                            }`}
                          >
                            {item.awayScore}
                          </span>
                        </div>

                        {/* Right Action Column: Direct TV Play Button + Favorite Star */}
                        <div className="shrink-0 flex flex-col items-center justify-center -my-1">
                          <button
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={(e) => handleQuickPlayTv(e, item)}
                            title={
                              lang === 'es'
                                ? `Ver señal en directo: ${item.homeTeam} vs ${item.awayTeam}`
                                : `Watch live: ${item.homeTeam} vs ${item.awayTeam}`
                            }
                            aria-label={`Ver en directo ${item.homeTeam} contra ${item.awayTeam}`}
                            className="min-w-[44px] min-h-[34px] flex items-center justify-center text-[#FFBD0F] hover:text-amber-300 cursor-pointer transition-transform active:scale-95"
                          >
                            {isExtracting ? (
                              <Loader2 className="w-4 h-4 animate-spin text-[#FFBD0F]" />
                            ) : (
                              <span className="relative inline-flex items-center justify-center">
                                <Tv className="w-5 h-5 stroke-[2.2]" />
                                <Play className="w-2 h-2 fill-current absolute top-[7px]" />
                              </span>
                            )}
                          </button>

                          {primaryCh && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                onToggleChannelFavorite({
                                  favId,
                                  title: `${item.homeTeam} vs ${item.awayTeam}`,
                                  channelLabel: primaryCh.label || 'Señal Principal',
                                  channelUrl: primaryCh.sourceUrl,
                                  competition: item.groupTitle,
                                  sport: 'soccer',
                                });
                              }}
                              aria-label="Guardar partido en favoritos"
                              className="min-w-[44px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-[#FFBD0F] cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  isSaved ? 'fill-current text-[#FFBD0F]' : ''
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Panel: Direct Broadcast Servers + Live Stats & Lineups */}
                      {isExpanded && (
                        <div className="px-3.5 sm:px-5 py-4 bg-[#151821] border-t border-white/[0.07] space-y-4">
                          {/* Server / Signal Selector Strip */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                              <span className="font-semibold text-zinc-200">
                                {lang === 'es'
                                  ? 'Señales en Directo Disponibles'
                                  : 'Available Live Signals'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedMatchId(null)}
                                className="inline-flex items-center gap-1 text-zinc-400 hover:text-white cursor-pointer"
                              >
                                <span>{lang === 'es' ? 'Cerrar' : 'Close'}</span>
                                <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                              {item.channels.map((ch, idx) => {
                                const isActiveServer = activeVideoRawUrl === ch.sourceUrl;
                                return (
                                  <div
                                    key={ch.id}
                                    className="inline-flex items-center rounded-lg overflow-hidden shrink-0 border border-white/[0.1]"
                                  >
                                    <button
                                      type="button"
                                      disabled={Boolean(loadingItemId)}
                                      onClick={() => {
                                        triggerHaptic('medium');
                                        onPlaySportsMatch(sportsMatchObj, idx);
                                      }}
                                      className={`min-h-[40px] px-3.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                                        isActiveServer
                                          ? 'bg-[#FFBD0F] text-[#141720]'
                                          : 'bg-[#242833] hover:bg-[#2F3545] text-white'
                                      }`}
                                    >
                                      <Play className="w-3 h-3 fill-current" />
                                      <span>{ch.label}</span>
                                    </button>

                                    {activeVideoRawUrl &&
                                      !isActiveServer &&
                                      onPlaySecondaryChannel && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            triggerHaptic('light');
                                            onPlaySecondaryChannel(sportsMatchObj, idx);
                                          }}
                                          title="Abrir en segunda pantalla Multiview"
                                          aria-label="Abrir en Multiview"
                                          className="min-h-[40px] px-2.5 bg-[#1D212B] hover:bg-[#2A3040] border-l border-white/[0.08] text-sky-300 flex items-center justify-center cursor-pointer"
                                        >
                                          <Columns2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Match Center Sub-Tabs: General (Stats & Events) | Alineaciones */}
                          <div className="space-y-3 pt-1 border-t border-white/[0.06]">
                            <div className="flex items-center gap-4 border-b border-white/[0.06]">
                              <button
                                type="button"
                                onClick={() => setDetailTab('overview')}
                                className={`pb-2 text-xs font-bold whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
                                  detailTab === 'overview'
                                    ? 'border-[#FFBD0F] text-[#FFBD0F]'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {lang === 'es' ? 'General y Estadísticas' : 'Overview & Stats'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailTab('lineups')}
                                className={`pb-2 text-xs font-bold whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
                                  detailTab === 'lineups'
                                    ? 'border-[#FFBD0F] text-[#FFBD0F]'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {lang === 'es' ? 'Alineaciones' : 'Lineups'}
                              </button>
                              {details?.venue && (
                                <span className="ml-auto pb-2 text-[11px] text-zinc-400 truncate max-w-[180px] sm:max-w-xs">
                                  {details.venue}
                                </span>
                              )}
                            </div>

                            {loadingDetailId === item.id && !details ? (
                              <div className="py-6 flex items-center justify-center gap-2 text-xs text-zinc-400">
                                <Loader2 className="w-4 h-4 animate-spin text-[#FFBD0F]" />
                                <span>
                                  {lang === 'es'
                                    ? 'Cargando datos en tiempo real del partido...'
                                    : 'Loading live match data...'}
                                </span>
                              </div>
                            ) : detailTab === 'overview' ? (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Comparative Stats Bars */}
                                <div className="space-y-2.5">
                                  <h4 className="text-xs font-semibold text-zinc-300">
                                    {lang === 'es' ? 'Estadísticas del Partido' : 'Match Statistics'}
                                  </h4>
                                  {details && details.stats.length > 0 ? (
                                    <div className="space-y-2.5">
                                      {details.stats.map((st) => (
                                        <div key={st.key} className="space-y-1">
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="font-mono font-bold tabular-nums text-white">
                                              {st.homeValue}
                                            </span>
                                            <span className="text-zinc-400">{st.label}</span>
                                            <span className="font-mono font-bold tabular-nums text-white">
                                              {st.awayValue}
                                            </span>
                                          </div>
                                          <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden flex">
                                            <div
                                              style={{ width: `${st.homePct}%` }}
                                              className="bg-[#FFBD0F] h-full transition-opacity"
                                            />
                                            <div
                                              style={{ width: `${st.awayPct}%` }}
                                              className="bg-sky-500 h-full transition-opacity"
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-zinc-400 py-2">
                                      {item.statusState === 'upcoming'
                                        ? 'Las estadísticas en vivo se activarán al comenzar el encuentro.'
                                        : 'Estadísticas detalladas no disponibles para este encuentro.'}
                                    </p>
                                  )}
                                </div>

                                {/* Key Match Timeline Events */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-zinc-300">
                                    {lang === 'es' ? 'Eventos Clave' : 'Key Events'}
                                  </h4>
                                  {details && details.events.length > 0 ? (
                                    <div className="divide-y divide-white/[0.05] max-h-56 overflow-y-auto pr-1">
                                      {details.events.map((ev) => (
                                        <div
                                          key={ev.id}
                                          className="py-2 flex items-center justify-between gap-2 text-xs"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-9 font-mono font-bold tabular-nums text-[#22C55E] shrink-0">
                                              {ev.clock}
                                            </span>
                                            <span className="text-zinc-400 shrink-0">
                                              {ev.typeLabel} ·
                                            </span>
                                            <span className="font-medium text-white truncate">
                                              {ev.playerName}
                                            </span>
                                          </div>
                                          <span className="text-[11px] text-zinc-400 shrink-0">
                                            {ev.side === 'home'
                                              ? item.homeShort
                                              : ev.side === 'away'
                                              ? item.awayShort
                                              : ''}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-zinc-400 py-2">
                                      {item.statusState === 'upcoming'
                                        ? `Inicio programado a las ${item.kickoffTime}.`
                                        : 'Sin goles ni tarjetas registradas.'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              /* Lineups View */
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                  { team: item.homeTeam, lineup: details?.homeLineup },
                                  { team: item.awayTeam, lineup: details?.awayLineup },
                                ].map(({ team, lineup }, idx) => (
                                  <div key={idx} className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-bold text-white truncate">{team}</span>
                                      {lineup?.formation && (
                                        <span className="font-mono tabular-nums text-zinc-400">
                                          {lineup.formation}
                                        </span>
                                      )}
                                    </div>
                                    {lineup && lineup.starters.length > 0 ? (
                                      <div className="divide-y divide-white/[0.05] text-xs">
                                        {lineup.starters.map((p) => (
                                          <div
                                            key={p.id}
                                            className="py-1.5 flex items-center justify-between gap-2"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="w-6 font-mono tabular-nums text-zinc-400 shrink-0">
                                                {p.jersey}
                                              </span>
                                              <span className="text-zinc-100 truncate">
                                                {p.name}
                                              </span>
                                            </div>
                                            {p.position && (
                                              <span className="text-[11px] text-zinc-500 shrink-0">
                                                {p.position}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-zinc-400 py-2">
                                        {lang === 'es'
                                          ? 'Once titular aún no confirmado.'
                                          : 'Starting lineup not confirmed yet.'}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
