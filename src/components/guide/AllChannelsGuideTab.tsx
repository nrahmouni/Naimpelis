import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { RiffanCloseIcon, RiffanSearchIcon, RiffanSpinner } from '../ui/RiffanIcons';
import type {
  AppLanguage,
  ChannelLiveEpg,
  SpanishTdtChannel,
  TdtCategory,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { ChannelLogoBadge, type TvRegionId } from '../ui/ChannelLogoBadge';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { REGION_FILTER_TABS, computeLiveProgramSnapshot } from './channelGuideUtils';

const GUIDE_BATCH_SIZE = 60;

interface AllChannelsGuideTabProps {
  lang: AppLanguage;
  guideSearch: string;
  onChangeSearch: (q: string) => void;
  guideRegion: TvRegionId;
  onChangeRegion: (reg: TvRegionId) => void;
  guideCategory: 'all' | TdtCategory;
  onChangeCategory: (cat: 'all' | TdtCategory) => void;
  visibleCategories: { id: 'all' | TdtCategory; label: { es: string; ca: string; en: string } }[];
  filteredGuideChannels: SpanishTdtChannel[];
  epgMap: Record<string, ChannelLiveEpg>;
  clockMs: number;
  playingChannelId?: string | null;
  loadingItemId?: string | null;
  onZapChannel: (ch: SpanishTdtChannel) => void;
  onInspectChannel: (channelId: string) => void;
}

export const AllChannelsGuideTab: React.FC<AllChannelsGuideTabProps> = ({
  lang,
  guideSearch,
  onChangeSearch,
  guideRegion,
  onChangeRegion,
  guideCategory,
  onChangeCategory,
  visibleCategories,
  filteredGuideChannels,
  epgMap,
  clockMs,
  playingChannelId,
  loadingItemId,
  onZapChannel,
  onInspectChannel,
}) => {
  const [visibleLimit, setVisibleLimit] = useState(GUIDE_BATCH_SIZE);

  useEffect(() => {
    setVisibleLimit(GUIDE_BATCH_SIZE);
  }, [guideSearch, guideRegion, guideCategory]);

  const displayedChannels = guideSearch.trim()
    ? filteredGuideChannels
    : filteredGuideChannels.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, filteredGuideChannels.length - displayedChannels.length);

  return (
    <div className="space-y-3">
      <div className="relative">
        <RiffanSearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={guideSearch}
          onChange={(e) => onChangeSearch(e.target.value)}
          placeholder={pickLang(lang, {
            es: 'Buscar canal, película, serie o partido en emisión...',
            ca: 'Cercar canal, pel·lícula, sèrie o partit en emissió...',
            en: 'Search channel, movie, show, or live match...',
          })}
          className="w-full min-h-10 pl-10 pr-10 rounded-xl bg-[#000000] border border-white/[0.08] focus:border-[#7C3AED] text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none"
        />
        {guideSearch && (
          <button
            type="button"
            onClick={() => onChangeSearch('')}
            aria-label="Limpiar búsqueda"
            className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
          >
            <RiffanCloseIcon size={14} />
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {REGION_FILTER_TABS.map((reg) => {
          const active = guideRegion === reg.id;
          return (
            <button
              key={reg.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeRegion(reg.id);
                onChangeCategory('all');
              }}
              className={`min-h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all active:scale-95 border shrink-0 inline-flex items-center gap-1.5 ${
                active
                  ? 'bg-[#7C3AED] border-[#8B5CF6] text-white shadow-[0_3px_12px_rgba(124,58,237,0.35)]'
                  : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08] text-zinc-300'
              }`}
            >
              <FlagBadgeSvg code={reg.flagCode} className="w-4 h-2.5" />
              <span>{pickLang(lang, reg.label)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {visibleCategories.map((cat) => {
          const isSelected = guideCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeCategory(cat.id);
              }}
              className={`min-h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all active:scale-95 border shrink-0 ${
                isSelected
                  ? 'bg-[#7C3AED] border-[#8B5CF6] text-white shadow-[0_3px_12px_rgba(124,58,237,0.35)]'
                  : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08] text-zinc-300'
              }`}
            >
              {pickLang(lang, cat.label)}
            </button>
          );
        })}
      </div>

      {filteredGuideChannels.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-400">
          {pickLang(lang, {
            es: 'No hay canales o programas que coincidan con tu búsqueda.',
            ca: 'No hi ha canals o programes que coincideixin amb la cerca.',
            en: 'No channels or programs match your search.',
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 gpu-layer">
            {displayedChannels.map((ch) => {
              const snap = computeLiveProgramSnapshot(epgMap[ch.id], clockMs);
              const isCurrentlyPlaying = playingChannelId === ch.id;
              const isLoadingThis = loadingItemId === `tdt-${ch.id}-0`;

              return (
                <div
                  key={ch.id}
                  className={`cv-row-auto rounded-2xl p-3.5 sm:p-4 border transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrentlyPlaying
                      ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/60'
                      : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onZapChannel(ch)}
                    className="flex items-start sm:items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group"
                  >
                    <div className="relative shrink-0">
                      <ChannelLogoBadge channel={ch} size="md" />
                      {isLoadingThis && (
                        <span className="absolute inset-0 rounded-2xl bg-black/70 flex items-center justify-center">
                          <RiffanSpinner size={16} />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-display font-bold text-xs sm:text-sm text-white group-hover:text-[#A78BFA] transition-colors break-words">
                          {ch.name}
                        </span>
                        {isCurrentlyPlaying && (
                          <span className="px-1.5 py-0.5 rounded bg-[#7C3AED] text-white text-[9px] font-extrabold uppercase">
                            {pickLang(lang, { es: 'Viendo', ca: 'Veient', en: 'Playing' })}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                          · Dial {ch.dial}
                        </span>
                      </div>

                      {snap?.now ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-200 min-w-0">
                            <span className="font-mono text-[10px] font-bold text-[#A78BFA] shrink-0 tabular-nums">
                              {snap.now.startLabel}
                            </span>
                            <span className="font-semibold break-words leading-snug">{snap.now.title}</span>
                            <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">
                              · {snap.remainingMin}m
                            </span>
                          </div>
                          <div className="w-full max-w-[260px] h-1 rounded-full bg-white/[0.08] overflow-hidden">
                            <div
                              className="h-full bg-[#8B5CF6]"
                              style={{ width: `${snap.progressPct}%` }}
                            />
                          </div>
                          {snap.next && (
                            <p className="text-[11px] text-zinc-400 break-words leading-snug">
                              <span className="font-mono text-zinc-500 tabular-nums">
                                {snap.next.startLabel}
                              </span>{' '}
                              {snap.next.title}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-zinc-400 break-words leading-snug">
                          {ch.network} · {ch.description}
                        </p>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {snap && snap.upcoming.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onInspectChannel(ch.id);
                        }}
                        title={pickLang(lang, {
                          es: 'Ver programación completa',
                          ca: 'Veure programació completa',
                          en: 'View full schedule',
                        })}
                        className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 cursor-pointer active:scale-95 transition-all"
                      >
                        {pickLang(lang, { es: 'Guía', ca: 'Guia', en: 'Guide' })}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onZapChannel(ch)}
                      className={`min-h-10 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                        isCurrentlyPlaying
                          ? 'bg-[#7C3AED] text-white'
                          : 'bg-[#7C3AED]/20 hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white border border-[#8B5CF6]/40'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setVisibleLimit((prev) => prev + GUIDE_BATCH_SIZE);
                }}
                className="min-h-11 px-5 rounded-xl bg-[#0D0D12] hover:bg-[#161622] border border-white/[0.12] hover:border-[#7C3AED]/60 text-xs font-bold text-white cursor-pointer active:scale-95 transition-all"
              >
                {pickLang(lang, {
                  es: `Mostrar más canales (+${Math.min(GUIDE_BATCH_SIZE, hiddenCount)} de ${hiddenCount} restantes)`,
                  ca: `Mostrar més canals (+${Math.min(GUIDE_BATCH_SIZE, hiddenCount)} de ${hiddenCount} restants)`,
                  en: `Show more channels (+${Math.min(GUIDE_BATCH_SIZE, hiddenCount)} of ${hiddenCount} left)`,
                })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
