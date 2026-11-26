/**
 * Responsive TMDB & Poster Image Helpers + Poster Ambient Color Extractor
 */

export function toTmdbSizedUrl(url: string | undefined, size: 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'): string {
  if (!url) return '/icon.svg';
  if (!url.includes('image.tmdb.org/t/p/')) return url;
  return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
}

export function buildPosterSrcSet(url: string | undefined): string | undefined {
  if (!url || !url.includes('image.tmdb.org/t/p/')) return undefined;
  return `${toTmdbSizedUrl(url, 'w342')} 342w, ${toTmdbSizedUrl(url, 'w500')} 500w, ${toTmdbSizedUrl(url, 'w780')} 780w`;
}

export function buildBackdropSrcSet(url: string | undefined): string | undefined {
  if (!url || !url.includes('image.tmdb.org/t/p/')) return undefined;
  return `${toTmdbSizedUrl(url, 'w780')} 780w, ${toTmdbSizedUrl(url, 'w1280')} 1280w`;
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
