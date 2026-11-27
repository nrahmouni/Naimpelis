import { Readable } from 'node:stream';
import type express from 'express';
import { getDefaultProviderById } from '../../src/config/defaultProviders.ts';
import { logger } from '../utils/logger.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from './proxies/proxyUtils.ts';
import {
  fetchProxiedXtreamManifest,
  fetchProxiedXtreamSeriesStream,
  fetchProxiedXtreamVodStream,
  fetchXtreamOpaqueIcon,
  openXtreamOpaqueSegmentStream,
  resolveUpstreamVodOrSeriesUrl,
} from '../services/xtreamService.ts';
import {
  resolveProviderLiveManifest as resolveLegacyProviderLiveManifest,
  streamProviderVodOrSeries as streamLegacyProviderVodOrSeries,
} from '../services/providers/xtreamProvidersService.ts';
import {
  resolveProviderLiveManifest as resolveMultiProviderLiveManifest,
  streamProviderVodOrSeries as streamMultiProviderVodOrSeries,
} from '../services/providers/xtreamMultiProviderService.ts';
import { needsBrowserVodRemux, streamVodRemuxedAsMp4 } from '../services/xtreamVodRemuxer.ts';

const LEGACY_TO_CANONICAL: Record<string, string> = {
  primary: 'shark-pro',
  vod4k: 'vod-4k',
  dana4k: 'dana-4k-pro',
  activecdns: 'active-cdns',
  octopus: 'octopus-tv',
};

const CANONICAL_TO_LEGACY: Record<string, string> = {
  'shark-pro': 'primary',
  'vod-4k': 'vod4k',
  'dana-4k-pro': 'dana4k',
  'active-cdns': 'activecdns',
  'octopus-tv': 'octopus',
};

function resolveProviderAliasPair(rawProviderId: string): {
  legacyId: string;
  canonicalId: string;
} {
  const clean = String(rawProviderId || 'primary').trim().toLowerCase() || 'primary';
  return {
    legacyId: CANONICAL_TO_LEGACY[clean] || clean,
    canonicalId: LEGACY_TO_CANONICAL[clean] || clean,
  };
}

function sanitizeCleanId(raw: unknown): string | null {
  const clean = String(raw || '').replace(/\.m3u8$/i, '').trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(clean) ? clean : null;
}

function sanitizeExt(raw: unknown, fallback = 'mp4'): string {
  const clean = String(raw || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return clean.length >= 2 && clean.length <= 5 ? clean : fallback;
}

async function handleVodOrSeriesProxy(
  req: express.Request,
  res: express.Response,
  rawProviderId: string,
  kind: 'movie' | 'series',
  streamId: string,
  ext: string,
  absOrigin: string
): Promise<void> {
  const reqId = getOrCreateRequestId(req);
  const { legacyId, canonicalId } = resolveProviderAliasPair(rawProviderId);

  // 1. Unified connected providers runtime state (fast account rotation + VOD remux)
  await streamLegacyProviderVodOrSeries(legacyId, kind, streamId, ext, req, res);
  if (res.headersSent || res.writableEnded) return;

  // 2. Canonical multi-provider pool fallback
  if (getDefaultProviderById(canonicalId)) {
    await streamMultiProviderVodOrSeries(req, res, kind, canonicalId, `${streamId}.${ext}`, absOrigin);
    if (res.headersSent || res.writableEnded) return;
  }

  // 3. Direct xtreamService failover (with automatic FFmpeg remux if container/transcode requires it)
  const forceTranscode = req.query.transcode === '1' || req.query.remux === 'mp4';
  const rawStart = Number(req.query.start || 0);
  const startSec = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : undefined;
  if (needsBrowserVodRemux(ext, forceTranscode)) {
    const resolved = await resolveUpstreamVodOrSeriesUrl(
      streamId,
      ext,
      legacyId,
      kind === 'series' ? 'series' : 'vod'
    );
    if (resolved.ok && resolved.url) {
      applyProxyCorsHeaders(res, reqId);
      const started = await streamVodRemuxedAsMp4(req, res, {
        upstreamUrl: resolved.url,
        cacheKey: `xt:${legacyId}:${kind}:${streamId}`,
        startSec,
        forceFullTranscode: req.query.transcode === '1',
      });
      if (started || res.headersSent) return;
    }
  }

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.once('close', onClose);
  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

  try {
    const upstream =
      kind === 'series'
        ? await fetchProxiedXtreamSeriesStream(streamId, ext, rangeHeader, legacyId, controller.signal)
        : await fetchProxiedXtreamVodStream(streamId, ext, rangeHeader, legacyId, controller.signal);

    if (!upstream || !upstream.body) {
      req.off('close', onClose);
      if (!res.headersSent) {
        res.status(502).json({ success: false, error: 'Stream temporalmente no disponible.' });
      }
      return;
    }

    applyProxyCorsHeaders(res, reqId);
    res.status(upstream.status);
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || (ext === 'webm' ? 'video/webm' : 'video/mp4')
    );
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);

    if (req.method === 'HEAD') {
      req.off('close', onClose);
      void upstream.body.cancel().catch(() => {});
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as never);
    nodeStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    res.on('close', () => {
      req.off('close', onClose);
      nodeStream.destroy();
      controller.abort();
    });
    nodeStream.pipe(res);
  } catch (err) {
    req.off('close', onClose);
    logger.warn({ err, legacyId, kind, streamId }, 'xtream_vod_proxy_failed');
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: 'Stream temporalmente no disponible.' });
    }
  }
}

async function resolveLiveManifestAnyPool(
  rawProviderId: string,
  streamId: string,
  absOrigin: string
): Promise<string | null> {
  const { legacyId, canonicalId } = resolveProviderAliasPair(rawProviderId);
  const fromLegacy = await resolveLegacyProviderLiveManifest(legacyId, streamId, absOrigin).catch(() => null);
  if (fromLegacy) return fromLegacy;

  const fromXtream = await fetchProxiedXtreamManifest(streamId, absOrigin, legacyId).catch(() => null);
  if (fromXtream) return fromXtream;

  if (getDefaultProviderById(canonicalId)) {
    const fromMulti = await resolveMultiProviderLiveManifest(canonicalId, streamId, absOrigin).catch(
      () => null
    );
    if (fromMulti) return fromMulti;
  }
  return null;
}

export function registerXtreamStreamRoutes(
  app: express.Express,
  opts: { getPublicOrigin: (req: express.Request) => string }
): void {
  const { getPublicOrigin } = opts;

  // Unified query-based Xtream gateway: /api/stream?provider=...&id=...&type=vod|series|live&ext=...
  app.all('/api/stream', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const cleanId = sanitizeCleanId(req.query.id);
    if (!cleanId) {
      res.status(400).json({ success: false, error: 'Identificador de stream inválido.' });
      return;
    }
    const providerId = String(req.query.provider || 'primary').trim();
    const rawType = String(req.query.type || 'live').trim().toLowerCase();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';

    if (rawType === 'vod' || rawType === 'movie' || rawType === 'series') {
      const kind: 'movie' | 'series' = rawType === 'series' ? 'series' : 'movie';
      const ext = sanitizeExt(req.query.ext, 'mp4');
      await handleVodOrSeriesProxy(req, res, providerId, kind, cleanId, ext, absOrigin);
      return;
    }

    if (req.method === 'HEAD') {
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.status(200).end();
      return;
    }

    const manifest = await resolveLiveManifestAnyPool(providerId, cleanId, absOrigin);
    if (!manifest) {
      res.status(502).json({ success: false, error: 'Canal no disponible temporalmente.' });
      return;
    }
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).send(manifest);
  });

  // Live Xtream HLS gateway: /api/xtream/stream/:streamId.m3u8?provider=...
  app.all('/api/xtream/stream/:streamId', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const cleanId = sanitizeCleanId(req.params.streamId);
    if (!cleanId) {
      res.status(400).json({ success: false, error: 'Canal inválido.' });
      return;
    }
    if (req.method === 'HEAD') {
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.status(200).end();
      return;
    }
    const providerId = String(req.query.provider || 'primary').trim();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';
    const manifest = await resolveLiveManifestAnyPool(providerId, cleanId, absOrigin);
    if (!manifest) {
      res.status(502).json({ success: false, error: 'Stream no disponible temporalmente.' });
      return;
    }
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).send(manifest);
  });

  // Direct VOD Xtream gateway: /api/xtream/vod/:idExt?provider=...
  app.all('/api/xtream/vod/:idExt', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const raw = String(req.params.idExt || '').trim();
    const m = raw.match(/^([a-zA-Z0-9_-]{1,64})(?:\.([a-zA-Z0-9]{2,5}))?$/);
    if (!m) {
      res.status(400).json({ success: false, error: 'Identificador VOD inválido.' });
      return;
    }
    const providerId = String(req.query.provider || 'primary').trim();
    const absOrigin = req.query.abs === '1' ? getPublicOrigin(req) : '';
    const ext = sanitizeExt(m[2], 'mp4');
    await handleVodOrSeriesProxy(req, res, providerId, 'movie', m[1], ext, absOrigin);
  });

  // Opaque HLS sub-manifest / TS segment proxy: /api/xtream/seg/:token
  app.all('/api/xtream/seg/:token', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    if (req.method === 'OPTIONS') {
      applyProxyCorsHeaders(res, reqId);
      res.status(204).end();
      return;
    }
    const token = String(req.params.token || '').trim();
    if (!/^[a-f0-9]{16,40}$/i.test(token)) {
      res.status(404).end();
      return;
    }
    const controller = new AbortController();
    const onClose = () => controller.abort();
    req.once('close', onClose);
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    try {
      const seg = await openXtreamOpaqueSegmentStream(token, rangeHeader, controller.signal);
      if (!seg) {
        req.off('close', onClose);
        res.status(404).end();
        return;
      }
      applyProxyCorsHeaders(res, reqId);
      if (seg.kind === 'playlist' && seg.buffer) {
        req.off('close', onClose);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.status(seg.status || 200).send(seg.buffer);
        return;
      }
      if (!seg.body) {
        req.off('close', onClose);
        res.status(404).end();
        return;
      }
      res.status(seg.status || 200);
      res.setHeader('Content-Type', seg.contentType || 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=120');
      if (seg.contentLength) res.setHeader('Content-Length', seg.contentLength);
      if (seg.acceptRanges) res.setHeader('Accept-Ranges', seg.acceptRanges);
      const nodeStream = Readable.fromWeb(seg.body as never);
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      res.on('close', () => {
        req.off('close', onClose);
        nodeStream.destroy();
        controller.abort();
      });
      nodeStream.pipe(res);
    } catch {
      req.off('close', onClose);
      if (!res.headersSent) res.status(502).end();
    }
  });

  // Opaque HTTP icon proxy: /api/xtream/icon/:token
  app.get('/api/xtream/icon/:token', async (req, res) => {
    const token = String(req.params.token || '').trim();
    const icon = await fetchXtreamOpaqueIcon(token);
    if (!icon) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', icon.contentType);
    res.setHeader('Cache-Control', 'public, max-age=21600');
    res.status(icon.status).send(icon.body);
  });
}
