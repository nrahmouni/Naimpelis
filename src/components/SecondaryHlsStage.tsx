import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeftRight, Columns2, PictureInPicture2, VolumeX, X, Loader2 } from 'lucide-react';
import { AppLanguage, SecondaryStreamState } from '../types';
import { triggerHaptic } from '../utils/haptics';

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
          : 'absolute top-12 right-2.5 sm:top-14 sm:right-4 z-35 w-[42%] max-w-[280px] aspect-video rounded-xl overflow-hidden bg-black border border-sky-400/50 shadow-[0_14px_40px_rgba(0,0,0,0.9)] select-none'
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
        title={
          lang === 'es'
            ? 'Toca para escuchar este partido en pantalla principal'
            : 'Tap to swap to main audio'
        }
        className="w-full h-full object-contain bg-black cursor-pointer"
      />

      {buffering && (
        <div className="pointer-events-none absolute inset-0 bg-black/55 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
        </div>
      )}

      {/* Top Mini Overlay */}
      <div className="absolute top-0 inset-x-0 px-2 py-1.5 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between gap-1">
        <div className="min-w-0 flex items-center gap-1 text-[10px] font-semibold text-sky-300 truncate">
          <VolumeX className="w-3 h-3 shrink-0 text-zinc-300" />
          <span className="truncate">{secondaryStream.title}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onSwapWithPrimary();
            }}
            title={
              lang === 'es'
                ? 'Pasar este partido al principal con sonido'
                : 'Swap to main screen with audio'
            }
            className="h-6 px-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-[#090A0F] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span className="hidden sm:inline">
              {lang === 'es' ? 'Audio' : 'Swap'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleLayout();
            }}
            title={
              isSplit
                ? lang === 'es'
                  ? 'Modo esquina'
                  : 'Corner view'
                : lang === 'es'
                ? 'Dividir pantalla 50/50'
                : 'Split 50/50'
            }
            className="w-6 h-6 rounded-md bg-black/70 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
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
            title={lang === 'es' ? 'Cerrar 2ª pantalla' : 'Close 2nd screen'}
            className="w-6 h-6 rounded-md bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
