import { useEffect, useRef } from 'react';
import {
  isWebOsTvRuntime,
  syncWebOsScreenSaver,
} from './webosRuntime';

export type TvRemoteAction =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'SELECT'
  | 'BACK'
  | 'STOP'
  | 'BLUR_INPUT'
  | 'PLAY_PAUSE'
  | 'PLAY'
  | 'PAUSE'
  | 'FF'
  | 'RW'
  | 'CH_UP'
  | 'CH_DOWN';

interface NaimTvAndroidBridge {
  openKeyboard?: () => void;
  closeKeyboard?: () => void;
  setInputMode?: (active: boolean) => void;
  showToast?: (msg: string) => void;
  openServerSettings?: () => void;
  exitApp?: () => void;
}

interface TizenTvInputDevice {
  registerKey?: (keyName: string) => void;
  registerKeyBatch?: (keyNames: string[]) => void;
}

interface TizenRuntime {
  tvinputdevice?: TizenTvInputDevice;
  application?: {
    getCurrentApplication?: () => { exit?: () => void };
  };
}

interface SamsungWebApisRuntime {
  appcommon?: {
    setScreenSaver?: (state: number, successCb?: () => void, errorCb?: () => void) => void;
  };
}

declare global {
  interface Window {
    __NAIM_GOOGLE_TV__?: boolean;
    __naimTvKey?: (action: TvRemoteAction) => 'HANDLED' | 'AT_ROOT';
    __naimInitTvFocus?: () => void;
    NaimTvBridge?: NaimTvAndroidBridge;
    tizen?: TizenRuntime;
    webapis?: SamsungWebApisRuntime;
  }
}

const TIZEN_HARDWARE_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaRewind',
  'MediaFastForward',
  'ChannelUp',
  'ChannelDown',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'Menu',
  'Info',
  'Exit',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
];

export function isTizenTvRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.tizen || (window as unknown as { __RIFFAN_TIZEN_WIDGET__?: boolean }).__RIFFAN_TIZEN_WIDGET__) {
    return true;
  }
  try {
    if (/[?&](?:tizen=1|platform=tizen)\b/i.test(window.location.search || '')) {
      return true;
    }
  } catch {
    // ignore
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /Tizen|SamsungBrowser.*TV|SMART-TV/i.test(ua);
}

export function registerTizenRemoteKeys(): boolean {
  if (typeof window === 'undefined' || !window.tizen?.tvinputdevice) return false;
  const dev = window.tizen.tvinputdevice;
  try {
    if (typeof dev.registerKeyBatch === 'function') {
      dev.registerKeyBatch(TIZEN_HARDWARE_KEYS);
      return true;
    }
    if (typeof dev.registerKey === 'function') {
      for (const k of TIZEN_HARDWARE_KEYS) {
        try {
          dev.registerKey(k);
        } catch {
          // ignore unsupported key on specific Samsung TV year
        }
      }
      return true;
    }
  } catch {
    // ignore Tizen API guard errors on non-Tizen runtimes
  }
  return false;
}

export function syncTizenScreenSaver(preventSleep: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    // Samsung TV WebAPIs: 0 = SCREEN_SAVER_OFF, 1 = SCREEN_SAVER_ON
    window.webapis?.appcommon?.setScreenSaver?.(preventSleep ? 0 : 1);
  } catch {
    // ignore
  }
}

export function isGoogleTvEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__NAIM_GOOGLE_TV__ || isTizenTvRuntime() || isWebOsTvRuntime()) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('googletv') === '1' ||
      params.get('platform')?.toLowerCase() === 'googletv' ||
      params.get('tv') === '1' ||
      params.get('tizen') === '1'
    ) {
      window.sessionStorage?.setItem('naim_google_tv_env', '1');
      return true;
    }
    if (window.sessionStorage?.getItem('naim_google_tv_env') === '1') {
      return true;
    }
  } catch {
    // ignore
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /NaimCineGoogleTV|GoogleTV|Android TV|BRAVIA|AFTB|AFTT|AFTM|AFTKA|Chromecast|SmartTV|SMART-TV|Tizen|Web0S|NetCast|VIDAA|HbbTV|AppleTV/i.test(
    ua
  );
}

/**
 * Pure keyboard/remote event mapper covering W3C D-pad, Android TV, and Samsung Tizen keyCodes.
 */
export function mapKeyboardEventToTvAction(e: {
  key?: string;
  keyCode?: number;
  which?: number;
}): TvRemoteAction | null {
  const key = e.key || '';
  const code = e.keyCode || e.which || 0;

  switch (key) {
    case 'ArrowUp':
      return 'UP';
    case 'ArrowDown':
      return 'DOWN';
    case 'ArrowLeft':
      return 'LEFT';
    case 'ArrowRight':
      return 'RIGHT';
    case 'Escape':
    case 'GoBack':
    case 'BrowserBack':
      return 'BACK';
    case 'MediaPlayPause':
      return 'PLAY_PAUSE';
    case 'MediaPlay':
      return 'PLAY';
    case 'MediaPause':
      return 'PAUSE';
    case 'MediaStop':
      return 'STOP';
    case 'MediaFastForward':
      return 'FF';
    case 'MediaRewind':
      return 'RW';
    case 'ChannelUp':
      return 'CH_UP';
    case 'ChannelDown':
      return 'CH_DOWN';
    default:
      break;
  }

  // Samsung Tizen / Android TV / LG webOS hardware keyCodes
  if (code === 10009 || code === 461 || code === 27 || code === 4) {
    return 'BACK';
  }
  if (code === 10252 || code === 179 || code === 85) {
    return 'PLAY_PAUSE';
  }
  if (code === 415 || code === 126) {
    return 'PLAY';
  }
  if (code === 19 && key !== 'ArrowUp') {
    return 'PAUSE';
  }
  if (code === 413) {
    return 'STOP';
  }
  if (code === 412) {
    return 'RW';
  }
  if (code === 417) {
    return 'FF';
  }
  if (code === 427 || code === 166) {
    return 'CH_UP';
  }
  if (code === 428 || code === 167) {
    return 'CH_DOWN';
  }
  if (code === 23 || code === 66 || code === 13) {
    return 'SELECT';
  }
  if (code === 37 || code === 21) return 'LEFT';
  if (code === 38) return 'UP';
  if (code === 39 || code === 22) return 'RIGHT';
  if (code === 40 || code === 20) return 'DOWN';

  return null;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-tv-focusable="true"]',
].join(', ');

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.offsetWidth < 14 || el.offsetHeight < 14) {
    const posStyle = el.style.position || '';
    if (posStyle !== 'fixed') return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width < 14 || rect.height < 14) return false;
  if (rect.right < -80 || rect.left > window.innerWidth + 80) return false;
  return true;
}

function getActiveScopeContainer(): ParentNode {
  const modalCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [aria-modal="true"], [data-tv-modal="true"], .fixed.inset-0'
    )
  ).filter((el) => {
    if (!el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.pointerEvents === 'none'
    ) {
      return false;
    }
    const focusables = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    return focusables.length > 0;
  });

  if (modalCandidates.length > 0) {
    return modalCandidates[modalCandidates.length - 1];
  }
  return document;
}

function getVisibleFocusables(): HTMLElement[] {
  const scope = getActiveScopeContainer();
  const raw = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return raw.filter(isElementVisible);
}

function isTextInput(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

function findNextSpatialTarget(
  current: HTMLElement | null,
  dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
  candidates: HTMLElement[]
): HTMLElement | null {
  if (candidates.length === 0) return null;
  if (!current || !candidates.includes(current)) {
    const inView = candidates.find((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    return inView || candidates[0];
  }

  const curRect = current.getBoundingClientRect();
  const curCx = curRect.left + curRect.width / 2;
  const curCy = curRect.top + curRect.height / 2;

  let bestEl: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const cand of candidates) {
    if (cand === current) continue;
    if (current.contains(cand) || cand.contains(current)) continue;

    const r = cand.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const dx = cx - curCx;
    const dy = cy - curCy;

    let primaryDist = 0;
    let crossDist = 0;
    let overlapBonus = 0;

    if (dir === 'RIGHT') {
      if (dx <= 4) continue;
      primaryDist = Math.max(1, r.left - curRect.right, dx * 0.45);
      crossDist = Math.abs(dy);
      const vertOverlap =
        Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top);
      if (vertOverlap > 4) {
        overlapBonus = -120;
      } else if (crossDist > Math.max(curRect.height, r.height) * 1.8) {
        crossDist *= 4.5;
      }
    } else if (dir === 'LEFT') {
      if (dx >= -4) continue;
      primaryDist = Math.max(1, curRect.left - r.right, -dx * 0.45);
      crossDist = Math.abs(dy);
      const vertOverlap =
        Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top);
      if (vertOverlap > 4) {
        overlapBonus = -120;
      } else if (crossDist > Math.max(curRect.height, r.height) * 1.8) {
        crossDist *= 4.5;
      }
    } else if (dir === 'DOWN') {
      if (dy <= 6) continue;
      primaryDist = Math.max(1, r.top - curRect.bottom, dy * 0.5);
      crossDist = Math.abs(dx);
      const horizOverlap =
        Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left);
      if (horizOverlap > 4) {
        overlapBonus = -80;
      }
    } else if (dir === 'UP') {
      if (dy >= -6) continue;
      primaryDist = Math.max(1, curRect.top - r.bottom, -dy * 0.5);
      crossDist = Math.abs(dx);
      const horizOverlap =
        Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left);
      if (horizOverlap > 4) {
        overlapBonus = -80;
      }
    }

    const score = primaryDist * 1.0 + crossDist * 2.35 + overlapBonus;
    if (score < bestScore) {
      bestScore = score;
      bestEl = cand;
    }
  }

  return bestEl;
}

export function announceTvA11y(message: string): void {
  if (typeof document === 'undefined' || !message.trim()) return;
  let region = document.getElementById('naim-tv-a11y-live');
  if (!region) {
    region = document.createElement('div');
    region.id = 'naim-tv-a11y-live';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }
  region.textContent = '';
  window.setTimeout(() => {
    if (region) region.textContent = message.trim().slice(0, 140);
  }, 15);
}

function getFocusableAnnouncement(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  if (aria.trim()) return aria.trim();
  const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  return txt;
}

function focusElementForTv(el: HTMLElement) {
  document.documentElement.classList.add('tv-dpad-active');
  el.focus({ preventScroll: true });
  const label = getFocusableAnnouncement(el);
  if (label) {
    announceTvA11y(label);
  }
  try {
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  } catch {
    el.scrollIntoView(false);
  }
}

export interface TvSpatialRemoteCallbacks {
  onBackStep: () => boolean;
  onChannelStep?: (delta: 1 | -1) => boolean;
}

export function useTvSpatialRemote(callbacks: TvSpatialRemoteCallbacks) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const isTv = isGoogleTvEnvironment();
    const isTizen = isTizenTvRuntime();
    const isWebOs = isWebOsTvRuntime();
    if (isTv) {
      document.documentElement.classList.add('tv-dpad-active', 'is-google-tv');
    }
    if (isTizen) {
      document.documentElement.classList.add('is-tizen-tv', 'tv-dpad-active');
      registerTizenRemoteKeys();
    }
    if (isWebOs) {
      document.documentElement.classList.add('is-webos-tv', 'tv-dpad-active');
    }

    const onPointerMove = () => {
      if (!isGoogleTvEnvironment()) {
        document.documentElement.classList.remove('tv-dpad-active');
      }
    };
    window.addEventListener('mousemove', onPointerMove, { passive: true });

    const controlPrimaryVideo = (
      cmd: 'PLAY_PAUSE' | 'PLAY' | 'PAUSE' | 'STOP' | 'FF' | 'RW'
    ): boolean => {
      const videos = Array.from(document.querySelectorAll('video')).filter(
        (v) => v.readyState >= 1 || Boolean(v.currentSrc || v.src)
      );
      const video = videos[0];
      if (!video) return false;

      video.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

      if (cmd === 'PLAY_PAUSE') {
        if (video.paused) {
          video.play().catch(() => {});
          syncTizenScreenSaver(true);
          syncWebOsScreenSaver(true);
        } else {
          video.pause();
          syncTizenScreenSaver(false);
          syncWebOsScreenSaver(false);
        }
        return true;
      }
      if (cmd === 'PLAY') {
        video.play().catch(() => {});
        syncTizenScreenSaver(true);
        syncWebOsScreenSaver(true);
        return true;
      }
      if (cmd === 'PAUSE') {
        video.pause();
        syncTizenScreenSaver(false);
        syncWebOsScreenSaver(false);
        return true;
      }
      if (cmd === 'STOP') {
        video.pause();
        if (Number.isFinite(video.duration) && video.duration > 0) {
          try {
            video.currentTime = 0;
          } catch {
            // ignore live stream seek
          }
        }
        syncTizenScreenSaver(false);
        syncWebOsScreenSaver(false);
        return true;
      }
      if (cmd === 'FF') {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
        }
        return true;
      }
      if (cmd === 'RW') {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.max(0, video.currentTime - 10);
        }
        return true;
      }
      return false;
    };

    const handleTvAction = (action: TvRemoteAction): 'HANDLED' | 'AT_ROOT' => {
      document.documentElement.classList.add('tv-dpad-active');
      const active = document.activeElement as HTMLElement | null;

      if (action === 'BLUR_INPUT') {
        if (active && isTextInput(active)) {
          active.blur();
        }
        window.NaimTvBridge?.setInputMode?.(false);
        return 'HANDLED';
      }

      if (
        action === 'PLAY_PAUSE' ||
        action === 'PLAY' ||
        action === 'PAUSE' ||
        action === 'FF' ||
        action === 'RW'
      ) {
        controlPrimaryVideo(action);
        return 'HANDLED';
      }

      if (action === 'STOP') {
        const hadVideo = controlPrimaryVideo('STOP');
        if (hadVideo) {
          cbRef.current.onBackStep();
          return 'HANDLED';
        }
        action = 'BACK';
      }

      if (action === 'CH_UP') {
        cbRef.current.onChannelStep?.(1);
        return 'HANDLED';
      }
      if (action === 'CH_DOWN') {
        cbRef.current.onChannelStep?.(-1);
        return 'HANDLED';
      }

      if (action === 'BACK') {
        if (active && isTextInput(active)) {
          active.blur();
          window.NaimTvBridge?.setInputMode?.(false);
          return 'HANDLED';
        }

        const doc = document as Document & {
          webkitFullscreenElement?: Element;
          webkitExitFullscreen?: () => Promise<void>;
        };
        if (doc.fullscreenElement || doc.webkitFullscreenElement) {
          if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
          else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
          return 'HANDLED';
        }

        const scope = getActiveScopeContainer();
        if (scope !== document && scope instanceof HTMLElement) {
          const closeBtn = scope.querySelector<HTMLElement>(
            'button[aria-label*="Cerrar" i], button[aria-label*="Close" i], button[data-tv-close="true"]'
          );
          if (closeBtn) {
            closeBtn.click();
            return 'HANDLED';
          }
        }

        const consumed = cbRef.current.onBackStep();
        return consumed ? 'HANDLED' : 'AT_ROOT';
      }

      if (action === 'SELECT') {
        if (active && active !== document.body && active !== document.documentElement) {
          if (isTextInput(active)) {
            active.focus();
            window.NaimTvBridge?.setInputMode?.(true);
            window.NaimTvBridge?.openKeyboard?.();
            return 'HANDLED';
          }
          active.click();
          return 'HANDLED';
        }
        const candidates = getVisibleFocusables();
        if (candidates.length > 0) {
          focusElementForTv(candidates[0]);
        }
        return 'HANDLED';
      }

      if (
        action === 'UP' ||
        action === 'DOWN' ||
        action === 'LEFT' ||
        action === 'RIGHT'
      ) {
        const candidates = getVisibleFocusables();
        const next = findNextSpatialTarget(active, action, candidates);
        if (next) {
          focusElementForTv(next);
        } else if (action === 'DOWN') {
          window.scrollBy({ top: 260, behavior: 'smooth' });
        } else if (action === 'UP') {
          window.scrollBy({ top: -260, behavior: 'smooth' });
        }
        return 'HANDLED';
      }

      return 'HANDLED';
    };

    window.__naimTvKey = handleTvAction;
    window.__naimInitTvFocus = () => {
      document.documentElement.classList.add('tv-dpad-active', 'is-google-tv');
      const candidates = getVisibleFocusables();
      if (candidates.length > 0 && (!document.activeElement || document.activeElement === document.body)) {
        focusElementForTv(candidates[0]);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(document.activeElement)) {
        const code = e.keyCode || e.which;
        if (e.key === 'Escape' || code === 10009) {
          e.preventDefault();
          handleTvAction('BLUR_INPUT');
        } else if (e.key === 'Enter') {
          window.NaimTvBridge?.setInputMode?.(false);
          window.NaimTvBridge?.closeKeyboard?.();
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const mapped = mapKeyboardEventToTvAction(e);
      if (!mapped) return;

      // Preserve native button/anchor Enter click behavior when focused cleanly inside browser
      if (
        mapped === 'SELECT' &&
        e.key === 'Enter' &&
        document.activeElement &&
        ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      e.preventDefault();
      handleTvAction(mapped);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (isTextInput(target)) {
        window.NaimTvBridge?.setInputMode?.(true);
      } else {
        window.NaimTvBridge?.setInputMode?.(false);
      }
    };

    // Keep Tizen / LG webOS TV screensaver disabled while any HTML5 <video> plays
    const onMediaPlayState = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== 'VIDEO') return;
      const video = target as HTMLVideoElement;
      const playing = !video.paused && !video.ended;
      syncTizenScreenSaver(playing);
      syncWebOsScreenSaver(playing);
    };

    // Recover TV focus gracefully if currently focused node unmounts
    let focusGuardTimer: number | null = null;
    const observer =
      typeof MutationObserver !== 'undefined' && (isTv || isTizen || isWebOs)
        ? new MutationObserver(() => {
            if (!document.documentElement.classList.contains('tv-dpad-active')) return;
            const cur = document.activeElement;
            if (cur && cur !== document.body && cur !== document.documentElement && cur.isConnected) {
              return;
            }
            if (focusGuardTimer !== null) window.clearTimeout(focusGuardTimer);
            focusGuardTimer = window.setTimeout(() => {
              const candidates = getVisibleFocusables();
              if (
                candidates.length > 0 &&
                (!document.activeElement ||
                  document.activeElement === document.body ||
                  document.activeElement === document.documentElement)
              ) {
                const preferred =
                  candidates.find((el) => el.getAttribute('data-tv-focusable') === 'true') ||
                  candidates[0];
                focusElementForTv(preferred);
              }
            }, 90);
          })
        : null;

    if (observer && document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('play', onMediaPlayState, true);
    document.addEventListener('pause', onMediaPlayState, true);
    document.addEventListener('ended', onMediaPlayState, true);

    if (isTv || isTizen || isWebOs) {
      setTimeout(() => {
        window.__naimInitTvFocus?.();
      }, 350);
    }

    return () => {
      if (focusGuardTimer !== null) window.clearTimeout(focusGuardTimer);
      observer?.disconnect();
      syncTizenScreenSaver(false);
      syncWebOsScreenSaver(false);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('play', onMediaPlayState, true);
      document.removeEventListener('pause', onMediaPlayState, true);
      document.removeEventListener('ended', onMediaPlayState, true);
    };
  }, []);
}
