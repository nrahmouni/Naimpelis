/**
 * @module CineWorldView
 * @description World 1 (Cine) view — Flagship Movies & Series discovery with
 * SegmentedControl, ES/LAT/VOSE/EN/CAT language selector, 4K Ultra HD mode,
 * dual-scrim Cinema Hero Spotlight, unified search, and modular Filter sheet.
 */
import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Link2, Loader2, Play, Plus, Wand2, X } from 'lucide-react';
import type { AppLanguage, CatalaCatalogItem, CatalogMovie } from '../../types';
import type { CatalogGenreItem } from '../ExpandedDiscoverySection';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { SegmentedControl } from '../ui/DesignSystem';
import {
  RiffanChevronLeftIcon,
  RiffanChevronRightIcon,
  RiffanMoviesIcon,
  RiffanSeriesIcon,
  RiffanSlidersIcon,
  RiffanSurpriseIcon,
} from '../ui/RiffanIcons';
import { VirtualizedPosterGrid } from '../VirtualizedPosterGrid';
import { LatestReleasesSection } from '../LatestReleasesSection';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';
import { CinePosterCard } from './CinePosterCard';
import { CineFilterSheet } from './CineFilterSheet';
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
  const heroTouchStartXRef = useRef<number | null>(null);

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
  const activeHeroIdx = heroSlides.length > 0 ? heroSlideIndex % heroSlides.length : 0;
  const activeHeroSlide = heroSlides[activeHeroIdx] || null;

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
                : pickLang(lang, {
                    es: 'Cine 4K UHD',
                    ca: 'Cinema 4K UHD',
                    en: '4K UHD Cinema',
                  })}
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
                  {activeAudioCode === 'CAT'
                    ? 'Català'
                    : activeAudioCode === 'VOSE'
                    ? 'VOSE'
                    : 'EN'}
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
        <div className="space-y-6">
          {loadingHomeSearch && (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
            </div>
          )}

          {homeMovieResults.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display font-bold text-base text-white">
                {pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
                {homeMovieResults.map((item) => (
                  <CinePosterCard
                    key={`${item.id}-movie`}
                    item={item}
                    forcedKind="movie"
                    isBookmarked={isBookmarked(item)}
                    onToggleBookmark={onToggleBookmark}
                    onSelect={openPosterItem}
                  />
                ))}
              </div>
            </section>
          )}

          {homeSeriesResults.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display font-bold text-base text-white">
                {pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' })}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
                {homeSeriesResults.map((item) => (
                  <CinePosterCard
                    key={`${item.id}-tv`}
                    item={item}
                    forcedKind="tv"
                    isBookmarked={isBookmarked(item)}
                    onToggleBookmark={onToggleBookmark}
                    onSelect={openPosterItem}
                  />
                ))}
              </div>
            </section>
          )}

          {!loadingHomeSearch &&
            homeMovieResults.length === 0 &&
            homeSeriesResults.length === 0 && (
              <div className="py-10 px-4 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center space-y-3">
                <p className="text-sm font-semibold text-white">
                  {pickLang(lang, {
                    es: `Sin resultados para "${trimmedSearch}"`,
                    ca: `Sense resultats per a "${trimmedSearch}"`,
                    en: `No results for "${trimmedSearch}"`,
                  })}
                </p>
                {onSearchWithAi && (
                  <button
                    type="button"
                    onClick={() => onSearchWithAi(trimmedSearch, isSeriesTab ? 'tv' : 'all')}
                    className="min-h-11 px-5 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>
                      {pickLang(lang, {
                        es: 'Buscar en la web',
                        ca: 'Cercar al web',
                        en: 'Search web',
                      })}
                    </span>
                  </button>
                )}
              </div>
            )}
        </div>
      ) : cineSpecialPortal === 'catala' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onChangeCineSpecialPortal('none')}
              className="min-h-11 px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {pickLang(lang, { es: 'Volver a Cine', ca: 'Tornar a Cine', en: 'Back to Cinema' })}
              </span>
            </button>
            <span className="text-sm font-display font-bold text-white inline-flex items-center gap-2">
              <FlagBadgeSvg code="ca" className="w-4 h-2.5 shrink-0" />
              <span>Anime en Català</span>
            </span>
          </div>

          {loadingCatala ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
            </div>
          ) : (
            <VirtualizedPosterGrid
              items={catalaItems}
              variant="poster"
              getKey={(item) => item.id}
              renderItem={(item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenCatalaSeriesDetails(item, 1);
                  }}
                  className="group w-full text-left cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                    <PosterImage
                      src={item.poster}
                      alt={item.title}
                      aspect="poster"
                      fallbackTitle={item.title}
                    />
                  </div>
                  <div className="px-0.5 min-w-0">
                    <div className="font-display font-bold text-xs text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                      {item.episodeHint}
                    </div>
                  </div>
                </button>
              )}
            />
          )}
        </div>
      ) : (isMoviesTab && (movieGenre !== '' || movieSort !== 'trending')) ||
        (isSeriesTab && (seriesGenre !== '' || seriesSort !== 'trending')) ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onChangeMovieSort('trending');
                onChangeMovieGenre('');
                onChangeSeriesSort('trending');
                onChangeSeriesGenre('');
              }}
              className="min-h-11 px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {currentSort === '4k'
                  ? pickLang(lang, {
                      es: 'Volver a Tendencias',
                      ca: 'Tornar a Tendències',
                      en: 'Back to Trending',
                    })
                  : activeGenreMeta
                  ? pickLang(lang, activeGenreMeta)
                  : activeSortMeta
                  ? pickLang(lang, activeSortMeta)
                  : pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' })}
              </span>
            </button>
          </div>

          {currentSort === '4k' && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/12 via-purple-900/25 to-cyan-500/12 border border-amber-400/45 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-black text-sm shrink-0">
                  4K
                </div>
                <div>
                  <p className="font-display font-extrabold text-sm sm:text-base text-white">
                    {pickLang(lang, {
                      es: isSeriesTab ? 'Series en 4K Ultra HD' : 'Películas en 4K Ultra HD',
                      ca: isSeriesTab ? 'Sèries en 4K Ultra HD' : 'Pel·lícules en 4K Ultra HD',
                      en: isSeriesTab ? '4K Ultra HD Series' : '4K Ultra HD Movies',
                    })}
                  </p>
                  <p className="text-xs text-zinc-300">
                    {pickLang(lang, {
                      es: 'Masterización Ultra HD y alto rango dinámico HDR.',
                      ca: 'Masterització Ultra HD i alt rang dinàmic HDR.',
                      en: 'Ultra HD mastering with high dynamic range HDR.',
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(isSeriesTab ? loadingSeries : loadingMovies) ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
            </div>
          ) : (
            <div className="space-y-4">
              <VirtualizedPosterGrid
                items={isSeriesTab ? seriesList : movies}
                variant="poster"
                getKey={(item) => item.id}
                renderItem={(item) => (
                  <CinePosterCard
                    item={item}
                    forcedKind={isSeriesTab ? 'tv' : 'movie'}
                    force4kGlow={currentSort === '4k'}
                    isBookmarked={isBookmarked(item)}
                    onToggleBookmark={onToggleBookmark}
                    onSelect={openPosterItem}
                  />
                )}
              />
              {(isSeriesTab ? hasMoreSeries : hasMoreMovies) && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    disabled={isSeriesTab ? loadingMoreSeries : loadingMoreMovies}
                    onClick={() => (isSeriesTab ? onNextSeriesPage() : onNextMoviePage())}
                    className="min-h-12 px-6 rounded-2xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-xs font-bold text-white cursor-pointer"
                  >
                    {(isSeriesTab ? loadingMoreSeries : loadingMoreMovies)
                      ? pickLang(lang, { es: 'Cargando...', ca: 'Carregant...', en: 'Loading...' })
                      : pickLang(lang, { es: 'Cargar más', ca: 'Carregar més', en: 'Load more' })}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="space-y-7"
        >
          {/* FLAGSHIP CINEMA HERO SPOTLIGHT */}
          {activeHeroSlide && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onTouchStart={(e) => {
                heroTouchStartXRef.current = e.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (heroTouchStartXRef.current === null) return;
                const endX = e.changedTouches[0]?.clientX ?? heroTouchStartXRef.current;
                const dx = endX - heroTouchStartXRef.current;
                heroTouchStartXRef.current = null;
                if (Math.abs(dx) > 40 && heroSlides.length > 1) {
                  onChangeHeroSlideIndex((prev) =>
                    dx < 0
                      ? (prev + 1) % heroSlides.length
                      : (prev - 1 + heroSlides.length) % heroSlides.length
                  );
                }
              }}
              onMouseEnter={() => onHeroHoverChange(true)}
              onMouseLeave={() => onHeroHoverChange(false)}
              className="group relative w-full min-h-[250px] sm:min-h-[310px] aspect-[4/3] sm:aspect-[21/9] rounded-3xl overflow-hidden bg-[#101118] border border-white/[0.1] shadow-[0_22px_54px_rgba(0,0,0,0.6)]"
            >
              <img
                src={activeHeroSlide.backdrop || activeHeroSlide.poster}
                alt={activeHeroSlide.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center sm:group-hover:scale-[1.02] transition-transform duration-700"
              />
              {/* Dual multi-stop scrim guaranteeing crisp text legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0F] via-[#0B0B0F]/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0F]/85 via-[#0B0B0F]/35 to-transparent" />

              {/* Desktop prev/next spotlight arrows */}
              {heroSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Anterior"
                    onClick={() =>
                      onChangeHeroSlideIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
                    }
                    className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 hover:bg-[#9146FF] border border-white/15 items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <RiffanChevronLeftIcon size={18} tone="current" animate="none" />
                  </button>
                  <button
                    type="button"
                    aria-label="Siguiente"
                    onClick={() => onChangeHeroSlideIndex((prev) => (prev + 1) % heroSlides.length)}
                    className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 hover:bg-[#9146FF] border border-white/15 items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <RiffanChevronRightIcon size={18} tone="current" animate="none" />
                  </button>
                </>
              )}

              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-7 flex flex-col gap-3 max-w-2xl">
                <button
                  type="button"
                  onClick={() =>
                    openPosterItem({ ...activeHeroSlide, mediaType: isSeriesTab ? 'tv' : 'movie' })
                  }
                  className="text-left space-y-1.5 cursor-pointer focus:outline-none"
                >
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#D8B4FE]">
                    {isSeriesTab
                      ? pickLang(lang, { es: 'Serie destacada', ca: 'Sèrie destacada', en: 'Featured series' })
                      : pickLang(lang, { es: 'Estreno destacado', ca: 'Estrena destacada', en: 'Featured cinema' })}
                  </p>
                  <h3 className="font-display font-black text-2xl sm:text-3xl text-white leading-tight line-clamp-2 text-balance">
                    {activeHeroSlide.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-200 tabular-nums truncate">
                    {[
                      activeHeroSlide.year,
                      activeHeroSlide.rating ? `★ ${activeHeroSlide.rating}` : '',
                      ...(Array.isArray(activeHeroSlide.genres)
                        ? activeHeroSlide.genres.slice(0, 2)
                        : []),
                      activeHeroSlide.seasonsCount
                        ? `${activeHeroSlide.seasonsCount} ${pickLang(lang, {
                            es: activeHeroSlide.seasonsCount === 1 ? 'Temp.' : 'Temps.',
                            ca: activeHeroSlide.seasonsCount === 1 ? 'Temp.' : 'Temps.',
                            en: activeHeroSlide.seasonsCount === 1 ? 'Season' : 'Seasons',
                          })}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </button>

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        if (isSeriesTab && activeHeroSlide.tmdbId) {
                          onOpenSeriesDetails(activeHeroSlide.tmdbId, 1, activeHeroSlide);
                        } else {
                          onPlayMovie(
                            activeHeroSlide,
                            effectiveCineCastellano ? 'ES' : cineAudioOverride,
                            effectiveCineCastellano ? { forceSpanish: true } : undefined
                          );
                        }
                      }}
                      className="min-h-[44px] px-5 sm:px-6 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs sm:text-sm font-bold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all shadow-[0_8px_22px_rgba(145,70,255,0.45)]"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>
                        {isSeriesTab
                          ? pickLang(lang, {
                              es: 'Ver episodios',
                              ca: 'Veure episodis',
                              en: 'Episodes',
                            })
                          : pickLang(lang, {
                              es: 'Reproducir',
                              ca: 'Reproduir',
                              en: 'Play',
                            })}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) =>
                        onToggleBookmark(
                          { ...activeHeroSlide, mediaType: isSeriesTab ? 'tv' : 'movie' },
                          e
                        )
                      }
                      aria-label={pickLang(lang, {
                        es: 'Mi Lista',
                        ca: 'La meva llista',
                        en: 'My List',
                      })}
                      className={`min-h-[44px] min-w-[44px] px-3.5 rounded-2xl border inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-all ${
                        isBookmarked(activeHeroSlide)
                          ? 'bg-[#9146FF] border-[#9146FF] text-white'
                          : 'bg-black/55 hover:bg-white/15 border-white/20 text-white'
                      }`}
                    >
                      {isBookmarked(activeHeroSlide) ? (
                        <Check className="w-4 h-4 shrink-0" />
                      ) : (
                        <Plus className="w-4 h-4 shrink-0" />
                      )}
                      <span className="hidden sm:inline whitespace-nowrap">
                        {isBookmarked(activeHeroSlide)
                          ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                          : pickLang(lang, { es: 'Mi lista', ca: 'La meva llista', en: 'My list' })}
                      </span>
                    </button>
                  </div>

                  {heroSlides.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      {heroSlides.map((s, idx) => {
                        const active = idx === activeHeroIdx;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onChangeHeroSlideIndex(idx)}
                            aria-label={`Slide ${idx + 1}`}
                            className={`h-2 rounded-full transition-all cursor-pointer ${
                              active ? 'w-6 bg-[#9146FF]' : 'w-2 bg-white/35 hover:bg-white/60'
                            }`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

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
