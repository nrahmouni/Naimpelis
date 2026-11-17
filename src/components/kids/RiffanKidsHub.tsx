import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Brain,
  Cast,
  Check,
  Clock,
  Delete,
  Film,
  Gamepad2,
  Gift,
  Lock,
  Moon,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Users,
  Volume2,
  X,
  Youtube,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  KidsAgeGroup,
  KidsLanguageCode,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  awardKidsStars,
  claimDailyMissionChest,
  createFreshDailyMissions,
  createKidsProfile,
  DEFAULT_PARENT_SAFE_SEEDS,
  deleteKidsProfile,
  isDailyMissionChestReady,
  KIDS_AVATAR_CHOICES,
  KIDS_BADGES,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  KIDS_SHOP_ITEMS,
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
} from './kidsData';
import { KidsCinemaTab } from './KidsCinemaTab';
import { KidsFunGames } from './KidsFunGames';
import { KidsLearningGames } from './KidsLearningGames';
import { KidsYouTubeTab } from './KidsYouTubeTab';
import {
  KidsAnimatedCategoryIcon,
  KidsAnimatedMascotSvg,
} from './KidsSvgArt';
import { KidsStepWizard } from './KidsStepWizard';

export const KIDS_EXIT_PIN = '1122';

export function isValidKidsExitPin(pin: string): boolean {
  return pin.trim() === KIDS_EXIT_PIN;
}

interface RiffanKidsHubProps {
  shellLang: AppLanguage;
  exitPromptSeq?: number;
  onPlayMovie: (movie: CatalogMovie, preferLang: string) => void;
  onPlaySeries: (series: CatalogMovie, preferLang: string) => void;
  onOpenSmartTv?: () => void;
  onExitKids: () => void;
}

type KidsHubTab = 'cinema' | 'fun' | 'learn';
type PinActionIntent = 'exit' | 'parent_settings' | 'cast_tv';

const AGE_GROUPS: Array<{ id: KidsAgeGroup; label: string }> = [
  { id: '3-5', label: '3–5' },
  { id: '6-8', label: '6–8' },
  { id: '9-12', label: '9–12' },
];

export const RiffanKidsHub: React.FC<RiffanKidsHubProps> = ({
  shellLang,
  exitPromptSeq = 0,
  onPlayMovie,
  onPlaySeries,
  onOpenSmartTv,
  onExitKids,
}) => {
  const [profilesStore, setProfilesStore] = useState<KidsProfilesStore>(() =>
    loadKidsProfilesStore()
  );
  const progress = useMemo(
    () =>
      profilesStore.profiles.find((p) => p.id === profilesStore.activeProfileId) ||
      profilesStore.profiles[0],
    [profilesStore]
  );

  const updateActiveProgress = (
    updater: (prev: KidsProgressState) => KidsProgressState
  ) => {
    setProfilesStore((prevStore) => {
      const current =
        prevStore.profiles.find((p) => p.id === prevStore.activeProfileId) ||
        prevStore.profiles[0];
      const nextProfile = updater(current);
      saveKidsProgress(nextProfile);
      const nextStore: KidsProfilesStore = {
        activeProfileId: nextProfile.id || prevStore.activeProfileId,
        profiles: prevStore.profiles.map((p) =>
          p.id === nextProfile.id ? nextProfile : p
        ),
      };
      saveKidsProfilesStore(nextStore);
      return nextStore;
    });
  };

  const [activeTab, setActiveTab] = useState<KidsHubTab>('cinema');
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pinIntent, setPinIntent] = useState<PinActionIntent>('exit');
  const [pendingCastMovie, setPendingCastMovie] = useState<CatalogMovie | null>(null);
  const [pinDigits, setPinDigits] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  const [albumModalOpen, setAlbumModalOpen] = useState<boolean>(false);
  const [wizardOpen, setWizardOpen] = useState<boolean>(false);
  const [parentModalOpen, setParentModalOpen] = useState<boolean>(false);
  const [starToast, setStarToast] = useState<string | null>(null);
  const [celebrationBurst, setCelebrationBurst] = useState<boolean>(false);
  const [remainingMins, setRemainingMins] = useState<number | null>(null);

  // Bedtime Mode + Gentle Music-Box Lullaby
  const [bedtimeMode, setBedtimeMode] = useState<boolean>(false);
  const [lullabyPlaying, setLullabyPlaying] = useState<boolean>(false);
  const lullabyIntervalRef = useRef<number | null>(null);

  // Sibling profile creation draft inside Album Modal
  const [newSiblingName, setNewSiblingName] = useState('');
  const [newSiblingAvatar, setNewSiblingAvatar] = useState(KIDS_AVATAR_CHOICES[0]);
  const [newSiblingAge, setNewSiblingAge] = useState<KidsAgeGroup>('6-8');

  const activeMascot =
    KIDS_MASCOTS.find((m) => m.id === progress.mascotId) || KIDS_MASCOTS[0];
  const dailyMissions = progress.dailyMissions || createFreshDailyMissions();
  const chestReady = isDailyMissionChestReady(progress);

  // Gentle WebAudio Music-Box Lullaby generator when Bedtime Audio is enabled
  useEffect(() => {
    if (!bedtimeMode || !lullabyPlaying || typeof window === 'undefined') {
      if (lullabyIntervalRef.current) {
        window.clearInterval(lullabyIntervalRef.current);
        lullabyIntervalRef.current = null;
      }
      return;
    }

    const notes = [392.0, 440.0, 493.88, 392.0, 329.63, 293.66];
    let step = 0;
    let ctx: AudioContext | null = null;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) ctx = new AC();
    } catch {
      ctx = null;
    }

    const playSoftNote = () => {
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(notes[step % notes.length], now);
        step += 1;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.045, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.9);
      } catch {
        // ignore WebAudio restrictions
      }
    };

    playSoftNote();
    lullabyIntervalRef.current = window.setInterval(playSoftNote, 950);

    return () => {
      if (lullabyIntervalRef.current) {
        window.clearInterval(lullabyIntervalRef.current);
        lullabyIntervalRef.current = null;
      }
      if (ctx) {
        void ctx.close().catch(() => {});
      }
    };
  }, [bedtimeMode, lullabyPlaying]);

  useEffect(() => {
    if (exitPromptSeq > 0) {
      setPinIntent('exit');
      setPendingCastMovie(null);
      setPinDigits('');
      setPinError(false);
      setPinModalOpen(true);
    }
  }, [exitPromptSeq]);

  // Screen-time countdown tracker when parent enables a timer
  useEffect(() => {
    const mins = progress.parentPrefs?.timerMinutes;
    const started = progress.parentPrefs?.timerStartedAt;
    if (!mins || !started) {
      setRemainingMins(null);
      return;
    }
    const update = () => {
      const elapsedMs = Date.now() - started;
      const left = Math.max(0, Math.ceil((mins * 60_000 - elapsedMs) / 60_000));
      setRemainingMins(left);
    };
    update();
    const id = window.setInterval(update, 15_000);
    return () => window.clearInterval(id);
  }, [progress.parentPrefs?.timerMinutes, progress.parentPrefs?.timerStartedAt]);

  const openPinModal = (intent: PinActionIntent = 'exit', movieForCast?: CatalogMovie) => {
    triggerHaptic('light');
    setPinIntent(intent);
    setPendingCastMovie(movieForCast || null);
    setPinDigits('');
    setPinError(false);
    setPinModalOpen(true);
  };

  const handleDigitPress = (digit: string) => {
    triggerHaptic('light');
    setPinError(false);
    const next = (pinDigits + digit).slice(0, 4);
    setPinDigits(next);

    if (next.length === 4) {
      if (isValidKidsExitPin(next)) {
        triggerHaptic('success');
        setPinModalOpen(false);
        setPinDigits('');
        if (pinIntent === 'parent_settings') {
          setParentModalOpen(true);
        } else if (pinIntent === 'cast_tv') {
          if (pendingCastMovie) {
            updateActiveProgress((prev) => recordKidsWatched(prev, pendingCastMovie));
          }
          setPendingCastMovie(null);
          onOpenSmartTv?.();
        } else {
          onExitKids();
        }
      } else {
        triggerHaptic('warning');
        setPinError(true);
        window.setTimeout(() => {
          setPinDigits('');
        }, 420);
      }
    }
  };

  useEffect(() => {
    if (!pinModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        setPinDigits((prev) => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        setPinModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinModalOpen, pinDigits, pinIntent]);

  const handleSelectKidsLang = (nextLang: KidsLanguageCode) => {
    if (progress.parentPrefs?.lockedLang && progress.parentPrefs.lockedLang !== nextLang) {
      return;
    }
    triggerHaptic('light');
    updateActiveProgress((prev) => ({ ...prev, preferredLang: nextLang }));
  };

  const handleSelectAgeGroup = (nextAge: KidsAgeGroup) => {
    if (progress.parentPrefs?.lockedAge && progress.parentPrefs.lockedAge !== nextAge) {
      return;
    }
    triggerHaptic('light');
    updateActiveProgress((prev) => ({ ...prev, ageGroup: nextAge }));
  };

  const cycleMobileAgeGroup = () => {
    if (progress.parentPrefs?.lockedAge) return;
    const idx = AGE_GROUPS.findIndex((g) => g.id === progress.ageGroup);
    const nextAge = AGE_GROUPS[(idx + 1) % AGE_GROUPS.length].id;
    handleSelectAgeGroup(nextAge);
  };

  const triggerToast = (msg: string) => {
    setStarToast(msg);
    setCelebrationBurst(true);
    window.setTimeout(() => setCelebrationBurst(false), 1100);
    window.setTimeout(() => {
      setStarToast((curr) => (curr === msg ? null : curr));
    }, 1800);
  };

  const handleEarnStar = (deltaStars: number, badgeId?: string) => {
    updateActiveProgress((prev) => awardKidsStars(prev, deltaStars, badgeId));
    triggerToast(`+${deltaStars} ⭐`);
  };

  const handleClaimChest = () => {
    const res = claimDailyMissionChest(progress);
    if (res.ok) {
      triggerHaptic('success');
      updateActiveProgress(() => res.state);
      triggerToast('+10 ⭐ Cofre Diario');
    }
  };

  const handlePickMascot = (mascot: KidsMascotMeta) => {
    const res = selectKidsMascot(progress, mascot);
    if (res.ok) {
      triggerHaptic('success');
      updateActiveProgress(() => res.state);
    } else {
      triggerHaptic('warning');
    }
  };

  const handleUnlockShopItem = (rewardId: string, cost: number) => {
    const res = unlockKidsReward(progress, rewardId, cost);
    if (res.ok) {
      triggerHaptic('success');
      updateActiveProgress(() => res.state);
    } else {
      triggerHaptic('warning');
    }
  };

  const handleCreateSibling = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('success');
    const created = createKidsProfile(
      profilesStore,
      newSiblingName,
      newSiblingAvatar,
      newSiblingAge
    );
    setProfilesStore(created.store);
    setNewSiblingName('');
  };

  const handleSwitchSibling = (profileId: string) => {
    triggerHaptic('light');
    const switched = switchKidsProfile(profilesStore, profileId);
    setProfilesStore(switched.store);
  };

  const handleDeleteSibling = (profileId: string) => {
    triggerHaptic('warning');
    const updated = deleteKidsProfile(profilesStore, profileId);
    setProfilesStore(updated.store);
  };

  const updateParentPrefs = (patch: Partial<KidsProgressState['parentPrefs']>) => {
    triggerHaptic('light');
    updateActiveProgress((prev) => {
      const nextPrefs = { ...prev.parentPrefs, ...patch };
      return {
        ...prev,
        preferredLang: nextPrefs.lockedLang || prev.preferredLang,
        ageGroup: nextPrefs.lockedAge || prev.ageGroup,
        parentPrefs: nextPrefs,
      };
    });
  };

  const toggleApprovedTitle = (movie: CatalogMovie) => {
    const currentList = progress.parentPrefs?.approvedItems || [];
    const exists = currentList.some((m) => m.id === movie.id);
    const nextList = exists
      ? currentList.filter((m) => m.id !== movie.id)
      : [movie, ...currentList];
    updateParentPrefs({ approvedItems: nextList });
  };

  const parentCandidatePool = useMemo(() => {
    const map = new Map<string, CatalogMovie>();
    for (const m of [
      ...(progress.recentWatched || []),
      ...(progress.parentPrefs?.approvedItems || []),
      ...DEFAULT_PARENT_SAFE_SEEDS,
    ]) {
      if (!map.has(m.id)) map.set(m.id, m);
    }
    return Array.from(map.values());
  }, [progress.recentWatched, progress.parentPrefs?.approvedItems]);

  const isTimeUp = remainingMins !== null && remainingMins <= 0;

  return (
    <div className="relative flex-1 min-h-0 h-full flex flex-col gap-2 p-2.5 sm:p-3.5 overflow-hidden select-none bg-gradient-to-b from-[#131B3A] via-[#0F152E] to-[#0B0F21]">
      {/* Warm Low-Glare Bedtime Overlay */}
      {bedtimeMode && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[220] bg-amber-950/35 backdrop-saturate-[0.75] transition-opacity duration-300"
        />
      )}

      {/* Brief Celebratory Star Toast */}
      {celebrationBurst && starToast && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-[240] px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 text-black font-display font-black text-xs shadow-xl flex items-center gap-2 animate-bounce motion-reduce:animate-none"
        >
          <span>{activeMascot.emoji}</span>
          <span>{starToast}</span>
          <span className="hidden sm:inline font-bold">{activeMascot.cheerEs}</span>
        </div>
      )}

      {/* IMMERSIVE CHILD NAVIGATION DOCK (BIG, BOUNCY & INTUITIVE FOR KIDS) */}
      <div className="shrink-0 relative z-[225] flex items-center justify-between gap-2 rounded-3xl bg-[#141B3B]/95 border-2 border-[#293870] px-3 py-2 shadow-xl backdrop-blur-md">
        {/* Left: Kid Mascot Buddy + Bouncing Stars Counter */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setAlbumModalOpen(true);
          }}
          aria-label="Abrir Álbum y Perfiles de Hermanos"
          title="Ver Álbum de Cromos y Estrellas"
          className="flex items-center gap-2 px-2.5 py-1 rounded-2xl bg-[#1C264E] hover:bg-[#253265] border-2 border-[#33427D] cursor-pointer transition-transform active:scale-95 group shrink-0"
        >
          <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
            <KidsAnimatedMascotSvg id={progress.mascotId} size={36} />
            {chestReady && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-white animate-ping" />
            )}
          </div>
          <div className="text-left hidden xs:block">
            <div className="text-[11px] font-black text-white leading-tight flex items-center gap-1">
              <span className="max-w-[70px] sm:max-w-[100px] truncate">{progress.name || 'Peque'}</span>
              {chestReady && <Gift className="w-3 h-3 text-amber-300" />}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-black text-amber-300 tabular-nums">
              <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
              <span>{progress.stars}</span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setWizardOpen(true);
          }}
          aria-label="Asistente paso a paso"
          title="Paso a paso (Personaje, Idioma, Edad)"
          className="h-10 px-3 rounded-2xl bg-[#1C264E] hover:bg-[#253265] border-2 border-[#33427D] text-xs font-black text-amber-300 flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
        >
          <span>🪄</span>
          <span className="hidden md:inline">Paso a Paso</span>
        </button>

        {/* Center: The 3 Big Child Worlds (Cine, Juegos, Aprender) */}
        <nav aria-label="Secciones de Riffan Kids" className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setActiveTab('cinema');
            }}
            className={`h-11 sm:h-12 px-3.5 sm:px-5 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer transition-all active:scale-95 border-b-4 ${
              activeTab === 'cinema'
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 border-amber-700 shadow-[0_4px_16px_rgba(245,158,11,0.4)] scale-105'
                : 'bg-[#1C254D] hover:bg-[#253163] text-zinc-200 border-[#0E142B] opacity-80 hover:opacity-100'
            }`}
          >
            <KidsAnimatedCategoryIcon name="cinema" size={20} />
            <span>
              {pickLang(shellLang, {
                es: 'Cine',
                ca: 'Cinema',
                en: 'Cinema',
                rif: 'Lafilmat',
              })}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setActiveTab('fun');
            }}
            className={`h-11 sm:h-12 px-3.5 sm:px-5 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer transition-all active:scale-95 border-b-4 ${
              activeTab === 'fun'
                ? 'bg-gradient-to-b from-pink-400 to-pink-600 text-white border-pink-800 shadow-[0_4px_16px_rgba(236,72,153,0.4)] scale-105'
                : 'bg-[#1C254D] hover:bg-[#253163] text-zinc-200 border-[#0E142B] opacity-80 hover:opacity-100'
            }`}
          >
            <KidsAnimatedCategoryIcon name="fun" size={20} />
            <span>
              {pickLang(shellLang, {
                es: 'Juegos',
                ca: 'Jocs',
                en: 'Play',
                rif: 'Iraren',
              })}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setActiveTab('learn');
            }}
            className={`h-11 sm:h-12 px-3.5 sm:px-5 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer transition-all active:scale-95 border-b-4 ${
              activeTab === 'learn'
                ? 'bg-gradient-to-b from-sky-300 to-sky-500 text-zinc-950 border-sky-700 shadow-[0_4px_16px_rgba(56,189,248,0.4)] scale-105'
                : 'bg-[#1C254D] hover:bg-[#253163] text-zinc-200 border-[#0E142B] opacity-80 hover:opacity-100'
            }`}
          >
            <KidsAnimatedCategoryIcon name="learn" size={20} />
            <span>
              {pickLang(shellLang, {
                es: 'Aprender',
                ca: 'Aprendre',
                en: 'Learn',
                rif: 'Alemmed',
              })}
            </span>
          </button>
        </nav>

        {/* Right: Bedtime story toggle + Parental Exit Gate (PIN 1122) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              const nextBedtime = !bedtimeMode;
              setBedtimeMode(nextBedtime);
              if (!nextBedtime) setLullabyPlaying(false);
            }}
            aria-label="Modo hora de dormir"
            title="Luz cálida y nanas para dormir"
            className={`h-10 w-10 rounded-2xl border-2 flex items-center justify-center cursor-pointer transition-all active:scale-95 ${
              bedtimeMode
                ? 'bg-indigo-500 text-white border-indigo-300 shadow-[0_0_14px_rgba(99,102,241,0.5)]'
                : 'bg-[#1C254D] hover:bg-[#253163] text-indigo-300 border-[#303E73]'
            }`}
          >
            <KidsAnimatedCategoryIcon name="bedtime" size={18} />
          </button>

          {bedtimeMode && (
            <button
              type="button"
              onClick={() => setLullabyPlaying((v) => !v)}
              aria-label="Música suave de dormir"
              title="Nana musical suave"
              className={`h-10 px-2.5 rounded-2xl border-2 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                lullabyPlaying
                  ? 'bg-amber-400 text-black border-amber-200 animate-pulse'
                  : 'bg-[#1C254D] text-amber-300 border-[#303E73]'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nana</span>
            </button>
          )}

          {remainingMins !== null && (
            <div className="h-10 px-2 rounded-2xl bg-indigo-500/25 border border-indigo-300/35 flex items-center gap-1 text-[11px] font-black text-indigo-100 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>{remainingMins}m</span>
            </div>
          )}

          {/* Parental Control Exit Gate with PIN 1122 */}
          <button
            type="button"
            onClick={() => openPinModal('exit')}
            className="h-10 px-2.5 sm:px-3 rounded-2xl bg-[#171F3F] hover:bg-rose-500/25 border-2 border-rose-500/40 text-[11px] sm:text-xs font-black text-zinc-100 flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95"
            title="Zona de Padres (PIN 1122)"
          >
            <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="hidden sm:inline">Padres</span>
            <span className="sm:hidden">PIN</span>
          </button>
        </div>
      </div>

      {/* ZERO-SCROLL ACTIVE WORKSPACE */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'cinema' && (
          <KidsCinemaTab
            shellLang={shellLang}
            kidsLang={progress.preferredLang}
            ageGroup={progress.ageGroup}
            lockedLang={progress.parentPrefs?.lockedLang}
            recentWatched={progress.recentWatched || []}
            approvedOnlyMode={Boolean(progress.parentPrefs?.approvedOnlyMode)}
            approvedItems={progress.parentPrefs?.approvedItems || []}
            onSelectKidsLang={handleSelectKidsLang}
            onPlayMovie={(movie, preferLang) => {
              updateActiveProgress((prev) => recordKidsWatched(prev, movie));
              onPlayMovie(movie, preferLang);
            }}
            onPlaySeries={(series, preferLang) => {
              updateActiveProgress((prev) => recordKidsWatched(prev, series));
              onPlaySeries(series, preferLang);
            }}
            onEarnStar={handleEarnStar}
            onRequestCastToTv={(movie) => openPinModal('cast_tv', movie)}
          />
        )}

        {activeTab === 'fun' && (
          <KidsFunGames
            shellLang={shellLang}
            ageGroup={progress.ageGroup}
            unlockedRewards={progress.unlockedRewards}
            onEarnStar={handleEarnStar}
            onMissionPlay={() =>
              updateActiveProgress((prev) => trackKidsMission(prev, 'play'))
            }
          />
        )}

        {activeTab === 'learn' && (
          <KidsLearningGames
            shellLang={shellLang}
            kidsLang={progress.preferredLang}
            ageGroup={progress.ageGroup}
            lockedLang={progress.parentPrefs?.lockedLang}
            bedtimeMode={bedtimeMode}
            onSelectKidsLang={handleSelectKidsLang}
            onEarnStar={handleEarnStar}
            onMissionLearn={() =>
              updateActiveProgress((prev) => trackKidsMission(prev, 'learn'))
            }
          />
        )}
      </div>

      {/* SCREEN-TIME LOCK OVERLAY */}
      {isTimeUp && !pinModalOpen && !parentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[255] bg-[#0B0F22]/95 backdrop-blur-lg flex items-center justify-center p-5 text-center"
        >
          <div className="w-full max-w-sm rounded-3xl bg-[#161F42] border-2 border-amber-400/40 p-6 space-y-4 shadow-2xl">
            <div className="text-5xl">🌙</div>
            <h2 className="font-display font-extrabold text-2xl text-white">
              ¡Hora de descansar!
            </h2>
            <p className="text-sm text-sky-100/80">
              Se terminó el tiempo de pantalla de hoy. ¡Lo hiciste genial con {progress.stars} ⭐!
            </p>
            <button
              type="button"
              onClick={() => openPinModal('parent_settings')}
              className="w-full h-11 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-black font-display font-black text-sm cursor-pointer"
            >
              Soy Papá / Mamá (PIN)
            </button>
          </div>
        </div>
      )}

      {/* STAR ALBUM, SIBLING PROFILES, DAILY CHEST & MASCOT SHOP MODAL */}
      {albumModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[258] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg max-h-[88dvh] rounded-3xl bg-[#141B38] border-2 border-amber-400/40 p-4 sm:p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{progress.avatarEmoji || activeMascot.emoji}</span>
                <div>
                  <h2 className="font-display font-extrabold text-base sm:text-lg text-white">
                    Álbum de {progress.name || 'Peque 1'}
                  </h2>
                  <p className="text-xs text-amber-300 font-bold tabular-nums">
                    Tienes {progress.stars} ⭐ disponibles
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAlbumModalOpen(false)}
                aria-label="Cerrar álbum"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              {/* Daily Missions & +10 Star Chest */}
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#1B254D] to-[#151D3D] border border-amber-400/30 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5" /> Misiones de Hoy (Cofre +10 ⭐)
                  </h3>
                  {dailyMissions.chestClaimed ? (
                    <span className="text-[11px] font-bold text-emerald-300">
                      ✅ ¡Cofre abierto hoy!
                    </span>
                  ) : chestReady ? (
                    <button
                      type="button"
                      onClick={handleClaimChest}
                      className="h-7 px-3 rounded-lg bg-amber-400 text-black text-[11px] font-black cursor-pointer animate-pulse"
                    >
                      Abrir Cofre +10 ⭐
                    </button>
                  ) : (
                    <span className="text-[11px] text-sky-200">Completa las 3</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: '🎬 Ver Peli', done: dailyMissions.watch >= 1 },
                    { label: '🎮 Jugar', done: dailyMissions.play >= 1 },
                    { label: '🧠 Aprender', done: dailyMissions.learn >= 1 },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className={`p-2 rounded-xl border text-[11px] font-bold ${
                        m.done
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                          : 'bg-[#101630] border-white/10 text-zinc-300'
                      }`}
                    >
                      <div>{m.label}</div>
                      <div className="text-[10px] mt-0.5">{m.done ? '✅ Listo' : '0/1'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sibling Profiles Switcher + Creator */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Perfiles de hermanos ({profilesStore.profiles.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {profilesStore.profiles.map((prof) => {
                    const isCurrent = prof.id === progress.id;
                    return (
                      <div
                        key={prof.id}
                        className={`flex items-center gap-1 rounded-xl border px-2 py-1 ${
                          isCurrent
                            ? 'bg-sky-400/25 border-sky-300 text-white'
                            : 'bg-[#1B2447] border-white/10 text-zinc-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSwitchSibling(prof.id!)}
                          className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                        >
                          <span>{prof.avatarEmoji || '🦊'}</span>
                          <span>{prof.name}</span>
                          <span className="text-[10px] text-amber-300">{prof.stars}⭐</span>
                        </button>
                        {profilesStore.profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSibling(prof.id!)}
                            aria-label={`Borrar perfil ${prof.name}`}
                            className="ml-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleCreateSibling} className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1">
                    {KIDS_AVATAR_CHOICES.map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setNewSiblingAvatar(av)}
                        className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center cursor-pointer border ${
                          newSiblingAvatar === av
                            ? 'bg-amber-400/30 border-amber-300'
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newSiblingName}
                    onChange={(e) => setNewSiblingName(e.target.value)}
                    placeholder="Nombre del hermano/a..."
                    className="flex-1 min-w-[130px] h-8 px-2.5 rounded-lg bg-[#0B1024] border border-white/15 text-xs text-white outline-none"
                  />
                  <select
                    value={newSiblingAge}
                    onChange={(e) => setNewSiblingAge(e.target.value as KidsAgeGroup)}
                    aria-label="Edad del hermano"
                    className="h-8 px-2 rounded-lg bg-[#0B1024] border border-white/15 text-xs text-white outline-none"
                  >
                    <option value="3-5">3–5</option>
                    <option value="6-8">6–8</option>
                    <option value="9-12">9–12</option>
                  </select>
                  <button
                    type="submit"
                    className="h-8 px-3 rounded-lg bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear</span>
                  </button>
                </form>
              </div>

              {/* Mascots Picker */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
                  <span>🐾</span> Elige tu compañero
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {KIDS_MASCOTS.map((m) => {
                    const owned =
                      m.costStars === 0 || (progress.unlockedRewards || []).includes(`mascot_${m.id}`);
                    const selected = progress.mascotId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handlePickMascot(m)}
                        className={`p-2 rounded-2xl border-2 border-b-4 text-center flex flex-col items-center gap-1 cursor-pointer transition-all ${
                          selected
                            ? 'bg-amber-400/25 border-amber-400 text-white'
                            : 'bg-[#1B2447] hover:bg-[#232F5C] border-[#29376B] text-zinc-200'
                        }`}
                      >
                        <span className="text-2xl">{m.emoji}</span>
                        <span className="text-[11px] font-bold">{m.name}</span>
                        <span className="text-[10px] font-extrabold text-amber-300">
                          {selected ? 'Activo' : owned ? 'Usar' : `${m.costStars} ⭐`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reward Shop */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-pink-200 flex items-center gap-1.5">
                  <span>🎁</span> Canjear estrellas por poderes
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KIDS_SHOP_ITEMS.map((item) => {
                    const owned = (progress.unlockedRewards || []).includes(item.id);
                    const canAfford = progress.stars >= item.cost;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={owned || !canAfford}
                        onClick={() => handleUnlockShopItem(item.id, item.cost)}
                        className={`p-2.5 rounded-2xl border-2 text-left flex items-center justify-between gap-2 transition-all ${
                          owned
                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                            : canAfford
                            ? 'bg-[#1B2447] hover:bg-[#253161] border-amber-400/45 text-white cursor-pointer'
                            : 'bg-[#121833] border-white/10 text-zinc-400 opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-2xl shrink-0">{item.emoji}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold truncate">{item.title}</div>
                            <div className="text-[10px] text-sky-200/75 truncate">{item.desc}</div>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-black text-amber-300">
                          {owned ? <Check className="w-4 h-4 text-emerald-300" /> : `${item.cost} ⭐`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Earned Badges Grid */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> Medallas ({progress.badges.length}/{KIDS_BADGES.length})
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {KIDS_BADGES.map((b) => {
                    const earned = progress.badges.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        className={`p-2 rounded-xl border text-center flex flex-col items-center gap-0.5 ${
                          earned
                            ? 'bg-amber-400/15 border-amber-400/40 text-white'
                            : 'bg-black/25 border-white/5 text-zinc-500 opacity-45 grayscale'
                        }`}
                      >
                        <span className="text-xl">{b.emoji}</span>
                        <span className="text-[10px] font-bold leading-tight truncate w-full">
                          {b.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY PIN 1122 EXIT / PARENTAL / SMART TV GATE MODAL */}
      {pinModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[260] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-xs rounded-3xl bg-[#141B38] border-2 border-amber-400/40 p-5 shadow-2xl space-y-3.5 text-center">
            <div className="space-y-1">
              <div className="w-10 h-10 mx-auto rounded-2xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
                {pinIntent === 'parent_settings' ? (
                  <Settings2 className="w-5 h-5" />
                ) : pinIntent === 'cast_tv' ? (
                  <Cast className="w-5 h-5" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </div>
              <h2 className="font-display font-extrabold text-lg text-white">
                {pinIntent === 'parent_settings'
                  ? 'Ajustes de Padres'
                  : pinIntent === 'cast_tv'
                  ? 'Enviar a Smart TV'
                  : pickLang(shellLang, {
                      es: 'PIN para salir de Kids',
                      ca: 'PIN per sortir de Kids',
                      en: 'PIN to exit Kids',
                      rif: 'PIN bac ad tffɣed zi Kids',
                    })}
              </h2>
              <p className="text-xs text-sky-200/75">
                {pinIntent === 'cast_tv' && pendingCastMovie
                  ? `Autoriza enviar «${pendingCastMovie.title}» al televisor`
                  : pickLang(shellLang, {
                      es: 'Introduce el código de adulto para continuar',
                      ca: 'Introdueix el codi d’adult per continuar',
                      en: 'Enter the parent PIN to continue',
                    })}
              </p>
            </div>

            {/* Segmented Mode Toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0B1024] border border-white/10">
              <button
                type="button"
                onClick={() => setPinIntent('exit')}
                className={`h-7 rounded-lg text-[11px] font-bold cursor-pointer ${
                  pinIntent === 'exit' ? 'bg-amber-400 text-black' : 'text-zinc-300'
                }`}
              >
                Salir de Kids
              </button>
              <button
                type="button"
                onClick={() => setPinIntent('parent_settings')}
                className={`h-7 rounded-lg text-[11px] font-bold cursor-pointer ${
                  pinIntent === 'parent_settings' ? 'bg-sky-400 text-black' : 'text-zinc-300'
                }`}
              >
                Ajustes Padres
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 py-1">
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pinDigits.length;
                return (
                  <span
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      pinError
                        ? 'bg-rose-500 border-rose-300 scale-110'
                        : filled
                        ? 'bg-amber-400 border-amber-200 scale-110'
                        : 'bg-transparent border-white/30'
                    }`}
                  />
                );
              })}
            </div>

            {pinError && (
              <p className="text-xs font-bold text-rose-400">
                {pickLang(shellLang, {
                  es: 'PIN incorrecto. Prueba otra vez.',
                  ca: 'PIN incorrecte. Torna-ho a provar.',
                  en: 'Wrong PIN. Try again.',
                })}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDigitPress(d)}
                  className="h-12 rounded-2xl bg-[#1D264D] hover:bg-amber-400 hover:text-black border-b-2 border-[#0A0E1E] text-lg font-display font-black text-white cursor-pointer active:translate-y-0.5 transition-all"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinDigits('')}
                className="h-12 rounded-2xl bg-white/[0.06] text-xs font-bold text-zinc-300 cursor-pointer"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                className="h-12 rounded-2xl bg-[#1D264D] hover:bg-amber-400 hover:text-black border-b-2 border-[#0A0E1E] text-lg font-display font-black text-white cursor-pointer active:translate-y-0.5 transition-all"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinDigits((p) => p.slice(0, -1))}
                aria-label="Borrar"
                className="h-12 rounded-2xl bg-white/[0.06] text-zinc-200 flex items-center justify-center cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPinModalOpen(false)}
              className="w-full h-10 rounded-xl bg-amber-400 hover:bg-amber-300 border-b-2 border-amber-600 text-black font-display font-extrabold text-xs cursor-pointer"
            >
              {pickLang(shellLang, {
                es: 'Seguir jugando en Kids',
                ca: 'Seguir jugant a Kids',
                en: 'Stay in Kids',
              })}
            </button>
          </div>
        </div>
      )}

      {/* PARENT SETTINGS PANEL (UNLOCKED BY PIN 1122) */}
      {parentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[265] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg max-h-[88dvh] rounded-3xl bg-[#141B38] border-2 border-sky-400/40 p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-sky-400" />
                <h2 className="font-display font-extrabold text-lg text-white">
                  Control Parental Kids
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setParentModalOpen(false)}
                aria-label="Cerrar ajustes"
                className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              {/* Lock Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-sky-200">
                  Fijar idioma obligatorio
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateParentPrefs({ lockedLang: null })}
                    className={`h-8 px-2.5 rounded-xl text-xs font-bold cursor-pointer border ${
                      !progress.parentPrefs.lockedLang
                        ? 'bg-sky-400 text-black border-sky-200'
                        : 'bg-white/5 text-zinc-200 border-white/10'
                    }`}
                  >
                    Todos libres
                  </button>
                  {KIDS_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => updateParentPrefs({ lockedLang: l.code })}
                      className={`h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                        progress.parentPrefs.lockedLang === l.code
                          ? 'bg-amber-400 text-black border-amber-200'
                          : 'bg-white/5 text-zinc-200 border-white/10'
                      }`}
                    >
                      <FlagBadgeSvg code={l.flagCode} className="w-4 h-3" />
                      <span>{l.nativeLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lock Age Group */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-sky-200">
                  Fijar franja de edad
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateParentPrefs({ lockedAge: null })}
                    className={`h-8 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                      !progress.parentPrefs.lockedAge
                        ? 'bg-sky-400 text-black border-sky-200'
                        : 'bg-white/5 text-zinc-200 border-white/10'
                    }`}
                  >
                    Libre
                  </button>
                  {AGE_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => updateParentPrefs({ lockedAge: g.id })}
                      className={`h-8 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                        progress.parentPrefs.lockedAge === g.id
                          ? 'bg-amber-400 text-black border-amber-200'
                          : 'bg-white/5 text-zinc-200 border-white/10'
                      }`}
                    >
                      {g.label} años
                    </button>
                  ))}
                </div>
              </div>

              {/* Screen Time Limit */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-sky-200">
                  Temporizador de descanso
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[null, 15, 30, 45].map((mins) => (
                    <button
                      key={String(mins)}
                      type="button"
                      onClick={() =>
                        updateParentPrefs({
                          timerMinutes: mins,
                          timerStartedAt: mins ? Date.now() : null,
                        })
                      }
                      className={`h-8 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                        progress.parentPrefs.timerMinutes === mins
                          ? 'bg-emerald-400 text-black border-emerald-200'
                          : 'bg-white/5 text-zinc-200 border-white/10'
                      }`}
                    >
                      {mins === null ? 'Sin límite' : `${mins} min`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parent Curated Safe-Only Watchlist */}
              <div className="space-y-2 p-3 rounded-2xl bg-[#0D1226] border border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-white">
                      Modo «Solo Selección de Papá y Mamá»
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      El cine mostrará únicamente los títulos aprobados abajo
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateParentPrefs({
                        approvedOnlyMode: !progress.parentPrefs?.approvedOnlyMode,
                      })
                    }
                    className={`h-8 px-3 rounded-xl text-xs font-black cursor-pointer border ${
                      progress.parentPrefs?.approvedOnlyMode
                        ? 'bg-emerald-400 text-black border-emerald-200'
                        : 'bg-white/10 text-zinc-200 border-white/15'
                    }`}
                  >
                    {progress.parentPrefs?.approvedOnlyMode ? 'Activado' : 'Desactivado'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parentCandidatePool.map((item) => {
                    const checked = (progress.parentPrefs?.approvedItems || []).some(
                      (m) => m.id === item.id
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleApprovedTitle(item)}
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                          checked
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                            : 'bg-white/5 border-white/10 text-zinc-300'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                        <span>{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Smart TV Pairing / Cast shortcut */}
              {onOpenSmartTv && (
                <button
                  type="button"
                  onClick={() => {
                    setParentModalOpen(false);
                    onOpenSmartTv();
                  }}
                  className="w-full h-10 rounded-xl bg-amber-400/20 hover:bg-amber-400/35 border border-amber-400/45 text-amber-200 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Cast className="w-4 h-4" />
                  <span>Conectar / Emparejar Smart TV</span>
                </button>
              )}
            </div>

            <div className="shrink-0 grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setParentModalOpen(false)}
                className="h-10 rounded-xl bg-sky-400 text-black font-display font-extrabold text-xs cursor-pointer"
              >
                Guardar y volver
              </button>
              <button
                type="button"
                onClick={() => {
                  setParentModalOpen(false);
                  onExitKids();
                }}
                className="h-10 rounded-xl bg-rose-500/25 border border-rose-400/50 text-rose-100 font-display font-extrabold text-xs cursor-pointer"
              >
                Salir de Kids
              </button>
            </div>
          </div>
        </div>
      )}
      {wizardOpen && (
        <KidsStepWizard
          shellLang={shellLang}
          currentProgress={progress}
          onCompleteWizard={(updated) => {
            updateActiveProgress((prev) => ({ ...prev, ...updated }));
          }}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
};
