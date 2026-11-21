import React from 'react';
import {
  Minimize2,
  ArrowLeft,
  PictureInPicture2,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  RiffanCastIcon,
  RiffanCloseIcon,
  RiffanExitFullscreenIcon,
  RiffanFullscreenIcon,
  RiffanSlidersIcon,
} from '../ui/RiffanIcons';
import { triggerHaptic } from '../../utils/haptics';
import type { VideoState } from '../../types';

interface PlayerTopHudBarProps {
  videoState: VideoState;
  isTvMode: boolean;
  isMinimized: boolean;
  isCompressed: boolean;
  isStageFullscreen: boolean;
  isFullscreen: boolean;
  isHorizontalFullscreen: boolean;
  showControls: boolean;
  localPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackSpeed: number;
  isCastingToTv: boolean;
  hasConnectedSmartTv: boolean;
  showProMenu: boolean;
  isCinemaMode: boolean;
  isInPiP: boolean;
  vocalBoostEnabled: boolean;
  activeSubId: string;
  canUseNativePiPOrCast: boolean;
  voiceSlot?: React.ReactNode;
  onDirectCastToTv: () => void;
  onOpenProMenu: () => void;
  onTogglePiP: (e: React.MouseEvent) => void;
  onToggleMinimize?: () => void;
  onToggleFullscreen: (e?: React.MouseEvent) => void;
  onExitTvMode?: () => void;
  onClosePlayer?: () => void;
  isTouchLocked?: boolean;
  onToggleTouchLock?: () => void;
}

export const PlayerTopHudBar: React.FC<PlayerTopHudBarProps> = ({
  videoState,
  isTvMode,
  isMinimized,
  isCompressed,
  isStageFullscreen,
  isFullscreen,
  isHorizontalFullscreen,
  showControls,
  localPlaying,
  duration,
  currentTime,
  playbackSpeed,
  isCastingToTv,
  hasConnectedSmartTv,
  showProMenu,
  isCinemaMode,
  isInPiP,
  vocalBoostEnabled,
  activeSubId,
  canUseNativePiPOrCast,
  voiceSlot,
  onDirectCastToTv,
  onOpenProMenu,
  onTogglePiP,
  onToggleMinimize,
  onToggleFullscreen,
  onExitTvMode,
  onClosePlayer,
  isTouchLocked = false,
  onToggleTouchLock,
}) => {
  return (
    <>
      {!isMinimized &&
        (!isCompressed || isStageFullscreen) &&
        (videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <div
            className={`pointer-events-none absolute top-0 inset-x-0 z-30 px-3 sm:px-5 pt-3 pb-10 bg-gradient-to-b from-black/90 via-black/45 to-transparent flex items-start justify-between gap-3 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className={`min-w-0 pt-1 transition-opacity ${isTouchLocked ? 'opacity-0' : 'opacity-100'}`}>
              <h2 className="font-display font-bold text-sm sm:text-base text-white leading-tight break-words line-clamp-2 drop-shadow">
                {videoState.title}
              </h2>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {videoState.subtitle && (
                  <p className="text-[11px] sm:text-xs text-zinc-300 leading-snug break-words line-clamp-2">
                    {videoState.subtitle}
                  </p>
                )}
                {!localPlaying && !videoState.isLive && duration > 60 && duration > currentTime && (
                  <span className="px-2 py-0.5 rounded-full bg-white/12 backdrop-blur-md text-[10px] font-mono font-semibold text-zinc-200">
                    Termina a las{' '}
                    {new Date(
                      Date.now() + ((duration - currentTime) / (playbackSpeed || 1)) * 1000
                    ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
              {!isTvMode && (isFullscreen || isHorizontalFullscreen) && onToggleTouchLock && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('medium');
                    onToggleTouchLock();
                  }}
                  title={isTouchLocked ? 'Desbloquear controles táctiles' : 'Bloquear pantalla (evita toques)'}
                  aria-label={isTouchLocked ? 'Desbloquear pantalla' : 'Bloquear pantalla'}
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    isTouchLocked
                      ? 'bg-[#7C3AED] border-[#8B5CF6] text-white shadow-[0_8px_24px_rgba(124,58,237,0.45)]'
                      : 'bg-[#0D0D12]/80 hover:bg-[#0D0D12]/95 border-white/15 text-white'
                  }`}
                >
                  {isTouchLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {isTouchLocked && <span className="hidden sm:inline">Desbloquear</span>}
                </button>
              )}

              {!isTouchLocked && !isTvMode && (
                <button
                  type="button"
                  onClick={onDirectCastToTv}
                  title="Enviar señal directa a TV (Chromecast / AirPlay 2 / Smart TV)"
                  aria-label="Cast Directo a TV"
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    isCastingToTv || hasConnectedSmartTv
                      ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.35)]'
                      : 'bg-[#0D0D12]/80 hover:bg-[#7C3AED] border-white/20 text-white'
                  }`}
                >
                  <RiffanCastIcon size={16} tone="current" />
                  <span className="hidden sm:inline">{isCastingToTv ? 'En TV' : 'Cast'}</span>
                </button>
              )}

              {voiceSlot}

              {!isTouchLocked && !isTvMode && (isFullscreen || isHorizontalFullscreen) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('medium');
                    onOpenProMenu();
                  }}
                  title="Ajustes de Reproducción: Subtítulos, Modo Cine, PiP, Audio y Calidad"
                  aria-label="Abrir Ajustes de Reproducción"
                  className={`min-h-[44px] min-w-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    showProMenu ||
                    isCinemaMode ||
                    isInPiP ||
                    vocalBoostEnabled ||
                    activeSubId !== 'off'
                      ? 'bg-[#7C3AED]/25 border-[#8B5CF6]/60 text-white shadow-[0_0_20px_rgba(124,58,237,0.3)]'
                      : 'bg-[#0D0D12]/80 hover:bg-[#0D0D12]/95 border-white/15 text-white'
                  }`}
                >
                  <RiffanSlidersIcon size={16} tone="current" />
                  <span className="hidden sm:inline">Ajustes</span>
                </button>
              )}

              {!isTouchLocked && !isTvMode && canUseNativePiPOrCast && (
                <button
                  type="button"
                  onClick={onTogglePiP}
                  title={isInPiP ? 'Salir de Picture-in-Picture' : 'Ventana flotante (PiP)'}
                  aria-label={isInPiP ? 'Salir de Picture-in-Picture' : 'Activar Picture-in-Picture'}
                  className={`min-h-[44px] min-w-[44px] rounded-2xl backdrop-blur-xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                    isInPiP
                      ? 'bg-[#7C3AED]/30 border-[#8B5CF6] text-white shadow-[0_0_16px_rgba(124,58,237,0.4)]'
                      : 'bg-[#0D0D12]/75 hover:bg-[#0D0D12]/95 border-white/15 text-zinc-100'
                  }`}
                >
                  <PictureInPicture2 className="w-4 h-4 text-sky-400" />
                </button>
              )}

              {!isTvMode &&
                !isFullscreen &&
                !isHorizontalFullscreen &&
                onToggleMinimize && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onToggleMinimize();
                    }}
                    title="Mini-Player flotante arrastrable (16:9)"
                    aria-label="Activar Mini-Player flotante"
                    className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#0D0D12]/75 hover:bg-[#0D0D12]/95 backdrop-blur-xl border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                )}

              {isTvMode && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="min-h-[44px] px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  {isFullscreen ? (
                    <>
                      <RiffanExitFullscreenIcon size={16} tone="current" />
                      <span>Salir Pantalla Completa</span>
                    </>
                  ) : (
                    <>
                      <RiffanFullscreenIcon size={16} tone="current" />
                      <span>Pantalla Completa</span>
                    </>
                  )}
                </button>
              )}

              {isTvMode && onExitTvMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExitTvMode();
                  }}
                  className="min-h-[44px] px-3.5 rounded-2xl bg-black/75 hover:bg-rose-600/90 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Salir TV</span>
                </button>
              )}

              {!isTouchLocked && (!isTvMode && (isFullscreen || isHorizontalFullscreen) ? (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  title="Salir de pantalla completa"
                  aria-label="Salir de pantalla completa"
                  className="min-h-[44px] px-3.5 rounded-2xl bg-black/70 hover:bg-rose-600/90 backdrop-blur-xl border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <RiffanExitFullscreenIcon size={16} tone="current" />
                  <span>Salir</span>
                </button>
              ) : (
                !isTvMode &&
                onClosePlayer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      onClosePlayer();
                    }}
                    title="Cerrar reproductor"
                    aria-label="Cerrar reproductor"
                    className="min-h-[44px] min-w-[44px] rounded-2xl bg-black/60 hover:bg-rose-600/90 backdrop-blur-xl border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <RiffanCloseIcon size={16} tone="current" />
                  </button>
                )
              ))}
            </div>
          </div>
        )}

      {/* Unobtrusive Corner Actions for Embedded Web & YouTube Stages */}
      {!isMinimized &&
        (videoState.mode === 'embed' || videoState.mode === 'youtube') && (
          <div className="pointer-events-none absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
            {!isTvMode &&
              !isFullscreen &&
              !isHorizontalFullscreen &&
              onToggleMinimize && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    onToggleMinimize();
                  }}
                  title="Mini-Player flotante"
                  aria-label="Activar Mini-Player flotante"
                  className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              )}

            <button
              type="button"
              onClick={onToggleFullscreen}
              title={
                isFullscreen || isHorizontalFullscreen
                  ? 'Salir de pantalla completa'
                  : 'Pantalla completa'
              }
              aria-label="Pantalla completa"
              className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
            >
              {isFullscreen || isHorizontalFullscreen ? (
                <RiffanExitFullscreenIcon size={16} tone="current" />
              ) : (
                <RiffanFullscreenIcon size={16} tone="current" />
              )}
            </button>

            {!isTvMode &&
              !isFullscreen &&
              !isHorizontalFullscreen &&
              onClosePlayer && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('light');
                    onClosePlayer();
                  }}
                  title="Cerrar reproductor"
                  aria-label="Cerrar reproductor"
                  className="pointer-events-auto min-h-[40px] min-w-[40px] rounded-xl bg-black/70 hover:bg-rose-600/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                >
                  <RiffanCloseIcon size={16} tone="current" />
                </button>
              )}
          </div>
        )}
    </>
  );
};
