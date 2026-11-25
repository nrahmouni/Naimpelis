import { spawn } from 'child_process';
import type express from 'express';
import { Readable } from 'stream';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  curlGetBuffer,
  getPreferredUpstreamUa,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  resolveKnownUpstreamReferer,
  shouldBypassNodeFetch,
} from '../../extractors/httpHelpers.ts';
import {
  applyProxyCorsHeaders,
  findDisguisedTsOffset,
  getOrCreateRequestId,
} from './proxyUtils.ts';
import { remuxDvbTsToAac } from './dvbTranscoder.ts';
import {
  getCachedLiveTsSegment,
  getInFlightLiveTsSegment,
  setCachedLiveTsSegment,
} from './liveSegmentCache.ts';
import { runtimeMetrics } from '../../services/runtimeMetricsCollector.ts';

export async function handleTsProxy(req: express.Request, res: express.Response): Promise<void> {
  const reqId = getOrCreateRequestId(req);
  const targetUrl = String(req.query.url || '');
  const referer = resolveKnownUpstreamReferer(targetUrl, String(req.query.referer || ''));
  const forceAac = req.query.aac === '1' || isDvbHeadendStream(targetUrl);
  if (!targetUrl) {
    res.status(400).end();
    return;
  }
  try {
    await assertSafeProxyUrl(targetUrl);
  } catch {
    res.status(403).end();
    return;
  }

  runtimeMetrics.recordMediaRequest('ts');

  const isUrlSubtitle = /\.(vtt|webvtt|srt)(\?|$)/i.test(targetUrl);
  const isUrlMp4 =
    /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(targetUrl) ||
    /\/segs\/[^/]+\/init\./i.test(targetUrl) ||
    /bcdn\.hakunaymatata\.com/i.test(targetUrl) ||
    /[?&](?:mime|type)=video(?:%2F|\/)mp4/i.test(targetUrl);
  const effectiveForceAac = !isUrlSubtitle && !isUrlMp4 && forceAac;

  if (req.method === 'HEAD') {
    if (effectiveForceAac) {
      try {
        const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer, true);
        if (req.destroyed || res.writableEnded) return;
        if (!remuxedBuf || remuxedBuf.length < 564 || remuxedBuf[0] !== 0x47) {
          res.status(502).end();
          return;
        }
        applyProxyCorsHeaders(res, reqId);
        res.status(200);
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', String(remuxedBuf.length));
        res.end();
        return;
      } catch {
        if (!res.writableEnded) res.status(502).end();
        return;
      }
    }
    const defaultHeadCt = isUrlSubtitle
      ? 'text/vtt; charset=utf-8'
      : isUrlMp4
      ? 'video/mp4'
      : 'video/mp2t';
    try {
      const headers: Record<string, string> = {
        'User-Agent': getPreferredUpstreamUa(targetUrl),
        Accept: '*/*',
      };
      if (referer) headers['Referer'] = referer;
      const upstream = await streamingFetch(targetUrl, {
        method: 'HEAD',
        headers,
        timeoutMs: 5000,
      });
      applyProxyCorsHeaders(res, reqId);
      res.status(upstream.status);
      res.setHeader('Content-Type', defaultHeadCt);
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      res.end();
      return;
    } catch {
      applyProxyCorsHeaders(res, reqId);
      res.status(200);
      res.setHeader('Content-Type', defaultHeadCt);
      res.setHeader('Accept-Ranges', 'bytes');
      res.end();
      return;
    }
  }

  if (effectiveForceAac) {
    try {
      const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer, true);
      if (req.destroyed || res.writableEnded) return;
      if (!remuxedBuf || remuxedBuf.length < 564 || remuxedBuf[0] !== 0x47) {
        res.status(502).end();
        return;
      }
      res.status(200);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=20');
      res.setHeader('Content-Length', String(remuxedBuf.length));
      res.end(remuxedBuf);
      return;
    } catch {
      if (req.destroyed || res.writableEnded) return;
      res.status(502).end();
      return;
    }
  }

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

  const rawRange = String(req.headers.range || '');
  const rangeMatch = rawRange.match(/^bytes=(\d+)-(\d*)$/i);
  // For iOS Safari & LG webOS initial Range: bytes=0-... probes on non-fMP4 TS segments,
  // defer truncating upstream bytes until we strip any disguised PNG/GIF/JPEG header bytes!
  const isInitialByteZeroRangeProbe =
    Boolean(rangeMatch && parseInt(rangeMatch[1], 10) === 0 && !isUrlMp4);

  if (req.headers.range && !isInitialByteZeroRangeProbe) {
    headers['Range'] = req.headers.range;
  }

  const isLiveSportsStreamHost =
    /footunder\.online|7odxv0l067ka\.net|futlivehd\.com|streamxhd\.(?:sbs|st)|tilinhd\.lol/i.test(
      targetUrl
    );

  // Instant RAM / in-flight prefetch hit for live HLS segments (eliminates double upstream hop)
  if (!isUrlSubtitle && (!rawRange || isInitialByteZeroRangeProbe)) {
    const cachedSeg =
      getCachedLiveTsSegment(targetUrl) || (await getInFlightLiveTsSegment(targetUrl));
    if (req.destroyed || res.writableEnded) return;
    if (cachedSeg && cachedSeg.buf.length > 0) {
      applyProxyCorsHeaders(res, reqId);
      if (isInitialByteZeroRangeProbe && rangeMatch) {
        const reqEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cachedSeg.buf.length - 1;
        const end = Math.min(Math.max(cachedSeg.buf.length - 1, 0), Math.max(0, reqEnd));
        const slice = cachedSeg.buf.subarray(0, end + 1);
        res.status(206);
        res.setHeader('Content-Type', cachedSeg.contentType || 'video/mp2t');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes 0-${end}/${cachedSeg.buf.length}`);
        res.setHeader('Content-Length', String(slice.length));
        res.end(slice);
        return;
      }
      res.status(200);
      res.setHeader('Content-Type', cachedSeg.contentType || 'video/mp2t');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', String(cachedSeg.buf.length));
      res.end(cachedSeg.buf);
      return;
    }
  }

  const hdrCtrl = new AbortController();
  const liveFetchTimeoutMs = isLiveSportsStreamHost ? 12_000 : 14_000;
  const hdrTimer = setTimeout(() => hdrCtrl.abort(), liveFetchTimeoutMs);
  req.on('close', () => {
    if (!res.writableEnded) hdrCtrl.abort();
  });

  try {
    if (!isLiveSportsStreamHost && shouldBypassNodeFetch(targetUrl)) {
      throw new Error('Use fast curl/h2 fallback');
    }
    let upstream = await streamingFetch(targetUrl, {
      headers,
      signal: hdrCtrl.signal,
      timeoutMs: liveFetchTimeoutMs,
    });
    if (
      (upstream.status === 400 ||
        upstream.status === 401 ||
        upstream.status === 403 ||
        upstream.status === 406) &&
      headers['Origin']
    ) {
      const noOriginHeaders: Record<string, string> = { ...headers };
      delete noOriginHeaders['Origin'];
      const retryResp = await streamingFetch(targetUrl, {
        headers: noOriginHeaders,
        signal: hdrCtrl.signal,
        timeoutMs: 12_000,
      }).catch(() => null);
      if (retryResp && retryResp.ok && retryResp.body) {
        upstream = retryResp;
      }
    } else if (upstream.status >= 500 || upstream.status === 429) {
      await new Promise((r) => setTimeout(r, 180));
      if (!hdrCtrl.signal.aborted) {
        const retryResp = await streamingFetch(targetUrl, {
          headers,
          signal: hdrCtrl.signal,
          timeoutMs: 12_000,
        }).catch(() => null);
        if (retryResp && retryResp.ok && retryResp.body) {
          upstream = retryResp;
        }
      }
    }
    clearTimeout(hdrTimer);
    if (!upstream.ok || !upstream.body) {
      if (
        isUrlMp4 &&
        (upstream.status === 429 ||
          upstream.status === 403 ||
          upstream.status === 404 ||
          upstream.status === 410)
      ) {
        try {
          await upstream.body?.cancel?.();
        } catch {
          // ignore
        }
        res.status(upstream.status === 429 ? 429 : 502).end();
        return;
      }
      throw new Error(`TS upstream ${upstream.status}`);
    }

    const rawCt = (upstream.headers.get('content-type') || '').toLowerCase();
    if (
      isUrlMp4 &&
      (rawCt.startsWith('text/html') || rawCt.includes('application/json'))
    ) {
      try {
        await upstream.body?.cancel?.();
      } catch {
        // ignore
      }
      res.status(502).end();
      return;
    }
    const isSubtitleContent = isUrlSubtitle || rawCt.includes('vtt') || rawCt.includes('subrip');
    const isDisguisedSegment =
      !isSubtitleContent &&
      (!rawCt ||
        rawCt.startsWith('text/html') ||
        rawCt.startsWith('text/plain') ||
        rawCt.startsWith('text/css') ||
        rawCt.startsWith('image/') ||
        rawCt.startsWith('font/') ||
        rawCt.includes('woff') ||
        rawCt.includes('javascript') ||
        rawCt.startsWith('application/octet-stream'));

    // Always strip disguised image headers on !isUrlMp4 even on Safari/webOS Range: bytes=0-... probes!
    const shouldSniffImageHeader =
      !isUrlMp4 &&
      !isSubtitleContent &&
      isDisguisedSegment &&
      (!req.headers.range || isInitialByteZeroRangeProbe);

    const cl = upstream.headers.get('content-length');
    const cr = upstream.headers.get('content-range');
    const ar = upstream.headers.get('accept-ranges');

    // When Safari sends Range: bytes=0-1 or bytes=0-65535 on a disguised TS segment, read bounded head bytes & slice cleanly
    if (isInitialByteZeroRangeProbe && shouldSniffImageHeader && rangeMatch) {
      const parsedReqEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 65535;
      const maxProbeBytes = Math.min(512 * 1024, Math.max(65536, parsedReqEnd + 16384));
      const reader = upstream.body.getReader();
      const probeChunks: Buffer[] = [];
      let totalRead = 0;
      let streamCompleted = false;
      try {
        while (totalRead < maxProbeBytes) {
          const { done, value } = await reader.read();
          if (done) {
            streamCompleted = true;
            break;
          }
          if (value && value.length > 0) {
            const b = Buffer.from(value);
            probeChunks.push(b);
            totalRead += b.length;
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }

      const fullBuf = Buffer.concat(probeChunks);
      const offset = findDisguisedTsOffset(fullBuf);
      const cleanBuf = offset > 0 ? fullBuf.subarray(offset) : fullBuf;
      const crTotalMatch = cr?.match(/\/(\d+)$/);
      const rawTotalLen = crTotalMatch
        ? parseInt(crTotalMatch[1], 10)
        : cl
        ? parseInt(cl, 10)
        : streamCompleted
        ? fullBuf.length
        : 0;
      const adjustedTotal =
        rawTotalLen > offset ? rawTotalLen - offset : Math.max(cleanBuf.length, 1);
      const reqEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cleanBuf.length - 1;
      const end = Math.min(Math.max(cleanBuf.length - 1, 0), Math.max(0, reqEnd));
      const slice = cleanBuf.subarray(0, end + 1);
      applyProxyCorsHeaders(res, reqId);
      res.status(206);
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Range', `bytes 0-${end}/${adjustedTotal}`);
      res.setHeader('Content-Length', String(slice.length));
      res.end(slice);
      return;
    }

    const writeCommonHeaders = (clAdjust = 0) => {
      res.status(upstream.status);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader(
        'Content-Type',
        isSubtitleContent
          ? 'text/vtt; charset=utf-8'
          : isDisguisedSegment
          ? isUrlMp4
            ? 'video/mp4'
            : 'video/mp2t'
          : rawCt
      );
      if (cl) {
        const numCl = Number(cl);
        if (Number.isFinite(numCl) && numCl > clAdjust) {
          res.setHeader('Content-Length', String(numCl - clAdjust));
        }
      }
      if (cr) res.setHeader('Content-Range', cr);
      if (ar) res.setHeader('Accept-Ranges', ar);
    };

    const nodeStream = Readable.fromWeb(upstream.body as never);
    runtimeMetrics.adjustActiveMediaStreams(1);
    let streamMetricClosed = false;
    const releaseStreamMetric = () => {
      if (streamMetricClosed) return;
      streamMetricClosed = true;
      runtimeMetrics.adjustActiveMediaStreams(-1);
    };
    res.once('close', releaseStreamMetric);
    res.once('finish', releaseStreamMetric);

    let streamIdleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdleTimer = () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      streamIdleTimer = setTimeout(() => {
        nodeStream.destroy();
      }, 20_000);
    };
    armIdleTimer();
    nodeStream.on('data', armIdleTimer);
    nodeStream.once('end', () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
    });
    nodeStream.once('close', () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      releaseStreamMetric();
    });
    nodeStream.on('error', () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      releaseStreamMetric();
      if (!res.headersSent) res.status(502);
      if (!res.writableEnded) res.end();
    });
    req.on('close', () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      releaseStreamMetric();
      if (!res.writableEnded && !nodeStream.destroyed) nodeStream.destroy();
    });

    const shouldBufferSportsSegment =
      isLiveSportsStreamHost &&
      !rawRange &&
      !isSubtitleContent &&
      !isUrlMp4 &&
      (!cl || Number(cl) <= 6 * 1024 * 1024);
    const cacheSegChunks: Buffer[] | null = shouldBufferSportsSegment ? [] : null;
    let cacheSegBytes = 0;

    const recordCacheChunk = (b: Buffer) => {
      if (!cacheSegChunks) return;
      if (cacheSegBytes + b.length <= 6 * 1024 * 1024) {
        cacheSegChunks.push(b);
        cacheSegBytes += b.length;
      } else {
        cacheSegChunks.length = 0;
      }
    };

    const finalizeSportsCache = () => {
      if (!cacheSegChunks || cacheSegChunks.length === 0 || cacheSegBytes < 188) return;
      const rawFull = Buffer.concat(cacheSegChunks);
      const off = findDisguisedTsOffset(rawFull);
      const cleanSeg = off > 0 ? rawFull.subarray(off) : rawFull;
      if (cleanSeg.length >= 188) {
        setCachedLiveTsSegment(
          targetUrl,
          cleanSeg,
          isDisguisedSegment ? 'video/mp2t' : rawCt || 'video/mp2t'
        );
      }
    };

    runtimeMetrics.recordUpstreamTransport(false);
    if (!shouldSniffImageHeader) {
      writeCommonHeaders(0);
      if (!shouldBufferSportsSegment) {
        nodeStream.pipe(res);
        return;
      }
      nodeStream.on('data', (chunk: Buffer) => {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        recordCacheChunk(b);
        if (!res.writableEnded && !res.write(b)) {
          nodeStream.pause();
          res.once('drain', () => nodeStream.resume());
        }
      });
      nodeStream.once('end', () => {
        finalizeSportsCache();
        if (!res.writableEnded) res.end();
      });
      return;
    }

    let headerChecked = false;
    const probeChunks: Buffer[] = [];
    let probeLen = 0;

    const flushInitial = (ended: boolean) => {
      if (headerChecked) return;
      headerChecked = true;
      const headBuf = Buffer.concat(probeChunks);
      const offset = findDisguisedTsOffset(headBuf);
      const cleanHead = offset > 0 ? headBuf.subarray(offset) : headBuf;
      recordCacheChunk(cleanHead);
      writeCommonHeaders(offset);
      if (cleanHead.length > 0) {
        res.write(cleanHead);
      }
      probeChunks.length = 0;
      if (ended) {
        finalizeSportsCache();
        res.end();
      }
    };

    nodeStream.on('data', (chunk: Buffer) => {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!headerChecked) {
        probeChunks.push(b);
        probeLen += b.length;
        if (probeLen >= 512) {
          flushInitial(false);
        }
      } else if (!res.writableEnded) {
        recordCacheChunk(b);
        if (!res.write(b)) {
          nodeStream.pause();
          res.once('drain', () => nodeStream.resume());
        }
      }
    });
    nodeStream.once('end', () => {
      if (!headerChecked) {
        flushInitial(true);
      } else {
        finalizeSportsCache();
        if (!res.writableEnded) {
          res.end();
        }
      }
    });
  } catch (err) {
    clearTimeout(hdrTimer);
    if (req.destroyed || res.writableEnded) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.startsWith('TS upstream ') && !errMsg.includes('Use fast curl')) {
      markHostNeedsCurlFallback(targetUrl);
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    if (!rangeMatch) {
      await new Promise<void>((resolve) => {
        const curlMaxSec = isLiveSportsStreamHost ? '8' : '22';
        const args = ['-4', '-sS', '-L', '-k', '--connect-timeout', '3', '--max-time', curlMaxSec];
        for (const [k, v] of Object.entries(headers)) {
          if (v) args.push('-H', `${k}: ${v}`);
        }
        args.push(targetUrl);
        const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'ignore'] });
        let headerFlushed = false;
        const headChunks: Buffer[] = [];
        let headLen = 0;

        const finishEarly = (statusCode: number) => {
          if (!res.headersSent) res.status(statusCode);
          if (!res.writableEnded) res.end();
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        };

        const flushHead = (ended: boolean) => {
          if (headerFlushed) return;
          headerFlushed = true;
          const headBuf = Buffer.concat(headChunks);
          headChunks.length = 0;
          if (headBuf.length === 0) {
            return finishEarly(502);
          }
          const headProbe = headBuf.subarray(0, Math.min(headBuf.length, 64)).toString('utf8').trimStart();
          if (/^(<!doctype|<html\b|<head\b|<body\b)/i.test(headProbe)) {
            return finishEarly(502);
          }
          const boxType = headBuf.length >= 8 ? headBuf.subarray(4, 8).toString('ascii') : '';
          const isFmp4 =
            isUrlMp4 ||
            boxType === 'ftyp' ||
            boxType === 'styp' ||
            boxType === 'moof' ||
            boxType === 'sidx';
          let cleanHead = headBuf;
          if (!isFmp4) {
            const tsOff = findDisguisedTsOffset(headBuf);
            if (tsOff > 0) cleanHead = headBuf.subarray(tsOff);
          }
          res.status(200);
          applyProxyCorsHeaders(res, reqId);
          res.setHeader('Content-Type', isFmp4 ? 'video/mp4' : 'video/mp2t');
          if (cleanHead.length > 0) {
            res.write(cleanHead);
            runtimeMetrics.recordUpstreamTransport(true, cleanHead.length);
          }
          if (ended && !res.writableEnded) {
            res.end();
            resolve();
          }
        };

        req.on('close', () => {
          if (!res.writableEnded) {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }
          resolve();
        });

        child.stdout.on('data', (chunk: Buffer) => {
          if (req.destroyed || res.writableEnded) return;
          const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (!headerFlushed) {
            headChunks.push(b);
            headLen += b.length;
            if (headLen >= 512) flushHead(false);
          } else {
            runtimeMetrics.recordUpstreamTransport(true, b.length);
            if (!res.write(b)) {
              child.stdout.pause();
              res.once('drain', () => child.stdout.resume());
            }
          }
        });

        child.on('close', () => {
          if (!headerFlushed) {
            flushHead(true);
          } else if (!res.writableEnded) {
            res.end();
          }
          resolve();
        });

        child.on('error', () => {
          finishEarly(502);
        });
      });
      return;
    }

    try {
      const buf = await curlGetBuffer(targetUrl, headers, 18);
      if (req.destroyed || res.writableEnded) return;
      if (!buf || buf.length === 0) {
        res.status(502).end();
        return;
      }
      const headProbe = buf.subarray(0, Math.min(buf.length, 64)).toString('utf8').trimStart();
      if (/^(<!doctype|<html\b|<head\b|<body\b)/i.test(headProbe)) {
        res.status(502).end();
        return;
      }
      const boxType = buf.length >= 8 ? buf.subarray(4, 8).toString('ascii') : '';
      const isFmp4Buffer =
        isUrlMp4 ||
        boxType === 'ftyp' ||
        boxType === 'styp' ||
        boxType === 'moof' ||
        boxType === 'sidx';

      let cleanFullBuf = buf;
      if (!isFmp4Buffer) {
        const tsOff = findDisguisedTsOffset(buf);
        if (tsOff > 0) cleanFullBuf = buf.subarray(tsOff);
      }

      let outBuf = cleanFullBuf;
      let statusCode = 200;
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const rawEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cleanFullBuf.length - 1;
        if (start >= 0 && start < cleanFullBuf.length) {
          const end = Math.min(cleanFullBuf.length - 1, Math.max(start, rawEnd));
          outBuf = cleanFullBuf.subarray(start, end + 1);
          statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${cleanFullBuf.length}`);
          res.setHeader('Accept-Ranges', 'bytes');
        }
      }

      res.status(statusCode);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', isFmp4Buffer ? 'video/mp4' : 'video/mp2t');
      res.setHeader('Content-Length', String(outBuf.length));
      runtimeMetrics.recordUpstreamTransport(true, outBuf.length);
      res.end(outBuf);
    } catch {
      if (!res.headersSent) res.status(502);
      res.end();
    }
  }
}
