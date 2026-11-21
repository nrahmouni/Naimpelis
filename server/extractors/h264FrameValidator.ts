import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA, curlGetText } from './httpHelpers.ts';

const FRAME_W = 160;
const FRAME_H = 90;
const FRAME_BYTES = FRAME_W * FRAME_H * 3;
const liveFrameHealthCache = new LruTtlCache<string, boolean>(350, 90_000);

const FATAL_H264_STDERR_RE =
  /deblocking_filter_idc|reference overflow|decode_slice_header error|cabac_init_idc|Missing reference picture|sps_id.*out of range|pps_id.*out of range|non-existing PPS|top block unavailable|left block unavailable|error while decoding MB|Invalid NAL unit|no frame!|overread \d+ bits/i;

export function isFatalH264Stderr(stderr: string): boolean {
  return FATAL_H264_STDERR_RE.test(String(stderr || ''));
}

export function validateH264StreamBuffer(sampleBuf: Buffer): { valid: boolean; reason?: string } {
  if (!sampleBuf || sampleBuf.length < 4_096) {
    return { valid: false, reason: 'buffer_too_small' };
  }

  const headText = sampleBuf.subarray(0, Math.min(sampleBuf.length, 96)).toString('utf8').trimStart();
  if (/^(<!doctype|<html\b|<head\b|<body\b|\{)/i.test(headText)) {
    return { valid: false, reason: 'html_or_json_error_payload' };
  }

  // Verify genuine aligned MPEG-TS 188-byte sync pattern (at offset 0..376) or MP4/fMP4 container boxes
  let hasAlignedTsSync = false;
  const syncSearchLimit = Math.min(sampleBuf.length - 377, 1024);
  for (let i = 0; i <= syncSearchLimit; i++) {
    if (
      sampleBuf[i] === 0x47 &&
      sampleBuf[i + 188] === 0x47 &&
      sampleBuf[i + 376] === 0x47
    ) {
      hasAlignedTsSync = true;
      break;
    }
  }
  const hasLooseTsSync =
    hasAlignedTsSync ||
    (sampleBuf[0] === 0x47 && sampleBuf.length > 188 && sampleBuf[188] === 0x47);
  const hasMp4Box =
    sampleBuf.includes(Buffer.from('ftyp')) ||
    sampleBuf.includes(Buffer.from('moof')) ||
    sampleBuf.includes(Buffer.from('styp')) ||
    sampleBuf.includes(Buffer.from('sidx'));

  if (!hasLooseTsSync && !hasMp4Box) {
    return { valid: false, reason: 'missing_ts_or_mp4_sync' };
  }

  const probeSlice = sampleBuf.subarray(0, Math.min(sampleBuf.length, 4_096));
  if (new Set(probeSlice).size <= 4) {
    return { valid: false, reason: 'flat_corrupt_buffer' };
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

async function fetchManifestSnippet(
  url: string,
  referer: string
): Promise<{ text: string; finalUrl: string }> {
  try {
    const res = await streamingFetch(url, {
      headers: { Referer: referer, 'User-Agent': CHROME_UA, Accept: '*/*' },
      timeoutMs: 2800,
    });
    if (res.ok) {
      return { text: await res.text(), finalUrl: res.url || url };
    }
  } catch {
    // fallback to curl
  }
  const fb = await curlGetText(url, { Referer: referer, 'User-Agent': CHROME_UA }, 4).catch(
    () => ({ text: '', effectiveUrl: url })
  );
  return { text: fb.text, finalUrl: fb.effectiveUrl || url };
}

/**
 * Fast, lightweight HLS stream liveness & container validator (<1.6s, 4KB-24KB read).
 * Avoids downloading 580KB truncated segments + spawning ffmpeg (which caused 2s-19s
 * startup stalls and false H.264 macroblock truncation rejections on healthy live channels).
 */
export async function verifyM3u8HasCleanVideoFrame(
  m3uText: string,
  m3uUrl: string,
  referer: string,
  depth = 0
): Promise<boolean> {
  const cached = liveFrameHealthCache.get(m3uUrl);
  if (cached !== undefined) {
    return cached;
  }

  try {
    if (!m3uText || !m3uText.includes('#EXTM3U') || /nosignal/i.test(m3uText)) {
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    if (/#EXT-X-KEY:/i.test(m3uText)) {
      liveFrameHealthCache.set(m3uUrl, true);
      return true;
    }

    const segLines = m3uText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (segLines.length === 0) {
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    // Master playlist -> follow first variant quickly (capped at depth 2)
    if (m3uText.includes('#EXT-X-STREAM-INF') && depth < 2) {
      const subUrl = new URL(segLines[0], m3uUrl).href;
      const sub = await fetchManifestSnippet(subUrl, referer);
      if (!sub.text.includes('#EXTM3U')) {
        liveFrameHealthCache.set(m3uUrl, false);
        return false;
      }
      const ok = await verifyM3u8HasCleanVideoFrame(sub.text, sub.finalUrl || subUrl, referer, depth + 1);
      liveFrameHealthCache.set(m3uUrl, ok);
      return ok;
    }

    const chosenRel =
      segLines.length >= 2 ? segLines[segLines.length - 2] : segLines[segLines.length - 1];
    const segUrl = new URL(chosenRel, m3uUrl).href;

    if (/\.m3u8(\?|$)/i.test(segUrl) && depth < 2) {
      const sub = await fetchManifestSnippet(segUrl, referer);
      if (sub.text.includes('#EXTM3U')) {
        const ok = await verifyM3u8HasCleanVideoFrame(sub.text, sub.finalUrl || segUrl, referer, depth + 1);
        liveFrameHealthCache.set(m3uUrl, ok);
        return ok;
      }
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1800);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let httpStatus = 0;
    let transportError = false;

    try {
      const resp = await streamingFetch(segUrl, {
        headers: {
          Referer: referer,
          'User-Agent': CHROME_UA,
          Accept: '*/*',
          Range: 'bytes=0-24575',
        },
        signal: ctrl.signal,
        timeoutMs: 1800,
      });
      httpStatus = resp.status;
      if (!resp.ok || !resp.body) {
        clearTimeout(timer);
        if (httpStatus >= 400 && httpStatus !== 416) {
          liveFrameHealthCache.set(m3uUrl, false);
          return false;
        }
        liveFrameHealthCache.set(m3uUrl, true);
        return true;
      }

      const reader = resp.body.getReader();
      while (totalBytes < 16_384) {
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
    if (transportError && sampleBuf.length < 4_096) {
      // Do not reject a working playlist solely because a range probe timed out
      return true;
    }

    const bufCheck = validateH264StreamBuffer(sampleBuf);
    liveFrameHealthCache.set(m3uUrl, bufCheck.valid);
    return bufCheck.valid;
  } catch {
    return true;
  }
}
