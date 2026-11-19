import type express from 'express';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  type ExtractedStreamResult,
} from '../../extractors/httpHelpers.ts';
import {
  extractLiveSportsHlsDirect,
  fetchSportsHtmlHop,
  sniffStreamWithHeadless,
  verifyM3u8HasCleanVideoFrame,
} from '../../extractors/sportsExtractor.ts';

export function formatExtractResponseForClient(
  req: express.Request,
  payload: ExtractedStreamResult,
  getPublicOrigin: (r: express.Request) => string
): ExtractedStreamResult & { requestId?: string } {
  const headerReqId =
    typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : '';
  const requestId =
    (payload as { requestId?: string }).requestId ||
    headerReqId ||
    `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (String(req.query.abs || '') !== '1') {
    return { ...payload, requestId };
  }
  const publicOrigin = getPublicOrigin(req);
  const absProxyUrl = (u?: string): string | undefined => {
    if (!u) return u;
    if (u.startsWith('/api/hls-proxy/') || u.startsWith('/api/vod-manifest/')) {
      const full = `${publicOrigin}${u}`;
      return full.includes('abs=1') ? full : `${full}${full.includes('?') ? '&' : '?'}abs=1`;
    }
    if (u.startsWith('/api/ts-proxy/') || u.startsWith('/api/embed-proxy')) {
      return `${publicOrigin}${u}`;
    }
    return u;
  };
  return {
    ...payload,
    requestId,
    streamUrl: absProxyUrl(payload.streamUrl) || payload.streamUrl,
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((tr) => ({
          ...tr,
          resolvedStreamUrl: absProxyUrl(tr.resolvedStreamUrl),
        }))
      : payload.tracks,
  };
}

export async function handleExternalSportsExtract(params: {
  rawInput: string;
  resolverType: string;
  preferLang: string;
  titleHint: string;
  cacheKey: string;
  setCache: (key: string, val: ExtractedStreamResult) => void;
  sendOk: (payload: ExtractedStreamResult) => express.Response;
  sendJsonStatus: (status: number, body: Record<string, any>) => express.Response;
}): Promise<express.Response> {
  const {
    rawInput,
    resolverType,
    preferLang,
    titleHint,
    cacheKey,
    setCache,
    sendOk,
    sendJsonStatus,
  } = params;

  const fullTargetUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
  const directSports = await extractLiveSportsHlsDirect(fullTargetUrl);

  if (directSports?.isBrokenGreenFeed) {
    return sendJsonStatus(502, {
      success: false,
      canUseCloudBrowser: false,
      error:
        'Señal satélite en mantenimiento temporal; cambiando automáticamente a señal alternativa.',
    });
  }

  const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTargetUrl);
  if (!directSports && resolverType === 'sports_channel' && isKnownDirectMirror) {
    return sendJsonStatus(404, {
      success: false,
      canUseCloudBrowser: false,
      error: 'Esta señal no está activa en este instante. Elige otra señal o canal.',
    });
  }

  const sniffed = directSports || (await sniffStreamWithHeadless(fullTargetUrl));

  if (sniffed && sniffed.streamUrl) {
    if (!sniffed.isDirectMp4 && resolverType === 'sports_channel') {
      const checkM3u = await fetchSportsHtmlHop(sniffed.streamUrl, sniffed.referer);
      if (checkM3u.includes('#EXTM3U')) {
        const clean = await verifyM3u8HasCleanVideoFrame(
          checkM3u,
          sniffed.streamUrl,
          sniffed.referer
        );
        if (!clean) {
          return sendJsonStatus(502, {
            success: false,
            canUseCloudBrowser: false,
            error:
              'Señal con interferencias descartada automáticamente; saltando a respaldo HD.',
          });
        }
      }
    }

    const proxiedUrl = sniffed.isDirectMp4
      ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
      : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);

    const result: ExtractedStreamResult = {
      success: true,
      mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
      streamUrl: proxiedUrl,
      rawStreamUrl: sniffed.streamUrl,
      referer: sniffed.referer,
      expiresAt: Date.now() + 3 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  let canFrame = false;
  let canProxyInline = false;
  try {
    const probeController = new AbortController();
    const probeTimer = setTimeout(() => probeController.abort(), 3500);
    const probeRes = await fetch(fullTargetUrl, {
      headers: { 'User-Agent': CHROME_UA },
      signal: probeController.signal,
    });
    clearTimeout(probeTimer);
    const ct = String(probeRes.headers.get('content-type') || '').toLowerCase();
    const xfo = String(probeRes.headers.get('x-frame-options') || '').toLowerCase();
    const csp = String(probeRes.headers.get('content-security-policy') || '').toLowerCase();
    probeController.abort();
    const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
    const blockedByCsp =
      csp.includes('frame-ancestors') &&
      !csp.includes('frame-ancestors *') &&
      !csp.includes('frame-ancestors https:');
    canFrame = probeRes.ok && !blockedByXfo && !blockedByCsp;
    canProxyInline = probeRes.ok && ct.includes('text/html');
  } catch {
    canFrame = false;
    canProxyInline = false;
  }

  const useInlineProxy =
    canProxyInline ||
    /(^|\.)(vidfast\.[a-z.]+|vidsrc\.[a-z.]+|videm\.buzz|2embed\.cc)/i.test(fullTargetUrl);
  const inlineEmbedUrl = useInlineProxy
    ? `/api/embed-proxy?url=${encodeURIComponent(fullTargetUrl)}`
    : fullTargetUrl;
  const playInline = canFrame || useInlineProxy;

  const extFallbackResult: ExtractedStreamResult = {
    success: true,
    mode: playInline ? 'embed' : 'cloud',
    streamUrl: playInline ? inlineEmbedUrl : fullTargetUrl,
    rawStreamUrl: fullTargetUrl,
    title: titleHint || 'Señal Web Directa',
    tracks: playInline
      ? [
          {
            id: 'ext-web-embed-1',
            label: 'Reproductor Web Integrado',
            lang: preferLang || 'ES',
            sourceUrl: fullTargetUrl,
            resolverType: 'web_embed',
            resolvedStreamUrl: inlineEmbedUrl,
          },
        ]
      : [],
    expiresAt: Date.now() + 2 * 60 * 1000,
  };
  return sendOk(extFallbackResult);
}
