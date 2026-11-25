import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isTransientFirestoreError,
  OperationType,
} from '../../firebase';
import {
  CatalogMovie,
  FavoriteChannelItem,
  WatchHistoryItem,
} from '../../types';
import {
  canonicalizeHistoryItemId,
  getCatalogFavoriteKey,
  mergeCatalogItemMetadata,
  normalizeCatalogTitle,
  sanitizeItemKey,
} from '../../utils/storage';
import {
  clampNumber,
  clampOptionalPositiveInt,
  clampString,
  enqueueDocWrite,
  favoriteTitleToRawFavIds,
  isNotFoundError,
  knownFavoriteDocIds,
  knownFavoriteTitleKeys,
  knownHistoryDocIds,
  normalizePreferLang,
  optionalClampedString,
  shouldSkipStaleCloudWrite,
  toMillis,
} from './cloudSyncSanitizers';

function buildWatchHistoryFields(uid: string, item: WatchHistoryItem) {
  const itemId = canonicalizeHistoryItemId(item);
  const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
  const preferLang = normalizePreferLang(item.preferLang);
  const safePoster = clampString(item.poster, 600, '/icon.svg');
  const safeBackdrop = clampString(
    item.backdrop || item.poster,
    600,
    safePoster || '/icon.svg'
  );

  const base: Record<string, unknown> = {
    uid,
    itemId,
    mediaType,
    title: clampString(item.title, 200, 'RiffanTV'),
    subtitle: clampString(item.subtitle, 240, 'HD'),
    poster: safePoster,
    backdrop: safeBackdrop,
    preferLang,
    resumeTimeSec: Math.floor(clampNumber(item.resumeTimeSec ?? 0, 0, 86400, 0)),
    durationSec: Math.floor(clampNumber(item.durationSec ?? 0, 0, 86400, 0)),
  };

  const tmdbId = clampOptionalPositiveInt(item.tmdbId, 1, 999999999);
  if (tmdbId !== undefined) base.tmdbId = tmdbId;

  const year = optionalClampedString(item.year, 16);
  if (year) base.year = year;

  const season = clampOptionalPositiveInt(item.season, 1, 200);
  if (season !== undefined) base.season = season;

  const episode = clampOptionalPositiveInt(item.episode, 1, 5000);
  if (episode !== undefined) base.episode = episode;

  const episodeTitle = optionalClampedString(item.episodeTitle, 200);
  if (episodeTitle) base.episodeTitle = episodeTitle;

  const bingetrixUrl = optionalClampedString(item.bingetrixUrl, 600);
  if (bingetrixUrl) base.bingetrixUrl = bingetrixUrl;

  const movidyUrl = optionalClampedString(item.movidyUrl, 600);
  if (movidyUrl) base.movidyUrl = movidyUrl;

  return { itemId, base };
}

export async function upsertCloudWatchHistory(
  item: WatchHistoryItem
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const { itemId, base } = buildWatchHistoryFields(user.uid, item);
  const docId = `${user.uid}_${itemId}`;
  const path = `watchHistory/${docId}`;
  const docRef = doc(db, 'watchHistory', docId);

  const mutableFields: Record<string, unknown> = { ...base };
  delete mutableFields.uid;
  delete mutableFields.itemId;
  delete mutableFields.mediaType;
  mutableFields.updatedAt = serverTimestamp();

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    if (knownHistoryDocIds.has(docId)) {
      try {
        await updateDoc(docRef, mutableFields);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownHistoryDocIds.delete(docId);
        } else {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    let serverUpdatedMs = 0;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
      if (existsOnServer) {
        const d = existingSnap.data();
        serverUpdatedMs = toMillis(d?.updatedAt || d?.createdAt, 0);
        const clientUpdatedMs = typeof item.watchedAt === 'number' ? item.watchedAt : 0;
        const serverResume = typeof d?.resumeTimeSec === 'number' ? d.resumeTimeSec : 0;
        const clientResume = typeof base.resumeTimeSec === 'number' ? base.resumeTimeSec : 0;
        if (
          shouldSkipStaleCloudWrite({
            serverUpdatedMs,
            clientUpdatedMs,
            serverResumeSec: serverResume,
            clientResumeSec: clientResume,
          })
        ) {
          knownHistoryDocIds.add(docId);
          return;
        }
      }
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (existsOnServer) {
      knownHistoryDocIds.add(docId);
      try {
        await updateDoc(docRef, mutableFields);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownHistoryDocIds.delete(docId);
        } else {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    try {
      await setDoc(docRef, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownHistoryDocIds.add(docId);
    } catch (createError) {
      try {
        const retrySnap = await getDoc(docRef);
        if (retrySnap.exists()) {
          knownHistoryDocIds.add(docId);
          await updateDoc(docRef, mutableFields);
          return;
        }
      } catch {
        // Fall through and report original createError
      }
      if (isTransientFirestoreError(createError)) return;
      handleFirestoreError(createError, OperationType.CREATE, path);
    }
  });
}

const PROGRESS_THROTTLE_MS = 15_000;
const lastProgressWriteAt = new Map<string, number>();
const pendingProgressWrites = new Map<string, { resume: number; duration: number }>();

export async function updateCloudWatchProgressOnly(
  rawItemId: string,
  resumeTimeSec: number,
  durationSec: number,
  forceFlush = false
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const itemId = sanitizeItemKey(rawItemId);
  const docId = `${user.uid}_${itemId}`;
  if (!knownHistoryDocIds.has(docId)) return;

  const safeResume = Math.floor(clampNumber(resumeTimeSec, 0, 86400, 0));
  const safeDuration = Math.floor(clampNumber(durationSec, 0, 86400, 0));
  const finalResume =
    safeDuration > 120 && safeResume / safeDuration >= 0.96 ? 0 : safeResume;

  const now = Date.now();
  const lastWrite = lastProgressWriteAt.get(docId) ?? 0;
  if (!forceFlush && now - lastWrite < PROGRESS_THROTTLE_MS) {
    pendingProgressWrites.set(docId, { resume: finalResume, duration: safeDuration });
    return;
  }

  pendingProgressWrites.delete(docId);
  lastProgressWriteAt.set(docId, now);

  const path = `watchHistory/${docId}`;
  const docRef = doc(db, 'watchHistory', docId);

  return enqueueDocWrite(path, async () => {
    if (!knownHistoryDocIds.has(docId)) return;
    try {
      await updateDoc(docRef, {
        resumeTimeSec: finalResume,
        durationSec: safeDuration,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        knownHistoryDocIds.delete(docId);
        return;
      }
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  });
}

export async function flushPendingCloudWatchProgress(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || pendingProgressWrites.size === 0) return;
  const entries = Array.from(pendingProgressWrites.entries());
  pendingProgressWrites.clear();
  await Promise.all(
    entries.map(([docId, data]) => {
      const path = `watchHistory/${docId}`;
      const docRef = doc(db, 'watchHistory', docId);
      lastProgressWriteAt.set(docId, Date.now());
      return enqueueDocWrite(path, async () => {
        if (!knownHistoryDocIds.has(docId)) return;
        try {
          await updateDoc(docRef, {
            resumeTimeSec: data.resume,
            durationSec: data.duration,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-blocking flush on unload/pause
        }
      });
    })
  );
}

export async function deleteCloudWatchHistoryItem(rawItemId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const itemId = sanitizeItemKey(rawItemId);
  const docId = `${user.uid}_${itemId}`;
  const path = `watchHistory/${docId}`;

  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'watchHistory', docId));
      knownHistoryDocIds.delete(docId);
    } catch (error) {
      if (isNotFoundError(error)) {
        knownHistoryDocIds.delete(docId);
        return;
      }
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

export async function clearCloudWatchHistoryItems(
  items: WatchHistoryItem[]
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  await Promise.all(
    items.map((item) => deleteCloudWatchHistoryItem(item.id))
  );
}

export async function upsertCloudCatalogFavorite(
  item: CatalogMovie
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const canonical = mergeCatalogItemMetadata(item);
  const favId = getCatalogFavoriteKey(canonical);
  const kind = canonical.mediaType === 'tv' ? 'series' : 'movie';
  const docId = `${user.uid}_${favId}`;
  const path = `favorites/${docId}`;
  const docRef = doc(db, 'favorites', docId);

  const base: Record<string, unknown> = {
    uid: user.uid,
    favId,
    kind,
    title: clampString(canonical.title, 200, 'Favorito'),
    subtitle: clampString(
      canonical.year || (kind === 'series' ? 'Serie TV' : 'HD'),
      240,
      'HD'
    ),
    poster: clampString(canonical.poster, 600, '/icon.svg'),
  };

  const tmdbId = clampOptionalPositiveInt(canonical.tmdbId, 1, 999999999);
  if (tmdbId !== undefined) base.tmdbId = tmdbId;
  const backdrop = optionalClampedString(canonical.backdrop, 600);
  if (backdrop) base.backdrop = backdrop;
  const year = optionalClampedString(canonical.year, 16);
  if (year) base.year = year;
  const rating = optionalClampedString(canonical.rating, 16);
  if (rating) base.rating = rating;

  const sourceMediaUrl = optionalClampedString(
    canonical.movidyUrl || canonical.bingetrixUrl,
    600
  );
  if (sourceMediaUrl) {
    base.channelUrl = sourceMediaUrl;
  }

  const mutable: Record<string, unknown> = { ...base, updatedAt: serverTimestamp() };
  delete mutable.uid;
  delete mutable.favId;
  delete mutable.kind;

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    if (knownFavoriteDocIds.has(docId)) {
      try {
        await updateDoc(docRef, mutable);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownFavoriteDocIds.delete(docId);
        } else {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
      if (existsOnServer) {
        const d = existingSnap.data();
        const serverUpdatedMs = toMillis(d?.updatedAt || d?.createdAt, 0);
        const clientUpdatedMs = typeof item.addedAt === 'number' ? item.addedAt : 0;
        if (shouldSkipStaleCloudWrite({ serverUpdatedMs, clientUpdatedMs })) {
          knownFavoriteDocIds.add(docId);
          return;
        }
      }
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (existsOnServer) {
      knownFavoriteDocIds.add(docId);
      try {
        await updateDoc(docRef, mutable);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownFavoriteDocIds.delete(docId);
        } else {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    try {
      await setDoc(docRef, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownFavoriteDocIds.add(docId);
    } catch (createError) {
      try {
        const retrySnap = await getDoc(docRef);
        if (retrySnap.exists()) {
          knownFavoriteDocIds.add(docId);
          await updateDoc(docRef, mutable);
          return;
        }
      } catch {
        // Fall through
      }
      if (isTransientFirestoreError(createError)) return;
      handleFirestoreError(createError, OperationType.CREATE, path);
    }
  });
}

export async function upsertCloudChannelFavorite(
  ch: FavoriteChannelItem
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const favId = sanitizeItemKey(ch.favId);
  const docId = `${user.uid}_${favId}`;
  const path = `favorites/${docId}`;
  const docRef = doc(db, 'favorites', docId);

  const validSport =
    ch.sport === 'soccer' ||
    ch.sport === 'motor' ||
    ch.sport === 'basketball' ||
    ch.sport === 'tennis' ||
    ch.sport === 'other'
      ? ch.sport
      : 'soccer';

  const base: Record<string, unknown> = {
    uid: user.uid,
    favId,
    kind: 'channel',
    title: clampString(ch.title, 200, ch.channelLabel || 'Canal en Directo'),
    subtitle: clampString(ch.competition || '24/7 Directo', 240, 'Directo'),
    poster: clampString(ch.poster, 600, '/icon.svg'),
    channelUrl: clampString(ch.channelUrl, 600, '/icon.svg'),
    channelLabel: clampString(ch.channelLabel, 120, 'Señal HD'),
    competition: clampString(ch.competition, 120, 'Deportes'),
    sport: validSport,
  };

  const mutable: Record<string, unknown> = { ...base, updatedAt: serverTimestamp() };
  delete mutable.uid;
  delete mutable.favId;
  delete mutable.kind;

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    if (knownFavoriteDocIds.has(docId)) {
      try {
        await updateDoc(docRef, mutable);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownFavoriteDocIds.delete(docId);
        } else {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
      if (existsOnServer) {
        const d = existingSnap.data();
        const serverUpdatedMs = toMillis(d?.updatedAt || d?.createdAt, 0);
        const clientUpdatedMs = typeof ch.addedAt === 'number' ? ch.addedAt : 0;
        if (shouldSkipStaleCloudWrite({ serverUpdatedMs, clientUpdatedMs })) {
          knownFavoriteDocIds.add(docId);
          return;
        }
      }
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (existsOnServer) {
      knownFavoriteDocIds.add(docId);
      try {
        await updateDoc(docRef, mutable);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownFavoriteDocIds.delete(docId);
        } else {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    try {
      await setDoc(docRef, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownFavoriteDocIds.add(docId);
    } catch (createError) {
      try {
        const retrySnap = await getDoc(docRef);
        if (retrySnap.exists()) {
          knownFavoriteDocIds.add(docId);
          await updateDoc(docRef, mutable);
          return;
        }
      } catch {
        // Fall through
      }
      if (isTransientFirestoreError(createError)) return;
      handleFirestoreError(createError, OperationType.CREATE, path);
    }
  });
}

export async function deleteCloudFavoriteById(rawFavId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const favId = sanitizeItemKey(rawFavId);
  const docId = `${user.uid}_${favId}`;
  const path = `favorites/${docId}`;

  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'favorites', docId));
      knownFavoriteDocIds.delete(docId);
    } catch (error) {
      if (isNotFoundError(error)) {
        knownFavoriteDocIds.delete(docId);
        return;
      }
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

export async function deleteCloudCatalogFavoriteAndDuplicates(
  item: CatalogMovie,
  extraRawKeys: string[] = []
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const keysToDelete = new Set<string>();
  keysToDelete.add(getCatalogFavoriteKey(item));
  if (item.id) {
    keysToDelete.add(sanitizeItemKey(item.id));
    keysToDelete.add(sanitizeItemKey(`movie-${item.id}`));
    keysToDelete.add(sanitizeItemKey(`series-${item.id}`));
  }
  for (const k of extraRawKeys) {
    if (k) keysToDelete.add(sanitizeItemKey(k));
  }

  const titleKey = `${item.mediaType === 'tv' ? 'tv' : 'movie'}:${normalizeCatalogTitle(item.title)}`;
  const knownRawIdsForTitle = favoriteTitleToRawFavIds.get(titleKey);
  if (knownRawIdsForTitle) {
    for (const rawId of knownRawIdsForTitle) {
      keysToDelete.add(sanitizeItemKey(rawId));
    }
    favoriteTitleToRawFavIds.delete(titleKey);
  }
  knownFavoriteTitleKeys.delete(titleKey);

  await Promise.all(
    Array.from(keysToDelete).map((favKey) =>
      deleteCloudFavoriteById(favKey).catch(() => {})
    )
  );
}
