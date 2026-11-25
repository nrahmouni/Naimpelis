/**
 * @module src/components/belix/XtreamServerWorldView
 * @description Dedicated streaming view for any preconfigured Xtream server in DEFAULT_PROVIDERS
 * (Shark Pro, VOD 4K, 24TV, 2M2H, Dana 4K Pro, Active CDNS, Octopus TV).
 * Loads exclusively that server's catalog via server-side proxy, renders Live / VOD / Series
 * in 40-item infinite/paginated batches, and never exposes URLs or credentials.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Server,
  Star,
  Tv,
  X,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import {
  XTREAM_PROVIDER_UI_SPECS,
  getXtreamProviderUiSpecByProviderId,
  type DefaultProviderEntry,
  type XtreamServerWorldId,
} from '../../config/defaultProviders';
import {
  fetchXtreamFullCatalog,
  fetchXtreamLiveStreams,
  fetchXtreamStatus,
  type XtreamFullCatalogPayload,
  type XtreamLiveStreamItem,
  type XtreamMaskedStatus,
  type XtreamSeriesItem,
  type XtreamVodStreamItem,
} from '../../services/xtreamClientService';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  XtreamEmptyBadgeIcon,
  XtreamPosterMedia,
  buildLiveTdtChannel,
  buildVodTdtChannel,
  formatXtreamRating,
} from './XtreamMediaHelpers';
import { XtreamVodDetailModal } from './XtreamVodDetailModal';
import { XtreamSeriesEpisodesModal } from './XtreamSeriesEpisodesModal';

const BATCH_SIZE = 40;

interface XtreamServerWorldViewProps {
  providerId: DefaultProviderEntry['id'];
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onSwitchServerWorld: (worldId: XtreamServerWorldId) => void;
}

export const XtreamServerWorldView: React.FC<XtreamServerWorldViewProps> = ({
  providerId,
  lang,
  externalSearchQuery = '',
  onPlayTdtChannel,
  onSwitchServerWorld,
}) => {
  const spec = useMemo(
    () =>
      getXtreamProviderUiSpecByProviderId(providerId) || XTREAM_PROVIDER_UI_SPECS[0],
    [providerId]
  );

  const [status, setStatus] = useState<XtreamMaskedStatus | null>(null);
  const [catalog, setCatalog] = useState<XtreamFullCatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'live' | 'vod' | 'series'>(
    spec.defaultMediaFocus
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(externalSearchQuery);
  const [visibleLimit, setVisibleLimit] = useState(BATCH_SIZE);

  const [testingFlow, setTestingFlow] = useState(false);
  const [flowCheckMessage, setFlowCheckMessage] = useState<string | null>(null);
  const [flowCheckOk, setFlowCheckOk] = useState<boolean>(true);

  const [selectedVodMovie, setSelectedVodMovie] = useState<XtreamVodStreamItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<XtreamSeriesItem | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const initialFocusAppliedForRef = useRef<string | null>(null);

  useEffect(() => {
    setSearchQuery(externalSearchQuery);
  }, [externalSearchQuery]);

  const loadServer = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setSyncing(true);
      else setLoading(true);
      setErrorMsg(null);

      try {
        const [nextStatus, catRes] = await Promise.all([
          fetchXtreamStatus(forceRefresh, providerId),
          fetchXtreamFullCatalog(forceRefresh, providerId),
        ]);
        setStatus(nextStatus);

        if (catRes.ok && catRes.catalog) {
          setCatalog(catRes.catalog);
          if (initialFocusAppliedForRef.current !== providerId) {
            initialFocusAppliedForRef.current = providerId;
            if (
              spec.defaultMediaFocus === 'vod' ||
              (catRes.catalog.counts.liveStreams === 0 && catRes.catalog.counts.vodStreams > 0)
            ) {
              setActiveTab('vod');
            } else if (
              catRes.catalog.counts.liveStreams === 0 &&
              catRes.catalog.counts.vodStreams === 0 &&
              catRes.catalog.counts.series > 0
            ) {
              setActiveTab('series');
            } else {
              setActiveTab(spec.defaultMediaFocus);
            }
          }
        } else {
          setCatalog(null);
          setErrorMsg(
            catRes.error ||
              nextStatus.error ||
              pickLang(lang, {
                es: `No se pudo sincronizar el catálogo de ${spec.name}.`,
                ca: `No s'ha pogut sincronitzar el catàleg de ${spec.name}.`,
                en: `Could not sync ${spec.name} catalog.`,
              })
          );
        }
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [providerId, spec.defaultMediaFocus, spec.name, lang]
  );

  useEffect(() => {
    initialFocusAppliedForRef.current = null;
    setActiveTab(spec.defaultMediaFocus);
    setSelectedCategoryId('all');
    setVisibleLimit(BATCH_SIZE);
    setFlowCheckMessage(null);
    setSelectedVodMovie(null);
    setSelectedSeries(null);
    void loadServer(false);
  }, [providerId, spec.defaultMediaFocus, loadServer]);

  useEffect(() => {
    const onVaultUpdated = () => {
      void loadServer(true);
    };
    window.addEventListener('xtream-vault-updated', onVaultUpdated);
    return () => window.removeEventListener('xtream-vault-updated', onVaultUpdated);
  }, [loadServer]);

  useEffect(() => {
    setSelectedCategoryId('all');
    setVisibleLimit(BATCH_SIZE);
  }, [activeTab]);

  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
  }, [selectedCategoryId, searchQuery]);

  const handleTestFlow = async () => {
    triggerHaptic('medium');
    setTestingFlow(true);
    setFlowCheckMessage(null);
    try {
      const [freshStatus, liveProbe] = await Promise.all([
        fetchXtreamStatus(true, providerId),
        fetchXtreamLiveStreams(undefined, providerId).catch(() => ({
          ok: false,
          streams: [] as XtreamLiveStreamItem[],
        })),
      ]);
      setStatus(freshStatus);

      if (!freshStatus.connected) {
        setFlowCheckOk(false);
        setFlowCheckMessage(
          freshStatus.error ||
            pickLang(lang, {
              es: 'Sin respuesta del servidor en este momento.',
              ca: 'Sense resposta del servidor en aquest moment.',
              en: 'No response from server right now.',
            })
        );
        return;
      }

      const acctLabel =
        freshStatus.accountNumber && freshStatus.totalAccounts > 0
          ? `Cuenta activa ${freshStatus.accountNumber}/${freshStatus.totalAccounts}`
          : 'Cuenta activa';
      const streamCount = liveProbe.ok ? liveProbe.streams.length : catalog?.counts.liveStreams || 0;
      const vodCount = catalog?.counts.vodStreams || 0;

      setFlowCheckOk(true);
      if (streamCount > 0) {
        setFlowCheckMessage(
          `Flujo verificado · ${acctLabel} · ${streamCount.toLocaleString('es-ES')} señales listas`
        );
      } else {
        setFlowCheckMessage(
          `Flujo verificado · ${acctLabel} · ${vodCount.toLocaleString('es-ES')} títulos bajo demanda listos`
        );
      }
    } finally {
      setTestingFlow(false);
    }
  };

  const activeCategoryList = useMemo(() => {
    if (!catalog) return [];
    if (activeTab === 'live') return catalog.liveCategories;
    if (activeTab === 'vod') return catalog.vodCategories;
    return catalog.seriesCategories;
  }, [catalog, activeTab]);

  const liveCategoryNames = useMemo(
    () => new Map((catalog?.liveCategories || []).map((c) => [c.id, c.name])),
    [catalog]
  );
  const vodCategoryNames = useMemo(
    () => new Map((catalog?.vodCategories || []).map((c) => [c.id, c.name])),
    [catalog]
  );
  const seriesCategoryNames = useMemo(
    () => new Map((catalog?.seriesCategories || []).map((c) => [c.id, c.name])),
    [catalog]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredLive = useMemo(() => {
    const list = catalog?.liveStreams || [];
    return list.filter((item) => {
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!normalizedQuery) return true;
      const cat = (liveCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        String(item.num).includes(normalizedQuery) ||
        cat.includes(normalizedQuery)
      );
    });
  }, [catalog, selectedCategoryId, normalizedQuery, liveCategoryNames]);

  const filteredVod = useMemo(() => {
    const list = catalog?.vodStreams || [];
    return list.filter((item) => {
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!normalizedQuery) return true;
      const cat = (vodCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        cat.includes(normalizedQuery)
      );
    });
  }, [catalog, selectedCategoryId, normalizedQuery, vodCategoryNames]);

  const filteredSeries = useMemo(() => {
    const list = catalog?.series || [];
    return list.filter((item) => {
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!normalizedQuery) return true;
      const cat = (seriesCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        (item.genre || '').toLowerCase().includes(normalizedQuery) ||
        cat.includes(normalizedQuery)
      );
    });
  }, [catalog, selectedCategoryId, normalizedQuery, seriesCategoryNames]);

  const activeItemsLength =
    activeTab === 'live'
      ? filteredLive.length
      : activeTab === 'vod'
        ? filteredVod.length
        : filteredSeries.length;

  const hasMoreItems = activeItemsLength > visibleLimit;
  const remainingItemsCount = Math.max(0, activeItemsLength - visibleLimit);

  // Automatic 40-by-40 batch expansion via IntersectionObserver
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMoreItems || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleLimit((prev) => prev + BATCH_SIZE);
        }
      },
      { rootMargin: '320px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreItems, activeTab, visibleLimit]);

  const handlePlayLive = (item: XtreamLiveStreamItem) => {
    triggerHaptic('medium');
    const catName = liveCategoryNames.get(item.categoryId) || 'Directo';
    onPlayTdtChannel(buildLiveTdtChannel(item, catName, spec.accent), 0);
  };

  const handleQuickPlayVod = (item: XtreamVodStreamItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const catName = vodCategoryNames.get(item.categoryId) || 'Películas';
    onPlayTdtChannel(buildVodTdtChannel(item, catName, spec.accent), 0);
  };

  const isConnected = Boolean(status?.connected || catalog);
  const liveCount = catalog?.counts.liveStreams ?? 0;
  const vodCount = catalog?.counts.vodStreams ?? 0;
  const seriesCount = catalog?.counts.series ?? 0;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 pb-8">
      {/* 7-SERVER QUICK SWITCHER STRIP */}
      <nav
        aria-label={pickLang(lang, {
          es: 'Cambiar de servidor dedicado',
          ca: 'Canviar de servidor dedicat',
          en: 'Switch dedicated server',
        })}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
      >
        {XTREAM_PROVIDER_UI_SPECS.map((srv) => {
          const active = srv.providerId === spec.providerId;
          return (
            <button
              key={`srv-nav-${srv.worldId}`}
              type="button"
              onClick={() => {
                if (!active) {
                  triggerHaptic('light');
                  onSwitchServerWorld(srv.worldId);
                }
              }}
              aria-current={active ? 'page' : undefined}
              className={`min-h-11 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                active
                  ? 'text-white border-white/25'
                  : 'bg-[#0D0D12] border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              style={
                active
                  ? {
                      backgroundColor: `${srv.accent}24`,
                      borderColor: `${srv.accent}80`,
                    }
                  : undefined
              }
            >
              <Server
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: active ? srv.accent : undefined }}
              />
              <span>{srv.name}</span>
            </button>
          );
        })}
      </nav>

      {/* SERVER HEADER CARD */}
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                {spec.name}
              </h1>

              {loading && !isConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                  <span>Verificando</span>
                </span>
              ) : isConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Conectado</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Sin conexión</span>
                </span>
              )}
            </div>

            <p className="text-xs sm:text-[13px] text-zinc-400 max-w-2xl">
              {spec.tagline}
            </p>
          </div>

          {/* QUICK ACTIONS */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleTestFlow()}
              disabled={testingFlow}
              className="min-h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.1] text-xs font-semibold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {testingFlow ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: spec.accent }} />
              ) : (
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Probar flujo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                void loadServer(true);
              }}
              disabled={loading || syncing}
              className="min-h-11 px-4 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: spec.accent }}
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Actualizar catálogo</span>
            </button>
          </div>
        </div>

        {/* 3 CLEAN TABULAR-NUMS COUNTERS */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="rounded-2xl bg-black/50 border border-white/[0.06] px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-zinc-400 truncate">Canales en Vivo</p>
            <p className="text-lg sm:text-xl font-display font-extrabold text-white tabular-nums mt-0.5">
              {liveCount.toLocaleString('es-ES')}
            </p>
          </div>
          <div className="rounded-2xl bg-black/50 border border-white/[0.06] px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-zinc-400 truncate">Películas</p>
            <p className="text-lg sm:text-xl font-display font-extrabold text-white tabular-nums mt-0.5">
              {vodCount.toLocaleString('es-ES')}
            </p>
          </div>
          <div className="rounded-2xl bg-black/50 border border-white/[0.06] px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-zinc-400 truncate">Series</p>
            <p className="text-lg sm:text-xl font-display font-extrabold text-white tabular-nums mt-0.5">
              {seriesCount.toLocaleString('es-ES')}
            </p>
          </div>
        </div>

        {/* FLOW TEST INLINE FEEDBACK */}
        {flowCheckMessage && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 border ${
              flowCheckOk
                ? 'bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-200'
                : 'bg-amber-500/[0.08] border-amber-500/25 text-amber-200'
            }`}
          >
            <span className="truncate tabular-nums">{flowCheckMessage}</span>
            <button
              type="button"
              onClick={() => setFlowCheckMessage(null)}
              aria-label="Cerrar verificación"
              className="text-zinc-400 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* BODY: LOADING / ERROR / CATALOG */}
      {loading && !catalog ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-8 flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: spec.accent }} />
          <p className="text-xs sm:text-sm font-semibold text-zinc-200">
            Sincronizando catálogo completo de {spec.name}...
          </p>
        </div>
      ) : errorMsg && !catalog ? (
        <div className="rounded-[24px] bg-[#0D0D12] border border-amber-500/30 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white">
                {spec.name} no respondió en este intento
              </h2>
              <p className="text-xs text-zinc-400">{errorMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadServer(true)}
            className="min-h-11 px-4 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer shrink-0"
            style={{ backgroundColor: spec.accent }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar</span>
          </button>
        </div>
      ) : catalog ? (
        <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
          {/* 3 SUB-TABS + INSTANT SEARCH */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label={`Contenido de ${spec.name}`}
              className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black border border-white/[0.08] w-full md:w-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'live'}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab('live');
                }}
                className={`min-h-11 px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors tabular-nums ${
                  activeTab === 'live'
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                style={activeTab === 'live' ? { backgroundColor: spec.accent } : undefined}
              >
                <Tv className="w-3.5 h-3.5 shrink-0" />
                <span>TV en Vivo ({liveCount.toLocaleString('es-ES')})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'vod'}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab('vod');
                }}
                className={`min-h-11 px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors tabular-nums ${
                  activeTab === 'vod'
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                style={activeTab === 'vod' ? { backgroundColor: spec.accent } : undefined}
              >
                <Film className="w-3.5 h-3.5 shrink-0" />
                <span>Películas ({vodCount.toLocaleString('es-ES')})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'series'}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab('series');
                }}
                className={`min-h-11 px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors tabular-nums ${
                  activeTab === 'series'
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                style={activeTab === 'series' ? { backgroundColor: spec.accent } : undefined}
              >
                <Clapperboard className="w-3.5 h-3.5 shrink-0" />
                <span>Series ({seriesCount.toLocaleString('es-ES')})</span>
              </button>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Buscar en ${spec.name}...`}
                className="min-h-11 w-full rounded-xl bg-black/70 border border-white/[0.1] pl-10 pr-8 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/35"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* CATEGORY FILTER BAR */}
          {activeCategoryList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`min-h-11 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border cursor-pointer transition-colors tabular-nums ${
                  selectedCategoryId === 'all'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                Todas ({activeItemsLength.toLocaleString('es-ES')})
              </button>
              {activeCategoryList.map((cat) => {
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={`${cat.type}-${cat.id}`}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedCategoryId(cat.id);
                    }}
                    className={`min-h-11 px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                      active
                        ? 'bg-white text-black border-white font-semibold'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* SUB-TAB 1: TV EN VIVO */}
          {activeTab === 'live' && (
            filteredLive.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredLive.slice(0, visibleLimit).map((item) => (
                  <div
                    key={`live-${providerId}-${item.streamId}`}
                    className="rounded-2xl bg-black/55 border border-white/[0.08] hover:border-white/25 p-3 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden shrink-0 flex items-center justify-center">
                        <XtreamPosterMedia
                          src={item.streamIcon}
                          alt={item.name}
                          variant="live"
                          monogram={String(item.num || 'TV')}
                          accentColor={spec.accent}
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-[13px] font-semibold text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate tabular-nums mt-0.5">
                          #{item.num} · {liveCategoryNames.get(item.categoryId) || 'Directo'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePlayLive(item)}
                      className="min-h-11 px-3.5 rounded-xl text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-opacity hover:opacity-90"
                      style={{ backgroundColor: spec.accent }}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Ver</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-black/40 border border-white/[0.06] p-8 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
                <XtreamEmptyBadgeIcon variant="live" />
                <p className="text-xs sm:text-sm font-medium">
                  No hay canales en directo disponibles con este filtro.
                </p>
              </div>
            )
          )}

          {/* SUB-TAB 2: PELÍCULAS (VOD) ASPECT 2/3 GRID */}
          {activeTab === 'vod' && (
            filteredVod.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {filteredVod.slice(0, visibleLimit).map((movie) => {
                  const catName = vodCategoryNames.get(movie.categoryId) || 'Películas';
                  return (
                    <div
                      key={`vod-${providerId}-${movie.streamId}`}
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedVodMovie(movie);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedVodMovie(movie);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="group rounded-2xl bg-black/40 border border-white/[0.08] hover:border-white/25 overflow-hidden flex flex-col cursor-pointer transition-colors text-left"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#090A10] overflow-hidden">
                        <XtreamPosterMedia
                          src={movie.streamIcon}
                          alt={movie.name}
                          variant="vod"
                          accentColor={spec.accent}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
                        <button
                          type="button"
                          onClick={(e) => handleQuickPlayVod(movie, e)}
                          aria-label={`Reproducir ${movie.name}`}
                          className="absolute right-2.5 bottom-2.5 w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg cursor-pointer transition-transform hover:scale-105"
                          style={{ backgroundColor: spec.accent }}
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      </div>

                      <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                        <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                          {movie.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate tabular-nums">
                          {formatXtreamRating(movie.rating) && (
                            <>
                              <span className="inline-flex items-center gap-0.5 text-amber-300 font-semibold shrink-0">
                                <Star className="w-3 h-3 fill-current" />
                                <span>{formatXtreamRating(movie.rating)}</span>
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span className="truncate">{catName}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-black/40 border border-white/[0.06] p-8 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
                <XtreamEmptyBadgeIcon variant="vod" />
                <p className="text-xs sm:text-sm font-medium">
                  No hay películas disponibles con este filtro.
                </p>
              </div>
            )
          )}

          {/* SUB-TAB 3: SERIES ASPECT 2/3 GRID */}
          {activeTab === 'series' && (
            filteredSeries.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {filteredSeries.slice(0, visibleLimit).map((seriesItem) => {
                  const catName = seriesCategoryNames.get(seriesItem.categoryId) || 'Series';
                  const cleanRating = formatXtreamRating(seriesItem.rating);
                  return (
                    <button
                      key={`series-${providerId}-${seriesItem.seriesId}`}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedSeries(seriesItem);
                      }}
                      className="group rounded-2xl bg-black/40 border border-white/[0.08] hover:border-white/25 overflow-hidden flex flex-col cursor-pointer transition-colors text-left"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#090A10] overflow-hidden">
                        <XtreamPosterMedia
                          src={seriesItem.cover}
                          alt={seriesItem.name}
                          variant="series"
                          accentColor={spec.accent}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
                      </div>

                      <div className="p-2.5 space-y-1 flex-1 w-full">
                        <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                          {seriesItem.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate tabular-nums">
                          {cleanRating && (
                            <>
                              <span className="inline-flex items-center gap-0.5 text-amber-300 font-semibold shrink-0">
                                <Star className="w-3 h-3 fill-current" />
                                <span>{cleanRating}</span>
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span className="truncate">{catName}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-black/40 border border-white/[0.06] p-8 flex flex-col items-center justify-center gap-2 text-center text-zinc-400">
                <XtreamEmptyBadgeIcon variant="series" />
                <p className="text-xs sm:text-sm font-medium">
                  No hay series disponibles con este filtro.
                </p>
              </div>
            )
          )}

          {/* 40-BY-40 PAGINATION SENTINEL & MANUAL LOAD MORE */}
          {hasMoreItems && (
            <div ref={sentinelRef} className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setVisibleLimit((prev) => prev + BATCH_SIZE);
                }}
                className="min-h-11 px-5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white cursor-pointer tabular-nums transition-colors"
              >
                Cargar {Math.min(BATCH_SIZE, remainingItemsCount)} más (
                {remainingItemsCount.toLocaleString('es-ES')} restantes)
              </button>
            </div>
          )}
        </section>
      ) : null}

      <XtreamVodDetailModal
        movie={selectedVodMovie}
        categoryName={
          selectedVodMovie
            ? vodCategoryNames.get(selectedVodMovie.categoryId) || 'Películas'
            : 'Películas'
        }
        accentColor={spec.accent}
        lang={lang}
        onClose={() => setSelectedVodMovie(null)}
        onPlayTdtChannel={onPlayTdtChannel}
      />

      <XtreamSeriesEpisodesModal
        series={selectedSeries}
        categoryName={
          selectedSeries
            ? seriesCategoryNames.get(selectedSeries.categoryId) || 'Series'
            : 'Series'
        }
        accentColor={spec.accent}
        lang={lang}
        onClose={() => setSelectedSeries(null)}
        onPlayTdtChannel={onPlayTdtChannel}
      />
    </div>
  );
};
