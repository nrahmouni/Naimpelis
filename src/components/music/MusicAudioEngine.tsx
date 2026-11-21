import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useMusicStore } from '../../store/useMusicStore';
import type { EqPresetId, ResolvedTrackPlayback, Spatial8dMode } from '../../types/music';

const EQ_BANDS_HZ = [60, 230, 910, 4000, 14000] as const;

export const EQ_PRESETS: Record<EqPresetId, { label: string; gains: number[] }> = {
  flat: { label: 'Plano', gains: [0, 0, 0, 0, 0] },
  bass: { label: 'Sub Bass', gains: [6, 4.5, 0.5, 1, 2] },
  vocal: { label: 'Voz Clara', gains: [-2, -1, 4.5, 3.5, 1] },
  club: { label: 'Club / Electrónica', gains: [5, 2.5, -1.5, 3, 5] },
  acoustic: { label: 'Acústico', gains: [2.5, 1.5, 2, 3, 2] },
};

const SPATIAL_PROFILES: Record<
  Spatial8dMode,
  { periodSec: number; radius: number; stereoDepth: number; reverbMix: number; centerMix: number; warmthDb: number }
> = {
  orbit: { periodSec: 9.5, radius: 1.75, stereoDepth: 0.42, reverbMix: 0.24, centerMix: 0.2, warmthDb: 2.2 },
  concert: { periodSec: 11.5, radius: 2.05, stereoDepth: 0.48, reverbMix: 0.36, centerMix: 0.18, warmthDb: 2.8 },
  club: { periodSec: 5.2, radius: 1.9, stereoDepth: 0.55, reverbMix: 0.2, centerMix: 0.16, warmthDb: 3.2 },
};

let sharedAnalyserNode: AnalyserNode | null = null;
let sharedFreqArray: Uint8Array<ArrayBuffer> | null = null;
let sharedSpatialAngleRad = 0;
let sharedSpatialEngineActive = false;

export function getSpatial8dTelemetry() {
  return {
    angleRad: sharedSpatialAngleRad,
    activeWebAudio: sharedSpatialEngineActive,
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

function createStudioHallImpulse(ctx: AudioContext, durationSec = 1.45, decay = 2.6): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const earlyTaps = [0.016, 0.031, 0.053];

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const noise = Math.random() * 2 - 1;
      lp = lp * 0.52 + noise * 0.48;
      data[i] = lp * Math.pow(1 - t, decay) * 0.65;
    }
    earlyTaps.forEach((tapSec, idx) => {
      const tapIdx = Math.floor((tapSec + ch * 0.004) * sampleRate);
      if (tapIdx < length) {
        data[tapIdx] += 0.28 / (idx + 1);
      }
    });
  }
  return buffer;
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
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
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
  const pendingResumeSecRef = useRef<number | null>(null);

  // Web Audio 8D Spatializer node refs
  const dryBypassGainRef = useRef<GainNode | null>(null);
  const spatialMasterGainRef = useRef<GainNode | null>(null);
  const spatialWarmthRef = useRef<BiquadFilterNode | null>(null);
  const panner3dRef = useRef<PannerNode | null>(null);
  const stereoPannerRef = useRef<StereoPannerNode | null>(null);
  const centerAnchorGainRef = useRef<GainNode | null>(null);
  const reverbWetGainRef = useRef<GainNode | null>(null);

  const playNextRef = useRef(() => useMusicStore.getState().playNext());
  playNextRef.current = () => useMusicStore.getState().playNext();

  const ensureWebAudioChain = () => {
    const el = audioRef.current;
    if (!el || typeof window === 'undefined') return;
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
      if (mediaSourceConnectedRef.current) return;

      const src = ctx.createMediaElementSource(el);
      const filters = EQ_BANDS_HZ.map((freq, idx) => {
        const biquad = ctx.createBiquadFilter();
        biquad.type = idx === 0 ? 'lowshelf' : idx === EQ_BANDS_HZ.length - 1 ? 'highshelf' : 'peaking';
        biquad.frequency.value = freq;
        biquad.Q.value = 1.1;
        biquad.gain.value = EQ_PRESETS[useMusicStore.getState().eqPreset]?.gains[idx] || 0;
        return biquad;
      });

      const eqOut = ctx.createGain();
      eqOut.gain.value = 1;

      let prev: AudioNode = src;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(eqOut);

      // Dry bypass branch
      const st = useMusicStore.getState();
      const use8d = st.spatial8dEnabled;
      const prof = SPATIAL_PROFILES[st.spatial8dMode] || SPATIAL_PROFILES.orbit;

      const dryBypassGain = ctx.createGain();
      dryBypassGain.gain.value = use8d ? 0 : 1;

      // 8D Binaural Spatializer branch
      const spatialMasterGain = ctx.createGain();
      spatialMasterGain.gain.value = use8d ? 1.04 : 0;

      const spatialWarmth = ctx.createBiquadFilter();
      spatialWarmth.type = 'lowshelf';
      spatialWarmth.frequency.value = 115;
      spatialWarmth.gain.value = prof.warmthDb;

      const centerAnchorGain = ctx.createGain();
      centerAnchorGain.gain.value = prof.centerMix;

      const panner3d = ctx.createPanner();
      panner3d.panningModel = 'HRTF';
      panner3d.distanceModel = 'inverse';
      panner3d.refDistance = 2.2;
      panner3d.maxDistance = 100;
      panner3d.rolloffFactor = 0.32;
      panner3d.coneInnerAngle = 360;
      panner3d.coneOuterAngle = 360;
      panner3d.coneOuterGain = 1;

      const stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.value = 0;

      const spatialDirectGain = ctx.createGain();
      spatialDirectGain.gain.value = 0.92;

      const convolver = ctx.createConvolver();
      convolver.buffer = createStudioHallImpulse(ctx);

      const reverbDamp = ctx.createBiquadFilter();
      reverbDamp.type = 'lowpass';
      reverbDamp.frequency.value = 5600;

      const reverbWetGain = ctx.createGain();
      reverbWetGain.gain.value = prof.reverbMix;

      eqOut.connect(dryBypassGain);
      eqOut.connect(spatialWarmth);

      // Centered vocal body anchor
      spatialWarmth.connect(centerAnchorGain);
      centerAnchorGain.connect(spatialMasterGain);

      // 360° HRTF orbit + stereo smoothness + hall reverb
      spatialWarmth.connect(panner3d);
      panner3d.connect(stereoPanner);
      stereoPanner.connect(spatialDirectGain);
      spatialDirectGain.connect(spatialMasterGain);

      stereoPanner.connect(convolver);
      convolver.connect(reverbDamp);
      reverbDamp.connect(reverbWetGain);
      reverbWetGain.connect(spatialMasterGain);

      // Analyser + Protective Studio Compressor -> Output
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -11;
      limiter.knee.value = 16;
      limiter.ratio.value = 3;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.18;

      dryBypassGain.connect(analyser);
      spatialMasterGain.connect(analyser);
      analyser.connect(limiter);
      limiter.connect(ctx.destination);

      filtersRef.current = filters;
      dryBypassGainRef.current = dryBypassGain;
      spatialMasterGainRef.current = spatialMasterGain;
      spatialWarmthRef.current = spatialWarmth;
      panner3dRef.current = panner3d;
      stereoPannerRef.current = stereoPanner;
      centerAnchorGainRef.current = centerAnchorGain;
      reverbWetGainRef.current = reverbWetGain;

      sharedAnalyserNode = analyser;
      sharedFreqArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      mediaSourceConnectedRef.current = true;
    } catch {
      // Fall back silently to direct HTML5 audio output
    }
  };

  // Smoothly crossfade 8D spatializer nodes whenever enabled/mode updates
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !mediaSourceConnectedRef.current) return;
    if (spatial8dEnabled && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const prof = SPATIAL_PROFILES[spatial8dMode] || SPATIAL_PROFILES.orbit;
    try {
      dryBypassGainRef.current?.gain.setTargetAtTime(spatial8dEnabled ? 0 : 1, now, 0.08);
      spatialMasterGainRef.current?.gain.setTargetAtTime(spatial8dEnabled ? 1.04 : 0, now, 0.08);
      spatialWarmthRef.current?.gain.setTargetAtTime(prof.warmthDb, now, 0.08);
      centerAnchorGainRef.current?.gain.setTargetAtTime(prof.centerMix, now, 0.08);
      reverbWetGainRef.current?.gain.setTargetAtTime(prof.reverbMix, now, 0.08);
    } catch {
      // ignore
    }
  }, [spatial8dEnabled, spatial8dMode]);

  // Continuous 60fps 360° Binaural Orbit Animator
  useEffect(() => {
    const panner = panner3dRef.current;
    const stereo = stereoPannerRef.current;
    const ctx = audioCtxRef.current;

    if (!spatial8dEnabled) {
      sharedSpatialEngineActive = false;
      if (ctx && panner && stereo) {
        const now = ctx.currentTime;
        try {
          panner.positionX.setTargetAtTime(0, now, 0.06);
          panner.positionY.setTargetAtTime(0, now, 0.06);
          panner.positionZ.setTargetAtTime(-1, now, 0.06);
          stereo.pan.setTargetAtTime(0, now, 0.06);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (!isPlaying) {
      sharedSpatialEngineActive = activeBackendRef.current === 'html-audio';
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    const tick = (ts: number) => {
      const dtSec = Math.min(0.1, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      const prof = SPATIAL_PROFILES[useMusicStore.getState().spatial8dMode] || SPATIAL_PROFILES.orbit;
      const isHtmlAudio = activeBackendRef.current === 'html-audio';
      sharedSpatialEngineActive = isHtmlAudio;

      if (useMusicStore.getState().isPlaying) {
        const omega = (Math.PI * 2) / prof.periodSec;
        sharedSpatialAngleRad = (sharedSpatialAngleRad + omega * dtSec) % (Math.PI * 2);

        const cCtx = audioCtxRef.current;
        const p3 = panner3dRef.current;
        const sp = stereoPannerRef.current;
        if (cCtx && p3 && sp && isHtmlAudio) {
          const now = cCtx.currentTime;
          const x = prof.radius * Math.sin(sharedSpatialAngleRad);
          const z = -prof.radius * Math.cos(sharedSpatialAngleRad);
          const y = 0.24 * Math.sin(sharedSpatialAngleRad * 2);
          try {
            p3.positionX.setTargetAtTime(x, now, 0.028);
            p3.positionY.setTargetAtTime(y, now, 0.028);
            p3.positionZ.setTargetAtTime(z, now, 0.028);
            sp.pan.setTargetAtTime(Math.sin(sharedSpatialAngleRad) * prof.stereoDepth, now, 0.028);
          } catch {
            // ignore
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      sharedSpatialEngineActive = false;
    };
  }, [spatial8dEnabled, spatial8dMode, isPlaying, activeRadio?.id, currentTrack?.id, resolvedPlayback?.sourceType]);

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

  // Resolve track playback URLs on track change (or upgrade YouTube -> direct audio when 8D is active!)
  useEffect(() => {
    if (!currentTrack) return;

    const wantDirectAudioFor8d = spatial8dEnabled && viewMode !== 'video';

    // Mid-song 8D activation on a YouTube track: preserve playback second!
    const currentResolved = useMusicStore.getState().resolvedPlayback;
    if (
      wantDirectAudioFor8d &&
      currentResolved &&
      currentResolved.sourceType === 'youtube' &&
      !currentResolved.proxiedUrl &&
      !currentResolved.spatial8dYtFallback
    ) {
      const curTime = useMusicStore.getState().currentTime;
      if (curTime > 1.5) {
        pendingResumeSecRef.current = curTime;
      }
    }

    if (currentTrack.audiusId) {
      const streamUrl = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(currentTrack.audiusId)}/stream?app_name=RIFFAN`;
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

    if (currentTrack.youtubeVideoId && !wantDirectAudioFor8d) {
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

    // If currentResolved already has direct proxied audio stream for this track, keep it without re-fetching!
    if (
      wantDirectAudioFor8d &&
      currentResolved &&
      (currentResolved.sourceType === 'audio-mp3' || currentResolved.sourceType === 'audio-hls') &&
      currentResolved.proxiedUrl
    ) {
      return;
    }

    // If we ALREADY resolved a fallback (e.g. YouTube 8D Audio) for this track, don't re-fetch
    if (wantDirectAudioFor8d && currentResolved?.spatial8dYtFallback) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), wantDirectAudioFor8d ? 5500 : 4500);
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
    if (wantDirectAudioFor8d) qs.set('preferAudio', '1');

    fetch(`/api/music/play?${qs.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data?.sourceType) {
          useMusicStore.getState().setResolvedPlayback(data as ResolvedTrackPlayback);
        } else if (currentTrack.youtubeVideoId) {
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
  }, [currentTrack?.id, spatial8dEnabled, viewMode]);

  // Silently warm next track in queue so skip/auto-next starts immediately
  useEffect(() => {
    if (!currentTrack) return;
    const { queue, queueIndex } = useMusicStore.getState();
    const nextTrack = queue[queueIndex + 1];
    if (!nextTrack || nextTrack.audiusId || (nextTrack.youtubeVideoId && !spatial8dEnabled)) return;
    const timer = window.setTimeout(() => {
      const qs = new URLSearchParams({
        title: nextTrack.title,
        artist: nextTrack.artist.name,
        duration: String(nextTrack.durationSec || 0),
      });
      if (nextTrack.previewUrl) qs.set('preview', nextTrack.previewUrl);
      if (nextTrack.soundcloudId) qs.set('scId', nextTrack.soundcloudId);
      if (nextTrack.youtubeVideoId) qs.set('ytId', nextTrack.youtubeVideoId);
      if (spatial8dEnabled) qs.set('preferAudio', '1');
      void fetch(`/api/music/play?${qs.toString()}`).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [currentTrack?.id, spatial8dEnabled]);

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
      sharedSpatialEngineActive = Boolean(useMusicStore.getState().spatial8dEnabled);
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
      sharedSpatialEngineActive = false;
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
      sharedSpatialEngineActive = false;

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
                sharedSpatialEngineActive = Boolean(useMusicStore.getState().spatial8dEnabled);
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
    sharedSpatialEngineActive = Boolean(useMusicStore.getState().spatial8dEnabled);
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
          const resumeAt = pendingResumeSecRef.current;
          if (resumeAt !== null && resumeAt > 1) {
            pendingResumeSecRef.current = null;
            try {
              el.currentTime = resumeAt;
            } catch {
              // ignore
            }
          }
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
  }, [currentTrack?.id, activeRadio?.id, resolvedPlayback?.sourceType, resolvedPlayback?.streamUrl, resolvedPlayback?.youtubeVideoId, viewMode, ytVideoMountId]);

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
      onLoadedMetadata={(e) => {
        const resumeAt = pendingResumeSecRef.current;
        if (resumeAt !== null && resumeAt > 1) {
          pendingResumeSecRef.current = null;
          try {
            if (Number.isFinite(e.currentTarget.duration) && resumeAt < e.currentTarget.duration - 2) {
              e.currentTarget.currentTime = resumeAt;
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
