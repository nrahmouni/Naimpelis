import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Tv } from 'lucide-react';
import { RiffanSpinner } from '../ui/RiffanIcons';
import type { AppLanguage, ChannelLiveEpg, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { ChannelLogoBadge } from '../ui/ChannelLogoBadge';
import { buildMiniGuideForChannel, computeLiveProgramSnapshot } from './channelGuideUtils';

interface SimilarChannelsCarouselProps {
  lang: AppLanguage;
  similarChannels: SpanishTdtChannel[];
  epgMap: Record<string, ChannelLiveEpg>;
  clockMs: number;
  loadingItemId?: string | null;
  onZapChannel: (ch: SpanishTdtChannel) => void;
}

export const SimilarChannelsCarousel: React.FC<SimilarChannelsCarouselProps> = ({
  lang,
  similarChannels,
  epgMap,
  clockMs,
  loadingItemId,
  onZapChannel,
}) => {
  const carouselRef = useRef<HTMLDivElement | null>(null);

  if (similarChannels.length === 0) return null;

  const scrollCarouselBy = (direction: -1 | 1) => {
    const el = carouselRef.current;
    if (!el) return;
    triggerHaptic('light');
    const step = Math.max(270, Math.round(el.clientWidth * 0.78));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Canales similares',
        ca: 'Canals similars',
        en: 'Similar Channels',
      })}
      className="rounded-2xl bg-[#111218]/90 border border-white/[0.08] p-3.5 sm:p-4 space-y-3 shadow-[0_12px_34px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Tv className="w-4 h-4 text-[#BF94FF] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="font-display font-bold text-xs sm:text-sm text-white leading-tight">
              {pickLang(lang, {
                es: 'Canales similares',
                ca: 'Canals similars',
                en: 'Similar Channels',
              })}
            </h3>
            <p className="text-[11px] text-zinc-400 leading-snug">
              {pickLang(lang, {
                es: 'Desliza y toca cualquiera para cambiar de canal al instante',
                ca: 'Llisca i toca qualsevol per canviar de canal a l’instant',
                en: 'Swipe and tap any channel to zap instantly',
              })}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => scrollCarouselBy(-1)}
            aria-label={pickLang(lang, { es: 'Anterior', ca: 'Anterior', en: 'Previous' })}
            className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-[#9146FF] border border-white/[0.08] hover:border-[#9146FF] text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollCarouselBy(1)}
            aria-label={pickLang(lang, { es: 'Siguiente', ca: 'Següent', en: 'Next' })}
            className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-[#9146FF] border border-white/[0.08] hover:border-[#9146FF] text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={carouselRef} className="scroll-snap-x flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        {similarChannels.map((ch) => {
          const snap = computeLiveProgramSnapshot(epgMap[ch.id], clockMs);
          const miniGuide = buildMiniGuideForChannel(ch, snap, clockMs);
          const isZapping = loadingItemId === `tdt-${ch.id}-0`;

          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onZapChannel(ch)}
              className="scroll-snap-item group w-[264px] sm:w-[284px] shrink-0 rounded-2xl bg-[#161822] hover:bg-[#1D2030] border border-white/[0.08] hover:border-[#9146FF]/65 overflow-hidden text-left active:scale-[0.97] transition-all cursor-pointer shadow-md flex flex-col justify-between"
            >
              <div
                className="relative min-h-[82px] px-3.5 py-2.5 flex items-center justify-between gap-2.5 border-b border-white/[0.06]"
                style={{
                  background: ch.brandTone
                    ? `linear-gradient(135deg, ${ch.brandTone}38 0%, rgba(16,18,28,0.96) 72%)`
                    : 'linear-gradient(135deg, rgba(145,70,255,0.28) 0%, rgba(16,18,28,0.96) 72%)',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <ChannelLogoBadge channel={ch} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#EB0400] animate-pulse shrink-0" />
                      <span className="text-[10px] font-mono font-bold text-zinc-300 tabular-nums">
                        Dial {ch.dial}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        · {ch.network}
                      </span>
                    </div>
                    <p className="font-display font-extrabold text-[13px] sm:text-sm text-white leading-tight break-words line-clamp-2 mt-0.5">
                      {ch.name}
                    </p>
                  </div>
                </div>

                <span className="w-8 h-8 rounded-full bg-black/55 border border-white/20 flex items-center justify-center text-white group-hover:bg-[#9146FF] group-hover:border-[#9146FF] transition-colors shrink-0">
                  {isZapping ? (
                    <RiffanSpinner size={14} tone="current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </span>
              </div>

              <div className="p-3 space-y-2 flex-1 flex flex-col justify-between bg-[#131520]/80">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                    <span className="text-[#BF94FF] font-bold tabular-nums">
                      {pickLang(lang, { es: 'AHORA', ca: 'ARA', en: 'NOW' })} · {miniGuide.startLabel} — {miniGuide.stopLabel}
                    </span>
                    <span className="text-zinc-400 tabular-nums shrink-0">
                      {miniGuide.remainingMin}m
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white leading-snug line-clamp-2 break-words">
                    {miniGuide.nowTitle}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-[#9146FF]"
                      style={{ width: `${miniGuide.progressPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug line-clamp-1">
                    <span className="font-mono text-zinc-500 tabular-nums">
                      {miniGuide.nextStartLabel}
                    </span>{' '}
                    <span className="text-zinc-300 font-medium">{miniGuide.nextTitle}</span>
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

