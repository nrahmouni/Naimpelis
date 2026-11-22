import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { isStrictTrackMatch } from '../server/services/riffanMusicService';
import { buildExportifyCsvFromTracks, parseMusicImportText } from '../src/services/musicImporter';
import { hasActiveWebAudioDsp } from '../src/components/music/MusicAudioEngine';
import { useMusicStore } from '../src/store/useMusicStore';
import { useAppStore } from '../src/store/useAppStore';

describe('Riffan Music strict track matcher & Exportify fidelity', () => {
  it('accepts exact track matches and handles featuring credits properly', () => {
    const exact = isStrictTrackMatch({
      expectedArtist: 'Bad Bunny',
      expectedTitle: 'Tití Me Preguntó',
      candidateArtist: 'Bad Bunny',
      candidateTitle: 'Tití Me Preguntó',
      expectedDurationSec: 243,
      candidateDurationSec: 244,
    });
    expect(exact.ok).toBe(true);
    expect(exact.score).toBeGreaterThan(2.5);

    const withFeat = isStrictTrackMatch({
      expectedArtist: 'KAROL G',
      expectedTitle: 'TQG',
      candidateArtist: 'KAROL G, Shakira',
      candidateTitle: 'TQG (feat. Shakira)',
      expectedDurationSec: 199,
      candidateDurationSec: 201,
    });
    expect(withFeat.ok).toBe(true);
  });

  it('rejects unrelated tracks, short-title hijacks, and partial artist collisions', () => {
    // Unrelated song with similar vibe
    const wrongSong = isStrictTrackMatch({
      expectedArtist: 'Bad Bunny',
      expectedTitle: 'Tití Me Preguntó',
      candidateArtist: 'Bad Bunny',
      candidateTitle: 'Moscow Mule',
      expectedDurationSec: 243,
      candidateDurationSec: 245,
    });
    expect(wrongSong.ok).toBe(false);

    // Partial artist name collision ("Justin" != "Justin Bieber" vs "Justin Quiles")
    const artistCollision = isStrictTrackMatch({
      expectedArtist: 'Justin Quiles',
      expectedTitle: 'Loco',
      candidateArtist: 'Justin Bieber',
      candidateTitle: 'Loco',
      expectedDurationSec: 190,
      candidateDurationSec: 190,
    });
    expect(artistCollision.ok).toBe(false);

    // Short title hijack
    const shortTitleHijack = isStrictTrackMatch({
      expectedArtist: 'Rihanna',
      expectedTitle: 'Stay',
      candidateArtist: 'Rihanna',
      candidateTitle: 'Stay With Me Forever Tonight Mix',
    });
    expect(shortTitleHijack.ok).toBe(false);
  });

  it('blocks unrequested karaoke, type beats, live, remix, and 30s preview snippets', () => {
    const karaoke = isStrictTrackMatch({
      expectedArtist: 'Adele',
      expectedTitle: 'Hello',
      candidateArtist: 'Sing King Karaoke',
      candidateTitle: 'Adele - Hello (Karaoke Version)',
    });
    expect(karaoke.ok).toBe(false);

    const remixUnwanted = isStrictTrackMatch({
      expectedArtist: 'Dua Lipa',
      expectedTitle: 'Levitating',
      candidateArtist: 'Dua Lipa',
      candidateTitle: 'Levitating (Club Remix)',
    });
    expect(remixUnwanted.ok).toBe(false);

    const liveRequested = isStrictTrackMatch({
      expectedArtist: 'Queen',
      expectedTitle: 'Bohemian Rhapsody (Live)',
      candidateArtist: 'Queen',
      candidateTitle: 'Bohemian Rhapsody (Live)',
    });
    expect(liveRequested.ok).toBe(true);

    const remixRequested = isStrictTrackMatch({
      expectedArtist: 'Dua Lipa',
      expectedTitle: 'Levitating (Remix)',
      candidateArtist: 'Dua Lipa',
      candidateTitle: 'Levitating (Club Remix)',
    });
    expect(remixRequested.ok).toBe(true);

    // 30-second snippet rejected
    const snippet = isStrictTrackMatch({
      expectedArtist: 'Feid',
      expectedTitle: 'Luna',
      candidateArtist: 'Feid',
      candidateTitle: 'Luna',
      expectedDurationSec: 197,
      candidateDurationSec: 30,
    });
    expect(snippet.ok).toBe(false);
  });

  it('parses Exportify CSV columns cleanly and supports lossless Exportify CSV round-trip', () => {
    const exportifyCsv = [
      'Track URI,Track Name,Artist Name(s),Album Name,Album Image URL,Track Duration (ms),Explicit,ISRC,Track Preview URL,Genres,Release Date',
      '"spotify:track:1a2b3c4d","Tití Me Preguntó","Bad Bunny","Un Verano Sin Ti","https://i.scdn.co/image/test.jpg",243000,true,"QM6N22201234","https://p.scdn.co/mp3-preview/prev.mp3","reggaeton,latin trap",2022-05-06',
      '"spotify:track:9z8y7x6w","Taqessist","Khalid Izri","Taqessist","https://i.scdn.co/image/izri.jpg",265000,false,"MA001230001",,"rif,amazigh",1994-01-01',
    ].join('\r\n');

    const parsed = parseMusicImportText(exportifyCsv, 'Riff_Oldies_exportify.csv');
    expect(parsed.format).toBe('csv');
    expect(parsed.playlistTitle).toBe('Riff Oldies exportify');
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0]).toMatchObject({
      title: 'Tití Me Preguntó',
      artist: 'Bad Bunny',
      album: 'Un Verano Sin Ti',
      spotifyId: '1a2b3c4d',
      isrc: 'QM6N22201234',
      previewUrl: 'https://p.scdn.co/mp3-preview/prev.mp3',
      cover: 'https://i.scdn.co/image/test.jpg',
      durationSec: 243,
      explicit: true,
      sourceHint: 'spotify',
      releaseDate: '2022-05-06',
    });
    expect(parsed.topGenres).toContain('reggaeton');
    expect(parsed.topGenres).toContain('rif');

    // Round-trip export -> import
    const exported = buildExportifyCsvFromTracks(
      'Riff Oldies',
      parsed.tracks.map((t) => ({
        id: `sp-${t.spotifyId}`,
        spotifyId: t.spotifyId,
        title: t.title,
        artist: { name: t.artist },
        album: { title: t.album, cover: t.cover },
        durationSec: t.durationSec,
        explicit: t.explicit,
        isrc: t.isrc,
        previewUrl: t.previewUrl,
      }))
    );

    expect(exported.startsWith('\uFEFF')).toBe(true);
    expect(exported.includes('\r\n')).toBe(true);

    const reImported = parseMusicImportText(exported.replace(/^\uFEFF/, ''), 'Riff_Oldies.csv');
    expect(reImported.tracks).toHaveLength(2);
    expect(reImported.tracks[0].spotifyId).toBe('1a2b3c4d');
    expect(reImported.tracks[0].isrc).toBe('QM6N22201234');
    expect(reImported.tracks[1].artist).toBe('Khalid Izri');
  });
});

describe('Music & World stores preserve navigation stack, search, and platform filters', () => {
  beforeEach(() => {
    useMusicStore.setState({
      musicNavTab: 'home',
      musicActiveMood: 'all',
      musicDetailStack: [],
      musicSearchQuery: '',
      musicSearchFilter: 'all',
      musicSearchResults: null,
      musicRadioFilterId: 'all',
    });
  });

  it('pushes, updates, pops, and preserves search state across Riffan Music detail navigation', () => {
    const store = useMusicStore.getState();
    store.setMusicNavTab('search');
    store.setMusicSearchQuery('Khalid Izri');
    store.setMusicSearchFilter('artists');
    store.pushMusicDetail({ kind: 'artist', id: 'artist-1', title: 'Khalid Izri' });
    store.pushMusicDetail({ kind: 'album', id: 'album-1', title: 'Taqessist' });

    expect(useMusicStore.getState().musicDetailStack).toHaveLength(2);
    expect(useMusicStore.getState().musicSearchQuery).toBe('Khalid Izri');

    useMusicStore.getState().replaceTopMusicDetail((cur) => ({
      ...cur,
      title: 'Taqessist (Remastered)',
    }));
    expect(useMusicStore.getState().musicDetailStack[1].title).toBe('Taqessist (Remastered)');

    useMusicStore.getState().popMusicDetail();
    expect(useMusicStore.getState().musicDetailStack).toHaveLength(1);
    expect(useMusicStore.getState().musicDetailStack[0].id).toBe('artist-1');

    useMusicStore.getState().popMusicDetail();
    expect(useMusicStore.getState().musicDetailStack).toHaveLength(0);
    // Search query & filter must survive returning from nested detail screens
    expect(useMusicStore.getState().musicNavTab).toBe('search');
    expect(useMusicStore.getState().musicSearchQuery).toBe('Khalid Izri');
    expect(useMusicStore.getState().musicSearchFilter).toBe('artists');
  });

  it('persists home music search filter and secondary platform world sub-tabs in useAppStore', () => {
    const appStore = useAppStore.getState();
    appStore.setHomeSearchQuery('Morad');
    appStore.setHomeSearchCategory('music');
    appStore.setHomeSearchOverlayDismissed(true);

    appStore.setClipboxTab('vault');
    appStore.setRbtvTab('decoder');
    appStore.setBelixTab('vault');
    appStore.setAtresplayerCategory('series');
    appStore.setMovistarDaznOperator('dazn');
    appStore.setMovistarDaznCategory('motor');

    const snap = useAppStore.getState();
    expect(snap.homeSearchQuery).toBe('Morad');
    expect(snap.homeSearchCategory).toBe('music');
    expect(snap.homeSearchOverlayDismissed).toBe(true);
    expect(snap.clipboxTab).toBe('vault');
    expect(snap.rbtvTab).toBe('decoder');
    expect(snap.belixTab).toBe('vault');
    expect(snap.atresplayerCategory).toBe('series');
    expect(snap.movistarDaznOperator).toBe('dazn');
    expect(snap.movistarDaznCategory).toBe('motor');
  });

  it('keeps native un-graphed background audio enabled by default and engages WebAudio DSP only when studio FX are active', () => {
    const baseFlags = {
      spatial8dEnabled: false,
      bassBoostDb: 0,
      reverbMix: 0,
      exciterMix: 0,
      vinylCrackle: 0,
      vocalCancel: false,
      autoDjEnabled: false,
      eqBands10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
    expect(hasActiveWebAudioDsp(baseFlags)).toBe(false);
    expect(hasActiveWebAudioDsp({ ...baseFlags, spatial8dEnabled: true })).toBe(true);
    expect(hasActiveWebAudioDsp({ ...baseFlags, bassBoostDb: 3 })).toBe(true);
    expect(hasActiveWebAudioDsp({ ...baseFlags, eqBands10: [0, 0, 4, 0, 0, 0, 0, 0, 0, 0] })).toBe(true);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public/music-manifest.webmanifest'), 'utf8')
    );
    expect(manifest.scope).toBe('/');
  });

  it('rejects stale resolved playback payloads when currentTrack has already switched', () => {
    useMusicStore.setState({
      currentTrack: {
        id: 'track-new',
        title: 'New Track',
        artist: { id: 'a1', name: 'Artist' },
        album: { id: 'al1', title: 'Album', cover: '' },
        durationSec: 200,
      },
      resolvedPlayback: null,
      isResolvingTrack: true,
    });

    useMusicStore.getState().setResolvedPlayback(
      {
        trackId: 'track-old',
        sourceType: 'audio-mp3',
        sourceLabel: 'Wrong Old Song',
        streamUrl: 'https://audio.example/old.mp3',
        fullLength: true,
      },
      'track-old'
    );
    expect(useMusicStore.getState().resolvedPlayback).toBeNull();

    useMusicStore.getState().setResolvedPlayback(
      {
        trackId: 'track-new',
        sourceType: 'audio-mp3',
        sourceLabel: 'Correct Song',
        streamUrl: 'https://audio.example/new.mp3',
        fullLength: true,
      },
      'track-new'
    );
    expect(useMusicStore.getState().resolvedPlayback?.trackId).toBe('track-new');
    expect(useMusicStore.getState().isResolvingTrack).toBe(false);
  });
});
