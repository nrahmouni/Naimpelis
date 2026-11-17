import { create } from 'zustand';
import type { CatalogMovie, KidsAgeGroup, KidsLanguageCode } from '../types';
import {
  awardKidsStars,
  claimDailyMissionChest,
  createDefaultKidsProfile,
  createKidsProfile,
  deleteKidsProfile,
  getTodayIsoDate,
  loadKidsProfilesStore,
  recordKidsWatched,
  saveKidsProfilesStore,
  saveKidsProgress,
  selectKidsMascot,
  switchKidsProfile,
  trackKidsMission,
  unlockKidsReward,
  type KidsMascotMeta,
  type KidsProfilesStore,
  type KidsProgressState,
} from '../components/kids/kidsData';

export interface KidsAgeAdaptation {
  ageGroup: KidsAgeGroup;
  minTouchTargetPx: number;
  baseFontSizePx: number;
  autoVoicePrompt: boolean;
  iconFirstMode: boolean;
  mathMaxOperand: number;
  recommendedSessionMinutes: number;
}

/**
 * Segmentación real por edad: adapta tamaño táctil (siempre >= 64px),
 * escala tipográfica (>= 18px), lectura automática y rango pedagógico.
 */
export function getKidsAgeAdaptation(ageGroup: KidsAgeGroup): KidsAgeAdaptation {
  switch (ageGroup) {
    case '3-5':
      return {
        ageGroup: '3-5',
        minTouchTargetPx: 72,
        baseFontSizePx: 20,
        autoVoicePrompt: true,
        iconFirstMode: true,
        mathMaxOperand: 5,
        recommendedSessionMinutes: 20,
      };
    case '6-8':
      return {
        ageGroup: '6-8',
        minTouchTargetPx: 64,
        baseFontSizePx: 18,
        autoVoicePrompt: true,
        iconFirstMode: false,
        mathMaxOperand: 12,
        recommendedSessionMinutes: 35,
      };
    case '9-12':
      return {
        ageGroup: '9-12',
        minTouchTargetPx: 64,
        baseFontSizePx: 18,
        autoVoicePrompt: false,
        iconFirstMode: false,
        mathMaxOperand: 20,
        recommendedSessionMinutes: 45,
      };
  }
}

export interface KidsCloudMirrorMeta {
  lastSyncedAt: number | null;
  familyUid: string | null;
}

export interface KidsUxSettings {
  soundEnabled: boolean;
  lowStimulation: boolean;
  bedtimeMode: boolean;
  activeMinutesDate: string;
  activeMinutesToday: number;
}

const KIDS_UX_STORAGE_KEY = 'riffan_kids_ux_settings_v1';

function loadKidsUxSettings(): KidsUxSettings {
  const today = getTodayIsoDate();
  const fallback: KidsUxSettings = {
    soundEnabled: true,
    lowStimulation: false,
    bedtimeMode: false,
    activeMinutesDate: today,
    activeMinutesToday: 0,
  };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(KIDS_UX_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<KidsUxSettings>;
    const sameDay = parsed.activeMinutesDate === today;
    return {
      soundEnabled: parsed.soundEnabled !== false,
      lowStimulation: Boolean(parsed.lowStimulation),
      bedtimeMode: Boolean(parsed.bedtimeMode),
      activeMinutesDate: today,
      activeMinutesToday: sameDay ? Math.max(0, Number(parsed.activeMinutesToday || 0)) : 0,
    };
  } catch {
    return fallback;
  }
}

function persistKidsUxSettings(settings: KidsUxSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KIDS_UX_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

function writeCloudFamilySnapshotMirror(familyUid: string | null, store: KidsProfilesStore): void {
  if (!familyUid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `riffan_kids_cloud_mirror_${familyUid}`,
      JSON.stringify({ updatedAt: Date.now(), store })
    );
  } catch {
    // ignore
  }
}

export interface KidsStoreState {
  profilesStore: KidsProfilesStore;
  ux: KidsUxSettings;
  cloudMeta: KidsCloudMirrorMeta;
  getActiveProfile: () => KidsProgressState;
  getAgeAdaptation: () => KidsAgeAdaptation;
  bindFamilyAccount: (familyUid: string | null) => void;
  updateActiveProfile: (updater: (prev: KidsProgressState) => KidsProgressState) => void;
  createProfile: (name: string, avatarEmoji: string, ageGroup: KidsAgeGroup) => void;
  switchProfile: (profileId: string) => void;
  deleteProfile: (profileId: string) => void;
  selectLanguage: (lang: KidsLanguageCode) => void;
  awardStars: (delta: number, badgeId?: string) => void;
  recordWatched: (movie: CatalogMovie) => void;
  trackMission: (kind: 'watch' | 'play' | 'learn') => void;
  claimDailyChest: () => boolean;
  pickMascot: (mascot: KidsMascotMeta) => boolean;
  unlockReward: (rewardId: string, costStars: number) => boolean;
  updateParentPrefs: (patch: Partial<KidsProgressState['parentPrefs']>) => void;
  toggleSound: () => void;
  toggleLowStimulation: () => void;
  setBedtimeMode: (enabled: boolean) => void;
  tickActiveMinute: () => void;
}

function getActiveFromStore(store: KidsProfilesStore): KidsProgressState {
  return (
    store.profiles.find((p) => p.id === store.activeProfileId) ||
    store.profiles[0] ||
    createDefaultKidsProfile()
  );
}

export const useKidsStore = create<KidsStoreState>((set, get) => ({
  profilesStore: loadKidsProfilesStore(),
  ux: loadKidsUxSettings(),
  cloudMeta: { lastSyncedAt: null, familyUid: null },

  getActiveProfile: () => getActiveFromStore(get().profilesStore),

  getAgeAdaptation: () => getKidsAgeAdaptation(getActiveFromStore(get().profilesStore).ageGroup),

  bindFamilyAccount: (familyUid) => {
    if (!familyUid) {
      set({ cloudMeta: { lastSyncedAt: null, familyUid: null } });
      return;
    }
    try {
      const mirrorRaw =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(`riffan_kids_cloud_mirror_${familyUid}`)
          : null;
      if (mirrorRaw) {
        const parsed = JSON.parse(mirrorRaw) as { updatedAt?: number; store?: KidsProfilesStore };
        if (parsed?.store?.profiles?.length) {
          saveKidsProfilesStore(parsed.store);
          set({
            profilesStore: parsed.store,
            cloudMeta: { familyUid, lastSyncedAt: parsed.updatedAt || Date.now() },
          });
          return;
        }
      }
      const current = get().profilesStore;
      writeCloudFamilySnapshotMirror(familyUid, current);
      set({ cloudMeta: { familyUid, lastSyncedAt: Date.now() } });
    } catch {
      set({ cloudMeta: { familyUid, lastSyncedAt: null } });
    }
  },

  updateActiveProfile: (updater) => {
    set((state) => {
      const current = getActiveFromStore(state.profilesStore);
      const nextProfile = updater(current);
      saveKidsProgress(nextProfile);
      const nextStore: KidsProfilesStore = {
        activeProfileId: nextProfile.id || state.profilesStore.activeProfileId,
        profiles: state.profilesStore.profiles.map((p) =>
          p.id === nextProfile.id ? nextProfile : p
        ),
      };
      saveKidsProfilesStore(nextStore);
      writeCloudFamilySnapshotMirror(state.cloudMeta.familyUid, nextStore);
      return {
        profilesStore: nextStore,
        cloudMeta: state.cloudMeta.familyUid
          ? { ...state.cloudMeta, lastSyncedAt: Date.now() }
          : state.cloudMeta,
      };
    });
  },

  createProfile: (name, avatarEmoji, ageGroup) => {
    set((state) => {
      const created = createKidsProfile(state.profilesStore, name, avatarEmoji, ageGroup);
      writeCloudFamilySnapshotMirror(state.cloudMeta.familyUid, created.store);
      return { profilesStore: created.store };
    });
  },

  switchProfile: (profileId) => {
    set((state) => {
      const switched = switchKidsProfile(state.profilesStore, profileId);
      writeCloudFamilySnapshotMirror(state.cloudMeta.familyUid, switched.store);
      return { profilesStore: switched.store };
    });
  },

  deleteProfile: (profileId) => {
    set((state) => {
      const updated = deleteKidsProfile(state.profilesStore, profileId);
      writeCloudFamilySnapshotMirror(state.cloudMeta.familyUid, updated.store);
      return { profilesStore: updated.store };
    });
  },

  selectLanguage: (lang) => {
    get().updateActiveProfile((prev) => {
      if (prev.parentPrefs?.lockedLang && prev.parentPrefs.lockedLang !== lang) return prev;
      return { ...prev, preferredLang: lang };
    });
  },

  awardStars: (delta, badgeId) => {
    get().updateActiveProfile((prev) => awardKidsStars(prev, delta, badgeId));
  },

  recordWatched: (movie) => {
    get().updateActiveProfile((prev) => recordKidsWatched(prev, movie));
  },

  trackMission: (kind) => {
    get().updateActiveProfile((prev) => trackKidsMission(prev, kind));
  },

  claimDailyChest: () => {
    let ok = false;
    get().updateActiveProfile((prev) => {
      const res = claimDailyMissionChest(prev);
      ok = res.ok;
      return res.state;
    });
    return ok;
  },

  pickMascot: (mascot) => {
    let ok = false;
    get().updateActiveProfile((prev) => {
      const res = selectKidsMascot(prev, mascot);
      ok = res.ok;
      return res.state;
    });
    return ok;
  },

  unlockReward: (rewardId, costStars) => {
    let ok = false;
    get().updateActiveProfile((prev) => {
      const res = unlockKidsReward(prev, rewardId, costStars);
      ok = res.ok;
      return res.state;
    });
    return ok;
  },

  updateParentPrefs: (patch) => {
    get().updateActiveProfile((prev) => {
      const nextPrefs = { ...prev.parentPrefs, ...patch };
      return {
        ...prev,
        preferredLang: nextPrefs.lockedLang || prev.preferredLang,
        ageGroup: nextPrefs.lockedAge || prev.ageGroup,
        parentPrefs: nextPrefs,
      };
    });
  },

  toggleSound: () => {
    set((state) => {
      const nextUx = { ...state.ux, soundEnabled: !state.ux.soundEnabled };
      persistKidsUxSettings(nextUx);
      return { ux: nextUx };
    });
  },

  toggleLowStimulation: () => {
    set((state) => {
      const nextUx = { ...state.ux, lowStimulation: !state.ux.lowStimulation };
      persistKidsUxSettings(nextUx);
      return { ux: nextUx };
    });
  },

  setBedtimeMode: (enabled) => {
    set((state) => {
      const nextUx = { ...state.ux, bedtimeMode: enabled };
      persistKidsUxSettings(nextUx);
      return { ux: nextUx };
    });
  },

  tickActiveMinute: () => {
    const today = getTodayIsoDate();
    set((state) => {
      const sameDay = state.ux.activeMinutesDate === today;
      const nextUx: KidsUxSettings = {
        ...state.ux,
        activeMinutesDate: today,
        activeMinutesToday: sameDay ? state.ux.activeMinutesToday + 1 : 1,
      };
      persistKidsUxSettings(nextUx);
      return { ux: nextUx };
    });
  },
}));
