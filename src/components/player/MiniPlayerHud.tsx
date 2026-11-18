import React from 'react';
import type { AppLanguage, VideoState } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  RiffanCloseIcon,
  RiffanFullscreenIcon,
  RiffanPauseIcon,
  RiffanPlayIcon,
  RiffanVolumeIcon,
} from '../ui/RiffanIcons';

interface MiniPlayerHudProps {
  lang: AppLanguage;
  title: string;
  mode: VideoState['mode'];
  isLive?: boolean;
  duration: number;
  currentTime: number;
  localPlaying: boolean;
  isMuted: boolean;
  volume: number;
  canUseNativePiPOrCast: boolean;
  onToggleMinimize?: () => void;
  onClosePlayer?: () => void;
  onTogglePlay: (e?: React.MouseEvent) => void;
  onToggleMute: (e: React.MouseEvent) => void;
}

export const MiniPlayerHud: React.FC<MiniPlayerHudProps> = ({
  lang,
  title,
  mode,
  isLive,
  duration,
  currentTime,
  localPlaying,
  isMuted,
  volume,
  canUseNativePiPOrCast,
  onToggleMinimize,
  onClosePlayer,
  onTogglePlay,
  onToggleMute,
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between p-2 bg-gradient-to-b from-black/75 via-transparent to-black/80">
      {/* Top Row: Drag Grip + Title + Expand & Close Buttons */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15">
          <span className="text-[10px] text-[#BF94FF] font-bold leading-none">⠿</span>
          <span className="font-display font-bold text-[10px] text-white truncate max-w-[115px] sm:max-w-[155px]">
            {title}
          </span>
        </div>

        <div
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="pointer-events-auto flex items-center gap-1 shrink-0"
        >
          {onToggleMinimize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onToggleMinimize();
              }}
              className="w-7 h-7 rounded-full bg-[#9146FF] hover:bg-[#772CE8] flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform cursor-pointer"
              title={pickLang(lang, {
                es: 'Ampliar reproductor',
                ca: 'Ampliar reproductor',
                en: 'Expand player',
              })}
              aria-label={pickLang(lang, {
                es: 'Ampliar reproductor',
                ca: 'Ampliar reproductor',
                en: 'Expand player',
              })}
            >
              <RiffanFullscreenIcon size={14} tone="current" />
            </button>
          )}

          {onClosePlayer && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onClosePlayer();
              }}
              className="w-7 h-7 rounded-full bg-black/75 hover:bg-rose-600 border border-white/20 flex items-center justify-center text-zinc-200 hover:text-white active:scale-90 transition-transform cursor-pointer"
              title={pickLang(lang, { es: 'Cerrar reproductor', ca: 'Tancar reproductor', en: 'Close player' })}
              aria-label={pickLang(lang, { es: 'Cerrar reproductor', ca: 'Tancar reproductor', en: 'Close player' })}
            >
              <RiffanCloseIcon size={14} tone="current" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Play/Pause + Mute/Unmute + Corner Hint */}
      <div className="flex items-center justify-between gap-1.5">
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="pointer-events-auto flex items-center gap-1"
        >
          {(canUseNativePiPOrCast || mode === 'youtube') && (
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-7 h-7 rounded-full bg-black/75 hover:bg-black border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
              aria-label={
                localPlaying
                  ? pickLang(lang, { es: 'Pausar', ca: 'Pausa', en: 'Pause' })
                  : pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })
              }
            >
              {localPlaying ? (
                <RiffanPauseIcon size={14} tone="current" />
              ) : (
                <RiffanPlayIcon size={14} tone="current" />
              )}
            </button>
          )}

          {(canUseNativePiPOrCast || mode === 'youtube') && (
            <button
              type="button"
              onClick={onToggleMute}
              className="w-7 h-7 rounded-full bg-black/75 hover:bg-black border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
              aria-label={pickLang(lang, { es: 'Silenciar', ca: 'Silenciar', en: 'Mute' })}
            >
              <RiffanVolumeIcon
                size={14}
                muted={isMuted || volume === 0}
                tone="current"
                className={isMuted || volume === 0 ? 'text-rose-400' : 'text-emerald-400'}
              />
            </button>
          )}
        </div>

        <span className="text-[9px] font-semibold text-zinc-300/90 bg-black/55 px-2 py-0.5 rounded-full backdrop-blur-sm">
          {pickLang(lang, {
            es: 'Arrastra a 4 esquinas',
            ca: 'Arrossega a 4 cantonades',
            en: 'Drag to 4 corners',
          })}
        </span>
      </div>

      {/* Thin Bottom Playback Progress Line */}
      {!isLive && duration > 0 && (
        <div className="absolute bottom-0 inset-x-0 h-[3px] bg-white/20">
          <div
            className="h-full bg-[#9146FF]"
            style={{
              width: `${Math.min(100, Math.max(4, Math.round((currentTime / duration) * 100)))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};
