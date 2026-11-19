import { CatalogMovie, FavoriteChannelItem } from '../types';
import { LruTtlCache } from '../shared/lruCache';
import {
  normalizeCatalogTitle,
  sanitizeItemKey,
  stripMediaPrefix,
} from './storageHistoryAndFriends';

export {
  sanitizeItemKey,
  stripMediaPrefix,
  normalizeCatalogTitle,
  canonicalizeHistoryItemId,
  isSameHistoryItem,
  deduplicateWatchHistory,
  getWatchHistory,
  saveWatchHistory,
  addWatchHistoryItem,
  updateWatchHistoryProgress,
  removeWatchHistoryItem,
  clearWatchHistory,
  deriveFriendCode,
  getSavedFriends,
  saveFriendsList,
  upsertLocalFriend,
  removeLocalFriend,
} from './storageHistoryAndFriends';

const catalogKeyCache = new LruTtlCache<string, string>(500, 15 * 60 * 1000);

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

export function getCatalogFavoriteKey(item: CatalogMovie): string {
  const cacheKey = `${item.mediaType || 'movie'}:${item.tmdbId || ''}:${item.id || ''}:${item.title || ''}`;
  const cached = catalogKeyCache.get(cacheKey);
  if (cached) return cached;

  const prefix = item.mediaType === 'tv' ? 'series' : 'movie';
  let computed = '';
  if (item.tmdbId && Number.isFinite(Number(item.tmdbId)) && Number(item.tmdbId) > 0) {
    computed = sanitizeItemKey(`${prefix}-${Number(item.tmdbId)}`);
  } else {
    const strippedId = stripMediaPrefix(item.id || '');
    if (strippedId) {
      computed = sanitizeItemKey(`${prefix}-${strippedId}`);
    } else {
      const normTitle = normalizeCatalogTitle(item.title || 'item').replace(/\s+/g, '-');
      computed = sanitizeItemKey(`${prefix}-${normTitle || 'item'}`);
    }
  }

  catalogKeyCache.set(cacheKey, computed);
  return computed;
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
    gnulaUrl: primary.gnulaUrl || secondary?.gnulaUrl,
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

