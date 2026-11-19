import type { CatalogMovie } from '../../types';
import type { KidsMascotMeta, KidsVocabEntry } from './kidsData';
import {
  createFreshDailyMissions,
  getTodayIsoDate,
  saveKidsProgress,
  type KidsDailyMissions,
  type KidsProgressState,
} from './kidsProfileStorage';

export function recordKidsWatched(
  current: KidsProgressState,
  movie: CatalogMovie
): KidsProgressState {
  const existing = current.recentWatched || [];
  const deduped = [movie, ...existing.filter((m) => m.id !== movie.id)].slice(0, 8);
  const next = trackKidsMission(
    {
      ...current,
      recentWatched: deduped,
    },
    'watch'
  );
  saveKidsProgress(next);
  return next;
}

export function trackKidsMission(
  current: KidsProgressState,
  kind: 'watch' | 'play' | 'learn'
): KidsProgressState {
  const today = getTodayIsoDate();
  const base =
    current.dailyMissions && current.dailyMissions.date === today
      ? current.dailyMissions
      : createFreshDailyMissions(today);
  const nextMissions: KidsDailyMissions = {
    ...base,
    [kind]: base[kind] + 1,
  };
  const next: KidsProgressState = {
    ...current,
    dailyMissions: nextMissions,
  };
  saveKidsProgress(next);
  return next;
}

export function isDailyMissionChestReady(state: KidsProgressState): boolean {
  const today = getTodayIsoDate();
  const m = state.dailyMissions;
  if (!m || m.date !== today || m.chestClaimed) return false;
  return m.watch >= 1 && m.play >= 1 && m.learn >= 1;
}

export function claimDailyMissionChest(
  current: KidsProgressState
): { ok: boolean; state: KidsProgressState } {
  if (!isDailyMissionChestReady(current)) {
    return { ok: false, state: current };
  }
  const today = getTodayIsoDate();
  const missions = current.dailyMissions || createFreshDailyMissions(today);
  const next: KidsProgressState = {
    ...current,
    stars: current.stars + 10,
    dailyMissions: {
      ...missions,
      chestClaimed: true,
    },
  };
  saveKidsProgress(next);
  return { ok: true, state: next };
}

export function awardKidsStars(
  current: KidsProgressState,
  deltaStars: number,
  badgeId?: string
): KidsProgressState {
  const nextStars = Math.max(0, current.stars + deltaStars);
  const badges = new Set(current.badges);
  if (badgeId) badges.add(badgeId);
  if (nextStars >= 25) badges.add('estrella_oro');
  if (nextStars >= 60) badges.add('genio_multilingue');
  const next: KidsProgressState = {
    ...current,
    stars: nextStars,
    completedLessons: current.completedLessons + 1,
    badges: Array.from(badges),
  };
  saveKidsProgress(next);
  return next;
}

export function unlockKidsReward(
  current: KidsProgressState,
  rewardId: string,
  costStars: number
): { ok: boolean; state: KidsProgressState } {
  const unlocked = new Set(current.unlockedRewards || []);
  if (unlocked.has(rewardId)) {
    return { ok: true, state: current };
  }
  if (current.stars < costStars) {
    return { ok: false, state: current };
  }
  unlocked.add(rewardId);
  const next: KidsProgressState = {
    ...current,
    stars: current.stars - costStars,
    unlockedRewards: Array.from(unlocked),
  };
  saveKidsProgress(next);
  return { ok: true, state: next };
}

export function selectKidsMascot(
  current: KidsProgressState,
  mascot: KidsMascotMeta
): { ok: boolean; state: KidsProgressState } {
  const unlockedKey = `mascot_${mascot.id}`;
  const isOwned = mascot.costStars === 0 || (current.unlockedRewards || []).includes(unlockedKey);
  if (isOwned) {
    const next: KidsProgressState = { ...current, mascotId: mascot.id };
    saveKidsProgress(next);
    return { ok: true, state: next };
  }
  if (current.stars < mascot.costStars) {
    return { ok: false, state: current };
  }
  const next: KidsProgressState = {
    ...current,
    stars: current.stars - mascot.costStars,
    mascotId: mascot.id,
    unlockedRewards: Array.from(new Set([...(current.unlockedRewards || []), unlockedKey])),
  };
  saveKidsProgress(next);
  return { ok: true, state: next };
}

export interface KidsLevelInfo {
  level: number;
  rankKey: 'explorer' | 'adventurer' | 'starMaster' | 'superGenius';
  starsIntoLevel: number;
  starsForNextLevel: number;
  progressPct: number;
}

export function getKidsLevelInfo(stars: number): KidsLevelInfo {
  const safeStars = Math.max(0, Math.floor(stars));
  if (safeStars < 20) {
    return {
      level: 1,
      rankKey: 'explorer',
      starsIntoLevel: safeStars,
      starsForNextLevel: 20,
      progressPct: Math.min(100, Math.round((safeStars / 20) * 100)),
    };
  }
  if (safeStars < 50) {
    const into = safeStars - 20;
    return {
      level: 2,
      rankKey: 'adventurer',
      starsIntoLevel: into,
      starsForNextLevel: 30,
      progressPct: Math.min(100, Math.round((into / 30) * 100)),
    };
  }
  if (safeStars < 100) {
    const into = safeStars - 50;
    return {
      level: 3,
      rankKey: 'starMaster',
      starsIntoLevel: into,
      starsForNextLevel: 50,
      progressPct: Math.min(100, Math.round((into / 50) * 100)),
    };
  }
  const into = (safeStars - 100) % 50;
  return {
    level: 4 + Math.floor((safeStars - 100) / 50),
    rankKey: 'superGenius',
    starsIntoLevel: into,
    starsForNextLevel: 50,
    progressPct: Math.min(100, Math.round((into / 50) * 100)),
  };
}

export type LeitnerBoxesMap = Record<string, 1 | 2 | 3>;

export function loadLeitnerBoxes(profileId = 'kid-1'): LeitnerBoxesMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`riffan_kids_leitner_v1_${profileId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: LeitnerBoxesMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 1 || v === 2 || v === 3) clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveLeitnerBoxes(boxes: LeitnerBoxesMap, profileId = 'kid-1'): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`riffan_kids_leitner_v1_${profileId}`, JSON.stringify(boxes));
  } catch {
    // ignore storage errors
  }
}

export function updateLeitnerBox(
  boxes: LeitnerBoxesMap,
  wordId: string,
  correct: boolean,
  profileId = 'kid-1'
): LeitnerBoxesMap {
  const prev = boxes[wordId] || 1;
  const nextLevel: 1 | 2 | 3 = correct
    ? prev === 1
      ? 2
      : 3
    : 1;
  const next: LeitnerBoxesMap = { ...boxes, [wordId]: nextLevel };
  saveLeitnerBoxes(next, profileId);
  return next;
}

export function pickLeitnerEntries(
  bank: KidsVocabEntry[],
  boxes: LeitnerBoxesMap,
  count: number
): KidsVocabEntry[] {
  return [...bank]
    .sort((a, b) => (boxes[a.id] || 1) - (boxes[b.id] || 1))
    .slice(0, Math.max(1, Math.min(bank.length, count)));
}
