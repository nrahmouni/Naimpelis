import type { User } from 'firebase/auth';
import type {
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  RoomQueueItem,
  SavedFriend,
  WatchHistoryItem,
} from '../../types';
import type { StoredCloudSession } from '../../utils/cloudSession';
import type { StoredProfile } from '../../utils/storage';
import { studioFetch } from '../../utils/studioApi';
import { normalizePreferLang, sanitizeHexColor } from './cloudSyncSanitizers';

export interface SqlAccountState {
  profile: StoredProfile | null;
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  watchHistory: WatchHistoryItem[];
  friends: SavedFriend[];
  savedRooms: CloudSavedRoom[];
}

interface RawSqlAccountResponse {
  ok?: boolean;
  sqlEnabled?: boolean;
  profile?: {
    userId?: string;
    displayName?: string;
    avatar?: string;
    color?: string;
  } | null;
  favorites?: Array<{
    favKey?: string;
    kind?: string;
    tmdbId?: number | null;
    title?: string;
    subtitle?: string | null;
    poster?: string | null;
    backdrop?: string | null;
    year?: string | null;
    rating?: string | null;
    mediaUrl?: string | null;
    channelLabel?: string | null;
    competition?: string | null;
    sport?: string | null;
    updatedAt?: string | number;
  }>;
  watchHistory?: Array<{
    itemKey?: string;
    mediaType?: string;
    tmdbId?: number | null;
    title?: string;
    subtitle?: string | null;
    poster?: string | null;
    backdrop?: string | null;
    year?: string | null;
    season?: number | null;
    episode?: number | null;
    episodeTitle?: string | null;
    preferLang?: string;
    bingetrixUrl?: string | null;
    movidyUrl?: string | null;
    resumeTimeSec?: number;
    durationSec?: number;
    watchedAt?: string | number;
  }>;
  friends?: Array<{
    friendId?: string;
    name?: string;
    avatar?: string;
    color?: string;
    friendCode?: string | null;
    addedAt?: string | number;
  }>;
  savedRooms?: Array<{
    roomCode?: string;
    roomName?: string;
    hasPin?: boolean;
    pinCode?: string | null;
    hostOnlyControl?: boolean;
    lastActiveTitle?: string | null;
    queueItems?: Record<string, unknown>[];
    updatedAt?: string | number;
  }>;
}

function toTimestampMs(val: unknown, fallback = Date.now()): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function toCloudUserLike(session: StoredCloudSession): User {
  const userLike = {
    uid: session.uid,
    email: session.email,
    displayName: session.displayName,
    photoURL: session.photoURL || null,
    emailVerified: true,
    isAnonymous: false,
    providerId: 'google.com',
    providerData: [
      {
        providerId: 'google.com',
        uid: session.uid,
        displayName: session.displayName,
        email: session.email,
        phoneNumber: null,
        photoURL: session.photoURL || null,
      },
    ],
    getIdToken: async () => session.cloudToken,
    getIdTokenResult: async () => ({ token: session.cloudToken }),
    reload: async () => undefined,
    delete: async () => undefined,
    toJSON: () => ({
      uid: session.uid,
      email: session.email,
      displayName: session.displayName,
      photoURL: session.photoURL || null,
    }),
  };
  return userLike as unknown as User;
}

export async function fetchSqlAccountState(): Promise<SqlAccountState | null> {
  try {
    const data = await studioFetch<RawSqlAccountResponse>('/api/account/state');
    if (!data?.sqlEnabled) return null;

    const profile: StoredProfile | null = data.profile?.userId
      ? {
          id: data.profile.userId,
          name: String(data.profile.displayName || 'Cineasta').slice(0, 24),
          avatar: String(data.profile.avatar || '🍿').slice(0, 16),
          color: sanitizeHexColor(data.profile.color),
          isCustomized: true,
        }
      : null;

    const watchlist: CatalogMovie[] = [];
    const favoriteChannels: FavoriteChannelItem[] = [];

    for (const fav of data.favorites || []) {
      const favKey = String(fav.favKey || '');
      if (fav.kind === 'channel') {
        if (!fav.mediaUrl) continue;
        favoriteChannels.push({
          favId: favKey,
          title: String(fav.title || ''),
          channelLabel: String(fav.channelLabel || fav.title || 'Canal HD'),
          channelUrl: String(fav.mediaUrl),
          competition: String(fav.competition || fav.subtitle || 'Directo'),
          sport:
            fav.sport === 'motor' ||
            fav.sport === 'basketball' ||
            fav.sport === 'tennis' ||
            fav.sport === 'other'
              ? fav.sport
              : 'soccer',
          poster: fav.poster || undefined,
          addedAt: toTimestampMs(fav.updatedAt),
        });
      } else {
        const isSeries = fav.kind === 'series';
        const mediaUrl = fav.mediaUrl || undefined;
        watchlist.push({
          id: favKey,
          tmdbId: typeof fav.tmdbId === 'number' ? fav.tmdbId : undefined,
          mediaType: isSeries ? 'tv' : 'movie',
          title: String(fav.title || ''),
          year: String(fav.year || (isSeries ? 'TV' : 'HD')),
          rating: String(fav.rating || ''),
          overview: '',
          poster: String(fav.poster || ''),
          backdrop: String(fav.backdrop || fav.poster || ''),
          movidyUrl: mediaUrl && mediaUrl.includes('movidy.') ? mediaUrl : undefined,
          bingetrixUrl: mediaUrl && mediaUrl.includes('bingetrix') ? mediaUrl : undefined,
          languages: ['Castellano', 'Latino', 'EN'],
        });
      }
    }

    const watchHistory: WatchHistoryItem[] = (data.watchHistory || []).map((h) => ({
      id: String(h.itemKey || ''),
      mediaType: h.mediaType === 'tv' ? 'tv' : 'movie',
      tmdbId: typeof h.tmdbId === 'number' ? h.tmdbId : undefined,
      title: String(h.title || ''),
      subtitle: h.subtitle || undefined,
      poster: String(h.poster || ''),
      backdrop: h.backdrop || undefined,
      year: h.year || undefined,
      season: typeof h.season === 'number' ? h.season : undefined,
      episode: typeof h.episode === 'number' ? h.episode : undefined,
      episodeTitle: h.episodeTitle || undefined,
      preferLang: normalizePreferLang(h.preferLang),
      bingetrixUrl: h.bingetrixUrl || undefined,
      movidyUrl: h.movidyUrl || undefined,
      resumeTimeSec: typeof h.resumeTimeSec === 'number' ? h.resumeTimeSec : 0,
      durationSec: typeof h.durationSec === 'number' ? h.durationSec : 0,
      watchedAt: toTimestampMs(h.watchedAt),
    }));

    const friends: SavedFriend[] = (data.friends || [])
      .filter((f) => Boolean(f.friendId))
      .map((f) => ({
        friendId: String(f.friendId),
        name: String(f.name || 'Amigo'),
        avatar: String(f.avatar || '🍿'),
        color: sanitizeHexColor(f.color),
        friendCode: f.friendCode || undefined,
        addedAt: toTimestampMs(f.addedAt),
      }));

    const savedRooms: CloudSavedRoom[] = (data.savedRooms || [])
      .filter((r) => Boolean(r.roomCode))
      .map((r) => ({
        roomCode: String(r.roomCode),
        roomName: String(r.roomName || `Sala ${String(r.roomCode).toUpperCase()}`),
        hasPin: Boolean(r.hasPin && r.pinCode),
        pinCode: r.hasPin && r.pinCode ? String(r.pinCode) : undefined,
        hostOnlyControl: Boolean(r.hostOnlyControl),
        lastActiveTitle: r.lastActiveTitle || undefined,
        queueItems: Array.isArray(r.queueItems)
          ? (r.queueItems as unknown as RoomQueueItem[])
          : [],
        updatedAt: toTimestampMs(r.updatedAt),
      }));

    return {
      profile,
      watchlist,
      favoriteChannels,
      watchHistory,
      friends,
      savedRooms,
    };
  } catch {
    return null;
  }
}
