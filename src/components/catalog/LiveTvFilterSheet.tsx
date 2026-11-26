/**
 * @module LiveTvFilterSheet
 * @description Extracted filter BottomSheet for LiveTvWorldView (regions, categories, and EPG filter)
 * with OLED styling and sticky 50/50 footer action bar.
 */
import React from 'react';
import { Film, Trophy } from 'lucide-react';
import type { AppLanguage, TdtCategory } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { BottomSheet } from '../ui/DesignSystem';
import type { TvRegionId } from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { TV_FILTER_GROUPS } from './catalogConstants';

interface LiveTvFilterSheetProps {
  lang: AppLanguage;
  isOpen: boolean;
  totalChannelsCount: number;
  tvFavOnly: boolean;
  tvRegion: TvRegionId;
  tdtCategory: 'all' | 'tdt_all' | TdtCategory;
  epgFilter: 'all' | 'sports_now' | 'cinema_now';
  tvCategoryCounts: {
    perCategory: Record<string, number>;
    perRegion: Record<string, number>;
  };
  onClose: () => void;
  onTvFavOnlyChange: (value: boolean) => void;
  onTvRegionChange: (region: TvRegionId) => void;
  onTdtCategoryChange: (cat: 'all' | 'tdt_all' | TdtCategory) => void;
  onEpgFilterChange: (filter: 'all' | 'sports_now' | 'cinema_now') => void;
  onResetAdrarCountry?: () => void;
}

export const LiveTvFilterSheet: React.FC<LiveTvFilterSheetProps> = ({
  lang,
  isOpen,
  totalChannelsCount,
  tvFavOnly,
  tvRegion,
  tdtCategory,
  epgFilter,
  tvCategoryCounts,
  onClose,
  onTvFavOnlyChange,
  onTvRegionChange,
  onTdtCategoryChange,
  onEpgFilterChange,
  onResetAdrarCountry,
}) => (
  <BottomSheet
    isOpen={isOpen}
    onClose={onClose}
    lang={lang}
    title={pickLang(lang, {
      es: 'Filtros de TV y Canales',
      ca: 'Filtres de TV i Canals',
      en: 'TV & Channel Filters',
    })}
    footer={
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onTvFavOnlyChange(false);
            onTvRegionChange('all');
            onTdtCategoryChange('all');
            onEpgFilterChange('all');
            onResetAdrarCountry?.();
          }}
          className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all"
        >
          {pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="flex-1 min-h-12 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all shadow-[0_8px_24px_rgba(124,58,237,0.35)]"
        >
          {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
        </button>
      </div>
    }
  >
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onTvFavOnlyChange(false);
          onTvRegionChange('all');
          onTdtCategoryChange('all');
          onResetAdrarCountry?.();
        }}
        className={`w-full min-h-12 px-4 rounded-2xl text-xs font-bold border flex items-center justify-between cursor-pointer active:scale-95 transition-all ${
          !tvFavOnly && tvRegion === 'all' && tdtCategory === 'all'
            ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_20px_rgba(124,58,237,0.35)]'
            : 'bg-[#0D0D12] border-white/[0.08] text-zinc-200 hover:bg-[#14141D]'
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
        <span className="text-[11px] opacity-90 tabular-nums font-mono font-semibold">
          ({totalChannelsCount})
        </span>
      </button>

      {TV_FILTER_GROUPS.map((group) => {
        const isCurrentRegion = tvRegion === group.region;
        const regionTotal = tvCategoryCounts.perRegion[group.region] ?? 0;
        return (
          <div
            key={group.region}
            className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5 min-w-0">
                <FlagBadgeSvg code={group.flagCode} className="w-5 h-3.5 shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider leading-snug break-words">
                    {pickLang(lang, group.name)}
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-snug break-words">
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
                  onResetAdrarCountry?.();
                }}
                className={`min-h-10 text-[11px] px-3 py-1 rounded-xl font-bold shrink-0 cursor-pointer active:scale-95 transition-all ${
                  isCurrentRegion && tdtCategory === 'all'
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                }`}
              >
                {pickLang(lang, { es: 'Ver todo', ca: 'Veure tot', en: 'View all' })} ({regionTotal})
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
                      onResetAdrarCountry?.();
                    }}
                    className={`min-h-10 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                      isCatActive
                        ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.3)]'
                        : 'bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]'
                    }`}
                  >
                    <span>{pickLang(lang, cat)}</span>
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        isCatActive ? 'text-white/90' : 'text-zinc-400'
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

      <div className="space-y-2.5 pt-1">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          {pickLang(lang, {
            es: 'Emisión actual (EPG en Vivo)',
            ca: 'Emissió actual (EPG en directe)',
            en: 'On air now (Live EPG)',
          })}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                className={`min-h-11 px-3 rounded-xl text-xs font-semibold border cursor-pointer active:scale-95 inline-flex items-center justify-center gap-1.5 transition-all ${
                  epgFilter === ef.id
                    ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                {EpgIcon && <EpgIcon className="w-3.5 h-3.5 shrink-0" />}
                <span>{ef.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </BottomSheet>
);
