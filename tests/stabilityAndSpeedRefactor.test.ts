import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UI_COPY } from '../src/utils/i18n';
import { createLivePlaybackHealthMonitor } from '../src/components/player/hlsHealthWatchdog';
import { SocketTransport } from '../src/services/socketTransport';
import { normalizeTrackLangCode } from '../server/services/trackRankingService.ts';
import { buildResolvedCatalogStreamResult } from '../server/routes/streamExtractHelpers/catalogTrackResolver.ts';
import { raceFastLiveTracks } from '../server/services/liveFastResolver.ts';

describe('Stability & Ultra-Fast Streaming Refactor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).WebSocket;
  });

  it('reuses an already-open WebSocket when transitioning from presence to a room without disconnecting', () => {
    const sentFrames: string[] = [];
    let closeCalls = 0;
    const fakeWs = {
      readyState: 1, // WebSocket.OPEN
      send: (data: string) => sentFrames.push(data),
      close: () => {
        closeCalls += 1;
      },
      onclose: null as null | (() => void),
      onmessage: null as null | ((ev: unknown) => void),
      onerror: null as null | (() => void),
      onopen: null as null | (() => void),
    };

    let wsInstantiations = 0;
    function FakeWebSocketCtor() {
      wsInstantiations += 1;
      return fakeWs;
    }
    (FakeWebSocketCtor as unknown as { OPEN: number; CONNECTING: number }).OPEN = 1;
    (FakeWebSocketCtor as unknown as { OPEN: number; CONNECTING: number }).CONNECTING = 0;

    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocketCtor;
    (globalThis as Record<string, unknown>).window = {
      location: { protocol: 'https:', host: 'riffan.ai.studio' },
      addEventListener: () => {},
      dispatchEvent: () => true,
    };

    const transport = new SocketTransport();
    const user = { id: 'u1', name: 'Naim', avatar: '🍿', color: '#8b5cf6', isHost: true };

    transport.connectPresenceOnly(user);
    expect(wsInstantiations).toBe(1);

    // Transition to a room while socket is OPEN: must NOT close or open a 2nd WebSocket
    transport.connect('sala1', user, 'Mi Sala');
    expect(closeCalls).toBe(0);
    expect(wsInstantiations).toBe(1);
    expect(sentFrames.some((f) => f.includes('"type":"JOIN_ROOM"'))).toBe(true);
    transport.disconnect();
  });

  it('uses accurate stream extraction subtitles in extractingSub rather than misleading room sync copy', () => {
    for (const locale of ['es', 'ca', 'en', 'zh', 'rif'] as const) {
      const text = UI_COPY[locale].extractingSub.toLowerCase();
      expect(text).not.toContain('sincronizando con tu sala');
      expect(text).not.toContain('sincronitzant amb la teva sala');
      expect(text).not.toContain('syncing with your room');
    }
  });

  it('normalizes CAST/ESP/SPA Castellano variants so languageFallbackUsed stays false when ES is requested', async () => {
    for (const rawLang of ['ES', 'CAST', 'ESP', 'SPA']) {
      expect(normalizeTrackLangCode(rawLang)).toBe('ES');

      const result = await buildResolvedCatalogStreamResult({
        resolvedSelection: {
          primaryStreamUrl: '/api/hls-proxy?url=https%3A%2F%2Fcdn.example.com%2Fmaster.m3u8',
          primaryMode: 'hls',
          resolvedTrack: {
            id: 't-cast',
            label: 'Castellano · 1080p',
            lang: rawLang,
            sourceUrl: 'https://cdn.example.com/master.m3u8',
            resolverType: 'direct_hls',
            resolvedStreamUrl: '/api/hls-proxy?url=https%3A%2F%2Fcdn.example.com%2Fmaster.m3u8',
          },
          validTracks: [
            {
              id: 't-cast',
              label: 'Castellano · 1080p',
              lang: rawLang,
              sourceUrl: 'https://cdn.example.com/master.m3u8',
              resolverType: 'direct_hls',
              resolvedStreamUrl: '/api/hls-proxy?url=https%3A%2F%2Fcdn.example.com%2Fmaster.m3u8',
            },
          ],
        },
        preferLang: 'ES',
        titleHint: 'Película de Prueba',
        extractedMovidyCleanTitle: '',
        extractedGnulaCleanTitle: '',
        tmdbResolvedTitle: 'Película de Prueba',
        effectiveMediaType: 'movie',
        effectiveSeason: 1,
        effectiveEpisode: 1,
        vestSubtitles: [],
        clipboxSubtitles: [],
        ghostflixSubtitles: [],
        resolvedTmdbId: 123,
        subtitlesPromise: Promise.resolve([]),
      });

      expect(result.resolvedLang).toBe('ES');
      expect(result.languageFallbackUsed).toBe(false);
      expect(result.availableLanguages).toContain('ES');
    }
  });

  it('launches top 4 providers immediately in liveFastResolver Wave 1 and switches quickly when 1st fails', async () => {
    const probedUrls: string[] = [];
    const res = await raceFastLiveTracks(
      [
        { id: 'c1', label: 'P1', lang: 'ES', sourceUrl: 'https://p1.example/a.m3u8', resolverType: 'direct_hls' },
        { id: 'c2', label: 'P2', lang: 'ES', sourceUrl: 'https://p2.example/b.m3u8', resolverType: 'direct_hls' },
        { id: 'c3', label: 'P3', lang: 'ES', sourceUrl: 'https://p3.example/c.m3u8', resolverType: 'direct_hls' },
        { id: 'c4', label: 'P4', lang: 'ES', sourceUrl: 'https://p4.example/d.m3u8', resolverType: 'direct_hls' },
      ],
      {
        channelId: 'test-fast-match',
        timeoutMs: 1200,
        hedgeDelayMs: 500,
        probeImpl: async (track) => {
          probedUrls.push(track.sourceUrl);
          if (track.sourceUrl.includes('p4.example')) {
            return { ok: true, streamUrl: '/api/hls-proxy?url=ok', mode: 'hls', latencyMs: 15, statusCode: 200 };
          }
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 20, statusCode: 502 };
        },
      }
    );

    expect(res.ok).toBe(true);
    expect(res.winningTrack?.id).toBe('c4');
    // All 4 distinct providers launched immediately in Wave 1 before hedgeDelayMs (500ms)
    expect(probedUrls).toHaveLength(4);
    expect(res.latencyMs).toBeLessThan(300);
  });

  it('triggers tightened startup (4s/9s) and stall (2.2s/5s/10s) actions in hlsHealthWatchdog', () => {
    const monitor = createLivePlaybackHealthMonitor();
    const fakeVideo = { paused: false, currentTime: 0, videoWidth: 0, readyState: 1 } as unknown as HTMLVideoElement;

    expect(monitor.check(fakeVideo, 1_000, true).action).toBe('healthy');
    expect(monitor.check(fakeVideo, 5_100, true).action).toBe('recover_signal');
    expect(monitor.check(fakeVideo, 10_200, true).action).toBe('switch_backup');

    monitor.reset();
    const playingVideo = { paused: false, currentTime: 10, videoWidth: 1280, readyState: 4 } as unknown as HTMLVideoElement;
    expect(monitor.check(playingVideo, 20_000, true).action).toBe('healthy');
    expect(monitor.check(playingVideo, 22_300, true).action).toBe('recover_signal');
    expect(monitor.check(playingVideo, 25_100, true).action).toBe('soft_reconnect');
    expect(monitor.check(playingVideo, 30_200, true).action).toBe('switch_backup');
  });

  it('enforces DVB continuous HLS routing and Range/206 support across IPTV & proxy handlers', () => {
    const iptvSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/iptv.ts'), 'utf8');
    const dvbBranchStart = iptvSrc.indexOf('if (isDvbHeadendStream(cleanUrl))');
    const dvbBranchEnd = iptvSrc.indexOf('const manifestObj = await fetchUpstreamManifestText', dvbBranchStart);
    const dvbBranch = iptvSrc.slice(dvbBranchStart, dvbBranchEnd);
    expect(dvbBranch).toContain('resolveDvbIptvPlaylistText');
    expect(dvbBranch).not.toContain('trimLiveDvrManifestForIptv(unwrappedProbe.text');

    const tsProxySrc = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/proxies/tsProxyHandler.ts'), 'utf8');
    expect(tsProxySrc).toContain("res.status(206)");
    expect(tsProxySrc).toContain("res.setHeader('Content-Range', `bytes ${start}-${end}/${remuxedBuf.length}`)");

    const dvbTranscoderSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/routes/proxies/dvbTranscoder.ts'), 'utf8');
    expect(dvbTranscoderSrc).toContain("res.setHeader('Accept-Ranges', 'bytes');");
  });
});
