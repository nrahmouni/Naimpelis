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
const MAX_CONCURRENT_DVB_TRANSCODES = 2;
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
            '-err_detect',
            'ignore_err',
            '-fflags',
            '+genpts+discardcorrupt',
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
            'yadif=mode=0:parity=-1:deint=1,scale=960:540:flags=bicubic,setsar=1:1',
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
            '-flags',
            '+cgop',
            '-bf',
            '0',
            '-g',
            '50',
            '-keyint_min',
            '25',
            '-sc_threshold',
            '0',
            '-crf',
            '22',
            '-maxrate',
            '2200k',
            '-bufsize',
            '4400k',
            '-c:a',
            'aac',
            '-ac',
            '2',
            '-ar',
            '48000',
            '-b:a',
            '128k',
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
          }, 9000);

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
              reject(new Error(`DVB segment transcode failed (code=${code}, len=${remuxed.length})`));
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
    if (sess.dead || now - sess.lastAccessAt > 45_000) {
      destroyLiveDvbSession(key);
    }
  }
}, 12_000).unref();

export async function ensureLiveDvbCleanHlsSession(
  rawUpstreamUrl: string,
  profile: 'hd' | 'fast' = 'hd',
  referer = ''
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
      ? 'yadif=mode=0:parity=-1:deint=1,scale=960:540:flags=bicubic,setsar=1:1'
      : 'yadif=mode=0:parity=-1:deint=1,scale=1280:720:flags=bicubic,setsar=1:1';

  const ffArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-user_agent',
    TDT_DVB_UA,
  ];
  if (referer && /^https?:\/\//i.test(referer)) {
    ffArgs.push('-headers', `Referer: ${referer}\r\n`);
  }
  ffArgs.push(
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-live_start_index',
    '-2',
    '-err_detect',
    'ignore_err',
    '-fflags',
    '+genpts+discardcorrupt',
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
    '-flags',
    '+cgop',
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
    profile === 'fast' ? '23' : '21',
    '-maxrate',
    profile === 'fast' ? '2200k' : '3500k',
    '-bufsize',
    profile === 'fast' ? '4400k' : '7000k',
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
    playlistPath
  );

  const proc = spawn(FFMPEG_BIN, ffArgs);

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
    const deadline = Date.now() + 7500;
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
    }, 100);
  });

  liveDvbSessions.set(sessionKey, session);
  const ready = await session.readyPromise;
  return ready ? `/api/dvb-live/${sessionKey}/index.m3u8` : null;
}

export const handleDvbLive = (req: express.Request, res: express.Response): void => {
  const reqId = getOrCreateRequestId(req);
  const sessionKey = String(req.params.sessionKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = String(req.params.filename || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const sess = liveDvbSessions.get(sessionKey);
  if (!sess || sess.dead || !filename || filename.includes('..')) {
    res.status(404).send('Live session expired');
    return;
  }
  sess.lastAccessAt = Date.now();
  const filePath = path.join(sess.dir, filename);
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
    res.setHeader('Cache-Control', 'public, max-age=12');
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
