import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  type Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

setLogLevel('silent');

const app = initializeApp(firebaseConfig);

const firestoreDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

function createFirestoreDb(): Firestore {
  const canUseIndexedDb =
    typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: canUseIndexedDb
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache(),
      },
      firestoreDbId
    );
  } catch {
    return firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
  }
}

export const db = createFirestoreDb();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let connectionTested = false;

async function testConnection() {
  if (connectionTested) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      connectionTested = false;
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener(
      'online',
      () => {
        void testConnection();
      },
      { once: true }
    );
  } else {
    setTimeout(() => {
      void testConnection();
    }, 1200);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isTransientFirestoreError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'unavailable' ||
    code === 'aborted' ||
    code === 'deadline-exceeded' ||
    code === 'cancelled' ||
    msg.includes('the client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('Failed to get document because the client is offline')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

