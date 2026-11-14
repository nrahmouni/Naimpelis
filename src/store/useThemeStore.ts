import { create } from 'zustand';
import type { AppTheme, TextDensity } from '../types';

const THEME_STORAGE_KEY = 'naimcine_theme_prefs_v1';

interface ThemeState {
  theme: AppTheme;
  density: TextDensity;
  liteMode: boolean;
  liteModeAuto: boolean;
  reducedMotion: boolean;
  posterAmbientColor: string;
  tvOverscanSafe: boolean;
  setTheme: (theme: AppTheme) => void;
  setDensity: (density: TextDensity) => void;
  setLiteMode: (enabled: boolean, manual?: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setPosterAmbientColor: (cssColor: string) => void;
  setTvOverscanSafe: (enabled: boolean) => void;
  syncDomAttributes: () => void;
}

function detectLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8;
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  return mem <= 4 || cores <= 4;
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadSavedThemePrefs(): Partial<ThemeState> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ThemeState>;
  } catch {
    return {};
  }
}

function persistThemePrefs(state: ThemeState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({
        theme: state.theme,
        density: state.density,
        liteMode: state.liteMode,
        liteModeAuto: state.liteModeAuto,
        reducedMotion: state.reducedMotion,
        tvOverscanSafe: state.tvOverscanSafe,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

function applyAttributesToRoot(state: Pick<ThemeState, 'theme' | 'density' | 'liteMode' | 'reducedMotion' | 'posterAmbientColor'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', state.theme);
  root.setAttribute('data-density', state.density);
  root.setAttribute('data-lite', state.liteMode ? 'true' : 'false');
  root.setAttribute('data-reduced-motion', state.reducedMotion ? 'true' : 'false');
  root.style.setProperty('--ambient-poster-glow', state.posterAmbientColor || 'rgba(225, 29, 72, 0.28)');
}

const saved = loadSavedThemePrefs();
const initialLiteAuto = saved.liteModeAuto ?? true;
const initialLite = initialLiteAuto ? detectLowEndDevice() : Boolean(saved.liteMode);
const initialStateValues = {
  theme: (saved.theme as AppTheme) || 'oled',
  density: (saved.density as TextDensity) || 'comfortable',
  liteMode: initialLite,
  liteModeAuto: initialLiteAuto,
  reducedMotion: saved.reducedMotion ?? detectReducedMotion(),
  posterAmbientColor: 'rgba(225, 29, 72, 0.28)',
  tvOverscanSafe: Boolean(saved.tvOverscanSafe),
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  ...initialStateValues,

  setTheme: (theme) => {
    set({ theme });
    const next = get();
    applyAttributesToRoot(next);
    persistThemePrefs(next);
  },

  setDensity: (density) => {
    set({ density });
    const next = get();
    applyAttributesToRoot(next);
    persistThemePrefs(next);
  },

  setLiteMode: (enabled, manual = true) => {
    set({ liteMode: enabled, liteModeAuto: !manual });
    const next = get();
    applyAttributesToRoot(next);
    persistThemePrefs(next);
  },

  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    const next = get();
    applyAttributesToRoot(next);
    persistThemePrefs(next);
  },

  setPosterAmbientColor: (cssColor) => {
    set({ posterAmbientColor: cssColor });
    applyAttributesToRoot(get());
  },

  setTvOverscanSafe: (tvOverscanSafe) => {
    set({ tvOverscanSafe });
    persistThemePrefs(get());
  },

  syncDomAttributes: () => {
    applyAttributesToRoot(get());
  },
}));
