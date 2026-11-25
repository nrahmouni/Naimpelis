/**
 * @module server/services/belix/belixProxyHelpers
 * @description Opaque token HLS playlist rewriter, RAM manifest/segment prefetch cache & fetcher for Belix TV.
 * Upstream Xtream credentials never leave the server process or appear in client playlists.
 */
import crypto from 'crypto';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { curlGetBufferWithStatus, curlGetText } from '../../extractors/httpHelpers.ts';
import {
  ensureLiveDvbCleanHlsSession,
  getActiveDvbSessionPath,
  readLiveDvbPlaylistForIptv,
} from '../../routes/proxies/dvbTranscoder.ts';

export interface BelixSessionCredentials {
  origin: string;
  username: string;
  password: string;
}

interface OpaqueProxyEntry {
  rawUrl: string;
  referer: string;
  ts: number;
}

const opaqueSubPlaylistCache = new LruTtlCache<string, OpaqueProxyEntry>(2500, 15 * 60 * 1000);
const opaqueSegmentCache = new LruTtlCache<string, OpaqueProxyEntry>(8000, 8 * 60 * 1000);
const belixManifestRamCache = new LruTtlCache<string, string>(300, 12_000);
const belixSubPlaylistBodyCache = new LruTtlCache<string, string>(500, 10_000);
const belixSegmentBodyCache = new LruTtlCache<
  string,
  { status: number; contentType: string; buffer: Buffer }
>(150, 14_000);

function createOpaqueToken(rawUrl: string): string {
  return crypto.createHash('sha1').update(rawUrl).digest('hex').slice(0, 20);
}

export function clearBelixOpaqueCaches(): void {
  opaqueSubPlaylistCache.clear();
  opaqueSegmentCache.clear();
  belixManifestRamCache.clear();
  belixSubPlaylistBodyCache.clear();
  belixSegmentBodyCache.clear();
}

export function rewritePlaylistWithOpaqueTokens(
  manifestText: string,
  baseUrl: string,
  referer: string,
  originPrefix = ''
): string {
  const lines = manifestText.split(/\r?\n/);
  let nextIsPlaylist = false;
  const now = Date.now();
  const out: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#EXT-X-STREAM-INF')) nextIsPlaylist = true;
      const absSuffix = originPrefix ? '?abs=1' : '';
      if (trimmed.includes('URI="')) {
        const replaced = rawLine.replace(/URI="([^"]+)"/g, (_m, uriVal) => {
          try {
            const absUri = new URL(uriVal, baseUrl).href;
            const token = createOpaqueToken(absUri);
            if (trimmed.startsWith('#EXT-X-MEDIA') || /\.m3u8(\?|$)/i.test(absUri)) {
              opaqueSubPlaylistCache.set(token, { rawUrl: absUri, referer, ts: now });
              return `URI="${originPrefix}/api/belix/sub/${token}.m3u8${absSuffix}"`;
            }
            opaqueSegmentCache.set(token, { rawUrl: absUri, referer, ts: now });
            return `URI="${originPrefix}/api/belix/seg/${token}.bin"`;
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
      const token = createOpaqueToken(absUrl);
      const absSuffix = originPrefix ? '?abs=1' : '';
      if (isPlaylist) {
        opaqueSubPlaylistCache.set(token, { rawUrl: absUrl, referer, ts: now });
        out.push(`${originPrefix}/api/belix/sub/${token}.m3u8${absSuffix}`);
      } else {
        const extMatch = absUrl.match(/\.(m4s|mp4|aac|ts)(\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'ts';
        opaqueSegmentCache.set(token, { rawUrl: absUrl, referer, ts: now });
        out.push(`${originPrefix}/api/belix/seg/${token}.${ext}`);
      }
    } catch {
      nextIsPlaylist = false;
      out.push(rawLine);
    }
  }

  return out.join('\n') + '\n';
}

function prefetchBelixFirstMedia(rewrittenManifest: string, originPrefix = ''): void {
  const first = String(rewrittenManifest || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (!first) return;
  const subToken = first.match(/\/api\/belix\/sub\/([^.?/]+)\.m3u8/i)?.[1];
  if (subToken) {
    void resolveBelixSubPlaylist(subToken, originPrefix, { prefetchFirstSegment: true }).catch(
      () => undefined
    );
    return;
  }
  const segToken = first.match(/\/api\/belix\/seg\/([^.?/]+)/i)?.[1];
  if (segToken) {
    void fetchBelixOpaqueSegment(segToken).catch(() => undefined);
  }
}

export async function fetchBelixPlaylistText(
  targetUrl: string,
  referer: string,
  timeoutMs = 3600,
  skipCurlRetry = false
): Promise<{ text: string; baseUrl: string } | null> {
  await assertSafeProxyUrl(targetUrl);
  const baseHeaders: Record<string, string> = {
    Accept: '*/*',
    Referer: referer,
  };
  let timedOut = false;
  try {
    const res = await streamingFetch(targetUrl, {
      headers: { ...baseHeaders, 'User-Agent': 'IPTVSmartersPlayer' },
      timeoutMs,
    });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(text)) {
        const finalUrl = res.url || targetUrl;
        await assertSafeProxyUrl(finalUrl);
        return { text, baseUrl: finalUrl };
      }
    } else if (res.body) {
      void res.body.cancel().catch(() => undefined);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    timedOut = /timeout|aborted/i.test(msg);
  }

  if (timedOut || skipCurlRetry) {
    return null;
  }

  const fb = await curlGetText(
    targetUrl,
    { ...baseHeaders, 'User-Agent': 'IPTVSmartersPlayer' },
    4,
    false,
    true
  ).catch(() => ({
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

export async function resolveBelixManifestForSession(
  session: BelixSessionCredentials | null,
  streamId: string,
  originPrefix = '',
  opts?: { allowTranscodeFallback?: boolean; probeTimeoutMs?: number }
): Promise<string | null> {
  if (!session) return null;
  const cleanId = String(streamId || '').replace(/\.m3u8$/i, '').trim();
  if (!/^[a-zA-Z0-9_-]{1,24}$/.test(cleanId)) return null;

  const cacheKey = `${session.origin}:${cleanId}:${originPrefix || 'rel'}`;
  const cachedManifest = belixManifestRamCache.get(cacheKey);
  if (cachedManifest) {
    return cachedManifest;
  }

  const u = encodeURIComponent(session.username);
  const p = encodeURIComponent(session.password);
  const idEnc = encodeURIComponent(cleanId);
  const referer = `${session.origin}/`;

  const tsUrl = `${session.origin}/live/${u}/${p}/${idEnc}.ts`;
  await assertSafeProxyUrl(tsUrl);
  const warmPath = getActiveDvbSessionPath(tsUrl, 'hd');
  if (warmPath) {
    const warmManifest = readLiveDvbPlaylistForIptv(warmPath, originPrefix);
    if (warmManifest) {
      belixManifestRamCache.set(cacheKey, warmManifest);
      return warmManifest;
    }
  }

  const targetUrl = `${session.origin}/live/${u}/${p}/${idEnc}.m3u8`;
  const probeMs = opts?.probeTimeoutMs ?? (opts?.allowTranscodeFallback === false ? 4200 : 2800);
  const loaded = await fetchBelixPlaylistText(targetUrl, referer, probeMs, true).catch(() => null);
  if (loaded && (loaded.text.includes('#EXTINF') || loaded.text.includes('#EXT-X-STREAM-INF'))) {
    const rewritten = rewritePlaylistWithOpaqueTokens(loaded.text, loaded.baseUrl, referer, originPrefix);
    belixManifestRamCache.set(cacheKey, rewritten);
    prefetchBelixFirstMedia(rewritten, originPrefix);
    return rewritten;
  }

  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTestEnv && opts?.allowTranscodeFallback !== false) {
    const dvbPath = await ensureLiveDvbCleanHlsSession(tsUrl, 'hd', referer).catch(() => null);
    if (dvbPath) {
      const tsManifest = readLiveDvbPlaylistForIptv(dvbPath, originPrefix);
      if (tsManifest) {
        belixManifestRamCache.set(cacheKey, tsManifest);
        return tsManifest;
      }
    }
  }
  return null;
}

export async function resolveBelixSubPlaylist(
  tokenWithExt: string,
  originPrefix = '',
  opts?: { prefetchFirstSegment?: boolean }
): Promise<string | null> {
  const token = String(tokenWithExt || '').replace(/\.m3u8$/i, '').trim();
  const cacheKey = `${token}:${originPrefix || 'rel'}`;
  const cachedSub = belixSubPlaylistBodyCache.get(cacheKey);
  if (cachedSub) return cachedSub;

  const entry = opaqueSubPlaylistCache.get(token);
  if (!entry) return null;
  const loaded = await fetchBelixPlaylistText(entry.rawUrl, entry.referer, 3600, true).catch(() => null);
  if (!loaded) return null;
  const rewritten = rewritePlaylistWithOpaqueTokens(loaded.text, loaded.baseUrl, entry.referer, originPrefix);
  belixSubPlaylistBodyCache.set(cacheKey, rewritten);
  if (opts?.prefetchFirstSegment) {
    const firstSeg = rewritten
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && l.includes('/api/belix/seg/'));
    const segToken = firstSeg?.match(/\/api\/belix\/seg\/([^.?/]+)/i)?.[1];
    if (segToken) {
      void fetchBelixOpaqueSegment(segToken).catch(() => undefined);
    }
  }
  return rewritten;
}

export async function fetchBelixOpaqueSegment(
  tokenWithExt: string,
  rangeHeader?: string
): Promise<{ status: number; contentType: string; buffer: Buffer } | null> {
  const token = String(tokenWithExt || '').replace(/\.[a-z0-9]+$/i, '').trim();
  if (!rangeHeader) {
    const cached = belixSegmentBodyCache.get(token);
    if (cached) return cached;
  }

  const entry = opaqueSegmentCache.get(token);
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
        const out = {
          status: res.status,
          contentType: res.headers.get('content-type') || 'video/mp2t',
          buffer: buf,
        };
        if (!rangeHeader && res.status === 200 && buf.length <= 6 * 1024 * 1024) {
          belixSegmentBodyCache.set(token, out);
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
      belixSegmentBodyCache.set(token, out);
    }
    return out;
  }
  return null;
}
