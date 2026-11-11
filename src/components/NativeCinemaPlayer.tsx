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
import { UI_COPY } from '../utils/i18n';
import { socketService } from '../services/socket';
import { triggerHaptic } from '../utils/haptics';
import {
  findActiveSubtitleText,
  ParsedSubtitleCue,
  parseSubtitleText,
} from '../utils/subtitles';
import { SecondaryHlsStage } from './SecondaryHlsStage';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    __naimCastApiReady?: boolean;
    cast?: any;
    chrome?: any;
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
    section: 'movies' | 'series' | 'sports' | 'youtube' | 'direct'
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
  onToggleMinimize?: () => void;
  onClosePlayer?: () => void;
  isTvMode?: boolean;
  roomCode?: string;
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
}

export const NativeCinemaPlayer: React.FC<NativeCinemaPlayerProps> = ({
  videoState,
  lang,
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
  onToggleMinimize,
  onClosePlayer,
  isTvMode = false,
  roomCode,
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
}) => {
  const t = UI_COPY[lang];
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const castBridgeVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = useRef(`yt-stage-${Math.random().toString(36).slice(2, 8)}`);
  const isApplyingRemoteRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);
  const lastProgressEmitRef = useRef<number>(0);

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tvAspectMode, setTvAspectMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [isInPiP, setIsInPiP] = useState(false);
  const [isHorizontalFullscreen, setIsHorizontalFullscreen] = useState(false);
  const [forceLandscapeRotation, setForceLandscapeRotation] = useState(true);
  const [isPortraitViewport, setIsPortraitViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : true
  );
  const [showControls, setShowControls] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<{ index: number; height: number }[]>(
    []
  );
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [cloudUrlInput, setCloudUrlInput] = useState('');
  const [seekRipple, setSeekRipple] = useState<'left' | 'right' | null>(null);

  // Google Chromecast & Wireless Cast State
  const [castSdkReady, setCastSdkReady] = useState(false);
  const [isCastingToTv, setIsCastingToTv] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string>('');
  const [playerToast, setPlayerToast] = useState<string | null>(null);

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
  const [ambilightEnabled, setAmbilightEnabled] = useState<boolean>(true);
  const [vocalBoostEnabled, setVocalBoostEnabled] = useState<boolean>(false);
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

  const scheduleHideControls = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (
        videoState.isPlaying &&
        (videoState.mode === 'hls' || videoState.mode === 'direct')
      ) {
        setShowControls(false);
      }
    }, 3000);
  }, [videoState.isPlaying, videoState.mode]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    const updateViewportOrientation = () => {
      setIsPortraitViewport(window.innerHeight > window.innerWidth);
    };
    const onFsChange = () => {
      const activeFs = Boolean(document.fullscreenElement);
      setIsFullscreen(activeFs);
      if (!activeFs) {
        setIsHorizontalFullscreen(false);
        try {
          (window.screen?.orientation as any)?.unlock?.();
        } catch {
          // ignore
        }
      }
      updateViewportOrientation();
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
        const video = videoRef.current as any;
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
      } else if (cmd === 'disconnect_tv') {
        onExitTvMode?.();
      }
    });
    return () => unsub();
  }, [isTvMode, onExitTvMode, showTransientToast, videoState.url]);

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
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
      showTransientToast(
        next
          ? lang === 'es'
            ? 'Realce de Voces y Modo Noche activado'
            : 'Vocal Boost & Night Mode enabled'
          : lang === 'es'
          ? 'Audio original restaurado'
          : 'Original audio restored'
      );
    } catch {
      setVocalBoostEnabled(false);
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

    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') {
      setSubtitleTracks([]);
      return;
    }

    let detectedTmdbId = videoState.seriesMeta?.tmdbId;
    if (!detectedTmdbId && videoState.rawSourceUrl) {
      const m = videoState.rawSourceUrl.match(/(?:watch|movie|-)\/?(\d{2,9})(?:$|\/)/i);
      if (m) detectedTmdbId = Number(m[1]);
    }
    if (!detectedTmdbId) {
      setSubtitleTracks([]);
      return;
    }

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
          setSubtitleTracks(data.tracks);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [videoState.url, videoState.mode, videoState.rawSourceUrl, videoState.seriesMeta?.tmdbId, videoState.seriesMeta?.season, videoState.seriesMeta?.episode]);

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
          lang === 'es' ? 'No se pudo cargar este subtítulo' : 'Failed to load subtitle'
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
        lang === 'es'
          ? `Subtítulos cargados (${cues.length} líneas)`
          : `Subtitles loaded (${cues.length} cues)`
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
    let wakeLock: any = null;
    const requestLock = async () => {
      try {
        if (localPlaying && 'wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
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

  // ============================================================================
  // PICTURE-IN-PICTURE (SUPERPONER VÍDEO ENCIMA DEL TELÉFONO) + MEDIA SESSION
  // ============================================================================
  useEffect(() => {
    const video = videoRef.current as any;
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
        (navigator.mediaSession as any).setActionHandler(
          'enterpictureinpicture',
          async () => {
            const v = videoRef.current as any;
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

  // ============================================================================
  // DIRECT GOOGLE CHROMECAST + REMOTE PLAYBACK + AIRPLAY ENGINE
  // ============================================================================
  const loadStreamIntoCastSession = useCallback(
    async (session: any) => {
      if (
        !session ||
        !window.chrome?.cast?.media ||
        (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
        !videoState.url
      ) {
        return;
      }

      try {
        const absoluteStreamUrl = new URL(videoState.url, window.location.origin).href;
        const contentType =
          videoState.mode === 'direct' ? 'video/mp4' : 'application/x-mpegurl';
        const mediaInfo = new window.chrome.cast.media.MediaInfo(
          absoluteStreamUrl,
          contentType
        );

        mediaInfo.streamType = videoState.isLive
          ? window.chrome.cast.media.StreamType.LIVE
          : window.chrome.cast.media.StreamType.BUFFERED;

        const metadata = new window.chrome.cast.media.GenericMediaMetadata();
        metadata.title = videoState.title || 'NAIM CINE';
        metadata.subtitle = videoState.subtitle || 'Proyección Directa';
        if (videoState.poster && /^https?:\/\//i.test(videoState.poster)) {
          metadata.images = [new window.chrome.cast.Image(videoState.poster)];
        }
        mediaInfo.metadata = metadata;

        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        request.currentTime = videoState.isLive
          ? 0
          : Math.floor(videoRef.current?.currentTime || videoState.currentTime || 0);

        await session.loadMedia(request);

        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
        }
        const friendlyName = session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
        setCastDeviceName(friendlyName);
        setIsCastingToTv(true);
        showTransientToast(`✓ Transmitiendo en ${friendlyName}`);
      } catch {
        showTransientToast(
          lang === 'es'
            ? '✓ Conectado al televisor, sincronizando señal...'
            : '✓ Connected to TV, syncing stream...'
        );
      }
    },
    [
      videoState.mode,
      videoState.url,
      videoState.isLive,
      videoState.title,
      videoState.subtitle,
      videoState.poster,
      videoState.currentTime,
      lang,
      showTransientToast,
    ]
  );

  useEffect(() => {
    const initCastFramework = () => {
      if (!window.cast?.framework || !window.chrome?.cast) return;
      try {
        const context = window.cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        setCastSdkReady(true);

        context.addEventListener(
          window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: any) => {
            const state = event.sessionState;
            const SESSION_STARTED = window.cast.framework.SessionState.SESSION_STARTED;
            const SESSION_RESUMED = window.cast.framework.SessionState.SESSION_RESUMED;
            const SESSION_ENDED = window.cast.framework.SessionState.SESSION_ENDED;

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
  }, []);

  // Listen to native W3C RemotePlayback & Apple AirPlay 2 state on both video elements
  useEffect(() => {
    const bridgeVid = castBridgeVideoRef.current as any;
    const mainVid = videoRef.current as any;

    const onRemoteConnect = () => {
      setIsCastingToTv(true);
      setCastDeviceName('Smart TV (Cast Directo)');
      if (mainVid) {
        mainVid.muted = true;
        setIsMuted(true);
      }
      if (bridgeVid) {
        try {
          if (!videoState.isLive && mainVid?.currentTime > 1) {
            bridgeVid.currentTime = mainVid.currentTime;
          }
          bridgeVid.muted = false;
          bridgeVid.play?.().catch(() => {});
        } catch {
          // ignore
        }
      }
      showTransientToast('✓ Transmitiendo directamente en tu Smart TV');
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
      const target = e.currentTarget as any;
      if (target?.webkitCurrentPlaybackTargetIsWireless) {
        setIsCastingToTv(true);
        setCastDeviceName('AirPlay TV');
        showTransientToast('✓ Transmitiendo por AirPlay 2 en tu TV');
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
  }, [videoState.isLive, showTransientToast]);

  // Auto-update Chromecast media when switching movies/channels while already connected
  useEffect(() => {
    if (!isCastingToTv || !castSdkReady || !window.cast?.framework) return;
    const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
    if (session && (videoState.mode === 'hls' || videoState.mode === 'direct') && videoState.url) {
      loadStreamIntoCastSession(session);
    }
  }, [isCastingToTv, castSdkReady, videoState.url, videoState.mode, loadStreamIntoCastSession]);

  const handleDirectCastToTv = useCallback(
    async (e?: React.MouseEvent | Event) => {
      if (e && 'stopPropagation' in e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      triggerHaptic('medium');
      const mainVideo = videoRef.current as any;
      const bridgeVideo = castBridgeVideoRef.current as any;
      const hasNativeStream =
        (videoState.mode === 'hls' || videoState.mode === 'direct') && Boolean(videoState.url);

      // Path 1: Native Apple AirPlay 2 Picker (iOS / iPadOS / macOS Safari -> Samsung Smart TV / Apple TV / LG!)
      if (hasNativeStream) {
        if (bridgeVideo?.webkitShowPlaybackTargetPicker) {
          try {
            if (!videoState.isLive && mainVideo?.currentTime > 1) {
              bridgeVideo.currentTime = mainVideo.currentTime;
            }
            bridgeVideo.webkitShowPlaybackTargetPicker();
            showTransientToast('Selecciona tu televisor en el menú AirPlay');
            return;
          } catch {
            // fallback to mainVideo
          }
        }
        if (mainVideo?.webkitShowPlaybackTargetPicker) {
          try {
            mainVideo.webkitShowPlaybackTargetPicker();
            showTransientToast('Selecciona tu televisor en el menú AirPlay');
            return;
          } catch {
            // continue to Cast / RemotePlayback
          }
        }
      }

      // Path 2: Official Google Chromecast SDK (Always request session on demand so Chrome scans for TVs!)
      if (window.cast?.framework && window.chrome?.cast) {
        try {
          const context = window.cast.framework.CastContext.getInstance();
          const existingSession = context.getCurrentSession();
          if (existingSession && isCastingToTv) {
            existingSession.endSession(true);
            setIsCastingToTv(false);
            setCastDeviceName('');
            showTransientToast(
              lang === 'es' ? 'Transmisión Chromecast finalizada' : 'Chromecast disconnected'
            );
            return;
          }

          await context.requestSession();
          const session = context.getCurrentSession();
          if (session) {
            if (hasNativeStream) {
              await loadStreamIntoCastSession(session);
            } else {
              const friendlyName =
                session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
              setCastDeviceName(friendlyName);
              setIsCastingToTv(true);
              showTransientToast(`✓ Conectado a ${friendlyName}`);
            }
            return;
          }
        } catch (err: any) {
          if (err === 'cancel' || err?.code === 'cancel') return;
          // If inside mobile browser where CastContext delegates to W3C RemotePlayback, continue to Path 3
        }
      }

      // Path 3: W3C HTML5 RemotePlayback API using Direct HTTP Bridge Video (Bypasses Hls.js blob: restriction!)
      if (hasNativeStream) {
        if (bridgeVideo?.remote?.prompt) {
          try {
            await bridgeVideo.remote.prompt();
            if (!videoState.isLive && mainVideo?.currentTime > 1) {
              bridgeVideo.currentTime = mainVideo.currentTime;
            }
            bridgeVideo.muted = false;
            await bridgeVideo.play().catch(() => {});
            if (mainVideo) {
              mainVideo.muted = true;
              setIsMuted(true);
            }
            setIsCastingToTv(true);
            setCastDeviceName('Smart TV (Cast Directo)');
            showTransientToast('✓ Transmitiendo directamente en tu TV');
            return;
          } catch (err: any) {
            if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
              return;
            }
          }
        }

        if (mainVideo?.remote?.prompt) {
          try {
            await mainVideo.remote.prompt();
            setIsCastingToTv(true);
            setCastDeviceName('Smart TV (Cast Directo)');
            showTransientToast('✓ Transmitiendo directamente en tu TV');
            return;
          } catch (err: any) {
            if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
              return;
            }
          }
        }
      }

      // Path 4: Universal Smart TV Hub (4-Digit Code / AirPlay / Smart View instructions)
      if (onOpenSmartTvModal) {
        showTransientToast(
          hasNativeStream
            ? 'Abriendo centro de envío directo y Smart TV...'
            : 'Elige una película o conecta tu TV con 4 dígitos'
        );
        onOpenSmartTvModal();
        return;
      }

      showTransientToast(
        lang === 'es'
          ? 'Usa el botón Smart TV arriba para conectar tu TV con 4 dígitos o AirPlay'
          : 'Use the Smart TV button above to pair your TV with 4 digits or AirPlay'
      );
    },
    [
      videoState.mode,
      videoState.url,
      videoState.isLive,
      isCastingToTv,
      lang,
      loadStreamIntoCastSession,
      onOpenSmartTvModal,
      showTransientToast,
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
  // ENGINE 1: NATIVE HTML5 + HLS.JS ENGINE
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
            lang === 'es'
              ? `Reanudando en ${formatTimecode(targetResumeSec)}`
              : `Resuming at ${formatTimecode(targetResumeSec)}`
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

    if (videoState.mode === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startPosition: targetResumeSec > 3 ? targetResumeSec : -1,
          backBufferLength: 60,
          maxBufferLength: 45,
          maxMaxBufferLength: 90,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 4,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 5,
        });
        hlsRef.current = hls;

        hls.loadSource(videoState.url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          setIsBuffering(false);
          const levels = (data.levels || [])
            .map((lvl, idx) => ({ index: idx, height: lvl.height || 0 }))
            .filter((l) => l.height > 0);
          setQualityLevels(levels);
          startPlaybackSafely();
        });

        let mediaRecoveries = 0;
        let networkRecoveries = 0;

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 3) {
            networkRecoveries += 1;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 3) {
            mediaRecoveries += 1;
            hls.recoverMediaError();
          } else {
            setIsBuffering(false);
            setStreamError(
              lang === 'es'
                ? 'La señal actual tardó en responder. Prueba otra pista o canal debajo del reproductor.'
                : 'This stream timed out. Try switching to another track or channel below.'
            );
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
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
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
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
      if (drift > 2.6 && video.readyState >= 1) {
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
        return;
      }

      ytPlayerRef.current = new window.YT.Player(ytContainerId.current, {
        videoId: videoState.url,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: Math.floor(videoState.currentTime || 0),
        },
        events: {
          onReady: (e: any) => {
            if (videoState.isPlaying) {
              e.target.playVideo();
            } else {
              e.target.pauseVideo();
            }
          },
          onStateChange: (e: any) => {
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
    if (isMinimized) {
      onToggleMinimize?.();
      return;
    }

    // Double-tap left/right side on VOD to skip -10s / +10s like Netflix/YouTube
    if (!videoState.isLive && (videoState.mode === 'hls' || videoState.mode === 'direct')) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const side: 'left' | 'right' | null =
        relX < 0.34 ? 'left' : relX > 0.66 ? 'right' : null;
      const now = Date.now();
      if (
        side &&
        lastTapRef.current &&
        lastTapRef.current.side === side &&
        now - lastTapRef.current.time < 310
      ) {
        lastTapRef.current = null;
        handleSeekRelative(side === 'left' ? -10 : 10);
        setSeekRipple(side);
        setTimeout(() => setSeekRipple(null), 550);
        return;
      }
      if (side) {
        lastTapRef.current = { time: now, side };
      }
    }

    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      revealControls();
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
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
    const video = videoRef.current;
    setVolume(val);
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
    const video = videoRef.current as any;

    const currentlyFull = Boolean(document.fullscreenElement) || isHorizontalFullscreen;
    if (currentlyFull) {
      setIsHorizontalFullscreen(false);
      setIsFullscreen(false);
      try {
        (window.screen?.orientation as any)?.unlock?.();
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
      return;
    }

    // Enter Horizontal (Landscape) Fullscreen automatically
    setForceLandscapeRotation(true);
    setIsHorizontalFullscreen(true);
    setIsFullscreen(true);

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
      if ((window.screen?.orientation as any)?.lock) {
        await (window.screen.orientation as any).lock('landscape');
      }
    } catch {
      // When OS portrait lock or browser blocks native lock, our CSS 90deg landscape stage handles it automatically
    }

    showTransientToast(
      lang === 'es'
        ? 'Pantalla completa horizontal activada'
        : 'Landscape fullscreen enabled'
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
      if (nextForce && (window.screen?.orientation as any)?.lock) {
        await (window.screen.orientation as any).lock('landscape');
      } else if (!nextForce && (window.screen?.orientation as any)?.unlock) {
        (window.screen.orientation as any).unlock();
      }
    } catch {
      // ignore
    }
    showTransientToast(
      nextForce
        ? lang === 'es'
          ? 'Vista horizontal (16:9) activada'
          : 'Horizontal view enabled'
        : lang === 'es'
        ? 'Vista vertical activada'
        : 'Vertical view enabled'
    );
  };

  /**
   * Superponer el vídeo encima de otra pantalla del teléfono (Android & iPhone PiP)
   */
  const handleTogglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const video = videoRef.current as any;
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
      if (video.webkitSupportsPresentationMode?.('picture-in-picture')) {
        const nextMode =
          video.webkitPresentationMode === 'picture-in-picture'
            ? 'inline'
            : 'picture-in-picture';
        video.webkitSetPresentationMode(nextMode);
        setIsInPiP(nextMode === 'picture-in-picture');
        return;
      }
      showTransientToast(
        lang === 'es'
          ? 'Tu navegador actual no soporta ventana superpuesta en este formato'
          : 'Floating window is not supported for this stream format'
      );
    } catch {
      showTransientToast(
        lang === 'es'
          ? 'Inicia la reproducción un segundo antes de activar pantalla flotante'
          : 'Play the video first to enable floating PiP window'
      );
    }
  };

  const handleChangeQuality = (levelIndex: number) => {
    setSelectedQuality(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
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
        onMouseMove={revealControls}
        style={
          !isMinimized &&
          (isFullscreen || isHorizontalFullscreen) &&
          forceLandscapeRotation &&
          isPortraitViewport
            ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: '100dvh',
                height: '100dvw',
                maxWidth: '100dvh',
                maxHeight: '100dvw',
                transform: 'translate(-50%, -50%) rotate(90deg)',
                zIndex: 250,
                borderRadius: 0,
              }
            : !isMinimized && (isFullscreen || isHorizontalFullscreen)
            ? {
                position: 'fixed',
                inset: 0,
                width: '100dvw',
                height: '100dvh',
                zIndex: 250,
                borderRadius: 0,
              }
            : undefined
        }
        className={`relative w-full bg-black overflow-hidden select-none transition-all duration-300 ${
          isTvMode || isFullscreen || isHorizontalFullscreen
            ? 'h-full'
            : compactVideoForMobileKeyboard
            ? 'h-[122px] sm:aspect-video'
            : 'aspect-video'
        } ${
          isCinemaMode && !isMinimized && !isTvMode
            ? 'z-50 lg:rounded-2xl ring-1 ring-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* Floating Reactions Layer (Hidden when docked in tiny miniplayer) */}
        {!isMinimized && (
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
          <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-xl bg-[#12141D]/95 border border-white/15 text-xs font-medium text-white shadow-xl text-center max-w-[90%]">
            {playerToast}
          </div>
        )}

        {/* Incoming Live Chat Message Pill (Bottom-Left over Video when Floating Chat is closed) */}
        {recentIncomingChatBubble && !floatingChatOpen && !isMinimized && !isTvMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRecentIncomingChatBubble(null);
              onToggleFloatingChat?.();
            }}
            className="pointer-events-auto absolute bottom-14 left-3 z-35 max-w-[78%] sm:max-w-[320px] px-3 py-2 rounded-2xl bg-black/80 hover:bg-black/90 backdrop-blur-md border border-white/20 shadow-2xl flex items-center gap-2 text-left cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#FB7185] shrink-0" />
            <div className="min-w-0 text-xs">
              <span className="font-bold text-[#FB7185] mr-1.5">
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
            className="pointer-events-auto absolute inset-y-2 right-2 z-45 w-[86%] max-w-[310px] sm:w-[320px] rounded-2xl bg-[#08090E]/84 backdrop-blur-xl border border-white/18 shadow-[0_24px_70px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/10 bg-black/45 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-[#FB7185] shrink-0" />
                <span className="font-display font-bold text-xs text-white truncate">
                  {lang === 'es' ? 'Chat Flotante en Vivo' : 'Floating Live Chat'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleFloatingChat?.()}
                className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-200 cursor-pointer"
                aria-label="Cerrar Chat Flotante"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 space-y-2 min-h-0">
              {messages.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-zinc-400">
                  {lang === 'es'
                    ? 'Comenta la película aquí sin perder de vista el vídeo.'
                    : 'Chat here without losing sight of the video.'}
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
                            ? 'bg-[#E11D48]/90 text-white rounded-tr-xs'
                            : 'bg-black/70 text-zinc-100 border border-white/12 rounded-tl-xs'
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
                  placeholder={lang === 'es' ? 'Escribe sin ocultar el vídeo...' : 'Type message...'}
                  maxLength={300}
                  className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-black/75 border border-white/15 focus:border-white/40 text-base sm:text-xs text-white placeholder:text-zinc-400 outline-none"
                />
                <button
                  type="submit"
                  disabled={!floatingChatDraft.trim()}
                  className="w-9 h-9 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-35 flex items-center justify-center text-white shrink-0 cursor-pointer"
                  aria-label="Enviar mensaje"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        {/* Active Chromecast Banner */}
        {isCastingToTv && !isMinimized && (
          <div className="pointer-events-none absolute inset-0 z-15 bg-[#090A0F]/85 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#38BDF8]/15 border border-[#38BDF8]/40 flex items-center justify-center text-[#38BDF8]">
              <Cast className="w-6 h-6" />
            </div>
            <p className="font-display font-bold text-sm sm:text-base text-white">
              {lang === 'es'
                ? `Transmitiendo en ${castDeviceName || 'tu TV'}`
                : `Casting to ${castDeviceName || 'your TV'}`}
            </p>
            <p className="text-xs text-zinc-400">{videoState.title}</p>
          </div>
        )}

        {/* Top Bar Inside Player: Title + Floating Chat + El Menú Mágico + Close */}
        {!isMinimized && videoState.mode !== 'idle' && videoState.mode !== 'cloud' && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-30 px-3 sm:px-5 pt-3 pb-10 bg-gradient-to-b from-black/90 via-black/45 to-transparent flex items-start justify-between gap-3 transition-opacity duration-300 ${
              showControls || !localPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="min-w-0 pt-1">
              <h2 className="font-display font-bold text-sm sm:text-base text-white truncate drop-shadow">
                {videoState.title}
              </h2>
              {videoState.subtitle && (
                <p className="text-[11px] sm:text-xs text-zinc-300 truncate mt-0.5">
                  {videoState.subtitle}
                </p>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-2 shrink-0">
              {/* 1. 1-TAP DIRECT CAST TO TV BUTTON (Always accessible in top-right of player!) */}
              {!isTvMode && (
                <button
                  type="button"
                  onClick={handleDirectCastToTv}
                  title="Enviar señal directa a TV (Chromecast / AirPlay 2 / Smart TV)"
                  aria-label="Cast Directo a TV"
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    isCastingToTv || hasConnectedSmartTv
                      ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.35)]'
                      : 'bg-black/65 hover:bg-[#E11D48] border-white/20 text-white'
                  }`}
                >
                  <Cast className="w-4 h-4 shrink-0" />
                  <span>{isCastingToTv ? 'En TV' : 'Cast'}</span>
                </button>
              )}

              {/* 2. Floating Chat Toggle (44x44px Touch Target) */}
              {!isTvMode && onToggleFloatingChat && (
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
                      ? 'bg-[#E11D48] border-[#E11D48] text-white shadow-[0_8px_20px_rgba(225,29,72,0.35)]'
                      : 'bg-black/60 hover:bg-black/80 border-white/15 text-zinc-100'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
              )}

              {/* 3. EL MENÚ MÁGICO (Subtítulos, Modo Cine, PiP, Cast, Audio y Cinema Pro) */}
              {!isTvMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('medium');
                    setShowProMenu(true);
                  }}
                  title="Menú Mágico: Subtítulos, Modo Cine, PiP, Cast e Idioma"
                  aria-label="Abrir Menú Mágico"
                  className={`min-h-[44px] min-w-[44px] px-3.5 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    showProMenu ||
                    isCinemaMode ||
                    isInPiP ||
                    isCastingToTv ||
                    vocalBoostEnabled ||
                    activeSubId !== 'off'
                      ? 'bg-[#E11D48]/25 border-[#E11D48]/60 text-white shadow-[0_0_20px_rgba(225,29,72,0.3)]'
                      : 'bg-black/60 hover:bg-black/80 border-white/15 text-white'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-[#FB7185] shrink-0" />
                  <span className="hidden sm:inline">Menú Mágico</span>
                </button>
              )}

              {/* Accessible Fullscreen & Exit buttons when playing in TV Receiver Mode */}
              {isTvMode && (
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="min-h-[44px] px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
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

              {/* 3. Exit Fullscreen or Close Player (44x44px Touch Target) */}
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

        {/* ================================================================== */}
        {/* IDLE STANDBY STAGE                                                 */}
        {/* ================================================================== */}
        {videoState.mode === 'idle' && !isExtracting && !isMinimized && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 sm:p-8 text-center bg-gradient-to-b from-[#12141D] to-[#090A0F]">
            {isTvMode && (
              <div className="mb-4 px-4 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs sm:text-sm font-semibold text-emerald-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {lang === 'es'
                    ? `Smart TV conectada · Sala ${(roomCode || '').toUpperCase()}`
                    : `Smart TV connected · Room ${(roomCode || '').toUpperCase()}`}
                </span>
              </div>
            )}
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-3">
              <Tv className="w-6 h-6 text-[#FB7185]" />
            </div>
            <h3 className="font-display font-semibold text-base sm:text-2xl text-white text-balance">
              {isTvMode
                ? lang === 'es'
                  ? 'Televisor listo para proyectar en 1080p'
                  : 'TV ready to project in 1080p'
                : t.standbyTitle}
            </h3>
            <p className="text-xs sm:text-base text-zinc-400 max-w-lg mt-1.5">
              {isTvMode
                ? lang === 'es'
                  ? 'Elige una película, serie, canal deportivo o vídeo de YouTube desde tu móvil y empezará aquí automáticamente.'
                  : 'Pick any movie, series, live match, or YouTube video on your phone and it will play here automatically.'
                : t.standbySub}
            </p>
            {isTvMode && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="min-h-[46px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer transition-colors shadow-[0_12px_30px_rgba(225,29,72,0.35)]"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize className="w-4 h-4" />
                      <span>{lang === 'es' ? 'Salir Pantalla Completa' : 'Exit Fullscreen'}</span>
                    </>
                  ) : (
                    <>
                      <Maximize className="w-4 h-4" />
                      <span>
                        {lang === 'es'
                          ? 'Poner TV en Pantalla Completa'
                          : 'Enter TV Fullscreen'}
                      </span>
                    </>
                  )}
                </button>

                {onExitTvMode && (
                  <button
                    type="button"
                    onClick={onExitTvMode}
                    className="min-h-[46px] px-5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>
                      {lang === 'es'
                        ? 'Cambiar código o salir de Modo TV'
                        : 'Switch code or exit TV Mode'}
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
                  className="min-h-[44px] px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Film className="w-4 h-4" />
                  <span>{t.tabMovies}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('series')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#191C28] hover:bg-[#232738] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Tv className="w-4 h-4 text-[#FB7185]" />
                  <span>{t.tabSeries}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('sports')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#191C28] hover:bg-[#232738] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>{t.tabSports}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCatalogSection('youtube')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#191C28] hover:bg-[#232738] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Youtube className="w-4 h-4 text-rose-500" />
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
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => {
              setIsBuffering(false);
              setLocalPlaying(true);
              setStreamError(null);
            }}
            onPause={(e) => {
              setLocalPlaying(false);
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

          {/* Hidden Direct HTTP Video Bridge for W3C RemotePlayback & AirPlay 2 (only populated on Cast tap) */}
          <video
            ref={castBridgeVideoRef}
            preload="none"
            playsInline
            muted
            x-webkit-airplay="allow"
            className="sr-only pointer-events-none w-0 h-0 opacity-0"
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
                  showControls || !localPlaying ? 'bottom-16 sm:bottom-20' : 'bottom-4 sm:bottom-7'
                }`}
              >
                <div
                  className={`max-w-[88%] px-3 py-1 rounded-lg bg-black/75 text-white font-medium text-center whitespace-pre-line leading-snug shadow-lg ${sizeClass}`}
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
            className="absolute bottom-16 right-3 sm:bottom-20 sm:right-5 z-35 p-3 rounded-2xl bg-[#10121A]/95 border border-white/20 shadow-2xl flex items-center gap-2.5 backdrop-blur-md"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-[#FB7185]">
                {lang === 'es' ? 'Fin del capítulo' : 'Up next'}
              </div>
              <div className="text-xs font-bold text-white whitespace-nowrap">
                {lang === 'es'
                  ? `Siguiente episodio en ${autoNextCountdown}s…`
                  : `Next episode in ${autoNextCountdown}s…`}
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
              className="min-h-[34px] px-3 rounded-xl bg-white hover:bg-zinc-200 text-[#090A0F] text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5 fill-current" />
              <span>{lang === 'es' ? 'Ver ya' : 'Play now'}</span>
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
                showControls || !localPlaying ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {!videoState.isLive && (
                <button
                  type="button"
                  disabled={!showControls && localPlaying}
                  onClick={(e) => handleSeekRelative(-10, e)}
                  aria-label="Retroceder 10 segundos"
                  className={` relative z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center text-white shadow-xl active:scale-90 transition-all cursor-pointer ${
                    showControls || !localPlaying ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="text-[9px] font-bold tracking-tighter -mt-0.5">-10s</span>
                </button>
              )}

              <button
                type="button"
                disabled={!showControls && localPlaying}
                onClick={(e) => handleTogglePlay(e)}
                aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
                className={`relative z-40 w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-black/70 hover:bg-[#E11D48] backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all cursor-pointer ${
                  showControls || !localPlaying ? 'pointer-events-auto' : 'pointer-events-none'
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
                  disabled={!showControls && localPlaying}
                  onClick={(e) => handleSeekRelative(10, e)}
                  aria-label="Avanzar 10 segundos"
                  className={`relative z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center text-white shadow-xl active:scale-90 transition-all cursor-pointer ${
                    showControls || !localPlaying ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="text-[9px] font-bold tracking-tighter -mt-0.5">+10s</span>
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
            {/* Modo Cine, Minimize & Close quick controls on YouTube stage */}
            {!isMinimized &&
              !isTvMode &&
              (onToggleCinemaMode || onToggleMinimize || onClosePlayer) && (
                <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
                  {onToggleCinemaMode && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isCinemaMode}
                      onClick={onToggleCinemaMode}
                      className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        isCinemaMode
                          ? 'bg-amber-400/25 border-amber-400/55 text-amber-200'
                          : 'bg-black/75 hover:bg-black border-white/15 text-white'
                      }`}
                    >
                      {isCinemaMode ? (
                        <Sun className="w-3.5 h-3.5 text-amber-300" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-amber-300" />
                      )}
                      <span className="hidden sm:inline">
                        {lang === 'es' ? 'Modo Cine' : 'Cinema Mode'}
                      </span>
                    </button>
                  )}
                  {onToggleMinimize && (
                    <button
                      type="button"
                      onClick={onToggleMinimize}
                      className="h-9 px-2.5 rounded-xl bg-black/75 hover:bg-black border border-white/15 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {lang === 'es' ? 'Minimizar' : 'Minimize'}
                      </span>
                    </button>
                  )}
                  {onClosePlayer && (
                    <button
                      type="button"
                      onClick={onClosePlayer}
                      aria-label="Cerrar reproductor"
                      className="w-9 h-9 rounded-xl bg-black/75 hover:bg-rose-600 border border-white/15 flex items-center justify-center text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
          </div>
        )}

        {/* ================================================================== */}
        {/* ISOLATED SERVER-SIDE CLOUD BROWSER                                 */}
        {/* ================================================================== */}
        {videoState.mode === 'cloud' && (
          <div
            onWheel={handleCloudWheel}
            className="absolute inset-0 flex flex-col bg-[#090A0F] z-30"
          >
            <div className="px-2.5 py-2 bg-[#12141D] border-b border-white/[0.08] flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => socketService.sendCloudBrowserInput({ type: 'back' })}
                className="w-9 h-9 rounded-xl bg-[#191C28] hover:bg-[#232738] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                aria-label="Atrás"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => socketService.sendCloudBrowserInput({ type: 'reload' })}
                className="w-9 h-9 rounded-xl bg-[#191C28] hover:bg-[#232738] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                aria-label="Recargar"
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
                  className="w-full h-9 px-3 rounded-xl bg-[#090A0F] border border-white/10 text-base sm:text-xs font-mono text-zinc-200 outline-none"
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
                      : 'bg-[#191C28] hover:bg-[#232738] border-white/10 text-zinc-200'
                  }`}
                  aria-label="Modo Cine"
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
                  className="w-9 h-9 rounded-xl bg-[#191C28] hover:bg-rose-600 flex items-center justify-center text-zinc-200 shrink-0 cursor-pointer"
                  aria-label="Cerrar navegador"
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
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400 p-4 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#E11D48]" />
                  <span className="text-xs">
                    Iniciando navegador aislado sin ventanas emergentes...
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* BUFFERING / EXTRACTION / ERROR OVERLAYS                            */}
        {/* ================================================================== */}
        {(isExtracting ||
          (isBuffering && (videoState.mode === 'hls' || videoState.mode === 'direct'))) && (
          <div className="pointer-events-none absolute inset-0 z-25 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
            <Loader2 className="w-7 h-7 sm:w-9 sm:h-9 animate-spin text-[#E11D48] mb-2" />
            {!isMinimized && (
              <>
                <p className="font-display font-semibold text-xs sm:text-base text-white max-w-md">
                  {isExtracting
                    ? extractionLabel || t.extractingTitle
                    : 'Sincronizando señal HD...'}
                </p>
                {isExtracting && (
                  <p className="text-[11px] sm:text-xs text-zinc-300 mt-1 max-w-sm">
                    {t.extractingSub}
                  </p>
                )}
              </>
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
                className="min-h-[44px] px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar señal</span>
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
                  Probar siguiente canal
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* ZERO-OVERLAP BOTTOM TRANSPORT BAR (3s Inactivity Auto-Hide)        */}
        {/* ================================================================== */}
        {!isMinimized && (videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <div
            className={`pointer-events-none absolute bottom-0 inset-x-0 z-30 px-2.5 sm:px-5 pb-2 sm:pb-3 pt-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent transition-opacity duration-300 ${
              showControls || !localPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Protected Legible Timeline Scrubber */}
            {!videoState.isLive && duration > 0 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`h-6 flex items-center px-1 mb-0.5 ${
                  showControls || !localPlaying ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={1}
                  value={Math.min(currentTime, duration)}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  aria-label="Línea de tiempo"
                  className="w-full cinema-range"
                />
              </div>
            )}

            <div
              onClick={(e) => e.stopPropagation()}
              className={`flex items-center justify-between gap-1.5 ${
                showControls || !localPlaying ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {/* Left Cluster: Play/Pause + Mute/Volume + Timecode */}
              <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer shrink-0"
                  aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
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
                    aria-label="Silenciar"
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
                    aria-label="Volumen"
                    className="hidden md:block w-20 cinema-range"
                  />
                </div>

                {videoState.isLive ? (
                  <div className="flex items-center gap-1.5 pl-1 text-[11px] sm:text-xs font-bold text-white whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-[#E11D48] animate-pulse" />
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

              {/* Right Cluster: Audio Badge + Direct Cast + Rotate Horizontal + Magic Menu + Fullscreen */}
              <div className="flex items-center gap-1 shrink-0">
                {!videoState.isLive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      setShowProMenu(true);
                    }}
                    className="min-h-[38px] px-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                    title="Cambiar idioma, subtítulos o servidor"
                  >
                    <Globe className="w-3.5 h-3.5 text-[#FB7185]" />
                    <span>{activeTrackLangCode || 'ES'}</span>
                  </button>
                )}

                {!isTvMode && (
                  <button
                    type="button"
                    onClick={handleDirectCastToTv}
                    className={`min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                      isCastingToTv || hasConnectedSmartTv
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                        : 'hover:bg-white/12 text-white'
                    }`}
                    title="Cast Directo a TV (Chromecast / AirPlay 2 / Smart TV)"
                    aria-label="Cast Directo a TV"
                  >
                    <Cast className="w-4 h-4" />
                  </button>
                )}

                {!isTvMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      setShowProMenu(true);
                    }}
                    className={`min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                      showProMenu || vocalBoostEnabled || activeSubId !== 'off' || playbackSpeed !== 1
                        ? 'bg-[#E11D48] text-white'
                        : 'hover:bg-white/12 text-zinc-100'
                    }`}
                    title="El Menú Mágico (Subtítulos, Modo Cine, PiP, Cast y Audio)"
                    aria-label="Abrir Menú Mágico"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                )}

                {/* Dedicated 1-Tap Horizontal Rotation Toggle on Mobile/Fullscreen */}
                <button
                  type="button"
                  onClick={handleToggleLandscapeRotation}
                  className={`min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                    (isFullscreen || isHorizontalFullscreen) && forceLandscapeRotation
                      ? 'bg-[#E11D48]/25 text-[#FB7185] border border-[#E11D48]/50'
                      : 'hover:bg-white/12 text-white'
                  }`}
                  title="Girar pantalla en horizontal (16:9)"
                  aria-label="Girar en horizontal"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="min-h-[42px] min-w-[40px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                  title="Pantalla completa horizontal"
                  aria-label="Pantalla completa"
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
      </div>

      {/* ==================================================================== */}
      {/* FLOATING DOCKED MINI-PLAYER CONTROL STRIP (WHEN MINIMIZED)           */}
      {/* ==================================================================== */}
      {isMinimized && (
        <div className="bg-[#0D0D12] border-t border-white/[0.08] px-3 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleMinimize}
            className="min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="font-display font-semibold text-xs text-white truncate">
              {videoState.title}
            </div>
            <div className="text-[10px] text-zinc-400 truncate">
              {lang === 'es' ? 'Toca para ampliar' : 'Tap to expand'}
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {(canUseNativePiPOrCast || videoState.mode === 'youtube') && (
              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-9 h-9 rounded-xl bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
              >
                {localPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>
            )}

            {onToggleMinimize && (
              <button
                type="button"
                onClick={onToggleMinimize}
                className="w-9 h-9 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] flex items-center justify-center text-white cursor-pointer"
                title={lang === 'es' ? 'Ampliar reproductor' : 'Expand player'}
                aria-label="Ampliar reproductor"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}

            {onClosePlayer && (
              <button
                type="button"
                onClick={onClosePlayer}
                className="w-9 h-9 rounded-xl bg-white/[0.08] hover:bg-rose-600 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
                title={lang === 'es' ? 'Cerrar reproductor' : 'Close player'}
                aria-label="Cerrar reproductor"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SLEEK BELOW-VIDEO STRIP: QUICK AUDIO PILLS + MENÚ MÁGICO TRIGGER     */}
      {/* ==================================================================== */}
      {!isTvMode &&
        !isMinimized &&
        !compactVideoForMobileKeyboard &&
        videoState.mode !== 'idle' &&
        videoState.mode !== 'cloud' && (
          <div className="bg-[#08080C] border-t border-white/[0.06] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {/* Left: Fluid Language Pills (Castellano / Latino / VOSE / EN) */}
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              {!videoState.isLive && (videoState.mode === 'hls' || videoState.mode === 'direct') ? (
                <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.08]">
                  {(
                    [
                      { code: 'ES', short: '🇪🇸 ES', title: 'Castellano (España)' },
                      { code: 'LAT', short: '🇲🇽 LAT', title: 'Español Latino' },
                      { code: 'VOSE', short: '💬 VOSE', title: 'Subtitulado VOSE' },
                      { code: 'EN', short: '🇬🇧 EN', title: 'Inglés Original' },
                    ] as const
                  ).map((langBtn) => {
                    const isCurrentLang = activeTrackLangCode === langBtn.code;
                    const isAvailable = (videoState.tracks || []).some(
                      (tr) => String(tr.lang || '').toUpperCase() === langBtn.code
                    );
                    return (
                      <button
                        key={langBtn.code}
                        type="button"
                        onClick={() => handleQuickLanguageSwitch(langBtn.code)}
                        title={langBtn.title}
                        className={`min-h-[34px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all ${
                          isCurrentLang
                            ? 'bg-[#E11D48] text-white shadow-sm'
                            : isAvailable
                            ? 'text-zinc-200 hover:bg-white/10'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                      >
                        <span>{langBtn.short}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <Radio className="w-3.5 h-3.5 text-[#E11D48]" />
                  <span className="truncate max-w-[180px]">
                    {videoState.tracks[videoState.activeTrackIndex]?.label ||
                      (videoState.isLive ? 'Señal en directo' : 'Proyección activa')}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Clean Actions (Siguiente + Cast Directo + Chat Flotante + Opciones) */}
            <div className="flex items-center gap-2 shrink-0">
              {videoState.seriesMeta && onNextEpisode && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onNextEpisode();
                  }}
                  className="min-h-[38px] px-3.5 rounded-2xl bg-white text-[#050507] hover:bg-zinc-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                  <span>Siguiente</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDirectCastToTv}
                className={`min-h-[38px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                  isCastingToTv || hasConnectedSmartTv
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                    : 'bg-[#E11D48]/15 hover:bg-[#E11D48]/25 text-[#FB7185] border-[#E11D48]/35'
                }`}
                title="Enviar vídeo directamente a tu TV (Chromecast / AirPlay 2 / Smart TV)"
              >
                <Cast className="w-3.5 h-3.5 shrink-0" />
                <span>{isCastingToTv ? 'Transmitiendo' : 'Cast TV'}</span>
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
                      ? 'bg-[#E11D48] text-white border-[#E11D48]'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 border-white/[0.09]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span>Chat Flotante</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setShowProMenu(true);
                }}
                className="min-h-[38px] px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#E11D48]" />
                <span>Opciones</span>
              </button>
            </div>
          </div>
        )}

      {/* ==================================================================== */}
      {/* EL MENÚ MÁGICO (UNIFIED PROGRESSIVE DISCLOSURE BOTTOM SHEET)         */}
      {/* ==================================================================== */}
      {showProMenu && (
        <div
          className="fixed inset-0 z-[195] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
          onClick={() => setShowProMenu(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-[#0B0B11]/95 backdrop-blur-2xl border-t sm:border border-white/[0.12] shadow-[0_-20px_70px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col max-h-[86dvh] animate-sheet-up"
          >
            <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
              <div className="w-10 h-1.5 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#E11D48]/15 border border-[#E11D48]/30 flex items-center justify-center text-[#E11D48]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    El Menú Mágico
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Idioma, Subtítulos, Modo Cine, PiP y Cast Directo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProMenu(false)}
                className="min-h-[44px] min-w-[44px] rounded-2xl hover:bg-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                aria-label="Cerrar Menú Mágico"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* 1. Primary Action Grid: Cast Directo, Mando TV, Modo Cine, PiP */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    setShowProMenu(false);
                    handleDirectCastToTv(e);
                  }}
                  className={`min-h-[68px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                    isCastingToTv
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-[#E11D48]/15 hover:bg-[#E11D48]/25 border-[#E11D48]/40 text-white'
                  }`}
                >
                  <Cast className="w-5 h-5 text-[#FB7185]" />
                  <span>{isCastingToTv ? 'Cast Activo' : 'Cast Directo'}</span>
                </button>

                {onOpenSmartTvModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowProMenu(false);
                      onOpenSmartTvModal();
                    }}
                    className={`min-h-[68px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      hasConnectedSmartTv
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
                    }`}
                  >
                    <Tv className="w-5 h-5 text-emerald-400" />
                    <span>{hasConnectedSmartTv ? 'Mando TV' : 'Código 4 Dígitos'}</span>
                  </button>
                )}

                {onToggleCinemaMode && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onToggleCinemaMode();
                    }}
                    className={`min-h-[68px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
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
                    <span>Modo Cine</span>
                  </button>
                )}

                {canUseNativePiPOrCast && (
                  <button
                    type="button"
                    onClick={(e) => {
                      handleTogglePiP(e);
                      setShowProMenu(false);
                    }}
                    className={`min-h-[68px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      isInPiP
                        ? 'bg-[#E11D48]/25 border-[#E11D48]/60 text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
                    }`}
                  >
                    <PictureInPicture2 className="w-5 h-5 text-sky-400" />
                    <span>PiP Flotante</span>
                  </button>
                )}
              </div>

              {/* 2. Audio / Language & Server Selector */}
              {(videoState.tracks.length > 0 || !videoState.isLive) && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#E11D48]" />
                    <span>Idioma de Audio y Servidor</span>
                  </div>

                  {!videoState.isLive && (
                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          { code: 'ES', label: '🇪🇸 Español' },
                          { code: 'LAT', label: '🇲🇽 Latino' },
                          { code: 'VOSE', label: '💬 VOSE' },
                          { code: 'EN', label: '🇬🇧 Inglés' },
                        ] as const
                      ).map((lBtn) => {
                        const isCurrent = activeTrackLangCode === lBtn.code;
                        return (
                          <button
                            key={lBtn.code}
                            type="button"
                            onClick={() => {
                              handleQuickLanguageSwitch(lBtn.code);
                              setShowProMenu(false);
                            }}
                            className={`min-h-[42px] px-2 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                              isCurrent
                                ? 'bg-[#E11D48] border-[#E11D48] text-white'
                                : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-zinc-200'
                            }`}
                          >
                            {lBtn.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {videoState.tracks.length > 1 && (
                    <select
                      aria-label="Seleccionar servidor o canal"
                      value={videoState.activeTrackIndex}
                      onChange={(e) => {
                        const nextIdx = Number(e.target.value);
                        const chosen = videoState.tracks[nextIdx];
                        if (chosen) {
                          triggerLocalLanguagePopup({
                            type: 'success',
                            title: `Cambiando a: ${chosen.label}`,
                            subtitle: 'Sincronizando señal de audio HD...',
                          });
                        }
                        onSelectTrack(nextIdx, currentTime);
                        setShowProMenu(false);
                      }}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/60 border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                    >
                      {videoState.tracks.map((track, idx) => (
                        <option key={track.id || idx} value={idx} className="bg-[#0B0B11]">
                          {track.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* 3. Subtitles (.SRT / .VTT + Offset + Font Size) */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Subtitles className="w-4 h-4 text-sky-400" />
                    <span>Subtítulos Sincronizados</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => subtitleFileInputRef.current?.click()}
                    className="min-h-[36px] px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-xs font-bold text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir .SRT / .VTT</span>
                  </button>
                </div>

                <select
                  value={activeSubId}
                  onChange={(e) => handleSelectSubtitleTrack(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/60 border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                >
                  <option value="off">Subtítulos desactivados</option>
                  {subtitleTracks.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>

                {activeSubId !== 'off' && (
                  <div className="flex items-center justify-between gap-2 pt-1">
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
                              ? 'bg-[#E11D48] text-white'
                              : 'bg-white/10 text-zinc-300'
                          }`}
                        >
                          {sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Cinema Pro Enhancements (Vocal Boost, Ambilight, Quality & Speed) */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={toggleVocalBoost}
                    className={`min-h-[48px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      vocalBoostEnabled
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-300'
                    }`}
                  >
                    <span>Realce de Voces</span>
                    <span className="font-mono text-[10px]">
                      {vocalBoostEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAmbilightEnabled((v) => !v)}
                    className={`min-h-[48px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer ${
                      ambilightEnabled
                        ? 'bg-[#E11D48]/20 border-[#E11D48]/50 text-white'
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-300'
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
                      Velocidad de reproducción
                    </span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => handleSelectSpeed(spd)}
                          className={`min-h-[38px] rounded-xl font-mono text-xs font-bold cursor-pointer ${
                            playbackSpeed === spd
                              ? 'bg-[#E11D48] text-white'
                              : 'bg-white/[0.06] hover:bg-white/15 text-zinc-300'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {qualityLevels.length > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-zinc-400">
                      Calidad de vídeo
                    </span>
                    <select
                      value={selectedQuality}
                      onChange={(e) => handleChangeQuality(Number(e.target.value))}
                      className="min-h-[38px] px-3 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-white outline-none cursor-pointer"
                    >
                      <option value={-1}>Automática (HD)</option>
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
