import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, Check, QrCode, MessageCircle, Send, X, Film } from 'lucide-react';

interface InviteModalProps {
  roomId: string;
  roomName: string;
  onClose: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({ roomId, roomName, onClose }) => {
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const inviteUrl = `${baseUrl}?room=${encodeURIComponent(roomId)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Únete a ${roomName} en Watch2Gether`,
          text: `¡Hola! Entra en mi sala para ver películas y vídeos en sincronía:`,
          url: inviteUrl,
        });
      } catch (err) {
        console.log('Share canceled or unsupported');
      }
    } else {
      handleCopy();
    }
  };

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `¡Únete a mi sala "${roomName}" en Watch2Gether para ver películas juntos! 🍿\n${inviteUrl}`
  )}`;

  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    inviteUrl
  )}&text=${encodeURIComponent(`¡Únete a mi sala "${roomName}" en Watch2Gether!`)}`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">Invitación a la Sala</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center gap-4 text-center">
          {/* Room Badge */}
          <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs font-semibold text-slate-200">{roomName}</span>
          </div>

          {/* QR Code Container */}
          <div className="bg-white p-3 rounded-2xl shadow-lg border border-slate-700/40">
            <QRCodeSVG value={inviteUrl} size={150} level="M" />
          </div>
          <p className="text-[11px] text-slate-400">Escanea el código QR con tu móvil para entrar al instante</p>

          {/* Link Copy Box */}
          <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-2.5 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="w-full bg-transparent text-xs text-slate-300 font-mono truncate focus:outline-none px-1"
            />
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shrink-0 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> ¡Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </>
              )}
            </button>
          </div>

          {/* Share Buttons */}
          <div className="w-full grid grid-cols-3 gap-2 pt-1">
            <button
              onClick={handleNativeShare}
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4 text-rose-400 mb-1" />
              <span>Compartir</span>
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-xs font-medium border border-emerald-800/50 transition-all active:scale-95"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400 mb-1" />
              <span>WhatsApp</span>
            </a>

            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 text-xs font-medium border border-sky-800/50 transition-all active:scale-95"
            >
              <Send className="w-4 h-4 text-sky-400 mb-1" />
              <span>Telegram</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
