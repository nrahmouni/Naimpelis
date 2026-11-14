import { clearCloudWatchHistoryItems } from '../services/userCloudSync';
import {
  getFavoriteChannels,
  getRecentRooms,
  getStoredProfile,
  getWatchHistory,
} from './storage';

export function exportUserDataAsJson(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'NAIM CINE',
    profile: getStoredProfile(),
    watchHistory: getWatchHistory(),
    favoriteChannels: getFavoriteChannels(),
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

export async function purgeLocalAndCloudHistory(): Promise<void> {
  const history = getWatchHistory();
  await clearCloudWatchHistoryItems(history).catch(() => {});
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('naimcine_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore storage access errors
  }
}
