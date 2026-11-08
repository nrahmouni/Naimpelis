import React, { useState, useEffect } from 'react';
import { Tv, Cast, Smartphone, Check, ExternalLink, QrCode, X, Copy, Play, Wifi, RefreshCw } from 'lucide-react';

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
  currentVideoUrl,
  currentVideoTitle,
}) => {
  const [copied, setCopied] = useState(false);
  const [castStatus, setCastStatus] = useState<'idle' | 'searching' | 'casting' | 'unsupported'>('idle');
  const [tvCode, setTvCode] = useState('');

  // Generate or use current TV URL
  const tvUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}&tv=1`;

  useEffect(() => {
    // Generate a simple 4-digit fast-code based on roomId
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

  // Google Cast API or Browser Remote Playback API
  const handleNativeCast = async () => {
    setCastStatus('searching');
    try {
      // 1. Try Remote Playback API if available on an active video
      const activeVideo = document.querySelector('video') as any;
      if (activeVideo && activeVideo.remote && typeof activeVideo.remote.prompt === 'function') {
        await activeVideo.remote.prompt();
        setCastStatus('casting');
        return;
      }

      // 2. Try Web Presentation API (Chromecast / Smart TVs / Android TV)
      if ('PresentationRequest' in window) {
        const presentationRequest = new (window as any).PresentationRequest([tvUrl]);
        const connection = await presentationRequest.start();
        setCastStatus('casting');
        connection.onconnect = () => {
          setCastStatus('casting');
        };
        return;
      }

      // If not supported natively in this browser window
      setCastStatus('unsupported');
    } catch (err) {
      console.log('Cast prompt dismissed or unsupported:', err);
      setCastStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-rose-950/40 text-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-600/40">
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Enviar a la Tele
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                  Smart TV / Cast
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Ver en pantalla gigante sincronizado con el móvil</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Method 1: Chromecast / AirPlay / Screen Cast Instant Button */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-800/40 border border-slate-700/80">
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <Cast className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Opción 1: Enviar por Chromecast / AirPlay</h4>
                  <p className="text-[11px] text-slate-400">Detección inalámbrica directa de Smart TV y altavoces</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleNativeCast}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 active:scale-95 transition-all"
            >
              <Cast className="w-4 h-4" />
              <span>{castStatus === 'searching' ? 'Buscando televisores...' : castStatus === 'casting' ? 'Conectado a la Tele' : 'Transmitir a TV Cercana'}</span>
            </button>
            {castStatus === 'unsupported' && (
              <p className="text-[10px] text-amber-400 mt-2 text-center">
                Tu navegador actual no tiene Cast directo. Usa la Opción 2 o abre en Chrome.
              </p>
            )}
          </div>

          {/* Method 2: Open in TV Browser with QR or Simple URL */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <Tv className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Opción 2: Abrir en el navegador de tu Smart TV</h4>
                <p className="text-[11px] text-slate-400">Compatible con Samsung, LG webOS, Android TV, FireStick y consolas</p>
              </div>
            </div>

            {/* Quick Step Guide */}
            <div className="space-y-2 text-[11px] text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 font-mono">
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
                <span>Abre el navegador web de tu Smart TV (ej: Chrome, Samsung Internet o Firefox).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
                <span>Escribe la dirección de la sala:</span>
              </div>
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                <span className="text-rose-400 font-bold truncate text-[11px] select-all">{tvUrl}</span>
                <button
                  onClick={handleCopyLink}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-sans font-bold flex items-center gap-1 shrink-0 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <div className="flex items-start gap-2 pt-1">
                <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-bold shrink-0 mt-0.5">3</span>
                <span>¡Listo! Tu TV entra automáticamente en modo <b>"Pantalla Cine TV"</b> a toda pantalla sin interfaz y controlada desde tu móvil.</span>
              </div>
            </div>

            {/* TV Code Badge */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-rose-400 animate-pulse" />
                <span className="text-xs text-slate-300 font-medium">Código de Enlace Rápido TV:</span>
              </div>
              <span className="px-3 py-1 rounded-lg bg-rose-600 text-white font-mono font-bold text-sm tracking-widest shadow-md">
                {tvCode}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-rose-400" />
            <span>Móvil = Mando a distancia</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
