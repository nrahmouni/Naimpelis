import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, isTransientFirestoreError, OperationType } from '../../firebase';
import {
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  RoomQueueItem,
  SavedFriend,
  WatchHistoryItem,
} from '../../types';
import {
  canonicalizeHistoryItemId,
  deriveFriendCode,
  getCatalogFavoriteKey,
  isSameCatalogItem,
  isSameHistoryItem,
  mergeCatalogItemMetadata,
  normalizeCatalogTitle,
  sanitizeItemKey,
  stripMediaPrefix,
} from '../../utils/storage';
import {
  favoriteTitleToRawFavIds,
  knownFavoriteDocIds,
  knownFavoriteTitleKeys,
  knownFriendDocIds,
  knownHistoryDocIds,
  knownSavedRoomDocIds,
  normalizePreferLang,
  sanitizeHexColor,
  toMillis,
} from './cloudSyncSanitizers';
import {
  deleteCloudFavoriteById,
  deleteCloudWatchHistoryItem,
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  upsertCloudWatchHistory,
} from './cloudMediaSync';
import {
  deleteCloudFriend,
  deleteCloudSavedRoom,
  upsertCloudFriend,
  upsertCloudSavedRoom,
} from './cloudRoomsAndFriendsMutations';

export { deleteCloudFriend, deleteCloudSavedRoom, upsertCloudFriend, upsertCloudSavedRoom };

export function subscribeUserCloudCollections(
  uid: string,
  callbacks: {
    onWatchHistory: (items: WatchHistoryItem[]) => void;
    onFavorites: (
      watchlist: CatalogMovie[],
      channels: FavoriteChannelItem[]
    ) => void;
    onSavedRooms?: (rooms: CloudSavedRoom[]) => void;
    onFriends?: (friends: SavedFriend[]) => void;
  }
): () => void {
  const historyQuery = query(
    collection(db, 'watchHistory'),
    where('uid', '==', uid),
    limit(40)
  );
  const favoritesQuery = query(
    collection(db, 'favorites'),
    where('uid', '==', uid),
    limit(100)
  );
  const savedRoomsQuery = query(
    collection(db, 'savedRooms'),
    where('uid', '==', uid),
    limit(30)
  );
  const friendsQuery = query(
    collection(db, 'friends'),
    where('uid', '==', uid),
    limit(80)
  );

  const unsubHistory = onSnapshot(
    historyQuery,
    (snapshot) => {
      knownHistoryDocIds.clear();
      const rawDocs: { rawItemId: string; item: WatchHistoryItem }[] = [];
      snapshot.forEach((docSnap) => {
        knownHistoryDocIds.add(docSnap.id);
        const d = docSnap.data();
        const rawItemId = String(d.itemId || '');
        const candidate: WatchHistoryItem = {
          id: rawItemId,
          mediaType: d.mediaType === 'tv' ? 'tv' : 'movie',
          tmdbId: typeof d.tmdbId === 'number' ? d.tmdbId : undefined,
          title: String(d.title || ''),
          subtitle: d.subtitle ? String(d.subtitle) : undefined,
          poster: String(d.poster || ''),
          backdrop: d.backdrop ? String(d.backdrop) : undefined,
          year: d.year ? String(d.year) : undefined,
          season: typeof d.season === 'number' ? d.season : undefined,
          episode: typeof d.episode === 'number' ? d.episode : undefined,
          episodeTitle: d.episodeTitle ? String(d.episodeTitle) : undefined,
          preferLang: normalizePreferLang(d.preferLang),
          bingetrixUrl: d.bingetrixUrl ? String(d.bingetrixUrl) : undefined,
          movidyUrl: d.movidyUrl ? String(d.movidyUrl) : undefined,
          resumeTimeSec:
            typeof d.resumeTimeSec === 'number' ? d.resumeTimeSec : 0,
          durationSec: typeof d.durationSec === 'number' ? d.durationSec : 0,
          watchedAt: toMillis(d.updatedAt || d.createdAt),
        };
        rawDocs.push({ rawItemId, item: candidate });
      });

      rawDocs.sort((a, b) => b.item.watchedAt - a.item.watchedAt);

      const dedupedHistory: WatchHistoryItem[] = [];
      for (const entry of rawDocs) {
        const canonicalId = canonicalizeHistoryItemId(entry.item);
        const strippedSlug = stripMediaPrefix(entry.item.id || '');
        const inferredMovidy =
          entry.item.movidyUrl ||
          (strippedSlug.startsWith('movidy-')
            ? `https://movidy.work/ver/${strippedSlug.replace(/^movidy-/, '')}`
            : undefined);
        const normalized: WatchHistoryItem = {
          ...entry.item,
          id: canonicalId,
          movidyUrl: inferredMovidy,
        };

        const existingIdx = dedupedHistory.findIndex((x) =>
          isSameHistoryItem(x, normalized)
        );
        if (existingIdx !== -1) {
          const prev = dedupedHistory[existingIdx];
          dedupedHistory[existingIdx] = {
            ...normalized,
            ...prev,
            id: canonicalId,
            tmdbId: prev.tmdbId || normalized.tmdbId,
            movidyUrl: prev.movidyUrl || normalized.movidyUrl,
            bingetrixUrl: prev.bingetrixUrl || normalized.bingetrixUrl,
            resumeTimeSec: Math.max(
              prev.resumeTimeSec || 0,
              normalized.resumeTimeSec || 0
            ),
            durationSec: Math.max(prev.durationSec || 0, normalized.durationSec || 0),
          };
          if (entry.rawItemId) {
            deleteCloudWatchHistoryItem(entry.rawItemId).catch(() => {});
          }
        } else {
          dedupedHistory.push(normalized);
          if (entry.rawItemId && entry.rawItemId !== canonicalId) {
            deleteCloudWatchHistoryItem(entry.rawItemId).catch(() => {});
            upsertCloudWatchHistory(normalized).catch(() => {});
          }
        }
      }

      callbacks.onWatchHistory(dedupedHistory);
    },
    (error) => {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.LIST, 'watchHistory');
    }
  );

  const unsubFavorites = onSnapshot(
    favoritesQuery,
    (snapshot) => {
      knownFavoriteDocIds.clear();
      knownFavoriteTitleKeys.clear();
      favoriteTitleToRawFavIds.clear();

      const rawCatalogDocs: {
        rawFavId: string;
        updatedAtMs: number;
        item: CatalogMovie;
      }[] = [];
      const rawChannelDocs: FavoriteChannelItem[] = [];

      snapshot.forEach((docSnap) => {
        knownFavoriteDocIds.add(docSnap.id);
        const d = docSnap.data();
        const updatedAtMs = toMillis(d.updatedAt || d.createdAt);
        const rawFavId = String(d.favId || '');

        if (d.kind === 'channel') {
          if (d.channelUrl) {
            rawChannelDocs.push({
              favId: rawFavId,
              title: String(d.title || ''),
              channelLabel: String(d.channelLabel || d.title || 'Canal HD'),
              channelUrl: String(d.channelUrl),
              competition: String(d.competition || d.subtitle || 'Directo'),
              sport:
                d.sport === 'motor' ||
                d.sport === 'basketball' ||
                d.sport === 'tennis' ||
                d.sport === 'other'
                  ? d.sport
                  : 'soccer',
              poster: d.poster ? String(d.poster) : undefined,
              addedAt: updatedAtMs,
            });
          }
        } else {
          const isSeries = d.kind === 'series';
          const cleanBaseId = stripMediaPrefix(rawFavId);
          const storedUrl = typeof d.channelUrl === 'string' ? d.channelUrl.trim() : '';
          const tmdbId = typeof d.tmdbId === 'number' ? d.tmdbId : undefined;

          const movidyUrl =
            storedUrl.includes('movidy.')
              ? storedUrl
              : cleanBaseId.startsWith('movidy-')
              ? `https://movidy.work/ver/${cleanBaseId.replace(/^movidy-/, '')}`
              : undefined;

          const bingetrixUrl =
            storedUrl.includes('bingetrix')
              ? storedUrl
              : tmdbId && !isSeries
              ? `https://bingetrix.sc/watch/${tmdbId}`
              : undefined;

          rawCatalogDocs.push({
            rawFavId,
            updatedAtMs,
            item: {
              id: cleanBaseId || rawFavId,
              tmdbId,
              mediaType: isSeries ? 'tv' : 'movie',
              title: String(d.title || ''),
              year: String(d.year || (isSeries ? 'TV' : 'HD')),
              rating: String(d.rating || ''),
              overview: '',
              poster: String(d.poster || ''),
              backdrop: String(d.backdrop || d.poster || ''),
              movidyUrl,
              bingetrixUrl,
              languages: ['Castellano', 'Latino', 'EN'],
            },
          });
        }
      });

      rawCatalogDocs.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      rawChannelDocs.sort((a, b) => b.addedAt - a.addedAt);

      const dedupedWatchlist: CatalogMovie[] = [];
      for (const entry of rawCatalogDocs) {
        const canonicalItem = mergeCatalogItemMetadata(entry.item);
        const canonicalFavId = getCatalogFavoriteKey(canonicalItem);
        const titleKey = `${canonicalItem.mediaType === 'tv' ? 'tv' : 'movie'}:${normalizeCatalogTitle(canonicalItem.title)}`;

        let idSet = favoriteTitleToRawFavIds.get(titleKey);
        if (!idSet) {
          idSet = new Set<string>();
          favoriteTitleToRawFavIds.set(titleKey, idSet);
        }
        if (entry.rawFavId) idSet.add(entry.rawFavId);
        idSet.add(canonicalFavId);

        const existingIdx = dedupedWatchlist.findIndex((x) =>
          isSameCatalogItem(x, canonicalItem)
        );

        if (existingIdx !== -1) {
          dedupedWatchlist[existingIdx] = mergeCatalogItemMetadata(
            dedupedWatchlist[existingIdx],
            canonicalItem
          );
          if (entry.rawFavId) {
            deleteCloudFavoriteById(entry.rawFavId).catch(() => {});
          }
        } else {
          dedupedWatchlist.push(canonicalItem);
          knownFavoriteTitleKeys.add(titleKey);

          if (entry.rawFavId && entry.rawFavId !== canonicalFavId) {
            deleteCloudFavoriteById(entry.rawFavId).catch(() => {});
            upsertCloudCatalogFavorite(canonicalItem).catch(() => {});
          }
        }
      }

      const dedupedChannels: FavoriteChannelItem[] = [];
      const seenChannelKeys = new Set<string>();
      for (const ch of rawChannelDocs) {
        const key = `${sanitizeItemKey(ch.favId)}|${ch.channelUrl}`;
        if (seenChannelKeys.has(key)) {
          deleteCloudFavoriteById(ch.favId).catch(() => {});
          continue;
        }
        seenChannelKeys.add(key);
        dedupedChannels.push(ch);
      }

      callbacks.onFavorites(dedupedWatchlist, dedupedChannels);
    },
    (error) => {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.LIST, 'favorites');
    }
  );

  const unsubSavedRooms = onSnapshot(
    savedRoomsQuery,
    (snapshot) => {
      knownSavedRoomDocIds.clear();
      const roomsList: CloudSavedRoom[] = [];
      snapshot.forEach((docSnap) => {
        knownSavedRoomDocIds.add(docSnap.id);
        const d = docSnap.data();
        const rawQueue = Array.isArray(d.queueItems) ? d.queueItems : [];
        const parsedQueue: RoomQueueItem[] = rawQueue
          .filter(
            (q): q is Record<string, unknown> =>
              Boolean(q) && typeof q === 'object' && typeof (q as { title?: unknown }).title === 'string'
          )
          .map((q, idx: number) => ({
            id: String(q.id || `q-${idx}`),
            kind:
              q.kind === 'tv' || q.kind === 'youtube' || q.kind === 'direct'
                ? q.kind
                : 'movie',
            title: String(q.title || ''),
            subtitle: String(q.subtitle || 'HD'),
            poster: q.poster ? String(q.poster) : undefined,
            tmdbId: typeof q.tmdbId === 'number' ? q.tmdbId : undefined,
            season: typeof q.season === 'number' ? q.season : undefined,
            episode: typeof q.episode === 'number' ? q.episode : undefined,
            youtubeId: q.youtubeId ? String(q.youtubeId) : undefined,
            url: q.url ? String(q.url) : undefined,
            preferLang: normalizePreferLang(q.preferLang),
            addedBy: String(q.addedBy || 'Anfitrión'),
          }));

        roomsList.push({
          roomCode: String(d.roomCode || ''),
          roomName: String(d.roomName || `Sala ${String(d.roomCode || '').toUpperCase()}`),
          hasPin: Boolean(d.hasPin && d.pinCode),
          pinCode:
            d.hasPin && typeof d.pinCode === 'string' ? d.pinCode : undefined,
          hostOnlyControl: Boolean(d.hostOnlyControl),
          lastActiveTitle: d.lastActiveTitle ? String(d.lastActiveTitle) : undefined,
          queueItems: parsedQueue,
          updatedAt: toMillis(d.updatedAt || d.createdAt),
        });
      });

      roomsList.sort((a, b) => b.updatedAt - a.updatedAt);
      callbacks.onSavedRooms?.(roomsList);
    },
    (error) => {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.LIST, 'savedRooms');
    }
  );

  const unsubFriends = onSnapshot(
    friendsQuery,
    (snapshot) => {
      knownFriendDocIds.clear();
      const friendsList: SavedFriend[] = [];
      snapshot.forEach((docSnap) => {
        knownFriendDocIds.add(docSnap.id);
        const d = docSnap.data();
        const fId = String(d.friendId || '');
        if (!fId) return;
        friendsList.push({
          friendId: fId,
          name: String(d.friendName || 'Amigo'),
          avatar: String(d.friendAvatar || '🍿'),
          color: sanitizeHexColor(d.friendColor),
          friendCode: d.friendCode ? String(d.friendCode) : deriveFriendCode(fId),
          addedAt: toMillis(d.updatedAt || d.createdAt),
        });
      });

      friendsList.sort((a, b) => b.addedAt - a.addedAt);
      callbacks.onFriends?.(friendsList);
    },
    (error) => {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.LIST, 'friends');
    }
  );

  return () => {
    unsubHistory();
    unsubFavorites();
    unsubSavedRooms();
    unsubFriends();
  };
}

export async function migrateLocalStateToCloud(params: {
  localHistory: WatchHistoryItem[];
  localWatchlist: CatalogMovie[];
  localChannels: FavoriteChannelItem[];
  localFriends?: SavedFriend[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  for (const h of params.localHistory.slice(0, 15)) {
    const canonicalId = canonicalizeHistoryItemId(h);
    const docId = `${user.uid}_${canonicalId}`;
    if (!knownHistoryDocIds.has(docId)) {
      await upsertCloudWatchHistory({ ...h, id: canonicalId });
    }
  }

  for (const m of params.localWatchlist.slice(0, 25)) {
    const canonical = mergeCatalogItemMetadata(m);
    const docId = `${user.uid}_${getCatalogFavoriteKey(canonical)}`;
    const titleKey = `${canonical.mediaType === 'tv' ? 'tv' : 'movie'}:${normalizeCatalogTitle(canonical.title)}`;
    if (!knownFavoriteDocIds.has(docId) && !knownFavoriteTitleKeys.has(titleKey)) {
      await upsertCloudCatalogFavorite(canonical);
    }
  }

  for (const ch of params.localChannels.slice(0, 20)) {
    const docId = `${user.uid}_${sanitizeItemKey(ch.favId)}`;
    if (!knownFavoriteDocIds.has(docId)) {
      await upsertCloudChannelFavorite(ch);
    }
  }

  for (const fr of (params.localFriends || []).slice(0, 40)) {
    const docId = `${user.uid}_${sanitizeItemKey(fr.friendId)}`;
    if (!knownFriendDocIds.has(docId)) {
      await upsertCloudFriend(fr);
    }
  }
}
