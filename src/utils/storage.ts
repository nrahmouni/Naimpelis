import { CatalogMovie, FavoriteChannelItem, SavedFriend, WatchHistoryItem } from '../types';

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

export const CATALAN_FUNNY_RANDOM_NAMES = [
  'Capsigrany',
  'Pocasoltes',
  'Carallot',
  'Tros de quòniam',
  'Cap de suro',
  'Baliga-balaga',
  'Estaquirot',
  'Sòmines',
  'Tòtil',
  'Babau',
  'Beneit',
  'Pàmfil',
  'Pallús',
  'Talòs',
  'Capgròs',
  'Pocavergonya',
  'Torrapipes',
  'Xafaxarcos',
  'Gambrús',
  'Gamarús',
  'Bleda',
  'Dropo',
  'Ximple',
  'Nyicris',
  'Malfainer',
  'Llampat',
  'Botifler',
  'Pelacanyes',
  "Tros d'ase",
  'Bajanap',
] as const;

export function generateRandomGuestName(excludeName?: string): string {
  const cleanExclude = String(excludeName || '').trim().toLowerCase();
  const pool = cleanExclude
    ? CATALAN_FUNNY_RANDOM_NAMES.filter((n) => n.toLowerCase() !== cleanExclude)
    : CATALAN_FUNNY_RANDOM_NAMES;
  const source = pool.length > 0 ? pool : CATALAN_FUNNY_RANDOM_NAMES;
  return source[Math.floor(Math.random() * source.length)];
}

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

export function getCatalogFavoriteKey(item: CatalogMovie): string {
  const prefix = item.mediaType === 'tv' ? 'series' : 'movie';
  if (item.tmdbId && Number.isFinite(Number(item.tmdbId)) && Number(item.tmdbId) > 0) {
    return sanitizeItemKey(`${prefix}-${Number(item.tmdbId)}`);
  }
  const strippedId = stripMediaPrefix(item.id || '');
  if (/^\d+$/.test(strippedId)) {
    return sanitizeItemKey(`${prefix}-${strippedId}`);
  }
  if (strippedId) {
    return sanitizeItemKey(`${prefix}-${strippedId}`);
  }
  const normTitle = normalizeCatalogTitle(item.title || 'item').replace(/\s+/g, '-');
  return sanitizeItemKey(`${prefix}-${normTitle || 'item'}`);
}

export function isSameCatalogItem(a: CatalogMovie, b: CatalogMovie): boolean {
  if (!a || !b) return false;
  const typeA = a.mediaType === 'tv' ? 'tv' : 'movie';
  const typeB = b.mediaType === 'tv' ? 'tv' : 'movie';
  if (typeA !== typeB) return false;

  if (
    a.tmdbId &&
    b.tmdbId &&
    Number(a.tmdbId) > 0 &&
    Number(a.tmdbId) === Number(b.tmdbId)
  ) {
    return true;
  }

  if (getCatalogFavoriteKey(a) === getCatalogFavoriteKey(b)) {
    return true;
  }

  const titleA = normalizeCatalogTitle(a.title);
  const titleB = normalizeCatalogTitle(b.title);
  if (titleA && titleB && titleA === titleB) {
    return true;
  }

  return false;
}

export function mergeCatalogItemMetadata(
  primary: CatalogMovie,
  secondary?: CatalogMovie
): CatalogMovie {
  const cleanId = stripMediaPrefix(primary.id || secondary?.id || '') || getCatalogFavoriteKey(primary);
  const inferredMovidy =
    primary.movidyUrl ||
    secondary?.movidyUrl ||
    (cleanId.startsWith('movidy-')
      ? `https://movidy.work/ver/${cleanId.replace(/^movidy-/, '')}`
      : undefined);
  const resolvedTmdbId = primary.tmdbId || secondary?.tmdbId;
  const inferredBingetrix =
    primary.bingetrixUrl ||
    secondary?.bingetrixUrl ||
    (resolvedTmdbId && (primary.mediaType || secondary?.mediaType) !== 'tv'
      ? `https://bingetrix.sc/watch/${resolvedTmdbId}`
      : undefined);

  return {
    ...secondary,
    ...primary,
    id: cleanId,
    tmdbId: resolvedTmdbId,
    mediaType: (primary.mediaType || secondary?.mediaType) === 'tv' ? 'tv' : 'movie',
    title: primary.title || secondary?.title || 'Película',
    year:
      primary.year && primary.year !== 'HD' && primary.year !== 'TV'
        ? primary.year
        : secondary?.year || primary.year || 'HD',
    rating: primary.rating || secondary?.rating || '',
    overview: primary.overview || secondary?.overview || '',
    poster: primary.poster || secondary?.poster || '',
    backdrop: primary.backdrop || secondary?.backdrop || primary.poster || '',
    movidyUrl: inferredMovidy,
    vestUrl: primary.vestUrl || secondary?.vestUrl,
    bingetrixUrl: inferredBingetrix,
    languages:
      primary.languages && primary.languages.length > 0
        ? primary.languages
        : secondary?.languages && secondary.languages.length > 0
        ? secondary.languages
        : ['Castellano', 'Latino', 'EN'],
  };
}

export function deduplicateWatchlist(items: CatalogMovie[]): CatalogMovie[] {
  if (!Array.isArray(items)) return [];
  const result: CatalogMovie[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object' || !rawItem.title) continue;
    const normalized = mergeCatalogItemMetadata(rawItem);
    const existingIdx = result.findIndex((x) => isSameCatalogItem(x, normalized));
    if (existingIdx === -1) {
      result.push(normalized);
    } else {
      result[existingIdx] = mergeCatalogItemMetadata(result[existingIdx], normalized);
    }
  }

  return result.slice(0, 80);
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
      color: '#9146FF',
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
          color: parsed.color || '#9146FF',
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
    color: '#9146FF',
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

export function saveRecentRooms(rooms: RecentRoomEntry[]): RecentRoomEntry[] {
  const normalized = Array.isArray(rooms)
    ? rooms
        .filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string')
        .slice(0, 4)
    : [];
  if (typeof window === 'undefined') return normalized;
  try {
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(normalized));
  } catch {
    // ignore
  }
  return normalized;
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
      if (Array.isArray(list)) {
        const deduped = deduplicateWatchlist(list);
        if (deduped.length !== list.length) {
          localStorage.setItem(WATCHLIST_KEY, JSON.stringify(deduped));
        }
        return deduped;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveWatchlist(items: CatalogMovie[]): CatalogMovie[] {
  const deduped = deduplicateWatchlist(items);
  if (typeof window === 'undefined') return deduped;
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(deduped));
  } catch {
    // ignore
  }
  return deduped;
}

export function toggleWatchlistItem(item: CatalogMovie): {
  list: CatalogMovie[];
  added: boolean;
  canonicalItem: CatalogMovie;
  removedKeys: string[];
} {
  const canonicalItem = mergeCatalogItemMetadata(item);
  if (typeof window === 'undefined') {
    return { list: [], added: false, canonicalItem, removedKeys: [] };
  }
  const current = getWatchlist();
  const matchingItems = current.filter((x) => isSameCatalogItem(x, canonicalItem));
  const exists = matchingItems.length > 0;

  const removedKeySet = new Set<string>();
  if (exists) {
    removedKeySet.add(getCatalogFavoriteKey(canonicalItem));
    if (item.id) removedKeySet.add(sanitizeItemKey(item.id));
    for (const m of matchingItems) {
      removedKeySet.add(getCatalogFavoriteKey(m));
      if (m.id) {
        removedKeySet.add(sanitizeItemKey(m.id));
        removedKeySet.add(sanitizeItemKey(`movie-${m.id}`));
        removedKeySet.add(sanitizeItemKey(`series-${m.id}`));
      }
    }
  }

  const next = exists
    ? current.filter((x) => !isSameCatalogItem(x, canonicalItem))
    : deduplicateWatchlist([canonicalItem, ...current]);

  saveWatchlist(next);
  return {
    list: next,
    added: !exists,
    canonicalItem,
    removedKeys: Array.from(removedKeySet),
  };
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
export function canonicalizeHistoryItemId(item: {
  id: string;
  mediaType?: 'movie' | 'tv';
  tmdbId?: number;
  season?: number;
  episode?: number;
}): string {
  if (item.mediaType === 'tv' && item.tmdbId) {
    return sanitizeItemKey(
      `tv-${item.tmdbId}-${item.season || 1}-${item.episode || 1}`
    );
  }
  if (item.tmdbId && Number(item.tmdbId) > 0) {
    return sanitizeItemKey(`movie-${Number(item.tmdbId)}`);
  }
  const stripped = stripMediaPrefix(item.id || '');
  return sanitizeItemKey(
    `${item.mediaType === 'tv' ? 'tv' : 'movie'}-${stripped || 'item'}`
  );
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
    vestUrl: entry.vestUrl || existing?.vestUrl,
    bingetrixUrl: entry.bingetrixUrl || existing?.bingetrixUrl,
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

// ============================================================================
// SAVED FRIENDS & FRIEND CODE HELPERS ('MIS AMIGOS')
// ============================================================================
const SAVED_FRIENDS_KEY = 'naimcine_friends_v1';

export function deriveFriendCode(userId: string): string {
  const clean = String(userId || 'user').trim();
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const code = (hash >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(-5);
  return code;
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

