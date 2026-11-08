import React, { useState, useEffect } from 'react';
import { Tv, Cast, Smartphone, Check, Copy, Wifi, X } from 'lucide-react';

interface SendToTvModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
  currentVideoUrl: string;
  currentVideoTitle: string;
}

export const SendToTvModal: React.FC<SendToTvModalProps> = ({
  isOpen,
  onClose,
  roomId,
  roomName,
}) => {
  const [copied, setCopied] = useState(false);
  const [tvCode, setTvCode] = useState('');

  const tvUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}&tv=1`;

  useEffect(() => {
    let hash = 0;
    for (let i = 0; i < roomId.length; i++) {
      hash = (hash * 31 + roomId.charCodeAt(i)) % 9000;
    }
    setTvCode(String(1000 + Math.abs(hash)));
  }, [roomId]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-100 flex flex-col">
        <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-lg">
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Enviar a la Tele</h3>
              <p className="text-[11px] text-slate-400">Ver en pantalla gigante sincronizado con el móvil</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <div className="space-y-2 text-[11px] text-slate-300 font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
              <p>1. Abre el navegador web en tu Smart TV (Samsung, LG, FireStick, Android TV).</p>
              <p>2. Introduce la dirección URL de la sala:</p>
              <div className="bg-slate-900 p-2 rounded border border-slate-800 flex items-center justify-between gap-2">
                <span className="text-rose-400 font-bold truncate text-[11px] select-all">{tvUrl}</span>
                <button
                  onClick={handleCopyLink}
                  className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-bold flex items-center gap-1 shrink-0"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <p>3. Tu TV entrará en <b>Modo Cine TV</b> a pantalla completa controlada desde tu móvil.</p>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-rose-400 animate-pulse" />
                <span className="text-xs text-slate-300 font-medium">Código Enlace TV:</span>
              </div>
              <span className="px-3 py-1 rounded-lg bg-rose-600 text-white font-mono font-bold text-sm tracking-widest">
                {tvCode}
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-rose-400" />
            <span>Móvil = Mando a distancia</span>
          </span>
          <button onClick={onClose} className="px-3 py-1 rounded bg-slate-800 text-slate-200 font-bold text-xs">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
