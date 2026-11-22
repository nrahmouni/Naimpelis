import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import type express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { inspectHlsCodecManifest } from '../server/services/channelHealthMonitor.ts';
import { createSlidingWindowRateLimiter } from '../server/middleware/errorHandler.ts';
import { maskSensitiveText } from '../server/utils/logger.ts';
import { createGracefulShutdownHandler } from '../server/utils/gracefulShutdown.ts';
import { rankCandidateTracks } from '../server/services/trackRankingService.ts';
import {
  RIFFAN_100_IMPROVEMENTS,
  getImprovementsSummary,
} from '../server/services/improvementsRegistry.ts';
import {
  fetchJsonWithRetry,
  safeStorageGetJson,
  safeStorageSetJson,
} from '../src/utils/networkAndStorageResilience.ts';
import type { TrackRecord } from '../server/extractors/httpHelpers.ts';

const ROOT = process.cwd();

describe('RiffanTV 100 Engineering Improvements Verification (F1 -> F11)', () => {
  it('registers exactly 100 unique numbered improvements across all phases', () => {
    const summary = getImprovementsSummary();
    expect(summary.total).toBe(100);
    expect(RIFFAN_100_IMPROVEMENTS.length).toBe(100);

    const ids = new Set(RIFFAN_100_IMPROVEMENTS.map((i) => i.id));
    expect(ids.size).toBe(100);
    for (let i = 1; i <= 100; i++) {
      expect(ids.has(i)).toBe(true);
    }
    expect(Object.keys(summary.byPhase).length).toBeGreaterThanOrEqual(8);
  });

  it('detects full A/V HLS manifests vs audio-only mp4a manifests via inspectHlsCodecManifest', () => {
    const validAvManifest = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
      'chunklist_720p.m3u8',
    ].join('\n');

    const avResult = inspectHlsCodecManifest(validAvManifest);
    expect(avResult.hasCodecAttr).toBe(true);
    expect(avResult.hasVideo).toBe(true);
    expect(avResult.hasAudio).toBe(true);
    expect(avResult.audioOnly).toBe(false);
    expect(avResult.videoCodec).toBe('avc1.4d401f');
    expect(avResult.audioCodec).toBe('mp4a.40.2');

    const audioOnlyManifest = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"',
      'audio_only.m3u8',
    ].join('\n');

    const audioResult = inspectHlsCodecManifest(audioOnlyManifest);
    expect(audioResult.hasCodecAttr).toBe(true);
    expect(audioResult.hasVideo).toBe(false);
    expect(audioResult.hasAudio).toBe(true);
    expect(audioResult.audioOnly).toBe(true);
  });

  it('enforces sliding window rate limits with 429 and Retry-After headers', () => {
    const limiter = createSlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 10_000,
      keyPrefix: 'test-ai',
    });

    const headers: Record<string, string> = {};
    let statusCode = 200;
    let bodyPayload: unknown = null;

    const req = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      ip: '203.0.113.10',
    } as unknown as express.Request;

    const makeRes = () => {
      headers['X-RateLimit-Limit'] = '';
      statusCode = 200;
      bodyPayload = null;
      return {
        setHeader(k: string, v: string) {
          headers[k] = v;
        },
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          bodyPayload = payload;
          return this;
        },
      } as unknown as express.Response;
    };

    const next = vi.fn();
    limiter(req, makeRes(), next);
    limiter(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(headers['X-RateLimit-Remaining']).toBe('0');

    limiter(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(statusCode).toBe(429);
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect((bodyPayload as { success?: boolean })?.success).toBe(false);
  });

  it('redacts Bearer tokens, email addresses, API query secrets, and Xtream paths in logger', () => {
    const raw =
      'Authorization: Bearer super_secret_jwt_123 user=carlos.dev@example.com https://tv.host/live/user123/pass456/78.ts?api_key=XYZ99';
    const masked = String(maskSensitiveText(raw));
    expect(masked).not.toContain('super_secret_jwt_123');
    expect(masked).not.toContain('carlos.dev@example.com');
    expect(masked).not.toContain('user123');
    expect(masked).not.toContain('pass456');
    expect(masked).not.toContain('XYZ99');
    expect(masked).toContain('[REDACTED]');
    expect(masked).toContain('ca***@example.com');
  });

  it('coordinates graceful shutdown across timers, DVB sessions, WS, and HTTP server', async () => {
    const timerStop = vi.fn();
    const dvbCleanup = vi.fn();
    const exitFn = vi.fn();

    const fakeHttpServer = {
      close: (cb?: (err?: Error) => void) => {
        cb?.();
      },
    } as unknown as http.Server;

    const handler = createGracefulShutdownHandler({
      httpServer: fakeHttpServer,
      stopTimers: [timerStop],
      cleanupSessions: [dvbCleanup],
      timeoutMs: 1000,
      exitFn,
    });

    await handler('SIGTERM');
    await handler('SIGINT'); // idempotent second call
    expect(timerStop).toHaveBeenCalledTimes(1);
    expect(dvbCleanup).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledWith(0);
  });

  it('prioritizes preferred language and healthy A/V tracks in rankCandidateTracks', () => {
    const mkTrack = (partial: Partial<TrackRecord>): TrackRecord => ({
      id: partial.id || 'movidy-1',
      label: partial.label || 'HD',
      lang: partial.lang || 'ES',
      quality: partial.quality || '1080p',
      sourceUrl: partial.sourceUrl || 'https://cdn.example.com/a.m3u8',
      resolverType: partial.resolverType || 'direct_hls',
    });

    const tracks = [
      mkTrack({ id: 'en-1', lang: 'EN', sourceUrl: 'https://cdn.example.com/en.m3u8' }),
      mkTrack({ id: 'es-down', lang: 'ES', sourceUrl: 'https://cdn.example.com/down.m3u8' }),
      mkTrack({ id: 'es-up', lang: 'ES', sourceUrl: 'https://cdn.example.com/up.m3u8' }),
    ];

    const ranked = rankCandidateTracks({
      allDiscovered: tracks,
      preferLang: 'ES',
      isVestLink: false,
      hasExplicitMovidyUrl: false,
      hasExplicitGnulaUrl: false,
      healthMap: {
        'https://cdn.example.com/down.m3u8': { status: 'down', failCount: 3 },
        'https://cdn.example.com/up.m3u8': { status: 'up', latencyMs: 120 },
      },
    });

    expect(ranked.orderedTracks[0].id).toBe('es-up');
    expect(ranked.orderedTracks[1].id).toBe('es-down');
    expect(ranked.orderedTracks[2].id).toBe('en-1');
  });

  it('evicts transient naim_cache_* storage entries on QuotaExceededError and reads safely', () => {
    const store = new Map<string, string>([
      ['naim_cache_old', '{"big":true}'],
      ['naim_lang', '"es"'],
    ]);
    let failFirstTargetWrite = true;

    const fakeStorage = {
      get length() {
        return store.size;
      },
      key(idx: number) {
        return Array.from(store.keys())[idx] ?? null;
      },
      getItem(k: string) {
        return store.get(k) ?? null;
      },
      removeItem(k: string) {
        store.delete(k);
      },
      setItem(k: string, v: string) {
        if (k === 'naim_prefs' && failFirstTargetWrite) {
          failFirstTargetWrite = false;
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
        store.set(k, v);
      },
    } as unknown as Storage;

    const ok = safeStorageSetJson('naim_prefs', { theme: 'oled' }, fakeStorage);
    expect(ok).toBe(true);
    expect(store.has('naim_cache_old')).toBe(false);
    expect(store.has('naim_lang')).toBe(true);
    expect(safeStorageGetJson<{ theme: string }>('naim_prefs', { theme: 'dark' }, fakeStorage)).toEqual({
      theme: 'oled',
    });
  });

  it('retries transient 503 responses in fetchJsonWithRetry and succeeds cleanly', async () => {
    let calls = 0;
    const mockFetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('busy', { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true, count: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const data = await fetchJsonWithRetry<{ ok: boolean; count: number }>('https://example.test/api', {
      retries: 2,
      baseDelayMs: 5,
      fetchImpl: mockFetch,
    });

    expect(calls).toBe(2);
    expect(data).toEqual({ ok: true, count: 42 });
  });

  it('verifies HTML non-blocking fonts, Vite chunks/Workbox caching, A11y suite, and <= 700 line limit on new/modified modules', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('media="print"');
    expect(html).toContain('color-scheme');
    expect(html).toContain('image.tmdb.org');

    const viteCfg = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    expect(viteCfg).toContain('tmdb-images-cache');
    expect(viteCfg).toContain('football-board-swr-cache');
    expect(viteCfg).toContain("'feature-music'");
    expect(viteCfg).toContain("'feature-sports'");

    const checkedModules = [
      'server.ts',
      'server/utils/gracefulShutdown.ts',
      'server/utils/logger.ts',
      'server/middleware/errorHandler.ts',
      'server/services/trackRankingService.ts',
      'server/routes/spaFrontendMount.ts',
      'server/services/improvementsRegistry.ts',
      'server/services/channelHealthMonitor.ts',
      'server/routes/proxies/dvbTranscoder.ts',
      'server/services/footballHelpers/standingsParser.ts',
      'server/routes/youtubeCatalog.ts',
      'src/components/ui/A11yUtilities.tsx',
      'src/utils/networkAndStorageResilience.ts',
      'src/components/AppErrorBoundary.tsx',
      'src/components/AppGlobalModalsLayer.tsx',
      'src/components/worlds/WorldShell.tsx',
      'src/components/liveMatch/StandingsTab.tsx',
    ];

    for (const rel of checkedModules) {
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/).length;
      expect(lines, `${rel} exceeded 700 lines (${lines})`).toBeLessThanOrEqual(700);
    }
  });
});
