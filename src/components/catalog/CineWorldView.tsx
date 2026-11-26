/**
 * @module CineWorldView
 * @description World 1 (Cine) view — Flagship Movies & Series discovery with
 * SegmentedControl, ES/LAT/VOSE/EN/CAT language selector, 4K Ultra HD mode,
 * dual-scrim Cinema Hero Spotlight, unified search, and modular Filter sheet.
 */
import React, { useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Link2, Play, X } from 'lucide-react';
import type { AppLanguage, CatalaCatalogItem, CatalogMovie } from '../../types';
import type { CatalogGenreItem } from '../ExpandedDiscoverySection';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { SegmentedControl } from '../ui/DesignSystem';
import {
  RiffanMoviesIcon,
  RiffanSeriesIcon,
  RiffanSlidersIcon,
} from '../ui/RiffanIcons';
import { LatestReleasesSection } from '../LatestReleasesSection';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';
import { CinePosterCard } from './CinePosterCard';
import { CineFilterSheet } from './CineFilterSheet';
import { CineHeroSpotlight } from './CineHeroSpotlight';
import {
  CineCatalaPortalView,
  CineFilteredGridView,
  CineUnifiedSearchResults,
} from './CineFilteredResultsView';
import {
  MOVIE_GENRES,
  MOVIE_SORT_OPTIONS,
  SERIES_GENRES,
  SERIES_SORT_OPTIONS,
} from './catalogConstants';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const ExpandedDiscoverySection = lazyWithRetry(() =>
  import('../ExpandedDiscoverySection').then((m) => ({ default: m.ExpandedDiscoverySection }))
);

export interface CineWorldViewProps {
  lang: AppLanguage;
  effectiveCineTab: 'movies' | 'series';
  onChangeCineTab: (tab: 'movies' | 'series') => void;
  effectiveCineCastellano: boolean;
  onChangeCineCastellano: (enabled: boolean) => void;
  cineAudioOverride: 'ES' | 'VOSE' | 'EN';
  onChangeCineAudioOverride: (code: 'ES' | 'VOSE' | 'EN') => void;
  onChangeSeriesLangMode: (code: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  cineSpecialPortal: 'none' | 'catala';
  onChangeCineSpecialPortal: (portal: 'none' | 'catala') => void;
  cineFiltersOpen: boolean;
  onChangeCineFiltersOpen: (open: boolean) => void;
  externalSearchQuery?: string;
  homeQuery: string;
  onClearExternalSearch?: () => void;
  homeShowcaseMovies: CatalogMovie[];
  homeShowcaseSeries: CatalogMovie[];
  movies: CatalogMovie[];
  seriesList: CatalogMovie[];
  movieSort: string;
  onChangeMovieSort: (sort: string) => void;
  movieGenre: string;
  onChangeMovieGenre: (genre: string) => void;
  onResetMoviePage: () => void;
  onNextMoviePage: () => void;
  hasMoreMovies: boolean;
  loadingMovies: boolean;
  loadingMoreMovies: boolean;
  seriesSort: string;
  onChangeSeriesSort: (sort: string) => void;
  seriesGenre: string;
  onChangeSeriesGenre: (genre: string) => void;
  onResetSeriesPage: () => void;
  onNextSeriesPage: () => void;
  hasMoreSeries: boolean;
  loadingSeries: boolean;
  loadingMoreSeries: boolean;
  loadingHomeSearch: boolean;
  homeMovieResults: CatalogMovie[];
  homeSeriesResults: CatalogMovie[];
  catalaItems: CatalaCatalogItem[];
  loadingCatala: boolean;
  heroSlideIndex: number;
  onChangeHeroSlideIndex: React.Dispatch<React.SetStateAction<number>>;
  onHeroHoverChange: (hovered: boolean) => void;
  homeGenreId: number | null;
  homeProvider: string;
  homeSortBy: 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';
  onDiscoveryGenresLoaded: (genres: CatalogGenreItem[]) => void;
  isBookmarked: (item: CatalogMovie) => boolean;
  onToggleBookmark: (item: CatalogMovie, e: React.MouseEvent) => void;
  onOpenPreviewItem: (item: CatalogMovie) => void;
  onOpenSeriesDetails: (tmdbId: number, seasonNum: number, seed?: CatalogMovie) => void;
  onOpenCatalaSeriesDetails: (item: CatalaCatalogItem, seasonNum?: number) => void;
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang: string,
    opts?: { forceSpanish?: boolean }
  ) => void;
  onPlayCustomUrl: (url: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onSearchWithAi?: (query: string, mediaType?: 'all' | 'movie' | 'tv') => void;
  onOpenSurpriseMe?: () => void;
}

export const CineWorldView: React.FC<CineWorldViewProps> = ({
  lang,
  effectiveCineTab,
  onChangeCineTab,
  effectiveCineCastellano,
  onChangeCineCastellano,
  cineAudioOverride,
  onChangeCineAudioOverride,
  onChangeSeriesLangMode,
  cineSpecialPortal,
  onChangeCineSpecialPortal,
  cineFiltersOpen,
  onChangeCineFiltersOpen,
  externalSearchQuery,
  homeQuery,
  onClearExternalSearch,
  homeShowcaseMovies,
  homeShowcaseSeries,
  movies,
  seriesList,
  movieSort,
  onChangeMovieSort,
  movieGenre,
  onChangeMovieGenre,
  onResetMoviePage,
  onNextMoviePage,
  hasMoreMovies,
  loadingMovies,
  loadingMoreMovies,
  seriesSort,
  onChangeSeriesSort,
  seriesGenre,
  onChangeSeriesGenre,
  onResetSeriesPage,
  onNextSeriesPage,
  hasMoreSeries,
  loadingSeries,
  loadingMoreSeries,
  loadingHomeSearch,
  homeMovieResults,
  homeSeriesResults,
  catalaItems,
  loadingCatala,
  heroSlideIndex,
  onChangeHeroSlideIndex,
  onHeroHoverChange,
  homeGenreId,
  homeProvider,
  homeSortBy,
  onDiscoveryGenresLoaded,
  isBookmarked,
  onToggleBookmark,
  onOpenPreviewItem,
  onOpenSeriesDetails,
  onOpenCatalaSeriesDetails,
  onPlayMovie,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onSearchWithAi,
  onOpenSurpriseMe,
}) => {
  const t = UI_COPY[lang];

  useBackInterceptor(
    cineSpecialPortal === 'catala',
    'cine-catala-portal',
    () => onChangeCineSpecialPortal('none'),
    { priority: 7 }
  );

  const isMoviesTab = effectiveCineTab === 'movies';
  const isSeriesTab = effectiveCineTab === 'series';
  const trimmedSearch = (externalSearchQuery ?? homeQuery).trim();
  const isUrlSearch = /^https?:\/\//i.test(trimmedSearch);
  const showUnifiedSearch = !isUrlSearch && trimmedSearch.length >= 2;

  const heroPool = isSeriesTab
    ? homeShowcaseSeries.length > 0
      ? homeShowcaseSeries
      : seriesList
    : homeShowcaseMovies.length > 0
    ? homeShowcaseMovies
    : movies;
  const heroSlides = heroPool.filter((m) => m.backdrop || m.poster).slice(0, 6);

  const currentSort = isSeriesTab ? seriesSort : movieSort;
  const currentGenre = isSeriesTab ? seriesGenre : movieGenre;
  const currentSortOptions = isSeriesTab ? SERIES_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
  const currentGenres = isSeriesTab ? SERIES_GENRES : MOVIE_GENRES;

  const activeAudioCode: 'ES' | 'EN' | 'CAT' | 'VOSE' =
    cineSpecialPortal === 'catala'
      ? 'CAT'
      : effectiveCineCastellano
      ? 'ES'
      : cineAudioOverride === 'EN'
      ? 'EN'
      : 'VOSE';
  const activeAudioFlag: FlagCode =
    activeAudioCode === 'ES'
      ? 'es'
      : activeAudioCode === 'EN'
      ? 'uk'
      : activeAudioCode === 'CAT'
      ? 'ca'
      : 'vose';

  const activeFilterCount =
    (activeAudioCode !== 'ES' ? 1 : 0) +
    (currentSort !== 'trending' ? 1 : 0) +
    (currentGenre !== '' ? 1 : 0);

  const activeSortMeta = currentSortOptions.find((o) => o.id === currentSort);
  const activeGenreMeta = currentGenres.find((g) => g.id === currentGenre);

  const openPosterItem = useCallback(
    (item: CatalogMovie) => {
      triggerHaptic('light');
      onOpenPreviewItem(item);
    },
    [onOpenPreviewItem]
  );

  const discoveryFilterState = useMemo(
    () => ({
      mediaType: (isSeriesTab ? 'tv' : 'movie') as 'tv' | 'movie',
      genreId: homeGenreId,
      provider: homeProvider,
      sortBy: homeSortBy,
    }),
    [isSeriesTab, homeGenreId, homeProvider, homeSortBy]
  );

  const handleDiscoveryToggleBookmark = useCallback(
    (item: CatalogMovie) =>
      onToggleBookmark(
        item,
        { stopPropagation: () => {} } as unknown as React.MouseEvent
      ),
    [onToggleBookmark]
  );

  const filteredBackLabel =
    currentSort === '4k'
      ? pickLang(lang, { es: 'Volver a Tendencias', ca: 'Tornar a Tendències', en: 'Back to Trending' })
      : activeGenreMeta
      ? pickLang(lang, activeGenreMeta)
      : activeSortMeta
      ? pickLang(lang, activeSortMeta)
      : pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' });

  const hasIntraCineState =
    cineSpecialPortal === 'catala' ||
    movieGenre !== '' ||
    movieSort !== 'trending' ||
    seriesGenre !== '' ||
    seriesSort !== 'trending';

  useBackInterceptor(
    hasIntraCineState,
    'cine-intra-filters',
    () => {
      if (cineSpecialPortal === 'catala') {
        onChangeCineSpecialPortal('none');
        return true;
      }
      if (isSeriesTab && (seriesGenre !== '' || seriesSort !== 'trending')) {
        onChangeSeriesGenre('');
        onChangeSeriesSort('trending');
        onResetSeriesPage();
        return true;
      }
      if (!isSeriesTab && (movieGenre !== '' || movieSort !== 'trending')) {
        onChangeMovieGenre('');
        onChangeMovieSort('trending');
        onResetMoviePage();
        return true;
      }
      if (seriesGenre !== '' || seriesSort !== 'trending') {
        onChangeSeriesGenre('');
        onChangeSeriesSort('trending');
        onResetSeriesPage();
        return true;
      }
      if (movieGenre !== '' || movieSort !== 'trending') {
        onChangeMovieGenre('');
        onChangeMovieSort('trending');
        onResetMoviePage();
        return true;
      }
      return false;
    },
    { priority: 5 }
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* 1. MOVIES / SERIES SEGMENTED CONTROL & CALM GLASS TOOLBAR */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            <SegmentedControl
              layoutId="cine-main-tabs"
              value={effectiveCineTab}
              onChange={(nextTab) => {
                triggerHaptic('light');
                onChangeCineSpecialPortal('none');
                onChangeCineTab(nextTab);
              }}
              options={[
                {
                  id: 'movies',
                  label: pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' }),
                  icon: (
                    <RiffanMoviesIcon
                      size={17}
                      tone={isMoviesTab ? 'current' : 'brand'}
                      animate="hover"
                    />
                  ),
                },
                {
                  id: 'series',
                  label: pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' }),
                  icon: (
                    <RiffanSeriesIcon
                      size={17}
                      tone={isSeriesTab ? 'current' : 'brand'}
                      animate="hover"
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                if (isSeriesTab) {
                  const next = seriesSort === '4k' ? 'trending' : '4k';
                  onChangeSeriesSort(next);
                  onResetSeriesPage();
                  if (next === '4k') onChangeSeriesGenre('');
                } else {
                  const next = movieSort === '4k' ? 'trending' : '4k';
                  onChangeMovieSort(next);
                  onResetMoviePage();
                  if (next === '4k') onChangeMovieGenre('');
                }
              }}
              aria-pressed={isSeriesTab ? seriesSort === '4k' : movieSort === '4k'}
              aria-label={pickLang(lang, {
                es: isSeriesTab ? 'Ver series en 4K Ultra HD' : 'Ver películas en 4K Ultra HD',
                ca: isSeriesTab ? 'Veure sèries en 4K Ultra HD' : 'Veure pel·lícules en 4K Ultra HD',
                en: isSeriesTab ? 'View 4K Ultra HD series' : 'View 4K Ultra HD movies',
              })}
              className={`min-h-12 px-4 rounded-2xl text-xs font-bold border inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                (isSeriesTab ? seriesSort === '4k' : movieSort === '4k')
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_20px_rgba(124,58,237,0.38)]'
                  : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
              }`}
            >
              <span>4K UHD</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeCineFiltersOpen(true);
              }}
              className={`min-h-12 px-4 rounded-2xl text-xs font-bold border inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                activeFilterCount > 0
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_20px_rgba(124,58,237,0.38)]'
                  : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
              }`}
            >
              <RiffanSlidersIcon
                size={15}
                tone={activeFilterCount > 0 ? 'current' : 'brand'}
                animate="hover"
              />
              <FlagBadgeSvg code={activeAudioFlag} className="w-3.5 h-2.5 shrink-0" />
              <span>
                {pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}
              </span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white font-mono text-[11px] tabular-nums leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Single calm active-filter summary & reset */}
        {activeFilterCount > 0 && (
          <div className="flex items-center justify-between gap-2 px-1 text-xs">
            <span className="text-zinc-400 truncate">
              {[
                activeAudioCode !== 'ES'
                  ? activeAudioCode === 'CAT'
                    ? 'Català'
                    : activeAudioCode
                  : '',
                currentSort !== 'trending' && activeSortMeta
                  ? currentSort === '4k'
                    ? '4K UHD'
                    : pickLang(lang, activeSortMeta)
                  : '',
                currentGenre !== '' && activeGenreMeta ? pickLang(lang, activeGenreMeta) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeCineSpecialPortal('none');
                onChangeCineCastellano(true);
                onChangeCineAudioOverride('ES');
                onChangeSeriesLangMode('ES');
                onChangeMovieSort('trending');
                onChangeMovieGenre('');
                onResetMoviePage();
                onChangeSeriesSort('trending');
                onChangeSeriesGenre('');
                onResetSeriesPage();
              }}
              className="min-h-9 px-2.5 rounded-xl text-xs font-semibold text-[#C4A7FF] hover:text-white inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}</span>
            </button>
          </div>
        )}
      </div>

      {/* Direct URL Launch */}
      {isUrlSearch && (
        <div className="p-4 rounded-2xl bg-[#0D0D12] border border-[#7C3AED]/45 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-200">
            <Link2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
            <span className="font-mono break-all">
              {trimmedSearch}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                onPlayCustomUrl(trimmedSearch);
                onClearExternalSearch?.();
              }}
              className="min-h-11 px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onOpenCloudBrowser(trimmedSearch);
                onClearExternalSearch?.();
              }}
              className="min-h-11 px-4 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer active:scale-95 transition-all"
            >
              {t.openWebBtn}
            </button>
          </div>
        </div>
      )}

      {/* Search / Catala / Filtered Grid / Editorial Home View */}
      {showUnifiedSearch ? (
        <CineUnifiedSearchResults
          lang={lang}
          trimmedSearch={trimmedSearch}
          isSeriesTab={isSeriesTab}
          loadingHomeSearch={loadingHomeSearch}
          homeMovieResults={homeMovieResults}
          homeSeriesResults={homeSeriesResults}
          isBookmarked={isBookmarked}
          onToggleBookmark={onToggleBookmark}
          onOpenPosterItem={openPosterItem}
          onSwitchTab={(tab) => {
            onChangeCineSpecialPortal('none');
            onChangeCineTab(tab);
          }}
          onSearchWithAi={onSearchWithAi}
        />
      ) : cineSpecialPortal === 'catala' ? (
        <CineCatalaPortalView
          lang={lang}
          catalaItems={catalaItems}
          loadingCatala={loadingCatala}
          onExitPortal={() => onChangeCineSpecialPortal('none')}
          onOpenCatalaSeriesDetails={onOpenCatalaSeriesDetails}
        />
      ) : (isMoviesTab && (movieGenre !== '' || movieSort !== 'trending')) ||
        (isSeriesTab && (seriesGenre !== '' || seriesSort !== 'trending')) ? (
        <CineFilteredGridView
          lang={lang}
          isSeriesTab={isSeriesTab}
          currentSort={currentSort}
          backLabel={filteredBackLabel}
          items={isSeriesTab ? seriesList : movies}
          loading={isSeriesTab ? loadingSeries : loadingMovies}
          hasMore={isSeriesTab ? hasMoreSeries : hasMoreMovies}
          loadingMore={isSeriesTab ? loadingMoreSeries : loadingMoreMovies}
          isBookmarked={isBookmarked}
          onToggleBookmark={onToggleBookmark}
          onOpenPosterItem={openPosterItem}
          onNextPage={() => (isSeriesTab ? onNextSeriesPage() : onNextMoviePage())}
          onClearFilters={() => {
            onChangeMovieSort('trending');
            onChangeMovieGenre('');
            onChangeSeriesSort('trending');
            onChangeSeriesGenre('');
          }}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="space-y-7"
        >
          <CineHeroSpotlight
            lang={lang}
            isSeriesTab={isSeriesTab}
            heroSlides={heroSlides}
            heroSlideIndex={heroSlideIndex}
            effectiveCineCastellano={effectiveCineCastellano}
            cineAudioOverride={cineAudioOverride}
            onChangeHeroSlideIndex={onChangeHeroSlideIndex}
            onHeroHoverChange={onHeroHoverChange}
            isBookmarked={isBookmarked}
            onToggleBookmark={onToggleBookmark}
            onOpenPosterItem={openPosterItem}
            onOpenSeriesDetails={onOpenSeriesDetails}
            onPlayMovie={onPlayMovie}
          />

          {/* TRENDING RAIL */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="space-y-3"
          >
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
                {pickLang(lang, {
                  es: isSeriesTab ? 'Series en tendencia' : 'Películas en tendencia',
                  ca: isSeriesTab ? 'Sèries en tendència' : 'Pel·lícules en tendència',
                  en: isSeriesTab ? 'Trending series' : 'Trending movies',
                })}
              </h3>
              <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">
                {(isSeriesTab ? seriesList : movies).slice(0, 14).length}{' '}
                {pickLang(lang, { es: 'títulos', ca: 'títols', en: 'titles' })}
              </span>
            </div>
            <div className="scroll-snap-x flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
              {(isSeriesTab ? seriesList : movies).slice(0, 14).map((item) => (
                <CinePosterCard
                  key={item.id}
                  item={item}
                  forcedKind={isSeriesTab ? 'tv' : 'movie'}
                  isBookmarked={isBookmarked(item)}
                  onToggleBookmark={onToggleBookmark}
                  onSelect={openPosterItem}
                  className="scroll-snap-item w-[136px] sm:w-[162px] shrink-0"
                />
              ))}
            </div>
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
          >
            <LatestReleasesSection
              lang={lang}
              mediaTypeFilter={isSeriesTab ? 'tv' : 'movie'}
              isBookmarked={isBookmarked}
              onToggleBookmark={onToggleBookmark}
              onSelectMovie={(m) => openPosterItem({ ...m, mediaType: 'movie' })}
              onSelectSeries={(s, sn) =>
                s.tmdbId
                  ? onOpenSeriesDetails(s.tmdbId, sn, s)
                  : openPosterItem({ ...s, mediaType: 'tv' })
              }
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
            <React.Suspense fallback={null}>
              <ExpandedDiscoverySection
                lang={lang}
                filterState={discoveryFilterState}
                isBookmarked={isBookmarked}
                onToggleBookmark={handleDiscoveryToggleBookmark}
                onGenresLoaded={onDiscoveryGenresLoaded}
                onSelectItem={openPosterItem}
              />
            </React.Suspense>
          </motion.div>
        </motion.div>
      )}

      <CineFilterSheet
        lang={lang}
        isOpen={cineFiltersOpen}
        onClose={() => onChangeCineFiltersOpen(false)}
        isSeriesTab={isSeriesTab}
        effectiveCineCastellano={effectiveCineCastellano}
        cineAudioOverride={cineAudioOverride}
        cineSpecialPortal={cineSpecialPortal}
        currentSort={currentSort}
        currentGenre={currentGenre}
        onChangeCineCastellano={onChangeCineCastellano}
        onChangeCineAudioOverride={onChangeCineAudioOverride}
        onChangeSeriesLangMode={onChangeSeriesLangMode}
        onChangeCineSpecialPortal={onChangeCineSpecialPortal}
        onChangeMovieSort={onChangeMovieSort}
        onResetMoviePage={onResetMoviePage}
        onChangeMovieGenre={onChangeMovieGenre}
        onChangeSeriesSort={onChangeSeriesSort}
        onResetSeriesPage={onResetSeriesPage}
        onChangeSeriesGenre={onChangeSeriesGenre}
      />
    </div>
  );
};
