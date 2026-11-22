import os from 'os';
import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';

export type AppPlatformVertical =
  | 'web'
  | 'pwa'
  | 'android-mobile'
  | 'android-tv'
  | 'smart-tv'
  | 'music-app';

export type AppFeatureVertical =
  | 'cine'
  | 'futbol'
  | 'tv'
  | 'iptv'
  | 'music'
  | 'kids'
  | 'juegos'
  | 'admin';

export interface ClientVitalsSample {
  id: string;
  ts: number;
  platform: AppPlatformVertical;
  vertical: AppFeatureVertical;
  ttfbMs?: number;
  fcpMs?: number;
  domInteractiveMs?: number;
  effectiveNetworkType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  swActive: boolean;
  standalonePwa: boolean;
  jsHeapMb?: number;
  appVersion?: string;
}

export interface AdminEventRecord {
  id: string;
  ts: number;
  severity: 'info' | 'warn' | 'error';
  category: 'system' | 'media' | 'sports' | 'iptv' | 'music' | 'ai' | 'rooms' | 'admin' | 'worker';
  message: string;
  actor?: string;
  meta?: Record<string, unknown>;
}

export interface MediaPlaneMetrics {
  hlsRequests: number;
  tsRequests: number;
  dvbRequests: number;
  embedRequests: number;
  belixRequests: number;
  musicProxyRequests: number;
  activeMediaStreams: number;
  totalBytesProxied: number;
  nativeFetchSuccess: number;
  curlFallbackCount: number;
  directPlayEvaluated: number;
  directPlayEligible: number;
  vodManifestCacheHits: number;
  dvbTranscodeSuccess: number;
  dvbTranscodeErrors: number;
}

class RuntimeMetricsCollector {
  private eventLoopMonitor: IntervalHistogram | null = null;
  private lastCpuUsage = process.cpuUsage();
  private lastCpuSampleAt = Date.now();
  private latestCpuPercent = 0;

  private readonly httpCounters = {
    totalRequests: 0,
    errors5xx: 0,
    rateLimited429: 0,
    avgLatencyMs: 0,
  };
  private latencyWindow: number[] = [];

  private readonly media: MediaPlaneMetrics = {
    hlsRequests: 0,
    tsRequests: 0,
    dvbRequests: 0,
    embedRequests: 0,
    belixRequests: 0,
    musicProxyRequests: 0,
    activeMediaStreams: 0,
    totalBytesProxied: 0,
    nativeFetchSuccess: 0,
    curlFallbackCount: 0,
    directPlayEvaluated: 0,
    directPlayEligible: 0,
    vodManifestCacheHits: 0,
    dvbTranscodeSuccess: 0,
    dvbTranscodeErrors: 0,
  };

  private readonly aiMetrics = {
    totalRequests: 0,
    fallbackResponses: 0,
    rateLimit429Count: 0,
    overload503Count: 0,
    liveVoiceSessions: 0,
  };

  private readonly workerStats = {
    mode: 'in-process' as 'worker-thread' | 'in-process',
    healthy: true,
    sweepsCompleted: 0,
    lastSweepDurationMs: 0,
    lastSweepAt: 0,
    lastError: null as string | null,
  };

  private readonly clientVitals: ClientVitalsSample[] = [];
  private readonly adminEvents: AdminEventRecord[] = [];
  private readonly latencyHistory: Array<{ ts: number; eventLoopP95Ms: number; httpAvgMs: number; rssMb: number }> = [];

  constructor() {
    try {
      this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
      this.eventLoopMonitor.enable();
    } catch {
      this.eventLoopMonitor = null;
    }
  }

  sampleSystemTick(): void {
    const now = Date.now();
    const elapsedMs = Math.max(100, now - this.lastCpuSampleAt);
    const diff = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuSampleAt = now;
    const cpuCount = Math.max(1, os.cpus()?.length || 1);
    const totalMicros = diff.user + diff.system;
    const pct = (totalMicros / (elapsedMs * 1000 * cpuCount)) * 100;
    this.latestCpuPercent = Number(Math.min(100, Math.max(0, pct)).toFixed(1));

    const mem = process.memoryUsage();
    const el = this.getEventLoopStats();
    this.latencyHistory.push({
      ts: now,
      eventLoopP95Ms: el.p95Ms,
      httpAvgMs: this.httpCounters.avgLatencyMs,
      rssMb: Math.round(mem.rss / (1024 * 1024)),
    });
    if (this.latencyHistory.length > 60) {
      this.latencyHistory.shift();
    }
  }

  getEventLoopStats() {
    if (!this.eventLoopMonitor) {
      return { minMs: 0, meanMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    }
    const toMs = (ns: number) => Number((Math.max(0, ns) / 1e6).toFixed(2));
    return {
      minMs: toMs(this.eventLoopMonitor.min),
      meanMs: toMs(this.eventLoopMonitor.mean),
      p95Ms: toMs(this.eventLoopMonitor.percentile(95)),
      p99Ms: toMs(this.eventLoopMonitor.percentile(99)),
      maxMs: toMs(this.eventLoopMonitor.max),
    };
  }

  recordHttpRequest(statusCode: number, durationMs: number): void {
    this.httpCounters.totalRequests += 1;
    if (statusCode >= 500) this.httpCounters.errors5xx += 1;
    if (statusCode === 429) this.httpCounters.rateLimited429 += 1;
    this.latencyWindow.push(Math.max(0, Math.round(durationMs)));
    if (this.latencyWindow.length > 100) this.latencyWindow.shift();
    const sum = this.latencyWindow.reduce((a, b) => a + b, 0);
    this.httpCounters.avgLatencyMs = Math.round(sum / Math.max(1, this.latencyWindow.length));
  }

  recordMediaRequest(kind: 'hls' | 'ts' | 'dvb' | 'embed' | 'belix' | 'music', bytes = 0): void {
    if (kind === 'hls') this.media.hlsRequests += 1;
    else if (kind === 'ts') this.media.tsRequests += 1;
    else if (kind === 'dvb') this.media.dvbRequests += 1;
    else if (kind === 'embed') this.media.embedRequests += 1;
    else if (kind === 'belix') this.media.belixRequests += 1;
    else if (kind === 'music') this.media.musicProxyRequests += 1;
    if (bytes > 0) this.media.totalBytesProxied += bytes;
  }

  adjustActiveMediaStreams(delta: 1 | -1): void {
    this.media.activeMediaStreams = Math.max(0, this.media.activeMediaStreams + delta);
  }

  recordUpstreamTransport(usedCurlFallback: boolean, bytes = 0): void {
    if (usedCurlFallback) this.media.curlFallbackCount += 1;
    else this.media.nativeFetchSuccess += 1;
    if (bytes > 0) this.media.totalBytesProxied += bytes;
  }

  recordDirectPlayDecision(eligible: boolean): void {
    this.media.directPlayEvaluated += 1;
    if (eligible) this.media.directPlayEligible += 1;
  }

  recordVodManifestHit(): void {
    this.media.vodManifestCacheHits += 1;
  }

  recordDvbTranscodeResult(ok: boolean): void {
    if (ok) this.media.dvbTranscodeSuccess += 1;
    else this.media.dvbTranscodeErrors += 1;
  }

  recordAiOutcome(outcome: 'ok' | 'fallback' | '429' | '503'): void {
    this.aiMetrics.totalRequests += 1;
    if (outcome === 'fallback') this.aiMetrics.fallbackResponses += 1;
    if (outcome === '429') this.aiMetrics.rateLimit429Count += 1;
    if (outcome === '503') this.aiMetrics.overload503Count += 1;
  }

  adjustLiveVoiceSessions(delta: 1 | -1): void {
    this.aiMetrics.liveVoiceSessions = Math.max(0, this.aiMetrics.liveVoiceSessions + delta);
  }

  updateWorkerStatus(patch: Partial<typeof this.workerStats>): void {
    Object.assign(this.workerStats, patch);
  }

  recordClientVitals(sample: Omit<ClientVitalsSample, 'id' | 'ts'>): ClientVitalsSample {
    const entry: ClientVitalsSample = {
      id: `vital-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...sample,
    };
    this.clientVitals.push(entry);
    if (this.clientVitals.length > 200) {
      this.clientVitals.shift();
    }
    return entry;
  }

  pushAdminEvent(event: Omit<AdminEventRecord, 'id' | 'ts'>): AdminEventRecord {
    const entry: AdminEventRecord = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      ...event,
    };
    this.adminEvents.unshift(entry);
    if (this.adminEvents.length > 150) {
      this.adminEvents.pop();
    }
    return entry;
  }

  getClientVitalsSummary() {
    const byPlatform: Record<string, { count: number; avgTtfbMs: number; avgFcpMs: number; pwaCount: number }> = {};
    const byVertical: Record<string, number> = {};
    for (const s of this.clientVitals) {
      byVertical[s.vertical] = (byVertical[s.vertical] || 0) + 1;
      const cur = byPlatform[s.platform] || { count: 0, avgTtfbMs: 0, avgFcpMs: 0, pwaCount: 0 };
      const nextCount = cur.count + 1;
      cur.avgTtfbMs =
        typeof s.ttfbMs === 'number'
          ? Math.round((cur.avgTtfbMs * cur.count + s.ttfbMs) / nextCount)
          : cur.avgTtfbMs;
      cur.avgFcpMs =
        typeof s.fcpMs === 'number'
          ? Math.round((cur.avgFcpMs * cur.count + s.fcpMs) / nextCount)
          : cur.avgFcpMs;
      if (s.standalonePwa) cur.pwaCount += 1;
      cur.count = nextCount;
      byPlatform[s.platform] = cur;
    }
    return {
      totalSamples: this.clientVitals.length,
      byPlatform,
      byVertical,
      recent: this.clientVitals.slice(-15).reverse(),
    };
  }

  getSnapshot() {
    const mem = process.memoryUsage();
    return {
      ts: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      cpuPercent: this.latestCpuPercent,
      cpuCores: os.cpus()?.length || 1,
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
        externalMb: Math.round(mem.external / (1024 * 1024)),
        systemFreeMb: Math.round(os.freemem() / (1024 * 1024)),
        systemTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
      },
      eventLoop: this.getEventLoopStats(),
      http: { ...this.httpCounters },
      media: { ...this.media },
      ai: { ...this.aiMetrics },
      worker: { ...this.workerStats },
      latencyHistory: [...this.latencyHistory],
      recentEvents: [...this.adminEvents],
      clientVitals: this.getClientVitalsSummary(),
    };
  }
}

export const runtimeMetrics = new RuntimeMetricsCollector();
