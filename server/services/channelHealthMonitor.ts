import { logger } from '../utils/logger.ts';
import { isDvbUpstreamCoolingDown } from '../routes/proxies/dvbTranscoder.ts';
import {
  type ChannelHealthStatus,
  type ChannelHealthSummary,
  DEFAULT_STALE_MS,
  DEGRADED_LATENCY_MS,
  type FetchLike,
  type HealthProbeChannel,
  type HealthProbeTrack,
  type HlsCodecInspection,
  inspectHlsCodecManifest,
  normalizeTrackUrl,
  probeChannelTrack,
  STATUS_RANK,
  type TrackHealthInfo,
  unwrapProxyTargetUrl,
} from './channelHealthProbe.ts';

export {
  type ChannelHealthStatus,
  type ChannelHealthSummary,
  type FetchLike,
  type HealthProbeChannel,
  type HealthProbeTrack,
  type HlsCodecInspection,
  inspectHlsCodecManifest,
  normalizeTrackUrl,
  probeChannelTrack,
  type TrackHealthInfo,
};

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
      const unwrapped = unwrapProxyTargetUrl(track.sourceUrl);
      const rawHealth =
        this.getTrackHealth(track.sourceUrl) ??
        (unwrapped !== track.sourceUrl ? this.getTrackHealth(unwrapped) : undefined) ??
        track.health;
      const isCoolingDvb =
        unwrapped.includes('90.163.85.113:8093') && isDvbUpstreamCoolingDown(unwrapped);
      const health: TrackHealthInfo | undefined = isCoolingDvb
        ? {
            status: 'down',
            statusCode: 502,
            latencyMs: rawHealth?.latencyMs ?? 0,
            failCount: (rawHealth?.failCount || 0) + 1,
            checkedAt: Date.now(),
          }
        : rawHealth;
      const src = String(track.sourceUrl || '');
      const q = `${track.quality || ''} ${track.label || ''}`.toLowerCase();
      const isUhdHevc = /90\.163\.85\.113:8093\/stream\/6[4568]\//i.test(unwrapped);
      const isResidentialDvb = unwrapped.includes('90.163.85.113:8093');
      const isHttpsCdn = /^https:\/\//i.test(unwrapped) && !isResidentialDvb;
      const isPreferredEdge2 = /\/api\/belix\/stream\/531071(?:\.m3u8|\b)/i.test(src);
      const isBelix = src.startsWith('/api/belix/stream/');
      const isXtreamProxy = /^\/api\/(?:xtream\/stream|stream)\b/i.test(src);
      const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(q);
      const isFhdOr1080 = !isHevc && /\b(?:fhd|1080p?|full\s*hd)\b/.test(q);
      const is4kNonResidential = !isUhdHevc && !isHevc && /(?:4k|uhd|2160p?|⁴ᴷ)/i.test(q);
      const qualityTier = isUhdHevc
        ? 5
        : /\b(?:576p?|480p?|360p?|sd|lq)\b/.test(q) || /azotosolutions\.com/i.test(src)
        ? 4
        : isHevc
        ? 3
        : is4kNonResidential
        ? 0
        : isFhdOr1080
        ? 1
        : isXtreamProxy || isHttpsCdn || /\bhd\b/.test(q)
        ? 2
        : 3;
      const transportPenalty = /interactvty\.pro/i.test(src)
        ? 1500
        : isPreferredEdge2 || isXtreamProxy
        ? 0
        : isBelix
        ? 250
        : 0;
      const penaltyMs = (health?.qoeFailures || 0) * 1500 + (health?.qoeRebuffers || 0) * 250 + transportPenalty;
      const effectiveLatency = Math.max(
        1,
        (health?.latencyMs ?? (health?.status === 'unknown' ? 1200 : 800)) + penaltyMs
      );
      return {
        track: health ? { ...track, health } : { ...track },
        originalIndex,
        isUhdHevc,
        isHevc,
        isResidentialDvb,
        isHttpsCdn,
        isPreferredEdge2,
        isBelix,
        isXtreamProxy,
        status: health?.status ?? ('unknown' as ChannelHealthStatus),
        qualityTier,
        latencyBucket: Math.floor(effectiveLatency / 750),
        rawLatency: effectiveLatency,
      };
    });

    indexed.sort((a, b) => {
      if (a.status !== 'down' && b.status !== 'down' && a.isUhdHevc !== b.isUhdHevc) {
        return a.isUhdHevc ? 1 : -1;
      }
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;

      // Verified fast Xtream 4K/FHD non-HEVC Spanish signals beat Belix edge2 when probed 'up'
      const aFastXtream = a.isXtreamProxy && a.status === 'up' && a.qualityTier <= 2;
      const bFastXtream = b.isXtreamProxy && b.status === 'up' && b.qualityTier <= 2;
      if (aFastXtream !== bFastXtream) {
        return aFastXtream ? -1 : 1;
      }

      if (a.isPreferredEdge2 !== b.isPreferredEdge2) {
        if (a.isPreferredEdge2 && a.status !== 'down') return -1;
        if (b.isPreferredEdge2 && b.status !== 'down') return 1;
      }
      if (a.status !== 'down' && b.status !== 'down') {
        if (a.qualityTier !== b.qualityTier) return a.qualityTier - b.qualityTier;
        if (a.status !== 'unknown' && a.rawLatency !== b.rawLatency) {
          return a.rawLatency - b.rawLatency;
        }
        if (a.isXtreamProxy !== b.isXtreamProxy) {
          return a.isXtreamProxy ? -1 : 1;
        }
      }
      if (a.status === 'up' && b.status === 'up') {
        if (a.isHttpsCdn !== b.isHttpsCdn) {
          return a.isHttpsCdn ? -1 : 1;
        }
        if (a.isResidentialDvb !== b.isResidentialDvb) {
          return a.isResidentialDvb ? -1 : 1;
        }
      }
      if (a.isBelix && b.isBelix && a.status === b.status) {
        return a.originalIndex - b.originalIndex;
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
