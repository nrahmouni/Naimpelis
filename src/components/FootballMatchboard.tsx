import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
import type {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchDetails,
  FootballMatchboardItem,
  SportsMatch,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { buildChannelFavId } from '../utils/storage';
const LiveMatchCenter = React.lazy(() =>
  import('./LiveMatchCenter').then((m) => ({ default: m.LiveMatchCenter }))
);

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

function formatOffsetDateKey(dayOffset: number): {
  dateKey: string;
  labelEs: string;
  labelCa: string;
  labelEn: string;
} {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(d)
    .replace(/-/g, '');
  if (dayOffset === 0) {
    return { dateKey, labelEs: 'Hoy', labelCa: 'Avui', labelEn: 'Today' };
  }
  if (dayOffset === -1) {
    return { dateKey, labelEs: 'Ayer', labelCa: 'Ahir', labelEn: 'Yesterday' };
  }
  if (dayOffset === 1) {
    return { dateKey, labelEs: 'Mañana', labelCa: 'Demà', labelEn: 'Tomorrow' };
  }
  const shortEs = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  const shortCa = new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  const shortEn = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  return { dateKey, labelEs: shortEs, labelCa: shortCa, labelEn: shortEn };
}

function toSportsMatch(item: FootballMatchboardItem, lang: AppLanguage): SportsMatch {
  return {
    id: item.id,
    title: `${item.homeTeam} vs ${item.awayTeam}`,
    competition: item.groupTitle,
    sport: 'soccer',
    time:
      item.statusState === 'live'
        ? item.statusLabel || pickLang(lang, { es: 'EN DIRECTO', ca: 'EN DIRECTE', en: 'LIVE' })
        : item.kickoffTime,
    isLive: item.statusState === 'live',
    is247Channel: false,
    channels: item.channels,
    matchMeta: {
      eventId: item.eventId,
      fotmobMatchId: item.fotmobMatchId,
      leagueSlug: item.leagueSlug,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      homeShort: item.homeShort,
      awayShort: item.awayShort,
      homeLogo: item.homeLogo,
      awayLogo: item.awayLogo,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      statusState: item.statusState,
      statusLabel: item.statusLabel,
    },
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
  const [detailsMap, setDetailsMap] = useState<Record<string, FootballMatchDetails>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const activeDateInfo = useMemo(() => formatOffsetDateKey(dayOffset), [dayOffset]);
  const activeDateLabel = pickLang(lang, {
    es: activeDateInfo.labelEs,
    ca: activeDateInfo.labelCa,
    en: activeDateInfo.labelEn,
  });

  const fetchBoard = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/sports/football-board?date=${activeDateInfo.dateKey}`);
        const data = await res.json();
        if (Array.isArray(data?.matches)) {
          const rawIncoming: FootballMatchboardItem[] = data.matches;
          const dedupMap = new Map<string, FootballMatchboardItem>();
          for (const item of rawIncoming) {
            const baseKey = String(item.id || `${item.eventId}-${item.kickoffTime}`);
            const uniqueKey = dedupMap.has(baseKey) ? `${baseKey}-${dedupMap.size}` : baseKey;
            dedupMap.set(uniqueKey, { ...item, id: uniqueKey });
          }
          const incoming = Array.from(dedupMap.values());
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
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  const loadMatchDetails = useCallback(
    async (item: FootballMatchboardItem, force = false) => {
      if (!force && detailsMap[item.id] && item.statusState === 'finished') {
        return;
      }
      setLoadingDetailId(item.id);
      try {
        const params = new URLSearchParams({
          eventId: item.eventId,
          leagueSlug: item.leagueSlug,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          date: activeDateInfo.dateKey,
        });
        if (item.fotmobMatchId) {
          params.set('fotmobMatchId', item.fotmobMatchId);
        }
        const res = await fetch(`/api/sports/match-details?${params.toString()}`);
        const data = await res.json();
        if (data?.details) {
          setDetailsMap((prev) => ({ ...prev, [item.id]: data.details }));
        }
      } catch {
        // ignore transient network errors
      } finally {
        setLoadingDetailId((curr) => (curr === item.id ? null : curr));
      }
    },
    [activeDateInfo.dateKey, detailsMap]
  );

  const expandedMatchObj = useMemo(
    () => matches.find((m) => m.id === expandedMatchId) || null,
    [matches, expandedMatchId]
  );

  useEffect(() => {
    if (!expandedMatchObj || expandedMatchObj.statusState !== 'live') return;
    const timer = setInterval(() => {
      loadMatchDetails(expandedMatchObj, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [expandedMatchObj, loadMatchDetails]);

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

  const featuredLiveMatch = useMemo(() => {
    return (
      matches.find((m) => m.statusState === 'live' && m.channels.length > 0) ||
      matches.find((m) => m.statusState === 'live') ||
      matches.find((m) => m.channels.length > 0) ||
      null
    );
  }, [matches]);

  const handleToggleExpand = (item: FootballMatchboardItem) => {
    triggerHaptic('light');
    if (expandedMatchId === item.id) {
      setExpandedMatchId(null);
      return;
    }
    setExpandedMatchId(item.id);
    loadMatchDetails(item, true);
  };

  const handleQuickPlayTv = (e: React.MouseEvent, item: FootballMatchboardItem) => {
    e.stopPropagation();
    triggerHaptic('medium');
    setExpandedMatchId(item.id);
    loadMatchDetails(item, true);
    if (item.channels.length > 0) {
      onPlaySportsMatch(toSportsMatch(item, lang), 0);
    }
  };

  return (
    <section className="rounded-3xl overflow-hidden nc-specular-surface border border-white/[0.1] shadow-2xl">
      {/* Featured Live Match Spotlight Banner */}
      {featuredLiveMatch && !searchQuery.trim() && (
        <div className="relative p-4 sm:p-5 bg-gradient-to-r from-[#13141D] via-[#1B1F2E] to-[#13141D] border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden">
          <div className="flex items-center gap-3 min-w-0 relative z-10">
            <div className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>
                {featuredLiveMatch.statusState === 'live'
                  ? featuredLiveMatch.statusLabel ||
                    pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE' })
                  : featuredLiveMatch.kickoffTime}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 truncate">
                {featuredLiveMatch.groupTitle}
              </div>
              <div className="font-display font-bold text-sm sm:text-base text-white truncate flex items-center gap-2">
                <TeamCrestImg
                  src={featuredLiveMatch.homeLogo}
                  shortCode={featuredLiveMatch.homeShort}
                  alt={featuredLiveMatch.homeTeam}
                />
                <span className="truncate">{featuredLiveMatch.homeTeam}</span>
                <span className="font-mono text-[#FFBD0F] tabular-nums shrink-0">
                  {featuredLiveMatch.homeScore} - {featuredLiveMatch.awayScore}
                </span>
                <span className="truncate">{featuredLiveMatch.awayTeam}</span>
                <TeamCrestImg
                  src={featuredLiveMatch.awayLogo}
                  shortCode={featuredLiveMatch.awayShort}
                  alt={featuredLiveMatch.awayTeam}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative z-10">
            <button
              type="button"
              onClick={() => handleToggleExpand(featuredLiveMatch)}
              className="min-h-[42px] px-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-semibold text-white cursor-pointer transition-all active:scale-95 whitespace-nowrap"
            >
              {pickLang(lang, {
                es: 'Ver Estadísticas y XI',
                ca: 'Estadístiques i XI',
                en: 'Stats & Lineups',
              })}
            </button>
            {featuredLiveMatch.channels.length > 0 && (
              <button
                type="button"
                disabled={Boolean(loadingItemId)}
                onClick={(e) => handleQuickPlayTv(e, featuredLiveMatch)}
                className="min-h-[42px] px-4 rounded-2xl bg-[#FFBD0F] hover:bg-amber-300 text-[#11131A] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-[0_6px_18px_rgba(255,189,15,0.28)] whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {pickLang(lang, { es: 'Ver Partido', ca: 'Veure Partit', en: 'Watch Live' })}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Toolbar: Status Filter Buttons + Day Switcher + Search */}
      <div className="p-3 sm:p-4 bg-[#171A23] border-b border-white/[0.07] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Status Filter Buttons */}
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
              {pickLang(lang, {
                es: `Todas (${matches.length})`,
                ca: `Tots (${matches.length})`,
                en: `All (${matches.length})`,
              })}
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
                {pickLang(lang, {
                  es: `En vivo (${liveCount})`,
                  ca: `En directe (${liveCount})`,
                  en: `Live (${liveCount})`,
                })}
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
              {pickLang(lang, {
                es: `Próximos (${upcomingCount})`,
                ca: `Pròxims (${upcomingCount})`,
                en: `Upcoming (${upcomingCount})`,
              })}
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
              {pickLang(lang, {
                es: `Terminados (${finishedCount})`,
                ca: `Finalitzats (${finishedCount})`,
                en: `Finished (${finishedCount})`,
              })}
            </button>
          </div>

          {/* Date Navigation + Refresh */}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="inline-flex items-center rounded-lg bg-[#242833] border border-white/[0.07]">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset((d) => Math.max(-2, d - 1));
                  setStatusTab('all');
                }}
                aria-label={pickLang(lang, {
                  es: 'Día anterior',
                  ca: 'Dia anterior',
                  en: 'Previous day',
                })}
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
                {activeDateLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset((d) => Math.min(2, d + 1));
                  setStatusTab('all');
                }}
                aria-label={pickLang(lang, {
                  es: 'Día siguiente',
                  ca: 'Dia següent',
                  en: 'Next day',
                })}
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
              aria-label={pickLang(lang, {
                es: 'Actualizar marcadores y señales',
                ca: 'Actualitzar marcadors i senyals',
                en: 'Refresh scores and streams',
              })}
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
            placeholder={pickLang(lang, {
              es: 'Buscar selección, club o liga (España, Real Madrid, Champions, LaLiga...)',
              ca: 'Cercar selecció, club o lliga (Espanya, Barça, Champions, LaLiga...)',
              en: 'Search national team, club or league...',
            })}
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-[#242833] border border-white/[0.07] focus:border-[#FFBD0F]/60 text-sm text-white placeholder:text-zinc-400 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              aria-label={pickLang(lang, {
                es: 'Limpiar búsqueda',
                ca: 'Netejar cerca',
                en: 'Clear search',
              })}
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
            <div
              key={idx}
              className="h-16 bg-[#18181B] px-4 flex items-center justify-between skeleton-shimmer"
            >
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
        <div className="p-8 text-center bg-[#18181B] space-y-3">
          <p className="text-sm text-zinc-300 font-medium">
            {statusTab === 'live'
              ? pickLang(lang, {
                  es: 'No hay partidos en juego en este preciso instante.',
                  ca: 'No hi ha partits en joc en aquest precís instant.',
                  en: 'No matches are currently in play right now.',
                })
              : pickLang(lang, {
                  es: 'No se encontraron partidos con ese filtro.',
                  ca: 'No s’han trobat partits amb aquest filtre.',
                  en: 'No matches found for this filter.',
                })}
          </p>
          {statusTab !== 'all' && matches.length > 0 && (
            <button
              type="button"
              onClick={() => setStatusTab('all')}
              className="min-h-[40px] px-4 rounded-lg bg-[#FFBD0F] text-[#141720] text-xs font-bold cursor-pointer"
            >
              {pickLang(lang, {
                es: `Ver todos los partidos de ${activeDateInfo.labelEs.toLowerCase()} (${matches.length})`,
                ca: `Veure tots els partits d’${activeDateInfo.labelCa.toLowerCase()} (${matches.length})`,
                en: `View all matches (${matches.length})`,
              })}
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
                  const sportsMatchObj = toSportsMatch(item, lang);
                  const primaryCh = item.channels[0];
                  const favId = primaryCh
                    ? buildChannelFavId(primaryCh.sourceUrl, `${item.homeTeam} vs ${item.awayTeam}`)
                    : '';
                  const isSaved = favId ? isChannelFavorited(favId) : false;
                  const isPlayingThisMatch = item.channels.some(
                    (c) => activeVideoRawUrl && c.sourceUrl === activeVideoRawUrl
                  );
                  const isExtracting = Boolean(loadingItemId?.startsWith(item.id));
                  const details = detailsMap[item.id] || null;

                  return (
                    <div key={item.id} className="bg-[#242833]">
                      <div
                        className={`relative px-3 sm:px-4 py-2.5 min-h-[68px] flex items-center gap-3 transition-colors ${
                          isPlayingThisMatch
                            ? 'bg-[#2C3242]'
                            : isExpanded
                            ? 'bg-[#292E3C]'
                            : 'hover:bg-[#2A2F3D]'
                        }`}
                      >
                        {/* Non-nested semantic full-row trigger */}
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(item)}
                          aria-expanded={isExpanded}
                          aria-label={`${item.homeTeam} vs ${item.awayTeam} (${item.kickoffTime})`}
                          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#FFBD0F]"
                        />

                        {/* Left Column: Kickoff HH:MM + Live Minute / Status */}
                        <div className="relative z-[1] pointer-events-none w-12 sm:w-14 shrink-0 flex flex-col items-center justify-center text-center">
                          <span className="text-xs font-mono tabular-nums text-zinc-300">
                            {item.kickoffTime}
                          </span>
                          {item.statusLabel ? (
                            <span
                              className={`text-[11px] font-mono font-bold tabular-nums mt-1 ${
                                item.statusState === 'live' ? 'text-[#22C55E]' : 'text-zinc-400'
                              }`}
                            >
                              {item.statusLabel}
                            </span>
                          ) : null}
                        </div>

                        {/* Middle Column: Flags / Club Crests + Home & Away Team Names */}
                        <div className="relative z-[1] pointer-events-none flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamCrestImg
                              src={item.homeLogo}
                              shortCode={item.homeShort}
                              alt={item.homeTeam}
                            />
                            <span className="text-sm font-medium text-white truncate">
                              {item.homeTeam}
                            </span>
                            {(item.homeRedCards || 0) > 0 && (
                              <span
                                className="w-2 h-3 rounded-[2px] bg-rose-500 shrink-0"
                                title={pickLang(lang, {
                                  es: 'Tarjeta roja',
                                  ca: 'Targeta vermella',
                                  en: 'Red card',
                                })}
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamCrestImg
                              src={item.awayLogo}
                              shortCode={item.awayShort}
                              alt={item.awayTeam}
                            />
                            <span className="text-sm font-medium text-zinc-100 truncate">
                              {item.awayTeam}
                            </span>
                            {(item.awayRedCards || 0) > 0 && (
                              <span
                                className="w-2 h-3 rounded-[2px] bg-rose-500 shrink-0"
                                title={pickLang(lang, {
                                  es: 'Tarjeta roja',
                                  ca: 'Targeta vermella',
                                  en: 'Red card',
                                })}
                              />
                            )}
                          </div>
                        </div>

                        {/* Score Column (Tabular Numerals) */}
                        <div className="relative z-[1] pointer-events-none w-7 shrink-0 flex flex-col items-end justify-center space-y-2 text-right">
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
                        <div className="relative z-10 pointer-events-auto shrink-0 flex flex-col items-center justify-center -my-1">
                          {item.channels.length > 0 && (
                            <button
                              type="button"
                              disabled={Boolean(loadingItemId)}
                              onClick={(e) => handleQuickPlayTv(e, item)}
                              title={pickLang(lang, {
                                es: `Ver señal en directo: ${item.homeTeam} vs ${item.awayTeam}`,
                                ca: `Veure senyal en directe: ${item.homeTeam} vs ${item.awayTeam}`,
                                en: `Watch live: ${item.homeTeam} vs ${item.awayTeam}`,
                              })}
                              aria-label={pickLang(lang, {
                                es: `Ver en directo ${item.homeTeam} contra ${item.awayTeam}`,
                                ca: `Veure en directe ${item.homeTeam} contra ${item.awayTeam}`,
                                en: `Watch live ${item.homeTeam} versus ${item.awayTeam}`,
                              })}
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
                          )}

                          {primaryCh && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                onToggleChannelFavorite({
                                  favId,
                                  title: `${item.homeTeam} vs ${item.awayTeam}`,
                                  channelLabel:
                                    primaryCh.label ||
                                    pickLang(lang, {
                                      es: 'Señal Principal',
                                      ca: 'Senyal Principal',
                                      en: 'Main Feed',
                                    }),
                                  channelUrl: primaryCh.sourceUrl,
                                  competition: item.groupTitle,
                                  sport: 'soccer',
                                });
                              }}
                              aria-label={pickLang(lang, {
                                es: 'Guardar partido en favoritos',
                                ca: 'Desar partit a preferits',
                                en: 'Save match to favorites',
                              })}
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

                      {/* Expanded Panel: Direct Broadcast Servers + LiveMatchCenter */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3.5 sm:px-5 py-4 bg-[#14161F] border-t border-white/[0.07] space-y-4">
                              {/* Server / Signal Selector Strip */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                                  <span className="font-semibold text-zinc-200">
                                    {pickLang(lang, {
                                      es: 'Señales en Directo Disponibles',
                                      ca: 'Senyals en Directe Disponibles',
                                      en: 'Available Live Signals',
                                    })}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedMatchId(null)}
                                    className="inline-flex items-center gap-1 text-zinc-400 hover:text-white cursor-pointer"
                                  >
                                    <span>
                                      {pickLang(lang, {
                                        es: 'Cerrar',
                                        ca: 'Tancar',
                                        en: 'Close',
                                      })}
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                                  </button>
                                </div>

                                {item.channels.length > 0 ? (
                                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                                    {item.channels.map((ch, idx) => {
                                      const isActiveServer = activeVideoRawUrl === ch.sourceUrl;
                                      const latency = ch.health?.latencyMs;
                                      const statusColor =
                                        ch.health?.status === 'up'
                                          ? 'bg-emerald-400'
                                          : ch.health?.status === 'degraded'
                                          ? 'bg-amber-400'
                                          : ch.health?.status === 'down'
                                          ? 'bg-rose-500'
                                          : '';
                                      return (
                                        <div
                                          key={`${item.id}-${ch.id}-${idx}`}
                                          className="inline-flex items-center rounded-xl overflow-hidden shrink-0 border border-white/[0.1]"
                                        >
                                          <button
                                            type="button"
                                            disabled={Boolean(loadingItemId)}
                                            onClick={() => {
                                              triggerHaptic('medium');
                                              onPlaySportsMatch(sportsMatchObj, idx);
                                            }}
                                            className={`min-h-[42px] px-3.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                                              isActiveServer
                                                ? 'bg-[#FFBD0F] text-[#141720]'
                                                : 'bg-[#242833] hover:bg-[#2F3545] text-white'
                                            }`}
                                          >
                                            <Play className="w-3 h-3 fill-current" />
                                            <span>{ch.label}</span>
                                            {statusColor && (
                                              <span className="inline-flex items-center gap-1 text-[10px] font-mono opacity-80">
                                                <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                                                {typeof latency === 'number' && latency > 0
                                                  ? `${latency}ms`
                                                  : null}
                                              </span>
                                            )}
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
                                                title={pickLang(lang, {
                                                  es: 'Abrir en segunda pantalla Multiview',
                                                  ca: 'Obrir en segona pantalla Multiview',
                                                  en: 'Open in Multiview second screen',
                                                })}
                                                aria-label={pickLang(lang, {
                                                  es: 'Abrir en Multiview',
                                                  ca: 'Obrir en Multiview',
                                                  en: 'Open in Multiview',
                                                })}
                                                className="min-h-[42px] px-2.5 bg-[#1D212B] hover:bg-[#2A3040] border-l border-white/[0.08] text-sky-300 flex items-center justify-center cursor-pointer"
                                              >
                                                <Columns2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="px-3.5 py-2.5 rounded-xl bg-[#1E222D] border border-white/[0.07] text-xs text-zinc-300">
                                    {item.statusState === 'finished'
                                      ? pickLang(lang, {
                                          es: 'Encuentro finalizado.',
                                          ca: 'Partit finalitzat.',
                                          en: 'Match finished.',
                                        })
                                      : item.statusState === 'upcoming'
                                      ? pickLang(lang, {
                                          es: `Las señales dedicadas de este partido se activarán minutos antes del inicio (${item.kickoffTime}). También puedes sintonizar beIN SPORTS, ESPN, DSports, TNT Sports, Movistar+ o DAZN arriba.`,
                                          ca: `Els senyals dedicats d’aquest partit s’activaran minuts abans de l’inici (${item.kickoffTime}). També pots sintonitzar beIN SPORTS, ESPN, DSports, TNT Sports, Movistar+ o DAZN a dalt.`,
                                          en: `Dedicated live streams open shortly before kickoff (${item.kickoffTime}).`,
                                        })
                                      : pickLang(lang, {
                                          es: 'Sin enlace dedicado para este encuentro; sintoniza arriba el canal oficial en vivo (beIN SPORTS, ESPN 1–7, DSports, TNT Sports, Movistar+ o DAZN).',
                                          ca: 'Sense enllaç dedicat per a aquest partit; sintonitza a dalt el canal oficial en directe (beIN SPORTS, ESPN 1–7, DSports, TNT Sports, Movistar+ o DAZN).',
                                          en: 'Check the live sports channels bar above (beIN SPORTS, ESPN, DSports, TNT Sports, Movistar+, DAZN).',
                                        })}
                                  </div>
                                )}
                              </div>

                              {/* Real-Time Match Center */}
                              <React.Suspense fallback={null}>
                                <LiveMatchCenter
                                  lang={lang}
                                  details={details}
                                  loading={loadingDetailId === item.id}
                                  homeTeam={item.homeTeam}
                                  awayTeam={item.awayTeam}
                                  homeShort={item.homeShort}
                                  awayShort={item.awayShort}
                                  homeLogo={item.homeLogo}
                                  awayLogo={item.awayLogo}
                                  homeScore={item.homeScore}
                                  awayScore={item.awayScore}
                                  statusState={item.statusState}
                                  statusLabel={item.statusLabel}
                                  competition={item.groupTitle}
                                  variant="expanded"
                                  defaultTab="lineups"
                                  onRefresh={() => loadMatchDetails(item, true)}
                                />
                              </React.Suspense>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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

