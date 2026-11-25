import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  ArrowLeftRight,
  Columns2,
  Loader2,
  Move,
  PictureInPicture2,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { AppLanguage, SecondaryStreamState } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { createLivePlaybackHealthMonitor } from './player/hlsHealthWatchdog';

interface SecondaryHlsStageProps {
  secondaryStream: SecondaryStreamState;
  slotIndex?: number; // 0 = Screen 2, 1 = Screen 3, 2 = Screen 4
  totalScreens?: number;
  isAudioActive?: boolean;
  isCornerPiP?: boolean;
  lang: AppLanguage;
  onFocusAudio?: () => void;
  onSwapWithPrimary: () => void;
  onToggleLayout?: () => void;
  onRetryStream?: () => void;
  onCloseSecondary: () => void;
}

const MAX_HLS_RECOVERIES = 2;

export const SecondaryHlsStage: React.FC<SecondaryHlsStageProps> = ({
  secondaryStream,
  slotIndex = 0,
  totalScreens = 2,
  isAudioActive = false,
  isCornerPiP = false,
  lang,
  onFocusAudio,
  onSwapWithPrimary,
  onToggleLayout,
  onRetryStream,
  onCloseSecondary,
}) => {
  const secVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recoveryCountRef = useRef<number>(0);
  const autoBackupTriedRef = useRef<number>(0);
  const waitSpinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRetryStreamRef = useRef(onRetryStream);
  onRetryStreamRef.current = onRetryStream;
  const fallbackCount = secondaryStream.fallbackUrls?.length || 0;
  const [buffering, setBuffering] = useState(true);
  const [streamFailed, setStreamFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [cornerIndex, setCornerIndex] = useState<0 | 1 | 2 | 3>(0);

  const clearWaitSpinner = () => {
    if (waitSpinnerTimerRef.current) {
      clearTimeout(waitSpinnerTimerRef.current);
      waitSpinnerTimerRef.current = null;
    }
    setBuffering(false);
  };

  const scheduleWaitSpinner = (delayMs = 750) => {
    if (waitSpinnerTimerRef.current) return;
    waitSpinnerTimerRef.current = setTimeout(() => {
      waitSpinnerTimerRef.current = null;
      const v = secVideoRef.current;
      if (v && !v.paused && v.readyState >= 3) return;
      setBuffering(true);
    }, delayMs);
  };

  useEffect(() => {
    autoBackupTriedRef.current = 0;
  }, [secondaryStream.id]);

  const cornerClasses = [
    'top-12 right-2.5 sm:top-14 sm:right-4',
    'top-12 left-2.5 sm:top-14 sm:left-4',
    'bottom-14 left-2.5 sm:bottom-16 sm:left-4',
    'bottom-14 right-2.5 sm:bottom-16 sm:right-4',
  ][cornerIndex];

  useEffect(() => {
    const video = secVideoRef.current;
    if (!video) return;
    const nextMuted = !isAudioActive;
    video.muted = nextMuted;
    if (!nextMuted && video.paused) {
      video.play().catch(() => {});
    }
  }, [isAudioActive, secondaryStream.url]);

  useEffect(() => {
    const video = secVideoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    recoveryCountRef.current = 0;

    if (secondaryStream.status === 'error') {
      setBuffering(false);
      setStreamFailed(true);
      return;
    }

    if (!secondaryStream.url) {
      setBuffering(secondaryStream.status === 'loading');
      setStreamFailed(false);
      return;
    }

    setStreamFailed(false);
    clearWaitSpinner();
    setBuffering(true);
    video.muted = !isAudioActive;

    let cancelled = false;
    let healthInterval: ReturnType<typeof setInterval> | null = null;
    const healthMonitor = createLivePlaybackHealthMonitor();

    const triggerBackupOrFail = () => {
      clearWaitSpinner();
      if (
        onRetryStreamRef.current &&
        fallbackCount > 0 &&
        autoBackupTriedRef.current < Math.min(2, fallbackCount)
      ) {
        autoBackupTriedRef.current += 1;
        setBuffering(true);
        setStreamFailed(false);
        onRetryStreamRef.current();
        return;
      }
      setBuffering(false);
      setStreamFailed(true);
    };

    const handleLoadedMeta = () => {
      clearWaitSpinner();
      setStreamFailed(false);
      video.play().catch(() => {});
    };

    const handleVideoError = () => {
      triggerBackupOrFail();
    };

    if (secondaryStream.mode === 'hls') {
      if (Hls.isSupported()) {
        const isMultiHeavy = totalScreens >= 3;
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startFragPrefetch: true,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 6,
          maxLiveSyncPlaybackRate: 1.04,
          backBufferLength: 6,
          maxBufferLength: isMultiHeavy ? 10 : 16,
          maxMaxBufferLength: isMultiHeavy ? 18 : 26,
          maxBufferHole: 0.4,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 8,
          abrEwmaDefaultEstimate: 5_000_000,
          manifestLoadingTimeOut: 15_000,
          manifestLoadingMaxRetry: 2,
          manifestLoadingRetryDelay: 200,
          levelLoadingTimeOut: 15_000,
          levelLoadingMaxRetry: 2,
          levelLoadingRetryDelay: 200,
          fragLoadingTimeOut: 15_000,
          fragLoadingMaxRetry: 3,
          fragLoadingRetryDelay: 250,
        });
        hlsRef.current = hls;
        hls.loadSource(secondaryStream.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (cancelled) return;
          clearWaitSpinner();
          setStreamFailed(false);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          clearWaitSpinner();
          setStreamFailed(false);
          video.play().catch(() => {});

          if (healthInterval) clearInterval(healthInterval);
          healthMonitor.reset();
          let lastSoftReconnectAt = 0;
          healthInterval = setInterval(() => {
            if (cancelled || !video || video.paused || hlsRef.current !== hls) return;
            const res = healthMonitor.check(video, Date.now());
            if (res.action === 'healthy' && !res.isStalled && video.readyState >= 3) {
              clearWaitSpinner();
            }
            let bufferedAhead = 0;
            try {
              for (let i = 0; i < video.buffered.length; i++) {
                const bStart = video.buffered.start(i);
                const bEnd = video.buffered.end(i);
                if (video.currentTime >= bStart - 0.15 && video.currentTime <= bEnd) {
                  bufferedAhead = Math.max(bufferedAhead, bEnd - video.currentTime);
                }
              }
            } catch {
              // ignore
            }
            if (res.action === 'recover_signal') {
              try {
                let nudged = false;
                for (let i = 0; i < video.buffered.length; i++) {
                  const bStart = video.buffered.start(i);
                  const bEnd = video.buffered.end(i);
                  if (bStart > video.currentTime + 0.08 && bStart - video.currentTime <= 4 && bEnd - bStart >= 0.3) {
                    video.currentTime = bStart + 0.05;
                    video.play().catch(() => {});
                    nudged = true;
                    break;
                  }
                }
                if (!nudged && bufferedAhead < 1.2) hls.startLoad(-1);
              } catch {
                // ignore
              }
            } else if (res.action === 'recover_media') {
              try {
                hls.recoverMediaError();
              } catch {
                // ignore
              }
            } else if (res.action === 'soft_reconnect') {
              const nowMs = Date.now();
              try {
                if (bufferedAhead < 0.4 && nowMs - lastSoftReconnectAt >= 12_000) {
                  lastSoftReconnectAt = nowMs;
                  hls.stopLoad();
                  hls.loadSource(secondaryStream.url);
                }
                hls.startLoad(-1);
                video.play().catch(() => {});
              } catch {
                // ignore
              }
            } else if (res.action === 'switch_backup') {
              triggerBackupOrFail();
            }
          }, 1000);
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (recoveryCountRef.current < MAX_HLS_RECOVERIES) {
            recoveryCountRef.current += 1;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad(-1);
              return;
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
          }
          hls.destroy();
          hlsRef.current = null;
          triggerBackupOrFail();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = secondaryStream.url;
        video.addEventListener('loadedmetadata', handleLoadedMeta, { once: true });
        video.addEventListener('error', handleVideoError, { once: true });
      } else {
        triggerBackupOrFail();
      }
    } else {
      video.src = secondaryStream.url;
      video.addEventListener('loadedmetadata', handleLoadedMeta, { once: true });
      video.addEventListener('error', handleVideoError, { once: true });
    }

    return () => {
      cancelled = true;
      if (healthInterval) clearInterval(healthInterval);
      clearWaitSpinner();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeEventListener('loadedmetadata', handleLoadedMeta);
      video.removeEventListener('error', handleVideoError);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [secondaryStream.url, secondaryStream.mode, secondaryStream.status, retryNonce, totalScreens]);

  const humanSlot = slotIndex + 2;
  const isCorner = isCornerPiP || (totalScreens <= 2 && secondaryStream.layout === 'corner');
  const showErrorState = streamFailed || secondaryStream.status === 'error';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={
        !isCorner
          ? `relative w-full h-full min-h-0 bg-black overflow-hidden select-none ${
              isAudioActive
                ? 'ring-2 ring-inset ring-emerald-400/80'
                : 'border border-white/[0.08]'
            }`
          : `absolute ${cornerClasses} z-35 w-[42%] max-w-[280px] aspect-video rounded-2xl overflow-hidden bg-[#0E0E10] border ${
              isAudioActive ? 'border-emerald-400/80' : 'border-white/20'
            } shadow-[0_14px_40px_rgba(0,0,0,0.95)] select-none transition-all duration-200`
      }
    >
      <video
        ref={secVideoRef}
        muted={!isAudioActive}
        playsInline
        onWaiting={() => {
          if (!showErrorState) scheduleWaitSpinner(750);
        }}
        onLoadedData={() => {
          clearWaitSpinner();
          setStreamFailed(false);
        }}
        onCanPlay={() => {
          clearWaitSpinner();
          setStreamFailed(false);
        }}
        onPlaying={() => {
          clearWaitSpinner();
          setStreamFailed(false);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (buffering && v.readyState >= 3 && v.currentTime > 0) {
            clearWaitSpinner();
          }
        }}
        onClick={() => {
          if (onFocusAudio) {
            triggerHaptic('light');
            onFocusAudio();
          } else {
            triggerHaptic('medium');
            onSwapWithPrimary();
          }
        }}
        title={pickLang(lang, {
          es: 'Toca para escuchar esta pantalla',
          ca: 'Toca per escoltar aquesta pantalla',
          en: 'Tap to focus audio on this screen',
        })}
        className="w-full h-full object-contain bg-black cursor-pointer"
      />

      {buffering && !showErrorState && (
        <div className="pointer-events-none absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1.5">
          <Loader2 className="w-5 h-5 animate-spin text-[#A78BFA]" />
          <span className="text-[11px] font-semibold text-zinc-300">
            {pickLang(lang, { es: 'Conectando señal...', ca: 'Connectant senyal...', en: 'Connecting feed...' })}
          </span>
        </div>
      )}

      {showErrorState && (
        <div className="absolute inset-0 bg-[#08090E]/92 backdrop-blur-sm flex flex-col items-center justify-center gap-2.5 p-3 text-center">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-xs font-semibold text-zinc-200 line-clamp-2 max-w-[240px]">
            {pickLang(lang, {
              es: `Señal interrumpida en Pantalla ${humanSlot}`,
              ca: `Senyal interromput a Pantalla ${humanSlot}`,
              en: `Feed interrupted on Screen ${humanSlot}`,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setStreamFailed(false);
                if (onRetryStream) onRetryStream();
                else setRetryNonce((n) => n + 1);
              }}
              className="min-h-8 px-3 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onCloseSecondary();
              }}
              className="min-h-8 px-3 rounded-lg bg-white/10 hover:bg-rose-600/80 text-white text-[11px] font-semibold cursor-pointer active:scale-95 transition-all"
            >
              {pickLang(lang, { es: 'Quitar', ca: 'Treure', en: 'Remove' })}
            </button>
          </div>
        </div>
      )}

      {/* Top Mini Overlay */}
      <div className="absolute top-0 inset-x-0 px-2 sm:px-2.5 py-1.5 bg-gradient-to-b from-black/92 via-black/65 to-transparent flex items-center justify-between gap-1.5">
        <div className="min-w-0 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-100 truncate">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums shrink-0 ${
              isAudioActive ? 'bg-emerald-500 text-black' : 'bg-white/15 text-white'
            }`}
          >
            P{humanSlot}
          </span>
          <span className="truncate">{secondaryStream.title}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onFocusAudio && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onFocusAudio();
              }}
              aria-label={pickLang(lang, {
                es: `Escuchar Pantalla ${humanSlot}`,
                ca: `Escoltar Pantalla ${humanSlot}`,
                en: `Listen to Screen ${humanSlot}`,
              })}
              title={pickLang(lang, {
                es: isAudioActive ? 'Audio activo en esta pantalla' : 'Activar audio aquí',
                ca: isAudioActive ? 'Àudio actiu aquí' : 'Activar àudio aquí',
                en: isAudioActive ? 'Audio active here' : 'Switch audio here',
              })}
              className={`h-7 px-2 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                isAudioActive
                  ? 'bg-emerald-500 text-black'
                  : 'bg-black/75 hover:bg-white/20 text-zinc-200 border border-white/15'
              }`}
            >
              {isAudioActive ? (
                <Volume2 className="w-3 h-3 shrink-0" />
              ) : (
                <VolumeX className="w-3 h-3 shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isAudioActive
                  ? pickLang(lang, { es: 'Audio', ca: 'Àudio', en: 'Audio' })
                  : pickLang(lang, { es: 'Oír', ca: 'Sentir', en: 'Listen' })}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onSwapWithPrimary();
            }}
            title={pickLang(lang, {
              es: 'Intercambiar con Pantalla 1',
              ca: 'Intercanviar amb Pantalla 1',
              en: 'Swap with Screen 1',
            })}
            className="h-7 px-2 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
          >
            <ArrowLeftRight className="w-3 h-3 shrink-0" />
            <span className="hidden md:inline">P1</span>
          </button>

          {isCorner && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setCornerIndex((prev) => ((prev + 1) % 4) as 0 | 1 | 2 | 3);
              }}
              aria-label={pickLang(lang, {
                es: 'Cambiar de esquina',
                ca: 'Canviar de cantonada',
                en: 'Move corner',
              })}
              className="w-7 h-7 rounded-lg bg-black/75 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <Move className="w-3 h-3" />
            </button>
          )}

          {totalScreens <= 2 && onToggleLayout && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleLayout();
              }}
              aria-label={
                !isCorner
                  ? pickLang(lang, { es: 'Modo esquina', ca: 'Mode cantonada', en: 'Corner view' })
                  : pickLang(lang, {
                      es: 'Dividir pantalla 3/4',
                      ca: 'Dividir pantalla 3/4',
                      en: 'Split screen',
                    })
              }
              title={
                !isCorner
                  ? pickLang(lang, { es: 'Modo esquina', ca: 'Mode cantonada', en: 'Corner view' })
                  : pickLang(lang, {
                      es: 'Dividir pantalla 3/4',
                      ca: 'Dividir pantalla 3/4',
                      en: 'Split screen',
                    })
              }
              className="w-7 h-7 rounded-lg bg-black/75 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              {!isCorner ? (
                <PictureInPicture2 className="w-3 h-3" />
              ) : (
                <Columns2 className="w-3 h-3" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onCloseSecondary();
            }}
            aria-label={pickLang(lang, {
              es: `Cerrar Pantalla ${humanSlot}`,
              ca: `Tancar Pantalla ${humanSlot}`,
              en: `Close Screen ${humanSlot}`,
            })}
            className="w-7 h-7 rounded-lg bg-black/75 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
