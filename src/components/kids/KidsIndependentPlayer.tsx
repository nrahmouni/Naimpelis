import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Star,
  Trophy,
  Volume1,
  Volume2,
  VolumeX,
  Youtube,
} from 'lucide-react';
import type { CatalogMovie } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { EXTENDED_VOCAB_ITEMS } from './kidsCurriculumData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsAnimatedCategoryIcon, KidsVocabSvg } from './KidsSvgArt';

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
 * Kid-safe independent YouTube Kids player.
 * Supports Portrait mobile, Horizontal landscape mobile, Tablet, and Google TV D-Pad remote controls.
 * Zero external YouTube clutter and zero emojis.
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
  const consumeCinemaMinute = useKidsStore((s) => s.consumeCinemaMinute);
  const tickActiveMinute = useKidsStore((s) => s.tickActiveMinute);
  const recordDomainResult = useKidsStore((s) => s.recordDomainResult);

  const profile = getActiveProfile();
  const kidsLang = profile.preferredLang;
  const ageGroup = profile.ageGroup;
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const ytVideoId = useMemo(() => extractYouTubeVideoId(item), [item]);

  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YouTubePlayerInstance | null>(null);
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
  const [magicPauseDone, setMagicPauseDone] = useState(false);
  const [magicPauseData, setMagicPauseData] = useState<{
    word: string;
    targetId: string;
    choices: Array<{ id: string; iconId: string; label: string }>;
  } | null>(null);

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

  const openMagicPause = () => {
    const pool = [...EXTENDED_VOCAB_ITEMS].sort(() => Math.random() - 0.5).slice(0, 3);
    const target = pool[0];
    if (!target) return;
    const rawWord = (target.translations[kidsLang] || target.translations.es).word;
    const cleanWord = (rawWord.includes('(') ? rawWord.slice(0, rawWord.indexOf('(')) : rawWord).trim();
    ytPlayerRef.current?.pauseVideo?.();
    setIsPlaying(false);
    setMagicPauseDone(true);
    setMagicPauseData({
      word: cleanWord,
      targetId: target.id,
      choices: [...pool]
        .sort(() => Math.random() - 0.5)
        .map((c) => ({
          id: c.id,
          iconId: c.iconId,
          label: c.translations.es.word,
        })),
    });
    if (ux.soundEnabled) {
      void speakKidsText(cleanWord, kidsLang, { ageGroup });
    }
  };

  useEffect(() => {
    setRewardClaimed(false);
    setMagicPauseDone(false);
    setMagicPauseData(null);
    setIsEnded(false);
    setStreamError(null);
    setCurrentSec(0);
    setDurationSec(0);
    setIsBuffering(true);
    setIsPlaying(true);
  }, [item.id]);

  useEffect(() => {
    if (!isPlaying || isEnded || streamError) return;
    const timer = window.setInterval(() => {
      consumeCinemaMinute();
      tickActiveMinute('cinema');
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [consumeCinemaMinute, isEnded, isPlaying, streamError, tickActiveMinute]);

  useEffect(() => {
    if (!magicPauseDone && currentSec >= 120 && isPlaying && !isEnded) {
      openMagicPause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSec, isEnded, isPlaying, magicPauseDone]);

  useEffect(() => {
    if (!ytVideoId) {
      setIsBuffering(false);
      setStreamError(t.catalogLoadError);
      return;
    }

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
  }, [ytVideoId, retryCounter, t.catalogLoadError]);

  const handleTogglePlay = () => {
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
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
    const yt = ytPlayerRef.current;
    if (!yt) return;
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    const cur = yt.getCurrentTime?.() || currentSec;
    const dur = yt.getDuration?.() || durationSec || cur + 300;
    const next = Math.max(0, Math.min(dur, cur + deltaSec));
    yt.seekTo?.(next, true);
    setCurrentSec(next);
    showToast(deltaSec < 0 ? `${deltaSec} s` : `+${deltaSec} s`);
  };

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (durationSec <= 0) return;
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

    if (ytPlayerRef.current) {
      if (nextPct === 0) ytPlayerRef.current.mute?.();
      else {
        ytPlayerRef.current.unMute?.();
        ytPlayerRef.current.setVolume?.(nextPct);
      }
    }
    showToast(`${t.theaterVolume}: ${nextPct}%`);
  };

  const handleToggleMute = () => {
    triggerHaptic('light');
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (ytPlayerRef.current) {
      if (nextMuted) ytPlayerRef.current.mute?.();
      else ytPlayerRef.current.unMute?.();
    }
    showToast(nextMuted ? t.theaterMute : `${t.theaterVolume}: ${volumePct}%`);
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
      }
    };

    window.addEventListener('keydown', handleRemoteKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleRemoteKey, { capture: true });
    };
  });

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
    durationSec > 0 ? Math.max(0, Math.min(100, (currentSec / durationSec) * 100)) : 0;

  const suggestions = upNextItems.filter((u) => u.id !== item.id).slice(0, 3);

  return (
    <div
      ref={stageWrapRef}
      dir={dir}
      className="fixed inset-0 z-[270] bg-gradient-to-b from-[#131C44] via-[#0D1330] to-[#080C1F] flex flex-col gap-2 sm:gap-3 p-2.5 sm:p-4 landscape:gap-1.5 landscape:p-2 overflow-hidden select-none"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* TOP PLAYER HEADER */}
      <div className="shrink-0 flex items-center justify-between gap-2 sm:gap-3 rounded-2xl sm:rounded-3xl bg-[#182352]/95 border-2 border-[#32438A] px-2.5 sm:px-3 py-1.5 sm:py-2 landscape:py-1 shadow-xl">
        <KidsSquishButton
          onClick={onClose}
          ariaLabel={t.theaterBackToKids}
          className="px-3.5 sm:px-5 rounded-xl sm:rounded-2xl bg-rose-500 hover:bg-rose-400 text-white border-b-4 border-rose-700 font-black text-xs sm:text-sm flex items-center gap-1.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 rtl:rotate-180" />
          <span>{t.theaterBackToKids}</span>
        </KidsSquishButton>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-2 px-1">
          <KidsAnimatedCategoryIcon name="cinema" size={22} />
          <div className="min-w-0 text-center sm:text-start">
            <h2 className="font-display font-black text-xs sm:text-base text-white truncate">
              {item.title}
            </h2>
            <p className="text-[10px] sm:text-[11px] font-bold text-sky-200/80 truncate hidden sm:block">
              YouTube Kids {item.overview ? `· ${item.overview}` : ''}
            </p>
          </div>
          <KidsSpeakButton text={item.title} lang={kidsLang} size="md" className="hidden sm:flex" />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <KidsSquishButton
            onClick={openMagicPause}
            className="hidden sm:flex px-3 rounded-xl sm:rounded-2xl bg-indigo-500/25 hover:bg-indigo-500/40 border border-indigo-300/40 border-b-4 text-indigo-100 font-black text-xs items-center gap-1"
          >
            <span>Pausa Mágica +3</span>
          </KidsSquishButton>

          <KidsSquishButton
            onClick={triggerCompletionReward}
            disabled={rewardClaimed}
            sound="star"
            className={`px-3 sm:px-4 rounded-xl sm:rounded-2xl border-b-4 font-black text-xs sm:text-sm flex items-center gap-1.5 shrink-0 ${
              rewardClaimed
                ? 'bg-emerald-400 text-slate-950 border-emerald-600'
                : 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-700'
            }`}
          >
            <Star className="w-4 h-4 fill-current" />
            <span className="tabular-nums">{rewardClaimed ? '+5' : t.theaterClaimFiveStars}</span>
          </KidsSquishButton>
        </div>
      </div>

      {/* CENTER YOUTUBE KIDS VIDEO STAGE */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 min-h-0 rounded-2xl sm:rounded-3xl bg-black border-2 sm:border-4 border-[#324691] shadow-[0_20px_50px_rgba(0,0,0,0.65)] overflow-hidden flex items-center justify-center"
      >
        <div ref={ytHostRef} className="w-full h-full bg-black" />

        {!isPlaying && !isEnded && !streamError && (
          <button
            type="button"
            data-tv-focusable="true"
            onClick={handleTogglePlay}
            aria-label={t.theaterPlay}
            className="absolute inset-0 z-10 bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 cursor-pointer"
          >
            <span className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 flex items-center justify-center shadow-2xl">
              <Play className="w-10 h-10 sm:w-12 sm:h-12 fill-current ms-1" />
            </span>
            <span className="font-display font-black text-lg sm:text-xl text-white drop-shadow">
              {t.theaterPlay}
            </span>
          </button>
        )}

        {isBuffering && !streamError && (
          <div className="pointer-events-none absolute inset-0 z-20 bg-[#0D1330]/60 flex flex-col items-center justify-center gap-2">
            <KidsAnimatedCategoryIcon name="cinema" size={48} />
            <span className="text-sm font-black text-sky-200">YouTube Kids...</span>
          </div>
        )}

        {gestureToast && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-2xl bg-amber-400 text-slate-950 font-black text-sm sm:text-base shadow-xl">
            {gestureToast}
          </div>
        )}

        {streamError && (
          <div className="absolute inset-0 z-30 bg-[#0F1636]/95 flex flex-col items-center justify-center p-6 text-center gap-4">
            <Youtube className="w-12 h-12 text-rose-400" />
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

        {isEnded && (
          <div className="absolute inset-0 z-30 bg-[#0D1433]/92 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
              <Trophy className="w-9 h-9 text-amber-300" />
            </div>
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
                    data-tv-focusable="true"
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

        {magicPauseData && (
          <div className="absolute inset-0 z-40 bg-[#0B112B]/95 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center gap-4">
            <span className="px-3 py-1 rounded-full bg-indigo-500/25 border border-indigo-300/40 text-indigo-200 text-xs font-black uppercase">
              Pausa Mágica Educativa · +3 Estrellas
            </span>
            <h3 className="font-display font-black text-2xl sm:text-3xl text-amber-300">
              ¿Cuál es &ldquo;{magicPauseData.word}&rdquo;?
            </h3>
            <div className="grid grid-cols-3 gap-3 max-w-md w-full">
              {magicPauseData.choices.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    const isOk = ch.id === magicPauseData.targetId;
                    if (isOk) {
                      playKidsSound('levelUp', ux.soundEnabled, true);
                      setConfettiActive(true);
                      awardStars(3, 'cinefilo_kids');
                      recordDomainResult('lang', true, ch.id);
                      showToast('+3 Estrellas');
                    } else {
                      playKidsSound('error', ux.soundEnabled, false);
                      recordDomainResult('lang', false, magicPauseData.targetId);
                      awardStars(1);
                      showToast('+1 por participar');
                    }
                    setMagicPauseData(null);
                    ytPlayerRef.current?.playVideo?.();
                    setIsPlaying(true);
                  }}
                  className="p-3 rounded-2xl bg-[#182352] hover:bg-[#233270] border-2 border-white/15 flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <KidsVocabSvg iconId={ch.iconId} size={52} />
                  <span className="text-xs font-black text-white">{ch.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setMagicPauseData(null);
                ytPlayerRef.current?.playVideo?.();
                setIsPlaying(true);
              }}
              className="text-xs font-bold text-sky-300 hover:underline cursor-pointer"
            >
              Continuar vídeo
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM KID-FRIENDLY CONTROLS DOCK */}
      <div className="shrink-0 rounded-2xl sm:rounded-3xl bg-[#182352]/95 border-2 border-[#32438A] px-2.5 sm:px-3 py-1.5 sm:py-2.5 landscape:py-1.5 flex flex-col gap-1.5 sm:gap-2 shadow-xl">
        <div className="flex items-center gap-2.5 px-1">
          <span className="text-[11px] sm:text-xs font-black text-sky-200 tabular-nums shrink-0">
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
            className="relative flex-1 h-3.5 sm:h-4 rounded-full bg-[#0B1028] border border-white/15 overflow-hidden cursor-pointer"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 via-pink-400 to-sky-400 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[11px] sm:text-xs font-black text-sky-200 tabular-nums shrink-0">
            {formatSec(durationSec)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <KidsSquishButton
              onClick={() => handleSeekDelta(-10)}
              ariaLabel={t.theaterRewind}
              className="!min-w-[44px] px-2.5 sm:w-16 rounded-xl sm:rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-white border-b-4 border-[#10183B] flex items-center justify-center font-black text-xs gap-1"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>10</span>
            </KidsSquishButton>

            <KidsSquishButton
              onClick={handleTogglePlay}
              ariaLabel={isPlaying ? t.theaterPause : t.theaterPlay}
              className="px-4 sm:px-6 rounded-xl sm:rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-xs sm:text-base flex items-center gap-1.5 sm:gap-2 shadow-lg"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
              ) : (
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
              )}
              <span>{isPlaying ? t.theaterPause : t.theaterPlay}</span>
            </KidsSquishButton>

            <KidsSquishButton
              onClick={() => handleSeekDelta(10)}
              ariaLabel={t.theaterForward}
              className="!min-w-[44px] px-2.5 sm:w-16 rounded-xl sm:rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-white border-b-4 border-[#10183B] flex items-center justify-center font-black text-xs gap-1"
            >
              <span>10</span>
              <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
            </KidsSquishButton>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <KidsSquishButton
              onClick={() => handleVolumeDelta(-15)}
              ariaLabel={`${t.theaterVolume} -`}
              className="hidden sm:flex landscape:flex px-3 sm:w-16 rounded-xl sm:rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-sky-200 border-b-4 border-[#10183B] font-black text-sm items-center justify-center gap-0.5"
            >
              <Volume1 className="w-5 h-5" />
              <span>-</span>
            </KidsSquishButton>

            <KidsSquishButton
              onClick={handleToggleMute}
              ariaLabel={isMuted ? t.theaterUnmute : t.theaterMute}
              className={`!min-w-[44px] px-2.5 sm:w-16 rounded-xl sm:rounded-2xl border-b-4 flex items-center justify-center ${
                isMuted
                  ? 'bg-rose-500/30 text-rose-200 border-rose-700'
                  : 'bg-[#233270] text-emerald-300 border-[#10183B]'
              }`}
            >
              {isMuted ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
            </KidsSquishButton>

            <KidsSquishButton
              onClick={() => handleVolumeDelta(15)}
              ariaLabel={`${t.theaterVolume} +`}
              className="hidden sm:flex landscape:flex px-3 sm:w-16 rounded-xl sm:rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-sky-200 border-b-4 border-[#10183B] font-black text-sm items-center justify-center gap-0.5"
            >
              <Volume2 className="w-5 h-5" />
              <span>+</span>
            </KidsSquishButton>

            <KidsSquishButton
              onClick={handleFullscreen}
              ariaLabel={t.theaterFullscreen}
              className="!min-w-[44px] px-2.5 sm:w-16 rounded-xl sm:rounded-2xl bg-[#233270] hover:bg-[#2E418F] text-white border-b-4 border-[#10183B] flex items-center justify-center"
            >
              <Maximize2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </KidsSquishButton>
          </div>
        </div>
      </div>
    </div>
  );
};
