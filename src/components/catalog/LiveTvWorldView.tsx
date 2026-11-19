/**
 * @module LiveTvWorldView
 * @description World 3 (TV en Directo) compact channel rows, quick region bar,
 * real-time EPG indicator bars, and region/EPG filter bottom sheet.
 */
import React from 'react';
import { Loader2, Play, Share2, SlidersHorizontal, Star, Info } from 'lucide-react';
import type {
  AppLanguage,
  ChannelLiveEpg,
  FavoriteChannelItem,
  SpanishTdtChannel,
  TdtCategory,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { shareDedicatedLink } from '../../utils/shareDedicatedLink';
import { buildChannelFavId } from '../../utils/storage';
import {
  ChannelLogoBadge,
  getCategoryRegion,
  getChannelRegionMeta,
  type TvRegionId,
} from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
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
  shareRoomId,
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
    : pickLang(lang, { es: 'Todos en Vivo', ca: 'Tots en Directe', en: 'All Live TV' });

  const tvFilterCount =
    (tvRegion !== 'all' ? 1 : 0) +
    (tdtCategory !== 'all' ? 1 : 0) +
    (epgFilter !== 'all' ? 1 : 0) +
    (tvFavOnly ? 1 : 0);

  const favoriteQuickChannels = React.useMemo(
    () =>
      tdtChannels
        .filter((ch) =>
          isChannelFavorited(buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name))
        )
        .slice(0, 12),
    [tdtChannels, isChannelFavorited]
  );

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
            { id: 'world_cricket', flagCode: 'all', label: 'Cricket & Mundial' },
            { id: 'elahmad_mena', flagCode: 'dz', label: 'Elahmad MENA' },
            { id: 'adrar_europa', flagCode: 'eu', label: 'ADRAR Europa' },
            { id: 'ar', flagCode: 'qa', label: 'beIN العربية' },
            { id: 'ma', flagCode: 'ma', label: 'Marruecos' },
            { id: 'docs', flagCode: 'docs', label: 'Documentales' },
            { id: 'us', flagCode: 'us', label: 'EE.UU.' },
            { id: 'eu', flagCode: 'eu', label: 'Europa & Cine' },
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
                onAdrarCountryFilterChange?.('all');
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

      {favoriteQuickChannels.length > 0 && !tvFavOnly && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D8B4FE] whitespace-nowrap shrink-0 pr-0.5">
            <Star className="w-3 h-3 fill-current" />
            <span>{pickLang(lang, { es: 'Zapping', ca: 'Zàping', en: 'Quick Zap' })}</span>
          </span>
          {favoriteQuickChannels.map((ch) => {
            const chEpg = getChannelLiveEpg(ch.id);
            const isPlaying = Boolean(
              activeVideoRawUrl && ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
            );
            return (
              <button
                key={`qzap-${ch.id}`}
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onPlayTdtChannel(ch, 0, chEpg?.now?.title);
                }}
                className={`min-h-[44px] pl-1.5 pr-3 rounded-xl border flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                  isPlaying
                    ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.35)]'
                    : 'bg-[#11131B] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
                }`}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-display font-black text-white shrink-0"
                  style={{ backgroundColor: ch.brandTone || '#38BDF8' }}
                >
                  {(ch.shortMark || ch.name).slice(0, 3)}
                </span>
                <span className="text-xs font-semibold truncate max-w-[120px]">{ch.name}</span>
              </button>
            );
          })}
        </div>
      )}

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
                className={`min-h-8 px-2.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
                  active
                    ? 'bg-[#BF94FF]/25 border-[#9146FF] text-white'
                    : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
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
        <div className="py-10 px-4 rounded-3xl bg-[#11131B] border border-white/[0.08] text-center space-y-3">
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
                      void shareDedicatedLink({
                        target: { kind: 'channel', id: ch.id, name: ch.name },
                        roomId: shareRoomId,
                        title: ch.name,
                      });
                    }}
                    aria-label={pickLang(lang, {
                      es: `Compartir ${ch.name}`,
                      ca: `Compartir ${ch.name}`,
                      en: `Share ${ch.name}`,
                    })}
                    className="min-w-11 min-h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-[#BF94FF] hover:bg-white/[0.09] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
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
