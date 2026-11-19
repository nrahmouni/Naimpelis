import crypto from 'crypto';
import type express from 'express';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from './proxyUtils.ts';

export const vodHlsManifestCache = new LruTtlCache<string, string>(400, 10 * 60 * 1000);
export const registeredVodManifestCache = new LruTtlCache<string, string>(500, 18 * 60 * 1000);

export function registerVodManifest(m3u8Content: string): string {
  const id = crypto.createHash('sha1').update(m3u8Content).digest('hex').slice(0, 18);
  registeredVodManifestCache.set(id, m3u8Content);
  return `/api/vod-manifest/${id}.m3u8`;
}

export function createVodManifestHandler(getPublicOrigin: (req: express.Request) => string) {
  return (req: express.Request, res: express.Response): void => {
    const reqId = getOrCreateRequestId(req);
    const id = String(req.params.filename || '')
      .replace(/\.m3u8$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const rawManifest = id ? registeredVodManifestCache.get(id) : undefined;
    if (!rawManifest) {
      res.status(404).send('VOD manifest expired');
      return;
    }
    const useAbs = req.query.abs === '1';
    const originPrefix = useAbs ? getPublicOrigin(req) : '';
    const out = originPrefix
      ? rawManifest
          .replace(/(^|\n)(\/api\/(?:ts-proxy|hls-proxy|vod-manifest)\/[^\n]+)/g, `$1${originPrefix}$2`)
      : rawManifest;
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Length', String(Buffer.byteLength(out)));
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.send(out);
  };
}
