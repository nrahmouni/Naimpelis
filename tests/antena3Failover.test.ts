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

describe('Antena 3 & Foreign TDT Failover Architecture', () => {
  it('unwraps /api/hls-proxy and extracts shared upstream host keys cleanly', () => {
    const rawDvb = 'http://90.163.85.113:8093/stream/20/index.m3u8';
    const fastDvb = 'http://90.163.85.113:8093/stream/20/index.m3u8?profile=fast';
    const proxiedDvb =
      '/api/hls-proxy?url=http%3A%2F%2F90.163.85.113%3A8093%2Fstream%2F20%2Findex.m3u8&aac=1';
    const belixUrl = '/api/belix/stream/743023.m3u8';

    expect(extractTrackHostKey(rawDvb)).toBe('http://90.163.85.113:8093');
    expect(extractTrackHostKey(fastDvb)).toBe('http://90.163.85.113:8093');
    expect(extractTrackHostKey(proxiedDvb)).toBe('http://90.163.85.113:8093');
    expect(extractTrackHostKey(belixUrl)).toBe('belix://xtream');
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

  it('propagates /api/hls-proxy health state so down DVB host skips proxied DVB duplicates', () => {
    const monitor = new ChannelHealthMonitor();
    monitor.setTrackHealth('http://90.163.85.113:8093/stream/20/index.m3u8', {
      status: 'down',
      statusCode: 502,
      latencyMs: 0,
      failCount: 3,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/743023.m3u8', {
      status: 'up',
      latencyMs: 120,
      failCount: 0,
      checkedAt: Date.now(),
    });

    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const [prioritized] = monitor.prioritizeChannels([a3]);
    expect(prioritized.channels[0]?.sourceUrl).toBe('/api/belix/stream/743023.m3u8');
    // Both direct DVB and /api/hls-proxy wrapping 90.163.85.113:8093 should sort below up Belix
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

  it('keeps Belix Antena 3 AAC HD track first when connected and omits when explicitly disabled', () => {
    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const withBelix = applySyncedStreamsToChannels([a3], true);
    expect(withBelix[0]?.channels[0]?.sourceUrl).toBe('/api/belix/stream/743056.m3u8');
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

  it('keeps Antena 3 AAC HD (743056) ahead of 743023 and 90.163.85.113 even when all are up', () => {
    const monitor = new ChannelHealthMonitor();
    monitor.setTrackHealth('/api/belix/stream/743056.m3u8', {
      status: 'up',
      latencyMs: 1,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/742969.m3u8', {
      status: 'up',
      latencyMs: 1,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/743023.m3u8', {
      status: 'up',
      latencyMs: 1,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('/api/belix/stream/531071.m3u8', {
      status: 'up',
      latencyMs: 1,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('http://90.163.85.113:8093/stream/20/index.m3u8', {
      status: 'up',
      latencyMs: 180,
      failCount: 0,
      checkedAt: Date.now(),
    });

    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const [prioritized] = monitor.prioritizeChannels([a3]);
    expect(prioritized.channels.slice(0, 3).map((t) => t.sourceUrl)).toEqual([
      '/api/belix/stream/743056.m3u8',
      '/api/belix/stream/743023.m3u8',
      '/api/belix/stream/531071.m3u8',
    ]);
  });

  it('includes Antena 3 Edge-2 Intl FHD (531071) fallback on tdt-antena3', () => {
    const a3 = TDT_NATIONAL_AND_PAY_CHANNELS.find((c) => c.id === 'tdt-antena3')!;
    const belixUrls = a3.channels
      .map((c) => c.sourceUrl)
      .filter((u) => u.startsWith('/api/belix/stream/'));
    expect(belixUrls.slice(0, 4)).toEqual([
      '/api/belix/stream/743056.m3u8',
      '/api/belix/stream/743023.m3u8',
      '/api/belix/stream/531071.m3u8',
      '/api/belix/stream/742969.m3u8',
    ]);
  });
});
