import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Film,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Tv,
} from 'lucide-react';
import type { SpanishTdtChannel } from '../../types';
import type {
  ProviderCategoryItem,
  ProviderLiveItem,
  ProviderMediaTab,
  ProviderMovieItem,
  ProviderSeriesEpisodeItem,
  ProviderSeriesItem,
} from '../../types/providers';
import { useXtreamProvidersCatalog } from '../../hooks/useXtreamProvidersCatalog';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { ProviderSeriesModal } from './ProviderSeriesModal';

const BATCH_SIZE = 48;

interface ProvidersCatalogSectionProps {
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onPlayCustomUrl?: (
    rawUrl: string,
    meta?: { title?: string; subtitle?: string; poster?: string }
  ) => void;
  autoLoadCatalog?: boolean;
}

export const ProvidersCatalogSection: React.FC<ProvidersCatalogSectionProps> = ({
  onPlayChannel,
  onPlayCustomUrl,
  autoLoadCatalog = false,
}) => {
  const {
    orderedSlots,
    totals,
    isSyncingAny,
    hasLoadedFullCatalogs,
    loadFullCatalog,
    loadSingleProvider,
    refreshAllProviders,
  } = useXtreamProvidersCatalog(autoLoadCatalog);

  const [isExpanded, setIsExpanded] = useState<boolean>(autoLoadCatalog);
  const [selectedScope, setSelectedScope] = useState<'all' | string>('all');
  const [mediaTab, setMediaTab] = useState<ProviderMediaTab>('live');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState<number>(BATCH_SIZE);
  const [activeSeriesModal, setActiveSeriesModal] = useState<ProviderSeriesItem | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
  }, [selectedScope, mediaTab, selectedCategoryId]);

  useEffect(() => {
    setSelectedCategoryId('all');
  }, [selectedScope, mediaTab]);

  const activeSlots = useMemo(() => {
    if (selectedScope === 'all') return orderedSlots;
    return orderedSlots.filter((s) => s.providerId === selectedScope);
  }, [orderedSlots, selectedScope]);

  const scopedCounts = useMemo(() => {
    let live = 0;
    let movies = 0;
    let series = 0;
    for (const slot of activeSlots) {
      live += slot.counts.live;
      movies += slot.counts.movies;
      series += slot.counts.series;
    }
    return { live, movies, series };
  }, [activeSlots]);

  const availableCategories = useMemo<ProviderCategoryItem[]>(() => {
    const map = new Map<string, string>();
    for (const slot of activeSlots) {
      if (!slot.data) continue;
      const list =
        mediaTab === 'live'
          ? slot.data.liveCategories
          : mediaTab === 'movies'
          ? slot.data.vodCategories
          : slot.data.seriesCategories;
      for (const c of list) {
        const key = c.name.trim().toLowerCase();
        if (!key || map.has(key)) continue;
        map.set(key, c.name.trim());
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .slice(0, 80);
  }, [activeSlots, mediaTab]);

  const isUnfiltered = selectedCategoryId === 'all';

  const filteredLive = useMemo<ProviderLiveItem[]>(() => {
    if (mediaTab !== 'live') return [];
    const out: ProviderLiveItem[] = [];
    for (const slot of activeSlots) {
      const list = slot.data?.liveStreams;
      if (!list) continue;
      if (isUnfiltered) {
        const remaining = visibleLimit - out.length;
        if (remaining <= 0) break;
        const take = Math.min(remaining, list.length);
        for (let i = 0; i < take; i++) out.push(list[i]);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.categoryName.trim().toLowerCase() !== selectedCategoryId) {
          continue;
        }
        out.push(item);
      }
    }
    return out;
  }, [activeSlots, mediaTab, selectedCategoryId, isUnfiltered, visibleLimit]);

  const filteredMovies = useMemo<ProviderMovieItem[]>(() => {
    if (mediaTab !== 'movies') return [];
    const out: ProviderMovieItem[] = [];
    for (const slot of activeSlots) {
      const list = slot.data?.vodStreams;
      if (!list) continue;
      if (isUnfiltered) {
        const remaining = visibleLimit - out.length;
        if (remaining <= 0) break;
        const take = Math.min(remaining, list.length);
        for (let i = 0; i < take; i++) out.push(list[i]);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.categoryName.trim().toLowerCase() !== selectedCategoryId) {
          continue;
        }
        out.push(item);
      }
    }
    return out;
  }, [activeSlots, mediaTab, selectedCategoryId, isUnfiltered, visibleLimit]);

  const filteredSeries = useMemo<ProviderSeriesItem[]>(() => {
    if (mediaTab !== 'series') return [];
    const out: ProviderSeriesItem[] = [];
    for (const slot of activeSlots) {
      const list = slot.data?.seriesList;
      if (!list) continue;
      if (isUnfiltered) {
        const remaining = visibleLimit - out.length;
        if (remaining <= 0) break;
        const take = Math.min(remaining, list.length);
        for (let i = 0; i < take; i++) out.push(list[i]);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.categoryName.trim().toLowerCase() !== selectedCategoryId) {
          continue;
        }
        out.push(item);
      }
    }
    return out;
  }, [activeSlots, mediaTab, selectedCategoryId, isUnfiltered, visibleLimit]);

  const loadedUnfilteredTotal = useMemo(() => {
    let n = 0;
    for (const slot of activeSlots) {
      if (!slot.data) continue;
      n +=
        mediaTab === 'live'
          ? slot.data.liveStreams.length
          : mediaTab === 'movies'
          ? slot.data.vodStreams.length
          : slot.data.seriesList.length;
    }
    return n;
  }, [activeSlots, mediaTab]);

  const totalMatchesCount =
    isUnfiltered && hasLoadedFullCatalogs
      ? loadedUnfilteredTotal
      : mediaTab === 'live'
      ? filteredLive.length
      : mediaTab === 'movies'
      ? filteredMovies.length
      : filteredSeries.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleLimit >= totalMatchesCount) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleLimit((prev) => Math.min(totalMatchesCount, prev + BATCH_SIZE));
        }
      },
      { rootMargin: '320px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleLimit, totalMatchesCount]);

  const handleToggleExpand = () => {
    triggerHaptic('light');
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && !hasLoadedFullCatalogs) {
      loadFullCatalog();
    }
  };

  const handleServerChange = (nextScope: string) => {
    setSelectedScope(nextScope);
    if (nextScope !== 'all') {
      loadSingleProvider(nextScope);
    } else if (!hasLoadedFullCatalogs) {
      loadFullCatalog();
    }
  };

  const handleLiveClick = (item: ProviderLiveItem) => {
    triggerHaptic('medium');
    const channelPayload: SpanishTdtChannel = {
      id: item.id,
      dial: 0,
      name: item.name,
      category: 'entretenimiento',
      network: item.providerName,
      quality: 'HD',
      description: item.categoryName,
      shortMark: item.name.slice(0, 3).toUpperCase(),
      brandTone: '#8B5CF6',
      logoUrl: item.logo || undefined,
      channels: [
        {
          id: `${item.id}-hls`,
          label: `${item.providerName} · ${item.categoryName}`,
          lang: 'ES',
          sourceUrl: item.playbackUrl,
          resolverType: 'tdt_hls',
        },
      ],
    };
    onPlayChannel(channelPayload);
  };

  const handleMovieClick = (item: ProviderMovieItem) => {
    triggerHaptic('medium');
    if (onPlayCustomUrl) {
      onPlayCustomUrl(item.playbackUrl, {
        title: item.name,
        subtitle: `${item.providerName} · ${item.categoryName}`,
        poster: item.poster || undefined,
      });
    }
  };

  const handleEpisodePlay = (
    ep: ProviderSeriesEpisodeItem,
    series: ProviderSeriesItem
  ) => {
    triggerHaptic('medium');
    setActiveSeriesModal(null);
    if (onPlayCustomUrl) {
      onPlayCustomUrl(ep.playbackUrl, {
        title: series.name,
        subtitle: `T${ep.season}·E${ep.episodeNum} · ${ep.title}`,
        poster: ep.poster || series.poster || undefined,
      });
    }
  };

  const showCatalogBody = isExpanded;
  const activeScopeName =
    selectedScope === 'all'
      ? 'Red de Servidores'
      : orderedSlots.find((s) => s.providerId === selectedScope)?.providerName ||
        'Servidor';

  return (
    <section
      data-testid="providers-catalog-section"
      className="w-full overflow-hidden space-y-3 rounded-[22px] bg-[#0B0B10] border border-white/[0.08] p-4 sm:p-5"
    >
      {/* CLEAN UNCLIPPED SUMMARY HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-[#A78BFA] shrink-0" />
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
              {activeScopeName}
            </h2>
            <span className="text-xs font-mono text-zinc-400 tabular-nums">
              {totals.readyCount}/{totals.totalProviders} servidores
              {isSyncingAny ? ' · sincronizando...' : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-zinc-400 tabular-nums">
            <span>
              <strong className="text-zinc-100 font-semibold">
                {totals.totalLive.toLocaleString('es-ES')}
              </strong>{' '}
              TV
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-zinc-100 font-semibold">
                {totals.totalMovies.toLocaleString('es-ES')}
              </strong>{' '}
              Películas
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-zinc-100 font-semibold">
                {totals.totalSeries.toLocaleString('es-ES')}
              </strong>{' '}
              Series
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleExpand}
            className="min-h-10 px-3.5 rounded-xl bg-[#7C3AED]/18 hover:bg-[#7C3AED]/28 border border-[#7C3AED]/45 text-xs font-semibold text-[#D8B4FE] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Ocultar catálogo</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Explorar catálogo</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIsExpanded(true);
              refreshAllProviders();
            }}
            disabled={isSyncingAny}
            aria-label="Actualizar servidores"
            className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSyncingAny ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A78BFA]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#A78BFA]" />
            )}
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {showCatalogBody && (
        <div className="space-y-3 pt-1 min-w-0">
          {/* RESPONSIVE 3-COLUMN TABS (NEVER OVERFLOWS OR CLIPS ON MOBILE) */}
          <div className="grid grid-cols-3 w-full gap-1 p-1 rounded-2xl bg-black border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setMediaTab('live')}
              className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                mediaTab === 'live'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Tv className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">TV en Vivo</span>
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                {scopedCounts.live.toLocaleString('es-ES')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMediaTab('movies')}
              className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                mediaTab === 'movies'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Film className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Películas</span>
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                {scopedCounts.movies.toLocaleString('es-ES')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMediaTab('series')}
              className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                mediaTab === 'series'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Clapperboard className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Series</span>
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                {scopedCounts.series.toLocaleString('es-ES')}
              </span>
            </button>
          </div>

          {/* CLEAN SERVER & CATEGORY SELECTORS (ZERO HORIZONTAL CLIPPING) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
            <select
              value={selectedScope}
              onChange={(e) => handleServerChange(e.target.value)}
              aria-label="Filtrar por servidor"
              className="w-full min-h-11 px-3 rounded-2xl bg-black border border-white/[0.08] focus:border-[#7C3AED] text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">
                Todos los servidores ({totals.readyCount}/{totals.totalProviders})
              </option>
              {orderedSlots.map((slot) => {
                const suffix =
                  slot.loading && slot.counts.live + slot.counts.movies + slot.counts.series === 0
                    ? 'Cargando...'
                    : !slot.loading && slot.status === 'error'
                    ? 'Sin respuesta'
                    : `${slot.counts.live.toLocaleString('es-ES')} TV · ${slot.counts.movies.toLocaleString('es-ES')} Cine · ${slot.counts.series.toLocaleString('es-ES')} Series`;
                return (
                  <option key={slot.providerId} value={slot.providerId}>
                    {slot.providerName} ({suffix})
                  </option>
                );
              })}
            </select>

            {availableCategories.length > 0 && (
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                aria-label="Filtrar por categoría"
                className="w-full min-h-11 px-3 rounded-2xl bg-black border border-white/[0.08] focus:border-[#7C3AED] text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="all">Todas las categorías</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* STATUS LINE */}
          <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums">
            <span>
              Mostrando {Math.min(visibleLimit, totalMatchesCount).toLocaleString('es-ES')} de{' '}
              {totalMatchesCount.toLocaleString('es-ES')} resultados
            </span>
          </div>

          {/* BATCHED 48-CARD GRID WITH INTERSECTION OBSERVER */}
          {totalMatchesCount > 0 ? (
            <div className="space-y-4">
              {mediaTab === 'live' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {filteredLive.slice(0, visibleLimit).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleLiveClick(item)}
                      className="rounded-2xl bg-[#111118] border border-white/[0.07] hover:border-[#7C3AED]/60 overflow-hidden text-left group cursor-pointer active:scale-[0.98] transition-all flex flex-col min-w-0"
                    >
                      <div className="relative w-full aspect-video bg-black">
                        <PosterImage
                          src={item.logo}
                          alt={item.name}
                          aspect="video"
                          imgClassName="object-contain p-2 bg-[#09090E]"
                          fallbackTitle={item.name}
                          fallbackIcon={<Tv className="w-4 h-4" />}
                        />
                        <span className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-black/75 border border-white/15 flex items-center justify-center text-white opacity-90 group-hover:bg-[#7C3AED] group-hover:border-[#7C3AED] transition-colors">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </span>
                      </div>
                      <div className="p-2.5 space-y-0.5 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {item.categoryName} · {item.providerName}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {mediaTab === 'movies' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {filteredMovies.slice(0, visibleLimit).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleMovieClick(item)}
                      className="rounded-2xl bg-[#111118] border border-white/[0.07] hover:border-[#7C3AED]/60 overflow-hidden text-left group cursor-pointer active:scale-[0.98] transition-all flex flex-col min-w-0"
                    >
                      <div className="relative w-full">
                        <PosterImage
                          src={item.poster}
                          alt={item.name}
                          aspect="poster"
                          fallbackTitle={item.name}
                          fallbackIcon={<Film className="w-4 h-4" />}
                        />
                        <span className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-black/75 border border-white/15 flex items-center justify-center text-white opacity-90 group-hover:bg-[#7C3AED] group-hover:border-[#7C3AED] transition-colors">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </span>
                      </div>
                      <div className="p-2.5 space-y-0.5 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {item.categoryName} · {item.providerName}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {mediaTab === 'series' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {filteredSeries.slice(0, visibleLimit).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveSeriesModal(item);
                      }}
                      className="rounded-2xl bg-[#111118] border border-white/[0.07] hover:border-[#7C3AED]/60 overflow-hidden text-left group cursor-pointer active:scale-[0.98] transition-all flex flex-col min-w-0"
                    >
                      <div className="relative w-full">
                        <PosterImage
                          src={item.poster}
                          alt={item.name}
                          aspect="poster"
                          fallbackTitle={item.name}
                          fallbackIcon={<Clapperboard className="w-4 h-4" />}
                        />
                        <span className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-black/75 border border-white/15 flex items-center justify-center text-white opacity-90 group-hover:bg-[#7C3AED] group-hover:border-[#7C3AED] transition-colors">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </span>
                      </div>
                      <div className="p-2.5 space-y-0.5 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {item.categoryName} · {item.providerName}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {visibleLimit < totalMatchesCount && (
                <div ref={sentinelRef} className="py-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleLimit((prev) => Math.min(totalMatchesCount, prev + BATCH_SIZE))
                    }
                    className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 cursor-pointer"
                  >
                    Cargar {Math.min(BATCH_SIZE, totalMatchesCount - visibleLimit)} más
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
              {isSyncingAny ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-[#A78BFA]" />
                  <span>Conectando servidores y preparando resultados...</span>
                </>
              ) : (
                <span>No hay contenido que coincida con el filtro actual.</span>
              )}
            </div>
          )}
        </div>
      )}

      <ProviderSeriesModal
        series={activeSeriesModal}
        onClose={() => setActiveSeriesModal(null)}
        onPlayEpisode={handleEpisodePlay}
      />
    </section>
  );
};
