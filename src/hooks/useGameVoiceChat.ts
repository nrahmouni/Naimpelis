import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService, type SocketEvent } from '../services/socket';
import type { VoicePeerState } from '../shared/protocol';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import {
  createHiddenAudioElement,
  useVoiceAudioPipeline,
  type PeerConnectionEntry,
} from './useVoiceAudioPipeline';

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
  audioPlaybackBlocked: boolean;
  connectedPeerCount: number;
  voicePeers: VoicePeerState[];
  speakingUserIds: string[];
  localAudioLevel: number;
  audioLevels: Record<string, number>;
  joinVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  resumeRemoteAudio: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceCandidatePoolSize: 4,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

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
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);
  const [voicePeers, setVoicePeers] = useState<VoicePeerState[]>([]);

  const isJoinedRef = useRef(false);
  const isMutedRef = useRef(false);
  const currentUserIdRef = useRef(currentUserId);
  const roomIdRef = useRef(roomId);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerEntriesRef = useRef<Map<string, PeerConnectionEntry>>(new Map());
  const voicePeersRef = useRef<VoicePeerState[]>([]);

  currentUserIdRef.current = currentUserId;
  roomIdRef.current = roomId;
  isJoinedRef.current = isJoined;
  isMutedRef.current = isMuted;
  voicePeersRef.current = voicePeers;

  const {
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
  } = useVoiceAudioPipeline({
    isJoined,
    currentUserIdRef,
    isMutedRef,
    peerEntriesRef,
    voicePeersRef,
  });

  const refreshConnectedPeerCount = useCallback(() => {
    let count = 0;
    peerEntriesRef.current.forEach((entry) => {
      const st = entry.pc.connectionState;
      const iceSt = entry.pc.iceConnectionState;
      if (
        st === 'connected' ||
        iceSt === 'connected' ||
        iceSt === 'completed'
      ) {
        count += 1;
      }
    });
    setConnectedPeerCount(count);
  }, []);

  const closePeerEntry = useCallback(
    (peerUserId: string) => {
      const entry = peerEntriesRef.current.get(peerUserId);
      if (!entry) return;
      peerEntriesRef.current.delete(peerUserId);
      if (entry.iceDisconnectTimer) {
        clearTimeout(entry.iceDisconnectTimer);
        entry.iceDisconnectTimer = null;
      }
      detachFallbackGain(entry, metersRef.current.get(peerUserId));
      detachMeter(peerUserId);
      try {
        entry.pc.onicecandidate = null;
        entry.pc.ontrack = null;
        entry.pc.onnegotiationneeded = null;
        entry.pc.onconnectionstatechange = null;
        entry.pc.oniceconnectionstatechange = null;
        entry.pc.close();
      } catch {
        // ignore
      }
      try {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        if (entry.pooledAudio) {
          unlockedAudioPoolRef.current.push(entry.audioEl);
        } else {
          entry.audioEl.remove();
        }
      } catch {
        // ignore
      }
      refreshConnectedPeerCount();
    },
    [detachFallbackGain, detachMeter, refreshConnectedPeerCount]
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
    setLocalAudioLevel(0);
    setAudioLevels({});
    setAudioPlaybackBlocked(false);
    setConnectedPeerCount(0);
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
    (peerUserId: string, joinedAt = Date.now()): PeerConnectionEntry | null => {
      if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
        return null;
      }
      const existing = peerEntriesRef.current.get(peerUserId);
      if (existing) {
        if (
          existing.pc.connectionState !== 'closed' &&
          existing.pc.connectionState !== 'failed' &&
          existing.joinedAt === joinedAt
        ) {
          return existing;
        }
        closePeerEntry(peerUserId);
      }

      const isInitiator = currentUserIdRef.current < peerUserId;
      const pc = new RTCPeerConnection(RTC_CONFIG);

      const pooledEl = unlockedAudioPoolRef.current.pop();
      const audioEl = pooledEl || createHiddenAudioElement();

      const entry: PeerConnectionEntry = {
        pc,
        isInitiator,
        makingOffer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        audioEl,
        pooledAudio: Boolean(pooledEl),
        joinedAt,
        remoteStream: null,
        fallbackGain: null,
        iceDisconnectTimer: null,
      };
      peerEntriesRef.current.set(peerUserId, entry);

      const sendOffer = async () => {
        if (!entry.isInitiator || entry.makingOffer) return;
        if (pc.signalingState !== 'stable') return;
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
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

      const stream = localStreamRef.current;
      if (stream && stream.getAudioTracks().length > 0) {
        for (const track of stream.getAudioTracks()) {
          pc.addTrack(track, stream);
        }
      } else {
        try {
          pc.addTransceiver('audio', { direction: 'sendrecv' });
        } catch {
          // ignore
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
        if (ev.track) {
          ev.track.enabled = true;
        }
        const remoteStream = ev.streams[0] || new MediaStream([ev.track]);
        entry.remoteStream = remoteStream;
        ensureAudioContext();
        attachMeter(peerUserId, remoteStream);
        void tryPlayRemoteAudio(peerUserId);

        if (ev.track) {
          ev.track.onunmute = () => {
            void tryPlayRemoteAudio(peerUserId);
          };
        }
      };

      pc.onnegotiationneeded = () => {
        if (entry.isInitiator) {
          void sendOffer();
        }
      };

      pc.oniceconnectionstatechange = () => {
        refreshConnectedPeerCount();
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          if (entry.iceDisconnectTimer) {
            clearTimeout(entry.iceDisconnectTimer);
            entry.iceDisconnectTimer = null;
          }
          if (entry.remoteStream && entry.audioEl.paused) {
            void tryPlayRemoteAudio(peerUserId);
          }
        } else if (pc.iceConnectionState === 'disconnected') {
          if (!entry.iceDisconnectTimer) {
            entry.iceDisconnectTimer = setTimeout(() => {
              entry.iceDisconnectTimer = null;
              if (
                peerEntriesRef.current.get(peerUserId) === entry &&
                (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')
              ) {
                pc.restartIce?.();
                if (entry.isInitiator) void sendOffer();
              }
            }, 3000);
          }
        } else if (pc.iceConnectionState === 'failed') {
          pc.restartIce?.();
          if (entry.isInitiator) {
            void sendOffer();
          }
        }
      };

      pc.onconnectionstatechange = () => {
        refreshConnectedPeerCount();
        if (pc.connectionState === 'connected' && entry.remoteStream && entry.audioEl.paused) {
          void tryPlayRemoteAudio(peerUserId);
        } else if (pc.connectionState === 'failed') {
          pc.restartIce?.();
          if (entry.isInitiator) {
            void sendOffer();
          }
        }
      };

      if (isInitiator) {
        void sendOffer();
      }

      return entry;
    },
    [
      attachMeter,
      closePeerEntry,
      ensureAudioContext,
      refreshConnectedPeerCount,
      tryPlayRemoteAudio,
    ]
  );

  // Sync PeerConnections whenever room voicePeers change while joined
  useEffect(() => {
    if (!isJoined || !enabled) return;

    const remotePeers = voicePeers.filter((p) => p.userId !== currentUserId);
    const remoteIds = new Set(remotePeers.map((p) => p.userId));

    // Close peers that left voice
    for (const existingPeerId of Array.from(peerEntriesRef.current.keys())) {
      if (!remoteIds.has(existingPeerId)) {
        closePeerEntry(existingPeerId);
      }
    }

    // Open or refresh connections to remote peers
    for (const remote of remotePeers) {
      const existing = peerEntriesRef.current.get(remote.userId);
      if (
        !existing ||
        existing.joinedAt !== remote.joinedAt ||
        existing.pc.connectionState === 'closed'
      ) {
        createPeerConnection(remote.userId, remote.joinedAt);
      }
    }
  }, [voicePeers, isJoined, enabled, currentUserId, closePeerEntry, createPeerConnection]);

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

        const peerMeta = voicePeersRef.current.find((p) => p.userId === fromUserId);
        const entry =
          peerEntriesRef.current.get(fromUserId) ||
          createPeerConnection(fromUserId, peerMeta?.joinedAt || Date.now());
        if (!entry) return;

        const pc = entry.pc;
        const polite = currentUserIdRef.current > fromUserId;

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
              if (offerCollision && pc.signalingState !== 'stable') {
                await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
              }
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
                const stream = localStreamRef.current;
                if (stream) {
                  const existingTracks = new Set(
                    pc.getSenders().map((s) => s.track).filter(Boolean)
                  );
                  for (const track of stream.getAudioTracks()) {
                    if (!existingTracks.has(track)) {
                      pc.addTrack(track, stream);
                    }
                  }
                }
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
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
            pc.addIceCandidate(new RTCIceCandidate(candInit)).catch(() => {});
          }
        }
      }
    });

    return () => {
      unsub();
    };
  }, [createPeerConnection]);

  // Leave voice when changing rooms or unmounting
  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [roomId, leaveVoice]);

  const joinVoice = useCallback(async () => {
    if (isJoinedRef.current) return;

    if (!enabled || !roomIdRef.current) {
      setStatus('error');
      setErrorMessage(
        pickLang(lang, {
          es: 'Entra o crea una sala para activar la llamada de voz en directo.',
          ca: 'Entra o crea una sala per activar la trucada de veu en directe.',
          en: 'Join or create a room first to start a live voice call.',
        })
      );
      return;
    }

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
          es: 'Tu navegador o dispositivo no soporta micrófono o llamadas WebRTC.',
          ca: 'El teu navegador o dispositiu no suporta micròfon o trucades WebRTC.',
          en: 'Your browser or device does not support microphone or WebRTC voice calls.',
        })
      );
      return;
    }

    setStatus('requesting');
    setErrorMessage(null);
    // Unlock audio elements and AudioContext synchronously inside user click before async mic prompt
    primeAudioPoolOnGesture();
    ensureAudioContext();

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (constraintErr: unknown) {
        const cname =
          constraintErr && typeof constraintErr === 'object' && 'name' in constraintErr
            ? String((constraintErr as { name?: string }).name)
            : '';
        if (
          cname === 'NotAllowedError' ||
          cname === 'PermissionDeniedError' ||
          cname === 'NotFoundError' ||
          cname === 'DevicesNotFoundError'
        ) {
          throw constraintErr;
        }
        // Fallback for Android WebView / OEM devices rejecting advanced audio constraints
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      // Re-resume AudioContext inside post-permission microtask so AnalyserNode ticks on mobile
      ensureAudioContext();

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
            es: 'Permiso de micrófono denegado. Actívalo en el navegador o Ajustes de la app y pulsa Reintentar.',
            ca: 'Permís de micròfon denegat. Activa’l al navegador o als Ajustos de l’app i torna-ho a provar.',
            en: 'Microphone permission denied. Enable mic access in browser/app settings and retry.',
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
            es: 'No se pudo iniciar el micrófono. Comprueba los permisos o si otra app lo está usando.',
            ca: 'No s’ha pogut iniciar el micròfon. Comprova els permisos o si una altra app l’està usant.',
            en: 'Could not start microphone. Check permissions or if another app is using it.',
          })
        );
      }
    }
  }, [enabled, lang, ensureAudioContext, attachMeter, primeAudioPoolOnGesture]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        track.enabled = !nextMuted;
      }
    }

    if (nextMuted) {
      lastSpokenAtRef.current.delete(currentUserIdRef.current);
      setLocalAudioLevel(0);
      setAudioLevels((prev) => ({ ...prev, [currentUserIdRef.current]: 0 }));
      setSpeakingUserIds((prev) => prev.filter((id) => id !== currentUserIdRef.current));
    } else {
      ensureAudioContext();
    }

    if (isJoinedRef.current) {
      socketService.updateVoiceMute(nextMuted);
    }
  }, [ensureAudioContext]);

  return {
    status,
    isJoined,
    isMuted,
    errorMessage,
    audioPlaybackBlocked,
    connectedPeerCount,
    voicePeers,
    speakingUserIds,
    localAudioLevel,
    audioLevels,
    joinVoice,
    leaveVoice,
    toggleMute,
    resumeRemoteAudio,
  };
}
