import { create } from 'zustand';
import type { CatalogMovie, KidsAgeGroup, KidsLanguageCode } from '../types';
import {
  awardKidsStars,
  claimDailyMissionChest,
  createDefaultKidsProfile,
  createFreshAnalytics,
  createFreshPetCare,
  createKidsProfile,
  deleteKidsProfile,
  getTodayIsoDate,
  isValidKidsExitPin,
  loadKidsParentPin,
  loadKidsProfilesStore,
  recordKidsWatched,
  resetKidsParentPin,
  saveKidsParentPin,
  saveKidsProgress,
  selectKidsMascot,
  switchKidsProfile,
  trackKidsMission,
  unlockKidsReward,
  type KidsMascotMeta,
  type KidsProfilesStore,
  type KidsProgressState,
  type KidsSavedStory,
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

export interface KidsUxSettings {
  soundEnabled: boolean;
  lowStimulation: boolean;
  bedtimeMode: boolean;
  dyslexiaFont: boolean;
  syllableHighlight: boolean;
  tortoiseSpeech: boolean;
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
    dyslexiaFont: false,
    syllableHighlight: false,
    tortoiseSpeech: false,
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
      dyslexiaFont: Boolean(parsed.dyslexiaFont),
      syllableHighlight: Boolean(parsed.syllableHighlight),
      tortoiseSpeech: Boolean(parsed.tortoiseSpeech),
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

export interface KidsStoreState {
  profilesStore: KidsProfilesStore;
  ux: KidsUxSettings;
  parentPin: string;
  getActiveProfile: () => KidsProgressState;
  getAgeAdaptation: () => KidsAgeAdaptation;
  verifyParentPin: (pin: string) => boolean;
  changeParentPin: (
    currentPin: string,
    newPin: string
  ) => { ok: boolean; error?: 'wrong_current' | 'invalid_format' };
  resetDefaultPin: () => void;
  updateActiveProfile: (updater: (prev: KidsProgressState) => KidsProgressState) => void;
  createProfile: (name: string, avatarId: string, ageGroup: KidsAgeGroup) => void;
  switchProfile: (profileId: string) => void;
  deleteProfile: (profileId: string) => void;
  selectLanguage: (lang: KidsLanguageCode) => void;
  awardStars: (delta: number, badgeId?: string) => void;
  recordWatched: (movie: CatalogMovie) => void;
  trackMission: (kind: 'watch' | 'play' | 'learn') => void;
  claimDailyChest: () => boolean;
  pickMascot: (mascot: KidsMascotMeta) => boolean;
  unlockReward: (rewardId: string, costStars: number) => boolean;
  unlockSticker: (stickerId: string, costStars: number) => boolean;
  unlockRoomDecor: (decorId: string, costStars: number) => boolean;
  careForPet: (
    costStars: number,
    energyGain: number,
    happyGain: number,
    xpGain: number
  ) => boolean;
  completeCurriculumNode: (nodeId: string, bonusStars?: number) => void;
  recordDomainResult: (
    domain: 'lang' | 'math' | 'music' | 'logic',
    isCorrect: boolean,
    wordId?: string
  ) => void;
  saveKidsStory: (story: KidsSavedStory) => void;
  consumeCinemaMinute: () => void;
  updateParentPrefs: (patch: Partial<KidsProgressState['parentPrefs']>) => void;
  toggleSound: () => void;
  toggleLowStimulation: () => void;
  toggleDyslexiaFont: () => void;
  toggleSyllableHighlight: () => void;
  toggleTortoiseSpeech: () => void;
  setBedtimeMode: (enabled: boolean) => void;
  tickActiveMinute: (mode?: 'learn' | 'cinema') => void;
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
  parentPin: loadKidsParentPin(),

  getActiveProfile: () => getActiveFromStore(get().profilesStore),

  getAgeAdaptation: () => getKidsAgeAdaptation(getActiveFromStore(get().profilesStore).ageGroup),

  verifyParentPin: (pin) => {
    const clean = pin.trim();
    return clean === get().parentPin || isValidKidsExitPin(clean);
  },

  changeParentPin: (currentPin, newPin) => {
    const cleanCurrent = currentPin.trim();
    const cleanNew = newPin.trim();
    if (cleanCurrent !== get().parentPin) {
      return { ok: false, error: 'wrong_current' };
    }
    if (!/^\d{4}$/.test(cleanNew)) {
      return { ok: false, error: 'invalid_format' };
    }
    saveKidsParentPin(cleanNew);
    set({ parentPin: cleanNew });
    return { ok: true };
  },

  resetDefaultPin: () => {
    resetKidsParentPin();
    set({ parentPin: loadKidsParentPin() });
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
      return { profilesStore: nextStore };
    });
  },

  createProfile: (name, avatarId, ageGroup) => {
    set((state) => {
      const created = createKidsProfile(state.profilesStore, name, avatarId, ageGroup);
      return { profilesStore: created.store };
    });
  },

  switchProfile: (profileId) => {
    set((state) => {
      const switched = switchKidsProfile(state.profilesStore, profileId);
      return { profilesStore: switched.store };
    });
  },

  deleteProfile: (profileId) => {
    set((state) => {
      const updated = deleteKidsProfile(state.profilesStore, profileId);
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
    get().updateActiveProfile((prev) => {
      const awarded = awardKidsStars(prev, delta, badgeId);
      const curEarned = awarded.parentPrefs.earnedCinemaMinutes ?? 15;
      return {
        ...awarded,
        parentPrefs: {
          ...awarded.parentPrefs,
          earnedCinemaMinutes: curEarned + Math.max(1, Math.round(delta / 2)),
        },
      };
    });
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

  unlockSticker: (stickerId, costStars) => {
    let ok = false;
    get().updateActiveProfile((prev) => {
      const existing = new Set(prev.unlockedStickers || []);
      if (existing.has(stickerId)) {
        ok = true;
        return prev;
      }
      if (prev.stars < costStars) {
        ok = false;
        return prev;
      }
      existing.add(stickerId);
      ok = true;
      return {
        ...prev,
        stars: prev.stars - costStars,
        unlockedStickers: Array.from(existing),
      };
    });
    return ok;
  },

  unlockRoomDecor: (decorId, costStars) => {
    let ok = false;
    get().updateActiveProfile((prev) => {
      const existing = new Set(prev.roomDecor || []);
      if (existing.has(decorId)) {
        ok = true;
        return prev;
      }
      if (prev.stars < costStars) {
        ok = false;
        return prev;
      }
      existing.add(decorId);
      ok = true;
      return {
        ...prev,
        stars: prev.stars - costStars,
        roomDecor: Array.from(existing),
      };
    });
    return ok;
  },

  careForPet: (costStars, energyGain, happyGain, xpGain) => {
    let ok = false;
    get().updateActiveProfile((prev) => {
      if (prev.stars < costStars) {
        ok = false;
        return prev;
      }
      const pet = prev.petCare || createFreshPetCare();
      const nextXp = pet.xp + xpGain;
      const nextLevel = 1 + Math.floor(nextXp / 50);
      ok = true;
      return {
        ...prev,
        stars: prev.stars - costStars,
        petCare: {
          energy: Math.max(5, Math.min(100, pet.energy + energyGain)),
          happiness: Math.max(10, Math.min(100, pet.happiness + happyGain)),
          xp: nextXp,
          level: nextLevel,
        },
      };
    });
    return ok;
  },

  completeCurriculumNode: (nodeId, bonusStars = 0) => {
    get().updateActiveProfile((prev) => {
      const nextNodes = { ...(prev.completedNodes || {}), [nodeId]: true };
      const withStars = bonusStars > 0 ? awardKidsStars(prev, bonusStars) : prev;
      return {
        ...withStars,
        completedNodes: nextNodes,
      };
    });
  },

  recordDomainResult: (domain, isCorrect, wordId) => {
    const today = getTodayIsoDate();
    get().updateActiveProfile((prev) => {
      const base =
        prev.analytics && prev.analytics.date === today
          ? prev.analytics
          : createFreshAnalytics(today);
      const practiced = new Set(base.practicedWords || []);
      if (wordId) practiced.add(wordId);
      const curEarned = prev.parentPrefs.earnedCinemaMinutes ?? 15;
      return {
        ...prev,
        analytics: {
          ...base,
          domainTotal: {
            ...base.domainTotal,
            [domain]: base.domainTotal[domain] + 1,
          },
          domainCorrect: {
            ...base.domainCorrect,
            [domain]: base.domainCorrect[domain] + (isCorrect ? 1 : 0),
          },
          practicedWords: Array.from(practiced).slice(-30),
        },
        parentPrefs: {
          ...prev.parentPrefs,
          earnedCinemaMinutes: isCorrect ? curEarned + 2 : curEarned,
        },
      };
    });
  },

  saveKidsStory: (story) => {
    get().updateActiveProfile((prev) => {
      const existing = prev.savedStories || [];
      const deduped = [story, ...existing.filter((s) => s.id !== story.id)].slice(0, 16);
      return { ...prev, savedStories: deduped };
    });
  },

  consumeCinemaMinute: () => {
    get().updateActiveProfile((prev) => {
      const today = getTodayIsoDate();
      const base =
        prev.analytics && prev.analytics.date === today
          ? prev.analytics
          : createFreshAnalytics(today);
      const curBank = prev.parentPrefs.earnedCinemaMinutes ?? 15;
      return {
        ...prev,
        analytics: {
          ...base,
          cinemaMinutesToday: base.cinemaMinutesToday + 1,
        },
        parentPrefs: {
          ...prev.parentPrefs,
          earnedCinemaMinutes: prev.parentPrefs.earnCinemaByLearning
            ? Math.max(0, curBank - 1)
            : curBank,
        },
      };
    });
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

  toggleDyslexiaFont: () => {
    set((state) => {
      const nextUx = { ...state.ux, dyslexiaFont: !state.ux.dyslexiaFont };
      persistKidsUxSettings(nextUx);
      return { ux: nextUx };
    });
  },

  toggleSyllableHighlight: () => {
    set((state) => {
      const nextUx = { ...state.ux, syllableHighlight: !state.ux.syllableHighlight };
      persistKidsUxSettings(nextUx);
      return { ux: nextUx };
    });
  },

  toggleTortoiseSpeech: () => {
    set((state) => {
      const nextUx = { ...state.ux, tortoiseSpeech: !state.ux.tortoiseSpeech };
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

  tickActiveMinute: (mode = 'learn') => {
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
    if (mode === 'learn') {
      get().updateActiveProfile((prev) => {
        const base =
          prev.analytics && prev.analytics.date === today
            ? prev.analytics
            : createFreshAnalytics(today);
        return {
          ...prev,
          analytics: {
            ...base,
            learnMinutesToday: base.learnMinutesToday + 1,
          },
        };
      });
    }
  },
}));

