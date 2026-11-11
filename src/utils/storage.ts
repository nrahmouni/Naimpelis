import { CatalogMovie } from '../types';

export interface StoredProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
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

export function getStoredProfile(): StoredProfile {
  const fallbackId = `u-${Math.random().toString(36).slice(2, 10)}`;
  const fallbackName = `Cineasta_${Math.floor(Math.random() * 900 + 100)}`;

  if (typeof window === 'undefined') {
    return {
      id: fallbackId,
      name: fallbackName,
      avatar: '🍿',
      color: '#e11d48',
    };
  }

  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY) || localStorage.getItem('w2g_cinema_profile_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.name && parsed.avatar) {
        return {
          id: parsed.id || fallbackId,
          name: parsed.name,
          avatar: parsed.avatar,
          color: parsed.color || '#e11d48',
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
  };
  saveStoredProfile(initial);
  return initial;
}

export function saveStoredProfile(profile: StoredProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}

export function getRecentRooms(): RecentRoomEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY) || localStorage.getItem('w2g_recent_rooms_v2');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.slice(0, 4);
    }
  } catch {
    // ignore
  }
  return [];
}

export function addRecentRoom(room: { id: string; name: string; lastVideoTitle?: string }) {
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
