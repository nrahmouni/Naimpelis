import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  Download,
  Loader2,
  QrCode,
  RotateCw,
  Smartphone,
  Tablet,
  Tv,
} from 'lucide-react';
import { triggerApkDownload } from '../../utils/apkDownload';

interface LatestApkSizes {
  kidsMobileUrl?: string;
  kidsMobileBytes?: number;
  kidsTvUrl?: string;
  kidsTvBytes?: number;
}

function formatApkSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'APK oficial';
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const KidsApkInstallCard: React.FC = () => {
  const [sizes, setSizes] = useState<LatestApkSizes>({});
  const [downloading, setDownloading] = useState<'mobile' | 'tv' | null>(null);
  const [done, setDone] = useState<'mobile' | 'tv' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [qrTarget, setQrTarget] = useState<'none' | 'tv' | 'mobile'>('none');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://riffantv.ai.studio';

  useEffect(() => {
    let active = true;
    fetch('/api/app/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setSizes({
          kidsMobileUrl: data.kidsMobile?.apkUrl,
          kidsMobileBytes: data.kidsMobile?.sizeBytes,
          kidsTvUrl: data.kidsTv?.apkUrl,
          kidsTvBytes: data.kidsTv?.sizeBytes,
        });
      })
      .catch(() => {
        // Offline / fallback uses relative APK URLs safely
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDownload = async (kind: 'mobile' | 'tv') => {
    if (downloading) return;
    setErrorMsg('');
    setDownloading(kind);
    const apkPath =
      kind === 'tv' ? '/RIFFAN-KIDS-TV.apk?v=300' : '/RIFFAN-KIDS.apk?v=300';
    const filename =
      kind === 'tv' ? 'RIFFAN-KIDS-TV.apk' : 'RIFFAN-KIDS.apk';

    const result = await triggerApkDownload(apkPath, filename);
    setDownloading(null);
    if (result.ok) {
      setDone(kind);
    } else {
      setErrorMsg(result.error || 'No se pudo descargar el paquete APK.');
    }
  };

  const activeQrUrl =
    qrTarget === 'tv'
      ? sizes.kidsTvUrl || `${origin}/RIFFAN-KIDS-TV.apk?v=300`
      : sizes.kidsMobileUrl || `${origin}/RIFFAN-KIDS.apk?v=300`;

  const handleCopyQrLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(activeQrUrl);
        setCopiedUrl(true);
        window.setTimeout(() => setCopiedUrl(false), 2000);
      }
    } catch {
      // ignore clipboard permission errors
    }
  };

  return (
    <div className="space-y-2.5 p-3 rounded-2xl bg-[#0D1226] border border-sky-400/25">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-200">
          <Tv className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Apps APK: Google TV, Tablet y Móvil</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 rounded-lg px-2 py-0.5">
          <RotateCw className="w-3 h-3" />
          <span>Giro horizontal + D-Pad TV</span>
        </span>
      </div>

      <p className="text-[11px] text-zinc-300 leading-snug">
        Instala Riffan Kids como aplicación directa sin navegador en televisor Google TV o en teléfonos y tablets Android.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* APK Móvil y Tablet Android */}
        <button
          type="button"
          data-tv-focusable="true"
          disabled={downloading !== null}
          onClick={() => void handleDownload('mobile')}
          className="p-2.5 rounded-xl bg-[#162044] hover:bg-[#1E2C5E] border border-sky-300/30 text-start flex items-center justify-between gap-2 cursor-pointer disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-amber-300 outline-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-400/20 text-sky-300 flex items-center justify-center shrink-0">
              {downloading === 'mobile' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : done === 'mobile' ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-white truncate">APK Móvil / Tablet</div>
              <div className="text-[10px] text-sky-200/80 flex items-center gap-1 truncate">
                <Tablet className="w-3 h-3 shrink-0" />
                <span>{formatApkSize(sizes.kidsMobileBytes)}</span>
              </div>
            </div>
          </div>
          <Download className="w-4 h-4 text-amber-300 shrink-0" />
        </button>

        {/* APK Google TV / Android TV */}
        <button
          type="button"
          data-tv-focusable="true"
          disabled={downloading !== null}
          onClick={() => void handleDownload('tv')}
          className="p-2.5 rounded-xl bg-[#162044] hover:bg-[#1E2C5E] border border-amber-300/35 text-start flex items-center justify-between gap-2 cursor-pointer disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-amber-300 outline-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              {downloading === 'tv' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : done === 'tv' ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : (
                <Tv className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-white truncate">APK Google TV</div>
              <div className="text-[10px] text-amber-200/80 truncate">
                Mando D-Pad · {formatApkSize(sizes.kidsTvBytes)}
              </div>
            </div>
          </div>
          <Download className="w-4 h-4 text-amber-300 shrink-0" />
        </button>
      </div>

      {/* QR Code Switcher for instant TV Downloader / Mobile scan */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => setQrTarget((curr) => (curr === 'tv' ? 'none' : 'tv'))}
          className={`h-8 px-2.5 rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer border focus-visible:ring-2 focus-visible:ring-amber-300 ${
            qrTarget === 'tv'
              ? 'bg-amber-400 text-slate-950 border-amber-200'
              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>QR Google TV</span>
        </button>
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => setQrTarget((curr) => (curr === 'mobile' ? 'none' : 'mobile'))}
          className={`h-8 px-2.5 rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer border focus-visible:ring-2 focus-visible:ring-amber-300 ${
            qrTarget === 'mobile'
              ? 'bg-sky-400 text-slate-950 border-sky-200'
              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>QR Móvil / Tablet</span>
        </button>
      </div>

      {qrTarget !== 'none' && (
        <div className="p-2.5 rounded-xl bg-[#090D1C] border border-white/15 flex items-center gap-3">
          <div className="p-1.5 rounded-xl bg-white shrink-0">
            <QRCodeSVG value={activeQrUrl} size={76} level="M" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[11px] font-black text-white">
              {qrTarget === 'tv'
                ? 'Escanea desde tu Google TV o app Downloader'
                : 'Escanea desde tu móvil o tablet Android'}
            </div>
            <div className="text-[10px] text-sky-200/80 break-all line-clamp-2">
              {activeQrUrl}
            </div>
            <button
              type="button"
              onClick={() => void handleCopyQrLink()}
              className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-black text-amber-200 inline-flex items-center gap-1 cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
              <span>{copiedUrl ? 'Enlace copiado' : 'Copiar enlace APK'}</span>
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <p className="text-[11px] font-bold text-rose-300">{errorMsg}</p>
      )}
    </div>
  );
};
