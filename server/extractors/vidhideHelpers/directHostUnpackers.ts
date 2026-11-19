import crypto from 'crypto';
import { ENV } from '../../config/env.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetBufferWithStatus,
  curlGetText,
  curlPostJsonText,
  fetchTextWithCurlFallback,
  probeHlsSegmentHealth,
  unpackDeanEdwards,
} from '../httpHelpers.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export async function unpackByseToHls(
  embedUrl: string
): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    const cleanEmbedUrl = embedUrl.split('#')[0].trim();
    const u = new URL(cleanEmbedUrl);
    const m = u.pathname.match(/\/e\/([a-zA-Z0-9_-]+)/);
    const code = m ? m[1] : '';
    if (!code) return null;

    const apiUrl = `${u.origin}/api/videos/${code}`;
    const apiRes = await curlGetText(
      apiUrl,
      {
        'User-Agent': CHROME_UA,
        Referer: cleanEmbedUrl,
        Accept: 'application/json',
      },
      6,
      true
    ).catch(() => ({ text: '' }));

    if (!apiRes.text) return null;
    let json: any = null;
    try {
      json = JSON.parse(apiRes.text);
    } catch {
      return null;
    }

    const pb = json?.playback;
    if (!pb || !Array.isArray(pb.key_parts) || !pb.iv || !pb.payload) {
      return null;
    }

    const v = parseInt(String(pb.version || '1').trim(), 10);
    const idx1 = v - 1;
    const idx2 = 31 - v - 1;
    if (idx1 < 0 || idx1 >= pb.key_parts.length || idx2 < 0 || idx2 >= pb.key_parts.length) {
      return null;
    }

    const p1 = Buffer.from(pb.key_parts[idx1], 'base64url');
    const p2 = Buffer.from(pb.key_parts[idx2], 'base64url');
    const key = Buffer.concat([p1, p2]);
    if (key.length !== 32) return null;

    const iv = Buffer.from(pb.iv, 'base64url');
    const payloadBuf = Buffer.from(pb.payload, 'base64url');
    if (payloadBuf.length <= 16) return null;

    const ciphertext = payloadBuf.subarray(0, payloadBuf.length - 16);
    const tag = payloadBuf.subarray(payloadBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const data = JSON.parse(decrypted.toString('utf8'));

    const sources: any[] = Array.isArray(data?.sources) ? data.sources : [];
    const bestSource =
      sources.find((s) => s.label === '1080p' && s.url) ||
      sources.find((s) => s.mime_type?.includes('mpegurl') && s.url) ||
      sources.find((s) => s.url) ||
      null;

    const rawM3u8 = bestSource?.url || data?.playlist || data?.file || '';
    if (!rawM3u8 || !/^https?:\/\//i.test(rawM3u8)) return null;

    const healthy = await probeHlsSegmentHealth(rawM3u8, u.origin);
    if (!healthy) return null;

    return {
      rawM3u8,
      proxyUrl: buildHlsProxyUrl(rawM3u8, `${u.origin}/`),
    };
  } catch (err) {
    console.warn('unpackByseToHls error:', err);
    return null;
  }
}

export async function unpackVidhideToHls(
  embedUrl: string
): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    // 0. Byse (bysevepoin / filemoon fast native HLS AES-256-GCM unpacker)
    if (/byse|bysevepoin/i.test(embedUrl)) {
      const byseResult = await unpackByseToHls(embedUrl);
      if (byseResult) return byseResult;
    }

    // 1. Fast Vidaraa / Vidara JSON Stream Unpacker
    if (/vidaraa?\.[a-z]+/i.test(embedUrl)) {
      const cleanEmbedUrl = embedUrl.split('#')[0];
      const u = new URL(cleanEmbedUrl);
      const segments = u.pathname.split('/').filter(Boolean);
      const filecode = segments[segments.length - 1] || '';
      if (filecode) {
        const apiHeaders: Record<string, string> = {
          'User-Agent': CHROME_UA,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: u.origin,
          Referer: cleanEmbedUrl,
        };
        let apiJson: any = null;
        try {
          const apiRes = await streamingFetch(`${u.origin}/api/stream`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({ filecode, device: 'web', codecs: [] }),
            timeoutMs: 4200,
          });
          if (apiRes.ok) {
            apiJson = await apiRes.json();
          }
        } catch {
          // fallback to curl POST in containerized Cloud Run environments
        }
        if (!apiJson) {
          const rawPost = await curlPostJsonText(
            `${u.origin}/api/stream`,
            { filecode, device: 'web', codecs: [] },
            apiHeaders,
            5
          );
          if (rawPost) {
            try {
              apiJson = JSON.parse(rawPost);
            } catch {
              apiJson = null;
            }
          }
        }
        const rawM3u8 = String(apiJson?.streaming_url || apiJson?.file || '').trim();
        if (rawM3u8 && /^https?:\/\//i.test(rawM3u8)) {
          const healthy = await probeHlsSegmentHealth(rawM3u8, u.origin);
          if (healthy) {
            return {
              rawM3u8,
              proxyUrl: buildHlsProxyUrl(rawM3u8, `${u.origin}/`),
            };
          }
        }
      }
      return null;
    }

    // 2. Standard Vidhide / Smoothpre / Earnvids / Streamwish / Fastream / 2vcdn Dean Edwards Unpacker
    const refererOrigin = embedUrl.includes('gnulahd')
      ? 'https://ww3.gnulahd.nu/'
      : embedUrl.includes('fastream')
      ? 'https://www3.seriesmetro.net/'
      : embedUrl.includes('2vcdn')
      ? 'https://streamsrcs.2embed.cc/'
      : 'https://embed69.org/';
    let html = '';
    if (embedUrl.includes('2vcdn')) {
      const curlRes = await curlGetText(
        embedUrl,
        { 'User-Agent': CHROME_UA, Referer: refererOrigin },
        4,
        true
      ).catch(() => ({ text: '' }));
      html = curlRes.text || '';
    } else {
      html = await fetchTextWithCurlFallback(
        embedUrl,
        {
          'User-Agent': CHROME_UA,
          Referer: refererOrigin,
        },
        4500
      );
    }
    if (!html || /Countries are not allowed|not available in your country/i.test(html)) {
      return null;
    }

    const unpacked = unpackDeanEdwards(html);
    const origin = new URL(embedUrl).origin;
    const rawCandidates: string[] = [];

    if (unpacked) {
      const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^}]+\})/);
      if (linksMatch) {
        try {
          const links = JSON.parse(linksMatch[1]);
          for (const c of [links.hls4, links.hls2, links.hls3]) {
            const s = String(c || '').trim();
            if (s) rawCandidates.push(s);
          }
        } catch {
          // fall through to generic m3u8 extraction
        }
      }

      if (rawCandidates.length === 0) {
        const jwSources = [
          ...unpacked.matchAll(/(?:file|src)\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi),
          ...unpacked.matchAll(/["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi),
        ];
        for (const m of jwSources) {
          const s = String(m[1] || '').trim();
          if (s && !rawCandidates.includes(s)) rawCandidates.push(s);
        }
      }
    }

    if (rawCandidates.length === 0) {
      const plainM3u8 = html.match(
        /(?:file|src)\s*:\s*["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/i
      )?.[1];
      if (plainM3u8) rawCandidates.push(plainM3u8.trim());
    }

    if (rawCandidates.length === 0) return null;

    for (const rawCandidate of rawCandidates) {
      const rawM3u8 = rawCandidate.startsWith('/') ? `${origin}${rawCandidate}` : rawCandidate;
      const healthy = await probeHlsSegmentHealth(rawM3u8, origin);
      if (healthy) {
        return {
          rawM3u8,
          proxyUrl: buildHlsProxyUrl(rawM3u8, `${origin}/`),
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('unpackVidhideToHls error:', err);
    return null;
  }
}

export async function unpackMp4UploadToDirect(
  embedUrl: string
): Promise<{ rawMp4: string; proxyUrl: string } | null> {
  try {
    const cleanUrl = String(embedUrl || '').trim();
    if (!cleanUrl || !cleanUrl.includes('mp4upload.com/')) return null;

    let html = '';
    try {
      const res = await streamingFetch(cleanUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Referer: 'https://animeav1.com/',
        },
        timeoutMs: 4500,
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch {
      // fallback to curl
    }

    if (!html) {
      const fb = await curlGetText(
        cleanUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://animeav1.com/' },
        5,
        true
      ).catch(() => ({ text: '' }));
      html = fb.text || '';
    }
    if (!html) return null;

    const srcMatch = html.match(/src:\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
    if (!srcMatch?.[1]) return null;
    const rawMp4 = srcMatch[1];

    // Probe initial bytes with MP4Upload Referer to confirm 200/206 video bytes
    const probe = await curlGetBufferWithStatus(
      rawMp4,
      {
        'User-Agent': CHROME_UA,
        Referer: 'https://www.mp4upload.com/',
        Range: 'bytes=0-4095',
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
      return null;
    }

    return {
      rawMp4,
      proxyUrl: buildTsProxyUrl(rawMp4, 'https://www.mp4upload.com/'),
    };
  } catch (err) {
    console.warn('unpackMp4UploadToDirect error:', err);
    return null;
  }
}

export async function resolveImdbId(
  tmdbId: string | number,
  mediaType: 'movie' | 'tv'
): Promise<string | null> {
  try {
    const cleanId = String(tmdbId).replace(/\D/g, '');
    if (!cleanId) return null;
    const url =
      mediaType === 'tv'
        ? `https://api.themoviedb.org/3/tv/${cleanId}/external_ids?api_key=${TMDB_API_KEY}`
        : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.imdb_id || null;
  } catch {
    return null;
  }
}
