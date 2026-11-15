import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService, type SocketEvent } from '../services/socket';
import type { VoicePeerState } from '../shared/protocol';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';

export type VoiceCallStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'insecure'
  | 'error';

export interface GameVoiceChatState {
  status: VoiceCallStatus;
  isJoined: boolean;
  isMuted: boolean;
  errorMessage: string | null;
  voicePeers: VoicePeerState[];
  speakingUserIds: string[];
  joinVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerConnectionEntry {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  audioEl: HTMLAudioElement;
}

interface AudioMeterEntry {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
}

export function useGameVoiceChat(params: {
  roomId: string;
  currentUserId: string;
  lang: AppLanguage;
  enabled?: boolean;
}): GameVoiceChatState {
  const { roomId, currentUserId, lang, enabled = true } = params;

  const [status, setStatus] = useState<VoiceCallStatus>('idle');
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voicePeers, setVoicePeers] = useState<VoicePeerState[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);

  const isJoinedRef = useRef(false);
  const isMutedRef = useRef(false);
  const currentUserIdRef = useRef(currentUserId);
  const roomIdRef = useRef(roomId);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerEntriesRef = useRef<Map<string, PeerConnectionEntry>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const metersRef = useRef<Map<string, AudioMeterEntry>>(new Map());
  const lastSpokenAtRef = useRef<Map<string, number>>(new Map());
  const meterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voicePeersRef = useRef<VoicePeerState[]>([]);

  currentUserIdRef.current = currentUserId;
  roomIdRef.current = roomId;
  isJoinedRef.current = isJoined;
  isMutedRef.current = isMuted;
  voicePeersRef.current = voicePeers;

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

  const attachMeter = useCallback(
    (userId: string, stream: MediaStream) => {
      if (metersRef.current.has(userId)) {
        const prev = metersRef.current.get(userId);
        try {
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
        analyser.smoothingTimeConstant = 0.65;
        source.connect(analyser);
        const buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        metersRef.current.set(userId, { source, analyser, buffer });
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
        entry.source.disconnect();
      } catch {
        // ignore
      }
      metersRef.current.delete(userId);
    }
    lastSpokenAtRef.current.delete(userId);
  }, []);

  const closePeerEntry = useCallback(
    (peerUserId: string) => {
      const entry = peerEntriesRef.current.get(peerUserId);
      if (!entry) return;
      peerEntriesRef.current.delete(peerUserId);
      detachMeter(peerUserId);
      try {
        entry.pc.onicecandidate = null;
        entry.pc.ontrack = null;
        entry.pc.onnegotiationneeded = null;
        entry.pc.onconnectionstatechange = null;
        entry.pc.close();
      } catch {
        // ignore
      }
      try {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        entry.audioEl.remove();
      } catch {
        // ignore
      }
    },
    [detachMeter]
  );

  const teardownAllConnections = useCallback(() => {
    for (const peerId of Array.from(peerEntriesRef.current.keys())) {
      closePeerEntry(peerId);
    }
    detachMeter(currentUserIdRef.current);
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      localStreamRef.current = null;
    }
    setSpeakingUserIds([]);
  }, [closePeerEntry, detachMeter]);

  const leaveVoice = useCallback(() => {
    const wasJoined = isJoinedRef.current;
    isJoinedRef.current = false;
    setIsJoined(false);
    setIsMuted(false);
    isMutedRef.current = false;
    setStatus('idle');
    setErrorMessage(null);
    teardownAllConnections();
    if (wasJoined && roomIdRef.current) {
      socketService.leaveVoiceCall();
    }
  }, [teardownAllConnections]);

  const createPeerConnection = useCallback(
    (peerUserId: string): PeerConnectionEntry | null => {
      if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
        return null;
      }
      const existing = peerEntriesRef.current.get(peerUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);

      const entry: PeerConnectionEntry = {
        pc,
        makingOffer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        audioEl,
      };
      peerEntriesRef.current.set(peerUserId, entry);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
        }
      }

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const json = ev.candidate.toJSON();
        if (!json.candidate) return;
        socketService.sendVoiceSignal({
          targetUserId: peerUserId,
          signalType: 'ice',
          candidate: {
            candidate: json.candidate,
            sdpMid: json.sdpMid ?? null,
            sdpMLineIndex: json.sdpMLineIndex ?? null,
            usernameFragment: json.usernameFragment ?? null,
          },
        });
      };

      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
        entry.audioEl.srcObject = remoteStream;
        entry.audioEl.play().catch(() => {});
        attachMeter(peerUserId, remoteStream);
      };

      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            socketService.sendVoiceSignal({
              targetUserId: peerUserId,
              signalType: 'offer',
              sdp: {
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp,
              },
            });
          }
        } catch {
          // ignore transient negotiation error
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          pc.restartIce?.();
        }
      };

      return entry;
    },
    [attachMeter]
  );

  // Sync PeerConnections whenever room voicePeers change while joined
  useEffect(() => {
    if (!isJoined || !enabled) return;

    const remoteIds = new Set(
      voicePeers.filter((p) => p.userId !== currentUserId).map((p) => p.userId)
    );

    // Close peers that left voice
    for (const existingPeerId of Array.from(peerEntriesRef.current.keys())) {
      if (!remoteIds.has(existingPeerId)) {
        closePeerEntry(existingPeerId);
      }
    }

    // Open connections to new remote peers
    for (const remoteId of remoteIds) {
      if (!peerEntriesRef.current.has(remoteId)) {
        createPeerConnection(remoteId);
      }
    }
  }, [voicePeers, isJoined, enabled, currentUserId, closePeerEntry, createPeerConnection]);

  // Monitor audio speaking levels via Web Audio AnalyserNode
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
      const mutedIds = new Set(
        voicePeersRef.current.filter((p) => p.isMuted).map((p) => p.userId)
      );

      metersRef.current.forEach((meter, uid) => {
        if (uid === currentUserIdRef.current && isMutedRef.current) return;
        if (uid !== currentUserIdRef.current && mutedIds.has(uid)) return;

        meter.analyser.getByteTimeDomainData(meter.buffer);
        let sumSq = 0;
        for (let i = 0; i < meter.buffer.length; i += 1) {
          const norm = (meter.buffer[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / meter.buffer.length);
        if (rms > 0.025) {
          lastSpokenAtRef.current.set(uid, now);
        }
      });

      lastSpokenAtRef.current.forEach((ts, uid) => {
        if (uid === currentUserIdRef.current && isMutedRef.current) return;
        if (uid !== currentUserIdRef.current && mutedIds.has(uid)) return;
        if (now - ts < 380) {
          activeSpeakers.push(uid);
        }
      });

      setSpeakingUserIds((prev) => {
        if (
          prev.length === activeSpeakers.length &&
          prev.every((id, idx) => id === activeSpeakers[idx])
        ) {
          return prev;
        }
        return activeSpeakers;
      });
    }, 100);

    return () => {
      if (meterIntervalRef.current) {
        clearInterval(meterIntervalRef.current);
        meterIntervalRef.current = null;
      }
    };
  }, [isJoined]);

  // Subscribe to WebSocket voice events
  useEffect(() => {
    const unsub = socketService.subscribe((event: SocketEvent) => {
      if (event.type === 'ROOM_STATE') {
        const incomingPeers = Array.isArray(event.payload?.voicePeers)
          ? (event.payload.voicePeers as VoicePeerState[])
          : [];
        setVoicePeers(incomingPeers);
        return;
      }

      if (event.type === 'VOICE_PARTICIPANTS_UPDATED') {
        const targetRoom = String(event.payload?.roomId || '').toLowerCase();
        if (targetRoom && targetRoom !== roomIdRef.current.toLowerCase()) return;
        const incomingPeers = Array.isArray(event.payload?.peers)
          ? (event.payload.peers as VoicePeerState[])
          : [];
        setVoicePeers(incomingPeers);
        return;
      }

      if (event.type === 'VOICE_SIGNAL') {
        if (!isJoinedRef.current) return;
        const fromUserId = String(event.payload?.fromUserId || '');
        const signalType = event.payload?.signalType;
        if (!fromUserId || fromUserId === currentUserIdRef.current || !signalType) return;

        const entry =
          peerEntriesRef.current.get(fromUserId) || createPeerConnection(fromUserId);
        if (!entry) return;

        const pc = entry.pc;
        const polite = currentUserIdRef.current < fromUserId;

        if (signalType === 'offer' || signalType === 'answer') {
          const sdpPayload = event.payload?.sdp;
          if (!sdpPayload || !sdpPayload.type) return;

          const offerCollision =
            signalType === 'offer' &&
            (entry.makingOffer || pc.signalingState !== 'stable');
          entry.ignoreOffer = !polite && offerCollision;
          if (entry.ignoreOffer) return;

          void (async () => {
            try {
              await pc.setRemoteDescription(
                new RTCSessionDescription({
                  type: sdpPayload.type as RTCSdpType,
                  sdp: sdpPayload.sdp,
                })
              );
              // Drain queued ICE candidates
              while (entry.pendingCandidates.length > 0) {
                const cand = entry.pendingCandidates.shift();
                if (cand) {
                  await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                }
              }
              if (signalType === 'offer') {
                await pc.setLocalDescription();
                if (pc.localDescription) {
                  socketService.sendVoiceSignal({
                    targetUserId: fromUserId,
                    signalType: 'answer',
                    sdp: {
                      type: pc.localDescription.type,
                      sdp: pc.localDescription.sdp,
                    },
                  });
                }
              }
            } catch {
              // ignore malformed or stale SDP
            }
          })();
          return;
        }

        if (signalType === 'ice' && event.payload?.candidate) {
          const candInit = event.payload.candidate as RTCIceCandidateInit;
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            entry.pendingCandidates.push(candInit);
          } else {
            pc.addIceCandidate(new RTCIceCandidate(candInit)).catch(() => {
              if (!entry.ignoreOffer) {
                // ignore stale candidate
              }
            });
          }
        }
      }
    });

    return () => {
      unsub();
    };
  }, [createPeerConnection]);

  // Leave voice when changing rooms or disabling
  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [roomId, leaveVoice]);

  const joinVoice = useCallback(async () => {
    if (!enabled) return;
    if (isJoinedRef.current) return;

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setStatus('insecure');
      setErrorMessage(
        pickLang(lang, {
          es: 'El chat de voz requiere HTTPS para acceder al micrófono.',
          ca: 'El xat de veu requereix HTTPS per accedir al micròfon.',
          en: 'Voice chat requires a secure HTTPS connection for microphone access.',
        })
      );
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setStatus('unavailable');
      setErrorMessage(
        pickLang(lang, {
          es: 'Tu navegador no soporta micrófono o llamadas de voz WebRTC.',
          ca: 'El teu navegador no suporta micròfon o trucades WebRTC.',
          en: 'Your browser does not support microphone or WebRTC voice calls.',
        })
      );
      return;
    }

    setStatus('requesting');
    setErrorMessage(null);
    ensureAudioContext();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      attachMeter(currentUserIdRef.current, stream);

      setIsMuted(false);
      isMutedRef.current = false;
      setIsJoined(true);
      isJoinedRef.current = true;
      setStatus('active');

      socketService.joinVoiceCall();
    } catch (err: unknown) {
      const errName =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setStatus('denied');
        setErrorMessage(
          pickLang(lang, {
            es: 'Permiso de micrófono denegado. Actívalo en el candado del navegador y vuelve a intentarlo.',
            ca: 'Permís de micròfon denegat. Activa’l al cadenat del navegador i torna-ho a provar.',
            en: 'Microphone permission denied. Allow mic access in your browser settings and retry.',
          })
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setStatus('unavailable');
        setErrorMessage(
          pickLang(lang, {
            es: 'No se detectó ningún micrófono conectado en este dispositivo.',
            ca: 'No s’ha detectat cap micròfon connectat en aquest dispositiu.',
            en: 'No microphone was detected on this device.',
          })
        );
      } else {
        setStatus('error');
        setErrorMessage(
          pickLang(lang, {
            es: 'No se pudo iniciar el micrófono. Comprueba si otra app lo está usando.',
            ca: 'No s’ha pogut iniciar el micròfon. Comprova si una altra app l’està usant.',
            en: 'Could not start microphone. Check if another app is using it.',
          })
        );
      }
    }
  }, [enabled, lang, ensureAudioContext, attachMeter]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        track.enabled = !nextMuted;
      }
    }

    if (isJoinedRef.current) {
      socketService.updateVoiceMute(nextMuted);
    }
  }, []);

  return {
    status,
    isJoined,
    isMuted,
    errorMessage,
    voicePeers,
    speakingUserIds,
    joinVoice,
    leaveVoice,
    toggleMute,
  };
}
