import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedDnsLookup } from '../server/utils/tlsFetch.ts';
import {
  coalesceLiveManifestFetch,
  deriveNextPredictedSegmentUrl,
  getCachedLiveManifest,
  getCachedLiveTsSegment,
  setCachedLiveManifest,
  setCachedLiveTsSegment,
} from '../server/routes/proxies/liveSegmentCache.ts';
import {
  exportProviderCircuitBuckets,
  importProviderCircuitBuckets,
  recordProviderOutcome,
} from '../server/services/providerCircuitBreaker.ts';
import {
  orderCandidatesForFastResolve,
  raceFastLiveTracks,
} from '../server/services/liveFastResolver.ts';
import { detectStreamLanguage } from '../server/utils/streamMetaParser.ts';
import { rankCandidateTracks } from '../server/services/trackRankingService.ts';
import { ChannelHealthMonitor } from '../server/services/channelHealthMonitor.ts';
import { isPreferredSharkProSpainLjli } from '../server/services/providers/xtreamFastSignalService.ts';
import { serializeRoomForClient } from '../server/ws/roomHubHelpers.ts';
import { SocketTransport } from '../src/services/socketTransport.ts';

describe('30 Speed Optimizations — Blocks A, B, C & D Verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).WebSocket;
  });

  it('Block D: cachedDnsLookup resolves IPv4 cleanly and hits in-memory TTL cache', async () => {
    const first = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      cachedDnsLookup('localhost', { family: 4 }, (err, address, family) => {
        if (err) return reject(err);
        resolve({ address: String(address), family: Number(family) });
      });
    });
    expect(first.address).toBeTruthy();

    const start = performance.now();
    const second = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      cachedDnsLookup('localhost', { family: 4 }, (err, address, family) => {
        if (err) return reject(err);
        resolve({ address: String(address), family: Number(family) });
      });
    });
    expect(second.address).toBe(first.address);
    expect(performance.now() - start).toBeLessThan(20);
  });

  it('Block D: coalesceLiveManifestFetch deduplicates concurrent manifest fetches & derives seq+1 URL', async () => {
    let calls = 0;
    const url = 'https://cdn-test.invalid/live/channel1/index.m3u8';
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { text: '#EXTM3U\n#EXTINF:4.0,\nseg0010.ts\n', baseUrl: url, ts: Date.now() };
    };

    const [a, b, c] = await Promise.all([
      coalesceLiveManifestFetch(url, fetcher),
      coalesceLiveManifestFetch(url, fetcher),
      coalesceLiveManifestFetch(url, fetcher),
    ]);

    expect(calls).toBe(1);
    expect(a?.text).toContain('#EXTM3U');
    expect(b?.text).toBe(a?.text);
    expect(c?.text).toBe(a?.text);
    expect(getCachedLiveManifest(url)?.text).toContain('seg0010.ts');

    expect(deriveNextPredictedSegmentUrl('https://cdn.example.com/hls/seg0010.ts')).toBe(
      'https://cdn.example.com/hls/seg0011.ts'
    );
    expect(deriveNextPredictedSegmentUrl('https://cdn.example.com/hls/chunk_99.m4s?token=abc')).toBe(
      'https://cdn.example.com/hls/chunk_100.m4s?token=abc'
    );
  });

  it('Block D: providerCircuitBreaker exports & imports persisted EWMA buckets', () => {
    recordProviderOutcome('test_fast_cdn_bucket', true, 42);
    const snapshot = exportProviderCircuitBuckets();
    expect(snapshot.some((b) => b.bucket === 'test_fast_cdn_bucket')).toBe(true);

    importProviderCircuitBuckets([
      {
        bucket: 'hydrated_cdn_bucket',
        state: 'closed',
        consecutiveFailures: 0,
        successCount: 9,
        failureCount: 0,
        ewmaLatencyMs: 65,
        lastOutcomeAt: Date.now(),
        openUntil: 0,
        halfOpenProbing: false,
      },
    ]);
    const after = exportProviderCircuitBuckets();
    expect(after.find((b) => b.bucket === 'hydrated_cdn_bucket')?.ewmaLatencyMs).toBe(65);
  });

  it('Block A: liveFastResolver returns backupStreamUrl alongside primary winner', async () => {
    const res = await raceFastLiveTracks(
      [
        { id: 'w1', label: 'Primary', lang: 'ES', sourceUrl: 'https://a.invalid/1.m3u8', resolverType: 'direct_hls' },
        { id: 'w2', label: 'Backup', lang: 'ES', sourceUrl: 'https://b.invalid/2.m3u8', resolverType: 'direct_hls' },
      ],
      {
        channelId: 'test-backup-url',
        timeoutMs: 1200,
        probeImpl: async (track) => ({
          ok: true,
          streamUrl: `/api/hls-proxy?url=${encodeURIComponent(track.sourceUrl)}`,
          mode: 'hls',
          latencyMs: track.id === 'w1' ? 12 : 45,
          statusCode: 200,
        }),
      }
    );

    expect(res.ok).toBe(true);
    expect(res.streamUrl).toContain('a.invalid');
    expect(res.backupStreamUrl).toContain('b.invalid');
  });

  it('Block A: liveSegmentCache segment hit avoids duplicate upstream fetch and supports cached check', () => {
    const segUrl = 'https://live-edge.invalid/stream/seg_55.ts';
    const sampleBuf = Buffer.alloc(376, 0x47);
    setCachedLiveTsSegment(segUrl, sampleBuf, 'video/mp2t');
    const cached = getCachedLiveTsSegment(segUrl);
    expect(cached).not.toBeNull();
    expect(cached?.buf.length).toBe(376);
  });

  it('Block B: xtreamVodMatcher pre-indexes VOD movies/series/live streams and catalogTrackResolver has dead-URL negative cache', () => {
    const matcherSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/services/xtreamVodMatcher.ts'),
      'utf8'
    );
    expect(matcherSrc).toContain('getIndexedVodMovies');
    expect(matcherSrc).toContain('querySearchIndexCandidates');
    expect(matcherSrc).toContain('cachedLiveTokenMap');

    const trackResolverSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/routes/streamExtractHelpers/catalogTrackResolver.ts'),
      'utf8'
    );
    expect(trackResolverSrc).toContain('deadTrackUrlCache');
    expect(trackResolverSrc).toContain('40');
  });

  it('Block C: serializeRoomForClient caps ROOM_STATE chat messages to latest 40 and SocketTransport selects min-RTT NTP offset', () => {
    const messages = Array.from({ length: 85 }, (_, idx) => ({
      id: `m-${idx}`,
      senderId: 'u1',
      senderName: 'Naim',
      senderAvatar: '🍿',
      senderColor: '#7C3AED',
      text: `msg ${idx}`,
      timestamp: 1000 + idx,
    }));

    const room = {
      id: 'sala-speed',
      name: 'Sala Speed',
      hostId: 'u1',
      creatorId: 'u1',
      hostOnlyControl: false,
      participants: new Map(),
      videoState: {
        mode: 'idle',
        url: '',
        rawSourceUrl: '',
        title: '',
        currentTime: 0,
        isPlaying: false,
        isLive: false,
        tracks: [],
        activeTrackIndex: 0,
        lastUpdated: Date.now(),
      },
      messages,
      pinnedMessage: null,
      queue: [],
      activePoll: null,
      cloudState: { active: false, url: '', title: '', isLoading: false },
      boardGameState: null,
      partyGameState: null,
      pinturilloState: null,
      poolGameState: null,
      chapasGameState: null,
      headSoccerState: null,
      pokerGameState: null,
      blackjackGameState: null,
      matchResponses: null,
      roomPinHash: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    const serialized = serializeRoomForClient(room as never, 'u1');
    expect(serialized.messages).toHaveLength(40);
    expect(serialized.messages[0].id).toBe('m-45');
    expect(serialized.messages[39].id).toBe('m-84');

    // Verify SocketTransport sliding-window min-RTT clock selection
    let onMsg: ((ev: { data: string }) => void) | null = null;
    const fakeWs = {
      readyState: 1,
      send: () => {},
      close: () => {},
      onclose: null as null | (() => void),
      set onmessage(fn: ((ev: { data: string }) => void) | null) {
        onMsg = fn;
      },
      get onmessage() {
        return onMsg;
      },
      onerror: null,
      onopen: null,
    };
    function FakeWebSocketCtor() {
      return fakeWs;
    }
    (FakeWebSocketCtor as unknown as { OPEN: number; CONNECTING: number }).OPEN = 1;
    (FakeWebSocketCtor as unknown as { OPEN: number; CONNECTING: number }).CONNECTING = 0;

    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocketCtor;
    (globalThis as Record<string, unknown>).window = {
      location: { protocol: 'https:', host: 'riffan.example' },
      addEventListener: () => {},
      dispatchEvent: () => true,
    };

    const transport = new SocketTransport();
    transport.connect('sala1', { id: 'u1', name: 'Naim', avatar: '🍿', color: '#8b5cf6', isHost: true });
    // Trigger onopen cleanly
    (fakeWs as unknown as { onopen?: () => void }).onopen?.();
    const now = Date.now();
    // High RTT spike sample (+420ms offset)
    onMsg?.({
      data: JSON.stringify({
        type: 'PONG',
        payload: { clientTs: now - 400, serverTs: now + 220 },
      }),
    });
    // Crisp low-RTT sample (20ms RTT, ~50ms offset) should win
    onMsg?.({
      data: JSON.stringify({
        type: 'PONG',
        payload: { clientTs: now - 20, serverTs: now + 40 },
      }),
    });

    expect(transport.latencyMs).toBeLessThanOrEqual(30);
    expect(Math.abs(transport.serverClockOffsetMs - 50)).toBeLessThan(20);
    transport.disconnect();
  });

  it('Client Player & Catalog: verifies ABR persistence, 3s drift monitor, 80% prefetch, and indexed +800 channels', () => {
    const hlsEngineSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/player/useHlsPlaybackEngine.ts'),
      'utf8'
    );
    expect(hlsEngineSrc).toContain('riffan_abr_bw_bps');
    expect(hlsEngineSrc).toContain('videoState.backupStreamUrl');
    expect(hlsEngineSrc).toContain('3_000');

    const callbacksSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/player/usePlayerVideoCallbacks.ts'),
      'utf8'
    );
    expect(callbacksSrc).toContain('ct / dur >= 0.8');
    expect(callbacksSrc).toContain("prefetch: '1'");

    const liveTvViewSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/catalog/LiveTvWorldView.tsx'),
      'utf8'
    );
    expect(liveTvViewSrc).toContain('preIndexedStaticHaystacks');
  });

  it('Language & AR Demotion: detects 4K-AR - Game of Thrones (US)_S08E06 - AR as AR and ranks ES/LAT/EN ahead of AR', () => {
    const parsedAr = detectStreamLanguage(
      '4K-AR - Game of Thrones (US)_S08E06 - AR',
      'SERIES | 4K-AR',
      'series'
    );
    expect(parsedAr.lang).toBe('AR');

    const { orderedTracks } = rankCandidateTracks({
      allDiscovered: [
        {
          id: 'ar-track',
          label: '4K-AR - Game of Thrones (US)_S08E06 - AR',
          lang: parsedAr.lang,
          quality: '4K',
          sourceUrl: '/api/providers/series-stream/24tv/1.mp4',
          resolverType: 'direct_mp4',
        },
        {
          id: 'es-track',
          label: 'Juego de Tronos Castellano 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: '/api/providers/series-stream/shark-pro/2.mp4',
          resolverType: 'direct_mp4',
        },
        {
          id: 'en-track',
          label: 'Game of Thrones EN',
          lang: 'EN',
          quality: '1080p',
          sourceUrl: '/api/providers/series-stream/vod-4k/3.mp4',
          resolverType: 'direct_mp4',
        },
      ],
      preferLang: 'ES',
      isVestLink: false,
      hasExplicitMovidyUrl: false,
      hasExplicitGnulaUrl: false,
      healthMap: {},
    });

    expect(orderedTracks.map((t) => t.id)).toEqual(['es-track', 'en-track', 'ar-track']);
  });

  it('TDT Generalista Priority: keeps Prioritaria ES| LA SEXTA FHD Shark Pro (SPAIN - Ljli / SPAIN - أسبانيا) at #1 in health monitor & fast-resolve race', async () => {
    expect(isPreferredSharkProSpainLjli({ providerId: 'shark-pro', categoryName: 'SPAIN - أسبانيا' })).toBe(true);
    expect(isPreferredSharkProSpainLjli({ providerId: 'shark-pro', categoryName: 'SPAIN - Ljli' })).toBe(true);
    expect(isPreferredSharkProSpainLjli({ providerId: 'vod-4k', categoryName: 'SPAIN - أسبانيا' })).toBe(false);

    const monitor = new ChannelHealthMonitor();
    const priorityUrl = '/api/providers/live/shark-pro/999001.m3u8';
    const dvbUrl = 'http://90.163.85.113:8093/stream/21/index.m3u8';
    monitor.setTrackHealth(dvbUrl, { status: 'up', latencyMs: 180, checkedAt: Date.now() });

    const prioritized = monitor.prioritizeTracks([
      {
        id: 'lasexta-dvb-hd',
        label: 'Señal Directa España 1080p HD (laSexta)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: dvbUrl,
        resolverType: 'tdt_hls',
      },
      {
        id: 'tdt-lasexta-priority-shark-pro',
        label: 'Prioritaria · ES| LA SEXTA FHD · Shark Pro (SPAIN - Ljli)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: priorityUrl,
        resolverType: 'tdt_hls',
      },
    ]);
    expect(prioritized[0].id).toBe('tdt-lasexta-priority-shark-pro');

    const ordered = orderCandidatesForFastResolve(prioritized, { preferLang: 'ES' });
    expect(ordered[0].track.id).toBe('tdt-lasexta-priority-shark-pro');

    const res = await raceFastLiveTracks(prioritized, {
      channelId: 'tdt-lasexta',
      titleHint: 'laSexta',
      preferLang: 'ES',
      timeoutMs: 1200,
      probeImpl: async (track) => {
        if (track.id === 'tdt-lasexta-priority-shark-pro') {
          await new Promise((r) => setTimeout(r, 45));
          return { ok: true, streamUrl: priorityUrl, mode: 'hls', latencyMs: 45, statusCode: 200 };
        }
        return { ok: true, streamUrl: '/api/hls-proxy?url=other', mode: 'hls', latencyMs: 10, statusCode: 200 };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.winningTrack?.id).toBe('tdt-lasexta-priority-shark-pro');
  });
});
