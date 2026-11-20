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
  recommendedDevice: 'android' | 'tv' | 'samsung' | 'web';
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
      {/* OPTION 1: Samsung Tizen & LG webOS (M3U + EPG XML + Guide) */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('medium');
          onSelectSamsungTizen();
        }}
        className={cardClass(true)}
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

      {/* OPTION 2: Android APK */}
      <div className="space-y-2">
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
              <span className="block text-sm font-bold text-white">Android (APK Oficial)</span>
              <span className="block text-xs text-zinc-400 leading-snug break-words">
                {pickLang(lang, {
                  es: 'Descarga directa para móvil o tablet Android',
                  ca: 'Descàrrega directa per a mòbil o tauleta Android',
                  en: 'Direct APK download for Android phone or tablet',
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

        {isInstallable && (
          <button
            type="button"
            onClick={onInstallPwa}
            className="w-full min-h-10 px-3.5 py-2 rounded-xl bg-[#0D0D12] hover:bg-[#14141D] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <RiffanDownloadIcon size={14} />
            <span>
              {pickLang(lang, {
                es: 'O instalar versión web instantánea (PWA)',
                ca: 'O instal·lar versió web instantània (PWA)',
                en: 'Or install instant web app (PWA)',
              })}
            </span>
          </button>
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

      {/* OPTION 4: iPhone / PC */}
      <button
        type="button"
        onClick={onInstallWeb}
        className={cardClass(recommendedDevice === 'web')}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5 text-[#A78BFA]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">iPhone / iPad / PC</span>
            <span className="block text-xs text-zinc-400 leading-snug break-words">
              {pickLang(lang, {
                es: 'Acceso directo en pantalla de inicio con Safari o Chrome',
                ca: 'Accés ràpid des del navegador a la pantalla d’inici',
                en: 'Quick browser install on your home screen',
              })}
            </span>
          </span>
        </span>
        {recommendedDevice === 'web' && (
          <span className="px-2.5 py-1 rounded-full bg-[#7C3AED] text-[10px] font-bold text-white shrink-0">
            {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
          </span>
        )}
      </button>

      {apkError && <p className="text-xs text-rose-300 px-1 pt-1">{apkError}</p>}

      {showWebSteps && (
        <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] text-xs text-zinc-300 space-y-2">
          {isIOS ? (
            <div className="flex items-center gap-2">
              <Share className="w-4 h-4 text-[#A78BFA] shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Pulsa Compartir en Safari y elige «Añadir a pantalla de inicio».',
                  ca: 'Prem Compartir a Safari i tria «Afegir a la pantalla d’inici».',
                  en: 'Tap Share in Safari and pick "Add to Home Screen".',
                })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MoreVertical className="w-4 h-4 text-[#A78BFA] shrink-0" />
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
  );
};
