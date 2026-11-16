export const CLIENT_APP_VERSION = '3.1.0';
export const CLIENT_APK_VERSION_CODE = 300;

const VERSION_STORAGE_KEY = 'naim_cine_client_version_v1';
const APK_VERSION_STORAGE_KEY = 'naim_cine_native_apk_code_v1';
const AUTO_RELOAD_GUARD_KEY = 'naim_cine_auto_reload_ts_v1';

export interface AppLatestManifest {
  success?: boolean;
  versionName?: string;
  web?: {
    version?: string;
    minReloadPrompt?: boolean;
  };
  mobile?: {
    versionCode?: number;
    versionName?: string;
    apkUrl?: string;
  };
  tv?: {
    versionCode?: number;
    versionName?: string;
    apkUrl?: string;
  };
}

export interface NativeApkUpdateAvailable {
  flavor: 'mobile' | 'tv';
  currentCode: number;
  latestCode: number;
  versionName: string;
  apkUrl: string;
}

export function detectNativeApkContext(): {
  isAndroidMobileApk: boolean;
  isGoogleTvApk: boolean;
  installedCode: number | null;
} {
  if (typeof window === 'undefined') {
    return { isAndroidMobileApk: false, isGoogleTvApk: false, installedCode: null };
  }

  const params = new URLSearchParams(window.location.search);
  const apkvParam = Number(params.get('apkv') || '0');
  const platformParam = (params.get('platform') || '').toLowerCase();

  let storedCode = 0;
  try {
    storedCode = Number(localStorage.getItem(APK_VERSION_STORAGE_KEY) || '0');
    if (apkvParam > 0) {
      localStorage.setItem(APK_VERSION_STORAGE_KEY, String(apkvParam));
      storedCode = apkvParam;
    }
  } catch {
    storedCode = apkvParam;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isGoogleTvApk =
    platformParam === 'googletv' ||
    /NaimCineGoogleTV|GoogleTV|Android TV|BRAVIA|AFT/i.test(ua) ||
    window.location.pathname.startsWith('/tv');

  const isAndroidMobileApk =
    !isGoogleTvApk &&
    (platformParam === 'android' ||
      /Android/i.test(ua) ||
      apkvParam > 0);

  return {
    isAndroidMobileApk,
    isGoogleTvApk,
    installedCode: storedCode > 0 ? storedCode : null,
  };
}

export async function clearStaleCachesAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const lastReload = Number(sessionStorage.getItem(AUTO_RELOAD_GUARD_KEY) || '0');
    if (Date.now() - lastReload < 60_000) {
      return;
    }
    sessionStorage.setItem(AUTO_RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // ignore storage errors
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      await reg?.update().catch(() => {});
    }
  } catch {
    // ignore
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 220);
}

export interface CheckRemoteVersionOptions {
  onApkUpdate?: (info: NativeApkUpdateAvailable) => void;
  shouldDeferReload?: () => boolean;
  onDeferredUpdate?: (remoteVersion: string) => void;
}

export async function checkRemoteAppVersion(
  onApkUpdateOrOpts?: ((info: NativeApkUpdateAvailable) => void) | CheckRemoteVersionOptions
): Promise<void> {
  if (typeof window === 'undefined') return;
  const opts: CheckRemoteVersionOptions =
    typeof onApkUpdateOrOpts === 'function'
      ? { onApkUpdate: onApkUpdateOrOpts }
      : onApkUpdateOrOpts || {};

  try {
    const ctx = detectNativeApkContext();
    const platform = ctx.isGoogleTvApk ? 'tv' : ctx.isAndroidMobileApk ? 'mobile' : 'web';
    const res = await fetch(`/api/app/latest?platform=${platform}&_=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = (await res.json()) as AppLatestManifest;
    const remoteWebVersion = String(data?.web?.version || data?.versionName || '').trim();
    if (!remoteWebVersion) return;

    let knownVersion = CLIENT_APP_VERSION;
    try {
      const prev = localStorage.getItem(VERSION_STORAGE_KEY);
      if (prev) {
        knownVersion = prev;
      } else {
        localStorage.setItem(VERSION_STORAGE_KEY, CLIENT_APP_VERSION);
      }
    } catch {
      // ignore
    }

    // Check if native APK shell itself needs an optional 1-tap APK upgrade
    if (ctx.installedCode && (ctx.isAndroidMobileApk || ctx.isGoogleTvApk)) {
      const flavor = ctx.isGoogleTvApk ? 'tv' : 'mobile';
      const targetMeta = flavor === 'tv' ? data.tv : data.mobile;
      const latestCode = Number(targetMeta?.versionCode || 0);
      if (latestCode > ctx.installedCode && targetMeta?.apkUrl && opts.onApkUpdate) {
        opts.onApkUpdate({
          flavor,
          currentCode: ctx.installedCode,
          latestCode,
          versionName: String(targetMeta.versionName || remoteWebVersion),
          apkUrl: targetMeta.apkUrl,
        });
      }
    }

    // If backend serves a newer build than currently running client bundle, auto-sync when safe
    if (remoteWebVersion !== CLIENT_APP_VERSION || remoteWebVersion !== knownVersion) {
      if (remoteWebVersion !== CLIENT_APP_VERSION) {
        if (opts.shouldDeferReload?.()) {
          opts.onDeferredUpdate?.(remoteWebVersion);
          return;
        }
        try {
          localStorage.setItem(VERSION_STORAGE_KEY, remoteWebVersion);
        } catch {
          // ignore
        }
        await clearStaleCachesAndReload();
      } else {
        try {
          localStorage.setItem(VERSION_STORAGE_KEY, remoteWebVersion);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // Offline or transient network error; skip silently
  }
}
