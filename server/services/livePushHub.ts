import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger.ts';
import { runtimeMetrics } from './runtimeMetricsCollector.ts';

export type PublicPushEventName =
  | 'connected'
  | 'scores:update'
  | 'football-board:update'
  | 'channels:health'
  | 'heartbeat';

interface SseClient {
  id: string;
  res: Response;
  connectedAt: number;
}

class LivePushHub {
  private publicClients = new Map<string, SseClient>();
  private adminClients = new Map<string, SseClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private adminTickerTimer: ReturnType<typeof setInterval> | null = null;
  private totalBroadcasts = 0;

  private adminSnapshotProvider: (() => Promise<unknown> | unknown) | null = null;

  setAdminSnapshotProvider(fn: () => Promise<unknown> | unknown): void {
    this.adminSnapshotProvider = fn;
  }

  start(): void {
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        runtimeMetrics.sampleSystemTick();
        this.broadcastPublic('heartbeat', { ts: Date.now() });
      }, 15_000);
      this.heartbeatTimer.unref?.();
    }

    if (!this.adminTickerTimer) {
      this.adminTickerTimer = setInterval(() => {
        if (this.adminClients.size === 0 || !this.adminSnapshotProvider) return;
        void Promise.resolve(this.adminSnapshotProvider())
          .then((snap) => {
            this.broadcastAdmin('admin:telemetry', snap);
          })
          .catch((err) => {
            logger.debug({ err }, 'admin_sse_snapshot_error');
          });
      }, 2500);
      this.adminTickerTimer.unref?.();
    }
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.adminTickerTimer) {
      clearInterval(this.adminTickerTimer);
      this.adminTickerTimer = null;
    }
    for (const c of this.publicClients.values()) {
      try {
        c.res.end();
      } catch {
        // ignore
      }
    }
    for (const c of this.adminClients.values()) {
      try {
        c.res.end();
      } catch {
        // ignore
      }
    }
    this.publicClients.clear();
    this.adminClients.clear();
  }

  private writeSse(res: Response, event: string, data: unknown): boolean {
    if (res.writableEnded || res.destroyed) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }

  attachPublicClient(req: Request, res: Response): void {
    const id = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.publicClients.set(id, { id, res, connectedAt: Date.now() });
    this.writeSse(res, 'connected', { id, ts: Date.now() });

    req.on('close', () => {
      this.publicClients.delete(id);
    });
  }

  attachAdminClient(req: Request, res: Response): void {
    const id = `admin-sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.adminClients.set(id, { id, res, connectedAt: Date.now() });
    this.writeSse(res, 'connected', { id, ts: Date.now() });

    if (this.adminSnapshotProvider) {
      void Promise.resolve(this.adminSnapshotProvider())
        .then((snap) => this.writeSse(res, 'admin:telemetry', snap))
        .catch(() => {});
    }

    req.on('close', () => {
      this.adminClients.delete(id);
    });
  }

  broadcastPublic(event: PublicPushEventName, payload: unknown): void {
    if (this.publicClients.size === 0) return;
    this.totalBroadcasts += 1;
    for (const [id, client] of this.publicClients.entries()) {
      if (!this.writeSse(client.res, event, payload)) {
        this.publicClients.delete(id);
      }
    }
  }

  broadcastAdmin(event: string, payload: unknown): void {
    if (this.adminClients.size === 0) return;
    this.totalBroadcasts += 1;
    for (const [id, client] of this.adminClients.entries()) {
      if (!this.writeSse(client.res, event, payload)) {
        this.adminClients.delete(id);
      }
    }
  }

  getStats() {
    return {
      publicSseClients: this.publicClients.size,
      adminSseClients: this.adminClients.size,
      totalBroadcasts: this.totalBroadcasts,
    };
  }
}

export const livePushHub = new LivePushHub();

export function registerLivePushRoutes(app: Express): void {
  app.get('/api/events/stream', (req, res) => {
    livePushHub.attachPublicClient(req, res);
  });
}
