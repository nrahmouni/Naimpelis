import { spawn } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA, curlGetText } from './httpHelpers.ts';

const FFMPEG_BIN: string = fs.existsSync('/usr/bin/ffmpeg')
  ? '/usr/bin/ffmpeg'
  : typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)
    ? ffmpegStatic
    : 'ffmpeg';

const FRAME_W = 160;
const FRAME_H = 90;
const FRAME_BYTES = FRAME_W * FRAME_H * 3;
const liveFrameHealthCache = new LruTtlCache<string, boolean>(300, 150_000);

const FATAL_H264_STDERR_RE =
  /deblocking_filter_idc|reference overflow|decode_slice_header error|cabac_init_idc|Missing reference picture|sps_id.*out of range|pps_id.*out of range|non-existing PPS|top block unavailable|left block unavailable|error while decoding MB|Invalid NAL unit|no frame!|overread \d+ bits/i;

export function isFatalH264Stderr(stderr: string): boolean {
  return FATAL_H264_STDERR_RE.test(String(stderr || ''));
}

export function validateH264StreamBuffer(sampleBuf: Buffer): { valid: boolean; reason?: string } {
  if (!sampleBuf || sampleBuf.length < 4_096) {
    return { valid: false, reason: 'buffer_too_small' };
  }

  const hasMpegTsSync =
    (sampleBuf[0] === 0x47 && sampleBuf.length > 188 && sampleBuf[188] === 0x47) ||
    sampleBuf.indexOf(0x47) !== -1;
  const hasMp4Box =
    sampleBuf.includes(Buffer.from('ftyp')) || sampleBuf.includes(Buffer.from('moof'));
  if (!hasMpegTsSync && !hasMp4Box) {
    return { valid: false, reason: 'missing_ts_or_mp4_sync' };
  }

  const probeSlice = sampleBuf.subarray(0, Math.min(sampleBuf.length, 4_096));
  if (new Set(probeSlice).size <= 4) {
    return { valid: false, reason: 'flat_corrupt_buffer' };
  }

  // Scan Annex-B H.264 NAL start codes (0x000001) to catch malformed slice/NAL headers early
  const scanLimit = Math.min(sampleBuf.length - 4, 65_536);
  let totalNals = 0;
  let corruptNals = 0;
  for (let i = 0; i < scanLimit; i++) {
    if (sampleBuf[i] === 0x00 && sampleBuf[i + 1] === 0x00 && sampleBuf[i + 2] === 0x01) {
      const nalHdr = sampleBuf[i + 3];
      const forbiddenZeroBit = (nalHdr & 0x80) !== 0;
      const nalType = nalHdr & 0x1f;
      totalNals++;
      if (forbiddenZeroBit || nalType === 0 || nalType > 23) {
        corruptNals++;
      }
      i += 3;
    }
  }
  if (totalNals >= 4 && corruptNals / totalNals > 0.45) {
    return { valid: false, reason: 'corrupt_nal_headers' };
  }

  return { valid: true };
}

export function analyzeDecodedRgbFrame(
  rawFrame: Buffer,
  ffmpegStderr = ''
): { clean: boolean; reason?: string } {
  if (!rawFrame || rawFrame.length < FRAME_BYTES) {
    return { clean: false, reason: 'incomplete_frame' };
  }

  if (isFatalH264Stderr(ffmpegStderr)) {
    return { clean: false, reason: 'h264_slice_header_error' };
  }

  if (new Set(rawFrame).size <= 4) {
    // Flat uniform uninitialized buffer (e.g. #818181 grey or #005200 / #004c00 green)
    return { clean: false, reason: 'flat_uniform_frame' };
  }

  const totalPixels = FRAME_W * FRAME_H;
  const bottomStartY = Math.floor(FRAME_H / 2);
  const bottomPixels = FRAME_W * (FRAME_H - bottomStartY);

  let decoderGreenAll = 0;
  let decoderGreenBottom = 0;
  let flat005200GreenPixels = 0;
  let flatGreyPixels = 0;

  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const idx = (y * FRAME_W + x) * 3;
      const r = rawFrame[idx];
      const g = rawFrame[idx + 1];
      const b = rawFrame[idx + 2];

      const deltaPrev =
        x > 0
          ? Math.abs(r - rawFrame[idx - 3]) +
            Math.abs(g - rawFrame[idx - 2]) +
            Math.abs(b - rawFrame[idx - 1])
          : 999;

      const isBrightNeonGreen = g > 105 && r < 42 && b < 42 && g > r + 60 && g > b + 60;
      const isFlatDarkGreenBlock =
        deltaPrev <= 4 && g > 38 && r < 34 && b < 34 && g > r + 22 && g > b + 22;
      const is005200Family =
        r <= 24 && b <= 24 && g >= 62 && g <= 104 && g - r >= 40 && g - b >= 40;
      const isFlatGrey = Math.abs(r - g) <= 5 && Math.abs(g - b) <= 5 && r >= 114 && r <= 144;

      if (isBrightNeonGreen || isFlatDarkGreenBlock || is005200Family) {
        decoderGreenAll++;
        if (y >= bottomStartY) decoderGreenBottom++;
      }
      if (isFlatGrey) {
        flatGreyPixels++;
      }

      if (is005200Family && deltaPrev <= 6) {
        flat005200GreenPixels++;
      }
    }
  }

  const flat005200Ratio = flat005200GreenPixels / totalPixels;
  if (flat005200Ratio >= 0.12) {
    return { clean: false, reason: 'flat_green_005200_frame' };
  }

  if (flatGreyPixels / totalPixels >= 0.62) {
    return { clean: false, reason: 'flat_grey_corrupt_frame' };
  }

  const greenAllRatio = decoderGreenAll / totalPixels;
  const greenBottomRatio = decoderGreenBottom / bottomPixels;
  if (greenBottomRatio >= 0.28 || greenAllRatio >= 0.3) {
    return { clean: false, reason: 'decoder_green_artifacts' };
  }

  return { clean: true };
}

async function fetchManifestSnippet(url: string, referer: string): Promise<string> {
  try {
    const res = await streamingFetch(url, {
      headers: { Referer: referer, 'User-Agent': CHROME_UA, Accept: '*/*' },
      timeoutMs: 4500,
    });
    if (res.ok) return await res.text();
  } catch {
    // fallback to curl
  }
  const fb = await curlGetText(url, { Referer: referer, 'User-Agent': CHROME_UA }, 5).catch(
    () => ({ text: '' })
  );
  return fb.text;
}

export async function verifyM3u8HasCleanVideoFrame(
  m3uText: string,
  m3uUrl: string,
  referer: string
): Promise<boolean> {
  const cached = liveFrameHealthCache.get(m3uUrl);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const segLines = m3uText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (segLines.length === 0) return false;

    const chosenRel =
      segLines.length >= 2 ? segLines[segLines.length - 2] : segLines[segLines.length - 1];
    const segUrl = new URL(chosenRel, m3uUrl).href;

    if (/\.m3u8(\?|$)/i.test(segUrl)) {
      const subText = await fetchManifestSnippet(segUrl, referer);
      if (subText.includes('#EXTM3U')) {
        return verifyM3u8HasCleanVideoFrame(subText, segUrl, referer);
      }
      return false;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5500);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let httpStatus = 0;
    let transportError = false;

    try {
      const resp = await streamingFetch(segUrl, {
        headers: { Referer: referer, 'User-Agent': CHROME_UA, Accept: '*/*' },
        signal: ctrl.signal,
      });
      httpStatus = resp.status;
      if (!resp.ok || !resp.body) {
        clearTimeout(timer);
        if (httpStatus >= 400) {
          liveFrameHealthCache.set(m3uUrl, false);
          return false;
        }
        return true;
      }

      const reader = resp.body.getReader();
      while (totalBytes < 580_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(Buffer.from(value));
        totalBytes += value.byteLength;
      }
      ctrl.abort();
    } catch {
      transportError = true;
    } finally {
      clearTimeout(timer);
    }

    const sampleBuf = Buffer.concat(chunks);
    // Do not poison live channels as "green/corrupt" solely because the segment probe timed out before reading 4KB
    if (transportError && sampleBuf.length < 4_096) {
      return true;
    }

    const bufCheck = validateH264StreamBuffer(sampleBuf);
    if (!bufCheck.valid) {
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    let ffmpegSpawnFailed = false;
    let ffmpegExitCode: number | null = null;
    let ffmpegStderr = '';
    const rawFrame = await new Promise<Buffer>((resolve) => {
      const ff = spawn(FFMPEG_BIN, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vf',
        `scale=${FRAME_W}:${FRAME_H}`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]);
      const outChunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      const killTimer = setTimeout(() => {
        try {
          ff.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2500);
      ff.stdout.on('data', (c: Buffer) => outChunks.push(c));
      ff.stderr.on('data', (c: Buffer) => errChunks.push(c));
      ff.on('error', () => {
        ffmpegSpawnFailed = true;
        clearTimeout(killTimer);
        resolve(Buffer.alloc(0));
      });
      ff.on('close', (code) => {
        ffmpegExitCode = code;
        ffmpegStderr = Buffer.concat(errChunks).toString('utf8');
        clearTimeout(killTimer);
        resolve(Buffer.concat(outChunks));
      });
      ff.stdin.on('error', () => {});
      ff.stdin.end(sampleBuf);
    });

    if (ffmpegSpawnFailed || (ffmpegExitCode !== 0 && isFatalH264Stderr(ffmpegStderr))) {
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    // Valid TS/NAL stream with zero fatal H.264 errors that simply lacked a complete I-frame in the read slice should play
    if (rawFrame.length < FRAME_BYTES) {
      return true;
    }

    const verdict = analyzeDecodedRgbFrame(rawFrame, ffmpegStderr);
    liveFrameHealthCache.set(m3uUrl, verdict.clean);
    return verdict.clean;
  } catch {
    return true;
  }
}
