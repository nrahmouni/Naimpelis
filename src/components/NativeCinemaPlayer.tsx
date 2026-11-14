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
  PictureInPicture2,
  Tv,
  Film,
  Trophy,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Radio,
  SkipForward,
  Youtube,
  Moon,
  Sun,
  SlidersHorizontal,
  Subtitles,
  Upload,
  Check,
  MessageSquare,
  Send,
  Globe,
  AudioLines,
  Settings2,
  ExternalLink,
} from 'lucide-react';
import {
  AppLanguage,
  ChatMessage,
  CloudBrowserState,
  FloatingReaction,
  LanguageNoticePopup,
  SecondaryStreamState,
  SubtitleTrackItem,
  TvRemoteCommandType,
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

interface YouTubePlayerInstance {
  unMute?: () => void;
  mute?: () => void;
  isMuted?: () => boolean;
  setVolume?: (volume: number) => void;
  getVolume?: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  setPlaybackRate?: (rate: number) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  loadVideoById?: (videoId: string, startSeconds?: number) => void;
  destroy?: () => void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayerInstance;
  data: number;
}

interface YouTubeNamespace {
  Player: new (
    elementId: string,
    config: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: YouTubePlayerEvent) => void;
        onStateChange?: (e: YouTubePlayerEvent) => void;
      };
    }
  ) => YouTubePlayerInstance;
}

interface CastSessionLike {
  getCastDevice?: () => { friendlyName?: string };
  endSession?: (stopCasting: boolean) => void;
  loadMedia?: (req: unknown) => Promise<unknown>;
}

interface CastContextLike {
  setOptions: (opts: Record<string, unknown>) => void;
  addEventListener: (eventType: string, listener: (ev: { sessionState: string }) => void) => void;
  getCurrentSession: () => CastSessionLike | null;
  requestSession: () => Promise<void>;
}

interface CastNamespace {
  framework?: {
    CastContext: { getInstance: () => CastContextLike };
    CastContextEventType: { SESSION_STATE_CHANGED: string };
    SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string };
  };
}

interface ChromeCastNamespace {
  cast?: {
    AutoJoinPolicy: { ORIGIN_SCOPED: string };
    Image?: new (url: string) => unknown;
    media?: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: string;
      StreamType: { LIVE: string; BUFFERED: string };
      HlsSegmentFormat?: { TS?: string; MPEG2_TS?: string; FMP4: string };
      HlsVideoSegmentFormat?: { MPEG2_TS?: string; FMP4: string };
      MetadataType?: { GENERIC: number };
      GenericMediaMetadata?: new () => { title?: string; subtitle?: string; images?: unknown[] };
      LoadRequest?: new (mediaInfo: unknown) => { autoplay?: boolean; currentTime?: number };
      MediaInfo: new (url: string, contentType: string) => {
        streamType: string;
        hlsSegmentFormat?: string;
        hlsVideoSegmentFormat?: string;
        metadata?: unknown;
      };
    };
  };
}

interface PresentationConnectionLike {
  state?: string;
  close?: () => void;
  terminate?: () => void;
  send?: (data: string) => void;
  addEventListener?: (ev: string, cb: () => void) => void;
}

interface WebKitVideoElement extends HTMLVideoElement {
  autoPictureInPicture?: boolean;
  webkitPresentationMode?: 'inline' | 'picture-in-picture' | 'fullscreen';
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitEnterFullscreen?: () => void;
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}

interface WakeLockSentinelLike {
  release?: () => Promise<void>;
}

interface ScreenOrientationWithLock {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    __naimCastApiReady?: boolean;
    cast?: CastNamespace;
    chrome?: ChromeCastNamespace;
    webkitAudioContext?: typeof AudioContext;
    PresentationRequest?: new (urls: string[]) => {
      start: () => Promise<PresentationConnectionLike>;
    };
  }
}

function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

interface NativeCinemaPlayerProps {
  videoState: VideoState;
  lang: AppLanguage;
  userName: string;
  isExtracting: boolean;
  extractionLabel?: string;
  extractionError?: string | null;
  cloudFrame: string | null;
  cloudState: CloudBrowserState | null;
  floatingReactions: FloatingReaction[];
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onPromoteCloudStreamToNative: (proxiedStreamUrl: string) => void;
  onOpenCatalogSection?: (
    section:
      | 'movies'
      | 'series'
      | 'castellano'
      | 'catala'
      | 'anime'
      | 'tdt'
      | 'sports'
      | 'youtube'
      | 'direct'
  ) => void;
  onNextEpisode?: () => void;
  onProgressUpdate?: (currentTimeSec: number, durationSec: number) => void;
  isCinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  secondaryStream?: SecondaryStreamState | null;
  onSwapSecondaryStream?: () => void;
  onToggleSecondaryLayout?: () => void;
  onCloseSecondaryStream?: () => void;
  canControlRoom?: boolean;
  isMinimized?: boolean;
  isCompressed?: boolean;
  onExpandCompressed?: () => void;
  onToggleMinimize?: () => void;
  onClosePlayer?: () => void;
  isTvMode?: boolean;
  roomCode?: string;
  roomDisplayName?: string;
  participantCount?: number;
  onExitTvMode?: () => void;
  onOpenSmartTvModal?: () => void;
  hasConnectedSmartTv?: boolean;
  onSendTvRemoteCommand?: (cmd: TvRemoteCommandType) => void;
  languageNotice?: LanguageNoticePopup | null;
  onDismissLanguageNotice?: () => void;
  messages?: ChatMessage[];
  currentUserId?: string;
  onSendMessage?: (text: string) => void;
  onSendReaction?: (emoji: string) => void;
  floatingChatOpen?: boolean;
  onToggleFloatingChat?: () => void;
  compactVideoForMobileKeyboard?: boolean;
  onOpenInCloudBrowser?: (url: string) => void;
}

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

  // Google Chromecast & Wireless Cast State
  const [castSdkReady, setCastSdkReady] = useState(false);
  const [isCastingToTv, setIsCastingToTv] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string>('');
  const [playerToast, setPlayerToast] = useState<string | null>(null);
  const [embedRescueDismissedUrl, setEmbedRescueDismissedUrl] = useState<string>('');

  // Local Language Popup State & Floating Chat State
  const [localLangPopup, setLocalLangPopup] = useState<LanguageNoticePopup | null>(null);
  const langPopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [floatingChatDraft, setFloatingChatDraft] = useState('');
  const [recentIncomingChatBubble, setRecentIncomingChatBubble] = useState<ChatMessage | null>(
    null
  );
  const lastSeenMsgIdRef = useRef<string>('');
  const floatingChatEndRef = useRef<HTMLDivElement | null>(null);

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

  // Show incoming chat bubble on video when floatingChatOpen is false
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
      setTimeout(() => {
        floatingChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  }, [floatingChatOpen, messages.length]);

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
    const stallTimer = setTimeout(() => {
      fetch('/api/metrics/qoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'rebuffer_8s_failover',
          title: videoState.title,
          mode: videoState.mode,
          isLive: videoState.isLive,
          activeTrackIndex: videoState.activeTrackIndex,
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
    videoState.mode,
    videoState.title,
    videoState.isLive,
    videoState.tracks.length,
    videoState.activeTrackIndex,
    canControlRoom,
    onSelectTrack,
    currentTime,
    lang,
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
        title: videoState.title || 'NAIM CINE',
        artist: videoState.subtitle || 'NAIM CINE Sala Sincronizada',
        album: 'NAIM CINE',
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

  // ============================================================================
  // DIRECT GOOGLE CHROMECAST + REMOTE PLAYBACK + AIRPLAY ENGINE (VIDEO + AUDIO)
  // ============================================================================
  const getCastPublicOrigin = useCallback(() => {
    if (typeof window === 'undefined') return '';
    if (
      /^ais-dev-/i.test(window.location.hostname || '') &&
      import.meta.env?.VITE_PUBLIC_APP_HOST
    ) {
      return `https://${String(import.meta.env.VITE_PUBLIC_APP_HOST)}`;
    }
    return window.location.origin;
  }, []);

  const buildCastCompatibleStreamUrl = useCallback(
    (rawUrl: string, mode: string) => {
      const publicOrigin = getCastPublicOrigin() || window.location.origin;
      const absUrl = new URL(rawUrl, publicOrigin).href;
      if (mode !== 'hls') {
        try {
          const p = new URL(absUrl);
          if (p.pathname.startsWith('/api/ts-proxy/')) {
            return `${publicOrigin}${p.pathname}${p.search}`;
          }
        } catch {
          // ignore
        }
        return absUrl;
      }
      // Ensure ALL HLS manifests (including same-origin /api/hls-proxy and external CDNs)
      // resolve through a CORS-open public origin URL with &abs=1 so Chromecast CAF
      // (Origin: gstatic.com) and Smart TV decoders receive absolute segment URLs!
      try {
        const parsed = new URL(absUrl);
        if (parsed.pathname.startsWith('/api/hls-proxy')) {
          const sp = new URLSearchParams(parsed.search);
          sp.set('abs', '1');
          return `${publicOrigin}${parsed.pathname}?${sp.toString()}`;
        }
        if (parsed.origin !== publicOrigin) {
          return `${publicOrigin}/api/hls-proxy/stream.m3u8?url=${encodeURIComponent(
            absUrl
          )}&referer=${encodeURIComponent(parsed.origin + '/')}&abs=1`;
        }
      } catch {
        // ignore
      }
      return absUrl;
    },
    [getCastPublicOrigin]
  );

  const syncBridgeVideoSource = useCallback(() => {
    const bridgeVid = castBridgeVideoRef.current;
    const mainVid = videoRef.current;
    if (
      !bridgeVid ||
      (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
      !videoState.url
    ) {
      return '';
    }
    try {
      const absUrl = buildCastCompatibleStreamUrl(videoState.url, videoState.mode);
      if (bridgeVid.getAttribute('src') !== absUrl) {
        bridgeVid.setAttribute('src', absUrl);
        bridgeVid.load();
      }
      if (!videoState.isLive && mainVid && mainVid.currentTime > 1) {
        try {
          bridgeVid.currentTime = mainVid.currentTime;
        } catch {
          // ignore
        }
      }
      return absUrl;
    } catch {
      return videoState.url;
    }
  }, [videoState.mode, videoState.url, videoState.isLive, buildCastCompatibleStreamUrl]);

  const switchMainVideoToDirectCastUrl = useCallback(() => {
    const mainVid = videoRef.current;
    if (
      !mainVid ||
      (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
      !videoState.url
    ) {
      return;
    }
    try {
      const absUrl = buildCastCompatibleStreamUrl(videoState.url, videoState.mode);
      const savedTime = !videoState.isLive ? mainVid.currentTime || videoState.currentTime || 0 : 0;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mainVid.getAttribute('src') !== absUrl) {
        mainVid.setAttribute('src', absUrl);
        mainVid.load();
        if (savedTime > 1) {
          mainVid.addEventListener(
            'loadedmetadata',
            () => {
              try {
                mainVid.currentTime = savedTime;
              } catch {
                // ignore
              }
            },
            { once: true }
          );
        }
      }
    } catch {
      // ignore
    }
  }, [
    videoState.mode,
    videoState.url,
    videoState.isLive,
    videoState.currentTime,
    buildCastCompatibleStreamUrl,
  ]);

  const loadStreamIntoCastSession = useCallback(
    async (session: CastSessionLike | null): Promise<boolean> => {
      if (
        !session ||
        !window.chrome?.cast?.media ||
        (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
        !videoState.url
      ) {
        return false;
      }

      const absoluteStreamUrl = buildCastCompatibleStreamUrl(videoState.url, videoState.mode);
      const contentType =
        videoState.mode === 'direct' ? 'video/mp4' : 'application/x-mpegurl';
      const mediaInfo = new window.chrome.cast.media.MediaInfo(
        absoluteStreamUrl,
        contentType
      );

      mediaInfo.streamType = videoState.isLive
        ? window.chrome.cast.media.StreamType.LIVE
        : window.chrome.cast.media.StreamType.BUFFERED;

      if (videoState.mode === 'hls') {
        const isFmp4 = /\.m4s|\.cmfv/i.test(videoState.rawSourceUrl || videoState.url);
        const hlsSegFmt = window.chrome.cast.media.HlsSegmentFormat;
        const hlsVidFmt = window.chrome.cast.media.HlsVideoSegmentFormat;
        if (isFmp4) {
          if (hlsSegFmt?.FMP4) mediaInfo.hlsSegmentFormat = hlsSegFmt.FMP4;
          if (hlsVidFmt?.FMP4) mediaInfo.hlsVideoSegmentFormat = hlsVidFmt.FMP4;
        } else {
          const tsFmt = hlsSegFmt?.TS || hlsSegFmt?.MPEG2_TS;
          if (tsFmt) mediaInfo.hlsSegmentFormat = tsFmt;
          if (hlsVidFmt?.MPEG2_TS) mediaInfo.hlsVideoSegmentFormat = hlsVidFmt.MPEG2_TS;
        }
      }

      if (window.chrome.cast.media.GenericMediaMetadata) {
        const metadata = new window.chrome.cast.media.GenericMediaMetadata();
        metadata.title = videoState.title || 'NAIM CINE';
        metadata.subtitle =
          videoState.subtitle || (videoState.isLive ? 'TV en Directo HD' : 'Proyección Directa 1080p');
        if (videoState.poster && /^https?:\/\//i.test(videoState.poster) && window.chrome.cast.Image) {
          metadata.images = [new window.chrome.cast.Image(videoState.poster)];
        }
        mediaInfo.metadata = metadata;
      }

      if (!window.chrome.cast.media.LoadRequest || !session.loadMedia) return false;
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      // Never set currentTime = 0 on LIVE HLS streams (avoids seeking outside live sliding window)
      if (!videoState.isLive) {
        request.currentTime = Math.floor(
          videoRef.current?.currentTime || videoState.currentTime || 0
        );
      }

      await session.loadMedia(request);

      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.pause();
        setIsMuted(true);
      }
      const friendlyName = session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
      setCastDeviceName(friendlyName);
      setIsCastingToTv(true);
      showTransientToast(`✓ Transmitiendo Vídeo + Audio en ${friendlyName}`);
      return true;
    },
    [
      videoState.mode,
      videoState.url,
      videoState.rawSourceUrl,
      videoState.isLive,
      videoState.title,
      videoState.subtitle,
      videoState.poster,
      videoState.currentTime,
      showTransientToast,
      buildCastCompatibleStreamUrl,
    ]
  );

  useEffect(() => {
    const initCastFramework = () => {
      if (!window.cast?.framework || !window.chrome?.cast) return;
      try {
        const context = window.cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: window.chrome.cast.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845',
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        setCastSdkReady(true);

        context.addEventListener(
          window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: { sessionState: string }) => {
            const state = event.sessionState;
            const SESSION_STARTED = window.cast?.framework?.SessionState.SESSION_STARTED;
            const SESSION_RESUMED = window.cast?.framework?.SessionState.SESSION_RESUMED;
            const SESSION_ENDED = window.cast?.framework?.SessionState.SESSION_ENDED;

            if (state === SESSION_STARTED || state === SESSION_RESUMED) {
              const session = context.getCurrentSession();
              setCastDeviceName(
                session?.getCastDevice?.()?.friendlyName || 'Chromecast TV'
              );
              setIsCastingToTv(true);
            } else if (state === SESSION_ENDED) {
              setIsCastingToTv(false);
              setCastDeviceName('');
              if (videoRef.current) {
                videoRef.current.muted = false;
                setIsMuted(false);
                if (videoState.isPlaying) {
                  videoRef.current.play().catch(() => {});
                }
              }
            }
          }
        );
      } catch {
        // ignore if inside restricted sandbox
      }
    };

    if ((window.cast?.framework && window.chrome?.cast) || window.__naimCastApiReady) {
      initCastFramework();
    }
    const onCastReady = () => initCastFramework();
    window.addEventListener('naim-cast-api-ready', onCastReady);
    const prevCallback = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (typeof prevCallback === 'function') prevCallback(isAvailable);
      if (isAvailable) initCastFramework();
    };
    return () => {
      window.removeEventListener('naim-cast-api-ready', onCastReady);
    };
  }, [videoState.isPlaying]);

  // Listen to native W3C RemotePlayback & Apple AirPlay 2 state on both video elements
  useEffect(() => {
    const bridgeVid = castBridgeVideoRef.current as WebKitVideoElement | null;
    const mainVid = videoRef.current as WebKitVideoElement | null;

    const onRemoteConnect = (ev?: Event) => {
      setIsCastingToTv(true);
      setCastDeviceName('Smart TV (Cast Directo)');
      // If mainVid was connected while using Hls.js blob:, switch it to direct HTTP URL so TV gets video + audio!
      if (ev?.currentTarget === mainVid && hlsRef.current && mainVid) {
        switchMainVideoToDirectCastUrl();
        mainVid.muted = false;
        mainVid.play?.().catch(() => {});
      } else if (bridgeVid && bridgeVid.getAttribute('src')) {
        if (mainVid) {
          mainVid.muted = true;
          setIsMuted(true);
        }
        try {
          if (!videoState.isLive && (mainVid?.currentTime ?? 0) > 1 && mainVid) {
            bridgeVid.currentTime = mainVid.currentTime;
          }
          bridgeVid.muted = false;
          bridgeVid.play?.().catch(() => {});
        } catch {
          // ignore
        }
      }
      showTransientToast('✓ Transmitiendo Vídeo + Audio en tu Smart TV');
    };

    const onRemoteDisconnect = () => {
      setIsCastingToTv(false);
      setCastDeviceName('');
      if (bridgeVid) {
        try {
          bridgeVid.pause?.();
        } catch {
          // ignore
        }
      }
      if (mainVid) {
        mainVid.muted = false;
        setIsMuted(false);
      }
    };

    const onWebkitWirelessChange = (e: Event) => {
      const target = e.currentTarget as WebKitVideoElement | null;
      if (target?.webkitCurrentPlaybackTargetIsWireless) {
        if (target === mainVid && hlsRef.current) {
          switchMainVideoToDirectCastUrl();
        }
        target.muted = false;
        target.play?.().catch(() => {});
        setIsCastingToTv(true);
        setCastDeviceName('AirPlay TV');
        showTransientToast('✓ Transmitiendo Vídeo + Audio por AirPlay 2 en tu TV');
      } else {
        setIsCastingToTv(false);
        setCastDeviceName('');
      }
    };

    try {
      bridgeVid?.remote?.addEventListener?.('connect', onRemoteConnect);
      bridgeVid?.remote?.addEventListener?.('disconnect', onRemoteDisconnect);
      mainVid?.remote?.addEventListener?.('connect', onRemoteConnect);
      mainVid?.remote?.addEventListener?.('disconnect', onRemoteDisconnect);
      bridgeVid?.addEventListener?.(
        'webkitcurrentplaybacktargetiswirelesschanged',
        onWebkitWirelessChange
      );
      mainVid?.addEventListener?.(
        'webkitcurrentplaybacktargetiswirelesschanged',
        onWebkitWirelessChange
      );
    } catch {
      // ignore
    }

    return () => {
      try {
        bridgeVid?.remote?.removeEventListener?.('connect', onRemoteConnect);
        bridgeVid?.remote?.removeEventListener?.('disconnect', onRemoteDisconnect);
        mainVid?.remote?.removeEventListener?.('connect', onRemoteConnect);
        mainVid?.remote?.removeEventListener?.('disconnect', onRemoteDisconnect);
        bridgeVid?.removeEventListener?.(
          'webkitcurrentplaybacktargetiswirelesschanged',
          onWebkitWirelessChange
        );
        mainVid?.removeEventListener?.(
          'webkitcurrentplaybacktargetiswirelesschanged',
          onWebkitWirelessChange
        );
      } catch {
        // ignore
      }
    };
  }, [videoState.isLive, showTransientToast, switchMainVideoToDirectCastUrl]);

  // Auto-update Chromecast / Bridge media when switching movies/channels while already connected
  useEffect(() => {
    if (!isCastingToTv) return;
    syncBridgeVideoSource();
    if (castSdkReady && window.cast?.framework) {
      const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
      if (session && (videoState.mode === 'hls' || videoState.mode === 'direct') && videoState.url) {
        loadStreamIntoCastSession(session).catch(() => {});
      }
    }
  }, [
    isCastingToTv,
    castSdkReady,
    videoState.url,
    videoState.mode,
    loadStreamIntoCastSession,
    syncBridgeVideoSource,
  ]);

  const handleDirectCastToTv = useCallback(
    async (e?: React.MouseEvent | Event) => {
      if (e && 'stopPropagation' in e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      triggerHaptic('medium');
      const mainVideo = videoRef.current as WebKitVideoElement | null;
      const bridgeVideo = castBridgeVideoRef.current as WebKitVideoElement | null;
      const hasNativeStream =
        (videoState.mode === 'hls' || videoState.mode === 'direct') && Boolean(videoState.url);

      if (hasNativeStream) {
        syncBridgeVideoSource();
      }

      // Path 1: Native Apple AirPlay 2 Picker (iOS / iPadOS / macOS Safari -> Samsung / LG / Apple TV)
      if (hasNativeStream) {
        if (mainVideo?.webkitShowPlaybackTargetPicker) {
          try {
            if (hlsRef.current) {
              switchMainVideoToDirectCastUrl();
            }
            mainVideo.webkitShowPlaybackTargetPicker();
            showTransientToast('Selecciona tu televisor en el menú AirPlay');
            return;
          } catch {
            // fallback to bridgeVideo
          }
        }
        if (bridgeVideo?.webkitShowPlaybackTargetPicker) {
          try {
            bridgeVideo.webkitShowPlaybackTargetPicker();
            showTransientToast('Selecciona tu televisor en el menú AirPlay');
            return;
          } catch {
            // continue to Cast SDK
          }
        }
      }

      // Path 2: Official Google Chromecast CAF SDK (with &abs=1 public HTTPS stream URL)
      if (window.cast?.framework && window.chrome?.cast) {
        try {
          const context = window.cast.framework.CastContext.getInstance();
          const existingSession = context.getCurrentSession();
          if (existingSession && isCastingToTv) {
            existingSession.endSession?.(true);
            setIsCastingToTv(false);
            setCastDeviceName('');
            showTransientToast(
              pickLang(lang, {
                es: 'Transmisión Chromecast finalizada',
                ca: 'Transmissió Chromecast finalitzada',
                en: 'Chromecast disconnected',
              })
            );
            return;
          }

          await context.requestSession();
          const session = context.getCurrentSession();
          if (session) {
            if (hasNativeStream) {
              try {
                await loadStreamIntoCastSession(session);
                return;
              } catch {
                // If Default Media Receiver rejected the manifest (e.g. local dev host unreachable from LAN TV),
                // close the failed session and fall through to Presentation / RemotePlayback / Smart TV!
                session.endSession?.(true);
              }
            } else {
              const friendlyName =
                session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
              setCastDeviceName(friendlyName);
              setIsCastingToTv(true);
              showTransientToast(
                `${pickLang(lang, {
                  es: '✓ Conectado a',
                  ca: '✓ Connectat a',
                  en: '✓ Connected to',
                })} ${friendlyName}`
              );
              return;
            }
          }
        } catch (err: unknown) {
          const errObj = err as { code?: string };
          if (err === 'cancel' || errObj?.code === 'cancel') return;
        }
      }

      // Path 3: W3C PresentationRequest -> Direct Chrome/Android TV device picker opening the Room TV URL
      if (typeof window !== 'undefined' && window.PresentationRequest) {
        try {
          const castOrigin = getCastPublicOrigin() || window.location.origin;
          const targetTvUrl = roomCode
            ? `${castOrigin}/${encodeURIComponent(roomCode)}?tv=1`
            : `${castOrigin}/tv`;
          const presentationReq = new window.PresentationRequest([targetTvUrl]);
          const conn = await presentationReq.start();
          setIsCastingToTv(true);
          setCastDeviceName('Smart TV (Cast)');
          conn.addEventListener?.('terminate', () => {
            setIsCastingToTv(false);
            setCastDeviceName('');
          });
          conn.addEventListener?.('close', () => {
            setIsCastingToTv(false);
            setCastDeviceName('');
          });
          showTransientToast(
            pickLang(lang, {
              es: '✓ Pantalla enviada directamente a tu Smart TV',
              ca: '✓ Pantalla enviada directament a la teva Smart TV',
              en: '✓ Screen sent directly to your Smart TV',
            })
          );
          return;
        } catch (err: unknown) {
          const errObj = err as { name?: string };
          if (errObj?.name === 'AbortError' || errObj?.name === 'NotAllowedError') {
            return;
          }
        }
      }

      // Path 4: W3C HTML5 RemotePlayback API using Direct HTTP URL
      if (hasNativeStream) {
        if (bridgeVideo?.remote?.prompt) {
          try {
            syncBridgeVideoSource();
            await bridgeVideo.remote.prompt();
            if (!videoState.isLive && mainVideo && mainVideo.currentTime > 1) {
              bridgeVideo.currentTime = mainVideo.currentTime;
            }
            bridgeVideo.muted = false;
            await bridgeVideo.play().catch(() => {});
            if (mainVideo) {
              mainVideo.muted = true;
              mainVideo.pause?.();
              setIsMuted(true);
            }
            setIsCastingToTv(true);
            setCastDeviceName('Smart TV (Cast Directo)');
            showTransientToast(
              pickLang(lang, {
                es: '✓ Transmitiendo Vídeo + Audio directamente en tu TV',
                ca: '✓ Transmetent Vídeo + Àudio directament a la teva TV',
                en: '✓ Casting Video + Audio directly to your TV',
              })
            );
            return;
          } catch (err: unknown) {
            const errObj = err as { name?: string };
            if (errObj?.name === 'AbortError' || errObj?.name === 'NotAllowedError') {
              return;
            }
          }
        }

        if (mainVideo?.remote?.prompt) {
          try {
            if (hlsRef.current) {
              switchMainVideoToDirectCastUrl();
            }
            await mainVideo.remote.prompt();
            mainVideo.muted = false;
            await mainVideo.play?.().catch(() => {});
            setIsCastingToTv(true);
            setCastDeviceName('Smart TV (Cast Directo)');
            showTransientToast(
              pickLang(lang, {
                es: '✓ Transmitiendo Vídeo + Audio directamente en tu TV',
                ca: '✓ Transmetent Vídeo + Àudio directament a la teva TV',
                en: '✓ Casting Video + Audio directly to your TV',
              })
            );
            return;
          } catch (err: unknown) {
            const errObj = err as { name?: string };
            if (errObj?.name === 'AbortError' || errObj?.name === 'NotAllowedError') {
              return;
            }
          }
        }
      }

      // Path 5: Already-Paired Smart TV in Room -> Instant sync + Battery-saver Remote toggle
      if (hasConnectedSmartTv) {
        onSendTvRemoteCommand?.('reload_tv');
        setBatterySaverTvMode((v) => !v);
        showTransientToast(
          pickLang(lang, {
            es: '✓ Sincronizado directamente en tu Smart TV vinculada',
            ca: '✓ Sincronitzat directament a la teva Smart TV vinculada',
            en: '✓ Synced directly on your paired Smart TV',
          })
        );
        return;
      }

      // Path 6: Universal Smart TV Hub (4-Digit Code / QR / Smart View)
      if (onOpenSmartTvModal) {
        showTransientToast(
          hasNativeStream
            ? pickLang(lang, {
                es: 'Conecta tu Smart TV en 1 toque o con código de 4 dígitos',
                ca: 'Connecta la teva Smart TV en 1 toc o amb codi de 4 dígits',
                en: 'Connect your Smart TV in 1 tap or with a 4-digit code',
              })
            : pickLang(lang, {
                es: 'Elige una película o conecta tu TV con 4 dígitos',
                ca: 'Tria una pel·lícula o connecta la teva TV amb 4 dígits',
                en: 'Pick a movie or pair your TV with 4 digits',
              })
        );
        onOpenSmartTvModal();
        return;
      }

      showTransientToast(
        pickLang(lang, {
          es: 'Usa el botón Smart TV arriba para conectar tu TV con 4 dígitos o AirPlay',
          ca: 'Fes servir el botó Smart TV amunt per connectar la teva TV amb 4 dígits o AirPlay',
          en: 'Use the Smart TV button above to pair your TV with 4 digits or AirPlay',
        })
      );
    },
    [
      videoState.mode,
      videoState.url,
      videoState.isLive,
      isCastingToTv,
      hasConnectedSmartTv,
      roomCode,
      lang,
      getCastPublicOrigin,
      loadStreamIntoCastSession,
      onOpenSmartTvModal,
      onSendTvRemoteCommand,
      showTransientToast,
      syncBridgeVideoSource,
      switchMainVideoToDirectCastUrl,
    ]
  );

  useEffect(() => {
    const onGlobalDirectCast = (ev: Event) => {
      handleDirectCastToTv(ev);
    };
    window.addEventListener('naim-trigger-direct-cast', onGlobalDirectCast);
    return () => {
      window.removeEventListener('naim-trigger-direct-cast', onGlobalDirectCast);
    };
  }, [handleDirectCastToTv]);

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

  // Synchronize remote Play / Pause / Seek
  useEffect(() => {
    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') return;
    const video = videoRef.current;
    if (!video || !videoState.url) return;

    isApplyingRemoteRef.current = true;

    if (!videoState.isLive && Number.isFinite(videoState.currentTime)) {
      const drift = Math.abs((video.currentTime || 0) - videoState.currentTime);
      // Only seek if drift is substantial (> 6 seconds) so minor network jitter never triggers buffering stalls
      if (drift > 6 && video.readyState >= 1) {
        try {
          video.currentTime = videoState.currentTime;
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

    return () => clearTimeout(timer);
  }, [
    videoState.isPlaying,
    videoState.currentTime,
    videoState.lastUpdated,
    videoState.mode,
    videoState.url,
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
    const ytTime = yt.getCurrentTime?.() || 0;
    if (Math.abs(ytTime - videoState.currentTime) > 3) {
      yt.seekTo?.(videoState.currentTime, true);
    }
    if (videoState.isPlaying) {
      yt.playVideo?.();
    } else {
      yt.pauseVideo?.();
    }
    const timer = setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 450);
    return () => clearTimeout(timer);
  }, [
    videoState.isPlaying,
    videoState.currentTime,
    videoState.lastUpdated,
    videoState.mode,
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

  const handleFloatingChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = floatingChatDraft.trim();
    if (!clean || !onSendMessage) return;
    triggerHaptic('light');
    onSendMessage(clean);
    setFloatingChatDraft('');
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

        {/* Incoming Live Chat Message Pill (Bottom-Left over Video when Floating Chat is closed) */}
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

        {/* FLOATING LIVE CHAT OVERLAY DRAWER ON VIDEO (`Chat Flotante`) */}
        {floatingChatOpen && !isMinimized && !isTvMode && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute inset-y-2 right-2 z-45 w-[86%] max-w-[310px] sm:w-[320px] rounded-2xl bg-[#18181B]/88 backdrop-blur-xl border border-white/15 shadow-[0_24px_70px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/10 bg-[#0E0E10]/70 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                <span className="font-display font-bold text-xs text-white truncate">
                  {pickLang(lang, {
                    es: 'Chat Flotante en Vivo',
                    ca: 'Xat Flotant en Directe',
                    en: 'Floating Live Chat',
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleFloatingChat?.()}
                className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-200 cursor-pointer"
                aria-label={pickLang(lang, {
                  es: 'Cerrar chat flotante',
                  ca: 'Tancar xat flotant',
                  en: 'Close floating chat',
                })}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 space-y-2 min-h-0">
              {messages.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-zinc-400">
                  {pickLang(lang, {
                    es: 'Comenta la película aquí sin perder de vista el vídeo.',
                    ca: 'Comenta la pel·lícula aquí sense perdre de vista el vídeo.',
                    en: 'Chat here without losing sight of the video.',
                  })}
                </div>
              ) : (
                messages.slice(-30).map((msg) => {
                  if (msg.isSystem) {
                    return (
                      <div
                        key={msg.id}
                        className="py-1 px-2 rounded-lg bg-white/[0.05] text-[10px] text-zinc-300 text-center"
                      >
                        {msg.text}
                      </div>
                    );
                  }
                  const isMe = msg.senderId === currentUserId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] font-semibold text-zinc-300 mb-0.5 px-1">
                        {msg.senderName}
                      </span>
                      <div
                        className={`max-w-[88%] px-2.5 py-1.5 rounded-xl text-xs leading-snug break-words ${
                          isMe
                            ? 'bg-[#9146FF] text-white rounded-tr-xs'
                            : 'bg-[#26262C] text-zinc-100 border border-white/10 rounded-tl-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={floatingChatEndRef} />
            </div>

            {onSendReaction && (
              <div className="px-2 py-1 border-t border-white/10 bg-black/40 flex items-center justify-around shrink-0">
                {['🔥', '😂', '⚽', '🍿', '👏', '❤️'].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSendReaction(em);
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center text-sm cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {onSendMessage && (
              <form
                onSubmit={handleFloatingChatSubmit}
                className="p-2 border-t border-white/10 bg-black/60 flex items-center gap-1.5 shrink-0"
              >
                <input
                  type="text"
                  value={floatingChatDraft}
                  onChange={(e) => setFloatingChatDraft(e.target.value)}
                  placeholder={pickLang(lang, {
                    es: 'Escribe sin ocultar el vídeo...',
                    ca: 'Escriu sense amagar el vídeo...',
                    en: 'Type message...',
                  })}
                  maxLength={300}
                  className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-black/75 border border-white/15 focus:border-white/40 text-base sm:text-xs text-white placeholder:text-zinc-400 outline-none"
                />
                <button
                  type="submit"
                  disabled={!floatingChatDraft.trim()}
                  className="w-9 h-9 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-35 flex items-center justify-center text-white shrink-0 cursor-pointer"
                  aria-label={pickLang(lang, {
                    es: 'Enviar mensaje',
                    ca: 'Enviar missatge',
                    en: 'Send message',
                  })}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
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

              {/* 2. Floating Chat Toggle (Fullscreen only — windowed uses below-video strip) */}
              {!isTvMode && (isFullscreen || isHorizontalFullscreen) && onToggleFloatingChat && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    onToggleFloatingChat();
                  }}
                  title="Chat Flotante sobre el vídeo"
                  aria-label="Chat Flotante"
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    floatingChatOpen
                      ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_8px_20px_rgba(145,70,255,0.35)]'
                      : 'bg-[#141418]/75 hover:bg-[#141418]/95 border-white/15 text-zinc-100'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
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
            onPlaying={() => {
              clearBufferingIndicator();
              setLocalPlaying(true);
              setStreamError(null);
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
        {/* UNIVERSAL WEB EMBED STAGE (MULTI-SERVER FALLBACK PLAYER)           */}
        {/* ================================================================== */}
        {videoState.mode === 'embed' && videoState.url && (() => {
          const activeTrackUrl =
            videoState.tracks[videoState.activeTrackIndex]?.sourceUrl || videoState.url;
          const externalVidfastHref = (() => {
            const candidates = [
              activeTrackUrl,
              videoState.rawSourceUrl,
              videoState.url,
              ...videoState.tracks.map((tr) => tr.sourceUrl),
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

          return (
            <div className="relative w-full h-full bg-black">
              <iframe
                key={videoState.url}
                src={videoState.url}
                title={videoState.title || 'Reproductor Web HD'}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; web-share"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full border-0 bg-black"
              />

              {!isMinimized && embedRescueDismissedUrl !== videoState.url && (
                <div className="absolute bottom-2.5 right-2.5 left-2.5 sm:left-auto z-20 flex flex-wrap items-center justify-end gap-1.5 pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#111116]/90 backdrop-blur-md border border-white/15 shadow-xl text-[11px] text-zinc-200 max-w-full overflow-x-auto no-scrollbar">
                    <span className="text-zinc-400 whitespace-nowrap hidden sm:inline">
                      {pickLang(lang, {
                        es: '¿Pantalla negra o lento?',
                        ca: 'Pantalla negra o lent?',
                        en: 'Black screen or slow?',
                      })}
                    </span>

                    {videoState.tracks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          const nextIdx =
                            (videoState.activeTrackIndex + 1) % videoState.tracks.length;
                          onSelectTrack(nextIdx, currentTime);
                        }}
                        className="min-h-7 px-2.5 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-white font-bold whitespace-nowrap cursor-pointer shrink-0 transition-colors"
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
                          es: 'Sin sandbox',
                          ca: 'Sense sandbox',
                          en: 'Open vidfast',
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
          <div
            onWheel={handleCloudWheel}
            className="absolute inset-0 flex flex-col bg-[#0E0E10] z-30"
          >
            <div className="px-2.5 py-2 bg-[#18181B] border-b border-white/[0.08] flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => socketService.sendCloudBrowserInput({ type: 'back' })}
                className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                aria-label={pickLang(lang, { es: 'Atrás', ca: 'Enrere', en: 'Back' })}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => socketService.sendCloudBrowserInput({ type: 'reload' })}
                className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                aria-label={pickLang(lang, { es: 'Recargar', ca: 'Recarregar', en: 'Reload' })}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <form
                onSubmit={handleCloudNavigate}
                className="flex-1 min-w-0 flex items-center"
              >
                <input
                  type="text"
                  value={cloudUrlInput}
                  onChange={(e) => setCloudUrlInput(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-[#0E0E10] border border-white/10 focus:border-[#9146FF] text-base sm:text-xs font-mono text-zinc-200 outline-none"
                />
              </form>
              {cloudState?.detectedStreamUrl && (
                <button
                  type="button"
                  onClick={() => onPromoteCloudStreamToNative(cloudState.detectedStreamUrl!)}
                  className="min-h-[36px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.switchNativeHd}</span>
                  <span className="sm:hidden">HD</span>
                </button>
              )}
              {!isTvMode && onToggleCinemaMode && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={isCinemaMode}
                  onClick={onToggleCinemaMode}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer border transition-colors ${
                    isCinemaMode
                      ? 'bg-amber-400/25 border-amber-400/55 text-amber-200'
                      : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/10 text-zinc-200'
                  }`}
                  aria-label={pickLang(lang, {
                    es: 'Modo Cine',
                    ca: 'Mode Cinema',
                    en: 'Cinema Mode',
                  })}
                >
                  {isCinemaMode ? (
                    <Sun className="w-4 h-4 text-amber-300" />
                  ) : (
                    <Moon className="w-4 h-4 text-amber-300" />
                  )}
                </button>
              )}
              {onClosePlayer && (
                <button
                  type="button"
                  onClick={onClosePlayer}
                  className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-rose-600 flex items-center justify-center text-zinc-200 shrink-0 cursor-pointer"
                  aria-label={pickLang(lang, {
                    es: 'Cerrar navegador',
                    ca: 'Tancar navegador',
                    en: 'Close browser',
                  })}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
              {cloudFrame ? (
                <img
                  src={cloudFrame}
                  alt="Isolated Cloud Session"
                  onClick={handleCloudCanvasClick}
                  className="w-full h-full object-contain cursor-pointer"
                />
              ) : cloudState && !cloudState.isLoading ? (
                <div className="relative w-full h-full bg-black">
                  <iframe
                    key={cloudState.url || videoState.url}
                    src={cloudState.url || videoState.url}
                    title={cloudState.title || 'Reproductor Web HD'}
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; web-share"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    className="w-full h-full border-0 bg-black"
                  />
                  <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1.5">
                    {cloudState.detectedStreamUrl && (
                      <button
                        type="button"
                        onClick={() => onPromoteCloudStreamToNative(cloudState.detectedStreamUrl!)}
                        className="min-h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-xl cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{t.switchNativeHd}</span>
                      </button>
                    )}
                    <a
                      href={cloudState.url || videoState.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-8 px-3 rounded-xl bg-[#111116]/90 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-xl"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Sin sandbox',
                          ca: 'Sense sandbox',
                          en: 'Open directly',
                        })}
                      </span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400 p-4 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#9146FF]" />
                  <span className="text-xs">
                    {pickLang(lang, {
                      es: 'Iniciando navegador aislado sin ventanas emergentes...',
                      ca: 'Iniciant navegador aïllat sense finestres emergents...',
                      en: 'Starting isolated popup-free browser...',
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
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
                className={`h-6 flex items-center px-1 mb-0.5 ${
                  showControls ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
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
                  className="w-full cinema-range"
                />
              </div>
            )}

            <div
              onClick={(e) => e.stopPropagation()}
              className={`flex items-center justify-between gap-1.5 ${
                showControls ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {/* Left Cluster: Play/Pause + Mute/Volume + Timecode */}
              <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer shrink-0"
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
                    className="min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
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
                  <div className="text-[11px] sm:text-xs font-mono tabular-nums text-zinc-200 pl-0.5 whitespace-nowrap truncate">
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
                      className={`min-h-[40px] px-2.5 rounded-2xl text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                        activeHudMenu === 'quality'
                          ? 'bg-[#9146FF] text-white'
                          : 'bg-white/10 hover:bg-white/18 text-zinc-100'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {selectedQuality === -1
                          ? autoActiveHeight
                            ? `${t.qualityAuto} · ${autoActiveHeight}p`
                            : t.qualityAuto
                          : `${qualityLevels.find((q) => q.index === selectedQuality)?.height || ''}p`}
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
                  className={`min-h-[42px] min-w-[42px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
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
                  className="min-h-[42px] min-w-[42px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
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
                        : tr.label.split('·')[0].trim() || `${pickLang(lang, { es: 'Opción', ca: 'Opció', en: 'Option' })} ${idx + 1}`;
                    return (
                      <button
                        key={tr.id || idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectTrack(idx, currentTime);
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
                      { code: 'ES', short: '🇪🇸 ES', title: 'Castellano' },
                      { code: 'LAT', short: '🇲🇽 LAT', title: 'Latino' },
                      { code: 'VOSE', short: '💬 VOSE', title: 'VOSE' },
                      { code: 'EN', short: '🇬🇧 EN', title: 'English' },
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
                    return (
                      <button
                        key={tr.id || idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectTrack(idx, 0);
                        }}
                        className={`min-h-[34px] px-2.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer active:scale-95 transition-all ${
                          active
                            ? 'bg-[#9146FF] text-white shadow-sm'
                            : 'text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {tr.label || `${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} ${idx + 1}`}
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

            {/* Right: Siguiente + Solo Mando (if TV connected) + Cast TV + Chat + Ajustes */}
            <div className="flex items-center gap-2 shrink-0">
              {videoState.seriesMeta && onNextEpisode && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onNextEpisode();
                  }}
                  className="min-h-[38px] px-3.5 rounded-2xl bg-[#9146FF] text-white hover:bg-[#772CE8] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Siguiente', ca: 'Següent', en: 'Next' })}</span>
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
                <Cast className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isCastingToTv
                    ? pickLang(lang, { es: 'Transmitiendo', ca: 'Transmetent', en: 'Casting' })
                    : 'Cast TV'}
                </span>
              </button>

              {onToggleFloatingChat && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onToggleFloatingChat();
                  }}
                  className={`min-h-[38px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                    floatingChatOpen
                      ? 'bg-[#9146FF] text-white border-[#9146FF]'
                      : 'bg-[#26262C] hover:bg-white/[0.12] text-zinc-200 border-white/[0.09]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.tabChat}</span>
                </button>
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

      {/* ==================================================================== */}
      {/* AJUSTES DE REPRODUCCIÓN (UNIFIED BOTTOM SHEET — NO DUPLICATE CAST)   */}
      {/* ==================================================================== */}
      {showProMenu && (
        <div
          className="fixed inset-0 z-[195] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
          onClick={() => setShowProMenu(false)}
        >
          <div
            ref={proMenuRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="naim-player-pro-settings-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.12] shadow-[0_-20px_70px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col max-h-[86dvh] animate-sheet-up outline-none"
          >
            <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
              <div className="w-10 h-1.5 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/35 flex items-center justify-center text-[#BF94FF]">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="naim-player-pro-settings-title" className="text-base font-bold text-white tracking-tight">
                    {pickLang(lang, {
                      es: 'Ajustes de Reproducción',
                      ca: 'Ajustos de Reproducció',
                      en: 'Playback Settings',
                    })}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {pickLang(lang, {
                      es: 'Calidad, Audio, Subtítulos, Modo Cine y Velocidad',
                      ca: 'Qualitat, Àudio, Subtítols, Mode Cinema i Velocitat',
                      en: 'Quality, Audio, Subtitles, Cinema Mode & Speed',
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProMenu(false)}
                className="min-h-[44px] min-w-[44px] rounded-2xl hover:bg-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                aria-label={t.closeModal}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* 1. Primary Viewing Modes: Modo Cine & PiP Flotante */}
              <div className="grid grid-cols-2 gap-2.5">
                {onToggleCinemaMode && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onToggleCinemaMode();
                    }}
                    className={`min-h-[64px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      isCinemaMode
                        ? 'bg-amber-400/20 border-amber-400/50 text-amber-200'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
                    }`}
                  >
                    {isCinemaMode ? (
                      <Sun className="w-5 h-5 text-amber-300" />
                    ) : (
                      <Moon className="w-5 h-5 text-amber-300" />
                    )}
                    <span>{pickLang(lang, { es: 'Modo Cine', ca: 'Mode Cinema', en: 'Cinema Mode' })}</span>
                  </button>
                )}

                {canUseNativePiPOrCast && (
                  <button
                    type="button"
                    onClick={(e) => {
                      handleTogglePiP(e);
                      setShowProMenu(false);
                    }}
                    className={`min-h-[64px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      isInPiP
                        ? 'bg-[#9146FF]/25 border-[#9146FF]/60 text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
                    }`}
                  >
                    <PictureInPicture2 className="w-5 h-5 text-sky-400" />
                    <span>{pickLang(lang, { es: 'PiP Flotante', ca: 'PiP Flotant', en: 'Floating PiP' })}</span>
                  </button>
                )}
              </div>

              {/* 2. Audio / Language, Embedded Audio Track & Server Selector */}
              {(videoState.tracks.length > 0 || hlsAudioTracks.length > 0 || !videoState.isLive) && (
                <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/[0.08] space-y-3">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#9146FF]" />
                    <span>
                      {pickLang(lang, {
                        es: 'Idioma de Audio y Servidor',
                        ca: 'Idioma d’Àudio i Servidor',
                        en: 'Audio Language & Server',
                      })}
                    </span>
                  </div>

                  {!videoState.isLive &&
                    (videoState.tracks || []).some((tr) =>
                      ['ES', 'LAT', 'VOSE', 'EN'].includes(String(tr.lang || '').toUpperCase())
                    ) && (
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { code: 'ES', label: '🇪🇸 Castellano' },
                            { code: 'LAT', label: '🇲🇽 Latino' },
                            { code: 'VOSE', label: '💬 VOSE' },
                            { code: 'EN', label: '🇬🇧 English' },
                          ] as const
                        )
                          .filter((lBtn) =>
                            (videoState.tracks || []).some(
                              (tr) => String(tr.lang || '').toUpperCase() === lBtn.code
                            )
                          )
                          .map((lBtn) => {
                            const isCurrent = activeTrackLangCode === lBtn.code;
                            return (
                              <button
                                key={lBtn.code}
                                type="button"
                                onClick={() => {
                                  handleQuickLanguageSwitch(lBtn.code);
                                  setShowProMenu(false);
                                }}
                                className={`flex-1 min-w-[110px] min-h-[42px] px-3 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                                  isCurrent
                                    ? 'bg-[#9146FF] border-[#9146FF] text-white'
                                    : 'bg-[#26262C] hover:bg-white/[0.12] border-white/[0.08] text-zinc-200'
                                }`}
                              >
                                {lBtn.label}
                              </button>
                            );
                          })}
                      </div>
                    )}

                  {hlsAudioTracks.length > 0 && (
                    <div className="space-y-1.5">
                      <label htmlFor="naim-hls-audio-select" className="block text-[11px] font-semibold text-zinc-400">
                        {t.audioTrackEmbedded}
                      </label>
                      <select
                        id="naim-hls-audio-select"
                        aria-label={t.audioTrackEmbedded}
                        value={selectedHlsAudioTrack}
                        onChange={(e) => handleSelectHlsAudioTrack(Number(e.target.value))}
                        className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#26262C] border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                      >
                        {hlsAudioTracks.map((tr) => (
                          <option key={tr.id} value={tr.id} className="bg-[#18181B]">
                            {tr.name}{tr.lang ? ` (${tr.lang})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {videoState.tracks.length > 1 && (
                    <select
                      aria-label={pickLang(lang, {
                        es: 'Seleccionar servidor o canal',
                        ca: 'Seleccionar servidor o canal',
                        en: 'Select server or channel',
                      })}
                      value={videoState.activeTrackIndex}
                      onChange={(e) => {
                        const nextIdx = Number(e.target.value);
                        const chosen = videoState.tracks[nextIdx];
                        if (chosen) {
                          triggerLocalLanguagePopup({
                            type: 'success',
                            title: pickLang(lang, {
                              es: `Cambiando a: ${chosen.label}`,
                              ca: `Canviant a: ${chosen.label}`,
                              en: `Switching to: ${chosen.label}`,
                            }),
                            subtitle: pickLang(lang, {
                              es: 'Sincronizando señal de audio HD...',
                              ca: 'Sincronitzant senyal d’àudio HD...',
                              en: 'Syncing HD audio stream...',
                            }),
                          });
                        }
                        onSelectTrack(nextIdx, currentTime);
                        setShowProMenu(false);
                      }}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#26262C] border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                    >
                      {videoState.tracks.map((track, idx) => (
                        <option key={track.id || idx} value={idx} className="bg-[#18181B]">
                          {track.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* 3. Subtitles (.SRT / .VTT + Offset + Font Size) */}
              <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Subtitles className="w-4 h-4 text-sky-400" />
                    <span>
                      {pickLang(lang, {
                        es: 'Subtítulos Sincronizados',
                        ca: 'Subtítols Sincronitzats',
                        en: 'Synced Subtitles',
                      })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => subtitleFileInputRef.current?.click()}
                    className="min-h-[36px] px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-xs font-bold text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{pickLang(lang, { es: 'Subir .SRT / .VTT', ca: 'Pujar .SRT / .VTT', en: 'Upload .SRT / .VTT' })}</span>
                  </button>
                </div>

                <select
                  aria-label={pickLang(lang, { es: 'Pista de subtítulos', ca: 'Pista de subtítols', en: 'Subtitle track' })}
                  value={activeSubId}
                  onChange={(e) => handleSelectSubtitleTrack(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#26262C] border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                >
                  <option value="off">
                    {pickLang(lang, {
                      es: 'Subtítulos desactivados',
                      ca: 'Subtítols desactivats',
                      en: 'Subtitles off',
                    })}
                  </option>
                  {subtitleTracks.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>

                {activeSubId !== 'off' && (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSubtitleOffsetSec((s) => Number((s - 0.5).toFixed(1)))
                          }
                          className="min-h-[38px] px-3 rounded-xl bg-white/10 hover:bg-white/20 font-mono text-xs text-white cursor-pointer"
                        >
                          -0.5s
                        </button>
                        <span className="font-mono text-xs text-sky-300 min-w-[48px] text-center">
                          {subtitleOffsetSec >= 0
                            ? `+${subtitleOffsetSec}s`
                            : `${subtitleOffsetSec}s`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSubtitleOffsetSec((s) => Number((s + 0.5).toFixed(1)))
                          }
                          className="min-h-[38px] px-3 rounded-xl bg-white/10 hover:bg-white/20 font-mono text-xs text-white cursor-pointer"
                        >
                          +0.5s
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {(['sm', 'md', 'lg'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSubtitleSize(sz)}
                            className={`min-h-[38px] min-w-[38px] rounded-xl text-xs font-bold uppercase cursor-pointer ${
                              subtitleSize === sz
                                ? 'bg-[#9146FF] text-white'
                                : 'bg-[#26262C] text-zinc-300'
                            }`}
                          >
                            {sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subtitle Studio Style + Font Color */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                      <span>{pickLang(lang, { es: 'Color / Fondo', ca: 'Color / Fons', en: 'Color / Box' })}</span>
                      <div className="flex items-center gap-1.5">
                        {(['#FFFFFF', '#FDE047', '#38BDF8'] as const).map((clr) => (
                          <button
                            key={clr}
                            type="button"
                            onClick={() => setSubtitleStyle({ fontColor: clr })}
                            className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                              subtitleStyle.fontColor === clr ? 'border-white scale-110' : 'border-white/30'
                            }`}
                            style={{ backgroundColor: clr }}
                            aria-label={`${pickLang(lang, { es: 'Color subtítulos', ca: 'Color subtítols', en: 'Subtitle color' })} ${clr}`}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setSubtitleStyle({
                              bgOpacity: subtitleStyle.bgOpacity > 0.4 ? 0 : 0.72,
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-white/10 text-[10px] font-semibold text-white cursor-pointer"
                        >
                          {pickLang(lang, { es: 'Caja', ca: 'Caixa', en: 'Box' })}: {subtitleStyle.bgOpacity > 0.4 ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fine Audio/Sync Offset (±50ms) */}
                {!videoState.isLive && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-xs">
                    <span className="text-zinc-300 font-medium">
                      {pickLang(lang, {
                        es: 'Ajuste fino de sala',
                        ca: 'Ajust fi de sala',
                        en: 'Fine room sync offset',
                      })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSyncOffsetMs(syncOffsetMs - 50)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-mono text-white cursor-pointer"
                      >
                        -50ms
                      </button>
                      <span className="font-mono text-zinc-200 min-w-[54px] text-center">
                        {syncOffsetMs >= 0 ? `+${syncOffsetMs}ms` : `${syncOffsetMs}ms`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSyncOffsetMs(syncOffsetMs + 50)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-mono text-white cursor-pointer"
                      >
                        +50ms
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Cinema Pro Enhancements (Vocal Boost, Ambilight, Quality & Speed) */}
              <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/[0.08] space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={toggleVocalBoost}
                    className={`min-h-[48px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      vocalBoostEnabled
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                    }`}
                  >
                    <span>{pickLang(lang, { es: 'Realce de Voces', ca: 'Realç de Veus', en: 'Vocal Boost' })}</span>
                    <span className="font-mono text-[10px]">
                      {vocalBoostEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAmbilightEnabled((v) => {
                        const next = !v;
                        try {
                          localStorage.setItem('naim_ambilight_v1', String(next));
                        } catch {
                          // ignore
                        }
                        return next;
                      })
                    }
                    className={`min-h-[48px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      ambilightEnabled
                        ? 'bg-[#9146FF]/20 border-[#9146FF]/50 text-white'
                        : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                    }`}
                  >
                    <span>Ambilight Halo</span>
                    <span className="font-mono text-[10px]">
                      {ambilightEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>

                {!videoState.isLive && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-semibold text-zinc-400">
                      {pickLang(lang, {
                        es: 'Velocidad de reproducción',
                        ca: 'Velocitat de reproducció',
                        en: 'Playback speed',
                      })}
                    </span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => handleSelectSpeed(spd)}
                          className={`min-h-[38px] rounded-xl font-mono text-xs font-bold cursor-pointer ${
                            playbackSpeed === spd
                              ? 'bg-[#9146FF] text-white'
                              : 'bg-[#26262C] hover:bg-white/15 text-zinc-300'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {qualityLevels.length > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-zinc-400">
                      {t.qualityLabel}
                    </span>
                    <select
                      aria-label={t.qualityLabel}
                      value={selectedQuality}
                      onChange={(e) => handleChangeQuality(Number(e.target.value))}
                      className="min-h-[38px] px-3 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-white outline-none cursor-pointer"
                    >
                      <option value={-1}>
                        {autoActiveHeight ? `${t.qualityAuto} (${autoActiveHeight}p)` : `${t.qualityAuto} (HD)`}
                      </option>
                      {qualityLevels.map((q) => (
                        <option key={q.index} value={q.index}>
                          {q.height}p
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
