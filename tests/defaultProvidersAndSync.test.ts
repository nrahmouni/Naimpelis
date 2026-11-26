// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
import {
  buildXtreamPlayerApiUrl,
  DEFAULT_PROVIDERS,
  DEFAULT_PROVIDER_SUMMARIES,
} from '../src/config/defaultProviders';
import { ProvidersCatalogSection } from '../src/components/providers/ProvidersCatalogSection';
import { resetProvidersCatalogStoreForTest } from '../src/hooks/useXtreamProvidersCatalog';
import {
  clearCachedProviderCatalogs,
  isCachedProviderFresh,
  readCachedProviderCatalog,
  writeCachedProviderCatalog,
  XTREAM_CACHE_TTL_MS,
} from '../src/services/xtreamProvidersDb';
import { syncAllDefaultProvidersProgressively } from '../src/services/xtreamProvidersService';
import type { ProviderCatalogData } from '../src/types/providers';

const serverMocks = vi.hoisted(() => ({
  streamingFetch: vi.fn(),
  curlGetText: vi.fn(),
  assertSafeProxyUrl: vi.fn(async (raw: string) => new URL(raw)),
}));

vi.mock('../server/utils/tlsFetch.ts', () => ({
  streamingFetch: serverMocks.streamingFetch,
}));

vi.mock('../server/extractors/httpHelpers.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/extractors/httpHelpers.ts')>();
  return {
    ...actual,
    curlGetText: serverMocks.curlGetText,
  };
});

vi.mock('../server/utils/ssrfGuard.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/ssrfGuard.ts')>();
  return {
    ...actual,
    assertSafeProxyUrl: serverMocks.assertSafeProxyUrl,
  };
});

import {
  clearProviderRuntimeStateForTest,
  decryptOpaqueArtworkToken,
  rewriteProviderPlaylist,
  sanitizeProviderArtworkUrl,
  syncProviderCatalog,
} from '../server/services/providers/xtreamMultiProviderService.ts';
import {
  enrichTdtCatalogWithProviderChannels,
  findFastProviderLiveSignals,
  findFastProviderVodOrSeriesSignals,
  searchFastProviderIndex,
} from '../server/services/providers/xtreamFastSignalService.ts';

function makeJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('DEFAULT_PROVIDERS & Multi-Provider Xtream Sync', () => {
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearProviderRuntimeStateForTest();
    await clearCachedProviderCatalogs();
  });

  afterEach(() => {
    window.fetch = realFetch;
    globalThis.fetch = realFetch;
  });

  it('exports all 11 default servers and encodes special characters & spaces safely', () => {
    expect(DEFAULT_PROVIDERS).toHaveLength(11);
    expect(DEFAULT_PROVIDER_SUMMARIES).toHaveLength(11);

    const names = DEFAULT_PROVIDERS.map((p) => p.name);
    expect(names).toEqual([
      'Shark Pro',
      'VOD 4K',
      '24TV',
      '2M2H',
      '2M2H Alt',
      'Dana 4K Pro',
      'Active CDNS',
      'Octopus TV',
      'Adtupac',
      'Ultra VIP',
      'Sult-Vo',
    ]);

    const p2m2h = DEFAULT_PROVIDERS.find((p) => p.id === '2m2h')!;
    const urlSpaces = buildXtreamPlayerApiUrl(
      p2m2h.baseUrl,
      p2m2h.accounts[0],
      'get_live_streams'
    );
    expect(urlSpaces).toContain('username=rA591kp61%20W');
    expect(urlSpaces).toContain('password=R50oaYrEk%20C');

    const adtupac = DEFAULT_PROVIDERS.find((p) => p.id === 'adtupac')!;
    const urlAt = buildXtreamPlayerApiUrl(
      adtupac.baseUrl,
      adtupac.accounts[0],
      'get_vod_streams'
    );
    expect(urlAt).toContain('username=Ricardo-alves%402023%40R');
    expect(urlAt).toContain('password=7X4EuvXdEdYr2C');
  });

  it('rotates automatically to fallback account when primary fails and hides all sensitive data', async () => {
    serverMocks.streamingFetch.mockImplementation(async (url: string) => {
      if (url.includes('username=17518770')) {
        return makeJsonResponse({ user_info: { auth: 0, status: 'Expired' } }, 200);
      }
      if (url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '10', category_name: 'España HD' }]);
      }
      if (url.includes('action=get_live_streams')) {
        return makeJsonResponse([
          {
            stream_id: 901,
            name: 'La 1 HD',
            category_id: '10',
            stream_icon: 'http://1.sharkpro.ink:80/logos/la1.png',
          },
        ]);
      }
      if (url.includes('action=get_vod_categories')) {
        return makeJsonResponse([{ category_id: '20', category_name: 'Estrenos' }]);
      }
      if (url.includes('action=get_vod_streams')) {
        return makeJsonResponse([
          {
            stream_id: 505,
            name: 'Película Demo',
            category_id: '20',
            stream_icon: 'https://image.tmdb.org/t/p/w500/demo.jpg',
            container_extension: 'mp4',
            releasedate: '2025-02-01',
          },
        ]);
      }
      if (url.includes('action=get_series_categories')) {
        return makeJsonResponse([{ category_id: '30', category_name: 'Drama' }]);
      }
      if (url.includes('action=get_series')) {
        return makeJsonResponse([
          {
            series_id: 77,
            name: 'Serie Demo',
            category_id: '30',
            cover: 'http://1.sharkpro.ink:80/series/77.jpg',
          },
        ]);
      }
      return makeJsonResponse([], 200);
    });
    serverMocks.curlGetText.mockResolvedValue({ text: '', effectiveUrl: '' });

    const catalog = await syncProviderCatalog('shark-pro', true);
    expect(catalog).not.toBeNull();
    expect(catalog!.status).toBe('ready');
    expect(catalog!.counts).toEqual({ live: 1, movies: 1, series: 1 });
    expect(catalog!.liveStreams[0].playbackUrl).toBe('/api/providers/live/shark-pro/901.m3u8');
    expect(catalog!.vodStreams[0].playbackUrl).toBe('/api/providers/vod/shark-pro/505.mp4');

    // HTTP artwork must be sealed via opaque proxy token; HTTPS TMDB URL stays clean
    expect(catalog!.liveStreams[0].logo.startsWith('/api/providers/artwork?k=')).toBe(true);
    expect(catalog!.vodStreams[0].poster).toBe('https://image.tmdb.org/t/p/w500/demo.jpg');

    const serialized = JSON.stringify(catalog);
    for (const p of DEFAULT_PROVIDERS) {
      expect(serialized).not.toContain(p.baseUrl);
      for (const acc of p.accounts) {
        expect(serialized).not.toContain(acc.username);
        expect(serialized).not.toContain(acc.password);
      }
    }
  });

  it('seals and decrypts http artwork URLs cleanly without leaking upstream hostnames', () => {
    const sealed = sanitizeProviderArtworkUrl('http://vod4k.cc:80/images/cover.jpg');
    expect(sealed.startsWith('/api/providers/artwork?k=')).toBe(true);
    expect(sealed).not.toContain('vod4k');
    const token = new URL(sealed, 'https://localhost').searchParams.get('k') || '';
    expect(decryptOpaqueArtworkToken(token)).toBe('http://vod4k.cc/images/cover.jpg');

    const sealedPort = sanitizeProviderArtworkUrl('http://dana4kpro.com:8080/images/cover.jpg');
    const tokenPort = new URL(sealedPort, 'https://localhost').searchParams.get('k') || '';
    expect(decryptOpaqueArtworkToken(tokenPort)).toBe('http://dana4kpro.com:8080/images/cover.jpg');
  });

  it('respects 6-hour cache TTL and resolves all 11 providers progressively with Promise.allSettled', async () => {
    const now = Date.now();
    expect(isCachedProviderFresh(now - 60_000, now)).toBe(true);
    expect(isCachedProviderFresh(now - XTREAM_CACHE_TTL_MS - 1000, now)).toBe(false);

    const cachedSample: ProviderCatalogData = {
      providerId: 'shark-pro',
      providerName: 'Shark Pro',
      syncedAt: now,
      status: 'ready',
      counts: { live: 2, movies: 0, series: 0 },
      liveCategories: [{ id: '1', name: 'General' }],
      vodCategories: [],
      seriesCategories: [],
      liveStreams: [
        {
          id: 'shark-pro-live-1',
          streamId: '1',
          providerId: 'shark-pro',
          providerName: 'Shark Pro',
          name: 'Canal Cacheado',
          categoryId: '1',
          categoryName: 'General',
          logo: '',
          playbackUrl: '/api/providers/live/shark-pro/1.m3u8',
        },
      ],
      vodStreams: [],
      seriesList: [],
    };
    await writeCachedProviderCatalog(cachedSample);
    const readBack = await readCachedProviderCatalog('shark-pro', now);
    expect(readBack?.liveStreams[0].name).toBe('Canal Cacheado');

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const pid = String(body.providerId || 'unknown');
      const summary = DEFAULT_PROVIDER_SUMMARIES.find((s) => s.id === pid)!;
      return new Response(
        JSON.stringify({
          success: true,
          catalog: {
            providerId: pid,
            providerName: summary.name,
            syncedAt: now,
            status: 'ready',
            counts: { live: 1, movies: 1, series: 0 },
            liveCategories: [],
            vodCategories: [],
            seriesCategories: [],
            liveStreams: [],
            vodStreams: [],
            seriesList: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    window.fetch = mockFetch as unknown as typeof fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const resolvedIds: string[] = [];
    const results = await syncAllDefaultProvidersProgressively({
      onProviderResolved: (cat) => resolvedIds.push(cat.providerId),
    });

    expect(results).toHaveLength(11);
    expect(resolvedIds).toHaveLength(11);
    // shark-pro came from 6h cache, so only 10 network sync calls were needed
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });

  it('completes provider sync and renders catalog under React.StrictMode without getting stuck at 0/11', async () => {
    resetProvidersCatalogStoreForTest();
    await clearCachedProviderCatalogs();
    const now = Date.now();

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const pid = String(body.providerId || 'unknown');
      const summary = DEFAULT_PROVIDER_SUMMARIES.find((s) => s.id === pid)!;
      return new Response(
        JSON.stringify({
          success: true,
          catalog: {
            providerId: pid,
            providerName: summary.name,
            syncedAt: now,
            status: 'ready',
            counts: { live: 1, movies: 0, series: 0 },
            liveCategories: [{ id: '1', name: 'Deportes' }],
            vodCategories: [],
            seriesCategories: [],
            liveStreams: [
              {
                id: `${pid}-live-1`,
                streamId: '101',
                providerId: pid,
                providerName: summary.name,
                name: `Canal ${summary.name}`,
                categoryId: '1',
                categoryName: 'Deportes',
                logo: '',
                playbackUrl: `/api/providers/live/${pid}/101.m3u8`,
              },
            ],
            vodStreams: [],
            seriesList: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    window.fetch = mockFetch as unknown as typeof fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(ProvidersCatalogSection, {
            onPlayChannel: vi.fn(),
            onPlayCustomUrl: vi.fn(),
            autoLoadCatalog: true,
          })
        )
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toMatch(/11\/11 servidores/);
      expect(container.textContent).toContain('Canal Shark Pro');
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
    resetProvidersCatalogStoreForTest();
  });

  it('feeds fast signals, universal search, and Spanish TDT catalog from synced servers', async () => {
    serverMocks.streamingFetch.mockImplementation(async (url: string) => {
      if (url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '10', category_name: 'SPAIN - TDT' }]);
      }
      if (url.includes('action=get_live_streams')) {
        return makeJsonResponse([
          {
            stream_id: 901,
            name: 'ES| ANTENA 3 HEVC',
            category_id: '10',
            stream_icon: '',
          },
          {
            stream_id: 902,
            name: 'ES| CANAL AUTONOMICO TV3 HD',
            category_id: '10',
            stream_icon: '',
          },
        ]);
      }
      if (url.includes('action=get_vod_categories')) {
        return makeJsonResponse([{ category_id: '20', category_name: 'Cine Castellano' }]);
      }
      if (url.includes('action=get_vod_streams')) {
        return makeJsonResponse([
          {
            stream_id: 505,
            name: 'Gladiator II (2024)',
            category_id: '20',
            stream_icon: '',
            container_extension: 'mp4',
            releasedate: '2024-11-15',
          },
        ]);
      }
      if (url.includes('action=get_series_info')) {
        return makeJsonResponse({
          info: { name: 'Severance' },
          episodes: {
            '1': [
              {
                id: '8801',
                episode_num: 1,
                title: 'Good News About Hell',
                container_extension: 'mp4',
              },
            ],
          },
        });
      }
      if (url.includes('action=get_series_categories')) {
        return makeJsonResponse([{ category_id: '30', category_name: 'Series ES' }]);
      }
      if (url.includes('action=get_series')) {
        return makeJsonResponse([
          {
            series_id: 77,
            name: 'Severance (ES)',
            category_id: '30',
            cover: '',
          },
        ]);
      }
      return makeJsonResponse([], 200);
    });
    serverMocks.curlGetText.mockResolvedValue({ text: '', effectiveUrl: '' });

    await syncProviderCatalog('shark-pro', true);
    await syncProviderCatalog('24tv', true);

    const searchRes = await searchFastProviderIndex('antena');
    expect(searchRes.indexedProviders).toBeGreaterThanOrEqual(2);
    expect(searchRes.live.length).toBeGreaterThan(0);
    expect(searchRes.live[0].playbackUrl).toMatch(/^\/api\/providers\/live\//);

    const liveSignals = await findFastProviderLiveSignals('Antena 3', 3);
    expect(liveSignals.length).toBeGreaterThan(0);
    expect(liveSignals[0].label).toContain('Señal Rápida ·');
    expect(liveSignals[0].sourceUrl).toMatch(/^\/api\/providers\/live\//);

    const movieSignals = await findFastProviderVodOrSeriesSignals({
      mediaType: 'movie',
      title: 'Gladiator II',
      year: '2024',
      preferLang: 'ES',
    });
    expect(movieSignals.length).toBeGreaterThan(0);
    expect(movieSignals[0].sourceUrl).toBe('/api/providers/vod/shark-pro/505.mp4');

    const seriesSignals = await findFastProviderVodOrSeriesSignals({
      mediaType: 'tv',
      title: 'Severance',
      season: 1,
      episode: 1,
      preferLang: 'ES',
    });
    expect(seriesSignals.length).toBeGreaterThan(0);
    expect(seriesSignals[0].sourceUrl).toBe('/api/providers/series-stream/shark-pro/8801.mp4');

    const enrichedTdt = enrichTdtCatalogWithProviderChannels([
      {
        id: 'tdt-antena3',
        dial: 3,
        name: 'Antena 3',
        category: 'generalistas',
        network: 'Atresmedia',
        countryCode: 'es',
        channels: [
          {
            id: 'a3-orig',
            label: 'Atresmedia Original',
            sourceUrl: 'https://example.com/a3.m3u8',
            resolverType: 'tdt_hls',
          },
        ],
      },
    ]);

    const antena3 = enrichedTdt.find((c) => c.id === 'tdt-antena3')!;
    expect(antena3.channels[0].label).toMatch(/^TDT Rápida · /);
    expect(antena3.channels[0].sourceUrl).toMatch(/^\/api\/providers\/live\//);

    const extraChannel = enrichedTdt.find((c) => c.name.includes('CANAL AUTONOMICO TV3'));
    expect(extraChannel).toBeDefined();
    expect(extraChannel!.category).toBe('infantil_autonomicas');
    expect(extraChannel!.countryCode).toBe('es');
  });

  it('normalizes broken Xtream MEDIA-SEQUENCE:0 live playlists into monotonically advancing sequences without spurious discontinuity resets', () => {
    const poll1 = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:2',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:2.000000,',
      '/hls/segA.ts',
      '#EXTINF:2.000000,',
      '/hls/segB.ts',
      '#EXTINF:2.000000,',
      '/hls/segC.ts',
    ].join('\n');

    const poll2 = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:2',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:2.000000,',
      '/hls/segC.ts',
      '#EXTINF:2.000000,',
      '/hls/segD.ts',
      '#EXTINF:2.000000,',
      '/hls/segE.ts',
    ].join('\n');

    const out1 = rewriteProviderPlaylist(
      poll1,
      'http://edge.example.com/auth/live.m3u8',
      'http://edge.example.com/',
      '',
      '24tv:182817'
    );
    expect(out1).toContain('#EXT-X-MEDIA-SEQUENCE:0');
    expect(out1).not.toContain('#EXT-X-DISCONTINUITY');

    const out2 = rewriteProviderPlaylist(
      poll2,
      'http://edge.example.com/auth/live.m3u8',
      'http://edge.example.com/',
      '',
      '24tv:182817'
    );
    expect(out2).toContain('#EXT-X-MEDIA-SEQUENCE:2');
    expect(out2).not.toContain('#EXT-X-DISCONTINUITY');
  });
});
