import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildResolvedCatalogStreamResult,
  resolveOrderedCandidateTracks,
} from '../server/routes/streamExtractHelpers/catalogTrackResolver.ts';
import {
  circuitBreakerStateMap,
  isProviderCircuitOpen,
  recordProviderOutcome,
  resetProviderCircuitBreakers,
  tryAcquireHalfOpenProbe,
} from '../server/services/providerCircuitBreaker.ts';
import {
  ChannelHealthMonitor,
  MAX_CHANNEL_PROBE_CONCURRENCY,
  runWithBoundedConcurrency,
} from '../server/services/channelHealthMonitor.ts';
import { PROBE_TIMEOUT_MS } from '../server/services/channelHealthProbe.ts';
import {
  clearFastLiveResolverCache,
  getLiveProbeConcurrencyStats,
  MAX_LIVE_PROBE_CONCURRENCY,
  raceFastLiveTracks,
  resetLiveProbeConcurrencyStats,
} from '../server/services/liveFastResolver.ts';
import {
  liveKeepAliveHttpAgent,
  liveKeepAliveHttpsAgent,
} from '../server/utils/tlsFetch.ts';

describe('5-Point Backend Performance & Stability Optimizations', () => {
  beforeEach(() => {
    resetProviderCircuitBreakers();
    clearFastLiveResolverCache();
    resetLiveProbeConcurrencyStats();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1) catalogMediaExtractor returns verified preferLang direct streams in 0ms and runs background enrichment with .catch(() => {})', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'server/routes/streamExtractHelpers/catalogMediaExtractor.ts'),
      'utf8'
    );
    expect(src).toContain('fastDirectReadyPromise');
    expect(src).toContain('Promise.race([');
    expect(src).not.toContain('setTimeout(resolve, 950)');
    expect(src).not.toContain('setTimeout(resolve, 1200)');
    expect(src).toContain('.catch(() => {})');
  });

  it('2) catalogTrackResolver races batches of 3 mirrors with Promise.any and aborts slower losers immediately', async () => {
    const abortedMirrors: string[] = [];
    const startedAt = Date.now();

    const result = await resolveOrderedCandidateTracks({
      orderedTracks: [
        {
          id: 'slow-1',
          label: 'Slow Mirror 1',
          lang: 'ES',
          sourceUrl: 'https://slow1.invalid/embed',
          resolverType: 'vidhide_hls',
        },
        {
          id: 'fast-winner',
          label: 'Fast Mirror 2',
          lang: 'ES',
          sourceUrl: 'https://fast2.invalid/embed',
          resolverType: 'vidhide_hls',
        },
        {
          id: 'slow-3',
          label: 'Slow Mirror 3',
          lang: 'ES',
          sourceUrl: 'https://slow3.invalid/embed',
          resolverType: 'vidhide_hls',
        },
        {
          id: 'never-touched-batch2',
          label: 'Batch 2 Mirror',
          lang: 'ES',
          sourceUrl: 'https://batch2.invalid/embed',
          resolverType: 'vidhide_hls',
        },
      ],
      getLangScore: () => 0,
      sourcePriority: () => 1,
      getTrackHealthScore: () => 100,
      isSandboxedFrame: false,
      directOnly: false,
      resolveTrackHooks: {
        unpackVidhideToHls: (url, signal) =>
          new Promise((resolve, reject) => {
            if (url.includes('fast2.invalid')) {
              setTimeout(
                () =>
                  resolve({
                    rawM3u8: '#EXTM3U\n#EXTINF:6,\nseg.ts\n',
                    proxyUrl: '/api/hls-proxy?url=https%3A%2F%2Fcdn.example%2Fok.m3u8',
                  }),
                15
              );
              return;
            }
            const t = setTimeout(() => resolve(null), 4000);
            signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                abortedMirrors.push(url);
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          }),
      },
    });

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(250);
    expect(result?.primaryMode).toBe('hls');
    expect(result?.primaryStreamUrl).toContain('cdn.example');
    expect(abortedMirrors).toEqual(
      expect.arrayContaining(['https://slow1.invalid/embed', 'https://slow3.invalid/embed'])
    );
    expect(abortedMirrors).not.toContain('https://batch2.invalid/embed');
  });

  it('3) circuit breaker trips after 2 failures within 60s for 180s and transitions cleanly to half-open', () => {
    vi.useFakeTimers();
    const base = new Date('2026-11-26T12:00:00Z');
    vi.setSystemTime(base);

    const bucket = 'mirror.example.invalid';
    recordProviderOutcome(bucket, { ok: false });
    expect(isProviderCircuitOpen(bucket)).toBe(false);
    expect(tryAcquireHalfOpenProbe(bucket)).toBe(true);

    recordProviderOutcome(bucket, { ok: false });
    expect(isProviderCircuitOpen(bucket)).toBe(true);
    expect(tryAcquireHalfOpenProbe(bucket)).toBe(false);

    const state = circuitBreakerStateMap.get(bucket);
    expect(state?.failures).toBeGreaterThanOrEqual(2);
    expect(state?.openUntil).toBe(base.getTime() + 180_000);

    // After 180s cooldown, allow exactly 1 half-open probe
    vi.setSystemTime(base.getTime() + 180_001);
    expect(isProviderCircuitOpen(bucket)).toBe(false);
    expect(tryAcquireHalfOpenProbe(bucket)).toBe(true);
    expect(tryAcquireHalfOpenProbe(bucket)).toBe(false);

    // Successful probe closes circuit again
    recordProviderOutcome(bucket, { ok: true, latencyMs: 120 });
    expect(isProviderCircuitOpen(bucket)).toBe(false);
    expect(circuitBreakerStateMap.get(bucket)?.openUntil).toBe(0);
  });

  it('4) subtitles wait is capped at <= 350ms returning subtitles: [] on slow upstream without delaying startup', async () => {
    const start = Date.now();
    const result = await buildResolvedCatalogStreamResult({
      resolvedSelection: {
        primaryStreamUrl: '/api/hls-proxy?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8',
        primaryMode: 'hls',
        resolvedTrack: {
          id: 'es-1',
          label: 'Castellano FHD',
          lang: 'ES',
          sourceUrl: 'https://cdn.example/master.m3u8',
          resolverType: 'direct_hls',
        },
        validTracks: [
          {
            id: 'es-1',
            label: 'Castellano FHD',
            lang: 'ES',
            sourceUrl: 'https://cdn.example/master.m3u8',
            resolverType: 'direct_hls',
          },
        ],
      },
      preferLang: 'ES',
      titleHint: 'Pelicula Prueba',
      extractedMovidyCleanTitle: '',
      extractedGnulaCleanTitle: '',
      tmdbResolvedTitle: 'Pelicula Prueba',
      effectiveMediaType: 'movie',
      effectiveSeason: 1,
      effectiveEpisode: 1,
      vestSubtitles: [],
      clipboxSubtitles: [],
      ghostflixSubtitles: [],
      resolvedTmdbId: 12345,
      subtitlesPromise: new Promise((resolve) =>
        setTimeout(
          () =>
            resolve([
              { id: 'late-sub', lang: 'ES', label: 'Spanish', url: 'https://subs.invalid/late.vtt' },
            ]),
          2200
        )
      ),
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(result.subtitles).toEqual([]);
    expect(result.streamUrl).toContain('cdn.example');
  });

  it('5) channel burst probing enforces strict max-10 concurrency, 1.5s timeout, keepAlive agents, up priority, and allowTranscodeFallback=false', async () => {
    expect(PROBE_TIMEOUT_MS).toBe(1500);
    expect(MAX_CHANNEL_PROBE_CONCURRENCY).toBe(10);
    expect(MAX_LIVE_PROBE_CONCURRENCY).toBe(10);
    expect((liveKeepAliveHttpAgent as { keepAlive?: boolean }).keepAlive).toBe(true);
    expect((liveKeepAliveHttpsAgent as { keepAlive?: boolean }).keepAlive).toBe(true);

    // Bounded worker helper strictly caps concurrent execution at 10
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 35 }, (_, i) => i);
    await runWithBoundedConcurrency(items, 50, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
    });
    expect(peak).toBeLessThanOrEqual(10);

    // raceFastLiveTracks bounds live probe concurrency <= 10 across simultaneous burst calls and skips down tracks
    const monitor = new ChannelHealthMonitor();
    monitor.setTrackHealth('https://dead.invalid/1.m3u8', {
      status: 'down',
      latencyMs: 1500,
      failCount: 3,
      checkedAt: Date.now(),
    });

    let probeActive = 0;
    let probePeak = 0;
    const burstCalls = Array.from({ length: 12 }, (_, idx) =>
      raceFastLiveTracks(
        [
          {
            id: `dead-${idx}`,
            label: 'Dead Mirror',
            lang: 'ES',
            sourceUrl: 'https://dead.invalid/1.m3u8',
            health: { status: 'down', latencyMs: 1500 },
          },
          {
            id: `up-${idx}`,
            label: 'Healthy UP Mirror',
            lang: 'ES',
            sourceUrl: `https://healthy-${idx}.invalid/live.m3u8`,
            health: { status: 'up', latencyMs: 45 },
          },
          {
            id: `backup-${idx}`,
            label: 'Backup Mirror',
            lang: 'ES',
            sourceUrl: `https://backup-${idx}.invalid/live.m3u8`,
          },
        ],
        {
          channelId: `burst-ch-${idx}`,
          timeoutMs: 2500,
          hedgeDelayMs: 0,
          hedgeSecondaryDelayMs: 0,
          probeImpl: async (track, probeOpts) => {
            expect(probeOpts.timeoutMs).toBeLessThanOrEqual(1500);
            probeActive += 1;
            probePeak = Math.max(probePeak, probeActive);
            await new Promise((r) => setTimeout(r, 20));
            probeActive -= 1;
            return {
              ok: track.id?.startsWith('up-'),
              streamUrl: track.sourceUrl,
              mode: 'hls',
              latencyMs: 20,
            };
          },
        }
      )
    );

    const outcomes = await Promise.all(burstCalls);
    expect(probePeak).toBeLessThanOrEqual(10);
    await new Promise((r) => setTimeout(r, 40));
    expect(getLiveProbeConcurrencyStats().active).toBe(0);
    for (const out of outcomes) {
      expect(out.ok).toBe(true);
      expect(out.winningTrack?.id).toMatch(/^up-/);
    }

    // Verify xtreamMultiProviderService honors allowTranscodeFallback
    const multiSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/services/providers/xtreamMultiProviderService.ts'),
      'utf8'
    );
    expect(multiSrc).toContain('const allowTranscode = opts?.allowTranscodeFallback !== false;');
    expect(multiSrc).toContain('if (!isTestEnv && allowTranscode)');
    expect(multiSrc).toContain('keepAliveAgent: true');
  });

  it('6) rejects binary MP4 web_embed payloads, hardens /api/embed-proxy, and keeps inline EmbedStagePanel free of Ventana/Funciona/Cloud HD clutter', async () => {
    const { verifyWebEmbedCandidateAlive } = await import(
      '../server/services/streamExtractFallback.ts'
    );
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        url: 'https://player.gnulahd.nu/embed/hope-lat',
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'video/mp4' : null) },
        arrayBuffer: async () => mp4Header.buffer.slice(mp4Header.byteOffset, mp4Header.byteOffset + mp4Header.byteLength),
        body: { cancel: async () => {} },
      }))
    );

    const alive = await verifyWebEmbedCandidateAlive(
      {
        id: 'gnula-embed-1-lat-2',
        label: 'Español Latino · GnulaHD (Servidor 2)',
        lang: 'LAT',
        sourceUrl: 'https://player.gnulahd.nu/embed/hope-lat',
        resolverType: 'web_embed',
      },
      'https://player.gnulahd.nu/embed/hope-lat'
    );
    expect(alive).toBe(false);
    vi.unstubAllGlobals();

    const embedProxySrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/routes/proxies/embedProxyRoutes.ts'),
      'utf8'
    );
    expect(embedProxySrc).toContain('rejectedAsBinary');
    expect(embedProxySrc).toContain("res.status(415)");

    const embedStageSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/player/EmbedStagePanel.tsx'),
      'utf8'
    );
    expect(embedStageSrc).not.toContain('embedRescueDismissedUrl !== videoState.url');
  });
});
