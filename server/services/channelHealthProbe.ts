import { streamingFetch } from '../utils/tlsFetch.ts';
import { isAnyBelixConnected } from './belix/belixXtreamClient.ts';
import { isXtreamEnvConfigured, probeXtreamLiveStreamLatency } from './xtreamService.ts';
import { resolveProviderLiveManifest } from './providers/xtreamProvidersService.ts';
import { isDvbUpstreamCoolingDown } from '../routes/proxies/dvbTranscoder.ts';

export type ChannelHealthStatus = 'up' | 'degraded' | 'down' | 'unknown';

export interface TrackHealthInfo {
  status: ChannelHealthStatus;
  latencyMs?: number;
  failCount?: number;
  checkedAt?: number;
  statusCode?: number;
  qoeRebuffers?: number;
  qoeFailures?: number;
  hasVideo?: boolean;
  audioOnly?: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export interface HlsCodecInspection {
  hasCodecAttr: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  audioOnly: boolean;
  isVodEnded: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export function inspectHlsCodecManifest(manifestText: string): HlsCodecInspection {
  const text = String(manifestText || '');
  const isVodEnded = /#EXT-X-ENDLIST/i.test(text);
  const codecsMatches = Array.from(text.matchAll(/CODECS="([^"]+)"/gi));
  if (codecsMatches.length === 0) {
    return {
      hasCodecAttr: false,
      hasVideo: true,
      hasAudio: true,
      audioOnly: false,
      isVodEnded,
    };
  }

  let videoCodec: string | undefined;
  let audioCodec: string | undefined;
  for (const match of codecsMatches) {
    const tokens = match[1].split(',').map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      if (!videoCodec && /^(avc1|hev1|hvc1|vp09|vp9|vp8|av01|mp4v)/i.test(token)) {
        videoCodec = token;
      } else if (!audioCodec && /^(mp4a|ec-3|ac-3|opus|flac|vorbis)/i.test(token)) {
        audioCodec = token;
      }
    }
  }

  const hasVideo = Boolean(videoCodec);
  const hasAudio = Boolean(audioCodec);
  return {
    hasCodecAttr: true,
    hasVideo,
    hasAudio,
    audioOnly: !hasVideo && hasAudio,
    isVodEnded,
    ...(videoCodec ? { videoCodec } : {}),
    ...(audioCodec ? { audioCodec } : {}),
  };
}

export interface ChannelHealthSummary {
  bestStatus: ChannelHealthStatus;
  upCount: number;
  totalCount: number;
  bestLatencyMs?: number;
}

export interface HealthProbeTrack {
  id: string;
  label: string;
  lang: string;
  quality?: string;
  sourceUrl: string;
  referer?: string;
  resolverType: string;
  resolvedStreamUrl?: string;
  health?: TrackHealthInfo;
}

export interface HealthProbeChannel<T extends HealthProbeTrack = HealthProbeTrack> {
  id: string;
  name?: string;
  title?: string;
  category?: string;
  channels: T[];
  healthSummary?: ChannelHealthSummary;
}

const DEFAULT_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TDT_DVB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

export const STATUS_RANK: Record<ChannelHealthStatus, number> = {
  up: 0,
  degraded: 1,
  unknown: 2,
  down: 3,
};

export const DEGRADED_LATENCY_MS = 1800;
export const PROBE_TIMEOUT_MS = 3500;
export const DEFAULT_STALE_MS = 150_000;

export function normalizeTrackUrl(sourceUrl: string): string {
  return String(sourceUrl || '')
    .trim()
    .replace(/[?&]profile=(hd|fast)\b/gi, '');
}

export function unwrapProxyTargetUrl(sourceUrl: string): string {
  const clean = normalizeTrackUrl(sourceUrl);
  if (clean.startsWith('/api/hls-proxy') || clean.startsWith('/api/dvb-live')) {
    try {
      const inner = new URL(clean, 'http://localhost').searchParams.get('url');
      if (inner) return normalizeTrackUrl(inner);
    } catch {
      // ignore parse errors
    }
  }
  return clean;
}

function resolveUpstreamReferer(urlStr: string, explicitReferer?: string): string {
  const cleanExplicit = String(explicitReferer || '').trim();
  if (/^https?:\/\//i.test(cleanExplicit)) return cleanExplicit;
  try {
    const u = new URL(urlStr);
    if (/(\.|^)stmify\.com$/i.test(u.hostname)) return 'https://stmify.com/';
    if (/(\.|^)footunder\.online$/i.test(u.hostname)) return 'https://footunder.online/';
    return `${u.origin}/`;
  } catch {
    return '';
  }
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  body?: { cancel?: () => Promise<void> } | null;
}>;

export async function probeChannelTrack(
  track: Pick<HealthProbeTrack, 'sourceUrl' | 'resolverType' | 'referer'>,
  options?: {
    timeoutMs?: number;
    fetchImpl?: FetchLike;
    previous?: TrackHealthInfo;
    belixConnected?: boolean;
  }
): Promise<TrackHealthInfo> {
  const cleanUrl = normalizeTrackUrl(track.sourceUrl);
  const now = Date.now();
  const prevFails = options?.previous?.failCount || 0;

  if (cleanUrl.startsWith('/api/belix/stream/')) {
    const belixReady = options?.belixConnected ?? isAnyBelixConnected();
    return belixReady
      ? { status: 'up', latencyMs: 650, checkedAt: now, failCount: 0 }
      : { status: 'down', statusCode: 503, latencyMs: 0, checkedAt: now, failCount: prevFails + 1 };
  }

  if (/^\/api\/(?:xtream\/stream\/|providers\/stream\/[^/]+\/live\/|stream\b)/i.test(cleanUrl)) {
    if (!isXtreamEnvConfigured()) {
      return { status: 'unknown', checkedAt: now, failCount: prevFails };
    }
    if (options?.previous?.checkedAt && now - options.previous.checkedAt < 5 * 60 * 1000 && typeof options.previous.latencyMs === 'number') {
      return { ...options.previous, checkedAt: now };
    }
    const provMatch = cleanUrl.match(/^\/api\/providers\/stream\/([^/]+)\/live\/([^.?/]+)/i);
    if (provMatch) {
      const t0 = Date.now();
      const manifest = await Promise.race([
        resolveProviderLiveManifest(decodeURIComponent(provMatch[1]), decodeURIComponent(provMatch[2]), ''),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), options?.timeoutMs ?? 2600)),
      ]).catch(() => null);
      const latencyMs = Math.max(1, Date.now() - t0);
      if (manifest && manifest.includes('#EXTM3U')) {
        return {
          status: latencyMs <= DEGRADED_LATENCY_MS ? 'up' : 'degraded',
          latencyMs,
          statusCode: 200,
          failCount: 0,
          checkedAt: Date.now(),
        };
      }
      return {
        status: 'down',
        latencyMs,
        statusCode: 503,
        failCount: prevFails + 1,
        checkedAt: Date.now(),
      };
    }

    let streamId = '';
    let providerId = 'primary';
    try {
      const parsed = new URL(cleanUrl, 'http://localhost');
      const mediaType = (parsed.searchParams.get('type') || 'live').toLowerCase();
      if (mediaType !== 'live') {
        return { status: 'unknown', checkedAt: now, failCount: prevFails };
      }
      if (cleanUrl.startsWith('/api/xtream/stream/')) {
        streamId = parsed.pathname.split('/').pop()?.replace(/\.m3u8$/i, '') || '';
      } else {
        streamId = (parsed.searchParams.get('id') || '').replace(/\.m3u8$/i, '').trim();
      }
      providerId = parsed.searchParams.get('provider') || 'primary';
    } catch {
      streamId = '';
    }
    if (!streamId) {
      return { status: 'unknown', checkedAt: now, failCount: prevFails };
    }
    const probed = await probeXtreamLiveStreamLatency(streamId, providerId, options?.timeoutMs ?? 2500);
    if (probed.ok) {
      return {
        status: probed.latencyMs <= DEGRADED_LATENCY_MS ? 'up' : 'degraded',
        latencyMs: probed.latencyMs,
        statusCode: 200,
        failCount: 0,
        checkedAt: Date.now(),
      };
    }
    return {
      status: 'down',
      latencyMs: probed.latencyMs,
      statusCode: 503,
      failCount: prevFails + 1,
      checkedAt: Date.now(),
    };
  }

  const effectiveTargetUrl = unwrapProxyTargetUrl(cleanUrl);
  if (effectiveTargetUrl.includes('90.163.85.113:8093') && isDvbUpstreamCoolingDown(effectiveTargetUrl)) {
    return { status: 'down', statusCode: 502, latencyMs: 0, checkedAt: now, failCount: prevFails + 1 };
  }

  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    return { status: 'unknown', checkedAt: now, failCount: prevFails };
  }

  const isProbableResolver =
    track.resolverType === 'tdt_hls' ||
    track.resolverType === 'direct_hls' ||
    track.resolverType === 'sports_channel' ||
    track.resolverType === 'web_embed' ||
    /\.m3u8(\?|$)/i.test(cleanUrl);

  if (!isProbableResolver) {
    return { status: 'unknown', checkedAt: now, failCount: prevFails };
  }

  const isHlsManifest =
    track.resolverType === 'tdt_hls' ||
    track.resolverType === 'direct_hls' ||
    /\.m3u8(\?|$)/i.test(cleanUrl);

  const isDvbHeadend = effectiveTargetUrl.includes('90.163.85.113:8093');
  if (isDvbHeadend && process.env.DISABLE_DVB_PROBE === '1' && !options?.fetchImpl) {
    return { status: 'down', latencyMs: 0, checkedAt: now, failCount: prevFails + 1 };
  }
  const timeoutMs = options?.timeoutMs ?? (isDvbHeadend ? 4500 : PROBE_TIMEOUT_MS);
  const fetchFn: FetchLike =
    options?.fetchImpl ?? ((input, init) => streamingFetch(String(input), { ...init, timeoutMs }));
  const isCnStream =
    cleanUrl.includes('38.75.136.137') ||
    cleanUrl.includes('63.141.230.178') ||
    cleanUrl.includes('120.76.248.139') ||
    cleanUrl.includes('153.0.171.163') ||
    cleanUrl.includes('223.112.114.228') ||
    cleanUrl.includes('gmxw.7766.org') ||
    cleanUrl.includes('epg.pw/stream/');
  const referer = resolveUpstreamReferer(cleanUrl, track.referer);
  const headers: Record<string, string> = {
    'User-Agent': isDvbHeadend ? TDT_DVB_UA : isCnStream ? 'okhttp/4.12.0' : DEFAULT_CHROME_UA,
    Accept: '*/*',
  };
  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // ignore invalid origin
    }
  }

  const startedAt = Date.now();
  try {
    const res = await fetchFn(cleanUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);

    if (isHlsManifest) {
      if (!res.ok) {
        return {
          status: 'down',
          latencyMs,
          statusCode: res.status,
          failCount: prevFails + 1,
          checkedAt: Date.now(),
        };
      }
      const bodyText = await res.text();
      const validManifest = bodyText.includes('#EXTM3U') && !/nosignal/i.test(bodyText);
      if (!validManifest) {
        return {
          status: 'down',
          latencyMs,
          statusCode: res.status,
          failCount: prevFails + 1,
          checkedAt: Date.now(),
        };
      }

      const codecInfo = inspectHlsCodecManifest(bodyText);
      let effectiveStatus: ChannelHealthStatus =
        latencyMs <= DEGRADED_LATENCY_MS ? 'up' : 'degraded';
      if (codecInfo.audioOnly) {
        effectiveStatus = 'degraded';
      }

      if (!options?.fetchImpl && !isDvbHeadend) {
        try {
          let mediaText = bodyText;
          let mediaBase = cleanUrl;
          if (mediaText.includes('#EXT-X-STREAM-INF')) {
            const subLines = mediaText.split(/\r?\n/);
            let nextIsVar = false;
            let pickedVar = '';
            for (const sl of subLines) {
              const st = sl.trim();
              if (!st) continue;
              if (st.startsWith('#EXT-X-STREAM-INF')) {
                nextIsVar = true;
              } else if (nextIsVar && !st.startsWith('#')) {
                nextIsVar = false;
                try {
                  const candidate = new URL(st, mediaBase).href;
                  const vRes = await fetchFn(candidate, {
                    method: 'GET',
                    headers,
                    signal: AbortSignal.timeout(timeoutMs),
                  });
                  if (vRes.ok) {
                    const vTxt = await vRes.text();
                    if (vTxt.includes('#EXTM3U') && !/nosignal/i.test(vTxt)) {
                      mediaText = vTxt;
                      mediaBase = candidate;
                      pickedVar = candidate;
                      break;
                    }
                  } else {
                    await vRes.body?.cancel?.().catch(() => {});
                  }
                } catch {
                  // try next variant
                }
              }
            }
            if (!pickedVar) {
              return {
                status: 'down',
                latencyMs,
                statusCode: 404,
                failCount: prevFails + 1,
                checkedAt: Date.now(),
              };
            }
          }

          if (!mediaText.includes('#EXT-X-STREAM-INF')) {
            const mLines = mediaText.split(/\r?\n/);
            let segUrl = '';
            for (let i = mLines.length - 1; i >= 0; i--) {
              const tr = mLines[i].trim();
              if (!tr || tr.startsWith('#')) continue;
              try {
                segUrl = new URL(tr, mediaBase).href;
                break;
              } catch {
                // skip
              }
            }
            if (segUrl) {
              const segRes = await fetchFn(segUrl, {
                method: 'GET',
                headers: { ...headers, Range: 'bytes=0-4095' },
                signal: AbortSignal.timeout(timeoutMs),
              });
              const segStatus = segRes.status;
              await segRes.body?.cancel?.().catch(() => {});
              if (!segRes.ok && segStatus !== 416) {
                return {
                  status: 'down',
                  latencyMs,
                  statusCode: segStatus,
                  failCount: prevFails + 1,
                  checkedAt: Date.now(),
                };
              }
            } else if (!codecInfo.isVodEnded) {
              return {
                status: 'degraded',
                latencyMs,
                statusCode: res.status,
                failCount: prevFails + 1,
                checkedAt: Date.now(),
              };
            }
          }
        } catch {
          return {
            status: 'down',
            latencyMs,
            failCount: prevFails + 1,
            checkedAt: Date.now(),
          };
        }
      }

      return {
        status: effectiveStatus,
        latencyMs,
        statusCode: res.status,
        failCount: 0,
        checkedAt: Date.now(),
        hasVideo: codecInfo.hasVideo,
        audioOnly: codecInfo.audioOnly,
        ...(codecInfo.videoCodec ? { videoCodec: codecInfo.videoCodec } : {}),
        ...(codecInfo.audioCodec ? { audioCodec: codecInfo.audioCodec } : {}),
      };
    }

    try {
      await res.body?.cancel?.();
    } catch {
      // ignore stream cancellation issues
    }
    if (res.status >= 400 || res.status === 0) {
      return {
        status: 'down',
        latencyMs,
        statusCode: res.status,
        failCount: prevFails + 1,
        checkedAt: Date.now(),
      };
    }
    return {
      status: latencyMs <= DEGRADED_LATENCY_MS ? 'up' : 'degraded',
      latencyMs,
      statusCode: res.status,
      failCount: 0,
      checkedAt: Date.now(),
    };
  } catch {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    return {
      status: 'down',
      latencyMs,
      failCount: prevFails + 1,
      checkedAt: Date.now(),
    };
  }
}
