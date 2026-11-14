import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isTransientFirestoreError,
  OperationType,
} from '../firebase';
import {
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  RoomQueueItem,
  SavedFriend,
  WatchHistoryItem,
} from '../types';
import {
  canonicalizeHistoryItemId,
  deriveFriendCode,
  getCatalogFavoriteKey,
  isSameCatalogItem,
  isSameHistoryItem,
  mergeCatalogItemMetadata,
  normalizeCatalogTitle,
  sanitizeItemKey,
  StoredProfile,
  stripMediaPrefix,
} from '../utils/storage';

// ============================================================================
// DEFENSIVE PAYLOAD SANITIZERS (SYNCHRONIZED WITH firebase-blueprint.json)
// ============================================================================
function clampString(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function optionalClampedString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function clampNumber(val: unknown, min: number, max: number, fallback = 0): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function clampOptionalPositiveInt(
  val: unknown,
  min: number,
  max: number
): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function sanitizeHexColor(raw: unknown): string {
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.trim())) {
    return raw.trim();
  }
  return '#9146FF';
}

function toMillis(ts: unknown, fallback = Date.now()): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (
    ts &&
    typeof ts === 'object' &&
    'seconds' in ts &&
    typeof (ts as { seconds: unknown }).seconds === 'number'
  ) {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return fallback;
}

function isNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  return (
    code === 'not-found' ||
    msg.includes('No document to update') ||
    msg.includes('not-found')
  );
}

// Track which composite document IDs are confirmed to exist in Firestore
const knownHistoryDocIds = new Set<string>();
const knownFavoriteDocIds = new Set<string>();
const knownFavoriteTitleKeys = new Set<string>();
const favoriteTitleToRawFavIds = new Map<string, Set<string>>();
const knownSavedRoomDocIds = new Set<string>();
const knownFriendDocIds = new Set<string>();

// Per-document write queue to eliminate concurrent create/update race conditions
const pendingDocQueues = new Map<string, Promise<void>>();

function enqueueDocWrite(docPath: string, task: () => Promise<void>): Promise<void> {
  const previous = pendingDocQueues.get(docPath) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (pendingDocQueues.get(docPath) === next) {
        pendingDocQueues.delete(docPath);
      }
    });
  pendingDocQueues.set(docPath, next);
  return next;
}

export function buildHistoryDocId(uid: string, rawItemId: string): string {
  return `${uid}_${sanitizeItemKey(rawItemId)}`;
}

export function buildFavoriteDocId(uid: string, rawFavId: string): string {
  return `${uid}_${sanitizeItemKey(rawFavId)}`;
}

export function buildSavedRoomDocId(uid: string, rawRoomCode: string): string {
  const cleanCode = rawRoomCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  return `${uid}_${cleanCode}`;
}

// ============================================================================
// AUTHENTICATION ACTIONS (GOOGLE POPUP ONLY)
// ============================================================================
export async function signInWithGoogleAccount(): Promise<User | null> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function signOutGoogleAccount(): Promise<void> {
  knownHistoryDocIds.clear();
  knownFavoriteDocIds.clear();
  knownSavedRoomDocIds.clear();
  knownFriendDocIds.clear();
  pendingDocQueues.clear();
  await signOut(auth);
}

export function subscribeAuthState(
  onChange: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      knownHistoryDocIds.clear();
      knownFavoriteDocIds.clear();
      knownSavedRoomDocIds.clear();
      knownFriendDocIds.clear();
      pendingDocQueues.clear();
    }
    onChange(user);
  });
}

// ============================================================================
// USER PROFILE SYNC (/userProfiles/{userId})
// ============================================================================
export async function ensureCloudUserProfile(
  user: User,
  localProfile: StoredProfile
): Promise<StoredProfile> {
  const path = `userProfiles/${user.uid}`;
  const profileRef = doc(db, 'userProfiles', user.uid);

  let snap;
  try {
    snap = await getDoc(profileRef);
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      return {
        id: user.uid,
        name: clampString(
          localProfile.isCustomized
            ? localProfile.name
            : user.displayName || localProfile.name,
          24,
          'Cineasta'
        ),
        avatar: clampString(localProfile.avatar || '🍿', 16, '🍿'),
        color: sanitizeHexColor(localProfile.color),
        isCustomized: true,
      };
    }
    handleFirestoreError(error, OperationType.GET, path);
  }

  const googleFirstName = user.displayName
    ? clampString(user.displayName, 24, 'Cineasta')
    : '';
  const preferredName = clampString(
    localProfile.isCustomized
      ? localProfile.name
      : googleFirstName || localProfile.name,
    40,
    'Cineasta'
  );
  const avatar = clampString(localProfile.avatar || '🍿', 16, '🍿');
  const color = sanitizeHexColor(localProfile.color);
  const photoURL = optionalClampedString(user.photoURL, 600);

  if (snap && snap.exists()) {
    const data = snap.data();
    return {
      id: user.uid,
      name: clampString(data.displayName, 24, preferredName),
      avatar: clampString(data.avatar, 16, avatar),
      color: sanitizeHexColor(data.color),
      isCustomized: true,
    };
  }

  const createPayload: Record<string, unknown> = {
    uid: user.uid,
    displayName: preferredName,
    avatar,
    color,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (photoURL) {
    createPayload.photoURL = photoURL;
  }

  try {
    await setDoc(profileRef, createPayload);
  } catch (error) {
    if (!isTransientFirestoreError(error)) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  return {
    id: user.uid,
    name: preferredName.slice(0, 24),
    avatar,
    color,
    isCustomized: true,
  };
}

export async function updateCloudUserProfile(
  profile: StoredProfile
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const path = `userProfiles/${user.uid}`;
  const profileRef = doc(db, 'userProfiles', user.uid);

  const updatePayload: Record<string, unknown> = {
    displayName: clampString(profile.name, 40, 'Cineasta'),
    avatar: clampString(profile.avatar || '🍿', 16, '🍿'),
    color: sanitizeHexColor(profile.color),
    updatedAt: serverTimestamp(),
  };
  const photoURL = optionalClampedString(user.photoURL, 600);
  if (photoURL) {
    updatePayload.photoURL = photoURL;
  }

  try {
    await updateDoc(profileRef, updatePayload);
  } catch (error) {
    if (isNotFoundError(error)) {
      await ensureCloudUserProfile(user, profile);
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// WATCH HISTORY & EXACT TIMESTAMP SYNC (/watchHistory/{historyId})
// ============================================================================
function buildWatchHistoryFields(uid: string, item: WatchHistoryItem) {
  const itemId = canonicalizeHistoryItemId(item);
  const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
  const preferLang = item.preferLang === 'EN' ? 'EN' : 'ES';
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
    title: clampString(item.title, 200, 'NAIM CINE'),
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
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
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
      // Handle multi-device simultaneous create race (e.g. Mobile + PC in same room)
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

// ============================================================================
// FAVORITE MOVIES, SERIES & LIVE CHANNELS SYNC (/favorites/{favoriteId})
// ============================================================================
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

  // Store movidyUrl or bingetrixUrl in the whitelisted optional channelUrl field so Movidy movies play from any device
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
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
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
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
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

// ============================================================================
// PERMANENT CLOUD ROOMS SYNC (/savedRooms/{savedRoomId})
// ============================================================================
function sanitizePersistedQueue(items: RoomQueueItem[]): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).map((q, idx) => {
    const validKind =
      q.kind === 'tv' || q.kind === 'youtube' || q.kind === 'direct'
        ? q.kind
        : 'movie';
    const entry: Record<string, unknown> = {
      id: clampString(q.id, 64, `q-${idx + 1}`),
      kind: validKind,
      title: clampString(q.title, 200, 'Título en cola'),
      subtitle: clampString(q.subtitle, 200, 'HD'),
      addedBy: clampString(q.addedBy, 40, 'Anfitrión'),
    };
    const poster = optionalClampedString(q.poster, 600);
    if (poster) entry.poster = poster;
    const tmdbId = clampOptionalPositiveInt(q.tmdbId, 1, 999999999);
    if (tmdbId !== undefined) entry.tmdbId = tmdbId;
    const season = clampOptionalPositiveInt(q.season, 1, 200);
    if (season !== undefined) entry.season = season;
    const episode = clampOptionalPositiveInt(q.episode, 1, 5000);
    if (episode !== undefined) entry.episode = episode;
    const youtubeId = optionalClampedString(q.youtubeId, 32);
    if (youtubeId) entry.youtubeId = youtubeId;
    const url = optionalClampedString(q.url, 600);
    if (url) entry.url = url;
    if (q.preferLang === 'ES' || q.preferLang === 'EN') {
      entry.preferLang = q.preferLang;
    }
    return entry;
  });
}

export async function upsertCloudSavedRoom(params: {
  roomCode: string;
  roomName: string;
  hasPin: boolean;
  pinCode?: string;
  hostOnlyControl: boolean;
  lastActiveTitle?: string;
  queueItems: RoomQueueItem[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const cleanCode = params.roomCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  if (cleanCode.length < 2) return;

  const validPin =
    params.hasPin && typeof params.pinCode === 'string' && /^[0-9]{4}$/.test(params.pinCode)
      ? params.pinCode
      : undefined;
  const effectiveHasPin = Boolean(validPin);

  const docId = `${user.uid}_${cleanCode}`;
  const path = `savedRooms/${docId}`;
  const docRef = doc(db, 'savedRooms', docId);

  const safeRoomName = clampString(
    params.roomName,
    60,
    `Sala ${cleanCode.toUpperCase()}`
  );
  const safeQueue = sanitizePersistedQueue(params.queueItems);
  const safeLastTitle = optionalClampedString(params.lastActiveTitle, 200);

  const updatePayload: Record<string, unknown> = {
    roomName: safeRoomName,
    hasPin: effectiveHasPin,
    pinCode: effectiveHasPin ? validPin : deleteField(),
    hostOnlyControl: Boolean(params.hostOnlyControl),
    queueItems: safeQueue,
    updatedAt: serverTimestamp(),
  };
  if (safeLastTitle) {
    updatePayload.lastActiveTitle = safeLastTitle;
  }

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    if (knownSavedRoomDocIds.has(docId)) {
      try {
        await updateDoc(docRef, updatePayload);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownSavedRoomDocIds.delete(docId);
        } else {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (existsOnServer) {
      knownSavedRoomDocIds.add(docId);
      try {
        await updateDoc(docRef, updatePayload);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownSavedRoomDocIds.delete(docId);
        } else {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    const createPayload: Record<string, unknown> = {
      uid: user.uid,
      roomCode: cleanCode,
      roomName: safeRoomName,
      hasPin: effectiveHasPin,
      hostOnlyControl: Boolean(params.hostOnlyControl),
      queueItems: safeQueue,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (effectiveHasPin && validPin) {
      createPayload.pinCode = validPin;
    }
    if (safeLastTitle) {
      createPayload.lastActiveTitle = safeLastTitle;
    }

    try {
      await setDoc(docRef, createPayload);
      knownSavedRoomDocIds.add(docId);
    } catch (createError) {
      try {
        const retrySnap = await getDoc(docRef);
        if (retrySnap.exists()) {
          knownSavedRoomDocIds.add(docId);
          await updateDoc(docRef, updatePayload);
          return;
        }
      } catch {
        // Fall through
      }
      handleFirestoreError(createError, OperationType.CREATE, path);
    }
  });
}

export async function deleteCloudSavedRoom(rawRoomCode: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const cleanCode = rawRoomCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  if (cleanCode.length < 2) return;

  const docId = `${user.uid}_${cleanCode}`;
  const path = `savedRooms/${docId}`;

  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'savedRooms', docId));
      knownSavedRoomDocIds.delete(docId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// SAVED FRIENDS SYNC (/friends/{friendDocId})
// ============================================================================
export async function upsertCloudFriend(friend: SavedFriend): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const cleanFriendId = sanitizeItemKey(friend.friendId);
  if (!cleanFriendId || cleanFriendId === user.uid) return;

  const docId = `${user.uid}_${cleanFriendId}`;
  const path = `friends/${docId}`;
  const docRef = doc(db, 'friends', docId);

  const safeFriendName = clampString(friend.name, 40, 'Amigo');
  const safeFriendAvatar = clampString(friend.avatar || '🍿', 16, '🍿');
  const safeFriendColor = sanitizeHexColor(friend.color);
  const safeFriendCode = clampString(
    (friend.friendCode || deriveFriendCode(cleanFriendId)).replace(/[^a-zA-Z0-9_-]/g, ''),
    24,
    deriveFriendCode(cleanFriendId)
  );

  const updatePayload: Record<string, unknown> = {
    friendName: safeFriendName,
    friendAvatar: safeFriendAvatar,
    friendColor: safeFriendColor,
    friendCode: safeFriendCode,
    updatedAt: serverTimestamp(),
  };

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    if (knownFriendDocIds.has(docId)) {
      try {
        await updateDoc(docRef, updatePayload);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownFriendDocIds.delete(docId);
        } else {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(docRef);
      existsOnServer = existingSnap.exists();
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (existsOnServer) {
      knownFriendDocIds.add(docId);
      try {
        await updateDoc(docRef, updatePayload);
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          knownFriendDocIds.delete(docId);
        } else {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    const createPayload: Record<string, unknown> = {
      uid: user.uid,
      friendId: cleanFriendId,
      friendName: safeFriendName,
      friendAvatar: safeFriendAvatar,
      friendColor: safeFriendColor,
      friendCode: safeFriendCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(docRef, createPayload);
      knownFriendDocIds.add(docId);
    } catch (createError) {
      try {
        const retrySnap = await getDoc(docRef);
        if (retrySnap.exists()) {
          knownFriendDocIds.add(docId);
          await updateDoc(docRef, updatePayload);
          return;
        }
      } catch {
        // Fall through
      }
      handleFirestoreError(createError, OperationType.CREATE, path);
    }
  });
}

export async function deleteCloudFriend(rawFriendId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const cleanFriendId = sanitizeItemKey(rawFriendId);
  if (!cleanFriendId) return;

  const docId = `${user.uid}_${cleanFriendId}`;
  const path = `friends/${docId}`;

  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, 'friends', docId));
      knownFriendDocIds.delete(docId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// REAL-TIME CLOUD LISTENERS + LOCAL DATA MIGRATION ON SIGN-IN
// ============================================================================
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
          preferLang: d.preferLang === 'EN' ? 'EN' : 'ES',
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
            ? `https://movidy.pw/ver/${strippedSlug.replace(/^movidy-/, '')}`
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
          // Duplicate history entry in Firestore -> merge progress & auto-delete duplicate doc
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
            // Migrate legacy movie-movie-... history doc to clean canonical ID
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
              ? `https://movidy.pw/ver/${cleanBaseId.replace(/^movidy-/, '')}`
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

      // Sort newest first so we keep the latest item and purge older duplicates
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
          // Found a duplicate in Firestore! Merge any rich metadata and automatically delete the duplicate doc from Firestore
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

          // If this single item had a corrupted recursive ID like movie-movie-movidy-..., replace it in Firestore with the clean canonical ID
          if (entry.rawFavId && entry.rawFavId !== canonicalFavId) {
            deleteCloudFavoriteById(entry.rawFavId).catch(() => {});
            upsertCloudCatalogFavorite(canonicalItem).catch(() => {});
          }
        }
      }

      // Deduplicate channels by favId or channelUrl
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
            preferLang: q.preferLang === 'EN' ? 'EN' : 'ES',
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
