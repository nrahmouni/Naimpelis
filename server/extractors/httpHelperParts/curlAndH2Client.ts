import { execFile } from 'child_process';
import http2 from 'http2';
import zlib from 'zlib';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';

export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const TDT_DVB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

export const CN_IPTV_UA = 'okhttp/4.12.0';

export interface TrackRecord {
  id: string;
  label: string;
  lang: string;
  quality?: string;
  sourceUrl: string;
  referer?: string;
  resolverType:
    | 'movidy_embed'
    | 'vidhide_hls'
    | 'vest_hls'
    | 'embed_sniff'
    | 'bingetrix_en'
    | 'sports_channel'
    | 'tdt_hls'
    | 'elahmad_live'
    | 'direct_hls'
    | 'direct_mp4'
    | 'youtube'
    | 'web_embed'
    | 'cloud_browser';
  resolvedStreamUrl?: string;
  health?: {
    status: 'up' | 'degraded' | 'down' | 'unknown';
    latencyMs?: number;
    failCount?: number;
    checkedAt?: number;
    statusCode?: number;
  };
}

export interface SubtitleTrackOutput {
  id: string;
  label: string;
  lang: string;
  url: string;
}

export interface ExtractedStreamResult {
  success: boolean;
  mode: 'hls' | 'direct' | 'youtube' | 'embed' | 'cloud';
  streamUrl: string;
  rawStreamUrl?: string;
  referer?: string;
  youtubeId?: string;
  title?: string;
  poster?: string;
  backdrop?: string;
  tracks?: TrackRecord[];
  subtitles?: SubtitleTrackOutput[];
  requestedLang?: string;
  resolvedLang?: string;
  resolvedLabel?: string;
  languageFallbackUsed?: boolean;
  availableLanguages?: string[];
  requestId?: string;
  expiresAt: number;
}

export function isDvbHeadendStream(urlStr: string): boolean {
  return urlStr.includes('90.163.85.113:8093');
}

export function isChineseIptvStream(urlStr: string): boolean {
  const lower = String(urlStr || '').toLowerCase();
  return (
    lower.includes('38.75.136.137') ||
    lower.includes('63.141.230.178') ||
    lower.includes('120.76.248.139') ||
    lower.includes('153.0.171.163') ||
    lower.includes('223.112.114.228') ||
    lower.includes('192.187.98.98') ||
    lower.includes('198.204.') ||
    lower.includes('204.12.') ||
    lower.includes('gmxw.7766.org') ||
    lower.includes('jdshipin.com') ||
    lower.includes('epg.pw/stream/') ||
    lower.includes('miguvideo.com') ||
    lower.includes('/gslb/dsdq') ||
    lower.includes('/gslb/zbdq') ||
    lower.includes('/live/bfgd/')
  );
}

export function getPreferredUpstreamUa(urlStr: string): string {
  if (isDvbHeadendStream(urlStr)) return TDT_DVB_UA;
  if (isChineseIptvStream(urlStr)) return CN_IPTV_UA;
  return CHROME_UA;
}

const easyBroadcastTokenCache = new LruTtlCache<string, string>(60, 25_000);

export async function maybeSignEasyBroadcastUrl(rawUrl: string): Promise<string> {
  const clean = String(rawUrl || '').trim();
  if (!/^https:\/\/cdn\.live\.easybroadcast\.io\/abr_corp\/73_/i.test(clean)) {
    return clean;
  }
  if (/[?&]token=/i.test(clean)) return clean;

  const baseUrl = clean.split('?')[0];
  const cachedQs = easyBroadcastTokenCache.get(baseUrl);
  if (cachedQs) {
    return `${baseUrl}?${cachedQs}`;
  }

  try {
    const tokenRes = await streamingFetch(
      `https://token.easybroadcast.io/all?url=${encodeURIComponent(baseUrl)}`,
      {
        headers: {
          'User-Agent': CHROME_UA,
          Origin: 'https://snrt.player.easybroadcast.io',
          Referer: 'https://snrt.player.easybroadcast.io/',
        },
        timeoutMs: 4500,
      }
    );
    if (tokenRes.ok) {
      const qs = (await tokenRes.text()).trim().replace(/^\?/, '');
      if (qs && qs.includes('token=')) {
        easyBroadcastTokenCache.set(baseUrl, qs);
        return `${baseUrl}?${qs}`;
      }
    }
  } catch {
    // fallback to unsigned URL if token service fails momentarily
  }
  return clean;
}

export function resolveKnownUpstreamReferer(urlStr: string, explicitReferer?: string): string {
  const cleanExplicit = String(explicitReferer || '').trim();
  if (/^https?:\/\//i.test(cleanExplicit)) return cleanExplicit;
  try {
    const u = new URL(urlStr);
    if (/(\.|^)stmify\.com$/i.test(u.hostname)) return 'https://stmify.com/';
    if (/(\.|^)footunder\.online$/i.test(u.hostname)) return 'https://footunder.online/';
    if (/(\.|^)easybroadcast\.io$/i.test(u.hostname)) return 'https://snrt.player.easybroadcast.io/';
    if (/(\.|^)akamaized\.net$/i.test(u.hostname) && /\/2m_monde\//i.test(u.pathname)) {
      return 'http://www.radio2m.ma/';
    }
    if (/(\.|^)usnlive\.com$/i.test(u.hostname)) return 'https://usnewson.com/';
    if (/(\.|^)(rousav\.tech|vidbolt\.(?:st|xyz)|johndoesdmc\.workers\.dev)$/i.test(u.hostname)) {
      return 'https://vidbolt.st/';
    }
    if (/(\.|^)(dailymotion\.com|dmcdn\.net|dai\.ly)$/i.test(u.hostname)) {
      return 'https://www.dailymotion.com/';
    }
    if (/(\.|^)(elahmad\.(?:ru|store)|glwiz\.com|mangomolo\.com)$/i.test(u.hostname)) {
      return 'https://www.elahmad.ru/';
    }
  } catch {
    // ignore
  }
  return '';
}

export function buildHlsProxyUrl(
  rawM3u8Url: string,
  referer: string,
  transcodeAudio = false,
  originPrefix = ''
): string {
  const needsAac = transcodeAudio || isDvbHeadendStream(rawM3u8Url);
  return `${originPrefix}/api/hls-proxy/stream.m3u8?url=${encodeURIComponent(rawM3u8Url)}&referer=${encodeURIComponent(referer)}${needsAac ? '&aac=1' : ''}${originPrefix ? '&abs=1' : ''}`;
}

export function buildTsProxyUrl(
  rawMediaUrl: string,
  referer: string,
  transcodeAudio = false,
  originPrefix = ''
): string {
  const isMp4Segment =
    /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(rawMediaUrl) ||
    /\/segs\/[^/]+\/init\./i.test(rawMediaUrl);
  const ext = isMp4Segment ? 'segment.m4s' : 'segment.ts';
  const needsAac = !isMp4Segment && (transcodeAudio || isDvbHeadendStream(rawMediaUrl));
  return `${originPrefix}/api/ts-proxy/${ext}?url=${encodeURIComponent(rawMediaUrl)}&referer=${encodeURIComponent(referer)}${needsAac ? '&aac=1' : ''}`;
}

const tlsFallbackHostsCache = new LruTtlCache<string, true>(500, 6 * 60 * 60 * 1000);

export function shouldBypassNodeFetch(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (tlsFallbackHostsCache.has(host)) return true;
    if (
      host.endsWith('.ibra.lat') ||
      host === 'ibra.lat' ||
      /(?:^|\.)(movidy\.(?:work|pw|tv|ws)|nupload\.[a-z]+|gnulahd\.(?:nu|click|bid|com)|serieskao\.top|embed69\.org|byse[a-z]*\.[a-z]+|vidaraa?\.[a-z]+|vidhide[a-z]*\.[a-z]+|smoothpre\.[a-z]+|earnvids\.[a-z]+|streamwish\.[a-z]+|hglink\.[a-z]+|filelions\.[a-z]+)$/i.test(
        host
      )
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function markHostNeedsCurlFallback(urlStr: string): void {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return;
    const host = u.hostname.toLowerCase();
    if (host) tlsFallbackHostsCache.set(host, true);
  } catch {
    // ignore
  }
}

export function h2GetRaw(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6,
  redirectsLeft = 4
): Promise<{ buf: Buffer; effectiveUrl: string; status: number }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }

    if (u.protocol !== 'https:') {
      streamingFetch(targetUrl, {
        headers,
        timeoutMs: maxTimeSec * 1000,
      })
        .then(async (r) => ({
          buf: Buffer.from(await r.arrayBuffer()),
          effectiveUrl: r.url || targetUrl,
          status: r.status,
        }))
        .then(resolve)
        .catch(reject);
      return;
    }

    const client = http2.connect(u.origin, { rejectUnauthorized: false });
    let settled = false;
    let overallTimer: ReturnType<typeof setTimeout> | null = null;
    const clearOverallTimer = () => {
      if (overallTimer) {
        clearTimeout(overallTimer);
        overallTimer = null;
      }
    };
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      clearOverallTimer();
      try {
        client.destroy();
      } catch {
        // ignore
      }
      reject(err);
    };

    overallTimer = setTimeout(() => {
      finishErr(new Error(`HTTP/2 connect/request timeout after ${maxTimeSec}s`));
    }, maxTimeSec * 1000);
    overallTimer.unref?.();

    client.on('error', finishErr);

    const reqHeaders: Record<string, string> = {
      ':method': 'GET',
      ':path': u.pathname + u.search,
      ':scheme': 'https',
      ':authority': u.host,
      'user-agent': CHROME_UA,
      'accept-encoding': 'gzip, deflate, br',
    };
    for (const [k, v] of Object.entries(headers)) {
      if (v) reqHeaders[k.toLowerCase()] = v;
    }

    const req = client.request(reqHeaders);
    let status = 0;
    let locationHeader = '';
    let contentEncoding = '';
    const chunks: Buffer[] = [];

    req.on('response', (resHeaders) => {
      status = Number(resHeaders[':status'] || 0);
      locationHeader = String(resHeaders['location'] || '');
      contentEncoding = String(resHeaders['content-encoding'] || '').toLowerCase();
    });

    req.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const finalize = () => {
      if (settled) return;
      settled = true;
      clearOverallTimer();
      try {
        client.close();
      } catch {
        // ignore
      }

      if ([301, 302, 303, 307, 308].includes(status) && locationHeader && redirectsLeft > 0) {
        const nextUrl = new URL(locationHeader, targetUrl).href;
        h2GetRaw(nextUrl, headers, maxTimeSec, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      let rawBuf = Buffer.concat(chunks);
      try {
        if (contentEncoding.includes('br')) {
          rawBuf = zlib.brotliDecompressSync(rawBuf);
        } else if (contentEncoding.includes('gzip')) {
          rawBuf = zlib.gunzipSync(rawBuf);
        } else if (contentEncoding.includes('deflate')) {
          rawBuf = zlib.inflateSync(rawBuf);
        }
      } catch {
        // keep raw buffer if already decompressed
      }

      resolve({ buf: rawBuf, effectiveUrl: targetUrl, status });
    };

    req.on('end', finalize);
    req.on('error', (err) => {
      if (chunks.length > 0) finalize();
      else finishErr(err);
    });
    req.setTimeout(maxTimeSec * 1000, () => {
      try {
        req.close();
      } catch {
        // ignore
      }
      if (chunks.length > 0) finalize();
      else finishErr(new Error('HTTP/2 request timeout'));
    });
    req.end();
  });
}

export async function curlGetText(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6,
  preferCurlCli = false,
  forceIpv4 = true
): Promise<{ text: string; effectiveUrl: string }> {
  if (!preferCurlCli) {
    try {
      const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
      if (h2.buf.length > 0 && h2.status < 400) {
        return { text: h2.buf.toString('utf8'), effectiveUrl: h2.effectiveUrl };
      }
    } catch {
      // fallback to curl if available
    }
  }

  return new Promise((resolve, reject) => {
    const args = [
      ...(forceIpv4 ? ['-4'] : []),
      '-sS',
      '-L',
      '-k',
      '--compressed',
      '--connect-timeout',
      String(Math.min(3, Math.max(2, maxTimeSec))),
      '--max-time',
      String(maxTimeSec),
      '-w',
      '\n__FINAL_URL__:%{url_effective}',
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v) args.push('-H', `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile('curl', args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return reject(new Error(stderr || err.message));
      }
      const raw = String(stdout || '');
      const markerIdx = raw.lastIndexOf('\n__FINAL_URL__:');
      if (markerIdx !== -1) {
        return resolve({
          text: raw.slice(0, markerIdx),
          effectiveUrl: raw.slice(markerIdx + 15).trim() || targetUrl,
        });
      }
      resolve({ text: raw, effectiveUrl: targetUrl });
    });
  });
}

export async function curlGetBufferWithStatus(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 7
): Promise<{ buf: Buffer; status: number }> {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status >= 200 && h2.status < 400) {
      return { buf: h2.buf, status: h2.status };
    }
  } catch {
    // fallback to curl if available
  }

  const runCurl = (hdrs: Record<string, string>): Promise<{ buf: Buffer; status: number }> =>
    new Promise((resolve, reject) => {
      const marker = Buffer.from('\n__HTTP_STATUS__:');
      const args = [
        '-4',
        '-sS',
        '-L',
        '-k',
        '--connect-timeout',
        String(Math.min(3, Math.max(2, maxTimeSec))),
        '--max-time',
        String(maxTimeSec),
        '-w',
        '\n__HTTP_STATUS__:%{http_code}',
      ];
      for (const [k, v] of Object.entries(hdrs)) {
        if (v) args.push('-H', `${k}: ${v}`);
      }
      args.push(targetUrl);
      execFile(
        'curl',
        args,
        { encoding: 'buffer', maxBuffer: 25 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const outBuf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
          const idx = outBuf.lastIndexOf(marker);
          if (idx !== -1) {
            const codeStr = outBuf
              .subarray(idx + marker.length)
              .toString('utf8')
              .trim();
            const status = parseInt(codeStr, 10) || 0;
            const body = outBuf.subarray(0, idx);
            if (status >= 200 && status < 400 && body.length > 0) {
              return resolve({ buf: body, status });
            }
            return resolve({ buf: Buffer.alloc(0), status: status || 502 });
          }
          if (err && outBuf.length === 0) {
            return reject(new Error(stderr ? stderr.toString() : err.message));
          }
          resolve({ buf: outBuf, status: outBuf.length > 0 ? 200 : 502 });
        }
      );
    });

  const first = await runCurl(headers);
  if (first.buf.length > 0 && first.status >= 200 && first.status < 400) {
    return first;
  }

  if (first.status === 400 || first.status === 401 || first.status === 403 || first.status === 406) {
    const noOriginHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'origin') noOriginHeaders[k] = v;
    }
    const second = await runCurl(noOriginHeaders).catch(() => ({
      buf: Buffer.alloc(0),
      status: 502,
    }));
    if (second.buf.length > 0 && second.status >= 200 && second.status < 400) {
      return second;
    }
    const minimalHeaders: Record<string, string> = headers.Range ? { Range: headers.Range } : {};
    const third = await runCurl(minimalHeaders).catch(() => ({
      buf: Buffer.alloc(0),
      status: 502,
    }));
    if (third.buf.length > 0 && third.status >= 200 && third.status < 400) {
      return third;
    }
  } else if (first.status >= 500 || first.status === 429 || first.status === 0) {
    await new Promise((r) => setTimeout(r, 200));
    const retry = await runCurl(headers).catch(() => ({ buf: Buffer.alloc(0), status: 502 }));
    if (retry.buf.length > 0 && retry.status >= 200 && retry.status < 400) {
      return retry;
    }
  }

  return first;
}

export async function curlGetBuffer(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 7
): Promise<Buffer> {
  const res = await curlGetBufferWithStatus(targetUrl, headers, maxTimeSec);
  return res.buf;
}

export async function curlPostJsonText(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  maxTimeSec = 5
): Promise<string> {
  return new Promise((resolve) => {
    const args = [
      '-4',
      '-sS',
      '-L',
      '-k',
      '--compressed',
      '--connect-timeout',
      String(Math.min(3, Math.max(2, maxTimeSec))),
      '--max-time',
      String(maxTimeSec),
      '-X',
      'POST',
      '-H',
      'Content-Type: application/json',
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v && k.toLowerCase() !== 'content-type') args.push('-H', `${k}: ${v}`);
    }
    args.push('-d', JSON.stringify(payload), url);
    execFile('curl', args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve('');
      resolve(String(stdout || ''));
    });
  });
}

export async function fetchTextWithCurlFallback(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 3500
): Promise<string> {
  if (!shouldBypassNodeFetch(url)) {
    try {
      const res = await streamingFetch(url, {
        headers,
        timeoutMs,
      });
      if (res.ok) {
        const txt = await res.text();
        if (txt) return txt;
      } else if (res.status === 403 || res.status === 429 || res.status === 503) {
        markHostNeedsCurlFallback(url);
      }
    } catch {
      markHostNeedsCurlFallback(url);
    }
  }
  const fb = await curlGetText(
    url,
    headers,
    Math.max(3, Math.ceil(timeoutMs / 1000)),
    true,
    true
  ).catch(() => ({ text: '' }));
  return fb.text || '';
}

export async function probeHlsSegmentHealth(rawM3u8Url: string, origin: string): Promise<boolean> {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const reqHeaders: Record<string, string> = {
    'User-Agent': CHROME_UA,
    Referer: `${cleanOrigin}/`,
    Accept: '*/*',
  };

  try {
    const masterText = await fetchTextWithCurlFallback(rawM3u8Url, reqHeaders, 3000);
    if (!masterText.includes('#EXTM3U')) return false;

    let mediaPlaylistUrl = rawM3u8Url;
    let mediaText = masterText;

    if (masterText.includes('#EXT-X-STREAM-INF')) {
      const lines = masterText.split(/\r?\n/);
      let bestVariant = '';
      let bestBw = -1;
      let pendingBw = 0;
      let expectingUrl = false;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          const bwM = line.match(/BANDWIDTH=(\d+)/i);
          pendingBw = bwM ? parseInt(bwM[1], 10) || 0 : 0;
          expectingUrl = true;
          continue;
        }
        if (line.startsWith('#')) continue;
        if (expectingUrl) {
          expectingUrl = false;
          try {
            const absVar = new URL(line, rawM3u8Url).href;
            if (!bestVariant || pendingBw >= bestBw) {
              bestBw = pendingBw;
              bestVariant = absVar;
            }
          } catch {
            // ignore invalid variant URL
          }
        }
      }
      if (!bestVariant) return false;
      mediaPlaylistUrl = bestVariant;
      mediaText = await fetchTextWithCurlFallback(mediaPlaylistUrl, reqHeaders, 3000);
      if (!mediaText.includes('#EXTM3U')) return false;
    }

    const firstSegRel = mediaText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (!firstSegRel) return true;

    const firstSegUrl = new URL(firstSegRel, mediaPlaylistUrl).href;
    const segHeaders: Record<string, string> = {
      'User-Agent': CHROME_UA,
      Referer: `${origin}/`,
      Range: 'bytes=0-65535',
    };

    const isLikelyHtml = (buf: Buffer): boolean => {
      const head = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
      return head.startsWith('<!doctype') || head.startsWith('<html');
    };

    if (!shouldBypassNodeFetch(firstSegUrl)) {
      try {
        const segResp = await streamingFetch(firstSegUrl, {
          headers: segHeaders,
          timeoutMs: 2800,
        });
        if (segResp.ok) {
          const ab = await segResp.arrayBuffer();
          const buf = Buffer.from(ab);
          if (buf.length >= 512 && !isLikelyHtml(buf)) {
            return true;
          }
          if (buf.length === 0 || isLikelyHtml(buf)) return false;
        }
      } catch {
        markHostNeedsCurlFallback(firstSegUrl);
      }
    }

    const curlSeg = await curlGetBufferWithStatus(firstSegUrl, segHeaders, 3).catch(() => ({
      buf: Buffer.alloc(0),
      status: 0,
    }));
    return (
      curlSeg.status >= 200 &&
      curlSeg.status < 400 &&
      curlSeg.buf.length >= 512 &&
      !isLikelyHtml(curlSeg.buf)
    );
  } catch {
    return false;
  }
}
