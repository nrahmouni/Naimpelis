import type React from 'react';
import type { ActiveMovieContext } from '../../components/MoviePlaybackDock';
import type { ActiveSportsMatchMeta } from '../useLiveSportsMatchDetails';
import type { CatalogSection } from '../../components/MediaCatalogHub';
import type { MobileNavTab } from '../../utils/appSessionHelpers';
import type { SessionMode } from '../../store/useAppStore';
import type {
  AppLanguage,
  CloudBrowserState,
  FootballMatchDetails,
  LanguageNoticePopup,
  Participant,
  SecondaryStreamState,
  VideoState,
  WatchHistoryItem,
} from '../../types';

export interface UsePlaybackOrchestratorOptions {
  sessionMode: SessionMode;
  onUpgradeSoloToParty?: () => void;
  lang: AppLanguage;
  profileName: string;
  canChangeMedia: boolean;
  canControlRoom: boolean;
  hostId: string;
  participants: Participant[];
  isNestedSandboxFrame: boolean;
  cloudState: CloudBrowserState | null;
  videoState: VideoState;
  setVideoState: React.Dispatch<React.SetStateAction<VideoState>>;
  videoStateRef: React.MutableRefObject<VideoState>;
  videoStateUrlRef: React.MutableRefObject<string>;
  isCinemaModeRef: React.MutableRefObject<boolean>;
  watchHistoryRef: React.MutableRefObject<WatchHistoryItem[]>;
  setWatchHistory: React.Dispatch<React.SetStateAction<WatchHistoryItem[]>>;
  isPlayerClosedLocallyRef: React.MutableRefObject<boolean>;
  setIsPlayerClosedLocally: React.Dispatch<React.SetStateAction<boolean>>;
  isPlayerMinimizedRef: React.MutableRefObject<boolean>;
  setIsPlayerMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  setCinemaModePersist: (next: boolean) => void;
  isExtracting: boolean;
  setIsExtracting: React.Dispatch<React.SetStateAction<boolean>>;
  isExtractingRef: React.MutableRefObject<boolean>;
  activeSportsMatchRef: React.MutableRefObject<ActiveSportsMatchMeta | null>;
  setActiveSportsMatch: React.Dispatch<React.SetStateAction<ActiveSportsMatchMeta | null>>;
  activeMatchDetailsRef: React.MutableRefObject<FootballMatchDetails | null>;
  setActiveMatchDetails: React.Dispatch<React.SetStateAction<FootballMatchDetails | null>>;
  setShowLiveMatchDock: React.Dispatch<React.SetStateAction<boolean>>;
  activeMovieContextRef: React.MutableRefObject<ActiveMovieContext | null>;
  setActiveMovieContext: React.Dispatch<React.SetStateAction<ActiveMovieContext | null>>;
  secondaryStream: SecondaryStreamState | null;
  setSecondaryStream: React.Dispatch<React.SetStateAction<SecondaryStreamState | null>>;
  secondaryStreams: SecondaryStreamState[];
  setSecondaryStreams: React.Dispatch<React.SetStateAction<SecondaryStreamState[]>>;
  activeAudioSlot: number;
  setActiveAudioSlot: React.Dispatch<React.SetStateAction<number>>;
  setCatalogSection: React.Dispatch<React.SetStateAction<CatalogSection>>;
  setMobileTab: React.Dispatch<React.SetStateAction<MobileNavTab>>;
  showHostLockNotice: (hostDisplayName?: string, reason?: string) => void;
  scrollDesktopToPlayer: () => void;
  onRestorePlaybackOrigin?: (opts?: { reason: 'close' | 'cancel' | 'minimize' }) => void;
}

export interface PreExtractionSnapshot {
  videoState: VideoState;
  activeSportsMatch: ActiveSportsMatchMeta | null;
  activeMatchDetails: FootballMatchDetails | null;
  activeMovieContext: ActiveMovieContext | null;
  isPlayerClosedLocally: boolean;
  isPlayerMinimized: boolean;
  isCinemaMode: boolean;
}

export interface PlaybackCoreContext {
  opts: UsePlaybackOrchestratorOptions;
  extractionReqSeqRef: React.MutableRefObject<number>;
  activeHistoryIdRef: React.MutableRefObject<string | null>;
  beginMediaExtraction: () => { reqSeq: number; signal: AbortSignal };
  clearExtractionSnapshot: () => void;
  showLanguageNotice: (popup: Omit<LanguageNoticePopup, 'id'>) => void;
  setExtractionLabel: React.Dispatch<React.SetStateAction<string>>;
  setExtractionError: React.Dispatch<React.SetStateAction<string | null>>;
  setLoadingItemId: React.Dispatch<React.SetStateAction<string | null>>;
  findSavedResumeSec: (rawId: string) => number;
  commitVideoStateSync: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    nextState: VideoState
  ) => void;
}
