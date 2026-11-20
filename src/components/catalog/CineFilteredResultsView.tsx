import React from 'react';
import { ArrowLeft, ArrowRightLeft, Loader2, Wand2 } from 'lucide-react';
import type { AppLanguage, CatalaCatalogItem, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { SkeletonPosterGrid } from '../ui/DesignSystem';
import { VirtualizedPosterGrid } from '../VirtualizedPosterGrid';
import { CinePosterCard } from './CinePosterCard';

interface CineUnifiedSearchResultsProps {
  lang: AppLanguage;
  trimmedSearch: string;
  isSeriesTab: boolean;
  loadingHomeSearch: boolean;
  homeMovieResults: CatalogMovie[];
  homeSeriesResults: CatalogMovie[];
  isBookmarked: (item: CatalogMovie) => boolean;
  onToggleBookmark: (item: CatalogMovie, e: React.MouseEvent) => void;
  onOpenPosterItem: (item: CatalogMovie) => void;
  onSwitchTab?: (tab: 'movies' | 'series') => void;
  onSearchWithAi?: (query: string, mediaType?: 'all' | 'movie' | 'tv') => void;
}

export const CineUnifiedSearchResults: React.FC<CineUnifiedSearchResultsProps> = ({
  lang,
  trimmedSearch,
  isSeriesTab,
  loadingHomeSearch,
  homeMovieResults,
  homeSeriesResults,
  isBookmarked,
  onToggleBookmark,
  onOpenPosterItem,
  onSwitchTab,
  onSearchWithAi,
}) => {
  const activeResults = isSeriesTab ? homeSeriesResults : homeMovieResults;
  const otherResults = isSeriesTab ? homeMovieResults : homeSeriesResults;
  const targetSwitchTab: 'movies' | 'series' = isSeriesTab ? 'movies' : 'series';

  return (
    <div className="space-y-6">
      {loadingHomeSearch && (
        <div className="space-y-4">
          <div className="px-4 py-2.5 rounded-2xl bg-[#7C3AED]/15 border border-[#7C3AED]/35 flex items-center gap-2.5 text-xs font-semibold text-[#E9D5FF]">
            <Loader2 className="w-4 h-4 animate-spin text-[#A78BFA] shrink-0" />
            <span>
              {pickLang(lang, {
                es: `Buscando «${trimmedSearch}» en ${isSeriesTab ? 'Series' : 'Películas'}...`,
                ca: `Cercant «${trimmedSearch}» a ${isSeriesTab ? 'Sèries' : 'Pel·lícules'}...`,
                en: `Searching "${trimmedSearch}" in ${isSeriesTab ? 'Series' : 'Movies'}...`,
              })}
            </span>
          </div>
          {activeResults.length === 0 && <SkeletonPosterGrid count={8} />}
        </div>
      )}

      {activeResults.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-base text-white">
              {isSeriesTab
                ? pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' })
                : pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}
              <span className="ml-2 text-xs font-mono text-zinc-400 tabular-nums">
                ({activeResults.length})
              </span>
            </h3>

            {otherResults.length > 0 && onSwitchTab && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSwitchTab(targetSwitchTab);
                }}
                className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-[#D8B4FE] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isSeriesTab
                    ? pickLang(lang, {
                        es: `Ver ${otherResults.length} películas coincidentes`,
                        ca: `Veure ${otherResults.length} pel·lícules coincidents`,
                        en: `View ${otherResults.length} matching movies`,
                      })
                    : pickLang(lang, {
                        es: `Ver ${otherResults.length} series coincidentes`,
                        ca: `Veure ${otherResults.length} sèries coincidents`,
                        en: `View ${otherResults.length} matching series`,
                      })}
                </span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            {activeResults.map((item) => (
              <CinePosterCard
                key={`${item.id}-${isSeriesTab ? 'tv' : 'movie'}`}
                item={item}
                forcedKind={isSeriesTab ? 'tv' : 'movie'}
                isBookmarked={isBookmarked(item)}
                onToggleBookmark={onToggleBookmark}
                onSelect={onOpenPosterItem}
              />
            ))}
          </div>
        </section>
      )}

      {!loadingHomeSearch && activeResults.length === 0 && (
        <div className="py-10 px-4 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-center space-y-3">
          <p className="text-sm font-semibold text-white">
            {isSeriesTab
              ? pickLang(lang, {
                  es: `Sin series directas para "${trimmedSearch}"`,
                  ca: `Sense sèries directes per a "${trimmedSearch}"`,
                  en: `No series found for "${trimmedSearch}"`,
                })
              : pickLang(lang, {
                  es: `Sin películas directas para "${trimmedSearch}"`,
                  ca: `Sense pel·lícules directes per a "${trimmedSearch}"`,
                  en: `No movies found for "${trimmedSearch}"`,
                })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {otherResults.length > 0 && onSwitchTab && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSwitchTab(targetSwitchTab);
                }}
                className="min-h-11 px-4 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <ArrowRightLeft className="w-4 h-4 text-[#A78BFA]" />
                <span>
                  {isSeriesTab
                    ? pickLang(lang, {
                        es: `Ver en Películas (${otherResults.length})`,
                        ca: `Veure a Pel·lícules (${otherResults.length})`,
                        en: `View in Movies (${otherResults.length})`,
                      })
                    : pickLang(lang, {
                        es: `Ver en Series (${otherResults.length})`,
                        ca: `Veure a Sèries (${otherResults.length})`,
                        en: `View in Series (${otherResults.length})`,
                      })}
                </span>
              </button>
            )}
            {onSearchWithAi && (
              <button
                type="button"
                onClick={() => onSearchWithAi(trimmedSearch, isSeriesTab ? 'tv' : 'movie')}
                className="min-h-11 px-5 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <Wand2 className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Buscar en la web con IA',
                    ca: 'Cercar al web amb IA',
                    en: 'Search web with AI',
                  })}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface CineCatalaPortalViewProps {
  lang: AppLanguage;
  catalaItems: CatalaCatalogItem[];
  loadingCatala: boolean;
  onExitPortal: () => void;
  onOpenCatalaSeriesDetails: (item: CatalaCatalogItem, seasonNum?: number) => void;
}

export const CineCatalaPortalView: React.FC<CineCatalaPortalViewProps> = ({
  lang,
  catalaItems,
  loadingCatala,
  onExitPortal,
  onOpenCatalaSeriesDetails,
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onExitPortal}
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
      <div className="space-y-4">
        <div className="px-4 py-2.5 rounded-2xl bg-[#7C3AED]/15 border border-[#7C3AED]/35 flex items-center gap-2.5 text-xs font-semibold text-[#E9D5FF]">
          <Loader2 className="w-4 h-4 animate-spin text-[#A78BFA] shrink-0" />
          <span>
            {pickLang(lang, {
              es: 'Cargando catálogo en Català...',
              ca: 'Carregant catàleg en Català...',
              en: 'Loading Català catalog...',
            })}
          </span>
        </div>
        <SkeletonPosterGrid count={10} />
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
            className="group w-full text-left cursor-pointer active:scale-[0.98] transition-transform flex flex-col gap-1.5"
          >
            <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] group-hover:border-[#7C3AED]/65 transition-colors">
              <PosterImage
                src={item.poster}
                alt={item.title}
                aspect="poster"
                fallbackTitle={item.title}
              />
            </div>
            <div className="px-0.5 min-w-0">
              <div className="font-display font-bold text-xs text-white leading-snug break-words">
                {item.title}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug break-words">
                {item.episodeHint}
              </div>
            </div>
          </button>
        )}
      />
    )}
  </div>
);

interface CineFilteredGridViewProps {
  lang: AppLanguage;
  isSeriesTab: boolean;
  currentSort: string;
  backLabel: string;
  items: CatalogMovie[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  isBookmarked: (item: CatalogMovie) => boolean;
  onToggleBookmark: (item: CatalogMovie, e: React.MouseEvent) => void;
  onOpenPosterItem: (item: CatalogMovie) => void;
  onNextPage: () => void;
  onClearFilters: () => void;
}

export const CineFilteredGridView: React.FC<CineFilteredGridViewProps> = ({
  lang,
  isSeriesTab,
  currentSort,
  backLabel,
  items,
  loading,
  hasMore,
  loadingMore,
  isBookmarked,
  onToggleBookmark,
  onOpenPosterItem,
  onNextPage,
  onClearFilters,
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onClearFilters}
        className="min-h-11 px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{backLabel}</span>
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

    {loading ? (
      <div className="space-y-4">
        <div className="px-4 py-2.5 rounded-2xl bg-[#7C3AED]/15 border border-[#7C3AED]/35 flex items-center gap-2.5 text-xs font-semibold text-[#E9D5FF]">
          <Loader2 className="w-4 h-4 animate-spin text-[#A78BFA] shrink-0" />
          <span>
            {pickLang(lang, {
              es: isSeriesTab ? 'Cargando series...' : 'Cargando películas...',
              ca: isSeriesTab ? 'Carregant sèries...' : 'Carregant pel·lícules...',
              en: isSeriesTab ? 'Loading series...' : 'Loading movies...',
            })}
          </span>
        </div>
        <SkeletonPosterGrid count={10} />
      </div>
    ) : (
      <div className="space-y-4">
        <VirtualizedPosterGrid
          items={items}
          variant="poster"
          getKey={(item) => item.id}
          renderItem={(item) => (
            <CinePosterCard
              item={item}
              forcedKind={isSeriesTab ? 'tv' : 'movie'}
              force4kGlow={currentSort === '4k'}
              isBookmarked={isBookmarked(item)}
              onToggleBookmark={onToggleBookmark}
              onSelect={onOpenPosterItem}
            />
          )}
        />
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              disabled={loadingMore}
              onClick={onNextPage}
              className="min-h-12 px-6 rounded-2xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.12] text-xs font-bold text-white cursor-pointer"
            >
              {loadingMore
                ? pickLang(lang, { es: 'Cargando...', ca: 'Carregant...', en: 'Loading...' })
                : pickLang(lang, { es: 'Cargar más', ca: 'Carregar més', en: 'Load more' })}
            </button>
          </div>
        )}
      </div>
    )}
  </div>
);
