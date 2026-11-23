/**
 * @module webosRuntime
 * @description LG webOS Smart TV detection, Magic Remote key helpers, and Luna screensaver protection.
 * Compatible with webOS 3.0 - 5.0 (legacy Chromium 38-68) and webOS 6.0 - 24+ (modern Chromium).
 */

interface WebOsServiceRequestHandle {
  cancel?: () => void;
}

interface WebOsRuntimeBridge {
  platformBack?: () => void;
  keyboard?: {
    isShowing?: () => boolean;
  };
  deviceInfo?: (cb: (info: Record<string, unknown>) => void) => void;
  service?: {
    request?: (
      uri: string,
      params: {
        method?: string;
        parameters?: Record<string, unknown>;
        onSuccess?: (res: unknown) => void;
        onFailure?: (err: unknown) => void;
      }
    ) => WebOsServiceRequestHandle | undefined;
  };
}

declare global {
  interface Window {
    __RIFFAN_WEBOS_APP__?: boolean;
    __RIFFAN_WEBOS_TIER__?: string;
    webOS?: WebOsRuntimeBridge;
    PalmSystem?: unknown;
  }
}

export function isWebOsTvRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.webOS || window.PalmSystem || window.__RIFFAN_WEBOS_APP__) {
    return true;
  }
  try {
    if (/[?&](?:webos=1|lg=1|platform=webos)\b/i.test(window.location.search || '')) {
      return true;
    }
  } catch {
    // ignore restricted location access
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /Web0S|WebOS|LGE|NetCast/i.test(ua);
}

export function exitWebOsAppViaPlatformBack(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.webOS?.platformBack === 'function') {
      window.webOS.platformBack();
      return true;
    }
  } catch {
    // ignore non-webOS bridge errors
  }
  return false;
}

export function syncWebOsScreenSaver(preventSleep: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.webOS?.service?.request === 'function') {
      window.webOS.service.request('luna://com.webos.service.tvpower', {
        method: 'power/setScreenSaver',
        parameters: {
          state: preventSleep ? 'Active' : 'Inactive',
          clientName: 'com.riffantv.webos',
        },
        onFailure: () => {
          // Non-privileged web apps silently fall back to HTML5 video wake lock
        },
      });
    }
  } catch {
    // ignore in standard browser environments
  }
}
