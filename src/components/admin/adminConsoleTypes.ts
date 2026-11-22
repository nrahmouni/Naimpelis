export type AdminTabId =
  | 'overview'
  | 'platforms'
  | 'channels'
  | 'content_ai'
  | 'rooms_logs'
  | 'traceability';

export interface AdminOverviewSnapshot {
  ts: number;
  service: string;
  version: string;
  architecture: {
    controlPlane: {
      uptimeSec: number;
      nodeVersion: string;
      pid: number;
      cpuPercent: number;
      cpuCores: number;
      memory: {
        rssMb: number;
        heapUsedMb: number;
        heapTotalMb: number;
        externalMb: number;
        systemFreeMb: number;
        systemTotalMb: number;
      };
      eventLoop: {
        minMs: number;
        meanMs: number;
        p95Ms: number;
        p99Ms: number;
        maxMs: number;
      };
      http: {
        totalRequests: number;
        errors5xx: number;
        rateLimited429: number;
        avgLatencyMs: number;
      };
    };
    mediaPlane: {
      deploymentMode: string;
      mediaProxyOrigin: string | null;
      activeDvbFfmpegSessions: number;
      activeDvbSessions: number;
      nativeTransportPct: number;
      directPlayEligiblePct: number;
      metrics: {
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
      };
    };
    worker: {
      mode: 'worker-thread' | 'in-process';
      healthy: boolean;
      sweepsCompleted: number;
      lastSweepDurationMs: number;
      lastSweepAt: number;
      lastError: string | null;
    };
    storage: {
      activeDriver: 'postgres-drizzle' | 'redis-rest' | 'memory-disk';
      postgresConfigured: boolean;
      postgresReady: boolean;
      postgresInitError: string | null;
      redisRestConfigured: boolean;
      diskFallbackPath: string;
      auditLogCount: number;
    };
    pubSub: {
      nodeId: string;
      mode: string;
      publishedCount: number;
      receivedCount: number;
      lastPublishedAt: number;
    };
    sse: {
      publicSseClients: number;
      adminSseClients: number;
      totalBroadcasts: number;
    };
    servicesMesh: Array<{
      id: string;
      name: string;
      version: string;
      status: 'healthy' | 'degraded' | 'open-circuit';
      requestsTotal: number;
      errorsTotal: number;
      avgLatencyMs: number;
      lastErrorAt: number | null;
      lastErrorMsg: string | null;
    }>;
  };
  verticals: {
    riffanTvWeb: {
      status: string;
      httpRequests: number;
      avgLatencyMs: number;
      errors5xx: number;
      rateLimited429: number;
      pwaCachingEnabled: boolean;
      qoe: PlatformQoeSummary | null;
    };
    googleTv: {
      packageName: string;
      versionName: string;
      versionCode: number;
      receiverRoute: string;
      qoe: PlatformQoeSummary | null;
    };
    androidMobile: {
      packageName: string;
      versionName: string;
      versionCode: number;
      qoe: PlatformQoeSummary | null;
    };
    riffanMusic: {
      packageName: string;
      versionName: string;
      versionCode: number;
      musicProxyRequests: number;
    };
    iptvAndChannels: {
      tdtChannelsCount: number;
      catalaChannelsCount: number;
      belixChannelsCount: number;
      rbtvChannelsCount: number;
      worldChannelsCount: number;
      iptvMeta?: {
        lastSyncedAt?: number;
        syncedChannelCount?: number;
        sourceCount?: number;
      };
      healthSummary: {
        isSweeping: boolean;
        lastSweepAt: number;
        lastSweepDurationMs: number;
        totalTracked: number;
        counts: { up: number; degraded: number; down: number; unknown: number };
      };
      problemTracks: Array<{
        url: string;
        status: string;
        latencyMs?: number;
        failCount?: number;
        checkedAt?: number;
        audioOnly?: boolean;
        videoCodec?: string;
        audioCodec?: string;
        statusCode?: number;
      }>;
      allTracksCount: number;
    };
    sportsAndFootball: {
      cachedMatchesCount: number;
      lastBoardRefreshAt: number;
      liveAgendaCount: number;
      permanent247Count: number;
    };
    vodCatalog: {
      schedulerRunning: boolean;
      totalIndexed: number;
      lastCycle: {
        startedAt: number;
        finishedAt: number;
        durationMs: number;
        totalIndexed: number;
        sources: Array<{ source: string; itemsIndexed: number; ok: boolean; durationMs: number }>;
      } | null;
      sources: Array<{ source: string; itemsIndexed: number; ok: boolean; durationMs: number }>;
    };
    watchParty: {
      roomsCount: number;
      connectedClientsCount: number;
      pubSubNodeId: string;
      pubSubMode: string;
    };
    aiEngine: {
      totalRequests: number;
      fallbackResponses: number;
      rateLimit429Count: number;
      overload503Count: number;
      liveVoiceSessions: number;
      geminiKeyConfigured: boolean;
    };
  };
  qoe: {
    totalSamples: number;
    byPlatform: Record<string, PlatformQoeSummary>;
    recent: Array<{
      id: string;
      ts: number;
      platform: string;
      startupMs: number;
      rebufferCount: number;
      resolution?: string;
      stallFailoverUsed?: boolean;
      failed?: boolean;
    }>;
  };
  clientVitals: {
    totalSamples: number;
    byPlatform: Record<string, { count: number; avgTtfbMs: number; avgFcpMs: number; pwaCount: number }>;
    byVertical: Record<string, number>;
    recent: Array<{
      id: string;
      ts: number;
      platform: string;
      vertical: string;
      ttfbMs?: number;
      fcpMs?: number;
      swActive: boolean;
      standalonePwa: boolean;
      effectiveNetworkType?: string;
    }>;
  };
  latencyHistory: Array<{
    ts: number;
    eventLoopP95Ms: number;
    httpAvgMs: number;
    rssMb: number;
  }>;
  runtimeEvents: Array<{
    id: string;
    ts: number;
    severity: 'info' | 'warn' | 'error';
    category: string;
    message: string;
    actor?: string;
  }>;
  auditEvents: Array<{
    eventId: string;
    actor: string;
    action: string;
    target: string;
    severity: 'info' | 'warn' | 'error';
    createdAt: number;
  }>;
  improvementsTotal: number;
  improvementsByPhase: Record<string, number>;
}

export interface PlatformQoeSummary {
  count: number;
  p50StartupMs: number;
  p95StartupMs: number;
  avgRebuffers: number;
  failovers: number;
  failures: number;
}
