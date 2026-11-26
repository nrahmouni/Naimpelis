import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchDetails,
  FootballMatchboardItem,
  MultiScreenSourceInput,
  SportsMatch,
} from '../types';
import { useAppStore } from '../store/useAppStore';
import { slugify } from '../shared/dedicatedRoutes';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { buildChannelFavId } from '../utils/storage';
import {
  FootballMatchDetailSheet,
  RegionFlagImg,
  computeDayOffsetFromIsoDate,
  formatOffsetDateKey,
  toSportsMatch,
  type MatchSheetTab,
} from './sports/FootballMatchboardParts';
import {
  getClubHighlightTier,
  getLeaguePriorityRank,
  isBarcaOrRealMadridMatch,
  isPrioritySpanishHighlightMatch,
  isSpainNationalTeamMatch,
  matchesFootballSearchFilter,
  normalizeFootballText,
  pickPreferredChannelIndex,
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
  onSelectLeagueFilter?: (val: string) => void;
  brandFilter?: string;
  favoritesOnly?: boolean;
  onClearCalendarScope?: () => void;
  onResetFilters?: () => void;
  activeVideoRawUrl?: string;
  activeMultiUrls?: string[];
  loadingItemId?: string | null;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel?: (match: SportsMatch, channelIndex: number) => void;
  onAddToMultiScreen?: (source: MultiScreenSourceInput) => void;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (item: Omit<FavoriteChannelItem, 'addedAt'>) => void;
}

type StatusTab = 'live' | 'upcoming' | 'all';

export const FootballMatchboard: React.FC<FootballMatchboardProps> = ({
  lang,
  shareRoomId,
  searchQuery,
  onSearchQueryChange,
  langFilter = 'all',
  leagueFilter = '',
  onSelectLeagueFilter,
  brandFilter = 'all',
  favoritesOnly = false,
  onClearCalendarScope,
  onResetFilters,
  activeVideoRawUrl,
  activeMultiUrls = [],
  loadingItemId,
  onPlaySportsMatch,
  onPlaySecondaryChannel,
  onAddToMultiScreen,
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
  const [loadedBoardKey, setLoadedBoardKey] = useState<string>('');
  const [fetchError, setFetchError] = useState<boolean>(false);
  const hasAutoSelectedTabRef = useRef<boolean>(false);
  const statusTabRef = useRef<StatusTab>(statusTab);
  statusTabRef.current = statusTab;
  const dayOffsetRef = useRef<number>(dayOffset);
  dayOffsetRef.current = dayOffset;
  const searchQueryRef = useRef<string>(searchQuery);
  searchQueryRef.current = searchQuery;
  const leagueFilterRef = useRef<string>(leagueFilter);
  leagueFilterRef.current = leagueFilter;
  const requestedMatchSlugRef = useRef<string | null>(requestedMatchSlug);
  requestedMatchSlugRef.current = requestedMatchSlug;
  const boardSeqRef = useRef<number>(0);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<MatchSheetTab>('signals');
  const [detailsMap, setDetailsMap] = useState<Record<string, FootballMatchDetails>>({});
  const detailsMapRef = useRef<Record<string, FootballMatchDetails>>(detailsMap);
  detailsMapRef.current = detailsMap;
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
  const currentBoardKey = `${activeDateInfo.dateKey}:${calendarScope || 'daily'}:${lang}`;
  const isTeamCalendarScope =
    calendarScope === 'barcelona' ||
    calendarScope === 'real_madrid' ||
    calendarScope === 'barca_madrid' ||
    calendarScope === 'espana';

  useEffect(() => {
    if (leagueFilter || calendarScope) {
      setStatusTab((prev) => (prev === 'live' ? 'all' : prev));
    }
  }, [leagueFilter, calendarScope, setStatusTab]);

  const fetchBoard = useCallback(
    async (silent = false) => {
      const seq = ++boardSeqRef.current;
      const reqKey = `${activeDateInfo.dateKey}:${calendarScope || 'daily'}:${lang}`;
      if (!silent) {
        setLoading(true);
        setFetchError(false);
      }
      try {
        const params = new URLSearchParams({
          date: activeDateInfo.dateKey,
          lang,
        });
        if (calendarScope) {
          params.set('calendar', calendarScope);
        }
        const res = await fetch(`/api/sports/football-board?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (seq !== boardSeqRef.current) return;
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
          setLoadedBoardKey(reqKey);
          setFetchError(false);
          if (
            !hasAutoSelectedTabRef.current &&
            !requestedMatchSlugRef.current &&
            statusTabRef.current === 'all' &&
            dayOffsetRef.current === 0 &&
            !searchQueryRef.current.trim() &&
            !leagueFilterRef.current
          ) {
            const liveTotal = incoming.filter((m) => m.statusState === 'live').length;
            if (liveTotal > 0) {
              setStatusTab('live');
            }
            hasAutoSelectedTabRef.current = true;
          }
        }
      } catch {
        if (seq === boardSeqRef.current && !silent) {
          setFetchError(true);
        }
      } finally {
        if (seq === boardSeqRef.current && !silent) setLoading(false);
      }
    },
    [activeDateInfo.dateKey, calendarScope, lang, setStatusTab]
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
      if (!force && detailsMapRef.current[item.id] && item.statusState === 'finished') {
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
    [activeDateInfo.dateKey]
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

  const deferredSearchQuery = useDeferredValue(searchQuery);

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
        if (lf === 'barca_madrid') {
          if (!isBarcaOrRealMadridMatch(m.homeTeam, m.awayTeam)) return false;
        } else if (lf === 'espana') {
          if (!isSpainNationalTeamMatch(m.homeTeam, m.awayTeam)) return false;
        } else if (lf === 'champions') {
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
      if (!matchesFootballSearchFilter(m, deferredSearchQuery)) return false;
      if (favoritesOnly) {
        const prefIdx = pickPreferredChannelIndex(m.channels, lang, langFilter === 'ZH');
        const primaryCh = prefIdx >= 0 ? m.channels[prefIdx] : m.channels[0];
        const favId = buildChannelFavId(
          primaryCh?.sourceUrl || m.eventId || m.id,
          `${m.homeTeam} vs ${m.awayTeam}`
        );
        if (!isChannelFavorited(favId)) return false;
      }
      return true;
    });
  }, [
    matches,
    statusTab,
    deferredSearchQuery,
    langFilter,
    leagueFilter,
    brandFilter,
    favoritesOnly,
    isChannelFavorited,
    lang,
  ]);

  const groupedCompetitions = useMemo(() => {
    const getKickoffMs = (m: FootballMatchboardItem) => {
      if (typeof m.kickoffMs === 'number' && m.kickoffMs > 0) return m.kickoffMs;
      const parsed = Date.parse(m.kickoffIso || '');
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    if (isTeamCalendarScope && filteredMatches.length > 0) {
      const timelineTitle =
        calendarScope === 'espana'
          ? pickLang(lang, {
              es: 'Selección Española · Calendario de toda la temporada',
              ca: 'Selecció Espanyola · Calendari de tota la temporada',
              en: 'Spain National Team · Full-Season Schedule',
              zh: '西班牙国家队 · 全赛季赛程',
              rif: 'Tarbaεt n Spanya · Lbaramij n ussegwas',
            })
          : calendarScope === 'barca_madrid'
          ? pickLang(lang, {
              es: 'Calendario FC Barcelona y Real Madrid · Toda la temporada',
              ca: 'Calendari FC Barcelona i Real Madrid · Tota la temporada',
              en: 'FC Barcelona & Real Madrid · Full-Season Schedule',
              zh: '巴塞罗那与皇家马德里 · 全赛季赛程',
              rif: 'Barça d Real Madrid · Lbaramij n ussegwas',
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
        const stateRank = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
        if (stateRank(a.statusState) !== stateRank(b.statusState)) {
          return stateRank(a.statusState) - stateRank(b.statusState);
        }
        const aMs = getKickoffMs(a);
        const bMs = getKickoffMs(b);
        if (a.statusState === 'finished') {
          if (aMs !== bMs) return bMs - aMs;
        } else if (aMs !== bMs) {
          return aMs - bMs;
        }
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
      const aFeat = a.items.some((m) => isPrioritySpanishHighlightMatch(m.homeTeam, m.awayTeam)) ? 260 : 0;
      const bFeat = b.items.some((m) => isPrioritySpanishHighlightMatch(m.homeTeam, m.awayTeam)) ? 260 : 0;
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
      <div className="space-y-4">
        <section className="rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08]">
          <div className="px-4 py-3 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
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
                    className={`min-h-10 px-3.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300'
                    }`}
                  >
                    {opt.id === 'live' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" aria-hidden="true" />
                    )}
                    <span>{opt.label}</span>
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
                className="min-h-10 px-3.5 rounded-xl bg-[#7C3AED]/18 hover:bg-[#7C3AED]/28 border border-[#7C3AED]/45 text-xs font-bold text-[#E9D5FF] whitespace-nowrap cursor-pointer shrink-0 ml-auto active:scale-95 transition-all"
              >
                {pickLang(lang, { es: 'Volver a Hoy', ca: 'Tornar a Avui', en: 'Back to Today', zh: '返回今天', rif: 'Uɣal ar Assa' })}
              </button>
            ) : (
              <div className="inline-flex items-center rounded-xl bg-white/[0.05] border border-white/[0.08] shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setDayOffset((d) => Math.max(-30, d - 1));
                    setStatusTab('all');
                  }}
                  aria-label={pickLang(lang, {
                    es: 'Día anterior',
                    ca: 'Dia anterior',
                    en: 'Previous day',
                    zh: '前一天',
                    rif: 'Ass iɛeddan',
                  })}
                  className="min-w-10 min-h-10 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <label className="relative px-2.5 min-h-10 flex items-center gap-1.5 text-xs font-bold text-white whitespace-nowrap cursor-pointer hover:text-[#C4B5FD] transition-colors">
                  <Calendar className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                  <span>{activeDateLabel}</span>
                  <input
                    type="date"
                    value={activeDateInfo.isoDate}
                    aria-label={pickLang(lang, {
                      es: 'Elegir fecha del calendario',
                      ca: 'Triar data del calendari',
                      en: 'Pick calendar date',
                      zh: '选择赛季日期',
                      rif: 'Fren ass deg lbaramij',
                    })}
                    onChange={(e) => {
                      const offset = computeDayOffsetFromIsoDate(e.target.value);
                      if (offset !== null) {
                        triggerHaptic('light');
                        setDayOffset(Math.max(-30, Math.min(365, offset)));
                        setStatusTab('all');
                      }
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setDayOffset((d) => Math.min(365, d + 1));
                    setStatusTab('all');
                  }}
                  aria-label={pickLang(lang, {
                    es: 'Día siguiente',
                    ca: 'Dia següent',
                    en: 'Next day',
                    zh: '下一天',
                    rif: 'Ass i d-yegguren',
                  })}
                  className="min-w-10 min-h-10 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Full-Season Navigable Calendar Bar */}
          <div className="px-4 py-2.5 bg-[#0D0D12] flex items-center gap-2 overflow-x-auto no-scrollbar">
            {(
              [
                {
                  id: '',
                  label: pickLang(lang, {
                    es: 'Hoy / Fecha',
                    ca: 'Avui / Data',
                    en: 'Daily / Date',
                    zh: '今日赛程',
                    rif: 'Assa / Azemz',
                  }),
                },
                {
                  id: 'barca_madrid',
                  label: pickLang(lang, {
                    es: 'Barça y Madrid',
                    ca: 'Barça i Madrid',
                    en: 'Barça & Madrid',
                    zh: '巴萨与皇马',
                    rif: 'Barça d Madrid',
                  }),
                },
                {
                  id: 'espana',
                  label: pickLang(lang, {
                    es: 'Selección Española',
                    ca: 'Selecció Espanyola',
                    en: 'Spain NT',
                    zh: '西班牙国家队',
                    rif: 'Spanya',
                  }),
                },
                {
                  id: 'laliga',
                  label: 'LaLiga',
                },
                {
                  id: 'champions',
                  label: 'Champions',
                },
              ] as const
            ).map((scopeBtn) => {
              const isScopeActive =
                scopeBtn.id === ''
                  ? !calendarScope
                  : calendarScope === scopeBtn.id;
              return (
                <button
                  key={scopeBtn.id || 'daily-scope'}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    if (scopeBtn.id === '') {
                      if (onClearCalendarScope) {
                        onClearCalendarScope();
                      } else {
                        onSelectLeagueFilter?.('');
                        onSearchQueryChange('');
                      }
                      setDayOffset(0);
                    } else {
                      onSearchQueryChange('');
                      onSelectLeagueFilter?.(scopeBtn.id);
                      setStatusTab('all');
                    }
                  }}
                  className={`min-h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                    isScopeActive
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300 hover:text-white'
                  }`}
                >
                  {scopeBtn.label}
                </button>
              );
            })}
          </div>

          {calendarScope && (
            <div className="px-4 py-2 bg-[#7C3AED]/[0.12] border-t border-[#7C3AED]/25 text-xs">
              <span className="text-[#E9D5FF] font-semibold leading-snug">
                {pickLang(lang, {
                  es: 'Calendario completo · Toda la temporada navegable de la competición',
                  ca: 'Calendari complet · Tota la temporada navegable de la competició',
                  en: 'Full-season schedule · All upcoming competition fixtures',
                  zh: '全赛季赛程 · 查看整季比赛日程',
                  rif: 'Lbaramij n ussegwas ikemlen · Akk lmatchat i d-yegguren',
                })}
              </span>
            </div>
          )}
        </section>

        {loading && (matches.length === 0 || loadedBoardKey !== currentBoardKey) ? (
          <div className="space-y-3">
            <div className="px-4 py-3 rounded-2xl bg-[#0D0D12] border border-white/[0.08] flex items-center gap-2.5 text-xs font-semibold text-[#C4B5FD]">
              <span className="w-2 h-2 rounded-full bg-[#7C3AED] animate-pulse shrink-0" />
              <span>
                {calendarScope
                  ? pickLang(lang, {
                      es: 'Cargando próximos partidos de esta competición...',
                      ca: 'Carregant pròxims partits d’aquesta competició...',
                      en: 'Loading upcoming fixtures for this competition...',
                    })
                  : pickLang(lang, {
                      es: 'Cargando partidos...',
                      ca: 'Carregant partits...',
                      en: 'Loading matches...',
                    })}
              </span>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-32 rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-4 flex flex-col justify-between skeleton-shimmer"
                >
                  <div className="w-28 h-3.5 rounded bg-white/[0.06]" />
                  <div className="space-y-2">
                    <div className="w-48 h-4 rounded bg-white/[0.07]" />
                    <div className="w-40 h-4 rounded bg-white/[0.05]" />
                  </div>
                  <div className="w-24 h-8 rounded-xl bg-white/[0.06]" />
                </div>
              ))}
            </div>
          </div>
        ) : groupedCompetitions.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-center space-y-3">
            <p className="text-sm text-zinc-200 font-semibold">
              {fetchError
                ? pickLang(lang, {
                    es: 'No se pudo cargar la cartelera de partidos ahora.',
                    ca: 'No s’ha pogut carregar la cartellera de partits ara.',
                    en: 'Could not load the match schedule right now.',
                  })
                : favoritesOnly
                ? pickLang(lang, {
                    es: 'No tienes partidos favoritos guardados para este filtro.',
                    ca: 'No tens partits favorits desats per a aquest filtre.',
                    en: 'No favorite matches saved for this filter.',
                  })
                : statusTab === 'live'
                ? pickLang(lang, {
                    es: 'No hay partidos en vivo ahora mismo.',
                    ca: 'No hi ha partits en directe ara mateix.',
                    en: 'No live matches right now.',
                  })
                : calendarScope
                ? pickLang(lang, {
                    es: 'No hay partidos programados en las próximas fechas con estos filtros.',
                    ca: 'No hi ha partits programats en les pròximes dates amb aquests filtres.',
                    en: 'No scheduled fixtures found in upcoming dates with these filters.',
                  })
                : pickLang(lang, {
                    es: 'No hay partidos con estos filtros.',
                    ca: 'No hi ha partits amb aquests filtres.',
                    en: 'No matches match these filters.',
                  })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {statusTab !== 'all' && matches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusTab('all')}
                  className="min-h-11 px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
                >
                  {pickLang(lang, {
                    es: 'Ver todos los partidos',
                    ca: 'Veure tots els partits',
                    en: 'View all matches',
                  })}
                </button>
              )}
              {(Boolean(searchQuery.trim()) ||
                Boolean(leagueFilter) ||
                brandFilter !== 'all' ||
                langFilter === 'ZH' ||
                favoritesOnly ||
                dayOffset !== 0) && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setDayOffset(0);
                    setStatusTab('all');
                    if (onResetFilters) {
                      onResetFilters();
                    } else if (onClearCalendarScope) {
                      onClearCalendarScope();
                    } else {
                      onSearchQueryChange('');
                    }
                  }}
                  className="min-h-11 px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
                >
                  {pickLang(lang, {
                    es: 'Limpiar filtros',
                    ca: 'Netejar filtres',
                    en: 'Clear filters',
                  })}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  void fetchBoard(false);
                }}
                className="min-h-11 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-100 text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                {pickLang(lang, {
                  es: 'Reintentar',
                  ca: 'Reintentar',
                  en: 'Retry',
                })}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedCompetitions.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="px-4 py-2.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] flex items-center gap-2.5">
                  <RegionFlagImg
                    src={group.regionFlagUrl}
                    alt={group.regionName}
                    groupTitle={group.groupTitle}
                  />
                  <h3 className="text-sm font-bold text-white leading-snug break-words">
                    {group.groupTitle}
                  </h3>
                </div>

                <div className="space-y-3">
                  {group.items.map((item) => (
                    <FootballMatchRow
                      key={item.id}
                      item={item}
                      lang={lang}
                      shareRoomId={shareRoomId}
                      showLeagueBadge={isTeamCalendarScope}
                      showZhIndicator={langFilter === 'ZH' || brandFilter === 'china_football'}
                      activeVideoRawUrl={activeVideoRawUrl}
                      activeMultiUrls={activeMultiUrls}
                      loadingItemId={loadingItemId}
                      isChannelFavorited={isChannelFavorited}
                      onToggleChannelFavorite={onToggleChannelFavorite}
                      onOpenMatchSheet={(m) => handleOpenMatchSheet(m, 'signals')}
                      onQuickWatch={handleQuickWatch}
                      onAddToMultiScreen={onAddToMultiScreen}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

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
