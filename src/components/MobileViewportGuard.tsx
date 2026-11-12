import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';

export type ViewPreference = 'auto' | 'mobile' | 'desktop';
export type EffectiveViewMode = 'mobile' | 'desktop';

const VIEW_PREF_STORAGE_KEY = 'naim_view_preference_v4';

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

function detectCoarseTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
      // Distinguish pure phones/tablets with no fine mouse hover
      if (window.matchMedia?.('(hover: none)').matches) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function useViewLayoutMode() {
  const [viewPreference, setViewPreferenceState] = useState<ViewPreference>(() =>
    readStoredViewPreference()
  );
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const syncDimensions = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    syncDimensions();
    window.addEventListener('resize', syncDimensions);
    window.addEventListener('orientationchange', syncDimensions);
    window.visualViewport?.addEventListener('resize', syncDimensions);
    return () => {
      window.removeEventListener('resize', syncDimensions);
      window.removeEventListener('orientationchange', syncDimensions);
      window.visualViewport?.removeEventListener('resize', syncDimensions);
    };
  }, []);

  const windowWidth = viewportSize.width;
  const windowHeight = viewportSize.height;
  const isCoarseTouch = detectCoarseTouchDevice();

  // Detect smartphones where Chrome Android's "Sitio para ordenador / Desktop site"
  // forced a ~980px desktop layout viewport onto a tall portrait phone screen (aspect >= 1.5)
  const isPhoneForcedDesktopViewport =
    isCoarseTouch &&
    windowWidth >= 680 &&
    windowHeight / Math.max(windowWidth, 1) >= 1.5 &&
    viewPreference !== 'desktop';

  const isSmartTvScreen =
    typeof window !== 'undefined' &&
    (Boolean((window as Window & { __NAIM_GOOGLE_TV__?: boolean }).__NAIM_GOOGLE_TV__) ||
      window.location.search.includes('googletv=1') ||
      /NaimCineGoogleTV|GoogleTV|Android TV|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|WebOS|AFTB|AFTT|AFTM|AFTKA/i.test(
        typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      ));

  const naturalMode: EffectiveViewMode =
    isSmartTvScreen || (!isPhoneForcedDesktopViewport && windowWidth >= 1024)
      ? 'desktop'
      : 'mobile';

  const effectiveView: EffectiveViewMode =
    viewPreference === 'auto' ? naturalMode : viewPreference;

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.style.removeProperty('zoom');
      const vp = document.getElementById('naim-viewport');

      if (viewPreference === 'desktop' && (window.screen?.width || 1280) < 1024) {
        // User on a small screen explicitly requested Desktop View
        root.style.removeProperty('font-size');
        vp?.setAttribute(
          'content',
          'width=1280, initial-scale=0.32, minimum-scale=0.2, maximum-scale=5.0, viewport-fit=cover'
        );
      } else {
        vp?.setAttribute(
          'content',
          'width=device-width, initial-scale=1.0, viewport-fit=cover'
        );

        // If Chrome Android "Sitio para ordenador" still forces a ~980px viewport on a portrait phone,
        // scale root rem proportionally so 980px === ~24.5rem (100% native full-bleed mobile sizing)
        if (isPhoneForcedDesktopViewport) {
          const scale = Math.min(2.65, Math.max(1.75, windowWidth / 392));
          root.style.fontSize = `${Math.round(16 * scale)}px`;
        } else {
          root.style.removeProperty('font-size');
        }
      }
    } catch {
      // ignore
    }
  }, [viewPreference, isPhoneForcedDesktopViewport, windowWidth]);

  const setViewPreference = useCallback((next: ViewPreference) => {
    setViewPreferenceState(next);
    try {
      localStorage.setItem(VIEW_PREF_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    if (effectiveView === 'desktop') {
      // On touch devices return to natural full-bleed mobile ('auto'); on PC switch to 'mobile' preview
      setViewPreference(isCoarseTouch ? 'auto' : 'mobile');
    } else {
      setViewPreference('desktop');
    }
  }, [effectiveView, isCoarseTouch, setViewPreference]);

  // ONLY render the 430px centered mobile preview frame when the user is on a real
  // non-touch landscape PC monitor (>=1024px) and explicitly toggled "Vista móvil".
  // NEVER activate automatically on phones, tablets, foldables, or Chrome Desktop-Site mode.
  const isFramedMobileOnPc =
    viewPreference === 'mobile' &&
    !isCoarseTouch &&
    windowWidth >= 1024 &&
    windowWidth > windowHeight;

  return {
    viewPreference,
    effectiveView,
    isDesktopLayout: effectiveView === 'desktop',
    isFramedMobileOnPc,
    isPhoneForcedDesktopViewport,
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
      className={`min-h-10 ${
        compact ? 'px-2.5' : 'px-3.5'
      } rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-95 border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
    >
      {switchToMobile ? (
        <>
          <Smartphone className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className={compact ? 'hidden xl:inline' : 'inline'}>
            {lang === 'es' ? 'Vista móvil' : 'Mobile view'}
          </span>
        </>
      ) : (
        <>
          <Monitor className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className={compact ? 'hidden xl:inline' : 'inline'}>
            {lang === 'es' ? 'Vista PC' : 'Desktop view'}
          </span>
        </>
      )}
    </button>
  );
};
