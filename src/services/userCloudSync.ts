import {
  onAuthStateChanged,
  signInWithPopup,
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
  OperationType,
} from '../firebase';
import {
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  RoomQueueItem,
  WatchHistoryItem,
} from '../types';
import {
  getCatalogFavoriteKey,
  sanitizeItemKey,
  StoredProfile,
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
  return '#E11D48';
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
const knownSavedRoomDocIds = new Set<string>();

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
    throw err;
  }
}

export async function signOutGoogleAccount(): Promise<void> {
  knownHistoryDocIds.clear();
  knownFavoriteDocIds.clear();
  knownSavedRoomDocIds.clear();
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
    handleFirestoreError(error, OperationType.CREATE, path);
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
  const itemId = sanitizeItemKey(item.id);
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

export async function updateCloudWatchProgressOnly(
  rawItemId: string,
  resumeTimeSec: number,
  durationSec: number
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
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  });
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

  const favId = getCatalogFavoriteKey(item);
  const kind = item.mediaType === 'tv' ? 'series' : 'movie';
  const docId = `${user.uid}_${favId}`;
  const path = `favorites/${docId}`;
  const docRef = doc(db, 'favorites', docId);

  const base: Record<string, unknown> = {
    uid: user.uid,
    favId,
    kind,
    title: clampString(item.title, 200, 'Favorito'),
    subtitle: clampString(
      item.year || (kind === 'series' ? 'Serie TV' : 'HD'),
      240,
      'HD'
    ),
    poster: clampString(item.poster, 600, '/icon.svg'),
  };

  const tmdbId = clampOptionalPositiveInt(item.tmdbId, 1, 999999999);
  if (tmdbId !== undefined) base.tmdbId = tmdbId;
  const backdrop = optionalClampedString(item.backdrop, 600);
  if (backdrop) base.backdrop = backdrop;
  const year = optionalClampedString(item.year, 16);
  if (year) base.year = year;
  const rating = optionalClampedString(item.rating, 16);
  if (rating) base.rating = rating;

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

  const unsubHistory = onSnapshot(
    historyQuery,
    (snapshot) => {
      knownHistoryDocIds.clear();
      const items: WatchHistoryItem[] = [];
      snapshot.forEach((docSnap) => {
        knownHistoryDocIds.add(docSnap.id);
        const d = docSnap.data();
        items.push({
          id: String(d.itemId || ''),
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
        });
      });

      items.sort((a, b) => b.watchedAt - a.watchedAt);
      callbacks.onWatchHistory(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'watchHistory');
    }
  );

  const unsubFavorites = onSnapshot(
    favoritesQuery,
    (snapshot) => {
      knownFavoriteDocIds.clear();
      const watchlist: { item: CatalogMovie; updatedAtMs: number }[] = [];
      const channels: FavoriteChannelItem[] = [];

      snapshot.forEach((docSnap) => {
        knownFavoriteDocIds.add(docSnap.id);
        const d = docSnap.data();
        const updatedAtMs = toMillis(d.updatedAt || d.createdAt);

        if (d.kind === 'channel') {
          if (d.channelUrl) {
            channels.push({
              favId: String(d.favId || ''),
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
          watchlist.push({
            updatedAtMs,
            item: {
              id: String(d.favId || ''),
              tmdbId: typeof d.tmdbId === 'number' ? d.tmdbId : undefined,
              mediaType: isSeries ? 'tv' : 'movie',
              title: String(d.title || ''),
              year: String(d.year || (isSeries ? 'TV' : 'HD')),
              rating: String(d.rating || ''),
              overview: '',
              poster: String(d.poster || ''),
              backdrop: String(d.backdrop || d.poster || ''),
              languages: [],
            },
          });
        }
      });

      watchlist.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      channels.sort((a, b) => b.addedAt - a.addedAt);
      callbacks.onFavorites(
        watchlist.map((w) => w.item),
        channels
      );
    },
    (error) => {
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
          .filter((q: any) => q && typeof q === 'object' && q.title)
          .map((q: any, idx: number) => ({
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
      handleFirestoreError(error, OperationType.LIST, 'savedRooms');
    }
  );

  return () => {
    unsubHistory();
    unsubFavorites();
    unsubSavedRooms();
  };
}

export async function migrateLocalStateToCloud(params: {
  localHistory: WatchHistoryItem[];
  localWatchlist: CatalogMovie[];
  localChannels: FavoriteChannelItem[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  for (const h of params.localHistory.slice(0, 15)) {
    const docId = `${user.uid}_${sanitizeItemKey(h.id)}`;
    if (!knownHistoryDocIds.has(docId)) {
      await upsertCloudWatchHistory(h);
    }
  }

  for (const m of params.localWatchlist.slice(0, 25)) {
    const docId = `${user.uid}_${getCatalogFavoriteKey(m)}`;
    if (!knownFavoriteDocIds.has(docId)) {
      await upsertCloudCatalogFavorite(m);
    }
  }

  for (const ch of params.localChannels.slice(0, 20)) {
    const docId = `${user.uid}_${sanitizeItemKey(ch.favId)}`;
    if (!knownFavoriteDocIds.has(docId)) {
      await upsertCloudChannelFavorite(ch);
    }
  }
}
