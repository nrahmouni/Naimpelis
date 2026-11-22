import dns from 'dns';
import express from 'express';
import { createServer } from 'http';
import { ENV } from './config/env.ts';
import { logger } from './utils/logger.ts';
import { securityHeadersMiddleware } from './middleware/errorHandler.ts';
import { registerProxyRoutes } from './routes/proxies.ts';
import { getMediaPlaneSnapshot } from './services/mediaPlaneRouter.ts';
import { createGracefulShutdownHandler } from './utils/gracefulShutdown.ts';
import { destroyAllLiveDvbSessions } from './routes/proxies/dvbTranscoder.ts';

dns.setDefaultResultOrder('ipv4first');

/**
 * Standalone Media Plane Entrypoint (Phase 2 Deployment Separation).
 * Runs ONLY HLS/TS/DVB/Embed media proxying so Control Plane API & WebSockets
 * remain 100% isolated from FFmpeg CPU and upstream streaming socket saturation.
 */
const MEDIA_PORT = Number(process.env.MEDIA_PORT || 3001);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeadersMiddleware);

function getPublicOrigin(req: express.Request): string {
  const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || `localhost:${MEDIA_PORT}`)
    .split(',')[0]
    .trim();
  return `${rawProto}://${rawHost}`;
}

app.get(['/health', '/ready'], (_req, res) => {
  res.json({
    ok: true,
    role: 'riffan-media-plane',
    env: ENV.nodeEnv,
    mediaPlane: getMediaPlaneSnapshot(),
    ts: Date.now(),
  });
});

registerProxyRoutes(app, { getPublicOrigin });

const httpServer = createServer(app);
httpServer.listen(MEDIA_PORT, '0.0.0.0', () => {
  logger.info({ port: MEDIA_PORT }, 'riffan_media_plane_started');
});

const shutdown = createGracefulShutdownHandler({
  httpServer,
  cleanupSessions: [
    () => {
      destroyAllLiveDvbSessions();
    },
  ],
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
