import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const { streamingFetchMock } = vi.hoisted(() => ({
  streamingFetchMock: vi.fn(),
}));

vi.mock('../server/utils/tlsFetch.ts', () => ({
  streamingFetch: streamingFetchMock,
}));

vi.mock('../server/utils/ssrfGuard.ts', async () => {
  const actual = await vi.importActual<typeof import('../server/utils/ssrfGuard.ts')>(
    '../server/utils/ssrfGuard.ts'
  );
  return {
    ...actual,
    assertSafeProxyUrl: vi.fn(async (rawUrl: string) => {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        throw new Error('Forbidden private or local host');
      }
      return parsed;
    }),
  };
});

import {
  EXTRA_XTREAM_PROVIDERS,
  clearRuntimeVaultProviders,
  danaActiveConfig,
  getExtraXtreamProviders,
  getOctopusTvConfig,
  getVod4kConfig,
} from '../server/services/providersConfig.ts';
import {
  buildPlayerApiUrl,
  buildUpstreamStreamUrl,
  clearXtreamSessionCache,
  getCachedXtreamLiveTdtChannels,
  getLiveCategories,
  getLiveStreams,
  getVodCategories,
  getXtreamConnectionStatus,
  runXtreamConnectionDiagnostics,
  syncFullCatalog,
} from '../server/services/xtreamService.ts';
import { registerXtreamRoutes } from '../server/routes/xtreamRoutes.ts';

function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'http://xtream.example.test/player_api.php',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
  };
}

function makeTextResponse(
  body: string,
  url: string,
  status = 200,
  contentType = 'application/vnd.apple.mpegurl'
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers({ 'content-type': contentType }),
    text: async () => body,
    arrayBuffer: async () => Buffer.from(body),
  };
}

async function withExpressApp(
  setup: (app: express.Express) => void,
  fn: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use(express.json());
  setup(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const XTREAM_ENV_KEYS = [
  'XTREAM_SERVER_URL',
  'XTREAM_ACCOUNTS_JSON',
  'VITE_XTREAM_SERVER_URL',
  'VITE_XTREAM_ACCOUNTS_JSON',
  'VOD4K_SERVER_URL',
  'VOD4K_USERNAME',
  'VOD4K_PASSWORD',
  'VITE_VOD4K_USERNAME',
  'VITE_VOD4K_PASSWORD',
  'EXTRA_PROVIDERS_JSON',
  'VITE_EXTRA_PROVIDERS_JSON',
  'DANA4K_SERVER_URL',
  'DANA4K_ACCOUNTS_JSON',
  'VITE_DANA4K_ACCOUNTS_JSON',
  'DANA4K_USERNAME',
  'DANA4K_PASSWORD',
  'ACTIVE_CDNS_SERVER_URL',
  'ACTIVE_CDNS_USERNAME',
  'ACTIVE_CDNS_PASSWORD',
  'OCTOPUS_SERVER_URL',
  'OCTOPUS_USERNAME',
  'OCTOPUS_PASSWORD',
  'VITE_OCTOPUS_SERVER_URL',
  'VITE_OCTOPUS_USERNAME',
  'VITE_OCTOPUS_PASSWORD',
] as const;

describe('xtreamService & xtreamRoutes (multi-provider)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearRuntimeVaultProviders();
    clearXtreamSessionCache();
    streamingFetchMock.mockReset();
    for (const key of XTREAM_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    clearRuntimeVaultProviders();
    clearXtreamSessionCache();
    for (const key of XTREAM_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('returns clear unconfigured masked status when env vars are missing', async () => {
    const status = await getXtreamConnectionStatus(true);
    expect(status.configured).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.maskedUsername).toBe('********');
    expect(status.error).toContain('XTREAM_SERVER_URL');
  });

  it('defines EXTRA_XTREAM_PROVIDERS and danaActiveConfig defaults with empty credentials and process.env reading', () => {
    expect(EXTRA_XTREAM_PROVIDERS.map((p) => p.id)).toEqual(['24tv', '2m2h']);
    expect(EXTRA_XTREAM_PROVIDERS[0]?.user).toBe('');
    expect(EXTRA_XTREAM_PROVIDERS[0]?.pass).toBe('');
    expect(EXTRA_XTREAM_PROVIDERS[1]?.serverUrl).toBe('http://2kzbmq.2m2h.im:80');

    expect(danaActiveConfig.defaults.dana4k.defaultServerUrl).toBe('http://dana4kpro.com:8080');
    expect(danaActiveConfig.defaults.activecdns.defaultServerUrl).toBe('http://active.cdns.today:80');

    const vodDefault = getVod4kConfig();
    expect(vodDefault.serverUrl).toBe('http://vod4k.cc:80');
    expect(vodDefault.accounts).toEqual([]);

    const octopusDefault = getOctopusTvConfig();
    expect(octopusDefault.id).toBe('octopus');
    expect(octopusDefault.name).toBe('Octopus TV');
    expect(octopusDefault.serverUrl).toBe('http://octopustv.xyz:80');
    expect(octopusDefault.accounts).toEqual([]);

    process.env.VITE_DANA4K_ACCOUNTS_JSON = JSON.stringify([
      { user: 'user with space', pass: 'pass with space' },
      { user: 'backupUser', pass: 'backupPass' },
    ]);
    process.env.VITE_OCTOPUS_USERNAME = 'octoUser';
    process.env.VITE_OCTOPUS_PASSWORD = 'octoPass';
    const danaProviders = danaActiveConfig.getProviders();
    expect(danaProviders[0]?.accounts).toHaveLength(2);
    expect(danaProviders[0]?.accounts[0]?.username).toBe('user with space');
    expect(danaProviders[1]?.accounts).toEqual([]);
    expect(getOctopusTvConfig().accounts[0]).toMatchObject({
      username: 'octoUser',
      password: 'octoPass',
    });

    const extra = getExtraXtreamProviders(
      JSON.stringify([{ name: '2M2H', user: 'u space', pass: 'p space' }])
    );
    expect(extra.find((p) => p.id === '2m2h')?.accounts[0]).toMatchObject({
      username: 'u space',
      password: 'p space',
    });

    const apiUrl = buildPlayerApiUrl(
      'http://dana4k.example.test:8080',
      { username: 'user with space', password: 'pass with space' },
      'get_live_streams'
    );
    expect(apiUrl).toContain('username=user%20with%20space');
    expect(apiUrl).toContain('password=pass%20with%20space');
  });

  it('automatically rotates to fallback account when first account is not Active', async () => {
    process.env.XTREAM_SERVER_URL = 'http://xtream.example.test:80';
    process.env.XTREAM_ACCOUNTS_JSON = JSON.stringify([
      { username: 'expiredUserSecret', password: 'expiredPassSecret' },
      { username: 'activeUserSecret', password: 'activePassSecret' },
    ]);

    streamingFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('expiredUserSecret')) {
        return makeJsonResponse({ user_info: { auth: 1, status: 'Expired' } });
      }
      if (url.includes('activeUserSecret') && !url.includes('action=')) {
        return makeJsonResponse({
          user_info: {
            auth: 1,
            status: 'Active',
            active_cons: '0',
            max_connections: '2',
            exp_date: '1793145600',
          },
        });
      }
      if (url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '10', category_name: 'Deportes' }]);
      }
      if (url.includes('action=get_vod_categories')) {
        return makeJsonResponse([{ category_id: '20', category_name: 'Cine' }]);
      }
      if (url.includes('action=get_live_streams') && url.includes('category_id=10')) {
        return makeJsonResponse([
          { num: 7, stream_id: 501, name: 'Canal Demo HD', category_id: '10' },
        ]);
      }
      return makeJsonResponse({}, 404);
    });

    const status = await getXtreamConnectionStatus(true);
    expect(status.connected).toBe(true);
    expect(status.accountNumber).toBe(2);
    expect(status.accountLabel).toBe('Cuenta 2: Activa');
    expect(status.serverLabel).toBe('Servidor Activo');
    expect(status.maskedUsername).toBe('********');

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('expiredUserSecret');
    expect(serialized).not.toContain('activeUserSecret');
    expect(serialized).not.toContain('activePassSecret');
    expect(serialized).not.toContain('xtream.example.test');

    const liveCats = await getLiveCategories();
    expect(liveCats.ok).toBe(true);
    expect(liveCats.categories[0]).toMatchObject({ id: '10', name: 'Deportes', type: 'live' });

    const vodCats = await getVodCategories();
    expect(vodCats.ok).toBe(true);
    expect(vodCats.categories[0]).toMatchObject({ id: '20', name: 'Cine', type: 'vod' });

    const streams = await getLiveStreams('10');
    expect(streams.ok).toBe(true);
    expect(streams.streams[0]?.num).toBe(7);
    expect(streams.streams[0]?.playbackUrl).toBe('/api/xtream/stream/501.m3u8');
    expect(JSON.stringify(streams)).not.toContain('activePassSecret');

    const upstreamUrl = buildUpstreamStreamUrl(
      'http://xtream.example.test:80',
      { username: 'activeUserSecret', password: 'activePassSecret' },
      '501'
    );
    expect(upstreamUrl).toBe('http://xtream.example.test:80/activeUserSecret/activePassSecret/501.m3u8');
  });

  it('syncs multi-provider catalogs (primary, vod4k, dana4k, activecdns), caches 6h, and runs diagnostics', async () => {
    process.env.XTREAM_SERVER_URL = 'http://xtream.example.test:80';
    process.env.XTREAM_ACCOUNTS_JSON = JSON.stringify([
      { username: 'accOneSecret', password: 'pw1' },
      { username: 'accTwoSecret', password: 'pw2' },
    ]);
    process.env.VOD4K_SERVER_URL = 'http://vod4k.example.test:80';
    process.env.VOD4K_USERNAME = 'vodSecretUser';
    process.env.VOD4K_PASSWORD = 'vodSecretPass';
    process.env.DANA4K_SERVER_URL = 'http://dana4k.example.test:8080';
    process.env.DANA4K_USERNAME = 'dana user space';
    process.env.DANA4K_PASSWORD = 'danaPassSecret';

    streamingFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('accOneSecret') && !url.includes('action=')) {
        return makeJsonResponse({ user_info: { auth: 1, status: 'Expired' } });
      }
      if (!url.includes('action=')) {
        return makeJsonResponse({
          user_info: {
            auth: 1,
            status: 'Active',
            active_cons: '1',
            max_connections: '3',
            exp_date: '1793145600',
          },
        });
      }
      if (url.includes('vod4k.example.test') && url.includes('action=get_vod_categories')) {
        return makeJsonResponse([{ category_id: '9', category_name: '4K Películas' }]);
      }
      if (url.includes('vod4k.example.test') && url.includes('action=get_vod_streams')) {
        return makeJsonResponse([
          { num: 1, stream_id: '901', name: 'Película 4K Demo', category_id: '9', container_extension: 'mp4' },
        ]);
      }
      if (url.includes('dana4k.example.test') && url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '4', category_name: 'Dana Deportes' }]);
      }
      if (url.includes('dana4k.example.test') && url.includes('action=get_live_streams')) {
        return makeJsonResponse([
          { num: 12, stream_id: '401', name: 'Dana HD', category_id: '4' },
        ]);
      }
      if (url.includes('xtream.example.test') && url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '1', category_name: 'TDT España' }]);
      }
      if (url.includes('xtream.example.test') && url.includes('action=get_live_streams')) {
        return makeJsonResponse([
          { num: 1, stream_id: '101', name: 'La 1 HD', category_id: '1', stream_icon: 'https://cdn.example.test/la1.png' },
        ]);
      }
      if (url.includes('xtream.example.test') && url.includes('action=get_vod_categories')) {
        return makeJsonResponse([{ category_id: '2', category_name: 'Estrenos' }]);
      }
      if (url.includes('xtream.example.test') && url.includes('action=get_vod_streams')) {
        return makeJsonResponse([
          { num: 1, stream_id: '201', name: 'Película Demo', category_id: '2', container_extension: 'mp4' },
        ]);
      }
      if (url.includes('xtream.example.test') && url.includes('action=get_series_categories')) {
        return makeJsonResponse([{ category_id: '3', category_name: 'Ficción' }]);
      }
      if (url.includes('xtream.example.test') && url.includes('action=get_series')) {
        return makeJsonResponse([
          { num: 1, series_id: '301', name: 'Serie Demo', category_id: '3' },
        ]);
      }
      return makeJsonResponse([], 200);
    });

    const firstSync = await syncFullCatalog(false, 'primary');
    expect(firstSync.ok).toBe(true);
    expect(firstSync.catalog?.fromCache).toBe(false);
    expect(firstSync.catalog?.counts).toEqual({
      liveCategories: 1,
      liveStreams: 1,
      vodCategories: 1,
      vodStreams: 1,
      seriesCategories: 1,
      series: 1,
    });

    const danaCombined = await syncFullCatalog(false, 'dana_active');
    expect(danaCombined.ok).toBe(true);
    expect(danaCombined.catalog?.providerId).toBe('dana_active');
    expect(danaCombined.catalog?.liveStreams[0]?.name).toBe('Dana HD');

    const vodSync = await syncFullCatalog(false, 'vod4k');
    expect(vodSync.ok).toBe(true);
    expect(vodSync.catalog?.vodStreams[0]?.playbackUrl).toContain('provider=vod4k');

    const autoIntegrated = getCachedXtreamLiveTdtChannels();
    expect(autoIntegrated.length).toBeGreaterThanOrEqual(2);
    expect(autoIntegrated.find((c) => c.name === 'La 1 HD')?.channels[0]?.sourceUrl).toBe(
      '/api/xtream/stream/101.m3u8'
    );

    const callsAfterFirstSync = streamingFetchMock.mock.calls.length;
    const secondSync = await syncFullCatalog(false, 'primary');
    expect(secondSync.ok).toBe(true);
    expect(secondSync.catalog?.fromCache).toBe(true);
    expect(streamingFetchMock.mock.calls.length).toBe(callsAfterFirstSync);

    const report = await runXtreamConnectionDiagnostics();
    expect(report.connected).toBe(true);
    expect(report.accounts).toHaveLength(2);
    expect(report.accounts[0]?.statusLabel).toBe('Inactiva');
    expect(report.accounts[1]?.statusLabel).toBe('Activa');
    expect(report.providers.find((p) => p.id === 'primary')?.state).toBe('Activo');
    expect(report.providers.find((p) => p.id === 'vod4k')?.state).toBe('Activo');
    expect(report.providers.find((p) => p.id === 'dana4k')?.state).toBe('Activo');
    expect(report.providers.find((p) => p.id === 'activecdns')?.state).toBe('Sin configurar');
    expect(report.providers.find((p) => p.id === '24tv')?.state).toBe('Sin configurar');

    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toContain('accOneSecret');
    expect(serializedReport).not.toContain('accTwoSecret');
    expect(serializedReport).not.toContain('vodSecretUser');
    expect(serializedReport).not.toContain('danaPassSecret');
    expect(serializedReport).not.toContain('xtream.example.test');
    expect(serializedReport).not.toContain('dana4k.example.test');
  });

  it('rejects private/loopback XTREAM_SERVER_URL safely', async () => {
    process.env.XTREAM_SERVER_URL = 'http://127.0.0.1:8080';
    process.env.XTREAM_ACCOUNTS_JSON = JSON.stringify([{ username: 'u1', password: 'p1' }]);

    const status = await getXtreamConnectionStatus(true);
    expect(status.connected).toBe(false);
    expect(status.userStatus).toBe('Blocked');
    expect(streamingFetchMock).not.toHaveBeenCalled();
  });

  it('serves CORS/Mixed-Content safe backend proxy routes including /api/stream?provider=dana4k&id=...', async () => {
    process.env.DANA4K_SERVER_URL = 'http://dana4k.example.test:8080';
    process.env.DANA4K_USERNAME = 'u space';
    process.env.DANA4K_PASSWORD = 'pSecret';

    streamingFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('player_api.php') && !url.includes('action=')) {
        return makeJsonResponse({ user_info: { auth: 1, status: 'Active' } });
      }
      if (url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '1', category_name: 'General' }]);
      }
      if (url.includes('/u%20space/pSecret/999.m3u8')) {
        return makeTextResponse(
          '#EXTM3U\n#EXTINF:4.0,\nhttp://dana4k.example.test:8080/hls/seg1.ts\n',
          url
        );
      }
      return makeJsonResponse({}, 404);
    });

    await withExpressApp(
      (app) => registerXtreamRoutes(app),
      async (baseUrl) => {
        const provRes = await fetch(`${baseUrl}/api/xtream/providers`);
        expect(provRes.status).toBe(200);
        const provJson = (await provRes.json()) as {
          success: boolean;
          providers: Array<{ id: string; configured: boolean }>;
        };
        expect(provJson.success).toBe(true);
        expect(provJson.providers.find((p) => p.id === 'dana4k')?.configured).toBe(true);

        const apiRes = await fetch(
          `${baseUrl}/api/xtream/player-api?action=get_live_categories&provider=dana4k`
        );
        expect(apiRes.status).toBe(200);
        const apiJson = (await apiRes.json()) as { success: boolean; data: unknown[] };
        expect(apiJson.success).toBe(true);
        expect(apiJson.data).toEqual([{ category_id: '1', category_name: 'General' }]);

        const hlsRes = await fetch(`${baseUrl}/api/stream?provider=dana4k&id=999`);
        expect(hlsRes.status).toBe(200);
        const hlsText = await hlsRes.text();
        expect(hlsText).toContain('#EXTM3U');
        expect(hlsText).toContain('/api/xtream/seg/');
        expect(hlsText).not.toContain('u%20space');
        expect(hlsText).not.toContain('pSecret');
        expect(hlsText).not.toContain('dana4k.example.test');
      }
    );
  });

  it('returns 503 when all accounts fail or are inactive', async () => {
    process.env.XTREAM_SERVER_URL = 'http://xtream.example.test:80';
    process.env.XTREAM_ACCOUNTS_JSON = JSON.stringify([
      { username: 'u1', password: 'p1' },
      { username: 'u2', password: 'p2' },
    ]);

    streamingFetchMock.mockResolvedValue(
      makeJsonResponse({ user_info: { auth: 1, status: 'Banned' } })
    );

    await withExpressApp(
      (app) => registerXtreamRoutes(app),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/xtream/categories`);
        expect(res.status).toBe(503);
        const json = (await res.json()) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error).toContain('Ninguna cuenta');
      }
    );
  });

  it('rotates DANA4K_ACCOUNTS_JSON, integrates Octopus TV via Base64 vault sync, and recalculates audit totals without exposing secrets', async () => {
    const vaultPayload = {
      DANA4K_SERVER_URL: 'http://dana4k.example.test:8080',
      DANA4K_ACCOUNTS_JSON: [
        { user: 'dana one space', pass: 'danaFailSecret' },
        { user: 'danaBackupUser', pass: 'danaBackupSecret' },
      ],
      OCTOPUS_SERVER_URL: 'http://octopus.example.test:80',
      OCTOPUS_USERNAME: 'octoSecretUser',
      OCTOPUS_PASSWORD: 'octoSecretPass',
    };
    const vaultB64 = Buffer.from(JSON.stringify(vaultPayload), 'utf8').toString('base64');

    streamingFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('dana%20one%20space') && !url.includes('action=')) {
        return makeJsonResponse({ user_info: { auth: 1, status: 'Expired' } });
      }
      if (!url.includes('action=') && url.includes('player_api.php')) {
        return makeJsonResponse({ user_info: { auth: 1, status: 'Active', max_connections: '2' } });
      }
      if (url.includes('octopus.example.test') && url.includes('action=get_live_categories')) {
        return makeJsonResponse([{ category_id: '7', category_name: 'Octopus Deportes' }]);
      }
      if (url.includes('octopus.example.test') && url.includes('action=get_live_streams')) {
        return makeJsonResponse([{ num: 88, stream_id: '777', name: 'Octopus Sports HD', category_id: '7' }]);
      }
      if (url.includes('octopus.example.test') && url.includes('action=get_vod_streams')) {
        return makeJsonResponse([
          { num: 1, stream_id: '778', name: 'Octopus Cine 4K', category_id: '8', container_extension: 'mp4' },
        ]);
      }
      if (url.includes('octopus.example.test') && url.includes('action=get_series')) {
        return makeJsonResponse([{ num: 1, series_id: '779', name: 'Octopus Serie Demo', category_id: '9' }]);
      }
      if (url.includes('dana4k.example.test') && url.includes('action=get_live_streams')) {
        return makeJsonResponse([{ num: 5, stream_id: '555', name: 'Dana Backup Live', category_id: '5' }]);
      }
      if (url.includes('octoSecretUser/octoSecretPass/777.m3u8')) {
        return makeTextResponse('#EXTM3U\n#EXTINF:4.0,\nhttp://octopus.example.test:80/s1.ts\n', url);
      }
      return makeJsonResponse([], 200);
    });

    await withExpressApp(
      (app) => registerXtreamRoutes(app),
      async (baseUrl) => {
        const syncRes = await fetch(`${baseUrl}/api/xtream/vault/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vaultB64, autoSync: true }),
        });
        expect(syncRes.status).toBe(200);
        const syncJson = (await syncRes.json()) as {
          success: boolean;
          providers: Array<{ id: string; configured: boolean; totalAccounts: number }>;
          counts: { liveStreams: number; vodStreams: number; series: number };
        };
        expect(syncJson.success).toBe(true);
        expect(syncJson.providers.find((p) => p.id === 'dana4k')).toMatchObject({
          configured: true,
          totalAccounts: 2,
        });
        expect(syncJson.providers.find((p) => p.id === 'octopus')).toMatchObject({
          configured: true,
          totalAccounts: 1,
        });
        expect(syncJson.counts).toMatchObject({
          liveStreams: 2,
          vodStreams: 1,
          series: 1,
        });
        expect(JSON.stringify(syncJson)).not.toContain('octoSecretPass');
        expect(JSON.stringify(syncJson)).not.toContain('danaBackupSecret');

        const diagRes = await fetch(`${baseUrl}/api/xtream/test-connection?refresh=1`, {
          method: 'POST',
        });
        expect(diagRes.status).toBe(200);
        const diagJson = (await diagRes.json()) as {
          report: {
            catalogCounts: { liveChannels: number; vodMovies: number; series: number };
            providers: Array<{ id: string; connected: boolean; activeAccountNumber: number | null }>;
          };
        };
        expect(diagJson.report.catalogCounts).toMatchObject({
          liveChannels: 2,
          vodMovies: 1,
          series: 1,
        });
        expect(diagJson.report.providers.find((p) => p.id === 'dana4k')).toMatchObject({
          connected: true,
          activeAccountNumber: 2,
        });
        expect(diagJson.report.providers.find((p) => p.id === 'octopus')?.connected).toBe(true);
        expect(JSON.stringify(diagJson)).not.toContain('octoSecretUser');
        expect(JSON.stringify(diagJson)).not.toContain('danaFailSecret');

        const streamRes = await fetch(`${baseUrl}/api/stream?provider=octopus&id=777`);
        expect(streamRes.status).toBe(200);
        const m3u8 = await streamRes.text();
        expect(m3u8).toContain('/api/xtream/seg/');
        expect(m3u8).not.toContain('octoSecretPass');
        expect(m3u8).not.toContain('octopus.example.test');
      }
    );
  });
});
