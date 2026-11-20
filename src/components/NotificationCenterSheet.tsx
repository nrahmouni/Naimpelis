import React, { useState } from 'react';
import {
  CheckCheck,
  Moon,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNotificationStore } from '../store/useNotificationStore';
import type { AppLanguage, AppNotificationItem, NotificationCategory } from '../types';
import { pickLang } from '../utils/i18n';
import { BottomSheet, EmptyStateCard, SecondaryButton } from './ui/DesignSystem';
import {
  RiffanBellIcon,
  RiffanMoviesIcon,
  RiffanSettingsGearIcon,
  RiffanSyncIcon,
  RiffanUsersIcon,
} from './ui/RiffanIcons';

interface NotificationCenterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: AppLanguage;
  onActionNotification?: (item: AppNotificationItem) => void;
}

const CATEGORY_TABS: Array<{
  id: NotificationCategory;
  es: string;
  ca: string;
  en: string;
}> = [
  { id: 'all', es: 'Todas', ca: 'Totes', en: 'All' },
  { id: 'invite', es: 'Invitaciones', ca: 'Invitacions', en: 'Invites' },
  { id: 'football', es: 'Fútbol', ca: 'Futbol', en: 'Football' },
  { id: 'series', es: 'Series', ca: 'Sèries', en: 'Series' },
  { id: 'update', es: 'App', ca: 'App', en: 'App' },
];

export const NotificationCenterSheet: React.FC<NotificationCenterSheetProps> = ({
  isOpen,
  onClose,
  lang = 'es',
  onActionNotification,
}) => {
  const notifications = useNotificationStore((s) => s.notifications);
  const activeFilter = useNotificationStore((s) => s.activeFilter);
  const preferences = useNotificationStore((s) => s.preferences);
  const setActiveFilter = useNotificationStore((s) => s.setActiveFilter);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const updatePreferences = useNotificationStore((s) => s.updatePreferences);

  const [showSettings, setShowSettings] = useState(false);

  const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt);
  const showAdvancedControls = sorted.length > 5;
  const filtered =
    !showAdvancedControls || activeFilter === 'all'
      ? sorted
      : sorted.filter((n) => n.category === activeFilter);

  const renderCategoryIcon = (cat: AppNotificationItem['category']) => {
    switch (cat) {
      case 'invite':
        return <RiffanUsersIcon size={17} animate="hover" />;
      case 'football':
        return <Trophy className="w-4 h-4 text-[#BF94FF]" />;
      case 'series':
        return <RiffanMoviesIcon size={17} animate="hover" />;
      case 'update':
        return <RiffanSyncIcon size={17} animate="hover" />;
      default:
        return <RiffanBellIcon size={17} animate="hover" />;
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={pickLang(lang, {
        es: 'Notificaciones',
        ca: 'Notificacions',
        en: 'Notifications',
      })}
      icon={<RiffanBellIcon size={20} animate={notifications.some((n) => !n.read) ? 'always' : 'hover'} />}
      maxWidth="sm:max-w-xl"
    >
      {/* Top Toolbar: hidden until > 5 notifications */}
      {showAdvancedControls ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {CATEGORY_TABS.map((tab) => {
              const active = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`min-h-12 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    active
                      ? 'bg-[#9146FF] text-white'
                      : 'bg-white/[0.045] text-[#EFEFF1] hover:bg-white/[0.1] border border-white/[0.08]'
                  }`}
                >
                  {pickLang(lang, tab)}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={markAllRead}
                className="min-h-12 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCheck className="w-4 h-4 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Leídas', ca: 'Llegides', en: 'Mark read' })}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className={`min-h-12 min-w-12 px-3 rounded-xl text-xs font-medium flex items-center justify-center cursor-pointer transition-colors ${
                showSettings
                  ? 'bg-[#9146FF]/20 text-white border border-[#9146FF]/45'
                  : 'bg-white/[0.045] border border-white/[0.08] text-[#EFEFF1] hover:bg-white/[0.1]'
              }`}
              aria-label={pickLang(lang, {
                es: 'Preferencias',
                ca: 'Preferències',
                en: 'Preferences',
              })}
            >
              <RiffanSettingsGearIcon size={16} animate="hover" />
            </button>
          </div>
        </div>
      ) : (
        notifications.some((n) => !n.read) && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={markAllRead}
              className="min-h-12 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-4 h-4 text-[#BF94FF]" />
              <span>{pickLang(lang, { es: 'Marcar leídas', ca: 'Marcar llegides', en: 'Mark read' })}</span>
            </button>
          </div>
        )
      )}

      {/* Preferences Drawer (only when > 5 alerts) */}
      {showAdvancedControls && showSettings && (
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Moon className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: `Horas de silencio (${preferences.quietStart} – ${preferences.quietEnd})`,
                  ca: `Hores de silenci (${preferences.quietStart} – ${preferences.quietEnd})`,
                  en: `Quiet hours (${preferences.quietStart} – ${preferences.quietEnd})`,
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                updatePreferences({ quietHoursEnabled: !preferences.quietHoursEnabled })
              }
              className={`min-h-12 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                preferences.quietHoursEnabled
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              {preferences.quietHoursEnabled
                ? pickLang(lang, { es: 'Activo', ca: 'Actiu', en: 'Active' })
                : pickLang(lang, { es: 'Desactivado', ca: 'Desactivat', en: 'Off' })}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['invites', { es: 'Invitaciones', ca: 'Invitacions', en: 'Invites' }],
                ['football', { es: 'Partidos', ca: 'Partits', en: 'Matches' }],
                ['series', { es: 'Episodios', ca: 'Episodis', en: 'Episodes' }],
                ['updates', { es: 'Novedades', ca: 'Novetats', en: 'Updates' }],
              ] as const
            ).map(([key, labels]) => (
              <button
                key={key}
                type="button"
                onClick={() => updatePreferences({ [key]: !preferences[key] })}
                className={`min-h-12 px-3 rounded-xl text-xs font-medium flex items-center justify-between border cursor-pointer ${
                  preferences[key]
                    ? 'bg-white/[0.07] border-white/15 text-white'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-500'
                }`}
              >
                <span>{pickLang(lang, labels)}</span>
                <span>{preferences[key] ? 'ON' : 'OFF'}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
            className="w-full min-h-12 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-xs font-medium text-zinc-200 flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {preferences.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#BF94FF]" />
              ) : (
                <VolumeX className="w-4 h-4 text-zinc-500" />
              )}
              <span>
                {pickLang(lang, {
                  es: 'Sonido de avisos',
                  ca: 'So d’avisos',
                  en: 'Alert sound',
                })}
              </span>
            </span>
            <span>
              {preferences.soundEnabled
                ? pickLang(lang, { es: 'Activado', ca: 'Activat', en: 'On' })
                : pickLang(lang, { es: 'Silenciado', ca: 'Silenciat', en: 'Muted' })}
            </span>
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">
          {pickLang(lang, {
            es: 'No tienes notificaciones.',
            ca: 'No tens notificacions.',
            en: 'No notifications.',
          })}
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`relative p-3.5 rounded-2xl border transition-colors duration-150 flex items-start justify-between gap-3 ${
                item.read
                  ? 'bg-white/[0.03] border-white/[0.07]'
                  : 'bg-[#9146FF]/[0.12] border-[#9146FF]/40'
              }`}
            >
              {!item.read && (
                <button
                  type="button"
                  onClick={() => markRead(item.id)}
                  aria-label={pickLang(lang, {
                    es: `Marcar ${item.title} como leída`,
                    ca: `Marcar ${item.title} com a llegida`,
                    en: `Mark ${item.title} as read`,
                  })}
                  className="absolute inset-0 z-0 rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                />
              )}

              <div className="relative z-[1] flex items-start gap-3 min-w-0 pointer-events-none">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  {renderCategoryIcon(item.category)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white line-clamp-1">{item.title}</h4>
                    {!item.read && <span className="w-2 h-2 rounded-full bg-[#9146FF] shrink-0" />}
                  </div>
                  <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed line-clamp-2">{item.body}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] font-mono text-zinc-500">
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {item.actionLabel && onActionNotification && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead(item.id);
                          onActionNotification(item);
                          onClose();
                        }}
                        className="relative z-10 pointer-events-auto min-h-12 px-3 rounded-xl text-xs font-bold text-[#BF94FF] hover:underline cursor-pointer"
                      >
                        {item.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNotification(item.id);
                }}
                className="relative z-10 min-h-12 min-w-12 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] flex items-center justify-center shrink-0 cursor-pointer"
                aria-label={pickLang(lang, {
                  es: 'Eliminar notificación',
                  ca: 'Eliminar notificació',
                  en: 'Delete notification',
                })}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdvancedControls && notifications.length > 0 && (
        <div className="pt-2 flex justify-end">
          <SecondaryButton onClick={clearAll}>
            <Trash2 className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Vaciar bandeja',
                ca: 'Buidar safata',
                en: 'Clear inbox',
              })}
            </span>
          </SecondaryButton>
        </div>
      )}
    </BottomSheet>
  );
};
