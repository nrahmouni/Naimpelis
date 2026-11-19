import crypto from 'crypto';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  type TrackRecord,
  buildHlsProxyUrl,
  curlGetBufferWithStatus,
  curlGetText,
  probeHlsSegmentHealth,
  rewriteVidsrcBuzzM3u8,
} from '../httpHelpers.ts';
import { registerVodManifest } from '../../routes/proxies.ts';

export { rewriteVidsrcBuzzM3u8 };

const vidsrcBuzzEmptyCache = new LruTtlCache<string, boolean>(300, 15 * 60 * 1000);

const vidRockKey = Buffer.from(
  '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f',
  'hex'
);

function parseQConfigFromHtml(html: string): any | null {
  const idx = html.search(/var\s+Q\s*=\s*\{/);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0;
  let inStr: string | null = null;
  let escaped = false;
  for (let i = start; i < html.length && i - start < 100_000; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') escaped = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function extractVidsrcBuzzHlsTracks(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const cleanImdb = String(opts.imdbId || '').trim();
  const idList = Array.from(new Set([cleanId, cleanImdb].filter(Boolean)));
  if (idList.length === 0) return [];

  const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const season = Math.max(1, Number(opts.season || 1));
  const episode = Math.max(1, Number(opts.episode || 1));
  const embedBases = ['https://vidsrc.buzz', 'https://videm.buzz'];
  const tracks: TrackRecord[] = [];
  const seenStreams = new Set<string>();

  for (const baseOrigin of embedBases) {
    if (tracks.length >= 2) break;
    for (const mediaId of idList) {
      if (tracks.length >= 2) break;
      const embedUrl =
        mType === 'tv'
          ? `${baseOrigin}/embed/tv/${encodeURIComponent(mediaId)}/${season}/${episode}`
          : `${baseOrigin}/embed/movie/${encodeURIComponent(mediaId)}`;

      try {
        const embedReferer = baseOrigin.includes('videm.buzz')
          ? 'https://vidsrc.buzz/'
          : `${baseOrigin}/`;
        const page = await curlGetText(
          embedUrl,
          { 'User-Agent': CHROME_UA, Referer: embedReferer },
          7,
          true
        );
        const html = page.text || '';
        if (!html || /not\s*found|unavailable/i.test(html.slice(0, 600))) continue;

        const qObj = parseQConfigFromHtml(html);
        if (!qObj || !qObj.t) continue;

        const rawServers = qObj?.ssr?.servers;
        const servers: { name?: string; ref?: string }[] = Array.isArray(rawServers)
          ? rawServers
          : rawServers && typeof rawServers === 'object'
          ? Object.values(rawServers)
          : qObj?.ssr?.ref
          ? [qObj.ssr]
          : [];
        if (servers.length === 0) continue;

        const baseHrefMatch = html.match(/<base[^>]+href\s*=\s*["']([^"']+)["']/i);
        const resolvedBase = baseHrefMatch?.[1]
          ? new URL(baseHrefMatch[1], `${baseOrigin}/`).href
          : /\/pl\/api\.php/i.test(html)
          ? `${baseOrigin}/pl/`
          : `${baseOrigin}/`;

        for (const srv of servers.slice(0, 3)) {
          if (!srv?.ref) continue;
          const apiUrl = new URL(
            `api.php?a=play&ref=${encodeURIComponent(String(srv.ref))}&t=${encodeURIComponent(
              String(qObj.t)
            )}`,
            resolvedBase
          ).href;
          const apiResp = await curlGetText(
            apiUrl,
            {
              'User-Agent': CHROME_UA,
              Referer: embedUrl,
              Accept: 'application/json, text/plain, */*',
            },
            7,
            true
          ).catch(() => ({ text: '' }));
          if (!apiResp.text) continue;

          let playJson: any = null;
          try {
            playJson = JSON.parse(apiResp.text);
          } catch {
            continue;
          }
          const rawManifestPath = String(playJson?.url || '').trim();
          if (!rawManifestPath) continue;

          let manifestUrl = new URL(rawManifestPath, `${baseOrigin}/`).href;
          const mResp = await curlGetText(
            manifestUrl,
            { 'User-Agent': CHROME_UA, Referer: embedUrl },
            7,
            true
          ).catch(() => ({ text: '', effectiveUrl: manifestUrl }));
          let manifestText = mResp.text || '';
          manifestUrl = mResp.effectiveUrl || manifestUrl;
          if (!manifestText.includes('#EXTM3U')) continue;

          if (manifestText.includes('#EXT-X-STREAM-INF')) {
            const variantLines = manifestText.split(/\r?\n/);
            let bestVar = '';
            let bestBw = -1;
            let pendingBw = 0;
            let expectUri = false;
            for (const raw of variantLines) {
              const t = raw.trim();
              if (!t) continue;
              if (t.startsWith('#EXT-X-STREAM-INF')) {
                pendingBw = parseInt(t.match(/BANDWIDTH=(\d+)/i)?.[1] || '0', 10) || 0;
                expectUri = true;
                continue;
              }
              if (t.startsWith('#')) continue;
              if (expectUri) {
                expectUri = false;
                if (!bestVar || pendingBw >= bestBw) {
                  bestBw = pendingBw;
                  bestVar = new URL(t, manifestUrl).href;
                }
              }
            }
            if (bestVar) {
              const varResp = await curlGetText(
                bestVar,
                { 'User-Agent': CHROME_UA, Referer: embedUrl },
                5,
                true
              ).catch(() => ({ text: '', effectiveUrl: bestVar }));
              if (varResp.text && varResp.text.includes('#EXTM3U')) {
                manifestText = varResp.text;
                manifestUrl = varResp.effectiveUrl || bestVar;
              }
            }
          }

          const { rewritten, firstSegment } = rewriteVidsrcBuzzM3u8(
            manifestText,
            manifestUrl,
            `${baseOrigin}/`
          );

          if (firstSegment) {
            if (seenStreams.has(firstSegment.url)) continue;
            const probe = await curlGetBufferWithStatus(
              firstSegment.url,
              {
                'User-Agent': CHROME_UA,
                Referer: firstSegment.referer,
                Range: 'bytes=0-65535',
              },
              4
            ).catch(() => ({ buf: Buffer.alloc(0), status: 0 }));
            const headStr = probe.buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
            if (
              probe.status < 200 ||
              probe.status >= 400 ||
              probe.buf.length < 512 ||
              headStr.startsWith('<!doctype') ||
              headStr.startsWith('<html')
            ) {
              continue;
            }
            seenStreams.add(firstSegment.url);
          }

          const vodManifestPath = registerVodManifest(rewritten);
          const serverLabel = String(srv.name || `Cloud ${tracks.length + 1}`).trim();
          tracks.push({
            id: `vidbuzz-${mType}-${mediaId}-${tracks.length + 1}`,
            label: `English HD · ${serverLabel}`,
            lang: 'EN',
            quality: '1080p HLS',
            sourceUrl: embedUrl,
            referer: `${baseOrigin}/`,
            resolverType: 'bingetrix_en',
            resolvedStreamUrl: vodManifestPath,
          });
          if (tracks.length >= 2) break;
        }
      } catch {
        // try next source
      }
    }
  }

  return tracks;
}

export function decryptVidRockToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(12, raw.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', vidRockKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function probeVidsrcBuzzHasContent(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<boolean> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const cleanImdb = String(opts.imdbId || '').trim();
  const id = cleanId || cleanImdb;
  if (!id) return false;
  const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const s = Math.max(1, Number(opts.season || 1));
  const e = Math.max(1, Number(opts.episode || 1));
  const key = `${mType}:${id}:${s}:${e}`;
  if (vidsrcBuzzEmptyCache.has(key)) {
    return vidsrcBuzzEmptyCache.get(key) === true;
  }
  try {
    const testUrl =
      mType === 'tv'
        ? `https://vidsrc.buzz/embed/tv/${encodeURIComponent(id)}/${s}/${e}`
        : `https://vidsrc.buzz/embed/movie/${encodeURIComponent(id)}`;
    const page = await curlGetText(testUrl, { 'User-Agent': CHROME_UA, Referer: 'https://vidsrc.buzz/' }, 4, true);
    const html = page.text || '';
    if (!html || /No content available/i.test(html) || /"ssr"\s*:\s*null/i.test(html)) {
      vidsrcBuzzEmptyCache.set(key, false);
      return false;
    }
    vidsrcBuzzEmptyCache.set(key, true);
    return true;
  } catch {
    return false;
  }
}

export async function extractVidRockHlsTracks(opts: {
  tmdbId?: string | number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return [];

  const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const s = Math.max(1, Number(opts.season || 1));
  const e = Math.max(1, Number(opts.episode || 1));

  const apiUrl =
    mType === 'tv'
      ? `https://vidrock.net/api/tv/${cleanId}/${s}/${e}`
      : `https://vidrock.net/api/movie/${cleanId}`;

  try {
    const resp = await streamingFetch(apiUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://vidrock.net/',
        Accept: 'application/json, text/plain, */*',
      },
      timeoutMs: 4500,
    }).catch(() => null);

    let rawJson: any = null;
    if (resp && resp.ok) {
      rawJson = await resp.json().catch(() => null);
    }
    if (!rawJson) {
      const fb = await curlGetText(apiUrl, { 'User-Agent': CHROME_UA, Referer: 'https://vidrock.net/' }, 5, true).catch(
        () => ({ text: '' })
      );
      if (fb.text) {
        try {
          rawJson = JSON.parse(fb.text);
        } catch {
          rawJson = null;
        }
      }
    }

    const rawEntries: { name: string; url: string; rawLang?: string }[] = [];
    if (Array.isArray(rawJson)) {
      for (const entry of rawJson) {
        const name = String(entry?.name || 'Server').trim();
        const rawToken = String(entry?.url || '').trim();
        if (rawToken) rawEntries.push({ name, url: rawToken, rawLang: entry?.language });
      }
    } else if (rawJson && typeof rawJson === 'object') {
      for (const [srvName, val] of Object.entries(rawJson)) {
        if (val && typeof val === 'object') {
          const rawToken = String((val as any)?.url || '').trim();
          if (rawToken) {
            rawEntries.push({
              name: srvName,
              url: rawToken,
              rawLang: (val as any)?.language,
            });
          }
        }
      }
    }

    if (rawEntries.length === 0) return [];

    const candidates = rawEntries
      .map((entry) => {
        const decrypted = entry.url.startsWith('http')
          ? entry.url
          : decryptVidRockToken(entry.url);
        if (!decrypted || !decrypted.startsWith('http')) return null;
        let lang: 'ES' | 'LAT' | 'VOSE' | 'EN' = 'EN';
        const rl = String(entry.rawLang || '').toLowerCase();
        if (rl.includes('spanish') || rl.includes('español')) {
          lang = rl.includes('latino') ? 'LAT' : 'ES';
        } else if (rl.includes('japanese') || rl.includes('japón') || rl.includes('anime')) {
          lang = 'VOSE';
        }
        return { name: entry.name, url: decrypted, lang };
      })
      .filter((c): c is { name: string; url: string; lang: 'ES' | 'LAT' | 'VOSE' | 'EN' } => Boolean(c));

    if (candidates.length === 0) return [];

    const verified = await Promise.all(
      candidates.slice(0, 5).map(async (item, idx): Promise<TrackRecord | null> => {
        const isHealthy = await probeHlsSegmentHealth(item.url, 'https://vidrock.net/');
        if (!isHealthy) return null;

        const proxyUrl = buildHlsProxyUrl(item.url, 'https://vidrock.net/');
        const trackId = `vidrock-${mType}-${cleanId}-${s}-${e}-${idx + 1}`;
        const langLabel =
          item.lang === 'VOSE'
            ? 'VOSE Sub'
            : item.lang === 'ES'
            ? 'Castellano'
            : item.lang === 'LAT'
            ? 'Latino'
            : 'English';
        return {
          id: trackId,
          label: `${langLabel} 1080p · ${item.name}`,
          lang: item.lang,
          quality: '1080p HLS',
          sourceUrl: item.url,
          referer: 'https://vidrock.net/',
          resolverType: 'direct_hls',
          resolvedStreamUrl: proxyUrl,
        };
      })
    );

    return verified.filter((t): t is TrackRecord => Boolean(t));
  } catch (err) {
    console.warn('extractVidRockHlsTracks error:', err);
    return [];
  }
}
