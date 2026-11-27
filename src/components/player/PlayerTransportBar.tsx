import React from 'react';
import { AudioLines, PictureInPicture2, RotateCcw, RotateCw, Settings2 } from 'lucide-react';
import type { AppLanguage, VideoState } from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { formatTimecode } from './playerTypes';
import {
  RiffanExitFullscreenIcon,
  RiffanFullscreenIcon,
  RiffanPauseIcon,
  RiffanPlayIcon,
  RiffanVolumeIcon,
} from '../ui/RiffanIcons';

interface PlayerTransportBarProps {
  lang: AppLanguage;
  mode: VideoState['mode'];
  isLive?: boolean;
  duration: number;
  currentTime: number;
  shouldRotate90: boolean;
  showControls: boolean;
  localPlaying: boolean;
  isMuted: boolean;
  volume: number;
  hlsAudioTracks: { id: number; name: string; lang: string; default?: boolean }[];
  selectedHlsAudioTrack: number;
  qualityLevels: { index: number; height: number; bitrate?: number }[];
  selectedQuality: number;
  autoActiveHeight: number | null;
  activeHudMenu: 'quality' | 'audio' | null;
  setActiveHudMenu: React.Dispatch<React.SetStateAction<'quality' | 'audio' | null>>;
  canUseNativePiPOrCast: boolean;
  isInPiP: boolean;
  isFullscreen: boolean;
  isHorizontalFullscreen: boolean;
  forceLandscapeRotation: boolean;
  revealControls: () => void;
  onScrub: (nextSec: number) => void;
  onTogglePlay: (e?: React.MouseEvent) => void;
  onToggleMute: (e: React.MouseEvent) => void;
  onVolumeSlider: (val: number) => void;
  onSelectHlsAudioTrack: (trackId: number) => void;
  onChangeQuality: (levelIndex: number) => void;
  onTogglePiP: (e: React.MouseEvent) => void;
  onToggleLandscapeRotation: (e?: React.MouseEvent) => void;
  onToggleFullscreen: (e?: React.MouseEvent) => void;
  isTouchLocked?: boolean;
  onSeekRelative?: (delta: number, e?: React.MouseEvent) => void;
  tacticalVisionEnabled?: boolean;
  onToggleTacticalVision?: () => void;
}

export const PlayerTransportBar: React.FC<PlayerTransportBarProps> = ({
  lang,
  mode,
  isLive,
  duration,
  currentTime,
  shouldRotate90,
  showControls,
  localPlaying,
  isMuted,
  volume,
  hlsAudioTracks,
  selectedHlsAudioTrack,
  qualityLevels,
  selectedQuality,
  autoActiveHeight,
  activeHudMenu,
  setActiveHudMenu,
  canUseNativePiPOrCast,
  isInPiP,
  isFullscreen,
  isHorizontalFullscreen,
  forceLandscapeRotation,
  revealControls,
  onScrub,
  onTogglePlay,
  onToggleMute,
  onVolumeSlider,
  onSelectHlsAudioTrack,
  onChangeQuality,
  onTogglePiP,
  onToggleLandscapeRotation,
  onToggleFullscreen,
  isTouchLocked = false,
  onSeekRelative,
}) => {
  const t = UI_COPY[lang];
  const controlsActive = showControls && !isTouchLocked;

  return (
    <div
      className={`pointer-events-none absolute bottom-0 inset-x-0 z-30 ${
        shouldRotate90
          ? 'px-3 pb-2.5 pt-4'
          : 'px-2.5 sm:px-5 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-3 pt-4'
      } bg-gradient-to-t from-black/95 via-black/75 to-transparent transition-opacity duration-300 ${
        controlsActive ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Protected Legible Timeline Scrubber (Rotation-aware for 90deg Landscape) */}
      {!isLive && duration > 0 && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!shouldRotate90) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(
              0,
              Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))
            );
            onScrub(Math.round(ratio * duration));
          }}
          onTouchMove={(e) => {
            if (!shouldRotate90 || !e.touches[0]) return;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(
              0,
              Math.min(1, (e.touches[0].clientY - rect.top) / Math.max(1, rect.height))
            );
            onScrub(Math.round(ratio * duration));
          }}
          className={`relative h-7 flex items-center px-1 mb-0.5 ${
            controlsActive ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="relative w-full h-1.5 rounded-full bg-white/25 overflow-hidden pointer-events-none shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9146FF] to-[#BF94FF] transition-[width] duration-100"
              style={{
                width: `${Math.min(100, Math.max(0, (Math.min(currentTime, duration) / Math.max(1, duration)) * 100))}%`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={1}
            value={Math.min(currentTime, duration)}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label={pickLang(lang, {
              es: 'Línea de tiempo',
              ca: 'Línia de temps',
              en: 'Timeline',
            })}
            className="absolute inset-x-1 inset-y-0 w-[calc(100%-0.5rem)] h-full cinema-range cinema-range-overlay z-10"
          />
        </div>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center justify-between gap-1 sm:gap-1.5 ${
          controlsActive ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        {/* Left Cluster: Play/Pause + Quick Seek + Mute/Volume + Timecode */}
        <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            className="min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer shrink-0"
            aria-label={
              localPlaying
                ? pickLang(lang, { es: 'Pausar', ca: 'Pausar', en: 'Pause' })
                : pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })
            }
          >
            {localPlaying ? (
              <RiffanPauseIcon size={20} tone="current" />
            ) : (
              <RiffanPlayIcon size={20} tone="current" />
            )}
          </button>

          {!isLive && onSeekRelative && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => onSeekRelative(-10, e)}
                aria-label="Retroceder 10 segundos"
                title="-10s"
                className="min-h-[38px] min-w-[32px] sm:min-w-[38px] rounded-xl hover:bg-white/12 flex items-center justify-center text-zinc-200 hover:text-white active:scale-90 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => onSeekRelative(10, e)}
                aria-label="Avanzar 10 segundos"
                title="+10s"
                className="min-h-[38px] min-w-[32px] sm:min-w-[38px] rounded-xl hover:bg-white/12 flex items-center justify-center text-zinc-200 hover:text-white active:scale-90 transition-all cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleMute}
              className="min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[44px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
              aria-label={pickLang(lang, {
                es: 'Silenciar',
                ca: 'Silenciar',
                en: 'Mute',
              })}
            >
              <RiffanVolumeIcon
                size={20}
                muted={isMuted || volume === 0}
                tone="current"
                className={isMuted || volume === 0 ? 'text-rose-400' : ''}
              />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeSlider(Number(e.target.value))}
              aria-label={pickLang(lang, {
                es: 'Volumen',
                ca: 'Volum',
                en: 'Volume',
              })}
              className="hidden md:block w-20 cinema-range"
            />
          </div>

          {isLive ? (
            <div className="flex items-center gap-1.5 pl-1 text-[11px] sm:text-xs font-bold text-white whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-[#EB0400]" />
              <span>{t.liveNow}</span>
            </div>
          ) : (
            <div className="text-[11px] sm:text-xs font-mono tabular-nums text-zinc-200 pl-0.5 whitespace-nowrap shrink-0">
              {formatTimecode(currentTime)}
              <span className="text-zinc-500 mx-0.5">/</span>
              {formatTimecode(duration)}
            </div>
          )}
        </div>

        {/* Right Cluster: HUD Audio Track + Video Quality + PiP + Orientation Rotate + Fullscreen */}
        <div className="relative flex items-center gap-1 shrink-0">
          {mode === 'hls' && hlsAudioTracks.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  revealControls();
                  setActiveHudMenu((prev) => (prev === 'audio' ? null : 'audio'));
                }}
                aria-label={t.audioTrackLabel}
                aria-expanded={activeHudMenu === 'audio'}
                className={`min-h-[40px] px-2.5 rounded-2xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  activeHudMenu === 'audio'
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-white/10 hover:bg-white/18 text-zinc-100'
                }`}
              >
                <AudioLines className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline max-w-[84px] truncate">
                  {hlsAudioTracks.find((tr) => tr.id === selectedHlsAudioTrack)?.lang ||
                    hlsAudioTracks.find((tr) => tr.id === selectedHlsAudioTrack)?.name ||
                    t.audioTrackLabel}
                </span>
              </button>

              {activeHudMenu === 'audio' && (
                <div
                  role="menu"
                  aria-label={t.audioTrackLabel}
                  className="absolute bottom-full right-0 mb-2 w-48 max-h-[min(220px,calc(100vh-7rem))] overflow-y-auto overscroll-contain custom-scrollbar p-1.5 rounded-2xl bg-[#141418]/96 backdrop-blur-2xl border border-white/15 shadow-[0_18px_45px_rgba(0,0,0,0.85)] z-50 space-y-0.5"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {t.audioTrackEmbedded}
                  </div>
                  {hlsAudioTracks.map((tr) => {
                    const isSelected = tr.id === selectedHlsAudioTrack;
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => onSelectHlsAudioTrack(tr.id)}
                        className={`w-full min-h-[36px] px-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#9146FF] text-white'
                            : 'text-zinc-200 hover:bg-white/10'
                        }`}
                      >
                        <span className="truncate">{tr.name}</span>
                        {tr.lang && (
                          <span className="text-[10px] font-mono opacity-80 shrink-0">
                            {tr.lang}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mode === 'hls' && qualityLevels.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  revealControls();
                  setActiveHudMenu((prev) => (prev === 'quality' ? null : 'quality'));
                }}
                aria-label={t.qualityLabel}
                aria-expanded={activeHudMenu === 'quality'}
                className={`min-h-[38px] sm:min-h-[40px] px-2 sm:px-2.5 rounded-2xl text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                  activeHudMenu === 'quality'
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-white/10 hover:bg-white/18 text-zinc-100'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {selectedQuality === -1 ? (
                    autoActiveHeight ? (
                      <>
                        <span className="hidden sm:inline">{t.qualityAuto} · </span>
                        {autoActiveHeight}p
                      </>
                    ) : (
                      t.qualityAuto
                    )
                  ) : (
                    `${qualityLevels.find((q) => q.index === selectedQuality)?.height || ''}p`
                  )}
                </span>
              </button>

              {activeHudMenu === 'quality' && (
                <div
                  role="menu"
                  aria-label={t.qualityLabel}
                  className="absolute bottom-full right-0 mb-2 w-44 max-h-[min(220px,calc(100vh-7rem))] overflow-y-auto overscroll-contain custom-scrollbar p-1.5 rounded-2xl bg-[#141418]/96 backdrop-blur-2xl border border-white/15 shadow-[0_18px_45px_rgba(0,0,0,0.85)] z-50 space-y-0.5"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {t.qualityLabel}
                  </div>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedQuality === -1}
                    onClick={() => onChangeQuality(-1)}
                    className={`w-full min-h-[36px] px-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      selectedQuality === -1
                        ? 'bg-[#9146FF] text-white'
                        : 'text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    <span>{t.qualityAuto}</span>
                    {autoActiveHeight && selectedQuality === -1 && (
                      <span className="font-mono text-[10px] opacity-80">
                        {autoActiveHeight}p
                      </span>
                    )}
                  </button>
                  {qualityLevels.map((q) => {
                    const isSelected = selectedQuality === q.index;
                    return (
                      <button
                        key={q.index}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => onChangeQuality(q.index)}
                        className={`w-full min-h-[36px] px-2.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#9146FF] text-white'
                            : 'text-zinc-200 hover:bg-white/10'
                        }`}
                      >
                        <span>{q.height}p</span>
                        {q.height >= 1080 && (
                          <span className="text-[10px] font-sans opacity-80">FHD</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {canUseNativePiPOrCast && (
            <button
              type="button"
              onClick={onTogglePiP}
              className={`min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[42px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                isInPiP
                  ? 'bg-[#9146FF]/30 text-[#BF94FF] border border-[#9146FF]/50'
                  : 'hover:bg-white/12 text-white'
              }`}
              title={pickLang(lang, {
                es: 'Pantalla en imagen (PiP)',
                ca: 'Pantalla en imatge (PiP)',
                en: 'Picture-in-Picture (PiP)',
              })}
              aria-label="Picture-in-Picture"
            >
              <PictureInPicture2 className="w-4 h-4 text-sky-400" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleLandscapeRotation}
            className={`min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[42px] rounded-2xl flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
              (isFullscreen || isHorizontalFullscreen) && forceLandscapeRotation
                ? 'bg-[#9146FF]/25 text-[#BF94FF] border border-[#9146FF]/50'
                : 'hover:bg-white/12 text-white'
            }`}
            title={pickLang(lang, {
              es: 'Girar pantalla en horizontal (16:9)',
              ca: 'Girar pantalla en horitzontal (16:9)',
              en: 'Rotate landscape (16:9)',
            })}
            aria-label={pickLang(lang, {
              es: 'Girar en horizontal',
              ca: 'Girar en horitzontal',
              en: 'Rotate landscape',
            })}
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="min-h-[38px] sm:min-h-[42px] min-w-[34px] sm:min-w-[42px] rounded-2xl hover:bg-white/12 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
            title={pickLang(lang, {
              es: 'Pantalla completa horizontal',
              ca: 'Pantalla completa horitzontal',
              en: 'Landscape fullscreen',
            })}
            aria-label={pickLang(lang, {
              es: 'Pantalla completa',
              ca: 'Pantalla completa',
              en: 'Fullscreen',
            })}
          >
            {isFullscreen || isHorizontalFullscreen ? (
              <RiffanExitFullscreenIcon size={16} tone="current" />
            ) : (
              <RiffanFullscreenIcon size={16} tone="current" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
