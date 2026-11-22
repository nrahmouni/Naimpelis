import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Car,
  ChevronDown,
  Copy,
  Disc3,
  Download,
  FolderDown,
  HardDrive,
  Headphones,
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  ThumbsDown,
  Users,
  Wand2,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import type { LyricsPayload } from '../../types/music';
import {
  getSpatial8dTelemetry,
  sampleMusicSpectrum,
  saveTrackToOfflineLibrary,
  startDownloadMp3Job,
} from './MusicAudioEngine';
import { formatMusicTime } from './SpotifyPlayerBar';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { CoverArt } from './CoverArt';
import { MUSIC_I18N } from './musicI18n';
import { getSpatialPresetConfig } from './spatialPresets';

export { SpatialAudioPresetModal as EqAndTimerModal } from './SpatialAudioPresetModal';

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
  const switchPlaybackSource = useMusicStore((s) => s.switchPlaybackSource);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const shuffle = useMusicStore((s) => s.shuffle);
  const repeatMode = useMusicStore((s) => s.repeatMode);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const offlineTrackIds = useMusicStore((s) => s.offlineTrackIds);
  const exportBitrate = useMusicStore((s) => s.exportBitrate);

  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const playNext = useMusicStore((s) => s.playNext);
  const playPrev = useMusicStore((s) => s.playPrev);
  const requestSeek = useMusicStore((s) => s.requestSeek);
  const toggleShuffle = useMusicStore((s) => s.toggleShuffle);
  const cycleRepeat = useMusicStore((s) => s.cycleRepeat);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const dislikeTrack = useMusicStore((s) => s.dislikeTrack);
  const showMusicToast = useMusicStore((s) => s.showMusicToast);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const setDriveModeOpen = useMusicStore((s) => s.setDriveModeOpen);
  const setShowDownloadDrawer = useMusicStore((s) => s.setShowDownloadDrawer);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const vocalCancel = useMusicStore((s) => s.vocalCancel);
  const setVocalCancel = useMusicStore((s) => s.setVocalCancel);
  const autoDjEnabled = useMusicStore((s) => s.autoDjEnabled);
  const toggleAutoDj = useMusicStore((s) => s.toggleAutoDj);
  const jamSession = useMusicStore((s) => s.jamSession);
  const toggleJamSession = useMusicStore((s) => s.toggleJamSession);
  const startSeedRadio = useMusicStore((s) => s.startSeedRadio);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];
  const activeSpatialPreset = getSpatialPresetConfig(spatial8dMode);

  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsScale, setLyricsScale] = useState<'sm' | 'md' | 'lg'>('md');
  const [lyricsCopiedToast, setLyricsCopiedToast] = useState(false);
  const [orbitDeg, setOrbitDeg] = useState(0);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const artWrapperRef = useRef<HTMLDivElement | null>(null);
  const artGlowRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // Smooth Canvas FFT Spectrum, 8D Spatial Radar & Song-Synced Cover Artwork Animator
  useEffect(() => {
    if (!showNowPlayingModal) return;
    let raf = 0;
    let smoothedBass = 0;
    const renderCanvas = (ts: number) => {
      const barsCount = 32;
      const sampled = isPlaying
        ? sampleMusicSpectrum(barsCount)
        : Array.from({ length: barsCount }, () => 0.14);
      const allFlat = isPlaying && sampled.every((v) => v <= 0.15);
      const values = allFlat
        ? sampled.map((_, idx) => 0.2 + Math.abs(Math.sin(ts / 245 + idx * 0.52)) * 0.65)
        : sampled;

      // Drive synchronized cover artwork pulse & ambient glow directly via DOM refs at 60fps
      if (artWrapperRef.current) {
        if (isPlaying) {
          const bassBins = values.slice(0, 6);
          const bassAvg = bassBins.reduce((sum, v) => sum + v, 0) / bassBins.length;
          const midBins = values.slice(6, 16);
          const midAvg = midBins.reduce((sum, v) => sum + v, 0) / midBins.length;
          const instantEnergy = bassAvg * 0.72 + midAvg * 0.28;
          smoothedBass = smoothedBass * 0.72 + instantEnergy * 0.28;
          const scale = 1 + Math.min(0.065, smoothedBass * 0.075);
          const swayDeg = Math.sin(ts / 880) * Math.min(1.6, smoothedBass * 2.1);
          const floatY = Math.cos(ts / 640) * Math.min(3, smoothedBass * 3.8);
          artWrapperRef.current.style.transform = `translate3d(0, ${floatY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${swayDeg.toFixed(2)}deg)`;
          if (artGlowRef.current) {
            const glowScale = 1 + Math.min(0.18, smoothedBass * 0.22);
            const glowOpacity = Math.min(0.95, 0.42 + smoothedBass * 0.62);
            artGlowRef.current.style.transform = `scale(${glowScale.toFixed(4)})`;
            artGlowRef.current.style.opacity = glowOpacity.toFixed(3);
          }
        } else {
          smoothedBass = smoothedBass * 0.85;
          artWrapperRef.current.style.transform = 'translate3d(0, 0px, 0) scale(0.96) rotate(0deg)';
          if (artGlowRef.current) {
            artGlowRef.current.style.transform = 'scale(0.95)';
            artGlowRef.current.style.opacity = '0.24';
          }
        }
      }

      const canvas = canvasRef.current;
      if (canvas && nowPlayingTab === 'artwork') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const gap = 3;
          const barW = Math.max(2, (w - gap * (barsCount - 1)) / barsCount);
          const grad = ctx.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, '#1D4ED8');
          grad.addColorStop(0.55, '#3B82F6');
          grad.addColorStop(1, '#60A5FA');
          ctx.fillStyle = grad;

          values.forEach((v, idx) => {
            const barH = Math.max(4, Math.round(v * (h - 2)));
            const x = idx * (barW + gap);
            const y = h - barH;
            ctx.globalAlpha = 0.45 + v * 0.55;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 3);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        }
      }
      if (isPlaying && nowPlayingTab === 'artwork') {
        const telemetry = getSpatial8dTelemetry();
        setOrbitDeg((telemetry.angleRad * 180) / Math.PI);
      }
      raf = requestAnimationFrame(renderCanvas);
    };
    raf = requestAnimationFrame(renderCanvas);
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
  const isSavedOffline = currentTrack ? offlineTrackIds.includes(currentTrack.id) : false;
  const coverSrc = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';
  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSec || 0;

  const handleCopyLyrics = async () => {
    if (!lyrics?.found || lyrics.lines.length === 0) return;
    const text = lyrics.lines.map((l) => l.text).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setLyricsCopiedToast(true);
      window.setTimeout(() => setLyricsCopiedToast(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Vertical swipe-down dismisses Now Playing; horizontal swipe never skips tracks (buttons only)
    if (dy > 95 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      triggerHaptic('light');
      setShowNowPlayingModal(false);
    }
  };

  const lyricSizeClasses =
    lyricsScale === 'sm'
      ? { active: 'text-xl sm:text-3xl', idle: 'text-sm sm:text-lg' }
      : lyricsScale === 'lg'
      ? { active: 'text-3xl sm:text-5xl', idle: 'text-lg sm:text-2xl' }
      : { active: 'text-2xl sm:text-4xl', idle: 'text-base sm:text-xl' };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#000000] text-white flex flex-col overflow-hidden animate-fade-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
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
            'radial-gradient(ellipse 80% 55% at 50% 25%, rgba(37,99,235,0.22), rgba(96,165,250,0.09) 45%, rgba(0,0,0,0.94) 85%), linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.9) 70%, #000000)',
        }}
      />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between gap-2 px-3 sm:px-8 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2.5">
        <button
          type="button"
          onClick={() => setShowNowPlayingModal(false)}
          aria-label={m.back}
          className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        {/* Segmented Mode Switch: Cover / Lyrics */}
        <div className="inline-flex items-center p-0.5 sm:p-1 rounded-full bg-white/[0.08] border border-white/12 backdrop-blur-md shrink min-w-0">
          <button
            type="button"
            onClick={() => setNowPlayingTab('artwork')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
              nowPlayingTab === 'artwork'
                ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.35)]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            {m.tabCover}
          </button>
          {currentTrack && (
            <button
              type="button"
              onClick={() => setNowPlayingTab('lyrics')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                nowPlayingTab === 'lyrics'
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.35)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Mic2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {m.tabLyrics}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowNowPlayingModal(false);
              setDriveModeOpen(true);
            }}
            title={m.driveModeBtn}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors text-[#60A5FA]"
          >
            <Car className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
          {onOpenPlaylistPicker && currentTrack && (
            <button
              type="button"
              onClick={onOpenPlaylistPicker}
              title={m.addToPlaylist}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            title={m.studioTitle}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#3B82F6]/18 hover:bg-[#3B82F6]/28 border border-[#3B82F6]/40 text-[#93C5FD] flex items-center justify-center cursor-pointer transition-colors"
          >
            <Sliders className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-5 sm:px-10 py-2 overflow-hidden">
        {nowPlayingTab === 'artwork' && (
          <div className="w-full max-w-md flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              {spatial8dEnabled && (
                <div
                  aria-hidden="true"
                  className="absolute -inset-5 sm:-inset-7 rounded-full border border-[#60A5FA]/35 pointer-events-none"
                >
                  <div className="w-full h-full relative" style={{ transform: `rotate(${orbitDeg}deg)` }}>
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] shadow-[0_0_16px_rgba(96,165,250,0.95)]" />
                  </div>
                </div>
              )}
              <div
                ref={artGlowRef}
                aria-hidden="true"
                className="absolute -inset-4 rounded-[36px] blur-2xl will-change-transform transition-[opacity] duration-300"
                style={{
                  background:
                    'radial-gradient(circle, rgba(59,130,246,0.42) 0%, rgba(96,165,250,0.22) 60%, transparent 100%)',
                  opacity: isPlaying ? 0.65 : 0.24,
                }}
              />
              <div
                ref={artWrapperRef}
                className="relative w-56 h-56 sm:w-76 sm:h-76 rounded-3xl overflow-hidden bg-gradient-to-br from-[#0B1622] to-[#070D14] border border-white/20 shadow-[0_28px_72px_rgba(0,0,0,0.88)] flex items-center justify-center will-change-transform"
              >
                <CoverArt
                  src={coverSrc}
                  alt={currentTrack?.title || activeRadio?.name || ''}
                  fallbackLabel={currentTrack?.artist.name || activeRadio?.name}
                  priority
                  className={`w-full h-full object-cover object-center transition-opacity duration-500 ${
                    isPlaying ? 'opacity-100' : 'opacity-80'
                  }`}
                />
                {activeRadio && !coverSrc && (
                  <Radio className="w-16 h-16 text-[#60A5FA] absolute pointer-events-none opacity-85" />
                )}
                {spatial8dEnabled && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-[#000000]/80 backdrop-blur-md border border-[#3B82F6]/45 text-[11px] font-bold text-[#93C5FD] inline-flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-[#60A5FA]" />
                    {activeSpatialPreset.names[musicLang]}
                  </span>
                )}
              </div>
            </div>

            {/* Canvas Live FFT Spectrum Visualizer */}
            <canvas
              ref={canvasRef}
              width={320}
              height={38}
              aria-hidden="true"
              className="w-full max-w-xs h-9"
            />

            {/* Multi-Source Provider Switcher when alternatives exist */}
            {resolvedPlayback?.alternatives && resolvedPlayback.alternatives.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {resolvedPlayback.alternatives.map((cand) => {
                  const active = resolvedPlayback.streamUrl === cand.streamUrl;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        switchPlaybackSource(cand);
                      }}
                      className={`h-7 px-2.5 rounded-full text-[10px] font-bold cursor-pointer transition-all tabular-nums ${
                        active
                          ? 'bg-[#3B82F6]/25 border border-[#3B82F6] text-[#93C5FD]'
                          : 'bg-white/[0.06] border border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cand.provider.toUpperCase()} {cand.bitrateKbps ? `· ${cand.bitrateKbps}k` : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {nowPlayingTab === 'lyrics' && (
          <div className="w-full max-w-2xl flex-1 min-h-0 flex flex-col">
            {lyrics?.found && (
              <div className="shrink-0 flex items-center justify-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() =>
                    setLyricsScale((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'sm'))
                  }
                  className="h-7 px-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-[11px] font-bold text-zinc-200 cursor-pointer"
                >
                  {m.lyricsFontLabel}: {lyricsScale.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyLyrics()}
                  className="h-7 px-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-[11px] font-bold text-zinc-200 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-[#60A5FA]" />
                  <span>{lyricsCopiedToast ? m.lyricsCopied : m.copyLyricsBtn}</span>
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-6 py-6 space-y-4 text-center mask-gradient">
              {lyricsLoading ? (
                <div className="py-20 text-zinc-400 text-sm">{m.searchingLyrics}</div>
              ) : !lyrics?.found ? (
                <div className="py-20 space-y-2">
                  <Mic2 className="w-10 h-10 text-[#60A5FA]/60 mx-auto" />
                  <p className="text-base font-semibold text-zinc-200">{m.noLyricsTitle}</p>
                  <p className="text-xs text-zinc-400">{m.noLyricsSub}</p>
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
                          ? `text-white ${lyricSizeClasses.active} font-extrabold scale-[1.03] drop-shadow-[0_0_24px_rgba(59,130,246,0.55)] bg-white/[0.04]`
                          : isPast
                          ? `text-zinc-400/55 ${lyricSizeClasses.idle} font-semibold hover:text-white`
                          : `text-zinc-300/75 ${lyricSizeClasses.idle} font-semibold hover:text-white`
                      }`}
                    >
                      {line.text}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Controls */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto px-4 sm:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-2 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-extrabold text-white line-clamp-2 leading-tight">
              {activeRadio ? activeRadio.name : currentTrack?.title}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 truncate mt-1">
              {activeRadio
                ? `${activeRadio.country} · ${activeRadio.tags.join(' · ')}`
                : `${currentTrack?.artist.name}${currentTrack?.album.title ? ` · ${currentTrack.album.title}` : ''}`}
            </p>
          </div>

          {currentTrack && (
            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  dislikeTrack(currentTrack);
                  showMusicToast('Menos recomendaciones de este tema');
                }}
                aria-label="No me interesa este tema"
                title="No me interesa este tema"
                className="min-w-10 min-h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-amber-300 hover:bg-white/[0.06] cursor-pointer transition-colors"
              >
                <ThumbsDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  toggleLikeTrack(currentTrack);
                }}
                aria-label={isLiked ? m.likeRemove : m.likeAdd}
                className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                  isLiked ? 'text-[#FF2D55]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Studio Quick Action Strip: 8D Presets + Karaoke + Auto-DJ + Seed Radio + Jam + Offline + MP3 */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setShowEqModal(true);
            }}
            aria-pressed={spatial8dEnabled}
            className={`min-h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
              spatial8dEnabled
                ? 'bg-[#3B82F6] text-white'
                : 'bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-zinc-200'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>{spatial8dEnabled ? activeSpatialPreset.names[musicLang] : m.spatial8dBtn}</span>
          </button>

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                const nextKaraoke = !(vocalCancel && nowPlayingTab === 'lyrics');
                setVocalCancel(nextKaraoke);
                setNowPlayingTab(nextKaraoke ? 'lyrics' : 'artwork');
                showMusicToast(nextKaraoke ? m.karaoke1Tap : m.tabCover);
              }}
              aria-pressed={vocalCancel && nowPlayingTab === 'lyrics'}
              className={`h-8 px-3 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all ${
                vocalCancel && nowPlayingTab === 'lyrics'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] text-white shadow-[0_4px_16px_rgba(124,58,237,0.4)]'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-zinc-200'
              }`}
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>{m.karaoke1Tap}</span>
            </button>
          )}

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                void startSeedRadio(currentTrack);
              }}
              className="h-8 px-3 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-[11px] font-bold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>{m.seedRadioBtn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              toggleAutoDj();
            }}
            aria-pressed={autoDjEnabled}
            className={`h-8 px-3 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all ${
              autoDjEnabled
                ? 'bg-[#3B82F6]/25 border border-[#3B82F6] text-[#93C5FD]'
                : 'bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-zinc-200'
            }`}
          >
            <Disc3 className="w-3.5 h-3.5" />
            <span>{m.autoDjLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              toggleJamSession();
            }}
            aria-pressed={jamSession.active}
            className={`h-8 px-3 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all ${
              jamSession.active
                ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                : 'bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{jamSession.active && jamSession.roomCode ? `Jam · ${jamSession.roomCode}` : m.jamLabel}</span>
          </button>

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                void saveTrackToOfflineLibrary(currentTrack);
              }}
              className={`h-8 px-3 rounded-full border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                isSavedOffline
                  ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-[#93C5FD]'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] border-white/10 text-zinc-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isSavedOffline ? m.savedOfflineBadge : m.saveOfflineBtn}</span>
            </button>
          )}

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                void startDownloadMp3Job(currentTrack);
              }}
              className="h-8 px-3 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-[11px] font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>MP3 {exportBitrate}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowNowPlayingModal(false);
              setShowDownloadDrawer(true);
            }}
            className="min-h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-xs font-bold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <FolderDown className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>{offlineTrackIds.length}</span>
          </button>
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
            className="w-full h-1.5 accent-[#3B82F6] bg-white/20 rounded-full cursor-pointer"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums">
            <span>{activeRadio ? 'LIVE' : formatMusicTime(currentTime)}</span>
            <span>
              {activeRadio
                ? 'STREAM 24/7'
                : resolvedPlayback?.sourceLabel
                ? `${resolvedPlayback.sourceLabel}${
                    resolvedPlayback.bitrateKbps ? ` · ${resolvedPlayback.bitrateKbps} kbps` : ''
                  } · ${formatMusicTime(effectiveDuration)}`
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
            aria-label={m.shuffle || 'Aleatorio'}
            className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              shuffle ? 'text-[#60A5FA]' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={playPrev}
            disabled={Boolean(activeRadio)}
            aria-label="Canción anterior"
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipBack className="w-6 h-6 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => requestSeek(Math.max(0, currentTime - 10))}
            disabled={Boolean(activeRadio)}
            aria-label="-10s"
            title="-10s"
            className="min-w-10 min-h-10 rounded-full flex flex-col items-center justify-center text-zinc-300 hover:text-white cursor-pointer disabled:opacity-30"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-[9px] font-bold tabular-nums">-10s</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              togglePlayPause();
            }}
            aria-label={isPlaying ? m.pause : m.playNow}
            className="w-15 h-15 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#3B82F6] via-[#6366F1] to-[#60A5FA] hover:scale-105 text-white flex items-center justify-center shadow-[0_14px_36px_rgba(59,130,246,0.45)] cursor-pointer transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => requestSeek(Math.min(effectiveDuration || currentTime + 10, currentTime + 10))}
            disabled={Boolean(activeRadio)}
            aria-label="+10s"
            title="+10s"
            className="min-w-10 min-h-10 rounded-full flex flex-col items-center justify-center text-zinc-300 hover:text-white cursor-pointer disabled:opacity-30"
          >
            <RotateCw className="w-4 h-4" />
            <span className="text-[9px] font-bold tabular-nums">+10s</span>
          </button>

          <button
            type="button"
            onClick={playNext}
            disabled={Boolean(activeRadio)}
            aria-label="Siguiente canción"
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipForward className="w-6 h-6 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeRadio) return;
              setShowNowPlayingModal(false);
              setShowQueueDrawer(true);
            }}
            aria-label={m.queueTitle}
            className="min-w-10 min-h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            title={m.queueTitle}
          >
            <ListMusic className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            disabled={Boolean(activeRadio)}
            aria-label="Repetir"
            className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              repeatMode !== 'off' ? 'text-[#60A5FA]' : 'text-zinc-400 hover:text-white'
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
