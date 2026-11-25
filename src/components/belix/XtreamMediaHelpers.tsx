/**
 * @module src/components/belix/XtreamMediaHelpers
 * @description Shared safe image fallback component and SpanishTdtChannel playback payload builders
 * for Xtream Live TV channels, VOD movies, and Series episodes. Never exposes raw URLs or credentials.
 */
import React, { useEffect, useState } from 'react';
import { Clapperboard, Film, Tv } from 'lucide-react';
import type { SpanishTdtChannel } from '../../types';
import type {
  XtreamLiveStreamItem,
  XtreamSeriesEpisodeItem,
  XtreamSeriesItem,
  XtreamVodStreamItem,
} from '../../services/xtreamClientService';

interface XtreamPosterMediaProps {
  src?: string;
  alt: string;
  variant: 'live' | 'vod' | 'series';
  monogram?: string;
  accentColor?: string;
  className?: string;
  imgClassName?: string;
}

export const XtreamPosterMedia: React.FC<XtreamPosterMediaProps> = ({
  src,
  alt,
  variant,
  monogram,
  accentColor = '#7C3AED',
  className = '',
  imgClassName = '',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const cleanMonogram = (
    monogram ||
    alt
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() ||
    (variant === 'live' ? 'TV' : variant === 'vod' ? 'VOD' : 'SER')
  ).slice(0, 4);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 select-none overflow-hidden ${className}`}
        style={{
          background: `radial-gradient(circle at 30% 20%, ${accentColor}33, #0B0D14 75%)`,
        }}
      >
        {variant === 'live' ? (
          <span className="text-[11px] font-bold tracking-wider text-zinc-200 tabular-nums">
            {cleanMonogram}
          </span>
        ) : variant === 'vod' ? (
          <>
            <Film className="w-6 h-6 text-zinc-400/80 shrink-0" />
            <span className="px-2 text-[11px] font-semibold text-zinc-300 text-center line-clamp-2 leading-tight">
              {alt}
            </span>
          </>
        ) : (
          <>
            <Clapperboard className="w-6 h-6 text-zinc-400/80 shrink-0" />
            <span className="px-2 text-[11px] font-semibold text-zinc-300 text-center line-clamp-2 leading-tight">
              {alt}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} ${imgClassName}`}
    />
  );
};

export const XtreamEmptyBadgeIcon: React.FC<{ variant: 'live' | 'vod' | 'series' }> = ({
  variant,
}) => {
  if (variant === 'live') return <Tv className="w-5 h-5" />;
  if (variant === 'vod') return <Film className="w-5 h-5" />;
  return <Clapperboard className="w-5 h-5" />;
};

export function buildLiveTdtChannel(
  item: XtreamLiveStreamItem,
  categoryName = 'Directo',
  accentColor = '#F43F5E'
): SpanishTdtChannel {
  const prov = item.providerId || 'primary';
  const providerTag = item.providerName ? `${item.providerName} · ` : '';
  const cleanPlaybackUrl =
    item.playbackUrl ||
    (prov !== 'primary'
      ? `/api/stream?provider=${encodeURIComponent(prov)}&id=${encodeURIComponent(item.streamId)}`
      : `/api/xtream/stream/${encodeURIComponent(item.streamId)}.m3u8`);

  return {
    id: `xtream-${prov}-${item.streamId}`,
    dial: item.num || 900,
    name: item.name,
    shortMark: item.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'XTR',
    brandTone: accentColor,
    network: `${providerTag}${categoryName}`,
    category: 'belix_live',
    quality: 'HD Live',
    logoUrl: item.streamIcon,
    description: `${providerTag}${categoryName} · Canal #${item.num}`,
    channels: [
      {
        id: `xtream-trk-${prov}-${item.streamId}`,
        label: `${item.name} · Proxy HD`,
        lang: 'ES',
        quality: 'HD',
        sourceUrl: cleanPlaybackUrl,
        resolverType: 'direct_hls',
      },
    ],
  };
}

export function buildVodTdtChannel(
  item: XtreamVodStreamItem,
  categoryName = 'Películas',
  accentColor = '#8B5CF6'
): SpanishTdtChannel {
  const prov = item.providerId || 'primary';
  const ext = (item.containerExtension || 'mp4').toLowerCase();
  const providerTag = item.providerName ? `${item.providerName} · ` : '';
  const cleanPlaybackUrl =
    item.playbackUrl ||
    `/api/stream?provider=${encodeURIComponent(prov)}&id=${encodeURIComponent(item.streamId)}&type=vod&ext=${encodeURIComponent(ext)}`;

  return {
    id: `xtream-vod-${prov}-${item.streamId}`,
    dial: item.num || 950,
    name: item.name,
    shortMark: 'VOD',
    brandTone: accentColor,
    network: `${providerTag}${categoryName}`,
    category: 'belix_live',
    quality: ext.toUpperCase(),
    logoUrl: item.streamIcon,
    description: `${providerTag}${categoryName} · Película VOD`,
    channels: [
      {
        id: `xtream-vod-trk-${prov}-${item.streamId}`,
        label: `${item.name} · ${ext.toUpperCase()}`,
        lang: 'ES',
        quality: 'HD',
        sourceUrl: cleanPlaybackUrl,
        resolverType: ext === 'm3u8' ? 'direct_hls' : 'direct_mp4',
      },
    ],
  };
}

export function buildSeriesEpisodeTdtChannel(
  series: XtreamSeriesItem,
  episode: XtreamSeriesEpisodeItem,
  accentColor = '#0EA5E9'
): SpanishTdtChannel {
  const prov = series.providerId || 'primary';
  const ext = (episode.containerExtension || 'mp4').toLowerCase();
  const providerTag = series.providerName ? `${series.providerName} · ` : '';
  const epLabel = `T${episode.seasonNum}·E${episode.episodeNum} · ${episode.title}`;
  const cleanPlaybackUrl =
    episode.playbackUrl ||
    `/api/stream?provider=${encodeURIComponent(prov)}&id=${encodeURIComponent(episode.id)}&type=series&ext=${encodeURIComponent(ext)}`;

  return {
    id: `xtream-series-${prov}-${series.seriesId}-s${episode.seasonNum}-e${episode.episodeNum}-${episode.id}`,
    dial: 960 + (episode.episodeNum || 0),
    name: `${series.name} · ${epLabel}`,
    shortMark: `T${episode.seasonNum}E${episode.episodeNum}`,
    brandTone: accentColor,
    network: `${providerTag}Serie`,
    category: 'belix_live',
    quality: ext.toUpperCase(),
    logoUrl: series.cover,
    description: `${providerTag}${epLabel}`,
    channels: [
      {
        id: `xtream-ser-trk-${prov}-${episode.id}`,
        label: `${series.name} · ${epLabel}`,
        lang: 'ES',
        quality: 'HD',
        sourceUrl: cleanPlaybackUrl,
        resolverType: ext === 'm3u8' ? 'direct_hls' : 'direct_mp4',
      },
    ],
  };
}
