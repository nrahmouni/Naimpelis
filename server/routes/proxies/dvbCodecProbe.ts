import { spawn } from 'child_process';
import { fetch as undiciFetch } from 'undici';
import { TDT_DVB_UA } from '../../extractors/httpHelpers.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { FFPROBE_BIN } from './proxyUtils.ts';
import {
  getSpainFfmpegHttpProxyArgs,
  getSpainProxyDispatcherForTarget,
} from '../../services/spainVpnGatewayService.ts';

export interface ProbedStreamCodecInfo {
  videoCodec: string;
  pixFmt: string;
  fieldOrder: string;
  width: number;
  height: number;
  fps: number;
  audioCodec: string;
  audioProfile: string;
  hasAudio: boolean;
}

export const probedStreamCache = new LruTtlCache<string, ProbedStreamCodecInfo>(
  160,
  15 * 60 * 1000
);

function parseFrameRateFraction(raw: string | undefined): number {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const parts = s.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (num > 0 && den > 0) return num / den;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseFfprobeStreamJson(rawJson: string): ProbedStreamCodecInfo | null {
  try {
    const parsed = JSON.parse(rawJson) as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        profile?: string;
        pix_fmt?: string;
        field_order?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
      }>;
    };
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const vStream = streams.find((s) => s.codec_type === 'video');
    if (!vStream || !vStream.codec_name) {
      return null;
    }
    const aStream = streams.find((s) => s.codec_type === 'audio');
    return {
      videoCodec: String(vStream.codec_name || '').toLowerCase(),
      pixFmt: String(vStream.pix_fmt || '').toLowerCase(),
      fieldOrder: String(vStream.field_order || 'progressive').toLowerCase(),
      width: Number(vStream.width || 0),
      height: Number(vStream.height || 0),
      fps:
        parseFrameRateFraction(vStream.avg_frame_rate) ||
        parseFrameRateFraction(vStream.r_frame_rate) ||
        25,
      audioCodec: String(aStream?.codec_name || '').toLowerCase(),
      audioProfile: String(aStream?.profile || '').trim(),
      hasAudio: Boolean(aStream),
    };
  } catch {
    return null;
  }
}

export async function probeDvbStreamFromBuffer(
  preamble: Buffer,
  cacheKeyUrl = ''
): Promise<ProbedStreamCodecInfo | null> {
  if (cacheKeyUrl) {
    const cached = probedStreamCache.get(cacheKeyUrl);
    if (cached) return cached;
  }
  if (!preamble || preamble.length < 188) return null;

  return await new Promise<ProbedStreamCodecInfo | null>((resolve) => {
    let settled = false;
    const stdoutChunks: Buffer[] = [];
    const proc = spawn(FFPROBE_BIN, [
      '-v',
      'error',
      '-f',
      'mpegts',
      '-analyzeduration',
      '450000',
      '-probesize',
      String(preamble.length),
      '-show_streams',
      '-of',
      'json',
      'pipe:0',
    ]);

    const finish = (val: ProbedStreamCodecInfo | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    };

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      finish(null);
    }, 1500);

    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.on('error', () => finish(null));
    proc.on('close', () => {
      const info = parseFfprobeStreamJson(Buffer.concat(stdoutChunks).toString('utf8'));
      if (info && cacheKeyUrl) {
        probedStreamCache.set(cacheKeyUrl, info);
      }
      finish(info);
    });
    proc.stdin?.on('error', () => {});
    proc.stdin?.end(preamble);
  });
}

export async function probeDvbStreamCodec(
  cleanUpstream: string,
  referer = '',
  isXtreamLive = false,
  onUpstreamError?: (reason: string) => void
): Promise<ProbedStreamCodecInfo | null> {
  const cached = probedStreamCache.get(cleanUpstream);
  if (cached) return cached;

  const probeArgs = [
    '-v',
    'error',
    ...getSpainFfmpegHttpProxyArgs(cleanUpstream),
    '-user_agent',
    isXtreamLive ? 'IPTVSmartersPlayer' : TDT_DVB_UA,
  ];
  if (referer && /^https?:\/\//i.test(referer)) {
    probeArgs.push('-headers', `Referer: ${referer}\r\n`);
  }
  probeArgs.push(
    '-rw_timeout',
    '2600000',
    '-analyzeduration',
    '450000',
    '-probesize',
    '450000',
    '-show_streams',
    '-of',
    'json',
    cleanUpstream
  );

  return await new Promise<ProbedStreamCodecInfo | null>((resolve) => {
    let settled = false;
    const stdoutChunks: Buffer[] = [];
    let stderrStr = '';
    const proc = spawn(FFPROBE_BIN, probeArgs);

    const finish = (val: ProbedStreamCodecInfo | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    };

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      finish(null);
    }, 2600);

    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrStr = (stderrStr + chunk.toString('utf8')).slice(-300);
    });
    proc.on('error', () => finish(null));
    proc.on('close', (code) => {
      if (code !== 0 && stdoutChunks.length === 0) {
        if (/404 not found|connection refused|502 bad gateway|timed out/i.test(stderrStr)) {
          onUpstreamError?.(stderrStr.slice(0, 120));
        }
        finish(null);
        return;
      }
      const info = parseFfprobeStreamJson(Buffer.concat(stdoutChunks).toString('utf8'));
      if (info) {
        probedStreamCache.set(cleanUpstream, info);
      }
      finish(info);
    });
  });
}

export function buildDvbLiveFfmpegArgs(options: {
  cleanUpstream: string;
  inputUrl?: string;
  referer: string;
  profile: 'hd' | 'fast' | 'iptv';
  isXtreamLive: boolean;
  playlistPath: string;
  segmentPattern: string;
  probe: ProbedStreamCodecInfo | null;
}): string[] {
  const {
    cleanUpstream,
    inputUrl,
    referer,
    profile,
    isXtreamLive,
    playlistPath,
    segmentPattern,
    probe,
  } = options;

  const actualInput = inputUrl || cleanUpstream;
  const isPipeInput = actualInput === 'pipe:0';

  const isFastProfile = profile === 'fast';
  const isUhd4kStream =
    /\/stream\/6[4568]\//i.test(cleanUpstream) ||
    (probe ? probe.width >= 3000 || probe.height >= 1800 : false);
  const isInterlaced = Boolean(probe && /^(tt|bb|tb|bt)$/i.test(probe.fieldOrder));
  const isHighFps = Boolean(probe && probe.fps > 31);

  const isRawTsOrPipeInput = isPipeInput || !/\.m3u8(\?|$)/i.test(cleanUpstream);

  // Progressive H.264 8-bit 4:2:0 HLS (.m3u8) streams that already carry clean IDR segment boundaries
  // can be remuxed with -c:v copy. Raw MPEG-TS / pipe inputs often start mid-GOP or drop TS packets,
  // so they MUST be transcoded with clean 2s forced IDR keyframes to prevent macroblock smearing.
  const canCopyVideo = Boolean(
    !isRawTsOrPipeInput &&
      probe &&
      probe.videoCodec === 'h264' &&
      (!probe.pixFmt || /^yuvj?420p$/i.test(probe.pixFmt)) &&
      !isInterlaced &&
      !isUhd4kStream &&
      !isFastProfile
  );
  const canCopyAudio = Boolean(
    canCopyVideo &&
      probe?.hasAudio &&
      probe.audioCodec === 'aac' &&
      (!probe.audioProfile || /^(lc|main)$/i.test(probe.audioProfile))
  );

  const ffArgs: string[] = ['-hide_banner', '-loglevel', 'error'];
  if (!isPipeInput) {
    ffArgs.push(...getSpainFfmpegHttpProxyArgs(cleanUpstream));
    ffArgs.push('-user_agent', isXtreamLive ? 'IPTVSmartersPlayer' : TDT_DVB_UA);
    if (referer && /^https?:\/\//i.test(referer)) {
      ffArgs.push('-headers', `Referer: ${referer}\r\n`);
    }
  }

  let codecArgs: string[];
  if (canCopyVideo) {
    codecArgs = [
      '-c:v',
      'copy',
      ...(canCopyAudio
        ? ['-c:a', 'copy']
        : ['-c:a', 'aac', '-ac', '2', '-ar', '48000', '-b:a', '160k']),
    ];
  } else {
    const vfParts: string[] = [];
    if (isInterlaced) {
      vfParts.push('yadif=0:-1:1');
    }
    if (isUhd4kStream || isHighFps) {
      vfParts.push('fps=25');
    }
    if (isUhd4kStream) {
      vfParts.push('scale=1920:1080:flags=bilinear');
    } else if (isFastProfile) {
      vfParts.push("scale='min(1280,iw)':-2");
    } else {
      vfParts.push("scale='min(1920,iw)':-2");
    }
    vfParts.push('format=yuv420p');

    const lock25Fps = isUhd4kStream || isHighFps;
    codecArgs = [
      '-vf',
      vfParts.join(','),
      '-c:v',
      'libx264',
      '-preset',
      isFastProfile ? 'ultrafast' : isRawTsOrPipeInput ? 'superfast' : 'veryfast',
      '-tune',
      'zerolatency',
      '-profile:v',
      'high',
      '-level:v',
      isFastProfile ? '4.0' : '4.1',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      isFastProfile ? '21' : isRawTsOrPipeInput ? '20' : '19',
      '-maxrate',
      isFastProfile ? '2600k' : '4800k',
      '-bufsize',
      isFastProfile ? '5200k' : '9600k',
      ...(lock25Fps
        ? ['-r', '25', '-g', '50', '-keyint_min', '50']
        : ['-g', '50', '-keyint_min', '25']),
      '-sc_threshold',
      '0',
      '-force_key_frames',
      'expr:gte(t,n_forced*2)',
      '-threads',
      '0',
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-b:a',
      isFastProfile ? '128k' : '160k',
    ];
  }

  ffArgs.push(
    ...(isPipeInput
      ? ['-f', 'mpegts']
      : [
          ...(isXtreamLive
            ? []
            : ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '2']),
          '-rw_timeout',
          isXtreamLive ? '7000000' : '5000000',
          ...(/\.m3u8(\?|$)/i.test(cleanUpstream) ? ['-live_start_index', '-3'] : []),
        ]),
    '-analyzeduration',
    '400000',
    '-probesize',
    '400000',
    '-fflags',
    '+genpts+discardcorrupt',
    '-avoid_negative_ts',
    'make_zero',
    '-i',
    actualInput,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...codecArgs,
    '-sn',
    '-dn',
    '-f',
    'hls',
    '-hls_init_time',
    '1',
    '-hls_time',
    '2',
    '-hls_list_size',
    '12',
    '-hls_flags',
    'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename',
    segmentPattern,
    playlistPath
  );

  return ffArgs;
}

export interface OpenedMpegTsPipe {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  preamble: Buffer;
  abortController: AbortController;
  probe: ProbedStreamCodecInfo | null;
}

export async function openSingleSocketMpegTsStream(options: {
  cleanUpstream: string;
  referer: string;
  isXtreamLive: boolean;
  cachedProbe: ProbedStreamCodecInfo | null;
  onError?: (reason: string) => void;
}): Promise<OpenedMpegTsPipe | null> {
  const { cleanUpstream, referer, isXtreamLive, cachedProbe, onError } = options;
  const ac = new AbortController();
  const headers: Record<string, string> = {
    'User-Agent': isXtreamLive ? 'IPTVSmartersPlayer' : TDT_DVB_UA,
    Accept: '*/*',
  };
  if (referer && /^https?:\/\//i.test(referer)) {
    headers['Referer'] = referer;
  }
  const connectTimer = setTimeout(() => {
    try {
      ac.abort();
    } catch {
      // ignore
    }
  }, 3_200);

  try {
    const dispatcher = getSpainProxyDispatcherForTarget(cleanUpstream);
    const resp = await undiciFetch(cleanUpstream, {
      method: 'GET',
      headers,
      dispatcher,
      signal: ac.signal,
    });
    if (!resp.ok || !resp.body) {
      clearTimeout(connectTimer);
      if (resp.status === 404 || resp.status >= 500) {
        onError?.(`HTTP ${resp.status}`);
      }
      try {
        await resp.body?.cancel?.();
      } catch {
        // ignore
      }
      return null;
    }

    const reader = resp.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const targetPreamble = cachedProbe ? 48_000 : 220_000;
    while (totalBytes < targetPreamble) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        chunks.push(Buffer.from(value));
        totalBytes += value.byteLength;
      }
    }
    clearTimeout(connectTimer);

    if (totalBytes < 188) {
      ac.abort();
      onError?.('Empty DVB stream');
      return null;
    }

    const preamble = Buffer.concat(chunks);
    const probe = cachedProbe || (await probeDvbStreamFromBuffer(preamble, cleanUpstream));
    return { reader, preamble, abortController: ac, probe };
  } catch (err) {
    clearTimeout(connectTimer);
    try {
      ac.abort();
    } catch {
      // ignore
    }
    onError?.(err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function pumpMpegTsPipeToFfmpeg(options: {
  pipe: OpenedMpegTsPipe;
  stdin: NodeJS.WritableStream;
  isDead: () => boolean;
  onStall?: () => void;
  readIdleTimeoutMs?: number;
}): void {
  const { pipe, stdin, isDead, onStall, readIdleTimeoutMs = 6_500 } = options;
  stdin.on('error', () => {});
  const waitStdinReady = () =>
    new Promise<boolean>((resDrain) => {
      const onDrain = () => {
        stdin.off('close', onClose);
        resDrain(true);
      };
      const onClose = () => {
        stdin.off('drain', onDrain);
        resDrain(false);
      };
      stdin.once('drain', onDrain);
      stdin.once('close', onClose);
    });

  const readChunkWithTimeout = async () => {
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        pipe.reader.read(),
        new Promise<never>((_resolve, reject) => {
          stallTimer = setTimeout(() => {
            onStall?.();
            try {
              pipe.abortController.abort();
            } catch {
              // ignore
            }
            reject(new Error('MPEG-TS upstream read stall timeout'));
          }, readIdleTimeoutMs);
        }),
      ]);
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
    }
  };

  void (async () => {
    try {
      if (!stdin.write(pipe.preamble)) {
        if (!(await waitStdinReady())) return;
      }
      while (!isDead()) {
        const { done, value } = await readChunkWithTimeout();
        if (done || isDead()) break;
        if (value && value.byteLength > 0) {
          if (!stdin.write(Buffer.from(value))) {
            if (!(await waitStdinReady())) break;
          }
        }
      }
    } catch {
      // upstream aborted, stalled, or closed
    } finally {
      try {
        pipe.abortController.abort();
      } catch {
        // ignore
      }
      try {
        stdin.end();
      } catch {
        // ignore
      }
    }
  })();
}

