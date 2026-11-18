import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Minimize2,
  RotateCcw,
  RotateCw,
  Tv,
  ArrowLeft,
  SkipForward,
  Check,
  Globe,
  Mic,
  MicOff,
  PhoneOff,
  PictureInPicture2,
} from 'lucide-react';
import {
  RiffanCastIcon,
  RiffanChatIcon,
  RiffanCloseIcon,
  RiffanExitFullscreenIcon,
  RiffanFullscreenIcon,
  RiffanLiveIcon,
  RiffanLoaderR,
  RiffanPauseIcon,
  RiffanPlayIcon,
  RiffanRetryIcon,
  RiffanSlidersIcon,
  RiffanSpinner,
  RiffanVideoLoading,
  RiffanVoiceCallIcon,
  RiffanVolumeIcon,
  RiffanWarningIcon,
} from './ui/RiffanIcons';
import {
  ChatMessage,
  LanguageNoticePopup,
  VideoState,
} from '../types';
import { UI_COPY, pickLang } from '../utils/i18n';
import { socketService } from '../services/socket';
import { triggerHaptic } from '../utils/haptics';
import { findActiveSubtitleText } from '../utils/subtitles';
import { SecondaryHlsStage } from './SecondaryHlsStage';
import { useAppStore } from '../store/useAppStore';
import { useFocusTrap } from '../utils/useFocusTrap';
import {
  formatTimecode,
  type NativeCinemaPlayerProps,
  type ScreenOrientationWithLock,
  type WebKitVideoElement,
  type YouTubePlayerInstance,
} from './player/playerTypes';
import { useDirectCast } from './player/useDirectCast';
import { CloudBrowserOverlay } from './player/CloudBrowserOverlay';
import { PlayerProSettingsModal } from './player/PlayerProSettingsModal';
import { VoiceWaveBars } from './games/GameVoiceBar';
import { MediaLanguageSelector } from './ui/LanguageBadge';
import { resolveTrackLang } from './player/trackLabelUtils';
import { IdleStandbyStage } from './player/IdleStandbyStage';
import { EmbedStagePanel } from './player/EmbedStagePanel';
import { PlayerTransportBar } from './player/PlayerTransportBar';
import { MiniPlayerHud } from './player/MiniPlayerHud';
import { useEmbedExternalWindow } from './player/useEmbedExternalWindow';
import { usePlayerSubtitles } from './player/usePlayerSubtitles';
import { useYouTubeIframeSync } from './player/useYouTubeIframeSync';
import { useCinemaPlatformApis } from './player/useCinemaPlatformApis';
import { useTvReceiverRemote } from './player/useTvReceiverRemote';

export const NativeCinemaPlayer: React.FC<NativeCinemaPlayerProps> = ({
  videoState,
  lang,
  userName,
  isExtracting,
  extractionLabel,
  extractionError,
  cloudFrame,
  cloudState,
  floatingReactions,
  onSyncAction,
  onSelectTrack,
  onPromoteCloudStreamToNative,
  onOpenCatalogSection,
  onPrevEpisode,
  onNextEpisode,
  onProgressUpdate,
  isCinemaMode = false,
  onToggleCinemaMode,
  secondaryStream = null,
  onSwapSecondaryStream,
  onToggleSecondaryLayout,
  onCloseSecondaryStream,
  canControlRoom = true,
  isMinimized = false,
  isCompressed = false,
  onExpandCompressed,
  onToggleMinimize,
  onClosePlayer,
  onCancelExtraction,
  isTvMode = false,
  roomCode,
  roomDisplayName,
  participantCount = 1,
  participants = [],
  onExitTvMode,
  onOpenSmartTvModal,
  hasConnectedSmartTv = false,
  onSendTvRemoteCommand,
  languageNotice = null,
  onDismissLanguageNotice,
  messages = [],
  currentUserId = '',
  onSendMessage,
  onSendReaction,
  floatingChatOpen = false,
  onToggleFloatingChat,
  unreadChatCount = 0,
  compactVideoForMobileKeyboard = false,
  onOpenInCloudBrowser,
  voiceChat,
  savedFriends = [],
  onlineUsers = [],
  onOpenFriendsModal,
  onSendDirectRoomInvite,
  onVideoEnded,
}) => {
  const { subtitleStyle, setSubtitleStyle, syncOffsetMs, setSyncOffsetMs } = useAppStore();
  const t = UI_COPY[lang];
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const castBridgeVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<YouTubePlayerInstance | null>(null);
  const ytContainerId = useRef(`yt-stage-${Math.random().toString(36).slice(2, 8)}`);
  const isApplyingRemoteRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControlsRef = useRef<boolean>(true);
  const lastManualHideAtRef = useRef<number>(0);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastProgressEmitRef = useRef<number>(0);
  const streamLoadStartRef = useRef<number>(Date.now());
  const qoeStartupSentForUrlRef = useRef<string>('');
  const rebufferCountRef = useRef<number>(0);
  const smoothDriftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [batterySaverTvMode, setBatterySaverTvMode] = useState<boolean>(false);

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  const clearBufferingIndicator = useCallback(() => {
    if (bufferingDelayTimerRef.current) {
      clearTimeout(bufferingDelayTimerRef.current);
      bufferingDelayTimerRef.current = null;
    }
    setIsBuffering(false);
  }, []);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tvAspectMode, setTvAspectMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [isInPiP, setIsInPiP] = useState(false);
  const [isHorizontalFullscreen, setIsHorizontalFullscreen] = useState(false);
  const [forceLandscapeRotation, setForceLandscapeRotation] = useState(true);
  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 390, h: 844 }
  );
  const [showControls, setShowControls] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<
    { index: number; height: number; bitrate?: number }[]
  >([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [autoActiveHeight, setAutoActiveHeight] = useState<number | null>(null);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<
    { id: number; name: string; lang: string; default?: boolean }[]
  >([]);
  const [selectedHlsAudioTrack, setSelectedHlsAudioTrack] = useState<number>(-1);
  const [activeHudMenu, setActiveHudMenu] = useState<'quality' | 'audio' | null>(null);
  const [cloudUrlInput, setCloudUrlInput] = useState('');
  const [seekRipple, setSeekRipple] = useState<'left' | 'right' | null>(null);

  const [playerToast, setPlayerToast] = useState<string | null>(null);
  const [embedRescueDismissedUrl, setEmbedRescueDismissedUrl] = useState<string>('');

  const latestCurrentTimeRef = useRef<number>(0);

  // Local Language Popup State & Incoming Chat Toast State
  const [localLangPopup, setLocalLangPopup] = useState<LanguageNoticePopup | null>(null);
  const langPopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentIncomingChatBubble, setRecentIncomingChatBubble] = useState<ChatMessage | null>(
    null
  );
  const lastSeenMsgIdRef = useRef<string>('');

  // Cinema Pro Engine: Ambilight, Vocal Boost (Web Audio Compressor), Playback Speed & Subtitles
  const [showProMenu, setShowProMenu] = useState<boolean>(false);
  const proMenuRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showProMenu, () => setShowProMenu(false), proMenuRef);
  const [ambilightEnabled, setAmbilightEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('naim_ambilight_v1');
      if (stored !== null) return stored === 'true';
      return typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
    } catch {
      return false;
    }
  });
  const [vocalBoostEnabled, setVocalBoostEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('naim_vocal_boost_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Auto-Next Episode Countdown State
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [autoNextCancelledForUrl, setAutoNextCancelledForUrl] = useState<string>('');
  const autoNextTriggeredUrlRef = useRef<string>('');

  const showTransientToast = useCallback((msg: string) => {
    setPlayerToast(msg);
    setTimeout(() => {
      setPlayerToast((cur) => (cur === msg ? null : cur));
    }, 3400);
  }, []);

  latestCurrentTimeRef.current = currentTime;

  const {
    externalWinState,
    externalTargetUrl,
    embedWatchdogPhase,
    activeEmbedInlineUrl,
    activeEmbedDirectUrl,
    lastAttemptedEmbedUrl,
    isMobileExternal,
    openControlledExternalWindow,
    handleFocusExternalWindow,
    handleCloseExternalWindow,
    handleSelectExternalServer,
    handleMarkInlineServerWorking,
    handleRetryInlineEmbed,
  } = useEmbedExternalWindow({
    videoState,
    isExtracting,
    currentTime,
    onSelectTrack,
    showTransientToast,
  });

  const {
    isCastingToTv,
    castDeviceName,
    syncBridgeVideoSource,
    handleDirectCastToTv,
  } = useDirectCast({
    lang,
    roomCode,
    videoState,
    hasConnectedSmartTv,
    videoRef,
    castBridgeVideoRef,
    hlsRef,
    setIsMuted,
    setBatterySaverTvMode,
    showTransientToast,
    onOpenSmartTvModal,
    onSendTvRemoteCommand,
  });

  const triggerLocalLanguagePopup = useCallback(
    (popup: Omit<LanguageNoticePopup, 'id'>) => {
      if (langPopupTimerRef.current) clearTimeout(langPopupTimerRef.current);
      const nextPopup: LanguageNoticePopup = {
        ...popup,
        id: `lp-${Date.now()}`,
      };
      setLocalLangPopup(nextPopup);
      langPopupTimerRef.current = setTimeout(() => {
        setLocalLangPopup(null);
      }, 4800);
    },
    []
  );

  // Show brief incoming chat pill over video when bottom floating window is closed
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
    if (floatingChatOpen) {
      setRecentIncomingChatBubble(null);
    }
  }, [floatingChatOpen]);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

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
  }, [videoState.isPlaying, videoState.mode, showProMenu, floatingChatOpen]);

  const hideControlsImmediately = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    lastManualHideAtRef.current = Date.now();
    showControlsRef.current = false;
    setShowControls(false);
  }, []);

  const revealControls = useCallback(() => {
    showControlsRef.current = true;
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  // Show HUD and reset idle timer whenever a new stream loads or menus close
  useEffect(() => {
    if (videoState.mode === 'hls' || videoState.mode === 'direct') {
      revealControls();
    }
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
          (window.screen?.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined)?.unlock?.();
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
  }, []);

  const isStageFullscreen = !isMinimized && (isFullscreen || isHorizontalFullscreen);
  const shouldRotate90 =
    isStageFullscreen && forceLandscapeRotation && viewportDims.h > viewportDims.w;

  const {
    subtitleTracks,
    activeSubId,
    parsedCues,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleSize,
    setSubtitleSize,
    subtitleFileInputRef,
    handleSelectSubtitleTrack,
    handleUploadLocalSubtitle,
  } = usePlayerSubtitles({
    videoState,
    lang,
    showTransientToast,
    onResetMenus: () => {
      setShowProMenu(false);
      setActiveHudMenu(null);
    },
  });

  useTvReceiverRemote({
    isTvMode,
    videoState,
    stageWrapperRef,
    videoRef,
    hlsRef,
    ytPlayerRef,
    subtitleTracks,
    activeSubId,
    currentTime,
    setVolume,
    setIsMuted,
    setTvAspectMode,
    setShowControls,
    setAmbilightEnabled,
    handleSelectSubtitleTrack,
    onSelectTrack,
    onExitTvMode,
    showTransientToast,
  });

  // Keyboard shortcuts for Modo Cine (T / Escape) when player is active
  useEffect(() => {
    if (isTvMode || videoState.mode === 'idle') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape' && isCinemaMode && !document.fullscreenElement) {
        onToggleCinemaMode?.();
      } else if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        onToggleCinemaMode?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isTvMode, videoState.mode, isCinemaMode, onToggleCinemaMode]);

  const { toggleVocalBoost } = useCinemaPlatformApis({
    lang,
    videoState,
    stageWrapperRef,
    videoRef,
    ambilightEnabled,
    vocalBoostEnabled,
    setVocalBoostEnabled,
    isMinimized,
    isCompressed,
    isTvMode,
    isStageFullscreen,
    isCinemaMode,
    localPlaying,
    currentTime,
    duration,
    playbackSpeed,
    setIsInPiP,
    showTransientToast,
    onNextEpisode,
    onSyncAction,
  });

  // Apply playback speed to HTML5 video & YouTube
  const handleSelectSpeed = (rate: number) => {
    setPlaybackSpeed(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    if (ytPlayerRef.current?.setPlaybackRate) {
      try {
        ytPlayerRef.current.setPlaybackRate(rate);
      } catch {
        // ignore
      }
    }
  };

  // ============================================================================
  // CINEMA PRO 4: AUTO-NEXT EPISODE COUNTDOWN FOR TV SERIES
  // ============================================================================
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
      const secLeft = Math.max(1, Math.ceil(remaining));
      setAutoNextCountdown(secLeft);
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
  ]);

  // Screen Wake Lock, PiP listeners & MediaSession are handled via useCinemaPlatformApis above

  // Global PC Keyboard Shortcuts (Space/K, F, M, J/ArrowLeft, L/ArrowRight, C)
  useEffect(() => {
    if (videoState.mode === 'idle' || videoState.mode === 'cloud') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        e.preventDefault();
        handleTogglePlay();
      } else if (key === 'f') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (key === 'm') {
        e.preventDefault();
        const v = videoRef.current;
        if (v) {
          const next = !v.muted;
          v.muted = next;
          setIsMuted(next);
          showTransientToast(next ? '🔇 Silenciado' : '🔊 Sonido activo');
        }
      } else if ((key === 'arrowleft' || key === 'j') && !videoState.isLive) {
        e.preventDefault();
        handleSeekRelative(-10);
        setSeekRipple('left');
        setTimeout(() => setSeekRipple(null), 500);
      } else if ((key === 'arrowright' || key === 'l') && !videoState.isLive) {
        e.preventDefault();
        handleSeekRelative(10);
        setSeekRipple('right');
        setTimeout(() => setSeekRipple(null), 500);
      } else if (key === 'c' && subtitleTracks.length > 0) {
        e.preventDefault();
        const subOptions = ['off', ...subtitleTracks.map((s) => s.id)];
        const curIdx = Math.max(0, subOptions.indexOf(activeSubId));
        const nextSub = subOptions[(curIdx + 1) % subOptions.length];
        handleSelectSubtitleTrack(nextSub);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    videoState.mode,
    videoState.isLive,
    subtitleTracks,
    activeSubId,
  ]);

  // Pause local phone decoding when Battery Saver Remote Mode is enabled
  useEffect(() => {
    if (!hasConnectedSmartTv && !isCastingToTv) {
      if (batterySaverTvMode) setBatterySaverTvMode(false);
      return;
    }
    const v = videoRef.current;
    if (!v || isTvMode) return;
    if (batterySaverTvMode) {
      v.pause();
    } else if (videoState.isPlaying && v.paused) {
      v.play().catch(() => {});
    }
  }, [batterySaverTvMode, hasConnectedSmartTv, isCastingToTv, isTvMode, videoState.isPlaying]);

  // Direct Chromecast / RemotePlayback / AirPlay 2 hook initialized above via useDirectCast

  useEffect(() => {
    if (cloudState?.url) {
      setCloudUrlInput(cloudState.url);
    } else if (videoState.mode === 'cloud' && videoState.url) {
      setCloudUrlInput(videoState.url);
    }
  }, [cloudState?.url, videoState.mode, videoState.url]);

  // ============================================================================
  // ENGINE 1: NATIVE HTML5 + HLS.JS ENGINE (WITH APPLE NATIVE HLS + VIDEO WATCHDOG)
  // ============================================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setStreamError(null);
    setQualityLevels([]);
    setSelectedQuality(-1);

    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') {
      video.removeAttribute('src');
      video.load();
      return;
    }

    if (!videoState.url) return;

    let cancelled = false;
    let videoWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
    streamLoadStartRef.current = Date.now();
    rebufferCountRef.current = 0;
    qoeStartupSentForUrlRef.current = '';
    setIsBuffering(true);

    const targetResumeSec =
      !videoState.isLive && Number.isFinite(videoState.currentTime) && videoState.currentTime > 3
        ? Math.floor(videoState.currentTime)
        : 0;

    const startPlaybackSafely = async () => {
      if (!video || cancelled) return;
      if (targetResumeSec > 3) {
        try {
          if (Math.abs((video.currentTime || 0) - targetResumeSec) > 2) {
            video.currentTime = targetResumeSec;
          }
          showTransientToast(
            `${pickLang(lang, {
              es: 'Reanudando en',
              ca: 'Reprenent a',
              en: 'Resuming at',
            })} ${formatTimecode(targetResumeSec)}`
          );
        } catch {
          // ignore
        }
      }
      if (!videoState.isPlaying) {
        video.pause();
        setLocalPlaying(false);
        return;
      }

      try {
        video.muted = isCastingToTv ? true : false;
        await video.play();
        if (cancelled) {
          video.pause();
          return;
        }
        setIsMuted(video.muted);
        setLocalPlaying(true);
        scheduleHideControls();
      } catch {
        if (cancelled) return;
        video.muted = true;
        setIsMuted(true);
        try {
          await video.play();
          setLocalPlaying(true);
          scheduleHideControls();
        } catch {
          setLocalPlaying(false);
        }
      }
    };

    const attachHlsJs = () => {
      if (!Hls.isSupported() || cancelled) return false;
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startPosition: targetResumeSec > 3 ? targetResumeSec : -1,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1,
        backBufferLength: 20,
        maxBufferLength: 35,
        maxMaxBufferLength: 75,
        maxBufferHole: 0.5,
        maxFragLookUpTolerance: 0.25,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        stretchShortVideoTrack: true,
        maxAudioFramesDrift: 4,
        abrEwmaDefaultEstimate: 3_500_000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 8,
        levelLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 1000,
      });
      hlsRef.current = hls;

      hls.loadSource(videoState.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        clearBufferingIndicator();
        const bestByHeight = new Map<number, { index: number; height: number; bitrate: number }>();
        (data.levels || []).forEach((lvl, idx) => {
          const height = lvl.height || 0;
          if (height <= 0) return;
          const bitrate = lvl.bitrate || 0;
          const existing = bestByHeight.get(height);
          if (!existing || bitrate > existing.bitrate) {
            bestByHeight.set(height, { index: idx, height, bitrate });
          }
        });
        const dedupedLevels = Array.from(bestByHeight.values()).sort(
          (a, b) => b.height - a.height
        );
        setQualityLevels(dedupedLevels);
        setSelectedQuality(-1);

        const initialAudio = (hls.audioTracks || []).map((tr, idx) => ({
          id: typeof tr.id === 'number' ? tr.id : idx,
          name: tr.name || tr.lang || `Audio ${idx + 1}`,
          lang: (tr.lang || '').toUpperCase(),
          default: Boolean(tr.default),
        }));
        setHlsAudioTracks(initialAudio);
        setSelectedHlsAudioTrack(typeof hls.audioTrack === 'number' ? hls.audioTrack : 0);

        startPlaybackSafely();

        // Watchdog: if audio plays for 4s but videoWidth is 0 (black screen / audio-only MSE glitch),
        // automatically recover media decoder on the SAME signal without switching channels
        if (videoWatchdogTimer) clearTimeout(videoWatchdogTimer);
        videoWatchdogTimer = setTimeout(() => {
          if (cancelled || !video) return;
        if (!video.paused && video.currentTime > 0.5 && video.videoWidth === 0) {
            const uaWatch = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
            const isRealAppleHls =
              Boolean(video.canPlayType('application/vnd.apple.mpegurl')) &&
              /iPhone|iPad|iPod|Macintosh|AppleTV/i.test(uaWatch) &&
              !/Chrome|CriOS|FxiOS|EdgiOS|Android/i.test(uaWatch);
            if (isRealAppleHls) {
              const savedT = video.currentTime;
              hls.destroy();
              hlsRef.current = null;
              video.src = videoState.url;
              video.addEventListener(
                'loadedmetadata',
                () => {
                  if (savedT > 1) {
                    try {
                      video.currentTime = savedT;
                    } catch {
                      // ignore
                    }
                  }
                  video.play().catch(() => {});
                },
                { once: true }
              );
            } else {
              hls.recoverMediaError();
            }
          }
        }, 4200);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const lvl = hls.levels?.[data.level];
        if (lvl?.height) {
          setAutoActiveHeight(lvl.height);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_evt, data) => {
        const mapped = (data.audioTracks || []).map((tr, idx) => ({
          id: typeof tr.id === 'number' ? tr.id : idx,
          name: tr.name || tr.lang || `Audio ${idx + 1}`,
          lang: (tr.lang || '').toUpperCase(),
          default: Boolean(tr.default),
        }));
        setHlsAudioTracks(mapped);
        if (typeof hls.audioTrack === 'number' && hls.audioTrack >= 0) {
          setSelectedHlsAudioTrack(hls.audioTrack);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
        if (typeof data.id === 'number') {
          setSelectedHlsAudioTrack(data.id);
        }
      });

      let mediaRecoveries = 0;
      let networkRecoveries = 0;

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        networkRecoveries = 0;
        setStreamError(null);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        const uaErr = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
        const isRealAppleHls =
          Boolean(video.canPlayType('application/vnd.apple.mpegurl')) &&
          /iPhone|iPad|iPod|Macintosh|AppleTV/i.test(uaErr) &&
          !/Chrome|CriOS|FxiOS|EdgiOS|Android/i.test(uaErr);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 6) {
          networkRecoveries += 1;
          setTimeout(() => {
            if (!cancelled && hlsRef.current === hls) {
              hls.startLoad();
            }
          }, 1200);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 4) {
          mediaRecoveries += 1;
          hls.recoverMediaError();
        } else if (isRealAppleHls) {
          hls.destroy();
          hlsRef.current = null;
          video.src = videoState.url;
          video.addEventListener(
            'loadedmetadata',
            () => {
              setIsBuffering(false);
              startPlaybackSafely();
            },
            { once: true }
          );
        } else {
          if (!video.paused && video.readyState >= 3) return;
          setIsBuffering(false);
          setStreamError(
            pickLang(lang, {
              es: 'Esta señal no responde ahora mismo. Pulsa Reintentar o elige tú otra señal debajo del reproductor.',
              ca: 'Aquest senyal no respon ara mateix. Prem Reintentar o tria un altre senyal sota el reproductor.',
              en: 'This stream is not responding right now. Press Retry or choose another signal below.',
            })
          );
        }
      });
      return true;
    };

    if (videoState.mode === 'hls') {
      // On iOS / iPadOS / macOS Safari, prefer Native Apple HLS first so AirPlay 2 always sends
      // full 1080p Video + Audio to the TV (Hls.js blob: MediaSource only sends audio over AirPlay!).
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const isAppleSafariOrIos =
        Boolean(video.canPlayType('application/vnd.apple.mpegurl')) &&
        /iPhone|iPad|iPod|Macintosh|AppleTV/i.test(ua) &&
        !/Chrome|CriOS|FxiOS|EdgiOS|Android/i.test(ua);

      if (
        isAppleSafariOrIos ||
        (isCastingToTv && Boolean(video.canPlayType('application/vnd.apple.mpegurl')))
      ) {
        video.src = videoState.url;
        const onNativeLoaded = () => {
          setIsBuffering(false);
          startPlaybackSafely();
        };
        const onNativeError = () => {
          video.removeEventListener('loadedmetadata', onNativeLoaded);
          if (!attachHlsJs()) {
            setIsBuffering(false);
          }
        };
        video.addEventListener('loadedmetadata', onNativeLoaded, { once: true });
        video.addEventListener('error', onNativeError, { once: true });
      } else if (!attachHlsJs()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoState.url;
          video.addEventListener(
            'loadedmetadata',
            () => {
              setIsBuffering(false);
              startPlaybackSafely();
            },
            { once: true }
          );
        } else {
          setIsBuffering(false);
          setStreamError('HLS not supported on this browser');
        }
      }
    } else if (videoState.mode === 'direct') {
      video.src = videoState.url;
      video.addEventListener(
        'loadedmetadata',
        () => {
          setIsBuffering(false);
          startPlaybackSafely();
        },
        { once: true }
      );
    }

    return () => {
      cancelled = true;
      if (videoWatchdogTimer) clearTimeout(videoWatchdogTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setQualityLevels([]);
      setSelectedQuality(-1);
      setAutoActiveHeight(null);
      setHlsAudioTracks([]);
      setSelectedHlsAudioTrack(-1);
      setActiveHudMenu(null);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [videoState.mode, videoState.url]);

  // Synchronize remote Play / Pause / Smooth Clock-Offset Drift Compensation
  useEffect(() => {
    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') return;
    const video = videoRef.current;
    if (!video || !videoState.url) return;

    isApplyingRemoteRef.current = true;
    if (smoothDriftTimerRef.current) {
      clearTimeout(smoothDriftTimerRef.current);
      smoothDriftTimerRef.current = null;
    }

    if (!videoState.isLive && Number.isFinite(videoState.currentTime) && video.readyState >= 1) {
      const serverNow = Date.now() + socketService.serverClockOffsetMs;
      const elapsedSec =
        videoState.isPlaying && Number.isFinite(videoState.lastUpdated) && videoState.lastUpdated > 0
          ? Math.max(0, Math.min(12, (serverNow - videoState.lastUpdated) / 1000))
          : 0;
      const expectedTime = videoState.currentTime + elapsedSec + syncOffsetMs / 1000;
      const signedDrift = expectedTime - (video.currentTime || 0); // >0 means local client is behind
      const absDrift = Math.abs(signedDrift);

      if (absDrift > 2.5) {
        try {
          video.playbackRate = playbackSpeed || 1;
          video.currentTime = Math.max(0, expectedTime);
        } catch {
          // ignore
        }
      } else if (videoState.isPlaying && absDrift >= 0.35 && absDrift <= 2.0) {
        // Gentle catch-up without triggering MSE seeks or buffering stalls
        const baseRate = playbackSpeed || 1;
        const nudgeRate = signedDrift > 0 ? Math.min(1.04, baseRate * 1.02) : Math.max(0.96, baseRate * 0.98);
        try {
          video.playbackRate = nudgeRate;
          smoothDriftTimerRef.current = setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.playbackRate = playbackSpeed || 1;
            }
          }, 2600);
        } catch {
          // ignore
        }
      } else if (Math.abs((video.playbackRate || 1) - (playbackSpeed || 1)) > 0.005) {
        try {
          video.playbackRate = playbackSpeed || 1;
        } catch {
          // ignore
        }
      }
    }

    if (videoState.isPlaying && video.paused) {
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
      setLocalPlaying(true);
    } else if (!videoState.isPlaying && !video.paused) {
      video.pause();
      setLocalPlaying(false);
    }

    const timer = setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 350);

    return () => {
      clearTimeout(timer);
      if (smoothDriftTimerRef.current) {
        clearTimeout(smoothDriftTimerRef.current);
        smoothDriftTimerRef.current = null;
      }
    };
  }, [
    videoState.isPlaying,
    videoState.currentTime,
    videoState.lastUpdated,
    videoState.mode,
    videoState.url,
    videoState.isLive,
    playbackSpeed,
    syncOffsetMs,
  ]);

  useYouTubeIframeSync({
    videoState,
    ytPlayerRef,
    ytContainerId,
    isApplyingRemoteRef,
    smoothDriftTimerRef,
    syncOffsetMs,
    setIsMuted,
    setVolume,
    setLocalPlaying,
    onSyncAction,
  });

  // ============================================================================
  // PLAYER INTERACTIONS
  // ============================================================================
  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('light');
    revealControls();

    if (videoState.mode === 'youtube' && ytPlayerRef.current) {
      const state = ytPlayerRef.current.getPlayerState?.();
      if (state === 1) {
        ytPlayerRef.current.pauseVideo?.();
        setLocalPlaying(false);
        onSyncAction('pause', {
          isPlaying: false,
          currentTime: ytPlayerRef.current.getCurrentTime?.() || 0,
        });
      } else {
        ytPlayerRef.current.playVideo?.();
        setLocalPlaying(true);
        onSyncAction('play', {
          isPlaying: true,
          currentTime: ytPlayerRef.current.getCurrentTime?.() || 0,
        });
      }
      return;
    }

    const video = videoRef.current;
    if (!video || (videoState.mode !== 'hls' && videoState.mode !== 'direct')) return;

    if (video.paused || !localPlaying) {
      video.play().catch(() => {});
      setLocalPlaying(true);
      onSyncAction('play', {
        isPlaying: true,
        currentTime: video.currentTime || currentTime || 0,
      });
    } else {
      video.pause();
      setLocalPlaying(false);
      onSyncAction('pause', {
        isPlaying: false,
        currentTime: video.currentTime || currentTime || 0,
      });
    }
  };

  const handleSeekRelative = (deltaSec: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoState.isLive) return;
    triggerHaptic('light');
    revealControls();

    const side: 'left' | 'right' = deltaSec < 0 ? 'left' : 'right';
    setSeekRipple(side);
    setTimeout(() => setSeekRipple(null), 550);

    if (videoState.mode === 'youtube' && ytPlayerRef.current?.seekTo) {
      const baseTime = ytPlayerRef.current.getCurrentTime?.() || currentTime || 0;
      const target = Math.max(0, baseTime + deltaSec);
      ytPlayerRef.current.seekTo(target, true);
      setCurrentTime(target);
      onSyncAction('seek', { currentTime: target, isPlaying: localPlaying });
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    const baseTime =
      Number.isFinite(video.currentTime) && video.currentTime > 0
        ? video.currentTime
        : currentTime || videoState.currentTime || 0;
    const maxDur =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : duration > 0
        ? duration
        : Infinity;
    const target = Math.max(0, Math.min(maxDur, baseTime + deltaSec));
    try {
      video.currentTime = target;
    } catch {
      // ignore if media not yet seekable
    }
    setCurrentTime(target);
    onSyncAction('seek', { currentTime: target, isPlaying: !video.paused });
  };

  const handleVideoSurfaceTap = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (isMinimized) {
      return;
    }
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // Netflix-style instant tap-anywhere toggle:
    // Tap anywhere (center, left lateral, right lateral) shows HUD and starts ~3.8s idle timer;
    // tapping anywhere on empty video space while HUD is open hides it immediately.
    if (showControlsRef.current) {
      hideControlsImmediately();
    } else {
      revealControls();
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    if (videoState.mode === 'youtube' && ytPlayerRef.current) {
      try {
        const currentlyMuted = Boolean(ytPlayerRef.current.isMuted?.()) || isMuted;
        if (currentlyMuted) {
          ytPlayerRef.current.unMute?.();
          ytPlayerRef.current.setVolume?.(100);
          ytPlayerRef.current.playVideo?.();
          setIsMuted(false);
          setVolume(1);
        } else {
          ytPlayerRef.current.mute?.();
          setIsMuted(true);
        }
      } catch {
        // ignore
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && video.volume === 0) {
      video.volume = 0.85;
      setVolume(0.85);
    }
  };

  const handleVolumeSlider = (val: number) => {
    setVolume(val);
    if (videoState.mode === 'youtube' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume?.(Math.round(val * 100));
        if (val > 0) {
          ytPlayerRef.current.unMute?.();
          setIsMuted(false);
        } else {
          ytPlayerRef.current.mute?.();
          setIsMuted(true);
        }
      } catch {
        // ignore
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    video.muted = val === 0;
    setIsMuted(val === 0);
  };

  const handleScrub = (nextSec: number) => {
    const video = videoRef.current;
    if (!video || videoState.isLive) return;
    video.currentTime = nextSec;
    setCurrentTime(nextSec);
    onSyncAction('seek', { currentTime: nextSec, isPlaying: !video.paused });
  };

  const handleToggleFullscreen = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('light');
    revealControls();
    const container = stageWrapperRef.current;
    const video = videoRef.current as WebKitVideoElement | null;

    const currentlyFull = Boolean(document.fullscreenElement) || isHorizontalFullscreen;
    if (currentlyFull) {
      setIsHorizontalFullscreen(false);
      setIsFullscreen(false);
      try {
        (window.screen?.orientation as unknown as ScreenOrientationWithLock)?.unlock?.();
      } catch {
        // ignore
      }
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
      setTimeout(() => {
        setViewportDims({ w: window.innerWidth, h: window.innerHeight });
      }, 120);
      return;
    }

    // Enter Horizontal (Landscape) Fullscreen automatically
    setForceLandscapeRotation(true);
    setIsHorizontalFullscreen(true);
    setIsFullscreen(true);
    setViewportDims({ w: window.innerWidth, h: window.innerHeight });

    try {
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch {
      // Fallback: CSS Horizontal Fullscreen Stage is already active via isHorizontalFullscreen
    }

    try {
      const ori = window.screen?.orientation as unknown as ScreenOrientationWithLock | undefined;
      if (ori?.lock) {
        await ori.lock('landscape');
      }
    } catch {
      // When OS portrait lock or browser blocks native lock, our inner 90deg landscape stage handles it automatically
    }

    setTimeout(() => {
      setViewportDims({ w: window.innerWidth, h: window.innerHeight });
    }, 120);
    setTimeout(() => {
      setViewportDims({ w: window.innerWidth, h: window.innerHeight });
    }, 350);

    showTransientToast(
      pickLang(lang, {
        es: 'Pantalla completa horizontal (16:9) activada',
        ca: 'Pantalla completa horitzontal (16:9) activada',
        en: 'Landscape fullscreen enabled',
      })
    );
  };

  const handleToggleLandscapeRotation = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('medium');
    revealControls();

    if (!isHorizontalFullscreen && !isFullscreen) {
      await handleToggleFullscreen(e);
      return;
    }

    const nextForce = !forceLandscapeRotation;
    setForceLandscapeRotation(nextForce);
    try {
      const ori = window.screen?.orientation as unknown as ScreenOrientationWithLock | undefined;
      if (nextForce && ori?.lock) {
        await ori.lock('landscape');
      } else if (!nextForce && ori?.unlock) {
        ori.unlock();
      }
    } catch {
      // ignore
    }
    showTransientToast(
      nextForce
        ? pickLang(lang, {
            es: 'Vista horizontal (16:9) activada',
            ca: 'Vista horitzontal (16:9) activada',
            en: 'Horizontal view enabled',
          })
        : pickLang(lang, {
            es: 'Vista vertical activada',
            ca: 'Vista vertical activada',
            en: 'Vertical view enabled',
          })
    );
  };

  /**
   * Superponer el vídeo encima de otra pantalla del teléfono (Android & iPhone PiP)
   */
  const handleTogglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const video = videoRef.current as WebKitVideoElement | null;
    if (!video) return;

    try {
      // Standard W3C PiP (Android Chrome, Samsung, Edge, Desktop)
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsInPiP(false);
        return;
      }
      if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsInPiP(true);
        return;
      }
      // iOS Safari WebKit Presentation Mode PiP
      if (video.webkitSupportsPresentationMode?.('picture-in-picture') && video.webkitSetPresentationMode) {
        const nextMode =
          video.webkitPresentationMode === 'picture-in-picture'
            ? 'inline'
            : 'picture-in-picture';
        video.webkitSetPresentationMode(nextMode);
        setIsInPiP(nextMode === 'picture-in-picture');
        return;
      }
      showTransientToast(
        pickLang(lang, {
          es: 'Tu navegador actual no soporta ventana superpuesta en este formato',
          ca: 'El teu navegador actual no admet finestra flotant en aquest format',
          en: 'Floating window is not supported for this stream format',
        })
      );
    } catch {
      showTransientToast(
        pickLang(lang, {
          es: 'Inicia la reproducción un segundo antes de activar pantalla flotante',
          ca: 'Inicia la reproducció un segon abans d’activar la pantalla flotant',
          en: 'Play the video first to enable floating PiP window',
        })
      );
    }
  };

  const handleChangeQuality = (levelIndex: number) => {
    setSelectedQuality(levelIndex);
    setActiveHudMenu(null);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    const chosenLevel = qualityLevels.find((q) => q.index === levelIndex);
    showTransientToast(
      levelIndex === -1
        ? pickLang(lang, {
            es: 'Calidad: Automática (ABR)',
            ca: 'Qualitat: Automàtica (ABR)',
            en: 'Quality: Auto (ABR)',
          })
        : pickLang(lang, {
            es: `Calidad fijada en ${chosenLevel?.height || ''}p`,
            ca: `Qualitat fixada a ${chosenLevel?.height || ''}p`,
            en: `Quality locked to ${chosenLevel?.height || ''}p`,
          })
    );
  };

  const handleSelectHlsAudioTrack = (trackId: number) => {
    setSelectedHlsAudioTrack(trackId);
    setActiveHudMenu(null);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    }
    const found = hlsAudioTracks.find((tr) => tr.id === trackId);
    showTransientToast(
      pickLang(lang, {
        es: `Audio: ${found?.name || `Pista ${trackId + 1}`}`,
        ca: `Àudio: ${found?.name || `Pista ${trackId + 1}`}`,
        en: `Audio: ${found?.name || `Track ${trackId + 1}`}`,
      })
    );
  };

  const handleForceReloadStream = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('medium');
    setStreamError(null);
    if (videoState.tracks.length > 0) {
      onSelectTrack(videoState.activeTrackIndex, currentTime);
    } else if (hlsRef.current) {
      hlsRef.current.startLoad();
    } else if (videoRef.current && videoState.url) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  const handleCloudCanvasClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 720);
    socketService.sendCloudBrowserInput({ type: 'click', x, y });
  };

  const handleCloudWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    socketService.sendCloudBrowserInput({ type: 'scroll', deltaY: Math.round(e.deltaY) });
  };

  const handleCloudNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudUrlInput.trim()) return;
    socketService.sendCloudBrowserInput({ type: 'navigate', url: cloudUrlInput.trim() });
  };

  const hasTracks = Boolean(videoState.tracks && videoState.tracks.length > 0);
  const canUseNativePiPOrCast =
    videoState.mode === 'hls' || videoState.mode === 'direct';
  const activeLanguagePopup = localLangPopup || languageNotice;
  const activeTrackObj = videoState.tracks?.[videoState.activeTrackIndex];

  const activeTrackLangCode = resolveTrackLang(activeTrackObj, {
    subtitle: videoState.subtitle,
    title: videoState.title,
  });

  const handleQuickLanguageSwitch = (targetLangCode: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT') => {
    triggerHaptic('light');
    const langDisplayNames: Record<'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT', string> = {
      ES: 'Castellano (España)',
      CAT: 'Català',
      LAT: 'Español Latino',
      VOSE: 'Subtitulado (VOSE)',
      EN: 'Inglés Original (EN)',
    };
    const requestedName = langDisplayNames[targetLangCode];

    const matchingIdx = (videoState.tracks || []).findIndex(
      (tr) =>
        resolveTrackLang(tr, {
          subtitle: videoState.subtitle,
          title: videoState.title,
        }) === targetLangCode
    );

    if (matchingIdx === -1) {
      const availableLabels = Array.from(
        new Set((videoState.tracks || []).map((tr) => tr.label).filter(Boolean))
      );
      triggerLocalLanguagePopup({
        type: 'warning',
        title: `Idioma no disponible: ${requestedName}`,
        subtitle:
          availableLabels.length > 0
            ? `Este título solo está disponible en: ${availableLabels.join(' · ')}`
            : 'No hay pistas alternativas disponibles para este contenido.',
      });
      return;
    }

    const targetTrack = videoState.tracks[matchingIdx];
    if (matchingIdx === videoState.activeTrackIndex) {
      triggerLocalLanguagePopup({
        type: 'success',
        title: `Reproduciendo en: ${targetTrack.label}`,
        subtitle: 'Este idioma ya se encuentra activo en el reproductor.',
      });
      return;
    }

    triggerLocalLanguagePopup({
      type: 'success',
      title: `Cambiando idioma a: ${targetTrack.label}`,
      subtitle: 'Sincronizando señal de audio HD en la sala...',
    });
    onSelectTrack(matchingIdx, currentTime);
  };

  return (
    <section
      className={`w-full ${
        isTvMode
          ? 'h-screen h-full overflow-hidden bg-black'
          : isMinimized
            ? 'overflow-hidden bg-black rounded-2xl border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9)]'
            : isCinemaMode
              ? 'bg-transparent'
              : 'overflow-hidden bg-black lg:rounded-2xl lg:border lg:border-white/[0.08] lg:shadow-2xl lg:shadow-black/60'
      }`}
    >
      {/* ==================================================================== */}
      {/* 16:9 VIDEO STAGE (Supports True 90deg Horizontal Mobile Fullscreen)  */}
      {/* ==================================================================== */}
      <div
        ref={stageWrapperRef}
        onPointerMove={(e) => {
          if (isMinimized) return;
          if (e.pointerType === 'mouse') {
            if (Date.now() - lastManualHideAtRef.current < 350) return;
            const prev = lastMousePosRef.current;
            if (
              prev &&
              Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6 &&
              !showControlsRef.current
            ) {
              return;
            }
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            revealControls();
          }
        }}
        onPointerDownCapture={() => {
          if (showControlsRef.current) {
            scheduleHideControls();
          }
        }}
        onPointerMoveCapture={(e) => {
          if (e.pointerType !== 'mouse' && showControlsRef.current) {
            scheduleHideControls();
          }
        }}
        style={
          isStageFullscreen
            ? {
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 250,
                borderRadius: 0,
              }
            : undefined
        }
        className={`relative w-full bg-black overflow-hidden select-none transition-[height] duration-200 ${
          isTvMode || isStageFullscreen
            ? 'h-full'
            : compactVideoForMobileKeyboard
            ? 'h-[122px] sm:aspect-video'
            : isCompressed && !isMinimized
            ? 'h-[136px] sm:h-[210px] lg:h-[238px]'
            : 'aspect-video'
        } ${
          isCinemaMode && !isMinimized && !isCompressed && !isTvMode && !isStageFullscreen
            ? 'z-50 lg:rounded-2xl ring-1 ring-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* Inner rotatable stage container (immune to Chrome :fullscreen UA transform override) */}
        <div
          style={
            shouldRotate90
              ? {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${viewportDims.h}px`,
                  height: `${viewportDims.w}px`,
                  maxWidth: `${viewportDims.h}px`,
                  maxHeight: `${viewportDims.w}px`,
                  transform: 'translate(-50%, -50%) rotate(90deg)',
                  transformOrigin: 'center center',
                }
              : undefined
          }
          className="relative w-full h-full overflow-hidden select-none"
        >
        {/* Floating Reactions Layer (Hidden when docked in mini or scroll-compressed bar) */}
        {!isMinimized && !isCompressed && (
          <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
            {floatingReactions.map((r) => (
              <div
                key={r.id}
                style={{ left: `${r.xOffset}%` }}
                className="absolute bottom-10 animate-float-up flex flex-col items-center"
              >
                <span className="text-3xl drop-shadow-md">{r.emoji}</span>
                <span className="text-[10px] font-medium text-white/90 bg-black/65 px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap">
                  {r.senderName}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Double-Tap Seek Visual Feedback */}
        {seekRipple && !isMinimized && (
          <div
            className={`pointer-events-none absolute inset-y-0 ${
              seekRipple === 'left' ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full'
            } w-1/3 bg-white/15 backdrop-blur-[2px] z-30 flex items-center justify-center text-xs font-bold text-white`}
          >
            {seekRipple === 'left' ? '« -10s' : '+10s »'}
          </div>
        )}

        {/* Prominent On-Screen Language Switch / Unavailable Language Popup */}
        {activeLanguagePopup && !isMinimized && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setLocalLangPopup(null);
              onDismissLanguageNotice?.();
            }}
            className={`pointer-events-auto absolute top-12 sm:top-14 left-1/2 -translate-x-1/2 z-45 w-[92%] max-w-[430px] px-3.5 py-2.5 rounded-2xl backdrop-blur-xl border shadow-[0_20px_50px_rgba(0,0,0,0.92)] flex items-start justify-between gap-2.5 cursor-pointer transition-all ${
              activeLanguagePopup.type === 'warning' || activeLanguagePopup.type === 'error'
                ? 'bg-[#19110B]/95 border-amber-400/55 text-amber-100'
                : 'bg-[#0B1412]/95 border-emerald-400/50 text-emerald-50'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  activeLanguagePopup.type === 'warning' || activeLanguagePopup.type === 'error'
                    ? 'bg-amber-500/25 text-amber-300'
                    : 'bg-emerald-500/25 text-emerald-300'
                }`}
              >
                {activeLanguagePopup.type === 'warning' || activeLanguagePopup.type === 'error' ? (
                  <RiffanWarningIcon size={16} animate="always" tone="current" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 text-left">
                <div className="font-display font-bold text-xs sm:text-sm text-white leading-snug">
                  {activeLanguagePopup.title}
                </div>
                {activeLanguagePopup.subtitle && (
                  <div className="text-[11px] text-zinc-200/90 leading-snug mt-0.5">
                    {activeLanguagePopup.subtitle}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLocalLangPopup(null);
                onDismissLanguageNotice?.();
              }}
              className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
              aria-label="Cerrar aviso de idioma"
            >
              <RiffanCloseIcon size={14} tone="current" />
            </button>
          </div>
        )}

        {/* Transient Player Toast (Chromecast / PiP feedback) */}
        {playerToast && !isMinimized && (
          <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-xl bg-[#18181B]/95 border border-white/15 text-xs font-medium text-white shadow-xl text-center max-w-[90%]">
            {playerToast}
          </div>
        )}

        {/* Incoming Live Chat Message Pill (Bottom-Left over Video when Floating Chat Orb is closed) */}
        {recentIncomingChatBubble && !floatingChatOpen && !isMinimized && !isCompressed && !isTvMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRecentIncomingChatBubble(null);
              onToggleFloatingChat?.();
            }}
            className="pointer-events-auto absolute bottom-14 left-3 z-35 max-w-[78%] sm:max-w-[320px] px-3 py-2 rounded-2xl bg-[#18181B]/88 hover:bg-[#18181B] backdrop-blur-md border border-[#9146FF]/35 shadow-2xl flex items-center gap-2 text-left cursor-pointer"
          >
            <RiffanChatIcon size={14} />
            <div className="min-w-0 text-xs">
              <span className="font-bold text-[#BF94FF] mr-1.5">
                {recentIncomingChatBubble.senderName}:
              </span>
              <span className="text-white truncate">{recentIncomingChatBubble.text}</span>
            </div>
          </button>
        )}

        {/* Active Chromecast or Phone Battery-Saver Remote Overlay */}
        {(isCastingToTv || (batterySaverTvMode && hasConnectedSmartTv)) && !isMinimized && !isTvMode && (
          <div className="absolute inset-0 z-15 bg-[#0E0E10]/94 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#00F593]/15 border border-[#00F593]/40 flex items-center justify-center text-[#00F593]">
              <Tv className="w-6 h-6" />
            </div>
            <p className="font-display font-bold text-sm sm:text-base text-white">
              {isCastingToTv
                ? `${pickLang(lang, {
                    es: 'Transmitiendo en',
                    ca: 'Transmetent a',
                    en: 'Casting to',
                  })} ${
                    castDeviceName ||
                    pickLang(lang, { es: 'tu TV', ca: 'la teva TV', en: 'your TV' })
                  }`
                : pickLang(lang, {
                    es: 'Modo Solo Mando · Reproduciendo en tu Smart TV',
                    ca: 'Mode Només Comandament · Reproduint a la teva Smart TV',
                    en: 'Remote-Only Mode · Playing on your Smart TV',
                  })}
            </p>
            <p className="text-xs text-zinc-400 max-w-xs">
              {batterySaverTvMode
                ? pickLang(lang, {
                    es: 'Vídeo local pausado para ahorrar batería en tu móvil. Tus controles siguen sincronizados.',
                    ca: 'Vídeo local en pausa per estalviar bateria al mòbil. Els controls continuen sincronitzats.',
                    en: 'Local video paused to save phone battery. Your controls remain synced.',
                  })
                : videoState.title}
            </p>
            {batterySaverTvMode && (
              <button
                type="button"
                onClick={() => setBatterySaverTvMode(false)}
                className="mt-1 min-h-[38px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                {pickLang(lang, {
                  es: 'Ver vídeo también en el móvil',
                  ca: 'Veure vídeo també al mòbil',
                  en: 'Watch on phone as well',
                })}
              </button>
            )}
          </div>
        )}

        {/* Compact Expand Pill when Inline Scroll-Compressed (No Corner PiP) */}
        {isCompressed && !isMinimized && !isTvMode && !isStageFullscreen && (
          <div className="pointer-events-none absolute top-2 right-2 z-35 flex items-center gap-1.5">
            {onExpandCompressed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  onExpandCompressed();
                }}
                aria-label={pickLang(lang, {
                  es: 'Ampliar reproductor',
                  ca: 'Ampliar reproductor',
                  en: 'Expand player',
                })}
                className="pointer-events-auto min-h-[34px] px-3 rounded-full bg-black/75 hover:bg-[#9146FF] backdrop-blur-md border border-white/20 text-[11px] font-bold text-white flex items-center gap-1.5 shadow-lg cursor-pointer active:scale-95 transition-all"
              >
                <RiffanFullscreenIcon size={14} tone="current" />
                <span>{pickLang(lang, { es: 'Ampliar', ca: 'Ampliar', en: 'Expand' })}</span>
              </button>
            )}
          </div>
        )}

        {/* Top Bar Inside Player: Title + Finish Time on Pause + Cast + Chat + Ajustes + Close (Native HLS/Direct) */}
        {!isMinimized &&
          (!isCompressed || isStageFullscreen) &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-30 px-3 sm:px-5 pt-3 pb-10 bg-gradient-to-b from-black/90 via-black/45 to-transparent flex items-start justify-between gap-3 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="min-w-0 pt-1">
              <h2 className="font-display font-bold text-sm sm:text-base text-white truncate drop-shadow">
                {videoState.title}
              </h2>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {videoState.subtitle && (
                  <p className="text-[11px] sm:text-xs text-zinc-300 truncate">
                    {videoState.subtitle}
                  </p>
                )}
                {!localPlaying && !videoState.isLive && duration > 60 && duration > currentTime && (
                  <span className="px-2 py-0.5 rounded-full bg-white/12 backdrop-blur-md text-[10px] font-mono font-semibold text-zinc-200">
                    Termina a las{' '}
                    {new Date(
                      Date.now() + ((duration - currentTime) / (playbackSpeed || 1)) * 1000
                    ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 1. 1-TAP DIRECT CAST TO TV (Fullscreen only — windowed uses below-video strip) */}
              {!isTvMode && (isFullscreen || isHorizontalFullscreen) && (
                <button
                  type="button"
                  onClick={handleDirectCastToTv}
                  title="Enviar señal directa a TV (Chromecast / AirPlay 2 / Smart TV)"
                  aria-label="Cast Directo a TV"
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    isCastingToTv || hasConnectedSmartTv
                      ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.35)]'
                      : 'bg-[#141418]/80 hover:bg-[#9146FF] border-white/20 text-white'
                  }`}
                >
                  <RiffanCastIcon size={16} tone="current" />
                  <span className="hidden sm:inline">{isCastingToTv ? 'En TV' : 'Cast'}</span>
                </button>
              )}

              {/* 2. Live Voice Call Toggle (Fullscreen movie/sports HUD) */}
              {!isTvMode && (isFullscreen || isHorizontalFullscreen) && voiceChat && (
                <div className="flex items-center gap-1.5">
                  {voiceChat.isJoined ? (
                    <>
                      <button
                        type="button"
                        aria-pressed={voiceChat.isMuted}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          voiceChat.toggleMute();
                        }}
                        title={
                          voiceChat.isMuted
                            ? pickLang(lang, { es: 'Activar micrófono', ca: 'Activar micròfon', en: 'Unmute mic' })
                            : pickLang(lang, { es: 'Silenciar micrófono', ca: 'Silenciar micròfon', en: 'Mute mic' })
                        }
                        className={`min-h-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                          voiceChat.isMuted
                            ? 'bg-rose-500/25 border-rose-400/60 text-rose-100'
                            : voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0
                            ? 'bg-emerald-500/30 border-emerald-300 text-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.3)]'
                            : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                        }`}
                      >
                        {voiceChat.isMuted ? (
                          <MicOff className="w-4 h-4 shrink-0" />
                        ) : (
                          <>
                            <Mic className="w-4 h-4 shrink-0" />
                            <VoiceWaveBars
                              active={!voiceChat.isMuted && (voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0)}
                              level={voiceChat.localAudioLevel}
                              size="sm"
                            />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('medium');
                          voiceChat.leaveVoice();
                        }}
                        title={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
                        aria-label={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
                        className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#141418]/80 hover:bg-rose-500/30 border border-white/15 hover:border-rose-400/60 text-zinc-100 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                      >
                        <PhoneOff className="w-4 h-4 shrink-0" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={voiceChat.status === 'requesting'}
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('medium');
                        void voiceChat.joinVoice();
                      }}
                      title={pickLang(lang, { es: 'Abrir llamada de voz', ca: 'Obrir trucada de veu', en: 'Open voice call' })}
                      aria-label={pickLang(lang, { es: 'Abrir llamada de voz', ca: 'Obrir trucada de veu', en: 'Open voice call' })}
                      className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-[#9146FF]/85 hover:bg-[#772CE8] border border-white/20 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    >
                      <RiffanVoiceCallIcon size={16} tone="current" />
                      <span className="hidden sm:inline">
                        {pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* 3. Ajustes de Reproducción (Fullscreen only — windowed uses below-video strip) */}
              {!isTvMode && (isFullscreen || isHorizontalFullscreen) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('medium');
                    setShowProMenu(true);
                  }}
                  title="Ajustes de Reproducción: Subtítulos, Modo Cine, PiP, Audio y Calidad"
                  aria-label="Abrir Ajustes de Reproducción"
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    showProMenu ||
                    isCinemaMode ||
                    isInPiP ||
                    vocalBoostEnabled ||
                    activeSubId !== 'off'
                      ? 'bg-[#9146FF]/25 border-[#9146FF]/60 text-white shadow-[0_0_20px_rgba(145,70,255,0.3)]'
                      : 'bg-[#141418]/75 hover:bg-[#141418]/95 border-white/15 text-white'
                  }`}
                >
                  <RiffanSlidersIcon size={16} tone="current" />
                  <span className="hidden sm:inline">Ajustes</span>
                </button>
              )}

              {/* 3b. Direct 1-Tap Native Picture-in-Picture inside player controls */}
              {!isTvMode && canUseNativePiPOrCast && (
                <button
                  type="button"
                  onClick={handleTogglePiP}
                  title={isInPiP ? 'Salir de Picture-in-Picture' : 'Ventana flotante (PiP)'}
                  aria-label={isInPiP ? 'Salir de Picture-in-Picture' : 'Activar Picture-in-Picture'}
                  className={`min-h-[44px] min-w-[44px] rounded-2xl backdrop-blur-xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                    isInPiP
                      ? 'bg-[#9146FF]/30 border-[#9146FF] text-white shadow-[0_0_16px_rgba(145,70,255,0.4)]'
                      : 'bg-[#18181B]/70 hover:bg-[#18181B]/90 border-white/15 text-zinc-100'
                  }`}
                >
                  <PictureInPicture2 className="w-4 h-4 text-sky-400" />
                </button>
              )}

              {/* 4. 1-Tap Internal Floating 16:9 Mini-Player */}
              {!isTvMode &&
                !isFullscreen &&
                !isHorizontalFullscreen &&
                onToggleMinimize && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onToggleMinimize();
                    }}
                    title="Mini-Player flotante arrastrable (16:9)"
                    aria-label="Activar Mini-Player flotante"
                    className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#18181B]/70 hover:bg-[#18181B]/90 backdrop-blur-xl border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                )}

              {isTvMode && (
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="min-h-[44px] px-4 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  {isFullscreen ? (
                    <>
                      <RiffanExitFullscreenIcon size={16} tone="current" />
                      <span>Salir Pantalla Completa</span>
                    </>
                  ) : (
                    <>
                      <RiffanFullscreenIcon size={16} tone="current" />
                      <span>Pantalla Completa</span>
                    </>
                  )}
                </button>
              )}

              {isTvMode && onExitTvMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExitTvMode();
                  }}
                  className="min-h-[44px] px-3.5 rounded-2xl bg-black/75 hover:bg-rose-600/90 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Salir TV</span>
                </button>
              )}

              {!isTvMode && (isFullscreen || isHorizontalFullscreen) ? (
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  title="Salir de pantalla completa"
                  aria-label="Salir de pantalla completa"
                  className="min-h-[44px] px-3.5 rounded-2xl bg-black/70 hover:bg-rose-600/90 backdrop-blur-xl border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <RiffanExitFullscreenIcon size={16} tone="current" />
                  <span>Salir</span>
                </button>
              ) : (
                !isTvMode &&
                onClosePlayer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onClosePlayer();
                    }}
                    title="Cerrar reproductor"
                    aria-label="Cerrar reproductor"
                    className="min-h-[44px] min-w-[44px] rounded-2xl bg-black/60 hover:bg-rose-600/90 backdrop-blur-xl border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <RiffanCloseIcon size={16} tone="current" />
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Unobtrusive Corner Actions for Embedded Web & YouTube Stages (Zero Top Scrim Obstruction) */}
        {!isMinimized &&
          (videoState.mode === 'embed' || videoState.mode === 'youtube') && (
            <div className="pointer-events-none absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
              {!isTvMode &&
                !isFullscreen &&
                !isHorizontalFullscreen &&
                onToggleMinimize && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onToggleMinimize();
                    }}
                    title="Mini-Player flotante"
                    aria-label="Activar Mini-Player flotante"
                    className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                )}

              <button
                type="button"
                onClick={handleToggleFullscreen}
                title={
                  isFullscreen || isHorizontalFullscreen
                    ? 'Salir de pantalla completa'
                    : 'Pantalla completa'
                }
                aria-label="Pantalla completa"
                className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
              >
                {isFullscreen || isHorizontalFullscreen ? (
                  <RiffanExitFullscreenIcon size={16} tone="current" />
                ) : (
                  <RiffanFullscreenIcon size={16} tone="current" />
                )}
              </button>

              {!isTvMode &&
                !isFullscreen &&
                !isHorizontalFullscreen &&
                onClosePlayer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onClosePlayer();
                    }}
                    title="Cerrar reproductor"
                    aria-label="Cerrar reproductor"
                    className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-black/70 hover:bg-rose-600/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <RiffanCloseIcon size={16} tone="current" />
                  </button>
                )}
            </div>
          )}

        {/* ================================================================== */}
        {/* IDLE STANDBY STAGE (Apple TV OLED Lounge)                          */}
        {/* ================================================================== */}
        {videoState.mode === 'idle' && !isExtracting && !isMinimized && (
          <IdleStandbyStage
            lang={lang}
            isTvMode={isTvMode}
            isFullscreen={isFullscreen}
            roomCode={roomCode}
            roomDisplayName={roomDisplayName}
            participantCount={participantCount}
            extractionError={extractionError}
            onToggleFullscreen={handleToggleFullscreen}
            onExitTvMode={onExitTvMode}
            onOpenCatalogSection={onOpenCatalogSection}
          />
        )}

        {/* ================================================================== */}
        {/* NATIVE HTML5 + HLS VIDEO ELEMENT + OPTIONAL MULTI-VIEW 2ND MATCH   */}
        {/* ================================================================== */}
        <div
          onClick={handleVideoSurfaceTap}
          className={`w-full h-full ${
            videoState.mode === 'hls' || videoState.mode === 'direct'
              ? secondaryStream && !isMinimized
                ? 'flex items-stretch'
                : 'block'
              : 'hidden'
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            x-webkit-airplay="allow"
            onClick={handleVideoSurfaceTap}
            onLoadedMetadata={(e) => {
              if (playbackSpeed !== 1) {
                e.currentTarget.playbackRate = playbackSpeed;
              }
            }}
            onEnded={() => {
              onVideoEnded?.();
              if (
                videoState.seriesMeta &&
                onNextEpisode &&
                canControlRoom &&
                autoNextCancelledForUrl !== videoState.url &&
                autoNextTriggeredUrlRef.current !== videoState.url
              ) {
                autoNextTriggeredUrlRef.current = videoState.url;
                setAutoNextCountdown(null);
                onNextEpisode();
              }
            }}
            onTimeUpdate={(e) => {
              const ct = e.currentTarget.currentTime;
              const dur = e.currentTarget.duration || 0;
              latestCurrentTimeRef.current = ct;
              if (!e.currentTarget.paused) {
                clearBufferingIndicator();
              }
              if (!videoState.isLive && (showControlsRef.current || activeSubId !== 'off' || Math.abs(ct - currentTime) >= 1)) {
                setCurrentTime(ct);
              }
              if (
                onProgressUpdate &&
                !videoState.isLive &&
                ct > 4 &&
                Date.now() - lastProgressEmitRef.current > 5000
              ) {
                lastProgressEmitRef.current = Date.now();
                onProgressUpdate(ct, dur);
              }
            }}
            onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
            onCanPlay={clearBufferingIndicator}
            onCanPlayThrough={clearBufferingIndicator}
            onWaiting={() => {
              const vNow = videoRef.current;
              const waitAtTime = vNow ? vNow.currentTime : 0;

              if (bufferingDelayTimerRef.current) {
                clearTimeout(bufferingDelayTimerRef.current);
              }
              bufferingDelayTimerRef.current = setTimeout(() => {
                const v = videoRef.current;
                if (!v || v.paused) return;
                // Check again if a buffered range appeared right ahead of a gap before showing spinner
                for (let i = 0; i < v.buffered.length; i++) {
                  const bStart = v.buffered.start(i);
                  const bEnd = v.buffered.end(i);
                  if (bStart > v.currentTime && bStart - v.currentTime <= 3.0 && bEnd - bStart >= 0.4) {
                    try {
                      v.currentTime = bStart + 0.06;
                      v.play().catch(() => {});
                      return;
                    } catch {
                      // ignore
                    }
                  }
                }
                if (v.readyState < 3 && Math.abs((v.currentTime || 0) - waitAtTime) < 0.08) {
                  setIsBuffering(true);
                }
              }, 1600);
            }}
            onPlaying={(e) => {
              clearBufferingIndicator();
              setLocalPlaying(true);
              setStreamError(null);
              if (
                videoState.url &&
                qoeStartupSentForUrlRef.current !== videoState.url
              ) {
                qoeStartupSentForUrlRef.current = videoState.url;
                const startupMs = Math.max(0, Math.min(60_000, Date.now() - streamLoadStartRef.current));
                const activeTrack = videoState.tracks?.[videoState.activeTrackIndex];
                const v = e.currentTarget;
                const resolution =
                  v.videoHeight >= 1080
                    ? '1080p'
                    : v.videoHeight >= 720
                    ? '720p'
                    : v.videoHeight > 0
                    ? `${v.videoHeight}p`
                    : undefined;
                fetch('/api/metrics/qoe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    platform: isTvMode ? 'smart-tv' : 'web',
                    startupMs,
                    rebufferCount: rebufferCountRef.current,
                    resolution,
                    stallFailoverUsed: false,
                    sourceUrl: activeTrack?.sourceUrl || videoState.url,
                  }),
                }).catch(() => {});
              }
              if (showControlsRef.current) {
                scheduleHideControls();
              }
            }}
            onPause={(e) => {
              setLocalPlaying(false);
              if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
                controlsTimeoutRef.current = null;
              }
              showControlsRef.current = true;
              setShowControls(true);
              if (
                onProgressUpdate &&
                !videoState.isLive &&
                e.currentTarget.currentTime > 4
              ) {
                lastProgressEmitRef.current = Date.now();
                onProgressUpdate(
                  e.currentTarget.currentTime,
                  e.currentTarget.duration || 0
                );
              }
            }}
            onVolumeChange={(e) => {
              setIsMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
              setVolume(e.currentTarget.volume);
            }}
            className={`${
              secondaryStream && !isMinimized && secondaryStream.layout === 'split'
                ? 'w-1/2'
                : 'w-full'
            } h-full ${
              tvAspectMode === 'cover'
                ? 'object-cover'
                : tvAspectMode === 'fill'
                ? 'object-fill'
                : 'object-contain'
            } bg-black cursor-pointer [transform:translateZ(0)]`}
          />

          {/* Direct HTTP Video Bridge for W3C RemotePlayback & AirPlay 2 (non-zero 2x2px dimensions so browser never disables video decoding track!) */}
          <video
            ref={castBridgeVideoRef}
            preload="metadata"
            playsInline
            muted
            x-webkit-airplay="allow"
            className="fixed bottom-0 right-0 w-[2px] h-[2px] opacity-[0.01] pointer-events-none -z-10"
          />

          {secondaryStream &&
            !isMinimized &&
            secondaryStream.layout === 'split' &&
            onSwapSecondaryStream &&
            onToggleSecondaryLayout &&
            onCloseSecondaryStream && (
              <SecondaryHlsStage
                secondaryStream={secondaryStream}
                lang={lang}
                onSwapWithPrimary={onSwapSecondaryStream}
                onToggleLayout={onToggleSecondaryLayout}
                onCloseSecondary={onCloseSecondaryStream}
              />
            )}
        </div>

        {/* Corner Multi-View Secondary Live Match Overlay */}
        {secondaryStream &&
          !isMinimized &&
          secondaryStream.layout === 'corner' &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') &&
          onSwapSecondaryStream &&
          onToggleSecondaryLayout &&
          onCloseSecondaryStream && (
            <SecondaryHlsStage
              secondaryStream={secondaryStream}
              lang={lang}
              onSwapWithPrimary={onSwapSecondaryStream}
              onToggleLayout={onToggleSecondaryLayout}
              onCloseSecondary={onCloseSecondaryStream}
            />
          )}

        {/* Custom Synchronized Subtitles Cue Overlay Inside 16:9 Stage */}
        {!isMinimized &&
          activeSubId !== 'off' &&
          parsedCues.length > 0 &&
          (() => {
            const cueText = findActiveSubtitleText(
              parsedCues,
              currentTime,
              subtitleOffsetSec
            );
            if (!cueText) return null;
            const sizeClass =
              subtitleSize === 'sm'
                ? 'text-xs sm:text-sm'
                : subtitleSize === 'lg'
                ? 'text-base sm:text-2xl'
                : 'text-sm sm:text-lg';
            return (
              <div
                className={`pointer-events-none absolute inset-x-4 z-25 flex justify-center transition-all duration-150 ${
                  showControls ? 'bottom-16 sm:bottom-20' : 'bottom-4 sm:bottom-7'
                }`}
              >
                <div
                  className={`max-w-[88%] px-3 py-1.5 rounded-lg font-medium text-center whitespace-pre-line leading-snug ${sizeClass}`}
                  style={{
                    color: subtitleStyle.fontColor,
                    fontSize: `${subtitleStyle.fontScale * 100}%`,
                    backgroundColor: `rgba(0, 0, 0, ${subtitleStyle.bgOpacity})`,
                    textShadow:
                      subtitleStyle.edgeShadow === 'none'
                        ? 'none'
                        : subtitleStyle.edgeShadow === 'outline'
                        ? '0 0 4px #000, 0 0 2px #000'
                        : '0 2px 6px rgba(0,0,0,0.9)',
                  }}
                >
                  {cueText}
                </div>
              </div>
            );
          })()}

        {/* Netflix-Style Auto-Next Episode Countdown Card */}
        {!isMinimized && autoNextCountdown !== null && onNextEpisode && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-16 right-3 sm:bottom-20 sm:right-5 z-35 p-3 rounded-2xl bg-[#141418]/95 nc-specular-surface border border-[#9146FF]/40 shadow-[0_18px_45px_rgba(0,0,0,0.7)] flex items-center gap-2.5 backdrop-blur-xl animate-sheet-up"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-[#BF94FF]">
                {pickLang(lang, { es: 'Fin del capítulo', ca: 'Final del capítol', en: 'Up next' })}
              </div>
              <div className="text-xs font-bold text-white whitespace-nowrap">
                {pickLang(lang, {
                  es: `Siguiente episodio en ${autoNextCountdown}s…`,
                  ca: `Següent episodi en ${autoNextCountdown}s…`,
                  en: `Next episode in ${autoNextCountdown}s…`,
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                autoNextTriggeredUrlRef.current = videoState.url;
                setAutoNextCountdown(null);
                onNextEpisode();
              }}
              className="min-h-[34px] px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5 fill-current" />
              <span>{pickLang(lang, { es: 'Ver ya', ca: 'Veure ara', en: 'Play now' })}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoNextCancelledForUrl(videoState.url);
                setAutoNextCountdown(null);
              }}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center cursor-pointer"
              aria-label="Cancelar auto-reproducción"
            >
              <RiffanCloseIcon size={14} tone="current" />
            </button>
          </div>
        )}

        {/* Hidden File Input for Local .SRT / .VTT Subtitles */}
        <input
          ref={subtitleFileInputRef}
          type="file"
          accept=".srt,.vtt,text/plain"
          onChange={handleUploadLocalSubtitle}
          className="hidden"
        />

        {/* Tactile Center Touch Controls Overlay (Elevated z-35 so Top/Bottom bars never block taps) */}
        {!isMinimized &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') &&
          !isExtracting &&
          !streamError && (
            <div
              className={`pointer-events-none absolute inset-0 z-35 flex items-center justify-center gap-6 sm:gap-10 transition-opacity duration-150 ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {!videoState.isLive && (
                <button
                  type="button"
                  disabled={!showControls}
                  onClick={(e) => handleSeekRelative(-10, e)}
                  aria-label="Retroceder 10 segundos"
                  className={`relative z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#141418]/75 hover:bg-[#1F1F26]/90 backdrop-blur-xl border border-white/20 hover:border-white/35 flex flex-col items-center justify-center text-white shadow-xl active:scale-90 transition-all cursor-pointer ${
                    showControls ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="text-[9px] font-bold tabular-nums tracking-tighter -mt-0.5">-10s</span>
                </button>
              )}

              <button
                type="button"
                disabled={!showControls}
                onClick={(e) => handleTogglePlay(e)}
                aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
                className={`relative z-40 w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-[#141418]/80 hover:bg-[#9146FF] backdrop-blur-xl border border-white/25 hover:border-[#BF94FF]/70 flex items-center justify-center text-white shadow-[0_14px_40px_rgba(0,0,0,0.65)] hover:shadow-[0_10px_32px_rgba(145,70,255,0.45)] active:scale-90 transition-all cursor-pointer ${
                  showControls ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                {localPlaying ? (
                  <RiffanPauseIcon size={30} tone="current" />
                ) : (
                  <RiffanPlayIcon size={30} tone="current" />
                )}
              </button>

              {!videoState.isLive && (
                <button
                  type="button"
                  disabled={!showControls}
                  onClick={(e) => handleSeekRelative(10, e)}
                  aria-label="Avanzar 10 segundos"
                  className={`relative z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#141418]/75 hover:bg-[#1F1F26]/90 backdrop-blur-xl border border-white/20 hover:border-white/35 flex flex-col items-center justify-center text-white shadow-xl active:scale-90 transition-all cursor-pointer ${
                    showControls ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="text-[9px] font-bold tabular-nums tracking-tighter -mt-0.5">+10s</span>
                </button>
              )}
            </div>
          )}

        {/* ================================================================== */}
        {/* YOUTUBE STAGE                                                      */}
        {/* ================================================================== */}
        {videoState.mode === 'youtube' && (
          <div className="relative w-full h-full bg-black">
            <div id={ytContainerId.current} className="w-full h-full" />
            {/* 1-Tap Sound Unlock / Mute Toggle Pill for YouTube Stage */}
            {!isMinimized && (
              <div className="absolute bottom-12 left-3 z-30 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`min-h-[38px] px-3.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer active:scale-95 transition-all shadow-lg ${
                    isMuted
                      ? 'bg-[#9146FF] border-[#9146FF] text-white'
                      : 'bg-black/75 hover:bg-black border-white/20 text-white'
                  }`}
                  title={
                    isMuted
                      ? pickLang(lang, {
                          es: 'Activar sonido de YouTube',
                          ca: 'Activar so de YouTube',
                          en: 'Unmute YouTube',
                        })
                      : pickLang(lang, {
                          es: 'Silenciar YouTube',
                          ca: 'Silenciar YouTube',
                          en: 'Mute YouTube',
                        })
                  }
                >
                  {isMuted ? (
                    <>
                      <RiffanVolumeIcon size={16} muted tone="current" />
                      <span>
                        {pickLang(lang, {
                          es: 'Activar Sonido',
                          ca: 'Activar So',
                          en: 'Unmute',
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <RiffanVolumeIcon size={16} muted={false} className="text-[#00F593]" />
                      <span>
                        {pickLang(lang, {
                          es: 'Sonido Activo',
                          ca: 'So Actiu',
                          en: 'Sound On',
                        })}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* UNIVERSAL WEB EMBED STAGE (INLINE + CONTROLLED EXTERNAL WINDOW)    */}
        {/* ================================================================== */}
        {videoState.mode === 'embed' && videoState.url && (
          <EmbedStagePanel
            lang={lang}
            videoState={videoState}
            isExtracting={isExtracting}
            isMinimized={isMinimized}
            isMobileExternal={isMobileExternal}
            externalWinState={externalWinState}
            externalTargetUrl={externalTargetUrl}
            embedWatchdogPhase={embedWatchdogPhase}
            activeEmbedInlineUrl={activeEmbedInlineUrl}
            activeEmbedDirectUrl={activeEmbedDirectUrl}
            lastAttemptedEmbedUrl={lastAttemptedEmbedUrl}
            embedRescueDismissedUrl={embedRescueDismissedUrl}
            setEmbedRescueDismissedUrl={setEmbedRescueDismissedUrl}
            onPrevEpisode={onPrevEpisode}
            onNextEpisode={onNextEpisode}
            onOpenControlledExternalWindow={openControlledExternalWindow}
            onFocusExternalWindow={handleFocusExternalWindow}
            onCloseExternalWindow={handleCloseExternalWindow}
            onSelectExternalServer={handleSelectExternalServer}
            onMarkInlineServerWorking={handleMarkInlineServerWorking}
            onRetryInlineEmbed={handleRetryInlineEmbed}
            onOpenInCloudBrowser={onOpenInCloudBrowser}
          />
        )}

        {/* ================================================================== */}
        {/* ISOLATED SERVER-SIDE CLOUD BROWSER                                 */}
        {/* ================================================================== */}
        {videoState.mode === 'cloud' && (
          <CloudBrowserOverlay
            lang={lang}
            videoState={videoState}
            cloudFrame={cloudFrame}
            cloudState={cloudState}
            cloudUrlInput={cloudUrlInput}
            setCloudUrlInput={setCloudUrlInput}
            isTvMode={isTvMode}
            isCinemaMode={isCinemaMode}
            onToggleCinemaMode={onToggleCinemaMode}
            onClosePlayer={onClosePlayer}
            onPromoteCloudStreamToNative={onPromoteCloudStreamToNative}
            onCloudWheel={handleCloudWheel}
            onCloudNavigate={handleCloudNavigate}
            onCloudCanvasClick={handleCloudCanvasClick}
          />
        )}

        {/* ================================================================== */}
        {/* BUFFERING / EXTRACTION / ERROR OVERLAYS                            */}
        {/* ================================================================== */}
        {isExtracting && (
          <div className="pointer-events-auto absolute inset-0 z-25 bg-black/72 backdrop-blur-[3px] flex flex-col items-center justify-center p-4 text-center">
            <RiffanLoaderR size={isMinimized ? 36 : 56} className="mb-2" />
            {!isMinimized && (
              <>
                <p className="font-display font-semibold text-xs sm:text-base text-white max-w-md">
                  {extractionLabel || t.extractingTitle}
                </p>
                <p className="text-[11px] sm:text-xs text-zinc-300 mt-1 max-w-sm">
                  {t.extractingSub}
                </p>
              </>
            )}
            {onCancelExtraction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  onCancelExtraction();
                }}
                aria-label={pickLang(lang, {
                  es: 'Cancelar carga',
                  ca: 'Cancel·lar càrrega',
                  en: 'Cancel loading',
                  zh: '取消加载',
                })}
                className={`pointer-events-auto cursor-pointer active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 font-semibold border border-white/20 bg-white/[0.1] hover:bg-white/[0.18] text-white ${
                  isMinimized
                    ? 'mt-1.5 h-7 px-2.5 rounded-lg text-[10px]'
                    : 'mt-3.5 min-h-[38px] px-4 rounded-xl text-xs sm:text-sm'
                }`}
              >
                <RiffanCloseIcon size={14} tone="current" />
                <span>
                  {pickLang(lang, {
                    es: 'Cancelar',
                    ca: 'Cancel·lar',
                    en: 'Cancel',
                    zh: '取消',
                  })}
                </span>
              </button>
            )}
          </div>
        )}

        {!isExtracting &&
          isBuffering &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') && (
            <div className="pointer-events-none absolute top-3 left-3 z-25 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
              <RiffanVideoLoading size={18} />
              {!isMinimized && (
                <span className="text-[10px] font-medium text-zinc-300">
                  {pickLang(lang, {
                    es: 'Cargando buffer...',
                    ca: 'Carregant memòria intermèdia...',
                    en: 'Buffering...',
                  })}
                </span>
              )}
            </div>
          )}

        {streamError && !isExtracting && !isMinimized && (
          <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center p-5 text-center gap-3">
            <RiffanWarningIcon size={34} animate="always" className="text-amber-400" />
            <p className="text-xs sm:text-sm text-zinc-200 max-w-md">{streamError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleForceReloadStream}
                className="min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RiffanRetryIcon size={16} tone="current" />
                <span>
                  {pickLang(lang, {
                    es: 'Reintentar señal',
                    ca: 'Reintentar senyal',
                    en: 'Retry stream',
                  })}
                </span>
              </button>
              {videoState.tracks.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTrack(
                      (videoState.activeTrackIndex + 1) % videoState.tracks.length,
                      currentTime
                    );
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
                >
                  {pickLang(lang, {
                    es: 'Probar siguiente canal',
                    ca: 'Provar el següent canal',
                    en: 'Try next channel',
                  })}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* ZERO-OVERLAP BOTTOM TRANSPORT BAR (3.8s Inactivity Auto-Hide)      */}
        {/* ================================================================== */}
        {!isMinimized && (videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <PlayerTransportBar
            lang={lang}
            mode={videoState.mode}
            isLive={videoState.isLive}
            duration={duration}
            currentTime={currentTime}
            shouldRotate90={shouldRotate90}
            showControls={showControls}
            localPlaying={localPlaying}
            isMuted={isMuted}
            volume={volume}
            hlsAudioTracks={hlsAudioTracks}
            selectedHlsAudioTrack={selectedHlsAudioTrack}
            qualityLevels={qualityLevels}
            selectedQuality={selectedQuality}
            autoActiveHeight={autoActiveHeight}
            activeHudMenu={activeHudMenu}
            setActiveHudMenu={setActiveHudMenu}
            canUseNativePiPOrCast={canUseNativePiPOrCast}
            isInPiP={isInPiP}
            isFullscreen={isFullscreen}
            isHorizontalFullscreen={isHorizontalFullscreen}
            forceLandscapeRotation={forceLandscapeRotation}
            revealControls={revealControls}
            onScrub={handleScrub}
            onTogglePlay={handleTogglePlay}
            onToggleMute={handleToggleMute}
            onVolumeSlider={handleVolumeSlider}
            onSelectHlsAudioTrack={handleSelectHlsAudioTrack}
            onChangeQuality={handleChangeQuality}
            onTogglePiP={handleTogglePiP}
            onToggleLandscapeRotation={handleToggleLandscapeRotation}
            onToggleFullscreen={handleToggleFullscreen}
          />
        )}

        {/* ================================================================== */}
        {/* FLOATING 16:9 DRAGGABLE MINI-PLAYER HUD OVERLAY (WHEN MINIMIZED)   */}
        {/* ================================================================== */}
        {isMinimized && (
          <MiniPlayerHud
            lang={lang}
            title={videoState.title}
            mode={videoState.mode}
            isLive={videoState.isLive}
            duration={duration}
            currentTime={currentTime}
            localPlaying={localPlaying}
            isMuted={isMuted}
            volume={volume}
            canUseNativePiPOrCast={canUseNativePiPOrCast}
            onToggleMinimize={onToggleMinimize}
            onClosePlayer={onClosePlayer}
            onTogglePlay={handleTogglePlay}
            onToggleMute={handleToggleMute}
          />
        )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* UNIFIED BELOW-VIDEO CONTROL STRIP (Single Source of Truth)           */}
      {/* ==================================================================== */}
      {!isTvMode &&
        !isMinimized &&
        !isCompressed &&
        !compactVideoForMobileKeyboard &&
        videoState.mode !== 'idle' &&
        videoState.mode !== 'cloud' && (
          <div className="bg-[#0B0C14]/96 backdrop-blur-2xl border-t border-white/[0.08] px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {/* Row 1 (Left on Desktop): Quick Language Pills (VOD), Unique Multi-Server Switcher, OR Live Signal Pills */}
            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
              {!videoState.isLive && (videoState.tracks || []).length > 0 ? (
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {/* "Idioma:" Selector with authentic SVG flags */}
                  {(() => {
                    const availableTrackLangs = Array.from(
                      new Set(
                        (videoState.tracks || [])
                          .map((tr) =>
                            resolveTrackLang(tr, {
                              subtitle: videoState.subtitle,
                              title: videoState.title,
                            })
                          )
                          .filter((c) => ['ES', 'CAT', 'LAT', 'VOSE', 'EN'].includes(c))
                      )
                    );
                    if (availableTrackLangs.length === 0) return null;
                    return (
                      <MediaLanguageSelector
                        labelPrefix={pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Language:' })}
                        selectedLang={activeTrackLangCode || availableTrackLangs[0]}
                        availableLangs={availableTrackLangs}
                        onSelectLang={(code) => {
                          handleQuickLanguageSwitch(code as any);
                        }}
                        size="sm"
                      />
                    );
                  })()}

                  {/* Multi-server / mirror switcher for active language */}
                  {(() => {
                    const sameLangTracks = (videoState.tracks || [])
                      .map((tr, idx) => ({ tr, idx }))
                      .filter(
                        ({ tr }) =>
                          resolveTrackLang(tr, {
                            subtitle: videoState.subtitle,
                            title: videoState.title,
                          }) === activeTrackLangCode
                      );
                    if (sameLangTracks.length <= 1 && videoState.mode !== 'embed') return null;
                    return (
                      <div className="flex items-center gap-1 bg-[#121420] p-1 rounded-2xl border border-white/[0.08] shrink-0">
                        {sameLangTracks.length > 1 &&
                          sameLangTracks.map(({ tr, idx }, srvIdx) => {
                            const active = idx === videoState.activeTrackIndex;
                            return (
                              <button
                                key={tr.id || idx}
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  if (externalWinState === 'open') {
                                    handleSelectExternalServer(idx);
                                  } else {
                                    onSelectTrack(idx, currentTime);
                                  }
                                }}
                                title={tr.label}
                                className={`min-h-[34px] px-2.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                                  active
                                    ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                                    : 'text-zinc-300 hover:bg-white/10'
                                }`}
                              >
                                {pickLang(lang, { es: 'Servidor', ca: 'Servidor', en: 'Server' })} {srvIdx + 1}
                              </button>
                            );
                          })}
                        {videoState.mode === 'embed' && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('medium');
                              openControlledExternalWindow();
                            }}
                            title={
                              isMobileExternal
                                ? 'Reproducir en pestaña externa controlada'
                                : 'Reproducir en ventana externa controlada'
                            }
                            className="min-h-[34px] px-2.5 rounded-xl text-xs font-bold bg-[#9146FF]/20 hover:bg-[#9146FF]/35 text-[#D8B4FE] border border-[#9146FF]/45 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                          >
                            <RiffanPlayIcon size={12} tone="current" />
                            <span>{pickLang(lang, { es: 'Ventana', ca: 'Finestra', en: 'Window' })}</span>
                          </button>
                        )}
                        {videoState.mode === 'embed' && onOpenInCloudBrowser && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('medium');
                              onOpenInCloudBrowser(
                                videoState.tracks[videoState.activeTrackIndex]?.sourceUrl ||
                                  videoState.url
                              );
                            }}
                            title={pickLang(lang, {
                              es: 'Abrir en Cloud Browser aislado sin ventanas emergentes',
                              ca: 'Obrir en Cloud Browser aïllat sense finestres emergents',
                              en: 'Open in isolated ad-free Cloud Browser',
                            })}
                            className="min-h-[34px] px-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                          >
                            <Globe className="w-3.5 h-3.5 shrink-0" />
                            <span>Cloud HD</span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : videoState.isLive && videoState.tracks.length > 1 ? (
                <div className="flex items-center gap-1 bg-[#121420] p-1 rounded-2xl border border-white/[0.08] shrink-0">
                  {videoState.tracks.slice(0, 5).map((tr, idx) => {
                    const active = idx === videoState.activeTrackIndex;
                    const hasZh = String(tr.lang || '').toUpperCase() === 'ZH' || /中文/.test(tr.label || '');
                    const signalText = `${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} ${idx + 1}`;
                    return (
                      <button
                        key={tr.id || idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectTrack(idx, 0);
                        }}
                        className={`min-h-[36px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer active:scale-95 transition-all inline-flex items-center gap-1.5 ${
                          active
                            ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                            : 'text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {hasZh && (
                          <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-bold">
                            中文
                          </span>
                        )}
                        <span>{signalText}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <RiffanLiveIcon
                    size={15}
                    animate={videoState.isLive ? 'always' : 'hover'}
                    className={videoState.isLive ? 'text-[#EB0400]' : ''}
                  />
                  <span className="truncate max-w-[180px]">
                    {videoState.tracks[videoState.activeTrackIndex]?.label ||
                      (videoState.isLive
                        ? pickLang(lang, { es: 'Señal en directo', ca: 'Senyal en directe', en: 'Live feed' })
                        : pickLang(lang, { es: 'Proyección activa', ca: 'Projecció activa', en: 'Now playing' }))}
                  </span>
                  {videoState.mode === 'embed' && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        openControlledExternalWindow();
                      }}
                      className="min-h-[32px] px-2.5 rounded-xl text-xs font-bold bg-[#9146FF]/20 hover:bg-[#9146FF]/35 text-[#D8B4FE] border border-[#9146FF]/45 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RiffanPlayIcon size={12} tone="current" />
                      <span>{pickLang(lang, { es: 'Ventana', ca: 'Finestra', en: 'Window' })}</span>
                    </button>
                  )}
                  {videoState.mode === 'embed' && onOpenInCloudBrowser && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onOpenInCloudBrowser(videoState.url);
                      }}
                      className="min-h-[32px] px-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span>Cloud HD</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Row 2 (Right on Desktop): Sala · X + Solo Mando + Cast TV + Voz + Ajustes */}
            <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
              {onToggleFloatingChat && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onToggleFloatingChat();
                  }}
                  aria-pressed={floatingChatOpen}
                  className={`relative min-h-[38px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                    floatingChatOpen
                      ? 'bg-[#9146FF] text-white border-[#BF94FF]/60 shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                      : 'bg-[#121420] hover:bg-white/[0.1] text-zinc-100 border-white/[0.1]'
                  }`}
                >
                  <RiffanChatIcon size={15} tone={floatingChatOpen ? 'current' : 'brand'} />
                  <span className="tabular-nums">Sala · {Math.max(1, participantCount)}</span>
                  {unreadChatCount > 0 && !floatingChatOpen && (
                    <span className="w-2 h-2 rounded-full bg-[#EB0400] shrink-0" aria-hidden="true" />
                  )}
                </button>
              )}

              {hasConnectedSmartTv && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setBatterySaverTvMode((v) => !v);
                  }}
                  title={pickLang(lang, {
                    es: 'Pausar vídeo en el móvil y usarlo solo como mando de la TV',
                    ca: 'Pausar vídeo al mòbil i usar-lo només com a comandament de la TV',
                    en: 'Pause phone video and use as TV remote only',
                  })}
                  className={`min-h-[38px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                    batterySaverTvMode
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                      : 'bg-[#26262C] hover:bg-white/[0.12] text-zinc-300 border-white/[0.09]'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {batterySaverTvMode
                      ? pickLang(lang, { es: 'Solo Mando ✓', ca: 'Només Comandament ✓', en: 'Remote Only ✓' })
                      : pickLang(lang, { es: 'Solo Mando', ca: 'Només Comandament', en: 'Remote Only' })}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDirectCastToTv}
                className={`min-h-[38px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                  isCastingToTv || hasConnectedSmartTv
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                    : 'bg-[#9146FF]/15 hover:bg-[#9146FF]/25 text-[#BF94FF] border-[#9146FF]/40'
                }`}
                title={pickLang(lang, {
                  es: 'Enviar vídeo directamente a tu TV (Chromecast / AirPlay 2 / Smart TV)',
                  ca: 'Enviar vídeo directament a la teva TV (Chromecast / AirPlay 2 / Smart TV)',
                  en: 'Cast video directly to your TV (Chromecast / AirPlay 2 / Smart TV)',
                })}
              >
                <RiffanCastIcon size={15} tone="current" />
                <span>
                  {isCastingToTv
                    ? pickLang(lang, { es: 'Transmitiendo', ca: 'Transmetent', en: 'Casting' })
                    : 'Cast TV'}
                </span>
              </button>

              {voiceChat && (
                voiceChat.isJoined ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-pressed={voiceChat.isMuted}
                      onClick={() => {
                        triggerHaptic('light');
                        voiceChat.toggleMute();
                      }}
                      className={`min-h-[38px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                        voiceChat.isMuted
                          ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/50 text-rose-200'
                          : voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0
                          ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-300 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.28)]'
                          : 'bg-emerald-500/18 hover:bg-emerald-500/28 border-emerald-400/45 text-emerald-200'
                      }`}
                    >
                      {voiceChat.isMuted ? (
                        <>
                          <MicOff className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {pickLang(lang, { es: 'Silenciado', ca: 'Silenciat', en: 'Muted' })}
                          </span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5 shrink-0" />
                          <VoiceWaveBars
                            active={!voiceChat.isMuted && (voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0)}
                            level={voiceChat.localAudioLevel}
                            size="sm"
                          />
                          <span>
                            {voiceChat.localAudioLevel > 0.08
                              ? pickLang(lang, { es: 'Hablando', ca: 'Parlant', en: 'Speaking' })
                              : pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
                          </span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        voiceChat.leaveVoice();
                      }}
                      title={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
                      aria-label={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
                      className="min-h-[38px] px-2.5 rounded-2xl bg-[#26262C] hover:bg-rose-500/25 border border-white/[0.09] hover:border-rose-400/50 text-xs font-bold text-zinc-200 hover:text-rose-200 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                    >
                      <PhoneOff className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={voiceChat.status === 'requesting'}
                    onClick={() => {
                      triggerHaptic('medium');
                      void voiceChat.joinVoice();
                    }}
                    className="min-h-[38px] px-3.5 rounded-2xl bg-[#9146FF]/18 hover:bg-[#9146FF]/30 border border-[#9146FF]/45 text-xs font-bold text-[#DFCCFF] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                    title={pickLang(lang, {
                      es: 'Abrir llamada de voz mientras ves la película',
                      ca: 'Obrir trucada de veu mentre veus la pel·lícula',
                      en: 'Open live voice call while watching',
                    })}
                  >
                    {voiceChat.status === 'requesting' ? (
                      <RiffanSpinner size={14} tone="current" />
                    ) : (
                      <RiffanVoiceCallIcon size={15} tone="current" />
                    )}
                    <span>
                      {voiceChat.status === 'requesting'
                        ? pickLang(lang, { es: 'Conectando...', ca: 'Connectant...', en: 'Connecting...' })
                        : pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
                    </span>
                    {voiceChat.voicePeers.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-200 text-[10px] font-mono tabular-nums">
                        {voiceChat.voicePeers.length}
                      </span>
                    )}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setShowProMenu(true);
                }}
                className="min-h-[38px] px-3.5 rounded-2xl bg-[#26262C] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
              >
                <RiffanSlidersIcon size={15} tone="current" />
                <span>{pickLang(lang, { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' })}</span>
              </button>
            </div>
          </div>
        )}

      {/* Voice Chat Unlock / Mic Error Strip while watching movies */}
      {!isTvMode &&
        !isMinimized &&
        !isCompressed &&
        voiceChat &&
        (voiceChat.audioPlaybackBlocked && voiceChat.isJoined ? (
          <div className="bg-[#161224] border-t border-[#9146FF]/35 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs text-[#DFCCFF]">
            <div className="flex items-center gap-1.5 min-w-0">
              <RiffanVolumeIcon size={15} />
              <span className="truncate">
                {pickLang(lang, {
                  es: 'Toca para escuchar la llamada de voz en este dispositivo.',
                  ca: 'Toca per escoltar la trucada de veu en aquest dispositiu.',
                  en: 'Tap to enable incoming voice call audio on this device.',
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                voiceChat.resumeRemoteAudio();
              }}
              className="px-3 py-1 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-[11px] font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pickLang(lang, { es: 'Activar audio', ca: 'Activar àudio', en: 'Enable Audio' })}
            </button>
          </div>
        ) : voiceChat.errorMessage ? (
          <div className="bg-amber-500/10 border-t border-amber-400/35 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs text-amber-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <RiffanWarningIcon size={15} animate="always" className="text-amber-300" />
              <span className="truncate">{voiceChat.errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => void voiceChat.joinVoice()}
              className="px-3 py-1 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-[11px] font-bold text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
            </button>
          </div>
        ) : null)}

      {/* ==================================================================== */}
      {/* AJUSTES DE REPRODUCCIÓN (UNIFIED BOTTOM SHEET — NO DUPLICATE CAST)   */}
      {/* ==================================================================== */}
      <PlayerProSettingsModal
        isOpen={showProMenu}
        onClose={() => setShowProMenu(false)}
        proMenuRef={proMenuRef}
        lang={lang}
        videoState={videoState}
        currentTime={currentTime}
        isCinemaMode={isCinemaMode}
        onToggleCinemaMode={onToggleCinemaMode}
        canUseNativePiPOrCast={canUseNativePiPOrCast}
        isInPiP={isInPiP}
        onTogglePiP={handleTogglePiP}
        hlsAudioTracks={hlsAudioTracks}
        selectedHlsAudioTrack={selectedHlsAudioTrack}
        onSelectHlsAudioTrack={handleSelectHlsAudioTrack}
        activeTrackLangCode={activeTrackLangCode}
        onQuickLanguageSwitch={handleQuickLanguageSwitch}
        onTriggerLanguagePopup={triggerLocalLanguagePopup}
        onSelectTrack={onSelectTrack}
        subtitleFileInputRef={subtitleFileInputRef}
        activeSubId={activeSubId}
        onSelectSubtitleTrack={handleSelectSubtitleTrack}
        subtitleTracks={subtitleTracks}
        subtitleOffsetSec={subtitleOffsetSec}
        setSubtitleOffsetSec={setSubtitleOffsetSec}
        subtitleSize={subtitleSize}
        setSubtitleSize={setSubtitleSize}
        subtitleStyle={subtitleStyle}
        setSubtitleStyle={setSubtitleStyle}
        syncOffsetMs={syncOffsetMs}
        setSyncOffsetMs={setSyncOffsetMs}
        vocalBoostEnabled={vocalBoostEnabled}
        onToggleVocalBoost={toggleVocalBoost}
        ambilightEnabled={ambilightEnabled}
        setAmbilightEnabled={setAmbilightEnabled}
        playbackSpeed={playbackSpeed}
        onSelectSpeed={handleSelectSpeed}
        qualityLevels={qualityLevels}
        selectedQuality={selectedQuality}
        autoActiveHeight={autoActiveHeight}
        onChangeQuality={handleChangeQuality}
      />
    </section>
  );
};
