/**
 * @module server/services/providers/xtreamProvidersHelpers
 * @description SSRF-safe HTTP/curl helpers, M3U fallback parser, and opaque-token HLS playlist rewriter
 * for multi-provider Xtream servers. Keeps upstream credentials strictly inside server RAM.
 */
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import zlib from 'zlib';
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
          // non-JSON response; try alternate header
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

  // Fallback 1: Direct IPv4 Node HTTP/HTTPS (supports >30MB compressed VOD JSONs)
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

export async function fetchProviderPlaylistText(
  targetUrl: string,
  referer: string,
  timeoutMs = 4500
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

  const fb = await curlGetText(targetUrl, headers, Math.max(4, Math.ceil(timeoutMs / 1000)), false, true).catch(() => ({
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

export function detectProviderItemLangAndQuality(
  rawName: string,
  categoryName = '',
  kind: 'live' | 'movie' | 'series' = 'live',
  containerExt = ''
): { lang: string; langLabel: string; quality: string; qualityTier: number } {
  const name = String(rawName || '')
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ')
    .trim();
  const cat = String(categoryName || '').trim();
  const hay = `${name} ${cat} ${containerExt}`.toLowerCase();

  let lang = 'INTL';
  let langLabel = 'Internacional';
  if (/[\u0600-\u06FF]/.test(`${name} ${cat}`) || /^(?:\[?\s*(?:AR|ARB)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:arabic|arabia|egypt|maroc|morocco|aflam|bein)\b/i.test(cat)) {
    lang = 'AR';
    langLabel = 'Árabe (AR)';
  } else if (/^(?:\[?\s*(?:CAT)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:catal[aà]|3cat|tv3)\b/i.test(hay)) {
    lang = 'CAT';
    langLabel = 'Català';
  } else if (/\b(?:vose|subtitulad[ao]s?|sub\s*es|sub\s*esp)\b/i.test(hay)) {
    lang = 'VOSE';
    langLabel = 'VOSE';
  } else if (/^(?:\[?\s*(?:LAT|LA|MX)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:latino|latam|audio\s*latino|es-mx|m[eé]xico|argentina|colombia)\b/i.test(hay)) {
    lang = 'LAT';
    langLabel = 'Latino';
  } else if (
    /^(?:\[?\s*(?:VIP\s*)?(?:ES|ESP|SPAIN|ESPA[ÑN]A|CAST)\s*\]?\s*[|:/-])/i.test(name) ||
    /^(?:\[?\s*(?:VIP\s*)?(?:ES|ESP|SPAIN|ESPA[ÑN]A)\s*\]?\s*[|:/-])/i.test(cat) ||
    /\b(?:castellano|espa[ñn]a|spain|tdt|tivify|movistar|dazn\s*(?:la\s*liga|1|2|3|4|f1)|laliga\s*hypermotion|cine\s*es|pel[ií]culas|estrenos|atresmedia|mediaset|rtve)\b/i.test(
      hay
    )
  ) {
    lang = 'ES';
    langLabel = 'Castellano';
  } else if (/^(?:\[?\s*(?:FR|VF|VOSTFR)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:french|fran[çc]ais|france|vostfr)\b/i.test(hay)) {
    lang = 'FR';
    langLabel = 'Francés';
  } else if (/^(?:\[?\s*(?:PT|BR)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:portugu[eê]s|portugal|brasil)\b/i.test(hay)) {
    lang = 'PT';
    langLabel = 'Portugués';
  } else if (/^(?:\[?\s*(?:IT)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:italiano|italy|italia)\b/i.test(hay)) {
    lang = 'IT';
    langLabel = 'Italiano';
  } else if (/^(?:\[?\s*(?:DE|GER)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:german|deutsch)\b/i.test(hay)) {
    lang = 'DE';
    langLabel = 'Alemán';
  } else if (/^(?:\[?\s*(?:EN|ENG|UK|US|USA)\s*\]?\s*[|:/-])/i.test(name) || /\b(?:english|ingl[eé]s|uk|usa)\b/i.test(hay)) {
    lang = 'EN';
    langLabel = 'Inglés';
  }

  const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(hay);
  let quality = kind === 'live' ? 'HD' : '1080p FHD';
  let qualityTier = kind === 'live' ? 2 : 1;

  if (/\b(?:4k|uhd|2160p?|dolby\s*vision|hdr10?\+?|remux)\b/.test(hay)) {
    quality = isHevc ? '4K HEVC' : '4K UHD';
    qualityTier = isHevc ? 2.5 : 0;
  } else if (/\b(?:fhd|1080p?|full\s*hd|blu-?ray|bdrip)\b/.test(hay)) {
    quality = isHevc ? '1080p HEVC' : '1080p FHD';
    qualityTier = isHevc ? 2.8 : 1;
  } else if (/\b(?:576p?|480p?|360p?|sd|lq|dvdrip)\b/.test(hay)) {
    quality = 'SD';
    qualityTier = 4;
  } else if (/\b(?:720p?|hd|hdtv|web-?dl|webrip)\b/.test(hay)) {
    quality = 'HD';
    qualityTier = isHevc ? 3 : 2;
  }

  return { lang, langLabel, quality, qualityTier };
}

export function sortCatalogItemsForDisplay(items: ProviderCatalogItemPublic[]): ProviderCatalogItemPublic[] {
  const langScore = (item: ProviderCatalogItemPublic): number => {
    if (item.lang === 'ES') return 0;
    if (item.lang === 'CAT') return 1;
    if (item.lang === 'LAT') return 2;
    if (item.lang === 'VOSE') return 3;
    if (item.lang === 'EN') return 4;
    return 5;
  };
  return items.sort((a, b) => {
    const lDiff = langScore(a) - langScore(b);
    if (lDiff !== 0) return lDiff;
    const qa = typeof a.qualityTier === 'number' ? a.qualityTier : 2;
    const qb = typeof b.qualityTier === 'number' ? b.qualityTier : 2;
    if (qa !== qb) return qa - qb;
    const aEsBoost = /\b(tdt|movistar|dazn|laliga|champions|estreno)\b/i.test(`${a.categoryName} ${a.name}`) ? 0 : 1;
    const bEsBoost = /\b(tdt|movistar|dazn|laliga|champions|estreno)\b/i.test(`${b.categoryName} ${b.name}`) ? 0 : 1;
    return aEsBoost - bEsBoost;
  });
}
