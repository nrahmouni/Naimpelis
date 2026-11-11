import { CatalogMovie, FavoriteChannelItem, WatchHistoryItem } from '../types';

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
const FAVORITE_CHANNELS_KEY = 'naimcine_fav_channels_v1';
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

export function sanitizeItemKey(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'item-1';
}

export function getCatalogFavoriteKey(item: CatalogMovie): string {
  if (item.tmdbId) {
    return sanitizeItemKey(`${item.mediaType === 'tv' ? 'series' : 'movie'}-${item.tmdbId}`);
  }
  return sanitizeItemKey(`${item.mediaType === 'tv' ? 'series' : 'movie'}-${item.id}`);
}

export function buildChannelFavId(channelUrl: string, channelLabel: string): string {
  // Deterministic alphanumeric hash + readable slug within 96 chars
  let hash = 0;
  const seed = `${channelUrl}|${channelLabel}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const slug = channelLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return sanitizeItemKey(`ch-${slug || 'live'}-${hash.toString(36)}`);
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

// ============================================================================
// FAVORITE MOVIES & TV SERIES ('MI LISTA / SERIES FAVORITAS')
// ============================================================================
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

export function saveWatchlist(items: CatalogMovie[]): CatalogMovie[] {
  if (typeof window === 'undefined') return items;
  const trimmed = items.slice(0, 80);
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  return trimmed;
}

export function toggleWatchlistItem(item: CatalogMovie): {
  list: CatalogMovie[];
  added: boolean;
} {
  if (typeof window === 'undefined') return { list: [], added: false };
  const current = getWatchlist();
  const key = getCatalogFavoriteKey(item);
  const exists = current.some((x) => getCatalogFavoriteKey(x) === key);
  const next = exists
    ? current.filter((x) => getCatalogFavoriteKey(x) !== key)
    : [item, ...current].slice(0, 80);

  saveWatchlist(next);
  return { list: next, added: !exists };
}

// ============================================================================
// FAVORITE LIVE SPORTS CHANNELS ('CANALES FAVORITOS')
// ============================================================================
export function getFavoriteChannels(): FavoriteChannelItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITE_CHANNELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 40);
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveFavoriteChannels(
  items: FavoriteChannelItem[]
): FavoriteChannelItem[] {
  if (typeof window === 'undefined') return items;
  const trimmed = items.slice(0, 40);
  try {
    localStorage.setItem(FAVORITE_CHANNELS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  return trimmed;
}

export function toggleFavoriteChannel(
  entry: Omit<FavoriteChannelItem, 'addedAt'>
): {
  list: FavoriteChannelItem[];
  added: boolean;
  item: FavoriteChannelItem;
} {
  const fullItem: FavoriteChannelItem = {
    ...entry,
    favId: sanitizeItemKey(entry.favId),
    addedAt: Date.now(),
  };
  if (typeof window === 'undefined') {
    return { list: [], added: false, item: fullItem };
  }
  const current = getFavoriteChannels();
  const exists = current.some((c) => c.favId === fullItem.favId);
  const next = exists
    ? current.filter((c) => c.favId !== fullItem.favId)
    : [fullItem, ...current].slice(0, 40);

  saveFavoriteChannels(next);
  return { list: next, added: !exists, item: fullItem };
}

// ============================================================================
// WATCH HISTORY & EXACT RESUME TIMESTAMPS ('SEGUIR VIENDO')
// ============================================================================
export function getWatchHistory(): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCH_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 30);
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveWatchHistory(items: WatchHistoryItem[]): WatchHistoryItem[] {
  if (typeof window === 'undefined') return items;
  const trimmed = items.slice(0, 30);
  try {
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  return trimmed;
}

export function addWatchHistoryItem(
  entry: Omit<WatchHistoryItem, 'watchedAt'>
): { list: WatchHistoryItem[]; item: WatchHistoryItem } {
  const cleanId = sanitizeItemKey(entry.id);
  const current = getWatchHistory();
  const existing = current.find((i) => sanitizeItemKey(i.id) === cleanId);

  const mergedItem: WatchHistoryItem = {
    ...entry,
    id: cleanId,
    resumeTimeSec:
      entry.resumeTimeSec !== undefined
        ? entry.resumeTimeSec
        : existing?.resumeTimeSec || 0,
    durationSec:
      entry.durationSec !== undefined
        ? entry.durationSec
        : existing?.durationSec || 0,
    watchedAt: Date.now(),
  };

  if (typeof window === 'undefined') {
    return { list: [mergedItem], item: mergedItem };
  }

  const filtered = current.filter((item) => sanitizeItemKey(item.id) !== cleanId);
  const next: WatchHistoryItem[] = [mergedItem, ...filtered].slice(0, 30);
  saveWatchHistory(next);
  return { list: next, item: mergedItem };
}

export function updateWatchHistoryProgress(
  rawId: string,
  resumeTimeSec: number,
  durationSec: number
): { list: WatchHistoryItem[]; updated?: WatchHistoryItem } {
  if (typeof window === 'undefined') return { list: [] };
  const cleanId = sanitizeItemKey(rawId);
  const current = getWatchHistory();
  const idx = current.findIndex((i) => sanitizeItemKey(i.id) === cleanId);
  if (idx === -1) return { list: current };

  const safeResume = Math.max(0, Math.min(86400, Math.floor(resumeTimeSec)));
  const safeDuration = Math.max(
    0,
    Math.min(86400, Math.floor(Number.isFinite(durationSec) ? durationSec : 0))
  );

  // If user reached >= 96% of total duration, reset resumeTimeSec to 0 (completed)
  const finalResume =
    safeDuration > 120 && safeResume / safeDuration >= 0.96 ? 0 : safeResume;

  const updatedItem: WatchHistoryItem = {
    ...current[idx],
    id: cleanId,
    resumeTimeSec: finalResume,
    durationSec: safeDuration || current[idx].durationSec || 0,
    watchedAt: Date.now(),
  };

  const next = [
    updatedItem,
    ...current.filter((_, i) => i !== idx),
  ].slice(0, 30);
  saveWatchHistory(next);
  return { list: next, updated: updatedItem };
}

export function removeWatchHistoryItem(id: string): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  const cleanId = sanitizeItemKey(id);
  const next = getWatchHistory().filter((item) => sanitizeItemKey(item.id) !== cleanId);
  saveWatchHistory(next);
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
