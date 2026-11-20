/**
 * @module server/extractors/clipboxDirectExtractor
 * @description Extracts playable direct native HLS/MP4 streams and embedded signed SRT captions
 * from ClipBox endpoints (enc-dec.app/api/enc-vidlink -> vidlink.pro/api/b/... and vidrock.net)
 * so movies, series, and anime play directly inside RiffanTV's native <video> player with zero
 * external windows or popup iframes.
 */
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  type TrackRecord,
} from './httpHelpers.ts';
import {
  buildSubtitleProxyUrl,
  type NormalizedSubtitleTrack,
} from '../services/subtitleAggregator.ts';

export interface ClipboxDirectExtractResult {
  tracks: TrackRecord[];
  subtitles: NormalizedSubtitleTrack[];
}

const vidlinkExtractCache = new LruTtlCache<string, { data: ClipboxDirectExtractResult; ts: number }>(
  250,
  12 * 60 * 1000
);

function mapVidlinkCaptionLang(rawLanguage: string): {
  code: string;
  label: string;
  priority: number;
} | null {
  const raw = String(rawLanguage || '').trim();
  const low = raw.toLowerCase();
  if (!low) return null;

  if (low.includes('español') || low === 'spanish' || low === 'es') {
    const isLat = low.includes('lat') || low.includes('419') || low.includes('mex');
    return {
      code: isLat ? 'LAT' : 'ES',
      label: isLat ? 'Español Latino · ClipBox SRT' : 'Español · ClipBox SRT',
      priority: isLat ? 2 : 1,
    };
  }
  if (low.includes('català') || low.includes('catalan') || low === 'ca') {
    return { code: 'CAT', label: 'Català · ClipBox SRT', priority: 3 };
  }
  if (low.includes('english') || low === 'en') {
    return { code: 'EN', label: 'English · ClipBox SRT', priority: 4 };
  }
  if (low.includes('portugu')) {
    return { code: 'PT', label: 'Português · ClipBox SRT', priority: 5 };
  }
  if (low.includes('franç') || low.includes('french')) {
    return { code: 'FR', label: 'Français · ClipBox SRT', priority: 6 };
  }
  if (low.includes('italian')) {
    return { code: 'IT', label: 'Italiano · ClipBox SRT', priority: 7 };
  }
  if (low.includes('الْعَرَبِيَّة') || low.includes('arab')) {
    return { code: 'AR', label: 'العربية · ClipBox SRT', priority: 8 };
  }
  return { code: 'MULTI', label: `${raw} · ClipBox SRT`, priority: 9 };
}

export async function extractClipboxDirectStreams(opts: {
  tmdbId?: string | number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  originalLanguage?: string;
}): Promise<ClipboxDirectExtractResult> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return { tracks: [], subtitles: [] };

  const mediaType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const season = Math.max(1, Number(opts.season || 1));
  const episode = Math.max(1, Number(opts.episode || 1));
  const cacheKey = `${mediaType}|${cleanId}|${season}|${episode}`;

  const cached = vidlinkExtractCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 12 * 60 * 1000) {
    return cached.data;
  }

  try {
    const encRes = await streamingFetch(
      `https://enc-dec.app/api/enc-vidlink?text=${encodeURIComponent(cleanId)}`,
      {
        headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
        timeoutMs: 3600,
      }
    );
    if (!encRes.ok) return { tracks: [], subtitles: [] };

    const encJson = (await encRes.json().catch(() => null)) as { result?: string } | null;
    const encryptedId = String(encJson?.result || '').trim();
    if (!encryptedId) return { tracks: [], subtitles: [] };

    const vidlinkApiUrl =
      mediaType === 'tv'
        ? `https://vidlink.pro/api/b/tv/${encodeURIComponent(encryptedId)}/${season}/${episode}`
        : `https://vidlink.pro/api/b/movie/${encodeURIComponent(encryptedId)}`;

    const vlRes = await streamingFetch(vidlinkApiUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://vidlink.pro/',
        Origin: 'https://vidlink.pro',
        Accept: 'application/json',
      },
      timeoutMs: 4800,
    });
    if (!vlRes.ok) return { tracks: [], subtitles: [] };

    const vlJson = (await vlRes.json().catch(() => null)) as {
      stream?: {
        id?: string;
        type?: string;
        playlist?: string;
        qualities?: Record<
          string,
          { url?: string; type?: string; codecName?: string }
        >;
        captions?: Array<{ id?: string; url?: string; language?: string; type?: string }>;
      };
    } | null;

    const stream = vlJson?.stream;
    if (!stream) return { tracks: [], subtitles: [] };

    const tracks: TrackRecord[] = [];
    const defaultLang: 'ES' | 'LAT' | 'VOSE' | 'EN' =
      opts.originalLanguage === 'ja' ? 'VOSE' : 'EN';
    const langDisplay = defaultLang === 'VOSE' ? 'VOSE Sub' : 'Original HD';

    // 1. Native HLS playlist when returned by VidLink
    if (stream.playlist && /^https?:\/\//i.test(stream.playlist)) {
      tracks.push({
        id: `clipbox-vl-hls-${mediaType}-${cleanId}-${season}-${episode}`,
        label: `${langDisplay} · ClipBox HLS`,
        lang: defaultLang,
        quality: '1080p HLS',
        sourceUrl: stream.playlist,
        referer: 'https://vidlink.pro/',
        resolverType: 'direct_hls',
        resolvedStreamUrl: buildHlsProxyUrl(stream.playlist, 'https://vidlink.pro/'),
      });
    }

    // 2. Direct MP4 qualities: prefer browser-universal H.264 streams over HEVC-only variants
    const qualityEntries = Object.entries(stream.qualities || {})
      .filter(([, meta]) => Boolean(meta?.url && /^https?:\/\//i.test(meta.url)))
      .map(([resKey, meta]) => {
        const resNum = parseInt(resKey, 10) || 0;
        const codec = String(meta?.codecName || '').toLowerCase();
        const isH264 = codec.includes('h264') || codec.includes('avc') || !codec.includes('hevc');
        return {
          resKey,
          resNum,
          url: String(meta.url),
          isH264,
        };
      })
      .sort((a, b) => {
        if (a.isH264 !== b.isH264) return a.isH264 ? -1 : 1;
        return b.resNum - a.resNum;
      });

    const chosenMp4 = qualityEntries.filter((q) => q.isH264).slice(0, 2);
    const candidatesMp4 = chosenMp4.length > 0 ? chosenMp4 : qualityEntries.slice(0, 1);

    candidatesMp4.forEach((item, idx) => {
      const proxiedMp4 = buildTsProxyUrl(item.url, 'https://vidlink.pro/');
      tracks.push({
        id: `clipbox-vl-mp4-${mediaType}-${cleanId}-${item.resKey}-${idx + 1}`,
        label: `${langDisplay} ${item.resNum >= 2160 ? '4K' : `${item.resNum}p`} · ClipBox MP4`,
        lang: defaultLang,
        quality: item.resNum >= 2160 ? '4K MP4' : `${item.resNum}p MP4`,
        sourceUrl: item.url,
        referer: 'https://vidlink.pro/',
        resolverType: 'direct_mp4',
        resolvedStreamUrl: proxiedMp4,
      });
    });

    // 3. Direct UTF-8 SRT captions from VidLink CDN
    const parsedSubs: Array<NormalizedSubtitleTrack & { _prio: number }> = [];
    const seenSubLangs = new Set<string>();
    for (const cap of stream.captions || []) {
      if (!cap?.url || !/^https?:\/\//i.test(cap.url)) continue;
      const mapped = mapVidlinkCaptionLang(cap.language || '');
      if (!mapped || mapped.priority > 8) continue;
      if (seenSubLangs.has(mapped.code)) continue;
      seenSubLangs.add(mapped.code);
      parsedSubs.push({
        id: `vlsub-${cleanId}-${mapped.code.toLowerCase()}`,
        label: mapped.label,
        lang: mapped.code,
        url: buildSubtitleProxyUrl(cap.url),
        source: 'vidlink.pro',
        _prio: mapped.priority,
      });
    }
    parsedSubs.sort((a, b) => a._prio - b._prio);

    const subtitles: NormalizedSubtitleTrack[] = parsedSubs.map(({ _prio: _unused, ...rest }) => rest);
    const result: ClipboxDirectExtractResult = { tracks, subtitles };
    if (tracks.length > 0 || subtitles.length > 0) {
      vidlinkExtractCache.set(cacheKey, { data: result, ts: Date.now() });
    }
    return result;
  } catch {
    return { tracks: [], subtitles: [] };
  }
}
