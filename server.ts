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
  expressErrorHandler,
  securityHeadersMiddleware,
} from './server/middleware/errorHandler.ts';
import { serviceMeshGatewayMiddleware } from './server/gateway/serviceMesh.ts';
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
import {
  injectDynamicOgMeta,
  injectMusicPwaMeta,
  isMusicAppPath,
  registerDeepLinkRoutes,
  resolveOpenGraphMetaForRequest,
  shouldInjectDeepLinkOg,
} from './server/routes/deepLinkResolver.ts';
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
import {
  registerStreamExtractRoute,
  type RankCandidateTracksInput,
} from './server/routes/streamExtractRoutes.ts';
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
import { type TrackRecord } from './server/extractors/httpHelpers.ts';
import { resolveActiveGnulaMirrors } from './server/extractors/gnulaHdExtractor.ts';
import { fetchTmdbUrlJson } from './server/services/tmdbService.ts';
import { channelHealthMonitor } from './server/services/channelHealthMonitor.ts';
import { startCatalogRefreshScheduler } from './server/services/catalogRefreshService.ts';
import {
  getAiMovieRequestJob,
  startAiMovieRequest,
} from './server/services/aiMovieRequestService.ts';
import {
  extractLocalizedTmdbTitleHints,
  resolveTmdbIdByTitle,
} from './server/services/tmdbCatalogHelpers.ts';

// Prefer IPv4 to avoid transient container IPv6 socket resets with upstream CDNs
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { CURATED_4K_MOVIE_IDS, CURATED_4K_MOVIE_SET, CURATED_4K_SERIES_IDS, CURATED_4K_SERIES_SET };

function getPublicOrigin(req: express.Request): string {
  const overrideOrigin = String(req.query.origin || '').trim();
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(overrideOrigin)) {
    return overrideOrigin.replace(/\/+$/, '');
  }
  const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();
  const hostWithoutPort = rawHost.split(':')[0].toLowerCase();
  if (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1' || hostWithoutPort.startsWith('192.168.')) {
    return `${rawProto}://${rawHost}`;
  }
  const domain = rawHost.includes('run.app') || rawHost.includes('ai.studio') || rawHost.includes('riffantv.ai.studio')
    ? rawHost
    : (ENV.publicDomain || 'riffantv.ai.studio');
  const proto = domain.includes('localhost') ? 'http' : 'https';
  return `${proto}://${domain}`;
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER INITIALIZATION
// ============================================================================
const app = express();
app.disable('x-powered-by');
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
app.use(express.json({ limit: '10mb' }));
app.use('/api', serviceMeshGatewayMiddleware);

// Serve ES5 UMD Hls.js locally for Samsung Tizen / LG webOS Smart TVs
app.get('/vendor/hls.min.js', (_req, res) => {
  const hlsPath = path.resolve(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  applyPublicCacheHeaders(res, 86400, 86400);
  res.sendFile(hlsPath);
});

const roomHub = createRoomHub(app, wss);

registerOperationalRoutes(app, {
  getStats: () => ({
    ...roomHub.getStats(),
    uptimeSec: Math.round(process.uptime()),
  }),
  getPublicOrigin,
  refreshChannelHealth: async (force = true) => {
    const channels = [
      ...SPANISH_TDT_CHANNELS,
      ...CATALA_LIVE_CHANNELS,
      ...getPermanent247SportsMatches(),
      ...getCachedSportsMatches(),
    ];
    await channelHealthMonitor.runSweep(channels, { force });
  },
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
  if (req.query.web === '1' || req.query.room) {
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

app.post('/api/ai/request-movie', (req, res) => {
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

// ============================================================================
// STREAM EXTRACTION RANKING (alternative_titles localization + strict priority)
// Resolve streams strictly tier-by-tier in language preference order (ES -> LAT -> VOSE -> EN)
// ============================================================================
function rankCandidateTracks({
  allDiscovered,
  preferLang,
  isVestLink,
  hasExplicitMovidyUrl,
  hasExplicitGnulaUrl,
  healthMap,
}: RankCandidateTracksInput) {
  const getLangScore = (trackLang: string): number => {
    const tl = String(trackLang || '').toUpperCase();
    if (preferLang === 'EN') {
      if (tl === 'EN') return 1;
      if (tl === 'VOSE') return 2;
      if (tl === 'ES') return 3;
      if (tl === 'LAT') return 4;
      return 5;
    }
    if (preferLang === 'LAT') {
      if (tl === 'LAT') return 1;
      if (tl === 'ES') return 2;
      if (tl === 'VOSE') return 3;
      if (tl === 'EN') return 4;
      return 5;
    }
    if (preferLang === 'VOSE') {
      if (tl === 'VOSE') return 1;
      if (tl === 'EN') return 2;
      if (tl === 'ES') return 3;
      if (tl === 'LAT') return 4;
      return 5;
    }
    if (tl === 'ES') return 1;
    if (tl === 'LAT') return 2;
    if (tl === 'VOSE') return 3;
    if (tl === 'EN') return 4;
    return 5;
  };

  const qualityRank = (q?: string): number => {
    const s = String(q || '').toLowerCase();
    if (s.includes('4k') || s.includes('2160')) return 0;
    if (s.includes('1080')) return 1;
    if (s.includes('720') || s === 'hd') return 2;
    if (s.includes('480')) return 3;
    if (s.includes('380') || s.includes('360') || s.includes('288')) return 4;
    return 2;
  };

  const resolverPriority = (tr: TrackRecord): number => {
    const rt = tr.resolverType;
    if (isVestLink && rt === 'vest_hls') return 0;
    if (
      rt === 'direct_mp4' &&
      (tr.id.startsWith('cm-lqsa-') || tr.id.startsWith('ia-') || tr.id.startsWith('archive-'))
    ) {
      return 1;
    }
    if (rt === 'direct_hls' && qualityRank(tr.quality) >= 3) {
      return 2;
    }
    if (
      rt === 'vest_hls' ||
      rt === 'direct_hls' ||
      rt === 'vidhide_hls' ||
      rt === 'movidy_embed' ||
      rt === 'bingetrix_en'
    ) {
      return 1;
    }
    if (rt === 'direct_mp4') return 2;
    if (rt === 'embed_sniff') return 3;
    if (rt === 'web_embed') return 4;
    return 5;
  };

  const sourcePriority = (tr: TrackRecord): number => {
    if (isVestLink && tr.resolverType === 'vest_hls') return 0;
    if (!hasExplicitMovidyUrl && hasExplicitGnulaUrl && tr.id.startsWith('gnula-')) return 0;
    if (tr.id.startsWith('cm-lqsa-') && tr.resolverType === 'direct_mp4') return 0;
    if (tr.id.startsWith('movidy-') || tr.resolverType === 'movidy_embed') return 1;
    if (tr.id.startsWith('gnula-')) return 2;
    if (tr.id.startsWith('ia-')) return 2;
    if (tr.id.startsWith('dm-') || tr.id.startsWith('seriesmetro-')) return 2;
    if (tr.id.startsWith('archive-')) return 3;
    if (tr.id.startsWith('cm-lqsa-')) return 3;
    if (
      tr.id.startsWith('clipbox-') ||
      tr.id.startsWith('vidbolt-') ||
      tr.id.startsWith('bingetrix-') ||
      tr.id.startsWith('vidrock-') ||
      tr.id.startsWith('2embed-') ||
      tr.id.startsWith('vidbuzz-') ||
      tr.resolverType === 'bingetrix_en'
    ) {
      return 3;
    }
    return 4;
  };

  const healthStatusRank = (status?: string): number => {
    if (status === 'up') return 0;
    if (status === 'unknown' || !status) return 1;
    if (status === 'degraded') return 2;
    return 3;
  };
  const getEffectiveDownPenalty = (tr: TrackRecord): number => {
    const key = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
    const info = (key && healthMap[key]) || healthMap[String(tr.sourceUrl || '').trim()];
    if (!info) return 0;
    if (info.status === 'down') return 2;
    if ((info.qoeFailures || 0) >= 2) return 1;
    return 0;
  };
  const getTrackHealthScore = (tr: TrackRecord): number => {
    const key = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
    const info = (key && healthMap[key]) || healthMap[String(tr.sourceUrl || '').trim()];
    if (!info) return 100;
    const statusBase = healthStatusRank(info.status) * 1000;
    const qoePenalty = (info.qoeFailures || 0) * 80 + (info.qoeRebuffers || 0) * 15 + (info.failCount || 0) * 50;
    const latencyScore = Math.min(400, Math.round((info.latencyMs || 150) / 10));
    return statusBase + qoePenalty + latencyScore;
  };

  const orderedTracks: TrackRecord[] = [...allDiscovered].sort((a, b) => {
    const lDiff = getLangScore(a.lang) - getLangScore(b.lang);
    if (lDiff !== 0) return lDiff;
    const aIsWeb = a.resolverType === 'web_embed' || a.resolverType === 'embed_sniff';
    const bIsWeb = b.resolverType === 'web_embed' || b.resolverType === 'embed_sniff';
    if (aIsWeb !== bIsWeb) {
      return aIsWeb ? 1 : -1;
    }
    const dDiff = getEffectiveDownPenalty(a) - getEffectiveDownPenalty(b);
    if (dDiff !== 0) return dDiff;
    const rDiff = resolverPriority(a) - resolverPriority(b);
    if (rDiff !== 0) return rDiff;
    const sDiff = sourcePriority(a) - sourcePriority(b);
    if (sDiff !== 0) return sDiff;
    const qDiff = qualityRank(a.quality) - qualityRank(b.quality);
    if (qDiff !== 0) return qDiff;
    return getTrackHealthScore(a) - getTrackHealthScore(b);
  });

  return { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore };
}

registerStreamExtractRoute(app, {
  getPublicOrigin,
  rankCandidateTracks,
});

registerDetailsAndSubtitlesRoutes(app, {
  resolveTmdbIdByTitle,
  extractLocalizedTmdbTitleHints,
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

  if (!isProd) {
    let viteMiddleware: express.RequestHandler | null = null;
    let viteInstance: { transformIndexHtml: (url: string, html: string) => Promise<string> } | null = null;
    let viteInitError: unknown = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const hmrEnabled = process.env.DISABLE_HMR !== 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          ws: { server: httpServer },
          hmr: hmrEnabled,
          watch: hmrEnabled ? {} : null,
        },
        appType: 'spa',
      });
      viteInstance = vite;
      viteMiddleware = vite.middlewares;
    })().catch((err) => {
      viteInitError = err;
      logger.error({ err }, 'vite_dev_server_init_failed');
    });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && !viteInitError) {
        await viteReady;
      }
      if (viteInitError || !viteMiddleware) {
        res.status(503).json({
          ok: false,
          error: 'Dev frontend compiler unavailable',
        });
        return;
      }
      const isMusicReq = isMusicAppPath(req.path);
      if (req.method === 'GET' && viteInstance && (isMusicReq || shouldInjectDeepLinkOg(req.path))) {
        try {
          const indexHtmlPath = path.resolve(__dirname, 'index.html');
          const [rawHtml, ogMeta] = await Promise.all([
            fs.promises.readFile(indexHtmlPath, 'utf8'),
            shouldInjectDeepLinkOg(req.path)
              ? resolveOpenGraphMetaForRequest(req.originalUrl, getPublicOrigin(req))
              : Promise.resolve(null),
          ]);
          const transformed = await viteInstance.transformIndexHtml(req.originalUrl, rawHtml);
          let finalHtml = ogMeta ? injectDynamicOgMeta(transformed, ogMeta) : transformed;
          if (isMusicReq) {
            finalHtml = injectMusicPwaMeta(finalHtml, getPublicOrigin(req));
          }
          res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(finalHtml);
          return;
        } catch {
          // Fall back gracefully to standard Vite SPA middleware
        }
      }
      return viteMiddleware(req, res, next);
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distDir, 'index.html');
    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          maxAge: '7d',
          setHeaders: (res, filePath) => {
            if (
              filePath.endsWith('.html') ||
              filePath.endsWith('sw.js') ||
              filePath.includes(`${path.sep}tv${path.sep}`)
            ) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            }
          },
        })
      );
    } else {
      logger.warn({ distDir }, 'production_dist_directory_missing');
    }

    app.get('*', async (req, res) => {
      if (req.path === '/tv' || req.path === '/tv/') {
        return sendSmartTvReceiverHtml(res);
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      if (fs.existsSync(distIndex)) {
        const isMusicReq = isMusicAppPath(req.path);
        if (isMusicReq || shouldInjectDeepLinkOg(req.path)) {
          try {
            const [rawHtml, ogMeta] = await Promise.all([
              fs.promises.readFile(distIndex, 'utf8'),
              shouldInjectDeepLinkOg(req.path)
                ? resolveOpenGraphMetaForRequest(req.originalUrl, getPublicOrigin(req))
                : Promise.resolve(null),
            ]);
            let finalHtml = ogMeta ? injectDynamicOgMeta(rawHtml, ogMeta) : rawHtml;
            if (isMusicReq) {
              finalHtml = injectMusicPwaMeta(finalHtml, getPublicOrigin(req));
            }
            if (isMusicReq || ogMeta) {
              return res.type('html').send(finalHtml);
            }
          } catch {
            // Fall through cleanly to static dist/index.html
          }
        }
        return res.sendFile(distIndex);
      }
      return res
        .status(503)
        .type('text/plain')
        .send('RiffanTV engine is running; frontend build (dist/index.html) not found.');
    });
  }

  httpServer.on('error', (err) => {
    logger.error({ err, port: PORT }, 'http_server_listen_error');
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, env: ENV.nodeEnv }, 'naim_cine_engine_started');
    if (ENV.nodeEnv !== 'test') {
      setImmediate(() => {
        try {
          void resolveActiveGnulaMirrors().catch(() => undefined);
          void refreshLiveIptvRegistry(false).catch(() => undefined);
          void refreshFamelackAndWorldCatalog(false).catch(() => undefined);
          void prewarmTodayFootballBoard().catch(() => undefined);
          void getMovistarDaznHome().catch(() => undefined);
          void initBelixFromEnv().catch(() => undefined);
          channelHealthMonitor.startScheduler(
            () => [
              ...applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS),
              ...CATALA_LIVE_CHANNELS,
              ...getPermanent247SportsMatches(),
              ...getCachedSportsMatches(),
            ],
            3 * 60 * 1000,
            20_000
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

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught_exception');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled_rejection');
});
process.on('SIGTERM', () => {
  logger.info('sigterm_graceful_shutdown');
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  logger.info('sigint_graceful_shutdown');
  httpServer.close(() => process.exit(0));
});
