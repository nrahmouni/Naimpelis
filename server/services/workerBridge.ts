import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { logger } from '../utils/logger.ts';
import { runtimeMetrics } from './runtimeMetricsCollector.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BackgroundWorkerBridge {
  private worker: Worker | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;

  start(): void {
    if (process.env.NODE_ENV === 'test' || this.worker) return;
    const tsPath = path.resolve(__dirname, '../workers/backgroundWorker.ts');
    // Worker threads only spawn cleanly on TS when running under tsx/node >=22 strip-types or compiled JS
    if (!fs.existsSync(tsPath)) {
      runtimeMetrics.updateWorkerStatus({ mode: 'in-process', healthy: true });
      return;
    }

    try {
      const worker = new Worker(tsPath);
      this.worker = worker;
      runtimeMetrics.updateWorkerStatus({ mode: 'worker-thread', healthy: true, lastError: null });

      worker.on('message', (msg: { type?: string; durationMs?: number; ts?: number }) => {
        if (msg?.type === 'PONG') {
          this.lastPongAt = msg.ts || Date.now();
          runtimeMetrics.updateWorkerStatus({
            mode: 'worker-thread',
            healthy: true,
            lastSweepAt: this.lastPongAt,
          });
        } else if (msg?.type === 'CHECK_HEAD_RESULT') {
          runtimeMetrics.updateWorkerStatus({
            mode: 'worker-thread',
            healthy: true,
            lastSweepDurationMs: msg.durationMs || 0,
            lastSweepAt: Date.now(),
          });
        }
      });

      worker.on('error', (err) => {
        logger.debug({ err }, 'background_worker_fallback_to_in_process');
        runtimeMetrics.updateWorkerStatus({
          mode: 'in-process',
          healthy: true,
          lastError: err instanceof Error ? err.message : String(err),
        });
        this.stop();
      });

      worker.on('exit', () => {
        this.worker = null;
      });

      this.heartbeatTimer = setInterval(() => {
        this.worker?.postMessage({ type: 'PING' });
      }, 30_000);
      this.heartbeatTimer.unref?.();
      this.worker.postMessage({ type: 'PING' });
    } catch (err) {
      logger.debug({ err }, 'worker_thread_spawn_skipped_using_in_process');
      runtimeMetrics.updateWorkerStatus({ mode: 'in-process', healthy: true });
    }
  }

  recordSweepCycle(durationMs: number): void {
    const snap = runtimeMetrics.getSnapshot();
    runtimeMetrics.updateWorkerStatus({
      sweepsCompleted: snap.worker.sweepsCompleted + 1,
      lastSweepDurationMs: Math.round(durationMs),
      lastSweepAt: Date.now(),
      healthy: true,
    });
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.worker) {
      void this.worker.terminate().catch(() => {});
      this.worker = null;
    }
  }
}

export const workerBridge = new BackgroundWorkerBridge();
