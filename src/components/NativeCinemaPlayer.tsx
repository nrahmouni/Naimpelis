import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Minimize2,
  Maximize2,
  X,
  Cast,
  RotateCcw,
  RotateCw,
  RefreshCw,
  Tv,
  Film,
  Trophy,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Radio,
  SkipForward,
  SkipBack,
  Youtube,
  Moon,
  Sun,
  SlidersHorizontal,
  Check,
  MessageSquare,
  Users,
  Share2,
  UserPlus,
  Send,
  Globe,
  AudioLines,
  Settings2,
  ExternalLink,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
} from 'lucide-react';
import {
  ChatMessage,
  LanguageNoticePopup,
  SubtitleTrackItem,
  VideoState,
} from '../types';
import { UI_COPY, pickLang } from '../utils/i18n';
import { socketService } from '../services/socket';
import { triggerHaptic } from '../utils/haptics';
import {
  findActiveSubtitleText,
  ParsedSubtitleCue,
  parseSubtitleText,
} from '../utils/subtitles';
import { SecondaryHlsStage } from './SecondaryHlsStage';
import { useAppStore } from '../store/useAppStore';
import { useFocusTrap } from '../utils/useFocusTrap';
import {
  formatTimecode,
  type NativeCinemaPlayerProps,
  type ScreenOrientationWithLock,
  type WakeLockSentinelLike,
  type WebKitVideoElement,
  type YouTubePlayerEvent,
  type YouTubePlayerInstance,
} from './player/playerTypes';
import { useDirectCast } from './player/useDirectCast';
import { CloudBrowserOverlay } from './player/CloudBrowserOverlay';
import { PlayerProSettingsModal } from './player/PlayerProSettingsModal';
import { VoiceWaveBars } from './games/GameVoiceBar';
import {
  getEmbedServerStatus,
  isMobileExternalTabContext,
  setEmbedServerStatus,
  unwrapEmbedUrl,
} from './player/embedWindowUtils';

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
  compactVideoForMobileKeyboard = false,
  onOpenInCloudBrowser,
  voiceChat,
  savedFriends = [],
  onlineUsers = [],
  onOpenFriendsModal,
  onSendDirectRoomInvite,
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

  // Controlled External Window ('cineplayer') + Inline Embed Watchdog State
  const externalWinRef = useRef<Window | null>(null);
  const lastNavigatedExternalUrlRef = useRef<string>('');
  const triedEmbedIndicesRef = useRef<Set<number>>(new Set());
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttemptedEmbedUrlRef = useRef<string>('');
  const latestSelectTrackRef = useRef(onSelectTrack);
  latestSelectTrackRef.current = onSelectTrack;
  const latestCurrentTimeRef = useRef<number>(0);

  const [externalWinState, setExternalWinState] = useState<
    'idle' | 'open' | 'closed' | 'blocked'
  >('idle');
  const [externalTargetUrl, setExternalTargetUrl] = useState<string>('');
  const [embedWatchdogPhase, setEmbedWatchdogPhase] = useState<
    'watching' | 'verified' | 'window_preferred' | 'exhausted'
  >('watching');
  const [inlineRetryUrl, setInlineRetryUrl] = useState<string>('');
  const [inlineRetryNonce, setInlineRetryNonce] = useState<number>(0);

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
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
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
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrackItem[]>([]);
  const [activeSubId, setActiveSubId] = useState<string>('off');
  const [parsedCues, setParsedCues] = useState<ParsedSubtitleCue[]>([]);
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number>(0);
  const [subtitleSize, setSubtitleSize] = useState<'sm' | 'md' | 'lg'>('md');
  const subtitleFileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-Next Episode Countdown State
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [autoNextCancelledForUrl, setAutoNextCancelledForUrl] = useState<string>('');
  const autoNextTriggeredUrlRef = useRef<string>('');

  // Web Audio API Nodes Ref (created once per <video> element)
  const audioGraphRef = useRef<{
    ctx: AudioContext;
    source: MediaElementAudioSourceNode;
    speechFilter: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    makeupGain: GainNode;
  } | null>(null);

  const showTransientToast = useCallback((msg: string) => {
    setPlayerToast(msg);
    setTimeout(() => {
      setPlayerToast((cur) => (cur === msg ? null : cur));
    }, 3400);
  }, []);

  latestCurrentTimeRef.current = currentTime;

  const activeEmbedInlineUrl =
    videoState.mode === 'embed'
      ? videoState.tracks[videoState.activeTrackIndex]?.resolvedStreamUrl ||
        videoState.tracks[videoState.activeTrackIndex]?.sourceUrl ||
        videoState.url ||
        ''
      : '';
  const rawActiveEmbedUrl =
    videoState.mode === 'embed'
      ? videoState.tracks[videoState.activeTrackIndex]?.sourceUrl ||
        videoState.tracks[videoState.activeTrackIndex]?.resolvedStreamUrl ||
        videoState.url ||
        ''
      : '';
  const activeEmbedDirectUrl =
    videoState.mode === 'embed'
      ? unwrapEmbedUrl(rawActiveEmbedUrl || videoState.url)
      : '';
  const isMobileExternal = isMobileExternalTabContext();
  const embedMediaIdentityKey =
    videoState.mode === 'embed'
      ? `${videoState.rawSourceUrl || ''}::${videoState.seriesMeta?.season || ''}::${videoState.seriesMeta?.episode || ''}`
      : '';

  // Reset tried-track chain whenever movie or series episode changes
  useEffect(() => {
    if (!embedMediaIdentityKey) return;
    triedEmbedIndicesRef.current = new Set([videoState.activeTrackIndex]);
    setInlineRetryUrl('');
  }, [embedMediaIdentityKey]);

  // Poll `ref.closed` every 1s while controlled external window is open
  useEffect(() => {
    if (externalWinState !== 'open') return;
    const pollId = window.setInterval(() => {
      const w = externalWinRef.current;
      if (!w || w.closed) {
        externalWinRef.current = null;
        setExternalWinState('closed');
      }
    }, 1000);
    return () => {
      window.clearInterval(pollId);
    };
  }, [externalWinState]);

  // If external window is already open and episode/season/server changes, navigate that SAME window
  useEffect(() => {
    if (videoState.mode !== 'embed' || !activeEmbedDirectUrl) return;
    if (externalWinState !== 'open') return;
    const w = externalWinRef.current;
    if (!w || w.closed) {
      externalWinRef.current = null;
      setExternalWinState('closed');
      return;
    }
    if (lastNavigatedExternalUrlRef.current !== activeEmbedDirectUrl) {
      lastNavigatedExternalUrlRef.current = activeEmbedDirectUrl;
      setExternalTargetUrl(activeEmbedDirectUrl);
      try {
        w.location.href = activeEmbedDirectUrl;
      } catch {
        // ignore cross-origin restrictions if browser blocks location write
      }
    }
  }, [videoState.mode, activeEmbedDirectUrl, externalWinState]);

  // Inline Embed Watchdog (17s) + localStorage per-server preference
  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (
      videoState.mode !== 'embed' ||
      !activeEmbedDirectUrl ||
      isExtracting ||
      externalWinState === 'open'
    ) {
      return;
    }

    triedEmbedIndicesRef.current.add(videoState.activeTrackIndex);
    lastAttemptedEmbedUrlRef.current = activeEmbedDirectUrl;

    const savedStatus = getEmbedServerStatus(activeEmbedDirectUrl);
    if (savedStatus === 'inline_ok') {
      setEmbedWatchdogPhase('verified');
      return;
    }
    if (savedStatus === 'window_required' && inlineRetryUrl !== activeEmbedDirectUrl) {
      setEmbedWatchdogPhase('window_preferred');
      return;
    }

    setEmbedWatchdogPhase('watching');
    const snapshotUrl = activeEmbedDirectUrl;
    const snapshotIdx = videoState.activeTrackIndex;

    watchdogTimerRef.current = setTimeout(() => {
      watchdogTimerRef.current = null;
      setEmbedServerStatus(snapshotUrl, 'window_required');

      const webIndices = videoState.tracks
        .map((tr, i) => ({ tr, i }))
        .filter(({ tr, i }) => i !== snapshotIdx && tr.resolverType === 'web_embed')
        .map(({ i }) => i);

      const nextUntriedIdx = webIndices.find(
        (i) => !triedEmbedIndicesRef.current.has(i)
      );

      if (nextUntriedIdx !== undefined) {
        triedEmbedIndicesRef.current.add(nextUntriedIdx);
        latestSelectTrackRef.current(nextUntriedIdx, latestCurrentTimeRef.current);
      } else {
        lastAttemptedEmbedUrlRef.current = snapshotUrl;
        setEmbedWatchdogPhase('exhausted');
      }
    }, 17_000);

    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [
    videoState.mode,
    videoState.activeTrackIndex,
    videoState.tracks,
    activeEmbedDirectUrl,
    isExtracting,
    externalWinState,
    inlineRetryUrl,
    inlineRetryNonce,
  ]);

  // Listen for iframe playback / VidFast ready status postMessage to immediately verify inline playback
  useEffect(() => {
    if (videoState.mode !== 'embed' || !activeEmbedDirectUrl) return;
    const onMessage = (ev: MessageEvent) => {
      const d = ev?.data;
      if (!d || typeof d !== 'object') return;
      const isProxyReady =
        d.source === 'naim-embed-proxy' &&
        (d.event === 'playing' || d.event === 'loadeddata');
      const isVidfastReady = d.event === 'status' && Number(d.data) === 200;
      const isGenericPlayerReady =
        d.type === 'PLAYER_EVENT' ||
        (d.event === 'ready' && Boolean(d.data));
      if (isProxyReady || isVidfastReady || isGenericPlayerReady) {
        setEmbedServerStatus(activeEmbedDirectUrl, 'inline_ok');
        setEmbedWatchdogPhase('verified');
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [videoState.mode, activeEmbedDirectUrl]);

  // Ensure timers are cleared on unmount without force-closing user's external window
  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, []);

  const openControlledExternalWindow = useCallback(
    (urlOverride?: string) => {
      const targetUrl = unwrapEmbedUrl(
        urlOverride ||
          externalTargetUrl ||
          lastAttemptedEmbedUrlRef.current ||
          activeEmbedDirectUrl
      );
      if (!targetUrl) return;
      setExternalTargetUrl(targetUrl);

      if (externalWinRef.current && !externalWinRef.current.closed) {
        lastNavigatedExternalUrlRef.current = targetUrl;
        try {
          externalWinRef.current.location.href = targetUrl;
          externalWinRef.current.focus();
        } catch {
          // ignore
        }
        setExternalWinState('open');
        return;
      }

      const features = isMobileExternal
        ? undefined
        : 'width=1280,height=720,menubar=no,toolbar=no';
      let opened: Window | null = null;
      try {
        opened = window.open(targetUrl, 'cineplayer', features);
      } catch {
        opened = null;
      }

      if (!opened) {
        setExternalWinState('blocked');
        showTransientToast('Permite ventanas emergentes para este sitio');
        return;
      }

      externalWinRef.current = opened;
      lastNavigatedExternalUrlRef.current = targetUrl;
      setExternalWinState('open');
      try {
        opened.focus();
      } catch {
        // ignore
      }
    },
    [
      externalTargetUrl,
      activeEmbedDirectUrl,
      isMobileExternal,
      showTransientToast,
    ]
  );

  const handleFocusExternalWindow = useCallback(() => {
    const w = externalWinRef.current;
    if (!w || w.closed) {
      externalWinRef.current = null;
      setExternalWinState('closed');
      return;
    }
    try {
      w.focus();
    } catch {
      // ignore
    }
  }, []);

  const handleCloseExternalWindow = useCallback(() => {
    const w = externalWinRef.current;
    externalWinRef.current = null;
    try {
      w?.close();
    } catch {
      // ignore
    }
    setExternalWinState('idle');
  }, []);

  const handleSelectExternalServer = useCallback(
    (trackIdx: number) => {
      const track = videoState.tracks[trackIdx];
      if (!track) return;
      const targetUrl = unwrapEmbedUrl(track.sourceUrl || track.resolvedStreamUrl || '');
      if (targetUrl && externalWinRef.current && !externalWinRef.current.closed) {
        lastNavigatedExternalUrlRef.current = targetUrl;
        setExternalTargetUrl(targetUrl);
        try {
          externalWinRef.current.location.href = targetUrl;
        } catch {
          // ignore
        }
      }
      onSelectTrack(trackIdx, currentTime);
    },
    [videoState.tracks, onSelectTrack, currentTime]
  );

  const handleMarkInlineServerWorking = useCallback(() => {
    if (!activeEmbedDirectUrl) return;
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    setEmbedServerStatus(activeEmbedDirectUrl, 'inline_ok');
    setEmbedWatchdogPhase('verified');
    showTransientToast('Servidor guardado como funcional');
  }, [activeEmbedDirectUrl, showTransientToast]);

  const handleRetryInlineEmbed = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    setExternalWinState('idle');
    setInlineRetryUrl(activeEmbedDirectUrl);
    setInlineRetryNonce((n) => n + 1);
    setEmbedWatchdogPhase('watching');
  }, [activeEmbedDirectUrl]);

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

  // Listen for Mobile Remote Control commands when running as a Smart TV Receiver
  useEffect(() => {
    if (!isTvMode) return;
    const unsub = socketService.subscribe((event) => {
      if (event.type !== 'TV_REMOTE_COMMAND') return;
      const cmd = event.payload?.command;
      if (cmd === 'vol_up' || cmd === 'vol_down') {
        setVolume((prev) => {
          const delta = cmd === 'vol_up' ? 0.15 : -0.15;
          const nextVol = Math.max(0, Math.min(1, Number((prev + delta).toFixed(2))));
          if (videoRef.current) {
            videoRef.current.volume = nextVol;
            if (nextVol > 0) videoRef.current.muted = false;
          }
          try {
            if (ytPlayerRef.current?.setVolume) {
              ytPlayerRef.current.setVolume(Math.round(nextVol * 100));
              if (nextVol > 0 && ytPlayerRef.current?.unMute) {
                ytPlayerRef.current.unMute();
              }
            }
          } catch {
            // ignore
          }
          if (nextVol > 0) setIsMuted(false);
          showTransientToast(`🔊 Volumen TV · ${Math.round(nextVol * 100)}%`);
          return nextVol;
        });
      } else if (cmd === 'toggle_mute') {
        setIsMuted((prev) => {
          const nextMuted = !prev;
          if (videoRef.current) {
            videoRef.current.muted = nextMuted;
          }
          try {
            if (nextMuted) ytPlayerRef.current?.mute?.();
            else ytPlayerRef.current?.unMute?.();
          } catch {
            // ignore
          }
          showTransientToast(
            nextMuted ? '🔇 Televisor silenciado' : '🔊 Sonido TV activado'
          );
          return nextMuted;
        });
      } else if (cmd === 'toggle_fullscreen') {
        const container = stageWrapperRef.current || document.documentElement;
        const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          showTransientToast('Saliendo de pantalla completa');
        } else if (container?.requestFullscreen) {
          container
            .requestFullscreen()
            .then(() => showTransientToast('✓ Pantalla Completa activada'))
            .catch(() => {
              if (video?.webkitEnterFullscreen) {
                try {
                  video.webkitEnterFullscreen();
                  return;
                } catch {
                  // ignore
                }
              }
              showTransientToast('Pulsa Pantalla Completa en la TV para ocultar la barra');
            });
        }
      } else if (cmd === 'toggle_aspect') {
        setTvAspectMode((prev) => {
          const next = prev === 'contain' ? 'cover' : prev === 'cover' ? 'fill' : 'contain';
          showTransientToast(
            next === 'cover'
              ? 'Formato TV · Pantalla Rellena sin bordes negros'
              : next === 'fill'
              ? 'Formato TV · Estirado 16:9 completo'
              : 'Formato TV · Original sin recorte'
          );
          return next;
        });
      } else if (cmd === 'toggle_hud') {
        setShowControls((prev) => !prev);
      } else if (cmd === 'reload_tv') {
        if (hlsRef.current) hlsRef.current.startLoad();
        else if (videoRef.current && videoState.url) {
          videoRef.current.load();
          videoRef.current.play().catch(() => {});
        }
        showTransientToast('Resincronizando señal HD en TV...');
      } else if (cmd === 'toggle_ambilight') {
        setAmbilightEnabled((prev) => {
          const next = !prev;
          showTransientToast(
            next ? '✨ Ambilight TV activado' : 'Ambilight TV desactivado'
          );
          return next;
        });
      } else if (cmd === 'cycle_subtitles') {
        const subOptions = ['off', ...subtitleTracks.map((s) => s.id)];
        if (subOptions.length <= 1) {
          showTransientToast('💬 No hay subtítulos adicionales en este título');
        } else {
          const curIdx = Math.max(0, subOptions.indexOf(activeSubId));
          const nextSubId = subOptions[(curIdx + 1) % subOptions.length];
          handleSelectSubtitleTrack(nextSubId);
          const nextLabel =
            nextSubId === 'off'
              ? 'Desactivados'
              : subtitleTracks.find((s) => s.id === nextSubId)?.label || 'Activados';
          showTransientToast(`💬 Subtítulos TV: ${nextLabel}`);
        }
      } else if (cmd === 'cycle_audio') {
        if (videoState.tracks && videoState.tracks.length > 1) {
          const nextIdx = (videoState.activeTrackIndex + 1) % videoState.tracks.length;
          const nextTrack = videoState.tracks[nextIdx];
          onSelectTrack(nextIdx, videoRef.current?.currentTime || currentTime || 0);
          showTransientToast(`🔊 Audio TV: ${nextTrack?.label || `Pista ${nextIdx + 1}`}`);
        } else {
          showTransientToast('🔊 Audio original único en esta señal');
        }
      } else if (cmd === 'disconnect_tv') {
        onExitTvMode?.();
      }
    });
    return () => unsub();
  }, [
    isTvMode,
    onExitTvMode,
    showTransientToast,
    videoState.url,
    videoState.tracks,
    videoState.activeTrackIndex,
    subtitleTracks,
    activeSubId,
    currentTime,
    onSelectTrack,
  ]);

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

  // ============================================================================
  // CINEMA PRO 1: REAL-TIME AMBILIGHT HALO SAMPLER (ZERO REACT RE-RENDERS)
  // ============================================================================
  useEffect(() => {
    const stageEl = stageWrapperRef.current;
    if (!stageEl) return;

    const shouldGlow =
      ambilightEnabled &&
      !isMinimized &&
      !isTvMode &&
      localPlaying &&
      (videoState.mode === 'hls' || videoState.mode === 'direct');

    if (!shouldGlow) {
      stageEl.style.boxShadow = '';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const sampleFrame = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.readyState < 2 || !stageWrapperRef.current) return;
      try {
        ctx.drawImage(video, 0, 0, 12, 8);
        const data = ctx.getImageData(0, 0, 12, 8).data;
        let rL = 0, gL = 0, bL = 0, nL = 0;
        let rR = 0, gR = 0, bR = 0, nR = 0;
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 12; x++) {
            const idx = (y * 12 + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (x < 6) {
              rL += r; gL += g; bL += b; nL++;
            } else {
              rR += r; gR += g; bR += b; nR++;
            }
          }
        }
        const boost = (v: number) => Math.min(255, Math.max(24, Math.round(v * 1.22)));
        const leftRgb = `${boost(rL / nL)}, ${boost(gL / nL)}, ${boost(bL / nL)}`;
        const rightRgb = `${boost(rR / nR)}, ${boost(gR / nR)}, ${boost(bR / nR)}`;
        const alpha = isCinemaMode ? 0.62 : 0.42;
        stageWrapperRef.current.style.boxShadow = `-28px 0 85px -10px rgba(${leftRgb}, ${alpha}), 28px 0 85px -10px rgba(${rightRgb}, ${alpha}), 0 18px 95px -12px rgba(${leftRgb}, ${alpha * 0.8})`;
      } catch {
        // ignore if frame unavailable
      }
    };

    sampleFrame();
    const timer = setInterval(sampleFrame, 240);
    return () => {
      clearInterval(timer);
      if (stageWrapperRef.current) {
        stageWrapperRef.current.style.boxShadow = '';
      }
    };
  }, [ambilightEnabled, isMinimized, isTvMode, localPlaying, videoState.mode, isCinemaMode]);

  // ============================================================================
  // CINEMA PRO 2: WEB AUDIO VOCAL BOOST / NIGHT COMPRESSOR
  // ============================================================================
  const toggleVocalBoost = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !vocalBoostEnabled;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioGraphRef.current) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(video);
        const speechFilter = ctx.createBiquadFilter();
        speechFilter.type = 'peaking';
        speechFilter.frequency.value = 2400;
        speechFilter.Q.value = 1.0;
        speechFilter.gain.value = 4.5;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -28;
        compressor.knee.value = 24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.22;

        const makeupGain = ctx.createGain();
        makeupGain.gain.value = 1.45;

        audioGraphRef.current = { ctx, source, speechFilter, compressor, makeupGain };
      }

      const g = audioGraphRef.current;
      if (g.ctx.state === 'suspended') {
        g.ctx.resume().catch(() => {});
      }
      g.source.disconnect();
      g.speechFilter.disconnect();
      g.compressor.disconnect();
      g.makeupGain.disconnect();

      if (next) {
        g.source.connect(g.speechFilter);
        g.speechFilter.connect(g.compressor);
        g.compressor.connect(g.makeupGain);
        g.makeupGain.connect(g.ctx.destination);
      } else {
        g.source.connect(g.ctx.destination);
      }

      setVocalBoostEnabled(next);
      try {
        localStorage.setItem('naim_vocal_boost_v1', String(next));
      } catch {
        // ignore
      }
      showTransientToast(
        next
          ? pickLang(lang, {
              es: 'Realce de Voces y Modo Noche activado',
              ca: 'Realç de Veus i Mode Nit activat',
              en: 'Vocal Boost & Night Mode enabled',
            })
          : pickLang(lang, {
              es: 'Audio original restaurado',
              ca: 'Àudio original restaurat',
              en: 'Original audio restored',
            })
      );
    } catch {
      setVocalBoostEnabled(false);
      try {
        localStorage.setItem('naim_vocal_boost_v1', 'false');
      } catch {
        // ignore
      }
    }
  }, [vocalBoostEnabled, lang, showTransientToast]);

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
  // CINEMA PRO 3: AUTOMATIC CLOUD SUBTITLES + .SRT / .VTT UPLOAD
  // ============================================================================
  useEffect(() => {
    setActiveSubId('off');
    setParsedCues([]);
    setSubtitleOffsetSec(0);
    setShowProMenu(false);
    setActiveHudMenu(null);

    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') {
      setSubtitleTracks([]);
      return;
    }

    const builtInSubs: SubtitleTrackItem[] = Array.isArray(videoState.subtitles)
      ? videoState.subtitles
      : [];

    let detectedTmdbId = videoState.seriesMeta?.tmdbId;
    if (!detectedTmdbId && videoState.rawSourceUrl) {
      const m = videoState.rawSourceUrl.match(/(?:watch|movie|-)\/?(\d{2,9})(?:$|\/)/i);
      if (m) detectedTmdbId = Number(m[1]);
    }
    if (!detectedTmdbId) {
      setSubtitleTracks(builtInSubs);
      return;
    }

    setSubtitleTracks(builtInSubs);
    let cancelled = false;
    const qs = new URLSearchParams({ tmdbId: String(detectedTmdbId) });
    if (videoState.seriesMeta?.season && videoState.seriesMeta?.episode) {
      qs.set('season', String(videoState.seriesMeta.season));
      qs.set('episode', String(videoState.seriesMeta.episode));
    }

    fetch(`/api/subtitles/search?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.tracks)) {
          const merged = [...builtInSubs];
          const seenIds = new Set(merged.map((s) => s.id));
          for (const tr of data.tracks as SubtitleTrackItem[]) {
            if (tr?.id && !seenIds.has(tr.id)) {
              seenIds.add(tr.id);
              merged.push(tr);
            }
          }
          setSubtitleTracks(merged);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    videoState.url,
    videoState.mode,
    videoState.rawSourceUrl,
    videoState.subtitles,
    videoState.seriesMeta?.tmdbId,
    videoState.seriesMeta?.season,
    videoState.seriesMeta?.episode,
  ]);

  const handleSelectSubtitleTrack = async (trackId: string) => {
    setActiveSubId(trackId);
    if (trackId === 'off') {
      setParsedCues([]);
      return;
    }
    const found = subtitleTracks.find((s) => s.id === trackId);
    if (!found) return;
    if (found.rawContent) {
      setParsedCues(parseSubtitleText(found.rawContent));
      return;
    }
    if (found.url) {
      try {
        const res = await fetch(found.url);
        const text = await res.text();
        setParsedCues(parseSubtitleText(text));
      } catch {
        showTransientToast(
          pickLang(lang, {
            es: 'No se pudo cargar este subtítulo',
            ca: 'No s’ha pogut carregar aquest subtítol',
            en: 'Failed to load subtitle',
          })
        );
      }
    }
  };

  const handleUploadLocalSubtitle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const cues = parseSubtitleText(content);
      const customId = `local-${Date.now()}`;
      const newTrack: SubtitleTrackItem = {
        id: customId,
        label: file.name.slice(0, 26),
        lang: 'LOCAL',
        rawContent: content,
      };
      setSubtitleTracks((prev) => [newTrack, ...prev]);
      setActiveSubId(customId);
      setParsedCues(cues);
      showTransientToast(
        pickLang(lang, {
          es: `Subtítulos cargados (${cues.length} líneas)`,
          ca: `Subtítols carregats (${cues.length} línies)`,
          en: `Subtitles loaded (${cues.length} cues)`,
        })
      );
    };
    reader.readAsText(file);
    e.target.value = '';
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

  // ============================================================================
  // SCREEN WAKE LOCK (Prevents phone/tablet screen from sleeping mid-movie/match)
  // ============================================================================
  useEffect(() => {
    let wakeLock: WakeLockSentinelLike | null = null;
    const requestLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        if (localPlaying && nav.wakeLock?.request) {
          wakeLock = await nav.wakeLock.request('screen');
        }
      } catch {
        // ignore unsupported or battery-saver restrictions
      }
    };
    requestLock();

    const onVisChange = () => {
      if (document.visibilityState === 'visible' && localPlaying) {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      wakeLock?.release?.().catch(() => {});
    };
  }, [localPlaying]);

  // Stall 8s Auto-Failover & QoE Metrics Reporter
  useEffect(() => {
    if (!isBuffering || !localPlaying || videoState.mode === 'idle') return;
    rebufferCountRef.current += 1;
    const stallTimer = setTimeout(() => {
      const elapsedSinceLoad = Math.max(0, Date.now() - streamLoadStartRef.current);
      const activeTrack = videoState.tracks?.[videoState.activeTrackIndex];
      fetch('/api/metrics/qoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: isTvMode ? 'smart-tv' : 'web',
          startupMs: Math.min(60_000, elapsedSinceLoad),
          rebufferCount: rebufferCountRef.current,
          rebufferMs: 8000,
          stallFailoverUsed: true,
          failed: true,
          sourceUrl: activeTrack?.sourceUrl || videoState.url || undefined,
        }),
      }).catch(() => {});
      if (
        canControlRoom &&
        videoState.tracks.length > 1 &&
        videoState.activeTrackIndex + 1 < videoState.tracks.length
      ) {
        showTransientToast(
          pickLang(lang, {
            es: 'Cambio automático de servidor por buffering...',
            ca: 'Canvi automàtic de servidor per buffering...',
            en: 'Auto-switching backup server after buffering...',
          })
        );
        onSelectTrack(videoState.activeTrackIndex + 1, currentTime);
      }
    }, 8000);
    return () => clearTimeout(stallTimer);
  }, [
    isBuffering,
    localPlaying,
    isTvMode,
    videoState.mode,
    videoState.url,
    videoState.tracks,
    videoState.activeTrackIndex,
    canControlRoom,
    onSelectTrack,
    currentTime,
    lang,
    showTransientToast,
  ]);

  // ============================================================================
  // PICTURE-IN-PICTURE (SUPERPONER VÍDEO ENCIMA DEL TELÉFONO) + MEDIA SESSION
  // ============================================================================
  useEffect(() => {
    const video = videoRef.current as WebKitVideoElement | null;
    if (!video) return;

    // Enable Android Chrome / PWA automatic PiP when swiping to phone home screen
    try {
      video.autoPictureInPicture = true;
    } catch {
      // ignore
    }

    const onEnterPiP = () => setIsInPiP(true);
    const onLeavePiP = () => setIsInPiP(false);
    const onWebkitModeChange = () => {
      setIsInPiP(video.webkitPresentationMode === 'picture-in-picture');
    };

    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);
    video.addEventListener('webkitpresentationmodechanged', onWebkitModeChange);

    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
      video.removeEventListener('webkitpresentationmodechanged', onWebkitModeChange);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (videoState.mode === 'idle') {
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: videoState.title || 'RiffanTV',
        artist: videoState.subtitle || 'RiffanTV Sala Sincronizada',
        album: 'RiffanTV',
        artwork: videoState.poster
          ? [{ src: videoState.poster, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        const v = videoRef.current;
        if (v) {
          v.play().catch(() => {});
          onSyncAction('play', { isPlaying: true, currentTime: v.currentTime || 0 });
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          onSyncAction('pause', { isPlaying: false, currentTime: v.currentTime || 0 });
        }
      });
      if (!videoState.isLive) {
        navigator.mediaSession.setActionHandler('seekbackward', () => {
          const v = videoRef.current;
          if (!v) return;
          const next = Math.max(0, (v.currentTime || 0) - 10);
          v.currentTime = next;
          onSyncAction('seek', { currentTime: next, isPlaying: !v.paused });
        });
        navigator.mediaSession.setActionHandler('seekforward', () => {
          const v = videoRef.current;
          if (!v) return;
          const next = (v.currentTime || 0) + 10;
          v.currentTime = next;
          onSyncAction('seek', { currentTime: next, isPlaying: !v.paused });
        });
      }
      if (videoState.seriesMeta && onNextEpisode) {
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          onNextEpisode();
        });
      }
      // Chrome Android Auto-PiP handler
      try {
        const ms = navigator.mediaSession as MediaSession & {
          setActionHandler: (action: string, handler: (() => void) | null) => void;
        };
        ms.setActionHandler(
          'enterpictureinpicture',
          async () => {
            const v = videoRef.current as WebKitVideoElement | null;
            if (v?.requestPictureInPicture && !document.pictureInPictureElement) {
              await v.requestPictureInPicture();
            }
          }
        );
      } catch {
        // ignore if action unsupported in browser
      }
    } catch {
      // ignore
    }
  }, [
    videoState.mode,
    videoState.title,
    videoState.subtitle,
    videoState.poster,
    videoState.isLive,
    videoState.seriesMeta,
    onNextEpisode,
    onSyncAction,
  ]);

  // Update lock-screen MediaSession position state
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }
    if (videoState.mode === 'idle' || videoState.isLive || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(duration, currentTime),
        playbackRate: playbackSpeed || 1,
        position: Math.max(0, Math.min(duration, currentTime)),
      });
    } catch {
      // ignore invalid position state
    }
  }, [currentTime, duration, playbackSpeed, videoState.mode, videoState.isLive]);

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
        startPosition: targetResumeSec > 3 ? targetResumeSec : videoState.isLive ? 0 : -1,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 14,
        maxLiveSyncPlaybackRate: 1,
        backBufferLength: 30,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferHole: 2.5,
        maxFragLookUpTolerance: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.35,
        nudgeMaxRetry: 20,
        abrEwmaDefaultEstimate: 2_200_000,
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

  // ============================================================================
  // ENGINE 2: YOUTUBE OFFICIAL IFRAME API ENGINE
  // ============================================================================
  useEffect(() => {
    if (videoState.mode !== 'youtube' || !videoState.url) {
      if (ytPlayerRef.current?.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const mountYtPlayer = () => {
      if (cancelled || !window.YT?.Player) return;
      if (ytPlayerRef.current?.loadVideoById) {
        ytPlayerRef.current.loadVideoById(videoState.url, videoState.currentTime || 0);
        try {
          ytPlayerRef.current.unMute?.();
          ytPlayerRef.current.setVolume?.(100);
          setIsMuted(false);
          setVolume(1);
        } catch {
          // ignore
        }
        return;
      }

      ytPlayerRef.current = new window.YT.Player(ytContainerId.current, {
        videoId: videoState.url,
        playerVars: {
          autoplay: 1,
          mute: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: Math.floor(videoState.currentTime || 0),
        },
        events: {
          onReady: (e: YouTubePlayerEvent) => {
            try {
              e.target.unMute?.();
              e.target.setVolume?.(100);
              setIsMuted(false);
              setVolume(1);
            } catch {
              // ignore
            }
            if (videoState.isPlaying) {
              e.target.playVideo();
            } else {
              e.target.pauseVideo();
            }
          },
          onStateChange: (e: YouTubePlayerEvent) => {
            if (e.data === 1) {
              try {
                if (e.target.isMuted?.()) {
                  e.target.unMute?.();
                }
                if ((e.target.getVolume?.() ?? 100) === 0) {
                  e.target.setVolume?.(100);
                }
                setIsMuted(Boolean(e.target.isMuted?.()));
              } catch {
                // ignore
              }
            }
            if (isApplyingRemoteRef.current) return;
            if (e.data === 1) {
              setLocalPlaying(true);
              onSyncAction('play', {
                isPlaying: true,
                currentTime: e.target.getCurrentTime?.() || 0,
              });
            } else if (e.data === 2) {
              setLocalPlaying(false);
              onSyncAction('pause', {
                isPlaying: false,
                currentTime: e.target.getCurrentTime?.() || 0,
              });
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountYtPlayer();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        mountYtPlayer();
      };
    }

    return () => {
      cancelled = true;
    };
  }, [videoState.mode, videoState.url]);

  useEffect(() => {
    if (videoState.mode !== 'youtube' || !ytPlayerRef.current?.getPlayerState) return;
    isApplyingRemoteRef.current = true;
    const yt = ytPlayerRef.current;
    const serverNow = Date.now() + socketService.serverClockOffsetMs;
    const elapsedSec =
      videoState.isPlaying && Number.isFinite(videoState.lastUpdated) && videoState.lastUpdated > 0
        ? Math.max(0, Math.min(12, (serverNow - videoState.lastUpdated) / 1000))
        : 0;
    const expectedTime = videoState.currentTime + elapsedSec + syncOffsetMs / 1000;
    const ytTime = yt.getCurrentTime?.() || 0;
    const signedDrift = expectedTime - ytTime;
    const absDrift = Math.abs(signedDrift);

    if (absDrift > 2.5) {
      yt.setPlaybackRate?.(1);
      yt.seekTo?.(Math.max(0, expectedTime), true);
    } else if (videoState.isPlaying && absDrift >= 0.45 && absDrift <= 2.0) {
      yt.setPlaybackRate?.(signedDrift > 0 ? 1.05 : 0.95);
      if (smoothDriftTimerRef.current) clearTimeout(smoothDriftTimerRef.current);
      smoothDriftTimerRef.current = setTimeout(() => {
        ytPlayerRef.current?.setPlaybackRate?.(1);
      }, 2400);
    } else {
      yt.setPlaybackRate?.(1);
    }

    if (videoState.isPlaying) {
      yt.playVideo?.();
    } else {
      yt.pauseVideo?.();
    }
    const timer = setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [
    videoState.isPlaying,
    videoState.currentTime,
    videoState.lastUpdated,
    videoState.mode,
    syncOffsetMs,
  ]);

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
  const activeTrackLangCode = String(activeTrackObj?.lang || '').toUpperCase();

  const handleQuickLanguageSwitch = (targetLangCode: 'ES' | 'LAT' | 'VOSE' | 'EN') => {
    triggerHaptic('light');
    const langDisplayNames: Record<'ES' | 'LAT' | 'VOSE' | 'EN', string> = {
      ES: 'Castellano (España)',
      LAT: 'Español Latino',
      VOSE: 'Subtitulado (VOSE)',
      EN: 'Inglés Original (EN)',
    };
    const requestedName = langDisplayNames[targetLangCode];

    const matchingIdx = (videoState.tracks || []).findIndex(
      (tr) => String(tr.lang || '').toUpperCase() === targetLangCode
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
        className={`relative w-full bg-black overflow-hidden select-none transition-all duration-300 ${
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
                  <AlertCircle className="w-4 h-4" />
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
              <X className="w-3.5 h-3.5" />
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
            <MessageSquare className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
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
                <Maximize2 className="w-3.5 h-3.5" />
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
                  <Cast className="w-4 h-4 shrink-0" />
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
                      <PhoneCall className="w-4 h-4 shrink-0" />
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
                  <SlidersHorizontal className="w-4 h-4 text-zinc-100 shrink-0" />
                  <span className="hidden sm:inline">Ajustes</span>
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
                      <Minimize className="w-4 h-4" />
                      <span>Salir Pantalla Completa</span>
                    </>
                  ) : (
                    <>
                      <Maximize className="w-4 h-4" />
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
                  <Minimize className="w-4 h-4" />
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
                    <X className="w-4 h-4" />
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
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
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
                    <X className="w-4 h-4" />
                  </button>
                )}
            </div>
          )}

        {/* ================================================================== */}
        {/* IDLE STANDBY STAGE (Apple TV OLED Lounge)                          */}
        {/* ================================================================== */}
        {videoState.mode === 'idle' && !isExtracting && !isMinimized && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 sm:p-8 text-center bg-gradient-to-b from-[#18181B] via-[#0E0E10] to-[#09090B]">
            {isTvMode && (
              <div className="mb-4 px-4 py-1.5 rounded-full bg-[#00F593]/15 border border-[#00F593]/40 text-xs sm:text-sm font-semibold text-[#00F593] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00F593]" />
                <span>
                  {pickLang(lang, {
                    es: `${roomDisplayName || `Sala ${(roomCode || '').toUpperCase()}`} · ${participantCount} ${participantCount === 1 ? 'conectado' : 'conectados'}`,
                    ca: `${roomDisplayName || `Sala ${(roomCode || '').toUpperCase()}`} · ${participantCount} ${participantCount === 1 ? 'connectat' : 'connectats'}`,
                    en: `${roomDisplayName || `Room ${(roomCode || '').toUpperCase()}`} · ${participantCount} connected`,
                  })}
                </span>
              </div>
            )}
            <div className="w-12 h-12 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/35 flex items-center justify-center mb-3 shadow-[0_0_30px_rgba(145,70,255,0.22)]">
              <Tv className="w-6 h-6 text-[#BF94FF]" />
            </div>
            <h3 className="font-display font-semibold text-base sm:text-2xl text-white text-balance">
              {isTvMode
                ? pickLang(lang, {
                    es: 'Televisor listo para proyectar en 1080p',
                    ca: 'Televisor preparat per projectar en 1080p',
                    en: 'TV ready to project in 1080p',
                  })
                : t.standbyTitle}
            </h3>
            <p className="text-xs sm:text-base text-zinc-400 max-w-lg mt-1.5">
              {isTvMode
                ? pickLang(lang, {
                    es: 'Elige una película, serie, partido en directo o vídeo de YouTube desde tu móvil y empezará aquí automáticamente.',
                    ca: 'Tria una pel·lícula, sèrie, partit en directe o vídeo de YouTube des del mòbil i començarà aquí automàticament.',
                    en: 'Pick any movie, series, live match, or YouTube video on your phone and it will play here automatically.',
                  })
                : t.standbySub}
            </p>
            {isTvMode && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="min-h-[46px] px-5 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer transition-colors shadow-[0_12px_30px_rgba(145,70,255,0.35)]"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize className="w-4 h-4" />
                      <span>
                        {pickLang(lang, {
                          es: 'Salir Pantalla Completa',
                          ca: 'Sortir Pantalla Completa',
                          en: 'Exit Fullscreen',
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Maximize className="w-4 h-4" />
                      <span>
                        {pickLang(lang, {
                          es: 'Poner TV en Pantalla Completa',
                          ca: 'Posar TV en Pantalla Completa',
                          en: 'Enter TV Fullscreen',
                        })}
                      </span>
                    </>
                  )}
                </button>

                {onExitTvMode && (
                  <button
                    type="button"
                    onClick={onExitTvMode}
                    className="min-h-[46px] px-5 rounded-2xl bg-[#26262C] hover:bg-white/[0.14] border border-white/15 text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>
                      {pickLang(lang, {
                        es: 'Cambiar código o salir de Modo TV',
                        ca: 'Canviar codi o sortir de Mode TV',
                        en: 'Switch code or exit TV Mode',
                      })}
                    </span>
                  </button>
                )}
              </div>
            )}

            {extractionError && (
              <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 max-w-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{extractionError}</span>
              </div>
            )}

            {onOpenCatalogSection && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('movies')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Film className="w-4 h-4" />
                  <span>{t.tabMovies}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('series')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Tv className="w-4 h-4 text-[#BF94FF]" />
                  <span>{t.tabSeries}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('anime')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-[#F47521]" />
                  <span>Anime</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('tdt')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Radio className="w-4 h-4 text-[#EB0400]" />
                  <span>{t.tabTdt}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('sports')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>{t.tabSports}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('youtube')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Youtube className="w-4 h-4 text-[#EB0400]" />
                  <span>YouTube</span>
                </button>
              </div>
            )}
          </div>
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
              setCurrentTime(ct);
              if (!e.currentTarget.paused) {
                clearBufferingIndicator();
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

              // Immediately jump any tiny MSE segment-boundary micro-gap (< 2.5s) if future data is already buffered!
              if (vNow && !vNow.paused && vNow.buffered.length > 0) {
                for (let i = 0; i < vNow.buffered.length; i++) {
                  const bStart = vNow.buffered.start(i);
                  const bEnd = vNow.buffered.end(i);
                  if (bStart > waitAtTime && bStart - waitAtTime <= 2.5 && bEnd - bStart >= 0.4) {
                    try {
                      vNow.currentTime = bStart + 0.06;
                      return;
                    } catch {
                      // ignore
                    }
                  }
                }
              }

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
            } bg-black cursor-pointer`}
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
              <X className="w-3.5 h-3.5" />
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
                  <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
                ) : (
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-0.5" />
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
                      <VolumeX className="w-4 h-4" />
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
                      <Volume2 className="w-4 h-4 text-[#00F593]" />
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
        {videoState.mode === 'embed' && videoState.url && (() => {
          const activeTrack = videoState.tracks[videoState.activeTrackIndex];
          const activeTrackUrl = unwrapEmbedUrl(
            activeTrack?.sourceUrl || activeTrack?.resolvedStreamUrl || videoState.url
          );
          const externalVidfastHref = (() => {
            const candidates = [
              activeTrackUrl,
              unwrapEmbedUrl(videoState.rawSourceUrl || ''),
              unwrapEmbedUrl(videoState.url),
              ...videoState.tracks.map((tr) => unwrapEmbedUrl(tr.sourceUrl)),
            ].filter(Boolean);

            for (const c of candidates) {
              if (/vidfast\.[a-z.]+/i.test(c)) {
                return c.replace(/vidfast\.[a-z.]+/i, 'vidfast.vc');
              }
            }
            if (videoState.seriesMeta?.tmdbId) {
              return `https://vidfast.vc/tv/${videoState.seriesMeta.tmdbId}/${
                videoState.seriesMeta.season || 1
              }/${videoState.seriesMeta.episode || 1}?autoPlay=true&theme=9146FF`;
            }
            for (const c of candidates) {
              const tvM =
                c.match(/(?:bingetrix|vidsrc|vidlink|autoembed)\.[a-z.]+\/(?:watch\/|embed\/|v2\/)?tv\/(?:tmdb\/)?(\d+)[/-](\d+)[/-](\d+)/i) ||
                c.match(/2embed\.[a-z.]+\/(?:embedtv|tv)\/(\d+)(?:&s=|\/)(\d+)(?:&e=|\/)(\d+)/i);
              if (tvM) {
                return `https://vidfast.vc/tv/${tvM[1]}/${tvM[2]}/${tvM[3]}?autoPlay=true&theme=9146FF`;
              }
              const movM = c.match(
                /(?:bingetrix|vidsrc|vidlink|autoembed|2embed)\.[a-z.]+\/(?:watch\/|embed\/|v2\/)?(?:movie\/)?(?:tmdb\/)?(\d+)/i
              );
              if (movM) {
                return `https://vidfast.vc/movie/${movM[1]}?autoPlay=true&theme=9146FF`;
              }
            }
            return activeTrackUrl;
          })();

          const inlineIframeSrc = activeEmbedInlineUrl || videoState.url;
          const lastAttemptedUrl =
            lastAttemptedEmbedUrlRef.current || activeTrackUrl || activeEmbedDirectUrl;
          const canPrevEpisode = Boolean(
            videoState.seriesMeta &&
              onPrevEpisode &&
              (videoState.seriesMeta.season > 1 || videoState.seriesMeta.episode > 1)
          );

          // 1) Controlled External Window Active Panel
          if (externalWinState === 'open') {
            return (
              <div className="relative w-full h-full bg-gradient-to-b from-[#171226] via-[#0F0F15] to-black flex flex-col items-center justify-center p-3 sm:p-5 text-center overflow-y-auto">
                <div className="w-full max-w-lg rounded-2xl bg-[#14141B]/95 border border-[#9146FF]/45 p-3.5 sm:p-4 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2 text-left">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>
                          {isMobileExternal
                            ? 'Reproduciendo en pestaña externa'
                            : 'Reproduciendo en ventana externa'}
                        </span>
                      </div>
                      <h4 className="font-display font-bold text-xs sm:text-sm text-white truncate">
                        {videoState.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {activeTrack?.label || 'Servidor Web'}
                      </p>
                    </div>
                  </div>

                  {/* Window focus / close controls */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        handleFocusExternalWindow();
                      }}
                      className="min-h-9 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Traer al frente</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        handleCloseExternalWindow();
                      }}
                      className="min-h-9 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>
                        {isMobileExternal ? 'Cerrar pestaña' : 'Cerrar ventana'}
                      </span>
                    </button>
                  </div>

                  {/* Episode Prev / Next controls when watching a series */}
                  {videoState.seriesMeta && (onPrevEpisode || onNextEpisode) && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1 border-t border-white/[0.08]">
                      {onPrevEpisode && (
                        <button
                          type="button"
                          disabled={!canPrevEpisode || isExtracting}
                          onClick={() => {
                            triggerHaptic('light');
                            onPrevEpisode();
                          }}
                          className="min-h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <SkipBack className="w-3.5 h-3.5" />
                          <span>Capítulo anterior</span>
                        </button>
                      )}
                      {onNextEpisode && (
                        <button
                          type="button"
                          disabled={isExtracting}
                          onClick={() => {
                            triggerHaptic('light');
                            onNextEpisode();
                          }}
                          className="min-h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <span>Siguiente capítulo</span>
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Server Switcher inside active External Window Panel */}
                  {videoState.tracks.length > 1 && (
                    <div className="pt-1 border-t border-white/[0.08]">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                        Cambiar servidor en {isMobileExternal ? 'pestaña' : 'ventana'}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {videoState.tracks.slice(0, 6).map((tr, idx) => {
                          const isAct = idx === videoState.activeTrackIndex;
                          const label = tr.label.split('·')[0].trim() || `Servidor ${idx + 1}`;
                          return (
                            <button
                              key={tr.id || idx}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                handleSelectExternalServer(idx);
                              }}
                              className={`min-h-7 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                                isAct
                                  ? 'bg-[#9146FF] text-white'
                                  : 'bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // 2) Controlled External Window Closed State (detected by 1s ref.closed poll)
          if (externalWinState === 'closed') {
            return (
              <div className="relative w-full h-full bg-[#0E0E14] flex flex-col items-center justify-center p-4 text-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/[0.07] border border-white/15 flex items-center justify-center text-zinc-200">
                  <ExternalLink className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h4 className="font-display font-bold text-sm sm:text-base text-white">
                    {isMobileExternal ? 'Pestaña cerrada' : 'Ventana cerrada'}
                  </h4>
                  <p className="text-xs text-zinc-400 truncate">{videoState.title}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      openControlledExternalWindow(activeTrackUrl);
                    }}
                    className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Reabrir</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryInlineEmbed}
                    className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-100 text-xs font-semibold cursor-pointer"
                  >
                    Reintentar inline
                  </button>
                </div>
              </div>
            );
          }

          // 3) Popup Blocker Fallback State (window.open returned null)
          if (externalWinState === 'blocked') {
            const fallbackHref = externalTargetUrl || activeTrackUrl || externalVidfastHref;
            return (
              <div className="relative w-full h-full bg-[#120E18] flex flex-col items-center justify-center p-4 text-center gap-3">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <div className="space-y-1 max-w-md">
                  <h4 className="font-display font-bold text-sm sm:text-base text-white">
                    Permite ventanas emergentes para este sitio
                  </h4>
                  <p className="text-xs text-zinc-300">
                    El navegador bloqueó la ventana controlada. Puedes reintentar o abrir en pestaña normal.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      openControlledExternalWindow(fallbackHref);
                    }}
                    className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reintentar</span>
                  </button>
                  <a
                    href={fallbackHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-10 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir fuera</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleRetryInlineEmbed}
                    className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-semibold cursor-pointer"
                  >
                    Reintentar inline
                  </button>
                </div>
              </div>
            );
          }

          // 4) Watchdog Exhausted OR Server Persisted as window_required
          if (
            embedWatchdogPhase === 'exhausted' ||
            embedWatchdogPhase === 'window_preferred'
          ) {
            return (
              <div className="relative w-full h-full bg-gradient-to-b from-[#171224] to-black flex flex-col items-center justify-center p-4 text-center gap-3">
                <div className="space-y-1 max-w-md">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF]">
                    {activeTrack?.label || 'Servidor Web'}
                  </div>
                  <h4 className="font-display font-bold text-sm sm:text-base text-white">
                    {embedWatchdogPhase === 'window_preferred'
                      ? 'Este servidor requiere ventana externa para reproducir sin bloqueos'
                      : 'Los servidores integrados no respondieron a tiempo'}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Abre el reproductor directamente en {isMobileExternal ? 'una pestaña' : 'una ventana'} controlada con cambio de capítulos y servidores.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      openControlledExternalWindow(lastAttemptedUrl);
                    }}
                    className="min-h-11 px-5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-[0_10px_28px_rgba(145,70,255,0.45)] cursor-pointer transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Reproducir en ventana externa</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryInlineEmbed}
                    className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reintentar inline</span>
                  </button>
                  <a
                    href={externalVidfastHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir fuera</span>
                  </a>
                </div>
              </div>
            );
          }

          // 5) Default Inline Iframe Mode (clean Permissions Policy `allow`, NO sandbox tricks)
          return (
            <div className="relative w-full h-full bg-black">
              <iframe
                key={inlineIframeSrc}
                src={inlineIframeSrc}
                title={videoState.title || 'Reproductor Web HD'}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                className="w-full h-full border-0 bg-black"
              />

              {!isMinimized && embedRescueDismissedUrl !== videoState.url && (
                <div className="absolute bottom-2.5 right-2.5 left-2.5 sm:left-auto z-20 flex flex-wrap items-center justify-end gap-1.5 pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#111116]/90 backdrop-blur-md border border-white/15 shadow-xl text-[11px] text-zinc-200 max-w-full overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        openControlledExternalWindow(activeTrackUrl);
                      }}
                      className="min-h-7 px-2.5 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-white font-bold whitespace-nowrap inline-flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Reproducir en ventana</span>
                    </button>

                    {embedWatchdogPhase !== 'verified' && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          handleMarkInlineServerWorking();
                        }}
                        title="Confirmar que este servidor funciona integrado y detener cambio automático"
                        className="min-h-7 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/35 text-emerald-200 font-bold whitespace-nowrap inline-flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>Funciona</span>
                      </button>
                    )}

                    {videoState.tracks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          const nextIdx =
                            (videoState.activeTrackIndex + 1) % videoState.tracks.length;
                          onSelectTrack(nextIdx, currentTime);
                        }}
                        className="min-h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold whitespace-nowrap cursor-pointer shrink-0 transition-colors"
                      >
                        {pickLang(lang, {
                          es: 'Otro servidor',
                          ca: 'Un altre servidor',
                          en: 'Next server',
                        })}
                      </button>
                    )}

                    {onOpenInCloudBrowser && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('medium');
                          onOpenInCloudBrowser(activeTrackUrl);
                        }}
                        className="min-h-7 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-semibold whitespace-nowrap cursor-pointer shrink-0 transition-colors"
                      >
                        Cloud HD
                      </button>
                    )}

                    <a
                      href={externalVidfastHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-100 font-semibold whitespace-nowrap inline-flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>
                        {pickLang(lang, {
                          es: 'Abrir fuera',
                          ca: 'Obrir fora',
                          en: 'Open external',
                        })}
                      </span>
                    </a>

                    <button
                      type="button"
                      onClick={() => setEmbedRescueDismissedUrl(videoState.url)}
                      aria-label={pickLang(lang, {
                        es: 'Ocultar aviso',
                        ca: 'Amagar avís',
                        en: 'Dismiss notice',
                      })}
                      className="w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
          <div className="pointer-events-none absolute inset-0 z-25 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
            <Loader2 className="w-7 h-7 sm:w-9 sm:h-9 animate-spin text-[#9146FF] mb-2" />
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
          </div>
        )}

        {!isExtracting &&
          isBuffering &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') && (
            <div className="pointer-events-none absolute top-3 left-3 z-25 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9146FF]" />
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
            <AlertCircle className="w-8 h-8 text-amber-400" />
            <p className="text-xs sm:text-sm text-zinc-200 max-w-md">{streamError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleForceReloadStream}
                className="min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
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
          <div
            className={`pointer-events-none absolute bottom-0 inset-x-0 z-30 px-2.5 sm:px-5 pb-2 sm:pb-3 pt-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Protected Legible Timeline Scrubber (Rotation-aware for 90deg Landscape) */}
            {!videoState.isLive && duration > 0 && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!shouldRotate90) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(
                    0,
                    Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))
                  );
                  handleScrub(Math.round(ratio * duration));
                }}
                onTouchMove={(e) => {
                  if (!shouldRotate90 || !e.touches[0]) return;
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(
                    0,
                    Math.min(1, (e.touches[0].clientY - rect.top) / Math.max(1, rect.height))
                  );
                  handleScrub(Math.round(ratio * duration));
                }}
                className={`relative h-7 flex items-center px-1 mb-0.5 ${
                  showControls ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                <div className="relative w-full h-1.5 rounded-full bg-white/25 overflow-hidden pointer-events-none shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#9146FF] to-[#BF94FF] transition-[width] duration-100"
                    style={{
                      width: `${Math.min(100, Math.max(0, (Math.min(currentTime, duration) / Math.max(1, duration)) * 100))}%`,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={1}
                  value={Math.min(currentTime, duration)}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  aria-label={pickLang(lang, {
                    es: 'Línea de tiempo',
                    ca: 'Línia de temps',
                    en: 'Timeline',
                  })}
                  className="absolute inset-x-1 inset-y-0 w-[calc(100%-0.5rem)] h-full cinema-range cinema-range-overlay z-10"
                />
              </div>
            )}

            <div
              onClick={(e) => e.stopPropagation()}
              className={`flex items-center justify-between gap-1 sm:gap-1.5 ${
                showControls ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {/* Left Cluster: Play/Pause + Mute/Volume + Timecode */}
              <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 shrink-0">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer shrink-0"
                  aria-label={
                    localPlaying
                      ? pickLang(lang, { es: 'Pausar', ca: 'Pausar', en: 'Pause' })
                      : pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })
                  }
                >
                  {localPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                    aria-label={pickLang(lang, {
                      es: 'Silenciar',
                      ca: 'Silenciar',
                      en: 'Mute',
                    })}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-5 h-5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeSlider(Number(e.target.value))}
                    aria-label={pickLang(lang, {
                      es: 'Volumen',
                      ca: 'Volum',
                      en: 'Volume',
                    })}
                    className="hidden md:block w-20 cinema-range"
                  />
                </div>

                {videoState.isLive ? (
                  <div className="flex items-center gap-1.5 pl-1 text-[11px] sm:text-xs font-bold text-white whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-[#EB0400]" />
                    <span>{t.liveNow}</span>
                  </div>
                ) : (
                  <div className="text-[11px] sm:text-xs font-mono tabular-nums text-zinc-200 pl-0.5 whitespace-nowrap shrink-0">
                    {formatTimecode(currentTime)}
                    <span className="text-zinc-500 mx-0.5">/</span>
                    {formatTimecode(duration)}
                  </div>
                )}
              </div>

              {/* Right Cluster: HUD Audio Track + Video Quality + Orientation Rotate + Fullscreen */}
              <div className="relative flex items-center gap-1 shrink-0">
                {videoState.mode === 'hls' && hlsAudioTracks.length > 1 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        revealControls();
                        setActiveHudMenu((prev) => (prev === 'audio' ? null : 'audio'));
                      }}
                      aria-label={t.audioTrackLabel}
                      aria-expanded={activeHudMenu === 'audio'}
                      className={`min-h-[40px] px-2.5 rounded-2xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                        activeHudMenu === 'audio'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/10 hover:bg-white/18 text-zinc-100'
                      }`}
                    >
                      <AudioLines className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline max-w-[84px] truncate">
                        {hlsAudioTracks.find((tr) => tr.id === selectedHlsAudioTrack)?.lang ||
                          hlsAudioTracks.find((tr) => tr.id === selectedHlsAudioTrack)?.name ||
                          t.audioTrackLabel}
                      </span>
                    </button>

                    {activeHudMenu === 'audio' && (
                      <div
                        role="menu"
                        aria-label={t.audioTrackLabel}
                        className="absolute bottom-full right-0 mb-2 w-48 p-1.5 rounded-2xl bg-[#141418]/96 backdrop-blur-2xl border border-white/15 shadow-[0_18px_45px_rgba(0,0,0,0.85)] z-50 space-y-0.5"
                      >
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          {t.audioTrackEmbedded}
                        </div>
                        {hlsAudioTracks.map((tr) => {
                          const isSelected = tr.id === selectedHlsAudioTrack;
                          return (
                            <button
                              key={tr.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              onClick={() => handleSelectHlsAudioTrack(tr.id)}
                              className={`w-full min-h-[36px] px-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[#9146FF] text-white'
                                  : 'text-zinc-200 hover:bg-white/10'
                              }`}
                            >
                              <span className="truncate">{tr.name}</span>
                              {tr.lang && (
                                <span className="text-[10px] font-mono opacity-80 shrink-0">
                                  {tr.lang}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {videoState.mode === 'hls' && qualityLevels.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        revealControls();
                        setActiveHudMenu((prev) => (prev === 'quality' ? null : 'quality'));
                      }}
                      aria-label={t.qualityLabel}
                      aria-expanded={activeHudMenu === 'quality'}
                      className={`min-h-[38px] sm:min-h-[40px] px-2 sm:px-2.5 rounded-2xl text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                        activeHudMenu === 'quality'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/10 hover:bg-white/18 text-zinc-100'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {selectedQuality === -1 ? (
                          autoActiveHeight ? (
                            <>
                              <span className="hidden sm:inline">{t.qualityAuto} · </span>
                              {autoActiveHeight}p
                            </>
                          ) : (
                            t.qualityAuto
                          )
                        ) : (
                          `${qualityLevels.find((q) => q.index === selectedQuality)?.height || ''}p`
                        )}
                      </span>
                    </button>

                    {activeHudMenu === 'quality' && (
                      <div
                        role="menu"
                        aria-label={t.qualityLabel}
                        className="absolute bottom-full right-0 mb-2 w-44 p-1.5 rounded-2xl bg-[#141418]/96 backdrop-blur-2xl border border-white/15 shadow-[0_18px_45px_rgba(0,0,0,0.85)] z-50 space-y-0.5"
                      >
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          {t.qualityLabel}
                        </div>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedQuality === -1}
                          onClick={() => handleChangeQuality(-1)}
                          className={`w-full min-h-[36px] px-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            selectedQuality === -1
                              ? 'bg-[#9146FF] text-white'
                              : 'text-zinc-200 hover:bg-white/10'
                          }`}
                        >
                          <span>{t.qualityAuto}</span>
                          {autoActiveHeight && selectedQuality === -1 && (
                            <span className="font-mono text-[10px] opacity-80">
                              {autoActiveHeight}p
                            </span>
                          )}
                        </button>
                        {qualityLevels.map((q) => {
                          const isSelected = selectedQuality === q.index;
                          return (
                            <button
                              key={q.index}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              onClick={() => handleChangeQuality(q.index)}
                              className={`w-full min-h-[36px] px-2.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[#9146FF] text-white'
                                  : 'text-zinc-200 hover:bg-white/10'
                              }`}
                            >
                              <span>{q.height}p</span>
                              {q.height >= 1080 && (
                                <span className="text-[10px] font-sans opacity-80">FHD</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleToggleLandscapeRotation}
                  className={`min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[42px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                    (isFullscreen || isHorizontalFullscreen) && forceLandscapeRotation
                      ? 'bg-[#9146FF]/25 text-[#BF94FF] border border-[#9146FF]/50'
                      : 'hover:bg-white/12 text-white'
                  }`}
                  title={pickLang(lang, {
                    es: 'Girar pantalla en horizontal (16:9)',
                    ca: 'Girar pantalla en horitzontal (16:9)',
                    en: 'Rotate landscape (16:9)',
                  })}
                  aria-label={pickLang(lang, {
                    es: 'Girar en horizontal',
                    ca: 'Girar en horitzontal',
                    en: 'Rotate landscape',
                  })}
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[42px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                  title={pickLang(lang, {
                    es: 'Pantalla completa horizontal',
                    ca: 'Pantalla completa horitzontal',
                    en: 'Landscape fullscreen',
                  })}
                  aria-label={pickLang(lang, {
                    es: 'Pantalla completa',
                    ca: 'Pantalla completa',
                    en: 'Fullscreen',
                  })}
                >
                  {isFullscreen || isHorizontalFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ================================================================== */}
        {/* FLOATING 16:9 DRAGGABLE MINI-PLAYER HUD OVERLAY (WHEN MINIMIZED)   */}
        {/* ================================================================== */}
        {isMinimized && (
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between p-2 bg-gradient-to-b from-black/75 via-transparent to-black/80">
            {/* Top Row: Drag Grip + Title + Expand & Close Buttons */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15">
                <span className="text-[10px] text-[#BF94FF] font-bold leading-none">⠿</span>
                <span className="font-display font-bold text-[10px] text-white truncate max-w-[115px] sm:max-w-[155px]">
                  {videoState.title}
                </span>
              </div>

              <div
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="pointer-events-auto flex items-center gap-1 shrink-0"
              >
                {onToggleMinimize && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onToggleMinimize();
                    }}
                    className="w-7 h-7 rounded-full bg-[#9146FF] hover:bg-[#772CE8] flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform cursor-pointer"
                    title={pickLang(lang, {
                      es: 'Ampliar reproductor',
                      ca: 'Ampliar reproductor',
                      en: 'Expand player',
                    })}
                    aria-label={pickLang(lang, {
                      es: 'Ampliar reproductor',
                      ca: 'Ampliar reproductor',
                      en: 'Expand player',
                    })}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {onClosePlayer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onClosePlayer();
                    }}
                    className="w-7 h-7 rounded-full bg-black/75 hover:bg-rose-600 border border-white/20 flex items-center justify-center text-zinc-200 hover:text-white active:scale-90 transition-transform cursor-pointer"
                    title={pickLang(lang, { es: 'Cerrar reproductor', ca: 'Tancar reproductor', en: 'Close player' })}
                    aria-label={pickLang(lang, { es: 'Cerrar reproductor', ca: 'Tancar reproductor', en: 'Close player' })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Row: Play/Pause + Mute/Unmute + Corner Hint */}
            <div className="flex items-center justify-between gap-1.5">
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="pointer-events-auto flex items-center gap-1"
              >
                {(canUseNativePiPOrCast || videoState.mode === 'youtube') && (
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="w-7 h-7 rounded-full bg-black/75 hover:bg-black border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
                    aria-label={
                      localPlaying
                        ? pickLang(lang, { es: 'Pausar', ca: 'Pausa', en: 'Pause' })
                        : pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })
                    }
                  >
                    {localPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                )}

                {(canUseNativePiPOrCast || videoState.mode === 'youtube') && (
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="w-7 h-7 rounded-full bg-black/75 hover:bg-black border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
                    aria-label={pickLang(lang, { es: 'Silenciar', ca: 'Silenciar', en: 'Mute' })}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                )}
              </div>

              <span className="text-[9px] font-semibold text-zinc-300/90 bg-black/55 px-2 py-0.5 rounded-full backdrop-blur-sm">
                {pickLang(lang, {
                  es: 'Arrastra a 4 esquinas',
                  ca: 'Arrossega a 4 cantonades',
                  en: 'Drag to 4 corners',
                })}
              </span>
            </div>

            {/* Thin Bottom Playback Progress Line */}
            {!videoState.isLive && duration > 0 && (
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-white/20">
                <div
                  className="h-full bg-[#9146FF]"
                  style={{
                    width: `${Math.min(100, Math.max(4, Math.round((currentTime / duration) * 100)))}%`,
                  }}
                />
              </div>
            )}
          </div>
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
          <div className="bg-[#111116]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {/* Left: Quick Language Pills (VOD), Multi-Server Fallback Switcher, OR Live Signal Pills */}
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              {videoState.tracks.length > 1 &&
              (videoState.mode === 'embed' ||
                (videoState.tracks || []).some(
                  (tr) => tr.resolverType === 'web_embed' || tr.resolverType === 'youtube'
                )) ? (
                <div className="flex items-center gap-1 bg-white/[0.045] p-1 rounded-2xl border border-white/[0.08]">
                  {videoState.tracks.slice(0, 6).map((tr, idx) => {
                    const active = idx === videoState.activeTrackIndex;
                    const shortLabel =
                      tr.resolverType === 'youtube'
                        ? tr.label.replace(/\s*\([^)]*\)/g, '')
                        : tr.label.split('·')[0].trim() || `${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} ${idx + 1}`;
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
                            ? 'bg-[#9146FF] text-white shadow-sm'
                            : 'text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {shortLabel}
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
                      <Play className="w-3 h-3 fill-current shrink-0" />
                      <span>Reproducir en ventana</span>
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
                      <span>
                        {pickLang(lang, {
                          es: 'Cloud Sin Anuncios',
                          ca: 'Cloud Sense Anuncis',
                          en: 'Ad-Free Cloud',
                        })}
                      </span>
                    </button>
                  )}
                </div>
              ) : !videoState.isLive &&
              (videoState.mode === 'hls' || videoState.mode === 'direct') &&
              (videoState.tracks || []).some((tr) =>
                ['ES', 'LAT', 'VOSE', 'EN'].includes(String(tr.lang || '').toUpperCase())
              ) ? (
                <div className="flex items-center gap-1 bg-[#26262C]/80 p-1 rounded-2xl border border-white/[0.08]">
                  {(
                    [
                      { code: 'ES', short: 'ES', title: 'Castellano' },
                      { code: 'LAT', short: 'LAT', title: 'Latino' },
                      { code: 'VOSE', short: 'VOSE', title: 'VOSE' },
                      { code: 'EN', short: 'EN', title: 'English' },
                    ] as const
                  )
                    .filter((langBtn) =>
                      (videoState.tracks || []).some(
                        (tr) => String(tr.lang || '').toUpperCase() === langBtn.code
                      )
                    )
                    .map((langBtn) => {
                      const isCurrentLang = activeTrackLangCode === langBtn.code;
                      return (
                        <button
                          key={langBtn.code}
                          type="button"
                          onClick={() => handleQuickLanguageSwitch(langBtn.code)}
                          title={langBtn.title}
                          className={`min-h-[34px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all ${
                            isCurrentLang
                              ? 'bg-[#9146FF] text-white shadow-sm'
                              : 'text-zinc-200 hover:bg-white/10'
                          }`}
                        >
                          <span>{langBtn.short}</span>
                        </button>
                      );
                    })}
                </div>
              ) : videoState.isLive && videoState.tracks.length > 1 ? (
                <div className="flex items-center gap-1 bg-[#26262C]/80 p-1 rounded-2xl border border-white/[0.08]">
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
                        className={`min-h-10 px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer active:scale-95 transition-all inline-flex items-center gap-1.5 ${
                          active
                            ? 'bg-[#9146FF] text-white shadow-sm'
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
                  <Radio
                    className={`w-3.5 h-3.5 shrink-0 ${
                      videoState.isLive ? 'text-[#EB0400]' : 'text-[#9146FF]'
                    }`}
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
                      <Play className="w-3 h-3 fill-current shrink-0" />
                      <span>Reproducir en ventana</span>
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
                      <span>
                        {pickLang(lang, {
                          es: 'Cloud Sin Anuncios',
                          ca: 'Cloud Sense Anuncis',
                          en: 'Ad-Free Cloud',
                        })}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right: Solo Mando (if TV connected) + Cast TV + Chat + Ajustes */}
            <div className="flex items-center gap-2 shrink-0">

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
                <Cast className="w-3.5 h-3.5 shrink-0" />
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
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <PhoneCall className="w-3.5 h-3.5 shrink-0" />
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
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-200" />
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
              <Volume2 className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
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
              <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
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
