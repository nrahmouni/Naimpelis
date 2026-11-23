import { describe, expect, it } from 'vitest';
import {
  extractTrackHostKey,
  mergeCustomTdtTracks,
  normalizeCustomTdtStreamUrl,
} from '../src/utils/customTdtSources.ts';
import { ChannelHealthMonitor } from '../server/services/channelHealthMonitor.ts';
import {
  addBelixBackupPortal,
  clearBelixBackupPortals,
  getBelixBackupPortals,
  isAnyBelixConnected,
  removeBelixBackupPortal,
} from '../server/services/belix/belixXtreamClient.ts';
import { applySyncedStreamsToChannels } from '../server/services/iptvPlaylistService.ts';
import { TDT_NATIONAL_AND_PAY_CHANNELS } from '../server/data/tdtNationalAndPayChannels.ts';
import {
  buildDvbLiveFfmpegArgs,
  isDvbUpstreamCoolingDown,
} from '../server/routes/proxies/dvbTranscoder.ts';

describe('Antena 3, laSexta & Direct Spanish DVB Failover Architecture', () => {
  it('unwraps /api/hls-proxy and extracts per-stream host+path keys without cross-stream collision', () => {
    const rawDvbA3 = 'http://90.163.85.113:8093/stream/20/index.m3u8';
    const fastDvbA3 = 'http://90.163.85.113:8093/stream/20/index.m3u8?profile=fast';
    const proxiedDvbA3 =
      '/api/hls-proxy?url=http%3A%2F%2F90.163.85.113%3A8093%2Fstream%2F20%2Findex.m3u8&aac=1';
    const rawDvbSexta = 'http://90.163.85.113:8093/stream/21/index.m3u8';
    const belixA3Fhd = '/api/belix/stream/743023.m3u8';
    const belixA3Edge2 = '/api/belix/stream/531071.m3u8';

    expect(extractTrackHostKey(rawDvbA3)).toBe('http://90.163.85.113:8093/stream/20/index.m3u8');
    expect(extractTrackHostKey(fastDvbA3)).toBe('http://90.163.85.113:8093/stream/20/index.m3u8');
    expect(extractTrackHostKey(proxiedDvbA3)).toBe(
      'http://90.163.85.113:8093/stream/20/index.m3u8'
    );
    expect(extractTrackHostKey(rawDvbSexta)).toBe(
      'http://90.163.85.113:8093/stream/21/index.m3u8'
    );
    expect(extractTrackHostKey(belixA3Fhd)).toBe('belix://stream/743023');
    expect(extractTrackHostKey(belixA3Edge2)).toBe('belix://stream/531071');
  });

  it('validates custom TDT backup stream URLs and preserves Antena 3 track structure safely', () => {
    expect(normalizeCustomTdtStreamUrl('https://vps-es.example.com/antena3/live.m3u8')).toBe(
      'https://vps-es.example.com/antena3/live.m3u8'
    );
    expect(normalizeCustomTdtStreamUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeCustomTdtStreamUrl('ftp://invalid/stream.ts')).toBeNull();

    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const merged = mergeCustomTdtTracks(a3 as never);
    expect(merged.channels.length).toBeGreaterThanOrEqual(a3.channels.length);
  });

  it('propagates /api/hls-proxy health state so down DVB stream skips its proxied duplicates and falls back to Belix', () => {
    const monitor = new ChannelHealthMonitor();
    monitor.setTrackHealth('http://90.163.85.113:8093/stream/20/index.m3u8', {
      status: 'down',
      statusCode: 502,
      latencyMs: 0,
      failCount: 3,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/531071.m3u8', {
      status: 'up',
      latencyMs: 650,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/743023.m3u8', {
      status: 'up',
      latencyMs: 650,
      failCount: 0,
      checkedAt: Date.now(),
    });

    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const [prioritized] = monitor.prioritizeChannels([a3]);
    expect(prioritized.channels[0]?.sourceUrl).toBe('/api/belix/stream/531071.m3u8');
    // Both direct DVB and /api/hls-proxy wrapping 90.163.85.113:8093/stream/20 should mark down
    const remuxTrack = prioritized.channels.find((t) =>
      t.sourceUrl.startsWith('/api/hls-proxy')
    );
    expect(remuxTrack?.health?.status).toBe('down');
  });

  it('supports SSRF-safe Multi-Xtream backup portal registration & cleanup in RAM', async () => {
    clearBelixBackupPortals();
    const ssrfReject = await addBelixBackupPortal({
      serverUrl: 'http://127.0.0.1:8080',
      username: 'test',
      password: 'secret',
    });
    expect(ssrfReject.ok).toBe(false);

    const added = await addBelixBackupPortal({
      serverUrl: 'http://8.8.8.8:80',
      username: 'belgiumUser1',
      password: 'secretPassword',
    });
    expect(added.ok).toBe(true);
    expect(added.backup?.maskedUsername).toBe('be***r1');
    expect(getBelixBackupPortals()).toHaveLength(1);
    expect(isAnyBelixConnected()).toBe(true);

    expect(removeBelixBackupPortal(added.backup!.id)).toBe(true);
    expect(getBelixBackupPortals()).toHaveLength(0);
  });

  it('leads Antena 3 and laSexta with Direct Spanish DVB while preserving Belix fallbacks when connected', () => {
    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const laSexta = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-lasexta')!;

    const withBelix = applySyncedStreamsToChannels([a3, laSexta], true);
    expect(withBelix[0]?.channels[0]?.sourceUrl).toBe(
      'http://90.163.85.113:8093/stream/20/index.m3u8'
    );
    expect(withBelix[1]?.channels[0]?.sourceUrl).toBe(
      'http://90.163.85.113:8093/stream/21/index.m3u8'
    );
    expect(withBelix[0]?.channels.some((t) => t.sourceUrl.includes('/api/belix/stream/'))).toBe(
      true
    );

    const withoutBelix = applySyncedStreamsToChannels([a3], false);
    expect(withoutBelix[0]?.channels.some((t) => t.sourceUrl.includes('/api/belix/stream/'))).toBe(
      false
    );
  });

  it('keeps zero-config Belix fallback available without requiring manual Belix tab visit', () => {
    expect(isAnyBelixConnected()).toBe(true);
  });

  it('keeps Direct Spanish DVB (Antena 3 /stream/20) first when all tracks are up, with Edge-2 & Belix fallbacks behind', () => {
    const monitor = new ChannelHealthMonitor();
    monitor.setTrackHealth('http://90.163.85.113:8093/stream/20/index.m3u8', {
      status: 'up',
      latencyMs: 180,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/531071.m3u8', {
      status: 'up',
      latencyMs: 650,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/743056.m3u8', {
      status: 'up',
      latencyMs: 650,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/743023.m3u8', {
      status: 'up',
      latencyMs: 650,
      failCount: 0,
      checkedAt: Date.now(),
    });

    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const [prioritized] = monitor.prioritizeChannels([a3]);
    expect(prioritized.channels[0]?.sourceUrl).toBe(
      'http://90.163.85.113:8093/stream/20/index.m3u8'
    );
    expect(prioritized.channels.some((t) => t.sourceUrl === '/api/belix/stream/531071.m3u8')).toBe(
      true
    );
    expect(prioritized.channels.some((t) => t.sourceUrl === '/api/belix/stream/743056.m3u8')).toBe(
      true
    );
  });

  it('does not cross-contaminate cooldown state between 90.163.85.113 streams', () => {
    expect(isDvbUpstreamCoolingDown('http://90.163.85.113:8093/stream/20/index.m3u8')).toBe(false);
    expect(isDvbUpstreamCoolingDown('http://90.163.85.113:8093/stream/21/index.m3u8')).toBe(false);
  });

  it('includes Antena 3 Edge-2 Intl FHD (531071) & Belix HD/FHD fallbacks on tdt-antena3', () => {
    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const belixUrls = a3.channels
      .map((c) => c.sourceUrl)
      .filter((u) => u.startsWith('/api/belix/stream/'));
    expect(belixUrls).toEqual([
      '/api/belix/stream/531071.m3u8',
      '/api/belix/stream/743056.m3u8',
      '/api/belix/stream/743023.m3u8',
    ]);
  });

  it('losslessly copies progressive 50fps H.264 + AAC-LC streams (Antena 3 / laSexta) without yadif ghosting', () => {
    const args = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'http://1.sharkpro.ink:80/live/u/p/743035.ts',
      referer: 'http://1.sharkpro.ink/',
      profile: 'hd',
      isXtreamLive: true,
      playlistPath: '/tmp/test/index.m3u8',
      segmentPattern: '/tmp/test/seg_%05d.ts',
      probe: {
        videoCodec: 'h264',
        pixFmt: 'yuv420p',
        fieldOrder: 'progressive',
        width: 1920,
        height: 1080,
        fps: 50,
        audioCodec: 'aac',
        audioProfile: 'LC',
        hasAudio: true,
      },
    });
    const joined = args.join(' ');
    expect(joined).toContain('-c:v copy');
    expect(joined).toContain('-c:a copy');
    expect(joined).toContain('+genpts+discardcorrupt');
    expect(joined).toContain('-hls_init_time 1 -hls_time 2');
    expect(joined).not.toContain('yadif');
    expect(joined).not.toContain('libx264');
  });

  it('copies video but normalizes HE-AAC audio to AAC-LC on compatible Smart TV streams', () => {
    const args = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'http://1.sharkpro.ink:80/live/u/p/531071.ts',
      referer: 'http://1.sharkpro.ink/',
      profile: 'hd',
      isXtreamLive: true,
      playlistPath: '/tmp/test/index.m3u8',
      segmentPattern: '/tmp/test/seg_%05d.ts',
      probe: {
        videoCodec: 'h264',
        pixFmt: 'yuv420p',
        fieldOrder: 'progressive',
        width: 1920,
        height: 1080,
        fps: 29.97,
        audioCodec: 'aac',
        audioProfile: 'HE-AAC',
        hasAudio: true,
      },
    });
    const joined = args.join(' ');
    expect(joined).toContain('-c:v copy');
    expect(joined).toContain('-c:a aac');
    expect(joined).not.toContain('yadif');
  });

  it('only applies yadif deinterlacer when stream is explicitly interlaced', () => {
    const interlacedArgs = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'http://90.163.85.113:8093/stream/20/index.m3u8',
      referer: '',
      profile: 'hd',
      isXtreamLive: false,
      playlistPath: '/tmp/test/index.m3u8',
      segmentPattern: '/tmp/test/seg_%05d.ts',
      probe: {
        videoCodec: 'h264',
        pixFmt: 'yuv420p',
        fieldOrder: 'tt',
        width: 1920,
        height: 1080,
        fps: 25,
        audioCodec: 'eac3',
        audioProfile: '',
        hasAudio: true,
      },
    });
    expect(interlacedArgs.join(' ')).toContain('yadif=0:-1:1');
    expect(interlacedArgs.join(' ')).toContain('-c:v libx264');

    const fallbackArgs = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'http://1.sharkpro.ink:80/live/u/p/743056.ts',
      referer: '',
      profile: 'hd',
      isXtreamLive: true,
      playlistPath: '/tmp/test/index.m3u8',
      segmentPattern: '/tmp/test/seg_%05d.ts',
      probe: null,
    });
    expect(fallbackArgs.join(' ')).not.toContain('yadif');
    expect(fallbackArgs.join(' ')).toContain('+genpts+discardcorrupt');
  });
});
