import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import type { AppLanguage, CatalogMovie, RoomQueueItem } from '../types';
import { pickLang } from '../utils/i18n';
import { prefetchImageUrls } from '../utils/imageUrl';
import {
  catalogQueryKeys,
  queryClient,
  useEditorialCollectionsQuery,
} from '../hooks/useCatalogQueries';
import { CinePosterCard } from './catalog/CinePosterCard';
import { VirtualizedPosterGrid } from './VirtualizedPosterGrid';

export interface CatalogGenreItem {
  id: number;
  slug: string;
  es: string;
  ca: string;
  en: string;
  mediaType: 'movie' | 'tv' | 'both';
}

interface EditorialCollection {
  id: string;
  titleEs: string;
  titleCa: string;
  titleEn: string;
  subtitleEs: string;
  subtitleCa: string;
  subtitleEn: string;
  mediaType: 'movie' | 'tv';
  items: CatalogMovie[];
}

export interface FastChannelItem {
  id: string;
  name: string;
  category: 'cinema' | 'sports' | 'documentary' | 'music' | 'anime' | 'news';
  descriptionEs: string;
  descriptionCa: string;
  descriptionEn: string;
  streamUrl: string;
  mode: 'hls' | 'youtube';
  youtubeId?: string;
  quality: string;
  tone: string;
  mark: string;
}

export const DISCOVERY_PROVIDERS = [
  { id: 'all', es: 'Todas', ca: 'Totes', en: 'All' },
  { id: 'netflix', es: 'Netflix', ca: 'Netflix', en: 'Netflix' },
  { id: 'hbomax', es: 'HBO Max', ca: 'HBO Max', en: 'HBO Max' },
  { id: 'disney', es: 'Disney+', ca: 'Disney+', en: 'Disney+' },
  { id: 'prime', es: 'Prime Video', ca: 'Prime Video', en: 'Prime Video' },
  { id: 'apple', es: 'Apple TV+', ca: 'Apple TV+', en: 'Apple TV+' },
  { id: 'movistar', es: 'Movistar+', ca: 'Movistar+', en: 'Movistar+' },
  { id: 'filmin', es: 'Filmin', ca: 'Filmin', en: 'Filmin' },
  { id: 'skyshowtime', es: 'SkyShowtime', ca: 'SkyShowtime', en: 'SkyShowtime' },
] as const;

export interface ExpandedDiscoveryFilterState {
  mediaType?: 'all' | 'movie' | 'tv';
  genreId?: number | null;
  provider?: string;
  sortBy?: 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';
}

interface ExpandedDiscoverySectionProps {
  lang: AppLanguage;
  filterState?: ExpandedDiscoveryFilterState;
  onGenresLoaded?: (genres: CatalogGenreItem[]) => void;
  onSelectItem: (item: CatalogMovie) => void;
  onPlayFastChannel?: (channel: FastChannelItem) => void;
  onAddToQueue?: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  isBookmarked?: (item: CatalogMovie) => boolean;
  onToggleBookmark?: (item: CatalogMovie) => void;
}

export const ExpandedDiscoverySection: React.FC<ExpandedDiscoverySectionProps> = ({
  lang,
  filterState,
  onGenresLoaded,
  onSelectItem,
  isBookmarked,
  onToggleBookmark,
}) => {
  const { data: collectionsData, isLoading: loadingCollectionsQuery } =
    useEditorialCollectionsQuery(lang, true);
  const collections: EditorialCollection[] = collectionsData?.collections ?? [];
  const loadingCollections = loadingCollectionsQuery && collections.length === 0;
  const onGenresLoadedRef = useRef(onGenresLoaded);
  onGenresLoadedRef.current = onGenresLoaded;

  const [discoverItems, setDiscoverItems] = useState<CatalogMovie[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);

  const activeMediaFilter = filterState?.mediaType || 'all';
  const activeGenreId = filterState?.genreId ?? null;
  const activeProvider = filterState?.provider || 'all';
  const activeSort = filterState?.sortBy || 'popularity.desc';
  const hasCustomDiscoveryFilter =
    Boolean(activeGenreId) ||
    activeProvider !== 'all' ||
    activeSort !== 'popularity.desc';

  useEffect(() => {
    if (Array.isArray(collectionsData?.genres) && collectionsData.genres.length > 0) {
      onGenresLoadedRef.current?.(collectionsData.genres);
    }
  }, [collectionsData]);

  useEffect(() => {
    if (collections.length === 0) return;
    const firstItems = collections
      .filter((col) => activeMediaFilter === 'all' || col.mediaType === activeMediaFilter)
      .slice(0, 2)
      .flatMap((col) => col.items.slice(0, 8));
    prefetchImageUrls(
      firstItems.map((it) => it.poster || it.backdrop),
      { limit: 16, kind: 'poster' }
    );
  }, [collections, activeMediaFilter]);

  const discoverMediaType: 'movie' | 'tv' = activeMediaFilter === 'tv' ? 'tv' : 'movie';

  const fetchDiscoveryGrid = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!hasCustomDiscoveryFilter) return;
      setLoadingDiscover(true);
      try {
        const effectiveSort =
          discoverMediaType === 'tv' && activeSort === 'primary_release_date.desc'
            ? 'first_air_date.desc'
            : activeSort;
        const genreVal = activeGenreId || 28;
        const data = await queryClient.fetchQuery({
          queryKey: catalogQueryKeys.discover({
            mediaType: discoverMediaType,
            genreId: genreVal,
            provider: activeProvider,
            sort: effectiveSort,
            lang,
            page: pageNum,
          }),
          staleTime: 5 * 60_000,
          queryFn: async () => {
            const params = new URLSearchParams({
              mediaType: discoverMediaType,
              genreId: String(genreVal),
              provider: activeProvider,
              sort: effectiveSort,
              lang,
              page: String(pageNum),
            });
            const resp = await fetch(`/api/catalog/discover?${params.toString()}`);
            return resp.json();
          },
        });
        if (Array.isArray(data?.items)) {
          setDiscoverItems((prev) => (append ? [...prev, ...data.items] : data.items));
          setHasMoreDiscover(Boolean(data.hasMore));
          setDiscoverPage(pageNum);
        }
      } catch {
        if (!append) {
          setDiscoverItems((prev) => (prev.length === 0 ? prev : []));
        }
      } finally {
        setLoadingDiscover(false);
      }
    },
    [
      hasCustomDiscoveryFilter,
      discoverMediaType,
      activeGenreId,
      activeProvider,
      activeSort,
      lang,
    ]
  );

  useEffect(() => {
    if (hasCustomDiscoveryFilter) {
      fetchDiscoveryGrid(1, false);
    } else {
      setDiscoverItems((prev) => (prev.length === 0 ? prev : []));
      setHasMoreDiscover((prev) => (prev ? false : prev));
    }
  }, [hasCustomDiscoveryFilter, fetchDiscoveryGrid]);

  const visibleCollections = collections.filter((col) => {
    if (activeMediaFilter === 'all') return true;
    return col.mediaType === activeMediaFilter;
  });

  return (
    <div className="space-y-8">
      {/* Filtered Results Grid (shown only when user sets filters inside Filtros sheet) */}
      {hasCustomDiscoveryFilter && (
        <section className="space-y-4">
          <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
            {pickLang(lang, {
              es: 'Resultados filtrados',
              ca: 'Resultats filtrats',
              en: 'Filtered results',
            })}
          </h3>

          {loadingDiscover && discoverItems.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-[#9146FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Cargando títulos...',
                  ca: 'Carregant títols...',
                  en: 'Loading titles...',
                })}
              </span>
            </div>
          ) : discoverItems.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Sparkles className="w-6 h-6 text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-400">
                {pickLang(lang, {
                  es: 'No hay títulos para esta combinación de filtros.',
                  ca: 'No hi ha títols per a aquesta combinació de filtres.',
                  en: 'No titles match these filters.',
                })}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <VirtualizedPosterGrid
                items={discoverItems}
                variant="poster"
                gapPx={12}
                getKey={(item) => `exp-${discoverMediaType}-${item.id}`}
                renderItem={(item) => (
                  <CinePosterCard
                    item={item}
                    forcedKind={discoverMediaType}
                    isBookmarked={isBookmarked?.(item)}
                    onToggleBookmark={onToggleBookmark ? (m) => onToggleBookmark(m) : undefined}
                    onSelect={(selected) => onSelectItem(selected)}
                  />
                )}
              />

              {hasMoreDiscover && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    disabled={loadingDiscover}
                    onClick={() => fetchDiscoveryGrid(discoverPage + 1, true)}
                    className="min-h-12 px-6 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loadingDiscover ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span>
                      {pickLang(lang, {
                        es: 'Cargar más',
                        ca: 'Carregar més',
                        en: 'Load more',
                      })}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Clean Horizontal Poster Rows (Title + Posters Only) */}
      {loadingCollections ? (
        <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="w-[136px] sm:w-[164px] shrink-0 aspect-[2/3] rounded-2xl bg-white/[0.04] skeleton-shimmer"
            />
          ))}
        </div>
      ) : (
        visibleCollections.map((col, colIndex) => {
          const title = pickLang(lang, {
            es: col.titleEs,
            ca: col.titleCa,
            en: col.titleEn,
          });

          return (
            <section key={col.id} className="space-y-3">
              <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight px-0.5">
                {title}
              </h3>

              <div className="scroll-snap-x flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
                {col.items.map((item, idx) => (
                  <CinePosterCard
                    key={`${col.id}-${item.id}`}
                    item={item}
                    forcedKind={col.mediaType}
                    rankIndex={colIndex === 0 && idx < 10 ? idx + 1 : undefined}
                    isBookmarked={isBookmarked?.(item)}
                    onToggleBookmark={onToggleBookmark ? (m) => onToggleBookmark(m) : undefined}
                    onSelect={(selected) => onSelectItem(selected)}
                    className="scroll-snap-item w-[136px] sm:w-[162px] shrink-0"
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};
