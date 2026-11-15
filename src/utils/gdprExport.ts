import { clearCloudWatchHistoryItems } from '../services/userCloudSync';
import type { CatalogMovie, FavoriteChannelItem, SavedFriend, WatchHistoryItem } from '../types';
import {
  getFavoriteChannels,
  getRecentRooms,
  getSavedFriends,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  saveFavoriteChannels,
  saveFriendsList,
  saveRecentRooms,
  saveStoredProfile,
  saveWatchHistory,
  saveWatchlist,
  type RecentRoomEntry,
  type StoredProfile,
} from './storage';

export interface GdprImportResult {
  ok: boolean;
  restored: {
    profile: boolean;
    watchlistCount: number;
    historyCount: number;
    channelsCount: number;
    friendsCount: number;
    roomsCount: number;
  };
  error?: string;
}

export function exportUserDataAsJson(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'NAIM CINE',
    version: 2,
    profile: getStoredProfile(),
    watchlist: getWatchlist(),
    watchHistory: getWatchHistory(),
    favoriteChannels: getFavoriteChannels(),
    savedFriends: getSavedFriends(),
    recentRooms: getRecentRooms(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `naim-cine-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function importUserDataFromJson(rawJsonText: string): GdprImportResult {
  const emptyCounts = {
    profile: false,
    watchlistCount: 0,
    historyCount: 0,
    channelsCount: 0,
    friendsCount: 0,
    roomsCount: 0,
  };
  try {
    const parsed = JSON.parse(String(rawJsonText || '')) as {
      app?: string;
      profile?: Partial<StoredProfile>;
      watchlist?: CatalogMovie[];
      watchHistory?: WatchHistoryItem[];
      favoriteChannels?: FavoriteChannelItem[];
      savedFriends?: SavedFriend[];
      recentRooms?: RecentRoomEntry[];
    };
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, restored: emptyCounts, error: 'Archivo JSON inválido' };
    }

    const counts = { ...emptyCounts };

    if (parsed.profile && typeof parsed.profile === 'object' && parsed.profile.name) {
      const current = getStoredProfile();
      saveStoredProfile(
        {
          id: String(parsed.profile.id || current.id),
          name: String(parsed.profile.name).slice(0, 40),
          avatar: String(parsed.profile.avatar || current.avatar || '🍿').slice(0, 16),
          color: String(parsed.profile.color || current.color || '#9146FF'),
          isCustomized: true,
        },
        true
      );
      counts.profile = true;
    }

    if (Array.isArray(parsed.watchlist)) {
      const mergedWatchlist = saveWatchlist([...parsed.watchlist, ...getWatchlist()]);
      counts.watchlistCount = mergedWatchlist.length;
    }

    if (Array.isArray(parsed.watchHistory)) {
      const mergedHistory = saveWatchHistory([...parsed.watchHistory, ...getWatchHistory()]);
      counts.historyCount = mergedHistory.length;
    }

    if (Array.isArray(parsed.favoriteChannels)) {
      const existingIds = new Set(getFavoriteChannels().map((c) => c.favId));
      const mergedChannels = [
        ...getFavoriteChannels(),
        ...parsed.favoriteChannels.filter((c) => c && c.favId && !existingIds.has(c.favId)),
      ];
      saveFavoriteChannels(mergedChannels);
      counts.channelsCount = mergedChannels.length;
    }

    if (Array.isArray(parsed.savedFriends)) {
      const existingFriends = getSavedFriends();
      const existingSet = new Set(existingFriends.map((f) => f.friendId));
      const mergedFriends = [
        ...existingFriends,
        ...parsed.savedFriends.filter((f) => f && f.friendId && !existingSet.has(f.friendId)),
      ];
      saveFriendsList(mergedFriends);
      counts.friendsCount = mergedFriends.length;
    }

    if (Array.isArray(parsed.recentRooms)) {
      const existingRooms = getRecentRooms();
      const seenIds = new Set(existingRooms.map((r) => r.id));
      const mergedRooms = [
        ...existingRooms,
        ...parsed.recentRooms.filter((r) => r && r.id && !seenIds.has(r.id)),
      ];
      saveRecentRooms(mergedRooms);
      counts.roomsCount = mergedRooms.length;
    }

    return { ok: true, restored: counts };
  } catch (err) {
    return {
      ok: false,
      restored: emptyCounts,
      error: err instanceof Error ? err.message : 'No se pudo analizar el JSON',
    };
  }
}

export async function purgeLocalAndCloudHistory(): Promise<void> {
  const history = getWatchHistory();
  await clearCloudWatchHistoryItems(history).catch(() => {});
  const shouldPurgeKey = (key: string | null): boolean =>
    Boolean(
      key &&
        (key.startsWith('naimcine_') ||
          key.startsWith('naim_') ||
          key.startsWith('w2g_'))
    );
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (shouldPurgeKey(key) && key) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore storage access errors
  }
  try {
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (shouldPurgeKey(key) && key) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Ignore sessionStorage errors
  }
}
