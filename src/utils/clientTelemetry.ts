import { CLIENT_APP_VERSION, detectNativeApkContext } from './versionSync';

export type ClientPlatformKind =
  | 'web'
  | 'pwa'
  | 'android-mobile'
  | 'android-tv'
  | 'smart-tv'
  | 'music-app';

export type ClientVerticalKind =
  | 'cine'
  | 'futbol'
  | 'tv'
  | 'iptv'
  | 'music'
  | 'kids'
  | 'juegos'
  | 'admin';

let vitalsReported = false;

export function detectClientPlatformKind(): ClientPlatformKind {
  if (typeof window === 'undefined') return 'web';
  const nativeCtx = detectNativeApkContext();
  if (nativeCtx.isGoogleTvApk) return 'android-tv';
  if (nativeCtx.isMusicApk) return 'music-app';
  if (nativeCtx.isAndroidMobileApk) return 'android-mobile';

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|Viera|VIDAA/i.test(ua)) {
    return 'smart-tv';
  }
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean })?.standalone === true;
  if (standalone) return 'pwa';
  return 'web';
}

export function reportClientVitalsOnce(vertical: ClientVerticalKind = 'tv'): void {
  if (vitalsReported || typeof window === 'undefined') return;
  vitalsReported = true;

  const sendBeacon = () => {
    try {
      const navEntry = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint');
      const conn = (navigator as unknown as {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number };
      }).connection;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      const standalonePwa =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean })?.standalone === true;

      const payload = {
        platform: detectClientPlatformKind(),
        vertical,
        ttfbMs: navEntry ? Math.max(0, Math.round(navEntry.responseStart - navEntry.requestStart)) : undefined,
        fcpMs: fcp ? Math.max(0, Math.round(fcp.startTime)) : undefined,
        domInteractiveMs: navEntry ? Math.max(0, Math.round(navEntry.domInteractive)) : undefined,
        effectiveNetworkType: conn?.effectiveType,
        downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : undefined,
        rttMs: typeof conn?.rtt === 'number' ? conn.rtt : undefined,
        swActive: Boolean(navigator.serviceWorker?.controller),
        standalonePwa: Boolean(standalonePwa),
        jsHeapMb: mem?.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : undefined,
        appVersion: CLIENT_APP_VERSION,
      };

      void fetch('/api/metrics/client-vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // non-fatal telemetry
    }
  };

  if (document.readyState === 'complete') {
    setTimeout(sendBeacon, 900);
  } else {
    window.addEventListener('load', () => setTimeout(sendBeacon, 900), { once: true });
  }
}
