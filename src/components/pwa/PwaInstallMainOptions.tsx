import React from 'react';
import {
  Check,
  ChevronRight,
  Monitor,
  MoreVertical,
  Share,
  Smartphone,
  Tv,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { CLIENT_APK_VERSION_CODE } from '../../utils/versionSync';
import { RiffanDownloadIcon, RiffanSpinner } from '../ui/RiffanIcons';

interface PwaInstallMainOptionsProps {
  lang: AppLanguage;
  recommendedDevice: 'android' | 'ios' | 'tv' | 'samsung' | 'web';
  isIOS: boolean;
  isInstallable: boolean;
  apkDownloading: 'mobile' | 'tv' | null;
  apkDone: 'mobile' | 'tv' | null;
  apkError: string | null;
  showWebSteps: boolean;
  onSelectSamsungTizen: () => void;
  onDownloadApk: (flavor: 'mobile' | 'tv', url: string, filename: string) => void;
  onInstallPwa: () => void;
  onInstallWeb: () => void;
}

export const PwaInstallMainOptions: React.FC<PwaInstallMainOptionsProps> = ({
  lang,
  recommendedDevice,
  isIOS,
  isInstallable,
  apkDownloading,
  apkDone,
  apkError,
  showWebSteps,
  onSelectSamsungTizen,
  onDownloadApk,
  onInstallPwa,
  onInstallWeb,
}) => {
  const cardClass = (highlighted: boolean) =>
    `w-full min-h-14 px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.98] transition-all duration-150 ${
      highlighted
        ? 'bg-[#7C3AED]/16 border-[#7C3AED]/60 text-white'
        : 'bg-[#0D0D12] hover:bg-[#14141D] border-white/[0.08] text-white'
    }`;

  return (
    <div className="space-y-2.5">
      {/* OPTION 0 (When Chrome/Edge PWA prompt available): Instant Chrome/Android/Desktop App */}
      {isInstallable && (
        <button
          type="button"
          onClick={onInstallPwa}
          className="w-full min-h-14 px-4 py-3 rounded-2xl border bg-gradient-to-r from-[#FF3366]/20 via-[#7C3AED]/20 to-[#F59E0B]/15 border-[#FF3366]/55 text-white flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.98] transition-all"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF3366] to-[#FF6B4A] flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(255,51,102,0.4)]">
              <RiffanDownloadIcon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'Instalar App ahora (Chrome / Edge / PWA)',
                  ca: 'Instal·lar App ara (Chrome / Edge / PWA)',
                  en: 'Install App now (Chrome / Edge / PWA)',
                })}
              </span>
              <span className="block text-xs text-zinc-300 leading-snug break-words">
                {pickLang(lang, {
                  es: 'Acceso directo en escritorio o móvil sin descargas pesadas',
                  ca: 'Accés directe a l’escriptori o mòbil en 1 toc',
                  en: 'Instant 1-tap home screen & desktop install',
                })}
              </span>
            </span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#FF3366] text-[10px] font-bold text-white shrink-0">
            1-TAP
          </span>
        </button>
      )}

      {/* OPTION 1: Android Mobile APK */}
      <button
        type="button"
        onClick={() =>
          onDownloadApk('mobile', `/RIFFAN-TV.apk?v=${CLIENT_APK_VERSION_CODE}`, 'RIFFANTV.apk')
        }
        className={cardClass(recommendedDevice === 'android')}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
            {apkDownloading === 'mobile' ? (
              <RiffanSpinner size={20} />
            ) : apkDone === 'mobile' ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <Smartphone className="w-5 h-5 text-[#A78BFA]" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">Android Móvil / Tablet (APK Oficial)</span>
            <span className="block text-xs text-zinc-400 leading-snug break-words">
              {pickLang(lang, {
                es: 'Descarga directa nativa RIFFANTV.apk (con Riffan Music & TV)',
                ca: 'Descàrrega directa nativa RIFFANTV.apk',
                en: 'Direct native APK download for Android phone & tablet',
              })}
            </span>
          </span>
        </span>
        {recommendedDevice === 'android' && (
          <span className="px-2.5 py-1 rounded-full bg-[#7C3AED] text-[10px] font-bold text-white shrink-0">
            {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
          </span>
        )}
      </button>

      {/* OPTION 2: iPhone / iPad Safari & Chrome / Web PWA */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onInstallWeb}
          className={cardClass(recommendedDevice === 'ios' || recommendedDevice === 'web')}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
              {isIOS ? (
                <Share className="w-5 h-5 text-[#FF6B4A]" />
              ) : (
                <Monitor className="w-5 h-5 text-[#A78BFA]" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">
                iPhone / iPad (Safari) · Chrome / Escritorio
              </span>
              <span className="block text-xs text-zinc-400 leading-snug break-words">
                {pickLang(lang, {
                  es: 'App instalada en pantalla de inicio en iOS Safari y Chrome',
                  ca: 'App instal·lada a pantalla d’inici en iOS Safari i Chrome',
                  en: 'Home-screen app via iOS Safari Share or Chrome install',
                })}
              </span>
            </span>
          </span>
          {(recommendedDevice === 'ios' || recommendedDevice === 'web') && (
            <span className="px-2.5 py-1 rounded-full bg-[#7C3AED] text-[10px] font-bold text-white shrink-0">
              {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
            </span>
          )}
        </button>

        {(showWebSteps || isIOS) && (
          <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-xs text-zinc-300 space-y-2">
            {isIOS ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Share className="w-4 h-4 text-[#FF6B4A] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Instalar en iPhone / iPad (Safari o Chrome iOS):',
                      ca: 'Instal·lar a iPhone / iPad:',
                      en: 'Install on iPhone / iPad:',
                    })}
                  </span>
                </div>
                <p className="text-zinc-300 leading-relaxed pl-6">
                  {pickLang(lang, {
                    es: '1. Pulsa el botón Compartir (cuadro con flecha ↑). 2. Elige «Añadir a pantalla de inicio» y confirma «Añadir».',
                    ca: '1. Prem Compartir (↑). 2. Tria «Afegir a la pantalla d’inici» i confirma «Afegir».',
                    en: '1. Tap Share (↑). 2. Select "Add to Home Screen" and confirm "Add".',
                  })}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <MoreVertical className="w-4 h-4 text-[#A78BFA] shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: 'En Chrome o Edge, pulsa el icono de instalar en la barra de direcciones o abre el menú (⋮) → «Instalar aplicación».',
                    ca: 'A Chrome o Edge, prem la icona d’instal·lar o el menú (⋮) → «Instal·lar aplicació».',
                    en: 'In Chrome/Edge, click the install icon in the address bar or menu (⋮) → "Install app".',
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* OPTION 3: Google TV / Chromecast APK */}
      <button
        type="button"
        onClick={() =>
          onDownloadApk('tv', `/RIFFAN-TV-TV.apk?v=${CLIENT_APK_VERSION_CODE}`, 'RIFFANTV-TV.apk')
        }
        className={cardClass(recommendedDevice === 'tv')}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
            {apkDownloading === 'tv' ? (
              <RiffanSpinner size={20} />
            ) : apkDone === 'tv' ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <Tv className="w-5 h-5 text-[#A78BFA]" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">Google TV / Chromecast (APK)</span>
            <span className="block text-xs text-zinc-400 leading-snug break-words">
              {pickLang(lang, {
                es: 'Adaptada para televisor y control con mando físico D-Pad',
                ca: 'Adaptada per a televisor i control amb comandament físic',
                en: 'Tailored for TV screens with physical remote D-Pad navigation',
              })}
            </span>
          </span>
        </span>
        {recommendedDevice === 'tv' && (
          <span className="px-2.5 py-1 rounded-full bg-[#7C3AED] text-[10px] font-bold text-white shrink-0">
            {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
          </span>
        )}
      </button>

      {/* OPTION 4: Samsung Tizen & LG webOS (M3U + EPG XML + Guide) */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('medium');
          onSelectSamsungTizen();
        }}
        className={cardClass(recommendedDevice === 'samsung')}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center shrink-0">
            <Tv className="w-5 h-5 text-[#A78BFA]" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="block text-sm font-bold text-white">
                Samsung Tizen / LG webOS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                M3U + XML
              </span>
            </span>
            <span className="block text-xs text-zinc-300 leading-snug break-words mt-0.5">
              {pickLang(lang, {
                es: 'Guía paso a paso, lista M3U y guía EPG con +900 canales',
                ca: 'Guia pas a pas, llista M3U i guia EPG amb +900 canals',
                en: 'Step-by-step guide, M3U playlist & EPG XML with 900+ channels',
              })}
            </span>
          </span>
        </span>
        <div className="flex items-center gap-1 shrink-0 text-[#A78BFA]">
          <span className="text-xs font-bold hidden sm:inline">Ver Guía</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>

      {apkError && <p className="text-xs text-rose-300 px-1 pt-1">{apkError}</p>}
    </div>
  );
};
