import { spawn } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import { sniffStreamViaHttp } from '../services/streamSnifferService.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA, curlGetText, isBlockedAdUrl } from './httpHelpers.ts';

const FFMPEG_BIN: string = fs.existsSync('/usr/bin/ffmpeg')
  ? '/usr/bin/ffmpeg'
  : typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)
    ? ffmpegStatic
    : 'ffmpeg';

const liveFrameHealthCache = new LruTtlCache<string, boolean>(300, 150_000);

export function healUpstreamSportsDomain(rawUrl: string): string {
  return rawUrl.replace(/\/\/(?:doc|dog)\.tilinhd\.lol\b/gi, '//pig.footunder.online');
}

export function decodeStreamXhdPlaybackUrl(html: string): string | null {
  try {
    const blockMatch = html.match(
      /var\s+playbackURL\s*=\s*""[\s\S]*?function\s+([A-Za-z0-9_$]+)\s*\(\)\s*\{\s*return\s+(\d+)\s*;\s*\}\s*function\s+([A-Za-z0-9_$]+)\s*\(\)\s*\{\s*return\s+(\d+)\s*;\s*\}/
    );
    if (!blockMatch) return null;
    const k = Number(blockMatch[2]) + Number(blockMatch[4]);
    const arrMatch = blockMatch[0].match(/\[\s*\[\s*\d+\s*,\s*"[^"]+"\s*\][\s\S]*?\]\s*\]/);
    if (!arrMatch) return null;
    const arr: [number, string][] = JSON.parse(arrMatch[0]);
    arr.sort((a, b) => a[0] - b[0]);
    let out = '';
    for (const [, b64] of arr) {
      const digits = Buffer.from(b64, 'base64').toString('utf8').replace(/\D/g, '');
      if (!digits) continue;
      out += String.fromCharCode(parseInt(digits, 10) - k);
    }
    return out.startsWith('http') ? out : null;
  } catch {
    return null;
  }
}

export function decodeSportsPlaystreamEconfig(econfig: string): any | null {
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

export async function fetchSportsHtmlHop(url: string, referer: string): Promise<string> {
  try {
    const res = await streamingFetch(url, {
      headers: {
        Referer: referer,
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
      },
      timeoutMs: 4500,
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
      const subText = await fetchSportsHtmlHop(segUrl, referer);
      if (subText.includes('#EXTM3U')) {
        return verifyM3u8HasCleanVideoFrame(subText, segUrl, referer);
      }
      return false;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4200);
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    try {
      const resp = await streamingFetch(segUrl, {
        headers: {
          Referer: referer,
          'User-Agent': CHROME_UA,
          Range: 'bytes=0-520000',
        },
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        clearTimeout(timer);
        liveFrameHealthCache.set(m3uUrl, false);
        return false;
      }

      const reader = resp.body.getReader();
      while (totalBytes < 520_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(Buffer.from(value));
        totalBytes += value.byteLength;
      }
      ctrl.abort();
    } catch {
      // Partial buffer already collected before abort is expected
    } finally {
      clearTimeout(timer);
    }

    const sampleBuf = Buffer.concat(chunks);
    if (sampleBuf.length < 4_096) {
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    const hasMpegTsSync =
      (sampleBuf[0] === 0x47 && sampleBuf.length > 188 && sampleBuf[188] === 0x47) ||
      sampleBuf.indexOf(0x47) !== -1;
    const hasMp4Box =
      sampleBuf.includes(Buffer.from('ftyp')) || sampleBuf.includes(Buffer.from('moof'));
    if (!hasMpegTsSync && !hasMp4Box) {
      liveFrameHealthCache.set(m3uUrl, false);
      return false;
    }

    let ffmpegSpawnFailed = false;
    const rawFrame = await new Promise<Buffer>((resolve) => {
      const ff = spawn(FFMPEG_BIN, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vf',
        'scale=160:90',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]);
      const outChunks: Buffer[] = [];
      const killTimer = setTimeout(() => {
        try {
          ff.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2400);
      ff.stdout.on('data', (c: Buffer) => outChunks.push(c));
      ff.on('error', () => {
        ffmpegSpawnFailed = true;
        clearTimeout(killTimer);
        resolve(Buffer.alloc(0));
      });
      ff.on('close', () => {
        clearTimeout(killTimer);
        resolve(Buffer.concat(outChunks));
      });
      ff.stdin.on('error', () => {});
      ff.stdin.end(sampleBuf);
    });

    const expectedBytes = 160 * 90 * 3;
    if (ffmpegSpawnFailed || rawFrame.length < expectedBytes) {
      liveFrameHealthCache.set(m3uUrl, true);
      return true;
    }

    const totalPixels = 160 * 90;
    const bottomStartY = 45;
    const bottomPixels = 160 * (90 - bottomStartY);
    let decoderGreenAll = 0;
    let decoderGreenBottom = 0;

    for (let y = 0; y < 90; y++) {
      for (let x = 0; x < 160; x++) {
        const idx = (y * 160 + x) * 3;
        const r = rawFrame[idx];
        const g = rawFrame[idx + 1];
        const b = rawFrame[idx + 2];

        const isDecoderGreen =
          g > 95 && r < 45 && b < 45 && g > r + 55 && g > b + 55;
        if (isDecoderGreen) {
          decoderGreenAll++;
          if (y >= bottomStartY) decoderGreenBottom++;
        }
      }
    }

    const greenAllRatio = decoderGreenAll / totalPixels;
    const greenBottomRatio = decoderGreenBottom / bottomPixels;
    const isClean = greenBottomRatio < 0.18 && greenAllRatio < 0.20;

    liveFrameHealthCache.set(m3uUrl, isClean);
    return isClean;
  } catch {
    return false;
  }
}

export async function extractLiveSportsHlsDirect(
  initialUrl: string
): Promise<{
  streamUrl: string;
  referer: string;
  isDirectMp4: boolean;
  isBrokenGreenFeed?: boolean;
} | null> {
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

    if (html.includes('var playbackURL=')) {
      const streamXhdM3u = decodeStreamXhdPlaybackUrl(html);
      if (streamXhdM3u) {
        const refOrigin = new URL(currentUrl).origin + '/';
        const checkM3u = await fetchSportsHtmlHop(streamXhdM3u, refOrigin);
        if (checkM3u.includes('#EXTM3U')) {
          return {
            streamUrl: streamXhdM3u,
            referer: refOrigin,
            isDirectMp4: false,
          };
        }
      }
      return null;
    }

    const econfigMatch = html.match(/window\._econfig\s*=\s*['"]([^'"]+)['"]/);
    if (econfigMatch && econfigMatch[1]) {
      const cfg = decodeSportsPlaystreamEconfig(econfigMatch[1]);
      const rawCandidate: string = cfg?.stream_url_nop2p || cfg?.stream_url || '';
      if (rawCandidate) {
        const origin = new URL(currentUrl).origin;
        const candidateTargets: { url: string; ref: string }[] = [
          rawCandidate.startsWith('http')
            ? {
                url: `${origin}/playstream.php?stream_tv=${Buffer.from(rawCandidate).toString('base64')}`,
                ref: currentUrl,
              }
            : { url: new URL(rawCandidate, currentUrl).href, ref: currentUrl },
        ];

        if (!origin.includes('pig.footunder.online') && rawCandidate.startsWith('http')) {
          candidateTargets.push({
            url: `https://pig.footunder.online/playstream.php?stream_tv=${Buffer.from(rawCandidate).toString('base64')}`,
            ref: 'https://pig.footunder.online/playstream.php',
          });
        }

        let sawM3uButScrambled = false;
        for (const cand of candidateTargets) {
          const checkM3u = await fetchSportsHtmlHop(cand.url, cand.ref);
          if (checkM3u.includes('#EXTM3U')) {
            const frameOk = await verifyM3u8HasCleanVideoFrame(checkM3u, cand.url, cand.ref);
            if (!frameOk) {
              sawM3uButScrambled = true;
              continue;
            }
            return {
              streamUrl: cand.url,
              referer: cand.ref,
              isDirectMp4: false,
            };
          }
        }
        if (sawM3uButScrambled) {
          return {
            streamUrl: '',
            referer: currentUrl,
            isDirectMp4: false,
            isBrokenGreenFeed: true,
          };
        }
      }
      return {
        streamUrl: '',
        referer: currentUrl,
        isDirectMp4: false,
        isBrokenGreenFeed: true,
      };
    }

    const directM3u8Match = html.match(
      /(?:source|file|src|streamUrl)\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i
    );
    if (directM3u8Match && directM3u8Match[1] && !isBlockedAdUrl(directM3u8Match[1])) {
      const m3uCandidate = directM3u8Match[1];
      const checkM3u = await fetchSportsHtmlHop(m3uCandidate, currentUrl);
      if (checkM3u.includes('#EXTM3U')) {
        const frameOk = await verifyM3u8HasCleanVideoFrame(checkM3u, m3uCandidate, currentUrl);
        if (!frameOk) {
          return {
            streamUrl: '',
            referer: currentUrl,
            isDirectMp4: false,
            isBrokenGreenFeed: true,
          };
        }
      }
      return {
        streamUrl: m3uCandidate,
        referer: currentUrl,
        isDirectMp4: false,
      };
    }

    const b64Matches = [
      ...html.matchAll(/(?:atob\(\s*['"]|encodedUrl\s*=\s*['"])([A-Za-z0-9+/=]{16,})['"]/g),
    ];
    let followedB64 = false;
    for (const m of b64Matches) {
      try {
        const decoded = Buffer.from(m[1], 'base64').toString('utf8').trim();
        if ((decoded.startsWith('http') || decoded.startsWith('/')) && !isBlockedAdUrl(decoded)) {
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

export async function unwrapNestedEmbedChain(
  initialUrl: string
): Promise<{ targetUrl: string; referer: string }> {
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

export async function sniffStreamWithHeadless(
  rawUrl: string
): Promise<{ streamUrl: string; referer: string; isDirectMp4: boolean } | null> {
  try {
    const { targetUrl, referer } = await unwrapNestedEmbedChain(rawUrl);
    return await sniffStreamViaHttp(targetUrl, referer);
  } catch {
    return null;
  }
}
