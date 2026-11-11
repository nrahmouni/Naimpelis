import { CatalogMovie, WatchHistoryItem } from '../types';

export interface StoredProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isCustomized?: boolean;
}

export interface RecentRoomEntry {
  id: string;
  name: string;
  lastJoined: number;
  lastVideoTitle?: string;
}

const USER_PROFILE_KEY = 'naimcine_profile_v1';
const RECENT_ROOMS_KEY = 'naimcine_recent_rooms_v1';
const WATCHLIST_KEY = 'naimcine_watchlist_v1';
const WATCH_HISTORY_KEY = 'naimcine_watch_history_v1';
const GUEST_POPUP_DISMISSED_KEY = 'naimcine_guest_popup_dismissed_v1';

const RANDOM_GUEST_PREFIXES = [
  'Espectador_VIP',
  'Cineasta_Pro',
  'Invitado_Neon',
  'Butaca_Oro',
  'NaimSquad',
];

export function generateRandomGuestName(): string {
  const prefix =
    RANDOM_GUEST_PREFIXES[Math.floor(Math.random() * RANDOM_GUEST_PREFIXES.length)];
  return `${prefix}_${Math.floor(Math.random() * 89 + 10)}`;
}

export function getStoredProfile(): StoredProfile {
  const fallbackId = `u-${Math.random().toString(36).slice(2, 10)}`;
  const fallbackName = generateRandomGuestName();

  if (typeof window === 'undefined') {
    return {
      id: fallbackId,
      name: fallbackName,
      avatar: '🍿',
      color: '#e11d48',
      isCustomized: false,
    };
  }

  try {
    const raw =
      localStorage.getItem(USER_PROFILE_KEY) ||
      localStorage.getItem('w2g_cinema_profile_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.name && parsed.avatar) {
        return {
          id: parsed.id || fallbackId,
          name: parsed.name,
          avatar: parsed.avatar,
          color: parsed.color || '#e11d48',
          isCustomized: Boolean(parsed.isCustomized),
        };
      }
    }
  } catch {
    // ignore storage errors
  }

  const initial: StoredProfile = {
    id: fallbackId,
    name: fallbackName,
    avatar: '🍿',
    color: '#e11d48',
    isCustomized: false,
  };
  saveStoredProfile(initial, false);
  return initial;
}

export function saveStoredProfile(profile: StoredProfile, markCustomized = true) {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredProfile = {
      ...profile,
      isCustomized: markCustomized ? true : Boolean(profile.isCustomized),
    };
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function wasGuestPopupDismissed(roomId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(`${GUEST_POPUP_DISMISSED_KEY}_${roomId}`) === '1';
  } catch {
    return false;
  }
}

export function dismissGuestPopupForRoom(roomId: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${GUEST_POPUP_DISMISSED_KEY}_${roomId}`, '1');
  } catch {
    // ignore
  }
}

export function getRecentRooms(): RecentRoomEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw =
      localStorage.getItem(RECENT_ROOMS_KEY) ||
      localStorage.getItem('w2g_recent_rooms_v2');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.slice(0, 4);
    }
  } catch {
    // ignore
  }
  return [];
}

export function addRecentRoom(room: {
  id: string;
  name: string;
  lastVideoTitle?: string;
}) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentRooms().filter((r) => r.id !== room.id);
    const updated: RecentRoomEntry[] = [
      {
        id: room.id,
        name: room.name,
        lastJoined: Date.now(),
        lastVideoTitle: room.lastVideoTitle,
      },
      ...existing,
    ].slice(0, 4);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function getWatchlist(): CatalogMovie[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {
    // ignore
  }
  return [];
}

export function toggleWatchlistItem(item: CatalogMovie): CatalogMovie[] {
  if (typeof window === 'undefined') return [];
  const current = getWatchlist();
  const key = item.tmdbId ? `${item.mediaType || 'movie'}-${item.tmdbId}` : item.id;
  const exists = current.some(
    (x) => (x.tmdbId ? `${x.mediaType || 'movie'}-${x.tmdbId}` : x.id) === key
  );
  const next = exists
    ? current.filter(
        (x) => (x.tmdbId ? `${x.mediaType || 'movie'}-${x.tmdbId}` : x.id) !== key
      )
    : [item, ...current].slice(0, 60);

  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

// ============================================================================
// LOCAL WATCH HISTORY ('HISTORIAL DE VISUALIZACIÓN' FOR CINE · SERIES)
// ============================================================================
export function getWatchHistory(): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCH_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 18);
    }
  } catch {
    // ignore
  }
  return [];
}

export function addWatchHistoryItem(
  entry: Omit<WatchHistoryItem, 'watchedAt'>
): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  const current = getWatchHistory();
  const filtered = current.filter((item) => item.id !== entry.id);
  const next: WatchHistoryItem[] = [
    {
      ...entry,
      watchedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, 18);

  try {
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function removeWatchHistoryItem(id: string): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  const next = getWatchHistory().filter((item) => item.id !== id);
  try {
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearWatchHistory(): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    localStorage.removeItem(WATCH_HISTORY_KEY);
  } catch {
    // ignore
  }
  return [];
}
