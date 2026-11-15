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

// 1-sample silent PCM WAV used solely to unlock HTMLAudioElement autoplay synchronously inside user tap
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

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

interface PeerConnectionEntry {
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

interface AudioMeterEntry {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
  fallbackGain: GainNode | null;
}

function createHiddenAudioElement(): HTMLAudioElement {
  const el = document.createElement('audio');
  el.autoplay = true;
  el.muted = false;
  el.volume = 1;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  // Never use display:none — Android WebView and Safari may suspend media output on display:none elements
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
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);
  const [voicePeers, setVoicePeers] = useState<VoicePeerState[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  const [localAudioLevel, setLocalAudioLevel] = useState<number>(0);
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});

  const isJoinedRef = useRef(false);
  const isMutedRef = useRef(false);
  const currentUserIdRef = useRef(currentUserId);
  const roomIdRef = useRef(roomId);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerEntriesRef = useRef<Map<string, PeerConnectionEntry>>(new Map());
  const unlockedAudioPoolRef = useRef<HTMLAudioElement[]>([]);
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
        // Native HTMLAudioElement playback succeeded (supports hardware AEC); remove WebAudio fallback if active
        const meter = metersRef.current.get(peerUserId);
        detachFallbackGain(entry, meter);
        setAudioPlaybackBlocked(false);
      } catch {
        // Browser autoplay blocked <audio>.play(); fallback to unlocked AudioContext destination if running
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
    [detachFallbackGain, ensureAudioContext]
  );

  const resumeRemoteAudio = useCallback(() => {
    ensureAudioContext();
    peerEntriesRef.current.forEach((_, peerId) => {
      void tryPlayRemoteAudio(peerId);
    });
  }, [ensureAudioContext, tryPlayRemoteAudio]);

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

  // Automatically unlock blocked <audio> elements on next user tap/click anywhere
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

  // Clean up unlocked pool elements on unmount & leave voice when changing rooms
  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [roomId, leaveVoice]);

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
