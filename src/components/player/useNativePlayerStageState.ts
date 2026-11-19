import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, CloudBrowserState, LanguageNoticePopup, VideoState } from '../../types';

interface UseNativePlayerStageStateArgs {
  videoState: VideoState;
  cloudState?: CloudBrowserState | null;
  messages: ChatMessage[];
  currentUserId: string;
  floatingChatOpen: boolean;
  canControlRoom: boolean;
  isMinimized: boolean;
  showProMenu: boolean;
  currentTime: number;
  duration: number;
  autoNextCancelledForUrl: string;
  onNextEpisode?: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  controlsTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  showControlsRef: React.MutableRefObject<boolean>;
  lastManualHideAtRef: React.MutableRefObject<number>;
  autoNextTriggeredUrlRef: React.MutableRefObject<string>;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHorizontalFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  setViewportDims: React.Dispatch<React.SetStateAction<{ w: number; h: number }>>;
  setAutoNextCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  setCloudUrlInput: React.Dispatch<React.SetStateAction<string>>;
  isFullscreen: boolean;
  isHorizontalFullscreen: boolean;
  forceLandscapeRotation: boolean;
  viewportDims: { w: number; h: number };
}

export function useNativePlayerStageState({
  videoState,
  cloudState,
  messages,
  currentUserId,
  floatingChatOpen,
  canControlRoom,
  isMinimized,
  showProMenu,
  currentTime,
  duration,
  autoNextCancelledForUrl,
  onNextEpisode,
  videoRef,
  controlsTimeoutRef,
  showControlsRef,
  lastManualHideAtRef,
  autoNextTriggeredUrlRef,
  setShowControls,
  setIsFullscreen,
  setIsHorizontalFullscreen,
  setViewportDims,
  setAutoNextCountdown,
  setCloudUrlInput,
  isFullscreen,
  isHorizontalFullscreen,
  forceLandscapeRotation,
  viewportDims,
}: UseNativePlayerStageStateArgs) {
  const [localLangPopup, setLocalLangPopup] = useState<LanguageNoticePopup | null>(null);
  const langPopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentIncomingChatBubble, setRecentIncomingChatBubble] = useState<ChatMessage | null>(null);
  const lastSeenMsgIdRef = useRef<string>('');

  const triggerLocalLanguagePopup = useCallback(
    (popup: Omit<LanguageNoticePopup, 'id'>) => {
      if (langPopupTimerRef.current) clearTimeout(langPopupTimerRef.current);
      const nextPopup: LanguageNoticePopup = { ...popup, id: `lp-${Date.now()}` };
      setLocalLangPopup(nextPopup);
      langPopupTimerRef.current = setTimeout(() => {
        setLocalLangPopup(null);
      }, 4800);
    },
    []
  );

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (!latest || latest.id === lastSeenMsgIdRef.current) return;
    lastSeenMsgIdRef.current = latest.id;
    if (latest.isSystem || latest.senderId === currentUserId) return;
    if (!floatingChatOpen && videoState.mode !== 'idle') {
      setRecentIncomingChatBubble(latest);
      const timer = setTimeout(() => {
        setRecentIncomingChatBubble((cur) => (cur?.id === latest.id ? null : cur));
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [messages, currentUserId, floatingChatOpen, videoState.mode]);

  useEffect(() => {
    if (floatingChatOpen) setRecentIncomingChatBubble(null);
  }, [floatingChatOpen]);

  const scheduleHideControls = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      const vid = videoRef.current;
      const isActivelyPlaying = vid ? !vid.paused : videoState.isPlaying;
      if (
        isActivelyPlaying &&
        !showProMenu &&
        !floatingChatOpen &&
        (videoState.mode === 'hls' || videoState.mode === 'direct')
      ) {
        showControlsRef.current = false;
        setShowControls(false);
      }
    }, 3800);
  }, [
    controlsTimeoutRef,
    floatingChatOpen,
    setShowControls,
    showControlsRef,
    showProMenu,
    videoRef,
    videoState.isPlaying,
    videoState.mode,
  ]);

  const hideControlsImmediately = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    lastManualHideAtRef.current = Date.now();
    showControlsRef.current = false;
    setShowControls(false);
  }, [controlsTimeoutRef, lastManualHideAtRef, setShowControls, showControlsRef]);

  const revealControls = useCallback(() => {
    showControlsRef.current = true;
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls, setShowControls, showControlsRef]);

  useEffect(() => {
    if (videoState.mode === 'hls' || videoState.mode === 'direct') revealControls();
  }, [videoState.url, videoState.mode, revealControls]);

  useEffect(() => {
    const updateViewportOrientation = () => {
      setViewportDims({ w: window.innerWidth, h: window.innerHeight });
    };
    const onFsChange = () => {
      const activeFs = Boolean(document.fullscreenElement);
      setIsFullscreen(activeFs);
      if (!activeFs) {
        setIsHorizontalFullscreen(false);
        try {
          (
            window.screen?.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined
          )?.unlock?.();
        } catch {
          // ignore
        }
      }
      updateViewportOrientation();
      setTimeout(updateViewportOrientation, 120);
      setTimeout(updateViewportOrientation, 350);
    };
    window.addEventListener('resize', updateViewportOrientation);
    window.addEventListener('orientationchange', updateViewportOrientation);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('resize', updateViewportOrientation);
      window.removeEventListener('orientationchange', updateViewportOrientation);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [setIsFullscreen, setIsHorizontalFullscreen, setViewportDims]);

  useEffect(() => {
    if (
      !videoState.seriesMeta ||
      !onNextEpisode ||
      videoState.isLive ||
      !canControlRoom ||
      !duration ||
      duration < 90 ||
      autoNextCancelledForUrl === videoState.url
    ) {
      setAutoNextCountdown(null);
      return;
    }

    const remaining = duration - currentTime;
    if (remaining <= 10 && remaining > 0.4) {
      setAutoNextCountdown(Math.max(1, Math.ceil(remaining)));
    } else if (remaining <= 0.4 && autoNextTriggeredUrlRef.current !== videoState.url) {
      autoNextTriggeredUrlRef.current = videoState.url;
      setAutoNextCountdown(null);
      onNextEpisode();
    } else {
      setAutoNextCountdown(null);
    }
  }, [
    currentTime,
    duration,
    videoState.seriesMeta,
    videoState.isLive,
    videoState.url,
    canControlRoom,
    autoNextCancelledForUrl,
    onNextEpisode,
    autoNextTriggeredUrlRef,
    setAutoNextCountdown,
  ]);

  useEffect(() => {
    if (cloudState?.url) setCloudUrlInput(cloudState.url);
    else if (videoState.mode === 'cloud' && videoState.url) setCloudUrlInput(videoState.url);
  }, [cloudState?.url, setCloudUrlInput, videoState.mode, videoState.url]);

  const isStageFullscreen = !isMinimized && (isFullscreen || isHorizontalFullscreen);
  const shouldRotate90 =
    isStageFullscreen && forceLandscapeRotation && viewportDims.h > viewportDims.w;

  return {
    localLangPopup,
    setLocalLangPopup,
    recentIncomingChatBubble,
    setRecentIncomingChatBubble,
    triggerLocalLanguagePopup,
    scheduleHideControls,
    hideControlsImmediately,
    revealControls,
    isStageFullscreen,
    shouldRotate90,
  };
}
