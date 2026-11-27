export interface MediasetResolvedStream {
  streamUrl: string;
  referer: string;
}

/**
 * Resolves a Mediaset/Mitele live URL if valid HLS metadata is returned,
 * returning null gracefully when unavailable so callers fall back cleanly.
 */
export async function resolveMediasetLiveHlsUrl(
  sourceUrl: string
): Promise<MediasetResolvedStream | null> {
  const clean = String(sourceUrl || '').trim();
  if (!clean) return null;
  if (/\.m3u8(\?|$)/i.test(clean) && /^https?:\/\//i.test(clean)) {
    return { streamUrl: clean, referer: 'https://www.mitele.es/' };
  }
  return null;
}
