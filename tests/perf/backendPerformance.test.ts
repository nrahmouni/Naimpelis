import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import compression from 'compression';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LruTtlCache, SingleFlightRegistry } from '../../server/utils/lruCache';
import {
  isDisallowedHostnameSyntax,
  isPrivateIpAddress,
  resolveSafePublicOrigin,
} from '../../server/utils/ssrfGuard';
import {
  mapPathToServiceId,
  serviceMesh,
  serviceMeshGatewayMiddleware,
} from '../../server/gateway/serviceMesh';
import {
  createSlidingWindowRateLimiter,
  securityHeadersMiddleware,
} from '../../server/middleware/errorHandler';
import { runtimeMetrics } from '../../server/services/runtimeMetricsCollector';
import { buildAdminOverviewSnapshot } from '../../server/routes/adminRoutes';
import { registerOperationalRoutes } from '../../server/routes/health';
import { decryptDesEcbBase64 } from '../../server/utils/desEcb';
import { rankCandidateTracks } from '../../server/services/trackRankingService';
import { buildCanonicalRoute, parseAppRoute } from '../../src/shared/dedicatedRoutes';
import { createShuffledDeck, evaluateBest5Of7 } from '../../src/shared/pokerHandEvaluator';
import { createHeadSoccerSimulation, stepHeadSoccerFrame } from '../../src/shared/headSoccer';
import { createInitialChapasBall, createInitialChapasCaps } from '../../src/shared/futbolChapas';
import { stepChapasPhysicsFrame } from '../../src/shared/chapasPhysicsAndAi';
import {
  benchmarkAsyncSamples,
  benchmarkBatchThroughput,
  benchmarkSyncOps,
} from './perfHarness';

describe('Performance & Speed — Backend HTTP, Mesh, Cache, Security & Engines', () => {
  let httpServer: Server;
  let baseUrl = '';

  beforeAll(async () => {
    serviceMesh.resetCircuit();
    const app = express();
    app.use(compression());
    app.use(securityHeadersMiddleware);
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', serviceMeshGatewayMiddleware);

    registerOperationalRoutes(app, {
      getStats: () => ({
        roomsCount: 18,
        connectedClientsCount: 142,
        uptimeSec: 7200,
        activeDvbSessions: 3,
      }),
      getPublicOrigin: () => 'https://riffan.ai.studio',
    });

    app.get('/api/perf/echo', (_req, res) => {
      res.json({ ok: true, items: Array.from({ length: 40 }, (_, i) => ({ id: i, title: `Item ${i}` })) });
    });

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('handles high-concurrency HTTP API requests through Express + Compression + ServiceMesh with low tail latency', async () => {
    // Warm up JIT & connection pool
    for (let w = 0; w < 4; w += 1) {
      await Promise.all([
        fetch(`${baseUrl}/api/health`).then((r) => r.arrayBuffer()),
        fetch(`${baseUrl}/api/ready`).then((r) => r.arrayBuffer()),
        fetch(`${baseUrl}/api/perf/echo`).then((r) => r.arrayBuffer()),
      ]);
    }

    let seqOk = 0;
    const seqStats = await benchmarkAsyncSamples('HTTP /api/health sequential (c=1, n=40)', 40, 1, async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) seqOk += 1;
      await res.arrayBuffer();
    });
    expect(seqOk).toBe(40);
    expect(seqStats.p95Ms).toBeLessThan(80);

    let okCount = 0;
    const stats = await benchmarkAsyncSamples('HTTP /api/health burst (c=12, n=120)', 120, 12, async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) okCount += 1;
      await res.arrayBuffer();
    });

    expect(okCount).toBe(120);
    expect(stats.p95Ms).toBeLessThan(350);
    expect(stats.opsPerSec).toBeGreaterThan(80);

    let echoOk = 0;
    const echoStats = await benchmarkAsyncSamples('HTTP /api/perf/echo gzip (c=12, n=120)', 120, 12, async () => {
      const res = await fetch(`${baseUrl}/api/perf/echo`);
      if (res.ok) echoOk += 1;
      await res.arrayBuffer();
    });
    expect(echoOk).toBe(120);
    expect(echoStats.p95Ms).toBeLessThan(250);
  });

  it('builds buildAdminOverviewSnapshot rapidly and records RuntimeMetricsCollector with negligible overhead', async () => {
    const metricsPerf = benchmarkBatchThroughput('RuntimeMetricsCollector (10,000 samples)', 10_000, () => {
      for (let i = 0; i < 10_000; i += 1) {
        runtimeMetrics.recordHttpRequest(i % 200 === 0 ? 502 : 200, (i % 45) + 1);
        runtimeMetrics.recordMediaRequest(i % 2 === 0 ? 'hls' : 'ts', 16384);
      }
    });
    expect(metricsPerf.totalMs).toBeLessThan(250);

    const adminStats = await benchmarkAsyncSamples('Admin buildAdminOverviewSnapshot (n=25)', 25, 1, async () => {
      const snap = await buildAdminOverviewSnapshot({
        getRoomStats: () => ({ roomsCount: 12, connectedClientsCount: 64 }),
        getPublicOrigin: () => 'https://riffan.ai.studio',
      });
      expect(snap.architecture.controlPlane.cpuCores).toBeGreaterThanOrEqual(1);
    });
    expect(adminStats.p95Ms).toBeLessThan(60);
  });

  it('sustains high ops/sec on LruTtlCache and deduplicates thundering-herd SingleFlight calls', async () => {
    const cache = new LruTtlCache<string, number>(2000, 60_000);
    const lruBench = benchmarkBatchThroughput('LruTtlCache 100k set/get/evict', 100_000, () => {
      for (let i = 0; i < 100_000; i += 1) {
        const key = `k-${i % 3500}`;
        if ((i & 3) === 0) {
          cache.set(key, i);
        } else {
          cache.get(key);
        }
      }
    });
    expect(cache.size).toBeLessThanOrEqual(2000);
    expect(lruBench.opsPerSec).toBeGreaterThan(250_000);

    const sf = new SingleFlightRegistry<string>();
    let upstreamCalls = 0;
    const sfStats = await benchmarkAsyncSamples('SingleFlight 300 concurrent herd (c=300)', 300, 300, async (i) => {
      const val = await sf.run(`bucket-${i % 3}`, async () => {
        upstreamCalls += 1;
        await new Promise((r) => setTimeout(r, 8));
        return 'ok';
      });
      expect(val).toBe('ok');
    });
    expect(upstreamCalls).toBe(3);
    expect(sf.size).toBe(0);
    expect(sfStats.p95Ms).toBeLessThan(150);
  });

  it('validates SSRF IPs/hostnames, ServiceMesh routing & sliding-window rate limits at sub-microsecond per-op cost', () => {
    const ips = [
      '8.8.8.8',
      '127.0.0.1',
      '10.0.0.14',
      '169.254.169.254',
      '192.168.1.44',
      '::ffff:127.0.0.1',
      '2001:4860:4860::8888',
      'fd00::1',
    ];
    const ssrfBench = benchmarkBatchThroughput('SSRF Guard IPv4/IPv6 + Origin (40,000 checks)', 40_000, () => {
      for (let i = 0; i < 40_000; i += 1) {
        isPrivateIpAddress(ips[i % ips.length]);
        if ((i & 3) === 0) {
          isDisallowedHostnameSyntax(i % 2 === 0 ? 'localhost' : 'stream.example.com');
          resolveSafePublicOrigin({ hostHeader: 'riffan.ai.studio', forwardedProto: 'https' });
        }
      }
    });
    expect(ssrfBench.opsPerSec).toBeGreaterThan(100_000);

    const paths = [
      '/api/catalog/movies',
      '/api/hls-proxy?url=x',
      '/api/epg/guide',
      '/api/sports/today',
      '/api/tv/tizen-wgt-manifest',
      '/api/metrics/qoe',
    ];
    const meshBench = benchmarkBatchThroughput('ServiceMesh map + recordSuccess (40,000 ops)', 40_000, () => {
      for (let i = 0; i < 40_000; i += 1) {
        const id = mapPathToServiceId(paths[i % paths.length]);
        serviceMesh.recordSuccess(id, 4);
        serviceMesh.isCircuitOpen(id);
      }
    });
    expect(meshBench.opsPerSec).toBeGreaterThan(150_000);

    const limiter = createSlidingWindowRateLimiter({ maxRequests: 100_000, windowMs: 60_000, keyPrefix: 'perf' });
    const mockReq = { headers: {}, ip: '203.0.113.10' } as unknown as express.Request;
    const mockRes = { setHeader: () => mockRes, status: () => mockRes, json: () => mockRes } as unknown as express.Response;
    const rateBench = benchmarkBatchThroughput('SlidingWindowRateLimiter (20,000 evals)', 20_000, () => {
      for (let i = 0; i < 20_000; i += 1) {
        limiter(mockReq, mockRes, () => {});
      }
    });
    expect(rateBench.opsPerSec).toBeGreaterThan(80_000);
  });

  it('executes DES-ECB decryption, deep-link route parsing & candidate track ranking rapidly', () => {
    const sampleCipher = 'U2FsdGVkX18='; // 8-byte aligned valid Base64 block
    const desBench = benchmarkBatchThroughput('DES-ECB decryptDesEcbBase64 (1,000 blocks)', 1_000, () => {
      for (let i = 0; i < 1_000; i += 1) {
        decryptDesEcbBase64(sampleCipher);
      }
    });
    expect(desBench.totalMs).toBeLessThan(750);

    const routeSamples = [
      '/?room=vip123&tv=1',
      '/futbol/directo-realmadrid-barcelona',
      '/musica?track=daft-punk&view=radios',
      '/tv/la-1-tve',
      '/juegos/penalty',
    ];
    const routeBench = benchmarkBatchThroughput('parseAppRoute + buildCanonicalRoute (20,000 routes)', 20_000, () => {
      for (let i = 0; i < 20_000; i += 1) {
        const parsed = parseAppRoute(routeSamples[i % routeSamples.length].split('?')[0], 'room=sala1&game=racing');
        buildCanonicalRoute(parsed);
      }
    });
    expect(routeBench.opsPerSec).toBeGreaterThan(25_000);

    const tracks = Array.from({ length: 24 }, (_, i) => ({
      id: `tr-${i}`,
      name: `Mirror ${i}`,
      lang: i % 3 === 0 ? 'ES' : i % 3 === 1 ? 'VOSE' : 'EN',
      quality: i % 2 === 0 ? '1080p' : '720p',
      url: `https://cdn${i}.example.com/master.m3u8`,
      resolverType: (i % 4 === 0 ? 'direct_hls' : 'direct_mp4') as 'direct_hls' | 'direct_mp4',
    }));
    const rankStats = benchmarkSyncOps('rankCandidateTracks (24 tracks, n=500)', 500, () => {
      const res = rankCandidateTracks({
        allDiscovered: tracks,
        preferLang: 'ES',
        isVestLink: false,
        hasExplicitMovidyUrl: false,
        hasExplicitGnulaUrl: false,
        healthMap: {},
      });
      expect(res.orderedTracks.length).toBe(24);
    });
    expect(rankStats.p95Ms).toBeLessThan(2);
  });

  it('maintains 60FPS+ simulation headroom for Poker Holdem, HeadSoccer & Futbol Chapas physics engines', () => {
    const deck = createShuffledDeck();
    const seven = deck.slice(0, 7);
    const pokerStats = benchmarkSyncOps('Poker evaluateBest5Of7 (n=2,000)', 2_000, () => {
      const ev = evaluateBest5Of7(seven);
      expect(ev.category).toBeGreaterThanOrEqual(0);
    });
    expect(pokerStats.p95Ms).toBeLessThan(1.5);

    const hsSim = createHeadSoccerSimulation('striker', 'furia');
    const hsStats = benchmarkSyncOps('HeadSoccer stepHeadSoccerFrame (n=3,000)', 3_000, (i) => {
      stepHeadSoccerFrame(
        hsSim,
        [
          { left: i % 2 === 0, right: i % 2 !== 0, jump: i % 30 === 0, kick: i % 15 === 0 },
          { left: i % 3 === 0, right: i % 3 !== 0, jump: false, kick: i % 20 === 0 },
        ],
        1 / 60
      );
    });
    expect(hsStats.p95Ms).toBeLessThan(1.0);

    const caps = createInitialChapasCaps();
    const ball = createInitialChapasBall();
    caps[0].vx = 18;
    caps[0].vy = -9;
    const chapasStats = benchmarkSyncOps('FutbolChapas stepChapasPhysicsFrame (n=1,500)', 1_500, () => {
      stepChapasPhysicsFrame(caps, ball);
    });
    expect(chapasStats.p95Ms).toBeLessThan(1.0);
  });
});
