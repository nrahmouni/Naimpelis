import React, { useEffect, useState } from 'react';
import {
  Car,
  Clock,
  Headphones,
  Heart,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Sun,
  X,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { CoverArt } from './CoverArt';
import { MUSIC_I18N } from './musicI18n';
import { formatMusicTime } from './SpotifyPlayerBar';
import { getSpatialPresetConfig } from './spatialPresets';

export const DriveModeOverlay: React.FC = () => {
  const driveModeOpen = useMusicStore((s) => s.driveModeOpen);
  const setDriveModeOpen = useMusicStore((s) => s.setDriveModeOpen);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);
  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const playNext = useMusicStore((s) => s.playNext);
  const playPrev = useMusicStore((s) => s.playPrev);
  const requestSeek = useMusicStore((s) => s.requestSeek);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];
  const activePreset = getSpatialPresetConfig(spatial8dMode);

  const [sleepRemainingSec, setSleepRemainingSec] = useState(0);
  useEffect(() => {
    if (!driveModeOpen || !sleepTimerEndsAt) {
      setSleepRemainingSec(0);
      return;
    }
    const tick = () => setSleepRemainingSec(Math.max(0, Math.ceil((sleepTimerEndsAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [driveModeOpen, sleepTimerEndsAt]);

  useBackInterceptor(driveModeOpen, 'music-drive-mode', () => setDriveModeOpen(false), {
    priority: 30,
  });

  if (!driveModeOpen || (!currentTrack && !activeRadio)) return null;

  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;
  const coverSrc = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';
  const titleText = activeRadio ? activeRadio.name : currentTrack?.title || '';
  const artistText = activeRadio
    ? `${activeRadio.country} · ${activeRadio.tags.join(' · ')}`
    : currentTrack?.artist.name || '';
  const effDur = duration > 0 ? duration : currentTrack?.durationSec || 0;

  return (
    <div className="fixed inset-0 z-[60] bg-[#000000] text-white flex flex-col justify-between p-5 sm:p-8 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-2.5 text-xs font-bold text-[#60A5FA] min-w-0">
          <Car className="w-5 h-5 shrink-0" />
          <span>{m.driveModeBtn}</span>
          <span className="text-zinc-500">·</span>
          <span className="inline-flex items-center gap-1 text-zinc-300 font-medium truncate">
            <Sun className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
            {m.driveModeWakeLock}
          </span>
          {sleepRemainingSec > 0 && (
            <>
              <span className="text-zinc-500">·</span>
              <span className="inline-flex items-center gap-1 text-[#60A5FA] font-bold tabular-nums">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                {formatMusicTime(sleepRemainingSec)}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDriveModeOpen(false)}
          className="min-h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>{m.driveModeExit}</span>
        </button>
      </div>

      {/* Center Artwork & Bold Typography */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 py-4 max-w-lg w-full mx-auto text-center">
        <div className="w-40 h-40 sm:w-56 sm:h-56 rounded-3xl overflow-hidden border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.9)] shrink-0">
          <CoverArt src={coverSrc} alt={titleText} fallbackLabel={artistText} priority />
        </div>

        <div className="w-full space-y-1.5 px-2">
          <h2 className="font-display text-2xl sm:text-4xl font-black text-white leading-tight line-clamp-2">
            {titleText}
          </h2>
          <p className="text-base sm:text-xl font-semibold text-zinc-300 truncate">{artistText}</p>
        </div>

        {/* Interactive Car-Friendly Seekable Progress Slider */}
        <div className="w-full space-y-2">
          <input
            type="range"
            min={0}
            max={effDur || 100}
            value={activeRadio ? 100 : Math.min(currentTime, effDur || 100)}
            disabled={Boolean(activeRadio)}
            onChange={(e) => requestSeek(Number(e.target.value))}
            aria-label={m.playerRegionAria}
            className="w-full h-3 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
          />
          <div className="flex justify-between text-xs font-bold text-zinc-400 tabular-nums">
            <span>{activeRadio ? 'LIVE' : formatMusicTime(currentTime)}</span>
            <span>{activeRadio ? '24/7' : formatMusicTime(effDur)}</span>
          </div>
        </div>
      </div>

      {/* Oversized Glove-Friendly Transport Controls + -10s / +10s */}
      <div className="pb-[env(safe-area-inset-bottom,0px)] max-w-lg w-full mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            disabled={Boolean(activeRadio)}
            onClick={() => {
              triggerHaptic('medium');
              playPrev();
            }}
            aria-label="Prev"
            className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-white cursor-pointer disabled:opacity-30 active:scale-95 transition-transform"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            disabled={Boolean(activeRadio)}
            onClick={() => {
              triggerHaptic('light');
              requestSeek(Math.max(0, currentTime - 10));
            }}
            aria-label="-10s"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] flex flex-col items-center justify-center text-zinc-200 cursor-pointer disabled:opacity-30"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-[10px] font-bold tabular-nums">-10s</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              togglePlayPause();
            }}
            aria-label={isPlaying ? m.pause : m.playNow}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white flex items-center justify-center shadow-[0_12px_36px_rgba(59,130,246,0.45)] cursor-pointer active:scale-95 transition-transform"
          >
            {isPlaying ? (
              <Pause className="w-10 h-10 fill-current" />
            ) : (
              <Play className="w-10 h-10 fill-current ml-1" />
            )}
          </button>

          <button
            type="button"
            disabled={Boolean(activeRadio)}
            onClick={() => {
              triggerHaptic('light');
              requestSeek(Math.min(effDur || currentTime + 10, currentTime + 10));
            }}
            aria-label="+10s"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] flex flex-col items-center justify-center text-zinc-200 cursor-pointer disabled:opacity-30"
          >
            <RotateCw className="w-5 h-5" />
            <span className="text-[10px] font-bold tabular-nums">+10s</span>
          </button>

          <button
            type="button"
            disabled={Boolean(activeRadio)}
            onClick={() => {
              triggerHaptic('medium');
              playNext();
            }}
            aria-label="Next"
            className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-white cursor-pointer disabled:opacity-30 active:scale-95 transition-transform"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                toggleLikeTrack(currentTrack);
              }}
              className={`min-h-12 rounded-2xl border font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer ${
                isLiked
                  ? 'bg-[#FF2D55]/20 border-[#FF2D55] text-[#FF2D55]'
                  : 'bg-white/[0.07] border-white/12 text-white'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span>{isLiked ? m.saved : m.likeAdd}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setShowEqModal(true);
            }}
            className={`min-h-12 rounded-2xl border font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer ${
              currentTrack ? '' : 'col-span-2'
            } ${
              spatial8dEnabled
                ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                : 'bg-white/[0.07] border-white/12 text-white'
            }`}
          >
            <Headphones className="w-5 h-5" />
            <span>{spatial8dEnabled ? activePreset.names[musicLang] : m.spatial8dBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
