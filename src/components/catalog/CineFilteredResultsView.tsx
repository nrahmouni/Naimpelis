import React from 'react';
import { ArrowLeft, Loader2, Wand2 } from 'lucide-react';
import type { AppLanguage, CatalaCatalogItem, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
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
  onSearchWithAi,
}) => (
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
              onSelect={onOpenPosterItem}
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
              onSelect={onOpenPosterItem}
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
);

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
              <div className="font-display font-bold text-xs text-white truncate">{item.title}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{item.episodeHint}</div>
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
      <div className="py-10 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
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
