/**
 * @module CineWorldView
 * @description World 1 (Cine) view — Flagship Movies & Series discovery with
 * SegmentedControl, ES/LAT/VOSE/EN/CAT language selector, 4K Ultra HD mode,
 * dual-scrim Cinema Hero Spotlight, unified search, and modular Filter sheet.
 */
import React from 'react';
import { motion } from 'motion/react';
import { Link2, Play, X } from 'lucide-react';
import type { AppLanguage, CatalaCatalogItem, CatalogMovie } from '../../types';
import type { CatalogGenreItem } from '../ExpandedDiscoverySection';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { SegmentedControl } from '../ui/DesignSystem';
import {
  RiffanMoviesIcon,
  RiffanSeriesIcon,
  RiffanSlidersIcon,
  RiffanSurpriseIcon,
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

const ExpandedDiscoverySection = React.lazy(() =>
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

  const openPosterItem = (item: CatalogMovie) => {
    triggerHaptic('light');
    onOpenPreviewItem(item);
  };

  const filteredBackLabel =
    currentSort === '4k'
      ? pickLang(lang, { es: 'Volver a Tendencias', ca: 'Tornar a Tendències', en: 'Back to Trending' })
      : activeGenreMeta
      ? pickLang(lang, activeGenreMeta)
      : activeSortMeta
      ? pickLang(lang, activeSortMeta)
      : pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* 1. MOVIES / SERIES SEGMENTED CONTROL & COMPACT CINEMA TOOLBAR */}
      <div className="space-y-3">
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

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              if (cineSpecialPortal === 'catala') {
                onChangeCineSpecialPortal('none');
                onChangeCineCastellano(false);
                onChangeCineAudioOverride('VOSE');
                onChangeSeriesLangMode('VOSE');
                return;
              }
              const next = !effectiveCineCastellano;
              onChangeCineCastellano(next);
              if (next) {
                onChangeCineAudioOverride('ES');
                onChangeSeriesLangMode('ES');
              } else {
                onChangeCineAudioOverride('VOSE');
                onChangeSeriesLangMode('VOSE');
              }
            }}
            className={`min-h-[44px] px-3.5 rounded-2xl text-xs font-bold border inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
              activeAudioCode === 'ES'
                ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_6px_16px_rgba(145,70,255,0.3)]'
                : 'bg-[#12131C] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <FlagBadgeSvg code={activeAudioFlag} className="w-4 h-2.5 shrink-0" />
            <span>{activeAudioCode}</span>
          </button>

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
            aria-label={pickLang(lang, {
              es: isSeriesTab ? 'Ver series en 4K Ultra HD' : 'Ver películas en 4K Ultra HD',
              ca: isSeriesTab ? 'Veure sèries en 4K Ultra HD' : 'Veure pel·lícules en 4K Ultra HD',
              en: isSeriesTab ? 'View 4K Ultra HD series' : 'View 4K Ultra HD movies',
            })}
            className={`group relative min-h-[44px] px-3.5 sm:px-4 rounded-2xl text-xs font-bold border inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all overflow-hidden ${
              (isSeriesTab ? seriesSort === '4k' : movieSort === '4k')
                ? 'btn-4k-active bg-gradient-to-r from-amber-500/25 via-purple-600/35 to-cyan-500/25 border-amber-400 text-white shadow-[0_0_24px_rgba(251,191,36,0.42)]'
                : 'btn-4k-animated text-zinc-100 hover:border-amber-400/80 hover:text-white'
            }`}
          >
            <span className="relative z-10 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-400 to-amber-500 text-black text-[10px] font-black tracking-wider uppercase">
              4K
            </span>
            <span className="relative z-10">
              {isSeriesTab
                ? pickLang(lang, { es: 'Series 4K UHD', ca: 'Sèries 4K UHD', en: '4K UHD Series' })
                : pickLang(lang, { es: 'Cine 4K UHD', ca: 'Cinema 4K UHD', en: '4K UHD Cinema' })}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeCineFiltersOpen(true);
            }}
            className={`group min-h-[44px] px-3.5 rounded-2xl text-xs font-bold border inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
              activeFilterCount > 0
                ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_6px_16px_rgba(145,70,255,0.3)]'
                : 'bg-[#12131C] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <RiffanSlidersIcon
              size={16}
              tone={activeFilterCount > 0 ? 'current' : 'brand'}
              animate="hover"
            />
            <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
            {activeFilterCount > 0 && (
              <span className="text-[11px] font-mono tabular-nums opacity-90">
                ({activeFilterCount})
              </span>
            )}
          </button>

          {onOpenSurpriseMe && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSurpriseMe();
              }}
              className="group min-h-[44px] px-3.5 rounded-2xl bg-[#12131C] hover:bg-[#9146FF]/20 border border-[#9146FF]/35 text-xs font-bold text-[#E9D5FF] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              <RiffanSurpriseIcon size={16} animate="hover" />
              <span>
                {pickLang(lang, { es: 'Sorpréndeme', ca: 'Sorprèn-me', en: 'Surprise me' })}
              </span>
            </button>
          )}
        </div>

        {/* Active Filter Dismissals */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {activeAudioCode !== 'ES' && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onChangeCineSpecialPortal('none');
                  onChangeCineCastellano(true);
                  onChangeCineAudioOverride('ES');
                  onChangeSeriesLangMode('ES');
                }}
                className="min-h-9 px-3 rounded-xl bg-[#9146FF] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#7C2AE8] transition-colors"
              >
                <FlagBadgeSvg code={activeAudioFlag} className="w-3.5 h-2.5 shrink-0" />
                <span>
                  {activeAudioCode === 'CAT' ? 'Català' : activeAudioCode === 'VOSE' ? 'VOSE' : 'EN'}
                </span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {currentSort !== 'trending' && activeSortMeta && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  if (isSeriesTab) {
                    onChangeSeriesSort('trending');
                    onResetSeriesPage();
                  } else {
                    onChangeMovieSort('trending');
                    onResetMoviePage();
                  }
                }}
                className="min-h-9 px-3 rounded-xl bg-[#9146FF] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#7C2AE8] transition-colors"
              >
                <span>{currentSort === '4k' ? '4K UHD' : pickLang(lang, activeSortMeta)}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {currentGenre !== '' && activeGenreMeta && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  if (isSeriesTab) {
                    onChangeSeriesGenre('');
                    onResetSeriesPage();
                  } else {
                    onChangeMovieGenre('');
                    onResetMoviePage();
                  }
                }}
                className="min-h-9 px-3 rounded-xl bg-[#9146FF] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#7C2AE8] transition-colors"
              >
                <span>{pickLang(lang, activeGenreMeta)}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Direct URL Launch */}
      {isUrlSearch && (
        <div className="p-4 rounded-2xl bg-[#11131B] border border-[#9146FF]/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-200">
            <Link2 className="w-4 h-4 text-[#BF94FF] shrink-0" />
            <span className="font-mono truncate max-w-[260px] sm:max-w-[420px]">
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
              className="min-h-11 px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
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
              className="min-h-11 px-4 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer"
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
                filterState={{
                  mediaType: isSeriesTab ? 'tv' : 'movie',
                  genreId: homeGenreId,
                  provider: homeProvider,
                  sortBy: homeSortBy,
                }}
                isBookmarked={isBookmarked}
                onToggleBookmark={(item) =>
                  onToggleBookmark(
                    item,
                    { stopPropagation: () => {} } as unknown as React.MouseEvent
                  )
                }
                onGenresLoaded={onDiscoveryGenresLoaded}
                onSelectItem={(item) => openPosterItem(item)}
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
