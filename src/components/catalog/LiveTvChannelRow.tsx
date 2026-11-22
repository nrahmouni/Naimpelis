/**
 * @module LiveTvChannelRow
 * @description Extracted channel row card for LiveTvWorldView with EPG bar, favorite toggle, and native play action.
 */
import React from 'react';
import { Info, Star } from 'lucide-react';
import type {
  AppLanguage,
  ChannelLiveEpg,
  FavoriteChannelItem,
  SpanishTdtChannel,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { buildChannelFavId } from '../../utils/storage';
import { ChannelLogoBadge, getChannelRegionMeta } from '../ui/ChannelLogoBadge';

interface LiveTvChannelRowProps {
  channel: SpanishTdtChannel;
  lang: AppLanguage;
  chEpg: ChannelLiveEpg | null;
  activeVideoRawUrl: string;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlayChannel: (ch: SpanishTdtChannel, liveTitle?: string) => void;
  onOpenEpgModal: (ch: SpanishTdtChannel) => void;
}

export const LiveTvChannelRow = React.memo<LiveTvChannelRowProps>(({
  channel: ch,
  lang,
  chEpg,
  activeVideoRawUrl,
  isChannelFavorited,
  onToggleChannelFavorite,
  onPlayChannel,
  onOpenEpgModal,
}) => {
  const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
  const faved = isChannelFavorited(favId);
  const regMeta = getChannelRegionMeta(ch);
  const isPlaying = Boolean(
    activeVideoRawUrl && ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
  );

  return (
    <div
      className={`cv-row-auto relative group min-h-[82px] p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
        isPlaying
          ? 'border-[#7C3AED] bg-[#7C3AED]/[0.16] shadow-[0_8px_24px_rgba(124,58,237,0.25)]'
          : 'bg-[#0D0D12] border-white/[0.08] hover:border-white/20 hover:bg-[#13131B]'
      }`}
    >
      <button
        type="button"
        onClick={() => onPlayChannel(ch, chEpg?.now?.title)}
        aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
        className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
      />

      <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
        <ChannelLogoBadge channel={ch} size="md" />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="font-display font-bold text-[15px] text-white leading-snug break-words flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
            <span className="break-words">{ch.name}</span>
            <span className="text-[11px] font-mono font-semibold text-zinc-400 shrink-0 tabular-nums">
              · {regMeta.langTag} · Dial {ch.dial}
            </span>
          </div>
          <div className="text-xs text-zinc-400 leading-snug break-words">
            {chEpg?.now ? (
              <>
                <span className="font-mono tabular-nums text-zinc-300">
                  {chEpg.now.startLabel} – {chEpg.now.stopLabel}
                </span>
                <span className="mx-1 text-zinc-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-zinc-300">{chEpg.now.title}</span>
              </>
            ) : ch.category === 'china_football' ? (
              'China (中文 · 欧冠/西甲/英超)'
            ) : (
              ch.network
            )}
          </div>
          {chEpg?.now && (
            <div className="h-1.5 w-full max-w-[240px] rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-[#7C3AED] rounded-full transition-all"
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
          className="min-w-11 min-h-11 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center cursor-pointer active:scale-95 transition-all"
        >
          <Info className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic('light');
            onToggleChannelFavorite({
              favId,
              title: ch.name,
              channelLabel: ch.shortMark,
              channelUrl: ch.channels[0]?.sourceUrl || '',
              competition: ch.network,
              sport:
                ch.category === 'china_football' || ch.category === 'rbtv_sports'
                  ? 'soccer'
                  : 'tdt',
            });
          }}
          aria-pressed={faved}
          aria-label={pickLang(lang, { es: 'Favorito', ca: 'Favorit', en: 'Favorite' })}
          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
            faved
              ? 'text-[#A78BFA] bg-[#7C3AED]/20'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <Star className={`w-4 h-4 ${faved ? 'fill-current nc-pop-spring' : ''}`} />
        </button>
      </div>
    </div>
  );
});
