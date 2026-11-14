import React, { useState } from 'react';
import { Download, Smartphone, X, Share, MoreVertical, Monitor, Tv } from 'lucide-react';
import { AppLanguage } from '../types';
import { useOnlineStatus, usePWAInstall } from '../utils/usePWAInstall';
import { NaimBrandLogo } from './NaimBrandLogo';
import { triggerHaptic } from '../utils/haptics';

interface PWAInstallButtonProps {
  lang: AppLanguage;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang,
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showManualGuide, setShowManualGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    triggerHaptic('medium');
    if (isInstallable) {
      await install();
      return;
    }
    setShowManualGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`min-h-[40px] ${
          compact ? 'px-2.5 sm:px-3' : 'px-3.5'
        } rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
        title={lang === 'es' ? 'Descargar App NAIM CINE' : 'Download NAIM CINE App'}
      >
        <Download className="w-3.5 h-3.5 text-[#BF94FF]" />
        <span className={compact ? 'hidden md:inline' : 'inline'}>
          {lang === 'es' ? 'Descargar App' : 'Download App'}
        </span>
      </button>

      {showManualGuide && (
        <PWAInstallGuideModal
          lang={lang}
          isIOS={isIOS}
          isAndroid={isAndroid}
          onClose={() => setShowManualGuide(false)}
        />
      )}
    </>
  );
};

interface PWAInstallLandingCardProps {
  lang: AppLanguage;
  isDesktop?: boolean;
}

/**
 * Direct inline App Download card embedded inside the initial Landing Page (LobbyScreen).
 * Replaces the floating popup toast and top-bar install button.
 */
export const PWAInstallLandingCard: React.FC<PWAInstallLandingCardProps> = ({
  lang,
  isDesktop = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showManualGuide, setShowManualGuide] = useState(false);

  if (isInstalled) return null;

  const handleInstallNow = async () => {
    triggerHaptic('success');
    if (isInstallable) {
      await install();
      return;
    }
    setShowManualGuide(true);
  };

  return (
    <>
      <div
        role="region"
        aria-label={
          lang === 'es' ? 'Descargar aplicación NAIM CINE' : 'Download NAIM CINE App'
        }
        className={`rounded-3xl bg-[#18181B]/95 backdrop-blur-xl border border-white/[0.09] p-4 ${
          isDesktop ? 'lg:p-5 lg:flex-row lg:items-center' : ''
        } flex flex-col justify-between gap-4 shadow-[0_20px_60px_rgba(0,0,0,0.65)]`}
      >
        <div className="flex items-start gap-3.5 min-w-0">
          <NaimBrandLogo
            size={46}
            className="shrink-0 shadow-[0_0_24px_rgba(145,70,255,0.28)]"
          />

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1 text-zinc-200 font-medium">
                <Smartphone className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                <span>APK Android</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>Google TV</span>
              <span aria-hidden="true">·</span>
              <span>iPhone &amp; iPad</span>
              {isDesktop && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Monitor className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>PC / Mac</span>
                  </span>
                </>
              )}
            </div>

            <h2 className="font-display font-bold text-sm text-white">
              {lang === 'es'
                ? 'Instala NAIM CINE · Misma experiencia en Web, Android y Google TV'
                : 'Install NAIM CINE · Unified Web, Android Mobile & Google TV Apps'}
            </h2>

            <p className="text-xs text-zinc-400 leading-relaxed">
              {lang === 'es'
                ? 'Descarga el APK para Móvil Android o Google TV / Chromecast con el mismo diseño en directo, motor Media3 HD, Fútbol y TDT.'
                : 'Download the native Android Mobile or Google TV / Chromecast APK with the exact same live interface, Media3 HD engine, Sports & Live TV.'}
            </p>
          </div>
        </div>

        <div
          className={`flex ${
            isDesktop ? 'flex-row flex-wrap items-center shrink-0' : 'flex-col items-stretch w-full'
          } gap-2.5`}
        >
          <a
            href="/NAIM-CINE.apk?v=14"
            download="NAIM-CINE.apk"
            onClick={() => triggerHaptic('success')}
            className="min-h-11 px-5 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] active:scale-[0.98] text-white font-display font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all shadow-[0_12px_32px_rgba(145,70,255,0.34)]"
          >
            <Download className="w-4 h-4 text-white shrink-0" />
            <span>
              {lang === 'es' ? 'APK Móvil Android (Nativo HD)' : 'Android Mobile APK (Native HD)'}
            </span>
          </a>

          <a
            href="/NAIM-CINE-TV.apk?v=14"
            download="NAIM-CINE-TV.apk"
            onClick={() => triggerHaptic('success')}
            className="min-h-11 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 active:scale-[0.98] text-white font-display font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all"
          >
            <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
            <span>
              {lang === 'es'
                ? 'APK Google TV / Chromecast'
                : 'Google TV / Chromecast APK'}
            </span>
          </a>

          <button
            type="button"
            onClick={handleInstallNow}
            className="min-h-11 px-4 rounded-2xl bg-white hover:bg-zinc-200 active:scale-[0.98] text-[#0E0E10] font-display font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all"
          >
            <Smartphone className="w-4 h-4 text-[#0E0E10] shrink-0" />
            <span>
              {lang === 'es' ? 'iPhone / PC' : 'iPhone / PC'}
            </span>
          </button>
        </div>
      </div>

      {showManualGuide && (
        <PWAInstallGuideModal
          lang={lang}
          isIOS={isIOS}
          isAndroid={isAndroid}
          onClose={() => setShowManualGuide(false)}
        />
      )}
    </>
  );
};

interface PWAInstallGuideModalProps {
  lang: AppLanguage;
  isIOS: boolean;
  isAndroid: boolean;
  onClose: () => void;
}

const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  lang,
  isIOS,
  isAndroid,
  onClose,
}) => {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#18181B] border-t sm:border border-white/12 p-6 pb-safe shadow-[0_28px_90px_rgba(0,0,0,0.92)] space-y-4"
      >
        <div className="sm:hidden pt-0.5">
          <div className="sheet-handle" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <NaimBrandLogo size={42} />
            <div>
              <h3 className="font-display font-bold text-base text-white">
                {lang === 'es' ? 'Descargar NAIM CINE' : 'Download NAIM CINE'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isIOS
                  ? 'iPhone / iPad (Safari)'
                  : isAndroid
                    ? 'Android · APK o Chrome'
                    : lang === 'es'
                      ? 'Android APK · iPhone · PC'
                      : 'Android APK · iPhone · PC'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isIOS && (
          <div className="p-3.5 rounded-2xl bg-[#0E0E10] border border-white/[0.09] space-y-2.5">
            <p className="text-xs text-zinc-300 leading-relaxed">
              {lang === 'es' ? (
                <>
                  <strong>Google TV &amp; Chromecast (Mando físico TV):</strong> Descarga{' '}
                  <span className="font-mono text-white">NAIM-CINE-TV.apk</span> y envíalo a tu tele (Send Files to TV / USB / Downloader{' '}
                  <span className="font-mono text-[#BF94FF]">
                    {typeof window !== 'undefined' ? `${window.location.host}/tv.apk` : '/tv.apk'}
                  </span>
                  ).
                </>
              ) : (
                <>
                  <strong>Google TV &amp; Chromecast (Physical TV Remote):</strong> Download{' '}
                  <span className="font-mono text-white">NAIM-CINE-TV.apk</span> and sideload to your TV.
                </>
              )}
            </p>
            <a
              href="/NAIM-CINE.apk?v=14"
              download="NAIM-CINE.apk"
              onClick={() => triggerHaptic('success')}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'es'
                  ? 'Descargar APK Móvil Android (NAIM-CINE.apk)'
                  : 'Download Android Mobile APK (NAIM-CINE.apk)'}
              </span>
            </a>

            <a
              href="/NAIM-CINE-TV.apk?v=14"
              download="NAIM-CINE-TV.apk"
              onClick={() => triggerHaptic('success')}
              className="w-full min-h-[42px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/12 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
              <span>
                {lang === 'es'
                  ? 'Descargar APK Google TV / Chromecast'
                  : 'Download Google TV / Chromecast APK'}
              </span>
            </a>
          </div>
        )}

        {isIOS ? (
          <div className="space-y-3 text-xs sm:text-sm text-zinc-300 bg-[#0E0E10] p-4 rounded-2xl border border-white/[0.08]">
            <div className="flex items-start gap-2.5">
              <Share className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <p>
                {lang === 'es' ? (
                  <>
                    1. Pulsa el botón <strong>Compartir</strong> en la barra inferior de Safari.
                  </>
                ) : (
                  <>
                    1. Tap the <strong>Share</strong> button in the Safari toolbar.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Download className="w-4 h-4 text-[#9146FF] shrink-0 mt-0.5" />
              <p>
                {lang === 'es' ? (
                  <>
                    2. Desliza hacia abajo y toca <strong>«Añadir a pantalla de inicio»</strong>.
                  </>
                ) : (
                  <>
                    2. Scroll down and tap <strong>“Add to Home Screen”</strong>.
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs sm:text-sm text-zinc-300 bg-[#0E0E10] p-4 rounded-2xl border border-white/[0.08]">
            <div className="flex items-start gap-2.5">
              <MoreVertical className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <p>
                {lang === 'es' ? (
                  <>
                    <strong>En PC / Mac o Chrome sin APK:</strong> toca el icono de instalar en la barra de{' '}
                    <strong className="text-white">
                      {typeof window !== 'undefined' ? window.location.host : 'NAIM CINE'}
                    </strong>{' '}
                    o el menú <strong>⋮ → Instalar aplicación</strong>.
                  </>
                ) : (
                  <>
                    <strong>On PC / Mac or Chrome:</strong> click the install icon in the address bar or menu{' '}
                    <strong>⋮ → Install app</strong>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs sm:text-sm font-semibold text-white cursor-pointer transition-colors"
        >
          {lang === 'es' ? 'Cerrar' : 'Close'}
        </button>
      </div>
    </div>
  );
};

export const OfflineIndicator: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-zinc-950" />
      <span>
        {lang === 'es'
          ? 'Sin conexión — Reconectando automáticamente...'
          : 'Offline — Reconnecting automatically...'}
      </span>
    </div>
  );
};
