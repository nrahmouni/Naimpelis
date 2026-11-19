import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchDetails,
  FootballMatchboardItem,
  SportsMatch,
} from '../types';
import { useAppStore } from '../store/useAppStore';
import { slugify } from '../shared/dedicatedRoutes';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import {
  FootballMatchDetailSheet,
  RegionFlagImg,
  formatOffsetDateKey,
  toSportsMatch,
  type MatchSheetTab,
} from './sports/FootballMatchboardParts';
import {
  getClubHighlightTier,
  getLeaguePriorityRank,
  isBarcaOrRealMadridMatch,
  matchesFootballSearchFilter,
  normalizeFootballText,
  resolveActiveCalendarScope,
} from './sports/FootballMatchboardHelpers';
import { FootballMatchRow } from './sports/FootballMatchRow';

interface FootballMatchboardProps {
  lang: AppLanguage;
  shareRoomId?: string;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  langFilter?: 'all' | 'ZH';
  leagueFilter?: string;
  brandFilter?: string;
  onClearCalendarScope?: () => void;
  activeVideoRawUrl?: string;
  loadingItemId?: string | null;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel?: (match: SportsMatch, channelIndex: number) => void;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (item: Omit<FavoriteChannelItem, 'addedAt'>) => void;
}

type StatusTab = 'live' | 'upcoming' | 'all';

const QUICK_SHORTCUTS = [
  { label: 'Barça · Madrid', query: 'barca madrid' },
  { label: 'Barça', query: 'barcelona' },
  { label: 'Real Madrid', query: 'real madrid' },
  { label: 'Champions', query: 'champions' },
  { label: 'Premier', query: 'premier' },
  { label: 'LaLiga', query: 'laliga' },
] as const;

export const FootballMatchboard: React.FC<FootballMatchboardProps> = ({
  lang,
  shareRoomId,
  searchQuery,
  onSearchQueryChange,
  langFilter = 'all',
  leagueFilter = '',
  brandFilter = 'all',
  onClearCalendarScope,
  activeVideoRawUrl,
  loadingItemId,
  onPlaySportsMatch,
  onPlaySecondaryChannel,
  isChannelFavorited,
  onToggleChannelFavorite,
}) => {
  const dayOffset = useAppStore((s) => s.futbolDayOffset);
  const setDayOffsetStore = useAppStore((s) => s.setFutbolDayOffset);
  const setDayOffset = useCallback(
    (valOrUpdater: number | ((prev: number) => number)) => {
      const curr = useAppStore.getState().futbolDayOffset;
      const next = typeof valOrUpdater === 'function' ? valOrUpdater(curr) : valOrUpdater;
      setDayOffsetStore(next);
    },
    [setDayOffsetStore]
  );

  const statusTab = useAppStore((s) => s.futbolStatusTab);
  const setStatusTabStore = useAppStore((s) => s.setFutbolStatusTab);
  const setStatusTab = useCallback(
    (valOrUpdater: StatusTab | ((prev: StatusTab) => StatusTab)) => {
      const curr = useAppStore.getState().futbolStatusTab;
      const next = typeof valOrUpdater === 'function' ? valOrUpdater(curr) : valOrUpdater;
      setStatusTabStore(next);
    },
    [setStatusTabStore]
  );

  const requestedMatchSlug = useAppStore((s) => s.requestedMatchSlug);
  const setRequestedMatchSlug = useAppStore((s) => s.setRequestedMatchSlug);
  const handledMatchSlugRef = useRef<string | null>(null);

  const [matches, setMatches] = useState<FootballMatchboardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasAutoSelectedTab, setHasAutoSelectedTab] = useState<boolean>(false);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<MatchSheetTab>('signals');
  const [detailsMap, setDetailsMap] = useState<Record<string, FootballMatchDetails>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const activeDateInfo = useMemo(() => formatOffsetDateKey(dayOffset), [dayOffset]);
  const activeDateLabel = pickLang(lang, {
    es: activeDateInfo.labelEs,
    ca: activeDateInfo.labelCa,
    en: activeDateInfo.labelEn,
  });

  const calendarScope = useMemo(
    () => resolveActiveCalendarScope(leagueFilter, searchQuery),
    [leagueFilter, searchQuery]
  );
  const isTeamCalendarScope =
    calendarScope === 'barcelona' ||
    calendarScope === 'real_madrid' ||
    calendarScope === 'barca_madrid';

  useEffect(() => {
    if (leagueFilter || calendarScope) {
      setStatusTab((prev) => (prev === 'live' ? 'all' : prev));
    }
  }, [leagueFilter, calendarScope]);

  const fetchBoard = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({ date: activeDateInfo.dateKey });
        if (calendarScope) {
          params.set('calendar', calendarScope);
        }
        const res = await fetch(`/api/sports/football-board?${params.toString()}`);
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
          if (
            !hasAutoSelectedTab &&
            !requestedMatchSlug &&
            statusTab === 'all' &&
            dayOffset === 0 &&
            !searchQuery.trim() &&
            !leagueFilter
          ) {
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
    [
      activeDateInfo.dateKey,
      calendarScope,
      dayOffset,
      hasAutoSelectedTab,
      leagueFilter,
      requestedMatchSlug,
      searchQuery,
      setStatusTab,
      statusTab,
    ]
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

  const selectedMatchObj = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || null,
    [matches, selectedMatchId]
  );

  useEffect(() => {
    if (!selectedMatchObj || selectedMatchObj.statusState !== 'live') return;
    const timer = setInterval(() => {
      loadMatchDetails(selectedMatchObj, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedMatchObj, loadMatchDetails]);

  useEffect(() => {
    if (!requestedMatchSlug) {
      handledMatchSlugRef.current = null;
      return;
    }
    if (handledMatchSlugRef.current === requestedMatchSlug || matches.length === 0) return;

    const cleanParam = decodeURIComponent(requestedMatchSlug).trim();
    const cleanSlug = slugify(cleanParam);
    const leadingId = cleanParam.match(/^((?:fb-)?[a-z0-9]+)-/i)?.[1] || cleanParam;
    const rawLow = cleanParam.toLowerCase();
    const leadLow = leadingId.toLowerCase();

    const matched = matches.find((m) => {
      const mId = String(m.id || '').toLowerCase();
      const mEvId = String(m.eventId || '').toLowerCase();
      const mFmId = String(m.fotmobMatchId || '').toLowerCase();

      if (
        mId === rawLow ||
        mEvId === rawLow ||
        mFmId === rawLow ||
        mId === `fb-${rawLow}` ||
        mId === leadLow ||
        mEvId === leadLow ||
        mId === `fb-${leadLow}`
      ) {
        return true;
      }

      if (m.homeTeam && m.awayTeam) {
        const vsSlug = slugify(`${m.homeTeam}-vs-${m.awayTeam}`);
        if (vsSlug && (cleanSlug === vsSlug || cleanSlug.endsWith(vsSlug))) {
          return true;
        }
      }
      return false;
    });

    if (matched) {
      handledMatchSlugRef.current = requestedMatchSlug;
      setSheetTab('signals');
      setSelectedMatchId(matched.id);
      loadMatchDetails(matched, true);
    }
  }, [requestedMatchSlug, matches, loadMatchDetails]);

  const filteredMatches = useMemo(() => {
    const lf = normalizeFootballText(leagueFilter);
    return matches.filter((m) => {
      if (statusTab === 'live' && m.statusState !== 'live') return false;
      if (statusTab === 'upcoming' && m.statusState !== 'upcoming') return false;
      if (langFilter === 'ZH') {
        const hasZh = m.channels.some((c) => c.lang === 'ZH' || /中文/.test(c.label || ''));
        if (!hasZh) return false;
      }
      if (brandFilter && brandFilter !== 'all') {
        if (brandFilter === 'movistar') {
          const isM =
            m.spanishBroadcaster?.brand === 'movistar' ||
            m.spanishBroadcaster?.brand === 'dazn_mplus' ||
            m.channels.some((c) => /movistar|m\+/i.test(c.label || ''));
          if (!isM) return false;
        } else if (brandFilter === 'dazn') {
          const isD =
            m.spanishBroadcaster?.brand === 'dazn' ||
            m.spanishBroadcaster?.brand === 'dazn_mplus' ||
            m.channels.some((c) => /dazn/i.test(c.label || ''));
          if (!isD) return false;
        } else if (brandFilter === 'china_football') {
          const hasZh = m.channels.some((c) => c.lang === 'ZH' || /中文/.test(c.label || ''));
          if (!hasZh) return false;
        }
      }
      if (lf) {
        const hayLeague = normalizeFootballText(
          `${m.groupTitle} ${m.leagueSlug} ${m.leagueName} ${m.regionName}`
        );
        if (lf === 'champions') {
          if (!/champions|uefa\.champions|liga de campeones/i.test(hayLeague)) return false;
        } else if (lf === 'laliga' || lf === 'esp.1') {
          if (!/laliga|esp\.1|primera|ea sports/i.test(hayLeague)) return false;
        } else if (lf === 'hypermotion') {
          if (!/hypermotion|segunda|laliga 2|esp\.2/.test(hayLeague)) return false;
        } else if (lf === 'europa') {
          if (!/europa league|uefa\.europa/.test(hayLeague)) return false;
        } else if (lf === 'world') {
          if (!/world|fifa|nations|liga de naciones|euro|qualif|copa america|mundial|internacional|selecciones|friendly|amistoso/.test(hayLeague)) {
            return false;
          }
        } else if (!hayLeague.includes(lf)) {
          return false;
        }
      }
      if (!matchesFootballSearchFilter(m, searchQuery)) return false;
      return true;
    });
  }, [matches, statusTab, searchQuery, langFilter, leagueFilter, brandFilter]);

  const groupedCompetitions = useMemo(() => {
    const getKickoffMs = (m: FootballMatchboardItem) => {
      if (typeof m.kickoffMs === 'number' && m.kickoffMs > 0) return m.kickoffMs;
      const parsed = Date.parse(m.kickoffIso || '');
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    if (isTeamCalendarScope && filteredMatches.length > 0) {
      const timelineTitle =
        calendarScope === 'barca_madrid'
          ? pickLang(lang, {
              es: 'Calendario FC Barcelona y Real Madrid · Próximos partidos',
              ca: 'Calendari FC Barcelona i Real Madrid · Pròxims partits',
              en: 'FC Barcelona & Real Madrid Schedule · Upcoming',
            })
          : calendarScope === 'barcelona'
          ? pickLang(lang, {
              es: 'Calendario FC Barcelona · Todos los próximos partidos',
              ca: 'Calendari FC Barcelona · Tots els pròxims partits',
              en: 'FC Barcelona Schedule · All upcoming fixtures',
            })
          : pickLang(lang, {
              es: 'Calendario Real Madrid · Todos los próximos partidos',
              ca: 'Calendari Real Madrid · Tots els pròxims partits',
              en: 'Real Madrid Schedule · All upcoming fixtures',
            });

      const sortedTimeline = [...filteredMatches].sort((a, b) => {
        if (a.statusState === 'live' && b.statusState !== 'live') return -1;
        if (b.statusState === 'live' && a.statusState !== 'live') return 1;
        const aMs = getKickoffMs(a);
        const bMs = getKickoffMs(b);
        if (aMs !== bMs) return aMs - bMs;
        return a.kickoffTime.localeCompare(b.kickoffTime);
      });

      return [
        {
          key: `team-timeline-${calendarScope}`,
          groupTitle: timelineTitle,
          regionName: 'España',
          regionFlagUrl: 'https://flagcdn.com/w40/es.png',
          items: sortedTimeline,
        },
      ];
    }

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

    for (const grp of groups) {
      grp.items.sort((a, b) => {
        if (a.statusState === 'live' && b.statusState !== 'live') return -1;
        if (b.statusState === 'live' && a.statusState !== 'live') return 1;

        const aMs = getKickoffMs(a);
        const bMs = getKickoffMs(b);
        const aDay = a.kickoffIso?.slice(0, 10) || '';
        const bDay = b.kickoffIso?.slice(0, 10) || '';
        if (calendarScope && aDay && bDay && aDay !== bDay) {
          return aMs - bMs;
        }

        const aClubTier = getClubHighlightTier(a.homeTeam, a.awayTeam);
        const bClubTier = getClubHighlightTier(b.homeTeam, b.awayTeam);
        if (aClubTier !== bClubTier) return bClubTier - aClubTier;
        const aHasEs = a.spanishBroadcaster ? 1 : 0;
        const bHasEs = b.spanishBroadcaster ? 1 : 0;
        if (aHasEs !== bHasEs) return bHasEs - aHasEs;
        if (aMs !== bMs) return aMs - bMs;
        return a.kickoffTime.localeCompare(b.kickoffTime);
      });
    }

    groups.sort((a, b) => {
      const aLive = a.items.some((m) => m.statusState === 'live') ? 1000 : 0;
      const bLive = b.items.some((m) => m.statusState === 'live') ? 1000 : 0;
      const aFeat = a.items.some((m) => isBarcaOrRealMadridMatch(m.homeTeam, m.awayTeam)) ? 260 : 0;
      const bFeat = b.items.some((m) => isBarcaOrRealMadridMatch(m.homeTeam, m.awayTeam)) ? 260 : 0;
      const aBest = a.items.reduce(
        (max, m) => Math.max(max, getLeaguePriorityRank(m.leagueSlug, a.groupTitle, m.homeTeam, m.awayTeam)),
        0
      );
      const bBest = b.items.reduce(
        (max, m) => Math.max(max, getLeaguePriorityRank(m.leagueSlug, b.groupTitle, m.homeTeam, m.awayTeam)),
        0
      );
      return bLive + bFeat + bBest - (aLive + aFeat + aBest);
    });

    return groups;
  }, [filteredMatches, isTeamCalendarScope, calendarScope, lang]);

  const handleOpenMatchSheet = useCallback(
    (item: FootballMatchboardItem, defaultTab: MatchSheetTab = 'signals') => {
      triggerHaptic('light');
      setSheetTab(defaultTab);
      setSelectedMatchId(item.id);
      loadMatchDetails(item, true);
    },
    [loadMatchDetails]
  );

  const handleQuickWatch = useCallback(
    (e: React.MouseEvent, item: FootballMatchboardItem, channelIndex = 0) => {
      e.stopPropagation();
      triggerHaptic('medium');
      if (item.channels.length > 0) {
        const safeIdx = channelIndex >= 0 && channelIndex < item.channels.length ? channelIndex : 0;
        onPlaySportsMatch(toSportsMatch(item, lang), safeIdx);
      } else {
        handleOpenMatchSheet(item, 'stats');
      }
    },
    [onPlaySportsMatch, lang, handleOpenMatchSheet]
  );

  const statusOptions = useMemo(
    () => [
      { id: 'live' as StatusTab, label: pickLang(lang, { es: 'En vivo', ca: 'En directe', en: 'Live' }) },
      { id: 'upcoming' as StatusTab, label: pickLang(lang, { es: 'Próximos', ca: 'Pròxims', en: 'Upcoming' }) },
      { id: 'all' as StatusTab, label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
    ],
    [lang]
  );

  const selectedSportsMatch = selectedMatchObj ? toSportsMatch(selectedMatchObj, lang) : null;
  const selectedMatchDetails = selectedMatchObj ? detailsMap[selectedMatchObj.id] || null : null;

  return (
    <>
      <section className="rounded-3xl overflow-hidden bg-[#10121C] border border-white/[0.08] shadow-[0_12px_36px_rgba(0,0,0,0.45)]">
        <div className="px-3 sm:px-4 py-2.5 bg-[#141724] border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {statusOptions.map((opt) => {
              const active = statusTab === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setStatusTab(opt.id);
                  }}
                  className={`min-h-10 px-3 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#9146FF] text-white'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {calendarScope ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setDayOffset(0);
                if (onClearCalendarScope) {
                  onClearCalendarScope();
                } else {
                  onSearchQueryChange('');
                }
              }}
              className="min-h-10 px-3 rounded-xl bg-[#9146FF]/15 hover:bg-[#9146FF]/25 border border-[#9146FF]/40 text-xs font-bold text-[#E9D5FF] whitespace-nowrap cursor-pointer shrink-0 ml-auto transition-colors"
            >
              {pickLang(lang, { es: 'Volver a Hoy', ca: 'Tornar a Avui', en: 'Back to Today' })}
            </button>
          ) : (
            <div className="inline-flex items-center rounded-xl bg-white/[0.05] border border-white/[0.08] shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset((d) => Math.max(-7, d - 1));
                  setStatusTab('all');
                }}
                aria-label={pickLang(lang, {
                  es: 'Día anterior',
                  ca: 'Dia anterior',
                  en: 'Previous day',
                })}
                className="min-w-10 min-h-10 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset(0);
                }}
                className="px-2 min-h-10 text-xs font-bold text-white whitespace-nowrap cursor-pointer"
              >
                {activeDateLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setDayOffset((d) => Math.min(30, d + 1));
                  setStatusTab('all');
                }}
                aria-label={pickLang(lang, {
                  es: 'Día siguiente',
                  ca: 'Dia següent',
                  en: 'Next day',
                })}
                className="min-w-10 min-h-10 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="px-3 py-2 bg-[#121520] border-b border-white/[0.06] flex items-center flex-wrap gap-1.5">
          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider shrink-0 mr-0.5">
            {pickLang(lang, { es: 'Atajos:', ca: 'Dreceres:', en: 'Shortcuts:' })}
          </span>
          {QUICK_SHORTCUTS.map((sc) => {
            const normQuery = normalizeFootballText(searchQuery);
            const isActive =
              normQuery === sc.query ||
              (sc.query === 'barcelona' && normQuery === 'barca');
            return (
              <button
                key={sc.query}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  if (isActive) {
                    onSearchQueryChange('');
                  } else {
                    setStatusTab('all');
                    onSearchQueryChange(sc.query);
                  }
                }}
                className={`min-h-8 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  isActive
                    ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-sm'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300 hover:text-white'
                }`}
              >
                {sc.label}
              </button>
            );
          })}
        </div>

        {calendarScope && (
          <div className="px-3.5 py-2 bg-[#9146FF]/[0.12] border-b border-[#9146FF]/25 text-[11px]">
            <span className="text-[#E9D5FF] font-semibold leading-snug">
              {pickLang(lang, {
                es: 'Calendario completo · Incluye próximos partidos aunque sean dentro de varias semanas',
                ca: 'Calendari complet · Inclou pròxims partits encara que siguin d’aquí a diverses setmanes',
                en: 'Full upcoming schedule · Includes fixtures weeks ahead',
              })}
            </span>
          </div>
        )}

        {loading && matches.length === 0 ? (
          <div className="divide-y divide-white/[0.06]">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-20 bg-[#10121C] px-4 flex items-center justify-between skeleton-shimmer"
              >
                <div className="w-14 h-7 rounded bg-white/[0.06]" />
                <div className="flex-1 mx-4 space-y-2">
                  <div className="w-40 h-3.5 rounded bg-white/[0.07]" />
                  <div className="w-32 h-3.5 rounded bg-white/[0.05]" />
                </div>
                <div className="w-20 h-10 rounded-xl bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : groupedCompetitions.length === 0 ? (
          <div className="p-8 text-center bg-[#10121C] space-y-3">
            <p className="text-sm text-zinc-300 font-medium">
              {statusTab === 'live'
                ? pickLang(lang, {
                    es: 'No hay partidos en vivo ahora mismo.',
                    ca: 'No hi ha partits en directe ara mateix.',
                    en: 'No live matches right now.',
                  })
                : pickLang(lang, {
                    es: 'No hay partidos con estos filtros.',
                    ca: 'No hi ha partits amb aquests filtres.',
                    en: 'No matches match these filters.',
                  })}
            </p>
            {statusTab !== 'all' && matches.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusTab('all')}
                className="min-h-12 px-5 rounded-2xl bg-[#9146FF] text-white text-xs font-bold cursor-pointer"
              >
                {pickLang(lang, {
                  es: 'Ver todos los partidos',
                  ca: 'Veure tots els partits',
                  en: 'View all matches',
                })}
              </button>
            )}
          </div>
        ) : (
          <div>
            {groupedCompetitions.map((group) => (
              <div key={group.key}>
                <div className="px-3.5 sm:px-4 py-2.5 bg-[#151824] border-y border-white/[0.06] flex items-center gap-2.5">
                  <RegionFlagImg
                    src={group.regionFlagUrl}
                    alt={group.regionName}
                    groupTitle={group.groupTitle}
                  />
                  <h3 className="text-xs font-bold text-zinc-200 leading-snug break-words">
                    {group.groupTitle}
                  </h3>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {group.items.map((item) => (
                    <FootballMatchRow
                      key={item.id}
                      item={item}
                      lang={lang}
                      shareRoomId={shareRoomId}
                      showLeagueBadge={isTeamCalendarScope}
                      showZhIndicator={langFilter === 'ZH' || brandFilter === 'china_football'}
                      activeVideoRawUrl={activeVideoRawUrl}
                      loadingItemId={loadingItemId}
                      isChannelFavorited={isChannelFavorited}
                      onToggleChannelFavorite={onToggleChannelFavorite}
                      onOpenMatchSheet={(m) => handleOpenMatchSheet(m, 'signals')}
                      onQuickWatch={handleQuickWatch}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <FootballMatchDetailSheet
        lang={lang}
        shareRoomId={shareRoomId}
        showZhIndicator={langFilter === 'ZH' || brandFilter === 'china_football'}
        selectedMatchObj={selectedMatchObj}
        selectedSportsMatch={selectedSportsMatch}
        selectedMatchDetails={selectedMatchDetails}
        sheetTab={sheetTab}
        setSheetTab={setSheetTab}
        activeVideoRawUrl={activeVideoRawUrl}
        loadingItemId={loadingItemId}
        loadingDetailId={loadingDetailId}
        onClose={() => {
          setSelectedMatchId(null);
          setRequestedMatchSlug(null);
        }}
        onLoadDetails={loadMatchDetails}
        onPlaySportsMatch={onPlaySportsMatch}
        onPlaySecondaryChannel={onPlaySecondaryChannel}
      />
    </>
  );
};
