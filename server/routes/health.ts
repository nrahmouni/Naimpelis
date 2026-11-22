import fs from 'fs';
import path from 'path';
import type express from 'express';
import { ENV, ROOT_DIR } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import { serviceMesh } from '../gateway/serviceMesh.ts';
import {
  buildSignedApkBuffer,
  getApkSigningCertSha256,
} from '../services/apkBuilderService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';

export interface QoeSample {
  id: string;
  ts: number;
  platform: 'web' | 'android-mobile' | 'android-tv' | 'smart-tv';
  startupMs: number;
  rebufferCount: number;
  rebufferMs: number;
  resolution?: string;
  stallFailoverUsed?: boolean;
  sourceUrl?: string;
  requestId?: string;
  failed?: boolean;
}

const qoeRingBuffer: QoeSample[] = [];
const MAX_QOE_SAMPLES = 250;
const appReleaseCache = new LruTtlCache<string, Record<string, unknown>>(10, 60_000);
const refreshCooldownByIp = new LruTtlCache<string, number>(500, 45_000);
const qoeRateByIp = new LruTtlCache<string, { count: number; resetAt: number }>(1000, 60_000);

function getClientIp(req: express.Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || 'unknown';
}

function hasValidInternalMetricsToken(req: express.Request): boolean {
  const expected = process.env.INTERNAL_METRICS_TOKEN || '';
  if (!expected) return true;
  const provided = String(
    req.headers['x-internal-token'] || req.query.token || ''
  ).trim();
  return provided === expected;
}

export interface HealthRouteDeps {
  getStats: () => {
    roomsCount: number;
    connectedClientsCount: number;
    uptimeSec: number;
    activeDvbSessions?: number;
  };
  getPublicOrigin: (req: express.Request) => string;
  refreshChannelHealth?: (force?: boolean) => Promise<void>;
}

export function getQoeRingBufferSnapshot(): QoeSample[] {
  return [...qoeRingBuffer];
}

export function registerOperationalRoutes(
  app: express.Express,
  deps: HealthRouteDeps
): void {
  // Health & Readiness endpoints (including Cloud Run / GCP health probe aliases)
  app.get(['/health', '/healthz', '/_ah/health', '/api/health'], (_req, res) => {
    const stats = deps.getStats();
    res.json({
      ok: true,
      service: 'naim-cine-engine',
      version: ENV.appVersionName,
      uptimeSec: stats.uptimeSec,
      rooms: stats.roomsCount,
      clients: stats.connectedClientsCount,
      microservices: serviceMesh.getAllStatuses().map((s) => ({
        id: s.id,
        status: s.status,
        avgLatencyMs: s.avgLatencyMs,
        requestsTotal: s.requestsTotal,
      })),
      channelHealth: channelHealthMonitor.getSummary(),
      ts: Date.now(),
    });
  });

  app.get('/api/channels/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      summary: channelHealthMonitor.getSummary(),
      tracks: channelHealthMonitor.getAllTrackStatuses(),
      ts: Date.now(),
    });
  });

  app.post('/api/channels/health/refresh', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.INTERNAL_METRICS_TOKEN && !hasValidInternalMetricsToken(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized metrics refresh' });
    }
    const clientIp = getClientIp(req);
    const lastTrigger = refreshCooldownByIp.get(clientIp);
    const now = Date.now();
    if (lastTrigger && now - lastTrigger < 45_000) {
      const retryAfterSec = Math.ceil((45_000 - (now - lastTrigger)) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        ok: false,
        error: 'Channel health probe cooldown active',
        retryAfterSec,
      });
    }
    refreshCooldownByIp.set(clientIp, now);
    if (deps.refreshChannelHealth) {
      await deps.refreshChannelHealth(true);
    }
    return res.json({
      ok: true,
      summary: channelHealthMonitor.getSummary(),
      ts: Date.now(),
    });
  });

  app.get('/api/services/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      services: serviceMesh.getAllStatuses(),
      ts: Date.now(),
    });
  });

  app.get(['/ready', '/api/ready'], (_req, res) => {
    res.json({
      ready: true,
      ts: Date.now(),
    });
  });

  // Dynamic Digital Asset Links covering mobile, tv, and legacy Android packages
  // Includes both configured env SHA-256 and active server APK signing certificate SHA-256
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const packages = Array.from(
      new Set([
        ENV.androidMobilePkg,
        ENV.androidTvPkg,
        ENV.androidMusicPkg,
        ENV.legacyAndroidPkg,
      ])
    );
    const fingerprints = Array.from(
      new Set([getApkSigningCertSha256(), ENV.androidCertSha256].filter(Boolean))
    );
    const statements = packages.map((packageName) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(statements);
  });

  // In-App & Android Native OTA Manifest Endpoint (/api/app/latest)
  app.get('/api/app/latest', async (req, res) => {
    const platformParam = String(req.query.platform || 'all').toLowerCase();
    const origin = deps.getPublicOrigin(req);
    const cacheKey = `${origin}:${platformParam}`;
    const cached = appReleaseCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const mobileApkPath = path.join(ROOT_DIR, 'public', 'RIFFAN-TV.apk');
    const tvApkPath = path.join(ROOT_DIR, 'public', 'RIFFAN-TV-TV.apk');
    const musicApkPath = path.join(ROOT_DIR, 'public', 'RIFFAN-MUSIC.apk');
    const getStatBytes = async (p: string) =>
      fs.promises
        .stat(p)
        .then((s) => s.size)
        .catch(() => 0);

    let [mobileBytes, tvBytes, musicBytes] = await Promise.all([
      getStatBytes(mobileApkPath),
      getStatBytes(tvApkPath),
      getStatBytes(musicApkPath),
    ]);
    if (!mobileBytes) {
      try {
        mobileBytes = buildSignedApkBuffer('mobile', origin).length;
      } catch {
        mobileBytes = 0;
      }
    }
    if (!tvBytes) {
      try {
        tvBytes = buildSignedApkBuffer('tv', origin).length;
      } catch {
        tvBytes = 0;
      }
    }
    if (!musicBytes) {
      try {
        musicBytes = buildSignedApkBuffer('music', origin).length;
      } catch {
        musicBytes = 0;
      }
    }

    const payload = {
      success: true,
      versionName: ENV.appVersionName,
      releasedAt: new Date().toISOString().slice(0, 10) + 'T12:00:00Z',
      web: {
        version: ENV.appVersionName,
        minReloadPrompt: false,
      },
      mobile: {
        packageName: ENV.androidMobilePkg,
        versionCode: ENV.appVersionCodeMobile,
        versionName: ENV.appVersionName,
        minSupportedVersionCode: 100,
        forceUpdate: false,
        apkUrl: `${origin}/RIFFAN-TV.apk?v=${ENV.appVersionCodeMobile}`,
        sizeBytes: mobileBytes,
        changelog: {
          es: 'Estética Obsidian & Violeta, auto-actualización automática, anime completo en HD y modo Sorpréndeme instantáneo.',
          ca: 'Estètica Obsidian & Violeta, auto-actualització automàtica, anime complet en HD i mode Sorprèn-me instantani.',
          en: 'Obsidian & Violet design, automatic OTA version sync, full HD anime catalog, and instant Surprise Me picker.',
        },
      },
      tv: {
        packageName: ENV.androidTvPkg,
        versionCode: ENV.appVersionCodeTv,
        versionName: ENV.appVersionName,
        minSupportedVersionCode: 100,
        forceUpdate: false,
        apkUrl: `${origin}/RIFFAN-TV-TV.apk?v=${ENV.appVersionCodeTv}`,
        sizeBytes: tvBytes,
        changelog: {
          es: 'Nueva interfaz personalizada Google TV 10-foot con mando físico D-Pad + vinculación rápida por código de 4 dígitos.',
          ca: 'Nova interfície personalitzada Google TV 10-foot amb comandament físic D-Pad + vinculació per codi de 4 dígits.',
          en: 'Custom 10-foot Google TV UI with full physical D-Pad navigation plus 4-digit mobile pairing.',
        },
      },
      music: {
        packageName: ENV.androidMusicPkg,
        versionCode: ENV.appVersionCodeMusic,
        versionName: ENV.appVersionName,
        minSupportedVersionCode: 100,
        forceUpdate: false,
        apkUrl: `${origin}/RIFFAN-MUSIC.apk?v=${ENV.appVersionCodeMusic}`,
        sizeBytes: musicBytes,
        changelog: {
          es: 'App independiente Riffan Music con Audio 8D HRTF, ecualizador de 10 bandas con 18 perfiles, letras sincronizadas y +70 radios.',
          ca: 'App independent Riffan Music amb Àudio 8D HRTF, equalitzador de 10 bandes amb 18 perfils, lletres sincronitzades i +70 ràdios.',
          en: 'Standalone Riffan Music app with 8D HRTF spatial audio, 10-band 18-profile equalizer, synced lyrics, and 70+ live radios.',
        },
      },
    };

    appReleaseCache.set(cacheKey, payload);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.json(payload);
  });

  // Playback Quality-of-Experience (QoE) Telemetry Ingestion (F8.7)
  app.post('/api/metrics/qoe', (req, res) => {
    const clientIp = getClientIp(req);
    const now = Date.now();
    const bucket = qoeRateByIp.get(clientIp);
    if (bucket && now < bucket.resetAt && bucket.count >= 40) {
      return res.status(429).json({ success: false, error: 'QoE rate limit exceeded' });
    }
    qoeRateByIp.set(
      clientIp,
      bucket && now < bucket.resetAt
        ? { count: bucket.count + 1, resetAt: bucket.resetAt }
        : { count: 1, resetAt: now + 60_000 }
    );

    const body = req.body as Partial<QoeSample> | undefined;
    if (!body || typeof body.startupMs !== 'number') {
      return res.status(400).json({ success: false, error: 'Invalid QoE payload' });
    }

    const sample: QoeSample = {
      id: `qoe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      platform:
        body.platform === 'android-mobile' ||
        body.platform === 'android-tv' ||
        body.platform === 'smart-tv'
          ? body.platform
          : 'web',
      startupMs: Math.max(0, Math.min(60_000, Math.round(body.startupMs))),
      rebufferCount: Math.max(0, Math.min(100, Number(body.rebufferCount) || 0)),
      rebufferMs: Math.max(0, Math.min(600_000, Number(body.rebufferMs) || 0)),
      resolution: typeof body.resolution === 'string' ? body.resolution.slice(0, 24) : undefined,
      stallFailoverUsed: Boolean(body.stallFailoverUsed),
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 600) : undefined,
      requestId: typeof body.requestId === 'string' ? body.requestId.slice(0, 64) : undefined,
      failed: Boolean(body.failed),
    };

    if (sample.sourceUrl) {
      channelHealthMonitor.recordPlaybackFeedback(sample.sourceUrl, {
        startupMs: sample.startupMs,
        rebufferCount: sample.rebufferCount,
        failed: sample.failed || sample.stallFailoverUsed,
      });
    }

    qoeRingBuffer.push(sample);
    if (qoeRingBuffer.length > MAX_QOE_SAMPLES) {
      qoeRingBuffer.shift();
    }
    return res.json({ success: true, requestId: sample.requestId });
  });

  app.get('/api/metrics/qoe/summary', (req, res) => {
    if (process.env.INTERNAL_METRICS_TOKEN && !hasValidInternalMetricsToken(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized metrics read' });
    }
    if (qoeRingBuffer.length === 0) {
      return res.json({ count: 0, p50StartupMs: 0, p95StartupMs: 0, avgRebuffers: 0 });
    }
    const sorted = [...qoeRingBuffer].map((s) => s.startupMs).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
    const avgRebuffers =
      qoeRingBuffer.reduce((acc, s) => acc + s.rebufferCount, 0) / qoeRingBuffer.length;
    logger.debug({ count: qoeRingBuffer.length, p50, p95 }, 'qoe_summary_queried');
    return res.json({
      count: qoeRingBuffer.length,
      p50StartupMs: p50,
      p95StartupMs: p95,
      avgRebuffers: Number(avgRebuffers.toFixed(2)),
    });
  });
}
