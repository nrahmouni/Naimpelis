import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  MoreVertical,
  Monitor,
  Tv,
  Loader2,
  Check,
} from 'lucide-react';
import { AppLanguage } from '../types';
import { useOnlineStatus, usePWAInstall } from '../utils/usePWAInstall';
import { triggerHaptic } from '../utils/haptics';
import { triggerApkDownload } from '../utils/apkDownload';
import { pickLang } from '../utils/i18n';
import { isSmartTvBrowser } from '../utils/shortLink';
import { BottomSheet, SecondaryButton } from './ui/DesignSystem';

interface PWAInstallButtonProps {
  lang: AppLanguage;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang,
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showSheet, setShowSheet] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    triggerHaptic('medium');
    if (isInstallable) {
      await install();
      return;
    }
    setShowSheet(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`min-h-12 ${
          compact ? 'px-3' : 'px-4'
        } rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
      >
        <Download className="w-4 h-4 text-[#BF94FF]" />
        <span>
          {pickLang(lang, {
            es: 'Instalar RiffanTV',
            ca: 'Instal·lar RiffanTV',
            en: 'Install RiffanTV',
          })}
        </span>
      </button>

      <PWAInstallOptionsSheet
        isOpen={showSheet}
        onClose={() => setShowSheet(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

interface PWAInstallLandingCardProps {
  lang: AppLanguage;
  isDesktop?: boolean;
  alwaysShow?: boolean;
}

export const PWAInstallLandingCard: React.FC<PWAInstallLandingCardProps> = ({
  lang,
  alwaysShow = false,
}) => {
  const { isInstalled, isIOS, isAndroid } = usePWAInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isInstalled && !alwaysShow) return null;

  return (
    <>
      <SecondaryButton fullWidth onClick={() => setSheetOpen(true)}>
        <Download className="w-4 h-4 text-[#BF94FF]" />
        <span>
          {pickLang(lang, {
            es: 'Instalar RiffanTV',
            ca: 'Instal·lar RiffanTV',
            en: 'Install RiffanTV',
            zh: '安装 RiffanTV',
          })}
        </span>
      </SecondaryButton>

      <PWAInstallOptionsSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

export interface PWAInstallOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  isIOS?: boolean;
  isAndroid?: boolean;
}

export const PWAInstallOptionsSheet: React.FC<PWAInstallOptionsSheetProps> = ({
  isOpen,
  onClose,
  lang,
  isIOS: propIsIos,
  isAndroid: propIsAndroid,
}) => {
  const pwa = usePWAInstall();
  const isIOS = propIsIos ?? pwa.isIOS;
  const isAndroid = propIsAndroid ?? pwa.isAndroid;
  const isTvDevice = typeof window !== 'undefined' && isSmartTvBrowser();

  const [apkDownloading, setApkDownloading] = useState<'mobile' | 'tv' | null>(null);
  const [apkDone, setApkDone] = useState<'mobile' | 'tv' | null>(null);
  const [apkError, setApkError] = useState<string | null>(null);
  const [showWebSteps, setShowWebSteps] = useState(false);

  const recommendedDevice: 'android' | 'tv' | 'web' = isTvDevice
    ? 'tv'
    : isAndroid
    ? 'android'
    : 'web';

  const handleDownloadApk = async (
    flavor: 'mobile' | 'tv',
    url: string,
    filename: string
  ) => {
    if (apkDownloading) return;
    triggerHaptic('medium');
    setApkDownloading(flavor);
    setApkError(null);
    const res = await triggerApkDownload(url, filename);
    setApkDownloading(null);
    if (res.ok) {
      setApkDone(flavor);
      setTimeout(() => setApkDone(null), 3000);
    } else {
      setApkError(
        res.error ||
          pickLang(lang, {
            es: 'No se pudo iniciar la descarga',
            ca: 'No s’ha pogut iniciar la descàrrega',
            en: 'Could not start download',
          })
      );
    }
  };

  const handleInstallWeb = async () => {
    triggerHaptic('medium');
    if (pwa.isInstallable) {
      await pwa.install();
      return;
    }
    setShowWebSteps((v) => !v);
  };

  const cardClass = (highlighted: boolean) =>
    `w-full min-h-14 px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.98] transition-all duration-150 ${
      highlighted
        ? 'bg-[#9146FF]/16 border-[#9146FF]/60 text-white'
        : 'bg-white/[0.045] hover:bg-white/[0.09] border-white/[0.09] text-white'
    }`;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-md"
      icon={<Download className="w-5 h-5" />}
      title={pickLang(lang, {
        es: 'Instalar RiffanTV',
        ca: 'Instal·lar RiffanTV',
        en: 'Install RiffanTV',
        zh: '安装 RiffanTV',
      })}
      subtitle={pickLang(lang, {
        es: 'Elige tu dispositivo para tener la app siempre a mano',
        ca: 'Tria el teu dispositiu per tenir l’app sempre a mà',
        en: 'Choose your device to install the app',
        zh: '选择您的设备随时快速访问',
      })}
    >
      <div className="space-y-2.5">
        {/* 1. Android */}
        <button
          type="button"
          onClick={() =>
            void handleDownloadApk('mobile', '/RIFFAN-TV.apk?v=300', 'RIFFAN-TV.apk')
          }
          className={cardClass(recommendedDevice === 'android')}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
              {apkDownloading === 'mobile' ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#BF94FF]" />
              ) : apkDone === 'mobile' ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Smartphone className="w-5 h-5 text-[#BF94FF]" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Android</span>
              <span className="block text-xs text-zinc-400">
                {pickLang(lang, {
                  es: 'Descarga directa para teléfono o tablet',
                  ca: 'Descàrrega directa per a telèfon o tauleta',
                  en: 'Direct install for phone or tablet',
                })}
              </span>
            </span>
          </span>
          {recommendedDevice === 'android' && (
            <span className="px-2.5 py-1 rounded-full bg-[#9146FF] text-[10px] font-bold text-white shrink-0">
              {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
            </span>
          )}
        </button>

        {/* 2. Google TV / Chromecast */}
        <button
          type="button"
          onClick={() =>
            void handleDownloadApk('tv', '/RIFFAN-TV-TV.apk?v=300', 'RIFFAN-TV-TV.apk')
          }
          className={cardClass(recommendedDevice === 'tv')}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
              {apkDownloading === 'tv' ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#BF94FF]" />
              ) : apkDone === 'tv' ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Tv className="w-5 h-5 text-[#BF94FF]" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Google TV / Chromecast</span>
              <span className="block text-xs text-zinc-400">
                {pickLang(lang, {
                  es: 'Adaptada para televisor y mando a distancia',
                  ca: 'Adaptada per a televisor i comandament',
                  en: 'Tailored for TV screen & remote control',
                })}
              </span>
            </span>
          </span>
          {recommendedDevice === 'tv' && (
            <span className="px-2.5 py-1 rounded-full bg-[#9146FF] text-[10px] font-bold text-white shrink-0">
              {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
            </span>
          )}
        </button>

        {/* 3. iPhone / PC */}
        <button
          type="button"
          onClick={() => void handleInstallWeb()}
          className={cardClass(recommendedDevice === 'web')}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 text-[#BF94FF]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">iPhone / PC</span>
              <span className="block text-xs text-zinc-400">
                {pickLang(lang, {
                  es: 'Acceso rápido desde navegador en pantalla de inicio',
                  ca: 'Accés ràpid des del navegador a la pantalla d’inici',
                  en: 'Quick browser install on your home screen',
                })}
              </span>
            </span>
          </span>
          {recommendedDevice === 'web' && (
            <span className="px-2.5 py-1 rounded-full bg-[#9146FF] text-[10px] font-bold text-white shrink-0">
              {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
            </span>
          )}
        </button>

        {apkError && (
          <p className="text-xs text-rose-300 px-1 pt-1">{apkError}</p>
        )}

        {showWebSteps && (
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-300 space-y-2">
            {isIOS ? (
              <>
                <div className="flex items-center gap-2">
                  <Share className="w-4 h-4 text-[#BF94FF] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Pulsa Compartir en Safari y elige «Añadir a pantalla de inicio».',
                      ca: 'Prem Compartir a Safari i tria «Afegir a la pantalla d’inici».',
                      en: 'Tap Share in Safari and pick "Add to Home Screen".',
                    })}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <MoreVertical className="w-4 h-4 text-[#BF94FF] shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: 'Abre el menú del navegador y pulsa «Instalar aplicación».',
                    ca: 'Obre el menú del navegador i prem «Instal·lar aplicació».',
                    en: 'Open your browser menu and select "Install app".',
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};

export const OfflineIndicator: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-zinc-950" />
      <span>
        {pickLang(lang, {
          es: 'Sin conexión — Reconectando...',
          ca: 'Sense connexió — Reconnectant...',
          en: 'Offline — Reconnecting...',
          zh: '离线 — 正在重连...',
        })}
      </span>
    </div>
  );
};
