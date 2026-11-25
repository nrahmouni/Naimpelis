/**
 * @module server/services/providers/xtreamProvidersHelpers
 * @description SSRF-safe HTTP/curl helpers, M3U fallback parser, manifest/segment RAM prefetch cache,
 * and opaque-token HLS playlist rewriter for multi-provider Xtream servers.
 */
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import zlib from 'zlib';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { parseStreamMetadata } from '../../utils/streamMetaParser.ts';
import { CHROME_UA, curlGetBufferWithStatus, curlGetText } from '../../extractors/httpHelpers.ts';
import type {
  ProviderCatalogItemPublic,
  ProviderPriorityMode,
} from './xtreamProvidersTypes.ts';

interface OpaqueProxyTarget {
  rawUrl: string;
  referer: string;
}

const subPlaylistCache = new LruTtlCache<string, OpaqueProxyTarget>(2500, 15 * 60 * 1000);
const segmentCache = new LruTtlCache<string, OpaqueProxyTarget>(8000, 8 * 60 * 1000);
const subPlaylistBodyRamCache = new LruTtlCache<string, string>(600, 10_000);
const segmentBodyRamCache = new LruTtlCache<
  string,
  { status: number; contentType: string; buffer: Buffer }
>(180, 15_000);
const inflightSegmentFetches = new Map<
  string,
  Promise<{ status: number; contentType: string; buffer: Buffer } | null>
>();

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

function decompressTextBuffer(buf: Buffer, encodingHeader: string | string[] | undefined): string {
  const enc = String(Array.isArray(encodingHeader) ? encodingHeader[0] : encodingHeader || '')
    .trim()
    .toLowerCase();
  try {
    if (enc.includes('gzip')) return zlib.gunzipSync(buf).toString('utf8');
    if (enc.includes('deflate')) return zlib.inflateSync(buf).toString('utf8');
    if (enc.includes('br')) return zlib.brotliDecompressSync(buf).toString('utf8');
  } catch {
    // fallback to raw buffer text if upstream mislabeled encoding
  }
  return buf.toString('utf8');
}

function fetchDirectIpv4Text(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  redirectsLeft = 3
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request(
      parsed,
      {
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip, deflate', ...headers },
        family: 4,
        timeout: timeoutMs,
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode || 502;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).toString();
          assertSafeProxyUrl(nextUrl)
            .then(() => fetchDirectIpv4Text(nextUrl, headers, timeoutMs, redirectsLeft - 1))
            .then(resolve)
            .catch(reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const text = decompressTextBuffer(Buffer.concat(chunks), res.headers['content-encoding']);
          resolve({ status, text });
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Direct IPv4 timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function fetchProviderJsonWithFallback(
  url: string,
  timeoutMs: number,
  opts?: { largeCatalog?: boolean }
): Promise<{ ok: boolean; status: number; data: any }> {
  await assertSafeProxyUrl(url);
  const primaryHeaders = { 'User-Agent': 'IPTVSmartersPlayer', Accept: 'application/json, text/plain, */*' };
  const chromeHeaders = { 'User-Agent': CHROME_UA, Accept: 'application/json, text/plain, */*' };

  let lastStatus = 0;
  for (const headers of [primaryHeaders, chromeHeaders]) {
    let timedOutOrNetworkErr = false;
    try {
      const res = await streamingFetch(url, {
        method: 'GET',
        headers,
        timeoutMs: opts?.largeCatalog ? Math.min(timeoutMs, 15_000) : timeoutMs,
        headersTimeoutOnly: Boolean(opts?.largeCatalog),
      });
      lastStatus = res.status;
      if (res.ok) {
        const text = await res.text();
        try {
          return { ok: true, status: res.status, data: JSON.parse(text) };
        } catch {
          continue;
        }
      }
      if (res.status === 401 || res.status === 404) {
        return { ok: false, status: res.status, data: null };
      }
      if (res.status !== 403 && res.status !== 406) {
        break;
      }
    } catch {
      timedOutOrNetworkErr = true;
    }
    if (timedOutOrNetworkErr) {
      break;
    }
  }

  try {
    const direct = await fetchDirectIpv4Text(url, primaryHeaders, timeoutMs);
    if (direct.status >= 200 && direct.status < 300 && direct.text) {
      try {
        return { ok: true, status: direct.status, data: JSON.parse(direct.text) };
      } catch {
        // fallback to curl below
      }
    } else if (direct.status) {
      lastStatus = direct.status;
      if (direct.status === 401 || direct.status === 404) {
        return { ok: false, status: direct.status, data: null };
      }
    }
  } catch {
    // fallback to curl below
  }

  if (!opts?.largeCatalog) {
    try {
      const fb = await curlGetText(
        url,
        { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' },
        Math.max(4, Math.ceil(timeoutMs / 1000)),
        true,
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

/**
 * Warms either the first sub-playlist (+ its segment #1) OR the first direct segment
 * asynchronously in RAM right after a manifest resolves so hls.js hits local memory in <2ms.
 */
export function prefetchProviderHlsFirstSegment(rewrittenManifest: string, originPrefix = ''): void {
  const lines = String(rewrittenManifest || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return;

  const first = lines[0];
  const subMatch = first.match(/\/api\/providers\/hls-sub\/([^.?/]+)\.m3u8/i);
  if (subMatch?.[1]) {
    void resolveProviderSubPlaylist(subMatch[1], originPrefix, { prefetchFirstSegment: true }).catch(
      () => undefined
    );
    return;
  }

  const segMatch = first.match(/\/api\/providers\/hls-seg\/([^.?/]+)(?:\.[a-z0-9]+)?/i);
  if (segMatch?.[1]) {
    void fetchProviderOpaqueSegment(segMatch[1]).catch(() => undefined);
  }
}

export async function fetchProviderPlaylistText(
  targetUrl: string,
  referer: string,
  timeoutMs = 4500,
  opts?: { skipCurlRetry?: boolean }
): Promise<{ text: string; baseUrl: string } | null> {
  await assertSafeProxyUrl(targetUrl);
  const headers: Record<string, string> = {
    'User-Agent': 'IPTVSmartersPlayer',
    Accept: '*/*',
    Referer: referer,
  };
  let timedOutOrRejected = false;
  try {
    const res = await streamingFetch(targetUrl, { headers, timeoutMs });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(text)) {
        const finalUrl = res.url || targetUrl;
        await assertSafeProxyUrl(finalUrl);
        return { text, baseUrl: finalUrl };
      }
    } else {
      if (res.body) void res.body.cancel().catch(() => undefined);
      if (res.status === 401 || res.status === 404) {
        return null;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    timedOutOrRejected = /timeout|aborted/i.test(msg);
  }

  if (opts?.skipCurlRetry || timedOutOrRejected) {
    return null;
  }

  const fb = await curlGetText(targetUrl, headers, Math.max(3, Math.ceil(timeoutMs / 1000)), false, true).catch(
    () => ({
      text: '',
      effectiveUrl: targetUrl,
    })
  );
  if (fb.text && fb.text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(fb.text)) {
    const finalUrl = fb.effectiveUrl || targetUrl;
    await assertSafeProxyUrl(finalUrl);
    return { text: fb.text, baseUrl: finalUrl };
  }
  return null;
}

export async function resolveProviderSubPlaylist(
  tokenWithExt: string,
  originPrefix = '',
  opts?: { prefetchFirstSegment?: boolean }
): Promise<string | null> {
  const token = String(tokenWithExt || '').replace(/\.m3u8$/i, '').trim();
  const cacheKey = `${token}:${originPrefix || 'rel'}`;
  const cachedBody = subPlaylistBodyRamCache.get(cacheKey);
  if (cachedBody) {
    return cachedBody;
  }

  const entry = subPlaylistCache.get(token);
  if (!entry) return null;
  const loaded = await fetchProviderPlaylistText(entry.rawUrl, entry.referer, 4500, {
    skipCurlRetry: true,
  }).catch(() => null);
  if (!loaded) return null;
  const rewritten = rewriteProviderPlaylistWithOpaqueTokens(
    loaded.text,
    loaded.baseUrl,
    entry.referer,
    originPrefix
  );
  subPlaylistBodyRamCache.set(cacheKey, rewritten);
  if (opts?.prefetchFirstSegment) {
    const firstSeg = rewritten
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && l.includes('/api/providers/hls-seg/'));
    const segToken = firstSeg?.match(/\/api\/providers\/hls-seg\/([^.?/]+)/i)?.[1];
    if (segToken) {
      void fetchProviderOpaqueSegment(segToken).catch(() => undefined);
    }
  }
  return rewritten;
}

export async function fetchProviderOpaqueSegment(
  tokenWithExt: string,
  rangeHeader?: string
): Promise<{ status: number; contentType: string; buffer: Buffer } | null> {
  const token = String(tokenWithExt || '').replace(/\.[a-z0-9]+$/i, '').trim();
  if (!rangeHeader) {
    const cachedSeg = segmentBodyRamCache.get(token);
    if (cachedSeg) {
      return cachedSeg;
    }
    const inflight = inflightSegmentFetches.get(token);
    if (inflight) {
      return inflight;
    }
  }

  const entry = segmentCache.get(token);
  if (!entry) return null;

  const task = (async (): Promise<{ status: number; contentType: string; buffer: Buffer } | null> => {
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
          const out = {
            status: res.status,
            contentType: res.headers.get('content-type') || 'video/mp2t',
            buffer: buf,
          };
          if (!rangeHeader && res.status === 200 && buf.length <= 6 * 1024 * 1024) {
            segmentBodyRamCache.set(token, out);
          }
          return out;
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
      const out = {
        status: curlRes.status,
        contentType: 'video/mp2t',
        buffer: curlRes.buf,
      };
      if (!rangeHeader && curlRes.status === 200 && curlRes.buf.length <= 6 * 1024 * 1024) {
        segmentBodyRamCache.set(token, out);
      }
      return out;
    }
    return null;
  })();

  if (!rangeHeader) {
    const wrapped = task.finally(() => {
      if (inflightSegmentFetches.get(token) === wrapped) {
        inflightSegmentFetches.delete(token);
      }
    });
    inflightSegmentFetches.set(token, wrapped);
    return wrapped;
  }

  return task;
}

export function detectProviderItemLangAndQuality(
  rawName: string,
  categoryName = '',
  kind: 'live' | 'movie' | 'series' = 'live',
  containerExt = ''
): { lang: string; langLabel: string; quality: string; qualityTier: number; cleanTitle: string } {
  const parsed = parseStreamMetadata(rawName, categoryName, kind, containerExt);
  return {
    lang: parsed.lang,
    langLabel: parsed.langLabel,
    quality: parsed.quality,
    qualityTier: parsed.qualityTier,
    cleanTitle: parsed.cleanTitle,
  };
}

export function computeProviderCatalogSortScore(
  item: Pick<ProviderCatalogItemPublic, 'lang' | 'qualityTier' | 'categoryName' | 'name'>,
  priority: ProviderPriorityMode = 'es_quality'
): number {
  const lang = String(item.lang || 'INTL').toUpperCase();
  const langScore =
    lang === 'ES'
      ? 0
      : lang === 'CAT'
      ? 1
      : lang === 'LAT'
      ? 2
      : lang === 'VOSE'
      ? 3
      : lang === 'EN'
      ? 4
      : 5;
  const qa = typeof item.qualityTier === 'number' ? item.qualityTier : 2;
  const esBoost = /\b(tdt|movistar|dazn|laliga|champions|estreno)\b/i.test(
    `${item.categoryName} ${item.name}`
  )
    ? 0
    : 1;

  if (priority === 'best_quality') {
    // 4K UHD > 1080p FHD > HD > SD first, with Castellano as top tie-breaker
    return qa * 100 + langScore * 10 + esBoost;
  }
  // Castellano (ES) + Best Quality within Castellano
  return langScore * 100 + qa * 10 + esBoost;
}

export function sortCatalogItemsForDisplay(
  items: ProviderCatalogItemPublic[],
  priority: ProviderPriorityMode = 'es_quality'
): ProviderCatalogItemPublic[] {
  return items.sort(
    (a, b) =>
      computeProviderCatalogSortScore(a, priority) - computeProviderCatalogSortScore(b, priority)
  );
}
