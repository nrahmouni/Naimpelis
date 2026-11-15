import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, ShieldAlert, X } from 'lucide-react';

const ESCAPE_ATTEMPTED_KEY = 'naim_preview_escape_attempted_v1';

/**
 * Safely checks whether the app is running nested inside an iframe using ONLY
 * `window.self !== window.top` (never reads `window.top` or `window.parent`
 * properties to avoid cross-origin SecurityError).
 */
export function isInsideNestedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

interface PreviewAutoEscapeBannerProps {
  /** 'bar' sits inside flex layout without overlapping headers; 'floating' pins fixed at top */
  variant?: 'bar' | 'floating';
}

export const PreviewAutoEscapeBanner: React.FC<PreviewAutoEscapeBannerProps> = ({
  variant = 'bar',
}) => {
  const [isNested] = useState<boolean>(() => isInsideNestedIframe());
  const [dismissed, setDismissed] = useState<boolean>(false);

  const openStandaloneTab = useCallback((): Window | null => {
    if (typeof window === 'undefined') return null;
    try {
      window.sessionStorage.setItem(ESCAPE_ATTEMPTED_KEY, '1');
    } catch {
      // ignore storage errors
    }
    try {
      const opened = window.open(window.location.href, '_blank', 'noopener');
      if (opened) {
        setDismissed(true);
      }
      return opened;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isNested || typeof window === 'undefined') return;

    let alreadyAttempted = false;
    try {
      alreadyAttempted = window.sessionStorage.getItem(ESCAPE_ATTEMPTED_KEY) === '1';
    } catch {
      alreadyAttempted = false;
    }
    if (alreadyAttempted) return;

    const cleanup = () => {
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
    };

    const handleFirstGesture = () => {
      cleanup();
      try {
        if (window.sessionStorage.getItem(ESCAPE_ATTEMPTED_KEY) === '1') return;
        window.sessionStorage.setItem(ESCAPE_ATTEMPTED_KEY, '1');
      } catch {
        // continue
      }
      try {
        const opened = window.open(window.location.href, '_blank', 'noopener');
        if (opened) {
          setDismissed(true);
        }
      } catch {
        // Keep banner visible if popup was blocked
      }
    };

    window.addEventListener('pointerdown', handleFirstGesture, true);
    window.addEventListener('keydown', handleFirstGesture, true);

    return cleanup;
  }, [isNested]);

  if (!isNested || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de reproducción en pestaña propia"
      className={
        variant === 'floating'
          ? 'fixed top-0 inset-x-0 z-[120] bg-[#18122B]/95 backdrop-blur-xl border-b border-[#9146FF]/45 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.65)]'
          : 'shrink-0 w-full z-[90] bg-[#18122B]/95 backdrop-blur-xl border-b border-[#9146FF]/45 px-3 py-2 shadow-[0_6px_24px_rgba(0,0,0,0.45)]'
      }
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="w-4 h-4 text-[#BF94FF] shrink-0" />
          <p className="text-xs font-medium text-zinc-100 leading-snug">
            Para reproducir sin bloqueos, abre la app en su propia pestaña
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => {
              openStandaloneTab();
            }}
            className="min-h-8 px-3 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] active:scale-95 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span>Abrir app</span>
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Ocultar aviso"
            className="w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
