import React, { useEffect, useState } from 'react';
import {
  Check,
  Chrome,
  Download,
  MonitorSmartphone,
  MoreVertical,
  Share,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerApkDownload } from '../../utils/apkDownload';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { usePWAInstall } from '../../utils/usePWAInstall';
import { CLIENT_APK_VERSION_CODE } from '../../utils/versionSync';
import { RiffanSpinner } from '../ui/RiffanIcons';
import { RiffanMusicLogo } from './RiffanMusicLogo';

interface RiffanMusicInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
}

export const RiffanMusicInstallModal: React.FC<RiffanMusicInstallModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const pwa = usePWAInstall();
  const [apkDownloading, setApkDownloading] = useState(false);
  const [apkDone, setApkDone] = useState(false);
  const [apkError, setApkError] = useState<string | null>(null);
  const [showChromeSteps, setShowChromeSteps] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(pwa.isIOS);

  useBackInterceptor(isOpen, 'riffan-music-install-modal', onClose, { priority: 30 });

  useEffect(() => {
    if (!isOpen) {
      setApkError(null);
      setShowChromeSteps(false);
    } else if (pwa.isIOS) {
      setShowIosSteps(true);
    }
  }, [isOpen, pwa.isIOS]);

  if (!isOpen) return null;

  const handleDownloadMusicApk = async () => {
    if (apkDownloading) return;
    triggerHaptic('medium');
    setApkDownloading(true);
    setApkError(null);
    const res = await triggerApkDownload(
      `/RIFFAN-MUSIC.apk?v=${CLIENT_APK_VERSION_CODE}`,
      'RIFFAN-MUSIC.apk'
    );
    setApkDownloading(false);
    if (res.ok) {
      setApkDone(true);
      window.setTimeout(() => setApkDone(false), 3200);
    } else {
      setApkError(
        res.error ||
          pickLang(lang, {
            es: 'No se pudo iniciar la descarga de RIFFAN-MUSIC.apk',
            ca: 'No s’ha pogut iniciar la descàrrega de RIFFAN-MUSIC.apk',
            en: 'Could not start RIFFAN-MUSIC.apk download',
          })
      );
    }
  };

  const handleChromeInstall = async () => {
    triggerHaptic('medium');
    // Si la sesión se inició en /musica, el navegador tiene vinculado /music-manifest.webmanifest
    if (pwa.bootedAsMusic && pwa.isInstallable) {
      const accepted = await pwa.install();
      if (accepted) {
        onClose();
        return;
      }
    }
    // Si venimos de la raíz / (RiffanTV), recargamos limpiamente en /musica?install=music
    // para que Chrome / Edge capture el manifest independiente de Riffan Music
    if (!pwa.bootedAsMusic && typeof window !== 'undefined') {
      window.location.assign('/musica?install=music');
      return;
    }
    setShowChromeSteps((v) => !v);
  };

  const handleIosGuideToggle = () => {
    triggerHaptic('light');
    if (typeof window !== 'undefined' && !/^\/(musica|music)(\/|$)/i.test(window.location.pathname)) {
      window.history.replaceState(window.history.state, '', '/musica');
    }
    setShowIosSteps((v) => !v);
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Riffan Music"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl bg-[#070D15] border border-[#10B981]/30 p-5 sm:p-6 space-y-4 shadow-[0_28px_80px_rgba(0,0,0,0.85)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <RiffanMusicLogo variant="mark" size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-extrabold text-white truncate">
                  {pickLang(lang, {
                    es: 'Instalar Riffan Music',
                    ca: 'Instal·lar Riffan Music',
                    en: 'Install Riffan Music',
                    zh: '安装 Riffan Music',
                  })}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#10B981]/18 border border-[#10B981]/40 text-[10px] font-bold text-[#6EE7B7] shrink-0">
                  STANDALONE
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-snug">
                {pickLang(lang, {
                  es: 'App independiente de RiffanTV con icono propio, Audio 8D y EQ 10 bandas',
                  ca: 'App independent de RiffanTV amb icona pròpia, Àudio 8D i EQ 10 bandes',
                  en: 'Standalone app separate from RiffanTV with dedicated icon, 8D Audio & 10-band EQ',
                  zh: '独立于 RiffanTV 的音乐应用，含专属图标、8D 空间音频与 10 段均衡器',
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/15 text-zinc-300 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {pwa.isInstalled && (
          <div className="rounded-2xl bg-[#10B981]/14 border border-[#10B981]/35 p-3.5 flex items-center gap-3">
            <Check className="w-5 h-5 text-[#34D399] shrink-0" />
            <p className="text-xs font-semibold text-[#A7F3D0] leading-snug">
              {pickLang(lang, {
                es: 'Riffan Music ya está ejecutándose como aplicación instalada en tu dispositivo.',
                ca: 'Riffan Music ja s’està executant com a aplicació instal·lada.',
                en: 'Riffan Music is already running as an installed standalone app.',
              })}
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {/* 1. Chrome / Android / Desktop Standalone PWA */}
          {!pwa.isInstalled && (
            <div className="rounded-2xl border border-[#10B981]/45 bg-gradient-to-r from-[#10B981]/16 via-[#0A131E] to-[#22D3EE]/14 overflow-hidden">
              <button
                type="button"
                onClick={handleChromeInstall}
                className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.03] transition-colors"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(16,185,129,0.35)]">
                    <Chrome className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">
                      {pwa.bootedAsMusic && pwa.isInstallable
                        ? pickLang(lang, {
                            es: 'Instalar App Riffan Music (1-Tap)',
                            ca: 'Instal·lar App Riffan Music (1-Tap)',
                            en: 'Install Riffan Music App (1-Tap)',
                          })
                        : pickLang(lang, {
                            es: 'Chrome / Edge / Android PWA (Independiente)',
                            ca: 'Chrome / Edge / Android PWA (Independent)',
                            en: 'Chrome / Edge / Android PWA (Standalone)',
                          })}
                    </span>
                    <span className="block text-xs text-zinc-300 leading-snug">
                      {pwa.bootedAsMusic
                        ? pickLang(lang, {
                            es: 'Se añade como app propia en tu móvil o PC usando /music-manifest',
                            ca: 'S’afegeix com a app pròpia al mòbil o PC',
                            en: 'Installs directly to home screen or desktop with dedicated icon',
                          })
                        : pickLang(lang, {
                            es: 'Abre /musica como app propia separada de RiffanTV para instalar en Chrome',
                            ca: 'Obre /musica com a app pròpia separada de RiffanTV',
                            en: 'Loads /musica standalone manifest so Chrome installs Riffan Music separately',
                          })}
                    </span>
                  </span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#10B981] text-[#03130E] text-[10px] font-black shrink-0">
                  {pwa.bootedAsMusic && pwa.isInstallable ? '1-TAP' : 'PWA'}
                </span>
              </button>

              {showChromeSteps && (
                <div className="px-4 pb-3.5 pt-2 border-t border-white/10 text-xs text-zinc-300 space-y-1.5">
                  <p className="font-semibold text-[#6EE7B7]">
                    {pickLang(lang, {
                      es: 'Pasos manuales en Chrome / Edge:',
                      ca: 'Passos manuals a Chrome / Edge:',
                      en: 'Manual Chrome / Edge steps:',
                    })}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span>1.</span>
                    <span>
                      {pickLang(lang, {
                        es: 'Pulsa el menú del navegador',
                        ca: 'Prem el menú del navegador',
                        en: 'Tap browser menu',
                      })}
                    </span>
                    <MoreVertical className="w-3.5 h-3.5 text-white inline shrink-0" />
                    <span>
                      {pickLang(lang, {
                        es: 'arriba a la derecha (o icono Instalar en la barra de URL).',
                        ca: 'dalt a la dreta.',
                        en: 'at top-right (or address-bar Install icon).',
                      })}
                    </span>
                  </p>
                  <p>
                    2.{' '}
                    {pickLang(lang, {
                      es: 'Elige “Añadir a pantalla de inicio” o “Instalar Riffan Music”.',
                      ca: 'Tria “Afegir a la pantalla d’inici” o “Instal·lar Riffan Music”.',
                      en: 'Choose “Add to Home screen” or “Install Riffan Music”.',
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 2. Standalone Android APK (RIFFAN-MUSIC.apk, com.riffan.music) */}
          <button
            type="button"
            onClick={handleDownloadMusicApk}
            className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left cursor-pointer transition-all ${
              pwa.isAndroid
                ? 'bg-[#0D1724] border-[#22D3EE]/55 hover:bg-[#111E2E]'
                : 'bg-[#0C121C] border-white/10 hover:bg-[#111926]'
            }`}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-[#22D3EE]/15 border border-[#22D3EE]/35 text-[#22D3EE] flex items-center justify-center shrink-0">
                {apkDownloading ? (
                  <RiffanSpinner size={18} />
                ) : apkDone ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Smartphone className="w-5 h-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">
                  RIFFAN-MUSIC.apk (Android Nativo)
                </span>
                <span className="block text-xs text-zinc-400 leading-snug">
                  {pickLang(lang, {
                    es: 'APK exclusiva de Riffan Music (paquete propio independiente de RiffanTV)',
                    ca: 'APK exclusiva de Riffan Music (paquet propi independent de RiffanTV)',
                    en: 'Dedicated Android APK package (com.riffan.music, separate from RiffanTV)',
                  })}
                </span>
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[#22D3EE]/20 border border-[#22D3EE]/40 text-[#67E8F9] text-[10px] font-bold shrink-0 inline-flex items-center gap-1">
              <Download className="w-3 h-3" /> APK
            </span>
          </button>

          {apkError && (
            <p className="text-xs text-rose-400 px-2">{apkError}</p>
          )}

          {/* 3. iPhone / iPad Safari Guide */}
          <div
            className={`rounded-2xl border overflow-hidden transition-colors ${
              pwa.isIOS
                ? 'bg-[#0D1724] border-[#10B981]/50'
                : 'bg-[#0C121C] border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={handleIosGuideToggle}
              className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.03]"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-white/[0.07] border border-white/12 text-white flex items-center justify-center shrink-0">
                  <MonitorSmartphone className="w-5 h-5 text-[#34D399]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">
                    iPhone / iPad (Safari App)
                  </span>
                  <span className="block text-xs text-zinc-400 leading-snug">
                    {pickLang(lang, {
                      es: 'Instala Riffan Music en pantalla de inicio con su icono propio',
                      ca: 'Instal·la Riffan Music a la pantalla d’inici amb la seva icona',
                      en: 'Add Riffan Music to iOS Home Screen with standalone icon',
                    })}
                  </span>
                </span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/10 text-zinc-200 text-[10px] font-bold shrink-0">
                iOS
              </span>
            </button>

            {showIosSteps && (
              <div className="px-4 pb-3.5 pt-2 border-t border-white/10 text-xs text-zinc-300 space-y-1.5">
                <p className="font-semibold text-[#6EE7B7] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {pickLang(lang, {
                    es: 'Instrucciones en Safari (iPhone / iPad):',
                    ca: 'Instruccions a Safari (iPhone / iPad):',
                    en: 'Safari steps (iPhone / iPad):',
                  })}
                </p>
                <p className="flex items-center gap-1.5">
                  <span>1.</span>
                  <span>
                    {pickLang(lang, {
                      es: 'Asegúrate de estar en Safari en',
                      ca: 'Assegura’t d’estar a Safari a',
                      en: 'Open in Safari at',
                    })}
                  </span>
                  <code className="px-1.5 py-0.5 rounded bg-black/50 text-[#6EE7B7] font-mono text-[11px]">
                    /musica
                  </code>
                </p>
                <p className="flex items-center gap-1.5">
                  <span>2.</span>
                  <span>
                    {pickLang(lang, {
                      es: 'Toca el botón Compartir',
                      ca: 'Toca el botó Compartir',
                      en: 'Tap the Share icon',
                    })}
                  </span>
                  <Share className="w-3.5 h-3.5 text-[#38BDF8] inline shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'en la barra inferior de Safari.',
                      ca: 'a la barra inferior de Safari.',
                      en: 'in Safari’s toolbar.',
                    })}
                  </span>
                </p>
                <p>
                  3.{' '}
                  {pickLang(lang, {
                    es: 'Desliza y pulsa “Añadir a pantalla de inicio” → confirma “Riffan Music”.',
                    ca: 'Llisca i prem “Afegir a la pantalla d’inici” → confirma “Riffan Music”.',
                    en: 'Scroll and tap “Add to Home Screen” → confirm “Riffan Music”.',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
