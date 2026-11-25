/**
 * @module LiveTvWorldView
 * @description World 3 (TV en Directo) — OLED channel cards, pinned favorites section,
 * untruncated channel/EPG names, real-time EPG indicator bars, and region/EPG filter bottom sheet.
 */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Clock, Film, Globe, Loader2, Radio, Search, SlidersHorizontal, Star, Trophy, X } from 'lucide-react';
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
import { useBackInterceptor } from '../../lib/backInterceptor';
import { useAppStore } from '../../store/useAppStore';
import {
  readCachedXtreamCatalog,
  type XtreamFullCatalogPayload,
} from '../../services/xtreamClientService';
import { XtreamCatalogSummaryBar } from '../belix/XtreamCatalogSummaryBar';

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
}

export const LiveTvWorldView: React.FC<LiveTvWorldViewProps> = ({
  lang,
  pull,
  tdtChannels,
  filteredChannels,
  loadingTdt,
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
}) => {
  const [inlineQuery, setInlineQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(CHANNELS_BATCH_SIZE);
  const [xtreamCatalog, setXtreamCatalog] = useState<XtreamFullCatalogPayload | null>(() =>
    readCachedXtreamCatalog('all')
  );
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_TV_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const onSynced = () => setXtreamCatalog(readCachedXtreamCatalog('all'));
    window.addEventListener('belix-channels-synced', onSynced);
    return () => window.removeEventListener('belix-channels-synced', onSynced);
  }, []);

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

  const mainScopeTab: 'all' | 'es' | 'favs' = tvFavOnly
    ? 'favs'
    : tvRegion === 'es' && tdtCategory === 'all'
    ? 'es'
    : 'all';

  const deferredInlineQuery = useDeferredValue(inlineQuery);
  const normalizedQuery = deferredInlineQuery.trim().toLowerCase();

  const searchScopedChannels = useMemo(() => {
    if (!normalizedQuery) return filteredChannels;
    return filteredChannels.filter((ch) => {
      const chEpg = getChannelLiveEpg(ch.id);
      const haystack = [
        ch.name,
        ch.network,
        ch.shortMark,
        ch.countryCode || '',
        String(ch.dial || ''),
        ch.description || '',
        chEpg?.now?.title || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [filteredChannels, normalizedQuery, getChannelLiveEpg]);

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
    />
  );

  return (
    <div ref={pull.containerRef} {...pull.pullHandlers} className="space-y-4">
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

      {/* MULTI-SERVER LIVE SYNC SUMMARY */}
      <XtreamCatalogSummaryBar
        lang={lang}
        catalog={xtreamCatalog}
        mode="live"
        onOpenServerWorld={(w) => useAppStore.getState().setActiveWorld(w)}
      />

      {/* CLEAN SINGLE TOOLBAR: [Todos | España | Favoritos] + [Regiones y filtros] */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex-1 min-w-0">
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
                onAdrarCountryFilterChange?.('all');
              } else {
                onTvFavOnlyChange(false);
                onTvRegionChange('all');
                onTdtCategoryChange('all');
                onAdrarCountryFilterChange?.('all');
              }
            }}
            options={[
              { id: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
              { id: 'es', label: 'España' },
              { id: 'favs', label: pickLang(lang, { es: 'Favoritos', ca: 'Favorits', en: 'Favorites' }) },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onTvFiltersOpenChange(true);
          }}
          className={`min-h-12 px-4 rounded-2xl border text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95 transition-all ${
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
          <span>{pickLang(lang, { es: 'Regiones y filtros', ca: 'Regions i filtres', en: 'Regions & filters' })}</span>
          {tvFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-white/15 font-mono text-[11px] tabular-nums leading-none">
              {tvFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* INLINE CHANNEL / DIAL SEARCH + QUICK EPG FILTER */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={inlineQuery}
            onChange={(e) => setInlineQuery(e.target.value)}
            placeholder={pickLang(lang, {
              es: `Buscar entre ${tdtChannels.length || 900}+ canales, nº dial o programa...`,
              ca: `Cercar entre ${tdtChannels.length || 900}+ canals, núm. dial o programa...`,
              en: `Search ${tdtChannels.length || 900}+ channels, dial # or live show...`,
            })}
            className="w-full min-h-12 pl-10 pr-10 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-[#7C3AED] text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors"
          />
          {inlineQuery && (
            <button
              type="button"
              onClick={() => setInlineQuery('')}
              aria-label={pickLang(lang, { es: 'Limpiar búsqueda', ca: 'Netejar cerca', en: 'Clear search' })}
              className="min-w-9 min-h-9 rounded-xl hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {[
            { id: 'all' as const, icon: null, label: pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'All' }) },
            { id: 'sports_now' as const, icon: Trophy, label: pickLang(lang, { es: 'Deporte', ca: 'Esport', en: 'Sports' }) },
            { id: 'cinema_now' as const, icon: Film, label: pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Movies' }) },
          ].map((ef) => {
            const Icon = ef.icon;
            const active = epgFilter === ef.id;
            return (
              <button
                key={ef.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onEpgFilterChange(ef.id);
                }}
                className={`min-h-12 px-3.5 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                  active
                    ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.3)]'
                    : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span>{ef.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SCROLLABLE MACRO-REGION CHIPS WITH LIVE CHANNEL COUNTS */}
      {!tvFavOnly && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onTvRegionChange('all');
              onTdtCategoryChange('all');
              onAdrarCountryFilterChange?.('all');
            }}
            className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
              tvRegion === 'all' && tdtCategory === 'all'
                ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
            }`}
          >
            <FlagBadgeSvg code="all" className="w-4 h-2.5 shrink-0" />
            <span>{pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' })}</span>
            <span className="font-mono text-[11px] opacity-80 tabular-nums">{tdtChannels.length}</span>
          </button>

          {TV_FILTER_GROUPS.map((group) => {
            const count = tvCategoryCounts.perRegion[group.region] ?? 0;
            if (count === 0) return null;
            const active = tvRegion === group.region;
            return (
              <button
                key={group.region}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onTvRegionChange(group.region);
                  onTdtCategoryChange('all');
                  onAdrarCountryFilterChange?.('all');
                }}
                className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
                  active
                    ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                    : 'bg-[#0D0D12] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                <FlagBadgeSvg code={group.flagCode} className="w-4 h-2.5 shrink-0" />
                <span>{pickLang(lang, group.name)}</span>
                <span className="font-mono text-[11px] opacity-80 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* QUICK ATRESMEDIA + VPN SPAIN STRIP */}
      {(() => {
        const a3Ch = tdtChannels.find((c) => c.id === 'tdt-antena3');
        const sextaCh = tdtChannels.find((c) => c.id === 'tdt-lasexta');
        return (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {a3Ch && (
              <button
                type="button"
                onClick={() => handlePlayAndRecord(a3Ch, getChannelLiveEpg(a3Ch.id)?.now?.title)}
                className="min-h-10 px-3.5 rounded-xl bg-[#FF5E1A]/15 hover:bg-[#FF5E1A]/25 border border-[#FF5E1A]/35 text-xs font-bold text-white whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <Radio className="w-3.5 h-3.5 text-[#FF8A4C] shrink-0" />
                <span>Antena 3 Directo HD</span>
              </button>
            )}
            {sextaCh && (
              <button
                type="button"
                onClick={() => handlePlayAndRecord(sextaCh, getChannelLiveEpg(sextaCh.id)?.now?.title)}
                className="min-h-10 px-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-bold text-white whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>laSexta Directo HD</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                window.dispatchEvent(new CustomEvent('riffan:open-vpn-gateway'));
              }}
              className="min-h-10 px-3.5 rounded-xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>VPN España</span>
            </button>
          </div>
        );
      })()}

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
            className="text-xs font-semibold text-[#C4B5FD] hover:text-white shrink-0 cursor-pointer"
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
                className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
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
                  onClick={() => handlePlayAndRecord(ch, chEpg?.now?.title)}
                  className={`min-h-12 px-3 py-2 rounded-2xl border shrink-0 flex items-center gap-2.5 cursor-pointer active:scale-95 transition-all ${
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
            {tvFavOnly
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
            onClick={resetAllFilters}
            className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all"
          >
            {pickLang(lang, {
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
              {pinnedFavorites.length > 0 && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
                  {pickLang(lang, {
                    es: 'Todos los canales',
                    ca: 'Tots els canals',
                    en: 'All channels',
                  })}
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {displayedRemaining.map(renderChannelRow)}
              </div>

              {remainingHiddenCount > 0 && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setVisibleLimit((prev) => prev + CHANNELS_BATCH_SIZE);
                    }}
                    className="min-h-12 px-6 rounded-2xl bg-[#0D0D12] hover:bg-[#171722] border border-white/[0.12] hover:border-[#7C3AED]/60 text-xs sm:text-sm font-bold text-white inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
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
    </div>
  );
};

