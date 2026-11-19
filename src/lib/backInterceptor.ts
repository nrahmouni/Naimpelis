import { useEffect, useRef } from 'react';

export interface BackInterceptorEntry {
  id: string;
  priority: number;
  handler: () => boolean | void;
}

const interceptorStack: BackInterceptorEntry[] = [];
const listeners = new Set<() => void>();

function notifyStackChange() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  });
}

export function registerBackInterceptor(
  id: string,
  handler: () => boolean | void,
  priority = 10
): () => void {
  const existingIdx = interceptorStack.findIndex((item) => item.id === id);
  if (existingIdx >= 0) {
    interceptorStack.splice(existingIdx, 1);
  }
  interceptorStack.push({ id, priority, handler });
  interceptorStack.sort((a, b) => a.priority - b.priority);
  notifyStackChange();

  return () => {
    const idx = interceptorStack.findIndex((item) => item.id === id);
    if (idx >= 0) {
      interceptorStack.splice(idx, 1);
      notifyStackChange();
    }
  };
}

export function getActiveBackInterceptorCount(): number {
  return interceptorStack.length;
}

export function subscribeBackInterceptorCount(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

let lastBackPopHandledAt = 0;

export function markBackPopHandled(): void {
  lastBackPopHandledAt = Date.now();
}

export function getLastBackPopHandledAt(): number {
  return lastBackPopHandledAt;
}

/**
 * Consumes the highest-priority (most recently pushed) interceptor.
 * Returns true if an overlay/modal/view handled the Back action.
 */
export function tryConsumeBackInterceptor(): boolean {
  for (let i = interceptorStack.length - 1; i >= 0; i--) {
    const entry = interceptorStack[i];
    if (!entry) continue;
    const result = entry.handler();
    if (result !== false) {
      return true;
    }
  }
  return false;
}

let activeScrollLockCount = 0;
let previousOverflow = '';

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (activeScrollLockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeScrollLockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeScrollLockCount = Math.max(0, activeScrollLockCount - 1);
    if (activeScrollLockCount === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}

/**
 * Registers an open modal/sheet/player overlay into the global LIFO Back stack
 * and optionally locks background scroll cleanly without prop-drilling.
 */
export function useBackInterceptor(
  isActive: boolean,
  id: string,
  onBack: () => boolean | void,
  options?: { priority?: number; lockScroll?: boolean }
): void {
  const handlerRef = useRef(onBack);
  handlerRef.current = onBack;

  const priority = options?.priority ?? 10;
  const lockScroll = options?.lockScroll ?? false;

  useEffect(() => {
    if (!isActive) return undefined;

    const unregisterBack = registerBackInterceptor(
      id,
      () => handlerRef.current(),
      priority
    );
    const releaseScroll = lockScroll ? acquireBodyScrollLock() : undefined;

    return () => {
      unregisterBack();
      releaseScroll?.();
    };
  }, [isActive, id, priority, lockScroll]);
}
