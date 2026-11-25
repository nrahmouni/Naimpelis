/**
 * Responsive TMDB & Poster Image Helpers + Poster Ambient Color Extractor + Smart Image Prefetcher
 */

export function toTmdbSizedUrl(
  url: string | undefined,
  size: 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'
): string {
  if (!url) return '/icon.svg';
  if (!url.includes('image.tmdb.org/t/p/')) return url;
  return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
}

export function optimizeArtworkUrl(
  url: string | undefined | null,
  kind: 'poster' | 'backdrop' | 'square' = 'poster'
): string {
  const clean = typeof url === 'string' ? url.trim() : '';
  if (!clean) return '';
  if (clean.includes('image.tmdb.org/t/p/')) {
    if (kind === 'backdrop') return toTmdbSizedUrl(clean, 'w780');
    if (kind === 'square') return toTmdbSizedUrl(clean, 'w300');
    return toTmdbSizedUrl(clean, 'w342');
  }
  return clean;
}

export function buildPosterSrcSet(url: string | undefined): string | undefined {
  if (!url || !url.includes('image.tmdb.org/t/p/')) return undefined;
  return `${toTmdbSizedUrl(url, 'w185')} 185w, ${toTmdbSizedUrl(url, 'w342')} 342w, ${toTmdbSizedUrl(url, 'w500')} 500w`;
}

export function buildBackdropSrcSet(url: string | undefined): string | undefined {
  if (!url || !url.includes('image.tmdb.org/t/p/')) return undefined;
  return `${toTmdbSizedUrl(url, 'w780')} 780w, ${toTmdbSizedUrl(url, 'w1280')} 1280w`;
}

const prefetchedImageCache = new Set<string>();

/**
 * Prefetches up to `limit` (default 16) visible poster/logo URLs at low network priority
 * while respecting Save-Data and slow 2G connections.
 */
export function prefetchImageUrls(
  urls: Array<string | undefined | null>,
  options?: { limit?: number; kind?: 'poster' | 'backdrop' | 'square' }
): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.connection?.saveData || nav.connection?.effectiveType === '2g') return;

  const limit = options?.limit ?? 16;
  const kind = options?.kind ?? 'poster';
  let queued = 0;

  for (const raw of urls) {
    if (queued >= limit) break;
    const optimized = optimizeArtworkUrl(raw, kind);
    if (!optimized || optimized === '/icon.svg' || optimized.startsWith('data:')) continue;
    if (prefetchedImageCache.has(optimized)) continue;
    prefetchedImageCache.add(optimized);
    if (prefetchedImageCache.size > 400) {
      const oldest = prefetchedImageCache.values().next().value;
      if (oldest) prefetchedImageCache.delete(oldest);
    }
    queued += 1;

    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    img.src = optimized;
  }
}

/**
 * Computes a deterministic, visually rich fallback ambient glow color from a title or poster URL
 * (and samples pixel luminance if CORS allows), always AA-safe for dark backgrounds.
 */
export function extractSafeAmbientColor(seedText: string): string {
  const palette = [
    'rgba(225, 29, 72, 0.28)',   // Crimson
    'rgba(234, 88, 12, 0.26)',   // Ember
    'rgba(14, 165, 233, 0.25)',  // Cinema Cyan
    'rgba(139, 92, 246, 0.26)',  // Ultraviolet
    'rgba(16, 185, 129, 0.24)',  // Emerald Pitch
    'rgba(245, 158, 11, 0.25)',  // Amber Gold
  ];
  let hash = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] || palette[0];
}
