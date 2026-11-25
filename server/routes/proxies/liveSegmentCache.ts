import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  curlGetBufferWithStatus,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  resolveKnownUpstreamReferer,
  shouldBypassNodeFetch,
} from '../../extractors/httpHelpers.ts';
import { findDisguisedTsOffset } from './proxyUtils.ts';

export interface CachedTsSegment {
  buf: Buffer;
  contentType: string;
  ts: number;
}

interface CachedLiveManifest {
  text: string;
  baseUrl: string;
  ts: number;
}

const MAX_SEGMENT_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_TOTAL_BYTES = 48 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 48;
const SEGMENT_TTL_MS = 22_000;
const MANIFEST_TTL_MS = 1_600;

const liveTsSegmentCache = new Map<string, CachedTsSegment>();
const inFlightSegmentFetches = new Map<string, Promise<CachedTsSegment | null>>();
const liveManifestSnippetCache = new Map<string, CachedLiveManifest>();
let currentCacheBytes = 0;

function evictExpiredOrExcess(): void {
  const now = Date.now();
  for (const [k, v] of liveTsSegmentCache.entries()) {
    if (now - v.ts > SEGMENT_TTL_MS) {
      currentCacheBytes = Math.max(0, currentCacheBytes - v.buf.length);
      liveTsSegmentCache.delete(k);
    }
  }
  while (
    (liveTsSegmentCache.size > MAX_CACHE_ENTRIES || currentCacheBytes > MAX_CACHE_TOTAL_BYTES) &&
    liveTsSegmentCache.size > 0
  ) {
    const oldestKey = liveTsSegmentCache.keys().next().value;
    if (!oldestKey) break;
    const oldVal = liveTsSegmentCache.get(oldestKey);
    if (oldVal) currentCacheBytes = Math.max(0, currentCacheBytes - oldVal.buf.length);
    liveTsSegmentCache.delete(oldestKey);
  }
}

export function setCachedLiveManifest(url: string, text: string, baseUrl: string): void {
  if (!url || !text || !text.includes('#EXTM3U')) return;
  if (liveManifestSnippetCache.size > 80) {
    const oldest = liveManifestSnippetCache.keys().next().value;
    if (oldest) liveManifestSnippetCache.delete(oldest);
  }
  liveManifestSnippetCache.set(url, { text, baseUrl: baseUrl || url, ts: Date.now() });
}

export function getCachedLiveManifest(url: string): CachedLiveManifest | null {
  const hit = liveManifestSnippetCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.ts > MANIFEST_TTL_MS) {
    liveManifestSnippetCache.delete(url);
    return null;
  }
  return hit;
}

export function getCachedLiveTsSegment(rawUrl: string): CachedTsSegment | null {
  const hit = liveTsSegmentCache.get(rawUrl);
  if (!hit) return null;
  if (Date.now() - hit.ts > SEGMENT_TTL_MS) {
    currentCacheBytes = Math.max(0, currentCacheBytes - hit.buf.length);
    liveTsSegmentCache.delete(rawUrl);
    return null;
  }
  return hit;
}

export function setCachedLiveTsSegment(rawUrl: string, buf: Buffer, contentType: string): void {
  if (!rawUrl || !buf || buf.length === 0 || buf.length > MAX_SEGMENT_BYTES) return;
  const existing = liveTsSegmentCache.get(rawUrl);
  if (existing) {
    currentCacheBytes = Math.max(0, currentCacheBytes - existing.buf.length);
    liveTsSegmentCache.delete(rawUrl);
  }
  liveTsSegmentCache.set(rawUrl, { buf, contentType, ts: Date.now() });
  currentCacheBytes += buf.length;
  evictExpiredOrExcess();
}

export function getInFlightLiveTsSegment(rawUrl: string): Promise<CachedTsSegment | null> | null {
  return inFlightSegmentFetches.get(rawUrl) || null;
}

export function prefetchLiveTsSegment(
  rawUrl: string,
  explicitReferer = '',
  userAgent = CHROME_UA
): Promise<CachedTsSegment | null> {
  if (!rawUrl || isDvbHeadendStream(rawUrl)) return Promise.resolve(null);
  const existing = getCachedLiveTsSegment(rawUrl);
  if (existing) return Promise.resolve(existing);

  const inFlight = inFlightSegmentFetches.get(rawUrl);
  if (inFlight) return inFlight;

  const isUrlMp4 =
    /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(rawUrl) ||
    /\/segs\/[^/]+\/init\./i.test(rawUrl);
  const referer = resolveKnownUpstreamReferer(rawUrl, explicitReferer);

  const job = (async (): Promise<CachedTsSegment | null> => {
    const headers: Record<string, string> = {
      'User-Agent': userAgent || CHROME_UA,
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

    let rawBuf: Buffer | null = null;
    let rawCt = '';

    try {
      if (!shouldBypassNodeFetch(rawUrl)) {
        const res = await streamingFetch(rawUrl, { headers, timeoutMs: 4200 });
        if (res.ok && res.body) {
          rawCt = (res.headers.get('content-type') || '').toLowerCase();
          const cl = Number(res.headers.get('content-length') || '0');
          if (!cl || cl <= MAX_SEGMENT_BYTES) {
            const ab = await res.arrayBuffer();
            const candidate = Buffer.from(ab);
            if (candidate.length > 0 && candidate.length <= MAX_SEGMENT_BYTES) {
              rawBuf = candidate;
            }
          }
        }
      }
    } catch {
      markHostNeedsCurlFallback(rawUrl);
    }

    if (!rawBuf) {
      try {
        const fb = await curlGetBufferWithStatus(rawUrl, headers, 5);
        if (fb.status >= 200 && fb.status < 400 && fb.buf.length > 0 && fb.buf.length <= MAX_SEGMENT_BYTES) {
          rawBuf = fb.buf;
        }
      } catch {
        // ignore prefetch failure
      }
    }

    if (!rawBuf || rawBuf.length < 188) return null;

    const headProbe = rawBuf.subarray(0, Math.min(rawBuf.length, 64)).toString('utf8').trimStart();
    if (/^(<!doctype|<html\b|<head\b|<body\b|\{)/i.test(headProbe)) {
      return null;
    }

    const boxType = rawBuf.length >= 8 ? rawBuf.subarray(4, 8).toString('ascii') : '';
    const isFmp4 =
      isUrlMp4 ||
      boxType === 'ftyp' ||
      boxType === 'styp' ||
      boxType === 'moof' ||
      boxType === 'sidx';

    let cleanBuf = rawBuf;
    if (!isFmp4) {
      const tsOff = findDisguisedTsOffset(rawBuf);
      if (tsOff > 0) cleanBuf = rawBuf.subarray(tsOff);
    }

    const contentType = isFmp4
      ? 'video/mp4'
      : rawCt && !rawCt.startsWith('image/') && !rawCt.startsWith('text/') && !rawCt.startsWith('application/octet-stream')
        ? rawCt
        : 'video/mp2t';

    setCachedLiveTsSegment(rawUrl, cleanBuf, contentType);
    return { buf: cleanBuf, contentType, ts: Date.now() };
  })()
    .catch(() => null)
    .finally(() => {
      if (inFlightSegmentFetches.get(rawUrl) === job) {
        inFlightSegmentFetches.delete(rawUrl);
      }
    });

  inFlightSegmentFetches.set(rawUrl, job);
  return job;
}
