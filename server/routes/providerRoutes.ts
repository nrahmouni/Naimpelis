/**
 * @module server/routes/providerRoutes
 * @description Public credential-free Express API routes for configured Xtream providers,
 * aggregated "Catálogo Total", series season/episode lookup, and opaque HLS/VOD proxying.
 */
import type express from 'express';
import {
  connectProviderWithRotation,
  getProviderSeriesDetail,
  getProvidersStatusSummary,
  initDefaultProviders,
  queryProvidersCatalog,
  resolveProviderLiveManifest,
  streamProviderVodOrSeries,
} from '../services/providers/xtreamProvidersService.ts';
import {
  fetchProviderOpaqueSegment,
  resolveProviderSubPlaylist,
  sanitizeExtension,
} from '../services/providers/xtreamProvidersHelpers.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from './proxies/proxyUtils.ts';
import type { ProviderMediaKind } from '../services/providers/xtreamProvidersTypes.ts';

interface ProviderRoutesDeps {
  getPublicOrigin: (req: express.Request) => string;
}

export function registerProviderRoutes(app: express.Express, deps: ProviderRoutesDeps): void {
  const { getPublicOrigin } = deps;

  app.get('/api/providers/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      ...getProvidersStatusSummary(),
    });
  });

  app.post('/api/providers/refresh', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const providerId = String(req.query.providerId || req.body?.providerId || '').trim();
    try {
      if (providerId) {
        await connectProviderWithRotation(providerId, { force: true });
      } else {
        await initDefaultProviders({ force: true });
      }
      res.json({
        success: true,
        ...getProvidersStatusSummary(),
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : 'Error reconectando servidores',
      });
    }
  });

  app.get('/api/providers/catalog', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const scope = String(req.query.scope || 'total').trim() || 'total';
    const rawKind = String(req.query.kind || 'all').trim().toLowerCase();
    const kind: ProviderMediaKind | 'all' =
      rawKind === 'live' || rawKind === 'movie' || rawKind === 'series' ? rawKind : 'all';
    const categoryId = String(req.query.categoryId || '').trim();
    const q = String(req.query.q || '').trim();
    const offset = Number(req.query.offset || 0);
    const limit = Number(req.query.limit || 60);

    const data = queryProvidersCatalog({
      scope,
      kind,
      categoryId,
      q,
      offset,
      limit,
    });
    res.json({
      success: true,
      ...data,
    });
  });

  app.get('/api/providers/:providerId/series/:seriesId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const providerId = String(req.params.providerId || '').trim();
    const seriesId = String(req.params.seriesId || '').trim();
    const detail = await getProviderSeriesDetail(providerId, seriesId);
    if (!detail) {
      res.status(404).json({ success: false, error: 'Serie no disponible en este servidor.' });
      return;
    }
    res.json({ success: true, detail });
  });

  app.all('/api/providers/stream/:providerId/:kind/:streamFile', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const providerId = decodeURIComponent(String(req.params.providerId || '')).trim();
    const rawKind = String(req.params.kind || '').trim().toLowerCase();
    const streamFile = decodeURIComponent(String(req.params.streamFile || '')).trim();

    const dotIdx = streamFile.lastIndexOf('.');
    const streamId = dotIdx > 0 ? streamFile.slice(0, dotIdx) : streamFile;
    const ext = sanitizeExtension(dotIdx > 0 ? streamFile.slice(dotIdx + 1) : '', rawKind === 'live' ? 'm3u8' : 'mp4');

    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }

    if (rawKind === 'live') {
      const originPrefix = req.query.abs === '1' ? getPublicOrigin(req) : '';
      if (req.method === 'HEAD') {
        applyProxyCorsHeaders(res, reqId);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.status(200).end();
        return;
      }
      const manifest = await resolveProviderLiveManifest(providerId, streamId, originPrefix);
      if (!manifest) {
        res.status(404).send('Live provider stream unavailable');
        return;
      }
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(manifest);
      return;
    }

    if (rawKind === 'movie' || rawKind === 'series') {
      await streamProviderVodOrSeries(providerId, rawKind, streamId, ext, req, res);
      return;
    }

    res.status(400).send('Invalid provider media kind');
  });

  app.all('/api/providers/hls-sub/:token', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const token = String(req.params.token || '').trim();
    const originPrefix = req.query.abs === '1' ? getPublicOrigin(req) : '';
    const playlist = await resolveProviderSubPlaylist(token, originPrefix);
    if (!playlist) {
      res.status(404).send('Provider sub-playlist expired');
      return;
    }
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(playlist);
  });

  app.all('/api/providers/hls-seg/:token', async (req, res) => {
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
      res.status(404).send('Provider segment unavailable');
      return;
    }
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', seg.contentType);
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.status(seg.status).send(seg.buffer);
  });
}
