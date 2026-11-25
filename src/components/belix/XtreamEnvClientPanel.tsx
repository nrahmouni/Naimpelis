import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Film,
  KeyRound,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  fetchXtreamFullCatalog,
  fetchXtreamProviders,
  fetchXtreamStatus,
  runXtreamConnectionTest,
  type XtreamDiagnosticReport,
  type XtreamFullCatalogPayload,
  type XtreamLiveStreamItem,
  type XtreamMaskedStatus,
  type XtreamProviderPublicSummary,
  type XtreamSeriesItem,
  type XtreamVodStreamItem,
} from '../../services/xtreamClientService';
import { XtreamPrivateVaultModal } from '../settings/XtreamPrivateVaultModal';
import { XtreamPosterMedia, buildLiveTdtChannel, buildVodTdtChannel } from './XtreamMediaHelpers';
import { XtreamVodDetailModal } from './XtreamVodDetailModal';
import { XtreamSeriesEpisodesModal } from './XtreamSeriesEpisodesModal';

const BATCH_SIZE = 40;

interface XtreamEnvClientPanelProps {
  lang: AppLanguage;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
}

function getProviderBadgeStyle(providerId?: string): string {
  switch (providerId) {
    case 'octopus':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'dana4k':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'activecdns':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'vod4k':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    case '24tv':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case '2m2h':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    case '2m2h-alt':
      return 'bg-sky-500/15 text-sky-200 border-sky-400/30';
    case 'adtupac':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
    case 'ultra-vip':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
    case 'sult-vo':
      return 'bg-pink-500/15 text-pink-300 border-pink-500/30';
    default:
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
}

export const XtreamEnvClientPanel: React.FC<XtreamEnvClientPanelProps> = ({
  lang,
  onPlayTdtChannel,
}) => {
  const [providers, setProviders] = useState<XtreamProviderPublicSummary[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('all');
  const [serverFilterId, setServerFilterId] = useState<string>('all');
  const [status, setStatus] = useState<XtreamMaskedStatus | null>(null);
  const [catalog, setCatalog] = useState<XtreamFullCatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<'live' | 'vod' | 'series'>('live');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(BATCH_SIZE);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [testModeOpen, setTestModeOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<XtreamDiagnosticReport | null>(null);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [selectedVodMovie, setSelectedVodMovie] = useState<XtreamVodStreamItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<XtreamSeriesItem | null>(null);

  const loadAll = useCallback(
    async (forceRefresh = false, targetProviderId = selectedProviderId) => {
      if (forceRefresh) setSyncingCatalog(true);
      else setLoading(true);
      setPanelError(null);
      try {
        const providerList = await fetchXtreamProviders();
        setProviders(providerList);

        const chosenMeta = providerList.find((p) => p.id === targetProviderId);
        const nextStatus = await fetchXtreamStatus(forceRefresh, targetProviderId);
        setStatus(nextStatus);

        if (!nextStatus.connected) {
          setCatalog(null);
          setPanelError(nextStatus.error || null);
          return;
        }

        const catRes = await fetchXtreamFullCatalog(forceRefresh, targetProviderId);
        if (catRes.ok && catRes.catalog) {
          setCatalog(catRes.catalog);
          setSelectedCategoryId('all');
          if (
            chosenMeta?.defaultMediaFocus === 'vod' ||
            (catRes.catalog.counts.liveStreams === 0 && catRes.catalog.counts.vodStreams > 0)
          ) {
            setActiveMediaTab('vod');
          } else if (chosenMeta?.defaultMediaFocus === 'live' && catRes.catalog.counts.liveStreams > 0) {
            setActiveMediaTab('live');
          }
          window.dispatchEvent(new CustomEvent('belix-channels-synced'));
        } else {
          setCatalog(null);
          setPanelError(catRes.error || 'No se pudo cargar el catálogo Xtream.');
        }
      } finally {
        setLoading(false);
        setSyncingCatalog(false);
      }
    },
    [selectedProviderId]
  );

  useEffect(() => {
    void loadAll(false, selectedProviderId);
  }, [loadAll, selectedProviderId]);

  useEffect(() => {
    const onVaultUpdated = () => {
      void loadAll(true, selectedProviderId);
    };
    window.addEventListener('xtream-vault-updated', onVaultUpdated);
    return () => window.removeEventListener('xtream-vault-updated', onVaultUpdated);
  }, [loadAll, selectedProviderId]);

  useEffect(() => {
    setSelectedCategoryId('all');
    setVisibleLimit(BATCH_SIZE);
  }, [activeMediaTab, serverFilterId]);

  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
  }, [selectedCategoryId, searchQuery]);

  const handleSelectProvider = (nextProviderId: string) => {
    if (nextProviderId === selectedProviderId) return;
    triggerHaptic('light');
    setSelectedCategoryId('all');
    setServerFilterId('all');
    setSearchQuery('');
    setSelectedProviderId(nextProviderId);
  };

  const handleRunDiagnostics = async () => {
    triggerHaptic('medium');
    setTestModeOpen(true);
    setTestingConnection(true);
    try {
      const report = await runXtreamConnectionTest(true);
      setDiagnosticReport(report);
      if (report.connected) {
        void loadAll(false, selectedProviderId);
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const catalogServerFilters = useMemo(() => {
    if (!catalog || selectedProviderId !== 'all') return [];
    const countsById = new Map<string, { id: string; name: string; count: number }>();
    const bump = (id?: string, name?: string) => {
      if (!id) return;
      const prev = countsById.get(id);
      if (prev) prev.count += 1;
      else countsById.set(id, { id, name: name || id.toUpperCase(), count: 1 });
    };
    for (const s of catalog.liveStreams) bump(s.providerId, s.providerName);
    for (const v of catalog.vodStreams) bump(v.providerId, v.providerName);
    for (const sr of catalog.series) bump(sr.providerId, sr.providerName);
    return Array.from(countsById.values());
  }, [catalog, selectedProviderId]);

  const activeCategoryList = useMemo(() => {
    if (!catalog) return [];
    const raw =
      activeMediaTab === 'live'
        ? catalog.liveCategories
        : activeMediaTab === 'vod'
          ? catalog.vodCategories
          : catalog.seriesCategories;
    if (selectedProviderId !== 'all' || serverFilterId === 'all') return raw;
    return raw.filter((cat) => cat.providerId === serverFilterId);
  }, [catalog, activeMediaTab, selectedProviderId, serverFilterId]);

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

  const q = searchQuery.trim().toLowerCase();

  const filteredLive = useMemo(() => {
    const items = catalog?.liveStreams || [];
    return items.filter((item) => {
      if (selectedProviderId === 'all' && serverFilterId !== 'all' && item.providerId !== serverFilterId) {
        return false;
      }
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!q) return true;
      const catName = (liveCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        String(item.num).includes(q) ||
        (item.providerName || '').toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });
  }, [catalog, selectedProviderId, serverFilterId, selectedCategoryId, q, liveCategoryNames]);

  const filteredVod = useMemo(() => {
    const items = catalog?.vodStreams || [];
    return items.filter((item) => {
      if (selectedProviderId === 'all' && serverFilterId !== 'all' && item.providerId !== serverFilterId) {
        return false;
      }
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!q) return true;
      const catName = (vodCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.providerName || '').toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });
  }, [catalog, selectedProviderId, serverFilterId, selectedCategoryId, q, vodCategoryNames]);

  const filteredSeries = useMemo(() => {
    const items = catalog?.series || [];
    return items.filter((item) => {
      if (selectedProviderId === 'all' && serverFilterId !== 'all' && item.providerId !== serverFilterId) {
        return false;
      }
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!q) return true;
      const catName = (seriesCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.genre || '').toLowerCase().includes(q) ||
        (item.providerName || '').toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });
  }, [catalog, selectedProviderId, serverFilterId, selectedCategoryId, q, seriesCategoryNames]);

  const handlePlayLive = (item: XtreamLiveStreamItem) => {
    triggerHaptic('medium');
    const catName = liveCategoryNames.get(item.categoryId) || 'Directo';
    onPlayTdtChannel(buildLiveTdtChannel(item, catName, '#F43F5E'), 0);
  };

  const handlePlayVod = (item: XtreamVodStreamItem) => {
    triggerHaptic('medium');
    const catName = vodCategoryNames.get(item.categoryId) || 'VOD';
    onPlayTdtChannel(buildVodTdtChannel(item, catName, '#8B5CF6'), 0);
  };

  const currentTotalCount =
    activeMediaTab === 'live'
      ? filteredLive.length
      : activeMediaTab === 'vod'
        ? filteredVod.length
        : filteredSeries.length;

  const auditTotalItems = diagnosticReport
    ? diagnosticReport.catalogCounts.liveChannels +
      diagnosticReport.catalogCounts.vodMovies +
      diagnosticReport.catalogCounts.series
    : 0;

  return (
    <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="font-display font-bold text-sm sm:text-base text-white truncate">
              {pickLang(lang, {
                es: 'Catálogo Total Multi-Proveedor (Caché 6h)',
                ca: 'Catàleg Total Multi-Proveïdor (Memòria cau 6h)',
                en: 'Total Multi-Provider Catalog (6h Cache)',
              })}
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Todos los canales TV, películas y series unificados vía proxy seguro y bóveda oculta sin exposición de claves.',
              ca: 'Tots els canals TV, pel·lícules i sèries unificats via proxy segur i volta oculta sense exposició de claus.',
              en: 'All Live TV, movies & series unified via secure backend proxy and hidden vault with zero credential exposure.',
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setVaultModalOpen(true);
            }}
            className="min-h-11 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>Claves Privadas</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRunDiagnostics()}
            disabled={testingConnection}
            className="min-h-11 px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {testingConnection ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F43F5E]" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Resumen y Auditoría</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              void loadAll(true, selectedProviderId);
            }}
            disabled={loading || syncingCatalog}
            className="min-h-11 px-3.5 rounded-xl bg-[#F43F5E] hover:bg-[#E11D48] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {syncingCatalog ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Multi-Provider Selector Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => handleSelectProvider('all')}
          className={`min-h-10 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap border cursor-pointer transition-colors ${
            selectedProviderId === 'all'
              ? 'bg-[#F43F5E] border-[#F43F5E] text-white'
              : 'bg-black/60 border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Catálogo Total</span>
        </button>
        {providers.map((p) => {
          const active = selectedProviderId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectProvider(p.id)}
              className={`min-h-10 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap border cursor-pointer transition-colors ${
                active
                  ? 'bg-[#F43F5E] border-[#F43F5E] text-white'
                  : 'bg-black/60 border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{p.name}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  p.configured
                    ? active
                      ? 'bg-black/30 text-white'
                      : 'bg-emerald-500/15 text-emerald-300'
                    : active
                      ? 'bg-black/30 text-zinc-200'
                      : 'bg-white/[0.06] text-zinc-400'
                }`}
              >
                {p.configured ? 'Conectado' : 'Sin config.'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Masked Connection Status Card */}
      {loading && !status ? (
        <div className="rounded-2xl bg-black/40 border border-white/[0.06] p-4 flex items-center gap-2.5 text-xs text-zinc-300">
          <Loader2 className="w-4 h-4 animate-spin text-[#F43F5E]" />
          <span>Validando cuentas privadas y sincronizando catálogo...</span>
        </div>
      ) : status?.connected ? (
        <div className="rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/25 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-emerald-200 truncate">
                {status.accountLabel} · {status.serverLabel}
              </p>
              <p className="text-[11px] text-zinc-300 tabular-nums">
                Usuario: {status.maskedUsername}
                {status.expDateReadable ? ` · Expira: ${status.expDateReadable}` : ''}
                {status.maxConnections
                  ? ` · Conex.: ${status.activeConnections || '0'}/${status.maxConnections}`
                  : ''}
              </p>
            </div>
          </div>

          {catalog && (
            <div className="text-[11px] font-mono text-emerald-300/90 tabular-nums shrink-0">
              {catalog.counts.liveStreams} TV · {catalog.counts.vodStreams} VOD ·{' '}
              {catalog.counts.series} Series
              {catalog.fromCache ? ' · Caché 6h' : ' · En vivo'}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-500/[0.07] border border-amber-500/25 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-bold text-amber-200">
                {status?.accountLabel || 'Sin configurar / Ninguna cuenta activa disponible'}
              </p>
              <p className="text-[11px] text-zinc-300">
                {panelError ||
                  status?.error ||
                  'Configura las variables de entorno privadas o usa Claves Privadas para activar los proveedores.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setVaultModalOpen(true);
            }}
            className="min-h-9 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-xs font-bold text-amber-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-center"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Configurar Claves Privadas</span>
          </button>
        </div>
      )}

      {/* Panel de Resumen y Auditoría */}
      {testModeOpen && (
        <div className="rounded-2xl bg-black/60 border border-white/[0.1] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Panel de Resumen y Auditoría</span>
            </h3>
            <button
              type="button"
              onClick={() => setTestModeOpen(false)}
              className="text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          {testingConnection ? (
            <div className="flex items-center gap-2 text-xs text-zinc-300 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#F43F5E]" />
              <span>Auditando proveedores activos, rotación y recalculando catálogo total...</span>
            </div>
          ) : diagnosticReport ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
                  <p className="text-[11px] text-zinc-400">Canales TV</p>
                  <p className="font-bold text-white tabular-nums mt-0.5">
                    {diagnosticReport.catalogCounts.liveChannels.toLocaleString('es-ES')}
                  </p>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
                  <p className="text-[11px] text-zinc-400">Películas VOD</p>
                  <p className="font-bold text-white tabular-nums mt-0.5">
                    {diagnosticReport.catalogCounts.vodMovies.toLocaleString('es-ES')}
                  </p>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
                  <p className="text-[11px] text-zinc-400">Series</p>
                  <p className="font-bold text-white tabular-nums mt-0.5">
                    {diagnosticReport.catalogCounts.series.toLocaleString('es-ES')}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25 p-3">
                  <p className="text-[11px] text-emerald-300">Total añadido</p>
                  <p className="font-extrabold text-emerald-200 tabular-nums mt-0.5">
                    {auditTotalItems.toLocaleString('es-ES')}
                  </p>
                </div>
              </div>

              {diagnosticReport.providers && diagnosticReport.providers.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {diagnosticReport.providers.map((prov) => (
                    <div
                      key={prov.id}
                      className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-white truncate">{prov.name}</p>
                          {prov.totalAccounts > 1 && prov.activeAccountNumber && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 tabular-nums">
                              Cta {prov.activeAccountNumber}/{prov.totalAccounts}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                          {prov.state === 'Activo'
                            ? `${prov.counts.liveChannels} TV · ${prov.counts.vodMovies} VOD · ${prov.counts.series} Series`
                            : prov.detail}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 ${
                          prov.state === 'Activo'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : prov.state === 'Error'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {prov.state === 'Activo' ? 'Conectado' : prov.state}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Full Catalog Browser (Live, VOD, Series) */}
      {status?.connected && catalog && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="inline-flex rounded-xl bg-black/60 border border-white/[0.08] p-1 self-start">
              <button
                type="button"
                onClick={() => setActiveMediaTab('live')}
                className={`min-h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer tabular-nums ${
                  activeMediaTab === 'live'
                    ? 'bg-[#F43F5E] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Directo ({catalog.counts.liveStreams})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMediaTab('vod')}
                className={`min-h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer tabular-nums ${
                  activeMediaTab === 'vod'
                    ? 'bg-[#F43F5E] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Películas ({catalog.counts.vodStreams})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMediaTab('series')}
                className={`min-h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer tabular-nums ${
                  activeMediaTab === 'series'
                    ? 'bg-[#F43F5E] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Clapperboard className="w-3.5 h-3.5" />
                <span>Series ({catalog.counts.series})</span>
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar canal, servidor, película o serie..."
                className="min-h-10 w-full rounded-xl bg-black/60 border border-white/[0.1] pl-8 pr-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#F43F5E]"
              />
            </div>
          </div>

          {/* Server Filter inside Catálogo Total */}
          {selectedProviderId === 'all' && catalogServerFilters.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 pr-1 shrink-0">
                Servidor:
              </span>
              <button
                type="button"
                onClick={() => {
                  setServerFilterId('all');
                  setSelectedCategoryId('all');
                }}
                className={`min-h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap border cursor-pointer transition-colors ${
                  serverFilterId === 'all'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                Todos los servidores
              </button>
              {catalogServerFilters.map((srv) => {
                const active = serverFilterId === srv.id;
                return (
                  <button
                    key={`srv-filter-${srv.id}`}
                    type="button"
                    onClick={() => {
                      setServerFilterId(srv.id);
                      setSelectedCategoryId('all');
                    }}
                    className={`min-h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap border cursor-pointer transition-colors tabular-nums ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    {srv.name} ({srv.count})
                  </button>
                );
              })}
            </div>
          )}

          {activeCategoryList.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`min-h-9 px-3 rounded-xl text-xs font-semibold whitespace-nowrap border cursor-pointer transition-colors ${
                  selectedCategoryId === 'all'
                    ? 'bg-[#F43F5E]/20 border-[#F43F5E]/60 text-white'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                Todas ({currentTotalCount})
              </button>
              {activeCategoryList.slice(0, 40).map((cat) => {
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={`${cat.type}-${cat.id}`}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`min-h-9 px-3 rounded-xl text-xs font-medium whitespace-nowrap border cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#F43F5E]/20 border-[#F43F5E]/60 text-white'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          )}

          {activeMediaTab === 'live' && (
            filteredLive.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredLive.slice(0, visibleLimit).map((item) => (
                    <div
                      key={`${item.providerId || 'primary'}-${item.streamId}`}
                      className="rounded-xl bg-black/50 border border-white/[0.08] hover:border-[#F43F5E]/50 p-3 flex items-center justify-between gap-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                          <XtreamPosterMedia
                            src={item.streamIcon}
                            alt={item.name}
                            variant="live"
                            monogram={String(item.num || 'TV')}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                            {item.providerName && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${getProviderBadgeStyle(
                                  item.providerId
                                )}`}
                              >
                                {item.providerName}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate">
                            #{item.num} · {liveCategoryNames.get(item.categoryId) || 'Directo'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePlayLive(item)}
                        className="min-h-9 px-3 rounded-lg bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Ver</span>
                      </button>
                    </div>
                  ))}
                </div>
                {filteredLive.length > visibleLimit && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + BATCH_SIZE)}
                      className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white cursor-pointer tabular-nums"
                    >
                      Cargar {Math.min(BATCH_SIZE, filteredLive.length - visibleLimit)} más ({filteredLive.length - visibleLimit} restantes)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 py-2">
                No se encontraron canales en directo con ese filtro.
              </p>
            )
          )}

          {activeMediaTab === 'vod' && (
            filteredVod.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredVod.slice(0, visibleLimit).map((item) => (
                    <div
                      key={`${item.providerId || 'primary'}-${item.streamId}`}
                      onClick={() => setSelectedVodMovie(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedVodMovie(item);
                        }
                      }}
                      className="rounded-xl bg-black/50 border border-white/[0.08] hover:border-[#F43F5E]/50 p-3 flex items-center justify-between gap-2.5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-12 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                          <XtreamPosterMedia
                            src={item.streamIcon}
                            alt={item.name}
                            variant="vod"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                            {item.providerName && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${getProviderBadgeStyle(
                                  item.providerId
                                )}`}
                              >
                                {item.providerName}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {vodCategoryNames.get(item.categoryId) || 'VOD'} ·{' '}
                            {item.containerExtension.toUpperCase()}
                            {item.rating ? ` · ★ ${item.rating}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVod(item);
                        }}
                        className="min-h-9 px-3 rounded-lg bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Ver</span>
                      </button>
                    </div>
                  ))}
                </div>
                {filteredVod.length > visibleLimit && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + BATCH_SIZE)}
                      className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white cursor-pointer tabular-nums"
                    >
                      Cargar {Math.min(BATCH_SIZE, filteredVod.length - visibleLimit)} más ({filteredVod.length - visibleLimit} restantes)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 py-2">
                No se encontraron películas VOD con ese filtro.
              </p>
            )
          )}

          {activeMediaTab === 'series' && (
            filteredSeries.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredSeries.slice(0, visibleLimit).map((item) => (
                    <button
                      key={`${item.providerId || 'primary'}-${item.seriesId}`}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedSeries(item);
                      }}
                      className="rounded-xl bg-black/50 border border-white/[0.08] hover:border-[#F43F5E]/50 p-3 flex items-start gap-3 text-left cursor-pointer transition-colors"
                    >
                      <div className="w-10 h-14 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                        <XtreamPosterMedia
                          src={item.cover}
                          alt={item.name}
                          variant="series"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                          {item.providerName && (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${getProviderBadgeStyle(
                                item.providerId
                              )}`}
                            >
                              {item.providerName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {seriesCategoryNames.get(item.categoryId) || 'Serie'}
                          {item.rating ? ` · ★ ${item.rating}` : ''}
                        </p>
                        {item.plot && (
                          <p className="text-[11px] text-zinc-500 line-clamp-2">{item.plot}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {filteredSeries.length > visibleLimit && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((v) => v + BATCH_SIZE)}
                      className="min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white cursor-pointer tabular-nums"
                    >
                      Cargar {Math.min(BATCH_SIZE, filteredSeries.length - visibleLimit)} más ({filteredSeries.length - visibleLimit} restantes)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 py-2">
                No se encontraron series con ese filtro.
              </p>
            )
          )}
        </div>
      )}

      <XtreamPrivateVaultModal
        isOpen={vaultModalOpen}
        onClose={() => setVaultModalOpen(false)}
        lang={lang}
      />

      <XtreamVodDetailModal
        movie={selectedVodMovie}
        categoryName={
          selectedVodMovie
            ? vodCategoryNames.get(selectedVodMovie.categoryId) || 'Películas'
            : 'Películas'
        }
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
        lang={lang}
        onClose={() => setSelectedSeries(null)}
        onPlayTdtChannel={onPlayTdtChannel}
      />
    </section>
  );
};
