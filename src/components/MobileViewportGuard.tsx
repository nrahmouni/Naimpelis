import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';

export type ViewPreference = 'auto' | 'mobile' | 'desktop';
export type EffectiveViewMode = 'mobile' | 'desktop';

const VIEW_PREF_STORAGE_KEY = 'naim_view_preference_v3';

export function getMonogramInitials(rawName: string): string {
  const cleaned = (rawName || '')
    .replace(/\(TV\)/gi, '')
    .replace(/[_\-.]+/g, ' ')
    .trim();
  if (!cleaned) return 'NC';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function readStoredViewPreference(): ViewPreference {
  try {
    const val = localStorage.getItem(VIEW_PREF_STORAGE_KEY);
    if (val === 'mobile' || val === 'desktop' || val === 'auto') return val;
  } catch {
    // ignore
  }
  return 'auto';
}

export function useViewLayoutMode() {
  const [viewPreference, setViewPreferenceState] = useState<ViewPreference>(() =>
    readStoredViewPreference()
  );
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Natural responsive mode — NEVER forces mobile automatically
  const naturalMode: EffectiveViewMode = windowWidth >= 1024 ? 'desktop' : 'mobile';
  const effectiveView: EffectiveViewMode =
    viewPreference === 'auto' ? naturalMode : viewPreference;

  useEffect(() => {
    try {
      // Ensure any legacy zoom property is always cleared
      document.documentElement.style.removeProperty('zoom');
      const vp = document.getElementById('naim-viewport');
      if (!vp) return;

      if (viewPreference === 'desktop' && (window.screen?.width || 1280) < 1024) {
        // User on a small screen explicitly requested Desktop View
        vp.setAttribute(
          'content',
          'width=1280, initial-scale=0.32, minimum-scale=0.2, maximum-scale=5.0, viewport-fit=cover'
        );
      } else {
        vp.setAttribute(
          'content',
          'width=device-width, initial-scale=1.0, viewport-fit=cover'
        );
      }
    } catch {
      // ignore
    }
  }, [viewPreference]);

  const setViewPreference = useCallback((next: ViewPreference) => {
    setViewPreferenceState(next);
    try {
      localStorage.setItem(VIEW_PREF_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    const next: ViewPreference = effectiveView === 'desktop' ? 'mobile' : 'desktop';
    setViewPreference(next);
  }, [effectiveView, setViewPreference]);

  // When on a wide desktop screen and user manually chooses "Mobile View",
  // render a centered 430px mobile app frame with mobile navigation.
  const isFramedMobileOnPc = effectiveView === 'mobile' && windowWidth >= 640;

  return {
    viewPreference,
    effectiveView,
    isDesktopLayout: effectiveView === 'desktop',
    isFramedMobileOnPc,
    setViewPreference,
    toggleViewMode,
  };
}

interface ViewModeSwitchButtonProps {
  effectiveView: EffectiveViewMode;
  onToggle: () => void;
  lang: AppLanguage;
  compact?: boolean;
}

export const ViewModeSwitchButton: React.FC<ViewModeSwitchButtonProps> = ({
  effectiveView,
  onToggle,
  lang,
  compact = false,
}) => {
  const switchToMobile = effectiveView === 'desktop';

  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        onToggle();
      }}
      title={
        switchToMobile
          ? lang === 'es'
            ? 'Ver en modo móvil'
            : 'Switch to mobile view'
          : lang === 'es'
          ? 'Ver en modo escritorio'
          : 'Switch to desktop view'
      }
      aria-label={
        switchToMobile
          ? lang === 'es'
            ? 'Ver en modo móvil'
            : 'Switch to mobile view'
          : lang === 'es'
          ? 'Ver en modo escritorio'
          : 'Switch to desktop view'
      }
      className={`min-h-[40px] ${
        compact ? 'px-2.5 sm:px-3' : 'px-3.5'
      } rounded-xl bg-[#12141D] hover:bg-[#191C28] active:scale-95 border border-white/12 text-xs font-medium text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
    >
      {switchToMobile ? (
        <>
          <Smartphone className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          <span className={compact ? 'hidden md:inline' : 'inline'}>
            {lang === 'es' ? 'Modo móvil' : 'Mobile view'}
          </span>
        </>
      ) : (
        <>
          <Monitor className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          <span className={compact ? 'hidden sm:inline' : 'inline'}>
            {lang === 'es' ? 'Modo PC' : 'Desktop view'}
          </span>
        </>
      )}
    </button>
  );
};
