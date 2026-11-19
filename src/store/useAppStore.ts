import { create } from 'zustand';
import type { TypingUserPayload } from '../shared/protocol';
import type {
  CatalogMovie,
  ScheduledRoomItem,
  SubtitleStyleSettings,
  TvSeriesDetails,
} from '../types';

const SUBTITLE_STYLE_KEY = 'naimcine_subtitle_style_v1';
const SCHEDULED_ROOMS_KEY = 'naimcine_scheduled_rooms_v1';
const LAST_WORLD_KEY = 'riffantv_last_world_v1';
const SESSION_MODE_KEY = 'riffantv_session_mode_v1';

export type SessionMode = 'solo' | 'party';
export type ShellNavSection = 'home' | 'search' | 'rooms' | 'my_list' | 'profile';
export type PrimaryWorldId =
  | 'cine'
  | 'futbol'
  | 'tv'
  | 'juegos'
  | 'kids'
  | 'sala';
export type WorldId = 'entry' | PrimaryWorldId | 'youtube';
export type CineSubTab = 'movies' | 'series';
export type FutbolSubTab = 'matches' | 'channels';

export interface RequestedSeriesModalPayload {
  series: CatalogMovie | TvSeriesDetails;
  season?: number;
  episode?: number;
}

const PRIMARY_WORLDS: PrimaryWorldId[] = [
  'cine',
  'futbol',
  'tv',
  'juegos',
  'kids',
  'sala',
];

function loadLastUsedWorld(): PrimaryWorldId | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_WORLD_KEY);
    return PRIMARY_WORLDS.includes(raw as PrimaryWorldId) ? (raw as PrimaryWorldId) : null;
  } catch {
    return null;
  }
}

function loadSessionMode(): SessionMode {
  if (typeof localStorage === 'undefined') return 'party';
  try {
    const raw = localStorage.getItem(SESSION_MODE_KEY);
    return raw === 'solo' ? 'solo' : 'party';
  } catch {
    return 'party';
  }
}

const TYPING_EXPIRY_MS = 4500;
const typingExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface SwUpdateRegistration {
  waitingWorker: ServiceWorker | null;
}

interface AppShellState {
  sessionMode: SessionMode;
  hasEnteredApp: boolean;
  shareToast: string | null;
  tvRegion: string;
  tdtCategory: string;
  adrarCountryFilter: string;
  futbolLeagueFilter: string;
  footballLiveBrand: string;
  futbolSearchQuery: string;
  futbolDayOffset: number;
  futbolStatusTab: 'live' | 'upcoming' | 'all';
  requestedMovieModal: CatalogMovie | null;
  requestedSeriesModal: RequestedSeriesModalPayload | null;
  requestedMatchSlug: string | null;
  activeNavSection: ShellNavSection;
  activeWorld: WorldId;
  lastUsedWorld: PrimaryWorldId | null;
  cineTab: CineSubTab;
  cineCastellano: boolean;
  futbolTab: FutbolSubTab;
  isFloatingRoomOpen: boolean;
  floatingBubbleSuppressCount: number;
  showDesignSystem: boolean;
  showLegalModal: boolean;
  showNotificationCenter: boolean;
  showCommandSearch: boolean;
  showSurpriseModal: boolean;
  typingUsers: TypingUserPayload[];
  subtitleStyle: SubtitleStyleSettings;
  syncOffsetMs: number;
  miniPlayerDismissed: boolean;
  scheduledRooms: ScheduledRoomItem[];
  swUpdate: SwUpdateRegistration | null;
  deferredAppUpdateVersion: string | null;
  authNotice: string | null;
  setSessionMode: (mode: SessionMode) => void;
  setHasEnteredApp: (entered: boolean) => void;
  setShareToast: (msg: string | null) => void;
  setTvRegion: (region: string) => void;
  setTdtCategory: (category: string) => void;
  setAdrarCountryFilter: (filter: string) => void;
  setFutbolLeagueFilter: (filter: string) => void;
  setFootballLiveBrand: (brand: string) => void;
  setFutbolSearchQuery: (q: string) => void;
  setFutbolDayOffset: (offset: number) => void;
  setFutbolStatusTab: (tab: 'live' | 'upcoming' | 'all') => void;
  setRequestedMovieModal: (movie: CatalogMovie | null) => void;
  setRequestedSeriesModal: (payload: RequestedSeriesModalPayload | null) => void;
  setRequestedMatchSlug: (slug: string | null) => void;
  setActiveNavSection: (section: ShellNavSection) => void;
  setActiveWorld: (world: WorldId) => void;
  setCineTab: (tab: CineSubTab) => void;
  setCineCastellano: (enabled: boolean) => void;
  setFutbolTab: (tab: FutbolSubTab) => void;
  setIsFloatingRoomOpen: (open: boolean) => void;
  pushBubbleSuppression: () => void;
  popBubbleSuppression: () => void;
  setShowDesignSystem: (open: boolean) => void;
  setShowLegalModal: (open: boolean) => void;
  setShowNotificationCenter: (open: boolean) => void;
  setShowCommandSearch: (open: boolean) => void;
  setShowSurpriseModal: (open: boolean) => void;
  setAuthNotice: (msg: string | null) => void;
  setTypingUser: (userId: string, userName: string, isTyping: boolean, roomId?: string) => void;
  updateSubtitleStyle: (patch: Partial<SubtitleStyleSettings>) => void;
  setSubtitleStyle: (patch: Partial<SubtitleStyleSettings>) => void;
  setSyncOffsetMs: (offsetMs: number) => void;
  setMiniPlayerDismissed: (dismissed: boolean) => void;
  addScheduledRoom: (item: Omit<ScheduledRoomItem, 'id'>) => void;
  removeScheduledRoom: (id: string) => void;
  setSwUpdate: (reg: SwUpdateRegistration | null) => void;
  setDeferredAppUpdateVersion: (version: string | null) => void;
  applySwUpdateNow: () => void;
}

const DEFAULT_SUBTITLE_STYLE: SubtitleStyleSettings = {
  fontScale: 1,
  fontColor: '#FFFFFF',
  bgOpacity: 0.72,
  edgeShadow: 'shadow',
  fontFamily: 'sans',
};

function loadSubtitleStyle(): SubtitleStyleSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SUBTITLE_STYLE;
  try {
    const raw = localStorage.getItem(SUBTITLE_STYLE_KEY);
    if (!raw) return DEFAULT_SUBTITLE_STYLE;
    return { ...DEFAULT_SUBTITLE_STYLE, ...(JSON.parse(raw) as Partial<SubtitleStyleSettings>) };
  } catch {
    return DEFAULT_SUBTITLE_STYLE;
  }
}

function loadScheduledRooms(): ScheduledRoomItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SCHEDULED_ROOMS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ScheduledRoomItem[];
    return Array.isArray(list)
      ? list.filter((s) => {
          const ts = Date.parse(s.scheduledForIso);
          return !Number.isFinite(ts) || ts > Date.now() - 3600_000;
        })
      : [];
  } catch {
    return [];
  }
}

export const useAppStore = create<AppShellState>((set, get) => ({
  sessionMode: loadSessionMode(),
  hasEnteredApp: false,
  shareToast: null,
  tvRegion: 'all',
  tdtCategory: 'all',
  adrarCountryFilter: 'all',
  futbolLeagueFilter: '',
  footballLiveBrand: 'all',
  futbolSearchQuery: '',
  futbolDayOffset: 0,
  futbolStatusTab: 'all',
  requestedMovieModal: null,
  requestedSeriesModal: null,
  requestedMatchSlug: null,
  activeNavSection: 'home',
  activeWorld: 'entry',
  lastUsedWorld: loadLastUsedWorld(),
  cineTab: 'movies',
  cineCastellano: true,
  futbolTab: 'matches',
  isFloatingRoomOpen: false,
  floatingBubbleSuppressCount: 0,
  showDesignSystem:
    typeof window !== 'undefined' &&
    window.location.pathname.toLowerCase().includes('/design-system'),
  showLegalModal: false,
  showNotificationCenter: false,
  showCommandSearch: false,
  showSurpriseModal: false,
  typingUsers: [],
  subtitleStyle: loadSubtitleStyle(),
  syncOffsetMs: 0,
  miniPlayerDismissed: false,
  scheduledRooms: loadScheduledRooms(),
  swUpdate: null,
  deferredAppUpdateVersion: null,
  authNotice: null,

  setSessionMode: (sessionMode) => {
    set({ sessionMode });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SESSION_MODE_KEY, sessionMode);
      } catch {
        // ignore
      }
    }
  },
  setHasEnteredApp: (hasEnteredApp) => set({ hasEnteredApp }),
  setShareToast: (shareToast) => set({ shareToast }),
  setTvRegion: (tvRegion) => set({ tvRegion }),
  setTdtCategory: (tdtCategory) => set({ tdtCategory }),
  setAdrarCountryFilter: (adrarCountryFilter) => set({ adrarCountryFilter }),
  setFutbolLeagueFilter: (futbolLeagueFilter) => set({ futbolLeagueFilter }),
  setFootballLiveBrand: (footballLiveBrand) => set({ footballLiveBrand }),
  setFutbolSearchQuery: (futbolSearchQuery) => set({ futbolSearchQuery }),
  setFutbolDayOffset: (futbolDayOffset) => set({ futbolDayOffset }),
  setFutbolStatusTab: (futbolStatusTab) => set({ futbolStatusTab }),
  setRequestedMovieModal: (requestedMovieModal) => set({ requestedMovieModal }),
  setRequestedSeriesModal: (requestedSeriesModal) => set({ requestedSeriesModal }),
  setRequestedMatchSlug: (requestedMatchSlug) => set({ requestedMatchSlug }),

  setActiveNavSection: (activeNavSection) => set({ activeNavSection }),
  setActiveWorld: (activeWorld) => {
    if (PRIMARY_WORLDS.includes(activeWorld as PrimaryWorldId)) {
      const primary = activeWorld as PrimaryWorldId;
      set({ activeWorld, lastUsedWorld: primary, isFloatingRoomOpen: false });
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(LAST_WORLD_KEY, primary);
        } catch {
          // ignore
        }
      }
      return;
    }
    set({ activeWorld, isFloatingRoomOpen: false });
  },
  setCineTab: (cineTab) => set({ cineTab }),
  setCineCastellano: (cineCastellano) => set({ cineCastellano }),
  setFutbolTab: (futbolTab) => set({ futbolTab }),
  setIsFloatingRoomOpen: (isFloatingRoomOpen) => set({ isFloatingRoomOpen }),
  pushBubbleSuppression: () =>
    set((s) => ({ floatingBubbleSuppressCount: s.floatingBubbleSuppressCount + 1 })),
  popBubbleSuppression: () =>
    set((s) => ({
      floatingBubbleSuppressCount: Math.max(0, s.floatingBubbleSuppressCount - 1),
    })),
  setShowDesignSystem: (showDesignSystem) => set({ showDesignSystem }),
  setShowLegalModal: (showLegalModal) => set({ showLegalModal }),
  setShowNotificationCenter: (showNotificationCenter) => set({ showNotificationCenter }),
  setShowCommandSearch: (showCommandSearch) => set({ showCommandSearch }),
  setShowSurpriseModal: (showSurpriseModal) => set({ showSurpriseModal }),
  setAuthNotice: (authNotice) => set({ authNotice }),

  setTypingUser: (userId, userName, isTyping, roomId = '') => {
    const prevTimer = typingExpiryTimers.get(userId);
    if (prevTimer) {
      clearTimeout(prevTimer);
      typingExpiryTimers.delete(userId);
    }

    if (isTyping) {
      const expiryTimer = setTimeout(() => {
        typingExpiryTimers.delete(userId);
        set((state) => ({
          typingUsers: state.typingUsers.filter((u) => u.userId !== userId),
        }));
      }, TYPING_EXPIRY_MS);
      typingExpiryTimers.set(userId, expiryTimer);
    }

    set((state) => {
      const filtered = state.typingUsers.filter((u) => u.userId !== userId);
      return {
        typingUsers: isTyping
          ? [...filtered, { roomId, userId, userName, isTyping: true }].slice(-4)
          : filtered,
      };
    });
  },

  updateSubtitleStyle: (patch) => {
    const next = { ...get().subtitleStyle, ...patch };
    set({ subtitleStyle: next });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SUBTITLE_STYLE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  },
  setSubtitleStyle: (patch) => {
    get().updateSubtitleStyle(patch);
  },

  setSyncOffsetMs: (offsetMs) => {
    set({ syncOffsetMs: Math.max(-1000, Math.min(1000, offsetMs)) });
  },

  setMiniPlayerDismissed: (miniPlayerDismissed) => set({ miniPlayerDismissed }),

  addScheduledRoom: (item) => {
    const entry: ScheduledRoomItem = {
      ...item,
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    };
    const next = [entry, ...get().scheduledRooms].slice(0, 12);
    set({ scheduledRooms: next });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SCHEDULED_ROOMS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  },

  removeScheduledRoom: (id) => {
    const next = get().scheduledRooms.filter((s) => s.id !== id);
    set({ scheduledRooms: next });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SCHEDULED_ROOMS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  },

  setSwUpdate: (swUpdate) => set({ swUpdate }),
  setDeferredAppUpdateVersion: (deferredAppUpdateVersion) => set({ deferredAppUpdateVersion }),

  applySwUpdateNow: () => {
    const worker = get().swUpdate?.waitingWorker;
    if (worker) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
    set({ swUpdate: null, deferredAppUpdateVersion: null });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => window.location.reload(), 250);
    }
  },
}));
