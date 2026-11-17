import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Star,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';

interface KidsTheaterOverlayProps {
  title: string;
  isLive?: boolean;
  endedSignalSeq?: number;
  onClosePlayer: () => void;
}

/**
 * Overlay de Cine Infantil Inmersivo (Bloque IV):
 * - Controles gigantes (>= 64px) simplificados sin jerga técnica.
 * - Gestos táctiles (swipe horizontal ±10s, swipe vertical derecha volumen ±15%, doble toque).
 * - Al terminar (automático por <video onEnded> o botón "¡Terminé!"), lanza confeti Canvas y otorga +5 estrellas.
 */
export const KidsTheaterOverlay: React.FC<KidsTheaterOverlayProps> = ({
  title,
  isLive = false,
  endedSignalSeq = 0,
  onClosePlayer,
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

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volumePct, setVolumePct] = useState(100);
  const [gestureToast, setGestureToast] = useState<string | null>(null);
  const [rewardClaimedForTitle, setRewardClaimedForTitle] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  const gestureStartRef = useRef<{ x: number; y: number; width: number } | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);
  const lastHandledEndedSeqRef = useRef<number>(endedSignalSeq);

  const findVideoEl = (): HTMLVideoElement | null => {
    if (typeof document === 'undefined') return null;
    return document.querySelector('video');
  };

  useEffect(() => {
    setRewardClaimedForTitle(false);
  }, [title]);

  useEffect(() => {
    const v = findVideoEl();
    if (!v) return;
    const syncState = () => {
      setIsPlaying(!v.paused);
      setIsMuted(v.muted || v.volume === 0);
      setVolumePct(Math.round((v.muted ? 0 : v.volume) * 100));
    };
    syncState();
    v.addEventListener('play', syncState);
    v.addEventListener('pause', syncState);
    v.addEventListener('volumechange', syncState);
    return () => {
      v.removeEventListener('play', syncState);
      v.removeEventListener('pause', syncState);
      v.removeEventListener('volumechange', syncState);
    };
  }, [title]);

  const showToast = (msg: string) => {
    setGestureToast(msg);
    window.setTimeout(() => {
      setGestureToast((curr) => (curr === msg ? null : curr));
    }, 1400);
  };

  const triggerCompletionReward = () => {
    if (rewardClaimedForTitle) return;
    setRewardClaimedForTitle(true);
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
    if (endedSignalSeq > lastHandledEndedSeqRef.current) {
      lastHandledEndedSeqRef.current = endedSignalSeq;
      triggerCompletionReward();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endedSignalSeq]);

  const handleTogglePlay = () => {
    const v = findVideoEl();
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleSeekDelta = (deltaSec: number) => {
    const v = findVideoEl();
    if (!v || isLive) return;
    const maxDur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : v.currentTime + 600;
    v.currentTime = Math.max(0, Math.min(maxDur, v.currentTime + deltaSec));
    showToast(deltaSec < 0 ? `⏪ ${deltaSec}s` : `⏩ +${deltaSec}s`);
  };

  const handleVolumeDelta = (deltaFrac: number) => {
    const v = findVideoEl();
    if (!v) return;
    v.muted = false;
    const nextVol = Math.max(0, Math.min(1, v.volume + deltaFrac));
    v.volume = nextVol;
    const pct = Math.round(nextVol * 100);
    setIsMuted(pct === 0);
    setVolumePct(pct);
    showToast(`🔊 ${pct}%`);
  };

  const handleToggleMute = () => {
    const v = findVideoEl();
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    showToast(v.muted ? '🔇 0%' : `🔊 ${Math.round(v.volume * 100)}%`);
  };

  const handleFullscreen = () => {
    const target = findVideoEl() || document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void target.requestFullscreen?.().catch(() => {});
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    gestureStartRef.current = { x: touch.clientX, y: touch.clientY, width: rect.width };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    // Horizontal swipe -> Seek -10s / +10s
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      handleSeekDelta(dx > 0 ? 15 : -15);
      playKidsSound('tap', ux.soundEnabled, true);
      return;
    }

    // Vertical swipe -> Volume up/down
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.25) {
      handleVolumeDelta(dy < 0 ? 0.15 : -0.15);
      playKidsSound('tap', ux.soundEnabled, true);
      return;
    }

    // Double tap left/right -> Quick -10s / +10s
    const now = Date.now();
    const side: 'left' | 'right' = touch.clientX < start.width / 2 ? 'left' : 'right';
    if (lastTapRef.current && now - lastTapRef.current.time < 320 && lastTapRef.current.side === side) {
      lastTapRef.current = null;
      handleSeekDelta(side === 'right' ? 10 : -10);
      playKidsSound('tap', ux.soundEnabled, true);
    } else {
      lastTapRef.current = { time: now, side };
    }
  };

  return (
    <div dir={dir} className="shrink-0 flex flex-col gap-2 px-3 py-2.5 bg-[#12193A] border-t-2 border-[#2D3E7D]">
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* Interactive Swipe Gesture Pad & Status */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[#192352] border border-sky-400/25 select-none touch-pan-y"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">🎬</span>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-black text-white truncate">{title}</div>
            <div className="text-xs text-sky-200/80 truncate">{t.theaterGestureHint}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {gestureToast && (
            <span className="px-3 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-sm shadow">
              {gestureToast}
            </span>
          )}
          <span className="text-xs font-black text-amber-300 tabular-nums">
            🔊 {isMuted ? '0%' : `${volumePct}%`}
          </span>
        </div>
      </div>

      {/* Gigantic Kid-Safe Playback Dock (>= 64px Fitts targets) */}
      <div className="flex items-center justify-between gap-2.5 overflow-x-auto no-scrollbar py-0.5">
        <div className="flex items-center gap-2.5 shrink-0">
          <KidsSquishButton
            onClick={onClosePlayer}
            ariaLabel={t.theaterBackToKids}
            className="px-4 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white border-b-4 border-rose-700 font-black text-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t.theaterBackToKids}</span>
          </KidsSquishButton>

          {!isLive && (
            <KidsSquishButton
              onClick={() => handleSeekDelta(-10)}
              ariaLabel={t.theaterRewind}
              className="w-16 rounded-2xl bg-[#1D2859] hover:bg-[#293879] text-white border-b-4 border-[#0E1533] flex items-center justify-center font-black text-xs gap-0.5"
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

          {!isLive && (
            <KidsSquishButton
              onClick={() => handleSeekDelta(10)}
              ariaLabel={t.theaterForward}
              className="w-16 rounded-2xl bg-[#1D2859] hover:bg-[#293879] text-white border-b-4 border-[#0E1533] flex items-center justify-center font-black text-xs gap-0.5"
            >
              <span>10</span>
              <RotateCw className="w-5 h-5" />
            </KidsSquishButton>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <KidsSquishButton
            onClick={() => handleVolumeDelta(-0.15)}
            ariaLabel={`${t.theaterVolume} -`}
            className="w-16 rounded-2xl bg-[#1D2859] hover:bg-[#293879] text-sky-200 border-b-4 border-[#0E1533] font-black text-lg flex items-center justify-center"
          >
            🔉-
          </KidsSquishButton>

          <KidsSquishButton
            onClick={handleToggleMute}
            ariaLabel={isMuted ? t.theaterUnmute : t.theaterMute}
            className={`w-16 rounded-2xl border-b-4 flex items-center justify-center ${
              isMuted
                ? 'bg-rose-500/30 text-rose-200 border-rose-700'
                : 'bg-[#1D2859] text-emerald-300 border-[#0E1533]'
            }`}
          >
            {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
          </KidsSquishButton>

          <KidsSquishButton
            onClick={() => handleVolumeDelta(0.15)}
            ariaLabel={`${t.theaterVolume} +`}
            className="w-16 rounded-2xl bg-[#1D2859] hover:bg-[#293879] text-sky-200 border-b-4 border-[#0E1533] font-black text-lg flex items-center justify-center"
          >
            🔊+
          </KidsSquishButton>

          <KidsSquishButton
            onClick={handleFullscreen}
            ariaLabel={t.theaterFullscreen}
            className="w-16 rounded-2xl bg-[#1D2859] hover:bg-[#293879] text-white border-b-4 border-[#0E1533] flex items-center justify-center"
          >
            <Maximize2 className="w-6 h-6" />
          </KidsSquishButton>

          <KidsSquishButton
            onClick={triggerCompletionReward}
            disabled={rewardClaimedForTitle}
            sound="star"
            className={`px-4 rounded-2xl border-b-4 font-black text-sm flex items-center gap-1.5 ${
              rewardClaimedForTitle
                ? 'bg-emerald-500 text-slate-950 border-emerald-700'
                : 'bg-gradient-to-b from-emerald-400 to-teal-500 text-slate-950 border-teal-700'
            }`}
          >
            <Star className="w-5 h-5 fill-current" />
            <span>{rewardClaimedForTitle ? '✅ +5 ⭐' : t.theaterClaimFiveStars}</span>
          </KidsSquishButton>
        </div>
      </div>
    </div>
  );
};
