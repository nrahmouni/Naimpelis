/**
 * @module LiveTvSpotlightRail
 * @description Featured Apple TV / broadcast-grade spotlight rail highlighting top Spanish TDT
 * and Live Football channels sorted by verified signal quality, backup depth, and speed.
 */
import React, { useMemo, useState } from 'react';
import { Play, Radio, Trophy, Tv } from 'lucide-react';
import type { AppLanguage, ChannelLiveEpg, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { ChannelLogoBadge } from '../ui/ChannelLogoBadge';
import { inferStreamQualityTag } from '../../utils/channelQualityRanker';

interface LiveTvSpotlightRailProps {
  lang: AppLanguage;
  channels: SpanishTdtChannel[];
  activeVideoRawUrl: string;
  getChannelLiveEpg: (channelId: string) => ChannelLiveEpg | null;
  onPlayChannel: (ch: SpanishTdtChannel, liveTitle?: string) => void;
}

const SPAIN_TDT_SPOTLIGHT_IDS = [
  'tdt-antena3',
  'tdt-lasexta',
  'tdt-atreseries',
  'tdt-la1',
  'tdt-cuatro',
  'tdt-telecinco',
  'tdt-la2',
  'tdt-teledeporte',
];

const FOOTBALL_SPOTLIGHT_IDS = [
  'mplus-laliga',
  'dazn-laliga',
  'mplus-champions',
  'mplus-canal',
  'dazn-f1',
  'dazn-1',
  'mplus-vamos',
  'mplus-hypermotion',
];

export const LiveTvSpotlightRail: React.FC<LiveTvSpotlightRailProps> = ({
  lang,
  channels,
  activeVideoRawUrl,
  getChannelLiveEpg,
  onPlayChannel,
}) => {
  const [spotlightMode, setSpotlightMode] = useState<'es_tdt' | 'football'>('es_tdt');

  const { spainFeatured, footballFeatured } = useMemo(() => {
    const byId = new Map<string, SpanishTdtChannel>();
    for (const ch of channels) {
      if (ch?.id) byId.set(ch.id, ch);
    }

    const pickByIds = (ids: string[]) =>
      ids.map((id) => byId.get(id)).filter((ch): ch is SpanishTdtChannel => Boolean(ch));

    const tdtPicks = pickByIds(SPAIN_TDT_SPOTLIGHT_IDS);
    const fbIdsSet = new Set(FOOTBALL_SPOTLIGHT_IDS);
    const extraFootball = channels.filter(
      (ch) =>
        !fbIdsSet.has(ch.id) &&
        (ch.category === 'dazn' ||
          ch.category === 'movistar' ||
          (ch.category === 'belix_live' &&
            /\b(?:laliga|dazn|movistar|champions|futbol|deporte|campeones)\b/i.test(
              `${ch.name} ${ch.network}`
            ))) &&
        ch.id !== 'mplus-estrenos' &&
        ch.id !== 'mplus-accion' &&
        ch.id !== 'mplus-series'
    );

    const fbPicks = [...pickByIds(FOOTBALL_SPOTLIGHT_IDS), ...extraFootball].slice(0, 8);
    return {
      spainFeatured: tdtPicks,
      footballFeatured: fbPicks,
    };
  }, [channels]);

  const activeList = spotlightMode === 'football' && footballFeatured.length > 0
    ? footballFeatured
    : spainFeatured;

  if (spainFeatured.length === 0 && footballFeatured.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <h2 className="font-display text-base sm:text-lg font-extrabold text-white tracking-tight">
            {pickLang(lang, {
              es: 'Destacados en Directo · Mejor señal y rapidez',
              ca: 'Destacats en Directe · Millor senyal i rapidesa',
              en: 'Live Spotlight · Fastest & Highest Quality',
            })}
          </h2>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'España TDT y Fútbol con respaldo multi-servidor ordenado automáticamente',
              ca: 'Espanya TDT i Futbol amb còpia multi-servidor ordenada automàticament',
              en: 'Spain DTT & Football with auto-ranked multi-server backup signals',
            })}
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-2xl bg-[#0D0D12] border border-white/[0.08] gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSpotlightMode('es_tdt')}
            className={`min-h-11 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
              spotlightMode === 'es_tdt'
                ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Tv className="w-3.5 h-3.5 shrink-0" />
            <span>{pickLang(lang, { es: 'TDT España', ca: 'TDT Espanya', en: 'Spain DTT' })}</span>
          </button>
          {footballFeatured.length > 0 && (
            <button
              type="button"
              onClick={() => setSpotlightMode('football')}
              className={`min-h-11 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                spotlightMode === 'football'
                  ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                  : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span>{pickLang(lang, { es: 'Fútbol & DAZN', ca: 'Futbol & DAZN', en: 'Football & DAZN' })}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {activeList.map((ch) => {
          const chEpg = getChannelLiveEpg(ch.id);
          const isPlaying = Boolean(
            activeVideoRawUrl && ch.channels.some((s) => s.sourceUrl === activeVideoRawUrl)
          );
          const leadTrack = ch.channels[0];
          const isDanaLead =
            leadTrack?.providerId === 'dana4k' ||
            /provider=dana4k/i.test(leadTrack?.sourceUrl || '') ||
            /dana\s*4k/i.test(leadTrack?.providerName || leadTrack?.label || '');
          const qualityInfo = inferStreamQualityTag(
            leadTrack?.quality || ch.quality,
            leadTrack?.label,
            leadTrack?.sourceUrl
          );
          const signalCount = ch.channels.length;
          const pingMs =
            ch.healthSummary?.bestStatus === 'up' &&
            typeof ch.healthSummary.bestLatencyMs === 'number' &&
            ch.healthSummary.bestLatencyMs > 0
              ? ch.healthSummary.bestLatencyMs
              : null;
          const tone = ch.brandTone || '#7C3AED';

          return (
            <button
              key={`spotlight-${ch.id}`}
              type="button"
              data-tv-focusable="true"
              onClick={() => onPlayChannel(ch, chEpg?.now?.title)}
              className={`group relative overflow-hidden rounded-2xl border p-4 text-left flex flex-col justify-between gap-3 min-h-[144px] cursor-pointer active:scale-[0.98] transition-all tv-focus-ring ${
                isPlaying
                  ? 'border-[#7C3AED] bg-[#7C3AED]/[0.18] shadow-[0_10px_28px_rgba(124,58,237,0.28)]'
                  : 'border-white/[0.09] bg-[#0D0D12] hover:border-white/25 hover:bg-[#14141E]'
              }`}
              style={{
                backgroundImage: isPlaying
                  ? undefined
                  : `radial-gradient(circle at 88% 12%, ${tone}24 0%, transparent 62%)`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelLogoBadge channel={ch} size="md" />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[15px] text-white leading-tight break-words">
                      {ch.name}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                      Dial {ch.dial}{isDanaLead ? ' · Dana 4K' : ''} · {qualityInfo.label}
                    </div>
                  </div>
                </div>

                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isPlaying
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-white/[0.08] text-zinc-200 group-hover:bg-[#7C3AED] group-hover:text-white'
                  }`}
                >
                  {isPlaying ? (
                    <Radio className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-zinc-200 font-medium leading-snug line-clamp-1">
                  {chEpg?.now
                    ? `${chEpg.now.startLabel} · ${chEpg.now.title}`
                    : ch.description || ch.network}
                </div>

                {chEpg?.now && (
                  <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-[#7C3AED] rounded-full transition-all"
                      style={{
                        width: `${Math.max(4, Math.min(100, chEpg.progressPct))}%`,
                      }}
                    />
                  </div>
                )}

                <div className="text-[11px] text-zinc-400 font-mono tabular-nums flex items-center gap-1.5">
                  <span className={ch.healthSummary?.bestStatus === 'up' ? 'text-emerald-300' : ''}>
                    {signalCount > 1
                      ? pickLang(lang, {
                          es: `${signalCount} señales`,
                          ca: `${signalCount} senyals`,
                          en: `${signalCount} signals`,
                        })
                      : ch.network}
                  </span>
                  {pingMs !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-300">{pingMs} ms</span>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
