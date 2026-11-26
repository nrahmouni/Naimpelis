/**
 * @module LiveTvWorldView
 * @description World 3 (TV en Directo) — Redesigned Apple TV / broadcast-grade TV hub with
 * Live Spotlight Rail (Spanish TDT + Football prioritized by fastest/highest quality),
 * multi-server signal merging, real-time EPG indicator bars, and responsive multi-column grid.
 */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Clock, Loader2, Play, Search, SlidersHorizontal, Sparkles, Star, X } from 'lucide-react';
import type {
  AppLanguage,
  ChannelLiveEpg,
  FavoriteChannelItem,
  SpanishTdtChannel,
  TdtCategory,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { buildChannelFavId } from '../../utils/storage';
import { ChannelLogoBadge, type TvRegionId } from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { SegmentedControl } from '../ui/DesignSystem';
import {
  ADRAR_COUNTRY_FILTERS,
  ALL_LIVE_CATEGORIES,
  TDT_NATIONAL_CATEGORIES,
  TV_FILTER_GROUPS,
} from './catalogConstants';
import { LiveTvFilterSheet } from './LiveTvFilterSheet';
import { LiveTvChannelRow } from './LiveTvChannelRow';
import { LiveTvSpotlightRail } from './LiveTvSpotlightRail';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { useAppStore } from '../../store/useAppStore';
import { inferStreamQualityTag } from '../../utils/channelQualityRanker';

const RECENT_TV_STORAGE_KEY = 'riffan_recent_tv_v1';
const CHANNELS_BATCH_SIZE = 40;

interface PullRefreshHandlers {
  containerRef: React.RefObject<HTMLDivElement | null>;
  pullDistance: number;
  isRefreshing: boolean;
  pullHandlers: Record<string, unknown>;
}

interface LiveTvWorldViewProps {
  lang: AppLanguage;
  shareRoomId?: string;
  pull: PullRefreshHandlers;
  tdtChannels: SpanishTdtChannel[];
  filteredChannels: SpanishTdtChannel[];
  loadingTdt: boolean;
  tdtFetchError?: boolean;
  activeVideoRawUrl: string;
  tdtCategory: 'all' | 'tdt_all' | TdtCategory;
  tvRegion: TvRegionId;
  tvFavOnly: boolean;
  epgFilter: 'all' | 'sports_now' | 'cinema_now';
  epgMadridClock: string;
  tvFiltersOpen: boolean;
  adrarCountryFilter?: string;
  tvCategoryCounts: {
    perCategory: Record<string, number>;
    perRegion: Record<string, number>;
  };
  getChannelLiveEpg: (channelId: string) => ChannelLiveEpg | null;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlayTdtChannel: (ch: SpanishTdtChannel, signalIdx: number, liveHint?: string) => void;
  onOpenEpgModal: (ch: SpanishTdtChannel) => void;
  onTvFiltersOpenChange: (open: boolean) => void;
  onTvFavOnlyChange: (value: boolean) => void;
  onTvRegionChange: (region: TvRegionId) => void;
  onTdtCategoryChange: (cat: 'all' | 'tdt_all' | TdtCategory) => void;
  onEpgFilterChange: (filter: 'all' | 'sports_now' | 'cinema_now') => void;
  onAdrarCountryFilterChange?: (country: string) => void;
  onRetryFetchTdt?: () => void;
}

export const LiveTvWorldView: React.FC<LiveTvWorldViewProps> = ({
  lang,
  pull,
  tdtChannels,
  filteredChannels,
  loadingTdt,
  tdtFetchError = false,
  activeVideoRawUrl,
  tdtCategory,
  tvRegion,
  tvFavOnly,
  epgFilter,
  epgMadridClock,
  tvFiltersOpen,
  adrarCountryFilter = 'all',
  tvCategoryCounts,
  getChannelLiveEpg,
  isChannelFavorited,
  onToggleChannelFavorite,
  onPlayTdtChannel,
  onOpenEpgModal,
  onTvFiltersOpenChange,
  onTvFavOnlyChange,
  onTvRegionChange,
  onTdtCategoryChange,
  onEpgFilterChange,
  onAdrarCountryFilterChange,
  onRetryFetchTdt,
}) => {
  const priorityMode = useAppStore((s) => s.playbackPriorityMode);
  const setPriorityMode = useAppStore((s) => s.setPlaybackPriorityMode);
  const [inlineQuery, setInlineQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(CHANNELS_BATCH_SIZE);
  const [signalsChannel, setSignalsChannel] = useState<SpanishTdtChannel | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_TV_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  useBackInterceptor(
    Boolean(signalsChannel),
    'livetv-signals-sheet',
    () => setSignalsChannel(null),
    { priority: 22 }
  );

  useEffect(() => {
    if (!signalsChannel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSignalsChannel(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [signalsChannel]);

  useEffect(() => {
    setVisibleLimit(CHANNELS_BATCH_SIZE);
  }, [tvRegion, tdtCategory, tvFavOnly, epgFilter, adrarCountryFilter, inlineQuery]);

  const handlePlayAndRecord = useCallback(
    (ch: SpanishTdtChannel, liveTitle?: string) => {
      triggerHaptic('success');
      setRecentIds((prev) => {
        const next = [ch.id, ...prev.filter((id) => id !== ch.id)].slice(0, 8);
        try {
          localStorage.setItem(RECENT_TV_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
      onPlayTdtChannel(ch, 0, liveTitle);
    },
    [onPlayTdtChannel]
  );

  const matchedAllCat = ALL_LIVE_CATEGORIES.find((c) => c.id === tdtCategory);
  const matchedNatCat = TDT_NATIONAL_CATEGORIES.find((c) => c.id === tdtCategory);
  const matchedRegion = TV_FILTER_GROUPS.find((g) => g.region === tvRegion);
  const activeCatLabel = matchedAllCat && tdtCategory !== 'all'
    ? pickLang(lang, matchedAllCat)
    : matchedNatCat
    ? pickLang(lang, matchedNatCat)
    : matchedRegion
    ? pickLang(lang, matchedRegion.name)
    : pickLang(lang, { es: 'Todos los canales', ca: 'Tots els canals', en: 'All channels' });

  const tvFilterCount =
    (tvRegion !== 'all' ? 1 : 0) +
    (tdtCategory !== 'all' ? 1 : 0) +
    (epgFilter !== 'all' ? 1 : 0) +
    (tvFavOnly ? 1 : 0);

  const isSpainCategory =
    tdtCategory === 'tdt_all' ||
    tdtCategory === 'generalistas' ||
    tdtCategory === 'movistar' ||
    tdtCategory === 'dazn' ||
    tdtCategory === 'cine_series' ||
    tdtCategory === 'entretenimiento' ||
    tdtCategory === 'noticias_deportes' ||
    tdtCategory === 'infantil_autonomicas';

  const mainScopeTab: 'es' | 'all' | 'football' | 'favs' = tvFavOnly
    ? 'favs'
    : epgFilter === 'sports_now' && tvRegion === 'all' && tdtCategory === 'all'
    ? 'football'
    : tvRegion === 'es' || (tvRegion === 'all' && isSpainCategory)
    ? 'es'
    : 'all';

  const deferredInlineQuery = useDeferredValue(inlineQuery);
  const normalizedQuery = deferredInlineQuery.trim().toLowerCase();

  const preIndexedStaticHaystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const ch of filteredChannels) {
      map.set(
        ch.id,
        `${ch.name} ${ch.network} ${ch.shortMark} ${ch.countryCode || ''} ${ch.dial || ''} ${ch.description || ''}`.toLowerCase()
      );
    }
    return map;
  }, [filteredChannels]);

  const searchScopedChannels = useMemo(() => {
    if (!normalizedQuery) return filteredChannels;
    return filteredChannels.filter((ch) => {
      const staticBlob = preIndexedStaticHaystacks.get(ch.id) || '';
      if (staticBlob.includes(normalizedQuery)) return true;
      const chEpg = getChannelLiveEpg(ch.id);
      const epgTitle = chEpg?.now?.title;
      return Boolean(epgTitle && epgTitle.toLowerCase().includes(normalizedQuery));
    });
  }, [filteredChannels, preIndexedStaticHaystacks, normalizedQuery, getChannelLiveEpg]);

  const recentChannels = useMemo(() => {
    if (recentIds.length === 0 || tvFavOnly || normalizedQuery) return [];
    const byId = new Map<string, SpanishTdtChannel>();
    for (const ch of tdtChannels) {
      byId.set(ch.id, ch);
    }
    return recentIds
      .map((id) => byId.get(id))
      .filter((ch): ch is SpanishTdtChannel => Boolean(ch));
  }, [recentIds, tdtChannels, tvFavOnly, normalizedQuery]);

  const { pinnedFavorites, remainingChannels } = useMemo(() => {
    if (tvFavOnly) {
      return { pinnedFavorites: [], remainingChannels: searchScopedChannels };
    }
    const favs: SpanishTdtChannel[] = [];
    const rest: SpanishTdtChannel[] = [];
    for (const ch of searchScopedChannels) {
      const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
      if (isChannelFavorited(favId)) {
        favs.push(ch);
      } else {
        rest.push(ch);
      }
    }
    return { pinnedFavorites: favs, remainingChannels: rest };
  }, [searchScopedChannels, isChannelFavorited, tvFavOnly]);

  const displayedRemaining = remainingChannels.slice(0, visibleLimit);
  const remainingHiddenCount = Math.max(0, remainingChannels.length - displayedRemaining.length);

  const resetAllFilters = () => {
    triggerHaptic('light');
    setInlineQuery('');
    onTvFavOnlyChange(false);
    onTvRegionChange('all');
    onTdtCategoryChange('all');
    onEpgFilterChange('all');
    onAdrarCountryFilterChange?.('all');
  };

  useBackInterceptor(
    inlineQuery.trim() !== '',
    'livetv-inline-search',
    () => setInlineQuery(''),
    { priority: 6 }
  );

  const hasIntraTvFilters =
    tvFavOnly ||
    tvRegion !== 'all' ||
    tdtCategory !== 'all' ||
    epgFilter !== 'all' ||
    adrarCountryFilter !== 'all';

  useBackInterceptor(
    hasIntraTvFilters,
    'livetv-intra-filters',
    () => {
      resetAllFilters();
      return true;
    },
    { priority: 5 }
  );

  const renderChannelRow = (ch: SpanishTdtChannel) => (
    <LiveTvChannelRow
      key={ch.id}
      channel={ch}
      lang={lang}
      chEpg={getChannelLiveEpg(ch.id)}
      activeVideoRawUrl={activeVideoRawUrl}
      isChannelFavorited={isChannelFavorited}
      onToggleChannelFavorite={onToggleChannelFavorite}
      onPlayChannel={handlePlayAndRecord}
      onOpenEpgModal={onOpenEpgModal}
      onOpenSignalsModal={setSignalsChannel}
    />
  );

  const showSpotlight = !tvFavOnly && !normalizedQuery && tvRegion === 'all' && tdtCategory === 'all' && epgFilter === 'all';

  return (
    <div ref={pull.containerRef} {...pull.pullHandlers} className="space-y-5 max-w-7xl mx-auto">
      {pull.pullDistance > 10 && (
        <div className="text-center text-xs text-[#A78BFA] font-semibold py-1">
          {pull.isRefreshing
            ? pickLang(lang, {
                es: 'Actualizando guía...',
                ca: 'Actualitzant guia...',
                en: 'Refreshing guide...',
              })
            : pickLang(lang, {
                es: 'Suelta para actualizar',
                ca: 'Deixa anar per actualitzar',
                en: 'Release to refresh',
              })}
        </div>
      )}

      {/* COMPACT BROADCAST HEADER: [TDT España | Todo | Fútbol | Favoritos] + Search + Filtros */}
      <div className="space-y-2.5">
        <SegmentedControl
          layoutId="tv-main-tabs"
          value={mainScopeTab}
          onChange={(next) => {
            triggerHaptic('light');
            if (next === 'favs') {
              onTvFavOnlyChange(true);
            } else if (next === 'es') {
              onTvFavOnlyChange(false);
              onTvRegionChange('es');
              onTdtCategoryChange('all');
              onEpgFilterChange('all');
              onAdrarCountryFilterChange?.('all');
            } else if (next === 'football') {
              onTvFavOnlyChange(false);
              onTvRegionChange('all');
              onTdtCategoryChange('all');
              onEpgFilterChange('sports_now');
              onAdrarCountryFilterChange?.('all');
            } else {
              onTvFavOnlyChange(false);
              onTvRegionChange('all');
              onTdtCategoryChange('all');
              onEpgFilterChange('all');
              onAdrarCountryFilterChange?.('all');
            }
          }}
          options={[
            { id: 'es', label: pickLang(lang, { es: 'TDT España', ca: 'TDT Espanya', en: 'Spain TDT' }) },
            { id: 'all', label: pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'All' }) },
            { id: 'football', label: pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' }) },
            { id: 'favs', label: pickLang(lang, { es: 'Favoritos', ca: 'Favorits', en: 'Favorites' }) },
          ]}
        />

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-tv-focusable="true"
              value={inlineQuery}
              onChange={(e) => setInlineQuery(e.target.value)}
              placeholder={
                tdtChannels.length > 0
                  ? pickLang(lang, {
                      es: `Buscar canal (${tdtChannels.length}), dial o programa...`,
                      ca: `Cercar canal (${tdtChannels.length}), dial o programa...`,
                      en: `Search ${tdtChannels.length} channels, dial # or show...`,
                    })
                  : pickLang(lang, {
                      es: 'Buscar canal, nº dial o programa...',
                      ca: 'Cercar canal, núm. dial o programa...',
                      en: 'Search channel, dial # or show...',
                    })
              }
              className="w-full min-h-11 pl-10 pr-10 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-[#7C3AED] text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors tv-focus-ring"
            />
            {inlineQuery && (
              <button
                type="button"
                data-tv-focusable="true"
                onClick={() => setInlineQuery('')}
                aria-label={pickLang(lang, { es: 'Limpiar búsqueda', ca: 'Netejar cerca', en: 'Clear search' })}
                className="min-w-10 min-h-10 rounded-xl hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center absolute right-0.5 top-1/2 -translate-y-1/2 cursor-pointer tv-focus-ring"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label={pickLang(lang, {
                es: 'Prioridad de emisión',
                ca: 'Prioritat d’emissió',
                en: 'Stream priority',
              })}
              className="grid grid-cols-2 p-1 rounded-2xl bg-[#0D0D12] border border-white/[0.08] flex-1 sm:flex-initial"
            >
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setPriorityMode('es_quality');
                }}
                className={`min-h-11 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  priorityMode === 'es_quality'
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {pickLang(lang, { es: 'Castellano HQ', ca: 'Castellà HQ', en: 'Spanish HQ' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setPriorityMode('best_quality');
                }}
                className={`min-h-11 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  priorityMode === 'best_quality'
                    ? 'bg-emerald-500/90 text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{pickLang(lang, { es: 'Máxima 4K', ca: 'Màxima 4K', en: 'Max 4K' })}</span>
              </button>
            </div>

            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                onTvFiltersOpenChange(true);
              }}
              className={`min-h-11 px-3.5 rounded-2xl border text-xs font-bold whitespace-nowrap inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all tv-focus-ring ${
                tvFilterCount > 0 && mainScopeTab === 'all'
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_20px_rgba(124,58,237,0.38)]'
                  : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
              }`}
            >
              <SlidersHorizontal
                className={`w-4 h-4 ${
                  tvFilterCount > 0 && mainScopeTab === 'all' ? 'text-white' : 'text-[#A78BFA]'
                }`}
              />
              <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
              {tvFilterCount > 0 && mainScopeTab === 'all' && (
                <span className="font-mono text-[11px] tabular-nums opacity-90">
                  ({tvFilterCount})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* SINGLE SLIM CONTEXTUAL CHIP ROW */}
        {!tvFavOnly && mainScopeTab === 'es' && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                onTvRegionChange('es');
                onTdtCategoryChange('all');
                onEpgFilterChange('all');
              }}
              className={`min-h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all tv-focus-ring ${
                tvRegion === 'es' && tdtCategory === 'all'
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                  : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
              }`}
            >
              <FlagBadgeSvg code="es" className="w-4 h-2.5 shrink-0" />
              <span>{pickLang(lang, { es: 'Toda España', ca: 'Tota Espanya', en: 'All Spain' })}</span>
              <span className="font-mono text-[11px] opacity-80 tabular-nums">
                {tvCategoryCounts.perRegion['es'] ?? 0}
              </span>
            </button>

            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                onTvRegionChange('es');
                onTdtCategoryChange(tdtCategory === 'tdt_all' ? 'all' : 'tdt_all');
                onEpgFilterChange('all');
              }}
              className={`min-h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all tv-focus-ring ${
                tdtCategory === 'tdt_all'
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                  : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
              }`}
            >
              <span>{pickLang(lang, { es: 'TDT Nacional', ca: 'TDT Nacional', en: 'National TDT' })}</span>
            </button>

            {(
              [
                ['generalistas', pickLang(lang, { es: 'Generalistas 1–6', ca: 'Generalistes 1–6', en: 'Main 1–6' })],
                ['movistar', 'Movistar+'],
                ['dazn', 'DAZN'],
                ['cine_series', pickLang(lang, { es: 'Cine TV', ca: 'Cinema TV', en: 'Cinema TV' })],
                ['infantil_autonomicas', pickLang(lang, { es: 'Autonómicas', ca: 'Autonòmiques', en: 'Regional' })],
              ] as const
            ).map(([catId, label]) => {
              const count = tvCategoryCounts.perCategory[catId] ?? 0;
              if (count === 0) return null;
              const active = tdtCategory === catId;
              return (
                <button
                  key={`es-chip-${catId}`}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('light');
                    onTvRegionChange('es');
                    onTdtCategoryChange(active ? 'all' : catId);
                    onEpgFilterChange('all');
                  }}
                  className={`min-h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all tv-focus-ring ${
                    active
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                      : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{label}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {!tvFavOnly && mainScopeTab === 'all' && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {TV_FILTER_GROUPS.filter((group) => group.region !== 'docs').map((group) => {
              const count = tvCategoryCounts.perRegion[group.region] ?? 0;
              if (count === 0) return null;
              const active = tvRegion === group.region;
              return (
                <button
                  key={group.region}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('light');
                    onTvRegionChange(active ? 'all' : group.region);
                    onTdtCategoryChange('all');
                    onAdrarCountryFilterChange?.('all');
                  }}
                  className={`min-h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all tv-focus-ring ${
                    active
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                      : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <FlagBadgeSvg code={group.flagCode} className="w-4 h-2.5 shrink-0" />
                  <span>
                    {group.region === 'es'
                      ? pickLang(lang, { es: 'TDT España', ca: 'TDT Espanya', en: 'Spain TDT' })
                      : pickLang(lang, group.name)}
                  </span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* LIVE SPOTLIGHT: TOP SPANISH TDT & FOOTBALL */}
      {showSpotlight && (
        <LiveTvSpotlightRail
          lang={lang}
          channels={tdtChannels}
          activeVideoRawUrl={activeVideoRawUrl}
          getChannelLiveEpg={getChannelLiveEpg}
          onPlayChannel={handlePlayAndRecord}
        />
      )}

      {/* QUIET METADATA SUMMARY LINE */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-400">
        <span className="tabular-nums leading-snug">
          {activeCatLabel} · {searchScopedChannels.length}{' '}
          {pickLang(lang, { es: 'canales', ca: 'canals', en: 'channels' })}
          {epgMadridClock ? ` · ${epgMadridClock}` : ''}
        </span>
        {(tvRegion !== 'all' || tdtCategory !== 'all' || epgFilter !== 'all' || tvFavOnly || Boolean(inlineQuery)) && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="min-h-11 px-2 text-xs font-semibold text-[#C4B5FD] hover:text-white shrink-0 cursor-pointer"
          >
            {pickLang(lang, { es: 'Ver todos', ca: 'Veure tots', en: 'Show all' })}
          </button>
        )}
      </div>

      {tvRegion === 'adrar_europa' && !tvFavOnly && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {ADRAR_COUNTRY_FILTERS.map((ctry) => {
            const active = adrarCountryFilter === ctry.id;
            return (
              <button
                key={ctry.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onAdrarCountryFilterChange?.(ctry.id);
                }}
                className={`min-h-11 px-3.5 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                  active
                    ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                    : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                <FlagBadgeSvg code={ctry.flagCode} className="w-3.5 h-2.5 shrink-0" />
                <span>{pickLang(lang, ctry)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* RECENT CHANNELS QUICK STRIP */}
      {recentChannels.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <Clock className="w-3.5 h-3.5 text-[#A78BFA]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {pickLang(lang, { es: 'Vistos recientemente', ca: 'Vistos recentment', en: 'Recently watched' })}
            </h3>
          </div>
          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {recentChannels.map((ch) => {
              const chEpg = getChannelLiveEpg(ch.id);
              const isPlaying = Boolean(
                activeVideoRawUrl && ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
              );
              return (
                <button
                  key={`recent-${ch.id}`}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => handlePlayAndRecord(ch, chEpg?.now?.title)}
                  className={`min-h-12 px-3 py-2 rounded-2xl border shrink-0 flex items-center gap-2.5 cursor-pointer active:scale-95 transition-all tv-focus-ring ${
                    isPlaying
                      ? 'bg-[#7C3AED]/20 border-[#7C3AED] text-white'
                      : 'bg-[#0D0D12] border-white/[0.08] hover:border-white/20 text-zinc-200'
                  }`}
                >
                  <ChannelLogoBadge channel={ch} size="sm" />
                  <div className="text-left">
                    <div className="text-xs font-bold text-white leading-tight whitespace-nowrap">
                      {ch.name}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                      Dial {ch.dial}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {loadingTdt && searchScopedChannels.length === 0 ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#7C3AED]" />
        </div>
      ) : searchScopedChannels.length === 0 ? (
        <div className="py-10 px-4 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-center space-y-3">
          <p className="text-sm font-semibold text-zinc-200">
            {tdtChannels.length === 0 || tdtFetchError
              ? pickLang(lang, {
                  es: 'No se pudo cargar la guía de canales en este momento.',
                  ca: 'No s’ha pogut carregar la guia de canals ara mateix.',
                  en: 'Could not load the channel guide right now.',
                })
              : tvFavOnly
              ? pickLang(lang, {
                  es: 'Todavía no tienes canales favoritos guardados.',
                  ca: 'Encara no tens canals favorits desats.',
                  en: 'You have no favorite channels saved yet.',
                })
              : pickLang(lang, {
                  es: 'No hay canales con este filtro o búsqueda.',
                  ca: 'No hi ha canals amb aquest filtre o cerca.',
                  en: 'No channels match this filter or search.',
                })}
          </p>
          <button
            type="button"
            data-tv-focusable="true"
            onClick={() => {
              if ((tdtChannels.length === 0 || tdtFetchError) && onRetryFetchTdt) {
                onRetryFetchTdt();
              } else {
                resetAllFilters();
              }
            }}
            className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all tv-focus-ring"
          >
            {tdtChannels.length === 0 || tdtFetchError
              ? pickLang(lang, {
                  es: 'Reintentar carga',
                  ca: 'Tornar a carregar',
                  en: 'Retry loading',
                })
              : pickLang(lang, {
                  es: 'Ver todos los canales',
                  ca: 'Veure tots els canals',
                  en: 'Show all channels',
                })}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {pinnedFavorites.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Star className="w-4 h-4 text-[#A78BFA] fill-current" />
                <h3 className="text-sm font-bold text-white">
                  {pickLang(lang, { es: 'Favoritos', ca: 'Favorits', en: 'Favorites' })}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pinnedFavorites.map(renderChannelRow)}
              </div>
            </section>
          )}

          {displayedRemaining.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {pinnedFavorites.length > 0
                    ? pickLang(lang, {
                        es: 'Todos los canales',
                        ca: 'Tots els canals',
                        en: 'All channels',
                      })
                    : pickLang(lang, {
                        es: 'Canales ordenados por calidad y señal',
                        ca: 'Canals ordenats per qualitat i senyal',
                        en: 'Channels ranked by quality & signal',
                      })}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {displayedRemaining.map(renderChannelRow)}
              </div>

              {remainingHiddenCount > 0 && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    data-tv-focusable="true"
                    onClick={() => {
                      triggerHaptic('light');
                      setVisibleLimit((prev) => prev + CHANNELS_BATCH_SIZE);
                    }}
                    className="min-h-12 px-6 rounded-2xl bg-[#0D0D12] hover:bg-[#171722] border border-white/[0.12] hover:border-[#7C3AED]/60 text-xs sm:text-sm font-bold text-white inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all tv-focus-ring"
                  >
                    <span>
                      {pickLang(lang, {
                        es: `Mostrar más canales (+${Math.min(CHANNELS_BATCH_SIZE, remainingHiddenCount)} de ${remainingHiddenCount} restantes)`,
                        ca: `Mostrar més canals (+${Math.min(CHANNELS_BATCH_SIZE, remainingHiddenCount)} de ${remainingHiddenCount} restants)`,
                        en: `Show more channels (+${Math.min(CHANNELS_BATCH_SIZE, remainingHiddenCount)} of ${remainingHiddenCount} left)`,
                      })}
                    </span>
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <LiveTvFilterSheet
        lang={lang}
        isOpen={tvFiltersOpen}
        totalChannelsCount={tdtChannels.length}
        tvFavOnly={tvFavOnly}
        tvRegion={tvRegion}
        tdtCategory={tdtCategory}
        epgFilter={epgFilter}
        tvCategoryCounts={tvCategoryCounts}
        onClose={() => onTvFiltersOpenChange(false)}
        onTvFavOnlyChange={onTvFavOnlyChange}
        onTvRegionChange={onTvRegionChange}
        onTdtCategoryChange={onTdtCategoryChange}
        onEpgFilterChange={onEpgFilterChange}
        onResetAdrarCountry={() => onAdrarCountryFilterChange?.('all')}
      />

      {signalsChannel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={signalsChannel.name}
          className="fixed inset-0 z-[125] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSignalsChannel(null);
          }}
        >
          <div className="w-full sm:max-w-xl max-h-[85dvh] rounded-t-3xl sm:rounded-3xl bg-[#0D0D12]/96 backdrop-blur-xl border-t sm:border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="pt-2.5 sm:hidden flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-white/20" />
            </div>

            <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-3 pb-3.5 border-b border-white/[0.08]">
              <div className="min-w-0 space-y-1">
                <h2 className="font-display font-bold text-base sm:text-lg text-white leading-tight truncate">
                  {signalsChannel.name}
                </h2>
                <p className="text-xs text-zinc-400 tabular-nums">
                  {pickLang(lang, {
                    es: `${signalsChannel.channels.length} señales disponibles · Selecciona servidor o calidad`,
                    ca: `${signalsChannel.channels.length} senyals disponibles · Tria servidor o qualitat`,
                    en: `${signalsChannel.channels.length} signals available · Pick server or quality`,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSignalsChannel(null)}
                aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
                className="min-w-11 min-h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2 custom-scrollbar">
              {signalsChannel.channels.map((sig, idx) => {
                const qTag = inferStreamQualityTag(sig.quality, sig.label, sig.sourceUrl).label;
                const isActive = Boolean(activeVideoRawUrl && sig.sourceUrl === activeVideoRawUrl);
                const serverTitle = sig.providerName || sig.label || `Señal ${idx + 1}`;
                const liveNow = getChannelLiveEpg(signalsChannel.id)?.now?.title;
                return (
                  <button
                    key={`${sig.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      const target = signalsChannel;
                      setSignalsChannel(null);
                      triggerHaptic('success');
                      onPlayTdtChannel(target, idx, liveNow);
                    }}
                    className={`w-full min-h-12 p-3 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                      isActive || idx === 0
                        ? 'bg-[#7C3AED]/16 border-[#7C3AED]/70 hover:bg-[#7C3AED]/24'
                        : 'bg-[#14141C] border-white/[0.07] hover:bg-[#1C1C26] hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-white truncate">{serverTitle}</span>
                        {idx === 0 && (
                          <span className="text-[11px] font-semibold text-[#C4B5FD] shrink-0">
                            · {pickLang(lang, { es: 'Prioritaria', ca: 'Prioritària', en: 'Primary' })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 truncate">{sig.label}</p>
                      <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                        {[
                          qTag,
                          sig.langLabel || sig.lang || 'ES',
                          sig.health?.latencyMs ? `${sig.health.latencyMs} ms` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <span className="min-w-10 min-h-10 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center shrink-0">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
