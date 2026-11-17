import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Palette, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { usePWAInstall } from '../utils/usePWAInstall';
import type { EffectiveViewMode } from './MobileViewportGuard';
import { BottomSheet, SecondaryButton, StandardInput } from './ui/DesignSystem';
import { PWAInstallOptionsSheet } from './PWAInstallPrompt';
import { useAppStore } from '../store/useAppStore';
import { FlagBadgeSvg, type FlagCode } from './ui/LanguageBadge';
import {
  RiffanChevronDownIcon,
  RiffanChevronRightIcon,
  RiffanDownloadIcon,
  RiffanLogoutIcon,
  RiffanMobileIcon,
  RiffanMonitorIcon,
  RiffanRoomKeyIcon,
  RiffanSettingsGearIcon,
  RiffanSyncIcon,
  RiffanTvRemoteIcon,
} from './ui/RiffanIcons';

interface SettingsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  effectiveView: EffectiveViewMode;
  onToggleViewMode: () => void;
  authUser: User | null;
  authLoading: boolean;
  onSignIn: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  hasConnectedSmartTv?: boolean;
  onOpenSmartTv?: () => void;
  onOpenTvPairLobby?: () => void;
  roomId?: string;
  onClaimTvCode?: (code: string) => void | Promise<void>;
  onLeaveRoom?: () => void;
  onOpenDesignSystem?: () => void;
}

export const SettingsBottomSheet: React.FC<SettingsBottomSheetProps> = ({
  isOpen,
  onClose,
  lang,
  onChangeLang,
  effectiveView,
  onToggleViewMode,
  authUser,
  authLoading,
  onSignIn,
  onSignOut,
  hasConnectedSmartTv = false,
  onOpenSmartTv,
  onOpenTvPairLobby,
  roomId,
  onClaimTvCode,
  onLeaveRoom,
  onOpenDesignSystem,
}) => {
  const { isIOS, isAndroid } = usePWAInstall();
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [tvAdvancedOpen, setTvAdvancedOpen] = useState(false);
  const [tvCode, setTvCode] = useState('');
  const authNotice = useAppStore((s) => s.authNotice);

  const tvUrl =
    typeof window !== 'undefined' && roomId
      ? `${window.location.origin}/tv?room=${encodeURIComponent(roomId)}`
      : typeof window !== 'undefined'
      ? `${window.location.origin}/tv`
      : '';

  const rowClass =
    'w-full min-h-13 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-between gap-3 text-left transition-colors';

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        lang={lang}
        maxWidth="sm:max-w-md"
        icon={<RiffanSettingsGearIcon size={20} animate="always" />}
        title={pickLang(lang, { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' })}
        subtitle={pickLang(lang, {
          es: 'Cuenta, preferencias, TV e instalación',
          ca: 'Compte, preferències, TV i instal·lació',
          en: 'Account, preferences, TV & install',
        })}
      >
        <div className="space-y-4">
          {/* Cuenta */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
              {pickLang(lang, { es: 'Cuenta', ca: 'Compte', en: 'Account' })}
            </h4>
            <div className={rowClass}>
              <div className="flex items-center gap-3 min-w-0">
                <RiffanSyncIcon
                  size={20}
                  animate={authLoading ? 'always' : 'hover'}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {authUser
                      ? authUser.displayName || authUser.email
                      : pickLang(lang, {
                          es: 'Sincronizar con Google',
                          ca: 'Sincronitzar amb Google',
                          en: 'Sync with Google',
                        })}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {authUser
                      ? pickLang(lang, {
                          es: 'conectado',
                          ca: 'connectat',
                          en: 'connected',
                        })
                      : pickLang(lang, {
                          es: 'Guarda historial, listas y salas',
                          ca: 'Desa historial, llistes i sales',
                          en: 'Save history, lists & rooms',
                        })}
                  </div>
                </div>
              </div>

              {!authUser && (
                <SecondaryButton
                  onClick={() => {
                    triggerHaptic('medium');
                    void onSignIn();
                  }}
                  loading={authLoading}
                  className="!min-h-10 !px-3.5 shrink-0"
                >
                  <RiffanSyncIcon size={16} animate={authLoading ? 'always' : 'hover'} />
                  <span>
                    {pickLang(lang, {
                      es: 'Conectar',
                      ca: 'Connectar',
                      en: 'Connect',
                    })}
                  </span>
                </SecondaryButton>
              )}
            </div>
            {!authUser && authNotice && (
              <p className="rounded-2xl bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-[11px] leading-relaxed text-zinc-300">
                {authNotice}
              </p>
            )}
          </section>

          {/* Preferencias */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
              {pickLang(lang, {
                es: 'Preferencias',
                ca: 'Preferències',
                en: 'Preferences',
              })}
            </h4>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleViewMode();
              }}
              className={`${rowClass} cursor-pointer active:scale-[0.98]`}
            >
              <span className="flex items-center gap-3 min-w-0">
                {effectiveView === 'desktop' ? (
                  <RiffanMobileIcon size={20} animate="hover" className="shrink-0" />
                ) : (
                  <RiffanMonitorIcon size={20} animate="hover" className="shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">
                    {effectiveView === 'desktop'
                      ? pickLang(lang, {
                          es: 'Vista móvil',
                          ca: 'Vista mòbil',
                          en: 'Mobile view',
                        })
                      : pickLang(lang, {
                          es: 'Vista PC',
                          ca: 'Vista PC',
                          en: 'Desktop view',
                        })}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    {effectiveView === 'desktop'
                      ? pickLang(lang, {
                          es: 'Cambiar al diseño vertical táctil',
                          ca: 'Canviar al disseny vertical tàctil',
                          en: 'Switch to portrait touch layout',
                        })
                      : pickLang(lang, {
                          es: 'Cambiar al diseño panorámico de escritorio',
                          ca: 'Canviar al disseny panoràmic d’escriptori',
                          en: 'Switch to desktop wide layout',
                        })}
                  </span>
                </span>
              </span>
              <RiffanChevronRightIcon size={16} animate="hover" className="shrink-0 opacity-75" />
            </button>

            {/* Language Selector */}
            <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
              <span className="block text-[11px] font-medium text-zinc-400 px-1">
                {pickLang(lang, {
                  es: 'Idioma de la interfaz',
                  ca: 'Idioma de la interfície',
                  en: 'Interface language',
                  rif: "Tutlayt n l'interface",
                  zh: '界面语言',
                })}
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { id: 'es', flag: 'es' as FlagCode, label: 'ES', title: 'Español' },
                  { id: 'ca', flag: 'ca' as FlagCode, label: 'CA', title: 'Català' },
                  { id: 'en', flag: 'en' as FlagCode, label: 'EN', title: 'English' },
                  { id: 'rif', flag: 'rif' as FlagCode, label: 'RIF', title: 'Tarifit' },
                  { id: 'zh', flag: 'zh' as FlagCode, label: '中文', title: '中文' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    title={l.title}
                    aria-label={l.title}
                    onClick={() => {
                      triggerHaptic('light');
                      onChangeLang(l.id as AppLanguage);
                    }}
                    className={`min-h-10 px-1.5 rounded-xl text-[11px] font-semibold border cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                      lang === l.id
                        ? 'bg-[#9146FF] text-white border-[#A970FF]/70 shadow-[0_4px_12px_rgba(145,70,255,0.35)]'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300'
                    }`}
                  >
                    <FlagBadgeSvg code={l.flag} className="w-4 h-3 shrink-0" />
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* TV */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
              TV
            </h4>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (onOpenSmartTv) {
                  onClose();
                  onOpenSmartTv();
                } else if (onOpenTvPairLobby) {
                  onClose();
                  onOpenTvPairLobby();
                } else {
                  setTvAdvancedOpen((v) => !v);
                }
              }}
              className={`${rowClass} cursor-pointer active:scale-[0.98]`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <RiffanTvRemoteIcon size={20} animate="hover" className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">
                    {pickLang(lang, {
                      es: 'Enviar a TV',
                      ca: 'Enviar a TV',
                      en: 'Cast to TV',
                    })}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    {hasConnectedSmartTv
                      ? pickLang(lang, {
                          es: 'Mando disponible · conectado',
                          ca: 'Comandament disponible · connectat',
                          en: 'Remote ready · connected',
                        })
                      : 'Chromecast / AirPlay / Smart View'}
                  </span>
                </span>
              </span>
              <RiffanChevronRightIcon size={16} animate="hover" className="shrink-0 opacity-75" />
            </button>

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setTvAdvancedOpen((v) => !v);
                }}
                aria-expanded={tvAdvancedOpen}
                className="w-full min-h-12 px-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-white/[0.04]"
              >
                <span className="flex items-center gap-3 text-sm font-semibold text-white">
                  <RiffanRoomKeyIcon size={17} animate="hover" />
                  <span>
                    {pickLang(lang, {
                      es: 'Vincular con código',
                      ca: 'Vincular amb codi',
                      en: 'Pair with code',
                    })}
                  </span>
                </span>
                <RiffanChevronDownIcon
                  size={16}
                  animate="hover"
                  className={`transition-transform duration-150 ${
                    tvAdvancedOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {tvAdvancedOpen && (
                <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-3">
                  {onClaimTvCode && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const clean = tvCode.replace(/\D/g, '').slice(0, 4);
                        if (clean.length === 4) {
                          triggerHaptic('medium');
                          void onClaimTvCode(clean);
                          setTvCode('');
                        }
                      }}
                      className="flex gap-2"
                    >
                      <StandardInput
                        value={tvCode}
                        onChange={(e) =>
                          setTvCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder="0000"
                        inputMode="numeric"
                        maxLength={4}
                        className="text-center font-mono text-base tracking-[0.35em] font-bold"
                      />
                      <SecondaryButton
                        type="submit"
                        disabled={tvCode.length !== 4}
                      >
                        {pickLang(lang, { es: 'Vincular', ca: 'Vincular', en: 'Pair' })}
                      </SecondaryButton>
                    </form>
                  )}

                  {tvUrl && (
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <div className="p-2.5 rounded-2xl bg-white">
                        <QRCodeSVG value={tvUrl} size={120} level="M" includeMargin={false} />
                      </div>
                      <span className="text-xs text-zinc-400">
                        {pickLang(lang, {
                          es: 'Escanea desde tu televisor',
                          ca: 'Escaneja des del teu televisor',
                          en: 'Scan from your TV',
                        })}
                      </span>
                    </div>
                  )}

                  {onOpenTvPairLobby && (
                    <SecondaryButton
                      fullWidth
                      onClick={() => {
                        onClose();
                        onOpenTvPairLobby();
                      }}
                    >
                      <RiffanTvRemoteIcon size={16} animate="hover" />
                      <span>
                        {pickLang(lang, {
                          es: 'Usar esta pantalla como TV',
                          ca: 'Usar aquesta pantalla com a TV',
                          en: 'Use this screen as TV',
                        })}
                      </span>
                    </SecondaryButton>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Instalar la app */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
              {pickLang(lang, {
                es: 'Instalar la app',
                ca: 'Instal·lar l’app',
                en: 'Install app',
              })}
            </h4>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setInstallSheetOpen(true);
              }}
              className={`${rowClass} cursor-pointer active:scale-[0.98]`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <RiffanDownloadIcon size={20} animate="hover" className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">
                    {pickLang(lang, {
                      es: 'Instalar RiffanTV',
                      ca: 'Instal·lar RiffanTV',
                      en: 'Install RiffanTV',
                    })}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    Samsung Tizen, LG (M3U · XML), Android APK, Google TV, Web
                  </span>
                </span>
              </span>
              <RiffanChevronRightIcon size={16} animate="hover" className="shrink-0 opacity-75" />
            </button>

            {onOpenDesignSystem && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                  onOpenDesignSystem();
                }}
                className={`${rowClass} cursor-pointer active:scale-[0.98]`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Palette className="w-5 h-5 text-zinc-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-zinc-200">
                      {pickLang(lang, {
                        es: 'Acerca de · Design System',
                        ca: 'Quant a · Design System',
                        en: 'About · Design System',
                      })}
                    </span>
                    <span className="block text-xs text-zinc-400">
                      {pickLang(lang, {
                        es: 'Identidad visual, logos y recursos',
                        ca: 'Identitat visual, logos i recursos',
                        en: 'Visual identity, logos & assets',
                      })}
                    </span>
                  </span>
                </span>
                <RiffanChevronRightIcon size={16} animate="hover" className="shrink-0 opacity-75" />
              </button>
            )}
          </section>

          {/* Cerrar sesión */}
          {(authUser || onLeaveRoom) && (
            <div className="pt-2 border-t border-white/[0.07] space-y-2">
              {authUser && (
                <SecondaryButton
                  fullWidth
                  onClick={() => {
                    triggerHaptic('light');
                    void onSignOut();
                    onClose();
                  }}
                >
                  <RiffanLogoutIcon size={16} animate="hover" />
                  <span>
                    {pickLang(lang, {
                      es: 'Cerrar sesión',
                      ca: 'Tancar sessió',
                      en: 'Sign out',
                    })}
                  </span>
                </SecondaryButton>
              )}
              {onLeaveRoom && (
                <SecondaryButton
                  fullWidth
                  onClick={() => {
                    triggerHaptic('light');
                    onClose();
                    onLeaveRoom();
                  }}
                >
                  <RiffanLogoutIcon size={16} animate="hover" />
                  <span>
                    {pickLang(lang, {
                      es: 'Cambiar de perfil o acceso',
                      ca: 'Canviar de perfil o accés',
                      en: 'Switch profile or access',
                    })}
                  </span>
                </SecondaryButton>
              )}
            </div>
          )}
        </div>
      </BottomSheet>

      <PWAInstallOptionsSheet
        isOpen={installSheetOpen}
        onClose={() => setInstallSheetOpen(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};
