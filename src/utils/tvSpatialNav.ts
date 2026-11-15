import { useEffect, useRef } from 'react';

export type TvRemoteAction =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'SELECT'
  | 'BACK'
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

declare global {
  interface Window {
    __NAIM_GOOGLE_TV__?: boolean;
    __naimTvKey?: (action: TvRemoteAction) => 'HANDLED' | 'AT_ROOT';
    __naimInitTvFocus?: () => void;
    NaimTvBridge?: NaimTvAndroidBridge;
  }
}

export function isGoogleTvEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__NAIM_GOOGLE_TV__) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('googletv') === '1') return true;
  } catch {
    // ignore
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /NaimCineGoogleTV|GoogleTV|Android TV|BRAVIA|AFTB|AFTT|AFTM|AFTKA|Chromecast/i.test(ua);
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
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    parseFloat(style.opacity || '1') < 0.05
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width < 14 || rect.height < 14) return false;
  // Ignore elements completely far off-screen horizontally inside collapsed drawers
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
    // Pick first element currently inside the viewport, or fallback to first candidate
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
    // Skip nested child/parent of current element
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
        // Strongly avoid jumping across distant rows on LEFT/RIGHT
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
    if (isTv) {
      document.documentElement.classList.add('tv-dpad-active', 'is-google-tv');
    }

    const onPointerMove = () => {
      if (!isGoogleTvEnvironment()) {
        document.documentElement.classList.remove('tv-dpad-active');
      }
    };
    window.addEventListener('mousemove', onPointerMove, { passive: true });

    const controlPrimaryVideo = (
      cmd: 'PLAY_PAUSE' | 'PLAY' | 'PAUSE' | 'FF' | 'RW'
    ): boolean => {
      const videos = Array.from(document.querySelectorAll('video')).filter(
        (v) => v.readyState >= 1 || Boolean(v.currentSrc || v.src)
      );
      const video = videos[0];
      if (!video) return false;

      // Wake up player HUD if present
      video.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

      if (cmd === 'PLAY_PAUSE') {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        return true;
      }
      if (cmd === 'PLAY') {
        video.play().catch(() => {});
        return true;
      }
      if (cmd === 'PAUSE') {
        video.pause();
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

        // Check if an open modal has a close button
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
      // When typing inside a text input in a regular browser, only intercept Escape
      if (isTextInput(document.activeElement)) {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleTvAction('BLUR_INPUT');
        } else if (e.key === 'Enter') {
          window.NaimTvBridge?.setInputMode?.(false);
          window.NaimTvBridge?.closeKeyboard?.();
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let mapped: TvRemoteAction | null = null;
      switch (e.key) {
        case 'ArrowUp':
          mapped = 'UP';
          break;
        case 'ArrowDown':
          mapped = 'DOWN';
          break;
        case 'ArrowLeft':
          mapped = 'LEFT';
          break;
        case 'ArrowRight':
          mapped = 'RIGHT';
          break;
        case 'Enter':
          // If native button already handles Enter click on browser, only manually trigger on role="button" divs
          if (
            document.activeElement &&
            !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(
              document.activeElement.tagName
            )
          ) {
            e.preventDefault();
            handleTvAction('SELECT');
          } else if (
            !document.activeElement ||
            document.activeElement === document.body
          ) {
            e.preventDefault();
            handleTvAction('SELECT');
          }
          return;
        case 'Escape':
        case 'GoBack':
        case 'BrowserBack':
          mapped = 'BACK';
          break;
        case 'MediaPlayPause':
          mapped = 'PLAY_PAUSE';
          break;
        case 'MediaPlay':
          mapped = 'PLAY';
          break;
        case 'MediaPause':
          mapped = 'PAUSE';
          break;
        case 'MediaFastForward':
          mapped = 'FF';
          break;
        case 'MediaRewind':
          mapped = 'RW';
          break;
        case 'ChannelUp':
          mapped = 'CH_UP';
          break;
        case 'ChannelDown':
          mapped = 'CH_DOWN';
          break;
        default:
          break;
      }

      if (!mapped) {
        const legacyCode = e.keyCode || e.which;
        if (legacyCode === 10009 || legacyCode === 461) {
          // Samsung Tizen Return (10009) & LG webOS Back (461)
          mapped = 'BACK';
        } else if (legacyCode === 415) {
          mapped = 'PLAY';
        } else if (legacyCode === 19 || legacyCode === 413) {
          mapped = 'PAUSE';
        } else if (legacyCode === 412) {
          mapped = 'RW';
        } else if (legacyCode === 417) {
          mapped = 'FF';
        } else if (legacyCode === 427) {
          mapped = 'CH_UP';
        } else if (legacyCode === 428) {
          mapped = 'CH_DOWN';
        }
      }

      if (mapped) {
        e.preventDefault();
        handleTvAction(mapped);
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (isTextInput(target)) {
        window.NaimTvBridge?.setInputMode?.(true);
      } else {
        window.NaimTvBridge?.setInputMode?.(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);

    if (isTv) {
      setTimeout(() => {
        window.__naimInitTvFocus?.();
      }, 350);
    }

    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
}
