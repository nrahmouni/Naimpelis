import fs from 'fs';
import { logger } from '../utils/logger.ts';
import { loadDistributedKey, saveDistributedKey } from './distributedStore.ts';
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

const CHANNEL_HEALTH_SNAPSHOT_PATH = '/tmp/naimcine-channel-health-v1.json';
const HEALTH_HYDRATE_MAX_AGE_MS = 20 * 60 * 1000;
export const MAX_CHANNEL_PROBE_CONCURRENCY = 10;

export async function runWithBoundedConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(MAX_CHANNEL_PROBE_CONCURRENCY, Math.floor(concurrency) || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runner = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner())
  );
  return results;
}

export class ChannelHealthMonitor {
  private readonly trackHealth = new Map<string, TrackHealthInfo>();
  private sweepPromise: Promise<void> | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSweepAt: number | null = null;
  private lastSweepDurationMs = 0;

  constructor() {
    this.hydrateFromDisk();
  }

  private hydrateFromDisk(): void {
    if (process.env.VITEST) return;
    try {
      if (fs.existsSync(CHANNEL_HEALTH_SNAPSHOT_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(CHANNEL_HEALTH_SNAPSHOT_PATH, 'utf8'));
        this.importTrackStatuses(parsed);
      }
    } catch {
      // ignore corrupt health snapshot
    }
    void loadDistributedKey<Record<string, TrackHealthInfo>>('channel-health:v1')
      .then((remote) => {
        if (remote && this.trackHealth.size === 0) {
          this.importTrackStatuses(remote);
        }
      })
      .catch(() => {});
  }

  importTrackStatuses(statuses: Record<string, TrackHealthInfo> | null | undefined): void {
    if (!statuses || typeof statuses !== 'object') return;
    const now = Date.now();
    for (const [key, info] of Object.entries(statuses)) {
      if (!key || !info || typeof info.status !== 'string') continue;
      if (info.checkedAt && now - info.checkedAt > HEALTH_HYDRATE_MAX_AGE_MS) continue;
      this.trackHealth.set(key, info);
    }
  }

  private schedulePersist(): void {
    if (process.env.VITEST || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const snapshot = this.getAllTrackStatuses();
      if (Object.keys(snapshot).length === 0) return;
      void fs.promises
        .writeFile(CHANNEL_HEALTH_SNAPSHOT_PATH, JSON.stringify(snapshot), 'utf8')
        .catch(() => {});
      void saveDistributedKey('channel-health:v1', snapshot, 1800).catch(() => {});
    }, 20_000);
    this.persistTimer.unref?.();
  }

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
    this.schedulePersist();
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
      const q = String(track.quality || '').toLowerCase();
      const isUhdHevc = /90\.163\.85\.113:8093\/stream\/6[4568]\//i.test(unwrapped);
      const isResidentialDvb = unwrapped.includes('90.163.85.113:8093');
      const isHttpsCdn = /^https:\/\//i.test(unwrapped) && !isResidentialDvb;
      const isPreferredEdge2 = /\/api\/belix\/stream\/531071(?:\.m3u8|\b)/i.test(src);
      const isPriorityFeed =
        /^tdt-[a-z0-9-]+-priority-/i.test(String(track.id || '')) ||
        /prioritaria|spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(String(track.label || ''));
      const isBelix = src.startsWith('/api/belix/stream/');
      const qualityTier = isUhdHevc
        ? 4
        : /576p|480p|360p/.test(q) || /azotosolutions\.com/i.test(src)
        ? 3
        : /720p/.test(q)
        ? 2
        : 0;
      const transportPenalty = /interactvty\.pro/i.test(src)
        ? 1500
        : isPreferredEdge2 || isPriorityFeed
        ? 0
        : isBelix
        ? 350
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
        isResidentialDvb,
        isHttpsCdn,
        isPreferredEdge2,
        isPriorityFeed,
        isBelix,
        status: health?.status ?? ('unknown' as ChannelHealthStatus),
        qualityTier,
        latencyBucket: Math.floor(effectiveLatency / 750),
      };
    });

    indexed.sort((a, b) => {
      if (a.isPriorityFeed !== b.isPriorityFeed) {
        if (a.isPriorityFeed && a.status !== 'down') return -1;
        if (b.isPriorityFeed && b.status !== 'down') return 1;
      }
      if (a.status !== 'down' && b.status !== 'down' && a.isUhdHevc !== b.isUhdHevc) {
        return a.isUhdHevc ? 1 : -1;
      }
      if (a.isPreferredEdge2 !== b.isPreferredEdge2) {
        if (a.isPreferredEdge2 && a.status !== 'down') return -1;
        if (b.isPreferredEdge2 && b.status !== 'down') return 1;
      }
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
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
      const concurrency = Math.max(
        1,
        Math.min(MAX_CHANNEL_PROBE_CONCURRENCY, options?.concurrency ?? MAX_CHANNEL_PROBE_CONCURRENCY)
      );
      const probeTimeoutMs = Math.min(2_500, options?.timeoutMs ?? 1_500);

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

      // Verify previously healthy ('up') tracks first, then unknown/degraded, and 'down' tracks last
      normalQueue.sort(([keyA, trA], [keyB, trB]) => {
        const stA = this.trackHealth.get(keyA)?.status ?? trA.health?.status ?? 'unknown';
        const stB = this.trackHealth.get(keyB)?.status ?? trB.health?.status ?? 'unknown';
        return STATUS_RANK[stA] - STATUS_RANK[stB];
      });

      const tasks: Promise<unknown>[] = [];
      if (normalQueue.length > 0) {
        tasks.push(
          runWithBoundedConcurrency(normalQueue, concurrency, async ([key, track]) => {
            const previous = this.trackHealth.get(key);
            const result = await probeChannelTrack(track, {
              timeoutMs: probeTimeoutMs,
              fetchImpl: options?.fetchImpl,
              previous,
            });
            this.trackHealth.set(key, result);
          })
        );
      }

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

      if (dvbQueue.length > 0) {
        tasks.push(dvbWorker());
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }

      this.lastSweepAt = Date.now();
      this.lastSweepDurationMs = this.lastSweepAt - startedAt;
      this.schedulePersist();

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
          await this.runSweep(list, {
            concurrency: MAX_CHANNEL_PROBE_CONCURRENCY,
            timeoutMs: 1_500,
          });
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
