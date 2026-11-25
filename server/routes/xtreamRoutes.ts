/**
 * @module server/routes/xtreamRoutes
 * @description Multi-provider server-side proxy endpoints for Xtream Codes API, 6h catalog sync,
 * sequential connection diagnostics (Test Mode), and HLS/VOD playback.
 * Never returns upstream server URLs, usernames, or passwords.
 */
import { Readable } from 'node:stream';
import type { Express, Request } from 'express';
import {
  applyRuntimeVaultBase64,
  clearRuntimeVaultProviders,
} from '../services/providersConfig.ts';
import {
  ALLOWED_XTREAM_PROXY_ACTIONS,
  clearXtreamSessionCache,
  fetchProxiedXtreamManifest,
  fetchProxiedXtreamSeriesStream,
  fetchProxiedXtreamVodStream,
  fetchXtreamOpaqueIcon,
  fetchXtreamOpaqueResource,
  getLiveCategories,
  getLiveStreams,
  getSeriesInfo,
  getVodCategories,
  getXtreamConnectionStatus,
  listXtreamProviderSummaries,
  proxyPlayerApiRequest,
  runXtreamConnectionDiagnostics,
  syncFullCatalog,
  type XtreamAllowedProxyAction,
} from '../services/xtreamService.ts';

function resolveOriginPrefix(req: Request, getPublicOrigin?: (req: Request) => string): string {
  if (req.query.abs !== '1') return '';
  if (getPublicOrigin) return getPublicOrigin(req);
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function getProviderParam(req: Request): string {
  const raw = String(req.query.provider || 'primary').trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(raw) ? raw : 'primary';
}

export function registerXtreamRoutes(
  app: Express,
  deps?: { getPublicOrigin?: (req: Request) => string }
): void {
  // List registered provider tabs without exposing any server URLs or credentials
  app.get('/api/xtream/providers', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      providers: listXtreamProviderSummaries(),
    });
  });

  // Sync Base64-encoded private vault / VITE_* configuration into server RAM (never persisted to disk or logged)
  app.post('/api/xtream/vault/sync', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    if (body.clear === true) {
      clearRuntimeVaultProviders();
      clearXtreamSessionCache();
      return res.json({
        success: true,
        providers: listXtreamProviderSummaries(),
      });
    }

    const vaultB64 = typeof body.vaultB64 === 'string' ? body.vaultB64 : undefined;
    const viteEnvB64 = typeof body.viteEnvB64 === 'string' ? body.viteEnvB64 : undefined;

    if ((vaultB64 && vaultB64.length > 64_000) || (viteEnvB64 && viteEnvB64.length > 64_000)) {
      return res.status(400).json({
        success: false,
        error: 'El bloque de configuración excede el tamaño máximo permitido.',
      });
    }

    const applied = applyRuntimeVaultBase64({ vaultB64, viteEnvB64 });
    if (!applied.ok) {
      return res.status(400).json({
        success: false,
        error: applied.error || 'No se pudo procesar la bóveda privada.',
      });
    }

    if (applied.changed) {
      clearXtreamSessionCache();
    }

    const autoSync = body.autoSync !== false;
    let syncedCounts: Record<string, number> | undefined;
    if (autoSync) {
      const syncRes = await syncFullCatalog(Boolean(body.refresh), 'all').catch(() => null);
      if (syncRes?.ok && syncRes.catalog) {
        syncedCounts = syncRes.catalog.counts;
      }
    }

    return res.json({
      success: true,
      providers: listXtreamProviderSummaries(),
      ...(syncedCounts ? { counts: syncedCounts } : {}),
    });
  });

  // Masked connection status & automatic failover check (never returns URL or credentials)
  app.get('/api/xtream/status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const providerId = getProviderParam(req);
    const status = await getXtreamConnectionStatus(forceRefresh, providerId);
    res.status(200).json({
      success: status.connected,
      status,
    });
  });

  // Sequential multi-provider diagnostic Test Mode for Admin / Settings
  app.all('/api/xtream/test-connection', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const report = await runXtreamConnectionDiagnostics(forceRefresh);
    return res.status(200).json({
      success: report.connected,
      report,
    });
  });

  // Full catalog sync (Live, VOD, Series) with 6-hour RAM cache per provider or unified ('all')
  app.get('/api/xtream/catalog', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const providerId = getProviderParam(req);
    const result = await syncFullCatalog(forceRefresh, providerId);
    if (!result.ok || !result.catalog) {
      return res.status(503).json({
        success: false,
        status: result.status,
        error: result.error || 'No se pudo sincronizar el catálogo Xtream.',
      });
    }
    return res.json({
      success: true,
      catalog: result.catalog,
    });
  });

  // CORS & Mixed-Content safe backend proxy for player_api.php
  app.get('/api/xtream/player-api', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rawAction = String(req.query.action || 'account_info').trim() as XtreamAllowedProxyAction;
    if (!ALLOWED_XTREAM_PROXY_ACTIONS.has(rawAction)) {
      return res.status(400).json({
        success: false,
        error: 'Acción player_api no permitida.',
      });
    }

    const categoryId = String(req.query.category_id || '').trim() || undefined;
    const streamId = String(req.query.stream_id || '').trim() || undefined;
    const seriesId = String(req.query.series_id || '').trim() || undefined;
    const providerId = getProviderParam(req);

    const result = await proxyPlayerApiRequest({
      action: rawAction,
      categoryId,
      streamId,
      seriesId,
      providerId,
    });

    if (!result.ok) {
      return res.status(503).json({
        success: false,
        error: result.error || 'No hay ninguna cuenta Xtream activa disponible.',
      });
    }

    return res.json({
      success: true,
      accountNumber: result.accountNumber,
      data: result.data,
    });
  });

  // Series seasons & episodes metadata (get_series_info proxy)
  app.get('/api/xtream/series-info', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const seriesId = String(req.query.series_id || req.query.seriesId || '').trim();
    if (!seriesId) {
      return res.status(400).json({ success: false, error: 'Falta parámetro series_id.' });
    }
    const providerId = getProviderParam(req);
    const result = await getSeriesInfo(seriesId, providerId);
    if (!result.ok || !result.info) {
      return res.status(503).json({
        success: false,
        error: result.error || 'No se pudo cargar el detalle de la serie.',
      });
    }
    return res.json({
      success: true,
      info: result.info,
    });
  });

  // Live and/or VOD categories
  app.get('/api/xtream/categories', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const type = String(req.query.type || 'all').trim().toLowerCase();
    const providerId = getProviderParam(req);

    if (type === 'live') {
      const live = await getLiveCategories(providerId);
      if (!live.ok) {
        return res.status(503).json({
          success: false,
          categories: [],
          status: live.status,
          error: live.error,
        });
      }
      return res.json({ success: true, categories: live.categories });
    }

    if (type === 'vod') {
      const vod = await getVodCategories(providerId);
      if (!vod.ok) {
        return res.status(503).json({
          success: false,
          categories: [],
          status: vod.status,
          error: vod.error,
        });
      }
      return res.json({ success: true, categories: vod.categories });
    }

    const [live, vod] = await Promise.all([
      getLiveCategories(providerId),
      getVodCategories(providerId),
    ]);
    if (!live.ok && !vod.ok) {
      return res.status(503).json({
        success: false,
        liveCategories: [],
        vodCategories: [],
        status: live.status || vod.status,
        error: live.error || vod.error || 'No hay ninguna cuenta Xtream disponible.',
      });
    }

    return res.json({
      success: true,
      liveCategories: live.categories,
      vodCategories: vod.categories,
    });
  });

  // Live streams for a category (returns credential-free /api/xtream/stream/:id.m3u8 URLs)
  app.get('/api/xtream/streams', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const categoryId = String(req.query.categoryId || req.query.category_id || '').trim() || undefined;
    const providerId = getProviderParam(req);
    const result = await getLiveStreams(categoryId, providerId);
    if (!result.ok) {
      return res.status(503).json({
        success: false,
        streams: [],
        status: result.status,
        error: result.error,
      });
    }
    return res.json({
      success: true,
      total: result.streams.length,
      streams: result.streams,
    });
  });

  // Credential-free HLS manifest proxy (avoids Mixed Content & hides upstream credentials)
  app.all('/api/xtream/stream/:streamId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const streamId = String(req.params.streamId || '').replace(/\.m3u8$/i, '').trim();
    const originPrefix = resolveOriginPrefix(req, deps?.getPublicOrigin);
    const providerId = getProviderParam(req);
    const manifest = await fetchProxiedXtreamManifest(streamId, originPrefix, providerId);
    if (!manifest) {
      return res.status(503).send('Xtream stream unavailable');
    }
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.send(manifest);
  });

  // Credential-free VOD streaming proxy with Range support
  app.get('/api/xtream/vod/:streamFile', async (req, res) => {
    const raw = String(req.params.streamFile || '').trim();
    const dotIdx = raw.lastIndexOf('.');
    const streamId = dotIdx > 0 ? raw.slice(0, dotIdx) : raw;
    const ext = dotIdx > 0 ? raw.slice(dotIdx + 1) : 'mp4';
    const providerId = getProviderParam(req);

    const upstreamRes = await fetchProxiedXtreamVodStream(
      streamId,
      ext,
      typeof req.headers.range === 'string' ? req.headers.range : undefined,
      providerId
    );
    if (!upstreamRes || !upstreamRes.body) {
      return res.status(503).send('Xtream VOD unavailable');
    }

    res.status(upstreamRes.status);
    const ct = upstreamRes.headers.get('content-type');
    const cl = upstreamRes.headers.get('content-length');
    const cr = upstreamRes.headers.get('content-range');
    const ar = upstreamRes.headers.get('accept-ranges');
    if (ct) res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    if (ar) res.setHeader('Accept-Ranges', ar);
    res.setHeader('Cache-Control', 'no-store');

    Readable.fromWeb(upstreamRes.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    return undefined;
  });

  // Opaque HLS sub-playlist & segment proxy
  app.all('/api/xtream/seg/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const originPrefix = resolveOriginPrefix(req, deps?.getPublicOrigin);
    const resource = await fetchXtreamOpaqueResource(
      String(req.params.token || '').trim(),
      originPrefix,
      typeof req.headers.range === 'string' ? req.headers.range : undefined
    );
    if (!resource) return res.status(502).send('Xtream segment unavailable');
    res.status(resource.status);
    res.setHeader('Content-Type', resource.contentType);
    res.setHeader('Content-Length', String(resource.body.length));
    if (req.method === 'HEAD') return res.end();
    return res.end(resource.body);
  });

  // Opaque image proxy for upstream HTTP logos/posters (avoids Mixed Content & hides origin host)
  app.get('/api/xtream/icon/:token', async (req, res) => {
    const token = String(req.params.token || '').trim();
    const img = await fetchXtreamOpaqueIcon(token);
    if (!img) return res.status(404).end();
    res.setHeader('Content-Type', img.contentType);
    res.setHeader('Cache-Control', 'public, max-age=21600');
    res.setHeader('Content-Length', String(img.body.length));
    return res.status(img.status).end(img.body);
  });

  // Credential-free internal identifier stream endpoint: /api/stream?provider=dana4k&id=12345
  app.all('/api/stream', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const streamId = String(req.query.id || '').replace(/\.m3u8$/i, '').trim();
    if (!streamId) {
      return res.status(400).json({ success: false, error: 'Falta parámetro id.' });
    }
    const providerId = getProviderParam(req);
    const mediaType = String(req.query.type || 'live').trim().toLowerCase();

    if (mediaType === 'vod' || mediaType === 'series') {
      const ext = String(req.query.ext || 'mp4').trim();
      const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
      const upstreamRes =
        mediaType === 'series'
          ? await fetchProxiedXtreamSeriesStream(streamId, ext, rangeHeader, providerId)
          : await fetchProxiedXtreamVodStream(streamId, ext, rangeHeader, providerId);
      if (!upstreamRes || !upstreamRes.body) {
        return res
          .status(503)
          .send(mediaType === 'series' ? 'Xtream series episode unavailable' : 'Xtream VOD unavailable');
      }
      res.status(upstreamRes.status);
      const ct = upstreamRes.headers.get('content-type');
      const cl = upstreamRes.headers.get('content-length');
      const cr = upstreamRes.headers.get('content-range');
      const ar = upstreamRes.headers.get('accept-ranges');
      if (ct) res.setHeader('Content-Type', ct);
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      if (ar) res.setHeader('Accept-Ranges', ar);
      Readable.fromWeb(upstreamRes.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
      return undefined;
    }

    const originPrefix = resolveOriginPrefix(req, deps?.getPublicOrigin);
    const manifest = await fetchProxiedXtreamManifest(streamId, originPrefix, providerId);
    if (!manifest) {
      return res.status(503).send('Xtream stream unavailable');
    }
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.send(manifest);
  });
}
