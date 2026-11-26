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
import { channelHealthMonitor } from '../../services/channelHealthMonitor.ts';
import {
  extractXtreamLiveHintsFromSportsRequest,
  findXtreamLiveChannelMatches,
} from '../../services/xtreamVodMatcher.ts';
import { raceFastLiveTracks } from '../../services/liveFastResolver.ts';

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
    if (
      u.startsWith('/api/ts-proxy/') ||
      u.startsWith('/api/embed-proxy') ||
      u.startsWith('/api/dvb-live/')
    ) {
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

type SniffedExtractResult = NonNullable<Awaited<ReturnType<typeof extractLiveSportsHlsDirect>>>;
interface InFlightExternalExtractOutcome {
  sniffed: SniffedExtractResult | null;
  xtreamWinner: ExtractedStreamResult | null;
}
const inFlightExternalExtracts = new Map<string, Promise<InFlightExternalExtractOutcome>>();

export async function handleExternalSportsExtract(params: {
  rawInput: string;
  resolverType: string;
  preferLang: string;
  titleHint: string;
  channelLabel?: string;
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
    channelLabel,
    cacheKey,
    setCache,
    sendOk,
    sendJsonStatus,
  } = params;

  const fullTargetUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
  const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTargetUrl);

  const liveHints =
    resolverType === 'sports_channel'
      ? extractXtreamLiveHintsFromSportsRequest(fullTargetUrl, channelLabel, titleHint)
      : [];
  const xtreamMatchesPromise =
    resolverType === 'sports_channel' && liveHints.length > 0
      ? findXtreamLiveChannelMatches({
          channelHints: liveHints,
          preferLang,
          limit: 6,
        }).catch(() => [])
      : Promise.resolve([]);

  const tryXtreamSportsRace = async (): Promise<ExtractedStreamResult | null> => {
    if (resolverType !== 'sports_channel' || liveHints.length === 0) return null;
    const xtreamLiveMatches = await xtreamMatchesPromise;
    if (xtreamLiveMatches.length === 0) return null;
    const raced = await raceFastLiveTracks(
      xtreamLiveMatches.map((tr) => ({
        id: tr.id,
        label: tr.label,
        lang: tr.lang,
        quality: tr.quality,
        sourceUrl: tr.sourceUrl,
        resolverType: tr.resolverType || 'direct_hls',
      })),
      {
        channelId: `sports-xtream-${liveHints[0]}`,
        titleHint: channelLabel || titleHint,
        preferLang,
        timeoutMs: 3_800,
      }
    ).catch(() => null);
    if (raced?.ok && raced.streamUrl && raced.mode === 'hls') {
      return {
        success: true,
        mode: 'hls',
        streamUrl: raced.streamUrl,
        rawStreamUrl: raced.streamUrl,
        title: raced.winningTrack?.label || channelLabel || titleHint || 'Directo HD',
        requestedLang: preferLang || 'ES',
        resolvedLang: raced.winningTrack?.lang || preferLang || 'ES',
        expiresAt: Date.now() + 2 * 60 * 1000,
      };
    }
    return null;
  };

  const dedupKey = `${resolverType}:${fullTargetUrl}`;
  let inflight = inFlightExternalExtracts.get(dedupKey);
  if (!inflight) {
    inflight = (async (): Promise<InFlightExternalExtractOutcome> => {
      const directPromise = extractLiveSportsHlsDirect(fullTargetUrl).catch(() => null);
      if (resolverType === 'sports_channel') {
        const xtreamPromise = tryXtreamSportsRace().catch(() => null);
        // Race direct sports extractor against Xtream live race concurrently instead of stacking 8s+ waits
        const directWin = directPromise.then((res) =>
          res && (res.streamUrl || res.isBrokenGreenFeed)
            ? { sniffed: res, xtreamWinner: null as ExtractedStreamResult | null }
            : null
        );
        const xtreamWin = xtreamPromise.then((res) =>
          res ? { sniffed: null as SniffedExtractResult | null, xtreamWinner: res } : null
        );

        const firstResolved = await Promise.race([
          new Promise<InFlightExternalExtractOutcome | null>((resolve) => {
            let pending = 2;
            const onResult = (val: InFlightExternalExtractOutcome | null) => {
              if (val) {
                resolve(val);
                return;
              }
              pending -= 1;
              if (pending <= 0) resolve(null);
            };
            void directWin.then(onResult);
            void xtreamWin.then(onResult);
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
        ]);
        if (firstResolved) return firstResolved;
        if (isKnownDirectMirror) return { sniffed: null, xtreamWinner: null };
      } else {
        const directSports = await Promise.race([
          directPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
        ]);
        if (directSports) return { sniffed: directSports, xtreamWinner: null };
      }
      const sniffedHeadless = await Promise.race([
        sniffStreamWithHeadless(fullTargetUrl) as Promise<SniffedExtractResult | null>,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_500)),
      ]).catch(() => null);
      return { sniffed: sniffedHeadless, xtreamWinner: null };
    })().finally(() => {
      if (inFlightExternalExtracts.get(dedupKey) === inflight) {
        inFlightExternalExtracts.delete(dedupKey);
      }
    });
    inFlightExternalExtracts.set(dedupKey, inflight);
  }

  const { sniffed: resolvedSniff, xtreamWinner } = await inflight;

  if (xtreamWinner) {
    setCache(cacheKey, xtreamWinner);
    return sendOk(xtreamWinner);
  }

  if (resolvedSniff?.isBrokenGreenFeed) {
    channelHealthMonitor.setTrackHealth(fullTargetUrl, {
      status: 'down',
      failCount: 3,
      checkedAt: Date.now(),
      qoeFailures: 3,
    });
    return sendJsonStatus(422, {
      success: false,
      brokenGreenFeed: true,
      canUseCloudBrowser: false,
      error:
        'Trama H.264 corrupta o pantalla verde (#005200) descartada; cambiando automáticamente a pista satélite 1080p verificada.',
    });
  }

  if (!resolvedSniff && resolverType === 'sports_channel' && isKnownDirectMirror) {
    const xtreamFallback = await tryXtreamSportsRace();
    if (xtreamFallback) {
      setCache(cacheKey, xtreamFallback);
      return sendOk(xtreamFallback);
    }
    channelHealthMonitor.recordPlaybackFeedback(fullTargetUrl, { failed: true });
    return sendJsonStatus(404, {
      success: false,
      canUseCloudBrowser: false,
      error: 'Señal no está activa en este instante. Elige otra señal o canal.',
    });
  }

  const sniffed = resolvedSniff;

  if (sniffed && sniffed.streamUrl) {
    const alreadyVerified = Boolean(sniffed.verifiedClean);
    if (
      !alreadyVerified &&
      !sniffed.isDirectMp4 &&
      (resolverType === 'sports_channel' || /\.m3u8(\?|$)/i.test(sniffed.streamUrl))
    ) {
      const checkM3u = await fetchSportsHtmlHop(sniffed.streamUrl, sniffed.referer);
      if (checkM3u.includes('#EXTM3U')) {
        const clean = await verifyM3u8HasCleanVideoFrame(
          checkM3u,
          sniffed.streamUrl,
          sniffed.referer
        );
        if (!clean) {
          channelHealthMonitor.recordPlaybackFeedback(fullTargetUrl, { failed: true });
          return sendJsonStatus(422, {
            success: false,
            brokenGreenFeed: true,
            canUseCloudBrowser: false,
            error:
              'Señal con interferencias H.264 descartada automáticamente; saltando a pista satélite 1080p limpia.',
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

  // Try matching connected Xtream live channels (84k+ channels) for failed sports_channel streams
  if (resolverType === 'sports_channel') {
    const xtreamFallback = await tryXtreamSportsRace();
    if (xtreamFallback) {
      setCache(cacheKey, xtreamFallback);
      return sendOk(xtreamFallback);
    }

    // Never wrap dead third-party sports HTML pages into a broken embed-proxy iframe;
    // return 404 so the player fails over immediately to Signal 2 / backup channel.
    channelHealthMonitor.recordPlaybackFeedback(fullTargetUrl, { failed: true });
    return sendJsonStatus(404, {
      success: false,
      canUseCloudBrowser: false,
      error: 'Señal sin emisión directa activa; cambiando automáticamente a la siguiente señal.',
    });
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
    /(^|\.)(vidfast\.[a-z.]+|2embed\.cc)/i.test(fullTargetUrl);
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
