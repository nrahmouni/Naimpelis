import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Film,
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
import { XtreamPosterMedia, buildLiveTdtChannel, buildVodTdtChannel } from '../belix/XtreamMediaHelpers';
import { XtreamVodDetailModal } from '../belix/XtreamVodDetailModal';
import { XtreamSeriesEpisodesModal } from '../belix/XtreamSeriesEpisodesModal';

const BATCH_SIZE = 40;

interface DanaActiveWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
}

type DanaActiveScope = 'dana_active' | 'dana4k' | 'activecdns';

export const DanaActiveWorldView: React.FC<DanaActiveWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlayTdtChannel,
}) => {
  const [selectedScope, setSelectedScope] = useState<DanaActiveScope>('dana_active');
  const [providersMeta, setProvidersMeta] = useState<XtreamProviderPublicSummary[]>([]);
  const [status, setStatus] = useState<XtreamMaskedStatus | null>(null);
  const [catalog, setCatalog] = useState<XtreamFullCatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<'live' | 'vod' | 'series'>('live');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(externalSearchQuery);
  const [visibleLimit, setVisibleLimit] = useState(BATCH_SIZE);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [testModeOpen, setTestModeOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<XtreamDiagnosticReport | null>(null);
  const [selectedVodMovie, setSelectedVodMovie] = useState<XtreamVodStreamItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<XtreamSeriesItem | null>(null);

  useEffect(() => {
    if (externalSearchQuery !== searchQuery) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  const loadScope = useCallback(
    async (forceRefresh = false, scope: DanaActiveScope = selectedScope) => {
      if (forceRefresh) setSyncing(true);
      else setLoading(true);
      setPanelError(null);
      try {
        const allProviders = await fetchXtreamProviders();
        setProvidersMeta(
          allProviders.filter((p) => p.id === 'dana4k' || p.id === 'activecdns')
        );

        const nextStatus = await fetchXtreamStatus(forceRefresh, scope);
        setStatus(nextStatus);

        if (!nextStatus.connected) {
          setCatalog(null);
          setPanelError(nextStatus.error || null);
          return;
        }

        const catRes = await fetchXtreamFullCatalog(forceRefresh, scope);
        if (catRes.ok && catRes.catalog) {
          setCatalog(catRes.catalog);
          setSelectedCategoryId('all');
          if (catRes.catalog.counts.liveStreams === 0 && catRes.catalog.counts.vodStreams > 0) {
            setActiveMediaTab('vod');
          }
          window.dispatchEvent(new CustomEvent('belix-channels-synced'));
        } else {
          setCatalog(null);
          setPanelError(catRes.error || 'No se pudo cargar el catálogo de Dana & Active.');
        }
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [selectedScope]
  );

  useEffect(() => {
    void loadScope(false, selectedScope);
  }, [loadScope, selectedScope]);

  useEffect(() => {
    const onVaultUpdated = () => {
      void loadScope(true, selectedScope);
    };
    window.addEventListener('xtream-vault-updated', onVaultUpdated);
    return () => window.removeEventListener('xtream-vault-updated', onVaultUpdated);
  }, [loadScope, selectedScope]);

  useEffect(() => {
    setSelectedCategoryId('all');
    setVisibleLimit(BATCH_SIZE);
  }, [activeMediaTab]);

  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
  }, [selectedCategoryId, searchQuery]);

  const handleRunDiagnostics = async () => {
    triggerHaptic('medium');
    setTestModeOpen(true);
    setTestingConnection(true);
    try {
      const report = await runXtreamConnectionTest();
      setDiagnosticReport(report);
      if (report.connected && !catalog) {
        void loadScope(false, selectedScope);
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const danaActiveDiagnostics = useMemo(() => {
    const list = diagnosticReport?.providers || [];
    return list.filter((p) => p.id === 'dana4k' || p.id === 'activecdns');
  }, [diagnosticReport]);

  const activeCategoryList = useMemo(() => {
    if (!catalog) return [];
    if (activeMediaTab === 'live') return catalog.liveCategories;
    if (activeMediaTab === 'vod') return catalog.vodCategories;
    return catalog.seriesCategories;
  }, [catalog, activeMediaTab]);

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
  }, [catalog, selectedCategoryId, q, liveCategoryNames]);

  const filteredVod = useMemo(() => {
    const items = catalog?.vodStreams || [];
    return items.filter((item) => {
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) return false;
      if (!q) return true;
      const catName = (vodCategoryNames.get(item.categoryId) || '').toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.providerName || '').toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });
  }, [catalog, selectedCategoryId, q, vodCategoryNames]);

  const filteredSeries = useMemo(() => {
    const items = catalog?.series || [];
    return items.filter((item) => {
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
  }, [catalog, selectedCategoryId, q, seriesCategoryNames]);

  const handlePlayLive = (item: XtreamLiveStreamItem) => {
    triggerHaptic('medium');
    const catName = liveCategoryNames.get(item.categoryId) || 'Directo';
    onPlayTdtChannel(buildLiveTdtChannel(item, catName, '#0EA5E9'), 0);
  };

  const handlePlayVod = (item: XtreamVodStreamItem) => {
    triggerHaptic('medium');
    const catName = vodCategoryNames.get(item.categoryId) || 'VOD';
    onPlayTdtChannel(buildVodTdtChannel(item, catName, '#10B981'), 0);
  };

  const currentTotalCount =
    activeMediaTab === 'live'
      ? filteredLive.length
      : activeMediaTab === 'vod'
        ? filteredVod.length
        : filteredSeries.length;

  const danaMeta = providersMeta.find((p) => p.id === 'dana4k');
  const activeMeta = providersMeta.find((p) => p.id === 'activecdns');

  return (
    <div className="w-full space-y-4">
      <section className="rounded-[24px] bg-[#0D0D12] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <h1 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight truncate">
                {pickLang(lang, {
                  es: 'Dana & Active · Televisión, Cine y Series',
                  ca: 'Dana & Active · Televisió, Cinema i Sèries',
                  en: 'Dana & Active · Live TV, Movies & Series',
                })}
              </h1>
            </div>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'Alterna entre Dana 4K Pro, Active CDNS o su catálogo combinado con proxy seguro y caché de 6 horas.',
                ca: 'Alterna entre Dana 4K Pro, Active CDNS o el seu catàleg combinat amb proxy segur i memòria cau de 6 hores.',
                en: 'Switch between Dana 4K Pro, Active CDNS, or their combined catalog via secure backend proxy and 6h cache.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleRunDiagnostics()}
              disabled={testingConnection}
              className="min-h-11 px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {testingConnection ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Probar Conexión</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                void loadScope(true, selectedScope);
              }}
              disabled={loading || syncing}
              className="min-h-11 px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Dedicated Provider Sub-tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedScope('dana_active');
            }}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 border cursor-pointer transition-colors ${
              selectedScope === 'dana_active'
                ? 'bg-sky-500 border-sky-400 text-slate-950'
                : 'bg-black/60 border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Catálogo Combinado</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedScope('dana4k');
            }}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 border cursor-pointer transition-colors ${
              selectedScope === 'dana4k'
                ? 'bg-sky-500 border-sky-400 text-slate-950'
                : 'bg-black/60 border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Dana 4K Pro</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                danaMeta?.configured
                  ? selectedScope === 'dana4k'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-emerald-500/15 text-emerald-300'
                  : selectedScope === 'dana4k'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-white/[0.08] text-zinc-400'
              }`}
            >
              {danaMeta?.configured
                ? danaMeta.totalAccounts > 1
                  ? `Conectado (${danaMeta.totalAccounts} cuentas)`
                  : 'Conectado'
                : 'Sin config.'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedScope('activecdns');
            }}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 border cursor-pointer transition-colors ${
              selectedScope === 'activecdns'
                ? 'bg-sky-500 border-sky-400 text-slate-950'
                : 'bg-black/60 border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Active CDNS</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                activeMeta?.configured
                  ? selectedScope === 'activecdns'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-emerald-500/15 text-emerald-300'
                  : selectedScope === 'activecdns'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-white/[0.08] text-zinc-400'
              }`}
            >
              {activeMeta?.configured ? 'Conectado' : 'Sin config.'}
            </span>
          </button>
        </div>

        {/* Masked Connection Status Card */}
        {loading && !status ? (
          <div className="rounded-2xl bg-black/40 border border-white/[0.06] p-4 flex items-center gap-2.5 text-xs text-zinc-300">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <span>Validando conexión segura y sincronizando catálogo...</span>
          </div>
        ) : status?.connected ? (
          <div className="rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/25 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-emerald-200 truncate">
                  {status.providerName || 'Dana & Active'} · Conectado
                </p>
                <p className="text-[11px] text-zinc-300 tabular-nums">
                  {status.accountLabel} · Usuario: {status.maskedUsername}
                  {status.expDateReadable ? ` · Expira: ${status.expDateReadable}` : ''}
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
          <div className="rounded-2xl bg-amber-500/[0.07] border border-amber-500/25 p-3.5 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-bold text-amber-200">
                {status?.accountLabel || 'Desconectado'}
              </p>
              <p className="text-[11px] text-zinc-300">
                {panelError ||
                  status?.error ||
                  'El servidor no respondió en este intento. Pulsa Sincronizar para reintentar.'}
              </p>
            </div>
          </div>
        )}

        {/* Probar Conexión Report */}
        {testModeOpen && (
          <div className="rounded-2xl bg-black/60 border border-white/[0.1] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Estado de Proveedores · Dana & Active</span>
              </h2>
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
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>Probando conexión de Dana 4K y Active CDNS sin exponer credenciales...</span>
              </div>
            ) : danaActiveDiagnostics.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {danaActiveDiagnostics.map((prov) => (
                  <div
                    key={prov.id}
                    className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{prov.name}</p>
                      <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
                        {prov.state === 'Activo'
                          ? `Conectado · ${prov.counts.liveChannels} TV · ${prov.counts.vodMovies} VOD · ${prov.counts.series} Series`
                          : `${prov.state} · ${prov.counts.liveChannels} canales`}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                        prov.state === 'Activo'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : prov.state === 'Error'
                            ? 'bg-red-500/15 text-red-300'
                            : 'bg-white/[0.08] text-zinc-300'
                      }`}
                    >
                      {prov.state === 'Activo' ? 'Activo' : prov.state}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Catalog Browser */}
        {status?.connected && catalog && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="inline-flex rounded-xl bg-black/60 border border-white/[0.08] p-1 self-start">
                <button
                  type="button"
                  onClick={() => setActiveMediaTab('live')}
                  className={`min-h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer tabular-nums ${
                    activeMediaTab === 'live'
                      ? 'bg-sky-500 text-slate-950'
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
                      ? 'bg-sky-500 text-slate-950'
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
                      ? 'bg-sky-500 text-slate-950'
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
                  placeholder="Buscar canal, nº dial, película o serie..."
                  className="min-h-10 w-full rounded-xl bg-black/60 border border-white/[0.1] pl-8 pr-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            {activeCategoryList.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('all')}
                  className={`min-h-9 px-3 rounded-xl text-xs font-semibold whitespace-nowrap border cursor-pointer transition-colors ${
                    selectedCategoryId === 'all'
                      ? 'bg-sky-500/20 border-sky-400/60 text-white'
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
                          ? 'bg-sky-500/20 border-sky-400/60 text-white'
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
                        key={`${item.providerId || 'dana4k'}-${item.streamId}`}
                        className="rounded-xl bg-black/50 border border-white/[0.08] hover:border-sky-400/50 p-3 flex items-center justify-between gap-2.5 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                            <XtreamPosterMedia
                              src={item.streamIcon}
                              alt={item.name}
                              variant="live"
                              monogram={String(item.num || 'TV')}
                              accentColor="#0EA5E9"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {item.providerName ? `${item.providerName} · ` : ''}#{item.num} ·{' '}
                              {liveCategoryNames.get(item.categoryId) || 'Directo'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePlayLive(item)}
                          className="min-h-9 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
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
                        key={`${item.providerId || 'dana4k'}-${item.streamId}`}
                        onClick={() => setSelectedVodMovie(item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedVodMovie(item);
                          }
                        }}
                        className="rounded-xl bg-black/50 border border-white/[0.08] hover:border-sky-400/50 p-3 flex items-center justify-between gap-2.5 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-12 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                            <XtreamPosterMedia
                              src={item.streamIcon}
                              alt={item.name}
                              variant="vod"
                              accentColor="#0EA5E9"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {item.providerName ? `${item.providerName} · ` : ''}
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
                          className="min-h-9 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
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
                        key={`${item.providerId || 'dana4k'}-${item.seriesId}`}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedSeries(item);
                        }}
                        className="rounded-xl bg-black/50 border border-white/[0.08] hover:border-sky-400/50 p-3 flex items-start gap-3 text-left cursor-pointer transition-colors"
                      >
                        <div className="w-10 h-14 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                          <XtreamPosterMedia
                            src={item.cover}
                            alt={item.name}
                            variant="series"
                            accentColor="#0EA5E9"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {item.providerName ? `${item.providerName} · ` : ''}
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
      </section>

      <XtreamVodDetailModal
        movie={selectedVodMovie}
        categoryName={
          selectedVodMovie
            ? vodCategoryNames.get(selectedVodMovie.categoryId) || 'Películas'
            : 'Películas'
        }
        accentColor="#0EA5E9"
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
        accentColor="#0EA5E9"
        lang={lang}
        onClose={() => setSelectedSeries(null)}
        onPlayTdtChannel={onPlayTdtChannel}
      />
    </div>
  );
};
