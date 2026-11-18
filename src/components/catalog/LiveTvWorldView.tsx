/**
 * @module LiveTvWorldView
 * @description World 3 (TV en Directo) compact channel rows, quick region bar,
 * real-time EPG indicator bars, and region/EPG filter bottom sheet.
 */
import React from 'react';
import { Film, Info, Loader2, Play, SlidersHorizontal, Star, Trophy } from 'lucide-react';
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
import { BottomSheet } from '../ui/DesignSystem';
import {
  ChannelLogoBadge,
  getCategoryRegion,
  getChannelRegionMeta,
  type TvRegionId,
} from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  ALL_LIVE_CATEGORIES,
  TDT_NATIONAL_CATEGORIES,
  TV_FILTER_GROUPS,
} from './catalogConstants';

interface PullRefreshHandlers {
  containerRef: React.RefObject<HTMLDivElement | null>;
  pullDistance: number;
  isRefreshing: boolean;
  pullHandlers: Record<string, unknown>;
}

interface LiveTvWorldViewProps {
  lang: AppLanguage;
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
}) => {
  const matchedAllCat = ALL_LIVE_CATEGORIES.find((c) => c.id === tdtCategory);
  const matchedNatCat = TDT_NATIONAL_CATEGORIES.find((c) => c.id === tdtCategory);
  const activeCatLabel = matchedAllCat
    ? pickLang(lang, matchedAllCat)
    : matchedNatCat
    ? pickLang(lang, matchedNatCat)
    : pickLang(lang, { es: 'Todos en Vivo', ca: 'Tots en Directe', en: 'All Live TV' });

  const tvFilterCount =
    (tvRegion !== 'all' ? 1 : 0) +
    (tdtCategory !== 'all' ? 1 : 0) +
    (epgFilter !== 'all' ? 1 : 0) +
    (tvFavOnly ? 1 : 0);

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

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-bold text-sm text-white truncate">{activeCatLabel}</p>
          {epgMadridClock && (
            <p className="text-xs text-zinc-400 tabular-nums">
              {filteredChannels.length}{' '}
              {pickLang(lang, { es: 'canales', ca: 'canals', en: 'channels' })} · {epgMadridClock}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onTvFiltersOpenChange(true);
          }}
          className={`min-h-11 px-3.5 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all ${
            tvFilterCount > 0
              ? 'bg-[#9146FF]/22 border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.25)]'
              : 'bg-white/[0.05] border-white/[0.1] text-zinc-100 hover:bg-white/[0.1]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
          <span>{pickLang(lang, { es: 'Filtros', ca: 'Filtres', en: 'Filters' })}</span>
          {tvFilterCount > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-[#9146FF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {tvFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onTvFavOnlyChange((prev) => !prev);
          }}
          className={`min-h-9 px-3 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
            tvFavOnly
              ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
              : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.1]'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${tvFavOnly ? 'fill-current' : 'text-[#BF94FF]'}`} />
          <span>{pickLang(lang, { es: 'Favoritos', ca: 'Favorits', en: 'Favorites' })}</span>
        </button>

        {(
          [
            { id: 'all', flagCode: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
            { id: 'es', flagCode: 'es', label: 'España' },
            { id: 'ar', flagCode: 'qa', label: 'beIN العربية & MENA' },
            { id: 'ma', flagCode: 'ma', label: 'Marruecos' },
            { id: 'docs', flagCode: 'docs', label: 'Documentales' },
            { id: 'us', flagCode: 'us', label: 'EE.UU.' },
            { id: 'eu', flagCode: 'eu', label: 'Europa' },
            { id: 'latam', flagCode: 'lat', label: 'Latam / ES' },
            { id: 'uk', flagCode: 'uk', label: 'UK (EN)' },
            { id: 'cn', flagCode: 'cn', label: 'China (中文)' },
          ] as const
        ).map((reg) => {
          const active =
            !tvFavOnly &&
            tvRegion === reg.id &&
            (reg.id === 'all' ? tdtCategory === 'all' : true);
          return (
            <button
              key={reg.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onTvFavOnlyChange(false);
                onTvRegionChange(reg.id);
                if (reg.id === 'all') {
                  onTdtCategoryChange('all');
                } else if (tdtCategory !== 'all' && getCategoryRegion(tdtCategory) !== reg.id) {
                  onTdtCategoryChange('all');
                }
              }}
              className={`min-h-9 px-3 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
                active
                  ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                  : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.1]'
              }`}
            >
              <FlagBadgeSvg code={reg.flagCode} className="w-4 h-2.5 shrink-0" />
              <span>{reg.label}</span>
            </button>
          );
        })}
      </div>

      {loadingTdt && filteredChannels.length === 0 ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#9146FF]" />
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="py-10 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-zinc-400">
          {pickLang(lang, {
            es: 'No hay canales con este filtro.',
            ca: 'No hi ha canals amb aquest filtre.',
            en: 'No channels match this filter.',
          })}
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
                className={`relative group min-h-[76px] p-3 rounded-2xl bg-[#11131B] border flex items-center justify-between gap-3 transition-colors ${
                  isPlaying
                    ? 'border-[#9146FF] bg-[#9146FF]/[0.07]'
                    : 'border-white/[0.08] hover:border-[#9146FF]/50 hover:bg-white/[0.03]'
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

                <div className="relative z-10 flex items-center gap-1.5 shrink-0">
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
                    className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                      faved
                        ? 'bg-[#9146FF]/20 border-[#9146FF] text-[#D8B4FE]'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${faved ? 'fill-current' : ''}`} />
                  </button>

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
                    className="min-w-11 min-h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.09] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Info className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('success');
                      onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                    }}
                    aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${ch.name}`}
                    className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center border cursor-pointer active:scale-95 transition-all ${
                      isPlaying
                        ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-[#9146FF]/20 hover:border-[#9146FF]/50 hover:text-white'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomSheet
        isOpen={tvFiltersOpen}
        onClose={() => onTvFiltersOpenChange(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Filtros de TV y Canales',
          ca: 'Filtres de TV i Canals',
          en: 'TV & Channel Filters',
        })}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onTvFavOnlyChange(false);
              onTvRegionChange('all');
              onTdtCategoryChange('all');
            }}
            className={`w-full min-h-11 px-4 rounded-2xl text-xs font-bold border flex items-center justify-between cursor-pointer transition-all ${
              !tvFavOnly && tvRegion === 'all' && tdtCategory === 'all'
                ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_18px_rgba(145,70,255,0.35)]'
                : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.1]'
            }`}
          >
            <span className="flex items-center gap-2">
              <FlagBadgeSvg code="all" className="w-4 h-2.5 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Todos los Canales en Vivo',
                  ca: 'Tots els Canals en Directe',
                  en: 'All Live Channels',
                })}
              </span>
            </span>
            <span className="text-[11px] opacity-85 tabular-nums font-mono font-semibold">
              ({tdtChannels.length})
            </span>
          </button>

          {TV_FILTER_GROUPS.map((group) => {
            const isCurrentRegion = tvRegion === group.region;
            const regionTotal = tvCategoryCounts.perRegion[group.region] ?? 0;
            return (
              <div key={group.region} className="p-3 rounded-2xl bg-white/[0.025] space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2 min-w-0">
                    <FlagBadgeSvg code={group.flagCode} className="w-5 h-3.5 shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                        {pickLang(lang, group.name)}
                      </h4>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {pickLang(lang, group.sub)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onTvFavOnlyChange(false);
                      onTvRegionChange(group.region);
                      onTdtCategoryChange('all');
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-bold shrink-0 cursor-pointer transition-all ${
                      isCurrentRegion && tdtCategory === 'all'
                        ? 'bg-[#9146FF] text-white'
                        : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' })} (
                    {regionTotal})
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {group.categories.map((cat) => {
                    const isCatActive =
                      tdtCategory === cat.id ||
                      (cat.id === 'all' && tvRegion === group.region && tdtCategory === 'all');
                    const catCount = tvCategoryCounts.perCategory[cat.id] ?? 0;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onTvFavOnlyChange(false);
                          onTvRegionChange(group.region);
                          onTdtCategoryChange(cat.id);
                        }}
                        className={`min-h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                          isCatActive
                            ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.3)]'
                            : 'bg-white/[0.05] text-zinc-200 hover:bg-white/[0.09]'
                        }`}
                      >
                        <span>{pickLang(lang, cat)}</span>
                        <span
                          className={`text-[11px] font-mono tabular-nums ${
                            isCatActive ? 'text-white/85' : 'text-zinc-400'
                          }`}
                        >
                          ({catCount})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {pickLang(lang, {
                es: 'Emisión actual (EPG en Vivo)',
                ca: 'Emissió actual (EPG en directe)',
                en: 'On air now (Live EPG)',
              })}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'all' as const,
                  icon: null,
                  label: pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'All' }),
                },
                {
                  id: 'sports_now' as const,
                  icon: Trophy,
                  label: pickLang(lang, { es: 'Deporte', ca: 'Esport', en: 'Sports' }),
                },
                {
                  id: 'cinema_now' as const,
                  icon: Film,
                  label: pickLang(lang, {
                    es: 'Cine / Series',
                    ca: 'Cinema / Sèries',
                    en: 'Movies / Series',
                  }),
                },
              ].map((ef) => {
                const EpgIcon = ef.icon;
                return (
                  <button
                    key={ef.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onEpgFilterChange(ef.id);
                    }}
                    className={`min-h-11 px-2.5 rounded-xl text-xs font-semibold border cursor-pointer inline-flex items-center justify-center gap-1.5 truncate ${
                      epgFilter === ef.id
                        ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.3)]'
                        : 'bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    {EpgIcon && <EpgIcon className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{ef.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 bg-[#10121C]/95 backdrop-blur-md border-t border-white/[0.08] flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onTvFavOnlyChange(false);
                onTvRegionChange('all');
                onTdtCategoryChange('all');
                onEpgFilterChange('all');
              }}
              className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-white cursor-pointer"
            >
              {pickLang(lang, { es: 'Limpiar filtros', ca: 'Netejar filtres', en: 'Reset filters' })}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onTvFiltersOpenChange(false);
              }}
              className="flex-1 min-h-12 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer shadow-[0_4px_20px_rgba(145,70,255,0.4)]"
            >
              {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
