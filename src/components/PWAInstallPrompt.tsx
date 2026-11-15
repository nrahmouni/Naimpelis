import React, { useRef, useState } from 'react';
import { Download, Smartphone, X, Share, MoreVertical, Monitor, Tv, Loader2, Check } from 'lucide-react';
import { AppLanguage } from '../types';
import { useOnlineStatus, usePWAInstall } from '../utils/usePWAInstall';
import { NaimBrandLogo } from './NaimBrandLogo';
import { triggerHaptic } from '../utils/haptics';
import { triggerApkDownload } from '../utils/apkDownload';
import { pickLang } from '../utils/i18n';
import { useFocusTrap } from '../utils/useFocusTrap';

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
        title={pickLang(lang, {
          es: 'Descargar App RiffanTV',
          ca: 'Descarregar App RiffanTV',
          en: 'Download RiffanTV App',
        })}
      >
        <Download className="w-3.5 h-3.5 text-[#BF94FF]" />
        <span className={compact ? 'hidden md:inline' : 'inline'}>
          {pickLang(lang, {
            es: 'Descargar App',
            ca: 'Descarregar App',
            en: 'Download App',
          })}
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
  const [apkDownloading, setApkDownloading] = useState<'mobile' | 'tv' | null>(null);
  const [apkDone, setApkDone] = useState<'mobile' | 'tv' | null>(null);
  const [apkError, setApkError] = useState<string | null>(null);

  if (isInstalled) return null;

  const handleDownloadApk = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    flavor: 'mobile' | 'tv',
    url: string,
    filename: string
  ) => {
    e.preventDefault();
    if (apkDownloading) return;
    setApkDownloading(flavor);
    setApkError(null);
    const res = await triggerApkDownload(url, filename);
    setApkDownloading(null);
    if (res.ok) {
      setApkDone(flavor);
      setTimeout(() => setApkDone(null), 3200);
    } else {
      setApkError(
        res.error ||
          pickLang(lang, {
            es: 'Error al descargar',
            ca: 'Error en descarregar',
            en: 'Download failed',
          })
      );
    }
  };

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
        aria-label={pickLang(lang, {
          es: 'Descargar aplicación RiffanTV',
          ca: 'Descarregar aplicació RiffanTV',
          en: 'Download RiffanTV App',
        })}
        className={`rounded-3xl nc-specular-surface backdrop-blur-xl border border-white/[0.1] p-4 ${
          isDesktop ? 'lg:p-5 lg:flex-row lg:items-center' : ''
        } flex flex-col justify-between gap-4 shadow-[0_24px_64px_rgba(0,0,0,0.68)]`}
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
              {pickLang(lang, {
                es: 'Instala RiffanTV · Misma experiencia en Web, Android y Google TV',
                ca: 'Instal·la RiffanTV · Mateixa experiència a Web, Android i Google TV',
                en: 'Install RiffanTV · Unified Web, Android Mobile & Google TV Apps',
              })}
            </h2>

            <p className="text-xs text-zinc-400 leading-relaxed">
              {pickLang(lang, {
                es: 'Descarga el APK para Móvil Android o Google TV / Chromecast con el mismo diseño en directo, motor Media3 HD, Fútbol y TDT.',
                ca: "Descarrega l'APK per a Mòbil Android o Google TV / Chromecast amb el mateix disseny en directe, motor Media3 HD, Futbol i TDT.",
                en: 'Download the native Android Mobile or Google TV / Chromecast APK with the exact same live interface, Media3 HD engine, Sports & Live TV.',
              })}
            </p>
          </div>
        </div>

        <div
          className={`flex ${
            isDesktop ? 'flex-row flex-wrap items-center shrink-0' : 'flex-col items-stretch w-full'
          } gap-2.5`}
        >
          <a
            href="/NAIM-CINE.apk?v=300"
            download="NAIM-CINE.apk"
            onClick={(e) => handleDownloadApk(e, 'mobile', '/NAIM-CINE.apk?v=300', 'NAIM-CINE.apk')}
            className="min-h-11 px-5 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 active:scale-[0.98] text-white font-display font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all shadow-[0_12px_32px_rgba(145,70,255,0.34),inset_0_1px_0_rgba(255,255,255,0.22)]"
          >
            {apkDownloading === 'mobile' ? (
              <Loader2 className="w-4 h-4 text-white shrink-0 animate-spin" />
            ) : apkDone === 'mobile' ? (
              <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : (
              <Download className="w-4 h-4 text-white shrink-0" />
            )}
            <span>
              {apkDownloading === 'mobile'
                ? pickLang(lang, {
                    es: 'Descargando APK...',
                    ca: 'Descarregant APK...',
                    en: 'Downloading APK...',
                  })
                : apkDone === 'mobile'
                ? pickLang(lang, {
                    es: 'APK Móvil Descargada',
                    ca: 'APK Mòbil Descarregada',
                    en: 'Mobile APK Downloaded',
                  })
                : pickLang(lang, {
                    es: 'APK Móvil Android (Nativo HD)',
                    ca: 'APK Mòbil Android (Nadiu HD)',
                    en: 'Android Mobile APK (Native HD)',
                  })}
            </span>
          </a>

          <a
            href="/NAIM-CINE-TV.apk?v=300"
            download="NAIM-CINE-TV.apk"
            onClick={(e) => handleDownloadApk(e, 'tv', '/NAIM-CINE-TV.apk?v=300', 'NAIM-CINE-TV.apk')}
            className="min-h-11 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 active:scale-[0.98] text-white font-display font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all"
          >
            {apkDownloading === 'tv' ? (
              <Loader2 className="w-4 h-4 text-[#BF94FF] shrink-0 animate-spin" />
            ) : apkDone === 'tv' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
            )}
            <span>
              {apkDownloading === 'tv'
                ? pickLang(lang, {
                    es: 'Descargando TV...',
                    ca: 'Descarregant TV...',
                    en: 'Downloading TV...',
                  })
                : apkDone === 'tv'
                ? pickLang(lang, {
                    es: 'APK TV Descargada',
                    ca: 'APK TV Descarregada',
                    en: 'TV APK Downloaded',
                  })
                : pickLang(lang, {
                    es: 'APK Google TV / Chromecast',
                    ca: 'APK Google TV / Chromecast',
                    en: 'Google TV / Chromecast APK',
                  })}
            </span>
          </a>

          <button
            type="button"
            onClick={handleInstallNow}
            className="min-h-11 px-4 rounded-2xl bg-white hover:bg-zinc-200 active:scale-[0.98] text-[#0E0E10] font-display font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all"
          >
            <Smartphone className="w-4 h-4 text-[#0E0E10] shrink-0" />
            <span>iPhone / PC</span>
          </button>
        </div>
      </div>

      {apkError && (
        <div className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
          {apkError}
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(true, onClose, dialogRef);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={pickLang(lang, {
          es: 'Descargar RiffanTV',
          ca: 'Descarregar RiffanTV',
          en: 'Download RiffanTV',
        })}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#18181B] border-t sm:border border-white/12 p-6 pb-safe shadow-[0_28px_90px_rgba(0,0,0,0.92)] space-y-4 outline-none"
      >
        <div className="sm:hidden pt-0.5">
          <div className="sheet-handle" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <NaimBrandLogo size={42} />
            <div>
              <h3 className="font-display font-bold text-base text-white">
                {pickLang(lang, {
                  es: 'Descargar RiffanTV',
                  ca: 'Descarregar RiffanTV',
                  en: 'Download RiffanTV',
                })}
              </h3>
              <p className="text-xs text-zinc-400">
                {isIOS
                  ? 'iPhone / iPad (Safari)'
                  : isAndroid
                    ? pickLang(lang, {
                        es: 'Android · APK o Chrome',
                        ca: 'Android · APK o Chrome',
                        en: 'Android · APK or Chrome',
                      })
                    : 'Android APK · iPhone · PC'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, {
              es: 'Cerrar',
              ca: 'Tancar',
              en: 'Close',
            })}
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
              ) : lang === 'ca' ? (
                <>
                  <strong>Google TV &amp; Chromecast (Comandament físic TV):</strong> Descarrega{' '}
                  <span className="font-mono text-white">NAIM-CINE-TV.apk</span> i envia-ho a la teva tele (Send Files to TV / USB / Downloader{' '}
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
              href="/NAIM-CINE.apk?v=300"
              download="NAIM-CINE.apk"
              onClick={(e) => {
                e.preventDefault();
                void triggerApkDownload('/NAIM-CINE.apk?v=300', 'NAIM-CINE.apk');
              }}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Descargar APK Móvil Android (NAIM-CINE.apk)',
                  ca: 'Descarregar APK Mòbil Android (NAIM-CINE.apk)',
                  en: 'Download Android Mobile APK (NAIM-CINE.apk)',
                })}
              </span>
            </a>

            <a
              href="/NAIM-CINE-TV.apk?v=300"
              download="NAIM-CINE-TV.apk"
              onClick={(e) => {
                e.preventDefault();
                void triggerApkDownload('/NAIM-CINE-TV.apk?v=300', 'NAIM-CINE-TV.apk');
              }}
              className="w-full min-h-[42px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/12 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Descargar APK Google TV / Chromecast',
                  ca: 'Descarregar APK Google TV / Chromecast',
                  en: 'Download Google TV / Chromecast APK',
                })}
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
                ) : lang === 'ca' ? (
                  <>
                    1. Prem el botó <strong>Compartir</strong> a la barra inferior de Safari.
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
                ) : lang === 'ca' ? (
                  <>
                    2. Llisca cap avall i toca <strong>«Afegir a la pantalla d&apos;inici»</strong>.
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
                      {typeof window !== 'undefined' ? window.location.host : 'RiffanTV'}
                    </strong>{' '}
                    o el menú <strong>⋮ → Instalar aplicación</strong>.
                  </>
                ) : lang === 'ca' ? (
                  <>
                    <strong>En PC / Mac o Chrome sense APK:</strong> toca la icona d&apos;instal·lar a la barra de{' '}
                    <strong className="text-white">
                      {typeof window !== 'undefined' ? window.location.host : 'RiffanTV'}
                    </strong>{' '}
                    o el menú <strong>⋮ → Instal·lar aplicació</strong>.
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
          {pickLang(lang, {
            es: 'Cerrar',
            ca: 'Tancar',
            en: 'Close',
          })}
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
        {pickLang(lang, {
          es: 'Sin conexión — Reconectando automáticamente...',
          ca: 'Sense connexió — Reconnectant automàticament...',
          en: 'Offline — Reconnecting automatically...',
        })}
      </span>
    </div>
  );
};
