import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Video,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import type { EqPresetId, LyricsPayload } from '../../types/music';
import { EQ_PRESETS, sampleMusicSpectrum } from './MusicAudioEngine';
import { formatMusicTime } from './SpotifyPlayerBar';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanMusicLogo } from './RiffanMusicLogo';
import { MUSIC_I18N } from './musicI18n';

export const EqAndTimerModal: React.FC = () => {
  const showEqModal = useMusicStore((s) => s.showEqModal);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const eqPreset = useMusicStore((s) => s.eqPreset);
  const setEqPreset = useMusicStore((s) => s.setEqPreset);
  const playbackRate = useMusicStore((s) => s.playbackRate);
  const setPlaybackRate = useMusicStore((s) => s.setPlaybackRate);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);
  const setSleepTimerMinutes = useMusicStore((s) => s.setSleepTimerMinutes);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];

  useBackInterceptor(showEqModal, 'music-eq-modal', () => setShowEqModal(false), { priority: 25 });

  if (!showEqModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setShowEqModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#0F0814] border border-[#FF3366]/20 p-5 sm:p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#FF3366]/15 border border-[#FF3366]/35 flex items-center justify-center text-[#FF6B4A]">
              <Sliders className="w-4.5 h-4.5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">{m.eqTitle}</h3>
              <p className="text-xs text-zinc-400">{m.eqSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEqModal(false)}
            className="min-w-11 min-h-11 rounded-full bg-white/[0.06] hover:bg-white/12 text-zinc-300 flex items-center justify-center cursor-pointer"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400">{m.eqProfile}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(EQ_PRESETS) as EqPresetId[]).map((key) => {
              const active = eqPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setEqPreset(key);
                  }}
                  className={`min-h-11 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#FF3366] to-[#FF6B4A] border-[#FF3366] text-white shadow-[0_6px_18px_rgba(255,51,102,0.35)]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {EQ_PRESETS[key].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400">{m.playbackSpeed}</p>
          <div className="grid grid-cols-4 gap-2">
            {[0.85, 1, 1.15, 1.25].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                className={`min-h-10 rounded-xl border text-xs font-bold tabular-nums cursor-pointer transition-all ${
                  playbackRate === rate
                    ? 'bg-gradient-to-r from-[#FF3366] to-[#FF6B4A] border-[#FF3366] text-white'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {m.sleepTimer}
            </span>
            {sleepTimerEndsAt && (
              <span className="text-[#FF6B4A] font-semibold tabular-nums">
                {Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))} {m.minsRemaining}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[null, 15, 30, 60].map((mins) => (
              <button
                key={String(mins)}
                type="button"
                onClick={() => setSleepTimerMinutes(mins)}
                className={`min-h-10 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  (mins === null && !sleepTimerEndsAt)
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                {mins ? `${mins} min` : 'Off'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const FullScreenNowPlayingModal: React.FC<{
  onOpenPlaylistPicker?: () => void;
}> = ({ onOpenPlaylistPicker }) => {
  const showNowPlayingModal = useMusicStore((s) => s.showNowPlayingModal);
  const setShowNowPlayingModal = useMusicStore((s) => s.setShowNowPlayingModal);
  const nowPlayingTab = useMusicStore((s) => s.nowPlayingTab);
  const setNowPlayingTab = useMusicStore((s) => s.setNowPlayingTab);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const resolvedPlayback = useMusicStore((s) => s.resolvedPlayback);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const shuffle = useMusicStore((s) => s.shuffle);
  const repeatMode = useMusicStore((s) => s.repeatMode);
  const likedTracks = useMusicStore((s) => s.likedTracks);

  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const playNext = useMusicStore((s) => s.playNext);
  const playPrev = useMusicStore((s) => s.playPrev);
  const requestSeek = useMusicStore((s) => s.requestSeek);
  const toggleShuffle = useMusicStore((s) => s.toggleShuffle);
  const cycleRepeat = useMusicStore((s) => s.cycleRepeat);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];

  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.16));
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useBackInterceptor(
    showNowPlayingModal,
    'music-now-playing-modal',
    () => setShowNowPlayingModal(false),
    { priority: 20 }
  );

  // Fetch synced lyrics on track change
  useEffect(() => {
    if (!currentTrack) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    const qs = new URLSearchParams({
      artist: currentTrack.artist.name,
      title: currentTrack.title,
      album: currentTrack.album.title || '',
      duration: String(currentTrack.durationSec || 0),
    });
    fetch(`/api/music/lyrics?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setLyrics(data as LyricsPayload);
          setLyricsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics({ found: false, synced: false, lines: [] });
          setLyricsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

  // Animate FFT visualizer when open in artwork mode
  useEffect(() => {
    if (!showNowPlayingModal || nowPlayingTab !== 'artwork' || !isPlaying) return;
    let raf = 0;
    let lastTick = 0;
    const loop = (ts: number) => {
      if (ts - lastTick > 65) {
        lastTick = ts;
        const sampled = sampleMusicSpectrum(24);
        const allFlat = sampled.every((v) => v <= 0.15);
        if (allFlat) {
          setSpectrumBars((prev) =>
            prev.map((_, idx) => 0.18 + Math.abs(Math.sin(ts / 260 + idx * 0.55)) * 0.65)
          );
        } else {
          setSpectrumBars(sampled);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showNowPlayingModal, nowPlayingTab, isPlaying]);

  const activeLyricIndex = useMemo(() => {
    if (!lyrics?.found || !lyrics.synced || lyrics.lines.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeSec <= currentTime + 0.35) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyrics, currentTime]);

  useEffect(() => {
    if (nowPlayingTab === 'lyrics' && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeLyricIndex, nowPlayingTab]);

  if (!showNowPlayingModal || (!currentTrack && !activeRadio)) return null;

  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;
  const coverSrc = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';
  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSec || 0;
  const hasVideoOption = Boolean(
    currentTrack && (resolvedPlayback?.youtubeMvId || resolvedPlayback?.youtubeVideoId)
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#07050A] text-white flex flex-col overflow-hidden animate-fade-in">
      {/* Ambient Blurred Album Background */}
      {coverSrc ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-40 blur-3xl scale-125 transition-all duration-700"
          style={{
            backgroundImage: `url("${coverSrc}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 25%, rgba(255,51,102,0.18), rgba(245,158,11,0.08) 45%, rgba(7,5,10,0.92) 85%), linear-gradient(to bottom, rgba(7,5,10,0.45), rgba(7,5,10,0.88) 70%, #07050A)',
        }}
      />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3">
        <button
          type="button"
          onClick={() => setShowNowPlayingModal(false)}
          aria-label="Minimizar reproductor"
          className="min-w-11 min-h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#FF3366]"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        {/* Segmented Mode Switch: Portada / Letras / Videoclip */}
        <div className="inline-flex items-center p-1 rounded-full bg-white/[0.08] border border-white/12 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setNowPlayingTab('artwork')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
              nowPlayingTab === 'artwork'
                ? 'bg-gradient-to-r from-[#FF3366] to-[#FF6B4A] text-white shadow-[0_4px_14px_rgba(255,51,102,0.4)]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            {m.tabCover}
          </button>
          {currentTrack && (
            <button
              type="button"
              onClick={() => setNowPlayingTab('lyrics')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                nowPlayingTab === 'lyrics'
                  ? 'bg-gradient-to-r from-[#FF3366] to-[#FF6B4A] text-white shadow-[0_4px_14px_rgba(255,51,102,0.4)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Mic2 className="w-3.5 h-3.5" />
              {m.tabLyrics}
            </button>
          )}
          {hasVideoOption && (
            <button
              type="button"
              onClick={() => setNowPlayingTab('video')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                nowPlayingTab === 'video'
                  ? 'bg-gradient-to-r from-[#FF3366] to-[#FF6B4A] text-white shadow-[0_4px_14px_rgba(255,51,102,0.4)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {m.tabVideo}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenPlaylistPicker && currentTrack && (
            <button
              type="button"
              onClick={onOpenPlaylistPicker}
              title={m.addToPlaylist}
              className="min-w-11 min-h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            title={m.eqBtn}
            className="min-w-11 min-h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors"
          >
            <Sliders className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-5 sm:px-10 py-2 overflow-hidden">
        {nowPlayingTab === 'artwork' && (
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center">
              <div
                aria-hidden="true"
                className={`absolute -inset-4 rounded-[36px] blur-2xl transition-opacity duration-700 ${
                  isPlaying ? 'opacity-70' : 'opacity-25'
                }`}
                style={{
                  background:
                    'radial-gradient(circle, rgba(255,51,102,0.38) 0%, rgba(245,158,11,0.2) 60%, transparent 100%)',
                }}
              />
              <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-[#140A18] border border-white/20 shadow-[0_28px_72px_rgba(0,0,0,0.88)] flex items-center justify-center">
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={currentTrack?.title || activeRadio?.name || ''}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className={`w-full h-full object-cover transition-transform duration-700 ${
                      isPlaying ? 'scale-100' : 'scale-95 opacity-80'
                    }`}
                  />
                ) : null}
                {activeRadio ? (
                  <Radio className="w-16 h-16 text-[#FF6B4A] absolute pointer-events-none opacity-85" />
                ) : (
                  <RiffanMusicLogo variant="mark" size={76} withFrame={false} className="-z-10" />
                )}
              </div>
            </div>

            {/* Live Sonic Audio Spectrum Visualizer */}
            <div className="w-full max-w-xs h-9 flex items-end justify-center gap-1" aria-hidden="true">
              {spectrumBars.map((val, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-[#FF3366] via-[#FF6B4A] to-[#F59E0B] transition-[height] duration-75"
                  style={{
                    height: `${Math.round(val * 100)}%`,
                    opacity: 0.45 + val * 0.55,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {nowPlayingTab === 'lyrics' && (
          <div className="w-full max-w-2xl flex-1 min-h-0 overflow-y-auto px-2 sm:px-6 py-8 space-y-4 text-center mask-gradient">
            {lyricsLoading ? (
              <div className="py-20 text-zinc-400 text-sm">{m.searchingLyrics}</div>
            ) : !lyrics?.found ? (
              <div className="py-20 space-y-2">
                <Mic2 className="w-10 h-10 text-[#FF6B4A]/60 mx-auto" />
                <p className="text-base font-semibold text-zinc-200">
                  {m.noLyricsTitle}
                </p>
                <p className="text-xs text-zinc-400">
                  {m.noLyricsSub}
                </p>
              </div>
            ) : (
              lyrics.lines.map((line, idx) => {
                const isActive = lyrics.synced && idx === activeLyricIndex;
                const isPast = lyrics.synced && idx < activeLyricIndex;
                return (
                  <button
                    key={`${idx}-${line.timeSec}`}
                    ref={isActive ? activeLineRef : undefined}
                    type="button"
                    onClick={() => {
                      if (lyrics.synced) requestSeek(line.timeSec);
                    }}
                    className={`block w-full text-center px-3 py-2 rounded-2xl transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'text-white text-2xl sm:text-4xl font-extrabold scale-[1.03] drop-shadow-[0_0_24px_rgba(255,51,102,0.55)] bg-white/[0.04]'
                        : isPast
                        ? 'text-zinc-400/55 text-base sm:text-xl font-semibold hover:text-white'
                        : 'text-zinc-300/75 text-base sm:text-xl font-semibold hover:text-white'
                    }`}
                  >
                    {line.text}
                  </button>
                );
              })
            )}
          </div>
        )}

        {nowPlayingTab === 'video' && (
          <div className="w-full max-w-3xl aspect-video rounded-3xl overflow-hidden border border-white/15 bg-black shadow-2xl flex items-center justify-center">
            <p className="text-xs text-zinc-500">{m.videoStageSub}</p>
          </div>
        )}
      </main>

      {/* Bottom Controls */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto px-5 sm:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate">
              {activeRadio ? activeRadio.name : currentTrack?.title}
            </h2>
            <p className="text-sm text-zinc-300 truncate mt-0.5">
              {activeRadio
                ? `${activeRadio.country} · ${activeRadio.tags.join(' · ')}`
                : `${currentTrack?.artist.name}${currentTrack?.album.title ? ` · ${currentTrack.album.title}` : ''}`}
            </p>
          </div>

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                toggleLikeTrack(currentTrack);
              }}
              aria-label={isLiked ? m.likeRemove : m.likeAdd}
              className={`min-w-11 min-h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-90 ${
                isLiked ? 'text-[#FF3366]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>

        {/* Scrubber */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 100}
            value={activeRadio ? 100 : Math.min(currentTime, effectiveDuration || 100)}
            disabled={Boolean(activeRadio)}
            onChange={(e) => requestSeek(Number(e.target.value))}
            aria-label={m.playerRegionAria}
            className="w-full h-1.5 accent-[#FF3366] bg-white/20 rounded-full cursor-pointer"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums">
            <span>{activeRadio ? 'LIVE' : formatMusicTime(currentTime)}</span>
            <span>
              {activeRadio
                ? 'STREAM 24/7'
                : resolvedPlayback?.sourceLabel
                ? `${resolvedPlayback.sourceLabel} · ${formatMusicTime(effectiveDuration)}`
                : formatMusicTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Main Transport */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleShuffle}
            disabled={Boolean(activeRadio)}
            className={`min-w-11 min-h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              shuffle ? 'text-[#FF3366]' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={playPrev}
            disabled={Boolean(activeRadio)}
            className="min-w-12 min-h-12 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              togglePlayPause();
            }}
            aria-label={isPlaying ? m.pause : m.playNow}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF3366] via-[#FF544F] to-[#F59E0B] hover:scale-105 text-white flex items-center justify-center shadow-[0_14px_36px_rgba(255,51,102,0.5)] cursor-pointer transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            disabled={Boolean(activeRadio)}
            className="min-w-12 min-h-12 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeRadio) return;
              setShowNowPlayingModal(false);
              setShowQueueDrawer(true);
            }}
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            title={m.queueTitle}
          >
            <ListMusic className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            disabled={Boolean(activeRadio)}
            className={`min-w-11 min-h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              repeatMode !== 'off' ? 'text-[#FF3366]' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>
      </footer>
    </div>
  );
};
