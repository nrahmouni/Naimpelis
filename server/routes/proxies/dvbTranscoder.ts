import crypto from 'crypto';
import type express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  curlGetBuffer,
  getPreferredUpstreamUa,
  TDT_DVB_UA,
} from '../../extractors/httpHelpers.ts';
import {
  applyProxyCorsHeaders,
  FFMPEG_BIN,
  getOrCreateRequestId,
} from './proxyUtils.ts';

export const dvbAacSegmentCache = new LruTtlCache<string, { promise: Promise<Buffer>; ts: number }>(
  80,
  80_000
);

export interface RollingDvbSeg {
  seq: number;
  extinf: string;
  absUrl: string;
  proxiedUrl: string;
  ts: number;
}
export const dvbRollingPlaylistMap = new LruTtlCache<string, RollingDvbSeg[]>(45, 90_000);

interface DvbTranscodeTask {
  run: () => void;
  highPriority: boolean;
}
let activeDvbTranscodes = 0;
const MAX_CONCURRENT_DVB_TRANSCODES = 4;
const dvbTranscodeQueue: DvbTranscodeTask[] = [];

export function scheduleDvbTranscode<T>(fn: () => Promise<T>, highPriority: boolean): Promise<T> {
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
        timeoutMs: 7000,
      });
      if (resp.ok) {
        rawBuf = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
      // fallback to curl
    }

    if (!rawBuf || rawBuf.length === 0) {
      rawBuf = await curlGetBuffer(segmentUrl, segHeaders, 8);
    }
    if (!rawBuf || rawBuf.length < 376) {
      throw new Error('Empty or truncated DVB TS segment');
    }

    return await scheduleDvbTranscode(
      () =>
        new Promise<Buffer>((resolve, reject) => {
          const ff = spawn(FFMPEG_BIN, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-fflags',
            '+genpts+discardcorrupt',
            '-avoid_negative_ts',
            'make_zero',
            '-f',
            'mpegts',
            '-i',
            'pipe:0',
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-ac',
            '2',
            '-ar',
            '48000',
            '-b:a',
            '128k',
            '-sn',
            '-dn',
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
          }, 12_000);

          ff.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk));
          ff.on('error', (err) => {
            clearTimeout(safetyTimer);
            reject(err);
          });
          ff.on('close', (code) => {
            clearTimeout(safetyTimer);
            const remuxed = Buffer.concat(outChunks);
            if (code === 0 && remuxed.length >= 564 && remuxed[0] === 0x47) {
              resolve(remuxed);
            } else {
              reject(new Error(`DVB segment remux failed (code=${code}, len=${remuxed.length})`));
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
  referer: string;
  dir: string;
  proc: ReturnType<typeof spawn>;
  startedAt: number;
  lastAccessAt: number;
  readyPromise: Promise<boolean>;
  dead: boolean;
}

const DVB_LIVE_ROOT = '/tmp/naim-dvb-live';
try {
  // #20: Purge stale /tmp/naim-dvb-live segments from prior restarts on startup
  if (fs.existsSync(DVB_LIVE_ROOT)) {
    fs.rmSync(DVB_LIVE_ROOT, { recursive: true, force: true });
  }
} catch {
  // ignore cleanup permission errors
}
const MAX_LIVE_DVB_SESSIONS = 5;
const DVB_SESSION_IDLE_MS = 45_000;
const liveDvbSessions = new Map<string, LiveDvbRelaySession>();
const dvbSessionUpstreamMeta = new LruTtlCache<
  string,
  { upstreamUrl: string; profile: 'hd' | 'fast' | 'iptv'; referer: string }
>(200, 24 * 60 * 60 * 1000);

function normalizeDvbUpstream(rawUpstreamUrl: string): string {
  return String(rawUpstreamUrl || '')
    .trim()
    .replace(/[?&]profile=(hd|fast|iptv)\b/gi, '');
}

export function buildDvbSessionKey(
  rawUpstreamUrl: string,
  profile: 'hd' | 'fast' | 'iptv' = 'hd'
): string {
  const cleanUpstream = normalizeDvbUpstream(rawUpstreamUrl);
  const hash = crypto
    .createHash('sha1')
    .update(`${cleanUpstream}|${profile}`)
    .digest('hex')
    .slice(0, 14);
  return `dvb_${hash}`;
}

export function getActiveDvbSessionPath(
  rawUpstreamUrl: string,
  profile: 'hd' | 'fast' | 'iptv' = 'hd'
): string | null {
  const sessionKey = buildDvbSessionKey(rawUpstreamUrl, profile);
  const existing = liveDvbSessions.get(sessionKey);
  if (!existing || existing.dead) return null;
  const plFile = path.join(existing.dir, 'index.m3u8');
  if (!fs.existsSync(plFile)) return null;
  try {
    const st = fs.statSync(plFile);
    if (Date.now() - st.mtimeMs < 15_000) {
      existing.lastAccessAt = Date.now();
      return `/api/dvb-live/${sessionKey}/index.m3u8`;
    }
  } catch {
    // ignore
  }
  return null;
}

export function destroyLiveDvbSession(key: string): void {
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
    if (sess.dead || now - sess.lastAccessAt > DVB_SESSION_IDLE_MS) {
      destroyLiveDvbSession(key);
    }
  }
}, 15_000).unref();

export async function ensureLiveDvbCleanHlsSession(
  rawUpstreamUrl: string,
  profile: 'hd' | 'fast' | 'iptv' = 'hd',
  referer = '',
  attempt = 0
): Promise<string | null> {
  const cleanUpstream = normalizeDvbUpstream(rawUpstreamUrl);
  const sessionKey = buildDvbSessionKey(cleanUpstream, profile);
  dvbSessionUpstreamMeta.set(sessionKey, { upstreamUrl: cleanUpstream, profile, referer });

  const existing = liveDvbSessions.get(sessionKey);
  if (existing && !existing.dead) {
    existing.lastAccessAt = Date.now();
    const ok = await existing.readyPromise;
    const plFile = path.join(existing.dir, 'index.m3u8');
    let fresh = false;
    if (ok && fs.existsSync(plFile)) {
      try {
        const st = fs.statSync(plFile);
        fresh = Date.now() - st.mtimeMs < 15_000;
      } catch {
        fresh = false;
      }
    }
    if (fresh) {
      existing.lastAccessAt = Date.now();
      return `/api/dvb-live/${sessionKey}/index.m3u8`;
    }
    destroyLiveDvbSession(sessionKey);
  }

  while (liveDvbSessions.size >= MAX_LIVE_DVB_SESSIONS) {
    let oldestKey = '';
    let oldestAccess = Infinity;
    for (const [k, s] of liveDvbSessions.entries()) {
      if (s.lastAccessAt < oldestAccess) {
        oldestAccess = s.lastAccessAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    destroyLiveDvbSession(oldestKey);
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

  const isXtreamLive = /\/live\/[^/]+\/[^/]+\//i.test(cleanUpstream);
  const ffArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-user_agent',
    isXtreamLive ? 'IPTVSmartersPlayer' : TDT_DVB_UA,
  ];
  if (referer && /^https?:\/\//i.test(referer)) {
    ffArgs.push('-headers', `Referer: ${referer}\r\n`);
  }

  const isFastProfile = profile === 'fast';
  const isUhd4kStream = /\/stream\/6[4568]\//i.test(cleanUpstream);
  const vfFilter = isUhd4kStream
    ? isFastProfile
      ? 'fps=25,scale=1280:720:flags=fast_bilinear,format=yuv420p'
      : 'fps=25,scale=1920:1080:flags=fast_bilinear,format=yuv420p'
    : isFastProfile
    ? "yadif=0:-1:0,scale='min(1280,iw)':-2,format=yuv420p"
    : "yadif=0:-1:0,scale='min(1920,iw)':-2,format=yuv420p";

  ffArgs.push(
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-rw_timeout',
    '6000000',
    '-analyzeduration',
    '1200000',
    '-probesize',
    '1500000',
    '-live_start_index',
    '-2',
    '-fflags',
    '+genpts+discardcorrupt',
    '-avoid_negative_ts',
    'make_zero',
    ...(isUhd4kStream
      ? []
      : ['-err_detect', '+crccheck+bitstream', '-ec', 'favor_inter+deblock']),
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
    isUhd4kStream ? 'ultrafast' : 'superfast',
    '-tune',
    'zerolatency',
    '-profile:v',
    'high',
    '-level:v',
    isFastProfile ? '4.0' : '4.1',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    isFastProfile ? '21' : '19',
    '-maxrate',
    isFastProfile ? '2600k' : '5200k',
    '-bufsize',
    isFastProfile ? '5200k' : '10400k',
    '-r',
    '25',
    '-g',
    '50',
    '-keyint_min',
    '50',
    '-sc_threshold',
    '0',
    '-force_key_frames',
    'expr:gte(t,n_forced*2)',
    '-threads',
    isUhd4kStream ? '3' : '2',
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-b:a',
    '128k',
    '-sn',
    '-dn',
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
    playlistPath
  );

  const proc = spawn(FFMPEG_BIN, ffArgs);

  const session: LiveDvbRelaySession = {
    key: sessionKey,
    upstreamUrl: cleanUpstream,
    referer,
    dir: sessionDir,
    proc,
    startedAt: Date.now(),
    lastAccessAt: Date.now(),
    dead: false,
    readyPromise: Promise.resolve(false),
  };

  let stderrTail = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-400);
  });
  proc.on('exit', (code) => {
    if (code !== 0 && !session.dead) {
      console.warn('[dvb-transcoder] ffmpeg exited early', { key: sessionKey, code, stderrTail });
    }
    session.dead = true;
  });
  proc.on('error', (err) => {
    console.warn('[dvb-transcoder] ffmpeg spawn error', { key: sessionKey, err: err?.message });
    session.dead = true;
  });

  session.readyPromise = new Promise<boolean>((resolve) => {
    const deadline = Date.now() + 12_000;
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
            const firstSegPath = path.join(sessionDir, segMatches[0]);
            if (fs.existsSync(firstSegPath) && fs.statSync(firstSegPath).size > 564) {
              clearInterval(poll);
              resolve(true);
              return;
            }
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
    }, 50);
  });

  liveDvbSessions.set(sessionKey, session);
  const ready = await session.readyPromise;
  if (ready) {
    session.lastAccessAt = Date.now();
    return `/api/dvb-live/${sessionKey}/index.m3u8`;
  }
  const elapsed = Date.now() - session.startedAt;
  destroyLiveDvbSession(sessionKey);
  if (attempt === 0 && elapsed < 7_000) {
    return ensureLiveDvbCleanHlsSession(rawUpstreamUrl, profile, referer, 1);
  }
  return null;
}

export function readLiveDvbPlaylistForIptv(
  sessionPath: string,
  publicOrigin = ''
): string | null {
  const m = String(sessionPath || '').match(/\/api\/dvb-live\/([^/]+)\/index\.m3u8/i);
  if (!m) return null;
  const sessionKey = m[1].replace(/[^a-zA-Z0-9_-]/g, '');
  const sess = liveDvbSessions.get(sessionKey);
  if (!sess || sess.dead) return null;
  sess.lastAccessAt = Date.now();
  const playlistPath = path.join(sess.dir, 'index.m3u8');
  if (!fs.existsSync(playlistPath)) return null;
  try {
    const raw = fs.readFileSync(playlistPath, 'utf8');
    if (!raw.includes('#EXTM3U')) return null;
    const prefix = publicOrigin ? publicOrigin.replace(/\/+$/, '') : '';
    return (
      raw
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          if (/^seg_\d+\.ts$/i.test(trimmed)) {
            return `${prefix}/api/dvb-live/${sessionKey}/${trimmed}`;
          }
          return trimmed;
        })
        .filter((line) => line.length > 0)
        .join('\n') + '\n'
    );
  } catch {
    return null;
  }
}

export const handleDvbLive = async (
  req: express.Request,
  res: express.Response
): Promise<void> => {
  const reqId = getOrCreateRequestId(req);
  const sessionKey = String(req.params.sessionKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = String(req.params.filename || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!filename || filename.includes('..')) {
    res.status(404).send('Invalid filename');
    return;
  }

  let sess = liveDvbSessions.get(sessionKey);
  if ((!sess || sess.dead) && filename === 'index.m3u8') {
    const remembered = dvbSessionUpstreamMeta.get(sessionKey);
    if (remembered) {
      await ensureLiveDvbCleanHlsSession(
        remembered.upstreamUrl,
        remembered.profile,
        remembered.referer
      ).catch(() => null);
      sess = liveDvbSessions.get(sessionKey);
    }
  }

  if (!sess || sess.dead) {
    res.status(404).send('Live session expired');
    return;
  }

  sess.lastAccessAt = Date.now();
  let filePath = path.join(sess.dir, filename);
  if (!fs.existsSync(filePath) && filename === 'index.m3u8') {
    await sess.readyPromise.catch(() => false);
    filePath = path.join(sess.dir, filename);
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).send('Segment not ready');
    return;
  }

  applyProxyCorsHeaders(res, reqId);
  if (filename.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=15');
  }
  if (req.method === 'HEAD') {
    try {
      const st = fs.statSync(filePath);
      res.setHeader('Content-Length', String(st.size));
    } catch {
      // ignore
    }
    res.status(200).end();
    return;
  }
  res.sendFile(filePath);
};
