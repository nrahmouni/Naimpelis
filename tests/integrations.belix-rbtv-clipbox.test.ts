import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamingFetch: vi.fn(),
  curlGetText: vi.fn(),
  curlGetBufferWithStatus: vi.fn(),
  fetchTmdbJson: vi.fn(),
  extractClipboxDirectStreams: vi.fn(),
  extractBingetrixEnglishTracks: vi.fn(),
  searchAggregatedSubtitles: vi.fn(),
  resolveMovidyEmbedTrack: vi.fn(),
  unpackVidhideToHls: vi.fn(),
  sniffStreamWithHeadless: vi.fn(),
  verifyWebEmbedCandidateAlive: vi.fn(),
}));

vi.mock('../server/utils/tlsFetch.ts', () => ({
  streamingFetch: mocks.streamingFetch,
}));

vi.mock('../server/extractors/httpHelpers.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/extractors/httpHelpers.ts')>();
  return {
    ...actual,
    curlGetText: mocks.curlGetText,
    curlGetBufferWithStatus: mocks.curlGetBufferWithStatus,
  };
});

vi.mock('../server/services/tmdbService.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/tmdbService.ts')>();
  return {
    ...actual,
    fetchTmdbJson: mocks.fetchTmdbJson,
  };
});

vi.mock('../server/extractors/clipboxDirectExtractor.ts', () => ({
  extractClipboxDirectStreams: mocks.extractClipboxDirectStreams,
}));

vi.mock('../server/extractors/bingetrixMovidy.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/extractors/bingetrixMovidy.ts')>();
  return {
    ...actual,
    extractBingetrixEnglishTracks: mocks.extractBingetrixEnglishTracks,
    resolveMovidyEmbedTrack: mocks.resolveMovidyEmbedTrack,
  };
});

vi.mock('../server/services/subtitleAggregator.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/subtitleAggregator.ts')>();
  return {
    ...actual,
    searchAggregatedSubtitles: mocks.searchAggregatedSubtitles,
  };
});

vi.mock('../server/extractors/vidhideEmbed69.ts', () => ({
  unpackVidhideToHls: mocks.unpackVidhideToHls,
}));

vi.mock('../server/extractors/sportsExtractor.ts', () => ({
  sniffStreamWithHeadless: mocks.sniffStreamWithHeadless,
}));

vi.mock('../server/services/streamExtractFallback.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/streamExtractFallback.ts')>();
  return {
    ...actual,
    verifyWebEmbedCandidateAlive: mocks.verifyWebEmbedCandidateAlive,
  };
});

import {
  connectBelixSession,
  disconnectBelixSession,
  fetchBelixOpaqueSegment,
  getBelixLiveChannels,
  getBelixStatus,
  resolveBelixManifest,
  resolveBelixSubPlaylist,
} from '../server/services/belix/belixXtreamClient.ts';
import { rewritePlaylistWithOpaqueTokens } from '../server/services/belix/belixProxyHelpers.ts';
import { channelHealthMonitor } from '../server/services/channelHealthMonitor.ts';
import {
  curateSportsTracks,
  getCuratedRbtvChannels,
  isDisallowedRbtvTrack,
} from '../server/services/rbtv/rbtvLiveCurator.ts';
import { resolveClipboxTitleStreams } from '../server/services/clipbox/clipboxCatalogService.ts';
import { resolveOrderedCandidateTracks } from '../server/routes/streamExtractHelpers/catalogTrackResolver.ts';
import { buildFallbackCatalogResult } from '../server/routes/streamExtractHelpers/catalogMediaMetadataAndFallback.ts';

function makeJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: '',
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function makeTextResponse(text: string, url = '', status = 200, contentType = 'application/vnd.apple.mpegurl') {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
    json: async () => ({}),
    arrayBuffer: async () => Buffer.from(text),
  };
}

afterEach(() => {
  disconnectBelixSession();
  channelHealthMonitor.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.curlGetText.mockResolvedValue({ text: '', effectiveUrl: '' });
  mocks.curlGetBufferWithStatus.mockResolvedValue({ buf: Buffer.alloc(0), status: 502 });
  mocks.verifyWebEmbedCandidateAlive.mockResolvedValue(true);
});

describe('Belix TV Xtream Client & Opaque Proxy', () => {
  it('validates empty credentials and blocks private/metadata SSRF origins', async () => {
    const emptyRes = await connectBelixSession({
      serverUrl: '',
      username: '',
      password: '',
    });
    expect(emptyRes.connected).toBe(false);
    expect(emptyRes.error).toContain('requeridos');

    for (const ssrfOrigin of [
      'http://127.0.0.1:8080',
      'http://localhost:8080',
      'http://169.254.169.254',
      'http://10.0.0.5:8080',
    ]) {
      const blocked = await connectBelixSession({
        serverUrl: ssrfOrigin,
        username: 'test_user_01',
        password: 'test_pass_value',
      });
      expect(blocked.connected).toBe(false);
      expect(blocked.error).toBeTruthy();
      expect(mocks.streamingFetch).not.toHaveBeenCalled();
    }
  });

  it('connects using mocked Xtream portal, filters unstable/adult channels, and masks upstream credentials', async () => {
    const portalOrigin = 'http://93.184.216.34:8080';
    const testUser = 'demo_acct_99';
    const testPass = 'secret_pw_88';

    mocks.streamingFetch.mockImplementation(async (rawUrl: string) => {
      if (rawUrl.includes('action=get_live_categories')) {
        return makeJsonResponse([
          { category_id: '1', category_name: 'ESPAÑA TDT' },
          { category_id: '2', category_name: 'ADULTS 18+' },
        ]);
      }
      if (rawUrl.includes('action=get_live_streams')) {
        return makeJsonResponse([
          {
            stream_id: 101,
            name: 'La 1 HD',
            category_id: '1',
            stream_icon: 'https://cdn.example.net/la1.png',
            epg_channel_id: 'la1.es',
          },
          {
            stream_id: 102,
            name: 'Canal Offline',
            category_id: '1',
            stream_icon: '',
          },
          {
            stream_id: 103,
            name: 'Adult Stream',
            category_id: '2',
            stream_icon: '',
          },
        ]);
      }
      if (rawUrl.includes('player_api.php')) {
        return makeJsonResponse({
          user_info: {
            auth: 1,
            status: 'Active',
            active_cons: '0',
            max_connections: '2',
          },
          server_info: { timezone: 'Europe/Madrid' },
        });
      }
      if (rawUrl.includes('/101.m3u8')) {
        return makeTextResponse(
          '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\nchunk_001.ts\n',
          `${portalOrigin}/hls/101/index.m3u8`
        );
      }
      if (rawUrl.includes('/102.m3u8')) {
        return makeTextResponse('<html><body>404 Not Found</body></html>', rawUrl, 404, 'text/html');
      }
      return makeTextResponse('', rawUrl, 404);
    });

    const status = await connectBelixSession({
      serverUrl: portalOrigin,
      username: testUser,
      password: testPass,
    });

    expect(status.connected).toBe(true);
    expect(status.maskedUsername).toBe('de***99');
    expect(status.totalRawStreams).toBe(2); // adult filtered before probing
    expect(status.stableCount).toBe(1);

    const channels = getBelixLiveChannels();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('La 1 HD');
    expect(channels[0].category).toBe('belix_live');
    expect(channels[0].sourceHub).toBe('belix');
    expect(channels[0].channels[0].sourceUrl).toBe('/api/belix/stream/101.m3u8');

    const allLoaded = getBelixLiveChannels({ includeAll: true });
    expect(allLoaded).toHaveLength(2);
    expect(allLoaded[0].probeOk).toBe(true);
    expect(allLoaded[1].probeOk).toBe(false);

    const serialized = JSON.stringify({ status, channels });
    expect(serialized).not.toContain(testUser);
    expect(serialized).not.toContain(testPass);

    const manifest = await resolveBelixManifest('101', 'https://app.example.test');
    expect(manifest).toBeTruthy();
    expect(manifest).toContain('https://app.example.test/api/belix/seg/');
    expect(manifest).not.toContain(portalOrigin);
    expect(manifest).not.toContain(testUser);
    expect(manifest).not.toContain(testPass);

    disconnectBelixSession();
    expect(getBelixStatus().connected).toBe(false);
    expect(getBelixLiveChannels()).toHaveLength(0);
  });

  it('rewrites master playlists, nested sub-playlists, and segment URIs to opaque credential-free endpoints', async () => {
    const base = 'http://93.184.216.34:8080/live/usr_token/pw_token/master.m3u8';
    const rawMaster = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="ES",URI="audio/es.m3u8"',
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/enc.key"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2500000',
      '1080p/variant.m3u8',
      'fallback_01.ts',
    ].join('\n');

    const rewritten = rewritePlaylistWithOpaqueTokens(
      rawMaster,
      base,
      'http://93.184.216.34:8080/',
      ''
    );

    expect(rewritten).not.toContain('93.184.216.34');
    expect(rewritten).not.toContain('usr_token');
    expect(rewritten).not.toContain('pw_token');

    const subMatches = Array.from(rewritten.matchAll(/\/api\/belix\/sub\/([a-f0-9]+)\.m3u8/g));
    expect(subMatches.length).toBeGreaterThanOrEqual(2);

    const keyMatch = rewritten.match(/URI="\/api\/belix\/seg\/([a-f0-9]+)\.bin"/);
    expect(keyMatch).toBeTruthy();

    const segMatch = rewritten.match(/\/api\/belix\/seg\/([a-f0-9]+)\.ts/);
    expect(segMatch).toBeTruthy();

    mocks.streamingFetch.mockImplementation(async (targetUrl: string) => {
      if (targetUrl.endsWith('/1080p/variant.m3u8')) {
        return makeTextResponse('#EXTM3U\n#EXTINF:4.0,\nseg_live_1.ts\n', targetUrl);
      }
      if (targetUrl.endsWith('fallback_01.ts')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'video/mp2t' },
          arrayBuffer: async () => Uint8Array.from([0x47, 0x40, 0x00, 0x10]).buffer,
        };
      }
      return makeTextResponse('', targetUrl, 404);
    });

    const variantToken = rewritten
      .split('\n')
      .find((l) => l.startsWith('/api/belix/sub/'))!
      .replace('/api/belix/sub/', '');
    const subManifest = await resolveBelixSubPlaylist(variantToken);
    expect(subManifest).toContain('/api/belix/seg/');
    expect(subManifest).not.toContain('usr_token');

    const segData = await fetchBelixOpaqueSegment(`${segMatch![1]}.ts`);
    expect(segData?.status).toBe(200);
    expect(segData?.buffer.byteLength).toBe(4);
  });

  it('falls back to M3U Plus /get.php when get_live_streams fails and warns when connection slots are full', async () => {
    const portalOrigin = 'http://93.184.216.34:8080';
    mocks.streamingFetch.mockImplementation(async (rawUrl: string) => {
      if (rawUrl.includes('action=get_live_categories')) {
        return makeJsonResponse([], 200);
      }
      if (rawUrl.includes('action=get_live_streams')) {
        return makeTextResponse('<html>403</html>', rawUrl, 403, 'text/html');
      }
      if (rawUrl.includes('/get.php')) {
        return makeTextResponse(
          [
            '#EXTM3U',
            '#EXTINF:-1 group-title="ESPAÑA TDT" tvg-logo="https://cdn.example.net/a3.png",Antena 3 HD',
            `${portalOrigin}/live/u/p/701.ts`,
            '#EXTINF:-1 group-title="DEPORTES",Movistar LaLiga HD',
            `${portalOrigin}/live/u/p/702.ts`,
            '#EXTINF:-1 group-title="ADULTS 18+",Restricted Channel',
            `${portalOrigin}/live/u/p/703.ts`,
          ].join('\n'),
          rawUrl,
          200,
          'audio/x-mpegurl'
        );
      }
      if (rawUrl.includes('player_api.php')) {
        return makeJsonResponse({
          user_info: {
            auth: 1,
            status: 'Active',
            active_cons: '2',
            max_connections: '2',
          },
          server_info: { timezone: 'Europe/Madrid' },
        });
      }
      return makeTextResponse('', rawUrl, 404);
    });

    const status = await connectBelixSession({
      serverUrl: portalOrigin,
      username: 'demo_user',
      password: 'demo_password',
    });

    expect(status.connected).toBe(true);
    expect(status.totalRawStreams).toBe(2);
    expect(status.warning).toContain('2/2');
    expect(status.categories.map((c) => c.name)).toEqual(['ESPAÑA TDT', 'DEPORTES']);
    expect(getBelixLiveChannels({ includeAll: true })).toHaveLength(2);
  });
});

describe('RBTV+ Live Sports Curator', () => {
  it('blocks external portals, web_embed/cloud_browser/youtube, broken hosts, and down tracks', () => {
    const badTracks = [
      { id: '1', label: 'Portal', lang: 'ES', sourceUrl: 'https://rbtv77.com/watch/1', resolverType: 'sports_channel' as const },
      { id: '2', label: 'Wv11', lang: 'ES', sourceUrl: 'https://wv11.hkkmwtotalwypubook.cfd/live', resolverType: 'sports_channel' as const },
      { id: '3', label: 'Stmify', lang: 'ES', sourceUrl: 'https://cdn.stmify.com/live/1.m3u8', resolverType: 'direct_hls' as const },
      { id: '4', label: 'Amagi', lang: 'EN', sourceUrl: 'https://playouts.now.amagi.tv/playlist.m3u8', resolverType: 'direct_hls' as const },
      { id: '5', label: 'Embed', lang: 'ES', sourceUrl: 'https://example.org/embed/1', resolverType: 'web_embed' as const },
      { id: '6', label: 'Cloud', lang: 'ES', sourceUrl: 'https://example.org/cloud/1', resolverType: 'cloud_browser' as const },
      { id: '7', label: 'YT', lang: 'ES', sourceUrl: 'dQw4w9WgXcQ', resolverType: 'youtube' as const },
    ];

    for (const tr of badTracks) {
      expect(isDisallowedRbtvTrack(tr)).toBe(true);
    }

    const healthyTrack = {
      id: 'ok-1',
      label: 'DAZN LaLiga HD',
      lang: 'ES',
      sourceUrl: 'https://pig.footunder.online/stream/84',
      resolverType: 'sports_channel' as const,
    };
    const downTrack = {
      id: 'down-1',
      label: 'Down Feed',
      lang: 'ES',
      sourceUrl: 'https://pig.footunder.online/stream/999',
      resolverType: 'sports_channel' as const,
    };

    channelHealthMonitor.setTrackHealth(downTrack.sourceUrl, {
      status: 'down',
      failCount: 2,
      checkedAt: Date.now(),
    });

    const curated = curateSportsTracks([...badTracks, downTrack, healthyTrack]);
    expect(curated).toHaveLength(1);
    expect(curated[0].id).toBe('ok-1');

    const channels = getCuratedRbtvChannels();
    expect(channels.length).toBeGreaterThan(0);
    for (const ch of channels) {
      expect(ch.category).toBe('rbtv_sports');
      expect(ch.sourceHub).toBe('rbtv');
      for (const tr of ch.channels) {
        expect(isDisallowedRbtvTrack(tr)).toBe(false);
        expect(tr.resolverType).not.toBe('web_embed');
        expect(tr.resolverType).not.toBe('cloud_browser');
        expect(tr.resolverType).not.toBe('youtube');
      }
    }
  });
});

describe('ClipBox Native Catalog & Subtitle Normalization', () => {
  it('resolves directOnly extract track, proxies subtitles with normalized ES/LAT/CAT/EN codes, parses TheIntroDB timestamps, and returns zero portalLinks', async () => {
    mocks.extractClipboxDirectStreams.mockResolvedValue({
      tracks: [
        {
          id: 'vidlink-1',
          label: 'VidLink Auto HLS',
          lang: 'VOSE',
          quality: '1080p',
          sourceUrl: 'https://vidlink.pro/api/b/movie/550',
          resolvedStreamUrl: '/api/hls-proxy/abc/master.m3u8',
          resolverType: 'direct_hls',
        },
      ],
      subtitles: [
        {
          id: 'sub-es',
          label: 'Español Castellano',
          lang: 'Spanish',
          url: 'https://cdn.subs.example/fight_es.srt',
          source: 'vidlink.pro',
        },
        {
          id: 'sub-lat',
          label: 'Español Latino',
          lang: 'es-419',
          url: 'https://cdn.subs.example/fight_lat.srt',
          source: 'vidlink.pro',
        },
      ],
    });

    mocks.extractBingetrixEnglishTracks.mockResolvedValue([
      {
        id: 'bingetrix-en-1',
        label: 'English 1080p · S1',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://bingetrix.sc/watch/550',
        resolvedStreamUrl: '/api/hls-proxy/bx/index.m3u8',
        resolverType: 'bingetrix_en',
      },
    ]);

    mocks.searchAggregatedSubtitles.mockResolvedValue([
      {
        id: 'os-cat',
        label: 'Català',
        lang: 'cat',
        url: '/api/subtitles/proxy?url=https%3A%2F%2Fsubs.example%2Fca.srt',
        source: 'opensubtitles',
      },
      {
        id: 'os-en',
        label: 'English',
        lang: 'eng',
        url: 'https://subs.example/en.srt',
        source: 'opensubtitles',
      },
    ]);

    mocks.streamingFetch.mockImplementation(async (url: string) => {
      if (url.includes('api.theintrodb.org')) {
        return makeJsonResponse({
          intro: { start_sec: 12, end_sec: 48 },
          credits: { start_ms: 4820000, end_ms: 4950000 },
        });
      }
      return makeJsonResponse({}, 404);
    });

    const result = await resolveClipboxTitleStreams({
      title: 'Fight Club',
      mediaType: 'movie',
      tmdbId: 550,
    });

    expect(result.portalLinks).toEqual([]);
    expect(result.tracks[0].mode).toBe('extract');
    expect(result.tracks[0].url).toContain('directOnly=1');
    expect(result.tracks.some((t) => t.provider === 'ClipBox Direct (VidLink)' && t.mode === 'hls')).toBe(true);
    expect(result.tracks.some((t) => t.provider === 'Bingetrix Native HLS')).toBe(true);

    expect(result.subtitles.map((s) => s.lang)).toEqual(
      expect.arrayContaining(['ES', 'LAT', 'CAT', 'EN'])
    );
    for (const sub of result.subtitles) {
      expect(sub.url.startsWith('/api/subtitles/proxy')).toBe(true);
    }

    expect(result.introTimestamps).toEqual(
      expect.arrayContaining([
        { type: 'intro', startSec: 12, endSec: 48, source: 'api.theintrodb.org' },
        { type: 'credits', startSec: 4820, endSec: 4950, source: 'api.theintrodb.org' },
      ])
    );
  });
});

describe('Direct-Only Extraction Guard (Zero Popups / Web Embeds)', () => {
  it('skips web_embed tracks and rejects non-direct fallback when directOnly is enabled', async () => {
    const onlyEmbedRes = await resolveOrderedCandidateTracks({
      orderedTracks: [
        {
          id: 'emb-1',
          label: 'External Embed',
          lang: 'ES',
          sourceUrl: 'https://embed.example.net/e/123',
          resolverType: 'web_embed',
        },
      ],
      getLangScore: () => 0,
      sourcePriority: () => 1,
      getTrackHealthScore: () => 0,
      isSandboxedFrame: false,
      directOnly: true,
    });
    expect(onlyEmbedRes).toBeNull();

    const mixedRes = await resolveOrderedCandidateTracks({
      orderedTracks: [
        {
          id: 'emb-first',
          label: 'External Embed',
          lang: 'ES',
          sourceUrl: 'https://embed.example.net/e/123',
          resolverType: 'web_embed',
        },
        {
          id: 'hls-native',
          label: 'Direct Native HLS',
          lang: 'ES',
          sourceUrl: 'https://cdn.example.net/movie/master.m3u8',
          resolvedStreamUrl: '/api/hls-proxy/movie/master.m3u8',
          resolverType: 'direct_hls',
        },
      ],
      getLangScore: () => 0,
      sourcePriority: () => 1,
      getTrackHealthScore: () => 0,
      isSandboxedFrame: false,
      directOnly: true,
    });
    expect(mixedRes).not.toBeNull();
    expect(mixedRes?.primaryMode).toBe('hls');
    expect(mixedRes?.primaryStreamUrl).toBe('/api/hls-proxy/movie/master.m3u8');
    expect(mixedRes?.validTracks.every((t) => t.resolverType !== 'web_embed')).toBe(true);

    const fallbackBlocked = await buildFallbackCatalogResult({
      titleHint: 'Test Movie',
      extractedMovidyCleanTitle: 'Test Movie',
      extractedGnulaCleanTitle: '',
      tmdbResolvedTitle: 'Test Movie',
      effectiveMediaType: 'movie',
      effectiveSeason: 1,
      effectiveEpisode: 1,
      episodeTitleHint: '',
      preferLang: 'ES',
      resolvedTmdbId: 550,
      rawInput: 'tmdb://550',
      isSandboxedFrame: false,
      directOnly: true,
    });
    expect(fallbackBlocked).toBeNull();
  });
});

describe('ClipBox MP4 Reachability Verification & Translucent Small Subtitle Defaults', () => {
  it('discards 429/HTML HEVC MP4 qualities while preserving valid H.264 206 MP4 tracks and ClipBox subtitles', async () => {
    const actualMod = await vi.importActual<typeof import('../server/extractors/clipboxDirectExtractor.ts')>(
      '../server/extractors/clipboxDirectExtractor.ts'
    );

    mocks.streamingFetch.mockImplementation(async (url: string) => {
      if (url.includes('enc-dec.app/api/enc-vidlink')) {
        return makeJsonResponse({ result: 'enc84773' });
      }
      if (url.includes('vidlink.pro/api/b/tv/enc84773/1/2')) {
        return makeJsonResponse({
          stream: {
            qualities: {
              '2160': { url: 'https://bcdn.example.net/resource/h265/4k.mp4', codecName: 'hevc' },
              '1080': { url: 'https://bcdn.example.net/resource/h264/1080.mp4', codecName: 'h264' },
            },
            captions: [
              { url: 'https://cacdn.example.net/subs/es.srt', language: 'Español' },
              { url: 'https://cacdn.example.net/subs/en.srt', language: 'English' },
            ],
          },
        });
      }
      if (url.includes('/h264/1080.mp4')) {
        return {
          ok: true,
          status: 206,
          headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'video/mp4' : null) },
          body: { cancel: async () => {} },
        };
      }
      return makeTextResponse('<html>429 Too Many Requests</html>', url, 429, 'text/html');
    });

    const res = await actualMod.extractClipboxDirectStreams({
      tmdbId: 84773,
      mediaType: 'tv',
      season: 1,
      episode: 2,
    });

    expect(res.tracks).toHaveLength(1);
    expect(res.tracks[0].quality).toBe('1080p MP4');
    expect(res.subtitles.map((s) => s.lang)).toEqual(['ES', 'EN']);

    // If all MP4 candidates return 429 text/html, discard all dead MP4 tracks but keep subtitles
    mocks.streamingFetch.mockImplementation(async (url: string) => {
      if (url.includes('enc-dec.app/api/enc-vidlink')) {
        return makeJsonResponse({ result: 'enc99999' });
      }
      if (url.includes('vidlink.pro/api/b/movie/enc99999')) {
        return makeJsonResponse({
          stream: {
            qualities: {
              '2160': { url: 'https://bcdn.example.net/resource/h265/4k.mp4', codecName: 'hevc' },
            },
            captions: [{ url: 'https://cacdn.example.net/subs/es.srt', language: 'Spanish' }],
          },
        });
      }
      return {
        ok: false,
        status: 429,
        headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/html' : null) },
        body: { cancel: async () => {} },
      };
    });

    const deadRes = await actualMod.extractClipboxDirectStreams({
      tmdbId: 99999,
      mediaType: 'movie',
    });
    expect(deadRes.tracks).toHaveLength(0);
    expect(deadRes.subtitles).toHaveLength(1);
    expect(deadRes.subtitles[0].lang).toBe('ES');
  });

  it('defaults subtitle typography to small font scale and subtle transparency', async () => {
    const { useAppStore } = await import('../src/store/useAppStore.ts');
    const style = useAppStore.getState().subtitleStyle;
    expect(style.fontScale).toBeLessThan(1);
    expect(style.bgOpacity).toBeLessThanOrEqual(0.4);
    expect(style.textOpacity ?? 1).toBeLessThan(0.95);
  });
});
