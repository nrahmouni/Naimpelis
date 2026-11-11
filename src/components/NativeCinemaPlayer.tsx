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
} from 'lucide-react';
import {
  AppLanguage,
  CloudBrowserState,
  FloatingReaction,
  VideoState,
} from '../types';
import { UI_COPY } from '../utils/i18n';
import { socketService } from '../services/socket';
import { triggerHaptic } from '../utils/haptics';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
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
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onClosePlayer?: () => void;
  isTvMode?: boolean;
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
  isMinimized = false,
  onToggleMinimize,
  onClosePlayer,
  isTvMode = false,
}) => {
  const t = UI_COPY[lang];
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = useRef(`yt-stage-${Math.random().toString(36).slice(2, 8)}`);
  const isApplyingRemoteRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInPiP, setIsInPiP] = useState(false);
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

  const showTransientToast = useCallback((msg: string) => {
    setPlayerToast(msg);
    setTimeout(() => {
      setPlayerToast((cur) => (cur === msg ? null : cur));
    }, 3400);
  }, []);

  const scheduleHideControls = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (
        videoState.isPlaying &&
        (videoState.mode === 'hls' || videoState.mode === 'direct')
      ) {
        setShowControls(false);
      }
    }, 3400);
  }, [videoState.isPlaying, videoState.mode]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

        if (videoState.mode === 'hls' && window.chrome.cast.media.HlsSegmentFormat) {
          mediaInfo.hlsSegmentFormat = window.chrome.cast.media.HlsSegmentFormat.TS;
        }

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
        showTransientToast(`Reproduciendo en ${friendlyName}`);
      } catch {
        showTransientToast(
          lang === 'es'
            ? 'Conectado al televisor, sincronizando señal...'
            : 'Connected to TV, syncing stream...'
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

    if (window.cast?.framework && window.chrome?.cast) {
      initCastFramework();
    } else {
      window.__onGCastApiAvailable = (isAvailable: boolean) => {
        if (isAvailable) initCastFramework();
      };
    }
  }, []);

  // Auto-update Chromecast media when switching movies/channels while already connected
  useEffect(() => {
    if (!isCastingToTv || !castSdkReady || !window.cast?.framework) return;
    const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
    if (session && (videoState.mode === 'hls' || videoState.mode === 'direct') && videoState.url) {
      loadStreamIntoCastSession(session);
    }
  }, [isCastingToTv, castSdkReady, videoState.url, videoState.mode, loadStreamIntoCastSession]);

  const handleDirectCastToTv = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const video = videoRef.current as any;

    // Path 1: Official Google Chromecast SDK (Android Chrome & Desktop Chrome)
    if (castSdkReady && window.cast?.framework) {
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
          await loadStreamIntoCastSession(session);
          return;
        }
      } catch (err: any) {
        if (err === 'cancel') return;
      }
    }

    // Path 2: Native Apple AirPlay Picker (iOS / iPadOS / macOS Safari)
    if (video?.webkitShowPlaybackTargetPicker) {
      try {
        video.webkitShowPlaybackTargetPicker();
        return;
      } catch {
        // fallback
      }
    }

    // Path 3: W3C HTML5 RemotePlayback API (Android / Mobile Browsers)
    if (video?.remote?.prompt) {
      try {
        await video.remote.prompt();
        setIsCastingToTv(true);
        return;
      } catch {
        // fallback
      }
    }

    showTransientToast(
      lang === 'es'
        ? 'Abre NAIM CINE en Chrome (Chromecast) o Safari (AirPlay) en la misma Wi-Fi que tu TV'
        : 'Open in Chrome (Chromecast) or Safari (AirPlay) on the same Wi-Fi as your TV'
    );
  };

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

    const startPlaybackSafely = async () => {
      if (!video || cancelled) return;
      if (!videoState.isLive && videoState.currentTime > 2) {
        try {
          video.currentTime = videoState.currentTime;
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

    if (video.paused) {
      video.play().catch(() => {});
      setLocalPlaying(true);
      onSyncAction('play', { isPlaying: true, currentTime: video.currentTime || 0 });
    } else {
      video.pause();
      setLocalPlaying(false);
      onSyncAction('pause', { isPlaying: false, currentTime: video.currentTime || 0 });
    }
  };

  const handleSeekRelative = (deltaSec: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video || videoState.isLive) return;
    triggerHaptic('light');
    revealControls();
    const target = Math.max(
      0,
      Math.min(duration || Infinity, (video.currentTime || 0) + deltaSec)
    );
    video.currentTime = target;
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
    const container = stageWrapperRef.current;
    const video = videoRef.current as any;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (container?.requestFullscreen) {
        await container.requestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch {
      // ignore
    }
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

  return (
    <section
      className={`w-full overflow-hidden bg-black ${
        isTvMode
          ? 'h-dvh'
          : isMinimized
            ? 'rounded-2xl border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9)]'
            : 'lg:rounded-2xl lg:border lg:border-white/[0.08] lg:shadow-2xl lg:shadow-black/60'
      }`}
    >
      {/* ==================================================================== */}
      {/* 16:9 VIDEO STAGE                                                     */}
      {/* ==================================================================== */}
      <div
        ref={stageWrapperRef}
        onMouseMove={revealControls}
        className={`relative w-full bg-black overflow-hidden select-none ${
          isTvMode ? 'h-full' : 'aspect-video'
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

        {/* Transient Player Toast (Chromecast / PiP feedback) */}
        {playerToast && !isMinimized && (
          <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-xl bg-[#12141D]/95 border border-white/15 text-xs font-medium text-white shadow-xl text-center max-w-[90%]">
            {playerToast}
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

        {/* Top Bar Inside Player: Title + Minimize + Close Controls */}
        {!isMinimized && videoState.mode !== 'idle' && videoState.mode !== 'cloud' && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-30 px-2.5 sm:px-4 pt-2.5 pb-8 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-start justify-between gap-2 transition-opacity duration-200 ${
              showControls || !localPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="min-w-0 pt-0.5 pl-1">
              <h2 className="font-display font-semibold text-xs sm:text-base text-white truncate">
                {videoState.title}
              </h2>
              {videoState.subtitle && (
                <p className="text-[11px] sm:text-xs text-zinc-300 truncate">
                  {videoState.subtitle}
                </p>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
              {/* In Fullscreen / TV Mode, keep track switcher accessible at top right */}
              {(isFullscreen || isTvMode) && hasTracks && (
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[48vw] bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/15">
                  {videoState.tracks.map((track, idx) => (
                    <button
                      key={track.id || idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('light');
                        onSelectTrack(idx, currentTime);
                      }}
                      className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                        idx === videoState.activeTrackIndex
                          ? 'bg-[#E11D48] text-white'
                          : 'text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      {track.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Minimize Player while browsing catalog */}
              {!isTvMode && !isFullscreen && onToggleMinimize && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    onToggleMinimize();
                  }}
                  title={
                    lang === 'es'
                      ? 'Minimizar reproductor para seguir buscando'
                      : 'Minimize player while browsing'
                  }
                  aria-label="Minimizar reproductor"
                  className="h-9 px-2.5 rounded-xl bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {lang === 'es' ? 'Minimizar' : 'Minimize'}
                  </span>
                </button>
              )}

              {/* Close Player */}
              {!isTvMode && !isFullscreen && onClosePlayer && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    onClosePlayer();
                  }}
                  title={lang === 'es' ? 'Cerrar reproductor' : 'Close player'}
                  aria-label="Cerrar reproductor"
                  className="w-9 h-9 rounded-xl bg-black/65 hover:bg-rose-600/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* IDLE STANDBY STAGE                                                 */}
        {/* ================================================================== */}
        {videoState.mode === 'idle' && !isExtracting && !isMinimized && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 sm:p-8 text-center bg-gradient-to-b from-[#12141D] to-[#090A0F]">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-3">
              <Tv className="w-6 h-6 text-[#FB7185]" />
            </div>
            <h3 className="font-display font-semibold text-base sm:text-xl text-white text-balance">
              {t.standbyTitle}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mt-1">
              {t.standbySub}
            </p>

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
        {/* NATIVE HTML5 + HLS VIDEO ELEMENT (WITH AIRPLAY & REMOTE CAST)      */}
        {/* ================================================================== */}
        <video
          ref={videoRef}
          playsInline
          x-webkit-airplay="allow"
          onClick={handleVideoSurfaceTap}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setLocalPlaying(true);
            setStreamError(null);
          }}
          onPause={() => setLocalPlaying(false)}
          onVolumeChange={(e) => {
            setIsMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
            setVolume(e.currentTarget.volume);
          }}
          className={`w-full h-full object-contain bg-black cursor-pointer ${
            videoState.mode === 'hls' || videoState.mode === 'direct' ? 'block' : 'hidden'
          }`}
        />

        {/* Tactile Center Touch Controls Overlay (Expanded Mode Only) */}
        {!isMinimized &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') &&
          !isExtracting &&
          !streamError && (
            <div
              onClick={handleVideoSurfaceTap}
              className={`absolute inset-0 z-20 flex items-center justify-center gap-6 sm:gap-9 transition-opacity duration-150 ${
                showControls || !localPlaying
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              {!videoState.isLive && (
                <button
                  type="button"
                  onClick={(e) => handleSeekRelative(-10, e)}
                  aria-label="Retroceder 10 segundos"
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}

              <button
                type="button"
                onClick={handleTogglePlay}
                aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/65 hover:bg-[#E11D48] backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all cursor-pointer"
              >
                {localPlaying ? (
                  <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
                ) : (
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current ml-0.5" />
                )}
              </button>

              {!videoState.isLive && (
                <button
                  type="button"
                  onClick={(e) => handleSeekRelative(10, e)}
                  aria-label="Avanzar 10 segundos"
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
                >
                  <RotateCw className="w-5 h-5" />
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
            {/* Minimize & Close quick pill on YouTube stage */}
            {!isMinimized && !isTvMode && (onToggleMinimize || onClosePlayer) && (
              <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
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
        {/* BOTTOM TRANSPORT BAR (TOUCH ERGONOMIC + CHROMECAST + MOBILE PIP)   */}
        {/* ================================================================== */}
        {!isMinimized && (videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute bottom-0 inset-x-0 z-30 px-2 sm:px-4 pb-1.5 sm:pb-2.5 pt-8 bg-gradient-to-t from-black/95 via-black/65 to-transparent transition-opacity duration-200 ${
              showControls || !localPlaying
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Touch-Expanded VOD Scrubber */}
            {!videoState.isLive && duration > 0 && (
              <div className="h-6 flex items-center px-1">
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

            <div className="flex items-center justify-between gap-1">
              {/* Left Transport Cluster */}
              <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
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
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-white cursor-pointer"
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
                  <div className="flex items-center gap-1.5 pl-1 text-xs font-semibold text-white whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-[#E11D48] animate-pulse" />
                    <span>{t.liveNow}</span>
                  </div>
                ) : (
                  <div className="text-[11px] sm:text-xs font-mono tabular-nums text-zinc-200 pl-0.5 whitespace-nowrap">
                    {formatTimecode(currentTime)}{' '}
                    <span className="text-zinc-500">/</span> {formatTimecode(duration)}
                  </div>
                )}
              </div>

              {/* Right Utility Cluster: Quality + Reload + Chromecast + Mobile/Desktop PiP + Fullscreen */}
              <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                {qualityLevels.length > 1 && (
                  <select
                    value={selectedQuality}
                    onChange={(e) => handleChangeQuality(Number(e.target.value))}
                    aria-label="Calidad de vídeo"
                    className="hidden sm:block h-9 px-2 rounded-lg bg-black/70 border border-white/15 text-xs font-mono text-zinc-200 outline-none cursor-pointer"
                  >
                    <option value={-1}>Auto</option>
                    {qualityLevels.map((q) => (
                      <option key={q.index} value={q.index}>
                        {q.height}p
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={handleForceReloadStream}
                  className="hidden sm:flex w-10 h-10 sm:w-11 sm:h-11 rounded-xl hover:bg-white/12 items-center justify-center text-zinc-200 cursor-pointer"
                  title={t.syncRoom}
                  aria-label="Resincronizar señal"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* DIRECT CHROMECAST / AIRPLAY TO TV BUTTON */}
                {!isTvMode && (
                  <button
                    type="button"
                    onClick={handleDirectCastToTv}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      isCastingToTv
                        ? 'bg-[#38BDF8] text-[#090A0F]'
                        : 'hover:bg-white/12 text-zinc-100'
                    }`}
                    title={
                      lang === 'es'
                        ? 'Enviar vídeo directo a la TV (Chromecast / AirPlay)'
                        : 'Cast video directly to TV (Chromecast / AirPlay)'
                    }
                    aria-label="Chromecast directo a TV"
                  >
                    <Cast className="w-4 h-4" />
                  </button>
                )}

                {/* FLOATING OVERLAY ON PHONE / DESKTOP (PICTURE-IN-PICTURE) — VISIBLE ON MOBILE TOO! */}
                {!isTvMode && (
                  <button
                    type="button"
                    onClick={handleTogglePiP}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      isInPiP
                        ? 'bg-[#E11D48] text-white'
                        : 'hover:bg-white/12 text-zinc-100'
                    }`}
                    title={
                      lang === 'es'
                        ? 'Superponer vídeo encima de otra pantalla (PiP)'
                        : 'Float video on top of phone screen (PiP)'
                    }
                    aria-label="Superponer pantalla flotante"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-white cursor-pointer"
                  title="Pantalla completa"
                  aria-label="Pantalla completa"
                >
                  {isFullscreen ? (
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
        <div className="bg-[#12141D] border-t border-white/10 px-2.5 py-2 flex items-center justify-between gap-2">
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

          <div className="flex items-center gap-1 shrink-0">
            {(canUseNativePiPOrCast || videoState.mode === 'youtube') && (
              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
              >
                {localPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
            )}

            {canUseNativePiPOrCast && (
              <button
                type="button"
                onClick={handleTogglePiP}
                className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-zinc-200 cursor-pointer"
                title={
                  lang === 'es'
                    ? 'Superponer sobre el teléfono (PiP)'
                    : 'Float over phone screen (PiP)'
                }
                aria-label="Pantalla flotante"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>
            )}

            {onToggleMinimize && (
              <button
                type="button"
                onClick={onToggleMinimize}
                className="w-8 h-8 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] flex items-center justify-center text-white cursor-pointer"
                title={lang === 'es' ? 'Ampliar reproductor' : 'Expand player'}
                aria-label="Ampliar reproductor"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}

            {onClosePlayer && (
              <button
                type="button"
                onClick={onClosePlayer}
                className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-rose-600 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
                title={lang === 'es' ? 'Cerrar reproductor' : 'Close player'}
                aria-label="Cerrar reproductor"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DEDICATED THUMB-FRIENDLY TRACK / SIGNAL / CAST STRIP BELOW VIDEO     */}
      {/* ==================================================================== */}
      {!isTvMode &&
        !isMinimized &&
        videoState.mode !== 'idle' &&
        (hasTracks || videoState.seriesMeta || canUseNativePiPOrCast) && (
          <div className="bg-[#12141D] border-t border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between gap-2.5">
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 shrink-0">
              <Radio className="w-3.5 h-3.5 text-[#FB7185]" />
              <span>{videoState.isLive ? 'Señales en vivo:' : 'Idioma / Acciones:'}</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 sm:justify-end">
              {videoState.tracks.map((track, idx) => {
                const active = idx === videoState.activeTrackIndex;
                return (
                  <button
                    key={track.id || idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectTrack(idx, currentTime);
                    }}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#E11D48] text-white shadow-sm shadow-[#E11D48]/30'
                        : 'bg-[#191C28] hover:bg-[#232838] text-zinc-300 border border-white/[0.07]'
                    }`}
                  >
                    {track.label}
                  </button>
                );
              })}

              {canUseNativePiPOrCast && (
                <>
                  <button
                    type="button"
                    onClick={handleTogglePiP}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      isInPiP
                        ? 'bg-[#E11D48] text-white'
                        : 'bg-[#191C28] hover:bg-[#232838] text-zinc-200 border border-white/[0.07]'
                    }`}
                  >
                    <PictureInPicture2 className="w-3.5 h-3.5 text-[#FB7185]" />
                    <span>{lang === 'es' ? 'Flotante' : 'Floating PiP'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDirectCastToTv}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      isCastingToTv
                        ? 'bg-[#38BDF8] text-[#090A0F]'
                        : 'bg-[#191C28] hover:bg-[#232838] text-zinc-200 border border-white/[0.07]'
                    }`}
                  >
                    <Cast className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>
                      {isCastingToTv
                        ? castDeviceName || 'TV Conectada'
                        : 'Chromecast'}
                    </span>
                  </button>
                </>
              )}

              {videoState.seriesMeta && onNextEpisode && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onNextEpisode();
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-white text-[#090A0F] hover:bg-zinc-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {lang === 'es' ? 'Siguiente episodio' : 'Next episode'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
    </section>
  );
};
