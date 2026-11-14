import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCheck,
  Film,
  Moon,
  RefreshCw,
  Settings,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNotificationStore } from '../store/useNotificationStore';
import type { AppNotificationItem, NotificationCategory } from '../types';
import { BottomSheet, EmptyStateCard, SecondaryButton } from './ui/DesignSystem';

interface NotificationCenterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onActionNotification?: (item: AppNotificationItem) => void;
}

const CATEGORY_TABS: Array<{ id: NotificationCategory; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'invite', label: 'Invitaciones' },
  { id: 'football', label: 'Fútbol' },
  { id: 'series', label: 'Series' },
  { id: 'update', label: 'App' },
];

export const NotificationCenterSheet: React.FC<NotificationCenterSheetProps> = ({
  isOpen,
  onClose,
  onActionNotification,
}) => {
  const {
    notifications,
    activeFilter,
    preferences,
    setActiveFilter,
    markRead,
    markAllRead,
    dismissNotification,
    clearAll,
    updatePreferences,
  } = useNotificationStore();

  const [showSettings, setShowSettings] = useState(false);

  const filtered =
    activeFilter === 'all'
      ? notifications
      : notifications.filter((n) => n.category === activeFilter);

  const renderCategoryIcon = (cat: AppNotificationItem['category']) => {
    switch (cat) {
      case 'invite':
        return <Users className="w-4 h-4 text-[#BF94FF]" />;
      case 'football':
        return <Trophy className="w-4 h-4 text-emerald-400" />;
      case 'series':
        return <Film className="w-4 h-4 text-sky-400" />;
      case 'update':
        return <RefreshCw className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-zinc-300" />;
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Notificaciones"
      subtitle="Invitaciones a salas, goles en directo, estrenos y actualizaciones"
      icon={<Bell className="w-5 h-5" />}
      maxWidth="sm:max-w-xl"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {CATEGORY_TABS.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-9 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-[#26262C] text-[#EFEFF1] hover:bg-white/[0.14]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              onClick={markAllRead}
              className="min-h-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer"
              title="Marcar todas como leídas"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Leídas</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className={`min-h-9 min-w-9 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              showSettings
                ? 'bg-[#9146FF]/20 text-white border border-[#9146FF]/45'
                : 'bg-[#26262C] text-[#EFEFF1] hover:bg-white/[0.14]'
            }`}
            aria-label="Preferencias de notificaciones"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preferences Drawer */}
      {showSettings && (
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Moon className="w-4 h-4 text-sky-400" />
              <span>Horas de silencio ({preferences.quietStart} – {preferences.quietEnd})</span>
            </div>
            <button
              type="button"
              onClick={() =>
                updatePreferences({ quietHoursEnabled: !preferences.quietHoursEnabled })
              }
              className={`min-h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${
                preferences.quietHoursEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              {preferences.quietHoursEnabled ? 'Activo' : 'Desactivado'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['invites', 'Invitaciones'],
                ['football', 'Goles y partidos'],
                ['series', 'Nuevos episodios'],
                ['updates', 'Actualizaciones App'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => updatePreferences({ [key]: !preferences[key] })}
                className={`min-h-10 px-3 rounded-xl text-xs font-medium flex items-center justify-between border cursor-pointer ${
                  preferences[key]
                    ? 'bg-white/[0.07] border-white/15 text-white'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-500'
                }`}
              >
                <span>{label}</span>
                <span>{preferences[key] ? 'ON' : 'OFF'}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
            className="w-full min-h-10 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-xs font-medium text-zinc-200 flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {preferences.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-zinc-500" />
              )}
              <span>Sonido de alertas en vivo</span>
            </span>
            <span>{preferences.soundEnabled ? 'Activado' : 'Silenciado'}</span>
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyStateCard
          icon={<BellOff className="w-6 h-6" />}
          title="Sin notificaciones pendientes"
          description="Cuando un amigo te invite a su sala, empiece un partido o haya una mejora de app, aparecerá aquí."
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => markRead(item.id)}
              className={`p-3.5 rounded-2xl border transition-colors flex items-start justify-between gap-3 ${
                item.read
                  ? 'bg-white/[0.02] border-white/[0.06]'
                  : 'bg-[#9146FF]/[0.12] border-[#9146FF]/35'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#26262C] border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  {renderCategoryIcon(item.category)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                    {!item.read && <span className="w-2 h-2 rounded-full bg-[#9146FF] shrink-0" />}
                  </div>
                  <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">{item.body}</p>
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
                        className="text-xs font-bold text-[#BF94FF] hover:underline cursor-pointer"
                      >
                        {item.actionLabel} →
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
                className="min-h-8 min-w-8 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] flex items-center justify-center shrink-0 cursor-pointer"
                aria-label="Descartar notificación"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="pt-2 flex justify-end">
          <SecondaryButton onClick={clearAll}>
            <Trash2 className="w-3.5 h-3.5" />
            <span>Vaciar bandeja</span>
          </SecondaryButton>
        </div>
      )}
    </BottomSheet>
  );
};
