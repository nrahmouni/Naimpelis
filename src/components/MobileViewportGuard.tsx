import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';

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

export function isMobileDeviceUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || '';
  // Identify Android phones, Samsung Galaxy models (SM-S928 for S24 Ultra, etc.), iPhones, and general mobile devices
  if (/Android.+Mobile|Mobile Safari|iPhone|iPod|BlackBerry|Opera Mini|IEMobile|WPDesktop|SamsungBrowser|SM-[A-Z0-9]+/i.test(ua)) {
    return true;
  }
  if (/Android/i.test(ua) && !/GoogleTV|Android TV|SmartTV|BRAVIA/i.test(ua)) {
    if (typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 768) {
      return true;
    }
  }
  return false;
}

function detectCoarseTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (isMobileDeviceUserAgent()) return true;
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    if (window.matchMedia?.('(hover: none)').matches) return true;
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
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      setViewportSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
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
  const isMobilePhone = isMobileDeviceUserAgent();

  const isSmartTvScreen =
    typeof window !== 'undefined' &&
    (Boolean((window as Window & { __NAIM_GOOGLE_TV__?: boolean }).__NAIM_GOOGLE_TV__) ||
      window.location.search.includes('googletv=1') ||
      /NaimCineGoogleTV|GoogleTV|Android TV|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|WebOS|AFTB|AFTT|AFTM|AFTKA/i.test(
        typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
      ));

  const naturalMode: EffectiveViewMode =
    isSmartTvScreen
      ? 'desktop'
      : isMobilePhone
      ? 'mobile'
      : windowWidth >= 1024
      ? 'desktop'
      : 'mobile';

  const isPhoneForcedDesktopViewport =
    viewPreference === 'desktop' && windowWidth < 1024;

  const effectiveView: EffectiveViewMode =
    viewPreference === 'auto' ? naturalMode : viewPreference;

  useEffect(() => {
    try {
      const root = document.documentElement;
      if (root.style.getPropertyValue('zoom')) root.style.removeProperty('zoom');
      if (root.style.getPropertyValue('font-size')) root.style.removeProperty('font-size');
      const vp = document.getElementById('naim-viewport');
      if (!vp) return;

      const targetContent =
        viewPreference === 'desktop' && (window.screen?.width || 1280) < 1024
          ? 'width=1280, initial-scale=0.32, minimum-scale=0.2, maximum-scale=5.0, viewport-fit=cover'
          : 'width=device-width, initial-scale=1.0, viewport-fit=cover';
      if (vp.getAttribute('content') !== targetContent) {
        vp.setAttribute('content', targetContent);
      }
    } catch {
      // ignore
    }
  }, [viewPreference, windowWidth]);

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
          ? pickLang(lang, {
              es: 'Ver en modo móvil',
              ca: 'Veure en mode mòbil',
              en: 'Switch to mobile view',
            })
          : pickLang(lang, {
              es: 'Ver en modo escritorio',
              ca: 'Veure en mode escriptori',
              en: 'Switch to desktop view',
            })
      }
      aria-label={
        switchToMobile
          ? pickLang(lang, {
              es: 'Ver en modo móvil',
              ca: 'Veure en mode mòbil',
              en: 'Switch to mobile view',
            })
          : pickLang(lang, {
              es: 'Ver en modo escritorio',
              ca: 'Veure en mode escriptori',
              en: 'Switch to desktop view',
            })
      }
      className={`min-h-10 ${
        compact ? 'px-2.5' : 'px-3.5'
      } rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-95 border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
    >
      {switchToMobile ? (
        <>
          <Smartphone className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className={compact ? 'hidden xl:inline' : 'inline'}>
            {pickLang(lang, { es: 'Vista móvil', ca: 'Vista mòbil', en: 'Mobile view' })}
          </span>
        </>
      ) : (
        <>
          <Monitor className="w-4 h-4 text-zinc-300 shrink-0" />
          <span className={compact ? 'hidden xl:inline' : 'inline'}>
            {pickLang(lang, { es: 'Vista PC', ca: 'Vista PC', en: 'Desktop view' })}
          </span>
        </>
      )}
    </button>
  );
};
