import type http from 'http';
import type { WebSocketServer } from 'ws';
import { logger } from './logger.ts';

export interface GracefulShutdownDeps {
  httpServer: http.Server;
  wss?: WebSocketServer;
  stopTimers?: Array<() => void>;
  cleanupSessions?: Array<() => void | Promise<void>>;
  timeoutMs?: number;
  exitFn?: (code: number) => void;
}

export function createGracefulShutdownHandler(deps: GracefulShutdownDeps) {
  let shuttingDown = false;
  const timeoutMs = deps.timeoutMs ?? 6000;
  const exitFn = deps.exitFn ?? ((code: number) => process.exit(code));

  return async function handleShutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'graceful_shutdown_started');

    const forceTimer = setTimeout(() => {
      logger.warn({ signal, timeoutMs }, 'graceful_shutdown_forced_exit');
      exitFn(0);
    }, timeoutMs);
    forceTimer.unref?.();

    for (const stop of deps.stopTimers || []) {
      try {
        stop();
      } catch (err) {
        logger.warn({ err }, 'graceful_shutdown_timer_stop_error');
      }
    }

    for (const cleanup of deps.cleanupSessions || []) {
      try {
        await cleanup();
      } catch (err) {
        logger.warn({ err }, 'graceful_shutdown_session_cleanup_error');
      }
    }

    if (deps.wss) {
      try {
        for (const client of deps.wss.clients) {
          try {
            if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
              client.close(1001, 'Server restarting');
            }
          } catch {
            // ignore closed socket
          }
        }
        await new Promise<void>((resolve) => {
          deps.wss?.close(() => resolve());
        });
      } catch (err) {
        logger.warn({ err }, 'graceful_shutdown_wss_close_error');
      }
    }

    await new Promise<void>((resolve) => {
      deps.httpServer.close((err) => {
        if (err) {
          logger.warn({ err }, 'graceful_shutdown_http_close_warning');
        }
        resolve();
      });
    });

    clearTimeout(forceTimer);
    logger.info({ signal }, 'graceful_shutdown_complete');
    exitFn(0);
  };
}
