import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEpgXmlUrl,
  buildM3uPlaylistUrl,
  buildShortInviteUrl,
  buildTvPairingUrl,
  extractRoomCodeFromInput,
  getDisplayAppHost,
  parseRoomFromWindow,
  PUBLIC_PRODUCTION_DOMAIN,
} from '../src/utils/shortLink';
import { buildCanonicalShareUrl } from '../src/shared/dedicatedRoutes';
import { lookupRifTranslation, RIF_DICTIONARY } from '../src/utils/rifTranslations';

const FORBIDDEN_TAMAZIGHT_NEOLOGISMS =
  /\b(isura|imazraren|tiliẓri|tiliẓriyin|adras|amsawal|amiḍan|iɣewwaren)\b/i;

function mockWindowLocation(pathname: string, search = '', hostname = 'ais-dev-preview.run.app') {
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    location: {
      pathname,
      search,
      hostname,
      host: hostname,
      origin: `https://${hostname}`,
    },
  };
}

describe('IPTV M3U/EPG Routing & Riffian Dictionary Integrity', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('recognizes /tv and reserved routes rather than room codes', () => {
    mockWindowLocation('/tv');
    expect(parseRoomFromWindow()).toMatchObject({
      roomId: '',
      isTvPairLobby: true,
    });

    expect(extractRoomCodeFromInput('https://riffan.ai.studio/')).toBe('');
    expect(extractRoomCodeFromInput('riffan.ai.studio')).toBe('');
    expect(extractRoomCodeFromInput('https://riffan.ai.studio/tv')).toBe('');
    expect(extractRoomCodeFromInput('https://riffan.ai.studio/directo')).toBe('');
    expect(extractRoomCodeFromInput('https://riffan.ai.studio/k8x4')).toBe('k8x4');
    expect(extractRoomCodeFromInput('riffan.ai.studio/k8x4')).toBe('k8x4');
  });

  it('generates clean riffan.ai.studio public URLs for /tv, /riffantv.m3u and /epg.xml', () => {
    mockWindowLocation('/tv', '', 'ais-dev-demo-test.run.app');
    expect(PUBLIC_PRODUCTION_DOMAIN).toBe('riffan.ai.studio');
    expect(getDisplayAppHost()).toBe('riffan.ai.studio');
    expect(buildTvPairingUrl()).toBe('https://riffan.ai.studio/tv');
    expect(buildM3uPlaylistUrl(false)).toBe('https://riffan.ai.studio/riffantv.m3u');
    expect(buildM3uPlaylistUrl(true)).toBe('https://riffan.ai.studio/riffantv.m3u?download=1');
    expect(buildEpgXmlUrl(false)).toBe('https://riffan.ai.studio/epg.xml');
    expect(buildEpgXmlUrl(true)).toBe('https://riffan.ai.studio/epg.xml?download=1');
  });

  it('builds clean https://riffan.ai.studio/... canonical share URLs even from preview or localhost hosts', () => {
    for (const host of ['ais-pre-demo.run.app', 'localhost', 'riffan.ai.studio']) {
      mockWindowLocation('/cine', '', host);
      expect(getDisplayAppHost()).toBe('riffan.ai.studio');
      expect(buildShortInviteUrl('')).toBe('https://riffan.ai.studio/');
      expect(buildShortInviteUrl('k8x4')).toBe('https://riffan.ai.studio/k8x4');
      expect(buildCanonicalShareUrl({ kind: 'home' })).toBe('https://riffan.ai.studio/');
      expect(
        buildCanonicalShareUrl({ kind: 'movie', tmdbId: 550, title: 'Fight Club' })
      ).toBe('https://riffan.ai.studio/pelicula/550-fight-club');
      expect(
        buildCanonicalShareUrl({
          kind: 'series',
          tmdbId: 1399,
          title: 'Game of Thrones',
          season: 1,
          episode: 3,
        })
      ).toBe('https://riffan.ai.studio/serie/1399-game-of-thrones/t1/e3');
      expect(
        buildCanonicalShareUrl({ kind: 'channel', id: 'la-1', name: 'La 1' })
      ).toBe('https://riffan.ai.studio/la-1');
      expect(buildCanonicalShareUrl({ kind: 'pack', packSlug: 'dazn' })).toBe(
        'https://riffan.ai.studio/dazn'
      );
      expect(
        buildCanonicalShareUrl({
          kind: 'match',
          homeTeam: 'FC Barcelona',
          awayTeam: 'Real Madrid',
        })
      ).toBe('https://riffan.ai.studio/partido/fc-barcelona-vs-real-madrid');
      expect(buildCanonicalShareUrl({ kind: 'game', gameId: 'pool' })).toBe(
        'https://riffan.ai.studio/juegos/billar'
      );
      expect(buildCanonicalShareUrl({ kind: 'world', world: 'music' })).toBe(
        'https://riffan.ai.studio/musica'
      );
    }
  });

  it('preserves authentic Tarifit UI copy without artificial Tamazight neologisms', () => {
    expect(lookupRifTranslation('M3U List & EPG XML')).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    for (const val of Object.values(RIF_DICTIONARY)) {
      expect(val).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    }
  });
});
