import dns from 'dns';
import express from 'express';
import compression from 'compression';
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
app.use(
  compression({
    filter: (req, res) => {
      const p = (req.path || '').toLowerCase();
      if (
        p.endsWith('.ts') ||
        p.endsWith('.m4s') ||
        p.startsWith('/api/ts-proxy') ||
        p.startsWith('/api/dvb-live/')
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
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

app.get('/metrics', (_req, res) => {
  const snap = getMediaPlaneSnapshot();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(
    [
      '# HELP riffan_media_dvb_sessions Active FFmpeg DVB sessions',
      '# TYPE riffan_media_dvb_sessions gauge',
      `riffan_media_dvb_sessions ${snap.activeDvbFfmpegSessions}`,
      '# HELP riffan_media_direct_play_pct Direct play percentage',
      '# TYPE riffan_media_direct_play_pct gauge',
      `riffan_media_direct_play_pct ${snap.directPlayEligiblePct}`,
    ].join('\n') + '\n'
  );
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
