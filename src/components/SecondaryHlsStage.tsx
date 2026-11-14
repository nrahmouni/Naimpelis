import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeftRight, Columns2, Move, PictureInPicture2, VolumeX, X, Loader2 } from 'lucide-react';
import { AppLanguage, SecondaryStreamState } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';

interface SecondaryHlsStageProps {
  secondaryStream: SecondaryStreamState;
  lang: AppLanguage;
  onSwapWithPrimary: () => void;
  onToggleLayout: () => void;
  onCloseSecondary: () => void;
}

export const SecondaryHlsStage: React.FC<SecondaryHlsStageProps> = ({
  secondaryStream,
  lang,
  onSwapWithPrimary,
  onToggleLayout,
  onCloseSecondary,
}) => {
  const secVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [cornerIndex, setCornerIndex] = useState<0 | 1 | 2 | 3>(0);

  const cornerClasses = [
    'top-12 right-2.5 sm:top-14 sm:right-4',
    'top-12 left-2.5 sm:top-14 sm:left-4',
    'bottom-14 left-2.5 sm:bottom-16 sm:left-4',
    'bottom-14 right-2.5 sm:bottom-16 sm:right-4',
  ][cornerIndex];

  useEffect(() => {
    const video = secVideoRef.current;
    if (!video || !secondaryStream.url) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setBuffering(true);
    video.muted = true;

    if (secondaryStream.mode === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
        });
        hlsRef.current = hls;
        hls.loadSource(secondaryStream.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setBuffering(false);
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = secondaryStream.url;
        video.addEventListener(
          'loadedmetadata',
          () => {
            setBuffering(false);
            video.play().catch(() => {});
          },
          { once: true }
        );
      }
    } else {
      video.src = secondaryStream.url;
      video.addEventListener(
        'loadedmetadata',
        () => {
          setBuffering(false);
          video.play().catch(() => {});
        },
        { once: true }
      );
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [secondaryStream.url, secondaryStream.mode]);

  const isSplit = secondaryStream.layout === 'split';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={
        isSplit
          ? 'relative w-1/2 h-full bg-black border-l border-white/15 overflow-hidden select-none'
          : `absolute ${cornerClasses} z-35 w-[42%] max-w-[280px] aspect-video rounded-2xl overflow-hidden bg-[#0E0E10] border border-white/20 shadow-[0_14px_40px_rgba(0,0,0,0.95)] select-none transition-all duration-200`
      }
    >
      <video
        ref={secVideoRef}
        muted
        playsInline
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onClick={() => {
          triggerHaptic('medium');
          onSwapWithPrimary();
        }}
        title={pickLang(lang, {
          es: 'Toca para escuchar este partido en pantalla principal',
          ca: 'Toca per escoltar aquest partit a la pantalla principal',
          en: 'Tap to swap to main audio',
        })}
        className="w-full h-full object-contain bg-black cursor-pointer"
      />

      {buffering && (
        <div className="pointer-events-none absolute inset-0 bg-black/60 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#9146FF]" />
        </div>
      )}

      {/* Top Mini Overlay */}
      <div className="absolute top-0 inset-x-0 px-2.5 py-1.5 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between gap-1">
        <div className="min-w-0 flex items-center gap-1.5 text-[10px] font-semibold text-zinc-200 truncate">
          <VolumeX className="w-3 h-3 shrink-0 text-zinc-400" />
          <span className="truncate">{secondaryStream.title}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onSwapWithPrimary();
            }}
            title={pickLang(lang, {
              es: 'Pasar este partido al principal con sonido',
              ca: 'Passar aquest partit al principal amb so',
              en: 'Swap to main screen with audio',
            })}
            className="h-6 px-2 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span className="hidden sm:inline">
              {pickLang(lang, { es: 'Audio', ca: 'Àudio', en: 'Swap' })}
            </span>
          </button>

          {!isSplit && (
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
              title={pickLang(lang, {
                es: 'Cambiar de esquina',
                ca: 'Canviar de cantonada',
                en: 'Move corner',
              })}
              className="w-6 h-6 rounded-lg bg-black/70 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <Move className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleLayout();
            }}
            aria-label={
              isSplit
                ? pickLang(lang, { es: 'Modo esquina', ca: 'Mode cantonada', en: 'Corner view' })
                : pickLang(lang, {
                    es: 'Dividir pantalla 50/50',
                    ca: 'Dividir pantalla 50/50',
                    en: 'Split 50/50',
                  })
            }
            title={
              isSplit
                ? pickLang(lang, { es: 'Modo esquina', ca: 'Mode cantonada', en: 'Corner view' })
                : pickLang(lang, {
                    es: 'Dividir pantalla 50/50',
                    ca: 'Dividir pantalla 50/50',
                    en: 'Split 50/50',
                  })
            }
            className="w-6 h-6 rounded-lg bg-black/70 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            {isSplit ? (
              <PictureInPicture2 className="w-3 h-3" />
            ) : (
              <Columns2 className="w-3 h-3" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onCloseSecondary();
            }}
            aria-label={pickLang(lang, {
              es: 'Cerrar 2ª pantalla',
              ca: 'Tancar 2a pantalla',
              en: 'Close 2nd screen',
            })}
            title={pickLang(lang, {
              es: 'Cerrar 2ª pantalla',
              ca: 'Tancar 2a pantalla',
              en: 'Close 2nd screen',
            })}
            className="w-6 h-6 rounded-lg bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
