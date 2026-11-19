import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  KidsAgeGroup,
  KidsLanguageCode,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { isGoogleTvEnvironment, useTvSpatialRemote } from '../../utils/tvSpatialNav';
import {
  createFreshDailyMissions,
  DEFAULT_PARENT_SAFE_SEEDS,
  getKidsLevelInfo,
  isDailyMissionChestReady,
  isValidKidsExitPin,
  KIDS_AVATAR_CHOICES,
  KIDS_EXIT_PIN,
  KIDS_MASCOTS,
  KIDS_SHOP_ITEMS,
  type KidsMascotMeta,
  type KidsProgressState,
} from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsCinemaTab } from './KidsCinemaTab';
import { KidsIndependentPlayer } from './KidsIndependentPlayer';
import { KidsGamesHub } from './KidsGamesHub';
import { KidsLanguagesStudio } from './KidsLanguagesStudio';
import { type PinActionIntent } from './KidsPinGateModal';
import { KidsPortalScreen } from './KidsPortalScreen';
import { KidsHubHeader, KidsLandscapeNavRail, type KidsHubTab } from './KidsHubHeaderAndRail';
import { KidsHubModalsLayer } from './KidsHubModalsLayer';
import { useKidsHubEffects } from './useKidsHubEffects';

export { KIDS_EXIT_PIN, isValidKidsExitPin };

interface RiffanKidsHubProps {
  shellLang: AppLanguage;
  exitPromptSeq?: number;
  onOpenSmartTv?: () => void;
  onExitKids: () => void;
}

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

  const openPinModal = (intent: PinActionIntent = 'exit', movieForCast?: CatalogMovie) => {
    triggerHaptic('light');
    setPinIntent(intent);
    setPendingCastMovie(movieForCast || null);
    setPinDigits('');
    setPinError(false);
    setPinModalOpen(true);
  };

  useKidsHubEffects({
    isTvActive,
    bedtimeMode,
    lullabyPlaying,
    lullabyIntervalRef,
    exitPromptSeq,
    timerMinutes: progress.parentPrefs?.timerMinutes,
    timerStartedAt: progress.parentPrefs?.timerStartedAt,
    tickActiveMinute,
    setIsOffline,
    setRemainingMins,
    openPinModal,
  });

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

      <KidsHubHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        progress={progress}
        profilesStore={profilesStore}
        ux={ux}
        chestReady={chestReady}
        isTvActive={isTvActive}
        remainingMins={remainingMins}
        t={t}
        kidsLang={progress.preferredLang}
        onOpenAlbum={() => setAlbumModalOpen(true)}
        onOpenFamilyOnboarding={() => setFamilyOnboardingOpen(true)}
        onSwitchSibling={handleSwitchSibling}
        onOpenPinModal={(intent) => openPinModal(intent)}
        onOpenApkModal={() => setApkModalOpen(true)}
        onOpenLangModal={() => setLangModalOpen(true)}
        onToggleSound={toggleSound}
        onOpenSmartTv={onOpenSmartTv}
      />

      {/* BODY WRAPPER: Horizontal Landscape Navigation Rail + Main Screen */}
      <div className="flex-1 min-h-0 flex flex-row gap-2.5 overflow-hidden">
        <KidsLandscapeNavRail
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeMascot={activeMascot}
          t={t}
        />

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* SCREEN 1: PORTAL HOME WITH 3 CORE PILLARS */}
          {activeTab === 'portal' && (
            <KidsPortalScreen
              t={t}
              progress={progress}
              ux={ux}
              activeMascot={activeMascot}
              levelInfo={levelInfo}
              chestReady={chestReady}
              onOpenStoryStudio={() => setStoryStudioOpen(true)}
              onOpenPetWorld={() => setPetWorldOpen(true)}
              onOpenAlbum={() => setAlbumModalOpen(true)}
              onClaimChest={handleClaimChest}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
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

      <KidsHubModalsLayer
        shellLang={shellLang}
        dir={dir}
        t={t}
        progress={progress}
        profilesStore={profilesStore}
        ux={ux}
        ageGroups={AGE_GROUPS}
        recommendedSessionMinutes={ageAdaptation.recommendedSessionMinutes}
        parentPin={parentPin}
        activeMascot={activeMascot}
        dailyMissions={dailyMissions}
        chestReady={chestReady}
        levelInfo={levelInfo}
        rankLabel={rankLabel}
        isTimeUp={isTimeUp}
        langModalOpen={langModalOpen}
        setLangModalOpen={setLangModalOpen}
        albumModalOpen={albumModalOpen}
        setAlbumModalOpen={setAlbumModalOpen}
        pinModalOpen={pinModalOpen}
        setPinModalOpen={setPinModalOpen}
        parentModalOpen={parentModalOpen}
        setParentModalOpen={setParentModalOpen}
        wizardOpen={wizardOpen}
        setWizardOpen={setWizardOpen}
        petWorldOpen={petWorldOpen}
        setPetWorldOpen={setPetWorldOpen}
        storyStudioOpen={storyStudioOpen}
        setStoryStudioOpen={setStoryStudioOpen}
        diplomaOpen={diplomaOpen}
        setDiplomaOpen={setDiplomaOpen}
        familyOnboardingOpen={familyOnboardingOpen}
        setFamilyOnboardingOpen={setFamilyOnboardingOpen}
        apkModalOpen={apkModalOpen}
        setApkModalOpen={setApkModalOpen}
        bedtimeMode={bedtimeMode}
        lullabyPlaying={lullabyPlaying}
        setLullabyPlaying={setLullabyPlaying}
        pinIntent={pinIntent}
        setPinIntent={setPinIntent}
        pendingCastMovie={pendingCastMovie}
        pinDigits={pinDigits}
        setPinDigits={setPinDigits}
        pinError={pinError}
        curPinInput={curPinInput}
        setCurPinInput={setCurPinInput}
        newPinInput={newPinInput}
        setNewPinInput={setNewPinInput}
        pinChangeNotice={pinChangeNotice}
        setPinChangeNotice={setPinChangeNotice}
        newSiblingName={newSiblingName}
        setNewSiblingName={setNewSiblingName}
        newSiblingAvatar={newSiblingAvatar}
        setNewSiblingAvatar={setNewSiblingAvatar}
        newSiblingAge={newSiblingAge}
        setNewSiblingAge={setNewSiblingAge}
        parentCandidatePool={parentCandidatePool}
        ytImportUrl={ytImportUrl}
        setYtImportUrl={setYtImportUrl}
        ytImportLoading={ytImportLoading}
        setYtImportLoading={setYtImportLoading}
        ytImportStatus={ytImportStatus}
        setYtImportStatus={setYtImportStatus}
        onSelectLang={handleSelectKidsLang}
        openPinModal={openPinModal}
        handleDigitPress={handleDigitPress}
        cycleMobileAgeGroup={cycleMobileAgeGroup}
        toggleLowStimulation={toggleLowStimulation}
        setBedtimeMode={setBedtimeMode}
        handleClaimChest={handleClaimChest}
        handleSwitchSibling={handleSwitchSibling}
        handleDeleteSibling={handleDeleteSibling}
        handleCreateSibling={handleCreateSibling}
        handlePickMascot={handlePickMascot}
        handleUnlockShopItem={handleUnlockShopItem}
        resetDefaultPin={resetDefaultPin}
        handleSaveCustomPin={handleSaveCustomPin}
        updateParentPrefs={updateParentPrefs}
        toggleSound={toggleSound}
        toggleDyslexiaFont={toggleDyslexiaFont}
        toggleSyllableHighlight={toggleSyllableHighlight}
        toggleTortoiseSpeech={toggleTortoiseSpeech}
        toggleApprovedTitle={toggleApprovedTitle}
        updateActiveProgress={updateActiveProgress}
        handleEarnStar={handleEarnStar}
        onOpenSmartTv={onOpenSmartTv}
        onExitKids={onExitKids}
      />
    </div>
  );
};
