import { describe, expect, it } from 'vitest';
import type express from 'express';
import {
  rewriteManifestForSamsungIptv,
  trimLiveDvrManifestForIptv,
} from '../server/routes/iptvHelpers/iptvMediaHelpers.ts';
import { ChannelHealthMonitor } from '../server/services/channelHealthMonitor.ts';
import { buildDvbSessionKey } from '../server/routes/proxies/dvbTranscoder.ts';
import {
  markHostNeedsCurlFallback,
  shouldBypassNodeFetch,
} from '../server/extractors/httpHelpers.ts';
import { formatExtractResponseForClient } from '../server/routes/streamExtractHelpers/externalSportsExtractor.ts';

describe('IPTV Media Helpers & Smart TV Compatibility', () => {
  it('trims oversized live DVR playlists while updating media and discontinuity sequences', () => {
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:5',
      '#EXT-X-PLAYLIST-TYPE:EVENT',
      '#EXT-X-MEDIA-SEQUENCE:6200',
      '#EXT-X-DISCONTINUITY-SEQUENCE:2',
    ];
    for (let i = 0; i < 15; i++) {
      if (i === 3 || i === 12) {
        lines.push('#EXT-X-DISCONTINUITY');
      }
      lines.push('#EXTINF:5.0,');
      lines.push(`seg_${6200 + i}.ts`);
    }

    const trimmed = trimLiveDvrManifestForIptv(lines.join('\n'), 6);
    expect(trimmed).toContain('#EXT-X-MEDIA-SEQUENCE:6209');
    expect(trimmed).toContain('#EXT-X-DISCONTINUITY-SEQUENCE:3');
    expect(trimmed).not.toContain('#EXT-X-PLAYLIST-TYPE:EVENT');

    const segLines = trimmed
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#'));
    expect(segLines).toEqual([
      'seg_6209.ts',
      'seg_6210.ts',
      'seg_6211.ts',
      'seg_6212.ts',
      'seg_6213.ts',
      'seg_6214.ts',
    ]);
  });

  it('keeps VOD playlists (#EXT-X-ENDLIST) untouched', () => {
    const vod = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-MEDIA-SEQUENCE:0',
      ...Array.from({ length: 12 }, (_, i) => `#EXTINF:6.0,\nv_${i}.ts`),
      '#EXT-X-ENDLIST',
    ].join('\n');

    expect(trimLiveDvrManifestForIptv(vod, 6)).toBe(vod);
  });

  it('strips external WebVTT subtitle tracks and SUBTITLES attributes for Smart TV IPTV', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      '#EXT-X-STREAM-INF:BANDWIDTH=4128000,RESOLUTION=1920x1080,AUDIO="audio",SUBTITLES="subs"',
      'bitrate_3.m3u8',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Català",DEFAULT=YES,URI="bitrate_7.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Català",DEFAULT=NO,URI="bitrate_10.m3u8"',
    ].join('\n');

    const rewritten = rewriteManifestForSamsungIptv(
      master,
      'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8',
      'https://directes3-tv-int.3catdirectes.cat/',
      false,
      false,
      'https://riffantv.ai.studio'
    );

    expect(rewritten).not.toContain('TYPE=SUBTITLES');
    expect(rewritten).not.toContain('SUBTITLES="subs"');
    expect(rewritten).toContain('TYPE=AUDIO');
    expect(rewritten).toContain('bitrate_3.m3u8');
    expect(rewritten).toContain('bitrate_7.m3u8');
  });

  it('prefers verified HTTPS CDNs over raw DVB headend streams when both are healthy', () => {
    const monitor = new ChannelHealthMonitor();
    const dvbUrl = 'http://90.163.85.113:8093/stream/15/index.m3u8';
    const cdnUrl = 'https://play.cdn.enetres.net/091DB7AF/021/playlist.m3u8';

    monitor.setTrackHealth(dvbUrl, { status: 'up', latencyMs: 55, failCount: 0 });
    monitor.setTrackHealth(cdnUrl, { status: 'up', latencyMs: 420, failCount: 0 });

    const sorted = monitor.prioritizeTracks([
      { id: 'dvb', label: 'DVB', lang: 'ES', sourceUrl: dvbUrl, resolverType: 'tdt_hls' },
      { id: 'cdn', label: 'CDN', lang: 'ES', sourceUrl: cdnUrl, resolverType: 'tdt_hls' },
    ]);

    expect(sorted.map((t) => t.id)).toEqual(['cdn', 'dvb']);
  });

  it('unifies DVB relay session keys across hd, fast, iptv and raw URLs', () => {
    const base = 'http://90.163.85.113:8093/stream/20/index.m3u8';
    const keyBase = buildDvbSessionKey(base);
    expect(buildDvbSessionKey(`${base}?profile=fast`)).toBe(keyBase);
    expect(buildDvbSessionKey(`${base}?profile=hd`)).toBe(keyBase);
    expect(buildDvbSessionKey(`${base}?profile=iptv`)).toBe(keyBase);
  });

  it('never blacklists plain HTTP DVB headend hosts in tlsFallbackHostsCache', () => {
    const dvbUrl = 'http://90.163.85.113:8093/stream/41/index.m3u8';
    markHostNeedsCurlFallback(dvbUrl);
    expect(shouldBypassNodeFetch(dvbUrl)).toBe(false);
  });

  it('serializes DVB headend probes in runSweep so residential tuner is never flooded', async () => {
    const monitor = new ChannelHealthMonitor();
    let inFlightDvb = 0;
    let maxInFlightDvb = 0;

    await monitor.runSweep(
      [
        {
          id: 'ch-a3',
          channels: [
            {
              id: 'a3',
              label: 'A3',
              lang: 'ES',
              sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
              resolverType: 'tdt_hls',
            },
          ],
        },
        {
          id: 'ch-t5',
          channels: [
            {
              id: 't5',
              label: 'T5',
              lang: 'ES',
              sourceUrl: 'http://90.163.85.113:8093/stream/41/index.m3u8',
              resolverType: 'tdt_hls',
            },
          ],
        },
        {
          id: 'ch-cuatro',
          channels: [
            {
              id: 'cuatro',
              label: 'Cuatro',
              lang: 'ES',
              sourceUrl: 'http://90.163.85.113:8093/stream/42/index.m3u8',
              resolverType: 'tdt_hls',
            },
          ],
        },
      ],
      {
        concurrency: 8,
        fetchImpl: async () => {
          inFlightDvb += 1;
          maxInFlightDvb = Math.max(maxInFlightDvb, inFlightDvb);
          await new Promise((r) => setTimeout(r, 15));
          inFlightDvb -= 1;
          return {
            ok: true,
            status: 200,
            text: async () => '#EXTM3U\n#EXTINF:2.5,\nseg.ts\n',
          };
        },
      }
    );

    expect(maxInFlightDvb).toBe(1);
    expect(monitor.getTrackHealth('http://90.163.85.113:8093/stream/20/index.m3u8')?.status).toBe('up');
    expect(monitor.getTrackHealth('http://90.163.85.113:8093/stream/41/index.m3u8')?.status).toBe('up');
    expect(monitor.getTrackHealth('http://90.163.85.113:8093/stream/42/index.m3u8')?.status).toBe('up');
  });

  it('prefixes /api/dvb-live/ URLs when abs=1 is requested by Google TV or APK clients', () => {
    const req = {
      query: { abs: '1' },
      headers: {},
    } as unknown as express.Request;
    const out = formatExtractResponseForClient(
      req,
      {
        success: true,
        mode: 'hls',
        streamUrl: '/api/dvb-live/dvb_abc123/index.m3u8',
        expiresAt: Date.now() + 30_000,
      },
      () => 'https://riffantv.ai.studio'
    );
    expect(out.streamUrl).toBe('https://riffantv.ai.studio/api/dvb-live/dvb_abc123/index.m3u8');
  });
});
