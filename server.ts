import dns from 'dns';
import crypto from 'crypto';
import http2 from 'http2';
import zlib from 'zlib';
import { execFile, spawn } from 'child_process';
import express from 'express';
import { createServer } from 'http';
import { Readable } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { Browser, Page } from 'puppeteer';

// Prefer IPv4 to avoid transient container IPv6 socket resets with upstream CDNs
dns.setDefaultResultOrder('ipv4first');
// Allow upstream streaming CDNs with incomplete intermediate certificate chains
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TMDB_API_KEY = '90b2cae8d7161e8ba0f3836240d7d352';

const AD_DOMAIN_PATTERNS = [
  'doubleclick',
  'googlesyndication',
  'googleads',
  'adsterra',
  'popads',
  'popunder',
  'exoclick',
  'propeller',
  'onclickmega',
  'clickadu',
  'adcash',
  'hilltopads',
  'profitablecpmrate',
  'capitalhospitals',
  'llvpn',
  'xadsmart',
  'laguneelemong',
  'mbuqxdxsra',
  'acscdn',
  'chaldeedaws',
  'sewinramjets',
  'directdexchange',
  'bet365',
  '1xbet',
  'trafficjunky',
  'adnxs',
];

function isBlockedAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_DOMAIN_PATTERNS.some((domain) => lower.includes(domain));
}

// ============================================================================
// WARM SINGLETON HEADLESS CHROMIUM ENGINE (FOR SPORTS SNIFFING & CLOUD BROWSER)
// ============================================================================
let sharedBrowserPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowserPromise) {
    try {
      const browser = await sharedBrowserPromise;
      if (browser.connected) return browser;
    } catch {
      sharedBrowserPromise = null;
    }
  }

  sharedBrowserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-popup-blocking=false',
      '--mute-audio',
    ],
  });

  const browser = await sharedBrowserPromise;
  browser.on('disconnected', () => {
    sharedBrowserPromise = null;
  });
  return browser;
}

setTimeout(() => {
  getSharedBrowser().catch(() => {});
}, 1500);

// ============================================================================
// STREAM EXTRACTION TYPES & CACHE
// ============================================================================
interface TrackRecord {
  id: string;
  label: string;
  lang: string;
  quality?: string;
  sourceUrl: string;
  resolverType:
    | 'movidy_embed'
    | 'vidhide_hls'
    | 'bingetrix_en'
    | 'sports_channel'
    | 'direct_hls'
    | 'direct_mp4'
    | 'youtube';
  resolvedStreamUrl?: string;
}

interface ExtractedStreamResult {
  success: boolean;
  mode: 'hls' | 'direct' | 'youtube';
  streamUrl: string;
  rawStreamUrl?: string;
  referer?: string;
  youtubeId?: string;
  title?: string;
  tracks?: TrackRecord[];
  expiresAt: number;
}

const extractionCache = new Map<string, ExtractedStreamResult>();

function buildHlsProxyUrl(rawM3u8Url: string, referer: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(rawM3u8Url)}&referer=${encodeURIComponent(referer)}`;
}

function buildTsProxyUrl(rawMediaUrl: string, referer: string): string {
  return `/api/ts-proxy?url=${encodeURIComponent(rawMediaUrl)}&referer=${encodeURIComponent(referer)}`;
}

// ============================================================================
// SUBSYSTEM 1A: EMBED69 + VIDHIDE SPANISH/LATINO/VOSE DECOMPILER (<500ms)
// ============================================================================
function unpackDeanEdwards(html: string): string | null {
  const m = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\('\|'\)/
  );
  if (!m) return null;

  let [, payload, radixStr, countStr, dictStr] = m;
  const radix = parseInt(radixStr, 10);
  let count = parseInt(countStr, 10);
  const dict = dictStr.split('|');

  const toBase = (num: number, base: number): string => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return num < base ? chars[num] : toBase(Math.floor(num / base), base) + chars[num % base];
  };

  while (count--) {
    if (dict[count]) {
      const token = toBase(count, radix);
      payload = payload.replace(new RegExp(`\\b${token}\\b`, 'g'), dict[count]);
    }
  }
  return payload;
}

async function unpackVidhideToHls(embedUrl: string): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://embed69.org/',
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const unpacked = unpackDeanEdwards(html);
    if (!unpacked) return null;

    const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^}]+\})/);
    if (!linksMatch) return null;

    const links = JSON.parse(linksMatch[1]);
    const origin = new URL(embedUrl).origin;
    const rawCandidate = links.hls2 || links.hls4 || links.hls3 || '';
    if (!rawCandidate) return null;

    const rawM3u8 = rawCandidate.startsWith('/') ? `${origin}${rawCandidate}` : rawCandidate;
    return {
      rawM3u8,
      proxyUrl: buildHlsProxyUrl(rawM3u8, `${origin}/`),
    };
  } catch (err) {
    console.warn('unpackVidhideToHls error:', err);
    return null;
  }
}

async function resolveImdbId(tmdbId: string | number, mediaType: 'movie' | 'tv'): Promise<string | null> {
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

async function extractEmbed69SpanishTracks(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  try {
    const imdbId =
      opts.imdbId || (opts.tmdbId ? await resolveImdbId(opts.tmdbId, opts.mediaType) : null);
    if (!imdbId) return [];

    const epSuffix =
      opts.mediaType === 'tv' && opts.season && opts.episode
        ? `-${opts.season}x${String(opts.episode).padStart(2, '0')}`
        : '';
    const embed69Url = `https://embed69.org/f/${imdbId}${epSuffix}/`;

    const res = await fetch(embed69Url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const dataLinkMatch = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);
    const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*["']([^"']+)["']/);
    const diffMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
    const saltMatch = html.match(/POW_SALT\s*=\s*["']([^"']+)["']/);

    if (!dataLinkMatch || !challengeMatch || !diffMatch || !saltMatch) return [];

    const dataLink: any[] = JSON.parse(dataLinkMatch[1]);
    if (!Array.isArray(dataLink) || dataLink.length === 0) return [];

    const challenge = challengeMatch[1];
    const difficulty = Math.min(5, parseInt(diffMatch[1], 10) || 3);
    const salt = saltMatch[1];
    const prefix = '0'.repeat(difficulty);

    let nonce = 0;
    const maxIters = 500000;
    while (nonce < maxIters) {
      const hex = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
      if (hex.startsWith(prefix)) break;
      nonce++;
    }
    const aesKey = crypto.createHash('sha256').update(challenge + nonce + salt).digest();

    const decryptEmbedLink = (b64: string): string | null => {
      try {
        const raw = Buffer.from(b64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, raw.subarray(0, 16));
        return Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8');
      } catch {
        return null;
      }
    };

    const tracks: TrackRecord[] = [];
    // Order: ESP (Castellano) first, then LAT (Latino), then SUB (Subtitulado)
    const langPriority: Record<string, number> = { ESP: 1, LAT: 2, SUB: 3 };
    const sortedGroups = [...dataLink].sort(
      (a, b) => (langPriority[a.video_language] || 9) - (langPriority[b.video_language] || 9)
    );

    for (const grp of sortedGroups) {
      const rawLang = String(grp.video_language || 'LAT').toUpperCase();
      const embeds: any[] = Array.isArray(grp.sortedEmbeds) ? grp.sortedEmbeds : [];
      const vidhideEntry = embeds.find((e) => e.servername === 'vidhide');
      if (!vidhideEntry?.link) continue;

      const decryptedUrl = decryptEmbedLink(vidhideEntry.link);
      if (!decryptedUrl || !decryptedUrl.startsWith('http')) continue;

      const label =
        rawLang === 'ESP'
          ? 'Castellano HD'
          : rawLang === 'LAT'
          ? 'Español Latino HD'
          : rawLang === 'SUB'
          ? 'Subtitulado VOSE'
          : `${rawLang} HD`;

      const langCode = rawLang === 'ESP' ? 'ES' : rawLang === 'LAT' ? 'LAT' : 'VOSE';

      tracks.push({
        id: `embed69-${imdbId}${epSuffix}-${rawLang.toLowerCase()}`,
        label,
        lang: langCode,
        quality: 'HD HLS',
        sourceUrl: decryptedUrl,
        resolverType: 'vidhide_hls',
      });
    }

    return tracks;
  } catch (err) {
    console.warn('extractEmbed69SpanishTracks error:', err);
    return [];
  }
}

// ============================================================================
// SUBSYSTEM 1B: BINGETRIX ENGLISH 1080P WASM CHACHA20 DECOMPILER (PURE NODE H2)
// ============================================================================
function h2GetRaw(
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
      fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(maxTimeSec * 1000),
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
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {}
      reject(err);
    };

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
      try {
        client.close();
      } catch {}

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
      } catch {}
      if (chunks.length > 0) finalize();
      else finishErr(new Error('HTTP/2 request timeout'));
    });
    req.end();
  });
}

async function curlGetText(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6
): Promise<{ text: string; effectiveUrl: string }> {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status < 400) {
      return { text: h2.buf.toString('utf8'), effectiveUrl: h2.effectiveUrl };
    }
  } catch {
    // fallback to curl if available
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-sS',
      '-L',
      '-k',
      '--compressed',
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

async function curlGetBuffer(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 7
): Promise<Buffer> {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status < 400) {
      return h2.buf;
    }
  } catch {
    // fallback to curl if available
  }

  return new Promise((resolve, reject) => {
    const args = ['-sS', '-L', '-k', '--max-time', String(maxTimeSec)];
    for (const [k, v] of Object.entries(headers)) {
      if (v) args.push('-H', `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile(
      'curl',
      args,
      { encoding: 'buffer', maxBuffer: 25 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && (!stdout || stdout.length === 0)) {
          return reject(new Error(stderr ? stderr.toString() : err.message));
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      }
    );
  });
}

const wasmModuleCache = new Map<string, Promise<WebAssembly.Module>>();

async function getBingetrixWasmModule(
  windowKey: string,
  wasmUrl?: string,
  wasmB64?: string
): Promise<WebAssembly.Module | null> {
  const key = `${windowKey || wasmUrl || 'default'}`;
  const cached = wasmModuleCache.get(key);
  if (cached) return cached;

  const compilePromise = (async () => {
    const bytes = wasmUrl
      ? await curlGetBuffer(wasmUrl, { 'User-Agent': CHROME_UA }, 6)
      : wasmB64
      ? Buffer.from(wasmB64, 'base64')
      : null;
    if (!bytes || bytes.length === 0) throw new Error('Missing WASM bytes');
    return WebAssembly.compile(new Uint8Array(bytes));
  })();

  wasmModuleCache.set(key, compilePromise);
  compilePromise.catch(() => wasmModuleCache.delete(key));
  if (wasmModuleCache.size > 12) {
    const oldest = wasmModuleCache.keys().next().value;
    if (oldest) wasmModuleCache.delete(oldest);
  }
  return compilePromise;
}

function parseStreamTokenText(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object') {
        return parsed.token || parsed.data || parsed.string || parsed.result || '';
      }
    } catch {
      // ignore
    }
  }
  return trimmed;
}

async function extractBingetrixEnglishTracks(opts: {
  tmdbId: string | number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  try {
    const cleanId = String(opts.tmdbId).replace(/\D/g, '');
    if (!cleanId) return [];

    const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
    const vsQuery =
      mType === 'tv' && opts.season && opts.episode
        ? `type=tv&id=${cleanId}&season=${opts.season}&episode=${opts.episode}`
        : `type=movie&id=${cleanId}`;

    const vsRaw = await curlGetText(
      `https://screenfetch4.cyou/vs_src.php?${vsQuery}`,
      {
        Referer: `https://screenfetch4.cyou/embed/${mType}?tmdb=${cleanId}&o=https%3A%2F%2Fbingetrix.sc`,
        'User-Agent': CHROME_UA,
      },
      5
    );
    if (!vsRaw.text) return [];
    const vsJson: any = JSON.parse(vsRaw.text);
    if (!vsJson?.src) return [];

    const playerOrigin = new URL(vsJson.src).origin;
    const { text: landingHtml } = await curlGetText(
      vsJson.src,
      { Referer: 'https://screenfetch4.cyou/', 'User-Agent': CHROME_UA },
      5
    );

    const cfgMatch = landingHtml.match(/window\.CFG\s*=\s*(\{[^;]+\});/);
    if (!cfgMatch) return [];
    const cfg = JSON.parse(cfgMatch[1]);
    if (!cfg?.playerUrl) return [];

    const { text: playerHtml } = await curlGetText(
      `${playerOrigin}${cfg.playerUrl}`,
      { Referer: vsJson.src, 'User-Agent': CHROME_UA },
      5
    );

    const pCfgMatch = playerHtml.match(/window\.CONFIG\s*=\s*(\{[^;]+\});/);
    if (!pCfgMatch) return [];
    const pCfg = JSON.parse(pCfgMatch[1]);
    if (!pCfg?.apiToken) return [];

    const baseMetaApi = pCfg.metaApi || cfg.metaApi || '';
    const baseStreamApi = pCfg.api || (baseMetaApi ? `${baseMetaApi}&stream_urls` : '');
    if (!baseStreamApi) return [];

    const streamApiUrl = `${baseStreamApi}${baseStreamApi.includes('?') ? '&' : '?'}api_token=${encodeURIComponent(pCfg.apiToken)}`;

    const { text: apiText } = await curlGetText(
      streamApiUrl,
      {
        Referer: `${playerOrigin}/`,
        Origin: playerOrigin,
        Accept: 'application/json',
        'User-Agent': CHROME_UA,
      },
      6
    );
    if (!apiText) return [];
    const apiJson: any = JSON.parse(apiText);

    let rawUrls: string[] = [];
    if (Array.isArray(apiJson?.data?.stream_urls)) {
      rawUrls = apiJson.data.stream_urls;
    } else if (apiJson?.vs && typeof apiJson?.data?.stream_urls === 'string') {
      const mod = await getBingetrixWasmModule(
        String(apiJson.vs.w || ''),
        apiJson.vs.wasm_url,
        apiJson.vs.wasm
      );
      if (mod) {
        const inst = await WebAssembly.instantiate(mod, {});
        const ex = inst.exports as any;
        const enc = Buffer.from(apiJson.data.stream_urls, 'base64');
        const ptr = ex.alloc(enc.length);
        new Uint8Array(ex.memory.buffer, ptr, enc.length).set(enc);
        const outLen = ex.decrypt(ptr, enc.length);
        const plain = new TextDecoder().decode(
          new Uint8Array(ex.memory.buffer, ptr + 12, outLen)
        );
        rawUrls = plain.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      }
    }

    if (rawUrls.length === 0) return [];

    const stampedTracks = await Promise.all(
      rawUrls.slice(0, 3).map(async (rawStreamUrl, idx) => {
        try {
          const streamOrigin = new URL(rawStreamUrl).origin;
          const genUrl = `${streamOrigin}/generate.php?api_token=${encodeURIComponent(pCfg.apiToken)}`;
          const tokRaw = await curlGetText(
            genUrl,
            {
              Referer: `${playerOrigin}/`,
              Origin: playerOrigin,
              'User-Agent': CHROME_UA,
            },
            4
          )
            .then((r) => r.text)
            .catch(() => '');
          const token = parseStreamTokenText(tokRaw);
          const finalMasterUrl = token
            ? rawStreamUrl.includes('__TOKEN__')
              ? rawStreamUrl.split('__TOKEN__').join(token)
              : `${rawStreamUrl}${rawStreamUrl.includes('?') ? '&' : '?'}token=${token}`
            : rawStreamUrl;

          const proxyUrl = buildHlsProxyUrl(finalMasterUrl, `${playerOrigin}/`);
          const sourceRef =
            mType === 'tv' && opts.season && opts.episode
              ? `https://bingetrix.sc/watch/tv/${cleanId}/${opts.season}/${opts.episode}`
              : `https://bingetrix.sc/watch/${cleanId}`;

          return {
            id: `bingetrix-en-${mType}-${cleanId}-${idx + 1}`,
            label: `English 1080p · S${idx + 1}`,
            lang: 'EN',
            quality: '1080p HLS',
            sourceUrl: sourceRef,
            resolverType: 'bingetrix_en' as const,
            resolvedStreamUrl: proxyUrl,
          };
        } catch {
          return null;
        }
      })
    );

    return stampedTracks.filter((t): t is NonNullable<typeof t> => Boolean(t));
  } catch (err) {
    console.warn('extractBingetrixEnglishTracks error:', err);
    return [];
  }
}

// ============================================================================
// SUBSYSTEM 1C: LEGACY NUPLOAD DECODER (FALLBACK FOR DIRECT NUPLOAD LINKS)
// ============================================================================
async function decodeNuploadToHls(embedUrlOrB64: string): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    let embedUrl = embedUrlOrB64.trim();
    if (!embedUrl.startsWith('http')) {
      embedUrl = Buffer.from(embedUrl, 'base64').toString('utf8').trim();
    }
    if (!embedUrl.startsWith('http')) return null;
    if (!embedUrl.includes('?')) {
      embedUrl += '?h=';
    }

    const res = await fetch(embedUrl, {
      headers: {
        Referer: 'https://movidy.pw/',
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    const forEachMatch = html.match(/([a-zA-Z0-9_]+)\.forEach\([\s\S]{0,200}?-\s*(\d+)\)/);
    if (!forEachMatch) return null;

    const [, arrName, offsetStr] = forEachMatch;
    const offset = parseInt(offsetStr, 10);
    const arrRegex = new RegExp(`var\\s+${arrName}\\s*=\\s*(\\[[^\\]]+\\])`);
    const arrMatch = html.match(arrRegex);
    const sesMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/);

    if (!arrMatch || !sesMatch) return null;

    const encodedItems: string[] = JSON.parse(arrMatch[1]);
    const baseStream = encodedItems
      .map((item) => {
        const decodedDigits = Buffer.from(item, 'base64').toString('utf8').replace(/\D/g, '');
        return String.fromCharCode(parseInt(decodedDigits, 10) - offset);
      })
      .join('');

    const rawM3u8 = `${baseStream}?s=${sesMatch[1]}`;
    const embedOrigin = new URL(embedUrl).origin + '/';
    return {
      rawM3u8,
      proxyUrl: buildHlsProxyUrl(rawM3u8, embedOrigin),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SUBSYSTEM 2: PURE CRYPTO + HTTP LIVE SPORTS DECOMPILER (<350ms, ZERO CHROME)
// ============================================================================
function healUpstreamSportsDomain(rawUrl: string): string {
  // Auto-heal rotated mirror hostnames (e.g. doc.tilinhd.lol -> dog.tilinhd.lol)
  return rawUrl.replace(/\/\/doc\.tilinhd\.lol\b/gi, '//dog.tilinhd.lol');
}

function decodeSportsPlaystreamEconfig(econfig: string): any | null {
  try {
    const order = [2, 0, 3, 1];
    const s1 = Buffer.from(econfig, 'base64').toString('binary');
    const chunkLen = Math.ceil(s1.length / 4);
    const chunks: string[] = [];
    for (let i = 0; i < 4; i++) {
      chunks.push(s1.slice(i * chunkLen, (i + 1) * chunkLen));
    }
    const reordered: string[] = [];
    for (let i = 0; i < 4; i++) {
      const part = String(chunks[i] || '');
      const cleanPart = part.slice(0, 3) + part.slice(4);
      reordered[order[i]] = Buffer.from(cleanPart, 'base64').toString('binary');
    }
    const jsonText = Buffer.from(reordered.join(''), 'base64').toString('utf8');
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function fetchSportsHtmlHop(url: string, referer: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        Referer: referer,
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) return await res.text();
  } catch {
    // fallback to HTTP/2 helper
  }
  const fb = await curlGetText(url, { Referer: referer, 'User-Agent': CHROME_UA }, 5).catch(
    () => ({ text: '', effectiveUrl: url })
  );
  return fb.text;
}

async function extractLiveSportsHlsDirect(
  initialUrl: string
): Promise<{ streamUrl: string; referer: string; isDirectMp4: boolean } | null> {
  let currentUrl = healUpstreamSportsDomain(initialUrl);
  let currentReferer = 'https://www.rojadirectv.live/';
  try {
    currentReferer = new URL(currentUrl).origin + '/';
  } catch {
    // keep default referer
  }

  for (let hop = 0; hop < 7; hop++) {
    currentUrl = healUpstreamSportsDomain(currentUrl);
    const html = await fetchSportsHtmlHop(currentUrl, currentReferer);
    if (!html) break;

    // 1. Playstream / TilinHD / Footunder `window._econfig` pure crypto decode!
    const econfigMatch = html.match(/window\._econfig\s*=\s*['"]([^'"]+)['"]/);
    if (econfigMatch && econfigMatch[1]) {
      const cfg = decodeSportsPlaystreamEconfig(econfigMatch[1]);
      const rawCandidate: string = cfg?.stream_url || cfg?.stream_url_nop2p || '';
      if (rawCandidate) {
        const origin = new URL(currentUrl).origin;
        const proxiedViaPlaystream = rawCandidate.startsWith('http')
          ? `${origin}/playstream.php?stream_tv=${Buffer.from(rawCandidate).toString('base64')}`
          : new URL(rawCandidate, currentUrl).href;

        // Verify the channel is actively broadcasting #EXTM3U right now
        const checkM3u = await fetchSportsHtmlHop(proxiedViaPlaystream, currentUrl);
        if (checkM3u.includes('#EXTM3U')) {
          return {
            streamUrl: proxiedViaPlaystream,
            referer: currentUrl,
            isDirectMp4: false,
          };
        }
      }
      return null;
    }

    // 2. Direct `.m3u8` in Clappr / JWPlayer / HLS.js config
    const directM3u8Match = html.match(
      /(?:source|file|src|streamUrl)\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i
    );
    if (directM3u8Match && directM3u8Match[1] && !isBlockedAdUrl(directM3u8Match[1])) {
      return {
        streamUrl: directM3u8Match[1],
        referer: currentUrl,
        isDirectMp4: false,
      };
    }

    // 3. Base64 `atob('...')` or `encodedUrl = "..."` iframe hop
    const b64Matches = [
      ...html.matchAll(/(?:atob\(\s*['"]|encodedUrl\s*=\s*['"])([A-Za-z0-9+/=]{16,})['"]/g),
    ];
    let followedB64 = false;
    for (const m of b64Matches) {
      try {
        const decoded = Buffer.from(m[1], 'base64').toString('utf8').trim();
        if (
          (decoded.startsWith('http') || decoded.startsWith('/')) &&
          !isBlockedAdUrl(decoded)
        ) {
          const nextUrl = healUpstreamSportsDomain(new URL(decoded, currentUrl).href);
          currentReferer = currentUrl;
          currentUrl = nextUrl;
          followedB64 = true;
          break;
        }
      } catch {
        // ignore invalid base64
      }
    }
    if (followedB64) continue;

    // 4. Static `<iframe src="...">` hop
    const staticIframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (staticIframe && staticIframe[1] && !isBlockedAdUrl(staticIframe[1])) {
      const nextUrl = healUpstreamSportsDomain(new URL(staticIframe[1], currentUrl).href);
      if (nextUrl !== currentUrl) {
        currentReferer = currentUrl;
        currentUrl = nextUrl;
        continue;
      }
    }

    break;
  }

  return null;
}

async function unwrapNestedEmbedChain(initialUrl: string): Promise<{ targetUrl: string; referer: string }> {
  let currentUrl = healUpstreamSportsDomain(initialUrl);
  let currentReferer = new URL(currentUrl).origin + '/';

  for (let hop = 0; hop < 5; hop++) {
    try {
      const html = await fetchSportsHtmlHop(currentUrl, currentReferer);
      if (!html) break;

      if (html.includes('_econfig') || html.includes('Clappr') || html.includes('jwplayer')) {
        return { targetUrl: currentUrl, referer: currentReferer };
      }

      const staticIframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (staticIframe && staticIframe[1] && !isBlockedAdUrl(staticIframe[1])) {
        const nextUrl = healUpstreamSportsDomain(new URL(staticIframe[1], currentUrl).href);
        currentReferer = currentUrl;
        currentUrl = nextUrl;
        continue;
      }

      const atobMatch =
        html.match(/atob\(\s*["']([A-Za-z0-9+/=]{16,})["']\s*\)/) ||
        html.match(/encodedUrl\s*=\s*["']([A-Za-z0-9+/=]{16,})["']/);
      if (atobMatch && atobMatch[1]) {
        const decoded = Buffer.from(atobMatch[1], 'base64').toString('utf8').trim();
        if (decoded.startsWith('http') || decoded.startsWith('/')) {
          const nextUrl = healUpstreamSportsDomain(new URL(decoded, currentUrl).href);
          currentReferer = currentUrl;
          currentUrl = nextUrl;
          continue;
        }
      }

      break;
    } catch {
      break;
    }
  }

  return { targetUrl: currentUrl, referer: currentReferer };
}

async function sniffStreamWithHeadless(
  rawUrl: string
): Promise<{ streamUrl: string; referer: string; isDirectMp4: boolean } | null> {
  let page: Page | null = null;
  try {
    const { targetUrl, referer } = await unwrapNestedEmbedChain(rawUrl);
    const browser = await getSharedBrowser();
    page = await browser.newPage();

    await page.setUserAgent(CHROME_UA);
    await page.setExtraHTTPHeaders({ Referer: referer });
    await page.setRequestInterception(true);

    let resolvedMedia: { streamUrl: string; referer: string; isDirectMp4: boolean } | null = null;
    let resolvePromise!: (val: { streamUrl: string; referer: string; isDirectMp4: boolean } | null) => void;
    const mediaFoundPromise = new Promise<{
      streamUrl: string;
      referer: string;
      isDirectMp4: boolean;
    } | null>((res) => {
      resolvePromise = res;
    });

    page.on('request', (req) => {
      const reqUrl = req.url();
      const resType = req.resourceType();

      if (isBlockedAdUrl(reqUrl) || resType === 'image' || resType === 'font') {
        req.abort().catch(() => {});
        return;
      }

      if (
        !resolvedMedia &&
        (reqUrl.includes('.m3u8') || reqUrl.includes('stream_tv=') || /\.mp4(\?|$)/i.test(reqUrl))
      ) {
        const reqReferer = req.headers()['referer'] || targetUrl;
        const isDirectMp4 = /\.mp4(\?|$)/i.test(reqUrl) && !reqUrl.includes('.m3u8');
        resolvedMedia = {
          streamUrl: reqUrl,
          referer: reqReferer,
          isDirectMp4,
        };
        resolvePromise(resolvedMedia);
      }

      req.continue().catch(() => {});
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    setTimeout(async () => {
      if (!resolvedMedia && page && !page.isClosed()) {
        await page
          .evaluate(() => {
            const btn = document.querySelector<HTMLElement>(
              '.play-wrapper, .vjs-big-play-button, .jw-icon-display, [data-play], button, video'
            );
            btn?.click();
          })
          .catch(() => {});
      }
    }, 900);

    const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 6000));
    return await Promise.race([mediaFoundPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Headless stream sniff unavailable (safe fallback):', (err as Error)?.message);
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER INITIALIZATION
// ============================================================================
const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

app.use(express.json());

// ============================================================================
// SUBSYSTEM 3: AUTHORITATIVE REAL-TIME ROOM, QUEUE & CLOUD BROWSER ENGINE
// ============================================================================
interface CloudRoomSession {
  page: Page;
  timer: ReturnType<typeof setInterval>;
  url: string;
  title: string;
  isLoading: boolean;
  detectedStreamUrl?: string;
}

interface RoomRecord {
  id: string;
  name: string;
  hostId: string;
  videoState: {
    mode: 'idle' | 'hls' | 'direct' | 'youtube' | 'cloud';
    url: string;
    rawSourceUrl: string;
    title: string;
    subtitle?: string;
    poster?: string;
    backdrop?: string;
    currentTime: number;
    isPlaying: boolean;
    isLive: boolean;
    tracks: any[];
    activeTrackIndex: number;
    seriesMeta?: any;
    lastUpdated: number;
    updatedBy?: string;
  };
  queue: any[];
  participants: {
    id: string;
    name: string;
    avatar: string;
    color: string;
    isHost: boolean;
    joinedAt: number;
  }[];
  messages: any[];
  createdAt: number;
}

const rooms = new Map<string, RoomRecord>();
const cloudSessions = new Map<string, CloudRoomSession>();

interface ClientMeta {
  ws: WebSocket;
  roomId?: string;
  userId?: string;
  userName?: string;
}

const clients = new Map<WebSocket, ClientMeta>();

function getOrCreateRoom(roomId: string, roomName?: string): RoomRecord {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const created: RoomRecord = {
    id: roomId,
    name: roomName || `Sala ${roomId.toUpperCase()}`,
    hostId: '',
    videoState: {
      mode: 'idle',
      url: '',
      rawSourceUrl: '',
      title: 'NAIMCINE · Elige película, serie, partido o YouTube',
      subtitle: 'Reproducción nativa HLS sincronizada sin anuncios',
      currentTime: 0,
      isPlaying: false,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      lastUpdated: Date.now(),
    },
    queue: [],
    participants: [],
    messages: [
      {
        id: `sys-welcome-${Date.now()}`,
        senderId: 'system',
        senderName: 'NAIMCINE',
        senderAvatar: '🎬',
        senderColor: '#e11d48',
        text: 'Bienvenido a NAIMCINE. Elige cualquier película (Español o Bingetrix EN), serie, fútbol en vivo o YouTube para ver juntos sin anuncios.',
        timestamp: Date.now(),
        isSystem: true,
      },
    ],
    createdAt: Date.now(),
  };

  rooms.set(roomId, created);
  return created;
}

function computeAuthoritativeVideoState(room: RoomRecord) {
  const vs = { ...room.videoState };
  if (vs.isPlaying && !vs.isLive && (vs.mode === 'hls' || vs.mode === 'direct' || vs.mode === 'youtube')) {
    const elapsedSec = Math.max(0, (Date.now() - vs.lastUpdated) / 1000);
    vs.currentTime = vs.currentTime + elapsedSec;
  }
  return vs;
}

function broadcastToRoom(roomId: string, message: unknown, excludeWs?: WebSocket) {
  const serialized = JSON.stringify(message);
  clients.forEach((meta, clientWs) => {
    if (meta.roomId === roomId && clientWs.readyState === WebSocket.OPEN && clientWs !== excludeWs) {
      clientWs.send(serialized);
    }
  });
}

async function stopCloudSession(roomId: string) {
  const existing = cloudSessions.get(roomId);
  if (!existing) return;
  clearInterval(existing.timer);
  cloudSessions.delete(roomId);
  await existing.page.close().catch(() => {});
}

async function startCloudSession(roomId: string, targetUrl: string) {
  await stopCloudSession(roomId);

  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  let browser: Browser;
  try {
    browser = await getSharedBrowser();
  } catch {
    return;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent(CHROME_UA);
  await page.setRequestInterception(true);

  const session: CloudRoomSession = {
    page,
    url: normalizedUrl,
    title: normalizedUrl,
    isLoading: true,
    timer: setInterval(async () => {
      if (page.isClosed()) return;
      try {
        const base64Jpeg = await page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' });
        broadcastToRoom(roomId, {
          type: 'CLOUD_BROWSER_FRAME',
          payload: {
            image: `data:image/jpeg;base64,${base64Jpeg}`,
            url: session.url,
            title: session.title,
            isLoading: session.isLoading,
            detectedStreamUrl: session.detectedStreamUrl,
          },
        });
      } catch {
        // ignore transient navigation screenshot errors
      }
    }, 320),
  };

  cloudSessions.set(roomId, session);

  page.on('popup', async (popupPage) => {
    if (popupPage) await popupPage.close().catch(() => {});
  });

  page.on('request', (req) => {
    const reqUrl = req.url();
    if (isBlockedAdUrl(reqUrl)) {
      req.abort().catch(() => {});
      return;
    }
    if (reqUrl.includes('.m3u8') || reqUrl.includes('stream_tv=') || /\.mp4(\?|$)/i.test(reqUrl)) {
      const ref = req.headers()['referer'] || session.url;
      const proxied = /\.mp4(\?|$)/i.test(reqUrl)
        ? buildTsProxyUrl(reqUrl, ref)
        : buildHlsProxyUrl(reqUrl, ref);
      session.detectedStreamUrl = proxied;
    }
    req.continue().catch(() => {});
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      session.url = frame.url();
      page
        .title()
        .then((t) => {
          session.title = t || session.url;
        })
        .catch(() => {});
    }
  });

  await page.evaluateOnNewDocument(() => {
    window.open = () => null;
    window.alert = () => {};
    window.confirm = () => true;
  });

  page
    .goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    .then(async () => {
      session.isLoading = false;
      session.title = (await page.title().catch(() => '')) || session.url;
    })
    .catch(() => {
      session.isLoading = false;
    });
}

wss.on('connection', (ws) => {
  clients.set(ws, { ws });

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, payload } = data;

      if (type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', payload: { clientTs: payload?.clientTs || Date.now() } }));
        return;
      }

      if (type === 'JOIN_ROOM') {
        const roomId = String(payload?.roomId || 'sala-naim').trim().toLowerCase();
        const userObj = payload?.user || {};
        const userId = String(userObj.id || payload?.userId || `u-${Date.now()}`);
        const userName = String(userObj.name || payload?.userName || 'Invitado').trim();
        const userAvatar = String(userObj.avatar || payload?.userAvatar || '🍿');
        const userColor = String(userObj.color || payload?.userColor || '#e11d48');

        const room = getOrCreateRoom(roomId, payload?.roomName);

        if (!room.hostId || !room.participants.some((p) => p.id === room.hostId)) {
          room.hostId = userId;
        }

        const isHost = room.hostId === userId;
        const alreadyInRoom = room.participants.some((p) => p.id === userId);
        room.participants = room.participants.filter((p) => p.id !== userId);

        room.participants.push({
          id: userId,
          name: userName,
          avatar: userAvatar,
          color: userColor,
          isHost,
          joinedAt: Date.now(),
        });

        clients.set(ws, { ws, roomId, userId, userName });

        let joinMsg = null;
        if (!alreadyInRoom) {
          joinMsg = {
            id: `join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: userAvatar,
            senderColor: '#10b981',
            text: `${userName} se ha unido a la sala`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'join',
          };
          room.messages.push(joinMsg);
          if (room.messages.length > 150) room.messages.shift();
        }

        ws.send(
          JSON.stringify({
            type: 'ROOM_STATE',
            payload: {
              ...room,
              videoState: computeAuthoritativeVideoState(room),
            },
          })
        );

        broadcastToRoom(
          roomId,
          {
            type: 'PARTICIPANTS_UPDATED',
            payload: {
              participants: room.participants,
              hostId: room.hostId,
              message: joinMsg,
            },
          },
          ws
        );
      } else if (type === 'SYNC_VIDEO_STATE') {
        const { roomId, action, videoState: incomingState, updatedBy } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !incomingState) return;

        room.videoState = {
          ...room.videoState,
          ...incomingState,
          lastUpdated: Date.now(),
          updatedBy: updatedBy || 'Anfitrión',
        };

        if (room.videoState.mode !== 'cloud') {
          await stopCloudSession(roomId);
        }

        let sysMsg = null;
        if (action === 'change_url') {
          sysMsg = {
            id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: '🎬',
            senderColor: '#e11d48',
            text: `${updatedBy || 'Un amigo'} puso "${room.videoState.title}"`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'video_change',
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();
        }

        broadcastToRoom(
          roomId,
          {
            type: 'VIDEO_STATE_UPDATED',
            payload: {
              videoState: room.videoState,
              action,
              message: sysMsg,
            },
          },
          action === 'play' || action === 'pause' || action === 'seek' ? ws : undefined
        );
      } else if (type === 'QUEUE_ADD') {
        const { roomId, item } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !item) return;
        room.queue = [...room.queue, item].slice(0, 30);
        const sysMsg = {
          id: `qmsg-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: '➕',
          senderColor: '#f59e0b',
          text: `${item.addedBy || 'Un amigo'} añadió "${item.title}" a la cola`,
          timestamp: Date.now(),
          isSystem: true,
        };
        room.messages.push(sysMsg);
        broadcastToRoom(roomId, {
          type: 'QUEUE_UPDATED',
          payload: { queue: room.queue, message: sysMsg },
        });
      } else if (type === 'QUEUE_REMOVE') {
        const { roomId, itemId } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !itemId) return;
        room.queue = room.queue.filter((q) => q.id !== itemId);
        broadcastToRoom(roomId, {
          type: 'QUEUE_UPDATED',
          payload: { queue: room.queue },
        });
      } else if (type === 'SEND_CHAT') {
        const { roomId, text, user } = payload || {};
        const room = rooms.get(roomId);
        const cleanText = String(text || '').trim();
        if (!room || !cleanText) return;

        const msg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          senderId: user?.id || payload?.senderId || 'anon',
          senderName: user?.name || payload?.senderName || 'Invitado',
          senderAvatar: user?.avatar || payload?.senderAvatar || '🍿',
          senderColor: user?.color || payload?.senderColor || '#e11d48',
          text: cleanText,
          timestamp: Date.now(),
        };

        room.messages.push(msg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(roomId, { type: 'NEW_CHAT_MESSAGE', payload: msg });
      } else if (type === 'SEND_REACTION') {
        const { roomId, emoji, user } = payload || {};
        if (!rooms.has(roomId) || !emoji) return;

        broadcastToRoom(roomId, {
          type: 'FLOATING_REACTION',
          payload: {
            id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            emoji,
            senderName: user?.name || 'Invitado',
            senderColor: user?.color || '#e11d48',
            xOffset: 12 + Math.floor(Math.random() * 76),
            timestamp: Date.now(),
          },
        });
      } else if (type === 'TRANSFER_HOST') {
        const { roomId, newHostId } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !newHostId) return;

        room.hostId = newHostId;
        room.participants.forEach((p) => {
          p.isHost = p.id === newHostId;
        });

        const target = room.participants.find((p) => p.id === newHostId);
        const sysMsg = {
          id: `host-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: '👑',
          senderColor: '#eab308',
          text: `${target?.name || 'Un participante'} es ahora el anfitrión`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'host_change',
        };
        room.messages.push(sysMsg);

        broadcastToRoom(roomId, {
          type: 'HOST_TRANSFERRED',
          payload: {
            hostId: room.hostId,
            participants: room.participants,
            message: sysMsg,
          },
        });
      } else if (type === 'UPDATE_PROFILE') {
        const { roomId, userId, userName, userAvatar, userColor } = payload || {};
        const room = rooms.get(roomId);
        if (!room) return;
        const member = room.participants.find((p) => p.id === userId);
        if (member) {
          if (userName) member.name = userName;
          if (userAvatar) member.avatar = userAvatar;
          if (userColor) member.color = userColor;
          broadcastToRoom(roomId, {
            type: 'PARTICIPANTS_UPDATED',
            payload: { participants: room.participants, hostId: room.hostId },
          });
        }
      } else if (type === 'WEBRTC_SIGNAL') {
        const { roomId, signalData, targetId, senderId } = payload || {};
        broadcastToRoom(roomId, { type: 'WEBRTC_SIGNAL', payload: { signalData, targetId, senderId } }, ws);
      } else if (type === 'CLOUD_BROWSER_START') {
        const { roomId, url, updatedBy } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !url) return;

        room.videoState = {
          mode: 'cloud',
          url,
          rawSourceUrl: url,
          title: `Cloud Browser · ${url}`,
          subtitle: 'Navegador aislado en servidor sin ventanas emergentes',
          currentTime: 0,
          isPlaying: true,
          isLive: true,
          tracks: [],
          activeTrackIndex: 0,
          lastUpdated: Date.now(),
          updatedBy,
        };

        broadcastToRoom(roomId, {
          type: 'VIDEO_STATE_UPDATED',
          payload: { videoState: room.videoState, action: 'change_url' },
        });

        await startCloudSession(roomId, url);
      } else if (type === 'CLOUD_BROWSER_INPUT') {
        const { roomId, input } = payload || {};
        const session = cloudSessions.get(roomId);
        if (!session || session.page.isClosed() || !input) return;

        try {
          if (input.type === 'click' && typeof input.x === 'number' && typeof input.y === 'number') {
            await session.page.mouse.click(input.x, input.y);
          } else if (input.type === 'scroll' && typeof input.deltaY === 'number') {
            await session.page.mouse.wheel({ deltaY: input.deltaY });
          } else if (input.type === 'type' && typeof input.text === 'string') {
            await session.page.keyboard.type(input.text);
          } else if (input.type === 'key' && typeof input.key === 'string') {
            await session.page.keyboard.press(input.key as any);
          } else if (input.type === 'navigate' && typeof input.url === 'string') {
            await startCloudSession(roomId, input.url);
          } else if (input.type === 'back') {
            await session.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
          } else if (input.type === 'reload') {
            await session.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          }
        } catch {
          // ignore input error during page navigation
        }
      } else if (type === 'CLOUD_BROWSER_STOP') {
        const { roomId } = payload || {};
        await stopCloudSession(roomId);
      }
    } catch (err) {
      console.error('WS message handling error:', err);
    }
  });

  ws.on('close', async () => {
    const meta = clients.get(ws);
    clients.delete(ws);
    if (!meta?.roomId || !meta?.userId) return;

    const room = rooms.get(meta.roomId);
    if (!room) return;

    room.participants = room.participants.filter((p) => p.id !== meta.userId);
    if (room.participants.length === 0) {
      await stopCloudSession(meta.roomId);
      return;
    }

    if (room.hostId === meta.userId) {
      room.hostId = room.participants[0].id;
      room.participants[0].isHost = true;
    }

    const leaveMsg = {
      id: `leave-${Date.now()}`,
      senderId: 'system',
      senderName: 'NAIMCINE',
      senderAvatar: '👋',
      senderColor: '#71717a',
      text: `${meta.userName || 'Un participante'} salió de la sala`,
      timestamp: Date.now(),
      isSystem: true,
      systemType: 'leave',
    };
    room.messages.push(leaveMsg);

    broadcastToRoom(meta.roomId, {
      type: 'PARTICIPANTS_UPDATED',
      payload: {
        participants: room.participants,
        hostId: room.hostId,
        message: leaveMsg,
      },
    });
  });
});

// ============================================================================
// REST API: IMAGE, HLS MANIFEST & MPEG-TS SEGMENT STREAMING PROXIES
// ============================================================================
app.get('/api/img-proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '');
  if (!rawUrl) return res.status(400).end();

  try {
    const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    const upstream = await fetch(fullUrl, {
      headers: {
        Referer: 'https://movidy.pw/',
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!upstream.ok || !upstream.body) return res.status(404).end();

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch {
    res.status(404).end();
  }
});

app.options(['/api/hls-proxy', '/api/ts-proxy'], (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
  res.status(204).end();
});

app.get('/api/hls-proxy', async (req, res) => {
  const targetUrl = String(req.query.url || '');
  const referer = String(req.query.referer || '');
  if (!targetUrl) return res.status(400).send('Missing url');

  try {
    const headers: Record<string, string> = {
      'User-Agent': CHROME_UA,
      Accept: '*/*',
    };
    if (referer) {
      headers['Referer'] = referer;
      try {
        headers['Origin'] = new URL(referer).origin;
      } catch {
        // ignore
      }
    }

    let baseUrl = targetUrl;
    let manifestText = '';

    try {
      const upstream = await fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      baseUrl = upstream.url || targetUrl;
      manifestText = await upstream.text();
    } catch {
      const fallback = await curlGetText(targetUrl, headers, 8);
      if (!fallback.text || !fallback.text.includes('#EXTM3U')) {
        return res.status(502).send('Upstream HLS error');
      }
      baseUrl = fallback.effectiveUrl || targetUrl;
      manifestText = fallback.text;
    }

    const effectiveReferer = referer || new URL(baseUrl).origin + '/';

    const lines = manifestText.split(/\r?\n/);
    let nextLineIsVariantPlaylist = false;

    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
          nextLineIsVariantPlaylist = true;
        }
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
            try {
              const absUri = new URL(uriVal, baseUrl).href;
              if (trimmed.startsWith('#EXT-X-MEDIA') || absUri.includes('.m3u8')) {
                return `URI="${buildHlsProxyUrl(absUri, effectiveReferer)}"`;
              }
              return `URI="${buildTsProxyUrl(absUri, effectiveReferer)}"`;
            } catch {
              return _match;
            }
          });
        }
        return line;
      }

      try {
        const absUrl = new URL(trimmed, baseUrl).href;
        const isPlaylist =
          nextLineIsVariantPlaylist ||
          /\.m3u8(\?|$)/i.test(absUrl) ||
          absUrl.includes('stream_tv=');
        nextLineIsVariantPlaylist = false;

        return isPlaylist
          ? buildHlsProxyUrl(absUrl, effectiveReferer)
          : buildTsProxyUrl(absUrl, effectiveReferer);
      } catch {
        nextLineIsVariantPlaylist = false;
        return line;
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rewritten.join('\n'));
  } catch (err) {
    console.error('HLS proxy error:', err);
    res.status(502).send('HLS proxy fetch failed');
  }
});

app.get('/api/ts-proxy', async (req, res) => {
  const targetUrl = String(req.query.url || '');
  const referer = String(req.query.referer || '');
  if (!targetUrl) return res.status(400).end();

  const headers: Record<string, string> = {
    'User-Agent': CHROME_UA,
    Accept: '*/*',
  };
  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // ignore
    }
  }
  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`TS upstream ${upstream.status}`);
    }

    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');

    const rawCt = (upstream.headers.get('content-type') || '').toLowerCase();
    const isDisguisedTsSegment =
      !rawCt ||
      rawCt.startsWith('text/html') ||
      rawCt.startsWith('text/plain') ||
      rawCt.startsWith('image/');
    res.setHeader('Content-Type', isDisguisedTsSegment ? 'video/mp2t' : rawCt);

    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);

    const ar = upstream.headers.get('accept-ranges');
    if (ar) res.setHeader('Accept-Ranges', ar);

    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.on('error', () => res.end());
    req.on('close', () => nodeStream.destroy());
    nodeStream.pipe(res);
  } catch {
    if (res.headersSent) return res.end();
    try {
      const buf = await curlGetBuffer(targetUrl, headers, 18);
      if (!buf || buf.length === 0) {
        res.status(502).end();
        return;
      }
      res.status(req.headers.range ? 206 : 200);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    } catch {
      if (!res.headersSent) res.status(502);
      res.end();
    }
  }
});

// ============================================================================
// REST API: MOVIES CATALOG (SPANISH CINEMA + BINGETRIX EXPLORE ENGLISH)
// ============================================================================
const MOVIE_GENRE_MAP: Record<string, number> = {
  action: 28,
  scifi: 878,
  horror: 27,
  comedy: 35,
  animation: 16,
  thriller: 53,
  adventure: 12,
  drama: 18,
};

const movieCatalogCache = new Map<string, { movies: any[]; hasMore: boolean; ts: number }>();

async function fetchTmdbMovieCatalog(opts: {
  lang: 'es-ES' | 'en-US';
  category: string;
  page: number;
  query: string;
}) {
  const { lang, category, page, query } = opts;
  const cacheKey = `${lang}|${category}|${page}|${query}`;
  const cached = movieCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached;
  }

  let endpoint = '';
  if (query) {
    endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  } else if (category === 'popular') {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'top_rated') {
    endpoint = `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'now_playing') {
    endpoint = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (MOVIE_GENRE_MAP[category]) {
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=popularity.desc&with_genres=${MOVIE_GENRE_MAP[category]}&page=${page}&include_adult=false`;
  } else {
    endpoint = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  }

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    return { movies: [], hasMore: false, ts: Date.now() };
  }
  const json: any = await res.json();
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const totalPages = Number(json?.total_pages || 1);

  const isEn = lang === 'en-US';
  const movies = results
    .filter((m) => m && m.id && (m.poster_path || m.backdrop_path))
    .map((m) => ({
      id: `${isEn ? 'bingetrix' : 'es'}-movie-${m.id}`,
      tmdbId: m.id,
      mediaType: 'movie',
      title: m.title || m.original_title || 'Película',
      originalTitle: m.original_title || m.title || '',
      year: m.release_date ? String(m.release_date).split('-')[0] : 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        (isEn
          ? 'Available in 1080p Original English ad-free HLS streaming via Bingetrix.'
          : 'Disponible en reproducción directa HLS sin anuncios (Castellano, Latino e Inglés 1080p).'),
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl: `https://bingetrix.sc/watch/${m.id}`,
      languages: isEn ? ['English 1080p', 'ES / LAT'] : ['Castellano', 'Latino', 'EN'],
    }));

  const payload = {
    movies,
    hasMore: page < totalPages && movies.length > 0,
    ts: Date.now(),
  };
  movieCatalogCache.set(cacheKey, payload);
  return payload;
}

app.get('/api/catalog/movies', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const data = await fetchTmdbMovieCatalog({
      lang: 'es-ES',
      category,
      page,
      query,
    });
    res.json({ success: true, movies: data.movies, hasMore: data.hasMore, page });
  } catch (err) {
    console.error('Spanish movies catalog error:', err);
    res.status(500).json({ success: false, movies: [], hasMore: false });
  }
});

app.get('/api/catalog/bingetrix', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const data = await fetchTmdbMovieCatalog({
      lang: 'en-US',
      category,
      page,
      query,
    });
    res.json({ success: true, movies: data.movies, hasMore: data.hasMore, page });
  } catch (err) {
    console.error('Bingetrix catalog error:', err);
    res.status(500).json({ success: false, movies: [], hasMore: false });
  }
});

// ============================================================================
// REST API: TV SERIES CATALOG + SEASONS & EPISODES EXPLORER
// ============================================================================
const SERIES_GENRE_MAP: Record<string, number> = {
  action: 10759,
  scifi: 10765,
  drama: 18,
  crime: 80,
  comedy: 35,
  animation: 16,
  mystery: 9648,
};

const seriesCatalogCache = new Map<string, { series: any[]; hasMore: boolean; ts: number }>();

app.get('/api/catalog/series', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `${langParam}|${category}|${page}|${query}`;
    const cached = seriesCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ success: true, series: cached.series, hasMore: cached.hasMore, page });
    }

    let endpoint = '';
    if (query) {
      endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=${langParam}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'top_rated') {
      endpoint = `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (SERIES_GENRE_MAP[category]) {
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&with_genres=${SERIES_GENRE_MAP[category]}&page=${page}`;
    } else {
      endpoint = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    }

    const tRes = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!tRes.ok) {
      return res.status(502).json({ success: false, series: [], hasMore: false });
    }

    const json: any = await tRes.json();
    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    const totalPages = Number(json?.total_pages || 1);

    const series = results
      .filter((s) => s && s.id && (s.poster_path || s.backdrop_path))
      .map((s) => ({
        id: `tv-${langParam}-${s.id}`,
        tmdbId: s.id,
        mediaType: 'tv',
        title: s.name || s.original_name || 'Serie',
        originalTitle: s.original_name || s.name || '',
        year: s.first_air_date ? String(s.first_air_date).split('-')[0] : 'TV',
        rating: s.vote_average ? Number(s.vote_average).toFixed(1) : '',
        overview: s.overview || 'Serie completa por temporadas y episodios en HD.',
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : '',
        backdrop: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : '',
        languages: ['ES / LAT', 'English 1080p'],
      }));

    const hasMore = page < totalPages && series.length > 0;
    seriesCatalogCache.set(cacheKey, { series, hasMore, ts: Date.now() });
    res.json({ success: true, series, hasMore, page });
  } catch (err) {
    console.error('Series catalog error:', err);
    res.status(500).json({ success: false, series: [], hasMore: false });
  }
});

app.get('/api/catalog/tv/:tmdbId', async (req, res) => {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false });

    const seasonNum = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';

    const [showRes, seasonRes] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}`,
        { signal: AbortSignal.timeout(4500) }
      ),
      fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=${langParam}`,
        { signal: AbortSignal.timeout(4500) }
      ),
    ]);

    if (!showRes.ok) return res.status(404).json({ success: false });
    const showJson: any = await showRes.json();
    const seasonJson: any = seasonRes.ok ? await seasonRes.json() : { episodes: [] };

    const seasons = (Array.isArray(showJson?.seasons) ? showJson.seasons : [])
      .filter((s: any) => s && s.season_number >= 1 && s.episode_count > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name || `Temporada ${s.season_number}`,
        episodeCount: s.episode_count,
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : '',
      }));

    const episodes = (Array.isArray(seasonJson?.episodes) ? seasonJson.episodes : []).map(
      (ep: any) => ({
        id: `ep-${cleanId}-${seasonNum}-${ep.episode_number}`,
        episodeNumber: ep.episode_number,
        seasonNumber: seasonNum,
        title: ep.name || `Episodio ${ep.episode_number}`,
        overview: ep.overview || '',
        still: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : '',
        runtime: ep.runtime || undefined,
        airDate: ep.air_date || undefined,
        rating: ep.vote_average ? Number(ep.vote_average).toFixed(1) : undefined,
      })
    );

    res.json({
      success: true,
      details: {
        tmdbId: Number(cleanId),
        title: showJson.name || showJson.original_name || 'Serie',
        originalTitle: showJson.original_name || showJson.name || '',
        year: showJson.first_air_date ? String(showJson.first_air_date).split('-')[0] : 'TV',
        rating: showJson.vote_average ? Number(showJson.vote_average).toFixed(1) : '',
        overview: showJson.overview || '',
        poster: showJson.poster_path ? `https://image.tmdb.org/t/p/w500${showJson.poster_path}` : '',
        backdrop: showJson.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${showJson.backdrop_path}`
          : '',
        seasons: seasons.length > 0 ? seasons : [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: episodes.length }],
        activeSeason: seasonNum,
        episodes,
      },
    });
  } catch (err) {
    console.error('TV details error:', err);
    res.status(500).json({ success: false });
  }
});

// ============================================================================
// REST API: INSTANT YOUTUBE SEARCH FOR SYNCHRONIZED WATCH PARTIES
// ============================================================================
const ytSearchCache = new Map<string, { videos: any[]; ts: number }>();

app.get('/api/catalog/youtube', async (req, res) => {
  const q = String(req.query.q || '').trim() || 'trailers peliculas 2025 hd';
  const cached = ytSearchCache.get(q.toLowerCase());
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return res.json({ success: true, videos: cached.videos });
  }

  try {
    // Also support direct YouTube URL pasted into the YouTube search bar!
    const directId = parseYouTubeVideoId(q);
    if (directId) {
      return res.json({
        success: true,
        videos: [
          {
            id: `yt-${directId}`,
            videoId: directId,
            title: 'Vídeo de YouTube Directo',
            channel: 'YouTube',
            duration: 'HD',
            views: '',
            thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${directId}`,
          },
        ],
      });
    }

    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
      {
        headers: {
          'User-Agent': CHROME_UA,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!ytRes.ok) return res.json({ success: true, videos: [] });

    const html = await ytRes.text();
    const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
    if (!initMatch) return res.json({ success: true, videos: [] });

    const data = JSON.parse(initMatch[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const videos: any[] = [];
    for (const sec of sections) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr?.videoId) continue;
        const title = vr.title?.runs?.map((r: any) => r.text).join('') || 'YouTube Video';
        const channel =
          vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube';
        const duration = vr.lengthText?.simpleText || 'LIVE';
        const views = vr.shortViewCountText?.simpleText || vr.viewCountText?.simpleText || '';
        videos.push({
          id: `yt-${vr.videoId}`,
          videoId: vr.videoId,
          title,
          channel,
          duration,
          views,
          thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${vr.videoId}`,
        });
        if (videos.length >= 18) break;
      }
      if (videos.length >= 18) break;
    }

    ytSearchCache.set(q.toLowerCase(), { videos, ts: Date.now() });
    res.json({ success: true, videos });
  } catch (err) {
    console.warn('YouTube search error:', err);
    res.json({ success: true, videos: [] });
  }
});

// ============================================================================
// REST API: LIVE SPORTS AGENDA (REAL-TIME ROJADIRECTA SCRAPER + 24/7 MULTIPLEX)
// ============================================================================
let cachedSportsSchedule: { matches: any[]; ts: number } | null = null;

function getPermanent247SportsMatches() {
  return [
    {
      id: 'mux-laliga',
      title: 'Multiplex LaLiga EA Sports · Señal Oficial 24/7',
      competition: 'Fútbol en Directo',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-laliga-1',
          label: 'Movistar LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-2',
          label: 'Fútbol Directo 2',
          lang: 'LAT',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/winsports.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-3',
          label: 'DAZN LaLiga',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/dazn-laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-4',
          label: 'DAZN 1',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: 'https://footunder.online/tvtodo/dazn1.php',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-f1-motor',
      title: 'DAZN F1 & Motorsport · Circuito Mundial 24/7',
      competition: 'Fórmula 1 · MotoGP',
      sport: 'motor',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-f1-1',
          label: 'DAZN F1 Castellano',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/daznf1.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-2',
          label: 'DAZN 1 Motor',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/dazn1.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-3',
          label: 'DAZN 2',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: 'https://footunder.online/tvtodo/dazn2.php',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-champions',
      title: 'UEFA Champions & Fútbol Internacional · Directo',
      competition: 'Fútbol Europeo & Sudamericano',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-ucl-1',
          label: 'Señal Fútbol 1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/winsports.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-ucl-2',
          label: 'Movistar Fútbol',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-ucl-3',
          label: 'ESPN Internacional',
          lang: 'LAT',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/espn.php',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-nba-tennis',
      title: 'NBA, Euroliga & Polideportivo · Arena 24/7',
      competition: 'Baloncesto · Motor · Tenis',
      sport: 'basketball',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-nba-1',
          label: 'Arena HD 1',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/daznf1.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-2',
          label: 'ESPN Arena',
          lang: 'LAT',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/espn.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-3',
          label: 'DAZN 2',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: 'https://footunder.online/tvtodo/dazn2.php',
          resolverType: 'sports_channel',
        },
      ],
    },
  ];
}

function detectSportKind(text: string): 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' {
  const lower = text.toLowerCase();
  if (/baloncesto|basket|nba|eurocup|euroliga|acb|ncaa/.test(lower)) return 'basketball';
  if (/tenis|tennis|atp|wta|roland|wimbledon/.test(lower)) return 'tennis';
  if (/f1|formula|fórmula|motogp|motor|nascar|rally|indy/.test(lower)) return 'motor';
  return 'soccer';
}

app.get('/api/catalog/sports', async (_req, res) => {
  if (cachedSportsSchedule && Date.now() - cachedSportsSchedule.ts < 2 * 60 * 1000) {
    return res.json({ success: true, events: cachedSportsSchedule.matches });
  }

  const permanentChannels = getPermanent247SportsMatches();
  const liveGrouped = new Map<string, any>();

  try {
    const agendaHtml = await fetch('https://www.rojadirectv.live/', {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(4500),
    }).then((r) => (r.ok ? r.text() : ''));

    const rowRegex =
      /<tr>\s*<td><span class="t">([^<]+)<\/span><\/td>[\s\S]*?<td align="left">([\s\S]*?)<\/td>\s*<\/tr>/gi;

    for (const rowMatch of agendaHtml.matchAll(rowRegex)) {
      const timeStr = rowMatch[1].trim();
      const cellHtml = rowMatch[2];

      const titleMatch = cellHtml.match(/<b>([^<]+)<\/b>/i);
      const compPrefix = cellHtml
        .split('<a')[0]
        .replace(/<[^>]+>/g, '')
        .replace(/:\s*$/, '')
        .trim();
      const b64Links = [
        ...cellHtml.matchAll(/\?r=([A-Za-z0-9+/=]+)"[^>]*class="btn-canal"[^>]*>([^<]+)</gi),
      ];

      if (!titleMatch || b64Links.length === 0) continue;
      const matchTitle = titleMatch[1].trim();
      const key = `${timeStr}-${matchTitle}`;

      if (!liveGrouped.has(key)) {
        liveGrouped.set(key, {
          id: `live-${Buffer.from(key).toString('base64url').slice(0, 14)}`,
          title: matchTitle,
          competition: compPrefix || 'Agenda en Directo',
          sport: detectSportKind(`${compPrefix} ${matchTitle}`),
          time: timeStr,
          isLive: true,
          is247Channel: false,
          channels: [],
        });
      }

      const entry = liveGrouped.get(key);
      for (const link of b64Links) {
        try {
          const decodedChannelUrl = Buffer.from(link[1], 'base64').toString('utf8').trim();
          if (!decodedChannelUrl.startsWith('http')) continue;
          if (entry.channels.some((c: any) => c.sourceUrl === decodedChannelUrl)) continue;
          entry.channels.push({
            id: `live-ch-${entry.channels.length + 1}`,
            label: link[2].trim() || `Señal ${entry.channels.length + 1}`,
            lang: 'LIVE',
            quality: 'HD',
            sourceUrl: decodedChannelUrl,
            resolverType: 'sports_channel',
          });
        } catch {
          // skip malformed base64
        }
      }
    }
  } catch (err) {
    console.warn('RojaDirecta live scrape fallback to 24/7 channels:', err);
  }

  const scrapedEvents = Array.from(liveGrouped.values()).slice(0, 28);
  const combined = [...permanentChannels, ...scrapedEvents];
  cachedSportsSchedule = { matches: combined, ts: Date.now() };

  res.json({ success: true, events: combined });
});

// ============================================================================
// REST API: UNIVERSAL STREAM DECOMPILER (/api/extract/stream)
// ============================================================================
function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  return m ? m[1] : null;
}

async function resolveTmdbIdByTitle(title: string, mediaType: 'movie' | 'tv'): Promise<number | null> {
  try {
    const clean = title.replace(/\s*\([^)]*\)/g, '').trim();
    if (!clean) return null;
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(clean)}&page=1`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.results?.[0]?.id || null;
  } catch {
    return null;
  }
}

app.get('/api/extract/stream', async (req, res) => {
  const rawInput = String(req.query.url || '').trim();
  const resolverType = String(req.query.resolverType || '').trim();
  const preferLang = String(req.query.preferLang || 'ES').toUpperCase();
  const titleHint = String(req.query.title || '').trim();
  const mediaTypeParam = String(req.query.mediaType || '').toLowerCase();
  const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
  const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
  const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;

  if (!rawInput && !titleHint && !tmdbIdParam) {
    return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
  }

  const cacheKey = `${mediaTypeParam}|${tmdbIdParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${rawInput}|${titleHint}`;
  const cached = extractionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached);
  }

  try {
    // CASE 1A: Direct Vidhide / Embed69 Spanish/Latino/VOSE track switch
    if (resolverType === 'vidhide_hls') {
      const unpacked = await unpackVidhideToHls(rawInput);
      if (!unpacked) {
        return res.status(404).json({ success: false, error: 'La pista seleccionada no está activa.' });
      }
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: unpacked.proxyUrl,
        rawStreamUrl: unpacked.rawM3u8,
        expiresAt: Date.now() + 12 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 1B: Legacy Movidy base64 track (`nupload.my`)
    if (resolverType === 'movidy_embed' || rawInput.includes('nupload.')) {
      const decoded = await decodeNuploadToHls(rawInput);
      if (decoded) {
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: decoded.proxyUrl,
          rawStreamUrl: decoded.rawM3u8,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(result);
      }
    }

    // CASE 2: YouTube URL
    const ytId = parseYouTubeVideoId(rawInput);
    if (ytId) {
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'youtube',
        streamUrl: ytId,
        youtubeId: ytId,
        title: titleHint || 'YouTube Video',
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 3: Direct .m3u8 or .mp4 URL
    if (/\.m3u8(\?|$)/i.test(rawInput)) {
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: buildHlsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    if (/\.(mp4|webm)(\?|$)/i.test(rawInput)) {
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'direct',
        streamUrl: buildTsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 4: UNIFIED MOVIE & TV SERIES MULTI-ENGINE (EMBED69 ES/LAT/VOSE + BINGETRIX EN 1080P)
    const bingetrixTvMatch = rawInput.match(/bingetrix\.[a-z]+\/watch\/tv\/(\d+)\/(\d+)\/(\d+)/i);
    const bingetrixMovieMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch|movie)\/(\d+)/i);
    const isMovidyLink = rawInput.includes('movidy.pw/ver/');

    const isCatalogMediaRequest =
      mediaTypeParam === 'movie' ||
      mediaTypeParam === 'tv' ||
      Boolean(tmdbIdParam) ||
      Boolean(bingetrixTvMatch) ||
      Boolean(bingetrixMovieMatch) ||
      isMovidyLink ||
      resolverType === 'bingetrix_en' ||
      (!rawInput && Boolean(titleHint));

    if (isCatalogMediaRequest && resolverType !== 'sports_channel') {
      const effectiveMediaType: 'movie' | 'tv' =
        mediaTypeParam === 'tv' || Boolean(bingetrixTvMatch) ? 'tv' : 'movie';

      const effectiveSeason = bingetrixTvMatch
        ? parseInt(bingetrixTvMatch[2], 10)
        : seasonParam || 1;
      const effectiveEpisode = bingetrixTvMatch
        ? parseInt(bingetrixTvMatch[3], 10)
        : episodeParam || 1;

      let resolvedTmdbId: string | number | null =
        tmdbIdParam ||
        (bingetrixTvMatch ? bingetrixTvMatch[1] : null) ||
        (bingetrixMovieMatch ? bingetrixMovieMatch[1] : null);

      if (!resolvedTmdbId && titleHint) {
        resolvedTmdbId = await resolveTmdbIdByTitle(titleHint, effectiveMediaType);
      }

      if (!resolvedTmdbId && isMovidyLink) {
        const slug = rawInput.split('/ver/')[1]?.replace(/\//g, '').replace(/-/g, ' ') || '';
        if (slug) {
          resolvedTmdbId = await resolveTmdbIdByTitle(slug, 'movie');
        }
      }

      if (resolvedTmdbId) {
        const [esTracks, enTracks] = await Promise.all([
          extractEmbed69SpanishTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          }),
          extractBingetrixEnglishTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          }),
        ]);

        const orderedTracks: TrackRecord[] =
          preferLang === 'EN' ? [...enTracks, ...esTracks] : [...esTracks, ...enTracks];

        // Resolve the first available track that produces a valid proxied HLS stream!
        let primaryStreamUrl = '';
        for (let i = 0; i < orderedTracks.length; i++) {
          const candidate = orderedTracks[i];
          if (candidate.resolvedStreamUrl) {
            primaryStreamUrl = candidate.resolvedStreamUrl;
            break;
          }
          if (candidate.resolverType === 'vidhide_hls') {
            const unpacked = await unpackVidhideToHls(candidate.sourceUrl);
            if (unpacked) {
              orderedTracks[i] = { ...candidate, resolvedStreamUrl: unpacked.proxyUrl };
              primaryStreamUrl = unpacked.proxyUrl;
              break;
            }
          }
        }

        if (primaryStreamUrl) {
          const result: ExtractedStreamResult = {
            success: true,
            mode: 'hls',
            streamUrl: primaryStreamUrl,
            title: titleHint || 'NAIMCINE HD',
            tracks: orderedTracks,
            expiresAt: Date.now() + 8 * 60 * 1000,
          };
          extractionCache.set(cacheKey, result);
          return res.json(result);
        }
      }
    }

    // CASE 5: Live Sports Channel (`footunder.online`, `tilinhd`, etc.) -> Pure Crypto Direct (<350ms) + Safe Headless Fallback
    if (rawInput) {
      const fullTargetUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const directSports = await extractLiveSportsHlsDirect(fullTargetUrl);
      const sniffed = directSports || (await sniffStreamWithHeadless(fullTargetUrl));

      if (sniffed) {
        const proxiedUrl = sniffed.isDirectMp4
          ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
          : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);

        const result: ExtractedStreamResult = {
          success: true,
          mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
          streamUrl: proxiedUrl,
          rawStreamUrl: sniffed.streamUrl,
          referer: sniffed.referer,
          expiresAt: Date.now() + 10 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(result);
      }
    }

    return res.status(404).json({
      success: false,
      canUseCloudBrowser: true,
      error:
        'Esta fuente externa aún no tiene flujo HLS activo. Prueba otra pista o ábrela en el Cloud Browser sin anuncios.',
    });
  } catch (err) {
    console.error('Extract stream error:', err);
    return res.status(500).json({
      success: false,
      canUseCloudBrowser: true,
      error: 'Error temporal al extraer el flujo de vídeo.',
    });
  }
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toLowerCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ ...room, videoState: computeAuthoritativeVideoState(room) });
});

// ============================================================================
// VITE + PRODUCTION STATIC MOUNTING
// ============================================================================
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NAIMCINE Media Engine running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
