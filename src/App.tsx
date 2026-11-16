import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { MotionConfig } from 'motion/react';
import {
  Play,
  Square,
  Lock,
  ListVideo,
  RefreshCw,
  Download,
} from 'lucide-react';
import {
  checkRemoteAppVersion,
  clearStaleCachesAndReload,
  type NativeApkUpdateAvailable,
} from './utils/versionSync';
import { triggerApkDownload } from './utils/apkDownload';
import {
  AppLanguage,
  BoardGameState,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  ChatMessage,
  CloudBrowserState,
  CloudSavedRoom,
  FavoriteChannelItem,
  FloatingReaction,
  FootballMatchDetails,
  FutbolChapasState,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  LanguageNoticePopup,
  OnlineAppUser,
  Participant,
  PartyGameState,
  PinturilloGameState,
  PlaybackEngineMode,
  PollProposalItem,
  RestoredRoomBlueprint,
  RoomPollState,
  RoomQueueItem,
  RoomRole,
  SavedFriend,
  SecondaryStreamState,
  SpanishTdtChannel,
  SportsMatch,
  StreamTrack,
  Pool8BallState,
  TvEpisodeItem,
  TvRemoteCommandType,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from './types';
import type { RoomGameInvite, RoomGameInviteType, RoomMatchResponsesState } from './shared/protocol';
import { UI_COPY, pickLang } from './utils/i18n';
import {
  addRecentRoom,
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  clearWatchHistory,
  deriveFriendCode,
  dismissGuestPopupForRoom,
  getCatalogFavoriteKey,
  getFavoriteChannels,
  getRecentRooms,
  getSavedFriends,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  removeLocalFriend,
  removeWatchHistoryItem,
  sanitizeItemKey,
  saveFavoriteChannels,
  saveFriendsList,
  saveStoredProfile,
  saveWatchHistory,
  saveWatchlist,
  StoredProfile,
  toggleFavoriteChannel,
  toggleWatchlistItem,
  updateWatchHistoryProgress,
  upsertLocalFriend,
  wasGuestPopupDismissed,
} from './utils/storage';
import {
  clearCloudWatchHistoryItems,
  deleteCloudCatalogFavoriteAndDuplicates,
  deleteCloudFavoriteById,
  deleteCloudFriend,
  deleteCloudSavedRoom,
  deleteCloudWatchHistoryItem,
  flushPendingCloudWatchProgress,
  signInWithGoogleAccountDetailed,
  signOutGoogleAccount,
  updateCloudUserProfile,
  updateCloudWatchProgressOnly,
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  upsertCloudFriend,
  upsertCloudSavedRoom,
  upsertCloudWatchHistory,
} from './services/userCloudSync';
import { socketService } from './services/socket';
import { playCinemaSound, playWorldPortalSound, triggerHaptic } from './utils/haptics';
import {
  buildShortInviteUrl,
  generateShortRoomCode,
  parseRoomFromWindow,
} from './utils/shortLink';
import { NaimBrandLogo } from './components/NaimBrandLogo';
import { getMonogramInitials, useViewLayoutMode } from './components/MobileViewportGuard';
import { OfflineIndicator } from './components/PWAInstallPrompt';
import { PreviewAutoEscapeBanner } from './components/player/PreviewAutoEscapeBanner';
import {
  FriendsInviteModal,
  GlobalIncomingInviteBanner,
} from './components/FriendsInviteModal';
import type { ProfileHubTab } from './components/UserProfileHubModal';
import { EntryHomeScreen } from './components/EntryHomeScreen';
import {
  WorldPortalTransition,
  type WorldPortalKind,
} from './components/home/WorldPortalTransition';
import { WorldShell } from './components/worlds/WorldShell';
import { AvatarMenuSheet } from './components/AvatarMenuSheet';
import { SettingsBottomSheet } from './components/SettingsBottomSheet';
import { FloatingRoomBubble } from './components/FloatingRoomBubble';

const UserProfileHubModal = React.lazy(() =>
  import('./components/UserProfileHubModal').then((m) => ({ default: m.UserProfileHubModal }))
);
const GuestWelcomePopup = React.lazy(() =>
  import('./components/GuestWelcomePopup').then((m) => ({ default: m.GuestWelcomePopup }))
);
const LiveMatchCenter = React.lazy(() =>
  import('./components/LiveMatchCenter').then((m) => ({ default: m.LiveMatchCenter }))
);
const SeriesEpisodesDock = React.lazy(() =>
  import('./components/SeriesEpisodesDock').then((m) => ({ default: m.SeriesEpisodesDock }))
);
const SimilarMoviesDock = React.lazy(() =>
  import('./components/SimilarMoviesDock').then((m) => ({ default: m.SimilarMoviesDock }))
);
const ChannelGuideDock = React.lazy(() =>
  import('./components/ChannelGuideDock').then((m) => ({ default: m.ChannelGuideDock }))
);
const MoviePlaybackDock = React.lazy(() =>
  import('./components/MoviePlaybackDock').then((m) => ({ default: m.MoviePlaybackDock }))
);
import type { ActiveMovieContext } from './components/MoviePlaybackDock';
const TvReceiverPairingScreen = React.lazy(() =>
  import('./components/TvReceiverPairingScreen').then((m) => ({ default: m.TvReceiverPairingScreen }))
);
const RoomPinPromptModal = React.lazy(() =>
  import('./components/RoomPinPromptModal').then((m) => ({ default: m.RoomPinPromptModal }))
);
const SmartTvQuickModal = React.lazy(() =>
  import('./components/SmartTvQuickModal').then((m) => ({ default: m.SmartTvQuickModal }))
);
const NaimCineAdsPage = React.lazy(() =>
  import('./components/NaimCineAdsPage').then((m) => ({ default: m.NaimCineAdsPage }))
);
const NotificationCenterSheet = React.lazy(() =>
  import('./components/NotificationCenterSheet').then((m) => ({ default: m.NotificationCenterSheet }))
);
const CommandSearchModal = React.lazy(() =>
  import('./components/CommandSearchModal').then((m) => ({ default: m.CommandSearchModal }))
);
const SurpriseMeModal = React.lazy(() =>
  import('./components/SurpriseMeModal').then((m) => ({ default: m.SurpriseMeModal }))
);
const LegalPrivacyModal = React.lazy(() =>
  import('./components/LegalPrivacyModal').then((m) => ({ default: m.LegalPrivacyModal }))
);
const DesignSystemShowcase = React.lazy(() =>
  import('./components/DesignSystemShowcase').then((m) => ({ default: m.DesignSystemShowcase }))
);
const GamesHubSection = React.lazy(() =>
  import('./components/GamesHubSection').then((m) => ({ default: m.GamesHubSection }))
);

import { NaimcineIntro } from './components/NaimcineIntro';
import { LobbyScreen } from './components/LobbyScreen';
import { CatalogSection, MediaCatalogHub } from './components/MediaCatalogHub';
import { useThemeStore } from './store/useThemeStore';
import { useAppStore, type PrimaryWorldId, type WorldId } from './store/useAppStore';
import { useNotificationStore } from './store/useNotificationStore';
import { useCloudSyncSubscriptions } from './hooks/useCloudSyncSubscriptions';
import { useTvRemoteBridge } from './hooks/useTvRemoteBridge';
import { useGameVoiceChat } from './hooks/useGameVoiceChat';
import { useLiveScoresQuery, useFootballBoardQuery } from './hooks/useCatalogQueries';
import { runWithViewTransition } from './lib/viewTransition';
import { isGoogleTvEnvironment } from './utils/tvSpatialNav';
import { GameMatchInviteModal } from './components/games/GameMatchInviteModal';

const NativeCinemaPlayer = React.lazy(() =>
  import('./components/NativeCinemaPlayer').then((m) => ({ default: m.NativeCinemaPlayer }))
);
const PartySidebar = React.lazy(() =>
  import('./components/PartySidebar').then((m) => ({ default: m.PartySidebar }))
);

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

const INITIAL_VIDEO_STATE: VideoState = {
  mode: 'idle',
  url: '',
  rawSourceUrl: '',
  title: 'RiffanTV · Elige película, serie, partido o YouTube',
  subtitle: 'Proyección sincronizada en alta definición sin anuncios',
  currentTime: 0,
  isPlaying: false,
  isLive: false,
  tracks: [],
  activeTrackIndex: 0,
  lastUpdated: Date.now(),
};

const CINEMA_MODE_SESSION_KEY = 'naim_cinema_mode_session';
const SAVED_ROOMS_CACHE_KEY = 'naim_cached_saved_rooms_v1';
const ROOM_PINS_SESSION_KEY = 'naim_room_pins_session_v1';

function loadCachedSavedRooms(): CloudSavedRoom[] {
  try {
    const raw = localStorage.getItem(SAVED_ROOMS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSessionRoomPins(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(ROOM_PINS_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type MobileNavTab = 'home' | 'movies' | 'tdt' | 'sports' | 'youtube' | 'games' | 'chat' | 'room';

export function App() {
  const [lang, setLang] = useState<AppLanguage>('es');
  const [profile, setProfile] = useState<StoredProfile>(() => getStoredProfile());
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(() =>
    getWatchHistory()
  );
  const [watchlist, setWatchlist] = useState<CatalogMovie[]>(() => getWatchlist());
  const [favoriteChannels, setFavoriteChannels] = useState<FavoriteChannelItem[]>(() =>
    getFavoriteChannels()
  );
  const [savedFriends, setSavedFriends] = useState<SavedFriend[]>(() =>
    getSavedFriends()
  );
  const [onlineUsers, setOnlineUsers] = useState<OnlineAppUser[]>([]);
  const [friendsModalOpen, setFriendsModalOpen] = useState<boolean>(false);
  const [incomingInvite, setIncomingInvite] = useState<IncomingRoomInvite | null>(null);
  const [friendAddedNotice, setFriendAddedNotice] =
    useState<IncomingFriendAddedNotice | null>(null);
  const [inviteSentFeedback, setInviteSentFeedback] = useState<string | null>(null);
  const inviteFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User-controlled Desktop <-> Mobile view switcher (NEVER forces mobile automatically)
  const {
    effectiveView,
    isDesktopLayout,
    isFramedMobileOnPc,
    toggleViewMode,
  } = useViewLayoutMode();

  // Firebase Auth & Cloud Sync State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Dedicated "Mi Perfil" Hub Modal State
  const [profileHubOpen, setProfileHubOpen] = useState<boolean>(false);
  const [profileHubTab, setProfileHubTab] = useState<ProfileHubTab>('history');

  const initialRoute = parseRoomFromWindow();
  const initialUrlRoom = initialRoute.roomId;
  const [isTvMode, setIsTvMode] = useState<boolean>(initialRoute.isTvMode);
  const [isTvPairLobby, setIsTvPairLobby] = useState<boolean>(
    initialRoute.isTvPairLobby
  );
  const [isAdsPageOpen, setIsAdsPageOpen] = useState<boolean>(
    Boolean(initialRoute.isAdsPage)
  );
  const [tvAuthToken, setTvAuthToken] = useState<string>('');

  // Permanent Cloud Rooms & Private 4-Digit Room PIN State
  const [savedRooms, setSavedRooms] = useState<CloudSavedRoom[]>(() =>
    loadCachedSavedRooms()
  );
  const [roomHasPin, setRoomHasPin] = useState<boolean>(false);
  const [sessionPinMap, setSessionPinMap] = useState<Record<string, string>>(() =>
    loadSessionRoomPins()
  );
  const [pinPromptState, setPinPromptState] = useState<{
    open: boolean;
    roomName: string;
    invalidAttempt: boolean;
  }>({ open: false, roomName: '', invalidAttempt: false });
  const [tvClaimStatus, setTvClaimStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [smartTvModalOpen, setSmartTvModalOpen] = useState<boolean>(false);

  const [showIntro, setShowIntro] = useState<boolean>(false);
  const [introWithSound, setIntroWithSound] = useState<boolean>(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState<boolean>(false);
  const [quickPool, setQuickPool] = useState<{
    movies: CatalogMovie[];
    series: CatalogMovie[];
    tdt: SpanishTdtChannel[];
  }>({ movies: [], series: [], tdt: [] });
  const [quickPoolLoading, setQuickPoolLoading] = useState<boolean>(false);
  const [nativeApkUpdate, setNativeApkUpdate] = useState<NativeApkUpdateAvailable | null>(null);

  const syncDomAttributes = useThemeStore((s) => s.syncDomAttributes);
  const reducedMotion = useThemeStore((s) => s.reducedMotion);
  const activeWorld = useAppStore((s) => s.activeWorld);
  const setActiveWorld = useAppStore((s) => s.setActiveWorld);
  const lastUsedWorld = useAppStore((s) => s.lastUsedWorld);
  const cineTab = useAppStore((s) => s.cineTab);
  const setCineTab = useAppStore((s) => s.setCineTab);
  const cineCastellano = useAppStore((s) => s.cineCastellano);
  const setCineCastellano = useAppStore((s) => s.setCineCastellano);
  const futbolTab = useAppStore((s) => s.futbolTab);
  const setFutbolTab = useAppStore((s) => s.setFutbolTab);
  const isFloatingRoomOpen = useAppStore((s) => s.isFloatingRoomOpen);
  const setIsFloatingRoomOpen = useAppStore((s) => s.setIsFloatingRoomOpen);
  const showDesignSystem = useAppStore((s) => s.showDesignSystem);
  const setShowDesignSystem = useAppStore((s) => s.setShowDesignSystem);
  const showLegalModal = useAppStore((s) => s.showLegalModal);
  const setShowLegalModal = useAppStore((s) => s.setShowLegalModal);
  const showNotificationCenter = useAppStore((s) => s.showNotificationCenter);
  const setShowNotificationCenter = useAppStore((s) => s.setShowNotificationCenter);
  const showCommandSearch = useAppStore((s) => s.showCommandSearch);
  const setShowCommandSearch = useAppStore((s) => s.setShowCommandSearch);
  const showSurpriseModal = useAppStore((s) => s.showSurpriseModal);
  const setShowSurpriseModal = useAppStore((s) => s.setShowSurpriseModal);
  const [aiSearchLaunch, setAiSearchLaunch] = useState<{
    query: string;
    mediaType?: 'all' | 'movie' | 'tv';
    mode?: 'surprise' | 'request';
    seq: number;
  } | null>(null);
  const typingUsers = useAppStore((s) => s.typingUsers);
  const setTypingUser = useAppStore((s) => s.setTypingUser);
  const swUpdate = useAppStore((s) => s.swUpdate);
  const applySwUpdateNow = useAppStore((s) => s.applySwUpdateNow);
  const deferredAppUpdateVersion = useAppStore((s) => s.deferredAppUpdateVersion);
  const setDeferredAppUpdateVersion = useAppStore((s) => s.setDeferredAppUpdateVersion);

  const notifications = useNotificationStore((s) => s.notifications);
  const pushNotification = useNotificationStore((s) => s.pushNotification);
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const isGoogleTvApp = isGoogleTvEnvironment();
  const initialGoogleTvRoom =
    !initialUrlRoom && isGoogleTvApp && !initialRoute.isTvPairLobby && !initialRoute.isAdsPage
      ? loadCachedSavedRooms()[0]?.roomCode || getRecentRooms()[0]?.id || generateShortRoomCode(4)
      : '';
  const effectiveInitialRoom = initialUrlRoom || initialGoogleTvRoom;

  const [roomId, setRoomId] = useState<string>(effectiveInitialRoom);
  const [roomName, setRoomName] = useState<string>(
    effectiveInitialRoom
      ? isGoogleTvApp && !initialUrlRoom
        ? 'RiffanTV · Google TV'
        : `Sala ${effectiveInitialRoom.toUpperCase()}`
      : ''
  );
  const [inRoom, setInRoom] = useState<boolean>(Boolean(effectiveInitialRoom));

  const [worldSearchQuery, setWorldSearchQuery] = useState<string>('');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState<boolean>(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState<boolean>(false);

  // Player Minimize, Local Close, Auto-Scroll PiP, 4-Corner Drag & 'Modo Cine' State
  const [isPlayerMinimized, setIsPlayerMinimized] = useState<boolean>(false);
  const [isAutoMiniByScroll, setIsAutoMiniByScroll] = useState<boolean>(false);
  const [pinFullPlayerOnChat, setPinFullPlayerOnChat] = useState<boolean>(true);
  const [miniCorner, setMiniCorner] = useState<
    'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  >('bottom-right');
  const [miniDragOffset, setMiniDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );
  const catalogScrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollCompressToggleRef = useRef<number>(0);
  const isNestedSandboxFrame =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
  const miniDragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
  } | null>(null);
  const [isPlayerClosedLocally, setIsPlayerClosedLocally] = useState<boolean>(false);
  const [isCinemaMode, setIsCinemaMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(CINEMA_MODE_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setCinemaModePersist = useCallback((next: boolean) => {
    setIsCinemaMode(next);
    try {
      if (next) {
        sessionStorage.setItem(CINEMA_MODE_SESSION_KEY, '1');
      } else {
        sessionStorage.removeItem(CINEMA_MODE_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  // Non-intrusive Guest Welcome Popup when invited via link (/code) with random name
  const [showGuestPopup, setShowGuestPopup] = useState<boolean>(() => {
    if (!initialUrlRoom || isTvMode) return false;
    const stored = getStoredProfile();
    return !stored.isCustomized && !wasGuestPopupDismissed(initialUrlRoom);
  });

  // Authoritative Room State
  const [hostId, setHostId] = useState<string>('');
  const [creatorId, setCreatorId] = useState<string>('');
  const [hostOnlyControl, setHostOnlyControl] = useState<boolean>(true);
  const [activePoll, setActivePoll] = useState<RoomPollState | null>(null);
  const [roomGameState, setRoomGameState] = useState<BoardGameState | null>(null);
  const [partyGameState, setPartyGameState] = useState<PartyGameState | null>(null);
  const [pinturilloState, setPinturilloState] = useState<PinturilloGameState | null>(null);
  const [poolGameState, setPoolGameState] = useState<Pool8BallState | null>(null);
  const [chapasGameState, setChapasGameState] = useState<FutbolChapasState | null>(null);
  const [matchResponses, setMatchResponses] = useState<RoomMatchResponsesState | null>(null);
  const [gameMoveError, setGameMoveError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [roomQueue, setRoomQueue] = useState<RoomQueueItem[]>([]);
  const [videoState, setVideoState] = useState<VideoState>(INITIAL_VIDEO_STATE);
  const [secondaryStream, setSecondaryStream] = useState<SecondaryStreamState | null>(null);
  const [lockNoticeToast, setLockNoticeToast] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [cloudFrame, setCloudFrame] = useState<string | null>(null);
  const [cloudState, setCloudState] = useState<CloudBrowserState | null>(null);

  // Navigation & Extraction State
  const [catalogSection, setCatalogSection] = useState<CatalogSection>('home');
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('home');
  const [openQueueTrigger, setOpenQueueTrigger] = useState<number>(0);
  const [queueAddedNotice, setQueueAddedNotice] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionLabel, setExtractionLabel] = useState<string>('');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [languageNotice, setLanguageNotice] = useState<LanguageNoticePopup | null>(null);
  const [floatingChatOpen, setFloatingChatOpen] = useState<boolean>(false);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState<boolean>(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' && !isGoogleTvEnvironment()
      ? window.innerWidth > window.innerHeight && window.innerHeight < 520
      : false
  );
  const [livePlaybackSec, setLivePlaybackSec] = useState<number>(0);
  const [activeSportsMatch, setActiveSportsMatch] = useState<
    (NonNullable<SportsMatch['matchMeta']> & { competition?: string }) | null
  >(null);
  const [activeMatchDetails, setActiveMatchDetails] = useState<FootballMatchDetails | null>(null);
  const [loadingActiveMatchDetails, setLoadingActiveMatchDetails] = useState<boolean>(false);
  const [showLiveMatchDock, setShowLiveMatchDock] = useState<boolean>(true);
  const [activeMovieContext, setActiveMovieContext] = useState<ActiveMovieContext | null>(null);
  const langNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLanguageNotice = useCallback(
    (popup: Omit<LanguageNoticePopup, 'id'>) => {
      if (langNoticeTimerRef.current) clearTimeout(langNoticeTimerRef.current);
      setLanguageNotice({
        ...popup,
        id: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });
      langNoticeTimerRef.current = setTimeout(() => {
        setLanguageNotice(null);
      }, 5200);
    },
    []
  );

  // Detect mobile virtual keyboard via visualViewport & mobile horizontal landscape orientation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateOrientation = () => {
      if (isGoogleTvEnvironment()) {
        setIsMobileLandscape(false);
        return;
      }
      setIsMobileLandscape(
        window.innerWidth > window.innerHeight && window.innerHeight < 520
      );
    };
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    const vv = window.visualViewport;
    const handleViewportChange = () => {
      updateOrientation();
      if (!vv) return;
      const fullH = window.innerHeight || document.documentElement.clientHeight || 800;
      const currentH = Math.round(vv.height);
      const keyboardLikelyOpen = fullH - currentH > 135 && fullH < 1024;
      setIsMobileKeyboardOpen(keyboardLikelyOpen);
      setVisualViewportHeight(keyboardLikelyOpen ? currentH : null);
    };
    if (vv) {
      vv.addEventListener('resize', handleViewportChange);
      vv.addEventListener('scroll', handleViewportChange);
    }
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      if (vv) {
        vv.removeEventListener('resize', handleViewportChange);
        vv.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, []);

  const mobileTabRef = useRef<MobileNavTab>(mobileTab);
  mobileTabRef.current = mobileTab;
  const inRoomRef = useRef<boolean>(inRoom);
  inRoomRef.current = inRoom;
  const hostIdRef = useRef<string>(hostId);
  hostIdRef.current = hostId;
  const roomQueueRef = useRef<RoomQueueItem[]>(roomQueue);
  roomQueueRef.current = roomQueue;
  const videoStateUrlRef = useRef<string>(videoState.url);
  videoStateUrlRef.current = videoState.url;
  const videoStateRef = useRef<VideoState>(videoState);
  videoStateRef.current = videoState;
  const isCinemaModeRef = useRef<boolean>(isCinemaMode);
  isCinemaModeRef.current = isCinemaMode;
  const nextEpPreloadRef = useRef<string>('');
  const handlePlayQueueItemRef = useRef<(item: RoomQueueItem) => void>(() => {});
  const lockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualLobbyStayRef = useRef<boolean>(false);
  const hadActivePlaybackRef = useRef<boolean>(false);

  const [incomingGameInvite, setIncomingGameInvite] = useState<RoomGameInvite | null>(null);
  const [forcedOpenGame, setForcedOpenGame] = useState<{
    gameType: RoomGameInviteType;
    seq: number;
  } | null>(null);
  const activeHubGameRef = useRef<RoomGameInviteType | null>(null);
  const catalogSectionRef = useRef<CatalogSection>(catalogSection);
  catalogSectionRef.current = catalogSection;

  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const activeHistoryIdRef = useRef<string | null>(null);
  const lastCloudProgressSyncRef = useRef<number>(0);
  const watchHistoryRef = useRef<WatchHistoryItem[]>(watchHistory);
  watchHistoryRef.current = watchHistory;
  const isTvPairLobbyRef = useRef<boolean>(isTvPairLobby);
  isTvPairLobbyRef.current = isTvPairLobby;
  const savedRoomsRef = useRef<CloudSavedRoom[]>(savedRooms);
  savedRoomsRef.current = savedRooms;
  const sessionPinMapRef = useRef<Record<string, string>>(sessionPinMap);
  sessionPinMapRef.current = sessionPinMap;
  const tvClaimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExtractingRef = useRef<boolean>(isExtracting);
  isExtractingRef.current = isExtracting;
  const extractionReqSeqRef = useRef<number>(0);
  const extractionAbortRef = useRef<AbortController | null>(null);

  const beginMediaExtraction = useCallback(() => {
    if (extractionAbortRef.current) {
      try {
        extractionAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const ctrl = new AbortController();
    extractionAbortRef.current = ctrl;
    const reqSeq = ++extractionReqSeqRef.current;
    return { reqSeq, signal: ctrl.signal };
  }, []);

  const rememberSessionPin = useCallback((targetCode: string, pinCode: string) => {
    const cleanCode = targetCode.trim().toLowerCase();
    if (!cleanCode) return;
    setSessionPinMap((prev) => {
      const next = { ...prev };
      if (pinCode && /^[0-9]{4}$/.test(pinCode)) {
        next[cleanCode] = pinCode;
      } else {
        delete next[cleanCode];
      }
      try {
        sessionStorage.setItem(ROOM_PINS_SESSION_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const t = UI_COPY[lang];

  const selfParticipant = participants.find((p) => p.id === profile.id);
  const effectiveHostId = creatorId || hostId;
  const isHostUser = Boolean(effectiveHostId) && effectiveHostId === profile.id;
  const selfRole: RoomRole = isHostUser
    ? 'host'
    : selfParticipant?.role === 'mod'
    ? 'mod'
    : 'viewer';

  const currentUser: Participant = {
    id: profile.id,
    name: isTvMode ? `${profile.name} (TV)` : profile.name,
    avatar: isTvMode ? '📺' : profile.avatar || '🎬',
    color: profile.color || '#9146FF',
    isHost: isHostUser,
    role: selfRole,
    joinedAt: selfParticipant?.joinedAt || Date.now(),
  };

  // Only the room creator (Host) or an assigned Co-anfitrión ('mod') can change channels/movies/streams
  const canChangeMedia = isHostUser || selfRole === 'mod';
  // Play/pause/seek follows hostOnlyControl toggle (still allowing Host + Co-anfitrión when locked)
  const canControlRoom = !hostOnlyControl || canChangeMedia;

  const voiceChat = useGameVoiceChat({
    roomId,
    currentUserId: currentUser.id,
    lang,
    enabled: inRoom && Boolean(roomId),
  });

  const { data: liveScores = [] } = useLiveScoresQuery(inRoom && !isTvMode);
  const liveMatchesCount = liveScores.filter((m) => m.isLive).length;
  const { data: homeFootballMatches = [] } = useFootballBoardQuery(
    inRoom && !isTvMode && activeWorld === 'entry'
  );

  const [activePortalTransition, setActivePortalTransition] =
    useState<WorldPortalKind | null>(null);
  const portalTimersRef = useRef<number[]>([]);

  const clearPortalTimers = useCallback(() => {
    portalTimersRef.current.forEach((t) => window.clearTimeout(t));
    portalTimersRef.current = [];
  }, []);

  useEffect(() => () => clearPortalTimers(), [clearPortalTimers]);

  const applyWorldChange = useCallback(
    (nextWorld: WorldId) => {
      setActiveWorld(nextWorld);
      if (nextWorld === 'cine') {
        setCatalogSection('movies');
        setMobileTab('movies');
      } else if (nextWorld === 'futbol') {
        setCatalogSection('sports');
        setMobileTab('sports');
      } else if (nextWorld === 'tv') {
        setCatalogSection('tdt');
        setMobileTab('tdt');
      } else if (nextWorld === 'youtube') {
        setCatalogSection('youtube');
        setMobileTab('youtube');
      } else if (nextWorld === 'juegos') {
        setCatalogSection('games');
        setMobileTab('games');
      } else if (nextWorld === 'sala') {
        setMobileTab('room');
        setUnreadChatCount(0);
      } else {
        setCatalogSection('home');
        setMobileTab('home');
      }
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    },
    [setActiveWorld]
  );

  const preloadWorld = useCallback((world: PrimaryWorldId) => {
    if (world === 'futbol') {
      void import('./components/FootballMatchboard');
    } else if (world === 'juegos') {
      void import('./components/GamesHubSection');
    } else if (world === 'cine' || world === 'tv') {
      void import('./components/ExpandedDiscoverySection');
    }
  }, []);

  const enterWorld = useCallback(
    (nextWorld: WorldId, opts?: { withPortal?: boolean }) => {
      setWorldSearchQuery('');
      setShowWatchlistOnly(false);
      clearPortalTimers();

      if (
        opts?.withPortal &&
        !reducedMotion &&
        (nextWorld === 'cine' ||
          nextWorld === 'futbol' ||
          nextWorld === 'tv' ||
          nextWorld === 'juegos')
      ) {
        preloadWorld(nextWorld);
        playWorldPortalSound(nextWorld);
        setActivePortalTransition(nextWorld);
        const swapTimer = window.setTimeout(() => {
          applyWorldChange(nextWorld);
        }, 410);
        const exitTimer = window.setTimeout(() => {
          setActivePortalTransition(null);
        }, 760);
        portalTimersRef.current = [swapTimer, exitTimer];
        return;
      }

      setActivePortalTransition(null);
      runWithViewTransition(() => {
        applyWorldChange(nextWorld);
      });
    },
    [applyWorldChange, clearPortalTimers, preloadWorld, reducedMotion]
  );

  useEffect(() => {
    setIncomingGameInvite(null);
  }, [roomId, inRoom]);

  const handleAcceptGameInvite = useCallback(
    (invite: RoomGameInvite) => {
      socketService.respondToGameInvite(invite.gameType, 'accepted', invite.id);
      setIncomingGameInvite(null);
      setCinemaModePersist(false);
      setFloatingChatOpen(false);
      if (videoStateRef.current.mode !== 'idle') {
        setIsPlayerMinimized(true);
      }
      enterWorld('juegos');
      setForcedOpenGame({
        gameType: invite.gameType,
        seq: Date.now(),
      });
    },
    [setCinemaModePersist, enterWorld]
  );

  const showHostLockNotice = useCallback(
    (hostDisplayName?: string, reason?: string) => {
      if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current);
      const msg =
        reason ||
        pickLang(lang, {
          es: `Solo ${hostDisplayName || 'el anfitrión'} o un Co-anfitrión puede cambiar canales o películas`,
          ca: `Només ${hostDisplayName || 'l’amfitrió'} o un Co-amfitrió pot canviar canals o pel·lícules`,
          en: `Only ${hostDisplayName || 'the host'} or a Co-host can change channels or movies`,
        });
      setLockNoticeToast(msg);
      lockToastTimerRef.current = setTimeout(() => {
        setLockNoticeToast(null);
      }, 3400);
    },
    [lang]
  );

  // Track playback session lifecycle so Modo Cine persists throughout the active session
  // and resets cleanly when playback completely stops.
  useEffect(() => {
    const activeNow = videoState.mode !== 'idle' || isExtracting;
    if (activeNow) {
      hadActivePlaybackRef.current = true;
    } else if (hadActivePlaybackRef.current) {
      hadActivePlaybackRef.current = false;
      setCinemaModePersist(false);
    }
  }, [videoState.mode, isExtracting, setCinemaModePersist]);

  // Keep live Football Match Center synced with room state (for host + guests joining mid-match)
  useEffect(() => {
    if (videoState.mode === 'idle' && !isExtracting) {
      setActiveSportsMatch(null);
      setActiveMatchDetails(null);
      return;
    }
    if (videoState.mode !== 'idle' && videoState.isLive && !activeSportsMatch) {
      const cleanedTitle = (videoState.title || '').replace(/\s+·\s+.*$/, '').trim();
      const parts = cleanedTitle.split(/\s+(?:vs\.?|v)\s+/i);
      if (parts.length === 2 && parts[0].trim().length >= 2 && parts[1].trim().length >= 2) {
        setActiveSportsMatch({
          homeTeam: parts[0].trim(),
          awayTeam: parts[1].trim(),
          competition: videoState.subtitle || undefined,
        });
        setShowLiveMatchDock(true);
      }
    }
  }, [
    videoState.mode,
    videoState.isLive,
    videoState.title,
    videoState.subtitle,
    isExtracting,
    activeSportsMatch,
  ]);

  const activeMatchAbortRef = useRef<AbortController | null>(null);

  const refreshActiveMatchDetails = useCallback(
    async (showSpinner = false) => {
      if (!activeSportsMatch) return;
      activeMatchAbortRef.current?.abort();
      const ctrl = new AbortController();
      activeMatchAbortRef.current = ctrl;
      if (showSpinner) setLoadingActiveMatchDetails(true);
      try {
        const todayMadrid = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Madrid',
        })
          .format(new Date())
          .replace(/-/g, '');
        const params = new URLSearchParams();
        if (activeSportsMatch.eventId) params.set('eventId', activeSportsMatch.eventId);
        if (activeSportsMatch.fotmobMatchId) {
          params.set('fotmobMatchId', activeSportsMatch.fotmobMatchId);
        }
        if (activeSportsMatch.leagueSlug) {
          params.set('leagueSlug', activeSportsMatch.leagueSlug);
        }
        if (activeSportsMatch.homeTeam) params.set('homeTeam', activeSportsMatch.homeTeam);
        if (activeSportsMatch.awayTeam) params.set('awayTeam', activeSportsMatch.awayTeam);
        params.set('date', todayMadrid);

        const res = await fetch(`/api/sports/match-details?${params.toString()}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          success?: boolean;
          details?: FootballMatchDetails;
        };
        if (!ctrl.signal.aborted && data?.success && data.details) {
          setActiveMatchDetails(data.details);
        }
      } catch {
        // ignore transient errors or aborts
      } finally {
        if (!ctrl.signal.aborted) {
          setLoadingActiveMatchDetails(false);
        }
      }
    },
    [activeSportsMatch]
  );

  // Initial fetch + real-time 15s polling while watching a live football match
  useEffect(() => {
    if (!activeSportsMatch) {
      activeMatchAbortRef.current?.abort();
      setActiveMatchDetails(null);
      setLoadingActiveMatchDetails(false);
      return;
    }

    refreshActiveMatchDetails(true);

    if (videoState.mode === 'idle' && !isExtracting) return;
    if (activeMatchDetails?.statusState === 'finished') return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshActiveMatchDetails(false);
      }
    }, 15000);

    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        refreshActiveMatchDetails(false);
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [
    activeSportsMatch,
    videoState.mode,
    isExtracting,
    activeMatchDetails?.statusState,
    refreshActiveMatchDetails,
  ]);

  // Sync theme/density/lite attributes & flush pending Firestore progress on tab hide/close
  useEffect(() => {
    syncDomAttributes();
    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingCloudWatchProgress().catch(() => {});
      }
    };
    const handleBeforeUnload = () => {
      flushPendingCloudWatchProgress().catch(() => {});
    };
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandSearch(!useAppStore.getState().showCommandSearch);
      } else if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setShowCommandSearch(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, [syncDomAttributes, setShowCommandSearch]);

  const loadQuickPool = useCallback(async () => {
    setQuickPoolLoading(true);
    try {
      const apiLang = lang === 'en' ? 'en' : 'es';
      const [mRes, sRes, tRes, lrRes] = await Promise.all([
        fetch('/api/catalog/movies?category=trending&page=1').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/catalog/series?category=trending&page=1&lang=${apiLang}`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch('/api/catalog/tdt').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/catalog/latest-releases?lang=${apiLang}`).then((r) =>
          r.ok ? r.json() : null
        ),
      ]);

      const rawMovies: CatalogMovie[] = [
        ...(Array.isArray(mRes?.movies) ? (mRes.movies as CatalogMovie[]) : []),
        ...(Array.isArray(lrRes?.cinemaReleases) ? (lrRes.cinemaReleases as CatalogMovie[]) : []),
        ...(Array.isArray(mRes?.results) ? (mRes.results as CatalogMovie[]) : []),
      ];
      const rawSeries: CatalogMovie[] = [
        ...(Array.isArray(sRes?.series) ? (sRes.series as CatalogMovie[]) : []),
        ...(Array.isArray(lrRes?.newSeasons) ? (lrRes.newSeasons as CatalogMovie[]) : []),
        ...(Array.isArray(sRes?.results) ? (sRes.results as CatalogMovie[]) : []),
      ];

      const dedupeById = (items: CatalogMovie[]) => {
        const seen = new Set<string>();
        const out: CatalogMovie[] = [];
        for (const it of items) {
          if (!it || !it.title) continue;
          const key = `${it.mediaType || 'movie'}:${it.tmdbId || it.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(it);
        }
        return out;
      };

      setQuickPool({
        movies: dedupeById(rawMovies),
        series: dedupeById(rawSeries),
        tdt: Array.isArray(tRes?.channels) ? (tRes.channels as SpanishTdtChannel[]) : [],
      });
    } catch {
      // keep existing pool
    } finally {
      setQuickPoolLoading(false);
    }
  }, [lang]);

  // Populate catalog pool eagerly inside rooms & whenever Command Search or Sorpréndeme opens
  useEffect(() => {
    if (!inRoom && !showCommandSearch && !showSurpriseModal) return;
    if (quickPool.movies.length > 0 && quickPool.series.length > 0) return;
    void loadQuickPool();
  }, [inRoom, showCommandSearch, showSurpriseModal, quickPool.movies.length, quickPool.series.length, loadQuickPool]);

  // Automatic Cross-Platform Version Control & OTA Sync (Web, Android Mobile APK & Google TV)
  useEffect(() => {
    const runVersionCheck = () => {
      void checkRemoteAppVersion({
        onApkUpdate: (apkUpdate) => setNativeApkUpdate(apkUpdate),
        shouldDeferReload: () => {
          const vs = videoStateRef.current;
          return (vs.mode !== 'idle' && vs.isPlaying) || isCinemaModeRef.current;
        },
        onDeferredUpdate: (remoteVer) => setDeferredAppUpdateVersion(remoteVer),
      });
    };
    runVersionCheck();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        runVersionCheck();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(runVersionCheck, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [setDeferredAppUpdateVersion]);

  // ============================================================================
  // FIREBASE AUTHENTICATION, CLOUD SYNC & DIRECT ROOM AUTO-ENTRY FOR LOGGED USERS
  // ============================================================================
  useCloudSyncSubscriptions({
    savedRoomsCacheKey: SAVED_ROOMS_CACHE_KEY,
    loadCachedSavedRooms,
    rememberSessionPin,
    inRoomRef,
    manualLobbyStayRef,
    isTvPairLobbyRef,
    setAuthUser,
    setAuthLoading,
    setSavedRooms,
    setProfile,
    setShowGuestPopup,
    setShowIntro,
    setCatalogSection,
    setMobileTab,
    setRoomId,
    setRoomName,
    setInRoom,
    setWatchHistory,
    setWatchlist,
    setFavoriteChannels,
    setSavedFriends,
  });

  const handleGoogleSignIn = async () => {
    manualLobbyStayRef.current = false;
    useAppStore.getState().setAuthNotice(null);
    const res = await signInWithGoogleAccountDetailed();
    if (res.user) {
      useAppStore.getState().setAuthNotice(null);
      return;
    }
    if (res.errorCode === 'auth/unauthorized-domain') {
      const hostHint = res.hostname ? ` (${res.hostname})` : '';
      useAppStore
        .getState()
        .setAuthNotice(
          pickLang(lang, {
            es: `Este dominio${hostHint} aún no está autorizado en Firebase Auth. Puedes entrar con tu nombre sin cuenta.`,
            ca: `Aquest domini${hostHint} encara no està autoritzat a Firebase Auth. Pots entrar amb el teu nom sense compte.`,
            en: `This domain${hostHint} is not yet authorized in Firebase Auth. You can enter with your name right away.`,
          })
        );
    } else if (res.errorCode === 'auth/popup-blocked') {
      useAppStore
        .getState()
        .setAuthNotice(
          pickLang(lang, {
            es: 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes o entra con tu nombre.',
            ca: 'El navegador ha blocat la finestra de Google. Permet finestres emergents o entra amb el teu nom.',
            en: 'Popup was blocked by the browser. Allow popups or enter with your name.',
          })
        );
    } else if (res.errorCode) {
      useAppStore
        .getState()
        .setAuthNotice(
          pickLang(lang, {
            es: 'No se pudo completar el acceso con Google ahora. Puedes continuar con tu nombre.',
            ca: 'No s’ha pogut completar l’accés amb Google ara. Pots continuar amb el teu nom.',
            en: 'Could not complete Google sign-in right now. You can continue with your name.',
          })
        );
    }
  };

  const handleGoogleSignOut = async () => {
    setSavedRooms([]);
    try {
      localStorage.removeItem(SAVED_ROOMS_CACHE_KEY);
    } catch {
      // ignore
    }
    await signOutGoogleAccount();
  };

  // ============================================================================
  // WATCH HISTORY & EXACT PLAYBACK PROGRESS SYNC
  // ============================================================================
  const findSavedResumeSec = useCallback((rawId: string): number => {
    const cleanId = sanitizeItemKey(rawId);
    const match = watchHistoryRef.current.find(
      (h) => sanitizeItemKey(h.id) === cleanId
    );
    if (!match || !match.resumeTimeSec || match.resumeTimeSec <= 5) return 0;
    return Math.floor(match.resumeTimeSec);
  }, []);

  const recordStateInWatchHistory = useCallback((vState: VideoState) => {
    if (
      (vState.mode !== 'hls' && vState.mode !== 'direct') ||
      vState.isLive ||
      !vState.url
    ) {
      activeHistoryIdRef.current = null;
      return;
    }

    if (vState.seriesMeta) {
      const sm = vState.seriesMeta;
      const activeTr = vState.tracks?.[vState.activeTrackIndex];
      const histId = sanitizeItemKey(`tv-${sm.tmdbId}-${sm.season}-${sm.episode}`);
      activeHistoryIdRef.current = histId;
      const { list, item } = addWatchHistoryItem({
        id: histId,
        mediaType: 'tv',
        tmdbId: sm.tmdbId,
        title: sm.seriesTitle,
        subtitle: `${sm.season}x${String(sm.episode).padStart(2, '0')} · ${
          sm.episodeTitle || 'Episodio'
        }`,
        poster: sm.poster || vState.poster || '',
        backdrop: sm.backdrop || vState.backdrop || sm.poster || '',
        season: sm.season,
        episode: sm.episode,
        episodeTitle: sm.episodeTitle,
        preferLang: activeTr?.lang === 'EN' ? 'EN' : 'ES',
        resumeTimeSec: vState.currentTime > 5 ? Math.floor(vState.currentTime) : undefined,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});
    } else if (vState.poster || vState.backdrop) {
      const activeTr = vState.tracks?.[vState.activeTrackIndex];
      const tmdbMatch = vState.rawSourceUrl?.match(/\/(\d+)(?:\/|$)/);
      const parsedTmdbId = tmdbMatch ? Number(tmdbMatch[1]) : undefined;
      const movidySlugMatch = vState.rawSourceUrl?.match(
        /movidy\.[a-z]+\/ver\/([^/?#]+)/i
      );
      const histId = canonicalizeHistoryItemId({
        id: movidySlugMatch
          ? `movidy-${movidySlugMatch[1]}`
          : vState.rawSourceUrl || vState.title,
        mediaType: 'movie',
        tmdbId: parsedTmdbId,
      });
      activeHistoryIdRef.current = histId;

      const isMovidyRaw = vState.rawSourceUrl?.includes('movidy.');
      const isBingetrixRaw = vState.rawSourceUrl?.includes('bingetrix');

      const { list, item } = addWatchHistoryItem({
        id: histId,
        mediaType: 'movie',
        tmdbId: parsedTmdbId,
        title: vState.title,
        subtitle: vState.subtitle || 'HD',
        poster: vState.poster || vState.backdrop || '',
        backdrop: vState.backdrop || vState.poster || '',
        preferLang: activeTr?.lang === 'EN' ? 'EN' : 'ES',
        movidyUrl: isMovidyRaw ? vState.rawSourceUrl : undefined,
        bingetrixUrl: isBingetrixRaw ? vState.rawSourceUrl : undefined,
        resumeTimeSec: vState.currentTime > 5 ? Math.floor(vState.currentTime) : undefined,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});
    }
  }, []);

  const handlePlayerProgressUpdate = useCallback(
    (currentTimeSec: number, durationSec: number) => {
      setLivePlaybackSec(Math.max(0, Math.floor(currentTimeSec)));
      const activeId = activeHistoryIdRef.current;
      if (!activeId || currentTimeSec <= 4) return;

      // Pre-resolve next episode in background when < 2 minutes remain for instant transitions
      const vs = videoStateRef.current;
      const meta = vs.seriesMeta;
      if (
        meta &&
        !vs.isLive &&
        durationSec > 120 &&
        durationSec - currentTimeSec <= 120
      ) {
        let nextSeason = meta.season;
        let nextEp = meta.episode + 1;
        if (meta.totalEpisodesInSeason && nextEp > meta.totalEpisodesInSeason) {
          if (!meta.totalSeasons || meta.season < meta.totalSeasons) {
            nextSeason = meta.season + 1;
            nextEp = 1;
          } else {
            nextEp = -1;
          }
        }
        if (nextEp > 0) {
          const preloadKey = `${meta.tmdbId}-${nextSeason}-${nextEp}`;
          if (nextEpPreloadRef.current !== preloadKey) {
            nextEpPreloadRef.current = preloadKey;
            const activeTrackLang = String(
              vs.tracks[vs.activeTrackIndex]?.lang || ''
            ).toUpperCase();
            const preferLang =
              activeTrackLang === 'LAT' || activeTrackLang === 'VOSE' || activeTrackLang === 'EN'
                ? activeTrackLang
                : 'ES';
            const params = new URLSearchParams({
              mediaType: 'tv',
              tmdbId: String(meta.tmdbId),
              season: String(nextSeason),
              episode: String(nextEp),
              preferLang,
              title: meta.seriesTitle,
              ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
            });
            fetch(`/api/extract/stream?${params.toString()}`).catch(() => {});
          }
        }
      }

      const { list, updated } = updateWatchHistoryProgress(
        activeId,
        currentTimeSec,
        durationSec
      );
      setWatchHistory(list);

      const now = Date.now();
      if (now - lastCloudProgressSyncRef.current >= 12000 && updated) {
        lastCloudProgressSyncRef.current = now;
        updateCloudWatchProgressOnly(
          activeId,
          updated.resumeTimeSec || 0,
          updated.durationSec || 0
        ).catch(() => {});
      }
    },
    [isNestedSandboxFrame]
  );

  // ============================================================================
  // FAVORITE MOVIES, SERIES & LIVE CHANNELS HANDLERS
  // ============================================================================
  const handleToggleCatalogFavorite = useCallback((item: CatalogMovie) => {
    const res = toggleWatchlistItem(item);
    setWatchlist(res.list);
    if (res.added) {
      upsertCloudCatalogFavorite(res.canonicalItem).catch(() => {});
    } else {
      deleteCloudCatalogFavoriteAndDuplicates(
        res.canonicalItem,
        res.removedKeys
      ).catch(() => {});
    }
  }, []);

  const handleToggleChannelFavorite = useCallback(
    (entry: Omit<FavoriteChannelItem, 'addedAt'>) => {
      const res = toggleFavoriteChannel(entry);
      setFavoriteChannels(res.list);
      if (res.added) {
        upsertCloudChannelFavorite(res.item).catch(() => {});
      } else {
        deleteCloudFavoriteById(res.item.favId).catch(() => {});
      }
    },
    []
  );

  // ============================================================================
  // FRIENDS LIST & DIRECT IN-APP ROOM INVITATIONS (REAL-TIME PRESENCE)
  // ============================================================================
  const handleAddFriend = useCallback(
    (entry: {
      friendId: string;
      name: string;
      avatar: string;
      color: string;
      friendCode?: string;
    }) => {
      triggerHaptic('success');
      const { list, friend } = upsertLocalFriend(entry);
      setSavedFriends(list);
      upsertCloudFriend(friend).catch(() => {});
      socketService.notifyFriendAdded({
        toUserId: friend.friendId,
        toFriendCode: friend.friendCode,
        fromUser: {
          id: profile.id,
          name: profile.name,
          avatar: profile.avatar || '🎬',
          color: profile.color || '#9146FF',
        },
      });
      if (inviteFeedbackTimerRef.current) clearTimeout(inviteFeedbackTimerRef.current);
      setInviteSentFeedback(`✓ ${friend.name} guardado en Mis Amigos`);
      inviteFeedbackTimerRef.current = setTimeout(() => {
        setInviteSentFeedback(null);
      }, 3200);
    },
    [profile.id, profile.name, profile.avatar, profile.color]
  );

  const handleRemoveFriend = useCallback((friendId: string) => {
    triggerHaptic('light');
    const nextList = removeLocalFriend(friendId);
    setSavedFriends(nextList);
    deleteCloudFriend(friendId).catch(() => {});
  }, []);

  const handleSendDirectRoomInvite = useCallback(
    (friend: { friendId: string; name: string; friendCode?: string }) => {
      if (!roomId) return;
      triggerHaptic('success');
      playCinemaSound('reaction');
      const activeTitle =
        videoState.mode !== 'idle' && videoState.title ? videoState.title : undefined;
      socketService.sendRoomInvite({
        toUserId: friend.friendId,
        toFriendCode: friend.friendCode,
        toUserName: friend.name,
        roomId,
        roomName: roomName || `Sala ${roomId.toUpperCase()}`,
        mediaTitle: activeTitle,
        fromUser: {
          id: profile.id,
          name: profile.name,
          avatar: profile.avatar || '🎬',
          color: profile.color || '#9146FF',
        },
      });
      if (inviteFeedbackTimerRef.current) clearTimeout(inviteFeedbackTimerRef.current);
      setInviteSentFeedback(
        `✓ Invitación directa enviada a ${friend.name} en la app`
      );
      inviteFeedbackTimerRef.current = setTimeout(() => {
        setInviteSentFeedback(null);
      }, 3600);
    },
    [roomId, roomName, videoState.mode, videoState.title, profile]
  );

  // Keep presence connected even on LobbyScreen (!inRoom) so friends can invite us in real time
  useEffect(() => {
    if (inRoom || isTvPairLobby) return;
    socketService.connectPresenceOnly({
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar || '🎬',
      color: profile.color || '#9146FF',
      isHost: false,
      joinedAt: Date.now(),
    });
  }, [inRoom, isTvPairLobby, profile.id, profile.name, profile.avatar, profile.color]);

  // Global listener for online users, incoming room invitations, and friend-added notices
  useEffect(() => {
    const unsubGlobal = socketService.subscribe((event) => {
      const { type, payload } = event;
      if (type === 'ONLINE_USERS_UPDATED') {
        if (Array.isArray(payload?.users)) {
          setOnlineUsers(payload.users as OnlineAppUser[]);
        }
      } else if (type === 'INCOMING_ROOM_INVITE') {
        if (payload?.roomId && payload?.fromUserId !== profile.id) {
          playCinemaSound('join');
          triggerHaptic('medium');
          const inv = payload as unknown as IncomingRoomInvite;
          setIncomingInvite(inv);
          pushNotification({
            category: 'invite',
            title: `Invitación de ${inv.fromUserName || 'un amigo'}`,
            body: `Únete a ${inv.roomName || `Sala ${inv.roomId}`}${
              payload.activeMediaTitle ? ` · Viendo ${String(payload.activeMediaTitle)}` : ''
            }`,
            roomId: inv.roomId,
            actionLabel: 'Entrar a sala',
          });
        }
      } else if (type === 'INCOMING_FRIEND_ADDED') {
        if (payload?.fromUserId && payload?.fromUserId !== profile.id) {
          playCinemaSound('reaction');
          const notice = payload as unknown as IncomingFriendAddedNotice;
          setFriendAddedNotice(notice);
          pushNotification({
            category: 'invite',
            title: `${notice.fromUserName || 'Nuevo amigo'} te añadió a sus amigos`,
            body: 'Ya podéis invitaros con 1 toque a cualquier sala de RiffanTV.',
          });
        }
      } else if (type === 'ROOM_INVITE_SENT_ACK') {
        if (payload?.targetName) {
          if (inviteFeedbackTimerRef.current)
            clearTimeout(inviteFeedbackTimerRef.current);
          setInviteSentFeedback(
            payload.deliveredLive
              ? `✓ ¡${payload.targetName} ha recibido tu invitación en pantalla!`
              : `✓ Invitación guardada para ${payload.targetName} (la verá al abrir la app)`
          );
          inviteFeedbackTimerRef.current = setTimeout(() => {
            setInviteSentFeedback(null);
          }, 3800);
        }
      }
    });
    return () => unsubGlobal();
  }, [profile.id, pushNotification]);

  useEffect(() => {
    if (!inRoom || !roomId) return;

    const cleanCode = roomId.trim().toLowerCase();
    const matchedSaved = savedRoomsRef.current.find(
      (r) => r.roomCode.toLowerCase() === cleanCode
    );
    const knownPin =
      sessionPinMapRef.current[cleanCode] ||
      (matchedSaved?.hasPin ? matchedSaved.pinCode : undefined);

    const restoredBlueprint: RestoredRoomBlueprint | undefined = matchedSaved
      ? {
          roomName: matchedSaved.roomName,
          hostOnlyControl: matchedSaved.hostOnlyControl,
          pinCode: matchedSaved.hasPin ? matchedSaved.pinCode : undefined,
          queueItems: matchedSaved.queueItems,
        }
      : undefined;

    const userPayload: Participant = {
      id: profile.id,
      name: isTvMode ? `${profile.name} (TV)` : profile.name,
      avatar: isTvMode ? '📺' : profile.avatar || '🎬',
      color: profile.color || '#9146FF',
      isHost: false,
      joinedAt: Date.now(),
    };

    const resolvedInitialName =
      matchedSaved?.roomName || roomName || `Sala ${roomId.toUpperCase()}`;

    socketService.connect(roomId, userPayload, resolvedInitialName, {
      pin: knownPin,
      tvAuthToken: tvAuthToken || undefined,
      restoredBlueprint,
    });
    addRecentRoom({ id: roomId, name: resolvedInitialName });
    setRecentRooms(getRecentRooms());

    if (typeof window !== 'undefined') {
      const shortPath = isTvMode
        ? `/${encodeURIComponent(roomId)}?tv=1`
        : `/${encodeURIComponent(roomId)}`;
      window.history.replaceState({}, '', shortPath);
    }

    const unsubscribe = socketService.subscribe((event) => {
      const { type, payload } = event;

      if (type === 'ROOM_STATE') {
        const nextRoomTitle = payload.name || `Sala ${roomId.toUpperCase()}`;
        setRoomName(nextRoomTitle);
        setHostId(payload.hostId || '');
        setCreatorId(payload.creatorId || payload.hostId || '');
        setHostOnlyControl(
          payload.hostOnlyControl !== undefined ? Boolean(payload.hostOnlyControl) : true
        );
        setRoomHasPin(Boolean(payload.hasPin));
        setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
        setActivePoll(payload.activePoll || null);
        setRoomGameState(payload.gameState || null);
        setPartyGameState(payload.partyGameState || null);
        setPinturilloState(payload.pinturilloState || null);
        setPoolGameState(payload.poolGameState || null);
        setChapasGameState(payload.chapasState || null);
        setMatchResponses(payload.matchResponses || null);
        setGameMoveError(null);
        setParticipants(payload.participants || []);
        setMessages(payload.messages || []);
        setPinnedMessage(payload.pinnedMessage || null);
        setRoomQueue(payload.queue || []);
        addRecentRoom({ id: roomId, name: nextRoomTitle });
        setRecentRooms(getRecentRooms());
        const roomVs = payload.videoState;
        if (roomVs) {
          if (!isExtractingRef.current) {
            setVideoState((prev) => {
              if (
                prev.url &&
                prev.mode !== 'idle' &&
                (roomVs.lastUpdated || 0) < (prev.lastUpdated || 0)
              ) {
                return prev;
              }
              if (
                prev.url &&
                prev.url === roomVs.url &&
                prev.mode === roomVs.mode &&
                (roomVs.lastUpdated || 0) <= (prev.lastUpdated || 0)
              ) {
                return prev;
              }
              videoStateUrlRef.current = roomVs.url;
              return roomVs;
            });
            recordStateInWatchHistory(roomVs);
          }
        }
      } else if (type === 'ROOM_PIN_REQUIRED') {
        setPinPromptState({
          open: true,
          roomName: payload?.roomName || `Sala ${roomId.toUpperCase()}`,
          invalidAttempt: Boolean(payload?.invalidAttempt),
        });
      } else if (type === 'ROOM_PIN_UPDATED') {
        const nextHasPin = Boolean(payload?.hasPin);
        setRoomHasPin(nextHasPin);
        if (!nextHasPin) {
          rememberSessionPin(roomId, '');
        }
        const pinMsg = payload?.message;
        if (pinMsg) {
          setMessages((prev) => [...prev.slice(-149), pinMsg]);
        }
      } else if (type === 'ROOM_RENAMED') {
        if (payload?.roomName) {
          setRoomName(payload.roomName);
          addRecentRoom({ id: roomId, name: payload.roomName });
          setRecentRooms(getRecentRooms());
        }
        const renMsg = payload?.message;
        if (renMsg) {
          setMessages((prev) => [...prev.slice(-149), renMsg]);
        }
      } else if (type === 'TV_CLAIM_RESULT') {
        if (tvClaimTimerRef.current) clearTimeout(tvClaimTimerRef.current);
        if (payload?.success) {
          playCinemaSound('join');
          setTvClaimStatus({
            type: 'success',
            message: pickLang(lang, {
              es: '✓ Smart TV vinculada y proyectando en esta sala',
              ca: '✓ Smart TV vinculada i projectant en aquesta sala',
              en: '✓ Smart TV paired and projecting in this room',
            }),
          });
        } else {
          setTvClaimStatus({
            type: 'error',
            message:
              payload?.error ||
              pickLang(lang, {
                es: 'Código de TV no encontrado o caducado.',
                ca: 'Codi de TV no trobat o caducat.',
                en: 'TV code not found or expired.',
              }),
          });
        }
        tvClaimTimerRef.current = setTimeout(() => {
          setTvClaimStatus(null);
        }, 5000);
      } else if (type === 'PARTICIPANTS_UPDATED') {
        setParticipants(payload.participants || []);
        if (payload.hostId) setHostId(payload.hostId);
        const joinMsg = payload.message;
        if (joinMsg) {
          setMessages((prev) => [...prev.slice(-149), joinMsg]);
          playCinemaSound('join');
        }
      } else if (type === 'VIDEO_STATE_UPDATED') {
        const nextVideoState = payload.videoState;
        if (nextVideoState) {
          const prevUrl = videoStateUrlRef.current;
          videoStateUrlRef.current = nextVideoState.url;
          setVideoState((prev) => {
            if (
              nextVideoState.url &&
              nextVideoState.url !== prev.url &&
              nextVideoState.mode !== 'idle'
            ) {
              setIsPlayerClosedLocally(false);
            }
            return nextVideoState;
          });
          if (nextVideoState.url && nextVideoState.url !== prevUrl) {
            recordStateInWatchHistory(nextVideoState);
          }
          if (nextVideoState.mode !== 'cloud') {
            setCloudFrame(null);
            setCloudState(null);
          }
        }
        const vidMsg = payload.message;
        if (vidMsg) {
          setMessages((prev) => [...prev.slice(-149), vidMsg]);
        }
      } else if (type === 'QUEUE_UPDATED') {
        setRoomQueue(payload.queue || []);
        const qMsg = payload.message;
        if (qMsg) {
          setMessages((prev) => [...prev.slice(-149), qMsg]);
        }
      } else if (type === 'NEW_CHAT_MESSAGE') {
        setMessages((prev) => [...prev.slice(-149), payload as unknown as ChatMessage]);
        if (mobileTabRef.current !== 'chat' && payload.senderId !== profile.id) {
          setUnreadChatCount((c) => c + 1);
        }
      } else if (type === 'FLOATING_REACTION') {
        const reaction = payload as unknown as FloatingReaction;
        setFloatingReactions((prev) => [...prev.slice(-18), reaction]);
        playCinemaSound('reaction');
        setTimeout(() => {
          setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
        }, 2800);
      } else if (type === 'HOST_TRANSFERRED') {
        setHostId(payload.hostId || '');
        if (payload.creatorId) setCreatorId(payload.creatorId);
        setParticipants(payload.participants || []);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
        }
      } else if (type === 'HOST_LOCK_UPDATED') {
        setHostOnlyControl(Boolean(payload.hostOnlyControl));
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
        }
      } else if (type === 'HOST_LOCK_REJECTED') {
        if (payload?.videoState) {
          setVideoState(payload.videoState);
        }
        showHostLockNotice(payload?.hostName, payload?.reason);
      } else if (type === 'POLL_UPDATED') {
        setActivePoll(payload.poll || null);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
          if (mobileTabRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        }
        if (payload.justFinished) {
          playCinemaSound('reaction');
          if (payload.winnerItem && hostIdRef.current === profile.id) {
            const winnerProposal = payload.winnerItem as PollProposalItem;
            const matchedInQueue = roomQueueRef.current.find(
              (q) =>
                q.title === winnerProposal.title &&
                (q.tmdbId === winnerProposal.tmdbId ||
                  q.youtubeId === winnerProposal.youtubeId ||
                  q.url === winnerProposal.url)
            );
            handlePlayQueueItemRef.current({
              ...winnerProposal,
              id: matchedInQueue?.id || `poll-win-${Date.now()}`,
              addedBy: profile.name,
            });
          }
          const finishedPollId = payload.poll?.id;
          if (finishedPollId) {
            setTimeout(() => {
              setActivePoll((curr) =>
                curr && curr.id === finishedPollId && curr.isClosed ? null : curr
              );
            }, 14000);
          }
        }
      } else if (type === 'CLOUD_BROWSER_FRAME') {
        setCloudFrame(payload.image || null);
        setCloudState({
          active: true,
          url: payload.url || '',
          title: payload.title || '',
          isLoading: Boolean(payload.isLoading),
          detectedStreamUrl: payload.detectedStreamUrl ?? undefined,
        });
      } else if (type === 'TYPING_UPDATED') {
        if (payload.userId && payload.userId !== profile.id) {
          setTypingUser(
            String(payload.userId),
            String(payload.userName || 'Amigo'),
            Boolean(payload.isTyping)
          );
        }
      } else if (type === 'GAME_STATE_UPDATED') {
        const nextBoard = payload.gameState || null;
        setRoomGameState(nextBoard);
        setGameMoveError(null);
        if (!nextBoard) {
          setIncomingGameInvite((prev) =>
            prev &&
            (prev.gameType === 'chess' || prev.gameType === 'checkers' || prev.gameType === 'connect4')
              ? null
              : prev
          );
        }
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
          if (mobileTabRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        }
      } else if (type === 'GAME_MOVE_REJECTED') {
        if (payload.gameState !== undefined) {
          setRoomGameState(payload.gameState || null);
        }
        const errTxt = String(payload.error || 'Jugada no válida');
        setGameMoveError(errTxt);
        setTimeout(() => setGameMoveError(null), 3200);
      } else if (type === 'PINNED_MESSAGE_UPDATED') {
        setPinnedMessage(payload.pinnedMessage || null);
      } else if (type === 'PARTY_GAME_STATE_UPDATED') {
        const nextParty = payload.partyGameState || null;
        setPartyGameState(nextParty);
        if (!nextParty) {
          setIncomingGameInvite((prev) =>
            prev && (prev.gameType === 'parchis' || prev.gameType === 'uno') ? null : prev
          );
        }
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
          if (mobileTabRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        }
      } else if (type === 'PINTURILLO_STATE_UPDATED') {
        const nextPint = payload.pinturilloState || null;
        setPinturilloState(nextPint);
        if (!nextPint) {
          setIncomingGameInvite((prev) =>
            prev && prev.gameType === 'pinturillo' ? null : prev
          );
        }
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
          if (mobileTabRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        }
      } else if (type === 'POOL_STATE_UPDATED') {
        const nextPool = payload.poolGameState || null;
        setPoolGameState(nextPool);
        if (!nextPool) {
          setIncomingGameInvite((prev) => (prev && prev.gameType === 'pool' ? null : prev));
        }
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
          if (mobileTabRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        }
      } else if (type === 'POOL_SHOT_BROADCAST') {
        setPoolGameState((payload.authoritativeState as Pool8BallState | null) || null);
      } else if (type === 'CHAPAS_STATE_UPDATED') {
        const nextChapas = (payload.chapasState as FutbolChapasState | null) || null;
        setChapasGameState(nextChapas);
        if (!nextChapas) {
          setIncomingGameInvite((prev) => (prev && prev.gameType === 'chapas' ? null : prev));
        }
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message!]);
          if (mobileTabRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        }
      } else if (type === 'CHAPAS_SHOT_BROADCAST') {
        setChapasGameState((payload.authoritativeState as FutbolChapasState | null) || null);
      } else if (type === 'GAME_INVITE_STATUS_UPDATED') {
        setMatchResponses(payload.matchResponses || null);
      } else if (type === 'GAME_MATCH_INVITE') {
        if (isTvMode) return;
        const invite = payload as unknown as RoomGameInvite;
        if (!invite || !invite.gameType || invite.inviterId === profile.id) return;
        const alreadyViewingThisGame =
          catalogSectionRef.current === 'games' &&
          mobileTabRef.current !== 'chat' &&
          mobileTabRef.current !== 'room' &&
          activeHubGameRef.current === invite.gameType;
        if (alreadyViewingThisGame) return;
        setIncomingGameInvite(invite);
      }
    });

    return () => {
      unsubscribe();
      socketService.disconnect();
    };
  }, [
    inRoom,
    roomId,
    isTvMode,
    tvAuthToken,
    lang,
    profile.id,
    recordStateInWatchHistory,
    rememberSessionPin,
    showHostLockNotice,
    setTypingUser,
  ]);

  const scrollDesktopToPlayer = () => {
    setIsPlayerClosedLocally(false);
    setIsPlayerMinimized(false);
    setIsAutoMiniByScroll(false);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleCinemaMode = useCallback(() => {
    setIsCinemaMode((prev) => {
      const next = !prev;
      if (next) {
        setIsPlayerMinimized(false);
        setIsAutoMiniByScroll(false);
        setIsPlayerClosedLocally(false);
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      try {
        if (next) {
          sessionStorage.setItem(CINEMA_MODE_SESSION_KEY, '1');
        } else {
          sessionStorage.removeItem(CINEMA_MODE_SESSION_KEY);
        }
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleClosePlayer = () => {
    triggerHaptic('light');
    setIsPlayerMinimized(false);
    setCinemaModePersist(false);
    setSecondaryStream(null);
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    if (videoState.mode === 'cloud') {
      socketService.stopCloudBrowser();
    }
    if (participants.length <= 1 && canChangeMedia) {
      const idleNext: VideoState = {
        ...INITIAL_VIDEO_STATE,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };
      setVideoState(idleNext);
      setIsPlayerClosedLocally(false);
      socketService.syncVideoState('change_url', idleNext, profile.name);
    } else {
      setIsPlayerClosedLocally(true);
    }
  };

  const handleStopRoomPlaybackForEveryone = () => {
    if (!canChangeMedia) {
      const hostName = participants.find((p) => p.id === hostId)?.name;
      showHostLockNotice(hostName);
      return;
    }
    triggerHaptic('medium');
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setSecondaryStream(null);
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    const idleNext: VideoState = {
      ...INITIAL_VIDEO_STATE,
      lastUpdated: Date.now(),
      updatedBy: profile.name,
    };
    setVideoState(idleNext);
    socketService.syncVideoState('change_url', idleNext, profile.name);
  };

  const handleEnterRoom = (
    targetRoomId: string,
    nextProfile: StoredProfile,
    customName?: string
  ) => {
    manualLobbyStayRef.current = false;
    const customizedProfile: StoredProfile = { ...nextProfile, isCustomized: true };
    saveStoredProfile(customizedProfile, true);
    setProfile(customizedProfile);
    updateCloudUserProfile(customizedProfile).catch(() => {});
    setShowGuestPopup(false);
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setSecondaryStream(null);
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      window.history.pushState(
        { naimInRoom: true },
        '',
        `/${encodeURIComponent(targetRoomId)}`
      );
    }
    setCatalogSection('home');
    setMobileTab('home');
    setActiveWorld('entry');
    setWorldSearchQuery('');
    setAvatarMenuOpen(false);
    setRoomId(targetRoomId);
    setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    setInRoom(true);
    setIntroWithSound(true);
    setShowIntro(true);
  };

  const handleSwitchActiveRoom = (targetRoomId: string, customName?: string) => {
    manualLobbyStayRef.current = false;
    setIsTvPairLobby(false);
    setIsTvMode(false);
    setTvAuthToken('');
    setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setSecondaryStream(null);
    setActivePoll(null);
    setRoomGameState(null);
    setPartyGameState(null);
    setPinnedMessage(null);
    setGameMoveError(null);
    setHostId('');
    setCreatorId('');
    setHostOnlyControl(true);
    setRoomHasPin(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
    setCatalogSection('home');
    setMobileTab('home');
    setActiveWorld('entry');
    setWorldSearchQuery('');
    setAvatarMenuOpen(false);
    setRoomId(targetRoomId);
    setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    setInRoom(true);
  };

  const handleCreateFreshRoom = (customRoomName?: string) => {
    triggerHaptic('success');
    const freshCode = generateShortRoomCode(4);
    const firstName = profile.name?.split(' ')[0] || 'Cine';
    const trimmed = typeof customRoomName === 'string' ? customRoomName.trim() : '';
    handleSwitchActiveRoom(freshCode, trimmed || `Sala de ${firstName}`);
  };

  const handleLeaveRoom = () => {
    triggerHaptic('light');
    manualLobbyStayRef.current = true;
    socketService.disconnect();
    setInRoom(false);
    setActiveWorld('entry');
    setWorldSearchQuery('');
    setAvatarMenuOpen(false);
    setIsFloatingRoomOpen(false);
    setIsTvMode(false);
    setIsTvPairLobby(false);
    setTvAuthToken('');
    setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
    setShowGuestPopup(false);
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setSecondaryStream(null);
    setActivePoll(null);
    setRoomGameState(null);
    setPartyGameState(null);
    setPinnedMessage(null);
    setGameMoveError(null);
    setHostId('');
    setCreatorId('');
    setHostOnlyControl(true);
    setRoomHasPin(false);
    setRoomId('');
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  };

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRoomFromWindow();
      if (!parsed.roomId && !parsed.isTvPairLobby && inRoomRef.current) {
        manualLobbyStayRef.current = true;
        socketService.disconnect();
        setInRoom(false);
        setIsTvMode(false);
        setIsTvPairLobby(false);
        setTvAuthToken('');
        setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
        setShowGuestPopup(false);
        setIsPlayerMinimized(false);
        setIsPlayerClosedLocally(false);
        setCinemaModePersist(false);
        setSecondaryStream(null);
        setActivePoll(null);
        setRoomGameState(null);
        setPartyGameState(null);
        setPinnedMessage(null);
        setGameMoveError(null);
        setHostId('');
        setCreatorId('');
        setHostOnlyControl(true);
        setRoomHasPin(false);
        setRoomId('');
        setVideoState(INITIAL_VIDEO_STATE);
        setCloudFrame(null);
        setCloudState(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleSyncPlayerAction = useCallback(
    (action: 'play' | 'pause' | 'seek' | 'change_url', patch: Partial<VideoState>) => {
      const allowed = action === 'change_url' ? canChangeMedia : canControlRoom;
      if (!allowed) {
        const hostName = participants.find((p) => p.id === hostId)?.name;
        showHostLockNotice(hostName);
        return;
      }
      setVideoState((prev) => {
        const updated: VideoState = {
          ...prev,
          ...patch,
          lastUpdated: Date.now(),
          updatedBy: profile.name,
        };
        socketService.syncVideoState(action, updated, profile.name);
        return updated;
      });
    },
    [canChangeMedia, canControlRoom, participants, hostId, showHostLockNotice, profile.name]
  );

  // ============================================================================
  // STREAM EXTRACTION HANDLERS (MOVIES, SERIES, HISTORY, SPORTS, YOUTUBE, URL)
  // ============================================================================
  const handlePlayMovie = async (
    movie: CatalogMovie,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN',
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const startAtOverrideSec =
      typeof startOrOpts === 'number' ? startOrOpts : startOrOpts?.startAtSec;
    const forceSpanish =
      typeof startOrOpts === 'object' && startOrOpts !== null
        ? Boolean(startOrOpts.forceSpanish)
        : false;
    const langFullLabelMap: Record<'ES' | 'LAT' | 'VOSE' | 'EN', string> = {
      ES: 'Castellano (España)',
      LAT: 'Español Latino',
      VOSE: 'Subtitulado (VOSE)',
      EN: 'Inglés Original (EN)',
    };
    const requestedLangName = langFullLabelMap[preferLang] || 'Español HD';

    const histId = canonicalizeHistoryItemId({
      id: movie.id,
      mediaType: 'movie',
      tmdbId: movie.tmdbId,
    });
    const resumeAtSec =
      startAtOverrideSec !== undefined
        ? startAtOverrideSec
        : findSavedResumeSec(histId);

    const { reqSeq, signal } = beginMediaExtraction();

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext({
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      poster: movie.poster,
      backdrop: movie.backdrop,
      overview: movie.overview,
      preferLang,
    });
    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(movie.id);
    setExtractionError(null);
    setExtractionLabel(
      forceSpanish
        ? `${movie.title} · Forzando búsqueda en Castellano (ES)...`
        : resumeAtSec > 5
        ? `${movie.title} · Reanudando en ${requestedLangName}...`
        : `${movie.title} · Preparando ${requestedLangName}...`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'movie',
        tmdbId: movie.tmdbId ? String(movie.tmdbId) : '',
        url: movie.bingetrixUrl || movie.movidyUrl || movie.vestUrl || '',
        movidyUrl: movie.movidyUrl || '',
        vestUrl: movie.vestUrl || '',
        preferLang,
        title: movie.title,
        ...(movie.originalTitle ? { origTitle: movie.originalTitle } : {}),
        ...(movie.year && /^\d{4}$/.test(movie.year) ? { year: movie.year } : {}),
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        ...(forceSpanish ? { force: '1', forceSpanish: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        const errMsg =
          data?.error || 'No se pudo cargar esta película en este momento.';
        setExtractionError(errMsg);
        showLanguageNotice({
          type: 'error',
          title: `⚠️ Película no disponible en ${requestedLangName} ahora mismo`,
          subtitle: errMsg,
        });
        return;
      }

      if (data.mode === 'cloud') {
        socketService.startCloudBrowser(data.streamUrl, profile.name);
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const activeTrack = tracks[activeIdx];
      const activeLabel =
        activeTrack?.label || data.resolvedLabel || requestedLangName;

      if (data.languageFallbackUsed) {
        showLanguageNotice({
          type: 'warning',
          title: `⚠️ Idioma ${requestedLangName} no disponible en esta película`,
          subtitle: `Reproduciendo automáticamente en: ${activeLabel}`,
        });
      } else {
        showLanguageNotice({
          type: 'success',
          title: `🔊 Idioma activo: ${activeLabel}`,
          subtitle:
            tracks.length > 1
              ? `${tracks.length} opciones de idioma disponibles en la barra del reproductor`
              : `${movie.title} · Señal HD lista`,
        });
      }

      activeHistoryIdRef.current = histId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: movie.bingetrixUrl || movie.movidyUrl || movie.vestUrl || movie.id,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${activeLabel}`,
        poster: movie.poster,
        backdrop: movie.backdrop,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      const { list, item } = addWatchHistoryItem({
        id: histId,
        mediaType: 'movie',
        tmdbId: movie.tmdbId,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${activeLabel}`,
        poster: movie.poster,
        backdrop: movie.backdrop || movie.poster,
        year: movie.year,
        preferLang,
        bingetrixUrl: movie.bingetrixUrl,
        movidyUrl: movie.movidyUrl,
        vestUrl: movie.vestUrl,
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('Error de red al conectar con el motor RiffanTV.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlaySeriesEpisode = async (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN',
    startOrOpts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const startAtOverrideSec =
      typeof startOrOpts === 'number' ? startOrOpts : startOrOpts?.startAtSec;
    const forceSpanish =
      typeof startOrOpts === 'object' && startOrOpts !== null
        ? Boolean(startOrOpts.forceSpanish)
        : false;
    const epLoadId = sanitizeItemKey(
      `tv-${series.tmdbId}-${episode.seasonNumber}-${episode.episodeNumber}`
    );
    const resumeAtSec =
      startAtOverrideSec !== undefined
        ? startAtOverrideSec
        : findSavedResumeSec(epLoadId);

    const { reqSeq, signal } = beginMediaExtraction();

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(epLoadId);
    setExtractionError(null);

    const epCode = `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')}`;
    const optimisticTitle = `${series.title} · ${epCode}${episode.title ? ` · ${episode.title}` : ''}`;
    const currentSeasonSummary = series.seasons?.find(
      (s) => s.seasonNumber === episode.seasonNumber
    );

    // Instant metadata sync & clean old frame/url immediately:
    setVideoState((prev) => ({
      ...prev,
      title: optimisticTitle,
      seriesMeta: {
        tmdbId: series.tmdbId,
        seriesTitle: series.title,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        episodeTitle: episode.title,
        overview: episode.overview,
        totalEpisodesInSeason:
          currentSeasonSummary?.episodeCount || series.episodes?.length || 1,
        totalSeasons: series.seasons?.length || 1,
        poster: episode.still || series.poster,
        backdrop: episode.still || series.backdrop,
      },
      url: '', // Immediately drop old stream URL so frozen frame doesn't linger
      mode: 'idle',
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      poster: episode.still || series.poster || prev.poster,
      backdrop: episode.still || series.backdrop || prev.backdrop,
    }));

    setExtractionLabel(
      forceSpanish
        ? `${series.title} (${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
            2,
            '0'
          )}) · Forzando búsqueda en Castellano (ES)...`
        : `${series.title} (${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
            2,
            '0'
          )}) · ${resumeAtSec > 5 ? 'Reanudando...' : 'Preparando HD...'}`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'tv',
        tmdbId: String(series.tmdbId),
        season: String(episode.seasonNumber),
        episode: String(episode.episodeNumber),
        preferLang,
        title: series.title,
        ...(series.originalTitle ? { origTitle: series.originalTitle } : {}),
        ...(series.year && /^\d{4}$/.test(series.year) ? { year: series.year } : {}),
        episodeTitle: episode.title || '',
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        ...(forceSpanish ? { force: '1', forceSpanish: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          data?.error || 'Este episodio aún no tiene señal directa disponible.'
        );
        return;
      }

      if (data.mode === 'cloud') {
        socketService.startCloudBrowser(data.streamUrl, profile.name);
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const activeEpLabel =
        tracks[activeIdx]?.label || data.resolvedLabel || preferLang;

      if (data.languageFallbackUsed) {
        const reqLabel =
          preferLang === 'ES'
            ? 'Castellano'
            : preferLang === 'LAT'
            ? 'Español Latino'
            : preferLang === 'VOSE'
            ? 'VOSE'
            : 'Inglés / VOSE';
        showLanguageNotice({
          type: 'warning',
          title: `⚠️ Idioma ${reqLabel} no disponible en este episodio`,
          subtitle: `Reproduciendo en: ${activeEpLabel}`,
        });
      } else {
        showLanguageNotice({
          type: 'success',
          title: `🔊 Idioma activo: ${activeEpLabel}`,
          subtitle: `${series.title} · ${episode.seasonNumber}x${String(
            episode.episodeNumber
          ).padStart(2, '0')}`,
        });
      }

      const currentSeasonSummary = series.seasons.find(
        (s) => s.seasonNumber === episode.seasonNumber
      );

      activeHistoryIdRef.current = epLoadId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${series.title} · ${episode.seasonNumber}x${String(
          episode.episodeNumber
        ).padStart(2, '0')}`,
        subtitle: `${episode.title} · ${tracks[activeIdx]?.label || preferLang}`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
        seriesMeta: {
          tmdbId: series.tmdbId,
          seriesTitle: series.title,
          season: episode.seasonNumber,
          episode: episode.episodeNumber,
          episodeTitle: episode.title,
          totalEpisodesInSeason:
            currentSeasonSummary?.episodeCount || series.episodes.length,
          totalSeasons: series.seasons.length,
          poster: series.poster,
          backdrop: series.backdrop,
        },
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      const { list, item } = addWatchHistoryItem({
        id: epLoadId,
        mediaType: 'tv',
        tmdbId: series.tmdbId,
        title: series.title,
        subtitle: `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
          2,
          '0'
        )} · ${episode.title}`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop || series.poster,
        year: series.year,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        episodeTitle: episode.title,
        preferLang,
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('Error al conectar con el episodio seleccionado.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handleReplayHistoryItem = async (
    item: WatchHistoryItem,
    forceRestart = false
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const resumeAtSec = forceRestart ? 0 : Math.floor(item.resumeTimeSec || 0);

    if (item.mediaType === 'tv' && item.tmdbId && item.season && item.episode) {
      const epLoadId = sanitizeItemKey(
        `tv-${item.tmdbId}-${item.season}-${item.episode}`
      );
      const { reqSeq, signal } = beginMediaExtraction();
      scrollDesktopToPlayer();
      setIsExtracting(true);
      isExtractingRef.current = true;
      setLoadingItemId(item.id);
      setExtractionError(null);
      setExtractionLabel(
        `${item.title} (${item.season}x${String(item.episode).padStart(2, '0')}) · ${
          resumeAtSec > 5 ? 'Reanudando en el punto exacto...' : 'Cargando...'
        }`
      );

      try {
        const params = new URLSearchParams({
          mediaType: 'tv',
          tmdbId: String(item.tmdbId),
          season: String(item.season),
          episode: String(item.episode),
          preferLang: item.preferLang || 'ES',
          title: item.title,
          episodeTitle: item.episodeTitle || '',
          ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
        });
        const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
        const data = await res.json();
        if (reqSeq !== extractionReqSeqRef.current) return;
        if (!res.ok || !data?.success || !data?.streamUrl) {
          setExtractionError('Este episodio no está disponible en este momento.');
          return;
        }
        if (data.mode === 'cloud') {
          socketService.startCloudBrowser(data.streamUrl, profile.name);
          return;
        }

        const tracks: StreamTrack[] = data.tracks || [];
        const activeIdx = Math.max(
          0,
          tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
        );

        activeHistoryIdRef.current = epLoadId;

        const nextState: VideoState = {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          rawSourceUrl: epLoadId,
          title: `${item.title} · ${item.season}x${String(item.episode).padStart(2, '0')}`,
          subtitle: item.episodeTitle || tracks[activeIdx]?.label || item.preferLang,
          poster: item.poster,
          backdrop: item.backdrop || item.poster,
          currentTime: resumeAtSec,
          isPlaying: true,
          isLive: false,
          tracks,
          activeTrackIndex: activeIdx,
          subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
          seriesMeta: {
            tmdbId: item.tmdbId,
            seriesTitle: item.title,
            season: item.season,
            episode: item.episode,
            episodeTitle: item.episodeTitle,
            poster: item.poster,
            backdrop: item.backdrop,
          },
          lastUpdated: Date.now(),
          updatedBy: profile.name,
        };

        const { list, item: updatedHist } = addWatchHistoryItem({
          ...item,
          id: epLoadId,
          resumeTimeSec: resumeAtSec,
        });
        setWatchHistory(list);
        upsertCloudWatchHistory(updatedHist).catch(() => {});

        videoStateUrlRef.current = nextState.url;
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profile.name);
        playCinemaSound('play');
      } catch (err: unknown) {
        if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
        setExtractionError('Error al reanudar el episodio del historial.');
      } finally {
        if (reqSeq === extractionReqSeqRef.current) {
          isExtractingRef.current = false;
          setIsExtracting(false);
          setLoadingItemId(null);
        }
      }
      return;
    }

    await handlePlayMovie(
      {
        id: item.id,
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year || 'HD',
        rating: '',
        overview: '',
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        bingetrixUrl: item.bingetrixUrl,
        movidyUrl: item.movidyUrl,
        vestUrl: item.vestUrl,
        languages: [],
      },
      item.preferLang || 'ES',
      resumeAtSec
    );
  };

  const handlePlayFromProfileCatalog = async (item: CatalogMovie) => {
    if (item.mediaType === 'tv') {
      // Check if user already has a saved episode for this series in history
      const savedSeriesEp = watchHistory.find(
        (h) => h.mediaType === 'tv' && h.tmdbId && h.tmdbId === item.tmdbId
      );
      if (savedSeriesEp) {
        await handleReplayHistoryItem(savedSeriesEp, false);
        return;
      }
      // Otherwise jump straight to episode 1x01 or Series TV catalog
      if (item.tmdbId) {
        await handleReplayHistoryItem(
          {
            id: sanitizeItemKey(`tv-${item.tmdbId}-1-1`),
            mediaType: 'tv',
            tmdbId: item.tmdbId,
            title: item.title,
            subtitle: '1x01 · Episodio 1',
            poster: item.poster,
            backdrop: item.backdrop || item.poster,
            year: item.year,
            season: 1,
            episode: 1,
            episodeTitle: 'Episodio 1',
            preferLang: 'ES',
            watchedAt: Date.now(),
          },
          true
        );
        return;
      }
      setCatalogSection('series');
      setMobileTab('movies');
      return;
    }
    await handlePlayMovie(item, 'ES');
  };

  const handleStepEpisode = async (delta: -1 | 1) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const meta = videoState.seriesMeta;
    if (!meta) return;

    let targetSeason = meta.season;
    let targetEp = meta.episode + delta;

    if (delta > 0) {
      if (meta.totalEpisodesInSeason && targetEp > meta.totalEpisodesInSeason) {
        if (!meta.totalSeasons || meta.season < meta.totalSeasons) {
          targetSeason = meta.season + 1;
          targetEp = 1;
        } else {
          return;
        }
      }
    } else if (targetEp < 1) {
      if (meta.season <= 1) return;
      targetSeason = meta.season - 1;
      try {
        const seasonRes = await fetch(
          `/api/catalog/tv/${meta.tmdbId}?season=${targetSeason}&lang=${lang}`
        );
        const seasonData = await seasonRes.json();
        const epsCount = Array.isArray(seasonData?.details?.episodes)
          ? seasonData.details.episodes.length
          : 0;
        targetEp = epsCount > 0 ? epsCount : 1;
      } catch {
        targetEp = 1;
      }
    }

    const activeTrack = videoState.tracks[videoState.activeTrackIndex];
    const rawActiveLang = String(activeTrack?.lang || '').toUpperCase();
    const preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN' =
      rawActiveLang === 'LAT' || rawActiveLang === 'VOSE' || rawActiveLang === 'EN'
        ? rawActiveLang
        : 'ES';

    setIsExtracting(true);
    setExtractionError(null);
    setExtractionLabel(
      `${meta.seriesTitle} (${targetSeason}x${String(targetEp).padStart(
        2,
        '0'
      )}) · ${delta > 0 ? 'Siguiente episodio...' : 'Capítulo anterior...'}`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'tv',
        tmdbId: String(meta.tmdbId),
        season: String(targetSeason),
        episode: String(targetEp),
        preferLang,
        title: meta.seriesTitle,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          delta > 0
            ? 'No hay más episodios disponibles en esta temporada.'
            : 'No se pudo cargar el capítulo anterior.'
        );
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );

      const epLoadId = sanitizeItemKey(`tv-${meta.tmdbId}-${targetSeason}-${targetEp}`);
      activeHistoryIdRef.current = epLoadId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${meta.seriesTitle} · ${targetSeason}x${String(targetEp).padStart(2, '0')}`,
        subtitle: tracks[activeIdx]?.label || preferLang,
        poster: meta.poster,
        backdrop: meta.backdrop,
        currentTime: 0,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
        seriesMeta: {
          ...meta,
          season: targetSeason,
          episode: targetEp,
          episodeTitle: undefined,
        },
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      const { list, item } = addWatchHistoryItem({
        id: epLoadId,
        mediaType: 'tv',
        tmdbId: meta.tmdbId,
        title: meta.seriesTitle,
        subtitle: `${targetSeason}x${String(targetEp).padStart(2, '0')}`,
        poster: meta.poster || '',
        backdrop: meta.backdrop || meta.poster || '',
        season: targetSeason,
        episode: targetEp,
        preferLang,
        resumeTimeSec: 0,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch {
      setExtractionError(
        delta > 0
          ? 'Error al cargar el siguiente episodio.'
          : 'Error al cargar el capítulo anterior.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleNextEpisode = () => handleStepEpisode(1);
  const handlePrevEpisode = () => handleStepEpisode(-1);

  const handlePlaySportsMatch = async (
    match: SportsMatch,
    channelIndex: number,
    failedIndices: Set<number> = new Set(),
    activeExtraction?: { reqSeq: number; signal: AbortSignal },
    allowSameMatchMirrorFallback = channelIndex === 0 && failedIndices.size === 0
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const channel = match.channels[channelIndex];
    if (!channel) {
      setExtractionError('Este partido aún no tiene señal directa activa.');
      return;
    }

    const extraction = activeExtraction || beginMediaExtraction();
    const { reqSeq, signal } = extraction;

    if (failedIndices.size === 0) {
      setActiveMovieContext(null);
      const parsedTeams = (() => {
        if (match.matchMeta) {
          return { ...match.matchMeta, competition: match.competition };
        }
        if (match.sport === 'soccer' && !match.is247Channel) {
          const clean = match.title.replace(/\s+·\s+.*$/, '').trim();
          const parts = clean.split(/\s+(?:vs\.?|v)\s+/i);
          if (parts.length === 2 && parts[0].trim().length >= 2 && parts[1].trim().length >= 2) {
            return {
              homeTeam: parts[0].trim(),
              awayTeam: parts[1].trim(),
              competition: match.competition,
            };
          }
        }
        return null;
      })();
      if (parsedTeams) {
        setActiveSportsMatch(parsedTeams);
        setActiveMatchDetails(null);
        setShowLiveMatchDock(true);
      } else {
        setActiveSportsMatch(null);
        setActiveMatchDetails(null);
      }
    }

    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(`${match.id}-${channelIndex}`);
    setExtractionError(null);
    setExtractionLabel(`${match.title} · Conectando ${channel.label}...`);
    activeHistoryIdRef.current = null;

    try {
      const params = new URLSearchParams({
        url: channel.sourceUrl,
        resolverType: channel.resolverType || 'sports_channel',
        title: match.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json().catch(() => null);
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (allowSameMatchMirrorFallback && !match.is247Channel && match.channels.length > 1) {
          const nextFailed = new Set(failedIndices);
          nextFailed.add(channelIndex);
          const nextIdx = match.channels.findIndex((_, idx) => !nextFailed.has(idx));
          if (nextIdx !== -1) {
            await handlePlaySportsMatch(match, nextIdx, nextFailed, extraction, true);
            return;
          }
        }

        if (
          data?.canUseCloudBrowser === false ||
          /footunder\.online|tilinhd|streamxhd|rojadirectv/i.test(channel.sourceUrl)
        ) {
          setExtractionError(
            data?.error ||
              `La señal "${channel.label}" de ${match.title} no está disponible en este momento. Elige otra opción del partido o canal.`
          );
          return;
        }

        setExtractionError(
          data?.error ||
            `La señal "${channel.label}" no responde en este instante. Prueba otra opción disponible.`
        );
        return;
      }

      if (data.mode === 'cloud') {
        if (/footunder\.online|tilinhd|streamxhd/i.test(data.streamUrl || channel.sourceUrl)) {
          setExtractionError('Señal temporalmente fuera de servicio.');
          return;
        }
        socketService.startCloudBrowser(data.streamUrl, profile.name);
        return;
      }

      const healthyChannels = match.channels
        .map((c, idx) => (idx === channelIndex ? { ...c, resolvedStreamUrl: data.streamUrl } : c))
        .filter((_, idx) => !failedIndices.has(idx));
      const activeIdxInHealthy = Math.max(
        0,
        healthyChannels.findIndex((c) => c.id === channel.id)
      );

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: channel.sourceUrl,
        title: match.title,
        subtitle: `${match.competition} · ${channel.label}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: healthyChannels,
        activeTrackIndex: activeIdxInHealthy,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('No se pudo conectar con la señal seleccionada.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlayTdtChannel = async (
    tdtCh: SpanishTdtChannel,
    signalIndex = 0,
    liveProgramHint?: string,
    activeExtraction?: { reqSeq: number; signal: AbortSignal },
    allowSameChannelBackup = signalIndex === 0
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const chosenSignal = tdtCh.channels[signalIndex] || tdtCh.channels[0];
    if (!chosenSignal) return;

    const extraction = activeExtraction || beginMediaExtraction();
    const { reqSeq, signal } = extraction;

    if (allowSameChannelBackup) {
      setActiveMovieContext(null);
      const progParts = (liveProgramHint || '')
        .replace(/\s+·\s+.*$/, '')
        .split(/\s+(?:vs\.?|v)\s+/i);
      if (
        progParts.length === 2 &&
        progParts[0].trim().length >= 2 &&
        progParts[1].trim().length >= 2
      ) {
        setActiveSportsMatch({
          homeTeam: progParts[0].trim(),
          awayTeam: progParts[1].trim(),
          competition: tdtCh.name,
        });
        setActiveMatchDetails(null);
        setShowLiveMatchDock(true);
      } else {
        setActiveSportsMatch(null);
        setActiveMatchDetails(null);
      }
    }

    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(`tdt-${tdtCh.id}-${signalIndex}`);
    setExtractionError(null);
    setExtractionLabel(
      liveProgramHint
        ? `${tdtCh.name} · ${liveProgramHint}...`
        : `${tdtCh.name} · Conectando ${chosenSignal.label}...`
    );
    activeHistoryIdRef.current = null;

    const signalResolver = chosenSignal.resolverType || 'tdt_hls';

    try {
      const params = new URLSearchParams({
        url: chosenSignal.sourceUrl,
        resolverType: signalResolver,
        title: tdtCh.name,
      });
      const ctrl = new AbortController();
      const onParentAbort = () => ctrl.abort();
      if (signal.aborted) {
        ctrl.abort();
      } else {
        signal.addEventListener('abort', onParentAbort, { once: true });
      }
      const timeoutId = setTimeout(() => ctrl.abort(), 9500);
      let res: Response | null = null;
      let data: {
        success?: boolean;
        streamUrl?: string;
        mode?: VideoState['mode'];
        error?: string;
      } | null = null;
      try {
        res = await fetch(`/api/extract/stream?${params.toString()}`, { signal: ctrl.signal });
        data = await res.json().catch(() => null);
      } finally {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onParentAbort);
      }

      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res || !res.ok || !data?.success || !data?.streamUrl) {
        if (allowSameChannelBackup && signalIndex + 1 < tdtCh.channels.length) {
          await handlePlayTdtChannel(
            tdtCh,
            signalIndex + 1,
            liveProgramHint,
            extraction,
            true
          );
          return;
        }
        setExtractionError(
          data?.error || `La emisión de ${tdtCh.name} (${chosenSignal.label}) no responde en este instante.`
        );
        return;
      }

      const mappedTracks: StreamTrack[] = tdtCh.channels.map((sig, idx) => ({
        id: sig.id,
        label: `${tdtCh.name} · ${sig.label}`,
        lang: 'ES',
        quality: sig.quality,
        sourceUrl: sig.sourceUrl,
        resolverType: sig.resolverType || 'tdt_hls',
        resolvedStreamUrl: idx === signalIndex ? data.streamUrl : undefined,
      }));

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: chosenSignal.sourceUrl,
        title: tdtCh.name,
        subtitle: liveProgramHint
          ? `En emisión: ${liveProgramHint} · ${tdtCh.network}`
          : `TV en Directo · ${tdtCh.network} · ${chosenSignal.label}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: mappedTracks,
        activeTrackIndex: signalIndex,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch {
      if (signal.aborted || reqSeq !== extractionReqSeqRef.current) return;
      if (allowSameChannelBackup && signalIndex + 1 < tdtCh.channels.length) {
        await handlePlayTdtChannel(
          tdtCh,
          signalIndex + 1,
          liveProgramHint,
          extraction,
          true
        );
        return;
      }
      setExtractionError(`No se pudo conectar con ${tdtCh.name}.`);
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlayFavoriteChannel = async (favCh: FavoriteChannelItem) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const { reqSeq, signal } = beginMediaExtraction();

    const favParts = (favCh.title || '')
      .replace(/\s+·\s+.*$/, '')
      .split(/\s+(?:vs\.?|v)\s+/i);
    if (
      favCh.sport === 'soccer' &&
      favParts.length === 2 &&
      favParts[0].trim().length >= 2 &&
      favParts[1].trim().length >= 2
    ) {
      setActiveSportsMatch({
        homeTeam: favParts[0].trim(),
        awayTeam: favParts[1].trim(),
        competition: favCh.competition,
      });
      setActiveMatchDetails(null);
      setShowLiveMatchDock(true);
    } else {
      setActiveSportsMatch(null);
      setActiveMatchDetails(null);
    }

    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId(`favch-${favCh.favId}`);
    setExtractionError(null);
    setExtractionLabel(`${favCh.channelLabel} · Conectando canal favorito...`);
    activeHistoryIdRef.current = null;

    const isDirectTdtHls = /\.m3u8(\?|$)/i.test(favCh.channelUrl);
    const favResolver: StreamTrack['resolverType'] = isDirectTdtHls
      ? 'tdt_hls'
      : 'sports_channel';

    try {
      const params = new URLSearchParams({
        url: favCh.channelUrl,
        resolverType: favResolver,
        title: favCh.title || favCh.channelLabel,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json().catch(() => null);
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (/footunder\.online|tilinhd|streamxhd|rojadirectv/i.test(favCh.channelUrl)) {
          setExtractionError(
            data?.error || `El canal "${favCh.channelLabel}" no responde en este instante.`
          );
          return;
        }
        socketService.startCloudBrowser(favCh.channelUrl, profile.name);
        return;
      }

      if (data.mode === 'cloud') {
        socketService.startCloudBrowser(data.streamUrl, profile.name);
        return;
      }

      const singleTrack: StreamTrack = {
        id: favCh.favId,
        label: favCh.channelLabel,
        lang: 'ES',
        sourceUrl: favCh.channelUrl,
        resolverType: favResolver,
        resolvedStreamUrl: data.streamUrl,
      };

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: favCh.channelUrl,
        title: favCh.title || favCh.channelLabel,
        subtitle: `${favCh.competition} · ${favCh.channelLabel}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: [singleTrack],
        activeTrackIndex: 0,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError('No se pudo conectar con el canal favorito.');
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
  };

  const handlePlayYouTubeVideo = (item: YouTubeSearchItem) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    beginMediaExtraction();
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    isExtractingRef.current = false;
    setIsExtracting(false);
    setLoadingItemId(null);
    scrollDesktopToPlayer();
    setExtractionError(null);
    activeHistoryIdRef.current = null;
    const nextState: VideoState = {
      mode: 'youtube',
      url: item.videoId,
      rawSourceUrl: item.url,
      title: item.title,
      subtitle: `YouTube · ${item.channel}`,
      poster: item.thumbnail,
      backdrop: item.thumbnail,
      currentTime: 0,
      isPlaying: true,
      isLive: item.duration === 'LIVE',
      tracks: [],
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profile.name,
    };
    videoStateUrlRef.current = nextState.url;
    setVideoState(nextState);
    socketService.syncVideoState('change_url', nextState, profile.name);
    playCinemaSound('play');
  };

  const handlePlayCatalaEpisode = async (
    series: CatalaSeriesDetails,
    episode: CatalaEpisodeItem
  ) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    scrollDesktopToPlayer();
    setExtractionError(null);
    activeHistoryIdRef.current = null;

    if (episode.sourceType === 'ccma_3cat' && episode.ccmaVideoId) {
      const { reqSeq, signal } = beginMediaExtraction();
      setIsExtracting(true);
      isExtractingRef.current = true;
      setLoadingItemId(episode.id);
      setExtractionLabel(`${series.title} · Carregant senyal 3Cat en català...`);
      try {
        const res = await fetch(
          `/api/extract/catala-3cat?vidId=${encodeURIComponent(episode.ccmaVideoId)}`,
          { signal }
        );
        const data = await res.json();
        if (reqSeq !== extractionReqSeqRef.current) return;
        if (!res.ok || !data?.success || !data?.streamUrl) {
          setExtractionError('Aquest capítol de 3Cat no està disponible ara mateix.');
          return;
        }
        if (data.mode === 'cloud') {
          socketService.startCloudBrowser(data.streamUrl, profile.name);
          return;
        }
        const nextState: VideoState = {
          mode: 'direct',
          url: data.streamUrl,
          rawSourceUrl: episode.id,
          title: `${series.title} · Cap. ${episode.detectedNumber || episode.episodeNumber}`,
          subtitle: `${episode.title} · Català (SX3 / 3Cat)`,
          poster: series.poster,
          backdrop: series.backdrop || series.poster,
          currentTime: 0,
          isPlaying: true,
          isLive: false,
          tracks: data.tracks || [],
          activeTrackIndex: 0,
          seriesMeta: undefined,
          lastUpdated: Date.now(),
          updatedBy: profile.name,
        };
        videoStateUrlRef.current = nextState.url;
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profile.name);
        playCinemaSound('play');
      } catch (err: unknown) {
        if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
        setExtractionError('Error en connectar amb el servidor de 3Cat.');
      } finally {
        if (reqSeq === extractionReqSeqRef.current) {
          isExtractingRef.current = false;
          setIsExtracting(false);
          setLoadingItemId(null);
        }
      }
      return;
    }

    if (episode.sourceType === 'youtube' && (episode.youtubeVideoId || episode.streamUrl)) {
      beginMediaExtraction();
      isExtractingRef.current = false;
      setIsExtracting(false);
      setLoadingItemId(null);
      const ytId = episode.youtubeVideoId || episode.streamUrl || '';
      const nextState: VideoState = {
        mode: 'youtube',
        url: ytId,
        rawSourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
        title: `${series.title} · ${episode.title}`,
        subtitle: episode.audioNote || 'Arxiu en Català (K3 / 3XL)',
        poster: episode.still || series.poster,
        backdrop: series.backdrop || series.poster,
        currentTime: 0,
        isPlaying: true,
        isLive: false,
        tracks:
          Array.isArray(episode.tracks) && episode.tracks.length > 0
            ? episode.tracks
            : [
                {
                  id: `cat-yt-${episode.id}`,
                  label: 'Arxiu Català · YouTube HD',
                  lang: 'ES',
                  quality: 'HD',
                  sourceUrl: ytId,
                  resolverType: 'youtube',
                  resolvedStreamUrl: ytId,
                },
              ],
        activeTrackIndex: 0,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
      return;
    }

    if (!episode.streamUrl) {
      setExtractionError('Capítol sense flux directe disponible.');
      return;
    }

    beginMediaExtraction();
    isExtractingRef.current = false;
    setIsExtracting(false);
    setLoadingItemId(null);

    const tracks: StreamTrack[] =
      Array.isArray(episode.tracks) && episode.tracks.length > 0
        ? episode.tracks
        : [
            {
              id: `cat-direct-${episode.id}`,
              label: 'Català HD · Directe',
              lang: 'ES',
              quality: 'HD',
              sourceUrl: episode.streamUrl,
              resolverType: 'direct_mp4',
              resolvedStreamUrl: episode.streamUrl,
            },
          ];

    const nextState: VideoState = {
      mode: 'direct',
      url: episode.streamUrl,
      rawSourceUrl: episode.id,
      title: `${series.title} · Cap. ${episode.episodeNumber}`,
      subtitle: `${episode.title} · ${episode.audioNote || 'Àudio en Català'}`,
      poster: series.poster,
      backdrop: series.backdrop || series.poster,
      currentTime: 0,
      isPlaying: true,
      isLive: false,
      tracks,
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profile.name,
    };

    videoStateUrlRef.current = nextState.url;
    setVideoState(nextState);
    socketService.syncVideoState('change_url', nextState, profile.name);
    playCinemaSound('play');
  };

  const resolveTrackPlaybackMode = (
    track: StreamTrack,
    fallbackMode: PlaybackEngineMode
  ): PlaybackEngineMode => {
    if (track.resolverType === 'youtube') return 'youtube';
    if (track.resolverType === 'web_embed') return 'embed';
    if (track.resolverType === 'direct_mp4') return 'direct';
    if (fallbackMode === 'embed' || fallbackMode === 'youtube') return 'hls';
    return fallbackMode || 'hls';
  };

  const handleSelectTrack = async (trackIndex: number, resumeTimeSec: number) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const targetTrack = videoState.tracks[trackIndex];
    if (!targetTrack) return;

    if (targetTrack.resolverType === 'cloud_browser' && targetTrack.sourceUrl) {
      socketService.startCloudBrowser(targetTrack.sourceUrl, profile.name);
      return;
    }

    const resumeAt = videoState.isLive ? 0 : resumeTimeSec;

    if (targetTrack.resolvedStreamUrl) {
      beginMediaExtraction();
      isExtractingRef.current = false;
      setIsExtracting(false);
      const nextMode = resolveTrackPlaybackMode(targetTrack, videoState.mode);
      const instantState: VideoState = {
        ...videoState,
        mode: nextMode,
        url: targetTrack.resolvedStreamUrl,
        rawSourceUrl: targetTrack.sourceUrl,
        subtitle: targetTrack.label,
        currentTime: resumeAt,
        isPlaying: true,
        activeTrackIndex: trackIndex,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };
      videoStateUrlRef.current = instantState.url;
      setVideoState(instantState);
      socketService.syncVideoState('change_url', instantState, profile.name);
      showLanguageNotice({
        type: 'success',
        title: `✓ Fuente activa: ${targetTrack.label}`,
        subtitle:
          resumeAt > 3 && (nextMode === 'hls' || nextMode === 'direct')
            ? `Sincronizado en el segundo exacto (${Math.floor(resumeAt / 60)}:${String(
                Math.floor(resumeAt % 60)
              ).padStart(2, '0')})`
            : 'Reproduciendo señal HD sincronizada',
      });
      return;
    }

    const { reqSeq, signal } = beginMediaExtraction();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setExtractionError(null);
    setExtractionLabel(
      videoState.isLive
        ? `Conectando señal: ${targetTrack.label}...`
        : `Cambiando idioma a ${targetTrack.label}...`
    );
    showLanguageNotice({
      type: 'success',
      title: videoState.isLive
        ? `⏳ Conectando señal: ${targetTrack.label}...`
        : `⏳ Cargando idioma: ${targetTrack.label}...`,
      subtitle: 'Conectando servidor HD...',
    });

    try {
      const params = new URLSearchParams({
        url: targetTrack.sourceUrl,
        resolverType: targetTrack.resolverType,
        preferLang: String(targetTrack.lang || 'ES').toUpperCase(),
        title: videoState.title,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json().catch(() => null);
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (!res.ok || !data?.success || !data?.streamUrl) {
        // For live TV / football signals: NEVER auto-jump to a different track! Inform the user and keep current playback.
        if (videoState.isLive) {
          showLanguageNotice({
            type: 'warning',
            title: `⚠️ Señal no disponible: ${targetTrack.label}`,
            subtitle: 'Mantenemos tu emisión actual. Puedes elegir otra señal manualmente.',
          });
          return;
        }

        const requestedLang = String(targetTrack.lang || '').toUpperCase();
        const prunedTracks = videoState.tracks.filter((_, idx) => idx !== trackIndex);
        const prunedActiveIdx = Math.max(
          0,
          Math.min(
            prunedTracks.length - 1,
            videoState.activeTrackIndex > trackIndex
              ? videoState.activeTrackIndex - 1
              : videoState.activeTrackIndex
          )
        );
        setVideoState((prev) => ({
          ...prev,
          tracks: prunedTracks,
          activeTrackIndex: prunedActiveIdx,
        }));

        const sameLangIdx = videoState.tracks.findIndex(
          (tr, idx) =>
            idx !== trackIndex && String(tr.lang || '').toUpperCase() === requestedLang
        );
        if (sameLangIdx !== -1) {
          const adjustedBackupIdx =
            sameLangIdx > trackIndex ? sameLangIdx - 1 : sameLangIdx;
          isExtractingRef.current = false;
          setIsExtracting(false);
          setTimeout(() => {
            handleSelectTrack(adjustedBackupIdx, resumeAt);
          }, 10);
          return;
        }

        const msg = `El servidor de "${targetTrack.label}" no responde ahora mismo.`;
        setExtractionError(msg);
        showLanguageNotice({
          type: 'warning',
          title: `Servidor caído: ${targetTrack.label}`,
          subtitle: 'Se ha ocultado la pista inactiva automáticamente.',
        });
        return;
      }

      const updatedTracks = videoState.tracks.map((tr, idx) =>
        idx === trackIndex ? { ...tr, resolvedStreamUrl: data.streamUrl } : tr
      );

      const nextState: VideoState = {
        ...videoState,
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: targetTrack.sourceUrl,
        subtitle: targetTrack.label,
        currentTime: resumeAt,
        isPlaying: true,
        tracks: updatedTracks,
        activeTrackIndex: trackIndex,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      showLanguageNotice({
        type: 'success',
        title: `✓ Fuente activa: ${targetTrack.label}`,
        subtitle: videoState.isLive
          ? 'Señal en directo actualizada'
          : 'Audio actualizado correctamente en la sala',
      });
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      if (!videoState.isLive) {
        setExtractionError('Error al cambiar de fuente.');
      }
      showLanguageNotice({
        type: 'error',
        title: `⚠️ Error al conectar ${targetTrack.label}`,
        subtitle: 'No se pudo conectar con ese servidor.',
      });
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
      }
    }
  };

  const handlePlayCustomUrl = async (rawUrl: string) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId('custom-url');
    setExtractionError(null);
    setExtractionLabel('Analizando enlace y extrayendo flujo limpio...');

    try {
      const params = new URLSearchParams({
        url: rawUrl,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data?.success && data?.streamUrl) {
        if (data.mode === 'cloud') {
          socketService.startCloudBrowser(data.streamUrl, profile.name);
          return;
        }
        const nextState: VideoState = {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          rawSourceUrl: rawUrl,
          title: data.title || 'Reproducción Directa HD',
          subtitle:
            data.mode === 'youtube'
              ? 'YouTube Sincronizado'
              : data.mode === 'embed'
              ? 'Reproductor Web Integrado'
              : data.resolvedLabel || 'Flujo Nativo Sin Anuncios',
          poster: data.poster || undefined,
          backdrop: data.backdrop || data.poster || undefined,
          currentTime: 0,
          isPlaying: true,
          isLive: false,
          tracks: data.tracks || [],
          activeTrackIndex: Math.max(
            0,
            Array.isArray(data.tracks)
              ? data.tracks.findIndex((tr: StreamTrack) => tr.resolvedStreamUrl === data.streamUrl)
              : 0
          ),
          subtitles: Array.isArray(data.subtitles) ? data.subtitles : undefined,
          seriesMeta: undefined,
          lastUpdated: Date.now(),
          updatedBy: profile.name,
        };
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profile.name);
        playCinemaSound('play');
      } else {
        socketService.startCloudBrowser(rawUrl, profile.name);
      }
    } catch {
      socketService.startCloudBrowser(rawUrl, profile.name);
    } finally {
      setIsExtracting(false);
      setLoadingItemId(null);
    }
  };

  const handleAddToQueue = (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => {
    const newItem: RoomQueueItem = {
      ...item,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      addedBy: profile.name,
    };
    socketService.addToQueue(newItem);
    if (queueToastTimerRef.current) clearTimeout(queueToastTimerRef.current);
    setQueueAddedNotice(item.title);
    queueToastTimerRef.current = setTimeout(() => {
      setQueueAddedNotice(null);
    }, 3600);
  };

  const handleOpenRoomQueueView = () => {
    setQueueAddedNotice(null);
    enterWorld('sala');
    setOpenQueueTrigger((n) => n + 1);
  };

  const handlePlayQueueItem = (qItem: RoomQueueItem) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    socketService.removeFromQueue(qItem.id);
    if (qItem.kind === 'youtube' && qItem.youtubeId) {
      handlePlayYouTubeVideo({
        id: qItem.youtubeId,
        videoId: qItem.youtubeId,
        title: qItem.title,
        channel: qItem.addedBy,
        duration: 'HD',
        views: '',
        thumbnail: qItem.poster || '',
        url: qItem.url || `https://youtube.com/watch?v=${qItem.youtubeId}`,
      });
    } else if (qItem.kind === 'tv' && qItem.tmdbId) {
      const season = qItem.season || 1;
      const episode = qItem.episode || 1;
      handleReplayHistoryItem(
        {
          id: sanitizeItemKey(`tv-${qItem.tmdbId}-${season}-${episode}`),
          mediaType: 'tv',
          tmdbId: qItem.tmdbId,
          title: qItem.title,
          subtitle: qItem.subtitle || `${season}x${String(episode).padStart(2, '0')}`,
          poster: qItem.poster || '',
          backdrop: qItem.poster || '',
          season,
          episode,
          preferLang: qItem.preferLang || 'ES',
          watchedAt: Date.now(),
        },
        true
      );
    } else if (qItem.kind === 'movie') {
      handlePlayMovie(
        {
          id: qItem.id,
          tmdbId: qItem.tmdbId,
          title: qItem.title,
          year: 'HD',
          rating: '',
          overview: '',
          poster: qItem.poster || '',
          backdrop: qItem.poster || '',
          bingetrixUrl: qItem.url,
          vestUrl: qItem.vestUrl,
          languages: [],
        },
        qItem.preferLang || 'ES'
      );
    } else if (qItem.url) {
      handlePlayCustomUrl(qItem.url);
    }
  };
  handlePlayQueueItemRef.current = handlePlayQueueItem;

  // ============================================================================
  // MULTI-VIEW DUAL-MATCH & ROOM POLL / HOST LOCK HANDLERS
  // ============================================================================
  const handlePlaySecondaryChannel = async (opts: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => {
    const mvResolver: StreamTrack['resolverType'] = /\.m3u8(\?|$)/i.test(opts.sourceUrl)
      ? 'tdt_hls'
      : 'sports_channel';

    // If no primary stream is active yet, only Host / Co-anfitrión can start room playback
    if (videoState.mode === 'idle') {
      if (!canChangeMedia) {
        showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
        return;
      }
      await handlePlaySportsMatch(
        {
          id: `mv-init-${Date.now()}`,
          time: 'EN VIVO',
          sport: 'soccer',
          isLive: true,
          competition: opts.subtitle || 'Multicanal HD',
          title: opts.title,
          channels: [
            {
              id: 'mv-ch-0',
              label: opts.title,
              lang: 'ES',
              sourceUrl: opts.sourceUrl,
              resolverType: mvResolver,
            },
          ],
        },
        0
      );
      return;
    }

    scrollDesktopToPlayer();
    setLoadingItemId(`mv-${opts.sourceUrl}`);
    setExtractionError(null);

    try {
      const params = new URLSearchParams({
        url: opts.sourceUrl,
        resolverType: mvResolver,
        title: opts.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          data?.error || 'Esta señal secundaria no está emitiendo en este momento.'
        );
        return;
      }

      setSecondaryStream((prev) => ({
        url: data.streamUrl,
        rawSourceUrl: opts.sourceUrl,
        title: opts.title,
        subtitle: opts.subtitle,
        mode: data.mode === 'direct' ? 'direct' : 'hls',
        layout: prev?.layout || 'corner',
      }));
      playCinemaSound('play');
    } catch {
      setExtractionError('Error al conectar la 2ª pantalla Multiview.');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleSwapSecondaryStream = () => {
    if (!secondaryStream) return;
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('medium');

    const prevMain = videoState;
    const prevSec = secondaryStream;

    const promotedMain: VideoState = {
      mode: prevSec.mode,
      url: prevSec.url,
      rawSourceUrl: prevSec.rawSourceUrl,
      title: prevSec.title,
      subtitle: prevSec.subtitle || 'Multiview · Señal Principal',
      currentTime: 0,
      isPlaying: true,
      isLive: true,
      tracks: [],
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profile.name,
    };

    if (prevMain.mode === 'hls' || prevMain.mode === 'direct') {
      setSecondaryStream({
        url: prevMain.url,
        rawSourceUrl: prevMain.rawSourceUrl,
        title: prevMain.title,
        subtitle: prevMain.subtitle,
        mode: prevMain.mode,
        layout: prevSec.layout,
      });
    } else {
      setSecondaryStream(null);
    }

    setVideoState(promotedMain);
    socketService.syncVideoState('change_url', promotedMain, profile.name);
  };

  const handleToggleSecondaryLayout = () => {
    triggerHaptic('light');
    setSecondaryStream((prev) =>
      prev
        ? {
            ...prev,
            layout: prev.layout === 'split' ? 'corner' : 'split',
          }
        : null
    );
  };

  const handleCloseSecondaryStream = () => {
    triggerHaptic('light');
    setSecondaryStream(null);
  };

  const handleToggleHostLock = (nextLocked: boolean) => {
    triggerHaptic('light');
    socketService.setHostLock(nextLocked);
  };

  const handleStartPollFromQueue = () => {
    if (roomQueue.length < 2) return;
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('success');
    const proposals: PollProposalItem[] = roomQueue
      .slice(0, 4)
      .map(({ id: _id, addedBy: _addedBy, ...proposal }) => proposal);
    socketService.startPoll(
      pickLang(lang, {
        es: '¿Qué vemos ahora en la sala?',
        ca: 'Què veiem ara a la sala?',
        en: 'What should we watch next?',
      }),
      proposals,
      25
    );
    enterWorld('sala');
  };

  const handleVotePoll = (pollId: string, optionId: string) => {
    socketService.votePoll(pollId, optionId);
  };

  const handleClosePoll = (pollId: string) => {
    socketService.closePoll(pollId);
  };

  // ============================================================================
  // PERMANENT CLOUD ROOMS, PRIVATE 4-DIGIT PIN & SMART TV REMOTE HANDLERS
  // ============================================================================
  const normalizedRoomCode = roomId.trim().toLowerCase();
  const currentSavedRoom = savedRooms.find(
    (r) => r.roomCode.toLowerCase() === normalizedRoomCode
  );
  const isCurrentRoomPermanent = Boolean(currentSavedRoom);
  const currentHostPin =
    sessionPinMap[normalizedRoomCode] ||
    (currentSavedRoom?.hasPin ? currentSavedRoom.pinCode : undefined);

  // Keep Firestore permanent room blueprint automatically synced whenever room settings or queue change
  useEffect(() => {
    if (
      !authUser ||
      !authUser.emailVerified ||
      !inRoom ||
      !normalizedRoomCode ||
      !isCurrentRoomPermanent ||
      !currentUser.isHost
    ) {
      return;
    }

    const timer = setTimeout(() => {
      upsertCloudSavedRoom({
        roomCode: normalizedRoomCode,
        roomName: roomName || `Sala ${normalizedRoomCode.toUpperCase()}`,
        hasPin: roomHasPin,
        pinCode: roomHasPin ? currentHostPin : undefined,
        hostOnlyControl,
        lastActiveTitle:
          videoState.mode !== 'idle' ? videoState.title : currentSavedRoom?.lastActiveTitle,
        queueItems: roomQueue,
      }).catch(() => {});
    }, 1100);

    return () => clearTimeout(timer);
  }, [
    authUser,
    inRoom,
    normalizedRoomCode,
    isCurrentRoomPermanent,
    currentUser.isHost,
    roomName,
    roomHasPin,
    currentHostPin,
    hostOnlyControl,
    videoState.mode,
    videoState.title,
    roomQueue,
    currentSavedRoom?.lastActiveTitle,
  ]);

  const handleTogglePermanentRoom = async () => {
    if (!authUser || !authUser.emailVerified || !normalizedRoomCode) return;
    if (isCurrentRoomPermanent) {
      await deleteCloudSavedRoom(normalizedRoomCode);
    } else {
      await upsertCloudSavedRoom({
        roomCode: normalizedRoomCode,
        roomName: roomName || `Sala ${normalizedRoomCode.toUpperCase()}`,
        hasPin: roomHasPin,
        pinCode: roomHasPin ? currentHostPin : undefined,
        hostOnlyControl,
        lastActiveTitle: videoState.mode !== 'idle' ? videoState.title : undefined,
        queueItems: roomQueue,
      });
    }
  };

  const handleDeleteSavedRoom = async (targetRoomCode: string) => {
    await deleteCloudSavedRoom(targetRoomCode);
  };

  const handleSetRoomPin = (nextPinCode: string) => {
    if (!currentUser.isHost) return;
    const trimmed = nextPinCode.trim();
    if (trimmed === '') {
      rememberSessionPin(roomId, '');
      setRoomHasPin(false);
      socketService.setRoomPin('');
    } else if (/^[0-9]{4}$/.test(trimmed)) {
      rememberSessionPin(roomId, trimmed);
      setRoomHasPin(true);
      socketService.setRoomPin(trimmed);
    }
  };

  const handleSubmitGuestPin = (enteredPin: string) => {
    rememberSessionPin(roomId, enteredPin);
    socketService.submitRoomPin(enteredPin);
  };

  const handleRenameRoom = (nextName: string) => {
    if (!currentUser.isHost) return;
    const clean = nextName.trim().slice(0, 60);
    if (!clean) return;
    setRoomName(clean);
    socketService.renameRoom(clean);
  };

  const lastTvRemoteSeqRef = useRef<number>(0);

  // HTTP Polling Sync Fallback when running in Smart TV Mode (Samsung Tizen / LG webOS)
  // Guarantees room playback + remote control work 100% even if TV browser blocks WebSockets
  useEffect(() => {
    if (!inRoom || !isTvMode || !roomId) return;
    let cancelled = false;

    const pollRoomForTv = async () => {
      if (cancelled || socketService.isConnected()) return;
      try {
        const params = new URLSearchParams({
          tv: '1',
          tvId: `${profile.id}-tv`,
          tvName: profile.name || 'Samsung Smart TV',
        });
        if (tvAuthToken) params.set('tvAuthToken', tvAuthToken);
        const savedPin = sessionPinMap[roomId.toLowerCase()];
        if (savedPin) params.set('pin', savedPin);

        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomId)}?${params.toString()}`
        );
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (!cancelled && errData?.hasPin) {
            setPinPromptState({
              open: true,
              roomName: errData.roomName || `Sala ${roomId.toUpperCase()}`,
              invalidAttempt: false,
            });
          }
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data?.name) setRoomName(data.name);
        if (Array.isArray(data?.participants)) setParticipants(data.participants);

        if (data?.videoState) {
          setVideoState((prev) => {
            const next = data.videoState as VideoState;
            const urlChanged = next.url !== prev.url || next.mode !== prev.mode;
            const playChanged = next.isPlaying !== prev.isPlaying;
            const trackChanged = next.activeTrackIndex !== prev.activeTrackIndex;
            const timeDrift =
              !next.isLive && Math.abs((next.currentTime || 0) - (prev.currentTime || 0)) > 3.2;

            if (urlChanged || playChanged || trackChanged || timeDrift) {
              return next;
            }
            return prev;
          });
        }

        if (
          data?.lastTvRemoteCommand &&
          typeof data.lastTvRemoteCommand.seq === 'number' &&
          data.lastTvRemoteCommand.seq > lastTvRemoteSeqRef.current
        ) {
          const isInitialSync = lastTvRemoteSeqRef.current === 0;
          lastTvRemoteSeqRef.current = data.lastTvRemoteCommand.seq;
          if (!isInitialSync && Date.now() - Number(data.lastTvRemoteCommand.ts || 0) < 8000) {
            socketService.emitLocal({
              type: 'TV_REMOTE_COMMAND',
              payload: data.lastTvRemoteCommand,
            });
          }
        }
      } catch {
        // ignore transient network error
      }
    };

    pollRoomForTv();
    const interval = setInterval(pollRoomForTv, 2200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [inRoom, isTvMode, roomId, profile.id, profile.name, tvAuthToken, sessionPinMap]);

  const handleClaimTvCode = async (fourDigitCode: string) => {
    setTvClaimStatus(null);
    if (tvClaimTimerRef.current) clearTimeout(tvClaimTimerRef.current);

    try {
      const res = await fetch('/api/tv/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: fourDigitCode,
          roomId,
          roomName: roomName || `Sala ${roomId.toUpperCase()}`,
          claimedBy: profile.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        playCinemaSound('join');
        setTvClaimStatus({
          type: 'success',
          message: pickLang(lang, {
            es: '✓ Smart TV vinculada y proyectando en esta sala',
            ca: '✓ Smart TV vinculada i projectant en aquesta sala',
            en: '✓ Smart TV paired and projecting in this room',
          }),
        });
      } else {
        setTvClaimStatus({
          type: 'error',
          message:
            data?.error ||
            pickLang(lang, {
              es: 'Código de TV no encontrado o caducado.',
              ca: 'Codi de TV no trobat o caducat.',
              en: 'TV code not found or expired.',
            }),
        });
      }
      tvClaimTimerRef.current = setTimeout(() => {
        setTvClaimStatus(null);
      }, 5000);
    } catch {
      // Fallback to WebSocket claim if fetch failed
      socketService.claimTvPairingCode(
        fourDigitCode,
        roomName || `Sala ${roomId.toUpperCase()}`,
        profile.name
      );
    }
  };

  const handleRemoteTogglePlay = () => {
    if (videoState.mode === 'idle') return;
    const nextPlaying = !videoState.isPlaying;
    handleSyncPlayerAction(nextPlaying ? 'play' : 'pause', {
      isPlaying: nextPlaying,
    });
  };

  const handleRemoteSeekDelta = (deltaSec: number) => {
    if (videoState.mode === 'idle' || videoState.isLive) return;
    const targetSec = Math.max(0, (videoState.currentTime || 0) + deltaSec);
    handleSyncPlayerAction('seek', { currentTime: targetSec });
  };

  const handleSendTvRemoteCommand = (cmd: TvRemoteCommandType) => {
    if (socketService.isConnected()) {
      socketService.sendTvRemoteCommand(cmd, profile.name);
    } else {
      fetch('/api/tv/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          command: cmd,
          senderName: profile.name,
          userId: profile.id,
        }),
      }).catch(() => {});
    }
  };

  const handleOpenCloudBrowser = (url: string) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    scrollDesktopToPlayer();
    setExtractionError(null);
    socketService.startCloudBrowser(url, profile.name);
  };

  const handlePromoteCloudStreamToNative = (proxiedStreamUrl: string) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('success');
    socketService.stopCloudBrowser();
    const isMp4 = proxiedStreamUrl.includes('/api/ts-proxy');
    const nextState: VideoState = {
      mode: isMp4 ? 'direct' : 'hls',
      url: proxiedStreamUrl,
      rawSourceUrl: cloudState?.url || proxiedStreamUrl,
      title: cloudState?.title || 'Stream Capturado HD',
      subtitle: 'Reproducción nativa extraída del Cloud Browser',
      currentTime: 0,
      isPlaying: true,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      seriesMeta: undefined,
      lastUpdated: Date.now(),
      updatedBy: profile.name,
    };
    setVideoState(nextState);
    socketService.syncVideoState('change_url', nextState, profile.name);
  };

  const handleShareOrCopyHeaderInvite = async () => {
    triggerHaptic('light');
    setFriendsModalOpen(true);
  };

  const handleAcceptIncomingRoomInvite = (invite: IncomingRoomInvite) => {
    triggerHaptic('success');
    playCinemaSound('join');
    setIncomingInvite(null);
    setFriendsModalOpen(false);
    manualLobbyStayRef.current = false;
    setIsTvPairLobby(false);
    setIsTvMode(false);
    setTvAuthToken(invite.inviteAuthToken || '');
    setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setSecondaryStream(null);
    setActivePoll(null);
    setHostId('');
    setCreatorId('');
    setHostOnlyControl(true);
    setRoomHasPin(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
    setCatalogSection('home');
    setMobileTab('home');
    setActiveWorld('entry');
    setWorldSearchQuery('');
    setRoomId(invite.roomId);
    setRoomName(invite.roomName || `Sala ${invite.roomId.toUpperCase()}`);
    setInRoom(true);
  };

  const handleUpdateProfile = (nextName: string, nextAvatar: string, nextColor: string) => {
    const updated: StoredProfile = {
      id: profile.id,
      name: nextName,
      avatar: nextAvatar || profile.avatar || '🎬',
      color: nextColor || profile.color || '#9146FF',
      isCustomized: true,
    };
    saveStoredProfile(updated, true);
    setProfile(updated);
    setShowGuestPopup(false);
    socketService.updateProfile(
      profile.id,
      updated.name,
      updated.avatar,
      updated.color
    );
    updateCloudUserProfile(updated).catch(() => {});
  };

  const handleDismissGuestPopup = () => {
    dismissGuestPopupForRoom(roomId);
    setShowGuestPopup(false);
  };

  const handleRemoveHistoryItem = (id: string) => {
    setWatchHistory(removeWatchHistoryItem(id));
    deleteCloudWatchHistoryItem(id).catch(() => {});
  };

  const handleClearAllHistory = () => {
    const prevItems = [...watchHistory];
    setWatchHistory(clearWatchHistory());
    clearCloudWatchHistoryItems(prevItems).catch(() => {});
  };

  // Physical Google TV / Chromecast Remote Back & Channel Zapping Integration
  useTvRemoteBridge({
    isAdsPageOpen,
    setIsAdsPageOpen,
    smartTvModalOpen,
    setSmartTvModalOpen,
    friendsModalOpen,
    setFriendsModalOpen,
    profileHubOpen,
    setProfileHubOpen,
    floatingChatOpen,
    setFloatingChatOpen,
    sidebarOpen: isFloatingRoomOpen,
    setSidebarOpen: setIsFloatingRoomOpen,
    videoState,
    isExtracting,
    isPlayerClosedLocally,
    setIsPlayerClosedLocally,
    setIsExtracting,
    inRoom,
    catalogSection,
    setCatalogSection: (sec) => {
      if (sec === 'home') {
        enterWorld('entry');
      } else {
        setCatalogSection(sec);
      }
    },
    setMobileTab,
    handleSelectTrack,
  });

  const isOnMobileSocialTab = activeWorld === 'sala';
  const isGamesSectionActive = activeWorld === 'juegos';

  if (showDesignSystem) {
    return (
      <React.Suspense fallback={null}>
        <DesignSystemShowcase
          onClose={() => {
            setShowDesignSystem(false);
            if (
              typeof window !== 'undefined' &&
              window.location.pathname.toLowerCase().includes('/design-system')
            ) {
              const backPath = inRoom && roomId ? `/${roomId}` : '/';
              window.history.replaceState({}, '', backPath);
            }
          }}
        />
      </React.Suspense>
    );
  }

  // ============================================================================
  // RENDER -1: NAIMCINE ADS PROMOTIONAL & PNG EXPORT PAGE (/ads)
  // ============================================================================
  if (isAdsPageOpen) {
    return (
      <React.Suspense fallback={null}>
        <NaimCineAdsPage
          onBack={() => {
            setIsAdsPageOpen(false);
            if (
              typeof window !== 'undefined' &&
              (/^\/(ads|naimcine-ads)\b/i.test(window.location.pathname) ||
                window.location.search.includes('ads=1'))
            ) {
              const backPath = inRoom && roomId ? `/${roomId}` : '/';
              window.history.replaceState({}, '', backPath);
            }
          }}
        />
      </React.Suspense>
    );
  }

  // ============================================================================
  // RENDER 0: SMART TV 4-DIGIT PAIRING LOBBY (/tv)
  // ============================================================================
  if (isTvPairLobby) {
    return (
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
        <React.Suspense fallback={null}>
          <TvReceiverPairingScreen
            lang={lang}
            onPaired={({ roomId: pairedCode, roomName: pairedTitle, tvAuthToken: token }) => {
              manualLobbyStayRef.current = false;
              setTvAuthToken(token);
              setIsTvPairLobby(false);
              setIsTvMode(true);
              setRoomId(pairedCode);
              setRoomName(pairedTitle || `Sala ${pairedCode.toUpperCase()}`);
              setInRoom(true);
            }}
            onExitTvLobby={() => {
              setIsTvPairLobby(false);
              if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/');
              }
            }}
          />
        </React.Suspense>
      </MotionConfig>
    );
  }

  // ============================================================================
  // RENDER 1: LOBBY SCREEN (SHOWN FOR GUESTS WHO HAVEN'T ENTERED A ROOM YET)
  // ============================================================================
  if (!inRoom) {
    return (
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
        <PreviewAutoEscapeBanner variant="floating" />
        {showIntro && (
          <NaimcineIntro
            withSound={introWithSound}
            lang={lang}
            onComplete={() => setShowIntro(false)}
          />
        )}
        <GlobalIncomingInviteBanner
          invite={incomingInvite}
          friendAddedNotice={friendAddedNotice}
          lang={lang}
          isAlreadyFriend={
            Boolean(friendAddedNotice) &&
            savedFriends.some(
              (f) =>
                f.friendId === friendAddedNotice?.fromUserId ||
                f.friendCode === friendAddedNotice?.fromFriendCode
            )
          }
          onAcceptInvite={handleAcceptIncomingRoomInvite}
          onDismissInvite={() => setIncomingInvite(null)}
          onAcceptFriendBack={(notice) => {
            handleAddFriend({
              friendId: notice.fromUserId,
              name: notice.fromUserName,
              avatar: notice.fromUserAvatar,
              color: notice.fromUserColor,
              friendCode: notice.fromFriendCode,
            });
            setFriendAddedNotice(null);
          }}
          onDismissFriendNotice={() => setFriendAddedNotice(null)}
        />
        <LobbyScreen
          initialProfile={profile}
          recentRooms={recentRooms}
          lang={lang}
          effectiveView={effectiveView}
          isFramedMobileOnPc={isFramedMobileOnPc}
          onToggleViewMode={toggleViewMode}
          authUser={authUser}
          authLoading={authLoading}
          onSignIn={handleGoogleSignIn}
          onSignOut={handleGoogleSignOut}
          onChangeLang={setLang}
          onReplayIntro={() => {
            setIntroWithSound(true);
            setShowIntro(true);
          }}
          onEnterRoom={handleEnterRoom}
          onOpenTvPairLobby={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/tv';
            } else {
              setIsTvPairLobby(true);
            }
          }}
          onOpenAdsPage={() => {
            setIsAdsPageOpen(true);
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', '/naimcine-ads');
            }
          }}
        />
      </MotionConfig>
    );
  }

  // ============================================================================
  // RENDER 2: SMART TV RECEIVER MODE (?tv=1 OR PAIRED FROM /tv)
  // ============================================================================
  if (isTvMode) {
    return (
      <div className="w-full h-full bg-black overflow-hidden">
        <RoomPinPromptModal
          isOpen={pinPromptState.open}
          roomName={pinPromptState.roomName}
          roomCode={roomId}
          invalidAttempt={pinPromptState.invalidAttempt}
          lang={lang}
          onSubmitPin={handleSubmitGuestPin}
          onLeaveProtectedRoom={handleLeaveRoom}
        />
        <React.Suspense fallback={null}>
          <NativeCinemaPlayer
            videoState={videoState}
            lang={lang}
            userName={currentUser.name}
            isExtracting={isExtracting}
            extractionLabel={extractionLabel}
            extractionError={extractionError}
            languageNotice={languageNotice}
            onDismissLanguageNotice={() => setLanguageNotice(null)}
            cloudFrame={cloudFrame}
            cloudState={cloudState}
            floatingReactions={floatingReactions}
            onSyncAction={handleSyncPlayerAction}
            onSelectTrack={handleSelectTrack}
            onPromoteCloudStreamToNative={handlePromoteCloudStreamToNative}
            onPrevEpisode={handlePrevEpisode}
            onNextEpisode={handleNextEpisode}
            roomCode={roomId}
            roomDisplayName={roomName || `Sala ${roomId.toUpperCase()}`}
            participantCount={participants.length}
            onExitTvMode={() => {
              socketService.disconnect();
              setInRoom(false);
              setIsTvMode(false);
              setTvAuthToken('');
              setIsTvPairLobby(true);
              if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/tv');
              }
            }}
            isTvMode
          />
        </React.Suspense>
      </div>
    );
  }

  const effectiveVideoState: VideoState = isPlayerClosedLocally
    ? INITIAL_VIDEO_STATE
    : videoState;
  const isPlayerActive =
    (effectiveVideoState.mode !== 'idle' || isExtracting) && !isPlayerClosedLocally;
  const isPlayingMediaReady =
    effectiveVideoState.mode !== 'idle' && !isExtracting && !isPlayerClosedLocally;
  const isDockedMini =
    isPlayerActive &&
    (isPlayerMinimized ||
      (isPlayingMediaReady && isOnMobileSocialTab && !pinFullPlayerOnChat));
  const isScrollCompressed =
    isPlayerActive &&
    isPlayingMediaReady &&
    isAutoMiniByScroll &&
    !isPlayerMinimized &&
    !isOnMobileSocialTab;
  const showCinemaOverlay = isCinemaMode && isPlayerActive && !isDockedMini;
  const hasConnectedSmartTv = participants.some(
    (p) => p.name.includes('(TV)') || p.avatar === '📺'
  );

  const handleCatalogOrWorkspaceScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (
      effectiveVideoState.mode === 'idle' ||
      isExtracting ||
      isPlayerClosedLocally
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastScrollCompressToggleRef.current < 220) {
      return;
    }
    if (st > 105 && !isAutoMiniByScroll) {
      lastScrollCompressToggleRef.current = now;
      setIsAutoMiniByScroll(true);
    } else if (st < 20 && isAutoMiniByScroll) {
      lastScrollCompressToggleRef.current = now;
      setIsAutoMiniByScroll(false);
    }
  };

  const handleMiniPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDockedMini) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('button, input, a')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    miniDragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
  };

  const handleMiniPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = miniDragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setMiniDragOffset({ x: dx, y: dy });
  };

  const handleMiniPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = miniDragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const centerX = drag.rectLeft + dx + drag.rectWidth / 2;
    const centerY = drag.rectTop + dy + drag.rectHeight / 2;
    const isRight = centerX >= window.innerWidth / 2;
    const isBottom = centerY >= window.innerHeight / 2;
    const nextCorner = isBottom
      ? isRight
        ? 'bottom-right'
        : 'bottom-left'
      : isRight
      ? 'top-right'
      : 'top-left';
    if (Math.hypot(dx, dy) > 8) {
      triggerHaptic('light');
    }
    setMiniCorner(nextCorner);
    setMiniDragOffset(null);
    miniDragStartRef.current = null;
  };

  const miniCornerPositionClasses = (() => {
    switch (miniCorner) {
      case 'top-left':
        return 'top-[68px] left-3 sm:top-20 sm:left-5';
      case 'top-right':
        return 'top-[68px] right-3 sm:top-20 sm:right-5';
      case 'bottom-left':
        return isMobileKeyboardOpen
          ? 'bottom-16 left-3'
          : 'bottom-[86px] left-3 sm:bottom-6 sm:left-5';
      case 'bottom-right':
      default:
        return isMobileKeyboardOpen
          ? 'bottom-16 right-3'
          : 'bottom-[86px] right-3 sm:bottom-6 sm:right-5';
    }
  })();

  const handleSwitchThisDeviceToTvLobby = () => {
    socketService.disconnect();
    if (typeof window !== 'undefined') {
      window.location.href = '/tv';
      return;
    }
    setInRoom(false);
    setIsTvMode(false);
    setTvAuthToken('');
    setIsTvPairLobby(true);
  };

  const isMobileChatWithKeyboard =
    !isDesktopLayout && isMobileKeyboardOpen && (mobileTab === 'chat' || floatingChatOpen);
  const isAutoImmersiveLandscape =
    !isDesktopLayout &&
    isMobileLandscape &&
    isPlayerActive &&
    !isDockedMini &&
    !isMobileKeyboardOpen;

  const hideBrowseBelowPlayer =
    isPlayerActive &&
    !isDockedMini &&
    !isAutoImmersiveLandscape &&
    activeWorld !== 'sala' &&
    activeWorld !== 'juegos';
  const isMoviePlaybackDockVisible =
    videoState.mode !== 'idle' &&
    !isPlayerClosedLocally &&
    !isPlayerMinimized &&
    !isAutoImmersiveLandscape &&
    !activeSportsMatch &&
    !videoState.seriesMeta &&
    !videoState.isLive &&
    videoState.mode !== 'youtube' &&
    Boolean(activeMovieContext || videoState.title);

  const isChannelGuideDockVisible =
    videoState.mode !== 'idle' &&
    !isPlayerClosedLocally &&
    !isPlayerMinimized &&
    !isAutoImmersiveLandscape &&
    !activeSportsMatch &&
    !videoState.seriesMeta &&
    videoState.mode !== 'youtube' &&
    (Boolean(videoState.isLive) ||
      Boolean(
        videoState.tracks?.some(
          (t) => t.resolverType === 'tdt_hls' || t.resolverType === 'sports_channel'
        )
      ));

  // ============================================================================
  // RENDER 3: UNIFIED WORKSPACE (DESKTOP, ANDROID MOBILE APK & GOOGLE TV APK)
  // ============================================================================
  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
    <div
      style={
        !isDesktopLayout && visualViewportHeight
          ? { height: `${visualViewportHeight}px` }
          : undefined
      }
      className="h-full w-full max-w-[100vw] bg-[#0B0B0E] text-[#EFEFF1] overflow-hidden"
    >
      <div
        className={`h-full w-full flex flex-col overflow-hidden pt-safe animate-room-warp ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto bg-[#0B0B0E] border-x border-white/[0.08] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : 'bg-[#0B0B0E]'
        }`}
      >
        <PreviewAutoEscapeBanner variant="bar" />
        <OfflineIndicator lang={lang} />

        {/* Live In-App Room Invite & Friend-Added Banner */}
        <GlobalIncomingInviteBanner
          invite={incomingInvite}
          friendAddedNotice={friendAddedNotice}
          lang={lang}
          isAlreadyFriend={
            Boolean(friendAddedNotice) &&
            savedFriends.some(
              (f) =>
                f.friendId === friendAddedNotice?.fromUserId ||
                f.friendCode === friendAddedNotice?.fromFriendCode
            )
          }
          onAcceptInvite={handleAcceptIncomingRoomInvite}
          onDismissInvite={() => setIncomingInvite(null)}
          onAcceptFriendBack={(notice) => {
            handleAddFriend({
              friendId: notice.fromUserId,
              name: notice.fromUserName,
              avatar: notice.fromUserAvatar,
              color: notice.fromUserColor,
              friendCode: notice.fromFriendCode,
            });
            setFriendAddedNotice(null);
          }}
          onDismissFriendNotice={() => setFriendAddedNotice(null)}
        />

        {/* Friends List & Direct Room Invite Modal */}
        <FriendsInviteModal
          isOpen={friendsModalOpen}
          onClose={() => setFriendsModalOpen(false)}
          lang={lang}
          roomId={roomId}
          roomName={roomName || `Sala ${roomId.toUpperCase()}`}
          activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : undefined}
          activeMediaPoster={
            videoState.mode !== 'idle'
              ? videoState.poster || videoState.backdrop
              : undefined
          }
          activeMediaIsLive={videoState.mode !== 'idle' && Boolean(videoState.isLive)}
          currentUser={currentUser}
          participants={participants}
          savedFriends={savedFriends}
          onlineUsers={onlineUsers}
          onAddFriend={handleAddFriend}
          onRemoveFriend={handleRemoveFriend}
          onSendDirectRoomInvite={handleSendDirectRoomInvite}
          onJoinFriendRoom={(targetCode, targetName) => {
            setFriendsModalOpen(false);
            handleSwitchActiveRoom(targetCode, targetName);
          }}
          inviteSentFeedback={inviteSentFeedback}
        />

        {showIntro && (
          <NaimcineIntro
            withSound={introWithSound}
            lang={lang}
            subtitle={
              roomName
                ? `${pickLang(lang, {
                    es: 'Entrando a',
                    ca: 'Entrant a',
                    en: 'Entering',
                  })} ${roomName}`
                : undefined
            }
            onComplete={() => setShowIntro(false)}
          />
        )}

        <React.Suspense fallback={null}>
          {/* Private Room 4-Digit PIN Unlock Gate */}
          <RoomPinPromptModal
            isOpen={pinPromptState.open}
            roomName={pinPromptState.roomName}
            roomCode={roomId}
            invalidAttempt={pinPromptState.invalidAttempt}
            lang={lang}
            onSubmitPin={handleSubmitGuestPin}
            onLeaveProtectedRoom={handleLeaveRoom}
          />

          {/* Quick 1-Tap Smart TV Pairing & Mobile Remote Modal (Samsung / LG / AirPlay / Cast) */}
          <SmartTvQuickModal
            isOpen={smartTvModalOpen}
            onClose={() => setSmartTvModalOpen(false)}
            lang={lang}
            roomId={roomId}
            hasConnectedSmartTv={hasConnectedSmartTv}
            onClaimTvCode={handleClaimTvCode}
            tvClaimStatus={tvClaimStatus}
            isRoomPlaying={videoState.mode !== 'idle' && videoState.isPlaying}
            onRemoteTogglePlay={handleRemoteTogglePlay}
            onRemoteSeekDelta={handleRemoteSeekDelta}
            onSendTvRemoteCommand={handleSendTvRemoteCommand}
            onSwitchThisDeviceToTvLobby={handleSwitchThisDeviceToTvLobby}
            onTriggerAirPlayPicker={() => {
              const v = document.querySelector('video') as
                | (HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })
                | null;
              if (v?.webkitShowPlaybackTargetPicker) {
                try {
                  v.webkitShowPlaybackTargetPicker();
                  return true;
                } catch {
                  return false;
                }
              }
              return false;
            }}
          />

          {/* Dedicated Mi Perfil Hub (History, Resume, Favorite Movies/Series, Favorite Channels & Permanent Rooms) */}
          <UserProfileHubModal
            isOpen={profileHubOpen}
            initialTab={profileHubTab}
            onClose={() => setProfileHubOpen(false)}
            lang={lang}
            onChangeLang={setLang}
            onOpenLegalModal={() => {
              setProfileHubOpen(false);
              setShowLegalModal(true);
            }}
            onOpenDesignSystem={() => {
              setProfileHubOpen(false);
              setShowDesignSystem(true);
            }}
            authUser={authUser}
            authLoading={authLoading}
            displayName={profile.name}
            roomId={roomId}
            roomName={roomName}
            recentRooms={recentRooms}
            watchHistory={watchHistory}
            watchlist={watchlist}
            favoriteChannels={favoriteChannels}
            effectiveView={effectiveView}
            onToggleViewMode={toggleViewMode}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleGoogleSignOut}
            onUpdateDisplayName={(newName) =>
              handleUpdateProfile(newName, profile.avatar, profile.color)
            }
            onReplayHistoryItem={handleReplayHistoryItem}
            onRemoveHistoryItem={handleRemoveHistoryItem}
            onClearHistory={handleClearAllHistory}
            onPlayCatalogItem={handlePlayFromProfileCatalog}
            onToggleCatalogFavorite={handleToggleCatalogFavorite}
            onPlayFavoriteChannel={handlePlayFavoriteChannel}
            onRemoveFavoriteChannel={(ch) => handleToggleChannelFavorite(ch)}
            onCreateNewRoom={handleCreateFreshRoom}
            onSwitchRoom={handleSwitchActiveRoom}
            savedRooms={savedRooms}
            isCurrentRoomPermanent={isCurrentRoomPermanent}
            onToggleCurrentRoomPermanent={handleTogglePermanentRoom}
            onDeleteSavedRoom={handleDeleteSavedRoom}
            onLeaveRoom={handleLeaveRoom}
          />

          {/* Avatar Menu Sheet & Shared Settings Bottom Sheet */}
          <AvatarMenuSheet
            isOpen={avatarMenuOpen}
            onClose={() => setAvatarMenuOpen(false)}
            lang={lang}
            displayName={profile.name}
            avatar={profile.avatar || '🎬'}
            color={profile.color || '#9146FF'}
            authUser={authUser}
            unreadNotificationsCount={unreadNotificationsCount}
            hasConnectedSmartTv={hasConnectedSmartTv}
            onOpenProfile={() => {
              setProfileHubTab('account');
              setProfileHubOpen(true);
            }}
            onOpenContinueWatching={() => {
              setProfileHubTab('history');
              setProfileHubOpen(true);
            }}
            onOpenSaved={() => {
              setProfileHubTab('favorites');
              setProfileHubOpen(true);
            }}
            onOpenNotifications={() => setShowNotificationCenter(true)}
            onOpenFriends={() => setFriendsModalOpen(true)}
            onOpenSmartTv={() => setSmartTvModalOpen(true)}
            onOpenYouTube={() => enterWorld('youtube')}
            onOpenSettings={() => setSettingsSheetOpen(true)}
          />

          <SettingsBottomSheet
            isOpen={settingsSheetOpen}
            onClose={() => setSettingsSheetOpen(false)}
            lang={lang}
            onChangeLang={setLang}
            effectiveView={effectiveView}
            onToggleViewMode={toggleViewMode}
            authUser={authUser}
            authLoading={authLoading}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleGoogleSignOut}
            hasConnectedSmartTv={hasConnectedSmartTv}
            onOpenSmartTv={() => setSmartTvModalOpen(true)}
            onOpenTvPairLobby={handleSwitchThisDeviceToTvLobby}
            roomId={roomId}
            onClaimTvCode={handleClaimTvCode}
            onLeaveRoom={handleLeaveRoom}
          />

          {/* Non-intrusive Guest Welcome Card when entering via invite link */}
          {showGuestPopup && !showIntro && !authUser && !pinPromptState.open && (
            <GuestWelcomePopup
              currentName={profile.name}
              currentAvatar={profile.avatar}
              currentColor={profile.color}
              roomName={roomName || `Sala ${roomId.toUpperCase()}`}
              lang={lang}
              onSaveIdentity={handleUpdateProfile}
              onDismissKeepRandom={handleDismissGuestPopup}
            />
          )}
        </React.Suspense>

        {/* ================================================================== */}
        {/* MODO CINE DARK OPACITY OVERLAY (bg-black/80 OVER ENTIRE APP)       */}
        {/* ================================================================== */}
        {showCinemaOverlay && (
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-black/80 z-40 pointer-events-none transition-opacity duration-300"
          />
        )}

        {/* Minimal Entry Header (ONLY Logo + RiffanTV & Avatar with Notification Dot) */}
        {activeWorld === 'entry' && !isMobileChatWithKeyboard && !isAutoImmersiveLandscape && (
          <header className="shrink-0 z-30 h-14 px-4 bg-[#0B0B0E]/90 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label="RiffanTV"
              className="flex items-center gap-2.5 min-h-11 py-1 cursor-pointer active:scale-95 transition-transform"
            >
              <NaimBrandLogo size={32} />
              <span className="font-display font-bold text-base tracking-[-0.015em] leading-none text-[#F4F5F8]">
                Riffan<span className="text-[#A78BFA] font-extrabold">TV</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setAvatarMenuOpen(true);
              }}
              aria-label={pickLang(lang, {
                es: 'Menú de perfil',
                ca: 'Menú de perfil',
                en: 'Profile menu',
              })}
              className="relative w-10 h-10 rounded-2xl border border-white/15 flex items-center justify-center text-sm font-bold text-white cursor-pointer active:scale-95 transition-transform shrink-0 overflow-visible"
              style={{ backgroundColor: profile.color || '#9146FF' }}
            >
              {authUser?.photoURL ? (
                <img
                  src={authUser.photoURL}
                  alt={profile.name}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <span>{getMonogramInitials(profile.name)}</span>
              )}
              {unreadNotificationsCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#EB0400] ring-2 ring-[#0B0B0E]"
                />
              )}
            </button>
          </header>
        )}

        {/* Main Progressive World Workspace */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <div
            ref={mainScrollRef}
            onScroll={handleCatalogOrWorkspaceScroll}
            className={`flex-1 min-h-0 min-w-0 flex flex-col ${
              activeWorld === 'sala' || activeWorld === 'juegos'
                ? 'overflow-hidden'
                : 'overflow-y-auto overflow-x-clip'
            }`}
          >
            {/* SINGLE NATIVE CINEMA PLAYER INSTANCE (Stays Docked Inline at Top & Compresses on Scroll) */}
            <div
              onPointerDown={isDockedMini ? handleMiniPointerDown : undefined}
              onPointerMove={isDockedMini ? handleMiniPointerMove : undefined}
              onPointerUp={isDockedMini ? handleMiniPointerUp : undefined}
              onPointerCancel={isDockedMini ? handleMiniPointerUp : undefined}
              style={
                isDockedMini && miniDragOffset
                  ? {
                      transform: `translate3d(${miniDragOffset.x}px, ${miniDragOffset.y}px, 0)`,
                      transition: 'none',
                    }
                  : undefined
              }
              className={
                isDockedMini
                  ? `fixed ${miniCornerPositionClasses} ${
                      isDesktopLayout ? 'w-80' : 'w-56'
                    } z-[55] touch-none select-none cursor-grab active:cursor-grabbing transition-all duration-300 ease-out`
                  : `shrink-0 w-full min-w-0 ${
                      isPlayerActive
                        ? isDesktopLayout
                          ? isScrollCompressed
                            ? 'sticky top-0 z-30 block w-full max-w-none px-3 pt-1.5 pb-1.5 bg-[#0B0B0E]/95 backdrop-blur-md border-b border-white/[0.08] transition-all duration-200'
                            : 'sticky top-0 z-30 block w-full max-w-none px-2 pt-2 sm:px-4 sm:pt-2 bg-[#0B0B0E] transition-all duration-200'
                          : isAutoImmersiveLandscape
                          ? 'block h-full flex-1 bg-black'
                          : isScrollCompressed
                          ? 'block bg-[#0B0B0E]/95 border-b border-white/[0.08] transition-all duration-200'
                          : 'block border-b border-white/[0.08] transition-all duration-200'
                        : 'hidden'
                    }`
              }
            >
              <div
                className={
                  isDockedMini || showCinemaOverlay || isScrollCompressed
                    ? 'relative'
                    : isDesktopLayout
                    ? 'relative rounded-3xl shadow-[0_32px_90px_rgba(0,0,0,0.9)]'
                    : 'relative'
                }
              >
                {isPlayerActive &&
                  !isDockedMini &&
                  !isScrollCompressed &&
                  (effectiveVideoState.backdrop || effectiveVideoState.poster) && (
                    <img
                      src={effectiveVideoState.backdrop || effectiveVideoState.poster}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      className="hidden sm:block absolute -inset-6 w-[calc(100%+3rem)] h-[calc(100%+3rem)] object-cover blur-3xl opacity-30 scale-105 pointer-events-none select-none -z-10"
                    />
                  )}
                <React.Suspense fallback={null}>
                  <NativeCinemaPlayer
                    videoState={effectiveVideoState}
                    lang={lang}
                    userName={currentUser.name}
                    isExtracting={isExtracting}
                    extractionLabel={extractionLabel}
                    extractionError={extractionError}
                    languageNotice={languageNotice}
                    onDismissLanguageNotice={() => setLanguageNotice(null)}
                    cloudFrame={cloudFrame}
                    cloudState={cloudState}
                    floatingReactions={floatingReactions}
                    onSyncAction={handleSyncPlayerAction}
                    onSelectTrack={handleSelectTrack}
                    onPromoteCloudStreamToNative={handlePromoteCloudStreamToNative}
                    onPrevEpisode={handlePrevEpisode}
                    onNextEpisode={handleNextEpisode}
                    onProgressUpdate={handlePlayerProgressUpdate}
                    isCinemaMode={isCinemaMode}
                    onToggleCinemaMode={handleToggleCinemaMode}
                    secondaryStream={secondaryStream}
                    onSwapSecondaryStream={handleSwapSecondaryStream}
                    onToggleSecondaryLayout={handleToggleSecondaryLayout}
                    onCloseSecondaryStream={handleCloseSecondaryStream}
                    canControlRoom={canControlRoom}
                    isMinimized={isDockedMini}
                    isCompressed={isScrollCompressed}
                    onExpandCompressed={() => {
                      setIsAutoMiniByScroll(false);
                      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onToggleMinimize={() => {
                      if (isDockedMini) {
                        setIsPlayerMinimized(false);
                        setIsAutoMiniByScroll(false);
                        if (isOnMobileSocialTab) {
                          setPinFullPlayerOnChat(true);
                        } else {
                          mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                          catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      } else {
                        setCinemaModePersist(false);
                        if (isOnMobileSocialTab) {
                          setPinFullPlayerOnChat(false);
                        } else {
                          setIsPlayerMinimized(true);
                        }
                      }
                    }}
                    onClosePlayer={handleClosePlayer}
                    onOpenSmartTvModal={() => setSmartTvModalOpen(true)}
                    hasConnectedSmartTv={hasConnectedSmartTv}
                    onSendTvRemoteCommand={handleSendTvRemoteCommand}
                    roomCode={roomId}
                    roomDisplayName={roomName || `Sala ${roomId.toUpperCase()}`}
                    participantCount={participants.length}
                    participants={participants}
                    savedFriends={savedFriends}
                    onlineUsers={onlineUsers}
                    onOpenFriendsModal={() => setFriendsModalOpen(true)}
                    onSendDirectRoomInvite={handleSendDirectRoomInvite}
                    messages={messages}
                    currentUserId={currentUser.id}
                    onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
                    onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
                    onOpenInCloudBrowser={(targetUrl) => {
                      if (!canChangeMedia) {
                        showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
                        return;
                      }
                      socketService.startCloudBrowser(targetUrl, profile.name);
                    }}
                    floatingChatOpen={isFloatingRoomOpen}
                    onToggleFloatingChat={() => {
                      setIsFloatingRoomOpen(true);
                      setUnreadChatCount(0);
                    }}
                    voiceChat={voiceChat}
                    compactVideoForMobileKeyboard={
                      !isDesktopLayout && isMobileKeyboardOpen && activeWorld === 'sala'
                    }
                    onOpenCatalogSection={(sec) => {
                      setCatalogSection(sec);
                      if (sec === 'tdt') enterWorld('tv');
                      else if (sec === 'sports') enterWorld('futbol');
                      else if (sec === 'youtube') enterWorld('youtube');
                      else if (sec === 'games') enterWorld('juegos');
                      else enterWorld('cine');
                    }}
                  />
                </React.Suspense>

                {isPlayerActive && !isDockedMini && !isExtracting && secondaryStream && (
                  <div className="px-3 py-1.5 bg-[#18181B] border-t border-white/[0.08] flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#EFEFF1] truncate">
                      📺 2ª Pantalla Activa: {secondaryStream.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        handleCloseSecondaryStream();
                      }}
                      className="min-h-7 px-2.5 rounded-full bg-[#9146FF]/20 border border-[#9146FF]/45 text-[11px] font-bold text-[#BF94FF] whitespace-nowrap cursor-pointer hover:bg-[#9146FF]/35 transition-colors"
                    >
                      Cerrar 2ª Pantalla
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Host Lock Non-Intrusive Toast */}
            {lockNoticeToast && (
              <div className="fixed top-17 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-[#18181B]/95 backdrop-blur-md border border-white/15 text-zinc-100 text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-fade-in">
                <Lock className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                <span>{lockNoticeToast}</span>
              </div>
            )}

            {/* Added-to-Queue Instant Confirmation Toast */}
            {queueAddedNotice && (
              <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md px-3.5 py-2.5 rounded-2xl bg-[#18181B]/95 backdrop-blur-xl border border-white/15 text-white text-xs shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-between gap-2.5 animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <ListVideo className="w-4 h-4 text-[#BF94FF] shrink-0" />
                  <span className="truncate font-medium">
                    {pickLang(lang, {
                      es: 'En la cola:',
                      ca: 'A la cua:',
                      en: 'Queued:',
                    })}{' '}
                    <strong className="text-white">{queueAddedNotice}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenRoomQueueView}
                  className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  {pickLang(lang, {
                    es: `Ver Cola (${roomQueue.length})`,
                    ca: `Veure Cua (${roomQueue.length})`,
                    en: `View Queue (${roomQueue.length})`,
                  })}
                </button>
              </div>
            )}

            {/* Player Docks & Error Notices */}
            {((videoState.mode !== 'idle' &&
              !isPlayerClosedLocally &&
              !isPlayerMinimized &&
              !isAutoImmersiveLandscape &&
              (activeSportsMatch ||
                videoState.seriesMeta ||
                isMoviePlaybackDockVisible ||
                isChannelGuideDockVisible)) ||
              (isPlayerClosedLocally && videoState.mode !== 'idle') ||
              (extractionError && !isPlayerActive)) && (
              <div className="w-full max-w-6xl mx-auto px-3 sm:px-5 pt-3 pb-24 sm:pb-6 space-y-3 shrink-0">
                {videoState.mode !== 'idle' &&
                  !isPlayerClosedLocally &&
                  !isPlayerMinimized &&
                  !isAutoImmersiveLandscape &&
                  activeSportsMatch && (
                    showLiveMatchDock ? (
                      <React.Suspense fallback={null}>
                        <LiveMatchCenter
                          variant="docked"
                          lang={lang}
                          details={activeMatchDetails}
                          loading={loadingActiveMatchDetails}
                          homeTeam={activeSportsMatch.homeTeam}
                          awayTeam={activeSportsMatch.awayTeam}
                          homeShort={activeSportsMatch.homeShort}
                          awayShort={activeSportsMatch.awayShort}
                          homeLogo={activeSportsMatch.homeLogo}
                          awayLogo={activeSportsMatch.awayLogo}
                          homeScore={activeSportsMatch.homeScore}
                          awayScore={activeSportsMatch.awayScore}
                          statusState={activeSportsMatch.statusState}
                          statusLabel={activeSportsMatch.statusLabel}
                          competition={activeSportsMatch.competition}
                          tracks={videoState.tracks}
                          activeTrackIndex={videoState.activeTrackIndex}
                          onSelectTrack={(idx) => handleSelectTrack(idx, 0)}
                          onRefresh={() => refreshActiveMatchDetails(true)}
                          onCloseDock={() => setShowLiveMatchDock(false)}
                        />
                      </React.Suspense>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#161922] border border-white/[0.08]">
                        <span className="text-xs font-bold text-zinc-200 truncate">
                          {activeMatchDetails?.homeTeam || activeSportsMatch.homeTeam} vs{' '}
                          {activeMatchDetails?.awayTeam || activeSportsMatch.awayTeam}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setShowLiveMatchDock(true);
                          }}
                          className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-extrabold whitespace-nowrap cursor-pointer transition-colors"
                        >
                          {pickLang(lang, {
                            es: 'Ver estadísticas en vivo',
                            ca: 'Veure estadístiques en directe',
                            en: 'Show Live Stats',
                          })}
                        </button>
                      </div>
                    )
                  )}

                {videoState.mode !== 'idle' &&
                  !isPlayerClosedLocally &&
                  !isPlayerMinimized &&
                  !isAutoImmersiveLandscape &&
                  videoState.seriesMeta && (
                    <React.Suspense fallback={null}>
                      <SeriesEpisodesDock
                        seriesMeta={videoState.seriesMeta}
                        lang={lang}
                        preferLang={(() => {
                          const rawLang = String(
                            videoState.tracks[videoState.activeTrackIndex]?.lang || 'ES'
                          ).toUpperCase();
                          return rawLang === 'LAT' || rawLang === 'VOSE' || rawLang === 'EN'
                            ? rawLang
                            : 'ES';
                        })()}
                        loadingItemId={loadingItemId}
                        onSelectEpisode={(series, episode, pLang) => {
                          void handlePlaySeriesEpisode(series, episode, pLang);
                        }}
                      />
                    </React.Suspense>
                  )}

                {isMoviePlaybackDockVisible && (
                  <React.Suspense fallback={null}>
                    <MoviePlaybackDock
                      movie={
                        activeMovieContext || {
                          title: videoState.title,
                          poster: videoState.poster,
                          backdrop: videoState.backdrop,
                        }
                      }
                      lang={lang}
                      preferLang={(() => {
                        const rawLang = String(
                          videoState.tracks[videoState.activeTrackIndex]?.lang ||
                            activeMovieContext?.preferLang ||
                            'ES'
                        ).toUpperCase();
                        return rawLang === 'LAT' || rawLang === 'VOSE' || rawLang === 'EN'
                          ? rawLang
                          : 'ES';
                      })()}
                      loadingItemId={loadingItemId}
                      onSelectMovie={(movieItem, pLang) => {
                        void handlePlayMovie(movieItem, pLang);
                      }}
                    />
                  </React.Suspense>
                )}

                {isChannelGuideDockVisible && (
                  <React.Suspense fallback={null}>
                    <ChannelGuideDock
                      lang={lang}
                      activeChannelTitle={videoState.title}
                      activeChannelSubtitle={videoState.subtitle}
                      activeRawSourceUrl={videoState.rawSourceUrl}
                      channels={quickPool.tdt}
                      loadingItemId={loadingItemId}
                      onSelectChannel={(ch, progHint) => {
                        void handlePlayTdtChannel(ch, 0, progHint);
                      }}
                    />
                  </React.Suspense>
                )}

                {isPlayerClosedLocally && videoState.mode !== 'idle' && (
                  <div className="p-3.5 rounded-2xl bg-[#18181B] border border-white/[0.1] flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#BF94FF]">
                        {pickLang(lang, {
                          es: 'Reproduciendo en la sala',
                          ca: 'Reproduint a la sala',
                          en: 'Playing in room',
                        })}
                      </div>
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">
                        {videoState.title}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlayerClosedLocally(false);
                          setIsPlayerMinimized(false);
                        }}
                        className="min-h-11 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {pickLang(lang, {
                            es: 'Volver a abrir',
                            ca: 'Tornar a obrir',
                            en: 'Reopen',
                          })}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStopRoomPlaybackForEveryone}
                        className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/12 text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>
                          {pickLang(lang, {
                            es: 'Detener sala',
                            ca: 'Aturar sala',
                            en: 'Stop room',
                          })}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {extractionError && !isPlayerActive && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-2 animate-fade-in">
                    <span>{extractionError}</span>
                    <button
                      type="button"
                      onClick={() => setExtractionError(null)}
                      className="min-h-9 px-3 rounded-xl bg-rose-500/20 text-rose-200 font-semibold cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* WORLD ROUTER */}
            {hideBrowseBelowPlayer ? null : activeWorld === 'entry' ? (
              <div ref={catalogScrollRef} className="flex-1 min-h-0">
                <EntryHomeScreen
                  lang={lang}
                  displayName={profile.name}
                  isGuestName={!profile.isCustomized}
                  onUpdateDisplayName={(newName) =>
                    handleUpdateProfile(newName, profile.avatar, profile.color)
                  }
                  watchHistory={watchHistory}
                  onResumeHistoryItem={(item) => {
                    void handleReplayHistoryItem(item, false);
                  }}
                  onOpenContinueWatchingAll={() => {
                    setProfileHubTab('history');
                    setProfileHubOpen(true);
                  }}
                  onOpenSurpriseMe={() => {
                    setAiSearchLaunch((prev) => ({
                      query: '',
                      mediaType: 'all',
                      mode: 'surprise',
                      seq: (prev?.seq || 0) + 1,
                    }));
                    setShowSurpriseModal(true);
                  }}
                  onSelectWorld={(world) =>
                    enterWorld(world, {
                      withPortal:
                        world === 'cine' ||
                        world === 'futbol' ||
                        world === 'tv' ||
                        world === 'juegos',
                    })
                  }
                  onPreloadWorld={preloadWorld}
                  lastUsedWorld={lastUsedWorld}
                  liveMatchesCount={liveMatchesCount}
                  roomParticipantsCount={participants.length}
                  movies={quickPool.movies}
                  series={quickPool.series}
                  tdtChannels={quickPool.tdt}
                  liveMatches={homeFootballMatches}
                  onPlayMovie={(movieItem) => {
                    void handlePlayMovie(movieItem, cineCastellano ? 'ES' : 'VOSE');
                  }}
                  onPlaySeries={async (seriesItem) => {
                    if (seriesItem.tmdbId) {
                      try {
                        const seasonNum = seriesItem.seasonNumber || 1;
                        const res = await fetch(
                          `/api/catalog/tv/${seriesItem.tmdbId}?season=${seasonNum}&lang=${lang}`
                        );
                        const data = await res.json();
                        if (data?.details?.episodes?.length > 0) {
                          await handlePlaySeriesEpisode(
                            data.details as TvSeriesDetails,
                            data.details.episodes[0] as TvEpisodeItem,
                            cineCastellano ? 'ES' : 'VOSE'
                          );
                          return;
                        }
                      } catch {
                        // fallback to Cine catalog
                      }
                    }
                    enterWorld('cine');
                  }}
                  onPlayChannel={(ch) => {
                    void handlePlayTdtChannel(ch, 0);
                  }}
                  onPlayMatch={(matchItem) => {
                    void handlePlaySportsMatch(matchItem, 0);
                  }}
                  onSelectGame={(gid) => {
                    const mappedGame = (
                      gid === 'billar' ? 'pool' : gid
                    ) as RoomGameInviteType;
                    enterWorld('juegos');
                    setForcedOpenGame({
                      gameType: mappedGame,
                      seq: Date.now(),
                    });
                  }}
                />
              </div>
            ) : activeWorld === 'sala' ? (
              <WorldShell
                world="sala"
                title={pickLang(lang, {
                  es: 'Sala con Amigos',
                  ca: 'Sala amb Amics',
                  en: 'Watch Party',
                })}
                lang={lang}
                onBack={() => enterWorld('entry')}
                onGoHome={() => enterWorld('entry')}
                fullHeight
              >
                <PartySidebar
                  worldSalaMode
                  roomId={roomId}
                  currentUser={currentUser}
                  hostId={hostId}
                  participants={participants}
                  messages={messages}
                  lang={lang}
                  effectiveView={effectiveView}
                  onToggleViewMode={toggleViewMode}
                  authUser={authUser}
                  authLoading={authLoading}
                  onSignIn={handleGoogleSignIn}
                  onSignOut={handleGoogleSignOut}
                  hostOnlyControl={hostOnlyControl}
                  onToggleHostLock={handleToggleHostLock}
                  roomName={roomName}
                  onRenameRoom={handleRenameRoom}
                  hasPin={roomHasPin}
                  currentHostPin={currentHostPin}
                  onSetRoomPin={handleSetRoomPin}
                  isCurrentRoomPermanent={isCurrentRoomPermanent}
                  onTogglePermanentRoom={handleTogglePermanentRoom}
                  onClaimTvCode={handleClaimTvCode}
                  tvClaimStatus={tvClaimStatus}
                  isRoomPlaying={videoState.mode !== 'idle' && videoState.isPlaying}
                  onRemoteTogglePlay={handleRemoteTogglePlay}
                  onRemoteSeekDelta={handleRemoteSeekDelta}
                  onSendTvRemoteCommand={handleSendTvRemoteCommand}
                  onSwitchThisDeviceToTvLobby={handleSwitchThisDeviceToTvLobby}
                  activePoll={activePoll}
                  roomQueue={roomQueue}
                  onPlayQueueItem={handlePlayQueueItem}
                  onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
                  onPromoteQueueItem={(id) => socketService.promoteQueueItem(id)}
                  onReorderQueueItem={(id, dir) => socketService.reorderQueueItem(id, dir)}
                  onRestoreQueueItem={(item) => socketService.addToQueue(item)}
                  onVoteQueueItem={(id) => socketService.voteQueueItem(id, currentUser.id)}
                  onSetParticipantRole={(uid, role) => socketService.setParticipantRole(uid, role)}
                  pinnedMessage={pinnedMessage}
                  onPinMessage={(msgId) => socketService.pinChatMessage(msgId)}
                  onUnpinMessage={() => socketService.unpinChatMessage()}
                  typingUsers={typingUsers}
                  onTypingChange={(isTyping) => socketService.sendTypingState(currentUser, isTyping)}
                  activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
                  activeMediaPoster={
                    videoState.mode !== 'idle'
                      ? videoState.poster || videoState.backdrop || ''
                      : ''
                  }
                  activeMediaIsLive={videoState.mode !== 'idle' && Boolean(videoState.isLive)}
                  currentVideoTimeSec={
                    videoState.mode !== 'idle' && !videoState.isLive
                      ? livePlaybackSec || videoState.currentTime || 0
                      : 0
                  }
                  onSeekToTimestamp={
                    videoState.mode !== 'idle' && !videoState.isLive
                      ? (sec) => handleSyncPlayerAction('seek', { currentTime: sec })
                      : undefined
                  }
                  onPlayCustomUrl={handlePlayCustomUrl}
                  onOpenCloudBrowser={handleOpenCloudBrowser}
                  onStartPollFromQueue={handleStartPollFromQueue}
                  onVotePoll={handleVotePoll}
                  onClosePoll={handleClosePoll}
                  initialView="chat"
                  openQueueTrigger={openQueueTrigger}
                  isKeyboardOpen={isMobileKeyboardOpen}
                  savedFriends={savedFriends}
                  onlineUsers={onlineUsers}
                  onOpenFriendsModal={() => setFriendsModalOpen(true)}
                  onAddFriend={handleAddFriend}
                  onSendDirectRoomInvite={handleSendDirectRoomInvite}
                  inviteSentFeedback={inviteSentFeedback}
                  onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
                  onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
                  onTransferHost={(newId) => socketService.transferHost(newId)}
                  onUpdateProfile={handleUpdateProfile}
                  onCreateNewRoom={handleCreateFreshRoom}
                  onSwitchRoom={(targetCode) => handleSwitchActiveRoom(targetCode)}
                  onLeaveRoom={handleLeaveRoom}
                  voiceChat={voiceChat}
                />
              </WorldShell>
            ) : activeWorld === 'juegos' ? (
              <WorldShell
                world="juegos"
                title={pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
                lang={lang}
                onBack={() => enterWorld('entry')}
                onGoHome={() => enterWorld('entry')}
                fullHeight
              >
                <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-3 pb-24">
                  <GamesHubSection
                    lang={lang}
                    currentUser={currentUser}
                    participants={participants}
                    roomBoardGame={roomGameState}
                    roomPartyGame={partyGameState}
                    roomPinturilloGame={pinturilloState}
                    roomPoolGame={poolGameState}
                    roomChapasGame={chapasGameState}
                    matchResponses={matchResponses}
                    gameMoveError={gameMoveError}
                    isHost={isHostUser}
                    voiceChat={voiceChat}
                    requestedGameOpen={forcedOpenGame}
                    onSelectedGameChange={(game) => {
                      activeHubGameRef.current = game;
                    }}
                    onStartRoomBoardGame={(gt, solo, clockMin) =>
                      socketService.startBoardGame(gt, solo, clockMin)
                    }
                    onJoinBoardSeat={(side) => socketService.joinGameSeat(side)}
                    onStartBoardMatch={() => socketService.startBoardMatch()}
                    onMoveBoardGame={(from, to, promo) => socketService.sendGameMove(from, to, promo)}
                    onResignBoardGame={() => socketService.resignBoardGame()}
                    onResetBoardGame={(opts) => socketService.resetBoardGame(opts)}
                    onCloseBoardGame={() => socketService.closeBoardGame()}
                    onStartRoomPartyGame={(gt) => socketService.startPartyGame(gt)}
                    onRoomPartyAction={(act, opts) => socketService.sendPartyGameAction(act, opts)}
                    onCloseRoomPartyGame={() => socketService.closePartyGame()}
                    onStartRoomPinturillo={() => socketService.startPinturillo()}
                    onStartPinturilloMatch={() => socketService.startPinturilloMatch()}
                    onPinturilloPickWord={(wordId) => socketService.pickPinturilloWord(wordId)}
                    onPinturilloStroke={(stroke) => socketService.sendPinturilloStroke(stroke)}
                    onPinturilloUndo={() => socketService.undoPinturilloStroke()}
                    onPinturilloClear={() => socketService.clearPinturilloCanvas()}
                    onPinturilloGuess={(text) => socketService.sendPinturilloGuess(text)}
                    onPinturilloRematch={() => socketService.rematchPinturillo()}
                    onCloseRoomPinturillo={() => socketService.closePinturillo()}
                    onStartRoomPool={(difficulty) => socketService.startPoolGame(difficulty)}
                    onStartPoolMatch={() => socketService.startPoolMatch()}
                    onPoolJoinSeat={(seat) => socketService.joinPoolSeat(seat)}
                    onPoolCallPocket={(pocketId) => socketService.callPoolPocket(pocketId)}
                    onPoolPlaceCue={(x, y) => socketService.placePoolCueBall(x, y)}
                    onPoolTakeShot={(shot) => socketService.takePoolShot(shot)}
                    onPoolSyncChecksum={(turnNumber, checksum) =>
                      socketService.syncPoolChecksum(turnNumber, checksum)
                    }
                    onPoolForfeit={() => socketService.forfeitPoolGame()}
                    onPoolRematch={() => socketService.rematchPoolGame()}
                    onCloseRoomPool={() => socketService.closePoolGame()}
                    onStartRoomChapas={() => socketService.startChapasGame()}
                    onChapasJoinSeat={(seat) => socketService.joinChapasSeat(seat)}
                    onChapasUpdateTeam={(team, flag) => socketService.updateChapasTeam(team, flag)}
                    onChapasToggleBots={(botsEnabled) => socketService.toggleChapasBots(botsEnabled)}
                    onChapasStartMatch={() => socketService.startChapasMatch()}
                    onChapasShoot={(shot) => socketService.shootChapasCap(shot)}
                    onChapasForfeit={() => socketService.forfeitChapasGame()}
                    onChapasRematch={() => socketService.rematchChapasGame()}
                    onCloseRoomChapas={() => socketService.closeChapasGame()}
                  />
                </div>
              </WorldShell>
            ) : (
              <WorldShell
                world={activeWorld}
                title={
                  activeWorld === 'cine'
                    ? pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Cinema' })
                    : activeWorld === 'futbol'
                    ? pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })
                    : activeWorld === 'tv'
                    ? pickLang(lang, { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' })
                    : 'YouTube'
                }
                lang={lang}
                onBack={() => enterWorld('entry')}
                onGoHome={() => enterWorld('entry')}
                searchValue={worldSearchQuery}
                onSearchChange={setWorldSearchQuery}
                searchPlaceholder={
                  activeWorld === 'cine'
                    ? pickLang(lang, {
                        es: 'Buscar película, serie o enlace...',
                        ca: 'Cercar pel·lícula, sèrie o enllaç...',
                        en: 'Search movie, series or URL...',
                      })
                    : activeWorld === 'futbol'
                    ? pickLang(lang, {
                        es: 'Buscar partido, equipo o canal...',
                        ca: 'Cercar partit, equip o canal...',
                        en: 'Search match, team or channel...',
                      })
                    : activeWorld === 'tv'
                    ? pickLang(lang, {
                        es: 'Buscar canal o programa...',
                        ca: 'Cercar canal o programa...',
                        en: 'Search channel or show...',
                      })
                    : pickLang(lang, {
                        es: 'Buscar en YouTube...',
                        ca: 'Cercar a YouTube...',
                        en: 'Search YouTube...',
                      })
                }
              >
                <MediaCatalogHub
                  worldMode={activeWorld}
                  externalSearchQuery={worldSearchQuery}
                  onExternalSearchChange={setWorldSearchQuery}
                  cineTab={cineTab}
                  onCineTabChange={setCineTab}
                  cineCastellano={cineCastellano}
                  onCineCastellanoChange={setCineCastellano}
                  futbolTab={futbolTab}
                  onFutbolTabChange={setFutbolTab}
                  activeSection={catalogSection}
                  onChangeSection={(sec) => {
                    if (sec === 'tdt') enterWorld('tv');
                    else if (sec === 'sports') enterWorld('futbol');
                    else if (sec === 'youtube') enterWorld('youtube');
                    else if (sec === 'games') enterWorld('juegos');
                    else if (sec === 'direct') enterWorld('sala');
                    else setCatalogSection(sec);
                  }}
                  lang={lang}
                  userName={currentUser.name}
                  activeVideoRawUrl={videoState.rawSourceUrl}
                  activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
                  loadingItemId={loadingItemId}
                  roomQueue={roomQueue}
                  watchHistory={watchHistory}
                  watchlist={watchlist}
                  favoriteChannels={favoriteChannels}
                  onToggleCatalogFavorite={handleToggleCatalogFavorite}
                  onToggleChannelFavorite={handleToggleChannelFavorite}
                  onPlayFavoriteChannel={handlePlayFavoriteChannel}
                  onPlayMovie={handlePlayMovie}
                  onPlaySeriesEpisode={handlePlaySeriesEpisode}
                  onPlayCatalaEpisode={handlePlayCatalaEpisode}
                  onReplayHistoryItem={handleReplayHistoryItem}
                  onRemoveHistoryItem={handleRemoveHistoryItem}
                  onClearHistory={handleClearAllHistory}
                  onPlaySportsMatch={handlePlaySportsMatch}
                  onPlayTdtChannel={handlePlayTdtChannel}
                  onPlayYouTubeVideo={handlePlayYouTubeVideo}
                  onPlayCustomUrl={handlePlayCustomUrl}
                  onOpenCloudBrowser={handleOpenCloudBrowser}
                  onAddToQueue={handleAddToQueue}
                  onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
                  onPlayQueueItem={handlePlayQueueItem}
                  onStartPollFromQueue={handleStartPollFromQueue}
                  onPlaySecondaryChannel={handlePlaySecondaryChannel}
                  hasConnectedSmartTv={hasConnectedSmartTv}
                  onCreateNewRoom={handleCreateFreshRoom}
                  showWatchlistOnly={showWatchlistOnly}
                  onWatchlistOnlyChange={setShowWatchlistOnly}
                  currentUser={currentUser}
                  participants={participants}
                  roomBoardGame={roomGameState}
                  roomPartyGame={partyGameState}
                  roomPinturilloGame={pinturilloState}
                  roomPoolGame={poolGameState}
                  roomChapasGame={chapasGameState}
                  matchResponses={matchResponses}
                  gameMoveError={gameMoveError}
                  isHost={isHostUser}
                  voiceChat={voiceChat}
                  requestedGameOpen={forcedOpenGame}
                  onSelectedGameChange={(game) => {
                    activeHubGameRef.current = game;
                  }}
                  onSearchWithAi={(query, mediaType = 'all') => {
                    setShowCommandSearch(false);
                    setAiSearchLaunch((prev) => ({
                      query,
                      mediaType,
                      mode: 'request',
                      seq: (prev?.seq || 0) + 1,
                    }));
                    setShowSurpriseModal(true);
                  }}
                  onOpenSurpriseMe={() => {
                    setAiSearchLaunch((prev) => ({
                      query: '',
                      mediaType: 'all',
                      mode: 'surprise',
                      seq: (prev?.seq || 0) + 1,
                    }));
                    setShowSurpriseModal(true);
                  }}
                />
              </WorldShell>
            )}
          </div>
        </div>

        {/* Floating Room Chat Bubble across all worlds except Sala */}
        <FloatingRoomBubble
          lang={lang}
          visible={inRoom && activeWorld !== 'sala'}
          participantsCount={participants.length}
          voiceActive={voiceChat.isJoined}
          unreadCount={unreadChatCount}
          isSheetOpen={isFloatingRoomOpen}
          onOpenSheet={() => {
            setIsFloatingRoomOpen(true);
            setUnreadChatCount(0);
          }}
          onCloseSheet={() => setIsFloatingRoomOpen(false)}
          onOpenFullSala={() => enterWorld('sala')}
        >
          <React.Suspense fallback={null}>
            <PartySidebar
              roomId={roomId}
              currentUser={currentUser}
              hostId={hostId}
              participants={participants}
              messages={messages}
              lang={lang}
              effectiveView={effectiveView}
              onToggleViewMode={toggleViewMode}
              authUser={authUser}
              authLoading={authLoading}
              onSignIn={handleGoogleSignIn}
              onSignOut={handleGoogleSignOut}
              hostOnlyControl={hostOnlyControl}
              onToggleHostLock={handleToggleHostLock}
              roomName={roomName}
              onRenameRoom={handleRenameRoom}
              hasPin={roomHasPin}
              currentHostPin={currentHostPin}
              onSetRoomPin={handleSetRoomPin}
              isCurrentRoomPermanent={isCurrentRoomPermanent}
              onTogglePermanentRoom={handleTogglePermanentRoom}
              onClaimTvCode={handleClaimTvCode}
              tvClaimStatus={tvClaimStatus}
              isRoomPlaying={videoState.mode !== 'idle' && videoState.isPlaying}
              onRemoteTogglePlay={handleRemoteTogglePlay}
              onRemoteSeekDelta={handleRemoteSeekDelta}
              onSendTvRemoteCommand={handleSendTvRemoteCommand}
              onSwitchThisDeviceToTvLobby={handleSwitchThisDeviceToTvLobby}
              activePoll={activePoll}
              roomQueue={roomQueue}
              onPlayQueueItem={handlePlayQueueItem}
              onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
              onPromoteQueueItem={(id) => socketService.promoteQueueItem(id)}
              onReorderQueueItem={(id, dir) => socketService.reorderQueueItem(id, dir)}
              onRestoreQueueItem={(item) => socketService.addToQueue(item)}
              onVoteQueueItem={(id) => socketService.voteQueueItem(id, currentUser.id)}
              onSetParticipantRole={(uid, role) => socketService.setParticipantRole(uid, role)}
              pinnedMessage={pinnedMessage}
              onPinMessage={(msgId) => socketService.pinChatMessage(msgId)}
              onUnpinMessage={() => socketService.unpinChatMessage()}
              typingUsers={typingUsers}
              onTypingChange={(isTyping) => socketService.sendTypingState(currentUser, isTyping)}
              activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
              activeMediaPoster={
                videoState.mode !== 'idle'
                  ? videoState.poster || videoState.backdrop || ''
                  : ''
              }
              activeMediaIsLive={videoState.mode !== 'idle' && Boolean(videoState.isLive)}
              currentVideoTimeSec={
                videoState.mode !== 'idle' && !videoState.isLive
                  ? livePlaybackSec || videoState.currentTime || 0
                  : 0
              }
              onSeekToTimestamp={
                videoState.mode !== 'idle' && !videoState.isLive
                  ? (sec) => handleSyncPlayerAction('seek', { currentTime: sec })
                  : undefined
              }
              onPlayCustomUrl={handlePlayCustomUrl}
              onOpenCloudBrowser={handleOpenCloudBrowser}
              onStartPollFromQueue={handleStartPollFromQueue}
              onVotePoll={handleVotePoll}
              onClosePoll={handleClosePoll}
              initialView="chat"
              openQueueTrigger={openQueueTrigger}
              savedFriends={savedFriends}
              onlineUsers={onlineUsers}
              onOpenFriendsModal={() => setFriendsModalOpen(true)}
              onAddFriend={handleAddFriend}
              onSendDirectRoomInvite={handleSendDirectRoomInvite}
              inviteSentFeedback={inviteSentFeedback}
              onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
              onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
              onTransferHost={(newId) => socketService.transferHost(newId)}
              onUpdateProfile={handleUpdateProfile}
              onCreateNewRoom={handleCreateFreshRoom}
              onSwitchRoom={(targetCode) => handleSwitchActiveRoom(targetCode)}
              onLeaveRoom={handleLeaveRoom}
              voiceChat={voiceChat}
            />
          </React.Suspense>
        </FloatingRoomBubble>
        {/* Service Worker / Cross-Platform Version Update Toast */}
        {(swUpdate || nativeApkUpdate || deferredAppUpdateVersion) && (
          <div className="fixed bottom-20 sm:bottom-6 right-4 z-[70] max-w-xs px-4 py-3 rounded-2xl bg-[#18181B]/95 backdrop-blur-xl border border-[#9146FF]/40 shadow-2xl flex items-center justify-between gap-3">
            <div className="text-xs text-white font-semibold">
              {nativeApkUpdate
                ? pickLang(lang, {
                    es: `Nueva APK v${nativeApkUpdate.versionName} lista`,
                    ca: `Nova APK v${nativeApkUpdate.versionName} llesta`,
                    en: `New APK v${nativeApkUpdate.versionName} ready`,
                  })
                : pickLang(lang, {
                    es: `Nueva versión ${deferredAppUpdateVersion || ''} lista`.trim(),
                    ca: `Nova versió ${deferredAppUpdateVersion || ''} llesta`.trim(),
                    en: `Update ${deferredAppUpdateVersion || ''} ready`.trim(),
                  })}
            </div>
            {nativeApkUpdate ? (
              <button
                type="button"
                onClick={() => {
                  const filename =
                    nativeApkUpdate.flavor === 'tv' ? 'NAIM-CINE-TV.apk' : 'NAIM-CINE.apk';
                  void triggerApkDownload(nativeApkUpdate.apkUrl, filename);
                  setNativeApkUpdate(null);
                }}
                className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {pickLang(lang, { es: 'Instalar', ca: 'Instal·lar', en: 'Install' })}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (swUpdate) {
                    applySwUpdateNow();
                  } else if (deferredAppUpdateVersion) {
                    void clearStaleCachesAndReload();
                  }
                }}
                className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Update' })}
                </span>
              </button>
            )}
          </div>
        )}

        <React.Suspense fallback={null}>
          {/* Unified F4/F5 Feature Sheets & Modals */}
          <NotificationCenterSheet
            isOpen={showNotificationCenter}
            onClose={() => setShowNotificationCenter(false)}
            lang={lang}
            onActionNotification={(item) => {
              setShowNotificationCenter(false);
              if (item.roomId && item.roomId !== roomId) {
                handleSwitchActiveRoom(item.roomId);
              }
            }}
          />

          <CommandSearchModal
            isOpen={showCommandSearch}
            onClose={() => setShowCommandSearch(false)}
            lang={lang}
            movies={quickPool.movies}
            series={quickPool.series}
            tdtChannels={quickPool.tdt}
            onSelectCatalogItem={async (item) => {
              if (item.mediaType === 'tv' && item.tmdbId) {
                setCatalogSection('series');
                try {
                  const seasonNum = item.seasonNumber || 1;
                  const res = await fetch(
                    `/api/catalog/tv/${item.tmdbId}?season=${seasonNum}&lang=${lang}`
                  );
                  const data = await res.json();
                  if (data?.details?.episodes?.length > 0) {
                    await handlePlaySeriesEpisode(
                      data.details as TvSeriesDetails,
                      data.details.episodes[0] as TvEpisodeItem,
                      'ES'
                    );
                  }
                } catch {
                  // fallback already focused series section
                }
              } else {
                await handlePlayMovie(item, 'ES');
              }
            }}
            onSelectChannel={(ch) => handlePlayTdtChannel(ch, 0)}
            onSearchWithAi={(query, mediaType = 'all') => {
              setShowCommandSearch(false);
              setAiSearchLaunch((prev) => ({
                query,
                mediaType,
                mode: 'request',
                seq: (prev?.seq || 0) + 1,
              }));
              setShowSurpriseModal(true);
            }}
          />

          <SurpriseMeModal
            isOpen={showSurpriseModal}
            onClose={() => setShowSurpriseModal(false)}
            lang={lang}
            movies={quickPool.movies}
            series={quickPool.series}
            isLoading={quickPoolLoading}
            initialRequest={aiSearchLaunch}
            onRetryLoad={() => {
              void loadQuickPool();
            }}
            onPlayItem={async (item) => {
              if (item.mediaType === 'tv' && item.tmdbId) {
                setCatalogSection('series');
                try {
                  const seasonNum = item.seasonNumber || 1;
                  const res = await fetch(
                    `/api/catalog/tv/${item.tmdbId}?season=${seasonNum}&lang=${lang}`
                  );
                  const data = await res.json();
                  if (data?.details?.episodes?.length > 0) {
                    await handlePlaySeriesEpisode(
                      data.details as TvSeriesDetails,
                      data.details.episodes[0] as TvEpisodeItem,
                      'ES'
                    );
                  }
                } catch {
                  // keep series tab focused
                }
              } else {
                await handlePlayMovie(item, 'ES');
              }
            }}
          />

          <LegalPrivacyModal
            isOpen={showLegalModal}
            onClose={() => setShowLegalModal(false)}
            lang={lang}
          />
        </React.Suspense>

        <WorldPortalTransition portal={activePortalTransition} lang={lang} />
        <GameMatchInviteModal
          invite={incomingGameInvite}
          lang={lang}
          onAccept={handleAcceptGameInvite}
          onDismiss={() => {
            if (incomingGameInvite) {
              socketService.respondToGameInvite(
                incomingGameInvite.gameType,
                'declined',
                incomingGameInvite.id
              );
            }
            setIncomingGameInvite(null);
          }}
        />
      </div>
    </div>
    </MotionConfig>
  );
}

export default App;
