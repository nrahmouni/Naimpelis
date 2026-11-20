import { create } from 'zustand';
import type { TypingUserPayload } from '../shared/protocol';
import type {
  CatalaSeriesDetails,
  CatalogMovie,
  ScheduledRoomItem,
  SpanishTdtChannel,
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
  | 'sala';
export type WorldId = 'entry' | PrimaryWorldId | 'youtube';
export type CineSubTab = 'movies' | 'series';
export type FutbolSubTab = 'matches' | 'channels';
export type HomeSearchCategoryFilter = 'all' | 'movies' | 'series' | 'sports' | 'tv' | 'games';

export interface RequestedSeriesModalPayload {
  series: CatalogMovie | TvSeriesDetails;
  season?: number;
  episode?: number;
  lang?: string;
  forceSpanish?: boolean;
  fromPreviewItem?: CatalogMovie | null;
  initialScrollTop?: number;
}

export interface RequestedCatalaModalPayload {
  series: CatalaSeriesDetails;
  season: number;
}

export interface PlaybackReturnSeriesSnapshot {
  series: TvSeriesDetails;
  season: number;
  episode?: number | null;
  lang?: string;
  forceSpanish?: boolean;
  fromPreviewItem?: CatalogMovie | null;
  pageScrollTop?: number;
}

export interface PlaybackReturnContext {
  world: WorldId;
  cineTab?: CineSubTab;
  cineSpecialPortal?: 'none' | 'catala';
  futbolTab?: FutbolSubTab;
  searchQuery?: string;
  homeSearchQuery?: string;
  homeSearchCategory?: HomeSearchCategoryFilter;
  scrollTopMain?: number;
  scrollTopCatalog?: number;
  movieModal?: CatalogMovie | null;
  seriesModal?: PlaybackReturnSeriesSnapshot | null;
  catalaModal?: RequestedCatalaModalPayload | null;
  epgChannel?: SpanishTdtChannel | null;
}

const PRIMARY_WORLDS: PrimaryWorldId[] = [
  'cine',
  'futbol',
  'tv',
  'juegos',
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
  requestedCatalaModal: RequestedCatalaModalPayload | null;
  requestedEpgChannel: SpanishTdtChannel | null;
  requestedMatchSlug: string | null;
  playbackReturnContext: PlaybackReturnContext | null;
  pendingScrollRestore: { mainTop: number; catalogTop: number } | null;
  homeSearchQuery: string;
  homeSearchCategory: HomeSearchCategoryFilter;
  activeNavSection: ShellNavSection;
  activeWorld: WorldId;
  lastUsedWorld: PrimaryWorldId | null;
  cineTab: CineSubTab;
  cineCastellano: boolean;
  cineSpecialPortal: 'none' | 'catala';
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
  setRequestedCatalaModal: (payload: RequestedCatalaModalPayload | null) => void;
  setRequestedEpgChannel: (channel: SpanishTdtChannel | null) => void;
  setRequestedMatchSlug: (slug: string | null) => void;
  setPlaybackReturnContext: (ctx: PlaybackReturnContext | null) => void;
  setPendingScrollRestore: (pos: { mainTop: number; catalogTop: number } | null) => void;
  setHomeSearchQuery: (q: string) => void;
  setHomeSearchCategory: (category: HomeSearchCategoryFilter) => void;
  setActiveNavSection: (section: ShellNavSection) => void;
  setActiveWorld: (world: WorldId) => void;
  setCineTab: (tab: CineSubTab) => void;
  setCineCastellano: (enabled: boolean) => void;
  setCineSpecialPortal: (portal: 'none' | 'catala') => void;
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
  requestedCatalaModal: null,
  requestedEpgChannel: null,
  requestedMatchSlug: null,
  playbackReturnContext: null,
  pendingScrollRestore: null,
  homeSearchQuery: '',
  homeSearchCategory: 'all',
  activeNavSection: 'home',
  activeWorld: 'entry',
  lastUsedWorld: loadLastUsedWorld(),
  cineTab: 'movies',
  cineCastellano: true,
  cineSpecialPortal: 'none',
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
    if (get().sessionMode === sessionMode) return;
    set({ sessionMode });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SESSION_MODE_KEY, sessionMode);
      } catch {
        // ignore
      }
    }
  },
  setHasEnteredApp: (hasEnteredApp) => {
    if (get().hasEnteredApp === hasEnteredApp) return;
    set({ hasEnteredApp });
  },
  setShareToast: (shareToast) => {
    if (get().shareToast === shareToast) return;
    set({ shareToast });
  },
  setTvRegion: (tvRegion) => {
    if (get().tvRegion === tvRegion) return;
    set({ tvRegion });
  },
  setTdtCategory: (tdtCategory) => {
    if (get().tdtCategory === tdtCategory) return;
    set({ tdtCategory });
  },
  setAdrarCountryFilter: (adrarCountryFilter) => {
    if (get().adrarCountryFilter === adrarCountryFilter) return;
    set({ adrarCountryFilter });
  },
  setFutbolLeagueFilter: (futbolLeagueFilter) => {
    if (get().futbolLeagueFilter === futbolLeagueFilter) return;
    set({ futbolLeagueFilter });
  },
  setFootballLiveBrand: (footballLiveBrand) => {
    if (get().footballLiveBrand === footballLiveBrand) return;
    set({ footballLiveBrand });
  },
  setFutbolSearchQuery: (futbolSearchQuery) => {
    if (get().futbolSearchQuery === futbolSearchQuery) return;
    set({ futbolSearchQuery });
  },
  setFutbolDayOffset: (futbolDayOffset) => {
    if (get().futbolDayOffset === futbolDayOffset) return;
    set({ futbolDayOffset });
  },
  setFutbolStatusTab: (futbolStatusTab) => {
    if (get().futbolStatusTab === futbolStatusTab) return;
    set({ futbolStatusTab });
  },
  setRequestedMovieModal: (requestedMovieModal) => {
    if (get().requestedMovieModal === requestedMovieModal) return;
    set({ requestedMovieModal });
  },
  setRequestedSeriesModal: (requestedSeriesModal) => {
    if (get().requestedSeriesModal === requestedSeriesModal) return;
    set({ requestedSeriesModal });
  },
  setRequestedCatalaModal: (requestedCatalaModal) => {
    if (get().requestedCatalaModal === requestedCatalaModal) return;
    set({ requestedCatalaModal });
  },
  setRequestedEpgChannel: (requestedEpgChannel) => {
    if (get().requestedEpgChannel === requestedEpgChannel) return;
    set({ requestedEpgChannel });
  },
  setRequestedMatchSlug: (requestedMatchSlug) => {
    if (get().requestedMatchSlug === requestedMatchSlug) return;
    set({ requestedMatchSlug });
  },
  setPlaybackReturnContext: (playbackReturnContext) => {
    if (get().playbackReturnContext === playbackReturnContext) return;
    set({ playbackReturnContext });
  },
  setPendingScrollRestore: (pendingScrollRestore) => {
    const prev = get().pendingScrollRestore;
    if (
      prev === pendingScrollRestore ||
      (prev &&
        pendingScrollRestore &&
        prev.mainTop === pendingScrollRestore.mainTop &&
        prev.catalogTop === pendingScrollRestore.catalogTop)
    ) {
      return;
    }
    set({ pendingScrollRestore });
  },
  setHomeSearchQuery: (homeSearchQuery) => {
    if (get().homeSearchQuery === homeSearchQuery) return;
    set({ homeSearchQuery });
  },
  setHomeSearchCategory: (homeSearchCategory) => {
    if (get().homeSearchCategory === homeSearchCategory) return;
    set({ homeSearchCategory });
  },

  setActiveNavSection: (activeNavSection) => {
    if (get().activeNavSection === activeNavSection) return;
    set({ activeNavSection });
  },
  setActiveWorld: (activeWorld) => {
    const cur = get();
    if (PRIMARY_WORLDS.includes(activeWorld as PrimaryWorldId)) {
      const primary = activeWorld as PrimaryWorldId;
      if (
        cur.activeWorld === activeWorld &&
        cur.lastUsedWorld === primary &&
        cur.isFloatingRoomOpen === false
      ) {
        return;
      }
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
    if (cur.activeWorld === activeWorld && cur.isFloatingRoomOpen === false) return;
    set({ activeWorld, isFloatingRoomOpen: false });
  },
  setCineTab: (cineTab) => {
    if (get().cineTab === cineTab) return;
    set({ cineTab });
  },
  setCineCastellano: (cineCastellano) => {
    if (get().cineCastellano === cineCastellano) return;
    set({ cineCastellano });
  },
  setCineSpecialPortal: (cineSpecialPortal) => {
    if (get().cineSpecialPortal === cineSpecialPortal) return;
    set({ cineSpecialPortal });
  },
  setFutbolTab: (futbolTab) => {
    if (get().futbolTab === futbolTab) return;
    set({ futbolTab });
  },
  setIsFloatingRoomOpen: (isFloatingRoomOpen) => {
    if (get().isFloatingRoomOpen === isFloatingRoomOpen) return;
    set({ isFloatingRoomOpen });
  },
  pushBubbleSuppression: () =>
    set((s) => ({ floatingBubbleSuppressCount: s.floatingBubbleSuppressCount + 1 })),
  popBubbleSuppression: () =>
    set((s) => {
      const next = Math.max(0, s.floatingBubbleSuppressCount - 1);
      return next === s.floatingBubbleSuppressCount
        ? s
        : { floatingBubbleSuppressCount: next };
    }),
  setShowDesignSystem: (showDesignSystem) => {
    if (get().showDesignSystem === showDesignSystem) return;
    set({ showDesignSystem });
  },
  setShowLegalModal: (showLegalModal) => {
    if (get().showLegalModal === showLegalModal) return;
    set({ showLegalModal });
  },
  setShowNotificationCenter: (showNotificationCenter) => {
    if (get().showNotificationCenter === showNotificationCenter) return;
    set({ showNotificationCenter });
  },
  setShowCommandSearch: (showCommandSearch) => {
    if (get().showCommandSearch === showCommandSearch) return;
    set({ showCommandSearch });
  },
  setShowSurpriseModal: (showSurpriseModal) => {
    if (get().showSurpriseModal === showSurpriseModal) return;
    set({ showSurpriseModal });
  },
  setAuthNotice: (authNotice) => {
    if (get().authNotice === authNotice) return;
    set({ authNotice });
  },

  setTypingUser: (userId, userName, isTyping, roomId = '') => {
    const prevTimer = typingExpiryTimers.get(userId);
    if (prevTimer) {
      clearTimeout(prevTimer);
      typingExpiryTimers.delete(userId);
    }

    if (isTyping) {
      const expiryTimer = setTimeout(() => {
        typingExpiryTimers.delete(userId);
        set((state) => {
          const next = state.typingUsers.filter((u) => u.userId !== userId);
          return next.length === state.typingUsers.length ? state : { typingUsers: next };
        });
      }, TYPING_EXPIRY_MS);
      typingExpiryTimers.set(userId, expiryTimer);
    }

    set((state) => {
      const alreadyPresent = state.typingUsers.some(
        (u) => u.userId === userId && u.userName === userName && u.roomId === roomId
      );
      if (isTyping && alreadyPresent) return state;
      const filtered = state.typingUsers.filter((u) => u.userId !== userId);
      if (!isTyping && filtered.length === state.typingUsers.length) return state;
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
    const clamped = Math.max(-1000, Math.min(1000, offsetMs));
    if (get().syncOffsetMs === clamped) return;
    set({ syncOffsetMs: clamped });
  },

  setMiniPlayerDismissed: (miniPlayerDismissed) => {
    if (get().miniPlayerDismissed === miniPlayerDismissed) return;
    set({ miniPlayerDismissed });
  },

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
    const prev = get().scheduledRooms;
    const next = prev.filter((s) => s.id !== id);
    if (next.length === prev.length) return;
    set({ scheduledRooms: next });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(SCHEDULED_ROOMS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  },

  setSwUpdate: (swUpdate) => {
    if (get().swUpdate === swUpdate) return;
    set({ swUpdate });
  },
  setDeferredAppUpdateVersion: (deferredAppUpdateVersion) => {
    if (get().deferredAppUpdateVersion === deferredAppUpdateVersion) return;
    set({ deferredAppUpdateVersion });
  },

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
