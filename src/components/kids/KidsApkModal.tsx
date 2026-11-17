import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  QrCode,
  Smartphone,
  Tablet,
  Tv,
  X,
} from 'lucide-react';
import { triggerApkDownload } from '../../utils/apkDownload';
import { KidsSquishButton } from './KidsPrimitives';

interface KidsApkModalProps {
  open: boolean;
  onClose: () => void;
}

export const KidsApkModal: React.FC<KidsApkModalProps> = ({ open, onClose }) => {
  const [downloading, setDownloading] = useState<'mobile' | 'tv' | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tv' | 'mobile'>('tv');

  if (!open) return null;

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://riffantv.ai.studio';

  const mobileUrl = `${origin}/RIFFAN-KIDS.apk?v=300`;
  const tvUrl = `${origin}/RIFFAN-KIDS-TV.apk?v=300`;

  const handleDownload = async (kind: 'mobile' | 'tv') => {
    setDownloading(kind);
    const path = kind === 'tv' ? '/RIFFAN-KIDS-TV.apk?v=300' : '/RIFFAN-KIDS.apk?v=300';
    const filename = kind === 'tv' ? 'RIFFAN-KIDS-TV.apk' : 'RIFFAN-KIDS.apk';
    await triggerApkDownload(path, filename);
    setDownloading(null);
  };

  const copyToClipboard = async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        window.setTimeout(() => setCopiedUrl(null), 2500);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-tv-modal="true"
      className="fixed inset-0 z-[285] bg-[#030614]/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none overflow-hidden"
    >
      <div className="w-full max-w-2xl max-h-[96dvh] rounded-3xl bg-[#0F1635] border-2 sm:border-4 border-amber-400/70 shadow-[0_0_50px_rgba(245,158,11,0.25)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 bg-[#0B1028] border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-black text-sm sm:text-base text-white truncate">
                Descargar APK Oficial · Riffan Kids 100% Independiente
              </h2>
              <p className="text-[11px] text-sky-200/80 font-bold truncate">
                Sin Riffan TV ni canales adultos · Solo educación, cine kids y juegos
              </p>
            </div>
          </div>

          <button
            type="button"
            data-tv-focusable="true"
            onClick={onClose}
            aria-label="Cerrar ventana de descarga APK"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-300 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Device Switcher Tabs */}
        <div className="shrink-0 px-4 pt-3 flex gap-2 bg-[#0B112B] border-b border-white/10">
          <button
            type="button"
            data-tv-focusable="true"
            onClick={() => setActiveTab('tv')}
            className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer border-t-2 border-x-2 transition-all ${
              activeTab === 'tv'
                ? 'bg-[#151F48] text-amber-300 border-amber-400/60 shadow'
                : 'bg-white/5 text-zinc-300 border-transparent hover:bg-white/10'
            }`}
          >
            <Tv className="w-4 h-4 text-amber-300" />
            <span>Google TV / Android TV</span>
          </button>

          <button
            type="button"
            data-tv-focusable="true"
            onClick={() => setActiveTab('mobile')}
            className={`h-10 px-4 rounded-t-xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer border-t-2 border-x-2 transition-all ${
              activeTab === 'mobile'
                ? 'bg-[#151F48] text-sky-300 border-sky-400/60 shadow'
                : 'bg-white/5 text-zinc-300 border-transparent hover:bg-white/10'
            }`}
          >
            <Smartphone className="w-4 h-4 text-sky-300" />
            <span>Móvil y Tablet Android</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto space-y-4 text-white">
          {activeTab === 'tv' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#151F48] border border-amber-400/35">
                <div className="space-y-1 text-center sm:text-start min-w-0">
                  <div className="text-xs font-black uppercase text-amber-300 tracking-wider">
                    APK Riffan Kids para Televisor
                  </div>
                  <h3 className="font-display font-black text-xl text-white">
                    RIFFAN-KIDS-TV.apk
                  </h3>
                  <p className="text-xs text-sky-200">
                    Adaptado al 100% para el mando a distancia (D-Pad), resolución 1080p/4K y sin teclado obligatorio.
                  </p>
                </div>

                <KidsSquishButton
                  onClick={() => void handleDownload('tv')}
                  disabled={downloading === 'tv'}
                  className="!min-h-[44px] h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shrink-0 shadow-lg"
                >
                  {downloading === 'tv' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Descargar APK TV</span>
                </KidsSquishButton>
              </div>

              {/* Step-by-step Google TV Downloader Instructions */}
              <div className="p-4 rounded-2xl bg-[#090D22] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300">
                  <Info className="w-4 h-4" />
                  <span>¿Cómo instalar en Google TV o Android TV?</span>
                </div>
                <ol className="text-xs text-sky-100/90 space-y-1.5 list-decimal list-inside leading-relaxed font-medium">
                  <li>
                    En tu televisor, abre <strong>Google Play Store</strong> e instala la app gratuita <strong>Downloader</strong> (de AFTVnews).
                  </li>
                  <li>
                    Abre Downloader e introduce esta dirección directa en el navegador de la tele:
                  </li>
                </ol>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#121A3D] border border-white/10">
                  <span className="flex-1 font-mono text-xs text-amber-300 break-all select-all font-bold">
                    {tvUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(tvUrl)}
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedUrl === tvUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl === tvUrl ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <div className="p-2 rounded-xl bg-white shrink-0">
                    <QRCodeSVG value={tvUrl} size={88} level="M" />
                  </div>
                  <div className="text-xs text-zinc-300 space-y-1">
                    <span className="font-bold text-white block">Código QR Directo:</span>
                    <span>Escanea con la cámara de tu móvil para descargar el archivo y pasarlo por pendrive USB o app 'Send files to TV'.</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#151F48] border border-sky-400/35">
                <div className="space-y-1 text-center sm:text-start min-w-0">
                  <div className="text-xs font-black uppercase text-sky-300 tracking-wider">
                    APK Riffan Kids para Móvil y Tablet
                  </div>
                  <h3 className="font-display font-black text-xl text-white">
                    RIFFAN-KIDS.apk
                  </h3>
                  <p className="text-xs text-sky-200">
                    Giro horizontal/vertical automático, botones táctiles gigantes, sonido envolvente y modo viaje offline.
                  </p>
                </div>

                <KidsSquishButton
                  onClick={() => void handleDownload('mobile')}
                  disabled={downloading === 'mobile'}
                  className="!min-h-[44px] h-11 px-5 rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shrink-0 shadow-lg"
                >
                  {downloading === 'mobile' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Descargar APK Móvil</span>
                </KidsSquishButton>
              </div>

              {/* Mobile QR & Link */}
              <div className="p-4 rounded-2xl bg-[#090D22] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-300">
                  <Info className="w-4 h-4" />
                  <span>Enlace y Código QR para escanear desde el móvil</span>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#121A3D] border border-white/10">
                  <span className="flex-1 font-mono text-xs text-sky-300 break-all select-all font-bold">
                    {mobileUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(mobileUrl)}
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedUrl === mobileUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl === mobileUrl ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <div className="p-2 rounded-xl bg-white shrink-0">
                    <QRCodeSVG value={mobileUrl} size={88} level="M" />
                  </div>
                  <div className="text-xs text-zinc-300 space-y-1">
                    <span className="font-bold text-white block">Escanea para instalar:</span>
                    <span>Abre la cámara de tu teléfono o tablet Android, enfoca el código y pulsa descargar para instalar la aplicación de inmediato.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
