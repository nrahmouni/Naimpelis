/**
 * @module MediaCatalogHub
 * @description Orchestrator for RiffanTV catalog worlds (Cine, Fútbol, TV en Directo,
 * and YouTube) plus movie/series/Català/EPG detail & episode-picker modals.
 * Individual views and hooks live under `src/components/catalog/`.
 */
import React, { useCallback, useRef, useState } from 'react';
import type {
  AppLanguage,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  FavoriteChannelItem,
  MultiScreenSourceInput,
  Participant,
  RoomQueueItem,
  SpanishTdtChannel,
  SportsMatch,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { usePullToRefresh } from '../lib/viewTransition';
import { isSameCatalogItem } from '../utils/storage';
import { useAppStore, type PlaybackReturnContext } from '../store/useAppStore';
import {
  normalizeCatalogPillar,
  TV_FILTER_GROUPS,
  type CatalogPillar,
  type CatalogSection,
  type TvFilterGroup,
} from './catalog/catalogConstants';
import { CineWorldView } from './catalog/CineWorldView';
import { useVodCatalogState } from './catalog/useVodCatalogState';
import { useLiveTvAndSportsCatalog } from './catalog/useLiveTvAndSportsCatalog';
import { RiffanLoaderR } from './ui/RiffanIcons';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const CatalaEpisodePickerModal = lazyWithRetry(() =>
  import('./catalog/CatalaEpisodePickerModal').then((m) => ({ default: m.CatalaEpisodePickerModal }))
);
const LiveTvWorldView = lazyWithRetry(() =>
  import('./catalog/LiveTvWorldView').then((m) => ({ default: m.LiveTvWorldView }))
);
const EpgChannelModal = lazyWithRetry(() =>
  import('./catalog/EpgChannelModal').then((m) => ({ default: m.EpgChannelModal }))
);
const YouTubeWorldView = lazyWithRetry(() =>
  import('./catalog/YouTubeWorldView').then((m) => ({ default: m.YouTubeWorldView }))
);
const FootballWorldView = lazyWithRetry(() =>
  import('./catalog/FootballWorldView').then((m) => ({ default: m.FootballWorldView }))
);

export { normalizeCatalogPillar, TV_FILTER_GROUPS };
export type { CatalogSection, CatalogPillar, TvFilterGroup };

interface MediaCatalogHubProps {
  activeSection: CatalogSection;
  onChangeSection: (section: CatalogSection) => void;
  lang: AppLanguage;
  userName: string;
  activeVideoRawUrl: string;
  activeMultiUrls?: string[];
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
  onPlaySecondaryChannel?: (opts: MultiScreenSourceInput) => void;
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
  sessionMode?: 'solo' | 'party';
  roomId?: string;
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  lang,
  activeVideoRawUrl,
  activeMultiUrls = [],
  loadingItemId,
  watchlist,
  favoriteChannels,
  onToggleCatalogFavorite,
  onToggleChannelFavorite,
  onPlayMovie,
  onPlayCatalaEpisode,
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
  sessionMode = 'party',
  roomId,
}) => {
  const shareRoomId = sessionMode !== 'solo' && roomId ? roomId : undefined;
  const [internalWatchlistOnly, setInternalWatchlistOnly] = useState(false);
  const showWatchlistOnly =
    controlledWatchlistOnly !== undefined ? controlledWatchlistOnly : internalWatchlistOnly;
  const showWatchlistOnlyRef = useRef(showWatchlistOnly);
  showWatchlistOnlyRef.current = showWatchlistOnly;
  const setShowWatchlistOnly = useCallback(
    (valOrUpdater: boolean | ((prev: boolean) => boolean)) => {
      const nextVal =
        typeof valOrUpdater === 'function' ? valOrUpdater(showWatchlistOnlyRef.current) : valOrUpdater;
      if (nextVal === showWatchlistOnlyRef.current) return;
      if (controlledWatchlistOnly === undefined) {
        setInternalWatchlistOnly(nextVal);
      }
      onWatchlistOnlyChange?.(nextVal);
    },
    [controlledWatchlistOnly, onWatchlistOnlyChange]
  );

  const [internalCineTab, setInternalCineTab] = useState<'movies' | 'series'>('movies');
  const effectiveCineTab: 'movies' | 'series' = controlledCineTab ?? internalCineTab;
  const setEffectiveCineTab = useCallback(
    (tab: 'movies' | 'series') => {
      setInternalCineTab((prev) => (prev === tab ? prev : tab));
      onCineTabChange?.(tab);
    },
    [onCineTabChange]
  );

  const [internalCineCastellano, setInternalCineCastellano] = useState(true);
  const effectiveCineCastellano = controlledCineCastellano ?? internalCineCastellano;
  const setEffectiveCineCastellano = useCallback(
    (enabled: boolean) => {
      setInternalCineCastellano((prev) => (prev === enabled ? prev : enabled));
      onCineCastellanoChange?.(enabled);
    },
    [onCineCastellanoChange]
  );

  const [internalFutbolTab, setInternalFutbolTab] = useState<'matches' | 'channels'>('matches');
  const effectiveFutbolTab = controlledFutbolTab ?? internalFutbolTab;
  const setEffectiveFutbolTab = useCallback(
    (tab: 'matches' | 'channels') => {
      setInternalFutbolTab((prev) => (prev === tab ? prev : tab));
      onFutbolTabChange?.(tab);
    },
    [onFutbolTabChange]
  );

  const vod = useVodCatalogState({
    lang,
    worldMode,
    activeSection,
    showWatchlistOnly,
    effectiveCineTab,
    effectiveCineCastellano,
    externalSearchQuery,
  });

  const resetWatchlistOnly = useCallback(() => {
    setShowWatchlistOnly(false);
  }, [setShowWatchlistOnly]);

  const liveTv = useLiveTvAndSportsCatalog({
    lang,
    worldMode,
    activeSection,
    externalSearchQuery,
    favoriteChannels,
    onResetWatchlistOnly: resetWatchlistOnly,
  });

  const captureOriginContext = useCallback(
    (extra?: Partial<PlaybackReturnContext>) => {
      const store = useAppStore.getState();
      const prev = store.playbackReturnContext;
      store.setPlaybackReturnContext({
        world:
          store.activeWorld !== 'entry'
            ? store.activeWorld
            : worldMode || store.activeWorld,
        cineTab: effectiveCineTab,
        cineSpecialPortal: vod.cineSpecialPortal,
        futbolTab: effectiveFutbolTab,
        searchQuery: externalSearchQuery ?? '',
        homeSearchQuery: store.homeSearchQuery,
        homeSearchCategory: store.homeSearchCategory,
        scrollTopMain: prev?.scrollTopMain,
        scrollTopCatalog: prev?.scrollTopCatalog,
        ...extra,
      });
    },
    [worldMode, effectiveCineTab, vod.cineSpecialPortal, effectiveFutbolTab, externalSearchQuery]
  );

  const handleToggleBookmark = useCallback(
    (item: CatalogMovie, e: React.MouseEvent) => {
      e.stopPropagation();
      triggerHaptic('light');
      onToggleCatalogFavorite(item);
    },
    [onToggleCatalogFavorite]
  );

  const isBookmarked = useCallback(
    (item: CatalogMovie) => watchlist.some((x) => isSameCatalogItem(x, item)),
    [watchlist]
  );

  const handleDiscoveryGenresLoaded = useCallback(() => {}, []);

  const handleClearExternalSearch = useCallback(() => {
    onExternalSearchChange?.('');
  }, [onExternalSearchChange]);

  const handleResetMoviePage = useCallback(() => {
    vod.setMoviePage(1);
  }, [vod.setMoviePage]);
  const handleNextMoviePage = useCallback(() => {
    vod.setMoviePage((p) => p + 1);
  }, [vod.setMoviePage]);
  const handleResetSeriesPage = useCallback(() => {
    vod.setSeriesPage(1);
  }, [vod.setSeriesPage]);
  const handleNextSeriesPage = useCallback(() => {
    vod.setSeriesPage((p) => p + 1);
  }, [vod.setSeriesPage]);

  const handleOpenPreviewItem = useCallback(
    (item: CatalogMovie) => {
      const store = useAppStore.getState();
      const resolvedKind =
        item.mediaType === 'tv' ||
        (effectiveCineTab === 'series' && item.mediaType !== 'movie')
          ? 'tv'
          : 'movie';
      if (resolvedKind === 'tv') {
        const tmdbId = Number(
          item.tmdbId || String(item.id || '').replace(/[^\d]/g, '') || 0
        );
        if (tmdbId > 0) {
          store.setRequestedMovieModal(null);
          store.setRequestedSeriesModal({
            series: { ...item, tmdbId, mediaType: 'tv' },
            season: item.seasonNumber || 1,
          });
          return;
        }
      }
      store.setRequestedSeriesModal(null);
      store.setRequestedMovieModal(item);
    },
    [effectiveCineTab]
  );

  const handleOpenSeriesDetails = useCallback(
    (tmdbId: number, seasonNum: number, seed?: CatalogMovie) => {
      const store = useAppStore.getState();
      store.setRequestedMovieModal(null);
      store.setRequestedSeriesModal({
        series: seed
          ? { ...seed, tmdbId, mediaType: 'tv' }
          : {
              id: `tv-${tmdbId}`,
              tmdbId,
              mediaType: 'tv',
              title: '',
              poster: '',
              backdrop: '',
              year: '',
              rating: '',
              overview: '',
              languages: [],
            },
        season: seasonNum || 1,
      });
    },
    []
  );

  const activePillar = normalizeCatalogPillar(activeSection, showWatchlistOnly);

  const futbolPull = usePullToRefresh(async () => {
    await liveTv.fetchTdtCatalog();
  }, worldMode === 'futbol');

  const tvPull = usePullToRefresh(async () => {
    await Promise.all([liveTv.fetchTdtCatalog(), liveTv.fetchLiveEpg(true)]);
  }, worldMode === 'tv');

  return (
    <div
      className="@container w-full min-w-0 max-w-full space-y-4 pb-24 sm:pb-8"
      data-pillar={activePillar}
    >
      {vod.selectedCatalaSeries && (
        <React.Suspense fallback={null}>
          <CatalaEpisodePickerModal
            lang={lang}
            selectedSeries={vod.selectedCatalaSeries}
            loadingEpisodes={vod.loadingCatalaEpisodes}
            onClose={() => {
              vod.setSelectedCatalaSeries(null);
              useAppStore.getState().setRequestedCatalaModal(null);
            }}
            onSelectSeason={vod.openCatalaSeriesDetails}
            onPlayEpisode={(catSeries, catEp) => {
              captureOriginContext({
                catalaModal: {
                  series: catSeries,
                  season: catSeries.activeSeason,
                },
              });
              useAppStore.getState().setRequestedCatalaModal(null);
              onPlayCatalaEpisode(catSeries, catEp);
            }}
            onAddToQueue={onAddToQueue}
          />
        </React.Suspense>
      )}

      {/* WORLD 1: CINE */}
      {(worldMode === 'cine' || (!worldMode && activeSection === 'home')) && (
        <CineWorldView
          lang={lang}
          effectiveCineTab={effectiveCineTab}
          onChangeCineTab={setEffectiveCineTab}
          effectiveCineCastellano={effectiveCineCastellano}
          onChangeCineCastellano={setEffectiveCineCastellano}
          cineAudioOverride={vod.cineAudioOverride}
          onChangeCineAudioOverride={vod.setCineAudioOverride}
          onChangeSeriesLangMode={vod.setSeriesLangMode}
          cineSpecialPortal={vod.cineSpecialPortal}
          onChangeCineSpecialPortal={vod.setCineSpecialPortal}
          cineFiltersOpen={vod.cineFiltersOpen}
          onChangeCineFiltersOpen={vod.setCineFiltersOpen}
          externalSearchQuery={externalSearchQuery}
          homeQuery={vod.homeQuery}
          onClearExternalSearch={onExternalSearchChange ? handleClearExternalSearch : undefined}
          homeShowcaseMovies={vod.homeShowcaseMovies}
          homeShowcaseSeries={vod.homeShowcaseSeries}
          movies={vod.movies}
          seriesList={vod.seriesList}
          movieSort={vod.movieSort}
          onChangeMovieSort={vod.setMovieSort}
          movieGenre={vod.movieGenre}
          onChangeMovieGenre={vod.setMovieGenre}
          onResetMoviePage={handleResetMoviePage}
          onNextMoviePage={handleNextMoviePage}
          hasMoreMovies={vod.hasMoreMovies}
          loadingMovies={vod.loadingMovies}
          loadingMoreMovies={vod.loadingMoreMovies}
          seriesSort={vod.seriesSort}
          onChangeSeriesSort={vod.setSeriesSort}
          seriesGenre={vod.seriesGenre}
          onChangeSeriesGenre={vod.setSeriesGenre}
          onResetSeriesPage={handleResetSeriesPage}
          onNextSeriesPage={handleNextSeriesPage}
          hasMoreSeries={vod.hasMoreSeries}
          loadingSeries={vod.loadingSeries}
          loadingMoreSeries={vod.loadingMoreSeries}
          loadingHomeSearch={vod.loadingHomeSearch}
          homeMovieResults={vod.homeMovieResults}
          homeSeriesResults={vod.homeSeriesResults}
          catalaItems={vod.catalaItems}
          loadingCatala={vod.loadingCatala}
          heroSlideIndex={vod.heroSlideIndex}
          onChangeHeroSlideIndex={vod.setHeroSlideIndex}
          onHeroHoverChange={vod.setIsHeroHovered}
          homeGenreId={vod.homeGenreId}
          homeProvider={vod.homeProvider}
          homeSortBy={vod.homeSortBy}
          onDiscoveryGenresLoaded={handleDiscoveryGenresLoaded}
          isBookmarked={isBookmarked}
          onToggleBookmark={handleToggleBookmark}
          onOpenPreviewItem={handleOpenPreviewItem}
          onOpenSeriesDetails={handleOpenSeriesDetails}
          onOpenCatalaSeriesDetails={vod.openCatalaSeriesDetails}
          onPlayMovie={onPlayMovie}
          onPlayCustomUrl={onPlayCustomUrl}
          onOpenCloudBrowser={onOpenCloudBrowser}
          onSearchWithAi={onSearchWithAi}
          onOpenSurpriseMe={onOpenSurpriseMe}
          onPlayTdtChannel={onPlayTdtChannel}
        />
      )}

      {/* WORLD 2: FÚTBOL */}
      {(worldMode === 'futbol' || (!worldMode && activeSection === 'sports')) && (
        <React.Suspense
          fallback={
            <div className="py-12 flex items-center justify-center">
              <RiffanLoaderR size={36} />
            </div>
          }
        >
          <FootballWorldView
            lang={lang}
            shareRoomId={shareRoomId}
            pull={futbolPull}
            effectiveFutbolTab={effectiveFutbolTab}
            setEffectiveFutbolTab={setEffectiveFutbolTab}
            futbolFiltersOpen={liveTv.futbolFiltersOpen}
            setFutbolFiltersOpen={liveTv.setFutbolFiltersOpen}
            futbolLeagueFilter={liveTv.futbolLeagueFilter}
            setFutbolLeagueFilter={liveTv.setFutbolLeagueFilter}
            futbolLangFilter={liveTv.futbolLangFilter}
            setFutbolLangFilter={liveTv.setFutbolLangFilter}
            footballLiveBrand={liveTv.footballLiveBrand}
            setFootballLiveBrand={liveTv.setFootballLiveBrand}
            sportsSearch={liveTv.sportsSearch}
            setSportsSearch={liveTv.setSportsSearch}
            activeVideoRawUrl={activeVideoRawUrl}
            activeMultiUrls={activeMultiUrls}
            loadingItemId={loadingItemId}
            loadingTdt={liveTv.loadingTdt}
            footballSectionLiveChannels={liveTv.footballSectionLiveChannels}
            footballNetworkCounts={liveTv.footballNetworkCounts}
            isChannelFavorited={liveTv.isChannelFavorited}
            onToggleChannelFavorite={onToggleChannelFavorite}
            onPlaySportsMatch={onPlaySportsMatch}
            onPlaySecondaryChannel={onPlaySecondaryChannel}
            onPlayTdtChannel={onPlayTdtChannel}
          />
        </React.Suspense>
      )}

      {/* WORLD 3: TV EN DIRECTO */}
      {(worldMode === 'tv' || (!worldMode && activeSection === 'tdt')) && (
        <React.Suspense
          fallback={
            <div className="py-12 flex items-center justify-center">
              <RiffanLoaderR size={36} />
            </div>
          }
        >
          <LiveTvWorldView
            lang={lang}
            shareRoomId={shareRoomId}
            pull={tvPull}
            tdtChannels={liveTv.tdtChannels}
            filteredChannels={liveTv.filteredTdtChannels}
            loadingTdt={liveTv.loadingTdt}
            activeVideoRawUrl={activeVideoRawUrl}
            tdtCategory={liveTv.tdtCategory}
            tvRegion={liveTv.tvRegion}
            tvFavOnly={liveTv.tvFavOnly}
            epgFilter={liveTv.epgFilter}
            epgMadridClock={liveTv.epgMadridClock}
            tvFiltersOpen={liveTv.tvFiltersOpen}
            tvCategoryCounts={liveTv.tvCategoryCounts}
            getChannelLiveEpg={liveTv.getChannelLiveEpg}
            isChannelFavorited={liveTv.isChannelFavorited}
            onToggleChannelFavorite={onToggleChannelFavorite}
            onPlayTdtChannel={onPlayTdtChannel}
            onOpenEpgModal={liveTv.setSelectedEpgChannel}
            onTvFiltersOpenChange={liveTv.setTvFiltersOpen}
            onTvFavOnlyChange={liveTv.setTvFavOnly}
            onTvRegionChange={liveTv.setTvRegion}
            onTdtCategoryChange={liveTv.setTdtCategory}
            onEpgFilterChange={liveTv.setEpgFilter}
            adrarCountryFilter={liveTv.adrarCountryFilter}
            onAdrarCountryFilterChange={liveTv.setAdrarCountryFilter}
          />
        </React.Suspense>
      )}

      {/* WORLD 4: YOUTUBE */}
      {(worldMode === 'youtube' || (!worldMode && activeSection === 'youtube')) && (
        <React.Suspense
          fallback={
            <div className="py-12 flex items-center justify-center">
              <RiffanLoaderR size={36} />
            </div>
          }
        >
          <YouTubeWorldView
            lang={lang}
            debouncedQuery={vod.debouncedYtQuery}
            loading={vod.loadingYt}
            results={vod.ytResults}
            onSelectTopic={(q) => {
              vod.setYtQuery(q);
              vod.setDebouncedYtQuery(q);
            }}
            onPlayVideo={onPlayYouTubeVideo}
            onAddToQueue={onAddToQueue}
          />
        </React.Suspense>
      )}

      {liveTv.selectedEpgChannel && (
        <React.Suspense fallback={null}>
          <EpgChannelModal
            lang={lang}
            channel={liveTv.selectedEpgChannel}
            epgClockMs={liveTv.epgClockMs}
            loadingEpg={liveTv.loadingEpg}
            getChannelLiveEpg={liveTv.getChannelLiveEpg}
            onClose={() => {
              liveTv.setSelectedEpgChannel(null);
              useAppStore.getState().setRequestedEpgChannel(null);
            }}
            onPlayChannel={(ch, sIdx, hint) => {
              captureOriginContext({ epgChannel: ch });
              useAppStore.getState().setRequestedEpgChannel(null);
              onPlayTdtChannel(ch, sIdx, hint);
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
};
