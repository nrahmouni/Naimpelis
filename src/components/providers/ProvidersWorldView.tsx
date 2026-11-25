import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clapperboard,
  Film,
  Layers,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Server,
  Tv,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
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
    meta?: { title?: string; subtitle?: string; poster?: string }
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

  const {
    data: statusData = null,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = useProvidersStatusQuery(true);
  const [refreshing, setRefreshing] = useState(false);

  const [categoryId, setCategoryId] = useState<string>('all');
  const [langFilter, setLangFilter] = useState<'ES' | 'all' | 'LAT' | 'VOSE'>('ES');
  const [qualityFilter, setQualityFilter] = useState<'all' | '4K' | '1080p' | 'HD'>('all');
  const [items, setItems] = useState<ProviderCatalogItemPublic[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedSeries, setSelectedSeries] = useState<{
    providerId: string;
    seriesId: string;
    title: string;
    poster?: string;
  } | null>(null);

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

  const fetchCatalogPage = useCallback(
    async (opts: { offset: number; append: boolean; forceFresh?: boolean }) => {
      const trimmedQ = externalSearchQuery.trim();
      const queryParams = {
        scope,
        kind: activeKind,
        offset: opts.offset,
        limit: PAGE_SIZE,
        categoryId: categoryId || 'all',
        lang: langFilter || 'all',
        quality: qualityFilter || 'all',
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
    [scope, activeKind, categoryId, langFilter, qualityFilter, externalSearchQuery, lang]
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

  const handlePlayItem = (item: ProviderCatalogItemPublic) => {
    triggerHaptic('medium');
    const resolvedQuality = item.quality || 'HD';
    const resolvedLang = item.lang || 'ES';
    if (item.kind === 'live') {
      const ch: SpanishTdtChannel = {
        id: item.id,
        dial: 900,
        name: item.name,
        shortMark: makeMonogram(item.name),
        brandTone: '#7C3AED',
        network: `${item.providerName} · ${item.categoryName}`,
        category: 'belix_live',
        quality: resolvedQuality,
        logoUrl: item.poster,
        description: `${item.providerName} · ${item.categoryName}`,
        channels: [
          {
            id: `${item.id}-stream`,
            label: `${item.providerName} · ${resolvedQuality}`,
            lang: resolvedLang,
            quality: resolvedQuality,
            providerId: item.providerId,
            providerName: item.providerName,
            sourceUrl: item.streamUrl,
            resolverType: 'direct_hls',
          },
        ],
      };
      onPlayTdtChannel(ch, 0);
      return;
    }

    if (item.kind === 'movie') {
      onPlayCustomUrl(item.streamUrl, {
        title: item.name,
        subtitle: [item.providerName, item.langLabel || resolvedLang, resolvedQuality, item.year]
          .filter(Boolean)
          .join(' · '),
        poster: item.poster,
      });
      return;
    }

    setSelectedSeries({
      providerId: item.providerId,
      seriesId: item.streamId,
      title: item.name,
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
      {/* HEADER SUMMARY BAND */}
      <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight">
              {activeProvider
                ? `${activeProvider.name} · TV, Cine y Series`
                : pickLang(lang, {
                    es: 'Catálogo Total · Servidores Integrados',
                    ca: 'Catàleg Total · Servidors Integrats',
                    en: 'Full Catalog · Connected Servers',
                  })}
            </h1>
            <p className="text-xs sm:text-[13px] text-zinc-400">
              {pickLang(lang, {
                es: 'Conexión automática multi-servidor con rotación interna de cuentas y señal protegida.',
                ca: 'Connexió automàtica multiservidor amb rotació interna de comptes i senyal protegit.',
                en: 'Automatic multi-server connection with seamless account failover and protected playback.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300 tabular-nums">
              <span>
                <strong className="text-emerald-400 font-bold">{connectedCount}/{totalProviders}</strong>{' '}
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
              className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
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

        {/* SERVER SECTIONS: CATÁLOGO TOTAL + INDIVIDUAL SERVERS */}
        <div
          role="tablist"
          aria-label={pickLang(lang, {
            es: 'Servidores disponibles',
            ca: 'Servidors disponibles',
            en: 'Available servers',
          })}
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'total'}
            onClick={() => handleSelectScope('total')}
            className={`min-h-11 px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer tabular-nums ${
              scope === 'total'
                ? 'bg-[#7C3AED] border-[#8B5CF6] text-white shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                : 'bg-[#14141C] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>
              {pickLang(lang, {
                es: 'Catálogo Total',
                ca: 'Catàleg Total',
                en: 'Full Catalog',
              })}
            </span>
            <span className="opacity-75">({(statusData?.totals.totalCount ?? 0).toLocaleString()})</span>
          </button>

          {providersList.map((prov) => {
            const isSelected = scope === prov.id;
            return (
              <button
                key={prov.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectScope(prov.id)}
                className={`min-h-11 px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer tabular-nums ${
                  isSelected
                    ? 'bg-white text-black border-white shadow-md'
                    : 'bg-[#14141C] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    prov.connecting
                      ? 'bg-amber-400'
                      : prov.connected
                      ? 'bg-emerald-400'
                      : 'bg-zinc-500'
                  }`}
                />
                <Server className="w-3.5 h-3.5 shrink-0 opacity-75" />
                <span>{prov.name}</span>
                <span className="opacity-70">
                  {prov.connecting ? '...' : `(${prov.totalCount.toLocaleString()})`}
                </span>
              </button>
            );
          })}
        </div>

        {/* MEDIA KIND FILTER TABS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
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
                className={`min-h-11 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer tabular-nums ${
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

        {/* LANGUAGE & QUALITY PRIORITY FILTERS */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Idioma">
            {(
              [
                { id: 'ES', label: pickLang(lang, { es: 'Castellano (ES)', ca: 'Castellà (ES)', en: 'Castellano (ES)' }) },
                { id: 'all', label: pickLang(lang, { es: 'Todos los idiomas', ca: 'Tots els idiomes', en: 'All languages' }) },
                { id: 'LAT', label: 'Latino' },
                { id: 'VOSE', label: 'VOSE / Sub' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setLangFilter(opt.id);
                }}
                className={`min-h-10 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  langFilter === opt.id
                    ? 'bg-[#7C3AED]/25 border-[#7C3AED] text-white'
                    : 'bg-[#14141C] border-white/[0.07] text-zinc-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Calidad">
            {(
              [
                { id: 'all', label: pickLang(lang, { es: 'Mejor calidad', ca: 'Millor qualitat', en: 'Best quality' }) },
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
                className={`min-h-10 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
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
              className={`min-h-9 px-3 rounded-lg text-xs font-medium shrink-0 border cursor-pointer transition-colors ${
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
                className={`min-h-9 px-3 rounded-lg text-xs font-medium shrink-0 border cursor-pointer transition-colors tabular-nums ${
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
            className="min-h-9 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-semibold shrink-0 cursor-pointer"
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
                  es: 'Cargando catálogo...',
                  ca: 'Carregant catàleg...',
                  en: 'Loading catalog...',
                })}
          </span>
        </div>
      ) : catalogError ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-rose-500/30 p-8 text-center space-y-3">
          <p className="text-sm text-rose-300">{catalogError}</p>
          <button
            type="button"
            onClick={() => void fetchCatalogPage({ offset: 0, append: false })}
            className="min-h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white cursor-pointer"
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
              es: 'Prueba otro término de búsqueda o pulsa Reconectar si un servidor acaba de arrancar.',
              ca: 'Prova un altre terme de cerca o prem Reconnectar.',
              en: 'Try another search query or click Reconnect.',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {items.map((item) => {
              const isLive = item.kind === 'live';
              return (
                <button
                  key={item.id}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => handlePlayItem(item)}
                  className="group rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.07] hover:border-[#7C3AED]/60 overflow-hidden flex flex-col text-left transition-all cursor-pointer tv-focus-ring"
                >
                  <div
                    className={`relative w-full ${
                      isLive ? 'aspect-video bg-[#08090F]' : 'aspect-[2/3] bg-[#12121A]'
                    } flex items-center justify-center overflow-hidden`}
                  >
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className={`w-full h-full ${
                          isLive ? 'object-contain p-3' : 'object-cover'
                        } group-hover:scale-[1.03] transition-transform duration-200`}
                      />
                    ) : (
                      <span className="font-display font-bold text-xl tracking-wider text-zinc-500">
                        {makeMonogram(item.name)}
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
                      {item.name}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                      {[
                        item.providerName,
                        item.langLabel || item.lang,
                        item.quality,
                        item.kind === 'live'
                          ? 'Directo'
                          : item.kind === 'series'
                          ? 'Serie'
                          : 'Cine',
                        item.year,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </button>
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
