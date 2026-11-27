import { LruTtlCache } from '../../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { curlGetBuffer } from '../../extractors/httpHelpers.ts';

export interface CachedLiveManifestEntry {
  text: string;
  baseUrl: string;
  ts: number;
}

export interface CachedLiveSegmentEntry {
  buf: Buffer;
  contentType: string;
  ts: number;
}

const MAX_TS_SEGMENT_CACHE_BYTES = 128 * 1024 * 1024;
const MAX_TS_SEGMENT_BYTES = 8 * 1024 * 1024;

const liveManifestCache = new LruTtlCache<string, CachedLiveManifestEntry>(800, 10_000);
const liveTsSegmentCache = new LruTtlCache<string, CachedLiveSegmentEntry>(96, 30_000);
const inFlightManifestMap = new Map<string, Promise<CachedLiveManifestEntry | null>>();
const inFlightTsSegmentMap = new Map<string, Promise<CachedLiveSegmentEntry | null>>();

let cachedSegmentTotalBytes = 0;

export function getCachedLiveManifest(url: string): CachedLiveManifestEntry | null {
  return liveManifestCache.get(url) ?? null;
}

export function setCachedLiveManifest(
  url: string,
  entryOrText: { text: string; baseUrl: string; ts?: number } | string,
  baseUrlArg?: string
): void {
  if (!url) return;
  if (typeof entryOrText === 'string') {
    if (!entryOrText) return;
    liveManifestCache.set(url, {
      text: entryOrText,
      baseUrl: baseUrlArg || url,
      ts: Date.now(),
    });
    return;
  }
  if (!entryOrText || !entryOrText.text) return;
  liveManifestCache.set(url, {
    text: entryOrText.text,
    baseUrl: entryOrText.baseUrl || url,
    ts: entryOrText.ts ?? Date.now(),
  });
}

export async function coalesceLiveManifestFetch<
  T extends { text: string; baseUrl: string; ts?: number },
>(url: string, fetcher: () => Promise<T | null>): Promise<CachedLiveManifestEntry | null> {
  const existing = inFlightManifestMap.get(url);
  if (existing) return existing;

  const flight = (async () => {
    try {
      const res = await fetcher();
      if (!res || !res.text) return null;
      const stored: CachedLiveManifestEntry = {
        text: res.text,
        baseUrl: res.baseUrl,
        ts: res.ts ?? Date.now(),
      };
      liveManifestCache.set(url, stored);
      return stored;
    } finally {
      inFlightManifestMap.delete(url);
    }
  })();

  inFlightManifestMap.set(url, flight);
  return flight;
}

export function getCachedLiveTsSegment(url: string): CachedLiveSegmentEntry | null {
  return liveTsSegmentCache.get(url) ?? null;
}

export function getInFlightLiveTsSegment(url: string): Promise<CachedLiveSegmentEntry | null> | null {
  return inFlightTsSegmentMap.get(url) ?? null;
}

export function setCachedLiveTsSegment(url: string, buf: Buffer, contentType = 'video/mp2t'): void {
  if (!url || !buf || buf.length === 0 || buf.length > MAX_TS_SEGMENT_BYTES) return;
  const prev = liveTsSegmentCache.get(url);
  if (prev) {
    cachedSegmentTotalBytes = Math.max(0, cachedSegmentTotalBytes - prev.buf.length);
  }
  if (cachedSegmentTotalBytes + buf.length > MAX_TS_SEGMENT_CACHE_BYTES) {
    liveTsSegmentCache.clear();
    cachedSegmentTotalBytes = 0;
  }
  cachedSegmentTotalBytes += buf.length;
  liveTsSegmentCache.set(url, {
    buf,
    contentType,
    ts: Date.now(),
  });
}

export async function prefetchLiveTsSegment(
  url: string,
  referer = '',
  ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
): Promise<CachedLiveSegmentEntry | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const cached = getCachedLiveTsSegment(url);
  if (cached) return cached;
  const existing = inFlightTsSegmentMap.get(url);
  if (existing) return existing;

  const flight = (async (): Promise<CachedLiveSegmentEntry | null> => {
    try {
      await assertSafeProxyUrl(url);
      const headers: Record<string, string> = {
        'User-Agent': ua,
        Accept: '*/*',
      };
      if (referer) {
        headers['Referer'] = referer;
      }

      let buf: Buffer | null = null;
      let contentType = /\.(m4s|mp4)(\?|$)/i.test(url) ? 'video/mp4' : 'video/mp2t';

      try {
        const res = await streamingFetch(url, {
          headers,
          keepAliveAgent: true,
          timeoutMs: 3200,
        });
        if (res.ok) {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.startsWith('text/html') || ct.includes('application/json')) {
            await res.body?.cancel?.().catch(() => {});
            return null;
          }
          const arr = Buffer.from(await res.arrayBuffer());
          if (arr.length > 0 && arr.length <= MAX_TS_SEGMENT_BYTES) {
            buf = arr;
            if (ct.includes('mp4')) contentType = 'video/mp4';
          }
        } else {
          await res.body?.cancel?.().catch(() => {});
        }
      } catch {
        // fallback to curl below
      }

      if (!buf) {
        const fb = await curlGetBuffer(url, headers, 4).catch(() => null);
        if (fb && fb.length > 0 && fb.length <= MAX_TS_SEGMENT_BYTES) {
          const headStr = fb.subarray(0, Math.min(fb.length, 64)).toString('utf8').trimStart();
          if (!/^(<!doctype|<html\b|<head\b|<body\b)/i.test(headStr)) {
            buf = fb;
          }
        }
      }

      if (!buf || buf.length === 0) return null;
      setCachedLiveTsSegment(url, buf, contentType);
      return getCachedLiveTsSegment(url);
    } catch {
      return null;
    } finally {
      inFlightTsSegmentMap.delete(url);
    }
  })();

  inFlightTsSegmentMap.set(url, flight);
  return flight;
}

export function deriveNextPredictedSegmentUrl(segmentUrl: string): string | null {
  try {
    const parsed = new URL(segmentUrl);
    const match = parsed.pathname.match(/^(.*?)(\d+)(\.[a-z0-9]{1,5})$/i);
    if (!match) return null;
    const [, prefix, digits, ext] = match;
    const nextNum = Number(digits) + 1;
    const padded =
      digits.startsWith('0') && String(nextNum).length < digits.length
        ? String(nextNum).padStart(digits.length, '0')
        : String(nextNum);
    parsed.pathname = `${prefix}${padded}${ext}`;
    return parsed.href;
  } catch {
    return null;
  }
}
