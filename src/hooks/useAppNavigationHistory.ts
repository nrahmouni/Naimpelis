import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldId } from '../store/useAppStore';
import {
  getActiveBackInterceptorCount,
  subscribeBackInterceptorCount,
  tryConsumeBackInterceptor,
} from '../lib/backInterceptor';

interface GuardHistoryState {
  __riffanGuard?: 'root' | 'layer';
  naimInRoom?: boolean;
}

function getGuardType(state: unknown): 'root' | 'layer' | null {
  if (!state || typeof state !== 'object') return null;
  const g = (state as GuardHistoryState).__riffanGuard;
  return g === 'root' || g === 'layer' ? g : null;
}

export function useAppNavigationHistory(params: {
  enabled: boolean;
  inRoom: boolean;
  activeWorld: WorldId;
  onReturnToEntry: () => void;
  hasActivePlayer: boolean;
  isPlayerMinimized: boolean;
  isFullscreen: boolean;
  onExitFullscreen: () => void;
  onMinimizePlayer: () => void;
  onExitRoomOrApp?: () => void;
}) {
  const {
    enabled,
    inRoom,
    activeWorld,
    onReturnToEntry,
    hasActivePlayer,
    isPlayerMinimized,
    isFullscreen,
    onExitFullscreen,
    onMinimizePlayer,
    onExitRoomOrApp,
  } = params;

  const [exitToastVisible, setExitToastVisible] = useState(false);
  const [overlayCount, setOverlayCount] = useState(() =>
    getActiveBackInterceptorCount()
  );

  const exitWindowTimerRef = useRef<number | null>(null);
  const readyToExitRef = useRef(false);
  const suppressNextPopRef = useRef(false);

  const latestRef = useRef({
    enabled,
    inRoom,
    activeWorld,
    onReturnToEntry,
    hasActivePlayer,
    isPlayerMinimized,
    isFullscreen,
    onExitFullscreen,
    onMinimizePlayer,
    onExitRoomOrApp,
  });
  latestRef.current = {
    enabled,
    inRoom,
    activeWorld,
    onReturnToEntry,
    hasActivePlayer,
    isPlayerMinimized,
    isFullscreen,
    onExitFullscreen,
    onMinimizePlayer,
    onExitRoomOrApp,
  };

  useEffect(() => {
    return subscribeBackInterceptorCount(() => {
      setOverlayCount(getActiveBackInterceptorCount());
    });
  }, []);

  const hasSubLayer =
    overlayCount > 0 ||
    activeWorld !== 'entry' ||
    (hasActivePlayer && !isPlayerMinimized) ||
    isFullscreen;

  const pushGuard = useCallback((kind: 'root' | 'layer') => {
    if (typeof window === 'undefined') return;
    const currentKind = getGuardType(window.history.state);
    if (currentKind === kind) return;
    if (kind === 'layer' && currentKind === 'root') {
      window.history.pushState(
        { ...(window.history.state || {}), __riffanGuard: 'layer' },
        '',
        window.location.href
      );
      return;
    }
    if (kind === 'root' && !currentKind) {
      window.history.pushState(
        { ...(window.history.state || {}), __riffanGuard: 'root' },
        '',
        window.location.href
      );
      return;
    }
    if (kind === 'layer' && !currentKind) {
      window.history.pushState(
        { ...(window.history.state || {}), __riffanGuard: 'root' },
        '',
        window.location.href
      );
      window.history.pushState(
        { ...(window.history.state || {}), __riffanGuard: 'layer' },
        '',
        window.location.href
      );
    }
  }, []);

  // Ensure initial root sentinel + layer sentinel exist whenever interactive layers are open
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (readyToExitRef.current && !hasSubLayer) return;

    const currentKind = getGuardType(window.history.state);
    if (!currentKind) {
      pushGuard(hasSubLayer ? 'layer' : 'root');
    } else if (hasSubLayer && currentKind === 'root') {
      pushGuard('layer');
    }
  }, [enabled, hasSubLayer, pushGuard]);

  const armExitWindow = useCallback(() => {
    readyToExitRef.current = true;
    setExitToastVisible(true);
    if (exitWindowTimerRef.current) {
      window.clearTimeout(exitWindowTimerRef.current);
    }
    // Wait 2.2s without re-pushing sentinel so a 2nd Back press exits PWA/APK cleanly!
    // If user doesn't press Back again within 2.2s, re-arm the sentinel.
    exitWindowTimerRef.current = window.setTimeout(() => {
      exitWindowTimerRef.current = null;
      readyToExitRef.current = false;
      setExitToastVisible(false);
      if (latestRef.current.enabled) {
        pushGuard('root');
      }
    }, 2200);
  }, [pushGuard]);

  const disarmExitWindow = useCallback(() => {
    if (exitWindowTimerRef.current) {
      window.clearTimeout(exitWindowTimerRef.current);
      exitWindowTimerRef.current = null;
    }
    readyToExitRef.current = false;
    setExitToastVisible(false);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      if (suppressNextPopRef.current) {
        suppressNextPopRef.current = false;
        return;
      }

      const cur = latestRef.current;

      // Step 1: Close top-most modal / sheet / details / search / active game
      if (tryConsumeBackInterceptor()) {
        disarmExitWindow();
        const stillHasLayer =
          getActiveBackInterceptorCount() > 0 ||
          cur.activeWorld !== 'entry' ||
          (cur.hasActivePlayer && !cur.isPlayerMinimized) ||
          cur.isFullscreen;
        pushGuard(stillHasLayer ? 'layer' : 'root');
        return;
      }

      // Step 2: Exit browser fullscreen if active
      if (cur.isFullscreen || document.fullscreenElement) {
        disarmExitWindow();
        cur.onExitFullscreen();
        pushGuard('layer');
        return;
      }

      // Step 3: Collapse full active player into persistent floating mini-dock
      if (cur.hasActivePlayer && !cur.isPlayerMinimized) {
        disarmExitWindow();
        cur.onMinimizePlayer();
        pushGuard(cur.activeWorld !== 'entry' ? 'layer' : 'root');
        return;
      }

      // Step 4: Return from any sub-world (Cine, Fútbol, TV, Juegos, Sala, YT) to Entry Home
      if (cur.activeWorld !== 'entry') {
        disarmExitWindow();
        cur.onReturnToEntry();
        pushGuard('root');
        return;
      }

      // Step 5: Root level sentinel — require double-back within 2.2s before leaving
      if (!readyToExitRef.current) {
        armExitWindow();
        return;
      }

      disarmExitWindow();
      cur.onExitRoomOrApp?.();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [armExitWindow, disarmExitWindow, pushGuard, enabled]);

  useEffect(() => {
    return () => {
      if (exitWindowTimerRef.current) {
        window.clearTimeout(exitWindowTimerRef.current);
      }
    };
  }, []);

  const triggerBackStep = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (tryConsumeBackInterceptor()) return;
    const cur = latestRef.current;
    if (cur.isFullscreen || document.fullscreenElement) {
      cur.onExitFullscreen();
      return;
    }
    if (cur.hasActivePlayer && !cur.isPlayerMinimized) {
      cur.onMinimizePlayer();
      return;
    }
    if (cur.activeWorld !== 'entry') {
      cur.onReturnToEntry();
      return;
    }
    if (!readyToExitRef.current) {
      armExitWindow();
    } else {
      disarmExitWindow();
      cur.onExitRoomOrApp?.();
    }
  }, [armExitWindow, disarmExitWindow]);

  return {
    exitToastVisible,
    triggerBackStep,
  };
}
