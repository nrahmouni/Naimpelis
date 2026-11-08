import { RecentRoom } from '../types';

const USER_PROFILE_KEY = 'naimpelis_user_profile';
const RECENT_ROOMS_KEY = 'naimpelis_recent_rooms';

export interface StoredProfile {
  name: string;
  avatar: string;
  color: string;
}

export function getStoredProfile(): StoredProfile {
  if (typeof window === 'undefined') {
    return {
      name: `Cinéfilo_${Math.floor(Math.random() * 900 + 100)}`,
      avatar: '🍿',
      color: '#f43f5e',
    };
  }

  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.name && parsed.avatar) {
        return parsed;
      }
    }
  } catch {}

  return {
    name: `Cinéfilo_${Math.floor(Math.random() * 900 + 100)}`,
    avatar: '🍿',
    color: '#f43f5e',
  };
}

export function saveStoredProfile(profile: StoredProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

export function getRecentRooms(): RecentRoom[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.slice(0, 5);
    }
  } catch {}
  return [];
}

export function addRecentRoom(room: { id: string; name: string; lastVideoTitle?: string }) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentRooms().filter((r) => r.id !== room.id);
    const updated: RecentRoom[] = [
      {
        id: room.id,
        name: room.name,
        lastJoined: Date.now(),
        lastVideoTitle: room.lastVideoTitle,
      },
      ...existing,
    ].slice(0, 5);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
  } catch {}
}
