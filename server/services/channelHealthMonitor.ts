import { logger } from '../utils/logger.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { getBelixStatus } from './belix/belixXtreamClient.ts';

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

const STATUS_RANK: Record<ChannelHealthStatus, number> = {
  up: 0,
  degraded: 1,
  unknown: 2,
  down: 3,
};

const DEGRADED_LATENCY_MS = 1800;
const PROBE_TIMEOUT_MS = 3500;
const DEFAULT_STALE_MS = 150_000;

export function normalizeTrackUrl(sourceUrl: string): string {
  return String(sourceUrl || '')
    .trim()
    .replace(/[?&]profile=(hd|fast)\b/gi, '');
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
  }
): Promise<TrackHealthInfo> {
  const cleanUrl = normalizeTrackUrl(track.sourceUrl);
  const now = Date.now();
  const prevFails = options?.previous?.failCount || 0;

  if (cleanUrl.startsWith('/api/belix/stream/')) {
    return getBelixStatus().connected
      ? { status: 'up', latencyMs: 1, checkedAt: now, failCount: 0 }
      : { status: 'down', statusCode: 503, latencyMs: 0, checkedAt: now, failCount: prevFails + 1 };
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

  const isDvbHeadend = cleanUrl.includes('90.163.85.113:8093');
  if (isDvbHeadend && process.env.DISABLE_DVB_PROBE === '1' && !options?.fetchImpl) {
    return { status: 'down', latencyMs: 0, checkedAt: now, failCount: prevFails + 1 };
  }
  const timeoutMs = options?.timeoutMs ?? (isDvbHeadend ? 7500 : PROBE_TIMEOUT_MS);
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

    // Sports embed / channel page: verify < 400 and abort body transfer immediately
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

export class ChannelHealthMonitor {
  private readonly trackHealth = new Map<string, TrackHealthInfo>();
  private sweepPromise: Promise<void> | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSweepAt: number | null = null;
  private lastSweepDurationMs = 0;

  getTrackHealth(sourceUrl: string): TrackHealthInfo | undefined {
    const key = normalizeTrackUrl(sourceUrl);
    return key ? this.trackHealth.get(key) : undefined;
  }

  setTrackHealth(sourceUrl: string, info: TrackHealthInfo): void {
    const key = normalizeTrackUrl(sourceUrl);
    if (key) {
      this.trackHealth.set(key, info);
    }
  }

  clear(): void {
    this.trackHealth.clear();
    this.lastSweepAt = null;
    this.lastSweepDurationMs = 0;
  }

  recordPlaybackFeedback(
    sourceUrl: string,
    feedback: { startupMs?: number; rebufferCount?: number; failed?: boolean }
  ): void {
    const key = normalizeTrackUrl(sourceUrl);
    if (!key) return;
    const prev = this.trackHealth.get(key);
    const prevRebuffers = prev?.qoeRebuffers || 0;
    const prevQoeFails = prev?.qoeFailures || 0;
    const qoeFailures = feedback.failed ? prevQoeFails + 1 : Math.max(0, prevQoeFails - 1);
    const qoeRebuffers = prevRebuffers + (feedback.rebufferCount || 0);
    const nextStatus: ChannelHealthStatus =
      feedback.failed && qoeFailures >= 2
        ? 'down'
        : feedback.failed || (feedback.startupMs && feedback.startupMs > DEGRADED_LATENCY_MS) || (feedback.rebufferCount || 0) >= 2
          ? 'degraded'
          : prev?.status || 'up';

    this.trackHealth.set(key, {
      status: nextStatus,
      latencyMs: feedback.startupMs ?? prev?.latencyMs,
      failCount: feedback.failed ? (prev?.failCount || 0) + 1 : 0,
      checkedAt: Date.now(),
      statusCode: prev?.statusCode,
      qoeRebuffers,
      qoeFailures,
    });
  }

  prioritizeTracks<T extends HealthProbeTrack>(tracks: T[]): T[] {
    if (!Array.isArray(tracks) || tracks.length === 0) return [];
    const indexed = tracks.map((track, originalIndex) => {
      const health = this.getTrackHealth(track.sourceUrl) ?? track.health;
      const src = String(track.sourceUrl || '');
      const q = String(track.quality || '').toLowerCase();
      const isUhdHevc = /90\.163\.85\.113:8093\/stream\/6[4568]\//i.test(src);
      const qualityTier = isUhdHevc
        ? 4
        : /576p|480p|360p/.test(q) || /azotosolutions\.com/i.test(src)
        ? 3
        : /720p/.test(q)
        ? 2
        : 0;
      const transportPenalty = src.includes('90.163.85.113:8093') ? 1200 : /interactvty\.pro/i.test(src) ? 1500 : 0;
      const penaltyMs = (health?.qoeFailures || 0) * 1500 + (health?.qoeRebuffers || 0) * 250 + transportPenalty;
      const effectiveLatency = (health?.latencyMs ?? (health?.status === 'unknown' ? 1200 : 800)) + penaltyMs;
      return {
        track: health ? { ...track, health } : { ...track },
        originalIndex,
        isUhdHevc,
        status: health?.status ?? ('unknown' as ChannelHealthStatus),
        qualityTier,
        latencyBucket: Math.floor(effectiveLatency / 750),
      };
    });

    indexed.sort((a, b) => {
      if (a.status !== 'down' && b.status !== 'down' && a.isUhdHevc !== b.isUhdHevc) {
        return a.isUhdHevc ? 1 : -1;
      }
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      if (a.status !== 'unknown') {
        if (a.qualityTier !== b.qualityTier) return a.qualityTier - b.qualityTier;
        if (a.latencyBucket !== b.latencyBucket) return a.latencyBucket - b.latencyBucket;
      }
      return a.originalIndex - b.originalIndex;
    });

    return indexed.map((entry) => entry.track);
  }

  prioritizeChannels<C extends HealthProbeChannel>(channels: C[]): C[] {
    if (!Array.isArray(channels)) return [];
    return channels.map((ch) => {
      const sortedTracks = this.prioritizeTracks(ch.channels || []);
      let bestStatus: ChannelHealthStatus = 'unknown';
      let upCount = 0;
      let bestLatencyMs: number | undefined;

      for (const tr of sortedTracks) {
        const st = tr.health?.status ?? 'unknown';
        if (st === 'up') upCount += 1;
        if (STATUS_RANK[st] < STATUS_RANK[bestStatus]) {
          bestStatus = st;
        }
        if (
          typeof tr.health?.latencyMs === 'number' &&
          (st === 'up' || st === 'degraded') &&
          (bestLatencyMs === undefined || tr.health.latencyMs < bestLatencyMs)
        ) {
          bestLatencyMs = tr.health.latencyMs;
        }
      }

      return {
        ...ch,
        channels: sortedTracks,
        healthSummary: {
          bestStatus,
          upCount,
          totalCount: sortedTracks.length,
          ...(bestLatencyMs !== undefined ? { bestLatencyMs } : {}),
        },
      };
    });
  }

  async runSweep(
    channels: HealthProbeChannel[],
    options?: {
      force?: boolean;
      concurrency?: number;
      staleMs?: number;
      timeoutMs?: number;
      fetchImpl?: FetchLike;
    }
  ): Promise<void> {
    if (this.sweepPromise) {
      return this.sweepPromise;
    }

    const execute = async () => {
      const startedAt = Date.now();
      const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
      const concurrency = Math.max(1, Math.min(16, options?.concurrency ?? 8));

      const uniqueTracks = new Map<string, HealthProbeTrack>();
      for (const ch of channels) {
        for (const tr of ch.channels || []) {
          const key = normalizeTrackUrl(tr.sourceUrl);
          if (!key || uniqueTracks.has(key)) continue;
          if (!options?.force) {
            const existing = this.trackHealth.get(key);
            if (existing?.checkedAt && Date.now() - existing.checkedAt < staleMs) {
              continue;
            }
          }
          uniqueTracks.set(key, tr);
        }
      }

      const normalQueue: Array<[string, HealthProbeTrack]> = [];
      const dvbQueue: Array<[string, HealthProbeTrack]> = [];
      for (const entry of uniqueTracks.entries()) {
        if (entry[0].includes('90.163.85.113:8093')) {
          if (process.env.DISABLE_DVB_PROBE !== '1' || Boolean(options?.fetchImpl)) {
            dvbQueue.push(entry);
          }
        } else {
          normalQueue.push(entry);
        }
      }

      let cursor = 0;
      const worker = async () => {
        while (cursor < normalQueue.length) {
          const currentIndex = cursor++;
          const [key, track] = normalQueue[currentIndex];
          const previous = this.trackHealth.get(key);
          const result = await probeChannelTrack(track, {
            timeoutMs: options?.timeoutMs,
            fetchImpl: options?.fetchImpl,
            previous,
          });
          this.trackHealth.set(key, result);
        }
      };

      const dvbWorker = async () => {
        for (const [key, track] of dvbQueue) {
          const previous = this.trackHealth.get(key);
          const result = await probeChannelTrack(track, {
            timeoutMs: options?.timeoutMs,
            fetchImpl: options?.fetchImpl,
            previous,
          });
          this.trackHealth.set(key, result);
        }
      };

      const tasks: Promise<void>[] = [];
      const workerCount = Math.min(concurrency, normalQueue.length);
      for (let i = 0; i < workerCount; i++) {
        tasks.push(worker());
      }
      if (dvbQueue.length > 0) {
        tasks.push(dvbWorker());
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }

      this.lastSweepAt = Date.now();
      this.lastSweepDurationMs = this.lastSweepAt - startedAt;

      const summary = this.getSummary();
      logger.info(
        {
          probed: normalQueue.length + dvbQueue.length,
          durationMs: this.lastSweepDurationMs,
          counts: summary.counts,
        },
        'channel_health_sweep_complete'
      );
    };

    this.sweepPromise = execute().finally(() => {
      this.sweepPromise = null;
    });
    return this.sweepPromise;
  }

  getSummary() {
    const counts: Record<ChannelHealthStatus, number> = {
      up: 0,
      degraded: 0,
      down: 0,
      unknown: 0,
    };
    for (const info of this.trackHealth.values()) {
      counts[info.status] = (counts[info.status] || 0) + 1;
    }
    return {
      isSweeping: Boolean(this.sweepPromise),
      lastSweepAt: this.lastSweepAt,
      lastSweepDurationMs: this.lastSweepDurationMs,
      totalTracked: this.trackHealth.size,
      counts,
    };
  }

  getAllTrackStatuses(): Record<string, TrackHealthInfo> {
    const out: Record<string, TrackHealthInfo> = {};
    for (const [k, v] of this.trackHealth.entries()) {
      out[k] = v;
    }
    return out;
  }

  startScheduler(
    getChannels: () => HealthProbeChannel[] | Promise<HealthProbeChannel[]>,
    intervalMs = 3 * 60 * 1000,
    initialDelayMs = 8_000
  ): void {
    this.stopScheduler();

    const triggerSweep = async () => {
      try {
        const list = await getChannels();
        if (Array.isArray(list) && list.length > 0) {
          await this.runSweep(list);
        }
      } catch (err) {
        logger.warn({ err }, 'channel_health_sweep_failed');
      }
    };

    this.initialTimer = setTimeout(() => {
      triggerSweep();
    }, initialDelayMs);
    this.initialTimer.unref?.();

    this.schedulerTimer = setInterval(() => {
      triggerSweep();
    }, intervalMs);
    this.schedulerTimer.unref?.();
  }

  stopScheduler(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}

export const channelHealthMonitor = new ChannelHealthMonitor();
