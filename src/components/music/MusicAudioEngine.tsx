import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useMusicStore } from '../../store/useMusicStore';
import type { EqPresetId, ResolvedTrackPlayback } from '../../types/music';

const EQ_BANDS_HZ = [60, 230, 910, 4000, 14000] as const;

export const EQ_PRESETS: Record<EqPresetId, { label: string; gains: number[] }> = {
  flat: { label: 'Plano', gains: [0, 0, 0, 0, 0] },
  bass: { label: 'Sub Bass', gains: [6, 4.5, 0.5, 1, 2] },
  vocal: { label: 'Voz Clara', gains: [-2, -1, 4.5, 3.5, 1] },
  club: { label: 'Club / Electrónica', gains: [5, 2.5, -1.5, 3, 5] },
  acoustic: { label: 'Acústico', gains: [2.5, 1.5, 2, 3, 2] },
};

let sharedAnalyserNode: AnalyserNode | null = null;
let sharedFreqArray: Uint8Array<ArrayBuffer> | null = null;

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
  const seekRequestSec = useMusicStore((s) => s.seekRequestSec);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const mediaSourceConnectedRef = useRef<boolean>(false);
  const activeBackendRef = useRef<'html-audio' | 'youtube' | 'none'>('none');

  const playNextRef = useRef(() => useMusicStore.getState().playNext());
  playNextRef.current = () => useMusicStore.getState().playNext();

  const ensureWebAudioChain = () => {
    const el = audioRef.current;
    if (!el || mediaSourceConnectedRef.current || typeof window === 'undefined') return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = audioCtxRef.current || new AC();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const src = ctx.createMediaElementSource(el);
      const filters = EQ_BANDS_HZ.map((freq, idx) => {
        const biquad = ctx.createBiquadFilter();
        biquad.type = idx === 0 ? 'lowshelf' : idx === EQ_BANDS_HZ.length - 1 ? 'highshelf' : 'peaking';
        biquad.frequency.value = freq;
        biquad.Q.value = 1.1;
        biquad.gain.value = EQ_PRESETS[useMusicStore.getState().eqPreset]?.gains[idx] || 0;
        return biquad;
      });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;

      let prev: AudioNode = src;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(analyser);
      analyser.connect(ctx.destination);

      filtersRef.current = filters;
      sharedAnalyserNode = analyser;
      sharedFreqArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      mediaSourceConnectedRef.current = true;
    } catch {
      // Fall back silently to direct HTML5 audio output
    }
  };

  // Sync EQ gains whenever preset changes
  useEffect(() => {
    const gains = EQ_PRESETS[eqPreset]?.gains || [0, 0, 0, 0, 0];
    filtersRef.current.forEach((filter, idx) => {
      try {
        filter.gain.setTargetAtTime(gains[idx] ?? 0, audioCtxRef.current?.currentTime || 0, 0.05);
      } catch {
        // ignore
      }
    });
  }, [eqPreset]);

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

  // Resolve track playback URLs on track change
  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
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
    if (currentTrack.audiusId) qs.set('audiusId', currentTrack.audiusId);
    if (currentTrack.youtubeVideoId) qs.set('ytId', currentTrack.youtubeVideoId);

    fetch(`/api/music/play?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data?.sourceType) {
          useMusicStore.getState().setResolvedPlayback(data as ResolvedTrackPlayback);
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
        if (currentTrack.previewUrl) {
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
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

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

    // HTML5 Audio / HLS path
    stopYt();
    cleanupHlsAndHtml();
    if (!el) return;
    const targetSrc = resolvedPlayback.proxiedUrl || resolvedPlayback.streamUrl || '';
    if (!targetSrc) return;

    activeBackendRef.current = 'html-audio';
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
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (useMusicStore.getState().isPlaying) {
            void el.play().catch(() => {});
          }
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) {
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
  }, [currentTrack?.id, activeRadio?.id, resolvedPlayback?.sourceType, resolvedPlayback?.streamUrl, viewMode, ytVideoMountId]);

  // Sync play/pause
  useEffect(() => {
    const el = audioRef.current;
    if (activeBackendRef.current === 'html-audio' && el) {
      if (audioCtxRef.current?.state === 'suspended' && isPlaying) {
        void audioCtxRef.current.resume().catch(() => {});
      }
      if (isPlaying) void el.play().catch(() => {});
      else el.pause();
    } else if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (isPlaying) ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
      } catch {
        // ignore
      }
    }
  }, [isPlaying]);

  // Sync volume + mute + rate
  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = isMuted ? 0 : volume;
      el.playbackRate = playbackRate;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(isMuted ? 0 : Math.round(volume * 100));
        ytPlayerRef.current.setPlaybackRate(playbackRate);
      } catch {
        // ignore
      }
    }
  }, [volume, isMuted, playbackRate]);

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
