import React, { useMemo } from 'react';
import { CheckCircle2, Smartphone, Wifi, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { resolvePublicLinkOrigin } from '../../../utils/shortLink';

export interface DualGyroControllerPeer {
  userId: string;
  deviceName: string;
  slot?: 1 | 2;
}

interface DualGyroQrPanelProps {
  roomId: string;
  gameId: string;
  title: string;
  subtitle?: string;
  controllers: DualGyroControllerPeer[];
  onClose: () => void;
}

export const DualGyroQrPanel: React.FC<DualGyroQrPanelProps> = ({
  roomId,
  gameId,
  title,
  subtitle,
  controllers,
  onClose,
}) => {
  const { p1Url, p2Url } = useMemo(() => {
    const base =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : resolvePublicLinkOrigin();
    const q = `room=${encodeURIComponent(roomId)}&game=${encodeURIComponent(gameId)}`;
    return {
      p1Url: `${base}/volante?${q}&slot=1`,
      p2Url: `${base}/volante?${q}&slot=2`,
    };
  }, [gameId, roomId]);

  const p1Peer = controllers.find((c) => (c.slot ?? 1) === 1);
  const p2Peer = controllers.find((c) => c.slot === 2);

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-[#0e1324] border border-cyan-400/40 p-5 sm:p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-5 h-5 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">{title}</h3>
              <p className="text-[11px] text-zinc-400 truncate">
                {subtitle ||
                  'Escanea en vertical con tu móvil · Conexión automática sin introducir código de sala'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel QR"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Jugador 1 QR */}
          <div
            className={`rounded-2xl p-4 border text-center space-y-2.5 ${
              p1Peer
                ? 'bg-cyan-500/15 border-cyan-400/70'
                : 'bg-white/[0.03] border-cyan-400/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-cyan-300">JUGADOR 1 (AZUL)</span>
              <span className={p1Peer ? 'text-emerald-300 inline-flex items-center gap-1' : 'text-zinc-400'}>
                {p1Peer ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Conectado
                  </>
                ) : (
                  'Esperando...'
                )}
              </span>
            </div>
            <div className="inline-block p-2.5 rounded-2xl bg-white shadow-inner">
              <QRCodeSVG value={p1Url} size={146} level="M" includeMargin={false} />
            </div>
            <div className="text-[10px] font-mono text-cyan-200/90 break-all leading-snug">
              {p1Url}
            </div>
          </div>

          {/* Jugador 2 QR */}
          <div
            className={`rounded-2xl p-4 border text-center space-y-2.5 ${
              p2Peer
                ? 'bg-rose-500/15 border-rose-400/70'
                : 'bg-white/[0.03] border-rose-400/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-rose-300">JUGADOR 2 (ROJO)</span>
              <span className={p2Peer ? 'text-emerald-300 inline-flex items-center gap-1' : 'text-zinc-400'}>
                {p2Peer ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Conectado
                  </>
                ) : (
                  'Opcional 2P'
                )}
              </span>
            </div>
            <div className="inline-block p-2.5 rounded-2xl bg-white shadow-inner">
              <QRCodeSVG value={p2Url} size={146} level="M" includeMargin={false} />
            </div>
            <div className="text-[10px] font-mono text-rose-200/90 break-all leading-snug">
              {p2Url}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-300 pt-1">
          <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Usa el móvil siempre en vertical · Giroscopio y botones en zona del pulgar</span>
        </div>
      </div>
    </div>
  );
};
