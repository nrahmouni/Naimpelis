import crypto from 'crypto';
import type express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { logger } from '../../utils/logger.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { getPreferredUpstreamUa } from '../../extractors/httpHelpers.ts';
import {
  applyProxyCorsHeaders,
  FFMPEG_BIN,
  getOrCreateRequestId,
} from './proxyUtils.ts';
import {
  buildDvbLiveFfmpegArgs,
  openSingleSocketMpegTsStream,
  probeDvbStreamCodec,
  probedStreamCache,
  pumpMpegTsPipeToFfmpeg,
  type OpenedMpegTsPipe,
  type ProbedStreamCodecInfo,
} from './dvbCodecProbe.ts';
import {
  dvbAacSegmentCache,
  remuxDvbTsToAacWithHealth,
  scheduleDvbTranscode,
} from './dvbSegmentRemuxer.ts';
import { runtimeMetrics } from '../../services/runtimeMetricsCollector.ts';

export {
  buildDvbLiveFfmpegArgs,
  dvbAacSegmentCache,
  scheduleDvbTranscode,
  type ProbedStreamCodecInfo,
};

export interface RollingDvbSeg {
  seq: number;
  extinf: string;
  absUrl: string;
  proxiedUrl: string;
  ts: number;
}
export const dvbRollingPlaylistMap = new LruTtlCache<string, RollingDvbSeg[]>(45, 90_000);

const dvbHostDownCache = new LruTtlCache<string, { until: number; reason: string }>(64, 45_000);
const dvbHostUpCache = new LruTtlCache<string, boolean>(64, 15_000);

function getDvbHostKey(rawUrl: string): string {
  try {
    return new URL(rawUrl).host.toLowerCase();
  } catch {
    return rawUrl.slice(0, 80);
  }
}

function getDvbCooldownKey(rawUrl: string): string {
  if (isXtreamLiveStreamUrl(rawUrl)) {
    try {
      const u = new URL(rawUrl);
      return `${u.host.toLowerCase()}${u.pathname}`;
    } catch {
      return rawUrl.slice(0, 120);
    }
  }
  return getDvbHostKey(rawUrl);
}

export function isDvbUpstreamCoolingDown(rawUrl: string): boolean {
  const key = getDvbCooldownKey(rawUrl);
  const entry = dvbHostDownCache.get(key);
  if (!entry) return false;
  if (Date.now() < entry.until) return true;
  dvbHostDownCache.delete(key);
  return false;
}

function markDvbUpstreamDown(rawUrl: string, reason: string, ttlMs = 45_000): void {
  const key = getDvbCooldownKey(rawUrl);
  const effectiveTtl = isXtreamLiveStreamUrl(rawUrl) ? Math.min(ttlMs, 12_000) : ttlMs;
  dvbHostDownCache.set(key, { until: Date.now() + effectiveTtl, reason });
  dvbHostUpCache.delete(getDvbHostKey(rawUrl));
}

async function probeDvbUpstreamReachable(
  cleanUpstream: string,
  referer: string,
  timeoutMs = 2600
): Promise<boolean> {
  const hostKey = getDvbHostKey(cleanUpstream);
  if (isDvbUpstreamCoolingDown(cleanUpstream)) return false;
  if (dvbHostUpCache.get(hostKey)) return true;

  const headers: Record<string, string> = {
    'User-Agent': getPreferredUpstreamUa(cleanUpstream),
    Accept: '*/*',
  };
  if (referer && /^https?:\/\//i.test(referer)) {
    headers['Referer'] = referer;
  }

  try {
    const resp = await streamingFetch(cleanUpstream, {
      method: 'GET',
      headers,
      timeoutMs,
    });
    try {
      await resp.body?.cancel?.();
    } catch {
      // ignore
    }
    if (resp.ok || resp.status === 206) {
      dvbHostUpCache.set(hostKey, true);
      return true;
    }
    if (resp.status === 404 || resp.status >= 500) {
      markDvbUpstreamDown(cleanUpstream, `HTTP ${resp.status}`, 25_000);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markDvbUpstreamDown(cleanUpstream, msg, 45_000);
    return false;
  }
}

export function remuxDvbTsToAac(
  segmentUrl: string,
  referer: string,
  highPriority = false
): Promise<Buffer> {
  return remuxDvbTsToAacWithHealth({
    segmentUrl,
    referer,
    highPriority,
    isCoolingDown: isDvbUpstreamCoolingDown,
    markDown: markDvbUpstreamDown,
  });
}

interface LiveDvbRelaySession {
  key: string;
  upstreamUrl: string;
  referer: string;
  dir: string;
  proc: ReturnType<typeof spawn>;
  abortController?: AbortController;
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
const MAX_LIVE_DVB_SESSIONS = 6;
const DVB_SESSION_IDLE_MS = 90_000;
const liveDvbSessions = new Map<string, LiveDvbRelaySession>();
const inflightDvbSessionStarts = new Map<string, Promise<string | null>>();
const dvbSessionUpstreamMeta = new LruTtlCache<
  string,
  { upstreamUrl: string; profile: 'hd' | 'fast' | 'iptv'; referer: string }
>(200, 24 * 60 * 60 * 1000);

function isXtreamLiveStreamUrl(rawUrl: string): boolean {
  return /\/live\/[^/]+\/[^/]+\//i.test(String(rawUrl || ''));
}

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
    sess.abortController?.abort();
  } catch {
    // ignore
  }
  try {
    sess.proc.kill('SIGKILL');
  } catch {
    // ignore
  }
  void fs.promises.rm(sess.dir, { recursive: true, force: true }).catch(() => {});
}

export function destroyAllLiveDvbSessions(): number {
  const keys = Array.from(liveDvbSessions.keys());
  for (const key of keys) {
    destroyLiveDvbSession(key);
  }
  return keys.length;
}

export function getActiveDvbSessionCount(): number {
  return liveDvbSessions.size;
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

  const inflight = inflightDvbSessionStarts.get(sessionKey);
  if (inflight) {
    return inflight;
  }

  const runPromise = startOrReuseLiveDvbCleanHlsSession(
    rawUpstreamUrl,
    cleanUpstream,
    sessionKey,
    profile,
    referer,
    attempt
  ).finally(() => {
    if (inflightDvbSessionStarts.get(sessionKey) === runPromise) {
      inflightDvbSessionStarts.delete(sessionKey);
    }
  });
  inflightDvbSessionStarts.set(sessionKey, runPromise);
  return runPromise;
}

async function startOrReuseLiveDvbCleanHlsSession(
  rawUpstreamUrl: string,
  cleanUpstream: string,
  sessionKey: string,
  profile: 'hd' | 'fast' | 'iptv',
  referer: string,
  attempt: number
): Promise<string | null> {
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

  const isXtreamLive = isXtreamLiveStreamUrl(cleanUpstream);
  if (isDvbUpstreamCoolingDown(cleanUpstream)) {
    return null;
  }

  // Xtream portals often enforce strict max_connections (e.g. 2 slots):
  // 1) Destroy any previous active Xtream FFmpeg relay on the same origin before opening a new one.
  // 2) Skip duplicate pre-probe GET so only 1 upstream socket is opened.
  if (isXtreamLive) {
    const targetHost = getDvbHostKey(cleanUpstream);
    let evicted = false;
    for (const [k, s] of liveDvbSessions.entries()) {
      if (k !== sessionKey && getDvbHostKey(s.upstreamUrl) === targetHost) {
        destroyLiveDvbSession(k);
        evicted = true;
      }
    }
    if (evicted) {
      // Wait cleanly so Xtream edge releases previous max_connections socket before opening next channel
      await new Promise((r) => setTimeout(r, 380));
    }
  } else {
    const reachable = await probeDvbUpstreamReachable(cleanUpstream, referer, 2600);
    if (!reachable) {
      return null;
    }
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
    await fs.promises.rm(sessionDir, { recursive: true, force: true });
    await fs.promises.mkdir(sessionDir, { recursive: true });
  } catch {
    return null;
  }

  const playlistPath = path.join(sessionDir, 'index.m3u8');
  const segmentPattern = path.join(sessionDir, 'seg_%05d.ts');

  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const isM3u8Input = /\.m3u8(\?|$)/i.test(cleanUpstream);
  let probe: ProbedStreamCodecInfo | null = probedStreamCache.get(cleanUpstream) || null;
  let mpegTsPipe: OpenedMpegTsPipe | null = null;

  if (!isTestEnv && !isM3u8Input) {
    mpegTsPipe = await openSingleSocketMpegTsStream({
      cleanUpstream,
      referer,
      isXtreamLive,
      cachedProbe: probe,
      onError: (reason) => markDvbUpstreamDown(cleanUpstream, reason, 12_000),
    });
    if (!mpegTsPipe) {
      return null;
    }
    probe = mpegTsPipe.probe;
  } else if (!probe && !isTestEnv) {
    probe = await probeDvbStreamCodec(cleanUpstream, referer, isXtreamLive, (reason) => {
      markDvbUpstreamDown(cleanUpstream, reason, 25_000);
    });
    if (isDvbUpstreamCoolingDown(cleanUpstream)) {
      return null;
    }
  }

  const ffArgs = buildDvbLiveFfmpegArgs({
    cleanUpstream,
    inputUrl: mpegTsPipe ? 'pipe:0' : cleanUpstream,
    referer,
    profile,
    isXtreamLive,
    playlistPath,
    segmentPattern,
    probe,
  });

  const proc = spawn(FFMPEG_BIN, ffArgs);

  const session: LiveDvbRelaySession = {
    key: sessionKey,
    upstreamUrl: cleanUpstream,
    referer,
    dir: sessionDir,
    proc,
    abortController: mpegTsPipe?.abortController,
    startedAt: Date.now(),
    lastAccessAt: Date.now(),
    dead: false,
    readyPromise: Promise.resolve(false),
  };

  if (mpegTsPipe && proc.stdin) {
    pumpMpegTsPipeToFfmpeg({
      pipe: mpegTsPipe,
      stdin: proc.stdin,
      isDead: () => session.dead,
    });
  }

  let stderrTail = '';
  let hadNetworkFailure = false;
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-400);
  });
  proc.on('exit', (code) => {
    try {
      session.abortController?.abort();
    } catch {
      // ignore
    }
    if (code !== 0 && !session.dead) {
      hadNetworkFailure =
        /connection timed out|connection refused|no route to host|failed to resolve|404 not found|502 bad gateway|503 service/i.test(
          stderrTail
        );
      if (hadNetworkFailure) {
        markDvbUpstreamDown(cleanUpstream, stderrTail.slice(0, 120), 45_000);
        logger.debug({ key: sessionKey, code }, 'dvb_upstream_unreachable');
      } else {
        logger.warn({ key: sessionKey, code, stderrTail }, 'dvb_ffmpeg_exited_early');
      }
    }
    session.dead = true;
  });
  proc.on('error', (err) => {
    logger.warn({ key: sessionKey, err: err?.message }, 'dvb_ffmpeg_spawn_error');
    session.dead = true;
  });

  session.readyPromise = new Promise<boolean>((resolve) => {
    const deadline = Date.now() + (isXtreamLive ? 6_500 : 12_000);
    let inTick = false;
    const poll = setInterval(async () => {
      if (session.dead) {
        clearInterval(poll);
        resolve(false);
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        destroyLiveDvbSession(sessionKey);
        resolve(false);
        return;
      }
      if (inTick) return;
      inTick = true;
      try {
        const content = await fs.promises.readFile(playlistPath, 'utf8');
        const segMatches = content.match(/seg_\d+\.ts/g);
        if (segMatches && segMatches.length >= 2) {
          const firstSegPath = path.join(sessionDir, segMatches[0]);
          const st = await fs.promises.stat(firstSegPath);
          if (st.size > 564) {
            clearInterval(poll);
            resolve(true);
            return;
          }
        }
      } catch {
        // wait next tick
      } finally {
        inTick = false;
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
  if (
    !isXtreamLive &&
    attempt === 0 &&
    !hadNetworkFailure &&
    !isDvbUpstreamCoolingDown(cleanUpstream) &&
    elapsed < 7_000
  ) {
    return startOrReuseLiveDvbCleanHlsSession(
      rawUpstreamUrl,
      cleanUpstream,
      sessionKey,
      profile,
      referer,
      1
    );
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
  runtimeMetrics.recordMediaRequest('dvb');
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
  const filePath = path.join(sess.dir, filename);
  let fileStat: fs.Stats | null = await fs.promises.stat(filePath).catch(() => null);
  if (!fileStat && filename === 'index.m3u8') {
    await sess.readyPromise.catch(() => false);
    fileStat = await fs.promises.stat(filePath).catch(() => null);
  }
  if (!fileStat) {
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
    res.setHeader('Content-Length', String(fileStat.size));
    res.status(200).end();
    return;
  }
  res.sendFile(filePath);
};
