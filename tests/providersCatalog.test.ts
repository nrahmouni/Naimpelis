import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamingFetch: vi.fn(),
  curlGetText: vi.fn(),
  assertSafeProxyUrl: vi.fn(),
}));

vi.mock('../server/utils/ssrfGuard.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/ssrfGuard.ts')>();
  return {
    ...actual,
    assertSafeProxyUrl: mocks.assertSafeProxyUrl,
  };
});

vi.mock('../server/utils/tlsFetch.ts', () => ({
  streamingFetch: mocks.streamingFetch,
}));

vi.mock('../server/extractors/httpHelpers.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/extractors/httpHelpers.ts')>();
  return {
    ...actual,
    curlGetText: mocks.curlGetText,
  };
});

import {
  buildXtreamM3uUrl,
  buildXtreamMediaUrl,
  buildXtreamPlayerApiUrl,
  defaultProviders,
  providersConfig,
} from '../server/config/defaultProviders.ts';
import {
  connectProviderWithRotation,
  getProviderSeriesDetail,
  getProvidersStatusSummary,
  initDefaultProviders,
  queryProvidersCatalog,
} from '../server/services/providers/xtreamProvidersService.ts';

function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'http://example.test',
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

describe('Multi-Provider Xtream Registry, Rotation & Catálogo Total', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSafeProxyUrl.mockImplementation(async (raw: string) => new URL(raw));
    mocks.curlGetText.mockResolvedValue({ text: '', effectiveUrl: '' });
  });

  it('registers all 5 requested servers and exact rotation accounts in providersConfig', () => {
    expect(defaultProviders).toBe(providersConfig);
    expect(providersConfig.map((p) => p.id)).toEqual([
      'vod4k',
      '2m2h-alt',
      'adtupac',
      'ultra-vip',
      'sult-vo',
    ]);
    expect(providersConfig.every((p) => p.autoConnect)).toBe(true);

    const vod4k = providersConfig.find((p) => p.id === 'vod4k');
    expect(vod4k?.serverUrl).toBe('http://vod4k.cc:80');
    expect(vod4k?.accounts).toEqual([
      { username: '4413658251491390', password: '4413658251491390' },
      { username: '3178886199166690', password: '8242297241' },
    ]);

    const m2h = providersConfig.find((p) => p.id === '2m2h-alt');
    expect(m2h?.serverUrl).toBe('http://3jrg5v.2m2h.im:80');
    expect(m2h?.accounts).toEqual([{ username: 'NBA00382', password: '9100177277' }]);

    const adtupac = providersConfig.find((p) => p.id === 'adtupac');
    expect(adtupac?.serverUrl).toBe('http://a.adtupac.top:80');
    expect(adtupac?.accounts).toEqual([
      { username: 'Ricardo-alves@2023@R', password: '7X4EuvXdEdYr2C' },
    ]);

    const ultra = providersConfig.find((p) => p.id === 'ultra-vip');
    expect(ultra?.serverUrl).toBe('http://ultra-vip.net:8080');
    expect(ultra?.accounts).toEqual([{ username: 'GzheRdD6J', password: 'c78sXxk15' }]);

    const sult = providersConfig.find((p) => p.id === 'sult-vo');
    expect(sult?.serverUrl).toBe('http://sult-vo.xyz:80');
    expect(sult?.accounts).toEqual([
      { username: '4426530274896970', password: '4426530274896970' },
      { username: '2225190801115579', password: '2225190801115579' },
      { username: '4453758394245202', password: '4453758394245202' },
    ]);
  });

  it('encodes special symbols and spaces using encodeURIComponent()', () => {
    const adtupac = providersConfig.find((p) => p.id === 'adtupac')!;
    const apiUrl = buildXtreamPlayerApiUrl(adtupac.serverUrl, adtupac.accounts[0], 'get_vod_streams');
    expect(apiUrl).toContain('username=Ricardo-alves%402023%40R');
    expect(apiUrl).toContain('password=7X4EuvXdEdYr2C');
    expect(apiUrl).toContain('action=get_vod_streams');

    const spaceAcct = { username: 'user name+1', password: 'p@ss word/2' };
    expect(buildXtreamM3uUrl('http://sult-vo.xyz:80', spaceAcct)).toBe(
      'http://sult-vo.xyz/get.php?username=user%20name%2B1&password=p%40ss%20word%2F2&type=m3u_plus&output=ts'
    );
    expect(buildXtreamMediaUrl('http://ultra-vip.net:8080', spaceAcct, 'movie', '991', 'mkv')).toBe(
      'http://ultra-vip.net:8080/movie/user%20name%2B1/p%40ss%20word%2F2/991.mkv'
    );
  });

  it('rotates accounts automatically on auth failure/saturation, aggregates Catálogo Total, and hides credentials', async () => {
    mocks.streamingFetch.mockImplementation(async (rawUrl: string) => {
      const u = new URL(rawUrl);
      const user = u.searchParams.get('username') || '';
      const action = u.searchParams.get('action') || '';

      // VOD 4K: first account expired -> rotate to second account
      if (u.hostname === 'vod4k.cc') {
        if (user === '4413658251491390') {
          return makeJsonResponse({ user_info: { auth: 1, status: 'Expired' } });
        }
        if (!action) {
          return makeJsonResponse({ user_info: { auth: 1, status: 'Active', active_cons: '0', max_connections: '2' } });
        }
        if (action === 'get_live_categories') return makeJsonResponse([{ category_id: '1', category_name: 'España HD' }]);
        if (action === 'get_live_streams') return makeJsonResponse([{ stream_id: 101, name: 'La 1 UHD', category_id: '1' }]);
        if (action === 'get_vod_categories') return makeJsonResponse([{ category_id: '10', category_name: 'Cine 4K' }]);
        if (action === 'get_vod_streams') return makeJsonResponse([{ stream_id: 202, name: 'Dune 4K', category_id: '10', container_extension: 'mp4' }]);
        if (action === 'get_series_categories') return makeJsonResponse([{ category_id: '20', category_name: 'Series' }]);
        if (action === 'get_series') return makeJsonResponse([{ series_id: 303, name: 'Dark', category_id: '20' }]);
        if (action === 'get_series_info') {
          return makeJsonResponse({
            info: { name: 'Dark' },
            episodes: {
              '1': [{ id: '9001', episode_num: 1, title: 'Secretos', container_extension: 'mkv' }],
            },
          });
        }
      }

      // Sult-Vo: account 1 saturated (active_cons >= max_connections), account 2 rejects auth -> rotate to account 3
      if (u.hostname === 'sult-vo.xyz') {
        if (user === '4426530274896970') {
          return makeJsonResponse({ user_info: { auth: 1, status: 'Active', active_cons: '1', max_connections: '1' } });
        }
        if (user === '2225190801115579') {
          return makeJsonResponse({ user_info: { auth: 0 } }, 401);
        }
        if (!action) {
          return makeJsonResponse({ user_info: { auth: 1, status: 'Active', active_cons: '0', max_connections: '1' } });
        }
        if (action === 'get_live_categories') return makeJsonResponse([{ category_id: '2', category_name: 'Deportes' }]);
        if (action === 'get_live_streams') return makeJsonResponse([{ stream_id: 505, name: 'DAZN F1 HD', category_id: '2' }]);
        return makeJsonResponse([]);
      }

      // Remaining 3 servers succeed with sample catalog items
      if (!action) {
        return makeJsonResponse({ user_info: { auth: 1, status: 'Active', active_cons: '0', max_connections: '2' } });
      }
      if (action === 'get_live_categories') return makeJsonResponse([{ category_id: '9', category_name: 'General' }]);
      if (action === 'get_live_streams') return makeJsonResponse([{ stream_id: 700, name: 'Canal Estelar HD', category_id: '9' }]);
      if (action === 'get_vod_categories') return makeJsonResponse([{ category_id: '19', category_name: 'Estrenos' }]);
      if (action === 'get_vod_streams') return makeJsonResponse([{ stream_id: 800, name: 'Peli Estelar 4K', category_id: '19', container_extension: 'mp4' }]);
      return makeJsonResponse([]);
    });

    const results = await initDefaultProviders({ force: true });
    expect(results).toHaveLength(5);

    const vod4kStatus = results.find((r) => r.id === 'vod4k')!;
    expect(vod4kStatus.connected).toBe(true);
    expect(vod4kStatus.activeAccountSlot).toBe(2);
    expect(vod4kStatus.liveCount).toBe(1);
    expect(vod4kStatus.movieCount).toBe(1);
    expect(vod4kStatus.seriesCount).toBe(1);

    const sultStatus = results.find((r) => r.id === 'sult-vo')!;
    expect(sultStatus.connected).toBe(true);
    expect(sultStatus.activeAccountSlot).toBe(3);

    const statusSummary = getProvidersStatusSummary();
    expect(statusSummary.totals.connectedCount).toBe(5);
    expect(statusSummary.totals.totalProviders).toBe(5);

    // Individual server query
    const vodCatalog = queryProvidersCatalog({ scope: 'vod4k', kind: 'all' });
    expect(vodCatalog.total).toBe(3);
    expect(vodCatalog.items.find((i) => i.kind === 'movie')?.streamUrl).toBe('/api/providers/stream/vod4k/movie/202.mp4');

    // Catálogo Total aggregation query
    const totalCatalog = queryProvidersCatalog({ scope: 'total', kind: 'all' });
    expect(totalCatalog.total).toBeGreaterThanOrEqual(10);

    // Series detail resolution returns credential-free proxy URL
    const seriesDetail = await getProviderSeriesDetail('vod4k', '303');
    expect(seriesDetail?.seasons[0].episodes[0].streamUrl).toBe('/api/providers/stream/vod4k/series/9001.mkv');

    // Verify ZERO credentials or upstream hosts leak in serialized client DTOs
    const serialized = JSON.stringify({ statusSummary, totalCatalog, seriesDetail });
    for (const secret of [
      '4413658251491390',
      '3178886199166690',
      '8242297241',
      'NBA00382',
      '9100177277',
      'Ricardo-alves',
      '7X4EuvXdEdYr2C',
      'GzheRdD6J',
      'c78sXxk15',
      '4426530274896970',
      '2225190801115579',
      '4453758394245202',
      'vod4k.cc',
      '2m2h.im',
      'adtupac.top',
      'ultra-vip.net',
      'sult-vo.xyz',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    // Re-connect explicit single provider check
    const singleReconnect = await connectProviderWithRotation('adtupac', { force: true });
    expect(singleReconnect.connected).toBe(true);
  });
});
