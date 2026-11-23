import { describe, expect, it } from 'vitest';
import { validateSafeOutboundUrl } from '../server/utils/ssrfGuard.ts';
import { buildZipBlob, crc32 } from '../src/utils/zipExport.ts';
import {
  buildExportifyCsvFromTracks,
  buildM3u8FromTracks,
  parseMusicImportText,
} from '../src/services/musicImporter.ts';
import { MUSIC_I18N, MUSIC_LANGUAGES } from '../src/components/music/musicI18n.ts';
import { useMusicStore } from '../src/store/useMusicStore.ts';
import { serviceMesh, serviceMeshGatewayMiddleware } from '../server/gateway/serviceMesh.ts';
import { isDvbUpstreamCoolingDown } from '../server/routes/proxies/dvbTranscoder.ts';
import type { MusicTrack } from '../src/types/music.ts';

const SAMPLE_TRACK: MusicTrack = {
  id: 'dz-123456',
  title: 'Alors on danse',
  artist: { id: '29384', name: 'Stromae' },
  album: {
    id: '45678',
    title: 'Cheese',
    cover: 'https://cdn-images.dzcdn.net/images/cover/abc/500x500-000000-80-0-0.jpg',
  },
  durationSec: 206,
  source: 'deezer',
};

describe('Riffan Music Upgrade & Belgium Suite', () => {
  it('blocks private, loopback, CGNAT, and metadata URLs via ssrfGuard', async () => {
    const unsafe = [
      'http://127.0.0.1:8080/secret',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/internal',
      'http://100.64.1.2/cgnat',
      'http://[::1]/loopback',
      'ftp://example.com/file.mp3',
    ];
    for (const u of unsafe) {
      const verdict = await validateSafeOutboundUrl(u);
      expect(verdict.safe).toBe(false);
    }
  });

  it('builds valid uncompressed ZIP blobs with CRC32 and EOCD signature', async () => {
    const payload = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x01, 0x02, 0x03]);
    expect(crc32(payload)).toBeGreaterThan(0);
    const blob = buildZipBlob([{ name: '01_Stromae_-_Alors_on_danse.mp3', data: payload }]);
    expect(blob.type).toBe('application/zip');
    const buf = new Uint8Array(await blob.arrayBuffer());
    // PK\x03\x04 local header
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    // Ends with PK\x05\x06 EOCD
    const eocdOffset = buf.length - 22;
    expect(buf[eocdOffset]).toBe(0x50);
    expect(buf[eocdOffset + 1]).toBe(0x4b);
    expect(buf[eocdOffset + 2]).toBe(0x05);
    expect(buf[eocdOffset + 3]).toBe(0x06);
  });

  it('parses Spotify YourLibrary, StreamingHistory, YouTube Takeout, CSV, and M3U8 cleanly', () => {
    const spotifyLib = parseMusicImportText(
      JSON.stringify({
        tracks: [
          { artist: 'Angèle', track: 'Bruxelles je t’aime', album: 'Nonante-Cinq' },
          { artist: 'Stromae', track: 'Papaoutai', album: 'Racine carrée' },
        ],
      })
    );
    expect(spotifyLib.format).toBe('spotify_library');
    expect(spotifyLib.tracks.length).toBe(2);

    const history = parseMusicImportText(
      JSON.stringify([
        { endTime: '2026-10-01 18:10', artistName: 'Damso', trackName: 'Macarena', msPlayed: 195000 },
        { endTime: '2026-10-01 18:11', artistName: 'SkipArtist', trackName: 'TooShort', msPlayed: 2000 },
      ])
    );
    expect(history.format).toBe('spotify_history');
    expect(history.tracks.map((t) => t.artist)).toContain('Damso');

    const takeout = parseMusicImportText(
      JSON.stringify([
        {
          header: 'YouTube Music',
          title: 'Watched Are You With Me',
          subtitles: [{ name: 'Lost Frequencies - Topic' }],
        },
      ])
    );
    expect(takeout.format).toBe('youtube_takeout');
    expect(takeout.tracks[0]?.artist).toBe('Lost Frequencies');

    const csv = buildExportifyCsvFromTracks('Belgium Mix', [SAMPLE_TRACK]);
    const parsedCsv = parseMusicImportText(csv);
    expect(parsedCsv.format).toBe('csv');
    expect(parsedCsv.tracks[0]?.title).toBe('Alors on danse');

    const m3u = buildM3u8FromTracks('Belgium Mix', [SAMPLE_TRACK]);
    const parsedM3u = parseMusicImportText(m3u);
    expect(parsedM3u.format).toBe('m3u');
    expect(parsedM3u.tracks[0]?.artist).toBe('Stromae');
  });

  it('keeps complete i18n key parity across all 5 languages including Belgium labels', () => {
    expect(MUSIC_LANGUAGES.map((l) => l.id)).toEqual(['en', 'es', 'fr', 'zh', 'ca']);
    const enKeys = Object.keys(MUSIC_I18N.en).sort();
    for (const lang of ['es', 'fr', 'zh', 'ca'] as const) {
      expect(Object.keys(MUSIC_I18N[lang]).sort()).toEqual(enKeys);
      expect(MUSIC_I18N[lang].secBelgium.length).toBeGreaterThan(3);
      expect(MUSIC_I18N[lang].radioBelgium.length).toBeGreaterThan(2);
    }
  });

  it('defaults Riffan Music to English and wifiOnlyAutoDownload true with working Studio & Taste actions', () => {
    const initial = useMusicStore.getState();
    expect(initial.musicLang).toBe('en');
    expect(initial.wifiOnlyAutoDownload).toBe(true);

    initial.setSpatialTrajectory('figure8');
    initial.setPitchSemitones(-2);
    initial.setEqBand10(0, 3);
    initial.setEqBand10(9, 2);
    initial.importTracksIntoLikes([SAMPLE_TRACK]);
    initial.mergeTasteProfile({
      artists: ['Stromae'],
      genres: ['Electronic'],
      source: { provider: 'spotify', label: 'Spotify Belgium', trackCount: 1 },
    });

    const updated = useMusicStore.getState();
    expect(updated.spatialTrajectory).toBe('figure8');
    expect(updated.pitchSemitones).toBe(-2);
    expect(updated.eqBands10[0]).toBe(3);
    expect(updated.eqBands10[9]).toBe(2);
    expect(updated.likedTracks.some((t) => t.id === SAMPLE_TRACK.id)).toBe(true);
    expect(updated.tasteProfile.favoriteArtists).toContain('Stromae');
  });

  it('does not trip global stream-extractor circuit breaker on upstream proxy 502 responses', () => {
    serviceMesh.resetCircuit('stream-extractor');
    for (let i = 0; i < 6; i++) {
      let finishCb: (() => void) | null = null;
      const fakeReq = {
        headers: {},
        originalUrl: '/api/ts-proxy/segment.ts?url=https%3A%2F%2Fexample.com%2Fseg.ts',
        path: '/api/ts-proxy/segment.ts',
      } as never;
      const fakeRes = {
        statusCode: 502,
        setHeader: () => undefined,
        on: (ev: string, cb: () => void) => {
          if (ev === 'finish') finishCb = cb;
        },
        status: () => fakeRes,
        json: () => fakeRes,
      } as never;
      serviceMeshGatewayMiddleware(fakeReq, fakeRes, () => undefined);
      finishCb?.();
    }
    expect(serviceMesh.isCircuitOpen('stream-extractor')).toBe(false);
    expect(isDvbUpstreamCoolingDown('http://203.0.113.10:8093/stream/20/index.m3u8')).toBe(false);
  });
});
