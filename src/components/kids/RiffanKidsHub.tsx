import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Cake,
  Cast,
  Check,
  CheckCircle2,
  Clock,
  Delete,
  Download,
  Film,
  Gamepad2,
  Gift,
  Globe,
  Home,
  KeyRound,
  Link2,
  Lock,
  Moon,
  Music,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Users,
  Volume2,
  VolumeX,
  Wand2,
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
import kidsWorldCinemaImg from '../../assets/images/kids_world_cinema_1794940117384.jpg';
import kidsWorldLanguagesImg from '../../assets/images/kids_world_languages_1794940117132.jpg';
import kidsWorldGamesImg from '../../assets/images/kids_world_games_1794940117589.jpg';
import kidsMascotFennecImg from '../../assets/images/kids_mascot_fennec_1794940117205.jpg';
import {
  createFreshDailyMissions,
  DEFAULT_PARENT_SAFE_SEEDS,
  getKidsLevelInfo,
  isDailyMissionChestReady,
  isValidKidsExitPin,
  KIDS_AVATAR_CHOICES,
  KIDS_BADGES,
  KIDS_EXIT_PIN,
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
import { KidsGamesHub } from './KidsGamesHub';
import { KidsLanguagesStudio } from './KidsLanguagesStudio';
import { KidsPetWorldModal } from './KidsPetWorldModal';
import { KidsDiplomaModal } from './KidsDiplomaModal';
import { KidsStoryStudio } from './KidsStoryStudio';
import { KidsFamilyOnboardingModal } from './KidsFamilyOnboardingModal';
import { KidsApkModal } from './KidsApkModal';
import { KidsApkInstallCard } from './KidsApkInstallCard';
import {
  KidsAnimatedCategoryIcon,
  KidsAnimatedMascotSvg,
  KidsAvatarArtworkSvg,
  KidsBadgeIcon,
  KidsUniqueNameAvatarSvg,
} from './KidsSvgArt';
import { KidsStepWizard } from './KidsStepWizard';
import { speakKidsText } from './kidsTtsHelper';

export { KIDS_EXIT_PIN, isValidKidsExitPin };

interface RiffanKidsHubProps {
  shellLang: AppLanguage;
  exitPromptSeq?: number;
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
  exitPromptSeq = 0,
  onOpenSmartTv,
  onExitKids,
}) => {
  const profilesStore = useKidsStore((s) => s.profilesStore);
  const ux = useKidsStore((s) => s.ux);
  const parentPin = useKidsStore((s) => s.parentPin);
  const getActiveProfile = useKidsStore((s) => s.getActiveProfile);
  const getAgeAdaptation = useKidsStore((s) => s.getAgeAdaptation);
  const verifyParentPin = useKidsStore((s) => s.verifyParentPin);
  const changeParentPin = useKidsStore((s) => s.changeParentPin);
  const resetDefaultPin = useKidsStore((s) => s.resetDefaultPin);
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
  const toggleDyslexiaFont = useKidsStore((s) => s.toggleDyslexiaFont);
  const toggleSyllableHighlight = useKidsStore((s) => s.toggleSyllableHighlight);
  const toggleTortoiseSpeech = useKidsStore((s) => s.toggleTortoiseSpeech);
  const setBedtimeMode = useKidsStore((s) => s.setBedtimeMode);
  const tickActiveMinute = useKidsStore((s) => s.tickActiveMinute);

  const progress = useMemo(() => getActiveProfile(), [profilesStore, getActiveProfile]);
  const ageAdaptation = useMemo(() => getAgeAdaptation(), [progress.ageGroup, getAgeAdaptation]);
  const t = useMemo(() => getKidsUiCopy(progress.preferredLang), [progress.preferredLang]);
  const dir = useMemo(() => getKidsDir(progress.preferredLang), [progress.preferredLang]);

  const [activeTab, setActiveTab] = useState<KidsHubTab>('portal');
  const [isTvActive] = useState<boolean>(() => isGoogleTvEnvironment());
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

  // On-device PIN customization form state inside Parent Panel
  const [curPinInput, setCurPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinChangeNotice, setPinChangeNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  const [albumModalOpen, setAlbumModalOpen] = useState<boolean>(false);
  const [petWorldOpen, setPetWorldOpen] = useState<boolean>(false);
  const [diplomaOpen, setDiplomaOpen] = useState<boolean>(false);
  const [storyStudioOpen, setStoryStudioOpen] = useState<boolean>(false);
  const [wizardOpen, setWizardOpen] = useState<boolean>(false);
  const [familyOnboardingOpen, setFamilyOnboardingOpen] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('riffan_kids_family_setup_done') !== 'true';
  });
  const [apkModalOpen, setApkModalOpen] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [parentModalOpen, setParentModalOpen] = useState<boolean>(false);
  const [ytImportUrl, setYtImportUrl] = useState<string>('');
  const [ytImportStatus, setYtImportStatus] = useState<string>('');
  const [ytImportLoading, setYtImportLoading] = useState<boolean>(false);
  const [starToast, setStarToast] = useState<string | null>(null);
  const [celebrationBurst, setCelebrationBurst] = useState<boolean>(false);
  const [confettiActive, setConfettiActive] = useState<boolean>(false);
  const [remainingMins, setRemainingMins] = useState<number | null>(null);

  const bedtimeMode = ux.bedtimeMode;
  const [lullabyPlaying, setLullabyPlaying] = useState<boolean>(false);
  const lullabyIntervalRef = useRef<number | null>(null);

  const [newSiblingName, setNewSiblingName] = useState('');
  const [newSiblingAvatar, setNewSiblingAvatar] = useState<string>(KIDS_AVATAR_CHOICES[0]);
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
      if (storyStudioOpen) {
        setStoryStudioOpen(false);
        return true;
      }
      if (petWorldOpen) {
        setPetWorldOpen(false);
        return true;
      }
      if (diplomaOpen) {
        setDiplomaOpen(false);
        return true;
      }
      if (familyOnboardingOpen) {
        setFamilyOnboardingOpen(false);
        return true;
      }
      if (apkModalOpen) {
        setApkModalOpen(false);
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
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (isTvActive && typeof document !== 'undefined') {
      document.documentElement.classList.add('tv-dpad-active', 'is-google-tv');
    }
  }, [isTvActive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        tickActiveMinute();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [tickActiveMinute]);

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
      if (verifyParentPin(next)) {
        triggerHaptic('success');
        setPinModalOpen(false);
        setPinDigits('');
        if (pinIntent === 'parent_settings') {
          setPinChangeNotice(null);
          setCurPinInput('');
          setNewPinInput('');
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
    triggerToast(`+${deltaStars} ${t.starsAvailableSuffix}`);
  };

  const handleClaimChest = (): boolean => {
    const ok = claimDailyChestAction();
    if (ok) {
      playKidsSound('chest', ux.soundEnabled, true);
      setConfettiActive(true);
      triggerToast(`+10 ${t.starsAvailableSuffix}`);
    }
    return ok;
  };

  const handlePickMascot = (mascot: KidsMascotMeta) => {
    const ok = pickMascotAction(mascot);
    if (ok) {
      playKidsSound('success', ux.soundEnabled, true);
      setConfettiActive(true);
      triggerToast(mascot.name);
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
      triggerToast(itemMeta ? itemMeta.title : t.shopOwned);
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

  const handleSaveCustomPin = (e: React.FormEvent) => {
    e.preventDefault();
    const res = changeParentPin(curPinInput, newPinInput);
    if (res.ok) {
      playKidsSound('success', ux.soundEnabled, true);
      setPinChangeNotice({ ok: true, msg: t.pinSavedMsg });
      setCurPinInput('');
      setNewPinInput('');
    } else {
      playKidsSound('error', ux.soundEnabled, true);
      setPinChangeNotice({ ok: false, msg: t.pinInvalidMsg });
    }
  };

  const parentCandidatePool = useMemo(() => {
    const map = new Map<string, CatalogMovie>();
    for (const m of [
      ...(progress.recentWatched || []),
      ...(progress.parentPrefs?.approvedItems || []),
      ...DEFAULT_PARENT_SAFE_SEEDS,
    ]) {
      if (m.platform === 'YouTube Kids' && !map.has(m.id)) {
        map.set(m.id, m);
      }
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
      className={`relative flex-1 min-h-0 h-full flex flex-col gap-2.5 sm:gap-3 p-2.5 sm:p-4 landscape:p-2.5 landscape:gap-2 overflow-hidden select-none bg-gradient-to-b from-[#111936] via-[#0D132B] to-[#080C1C] ${
        ux.dyslexiaFont ? 'tracking-wide leading-relaxed' : ''
      }`}
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
          className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-[240] px-5 py-2 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950 font-display font-black text-sm shadow-xl flex items-center gap-2 animate-bounce motion-reduce:animate-none"
        >
          <Star className="w-4 h-4 fill-slate-950 shrink-0" />
          <span>{starToast}</span>
        </div>
      )}

      {/* CLEAN SINGLE-ROW HEADER (No outer box clutter, fits 320px+ mobile with zero clipping) */}
      <header className="shrink-0 relative z-[225] flex items-center justify-between gap-2 px-1 sm:px-2 py-1 landscape:py-0.5 pt-safe border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab === 'portal' ? (
            <KidsSquishButton
              onClick={() => setAlbumModalOpen(true)}
              ariaLabel={`${t.albumTitlePrefix} ${progress.name || 'Peque'}`}
              title={`${t.albumTitlePrefix} ${progress.name || 'Peque'}`}
              className="!min-w-0 !min-h-[42px] h-10 sm:h-11 flex items-center gap-2 px-2 sm:px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 shrink-0"
            >
              <div className="relative w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center">
                <KidsUniqueNameAvatarSvg
                  name={progress.name || 'Peque'}
                  fallbackAvatarId={progress.avatarEmoji || 'fennec'}
                  size={30}
                />
                {chestReady && (
                  <span className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#0D132B]" />
                )}
              </div>
              <div className="text-start flex items-center gap-1.5">
                <span className="hidden sm:inline text-xs sm:text-sm font-bold text-white max-w-[90px] truncate">
                  {progress.name || 'Peque'}
                </span>
                <span className="flex items-center gap-1 text-xs font-black text-amber-300 tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300 shrink-0" />
                  <span>{progress.stars}</span>
                </span>
              </div>
            </KidsSquishButton>
          ) : (
            <KidsSquishButton
              onClick={() => setActiveTab('portal')}
              className="!min-w-0 !min-h-[42px] h-10 sm:h-11 flex items-center gap-1.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-md shrink-0"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{t.backToHome}</span>
            </KidsSquishButton>
          )}

          {/* Sibling Quick-Switcher: 1 tap to switch brother/sister with ZERO menus! */}
          {activeTab === 'portal' && profilesStore.profiles.length > 1 && (
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0">
              {profilesStore.profiles.map((p) => {
                const isCurrent = p.id === progress.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-tv-focusable="true"
                    onClick={() => {
                      if (p.id) handleSwitchSibling(p.id);
                    }}
                    className={`h-9 px-2 sm:px-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-amber-400 text-slate-950 font-black shadow-md ring-2 ring-amber-300'
                        : 'bg-white/5 hover:bg-white/15 text-zinc-200'
                    }`}
                    title={`Cambiar a ${p.name || 'Hermano'}`}
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center">
                      <KidsUniqueNameAvatarSvg
                        name={p.name || 'Peque'}
                        fallbackAvatarId={p.avatarEmoji || 'fennec'}
                        size={20}
                      />
                    </div>
                    <span className="text-[11px] font-black max-w-[55px] sm:max-w-[70px] truncate">
                      {p.name || 'Peque'}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                data-tv-focusable="true"
                onClick={() => setFamilyOnboardingOpen(true)}
                title="Configurar peques de la familia"
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'portal' && profilesStore.profiles.length === 1 && (
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => setFamilyOnboardingOpen(true)}
              title="Añadir hermanos (+ Hermanos)"
              className="hidden sm:flex h-9 px-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-amber-300 text-xs font-bold items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-[11px]">+ Hermanos</span>
            </button>
          )}

          {/* Brand / Active Section Title */}
          {activeTab === 'portal' ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-display font-black text-base sm:text-xl tracking-tight bg-gradient-to-r from-amber-300 via-pink-300 to-sky-300 bg-clip-text text-transparent truncate">
                Riffan Kids
              </span>
              {isTvActive && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-600 font-bold text-white shrink-0">
                  TV
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 text-white font-display font-black text-sm sm:text-base">
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

        {/* Right Quick Controls — exact budget for 320px+ screens */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {remainingMins !== null && (
            <div className="hidden lg:flex h-10 px-2.5 rounded-xl bg-indigo-500/20 border border-indigo-300/30 items-center gap-1 text-xs font-black text-indigo-100 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>{remainingMins}m</span>
            </div>
          )}

          {onOpenSmartTv && (
            <KidsSquishButton
              onClick={() => openPinModal('cast_tv')}
              ariaLabel={t.connectSmartTv}
              title={t.connectSmartTv}
              className={`hidden sm:flex !min-w-[42px] !min-h-[42px] h-10 sm:h-11 px-2.5 rounded-xl border items-center justify-center gap-1.5 ${
                isTvActive
                  ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                  : 'bg-white/[0.07] hover:bg-white/[0.13] text-zinc-200 border-white/10'
              }`}
            >
              <Tv className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="hidden xl:inline text-xs font-black">TV</span>
            </KidsSquishButton>
          )}

          <KidsSquishButton
            onClick={() => setApkModalOpen(true)}
            ariaLabel="Descargar APK para Google TV y Móvil"
            title="Descargar APK para Google TV y Móvil"
            className="!min-w-[42px] !min-h-[42px] h-10 sm:h-11 px-2 sm:px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-200 flex items-center justify-center gap-1.5 shrink-0"
          >
            <Download className="w-4 h-4 text-sky-300 shrink-0" />
            <span className="hidden xl:inline text-xs font-black">APK</span>
          </KidsSquishButton>

          <KidsSquishButton
            onClick={() => {
              if (progress.parentPrefs?.lockedLang) return;
              setLangModalOpen(true);
            }}
            ariaLabel={t.chooseLanguageTitle}
            title={t.chooseLanguageTitle}
            className={`!min-w-[42px] !min-h-[42px] h-10 sm:h-11 px-2 sm:px-2.5 rounded-xl border flex items-center justify-center gap-1.5 ${
              progress.parentPrefs?.lockedLang
                ? 'bg-white/[0.04] text-zinc-400 border-white/10 cursor-not-allowed'
                : 'bg-white/[0.07] hover:bg-white/[0.13] text-white border-white/10'
            }`}
          >
            <FlagBadgeSvg
              code={(KIDS_LANGUAGES.find((l) => l.code === progress.preferredLang) || KIDS_LANGUAGES[0]).flagCode}
              className="w-5 h-3.5 shadow-sm shrink-0"
            />
            <span className="hidden md:inline text-xs font-black uppercase">
              {progress.preferredLang}
            </span>
          </KidsSquishButton>

          <KidsSquishButton
            onClick={toggleSound}
            ariaLabel={ux.soundEnabled ? t.soundOn : t.soundOff}
            title={ux.soundEnabled ? t.soundOn : t.soundOff}
            className={`!min-w-[42px] !min-h-[42px] h-10 sm:h-11 w-10 sm:w-11 rounded-xl border flex items-center justify-center ${
              ux.soundEnabled
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                : 'bg-white/[0.07] text-zinc-400 border-white/10'
            }`}
          >
            {ux.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </KidsSquishButton>

          <KidsSquishButton
            onClick={() => openPinModal('parent_settings')}
            ariaLabel={t.parentsBtn}
            title={t.parentsBtn}
            className="!min-w-[42px] !min-h-[42px] h-10 sm:h-11 w-10 sm:w-auto sm:px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-xs sm:text-sm font-black text-zinc-100 flex items-center justify-center gap-1.5"
          >
            <Lock className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">{t.parentsBtn}</span>
          </KidsSquishButton>
        </div>
      </header>

      {/* BODY WRAPPER: Horizontal Landscape Navigation Rail + Main Screen */}
      <div className="flex-1 min-h-0 flex flex-row gap-2.5 overflow-hidden">
        {/* Compact Left Navigation Rail visible on Horizontal Mobile Landscape in Sub-Tabs */}
        {activeTab !== 'portal' && (
          <nav
            aria-label="Riffan Kids Rail"
            className="hidden landscape:flex md:landscape:hidden shrink-0 w-14 flex-col items-center justify-between py-2 px-1 rounded-2xl bg-[#121835]/95 border border-white/10"
          >
            <button
              type="button"
              onClick={() => setActiveTab('portal')}
              aria-label={t.backToHome}
              className="w-11 h-11 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 flex items-center justify-center cursor-pointer"
            >
              <Home className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('cinema')}
                aria-label={t.navCinema}
                className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer ${
                  activeTab === 'cinema' ? 'bg-amber-400 text-slate-950' : 'text-zinc-300 bg-white/5'
                }`}
              >
                <Film className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('fun')}
                aria-label={t.navFun}
                className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer ${
                  activeTab === 'fun' ? 'bg-pink-500 text-white' : 'text-zinc-300 bg-white/5'
                }`}
              >
                <Gamepad2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('learn')}
                aria-label={t.navLearn}
                className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer ${
                  activeTab === 'learn' ? 'bg-sky-400 text-slate-950' : 'text-zinc-300 bg-white/5'
                }`}
              >
                <Globe className="w-5 h-5" />
              </button>
            </div>
            <div className="w-9 h-9 flex items-center justify-center">
              <KidsAnimatedMascotSvg id={activeMascot.id} size={30} />
            </div>
          </nav>
        )}

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* SCREEN 1: PORTAL HOME WITH 3 CORE PILLARS */}
          {activeTab === 'portal' && (
            <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-3 overflow-hidden px-0.5 py-1 justify-between">
              {/* Unboxed Mascot Greeting Strip — no duplicate star number, no truncated prose */}
              <div className="shrink-0 flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl overflow-hidden border border-amber-300/45 bg-[#141B3B] shrink-0 shadow-md">
                    {activeMascot.id === 'fox' ? (
                      <img
                        src={kidsMascotFennecImg}
                        alt={activeMascot.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <KidsAnimatedMascotSvg id={activeMascot.id} size={44} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-display font-black text-lg sm:text-3xl text-white leading-tight truncate">
                      {t.portalWelcome.replace('{name}', progress.name || 'Peque')}
                    </h1>
                    <p className="text-xs sm:text-sm text-sky-200/80 font-semibold truncate">
                      {progress.ageGroup} {t.yearsLabel} · {t.levelLabel} {levelInfo.level} · {activeMascot.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
                  <KidsSquishButton
                    onClick={() => {
                      playKidsSound('tap', ux.soundEnabled, true);
                      setStoryStudioOpen(true);
                    }}
                    className="!min-h-[40px] h-10 px-2.5 sm:px-3.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/40 text-indigo-100 font-black text-xs sm:text-sm flex items-center gap-1.5"
                  >
                    <BookOpen className="w-4 h-4 text-indigo-300 shrink-0" />
                    <span className="whitespace-nowrap">Cuentos IA</span>
                  </KidsSquishButton>

                  <KidsSquishButton
                    onClick={() => {
                      playKidsSound('tap', ux.soundEnabled, true);
                      setPetWorldOpen(true);
                    }}
                    className="!min-h-[40px] h-10 px-2.5 sm:px-3.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 font-black text-xs sm:text-sm flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                    <span className="whitespace-nowrap">Mi Mundo</span>
                  </KidsSquishButton>

                  {chestReady ? (
                    <KidsSquishButton
                      onClick={handleClaimChest}
                      className="!min-h-[40px] h-10 px-3 sm:px-4 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg flex items-center gap-1.5"
                    >
                      <Gift className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">{t.openChestReward}</span>
                    </KidsSquishButton>
                  ) : (
                    <KidsSquishButton
                      onClick={() => setAlbumModalOpen(true)}
                      className="!min-h-[40px] h-10 px-2.5 sm:px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4 text-amber-300 shrink-0" />
                      <span className="hidden sm:inline whitespace-nowrap">{t.portalRewardsBtn}</span>
                    </KidsSquishButton>
                  )}
                </div>
              </div>

              {/* The 3 Core Illustrated Worlds — all 3 cleanly fit in Portrait, Horizontal Landscape, Tablet & Google TV with ZERO scroll */}
              <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-3 md:grid-cols-3 md:grid-rows-1 landscape:grid-cols-3 landscape:grid-rows-1 gap-2 sm:gap-3">
                {/* 1. CINE KIDS */}
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('medium');
                    playKidsSound('tap', ux.soundEnabled, true);
                    setActiveTab('cinema');
                  }}
                  className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-300/40 hover:border-amber-300 bg-gradient-to-br from-amber-950/60 to-[#0B1028] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] focus-visible:scale-[1.02] focus-visible:ring-4 focus-visible:ring-amber-300 min-h-0 h-full outline-none"
                >
                  <img
                    src={kidsWorldCinemaImg}
                    alt={t.navCinema}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/55 to-transparent" />

                  <div className="relative z-10 p-3 sm:p-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-amber-300">
                        YouTube Kids · {progress.preferredLang.toUpperCase()}
                      </div>
                      <h2 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                        {t.navCinema}
                      </h2>
                      <p className="text-xs font-medium text-sky-100/85 line-clamp-1 mt-0.5">
                        {t.portalCinemaDesc}
                      </p>
                    </div>
                    <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                    </span>
                  </div>
                </button>

                {/* 2. 4 JUEGOS */}
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('medium');
                    playKidsSound('tap', ux.soundEnabled, true);
                    setActiveTab('fun');
                  }}
                  className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-pink-300/40 hover:border-pink-300 bg-gradient-to-br from-pink-950/60 to-[#0B1028] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] focus-visible:scale-[1.02] focus-visible:ring-4 focus-visible:ring-pink-300 min-h-0 h-full outline-none"
                >
                  <img
                    src={kidsWorldGamesImg}
                    alt={t.navFun}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/55 to-transparent" />

                  <div className="relative z-10 p-3 sm:p-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-pink-300">
                        Arcade · Mates · Memoria · Música
                      </div>
                      <h2 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                        {t.navFun}
                      </h2>
                      <p className="text-xs font-medium text-pink-100/85 line-clamp-1 mt-0.5">
                        {t.portalFunDesc}
                      </p>
                    </div>
                    <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-pink-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                    </span>
                  </div>
                </button>

                {/* 3. IDIOMAS CON TARIFIT */}
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('medium');
                    playKidsSound('tap', ux.soundEnabled, true);
                    setActiveTab('learn');
                  }}
                  className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-sky-300/40 hover:border-sky-300 bg-gradient-to-br from-sky-950/60 to-[#0B1028] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] focus-visible:scale-[1.02] focus-visible:ring-4 focus-visible:ring-sky-300 min-h-0 h-full outline-none"
                >
                  <img
                    src={kidsWorldLanguagesImg}
                    alt={t.navLearn}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/55 to-transparent" />

                  <div className="relative z-10 p-3 sm:p-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-sky-300">
                        ES · EN · FR · AR · RIF +3
                      </div>
                      <h2 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                        {t.navLearn}
                      </h2>
                      <p className="text-xs font-medium text-sky-100/85 line-clamp-1 mt-0.5">
                        {t.portalLearnDesc}
                      </p>
                    </div>
                    <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 2: YOUTUBE KIDS CINEMA */}
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

          {/* SCREEN 3: 4 POLISHED GAMES */}
          {activeTab === 'fun' && (
            <KidsGamesHub
              kidsLang={progress.preferredLang}
              ageGroup={progress.ageGroup}
              profileId={progress.id || 'kid-1'}
              unlockedRewards={progress.unlockedRewards}
              onEarnStar={handleEarnStar}
              onMissionPlay={() => trackMissionAction('play')}
              onBackToPortal={() => setActiveTab('portal')}
            />
          )}

          {/* SCREEN 4: IDIOMAS CON TARIFIT STUDIO */}
          {activeTab === 'learn' && (
            <KidsLanguagesStudio
              kidsLang={progress.preferredLang}
              ageGroup={progress.ageGroup}
              onChangeLang={handleSelectKidsLang}
              onEarnStar={handleEarnStar}
              onMissionLearn={() => trackMissionAction('learn')}
              onBackToPortal={() => setActiveTab('portal')}
            />
          )}
        </main>
      </div>

      {/* STANDALONE KID-SAFE YOUTUBE KIDS PLAYER */}
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

      {/* 8-LANGUAGE SELECTOR MODAL */}
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
                    data-tv-focusable="true"
                    onClick={() => {
                      handleSelectKidsLang(item.code);
                      void speakKidsText(item.greeting, item.code, {
                        ageGroup: progress.ageGroup,
                      });
                      setLangModalOpen(false);
                    }}
                    className={`min-h-[54px] px-3.5 py-2.5 rounded-2xl border-2 border-b-4 flex items-center gap-3 cursor-pointer transition-transform active:scale-95 ${
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

      {/* SCREEN-TIME REST OVERLAY */}
      {isTimeUp && !pinModalOpen && !parentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          className="fixed inset-0 z-[255] bg-[#0B0F22]/95 backdrop-blur-lg flex items-center justify-center p-5 text-center"
        >
          <div className="w-full max-w-sm rounded-3xl bg-[#161F42] border-2 border-amber-400/40 p-6 space-y-4 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/20 border border-indigo-300/35 flex items-center justify-center">
              <Moon className="w-9 h-9 text-amber-300" />
            </div>
            <h2 className="font-display font-extrabold text-2xl text-white">
              {t.timeUpTitle}
            </h2>
            <p className="text-sm text-sky-100/80">
              {t.timeUpBody} ({progress.stars} {t.starsAvailableSuffix})
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

      {/* PROFILE, DAILY CHEST, MASCOTS, REWARD SHOP & BADGES MODAL (ZERO EMOJIS) */}
      {albumModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          className="fixed inset-0 z-[258] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg max-h-[90dvh] rounded-3xl bg-[#141B38] border-2 border-amber-400/40 p-4 sm:p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <KidsUniqueNameAvatarSvg
                  name={progress.name || 'Peque 1'}
                  fallbackAvatarId={progress.avatarEmoji || 'fennec'}
                  size={48}
                />
                <KidsAnimatedMascotSvg id={activeMascot.id} size={42} />
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-base sm:text-lg text-white truncate">
                    {t.albumTitlePrefix} {progress.name || 'Peque 1'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums">
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="w-3.5 h-3.5 fill-amber-300" />
                      {progress.stars} {t.starsAvailableSuffix}
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

            {/* Explorer XP Bar */}
            <div className="shrink-0 px-3 py-2 rounded-2xl bg-[#0F152D] border border-sky-400/25 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-sky-200">
                <span className="inline-flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-amber-300" />
                  {t.levelLabel} {levelInfo.level} · {rankLabel}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
                  {levelInfo.starsIntoLevel}/{levelInfo.starsForNextLevel} ({levelInfo.progressPct}%)
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-pink-400 to-sky-400 transition-all duration-300"
                  style={{ width: `${levelInfo.progressPct}%` }}
                />
              </div>
            </div>

            {/* Quick Controls */}
            <div className="shrink-0 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={cycleMobileAgeGroup}
                className="h-9 px-3 rounded-xl bg-[#1C264E] border border-sky-400/30 text-xs font-black text-sky-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Cake className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {progress.ageGroup} {t.yearsLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlbumModalOpen(false);
                  setWizardOpen(true);
                }}
                className="h-9 px-3 rounded-xl bg-[#1C264E] border border-amber-400/35 text-xs font-black text-amber-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{t.stepWizardShort}</span>
              </button>
              <button
                type="button"
                onClick={toggleLowStimulation}
                className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                  ux.lowStimulation
                    ? 'bg-teal-500/30 border-teal-300 text-teal-100'
                    : 'bg-[#1C264E] border-white/10 text-teal-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t.calmMode}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !bedtimeMode;
                  setBedtimeMode(next);
                  if (!next) setLullabyPlaying(false);
                }}
                className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                  bedtimeMode
                    ? 'bg-indigo-500 border-indigo-300 text-white'
                    : 'bg-[#1C264E] border-white/10 text-indigo-200'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{t.bedtimeMode}</span>
              </button>
              {bedtimeMode && (
                <button
                  type="button"
                  onClick={() => setLullabyPlaying((v) => !v)}
                  className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                    lullabyPlaying
                      ? 'bg-amber-400 border-amber-200 text-black'
                      : 'bg-[#1C264E] border-white/10 text-amber-200'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>{t.lullabyLabel}</span>
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pe-1">
              {/* Daily Missions */}
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#1B254D] to-[#151D3D] border border-amber-400/30 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5" /> {t.dailyMissionsTitle}
                  </h3>
                  {dailyMissions.chestClaimed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t.chestOpenedToday}
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

              {/* Profiles on this Device */}
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
                            fallbackAvatarId={prof.avatarEmoji || 'fennec'}
                            size={24}
                          />
                          <span>{prof.name}</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300 tabular-nums">
                            {prof.stars}
                            <Star className="w-2.5 h-2.5 fill-amber-300" />
                          </span>
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
                        className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border ${
                          newSiblingAvatar === av
                            ? 'bg-amber-400/30 border-amber-300'
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <KidsAvatarArtworkSvg avatarId={av} size={22} />
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
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" /> {t.chooseMascotTitle}
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
                        <KidsAnimatedMascotSvg id={m.id} size={36} />
                        <span className="text-[11px] font-bold">{m.name}</span>
                        <span className="text-[10px] font-extrabold text-amber-300 tabular-nums">
                          {selected ? t.mascotActive : owned ? t.mascotUse : `${m.costStars}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reward Shop */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-pink-200 flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" /> {t.rewardShopTitle}
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
                          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-amber-300">
                            <KidsBadgeIcon iconId={item.iconId} className="w-5 h-5" />
                          </div>
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
                            `${item.cost}`
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Badges */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> {t.badgesTitle} ({progress.badges.length}/{KIDS_BADGES.length})
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {KIDS_BADGES.map((b) => {
                    const earned = progress.badges.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 ${
                          earned
                            ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                            : 'bg-black/25 border-white/5 text-zinc-500 opacity-45 grayscale'
                        }`}
                      >
                        <KidsBadgeIcon iconId={b.iconId} className="w-5 h-5" />
                        <span className="text-[10px] font-bold leading-tight truncate w-full text-white">
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

      {/* ON-DEVICE CUSTOMIZABLE PIN GATE MODAL */}
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
                  <Lock className="w-5 h-5" />
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
                  ? pendingCastMovie.title
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

            <div dir="ltr" className="grid grid-cols-3 gap-2.5">
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

      {/* LOCAL PARENTAL CONTROL PANEL (WITH CUSTOMIZABLE ON-DEVICE PIN) */}
      {parentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={dir}
          className="fixed inset-0 z-[265] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg max-h-[90dvh] rounded-3xl bg-[#141B38] border-2 border-sky-400/40 p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
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
              {/* Custom On-Device Parent PIN Manager */}
              <form
                onSubmit={handleSaveCustomPin}
                className="p-3 rounded-2xl bg-[#0D1226] border border-amber-400/30 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-200">
                    <KeyRound className="w-4 h-4" />
                    <span>{t.pinChangeTitle}</span>
                  </div>
                  {parentPin !== KIDS_EXIT_PIN && (
                    <button
                      type="button"
                      onClick={() => {
                        resetDefaultPin();
                        setPinChangeNotice({ ok: true, msg: t.pinResetDefaultBtn });
                      }}
                      className="text-[11px] font-bold text-sky-300 hover:underline cursor-pointer"
                    >
                      {t.pinResetDefaultBtn}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={curPinInput}
                    onChange={(e) => setCurPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder={t.pinCurrentLabel}
                    className="h-10 px-3 rounded-xl bg-[#161F42] border border-white/15 text-xs font-bold text-white outline-none"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder={t.pinNewLabel}
                    className="h-10 px-3 rounded-xl bg-[#161F42] border border-white/15 text-xs font-bold text-white outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  {pinChangeNotice ? (
                    <span
                      className={`text-[11px] font-bold ${
                        pinChangeNotice.ok ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {pinChangeNotice.msg}
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">PIN: ****</span>
                  )}
                  <button
                    type="submit"
                    className="h-9 px-3.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                  >
                    {t.pinSaveBtn}
                  </button>
                </div>
              </form>

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

              {/* Screen Timer */}
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

              {/* Audio & Sensory Ergonomics */}
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
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {t.calmMode}: {ux.lowStimulation ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Approved-only YouTube Kids List */}
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

                {/* Paste & Verify YouTube URL */}
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-sky-200">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Añadir enlace seguro de YouTube Kids</span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={ytImportUrl}
                      onChange={(e) => setYtImportUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="flex-1 h-9 px-2.5 rounded-lg bg-[#161F42] border border-white/15 text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      disabled={ytImportLoading || !ytImportUrl.trim()}
                      onClick={async () => {
                        setYtImportLoading(true);
                        setYtImportStatus('');
                        try {
                          const r = await fetch('/api/kids/youtube-resolve', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: ytImportUrl, lang: progress.preferredLang }),
                          });
                          const data = await r.json();
                          if (data?.ok && data.item) {
                            const cur = progress.parentPrefs?.approvedItems || [];
                            updateParentPrefs({
                              approvedItems: [data.item, ...cur.filter((m) => m.id !== data.item.id)],
                            });
                            setYtImportUrl('');
                            setYtImportStatus(`Añadido: ${data.item.title}`);
                          } else {
                            setYtImportStatus(data?.error || 'No se pudo verificar este enlace.');
                          }
                        } catch {
                          setYtImportStatus('Error de conexión al verificar el enlace.');
                        } finally {
                          setYtImportLoading(false);
                        }
                      }}
                      className="h-9 px-3 rounded-lg bg-sky-400 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-45 shrink-0"
                    >
                      {ytImportLoading ? '...' : 'Verificar'}
                    </button>
                  </div>
                  {ytImportStatus && (
                    <p className="text-[11px] font-bold text-amber-200">{ytImportStatus}</p>
                  )}
                </div>
              </div>

              {/* Earn-Cinema-By-Learning & Dyslexia/Tortoise Accessibility */}
              <div className="space-y-2 p-3 rounded-2xl bg-[#0D1226] border border-indigo-400/25">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-white">Gana Cine Aprendiendo</div>
                    <div className="text-[11px] text-zinc-400">
                      Banco actual: {progress.parentPrefs?.earnedCinemaMinutes ?? 15} min (+2 min/acierto)
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateParentPrefs({
                          earnedCinemaMinutes: (progress.parentPrefs?.earnedCinemaMinutes ?? 15) + 10,
                        })
                      }
                      className="h-8 px-2.5 rounded-lg bg-amber-400/20 text-amber-200 text-[11px] font-black cursor-pointer"
                    >
                      +10m
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateParentPrefs({
                          earnCinemaByLearning: !progress.parentPrefs?.earnCinemaByLearning,
                        })
                      }
                      className={`h-8 px-3 rounded-lg text-xs font-black cursor-pointer border ${
                        progress.parentPrefs?.earnCinemaByLearning
                          ? 'bg-emerald-400 text-black border-emerald-200'
                          : 'bg-white/10 text-zinc-200 border-white/15'
                      }`}
                    >
                      {progress.parentPrefs?.earnCinemaByLearning ? t.onLabel : t.offLabel}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={toggleDyslexiaFont}
                    className={`h-9 px-2 rounded-lg text-[11px] font-black border cursor-pointer ${
                      ux.dyslexiaFont
                        ? 'bg-indigo-400 text-slate-950 border-indigo-200'
                        : 'bg-white/5 text-zinc-300 border-white/10'
                    }`}
                  >
                    Lectura Dislexia: {ux.dyslexiaFont ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleSyllableHighlight}
                    className={`h-9 px-2 rounded-lg text-[11px] font-black border cursor-pointer ${
                      ux.syllableHighlight
                        ? 'bg-indigo-400 text-slate-950 border-indigo-200'
                        : 'bg-white/5 text-zinc-300 border-white/10'
                    }`}
                  >
                    Sílabas: {ux.syllableHighlight ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleTortoiseSpeech}
                    className={`h-9 px-2 rounded-lg text-[11px] font-black border cursor-pointer ${
                      ux.tortoiseSpeech
                        ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                        : 'bg-white/5 text-zinc-300 border-white/10'
                    }`}
                  >
                    Voz Tortuga: {ux.tortoiseSpeech ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Progreso Real & Family Export */}
              <div className="space-y-2.5 p-3 rounded-2xl bg-[#0D1226] border border-emerald-400/25">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-300">
                    <BarChart3 className="w-4 h-4" />
                    <span>Progreso Educativo de Hoy</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const an = progress.analytics;
                      const pct = (c: number, tot: number) => (tot > 0 ? `${Math.round((c / tot) * 100)}%` : 'Sin datos');
                      const summary = [
                        `RIFFAN KIDS - RESUMEN FAMILIAR (${new Date().toISOString().slice(0, 10)})`,
                        `Perfil: ${progress.name || 'Peque'} (${progress.ageGroup} años)`,
                        `Estrellas totales: ${progress.stars} | Racha: ${progress.streakDays} días`,
                        `Aprendizaje hoy: ${an?.learnMinutesToday ?? 0} min | Cine hoy: ${an?.cinemaMinutesToday ?? 0} min`,
                        `Precisión Idiomas: ${pct(an?.domainCorrect.lang ?? 0, an?.domainTotal.lang ?? 0)}`,
                        `Precisión Mates: ${pct(an?.domainCorrect.math ?? 0, an?.domainTotal.math ?? 0)}`,
                        `Precisión Música: ${pct(an?.domainCorrect.music ?? 0, an?.domainTotal.music ?? 0)}`,
                        `Precisión Lógica: ${pct(an?.domainCorrect.logic ?? 0, an?.domainTotal.logic ?? 0)}`,
                        `Palabras practicadas hoy: ${(an?.practicedWords || []).join(', ') || 'Ninguna aún'}`,
                      ].join('\n');
                      const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `resumen-riffan-kids-${(progress.name || 'peque').toLowerCase()}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                    className="h-8 px-2.5 rounded-lg bg-emerald-400/20 hover:bg-emerald-400/35 text-emerald-200 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar (.txt)</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <div className="p-2 rounded-xl bg-white/5 text-emerald-200 tabular-nums">
                    Aprendizaje hoy: {progress.analytics?.learnMinutesToday ?? 0} min
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 text-amber-200 tabular-nums">
                    Cine hoy: {progress.analytics?.cinemaMinutesToday ?? 0} min
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-black">
                  {(
                    [
                      { key: 'lang', label: 'Idiomas', bar: 'bg-sky-400' },
                      { key: 'math', label: 'Mates', bar: 'bg-amber-400' },
                      { key: 'music', label: 'Música', bar: 'bg-emerald-400' },
                      { key: 'logic', label: 'Lógica', bar: 'bg-pink-400' },
                    ] as const
                  ).map((d) => {
                    const ok = progress.analytics?.domainCorrect[d.key] ?? 0;
                    const tot = progress.analytics?.domainTotal[d.key] ?? 0;
                    const pct = tot > 0 ? Math.round((ok / tot) * 100) : 0;
                    return (
                      <div key={d.key} className="space-y-1">
                        <div className="flex justify-between text-sky-100">
                          <span>{d.label}</span>
                          <span className="tabular-nums">{tot > 0 ? `${pct}%` : '—'}</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full ${d.bar} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] font-bold text-amber-200 bg-amber-400/10 border border-amber-300/25 rounded-xl px-2.5 py-2">
                  Consejo de hoy: practicad en la mesa las palabras &ldquo;Aman&rdquo; (agua) y &ldquo;Aɣrum&rdquo; (pan) en voz alta.
                </div>
              </div>

              <KidsApkInstallCard />

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

              <button
                type="button"
                onClick={() => {
                  setParentModalOpen(false);
                  setFamilyOnboardingOpen(true);
                }}
                className="w-full h-11 rounded-xl bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/40 text-purple-200 text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <Users className="w-4 h-4 text-purple-300" />
                <span>Configurar Hermanos y Familia (Nombres, Edades y Avatares)</span>
              </button>
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

      <KidsPetWorldModal
        open={petWorldOpen}
        onClose={() => setPetWorldOpen(false)}
        kidsLang={progress.preferredLang}
        onClaimChest={handleClaimChest}
        onOpenDiploma={() => setDiplomaOpen(true)}
      />

      <KidsStoryStudio
        open={storyStudioOpen}
        onClose={() => setStoryStudioOpen(false)}
        kidsLang={progress.preferredLang}
        ageGroup={progress.ageGroup}
        onEarnStar={handleEarnStar}
      />

      <KidsDiplomaModal
        open={diplomaOpen}
        onClose={() => setDiplomaOpen(false)}
        kidsLang={progress.preferredLang}
      />

      <KidsFamilyOnboardingModal
        open={familyOnboardingOpen}
        onClose={() => setFamilyOnboardingOpen(false)}
      />

      <KidsApkModal
        open={apkModalOpen}
        onClose={() => setApkModalOpen(false)}
      />
    </div>
  );
};
