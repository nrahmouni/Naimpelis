import React from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { BottomSheet } from './ui/DesignSystem';
import { ShieldCheck } from 'lucide-react';
import {
  RiffanBellIcon,
  RiffanBookmarkIcon,
  RiffanCastIcon,
  RiffanChevronRightIcon,
  RiffanContinueWatchingIcon,
  RiffanDownloadIcon,
  RiffanLogoutIcon,
  RiffanSettingsGearIcon,
  RiffanUserIcon,
  RiffanUsersIcon,
  RiffanYouTubeIcon,
} from './ui/RiffanIcons';

interface AvatarMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  displayName: string;
  avatar: string;
  color: string;
  authUser: FirebaseUser | null;
  unreadNotificationsCount: number;
  hasConnectedSmartTv: boolean;
  onOpenProfile: () => void;
  onOpenContinueWatching: () => void;
  onOpenSaved: () => void;
  onOpenNotifications: () => void;
  onOpenFriends: () => void;
  onOpenSmartTv: () => void;
  onOpenYouTube: () => void;
  onOpenSettings: () => void;
  onOpenInstallApp?: () => void;
  onOpenAdminConsole?: () => void;
  inRoom?: boolean;
  sessionMode?: 'solo' | 'party';
  roomName?: string;
  onUpgradeSoloToParty?: () => void;
  onLeaveRoom?: () => void;
  onSignOut?: () => void | Promise<void>;
}

export const AvatarMenuSheet: React.FC<AvatarMenuSheetProps> = ({
  isOpen,
  onClose,
  lang,
  displayName,
  avatar,
  color,
  authUser,
  unreadNotificationsCount,
  hasConnectedSmartTv,
  onOpenProfile,
  onOpenContinueWatching,
  onOpenSaved,
  onOpenNotifications,
  onOpenFriends,
  onOpenSmartTv,
  onOpenYouTube,
  onOpenSettings,
  onOpenInstallApp,
  onOpenAdminConsole,
  inRoom = false,
  sessionMode = 'party',
  roomName,
  onUpgradeSoloToParty,
  onLeaveRoom,
  onSignOut,
}) => {
  const runAction = (fn: () => void) => {
    triggerHaptic('light');
    onClose();
    fn();
  };

  const items = [
    {
      id: 'profile',
      iconEl: <RiffanUserIcon size={20} animate="hover" className="shrink-0" />,
      label: pickLang(lang, { es: 'Perfil', ca: 'Perfil', en: 'Profile' }),
      onClick: onOpenProfile,
      badge: null as React.ReactNode,
    },
    {
      id: 'continue',
      iconEl: <RiffanContinueWatchingIcon size={20} animate="hover" className="shrink-0" />,
      label: pickLang(lang, {
        es: 'Continuar viendo',
        ca: 'Continuar veient',
        en: 'Continue watching',
      }),
      onClick: onOpenContinueWatching,
      badge: null as React.ReactNode,
    },
    {
      id: 'saved',
      iconEl: <RiffanBookmarkIcon size={20} animate="hover" className="shrink-0" />,
      label: pickLang(lang, { es: 'Guardados', ca: 'Desats', en: 'Saved' }),
      onClick: onOpenSaved,
      badge: null as React.ReactNode,
    },
    {
      id: 'notifications',
      iconEl: (
        <RiffanBellIcon
          size={20}
          animate={unreadNotificationsCount > 0 ? 'always' : 'hover'}
          className="shrink-0"
        />
      ),
      label: pickLang(lang, {
        es: 'Notificaciones',
        ca: 'Notificacions',
        en: 'Notifications',
      }),
      onClick: onOpenNotifications,
      badge:
        unreadNotificationsCount > 0 ? (
          <span className="min-w-6 h-6 px-1.5 rounded-full bg-[#7C3AED] text-white text-xs font-bold flex items-center justify-center tabular-nums">
            {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
          </span>
        ) : null,
    },
    {
      id: 'friends',
      iconEl: <RiffanUsersIcon size={20} animate="hover" className="shrink-0" />,
      label: pickLang(lang, {
        es: 'Amigos e invitaciones',
        ca: 'Amics i invitacions',
        en: 'Friends & invites',
      }),
      onClick: onOpenFriends,
      badge: null as React.ReactNode,
    },
    {
      id: 'tv',
      iconEl: <RiffanCastIcon size={20} animate="hover" className="shrink-0" />,
      label: pickLang(lang, {
        es: 'Enviar a TV',
        ca: 'Enviar a TV',
        en: 'Cast to TV',
      }),
      onClick: onOpenSmartTv,
      badge: hasConnectedSmartTv ? (
        <span className="w-2.5 h-2.5 rounded-full bg-[#00F593] shadow-[0_0_8px_#00F593]" />
      ) : null,
    },
    {
      id: 'youtube',
      iconEl: <RiffanYouTubeIcon size={20} animate="hover" className="shrink-0" />,
      label: 'YouTube',
      onClick: onOpenYouTube,
      badge: null as React.ReactNode,
    },
    ...(onOpenInstallApp
      ? [
          {
            id: 'install-app',
            iconEl: <RiffanDownloadIcon size={20} animate="hover" className="shrink-0 text-[#FF6B4A]" />,
            label: pickLang(lang, {
              es: 'Instalar App (APK · iPhone · Chrome)',
              ca: 'Instal·lar App (APK · iPhone · Chrome)',
              en: 'Install App (APK · iPhone · Chrome)',
            }),
            onClick: onOpenInstallApp,
            badge: (
              <span className="px-1.5 py-0.5 rounded bg-[#FF3366]/20 text-[#FF6B4A] text-[10px] font-bold">
                APK/PWA
              </span>
            ) as React.ReactNode,
          },
        ]
      : []),
    {
      id: 'settings',
      iconEl: <RiffanSettingsGearIcon size={20} animate="hover" className="shrink-0" />,
      label: pickLang(lang, { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' }),
      onClick: onOpenSettings,
      badge: null as React.ReactNode,
    },
    ...(onOpenAdminConsole &&
    authUser?.email?.toLowerCase() === 'felipeallouch@gmail.com'
      ? [
          {
            id: 'admin-console',
            iconEl: <ShieldCheck className="w-5 h-5 text-[#A78BFA] shrink-0" />,
            label: pickLang(lang, {
              es: 'Consola Admin / Telemetría',
              ca: 'Consola Admin / Telemetria',
              en: 'Admin Console / Telemetry',
            }),
            onClick: onOpenAdminConsole,
            badge: (
              <span className="px-1.5 py-0.5 rounded bg-[#7C3AED]/20 text-[#C4B5FD] text-[10px] font-bold">
                /admin
              </span>
            ) as React.ReactNode,
          },
        ]
      : []),
  ];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={displayName || pickLang(lang, { es: 'Tu cuenta', ca: 'El teu compte', en: 'Account' })}
      subtitle={
        authUser?.email ||
        pickLang(lang, {
          es: 'Cuenta, listas y dispositivos',
          ca: 'Compte, llistes i dispositius',
          en: 'Account, lists & devices',
        })
      }
      maxWidth="sm:max-w-md"
    >
      <div className="space-y-3 pb-2">
        <div className="flex items-center gap-3 px-2 pb-2 border-b border-white/[0.06]">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold text-white shrink-0 border border-white/15"
            style={{ backgroundColor: color || '#7C3AED' }}
          >
            {authUser?.photoURL ? (
              <img
                src={authUser.photoURL}
                alt={displayName}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              (() => {
                const words = (displayName || 'U').trim().split(/\s+/).filter(Boolean);
                return words.length >= 2
                  ? `${words[0][0]}${words[1][0]}`.toUpperCase()
                  : (displayName || 'U').trim().slice(0, 2).toUpperCase();
              })()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white break-words leading-snug">{displayName}</p>
            <p className="text-xs text-zinc-400 break-words">
              {authUser
                ? authUser.email || pickLang(lang, { es: 'Sesión iniciada', ca: 'Sessió iniciada', en: 'Signed in' })
                : pickLang(lang, { es: 'Perfil invitado', ca: 'Perfil convidat', en: 'Guest profile' })}
            </p>
          </div>
        </div>

        <nav className="space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => runAction(item.onClick)}
              className="group w-full min-h-12 px-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-transparent hover:border-white/[0.08] flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] transition-all duration-150"
            >
              <span className="flex items-center gap-3 min-w-0">
                {item.iconEl}
                <span className="text-sm font-semibold text-white break-words leading-snug">
                  {item.label}
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {item.badge}
                <RiffanChevronRightIcon size={16} animate="hover" className="opacity-70" />
              </span>
            </button>
          ))}
        </nav>

        {((sessionMode === 'solo' && onUpgradeSoloToParty) || (inRoom && onLeaveRoom) || (onLeaveRoom && sessionMode === 'solo') || (authUser && onSignOut)) && (
          <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
            {sessionMode === 'solo' && onUpgradeSoloToParty && (
              <button
                type="button"
                onClick={() => runAction(onUpgradeSoloToParty)}
                className="w-full min-h-11 px-3.5 rounded-xl bg-[#7C3AED]/18 hover:bg-[#7C3AED]/28 border border-[#8B5CF6]/45 flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] transition-all duration-150"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <RiffanUsersIcon size={16} animate="hover" className="shrink-0" />
                  <span className="text-sm font-semibold text-white break-words leading-snug">
                    {pickLang(lang, {
                      es: 'Crear sala con amigos',
                      ca: 'Crear sala amb amics',
                      en: 'Create Watch Party',
                      zh: '创建好友房间',
                      rif: 'Egg taxxamt aked imddukkal',
                    })}
                  </span>
                </span>
              </button>
            )}
            {onLeaveRoom && (inRoom || sessionMode === 'solo') && (
              <button
                type="button"
                onClick={() => runAction(onLeaveRoom)}
                className="w-full min-h-11 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] transition-all duration-150"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <RiffanLogoutIcon size={16} animate="hover" className="shrink-0" />
                  <span className="text-sm font-semibold text-rose-200 break-words leading-snug">
                    {sessionMode === 'solo'
                      ? pickLang(lang, {
                          es: 'Volver a pantalla de inicio',
                          ca: 'Tornar a la pantalla d’inici',
                          en: 'Back to start screen',
                        })
                      : pickLang(lang, {
                          es: `Salir de la sala${roomName ? ` (${roomName})` : ''}`,
                          ca: `Sortir de la sala${roomName ? ` (${roomName})` : ''}`,
                          en: `Leave room${roomName ? ` (${roomName})` : ''}`,
                        })}
                  </span>
                </span>
              </button>
            )}
            {authUser && onSignOut && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                  void onSignOut();
                }}
                className="w-full min-h-11 px-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] transition-all duration-150"
              >
                <RiffanLogoutIcon size={16} animate="hover" className="shrink-0" />
                <span className="text-sm font-semibold text-zinc-300 break-words">
                  {pickLang(lang, { es: 'Cerrar sesión', ca: 'Tancar sessió', en: 'Sign out' })}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
