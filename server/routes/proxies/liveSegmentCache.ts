import { LruTtlCache } from '../../utils/lruCache.ts';

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

const liveManifestCache = new LruTtlCache<string, CachedLiveManifestEntry>(800, 10_000);
const liveTsSegmentCache = new LruTtlCache<string, CachedLiveSegmentEntry>(400, 30_000);
const inFlightManifestMap = new Map<string, Promise<CachedLiveManifestEntry | null>>();

export function getCachedLiveManifest(url: string): CachedLiveManifestEntry | null {
  return liveManifestCache.get(url) ?? null;
}

export function setCachedLiveManifest(
  url: string,
  entry: { text: string; baseUrl: string; ts?: number }
): void {
  liveManifestCache.set(url, {
    text: entry.text,
    baseUrl: entry.baseUrl,
    ts: entry.ts ?? Date.now(),
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

export function setCachedLiveTsSegment(url: string, buf: Buffer, contentType = 'video/mp2t'): void {
  if (!url || !buf || buf.length === 0) return;
  liveTsSegmentCache.set(url, {
    buf,
    contentType,
    ts: Date.now(),
  });
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
