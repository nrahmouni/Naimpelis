import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Star,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CatalogMovie } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsAnimatedCategoryIcon } from './KidsSvgArt';

import type {
  YouTubePlayerEvent,
  YouTubePlayerInstance,
} from '../player/playerTypes';

interface KidsIndependentPlayerProps {
  item: CatalogMovie;
  upNextItems?: CatalogMovie[];
  onSelectItem?: (nextItem: CatalogMovie) => void;
  onClose: () => void;
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
    window.setTimeout(resolve, 4500);
  });
  return ytApiPromise;
}

function extractYouTubeVideoId(item: CatalogMovie): string {
  if (item.bingetrixUrl && /^[a-zA-Z0-9_-]{8,16}$/.test(item.bingetrixUrl)) {
    return item.bingetrixUrl;
  }
  if (item.id.startsWith('yt-')) {
    return item.id.slice(3);
  }
  return '';
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

/**
 * Reproductor propio 100% independiente al estilo Kids:
 * - Reproduce vídeos de YouTube Kids usando YouTube IFrame API con controles gigantes propios.
 * - Reproduce Canales TV Infantiles en directo mediante HLS.js dentro del mismo marco amigable.
 * - Nunca sale al reproductor de adultos de RiffanTV ni muestra menús de Watch Party o extractores.
 */
export const KidsIndependentPlayer: React.FC<KidsIndependentPlayerProps> = ({
  item,
  upNextItems = [],
  onSelectItem,
  onClose,
}) => {
  const getActiveProfile = useKidsStore((s) => s.getActiveProfile);
  const ux = useKidsStore((s) => s.ux);
  const awardStars = useKidsStore((s) => s.awardStars);
  const trackMission = useKidsStore((s) => s.trackMission);

  const profile = getActiveProfile();
  const kidsLang = profile.preferredLang;
  const ageGroup = profile.ageGroup;
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const isLiveChannel =
    item.platform === 'Riffan Kids Live' || item.id.startsWith('kids-live-');
  const ytVideoId = useMemo(
    () => (isLiveChannel ? '' : extractYouTubeVideoId(item)),
    [isLiveChannel, item]
  );

  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YouTubePlayerInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volumePct, setVolumePct] = useState(100);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [gestureToast, setGestureToast] = useState<string | null>(null);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);

  const showToast = (msg: string) => {
    setGestureToast(msg);
    window.setTimeout(() => {
      setGestureToast((curr) => (curr === msg ? null : curr));
    }, 1500);
  };

  const triggerCompletionReward = () => {
    if (rewardClaimed) return;
    setRewardClaimed(true);
    awardStars(5, 'cinefilo_kids');
    trackMission('watch');
    playKidsSound('levelUp', ux.soundEnabled, true);
    setConfettiActive(true);
    showToast(t.theaterEarnedFiveStars);
    if (ux.soundEnabled) {
      void speakKidsText(t.theaterCongratsSpeech, kidsLang, { ageGroup });
    }
  };

  useEffect(() => {
    setRewardClaimed(false);
    setIsEnded(false);
    setStreamError(null);
    setCurrentSec(0);
    setDurationSec(0);
    setIsBuffering(true);
    setIsPlaying(true);
  }, [item.id]);

  // 1. Initialize YouTube Kids IFrame Player
  useEffect(() => {
    if (isLiveChannel || !ytVideoId) return;
    let cancelled = false;
    let timePoll: number | null = null;

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !ytHostRef.current || !window.YT?.Player) {
        if (!cancelled && !window.YT?.Player) {
          setIsBuffering(false);
        }
        return;
      }

      ytHostRef.current.innerHTML = '';
      const mountDiv = document.createElement('div');
      const mountId = `riffan-kids-yt-mount-${Date.now()}`;
      mountDiv.id = mountId;
      mountDiv.className = 'w-full h-full';
      ytHostRef.current.appendChild(mountDiv);

      const player = new window.YT.Player(mountId, {
        videoId: ytVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          playsinline: 1,
          iv_load_policy: 3,
          disablekb: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (evt: YouTubePlayerEvent) => {
            if (cancelled) return;
            ytPlayerRef.current = evt.target;
            setIsBuffering(false);
            setDurationSec(evt.target.getDuration?.() || 0);
            try {
              evt.target.playVideo();
            } catch {
              // wait for tap
            }
          },
          onStateChange: (evt: YouTubePlayerEvent) => {
            if (cancelled) return;
            const state = evt.data;
            if (state === 1) {
              setIsPlaying(true);
              setIsBuffering(false);
              setIsEnded(false);
              setDurationSec(evt.target.getDuration?.() || 0);
            } else if (state === 2) {
              setIsPlaying(false);
              setIsBuffering(false);
            } else if (state === 3) {
              setIsBuffering(true);
            } else if (state === 0) {
              setIsPlaying(false);
              setIsBuffering(false);
              setIsEnded(true);
              triggerCompletionReward();
            }
          },
        },
      });

      ytPlayerRef.current = player;
      timePoll = window.setInterval(() => {
        if (!ytPlayerRef.current) return;
        try {
          const cur = ytPlayerRef.current.getCurrentTime?.() ?? 0;
          const dur = ytPlayerRef.current.getDuration?.() ?? 0;
          if (Number.isFinite(cur)) setCurrentSec(cur);
          if (Number.isFinite(dur) && dur > 0) setDurationSec(dur);
        } catch {
          // ignore while mounting
        }
      }, 450);
    });

    return () => {
      cancelled = true;
      if (timePoll) window.clearInterval(timePoll);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy?.();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveChannel, ytVideoId, retryCounter]);

  // 2. Initialize Kids Live TV Channel (HLS.js)
  useEffect(() => {
    if (!isLiveChannel) return;
    const video = videoRef.current;
    const streamUrl = item.bingetrixUrl || item.movidyUrl || '';
    if (!video || !streamUrl) {
      setStreamError(t.catalogLoadError);
      setIsBuffering(false);
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsBuffering(true);
    setStreamError(null);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 24,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        setIsPlaying(true);
        void video.play().catch(() => {
          setIsPlaying(false);
        });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setIsBuffering(false);
            setStreamError(t.catalogConnError);
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener(
        'loadedmetadata',
        () => {
          setIsBuffering(false);
          void video.play().catch(() => setIsPlaying(false));
        },
        { once: true }
      );
    } else {
      setIsBuffering(false);
      setStreamError(t.catalogLoadError);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [isLiveChannel, item.bingetrixUrl, item.movidyUrl, retryCounter, t.catalogConnError, t.catalogLoadError]);

  const handleTogglePlay = () => {
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    if (isLiveChannel) {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        void v.play().catch(() => {});
        setIsPlaying(true);
      } else {
        v.pause();
        setIsPlaying(false);
      }
      return;
    }

    const yt = ytPlayerRef.current;
    if (!yt) return;
    const state = yt.getPlayerState?.();
    if (state === 1) {
      yt.pauseVideo();
      setIsPlaying(false);
    } else {
      setIsEnded(false);
      yt.playVideo();
      setIsPlaying(true);
    }
  };

  const handleSeekDelta = (deltaSec: number) => {
    if (isLiveChannel) return;
    const yt = ytPlayerRef.current;
    if (!yt) return;
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    const cur = yt.getCurrentTime?.() || currentSec;
    const dur = yt.getDuration?.() || durationSec || cur + 300;
    const next = Math.max(0, Math.min(dur, cur + deltaSec));
    yt.seekTo?.(next, true);
    setCurrentSec(next);
    showToast(deltaSec < 0 ? `⏪ ${deltaSec}s` : `⏩ +${deltaSec}s`);
  };

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLiveChannel || durationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ratio = dir === 'rtl' ? 1 - rel : rel;
    const targetSec = ratio * durationSec;
    ytPlayerRef.current?.seekTo?.(targetSec, true);
    setCurrentSec(targetSec);
    triggerHaptic('light');
  };

  const handleVolumeDelta = (deltaPct: number) => {
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    const nextPct = Math.max(0, Math.min(100, (isMuted ? 0 : volumePct) + deltaPct));
    setVolumePct(nextPct);
    setIsMuted(nextPct === 0);

    if (isLiveChannel && videoRef.current) {
      videoRef.current.muted = nextPct === 0;
      videoRef.current.volume = nextPct / 100;
    } else if (ytPlayerRef.current) {
      if (nextPct === 0) ytPlayerRef.current.mute?.();
      else {
        ytPlayerRef.current.unMute?.();
        ytPlayerRef.current.setVolume?.(nextPct);
      }
    }
    showToast(`🔊 ${nextPct}%`);
  };

  const handleToggleMute = () => {
    triggerHaptic('light');
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (isLiveChannel && videoRef.current) {
      videoRef.current.muted = nextMuted;
    } else if (ytPlayerRef.current) {
      if (nextMuted) ytPlayerRef.current.mute?.();
      else ytPlayerRef.current.unMute?.();
    }
    showToast(nextMuted ? '🔇 0%' : `🔊 ${volumePct}%`);
  };

  const handleFullscreen = () => {
    const el = stageWrapRef.current || document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const handleRemoteKey = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const key = e.key;

      if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'GoBack' ||
        code === 27 ||
        code === 8 ||
        code === 4 ||
        code === 10009
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (
        key === ' ' ||
        key === 'Enter' ||
        key === 'Select' ||
        key === 'MediaPlayPause' ||
        code === 13 ||
        code === 23 ||
        code === 66 ||
        code === 85
      ) {
        const active = document.activeElement;
        if (active && active !== document.body && active !== stageWrapRef.current) {
          return;
        }
        e.preventDefault();
        handleTogglePlay();
        return;
      }

      if (key === 'MediaPlay' || code === 126) {
        e.preventDefault();
        if (!isPlaying) handleTogglePlay();
        return;
      }

      if (key === 'MediaPause' || code === 127) {
        e.preventDefault();
        if (isPlaying) handleTogglePlay();
        return;
      }

      if (key === 'ArrowLeft' || key === 'MediaRewind' || code === 37 || code === 21 || code === 89) {
        e.preventDefault();
        handleSeekDelta(-10);
        return;
      }

      if (key === 'ArrowRight' || key === 'MediaFastForward' || code === 39 || code === 22 || code === 90) {
        e.preventDefault();
        handleSeekDelta(10);
        return;
      }

      if (key === 'ArrowUp' || code === 38 || code === 19) {
        e.preventDefault();
        handleVolumeDelta(10);
        return;
      }

      if (key === 'ArrowDown' || code === 40 || code === 20) {
        e.preventDefault();
        handleVolumeDelta(-10);
        return;
      }
    };

    window.addEventListener('keydown', handleRemoteKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleRemoteKey, { capture: true });
    };
  }, [handleTogglePlay, handleSeekDelta, handleVolumeDelta, isPlaying, onClose]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    gestureStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      handleSeekDelta(dx > 0 ? 10 : -10);
    } else if (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.25) {
      handleVolumeDelta(dy < 0 ? 15 : -15);
    }
  };

  const progressPct =
    !isLiveChannel && durationSec > 0
      ? Math.max(0, Math.min(100, (currentSec / durationSec) * 100))
      : 0;

  const suggestions = upNextItems.filter((u) => u.id !== item.id).slice(0, 3);

  return (
    <div
      ref={stageWrapRef}
      dir={dir}
      className="fixed inset-0 z-[270] bg-gradient-to-b from-[#131C44] via-[#0D1330] to-[#080C1F] flex flex-col gap-3 p-3 sm:p-4 overflow-hidden select-none"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* TOP KID-STYLE PLAYER HEADER */}
      <div className="shrink-0 flex items-center justify-between gap-3 rounded-3xl bg-[#182352]/95 border-2 border-[#32438A] px-3 py-2 shadow-xl">
        <KidsSquishButton
          onClick={onClose}
          ariaLabel={t.theaterBackToKids}
          className="px-4 sm:px-5 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white border-b-4 border-rose-700 font-black text-sm sm:text-base flex items-center gap-2 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          <span>{t.theaterBackToKids}</span>
        </KidsSquishButton>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-2.5 px-2">
          <KidsAnimatedCategoryIcon name={isLiveChannel ? 'live_tv' : 'cinema'} size={26} />
          <div className="min-w-0 text-center sm:text-start">
            <h2 className="font-display font-black text-sm sm:text-lg text-white truncate">
              {item.title}
            </h2>
            <p className="text-[11px] font-bold text-sky-200/80 truncate">
              {isLiveChannel ? t.catLive : 'YouTube Kids'}
              {item.overview ? ` · ${item.overview}` : ''}
            </p>
          </div>
          <KidsSpeakButton text={item.title} lang={kidsLang} size="md" />
        </div>

        <KidsSquishButton
          onClick={triggerCompletionReward}
          disabled={rewardClaimed}
          sound="star"
          className={`px-4 rounded-2xl border-b-4 font-black text-xs sm:text-sm flex items-center gap-1.5 shrink-0 ${
            rewardClaimed
              ? 'bg-emerald-400 text-slate-950 border-emerald-600'
              : 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-700'
          }`}
        >
          <Star className="w-4 h-4 fill-current" />
          <span>{rewardClaimed ? '+5 ⭐' : t.theaterClaimFiveStars}</span>
        </KidsSquishButton>
      </div>

      {/* CENTER KID-CINEMA SCREEN */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 min-h-0 rounded-3xl bg-black border-4 border-[#324691] shadow-[0_20px_50px_rgba(0,0,0,0.65)] overflow-hidden flex items-center justify-center"
      >
        {isLiveChannel ? (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            onPlaying={() => {
              setIsBuffering(false);
              setIsPlaying(true);
            }}
            onWaiting={() => setIsBuffering(true)}
            onClick={handleTogglePlay}
            className="w-full h-full object-contain bg-black cursor-pointer"
          />
        ) : (
          <div ref={ytHostRef} className="w-full h-full bg-black" />
        )}

        {/* Tap shield overlay when paused or buffering so kids don't hit random YouTube links */}
        {!isLiveChannel && !isPlaying && !isEnded && !streamError && (
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={t.theaterPlay}
            className="absolute inset-0 z-10 bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 cursor-pointer"
          >
            <span className="w-24 h-24 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 flex items-center justify-center shadow-2xl">
              <Play className="w-12 h-12 fill-current ms-1" />
            </span>
            <span className="font-display font-black text-xl text-white drop-shadow">
              {t.theaterPlay}
            </span>
          </button>
        )}

        {isBuffering && !streamError && (
          <div className="pointer-events-none absolute inset-0 z-20 bg-[#0D1330]/60 flex flex-col items-center justify-center gap-2">
            <KidsAnimatedCategoryIcon name={isLiveChannel ? 'live_tv' : 'cinema'} size={52} />
            <span className="text-sm font-black text-sky-200">
              {isLiveChannel ? t.catLive : 'YouTube Kids'}...
            </span>
          </div>
        )}

        {gestureToast && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-2xl bg-amber-400 text-slate-950 font-black text-base shadow-xl">
            {gestureToast}
          </div>
        )}

        {streamError && (
          <div className="absolute inset-0 z-30 bg-[#0F1636]/95 flex flex-col items-center justify-center p-6 text-center gap-4">
            <Tv className="w-12 h-12 text-amber-300" />
            <p className="font-display font-bold text-base sm:text-lg text-white max-w-md">
              {streamError}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <KidsSquishButton
                onClick={() => {
                  setStreamError(null);
                  setRetryCounter((c) => c + 1);
                }}
                className="px-5 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-slate-950 font-black text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t.gameRetryBtn}</span>
              </KidsSquishButton>
              <KidsSquishButton
                onClick={onClose}
                className="px-5 rounded-2xl bg-white/15 border-b-4 border-black/40 text-white font-black text-sm"
              >
                {t.theaterBackToKids}
              </KidsSquishButton>
            </div>
          </div>
        )}

        {/* KID CELEBRATION & UP-NEXT OVERLAY WHEN VIDEO ENDS */}
        {isEnded && (
          <div className="absolute inset-0 z-30 bg-[#0D1433]/92 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center gap-4">
            <div className="text-5xl">🎉</div>
            <h3 className="font-display font-black text-2xl sm:text-3xl text-amber-300">
              {t.theaterEarnedFiveStars}
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <KidsSquishButton
                onClick={() => {
                  setIsEnded(false);
                  ytPlayerRef.current?.seekTo?.(0, true);
                  ytPlayerRef.current?.playVideo();
                  setIsPlaying(true);
                }}
                className="px-5 rounded-2xl bg-sky-400 border-b-4 border-sky-600 text-slate-950 font-black text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t.gameRetryBtn}</span>
              </KidsSquishButton>
              <KidsSquishButton
                onClick={onClose}
                className="px-5 rounded-2xl bg-white/15 border-b-4 border-black/40 text-white font-black text-sm"
              >
                {t.theaterBackToKids}
              </KidsSquishButton>
            </div>

            {suggestions.length > 0 && onSelectItem && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-2xl pt-2">
                {suggestions.map((next) => (
                  <button
                    key={next.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onSelectItem(next);
                    }}
                    className="rounded-2xl bg-[#1A2552] hover:bg-[#253470] border-2 border-[#364994] p-2 text-start flex items-center gap-2.5 cursor-pointer transition-colors"
                  >
                    {next.poster && (
                      <img
                        src={next.poster}
                        alt={next.title}
                        referrerPolicy="no-referrer"
                        className="w-20 h-12 rounded-xl object-cover shrink-0 bg-black"
                      />
                    )}
                    <span className="font-display font-bold text-xs text-white line-clamp-2">
                      {next.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM KID-FRIENDLY CONTROLS DOCK */}
      <div className="shrink-0 rounded-3xl bg-[#182352]/95 border-2 border-[#32438A] px-3 py-2.5 flex flex-col gap-2 shadow-xl">
        {/* Rainbow progress bar for YouTube VOD OR Live channel switcher strip */}
        {!isLiveChannel ? (
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs font-black text-sky-200 tabular-nums shrink-0">
              {formatSec(currentSec)}
            </span>
            <div
              role="slider"
              aria-label="Video progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(durationSec)}
              aria-valuenow={Math.round(currentSec)}
              tabIndex={0}
              onClick={handleSeekBarClick}
              className="relative flex-1 h-4 rounded-full bg-[#0B1028] border border-white/15 overflow-hidden cursor-pointer"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-pink-400 to-sky-400 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-black text-sky-200 tabular-nums shrink-0">
              {formatSec(durationSec)}
            </span>
          </div>
        ) : suggestions.length > 0 && onSelectItem ? (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {suggestions.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSelectItem(ch);
                }}
                className="h-9 px-3 rounded-xl bg-[#22306B] hover:bg-amber-400 hover:text-slate-950 text-xs font-black text-white whitespace-nowrap cursor-pointer transition-colors shrink-0"
              >
                📺 {ch.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2.5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2.5 shrink-0">
            {!isLiveChannel && (
              <KidsSquishButton
                onClick={() => handleSeekDelta(-10)}
                ariaLabel={t.theaterRewind}
                className="w-16 rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-white border-b-4 border-[#10183B] flex items-center justify-center font-black text-xs gap-0.5"
              >
                <RotateCcw className="w-5 h-5" />
                <span>10</span>
              </KidsSquishButton>
            )}

            <KidsSquishButton
              onClick={handleTogglePlay}
              ariaLabel={isPlaying ? t.theaterPause : t.theaterPlay}
              className="px-6 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-base flex items-center gap-2 shadow-lg"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
              <span>{isPlaying ? t.theaterPause : t.theaterPlay}</span>
            </KidsSquishButton>

            {!isLiveChannel && (
              <KidsSquishButton
                onClick={() => handleSeekDelta(10)}
                ariaLabel={t.theaterForward}
                className="w-16 rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-white border-b-4 border-[#10183B] flex items-center justify-center font-black text-xs gap-0.5"
              >
                <span>10</span>
                <RotateCw className="w-5 h-5" />
              </KidsSquishButton>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <KidsSquishButton
              onClick={() => handleVolumeDelta(-15)}
              ariaLabel={`${t.theaterVolume} -`}
              className="w-16 rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-sky-200 border-b-4 border-[#10183B] font-black text-lg flex items-center justify-center"
            >
              🔉-
            </KidsSquishButton>

            <KidsSquishButton
              onClick={handleToggleMute}
              ariaLabel={isMuted ? t.theaterUnmute : t.theaterMute}
              className={`w-16 rounded-2xl border-b-4 flex items-center justify-center ${
                isMuted
                  ? 'bg-rose-500/30 text-rose-200 border-rose-700'
                  : 'bg-[#233270] text-emerald-300 border-[#10183B]'
              }`}
            >
              {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </KidsSquishButton>

            <KidsSquishButton
              onClick={() => handleVolumeDelta(15)}
              ariaLabel={`${t.theaterVolume} +`}
              className="w-16 rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-sky-200 border-b-4 border-[#10183B] font-black text-lg flex items-center justify-center"
            >
              🔊+
            </KidsSquishButton>

            <KidsSquishButton
              onClick={handleFullscreen}
              ariaLabel={t.theaterFullscreen}
              className="w-16 rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-white border-b-4 border-[#10183B] flex items-center justify-center"
            >
              <Maximize2 className="w-6 h-6" />
            </KidsSquishButton>
          </div>
        </div>
      </div>
    </div>
  );
};
