import React, { useCallback, useEffect, useRef } from 'react';
import type { AppLanguage, VideoState } from '../../types';
import { pickLang } from '../../utils/i18n';
import type { WakeLockSentinelLike, WebKitVideoElement } from './playerTypes';

interface UseCinemaPlatformApisParams {
  lang: AppLanguage;
  videoState: VideoState;
  stageWrapperRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ambilightEnabled: boolean;
  vocalBoostEnabled: boolean;
  setVocalBoostEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isMinimized: boolean;
  isCompressed: boolean;
  isTvMode: boolean;
  isStageFullscreen: boolean;
  isCinemaMode: boolean;
  localPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  setIsInPiP: React.Dispatch<React.SetStateAction<boolean>>;
  showTransientToast: (msg: string) => void;
  onNextEpisode?: () => void;
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
}

export function useCinemaPlatformApis({
  lang,
  videoState,
  stageWrapperRef,
  videoRef,
  ambilightEnabled,
  vocalBoostEnabled,
  setVocalBoostEnabled,
  isMinimized,
  isCompressed,
  isTvMode,
  isStageFullscreen,
  isCinemaMode,
  localPlaying,
  currentTime,
  duration,
  playbackSpeed,
  setIsInPiP,
  showTransientToast,
  onNextEpisode,
  onSyncAction,
}: UseCinemaPlatformApisParams) {
  const audioGraphRef = useRef<{
    ctx: AudioContext;
    source: MediaElementAudioSourceNode;
    speechFilter: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    makeupGain: GainNode;
  } | null>(null);

  // Real-time Ambilight Halo Sampler (desktop Cinema/TV/Fullscreen only)
  useEffect(() => {
    const stageEl = stageWrapperRef.current;
    if (!stageEl) return;

    const shouldGlow =
      ambilightEnabled &&
      !isMinimized &&
      !isCompressed &&
      (isCinemaMode || isTvMode || isStageFullscreen) &&
      localPlaying &&
      (videoState.mode === 'hls' || videoState.mode === 'direct');

    if (!shouldGlow) {
      stageEl.style.boxShadow = '';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 6;
    canvas.height = 4;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const sampleFrame = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.readyState < 2 || !stageWrapperRef.current) return;
      try {
        ctx.drawImage(video, 0, 0, 6, 4);
        const data = ctx.getImageData(0, 0, 6, 4).data;
        let rL = 0,
          gL = 0,
          bL = 0,
          nL = 0;
        let rR = 0,
          gR = 0,
          bR = 0,
          nR = 0;
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 6; x++) {
            const idx = (y * 6 + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (x < 3) {
              rL += r;
              gL += g;
              bL += b;
              nL++;
            } else {
              rR += r;
              gR += g;
              bR += b;
              nR++;
            }
          }
        }
        const boost = (v: number) => Math.min(255, Math.max(24, Math.round(v * 1.22)));
        const leftRgb = `${boost(rL / nL)}, ${boost(gL / nL)}, ${boost(bL / nL)}`;
        const rightRgb = `${boost(rR / nR)}, ${boost(gR / nR)}, ${boost(bR / nR)}`;
        const alpha = isCinemaMode ? 0.56 : 0.38;
        stageWrapperRef.current.style.boxShadow = `-24px 0 70px -12px rgba(${leftRgb}, ${alpha}), 24px 0 70px -12px rgba(${rightRgb}, ${alpha})`;
      } catch {
        // ignore if frame unavailable
      }
    };

    sampleFrame();
    const timer = setInterval(sampleFrame, 750);
    return () => {
      clearInterval(timer);
      if (stageWrapperRef.current) {
        stageWrapperRef.current.style.boxShadow = '';
      }
    };
  }, [
    ambilightEnabled,
    isMinimized,
    isCompressed,
    isTvMode,
    isStageFullscreen,
    localPlaying,
    videoState.mode,
    isCinemaMode,
  ]);

  // Web Audio Vocal Boost / Night Compressor
  const toggleVocalBoost = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !vocalBoostEnabled;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioGraphRef.current) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(video);
        const speechFilter = ctx.createBiquadFilter();
        speechFilter.type = 'peaking';
        speechFilter.frequency.value = 2400;
        speechFilter.Q.value = 1.0;
        speechFilter.gain.value = 4.5;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -28;
        compressor.knee.value = 24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.22;

        const makeupGain = ctx.createGain();
        makeupGain.gain.value = 1.45;

        audioGraphRef.current = { ctx, source, speechFilter, compressor, makeupGain };
      }

      const g = audioGraphRef.current;
      if (g.ctx.state === 'suspended') {
        g.ctx.resume().catch(() => {});
      }
      g.source.disconnect();
      g.speechFilter.disconnect();
      g.compressor.disconnect();
      g.makeupGain.disconnect();

      if (next) {
        g.source.connect(g.speechFilter);
        g.speechFilter.connect(g.compressor);
        g.compressor.connect(g.makeupGain);
        g.makeupGain.connect(g.ctx.destination);
      } else {
        g.source.connect(g.ctx.destination);
      }

      setVocalBoostEnabled(next);
      try {
        localStorage.setItem('naim_vocal_boost_v1', String(next));
      } catch {
        // ignore
      }
      showTransientToast(
        next
          ? pickLang(lang, {
              es: 'Realce de Voces y Modo Noche activado',
              ca: 'Realç de Veus i Mode Nit activat',
              en: 'Vocal Boost & Night Mode enabled',
            })
          : pickLang(lang, {
              es: 'Audio original restaurado',
              ca: 'Àudio original restaurat',
              en: 'Original audio restored',
            })
      );
    } catch {
      setVocalBoostEnabled(false);
      try {
        localStorage.setItem('naim_vocal_boost_v1', 'false');
      } catch {
        // ignore
      }
    }
  }, [vocalBoostEnabled, lang, showTransientToast]);

  // Screen Wake Lock while actively playing
  useEffect(() => {
    let wakeLock: WakeLockSentinelLike | null = null;
    const requestLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        if (localPlaying && nav.wakeLock?.request) {
          wakeLock = await nav.wakeLock.request('screen');
        }
      } catch {
        // ignore unsupported or battery-saver restrictions
      }
    };
    requestLock();

    const onVisChange = () => {
      if (document.visibilityState === 'visible' && localPlaying) {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      wakeLock?.release?.().catch(() => {});
    };
  }, [localPlaying]);

  // Picture-in-Picture event listeners
  useEffect(() => {
    const video = videoRef.current as WebKitVideoElement | null;
    if (!video) return;

    try {
      video.autoPictureInPicture = true;
    } catch {
      // ignore
    }

    const onEnterPiP = () => setIsInPiP(true);
    const onLeavePiP = () => setIsInPiP(false);
    const onWebkitModeChange = () => {
      setIsInPiP(video.webkitPresentationMode === 'picture-in-picture');
    };

    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);
    video.addEventListener('webkitpresentationmodechanged', onWebkitModeChange);

    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
      video.removeEventListener('webkitpresentationmodechanged', onWebkitModeChange);
    };
  }, []);

  // OS MediaSession metadata & hardware controls
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (videoState.mode === 'idle') {
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: videoState.title || 'RiffanTV',
        artist: videoState.subtitle || 'RiffanTV Sala Sincronizada',
        album: 'RiffanTV',
        artwork: videoState.poster
          ? [{ src: videoState.poster, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        const v = videoRef.current;
        if (v) {
          v.play().catch(() => {});
          onSyncAction('play', { isPlaying: true, currentTime: v.currentTime || 0 });
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          onSyncAction('pause', { isPlaying: false, currentTime: v.currentTime || 0 });
        }
      });
      if (!videoState.isLive) {
        navigator.mediaSession.setActionHandler('seekbackward', () => {
          const v = videoRef.current;
          if (!v) return;
          const next = Math.max(0, (v.currentTime || 0) - 10);
          v.currentTime = next;
          onSyncAction('seek', { currentTime: next, isPlaying: !v.paused });
        });
        navigator.mediaSession.setActionHandler('seekforward', () => {
          const v = videoRef.current;
          if (!v) return;
          const next = (v.currentTime || 0) + 10;
          v.currentTime = next;
          onSyncAction('seek', { currentTime: next, isPlaying: !v.paused });
        });
      }
      if (videoState.seriesMeta && onNextEpisode) {
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          onNextEpisode();
        });
      }
      try {
        const ms = navigator.mediaSession as MediaSession & {
          setActionHandler: (action: string, handler: (() => void) | null) => void;
        };
        ms.setActionHandler('enterpictureinpicture', async () => {
          const v = videoRef.current as WebKitVideoElement | null;
          if (v?.requestPictureInPicture && !document.pictureInPictureElement) {
            await v.requestPictureInPicture();
          }
        });
      } catch {
        // ignore if action unsupported in browser
      }
    } catch {
      // ignore
    }
  }, [
    videoState.mode,
    videoState.title,
    videoState.subtitle,
    videoState.poster,
    videoState.isLive,
    videoState.seriesMeta,
    onNextEpisode,
    onSyncAction,
  ]);

  // OS lock-screen MediaSession timeline position state
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }
    if (videoState.mode === 'idle' || videoState.isLive || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(duration, currentTime),
        playbackRate: playbackSpeed || 1,
        position: Math.max(0, Math.min(duration, currentTime)),
      });
    } catch {
      // ignore invalid position state
    }
  }, [currentTime, duration, playbackSpeed, videoState.mode, videoState.isLive]);

  return { toggleVocalBoost };
}
