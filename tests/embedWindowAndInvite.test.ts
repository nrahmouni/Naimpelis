import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  getEmbedHostKey,
  getEmbedServerStatus,
  setEmbedServerStatus,
  unwrapEmbedUrl,
} from '../src/components/player/embedWindowUtils';
import { isInsideNestedIframe } from '../src/components/player/PreviewAutoEscapeBanner';
import {
  buildLocalizedInviteMessage,
  buildWhatsAppShareUrl,
} from '../src/utils/inviteShare';

describe('embedWindowUtils', () => {
  const storageMap = new Map<string, string>();

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal('window', {
      location: { origin: 'https://naimcine.example' },
      localStorage: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storageMap.set(k, v);
        },
        removeItem: (k: string) => {
          storageMap.delete(k);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwraps /api/embed-proxy URLs to direct provider HTTPS URLs', () => {
    const wrapped =
      '/api/embed-proxy?url=https%3A%2F%2Fvidfast.vc%2Fmovie%2F969681%3FautoPlay%3Dtrue';
    expect(unwrapEmbedUrl(wrapped)).toBe(
      'https://vidfast.vc/movie/969681?autoPlay=true'
    );
    expect(unwrapEmbedUrl('https://vidsrc.sh/embed/tv/12971/3/1')).toBe(
      'https://vidsrc.sh/embed/tv/12971/3/1'
    );
  });

  it('normalizes embed host keys and persists per-server inline/window status', () => {
    const url = 'https://www.2embed.cc/embed/969681';
    expect(getEmbedHostKey(url)).toBe('2embed.cc');
    expect(getEmbedServerStatus(url)).toBeNull();

    setEmbedServerStatus(url, 'window_required');
    expect(getEmbedServerStatus('https://2embed.cc/embed/123')).toBe(
      'window_required'
    );

    setEmbedServerStatus(url, 'inline_ok');
    expect(getEmbedServerStatus(url)).toBe('inline_ok');
  });
});

describe('PreviewAutoEscapeBanner iframe detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects nested iframe strictly via self !== top without reading top properties', () => {
    const fakeSelf = {};
    const fakeTop = new Proxy(
      {},
      {
        get() {
          throw new Error('Cross-origin property access forbidden');
        },
      }
    );
    vi.stubGlobal('window', { self: fakeSelf, top: fakeTop });
    expect(isInsideNestedIframe()).toBe(true);

    vi.stubGlobal('window', { self: fakeSelf, top: fakeSelf });
    expect(isInsideNestedIframe()).toBe(false);
  });
});

describe('inviteShare localized WhatsApp messages', () => {
  it('formats live channel name vs movie title across es, ca, and en', () => {
    const liveEs = buildLocalizedInviteMessage({
      lang: 'es',
      roomName: 'Sala 1',
      activeMediaTitle: 'La 1 HD',
      activeMediaIsLive: true,
    });
    expect(liveEs).toContain('canal en directo');
    expect(liveEs).toContain('La 1 HD');

    const movieCa = buildLocalizedInviteMessage({
      lang: 'ca',
      roomName: 'Sala 1',
      activeMediaTitle: 'Dragon Ball Z',
      activeMediaIsLive: false,
    });
    expect(movieCa).toContain('Dragon Ball Z');
    expect(movieCa).toContain('Et convido a veure');

    const waUrl = buildWhatsAppShareUrl({
      lang: 'en',
      roomName: 'Room 1',
      inviteUrl: 'https://naimcine.example/k8x4',
      activeMediaTitle: 'Movistar Liga',
      activeMediaIsLive: true,
    });
    expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(waUrl)).toContain('live channel');
    expect(decodeURIComponent(waUrl)).toContain('Movistar Liga');
    expect(decodeURIComponent(waUrl)).toContain('https://naimcine.example/k8x4');
  });
});
