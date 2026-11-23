import { spawn } from 'child_process';
import {
  curlGetBuffer,
  getPreferredUpstreamUa,
} from '../../extractors/httpHelpers.ts';
import { runtimeMetrics } from '../../services/runtimeMetricsCollector.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { FFMPEG_BIN } from './proxyUtils.ts';

export const dvbAacSegmentCache = new LruTtlCache<string, { promise: Promise<Buffer>; ts: number }>(
  80,
  80_000
);

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

export function remuxDvbTsToAacWithHealth(options: {
  segmentUrl: string;
  referer: string;
  highPriority?: boolean;
  isCoolingDown: (url: string) => boolean;
  markDown: (url: string, reason: string, ttlMs?: number) => void;
}): Promise<Buffer> {
  const { segmentUrl, referer, highPriority = false, isCoolingDown, markDown } = options;
  if (isCoolingDown(segmentUrl)) {
    return Promise.reject(new Error('DVB upstream headend cooling down'));
  }
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
        timeoutMs: 4500,
      });
      if (resp.ok) {
        rawBuf = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
      // fallback to curl
    }

    if (!rawBuf || rawBuf.length === 0) {
      rawBuf = await curlGetBuffer(segmentUrl, segHeaders, 5);
    }
    if (!rawBuf || rawBuf.length < 376) {
      markDown(segmentUrl, 'Empty or unreachable DVB segment', 25_000);
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
            '160k',
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
              runtimeMetrics.recordDvbTranscodeResult(true);
              resolve(remuxed);
            } else {
              runtimeMetrics.recordDvbTranscodeResult(false);
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
