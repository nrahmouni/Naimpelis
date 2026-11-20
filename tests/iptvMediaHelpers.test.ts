import { describe, expect, it } from 'vitest';
import {
  rewriteManifestForSamsungIptv,
  trimLiveDvrManifestForIptv,
} from '../server/routes/iptvHelpers/iptvMediaHelpers.ts';
import { ChannelHealthMonitor } from '../server/services/channelHealthMonitor.ts';

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
});
