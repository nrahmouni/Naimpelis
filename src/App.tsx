import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { MotionConfig } from 'motion/react';
import { Play, Square, Lock, ListVideo } from 'lucide-react';
import { RiffanLoaderR } from './components/ui/RiffanIcons';
import { checkRemoteAppVersion, type NativeApkUpdateAvailable } from './utils/versionSync';
import {
  AppLanguage,
  BlackjackGameState,
  BoardGameState,
  CatalogMovie,
  ChatMessage,
  CloudBrowserState,
  CloudSavedRoom,
  FavoriteChannelItem,
  FloatingReaction,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  OnlineAppUser,
  Participant,
  PartyGameState,
  PinturilloGameState,
  PokerGameState,
  PollProposalItem,
  Pool8BallState,
  RoomPollState,
  RoomQueueItem,
  RoomRole,
  SavedFriend,
  SecondaryStreamState,
  SpanishTdtChannel,
  TvEpisodeItem,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
} from './types';
import type {
  RoomGameInvite,
  RoomGameInviteType,
  RoomMatchResponsesState,
} from './shared/protocol';
import { UI_COPY, pickLang } from './utils/i18n';
import {
  clearWatchHistory,
  dismissGuestPopupForRoom,
  getFavoriteChannels,
  getRecentRooms,
  getSavedFriends,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  removeLocalFriend,
  removeWatchHistoryItem,
  StoredProfile,
  toggleFavoriteChannel,
  toggleWatchlistItem,
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
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  upsertCloudFriend,
  upsertCloudSavedRoom,
} from './services/userCloudSync';
import { socketService } from './services/socket';
import { playCinemaSound, playWorldPortalSound, triggerHaptic } from './utils/haptics';
import { generateShortRoomCode, parseRoomFromWindow } from './utils/shortLink';
import { NaimBrandLogo } from './components/NaimBrandLogo';
import { getMonogramInitials, useViewLayoutMode } from './components/MobileViewportGuard';
import { OfflineIndicator } from './components/PWAInstallPrompt';
import { PreviewAutoEscapeBanner } from './components/player/PreviewAutoEscapeBanner';
import { GlobalIncomingInviteBanner } from './components/FriendsInviteModal';
import type { ProfileHubTab } from './components/UserProfileHubModal';
import { EntryHomeScreen } from './components/EntryHomeScreen';
import type { PortalOriginRect, WorldPortalKind } from './components/home/WorldPortalTransition';
import { WorldShell } from './components/worlds/WorldShell';
import { FloatingRoomBubble } from './components/FloatingRoomBubble';
import { AppGlobalModalsLayer } from './components/AppGlobalModalsLayer';
import type { ActiveMovieContext } from './components/MoviePlaybackDock';
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
import { useMiniPlayerDrag } from './hooks/useMiniPlayerDrag';
import { useTvRoomPolling } from './hooks/useTvRoomPolling';
import { useLiveSportsMatchDetails } from './hooks/useLiveSportsMatchDetails';
import { useRoomSocketEvents } from './hooks/useRoomSocketEvents';
import { usePlaybackOrchestrator } from './hooks/usePlaybackOrchestrator';
import { runWithViewTransition } from './lib/viewTransition';
import { isGoogleTvEnvironment } from './utils/tvSpatialNav';
import {
  checkIsNestedSandboxFrame,
  CINEMA_MODE_SESSION_KEY,
  INITIAL_VIDEO_STATE,
  loadCachedSavedRooms,
  loadSessionRoomPins,
  MobileNavTab,
  normalizeDeepLinkGameType,
  ROOM_PINS_SESSION_KEY,
  SAVED_ROOMS_CACHE_KEY,
} from './utils/appSessionHelpers';

import { CinemaPlaybackDocks } from './components/player/CinemaPlaybackDocks';
import { useRoomGameActions } from './hooks/useRoomGameActions';
const TvReceiverPairingScreen = React.lazy(() =>
  import('./components/TvReceiverPairingScreen').then((m) => ({
    default: m.TvReceiverPairingScreen,
  }))
);
const RoomPinPromptModal = React.lazy(() =>
  import('./components/RoomPinPromptModal').then((m) => ({ default: m.RoomPinPromptModal }))
);
const NaimCineAdsPage = React.lazy(() =>
  import('./components/NaimCineAdsPage').then((m) => ({ default: m.NaimCineAdsPage }))
);
const DesignSystemShowcase = React.lazy(() =>
  import('./components/DesignSystemShowcase').then((m) => ({
    default: m.DesignSystemShowcase,
  }))
);
const GamesHubSection = React.lazy(() =>
  import('./components/GamesHubSection').then((m) => ({ default: m.GamesHubSection }))
);
const RiffanKidsHub = React.lazy(() =>
  import('./components/kids/RiffanKidsHub').then((m) => ({ default: m.RiffanKidsHub }))
);
const NativeCinemaPlayer = React.lazy(() =>
  import('./components/NativeCinemaPlayer').then((m) => ({ default: m.NativeCinemaPlayer }))
);
const PartySidebar = React.lazy(() =>
  import('./components/PartySidebar').then((m) => ({ default: m.PartySidebar }))
);

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
  const [savedFriends, setSavedFriends] = useState<SavedFriend[]>(() => getSavedFriends());
  const [onlineUsers, setOnlineUsers] = useState<OnlineAppUser[]>([]);
  const [friendsModalOpen, setFriendsModalOpen] = useState<boolean>(false);
  const [incomingInvite, setIncomingInvite] = useState<IncomingRoomInvite | null>(null);
  const [friendAddedNotice, setFriendAddedNotice] =
    useState<IncomingFriendAddedNotice | null>(null);
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
  const [isAdsPageOpen, setIsAdsPageOpen] = useState<boolean>(
    Boolean(initialRoute.isAdsPage)
  );
  const initialDeepLinkGame =
    !initialRoute.isTvMode && !initialRoute.isTvPairLobby && !initialRoute.isAdsPage
      ? normalizeDeepLinkGameType(initialRoute.gameType)
      : null;
  const [tvAuthToken, setTvAuthToken] = useState<string>('');

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
  const [showVoiceAssistant, setShowVoiceAssistant] = useState<boolean>(false);
  const [kidsExitPromptSeq, setKidsExitPromptSeq] = useState<number>(0);
  const [quickPool, setQuickPool] = useState<{
    movies: CatalogMovie[];
    series: CatalogMovie[];
    tdt: SpanishTdtChannel[];
  }>({ movies: [], series: [], tdt: [] });
  const [quickPoolLoading, setQuickPoolLoading] = useState<boolean>(false);
  const [nativeApkUpdate, setNativeApkUpdate] =
    useState<NativeApkUpdateAvailable | null>(null);

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
  const initialAutoRoom =
    !initialUrlRoom &&
    (isGoogleTvApp || initialRoute.isKidsMode) &&
    !initialRoute.isTvPairLobby &&
    !initialRoute.isAdsPage
      ? loadCachedSavedRooms()[0]?.roomCode ||
        getRecentRooms()[0]?.id ||
        generateShortRoomCode(4)
      : '';
  const effectiveInitialRoom = initialUrlRoom || initialAutoRoom;

  const [roomId, setRoomId] = useState<string>(effectiveInitialRoom);
  const [roomName, setRoomName] = useState<string>(
    effectiveInitialRoom
      ? initialRoute.isKidsMode
        ? 'Riffan Kids'
        : isGoogleTvApp && !initialUrlRoom
        ? 'RiffanTV · Google TV'
        : `Sala ${effectiveInitialRoom.toUpperCase()}`
      : ''
  );
  const [inRoom, setInRoom] = useState<boolean>(Boolean(effectiveInitialRoom));

  const [worldSearchQuery, setWorldSearchQuery] = useState<string>('');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState<boolean>(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState<boolean>(false);

  const [isPlayerMinimized, setIsPlayerMinimized] = useState<boolean>(false);
  const [pinFullPlayerOnChat, setPinFullPlayerOnChat] = useState<boolean>(true);
  const catalogScrollRef = useRef<HTMLDivElement | null>(null);
  const isNestedSandboxFrame = checkIsNestedSandboxFrame();
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
  const [headSoccerGameState, setHeadSoccerGameState] =
    useState<HeadSoccerOnlineState | null>(null);
  const [headSoccerSyncSnapshot, setHeadSoccerSyncSnapshot] = useState<{
    seq: number;
    sim: HeadSoccerSimulation;
  } | null>(null);
  const [headSoccerPeerInput, setHeadSoccerPeerInput] = useState<{
    side: 0 | 1;
    input: HeadSoccerInput;
    seq: number;
  } | null>(null);
  const [pokerGameState, setPokerGameState] = useState<PokerGameState | null>(null);
  const [blackjackGameState, setBlackjackGameState] = useState<BlackjackGameState | null>(
    null
  );
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

  const [catalogSection, setCatalogSection] = useState<CatalogSection>(() =>
    effectiveInitialRoom && initialDeepLinkGame ? 'games' : 'home'
  );
  const [mobileTab, setMobileTab] = useState<MobileNavTab>(() =>
    effectiveInitialRoom && initialDeepLinkGame ? 'games' : 'home'
  );
  const [openQueueTrigger, setOpenQueueTrigger] = useState<number>(0);
  const [queueAddedNotice, setQueueAddedNotice] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState<boolean>(false);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState<boolean>(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' && !isGoogleTvEnvironment()
      ? window.innerWidth > window.innerHeight && window.innerHeight < 520
      : false
  );
  const [activeMovieContext, setActiveMovieContext] =
    useState<ActiveMovieContext | null>(null);
  const [isInActiveGame, setIsInActiveGame] = useState<boolean>(() =>
    Boolean(effectiveInitialRoom && initialDeepLinkGame)
  );

  // Detect mobile virtual keyboard via visualViewport & mobile horizontal landscape
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
  const handlePlayQueueItemRef = useRef<(item: RoomQueueItem) => void>(() => {});
  const lockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualLobbyStayRef = useRef<boolean>(false);
  const hadActivePlaybackRef = useRef<boolean>(false);

  const [incomingGameInvite, setIncomingGameInvite] = useState<RoomGameInvite | null>(null);
  const [forcedOpenGame, setForcedOpenGame] = useState<{
    gameType: RoomGameInviteType;
    seq: number;
  } | null>(() =>
    effectiveInitialRoom && initialDeepLinkGame
      ? { gameType: initialDeepLinkGame, seq: Date.now() }
      : null
  );
  const activeHubGameRef = useRef<RoomGameInviteType | null>(null);
  const catalogSectionRef = useRef<CatalogSection>(catalogSection);
  catalogSectionRef.current = catalogSection;
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
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
  const activeMovieContextRef = useRef(activeMovieContext);
  activeMovieContextRef.current = activeMovieContext;
  const isPlayerClosedLocallyRef = useRef(isPlayerClosedLocally);
  isPlayerClosedLocallyRef.current = isPlayerClosedLocally;
  const isPlayerMinimizedRef = useRef(isPlayerMinimized);
  isPlayerMinimizedRef.current = isPlayerMinimized;

  const {
    activeSportsMatch,
    setActiveSportsMatch,
    activeMatchDetails,
    setActiveMatchDetails,
    loadingActiveMatchDetails,
    showLiveMatchDock,
    setShowLiveMatchDock,
    refreshActiveMatchDetails,
  } = useLiveSportsMatchDetails({
    videoMode: videoState.mode,
    videoIsLive: videoState.isLive,
    videoTitle: videoState.title,
    videoSubtitle: videoState.subtitle,
    isExtracting,
  });
  const activeSportsMatchRef = useRef(activeSportsMatch);
  activeSportsMatchRef.current = activeSportsMatch;
  const activeMatchDetailsRef = useRef(activeMatchDetails);
  activeMatchDetailsRef.current = activeMatchDetails;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang =
      lang === 'zh' ? 'zh-CN' : lang === 'ca' ? 'ca' : lang === 'en' ? 'en' : 'es';
  }, [lang]);

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

  const canChangeMedia = isHostUser || selfRole === 'mod';
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
  const [portalOriginRect, setPortalOriginRect] =
    useState<PortalOriginRect | null>(null);
  const [portalLandingActive, setPortalLandingActive] = useState<boolean>(false);
  const portalTimersRef = useRef<number[]>([]);

  const clearPortalTimers = useCallback(() => {
    portalTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
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
      } else if (nextWorld === 'kids') {
        setCatalogSection('home');
        setMobileTab('home');
      } else if (nextWorld === 'sala') {
        setMobileTab('room');
        setUnreadChatCount(0);
      } else {
        setCatalogSection('home');
        setMobileTab('home');
        setIsInActiveGame(false);
      }

      if (typeof window !== 'undefined' && inRoomRef.current) {
        try {
          const currentPath = window.location.pathname.toLowerCase();
          if (nextWorld === 'kids') {
            if (currentPath !== '/kids') {
              window.history.replaceState({}, '', '/kids');
            }
          } else if (currentPath === '/kids' && roomId) {
            window.history.replaceState({}, '', `/${encodeURIComponent(roomId)}`);
          }
        } catch {
          // ignore
        }
      }

      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    },
    [setActiveWorld, roomId]
  );

  useEffect(() => {
    if (effectiveInitialRoom && initialRoute.isKidsMode) {
      applyWorldChange('kids');
      return;
    }
    if (!effectiveInitialRoom || !initialDeepLinkGame) return;
    applyWorldChange('juegos');
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('game')) {
          url.searchParams.delete('game');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preloadWorld = useCallback((world: PrimaryWorldId) => {
    if (world === 'futbol') {
      void import('./components/FootballMatchboard');
    } else if (world === 'juegos') {
      void import('./components/GamesHubSection');
    } else if (world === 'kids') {
      void import('./components/kids/RiffanKidsHub');
    } else if (world === 'cine' || world === 'tv') {
      void import('./components/ExpandedDiscoverySection');
    }
  }, []);

  const enterWorld = useCallback(
    (nextWorld: WorldId, opts?: { withPortal?: boolean; originRect?: PortalOriginRect }) => {
      setWorldSearchQuery('');
      setShowWatchlistOnly(false);
      clearPortalTimers();

      if (
        opts?.withPortal &&
        !reducedMotion &&
        (nextWorld === 'cine' ||
          nextWorld === 'futbol' ||
          nextWorld === 'tv' ||
          nextWorld === 'juegos' ||
          nextWorld === 'kids' ||
          nextWorld === 'sala')
      ) {
        if (nextWorld !== 'sala') preloadWorld(nextWorld);
        playWorldPortalSound(nextWorld);
        setPortalLandingActive(false);
        setPortalOriginRect(opts.originRect ?? null);
        setActivePortalTransition(nextWorld);
        const swapTimer = window.setTimeout(() => {
          applyWorldChange(nextWorld);
          setPortalLandingActive(true);
        }, 760);
        const exitTimer = window.setTimeout(() => {
          setActivePortalTransition(null);
          setPortalOriginRect(null);
        }, 980);
        const landingTimer = window.setTimeout(() => {
          setPortalLandingActive(false);
        }, 1280);
        portalTimersRef.current = [swapTimer, exitTimer, landingTimer];
        return;
      }

      setActivePortalTransition(null);
      setPortalOriginRect(null);
      setPortalLandingActive(false);
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
      setForcedOpenGame({ gameType: invite.gameType, seq: Date.now() });
      setIsInActiveGame(true);
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

  useEffect(() => {
    const activeNow = videoState.mode !== 'idle' || isExtracting;
    if (activeNow) {
      hadActivePlaybackRef.current = true;
    } else if (hadActivePlaybackRef.current) {
      hadActivePlaybackRef.current = false;
      setCinemaModePersist(false);
    }
  }, [videoState.mode, isExtracting, setCinemaModePersist]);

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
        fetch('/api/catalog/movies?category=trending&page=1').then((r) =>
          r.ok ? r.json() : null
        ),
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
        ...(Array.isArray(lrRes?.cinemaReleases)
          ? (lrRes.cinemaReleases as CatalogMovie[])
          : []),
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

  useEffect(() => {
    if (quickPool.movies.length > 0 && quickPool.series.length > 0) return;
    void loadQuickPool();
  }, [quickPool.movies.length, quickPool.series.length, loadQuickPool]);

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
      if (document.visibilityState === 'visible') runVersionCheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(runVersionCheck, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [setDeferredAppUpdateVersion]);

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
    if (res.errorCode) {
      useAppStore
        .getState()
        .setAuthNotice(
          pickLang(lang, {
            es: '¡Hola! Entra al instante con tu nombre o apodo para disfrutar de RiffanTV con amigos.',
            ca: '¡Hola! Entra a l’instant amb el teu nom o sobrenom per gaudir de RiffanTV amb amics.',
            en: 'Welcome! Enter with your name or nickname to enjoy RiffanTV with friends instantly.',
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

  const handleToggleCatalogFavorite = useCallback((item: CatalogMovie) => {
    const res = toggleWatchlistItem(item);
    setWatchlist(res.list);
    if (res.added) {
      upsertCloudCatalogFavorite(res.canonicalItem).catch(() => {});
    } else {
      deleteCloudCatalogFavoriteAndDuplicates(res.canonicalItem, res.removedKeys).catch(
        () => {}
      );
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

  const handleAddFriend = useCallback(
    (
      entry: {
        friendId: string;
        name: string;
        avatar: string;
        color: string;
        friendCode?: string;
      },
      opts?: { skipNotify?: boolean }
    ) => {
      triggerHaptic('success');
      const { list, friend } = upsertLocalFriend(entry);
      setSavedFriends(list);
      upsertCloudFriend(friend).catch(() => {});
      if (!opts?.skipNotify) {
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
      }
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
      setInviteSentFeedback(`✓ Invitación directa enviada a ${friend.name} en la app`);
      inviteFeedbackTimerRef.current = setTimeout(() => {
        setInviteSentFeedback(null);
      }, 3600);
    },
    [roomId, roomName, videoState.mode, videoState.title, profile]
  );

  const isOnMobileSocialTab = activeWorld === 'sala';
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

  const {
    isAutoMiniByScroll,
    setIsAutoMiniByScroll,
    miniDragOffset,
    miniCornerPositionClasses,
    handleCatalogOrWorkspaceScroll,
    handleMiniPointerDown,
    handleMiniPointerMove,
    handleMiniPointerUp,
  } = useMiniPlayerDrag({
    isDockedMini,
    isExtracting,
    isPlayerClosedLocally,
    videoMode: effectiveVideoState.mode,
    isMobileKeyboardOpen,
  });

  const roomGameActions = useRoomGameActions();

  const scrollDesktopToPlayer = useCallback(() => {
    setIsPlayerClosedLocally(false);
    setIsPlayerMinimized(false);
    setIsAutoMiniByScroll(false);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setIsAutoMiniByScroll]);

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
  }, [setIsAutoMiniByScroll]);

  const playback = usePlaybackOrchestrator({
    lang,
    profileName: profile.name,
    canChangeMedia,
    canControlRoom,
    hostId,
    participants,
    isNestedSandboxFrame,
    cloudState,
    videoState,
    setVideoState,
    videoStateRef,
    videoStateUrlRef,
    isCinemaModeRef,
    watchHistoryRef,
    setWatchHistory,
    isPlayerClosedLocallyRef,
    setIsPlayerClosedLocally,
    isPlayerMinimizedRef,
    setIsPlayerMinimized,
    setCinemaModePersist,
    isExtracting,
    setIsExtracting,
    isExtractingRef,
    activeSportsMatchRef,
    setActiveSportsMatch,
    activeMatchDetailsRef,
    setActiveMatchDetails,
    setShowLiveMatchDock,
    activeMovieContextRef,
    setActiveMovieContext,
    secondaryStream,
    setSecondaryStream,
    setCatalogSection,
    setMobileTab,
    showHostLockNotice,
    scrollDesktopToPlayer,
  });

  const {
    extractionLabel,
    extractionError,
    setExtractionError,
    loadingItemId,
    languageNotice,
    setLanguageNotice,
    livePlaybackSec,
    clearExtractionSnapshot,
    handleCancelMediaExtraction,
    recordStateInWatchHistory,
    handlePlayerProgressUpdate,
    handleClosePlayer,
    handleStopRoomPlaybackForEveryone,
    handleSyncPlayerAction,
    handlePlayMovie,
    handlePlaySeriesEpisode,
    handleReplayHistoryItem,
    handlePlayFromProfileCatalog,
    handleNextEpisode,
    handlePrevEpisode,
    handlePlaySportsMatch,
    handlePlayTdtChannel,
    handlePlayFavoriteChannel,
    handlePlayYouTubeVideo,
    handlePlayCatalaEpisode,
    handleSelectTrack,
    handlePlayCustomUrl,
    handlePlayQueueItem,
    handlePlaySecondaryChannel,
    handleSwapSecondaryStream,
    handleToggleSecondaryLayout,
    handleCloseSecondaryStream,
    handlePromoteCloudStreamToNative,
  } = playback;

  handlePlayQueueItemRef.current = handlePlayQueueItem;

  useRoomSocketEvents({
    inRoom,
    roomId,
    roomName,
    isTvMode,
    isTvPairLobby,
    tvAuthToken,
    isKidsRouteMode: Boolean(initialRoute.isKidsMode),
    lang,
    profile,
    mobileTabRef,
    hostIdRef,
    roomQueueRef,
    videoStateUrlRef,
    savedRoomsRef,
    sessionPinMapRef,
    isExtractingRef,
    activeHubGameRef,
    catalogSectionRef,
    handlePlayQueueItemRef,
    inviteFeedbackTimerRef,
    friendNoticeTimerRef,
    seenFriendNoticeBySenderRef,
    tvClaimTimerRef,
    recordStateInWatchHistory,
    rememberSessionPin,
    showHostLockNotice,
    setTypingUser,
    pushNotification,
    setOnlineUsers,
    setIncomingInvite,
    setFriendAddedNotice,
    setInviteSentFeedback,
    setRoomName,
    setHostId,
    setCreatorId,
    setHostOnlyControl,
    setRoomHasPin,
    setPinPromptState,
    setActivePoll,
    setRoomGameState,
    setPartyGameState,
    setPinturilloState,
    setPoolGameState,
    setChapasGameState,
    setHeadSoccerGameState,
    setHeadSoccerPeerInput,
    setHeadSoccerSyncSnapshot,
    setPokerGameState,
    setBlackjackGameState,
    setMatchResponses,
    setGameMoveError,
    setParticipants,
    setMessages,
    setPinnedMessage,
    setRoomQueue,
    setRecentRooms,
    setVideoState,
    setIsPlayerClosedLocally,
    setCloudFrame,
    setCloudState,
    setUnreadChatCount,
    setFloatingReactions,
    setTvClaimStatus,
    setIncomingGameInvite,
    setForcedOpenGame,
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
    setParticipants,
    setVideoState,
    setPinPromptState,
    setTvClaimStatus,
    tvClaimTimerRef,
  });

  const handleEnterRoom = (
    targetRoomId: string,
    nextProfile: StoredProfile,
    customName?: string
  ) => {
    manualLobbyStayRef.current = false;
    const isCustom = nextProfile.isCustomized !== false;
    const finalProfile: StoredProfile = { ...nextProfile, isCustomized: isCustom };
    import('./utils/storage').then(({ saveStoredProfile }) =>
      saveStoredProfile(finalProfile, isCustom)
    );
    setProfile(finalProfile);
    updateCloudUserProfile(finalProfile).catch(() => {});
    setShowGuestPopup(false);
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setSecondaryStream(null);
    const deepLinkGame =
      typeof window !== 'undefined'
        ? normalizeDeepLinkGameType(parseRoomFromWindow().gameType)
        : null;
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/') {
        window.history.pushState(
          { naimInRoom: true },
          '',
          `/${encodeURIComponent(targetRoomId)}`
        );
      } else if (deepLinkGame) {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('game')) {
            url.searchParams.delete('game');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
          }
        } catch {
          // ignore
        }
      }
    }
    if (deepLinkGame) {
      setCatalogSection('games');
      setMobileTab('games');
      setActiveWorld('juegos');
      setForcedOpenGame({ gameType: deepLinkGame, seq: Date.now() });
      setIsInActiveGame(true);
    } else {
      setCatalogSection('home');
      setMobileTab('home');
      setActiveWorld('entry');
      setIsInActiveGame(false);
    }
    setWorldSearchQuery('');
    setAvatarMenuOpen(false);
    setRoomId(targetRoomId);
    setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    setInRoom(true);
    setIntroWithSound(true);
    setShowIntro(true);
  };

  const resetRoomUiState = useCallback(() => {
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
  }, [setCinemaModePersist]);

  const handleSwitchActiveRoom = (targetRoomId: string, customName?: string) => {
    manualLobbyStayRef.current = false;
    clearExtractionSnapshot();
    resetRoomUiState();
    setCatalogSection('home');
    setMobileTab('home');
    setActiveWorld('entry');
    setIsInActiveGame(false);
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
    clearExtractionSnapshot();
    manualLobbyStayRef.current = true;
    socketService.disconnect();
    setInRoom(false);
    setActiveWorld('entry');
    setIsInActiveGame(false);
    setWorldSearchQuery('');
    setAvatarMenuOpen(false);
    setIsFloatingRoomOpen(false);
    setShowGuestPopup(false);
    resetRoomUiState();
    setRoomId('');
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
        setShowGuestPopup(false);
        resetRoomUiState();
        setRoomId('');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [resetRoomUiState]);

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

  const normalizedRoomCode = roomId.trim().toLowerCase();
  const currentSavedRoom = savedRooms.find(
    (r) => r.roomCode.toLowerCase() === normalizedRoomCode
  );
  const isCurrentRoomPermanent = Boolean(currentSavedRoom);
  const currentHostPin =
    sessionPinMap[normalizedRoomCode] ||
    (currentSavedRoom?.hasPin ? currentSavedRoom.pinCode : undefined);

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

  const handleRemoteTogglePlay = () => {
    if (videoState.mode === 'idle') return;
    const nextPlaying = !videoState.isPlaying;
    handleSyncPlayerAction(nextPlaying ? 'play' : 'pause', { isPlaying: nextPlaying });
  };

  const handleRemoteSeekDelta = (deltaSec: number) => {
    if (videoState.mode === 'idle' || videoState.isLive) return;
    const targetSec = Math.max(0, (videoState.currentTime || 0) + deltaSec);
    handleSyncPlayerAction('seek', { currentTime: targetSec });
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

  const handleAcceptIncomingRoomInvite = (invite: IncomingRoomInvite) => {
    triggerHaptic('success');
    playCinemaSound('join');
    setIncomingInvite(null);
    setFriendsModalOpen(false);
    manualLobbyStayRef.current = false;
    resetRoomUiState();
    setTvAuthToken(invite.inviteAuthToken || '');
    setCatalogSection('home');
    setMobileTab('home');
    setActiveWorld('entry');
    setIsInActiveGame(false);
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
    import('./utils/storage').then(({ saveStoredProfile }) =>
      saveStoredProfile(updated, true)
    );
    setProfile(updated);
    setShowGuestPopup(false);
    socketService.updateProfile(profile.id, updated.name, updated.avatar, updated.color);
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

  if (isTvPairLobby) {
    return (
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
        <React.Suspense fallback={null}>
          <TvReceiverPairingScreen
            lang={lang}
            onPaired={({
              roomId: pairedCode,
              roomName: pairedTitle,
              tvAuthToken: token,
            }) => {
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
            handleAddFriend(
              {
                friendId: notice.fromUserId,
                name: notice.fromUserName,
                avatar: notice.fromUserAvatar,
                color: notice.fromUserColor,
                friendCode: notice.fromFriendCode,
              },
              { skipNotify: true }
            );
            setFriendAddedNotice(null);
          }}
          onDismissFriendNotice={() => {
            if (friendNoticeTimerRef.current) clearTimeout(friendNoticeTimerRef.current);
            setFriendAddedNotice(null);
          }}
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
              window.history.pushState({}, '', '/ads');
            }
          }}
        />
      </MotionConfig>
    );
  }

  if (isTvMode) {
    return (
      <div className="w-full h-[100dvh] bg-[#0B0B0F] overflow-hidden">
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
            onCancelExtraction={handleCancelMediaExtraction}
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
    isPlayingMediaReady &&
    !isDockedMini &&
    !isAutoImmersiveLandscape &&
    activeWorld !== 'sala' &&
    activeWorld !== 'juegos' &&
    activeWorld !== 'kids';

  const isMoviePlaybackDockVisible =
    !isFloatingRoomOpen &&
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
    !isFloatingRoomOpen &&
    videoState.mode !== 'idle' &&
    !isPlayerClosedLocally &&
    !isPlayerMinimized &&
    !isAutoImmersiveLandscape &&
    !activeSportsMatch &&
    videoState.mode !== 'youtube' &&
    (Boolean(videoState.isLive) ||
      Boolean(
        videoState.tracks?.some(
          (tr) => tr.resolverType === 'tdt_hls' || tr.resolverType === 'sports_channel'
        )
      ));

  const lockMainWorkspaceScroll =
    activeWorld === 'sala' ||
    activeWorld === 'kids' ||
    (activeWorld === 'juegos' && isInActiveGame);

  const renderPartySidebar = () => (
    <React.Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-6 text-zinc-400">
          <RiffanLoaderR size={40} />
        </div>
      }
    >
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
        onBrowseCatalog={() => {
          setIsFloatingRoomOpen(false);
          enterWorld('cine');
        }}
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
  );

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <div
        style={
          !isDesktopLayout && visualViewportHeight
            ? { height: `${visualViewportHeight}px` }
            : undefined
        }
        className="h-[100dvh] w-full max-w-[100vw] bg-[#0B0B0E] text-[#EFEFF1] overflow-hidden"
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

          {showCinemaOverlay && (
            <div
              aria-hidden="true"
              className="fixed inset-0 bg-black/80 z-40 pointer-events-none transition-opacity duration-300"
            />
          )}

          {activeWorld === 'entry' && !isMobileChatWithKeyboard && !isAutoImmersiveLandscape && (
            <header className="shrink-0 z-30 h-14 px-4 bg-[#07080C]/92 backdrop-blur-2xl border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.45)] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                aria-label="RiffanTV"
                className="flex items-center min-h-11 py-1 cursor-pointer active:scale-95 transition-transform group"
              >
                <NaimBrandLogo variant="full" size={32} />
              </button>

              <div className="flex items-center gap-2">
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
              </div>
            </header>
          )}

          {/* Main Progressive World Workspace */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <div
              ref={mainScrollRef}
              onScroll={handleCatalogOrWorkspaceScroll}
              className={
                lockMainWorkspaceScroll
                  ? 'flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden'
                  : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-clip touch-pan-y smooth-scroll-area'
              }
            >
              {/* SINGLE NATIVE CINEMA PLAYER INSTANCE */}
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
                      onCancelExtraction={handleCancelMediaExtraction}
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
                      unreadChatCount={unreadChatCount}
                      onToggleFloatingChat={() => {
                        const next = !isFloatingRoomOpen;
                        setIsFloatingRoomOpen(next);
                        if (next) setUnreadChatCount(0);
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

              {lockNoticeToast && (
                <div className="fixed top-17 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-[#18181B]/95 backdrop-blur-md border border-white/15 text-zinc-100 text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-fade-in">
                  <Lock className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                  <span>{lockNoticeToast}</span>
                </div>
              )}

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

              {/* Cinema Playback Docks & Error Notices */}
              <CinemaPlaybackDocks
                videoState={effectiveVideoState}
                lang={lang}
                isPlayerClosedLocally={isPlayerClosedLocally}
                isPlayerMinimized={isPlayerMinimized}
                isAutoImmersiveLandscape={isAutoImmersiveLandscape}
                isPlayerActive={isPlayerActive}
                extractionError={extractionError}
                activeSportsMatch={activeSportsMatch}
                showLiveMatchDock={showLiveMatchDock}
                activeMatchDetails={activeMatchDetails}
                loadingActiveMatchDetails={loadingActiveMatchDetails}
                loadingItemId={loadingItemId}
                activeMovieContext={activeMovieContext}
                isMoviePlaybackDockVisible={isMoviePlaybackDockVisible}
                isChannelGuideDockVisible={isChannelGuideDockVisible}
                tdtChannels={quickPool.tdt}
                onSelectTrack={(idx, seekSec) => {
                  void handleSelectTrack(idx, seekSec || 0);
                }}
                onRefreshMatchDetails={refreshActiveMatchDetails}
                onCloseMatchDock={() => setShowLiveMatchDock(false)}
                onShowMatchDock={() => setShowLiveMatchDock(true)}
                onSelectEpisode={(series, episode, pLang) => {
                  void handlePlaySeriesEpisode(series, episode, pLang || 'ES');
                }}
                onSelectMovie={(movieItem, pLang) => {
                  void handlePlayMovie(movieItem, (pLang || 'ES') as any);
                }}
                onSelectChannel={(ch, progHint) => {
                  void handlePlayTdtChannel(ch, 0, progHint);
                }}
                onReopenPlayer={() => {
                  setIsPlayerClosedLocally(false);
                  setIsPlayerMinimized(false);
                }}
                onStopRoomPlayback={handleStopRoomPlaybackForEveryone}
                onClearExtractionError={() => setExtractionError(null)}
              />

              {/* WORLD ROUTER */}
              {hideBrowseBelowPlayer ? null : activeWorld === 'entry' ? (
                <div ref={catalogScrollRef} className="w-full min-w-0 shrink-0">
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
                    onSelectWorld={(world, originRect) =>
                      enterWorld(world, {
                        withPortal:
                          world === 'cine' ||
                          world === 'futbol' ||
                          world === 'tv' ||
                          world === 'juegos' ||
                          world === 'kids' ||
                          world === 'sala',
                        originRect,
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
                    onPlaySeries={async (seriesItem, targetSeason, targetEpisode) => {
                      if (seriesItem.tmdbId) {
                        try {
                          const seasonNum = targetSeason || seriesItem.seasonNumber || 1;
                          const res = await fetch(
                            `/api/catalog/tv/${seriesItem.tmdbId}?season=${seasonNum}&lang=${lang}`
                          );
                          const data = await res.json();
                          const episodes = (data?.details?.episodes || []) as TvEpisodeItem[];
                          if (episodes.length > 0) {
                            const episodeNum = targetEpisode || seriesItem.episodeNumber || 1;
                            const targetEp =
                              episodes.find((ep) => ep.episodeNumber === episodeNum) ||
                              episodes[episodeNum - 1] ||
                              episodes[0];
                            await handlePlaySeriesEpisode(
                              data.details as TvSeriesDetails,
                              targetEp,
                              cineCastellano ? 'ES' : 'VOSE'
                            );
                            return;
                          }
                        } catch {
                          // fallback
                        }
                      }
                      enterWorld('cine');
                    }}
                    onOpenDesignSystem={() => setShowDesignSystem(true)}
                    onChangeLang={setLang}
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
                      setForcedOpenGame({ gameType: mappedGame, seq: Date.now() });
                      setIsInActiveGame(true);
                      enterWorld('juegos', { withPortal: true });
                    }}
                    onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
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
                  onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                  fullHeight
                  className={portalLandingActive ? 'rtv-world-touchdown' : ''}
                >
                  {renderPartySidebar()}
                </WorldShell>
              ) : activeWorld === 'juegos' ? (
                <WorldShell
                  world="juegos"
                  title={pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
                  lang={lang}
                  onBack={() => {
                    if (isInActiveGame) {
                      setIsInActiveGame(false);
                      setForcedOpenGame(null);
                    }
                    enterWorld('entry');
                  }}
                  onGoHome={() => enterWorld('entry')}
                  onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                  fullHeight={isInActiveGame}
                  className={portalLandingActive ? 'rtv-world-touchdown' : ''}
                >
                  <div
                    className={
                      isInActiveGame
                        ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
                        : 'w-full flex flex-col'
                    }
                  >
                    <GamesHubSection
                      lang={lang}
                      roomId={roomId}
                      currentUser={currentUser}
                      participants={participants}
                      roomBoardGame={roomGameState}
                      roomPartyGame={partyGameState}
                      roomPinturilloGame={pinturilloState}
                      roomPoolGame={poolGameState}
                      roomChapasGame={chapasGameState}
                      roomHeadSoccerGame={headSoccerGameState}
                      headSoccerSyncSnapshot={headSoccerSyncSnapshot}
                      headSoccerPeerInput={headSoccerPeerInput}
                      roomPokerGame={pokerGameState}
                      roomBlackjackGame={blackjackGameState}
                      matchResponses={matchResponses}
                      gameMoveError={gameMoveError}
                      isHost={isHostUser}
                      voiceChat={voiceChat}
                      requestedGameOpen={forcedOpenGame}
                      onSelectedGameChange={(game) => {
                        activeHubGameRef.current = game;
                        setIsInActiveGame(game !== null);
                      }}
                      {...roomGameActions}
                    />
                  </div>
                </WorldShell>
              ) : activeWorld === 'kids' ? (
                <div className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden bg-[#0A0E23] flex flex-col">
                  <RiffanKidsHub
                    shellLang={lang}
                    exitPromptSeq={kidsExitPromptSeq}
                    onOpenSmartTv={() => setSmartTvModalOpen(true)}
                    onExitKids={() => enterWorld('entry')}
                  />
                </div>
              ) : (
                <WorldShell
                  world={activeWorld}
                  className={portalLandingActive ? 'rtv-world-touchdown' : ''}
                  title={
                    activeWorld === 'cine'
                      ? pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Cinema' })
                      : activeWorld === 'futbol'
                      ? pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })
                      : activeWorld === 'tv'
                      ? pickLang(lang, {
                          es: 'TV en Directo',
                          ca: 'TV en Directe',
                          en: 'Live TV',
                        })
                      : 'YouTube'
                  }
                  lang={lang}
                  onBack={() => enterWorld('entry')}
                  onGoHome={() => enterWorld('entry')}
                  onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
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

          <FloatingRoomBubble
            lang={lang}
            visible={inRoom && activeWorld !== 'sala' && activeWorld !== 'kids' && !isTvMode}
            participantsCount={participants.length}
            voiceActive={voiceChat.isJoined}
            unreadCount={unreadChatCount}
            isSheetOpen={isFloatingRoomOpen}
            dockedBelowPlayer={isPlayerActive && !isDockedMini && !isPlayerClosedLocally}
            onOpenSheet={() => {
              setIsFloatingRoomOpen(true);
              setUnreadChatCount(0);
            }}
            onCloseSheet={() => setIsFloatingRoomOpen(false)}
            onOpenFullSala={() => enterWorld('sala')}
          >
            {renderPartySidebar()}
          </FloatingRoomBubble>

          <AppGlobalModalsLayer
            lang={lang}
            onChangeLang={setLang}
            inRoom={inRoom}
            roomId={roomId}
            roomName={roomName}
            profile={profile}
            currentUser={currentUser}
            participants={participants}
            authUser={authUser}
            authLoading={authLoading}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleGoogleSignOut}
            effectiveView={effectiveView}
            onToggleViewMode={toggleViewMode}
            videoState={videoState}
            activeSportsMatch={activeSportsMatch}
            activeMovieContext={activeMovieContext}
            watchHistory={watchHistory}
            watchlist={watchlist}
            favoriteChannels={favoriteChannels}
            recentRooms={recentRooms}
            savedRooms={savedRooms}
            isCurrentRoomPermanent={isCurrentRoomPermanent}
            savedFriends={savedFriends}
            onlineUsers={onlineUsers}
            incomingInvite={incomingInvite}
            friendAddedNotice={friendAddedNotice}
            inviteSentFeedback={inviteSentFeedback}
            friendsModalOpen={friendsModalOpen}
            setFriendsModalOpen={setFriendsModalOpen}
            showIntro={showIntro}
            introWithSound={introWithSound}
            setShowIntro={setShowIntro}
            pinPromptState={pinPromptState}
            smartTvModalOpen={smartTvModalOpen}
            setSmartTvModalOpen={setSmartTvModalOpen}
            hasConnectedSmartTv={hasConnectedSmartTv}
            tvClaimStatus={tvClaimStatus}
            profileHubOpen={profileHubOpen}
            setProfileHubOpen={setProfileHubOpen}
            profileHubTab={profileHubTab}
            setProfileHubTab={setProfileHubTab}
            avatarMenuOpen={avatarMenuOpen}
            setAvatarMenuOpen={setAvatarMenuOpen}
            settingsSheetOpen={settingsSheetOpen}
            setSettingsSheetOpen={setSettingsSheetOpen}
            unreadNotificationsCount={unreadNotificationsCount}
            showGuestPopup={showGuestPopup}
            showNotificationCenter={showNotificationCenter}
            setShowNotificationCenter={setShowNotificationCenter}
            showCommandSearch={showCommandSearch}
            setShowCommandSearch={setShowCommandSearch}
            showSurpriseModal={showSurpriseModal}
            setShowSurpriseModal={setShowSurpriseModal}
            aiSearchLaunch={aiSearchLaunch}
            setAiSearchLaunch={setAiSearchLaunch}
            showVoiceAssistant={showVoiceAssistant}
            setShowVoiceAssistant={setShowVoiceAssistant}
            showLegalModal={showLegalModal}
            setShowLegalModal={setShowLegalModal}
            setShowDesignSystem={setShowDesignSystem}
            quickPool={quickPool}
            quickPoolLoading={quickPoolLoading}
            loadQuickPool={loadQuickPool}
            cineCastellano={cineCastellano}
            swUpdate={Boolean(swUpdate)}
            applySwUpdateNow={applySwUpdateNow}
            deferredAppUpdateVersion={deferredAppUpdateVersion}
            nativeApkUpdate={nativeApkUpdate}
            setNativeApkUpdate={setNativeApkUpdate}
            activePortalTransition={activePortalTransition}
            portalOriginRect={portalOriginRect}
            incomingGameInvite={incomingGameInvite}
            onAcceptGameInvite={handleAcceptGameInvite}
            onDismissGameInvite={() => {
              if (incomingGameInvite) {
                socketService.respondToGameInvite(
                  incomingGameInvite.gameType,
                  'declined',
                  incomingGameInvite.id
                );
              }
              setIncomingGameInvite(null);
            }}
            onAcceptIncomingInvite={handleAcceptIncomingRoomInvite}
            onDismissIncomingInvite={() => setIncomingInvite(null)}
            onAddFriend={handleAddFriend}
            onRemoveFriend={handleRemoveFriend}
            onDismissFriendNotice={() => {
              if (friendNoticeTimerRef.current) clearTimeout(friendNoticeTimerRef.current);
              setFriendAddedNotice(null);
            }}
            onSendDirectRoomInvite={handleSendDirectRoomInvite}
            onSubmitGuestPin={handleSubmitGuestPin}
            onLeaveRoom={handleLeaveRoom}
            onClaimTvCode={handleClaimTvCode}
            onRemoteTogglePlay={handleRemoteTogglePlay}
            onRemoteSeekDelta={handleRemoteSeekDelta}
            onSendTvRemoteCommand={handleSendTvRemoteCommand}
            onSwitchThisDeviceToTvLobby={handleSwitchThisDeviceToTvLobby}
            onUpdateProfile={handleUpdateProfile}
            onDismissGuestPopup={handleDismissGuestPopup}
            onReplayHistoryItem={handleReplayHistoryItem}
            onRemoveHistoryItem={handleRemoveHistoryItem}
            onClearHistory={handleClearAllHistory}
            onPlayFromProfileCatalog={handlePlayFromProfileCatalog}
            onToggleCatalogFavorite={handleToggleCatalogFavorite}
            onPlayFavoriteChannel={handlePlayFavoriteChannel}
            onToggleChannelFavorite={handleToggleChannelFavorite}
            onCreateNewRoom={handleCreateFreshRoom}
            onSwitchRoom={handleSwitchActiveRoom}
            onTogglePermanentRoom={handleTogglePermanentRoom}
            onDeleteSavedRoom={handleDeleteSavedRoom}
            onPlayMovie={handlePlayMovie}
            onPlaySeriesEpisode={handlePlaySeriesEpisode}
            onPlayChannel={(ch) => {
              void handlePlayTdtChannel(ch, 0);
            }}
            onPlayMatch={(m) => {
              void handlePlaySportsMatch(m, 0);
            }}
            onSyncPlayerAction={handleSyncPlayerAction}
            onNextEpisode={handleNextEpisode}
            setCatalogSection={setCatalogSection}
            enterWorld={enterWorld}
          />
        </div>
      </div>
    </MotionConfig>
  );
}

export default App;
