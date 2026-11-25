/**
 * @module src/components/catalog/XtreamVodSeriesShelf
 * @description Materializes synced multi-provider Xtream Movies (VOD) and Series
 * directly inside the main Cine y Series section with server summary breakdown,
 * provider/category filtering, 40-item pagination, and instant detail/playback modals.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Film, Loader2, Play, RefreshCw, Star } from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useAppStore } from '../../store/useAppStore';
import {
  XTREAM_PROVIDER_UI_SPECS,
  getXtreamProviderUiSpecByProviderId,
} from '../../config/defaultProviders';
import {
  fetchXtreamFullCatalog,
  readCachedXtreamCatalog,
  type XtreamFullCatalogPayload,
  type XtreamSeriesItem,
  type XtreamVodStreamItem,
} from '../../services/xtreamClientService';
import { XtreamCatalogSummaryBar } from '../belix/XtreamCatalogSummaryBar';
import { XtreamPosterMedia, buildVodTdtChannel } from '../belix/XtreamMediaHelpers';
import { XtreamVodDetailModal } from '../belix/XtreamVodDetailModal';
import { XtreamSeriesEpisodesModal } from '../belix/XtreamSeriesEpisodesModal';

const BATCH_SIZE = 40;

interface XtreamVodSeriesShelfProps {
  lang: AppLanguage;
  mode: 'movies' | 'series';
  trimmedSearch?: string;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
}

export const XtreamVodSeriesShelf: React.FC<XtreamVodSeriesShelfProps> = ({
  lang,
  mode,
  trimmedSearch = '',
  onPlayTdtChannel,
}) => {
  const [catalog, setCatalog] = useState<XtreamFullCatalogPayload | null>(() =>
    readCachedXtreamCatalog('all')
  );
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState(BATCH_SIZE);
  const [selectedVod, setSelectedVod] = useState<XtreamVodStreamItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<XtreamSeriesItem | null>(null);

  useEffect(() => {
    let active = true;
    const syncLocalOrFetch = async () => {
      const cached = readCachedXtreamCatalog('all');
      if (cached && active) {
        setCatalog(cached);
        return;
      }
      setLoading(true);
      const res = await fetchXtreamFullCatalog(false, 'all').catch(() => ({ ok: false as const }));
      if (active && res.ok && res.catalog) {
        setCatalog(res.catalog);
      }
      if (active) setLoading(false);
    };

    void syncLocalOrFetch();

    const onSynced = () => {
      const latest = readCachedXtreamCatalog('all');
      if (latest && active) setCatalog(latest);
    };
    window.addEventListener('belix-channels-synced', onSynced);
    return () => {
      active = false;
      window.removeEventListener('belix-channels-synced', onSynced);
    };
  }, []);

  useEffect(() => {
    setSelectedCategory('all');
    setVisibleLimit(BATCH_SIZE);
  }, [mode, selectedProvider]);

  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
  }, [selectedCategory, trimmedSearch]);

  const handleRefresh = async () => {
    triggerHaptic('light');
    setLoading(true);
    const res = await fetchXtreamFullCatalog(true, 'all').catch(() => ({ ok: false as const }));
    if (res.ok && res.catalog) {
      setCatalog(res.catalog);
    }
    setLoading(false);
  };

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!catalog) return map;
    const cats = mode === 'movies' ? catalog.vodCategories : catalog.seriesCategories;
    for (const cat of cats) {
      map.set(`${cat.providerId || 'primary'}:${cat.id}`, cat.name);
      if (!map.has(cat.id)) map.set(cat.id, cat.name);
    }
    return map;
  }, [catalog, mode]);

  const resolveCategoryName = (providerId?: string, categoryId?: string) => {
    if (!categoryId) return mode === 'movies' ? 'Películas' : 'Series';
    return (
      categoryMap.get(`${providerId || 'primary'}:${categoryId}`) ||
      categoryMap.get(categoryId) ||
      (mode === 'movies' ? 'Películas' : 'Series')
    );
  };

  const availableProviders = useMemo(() => {
    if (!catalog) return [];
    const counts = new Map<string, number>();
    const list = mode === 'movies' ? catalog.vodStreams : catalog.series;
    for (const item of list) {
      const pid = item.providerId || 'primary';
      counts.set(pid, (counts.get(pid) || 0) + 1);
    }
    return XTREAM_PROVIDER_UI_SPECS.map((spec) => ({
      ...spec,
      count: counts.get(spec.providerId) || 0,
    })).filter((s) => s.count > 0);
  }, [catalog, mode]);

  const availableCategories = useMemo(() => {
    if (!catalog) return [];
    const cats = mode === 'movies' ? catalog.vodCategories : catalog.seriesCategories;
    const scoped =
      selectedProvider === 'all'
        ? cats
        : cats.filter((c) => (c.providerId || 'primary') === selectedProvider);
    const seen = new Set<string>();
    const out: Array<{ key: string; id: string; providerId: string; name: string }> = [];
    for (const c of scoped) {
      const key = selectedProvider === 'all' ? `${c.providerId || 'primary'}:${c.id}` : c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        id: c.id,
        providerId: c.providerId || 'primary',
        name: c.name,
      });
      if (out.length >= 30) break;
    }
    return out;
  }, [catalog, mode, selectedProvider]);

  const normalizedQuery = trimmedSearch.trim().toLowerCase();

  const filteredMovies = useMemo(() => {
    if (mode !== 'movies' || !catalog) return [];
    return catalog.vodStreams.filter((item) => {
      const pid = item.providerId || 'primary';
      if (selectedProvider !== 'all' && pid !== selectedProvider) return false;
      if (selectedCategory !== 'all') {
        if (selectedProvider === 'all') {
          if (`${pid}:${item.categoryId}` !== selectedCategory) return false;
        } else if (item.categoryId !== selectedCategory) {
          return false;
        }
      }
      if (normalizedQuery) {
        const hay = `${item.name} ${item.providerName || ''} ${resolveCategoryName(pid, item.categoryId)}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [mode, catalog, selectedProvider, selectedCategory, normalizedQuery]);

  const filteredSeries = useMemo(() => {
    if (mode !== 'series' || !catalog) return [];
    return catalog.series.filter((item) => {
      const pid = item.providerId || 'primary';
      if (selectedProvider !== 'all' && pid !== selectedProvider) return false;
      if (selectedCategory !== 'all') {
        if (selectedProvider === 'all') {
          if (`${pid}:${item.categoryId}` !== selectedCategory) return false;
        } else if (item.categoryId !== selectedCategory) return false;
      }
      if (normalizedQuery) {
        const hay = `${item.name} ${item.providerName || ''} ${item.genre || ''} ${resolveCategoryName(pid, item.categoryId)}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [mode, catalog, selectedProvider, selectedCategory, normalizedQuery]);

  const totalCount = mode === 'movies' ? filteredMovies.length : filteredSeries.length;
  const visibleMovies = filteredMovies.slice(0, visibleLimit);
  const visibleSeries = filteredSeries.slice(0, visibleLimit);
  const remainingCount = Math.max(0, totalCount - visibleLimit);

  if (!loading && (!catalog || (mode === 'movies' ? catalog.vodStreams.length === 0 : catalog.series.length === 0))) {
    return null;
  }

  return (
    <section className="space-y-4 pt-2 border-t border-white/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {mode === 'movies' ? (
            <Film className="w-5 h-5 text-violet-400 shrink-0" />
          ) : (
            <Clapperboard className="w-5 h-5 text-sky-400 shrink-0" />
          )}
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
              {mode === 'movies'
                ? pickLang(lang, {
                    es: 'Catálogo VOD sincronizado (7 servidores)',
                    ca: 'Catàleg VOD sincronitzat (7 servidors)',
                    en: 'Synced VOD catalog (7 servers)',
                  })
                : pickLang(lang, {
                    es: 'Catálogo de Series sincronizado (7 servidores)',
                    ca: 'Catàleg de Sèries sincronitzat (7 servidors)',
                    en: 'Synced Series catalog (7 servers)',
                  })}
            </h3>
            <p className="text-xs text-zinc-400 tabular-nums">
              {totalCount.toLocaleString('es-ES')}{' '}
              {mode === 'movies'
                ? pickLang(lang, { es: 'películas disponibles', ca: 'pel·lícules disponibles', en: 'movies available' })
                : pickLang(lang, { es: 'series disponibles', ca: 'sèries disponibles', en: 'series available' })}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="min-h-10 px-3.5 rounded-xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-bold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <span>{pickLang(lang, { es: 'Sincronizar', ca: 'Sincronitzar', en: 'Sync' })}</span>
        </button>
      </div>

      <XtreamCatalogSummaryBar
        lang={lang}
        catalog={catalog}
        mode={mode === 'movies' ? 'vod' : 'series'}
        onOpenServerWorld={(w) => useAppStore.getState().setActiveWorld(w)}
      />

      {availableProviders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedProvider('all');
            }}
            className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              selectedProvider === 'all'
                ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
            }`}
          >
            {pickLang(lang, { es: 'Todos los servidores', ca: 'Tots els servidors', en: 'All servers' })}
          </button>

          {availableProviders.map((srv) => {
            const active = selectedProvider === srv.providerId;
            return (
              <button
                key={`cine-srv-${srv.providerId}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedProvider(srv.providerId);
                }}
                className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer transition-colors ${
                  active
                    ? 'bg-white text-black border-white'
                    : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: srv.accent }}
                />
                <span>{srv.name}</span>
                <span className="font-mono text-[11px] opacity-75 tabular-nums">
                  {srv.count.toLocaleString('es-ES')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {availableCategories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedCategory('all');
            }}
            className={`min-h-9 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              selectedCategory === 'all'
                ? 'bg-white/15 border-white/30 text-white'
                : 'bg-black/40 border-white/[0.07] text-zinc-400 hover:text-white'
            }`}
          >
            {pickLang(lang, { es: 'Todas las categorías', ca: 'Totes les categories', en: 'All categories' })}
          </button>
          {availableCategories.map((cat) => {
            const val = selectedProvider === 'all' ? cat.key : cat.id;
            const active = selectedCategory === val;
            return (
              <button
                key={`cine-cat-${cat.key}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedCategory(val);
                }}
                className={`min-h-9 px-3 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-black/40 border-white/[0.07] text-zinc-400 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {loading && totalCount === 0 ? (
        <div className="py-10 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <span>{pickLang(lang, { es: 'Cargando catálogo...', ca: 'Carregant catàleg...', en: 'Loading catalog...' })}</span>
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-6 text-center text-xs text-zinc-400">
          {pickLang(lang, {
            es: 'No hay títulos que coincidan con este filtro o búsqueda.',
            ca: 'No hi ha títols que coincideixin amb aquest filtre o cerca.',
            en: 'No titles match this filter or search.',
          })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {mode === 'movies'
              ? visibleMovies.map((movie) => {
                  const spec = getXtreamProviderUiSpecByProviderId(movie.providerId || 'primary');
                  const catName = resolveCategoryName(movie.providerId, movie.categoryId);
                  return (
                    <div
                      key={`shelf-vod-${movie.providerId || 'p'}-${movie.streamId}`}
                      className="group rounded-2xl bg-[#0B0C12] border border-white/[0.07] hover:border-white/25 overflow-hidden flex flex-col transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSelectedVod(movie);
                        }}
                        className="relative aspect-[2/3] w-full overflow-hidden bg-black/60 cursor-pointer text-left"
                      >
                        <XtreamPosterMedia
                          src={movie.streamIcon}
                          alt={movie.name}
                          variant="vod"
                          accentColor={spec?.accent || '#8B5CF6'}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                        {movie.providerName && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-white/10 text-[10px] font-bold text-zinc-200 max-w-[75%] truncate">
                            {movie.providerName}
                          </span>
                        )}
                        {movie.rating && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-amber-300 inline-flex items-center gap-0.5 tabular-nums">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            {movie.rating}
                          </span>
                        )}
                      </button>
                      <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-white line-clamp-2 leading-snug">
                            {movie.name}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{catName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('success');
                            onPlayTdtChannel(
                              buildVodTdtChannel(movie, catName, spec?.accent || '#8B5CF6'),
                              0
                            );
                          }}
                          className="min-h-9 w-full rounded-xl bg-white/[0.08] hover:bg-white text-white hover:text-black text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Play' })}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              : visibleSeries.map((ser) => {
                  const spec = getXtreamProviderUiSpecByProviderId(ser.providerId || 'primary');
                  const catName = resolveCategoryName(ser.providerId, ser.categoryId);
                  return (
                    <button
                      key={`shelf-ser-${ser.providerId || 'p'}-${ser.seriesId}`}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedSeries(ser);
                      }}
                      className="group rounded-2xl bg-[#0B0C12] border border-white/[0.07] hover:border-white/25 overflow-hidden flex flex-col text-left cursor-pointer transition-colors"
                    >
                      <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/60">
                        <XtreamPosterMedia
                          src={ser.cover}
                          alt={ser.name}
                          variant="series"
                          accentColor={spec?.accent || '#0EA5E9'}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                        {ser.providerName && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-white/10 text-[10px] font-bold text-zinc-200 max-w-[75%] truncate">
                            {ser.providerName}
                          </span>
                        )}
                        {ser.rating && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-amber-300 inline-flex items-center gap-0.5 tabular-nums">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            {ser.rating}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 space-y-0.5">
                        <p className="text-xs font-bold text-white line-clamp-2 leading-snug">
                          {ser.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{catName}</p>
                      </div>
                    </button>
                  );
                })}
          </div>

          {remainingCount > 0 && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setVisibleLimit((prev) => prev + BATCH_SIZE);
                }}
                className="min-h-11 px-5 rounded-2xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.12] text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer transition-colors tabular-nums"
              >
                <span>
                  {pickLang(lang, {
                    es: `Cargar ${Math.min(BATCH_SIZE, remainingCount)} más (${remainingCount.toLocaleString('es-ES')} restantes)`,
                    ca: `Carregar ${Math.min(BATCH_SIZE, remainingCount)} més (${remainingCount.toLocaleString('es-ES')} restants)`,
                    en: `Load ${Math.min(BATCH_SIZE, remainingCount)} more (${remainingCount.toLocaleString('es-ES')} left)`,
                  })}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      <XtreamVodDetailModal
        movie={selectedVod}
        categoryName={selectedVod ? resolveCategoryName(selectedVod.providerId, selectedVod.categoryId) : 'Películas'}
        accentColor={getXtreamProviderUiSpecByProviderId(selectedVod?.providerId || 'primary')?.accent}
        lang={lang}
        onClose={() => setSelectedVod(null)}
        onPlayTdtChannel={onPlayTdtChannel}
      />

      <XtreamSeriesEpisodesModal
        series={selectedSeries}
        categoryName={selectedSeries ? resolveCategoryName(selectedSeries.providerId, selectedSeries.categoryId) : 'Series'}
        accentColor={getXtreamProviderUiSpecByProviderId(selectedSeries?.providerId || 'primary')?.accent}
        lang={lang}
        onClose={() => setSelectedSeries(null)}
        onPlayTdtChannel={onPlayTdtChannel}
      />
    </section>
  );
};
