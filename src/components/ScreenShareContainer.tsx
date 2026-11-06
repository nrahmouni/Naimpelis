import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Video, Volume2, VolumeX, Maximize2, Minimize2, Radio, Play } from 'lucide-react';
import { socketService } from '../services/socket';

interface ScreenShareContainerProps {
  isHost: boolean;
  roomId: string;
  hostId: string;
  currentUserId: string;
  onStopScreenShare: () => void;
}

export const ScreenShareContainer: React.FC<ScreenShareContainerProps> = ({
  isHost,
  roomId,
  hostId,
  currentUserId,
  onStopScreenShare,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>(
    isHost ? 'Compartiendo pantalla...' : 'Conectando a transmisión del Host...'
  );

  const peerConnectionsRef = useRef<{ [peerId: string]: RTCPeerConnection }>({});
  const pendingCandidatesRef = useRef<{ [peerId: string]: RTCIceCandidateInit[] }>({});
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);

  const flushPendingCandidates = async (peerId: string, pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current[peerId] || [];
    delete pendingCandidatesRef.current[peerId];
    await Promise.all(candidates.map((candidate) => pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined)));
  };

  // Helper to create RTCPeerConnection
  const createPeerConnection = (peerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendWebRTCSignal(roomId, {
          type: 'candidate',
          candidate: event.candidate,
        }, peerId, currentUserId);
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setConnectionStatus('Transmisión en directo en vivo 🔴');
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionStatus('Transmisión en directo');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionStatus('La red requiere una ruta TURN para conectar');
      }
    };

    peerConnectionsRef.current[peerId] = pc;
    return pc;
  };

  const [isMobileUnsupported, setIsMobileUnsupported] = useState(false);

  // Host trigger screen capture on click
  const startScreenShare = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      setIsMobileUnsupported(true);
      setConnectionStatus('No soportado en móvil');
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: true,
      });
      if (!activeRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }

      mediaStream.getVideoTracks()[0].onended = () => {
        onStopScreenShare();
      };

      socketService.sendWebRTCSignal(roomId, { type: 'screen_share_started' }, 'all', currentUserId);
      setConnectionStatus('Transmitiendo pantalla en directo 🔴');
    } catch (err: any) {
      console.error('Error starting screen share:', err);
      setConnectionStatus('Permiso de pantalla denegado');
    }
  };

  useEffect(() => {
    activeRef.current = true;
    if (isHost && typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      setIsMobileUnsupported(true);
    }

    // Subscribe to WebRTC signals
    const unsubscribe = socketService.subscribe(({ type, payload }) => {
      if (type === 'WEBRTC_SIGNAL') {
        const { signalData, senderId, targetId } = payload;
        if (targetId && targetId !== 'all' && targetId !== currentUserId) return;

        const activeStream = streamRef.current;
        if (signalData.type === 'request_offer' && isHost && activeStream) {
          // Host creates peer connection and sends offer to requesting guest
          const pc = createPeerConnection(senderId);
          activeStream.getTracks().forEach((track) => pc.addTrack(track, activeStream));

          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              socketService.sendWebRTCSignal(
                roomId,
                { type: 'offer', offer: pc.localDescription },
                senderId,
                currentUserId
              );
            });
        } else if (signalData.type === 'offer' && !isHost) {
          const pc = createPeerConnection(senderId);
          pc.setRemoteDescription(new RTCSessionDescription(signalData.offer))
            .then(() => flushPendingCandidates(senderId, pc))
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              socketService.sendWebRTCSignal(
                roomId,
                { type: 'answer', answer: pc.localDescription },
                senderId,
                currentUserId
              );
            });
        } else if (signalData.type === 'answer' && isHost) {
          const pc = peerConnectionsRef.current[senderId];
          if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(signalData.answer))
              .then(() => flushPendingCandidates(senderId, pc))
              .catch(() => setConnectionStatus('No se pudo completar la conexión P2P'));
          }
        } else if (signalData.type === 'candidate') {
          const pc = peerConnectionsRef.current[senderId];
          if (signalData.candidate) {
            if (!pc || !pc.remoteDescription) {
              pendingCandidatesRef.current[senderId] = [
                ...(pendingCandidatesRef.current[senderId] || []),
                signalData.candidate,
              ];
            } else {
              pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)).catch(() => undefined);
            }
          }
        }
      }
    });

    if (!isHost && hostId) {
      socketService.sendWebRTCSignal(roomId, { type: 'request_offer' }, hostId, currentUserId);
    }

    return () => {
      unsubscribe();
      // Clean up connections and tracks
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      pendingCandidatesRef.current = {};
      activeRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [isHost, roomId, hostId, currentUserId]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div
      className={`w-full flex flex-col bg-black overflow-hidden relative border-b border-slate-800 ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen' : 'h-[38vh] sm:h-[45vh] md:h-full flex-1'
      }`}
    >
      {/* Live Badge Status Bar */}
      <div className="bg-slate-950/90 px-3 py-1.5 flex items-center justify-between border-b border-slate-800 text-xs z-10 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span className="font-bold text-rose-400 uppercase text-[11px] tracking-wider flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-rose-500" /> Pantalla Compartida P2P
          </span>
          <span className="text-slate-400 text-[11px] hidden sm:inline font-mono">
            ({connectionStatus})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isHost && (
            <button
              onClick={onStopScreenShare}
              className="px-2.5 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shadow-sm transition-all"
            >
              Detener Transmisión
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-1 text-slate-400 hover:text-white"
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Video Screen Stream */}
      <div className="flex-1 w-full h-full relative bg-black flex items-center justify-center p-4">
        {isHost ? (
          stream ? (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : isMobileUnsupported ? (
            <div className="flex flex-col items-center justify-center text-center p-5 bg-slate-900 border border-slate-800 rounded-2xl max-w-sm shadow-2xl">
              <Monitor className="w-10 h-10 text-amber-400 mb-2" />
              <h3 className="text-xs font-bold text-slate-100 mb-1">Compartir Pantalla desde PC / Laptop</h3>
              <p className="text-[11px] text-slate-400 mb-3">
                Los móviles (Android/iOS) restringen la captura de pantalla por seguridad. Conéctate desde un ordenador para compartir tu pantalla o usa el Navegador Chrome Sincronizado.
              </p>
              <button
                onClick={onStopScreenShare}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
              >
                🌐 Volver al Navegador Chrome
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900 border border-slate-800 rounded-2xl max-w-sm shadow-2xl">
              <Monitor className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-100 mb-1">Transmitir Pantalla en Directo</h3>
              <p className="text-xs text-slate-400 mb-4">
                Elige la pestaña o ventana con la película (ej: Bingetrix, Chrome o VLC) para transmitirla en directo a tus invitados.
              </p>
              <button
                onClick={startScreenShare}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 active:scale-95 transition-all flex items-center gap-2"
              >
                <Radio className="w-4 h-4 text-white" />
                <span>Iniciar Transmisión Ahora</span>
              </button>
            </div>
          )
        ) : (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            controls
            className="w-full h-full object-contain bg-black"
          />
        )}
      </div>
    </div>
  );
};
