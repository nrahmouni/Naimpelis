import type express from 'express';
import { getDefaultProviderById } from '../../src/config/defaultProviders.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from './proxies/proxyUtils.ts';
import {
  decryptOpaqueArtworkToken,
  fetchProviderOpaqueSegment,
  fetchProviderSeriesInfo,
  fetchXtreamJsonAction,
  getProviderStatusSummaries,
  getRotatedAccountOrder,
  resolveProviderLiveManifest,
  resolveProviderSubPlaylist,
  streamProviderVodOrSeries,
  syncProviderCatalog,
  warmDefaultProvidersBackground,
} from '../services/providers/xtreamMultiProviderService.ts';
import {
  findFastProviderLiveSignals,
  searchFastProviderIndex,
} from '../services/providers/xtreamFastSignalService.ts';

const ALLOWED_PROXY_ACTIONS = new Set([
  'get_live_categories',
  'get_live_streams',
  'get_vod_categories',
  'get_vod_streams',
  'get_series_categories',
  'get_series',
  'get_series_info',
]);

export function registerProvidersRoutes(
  app: express.Application,
  opts: { getPublicOrigin: (req: express.Request) => string }
): void {
  const { getPublicOrigin } = opts;

  app.post('/api/providers/xtream/sync', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Cache-Control', 'no-store');

    const providerId = String(req.body?.providerId || '').trim();
    const forceRefresh = Boolean(req.body?.forceRefresh);
    if (!providerId || !getDefaultProviderById(providerId)) {
      res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
      return;
    }

    const catalog = await syncProviderCatalog(providerId, forceRefresh);
    if (!catalog) {
      res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
      return;
    }

    res.json({ success: true, catalog });
  });

  app.get('/api/providers/status', (req, res) => {
    const reqId = getOrCreateRequestId(req);
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Cache-Control', 'no-store');
    warmDefaultProvidersBackground();
    const providers = getProviderStatusSummaries();
    res.json({ success: true, providers });
  });

  app.get('/api/providers/search', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Cache-Control', 'private, max-age=60');
    const q = String(req.query.q || '').trim();
    const limitRaw = parseInt(String(req.query.limit || '16'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(48, Math.max(4, limitRaw)) : 16;
    if (q.length < 2) {
      res.json({ success: true, live: [], movies: [], series: [], indexedProviders: 0 });
      return;
    }
    const results = await searchFastProviderIndex(q, limit);
    res.json({ success: true, ...results });
  });

  app.get('/api/providers/fast-live-signal', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Cache-Control', 'private, max-age=60');
    const title = String(req.query.title || '').trim();
    const limitRaw = parseInt(String(req.query.limit || '4'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(8, Math.max(1, limitRaw)) : 4;
    if (title.length < 2) {
      res.json({ success: true, tracks: [] });
      return;
    }
    const tracks = await findFastProviderLiveSignals(title, limit);
    res.json({ success: true, tracks });
  });

  app.post('/api/providers/xtream/proxy', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Cache-Control', 'no-store');

    const providerId = String(req.body?.providerId || '').trim();
    const action = String(req.body?.action || '').trim();
    const seriesId = req.body?.seriesId ? String(req.body.seriesId).trim() : undefined;

    const provider = getDefaultProviderById(providerId);
    if (!provider || !ALLOWED_PROXY_ACTIONS.has(action)) {
      res.status(400).json({ success: false, error: 'Solicitud inválida' });
      return;
    }

    const extra = seriesId ? { series_id: seriesId } : undefined;
    for (const { account } of getRotatedAccountOrder(provider)) {
      try {
        const result = await fetchXtreamJsonAction(provider.baseUrl, account, action, extra);
        if (result.ok) {
          res.json({ success: true, data: result.data });
          return;
        }
      } catch {
        // rotate cleanly without exposing credentials or hostnames
      }
    }

    res.status(502).json({ success: false, error: 'No disponible temporalmente' });
  });

  app.get('/api/providers/series-info/:providerId/:seriesId', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Cache-Control', 'private, max-age=300');

    const providerId = String(req.params.providerId || '').trim();
    const seriesId = String(req.params.seriesId || '').trim();
    const info = await fetchProviderSeriesInfo(providerId, seriesId);
    if (!info) {
      res.status(404).json({ success: false, error: 'Información de serie no disponible' });
      return;
    }
    res.json({ success: true, info });
  });

  app.all('/api/providers/live/:providerId/:streamId', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }

    const providerId = String(req.params.providerId || '').trim();
    const streamId = String(req.params.streamId || '').trim();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';

    if (req.method === 'HEAD') {
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.status(200).end();
      return;
    }

    const manifest = await resolveProviderLiveManifest(providerId, streamId, absOrigin);
    if (!manifest) {
      res.status(502).json({ success: false, error: 'Canal no disponible temporalmente' });
      return;
    }

    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).send(manifest);
  });

  app.all('/api/providers/sub/:token', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const token = String(req.params.token || '').trim();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';
    const manifest = await resolveProviderSubPlaylist(token, absOrigin);
    if (!manifest) {
      res.status(404).end();
      return;
    }
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(manifest);
  });

  app.all('/api/providers/seg/:token', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const token = String(req.params.token || '').trim();
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const seg = await fetchProviderOpaqueSegment(token, rangeHeader);
    if (!seg) {
      res.status(404).end();
      return;
    }
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', seg.contentType);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(seg.status).send(seg.buffer);
  });

  app.all('/api/providers/vod/:providerId/:streamIdExt', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const providerId = String(req.params.providerId || '').trim();
    const streamIdExt = String(req.params.streamIdExt || '').trim();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';
    await streamProviderVodOrSeries(req, res, 'movie', providerId, streamIdExt, absOrigin);
  });

  app.all('/api/providers/series-stream/:providerId/:episodeIdExt', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const providerId = String(req.params.providerId || '').trim();
    const episodeIdExt = String(req.params.episodeIdExt || '').trim();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';
    await streamProviderVodOrSeries(req, res, 'series', providerId, episodeIdExt, absOrigin);
  });

  app.get('/api/providers/artwork', async (req, res) => {
    const token = String(req.query.k || '').trim();
    const rawUrl = decryptOpaqueArtworkToken(token);
    if (!rawUrl) {
      res.status(404).end();
      return;
    }
    try {
      await assertSafeProxyUrl(rawUrl);
      const upstream = await streamingFetch(rawUrl, {
        headers: { 'User-Agent': 'IPTVSmartersPlayer', Accept: 'image/*,*/*;q=0.8' },
        timeoutMs: 6000,
      });
      if (!upstream.ok) {
        void upstream.body?.cancel().catch(() => {});
        res.status(404).end();
        return;
      }
      const ct = (upstream.headers.get('content-type') || 'image/jpeg').toLowerCase();
      if (!ct.startsWith('image/') && !ct.includes('octet-stream')) {
        void upstream.body?.cancel().catch(() => {});
        res.status(404).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length === 0 || buf.length > 5 * 1024 * 1024) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', ct.startsWith('image/') ? ct : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=21600');
      res.status(200).send(buf);
    } catch {
      res.status(404).end();
    }
  });
}
