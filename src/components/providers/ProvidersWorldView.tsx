import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Clapperboard,
  Film,
  Layers,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, StreamTrack } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { useAppStore } from '../../store/useAppStore';
import {
  catalogQueryKeys,
  queryClient,
  useProvidersStatusQuery,
} from '../../hooks/useCatalogQueries';
import { prefetchImageUrls } from '../../utils/imageUrl';
import { ProvidersSeriesModal } from './ProvidersSeriesModal';
import type {
  ProviderCatalogAlternativePublic,
  ProviderCatalogItemPublic,
  ProviderCategoryPublic,
  ProviderMediaKind,
  ProviderSeriesDetailPublic,
  ProviderSeriesEpisodePublic,
} from './providersTypes';

interface ProvidersWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onPlayCustomUrl: (
    url: string,
    meta?: {
      title?: string;
      subtitle?: string;
      poster?: string;
      tracks?: StreamTrack[];
      lang?: string;
      quality?: string;
      year?: string;
    }
  ) => void;
}

const PAGE_SIZE = 60;

function makeMonogram(name: string): string {
  const clean = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return clean.slice(0, 3) || 'TV';
}

function buildTrackLabel(alt: ProviderCatalogAlternativePublic): string {
  const parts = [alt.providerName, alt.quality, alt.langLabel || alt.lang].filter(Boolean);
  return parts.join(' · ');
}

function buildTracksFromItem(item: ProviderCatalogItemPublic): StreamTrack[] {
  const alts =
    Array.isArray(item.alternatives) && item.alternatives.length > 0
      ? item.alternatives
      : [
          {
            id: item.id,
            providerId: item.providerId,
            providerName: item.providerName,
            streamId: item.streamId,
            name: item.name,
            categoryName: item.categoryName,
            lang: item.lang || 'ES',
            langLabel: item.langLabel || item.lang || 'ES',
            quality: item.quality || 'HD',
            qualityTier: item.qualityTier || 2,
            containerExtension: item.containerExtension,
            streamUrl: item.streamUrl,
          },
        ];

  return alts.map((alt) => {
    const isHls = item.kind === 'live' || /\.m3u8(\?|$)/i.test(alt.streamUrl);
    return {
      id: `${alt.id}-track`,
      label: buildTrackLabel(alt),
      lang: alt.lang || 'ES',
      langLabel: alt.langLabel,
      quality: alt.quality || 'HD',
      providerId: alt.providerId,
      providerName: alt.providerName,
      sourceUrl: alt.streamUrl,
      resolvedStreamUrl: alt.streamUrl,
      resolverType: isHls ? 'direct_hls' : 'direct_mp4',
    };
  });
}

export const ProvidersWorldView: React.FC<ProvidersWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlayTdtChannel,
  onPlayCustomUrl,
}) => {
  const scope = useAppStore((s) => s.providersScope);
  const setScope = useAppStore((s) => s.setProvidersScope);
  const activeKind = useAppStore((s) => s.providersKind);
  const setActiveKind = useAppStore((s) => s.setProvidersKind);
  const priorityMode = useAppStore((s) => s.playbackPriorityMode);
  const setPriorityMode = useAppStore((s) => s.setPlaybackPriorityMode);

  const {
    data: statusData = null,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = useProvidersStatusQuery(true);
  const [refreshing, setRefreshing] = useState(false);

  const [inlineQuery, setInlineQuery] = useState(externalSearchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(externalSearchQuery);
  const [categoryId, setCategoryId] = useState<string>('all');
  const [langFilter, setLangFilter] = useState<'all' | 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT'>('all');
  const [qualityFilter, setQualityFilter] = useState<'all' | '4K' | '1080p' | 'HD'>('all');
  const [items, setItems] = useState<ProviderCatalogItemPublic[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [alternativesItem, setAlternativesItem] = useState<ProviderCatalogItemPublic | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<{
    providerId: string;
    seriesId: string;
    title: string;
    poster?: string;
  } | null>(null);

  useEffect(() => {
    setInlineQuery(externalSearchQuery);
  }, [externalSearchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(inlineQuery.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [inlineQuery]);

  useBackInterceptor(
    Boolean(alternativesItem),
    'providers-alternatives-sheet',
    () => setAlternativesItem(null),
    { priority: 22 }
  );

  useEffect(() => {
    if (!alternativesItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAlternativesItem(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alternativesItem]);

  useBackInterceptor(
    scope !== 'total' || activeKind !== 'all',
    'providers-scope-reset',
    () => {
      if (activeKind !== 'all') {
        setActiveKind('all');
        setCategoryId('all');
      } else {
        setScope('total');
        setCategoryId('all');
      }
    },
    { priority: 4 }
  );

  const isGroupedMode = scope === 'total';

  const fetchCatalogPage = useCallback(
    async (opts: { offset: number; append: boolean; forceFresh?: boolean }) => {
      const trimmedQ = debouncedQuery;
      const queryParams = {
        scope,
        kind: activeKind,
        offset: opts.offset,
        limit: PAGE_SIZE,
        categoryId: categoryId || 'all',
        lang: langFilter || 'all',
        quality: qualityFilter || 'all',
        priority: priorityMode,
        grouped: isGroupedMode ? '1' : '0',
        q: trimmedQ,
      };
      const qKey = catalogQueryKeys.providersCatalog(queryParams);
      const cached =
        !opts.append && !opts.forceFresh
          ? queryClient.getQueryData<{ items: ProviderCatalogItemPublic[]; total: number }>(qKey)
          : undefined;

      if (cached) {
        setTotalItems(Number(cached.total || 0));
        setItems(cached.items || []);
        setLoadingCatalog(false);
        setLoadingMore(false);
      } else if (opts.append) {
        setLoadingMore(true);
      } else {
        setLoadingCatalog(true);
      }
      setCatalogError(null);

      try {
        const params = new URLSearchParams({
          scope,
          kind: activeKind,
          offset: String(opts.offset),
          limit: String(PAGE_SIZE),
          priority: priorityMode,
          grouped: isGroupedMode ? '1' : '0',
        });
        if (categoryId && categoryId !== 'all') {
          params.set('categoryId', categoryId);
        }
        if (langFilter && langFilter !== 'all') {
          params.set('lang', langFilter);
        }
        if (qualityFilter && qualityFilter !== 'all') {
          params.set('quality', qualityFilter);
        }
        if (trimmedQ) {
          params.set('q', trimmedQ);
        }

        const data = await queryClient.fetchQuery<{
          items: ProviderCatalogItemPublic[];
          total: number;
        }>({
          queryKey: qKey,
          staleTime: opts.forceFresh ? 0 : 4 * 60_000,
          queryFn: async () => {
            const res = await fetch(`/api/providers/catalog?${params.toString()}`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
              throw new Error('catalog_error');
            }
            return {
              items: Array.isArray(json.items) ? (json.items as ProviderCatalogItemPublic[]) : [],
              total: Number(json.total || 0),
            };
          },
        });

        const incoming = data.items || [];
        setTotalItems(data.total);
        setItems((prev) => (opts.append ? [...prev, ...incoming] : incoming));
        if (!opts.append && incoming.length > 0) {
          prefetchImageUrls(
            incoming.slice(0, 16).map((i) => i.poster),
            { limit: 16, kind: activeKind === 'live' ? 'square' : 'poster' }
          );
        }
      } catch (err) {
        if (!cached) {
          const isQueryErr = err instanceof Error && err.message === 'catalog_error';
          setCatalogError(
            isQueryErr
              ? pickLang(lang, {
                  es: 'No se pudo consultar el catálogo de servidores.',
                  ca: 'No s’ha pogut consultar el catàleg de servidors.',
                  en: 'Could not query provider catalog.',
                })
              : pickLang(lang, {
                  es: 'Error de red cargando canales, películas y series.',
                  ca: 'Error de xarxa carregant canals, pel·lícules i sèries.',
                  en: 'Network error loading live TV, movies and series.',
                })
          );
        }
      } finally {
        setLoadingCatalog(false);
        setLoadingMore(false);
      }
    },
    [
      scope,
      activeKind,
      categoryId,
      langFilter,
      qualityFilter,
      priorityMode,
      isGroupedMode,
      debouncedQuery,
      lang,
    ]
  );

  useEffect(() => {
    void fetchCatalogPage({ offset: 0, append: false });
  }, [fetchCatalogPage]);

  const handleRefreshAll = async () => {
    if (refreshing) return;
    triggerHaptic('light');
    setRefreshing(true);
    try {
      const url =
        scope === 'total'
          ? '/api/providers/refresh'
          : `/api/providers/refresh?providerId=${encodeURIComponent(scope)}`;
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        queryClient.setQueryData(catalogQueryKeys.providersStatus(), json);
      } else {
        await refetchStatus();
      }
      await queryClient.invalidateQueries({ queryKey: ['providers', 'catalog'] });
      await fetchCatalogPage({ offset: 0, append: false, forceFresh: true });
    } finally {
      setRefreshing(false);
    }
  };

  const activeProvider = useMemo(
    () => statusData?.providers.find((p) => p.id === scope) || null,
    [statusData, scope]
  );

  const scopeCounts = useMemo(() => {
    if (activeProvider) {
      return {
        live: activeProvider.liveCount,
        movie: activeProvider.movieCount,
        series: activeProvider.seriesCount,
        total: activeProvider.totalCount,
      };
    }
    return {
      live: statusData?.totals.liveCount ?? 0,
      movie: statusData?.totals.movieCount ?? 0,
      series: statusData?.totals.seriesCount ?? 0,
      total: statusData?.totals.totalCount ?? 0,
    };
  }, [activeProvider, statusData]);

  const availableCategories = useMemo<ProviderCategoryPublic[]>(() => {
    if (!activeProvider || activeKind === 'all') return [];
    if (activeKind === 'live') return activeProvider.liveCategories;
    if (activeKind === 'movie') return activeProvider.movieCategories;
    return activeProvider.seriesCategories;
  }, [activeProvider, activeKind]);

  const handleSelectScope = (nextScope: string) => {
    triggerHaptic('light');
    setScope(nextScope);
    setCategoryId('all');
  };

  const handleSelectKind = (nextKind: ProviderMediaKind | 'all') => {
    triggerHaptic('light');
    setActiveKind(nextKind);
    setCategoryId('all');
  };

  const handlePlayItemWithAlternative = (
    item: ProviderCatalogItemPublic,
    selectedAltIndex = 0
  ) => {
    triggerHaptic('medium');
    setAlternativesItem(null);

    const tracks = buildTracksFromItem(item);
    const safeIdx = Math.max(0, Math.min(selectedAltIndex, tracks.length - 1));
    const chosenTrack = tracks[safeIdx];
    const displayTitle = item.cleanTitle || item.name;
    const chosenQuality = chosenTrack?.quality || item.quality || 'HD';
    const chosenLang = chosenTrack?.lang || item.lang || 'ES';
    const chosenProviderName = chosenTrack?.providerName || item.providerName;

    if (item.kind === 'live') {
      const ch: SpanishTdtChannel = {
        id: item.id,
        dial: 900,
        name: displayTitle,
        shortMark: makeMonogram(displayTitle),
        brandTone: '#7C3AED',
        network: `${chosenProviderName} · ${item.categoryName}`,
        category: 'belix_live',
        quality: chosenQuality,
        logoUrl: item.poster,
        description: `${chosenProviderName} · ${item.categoryName}`,
        channels: tracks.map((tr) => ({
          id: tr.id,
          label: tr.label,
          lang: tr.lang,
          langLabel: tr.langLabel,
          quality: tr.quality,
          providerId: tr.providerId,
          providerName: tr.providerName,
          sourceUrl: tr.sourceUrl,
          resolverType: tr.resolverType,
        })),
      };
      onPlayTdtChannel(ch, safeIdx);
      return;
    }

    if (item.kind === 'movie') {
      const targetUrl = chosenTrack?.sourceUrl || item.streamUrl;
      onPlayCustomUrl(targetUrl, {
        title: displayTitle,
        subtitle: [
          chosenProviderName,
          chosenTrack?.langLabel || item.langLabel || chosenLang,
          chosenQuality,
          item.year,
        ]
          .filter(Boolean)
          .join(' · '),
        poster: item.poster,
        tracks,
        lang: chosenLang,
        quality: chosenQuality,
        year: item.year,
      });
      return;
    }

    const chosenAlt =
      Array.isArray(item.alternatives) && item.alternatives[safeIdx]
        ? item.alternatives[safeIdx]
        : null;
    setSelectedSeries({
      providerId: chosenAlt?.providerId || item.providerId,
      seriesId: chosenAlt?.streamId || item.streamId,
      title: chosenAlt?.name || displayTitle,
      poster: item.poster,
    });
  };

  const handlePlaySeriesEpisode = (
    detail: ProviderSeriesDetailPublic,
    episode: ProviderSeriesEpisodePublic
  ) => {
    setSelectedSeries(null);
    onPlayCustomUrl(episode.streamUrl, {
      title: `${detail.title} · T${episode.season}E${episode.episodeNum}`,
      subtitle: `${detail.providerName} · ${episode.title}`,
      poster: episode.still || detail.poster,
    });
  };

  const providersList = statusData?.providers || [];
  const connectedCount = statusData?.totals.connectedCount ?? 0;
  const totalProviders = statusData?.totals.totalProviders ?? 11;

  return (
    <div className="w-full space-y-4">
      {/* HEADER SUMMARY & PRIORITY CONTROL DECK */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight">
              {activeProvider
                ? `${activeProvider.name} · TV, Cine y Series`
                : pickLang(lang, {
                    es: 'Centro Multi-Servidor · TV, Cine y Series',
                    ca: 'Centre Multi-Servidor · TV, Cinema i Sèries',
                    en: 'Multi-Server Hub · TV, Movies & Series',
                  })}
            </h1>
            <p className="text-xs sm:text-[13px] text-zinc-400">
              {pickLang(lang, {
                es: 'Catálogos fusionados automáticamente con conmutación instantánea de servidores, calidades 4K/FHD e idioma real.',
                ca: 'Catàlegs fusionats automàticament amb commutació instantània de servidors, qualitats 4K/FHD i idioma real.',
                en: 'Auto-merged catalogs with instant server failover, verified 4K/FHD tiers and accurate audio tags.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 tabular-nums">
              <span>
                <strong className="text-emerald-400 font-bold">
                  {connectedCount}/{totalProviders}
                </strong>{' '}
                {pickLang(lang, { es: 'activos', ca: 'actius', en: 'online' })}
              </span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>
                <strong className="text-white font-bold">{scopeCounts.live.toLocaleString()}</strong> TV
              </span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>
                <strong className="text-white font-bold">{scopeCounts.movie.toLocaleString()}</strong>{' '}
                {pickLang(lang, { es: 'pelis', ca: 'pel·lis', en: 'movies' })}
              </span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>
                <strong className="text-white font-bold">{scopeCounts.series.toLocaleString()}</strong> series
              </span>
            </div>

            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              disabled={refreshing}
              className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>
                {pickLang(lang, {
                  es: 'Reconectar',
                  ca: 'Reconnectar',
                  en: 'Reconnect',
                })}
              </span>
            </button>
          </div>
        </div>

        {/* GLOBAL PRIORITY SWITCH + INLINE SEARCH BAR */}
        <div className="flex flex-col md:flex-row md:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inlineQuery}
              onChange={(e) => setInlineQuery(e.target.value)}
              placeholder={pickLang(lang, {
                es: 'Buscar canal, película o serie entre todos los servidores...',
                ca: 'Cercar canal, pel·lícula o sèrie entre tots els servidors...',
                en: 'Search channel, movie or series across all servers...',
              })}
              className="w-full min-h-11 pl-10 pr-10 rounded-xl bg-[#14141C] border border-white/[0.08] focus:border-[#7C3AED] text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors"
            />
            {inlineQuery && (
              <button
                type="button"
                onClick={() => setInlineQuery('')}
                aria-label={pickLang(lang, { es: 'Limpiar búsqueda', ca: 'Netejar cerca', en: 'Clear search' })}
                className="min-w-10 min-h-10 rounded-lg hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label={pickLang(lang, {
              es: 'Prioridad de servidor y calidad',
              ca: 'Prioritat de servidor i qualitat',
              en: 'Server & quality priority',
            })}
            className="grid grid-cols-2 p-1 rounded-xl bg-[#08080C] border border-white/[0.08] shrink-0"
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPriorityMode('es_quality');
              }}
              className={`min-h-11 px-3 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                priorityMode === 'es_quality'
                  ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>
                {pickLang(lang, {
                  es: 'Castellano · Mejor Calidad',
                  ca: 'Castellà · Millor Qualitat',
                  en: 'Spanish · Best Quality',
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setPriorityMode('best_quality');
              }}
              className={`min-h-11 px-3 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                priorityMode === 'best_quality'
                  ? 'bg-emerald-500/90 text-black shadow-[0_4px_14px_rgba(16,185,129,0.28)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Máxima Calidad 4K',
                  ca: 'Màxima Qualitat 4K',
                  en: 'Max Quality 4K',
                })}
              </span>
            </button>
          </div>
        </div>

        {/* SERVER SECTIONS: CATÁLOGO TOTAL + INDIVIDUAL SERVERS */}
        <div
          role="tablist"
          aria-label={pickLang(lang, {
            es: 'Servidores disponibles',
            ca: 'Servidors disponibles',
            en: 'Available servers',
          })}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'total'}
            onClick={() => handleSelectScope('total')}
            className={`min-h-11 px-3.5 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-all cursor-pointer tabular-nums ${
              scope === 'total'
                ? 'bg-[#7C3AED] border-[#8B5CF6] text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                : 'bg-[#14141C] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>
              {pickLang(lang, {
                es: 'Todos fusionados',
                ca: 'Tots fusionats',
                en: 'All merged',
              })}
            </span>
            <span className="opacity-75">({(statusData?.totals.totalCount ?? 0).toLocaleString()})</span>
          </button>

          {providersList.map((prov) => {
            const isSelected = scope === prov.id;
            const iconColorClass = isSelected
              ? 'text-black'
              : prov.connecting
              ? 'text-amber-400'
              : prov.connected
              ? 'text-emerald-400'
              : 'text-zinc-500';
            return (
              <button
                key={prov.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectScope(prov.id)}
                className={`min-h-11 px-3.5 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-all cursor-pointer tabular-nums ${
                  isSelected
                    ? 'bg-white text-black border-white shadow-md'
                    : 'bg-[#14141C] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                <Server className={`w-3.5 h-3.5 shrink-0 ${iconColorClass}`} />
                <span>{prov.name}</span>
                <span className="opacity-70">
                  {prov.connecting ? '...' : `(${prov.totalCount.toLocaleString()})`}
                </span>
              </button>
            );
          })}
        </div>

        {/* MEDIA KIND FILTER TABS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              {
                id: 'all',
                label: pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'All' }),
                count: scopeCounts.total,
                icon: Layers,
              },
              {
                id: 'live',
                label: pickLang(lang, { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' }),
                count: scopeCounts.live,
                icon: Radio,
              },
              {
                id: 'movie',
                label: pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' }),
                count: scopeCounts.movie,
                icon: Film,
              },
              {
                id: 'series',
                label: pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' }),
                count: scopeCounts.series,
                icon: Clapperboard,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const selected = activeKind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectKind(tab.id)}
                className={`min-h-11 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-2 transition-all cursor-pointer tabular-nums ${
                  selected
                    ? 'bg-[#1C1C26] border-[#7C3AED]/70 text-white'
                    : 'bg-[#08080C] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                <span className="text-[11px] opacity-70">{tab.count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {/* LANGUAGE & QUALITY FILTERS */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Idioma">
            {(
              [
                { id: 'all', label: pickLang(lang, { es: 'Todos los idiomas', ca: 'Tots els idiomes', en: 'All languages' }) },
                { id: 'ES', label: pickLang(lang, { es: 'Castellano (ES)', ca: 'Castellà (ES)', en: 'Castellano (ES)' }) },
                { id: 'LAT', label: 'Latino' },
                { id: 'VOSE', label: 'VOSE' },
                { id: 'EN', label: 'English (EN)' },
                { id: 'CAT', label: 'Català' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setLangFilter(opt.id);
                }}
                className={`min-h-11 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  langFilter === opt.id
                    ? 'bg-[#7C3AED]/25 border-[#7C3AED] text-white'
                    : 'bg-[#14141C] border-white/[0.07] text-zinc-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Calidad">
            {(
              [
                { id: 'all', label: pickLang(lang, { es: 'Todas las calidades', ca: 'Totes les qualitats', en: 'All qualities' }) },
                { id: '4K', label: '4K UHD' },
                { id: '1080p', label: '1080p FHD' },
                { id: 'HD', label: 'HD' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setQualityFilter(opt.id);
                }}
                className={`min-h-11 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  qualityFilter === opt.id
                    ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-100'
                    : 'bg-[#14141C] border-white/[0.07] text-zinc-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* CATEGORY FILTER WHEN VIEWING SPECIFIC SERVER & KIND */}
        {availableCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className={`min-h-11 px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                categoryId === 'all'
                  ? 'bg-[#7C3AED]/25 border-[#7C3AED] text-white'
                  : 'bg-[#14141C] border-white/[0.07] text-zinc-300 hover:text-white'
              }`}
            >
              {pickLang(lang, { es: 'Todas las categorías', ca: 'Totes les categories', en: 'All categories' })}
            </button>
            {availableCategories.slice(0, 40).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`min-h-11 px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer transition-colors tabular-nums ${
                  categoryId === cat.id
                    ? 'bg-[#7C3AED]/25 border-[#7C3AED] text-white'
                    : 'bg-[#14141C] border-white/[0.07] text-zinc-300 hover:text-white'
                }`}
              >
                {cat.name} ({cat.count})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RESULTS AREA */}
      {activeProvider && !activeProvider.connected && !activeProvider.connecting && activeProvider.error && (
        <div className="rounded-2xl bg-[#14141C] border border-amber-500/30 p-4 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="truncate">
              {activeProvider.name}: {activeProvider.error}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            className="min-h-11 px-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-semibold shrink-0 cursor-pointer"
          >
            {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
          </button>
        </div>
      )}

      {loadingCatalog && items.length === 0 ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] py-16 flex flex-col items-center justify-center gap-3 text-sm text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-[#A78BFA]" />
          <span>
            {loadingStatus
              ? pickLang(lang, {
                  es: 'Conectando servidores y sincronizando listas...',
                  ca: 'Connectant servidors i sincronitzant llistes...',
                  en: 'Connecting servers and syncing catalogs...',
                })
              : pickLang(lang, {
                  es: 'Ordenando mejores calidades y servidores...',
                  ca: 'Ordenant millors qualitats i servidors...',
                  en: 'Ranking best quality & servers...',
                })}
          </span>
        </div>
      ) : catalogError ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-rose-500/30 p-8 text-center space-y-3">
          <p className="text-sm text-rose-300">{catalogError}</p>
          <button
            type="button"
            onClick={() => void fetchCatalogPage({ offset: 0, append: false })}
            className="min-h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white cursor-pointer"
          >
            {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-10 text-center space-y-2">
          <Tv className="w-8 h-8 text-zinc-500 mx-auto" />
          <p className="text-sm font-semibold text-zinc-200">
            {pickLang(lang, {
              es: 'Sin resultados para este filtro',
              ca: 'Sense resultats per a aquest filtre',
              en: 'No items match this filter',
            })}
          </p>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Prueba otro término de búsqueda o cambia idioma/calidad.',
              ca: 'Prova un altre terme de cerca o canvia idioma/qualitat.',
              en: 'Try another search query or change language/quality filters.',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {items.map((item) => {
              const isLive = item.kind === 'live';
              const displayTitle = item.cleanTitle || item.name;
              const altCount = Array.isArray(item.alternatives) ? item.alternatives.length : 1;
              const serverCountLabel =
                altCount > 1
                  ? pickLang(lang, {
                      es: `${altCount} servidores`,
                      ca: `${altCount} servidors`,
                      en: `${altCount} servers`,
                    })
                  : item.providerName;

              return (
                <div
                  key={item.id}
                  className="group rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.07] hover:border-[#7C3AED]/60 overflow-hidden flex flex-col transition-all"
                >
                  <button
                    type="button"
                    data-tv-focusable="true"
                    onClick={() => handlePlayItemWithAlternative(item, 0)}
                    className="flex-1 flex flex-col text-left cursor-pointer tv-focus-ring"
                  >
                    <div
                      className={`relative w-full ${
                        isLive ? 'aspect-video bg-[#08090F]' : 'aspect-[2/3] bg-[#12121A]'
                      } flex items-center justify-center overflow-hidden`}
                    >
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={displayTitle}
                          loading="lazy"
                          decoding="async"
                          className={`w-full h-full ${
                            isLive ? 'object-contain p-3' : 'object-cover'
                          } group-hover:scale-[1.03] transition-transform duration-200`}
                        />
                      ) : (
                        <span className="font-display font-bold text-xl tracking-wider text-zinc-500">
                          {makeMonogram(displayTitle)}
                        </span>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2.5">
                        <span className="w-9 h-9 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                      <p className="text-xs sm:text-[13px] font-semibold text-white line-clamp-2 leading-snug">
                        {displayTitle}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                        {[
                          item.quality || 'HD',
                          item.langLabel || item.lang || 'ES',
                          serverCountLabel,
                          item.year,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </button>

                  {altCount > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setAlternativesItem(item);
                      }}
                      className="w-full min-h-11 px-2.5 border-t border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.07] text-[11px] font-semibold text-[#C4B5FD] hover:text-white flex items-center justify-between gap-1 cursor-pointer transition-colors tabular-nums"
                    >
                      <span>
                        {pickLang(lang, {
                          es: `Opciones (${altCount})`,
                          ca: `Opcions (${altCount})`,
                          en: `Sources (${altCount})`,
                        })}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {items.length < totalItems && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void fetchCatalogPage({ offset: items.length, append: true })}
                className="min-h-11 px-6 rounded-xl bg-[#14141C] hover:bg-[#1C1C26] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition-colors tabular-nums"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {pickLang(lang, {
                    es: `Mostrar más (${items.length.toLocaleString()} / ${totalItems.toLocaleString()})`,
                    ca: `Mostrar-ne més (${items.length.toLocaleString()} / ${totalItems.toLocaleString()})`,
                    en: `Load more (${items.length.toLocaleString()} / ${totalItems.toLocaleString()})`,
                  })}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* OBSIDIAN BOTTOM SHEET: MULTI-SERVER ALTERNATIVES */}
      {alternativesItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alternativesItem.cleanTitle || alternativesItem.name}
          className="fixed inset-0 z-[125] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAlternativesItem(null);
          }}
        >
          <div className="w-full sm:max-w-xl max-h-[85dvh] rounded-t-3xl sm:rounded-3xl bg-[#0D0D12]/96 backdrop-blur-xl border-t sm:border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="pt-2.5 sm:hidden flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-3 pb-3.5 border-b border-white/[0.08]">
              <div className="min-w-0 space-y-1">
                <h2 className="font-display font-bold text-base sm:text-lg text-white leading-tight truncate">
                  {alternativesItem.cleanTitle || alternativesItem.name}
                </h2>
                <p className="text-xs text-zinc-400 tabular-nums">
                  {pickLang(lang, {
                    es:
                      priorityMode === 'best_quality'
                        ? 'Ordenado por máxima calidad (4K / FHD) entre servidores'
                        : 'Ordenado por Castellano + mejor calidad entre servidores',
                    ca:
                      priorityMode === 'best_quality'
                        ? 'Ordenat per màxima qualitat (4K / FHD) entre servidors'
                        : 'Ordenat per Castellà + millor qualitat entre servidors',
                    en:
                      priorityMode === 'best_quality'
                        ? 'Sorted by highest quality (4K / FHD) across servers'
                        : 'Sorted by Spanish + highest quality across servers',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlternativesItem(null)}
                aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
                className="min-w-11 min-h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2 custom-scrollbar">
              {(alternativesItem.alternatives || []).map((alt, idx) => (
                <button
                  key={`${alt.id}-${idx}`}
                  type="button"
                  onClick={() => handlePlayItemWithAlternative(alternativesItem, idx)}
                  className={`w-full min-h-12 p-3 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                    idx === 0
                      ? 'bg-[#7C3AED]/16 border-[#7C3AED]/70 hover:bg-[#7C3AED]/24'
                      : 'bg-[#14141C] border-white/[0.07] hover:bg-[#1C1C26] hover:border-white/20'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-white truncate">
                        {alt.providerName}
                      </span>
                      {idx === 0 && (
                        <span className="text-[11px] font-semibold text-[#C4B5FD] shrink-0">
                          · {pickLang(lang, { es: 'Recomendado', ca: 'Recomanat', en: 'Best match' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 truncate">{alt.name}</p>
                    <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                      {[alt.quality, alt.langLabel || alt.lang, alt.categoryName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <span className="min-w-10 min-h-10 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedSeries && (
        <ProvidersSeriesModal
          lang={lang}
          providerId={selectedSeries.providerId}
          seriesId={selectedSeries.seriesId}
          initialTitle={selectedSeries.title}
          initialPoster={selectedSeries.poster}
          onClose={() => setSelectedSeries(null)}
          onPlayEpisode={handlePlaySeriesEpisode}
        />
      )}
    </div>
  );
};
