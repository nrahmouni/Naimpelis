/**
 * @module server/services/xtreamVodRemuxer
 * @description Browser-compatible progressive fMP4 remuxer/transcoder for Xtream VOD and Series
 * files whose container (.mkv, .avi, .ts, etc.) or codecs (HEVC/H.265, AC3/EAC3/DTS) cannot play
 * natively inside Chromium/Android/Safari <video> tags. Runs FFmpeg directly over server-side
 * upstream URLs without ever exposing origin credentials to clients.
 */
import { spawn } from 'node:child_process';
import type { Request, Response } from 'express';
import { FFMPEG_BIN, FFPROBE_BIN } from '../routes/proxies/proxyUtils.ts';
import { logger } from '../utils/logger.ts';

const NON_NATIVE_BROWSER_EXTENSIONS = new Set([
  'mkv',
  'avi',
  'ts',
  'mts',
  'm2ts',
  'flv',
  'wmv',
  'mov',
  'm4v',
  'mpeg',
  'mpg',
  'vob',
  'divx',
  'asf',
  'rmvb',
]);

interface ProbeCacheEntry {
  videoCodec: string;
  audioCodec: string;
  expiresAt: number;
}

const codecProbeCache = new Map<string, ProbeCacheEntry>();
const PROBE_TTL_MS = 10 * 60 * 1000;

export function needsBrowserVodRemux(ext: string, forceTranscode = false): boolean {
  if (forceTranscode) return true;
  const clean = String(ext || '').trim().toLowerCase();
  return NON_NATIVE_BROWSER_EXTENSIONS.has(clean);
}

export async function probeUpstreamVodCodecs(
  upstreamUrl: string,
  cacheKey: string
): Promise<{ videoCodec: string; audioCodec: string }> {
  const cached = codecProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { videoCodec: cached.videoCodec, audioCodec: cached.audioCodec };
  }

  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    const finish = (videoCodec: string, audioCodec: string) => {
      if (settled) return;
      settled = true;
      codecProbeCache.set(cacheKey, {
        videoCodec,
        audioCodec,
        expiresAt: Date.now() + PROBE_TTL_MS,
      });
      if (codecProbeCache.size > 400) {
        const oldest = codecProbeCache.keys().next().value;
        if (oldest) codecProbeCache.delete(oldest);
      }
      resolve({ videoCodec, audioCodec });
    };

    const proc = spawn(
      FFPROBE_BIN,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-headers',
        'User-Agent: IPTVSmartersPlayer\r\n',
        '-analyzeduration',
        '300000',
        '-probesize',
        '500000',
        '-rw_timeout',
        '1800000',
        '-i',
        upstreamUrl,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      finish('unknown', 'unknown');
    }, 1300);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 64_000) {
        stdout = stdout.slice(0, 64_000);
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      finish('unknown', 'unknown');
    });

    proc.on('exit', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout) as {
          streams?: Array<{ codec_type?: string; codec_name?: string }>;
        };
        const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
        const v = streams.find((s) => s.codec_type === 'video')?.codec_name?.toLowerCase() || 'unknown';
        const a = streams.find((s) => s.codec_type === 'audio')?.codec_name?.toLowerCase() || 'unknown';
        finish(v, a);
      } catch {
        finish('unknown', 'unknown');
      }
    });
  });
}

export async function streamVodRemuxedAsMp4(
  req: Request,
  res: Response,
  opts: {
    upstreamUrl: string;
    cacheKey: string;
    startSec?: number;
    forceFullTranscode?: boolean;
  }
): Promise<boolean> {
  if (req.method === 'HEAD') {
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');
    res.end();
    return true;
  }

  const probe = await probeUpstreamVodCodecs(opts.upstreamUrl, opts.cacheKey);

  const audioNeedsTranscodeOnly =
    probe.audioCodec !== 'aac' && probe.audioCodec !== 'mp3' && probe.audioCodec !== 'unknown';
  const canCopyVideo =
    (probe.videoCodec === 'h264' || probe.videoCodec === 'unknown') &&
    (!opts.forceFullTranscode || audioNeedsTranscodeOnly);
  const canCopyAudio = !opts.forceFullTranscode && probe.audioCodec === 'aac';

  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-headers',
    'User-Agent: IPTVSmartersPlayer\r\n',
    '-analyzeduration',
    '300000',
    '-probesize',
    '500000',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '3',
    '-rw_timeout',
    '12000000',
  ];

  if (typeof opts.startSec === 'number' && Number.isFinite(opts.startSec) && opts.startSec > 0) {
    args.push('-ss', String(Math.floor(opts.startSec)));
  }

  args.push('-i', opts.upstreamUrl, '-map', '0:v:0', '-map', '0:a:0?');

  if (canCopyVideo) {
    args.push('-c:v', 'copy');
  } else {
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      "scale='min(1920,iw)':-2"
    );
  }

  if (canCopyAudio) {
    args.push('-c:a', 'copy');
  } else {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
  }

  args.push(
    '-fflags',
    '+genpts',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-reset_timestamps',
    '1',
    '-avoid_negative_ts',
    'make_zero',
    'pipe:1'
  );

  return new Promise<boolean>((resolve) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let headersSentToClient = false;
    let settled = false;
    let stderrTail = '';

    const startupTimer = setTimeout(() => {
      if (!headersSentToClient) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    }, 12_000);

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-400);
    });

    proc.stdout?.once('data', (firstChunk: Buffer) => {
      clearTimeout(startupTimer);
      if (res.writableEnded || res.destroyed) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        if (!settled) {
          settled = true;
          resolve(true);
        }
        return;
      }

      headersSentToClient = true;
      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.write(firstChunk);
      proc.stdout?.pipe(res);

      if (!settled) {
        settled = true;
        resolve(true);
      }
    });

    const killProc = () => {
      clearTimeout(startupTimer);
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    };

    res.on('close', killProc);

    proc.on('error', () => {
      clearTimeout(startupTimer);
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });

    proc.on('exit', (code) => {
      clearTimeout(startupTimer);
      if (!headersSentToClient) {
        if (code && code !== 0) {
          logger.debug({ code, stderrTail }, 'xtream_vod_remux_startup_failed');
        }
        if (!settled) {
          settled = true;
          resolve(false);
        }
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });
}
