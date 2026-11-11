import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X, Share, MoreVertical } from 'lucide-react';
import { AppLanguage } from '../types';
import { useOnlineStatus, usePWAInstall } from '../utils/usePWAInstall';
import { NaimBrandLogo } from './NaimBrandLogo';
import { triggerHaptic } from '../utils/haptics';

const DISMISS_KEY = 'naimcine_pwa_banner_dismissed_v1';

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
        } rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-emerald-500/35 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
        title={lang === 'es' ? 'Instalar App NAIM CINE' : 'Install NAIM CINE App'}
      >
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span className={compact ? 'hidden md:inline' : 'inline'}>
          {lang === 'es' ? 'Instalar App' : 'Install App'}
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

interface PWAInstallNotificationProps {
  lang: AppLanguage;
}

/**
 * Automatic Android / Mobile PWA Install Notification Toast.
 * Pops up automatically when `beforeinstallprompt` fires or on mobile browsers
 * when not yet running as an installed standalone app.
 */
export const PWAInstallNotification: React.FC<PWAInstallNotificationProps> = ({
  lang,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  useEffect(() => {
    if (isInstalled || dismissed) {
      setVisible(false);
      return;
    }
    if (isInstallable || isAndroid || isIOS) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, isAndroid, isIOS, dismissed]);

  if (isInstalled) return null;

  const handleDismiss = () => {
    triggerHaptic('light');
    setDismissed(true);
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  const handleInstallNow = async () => {
    triggerHaptic('success');
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setVisible(false);
      }
      return;
    }
    setShowManualGuide(true);
  };

  return (
    <>
      {visible && (
        <div
          role="region"
          aria-label="Instalar aplicación NAIM CINE"
          className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-5 sm:w-[390px] z-40 rounded-2xl bg-[#12141D]/95 backdrop-blur-xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 flex items-center gap-3 animate-room-warp"
        >
          <NaimBrandLogo size={44} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
                {lang === 'es' ? 'Instala la App NAIM CINE' : 'Install NAIM CINE App'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5 line-clamp-2">
              {lang === 'es'
                ? 'Acceso directo en Android/iOS, pantalla completa y vídeo flotante.'
                : 'Direct home-screen launch, fullscreen & floating video.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallNow}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-95 text-xs font-semibold text-white whitespace-nowrap cursor-pointer transition-all"
            >
              {lang === 'es' ? 'Instalar' : 'Install'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Cerrar aviso de instalación"
              className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/12 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-[#12141D] border border-white/15 p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <NaimBrandLogo size={42} />
            <div>
              <h3 className="font-display font-bold text-base text-white">
                {lang === 'es' ? 'Instalar NAIM CINE' : 'Install NAIM CINE'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isIOS
                  ? 'iPhone / iPad (Safari)'
                  : isAndroid
                    ? 'Android (Chrome)'
                    : 'Web App Nativa'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/12 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="space-y-3 text-xs sm:text-sm text-zinc-300 bg-[#090A0F] p-4 rounded-2xl border border-white/[0.08]">
            <div className="flex items-start gap-2.5">
              <Share className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
              <p>
                1. Pulsa el botón <strong>Compartir</strong> en la barra de Safari.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Download className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" />
              <p>
                2. Desliza y toca <strong>«Añadir a pantalla de inicio»</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs sm:text-sm text-zinc-300 bg-[#090A0F] p-4 rounded-2xl border border-white/[0.08]">
            <div className="flex items-start gap-2.5">
              <MoreVertical className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
              <p>
                1. Abre <strong className="text-white">naimcine.ai.studio</strong> en{' '}
                <strong>Google Chrome</strong> y toca el menú <strong>⋮</strong> arriba a la derecha.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Download className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" />
              <p>
                2. Toca <strong>«Instalar aplicación»</strong> o{' '}
                <strong>«Añadir a pantalla de inicio»</strong> para tener el icono oficial en tu Android.
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white cursor-pointer transition-colors"
        >
          {lang === 'es' ? 'Entendido' : 'Got it'}
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
      <span className="h-2 w-2 rounded-full bg-zinc-950 animate-pulse" />
      <span>
        {lang === 'es'
          ? 'Sin conexión — Reconectando automáticamente...'
          : 'Offline — Reconnecting automatically...'}
      </span>
    </div>
  );
};
