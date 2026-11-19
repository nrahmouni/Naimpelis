import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  isGhostflixOrVidboltUrl,
  parseGhostflixOrVidboltUrl,
  parseVidboltMasterManifest,
} from '../server/extractors/bingetrixHelpers/ghostflixVidboltExtractor.ts';
import {
  decryptElahmadAesPayload,
  isElahmadUrl,
  parseElahmadDaTaObject,
} from '../server/extractors/elahmadExtractor.ts';
import {
  mapFamelackItemsToEntries,
  parseWorldM3uPlaylist,
} from '../server/services/famelackIptvService.ts';
import { getAllIptvChannels } from '../server/routes/iptvHelpers/iptvChannelRegistry.ts';

describe('Ghostflix / VidBolt Multi-Audio VOD Extractor', () => {
  it('detects ghostflix and vidbolt movie & episode URLs cleanly', () => {
    expect(isGhostflixOrVidboltUrl('https://ghostflix.st/movies/550')).toBe(true);
    expect(isGhostflixOrVidboltUrl('https://vidbolt.st/embed/tv/1399/1/2')).toBe(true);
    expect(parseGhostflixOrVidboltUrl('https://ghostflix.st/movies/550')).toEqual({
      tmdbId: '550',
      mediaType: 'movie',
    });
    expect(parseGhostflixOrVidboltUrl('https://vidbolt.st/embed/tv/1399/2/5')).toEqual({
      tmdbId: '1399',
      mediaType: 'tv',
      season: 2,
      episode: 5,
    });
  });

  it('parses ES/LAT/EN audio tracks and proxied subtitles from VidBolt HLS master', () => {
    const sampleMaster = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="European Spanish",LANGUAGE="es",URI="audio_es.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Latino",LANGUAGE="es-419",URI="audio_lat.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio_en.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="Spanish (Spain)",LANGUAGE="es",URI="/subs/fight_club_es.vtt"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="English",LANGUAGE="en",URI="https://cdn.vidbolt.st/subs/en.vtt"',
      '#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1920x1080,AUDIO="aud",SUBTITLES="sub"',
      'video_1080.m3u8',
    ].join('\n');

    const parsed = parseVidboltMasterManifest(sampleMaster, 'https://img.rousav.tech/stream/master.m3u8');
    expect(parsed.audioLangs).toEqual(expect.arrayContaining(['ES', 'LAT', 'EN', 'VOSE']));
    expect(parsed.audioSummary).toEqual(['European Spanish', 'Latino', 'English']);
    expect(parsed.subtitles.length).toBe(2);
    expect(parsed.subtitles[0].lang).toBe('es');
    expect(parsed.subtitles[0].url).toContain('/api/hls-proxy/');
    expect(parsed.subtitles[0].url).toContain(encodeURIComponent('https://img.rousav.tech/subs/fight_club_es.vtt'));
  });
});

describe('Elahmad TV Dynamic AES-256-CBC Extractor', () => {
  it('parses JS da_ta form payload and decrypts AES-256-CBC stream URL round-trip', () => {
    const html = `
      <script>
        var da_ta = {"id":"alaoulaeurope","token":"abc123xyz","ts":"1760000000"};
      </script>
    `;
    const parsed = parseElahmadDaTaObject(html);
    expect(parsed).toEqual({
      id: 'alaoulaeurope',
      token: 'abc123xyz',
      ts: '1760000000',
    });

    const key = Buffer.from('acf40de1dddb1addf66721d1ecfbc5d7', 'utf8');
    const iv = Buffer.from('b138591ee8715ee0', 'utf8');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const sampleUrl = 'https://cdn-live.elahmad.example/snrt/alaoula/index.m3u8?t=99';
    const encrypted = Buffer.concat([cipher.update(sampleUrl, 'utf8'), cipher.final()]).toString('base64');

    expect(decryptElahmadAesPayload(encrypted)).toBe(sampleUrl);
    expect(isElahmadUrl('https://www.elahmad.ru/tv/arabic-tv-online.php?id=alaoulaeurope')).toBe(true);
  });
});

describe('Famelack, Free-TV & IPTV Registry Integration', () => {
  it('skips geo-blocked entries and maps non-blocked Famelack streams cleanly', () => {
    const mapped = mapFamelackItemsToEntries(
      [
        {
          name: 'Blocked Sports TV',
          isGeoBlocked: true,
          sources: { streams: ['https://example.com/blocked.m3u8'] },
        },
        {
          name: 'Willow Cricket HD',
          country: 'in',
          isGeoBlocked: false,
          languages: ['eng'],
          sources: { streams: ['https://amagi.example.com/willow/playlist.m3u8'] },
        },
      ],
      {
        prefix: 'fl-sport',
        category: 'world_cricket',
        networkLabel: 'Famelack Sports Worldwide',
        limit: 10,
      }
    );

    expect(mapped.length).toBe(1);
    expect(mapped[0].name).toBe('Willow Cricket HD');
    expect(mapped[0].category).toBe('world_cricket');
    expect(mapped[0].channels[0].sourceUrl).toBe('https://amagi.example.com/willow/playlist.m3u8');
  });

  it('parses Free-TV & iptv-org M3U playlists and categorizes Sports, ADRAR Europe & Movies', () => {
    const m3u = [
      '#EXTM3U',
      '#EXTINF:-1 group-title="France" tvg-country="FR",ARTE Français',
      'https://arte.example.com/live/master.m3u8',
      '#EXTINF:-1 group-title="Sports" tvg-country="IN",Star Sports Live',
      'https://starsports.example.com/hls/live.m3u8',
    ].join('\n');

    const entries = parseWorldM3uPlaylist(m3u, 'freetv', 50);
    expect(entries.length).toBe(2);
    expect(entries.find((e) => e.name.includes('ARTE'))?.category).toBe('adrar_europa');
    expect(entries.find((e) => e.name.includes('Star Sports'))?.category).toBe('world_cricket');
  });

  it('includes Cricket/Sports, Elahmad MENA, and ADRAR Europe packs in unified IPTV registry', () => {
    const all = getAllIptvChannels();
    expect(all.some((c) => c.category === 'world_cricket')).toBe(true);
    expect(all.some((c) => c.category === 'elahmad_mena')).toBe(true);
    expect(all.some((c) => c.category === 'adrar_europa')).toBe(true);
  });
});
