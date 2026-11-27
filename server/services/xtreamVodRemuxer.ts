import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type express from 'express';
import { FFMPEG_BIN } from '../routes/proxies/proxyUtils.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { logger } from '../utils/logger.ts';

const BROWSER_NATIVE_VOD_EXTS = new Set(['mp4', 'm4v', 'webm', 'm3u8', 'ogg', 'ogv']);

export interface VodRemuxOptions {
  upstreamUrl: string;
  cacheKey?: string;
  startSec?: number;
  forceFullTranscode?: boolean;
  referer?: string;
}

/**
 * Determines whether a VOD container requires server-side FFmpeg fragmented-MP4 remuxing
 * for reliable HTML5 `<video>` playback in Chromium/mobile browsers.
 */
export function needsBrowserVodRemux(ext: string, forceTranscode = false): boolean {
  if (forceTranscode) return true;
  const clean = String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '');
  if (!clean) return false;
  return !BROWSER_NATIVE_VOD_EXTS.has(clean);
}

function buildFfmpegVodArgs(opts: VodRemuxOptions): string[] {
  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-fflags',
    '+genpts+discardcorrupt',
    '-probesize',
    '2500000',
    '-analyzeduration',
    '1800000',
    '-user_agent',
    'IPTVSmartersPlayer',
  ];

  if (opts.referer && /^https?:\/\//i.test(opts.referer)) {
    args.push('-headers', `Referer: ${opts.referer}\r\n`);
  }

  if (typeof opts.startSec === 'number' && Number.isFinite(opts.startSec) && opts.startSec > 0) {
    args.push('-ss', String(Math.floor(opts.startSec)));
  }

  args.push('-i', opts.upstreamUrl, '-map', '0:v:0?', '-map', '0:a:0?');

  if (opts.forceFullTranscode) {
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '48'
    );
  } else {
    args.push('-c:v', 'copy');
  }

  args.push(
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-b:a',
    '192k',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    'pipe:1'
  );

  return args;
}

/**
 * Remuxes/transcodes an upstream VOD file (MKV/AVI/TS/etc.) into a fragmented MP4 stream.
 * Resolves `true` once first media bytes start streaming to `res`, or `false` if startup failed
 * before headers were sent (so the caller can fall back to direct proxy/next rotated account).
 */
export async function streamVodRemuxedAsMp4(
  req: express.Request,
  res: express.Response,
  opts: VodRemuxOptions
): Promise<boolean> {
  try {
    await assertSafeProxyUrl(opts.upstreamUrl);
  } catch {
    return false;
  }

  if (req.method === 'HEAD') {
    if (!res.headersSent) {
      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
    }
    return true;
  }

  const args = buildFfmpegVodArgs(opts);

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let headersSentToClient = false;
    let child: ChildProcessByStdio<null, Readable, Readable> | null = null;
    let stderrTail = '';

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const killProc = () => {
      if (!child || child.killed) return;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    };

    try {
      child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      logger.warn(`[vod-remux] Failed to spawn ffmpeg (${opts.cacheKey || 'vod'}): ${String(err)}`);
      finish(false);
      return;
    }

    const ff = child;
    const startupTimer = setTimeout(() => {
      if (!headersSentToClient) {
        killProc();
        finish(false);
      }
    }, 10_000);

    const onClientClose = () => {
      clearTimeout(startupTimer);
      killProc();
      finish(headersSentToClient);
    };

    req.once('close', onClientClose);
    res.once('close', onClientClose);

    ff.stderr.on('data', (chunk: Buffer) => {
      const txt = chunk.toString('utf8');
      stderrTail = (stderrTail + txt).slice(-600);
    });

    ff.stdout.on('data', (chunk: Buffer) => {
      if (!chunk || chunk.length === 0) return;
      if (!headersSentToClient) {
        headersSentToClient = true;
        clearTimeout(startupTimer);
        if (!res.headersSent) {
          res.status(200);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Accept-Ranges', 'none');
        }
        finish(true);
      }
      if (!res.writableEnded && !res.destroyed) {
        const canContinue = res.write(chunk);
        if (!canContinue) {
          ff.stdout.pause();
          res.once('drain', () => {
            try {
              ff.stdout.resume();
            } catch {
              // ignore
            }
          });
        }
      }
    });

    ff.on('error', (err) => {
      clearTimeout(startupTimer);
      req.off('close', onClientClose);
      res.off('close', onClientClose);
      logger.warn(`[vod-remux] ffmpeg error (${opts.cacheKey || 'vod'}): ${err.message}`);
      if (!headersSentToClient) {
        finish(false);
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    ff.on('close', (code) => {
      clearTimeout(startupTimer);
      req.off('close', onClientClose);
      res.off('close', onClientClose);
      if (!headersSentToClient) {
        if (code && code !== 0 && stderrTail) {
          logger.warn(`[vod-remux] startup failed (${opts.cacheKey || 'vod'}): ${stderrTail.trim()}`);
        }
        finish(false);
        return;
      }
      if (!res.writableEnded) {
        res.end();
      }
    });
  });
}
