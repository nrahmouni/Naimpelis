import type express from 'express';
import { applyProxyCorsHeaders, findDisguisedTsOffset, getOrCreateRequestId } from './proxies/proxyUtils.ts';
import {
  ensureLiveDvbCleanHlsSession,
  handleDvbLive,
  remuxDvbTsToAac,
} from './proxies/dvbTranscoder.ts';
import { createVodManifestHandler, registerVodManifest } from './proxies/vodManifestManager.ts';
import { registerEmbedProxyRoutes } from './proxies/embedProxyRoutes.ts';
import { createHlsProxyHandler } from './proxies/hlsProxyHandler.ts';
import { handleTsProxy } from './proxies/tsProxyHandler.ts';

export {
  registerVodManifest,
  findDisguisedTsOffset,
  remuxDvbTsToAac,
  ensureLiveDvbCleanHlsSession,
};

export interface RegisterProxyRoutesDeps {
  getPublicOrigin: (req: express.Request) => string;
}

export function registerProxyRoutes(app: express.Express, deps: RegisterProxyRoutesDeps): void {
  const { getPublicOrigin } = deps;

  app.options(
    [
      '/api/dvb-live/:sessionKey/:filename',
      '/api/vod-manifest/:filename',
      '/api/embed-proxy',
      '/api/embed-fetch',
      '/api/hls-proxy',
      '/api/hls-proxy/:filename',
      '/api/ts-proxy',
      '/api/ts-proxy/:filename',
      '/naim-cine.m3u',
      '/NAIM-CINE-Samsung-TV.m3u',
      '/riffantv.m3u',
      '/riffantv-smarttv.m3u',
      '/channels.m3u',
      '/playlist.m3u',
      '/iptv.m3u',
      '/naim-cine.m3u8',
      '/api/iptv/playlist.m3u',
      '/api/iptv/live/:channelId',
      '/api/iptv/logo/:channelId',
      '/epg.xml',
      '/riffantv-epg.xml',
      '/api/iptv/epg.xml',
    ],
    (req, res) => {
      applyProxyCorsHeaders(res, getOrCreateRequestId(req));
      res.status(204).end();
    }
  );

  registerEmbedProxyRoutes(app);

  const handleVodManifest = createVodManifestHandler(getPublicOrigin);
  app.get('/api/vod-manifest/:filename', handleVodManifest);
  app.head('/api/vod-manifest/:filename', handleVodManifest);

  app.get('/api/dvb-live/:sessionKey/:filename', handleDvbLive);
  app.head('/api/dvb-live/:sessionKey/:filename', handleDvbLive);

  const handleHlsProxy = createHlsProxyHandler(getPublicOrigin);
  app.get(['/api/hls-proxy', '/api/hls-proxy/:filename'], handleHlsProxy);
  app.head(['/api/hls-proxy', '/api/hls-proxy/:filename'], handleHlsProxy);

  app.get(['/api/ts-proxy', '/api/ts-proxy/:filename'], handleTsProxy);
  app.head(['/api/ts-proxy', '/api/ts-proxy/:filename'], handleTsProxy);
}
