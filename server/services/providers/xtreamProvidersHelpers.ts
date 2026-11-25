/**
 * @module server/services/providers/xtreamProvidersHelpers
 * @description SSRF-safe HTTP/curl helpers, M3U fallback parser, and opaque-token HLS playlist rewriter
 * for multi-provider Xtream servers. Keeps upstream credentials strictly inside server RAM.
 */
import crypto from 'crypto';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { CHROME_UA, curlGetBufferWithStatus, curlGetText } from '../../extractors/httpHelpers.ts';
import type { ProviderCatalogItemPublic } from './xtreamProvidersTypes.ts';

interface OpaqueProxyTarget {
  rawUrl: string;
  referer: string;
}

const subPlaylistCache = new LruTtlCache<string, OpaqueProxyTarget>(2000, 15 * 60 * 1000);
const segmentCache = new LruTtlCache<string, OpaqueProxyTarget>(6000, 8 * 60 * 1000);

function makeOpaqueToken(rawUrl: string): string {
  return crypto.createHash('sha1').update(rawUrl).digest('hex').slice(0, 20);
}

export function isDisallowedAdultItem(categoryName: string, itemName: string): boolean {
  const text = `${categoryName} ${itemName}`.toLowerCase();
  return /\b(xxx|adult|adults|porn|18\+|for\s*adults|erotic|hentai)\b/i.test(text);
}

export function sanitizePublicImageUrl(raw: unknown): string | undefined {
  const val = String(raw || '').trim();
  if (!val || !/^https?:\/\/[a-z0-9]/i.test(val)) return undefined;
  try {
    const parsed = new URL(val);
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeExtension(raw: unknown, fallback: string): string {
  const clean = String(raw || '')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return clean || fallback;
}

export function extractYearHint(rawTitle: string, rawDate?: unknown): string | undefined {
  const dateStr = String(rawDate || '').trim();
  const dateMatch = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
  if (dateMatch) return dateMatch[1];
  const titleMatch = String(rawTitle || '').match(/\(?(19\d{2}|20\d{2})\)?/);
  return titleMatch ? titleMatch[1] : undefined;
}

export async function fetchProviderJsonWithFallback(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: any }> {
  await assertSafeProxyUrl(url);
  const headerVariants: Array<Record<string, string>> = [
    { 'User-Agent': 'IPTVSmartersPlayer', Accept: 'application/json, text/plain, */*' },
    { 'User-Agent': CHROME_UA, Accept: 'application/json, text/plain, */*' },
  ];

  let lastStatus = 0;
  for (const headers of headerVariants) {
    try {
      const res = await streamingFetch(url, { method: 'GET', headers, timeoutMs });
      lastStatus = res.status;
      if (res.ok) {
        const text = await res.text();
        try {
          return { ok: true, status: res.status, data: JSON.parse(text) };
        } catch {
          // non-JSON response; try next variant
        }
      }
      if (res.status === 401 || res.status === 404) {
        break;
      }
    } catch {
      // fallback below
    }
  }

  try {
    const fb = await curlGetText(
      url,
      { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' },
      Math.max(4, Math.ceil(timeoutMs / 1000)),
      false,
      true
    );
    if (fb.text) {
      try {
        return { ok: true, status: 200, data: JSON.parse(fb.text) };
      } catch {
        // invalid JSON
      }
    }
  } catch {
    // ignore curl failure
  }

  return { ok: false, status: lastStatus || 502, data: null };
}

export interface ParsedM3uFallbackCatalog {
  live: Array<{
    streamId: string;
    name: string;
    categoryId: string;
    categoryName: string;
    poster?: string;
  }>;
  movies: Array<{
    streamId: string;
    name: string;
    categoryId: string;
    categoryName: string;
    poster?: string;
    ext: string;
  }>;
}

export function parseM3uPlusIntoCatalog(m3uText: string): ParsedM3uFallbackCatalog {
  const lines = String(m3uText || '').split(/\r?\n/);
  const live: ParsedM3uFallbackCatalog['live'] = [];
  const movies: ParsedM3uFallbackCatalog['movies'] = [];
  const seenLive = new Set<string>();
  const seenMovies = new Set<string>();
  const catIds = new Map<string, string>();
  let catSeq = 1;

  let currentName = '';
  let currentGroup = 'General';
  let currentLogo: string | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(',');
      currentName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      currentGroup = (groupMatch?.[1] || 'General').trim() || 'General';
      currentLogo = sanitizePublicImageUrl(logoMatch?.[1]);
      continue;
    }
    if (line.startsWith('#')) continue;
    if (/\/series\//i.test(line)) continue;

    let categoryId = catIds.get(currentGroup);
    if (!categoryId) {
      categoryId = `m3u-${catSeq++}`;
      catIds.set(currentGroup, categoryId);
    }

    const isMovie = /\/movie\//i.test(line);
    const idMatch = line.match(/\/([a-zA-Z0-9_-]{1,48})(?:\.([a-zA-Z0-9]{2,5}))?(?:\?.*)?$/);
    const streamId = idMatch?.[1] || '';
    const ext = sanitizeExtension(idMatch?.[2], isMovie ? 'mp4' : 'ts');
    const name = currentName || `Item ${streamId}`;
    currentName = '';
    if (!streamId || isDisallowedAdultItem(currentGroup, name)) continue;

    if (isMovie) {
      if (seenMovies.has(streamId)) continue;
      seenMovies.add(streamId);
      movies.push({ streamId, name, categoryId, categoryName: currentGroup, poster: currentLogo, ext });
    } else {
      if (seenLive.has(streamId)) continue;
      seenLive.add(streamId);
      live.push({ streamId, name, categoryId, categoryName: currentGroup, poster: currentLogo });
    }
  }

  return { live, movies };
}

export function buildProviderStreamUrl(
  providerId: string,
  kind: 'live' | 'movie' | 'series',
  streamId: string,
  ext?: string
): string {
  const pid = encodeURIComponent(providerId);
  const sid = encodeURIComponent(streamId);
  const cleanExt = sanitizeExtension(ext, kind === 'live' ? 'm3u8' : 'mp4');
  return `/api/providers/stream/${pid}/${kind}/${sid}.${cleanExt}`;
}

export function rewriteProviderPlaylistWithOpaqueTokens(
  manifestText: string,
  baseUrl: string,
  referer: string,
  originPrefix = ''
): string {
  const lines = manifestText.split(/\r?\n/);
  let nextIsPlaylist = false;
  const out: string[] = [];
  const absSuffix = originPrefix ? '?abs=1' : '';

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#EXT-X-STREAM-INF')) nextIsPlaylist = true;
      if (trimmed.includes('URI="')) {
        const replaced = rawLine.replace(/URI="([^"]+)"/g, (_m, uriVal) => {
          try {
            const absUri = new URL(uriVal, baseUrl).href;
            const token = makeOpaqueToken(absUri);
            if (trimmed.startsWith('#EXT-X-MEDIA') || /\.m3u8(\?|$)/i.test(absUri)) {
              subPlaylistCache.set(token, { rawUrl: absUri, referer });
              return `URI="${originPrefix}/api/providers/hls-sub/${token}.m3u8${absSuffix}"`;
            }
            segmentCache.set(token, { rawUrl: absUri, referer });
            return `URI="${originPrefix}/api/providers/hls-seg/${token}.bin"`;
          } catch {
            return _m;
          }
        });
        out.push(replaced);
        continue;
      }
      out.push(rawLine);
      continue;
    }

    try {
      const absUrl = new URL(trimmed, baseUrl).href;
      const isPlaylist = nextIsPlaylist || /\.m3u8(\?|$)/i.test(absUrl);
      nextIsPlaylist = false;
      const token = makeOpaqueToken(absUrl);
      if (isPlaylist) {
        subPlaylistCache.set(token, { rawUrl: absUrl, referer });
        out.push(`${originPrefix}/api/providers/hls-sub/${token}.m3u8${absSuffix}`);
      } else {
        const extMatch = absUrl.match(/\.(m4s|mp4|aac|ts)(\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'ts';
        segmentCache.set(token, { rawUrl: absUrl, referer });
        out.push(`${originPrefix}/api/providers/hls-seg/${token}.${ext}`);
      }
    } catch {
      nextIsPlaylist = false;
      out.push(rawLine);
    }
  }

  return out.join('\n') + '\n';
}

export async function fetchProviderPlaylistText(
  targetUrl: string,
  referer: string,
  timeoutMs = 3000
): Promise<{ text: string; baseUrl: string } | null> {
  await assertSafeProxyUrl(targetUrl);
  const headers: Record<string, string> = {
    'User-Agent': 'IPTVSmartersPlayer',
    Accept: '*/*',
    Referer: referer,
  };
  try {
    const res = await streamingFetch(targetUrl, { headers, timeoutMs });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(text)) {
        const finalUrl = res.url || targetUrl;
        await assertSafeProxyUrl(finalUrl);
        return { text, baseUrl: finalUrl };
      }
    }
  } catch {
    // curl fallback
  }

  const fb = await curlGetText(targetUrl, headers, 4, false, true).catch(() => ({
    text: '',
    effectiveUrl: targetUrl,
  }));
  if (fb.text && fb.text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(fb.text)) {
    const finalUrl = fb.effectiveUrl || targetUrl;
    await assertSafeProxyUrl(finalUrl);
    return { text: fb.text, baseUrl: finalUrl };
  }
  return null;
}

export async function resolveProviderSubPlaylist(
  tokenWithExt: string,
  originPrefix = ''
): Promise<string | null> {
  const token = String(tokenWithExt || '').replace(/\.m3u8$/i, '').trim();
  const entry = subPlaylistCache.get(token);
  if (!entry) return null;
  const loaded = await fetchProviderPlaylistText(entry.rawUrl, entry.referer).catch(() => null);
  if (!loaded) return null;
  return rewriteProviderPlaylistWithOpaqueTokens(loaded.text, loaded.baseUrl, entry.referer, originPrefix);
}

export async function fetchProviderOpaqueSegment(
  tokenWithExt: string,
  rangeHeader?: string
): Promise<{ status: number; contentType: string; buffer: Buffer } | null> {
  const token = String(tokenWithExt || '').replace(/\.[a-z0-9]+$/i, '').trim();
  const entry = segmentCache.get(token);
  if (!entry) return null;

  await assertSafeProxyUrl(entry.rawUrl);
  const headers: Record<string, string> = {
    'User-Agent': 'IPTVSmartersPlayer',
    Accept: '*/*',
    Referer: entry.referer,
  };
  if (rangeHeader) headers['Range'] = rangeHeader;

  try {
    const res = await streamingFetch(entry.rawUrl, { headers, timeoutMs: 8000 });
    if (res.ok || res.status === 206) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) {
        return {
          status: res.status,
          contentType: res.headers.get('content-type') || 'video/mp2t',
          buffer: buf,
        };
      }
    }
  } catch {
    // fallback to curl
  }

  const curlRes = await curlGetBufferWithStatus(entry.rawUrl, headers, 8).catch(() => ({
    buf: Buffer.alloc(0),
    status: 502,
  }));
  if (curlRes.buf.length > 0 && curlRes.status >= 200 && curlRes.status < 400) {
    return {
      status: curlRes.status,
      contentType: 'video/mp2t',
      buffer: curlRes.buf,
    };
  }
  return null;
}

export function sortCatalogItemsForDisplay(items: ProviderCatalogItemPublic[]): ProviderCatalogItemPublic[] {
  return items.sort((a, b) => {
    const score = (item: ProviderCatalogItemPublic): number => {
      const text = `${item.categoryName} ${item.name}`.toLowerCase();
      if (/\b(es|esp|spain|espa[ñn]a|castellano|tdt|movistar|dazn)\b/i.test(text)) return 0;
      if (/\b(cine|estreno|pel[ií]cula|4k|uhd|netflix|hbo|disney|prime)\b/i.test(text)) return 1;
      if (/\b(deport|sport|f[uú]tbol|futbol|laliga|champions)\b/i.test(text)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });
}
