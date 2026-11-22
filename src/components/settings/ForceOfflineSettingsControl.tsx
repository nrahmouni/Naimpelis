import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useForceOfflineMode } from '../../utils/offlineModeManager';

interface ForceOfflineSettingsControlProps {
  lang: AppLanguage;
  rowClass: string;
}

export const ForceOfflineSettingsControl: React.FC<ForceOfflineSettingsControlProps> = ({
  lang,
  rowClass,
}) => {
  const { forceOffline, blockedCount, toggleForceOffline } = useForceOfflineMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={forceOffline}
      data-testid="force-offline-toggle"
      onClick={() => {
        triggerHaptic(forceOffline ? 'light' : 'medium');
        toggleForceOffline();
      }}
      className={`${rowClass} cursor-pointer active:scale-[0.99] ${
        forceOffline ? '!border-amber-400/45 !bg-amber-500/10' : ''
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        {forceOffline ? (
          <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
        ) : (
          <Wifi className="w-5 h-5 text-zinc-400 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">
              {pickLang(lang, {
                es: 'Forzar modo sin conexión',
                ca: 'Forçar mode sense connexió',
                en: 'Force Offline mode',
                rif: 'Sbeddel s war internet (Offline)',
                zh: '强制离线模式',
              })}
            </span>
            {forceOffline && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                {pickLang(lang, {
                  es: 'Activo',
                  ca: 'Actiu',
                  en: 'Active',
                  zh: '已开启',
                })}
              </span>
            )}
          </span>
          <span className="block text-xs text-zinc-400 leading-snug">
            {forceOffline
              ? pickLang(lang, {
                  es:
                    blockedCount > 0
                      ? `Peticiones de red bloqueadas (${blockedCount})`
                      : 'Todas las peticiones de red están desactivadas',
                  ca:
                    blockedCount > 0
                      ? `Peticions de xarxa bloquejades (${blockedCount})`
                      : 'Totes les peticions de xarxa estan desactivades',
                  en:
                    blockedCount > 0
                      ? `Network requests blocked (${blockedCount})`
                      : 'All outbound network requests are disabled',
                })
              : pickLang(lang, {
                  es: 'Bloquea toda la red para usar solo el contenido local',
                  ca: 'Bloqueja tota la xarxa per usar només el contingut local',
                  en: 'Disables all network requests to run offline-only',
                })}
          </span>
        </span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          forceOffline ? 'bg-amber-400' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
            forceOffline ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </span>
    </button>
  );
};
