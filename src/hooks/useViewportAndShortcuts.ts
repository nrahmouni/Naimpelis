import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { VideoState } from '../types';
import { flushPendingCloudWatchProgress } from '../services/userCloudSync';
import { useAppStore } from '../store/useAppStore';
import { useThemeStore } from '../store/useThemeStore';
import { isGoogleTvEnvironment } from '../utils/tvSpatialNav';
import { checkRemoteAppVersion, type NativeApkUpdateAvailable } from '../utils/versionSync';

interface UseViewportAndShortcutsParams {
  videoStateRef: MutableRefObject<VideoState>;
  isCinemaModeRef: MutableRefObject<boolean>;
  onApkUpdate: (apk: NativeApkUpdateAvailable | null) => void;
}

export function useViewportAndShortcuts({
  videoStateRef,
  isCinemaModeRef,
  onApkUpdate,
}: UseViewportAndShortcutsParams) {
  const syncDomAttributes = useThemeStore((s) => s.syncDomAttributes);
  const setShowCommandSearch = useAppStore((s) => s.setShowCommandSearch);
  const setDeferredAppUpdateVersion = useAppStore((s) => s.setDeferredAppUpdateVersion);

  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState<boolean>(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' && !isGoogleTvEnvironment()
      ? window.innerWidth > window.innerHeight && window.innerHeight < 520
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateOrientation = () => {
      if (isGoogleTvEnvironment()) {
        setIsMobileLandscape((prev) => (prev ? false : prev));
        return;
      }
      const nextLandscape =
        window.innerWidth > window.innerHeight && window.innerHeight < 520;
      setIsMobileLandscape((prev) => (prev === nextLandscape ? prev : nextLandscape));
    };
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    const vv = window.visualViewport;
    const handleViewportChange = () => {
      updateOrientation();
      if (!vv) return;
      const fullH = window.innerHeight || document.documentElement.clientHeight || 800;
      const currentH = Math.round(vv.height);
      const keyboardLikelyOpen = fullH - currentH > 135 && fullH < 1024;
      setIsMobileKeyboardOpen((prev) => (prev === keyboardLikelyOpen ? prev : keyboardLikelyOpen));
      const nextHeight = keyboardLikelyOpen ? currentH : null;
      setVisualViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    if (vv) {
      vv.addEventListener('resize', handleViewportChange);
      vv.addEventListener('scroll', handleViewportChange);
    }
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      if (vv) {
        vv.removeEventListener('resize', handleViewportChange);
        vv.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  useEffect(() => {
    syncDomAttributes();
    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingCloudWatchProgress().catch(() => {});
      }
    };
    const handleBeforeUnload = () => {
      flushPendingCloudWatchProgress().catch(() => {});
    };
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandSearch(!useAppStore.getState().showCommandSearch);
      } else if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setShowCommandSearch(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, [syncDomAttributes, setShowCommandSearch]);

  useEffect(() => {
    const runVersionCheck = () => {
      void checkRemoteAppVersion({
        onApkUpdate: (apkUpdate) => onApkUpdate(apkUpdate),
        shouldDeferReload: () => {
          const vs = videoStateRef.current;
          return (vs.mode !== 'idle' && vs.isPlaying) || isCinemaModeRef.current;
        },
        onDeferredUpdate: (remoteVer) => setDeferredAppUpdateVersion(remoteVer),
      });
    };
    runVersionCheck();
    const onVisible = () => {
      if (document.visibilityState === 'visible') runVersionCheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(runVersionCheck, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [setDeferredAppUpdateVersion, onApkUpdate, videoStateRef, isCinemaModeRef]);

  return {
    visualViewportHeight,
    isMobileKeyboardOpen,
    isMobileLandscape,
  };
}
