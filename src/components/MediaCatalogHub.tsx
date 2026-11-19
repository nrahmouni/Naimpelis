/**
 * @module MediaCatalogHub
 * @description Orchestrator for RiffanTV catalog worlds (Cine, Fútbol, TV en Directo,
 * and YouTube) plus movie/series/Català/EPG detail & episode-picker modals.
 * Individual views and hooks live under `src/components/catalog/`.
 */
import React, { useCallback, useState } from 'react';
import type {
  AppLanguage,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  FavoriteChannelItem,
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
import { useAppStore } from '../store/useAppStore';
import { MediaDetailsModal } from './MediaDetailsModal';
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
import { FootballWorldView } from './catalog/FootballWorldView';
import { useVodCatalogState } from './catalog/useVodCatalogState';
import { useLiveTvAndSportsCatalog } from './catalog/useLiveTvAndSportsCatalog';

export { normalizeCatalogPillar, TV_FILTER_GROUPS };
export type { CatalogSection, CatalogPillar, TvFilterGroup };

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
  sessionMode?: 'solo' | 'party';
  roomId?: string;
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
  sessionMode = 'party',
  roomId,
}) => {
  const shareRoomId = sessionMode !== 'solo' && roomId ? roomId : undefined;
  const [internalWatchlistOnly, setInternalWatchlistOnly] = useState(false);
  const showWatchlistOnly =
    controlledWatchlistOnly !== undefined ? controlledWatchlistOnly : internalWatchlistOnly;
  const setShowWatchlistOnly = useCallback(
    (valOrUpdater: boolean | ((prev: boolean) => boolean)) => {
      const nextVal =
        typeof valOrUpdater === 'function' ? valOrUpdater(showWatchlistOnly) : valOrUpdater;
      if (controlledWatchlistOnly === undefined) {
        setInternalWatchlistOnly(nextVal);
      }
      onWatchlistOnlyChange?.(nextVal);
    },
    [controlledWatchlistOnly, showWatchlistOnly, onWatchlistOnlyChange]
  );

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
    worldMode,
    activeSection,
    externalSearchQuery,
    favoriteChannels,
    onResetWatchlistOnly: resetWatchlistOnly,
  });

  const handleToggleBookmark = (item: CatalogMovie, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    onToggleCatalogFavorite(item);
  };

  const isBookmarked = (item: CatalogMovie) =>
    watchlist.some((x) => isSameCatalogItem(x, item));

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
      <MediaDetailsModal
        item={vod.previewItem}
        lang={lang}
        shareRoomId={shareRoomId}
        defaultAudioLang={
          effectiveCineCastellano
            ? 'ES'
            : vod.cineAudioOverride === 'EN'
            ? 'EN'
            : vod.seriesLangMode === 'EN'
            ? 'EN'
            : 'VOSE'
        }
        isBookmarked={vod.previewItem ? isBookmarked(vod.previewItem) : false}
        onClose={() => {
          vod.setPreviewItem(null);
          useAppStore.getState().setRequestedMovieModal(null);
        }}
        onPlayMovie={(m, pLang, opts) => {
          onExternalSearchChange?.('');
          onPlayMovie(m, pLang, opts);
        }}
        onOpenSeriesEpisodes={(tmdbId, forceSpanish) => {
          const seed = vod.previewItem || undefined;
          vod.setPreviewItem(null);
          useAppStore.getState().setRequestedMovieModal(null);
          onExternalSearchChange?.('');
          vod.openSeriesDetails(tmdbId, seed?.seasonNumber || 1, seed, Boolean(forceSpanish));
        }}
        onToggleBookmark={(m) => onToggleCatalogFavorite(m)}
        onAddToQueue={onAddToQueue}
        onSelectSimilar={(sim) => vod.setPreviewItem(sim)}
      />

      <CatalaEpisodePickerModal
        lang={lang}
        selectedSeries={vod.selectedCatalaSeries}
        loadingEpisodes={vod.loadingCatalaEpisodes}
        onClose={() => vod.setSelectedCatalaSeries(null)}
        onSelectSeason={vod.openCatalaSeriesDetails}
        onPlayEpisode={onPlayCatalaEpisode}
        onAddToQueue={onAddToQueue}
      />

      <SeriesEpisodePickerModal
        lang={lang}
        selectedSeries={vod.selectedSeries}
        highlightedEpisodeNumber={vod.highlightedEpisodeNumber}
        shareRoomId={shareRoomId}
        seriesModalLang={vod.seriesModalLang}
        forceSpanishSeriesActive={vod.forceSpanishSeriesActive}
        loadingSeriesDetails={vod.loadingSeriesDetails}
        probingSeriesLangs={vod.probingSeriesLangs}
        loadingItemId={loadingItemId}
        watchHistory={watchHistory}
        isBookmarked={isBookmarked}
        onClose={() => {
          vod.setSelectedSeries(null);
          vod.setHighlightedEpisodeNumber(null);
          useAppStore.getState().setRequestedSeriesModal(null);
        }}
        onSeriesModalLangChange={vod.setSeriesModalLang}
        onOpenSeriesDetails={vod.openSeriesDetails}
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
          cineAudioOverride={vod.cineAudioOverride}
          onChangeCineAudioOverride={vod.setCineAudioOverride}
          onChangeSeriesLangMode={vod.setSeriesLangMode}
          cineSpecialPortal={vod.cineSpecialPortal}
          onChangeCineSpecialPortal={vod.setCineSpecialPortal}
          cineFiltersOpen={vod.cineFiltersOpen}
          onChangeCineFiltersOpen={vod.setCineFiltersOpen}
          externalSearchQuery={externalSearchQuery}
          homeQuery={vod.homeQuery}
          onClearExternalSearch={onExternalSearchChange ? () => onExternalSearchChange('') : undefined}
          homeShowcaseMovies={vod.homeShowcaseMovies}
          homeShowcaseSeries={vod.homeShowcaseSeries}
          movies={vod.movies}
          seriesList={vod.seriesList}
          movieSort={vod.movieSort}
          onChangeMovieSort={vod.setMovieSort}
          movieGenre={vod.movieGenre}
          onChangeMovieGenre={vod.setMovieGenre}
          onResetMoviePage={() => vod.setMoviePage(1)}
          onNextMoviePage={() => vod.setMoviePage((p) => p + 1)}
          hasMoreMovies={vod.hasMoreMovies}
          loadingMovies={vod.loadingMovies}
          loadingMoreMovies={vod.loadingMoreMovies}
          seriesSort={vod.seriesSort}
          onChangeSeriesSort={vod.setSeriesSort}
          seriesGenre={vod.seriesGenre}
          onChangeSeriesGenre={vod.setSeriesGenre}
          onResetSeriesPage={() => vod.setSeriesPage(1)}
          onNextSeriesPage={() => vod.setSeriesPage((p) => p + 1)}
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
          onDiscoveryGenresLoaded={() => {}}
          isBookmarked={isBookmarked}
          onToggleBookmark={handleToggleBookmark}
          onOpenPreviewItem={vod.setPreviewItem}
          onOpenSeriesDetails={(tmdbId, seasonNum, seed) =>
            vod.openSeriesDetails(tmdbId, seasonNum, seed)
          }
          onOpenCatalaSeriesDetails={vod.openCatalaSeriesDetails}
          onPlayMovie={onPlayMovie}
          onPlayCustomUrl={onPlayCustomUrl}
          onOpenCloudBrowser={onOpenCloudBrowser}
          onSearchWithAi={onSearchWithAi}
          onOpenSurpriseMe={onOpenSurpriseMe}
        />
      )}

      {/* WORLD 2: FÚTBOL */}
      {(worldMode === 'futbol' || (!worldMode && activeSection === 'sports')) && (
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
      )}

      {/* WORLD 3: TV EN DIRECTO */}
      {(worldMode === 'tv' || (!worldMode && activeSection === 'tdt')) && (
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
      )}

      {/* WORLD 4: YOUTUBE */}
      {(worldMode === 'youtube' || (!worldMode && activeSection === 'youtube')) && (
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
      )}

      <EpgChannelModal
        lang={lang}
        channel={liveTv.selectedEpgChannel}
        epgClockMs={liveTv.epgClockMs}
        loadingEpg={liveTv.loadingEpg}
        getChannelLiveEpg={liveTv.getChannelLiveEpg}
        onClose={() => liveTv.setSelectedEpgChannel(null)}
        onPlayChannel={onPlayTdtChannel}
      />
    </div>
  );
};
