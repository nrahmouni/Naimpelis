import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Globe,
  Loader2,
  Play,
  Shield,
  Star,
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
import { BottomSheet, SegmentedControl } from './ui/DesignSystem';

const LiveMatchCenter = React.lazy(() =>
  import('./LiveMatchCenter').then((m) => ({ default: m.LiveMatchCenter }))
);

interface FootballMatchboardProps {
  lang: AppLanguage;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  langFilter?: 'all' | 'ZH';
  leagueFilter?: string;
  activeVideoRawUrl?: string;
  loadingItemId?: string | null;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel?: (match: SportsMatch, channelIndex: number) => void;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (item: Omit<FavoriteChannelItem, 'addedAt'>) => void;
}

type StatusTab = 'live' | 'upcoming' | 'all';
type MatchSheetTab = 'signals' | 'stats';

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
        ? item.statusLabel || pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE' })
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

function hasValidScore(homeScore?: string, awayScore?: string): boolean {
  const h = String(homeScore ?? '').trim();
  const a = String(awayScore ?? '').trim();
  if (!h || !a) return false;
  if (h === '-' || h === '–' || a === '-' || a === '–' || h === '·' || a === '·') {
    return false;
  }
  return /^\d+$/.test(h) && /^\d+$/.test(a);
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
        className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0"
      >
        {shortCode.slice(0, 2) || <Shield className="w-3.5 h-3.5 text-zinc-400" />}
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
      className="w-6 h-6 object-contain shrink-0"
    />
  );
};

const RegionFlagImg: React.FC<{
  src?: string;
  alt: string;
  groupTitle?: string;
}> = ({ src, alt, groupTitle = '' }) => {
  const [failed, setFailed] = useState(false);
  const haystack = `${alt} ${groupTitle}`.toLowerCase();
  const isNonEuOrIntl =
    /africa|caf|afcon|azadegan|iran|asia|afc|concacaf|conmebol|world|mundial|friendly|amistoso|internacional|fifa|liberta|sudam|qualif/i.test(
      haystack
    );
  const isGenericEuFlag =
    !src || /\/(eu|europe|uefa)(\.|_|-)/i.test(src) || /euro-flag/i.test(src);

  if (!src || failed || (isNonEuOrIntl && (isGenericEuFlag || !/^[a-z]{2}$/i.test(alt)))) {
    return <Globe className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />;
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
  langFilter = 'all',
  leagueFilter = '',
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

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const lf = leagueFilter.trim().toLowerCase();
    return matches.filter((m) => {
      if (statusTab === 'live' && m.statusState !== 'live') return false;
      if (statusTab === 'upcoming' && m.statusState !== 'upcoming') return false;
      if (langFilter === 'ZH') {
        const hasZh = m.channels.some((c) => c.lang === 'ZH' || /中文/.test(c.label || ''));
        if (!hasZh) return false;
      }
      if (lf) {
        const hayLeague = `${m.groupTitle} ${m.leagueSlug} ${m.regionName}`.toLowerCase();
        if (lf === 'hypermotion') {
          if (!/hypermotion|segunda|laliga 2|esp\.2/.test(hayLeague)) return false;
        } else if (lf === 'europa') {
          if (!/europa league|uefa\.europa/.test(hayLeague)) return false;
        } else if (lf === 'world') {
          if (!/world|fifa|nations|euro|qualif|copa america|mundial|internacional|selecciones|friendly|amistoso/.test(hayLeague)) {
            return false;
          }
        } else if (!hayLeague.includes(lf)) {
          return false;
        }
      }
      if (q) {
        const hay = `${m.homeTeam} ${m.awayTeam} ${m.groupTitle} ${m.regionName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [matches, statusTab, searchQuery, langFilter, leagueFilter]);

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

  const handleOpenMatchSheet = (item: FootballMatchboardItem, defaultTab: MatchSheetTab = 'signals') => {
    triggerHaptic('light');
    setSheetTab(defaultTab);
    setSelectedMatchId(item.id);
    loadMatchDetails(item, true);
  };

  const handleQuickWatch = (e: React.MouseEvent, item: FootballMatchboardItem) => {
    e.stopPropagation();
    triggerHaptic('medium');
    if (item.channels.length > 0) {
      onPlaySportsMatch(toSportsMatch(item, lang), 0);
    } else {
      handleOpenMatchSheet(item, 'stats');
    }
  };

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
        {/* Top Bar: Unclipped Status Chips + Compact Date Switcher */}
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

          {/* Single-row Date Switcher */}
          <div className="inline-flex items-center rounded-xl bg-white/[0.05] border border-white/[0.08] shrink-0 ml-auto">
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
                setDayOffset((d) => Math.min(2, d + 1));
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
        </div>

        {/* Matchboard Body */}
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
                {/* League Group Header */}
                <div className="px-3.5 sm:px-4 py-2.5 bg-[#151824] border-y border-white/[0.06] flex items-center gap-2.5">
                  <RegionFlagImg
                    src={group.regionFlagUrl}
                    alt={group.regionName}
                    groupTitle={group.groupTitle}
                  />
                  <h3 className="text-xs font-bold text-zinc-200 leading-snug truncate">
                    {group.groupTitle}
                  </h3>
                </div>

                {/* Compact Match Rows */}
                <div className="divide-y divide-white/[0.06]">
                  {group.items.map((item) => {
                    const primaryCh = item.channels[0];
                    const favId = primaryCh
                      ? buildChannelFavId(primaryCh.sourceUrl, `${item.homeTeam} vs ${item.awayTeam}`)
                      : '';
                    const isSaved = favId ? isChannelFavorited(favId) : false;
                    const isPlayingThisMatch = item.channels.some(
                      (c) => activeVideoRawUrl && c.sourceUrl === activeVideoRawUrl
                    );
                    const isExtracting = Boolean(loadingItemId?.startsWith(item.id));
                    const showNumericScore = hasValidScore(item.homeScore, item.awayScore);
                    const hasZhChannel = item.channels.some(
                      (c) => c.lang === 'ZH' || /中文/.test(c.label || '')
                    );

                    return (
                      <div
                        key={item.id}
                        className={`relative px-3 sm:px-4 py-3 min-h-[76px] flex items-center gap-3 transition-colors ${
                          isPlayingThisMatch
                            ? 'bg-[#9146FF]/15'
                            : 'bg-[#10121C] hover:bg-white/[0.03]'
                        }`}
                      >
                        {/* Row click opens Match Detail BottomSheet (Signals + Stats/Lineups) */}
                        <button
                          type="button"
                          onClick={() => handleOpenMatchSheet(item, 'signals')}
                          aria-label={`${item.homeTeam} vs ${item.awayTeam} (${item.kickoffTime})`}
                          className="absolute inset-0 z-0 cursor-pointer"
                        />

                        {/* Time / EN VIVO */}
                        <div className="relative z-[1] pointer-events-none w-16 shrink-0 flex flex-col items-center justify-center text-center gap-1">
                          {item.statusState === 'live' ? (
                            <>
                              <span className="px-2 py-0.5 rounded-md bg-[#EB0400] text-white text-[10px] font-extrabold tracking-wide whitespace-nowrap">
                                EN VIVO
                              </span>
                              {item.statusLabel && (
                                <span className="text-xs font-bold tabular-nums text-white whitespace-nowrap">
                                  {item.statusLabel}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-bold tabular-nums text-zinc-200 whitespace-nowrap">
                                {item.kickoffTime}
                              </span>
                              {item.statusLabel && (
                                <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                                  {item.statusLabel}
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Teams + Score */}
                        <div className="relative z-[1] pointer-events-none flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamCrestImg
                                src={item.homeLogo}
                                shortCode={item.homeShort}
                                alt={item.homeTeam}
                              />
                              <span className="text-sm font-semibold text-white leading-tight truncate">
                                {item.homeTeam}
                              </span>
                              {hasZhChannel && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200 text-[10px] font-bold shrink-0">
                                  中文
                                </span>
                              )}
                            </div>
                            {showNumericScore && (
                              <span className="text-sm font-extrabold tabular-nums text-white shrink-0">
                                {item.homeScore}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamCrestImg
                                src={item.awayLogo}
                                shortCode={item.awayShort}
                                alt={item.awayTeam}
                              />
                              <span className="text-sm font-semibold text-zinc-200 leading-tight truncate">
                                {item.awayTeam}
                              </span>
                            </div>
                            {showNumericScore ? (
                              <span className="text-sm font-extrabold tabular-nums text-white shrink-0">
                                {item.awayScore}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-zinc-400 shrink-0 whitespace-nowrap">
                                {item.statusState === 'upcoming'
                                  ? pickLang(lang, { es: 'Por empezar', ca: 'Per començar', en: 'Upcoming' })
                                  : '–'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Watch Action + Channel Badge ONLY when signals exist; clean chevron otherwise */}
                        <div className="relative z-10 pointer-events-auto shrink-0 flex items-center gap-1.5">
                          {primaryCh ? (
                            <>
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
                                        es: 'Señal 1',
                                        ca: 'Senyal 1',
                                        en: 'Feed 1',
                                      }),
                                    channelUrl: primaryCh.sourceUrl,
                                    competition: item.groupTitle,
                                    sport: 'soccer',
                                  });
                                }}
                                aria-label={pickLang(lang, {
                                  es: 'Guardar partido',
                                  ca: 'Desar partit',
                                  en: 'Save match',
                                })}
                                className="min-w-10 min-h-10 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#9146FF] cursor-pointer"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    isSaved ? 'fill-current text-[#9146FF]' : ''
                                  }`}
                                />
                              </button>

                              <button
                                type="button"
                                disabled={Boolean(loadingItemId)}
                                onClick={(e) => handleQuickWatch(e, item)}
                                className={`min-h-10 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 whitespace-nowrap border ${
                                  isPlayingThisMatch
                                    ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.4)]'
                                    : 'bg-white/[0.06] hover:bg-[#9146FF] border-white/[0.12] hover:border-[#9146FF] text-zinc-100 hover:text-white'
                                }`}
                              >
                                {isExtracting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                                <span className="max-w-[82px] truncate">
                                  {primaryCh.label || pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}
                                </span>
                              </button>
                            </>
                          ) : (
                            <span
                              aria-hidden="true"
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 pointer-events-none"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Match Detail BottomSheet: Signals + Stats/Lineups */}
      <BottomSheet
        isOpen={Boolean(selectedMatchObj)}
        onClose={() => setSelectedMatchId(null)}
        title={
          selectedMatchObj
            ? `${selectedMatchObj.homeTeam} vs ${selectedMatchObj.awayTeam}`
            : ''
        }
        subtitle={selectedMatchObj?.groupTitle}
        maxWidth="sm:max-w-2xl"
        lang={lang}
      >
        {selectedMatchObj && selectedSportsMatch && (
          <div className="space-y-4">
            <SegmentedControl<MatchSheetTab>
              value={sheetTab}
              onChange={(val) => {
                setSheetTab(val);
                if (val === 'stats') {
                  loadMatchDetails(selectedMatchObj, false);
                }
              }}
              layoutId="match-detail-sheet-tabs"
              options={[
                {
                  id: 'signals',
                  label: pickLang(lang, { es: 'Señales', ca: 'Senyals', en: 'Signals' }),
                },
                {
                  id: 'stats',
                  label: pickLang(lang, {
                    es: 'Estadísticas y alineaciones',
                    ca: 'Estadístiques i alineacions',
                    en: 'Stats & lineups',
                  }),
                },
              ]}
            />

            {sheetTab === 'signals' ? (
              <div className="space-y-2.5">
                {selectedMatchObj.channels.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedMatchObj.channels.map((ch, idx) => {
                      const isActiveSignal = activeVideoRawUrl === ch.sourceUrl;
                      const isZh = ch.lang === 'ZH' || /中文/.test(ch.label || '');
                      return (
                        <div
                          key={`${selectedMatchObj.id}-${ch.id}-${idx}`}
                          className="flex items-center gap-2"
                        >
                          <button
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={() => {
                              triggerHaptic('medium');
                              onPlaySportsMatch(selectedSportsMatch, idx);
                              setSelectedMatchId(null);
                            }}
                            className={`flex-1 min-h-12 px-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              isActiveSignal
                                ? 'bg-[#9146FF] text-white'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.1]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                              <span>
                                {pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} {idx + 1}
                              </span>
                            </span>
                            {isZh && (
                              <span className="px-2 py-0.5 rounded bg-white/15 text-[11px] font-bold">
                                中文
                              </span>
                            )}
                          </button>

                          {activeVideoRawUrl && !isActiveSignal && onPlaySecondaryChannel && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onPlaySecondaryChannel(selectedSportsMatch, idx);
                                setSelectedMatchId(null);
                              }}
                              aria-label={pickLang(lang, {
                                es: 'Segunda pantalla',
                                ca: 'Segona pantalla',
                                en: 'Second screen',
                              })}
                              className="min-w-12 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 flex items-center justify-center cursor-pointer"
                            >
                              <Columns2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-300 py-3">
                    {selectedMatchObj.statusState === 'finished'
                      ? pickLang(lang, {
                          es: 'Partido finalizado.',
                          ca: 'Partit finalitzat.',
                          en: 'Match finished.',
                        })
                      : pickLang(lang, {
                          es: `Las señales se activarán antes del inicio (${selectedMatchObj.kickoffTime}).`,
                          ca: `Els senyals s’activaran abans de l’inici (${selectedMatchObj.kickoffTime}).`,
                          en: `Streams open before kickoff (${selectedMatchObj.kickoffTime}).`,
                        })}
                  </p>
                )}
              </div>
            ) : (
              <React.Suspense fallback={<div className="py-8 text-center text-xs text-zinc-400">Cargando...</div>}>
                <LiveMatchCenter
                  lang={lang}
                  details={selectedMatchDetails}
                  loading={loadingDetailId === selectedMatchObj.id}
                  homeTeam={selectedMatchObj.homeTeam}
                  awayTeam={selectedMatchObj.awayTeam}
                  homeShort={selectedMatchObj.homeShort}
                  awayShort={selectedMatchObj.awayShort}
                  homeLogo={selectedMatchObj.homeLogo}
                  awayLogo={selectedMatchObj.awayLogo}
                  homeScore={selectedMatchObj.homeScore}
                  awayScore={selectedMatchObj.awayScore}
                  statusState={selectedMatchObj.statusState}
                  statusLabel={selectedMatchObj.statusLabel}
                  competition={selectedMatchObj.groupTitle}
                  variant="expanded"
                  defaultTab="lineups"
                  onRefresh={() => loadMatchDetails(selectedMatchObj, true)}
                />
              </React.Suspense>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
};
