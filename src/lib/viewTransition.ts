import { useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '../utils/haptics';
import {
  getActiveBackInterceptorCount,
  tryConsumeBackInterceptor,
} from './backInterceptor';

type ViewTransitionInstance = {
  finished?: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
  skipTransition?: () => void;
};

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionInstance;
};

let activeViewTransition: ViewTransitionInstance | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.reducedMotion === 'true'
  );
}

/**
 * Runs a state transition inside the browser View Transitions API when supported,
 * gracefully falling back on unsupported browsers, hidden tabs, or reduced-motion preference.
 */
export function runWithViewTransition(update: () => void): void {
  if (
    typeof document === 'undefined' ||
    document.hidden ||
    document.visibilityState !== 'visible' ||
    prefersReducedMotion()
  ) {
    update();
    return;
  }
  const doc = document as ViewTransitionDoc;
  if (typeof doc.startViewTransition === 'function') {
    try {
      if (activeViewTransition) {
        try {
          activeViewTransition.skipTransition?.();
        } catch {
          // ignore
        }
        activeViewTransition = null;
      }
      const transition = doc.startViewTransition(() => {
        update();
      });
      activeViewTransition = transition;
      const noop = () => {};
      transition.ready?.catch(noop);
      transition.updateCallbackDone?.catch(noop);
      transition.finished
        ?.catch(noop)
        .finally(() => {
          if (activeViewTransition === transition) {
            activeViewTransition = null;
          }
        });
      return;
    } catch {
      // Fallback below
    }
  }
  update();
}

/**
 * Left-edge horizontal swipe gesture to navigate back cleanly on mobile screens.
 */
export function useSwipeBack(onBack: () => void, enabled = true) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (touch.clientX <= 36) {
      startRef.current = { x: touch.clientX, y: touch.clientY };
    } else {
      startRef.current = null;
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!enabled || !startRef.current || e.changedTouches.length !== 1) {
      startRef.current = null;
      return;
    }
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startRef.current.x;
    const dy = Math.abs(touch.clientY - startRef.current.y);
    startRef.current = null;
    if (dx > 76 && dy < 54) {
      triggerHaptic('light');
      if (getActiveBackInterceptorCount() > 0 && tryConsumeBackInterceptor()) {
        return;
      }
      onBack();
    }
  };

  return { onTouchStart, onTouchEnd };
}

/**
 * Mobile touch pull-to-refresh gesture for live channel & football lists.
 */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  enabled = true
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const threshold = 64;

  useEffect(() => {
    if (!enabled) {
      setPullDistance(0);
    }
  }, [enabled]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!enabled || isRefreshing || e.touches.length !== 1) return;
    const scrollTop = containerRef.current?.scrollTop ?? window.scrollY ?? 0;
    if (scrollTop <= 2) {
      startYRef.current = e.touches[0].clientY;
    } else {
      startYRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!enabled || isRefreshing || startYRef.current === null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 8) {
      setPullDistance(Math.min(88, Math.round((dy - 8) * 0.45)));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    if (pullDistance >= threshold && !isRefreshing) {
      triggerHaptic('medium');
      setIsRefreshing(true);
      setPullDistance(48);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    pullHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
