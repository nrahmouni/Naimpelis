import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import type { AppLanguage, CatalogMovie, RoomQueueItem } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { PosterImage } from './ui/PosterImage';
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
  { id: 'crunchyroll', es: 'Crunchyroll', ca: 'Crunchyroll', en: 'Crunchyroll' },
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
}) => {
  const [collections, setCollections] = useState<EditorialCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);

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
    let active = true;
    setLoadingCollections(true);
    fetch(`/api/catalog/collections?lang=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then((colData) => {
        if (!active) return;
        if (Array.isArray(colData?.collections)) {
          setCollections(colData.collections);
        }
        if (Array.isArray(colData?.genres)) {
          onGenresLoaded?.(colData.genres);
        }
      })
      .catch(() => {
        // Silent fallback if upstream TMDB is momentarily busy
      })
      .finally(() => {
        if (active) setLoadingCollections(false);
      });

    return () => {
      active = false;
    };
  }, [lang, onGenresLoaded]);

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
        const params = new URLSearchParams({
          mediaType: discoverMediaType,
          genreId: String(activeGenreId || 28),
          provider: activeProvider,
          sort: effectiveSort,
          lang,
          page: String(pageNum),
        });
        const resp = await fetch(`/api/catalog/discover?${params.toString()}`);
        const data = await resp.json();
        if (Array.isArray(data?.items)) {
          setDiscoverItems((prev) => (append ? [...prev, ...data.items] : data.items));
          setHasMoreDiscover(Boolean(data.hasMore));
          setDiscoverPage(pageNum);
        }
      } catch {
        if (!append) setDiscoverItems([]);
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
      setDiscoverItems([]);
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
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectItem({ ...item, mediaType: discoverMediaType });
                    }}
                    className="group w-full text-left flex flex-col gap-2 cursor-pointer"
                  >
                    <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#141418] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                      <PosterImage
                        src={item.poster}
                        alt={item.title}
                        aspect="none"
                        className="w-full h-full"
                        imgClassName="object-cover"
                        fallbackTitle={item.title}
                      />
                    </div>
                    <div className="px-0.5 space-y-0.5">
                      <h4 className="font-display font-semibold text-xs text-white leading-snug line-clamp-2">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 tabular-nums">
                        {item.year || 'HD'}
                        {item.rating ? ` · ★ ${item.rating}` : ''}
                      </p>
                    </div>
                  </button>
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

              <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
                {col.items.map((item, idx) => {
                  const key = `${col.id}-${item.id}`;
                  const showRank = colIndex === 0 && idx < 10;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onSelectItem({ ...item, mediaType: col.mediaType });
                      }}
                      className="group relative w-[136px] sm:w-[164px] shrink-0 text-left flex flex-col gap-2 cursor-pointer"
                    >
                      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#141418] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                        <PosterImage
                          src={item.poster}
                          alt={item.title}
                          aspect="none"
                          className="w-full h-full"
                          imgClassName="object-cover"
                          fallbackTitle={item.title}
                        />
                        {showRank && (
                          <span className="absolute bottom-2 left-2.5 font-display font-black text-2xl leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] tabular-nums">
                            {idx + 1}
                          </span>
                        )}
                      </div>

                      <div className="px-0.5 space-y-0.5">
                        <h4 className="font-display font-semibold text-xs text-white leading-snug line-clamp-2">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 tabular-nums">
                          {item.year || 'HD'} · ★ {item.rating || '7.5'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};
