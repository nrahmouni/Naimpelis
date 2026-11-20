import React, { type ComponentType } from 'react';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isChunkOrModuleLoadError(err: unknown): boolean {
  const msg = (err instanceof Error ? errorMessage(err) : String(err || '')).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes("reading 'usestate'") ||
    msg.includes("reading 'useref'") ||
    msg.includes("reading 'useeffect'") ||
    msg.includes("reading 'usecontext'") ||
    msg.includes("reading 'usememo'") ||
    msg.includes('invalid hook call')
  );
}

function errorMessage(err: Error): string {
  return err.message || '';
}

/**
 * Wraps React.lazy with automatic short-backoff retries so transient Vite dev
 * restarts or flaky mobile connections never crash the UI tree on a lazy chunk.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await delay(250 * (attempt + 1));
        }
      }
    }
    throw lastErr;
  });
}
