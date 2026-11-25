import {
  deleteDoc,
  deleteField,
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
import type { RoomQueueItem, SavedFriend } from '../../types';
import { deriveFriendCode, sanitizeItemKey } from '../../utils/storage';
import {
  clampOptionalPositiveInt,
  clampString,
  enqueueDocWrite,
  isNotFoundError,
  knownFriendDocIds,
  knownSavedRoomDocIds,
  normalizePreferLang,
  optionalClampedString,
  sanitizeHexColor,
  shouldSkipStaleCloudWrite,
  toMillis,
} from './cloudSyncSanitizers';

function sanitizePersistedQueue(items: RoomQueueItem[]): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).map((q, idx) => {
    const validKind =
      q.kind === 'tv' || q.kind === 'youtube' || q.kind === 'direct' ? q.kind : 'movie';
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
    const normalizedLang = normalizePreferLang(q.preferLang);
    if (q.preferLang) entry.preferLang = normalizedLang;
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

  const safeRoomName = clampString(params.roomName, 60, `Sala ${cleanCode.toUpperCase()}`);
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
  if (safeLastTitle) updatePayload.lastActiveTitle = safeLastTitle;

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    if (knownSavedRoomDocIds.has(docId)) {
      try {
        await updateDoc(docRef, updatePayload);
        return;
      } catch (error) {
        if (isNotFoundError(error)) knownSavedRoomDocIds.delete(docId);
        else {
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
        if (shouldSkipStaleCloudWrite({ serverUpdatedMs, clientUpdatedMs: 0 })) {
          knownSavedRoomDocIds.add(docId);
          return;
        }
      }
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
        if (isNotFoundError(error)) knownSavedRoomDocIds.delete(docId);
        else {
          if (isTransientFirestoreError(error)) return;
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
    if (effectiveHasPin && validPin) createPayload.pinCode = validPin;
    if (safeLastTitle) createPayload.lastActiveTitle = safeLastTitle;

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
      if (isTransientFirestoreError(createError)) return;
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
      if (isNotFoundError(error)) {
        knownSavedRoomDocIds.delete(docId);
        return;
      }
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

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
        if (isNotFoundError(error)) knownFriendDocIds.delete(docId);
        else {
          if (isTransientFirestoreError(error)) return;
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
        if (isNotFoundError(error)) knownFriendDocIds.delete(docId);
        else {
          if (isTransientFirestoreError(error)) return;
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
      if (isTransientFirestoreError(createError)) return;
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
      if (isNotFoundError(error)) {
        knownFriendDocIds.delete(docId);
        return;
      }
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}
