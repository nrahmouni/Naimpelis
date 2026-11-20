/**
 * @module LiveTvWorldView
 * @description World 3 (TV en Directo) — minimalist channel rows, clean scope tabs,
 * real-time EPG indicator bars, and region/EPG filter bottom sheet.
 */
import React from 'react';
import { Loader2, SlidersHorizontal, Star, Info } from 'lucide-react';
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
import {
  ChannelLogoBadge,
  getChannelRegionMeta,
  type TvRegionId,
} from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { SegmentedControl } from '../ui/DesignSystem';
import {
  ADRAR_COUNTRY_FILTERS,
  ALL_LIVE_CATEGORIES,
  TDT_NATIONAL_CATEGORIES,
} from './catalogConstants';
import { LiveTvFilterSheet } from './LiveTvFilterSheet';

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
  onTvFavOnlyChange: React.Dispatch<React.SetStateAction<boolean>>;
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
  const matchedAllCat = ALL_LIVE_CATEGORIES.find((c) => c.id === tdtCategory);
  const matchedNatCat = TDT_NATIONAL_CATEGORIES.find((c) => c.id === tdtCategory);
  const activeCatLabel = matchedAllCat
    ? pickLang(lang, matchedAllCat)
    : matchedNatCat
    ? pickLang(lang, matchedNatCat)
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

  return (
    <div ref={pull.containerRef} {...pull.pullHandlers} className="space-y-4">
      {pull.pullDistance > 10 && (
        <div className="text-center text-xs text-[#BF94FF] font-semibold py-1">
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

      {/* CLEAN SINGLE TOOLBAR: [Todos | España | Favoritos] + [Regiones] */}
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
              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_6px_18px_rgba(145,70,255,0.3)]'
              : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.09] text-zinc-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
          <span>{pickLang(lang, { es: 'Regiones y filtros', ca: 'Regions i filtres', en: 'Regions & filters' })}</span>
          {tvFilterCount > 0 && (
            <span className="font-mono text-[11px] tabular-nums opacity-90">
              · {tvFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* QUIET METADATA SUMMARY LINE */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-zinc-400">
        <span className="truncate tabular-nums">
          {activeCatLabel} · {filteredChannels.length}{' '}
          {pickLang(lang, { es: 'canales', ca: 'canals', en: 'channels' })}
          {epgMadridClock ? ` · ${epgMadridClock}` : ''}
        </span>
        {(tvRegion !== 'all' || tdtCategory !== 'all' || epgFilter !== 'all' || tvFavOnly) && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onTvFavOnlyChange(false);
              onTvRegionChange('all');
              onTdtCategoryChange('all');
              onEpgFilterChange('all');
              onAdrarCountryFilterChange?.('all');
            }}
            className="text-xs font-semibold text-[#C4A7FF] hover:text-white shrink-0 cursor-pointer"
          >
            {pickLang(lang, { es: 'Ver todos', ca: 'Veure tots', en: 'Show all' })}
          </button>
        )}
      </div>

      {tvRegion === 'adrar_europa' && !tvFavOnly && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
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
                className={`min-h-9 px-3 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
                  active
                    ? 'bg-[#9146FF] border-[#9146FF] text-white'
                    : 'bg-white/[0.035] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                <FlagBadgeSvg code={ctry.flagCode} className="w-3.5 h-2.5 shrink-0" />
                <span>{pickLang(lang, ctry)}</span>
              </button>
            );
          })}
        </div>
      )}

      {loadingTdt && filteredChannels.length === 0 ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="py-10 px-4 rounded-3xl bg-white/[0.03] border border-white/[0.08] text-center space-y-3">
          <p className="text-sm font-semibold text-zinc-200">
            {tvFavOnly
              ? pickLang(lang, {
                  es: 'Todavía no tienes canales favoritos guardados.',
                  ca: 'Encara no tens canals favorits desats.',
                  en: 'You have no favorite channels saved yet.',
                })
              : pickLang(lang, {
                  es: 'No hay canales con este filtro.',
                  ca: 'No hi ha canals amb aquest filtre.',
                  en: 'No channels match this filter.',
                })}
          </p>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onTvFavOnlyChange(false);
              onTvRegionChange('all');
              onTdtCategoryChange('all');
              onEpgFilterChange('all');
              onAdrarCountryFilterChange?.('all');
            }}
            className="min-h-11 px-4 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all"
          >
            {pickLang(lang, {
              es: 'Ver todos los canales',
              ca: 'Veure tots els canals',
              en: 'Show all channels',
            })}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredChannels.map((ch) => {
            const chEpg = getChannelLiveEpg(ch.id);
            const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
            const faved = isChannelFavorited(favId);
            const regMeta = getChannelRegionMeta(ch);
            const isPlaying = Boolean(
              activeVideoRawUrl && ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
            );

            return (
              <div
                key={ch.id}
                className={`relative group min-h-[72px] p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                  isPlaying
                    ? 'border-[#9146FF] bg-[#9146FF]/[0.1]'
                    : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.055]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                  }}
                  aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
                  className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
                />

                <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
                  <ChannelLogoBadge channel={ch} size="md" />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-display font-bold text-sm text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{ch.name}</span>
                      <span className="text-xs font-medium text-zinc-400 shrink-0">
                        · {regMeta.langTag}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {chEpg?.now ? (
                        <>
                          <span className="font-mono tabular-nums text-zinc-300">
                            {chEpg.now.startLabel} – {chEpg.now.stopLabel}
                          </span>
                          <span className="mx-1 text-zinc-600" aria-hidden="true">
                            ·
                          </span>
                          <span>{chEpg.now.title}</span>
                        </>
                      ) : ch.category === 'china_football' ? (
                        'China (中文 · 欧冠/西甲/英超)'
                      ) : (
                        ch.network
                      )}
                    </div>
                    {chEpg?.now && (
                      <div className="h-1 w-full max-w-[200px] rounded-full bg-white/[0.08] overflow-hidden">
                        <div
                          className="h-full bg-[#9146FF] rounded-full"
                          style={{
                            width: `${Math.max(4, Math.min(100, chEpg.progressPct))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative z-10 flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onOpenEpgModal(ch);
                    }}
                    aria-label={pickLang(lang, {
                      es: `Guía EPG de ${ch.name}`,
                      ca: `Guia EPG de ${ch.name}`,
                      en: `EPG guide for ${ch.name}`,
                    })}
                    className="min-w-11 min-h-11 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Info className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleChannelFavorite({
                        favId,
                        title: ch.name,
                        channelLabel: ch.shortMark,
                        channelUrl: ch.channels[0]?.sourceUrl || '',
                        competition: ch.network,
                        sport: ch.category === 'china_football' ? 'soccer' : 'tdt',
                      });
                    }}
                    aria-label={pickLang(lang, { es: 'Favorito', ca: 'Favorit', en: 'Favorite' })}
                    className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                      faved
                        ? 'text-[#C4A7FF] bg-[#9146FF]/15'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
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
