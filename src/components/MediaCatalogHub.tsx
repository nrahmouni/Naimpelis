/**
 * @module MediaCatalogHub
 * @description Orchestrator for RiffanTV catalog worlds (Cine, Fútbol, TV en Directo,
 * and YouTube) plus movie/series/Català/EPG detail & episode-picker modals.
 * Individual views live under `src/components/catalog/`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Play, SlidersHorizontal, Star } from 'lucide-react';
import type {
  AppLanguage,
  CatalaCatalogItem,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  ChannelLiveEpg,
  EpgProgramItem,
  FavoriteChannelItem,
  Participant,
  RoomQueueItem,
  SpanishTdtChannel,
  SportsMatch,
  TdtCategory,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { usePullToRefresh } from '../lib/viewTransition';
import {
  buildChannelFavId,
  isSameCatalogItem,
  sanitizeItemKey,
} from '../utils/storage';
import { MediaDetailsModal } from './MediaDetailsModal';
import {
  ChannelLogoBadge,
  getChannelRegionMeta,
  type TvRegionId,
} from './ui/ChannelLogoBadge';
import { FlagBadgeSvg } from './ui/LanguageBadge';
import { BottomSheet, SegmentedControl } from './ui/DesignSystem';
import {
  normalizeCatalogPillar,
  TV_FILTER_GROUPS,
  type CatalogPillar,
  type CatalogSection,
  type TvFilterGroup,
} from './catalog/catalogConstants';
import { CatalaEpisodePickerModal } from './catalog/CatalaEpisodePickerModal';
import { SeriesEpisodePickerModal } from './catalog/SeriesEpisodePickerModal';
import { LiveTvWorldView } from './catalog/LiveTvWorldView';
import { EpgChannelModal } from './catalog/EpgChannelModal';
import { YouTubeWorldView } from './catalog/YouTubeWorldView';
import { CineWorldView } from './catalog/CineWorldView';

export { normalizeCatalogPillar, TV_FILTER_GROUPS };
export type { CatalogSection, CatalogPillar, TvFilterGroup };

const FootballMatchboard = React.lazy(() =>
  import('./FootballMatchboard').then((m) => ({ default: m.FootballMatchboard }))
);

interface MediaCatalogHubProps {
  activeSection: CatalogSection;
  onChangeSection: (section: CatalogSection) => void;
  lang: AppLanguage;
  userName: string;
  activeVideoRawUrl: string;
  loadingItemId: string | null;
  roomQueue: RoomQueueItem[];
  watchHistory: WatchHistoryItem[];
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlayFavoriteChannel: (channel: FavoriteChannelItem) => void;
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => void;
  onPlayCatalaEpisode: (series: CatalaSeriesDetails, episode: CatalaEpisodeItem) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (
    channel: SpanishTdtChannel,
    signalIndex?: number,
    liveProgramHint?: string
  ) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (url: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onPlayQueueItem: (item: RoomQueueItem) => void;
  onStartPollFromQueue?: () => void;
  onPlaySecondaryChannel?: (opts: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => void;
  hasConnectedSmartTv?: boolean;
  activeMediaTitle?: string;
  onCreateNewRoom?: (customRoomName?: string) => void;
  showWatchlistOnly?: boolean;
  onWatchlistOnlyChange?: (val: boolean) => void;
  currentUser?: Participant;
  participants?: Participant[];
  onSearchWithAi?: (query: string, mediaType?: 'all' | 'movie' | 'tv') => void;
  onOpenSurpriseMe?: () => void;
  worldMode?: 'cine' | 'futbol' | 'tv' | 'youtube';
  externalSearchQuery?: string;
  onExternalSearchChange?: (val: string) => void;
  cineTab?: 'movies' | 'series';
  onCineTabChange?: (tab: 'movies' | 'series') => void;
  cineCastellano?: boolean;
  onCineCastellanoChange?: (enabled: boolean) => void;
  futbolTab?: 'matches' | 'channels';
  onFutbolTabChange?: (tab: 'matches' | 'channels') => void;
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  lang,
  activeVideoRawUrl,
  loadingItemId,
  watchHistory,
  watchlist,
  favoriteChannels,
  onToggleCatalogFavorite,
  onToggleChannelFavorite,
  onPlayMovie,
  onPlaySeriesEpisode,
  onPlayCatalaEpisode,
  onReplayHistoryItem,
  onPlaySportsMatch,
  onPlayTdtChannel,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onAddToQueue,
  onPlaySecondaryChannel,
  showWatchlistOnly: controlledWatchlistOnly,
  onWatchlistOnlyChange,
  onSearchWithAi,
  onOpenSurpriseMe,
  worldMode,
  externalSearchQuery,
  onExternalSearchChange,
  cineTab: controlledCineTab,
  onCineTabChange,
  cineCastellano: controlledCineCastellano,
  onCineCastellanoChange,
  futbolTab: controlledFutbolTab,
  onFutbolTabChange,
}) => {
  const [internalWatchlistOnly, setInternalWatchlistOnly] = useState(false);
  const showWatchlistOnly =
    controlledWatchlistOnly !== undefined ? controlledWatchlistOnly : internalWatchlistOnly;
  const setShowWatchlistOnly = (valOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    const nextVal =
      typeof valOrUpdater === 'function' ? valOrUpdater(showWatchlistOnly) : valOrUpdater;
    if (controlledWatchlistOnly === undefined) {
      setInternalWatchlistOnly(nextVal);
    }
    onWatchlistOnlyChange?.(nextVal);
  };

  const [previewItem, setPreviewItem] = useState<CatalogMovie | null>(null);

  // Universal Search & Showcase on Cine/Home
  const [homeGenreId] = useState<number | null>(null);
  const [homeProvider] = useState<string>('all');
  const [homeSortBy] = useState<
    'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc'
  >('popularity.desc');
  const [homeQuery, setHomeQuery] = useState('');
  const [debouncedHomeQuery, setDebouncedHomeQuery] = useState('');
  const [homeMovieResults, setHomeMovieResults] = useState<CatalogMovie[]>([]);
  const [homeSeriesResults, setHomeSeriesResults] = useState<CatalogMovie[]>([]);
  const [loadingHomeSearch, setLoadingHomeSearch] = useState(false);
  const [homeShowcaseMovies, setHomeShowcaseMovies] = useState<CatalogMovie[]>([]);
  const [homeShowcaseSeries, setHomeShowcaseSeries] = useState<CatalogMovie[]>([]);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  // Movies & VO state (Sort & Genre separated)
  const [movieQuery, setMovieQuery] = useState('');
  const [debouncedMovieQuery, setDebouncedMovieQuery] = useState('');
  const [movieSort, setMovieSort] = useState<string>('trending');
  const [movieGenre, setMovieGenre] = useState<string>('');
  const [moviePage, setMoviePage] = useState<number>(1);
  const [hasMoreMovies, setHasMoreMovies] = useState<boolean>(false);
  const [movies, setMovies] = useState<CatalogMovie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);

  // TV Series state
  const [seriesQuery, setSeriesQuery] = useState('');
  const [debouncedSeriesQuery, setDebouncedSeriesQuery] = useState('');
  const [seriesSort, setSeriesSort] = useState<string>('trending');
  const [seriesGenre, setSeriesGenre] = useState<string>('');
  const [seriesLangMode, setSeriesLangMode] = useState<'ES' | 'LAT' | 'VOSE' | 'EN'>('ES');
  const [seriesPage, setSeriesPage] = useState<number>(1);
  const [hasMoreSeries, setHasMoreSeries] = useState<boolean>(false);
  const [seriesList, setSeriesList] = useState<CatalogMovie[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingMoreSeries, setLoadingMoreSeries] = useState(false);

  // Instant Series -> Season -> Episode Modal state
  const [selectedSeries, setSelectedSeries] = useState<TvSeriesDetails | null>(null);
  const [seriesModalLang, setSeriesModalLang] = useState<string>('ES');
  const [forceSpanishSeriesActive, setForceSpanishSeriesActive] = useState(false);
  const [loadingSeriesDetails, setLoadingSeriesDetails] = useState(false);
  const [probingSeriesLangs, setProbingSeriesLangs] = useState(false);
  const seriesFetchSeqRef = useRef(0);

  // Spanish TDT + Movistar+ + DAZN Live Television + Real-Time EPG state
  const [tdtChannels, setTdtChannels] = useState<SpanishTdtChannel[]>([]);
  const [loadingTdt, setLoadingTdt] = useState(false);
  const [tdtCategory, setTdtCategory] = useState<'all' | 'tdt_all' | TdtCategory>('all');
  const [tvRegion, setTvRegion] = useState<TvRegionId>('all');
  const [tvFavOnly, setTvFavOnly] = useState<boolean>(false);
  const [tdtSearch, setTdtSearch] = useState('');
  const [epgMap, setEpgMap] = useState<Record<string, ChannelLiveEpg>>({});
  const [epgMadridClock, setEpgMadridClock] = useState<string>('');
  const [loadingEpg, setLoadingEpg] = useState(false);
  const [epgFilter, setEpgFilter] = useState<'all' | 'sports_now' | 'cinema_now'>('all');
  const [selectedEpgChannel, setSelectedEpgChannel] = useState<SpanishTdtChannel | null>(null);
  const [epgClockMs, setEpgClockMs] = useState<number>(() => Date.now());

  // Sports state
  const [footballLiveBrand, setFootballLiveBrand] = useState<
    | 'all'
    | 'bein_arabic'
    | 'china_football'
    | 'uk_sports'
    | 'beinsports'
    | 'espn'
    | 'dsports'
    | 'tnt_space'
    | 'movistar'
    | 'dazn'
  >('all');
  const [sportsSearch, setSportsSearch] = useState('');

  // YouTube state
  const [ytQuery, setYtQuery] = useState('');
  const [debouncedYtQuery, setDebouncedYtQuery] = useState(
    'resumen partido laliga champions highlights hd'
  );
  const [ytResults, setYtResults] = useState<YouTubeSearchItem[]>([]);
  const [loadingYt, setLoadingYt] = useState(false);

  // World Mode state
  const [internalCineTab, setInternalCineTab] = useState<'movies' | 'series'>('movies');
  const effectiveCineTab: 'movies' | 'series' = controlledCineTab ?? internalCineTab;
  const setEffectiveCineTab = (tab: 'movies' | 'series') => {
    setInternalCineTab(tab);
    onCineTabChange?.(tab);
  };

  const [internalCineCastellano, setInternalCineCastellano] = useState(true);
  const effectiveCineCastellano = controlledCineCastellano ?? internalCineCastellano;
  const setEffectiveCineCastellano = (enabled: boolean) => {
    setInternalCineCastellano(enabled);
    onCineCastellanoChange?.(enabled);
  };

  const [internalFutbolTab, setInternalFutbolTab] = useState<'matches' | 'channels'>('matches');
  const effectiveFutbolTab = controlledFutbolTab ?? internalFutbolTab;
  const setEffectiveFutbolTab = (tab: 'matches' | 'channels') => {
    setInternalFutbolTab(tab);
    onFutbolTabChange?.(tab);
  };

  const [cineSpecialPortal, setCineSpecialPortal] = useState<'none' | 'catala'>('none');
  const [cineFiltersOpen, setCineFiltersOpen] = useState(false);
  const [cineAudioOverride, setCineAudioOverride] = useState<'ES' | 'VOSE' | 'EN'>('ES');
  const [futbolFiltersOpen, setFutbolFiltersOpen] = useState(false);
  const [futbolLangFilter, setFutbolLangFilter] = useState<'all' | 'ZH'>('all');
  const [futbolLeagueFilter, setFutbolLeagueFilter] = useState<string>('');
  const [tvFiltersOpen, setTvFiltersOpen] = useState(false);

  // Dedicated "Català · Tot l'Anime en un sol lloc" Hub state
  const [catalaQuery, setCatalaQuery] = useState('');
  const [debouncedCatalaQuery, setDebouncedCatalaQuery] = useState('');
  const [catalaItems, setCatalaItems] = useState<CatalaCatalogItem[]>([]);
  const [loadingCatala, setLoadingCatala] = useState<boolean>(false);
  const [selectedCatalaSeries, setSelectedCatalaSeries] = useState<CatalaSeriesDetails | null>(
    null
  );
  const [loadingCatalaEpisodes, setLoadingCatalaEpisodes] = useState<boolean>(false);

  // Sync external search query driven by WorldShell header
  useEffect(() => {
    if (externalSearchQuery === undefined) return;
    if (worldMode === 'cine') {
      setHomeQuery(externalSearchQuery);
      setMovieQuery(externalSearchQuery);
      setSeriesQuery(externalSearchQuery);
      setCatalaQuery(externalSearchQuery);
    } else if (worldMode === 'futbol') {
      setSportsSearch(externalSearchQuery);
    } else if (worldMode === 'tv') {
      setTdtSearch(externalSearchQuery);
    } else if (worldMode === 'youtube') {
      setYtQuery(externalSearchQuery);
    }
  }, [externalSearchQuery, worldMode]);

  useEffect(() => {
    if (activeSection === 'home' && !worldMode) {
      setTdtCategory('all');
      setEpgFilter('all');
      setShowWatchlistOnly(false);
    }
  }, [activeSection, worldMode]);

  useEffect(() => {
    const clean = homeQuery.trim();
    if (!clean || /^https?:\/\//i.test(clean)) {
      setDebouncedHomeQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedHomeQuery(clean), 260);
    return () => clearTimeout(timer);
  }, [homeQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMovieQuery(movieQuery.trim());
      setMoviePage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [movieQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSeriesQuery(seriesQuery.trim());
      setSeriesPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [seriesQuery]);

  useEffect(() => {
    const clean = ytQuery.trim();
    if (!clean) return;
    const timer = setTimeout(() => setDebouncedYtQuery(clean), 340);
    return () => clearTimeout(timer);
  }, [ytQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCatalaQuery(catalaQuery.trim()), 280);
    return () => clearTimeout(timer);
  }, [catalaQuery]);

  const fetchTdtCatalog = async () => {
    setLoadingTdt(true);
    try {
      const res = await fetch('/api/catalog/tdt');
      const data = await res.json();
      if (Array.isArray(data?.channels)) {
        setTdtChannels(data.channels);
      }
    } catch {
      // Keep cached channels
    } finally {
      setLoadingTdt(false);
    }
  };

  const fetchLiveEpg = React.useCallback(async (forceRefresh = false) => {
    setLoadingEpg(true);
    try {
      const res = await fetch(forceRefresh ? '/api/epg/live?refresh=1' : '/api/epg/live');
      const data = await res.json();
      if (data?.epg && typeof data.epg === 'object') {
        setEpgMap(data.epg);
      }
      if (typeof data?.madridTimeLabel === 'string') {
        setEpgMadridClock(data.madridTimeLabel);
      }
      setEpgClockMs(Date.now());
    } catch {
      // Keep previous EPG snapshot
    } finally {
      setLoadingEpg(false);
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      setEpgClockMs(now);
      try {
        setEpgMadridClock(
          new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(now))
        );
      } catch {
        // Ignore Intl fallback
      }
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const needsEpg =
      worldMode === 'tv' ||
      activeSection === 'home' ||
      activeSection === 'tdt' ||
      activeSection === 'catala';
    if (!needsEpg) return;

    fetchLiveEpg(false);
    const refreshTimer = setInterval(() => fetchLiveEpg(false), 180000);
    return () => clearInterval(refreshTimer);
  }, [worldMode, activeSection, fetchLiveEpg]);

  const getChannelLiveEpg = React.useCallback(
    (channelId: string): ChannelLiveEpg | null => {
      const raw = epgMap[channelId];
      if (!raw) return null;
      const schedule: EpgProgramItem[] =
        Array.isArray(raw.upcoming) && raw.upcoming.length > 0
          ? raw.upcoming
          : ([raw.now, raw.next].filter(Boolean) as EpgProgramItem[]);
      if (schedule.length === 0) return raw;

      const activeIdx = schedule.findIndex(
        (p) => p.startMs <= epgClockMs && p.stopMs > epgClockMs
      );
      if (activeIdx === -1) {
        const nextUpcoming = schedule.find((p) => p.startMs > epgClockMs) || null;
        return {
          ...raw,
          now: raw.now && raw.now.stopMs > epgClockMs ? raw.now : null,
          next: nextUpcoming,
        };
      }

      const nowProg = schedule[activeIdx];
      const nextProg = schedule[activeIdx + 1] || null;
      const duration = Math.max(60000, nowProg.stopMs - nowProg.startMs);
      const elapsed = Math.max(0, Math.min(duration, epgClockMs - nowProg.startMs));
      const progressPct = Math.max(2, Math.min(100, Math.round((elapsed / duration) * 100)));
      const remainingMin = Math.max(1, Math.ceil((nowProg.stopMs - epgClockMs) / 60000));

      return {
        channelId,
        now: nowProg,
        next: nextProg,
        progressPct,
        remainingMin,
        upcoming: schedule.filter((p) => p.stopMs > epgClockMs),
      };
    },
    [epgMap, epgClockMs]
  );

  useEffect(() => {
    if (
      (worldMode === 'tv' ||
        worldMode === 'futbol' ||
        activeSection === 'home' ||
        activeSection === 'tdt' ||
        activeSection === 'sports') &&
      tdtChannels.length === 0
    ) {
      fetchTdtCatalog();
    }
  }, [worldMode, activeSection, tdtChannels.length]);

  useEffect(() => {
    if (homeShowcaseMovies.length > 0 && homeShowcaseSeries.length > 0) return;
    let cancelled = false;

    Promise.all([
      fetch('/api/catalog/movies?provider=all&category=trending&page=1')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
      fetch('/api/catalog/series?provider=all&category=trending&page=1&lang=es')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
    ]).then(([mData, sData]) => {
      if (cancelled) return;
      const mItems: CatalogMovie[] = Array.isArray(mData?.items)
        ? mData.items
        : Array.isArray(mData?.movies)
        ? mData.movies
        : [];
      const sItems: CatalogMovie[] = Array.isArray(sData?.items)
        ? sData.items.map((it: CatalogMovie) => ({ ...it, mediaType: 'tv' as const }))
        : Array.isArray(sData?.series)
        ? sData.series.map((it: CatalogMovie) => ({ ...it, mediaType: 'tv' as const }))
        : [];
      if (mItems.length > 0) setHomeShowcaseMovies(mItems);
      if (sItems.length > 0) setHomeShowcaseSeries(sItems);
    });

    return () => {
      cancelled = true;
    };
  }, [homeShowcaseMovies.length, homeShowcaseSeries.length]);

  // Execute Unified Search on Home / Cine
  useEffect(() => {
    const activeForHomeSearch = worldMode === 'cine' || activeSection === 'home';
    if (!activeForHomeSearch || debouncedHomeQuery.length < 2) {
      setHomeMovieResults([]);
      setHomeSeriesResults([]);
      setLoadingHomeSearch(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let pending = 2;
    setLoadingHomeSearch(true);

    const markDone = () => {
      pending -= 1;
      if (active && pending <= 0) {
        setLoadingHomeSearch(false);
      }
    };

    fetch(
      `/api/catalog/movies?provider=all&category=trending&page=1&query=${encodeURIComponent(
        debouncedHomeQuery
      )}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : { movies: [] }))
      .then((mData) => {
        if (!active) return;
        setHomeMovieResults(Array.isArray(mData?.movies) ? mData.movies.slice(0, 12) : []);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHomeMovieResults([]);
      })
      .finally(markDone);

    fetch(
      `/api/catalog/series?provider=all&category=trending&page=1&lang=es&query=${encodeURIComponent(
        debouncedHomeQuery
      )}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .then((sData) => {
        if (!active) return;
        setHomeSeriesResults(Array.isArray(sData?.series) ? sData.series.slice(0, 12) : []);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHomeSeriesResults([]);
      })
      .finally(markDone);

    return () => {
      active = false;
      controller.abort();
    };
  }, [worldMode, activeSection, debouncedHomeQuery]);

  // Fetch Movies
  useEffect(() => {
    const inCineMovies =
      worldMode === 'cine' && effectiveCineTab === 'movies' && cineSpecialPortal === 'none';
    const shouldFetch =
      inCineMovies || activeSection === 'movies' || activeSection === 'vose';
    if (!shouldFetch || showWatchlistOnly) return;

    let cancelled = false;
    if (moviePage === 1) setLoadingMovies(true);
    else setLoadingMoreMovies(true);

    const activeCatParam = movieGenre || movieSort;
    const useVose =
      activeSection === 'vose' ||
      (worldMode === 'cine' && !effectiveCineCastellano && cineAudioOverride === 'EN');
    const endpoint = useVose
      ? `/api/catalog/bingetrix?provider=all&category=${encodeURIComponent(
          activeCatParam
        )}&sort=${encodeURIComponent(movieSort)}&page=${moviePage}&query=${encodeURIComponent(
          debouncedMovieQuery
        )}`
      : `/api/catalog/movies?provider=all&category=${encodeURIComponent(
          activeCatParam
        )}&sort=${encodeURIComponent(movieSort)}&page=${moviePage}&query=${encodeURIComponent(
          debouncedMovieQuery
        )}`;

    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.movies) ? data.movies : [];
        setHasMoreMovies(Boolean(data?.hasMore));
        setMovies((prev) => {
          if (moviePage === 1) return incoming;
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
        });
      })
      .catch(() => {
        if (!cancelled && moviePage === 1) setMovies([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMovies(false);
          setLoadingMoreMovies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    worldMode,
    effectiveCineTab,
    effectiveCineCastellano,
    cineAudioOverride,
    cineSpecialPortal,
    activeSection,
    movieSort,
    movieGenre,
    moviePage,
    debouncedMovieQuery,
    showWatchlistOnly,
  ]);

  // Fetch TV Series Catalog
  useEffect(() => {
    const inCineSeries =
      worldMode === 'cine' && effectiveCineTab === 'series' && cineSpecialPortal === 'none';
    if (!inCineSeries && activeSection !== 'series') return;
    let cancelled = false;
    if (seriesPage === 1) setLoadingSeries(true);
    else setLoadingMoreSeries(true);

    const activeCatParam = seriesGenre || seriesSort;
    const apiLang =
      !effectiveCineCastellano && (seriesLangMode === 'EN' || seriesLangMode === 'VOSE')
        ? 'en'
        : 'es';
    fetch(
      `/api/catalog/series?provider=all&category=${encodeURIComponent(
        activeCatParam
      )}&sort=${encodeURIComponent(seriesSort)}&page=${seriesPage}&lang=${apiLang}&query=${encodeURIComponent(
        debouncedSeriesQuery
      )}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.series) ? data.series : [];
        setHasMoreSeries(Boolean(data?.hasMore));
        setSeriesList((prev) => {
          if (seriesPage === 1) return incoming;
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...incoming.filter((s) => !seen.has(s.id))];
        });
      })
      .catch(() => {
        if (!cancelled && seriesPage === 1) setSeriesList([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSeries(false);
          setLoadingMoreSeries(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    worldMode,
    effectiveCineTab,
    effectiveCineCastellano,
    cineSpecialPortal,
    activeSection,
    seriesSort,
    seriesGenre,
    seriesPage,
    seriesLangMode,
    debouncedSeriesQuery,
  ]);

  const openSeriesDetails = (
    tmdbId: number,
    seasonNum = 1,
    seedShow?: Partial<CatalogMovie>,
    forceSpanishProbe = false
  ) => {
    const reqSeq = ++seriesFetchSeqRef.current;
    setLoadingSeriesDetails(true);
    if (forceSpanishProbe) {
      setSeriesModalLang('ES');
      setForceSpanishSeriesActive(true);
    } else if (!selectedSeries || selectedSeries.tmdbId !== tmdbId) {
      setSeriesModalLang(seriesLangMode === 'EN' || seriesLangMode === 'VOSE' ? seriesLangMode : 'ES');
      setForceSpanishSeriesActive(false);
    }

    setSelectedSeries((prev) => {
      if (prev && prev.tmdbId === tmdbId) {
        return { ...prev, activeSeason: seasonNum };
      }
      return {
        tmdbId,
        title:
          seedShow?.title ||
          pickLang(lang, {
            es: 'Cargando serie...',
            ca: 'Carregant sèrie...',
            en: 'Loading series...',
          }),
        originalTitle: seedShow?.originalTitle || seedShow?.title || '',
        year: seedShow?.year || 'TV',
        rating: seedShow?.rating || '',
        overview: seedShow?.overview || '',
        poster: seedShow?.poster || '',
        backdrop: seedShow?.backdrop || seedShow?.poster || '',
        seasons: [
          {
            seasonNumber: seasonNum,
            name: pickLang(lang, {
              es: `Temporada ${seasonNum}`,
              ca: `Temporada ${seasonNum}`,
              en: `Season ${seasonNum}`,
            }),
            episodeCount: 0,
          },
        ],
        activeSeason: seasonNum,
        episodes: [],
      };
    });

    const apiLang = forceSpanishProbe ? 'es' : lang === 'en' ? 'en' : 'es';
    fetch(
      `/api/catalog/tv/${tmdbId}?season=${seasonNum}&lang=${apiLang}${
        forceSpanishProbe ? '&force=1&forceSpanish=1' : ''
      }`
    )
      .then((r) => r.json())
      .then((data) => {
        if (reqSeq !== seriesFetchSeqRef.current) return;
        if (data?.success && data?.details) {
          const nextSeries: TvSeriesDetails = data.details;
          setSelectedSeries(nextSeries);
          setLoadingSeriesDetails(false);

          if (
            !forceSpanishProbe &&
            Array.isArray(nextSeries.availableLanguages) &&
            nextSeries.availableLanguages.length > 0
          ) {
            setProbingSeriesLangs(false);
            const avail = nextSeries.availableLanguages;
            setSeriesModalLang((prev) =>
              avail.includes('ES') ? 'ES' : avail.includes(prev as 'ES' | 'LAT' | 'VOSE' | 'EN') ? prev : avail[0]
            );
          } else {
            setProbingSeriesLangs(true);
            const firstEp = nextSeries.episodes[0]?.episodeNumber || 1;
            fetch(
              `/api/catalog/tv/${tmdbId}/languages?season=${nextSeries.activeSeason}&episode=${firstEp}&title=${encodeURIComponent(
                nextSeries.title || ''
              )}&origTitle=${encodeURIComponent(nextSeries.originalTitle || '')}${
                forceSpanishProbe ? '&force=1&forceSpanish=1' : ''
              }`
            )
              .then((r2) => r2.json())
              .then((langData) => {
                if (reqSeq !== seriesFetchSeqRef.current) return;
                const avail: ('ES' | 'LAT' | 'VOSE' | 'EN')[] = Array.isArray(
                  langData?.availableLanguages
                )
                  ? langData.availableLanguages
                  : [];
                if (avail.length > 0) {
                  setSelectedSeries((curr) =>
                    curr && curr.tmdbId === tmdbId
                      ? { ...curr, availableLanguages: avail }
                      : curr
                  );
                  setSeriesModalLang((prev) =>
                    forceSpanishProbe
                      ? avail.includes('ES')
                        ? 'ES'
                        : avail[0]
                      : avail.includes('ES')
                      ? 'ES'
                      : avail.includes(prev as 'ES' | 'LAT' | 'VOSE' | 'EN')
                      ? prev
                      : avail[0]
                  );
                }
              })
              .catch(() => {})
              .finally(() => {
                if (reqSeq === seriesFetchSeqRef.current) {
                  setProbingSeriesLangs(false);
                }
              });
          }
        } else {
          setLoadingSeriesDetails(false);
        }
      })
      .catch(() => {
        if (reqSeq === seriesFetchSeqRef.current) {
          setLoadingSeriesDetails(false);
        }
      });
  };

  // Fetch YouTube Search Results
  useEffect(() => {
    if (worldMode !== 'youtube' && activeSection !== 'youtube') return;
    let cancelled = false;
    setLoadingYt(true);

    fetch(`/api/catalog/youtube?q=${encodeURIComponent(debouncedYtQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.videos)) {
          setYtResults(data.videos);
        }
      })
      .catch(() => {
        if (!cancelled) setYtResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingYt(false);
      });

    return () => {
      cancelled = true;
    };
  }, [worldMode, activeSection, debouncedYtQuery]);

  // Fetch Català Anime Catalog
  useEffect(() => {
    const inCineCatala = worldMode === 'cine' && cineSpecialPortal === 'catala';
    if (!inCineCatala && activeSection !== 'catala') return;
    let cancelled = false;
    setLoadingCatala(true);

    const params = new URLSearchParams({
      category: 'all',
      query: debouncedCatalaQuery,
    });

    fetch(`/api/catalog/catala?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.items)) setCatalaItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setCatalaItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatala(false);
      });

    return () => {
      cancelled = true;
    };
  }, [worldMode, cineSpecialPortal, activeSection, debouncedCatalaQuery]);

  const openCatalaSeriesDetails = async (item: CatalaCatalogItem, seasonNum = 1) => {
    setLoadingCatalaEpisodes(true);

    setSelectedCatalaSeries((prev) =>
      prev && prev.id === item.id
        ? { ...prev, activeSeason: seasonNum }
        : {
            id: item.id,
            title: item.title,
            originalTitle: item.originalTitle,
            eraTag: item.eraTag,
            year: item.year,
            rating: item.rating,
            overview: item.overview,
            poster: item.poster,
            backdrop: item.backdrop || item.poster,
            activeSeason: seasonNum,
            seasons: [{ seasonNumber: seasonNum, name: `Temporada ${seasonNum}`, episodeCount: 0 }],
            episodes: [],
          }
    );

    try {
      const res = await fetch(
        `/api/catalog/catala/${encodeURIComponent(item.id)}/episodes?season=${seasonNum}`
      );
      const data = await res.json();
      if (res.ok && data?.success && data?.details) {
        setSelectedCatalaSeries(data.details);
      }
    } catch {
      // Keep shell
    } finally {
      setLoadingCatalaEpisodes(false);
    }
  };

  const handleToggleBookmark = (item: CatalogMovie, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    onToggleCatalogFavorite(item);
  };

  const isBookmarked = (item: CatalogMovie) =>
    watchlist.some((x) => isSameCatalogItem(x, item));

  const isChannelFavorited = (favId: string) => {
    const clean = sanitizeItemKey(favId);
    return favoriteChannels.some((c) => sanitizeItemKey(c.favId) === clean);
  };

  const footballSectionLiveChannels = React.useMemo(() => {
    const allowedCats = new Set([
      'bein_arabic',
      'china_football',
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'movistar',
      'dazn',
    ]);
    return tdtChannels.filter((ch) => {
      const isExtraSportCh = ch.id === 'ma-arryadia' || ch.id === 'us-fox-sports1';
      if (!allowedCats.has(ch.category) && !isExtraSportCh) return false;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        return false;
      }
      if (footballLiveBrand !== 'all' && ch.category !== footballLiveBrand) return false;
      if (sportsSearch.trim()) {
        const norm = (s: string) =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const q = norm(sportsSearch);
        const matchesCh =
          norm(ch.name).includes(q) ||
          norm(ch.shortMark).includes(q) ||
          norm(ch.network).includes(q);
        if (
          /cctv|china|chino|zh|guangdong|fengyun|xinshijue|tianjin|sky|uk|premier|eurosport|mutv|talksport|fifa|bein|arab|arabe|arryadia|maroc|marruecos|fox|espn|dsport|directv|tnt|space|movistar|dazn|laliga|campeones|vamos|f1|motor|fight/i.test(
            q
          )
        ) {
          return matchesCh;
        }
      }
      return true;
    });
  }, [tdtChannels, footballLiveBrand, sportsSearch]);

  const filteredTdtChannels = tdtChannels.filter((ch) => {
    if (tvFavOnly) {
      const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
      if (!isChannelFavorited(favId)) return false;
    }

    if (tvRegion !== 'all') {
      const reg = getChannelRegionMeta(ch);
      if (reg.region !== tvRegion) return false;
    }

    if (tdtCategory === 'tdt_all') {
      if (
        ch.category === 'movistar' ||
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'china_football' ||
        ch.category === 'beinsports' ||
        ch.category === 'bein_arabic' ||
        ch.category === 'marruecos' ||
        ch.category === 'documentales' ||
        ch.category === 'usa_tv' ||
        ch.category === 'europa_tv' ||
        ch.category === 'noticias_intl' ||
        ch.category === 'espn' ||
        ch.category === 'dsports' ||
        ch.category === 'tnt_space'
      ) {
        return false;
      }
    } else if (tdtCategory !== 'all' && ch.category !== tdtCategory) {
      return false;
    }

    const chEpg = getChannelLiveEpg(ch.id);
    const epgHaystack = `${chEpg?.now?.title || ''} ${chEpg?.now?.category || ''} ${
      chEpg?.now?.description || ''
    } ${chEpg?.next?.title || ''}`.toLowerCase();

    if (epgFilter === 'sports_now') {
      const isSportsChannel =
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'china_football' ||
        ch.category === 'beinsports' ||
        ch.category === 'espn' ||
        ch.category === 'dsports' ||
        ch.id === 'tnt-sports' ||
        ch.id.includes('laliga') ||
        ch.id.includes('champions') ||
        ch.id.includes('campeones') ||
        ch.id.includes('deportes') ||
        ch.id.includes('vamos') ||
        ch.id.includes('golf') ||
        ch.id.includes('tdp') ||
        ch.id.includes('gol') ||
        ch.id.includes('rmtv');
      const isAiringSports =
        /deporte|f[uú]tbol|laliga|champions|f1|f[oó]rmula|motogp|tenis|baloncesto|nba|acb|ciclismo|golf|motor|directo|liga/i.test(
          epgHaystack
        );
      if (!isSportsChannel && !isAiringSports) return false;
    } else if (epgFilter === 'cinema_now') {
      const isCinemaChannel =
        ch.category === 'cine_series' ||
        ch.id === 'tnt-vivo' ||
        ch.id === 'space-vivo' ||
        ch.id === 'mplus-estrenos' ||
        ch.id === 'mplus-accion' ||
        ch.id === 'mplus-series';
      const isAiringCinema =
        /cine|pel[ií]cula|serie|thriller|drama|comedia|acci[oó]n|ficci[oó]n|temporada|episodio|cap[ií]tulo/i.test(
          epgHaystack
        );
      if (!isCinemaChannel && !isAiringCinema) return false;
    }

    if (tdtSearch.trim()) {
      const norm = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const q = norm(tdtSearch);
      return (
        norm(ch.name).includes(q) ||
        norm(ch.shortMark).includes(q) ||
        norm(ch.network).includes(q) ||
        norm(ch.description).includes(q) ||
        norm(epgHaystack).includes(q) ||
        String(ch.dial) === q.trim()
      );
    }
    return true;
  });

  const tvCategoryCounts = React.useMemo(() => {
    const perCategory: Record<string, number> = {};
    const perRegion: Record<string, number> = {};
    for (const ch of tdtChannels) {
      perCategory[ch.category] = (perCategory[ch.category] || 0) + 1;
      const reg = getChannelRegionMeta(ch).region;
      perRegion[reg] = (perRegion[reg] || 0) + 1;
    }
    return { perCategory, perRegion };
  }, [tdtChannels]);

  const footballNetworkCounts = React.useMemo(() => {
    const allowedCats = new Set([
      'bein_arabic',
      'china_football',
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'movistar',
      'dazn',
    ]);
    const counts: Record<string, number> = { all: 0 };
    for (const ch of tdtChannels) {
      const isExtraSportCh = ch.id === 'ma-arryadia' || ch.id === 'us-fox-sports1';
      if (!allowedCats.has(ch.category) && !isExtraSportCh) continue;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        continue;
      }
      counts.all += 1;
      counts[ch.category] = (counts[ch.category] || 0) + 1;
    }
    return counts;
  }, [tdtChannels]);

  const activePillar = normalizeCatalogPillar(activeSection, showWatchlistOnly);

  const futbolPull = usePullToRefresh(async () => {
    await fetchTdtCatalog();
  }, worldMode === 'futbol');

  const tvPull = usePullToRefresh(async () => {
    await Promise.all([fetchTdtCatalog(), fetchLiveEpg(true)]);
  }, worldMode === 'tv');

  return (
    <div
      className="@container w-full min-w-0 max-w-full space-y-4 pb-24 sm:pb-8"
      data-pillar={activePillar}
    >
      <MediaDetailsModal
        item={previewItem}
        lang={lang}
        defaultAudioLang={
          effectiveCineCastellano
            ? 'ES'
            : cineAudioOverride === 'EN'
            ? 'EN'
            : seriesLangMode === 'EN'
            ? 'EN'
            : 'VOSE'
        }
        isBookmarked={previewItem ? isBookmarked(previewItem) : false}
        onClose={() => setPreviewItem(null)}
        onPlayMovie={(m, pLang, opts) => {
          onExternalSearchChange?.('');
          onPlayMovie(m, pLang, opts);
        }}
        onOpenSeriesEpisodes={(tmdbId, forceSpanish) => {
          const seed = previewItem || undefined;
          setPreviewItem(null);
          onExternalSearchChange?.('');
          openSeriesDetails(tmdbId, seed?.seasonNumber || 1, seed, Boolean(forceSpanish));
        }}
        onToggleBookmark={(m) => onToggleCatalogFavorite(m)}
        onAddToQueue={onAddToQueue}
        onSelectSimilar={(sim) => setPreviewItem(sim)}
      />

      <CatalaEpisodePickerModal
        lang={lang}
        selectedSeries={selectedCatalaSeries}
        loadingEpisodes={loadingCatalaEpisodes}
        onClose={() => setSelectedCatalaSeries(null)}
        onSelectSeason={openCatalaSeriesDetails}
        onPlayEpisode={onPlayCatalaEpisode}
        onAddToQueue={onAddToQueue}
      />

      <SeriesEpisodePickerModal
        lang={lang}
        selectedSeries={selectedSeries}
        seriesModalLang={seriesModalLang}
        forceSpanishSeriesActive={forceSpanishSeriesActive}
        loadingSeriesDetails={loadingSeriesDetails}
        probingSeriesLangs={probingSeriesLangs}
        loadingItemId={loadingItemId}
        watchHistory={watchHistory}
        isBookmarked={isBookmarked}
        onClose={() => setSelectedSeries(null)}
        onSeriesModalLangChange={setSeriesModalLang}
        onOpenSeriesDetails={openSeriesDetails}
        onToggleBookmark={handleToggleBookmark}
        onReplayHistoryItem={onReplayHistoryItem}
        onPlaySeriesEpisode={onPlaySeriesEpisode}
        onAddToQueue={onAddToQueue}
      />

      {/* WORLD 1: CINE */}
      {(worldMode === 'cine' || (!worldMode && activeSection === 'home')) && (
        <CineWorldView
          lang={lang}
          effectiveCineTab={effectiveCineTab}
          onChangeCineTab={setEffectiveCineTab}
          effectiveCineCastellano={effectiveCineCastellano}
          onChangeCineCastellano={setEffectiveCineCastellano}
          cineAudioOverride={cineAudioOverride}
          onChangeCineAudioOverride={setCineAudioOverride}
          onChangeSeriesLangMode={setSeriesLangMode}
          cineSpecialPortal={cineSpecialPortal}
          onChangeCineSpecialPortal={setCineSpecialPortal}
          cineFiltersOpen={cineFiltersOpen}
          onChangeCineFiltersOpen={setCineFiltersOpen}
          externalSearchQuery={externalSearchQuery}
          homeQuery={homeQuery}
          onClearExternalSearch={onExternalSearchChange ? () => onExternalSearchChange('') : undefined}
          homeShowcaseMovies={homeShowcaseMovies}
          homeShowcaseSeries={homeShowcaseSeries}
          movies={movies}
          seriesList={seriesList}
          movieSort={movieSort}
          onChangeMovieSort={setMovieSort}
          movieGenre={movieGenre}
          onChangeMovieGenre={setMovieGenre}
          onResetMoviePage={() => setMoviePage(1)}
          onNextMoviePage={() => setMoviePage((p) => p + 1)}
          hasMoreMovies={hasMoreMovies}
          loadingMovies={loadingMovies}
          loadingMoreMovies={loadingMoreMovies}
          seriesSort={seriesSort}
          onChangeSeriesSort={setSeriesSort}
          seriesGenre={seriesGenre}
          onChangeSeriesGenre={setSeriesGenre}
          onResetSeriesPage={() => setSeriesPage(1)}
          onNextSeriesPage={() => setSeriesPage((p) => p + 1)}
          hasMoreSeries={hasMoreSeries}
          loadingSeries={loadingSeries}
          loadingMoreSeries={loadingMoreSeries}
          loadingHomeSearch={loadingHomeSearch}
          homeMovieResults={homeMovieResults}
          homeSeriesResults={homeSeriesResults}
          catalaItems={catalaItems}
          loadingCatala={loadingCatala}
          heroSlideIndex={heroSlideIndex}
          onChangeHeroSlideIndex={setHeroSlideIndex}
          onHeroHoverChange={setIsHeroHovered}
          homeGenreId={homeGenreId}
          homeProvider={homeProvider}
          homeSortBy={homeSortBy}
          onDiscoveryGenresLoaded={() => {}}
          isBookmarked={isBookmarked}
          onToggleBookmark={handleToggleBookmark}
          onOpenPreviewItem={setPreviewItem}
          onOpenSeriesDetails={(tmdbId, seasonNum, seed) => openSeriesDetails(tmdbId, seasonNum, seed)}
          onOpenCatalaSeriesDetails={openCatalaSeriesDetails}
          onPlayMovie={onPlayMovie}
          onPlayCustomUrl={onPlayCustomUrl}
          onOpenCloudBrowser={onOpenCloudBrowser}
          onSearchWithAi={onSearchWithAi}
          onOpenSurpriseMe={onOpenSurpriseMe}
        />
      )}

      {/* WORLD 2: FÚTBOL (PARTIDOS | CANALES + FILTROS INCL. CHINA 中文) */}
      {(worldMode === 'futbol' || (!worldMode && activeSection === 'sports')) && (() => {
        const activeFilterCount =
          (futbolLeagueFilter ? 1 : 0) + (footballLiveBrand !== 'all' ? 1 : 0);

        return (
          <div
            ref={futbolPull.containerRef}
            {...futbolPull.pullHandlers}
            className="space-y-4"
          >
            {futbolPull.pullDistance > 10 && (
              <div className="text-center text-xs text-[#BF94FF] font-semibold py-1">
                {futbolPull.isRefreshing
                  ? pickLang(lang, {
                      es: 'Actualizando...',
                      ca: 'Actualitzant...',
                      en: 'Refreshing...',
                    })
                  : pickLang(lang, {
                      es: 'Suelta para actualizar',
                      ca: 'Deixa anar per actualitzar',
                      en: 'Release to refresh',
                    })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <SegmentedControl
                  layoutId="futbol-main-tabs"
                  value={effectiveFutbolTab}
                  onChange={(tTab) => {
                    triggerHaptic('light');
                    setEffectiveFutbolTab(tTab);
                  }}
                  options={[
                    { id: 'matches', label: pickLang(lang, { es: 'Partidos', ca: 'Partits', en: 'Matches' }) },
                    { id: 'channels', label: pickLang(lang, { es: 'Canales', ca: 'Canals', en: 'Channels' }) },
                  ]}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setFutbolFiltersOpen(true);
                }}
                className={`min-h-12 px-3.5 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all ${
                  activeFilterCount > 0
                    ? 'bg-[#9146FF]/22 border-[#9146FF] text-white'
                    : 'bg-white/[0.05] border-white/[0.1] text-zinc-100 hover:bg-white/[0.1]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
                {activeFilterCount > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-[#9146FF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {effectiveFutbolTab === 'matches' ? (
              <React.Suspense
                fallback={
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                }
              >
                <FootballMatchboard
                  lang={lang}
                  searchQuery={sportsSearch}
                  onSearchQueryChange={setSportsSearch}
                  langFilter={futbolLangFilter}
                  leagueFilter={futbolLeagueFilter}
                  activeVideoRawUrl={activeVideoRawUrl}
                  loadingItemId={loadingItemId}
                  onPlaySportsMatch={onPlaySportsMatch}
                  onPlaySecondaryChannel={
                    onPlaySecondaryChannel
                      ? (m, idx) =>
                          onPlaySecondaryChannel({
                            sourceUrl: m.channels[idx]?.sourceUrl || '',
                            title: m.title,
                            subtitle: m.competition,
                          })
                      : undefined
                  }
                  isChannelFavorited={isChannelFavorited}
                  onToggleChannelFavorite={onToggleChannelFavorite}
                />
              </React.Suspense>
            ) : (
              <div className="space-y-2.5">
                {loadingTdt && footballSectionLiveChannels.length === 0 ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
                  </div>
                ) : footballSectionLiveChannels.length === 0 ? (
                  <div className="py-10 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-zinc-400">
                    {pickLang(lang, {
                      es: 'No hay canales con este filtro.',
                      ca: 'No hi ha canals amb aquest filtre.',
                      en: 'No channels match this filter.',
                    })}
                  </div>
                ) : (
                  footballSectionLiveChannels.map((ch) => {
                    const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
                    const faved = isChannelFavorited(favId);
                    const regMeta = getChannelRegionMeta(ch);
                    const isPlaying = Boolean(
                      activeVideoRawUrl &&
                        ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
                    );
                    return (
                      <div
                        key={ch.id}
                        className={`relative group min-h-[76px] p-3 rounded-2xl bg-[#11131B] border flex items-center justify-between gap-3 transition-colors ${
                          isPlaying
                            ? 'border-[#9146FF] bg-[#9146FF]/[0.07]'
                            : 'border-white/[0.08] hover:border-[#9146FF]/50 hover:bg-white/[0.03]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('success');
                            onPlayTdtChannel(ch, 0);
                          }}
                          aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
                          className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
                        />

                        <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
                          <ChannelLogoBadge channel={ch} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="font-display font-bold text-sm text-white truncate flex items-center gap-1.5">
                              <span className="truncate">{ch.name}</span>
                              <span className="text-xs font-medium text-zinc-400 shrink-0">
                                · {regMeta.langTag}
                              </span>
                            </p>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {ch.category === 'china_football'
                                ? 'China (中文 · 欧冠/西甲/英超)'
                                : ch.network}
                            </p>
                          </div>
                        </div>

                        <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleChannelFavorite({
                                favId,
                                title: ch.name,
                                channelLabel: ch.shortMark,
                                channelUrl: ch.channels[0]?.sourceUrl || '',
                                competition: ch.network,
                                sport: 'soccer',
                              });
                            }}
                            aria-label={pickLang(lang, { es: 'Favorito', ca: 'Favorit', en: 'Favorite' })}
                            className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                              faved
                                ? 'bg-[#9146FF]/20 border-[#9146FF] text-[#D8B4FE]'
                                : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('success');
                              onPlayTdtChannel(ch, 0);
                            }}
                            aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${ch.name}`}
                            className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer active:scale-95 transition-all ${
                              isPlaying
                                ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                                : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-[#9146FF]/20 hover:border-[#9146FF]/50 hover:text-white'
                            }`}
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <BottomSheet
              isOpen={futbolFiltersOpen}
              onClose={() => setFutbolFiltersOpen(false)}
              lang={lang}
              title={pickLang(lang, { es: 'Filtros de Fútbol', ca: 'Filtres de Futbol', en: 'Football Filters' })}
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, {
                      es: 'Ligas (filtra partidos)',
                      ca: 'Lligues (filtra partits)',
                      en: 'Leagues (filters matches)',
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: '', label: pickLang(lang, { es: 'Todas', ca: 'Totes', en: 'All' }) },
                      { id: 'champions', label: 'Champions League' },
                      { id: 'laliga', label: 'LaLiga' },
                      { id: 'hypermotion', label: 'LaLiga Hypermotion' },
                      { id: 'premier', label: 'Premier League' },
                      { id: 'europa', label: 'Europa League' },
                      { id: 'serie a', label: 'Serie A' },
                      { id: 'bundesliga', label: 'Bundesliga' },
                      { id: 'world', label: pickLang(lang, { es: 'Selecciones', ca: 'Seleccions', en: 'Internationals' }) },
                    ].map((lg) => (
                      <button
                        key={lg.id || 'all-lg'}
                        type="button"
                        onClick={() => setFutbolLeagueFilter(lg.id)}
                        className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                          futbolLeagueFilter === lg.id
                            ? 'bg-[#9146FF] border-[#9146FF] text-white'
                            : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.09]'
                        }`}
                      >
                        {lg.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {pickLang(lang, {
                      es: 'Redes de Canales (filtra señales)',
                      ca: 'Xarxes de Canals (filtra senyals)',
                      en: 'Channel Networks (filters feeds)',
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'all', flagCode: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
                        { id: 'bein_arabic', flagCode: 'qa', label: 'beIN SPORTS (العربية)' },
                        { id: 'china_football', flagCode: 'cn', label: 'Fútbol China (中文)' },
                        { id: 'movistar', flagCode: 'es', label: 'Movistar+' },
                        { id: 'dazn', flagCode: 'es', label: 'DAZN' },
                        { id: 'uk_sports', flagCode: 'uk', label: 'UK Sports (EN)' },
                        { id: 'beinsports', flagCode: 'all', label: 'beIN SPORTS (Global)' },
                        { id: 'espn', flagCode: 'lat', label: 'ESPN (1–7)' },
                        { id: 'dsports', flagCode: 'lat', label: 'DSports' },
                        { id: 'tnt_space', flagCode: 'lat', label: 'TNT y Space' },
                      ] as const
                    ).map((br) => {
                      const netCount = footballNetworkCounts[br.id] ?? 0;
                      const active = footballLiveBrand === br.id;
                      return (
                        <button
                          key={br.id}
                          type="button"
                          onClick={() => {
                            setFootballLiveBrand(br.id);
                            if (br.id !== 'china_football' && br.id !== 'all') {
                              setFutbolLangFilter('all');
                            }
                          }}
                          className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#9146FF] border-[#9146FF] text-white'
                              : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.09]'
                          }`}
                        >
                          <FlagBadgeSvg code={br.flagCode} className="w-4 h-2.5 shrink-0" />
                          <span>{br.label}</span>
                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              active ? 'text-white/85' : 'text-zinc-400'
                            }`}
                          >
                            ({netCount})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFutbolLangFilter('all');
                      setFutbolLeagueFilter('');
                      setFootballLiveBrand('all');
                    }}
                    className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFutbolFiltersOpen(false)}
                    className="flex-1 min-h-12 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
                  </button>
                </div>
              </div>
            </BottomSheet>
          </div>
        );
      })()}

      {/* WORLD 3: TV EN DIRECTO */}
      {(worldMode === 'tv' || (!worldMode && activeSection === 'tdt')) && (
        <LiveTvWorldView
          lang={lang}
          pull={tvPull}
          tdtChannels={tdtChannels}
          filteredChannels={filteredTdtChannels}
          loadingTdt={loadingTdt}
          activeVideoRawUrl={activeVideoRawUrl}
          tdtCategory={tdtCategory}
          tvRegion={tvRegion}
          tvFavOnly={tvFavOnly}
          epgFilter={epgFilter}
          epgMadridClock={epgMadridClock}
          tvFiltersOpen={tvFiltersOpen}
          tvCategoryCounts={tvCategoryCounts}
          getChannelLiveEpg={getChannelLiveEpg}
          isChannelFavorited={isChannelFavorited}
          onToggleChannelFavorite={onToggleChannelFavorite}
          onPlayTdtChannel={onPlayTdtChannel}
          onOpenEpgModal={setSelectedEpgChannel}
          onTvFiltersOpenChange={setTvFiltersOpen}
          onTvFavOnlyChange={setTvFavOnly}
          onTvRegionChange={setTvRegion}
          onTdtCategoryChange={setTdtCategory}
          onEpgFilterChange={setEpgFilter}
        />
      )}

      {/* WORLD 4: YOUTUBE */}
      {(worldMode === 'youtube' || (!worldMode && activeSection === 'youtube')) && (
        <YouTubeWorldView
          lang={lang}
          debouncedQuery={debouncedYtQuery}
          loading={loadingYt}
          results={ytResults}
          onSelectTopic={(q) => {
            setYtQuery(q);
            setDebouncedYtQuery(q);
          }}
          onPlayVideo={onPlayYouTubeVideo}
          onAddToQueue={onAddToQueue}
        />
      )}

      <EpgChannelModal
        lang={lang}
        channel={selectedEpgChannel}
        epgClockMs={epgClockMs}
        loadingEpg={loadingEpg}
        getChannelLiveEpg={getChannelLiveEpg}
        onClose={() => setSelectedEpgChannel(null)}
        onPlayChannel={onPlayTdtChannel}
      />
    </div>
  );
};
