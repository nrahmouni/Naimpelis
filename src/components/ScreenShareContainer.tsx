import React, { useRef, useState, useEffect } from 'react';
import { Tv, StopCircle, Radio } from 'lucide-react';
import { socketService } from '../services/socket';

interface ScreenShareContainerProps {
  isHost: boolean;
  roomId: string;
  currentUserId: string;
  onStopScreenShare: () => void;
}

export const ScreenShareContainer: React.FC<ScreenShareContainerProps> = ({
  isHost,
  roomId,
  currentUserId,
  onStopScreenShare,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (isHost) {
      navigator.mediaDevices
        .getDisplayMedia({ video: true, audio: true })
        .then((mediaStream) => {
          setStream(mediaStream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = mediaStream;
          }
          mediaStream.getVideoTracks()[0].onended = () => {
            onStopScreenShare();
          };
        })
        .catch(() => {
          onStopScreenShare();
        });
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isHost]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse">
        <Radio className="w-4 h-4" />
        <span>Transmitiendo Pantalla en Directo</span>
      </div>

      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />

      {isHost && (
        <button
          onClick={onStopScreenShare}
          className="absolute bottom-4 right-4 z-20 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-2xl"
        >
          <StopCircle className="w-4 h-4" />
          <span>Detener Transmisión</span>
        </button>
      )}
    </div>
  );
};
