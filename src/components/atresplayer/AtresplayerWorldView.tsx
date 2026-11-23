import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Film,
  Globe,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  Trash2,
  Tv,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  YouTubeSearchItem,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { useAppStore } from '../../store/useAppStore';
import {
  getCustomTdtBackups,
  removeCustomTdtBackup,
  saveCustomTdtBackup,
} from '../../utils/customTdtSources';
import {
  AtresmediaProgramPanel,
  type AtresmediaCatalogItemUi,
} from './AtresmediaProgramPanel';

interface AtresmediaLiveChannelUi {
  id: string;
  tdtId: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  logoUrl: string;
  nowTitle: string;
  nextTitle: string;
  description: string;
  startLabel: string;
  stopLabel: string;
  progressPct: number;
  programArtwork: string;
  showLogoUrl: string;
  formatId?: string;
  tdtChannel: SpanishTdtChannel;
}

type CategoryFilter = 'all' | 'concursos' | 'entretenimiento' | 'series' | 'actualidad';

interface AtresplayerWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayTdtChannel: (
    channel: SpanishTdtChannel,
    signalIndex?: number,
    liveProgramHint?: string
  ) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (
    url: string,
    meta?: { title?: string; subtitle?: string; poster?: string }
  ) => void;
  onOpenSeriesPage: (series: CatalogMovie) => void;
}

const CATEGORY_TABS: { id: CategoryFilter; labelEs: string; labelCa: string; labelEn: string }[] = [
  { id: 'all', labelEs: 'Todo Atresmedia', labelCa: 'Tot Atresmedia', labelEn: 'All Atresmedia' },
  { id: 'concursos', labelEs: 'Concursos', labelCa: 'Concursos', labelEn: 'Game Shows' },
  { id: 'entretenimiento', labelEs: 'Programas', labelCa: 'Programes', labelEn: 'Shows' },
  { id: 'series', labelEs: 'Series', labelCa: 'Sèries', labelEn: 'Series' },
  { id: 'actualidad', labelEs: 'Actualidad', labelCa: 'Actualitat', labelEn: 'Current Affairs' },
];

export const AtresplayerWorldView: React.FC<AtresplayerWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlayTdtChannel,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenSeriesPage,
}) => {
  const [liveChannels, setLiveChannels] = useState<AtresmediaLiveChannelUi[]>([]);
  const [catalog, setCatalog] = useState<AtresmediaCatalogItemUi[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeCategory = useAppStore((s) => s.atresplayerCategory);
  const setActiveCategory = useAppStore((s) => s.setAtresplayerCategory);
  const [selectedProgram, setSelectedProgram] = useState<AtresmediaCatalogItemUi | null>(null);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});
  const [showBackupDrawer, setShowBackupDrawer] = useState(false);
  const [backupChannelId, setBackupChannelId] = useState('tdt-antena3');
  const [backupUrlInput, setBackupUrlInput] = useState('');
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backupTick, setBackupTick] = useState(0);

  const activeCustomBackups = useMemo(() => {
    void backupTick;
    return getCustomTdtBackups(backupChannelId);
  }, [backupChannelId, backupTick]);

  const antena3Live = useMemo(
    () => liveChannels.find((c) => c.tdtId === 'tdt-antena3') || liveChannels[0] || null,
    [liveChannels]
  );
  const lasextaLive = useMemo(
    () => liveChannels.find((c) => c.tdtId === 'tdt-lasexta') || null,
    [liveChannels]
  );

  const antena3HealthStatus = antena3Live?.tdtChannel?.healthSummary?.bestStatus || 'unknown';
  const antena3HasCustom = useMemo(() => {
    void backupTick;
    return getCustomTdtBackups('tdt-antena3').length > 0;
  }, [backupTick]);

  useBackInterceptor(
    !selectedProgram && activeCategory !== 'all',
    'atresplayer-category-reset',
    () => setActiveCategory('all'),
    { priority: 4 }
  );

  const fetchHome = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/atresmedia/home');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setLoadError(
          data?.error ||
            pickLang(lang, {
              es: 'No se pudo cargar el catálogo de Atresmedia.',
              ca: 'No s’ha pogut carregar el catàleg d’Atresmedia.',
              en: 'Could not load Atresmedia catalog.',
            })
        );
        return;
      }
      setLiveChannels(Array.isArray(data.liveChannels) ? data.liveChannels : []);
      setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
    } catch {
      setLoadError(
        pickLang(lang, {
          es: 'Error de red cargando Atresmedia.',
          ca: 'Error de xarxa carregant Atresmedia.',
          en: 'Network error loading Atresmedia.',
        })
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void fetchHome();
  }, [fetchHome]);

  const filteredCatalog = useMemo(() => {
    const q = externalSearchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.channelName.toLowerCase().includes(q) ||
        item.genre.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [catalog, activeCategory, externalSearchQuery]);

  const spotlightItem = useMemo(() => {
    if (externalSearchQuery.trim()) return null;
    if (activeCategory === 'all') {
      return (
        catalog.find((c) => /pasapalabra/i.test(c.title)) ||
        catalog.find((c) => c.featured) ||
        catalog[0] ||
        null
      );
    }
    return filteredCatalog[0] || null;
  }, [catalog, filteredCatalog, activeCategory, externalSearchQuery]);

  const handleOpenCatalogItem = (item: AtresmediaCatalogItemUi) => {
    triggerHaptic('light');
    if (item.kind === 'series' && item.tmdbId) {
      onOpenSeriesPage({
        id: item.id,
        tmdbId: item.tmdbId,
        mediaType: 'tv',
        title: item.title,
        year: 'HD',
        rating: '',
        overview: item.description,
        poster: item.imageUrl,
        backdrop: item.imageUrl,
        languages: ['Castellano'],
      });
      return;
    }
    setSelectedProgram(item);
  };

  if (selectedProgram) {
    return (
      <AtresmediaProgramPanel
        lang={lang}
        program={selectedProgram}
        onBack={() => setSelectedProgram(null)}
        onPlayYouTubeVideo={onPlayYouTubeVideo}
        onPlayCustomUrl={onPlayCustomUrl}
      />
    );
  }

  return (
    <div className="w-full space-y-7 pb-6">
      {/* HERO SPOTLIGHT (PASAPALABRA / PROGRAMA DESTACADO) */}
      {spotlightItem && (
        <section className="relative rounded-[24px] overflow-hidden bg-[#0D0D12] border border-white/[0.08]">
          {spotlightItem.imageUrl && !failedImgs[`spot-${spotlightItem.id}`] && (
            <img
              src={spotlightItem.imageUrl}
              alt={spotlightItem.title}
              referrerPolicy="no-referrer"
              onError={() =>
                setFailedImgs((prev) => ({ ...prev, [`spot-${spotlightItem.id}`]: true }))
              }
              className="absolute inset-0 w-full h-full object-cover opacity-45"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#000000] via-[#000000]/80 to-transparent" />
          <div className="relative z-10 p-5 sm:p-8 max-w-2xl space-y-4">
            <div className="text-xs font-semibold text-[#FF8A4C] tracking-wide">
              Atresmedia Destacado · {spotlightItem.channelName} · {spotlightItem.genre}
            </div>
            {spotlightItem.logoUrl ? (
              <img
                src={spotlightItem.logoUrl}
                alt={spotlightItem.title}
                referrerPolicy="no-referrer"
                className="h-12 sm:h-16 w-auto max-w-[260px] object-contain"
              />
            ) : (
              <h1 className="font-display font-bold text-2xl sm:text-4xl text-white tracking-tight">
                {spotlightItem.title}
              </h1>
            )}
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
              {spotlightItem.description}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleOpenCatalogItem(spotlightItem)}
                className="min-h-11 px-5 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer shadow-[0_10px_28px_rgba(255,94,26,0.34)] transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {spotlightItem.kind === 'series' && spotlightItem.tmdbId
                    ? 'Ver temporadas y capítulos'
                    : 'Ver programas completos'}
                </span>
              </button>

              {antena3Live && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onPlayTdtChannel(antena3Live.tdtChannel, 0, antena3Live.nowTitle);
                  }}
                  className="min-h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Radio className="w-4 h-4 text-[#FF5E1A]" />
                  <span>Directo Antena 3 1080p</span>
                </button>
              )}

              {lasextaLive && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onPlayTdtChannel(lasextaLive.tdtChannel, 0, lasextaLive.nowTitle);
                  }}
                  className="min-h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span>Directo laSexta 1080p</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ERROR BANNER */}
      {loadError && catalog.length === 0 && (
        <div className="rounded-[24px] bg-[#0D0D12] border border-red-500/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white">No pudimos cargar Atresmedia</h2>
              <p className="text-xs text-zinc-400">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchHome()}
            className="min-h-11 px-4 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* LIVE CHANNELS BAND (ANTENA 3, LASEXTA, NEOX, NOVA, MEGA, ATRESERIES) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#FF5E1A]" />
              <span>Canales en Directo Atresmedia · 1080p HD</span>
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                antena3HasCustom || antena3HealthStatus === 'up'
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                  : antena3HealthStatus === 'degraded'
                  ? 'bg-amber-500/12 border-amber-500/35 text-amber-300'
                  : 'bg-white/[0.06] border-white/[0.12] text-zinc-300'
              }`}
            >
              {antena3HasCustom
                ? 'Antena 3: Respaldo Propio HD activo'
                : antena3HealthStatus === 'up'
                ? 'Antena 3: Señal lista'
                : 'Antena 3: Fallback / Atresplayer'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                window.dispatchEvent(new CustomEvent('riffan:open-vpn-gateway'));
              }}
              className="min-h-9 px-3 rounded-xl bg-[#00F593]/12 hover:bg-[#00F593]/20 border border-[#00F593]/35 text-xs font-semibold text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>VPN España</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowBackupDrawer((v) => !v);
              }}
              className="min-h-9 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.1] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5 text-[#FF8A4C]" />
              <span>Respaldo en vivo</span>
            </button>
            <a
              href="https://www.atresplayer.com/directos/antena3/"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-9 px-3 rounded-xl bg-[#FF5E1A]/15 hover:bg-[#FF5E1A]/25 border border-[#FF5E1A]/40 text-xs font-semibold text-[#FF8A4C] hover:text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Atresplayer Web</span>
            </a>
          </div>
        </div>

        {showBackupDrawer && (
          <div className="rounded-2xl bg-[#0D0D12] border border-[#FF5E1A]/35 p-4 space-y-3">
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-white">
                Señal Directa España 1080p + Pasarela VPN Multi-Fuente
              </h3>
              <p className="text-xs text-zinc-400">
                Riffan TV conecta directo con la cabecera DVB española de Antena 3 y laSexta en 1080p HD y rota automáticamente con señales Edge de respaldo sin antenas físicas. Si tienes otra URL `.m3u8` privada, fíjala aquí como prioridad #1.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={backupChannelId}
                onChange={(e) => {
                  setBackupChannelId(e.target.value);
                  setBackupMsg(null);
                }}
                className="min-h-10 px-3 rounded-xl bg-black border border-white/[0.12] text-xs font-semibold text-white focus:outline-none focus:border-[#FF5E1A]"
              >
                <option value="tdt-antena3">Antena 3 HD</option>
                <option value="tdt-lasexta">laSexta HD</option>
                <option value="tdt-neox">Neox HD</option>
                <option value="tdt-nova">Nova HD</option>
                <option value="tdt-mega">Mega HD</option>
                <option value="tdt-atreseries">Atreseries HD</option>
              </select>

              <input
                type="url"
                value={backupUrlInput}
                onChange={(e) => setBackupUrlInput(e.target.value)}
                placeholder="https://... .m3u8 o https://www.atresplayer.com/directos/antena3/"
                className="flex-1 min-h-10 px-3 rounded-xl bg-black border border-white/[0.12] focus:border-[#FF5E1A] text-xs font-mono text-white focus:outline-none"
              />

              <button
                type="button"
                onClick={() => {
                  const res = saveCustomTdtBackup(backupChannelId, backupUrlInput);
                  setBackupTick((t) => t + 1);
                  if (res.ok) {
                    setBackupUrlInput('');
                    setBackupMsg({
                      ok: true,
                      text: 'Señal guardada como prioridad #1 en este dispositivo.',
                    });
                  } else {
                    setBackupMsg({ ok: false, text: res.error || 'URL inválida.' });
                  }
                }}
                className="min-h-10 px-4 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Guardar prioridad #1</span>
              </button>
            </div>

            {backupMsg && (
              <div
                className={`text-xs flex items-center gap-1.5 ${
                  backupMsg.ok ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {backupMsg.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{backupMsg.text}</span>
              </div>
            )}

            {activeCustomBackups.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {activeCustomBackups.map((entry) => (
                  <div
                    key={entry.url}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs"
                  >
                    <span className="font-mono text-zinc-200 truncate">{entry.url}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const targetCh = liveChannels.find((c) => c.tdtId === backupChannelId);
                          if (targetCh) {
                            onPlayTdtChannel(targetCh.tdtChannel, 0, targetCh.nowTitle);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#FF5E1A]/20 hover:bg-[#FF5E1A] text-[#FF8A4C] hover:text-white font-semibold cursor-pointer transition-colors"
                      >
                        Probar ahora
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeCustomTdtBackup(backupChannelId, entry.url);
                          setBackupTick((t) => t + 1);
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                        aria-label="Eliminar URL de respaldo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && liveChannels.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-32 rounded-2xl bg-[#0D0D12] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {liveChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onPlayTdtChannel(ch.tdtChannel, 0, ch.nowTitle);
                }}
                className="group relative rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#FF5E1A]/60 p-4 text-left overflow-hidden cursor-pointer transition-all flex flex-col justify-between gap-3"
              >
                {ch.programArtwork && !failedImgs[`live-${ch.id}`] && (
                  <img
                    src={ch.programArtwork}
                    alt={ch.nowTitle}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImgs((prev) => ({ ...prev, [`live-${ch.id}`]: true }))
                    }
                    className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D12] via-[#0D0D12]/90 to-transparent" />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-black/70 border border-white/[0.08] flex items-center justify-center p-1.5 shrink-0">
                      {ch.logoUrl && !failedImgs[`chlogo-${ch.id}`] ? (
                        <img
                          src={ch.logoUrl}
                          alt={ch.name}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImgs((prev) => ({ ...prev, [`chlogo-${ch.id}`]: true }))
                          }
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs font-bold text-white">{ch.shortMark}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#FF8A4C] tabular-nums">
                        En directo · Dial {ch.dial}
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-white truncate">
                        {ch.name}
                      </h3>
                    </div>
                  </div>

                  <span className="w-10 h-10 rounded-full bg-[#FF5E1A]/15 group-hover:bg-[#FF5E1A] text-[#FF8A4C] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </span>
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-100 truncate">{ch.nowTitle}</span>
                    {ch.startLabel && ch.stopLabel && (
                      <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                        {ch.startLabel} – {ch.stopLabel}
                      </span>
                    )}
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-[#FF5E1A] rounded-full transition-all"
                      style={{ width: `${Math.max(8, ch.progressPct || 35)}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* CATEGORY FILTERS + PROGRAMS & SERIES CATALOG */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveCategory(tab.id);
                  }}
                  className={`min-h-11 px-4 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    isActive
                      ? 'bg-[#FF5E1A] text-white shadow-[0_6px_18px_rgba(255,94,26,0.3)]'
                      : 'bg-[#0D0D12] text-zinc-300 hover:text-white border border-white/[0.08] hover:bg-white/[0.06]'
                  }`}
                >
                  {pickLang(lang, {
                    es: tab.labelEs,
                    ca: tab.labelCa,
                    en: tab.labelEn,
                  })}
                </button>
              );
            })}
          </div>

          <span className="text-xs text-zinc-400 tabular-nums shrink-0">
            {filteredCatalog.length}{' '}
            {filteredCatalog.length === 1 ? 'programa o serie' : 'programas y series'}
          </span>
        </div>

        {loading && catalog.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-video rounded-2xl bg-[#0D0D12] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredCatalog.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCatalog.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenCatalogItem(item)}
                className="group text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#FF5E1A]/60 overflow-hidden cursor-pointer transition-all flex flex-col"
              >
                <div className="relative aspect-video w-full bg-[#14141C] overflow-hidden">
                  {item.imageUrl && !failedImgs[item.id] ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImgs((prev) => ({ ...prev, [item.id]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FF5E1A]/25 via-[#18121E] to-[#0D0D12] px-4">
                      <span className="font-display font-bold text-base text-white text-center">
                        {item.title}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                  <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-200 truncate">
                      {item.channelName} · {item.genre}
                    </span>
                    <span className="w-8 h-8 rounded-full bg-black/70 group-hover:bg-[#FF5E1A] text-white flex items-center justify-center shrink-0 transition-colors">
                      {item.kind === 'series' ? (
                        <Film className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                  <h3 className="text-sm sm:text-[15px] font-bold text-white line-clamp-1 group-hover:text-[#FF8A4C] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {item.claim || item.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-white">
              No encontramos programas con «{externalSearchQuery}»
            </p>
            <p className="text-xs text-zinc-400">
              Prueba buscando Pasapalabra, El Hormiguero, La Voz, La Ruleta, Equipo de Investigación o La casa de papel.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
