import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldId } from '../store/useAppStore';
import {
  getActiveBackInterceptorCount,
  markBackPopHandled,
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
  hasEnteredApp?: boolean;
  activeWorld: WorldId;
  onReturnToEntry: () => void;
  onReturnToLogin?: () => void;
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
    hasEnteredApp = false,
    activeWorld,
    onReturnToEntry,
    onReturnToLogin,
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
    hasEnteredApp,
    activeWorld,
    onReturnToEntry,
    onReturnToLogin,
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
    hasEnteredApp,
    activeWorld,
    onReturnToEntry,
    onReturnToLogin,
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
    inRoom ||
    hasEnteredApp ||
    activeWorld !== 'entry' ||
    (hasActivePlayer && !isPlayerMinimized) ||
    isFullscreen;
  const hasSubLayerRef = useRef(hasSubLayer);
  hasSubLayerRef.current = hasSubLayer;
  const guardResyncTimerRef = useRef<number | null>(null);

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

  const scheduleGuardResync = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (guardResyncTimerRef.current) {
      window.clearTimeout(guardResyncTimerRef.current);
    }
    guardResyncTimerRef.current = window.setTimeout(() => {
      guardResyncTimerRef.current = null;
      if (!latestRef.current.enabled || readyToExitRef.current) return;
      const currentKind = getGuardType(window.history.state);
      if (!currentKind) {
        pushGuard(hasSubLayerRef.current ? 'layer' : 'root');
      } else if (hasSubLayerRef.current && currentKind === 'root') {
        pushGuard('layer');
      }
    }, 32);
  }, [pushGuard]);

  // Ensure initial root sentinel + layer sentinel exist whenever interactive layers or inside-app session are active
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (readyToExitRef.current && !hasSubLayer) return;

    const currentKind = getGuardType(window.history.state);
    if (!currentKind) {
      pushGuard(hasSubLayer ? 'layer' : 'root');
    } else if (hasSubLayer && currentKind === 'root') {
      pushGuard('layer');
    }
  }, [enabled, hasSubLayer, overlayCount, activeWorld, inRoom, hasEnteredApp, pushGuard]);

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
        pushGuard(hasSubLayerRef.current ? 'layer' : 'root');
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

      // Step 1: Close top-most modal / sheet / settings / HUD / filters / search / active game
      if (tryConsumeBackInterceptor()) {
        markBackPopHandled();
        disarmExitWindow();
        if (!getGuardType(window.history.state)) {
          pushGuard('root');
        }
        scheduleGuardResync();
        return;
      }

      // Step 2: Exit browser fullscreen if active
      if (cur.isFullscreen || document.fullscreenElement) {
        markBackPopHandled();
        disarmExitWindow();
        cur.onExitFullscreen();
        if (!getGuardType(window.history.state)) pushGuard('root');
        scheduleGuardResync();
        return;
      }

      // Step 3: Collapse full active player into persistent floating mini-dock and restore origin
      if (cur.hasActivePlayer && !cur.isPlayerMinimized) {
        markBackPopHandled();
        disarmExitWindow();
        cur.onMinimizePlayer();
        if (!getGuardType(window.history.state)) pushGuard('root');
        scheduleGuardResync();
        return;
      }

      // Step 4: Step back through sub-worlds toward Entry Home
      if (cur.activeWorld !== 'entry') {
        markBackPopHandled();
        disarmExitWindow();
        cur.onReturnToEntry();
        if (!getGuardType(window.history.state)) pushGuard('root');
        scheduleGuardResync();
        return;
      }

      // Step 5: From Entry Home (solo or party), return cleanly to Login (LobbyScreen)
      if (cur.inRoom || cur.hasEnteredApp) {
        markBackPopHandled();
        disarmExitWindow();
        cur.onReturnToLogin?.();
        if (!getGuardType(window.history.state)) {
          window.history.replaceState(
            { ...(window.history.state || {}), __riffanGuard: 'root' },
            '',
            window.location.href
          );
        }
        return;
      }

      // Step 6: Root level (Login / LobbyScreen) — require double-back within 2.2s before exiting
      if (!readyToExitRef.current) {
        markBackPopHandled();
        armExitWindow();
        return;
      }

      disarmExitWindow();
      cur.onExitRoomOrApp?.();
    };

    // Capture phase ensures Riffan Back Stack runs BEFORE useDeepLinkRouter bubble popstate listener
    window.addEventListener('popstate', handlePopState, true);
    return () => {
      window.removeEventListener('popstate', handlePopState, true);
    };
  }, [armExitWindow, disarmExitWindow, pushGuard, scheduleGuardResync, enabled]);

  useEffect(() => {
    return () => {
      if (exitWindowTimerRef.current) {
        window.clearTimeout(exitWindowTimerRef.current);
      }
      if (guardResyncTimerRef.current) {
        window.clearTimeout(guardResyncTimerRef.current);
      }
    };
  }, []);

  const triggerBackStep = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    if (tryConsumeBackInterceptor()) {
      disarmExitWindow();
      return true;
    }
    const cur = latestRef.current;
    if (cur.isFullscreen || document.fullscreenElement) {
      disarmExitWindow();
      cur.onExitFullscreen();
      return true;
    }
    if (cur.hasActivePlayer && !cur.isPlayerMinimized) {
      disarmExitWindow();
      cur.onMinimizePlayer();
      return true;
    }
    if (cur.activeWorld !== 'entry') {
      disarmExitWindow();
      cur.onReturnToEntry();
      return true;
    }
    if (cur.inRoom || cur.hasEnteredApp) {
      disarmExitWindow();
      cur.onReturnToLogin?.();
      return true;
    }
    if (!readyToExitRef.current) {
      armExitWindow();
      return true;
    }
    disarmExitWindow();
    cur.onExitRoomOrApp?.();
    return false;
  }, [armExitWindow, disarmExitWindow]);

  return {
    exitToastVisible,
    triggerBackStep,
  };
}
