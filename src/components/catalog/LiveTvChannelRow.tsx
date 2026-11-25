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
import { inferStreamQualityTag } from '../../utils/channelQualityRanker';

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
  const leadTrack = ch.channels[0];
  const isDanaLead =
    leadTrack?.providerId === 'dana4k' ||
    /provider=dana4k/i.test(leadTrack?.sourceUrl || '') ||
    /dana\s*4k/i.test(leadTrack?.providerName || leadTrack?.label || '');
  const qualityTag = inferStreamQualityTag(
    leadTrack?.quality || ch.quality,
    leadTrack?.label,
    leadTrack?.sourceUrl
  ).label;
  const signalCount = ch.channels.length;
  const latencyMs =
    ch.healthSummary?.bestStatus === 'up' &&
    typeof ch.healthSummary.bestLatencyMs === 'number' &&
    ch.healthSummary.bestLatencyMs > 0
      ? ch.healthSummary.bestLatencyMs
      : null;

  return (
    <div
      className={`cv-row-auto relative group min-h-[86px] p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
        isPlaying
          ? 'border-[#7C3AED] bg-[#7C3AED]/[0.16] shadow-[0_8px_24px_rgba(124,58,237,0.25)]'
          : 'bg-[#0D0D12] border-white/[0.08] hover:border-white/20 hover:bg-[#13131B]'
      }`}
    >
      <button
        type="button"
        data-tv-focusable="true"
        onClick={() => onPlayChannel(ch, chEpg?.now?.title)}
        aria-label={`${pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })} ${ch.name}`}
        className="absolute inset-0 z-0 rounded-2xl cursor-pointer tv-focus-ring"
      />

      <div className="relative z-10 flex-1 min-w-0 flex items-center gap-3 pointer-events-none">
        <ChannelLogoBadge channel={ch} size="md" />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-display font-bold text-[15px] text-white leading-snug break-words">
            {ch.name}
          </div>
          <div className="text-[11px] font-mono font-semibold text-zinc-400 tabular-nums flex items-center flex-wrap gap-x-1.5">
            <span>{regMeta.langTag}</span>
            <span aria-hidden="true">·</span>
            <span>Dial {ch.dial}</span>
            {isDanaLead && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300">Dana 4K</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="text-zinc-200">{qualityTag}</span>
            {signalCount > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#C4B5FD]">
                  {pickLang(lang, {
                    es: `${signalCount} señales`,
                    ca: `${signalCount} senyals`,
                    en: `${signalCount} signals`,
                  })}
                </span>
              </>
            )}
            {latencyMs !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300">{latencyMs} ms</span>
              </>
            )}
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
          data-tv-focusable="true"
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
          className="min-w-11 min-h-11 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center cursor-pointer active:scale-95 transition-all tv-focus-ring"
        >
          <Info className="w-4 h-4" />
        </button>

        <button
          type="button"
          data-tv-focusable="true"
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
          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all tv-focus-ring ${
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
