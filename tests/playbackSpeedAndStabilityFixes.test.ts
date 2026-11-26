import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { resolveOrderedCandidateTracks } from '../server/routes/streamExtractHelpers/catalogTrackResolver.ts';
import { buildDvbLiveFfmpegArgs } from '../server/routes/proxies/dvbCodecProbe.ts';
import { needsBrowserVodRemux } from '../server/services/xtreamVodRemuxer.ts';
import { raceFastLiveTracks } from '../server/services/liveFastResolver.ts';
import { createLivePlaybackHealthMonitor } from '../src/components/player/hlsHealthWatchdog.ts';
import { isInstantDirectMultiStream } from '../src/hooks/playback/multiScreenHelpers.ts';

describe('Ultra-fast playback startup & stall elimination across Web, Android, webOS, and Tizen', () => {
  it('picks immediately resolved native candidate in 0ms without probing slower unresolved mirrors', async () => {
    const start = Date.now();
    const res = await resolveOrderedCandidateTracks({
      orderedTracks: [
        {
          id: 'vidhide-slow-1',
          label: 'VidHide Mirror 1',
          lang: 'ES',
          sourceUrl: 'https://example.invalid/unresolved-vidhide',
          resolverType: 'vidhide_hls',
        },
        {
          id: 'xtream-instant-es',
          label: 'Xtream Castellano FHD',
          lang: 'ES',
          sourceUrl: '/api/providers/stream/vod4k/movie/4455.mp4',
          resolvedStreamUrl: '/api/providers/stream/vod4k/movie/4455.mp4',
          resolverType: 'direct_mp4',
        },
      ],
      getLangScore: () => 0,
      sourcePriority: () => 1,
      getTrackHealthScore: () => 100,
      isSandboxedFrame: false,
      directOnly: false,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(150);
    expect(res?.primaryMode).toBe('direct');
    expect(res?.primaryStreamUrl).toBe('/api/providers/stream/vod4k/movie/4455.mp4');
  });

  it('always applies -tune zerolatency for libx264 DVB/Xtream encodes across hd, iptv, and fast profiles while keeping -hls_init_time 1 -hls_time 2', () => {
    for (const profile of ['hd', 'iptv', 'fast'] as const) {
      const args = buildDvbLiveFfmpegArgs({
        cleanUpstream: 'http://1.sharkpro.ink:80/live/u/p/743056.ts',
        referer: 'http://1.sharkpro.ink/',
        profile,
        isXtreamLive: true,
        playlistPath: '/tmp/live/index.m3u8',
        segmentPattern: '/tmp/live/seg_%05d.ts',
        probe: null,
      });
      const joined = args.join(' ');
      expect(joined).toContain('-c:v libx264');
      expect(joined).toContain('-tune zerolatency');
      expect(joined).toMatch(/-hls_init_time (?:0\.5|1) -hls_time (?:1\.5|2)/);
    }
  });

  it('flags MKV/AVI/TS/FLV and ?transcode=1 VOD files for browser fMP4 remuxing', () => {
    expect(needsBrowserVodRemux('mkv')).toBe(true);
    expect(needsBrowserVodRemux('avi')).toBe(true);
    expect(needsBrowserVodRemux('mp4', false)).toBe(false);
    expect(needsBrowserVodRemux('mp4', true)).toBe(true);

    const providersSvcSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/services/providers/xtreamProvidersService.ts'),
      'utf8'
    );
    expect(providersSvcSrc).toContain('needsBrowserVodRemux');
    expect(providersSvcSrc).toContain('streamVodRemuxedAsMp4');
    expect(providersSvcSrc).toContain("req.query.transcode === '1'");

    const vodRemuxerSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/services/xtreamVodRemuxer.ts'),
      'utf8'
    );
    expect(vodRemuxerSrc).toContain('audioNeedsTranscodeOnly');
  });

  it('detects 0s black-screen startup hang in hlsHealthWatchdog while preserving normal stall recovery cadence', () => {
    const monitor = createLivePlaybackHealthMonitor();
    const stuckZeroVideo = {
      paused: false,
      readyState: 1,
      currentTime: 0,
      videoWidth: 0,
      videoHeight: 0,
      getVideoPlaybackQuality: undefined,
    } as unknown as HTMLVideoElement;

    expect(monitor.check(stuckZeroVideo, 1000).action).toBe('healthy');
    expect(monitor.check(stuckZeroVideo, 5600).action).toBe('recover_signal');
    expect(monitor.check(stuckZeroVideo, 9200).action).toBe('switch_backup');
  });

  it('aligns server liveFastResolver window (3800ms) with Web, TV, and Champions Multi fast-resolve timeouts (>= 4200ms)', async () => {
    const fastResolverSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/services/liveFastResolver.ts'),
      'utf8'
    );
    expect(fastResolverSrc).toContain('opts.timeoutMs ?? 3_800');

    const liveQueueSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/hooks/playback/useLiveAndQueuePlayback.ts'),
      'utf8'
    );
    expect(liveQueueSrc).toContain('4600');

    const tvModesSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'public/tv/tv-player-modes.js'),
      'utf8'
    );
    expect(tvModesSrc).toContain('4600');

    const tvMultiSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'public/tv/tv-champions-multi.js'),
      'utf8'
    );
    expect(tvMultiSrc).toContain('4200');
    expect(tvMultiSrc).toContain('FRAG_BUFFERED');

    expect(isInstantDirectMultiStream('/api/providers/stream/vod4k/live/10.m3u8', 'tdt_hls')).toBe(
      true
    );
    expect(isInstantDirectMultiStream('/api/belix/stream/531071.m3u8', 'tdt_hls')).toBe(true);

    const raceOutcome = await raceFastLiveTracks(
      [
        {
          id: 'slow-1',
          label: 'Slow Mirror',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://slow.invalid/1.m3u8',
        },
        {
          id: 'fast-2',
          label: 'Fast Mirror',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://fast.invalid/2.m3u8',
        },
      ],
      {
        channelId: 'test-aligned-timeout',
        probeImpl: async (track) => {
          if (track.id === 'slow-1') {
            return new Promise((resolve) =>
              setTimeout(
                () => resolve({ ok: false, streamUrl: '', mode: 'hls', latencyMs: 320 }),
                300
              )
            );
          }
          return { ok: true, streamUrl: track.sourceUrl, mode: 'hls', latencyMs: 15 };
        },
      }
    );
    expect(raceOutcome.ok).toBe(true);
    expect(raceOutcome.winningTrack?.id).toBe('fast-2');
  });

  it('wires ?transcode=1 retry across both Web player and Tizen/webOS Smart TV core (ES5-strict) and bundles tv-champions-multi.js', () => {
    const webEngineSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/player/useHlsPlaybackEngine.ts'),
      'utf8'
    );
    expect(webEngineSrc).toContain('/^\\/api\\/(?:stream|xtream\\/vod\\/|providers\\/stream\\/)/i');
    expect(webEngineSrc).toContain('5_500');
    expect(webEngineSrc).toContain('genuinelyStarved');

    const tvCoreSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'public/tv/tv-player-core.js'),
      'utf8'
    );
    expect(tvCoreSrc).toContain('tryTvDirectTranscodeRetry');
    expect(tvCoreSrc).toContain('videoZeroStartupAt');

    const tizenRoutesSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/routes/tizenRoutes.ts'),
      'utf8'
    );
    expect(tizenRoutesSrc).toContain("'tv/tv-champions-multi.js'");

    const tvDir = path.resolve(process.cwd(), 'public/tv');
    for (const file of fs.readdirSync(tvDir)) {
      if (!file.endsWith('.js')) continue;
      const content = fs.readFileSync(path.join(tvDir, file), 'utf8');
      expect(() => new vm.Script(content, { filename: file })).not.toThrow();
      expect(content).not.toMatch(/`|\b(?:let|const)\b\s+[A-Za-z_$]|=>|\.roundRect\b/);
    }
  });
});
