import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isTransientFirestoreError,
  OperationType,
} from '../../firebase';
import { StoredProfile } from '../../utils/storage';
import {
  clampString,
  clearCloudSyncCaches,
  isNotFoundError,
  optionalClampedString,
  sanitizeHexColor,
} from './cloudSyncSanitizers';

export interface GoogleSignInResult {
  user: User | null;
  errorCode?: string;
  hostname?: string;
}

export async function signInWithGoogleAccountDetailed(): Promise<GoogleSignInResult> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return { user: cred.user };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      return { user: null };
    }
    const hostname =
      typeof window !== 'undefined' ? window.location.hostname : '';
    if (
      code === 'auth/unauthorized-domain' ||
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        const anonCred = await signInAnonymously(auth);
        return { user: anonCred.user };
      } catch {
        // fallback
      }
      return { user: null, errorCode: code, hostname };
    }
    return { user: null, errorCode: code || 'auth/unknown', hostname };
  }
}

export async function signInWithGoogleAccount(): Promise<User | null> {
  const res = await signInWithGoogleAccountDetailed();
  return res.user;
}

export async function signOutGoogleAccount(): Promise<void> {
  clearCloudSyncCaches();
  await signOut(auth);
}

export function subscribeAuthState(
  onChange: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      clearCloudSyncCaches();
    }
    onChange(user);
  });
}

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
