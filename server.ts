import dns from 'dns';
import fs from 'fs';
import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './server/config/env.ts';
import { resolveOfficialChannelLogoUrl } from './src/shared/channelLogos.ts';
import { logger } from './server/utils/logger.ts';
import {
  applyPublicCacheHeaders,
  createSlidingWindowRateLimiter,
  expressErrorHandler,
  securityHeadersMiddleware,
} from './server/middleware/errorHandler.ts';
import { serviceMeshGatewayMiddleware } from './server/gateway/serviceMesh.ts';
import { resolveSafePublicOrigin } from './server/utils/ssrfGuard.ts';
import { initializeTelemetryStore, closeTelemetryStore, pruneOldTelemetryRecords } from './server/services/telemetryStore.ts';
import { registerOperationalRoutes } from './server/routes/health.ts';
import { registerExpandedCatalogRoutes } from './server/routes/expandedCatalog.ts';
import { registerProxyRoutes } from './server/routes/proxies.ts';
import { registerVoiceAssistantRoutes } from './server/routes/voiceAssistant.ts';
import { registerAiMediaRoutes } from './server/routes/aiStudio/aiMediaRoutes.ts';
import { setupGeminiLiveWebSocket } from './server/routes/geminiLive.ts';
import { registerYouTubeCatalogRoutes } from './server/routes/youtubeCatalog.ts';
import {
  registerSportsRoutes,
  getPermanent247SportsMatches,
  getCachedSportsMatches,
  getLiveVoiceMatches,
  prewarmTodayFootballBoard,
} from './server/routes/sports.ts';
import { registerDeepLinkRoutes } from './server/routes/deepLinkResolver.ts';
import { registerIptvAndTdtRoutes, getLiveVoiceChannels } from './server/routes/iptv.ts';
import { registerWorldTvRoutes } from './server/routes/worldTvRoutes.ts';
import { registerEpgRoutes } from './server/services/epgService.ts';
import { registerCastellanoCatalogRoutes } from './server/routes/castellanoCatalog.ts';
import { registerCatalaCatalogRoutes } from './server/routes/catalaCatalog.ts';
import { registerDetailsAndSubtitlesRoutes } from './server/routes/detailsAndSubtitles.ts';
import {
  registerVodCatalogRoutes,
  handleSeriesCatalogRequest,
  handleTvDetailsRequest,
  sendApkPackageResponse,
  seriesCatalogStaleCache,
} from './server/routes/vodCatalogRoutes.ts';
import { registerStreamExtractRoute } from './server/routes/streamExtractRoutes.ts';
import { registerClipboxRoutes } from './server/routes/clipboxRoutes.ts';
import { registerRbtvRoutes } from './server/routes/rbtvRoutes.ts';
import { registerBelixRoutes } from './server/routes/belixRoutes.ts';
import { registerAtresplayerRoutes } from './server/routes/atresplayerRoutes.ts';
import { registerMovistarDaznRoutes } from './server/routes/movistarDaznRoutes.ts';
import { registerMusicRoutes } from './server/routes/musicRoutes.ts';
import { getMovistarDaznHome } from './server/services/movistarDaznCatalogService.ts';
import { initBelixFromEnv } from './server/services/belix/belixXtreamClient.ts';
import { SPANISH_TDT_CHANNELS } from './server/data/tdtChannels.ts';
import { CATALA_LIVE_CHANNELS } from './server/data/catalaRegistry.ts';
import {
  CURATED_4K_MOVIE_IDS,
  CURATED_4K_MOVIE_SET,
  CURATED_4K_SERIES_IDS,
  CURATED_4K_SERIES_SET,
} from './server/data/vodConstants.ts';
import {
  applySyncedStreamsToChannels,
  refreshLiveIptvRegistry,
} from './server/services/iptvPlaylistService.ts';
import { refreshFamelackAndWorldCatalog } from './server/services/famelackIptvService.ts';
import { createRoomHub } from './server/ws/roomHub.ts';
import { resolveActiveGnulaMirrors } from './server/extractors/gnulaHdExtractor.ts';
import { fetchTmdbUrlJson } from './server/services/tmdbService.ts';
import { channelHealthMonitor } from './server/services/channelHealthMonitor.ts';
import {
  startCatalogRefreshScheduler,
  stopCatalogRefreshScheduler,
} from './server/services/catalogRefreshService.ts';
import {
  getAiMovieRequestJob,
  startAiMovieRequest,
} from './server/services/aiMovieRequestService.ts';
import {
  extractLocalizedTmdbTitleHints,
  resolveTmdbIdByTitle,
} from './server/services/tmdbCatalogHelpers.ts';
import { rankCandidateTracks } from './server/services/trackRankingService.ts';
import { mountSpaFrontend } from './server/routes/spaFrontendMount.ts';
import { createGracefulShutdownHandler } from './server/utils/gracefulShutdown.ts';
import {
  destroyAllLiveDvbSessions,
  getActiveDvbSessionCount,
} from './server/routes/proxies/dvbTranscoder.ts';
import { getImprovementsSummary } from './server/services/improvementsRegistry.ts';
import { runtimeMetrics } from './server/services/runtimeMetricsCollector.ts';
import { livePushHub, registerLivePushRoutes } from './server/services/livePushHub.ts';
import { workerBridge } from './server/services/workerBridge.ts';
import { roomPubSubBridge } from './server/services/roomPubSubBridge.ts';
import { registerAdminRoutes } from './server/routes/adminRoutes.ts';
import { registerTizenRoutes } from './server/routes/tizenRoutes.ts';

// Prefer IPv4 to avoid transient container IPv6 socket resets with upstream CDNs
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { CURATED_4K_MOVIE_IDS, CURATED_4K_MOVIE_SET, CURATED_4K_SERIES_IDS, CURATED_4K_SERIES_SET };

function getPublicOrigin(req: express.Request): string {
  return resolveSafePublicOrigin(
    {
      queryOrigin: String(req.query.origin || ''),
      forwardedProto: String(req.headers['x-forwarded-proto'] || ''),
      forwardedHost: String(req.headers['x-forwarded-host'] || ''),
      hostHeader: String(req.get('host') || ''),
      protocol: req.protocol,
    },
    ENV.publicDomain || 'riffan.ai.studio'
  );
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER INITIALIZATION
// ============================================================================
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const httpServer = createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 6 },
    threshold: 1024,
  },
});

let geminiLiveBridge: ReturnType<typeof setupGeminiLiveWebSocket> | null = null;

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else if (pathname === '/ws/gemini-live' && geminiLiveBridge) {
    geminiLiveBridge.handleUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

app.use(
  compression({
    filter: (req, res) => {
      const p = (req.path || '').toLowerCase();
      if (
        p.endsWith('.m3u') ||
        p.endsWith('.m3u8') ||
        p.endsWith('.ts') ||
        p.startsWith('/api/iptv/') ||
        p.startsWith('/api/ts-proxy') ||
        p.startsWith('/api/hls-proxy') ||
        p.startsWith('/api/dvb-live/') ||
        p.startsWith('/api/belix/stream') ||
        p.startsWith('/api/belix/sub') ||
        p.startsWith('/api/belix/seg') ||
        p.startsWith('/api/music/stream-proxy')
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
app.use(securityHeadersMiddleware);
app.use('/api/ai', express.json({ limit: '10mb' }));
app.use('/api/music/match-tracks', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const t0 = Date.now();
  res.on('finish', () => {
    runtimeMetrics.recordHttpRequest(res.statusCode, Date.now() - t0);
  });
  next();
});
app.use('/api', serviceMeshGatewayMiddleware);

// Serve ES5 UMD Hls.js locally for Samsung Tizen / LG webOS Smart TVs
app.get('/vendor/hls.min.js', (_req, res) => {
  const hlsPath = path.resolve(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  applyPublicCacheHeaders(res, 86400, 86400);
  res.sendFile(hlsPath);
});

const roomHub = createRoomHub(app, wss);

const aiRequestRateLimit = createSlidingWindowRateLimiter({
  maxRequests: 24,
  windowMs: 60_000,
  keyPrefix: 'ai-request',
});

const extractStreamRateLimit = createSlidingWindowRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  keyPrefix: 'extract-stream',
});

const hlsProxyRateLimit = createSlidingWindowRateLimiter({
  maxRequests: 240,
  windowMs: 60_000,
  keyPrefix: 'hls-proxy',
});

const adminRateLimit = createSlidingWindowRateLimiter({
  maxRequests: 90,
  windowMs: 60_000,
  keyPrefix: 'admin-api',
});

const musicMatchRateLimit = createSlidingWindowRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
  keyPrefix: 'music-match',
});

app.use('/api/extract/stream', extractStreamRateLimit);
app.use('/api/hls-proxy', hlsProxyRateLimit);
app.use('/api/admin', adminRateLimit);
app.use('/api/music/match-tracks', musicMatchRateLimit);

registerOperationalRoutes(app, {
  getStats: () => ({
    ...roomHub.getStats(),
    uptimeSec: Math.round(process.uptime()),
    activeDvbSessions: getActiveDvbSessionCount(),
  }),
  getPublicOrigin,
  refreshChannelHealth: async (force = true) => {
    const t0 = Date.now();
    const channels = [
      ...SPANISH_TDT_CHANNELS,
      ...CATALA_LIVE_CHANNELS,
      ...getPermanent247SportsMatches(),
      ...getCachedSportsMatches(),
    ];
    await channelHealthMonitor.runSweep(channels, { force });
    workerBridge.recordSweepCycle(Date.now() - t0);
    livePushHub.broadcastPublic('channels:health', { summary: channelHealthMonitor.getSummary(), ts: Date.now() });
  },
});

registerLivePushRoutes(app);
registerAdminRoutes(app, {
  getRoomStats: () => roomHub.getStats(),
  getPublicOrigin,
});

registerExpandedCatalogRoutes(app);
registerProxyRoutes(app, { getPublicOrigin });
registerSportsRoutes(app);
registerDeepLinkRoutes(app, { getPublicOrigin });
registerIptvAndTdtRoutes(app, { getPublicOrigin });
registerWorldTvRoutes(app);
registerEpgRoutes(app);
registerCastellanoCatalogRoutes(app);
registerCatalaCatalogRoutes(app);
registerYouTubeCatalogRoutes(app);
registerClipboxRoutes(app);
registerRbtvRoutes(app);
registerBelixRoutes(app, { getPublicOrigin });
registerAtresplayerRoutes(app);
registerMovistarDaznRoutes(app);
registerMusicRoutes(app);
registerVoiceAssistantRoutes(app, {
  getChannels: getLiveVoiceChannels,
  resolveLogoUrl: resolveOfficialChannelLogoUrl,
  getSportsMatches: getLiveVoiceMatches,
});
registerAiMediaRoutes(app);
geminiLiveBridge = setupGeminiLiveWebSocket(httpServer, {
  getChannels: getLiveVoiceChannels,
  getSportsMatches: getLiveVoiceMatches,
});

// ============================================================================
// SIGNED ANDROID APK DOWNLOAD ROUTES
// ============================================================================
app.get(
  ['/RIFFAN-TV-TV.apk', '/riffantv-tv.apk', '/NAIM-CINE-TV.apk', '/tv.apk', '/googletv.apk', '/api/download/apk-tv'],
  (req, res) =>
    sendApkPackageResponse(req, res, {
      rootDir: __dirname,
      variant: 'tv',
      filename: 'RIFFAN-TV-TV.apk',
      candidateFilenames: ['RIFFAN-TV-TV.apk', 'NAIM-CINE-TV.apk'],
      errorMessage: 'Unable to build Google TV APK package',
      logKey: 'tv_apk_build_failed',
      getPublicOrigin,
    })
);

app.get(
  ['/RIFFAN-TV.apk', '/riffantv.apk', '/NAIM-CINE.apk', '/naimcine.apk', '/movil.apk', '/api/download/apk'],
  (req, res) =>
    sendApkPackageResponse(req, res, {
      rootDir: __dirname,
      variant: 'mobile',
      filename: 'RIFFAN-TV.apk',
      candidateFilenames: ['RIFFAN-TV.apk', 'NAIM-CINE.apk'],
      errorMessage: 'Unable to build Mobile APK package',
      logKey: 'mobile_apk_build_failed',
      getPublicOrigin,
    })
);

app.get(
  ['/RIFFAN-MUSIC.apk', '/riffan-music.apk', '/riffanmusic.apk', '/music.apk', '/api/download/apk-music'],
  (req, res) =>
    sendApkPackageResponse(req, res, {
      rootDir: __dirname,
      variant: 'music',
      filename: 'RIFFAN-MUSIC.apk',
      candidateFilenames: ['RIFFAN-MUSIC.apk'],
      errorMessage: 'Unable to build Riffan Music APK package',
      logKey: 'music_apk_build_failed',
      getPublicOrigin,
    })
);

app.get('/music-manifest.webmanifest', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  const publicPath = path.resolve(__dirname, 'public', 'music-manifest.webmanifest');
  const distPath = path.resolve(__dirname, 'dist', 'music-manifest.webmanifest');
  const target = fs.existsSync(publicPath) ? publicPath : distPath;
  if (fs.existsSync(target)) {
    return res.sendFile(target);
  }
  return res.status(404).json({ error: 'Music manifest not found' });
});

function sendSmartTvReceiverHtml(res: express.Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const publicPath = path.resolve(__dirname, 'public', 'tv-receiver.html');
  const distPath = path.resolve(__dirname, 'dist', 'tv-receiver.html');
  const target = fs.existsSync(publicPath) ? publicPath : distPath;
  res.sendFile(target);
}

app.get(['/tv', '/tv/'], (_req, res) => {
  sendSmartTvReceiverHtml(res);
});

app.get('/', (req, res, next) => {
  if (req.query.web === '1' || req.query.tizen === '1' || req.query.room) {
    return next();
  }
  const ua = String(req.headers['user-agent'] || '');
  if (/SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|Viera|VIDAA|HbbTV|AFTB|AFTT|AFTM|GoogleTV/i.test(ua)) {
    return res.redirect(302, '/tv');
  }
  return next();
});

// ============================================================================
// REST API: VOD CATALOGS, SERIES & AI MOVIE REQUESTS
// ============================================================================
registerVodCatalogRoutes(app);

app.post('/api/ai/request-movie', aiRequestRateLimit, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const query = String(req.body?.query || '').trim();
  const mediaType =
    req.body?.mediaType === 'movie' || req.body?.mediaType === 'tv'
      ? req.body.mediaType
      : 'all';
  const lang = String(req.body?.lang || 'es').slice(0, 5);
  if (query.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Escribe al menos 2 caracteres para buscar la película.',
    });
    return;
  }
  const job = startAiMovieRequest({ query, mediaType, lang });
  res.status(202).json({ success: true, job });
});

app.get('/api/ai/request-movie/:jobId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const job = getAiMovieRequestJob(String(req.params.jobId || ''));
  if (!job) {
    res.status(404).json({ success: false, error: 'Solicitud no encontrada o expirada.' });
    return;
  }
  res.json({ success: true, job });
});

app.get('/api/catalog/series', (req, res) =>
  handleSeriesCatalogRequest(req, res, {
    fetchTmdbUrlJsonFn: fetchTmdbUrlJson,
    staleCache: seriesCatalogStaleCache,
  })
);

app.get('/api/catalog/tv/:tmdbId', handleTvDetailsRequest);

registerStreamExtractRoute(app, {
  getPublicOrigin,
  rankCandidateTracks,
});

registerDetailsAndSubtitlesRoutes(app, {
  resolveTmdbIdByTitle,
  extractLocalizedTmdbTitleHints,
});

registerTizenRoutes(app, __dirname);
// ============================================================================
// DOWNLOADABLE 100-POINT & 100-IMPROVEMENTS AUDIT REPORTS
// ============================================================================
app.get('/api/audit/100-points', (_req, res) => {
  const auditPath = path.resolve(__dirname, 'auditoria-riffantv-100-puntos.md');
  if (!fs.existsSync(auditPath)) {
    return res.status(404).json({ error: 'Audit report not found' });
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="auditoria-riffantv-100-puntos.md"');
  res.setHeader('Cache-Control', 'no-cache');
  return res.sendFile(auditPath);
});

app.get('/api/audit/100-improvements', (_req, res) => {
  const auditPath = path.resolve(__dirname, 'auditoria-100-mejoras-f1-f11.md');
  if (!fs.existsSync(auditPath)) {
    return res.status(404).json({ error: '100 improvements report not found' });
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="auditoria-100-mejoras-f1-f11.md"');
  res.setHeader('Cache-Control', 'no-cache');
  return res.sendFile(auditPath);
});

app.get('/api/audit/improvements-summary', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  return res.json({ ok: true, ...getImprovementsSummary() });
});

// ============================================================================
// PWA SERVICE WORKER: SERVE PRODUCTION DIST SW.JS OR CLEAN NOOP IN DEV
// ============================================================================
app.get(['/sw.js', '/service-worker.js'], (_req, res) => {
  const distSw = path.resolve(__dirname, 'dist', 'sw.js');
  if (ENV.isProd && fs.existsSync(distSw)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.sendFile(distSw);
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.send(`self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });`);
});

// ============================================================================
// VITE + PRODUCTION STATIC MOUNTING (INSTANT PORT 3000 BINDING)
// ============================================================================
async function startServer() {
  const PORT = ENV.port;
  const isProd = ENV.isProd;

  app.use(expressErrorHandler);

  mountSpaFrontend(app, {
    rootDir: __dirname,
    isProd,
    httpServer,
    getPublicOrigin,
    sendSmartTvReceiverHtml,
  });

  httpServer.on('error', (err) => {
    logger.error({ err, port: PORT }, 'http_server_listen_error');
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, env: ENV.nodeEnv }, 'naim_cine_engine_started');
    if (ENV.nodeEnv !== 'test') {
      setImmediate(() => {
        try {
          void initializeTelemetryStore().then(() => pruneOldTelemetryRecords(14)).catch(() => {});
          livePushHub.start();
          workerBridge.start();
          roomPubSubBridge.startSyncLoop();
          // Stagger cold-start prewarm jobs to prevent simultaneous network/DNS congestion
          void resolveActiveGnulaMirrors().catch((err) => logger.warn({ err }, 'prewarm_gnula_failed'));
          setTimeout(() => {
            void refreshLiveIptvRegistry(false).catch((err) => logger.warn({ err }, 'prewarm_iptv_failed'));
          }, 250).unref?.();
          setTimeout(() => {
            void refreshFamelackAndWorldCatalog(false).catch((err) => logger.warn({ err }, 'prewarm_world_failed'));
          }, 600).unref?.();
          setTimeout(() => {
            void prewarmTodayFootballBoard().catch((err) => logger.warn({ err }, 'prewarm_football_failed'));
          }, 950).unref?.();
          setTimeout(() => {
            void getMovistarDaznHome().catch((err) => logger.warn({ err }, 'prewarm_dazn_failed'));
            void initBelixFromEnv().catch((err) => logger.warn({ err }, 'prewarm_belix_failed'));
          }, 1350).unref?.();
          channelHealthMonitor.startScheduler(
            () => [
              ...applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS),
              ...CATALA_LIVE_CHANNELS,
              ...getPermanent247SportsMatches(),
              ...getCachedSportsMatches(),
            ],
            3 * 60 * 1000,
            4_500
          );
          startCatalogRefreshScheduler(15 * 60 * 1000);
        } catch (err) {
          logger.error({ err }, 'background_scheduler_init_error');
        }
      });
    }
  });
}

startServer().catch((err) => {
  logger.error({ err }, 'fatal_start_server_error');
});

const shutdownHandler = createGracefulShutdownHandler({
  httpServer,
  wss,
  stopTimers: [
    () => channelHealthMonitor.stopScheduler(),
    () => stopCatalogRefreshScheduler(),
    () => livePushHub.stop(),
    () => workerBridge.stop(),
    () => roomPubSubBridge.stopSyncLoop(),
  ],
  cleanupSessions: [
    () => {
      destroyAllLiveDvbSessions();
    },
    () => closeTelemetryStore(),
  ],
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught_exception');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled_rejection');
});
process.on('SIGTERM', () => {
  void shutdownHandler('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdownHandler('SIGINT');
});
