import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  RefreshCw,
  PictureInPicture2,
  Tv,
  Film,
  Trophy,
  Link2,
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
  onSyncAction: (action: 'play' | 'pause' | 'seek' | 'change_url', patch: Partial<VideoState>) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onPromoteCloudStreamToNative: (proxiedStreamUrl: string) => void;
  onOpenCatalogSection?: (section: 'movies' | 'series' | 'sports' | 'youtube' | 'direct') => void;
  onNextEpisode?: () => void;
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

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<{ index: number; height: number }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [cloudUrlInput, setCloudUrlInput] = useState('');

  const scheduleHideControls = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (videoState.isPlaying && (videoState.mode === 'hls' || videoState.mode === 'direct')) {
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
        video.muted = false;
        await video.play();
        if (cancelled) {
          video.pause();
          return;
        }
        setIsMuted(false);
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
  }, [videoState.isPlaying, videoState.currentTime, videoState.lastUpdated, videoState.mode, videoState.url]);

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
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
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
  }, [videoState.isPlaying, videoState.currentTime, videoState.lastUpdated, videoState.mode]);

  // ============================================================================
  // PLAYER INTERACTIONS
  // ============================================================================
  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('light');
    revealControls();
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

  const handleVideoSurfaceTap = () => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      revealControls();
    }
  };

  const handleUnmuteNow = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('success');
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      if (video.volume === 0) video.volume = 1;
      setIsMuted(false);
      setVolume(video.volume);
      if (video.paused && videoState.isPlaying) {
        video.play().catch(() => {});
      }
    }
    if (ytPlayerRef.current?.unMute) {
      ytPlayerRef.current.unMute();
      ytPlayerRef.current.setVolume?.(100);
      setIsMuted(false);
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

  const handleSeekRelative = (deltaSec: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video || videoState.isLive) return;
    triggerHaptic('light');
    revealControls();
    const target = Math.max(0, Math.min(duration || Infinity, (video.currentTime || 0) + deltaSec));
    video.currentTime = target;
    setCurrentTime(target);
    onSyncAction('seek', { currentTime: target, isPlaying: !video.paused });
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

  const handleTogglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current as any;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {
      // ignore
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

  return (
    <section
      className={`w-full overflow-hidden bg-black ${
        isTvMode
          ? 'h-dvh'
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
        {/* Floating Reactions Layer */}
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

        {/* Clean Title Scrim (Inside Fullscreen or Desktop Hover) */}
        {videoState.mode !== 'idle' && videoState.mode !== 'cloud' && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-25 px-3.5 sm:px-5 pt-3 pb-8 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center justify-between gap-3 transition-opacity duration-200 ${
              showControls || !localPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-xs sm:text-base text-white truncate">
                {videoState.title}
              </h2>
              {videoState.subtitle && (
                <p className="text-[11px] sm:text-xs text-zinc-300 truncate">
                  {videoState.subtitle}
                </p>
              )}
            </div>

            {/* In Fullscreen / TV Mode, also keep track switcher accessible at top right */}
            {(isFullscreen || isTvMode) && hasTracks && (
              <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[55%] bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/15">
                {videoState.tracks.map((track, idx) => (
                  <button
                    key={track.id || idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onSelectTrack(idx, currentTime);
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
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
          </div>
        )}

        {/* ================================================================== */}
        {/* IDLE STANDBY STAGE                                                 */}
        {/* ================================================================== */}
        {videoState.mode === 'idle' && !isExtracting && (
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
        {/* NATIVE HTML5 + HLS VIDEO ELEMENT                                   */}
        {/* ================================================================== */}
        <video
          ref={videoRef}
          playsInline
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
          className={`w-full h-full object-contain bg-black ${
            videoState.mode === 'hls' || videoState.mode === 'direct' ? 'block' : 'hidden'
          }`}
        />

        {/* Tactile Center Touch Controls Overlay (Mobile & Desktop) */}
        {(videoState.mode === 'hls' || videoState.mode === 'direct') &&
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
          <div className="w-full h-full bg-black">
            <div id={ytContainerId.current} className="w-full h-full" />
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
                className="w-10 h-10 rounded-xl bg-[#191C28] hover:bg-[#232738] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
                aria-label="Atrás"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => socketService.sendCloudBrowserInput({ type: 'reload' })}
                className="w-10 h-10 rounded-xl bg-[#191C28] hover:bg-[#232738] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
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
                  className="w-full h-10 px-3 rounded-xl bg-[#090A0F] border border-white/10 text-base sm:text-xs font-mono text-zinc-200 outline-none"
                />
              </form>
              {cloudState?.detectedStreamUrl && (
                <button
                  type="button"
                  onClick={() => onPromoteCloudStreamToNative(cloudState.detectedStreamUrl!)}
                  className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.switchNativeHd}</span>
                  <span className="sm:hidden">HD Nativo</span>
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
          <div className="pointer-events-none absolute inset-0 z-25 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-5 text-center">
            <Loader2 className="w-8 h-8 sm:w-9 sm:h-9 animate-spin text-[#E11D48] mb-2.5" />
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
          </div>
        )}

        {streamError && !isExtracting && (
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
        {/* BOTTOM TRANSPORT BAR (TOUCH ERGONOMIC >=44PX TARGETS)              */}
        {/* ================================================================== */}
        {(videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute bottom-0 inset-x-0 z-30 px-2.5 sm:px-4 pb-1.5 sm:pb-2.5 pt-8 bg-gradient-to-t from-black/95 via-black/65 to-transparent transition-opacity duration-200 ${
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
              <div className="flex items-center gap-0.5 sm:gap-1.5">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="w-11 h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-white transition-colors cursor-pointer"
                  aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {localPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="w-11 h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-white cursor-pointer"
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
                  <div className="text-xs font-mono tabular-nums text-zinc-200 pl-1 whitespace-nowrap">
                    {formatTimecode(currentTime)}{' '}
                    <span className="text-zinc-500">/</span> {formatTimecode(duration)}
                  </div>
                )}
              </div>

              {/* Right Utility Cluster */}
              <div className="flex items-center gap-0.5 sm:gap-1">
                {qualityLevels.length > 1 && (
                  <select
                    value={selectedQuality}
                    onChange={(e) => handleChangeQuality(Number(e.target.value))}
                    aria-label="Calidad de vídeo"
                    className="h-9 px-2 rounded-lg bg-black/70 border border-white/15 text-xs font-mono text-zinc-200 outline-none cursor-pointer"
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
                  className="w-11 h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-zinc-200 cursor-pointer"
                  title={t.syncRoom}
                  aria-label="Resincronizar señal"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleTogglePiP}
                  className="hidden sm:flex w-11 h-11 rounded-xl hover:bg-white/12 items-center justify-center text-zinc-200 cursor-pointer"
                  title="Picture in Picture"
                  aria-label="Picture in Picture"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="w-11 h-11 rounded-xl hover:bg-white/12 flex items-center justify-center text-white cursor-pointer"
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
      {/* DEDICATED THUMB-FRIENDLY TRACK / SIGNAL SWITCHER STRIP BELOW VIDEO   */}
      {/* ==================================================================== */}
      {!isTvMode && videoState.mode !== 'idle' && (hasTracks || videoState.seriesMeta) && (
        <div className="bg-[#12141D] border-t border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between gap-2.5">
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 shrink-0">
            <Radio className="w-3.5 h-3.5 text-[#FB7185]" />
            <span>{videoState.isLive ? 'Señales en vivo:' : 'Idioma / Señal:'}</span>
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
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#E11D48] text-white shadow-sm shadow-[#E11D48]/30'
                      : 'bg-[#191C28] hover:bg-[#232838] text-zinc-300 border border-white/[0.07]'
                  }`}
                >
                  {track.label}
                </button>
              );
            })}

            {videoState.seriesMeta && onNextEpisode && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onNextEpisode();
                }}
                className="min-h-[40px] px-3.5 rounded-xl bg-white text-[#090A0F] hover:bg-zinc-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ml-1"
              >
                <SkipForward className="w-3.5 h-3.5 fill-current" />
                <span>
                  {lang === 'es' ? 'Siguiente Ep.' : 'Next Ep.'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
