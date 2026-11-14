import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0
  );
}

/**
 * Traps keyboard focus inside an open dialog/sheet, handles Escape to close,
 * moves initial focus inside, and restores focus to the previously focused
 * element when closed.
 */
export function useFocusTrap(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  options?: { restoreFocus?: boolean; autoFocusSelector?: string }
): void {
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previousActiveRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const rafId = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      if (options?.autoFocusSelector) {
        const preferred = container.querySelector<HTMLElement>(options.autoFocusSelector);
        if (preferred) {
          preferred.focus({ preventScroll: true });
          return;
        }
      }

      const explicitAutoFocus = container.querySelector<HTMLElement>('[data-autofocus="true"]');
      if (explicitAutoFocus) {
        explicitAutoFocus.focus({ preventScroll: true });
        return;
      }

      if (!container.contains(document.activeElement)) {
        const focusables = getFocusableElements(container);
        if (focusables.length > 0) {
          focusables[0].focus({ preventScroll: true });
        } else {
          if (!container.hasAttribute('tabindex')) {
            container.setAttribute('tabindex', '-1');
          }
          container.focus({ preventScroll: true });
        }
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || !container.contains(active) || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!active || !container.contains(active) || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (options?.restoreFocus !== false) {
        const prev = previousActiveRef.current;
        if (prev && prev.isConnected) {
          window.requestAnimationFrame(() => {
            prev.focus({ preventScroll: true });
          });
        }
      }
    };
  }, [isOpen, containerRef, options?.restoreFocus, options?.autoFocusSelector]);
}
