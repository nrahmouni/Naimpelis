import { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import type { NativeApkUpdateAvailable } from '../utils/versionSync';
import {
  AppLanguage,
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  OnlineAppUser,
  SavedFriend,
  SpanishTdtChannel,
  VideoState,
  WatchHistoryItem,
} from '../types';
import {
  getFavoriteChannels,
  getRecentRooms,
  getSavedFriends,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  StoredProfile,
  wasGuestPopupDismissed,
} from '../utils/storage';
import { parseRoomFromWindow } from '../utils/shortLink';
import {
  buildCurrentParticipantAndRole,
  deriveAppControllerLayoutFlags,
  resolveInitialRoomSetup,
  useAppControllerEffects,
} from './appControllerHelpers';
import { useViewLayoutMode } from '../components/MobileViewportGuard';
import type { ProfileHubTab } from '../components/UserProfileHubModal';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore, type SessionMode, type WorldId } from '../store/useAppStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { useCloudSyncSubscriptions } from './useCloudSyncSubscriptions';
import { useTvRemoteBridge } from './useTvRemoteBridge';
import { useGameVoiceChat } from './useGameVoiceChat';
import { useLiveScoresQuery, useFootballBoardQuery } from './useCatalogQueries';
import { useMiniPlayerDrag } from './useMiniPlayerDrag';
import { useTvRoomPolling } from './useTvRoomPolling';
import { useLiveSportsMatchDetails } from './useLiveSportsMatchDetails';
import { useRoomSocketEvents } from './useRoomSocketEvents';
import { usePlaybackOrchestrator } from './usePlaybackOrchestrator';
import { useRoomSocialActions } from './useRoomSocialActions';
import { useWorldNavigation } from './useWorldNavigation';
import { useViewportAndShortcuts } from './useViewportAndShortcuts';
import { useRoomAuthoritativeState } from './useRoomAuthoritativeState';
import { useRoomLifecycleActions } from './useRoomLifecycleActions';
import { useRoomGameActions } from './useRoomGameActions';
import { useDeepLinkRouter } from './useDeepLinkRouter';
import { useAppNavigationHistory } from './useAppNavigationHistory';
import { useBackInterceptor } from '../lib/backInterceptor';
import { isGoogleTvEnvironment, isTizenTvRuntime } from '../utils/tvSpatialNav';
import { reportClientVitalsOnce } from '../utils/clientTelemetry';
import {
  checkIsNestedSandboxFrame,
  CINEMA_MODE_SESSION_KEY,
  INITIAL_VIDEO_STATE,
  loadCachedSavedRooms,
  loadSessionRoomPins,
  normalizeDeepLinkGameType,
  SAVED_ROOMS_CACHE_KEY,
} from '../utils/appSessionHelpers';

export function useAppController() {
  const [lang, setLang] = useState<AppLanguage>('es');
  const [profile, setProfile] = useState<StoredProfile>(() => getStoredProfile());
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(() => getWatchHistory());
  const [watchlist, setWatchlist] = useState<CatalogMovie[]>(() => getWatchlist());
  const [favoriteChannels, setFavoriteChannels] = useState<FavoriteChannelItem[]>(() =>
    getFavoriteChannels()
  );
  const [savedFriends, setSavedFriends] = useState<SavedFriend[]>(() => getSavedFriends());
  const [onlineUsers, setOnlineUsers] = useState<OnlineAppUser[]>([]);
  const [friendsModalOpen, setFriendsModalOpen] = useState<boolean>(false);
  const [incomingInvite, setIncomingInvite] = useState<IncomingRoomInvite | null>(null);
  const [friendAddedNotice, setFriendAddedNotice] = useState<IncomingFriendAddedNotice | null>(
    null
  );
  const [inviteSentFeedback, setInviteSentFeedback] = useState<string | null>(null);
  const inviteFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenFriendNoticeBySenderRef = useRef<Map<string, number>>(new Map());

  const { effectiveView, isDesktopLayout, isFramedMobileOnPc, toggleViewMode } =
    useViewLayoutMode();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [profileHubOpen, setProfileHubOpen] = useState<boolean>(false);
  const [profileHubTab, setProfileHubTab] = useState<ProfileHubTab>('history');

  const initialRoute = parseRoomFromWindow();
  const initialUrlRoom = initialRoute.roomId;
  const [isTvMode, setIsTvMode] = useState<boolean>(initialRoute.isTvMode);
  const [isTvPairLobby, setIsTvPairLobby] = useState<boolean>(initialRoute.isTvPairLobby);
  const [isAdsPageOpen, setIsAdsPageOpen] = useState<boolean>(Boolean(initialRoute.isAdsPage));
  const [isAdminPage, setIsAdminPage] = useState<boolean>(Boolean(initialRoute.isAdminPage));
  const [isSamsungPage, setIsSamsungPage] = useState<boolean>(Boolean(initialRoute.isSamsungPage));
  const [isWebOsPage, setIsWebOsPage] = useState<boolean>(Boolean(initialRoute.isWebOsPage));
  const [isControllerPage, setIsControllerPage] = useState<boolean>(
    Boolean(initialRoute.isControllerPage)
  );
  const controllerPairCode = initialRoute.controllerPairCode || '';
  const initialDeepLinkGame =
    !initialRoute.isTvMode &&
    !initialRoute.isTvPairLobby &&
    !initialRoute.isAdsPage &&
    !initialRoute.isAdminPage &&
    !initialRoute.isSamsungPage &&
    !initialRoute.isWebOsPage &&
    !initialRoute.isControllerPage
      ? normalizeDeepLinkGameType(initialRoute.gameType)
      : null;
  const [tvAuthToken, setTvAuthToken] = useState<string>('');

  const [savedRooms, setSavedRooms] = useState<CloudSavedRoom[]>(() => loadCachedSavedRooms());
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
  const [showVoiceAssistant, setShowVoiceAssistant] = useState<boolean>(false);
  const [quickPool, setQuickPool] = useState<{
    movies: CatalogMovie[];
    series: CatalogMovie[];
    tdt: SpanishTdtChannel[];
  }>({ movies: [], series: [], tdt: [] });
  const [quickPoolLoading, setQuickPoolLoading] = useState<boolean>(false);
  const [nativeApkUpdate, setNativeApkUpdate] = useState<NativeApkUpdateAvailable | null>(null);

  const storeSessionMode = useAppStore((s) => s.sessionMode);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const storeHasEnteredApp = useAppStore((s) => s.hasEnteredApp);
  const setHasEnteredApp = useAppStore((s) => s.setHasEnteredApp);
  const shareToast = useAppStore((s) => s.shareToast);
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

  const notifications = useNotificationStore((s) => s.notifications);
  const pushNotification = useNotificationStore((s) => s.pushNotification);
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const isGoogleTvApp = isGoogleTvEnvironment();
  const { effectiveInitialRoom, initialRoomName } = resolveInitialRoomSetup(
    initialRoute,
    isGoogleTvApp
  );

  const [bootSyncPending, setBootSyncPending] = useState<boolean>(true);
  const isTizenAutoBoot =
    typeof window !== 'undefined' &&
    isTizenTvRuntime() &&
    !effectiveInitialRoom &&
    !initialRoute.isTvPairLobby &&
    !initialRoute.isAdsPage &&
    !initialRoute.isAdminPage &&
    !initialRoute.isSamsungPage &&
    !initialRoute.isWebOsPage &&
    !initialRoute.isControllerPage &&
    !initialRoute.isDedicatedEntry &&
    !/[?&]hub=1\b/i.test(window.location.search || '');
  const isDedicatedSoloBoot = !effectiveInitialRoom && (initialRoute.isDedicatedEntry || isTizenAutoBoot);
  const sessionMode: SessionMode = bootSyncPending
    ? effectiveInitialRoom
      ? 'party'
      : isDedicatedSoloBoot
      ? 'solo'
      : storeSessionMode
    : storeSessionMode;
  const hasEnteredApp: boolean = bootSyncPending
    ? storeHasEnteredApp || Boolean(effectiveInitialRoom) || isDedicatedSoloBoot
    : storeHasEnteredApp;

  useEffect(() => {
    if (effectiveInitialRoom) {
      setSessionMode('party');
      setHasEnteredApp(true);
    } else if (isDedicatedSoloBoot) {
      setSessionMode('solo');
      setHasEnteredApp(true);
      if (isTizenAutoBoot) {
        setActiveWorld('tv');
      }
    }
    setBootSyncPending(false);
    reportClientVitalsOnce(
      initialRoute.isAdminPage ? 'admin' : activeWorld === 'music' ? 'music' : 'tv'
    );
    // Run once on mount for initial deep-link/room boot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [roomId, setRoomId] = useState<string>(effectiveInitialRoom);
  const [roomName, setRoomName] = useState<string>(initialRoomName);
  const [inRoom, setInRoom] = useState<boolean>(Boolean(effectiveInitialRoom));
  const worldSearchQuery = useAppStore((s) => s.worldSearchQueries[s.activeWorld] ?? '');
  const setWorldSearchQuery = useCallback((nextVal: React.SetStateAction<string>) => {
    const st = useAppStore.getState();
    const cur = st.worldSearchQueries[st.activeWorld] ?? '';
    const resolved = typeof nextVal === 'function' ? nextVal(cur) : nextVal;
    st.setWorldSearchQuery(st.activeWorld, resolved);
  }, []);
  const worldSearchQueryRef = useRef<string>(worldSearchQuery);
  worldSearchQueryRef.current = worldSearchQuery;
  const [avatarMenuOpen, setAvatarMenuOpen] = useState<boolean>(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState<boolean>(false);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState<boolean>(false);
  const [pinFullPlayerOnChat, setPinFullPlayerOnChat] = useState<boolean>(true);
  const [isPlayerClosedLocally, setIsPlayerClosedLocally] = useState<boolean>(false);
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );
  const [isCinemaMode, setIsCinemaMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(CINEMA_MODE_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showGuestPopup, setShowGuestPopup] = useState<boolean>(() => {
    if (!initialUrlRoom || isTvMode) return false;
    const stored = getStoredProfile();
    return !stored.isCustomized && !wasGuestPopupDismissed(initialUrlRoom);
  });

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleFsChange = () => {
      const next = Boolean(document.fullscreenElement);
      setIsDocumentFullscreen((prev) => (prev === next ? prev : next));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const catalogScrollRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const inRoomRef = useRef<boolean>(inRoom);
  inRoomRef.current = inRoom;
  const sessionModeRef = useRef<SessionMode>(sessionMode);
  sessionModeRef.current = sessionMode;
  const hasEnteredAppRef = useRef<boolean>(hasEnteredApp);
  hasEnteredAppRef.current = hasEnteredApp;
  const upgradeSoloToPartyRef = useRef<
    (opts?: { keepDedicatedUrl?: boolean; targetWorld?: WorldId; customRoomName?: string }) => string
  >(() => '');
  const isNestedSandboxFrame = checkIsNestedSandboxFrame();

  const setCinemaModePersist = useCallback((next: boolean) => {
    setIsCinemaMode(next);
    try {
      if (next) sessionStorage.setItem(CINEMA_MODE_SESSION_KEY, '1');
      else sessionStorage.removeItem(CINEMA_MODE_SESSION_KEY);
    } catch {
      // ignore
    }
  }, []);

  const roomState = useRoomAuthoritativeState({
    effectiveInitialRoom,
    initialDeepLinkGame,
    watchHistory,
    isTvPairLobby,
    savedRooms,
    sessionPinMap,
    isCinemaMode,
    isPlayerMinimized,
    isPlayerClosedLocally,
  });

  const { visualViewportHeight, isMobileKeyboardOpen, isMobileLandscape } =
    useViewportAndShortcuts({
      videoStateRef: roomState.videoStateRef,
      isCinemaModeRef: roomState.isCinemaModeRef,
      onApkUpdate: setNativeApkUpdate,
    });

  const {
    activeSportsMatch, setActiveSportsMatch, activeMatchDetails, setActiveMatchDetails,
    loadingActiveMatchDetails, showLiveMatchDock, setShowLiveMatchDock, refreshActiveMatchDetails,
  } = useLiveSportsMatchDetails({
    videoMode: roomState.videoState.mode,
    videoIsLive: roomState.videoState.isLive,
    videoTitle: roomState.videoState.title,
    videoSubtitle: roomState.videoState.subtitle,
    isExtracting: roomState.isExtracting,
  });
  const activeSportsMatchRef = useRef(activeSportsMatch);
  activeSportsMatchRef.current = activeSportsMatch;
  const activeMatchDetailsRef = useRef(activeMatchDetails);
  activeMatchDetailsRef.current = activeMatchDetails;

  const { rememberSessionPin, showHostLockNotice } = useAppControllerEffects({
    lang, roomId, inRoom, videoMode: roomState.videoState.mode, isExtracting: roomState.isExtracting,
    hadActivePlaybackRef: roomState.hadActivePlaybackRef, lockToastTimerRef: roomState.lockToastTimerRef,
    setLockNoticeToast: roomState.setLockNoticeToast, setIncomingGameInvite: roomState.setIncomingGameInvite,
    setCinemaModePersist, setSessionPinMap,
  });

  const { isHostUser, currentUser } = buildCurrentParticipantAndRole({
    participants: roomState.participants, creatorId: roomState.creatorId, hostId: roomState.hostId,
    profile, isTvMode,
  });

  const canChangeMedia = sessionMode === 'solo' || true;
  const canControlRoom = true;
  const voiceChat = useGameVoiceChat({
    roomId,
    currentUserId: currentUser.id,
    lang,
    enabled: sessionMode !== 'solo' && inRoom && Boolean(roomId),
  });
  const { data: liveScores = [] } = useLiveScoresQuery((inRoom || hasEnteredApp) && !isTvMode);
  const liveMatchesCount = liveScores.filter((m) => m.isLive).length;
  const { data: homeFootballMatches = [] } = useFootballBoardQuery(
    (inRoom || hasEnteredApp) && !isTvMode && activeWorld === 'entry',
    lang
  );

  const handleNavUpgradeSoloToParty = useCallback(
    (opts?: { targetWorld?: WorldId }) => upgradeSoloToPartyRef.current(opts),
    []
  );

  const {
    activePortalTransition,
    portalOriginRect,
    portalLandingActive,
    preloadWorld,
    enterWorld,
    goBackWorld,
    goHome,
    applyWorldChange,
  } = useWorldNavigation({
    sessionMode,
    roomId,
    reducedMotion,
    effectiveInitialRoom,
    initialDeepLinkGame,
    inRoomRef,
    mainScrollRef,
    catalogScrollRef,
    setActiveWorld,
    setCatalogSection: roomState.setCatalogSection,
    setMobileTab: roomState.setMobileTab,
    setUnreadChatCount: roomState.setUnreadChatCount,
    setIsInActiveGame: roomState.setIsInActiveGame,
    setWorldSearchQuery,
    setShowWatchlistOnly,
    onUpgradeSoloToParty: handleNavUpgradeSoloToParty,
  });

  useCloudSyncSubscriptions({
    savedRoomsCacheKey: SAVED_ROOMS_CACHE_KEY,
    loadCachedSavedRooms,
    rememberSessionPin,
    inRoomRef,
    sessionModeRef,
    hasEnteredAppRef,
    manualLobbyStayRef: roomState.manualLobbyStayRef,
    isTvPairLobbyRef: roomState.isTvPairLobbyRef,
    setAuthUser,
    setAuthLoading,
    setSavedRooms,
    setProfile,
    setShowGuestPopup,
    setShowIntro,
    setCatalogSection: roomState.setCatalogSection,
    setMobileTab: roomState.setMobileTab,
    setRoomId,
    setRoomName,
    setInRoom,
    setWatchHistory,
    setWatchlist,
    setFavoriteChannels,
    setSavedFriends,
  });

  const normalizedRoomCode = roomId.trim().toLowerCase();
  const currentSavedRoom = savedRooms.find(
    (r) => r.roomCode.toLowerCase() === normalizedRoomCode
  );
  const isCurrentRoomPermanent = Boolean(currentSavedRoom);
  const currentHostPin =
    sessionPinMap[normalizedRoomCode] ||
    (currentSavedRoom?.hasPin ? currentSavedRoom.pinCode : undefined);

  const [roomHasPin, setRoomHasPin] = useState<boolean>(false);

  const socialActions = useRoomSocialActions({
    lang,
    authUser,
    profile,
    setProfile,
    roomId,
    normalizedRoomCode,
    roomName,
    setRoomName,
    inRoom,
    isCurrentRoomPermanent,
    currentHostPin,
    currentSavedRoom,
    isHostUser,
    roomHasPin,
    setRoomHasPin,
    hostOnlyControl: roomState.hostOnlyControl,
    videoState: roomState.videoState,
    roomQueue: roomState.roomQueue,
    watchHistory,
    setWatchHistory,
    setWatchlist,
    setFavoriteChannels,
    setSavedFriends,
    setSavedRooms,
    setShowGuestPopup,
    setInviteSentFeedback,
    setQuickPool,
    setQuickPoolLoading,
    quickPoolMoviesLen: quickPool.movies.length,
    quickPoolSeriesLen: quickPool.series.length,
    manualLobbyStayRef: roomState.manualLobbyStayRef,
    inviteFeedbackTimerRef,
    rememberSessionPin,
  });

  const effectiveVideoState: VideoState = isPlayerClosedLocally
    ? INITIAL_VIDEO_STATE
    : roomState.videoState;
  const isOnMobileSocialTab = activeWorld === 'sala';
  const isPlayerActive =
    (effectiveVideoState.mode !== 'idle' || roomState.isExtracting) && !isPlayerClosedLocally;
  const isPlayingMediaReady =
    effectiveVideoState.mode !== 'idle' && !roomState.isExtracting && !isPlayerClosedLocally;
  const isDockedMini =
    isPlayerActive &&
    (isPlayerMinimized || (isPlayingMediaReady && isOnMobileSocialTab && !pinFullPlayerOnChat));

  const miniDrag = useMiniPlayerDrag({
    isDockedMini,
    isExtracting: roomState.isExtracting,
    isPlayerClosedLocally,
    videoMode: effectiveVideoState.mode,
    isMobileKeyboardOpen,
  });
  const setIsAutoMiniByScroll = miniDrag.setIsAutoMiniByScroll;

  const roomGameActions = useRoomGameActions();

  const scrollDesktopToPlayer = useCallback(() => {
    const scrollTopMain = mainScrollRef.current?.scrollTop ?? 0;
    const scrollTopCatalog = catalogScrollRef.current?.scrollTop ?? 0;
    const store = useAppStore.getState();
    const existing = store.playbackReturnContext;
    if (existing) {
      store.setPlaybackReturnContext({
        ...existing,
        homeSearchQuery: existing.homeSearchQuery ?? store.homeSearchQuery,
        homeSearchCategory: existing.homeSearchCategory ?? store.homeSearchCategory,
        scrollTopMain: existing.scrollTopMain ?? scrollTopMain,
        scrollTopCatalog: existing.scrollTopCatalog ?? scrollTopCatalog,
      });
    } else {
      store.setPlaybackReturnContext({
        world: store.activeWorld,
        cineTab: store.cineTab,
        cineSpecialPortal: store.cineSpecialPortal,
        futbolTab: store.futbolTab,
        searchQuery: worldSearchQueryRef.current,
        homeSearchQuery: store.homeSearchQuery,
        homeSearchCategory: store.homeSearchCategory,
        scrollTopMain,
        scrollTopCatalog,
      });
    }

    setIsPlayerClosedLocally(false);
    setIsPlayerMinimized(false);
    setIsAutoMiniByScroll(false);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setIsAutoMiniByScroll]);

  const restorePlaybackOrigin = useCallback(
    (_opts?: { reason: 'close' | 'cancel' | 'minimize' }) => {
      const store = useAppStore.getState();
      const ctx = store.playbackReturnContext;
      if (!ctx) return;
      store.setPlaybackReturnContext(null);

      if (ctx.world && ctx.world !== store.activeWorld) {
        applyWorldChange(ctx.world, { skipScrollReset: true });
      }
      if (ctx.cineTab) {
        store.setCineTab(ctx.cineTab);
      }
      if (ctx.cineSpecialPortal !== undefined) {
        store.setCineSpecialPortal(ctx.cineSpecialPortal);
      }
      if (ctx.futbolTab) {
        store.setFutbolTab(ctx.futbolTab);
      }
      if (typeof ctx.searchQuery === 'string') {
        setWorldSearchQuery(ctx.searchQuery);
      }
      if (typeof ctx.homeSearchQuery === 'string') {
        store.setHomeSearchQuery(ctx.homeSearchQuery);
        if (ctx.homeSearchQuery.trim()) {
          store.setHomeSearchOverlayDismissed(false);
        }
      }
      if (ctx.homeSearchCategory) {
        store.setHomeSearchCategory(ctx.homeSearchCategory);
      }

      if (ctx.movieModal) {
        store.setRequestedMovieModal(ctx.movieModal);
      }
      if (ctx.seriesModal) {
        store.setRequestedSeriesModal({
          series: ctx.seriesModal.series,
          season: ctx.seriesModal.season,
          episode: ctx.seriesModal.episode ?? undefined,
          lang: ctx.seriesModal.lang,
          forceSpanish: ctx.seriesModal.forceSpanish,
          fromPreviewItem: ctx.seriesModal.fromPreviewItem ?? null,
          initialScrollTop: ctx.seriesModal.pageScrollTop,
        });
      }
      if (ctx.catalaModal) {
        store.setRequestedCatalaModal(ctx.catalaModal);
      }
      if (ctx.epgChannel) {
        store.setRequestedEpgChannel(ctx.epgChannel);
      }

      const mainTop = ctx.scrollTopMain ?? 0;
      const catalogTop = ctx.scrollTopCatalog ?? 0;
      if (mainTop > 0 || catalogTop > 0) {
        store.setPendingScrollRestore({ mainTop, catalogTop });
      }
    },
    [applyWorldChange]
  );

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
        if (next) sessionStorage.setItem(CINEMA_MODE_SESSION_KEY, '1');
        else sessionStorage.removeItem(CINEMA_MODE_SESSION_KEY);
      } catch {
        // ignore
      }
      return next;
    });
  }, [setIsAutoMiniByScroll]);

  const handlePlaybackUpgradeSoloToParty = useCallback(() => {
    upgradeSoloToPartyRef.current();
  }, []);

  const playback = usePlaybackOrchestrator({
    sessionMode,
    onUpgradeSoloToParty: handlePlaybackUpgradeSoloToParty,
    lang,
    profileName: profile.name,
    canChangeMedia,
    canControlRoom,
    hostId: roomState.hostId,
    participants: roomState.participants,
    isNestedSandboxFrame,
    cloudState: roomState.cloudState,
    videoState: roomState.videoState,
    setVideoState: roomState.setVideoState,
    videoStateRef: roomState.videoStateRef,
    videoStateUrlRef: roomState.videoStateUrlRef,
    isCinemaModeRef: roomState.isCinemaModeRef,
    watchHistoryRef: roomState.watchHistoryRef,
    setWatchHistory,
    isPlayerClosedLocallyRef: roomState.isPlayerClosedLocallyRef,
    setIsPlayerClosedLocally,
    isPlayerMinimizedRef: roomState.isPlayerMinimizedRef,
    setIsPlayerMinimized,
    setCinemaModePersist,
    isExtracting: roomState.isExtracting,
    setIsExtracting: roomState.setIsExtracting,
    isExtractingRef: roomState.isExtractingRef,
    activeSportsMatchRef,
    setActiveSportsMatch,
    activeMatchDetailsRef,
    setActiveMatchDetails,
    setShowLiveMatchDock,
    activeMovieContextRef: roomState.activeMovieContextRef,
    setActiveMovieContext: roomState.setActiveMovieContext,
    secondaryStream: roomState.secondaryStream,
    setSecondaryStream: roomState.setSecondaryStream,
    secondaryStreams: roomState.secondaryStreams,
    setSecondaryStreams: roomState.setSecondaryStreams,
    activeAudioSlot: roomState.activeAudioSlot,
    setActiveAudioSlot: roomState.setActiveAudioSlot,
    setCatalogSection: roomState.setCatalogSection,
    setMobileTab: roomState.setMobileTab,
    showHostLockNotice,
    scrollDesktopToPlayer,
    onRestorePlaybackOrigin: restorePlaybackOrigin,
  });

  roomState.handlePlayQueueItemRef.current = playback.handlePlayQueueItem;

  useRoomSocketEvents({
    sessionMode,
    hasAuthUser: Boolean(authUser),
    inRoom,
    roomId,
    roomName,
    isTvMode,
    isTvPairLobby,
    tvAuthToken,
    lang,
    profile,
    mobileTabRef: roomState.mobileTabRef,
    hostIdRef: roomState.hostIdRef,
    roomQueueRef: roomState.roomQueueRef,
    videoStateUrlRef: roomState.videoStateUrlRef,
    savedRoomsRef: roomState.savedRoomsRef,
    sessionPinMapRef: roomState.sessionPinMapRef,
    isExtractingRef: roomState.isExtractingRef,
    activeHubGameRef: roomState.activeHubGameRef,
    catalogSectionRef: roomState.catalogSectionRef,
    handlePlayQueueItemRef: roomState.handlePlayQueueItemRef,
    inviteFeedbackTimerRef,
    friendNoticeTimerRef,
    seenFriendNoticeBySenderRef,
    tvClaimTimerRef: roomState.tvClaimTimerRef,
    pendingSoloUpgradeVideoStateRef: roomState.pendingSoloUpgradeVideoStateRef,
    recordStateInWatchHistory: playback.recordStateInWatchHistory,
    rememberSessionPin,
    showHostLockNotice,
    setTypingUser,
    pushNotification,
    setOnlineUsers,
    setIncomingInvite,
    setFriendAddedNotice,
    setInviteSentFeedback,
    setRoomName,
    setHostId: roomState.setHostId,
    setCreatorId: roomState.setCreatorId,
    setHostOnlyControl: roomState.setHostOnlyControl,
    setRoomHasPin,
    setPinPromptState,
    setActivePoll: roomState.setActivePoll,
    setRoomGameState: roomState.setRoomGameState,
    setPartyGameState: roomState.setPartyGameState,
    setPinturilloState: roomState.setPinturilloState,
    setPoolGameState: roomState.setPoolGameState,
    setChapasGameState: roomState.setChapasGameState,
    setHeadSoccerGameState: roomState.setHeadSoccerGameState,
    setHeadSoccerPeerInput: roomState.setHeadSoccerPeerInput,
    setHeadSoccerSyncSnapshot: roomState.setHeadSoccerSyncSnapshot,
    setPokerGameState: roomState.setPokerGameState,
    setBlackjackGameState: roomState.setBlackjackGameState,
    setMatchResponses: roomState.setMatchResponses,
    setGameMoveError: roomState.setGameMoveError,
    setParticipants: roomState.setParticipants,
    setMessages: roomState.setMessages,
    setPinnedMessage: roomState.setPinnedMessage,
    setRoomQueue: roomState.setRoomQueue,
    setRecentRooms,
    setVideoState: roomState.setVideoState,
    setIsPlayerClosedLocally,
    setCloudFrame: roomState.setCloudFrame,
    setCloudState: roomState.setCloudState,
    setUnreadChatCount: roomState.setUnreadChatCount,
    setFloatingReactions: roomState.setFloatingReactions,
    setTvClaimStatus,
    setIncomingGameInvite: roomState.setIncomingGameInvite,
    setForcedOpenGame: roomState.setForcedOpenGame,
  });

  const { handleClaimTvCode, handleSendTvRemoteCommand } = useTvRoomPolling({
    inRoom,
    isTvMode,
    roomId,
    roomName,
    lang,
    profileId: profile.id,
    profileName: profile.name,
    tvAuthToken,
    sessionPinMap,
    setRoomName,
    setParticipants: roomState.setParticipants,
    setVideoState: roomState.setVideoState,
    setPinPromptState,
    setTvClaimStatus,
    tvClaimTimerRef: roomState.tvClaimTimerRef,
  });

  const lifecycle = useRoomLifecycleActions({
    sessionMode,
    sessionModeRef,
    setSessionMode,
    setHasEnteredApp,
    pendingSoloUpgradeVideoStateRef: roomState.pendingSoloUpgradeVideoStateRef,
    getLivePlaybackSec: playback.getLivePlaybackSec,
    lang,
    profile,
    hostId: roomState.hostId,
    participants: roomState.participants,
    canChangeMedia,
    videoState: roomState.videoState,
    roomQueue: roomState.roomQueue,
    inRoomRef,
    manualLobbyStayRef: roomState.manualLobbyStayRef,
    queueToastTimerRef: roomState.queueToastTimerRef,
    setProfile,
    setShowGuestPopup,
    setIsPlayerMinimized,
    setIsPlayerClosedLocally,
    setSecondaryStream: roomState.setSecondaryStream,
    setSecondaryStreams: roomState.setSecondaryStreams,
    setActiveAudioSlot: roomState.setActiveAudioSlot,
    setCatalogSection: roomState.setCatalogSection,
    setMobileTab: roomState.setMobileTab,
    setActiveWorld,
    setForcedOpenGame: roomState.setForcedOpenGame,
    setIsInActiveGame: roomState.setIsInActiveGame,
    setWorldSearchQuery,
    setAvatarMenuOpen,
    setRoomId,
    setRoomName,
    setInRoom,
    setIntroWithSound,
    setShowIntro,
    setIsTvPairLobby,
    setIsTvMode,
    setTvAuthToken,
    setPinPromptState,
    setCinemaModePersist,
    setActivePoll: roomState.setActivePoll,
    setRoomGameState: roomState.setRoomGameState,
    setPartyGameState: roomState.setPartyGameState,
    setPinnedMessage: roomState.setPinnedMessage,
    setGameMoveError: roomState.setGameMoveError,
    setHostId: roomState.setHostId,
    setCreatorId: roomState.setCreatorId,
    setHostOnlyControl: roomState.setHostOnlyControl,
    setRoomHasPin,
    setVideoState: roomState.setVideoState,
    setCloudFrame: roomState.setCloudFrame,
    setCloudState: roomState.setCloudState,
    setIsFloatingRoomOpen,
    setQueueAddedNotice: roomState.setQueueAddedNotice,
    setOpenQueueTrigger: roomState.setOpenQueueTrigger,
    setExtractionError: playback.setExtractionError,
    setIncomingInvite,
    setFriendsModalOpen,
    clearExtractionSnapshot: playback.clearExtractionSnapshot,
    enterWorld,
    showHostLockNotice,
    scrollDesktopToPlayer,
    handleSyncPlayerAction: playback.handleSyncPlayerAction,
  });

  upgradeSoloToPartyRef.current = lifecycle.upgradeSoloToPartyRoom;

  const { deepLinkResolving } = useDeepLinkRouter({
    sessionMode,
    hasEnteredApp,
    isTvMode,
    isTvPairLobby,
    isAdsPageOpen,
    isAdminPage,
    setIsAdminPage,
    isSamsungPage,
    setIsSamsungPage,
    isWebOsPage,
    setIsWebOsPage,
    enterWorld,
    setForcedOpenGame: roomState.setForcedOpenGame,
    setIsInActiveGame: roomState.setIsInActiveGame,
    handlePlayTdtChannel: playback.handlePlayTdtChannel,
    handlePlaySportsMatch: playback.handlePlaySportsMatch,
    quickPool,
  });

  const handleTvRemoteSetCatalogSection = useCallback(
    (sec: Parameters<typeof roomState.setCatalogSection>[0]) => {
      if (sec === 'home') enterWorld('entry');
      else roomState.setCatalogSection(sec);
    },
    [enterWorld, roomState.setCatalogSection]
  );

  useTvRemoteBridge({
    isAdsPageOpen,
    setIsAdsPageOpen,
    smartTvModalOpen,
    setSmartTvModalOpen,
    friendsModalOpen,
    setFriendsModalOpen,
    profileHubOpen,
    setProfileHubOpen,
    floatingChatOpen: roomState.floatingChatOpen,
    setFloatingChatOpen: roomState.setFloatingChatOpen,
    sidebarOpen: isFloatingRoomOpen,
    setSidebarOpen: setIsFloatingRoomOpen,
    videoState: roomState.videoState,
    isExtracting: roomState.isExtracting,
    isPlayerClosedLocally,
    setIsPlayerClosedLocally,
    setIsExtracting: roomState.setIsExtracting,
    inRoom,
    catalogSection: roomState.catalogSection,
    setCatalogSection: handleTvRemoteSetCatalogSection,
    setMobileTab: roomState.setMobileTab,
    handleSelectTrack: playback.handleSelectTrack,
  });

  const {
    isScrollCompressed,
    showCinemaOverlay,
    hasConnectedSmartTv,
    isMobileChatWithKeyboard,
    isAutoImmersiveLandscape,
    hideBrowseBelowPlayer,
    isMoviePlaybackDockVisible,
    isChannelGuideDockVisible,
    lockMainWorkspaceScroll,
  } = deriveAppControllerLayoutFlags({
    activeWorld,
    videoState: roomState.videoState,
    isExtracting: roomState.isExtracting,
    isPlayerClosedLocally,
    isPlayerMinimized,
    isAutoMiniByScroll: miniDrag.isAutoMiniByScroll,
    pinFullPlayerOnChat,
    isCinemaMode,
    participants: roomState.participants,
    isDesktopLayout,
    isMobileKeyboardOpen,
    isMobileLandscape,
    mobileTab: roomState.mobileTab,
    floatingChatOpen: roomState.floatingChatOpen,
    isFloatingRoomOpen,
    activeSportsMatch,
    activeMovieContext: roomState.activeMovieContext,
    isInActiveGame: roomState.isInActiveGame,
  });

  const pendingScrollRestore = useAppStore((s) => s.pendingScrollRestore);
  const setPendingScrollRestore = useAppStore((s) => s.setPendingScrollRestore);

  useEffect(() => {
    if (!pendingScrollRestore || hideBrowseBelowPlayer) return;
    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 24;

    const tryRestore = () => {
      attempts += 1;
      const mainEl = mainScrollRef.current;
      const catEl = catalogScrollRef.current;
      const needMain = pendingScrollRestore.mainTop;
      const needCat = pendingScrollRestore.catalogTop;

      if (mainEl && needMain > 0) {
        mainEl.scrollTo({ top: needMain, behavior: 'auto' });
      }
      if (catEl && needCat > 0) {
        catEl.scrollTo({ top: needCat, behavior: 'auto' });
      }

      const mainSettled =
        needMain <= 0 || !mainEl || Math.abs(mainEl.scrollTop - needMain) <= 8 || mainEl.scrollHeight >= needMain + mainEl.clientHeight;
      const catSettled =
        needCat <= 0 || !catEl || Math.abs(catEl.scrollTop - needCat) <= 8 || catEl.scrollHeight >= needCat + catEl.clientHeight;

      if ((mainSettled && catSettled) || attempts >= maxAttempts) {
        setPendingScrollRestore(null);
        return;
      }
      rafId = window.requestAnimationFrame(tryRestore);
    };

    rafId = window.requestAnimationFrame(tryRestore);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [pendingScrollRestore, hideBrowseBelowPlayer, setPendingScrollRestore]);

  useBackInterceptor(
    roomState.isExtracting,
    'active-media-extraction',
    playback.handleCancelMediaExtraction,
    { priority: 22 }
  );

  const handleReturnToEntry = useCallback(() => goBackWorld(), [goBackWorld]);
  const handleExitFullscreen = useCallback(() => {
    try {
      void document.exitFullscreen?.();
    } catch {
      // ignore
    }
  }, []);
  const handleMinimizePlayer = useCallback(() => {
    setCinemaModePersist(false);
    if (isOnMobileSocialTab) setPinFullPlayerOnChat(false);
    else setIsPlayerMinimized(true);
    restorePlaybackOrigin({ reason: 'minimize' });
  }, [isOnMobileSocialTab, restorePlaybackOrigin, setCinemaModePersist]);
  const handleExitRoomOrApp = useCallback(() => {
    if (inRoom && sessionMode !== 'solo') {
      lifecycle.handleLeaveRoom();
    }
  }, [inRoom, sessionMode, lifecycle]);

  const { exitToastVisible, triggerBackStep } = useAppNavigationHistory({
    enabled: !isTvMode && !isTvPairLobby && !isAdsPageOpen && !isAdminPage && !isSamsungPage && !isWebOsPage && !isControllerPage && (inRoom || hasEnteredApp),
    inRoom,
    activeWorld,
    onReturnToEntry: handleReturnToEntry,
    hasActivePlayer: isPlayerActive,
    isPlayerMinimized: isPlayerMinimized || isDockedMini,
    isFullscreen: isDocumentFullscreen,
    onExitFullscreen: handleExitFullscreen,
    onMinimizePlayer: handleMinimizePlayer,
    onExitRoomOrApp: handleExitRoomOrApp,
  });

  return {
    sessionMode, setSessionMode, hasEnteredApp, setHasEnteredApp, shareToast, deepLinkResolving,
    exitToastVisible, triggerBackStep, restorePlaybackOrigin,
    lang, setLang, profile, recentRooms, watchHistory, watchlist, favoriteChannels, savedFriends,
    onlineUsers, friendsModalOpen, setFriendsModalOpen, incomingInvite, setIncomingInvite,
    friendAddedNotice, setFriendAddedNotice, inviteSentFeedback, friendNoticeTimerRef,
    effectiveView, isDesktopLayout, isFramedMobileOnPc, toggleViewMode, authUser, authLoading,
    profileHubOpen, setProfileHubOpen, profileHubTab, setProfileHubTab, isTvMode, setIsTvMode,
    isTvPairLobby, setIsTvPairLobby, isAdsPageOpen, setIsAdsPageOpen, isAdminPage, setIsAdminPage,
    isSamsungPage, setIsSamsungPage, isWebOsPage, setIsWebOsPage, isControllerPage, setIsControllerPage, controllerPairCode,
    setTvAuthToken, savedRooms,
    pinPromptState, tvClaimStatus, smartTvModalOpen, setSmartTvModalOpen, showIntro, setShowIntro,
    introWithSound, setIntroWithSound, showWatchlistOnly, setShowWatchlistOnly, showVoiceAssistant,
    setShowVoiceAssistant, quickPool, quickPoolLoading, nativeApkUpdate,
    setNativeApkUpdate, reducedMotion, activeWorld, lastUsedWorld, cineTab, setCineTab,
    cineCastellano, setCineCastellano, futbolTab, setFutbolTab, isFloatingRoomOpen,
    setIsFloatingRoomOpen, showDesignSystem, setShowDesignSystem, showLegalModal, setShowLegalModal,
    showNotificationCenter, setShowNotificationCenter, showCommandSearch, setShowCommandSearch,
    showSurpriseModal, setShowSurpriseModal, aiSearchLaunch, setAiSearchLaunch, typingUsers,
    swUpdate, applySwUpdateNow, deferredAppUpdateVersion, unreadNotificationsCount, roomId, setRoomId,
    roomName, setRoomName, inRoom, setInRoom, worldSearchQuery, setWorldSearchQuery,
    avatarMenuOpen, setAvatarMenuOpen, settingsSheetOpen, setSettingsSheetOpen, isPlayerMinimized,
    setIsPlayerMinimized, setPinFullPlayerOnChat, isPlayerClosedLocally, setIsPlayerClosedLocally,
    isCinemaMode, setCinemaModePersist, showGuestPopup, catalogScrollRef, mainScrollRef, roomState,
    visualViewportHeight, isMobileKeyboardOpen, activeSportsMatch, activeMatchDetails,
    loadingActiveMatchDetails, showLiveMatchDock, setShowLiveMatchDock, refreshActiveMatchDetails,
    isHostUser, currentUser, canChangeMedia, canControlRoom, voiceChat, liveMatchesCount,
    homeFootballMatches, activePortalTransition, portalOriginRect, portalLandingActive, preloadWorld,
    enterWorld, goBackWorld, goHome, showHostLockNotice, isCurrentRoomPermanent, currentHostPin, roomHasPin,
    socialActions, isOnMobileSocialTab, effectiveVideoState, isPlayerActive, isDockedMini, miniDrag,
    roomGameActions, handleToggleCinemaMode, playback, handleClaimTvCode,
    handleSendTvRemoteCommand, lifecycle, isScrollCompressed, showCinemaOverlay,
    hasConnectedSmartTv, isMobileChatWithKeyboard, isAutoImmersiveLandscape, hideBrowseBelowPlayer,
    isMoviePlaybackDockVisible, isChannelGuideDockVisible, lockMainWorkspaceScroll,
  };
}
