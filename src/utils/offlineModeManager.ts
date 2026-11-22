import { useEffect, useState } from 'react';
import { announceScreenReader } from '../components/ui/A11yUtilities';

export const FORCE_OFFLINE_STORAGE_KEY = 'riffan_force_offline_v1';
export const FORCE_OFFLINE_CHANGED_EVENT = 'riffan:force-offline-changed';

interface OfflineModeSnapshot {
  forceOffline: boolean;
  blockedCount: number;
}

const listeners = new Set<(snap: OfflineModeSnapshot) => void>();
let guardInstalled = false;
let blockedRequestsCount = 0;

function readPersistedForceOffline(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FORCE_OFFLINE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let forceOfflineActive = readPersistedForceOffline();

function emitSnapshot(): void {
  const snap: OfflineModeSnapshot = {
    forceOffline: forceOfflineActive,
    blockedCount: blockedRequestsCount,
  };
  listeners.forEach((fn) => fn(snap));
}

function recordBlockedRequest(): void {
  blockedRequestsCount += 1;
  emitSnapshot();
}

function isLocalInMemoryUrl(rawUrl: string): boolean {
  const u = String(rawUrl || '').trim().toLowerCase();
  return u.startsWith('data:') || u.startsWith('blob:');
}

export function isForceOfflineEnabled(): boolean {
  return forceOfflineActive;
}

export function getBlockedNetworkCount(): number {
  return blockedRequestsCount;
}

export function setForceOfflineEnabled(enabled: boolean): void {
  const next = Boolean(enabled);
  forceOfflineActive = next;
  if (!next) {
    blockedRequestsCount = 0;
  }
  if (typeof window !== 'undefined') {
    try {
      if (next) {
        window.localStorage.setItem(FORCE_OFFLINE_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(FORCE_OFFLINE_STORAGE_KEY);
      }
    } catch {
      // ignore restricted WebView storage failures
    }
    try {
      document.documentElement.dataset.forceOffline = next ? '1' : '0';
    } catch {
      // ignore DOM errors in non-DOM envs
    }
    window.dispatchEvent(
      new CustomEvent<{ enabled: boolean }>(FORCE_OFFLINE_CHANGED_EVENT, {
        detail: { enabled: next },
      })
    );
  }
  announceScreenReader(
    next
      ? 'Modo sin conexión forzado activado. Peticiones de red desactivadas.'
      : 'Modo sin conexión desactivado. Conectividad de red restaurada.',
    'assertive'
  );
  emitSnapshot();
}

export function toggleForceOfflineMode(): boolean {
  const next = !forceOfflineActive;
  setForceOfflineEnabled(next);
  return next;
}

function createOfflineError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(
      'Force Offline mode active: network requests are disabled.',
      'NetworkError'
    );
  }
  const err = new Error('Force Offline mode active: network requests are disabled.');
  err.name = 'NetworkError';
  return err;
}

function createOfflineClosedWebSocketStub(url: string): WebSocket {
  const listenersMap = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const stub = {
    url,
    readyState: 3,
    bufferedAmount: 0,
    extensions: '',
    protocol: '',
    binaryType: 'blob' as BinaryType,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    onopen: null as ((ev: Event) => unknown) | null,
    onerror: null as ((ev: Event) => unknown) | null,
    onclose: null as ((ev: CloseEvent) => unknown) | null,
    onmessage: null as ((ev: MessageEvent) => unknown) | null,
    send: () => {
      throw createOfflineError();
    },
    close: () => {},
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (!listener) return;
      let set = listenersMap.get(type);
      if (!set) {
        set = new Set();
        listenersMap.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (!listener) return;
      listenersMap.get(type)?.delete(listener);
    },
    dispatchEvent: (ev: Event) => {
      listenersMap.get(ev.type)?.forEach((fn) => {
        if (typeof fn === 'function') fn(ev);
        else fn.handleEvent(ev);
      });
      return true;
    },
  };

  queueMicrotask(() => {
    const errEv = typeof Event !== 'undefined' ? new Event('error') : ({ type: 'error' } as Event);
    stub.onerror?.(errEv);
    stub.dispatchEvent(errEv);
    const closeEv =
      typeof CloseEvent !== 'undefined'
        ? new CloseEvent('close', { code: 4000, reason: 'Force Offline mode', wasClean: false })
        : ({ type: 'close', code: 4000, reason: 'Force Offline mode', wasClean: false } as CloseEvent);
    stub.onclose?.(closeEv);
    stub.dispatchEvent(closeEv);
  });

  return stub as unknown as WebSocket;
}

export function installForceOfflineNetworkGuard(): void {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;

  try {
    document.documentElement.dataset.forceOffline = forceOfflineActive ? '1' : '0';
  } catch {
    // ignore
  }

  // 1. Intercept window.fetch & globalThis.fetch
  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    const guardedFetch: typeof fetch = (input, init) => {
      const reqUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.href
          : typeof Request !== 'undefined' && input instanceof Request
          ? input.url
          : String(input ?? '');

      if (forceOfflineActive && !isLocalInMemoryUrl(reqUrl)) {
        recordBlockedRequest();
        return Promise.reject(createOfflineError());
      }
      return nativeFetch(input, init);
    };
    try {
      window.fetch = guardedFetch;
      if (globalThis.fetch !== guardedFetch) {
        globalThis.fetch = guardedFetch;
      }
    } catch {
      // ignore readonly global environments
    }
  }

  // 2. Intercept XMLHttpRequest
  if (typeof XMLHttpRequest !== 'undefined') {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const xhrUrls = new WeakMap<XMLHttpRequest, string>();

    XMLHttpRequest.prototype.open = function patchedOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ) {
      xhrUrls.set(this, typeof url === 'string' ? url : url.href);
      return origOpen.apply(this, [method, url, async ?? true, username ?? null, password ?? null]);
    };

    XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
      const targetUrl = xhrUrls.get(this) || '';
      if (forceOfflineActive && !isLocalInMemoryUrl(targetUrl)) {
        recordBlockedRequest();
        queueMicrotask(() => {
          this.dispatchEvent(new Event('error'));
          this.dispatchEvent(new Event('abort'));
          this.dispatchEvent(new Event('loadend'));
        });
        return;
      }
      return origSend.call(this, body);
    };
  }

  // 3. Intercept WebSocket
  if (typeof WebSocket !== 'undefined') {
    const NativeWebSocket = window.WebSocket;
    const GuardedWebSocket = function (
      this: unknown,
      url: string | URL,
      protocols?: string | string[]
    ) {
      const urlStr = typeof url === 'string' ? url : url.href;
      if (forceOfflineActive) {
        recordBlockedRequest();
        return createOfflineClosedWebSocketStub(urlStr);
      }
      return protocols !== undefined
        ? new NativeWebSocket(url, protocols)
        : new NativeWebSocket(url);
    } as unknown as typeof WebSocket;
    GuardedWebSocket.prototype = NativeWebSocket.prototype;
    Object.assign(GuardedWebSocket, {
      CONNECTING: NativeWebSocket.CONNECTING,
      OPEN: NativeWebSocket.OPEN,
      CLOSING: NativeWebSocket.CLOSING,
      CLOSED: NativeWebSocket.CLOSED,
    });
    try {
      window.WebSocket = GuardedWebSocket;
      if (globalThis.WebSocket !== GuardedWebSocket) {
        globalThis.WebSocket = GuardedWebSocket;
      }
    } catch {
      // ignore non-writable WebSocket in strict test mocks
    }
  }

  // 4. Intercept navigator.sendBeacon
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    try {
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        if (forceOfflineActive) {
          recordBlockedRequest();
          return false;
        }
        return nativeBeacon(url, data);
      };
    } catch {
      // ignore readonly navigator
    }
  }
}

export function useForceOfflineMode() {
  const [snap, setSnap] = useState<OfflineModeSnapshot>(() => ({
    forceOffline: forceOfflineActive,
    blockedCount: blockedRequestsCount,
  }));

  useEffect(() => {
    const listener = (next: OfflineModeSnapshot) => setSnap(next);
    listeners.add(listener);
    setSnap({
      forceOffline: forceOfflineActive,
      blockedCount: blockedRequestsCount,
    });
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    forceOffline: snap.forceOffline,
    blockedCount: snap.blockedCount,
    setForceOffline: setForceOfflineEnabled,
    toggleForceOffline: toggleForceOfflineMode,
  };
}
