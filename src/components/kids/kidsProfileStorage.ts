import type { CatalogMovie, KidsAgeGroup, KidsLanguageCode } from '../../types';
import type { KidsMascotId } from './kidsData';

export interface KidsSavedStory {
  id: string;
  title: string;
  lang: KidsLanguageCode;
  chapters: string[];
  featuredWords: string[];
  createdAt: string;
}

export interface KidsPetCareState {
  energy: number;
  happiness: number;
  xp: number;
  level: number;
}

export interface KidsLearningAnalytics {
  date: string;
  learnMinutesToday: number;
  cinemaMinutesToday: number;
  domainCorrect: {
    lang: number;
    math: number;
    music: number;
    logic: number;
  };
  domainTotal: {
    lang: number;
    math: number;
    music: number;
    logic: number;
  };
  practicedWords: string[];
}

export interface KidsDailyMissions {
  date: string;
  watch: number;
  play: number;
  learn: number;
  chestClaimed: boolean;
}

export interface KidsParentPrefs {
  lockedLang: KidsLanguageCode | null;
  lockedAge: KidsAgeGroup | null;
  timerMinutes: number | null;
  timerStartedAt: number | null;
  approvedOnlyMode?: boolean;
  approvedItems?: CatalogMovie[];
  earnCinemaByLearning?: boolean;
  earnedCinemaMinutes?: number;
}

export interface KidsProgressState {
  id?: string;
  name?: string;
  avatarEmoji?: string;
  stars: number;
  streakDays: number;
  completedLessons: number;
  badges: string[];
  ageGroup: KidsAgeGroup;
  preferredLang: KidsLanguageCode;
  mascotId: KidsMascotId;
  unlockedRewards: string[];
  unlockedStickers?: string[];
  roomDecor?: string[];
  completedNodes?: Record<string, boolean>;
  placementDone?: boolean;
  petCare?: KidsPetCareState;
  savedStories?: KidsSavedStory[];
  analytics?: KidsLearningAnalytics;
  recentWatched?: CatalogMovie[];
  dailyMissions?: KidsDailyMissions;
  parentPrefs: KidsParentPrefs;
}

export interface KidsProfilesStore {
  activeProfileId: string;
  profiles: KidsProgressState[];
}

const KIDS_PROGRESS_STORAGE_KEY = 'riffan_kids_progress_v1';
const KIDS_PROFILES_STORAGE_KEY = 'riffan_kids_profiles_v2';
const KIDS_PARENT_PIN_STORAGE_KEY = 'riffan_kids_parent_pin_v1';

export const KIDS_EXIT_PIN = '1122';

export function loadKidsParentPin(): string {
  if (typeof localStorage === 'undefined') return KIDS_EXIT_PIN;
  try {
    const raw = (localStorage.getItem(KIDS_PARENT_PIN_STORAGE_KEY) || '').trim();
    if (/^\d{4}$/.test(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return KIDS_EXIT_PIN;
}

export function saveKidsParentPin(pin: string): boolean {
  const clean = pin.trim();
  if (!/^\d{4}$/.test(clean)) return false;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(KIDS_PARENT_PIN_STORAGE_KEY, clean);
    } catch {
      return false;
    }
  }
  return true;
}

export function resetKidsParentPin(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(KIDS_PARENT_PIN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function isValidKidsExitPin(pin: string): boolean {
  return pin.trim() === loadKidsParentPin();
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createFreshDailyMissions(date = getTodayIsoDate()): KidsDailyMissions {
  return {
    date,
    watch: 0,
    play: 0,
    learn: 0,
    chestClaimed: false,
  };
}

export function createFreshPetCare(): KidsPetCareState {
  return {
    energy: 80,
    happiness: 85,
    xp: 0,
    level: 1,
  };
}

export function createFreshAnalytics(date = getTodayIsoDate()): KidsLearningAnalytics {
  return {
    date,
    learnMinutesToday: 0,
    cinemaMinutesToday: 0,
    domainCorrect: { lang: 0, math: 0, music: 0, logic: 0 },
    domainTotal: { lang: 0, math: 0, music: 0, logic: 0 },
    practicedWords: [],
  };
}

export function createDefaultKidsProfile(
  overrides: Partial<KidsProgressState> = {}
): KidsProgressState {
  return {
    id: overrides.id || 'kid-1',
    name: overrides.name || 'Peque 1',
    avatarEmoji: overrides.avatarEmoji || 'fennec',
    stars: 12,
    streakDays: 1,
    completedLessons: 0,
    badges: ['explorador'],
    ageGroup: '6-8',
    preferredLang: 'es',
    mascotId: 'fox',
    unlockedRewards: [],
    unlockedStickers: ['stk-lion'],
    roomDecor: ['room-bookshelf'],
    completedNodes: {},
    placementDone: false,
    petCare: createFreshPetCare(),
    savedStories: [],
    analytics: createFreshAnalytics(),
    recentWatched: [],
    dailyMissions: createFreshDailyMissions(),
    parentPrefs: {
      lockedLang: null,
      lockedAge: null,
      timerMinutes: null,
      timerStartedAt: null,
      approvedOnlyMode: false,
      approvedItems: [],
      earnCinemaByLearning: false,
      earnedCinemaMinutes: 15,
    },
    ...overrides,
  };
}

function normalizeKidsState(raw: Partial<KidsProgressState>): KidsProgressState {
  const defaults = createDefaultKidsProfile();
  const today = getTodayIsoDate();
  const rawMissions = raw.dailyMissions;
  const dailyMissions: KidsDailyMissions =
    rawMissions && rawMissions.date === today
      ? {
          date: today,
          watch: Number(rawMissions.watch || 0),
          play: Number(rawMissions.play || 0),
          learn: Number(rawMissions.learn || 0),
          chestClaimed: Boolean(rawMissions.chestClaimed),
        }
      : createFreshDailyMissions(today);

  const rawAnalytics = raw.analytics;
  const analytics: KidsLearningAnalytics =
    rawAnalytics && rawAnalytics.date === today
      ? {
          date: today,
          learnMinutesToday: Number(rawAnalytics.learnMinutesToday || 0),
          cinemaMinutesToday: Number(rawAnalytics.cinemaMinutesToday || 0),
          domainCorrect: {
            lang: Number(rawAnalytics.domainCorrect?.lang || 0),
            math: Number(rawAnalytics.domainCorrect?.math || 0),
            music: Number(rawAnalytics.domainCorrect?.music || 0),
            logic: Number(rawAnalytics.domainCorrect?.logic || 0),
          },
          domainTotal: {
            lang: Number(rawAnalytics.domainTotal?.lang || 0),
            math: Number(rawAnalytics.domainTotal?.math || 0),
            music: Number(rawAnalytics.domainTotal?.music || 0),
            logic: Number(rawAnalytics.domainTotal?.logic || 0),
          },
          practicedWords: Array.isArray(rawAnalytics.practicedWords)
            ? rawAnalytics.practicedWords.slice(0, 30)
            : [],
        }
      : createFreshAnalytics(today);

  const parentPrefs: KidsParentPrefs = {
    lockedLang: raw.parentPrefs?.lockedLang ?? null,
    lockedAge: raw.parentPrefs?.lockedAge ?? null,
    timerMinutes:
      typeof raw.parentPrefs?.timerMinutes === 'number'
        ? raw.parentPrefs.timerMinutes
        : null,
    timerStartedAt:
      typeof raw.parentPrefs?.timerStartedAt === 'number'
        ? raw.parentPrefs.timerStartedAt
        : null,
    approvedOnlyMode: Boolean(raw.parentPrefs?.approvedOnlyMode),
    approvedItems: Array.isArray(raw.parentPrefs?.approvedItems)
      ? raw.parentPrefs!.approvedItems
      : defaults.parentPrefs.approvedItems,
    earnCinemaByLearning: Boolean(raw.parentPrefs?.earnCinemaByLearning),
    earnedCinemaMinutes:
      typeof raw.parentPrefs?.earnedCinemaMinutes === 'number'
        ? Math.max(0, raw.parentPrefs.earnedCinemaMinutes)
        : 15,
  };

  return {
    ...defaults,
    ...raw,
    id: raw.id || defaults.id,
    name: raw.name || defaults.name,
    avatarEmoji: raw.avatarEmoji || defaults.avatarEmoji,
    stars: Number.isFinite(raw.stars) ? Number(raw.stars) : defaults.stars,
    badges: Array.isArray(raw.badges) ? raw.badges : defaults.badges,
    mascotId: raw.mascotId || defaults.mascotId,
    unlockedRewards: Array.isArray(raw.unlockedRewards) ? raw.unlockedRewards : [],
    unlockedStickers: Array.isArray(raw.unlockedStickers)
      ? raw.unlockedStickers
      : defaults.unlockedStickers,
    roomDecor: Array.isArray(raw.roomDecor) ? raw.roomDecor : defaults.roomDecor,
    completedNodes:
      raw.completedNodes && typeof raw.completedNodes === 'object'
        ? raw.completedNodes
        : {},
    placementDone: Boolean(raw.placementDone),
    petCare: raw.petCare
      ? {
          energy: Math.max(0, Math.min(100, Number(raw.petCare.energy ?? 80))),
          happiness: Math.max(0, Math.min(100, Number(raw.petCare.happiness ?? 85))),
          xp: Math.max(0, Number(raw.petCare.xp ?? 0)),
          level: Math.max(1, Number(raw.petCare.level ?? 1)),
        }
      : createFreshPetCare(),
    savedStories: Array.isArray(raw.savedStories) ? raw.savedStories.slice(0, 16) : [],
    analytics,
    recentWatched: Array.isArray(raw.recentWatched) ? raw.recentWatched.slice(0, 8) : [],
    dailyMissions,
    preferredLang: parentPrefs.lockedLang || raw.preferredLang || defaults.preferredLang,
    ageGroup: parentPrefs.lockedAge || raw.ageGroup || defaults.ageGroup,
    parentPrefs,
  };
}

export function loadKidsProfilesStore(): KidsProfilesStore {
  const fallbackProfile = createDefaultKidsProfile();
  const fallbackStore: KidsProfilesStore = {
    activeProfileId: fallbackProfile.id!,
    profiles: [fallbackProfile],
  };

  if (typeof localStorage === 'undefined') return fallbackStore;

  try {
    const rawStore = localStorage.getItem(KIDS_PROFILES_STORAGE_KEY);
    if (rawStore) {
      const parsed = JSON.parse(rawStore) as Partial<KidsProfilesStore>;
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        const normalized = parsed.profiles.map((p, idx) =>
          normalizeKidsState({ ...p, id: p.id || `kid-${idx + 1}` })
        );
        const activeId = normalized.some((p) => p.id === parsed.activeProfileId)
          ? parsed.activeProfileId!
          : normalized[0].id!;
        return { activeProfileId: activeId, profiles: normalized };
      }
    }

    const legacyRaw = localStorage.getItem(KIDS_PROGRESS_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = normalizeKidsState(JSON.parse(legacyRaw) as Partial<KidsProgressState>);
      const store: KidsProfilesStore = {
        activeProfileId: migrated.id!,
        profiles: [migrated],
      };
      saveKidsProfilesStore(store);
      return store;
    }
  } catch {
    return fallbackStore;
  }

  return fallbackStore;
}

export function saveKidsProfilesStore(store: KidsProfilesStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KIDS_PROFILES_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

export function createKidsProfile(
  store: KidsProfilesStore,
  name: string,
  avatarId: string,
  ageGroup: KidsAgeGroup
): { store: KidsProfilesStore; profile: KidsProgressState } {
  const cleanName = name.trim().slice(0, 18) || `Peque ${store.profiles.length + 1}`;
  const currentActive =
    store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0];
  const profile = createDefaultKidsProfile({
    id: `kid-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    name: cleanName,
    avatarEmoji: avatarId || 'lion',
    ageGroup,
    parentPrefs: currentActive?.parentPrefs
      ? { ...currentActive.parentPrefs }
      : createDefaultKidsProfile().parentPrefs,
  });
  const nextStore: KidsProfilesStore = {
    activeProfileId: profile.id!,
    profiles: [...store.profiles, profile],
  };
  saveKidsProfilesStore(nextStore);
  saveKidsProgress(profile);
  return { store: nextStore, profile };
}

export function switchKidsProfile(
  store: KidsProfilesStore,
  profileId: string
): { store: KidsProfilesStore; profile: KidsProgressState } {
  const found = store.profiles.find((p) => p.id === profileId) || store.profiles[0];
  const normalized = normalizeKidsState(found);
  const nextStore: KidsProfilesStore = {
    activeProfileId: normalized.id!,
    profiles: store.profiles.map((p) => (p.id === normalized.id ? normalized : p)),
  };
  saveKidsProfilesStore(nextStore);
  saveKidsProgress(normalized);
  return { store: nextStore, profile: normalized };
}

export function deleteKidsProfile(
  store: KidsProfilesStore,
  profileId: string
): { store: KidsProfilesStore; profile: KidsProgressState } {
  if (store.profiles.length <= 1) {
    return { store, profile: normalizeKidsState(store.profiles[0]) };
  }
  const remaining = store.profiles.filter((p) => p.id !== profileId);
  const nextActive =
    remaining.find((p) => p.id === store.activeProfileId) || remaining[0];
  const nextStore: KidsProfilesStore = {
    activeProfileId: nextActive.id!,
    profiles: remaining,
  };
  saveKidsProfilesStore(nextStore);
  saveKidsProgress(nextActive);
  return { store: nextStore, profile: normalizeKidsState(nextActive) };
}

export function loadKidsProgress(): KidsProgressState {
  if (typeof localStorage === 'undefined') return createDefaultKidsProfile();
  try {
    const storeRaw = localStorage.getItem(KIDS_PROFILES_STORAGE_KEY);
    if (storeRaw) {
      const store = loadKidsProfilesStore();
      const active =
        store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0];
      return normalizeKidsState(active);
    }
    const raw = localStorage.getItem(KIDS_PROGRESS_STORAGE_KEY);
    if (!raw) return createDefaultKidsProfile();
    return normalizeKidsState(JSON.parse(raw) as Partial<KidsProgressState>);
  } catch {
    return createDefaultKidsProfile();
  }
}

export function saveKidsProgress(state: KidsProgressState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const normalized = normalizeKidsState(state);
    localStorage.setItem(KIDS_PROGRESS_STORAGE_KEY, JSON.stringify(normalized));

    const storeRaw = localStorage.getItem(KIDS_PROFILES_STORAGE_KEY);
    if (storeRaw) {
      const parsed = JSON.parse(storeRaw) as KidsProfilesStore;
      if (Array.isArray(parsed?.profiles) && parsed.profiles.length > 0) {
        const exists = parsed.profiles.some((p) => p.id === normalized.id);
        const updatedProfiles = exists
          ? parsed.profiles.map((p) => (p.id === normalized.id ? normalized : p))
          : [...parsed.profiles, normalized];
        localStorage.setItem(
          KIDS_PROFILES_STORAGE_KEY,
          JSON.stringify({
            activeProfileId: normalized.id || parsed.activeProfileId,
            profiles: updatedProfiles,
          })
        );
      }
    }
  } catch {
    // ignore storage quota errors
  }
}
