import { describe, expect, it } from 'vitest';
import {
  ChannelHealthMonitor,
  probeChannelTrack,
  type FetchLike,
} from '../server/services/channelHealthMonitor.ts';

describe('channelHealthMonitor', () => {
  it('marks valid #EXTM3U HLS stream as up when latency is fast', async () => {
    const mockFetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => '#EXTM3U\n#EXT-X-VERSION:3\n',
    });

    const res = await probeChannelTrack(
      {
        sourceUrl: 'https://cdn.example.com/live/master.m3u8',
        resolverType: 'tdt_hls',
      },
      { fetchImpl: mockFetch }
    );

    expect(res.status).toBe('up');
    expect(res.failCount).toBe(0);
    expect(res.statusCode).toBe(200);
    expect(typeof res.latencyMs).toBe('number');
  });

  it('marks HLS response without #EXTM3U or HTTP 500 as down and increments failCount', async () => {
    const badBodyFetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => '<html>Maintenance</html>',
    });

    const res1 = await probeChannelTrack(
      {
        sourceUrl: 'https://cdn.example.com/broken.m3u8',
        resolverType: 'tdt_hls',
      },
      { fetchImpl: badBodyFetch }
    );
    expect(res1.status).toBe('down');
    expect(res1.failCount).toBe(1);

    const errFetch: FetchLike = async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    });

    const res2 = await probeChannelTrack(
      {
        sourceUrl: 'https://cdn.example.com/broken.m3u8',
        resolverType: 'tdt_hls',
      },
      { fetchImpl: errFetch, previous: res1 }
    );
    expect(res2.status).toBe('down');
    expect(res2.failCount).toBe(2);
  });

  it('checks sports_channel HTTP status and cancels body without buffering full HTML', async () => {
    let canceled = false;
    const mockFetch: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => 'should-not-read',
      body: {
        cancel: async () => {
          canceled = true;
        },
      },
    });

    const res = await probeChannelTrack(
      {
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
      { fetchImpl: mockFetch }
    );

    expect(canceled).toBe(true);
    expect(res.status).toBe('up');
  });

  it('prioritizes up -> degraded -> unknown -> down and sorts by lower latency', async () => {
    const monitor = new ChannelHealthMonitor();

    monitor.setTrackHealth('https://stream.example.com/down.m3u8', {
      status: 'down',
      latencyMs: 300,
      failCount: 3,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('https://stream.example.com/slow-up.m3u8', {
      status: 'up',
      latencyMs: 900,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('https://stream.example.com/degraded.m3u8', {
      status: 'degraded',
      latencyMs: 2400,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth('https://stream.example.com/fast-up.m3u8', {
      status: 'up',
      latencyMs: 120,
      failCount: 0,
      checkedAt: Date.now(),
    });

    const [prioritized] = monitor.prioritizeChannels([
      {
        id: 'ch-test',
        name: 'Test Channel',
        channels: [
          {
            id: 't1',
            label: 'Down',
            lang: 'ES',
            sourceUrl: 'https://stream.example.com/down.m3u8',
            resolverType: 'tdt_hls',
          },
          {
            id: 't2',
            label: 'Unknown',
            lang: 'ES',
            sourceUrl: 'https://stream.example.com/unprobed.m3u8',
            resolverType: 'tdt_hls',
          },
          {
            id: 't3',
            label: 'Slow Up',
            lang: 'ES',
            sourceUrl: 'https://stream.example.com/slow-up.m3u8',
            resolverType: 'tdt_hls',
          },
          {
            id: 't4',
            label: 'Degraded',
            lang: 'ES',
            sourceUrl: 'https://stream.example.com/degraded.m3u8',
            resolverType: 'tdt_hls',
          },
          {
            id: 't5',
            label: 'Fast Up',
            lang: 'ES',
            sourceUrl: 'https://stream.example.com/fast-up.m3u8',
            resolverType: 'tdt_hls',
          },
        ],
      },
    ]);

    expect(prioritized.channels.map((c) => c.id)).toEqual(['t5', 't3', 't4', 't2', 't1']);
    expect(prioritized.healthSummary).toEqual({
      bestStatus: 'up',
      upCount: 2,
      totalCount: 5,
      bestLatencyMs: 120,
    });
  });

  it('deduplicates repeated URLs across channels during runSweep', async () => {
    const monitor = new ChannelHealthMonitor();
    const probedUrls: string[] = [];

    const mockFetch: FetchLike = async (input) => {
      probedUrls.push(String(input));
      return {
        ok: true,
        status: 200,
        text: async () => '#EXTM3U\n',
      };
    };

    await monitor.runSweep(
      [
        {
          id: 'c1',
          channels: [
            {
              id: 'a',
              label: 'A',
              lang: 'ES',
              sourceUrl: 'https://cdn.example.com/shared.m3u8?profile=hd',
              resolverType: 'tdt_hls',
            },
          ],
        },
        {
          id: 'c2',
          channels: [
            {
              id: 'b',
              label: 'B',
              lang: 'ES',
              sourceUrl: 'https://cdn.example.com/shared.m3u8?profile=fast',
              resolverType: 'tdt_hls',
            },
          ],
        },
      ],
      { fetchImpl: mockFetch, force: true }
    );

    expect(probedUrls).toHaveLength(1);
    expect(monitor.getSummary().counts.up).toBe(1);
  });
});
