import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import ffmpegStatic from 'ffmpeg-static';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  CHROME_UA,
  curlGetBuffer,
  curlGetBufferWithStatus,
  curlGetText,
  curlPostJsonText,
  getPreferredUpstreamUa,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  resolveKnownUpstreamReferer,
  rewriteVidsrcBuzzM3u8,
  sanitizeEmbedHtml,
  sanitizeEmbedScript,
  shouldBypassNodeFetch,
  TDT_DVB_UA,
  unwrapRelaySegmentUrl,
} from '../extractors/httpHelpers.ts';
import { curlPlainGetText } from '../services/vestMirrorService.ts';

const FFMPEG_BIN: string = fs.existsSync('/usr/bin/ffmpeg')
  ? '/usr/bin/ffmpeg'
  : typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)
    ? ffmpegStatic
    : 'ffmpeg';

const vodHlsManifestCache = new LruTtlCache<string, string>(400, 10 * 60 * 1000);
const registeredVodManifestCache = new LruTtlCache<string, string>(500, 18 * 60 * 1000);

export function registerVodManifest(m3u8Content: string): string {
  const id = crypto.createHash('sha1').update(m3u8Content).digest('hex').slice(0, 18);
  registeredVodManifestCache.set(id, m3u8Content);
  return `/api/vod-manifest/${id}.m3u8`;
}
const dvbAacSegmentCache = new LruTtlCache<string, { promise: Promise<Buffer>; ts: number }>(
  80,
  80_000
);

interface RollingDvbSeg {
  seq: number;
  extinf: string;
  absUrl: string;
  proxiedUrl: string;
  ts: number;
}
const dvbRollingPlaylistMap = new LruTtlCache<string, RollingDvbSeg[]>(45, 90_000);

interface DvbTranscodeTask {
  run: () => void;
  highPriority: boolean;
}
let activeDvbTranscodes = 0;
const MAX_CONCURRENT_DVB_TRANSCODES = 2;
const dvbTranscodeQueue: DvbTranscodeTask[] = [];

function scheduleDvbTranscode<T>(fn: () => Promise<T>, highPriority: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const execTask = () => {
      activeDvbTranscodes++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeDvbTranscodes = Math.max(0, activeDvbTranscodes - 1);
          const next = dvbTranscodeQueue.shift();
          if (next) next.run();
        });
    };
    if (activeDvbTranscodes < MAX_CONCURRENT_DVB_TRANSCODES) {
      execTask();
    } else if (highPriority) {
      let insertIdx = 0;
      while (insertIdx < dvbTranscodeQueue.length && dvbTranscodeQueue[insertIdx].highPriority) {
        insertIdx++;
      }
      dvbTranscodeQueue.splice(insertIdx, 0, { run: execTask, highPriority: true });
    } else {
      dvbTranscodeQueue.push({ run: execTask, highPriority: false });
    }
  });
}

function getOrCreateRequestId(req: express.Request): string {
  const existing = String(req.headers['x-naim-request-id'] || '').trim();
  if (existing && existing.length <= 64) return existing;
  return crypto.randomUUID();
}

function applyProxyCorsHeaders(res: express.Response, reqId: string): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Content-Type, Accept-Ranges, X-Naim-Request-Id'
  );
  res.setHeader('X-Naim-Request-Id', reqId);
}

export function findDisguisedTsOffset(buf: Buffer): number {
  if (!buf || buf.length < 380) return 0;
  // Already starts with MPEG-TS sync byte pattern
  if (buf[0] === 0x47 && buf[188] === 0x47) return 0;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isBmp = buf[0] === 0x42 && buf[1] === 0x4d;
  if (!isPng && !isGif && !isJpg && !isBmp) return 0;

  const limit = Math.min(buf.length - 376, 4096);
  for (let i = 4; i < limit; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) {
      return i;
    }
  }
  return 0;
}

export function remuxDvbTsToAac(
  segmentUrl: string,
  referer: string,
  highPriority = false
): Promise<Buffer> {
  const now = Date.now();
  const cached = dvbAacSegmentCache.get(segmentUrl);
  if (cached && now - cached.ts < 75_000) {
    return cached.promise;
  }

  const jobPromise = (async (): Promise<Buffer> => {
    const segHeaders: Record<string, string> = {
      'User-Agent': getPreferredUpstreamUa(segmentUrl),
      Accept: '*/*',
    };
    if (referer) {
      segHeaders['Referer'] = referer;
    }

    let rawBuf: Buffer | null = null;
    try {
      const resp = await streamingFetch(segmentUrl, {
        headers: segHeaders,
        timeoutMs: 5000,
      });
      if (resp.ok) {
        rawBuf = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
      // fallback to curl
    }

    if (!rawBuf || rawBuf.length === 0) {
      rawBuf = await curlGetBuffer(segmentUrl, segHeaders, 7);
    }
    if (!rawBuf || rawBuf.length === 0) {
      throw new Error('Empty DVB TS segment');
    }

    return await scheduleDvbTranscode(
      () =>
        new Promise<Buffer>((resolve) => {
          const ff = spawn(FFMPEG_BIN, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-fflags',
            '+genpts+discardcorrupt',
            '-flags2',
            '+showall',
            '-threads',
            '2',
            '-f',
            'mpegts',
            '-i',
            'pipe:0',
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-vf',
            'field=top,scale=960:540:flags=fast_bilinear,setsar=1:1',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-tune',
            'zerolatency',
            '-profile:v',
            'main',
            '-level',
            '3.1',
            '-pix_fmt',
            'yuv420p',
            '-bf',
            '0',
            '-g',
            '50',
            '-crf',
            '24',
            '-maxrate',
            '1600k',
            '-bufsize',
            '3200k',
            '-c:a',
            'aac',
            '-ac',
            '2',
            '-ar',
            '48000',
            '-b:a',
            '112k',
            '-copyts',
            '-muxdelay',
            '0',
            '-muxpreload',
            '0',
            '-f',
            'mpegts',
            'pipe:1',
          ]);

          const outChunks: Buffer[] = [];
          const safetyTimer = setTimeout(() => {
            try {
              ff.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, 6000);

          ff.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk));
          ff.on('error', () => {
            clearTimeout(safetyTimer);
            resolve(rawBuf!);
          });
          ff.on('close', (code) => {
            clearTimeout(safetyTimer);
            const remuxed = Buffer.concat(outChunks);
            if (code === 0 && remuxed.length > 512) {
              resolve(remuxed);
            } else {
              resolve(rawBuf!);
            }
          });

          ff.stdin.on('error', () => {});
          ff.stdin.end(rawBuf);
        }),
      highPriority
    );
  })();

  jobPromise.catch(() => {
    dvbAacSegmentCache.delete(segmentUrl);
  });

  dvbAacSegmentCache.set(segmentUrl, { promise: jobPromise, ts: now });
  return jobPromise;
}

interface LiveDvbRelaySession {
  key: string;
  upstreamUrl: string;
  dir: string;
  proc: ReturnType<typeof spawn>;
  startedAt: number;
  lastAccessAt: number;
  readyPromise: Promise<boolean>;
  dead: boolean;
}

const DVB_LIVE_ROOT = '/tmp/naim-dvb-live';
const liveDvbSessions = new Map<string, LiveDvbRelaySession>();

function destroyLiveDvbSession(key: string): void {
  const sess = liveDvbSessions.get(key);
  if (!sess) return;
  sess.dead = true;
  liveDvbSessions.delete(key);
  try {
    sess.proc.kill('SIGKILL');
  } catch {
    // ignore
  }
  try {
    fs.rmSync(sess.dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, sess] of liveDvbSessions.entries()) {
    if (sess.dead || now - sess.lastAccessAt > 45_000) {
      destroyLiveDvbSession(key);
    }
  }
}, 12_000).unref();

export async function ensureLiveDvbCleanHlsSession(
  rawUpstreamUrl: string,
  profile: 'hd' | 'fast' = 'hd'
): Promise<string | null> {
  const cleanUpstream = rawUpstreamUrl.replace(/[?&]profile=(hd|fast)\b/gi, '');
  const hash = crypto
    .createHash('sha1')
    .update(`${cleanUpstream}|${profile}`)
    .digest('hex')
    .slice(0, 14);
  const sessionKey = `dvb_${profile}_${hash}`;

  const existing = liveDvbSessions.get(sessionKey);
  if (existing && !existing.dead) {
    existing.lastAccessAt = Date.now();
    const ok = await existing.readyPromise;
    if (ok && fs.existsSync(path.join(existing.dir, 'index.m3u8'))) {
      return `/api/dvb-live/${sessionKey}/index.m3u8`;
    }
    destroyLiveDvbSession(sessionKey);
  }

  if (liveDvbSessions.size >= 4) {
    let oldestKey = '';
    let oldestAccess = Infinity;
    for (const [k, s] of liveDvbSessions.entries()) {
      if (s.lastAccessAt < oldestAccess) {
        oldestAccess = s.lastAccessAt;
        oldestKey = k;
      }
    }
    if (oldestKey) destroyLiveDvbSession(oldestKey);
  }

  const sessionDir = path.join(DVB_LIVE_ROOT, sessionKey);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch {
    return null;
  }

  const playlistPath = path.join(sessionDir, 'index.m3u8');
  const segmentPattern = path.join(sessionDir, 'seg_%05d.ts');
  const vfFilter =
    profile === 'fast'
      ? 'field=top,scale=960:540:flags=fast_bilinear'
      : 'field=top,scale=1280:720:flags=fast_bilinear';

  const proc = spawn(FFMPEG_BIN, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-user_agent',
    TDT_DVB_UA,
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-live_start_index',
    '-3',
    '-fflags',
    '+genpts+discardcorrupt',
    '-flags2',
    '+showall',
    '-threads',
    '3',
    '-i',
    cleanUpstream,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    vfFilter,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-profile:v',
    'main',
    '-level',
    '3.1',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '25',
    '-g',
    '50',
    '-keyint_min',
    '50',
    '-sc_threshold',
    '0',
    '-bf',
    '0',
    '-crf',
    profile === 'fast' ? '25' : '23',
    '-maxrate',
    profile === 'fast' ? '1800k' : '3000k',
    '-bufsize',
    profile === 'fast' ? '3600k' : '6000k',
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-b:a',
    '128k',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_list_size',
    '8',
    '-hls_flags',
    'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename',
    segmentPattern,
    playlistPath,
  ]);

  const session: LiveDvbRelaySession = {
    key: sessionKey,
    upstreamUrl: cleanUpstream,
    dir: sessionDir,
    proc,
    startedAt: Date.now(),
    lastAccessAt: Date.now(),
    dead: false,
    readyPromise: Promise.resolve(false),
  };

  proc.on('exit', () => {
    session.dead = true;
  });
  proc.on('error', () => {
    session.dead = true;
  });

  session.readyPromise = new Promise<boolean>((resolve) => {
    const deadline = Date.now() + 9000;
    const poll = setInterval(() => {
      if (session.dead) {
        clearInterval(poll);
        resolve(false);
        return;
      }
      try {
        if (fs.existsSync(playlistPath)) {
          const content = fs.readFileSync(playlistPath, 'utf8');
          const segMatches = content.match(/seg_\d+\.ts/g);
          if (segMatches && segMatches.length >= 2) {
            clearInterval(poll);
            resolve(true);
            return;
          }
        }
      } catch {
        // wait next tick
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        destroyLiveDvbSession(sessionKey);
        resolve(false);
      }
    }, 120);
  });

  liveDvbSessions.set(sessionKey, session);
  const ready = await session.readyPromise;
  return ready ? `/api/dvb-live/${sessionKey}/index.m3u8` : null;
}

export interface RegisterProxyRoutesDeps {
  getPublicOrigin: (req: express.Request) => string;
}

export function registerProxyRoutes(app: express.Express, deps: RegisterProxyRoutesDeps): void {
  const { getPublicOrigin } = deps;

  app.get('/api/img-proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const reqId = getOrCreateRequestId(req);
    if (!rawUrl) return res.status(400).end();

    try {
      const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
      await assertSafeProxyUrl(fullUrl);
      const upstream = await streamingFetch(fullUrl, {
        headers: {
          Referer: 'https://movidy.pw/',
          'User-Agent': CHROME_UA,
        },
        timeoutMs: 6000,
      });
      if (!upstream.ok || !upstream.body) return res.status(404).end();

      res.setHeader('X-Naim-Request-Id', reqId);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      Readable.fromWeb(upstream.body as never).pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.options(
    [
      '/api/dvb-live/:sessionKey/:filename',
      '/api/vod-manifest/:filename',
      '/api/embed-proxy',
      '/api/embed-fetch',
      '/api/hls-proxy',
      '/api/hls-proxy/:filename',
      '/api/ts-proxy',
      '/api/ts-proxy/:filename',
      '/naim-cine.m3u',
      '/NAIM-CINE-Samsung-TV.m3u',
      '/iptv.m3u',
      '/naim-cine.m3u8',
      '/api/iptv/playlist.m3u',
      '/api/iptv/live/:channelId',
      '/api/iptv/logo/:channelId',
      '/epg.xml',
      '/api/iptv/epg.xml',
    ],
    (req, res) => {
      applyProxyCorsHeaders(res, getOrCreateRequestId(req));
      res.status(204).end();
    }
  );

  const handleVodManifest = (req: express.Request, res: express.Response) => {
    const reqId = getOrCreateRequestId(req);
    const id = String(req.params.filename || '')
      .replace(/\.m3u8$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const rawManifest = id ? registeredVodManifestCache.get(id) : undefined;
    if (!rawManifest) {
      return res.status(404).send('VOD manifest expired');
    }
    const useAbs = req.query.abs === '1';
    const originPrefix = useAbs ? getPublicOrigin(req) : '';
    const out = originPrefix
      ? rawManifest
          .replace(/(^|\n)(\/api\/(?:ts-proxy|hls-proxy|vod-manifest)\/[^\n]+)/g, `$1${originPrefix}$2`)
      : rawManifest;
    applyProxyCorsHeaders(res, reqId);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Length', String(Buffer.byteLength(out)));
    if (req.method === 'HEAD') return res.status(200).end();
    return res.send(out);
  };

  app.get('/api/vod-manifest/:filename', handleVodManifest);
  app.head('/api/vod-manifest/:filename', handleVodManifest);

  app.get('/api/embed-proxy', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '').trim();
    const explicitReferer = String(req.query.referer || '').trim();
    if (!targetUrl) return res.status(400).send('Missing url');
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send('Forbidden target host');
    }

    try {
      const parsedTarget = new URL(targetUrl);
      const defaultReferer = /(\.|^)videm\.buzz$/i.test(parsedTarget.hostname)
        ? 'https://vidsrc.buzz/'
        : parsedTarget.origin + '/';
      const headers: Record<string, string> = {
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: explicitReferer || defaultReferer,
      };
      let html = '';
      let effectiveUrl = targetUrl;
      try {
        const upstream = await streamingFetch(targetUrl, { headers, timeoutMs: 5500 });
        if (upstream.ok) {
          effectiveUrl = upstream.url || targetUrl;
          html = await upstream.text();
        }
      } catch {
        // fallback to curl
      }
      if (!html) {
        const fb = await curlGetText(targetUrl, headers, 6, true).catch(() => ({
          text: '',
          effectiveUrl: targetUrl,
        }));
        html = fb.text || '';
        effectiveUrl = fb.effectiveUrl || targetUrl;
      }
      if (!html || !/<html|<body|<iframe|<video|var\s+Q/i.test(html)) {
        return res.status(502).send('Upstream embed unavailable');
      }

      const cleanHtml = sanitizeEmbedHtml(html, effectiveUrl);
      res.setHeader('X-Naim-Request-Id', reqId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.removeHeader('X-Frame-Options');
      return res.status(200).send(cleanHtml);
    } catch {
      return res.status(502).send('Embed proxy failed');
    }
  });

  app.get('/api/embed-script', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '').trim();
    const explicitReferer = String(req.query.referer || '').trim();
    if (!targetUrl) return res.status(400).send('Missing url');
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send('Forbidden target host');
    }

    try {
      const parsedTarget = new URL(targetUrl);
      const headers: Record<string, string> = {
        'User-Agent': CHROME_UA,
        Accept: '*/*',
        Referer: explicitReferer || `${parsedTarget.origin}/`,
      };
      let jsCode = '';
      let effectiveUrl = targetUrl;
      try {
        const up = await streamingFetch(targetUrl, { headers, timeoutMs: 6500 });
        if (up.ok) {
          effectiveUrl = up.url || targetUrl;
          jsCode = await up.text();
        }
      } catch {
        // fallback to curl
      }
      if (!jsCode) {
        const fb = await curlGetText(targetUrl, headers, 7, true).catch(() => ({
          text: '',
          effectiveUrl: targetUrl,
        }));
        jsCode = fb.text || '';
        effectiveUrl = fb.effectiveUrl || targetUrl;
      }
      if (!jsCode) {
        return res.status(502).send('// Upstream script unavailable');
      }
      const cleanJs = sanitizeEmbedScript(jsCode, effectiveUrl);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.status(200).send(cleanJs);
    } catch {
      return res.status(502).send('// Embed script proxy failed');
    }
  });

  app.all(
    '/api/embed-fetch',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req, res) => {
      const reqId = getOrCreateRequestId(req);
      if (req.method === 'OPTIONS') {
        applyProxyCorsHeaders(res, reqId);
        return res.status(204).end();
      }

      const targetUrl = String(req.query.url || '').trim();
      const explicitReferer = String(req.query.referer || '').trim();
      if (!targetUrl) return res.status(400).send('Missing url');
      try {
        await assertSafeProxyUrl(targetUrl);
      } catch {
        return res.status(403).send('Forbidden target host');
      }

      try {
        const parsedTarget = new URL(targetUrl);
        const refererHeader =
          explicitReferer ||
          (/(\.|^)videm\.buzz$/i.test(parsedTarget.hostname)
            ? 'https://vidsrc.buzz/'
            : parsedTarget.origin + '/');
        let originHeader = parsedTarget.origin;
        try {
          originHeader = new URL(refererHeader).origin;
        } catch {
          // keep parsedTarget.origin
        }

        const forwardedPlayerHeaders: Record<string, string> = {};
        for (const hName of ['x-requested-with', 'x-csrf-token', 'x-csrf', 'x-token']) {
          const val = req.headers[hName];
          if (typeof val === 'string' && val.trim()) {
            forwardedPlayerHeaders[hName] = val.trim();
          }
        }

        if (req.method === 'POST') {
          const rawBody = Buffer.isBuffer(req.body)
            ? req.body.toString('utf8')
            : typeof req.body === 'string'
              ? req.body
              : req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
                ? JSON.stringify(req.body)
                : '';
          const postHeaders: Record<string, string> = {
            'User-Agent': CHROME_UA,
            Accept: 'application/json, text/plain, */*',
            Referer: refererHeader,
            Origin: originHeader,
            ...forwardedPlayerHeaders,
          };
          if (req.headers['content-type']) {
            postHeaders['Content-Type'] = String(req.headers['content-type']);
          }
          let status = 200;
          let respText = '';
          let respCt = 'application/json; charset=utf-8';
          try {
            const up = await streamingFetch(targetUrl, {
              method: 'POST',
              headers: postHeaders,
              body: rawBody || undefined,
              timeoutMs: 6500,
            });
            status = up.status;
            respCt = up.headers.get('content-type') || respCt;
            respText = await up.text();
          } catch {
            let parsedPayload: unknown = rawBody;
            try {
              parsedPayload = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              // keep raw string if not JSON
            }
            respText = await curlPostJsonText(targetUrl, parsedPayload, postHeaders, 6).catch(
              () => ''
            );
          }
          applyProxyCorsHeaders(res, reqId);
          res.setHeader('Content-Type', respCt);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(status >= 200 && status < 500 ? status : 502).send(respText);
        }

        const getHeaders: Record<string, string> = {
          'User-Agent': CHROME_UA,
          Accept: '*/*',
          Referer: refererHeader,
        };

        let bodyBuf: Buffer = Buffer.alloc(0);
        let upstreamStatus = 0;
        let effectiveUrl = targetUrl;
        let upstreamCt = '';

        try {
          const up = await streamingFetch(targetUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: getHeaders,
            timeoutMs: 6500,
          });
          upstreamStatus = up.status;
          effectiveUrl = up.url || targetUrl;
          upstreamCt = up.headers.get('content-type') || '';
          if (up.ok && req.method !== 'HEAD') {
            bodyBuf = Buffer.from(await up.arrayBuffer());
          }
        } catch {
          // fallback to curl below
        }

        if (req.method === 'HEAD' && upstreamStatus >= 200 && upstreamStatus < 400) {
          applyProxyCorsHeaders(res, reqId);
          if (upstreamCt) res.setHeader('Content-Type', upstreamCt);
          return res.status(upstreamStatus).end();
        }

        if (!bodyBuf.length && req.method !== 'HEAD') {
          const fb = await curlGetBufferWithStatus(targetUrl, getHeaders, 7).catch(() => ({
            buf: Buffer.alloc(0),
            status: 502,
          }));
          if (fb.buf.length > 0 && fb.status >= 200 && fb.status < 400) {
            bodyBuf = fb.buf;
            upstreamStatus = fb.status;
          } else {
            const txtFb = await curlGetText(targetUrl, getHeaders, 7, true).catch(() => ({
              text: '',
              effectiveUrl: targetUrl,
            }));
            if (txtFb.text) {
              bodyBuf = Buffer.from(txtFb.text, 'utf8');
              effectiveUrl = txtFb.effectiveUrl || targetUrl;
              upstreamStatus = 200;
            }
          }
        }

        if (!bodyBuf.length) {
          applyProxyCorsHeaders(res, reqId);
          return res.status(upstreamStatus >= 400 ? upstreamStatus : 502).send('Upstream error');
        }

        const headSnippet = bodyBuf.subarray(0, 512).toString('utf8');
        if (headSnippet.includes('#EXTM3U')) {
          const manifestText = bodyBuf.toString('utf8');
          const { rewritten } = rewriteVidsrcBuzzM3u8(
            manifestText,
            effectiveUrl,
            originHeader + '/'
          );
          applyProxyCorsHeaders(res, reqId);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.status(200).send(rewritten);
        }

        applyProxyCorsHeaders(res, reqId);
        const trimmedHead = headSnippet.trimStart();
        const inferredCt =
          upstreamCt ||
          (trimmedHead.startsWith('{') || trimmedHead.startsWith('[')
            ? 'application/json; charset=utf-8'
            : trimmedHead.startsWith('WEBVTT')
              ? 'text/vtt; charset=utf-8'
              : 'text/plain; charset=utf-8');
        res.setHeader('Content-Type', inferredCt);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(bodyBuf);
      } catch {
        return res.status(502).send('Embed fetch relay failed');
      }
    }
  );

  const handleDvbLive = (req: express.Request, res: express.Response) => {
    const reqId = getOrCreateRequestId(req);
    const sessionKey = String(req.params.sessionKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = String(req.params.filename || '').replace(/[^a-zA-Z0-9_.-]/g, '');
    const sess = liveDvbSessions.get(sessionKey);
    if (!sess || sess.dead || !filename) {
      return res.status(404).send('Live session expired');
    }
    sess.lastAccessAt = Date.now();
    const filePath = path.join(sess.dir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Segment not ready');
    }

    applyProxyCorsHeaders(res, reqId);
    if (filename.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=12');
    }
    if (req.method === 'HEAD') {
      try {
        const st = fs.statSync(filePath);
        res.setHeader('Content-Length', String(st.size));
      } catch {
        // ignore
      }
      return res.status(200).end();
    }
    return res.sendFile(filePath);
  };

  app.get('/api/dvb-live/:sessionKey/:filename', handleDvbLive);
  app.head('/api/dvb-live/:sessionKey/:filename', handleDvbLive);

  const handleHlsProxy = async (req: express.Request, res: express.Response) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '');
    const referer = resolveKnownUpstreamReferer(targetUrl, String(req.query.referer || ''));
    const forceAac = req.query.aac === '1' || isDvbHeadendStream(targetUrl);
    const useAbs = req.query.abs === '1';
    const originPrefix = useAbs ? getPublicOrigin(req) : '';
    const vodCacheKey = useAbs ? `${originPrefix}|${targetUrl}` : targetUrl;
    if (!targetUrl) return res.status(400).send('Missing url');
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send('Forbidden target host');
    }

    const cachedVod = !forceAac ? vodHlsManifestCache.get(vodCacheKey) : undefined;
    if (cachedVod) {
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Length', String(Buffer.byteLength(cachedVod)));
      if (req.method === 'HEAD') return res.status(200).end();
      return res.send(cachedVod);
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': getPreferredUpstreamUa(targetUrl),
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

      if (shouldBypassNodeFetch(targetUrl)) {
        let fallback = await curlGetText(targetUrl, headers, 7);
        if (!fallback.text || !fallback.text.includes('#EXTM3U')) {
          const plainTxt = await curlPlainGetText(targetUrl, 7).catch(() => '');
          if (plainTxt && plainTxt.includes('#EXTM3U')) {
            fallback = { text: plainTxt, effectiveUrl: targetUrl };
          } else {
            return res.status(502).send('Upstream HLS error');
          }
        }
        baseUrl = fallback.effectiveUrl || targetUrl;
        manifestText = fallback.text;
      } else {
        const hdrCtrl = new AbortController();
        const hdrTimer = setTimeout(() => hdrCtrl.abort(), 4800);
        try {
          const upstream = await streamingFetch(targetUrl, {
            headers,
            signal: hdrCtrl.signal,
            timeoutMs: 4800,
          });
          clearTimeout(hdrTimer);
          if (!upstream.ok) {
            throw new Error(`HTTP ${upstream.status}`);
          }
          baseUrl = upstream.url || targetUrl;
          manifestText = await upstream.text();
          if (!manifestText.includes('#EXTM3U') || /nosignal/i.test(manifestText)) {
            throw new Error('Not M3U8 or offline placeholder');
          }
        } catch {
          clearTimeout(hdrTimer);
          markHostNeedsCurlFallback(targetUrl);
          let fallback = await curlGetText(targetUrl, headers, 7);
          if (
            !fallback.text ||
            !fallback.text.includes('#EXTM3U') ||
            /nosignal/i.test(fallback.text)
          ) {
            const plainTxt = await curlPlainGetText(targetUrl, 7).catch(() => '');
            if (plainTxt && plainTxt.includes('#EXTM3U') && !/nosignal/i.test(plainTxt)) {
              fallback = { text: plainTxt, effectiveUrl: targetUrl };
            } else {
              return res.status(502).send('Upstream HLS error');
            }
          }
          baseUrl = fallback.effectiveUrl || targetUrl;
          manifestText = fallback.text;
        }
      }
      if (/nosignal/i.test(manifestText)) {
        return res.status(502).send('Upstream signal offline');
      }

      const effectiveReferer = referer || new URL(baseUrl).origin + '/';
      const lines = manifestText.split(/\r?\n/);
      let nextLineIsVariantPlaylist = false;
      const discoveredTsUrls: string[] = [];

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
                const unwrapped = unwrapRelaySegmentUrl(absUri, effectiveReferer);
                if (trimmed.startsWith('#EXT-X-MEDIA') || unwrapped.url.includes('.m3u8')) {
                  return `URI="${buildHlsProxyUrl(unwrapped.url, unwrapped.referer, forceAac, originPrefix)}"`;
                }
                return `URI="${buildTsProxyUrl(unwrapped.url, unwrapped.referer, forceAac, originPrefix)}"`;
              } catch {
                return _match;
              }
            });
          }
          return line;
        }

        try {
          const absUrl = new URL(trimmed, baseUrl).href;
          const unwrapped = unwrapRelaySegmentUrl(absUrl, effectiveReferer);
          const isPlaylist =
            nextLineIsVariantPlaylist ||
            (/\.m3u8(\?|$)/i.test(unwrapped.url) && !/relay\.videm\.buzz\/seg/i.test(absUrl)) ||
            unwrapped.url.includes('stream_tv=');
          nextLineIsVariantPlaylist = false;

          if (!isPlaylist && forceAac) {
            discoveredTsUrls.push(unwrapped.url);
          }

          return isPlaylist
            ? buildHlsProxyUrl(unwrapped.url, unwrapped.referer, forceAac, originPrefix)
            : buildTsProxyUrl(unwrapped.url, unwrapped.referer, forceAac, originPrefix);
        } catch {
          nextLineIsVariantPlaylist = false;
          return line;
        }
      });

      let finalManifest = rewritten.join('\n');
      if (forceAac && discoveredTsUrls.length > 0 && req.method !== 'HEAD') {
        for (const segUrl of discoveredTsUrls) {
          remuxDvbTsToAac(segUrl, effectiveReferer, false).catch(() => {});
        }

        if (isDvbHeadendStream(targetUrl) && !manifestText.includes('#EXT-X-STREAM-INF')) {
          const seqMatch = manifestText.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
          if (seqMatch) {
            const baseSeq = parseInt(seqMatch[1], 10);
            const nowMs = Date.now();
            const currentSegs: RollingDvbSeg[] = [];
            let pendingExtinf = '#EXTINF:2.500000,';
            let segOffset = 0;
            for (const rawLine of lines) {
              const t = rawLine.trim();
              if (!t) continue;
              if (t.startsWith('#EXTINF:')) {
                pendingExtinf = t;
              } else if (!t.startsWith('#')) {
                try {
                  const abs = new URL(t, baseUrl).href;
                  currentSegs.push({
                    seq: baseSeq + segOffset,
                    extinf: pendingExtinf,
                    absUrl: abs,
                    proxiedUrl: buildTsProxyUrl(abs, effectiveReferer, true, originPrefix),
                    ts: nowMs,
                  });
                  segOffset++;
                } catch {
                  // ignore
                }
              }
            }

            if (currentSegs.length > 0) {
              const dvbCacheKey = useAbs ? `${originPrefix}|${targetUrl}` : targetUrl;
              const prevHistory = dvbRollingPlaylistMap.get(dvbCacheKey) || [];
              const bySeq = new Map<number, RollingDvbSeg>();
              for (const oldSeg of prevHistory) {
                if (nowMs - oldSeg.ts < 65_000 && dvbAacSegmentCache.has(oldSeg.absUrl)) {
                  bySeq.set(oldSeg.seq, oldSeg);
                }
              }
              for (const curSeg of currentSegs) {
                bySeq.set(curSeg.seq, curSeg);
              }

              const maxSeq = currentSegs[currentSegs.length - 1].seq;
              const contiguous: RollingDvbSeg[] = [];
              for (let s = maxSeq; s > maxSeq - 11; s--) {
                const found = bySeq.get(s);
                if (!found) break;
                contiguous.unshift(found);
              }
              dvbRollingPlaylistMap.set(dvbCacheKey, contiguous);

              if (contiguous.length > currentSegs.length) {
                const targetDurMatch = manifestText.match(/#EXT-X-TARGETDURATION:(\d+)/i);
                const targetDur = targetDurMatch ? targetDurMatch[1] : '4';
                const headerLines = [
                  '#EXTM3U',
                  '#EXT-X-VERSION:3',
                  `#EXT-X-MEDIA-SEQUENCE:${contiguous[0].seq}`,
                  '#EXT-X-ALLOW-CACHE:YES',
                  `#EXT-X-TARGETDURATION:${targetDur}`,
                ];
                for (const seg of contiguous) {
                  headerLines.push(seg.extinf);
                  headerLines.push(seg.proxiedUrl);
                }
                finalManifest = headerLines.join('\n') + '\n';
              }
            }
          }
        }
      }

      if (
        !forceAac &&
        (manifestText.includes('#EXT-X-ENDLIST') ||
          manifestText.includes('#EXT-X-STREAM-INF') ||
          targetUrl.includes('ibra.lat'))
      ) {
        vodHlsManifestCache.set(vodCacheKey, finalManifest);
      }

      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Length', String(Buffer.byteLength(finalManifest)));
      if (req.method === 'HEAD') return res.status(200).end();
      res.send(finalManifest);
    } catch (err) {
      console.error('HLS proxy error:', err);
      res.status(502).send('HLS proxy fetch failed');
    }
  };

  app.get(['/api/hls-proxy', '/api/hls-proxy/:filename'], handleHlsProxy);
  app.head(['/api/hls-proxy', '/api/hls-proxy/:filename'], handleHlsProxy);

  const handleTsProxy = async (req: express.Request, res: express.Response) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '');
    const referer = resolveKnownUpstreamReferer(targetUrl, String(req.query.referer || ''));
    const forceAac = req.query.aac === '1' || isDvbHeadendStream(targetUrl);
    if (!targetUrl) return res.status(400).end();
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).end();
    }

    const isUrlMp4 =
      /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(targetUrl) ||
      /\/segs\/[^/]+\/init\./i.test(targetUrl);

    if (req.method === 'HEAD') {
      try {
        const headers: Record<string, string> = {
          'User-Agent': getPreferredUpstreamUa(targetUrl),
          Accept: '*/*',
        };
        if (referer) headers['Referer'] = referer;
        const upstream = await streamingFetch(targetUrl, {
          method: 'HEAD',
          headers,
          timeoutMs: 5000,
        });
        applyProxyCorsHeaders(res, reqId);
        res.status(upstream.status);
        res.setHeader('Content-Type', isUrlMp4 ? 'video/mp4' : 'video/mp2t');
        res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
        const cl = upstream.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);
        return res.end();
      } catch {
        applyProxyCorsHeaders(res, reqId);
        res.status(200);
        res.setHeader('Content-Type', isUrlMp4 ? 'video/mp4' : 'video/mp2t');
        res.setHeader('Accept-Ranges', 'bytes');
        return res.end();
      }
    }

    if (forceAac && !isUrlMp4) {
      try {
        const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer, true);
        if (req.destroyed || res.writableEnded) return;
        res.status(200);
        applyProxyCorsHeaders(res, reqId);
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Cache-Control', 'public, max-age=20');
        res.setHeader('Content-Length', String(remuxedBuf.length));
        return res.end(remuxedBuf);
      } catch {
        if (req.destroyed || res.writableEnded) return;
        return res.status(502).end();
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': getPreferredUpstreamUa(targetUrl),
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

    const rawRange = String(req.headers.range || '');
    const rangeMatch = rawRange.match(/^bytes=(\d+)-(\d*)$/i);
    // For iOS Safari & LG webOS initial Range: bytes=0-... probes on non-fMP4 TS segments,
    // defer truncating upstream bytes until we strip any disguised PNG/GIF/JPEG header bytes!
    const isInitialByteZeroRangeProbe =
      Boolean(rangeMatch && parseInt(rangeMatch[1], 10) === 0 && !isUrlMp4);

    if (req.headers.range && !isInitialByteZeroRangeProbe) {
      headers['Range'] = req.headers.range;
    }

    const hdrCtrl = new AbortController();
    const hdrTimer = setTimeout(() => hdrCtrl.abort(), 9000);
    req.on('close', () => {
      if (!res.writableEnded) hdrCtrl.abort();
    });

    try {
      if (shouldBypassNodeFetch(targetUrl)) {
        throw new Error('Use fast curl/h2 fallback');
      }
      let upstream = await streamingFetch(targetUrl, {
        headers,
        signal: hdrCtrl.signal,
        timeoutMs: 9000,
      });
      if (
        (upstream.status === 400 ||
          upstream.status === 401 ||
          upstream.status === 403 ||
          upstream.status === 406) &&
        headers['Origin']
      ) {
        const noOriginHeaders: Record<string, string> = { ...headers };
        delete noOriginHeaders['Origin'];
        const retryResp = await streamingFetch(targetUrl, {
          headers: noOriginHeaders,
          signal: hdrCtrl.signal,
          timeoutMs: 9000,
        }).catch(() => null);
        if (retryResp && retryResp.ok && retryResp.body) {
          upstream = retryResp;
        }
      } else if (upstream.status >= 500 || upstream.status === 429) {
        await new Promise((r) => setTimeout(r, 180));
        if (!hdrCtrl.signal.aborted) {
          const retryResp = await streamingFetch(targetUrl, {
            headers,
            signal: hdrCtrl.signal,
            timeoutMs: 9000,
          }).catch(() => null);
          if (retryResp && retryResp.ok && retryResp.body) {
            upstream = retryResp;
          }
        }
      }
      clearTimeout(hdrTimer);
      if (!upstream.ok || !upstream.body) {
        throw new Error(`TS upstream ${upstream.status}`);
      }

      const rawCt = (upstream.headers.get('content-type') || '').toLowerCase();
      const isDisguisedSegment =
        !rawCt ||
        rawCt.startsWith('text/html') ||
        rawCt.startsWith('text/plain') ||
        rawCt.startsWith('text/css') ||
        rawCt.startsWith('image/') ||
        rawCt.startsWith('font/') ||
        rawCt.includes('woff') ||
        rawCt.includes('javascript') ||
        rawCt.startsWith('application/octet-stream');

      // Always strip disguised image headers on !isUrlMp4 even on Safari/webOS Range: bytes=0-... probes!
      const shouldSniffImageHeader =
        !isUrlMp4 && isDisguisedSegment && (!req.headers.range || isInitialByteZeroRangeProbe);

      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      const ar = upstream.headers.get('accept-ranges');

      // When Safari sends Range: bytes=0-1 or bytes=0-65535 on a disguised TS segment, read & slice cleanly
      if (isInitialByteZeroRangeProbe && shouldSniffImageHeader && rangeMatch) {
        const fullBuf = Buffer.from(await upstream.arrayBuffer());
        const offset = findDisguisedTsOffset(fullBuf);
        const cleanBuf = offset > 0 ? fullBuf.subarray(offset) : fullBuf;
        const reqEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cleanBuf.length - 1;
        const end = Math.min(cleanBuf.length - 1, Math.max(0, reqEnd));
        const slice = cleanBuf.subarray(0, end + 1);
        applyProxyCorsHeaders(res, reqId);
        res.status(206);
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes 0-${end}/${cleanBuf.length}`);
        res.setHeader('Content-Length', String(slice.length));
        res.end(slice);
        return;
      }

      const writeCommonHeaders = (clAdjust = 0) => {
        res.status(upstream.status);
        applyProxyCorsHeaders(res, reqId);
        res.setHeader(
          'Content-Type',
          isDisguisedSegment ? (isUrlMp4 ? 'video/mp4' : 'video/mp2t') : rawCt
        );
        if (cl) {
          const numCl = Number(cl);
          if (Number.isFinite(numCl) && numCl > clAdjust) {
            res.setHeader('Content-Length', String(numCl - clAdjust));
          }
        }
        if (cr) res.setHeader('Content-Range', cr);
        if (ar) res.setHeader('Accept-Ranges', ar);
      };

      const nodeStream = Readable.fromWeb(upstream.body as never);
      let streamIdleTimer: ReturnType<typeof setTimeout> | null = null;
      const armIdleTimer = () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
        streamIdleTimer = setTimeout(() => {
          nodeStream.destroy();
        }, 20_000);
      };
      armIdleTimer();
      nodeStream.on('data', armIdleTimer);
      nodeStream.once('end', () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
      });
      nodeStream.once('close', () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
      });
      nodeStream.on('error', () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
        if (!res.headersSent) res.status(502);
        res.end();
      });
      req.on('close', () => {
        if (streamIdleTimer) clearTimeout(streamIdleTimer);
        nodeStream.destroy();
      });

      if (!shouldSniffImageHeader) {
        writeCommonHeaders(0);
        nodeStream.pipe(res);
        return;
      }

      let headerChecked = false;
      const probeChunks: Buffer[] = [];
      let probeLen = 0;

      const flushInitial = (ended: boolean) => {
        if (headerChecked) return;
        headerChecked = true;
        const headBuf = Buffer.concat(probeChunks);
        const offset = findDisguisedTsOffset(headBuf);
        writeCommonHeaders(offset);
        if (offset > 0) {
          res.write(headBuf.subarray(offset));
        } else if (headBuf.length > 0) {
          res.write(headBuf);
        }
        probeChunks.length = 0;
        if (ended) {
          res.end();
        }
      };

      nodeStream.on('data', (chunk: Buffer) => {
        if (!headerChecked) {
          const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          probeChunks.push(b);
          probeLen += b.length;
          if (probeLen >= 512) {
            flushInitial(false);
          }
        } else if (!res.writableEnded) {
          if (!res.write(chunk)) {
            nodeStream.pause();
            res.once('drain', () => nodeStream.resume());
          }
        }
      });
      nodeStream.once('end', () => {
        if (!headerChecked) {
          flushInitial(true);
        } else if (!res.writableEnded) {
          res.end();
        }
      });
    } catch (err) {
      clearTimeout(hdrTimer);
      if (req.destroyed || res.writableEnded) return;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.startsWith('TS upstream ') && !errMsg.includes('Use fast curl')) {
        markHostNeedsCurlFallback(targetUrl);
      }
      if (res.headersSent) return res.end();
      try {
        const buf = await curlGetBuffer(targetUrl, headers, 18);
        if (req.destroyed || res.writableEnded) return;
        if (!buf || buf.length === 0) {
          res.status(502).end();
          return;
        }
        const boxType = buf.length >= 8 ? buf.subarray(4, 8).toString('ascii') : '';
        const isFmp4Buffer =
          isUrlMp4 ||
          boxType === 'ftyp' ||
          boxType === 'styp' ||
          boxType === 'moof' ||
          boxType === 'sidx';

        let cleanFullBuf = buf;
        if (!isFmp4Buffer) {
          const tsOff = findDisguisedTsOffset(buf);
          if (tsOff > 0) cleanFullBuf = buf.subarray(tsOff);
        }

        let outBuf = cleanFullBuf;
        let statusCode = 200;
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const rawEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cleanFullBuf.length - 1;
          if (start >= 0 && start < cleanFullBuf.length) {
            const end = Math.min(cleanFullBuf.length - 1, Math.max(start, rawEnd));
            outBuf = cleanFullBuf.subarray(start, end + 1);
            statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${cleanFullBuf.length}`);
            res.setHeader('Accept-Ranges', 'bytes');
          }
        }

        res.status(statusCode);
        applyProxyCorsHeaders(res, reqId);
        res.setHeader('Content-Type', isFmp4Buffer ? 'video/mp4' : 'video/mp2t');
        res.setHeader('Content-Length', String(outBuf.length));
        res.end(outBuf);
      } catch {
        if (!res.headersSent) res.status(502);
        res.end();
      }
    }
  };

  app.get(['/api/ts-proxy', '/api/ts-proxy/:filename'], handleTsProxy);
  app.head(['/api/ts-proxy', '/api/ts-proxy/:filename'], handleTsProxy);
}
