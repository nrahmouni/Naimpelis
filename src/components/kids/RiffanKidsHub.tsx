import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Cast,
  Check,
  Clock,
  Delete,
  Download,
  Gift,
  Home,
  Lock,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  KidsAgeGroup,
  KidsLanguageCode,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { isGoogleTvEnvironment, useTvSpatialRemote } from '../../utils/tvSpatialNav';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  createFreshDailyMissions,
  DEFAULT_PARENT_SAFE_SEEDS,
  getKidsLevelInfo,
  isDailyMissionChestReady,
  KIDS_AVATAR_CHOICES,
  KIDS_BADGES,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  KIDS_SHOP_ITEMS,
  type KidsMascotMeta,
  type KidsProgressState,
} from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsCinemaTab } from './KidsCinemaTab';
import { KidsIndependentPlayer } from './KidsIndependentPlayer';
import { KidsFunGames } from './KidsFunGames';
import { KidsLearningGames } from './KidsLearningGames';
import {
  KidsAnimatedCategoryIcon,
  KidsAnimatedMascotSvg,
  KidsUniqueNameAvatarSvg,
} from './KidsSvgArt';
import { KidsStepWizard } from './KidsStepWizard';
import { speakKidsText } from './kidsTtsHelper';

export const KIDS_EXIT_PIN = '1122';

export function isValidKidsExitPin(pin: string): boolean {
  return pin.trim() === KIDS_EXIT_PIN;
}

interface RiffanKidsHubProps {
  shellLang: AppLanguage;
  familyUid?: string | null;
  exitPromptSeq?: number;
  onPlayMovie: (movie: CatalogMovie, preferLang: string) => void;
  onPlaySeries: (series: CatalogMovie, preferLang: string) => void;
  onOpenSmartTv?: () => void;
  onExitKids: () => void;
}

type KidsHubTab = 'portal' | 'cinema' | 'fun' | 'learn';
type PinActionIntent = 'exit' | 'parent_settings' | 'cast_tv';

const AGE_GROUPS: Array<{ id: KidsAgeGroup; label: string }> = [
  { id: '3-5', label: '3–5' },
  { id: '6-8', label: '6–8' },
  { id: '9-12', label: '9–12' },
];

export const RiffanKidsHub: React.FC<RiffanKidsHubProps> = ({
  shellLang,
  familyUid = null,
  exitPromptSeq = 0,
  onPlayMovie,
  onPlaySeries,
  onOpenSmartTv,
  onExitKids,
}) => {
  const profilesStore = useKidsStore((s) => s.profilesStore);
  const ux = useKidsStore((s) => s.ux);
  const getActiveProfile = useKidsStore((s) => s.getActiveProfile);
  const getAgeAdaptation = useKidsStore((s) => s.getAgeAdaptation);
  const bindFamilyAccount = useKidsStore((s) => s.bindFamilyAccount);
  const updateActiveProgress = useKidsStore((s) => s.updateActiveProfile);
  const createProfileAction = useKidsStore((s) => s.createProfile);
  const switchProfileAction = useKidsStore((s) => s.switchProfile);
  const deleteProfileAction = useKidsStore((s) => s.deleteProfile);
  const selectLanguageAction = useKidsStore((s) => s.selectLanguage);
  const awardStarsAction = useKidsStore((s) => s.awardStars);
  const recordWatchedAction = useKidsStore((s) => s.recordWatched);
  const trackMissionAction = useKidsStore((s) => s.trackMission);
  const claimDailyChestAction = useKidsStore((s) => s.claimDailyChest);
  const pickMascotAction = useKidsStore((s) => s.pickMascot);
  const unlockRewardAction = useKidsStore((s) => s.unlockReward);
  const updateParentPrefsAction = useKidsStore((s) => s.updateParentPrefs);
  const toggleSound = useKidsStore((s) => s.toggleSound);
  const toggleLowStimulation = useKidsStore((s) => s.toggleLowStimulation);
  const setBedtimeMode = useKidsStore((s) => s.setBedtimeMode);
  const tickActiveMinute = useKidsStore((s) => s.tickActiveMinute);

  const progress = useMemo(() => getActiveProfile(), [profilesStore, getActiveProfile]);
  const ageAdaptation = useMemo(() => getAgeAdaptation(), [progress.ageGroup, getAgeAdaptation]);
  const t = useMemo(() => getKidsUiCopy(progress.preferredLang), [progress.preferredLang]);
  const dir = useMemo(() => getKidsDir(progress.preferredLang), [progress.preferredLang]);

  useEffect(() => {
    bindFamilyAccount(familyUid || null);
  }, [familyUid, bindFamilyAccount]);

  const [activeTab, setActiveTab] = useState<KidsHubTab>('portal');
  const [isTvActive, setIsTvActive] = useState<boolean>(() => isGoogleTvEnvironment());
  const [funResetSeq, setFunResetSeq] = useState(0);
  const [learnResetSeq, setLearnResetSeq] = useState(0);
  const [activePlayback, setActivePlayback] = useState<{
    item: CatalogMovie;
    queue: CatalogMovie[];
  } | null>(null);
  const [langModalOpen, setLangModalOpen] = useState<boolean>(false);

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
  const [confettiActive, setConfettiActive] = useState<boolean>(false);
  const [remainingMins, setRemainingMins] = useState<number | null>(null);

  const bedtimeMode = ux.bedtimeMode;
  const [lullabyPlaying, setLullabyPlaying] = useState<boolean>(false);
  const lullabyIntervalRef = useRef<number | null>(null);

  const [newSiblingName, setNewSiblingName] = useState('');
  const [newSiblingAvatar, setNewSiblingAvatar] = useState(KIDS_AVATAR_CHOICES[0]);
  const [newSiblingAge, setNewSiblingAge] = useState<KidsAgeGroup>('6-8');

  const activeMascot =
    KIDS_MASCOTS.find((m) => m.id === progress.mascotId) || KIDS_MASCOTS[0];
  const dailyMissions = progress.dailyMissions || createFreshDailyMissions();
  const chestReady = isDailyMissionChestReady(progress);
  const levelInfo = useMemo(() => getKidsLevelInfo(progress.stars), [progress.stars]);
  const rankLabel =
    levelInfo.rankKey === 'superGenius'
      ? t.rankSuperGenius
      : levelInfo.rankKey === 'starMaster'
      ? t.rankStarMaster
      : levelInfo.rankKey === 'adventurer'
      ? t.rankAdventurer
      : t.rankExplorer;

  // Google TV & Smart TV remote control navigation (D-Pad, Back, Select)
  useTvSpatialRemote({
    onBackStep: () => {
      if (activePlayback) {
        setActivePlayback(null);
        return true;
      }
      if (langModalOpen) {
        setLangModalOpen(false);
        return true;
      }
      if (pinModalOpen) {
        setPinModalOpen(false);
        return true;
      }
      if (parentModalOpen) {
        setParentModalOpen(false);
        return true;
      }
      if (albumModalOpen) {
        setAlbumModalOpen(false);
        return true;
      }
      if (wizardOpen) {
        setWizardOpen(false);
        return true;
      }
      if (activeTab !== 'portal') {
        setActiveTab('portal');
        return true;
      }
      openPinModal('exit');
      return true;
    },
  });

  useEffect(() => {
    if (isTvActive && typeof document !== 'undefined') {
      document.documentElement.classList.add('tv-dpad-active', 'is-google-tv');
    }
  }, [isTvActive]);

  // Active-only usage timer (pauses automatically when app is backgrounded)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        tickActiveMinute();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [tickActiveMinute]);

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
            recordWatchedAction(pendingCastMovie);
          }
          setPendingCastMovie(null);
          onOpenSmartTv?.();
        } else {
          onExitKids();
        }
      } else {
        playKidsSound('error', ux.soundEnabled, true);
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
    playKidsSound('tap', ux.soundEnabled, true);
    selectLanguageAction(nextLang);
  };

  const handleSelectAgeGroup = (nextAge: KidsAgeGroup) => {
    if (progress.parentPrefs?.lockedAge && progress.parentPrefs.lockedAge !== nextAge) {
      return;
    }
    playKidsSound('tap', ux.soundEnabled, true);
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
    playKidsSound('star', ux.soundEnabled, true);
    awardStarsAction(deltaStars, badgeId);
    triggerToast(`+${deltaStars} ⭐`);
  };

  const handleClaimChest = () => {
    const ok = claimDailyChestAction();
    if (ok) {
      playKidsSound('chest', ux.soundEnabled, true);
      setConfettiActive(true);
      triggerToast('+10 ⭐');
    }
  };

  const handlePickMascot = (mascot: KidsMascotMeta) => {
    const ok = pickMascotAction(mascot);
    if (ok) {
      playKidsSound('success', ux.soundEnabled, true);
      setConfettiActive(true);
      triggerToast(`${mascot.emoji} ${mascot.name}`);
    } else {
      playKidsSound('error', ux.soundEnabled, true);
      triggerToast(t.shopNeedStars);
    }
  };

  const handleUnlockShopItem = (rewardId: string, cost: number) => {
    const ok = unlockRewardAction(rewardId, cost);
    if (ok) {
      playKidsSound('success', ux.soundEnabled, true);
      setConfettiActive(true);
      const itemMeta = KIDS_SHOP_ITEMS.find((i) => i.id === rewardId);
      triggerToast(itemMeta ? `${itemMeta.emoji} ${itemMeta.title}` : '🎁 +1');
    } else {
      playKidsSound('error', ux.soundEnabled, true);
      triggerToast(t.shopNeedStars);
    }
  };

  const handleCreateSibling = (e: React.FormEvent) => {
    e.preventDefault();
    playKidsSound('success', ux.soundEnabled, true);
    createProfileAction(newSiblingName, newSiblingAvatar, newSiblingAge);
    setNewSiblingName('');
  };

  const handleSwitchSibling = (profileId: string) => {
    playKidsSound('tap', ux.soundEnabled, true);
    switchProfileAction(profileId);
  };

  const handleDeleteSibling = (profileId: string) => {
    playKidsSound('error', ux.soundEnabled, true);
    deleteProfileAction(profileId);
  };

  const updateParentPrefs = (patch: Partial<KidsProgressState['parentPrefs']>) => {
    triggerHaptic('light');
    updateParentPrefsAction(patch);
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
    <div
      data-world="kids"
      data-age-group={progress.ageGroup}
      data-kids-calm={ux.lowStimulation ? 'true' : 'false'}
      data-kids-bedtime={bedtimeMode ? 'true' : 'false'}
      dir={dir}
      lang={progress.preferredLang}
      className="relative flex-1 min-h-0 h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden select-none bg-gradient-to-b from-[#131B3A] via-[#0F152E] to-[#0B0F21]"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {bedtimeMode && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[220] bg-amber-950/35 backdrop-saturate-[0.75] transition-opacity duration-300"
        />
      )}

      {celebrationBurst && starToast && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-[240] px-5 py-2 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 text-black font-display font-black text-sm shadow-xl flex items-center gap-2 animate-bounce motion-reduce:animate-none"
        >
          <span>{activeMascot.emoji}</span>
          <span>{starToast}</span>
        </div>
      )}

      {/* STREAMLINED CHILD HEADER */}
      <div className="shrink-0 relative z-[225] flex items-center justify-between gap-2 rounded-3xl bg-[#141B3B]/95 border-2 border-[#293870] px-2.5 sm:px-4 py-2 shadow-xl backdrop-blur-md">
        {/* Left: either Home/Back button or Kid Profile */}
        {activeTab === 'portal' ? (
          <KidsSquishButton
            onClick={() => setAlbumModalOpen(true)}
            data-tv-focusable="true"
            ariaLabel={`${t.albumTitlePrefix} ${progress.name || 'Peque'}`}
            title={`${t.albumTitlePrefix} ${progress.name || 'Peque'}`}
            className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3.5 rounded-2xl bg-[#1C264E] hover:bg-[#253265] border-2 border-b-4 border-[#33427D] shrink-0"
          >
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center">
              <KidsUniqueNameAvatarSvg
                name={progress.name || 'Peque'}
                fallbackEmoji={progress.avatarEmoji || activeMascot.emoji}
                size={34}
              />
              {chestReady && (
                <span className="absolute -top-1 -end-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white animate-ping" />
              )}
            </div>
            <div className="text-start">
              <div className="hidden xs:block sm:block text-xs sm:text-sm font-black text-white leading-tight max-w-[70px] sm:max-w-[100px] truncate">
                {progress.name || 'Peque'}
              </div>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-black text-amber-300 tabular-nums">
                <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                <span>{progress.stars}</span>
              </div>
            </div>
          </KidsSquishButton>
        ) : (
          <KidsSquishButton
            onClick={() => setActiveTab('portal')}
            data-tv-focusable="true"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm border-b-4 border-amber-600 shadow-md shrink-0"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">{t.backToHome}</span>
            <span className="sm:hidden text-xs">{t.backToHome}</span>
          </KidsSquishButton>
        )}

        {/* Center: Title / Active World indicator */}
        <div className="flex items-center gap-2 min-w-0">
          {activeTab === 'portal' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-white font-display font-black text-xs sm:text-base tracking-wide truncate">
              <span>🎈</span>
              <span className="bg-gradient-to-r from-amber-300 via-pink-300 to-sky-300 bg-clip-text text-transparent truncate">
                Riffan Kids
              </span>
              {isTvActive && (
                <span className="hidden sm:inline-block ms-1 px-1.5 py-0.5 rounded text-[10px] bg-red-600 font-bold text-white">
                  TV
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-white font-display font-black text-xs sm:text-sm truncate">
              <KidsAnimatedCategoryIcon
                name={activeTab === 'cinema' ? 'cinema' : activeTab === 'fun' ? 'fun' : 'learn'}
                size={18}
              />
              <span className="truncate">
                {activeTab === 'cinema' ? t.navCinema : activeTab === 'fun' ? t.navFun : t.navLearn}
              </span>
            </div>
          )}
        </div>

        {/* Right: 4 Quick Utility Buttons (TV, Flag, Sound, Parent Gate) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {remainingMins !== null && (
            <div className="hidden lg:flex h-10 px-2.5 rounded-2xl bg-indigo-500/25 border border-indigo-300/35 items-center gap-1 text-xs font-black text-indigo-100 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>{remainingMins}m</span>
            </div>
          )}

          {/* TV Mode / Cast */}
          <KidsSquishButton
            onClick={() => openPinModal('cast_tv')}
            data-tv-focusable="true"
            ariaLabel={t.connectSmartTv}
            title={t.connectSmartTv}
            className={`h-10 sm:h-11 px-2 sm:px-3 rounded-2xl border-2 border-b-4 flex items-center justify-center gap-1 ${
              isTvActive
                ? 'bg-rose-500/25 text-rose-300 border-rose-400/50'
                : 'bg-[#1C254D] hover:bg-[#253163] text-zinc-300 border-[#303E73]'
            }`}
          >
            <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
            <span className="hidden xl:inline text-xs font-black">TV</span>
          </KidsSquishButton>

          {/* Language Flag */}
          <KidsSquishButton
            onClick={() => {
              if (progress.parentPrefs?.lockedLang) return;
              setLangModalOpen(true);
            }}
            data-tv-focusable="true"
            ariaLabel={t.chooseLanguageTitle}
            title={t.chooseLanguageTitle}
            className={`h-10 sm:h-11 px-2 sm:px-3 rounded-2xl border-2 border-b-4 flex items-center gap-1.5 ${
              progress.parentPrefs?.lockedLang
                ? 'bg-[#151D3D] text-zinc-400 border-[#28366B] cursor-not-allowed'
                : 'bg-[#1C254D] hover:bg-[#253163] text-white border-[#303E73]'
            }`}
          >
            <FlagBadgeSvg
              code={(KIDS_LANGUAGES.find((l) => l.code === progress.preferredLang) || KIDS_LANGUAGES[0]).flagCode}
              className="w-5 h-3.5 sm:w-6 sm:h-4 shadow-sm shrink-0"
            />
            <span className="hidden md:inline text-xs font-black uppercase">
              {progress.preferredLang}
            </span>
          </KidsSquishButton>

          {/* Sound Mute / Unmute */}
          <KidsSquishButton
            onClick={toggleSound}
            data-tv-focusable="true"
            ariaLabel={ux.soundEnabled ? t.soundOn : t.soundOff}
            title={ux.soundEnabled ? t.soundOn : t.soundOff}
            className={`w-9 sm:w-11 h-10 sm:h-11 rounded-2xl border-2 border-b-4 flex items-center justify-center ${
              ux.soundEnabled
                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                : 'bg-[#1C254D] text-zinc-400 border-[#303E73]'
            }`}
          >
            {ux.soundEnabled ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />}
          </KidsSquishButton>

          {/* Parent Lock Gate */}
          <KidsSquishButton
            onClick={() => openPinModal('parent_settings')}
            data-tv-focusable="true"
            className="h-10 sm:h-11 px-2 sm:px-3 rounded-2xl bg-[#171F3F] hover:bg-rose-500/25 border-2 border-b-4 border-rose-500/50 text-xs sm:text-sm font-black text-zinc-100 flex items-center gap-1.5"
            title={t.parentsBtn}
          >
            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 shrink-0" />
            <span className="hidden sm:inline">{t.parentsBtn}</span>
          </KidsSquishButton>
        </div>
      </div>

      {/* MULTI-SCREEN WORKSPACE */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* SCREEN 1: PORTAL / HOME SCREEN */}
        {activeTab === 'portal' && (
          <div className="flex-1 min-h-0 flex flex-col gap-3 sm:gap-4 overflow-y-auto no-scrollbar p-1 pb-4">
            {/* Friendly Mascot Welcome Banner */}
            <div className="shrink-0 rounded-3xl bg-gradient-to-r from-[#17224D] via-[#1D2A5E] to-[#17224D] border-2 border-amber-400/35 p-3.5 sm:p-5 shadow-xl flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="text-4xl sm:text-5xl shrink-0 animate-bounce motion-reduce:animate-none">
                  {activeMascot.emoji}
                </div>
                <div className="min-w-0">
                  <h1 className="font-display font-black text-lg sm:text-2xl text-white truncate">
                    {t.portalWelcome.replace('{name}', progress.name || 'Peque')}
                  </h1>
                  <p className="text-xs sm:text-sm text-sky-200/90 font-medium line-clamp-1">
                    {t.portalSubtitle}
                  </p>
                </div>
              </div>

              {/* Daily Chest or Mascot Action */}
              <div className="shrink-0 flex items-center gap-2">
                {chestReady ? (
                  <KidsSquishButton
                    onClick={handleClaimChest}
                    data-tv-focusable="true"
                    className="px-3 sm:px-4 py-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-black text-xs sm:text-sm border-b-4 border-amber-700 shadow-lg animate-pulse"
                  >
                    🎁 {t.openChestReward}
                  </KidsSquishButton>
                ) : (
                  <KidsSquishButton
                    onClick={() => setAlbumModalOpen(true)}
                    data-tv-focusable="true"
                    className="px-3 sm:px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm border-b-4 border-black/30"
                  >
                    ⭐ {progress.stars} {t.starsAvailableSuffix}
                  </KidsSquishButton>
                )}
              </div>
            </div>

            {/* The 3 Giant World Cards (Stacked in portrait, 3 columns in landscape/TV) */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 landscape:grid-cols-3 gap-3 sm:gap-5 min-h-0">
              {/* 1. Cinema & TV World */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  playKidsSound('tap', ux.soundEnabled, true);
                  setActiveTab('cinema');
                }}
                data-tv-focusable="true"
                className="group relative rounded-3xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-slate-950 border-4 border-amber-300 shadow-[0_8px_24px_rgba(245,158,11,0.35)] p-4 sm:p-6 flex flex-col justify-between items-start text-start cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 focus:scale-105 focus:ring-4 focus:ring-amber-300 min-h-[140px] sm:min-h-[180px]"
              >
                <div className="w-full flex items-center justify-between">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/25 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                    <KidsAnimatedCategoryIcon name="cinema" size={40} />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-950/20 text-slate-950 font-black text-[11px] sm:text-xs uppercase tracking-wider">
                    YouTube Kids & TV
                  </span>
                </div>
                <div className="my-2 sm:my-3">
                  <div className="font-display font-black text-xl sm:text-3xl text-slate-950 leading-tight">
                    {t.navCinema}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900/80 mt-1 line-clamp-2">
                    {t.portalCinemaDesc}
                  </p>
                </div>
                <div className="w-full flex items-center justify-between pt-2 border-t border-slate-950/15">
                  <span className="font-display font-black text-xs sm:text-sm uppercase tracking-wide">
                    {t.portalEnterBtn} →
                  </span>
                  <span className="text-xl">🎬</span>
                </div>
              </button>

              {/* 2. Fun Games World */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  playKidsSound('tap', ux.soundEnabled, true);
                  setFunResetSeq((s) => s + 1);
                  setActiveTab('fun');
                }}
                data-tv-focusable="true"
                className="group relative rounded-3xl bg-gradient-to-br from-pink-400 via-pink-500 to-rose-500 text-white border-4 border-pink-300 shadow-[0_8px_24px_rgba(236,72,153,0.35)] p-4 sm:p-6 flex flex-col justify-between items-start text-start cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 focus:scale-105 focus:ring-4 focus:ring-pink-300 min-h-[140px] sm:min-h-[180px]"
              >
                <div className="w-full flex items-center justify-between">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/25 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                    <KidsAnimatedCategoryIcon name="fun" size={40} />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white/20 text-white font-black text-[11px] sm:text-xs uppercase tracking-wider">
                    Minijuegos
                  </span>
                </div>
                <div className="my-2 sm:my-3">
                  <div className="font-display font-black text-xl sm:text-3xl text-white leading-tight">
                    {t.navFun}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-pink-100/90 mt-1 line-clamp-2">
                    {t.portalFunDesc}
                  </p>
                </div>
                <div className="w-full flex items-center justify-between pt-2 border-t border-white/20">
                  <span className="font-display font-black text-xs sm:text-sm uppercase tracking-wide">
                    {t.portalEnterBtn} →
                  </span>
                  <span className="text-xl">🎮</span>
                </div>
              </button>

              {/* 3. Learning World */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  playKidsSound('tap', ux.soundEnabled, true);
                  setLearnResetSeq((s) => s + 1);
                  setActiveTab('learn');
                }}
                data-tv-focusable="true"
                className="group relative rounded-3xl bg-gradient-to-br from-sky-400 via-cyan-500 to-teal-500 text-slate-950 border-4 border-sky-300 shadow-[0_8px_24px_rgba(14,165,233,0.35)] p-4 sm:p-6 flex flex-col justify-between items-start text-start cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 focus:scale-105 focus:ring-4 focus:ring-sky-300 min-h-[140px] sm:min-h-[180px]"
              >
                <div className="w-full flex items-center justify-between">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/25 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                    <KidsAnimatedCategoryIcon name="learn" size={40} />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-950/20 text-slate-950 font-black text-[11px] sm:text-xs uppercase tracking-wider">
                    Aprender
                  </span>
                </div>
                <div className="my-2 sm:my-3">
                  <div className="font-display font-black text-xl sm:text-3xl text-slate-950 leading-tight">
                    {t.navLearn}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900/80 mt-1 line-clamp-2">
                    {t.portalLearnDesc}
                  </p>
                </div>
                <div className="w-full flex items-center justify-between pt-2 border-t border-slate-950/15">
                  <span className="font-display font-black text-xs sm:text-sm uppercase tracking-wide">
                    {t.portalEnterBtn} →
                  </span>
                  <span className="text-xl">🎓</span>
                </div>
              </button>
            </div>

            {/* Mascot and Album Quick Access Footer Banner */}
            <div className="shrink-0 rounded-2xl bg-[#141B3B]/90 border border-white/10 p-3 sm:p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{activeMascot.emoji}</span>
                <div>
                  <div className="text-xs sm:text-sm font-black text-white">
                    {t.albumTitlePrefix} {progress.name || 'Peque'} · {rankLabel}
                  </div>
                  <div className="text-[11px] sm:text-xs text-sky-200/70">
                    {progress.stars} ⭐ {t.starsAvailableSuffix} · {progress.unlockedRewards?.length || 0} {t.shopOwned}
                  </div>
                </div>
              </div>

              <KidsSquishButton
                onClick={() => setAlbumModalOpen(true)}
                data-tv-focusable="true"
                className="px-3.5 sm:px-4 py-2 rounded-xl bg-[#202B59] hover:bg-[#2A3973] border-b-2 border-[#101736] text-white text-xs sm:text-sm font-black flex items-center gap-1.5"
              >
                <Award className="w-4 h-4 text-amber-300" />
                <span>{t.portalRewardsBtn}</span>
              </KidsSquishButton>
            </div>
          </div>
        )}

        {/* SCREEN 2: 2-STEP CINEMA & TV (YOUTUBE KIDS + LIVE CHANNELS) */}
        {activeTab === 'cinema' && (
          <KidsCinemaTab
            shellLang={shellLang}
            kidsLang={progress.preferredLang}
            ageGroup={progress.ageGroup}
            recentWatched={progress.recentWatched || []}
            approvedOnlyMode={Boolean(progress.parentPrefs?.approvedOnlyMode)}
            approvedItems={progress.parentPrefs?.approvedItems || []}
            onPlayItem={(item, queuePool) => {
              recordWatchedAction(item);
              setActivePlayback({ item, queue: queuePool });
            }}
            onEarnStar={handleEarnStar}
            onBackToPortal={() => setActiveTab('portal')}
          />
        )}

        {/* SCREEN 3: FUN GAMES (STAR CATCHER, BUBBLES, PUZZLE, SIMON, DOODLE, PIANO) */}
        {activeTab === 'fun' && (
          <KidsFunGames
            shellLang={shellLang}
            kidsLang={progress.preferredLang}
            ageGroup={progress.ageGroup}
            unlockedRewards={progress.unlockedRewards}
            resetSeq={funResetSeq}
            onEarnStar={handleEarnStar}
            onMissionPlay={() => trackMissionAction('play')}
            onBackToPortal={() => setActiveTab('portal')}
          />
        )}

        {/* SCREEN 4: LEARNING & LANGUAGES (8-LANG VOCAB, MATH BUBBLES, STEAM, MEMORY, SCIENCE) */}
        {activeTab === 'learn' && (
          <KidsLearningGames
            shellLang={shellLang}
            kidsLang={progress.preferredLang}
            ageGroup={progress.ageGroup}
            lockedLang={progress.parentPrefs?.lockedLang}
            bedtimeMode={bedtimeMode}
            unlockedRewards={progress.unlockedRewards}
            resetSeq={learnResetSeq}
            onSelectKidsLang={handleSelectKidsLang}
            onEarnStar={handleEarnStar}
            onMissionLearn={() => trackMissionAction('learn')}
            onBackToPortal={() => setActiveTab('portal')}
          />
        )}
      </div>

      {/* MOBILE BOTTOM NAVIGATION DOCK (VISIBLE ON SUB-SCREENS FOR EASY SWITCHING) */}
      {activeTab !== 'portal' && (
        <div className="shrink-0 sm:hidden z-30 pt-1 pb-safe">
          <div className="flex items-center justify-around gap-1 px-2 py-1.5 rounded-2xl bg-[#121835]/95 border border-[#263568] backdrop-blur-md shadow-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('portal')}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-zinc-300 active:scale-95 text-[10px] font-bold"
            >
              <span className="text-base">🏠</span>
              <span>{t.backToHome}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cinema')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-black active:scale-95 ${
                activeTab === 'cinema'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-zinc-300'
              }`}
            >
              <span className="text-base">🎬</span>
              <span>{t.navCinema}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFunResetSeq((s) => s + 1);
                setActiveTab('fun');
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-black active:scale-95 ${
                activeTab === 'fun'
                  ? 'bg-pink-500 text-white shadow-md'
                  : 'text-zinc-300'
              }`}
            >
              <span className="text-base">🎮</span>
              <span>{t.navFun}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLearnResetSeq((s) => s + 1);
                setActiveTab('learn');
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-black active:scale-95 ${
                activeTab === 'learn'
                  ? 'bg-sky-400 text-slate-950 shadow-md'
                  : 'text-zinc-300'
              }`}
            >
              <span className="text-base">🎓</span>
              <span>{t.navLearn}</span>
            </button>
          </div>
        </div>
      )}

      {/* STANDALONE KID-STYLE INDEPENDENT PLAYER (YOUTUBE KIDS + LIVE TV CHANNELS) */}
      {activePlayback && (
        <KidsIndependentPlayer
          item={activePlayback.item}
          upNextItems={activePlayback.queue}
          onSelectItem={(nextItem) => {
            recordWatchedAction(nextItem);
            setActivePlayback((prev) => ({
              item: nextItem,
              queue: prev?.queue || [],
            }));
          }}
          onClose={() => setActivePlayback(null)}
        />
      )}

      {/* 1-TAP 8-LANGUAGE VISUAL PICKER MODAL */}
      {langModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          onClick={() => setLangModalOpen(false)}
          className="fixed inset-0 z-[257] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#141B38] border-2 border-amber-400/45 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-black text-xl text-white">
                {t.chooseLanguageTitle}
              </h2>
              <button
                type="button"
                onClick={() => setLangModalOpen(false)}
                aria-label="Close"
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {KIDS_LANGUAGES.map((item) => {
                const selected = item.code === progress.preferredLang;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      handleSelectKidsLang(item.code);
                      void speakKidsText(item.greeting, item.code, {
                        ageGroup: progress.ageGroup,
                      });
                      setLangModalOpen(false);
                    }}
                    className={`min-h-[56px] px-3.5 py-2.5 rounded-2xl border-2 border-b-4 flex items-center gap-3 cursor-pointer transition-transform active:scale-95 ${
                      selected
                        ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-700'
                        : 'bg-[#1B254D] hover:bg-[#243269] text-white border-[#0E142E]'
                    }`}
                  >
                    <FlagBadgeSvg code={item.flagCode} className="w-7 h-5 shadow-sm shrink-0" />
                    <span className="font-display font-black text-sm sm:text-base truncate">
                      {item.nativeLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SCREEN-TIME LOCK OVERLAY */}
      {isTimeUp && !pinModalOpen && !parentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          className="fixed inset-0 z-[255] bg-[#0B0F22]/95 backdrop-blur-lg flex items-center justify-center p-5 text-center"
        >
          <div className="w-full max-w-sm rounded-3xl bg-[#161F42] border-2 border-amber-400/40 p-6 space-y-4 shadow-2xl">
            <div className="text-5xl">🌙</div>
            <h2 className="font-display font-extrabold text-2xl text-white">
              {t.timeUpTitle}
            </h2>
            <p className="text-sm text-sky-100/80">
              {t.timeUpBody} ({progress.stars} ⭐)
            </p>
            <KidsSquishButton
              onClick={() => openPinModal('parent_settings')}
              className="w-full rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-black font-display font-black text-base"
            >
              {t.parentGateBtn}
            </KidsSquishButton>
          </div>
        </div>
      )}

      {/* STAR ALBUM, SIBLING PROFILES, DAILY CHEST & MASCOT SHOP MODAL */}
      {albumModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          className="fixed inset-0 z-[258] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg max-h-[88dvh] rounded-3xl bg-[#141B38] border-2 border-amber-400/40 p-4 sm:p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <KidsUniqueNameAvatarSvg
                  name={progress.name || 'Peque 1'}
                  fallbackEmoji={progress.avatarEmoji || activeMascot.emoji}
                  size={48}
                />
                <KidsAnimatedMascotSvg id={activeMascot.id} size={42} />
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-base sm:text-lg text-white truncate">
                    {t.albumTitlePrefix} {progress.name || 'Peque 1'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums">
                    <span className="text-amber-300">
                      {progress.stars} ⭐ {t.starsAvailableSuffix}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[11px]">
                      {t.levelLabel} {levelInfo.level} · {rankLabel}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAlbumModalOpen(false)}
                aria-label="Close"
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explorer XP Progress Bar */}
            <div className="shrink-0 px-3 py-2 rounded-2xl bg-[#0F152D] border border-sky-400/25 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-sky-200">
                <span>
                  🏅 {t.levelLabel} {levelInfo.level} · {rankLabel}
                </span>
                <span className="text-amber-300 tabular-nums">
                  {levelInfo.starsIntoLevel}/{levelInfo.starsForNextLevel} ⭐ ({levelInfo.progressPct}%)
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-pink-400 to-sky-400 transition-all duration-300"
                  style={{ width: `${levelInfo.progressPct}%` }}
                />
              </div>
            </div>

            {/* Quick Age, Wizard, Calm & Bedtime controls cleanly inside Mi Espacio */}
            <div className="shrink-0 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={cycleMobileAgeGroup}
                className="h-9 px-3 rounded-xl bg-[#1C264E] border border-sky-400/30 text-xs font-black text-sky-200 cursor-pointer"
              >
                🎂 {progress.ageGroup} {t.yearsLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlbumModalOpen(false);
                  setWizardOpen(true);
                }}
                className="h-9 px-3 rounded-xl bg-[#1C264E] border border-amber-400/35 text-xs font-black text-amber-200 cursor-pointer"
              >
                🪄 {t.stepWizardShort}
              </button>
              <button
                type="button"
                onClick={toggleLowStimulation}
                className={`h-9 px-3 rounded-xl border text-xs font-black cursor-pointer ${
                  ux.lowStimulation
                    ? 'bg-teal-500/30 border-teal-300 text-teal-100'
                    : 'bg-[#1C264E] border-white/10 text-teal-200'
                }`}
              >
                🫧 {t.calmMode}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !bedtimeMode;
                  setBedtimeMode(next);
                  if (!next) setLullabyPlaying(false);
                }}
                className={`h-9 px-3 rounded-xl border text-xs font-black cursor-pointer ${
                  bedtimeMode
                    ? 'bg-indigo-500 border-indigo-300 text-white'
                    : 'bg-[#1C264E] border-white/10 text-indigo-200'
                }`}
              >
                🌙 {t.bedtimeMode}
              </button>
              {bedtimeMode && (
                <button
                  type="button"
                  onClick={() => setLullabyPlaying((v) => !v)}
                  className={`h-9 px-3 rounded-xl border text-xs font-black cursor-pointer ${
                    lullabyPlaying
                      ? 'bg-amber-400 border-amber-200 text-black'
                      : 'bg-[#1C264E] border-white/10 text-amber-200'
                  }`}
                >
                  🎵 {t.lullabyLabel}
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pe-1">
              {/* Daily Missions & +10 Star Chest */}
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#1B254D] to-[#151D3D] border border-amber-400/30 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5" /> {t.dailyMissionsTitle}
                  </h3>
                  {dailyMissions.chestClaimed ? (
                    <span className="text-[11px] font-bold text-emerald-300">
                      ✅ {t.chestOpenedToday}
                    </span>
                  ) : chestReady ? (
                    <button
                      type="button"
                      onClick={handleClaimChest}
                      className="h-9 px-3 rounded-xl bg-amber-400 text-black text-xs font-black cursor-pointer animate-pulse"
                    >
                      {t.openChestReward}
                    </button>
                  ) : (
                    <span className="text-[11px] text-sky-200">{t.completeAllThree}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: t.missionWatch, done: dailyMissions.watch >= 1 },
                    { label: t.missionPlay, done: dailyMissions.play >= 1 },
                    { label: t.missionLearn, done: dailyMissions.learn >= 1 },
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
                      <div className="text-[10px] mt-0.5">{m.done ? t.missionDone : '0/1'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sibling Profiles Switcher + Creator */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {t.siblingsTitle} ({profilesStore.profiles.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profilesStore.profiles.map((prof) => {
                    const isCurrent = prof.id === progress.id;
                    return (
                      <div
                        key={prof.id}
                        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${
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
                          <KidsUniqueNameAvatarSvg
                            name={prof.name || 'Peque'}
                            fallbackEmoji={prof.avatarEmoji || '🦊'}
                            size={24}
                          />
                          <span>{prof.name}</span>
                          <span className="text-[10px] text-amber-300">{prof.stars}⭐</span>
                        </button>
                        {profilesStore.profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSibling(prof.id!)}
                            aria-label={`Delete ${prof.name}`}
                            className="ms-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
                        className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center cursor-pointer border ${
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
                    placeholder={t.siblingPlaceholder}
                    className="flex-1 min-w-[130px] h-9 px-2.5 rounded-lg bg-[#0B1024] border border-white/15 text-xs text-white outline-none"
                  />
                  <select
                    value={newSiblingAge}
                    onChange={(e) => setNewSiblingAge(e.target.value as KidsAgeGroup)}
                    aria-label={t.lockAgeLabel}
                    className="h-9 px-2 rounded-lg bg-[#0B1024] border border-white/15 text-xs text-white outline-none"
                  >
                    <option value="3-5">3–5</option>
                    <option value="6-8">6–8</option>
                    <option value="9-12">9–12</option>
                  </select>
                  <button
                    type="submit"
                    className="h-9 px-3 rounded-lg bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.createBtn}</span>
                  </button>
                </form>
              </div>

              {/* Mascots Picker */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
                  <span>🐾</span> {t.chooseMascotTitle}
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
                          {selected ? t.mascotActive : owned ? t.mascotUse : `${m.costStars} ⭐`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reward Shop */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-pink-200 flex items-center gap-1.5">
                  <span>🎁</span> {t.rewardShopTitle}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KIDS_SHOP_ITEMS.map((item) => {
                    const owned = (progress.unlockedRewards || []).includes(item.id);
                    const canAfford = progress.stars >= item.cost;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={owned}
                        onClick={() => handleUnlockShopItem(item.id, item.cost)}
                        className={`p-2.5 rounded-2xl border-2 text-start flex items-center justify-between gap-2 transition-all ${
                          owned
                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                            : canAfford
                            ? 'bg-[#1B2447] hover:bg-[#253161] border-amber-400/45 text-white cursor-pointer'
                            : 'bg-[#121833] border-white/10 text-zinc-400 opacity-75 cursor-pointer'
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
                          {owned ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <Check className="w-3.5 h-3.5" /> {t.shopOwned}
                            </span>
                          ) : (
                            `${t.shopGetBtn} · ${item.cost} ⭐`
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Earned Badges Grid */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> {t.badgesTitle} ({progress.badges.length}/{KIDS_BADGES.length})
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
          dir={dir}
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
                  ? t.pinParentTitle
                  : pinIntent === 'cast_tv'
                  ? t.pinCastTitle
                  : t.pinExitTitle}
              </h2>
              <p className="text-xs text-sky-200/75">
                {pinIntent === 'cast_tv' && pendingCastMovie
                  ? `«${pendingCastMovie.title}»`
                  : t.pinSubDefault}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0B1024] border border-white/10">
              <button
                type="button"
                onClick={() => setPinIntent('exit')}
                className={`h-8 rounded-lg text-[11px] font-bold cursor-pointer ${
                  pinIntent === 'exit' ? 'bg-amber-400 text-black' : 'text-zinc-300'
                }`}
              >
                {t.pinModeExit}
              </button>
              <button
                type="button"
                onClick={() => setPinIntent('parent_settings')}
                className={`h-8 rounded-lg text-[11px] font-bold cursor-pointer ${
                  pinIntent === 'parent_settings' ? 'bg-sky-400 text-black' : 'text-zinc-300'
                }`}
              >
                {t.pinModeParent}
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

            {pinError && <p className="text-xs font-bold text-rose-400">{t.pinWrong}</p>}

            <div dir="ltr" className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <KidsSquishButton
                  key={d}
                  onClick={() => handleDigitPress(d)}
                  className="rounded-2xl bg-[#1D264D] hover:bg-amber-400 hover:text-black border-b-4 border-[#0A0E1E] text-2xl font-display font-black text-white flex items-center justify-center"
                >
                  {d}
                </KidsSquishButton>
              ))}
              <KidsSquishButton
                onClick={() => setPinDigits('')}
                className="rounded-2xl bg-white/[0.08] text-lg font-bold text-zinc-200 border-b-4 border-black/30 flex items-center justify-center"
              >
                C
              </KidsSquishButton>
              <KidsSquishButton
                onClick={() => handleDigitPress('0')}
                className="rounded-2xl bg-[#1D264D] hover:bg-amber-400 hover:text-black border-b-4 border-[#0A0E1E] text-2xl font-display font-black text-white flex items-center justify-center"
              >
                0
              </KidsSquishButton>
              <KidsSquishButton
                onClick={() => setPinDigits((p) => p.slice(0, -1))}
                ariaLabel="Delete"
                className="rounded-2xl bg-white/[0.08] text-zinc-200 border-b-4 border-black/30 flex items-center justify-center"
              >
                <Delete className="w-6 h-6" />
              </KidsSquishButton>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <KidsSpeakButton text={t.pinSubDefault} lang={progress.preferredLang} />
              <KidsSquishButton
                onClick={() => setPinModalOpen(false)}
                className="flex-1 rounded-2xl bg-amber-400 hover:bg-amber-300 border-b-4 border-amber-600 text-black font-display font-extrabold text-base flex items-center justify-center"
              >
                {t.keepPlaying}
              </KidsSquishButton>
            </div>
          </div>
        </div>
      )}

      {/* PARENT SETTINGS PANEL (UNLOCKED BY PIN 1122) */}
      {parentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          className="fixed inset-0 z-[265] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg max-h-[88dvh] rounded-3xl bg-[#141B38] border-2 border-sky-400/40 p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-sky-400" />
                <h2 className="font-display font-extrabold text-lg text-white">
                  {t.parentPanelTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setParentModalOpen(false)}
                aria-label="Close"
                className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pe-1">
              {/* Lock Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-sky-200">{t.lockLangLabel}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateParentPrefs({ lockedLang: null })}
                    className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                      !progress.parentPrefs.lockedLang
                        ? 'bg-sky-400 text-black border-sky-200'
                        : 'bg-white/5 text-zinc-200 border-white/10'
                    }`}
                  >
                    {t.allFree}
                  </button>
                  {KIDS_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => updateParentPrefs({ lockedLang: l.code })}
                      className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
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
                <label className="text-xs font-bold text-sky-200">{t.lockAgeLabel}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateParentPrefs({ lockedAge: null })}
                    className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                      !progress.parentPrefs.lockedAge
                        ? 'bg-sky-400 text-black border-sky-200'
                        : 'bg-white/5 text-zinc-200 border-white/10'
                    }`}
                  >
                    {t.freeLabel}
                  </button>
                  {AGE_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => updateParentPrefs({ lockedAge: g.id })}
                      className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                        progress.parentPrefs.lockedAge === g.id
                          ? 'bg-amber-400 text-black border-amber-200'
                          : 'bg-white/5 text-zinc-200 border-white/10'
                      }`}
                    >
                      {g.label} {t.yearsLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Screen Time Limit & Active Usage */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-sky-200">{t.screenTimerLabel}</label>
                  <span className="text-[11px] font-bold text-emerald-300 tabular-nums">
                    {t.activeUsageLabel}: {ux.activeMinutesToday}m · {t.recommendedShort}{' '}
                    {ageAdaptation.recommendedSessionMinutes}m
                  </span>
                </div>
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
                      className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer border ${
                        progress.parentPrefs.timerMinutes === mins
                          ? 'bg-emerald-400 text-black border-emerald-200'
                          : 'bg-white/5 text-zinc-200 border-white/10'
                      }`}
                    >
                      {mins === null ? t.noLimit : `${mins} min`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sensory & Audio Ergonomics */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`h-10 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                    ux.soundEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                      : 'bg-white/5 border-white/10 text-zinc-300'
                  }`}
                >
                  {ux.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span>
                    {t.effectsToggle}: {ux.soundEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleLowStimulation}
                  className={`h-10 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                    ux.lowStimulation
                      ? 'bg-teal-500/25 border-teal-400/60 text-teal-100'
                      : 'bg-white/5 border-white/10 text-zinc-300'
                  }`}
                >
                  <span>🫧</span>
                  <span>
                    {t.calmMode}: {ux.lowStimulation ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Parent Curated Safe-Only Watchlist */}
              <div className="space-y-2 p-3 rounded-2xl bg-[#0D1226] border border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-white">{t.safeModeTitle}</div>
                    <div className="text-[11px] text-zinc-400">{t.safeModeDesc}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateParentPrefs({
                        approvedOnlyMode: !progress.parentPrefs?.approvedOnlyMode,
                      })
                    }
                    className={`h-9 px-3 rounded-xl text-xs font-black cursor-pointer border ${
                      progress.parentPrefs?.approvedOnlyMode
                        ? 'bg-emerald-400 text-black border-emerald-200'
                        : 'bg-white/10 text-zinc-200 border-white/15'
                    }`}
                  >
                    {progress.parentPrefs?.approvedOnlyMode ? t.onLabel : t.offLabel}
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
                        className={`h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
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

              {onOpenSmartTv && (
                <button
                  type="button"
                  onClick={() => {
                    setParentModalOpen(false);
                    onOpenSmartTv();
                  }}
                  className="w-full h-11 rounded-xl bg-amber-400/20 hover:bg-amber-400/35 border border-amber-400/45 text-amber-200 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Cast className="w-4 h-4" />
                  <span>{t.connectSmartTv}</span>
                </button>
              )}
            </div>

            <div className="shrink-0 grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setParentModalOpen(false)}
                className="h-11 rounded-xl bg-sky-400 text-black font-display font-extrabold text-xs cursor-pointer"
              >
                {t.saveAndBack}
              </button>
              <button
                type="button"
                onClick={() => {
                  setParentModalOpen(false);
                  onExitKids();
                }}
                className="h-11 rounded-xl bg-rose-500/25 border border-rose-400/50 text-rose-100 font-display font-extrabold text-xs cursor-pointer"
              >
                {t.exitKids}
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
