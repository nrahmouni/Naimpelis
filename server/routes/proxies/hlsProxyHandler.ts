import type express from 'express';
import { logger } from '../../utils/logger.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { curlPlainGetText } from '../../services/vestMirrorService.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetText,
  getPreferredUpstreamUa,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  resolveKnownUpstreamReferer,
  shouldBypassNodeFetch,
  unwrapRelaySegmentUrl,
} from '../../extractors/httpHelpers.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from './proxyUtils.ts';
import {
  dvbAacSegmentCache,
  dvbRollingPlaylistMap,
  isDvbUpstreamCoolingDown,
  remuxDvbTsToAac,
  type RollingDvbSeg,
} from './dvbTranscoder.ts';
import { vodHlsManifestCache } from './vodManifestManager.ts';
import {
  coalesceLiveManifestFetch,
  deriveNextPredictedSegmentUrl,
  getCachedLiveManifest,
  prefetchLiveTsSegment,
  setCachedLiveManifest,
} from './liveSegmentCache.ts';
import { runtimeMetrics } from '../../services/runtimeMetricsCollector.ts';
import { evaluateDirectPlayEligibility } from '../../services/mediaPlaneRouter.ts';

export function createHlsProxyHandler(getPublicOrigin: (req: express.Request) => string) {
  return async (req: express.Request, res: express.Response): Promise<void> => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '');
    const referer = resolveKnownUpstreamReferer(targetUrl, String(req.query.referer || ''));
    const forceAac = req.query.aac === '1' || isDvbHeadendStream(targetUrl);
    const useAbs = req.query.abs === '1';
    const originPrefix = useAbs ? getPublicOrigin(req) : '';
    const vodCacheKey = useAbs ? `${originPrefix}|${targetUrl}` : targetUrl;
    if (!targetUrl) {
      res.status(400).send('Missing url');
      return;
    }
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      res.status(403).send('Forbidden target host');
      return;
    }

    if (isDvbHeadendStream(targetUrl) && isDvbUpstreamCoolingDown(targetUrl)) {
      res.status(502).send('DVB upstream headend cooling down');
      return;
    }

    runtimeMetrics.recordMediaRequest('hls');
    evaluateDirectPlayEligibility(targetUrl, { referer, forceAac });

    const cachedVod = !forceAac ? vodHlsManifestCache.get(vodCacheKey) : undefined;
    if (cachedVod) {
      runtimeMetrics.recordVodManifestHit();
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Length', String(Buffer.byteLength(cachedVod)));
      if (req.method === 'HEAD') {
        res.status(200).end();
        return;
      }
      res.send(cachedVod);
      return;
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': getPreferredUpstreamUa(targetUrl),
        Accept: '*/*',
      };
      if (referer) {
        headers['Referer'] = referer;
        try {
          headers['Origin'] = new URL(referer).origin;
        } catch {
          // ignore
        }
      }

      let baseUrl = targetUrl;
      let manifestText = '';

      const fetchManifestFromUpstream = async (): Promise<{ text: string; baseUrl: string } | null> => {
        if (shouldBypassNodeFetch(targetUrl)) {
          let fallback = await curlGetText(targetUrl, headers, 7);
          if (!fallback.text || !fallback.text.includes('#EXTM3U')) {
            const plainTxt = await curlPlainGetText(targetUrl, 7).catch(() => '');
            if (plainTxt && plainTxt.includes('#EXTM3U')) {
              fallback = { text: plainTxt, effectiveUrl: targetUrl };
            } else {
              return null;
            }
          }
          runtimeMetrics.recordUpstreamTransport(true, Buffer.byteLength(fallback.text));
          return { text: fallback.text, baseUrl: fallback.effectiveUrl || targetUrl };
        }

        const hdrCtrl = new AbortController();
        const hdrTimer = setTimeout(() => hdrCtrl.abort(), 4800);
        try {
          const upstream = await streamingFetch(targetUrl, {
            headers,
            signal: hdrCtrl.signal,
            timeoutMs: 4800,
          });
          clearTimeout(hdrTimer);
          if (!upstream.ok) {
            throw new Error(`HTTP ${upstream.status}`);
          }
          const fetchedBaseUrl = upstream.url || targetUrl;
          const fetchedText = await upstream.text();
          if (!fetchedText.includes('#EXTM3U') || /nosignal/i.test(fetchedText)) {
            throw new Error('Not M3U8 or offline placeholder');
          }
          runtimeMetrics.recordUpstreamTransport(false, Buffer.byteLength(fetchedText));
          return { text: fetchedText, baseUrl: fetchedBaseUrl };
        } catch {
          clearTimeout(hdrTimer);
          markHostNeedsCurlFallback(targetUrl);
          let fallback = await curlGetText(targetUrl, headers, 7);
          if (
            !fallback.text ||
            !fallback.text.includes('#EXTM3U') ||
            /nosignal/i.test(fallback.text)
          ) {
            const plainTxt = await curlPlainGetText(targetUrl, 7).catch(() => '');
            if (plainTxt && plainTxt.includes('#EXTM3U') && !/nosignal/i.test(plainTxt)) {
              fallback = { text: plainTxt, effectiveUrl: targetUrl };
            } else {
              return null;
            }
          }
          runtimeMetrics.recordUpstreamTransport(true, Buffer.byteLength(fallback.text));
          return { text: fallback.text, baseUrl: fallback.effectiveUrl || targetUrl };
        }
      };

      const freshCachedManifest = !forceAac ? getCachedLiveManifest(targetUrl) : null;
      if (freshCachedManifest && Date.now() - freshCachedManifest.ts < 2_200) {
        baseUrl = freshCachedManifest.baseUrl || targetUrl;
        manifestText = freshCachedManifest.text;
      } else if (!forceAac) {
        const coalesced = await coalesceLiveManifestFetch(targetUrl, fetchManifestFromUpstream);
        if (!coalesced) {
          res.status(502).send('Upstream HLS error');
          return;
        }
        baseUrl = coalesced.baseUrl || targetUrl;
        manifestText = coalesced.text;
      } else {
        const fetched = await fetchManifestFromUpstream();
        if (!fetched) {
          res.status(502).send('Upstream HLS error');
          return;
        }
        baseUrl = fetched.baseUrl;
        manifestText = fetched.text;
        setCachedLiveManifest(targetUrl, manifestText, baseUrl);
      }

      if (/nosignal/i.test(manifestText)) {
        res.status(502).send('Upstream signal offline');
        return;
      }

      const effectiveReferer = referer || new URL(baseUrl).origin + '/';
      let easyBroadcastTokenQs = '';
      try {
        const parsedBase = new URL(baseUrl);
        if (
          /(\.|^)easybroadcast\.io$/i.test(parsedBase.hostname) &&
          parsedBase.searchParams.has('token')
        ) {
          easyBroadcastTokenQs = parsedBase.search;
        }
      } catch {
        // ignore
      }
      const appendEasyBroadcastToken = (raw: string): string => {
        if (!easyBroadcastTokenQs || /[?&]token=/i.test(raw)) return raw;
        return `${raw}${raw.includes('?') ? '&' : '?'}${easyBroadcastTokenQs.replace(/^\?/, '')}`;
      };

      const lines = manifestText.split(/\r?\n/);
      let nextLineIsVariantPlaylist = false;
      const discoveredTsUrls: string[] = [];

      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith('#')) {
          if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
            nextLineIsVariantPlaylist = true;
          }
          if (trimmed.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
              try {
                const absUri = new URL(uriVal, baseUrl).href;
                const unwrapped = unwrapRelaySegmentUrl(absUri, effectiveReferer);
                const resolvedUri = appendEasyBroadcastToken(unwrapped.url);
                if (trimmed.startsWith('#EXT-X-MEDIA') || resolvedUri.includes('.m3u8')) {
                  return `URI="${buildHlsProxyUrl(resolvedUri, unwrapped.referer, forceAac, originPrefix)}"`;
                }
                return `URI="${buildTsProxyUrl(resolvedUri, unwrapped.referer, forceAac, originPrefix)}"`;
              } catch {
                return _match;
              }
            });
          }
          return line;
        }

        try {
          const absUrl = new URL(trimmed, baseUrl).href;
          const unwrapped = unwrapRelaySegmentUrl(absUrl, effectiveReferer);
          const resolvedUrl = appendEasyBroadcastToken(unwrapped.url);
          const isPlaylist =
            nextLineIsVariantPlaylist ||
            (/\.m3u8(\?|$)/i.test(resolvedUrl) && !/relay\.videm\.buzz\/seg/i.test(absUrl)) ||
            resolvedUrl.includes('stream_tv=');
          nextLineIsVariantPlaylist = false;

          if (!isPlaylist) {
            discoveredTsUrls.push(resolvedUrl);
          }

          return isPlaylist
            ? buildHlsProxyUrl(resolvedUrl, unwrapped.referer, forceAac, originPrefix)
            : buildTsProxyUrl(resolvedUrl, unwrapped.referer, forceAac, originPrefix);
        } catch {
          nextLineIsVariantPlaylist = false;
          return line;
        }
      });

      let finalManifest = rewritten.join('\n');
      if (!forceAac && discoveredTsUrls.length > 0 && req.method !== 'HEAD') {
        const ua = headers['User-Agent'];
        for (const segUrl of discoveredTsUrls.slice(-2)) {
          prefetchLiveTsSegment(segUrl, effectiveReferer, ua).catch(() => {});
        }
        const predicted = deriveNextPredictedSegmentUrl(discoveredTsUrls[discoveredTsUrls.length - 1]);
        if (predicted) {
          prefetchLiveTsSegment(predicted, effectiveReferer, ua).catch(() => {});
        }
      }
      if (forceAac && discoveredTsUrls.length > 0 && req.method !== 'HEAD') {
        for (const segUrl of discoveredTsUrls.slice(-2)) {
          remuxDvbTsToAac(segUrl, effectiveReferer, false).catch(() => {});
        }

        if (isDvbHeadendStream(targetUrl) && !manifestText.includes('#EXT-X-STREAM-INF')) {
          const seqMatch = manifestText.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
          if (seqMatch) {
            const baseSeq = parseInt(seqMatch[1], 10);
            const nowMs = Date.now();
            const currentSegs: RollingDvbSeg[] = [];
            let pendingExtinf = '#EXTINF:2.500000,';
            let segOffset = 0;
            for (const rawLine of lines) {
              const t = rawLine.trim();
              if (!t) continue;
              if (t.startsWith('#EXTINF:')) {
                pendingExtinf = t;
              } else if (!t.startsWith('#')) {
                try {
                  const abs = new URL(t, baseUrl).href;
                  currentSegs.push({
                    seq: baseSeq + segOffset,
                    extinf: pendingExtinf,
                    absUrl: abs,
                    proxiedUrl: buildTsProxyUrl(abs, effectiveReferer, true, originPrefix),
                    ts: nowMs,
                  });
                  segOffset++;
                } catch {
                  // ignore
                }
              }
            }

            if (currentSegs.length > 0) {
              const dvbCacheKey = useAbs ? `${originPrefix}|${targetUrl}` : targetUrl;
              const prevHistory = dvbRollingPlaylistMap.get(dvbCacheKey) || [];
              const bySeq = new Map<number, RollingDvbSeg>();
              for (const oldSeg of prevHistory) {
                if (nowMs - oldSeg.ts < 65_000 && dvbAacSegmentCache.has(oldSeg.absUrl)) {
                  bySeq.set(oldSeg.seq, oldSeg);
                }
              }
              for (const curSeg of currentSegs) {
                bySeq.set(curSeg.seq, curSeg);
              }

              const maxSeq = currentSegs[currentSegs.length - 1].seq;
              const contiguous: RollingDvbSeg[] = [];
              for (let s = maxSeq; s > maxSeq - 11; s--) {
                const found = bySeq.get(s);
                if (!found) break;
                contiguous.unshift(found);
              }
              dvbRollingPlaylistMap.set(dvbCacheKey, contiguous);

              if (contiguous.length > currentSegs.length) {
                const targetDurMatch = manifestText.match(/#EXT-X-TARGETDURATION:(\d+)/i);
                const targetDur = targetDurMatch ? targetDurMatch[1] : '4';
                const headerLines = [
                  '#EXTM3U',
                  '#EXT-X-VERSION:3',
                  `#EXT-X-MEDIA-SEQUENCE:${contiguous[0].seq}`,
                  '#EXT-X-ALLOW-CACHE:YES',
                  `#EXT-X-TARGETDURATION:${targetDur}`,
                ];
                for (const seg of contiguous) {
                  headerLines.push(seg.extinf);
                  headerLines.push(seg.proxiedUrl);
                }
                finalManifest = headerLines.join('\n') + '\n';
              }
            }
          }
        }
      }

      const isStaticVodManifest =
        manifestText.includes('#EXT-X-ENDLIST') ||
        (!manifestText.includes('#EXT-X-MEDIA-SEQUENCE') && targetUrl.includes('ibra.lat'));
      if (!forceAac && isStaticVodManifest) {
        vodHlsManifestCache.set(vodCacheKey, finalManifest);
      }

      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Length', String(Buffer.byteLength(finalManifest)));
      if (req.method === 'HEAD') {
        res.status(200).end();
        return;
      }
      res.send(finalManifest);
    } catch (err) {
      logger.error({ err, reqId, targetUrl }, 'hls_proxy_fetch_failed');
      res.status(502).send('HLS proxy fetch failed');
    }
  };
}
