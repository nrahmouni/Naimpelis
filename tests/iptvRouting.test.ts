import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEpgXmlUrl,
  buildM3uPlaylistUrl,
  buildTvPairingUrl,
  extractRoomCodeFromInput,
  parseRoomFromWindow,
  PUBLIC_PRODUCTION_DOMAIN,
} from '../src/utils/shortLink';
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

    expect(extractRoomCodeFromInput('https://riffantv.ai.studio/tv')).toBe('');
    expect(extractRoomCodeFromInput('https://riffantv.ai.studio/directo')).toBe('');
    expect(extractRoomCodeFromInput('https://riffantv.ai.studio/k8x4')).toBe('k8x4');
  });

  it('generates clean riffantv.ai.studio public URLs for /tv, /riffantv.m3u and /epg.xml', () => {
    mockWindowLocation('/tv', '', 'ais-dev-demo-test.run.app');
    expect(PUBLIC_PRODUCTION_DOMAIN).toBe('riffantv.ai.studio');
    expect(buildTvPairingUrl()).toBe('https://riffantv.ai.studio/tv');
    expect(buildM3uPlaylistUrl(false)).toBe('https://riffantv.ai.studio/riffantv.m3u');
    expect(buildM3uPlaylistUrl(true)).toBe('https://riffantv.ai.studio/riffantv.m3u?download=1');
    expect(buildEpgXmlUrl(false)).toBe('https://riffantv.ai.studio/epg.xml');
    expect(buildEpgXmlUrl(true)).toBe('https://riffantv.ai.studio/epg.xml?download=1');
  });

  it('preserves authentic Tarifit UI copy without artificial Tamazight neologisms', () => {
    expect(lookupRifTranslation('M3U List & EPG XML')).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    for (const val of Object.values(RIF_DICTIONARY)) {
      expect(val).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    }
  });
});
