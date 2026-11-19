import { triggerHaptic } from './haptics';
import {
  buildCanonicalShareUrl,
  type CanonicalLinkInput,
} from '../shared/dedicatedRoutes';
import { useAppStore } from '../store/useAppStore';

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showAppShareToast(message: string, durationMs = 2600): void {
  const store = useAppStore.getState();
  store.setShareToast(message);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    useAppStore.getState().setShareToast(null);
    toastTimer = null;
  }, durationMs);
}

function isLikelyMobileNativeShareDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const isTouchCoarse =
    window.matchMedia?.('(pointer: coarse)').matches &&
    window.matchMedia?.('(max-width: 768px)').matches;
  return Boolean(isTouchCoarse && typeof navigator.share === 'function');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall back below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export interface ShareDedicatedLinkOptions {
  target: CanonicalLinkInput;
  roomId?: string;
  title?: string;
  text?: string;
  toastLabel?: string;
  preferClipboardOnly?: boolean;
}

export async function shareDedicatedLink({
  target,
  roomId,
  title = 'RiffanTV',
  text,
  toastLabel,
  preferClipboardOnly = false,
}: ShareDedicatedLinkOptions): Promise<{ url: string; copied: boolean }> {
  const url = buildCanonicalShareUrl(target, { roomId });
  triggerHaptic('medium');

  if (!preferClipboardOnly && isLikelyMobileNativeShareDevice()) {
    try {
      await navigator.share({ title, text: text || title, url });
      showAppShareToast(toastLabel || `Enlace listo · ${url}`);
      return { url, copied: true };
    } catch (err) {
      if (err && typeof err === 'object' && (err as Error).name === 'AbortError') {
        return { url, copied: false };
      }
    }
  }

  const copied = await copyTextToClipboard(url);
  showAppShareToast(toastLabel || `Enlace copiado · ${url}`);
  return { url, copied };
}
