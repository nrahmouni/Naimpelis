import fs from 'fs';
import path from 'path';
import type express from 'express';
import { ENV, ROOT_DIR } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import { serviceMesh } from '../gateway/serviceMesh.ts';

export interface QoeSample {
  id: string;
  ts: number;
  platform: 'web' | 'android-mobile' | 'android-tv' | 'smart-tv';
  startupMs: number;
  rebufferCount: number;
  rebufferMs: number;
  resolution?: string;
  stallFailoverUsed?: boolean;
}

const qoeRingBuffer: QoeSample[] = [];
const MAX_QOE_SAMPLES = 250;
const appReleaseCache = new LruTtlCache<string, Record<string, unknown>>(10, 60_000);

export interface HealthRouteDeps {
  getStats: () => {
    roomsCount: number;
    connectedClientsCount: number;
    uptimeSec: number;
  };
  getPublicOrigin: (req: express.Request) => string;
}

export function registerOperationalRoutes(
  app: express.Express,
  deps: HealthRouteDeps
): void {
  // Health & Readiness endpoints
  app.get(['/health', '/api/health'], (_req, res) => {
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
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const packages = Array.from(
      new Set([ENV.androidMobilePkg, ENV.androidTvPkg, ENV.legacyAndroidPkg])
    );
    const statements = packages.map((packageName) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [ENV.androidCertSha256],
      },
    }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(statements);
  });

  // In-App & Android Native OTA Manifest Endpoint (/api/app/latest)
  app.get('/api/app/latest', (req, res) => {
    const platformParam = String(req.query.platform || 'all').toLowerCase();
    const origin = deps.getPublicOrigin(req);
    const cacheKey = `${origin}:${platformParam}`;
    const cached = appReleaseCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const mobileApkPath = path.join(ROOT_DIR, 'public', 'NAIM-CINE.apk');
    const tvApkPath = path.join(ROOT_DIR, 'public', 'NAIM-CINE-TV.apk');
    const mobileBytes = fs.existsSync(mobileApkPath) ? fs.statSync(mobileApkPath).size : 0;
    const tvBytes = fs.existsSync(tvApkPath) ? fs.statSync(tvApkPath).size : 0;

    const payload = {
      success: true,
      versionName: ENV.appVersionName,
      releasedAt: '2026-11-14T10:00:00Z',
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
        apkUrl: `${origin}/NAIM-CINE.apk?v=${ENV.appVersionCodeMobile}`,
        sizeBytes: mobileBytes,
        changelog: {
          es: 'Nueva interfaz en directo estilo Twitch, motor Media3/ExoPlayer mejorado, PiP en vivo y salas en tiempo real.',
          ca: 'Nova interfície en directe estil Twitch, motor Media3/ExoPlayer millorat, PiP en directe i sales en temps real.',
          en: 'New live Twitch-style broadcast interface, upgraded Media3/ExoPlayer engine, live PiP, and real-time rooms.',
        },
      },
      tv: {
        packageName: ENV.androidTvPkg,
        versionCode: ENV.appVersionCodeTv,
        versionName: ENV.appVersionName,
        minSupportedVersionCode: 100,
        forceUpdate: false,
        apkUrl: `${origin}/NAIM-CINE-TV.apk?v=${ENV.appVersionCodeTv}`,
        sizeBytes: tvBytes,
        changelog: {
          es: 'Identidad unificada estilo Twitch para Google TV, navegación 10-foot D-Pad y reproducción 4K fluida.',
          ca: 'Identitat unificada estil Twitch per a Google TV, navegació 10-foot D-Pad i reproducció 4K fluida.',
          en: 'Unified Twitch-style Google TV interface, 10-foot D-Pad navigation, and smooth 4K playback.',
        },
      },
    };

    appReleaseCache.set(cacheKey, payload);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json(payload);
  });

  // Playback Quality-of-Experience (QoE) Telemetry Ingestion (F8.7)
  app.post('/api/metrics/qoe', (req, res) => {
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
    };

    qoeRingBuffer.push(sample);
    if (qoeRingBuffer.length > MAX_QOE_SAMPLES) {
      qoeRingBuffer.shift();
    }
    return res.json({ success: true });
  });

  app.get('/api/metrics/qoe/summary', (_req, res) => {
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
