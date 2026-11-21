import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useMusicStore } from '../../store/useMusicStore';
import { useAudio8D, type Audio8DTelemetry } from '../../hooks/useAudio8D';
import type { ResolvedTrackPlayback } from '../../types/music';
import { EQ_PRESETS, resolveEqGains } from './eqPresets';
import { hasActiveAudioFx, resolveAudioFxParams } from './audioEffects';

export { EQ_PRESETS };

let sharedAnalyserNode: AnalyserNode | null = null;
let sharedFreqArray: Uint8Array<ArrayBuffer> | null = null;
let sharedTelemetryGetter: (() => Audio8DTelemetry) | null = null;

export function getSpatial8dTelemetry(): {
  angleRad: number;
  x: number;
  y: number;
  z: number;
  occlusionCutoffHz: number;
  activeWebAudio: boolean;
} {
  const t = sharedTelemetryGetter?.();
  if (!t) {
    return {
      angleRad: 0,
      x: 0,
      y: 0,
      z: 1.8,
      occlusionCutoffHz: 20000,
      activeWebAudio: false,
    };
  }
  return {
    angleRad: t.angleRad,
    x: t.x,
    y: t.y,
    z: t.z,
    occlusionCutoffHz: t.occlusionCutoffHz,
    activeWebAudio: t.isWebAudioActive,
  };
}

export function sampleMusicSpectrum(barCount = 24): number[] {
  if (!sharedAnalyserNode || !sharedFreqArray) {
    return Array.from({ length: barCount }, () => 0.14);
  }
  sharedAnalyserNode.getByteFrequencyData(sharedFreqArray);
  const out: number[] = [];
  const usable = Math.min(sharedFreqArray.length, 48);
  const step = Math.max(1, Math.floor(usable / barCount));
  for (let i = 0; i < barCount; i++) {
    const val = sharedFreqArray[Math.min(usable - 1, i * step)] || 0;
    out.push(Math.max(0.12, Math.min(1, val / 230)));
  }
  return out;
}

export const MusicAudioEngine: React.FC<{ ytVideoMountId?: string }> = ({
  ytVideoMountId = 'riffan-music-yt-player',
}) => {
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const resolvedPlayback = useMusicStore((s) => s.resolvedPlayback);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const volume = useMusicStore((s) => s.volume);
  const isMuted = useMusicStore((s) => s.isMuted);
  const playbackRate = useMusicStore((s) => s.playbackRate);
  const viewMode = useMusicStore((s) => s.viewMode);
  const eqPreset = useMusicStore((s) => s.eqPreset);
  const customEqBands = useMusicStore((s) => s.customEqBands);
  const fxPreset = useMusicStore((s) => s.fxPreset);
  const customFxParams = useMusicStore((s) => s.customFxParams);
  const stemMode = useMusicStore((s) => s.stemMode);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const spatial8dSpeed = useMusicStore((s) => s.spatial8dSpeed);
  const spatial8dReverb = useMusicStore((s) => s.spatial8dReverb);
  const spatial8dDepth = useMusicStore((s) => s.spatial8dDepth);
  const seekRequestSec = useMusicStore((s) => s.seekRequestSec);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);

  const setSpatial8dEnabled = useMusicStore((s) => s.setSpatial8dEnabled);
  const setSpatial8dSpeed = useMusicStore((s) => s.setSpatial8dSpeed);
  const setSpatial8dReverb = useMusicStore((s) => s.setSpatial8dReverb);
  const setSpatial8dDepth = useMusicStore((s) => s.setSpatial8dDepth);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);
  const activeBackendRef = useRef<'html-audio' | 'youtube' | 'none'>('none');
  const [activeBackend, setActiveBackend] = useState<'html-audio' | 'youtube' | 'none'>('none');
  const pendingResumeSecRef = useRef<number | null>(null);
  const lastResolvedTrackIdRef = useRef<string | null>(null);

  const playNextRef = useRef(() => useMusicStore.getState().playNext());
  playNextRef.current = () => useMusicStore.getState().playNext();

  const eqGainsDb = useMemo(
    () => resolveEqGains(eqPreset, customEqBands),
    [eqPreset, customEqBands]
  );

  const activeFxParams = useMemo(
    () => resolveAudioFxParams(fxPreset, customFxParams),
    [fxPreset, customFxParams]
  );

  const isFxActive = useMemo(
    () => fxPreset !== 'none' || hasActiveAudioFx(activeFxParams),
    [fxPreset, activeFxParams]
  );

  const audio8d = useAudio8D({
    mediaElementRef: audioRef,
    isPlaying,
    isActiveBackend: activeBackend === 'html-audio',
    enabled: spatial8dEnabled,
    spatialMode: spatial8dMode,
    stemMode,
    fxParams: activeFxParams,
    speed: spatial8dSpeed,
    reverbAmount: spatial8dReverb,
    depth: spatial8dDepth,
    eqGainsDb,
    onEnabledChange: setSpatial8dEnabled,
    onSpeedChange: setSpatial8dSpeed,
    onReverbAmountChange: setSpatial8dReverb,
    onDepthChange: setSpatial8dDepth,
  });

  // Exponer analizador de espectro y telemetría DSP a la UI
  useEffect(() => {
    const analyser = audio8d.getAnalyserNode();
    sharedAnalyserNode = analyser;
    sharedFreqArray = analyser ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) : null;
    sharedTelemetryGetter = audio8d.getTelemetry;
    return () => {
      sharedAnalyserNode = null;
      sharedFreqArray = null;
      sharedTelemetryGetter = null;
    };
  }, [audio8d]);

  const ensureWebAudioChain = () => {
    void audio8d.resumeAudioContext();
  };

  // Sleep timer monitor
  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    const ms = Math.max(200, sleepTimerEndsAt - Date.now());
    const t = window.setTimeout(() => {
      useMusicStore.getState().setIsPlaying(false);
      useMusicStore.getState().setSleepTimerMinutes(null);
    }, ms);
    return () => window.clearTimeout(t);
  }, [sleepTimerEndsAt]);

  // Preload YouTube IFrame API early so first song starts immediately
  useEffect(() => {
    if (typeof window === 'undefined' || window.YT?.Player) return;
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  // Resolve track playback URLs on track change (or upgrade YouTube -> direct audio when 8D, EQ, or Stem isolation is active!)
  useEffect(() => {
    if (!currentTrack) return;

    const wantDirectAudioForDsp =
      (spatial8dEnabled || eqPreset !== 'flat' || stemMode !== 'both' || isFxActive) &&
      viewMode !== 'video';

    const isSameTrack = lastResolvedTrackIdRef.current === currentTrack.id;
    const currentResolved = isSameTrack ? useMusicStore.getState().resolvedPlayback : null;

    if (currentTrack.audiusId) {
      const streamUrl = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(currentTrack.audiusId)}/stream?app_name=RIFFAN`;
      lastResolvedTrackIdRef.current = currentTrack.id;
      useMusicStore.getState().setResolvedPlayback({
        sourceType: 'audio-mp3',
        sourceLabel: 'Audius Hi-Fi',
        streamUrl,
        proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(streamUrl)}`,
        youtubeVideoId: currentTrack.youtubeVideoId,
        youtubeMvId: currentTrack.youtubeVideoId,
        previewUrl: currentTrack.previewUrl,
        fullLength: true,
      });
      return;
    }

    if (currentTrack.youtubeVideoId && !wantDirectAudioForDsp) {
      lastResolvedTrackIdRef.current = currentTrack.id;
      useMusicStore.getState().setResolvedPlayback({
        sourceType: 'youtube',
        sourceLabel: 'YouTube Audio HD',
        youtubeVideoId: currentTrack.youtubeVideoId,
        youtubeMvId: currentTrack.youtubeVideoId,
        previewUrl: currentTrack.previewUrl,
        fullLength: true,
      });
      return;
    }

    // If currentResolved already has direct proxied audio stream for this SAME track, keep it without re-fetching!
    if (
      wantDirectAudioForDsp &&
      currentResolved &&
      (currentResolved.sourceType === 'audio-mp3' || currentResolved.sourceType === 'audio-hls') &&
      currentResolved.proxiedUrl
    ) {
      return;
    }

    // If we ALREADY resolved a fallback (e.g. YouTube) for this SAME track, don't re-fetch infinitely
    if (wantDirectAudioForDsp && currentResolved?.spatial8dYtFallback) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      wantDirectAudioForDsp ? 8500 : 4500
    );
    const store = useMusicStore.getState();
    store.setResolvingTrack(true);
    store.setPlaybackError(null);

    const qs = new URLSearchParams({
      title: currentTrack.title,
      artist: currentTrack.artist.name,
      duration: String(currentTrack.durationSec || 0),
    });
    if (currentTrack.previewUrl) qs.set('preview', currentTrack.previewUrl);
    if (currentTrack.soundcloudId) qs.set('scId', currentTrack.soundcloudId);
    if (currentTrack.youtubeVideoId) qs.set('ytId', currentTrack.youtubeVideoId);
    if (wantDirectAudioForDsp) qs.set('preferAudio', '1');

    fetch(`/api/music/play?${qs.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data?.sourceType) {
          if (wantDirectAudioForDsp && isSameTrack && activeBackendRef.current === 'youtube') {
            try {
              const ytSec = Number(
                ytPlayerRef.current?.getCurrentTime?.() ||
                  useMusicStore.getState().currentTime ||
                  0
              );
              if (Number.isFinite(ytSec) && ytSec > 1.5) {
                pendingResumeSecRef.current = ytSec;
              }
            } catch {
              // ignore
            }
          }
          lastResolvedTrackIdRef.current = currentTrack.id;
          useMusicStore.getState().setResolvedPlayback(data as ResolvedTrackPlayback);
        } else if (currentTrack.youtubeVideoId) {
          lastResolvedTrackIdRef.current = currentTrack.id;
          useMusicStore.getState().setResolvedPlayback({
            sourceType: 'youtube',
            sourceLabel: 'YouTube Audio HD',
            youtubeVideoId: currentTrack.youtubeVideoId,
            youtubeMvId: currentTrack.youtubeVideoId,
            previewUrl: currentTrack.previewUrl,
            fullLength: true,
          });
        } else if (currentTrack.previewUrl) {
          useMusicStore.getState().setResolvedPlayback({
            sourceType: 'preview',
            sourceLabel: 'Preview HD (30s)',
            proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(currentTrack.previewUrl)}`,
            previewUrl: currentTrack.previewUrl,
            fullLength: false,
          });
        } else {
          useMusicStore.getState().setResolvingTrack(false);
          useMusicStore.getState().setPlaybackError('No se pudo obtener señal de audio');
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (currentTrack.youtubeVideoId) {
          useMusicStore.getState().setResolvedPlayback({
            sourceType: 'youtube',
            sourceLabel: 'YouTube Audio HD',
            youtubeVideoId: currentTrack.youtubeVideoId,
            youtubeMvId: currentTrack.youtubeVideoId,
            previewUrl: currentTrack.previewUrl,
            fullLength: true,
          });
        } else if (currentTrack.previewUrl) {
          useMusicStore.getState().setResolvedPlayback({
            sourceType: 'preview',
            sourceLabel: 'Preview HD (30s)',
            proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(currentTrack.previewUrl)}`,
            previewUrl: currentTrack.previewUrl,
            fullLength: false,
          });
        } else {
          useMusicStore.getState().setResolvingTrack(false);
          useMusicStore.getState().setPlaybackError('Error de conexión con fuente de audio');
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [currentTrack?.id, spatial8dEnabled, eqPreset, stemMode, isFxActive, viewMode]);

  // Silently warm next track in queue so skip/auto-next starts immediately
  useEffect(() => {
    if (!currentTrack) return;
    const { queue, queueIndex } = useMusicStore.getState();
    const nextTrack = queue[queueIndex + 1];
    const needDirect = spatial8dEnabled || eqPreset !== 'flat' || stemMode !== 'both' || isFxActive;
    if (!nextTrack || nextTrack.audiusId || (nextTrack.youtubeVideoId && !needDirect)) return;
    const timer = window.setTimeout(() => {
      const qs = new URLSearchParams({
        title: nextTrack.title,
        artist: nextTrack.artist.name,
        duration: String(nextTrack.durationSec || 0),
      });
      if (nextTrack.previewUrl) qs.set('preview', nextTrack.previewUrl);
      if (nextTrack.soundcloudId) qs.set('scId', nextTrack.soundcloudId);
      if (nextTrack.youtubeVideoId) qs.set('ytId', nextTrack.youtubeVideoId);
      if (needDirect) qs.set('preferAudio', '1');
      void fetch(`/api/music/play?${qs.toString()}`).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [currentTrack?.id, spatial8dEnabled, eqPreset, stemMode, isFxActive]);

  // Attach chosen playback backend (Radio, MP3/HLS direct audio, or YouTube Audio/MV)
  useEffect(() => {
    const el = audioRef.current;

    const cleanupHlsAndHtml = () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
          // ignore
        }
        hlsRef.current = null;
      }
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    };

    const stopYt = () => {
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.stopVideo();
        } catch {
          // ignore
        }
      }
    };

    if (activeRadio) {
      stopYt();
      cleanupHlsAndHtml();
      if (!el) return;
      activeBackendRef.current = 'html-audio';
      setActiveBackend('html-audio');
      ensureWebAudioChain();
      const src = `/api/music/stream-proxy?url=${encodeURIComponent(activeRadio.streamUrl)}`;
      el.src = src;
      el.load();
      if (useMusicStore.getState().isPlaying) {
        void el.play().catch(() => {});
      }
      return;
    }

    if (!currentTrack || !resolvedPlayback) {
      stopYt();
      cleanupHlsAndHtml();
      activeBackendRef.current = 'none';
      setActiveBackend('none');
      return;
    }

    const wantYt =
      (viewMode === 'video' && Boolean(resolvedPlayback.youtubeMvId || resolvedPlayback.youtubeVideoId)) ||
      resolvedPlayback.sourceType === 'youtube' ||
      (!resolvedPlayback.proxiedUrl && !resolvedPlayback.streamUrl);

    if (wantYt && (resolvedPlayback.youtubeMvId || resolvedPlayback.youtubeVideoId)) {
      cleanupHlsAndHtml();
      const vidId = (viewMode === 'video' ? resolvedPlayback.youtubeMvId : resolvedPlayback.youtubeVideoId) ||
        resolvedPlayback.youtubeVideoId ||
        resolvedPlayback.youtubeMvId ||
        '';
      activeBackendRef.current = 'youtube';
      setActiveBackend('youtube');

      const loadIntoYt = () => {
        const container = document.getElementById(ytVideoMountId);
        if (!container || !window.YT?.Player) return;

        if (ytPlayerRef.current && ytReadyRef.current) {
          try {
            ytPlayerRef.current.loadVideoById(vidId);
            if (!useMusicStore.getState().isPlaying) {
              ytPlayerRef.current.pauseVideo();
            }
            return;
          } catch {
            // recreate cleanly below
          }
        }

        try {
          const eventsConfig = {
            onReady: (ev: any) => {
              ytReadyRef.current = true;
              const st = useMusicStore.getState();
              ev.target.setVolume?.(st.isMuted ? 0 : Math.round(st.volume * 100));
              if (st.playbackRate) {
                try {
                  ev.target.setPlaybackRate?.(st.playbackRate);
                } catch {
                  // ignore
                }
              }
              if (st.isPlaying) ev.target.playVideo();
            },
            onStateChange: (ev: any) => {
              if (ev.data === 0) {
                playNextRef.current();
              } else if (ev.data === 1) {
                if (!useMusicStore.getState().isPlaying) {
                  useMusicStore.getState().setIsPlaying(true);
                }
              }
            },
            onError: () => {
              if (resolvedPlayback.previewUrl && el) {
                activeBackendRef.current = 'html-audio';
                setActiveBackend('html-audio');
                ensureWebAudioChain();
                el.src = `/api/music/stream-proxy?url=${encodeURIComponent(resolvedPlayback.previewUrl)}`;
                el.load();
                void el.play().catch(() => {});
              } else {
                useMusicStore.getState().setPlaybackError('Vídeo restringido; prueba otro tema');
              }
            },
          } as any;

          ytPlayerRef.current = new (window.YT.Player as any)(ytVideoMountId, {
            videoId: vidId,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: useMusicStore.getState().isPlaying ? 1 : 0,
              controls: 0,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
            },
            events: eventsConfig,
          });
        } catch {
          // ignore
        }
      };

      if (window.YT?.Player) {
        loadIntoYt();
      } else {
        const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
        if (!existing) {
          const s = document.createElement('script');
          s.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(s);
        }
        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          prevReady?.();
          if (activeBackendRef.current === 'youtube') loadIntoYt();
        };
      }
      return;
    }

    // HTML5 Audio / HLS path (Full real-time WebAudio 8D Spatializer & 5-band EQ active here!)
    stopYt();
    cleanupHlsAndHtml();
    if (!el) return;
    const targetSrc = resolvedPlayback.proxiedUrl || resolvedPlayback.streamUrl || '';
    if (!targetSrc) return;

    activeBackendRef.current = 'html-audio';
    setActiveBackend('html-audio');
    ensureWebAudioChain();

    if (resolvedPlayback.sourceType === 'audio-hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;
        hls.loadSource(targetSrc);
        hls.attachMedia(el);
        let mediaRecoveryAttempted = false;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          ensureWebAudioChain();
          if (useMusicStore.getState().isPlaying) {
            void el.play().catch(() => {});
          }
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) {
            if (!mediaRecoveryAttempted && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              mediaRecoveryAttempted = true;
              hls.recoverMediaError();
              return;
            }
            hls.destroy();
            hlsRef.current = null;
            if (resolvedPlayback.youtubeVideoId) {
              useMusicStore.getState().setResolvedPlayback({
                ...resolvedPlayback,
                sourceType: 'youtube',
                sourceLabel: 'YouTube Audio HD',
              });
            }
          }
        });
      } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = targetSrc;
        el.load();
        if (useMusicStore.getState().isPlaying) void el.play().catch(() => {});
      }
    } else {
      el.src = targetSrc;
      el.load();
      if (useMusicStore.getState().isPlaying) {
        void el.play().catch(() => {});
      }
    }
  }, [
    currentTrack?.id,
    activeRadio?.id,
    resolvedPlayback?.sourceType,
    resolvedPlayback?.proxiedUrl,
    resolvedPlayback?.streamUrl,
    resolvedPlayback?.youtubeVideoId,
    viewMode,
    ytVideoMountId,
  ]);

  // Sync play/pause
  useEffect(() => {
    const el = audioRef.current;
    if (activeBackendRef.current === 'html-audio' && el) {
      if (isPlaying) {
        void audio8d.resumeAudioContext();
        void el.play().catch(() => {});
      } else {
        el.pause();
      }
    } else if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (isPlaying) ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
      } catch {
        // ignore
      }
    }
  }, [isPlaying]);

  // Sync volume + mute + rate + preservesPitch
  useEffect(() => {
    const el = audioRef.current;
    const targetRate = activeFxParams.playbackRate || playbackRate || 1;
    if (el) {
      el.volume = isMuted ? 0 : volume;
      el.playbackRate = targetRate;
      try {
        (el as HTMLMediaElement & { preservesPitch?: boolean; mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = activeFxParams.preservePitch;
        (el as HTMLMediaElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = activeFxParams.preservePitch;
        (el as HTMLMediaElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = activeFxParams.preservePitch;
      } catch {
        // ignore
      }
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(isMuted ? 0 : Math.round(volume * 100));
        ytPlayerRef.current.setPlaybackRate(targetRate);
      } catch {
        // ignore
      }
    }
  }, [volume, isMuted, playbackRate, activeFxParams.playbackRate, activeFxParams.preservePitch]);

  // Handle explicit seeks
  useEffect(() => {
    if (seekRequestSec === null) return;
    if (activeBackendRef.current === 'html-audio' && audioRef.current) {
      try {
        audioRef.current.currentTime = seekRequestSec;
      } catch {
        // ignore
      }
    } else if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(seekRequestSec, true);
      } catch {
        // ignore
      }
    }
    useMusicStore.getState().setProgress(seekRequestSec);
    useMusicStore.getState().clearSeekRequest();
  }, [seekRequestSec]);

  // Poll YouTube progress smoothly while active
  useEffect(() => {
    if (!isPlaying || activeRadio) return;
    const id = window.setInterval(() => {
      if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
        try {
          const cur = Number(ytPlayerRef.current.getCurrentTime?.() || 0);
          const dur = Number(ytPlayerRef.current.getDuration?.() || currentTrack?.durationSec || 0);
          if (Number.isFinite(cur)) {
            useMusicStore.getState().setProgress(cur, dur);
          }
        } catch {
          // ignore
        }
      }
    }, 350);
    return () => window.clearInterval(id);
  }, [isPlaying, activeRadio, currentTrack?.durationSec]);

  // Update Lock-Screen / System MediaSession controls
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      if (activeRadio) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: activeRadio.name,
          artist: 'Radio en Directo · Riffan Music',
          album: activeRadio.tags.join(' · '),
          artwork: activeRadio.favicon ? [{ src: activeRadio.favicon, sizes: '512x512' }] : [],
        });
      } else if (currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist.name,
          album: currentTrack.album.title || 'Riffan Music',
          artwork: currentTrack.album.coverXl || currentTrack.album.cover
            ? [{ src: currentTrack.album.coverXl || currentTrack.album.cover, sizes: '512x512' }]
            : [],
        });
      }
      navigator.mediaSession.setActionHandler('play', () => useMusicStore.getState().setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => useMusicStore.getState().setIsPlaying(false));
      navigator.mediaSession.setActionHandler('nexttrack', () => useMusicStore.getState().playNext());
      navigator.mediaSession.setActionHandler('previoustrack', () => useMusicStore.getState().playPrev());
    } catch {
      // ignore unsupported MediaSession actions
    }
  }, [currentTrack, activeRadio]);

  return (
    <audio
      ref={audioRef}
      crossOrigin="anonymous"
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        try {
          el.playbackRate = activeFxParams.playbackRate || 1;
          (el as HTMLMediaElement & { preservesPitch?: boolean; mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = activeFxParams.preservePitch;
          (el as HTMLMediaElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = activeFxParams.preservePitch;
          (el as HTMLMediaElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = activeFxParams.preservePitch;
        } catch {
          // ignore
        }
        const resumeAt = pendingResumeSecRef.current;
        if (resumeAt !== null && resumeAt > 1) {
          pendingResumeSecRef.current = null;
          try {
            if (Number.isFinite(el.duration) && resumeAt < el.duration - 2) {
              el.currentTime = resumeAt;
            }
          } catch {
            // ignore
          }
        }
      }}
      onTimeUpdate={(e) => {
        if (activeBackendRef.current !== 'html-audio' || activeRadio) return;
        const a = e.currentTarget;
        useMusicStore
          .getState()
          .setProgress(a.currentTime, Number.isFinite(a.duration) && a.duration > 0 ? a.duration : undefined);
      }}
      onEnded={() => {
        if (activeBackendRef.current === 'html-audio' && !activeRadio) {
          playNextRef.current();
        }
      }}
      onError={() => {
        if (activeBackendRef.current !== 'html-audio' || activeRadio) return;
        const st = useMusicStore.getState();
        if (st.resolvedPlayback?.youtubeVideoId && st.resolvedPlayback.sourceType !== 'youtube') {
          st.setResolvedPlayback({
            ...st.resolvedPlayback,
            sourceType: 'youtube',
            sourceLabel: 'YouTube Audio HD',
          });
        } else if (
          st.currentTrack?.previewUrl &&
          st.resolvedPlayback?.sourceType !== 'preview'
        ) {
          st.setResolvedPlayback({
            sourceType: 'preview',
            sourceLabel: 'Preview HD (30s)',
            proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(st.currentTrack.previewUrl)}`,
            previewUrl: st.currentTrack.previewUrl,
            fullLength: false,
          });
        }
      }}
      className="hidden"
    />
  );
};
