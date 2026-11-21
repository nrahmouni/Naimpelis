import React from 'react';
import {
  Disc3,
  Heart,
  ListMusic,
  Maximize2,
  Mic2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { triggerHaptic } from '../../utils/haptics';

export function formatMusicTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const SpotifyPlayerBar: React.FC = () => {
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const resolvedPlayback = useMusicStore((s) => s.resolvedPlayback);
  const isResolvingTrack = useMusicStore((s) => s.isResolvingTrack);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const volume = useMusicStore((s) => s.volume);
  const isMuted = useMusicStore((s) => s.isMuted);
  const shuffle = useMusicStore((s) => s.shuffle);
  const repeatMode = useMusicStore((s) => s.repeatMode);
  const viewMode = useMusicStore((s) => s.viewMode);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const showQueueDrawer = useMusicStore((s) => s.showQueueDrawer);

  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const playNext = useMusicStore((s) => s.playNext);
  const playPrev = useMusicStore((s) => s.playPrev);
  const requestSeek = useMusicStore((s) => s.requestSeek);
  const setVolume = useMusicStore((s) => s.setVolume);
  const toggleMute = useMusicStore((s) => s.toggleMute);
  const toggleShuffle = useMusicStore((s) => s.toggleShuffle);
  const cycleRepeat = useMusicStore((s) => s.cycleRepeat);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const setShowNowPlayingModal = useMusicStore((s) => s.setShowNowPlayingModal);
  const setNowPlayingTab = useMusicStore((s) => s.setNowPlayingTab);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);

  if (!currentTrack && !activeRadio) return null;

  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;
  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSec || 0;
  const pct = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  const coverSrc = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';
  const titleText = activeRadio ? activeRadio.name : currentTrack?.title || '';
  const subText = activeRadio
    ? `Radio en Directo · ${activeRadio.country}`
    : currentTrack?.artist.name || '';

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 bg-[#0A0B0E]/95 backdrop-blur-2xl border-t border-white/[0.08] px-3 sm:px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] shadow-[0_-16px_44px_rgba(0,0,0,0.78)]"
      role="region"
      aria-label="Reproductor Riffan Music"
    >
      {/* Mobile ultra-slim hairline progress bar */}
      {!activeRadio && (
        <div className="sm:hidden absolute top-0 inset-x-0 h-[2.5px] bg-white/10">
          <div
            className="h-full bg-[#1DB954] transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4 min-h-[54px] sm:min-h-[64px]">
        {/* Left: Cover + Track metadata + Heart */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 sm:flex-initial sm:w-[29%]">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowNowPlayingModal(true);
            }}
            className="group flex items-center gap-2.5 sm:gap-3 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954] rounded-xl"
          >
            <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-lg overflow-hidden bg-[#181B22] border border-white/10 shrink-0 flex items-center justify-center">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={titleText}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : null}
              {activeRadio ? (
                <Radio className="w-5 h-5 text-[#1DB954] absolute pointer-events-none opacity-80" />
              ) : (
                <Disc3 className="w-5 h-5 text-zinc-500 -z-10" />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-white truncate leading-tight">
                {titleText}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5">
                {activeRadio ? (
                  <span className="inline-flex items-center gap-1 text-[#1DB954] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse" />
                    EN VIVO
                  </span>
                ) : (
                  <>
                    <span className="truncate">{subText}</span>
                    {resolvedPlayback && (
                      <span className="hidden md:inline text-[10px] text-zinc-500 shrink-0">
                        · {resolvedPlayback.sourceLabel}
                      </span>
                    )}
                    {isResolvingTrack && (
                      <span className="hidden md:inline text-[10px] text-[#1DB954] shrink-0">
                        · Cargando...
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </button>

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                toggleLikeTrack(currentTrack);
              }}
              aria-label={isLiked ? 'Quitar de Tus Me Gusta' : 'Añadir a Tus Me Gusta'}
              className={`min-w-10 min-h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954] ${
                isLiked ? 'text-[#1DB954]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>

        {/* Center: Desktop Playback Controls + Scrubbing Timeline */}
        <div className="hidden sm:flex flex-col items-center gap-1.5 flex-1 max-w-[600px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleShuffle}
              disabled={Boolean(activeRadio)}
              title="Aleatorio"
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 ${
                shuffle ? 'text-[#1DB954]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={playPrev}
              disabled={Boolean(activeRadio)}
              title="Anterior"
              className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors disabled:opacity-30"
            >
              <SkipBack className="w-4.5 h-4.5 fill-current" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                togglePlayPause();
              }}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              className="w-10 h-10 rounded-full bg-white hover:bg-[#1DB954] hover:scale-105 text-[#090A0D] flex items-center justify-center cursor-pointer transition-all shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]"
            >
              {isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-current" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={playNext}
              disabled={Boolean(activeRadio)}
              title="Siguiente"
              className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors disabled:opacity-30"
            >
              <SkipForward className="w-4.5 h-4.5 fill-current" />
            </button>

            <button
              type="button"
              onClick={cycleRepeat}
              disabled={Boolean(activeRadio)}
              title="Repetir"
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 ${
                repeatMode !== 'off' ? 'text-[#1DB954]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-2 text-[11px] font-medium text-zinc-400 tabular-nums">
            <span className="w-9 text-right">
              {activeRadio ? 'EN VIVO' : formatMusicTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              value={activeRadio ? 100 : Math.min(currentTime, effectiveDuration || 100)}
              disabled={Boolean(activeRadio)}
              onChange={(e) => requestSeek(Number(e.target.value))}
              aria-label="Progreso de reproducción"
              className="flex-1 h-1 accent-[#1DB954] bg-white/15 rounded-full cursor-pointer"
            />
            <span className="w-9">
              {activeRadio ? '24/7' : formatMusicTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Mobile Compact Transport */}
        <div className="flex sm:hidden items-center gap-1 shrink-0">
          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                setNowPlayingTab('lyrics');
                setShowNowPlayingModal(true);
              }}
              aria-label="Letras"
              className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
            >
              <Mic2 className="w-4.5 h-4.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              togglePlayPause();
            }}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            className="min-w-11 min-h-11 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Right: Video Toggle, Lyrics, EQ, Queue, Volume, Expand */}
        <div className="hidden sm:flex items-center justify-end gap-1.5 sm:w-[29%]">
          {currentTrack && (resolvedPlayback?.youtubeMvId || resolvedPlayback?.youtubeVideoId) && (
            <button
              type="button"
              onClick={() => {
                setNowPlayingTab(viewMode === 'video' ? 'artwork' : 'video');
                setShowNowPlayingModal(true);
              }}
              title="Videoclip Oficial HD"
              className={`h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                viewMode === 'video'
                  ? 'bg-[#1DB954] text-[#08090C]'
                  : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">MV</span>
            </button>
          )}

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                setNowPlayingTab('lyrics');
                setShowNowPlayingModal(true);
              }}
              title="Letras sincronizadas"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#1DB954] hover:bg-white/[0.06] cursor-pointer transition-colors"
            >
              <Mic2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            title="Ecualizador Hi-Fi"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#1DB954] hover:bg-white/[0.06] cursor-pointer transition-colors"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowQueueDrawer(!showQueueDrawer)}
            title="Cola de reproducción"
            className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
              showQueueDrawer
                ? 'text-[#1DB954] bg-[#1DB954]/15'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <ListMusic className="w-4 h-4" />
          </button>

          <div className="hidden md:flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volumen"
              className="w-20 h-1 accent-[#1DB954] bg-white/15 rounded-full cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowNowPlayingModal(true)}
            title="Pantalla completa"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
