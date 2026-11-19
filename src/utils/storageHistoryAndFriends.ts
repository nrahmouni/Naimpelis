import { SavedFriend, WatchHistoryItem } from '../types';

export const WATCH_HISTORY_KEY = 'naimcine_watch_history_v1';
export const SAVED_FRIENDS_KEY = 'naimcine_friends_v1';

export function sanitizeItemKey(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'item-1';
}

export function stripMediaPrefix(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^(?:(?:movie|series|tv|es-movie|bingetrix-movie)-)+/i, '');
}

export function normalizeCatalogTitle(rawTitle: string): string {
  return String(rawTitle || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalizeHistoryItemId(item: {
  id: string;
  mediaType?: 'movie' | 'tv';
  tmdbId?: number;
  season?: number;
  episode?: number;
}): string {
  if (item.mediaType === 'tv' && item.tmdbId) {
    return sanitizeItemKey(`tv-${item.tmdbId}-${item.season || 1}-${item.episode || 1}`);
  }
  if (item.tmdbId && Number(item.tmdbId) > 0) {
    return sanitizeItemKey(`movie-${Number(item.tmdbId)}`);
  }
  const stripped = stripMediaPrefix(item.id || '');
  return sanitizeItemKey(`${item.mediaType === 'tv' ? 'tv' : 'movie'}-${stripped || 'item'}`);
}

export function isSameHistoryItem(a: WatchHistoryItem, b: WatchHistoryItem): boolean {
  if (!a || !b) return false;
  if (a.mediaType !== b.mediaType) return false;
  if (canonicalizeHistoryItemId(a) === canonicalizeHistoryItemId(b)) return true;
  if (a.mediaType === 'tv') {
    if (
      a.tmdbId &&
      b.tmdbId &&
      a.tmdbId === b.tmdbId &&
      (a.season || 1) === (b.season || 1) &&
      (a.episode || 1) === (b.episode || 1)
    ) {
      return true;
    }
    return false;
  }
  if (a.tmdbId && b.tmdbId && a.tmdbId === b.tmdbId) return true;
  const tA = normalizeCatalogTitle(a.title);
  const tB = normalizeCatalogTitle(b.title);
  return Boolean(tA && tB && tA === tB);
}

export function deduplicateWatchHistory(items: WatchHistoryItem[]): WatchHistoryItem[] {
  if (!Array.isArray(items)) return [];
  const result: WatchHistoryItem[] = [];
  for (const raw of items) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !raw.title ||
      String(raw.movidyUrl || '').startsWith('arcade://') ||
      String(raw.bingetrixUrl || '').startsWith('arcade://') ||
      String(raw.id || '').startsWith('arcade')
    ) {
      continue;
    }
    const cleanId = canonicalizeHistoryItemId(raw);
    const strippedSlug = stripMediaPrefix(raw.id || '');
    const inferredMovidy =
      raw.movidyUrl ||
      (strippedSlug.startsWith('movidy-')
        ? `https://movidy.work/ver/${strippedSlug.replace(/^movidy-/, '')}`
        : undefined);
    const normalized: WatchHistoryItem = {
      ...raw,
      id: cleanId,
      movidyUrl: inferredMovidy,
    };
    const existingIdx = result.findIndex((x) => isSameHistoryItem(x, normalized));
    if (existingIdx === -1) {
      result.push(normalized);
    } else {
      const prev = result[existingIdx];
      result[existingIdx] = {
        ...normalized,
        ...prev,
        id: cleanId,
        tmdbId: prev.tmdbId || normalized.tmdbId,
        movidyUrl: prev.movidyUrl || normalized.movidyUrl,
        bingetrixUrl: prev.bingetrixUrl || normalized.bingetrixUrl,
        resumeTimeSec: Math.max(prev.resumeTimeSec || 0, normalized.resumeTimeSec || 0),
        durationSec: Math.max(prev.durationSec || 0, normalized.durationSec || 0),
        watchedAt: Math.max(prev.watchedAt || 0, normalized.watchedAt || 0),
      };
    }
  }
  return result.slice(0, 30);
}

export function getWatchHistory(): WatchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    localStorage.removeItem('naim_arcade_save_v1');
    const raw = localStorage.getItem(WATCH_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deduped = deduplicateWatchHistory(parsed);
        if (deduped.length !== parsed.length) {
          localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(deduped));
        }
        return deduped;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveWatchHistory(items: WatchHistoryItem[]): WatchHistoryItem[] {
  const deduped = deduplicateWatchHistory(items);
  if (typeof window === 'undefined') return deduped;
  try {
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(deduped));
  } catch {
    // ignore
  }
  return deduped;
}

export function addWatchHistoryItem(
  entry: Omit<WatchHistoryItem, 'watchedAt'>
): { list: WatchHistoryItem[]; item: WatchHistoryItem } {
  const cleanId = canonicalizeHistoryItemId(entry);
  const current = getWatchHistory();
  const tempCandidate: WatchHistoryItem = {
    ...entry,
    id: cleanId,
    watchedAt: Date.now(),
  };
  const existing = current.find((i) => isSameHistoryItem(i, tempCandidate));

  const strippedSlug = stripMediaPrefix(entry.id || '');
  const inferredMovidy =
    entry.movidyUrl ||
    existing?.movidyUrl ||
    (strippedSlug.startsWith('movidy-')
      ? `https://movidy.work/ver/${strippedSlug.replace(/^movidy-/, '')}`
      : undefined);

  const mergedItem: WatchHistoryItem = {
    ...existing,
    ...entry,
    id: cleanId,
    tmdbId: entry.tmdbId || existing?.tmdbId,
    movidyUrl: inferredMovidy,
    gnulaUrl: entry.gnulaUrl || existing?.gnulaUrl,
    vestUrl: entry.vestUrl || existing?.vestUrl,
    bingetrixUrl: entry.bingetrixUrl || existing?.bingetrixUrl,
    resumeTimeSec:
      entry.resumeTimeSec !== undefined ? entry.resumeTimeSec : existing?.resumeTimeSec || 0,
    durationSec:
      entry.durationSec !== undefined ? entry.durationSec : existing?.durationSec || 0,
    watchedAt: Date.now(),
  };

  if (typeof window === 'undefined') {
    return { list: [mergedItem], item: mergedItem };
  }

  const filtered = current.filter((item) => !isSameHistoryItem(item, mergedItem));
  const next: WatchHistoryItem[] = saveWatchHistory([mergedItem, ...filtered]);
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

  const finalResume =
    safeDuration > 120 && safeResume / safeDuration >= 0.96 ? 0 : safeResume;

  const updatedItem: WatchHistoryItem = {
    ...current[idx],
    id: cleanId,
    resumeTimeSec: finalResume,
    durationSec: safeDuration || current[idx].durationSec || 0,
    watchedAt: Date.now(),
  };

  const next = [updatedItem, ...current.filter((_, i) => i !== idx)].slice(0, 30);
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

export function deriveFriendCode(userId: string): string {
  const clean = String(userId || 'user').trim();
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(-5);
}

export function getSavedFriends(): SavedFriend[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_FRIENDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 80);
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveFriendsList(items: SavedFriend[]): SavedFriend[] {
  if (typeof window === 'undefined') return items;
  const trimmed = items.slice(0, 80);
  try {
    localStorage.setItem(SAVED_FRIENDS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  return trimmed;
}

export function upsertLocalFriend(
  entry: Omit<SavedFriend, 'addedAt'>
): { list: SavedFriend[]; friend: SavedFriend; isNew: boolean } {
  const cleanId = sanitizeItemKey(entry.friendId);
  const current = getSavedFriends();
  const existing = current.find(
    (f) =>
      sanitizeItemKey(f.friendId) === cleanId ||
      (entry.friendCode &&
        f.friendCode &&
        f.friendCode.toUpperCase() === entry.friendCode.toUpperCase())
  );

  const friend: SavedFriend = {
    friendId: cleanId,
    name: (entry.name || 'Amigo').trim().slice(0, 40) || 'Amigo',
    avatar: (entry.avatar || '🍿').trim().slice(0, 16) || '🍿',
    color: /^#[0-9a-fA-F]{3,8}$/.test((entry.color || '').trim())
      ? entry.color.trim()
      : '#9146FF',
    friendCode:
      entry.friendCode?.trim().toUpperCase() ||
      existing?.friendCode ||
      deriveFriendCode(cleanId),
    addedAt: existing?.addedAt || Date.now(),
  };

  const filtered = current.filter(
    (f) =>
      sanitizeItemKey(f.friendId) !== cleanId &&
      !(
        friend.friendCode &&
        f.friendCode &&
        f.friendCode.toUpperCase() === friend.friendCode.toUpperCase()
      )
  );
  const next = [friend, ...filtered].slice(0, 80);
  saveFriendsList(next);
  return { list: next, friend, isNew: !existing };
}

export function removeLocalFriend(friendId: string): SavedFriend[] {
  if (typeof window === 'undefined') return [];
  const cleanId = sanitizeItemKey(friendId);
  const next = getSavedFriends().filter(
    (f) => sanitizeItemKey(f.friendId) !== cleanId && f.friendCode !== friendId.toUpperCase()
  );
  saveFriendsList(next);
  return next;
}
