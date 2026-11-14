import { create } from 'zustand';
import type {
  AppNotificationItem,
  NotificationCategory,
  NotificationPreferences,
} from '../types';

const NOTIF_STORAGE_KEY = 'naimcine_notifications_v1';

interface NotificationState {
  notifications: AppNotificationItem[];
  activeFilter: NotificationCategory;
  preferences: NotificationPreferences;
  setActiveFilter: (filter: NotificationCategory) => void;
  pushNotification: (
    item: Omit<AppNotificationItem, 'id' | 'createdAt' | 'read'> & { id?: string }
  ) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  updatePreferences: (patch: Partial<NotificationPreferences>) => void;
  isWithinQuietHours: () => boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  invites: true,
  football: true,
  series: true,
  updates: true,
  soundEnabled: true,
  quietHoursEnabled: false,
  quietStart: '23:00',
  quietEnd: '08:00',
};

function loadInitialNotifications(): {
  notifications: AppNotificationItem[];
  preferences: NotificationPreferences;
} {
  if (typeof localStorage === 'undefined') {
    return { notifications: [], preferences: DEFAULT_PREFERENCES };
  }
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return { notifications: [], preferences: DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as {
      notifications?: AppNotificationItem[];
      preferences?: Partial<NotificationPreferences>;
    };
    return {
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(0, 60) : [],
      preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) },
    };
  } catch {
    return { notifications: [], preferences: DEFAULT_PREFERENCES };
  }
}

function saveNotifications(state: Pick<NotificationState, 'notifications' | 'preferences'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      NOTIF_STORAGE_KEY,
      JSON.stringify({
        notifications: state.notifications.slice(0, 60),
        preferences: state.preferences,
      })
    );
  } catch {
    // ignore storage errors
  }
}

function checkQuietHours(prefs: NotificationPreferences): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = prefs.quietStart.split(':').map(Number);
  const [eh, em] = prefs.quietEnd.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return false;
  const startMins = (sh || 0) * 60 + (sm || 0);
  const endMins = (eh || 0) * 60 + (em || 0);
  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins < endMins;
  }
  return currentMins >= startMins || currentMins < endMins;
}

const initial = loadInitialNotifications();

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: initial.notifications,
  activeFilter: 'all',
  preferences: initial.preferences,

  setActiveFilter: (activeFilter) => set({ activeFilter }),

  pushNotification: (item) => {
    const state = get();
    const prefs = state.preferences;
    if (item.category === 'invite' && !prefs.invites) return;
    if (item.category === 'football' && !prefs.football) return;
    if (item.category === 'series' && !prefs.series) return;
    if (item.category === 'update' && !prefs.updates) return;

    const now = Date.now();
    // Deduplicate identical titles within 2 minutes
    const duplicate = state.notifications.find(
      (n) => n.title === item.title && n.category === item.category && now - n.createdAt < 120_000
    );
    if (duplicate) return;

    const nextItem: AppNotificationItem = {
      id: item.id || `notif-${now}-${Math.random().toString(36).slice(2, 6)}`,
      category: item.category,
      title: item.title,
      body: item.body,
      createdAt: now,
      read: false,
      actionLabel: item.actionLabel,
      roomId: item.roomId,
      eventId: item.eventId,
      tmdbId: item.tmdbId,
    };

    const nextList = [nextItem, ...state.notifications].slice(0, 60);
    set({ notifications: nextList });
    saveNotifications({ notifications: nextList, preferences: state.preferences });
  },

  markRead: (id) => {
    const state = get();
    const nextList = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    set({ notifications: nextList });
    saveNotifications({ notifications: nextList, preferences: state.preferences });
  },

  markAllRead: () => {
    const state = get();
    const nextList = state.notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: nextList });
    saveNotifications({ notifications: nextList, preferences: state.preferences });
  },

  dismissNotification: (id) => {
    const state = get();
    const nextList = state.notifications.filter((n) => n.id !== id);
    set({ notifications: nextList });
    saveNotifications({ notifications: nextList, preferences: state.preferences });
  },

  clearAll: () => {
    const state = get();
    set({ notifications: [] });
    saveNotifications({ notifications: [], preferences: state.preferences });
  },

  updatePreferences: (patch) => {
    const state = get();
    const nextPrefs = { ...state.preferences, ...patch };
    set({ preferences: nextPrefs });
    saveNotifications({ notifications: state.notifications, preferences: nextPrefs });
  },

  isWithinQuietHours: () => checkQuietHours(get().preferences),
}));
