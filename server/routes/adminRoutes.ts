import type { Express, Request, Response } from 'express';
import { ENV } from '../config/env.ts';
import { serviceMesh } from '../gateway/serviceMesh.ts';
import { createSlidingWindowRateLimiter } from '../middleware/errorHandler.ts';
import { logger } from '../utils/logger.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import { CATALA_LIVE_CHANNELS } from '../data/catalaRegistry.ts';
import { getQoeRingBufferSnapshot } from './health.ts';
import { clearAiModelCooldowns } from './aiStudio/shared.ts';
import {
  destroyAllLiveDvbSessions,
  dvbAacSegmentCache,
  dvbRollingPlaylistMap,
  getActiveDvbSessionCount,
} from './proxies/dvbTranscoder.ts';
import { vodHlsManifestCache } from './proxies/vodManifestManager.ts';
import {
  getCachedFootballBoardSnapshot,
  getCachedSportsMatches,
  getPermanent247SportsMatches,
  prewarmTodayFootballBoard,
} from './sports.ts';
import { getIptvSyncMeta, refreshLiveIptvRegistry } from '../services/iptvPlaylistService.ts';
import { getCatalogRefreshStatus, runRefreshCycle } from '../services/catalogRefreshService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import { getImprovementsSummary } from '../services/improvementsRegistry.ts';
import { runtimeMetrics } from '../services/runtimeMetricsCollector.ts';
import { getTelemetryStorageStatus, loadRecentAdminAuditEvents, persistAdminAuditEvent } from '../services/telemetryStore.ts';
import { livePushHub } from '../services/livePushHub.ts';
import { getMediaPlaneSnapshot } from '../services/mediaPlaneRouter.ts';
import { roomPubSubBridge } from '../services/roomPubSubBridge.ts';
import { getBelixLiveChannels } from '../services/belix/belixXtreamClient.ts';
import { getCuratedRbtvChannels } from '../services/rbtv/rbtvLiveCurator.ts';
import { getCachedFamelackWorldChannels } from '../services/famelackIptvService.ts';
import {
  claimInitialAdminPasscode,
  getAdminAuthStatus,
  requireAdminRequest,
  verifyAdminPasscode,
  verifyFirebaseAdminIdToken,
  type AdminSessionClaims,
} from '../services/adminAuthService.ts';

export interface AdminRouteDeps {
  getRoomStats: () => { roomsCount: number; connectedClientsCount: number };
  getPublicOrigin: (req: Request) => string;
}

function summarizeQoeByPlatform() {
  const samples = getQoeRingBufferSnapshot();
  const platforms: Record<string, { count: number; startups: number[]; totalRebuffers: number; failures: number; failovers: number }> = {};

  for (const s of samples) {
    const key = s.platform || 'web';
    const cur = platforms[key] || { count: 0, startups: [], totalRebuffers: 0, failures: 0, failovers: 0 };
    cur.count += 1;
    cur.startups.push(s.startupMs);
    cur.totalRebuffers += s.rebufferCount;
    if (s.failed) cur.failures += 1;
    if (s.stallFailoverUsed) cur.failovers += 1;
    platforms[key] = cur;
  }

  const out: Record<string, { count: number; p50StartupMs: number; p95StartupMs: number; avgRebuffers: number; failovers: number; failures: number }> = {};
  for (const [k, v] of Object.entries(platforms)) {
    const sorted = [...v.startups].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
    out[k] = {
      count: v.count,
      p50StartupMs: p50,
      p95StartupMs: p95,
      avgRebuffers: Number((v.totalRebuffers / Math.max(1, v.count)).toFixed(2)),
      failovers: v.failovers,
      failures: v.failures,
    };
  }
  return { totalSamples: samples.length, byPlatform: out, recent: samples.slice(-20).reverse() };
}

export async function buildAdminOverviewSnapshot(deps: AdminRouteDeps) {
  runtimeMetrics.sampleSystemTick();
  const runtime = runtimeMetrics.getSnapshot();
  const channelSummary = channelHealthMonitor.getSummary();
  const allTrackStatuses = channelHealthMonitor.getAllTrackStatuses();
  const trackEntries = Object.entries(allTrackStatuses).map(([url, info]) => ({
    url,
    ...info,
  }));
  const degradedOrDown = trackEntries
    .filter((t) => t.status === 'down' || t.status === 'degraded' || t.audioOnly)
    .sort((a, b) => (b.failCount || 0) - (a.failCount || 0))
    .slice(0, 40);

  const iptvMeta = getIptvSyncMeta();
  const catalogRefresh = getCatalogRefreshStatus();
  const footballBoardSnap = getCachedFootballBoardSnapshot();
  const roomStats = deps.getRoomStats();
  const storageStatus = getTelemetryStorageStatus();
  const mediaPlane = getMediaPlaneSnapshot();
  const pubSub = roomPubSubBridge.getStats();
  const sseStats = livePushHub.getStats();
  const qoeSummary = summarizeQoeByPlatform();
  const auditEvents = await loadRecentAdminAuditEvents(45);
  const improvements = getImprovementsSummary();

  return {
    ts: Date.now(),
    service: 'naim-cine-engine',
    version: ENV.appVersionName,
    architecture: {
      controlPlane: {
        uptimeSec: runtime.uptimeSec,
        nodeVersion: runtime.nodeVersion,
        pid: runtime.pid,
        cpuPercent: runtime.cpuPercent,
        cpuCores: runtime.cpuCores,
        memory: runtime.memory,
        eventLoop: runtime.eventLoop,
        http: runtime.http,
      },
      mediaPlane: {
        ...mediaPlane,
        activeDvbSessions: getActiveDvbSessionCount(),
      },
      worker: runtime.worker,
      storage: storageStatus,
      pubSub,
      sse: sseStats,
      servicesMesh: serviceMesh.getAllStatuses(),
    },
    verticals: {
      riffanTvWeb: {
        status: runtime.http.errors5xx > 20 ? 'degraded' : 'healthy',
        httpRequests: runtime.http.totalRequests,
        avgLatencyMs: runtime.http.avgLatencyMs,
        errors5xx: runtime.http.errors5xx,
        rateLimited429: runtime.http.rateLimited429,
        pwaCachingEnabled: true,
        qoe: qoeSummary.byPlatform['web'] || null,
      },
      googleTv: {
        packageName: ENV.androidTvPkg,
        versionName: ENV.appVersionName,
        versionCode: ENV.appVersionCodeTv,
        receiverRoute: '/tv',
        qoe: qoeSummary.byPlatform['android-tv'] || qoeSummary.byPlatform['smart-tv'] || null,
      },
      androidMobile: {
        packageName: ENV.androidMobilePkg,
        versionName: ENV.appVersionName,
        versionCode: ENV.appVersionCodeMobile,
        qoe: qoeSummary.byPlatform['android-mobile'] || null,
      },
      riffanMusic: {
        packageName: ENV.androidMusicPkg,
        versionName: ENV.appVersionName,
        versionCode: ENV.appVersionCodeMusic,
        musicProxyRequests: runtime.media.musicProxyRequests,
      },
      iptvAndChannels: {
        tdtChannelsCount: SPANISH_TDT_CHANNELS.length,
        catalaChannelsCount: CATALA_LIVE_CHANNELS.length,
        belixChannelsCount: getBelixLiveChannels().length,
        rbtvChannelsCount: getCuratedRbtvChannels().length,
        worldChannelsCount: getCachedFamelackWorldChannels().length,
        iptvMeta,
        healthSummary: channelSummary,
        problemTracks: degradedOrDown,
        allTracksCount: trackEntries.length,
      },
      sportsAndFootball: {
        cachedMatchesCount: footballBoardSnap?.matches?.length || 0,
        lastBoardRefreshAt: footballBoardSnap?.ts || 0,
        liveAgendaCount: getCachedSportsMatches().length,
        permanent247Count: getPermanent247SportsMatches().length,
      },
      vodCatalog: {
        ...catalogRefresh,
      },
      watchParty: {
        ...roomStats,
        pubSubNodeId: pubSub.nodeId,
        pubSubMode: pubSub.mode,
      },
      aiEngine: {
        ...runtime.ai,
        geminiKeyConfigured: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
      },
    },
    qoe: qoeSummary,
    clientVitals: runtime.clientVitals,
    latencyHistory: runtime.latencyHistory,
    runtimeEvents: runtime.recentEvents,
    auditEvents,
    improvementsTotal: improvements.total,
    improvementsByPhase: improvements.byPhase,
  };
}

export function registerAdminRoutes(app: Express, deps: AdminRouteDeps): void {
  livePushHub.setAdminSnapshotProvider(() => buildAdminOverviewSnapshot(deps));

  const authRateLimit = createSlidingWindowRateLimiter({
    maxRequests: 20,
    windowMs: 60_000,
    keyPrefix: 'admin-auth',
  });

  app.get('/api/admin/auth/status', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const status = await getAdminAuthStatus();
    res.json({ ok: true, ...status });
  });

  app.post('/api/admin/auth/firebase', authRateLimit, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const idToken = String(req.body?.idToken || '').trim();
    const result = await verifyFirebaseAdminIdToken(idToken);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    await persistAdminAuditEvent({
      actor: result.claims.email,
      action: 'admin_login_google',
      target: '/admin',
      severity: 'info',
      details: { method: result.claims.method },
    });
    res.json({ ok: true, token: result.token, claims: result.claims });
  });

  app.post('/api/admin/auth/passcode', authRateLimit, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const passcode = String(req.body?.passcode || '');
    const result = await verifyAdminPasscode(passcode);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    await persistAdminAuditEvent({
      actor: result.claims.email,
      action: 'admin_login_passcode',
      target: '/admin',
      severity: 'info',
      details: { method: result.claims.method },
    });
    res.json({ ok: true, token: result.token, claims: result.claims });
  });

  app.post('/api/admin/auth/claim', authRateLimit, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const passcode = String(req.body?.passcode || '');
    const label = String(req.body?.label || 'admin');
    const result = await claimInitialAdminPasscode(passcode, label);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    await persistAdminAuditEvent({
      actor: result.claims.email,
      action: 'admin_passcode_claimed',
      target: '/admin',
      severity: 'warn',
      details: { method: result.claims.method },
    });
    res.status(201).json({ ok: true, token: result.token, claims: result.claims });
  });

  app.get('/api/admin/overview', requireAdminRequest, async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const snapshot = await buildAdminOverviewSnapshot(deps);
      res.json({ ok: true, ...snapshot });
    } catch (err) {
      logger.error({ err }, 'admin_overview_error');
      res.status(500).json({ ok: false, error: 'No se pudo generar el resumen de telemetría.' });
    }
  });

  app.get('/api/admin/stream', requireAdminRequest, (req: Request, res: Response) => {
    livePushHub.attachAdminClient(req, res);
  });

  app.post('/api/admin/actions/probe-channels', requireAdminRequest, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const actor = (req as Request & { adminClaims?: AdminSessionClaims }).adminClaims?.email || 'admin';
    const channels = [
      ...SPANISH_TDT_CHANNELS,
      ...CATALA_LIVE_CHANNELS,
      ...getPermanent247SportsMatches(),
      ...getCachedSportsMatches(),
    ];
    await channelHealthMonitor.runSweep(channels, { force: true });
    const summary = channelHealthMonitor.getSummary();
    livePushHub.broadcastPublic('channels:health', { summary, ts: Date.now() });
    await persistAdminAuditEvent({
      actor,
      action: 'probe_channels_sweep',
      target: 'channelHealthMonitor',
      severity: 'info',
      details: summary,
    });
    runtimeMetrics.pushAdminEvent({
      severity: 'info',
      category: 'iptv',
      message: `Barrido completo de canales ejecutado (${summary.counts.up} UP / ${summary.counts.down} DOWN)`,
      actor,
    });
    res.json({ ok: true, summary });
  });

  app.post('/api/admin/actions/refresh-catalog', requireAdminRequest, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const actor = (req as Request & { adminClaims?: AdminSessionClaims }).adminClaims?.email || 'admin';
    await Promise.allSettled([
      refreshLiveIptvRegistry(true),
      prewarmTodayFootballBoard(),
      runRefreshCycle(),
    ]);
    livePushHub.broadcastPublic('football-board:update', { ts: Date.now(), source: 'admin-refresh' });
    await persistAdminAuditEvent({
      actor,
      action: 'refresh_catalog_and_sports',
      target: 'catalog+sports+iptv',
      severity: 'info',
      details: getCatalogRefreshStatus(),
    });
    runtimeMetrics.pushAdminEvent({
      severity: 'info',
      category: 'sports',
      message: 'Refresco forzado de catálogos VOD, IPTV y tablero de fútbol completado',
      actor,
    });
    res.json({ ok: true, catalog: getCatalogRefreshStatus() });
  });

  app.post('/api/admin/actions/cleanup-dvb', requireAdminRequest, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const actor = (req as Request & { adminClaims?: AdminSessionClaims }).adminClaims?.email || 'admin';
    const before = getActiveDvbSessionCount();
    destroyAllLiveDvbSessions();
    await persistAdminAuditEvent({
      actor,
      action: 'cleanup_dvb_sessions',
      target: 'dvbTranscoder',
      severity: 'warn',
      details: { closedCount: before },
    });
    runtimeMetrics.pushAdminEvent({
      severity: 'warn',
      category: 'media',
      message: `Sesiones FFmpeg DVB limpiadas (${before} activas cerradas)`,
      actor,
    });
    res.json({ ok: true, closedCount: before, activeDvbSessions: getActiveDvbSessionCount() });
  });

  app.post('/api/admin/actions/clear-caches', requireAdminRequest, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const actor = (req as Request & { adminClaims?: AdminSessionClaims }).adminClaims?.email || 'admin';
    clearAiModelCooldowns();
    vodHlsManifestCache.clear();
    dvbAacSegmentCache.clear();
    dvbRollingPlaylistMap.clear();
    await persistAdminAuditEvent({
      actor,
      action: 'clear_runtime_caches',
      target: 'ai-cooldowns+vod-manifests+dvb-segments',
      severity: 'warn',
      details: {},
    });
    runtimeMetrics.pushAdminEvent({
      severity: 'warn',
      category: 'system',
      message: 'Cachés volátiles de IA, manifiestos VOD y segmentos DVB purgadas',
      actor,
    });
    res.json({ ok: true });
  });
}
