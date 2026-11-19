import React from 'react';
import type { AppLanguage, CatalogMovie, KidsAgeGroup, KidsLanguageCode } from '../../types';
import type {
  KidsDailyMissions,
  KidsLevelInfo,
  KidsMascotMeta,
  KidsProfilesStore,
  KidsProgressState,
} from './kidsData';
import type { KidsUxSettings } from '../../store/useKidsStore';
import { getKidsUiCopy } from './kidsI18n';
import { KidsPetWorldModal } from './KidsPetWorldModal';
import { KidsDiplomaModal } from './KidsDiplomaModal';
import { KidsStoryStudio } from './KidsStoryStudio';
import { KidsFamilyOnboardingModal } from './KidsFamilyOnboardingModal';
import { KidsApkModal } from './KidsApkModal';
import { KidsStepWizard } from './KidsStepWizard';
import { KidsAlbumModal } from './KidsAlbumModal';
import { KidsPinGateModal, type PinActionIntent } from './KidsPinGateModal';
import { KidsParentPanelModal } from './KidsParentPanelModal';
import { KidsLangAndRestOverlays } from './KidsPortalScreen';

interface KidsHubModalsLayerProps {
  shellLang: AppLanguage;
  dir: 'ltr' | 'rtl';
  t: ReturnType<typeof getKidsUiCopy>;
  progress: KidsProgressState;
  profilesStore: KidsProfilesStore;
  ux: KidsUxSettings;
  ageGroups: Array<{ id: KidsAgeGroup; label: string }>;
  recommendedSessionMinutes: number;
  parentPin: string;
  activeMascot: KidsMascotMeta;
  dailyMissions: KidsDailyMissions;
  chestReady: boolean;
  levelInfo: KidsLevelInfo;
  rankLabel: string;
  isTimeUp: boolean;
  langModalOpen: boolean;
  setLangModalOpen: (v: boolean) => void;
  albumModalOpen: boolean;
  setAlbumModalOpen: (v: boolean) => void;
  pinModalOpen: boolean;
  setPinModalOpen: (v: boolean) => void;
  parentModalOpen: boolean;
  setParentModalOpen: (v: boolean) => void;
  wizardOpen: boolean;
  setWizardOpen: (v: boolean) => void;
  petWorldOpen: boolean;
  setPetWorldOpen: (v: boolean) => void;
  storyStudioOpen: boolean;
  setStoryStudioOpen: (v: boolean) => void;
  diplomaOpen: boolean;
  setDiplomaOpen: (v: boolean) => void;
  familyOnboardingOpen: boolean;
  setFamilyOnboardingOpen: (v: boolean) => void;
  apkModalOpen: boolean;
  setApkModalOpen: (v: boolean) => void;
  bedtimeMode: boolean;
  lullabyPlaying: boolean;
  setLullabyPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  pinIntent: PinActionIntent;
  setPinIntent: React.Dispatch<React.SetStateAction<PinActionIntent>>;
  pendingCastMovie: CatalogMovie | null;
  pinDigits: string;
  setPinDigits: React.Dispatch<React.SetStateAction<string>>;
  pinError: boolean;
  curPinInput: string;
  setCurPinInput: (v: string) => void;
  newPinInput: string;
  setNewPinInput: (v: string) => void;
  pinChangeNotice: { ok: boolean; msg: string } | null;
  setPinChangeNotice: React.Dispatch<React.SetStateAction<{ ok: boolean; msg: string } | null>>;
  newSiblingName: string;
  setNewSiblingName: (v: string) => void;
  newSiblingAvatar: string;
  setNewSiblingAvatar: (v: string) => void;
  newSiblingAge: KidsAgeGroup;
  setNewSiblingAge: (v: KidsAgeGroup) => void;
  parentCandidatePool: CatalogMovie[];
  ytImportUrl: string;
  setYtImportUrl: (v: string) => void;
  ytImportLoading: boolean;
  setYtImportLoading: (v: boolean) => void;
  ytImportStatus: string;
  setYtImportStatus: (v: string) => void;
  onSelectLang: (lang: KidsLanguageCode) => void;
  openPinModal: (intent?: PinActionIntent, movie?: CatalogMovie) => void;
  handleDigitPress: (digit: string) => void;
  cycleMobileAgeGroup: () => void;
  toggleLowStimulation: () => void;
  setBedtimeMode: (v: boolean) => void;
  handleClaimChest: () => boolean;
  handleSwitchSibling: (id: string) => void;
  handleDeleteSibling: (id: string) => void;
  handleCreateSibling: (e: React.FormEvent) => void;
  handlePickMascot: (mascot: KidsMascotMeta) => void;
  handleUnlockShopItem: (id: string, cost: number) => void;
  resetDefaultPin: () => void;
  handleSaveCustomPin: (e: React.FormEvent) => void;
  updateParentPrefs: (patch: Partial<KidsProgressState['parentPrefs']>) => void;
  toggleSound: () => void;
  toggleDyslexiaFont: () => void;
  toggleSyllableHighlight: () => void;
  toggleTortoiseSpeech: () => void;
  toggleApprovedTitle: (movie: CatalogMovie) => void;
  updateActiveProgress: (updater: (prev: KidsProgressState) => KidsProgressState) => void;
  handleEarnStar: (delta: number, badgeId?: string) => void;
  onOpenSmartTv?: () => void;
  onExitKids: () => void;
}

export const KidsHubModalsLayer: React.FC<KidsHubModalsLayerProps> = (p) => (
  <>
    <KidsLangAndRestOverlays
      langModalOpen={p.langModalOpen}
      onCloseLangModal={() => p.setLangModalOpen(false)}
      isTimeUp={p.isTimeUp}
      pinModalOpen={p.pinModalOpen}
      parentModalOpen={p.parentModalOpen}
      dir={p.dir}
      t={p.t}
      progress={p.progress}
      onSelectLang={p.onSelectLang}
      openPinModal={p.openPinModal}
    />

    <KidsAlbumModal
      open={p.albumModalOpen}
      onClose={() => p.setAlbumModalOpen(false)}
      dir={p.dir}
      progress={p.progress}
      profilesStore={p.profilesStore}
      ux={p.ux}
      bedtimeMode={p.bedtimeMode}
      lullabyPlaying={p.lullabyPlaying}
      activeMascot={p.activeMascot}
      dailyMissions={p.dailyMissions}
      chestReady={p.chestReady}
      levelInfo={p.levelInfo}
      rankLabel={p.rankLabel}
      t={p.t}
      newSiblingName={p.newSiblingName}
      setNewSiblingName={p.setNewSiblingName}
      newSiblingAvatar={p.newSiblingAvatar}
      setNewSiblingAvatar={p.setNewSiblingAvatar}
      newSiblingAge={p.newSiblingAge}
      setNewSiblingAge={p.setNewSiblingAge}
      cycleMobileAgeGroup={p.cycleMobileAgeGroup}
      onOpenWizard={() => p.setWizardOpen(true)}
      toggleLowStimulation={p.toggleLowStimulation}
      setBedtimeMode={p.setBedtimeMode}
      setLullabyPlaying={p.setLullabyPlaying}
      handleClaimChest={p.handleClaimChest}
      handleSwitchSibling={p.handleSwitchSibling}
      handleDeleteSibling={p.handleDeleteSibling}
      handleCreateSibling={p.handleCreateSibling}
      handlePickMascot={p.handlePickMascot}
      handleUnlockShopItem={p.handleUnlockShopItem}
    />

    <KidsPinGateModal
      open={p.pinModalOpen}
      onClose={() => p.setPinModalOpen(false)}
      dir={p.dir}
      preferredLang={p.progress.preferredLang}
      pinIntent={p.pinIntent}
      setPinIntent={p.setPinIntent}
      pendingCastMovie={p.pendingCastMovie}
      pinDigits={p.pinDigits}
      setPinDigits={p.setPinDigits}
      pinError={p.pinError}
      handleDigitPress={p.handleDigitPress}
      t={p.t}
    />

    <KidsParentPanelModal
      open={p.parentModalOpen}
      onClose={() => p.setParentModalOpen(false)}
      dir={p.dir}
      t={p.t}
      progress={p.progress}
      ux={p.ux}
      ageGroups={p.ageGroups}
      recommendedSessionMinutes={p.recommendedSessionMinutes}
      parentPin={p.parentPin}
      curPinInput={p.curPinInput}
      setCurPinInput={p.setCurPinInput}
      newPinInput={p.newPinInput}
      setNewPinInput={p.setNewPinInput}
      pinChangeNotice={p.pinChangeNotice}
      setPinChangeNotice={p.setPinChangeNotice}
      resetDefaultPin={p.resetDefaultPin}
      handleSaveCustomPin={p.handleSaveCustomPin}
      updateParentPrefs={p.updateParentPrefs}
      toggleSound={p.toggleSound}
      toggleLowStimulation={p.toggleLowStimulation}
      toggleDyslexiaFont={p.toggleDyslexiaFont}
      toggleSyllableHighlight={p.toggleSyllableHighlight}
      toggleTortoiseSpeech={p.toggleTortoiseSpeech}
      parentCandidatePool={p.parentCandidatePool}
      toggleApprovedTitle={p.toggleApprovedTitle}
      ytImportUrl={p.ytImportUrl}
      setYtImportUrl={p.setYtImportUrl}
      ytImportLoading={p.ytImportLoading}
      setYtImportLoading={p.setYtImportLoading}
      ytImportStatus={p.ytImportStatus}
      setYtImportStatus={p.setYtImportStatus}
      onOpenSmartTv={p.onOpenSmartTv}
      onOpenFamilyOnboarding={() => p.setFamilyOnboardingOpen(true)}
      onExitKids={p.onExitKids}
    />

    {p.wizardOpen && (
      <KidsStepWizard
        shellLang={p.shellLang}
        currentProgress={p.progress}
        onCompleteWizard={(updated) => p.updateActiveProgress((prev) => ({ ...prev, ...updated }))}
        onClose={() => p.setWizardOpen(false)}
      />
    )}

    <KidsPetWorldModal
      open={p.petWorldOpen}
      onClose={() => p.setPetWorldOpen(false)}
      kidsLang={p.progress.preferredLang}
      onClaimChest={p.handleClaimChest}
      onOpenDiploma={() => p.setDiplomaOpen(true)}
    />

    <KidsStoryStudio
      open={p.storyStudioOpen}
      onClose={() => p.setStoryStudioOpen(false)}
      kidsLang={p.progress.preferredLang}
      ageGroup={p.progress.ageGroup}
      onEarnStar={p.handleEarnStar}
    />

    <KidsDiplomaModal
      open={p.diplomaOpen}
      onClose={() => p.setDiplomaOpen(false)}
      kidsLang={p.progress.preferredLang}
    />

    <KidsFamilyOnboardingModal
      open={p.familyOnboardingOpen}
      onClose={() => p.setFamilyOnboardingOpen(false)}
    />

    <KidsApkModal open={p.apkModalOpen} onClose={() => p.setApkModalOpen(false)} />
  </>
);
