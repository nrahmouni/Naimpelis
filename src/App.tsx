import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  LayoutGrid,
  Film,
  MessageSquare,
  Radio,
  Check,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Square,
  Lock,
  Tv,
  ListVideo,
  UserPlus,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  ChatMessage,
  CloudBrowserState,
  CloudSavedRoom,
  FavoriteChannelItem,
  FloatingReaction,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  LanguageNoticePopup,
  OnlineAppUser,
  Participant,
  PlaybackEngineMode,
  PollProposalItem,
  RestoredRoomBlueprint,
  RoomPollState,
  RoomQueueItem,
  SavedFriend,
  SecondaryStreamState,
  SpanishTdtChannel,
  SportsMatch,
  StreamTrack,
  TvEpisodeItem,
  TvRemoteCommandType,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from './types';
import { UI_COPY } from './utils/i18n';
import {
  addRecentRoom,
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  clearWatchHistory,
  deduplicateWatchlist,
  deriveFriendCode,
  dismissGuestPopupForRoom,
  getCatalogFavoriteKey,
  getFavoriteChannels,
  getRecentRooms,
  getSavedFriends,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  isSameCatalogItem,
  mergeCatalogItemMetadata,
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
  ensureCloudUserProfile,
  migrateLocalStateToCloud,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  subscribeAuthState,
  subscribeUserCloudCollections,
  updateCloudUserProfile,
  updateCloudWatchProgressOnly,
  upsertCloudCatalogFavorite,
  upsertCloudChannelFavorite,
  upsertCloudFriend,
  upsertCloudSavedRoom,
  upsertCloudWatchHistory,
} from './services/userCloudSync';
import { socketService } from './services/socket';
import { playCinemaSound, triggerHaptic } from './utils/haptics';
import {
  buildShortInviteUrl,
  generateShortRoomCode,
  parseRoomFromWindow,
} from './utils/shortLink';
import { NaimBrandLogo } from './components/NaimBrandLogo';
import { CloudAccountButton } from './components/CloudAccountButton';
import {
  useViewLayoutMode,
  ViewModeSwitchButton,
} from './components/MobileViewportGuard';
import {
  ProfileHubTab,
  UserProfileHubModal,
} from './components/UserProfileHubModal';
import { OfflineIndicator } from './components/PWAInstallPrompt';
import { NaimcineIntro } from './components/NaimcineIntro';
import { LobbyScreen } from './components/LobbyScreen';
import { GuestWelcomePopup } from './components/GuestWelcomePopup';
import { NativeCinemaPlayer } from './components/NativeCinemaPlayer';
import { CatalogSection, MediaCatalogHub } from './components/MediaCatalogHub';
import { PartySidebar } from './components/PartySidebar';
import { TvReceiverPairingScreen } from './components/TvReceiverPairingScreen';
import { RoomPinPromptModal } from './components/RoomPinPromptModal';
import { SmartTvQuickModal } from './components/SmartTvQuickModal';
import {
  FriendsInviteModal,
  GlobalIncomingInviteBanner,
} from './components/FriendsInviteModal';

const INITIAL_VIDEO_STATE: VideoState = {
  mode: 'idle',
  url: '',
  rawSourceUrl: '',
  title: 'NAIM CINE · Elige película, serie, partido o YouTube',
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

type MobileNavTab = 'home' | 'movies' | 'tdt' | 'sports' | 'youtube' | 'chat' | 'room';

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

  const [roomId, setRoomId] = useState<string>(initialUrlRoom);
  const [roomName, setRoomName] = useState<string>(
    initialUrlRoom ? `Sala ${initialUrlRoom.toUpperCase()}` : ''
  );
  const [inRoom, setInRoom] = useState<boolean>(Boolean(initialUrlRoom));

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
  const [hostOnlyControl, setHostOnlyControl] = useState<boolean>(false);
  const [activePoll, setActivePoll] = useState<RoomPollState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [copiedHeaderInvite, setCopiedHeaderInvite] = useState<boolean>(false);

  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionLabel, setExtractionLabel] = useState<string>('');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [languageNotice, setLanguageNotice] = useState<LanguageNoticePopup | null>(null);
  const [floatingChatOpen, setFloatingChatOpen] = useState<boolean>(false);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState<boolean>(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.innerWidth > window.innerHeight && window.innerHeight < 520
      : false
  );
  const [livePlaybackSec, setLivePlaybackSec] = useState<number>(0);
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
  const handlePlayQueueItemRef = useRef<(item: RoomQueueItem) => void>(() => {});
  const lockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualLobbyStayRef = useRef<boolean>(false);
  const hadActivePlaybackRef = useRef<boolean>(false);

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

  const currentUser: Participant = {
    id: profile.id,
    name: isTvMode ? `${profile.name} (TV)` : profile.name,
    avatar: isTvMode ? '📺' : profile.avatar || '🎬',
    color: profile.color || '#E11D48',
    isHost: hostId === profile.id,
    joinedAt: Date.now(),
  };

  const canControlRoom = !hostOnlyControl || currentUser.isHost;

  const showHostLockNotice = useCallback(
    (hostDisplayName?: string) => {
      if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current);
      const msg =
        lang === 'es'
          ? `Modo Cineasta activo · Solo ${hostDisplayName || 'el anfitrión'} controla el reproductor`
          : `Director Mode active · Only ${hostDisplayName || 'the host'} controls playback`;
      setLockNoticeToast(msg);
      lockToastTimerRef.current = setTimeout(() => {
        setLockNoticeToast(null);
      }, 3200);
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

  // ============================================================================
  // FIREBASE AUTHENTICATION, CLOUD SYNC & DIRECT ROOM AUTO-ENTRY FOR LOGGED USERS
  // ============================================================================
  useEffect(() => {
    let detachCloudListeners: (() => void) | null = null;
    let migrationTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const unsubAuth = subscribeAuthState(async (user) => {
      if (detachCloudListeners) {
        detachCloudListeners();
        detachCloudListeners = null;
      }
      if (migrationTimer) {
        clearTimeout(migrationTimer);
        migrationTimer = null;
      }

      if (!active) return;
      setAuthUser(user);

      if (!user || !user.emailVerified) {
        setAuthLoading(false);
        setSavedRooms([]);
        try {
          localStorage.removeItem(SAVED_ROOMS_CACHE_KEY);
        } catch {
          // ignore
        }
        return;
      }

      const localHistorySnapshot = getWatchHistory();
      const localWatchlistSnapshot = getWatchlist();
      const localChannelsSnapshot = getFavoriteChannels();
      const localFriendsSnapshot = getSavedFriends();

      let resolvedProfile = getStoredProfile();
      try {
        const cloudProfile = await ensureCloudUserProfile(user, resolvedProfile);
        if (!active) return;
        resolvedProfile = cloudProfile;
        saveStoredProfile(cloudProfile, true);
        setProfile(cloudProfile);
        setShowGuestPopup(false);
      } catch {
        // Error already logged by handleFirestoreError
      } finally {
        if (active) setAuthLoading(false);
      }

      if (!active) return;

      // When logged in (and not in /tv receiver pairing lobby), skip initial landing page and enter permanent or last room directly!
      if (
        !inRoomRef.current &&
        !manualLobbyStayRef.current &&
        !isTvPairLobbyRef.current
      ) {
        const cachedCloudRooms = loadCachedSavedRooms();
        const recentLocalRooms = getRecentRooms();
        const primaryCloudRoom = cachedCloudRooms[0];
        const lastLocalRoom = recentLocalRooms[0];
        const targetCode =
          primaryCloudRoom?.roomCode ||
          lastLocalRoom?.id ||
          generateShortRoomCode(4);
        const firstName =
          resolvedProfile.name?.split(' ')[0] ||
          user.displayName?.split(' ')[0] ||
          'Cine';
        const targetRoomTitle =
          primaryCloudRoom?.roomName ||
          lastLocalRoom?.name ||
          `Sala de ${firstName}`;
        setShowIntro(false);
        setCatalogSection('home');
        setMobileTab('home');
        setRoomId(targetCode);
        setRoomName(targetRoomTitle);
        setInRoom(true);
      }

      detachCloudListeners = subscribeUserCloudCollections(user.uid, {
        onWatchHistory: (cloudItems) => {
          const cleanItems = cloudItems.filter((item) => {
            const isArcade =
              String(item.movidyUrl || '').startsWith('arcade://') ||
              String(item.bingetrixUrl || '').startsWith('arcade://') ||
              String(item.id || '').startsWith('arcade');
            if (isArcade) {
              deleteCloudWatchHistoryItem(item.id).catch(() => {});
              return false;
            }
            return true;
          });
          setWatchHistory(cleanItems);
          saveWatchHistory(cleanItems);
        },
        onFavorites: (cloudWatchlist, cloudChannels) => {
          setWatchlist((prev) => {
            const merged = cloudWatchlist.map((cw) => {
              const localMatch = prev.find((p) => isSameCatalogItem(p, cw));
              return localMatch ? mergeCatalogItemMetadata(localMatch, cw) : cw;
            });
            return saveWatchlist(deduplicateWatchlist(merged));
          });
          setFavoriteChannels(cloudChannels);
          saveFavoriteChannels(cloudChannels);
        },
        onSavedRooms: (cloudRooms) => {
          setSavedRooms(cloudRooms);
          try {
            localStorage.setItem(
              SAVED_ROOMS_CACHE_KEY,
              JSON.stringify(cloudRooms)
            );
          } catch {
            // ignore
          }
          // Hydrate session PIN map for any permanent PIN-protected rooms owned by user
          cloudRooms.forEach((cr) => {
            if (cr.hasPin && cr.pinCode) {
              rememberSessionPin(cr.roomCode, cr.pinCode);
            }
          });
        },
        onFriends: (cloudFriends) => {
          setSavedFriends(cloudFriends);
          saveFriendsList(cloudFriends);
        },
      });

      migrationTimer = setTimeout(() => {
        migrateLocalStateToCloud({
          localHistory: localHistorySnapshot,
          localWatchlist: localWatchlistSnapshot,
          localChannels: localChannelsSnapshot,
          localFriends: localFriendsSnapshot,
        }).catch(() => {});
      }, 900);
    });

    return () => {
      active = false;
      unsubAuth();
      if (detachCloudListeners) detachCloudListeners();
      if (migrationTimer) clearTimeout(migrationTimer);
    };
  }, [rememberSessionPin]);

  const handleGoogleSignIn = async () => {
    manualLobbyStayRef.current = false;
    await signInWithGoogleAccount();
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
    []
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
          color: profile.color || '#E11D48',
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
          color: profile.color || '#E11D48',
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
      color: profile.color || '#E11D48',
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
          setIncomingInvite(payload as IncomingRoomInvite);
        }
      } else if (type === 'INCOMING_FRIEND_ADDED') {
        if (payload?.fromUserId && payload?.fromUserId !== profile.id) {
          playCinemaSound('reaction');
          setFriendAddedNotice(payload as IncomingFriendAddedNotice);
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
  }, [profile.id]);

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
      color: profile.color || '#E11D48',
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
        setHostOnlyControl(Boolean(payload.hostOnlyControl));
        setRoomHasPin(Boolean(payload.hasPin));
        setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
        setActivePoll(payload.activePoll || null);
        setParticipants(payload.participants || []);
        setMessages(payload.messages || []);
        setRoomQueue(payload.queue || []);
        addRecentRoom({ id: roomId, name: nextRoomTitle });
        setRecentRooms(getRecentRooms());
        if (payload.videoState) {
          setVideoState((prev) => {
            if (
              prev.url &&
              prev.url === payload.videoState.url &&
              prev.mode === payload.videoState.mode &&
              (payload.videoState.lastUpdated || 0) <= (prev.lastUpdated || 0)
            ) {
              return prev;
            }
            return payload.videoState;
          });
          recordStateInWatchHistory(payload.videoState);
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
        if (payload?.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
        }
      } else if (type === 'ROOM_RENAMED') {
        if (payload?.roomName) {
          setRoomName(payload.roomName);
          addRecentRoom({ id: roomId, name: payload.roomName });
          setRecentRooms(getRecentRooms());
        }
        if (payload?.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
        }
      } else if (type === 'TV_CLAIM_RESULT') {
        if (tvClaimTimerRef.current) clearTimeout(tvClaimTimerRef.current);
        if (payload?.success) {
          playCinemaSound('join');
          setTvClaimStatus({
            type: 'success',
            message:
              lang === 'es'
                ? '✓ Smart TV vinculada y proyectando en esta sala'
                : '✓ Smart TV paired and projecting in this room',
          });
        } else {
          setTvClaimStatus({
            type: 'error',
            message:
              payload?.error ||
              (lang === 'es'
                ? 'Código de TV no encontrado o caducado.'
                : 'TV code not found or expired.'),
          });
        }
        tvClaimTimerRef.current = setTimeout(() => {
          setTvClaimStatus(null);
        }, 5000);
      } else if (type === 'PARTICIPANTS_UPDATED') {
        setParticipants(payload.participants || []);
        if (payload.hostId) setHostId(payload.hostId);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
          playCinemaSound('join');
        }
      } else if (type === 'VIDEO_STATE_UPDATED') {
        if (payload.videoState) {
          const prevUrl = videoStateUrlRef.current;
          videoStateUrlRef.current = payload.videoState.url;
          setVideoState((prev) => {
            if (
              payload.videoState.url &&
              payload.videoState.url !== prev.url &&
              payload.videoState.mode !== 'idle'
            ) {
              setIsPlayerClosedLocally(false);
            }
            return payload.videoState;
          });
          if (payload.videoState.url && payload.videoState.url !== prevUrl) {
            recordStateInWatchHistory(payload.videoState);
          }
          if (payload.videoState.mode !== 'cloud') {
            setCloudFrame(null);
            setCloudState(null);
          }
        }
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
        }
      } else if (type === 'QUEUE_UPDATED') {
        setRoomQueue(payload.queue || []);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
        }
      } else if (type === 'NEW_CHAT_MESSAGE') {
        setMessages((prev) => [...prev.slice(-149), payload]);
        if (mobileTabRef.current !== 'chat' && payload.senderId !== profile.id) {
          setUnreadChatCount((c) => c + 1);
        }
      } else if (type === 'FLOATING_REACTION') {
        const reaction = payload as FloatingReaction;
        setFloatingReactions((prev) => [...prev.slice(-18), reaction]);
        playCinemaSound('reaction');
        setTimeout(() => {
          setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
        }, 2800);
      } else if (type === 'HOST_TRANSFERRED') {
        setHostId(payload.hostId);
        setParticipants(payload.participants || []);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
        }
      } else if (type === 'HOST_LOCK_UPDATED') {
        setHostOnlyControl(Boolean(payload.hostOnlyControl));
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
        }
      } else if (type === 'HOST_LOCK_REJECTED') {
        if (payload?.videoState) {
          setVideoState(payload.videoState);
        }
        showHostLockNotice(payload?.hostName);
      } else if (type === 'POLL_UPDATED') {
        setActivePoll(payload.poll || null);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
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
        setCloudFrame(payload.image);
        setCloudState({
          active: true,
          url: payload.url,
          title: payload.title,
          isLoading: payload.isLoading,
          detectedStreamUrl: payload.detectedStreamUrl,
        });
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
    if (videoState.mode === 'cloud') {
      socketService.stopCloudBrowser();
    }
    if (participants.length <= 1 && canControlRoom) {
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
    if (!canControlRoom) {
      const hostName = participants.find((p) => p.id === hostId)?.name;
      showHostLockNotice(hostName);
      return;
    }
    triggerHaptic('medium');
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setSecondaryStream(null);
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
    setHostOnlyControl(false);
    setRoomHasPin(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
    setCatalogSection('home');
    setMobileTab('home');
    setRoomId(targetRoomId);
    setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    setInRoom(true);
  };

  const handleCreateFreshRoom = () => {
    const freshCode = generateShortRoomCode(4);
    const firstName = profile.name?.split(' ')[0] || 'Cine';
    handleSwitchActiveRoom(freshCode, `Sala de ${firstName}`);
  };

  const handleLeaveRoom = () => {
    triggerHaptic('light');
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
    setHostOnlyControl(false);
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
        setHostOnlyControl(false);
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
      if (!canControlRoom) {
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
    [canControlRoom, participants, hostId, showHostLockNotice, profile.name]
  );

  // ============================================================================
  // STREAM EXTRACTION HANDLERS (MOVIES, SERIES, HISTORY, SPORTS, YOUTUBE, URL)
  // ============================================================================
  const handlePlayMovie = async (
    movie: CatalogMovie,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN',
    startAtOverrideSec?: number
  ) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
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

    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(movie.id);
    setExtractionError(null);
    setExtractionLabel(
      resumeAtSec > 5
        ? `${movie.title} · Reanudando en ${requestedLangName}...`
        : `${movie.title} · Preparando ${requestedLangName}...`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'movie',
        tmdbId: movie.tmdbId ? String(movie.tmdbId) : '',
        url: movie.bingetrixUrl || movie.movidyUrl || '',
        movidyUrl: movie.movidyUrl || '',
        preferLang,
        title: movie.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

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
        rawSourceUrl: movie.bingetrixUrl || movie.movidyUrl || movie.id,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${activeLabel}`,
        poster: movie.poster,
        backdrop: movie.backdrop,
        currentTime: resumeAtSec,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
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
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch {
      setExtractionError('Error de red al conectar con el motor NAIM CINE.');
    } finally {
      setIsExtracting(false);
      setLoadingItemId(null);
    }
  };

  const handlePlaySeriesEpisode = async (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN',
    startAtOverrideSec?: number
  ) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const epLoadId = sanitizeItemKey(
      `tv-${series.tmdbId}-${episode.seasonNumber}-${episode.episodeNumber}`
    );
    const resumeAtSec =
      startAtOverrideSec !== undefined
        ? startAtOverrideSec
        : findSavedResumeSec(epLoadId);

    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(epLoadId);
    setExtractionError(null);
    setExtractionLabel(
      `${series.title} (${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
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
        episodeTitle: episode.title || '',
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

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
    } catch {
      setExtractionError('Error al conectar con el episodio seleccionado.');
    } finally {
      setIsExtracting(false);
      setLoadingItemId(null);
    }
  };

  const handleReplayHistoryItem = async (
    item: WatchHistoryItem,
    forceRestart = false
  ) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const resumeAtSec = forceRestart ? 0 : Math.floor(item.resumeTimeSec || 0);

    if (item.mediaType === 'tv' && item.tmdbId && item.season && item.episode) {
      const epLoadId = sanitizeItemKey(
        `tv-${item.tmdbId}-${item.season}-${item.episode}`
      );
      scrollDesktopToPlayer();
      setIsExtracting(true);
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
        });
        const res = await fetch(`/api/extract/stream?${params.toString()}`);
        const data = await res.json();
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
      } catch {
        setExtractionError('Error al reanudar el episodio del historial.');
      } finally {
        setIsExtracting(false);
        setLoadingItemId(null);
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

  const handleNextEpisode = async () => {
    const meta = videoState.seriesMeta;
    if (!meta) return;

    let nextSeason = meta.season;
    let nextEp = meta.episode + 1;
    if (meta.totalEpisodesInSeason && nextEp > meta.totalEpisodesInSeason) {
      if (!meta.totalSeasons || meta.season < meta.totalSeasons) {
        nextSeason = meta.season + 1;
        nextEp = 1;
      } else {
        return;
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
      `${meta.seriesTitle} (${nextSeason}x${String(nextEp).padStart(
        2,
        '0'
      )}) · Siguiente episodio...`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'tv',
        tmdbId: String(meta.tmdbId),
        season: String(nextSeason),
        episode: String(nextEp),
        preferLang,
        title: meta.seriesTitle,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError('No hay más episodios disponibles en esta temporada.');
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );

      const epLoadId = sanitizeItemKey(`tv-${meta.tmdbId}-${nextSeason}-${nextEp}`);
      activeHistoryIdRef.current = epLoadId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${meta.seriesTitle} · ${nextSeason}x${String(nextEp).padStart(2, '0')}`,
        subtitle: tracks[activeIdx]?.label || preferLang,
        poster: meta.poster,
        backdrop: meta.backdrop,
        currentTime: 0,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        seriesMeta: {
          ...meta,
          season: nextSeason,
          episode: nextEp,
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
        subtitle: `${nextSeason}x${String(nextEp).padStart(2, '0')}`,
        poster: meta.poster || '',
        backdrop: meta.backdrop || meta.poster || '',
        season: nextSeason,
        episode: nextEp,
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
      setExtractionError('Error al cargar el siguiente episodio.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePlaySportsMatch = async (match: SportsMatch, channelIndex: number) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const channel = match.channels[channelIndex] || match.channels[0];
    if (!channel) return;

    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(`${match.id}-${channelIndex}`);
    setExtractionError(null);
    setExtractionLabel(`${match.title} · Conectando ${channel.label}...`);

    try {
      const params = new URLSearchParams({
        url: channel.sourceUrl,
        resolverType: 'sports_channel',
        title: match.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (channelIndex + 1 < match.channels.length) {
          await handlePlaySportsMatch(match, channelIndex + 1);
          return;
        }
        socketService.startCloudBrowser(channel.sourceUrl, profile.name);
        return;
      }

      if (data.mode === 'cloud') {
        socketService.startCloudBrowser(data.streamUrl, profile.name);
        return;
      }

      const enrichedChannels = match.channels.map((c, idx) =>
        idx === channelIndex ? { ...c, resolvedStreamUrl: data.streamUrl } : c
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
        tracks: enrichedChannels,
        activeTrackIndex: channelIndex,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch {
      setExtractionError('No se pudo conectar con la señal en directo.');
    } finally {
      setIsExtracting(false);
      setLoadingItemId(null);
    }
  };

  const handlePlayTdtChannel = async (tdtCh: SpanishTdtChannel, signalIndex = 0) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const chosenSignal = tdtCh.channels[signalIndex] || tdtCh.channels[0];
    if (!chosenSignal) return;

    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(`tdt-${tdtCh.id}-${signalIndex}`);
    setExtractionError(null);
    setExtractionLabel(`${tdtCh.name} · Conectando emisión en directo HD...`);
    activeHistoryIdRef.current = null;

    const signalResolver = chosenSignal.resolverType || 'tdt_hls';

    try {
      const params = new URLSearchParams({
        url: chosenSignal.sourceUrl,
        resolverType: signalResolver,
        title: tdtCh.name,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        if (signalIndex + 1 < tdtCh.channels.length) {
          setIsExtracting(false);
          setLoadingItemId(null);
          await handlePlayTdtChannel(tdtCh, signalIndex + 1);
          return;
        }
        setExtractionError(
          data?.error || `La emisión de ${tdtCh.name} no responde en este instante.`
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
        subtitle: `TV en Directo · ${tdtCh.network} · ${chosenSignal.label}`,
        currentTime: 0,
        isPlaying: true,
        isLive: true,
        tracks: mappedTracks,
        activeTrackIndex: signalIndex,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch {
      setExtractionError(`No se pudo conectar con ${tdtCh.name}.`);
    } finally {
      setIsExtracting(false);
      setLoadingItemId(null);
    }
  };

  const handlePlayFavoriteChannel = async (favCh: FavoriteChannelItem) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(`favch-${favCh.favId}`);
    setExtractionError(null);
    setExtractionLabel(`${favCh.channelLabel} · Conectando canal favorito...`);

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
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
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

      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      playCinemaSound('play');
    } catch {
      setExtractionError('No se pudo conectar con el canal favorito.');
    } finally {
      setIsExtracting(false);
      setLoadingItemId(null);
    }
  };

  const handlePlayYouTubeVideo = (item: YouTubeSearchItem) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
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
    const targetTrack = videoState.tracks[trackIndex];
    if (!targetTrack) return;

    const resumeAt = videoState.isLive ? 0 : resumeTimeSec;

    if (targetTrack.resolvedStreamUrl) {
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

    setIsExtracting(true);
    setExtractionError(null);
    setExtractionLabel(`Cambiando idioma a ${targetTrack.label}...`);
    showLanguageNotice({
      type: 'success',
      title: `⏳ Cargando idioma: ${targetTrack.label}...`,
      subtitle: 'Conectando servidor de audio HD...',
    });

    try {
      const params = new URLSearchParams({
        url: targetTrack.sourceUrl,
        resolverType: targetTrack.resolverType,
        preferLang: String(targetTrack.lang || 'ES').toUpperCase(),
        title: videoState.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
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

        const backupIdxInOriginal = videoState.tracks.findIndex(
          (tr, idx) =>
            idx !== trackIndex && String(tr.lang || '').toUpperCase() === requestedLang
        );
        if (backupIdxInOriginal !== -1) {
          const adjustedBackupIdx =
            backupIdxInOriginal > trackIndex ? backupIdxInOriginal - 1 : backupIdxInOriginal;
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

      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profile.name);
      showLanguageNotice({
        type: 'success',
        title: `✓ Idioma cambiado a: ${targetTrack.label}`,
        subtitle: 'Audio actualizado correctamente en la sala',
      });
    } catch {
      setExtractionError('Error al cambiar de idioma.');
      showLanguageNotice({
        type: 'error',
        title: `⚠️ Error al cambiar a ${targetTrack.label}`,
        subtitle: 'No se pudo conectar con el servidor de este idioma.',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePlayCustomUrl = async (rawUrl: string) => {
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId('custom-url');
    setExtractionError(null);
    setExtractionLabel('Analizando enlace y extrayendo flujo limpio...');

    try {
      const params = new URLSearchParams({ url: rawUrl });
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
              : 'Flujo Nativo Sin Anuncios',
          currentTime: 0,
          isPlaying: true,
          isLive: false,
          tracks: data.tracks || [],
          activeTrackIndex: 0,
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
    if (isDesktopLayout) {
      setSidebarOpen(true);
      setOpenQueueTrigger((n) => n + 1);
    } else {
      setMobileTab('chat');
      setOpenQueueTrigger((n) => n + 1);
    }
  };

  const handlePlayQueueItem = (qItem: RoomQueueItem) => {
    if (!canControlRoom) {
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

    // If no primary stream is active yet, open directly on the main screen
    if (videoState.mode === 'idle' && canControlRoom) {
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
    if (canControlRoom) {
      socketService.syncVideoState('change_url', promotedMain, profile.name);
    }
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
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    triggerHaptic('success');
    const proposals: PollProposalItem[] = roomQueue
      .slice(0, 4)
      .map(({ id: _id, addedBy: _addedBy, ...proposal }) => proposal);
    socketService.startPoll(
      lang === 'es' ? '¿Qué vemos ahora en la sala?' : 'What should we watch next?',
      proposals,
      25
    );
    if (!isDesktopLayout) {
      setMobileTab('chat');
      setUnreadChatCount(0);
    } else {
      setSidebarOpen(true);
    }
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
          message:
            lang === 'es'
              ? '✓ Smart TV vinculada y proyectando en esta sala'
              : '✓ Smart TV paired and projecting in this room',
        });
      } else {
        setTvClaimStatus({
          type: 'error',
          message:
            data?.error ||
            (lang === 'es'
              ? 'Código de TV no encontrado o caducado.'
              : 'TV code not found or expired.'),
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
    if (!canControlRoom) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    scrollDesktopToPlayer();
    setExtractionError(null);
    socketService.startCloudBrowser(url, profile.name);
  };

  const handlePromoteCloudStreamToNative = (proxiedStreamUrl: string) => {
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
    setHostOnlyControl(false);
    setRoomHasPin(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
    setCatalogSection('home');
    setMobileTab('home');
    setRoomId(invite.roomId);
    setRoomName(invite.roomName || `Sala ${invite.roomId.toUpperCase()}`);
    setInRoom(true);
  };

  const handleUpdateProfile = (nextName: string, nextAvatar: string, nextColor: string) => {
    const updated: StoredProfile = {
      id: profile.id,
      name: nextName,
      avatar: nextAvatar || profile.avatar || '🎬',
      color: nextColor || profile.color || '#E11D48',
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

  const onlineSavedFriendsCount = savedFriends.filter((f) =>
    onlineUsers.some(
      (u) =>
        u.userId !== profile.id &&
        (u.userId === f.friendId || u.friendCode === f.friendCode)
    )
  ).length;

  // ============================================================================
  // RENDER 0: SMART TV 4-DIGIT PAIRING LOBBY (/tv)
  // ============================================================================
  if (isTvPairLobby) {
    return (
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
    );
  }

  // ============================================================================
  // RENDER 1: LOBBY SCREEN (SHOWN FOR GUESTS WHO HAVEN'T ENTERED A ROOM YET)
  // ============================================================================
  if (!inRoom) {
    return (
      <>
        {showIntro && (
          <NaimcineIntro
            withSound={introWithSound}
            onComplete={() => setShowIntro(false)}
          />
        )}
        <GlobalIncomingInviteBanner
          invite={incomingInvite}
          friendAddedNotice={friendAddedNotice}
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
        />
      </>
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
  const isOnMobileSocialTab =
    !isDesktopLayout && (mobileTab === 'chat' || mobileTab === 'room');
  const isDockedMini =
    isPlayerActive &&
    (isPlayerMinimized ||
      (isPlayingMediaReady && isAutoMiniByScroll) ||
      (isPlayingMediaReady && isOnMobileSocialTab && !pinFullPlayerOnChat));
  const showCinemaOverlay = isCinemaMode && isPlayerActive && !isDockedMini;
  const hasConnectedSmartTv = participants.some(
    (p) => p.name.includes('(TV)') || p.avatar === '📺'
  );

  const handleCatalogOrWorkspaceScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (
      effectiveVideoState.mode === 'idle' ||
      isExtracting ||
      isPlayerClosedLocally
    ) {
      return;
    }
    const st = e.currentTarget.scrollTop;
    if (st > 140 && !isAutoMiniByScroll) {
      setIsAutoMiniByScroll(true);
    } else if (st < 25 && isAutoMiniByScroll) {
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

  // ============================================================================
  // RENDER 3: UNIFIED WORKSPACE (DESKTOP OR USER-SELECTED MOBILE VIEW)
  // ============================================================================
  return (
    <div
      style={
        !isDesktopLayout && visualViewportHeight
          ? { height: `${visualViewportHeight}px` }
          : undefined
      }
      className="h-full w-full max-w-[100vw] bg-[#050507] text-[#F5F5F7] overflow-hidden"
    >
      <div
        className={`h-full w-full flex flex-col overflow-hidden pt-safe animate-room-warp ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto bg-[#050507] border-x border-white/[0.08] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : 'bg-[#050507]'
        }`}
      >
        <OfflineIndicator lang={lang} />

        {/* Live In-App Room Invite & Friend-Added Banner */}
        <GlobalIncomingInviteBanner
          invite={incomingInvite}
          friendAddedNotice={friendAddedNotice}
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
            subtitle={roomName ? `Entrando a ${roomName}` : undefined}
            onComplete={() => setShowIntro(false)}
          />
        )}

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
            const v = document.querySelector('video') as any;
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

        {/* ================================================================== */}
        {/* MODO CINE DARK OPACITY OVERLAY (bg-black/80 OVER ENTIRE APP)       */}
        {/* ================================================================== */}
        {showCinemaOverlay && (
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-black/80 z-40 pointer-events-none transition-opacity duration-300"
          />
        )}

        {/* Top Bar (z-30 so Modo Cine z-40 dims it cleanly; auto-hides on mobile when keyboard is open in chat or when phone is rotated to landscape during playback) */}
        <header
          className={`${
            isMobileChatWithKeyboard || isAutoImmersiveLandscape
              ? 'hidden'
              : isDesktopLayout
              ? 'h-14 px-6 flex'
              : 'h-13 px-3 flex'
          } glass-bar border-b border-white/[0.07] items-center justify-between gap-2 shrink-0 z-30`}
        >
          {/* Zone 1: Brand Emblem & Active Room Selector */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIntroWithSound(true);
                setShowIntro(true);
              }}
              title={lang === 'es' ? 'Ver Intro NC Cinema' : 'Play NC Cinema Intro'}
              className="shrink-0 cursor-pointer rounded-xl overflow-hidden shadow-[0_0_22px_rgba(229,9,20,0.32)] hover:scale-105 active:scale-95 transition-transform"
            >
              <NaimBrandLogo size={36} />
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (!isDesktopLayout && mobileTab !== 'room') {
                  setMobileTab('room');
                  return;
                }
                setProfileHubTab('account');
                setProfileHubOpen(true);
              }}
              className="flex flex-col min-w-0 text-left cursor-pointer group"
              title={
                lang === 'es'
                  ? 'Gestionar sala activa o cambiar de sala'
                  : 'Manage active room or switch room'
              }
            >
              <span className="font-display font-bold text-xs tracking-[0.1em] text-white leading-tight truncate flex items-center gap-1">
                <span>
                  NAIM <span className="text-[#E11D48]">CINE</span>
                </span>
                {isDesktopLayout && (
                  <>
                    <span className="text-zinc-600 font-normal mx-1">·</span>
                    <span className="font-semibold text-zinc-200 tracking-normal group-hover:text-white transition-colors truncate max-w-44">
                      {roomName || `Sala ${roomId.toUpperCase()}`}
                    </span>
                  </>
                )}
                {roomHasPin && (
                  <Lock
                    className="w-3 h-3 text-[#E11D48] shrink-0 ml-0.5"
                    aria-label="Sala con PIN privado"
                  />
                )}
              </span>
              {!isDesktopLayout && (
                <span className="text-[0.65rem] text-zinc-400 truncate max-w-[8.5rem] flex items-center gap-1">
                  <span className="truncate">
                    {roomName || `Sala #${roomId.toUpperCase()}`}
                  </span>
                  <span className="text-zinc-500">▾</span>
                </span>
              )}
            </button>
          </div>

          {/* Zone 2: Clean Direct Navigation Links (Desktop Mode) */}
          {isDesktopLayout && (
            <nav
              className="flex items-center gap-6 text-sm font-medium overflow-x-auto no-scrollbar"
              aria-label="Catálogo NAIM CINE"
            >
              {(
                [
                  {
                    id: 'home',
                    label: lang === 'es' ? 'Inicio' : 'Home',
                    isActive: catalogSection === 'home',
                    onClick: () => setCatalogSection('home'),
                  },
                  {
                    id: 'movies',
                    label: lang === 'es' ? 'Películas' : 'Movies',
                    isActive: catalogSection === 'movies' || catalogSection === 'vose',
                    onClick: () => setCatalogSection('movies'),
                  },
                  {
                    id: 'series',
                    label: lang === 'es' ? 'Series' : 'Series',
                    isActive: catalogSection === 'series',
                    onClick: () => setCatalogSection('series'),
                  },
                  {
                    id: 'anime',
                    label: 'Anime',
                    isActive: catalogSection === 'anime',
                    onClick: () => setCatalogSection('anime'),
                  },
                  {
                    id: 'tdt',
                    label: lang === 'es' ? 'TV en Vivo' : 'Live TV',
                    isActive: catalogSection === 'tdt' || catalogSection === 'sports',
                    onClick: () => setCatalogSection('tdt'),
                  },
                ] as const
              ).map((navItem) => (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={navItem.onClick}
                  className={`h-[56px] flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    navItem.isActive
                      ? 'border-[#E11D48] text-white font-semibold'
                      : 'border-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{navItem.label}</span>
                </button>
              ))}
            </nav>
          )}

          {/* Zone 3: Spacious Ergonomic Right Actions (3 clean buttons on Mobile, full bar on PC) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isDesktopLayout && (
              <ViewModeSwitchButton
                effectiveView={effectiveView}
                onToggle={toggleViewMode}
                lang={lang}
                compact
              />
            )}

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSmartTvModalOpen(true);
              }}
              title={
                lang === 'es'
                  ? 'Conectar Samsung TV / Smart TV y Mando'
                  : 'Connect Samsung TV / Smart TV & Remote'
              }
              className={`min-h-11 min-w-11 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all relative ${
                hasConnectedSmartTv
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/45 text-emerald-200'
                  : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.1] text-zinc-200'
              }`}
            >
              <Tv className="w-4 h-4 text-zinc-100 shrink-0" />
              <span className={isDesktopLayout ? 'inline' : 'hidden'}>
                Smart TV
              </span>
              {hasConnectedSmartTv && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={handleShareOrCopyHeaderInvite}
              title="Amigos e Invitación Directa a la Sala"
              className="min-h-11 px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#F43F5E] active:scale-95 text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all shadow-[0_8px_22px_rgba(225,29,72,0.32)] relative"
            >
              {copiedHeaderInvite ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{t.copied}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>{isDesktopLayout ? 'Amigos · Invitar' : t.invite}</span>
                  {onlineSavedFriendsCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-400 text-[#050507] text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                      {onlineSavedFriendsCount}
                    </span>
                  )}
                </>
              )}
            </button>

            <CloudAccountButton
              user={authUser}
              authLoading={authLoading}
              displayName={profile.name}
              lang={lang}
              isDesktop={isDesktopLayout}
              onSignIn={handleGoogleSignIn}
              onSignOut={handleGoogleSignOut}
              onOpenProfileHub={() => {
                setProfileHubTab('history');
                setProfileHubOpen(true);
              }}
              compact
            />

            {isDesktopLayout && (
              <>
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  className="w-11 h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-300 cursor-pointer active:scale-95 transition-all relative"
                  title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
                  aria-label="Alternar panel lateral"
                >
                  {sidebarOpen ? (
                    <PanelRightClose className="w-4 h-4" />
                  ) : (
                    <PanelRightOpen className="w-4 h-4" />
                  )}
                  {!sidebarOpen && roomQueue.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E11D48] text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                      {roomQueue.length > 9 ? '9+' : roomQueue.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="min-h-11 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-300 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  title={t.leaveRoom}
                  aria-label={t.leaveRoom}
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t.leaveRoom}</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main Workspace (Single Mounted NativeCinemaPlayer Instance!) */}
        <div
          className={`flex-1 min-h-0 min-w-0 flex ${
            isDesktopLayout ? 'flex-row' : 'flex-col'
          } overflow-hidden`}
        >
          <div
            ref={mainScrollRef}
            onScroll={isDesktopLayout ? handleCatalogOrWorkspaceScroll : undefined}
            className={`flex-1 min-h-0 min-w-0 flex flex-col ${
              isDesktopLayout ? 'overflow-y-auto' : 'overflow-hidden'
            }`}
          >
            {/* Preserve top layout space ONLY on Desktop where player and catalog share the same scroll container */}
            {isDesktopLayout &&
              isDockedMini &&
              isAutoMiniByScroll &&
              !isPlayerMinimized && (
                <div
                  aria-hidden="true"
                  className="shrink-0 w-full pointer-events-none max-w-7xl mx-auto px-6 pt-5 aspect-video"
                />
              )}

            {/* SINGLE NATIVE CINEMA PLAYER INSTANCE (Supports Full Stage & Draggable 4-Corner 16:9 PiP) */}
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
                          ? 'block max-w-7xl mx-auto px-6 pt-5'
                          : isAutoImmersiveLandscape
                          ? 'block h-full flex-1 bg-black'
                          : 'block border-b border-white/[0.08]'
                        : 'hidden'
                    }`
              }
            >
              <div
                className={
                  isDockedMini || showCinemaOverlay
                    ? ''
                    : isDesktopLayout
                    ? 'rounded-3xl shadow-[0_20px_70px_rgba(225,29,72,0.1)]'
                    : ''
                }
              >
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
                  messages={messages}
                  currentUserId={currentUser.id}
                  onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
                  onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
                  onOpenInCloudBrowser={(targetUrl) => {
                    if (!canControlRoom) return;
                    socketService.startCloudBrowser(targetUrl, profile.name);
                  }}
                  floatingChatOpen={floatingChatOpen}
                  onToggleFloatingChat={() => setFloatingChatOpen((v) => !v)}
                  compactVideoForMobileKeyboard={
                    !isDesktopLayout && isMobileKeyboardOpen && mobileTab === 'chat'
                  }
                  onOpenCatalogSection={(sec) => {
                    setCatalogSection(sec);
                    if (sec === 'movies' || sec === 'series' || sec === 'anime') setMobileTab('movies');
                    else if (sec === 'tdt') setMobileTab('tdt');
                    else if (sec === 'sports') setMobileTab('sports');
                    else if (sec === 'youtube') setMobileTab('youtube');
                  }}
                />

                {/* 1-Tap Quick Multiview Bar if secondary stream active */}
                {isPlayerActive && !isDockedMini && !isExtracting && secondaryStream && (
                  <div className="px-3 py-1.5 bg-[#08080C] border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-300 truncate">
                      📺 2ª Pantalla Activa: {secondaryStream.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        handleCloseSecondaryStream();
                      }}
                      className="min-h-7 px-2.5 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/40 text-[11px] font-bold text-[#FB7185] whitespace-nowrap cursor-pointer hover:bg-[#E11D48]/30 transition-colors"
                    >
                      Cerrar 2ª Pantalla
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Host Lock Non-Intrusive Toast */}
            {lockNoticeToast && (
              <div className="fixed top-17 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-[#141722]/95 backdrop-blur-md border border-amber-500/40 text-amber-200 text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-fade-in">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{lockNoticeToast}</span>
              </div>
            )}

            {/* Added-to-Queue Instant Confirmation Toast with 1-Tap "Ver Cola" */}
            {queueAddedNotice && (
              <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md px-3.5 py-2.5 rounded-2xl bg-[#101015]/95 backdrop-blur-xl border border-white/15 text-white text-xs shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-between gap-2.5 animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <ListVideo className="w-4 h-4 text-[#E11D48] shrink-0" />
                  <span className="truncate font-medium">
                    {lang === 'es' ? 'En la cola:' : 'Queued:'}{' '}
                    <strong className="text-white">{queueAddedNotice}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenRoomQueueView}
                  className="min-h-9 px-3 rounded-xl bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  {lang === 'es'
                    ? `Ver Cola (${roomQueue.length})`
                    : `View Queue (${roomQueue.length})`}
                </button>
              </div>
            )}

            {/* Mobile Chat / Queue / Room View with Floating Segmented Control */}
            {!isDesktopLayout && (mobileTab === 'chat' || mobileTab === 'room') && (
              <div className="flex-1 min-h-0 min-w-0 flex flex-col">
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
                  activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
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
                  initialView={
                    mobileTab === 'room'
                      ? 'room'
                      : unreadChatCount === 0 && roomQueue.length > 0
                      ? 'queue'
                      : 'chat'
                  }
                  hideInternalTabs={mobileTab === 'room'}
                  openQueueTrigger={openQueueTrigger}
                  isKeyboardOpen={isMobileKeyboardOpen}
                  onOpenFloatingChatOnVideo={
                    isPlayerActive
                      ? () => {
                          setFloatingChatOpen(true);
                          setMobileTab('movies');
                          mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      : undefined
                  }
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
                  onLeaveRoom={handleLeaveRoom}
                />
              </div>
            )}

            {/* Scrollable Catalog Hub */}
            <div
              ref={catalogScrollRef}
              onScroll={!isDesktopLayout ? handleCatalogOrWorkspaceScroll : undefined}
              className={`flex-1 min-h-0 min-w-0 ${
                isDesktopLayout
                  ? 'overflow-visible px-6 py-6'
                  : 'overflow-y-auto overflow-x-clip overscroll-contain px-3.5 py-4'
              } ${
                !isDesktopLayout && (mobileTab === 'chat' || mobileTab === 'room')
                  ? 'hidden'
                  : 'block'
              }`}
            >
              <div className="w-full min-w-0 max-w-7xl mx-auto space-y-4 pb-6">
                {/* If user closed their local player while friends are still watching in room */}
                {isPlayerClosedLocally && videoState.mode !== 'idle' && (
                  <div className="p-3.5 rounded-2xl bg-[#0D0D12] border border-white/[0.1] flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#E11D48]">
                        {lang === 'es' ? 'Reproduciendo en la sala' : 'Playing in room'}
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
                        className="min-h-11 px-4 rounded-xl bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{lang === 'es' ? 'Volver a abrir' : 'Reopen'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStopRoomPlaybackForEveryone}
                        className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/12 text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>{lang === 'es' ? 'Detener sala' : 'Stop room'}</span>
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

                <MediaCatalogHub
                  activeSection={catalogSection}
                  onChangeSection={(sec) => {
                    if (!isDesktopLayout && sec === 'direct') {
                      setMobileTab('chat');
                      setOpenQueueTrigger((n) => n + 1);
                      return;
                    }
                    setCatalogSection(sec);
                    if (sec === 'home') {
                      setMobileTab('home');
                    } else if (
                      sec === 'movies' ||
                      sec === 'vose' ||
                      sec === 'series' ||
                      sec === 'anime'
                    ) {
                      setMobileTab('movies');
                    } else if (sec === 'tdt') {
                      setMobileTab('tdt');
                    } else if (sec === 'sports') {
                      setMobileTab('sports');
                    } else if (sec === 'youtube') {
                      setMobileTab('youtube');
                    }
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
                />
              </div>
            </div>
          </div>

          {/* Desktop Right Party Sidebar */}
          {isDesktopLayout && sidebarOpen && (
            <div className="flex w-[22rem] xl:w-[23.5rem] shrink-0 h-full">
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
                activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
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
                onLeaveRoom={handleLeaveRoom}
              />
            </div>
          )}
        </div>

        {/* Clean 4-Tab Mobile Bottom Bar (Inicio · Cine/Series · TV en Vivo · Sala/Chat) */}
        {!isDesktopLayout && !isMobileChatWithKeyboard && !isAutoImmersiveLandscape && (
          <div className="shrink-0 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#050507] via-[#050507]/90 to-transparent z-30">
            <nav
              className="rounded-3xl bg-[#0B0B12]/90 backdrop-blur-2xl border border-white/[0.12] shadow-[0_18px_45px_rgba(0,0,0,0.85)] p-1.5 grid grid-cols-4 gap-1.5"
              aria-label="Navegación móvil NAIM CINE"
            >
              {(
                [
                  {
                    id: 'home',
                    label: lang === 'es' ? 'Inicio' : 'Home',
                    icon: LayoutGrid,
                    isActive:
                      mobileTab !== 'chat' &&
                      mobileTab !== 'room' &&
                      catalogSection === 'home',
                    onSelect: () => {
                      setMobileTab('home');
                      setCatalogSection('home');
                      catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    },
                  },
                  {
                    id: 'movies',
                    label: lang === 'es' ? 'Cine y Series' : 'Movies & TV',
                    icon: Film,
                    isActive:
                      mobileTab !== 'chat' &&
                      mobileTab !== 'room' &&
                      (catalogSection === 'movies' ||
                        catalogSection === 'vose' ||
                        catalogSection === 'series' ||
                        catalogSection === 'anime' ||
                        catalogSection === 'youtube'),
                    onSelect: () => {
                      setMobileTab('movies');
                      if (
                        catalogSection !== 'movies' &&
                        catalogSection !== 'vose' &&
                        catalogSection !== 'series' &&
                        catalogSection !== 'anime'
                      ) {
                        setCatalogSection('movies');
                      }
                    },
                  },
                  {
                    id: 'tdt',
                    label: lang === 'es' ? 'TV en Vivo' : 'Live TV',
                    icon: Radio,
                    isActive:
                      mobileTab !== 'chat' &&
                      mobileTab !== 'room' &&
                      (catalogSection === 'tdt' || catalogSection === 'sports'),
                    onSelect: () => {
                      setMobileTab('tdt');
                      if (catalogSection !== 'tdt' && catalogSection !== 'sports') {
                        setCatalogSection('tdt');
                      }
                    },
                  },
                  {
                    id: 'chat',
                    label: lang === 'es' ? 'Sala · Chat' : 'Room',
                    icon: MessageSquare,
                    isActive: mobileTab === 'chat' || mobileTab === 'room',
                    badge: unreadChatCount + roomQueue.length || undefined,
                    onSelect: () => {
                      if (unreadChatCount === 0 && roomQueue.length > 0) {
                        setOpenQueueTrigger((n) => n + 1);
                      }
                      setMobileTab('chat');
                      setUnreadChatCount(0);
                    },
                  },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = item.isActive;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      item.onSelect();
                    }}
                    className={`min-h-13 py-1 rounded-2xl flex flex-col items-center justify-center gap-1 relative active:scale-95 transition-all cursor-pointer ${
                      active
                        ? 'bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-1 w-5 h-0.5 rounded-full bg-[#E11D48]" />
                    )}
                    <div className="relative mt-0.5 flex items-center justify-center">
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          active ? 'text-[#FB7185]' : 'text-zinc-400'
                        }`}
                        strokeWidth={2}
                      />
                      {'badge' in item && item.badge ? (
                        <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#E11D48] text-[0.65rem] font-bold text-white flex items-center justify-center tabular-nums shadow-sm">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`text-[0.68rem] leading-tight tracking-tight whitespace-nowrap shrink-0 ${
                        active ? 'font-bold text-white' : 'font-medium text-zinc-400'
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
