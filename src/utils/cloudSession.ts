export interface StoredCloudSession {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  cloudToken: string;
  linkedAt: number;
  method: 'google' | 'bridge' | 'code';
}

const CLOUD_SESSION_KEY = 'naim_cloud_session_v1';
const CLOUD_SESSION_EVENT = 'naim:cloud-session-changed';

export function getStoredCloudSession(): StoredCloudSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLOUD_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCloudSession>;
    if (!parsed || typeof parsed.uid !== 'string' || typeof parsed.cloudToken !== 'string') {
      return null;
    }
    return {
      uid: parsed.uid,
      email: typeof parsed.email === 'string' ? parsed.email : `${parsed.uid}@riffantv.cloud`,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : 'Cineasta',
      photoURL: typeof parsed.photoURL === 'string' ? parsed.photoURL : undefined,
      cloudToken: parsed.cloudToken,
      linkedAt: typeof parsed.linkedAt === 'number' ? parsed.linkedAt : Date.now(),
      method:
        parsed.method === 'bridge' || parsed.method === 'code' || parsed.method === 'google'
          ? parsed.method
          : 'bridge',
    };
  } catch {
    return null;
  }
}

export function saveStoredCloudSession(session: StoredCloudSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent(CLOUD_SESSION_EVENT, { detail: session }));
  } catch {
    // ignore storage quota failures
  }
}

export function clearStoredCloudSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLOUD_SESSION_KEY);
    window.dispatchEvent(new CustomEvent(CLOUD_SESSION_EVENT, { detail: null }));
  } catch {
    // ignore
  }
}

export function subscribeCloudSession(
  cb: (session: StoredCloudSession | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => cb(getStoredCloudSession());
  const onStorage = (e: StorageEvent) => {
    if (e.key === CLOUD_SESSION_KEY) cb(getStoredCloudSession());
  };
  window.addEventListener(CLOUD_SESSION_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CLOUD_SESSION_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function isAndroidApkWebView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const search = window.location.search || '';
  if (/[?&]apk=1\b/i.test(search)) return true;
  if (/NaimCineAPK|RiffanTVAPK/i.test(ua)) return true;
  // Standard Android System WebView includes "; wv)" or "Version/x.x" with Android
  if (/Android/i.test(ua) && /; wv\)/i.test(ua)) return true;
  return false;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
