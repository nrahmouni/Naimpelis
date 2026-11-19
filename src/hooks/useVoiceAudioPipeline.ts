import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { VoicePeerState } from '../shared/protocol';

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export interface PeerConnectionEntry {
  pc: RTCPeerConnection;
  isInitiator: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  audioEl: HTMLAudioElement;
  pooledAudio: boolean;
  joinedAt: number;
  remoteStream: MediaStream | null;
  fallbackGain: GainNode | null;
  iceDisconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface AudioMeterEntry {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
  fallbackGain: GainNode | null;
}

export function createHiddenAudioElement(): HTMLAudioElement {
  const el = document.createElement('audio');
  el.autoplay = true;
  el.muted = false;
  el.volume = 1;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.style.position = 'fixed';
  el.style.bottom = '0';
  el.style.left = '0';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.opacity = '0.001';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '-1';
  document.body.appendChild(el);
  return el;
}

export function useVoiceAudioPipeline(params: {
  isJoined: boolean;
  currentUserIdRef: React.MutableRefObject<string>;
  isMutedRef: React.MutableRefObject<boolean>;
  peerEntriesRef: React.MutableRefObject<Map<string, PeerConnectionEntry>>;
  voicePeersRef: React.MutableRefObject<VoicePeerState[]>;
}) {
  const { isJoined, currentUserIdRef, isMutedRef, peerEntriesRef, voicePeersRef } = params;

  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  const [localAudioLevel, setLocalAudioLevel] = useState<number>(0);
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});

  const unlockedAudioPoolRef = useRef<HTMLAudioElement[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const metersRef = useRef<Map<string, AudioMeterEntry>>(new Map());
  const lastSpokenAtRef = useRef<Map<string, number>>(new Map());
  const meterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  const primeAudioPoolOnGesture = useCallback(() => {
    if (typeof document === 'undefined') return;
    while (unlockedAudioPoolRef.current.length < 4) {
      const el = createHiddenAudioElement();
      unlockedAudioPoolRef.current.push(el);
    }
    for (const el of unlockedAudioPoolRef.current) {
      if (el.srcObject) continue;
      try {
        el.src = SILENT_WAV_DATA_URI;
        el.muted = false;
        el.volume = 1;
        const p = el.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (!el.srcObject) {
              el.pause();
              el.removeAttribute('src');
              el.load();
            }
          }).catch(() => {});
        }
      } catch {
        // ignore priming error
      }
    }
  }, []);

  const detachFallbackGain = useCallback((entry: PeerConnectionEntry, meter?: AudioMeterEntry) => {
    const gain = entry.fallbackGain || meter?.fallbackGain;
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // ignore
      }
      entry.fallbackGain = null;
      if (meter) meter.fallbackGain = null;
    }
  }, []);

  const tryPlayRemoteAudio = useCallback(
    async (peerUserId: string) => {
      const entry = peerEntriesRef.current.get(peerUserId);
      if (!entry || !entry.remoteStream) return;

      const el = entry.audioEl;
      if (el.srcObject !== entry.remoteStream) {
        el.srcObject = entry.remoteStream;
      }
      el.muted = false;
      el.volume = 1;

      try {
        await el.play();
        const meter = metersRef.current.get(peerUserId);
        detachFallbackGain(entry, meter);
        setAudioPlaybackBlocked(false);
      } catch {
        const ctx = ensureAudioContext();
        const meter = metersRef.current.get(peerUserId);
        if (ctx && ctx.state === 'running' && meter && !entry.fallbackGain) {
          try {
            const gain = ctx.createGain();
            gain.gain.value = 1;
            meter.source.connect(gain);
            gain.connect(ctx.destination);
            entry.fallbackGain = gain;
            meter.fallbackGain = gain;
            setAudioPlaybackBlocked(false);
            return;
          } catch {
            // ignore fallback failure
          }
        }
        setAudioPlaybackBlocked(true);
      }
    },
    [detachFallbackGain, ensureAudioContext, peerEntriesRef]
  );

  const resumeRemoteAudio = useCallback(() => {
    ensureAudioContext();
    peerEntriesRef.current.forEach((_, peerId) => {
      void tryPlayRemoteAudio(peerId);
    });
  }, [ensureAudioContext, peerEntriesRef, tryPlayRemoteAudio]);

  const attachMeter = useCallback(
    (userId: string, stream: MediaStream, routeToDestinationFallback = false) => {
      if (metersRef.current.has(userId)) {
        const prev = metersRef.current.get(userId);
        try {
          prev?.fallbackGain?.disconnect();
          prev?.source.disconnect();
        } catch {
          // ignore
        }
        metersRef.current.delete(userId);
      }
      const ctx = ensureAudioContext();
      if (!ctx || stream.getAudioTracks().length === 0) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);
        let fallbackGain: GainNode | null = null;
        if (routeToDestinationFallback && ctx.state === 'running') {
          fallbackGain = ctx.createGain();
          fallbackGain.gain.value = 1;
          source.connect(fallbackGain);
          fallbackGain.connect(ctx.destination);
        }
        const buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        metersRef.current.set(userId, { source, analyser, buffer, fallbackGain });
      } catch {
        // ignore Web Audio failure on restricted browsers
      }
    },
    [ensureAudioContext]
  );

  const detachMeter = useCallback((userId: string) => {
    const entry = metersRef.current.get(userId);
    if (entry) {
      try {
        entry.fallbackGain?.disconnect();
        entry.source.disconnect();
      } catch {
        // ignore
      }
      metersRef.current.delete(userId);
    }
    lastSpokenAtRef.current.delete(userId);
  }, []);

  useEffect(() => {
    if (!audioPlaybackBlocked || !isJoined || typeof window === 'undefined') return;
    const handleGesture = () => {
      resumeRemoteAudio();
    };
    window.addEventListener('pointerdown', handleGesture, { capture: true });
    window.addEventListener('keydown', handleGesture, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handleGesture, { capture: true });
      window.removeEventListener('keydown', handleGesture, { capture: true });
    };
  }, [audioPlaybackBlocked, isJoined, resumeRemoteAudio]);

  useEffect(() => {
    if (!isJoined) {
      if (meterIntervalRef.current) {
        clearInterval(meterIntervalRef.current);
        meterIntervalRef.current = null;
      }
      return;
    }

    meterIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const activeSpeakers: string[] = [];
      const nextLevels: Record<string, number> = {};
      const mutedIds = new Set(
        voicePeersRef.current.filter((p) => p.isMuted).map((p) => p.userId)
      );

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      metersRef.current.forEach((meter, uid) => {
        if (uid === currentUserIdRef.current && isMutedRef.current) {
          nextLevels[uid] = 0;
          return;
        }
        if (uid !== currentUserIdRef.current && mutedIds.has(uid)) {
          nextLevels[uid] = 0;
          return;
        }

        meter.analyser.getByteTimeDomainData(meter.buffer);
        let sumSq = 0;
        for (let i = 0; i < meter.buffer.length; i += 1) {
          const norm = (meter.buffer[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / meter.buffer.length);
        const level = rms > 0.008 ? Math.min(1, Number(((rms - 0.006) * 14).toFixed(2))) : 0;
        nextLevels[uid] = level;

        if (rms > 0.012) {
          lastSpokenAtRef.current.set(uid, now);
        }
      });

      lastSpokenAtRef.current.forEach((ts, uid) => {
        if (uid === currentUserIdRef.current && isMutedRef.current) return;
        if (uid !== currentUserIdRef.current && mutedIds.has(uid)) return;
        if (now - ts < 360) {
          activeSpeakers.push(uid);
        }
      });

      const selfLevel = isMutedRef.current ? 0 : nextLevels[currentUserIdRef.current] ?? 0;
      setLocalAudioLevel(selfLevel);
      setAudioLevels(nextLevels);

      setSpeakingUserIds((prev) => {
        if (
          prev.length === activeSpeakers.length &&
          prev.every((id, idx) => id === activeSpeakers[idx])
        ) {
          return prev;
        }
        return activeSpeakers;
      });
    }, 65);

    return () => {
      if (meterIntervalRef.current) {
        clearInterval(meterIntervalRef.current);
        meterIntervalRef.current = null;
      }
    };
  }, [currentUserIdRef, isJoined, isMutedRef, voicePeersRef]);

  useEffect(() => {
    return () => {
      for (const el of unlockedAudioPoolRef.current) {
        try {
          el.pause();
          el.srcObject = null;
          el.remove();
        } catch {
          // ignore
        }
      }
      unlockedAudioPoolRef.current = [];
    };
  }, []);

  return {
    audioPlaybackBlocked,
    setAudioPlaybackBlocked,
    speakingUserIds,
    setSpeakingUserIds,
    localAudioLevel,
    setLocalAudioLevel,
    audioLevels,
    setAudioLevels,
    unlockedAudioPoolRef,
    metersRef,
    lastSpokenAtRef,
    ensureAudioContext,
    primeAudioPoolOnGesture,
    detachFallbackGain,
    tryPlayRemoteAudio,
    resumeRemoteAudio,
    attachMeter,
    detachMeter,
  };
}
