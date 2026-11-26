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
  Search,
  Tv,
  X,
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
const MAX_SEARCH_ITEMS_PER_TYPE = 240;
const UNIFIED_SECTION_PREVIEW_LIMIT = 12;

export function normalizeProviderCatalogSearch(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesProviderCatalogTokens(
  tokens: string[],
  fields: Array<string | undefined | null>
): boolean {
  if (tokens.length === 0) return true;
  const hay = normalizeProviderCatalogSearch(fields.filter(Boolean).join(' '));
  if (!hay) return false;
  for (let i = 0; i < tokens.length; i++) {
    if (!hay.includes(tokens[i])) return false;
  }
  return true;
}

interface RemoteProviderSearchState {
  query: string;
  loading: boolean;
  live: ProviderLiveItem[];
  movies: ProviderMovieItem[];
  series: ProviderSeriesItem[];
}

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchScopeTab, setSearchScopeTab] = useState<'all' | ProviderMediaTab>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState<number>(BATCH_SIZE);
  const [activeSeriesModal, setActiveSeriesModal] = useState<ProviderSeriesItem | null>(null);
  const [remoteSearch, setRemoteSearch] = useState<RemoteProviderSearchState>({
    query: '',
    loading: false,
    live: [],
    movies: [],
    series: [],
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = useMemo(
    () => normalizeProviderCatalogSearch(searchQuery),
    [searchQuery]
  );
  const queryTokens = useMemo(
    () => (normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : []),
    [normalizedQuery]
  );
  const hasSearchQuery = queryTokens.length > 0;

  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
  }, [selectedScope, mediaTab, selectedCategoryId, normalizedQuery, searchScopeTab]);

  useEffect(() => {
    setSelectedCategoryId('all');
  }, [selectedScope, mediaTab]);

  // Query backend fast warmed index immediately when searching so users see results
  // even while all 11 full catalogs are finishing background sync.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setRemoteSearch((prev) =>
        prev.query || prev.loading || prev.live.length || prev.movies.length || prev.series.length
          ? { query: '', loading: false, live: [], movies: [], series: [] }
          : prev
      );
      return;
    }

    const ctrl = new AbortController();
    setRemoteSearch((prev) => ({ ...prev, query: trimmed, loading: true }));

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/providers/search?q=${encodeURIComponent(trimmed)}&limit=36`,
          { signal: ctrl.signal }
        );
        if (!res.ok) {
          if (!ctrl.signal.aborted) {
            setRemoteSearch((prev) => ({ ...prev, loading: false }));
          }
          return;
        }
        const json = (await res.json().catch(() => null)) as
          | {
              success?: boolean;
              live?: ProviderLiveItem[];
              movies?: ProviderMovieItem[];
              series?: ProviderSeriesItem[];
            }
          | null;
        if (ctrl.signal.aborted) return;
        setRemoteSearch({
          query: trimmed,
          loading: false,
          live: Array.isArray(json?.live) ? json.live : [],
          movies: Array.isArray(json?.movies) ? json.movies : [],
          series: Array.isArray(json?.series) ? json.series : [],
        });
      } catch {
        if (!ctrl.signal.aborted) {
          setRemoteSearch((prev) => ({ ...prev, loading: false }));
        }
      }
    }, 180);

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

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
    if (hasSearchQuery && searchScopeTab === 'all') return [];
    const effectiveTab = hasSearchQuery ? searchScopeTab : mediaTab;
    const map = new Map<string, string>();
    for (const slot of activeSlots) {
      if (!slot.data) continue;
      const list =
        effectiveTab === 'live'
          ? slot.data.liveCategories
          : effectiveTab === 'movies'
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
  }, [activeSlots, mediaTab, hasSearchQuery, searchScopeTab]);

  const isUnfiltered = selectedCategoryId === 'all';

  const filteredLive = useMemo<ProviderLiveItem[]>(() => {
    if (!hasSearchQuery && mediaTab !== 'live') return [];
    const out: ProviderLiveItem[] = [];
    const seenIds = new Set<string>();

    for (const slot of activeSlots) {
      const list = slot.data?.liveStreams;
      if (!list) continue;
      if (!hasSearchQuery && isUnfiltered) {
        const remaining = visibleLimit - out.length;
        if (remaining <= 0) break;
        const take = Math.min(remaining, list.length);
        for (let i = 0; i < take; i++) out.push(list[i]);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (
          !isUnfiltered &&
          item.categoryName.trim().toLowerCase() !== selectedCategoryId
        ) {
          continue;
        }
        if (
          hasSearchQuery &&
          !matchesProviderCatalogTokens(queryTokens, [
            item.name,
            item.categoryName,
            item.providerName,
          ])
        ) {
          continue;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          out.push(item);
          if (hasSearchQuery && out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
        }
      }
      if (hasSearchQuery && out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
    }

    if (hasSearchQuery && remoteSearch.live.length > 0 && out.length < MAX_SEARCH_ITEMS_PER_TYPE) {
      for (const item of remoteSearch.live) {
        if (selectedScope !== 'all' && item.providerId !== selectedScope) continue;
        if (
          !isUnfiltered &&
          item.categoryName.trim().toLowerCase() !== selectedCategoryId
        ) {
          continue;
        }
        if (
          !matchesProviderCatalogTokens(queryTokens, [
            item.name,
            item.categoryName,
            item.providerName,
          ])
        ) {
          continue;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          out.push(item);
          if (out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
        }
      }
    }

    return out;
  }, [
    activeSlots,
    mediaTab,
    selectedCategoryId,
    isUnfiltered,
    visibleLimit,
    hasSearchQuery,
    queryTokens,
    remoteSearch.live,
    selectedScope,
  ]);

  const filteredMovies = useMemo<ProviderMovieItem[]>(() => {
    if (!hasSearchQuery && mediaTab !== 'movies') return [];
    const out: ProviderMovieItem[] = [];
    const seenIds = new Set<string>();

    for (const slot of activeSlots) {
      const list = slot.data?.vodStreams;
      if (!list) continue;
      if (!hasSearchQuery && isUnfiltered) {
        const remaining = visibleLimit - out.length;
        if (remaining <= 0) break;
        const take = Math.min(remaining, list.length);
        for (let i = 0; i < take; i++) out.push(list[i]);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (
          !isUnfiltered &&
          item.categoryName.trim().toLowerCase() !== selectedCategoryId
        ) {
          continue;
        }
        if (
          hasSearchQuery &&
          !matchesProviderCatalogTokens(queryTokens, [
            item.name,
            item.categoryName,
            item.providerName,
            item.year,
          ])
        ) {
          continue;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          out.push(item);
          if (hasSearchQuery && out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
        }
      }
      if (hasSearchQuery && out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
    }

    if (hasSearchQuery && remoteSearch.movies.length > 0 && out.length < MAX_SEARCH_ITEMS_PER_TYPE) {
      for (const item of remoteSearch.movies) {
        if (selectedScope !== 'all' && item.providerId !== selectedScope) continue;
        if (
          !isUnfiltered &&
          item.categoryName.trim().toLowerCase() !== selectedCategoryId
        ) {
          continue;
        }
        if (
          !matchesProviderCatalogTokens(queryTokens, [
            item.name,
            item.categoryName,
            item.providerName,
            item.year,
          ])
        ) {
          continue;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          out.push(item);
          if (out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
        }
      }
    }

    return out;
  }, [
    activeSlots,
    mediaTab,
    selectedCategoryId,
    isUnfiltered,
    visibleLimit,
    hasSearchQuery,
    queryTokens,
    remoteSearch.movies,
    selectedScope,
  ]);

  const filteredSeries = useMemo<ProviderSeriesItem[]>(() => {
    if (!hasSearchQuery && mediaTab !== 'series') return [];
    const out: ProviderSeriesItem[] = [];
    const seenIds = new Set<string>();

    for (const slot of activeSlots) {
      const list = slot.data?.seriesList;
      if (!list) continue;
      if (!hasSearchQuery && isUnfiltered) {
        const remaining = visibleLimit - out.length;
        if (remaining <= 0) break;
        const take = Math.min(remaining, list.length);
        for (let i = 0; i < take; i++) out.push(list[i]);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (
          !isUnfiltered &&
          item.categoryName.trim().toLowerCase() !== selectedCategoryId
        ) {
          continue;
        }
        if (
          hasSearchQuery &&
          !matchesProviderCatalogTokens(queryTokens, [
            item.name,
            item.categoryName,
            item.providerName,
            item.year,
          ])
        ) {
          continue;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          out.push(item);
          if (hasSearchQuery && out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
        }
      }
      if (hasSearchQuery && out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
    }

    if (hasSearchQuery && remoteSearch.series.length > 0 && out.length < MAX_SEARCH_ITEMS_PER_TYPE) {
      for (const item of remoteSearch.series) {
        if (selectedScope !== 'all' && item.providerId !== selectedScope) continue;
        if (
          !isUnfiltered &&
          item.categoryName.trim().toLowerCase() !== selectedCategoryId
        ) {
          continue;
        }
        if (
          !matchesProviderCatalogTokens(queryTokens, [
            item.name,
            item.categoryName,
            item.providerName,
            item.year,
          ])
        ) {
          continue;
        }
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          out.push(item);
          if (out.length >= MAX_SEARCH_ITEMS_PER_TYPE) break;
        }
      }
    }

    return out;
  }, [
    activeSlots,
    mediaTab,
    selectedCategoryId,
    isUnfiltered,
    visibleLimit,
    hasSearchQuery,
    queryTokens,
    remoteSearch.series,
    selectedScope,
  ]);

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

  const activeEffectiveTab: 'all' | ProviderMediaTab = hasSearchQuery
    ? searchScopeTab
    : mediaTab;

  const totalSearchMatches =
    filteredLive.length + filteredMovies.length + filteredSeries.length;

  const totalMatchesCount = hasSearchQuery
    ? activeEffectiveTab === 'all'
      ? totalSearchMatches
      : activeEffectiveTab === 'live'
      ? filteredLive.length
      : activeEffectiveTab === 'movies'
      ? filteredMovies.length
      : filteredSeries.length
    : isUnfiltered && hasLoadedFullCatalogs
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

  const handleSearchInputChange = (value: string) => {
    const wasEmpty = searchQuery.trim().length === 0;
    setSearchQuery(value);
    if (value.trim().length > 0) {
      if (wasEmpty) {
        setSearchScopeTab('all');
      }
      if (!isExpanded) {
        setIsExpanded(true);
      }
      if (!hasLoadedFullCatalogs) {
        loadFullCatalog();
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchScopeTab('all');
    searchInputRef.current?.focus();
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

      {/* ALWAYS-VISIBLE UNIFIED SERVER SEARCH BAR (CHANNELS, MOVIES, SERIES) */}
      <div className="flex items-center gap-2 rounded-2xl bg-black border border-white/[0.08] focus-within:border-[#7C3AED] px-3 transition-colors">
        <Search className="w-4 h-4 text-zinc-400 shrink-0" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(e) => handleSearchInputChange(e.target.value)}
          placeholder="Buscar canales, películas o series en servidores..."
          aria-label="Buscar canales, películas o series en Red de Servidores"
          className="w-full min-h-11 bg-transparent text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none min-w-0"
        />
        {hasSearchQuery && (remoteSearch.loading || isSyncingAny) && (
          <Loader2
            className="w-3.5 h-3.5 animate-spin text-[#A78BFA] shrink-0"
            aria-hidden="true"
          />
        )}
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={handleClearSearch}
            aria-label="Limpiar búsqueda"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showCatalogBody && (
        <div className="space-y-3 pt-1 min-w-0">
          {/* RESPONSIVE TABS (ALL + 3 MEDIA TYPES WHEN SEARCHING, 3 TABS WHEN BROWSING) */}
          <div
            className={`grid w-full gap-1 p-1 rounded-2xl bg-black border border-white/[0.08] ${
              hasSearchQuery ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            {hasSearchQuery && (
              <button
                type="button"
                onClick={() => setSearchScopeTab('all')}
                className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                  activeEffectiveTab === 'all'
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span className="inline-flex items-center gap-1 truncate max-w-full">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Todo</span>
                </span>
                <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                  {totalSearchMatches.toLocaleString('es-ES')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMediaTab('live');
                if (hasSearchQuery) setSearchScopeTab('live');
              }}
              className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                activeEffectiveTab === 'live'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Tv className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">TV en Vivo</span>
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                {(hasSearchQuery ? filteredLive.length : scopedCounts.live).toLocaleString('es-ES')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMediaTab('movies');
                if (hasSearchQuery) setSearchScopeTab('movies');
              }}
              className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                activeEffectiveTab === 'movies'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Film className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Películas</span>
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                {(hasSearchQuery ? filteredMovies.length : scopedCounts.movies).toLocaleString('es-ES')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMediaTab('series');
                if (hasSearchQuery) setSearchScopeTab('series');
              }}
              className={`min-h-11 px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer transition-colors min-w-0 ${
                activeEffectiveTab === 'series'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Clapperboard className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Series</span>
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] opacity-85 tabular-nums">
                {(hasSearchQuery ? filteredSeries.length : scopedCounts.series).toLocaleString('es-ES')}
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
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 tabular-nums">
            <span>
              {hasSearchQuery
                ? `${totalMatchesCount.toLocaleString('es-ES')} coincidencias para "${searchQuery.trim()}"`
                : `Mostrando ${Math.min(visibleLimit, totalMatchesCount).toLocaleString('es-ES')} de ${totalMatchesCount.toLocaleString('es-ES')} resultados`}
            </span>
            {hasSearchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-xs font-semibold text-[#C4A7FF] hover:text-white cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>

          {/* SEARCH UNIFIED SECTIONS OR BATCHED 48-CARD GRID */}
          {totalMatchesCount > 0 ? (
            <div className="space-y-5">
              {hasSearchQuery && activeEffectiveTab === 'all' ? (
                <>
                  {filteredLive.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5">
                          <Tv className="w-3.5 h-3.5 text-[#A78BFA]" />
                          <span>TV en Vivo ({filteredLive.length})</span>
                        </h3>
                        {filteredLive.length > UNIFIED_SECTION_PREVIEW_LIMIT && (
                          <button
                            type="button"
                            onClick={() => {
                              setMediaTab('live');
                              setSearchScopeTab('live');
                            }}
                            className="text-xs font-semibold text-[#C4A7FF] hover:text-white cursor-pointer"
                          >
                            Ver todos ({filteredLive.length})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {filteredLive.slice(0, UNIFIED_SECTION_PREVIEW_LIMIT).map((item) => (
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
                    </div>
                  )}

                  {filteredMovies.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-[#A78BFA]" />
                          <span>Películas ({filteredMovies.length})</span>
                        </h3>
                        {filteredMovies.length > UNIFIED_SECTION_PREVIEW_LIMIT && (
                          <button
                            type="button"
                            onClick={() => {
                              setMediaTab('movies');
                              setSearchScopeTab('movies');
                            }}
                            className="text-xs font-semibold text-[#C4A7FF] hover:text-white cursor-pointer"
                          >
                            Ver todas ({filteredMovies.length})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {filteredMovies.slice(0, UNIFIED_SECTION_PREVIEW_LIMIT).map((item) => (
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
                    </div>
                  )}

                  {filteredSeries.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5">
                          <Clapperboard className="w-3.5 h-3.5 text-[#A78BFA]" />
                          <span>Series ({filteredSeries.length})</span>
                        </h3>
                        {filteredSeries.length > UNIFIED_SECTION_PREVIEW_LIMIT && (
                          <button
                            type="button"
                            onClick={() => {
                              setMediaTab('series');
                              setSearchScopeTab('series');
                            }}
                            className="text-xs font-semibold text-[#C4A7FF] hover:text-white cursor-pointer"
                          >
                            Ver todas ({filteredSeries.length})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {filteredSeries.slice(0, UNIFIED_SECTION_PREVIEW_LIMIT).map((item) => (
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
                    </div>
                  )}
                </>
              ) : (
                <>
                  {activeEffectiveTab === 'live' && (
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

                  {activeEffectiveTab === 'movies' && (
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

                  {activeEffectiveTab === 'series' && (
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
                          setVisibleLimit((prev) =>
                            Math.min(totalMatchesCount, prev + BATCH_SIZE)
                          )
                        }
                        className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 cursor-pointer"
                      >
                        Cargar {Math.min(BATCH_SIZE, totalMatchesCount - visibleLimit)} más
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
              {isSyncingAny || (hasSearchQuery && remoteSearch.loading) ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-[#A78BFA]" />
                  <span>
                    {hasSearchQuery
                      ? 'Buscando en los servidores conectados...'
                      : 'Conectando servidores y preparando resultados...'}
                  </span>
                </>
              ) : (
                <span>
                  {hasSearchQuery
                    ? `No encontramos resultados para "${searchQuery.trim()}".`
                    : 'No hay contenido que coincida con el filtro actual.'}
                </span>
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
