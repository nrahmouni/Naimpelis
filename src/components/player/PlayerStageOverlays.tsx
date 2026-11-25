import React from 'react';
import { Check, RotateCcw, RotateCw, SkipForward, Tv, Unlock } from 'lucide-react';
import {
  RiffanChatIcon,
  RiffanCloseIcon,
  RiffanFullscreenIcon,
  RiffanLoaderR,
  RiffanPauseIcon,
  RiffanPlayIcon,
  RiffanRetryIcon,
  RiffanWarningIcon,
} from '../ui/RiffanIcons';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { findActiveSubtitleText, ParsedSubtitleCue } from '../../utils/subtitles';
import type { StreamRefreshPhase } from './playerTypes';
import type {
  AppLanguage,
  ChatMessage,
  FloatingReaction,
  LanguageNoticePopup,
  SubtitleStyleSettings,
  VideoState,
} from '../../types';

export interface PlayerStageOverlaysProps {
  lang: AppLanguage;
  videoState: VideoState;
  isMinimized: boolean;
  isCompressed: boolean;
  isTvMode: boolean;
  isStageFullscreen: boolean;
  isExtracting: boolean;
  isBuffering: boolean;
  streamRefreshPhase?: StreamRefreshPhase;
  streamError: string | null;
  extractionLabel?: string;
  extractingTitleCopy: string;
  extractingSubCopy: string;
  floatingReactions: FloatingReaction[];
  seekRipple: 'left' | 'right' | null;
  activeLanguagePopup: LanguageNoticePopup | null;
  playerToast: string | null;
  recentIncomingChatBubble: ChatMessage | null;
  floatingChatOpen: boolean;
  isCastingToTv: boolean;
  batterySaverTvMode: boolean;
  hasConnectedSmartTv: boolean;
  castDeviceName?: string | null;
  showControls: boolean;
  localPlaying: boolean;
  currentTime: number;
  activeSubId: string;
  parsedCues: ParsedSubtitleCue[];
  subtitleOffsetSec: number;
  subtitleSize: 'sm' | 'md' | 'lg';
  subtitleStyle: SubtitleStyleSettings;
  autoNextCountdown: number | null;
  onDismissLocalLangPopup: () => void;
  onDismissLanguageNotice?: () => void;
  onDismissChatBubble: () => void;
  onToggleFloatingChat?: () => void;
  onDisableBatterySaverTvMode: () => void;
  onExpandCompressed?: () => void;
  onCancelExtraction?: () => void;
  onForceReloadStream: () => void;
  onSelectTrack: (idx: number, seekSec: number) => void;
  onSeekRelative: (deltaSec: number, e: React.MouseEvent) => void;
  onTogglePlay: (e: React.MouseEvent) => void;
  onNextEpisode?: () => void;
  onAcceptAutoNext: () => void;
  onCancelAutoNext: () => void;
  isTouchLocked?: boolean;
  onToggleTouchLock?: () => void;
}

export const PlayerStageOverlays: React.FC<PlayerStageOverlaysProps> = ({
  lang,
  videoState,
  isMinimized,
  isCompressed,
  isTvMode,
  isStageFullscreen,
  isExtracting,
  isBuffering,
  streamRefreshPhase = 'idle',
  streamError,
  extractionLabel,
  extractingTitleCopy,
  extractingSubCopy,
  floatingReactions,
  seekRipple,
  activeLanguagePopup,
  playerToast,
  recentIncomingChatBubble,
  floatingChatOpen,
  isCastingToTv,
  batterySaverTvMode,
  hasConnectedSmartTv,
  castDeviceName,
  showControls,
  localPlaying,
  currentTime,
  activeSubId,
  parsedCues,
  subtitleOffsetSec,
  subtitleSize,
  subtitleStyle,
  autoNextCountdown,
  onDismissLocalLangPopup,
  onDismissLanguageNotice,
  onDismissChatBubble,
  onToggleFloatingChat,
  onDisableBatterySaverTvMode,
  onExpandCompressed,
  onCancelExtraction,
  onForceReloadStream,
  onSelectTrack,
  onSeekRelative,
  onTogglePlay,
  onNextEpisode,
  onAcceptAutoNext,
  onCancelAutoNext,
  isTouchLocked = false,
  onToggleTouchLock,
}) => {
  return (
    <>
      {!isMinimized && !isCompressed && (
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              style={{ left: `${r.xOffset}%` }}
              className="absolute bottom-10 animate-float-up flex flex-col items-center"
            >
              <span className="text-3xl drop-shadow-md">{r.emoji}</span>
              <span className="text-[10px] font-medium text-white/90 bg-black/65 px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap">
                {r.senderName}
              </span>
            </div>
          ))}
        </div>
      )}

      {seekRipple && !isMinimized && (
        <div
          className={`pointer-events-none absolute inset-y-0 ${
            seekRipple === 'left' ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full'
          } w-1/3 bg-white/15 backdrop-blur-[2px] z-30 flex items-center justify-center text-xs font-bold text-white`}
        >
          {seekRipple === 'left' ? '« -10s' : '+10s »'}
        </div>
      )}

      {activeLanguagePopup && !isMinimized && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDismissLocalLangPopup();
            onDismissLanguageNotice?.();
          }}
          className={`pointer-events-auto absolute top-11 sm:top-13 left-1/2 -translate-x-1/2 z-45 w-[92%] max-w-[400px] px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl backdrop-blur-xl border shadow-[0_14px_34px_rgba(0,0,0,0.85)] flex items-center justify-between gap-2 cursor-pointer transition-all ${
            activeLanguagePopup.type === 'warning' || activeLanguagePopup.type === 'error'
              ? 'bg-[#19110B]/95 border-amber-400/55 text-amber-100'
              : 'bg-[#0B1412]/95 border-emerald-400/50 text-emerald-50'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                activeLanguagePopup.type === 'warning' || activeLanguagePopup.type === 'error'
                  ? 'bg-amber-500/25 text-amber-300'
                  : 'bg-emerald-500/25 text-emerald-300'
              }`}
            >
              {activeLanguagePopup.type === 'warning' || activeLanguagePopup.type === 'error' ? (
                <RiffanWarningIcon size={14} animate="always" tone="current" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0 text-left">
              <div className="font-display font-bold text-[11px] sm:text-xs text-white leading-tight truncate">
                {activeLanguagePopup.title}
              </div>
              {activeLanguagePopup.subtitle && (
                <div className="text-[10px] sm:text-[11px] text-zinc-200/90 leading-tight truncate">
                  {activeLanguagePopup.subtitle}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismissLocalLangPopup();
              onDismissLanguageNotice?.();
            }}
            className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
            aria-label="Cerrar aviso de idioma"
          >
            <RiffanCloseIcon size={13} tone="current" />
          </button>
        </div>
      )}

      {playerToast && !isMinimized && (
        <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-xl bg-[#18181B]/95 border border-white/15 text-xs font-medium text-white shadow-xl text-center max-w-[90%]">
          {playerToast}
        </div>
      )}

      {recentIncomingChatBubble &&
        !floatingChatOpen &&
        !isMinimized &&
        !isCompressed &&
        !isTvMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismissChatBubble();
              onToggleFloatingChat?.();
            }}
            className="pointer-events-auto absolute bottom-14 left-3 z-35 max-w-[78%] sm:max-w-[320px] px-3 py-2 rounded-2xl bg-[#18181B]/88 hover:bg-[#18181B] backdrop-blur-md border border-[#9146FF]/35 shadow-2xl flex items-center gap-2 text-left cursor-pointer"
          >
            <RiffanChatIcon size={14} />
            <div className="min-w-0 text-xs">
              <span className="font-bold text-[#BF94FF] mr-1.5">
                {recentIncomingChatBubble.senderName}:
              </span>
              <span className="text-white truncate">{recentIncomingChatBubble.text}</span>
            </div>
          </button>
        )}

      {(isCastingToTv || (batterySaverTvMode && hasConnectedSmartTv)) &&
        !isMinimized &&
        !isTvMode && (
          <div className="absolute inset-0 z-15 bg-[#0E0E10]/94 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#00F593]/15 border border-[#00F593]/40 flex items-center justify-center text-[#00F593]">
              <Tv className="w-6 h-6" />
            </div>
            <p className="font-display font-bold text-sm sm:text-base text-white">
              {isCastingToTv
                ? `${pickLang(lang, {
                    es: 'Transmitiendo en',
                    ca: 'Transmetent a',
                    en: 'Casting to',
                  })} ${
                    castDeviceName ||
                    pickLang(lang, { es: 'tu TV', ca: 'la teva TV', en: 'your TV' })
                  }`
                : pickLang(lang, {
                    es: 'Modo Solo Mando · Reproduciendo en tu Smart TV',
                    ca: 'Mode Només Comandament · Reproduint a la teva Smart TV',
                    en: 'Remote-Only Mode · Playing on your Smart TV',
                  })}
            </p>
            <p className="text-xs text-zinc-400 max-w-xs">
              {batterySaverTvMode
                ? pickLang(lang, {
                    es: 'Vídeo local pausado para ahorrar batería en tu móvil. Tus controles siguen sincronizados.',
                    ca: 'Vídeo local en pausa per estalviar bateria al mòbil. Els controls continuen sincronitzats.',
                    en: 'Local video paused to save phone battery. Your controls remain synced.',
                  })
                : videoState.title}
            </p>
            {batterySaverTvMode && (
              <button
                type="button"
                onClick={onDisableBatterySaverTvMode}
                className="mt-1 min-h-[38px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
              >
                {pickLang(lang, {
                  es: 'Ver vídeo también en el móvil',
                  ca: 'Veure vídeo també al mòbil',
                  en: 'Watch on phone as well',
                })}
              </button>
            )}
          </div>
        )}

      {isCompressed && !isMinimized && !isTvMode && !isStageFullscreen && (
        <div className="pointer-events-none absolute top-2 right-2 z-35 flex items-center gap-1.5">
          {onExpandCompressed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onExpandCompressed();
              }}
              aria-label={pickLang(lang, {
                es: 'Ampliar reproductor',
                ca: 'Ampliar reproductor',
                en: 'Expand player',
              })}
              className="pointer-events-auto min-h-[34px] px-3 rounded-full bg-black/75 hover:bg-[#9146FF] backdrop-blur-md border border-white/20 text-[11px] font-bold text-white flex items-center gap-1.5 shadow-lg cursor-pointer active:scale-95 transition-all"
            >
              <RiffanFullscreenIcon size={14} tone="current" />
              <span>{pickLang(lang, { es: 'Ampliar', ca: 'Ampliar', en: 'Expand' })}</span>
            </button>
          )}
        </div>
      )}

      {!isMinimized &&
        activeSubId !== 'off' &&
        parsedCues.length > 0 &&
        (() => {
          const cueText = findActiveSubtitleText(parsedCues, currentTime, subtitleOffsetSec);
          if (!cueText) return null;
          const sizeClass =
            subtitleSize === 'sm'
              ? 'text-xs sm:text-sm'
              : subtitleSize === 'lg'
              ? 'text-base sm:text-2xl'
              : 'text-sm sm:text-lg';
          return (
            <div
              className={`pointer-events-none absolute inset-x-4 z-25 flex justify-center transition-all duration-150 ${
                showControls ? 'bottom-16 sm:bottom-20' : 'bottom-4 sm:bottom-7'
              }`}
            >
              <div
                className={`max-w-[86%] px-2.5 py-1 rounded-md font-medium text-center whitespace-pre-line leading-snug ${sizeClass}`}
                style={{
                  color: subtitleStyle.fontColor,
                  opacity: subtitleStyle.textOpacity ?? 0.82,
                  fontSize: `${subtitleStyle.fontScale * 100}%`,
                  backgroundColor: `rgba(0, 0, 0, ${subtitleStyle.bgOpacity})`,
                  textShadow:
                    subtitleStyle.edgeShadow === 'none'
                      ? 'none'
                      : subtitleStyle.edgeShadow === 'outline'
                      ? '0 0 4px #000, 0 0 2px #000'
                      : '0 1px 4px rgba(0,0,0,0.85)',
                }}
              >
                {cueText}
              </div>
            </div>
          );
        })()}

      {!isMinimized && autoNextCountdown !== null && onNextEpisode && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-16 right-3 sm:bottom-20 sm:right-5 z-35 p-3 rounded-2xl bg-[#141418]/95 nc-specular-surface border border-[#9146FF]/40 shadow-[0_18px_45px_rgba(0,0,0,0.7)] flex items-center gap-2.5 backdrop-blur-xl animate-sheet-up"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-[#BF94FF]">
              {pickLang(lang, { es: 'Fin del capítulo', ca: 'Final del capítol', en: 'Up next' })}
            </div>
            <div className="text-xs font-bold text-white whitespace-nowrap">
              {pickLang(lang, {
                es: `Siguiente episodio en ${autoNextCountdown}s…`,
                ca: `Següent episodi en ${autoNextCountdown}s…`,
                en: `Next episode in ${autoNextCountdown}s…`,
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onAcceptAutoNext}
            className="min-h-[34px] px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5 fill-current" />
            <span>{pickLang(lang, { es: 'Ver ya', ca: 'Veure ara', en: 'Play now' })}</span>
          </button>
          <button
            type="button"
            onClick={onCancelAutoNext}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center cursor-pointer"
            aria-label="Cancelar auto-reproducción"
          >
            <RiffanCloseIcon size={14} tone="current" />
          </button>
        </div>
      )}

      {!isMinimized &&
        isTouchLocked &&
        showControls &&
        onToggleTouchLock && (
          <div className="pointer-events-none absolute bottom-6 inset-x-0 z-40 flex justify-center px-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('medium');
                onToggleTouchLock();
              }}
              className="pointer-events-auto min-h-[44px] px-4 rounded-full bg-[#121420]/90 hover:bg-[#9146FF] backdrop-blur-xl border border-[#9146FF]/60 text-xs font-bold text-white flex items-center gap-2 shadow-[0_12px_32px_rgba(0,0,0,0.75)] cursor-pointer active:scale-95 transition-all"
            >
              <Unlock className="w-4 h-4 text-[#D8B4FE]" />
              <span>
                {pickLang(lang, {
                  es: 'Pantalla bloqueada · Toca para desbloquear',
                  ca: 'Pantalla bloquejada · Toca per desbloquejar',
                  en: 'Screen locked · Tap to unlock',
                })}
              </span>
            </button>
          </div>
        )}

      {!isMinimized &&
        !isTouchLocked &&
        (videoState.mode === 'hls' || videoState.mode === 'direct') &&
        !isExtracting &&
        !streamError &&
        !(videoState.isLive && (isBuffering || streamRefreshPhase !== 'idle')) && (
          <div
            className={`pointer-events-none absolute inset-0 z-35 flex items-center justify-center gap-6 sm:gap-10 transition-opacity duration-150 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {!videoState.isLive && (
              <button
                type="button"
                disabled={!showControls}
                onClick={(e) => onSeekRelative(-10, e)}
                aria-label="Retroceder 10 segundos"
                className={`relative z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#141418]/75 hover:bg-[#1F1F26]/90 backdrop-blur-xl border border-white/20 hover:border-white/35 flex flex-col items-center justify-center text-white shadow-xl active:scale-90 transition-all cursor-pointer ${
                  showControls ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-[9px] font-bold tabular-nums tracking-tighter -mt-0.5">
                  -10s
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={!showControls}
              onClick={onTogglePlay}
              aria-label={localPlaying ? 'Pausar' : 'Reproducir'}
              className={`relative z-40 w-15 h-15 sm:w-18 sm:h-18 rounded-full bg-[#141418]/80 hover:bg-[#9146FF] backdrop-blur-xl border border-white/25 hover:border-[#BF94FF]/70 flex items-center justify-center text-white shadow-[0_14px_40px_rgba(0,0,0,0.65)] hover:shadow-[0_10px_32px_rgba(145,70,255,0.45)] active:scale-90 transition-all cursor-pointer ${
                showControls ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {localPlaying ? (
                <RiffanPauseIcon size={30} tone="current" />
              ) : (
                <RiffanPlayIcon size={30} tone="current" />
              )}
            </button>

            {!videoState.isLive && (
              <button
                type="button"
                disabled={!showControls}
                onClick={(e) => onSeekRelative(10, e)}
                aria-label="Avanzar 10 segundos"
                className={`relative z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#141418]/75 hover:bg-[#1F1F26]/90 backdrop-blur-xl border border-white/20 hover:border-white/35 flex flex-col items-center justify-center text-white shadow-xl active:scale-90 transition-all cursor-pointer ${
                  showControls ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-[9px] font-bold tabular-nums tracking-tighter -mt-0.5">
                  +10s
                </span>
              </button>
            )}
          </div>
        )}

      {isExtracting && (
        <div className="pointer-events-auto absolute inset-0 z-25 bg-black/72 backdrop-blur-[3px] flex flex-col items-center justify-center p-4 text-center">
          <RiffanLoaderR size={isMinimized ? 36 : 56} className="mb-2" />
          {!isMinimized && (
            <>
              <p className="font-display font-semibold text-xs sm:text-base text-white max-w-md">
                {extractionLabel || extractingTitleCopy}
              </p>
              <p className="text-[11px] sm:text-xs text-zinc-300 mt-1 max-w-sm">
                {extractingSubCopy}
              </p>
            </>
          )}
          {onCancelExtraction && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onCancelExtraction();
              }}
              aria-label={pickLang(lang, {
                es: 'Cancelar carga',
                ca: 'Cancel·lar càrrega',
                en: 'Cancel loading',
                zh: '取消加载',
              })}
              className={`pointer-events-auto cursor-pointer active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 font-semibold border border-white/20 bg-white/[0.1] hover:bg-white/[0.18] text-white ${
                isMinimized
                  ? 'mt-1.5 h-7 px-2.5 rounded-lg text-[10px]'
                  : 'mt-3.5 min-h-[38px] px-4 rounded-xl text-xs sm:text-sm'
              }`}
            >
              <RiffanCloseIcon size={14} tone="current" />
              <span>
                {pickLang(lang, {
                  es: 'Cancelar',
                  ca: 'Cancel·lar',
                  en: 'Cancel',
                  zh: '取消',
                })}
              </span>
            </button>
          )}
        </div>
      )}

      {!isExtracting &&
        !streamError &&
        (isBuffering || streamRefreshPhase !== 'idle') &&
        (videoState.mode === 'hls' || videoState.mode === 'direct') && (
          <>
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-none absolute z-25 overflow-hidden flex items-center gap-2 bg-[#0B0E17]/88 backdrop-blur-md border border-white/15 shadow-[0_10px_28px_rgba(0,0,0,0.65)] ${
                isMinimized
                  ? 'top-2 left-2 p-1.5 rounded-lg'
                  : 'bottom-3 sm:bottom-4 left-3 sm:left-4 px-3 py-1.5 rounded-xl max-w-[calc(100%-24px)]'
              }`}
            >
              {streamRefreshPhase !== 'idle' && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] overflow-hidden"
                >
                  <span className="block h-full w-1/2 bg-gradient-to-r from-[#9146FF] via-[#00F593] to-[#9146FF] rtv-signal-sweep" />
                </span>
              )}
              <div className="relative w-5 h-5 shrink-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 animate-spin text-[#00F593]"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeOpacity="0.2"
                    strokeWidth="2.4"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="w-1.5 h-1.5 rounded-full bg-[#9146FF] absolute" />
              </div>
              {!isMinimized && (
                <div className="min-w-0 leading-tight">
                  <div className="text-[11px] sm:text-xs font-semibold text-white truncate">
                    {videoState.isLive
                      ? streamRefreshPhase === 'switching'
                        ? pickLang(lang, {
                            es: 'Cambiando a señal alternativa…',
                            ca: 'Canviant a senyal alternativa…',
                            en: 'Switching to backup feed…',
                          })
                        : streamRefreshPhase === 'reconnecting'
                        ? pickLang(lang, {
                            es: 'Señal pausada · Reconectando emisión…',
                            ca: 'Senyal aturada · Reconnectant emissió…',
                            en: 'Signal paused · Reconnecting stream…',
                          })
                        : streamRefreshPhase === 'recovering'
                        ? pickLang(lang, {
                            es: 'Señal detenida · Refrescando en vivo…',
                            ca: 'Senyal aturada · Refrescant en directe…',
                            en: 'Signal stalled · Refreshing live feed…',
                          })
                        : pickLang(lang, {
                            es: 'Conectando emisión en directo…',
                            ca: 'Connectant emissió en directe…',
                            en: 'Connecting live stream…',
                          })
                      : pickLang(lang, {
                          es: 'Cargando vídeo…',
                          ca: 'Carregant vídeo…',
                          en: 'Buffering…',
                        })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      {streamError && !isExtracting && !isMinimized && (
        <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center p-5 text-center gap-2.5">
          <RiffanWarningIcon size={34} animate="always" className="text-amber-400" />
          <p className="text-xs sm:text-sm font-semibold text-zinc-100 max-w-md">{streamError}</p>
          <p className="text-[11px] text-zinc-400 max-w-sm">
            {pickLang(lang, {
              es: 'Comprueba tu conexión o prueba otra señal disponible.',
              ca: 'Comprova la connexió o prova un altre senyal disponible.',
              en: 'Check your connection or try another available stream.',
            })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onForceReloadStream}
              className="min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <RiffanRetryIcon size={16} tone="current" />
              <span>
                {pickLang(lang, {
                  es: 'Reintentar señal',
                  ca: 'Reintentar senyal',
                  en: 'Retry stream',
                })}
              </span>
            </button>
            {videoState.tracks.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTrack(
                    (videoState.activeTrackIndex + 1) % videoState.tracks.length,
                    currentTime
                  );
                }}
                className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
              >
                {pickLang(lang, {
                  es: 'Probar siguiente canal',
                  ca: 'Provar el següent canal',
                  en: 'Try next channel',
                })}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
