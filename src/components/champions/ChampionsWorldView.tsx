import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpLeft,
  Check,
  Columns2,
  Grid2x2,
  LayoutGrid,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  MAX_MULTI_SCREENS,
  type AppLanguage,
  type FavoriteChannelItem,
  type FootballMatchDetails,
  type FootballMatchboardItem,
  type FootballStandingsData,
  type MultiScreenSourceInput,
  type SportsMatch,
  type StreamTrack,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { SegmentedControl } from '../ui/DesignSystem';
import { FootballMatchRow } from '../sports/FootballMatchRow';
import {
  FootballMatchDetailSheet,
  TeamCrestImg,
  hasValidScore,
  toSportsMatch,
  type MatchSheetTab,
} from '../sports/FootballMatchboardParts';
import {
  matchesFootballSearchFilter,
  pickPreferredChannelIndex,
} from '../sports/FootballMatchboardHelpers';
import { ChampionsStandingsPanel } from './ChampionsStandingsPanel';

export interface ChampionsHubMultiplexChannel {
  id: string;
  name: string;
  shortMark: string;
  network: string;
  quality: string;
  description?: string;
  channels: StreamTrack[];
}

interface ChampionsWorldViewProps {
  lang: AppLanguage;
  shareRoomId?: string;
  externalSearchQuery?: string;
  activeVideoRawUrl?: string;
  activeMultiUrls?: string[];
  activeMultiCount?: number;
  loadingItemId?: string | null;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel: (opts: MultiScreenSourceInput) => void;
  onLaunchMultiMatchPreset: (sources: MultiScreenSourceInput[]) => void;
  onCloseAllMultiScreens?: () => void;
}

type ChampionsSubTab = 'multichampions' | 'multipartido' | 'clasificacion';
type PickerFilter = 'all' | 'champions' | 'live' | 'channels';

function formatMadridTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(new Date())
    .replace(/-/g, '');
}

function buildSourceFromMatch(
  item: FootballMatchboardItem,
  lang: AppLanguage
): MultiScreenSourceInput | null {
  if (!Array.isArray(item.channels) || item.channels.length === 0) return null;
  const prefIdx = pickPreferredChannelIndex(item.channels, lang, false);
  const chosen = item.channels[prefIdx >= 0 ? prefIdx : 0] || item.channels[0];
  if (!chosen?.sourceUrl) return null;
  const fallbackUrls = item.channels
    .map((c) => c.sourceUrl)
    .filter((u): u is string => Boolean(u && u !== chosen.sourceUrl));
  return {
    sourceUrl: chosen.sourceUrl,
    fallbackUrls,
    title: `${item.homeTeam} vs ${item.awayTeam}`,
    subtitle: item.leagueName || item.groupTitle || 'UEFA Champions League',
    matchId: item.id,
  };
}

function buildSourceFromMultiplex(
  ch: ChampionsHubMultiplexChannel,
  preferredTrackIdx = 0
): MultiScreenSourceInput | null {
  if (!Array.isArray(ch.channels) || ch.channels.length === 0) return null;
  const safeIdx =
    preferredTrackIdx >= 0 && preferredTrackIdx < ch.channels.length ? preferredTrackIdx : 0;
  const chosen = ch.channels[safeIdx] || ch.channels[0];
  if (!chosen?.sourceUrl) return null;
  const fallbackUrls = ch.channels
    .map((t) => t.sourceUrl)
    .filter((u): u is string => Boolean(u && u !== chosen.sourceUrl));
  return {
    sourceUrl: chosen.sourceUrl,
    fallbackUrls,
    title: ch.name,
    subtitle: ch.network || 'MultiChampions HD',
    matchId: `mux-${ch.id}`,
  };
}

export const ChampionsWorldView: React.FC<ChampionsWorldViewProps> = ({
  lang,
  shareRoomId,
  externalSearchQuery = '',
  activeVideoRawUrl = '',
  activeMultiUrls = [],
  activeMultiCount = 0,
  loadingItemId,
  isChannelFavorited,
  onToggleChannelFavorite,
  onPlaySportsMatch,
  onPlaySecondaryChannel,
  onLaunchMultiMatchPreset,
  onCloseAllMultiScreens,
}) => {
  const [activeTab, setActiveTab] = useState<ChampionsSubTab>('multichampions');
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>('all');
  const [championsMatches, setChampionsMatches] = useState<FootballMatchboardItem[]>([]);
  const [boardMatches, setBoardMatches] = useState<FootballMatchboardItem[]>([]);
  const [multiplexChannels, setMultiplexChannels] = useState<ChampionsHubMultiplexChannel[]>([]);
  const [standings, setStandings] = useState<FootballStandingsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [slotWarning, setSlotWarning] = useState<string>('');
  const [selectedSources, setSelectedSources] = useState<MultiScreenSourceInput[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<MatchSheetTab>('signals');
  const [detailsMap, setDetailsMap] = useState<Record<string, FootballMatchDetails>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const fetchSeqRef = useRef(0);
  const hasSeededBuilderRef = useRef(false);

  const loadChampionsHub = useCallback(
    async (opts?: { forceRefresh?: boolean; silent?: boolean }) => {
      const seq = ++fetchSeqRef.current;
      const force = Boolean(opts?.forceRefresh);
      const silent = Boolean(opts?.silent);
      if (!silent) {
        setLoading(true);
        setFetchError(false);
      }
      const dateKey = formatMadridTodayKey();
      const apiLang = lang === 'en' ? 'EN' : lang === 'zh' ? 'ZH' : 'ES';
      try {
        const [hubRes, boardRes] = await Promise.all([
          fetch(`/api/sports/champions-hub?lang=${apiLang}${force ? '&refresh=1' : ''}`),
          fetch(`/api/sports/football-board?date=${dateKey}&lang=${apiLang}`).catch(() => null),
        ]);
        if (seq !== fetchSeqRef.current) return;
        if (!hubRes.ok) throw new Error(`HTTP ${hubRes.status}`);
        const hubJson = await hubRes.json();
        const boardJson = boardRes && boardRes.ok ? await boardRes.json().catch(() => null) : null;
        if (seq !== fetchSeqRef.current) return;

        const nextChamp: FootballMatchboardItem[] = Array.isArray(hubJson?.matches)
          ? hubJson.matches
          : [];
        const nextMux: ChampionsHubMultiplexChannel[] = Array.isArray(hubJson?.multiplexChannels)
          ? hubJson.multiplexChannels
          : [];
        const nextStandings: FootballStandingsData | null = hubJson?.standings || null;
        const nextBoard: FootballMatchboardItem[] = Array.isArray(boardJson?.matches)
          ? boardJson.matches
          : [];

        setChampionsMatches(nextChamp);
        setMultiplexChannels(nextMux);
        setStandings(nextStandings);
        setBoardMatches(nextBoard);
        setFetchError(false);

        if (!hasSeededBuilderRef.current) {
          hasSeededBuilderRef.current = true;
          const seedPool: MultiScreenSourceInput[] = [];
          const seenUrls = new Set<string>();
          const tryPush = (src: MultiScreenSourceInput | null) => {
            if (!src || seedPool.length >= 2) return;
            if (seenUrls.has(src.sourceUrl)) return;
            seenUrls.add(src.sourceUrl);
            seedPool.push(src);
          };
          for (const m of nextChamp.filter((x) => x.statusState === 'live')) {
            tryPush(buildSourceFromMatch(m, lang));
          }
          for (const ch of nextMux) {
            tryPush(buildSourceFromMultiplex(ch));
          }
          if (seedPool.length > 0) {
            setSelectedSources(seedPool);
          }
        }
      } catch {
        if (seq === fetchSeqRef.current && !silent) {
          setFetchError(true);
        }
      } finally {
        if (seq === fetchSeqRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [lang]
  );

  useEffect(() => {
    void loadChampionsHub();
    const timer = window.setInterval(() => {
      void loadChampionsHub({ silent: true });
    }, 25000);
    return () => window.clearInterval(timer);
  }, [loadChampionsHub]);

  const loadMatchDetails = useCallback(async (item: FootballMatchboardItem, force = false) => {
    if (!force && detailsMap[item.id] && item.statusState === 'finished') return;
    setLoadingDetailId(item.id);
    try {
      const params = new URLSearchParams({
        eventId: item.eventId,
        leagueSlug: item.leagueSlug,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        date: formatMadridTodayKey(),
      });
      if (item.fotmobMatchId) params.set('fotmobMatchId', item.fotmobMatchId);
      const res = await fetch(`/api/sports/match-details?${params.toString()}`);
      const json = await res.json();
      if (json?.details) {
        setDetailsMap((prev) => ({ ...prev, [item.id]: json.details }));
      }
    } catch {
      // ignore transient telemetry failure
    } finally {
      setLoadingDetailId((curr) => (curr === item.id ? null : curr));
    }
  }, [detailsMap]);

  const allCombinedMatches = useMemo(() => {
    const map = new Map<string, FootballMatchboardItem>();
    for (const m of championsMatches) {
      map.set(m.id || `${m.eventId}-${m.homeTeam}`, m);
    }
    for (const m of boardMatches) {
      const key = m.id || `${m.eventId}-${m.homeTeam}`;
      if (!map.has(key)) map.set(key, m);
    }
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const stateOrder = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
      if (stateOrder(a.statusState) !== stateOrder(b.statusState)) {
        return stateOrder(a.statusState) - stateOrder(b.statusState);
      }
      const aHasFeed = a.channels.length > 0 ? 1 : 0;
      const bHasFeed = b.channels.length > 0 ? 1 : 0;
      if (aHasFeed !== bHasFeed) return bHasFeed - aHasFeed;
      return (a.kickoffMs || 0) - (b.kickoffMs || 0);
    });
    return list;
  }, [championsMatches, boardMatches]);

  const liveChampionsCount = useMemo(
    () => championsMatches.filter((m) => m.statusState === 'live').length,
    [championsMatches]
  );

  // Build deduplicated live/playable sources pool for 1-click Dual (2), Triple (3), Quad (4) MultiChampions presets
  const presetCandidatePool = useMemo(() => {
    const out: MultiScreenSourceInput[] = [];
    const seenUrls = new Set<string>();
    const addCandidate = (src: MultiScreenSourceInput | null) => {
      if (!src || !src.sourceUrl) return;
      if (seenUrls.has(src.sourceUrl)) return;
      seenUrls.add(src.sourceUrl);
      out.push(src);
    };

    // 1. Live Champions matches first
    for (const m of championsMatches) {
      if (m.statusState === 'live') addCandidate(buildSourceFromMatch(m, lang));
    }
    // 2. Official MultiChampions / DAZN / UK Sports channels
    for (const mux of multiplexChannels) {
      addCandidate(buildSourceFromMultiplex(mux, 0));
      if (mux.channels.length > 1) {
        for (let i = 1; i < mux.channels.length; i += 1) {
          addCandidate(buildSourceFromMultiplex(mux, i));
        }
      }
    }
    // 3. Any other playable Champions or live football matches today
    for (const m of allCombinedMatches) {
      if (m.statusState === 'live' || m.channels.length > 0) {
        addCandidate(buildSourceFromMatch(m, lang));
      }
    }
    return out;
  }, [championsMatches, multiplexChannels, allCombinedMatches, lang]);

  const presetDual = useMemo(() => presetCandidatePool.slice(0, 2), [presetCandidatePool]);
  const presetTriple = useMemo(() => presetCandidatePool.slice(0, 3), [presetCandidatePool]);
  const presetQuad = useMemo(() => presetCandidatePool.slice(0, 4), [presetCandidatePool]);

  const isSameBuilderSource = (a: MultiScreenSourceInput, b: MultiScreenSourceInput): boolean => {
    if (a.matchId && b.matchId) return a.matchId === b.matchId;
    return Boolean(a.sourceUrl && b.sourceUrl && a.sourceUrl === b.sourceUrl);
  };

  const isSourceInBuilder = useCallback(
    (src: MultiScreenSourceInput | null): number => {
      if (!src) return -1;
      return selectedSources.findIndex((s) => isSameBuilderSource(s, src));
    },
    [selectedSources]
  );

  const toggleBuilderSource = useCallback((src: MultiScreenSourceInput) => {
    setSlotWarning('');
    setSelectedSources((prev) => {
      const existingIdx = prev.findIndex((s) => isSameBuilderSource(s, src));
      if (existingIdx !== -1) {
        triggerHaptic('light');
        return prev.filter((_, i) => i !== existingIdx);
      }
      if (prev.length >= MAX_MULTI_SCREENS) {
        triggerHaptic('light');
        setSlotWarning(
          pickLang(lang, {
            es: 'Máximo 4 partidos a la vez. Quita uno arriba para añadir otro.',
            ca: 'Màxim 4 partits alhora. Treu-ne un de dalt per afegir-ne un altre.',
            en: 'Maximum 4 matches at once. Remove one above to add another.',
          })
        );
        return prev;
      }
      triggerHaptic('medium');
      return [...prev, src];
    });
  }, [lang]);

  const promoteBuilderSlotToFirst = useCallback((idx: number) => {
    if (idx <= 0) return;
    triggerHaptic('light');
    setSelectedSources((prev) => {
      if (idx >= prev.length) return prev;
      const next = [...prev];
      const [chosen] = next.splice(idx, 1);
      next.unshift(chosen);
      return next;
    });
  }, []);

  const filteredChampionsMatches = useMemo(() => {
    if (!externalSearchQuery.trim()) return championsMatches;
    return championsMatches.filter((m) => matchesFootballSearchFilter(m, externalSearchQuery));
  }, [championsMatches, externalSearchQuery]);

  const filteredPickerMatches = useMemo(() => {
    const q = externalSearchQuery.trim().toLowerCase();
    return allCombinedMatches.filter((m) => {
      if (pickerFilter === 'channels') return false;
      if (pickerFilter === 'champions') {
        const hay = `${m.leagueSlug} ${m.leagueName} ${m.groupTitle}`.toLowerCase();
        if (!/champions|uefa\.champions/.test(hay)) return false;
      }
      if (pickerFilter === 'live' && m.statusState !== 'live') return false;
      if (q && !matchesFootballSearchFilter(m, q)) return false;
      return true;
    });
  }, [allCombinedMatches, pickerFilter, externalSearchQuery]);

  const filteredMultiplexChannels = useMemo(() => {
    const q = externalSearchQuery.trim().toLowerCase();
    return multiplexChannels.filter((ch) => {
      if (!q) return true;
      return `${ch.name} ${ch.network} ${ch.description || ''}`.toLowerCase().includes(q);
    });
  }, [multiplexChannels, externalSearchQuery]);

  const selectedMatchObj = useMemo(
    () => allCombinedMatches.find((m) => m.id === selectedMatchId) || null,
    [allCombinedMatches, selectedMatchId]
  );

  const builderLayoutHint =
    selectedSources.length >= 4
      ? pickLang(lang, { es: 'Cuadrícula 2×2 · 4 pantallas (~3/4)', ca: 'Graella 2×2 · 4 pantalles', en: '2×2 Quad · 4 screens (~3/4)' })
      : selectedSources.length === 3
      ? pickLang(lang, { es: 'Principal + 2 · 3 pantallas (~3/4)', ca: 'Principal + 2 · 3 pantalles', en: 'Main + 2 · 3 screens (~3/4)' })
      : selectedSources.length === 2
      ? pickLang(lang, { es: 'Pantalla dividida · ~3/4 de altura', ca: 'Pantalla dividida · ~3/4 d’altura', en: 'Split Screen · ~3/4 height' })
      : pickLang(lang, { es: '1 pantalla (elige hasta 4)', ca: '1 pantalla (tria fins a 4)', en: '1 screen (pick up to 4)' });

  return (
    <div className="space-y-5">
      {/* UEFA CHAMPIONS STARBALL HEADER HERO */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1739] via-[#091128] to-[#050814] border border-sky-400/25 p-4 sm:p-5 shadow-[0_20px_50px_rgba(3,10,30,0.65)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 w-56 h-56 rounded-full bg-sky-500/15 blur-3xl"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-300/35 flex items-center justify-center text-sky-200 shrink-0 shadow-[0_8px_24px_rgba(14,165,233,0.28)]">
              <Trophy className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-extrabold text-lg sm:text-xl text-white tracking-tight">
                  UEFA Champions League
                </h2>
                {liveChampionsCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/35 text-[11px] font-bold text-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                    <span className="tabular-nums">{liveChampionsCount} EN VIVO</span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-sky-100/75 leading-snug mt-0.5">
                {pickLang(lang, {
                  es: 'MultiChampions en directo y modo Multi-Partido hasta 4 pantallas (~3/4 de pantalla)',
                  ca: 'MultiChampions en directe i mode Multi-Partit fins a 4 pantalles (~3/4 de pantalla)',
                  en: 'Live MultiChampions & up to 4-screen Multi-Match mode (~3/4 viewport)',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeMultiCount >= 2 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/18 border border-emerald-400/40 text-xs font-bold text-emerald-200">
                <Grid2x2 className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">{activeMultiCount}/4 activas</span>
                {onCloseAllMultiScreens && (
                  <button
                    type="button"
                    onClick={onCloseAllMultiScreens}
                    aria-label={pickLang(lang, { es: 'Cerrar Multi', ca: 'Tancar Multi', en: 'Close Multi' })}
                    className="ml-1 p-0.5 rounded-md hover:bg-white/15 text-emerald-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                void loadChampionsHub({ forceRefresh: true });
              }}
              aria-label={pickLang(lang, { es: 'Actualizar Champions', ca: 'Actualitzar Champions', en: 'Refresh Champions' })}
              className="min-w-11 min-h-11 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.12] flex items-center justify-center text-sky-100 cursor-pointer active:scale-95 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* SUB-TABS */}
      <SegmentedControl<ChampionsSubTab>
        layoutId="champions-world-tabs"
        value={activeTab === 'multipartido' ? 'multichampions' : activeTab}
        onChange={(tab) => {
          triggerHaptic('light');
          setActiveTab(tab);
        }}
        options={[
          {
            id: 'multichampions',
            label: pickLang(lang, {
              es: 'MultiChampions (Elegir 2–4)',
              ca: 'MultiChampions (Triar 2–4)',
              en: 'MultiChampions (Pick 2–4)',
            }),
          },
          {
            id: 'clasificacion',
            label: pickLang(lang, {
              es: 'Partidos y Tabla',
              ca: 'Partits i Taula',
              en: 'Matches & Table',
            }),
          },
        ]}
      />

      {fetchError && championsMatches.length === 0 && multiplexChannels.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-center space-y-3">
          <p className="text-sm font-semibold text-zinc-200">
            {pickLang(lang, {
              es: 'No se pudo cargar el centro Champions ahora.',
              ca: 'No s’ha pogut carregar el centre Champions ara.',
              en: 'Could not load Champions Hub right now.',
            })}
          </p>
          <button
            type="button"
            onClick={() => void loadChampionsHub({ forceRefresh: true })}
            className="min-h-11 px-5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
          >
            {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
          </button>
        </div>
      ) : activeTab !== 'clasificacion' ? (
        <div className="space-y-5 pb-20 sm:pb-24">
          {/* PASO 1: TUS PANTALLAS ELEGIDAS (P1 - P4) */}
          <section className="rounded-3xl bg-gradient-to-br from-[#0A1329] via-[#0B1020] to-[#0D0D12] border border-sky-400/30 p-4 sm:p-5 space-y-4 shadow-[0_18px_44px_rgba(3,10,30,0.55)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/35 text-[10px] font-extrabold uppercase tracking-wider text-sky-200">
                    {pickLang(lang, { es: 'Paso 1 · Tus pantallas', ca: 'Pas 1 · Les teves pantalles', en: 'Step 1 · Your screens' })}
                  </span>
                  <span className="text-xs font-bold text-emerald-300 tabular-nums">
                    {selectedSources.length}/4 {pickLang(lang, { es: 'elegidos', ca: 'triats', en: 'selected' })}
                  </span>
                </div>
                <h3 className="font-display font-extrabold text-base sm:text-lg text-white mt-1">
                  {pickLang(lang, {
                    es: 'Elige los partidos que quieres ver a la vez',
                    ca: 'Tria els partits que vols veure alhora',
                    en: 'Pick the matches you want to watch together',
                  })}
                </h3>
                <p className="text-xs text-zinc-300 mt-0.5">{builderLayoutHint}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedSources.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedSources([]);
                      setSlotWarning('');
                    }}
                    className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-300 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Clear' })}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={selectedSources.length === 0 || Boolean(loadingItemId)}
                  onClick={() => {
                    triggerHaptic('medium');
                    onLaunchMultiMatchPreset(selectedSources);
                  }}
                  className="min-h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 disabled:cursor-not-allowed text-[#04130d] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all shadow-[0_8px_24px_rgba(16,185,129,0.35)]"
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>
                    {selectedSources.length >= 2
                      ? pickLang(lang, {
                          es: `Ver ${selectedSources.length} partidos ahora (3/4)`,
                          ca: `Veure ${selectedSources.length} partits ara (3/4)`,
                          en: `Watch ${selectedSources.length} matches now (3/4)`,
                        })
                      : pickLang(lang, {
                          es: 'Ver partido elegido',
                          ca: 'Veure partit triat',
                          en: 'Watch selected match',
                        })}
                  </span>
                </button>
              </div>
            </div>

            {/* Auto-fill quick buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-zinc-400 mr-1">
                {pickLang(lang, { es: 'Relleno rápido:', ca: 'Omplir ràpid:', en: 'Quick fill:' })}
              </span>
              {[
                { label: '2 Dual', sources: presetDual, icon: <Columns2 className="w-3.5 h-3.5" /> },
                { label: '3 Triple', sources: presetTriple, icon: <LayoutGrid className="w-3.5 h-3.5" /> },
                { label: '4 Quad', sources: presetQuad, icon: <Grid2x2 className="w-3.5 h-3.5" /> },
              ].map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  disabled={quick.sources.length < 2}
                  onClick={() => {
                    triggerHaptic('light');
                    setSlotWarning('');
                    setSelectedSources(quick.sources);
                  }}
                  className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-sky-500/25 border border-white/[0.1] hover:border-sky-400/50 disabled:opacity-40 text-xs font-bold text-sky-100 inline-flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {quick.icon}
                  <span>{quick.label}</span>
                </button>
              ))}
            </div>

            {slotWarning && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/35 text-xs font-semibold text-amber-200">
                {slotWarning}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {Array.from({ length: MAX_MULTI_SCREENS }).map((_, slotIdx) => {
                const item = selectedSources[slotIdx];
                return (
                  <div
                    key={`builder-slot-${slotIdx}`}
                    className={`rounded-2xl p-3 border min-h-[82px] flex flex-col justify-between gap-2 transition-all ${
                      item
                        ? 'bg-emerald-500/[0.1] border-emerald-400/50'
                        : 'bg-white/[0.02] border-dashed border-white/[0.14]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-extrabold tabular-nums ${
                          item ? 'text-emerald-300' : 'text-zinc-500'
                        }`}
                      >
                        {slotIdx === 0 ? 'P1 · Principal' : `Pantalla ${slotIdx + 1}`}
                      </span>
                      {item && (
                        <div className="flex items-center gap-1">
                          {slotIdx > 0 && (
                            <button
                              type="button"
                              onClick={() => promoteBuilderSlotToFirst(slotIdx)}
                              title={pickLang(lang, { es: 'Hacer Principal', ca: 'Fer Principal', en: 'Make Primary' })}
                              aria-label={`P${slotIdx + 1} -> P1`}
                              className="p-1 rounded-lg bg-white/[0.08] hover:bg-sky-500 text-zinc-200 hover:text-white cursor-pointer"
                            >
                              <ArrowUpLeft className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleBuilderSource(item)}
                            aria-label={pickLang(lang, { es: 'Quitar pantalla', ca: 'Treure pantalla', en: 'Remove slot' })}
                            className="p-1 rounded-lg bg-white/[0.08] hover:bg-rose-500 text-zinc-200 hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {item ? (
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{item.title}</p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {item.subtitle || 'Directo HD'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        {pickLang(lang, {
                          es: 'Toca un partido abajo para ponerlo aquí',
                          ca: 'Toca un partit a sota per posar-lo aquí',
                          en: 'Tap a match below to add here',
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* PASO 2: TOCA LOS PARTIDOS QUE QUIERAS VER */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h3 className="font-display font-bold text-sm sm:text-base text-white">
                  {pickLang(lang, {
                    es: 'Paso 2 · Toca los partidos o canales que quieras añadir',
                    ca: 'Pas 2 · Toca els partits o canals que vulguis afegir',
                    en: 'Step 2 · Tap matches or channels to select',
                  })}
                </h3>
                <p className="text-xs text-zinc-400">
                  {pickLang(lang, {
                    es: 'Pulsa cualquier tarjeta para seleccionarla (hasta 4). Puedes quitar o cambiar el orden arriba.',
                    ca: 'Prem qualsevol targeta per seleccionar-la (fins a 4).',
                    en: 'Tap any card to toggle it into your multi-screen lineup (up to 4).',
                  })}
                </p>
              </div>
            </div>

            {/* PICKER FILTERS */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
                  { id: 'champions', label: 'Champions League' },
                  { id: 'live', label: pickLang(lang, { es: 'En Directo', ca: 'En Directe', en: 'Live' }) },
                  { id: 'channels', label: pickLang(lang, { es: 'Canales Multi', ca: 'Canals Multi', en: 'Multi Channels' }) },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setPickerFilter(f.id);
                  }}
                  className={`min-h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    pickerFilter === f.id
                      ? 'bg-sky-500 text-white shadow-[0_6px_16px_rgba(14,165,233,0.32)]'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading && filteredPickerMatches.length === 0 && filteredMultiplexChannels.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-2xl bg-[#0D0D12] border border-white/[0.08] skeleton-shimmer" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Matches with playable feeds first */}
                {filteredPickerMatches.map((m) => {
                  const src = buildSourceFromMatch(m, lang);
                  const slotIdx = isSourceInBuilder(src);
                  const selected = slotIdx !== -1;
                  const showScore = hasValidScore(m.homeScore, m.awayScore);
                  return (
                    <div
                      key={`pick-m-${m.id}`}
                      role={src ? 'button' : undefined}
                      tabIndex={src ? 0 : undefined}
                      onClick={() => {
                        if (src) toggleBuilderSource(src);
                      }}
                      onKeyDown={(e) => {
                        if (src && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          toggleBuilderSource(src);
                        }
                      }}
                      className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 transition-all text-left ${
                        src ? 'cursor-pointer active:scale-[0.99]' : 'opacity-65'
                      } ${
                        selected
                          ? 'bg-emerald-500/[0.14] border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                          : 'bg-[#0D0D12] border-white/[0.08] hover:border-sky-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex -space-x-2 shrink-0">
                          <TeamCrestImg src={m.homeLogo} shortCode={m.homeShort} alt={m.homeTeam} />
                          <TeamCrestImg src={m.awayLogo} shortCode={m.awayShort} alt={m.awayTeam} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {m.statusState === 'live' && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-[10px] font-extrabold text-rose-300">
                                EN VIVO
                              </span>
                            )}
                            <span className="text-[11px] font-semibold text-sky-300/90 truncate">
                              {m.leagueName || m.groupTitle}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-white truncate mt-0.5">
                            {m.homeTeam}
                            {showScore ? ` ${m.homeScore}–${m.awayScore} ` : ' vs '}
                            {m.awayTeam}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {m.statusState === 'live'
                              ? m.statusLabel || 'Directo'
                              : `${m.kickoffDateLabel || 'Hoy'} · ${m.kickoffTime}`}
                          </p>
                        </div>
                      </div>

                      {src ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`min-h-10 px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 border whitespace-nowrap ${
                              selected
                                ? 'bg-emerald-500 border-emerald-300 text-[#04130d]'
                                : 'bg-white/[0.07] border-white/[0.12] text-zinc-100'
                            }`}
                          >
                            {selected ? (
                              <>
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>P{slotIdx + 1}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{pickLang(lang, { es: 'Elegir', ca: 'Triar', en: 'Pick' })}</span>
                              </>
                            )}
                          </span>

                          <button
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('medium');
                              onPlaySportsMatch(toSportsMatch(m, lang), 0);
                            }}
                            title={pickLang(lang, { es: 'Ver solo este partido', ca: 'Veure només aquest partit', en: 'Watch only this match' })}
                            aria-label={pickLang(lang, { es: 'Ver solo', ca: 'Veure sol', en: 'Watch single' })}
                            className="min-h-10 min-w-10 rounded-xl bg-white/[0.05] hover:bg-[#7C3AED] border border-white/[0.1] text-zinc-200 hover:text-white inline-flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-zinc-500 shrink-0">
                          {m.statusState === 'finished'
                            ? pickLang(lang, { es: 'Finalizado', ca: 'Finalitzat', en: 'Full time' })
                            : pickLang(lang, { es: 'Sin señal aún', ca: 'Sense senyal encara', en: 'Feed TBA' })}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Official MultiChampions & European channels */}
                {(pickerFilter === 'all' || pickerFilter === 'channels') &&
                  filteredMultiplexChannels.map((ch) => {
                    const src = buildSourceFromMultiplex(ch, 0);
                    if (!src) return null;
                    const slotIdx = isSourceInBuilder(src);
                    const selected = slotIdx !== -1;
                    return (
                      <div
                        key={`pick-mux-${ch.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleBuilderSource(src)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleBuilderSource(src);
                          }
                        }}
                        className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99] text-left ${
                          selected
                            ? 'bg-emerald-500/[0.14] border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                            : 'bg-[#0D0D12] border-white/[0.08] hover:border-sky-400/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 font-display font-extrabold text-[11px] shrink-0">
                            {ch.shortMark.slice(0, 5)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white truncate">{ch.name}</p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {ch.network} · {ch.quality}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`min-h-10 px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 border whitespace-nowrap ${
                              selected
                                ? 'bg-emerald-500 border-emerald-300 text-[#04130d]'
                                : 'bg-white/[0.07] border-white/[0.12] text-zinc-100'
                            }`}
                          >
                            {selected ? (
                              <>
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>P{slotIdx + 1}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{pickLang(lang, { es: 'Elegir', ca: 'Triar', en: 'Pick' })}</span>
                              </>
                            )}
                          </span>

                          <button
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('medium');
                              onPlaySportsMatch(
                                {
                                  id: ch.id,
                                  title: ch.name,
                                  competition: ch.network,
                                  sport: 'soccer',
                                  time: 'EN VIVO',
                                  isLive: true,
                                  is247Channel: true,
                                  channels: ch.channels,
                                },
                                0
                              );
                            }}
                            title={pickLang(lang, { es: 'Ver solo este canal', ca: 'Veure només aquest canal', en: 'Watch only this channel' })}
                            aria-label={pickLang(lang, { es: 'Ver solo', ca: 'Veure sol', en: 'Watch single' })}
                            className="min-h-10 min-w-10 rounded-xl bg-white/[0.05] hover:bg-[#7C3AED] border border-white/[0.1] text-zinc-200 hover:text-white inline-flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* STICKY FLOATING LAUNCH BAR WHEN 2+ MATCHES ARE SELECTED */}
          {selectedSources.length >= 2 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-24px)] max-w-2xl rounded-2xl bg-[#071324]/95 backdrop-blur-xl border border-emerald-400/50 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.85)] flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-xs font-extrabold text-emerald-300 tabular-nums shrink-0">
                  {selectedSources.length}/4
                </span>
                <p className="text-xs font-bold text-white truncate">
                  {selectedSources.map((s) => s.title).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(loadingItemId)}
                onClick={() => {
                  triggerHaptic('medium');
                  onLaunchMultiMatchPreset(selectedSources);
                }}
                className="min-h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#04130d] text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {pickLang(lang, {
                    es: `Ver ${selectedSources.length} ahora`,
                    ca: `Veure ${selectedSources.length} ara`,
                    en: `Watch ${selectedSources.length} now`,
                  })}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* TAB 3: PARTIDOS CHAMPIONS + CLASIFICACIÓN */
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-display font-bold text-sm sm:text-base text-white px-1">
              {pickLang(lang, {
                es: 'Partidos UEFA Champions League',
                ca: 'Partits UEFA Champions League',
                en: 'UEFA Champions League Fixtures',
              })}
            </h3>

            {loading && filteredChampionsMatches.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-[#0D0D12] border border-white/[0.08] skeleton-shimmer" />
                ))}
              </div>
            ) : filteredChampionsMatches.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-center space-y-2">
                <p className="text-sm font-semibold text-zinc-200">
                  {pickLang(lang, {
                    es: 'No hay partidos de Champions League programados hoy o con ese filtro.',
                    ca: 'No hi ha partits de Champions League programats avui o amb aquest filtre.',
                    en: 'No UEFA Champions League fixtures scheduled for this filter.',
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('multichampions')}
                  className="min-h-10 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold cursor-pointer"
                >
                  {pickLang(lang, {
                    es: 'Ver canales MultiChampions',
                    ca: 'Veure canals MultiChampions',
                    en: 'Open MultiChampions Channels',
                  })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredChampionsMatches.map((item) => (
                  <FootballMatchRow
                    key={`ucl-row-${item.id}`}
                    item={item}
                    lang={lang}
                    shareRoomId={shareRoomId}
                    showLeagueBadge={false}
                    activeVideoRawUrl={activeVideoRawUrl}
                    activeMultiUrls={activeMultiUrls}
                    loadingItemId={loadingItemId}
                    isChannelFavorited={isChannelFavorited}
                    onToggleChannelFavorite={onToggleChannelFavorite}
                    onOpenMatchSheet={(m) => {
                      triggerHaptic('light');
                      setSheetTab('signals');
                      setSelectedMatchId(m.id);
                      void loadMatchDetails(m, true);
                    }}
                    onQuickWatch={(e, m, chIdx) => {
                      e.stopPropagation();
                      triggerHaptic('medium');
                      if (m.channels.length > 0) {
                        onPlaySportsMatch(toSportsMatch(m, lang), chIdx);
                      } else {
                        setSheetTab('stats');
                        setSelectedMatchId(m.id);
                        void loadMatchDetails(m, true);
                      }
                    }}
                    onAddToMultiScreen={onPlaySecondaryChannel}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-display font-bold text-sm sm:text-base text-white px-1">
              {pickLang(lang, {
                es: 'Clasificación UEFA Champions League',
                ca: 'Classificació UEFA Champions League',
                en: 'UEFA Champions League Standings',
              })}
            </h3>
            <ChampionsStandingsPanel lang={lang} standings={standings} loading={loading} />
          </section>
        </div>
      )}

      <FootballMatchDetailSheet
        lang={lang}
        shareRoomId={shareRoomId}
        selectedMatchObj={selectedMatchObj}
        selectedSportsMatch={selectedMatchObj ? toSportsMatch(selectedMatchObj, lang) : null}
        selectedMatchDetails={selectedMatchObj ? detailsMap[selectedMatchObj.id] || null : null}
        sheetTab={sheetTab}
        setSheetTab={setSheetTab}
        activeVideoRawUrl={activeVideoRawUrl}
        loadingItemId={loadingItemId}
        loadingDetailId={loadingDetailId}
        onClose={() => setSelectedMatchId(null)}
        onLoadDetails={loadMatchDetails}
        onPlaySportsMatch={onPlaySportsMatch}
        onPlaySecondaryChannel={(m, idx) => {
          const chosen = m.channels[idx] || m.channels[0];
          if (!chosen?.sourceUrl) return;
          const fallbackUrls = m.channels
            .map((c) => c.sourceUrl)
            .filter((u) => Boolean(u && u !== chosen.sourceUrl));
          onPlaySecondaryChannel({
            sourceUrl: chosen.sourceUrl,
            fallbackUrls,
            title: m.title,
            subtitle: m.competition,
            matchId: m.id,
          });
        }}
      />
    </div>
  );
};
