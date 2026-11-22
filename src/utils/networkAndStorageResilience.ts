import { useEffect, useState } from 'react';

export function safeStorageGetJson<T>(key: string, fallback: T, storage?: Storage): T {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!target) return fallback;
    const raw = target.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    try {
      const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
      target?.removeItem(key);
    } catch {
      // ignore storage access blocks
    }
    return fallback;
  }
}

export function safeStorageSetJson<T>(key: string, value: T, storage?: Storage): boolean {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!target) return false;
    const serialized = JSON.stringify(value);
    try {
      target.setItem(key, serialized);
      return true;
    } catch (err) {
      const isQuota =
        err instanceof Error &&
        (err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          err.message.toLowerCase().includes('quota'));
      if (!isQuota) return false;

      // Evict transient naim_cache_* keys first and retry write
      const cacheKeys: string[] = [];
      for (let i = 0; i < target.length; i++) {
        const k = target.key(i);
        if (k && k !== key && (k.startsWith('naim_cache_') || k.startsWith('riffan_cache_'))) {
          cacheKeys.push(k);
        }
      }
      for (const ck of cacheKeys) {
        try {
          target.removeItem(ck);
        } catch {
          // continue eviction
        }
      }
      try {
        target.setItem(key, serialized);
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

export interface RetryFetchOptions extends RequestInit {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function sleepWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchWithBackoff(
  input: RequestInfo | URL,
  options: RetryFetchOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    baseDelayMs = 250,
    maxDelayMs = 4000,
    timeoutMs = 10_000,
    fetchImpl = fetch,
    signal,
    ...rest
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Aborted');
    }

    const controller = new AbortController();
    const onOuterAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);

    try {
      const response = await fetchImpl(input, {
        ...rest,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onOuterAbort);

      const isRetryableStatus = response.status === 429 || response.status >= 500;
      if (!isRetryableStatus || attempt >= retries) {
        return response;
      }

      const retryAfterHeader = response.headers.get('Retry-After');
      let waitMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt + Math.round(Math.random() * 80));
      if (retryAfterHeader) {
        const parsedSec = Number(retryAfterHeader);
        if (Number.isFinite(parsedSec) && parsedSec > 0) {
          waitMs = Math.min(maxDelayMs, parsedSec * 1000);
        }
      }
      await sleepWithSignal(waitMs, signal);
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onOuterAbort);
      lastError = err;
      if (signal?.aborted || attempt >= retries) {
        throw err;
      }
      const waitMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt + Math.round(Math.random() * 80));
      await sleepWithSignal(waitMs, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetchWithBackoff exhausted retries');
}

export async function fetchJsonWithRetry<T>(
  input: RequestInfo | URL,
  options: RetryFetchOptions = {}
): Promise<T> {
  const res = await fetchWithBackoff(input, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface NetworkDiagnosticsState {
  online: boolean;
  effectiveType?: string;
  downlinkMbps?: number;
  saveData: boolean;
}

export function useNetworkDiagnostics(): NetworkDiagnosticsState {
  const readSnapshot = (): NetworkDiagnosticsState => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const conn = (nav as (Navigator & {
      connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
    }) | undefined)?.connection;
    return {
      online: nav ? nav.onLine : true,
      effectiveType: conn?.effectiveType,
      downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : undefined,
      saveData: Boolean(conn?.saveData),
    };
  };

  const [state, setState] = useState<NetworkDiagnosticsState>(readSnapshot);

  useEffect(() => {
    const refresh = () => setState(readSnapshot());
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const conn = (navigator as Navigator & {
      connection?: EventTarget;
    }).connection;
    conn?.addEventListener?.('change', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      conn?.removeEventListener?.('change', refresh);
    };
  }, []);

  return state;
}
