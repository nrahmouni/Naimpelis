import { parentPort } from 'worker_threads';

/**
 * Isolated Background Worker Thread for non-blocking DNS/HTTP telemetry & health pre-checks.
 * Keeps periodic maintenance off the primary Control Plane Express + WebSocket event loop.
 */
if (parentPort) {
  parentPort.on('message', async (msg: { type: string; urls?: string[] }) => {
    if (msg?.type === 'PING') {
      parentPort?.postMessage({ type: 'PONG', ts: Date.now(), pid: process.pid });
      return;
    }
    if (msg?.type === 'CHECK_HEAD_BATCH' && Array.isArray(msg.urls)) {
      const startedAt = Date.now();
      const results = await Promise.all(
        msg.urls.slice(0, 12).map(async (url) => {
          const t0 = Date.now();
          try {
            const res = await fetch(url, {
              method: 'HEAD',
              signal: AbortSignal.timeout(3500),
            });
            return { url, ok: res.ok, status: res.status, latencyMs: Date.now() - t0 };
          } catch {
            return { url, ok: false, status: 0, latencyMs: Date.now() - t0 };
          }
        })
      );
      parentPort?.postMessage({
        type: 'CHECK_HEAD_RESULT',
        durationMs: Date.now() - startedAt,
        results,
      });
    }
  });
}
