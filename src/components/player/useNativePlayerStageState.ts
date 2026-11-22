import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, CloudBrowserState, LanguageNoticePopup, VideoState } from '../../types';
import { evaluateSeriesAutoNext } from './playerAutoNextGuard';

interface UseNativePlayerStageStateArgs {
  videoState: VideoState;
  cloudState?: CloudBrowserState | null;
  messages: ChatMessage[];
  currentUserId: string;
  floatingChatOpen: boolean;
  canControlRoom: boolean;
  isMinimized: boolean;
  isExtracting: boolean;
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
  isExtracting,
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
    if (!showControlsRef.current) {
      showControlsRef.current = true;
      setShowControls(true);
    }
    scheduleHideControls();
  }, [scheduleHideControls, setShowControls, showControlsRef]);

  const revealControlsRef = useRef(revealControls);
  revealControlsRef.current = revealControls;

  const onNextEpisodeRef = useRef(onNextEpisode);
  onNextEpisodeRef.current = onNextEpisode;
  const hasNextEpisode = Boolean(onNextEpisode);

  useEffect(() => {
    if (videoState.mode === 'hls' || videoState.mode === 'direct') {
      revealControlsRef.current();
    }
  }, [videoState.url, videoState.mode]);

  useEffect(() => {
    const updateViewportOrientation = () => {
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      setViewportDims((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
    };
    const onFsChange = () => {
      const activeFs = Boolean(document.fullscreenElement);
      setIsFullscreen((prev) => (prev === activeFs ? prev : activeFs));
      if (!activeFs) {
        setIsHorizontalFullscreen((prev) => (prev ? false : prev));
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
    const vid = videoRef.current;
    const decision = evaluateSeriesAutoNext({
      hasSeriesMeta: Boolean(videoState.seriesMeta),
      hasNextEpisode,
      isLive: Boolean(videoState.isLive),
      isExtracting,
      canControlRoom,
      videoMode: videoState.mode,
      videoUrl: videoState.url,
      autoNextCancelledForUrl,
      autoNextTriggeredForUrl: autoNextTriggeredUrlRef.current,
      domReadyState: vid ? vid.readyState : 0,
      domSeeking: vid ? Boolean(vid.seeking) : false,
      domEnded: vid ? Boolean(vid.ended) : false,
      domCurrentTime: vid && Number.isFinite(vid.currentTime) ? vid.currentTime : 0,
      domDuration: vid && Number.isFinite(vid.duration) ? vid.duration : 0,
    });

    if (decision.action === 'countdown') {
      setAutoNextCountdown((prev) =>
        prev === decision.secondsLeft ? prev : decision.secondsLeft
      );
    } else if (decision.action === 'trigger_next') {
      autoNextTriggeredUrlRef.current = videoState.url;
      setAutoNextCountdown((prev) => (prev === null ? prev : null));
      onNextEpisodeRef.current?.();
    } else {
      setAutoNextCountdown((prev) => (prev === null ? prev : null));
    }
  }, [
    currentTime,
    duration,
    isExtracting,
    videoState.seriesMeta,
    videoState.isLive,
    videoState.mode,
    videoState.url,
    canControlRoom,
    autoNextCancelledForUrl,
    hasNextEpisode,
    videoRef,
    autoNextTriggeredUrlRef,
    setAutoNextCountdown,
  ]);

  useEffect(() => {
    const nextUrl = cloudState?.url
      ? cloudState.url
      : videoState.mode === 'cloud' && videoState.url
      ? videoState.url
      : null;
    if (nextUrl) {
      setCloudUrlInput((prev) => (prev === nextUrl ? prev : nextUrl));
    }
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
