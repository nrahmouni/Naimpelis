import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Film,
  Trophy,
  Youtube,
  MessageSquare,
  Users,
  Share2,
  Check,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Square,
  Plus,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  ChatMessage,
  CloudBrowserState,
  FavoriteChannelItem,
  FloatingReaction,
  Participant,
  RoomQueueItem,
  SportsMatch,
  StreamTrack,
  TvEpisodeItem,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from './types';
import { UI_COPY } from './utils/i18n';
import {
  addRecentRoom,
  addWatchHistoryItem,
  clearWatchHistory,
  dismissGuestPopupForRoom,
  getCatalogFavoriteKey,
  getFavoriteChannels,
  getRecentRooms,
  getStoredProfile,
  getWatchHistory,
  getWatchlist,
  removeWatchHistoryItem,
  sanitizeItemKey,
  saveFavoriteChannels,
  saveStoredProfile,
  saveWatchHistory,
  saveWatchlist,
  StoredProfile,
  toggleFavoriteChannel,
  toggleWatchlistItem,
  updateWatchHistoryProgress,
  wasGuestPopupDismissed,
} from './utils/storage';
import {
  clearCloudWatchHistoryItems,
  deleteCloudFavoriteById,
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
import {
  OfflineIndicator,
  PWAInstallButton,
  PWAInstallNotification,
} from './components/PWAInstallPrompt';
import { NaimcineIntro } from './components/NaimcineIntro';
import { LobbyScreen } from './components/LobbyScreen';
import { GuestWelcomePopup } from './components/GuestWelcomePopup';
import { NativeCinemaPlayer } from './components/NativeCinemaPlayer';
import { CatalogSection, MediaCatalogHub } from './components/MediaCatalogHub';
import { PartySidebar } from './components/PartySidebar';

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

function formatBannerClock(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

type MobileNavTab = 'movies' | 'sports' | 'youtube' | 'chat' | 'room';

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
  const isTvMode = initialRoute.isTvMode;

  const [showIntro, setShowIntro] = useState<boolean>(false);
  const [introWithSound, setIntroWithSound] = useState<boolean>(false);

  const [roomId, setRoomId] = useState<string>(initialUrlRoom);
  const [roomName, setRoomName] = useState<string>(
    initialUrlRoom ? `Sala ${initialUrlRoom.toUpperCase()}` : ''
  );
  const [inRoom, setInRoom] = useState<boolean>(Boolean(initialUrlRoom));

  // Player Minimize, Local Close & Session-Persistent 'Modo Cine' State
  const [isPlayerMinimized, setIsPlayerMinimized] = useState<boolean>(false);
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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomQueue, setRoomQueue] = useState<RoomQueueItem[]>([]);
  const [videoState, setVideoState] = useState<VideoState>(INITIAL_VIDEO_STATE);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [cloudFrame, setCloudFrame] = useState<string | null>(null);
  const [cloudState, setCloudState] = useState<CloudBrowserState | null>(null);

  // Navigation & Extraction State
  const [catalogSection, setCatalogSection] = useState<CatalogSection>('movies');
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('movies');
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [copiedHeaderInvite, setCopiedHeaderInvite] = useState<boolean>(false);

  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionLabel, setExtractionLabel] = useState<string>('');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  const mobileTabRef = useRef<MobileNavTab>(mobileTab);
  mobileTabRef.current = mobileTab;
  const inRoomRef = useRef<boolean>(inRoom);
  inRoomRef.current = inRoom;
  const manualLobbyStayRef = useRef<boolean>(false);
  const hadActivePlaybackRef = useRef<boolean>(false);

  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const activeHistoryIdRef = useRef<string | null>(null);
  const lastCloudProgressSyncRef = useRef<number>(0);
  const watchHistoryRef = useRef<WatchHistoryItem[]>(watchHistory);
  watchHistoryRef.current = watchHistory;

  const t = UI_COPY[lang];

  const currentUser: Participant = {
    id: profile.id,
    name: isTvMode ? `${profile.name} (TV)` : profile.name,
    avatar: isTvMode ? '📺' : profile.avatar || '🎬',
    color: profile.color || '#E11D48',
    isHost: hostId === profile.id,
    joinedAt: Date.now(),
  };

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
        return;
      }

      const localHistorySnapshot = getWatchHistory();
      const localWatchlistSnapshot = getWatchlist();
      const localChannelsSnapshot = getFavoriteChannels();

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

      // When logged in, skip the initial landing page and enter last/personal room directly!
      if (!inRoomRef.current && !manualLobbyStayRef.current) {
        const savedRooms = getRecentRooms();
        const lastRoom = savedRooms[0];
        const targetCode = lastRoom?.id || generateShortRoomCode(4);
        const firstName =
          resolvedProfile.name?.split(' ')[0] ||
          user.displayName?.split(' ')[0] ||
          'Cine';
        const targetRoomTitle = lastRoom?.name || `Sala de ${firstName}`;
        setShowIntro(false);
        setRoomId(targetCode);
        setRoomName(targetRoomTitle);
        setInRoom(true);
      }

      detachCloudListeners = subscribeUserCloudCollections(user.uid, {
        onWatchHistory: (cloudItems) => {
          setWatchHistory(cloudItems);
          saveWatchHistory(cloudItems);
        },
        onFavorites: (cloudWatchlist, cloudChannels) => {
          setWatchlist(cloudWatchlist);
          saveWatchlist(cloudWatchlist);
          setFavoriteChannels(cloudChannels);
          saveFavoriteChannels(cloudChannels);
        },
      });

      migrationTimer = setTimeout(() => {
        migrateLocalStateToCloud({
          localHistory: localHistorySnapshot,
          localWatchlist: localWatchlistSnapshot,
          localChannels: localChannelsSnapshot,
        }).catch(() => {});
      }, 900);
    });

    return () => {
      active = false;
      unsubAuth();
      if (detachCloudListeners) detachCloudListeners();
      if (migrationTimer) clearTimeout(migrationTimer);
    };
  }, []);

  const handleGoogleSignIn = async () => {
    manualLobbyStayRef.current = false;
    await signInWithGoogleAccount();
  };

  const handleGoogleSignOut = async () => {
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
      const histId = sanitizeItemKey(
        parsedTmdbId
          ? `movie-${parsedTmdbId}`
          : `movie-${vState.rawSourceUrl || vState.title}`
      );
      activeHistoryIdRef.current = histId;

      const { list, item } = addWatchHistoryItem({
        id: histId,
        mediaType: 'movie',
        tmdbId: parsedTmdbId,
        title: vState.title,
        subtitle: vState.subtitle || 'HD',
        poster: vState.poster || vState.backdrop || '',
        backdrop: vState.backdrop || vState.poster || '',
        preferLang: activeTr?.lang === 'EN' ? 'EN' : 'ES',
        bingetrixUrl: vState.rawSourceUrl?.startsWith('http')
          ? vState.rawSourceUrl
          : undefined,
        resumeTimeSec: vState.currentTime > 5 ? Math.floor(vState.currentTime) : undefined,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});
    }
  }, []);

  const handlePlayerProgressUpdate = useCallback(
    (currentTimeSec: number, durationSec: number) => {
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
      upsertCloudCatalogFavorite(item).catch(() => {});
    } else {
      deleteCloudFavoriteById(getCatalogFavoriteKey(item)).catch(() => {});
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

  useEffect(() => {
    if (!inRoom || !roomId) return;

    const userPayload: Participant = {
      id: profile.id,
      name: isTvMode ? `${profile.name} (TV)` : profile.name,
      avatar: isTvMode ? '📺' : profile.avatar || '🎬',
      color: profile.color || '#E11D48',
      isHost: false,
      joinedAt: Date.now(),
    };

    socketService.connect(roomId, userPayload, roomName || `Sala ${roomId.toUpperCase()}`);
    addRecentRoom({ id: roomId, name: roomName || `Sala ${roomId.toUpperCase()}` });
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
        setRoomName(payload.name || `Sala ${roomId.toUpperCase()}`);
        setHostId(payload.hostId || '');
        setParticipants(payload.participants || []);
        setMessages(payload.messages || []);
        setRoomQueue(payload.queue || []);
        if (payload.videoState) {
          setVideoState(payload.videoState);
          recordStateInWatchHistory(payload.videoState);
        }
      } else if (type === 'PARTICIPANTS_UPDATED') {
        setParticipants(payload.participants || []);
        if (payload.hostId) setHostId(payload.hostId);
        if (payload.message) {
          setMessages((prev) => [...prev.slice(-149), payload.message]);
          playCinemaSound('join');
        }
      } else if (type === 'VIDEO_STATE_UPDATED') {
        if (payload.videoState) {
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
          recordStateInWatchHistory(payload.videoState);
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
  }, [inRoom, roomId, recordStateInWatchHistory]);

  const scrollDesktopToPlayer = () => {
    setIsPlayerClosedLocally(false);
    setIsPlayerMinimized(false);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleCinemaMode = useCallback(() => {
    setIsCinemaMode((prev) => {
      const next = !prev;
      if (next) {
        setIsPlayerMinimized(false);
        setIsPlayerClosedLocally(false);
        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (videoState.mode === 'cloud') {
      socketService.stopCloudBrowser();
    }
    if (participants.length <= 1) {
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
    triggerHaptic('medium');
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
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
    setRoomId(targetRoomId);
    setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    setInRoom(true);
    setIntroWithSound(true);
    setShowIntro(true);
  };

  const handleSwitchActiveRoom = (targetRoomId: string, customName?: string) => {
    manualLobbyStayRef.current = false;
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
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
    setShowGuestPopup(false);
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setCinemaModePersist(false);
    setRoomId('');
    setVideoState(INITIAL_VIDEO_STATE);
    setCloudFrame(null);
    setCloudState(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleSyncPlayerAction = useCallback(
    (action: 'play' | 'pause' | 'seek' | 'change_url', patch: Partial<VideoState>) => {
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
    [profile.name]
  );

  // ============================================================================
  // STREAM EXTRACTION HANDLERS (MOVIES, SERIES, HISTORY, SPORTS, YOUTUBE, URL)
  // ============================================================================
  const handlePlayMovie = async (
    movie: CatalogMovie,
    preferLang: 'ES' | 'EN',
    startAtOverrideSec?: number
  ) => {
    const histId = sanitizeItemKey(
      movie.tmdbId ? `movie-${movie.tmdbId}` : `movie-${movie.id}`
    );
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
        ? `${movie.title} · Reanudando reproducción...`
        : `${movie.title} · Preparando HLS HD...`
    );

    try {
      const params = new URLSearchParams({
        mediaType: 'movie',
        tmdbId: movie.tmdbId ? String(movie.tmdbId) : '',
        url: movie.bingetrixUrl || movie.movidyUrl || '',
        preferLang,
        title: movie.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          data?.error || 'No se pudo cargar esta película en este momento.'
        );
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );

      activeHistoryIdRef.current = histId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: movie.bingetrixUrl || movie.movidyUrl || movie.id,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${tracks[activeIdx]?.label || preferLang}`,
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
        subtitle: `${movie.year || 'HD'} · ${tracks[activeIdx]?.label || preferLang}`,
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
    preferLang: 'ES' | 'EN',
    startAtOverrideSec?: number
  ) => {
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
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          data?.error || 'Este episodio aún no tiene señal directa disponible.'
        );
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );

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
        });
        const res = await fetch(`/api/extract/stream?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || !data?.success || !data?.streamUrl) {
          setExtractionError('Este episodio no está disponible en este momento.');
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
    const preferLang: 'ES' | 'EN' = activeTrack?.lang === 'EN' ? 'EN' : 'ES';

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
        setExtractionError(
          data?.error || 'La señal de este canal no está emitiendo ahora mismo.'
        );
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

  const handlePlayFavoriteChannel = async (favCh: FavoriteChannelItem) => {
    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(`favch-${favCh.favId}`);
    setExtractionError(null);
    setExtractionLabel(`${favCh.channelLabel} · Conectando canal favorito...`);

    try {
      const params = new URLSearchParams({
        url: favCh.channelUrl,
        resolverType: 'sports_channel',
        title: favCh.title || favCh.channelLabel,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(
          data?.error || 'La señal de este canal favorito no está activa ahora mismo.'
        );
        return;
      }

      const singleTrack: StreamTrack = {
        id: favCh.favId,
        label: favCh.channelLabel,
        lang: 'ES',
        sourceUrl: favCh.channelUrl,
        resolverType: 'sports_channel',
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

  const handleSelectTrack = async (trackIndex: number, resumeTimeSec: number) => {
    const targetTrack = videoState.tracks[trackIndex];
    if (!targetTrack) return;

    const resumeAt = videoState.isLive ? 0 : resumeTimeSec;

    if (targetTrack.resolvedStreamUrl) {
      const instantState: VideoState = {
        ...videoState,
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
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);
    setExtractionLabel(`Cambiando a ${targetTrack.label}...`);

    try {
      const params = new URLSearchParams({
        url: targetTrack.sourceUrl,
        resolverType: targetTrack.resolverType,
        preferLang: targetTrack.lang === 'EN' ? 'EN' : 'ES',
        title: videoState.title,
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data?.success || !data?.streamUrl) {
        setExtractionError(`La pista "${targetTrack.label}" no está disponible.`);
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
    } catch {
      setExtractionError('Error al cambiar de pista.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handlePlayCustomUrl = async (rawUrl: string) => {
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
        const nextState: VideoState = {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          rawSourceUrl: rawUrl,
          title: data.title || 'Reproducción Directa HD',
          subtitle:
            data.mode === 'youtube'
              ? 'YouTube Sincronizado'
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
  };

  const handlePlayQueueItem = (qItem: RoomQueueItem) => {
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

  const handleOpenCloudBrowser = (url: string) => {
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
    triggerHaptic('success');
    const inviteUrl = buildShortInviteUrl(roomId, false);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${roomName} · NAIM CINE`,
          text: 'Entra directo a mi sala NAIM CINE:',
          url: inviteUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedHeaderInvite(true);
      setTimeout(() => setCopiedHeaderInvite(false), 2000);
    } catch {
      // ignore
    }
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
        />
      </>
    );
  }

  // ============================================================================
  // RENDER 2: SMART TV RECEIVER MODE (?room=...&tv=1)
  // ============================================================================
  if (isTvMode) {
    return (
      <div className="w-full h-full bg-black overflow-hidden">
        <NativeCinemaPlayer
          videoState={videoState}
          lang={lang}
          userName={currentUser.name}
          isExtracting={isExtracting}
          extractionLabel={extractionLabel}
          extractionError={extractionError}
          cloudFrame={cloudFrame}
          cloudState={cloudState}
          floatingReactions={floatingReactions}
          onSyncAction={handleSyncPlayerAction}
          onSelectTrack={handleSelectTrack}
          onPromoteCloudStreamToNative={handlePromoteCloudStreamToNative}
          onNextEpisode={handleNextEpisode}
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
  const isDockedMini = isPlayerMinimized && isPlayerActive;
  const showCinemaOverlay = isCinemaMode && isPlayerActive && !isDockedMini;
  const latestHistoryEntry = watchHistory[0] || null;

  // ============================================================================
  // RENDER 3: UNIFIED WORKSPACE (DESKTOP OR USER-SELECTED MOBILE VIEW)
  // ============================================================================
  return (
    <div className="h-full w-full max-w-[100vw] bg-[#06070B] text-[#F4F5F8] overflow-hidden">
      <div
        className={`h-full w-full flex flex-col overflow-hidden pt-safe animate-room-warp ${
          isFramedMobileOnPc
            ? 'max-w-[430px] mx-auto bg-[#090A0F] border-x border-white/[0.1] shadow-[0_0_90px_rgba(0,0,0,0.92)]'
            : 'bg-[#090A0F]'
        }`}
      >
        <OfflineIndicator lang={lang} />
        <PWAInstallNotification lang={lang} />

        {showIntro && (
          <NaimcineIntro
            withSound={introWithSound}
            subtitle={roomName ? `Entrando a ${roomName}` : undefined}
            onComplete={() => setShowIntro(false)}
          />
        )}

        {/* Dedicated Mi Perfil Hub (History, Resume, Favorite Movies/Series, Favorite Channels & Room Switcher) */}
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
        />

        {/* Non-intrusive Guest Welcome Card when entering via invite link */}
        {showGuestPopup && !showIntro && !authUser && (
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
          <>
            <div
              aria-hidden="true"
              className="fixed inset-0 bg-black/80 z-40 pointer-events-none transition-opacity duration-300"
            />
            <button
              type="button"
              onClick={handleToggleCinemaMode}
              className="fixed top-3 right-3 sm:top-4 sm:right-5 z-50 min-h-[38px] px-3.5 rounded-xl bg-[#11131B]/95 hover:bg-[#191C28] border border-amber-400/40 text-xs font-semibold text-amber-200 flex items-center gap-2 shadow-2xl cursor-pointer transition-all"
              title={
                lang === 'es' ? 'Salir de Modo Cine (Esc)' : 'Exit Cinema Mode (Esc)'
              }
            >
              <Sun className="w-3.5 h-3.5 text-amber-300" />
              <span>{lang === 'es' ? 'Salir de Modo Cine' : 'Lights On'}</span>
            </button>
          </>
        )}

        {/* Top Bar (z-30 so Modo Cine z-40 dims it cleanly) */}
        <header
          className={`${
            isDesktopLayout ? 'h-[60px] px-6' : 'h-[54px] px-3'
          } bg-[#090A0F]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-2 sm:gap-3 shrink-0 z-30`}
        >
          {/* Zone 1: Brand Emblem & Active Room */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIntroWithSound(true);
                setShowIntro(true);
              }}
              title="NAIM CINE"
              className="shrink-0 cursor-pointer rounded-xl overflow-hidden shadow-[0_0_20px_rgba(225,29,72,0.2)]"
            >
              <NaimBrandLogo size={34} />
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileHubTab('account');
                setProfileHubOpen(true);
              }}
              className="flex flex-col min-w-0 text-left cursor-pointer group"
              title={
                lang === 'es'
                  ? 'Cambiar de sala o crear sala nueva'
                  : 'Switch or create room'
              }
            >
              <span className="font-display font-bold text-xs sm:text-sm tracking-[0.12em] text-white leading-tight truncate">
                NAIM <span className="text-[#E11D48]">CINE</span>
                {isDesktopLayout && (
                  <>
                    <span className="text-zinc-500 font-normal mx-1.5">·</span>
                    <span className="font-semibold text-zinc-200 tracking-normal group-hover:text-white transition-colors">
                      {roomName || `Sala ${roomId.toUpperCase()}`}
                    </span>
                  </>
                )}
              </span>
              {!isDesktopLayout && (
                <span className="text-[10px] text-zinc-400 truncate max-w-[110px] font-mono">
                  #{roomId}
                </span>
              )}
            </button>
          </div>

          {/* Zone 2: Clean Single-Line Text Navigation Links (Desktop Mode) */}
          {isDesktopLayout && (
            <nav
              className="flex items-center gap-6 text-sm font-medium overflow-x-auto no-scrollbar"
              aria-label="Catálogo NAIM CINE"
            >
              {(
                [
                  { id: 'movies', label: t.tabMovies },
                  { id: 'vose', label: t.tabVose },
                  { id: 'series', label: t.tabSeries },
                  { id: 'sports', label: t.tabSports },
                  { id: 'youtube', label: t.tabYoutube },
                  {
                    id: 'direct',
                    label: `${t.tabDirect}${
                      roomQueue.length ? ` (${roomQueue.length})` : ''
                    }`,
                  },
                ] as const
              ).map((navItem) => {
                const active = catalogSection === navItem.id;
                return (
                  <button
                    key={navItem.id}
                    type="button"
                    onClick={() => setCatalogSection(navItem.id)}
                    className={`h-[60px] flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-[#E11D48] text-white font-semibold'
                        : 'border-transparent text-zinc-400 hover:text-white'
                    }`}
                  >
                    {navItem.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Zone 3: View Mode Toggle + Mi Perfil Hub + Invite + Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ViewModeSwitchButton
              effectiveView={effectiveView}
              onToggle={toggleViewMode}
              lang={lang}
              compact
            />

            <CloudAccountButton
              user={authUser}
              authLoading={authLoading}
              displayName={profile.name}
              lang={lang}
              onSignIn={handleGoogleSignIn}
              onSignOut={handleGoogleSignOut}
              onOpenProfileHub={() => {
                setProfileHubTab('history');
                setProfileHubOpen(true);
              }}
              compact
            />

            <PWAInstallButton lang={lang} compact />

            <button
              type="button"
              onClick={handleShareOrCopyHeaderInvite}
              className="min-h-[40px] px-2.5 sm:px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-95 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all shadow-md shadow-[#E11D48]/25"
            >
              {copiedHeaderInvite ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t.copied}</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className={isDesktopLayout ? 'inline' : 'hidden sm:inline'}>
                    {t.invite}
                  </span>
                </>
              )}
            </button>

            {isDesktopLayout && (
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="w-10 h-10 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] flex items-center justify-center text-zinc-300 cursor-pointer transition-colors"
                title={sidebarOpen ? 'Ocultar chat lateral' : 'Mostrar chat lateral'}
                aria-label="Alternar panel lateral"
              >
                {sidebarOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="w-9 h-10 sm:w-auto sm:px-3 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] text-xs font-medium text-zinc-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              title={t.leaveRoom}
              aria-label={t.leaveRoom}
            >
              <LogOut className="w-4 h-4" />
              {isDesktopLayout && <span>{t.leaveRoom}</span>}
            </button>
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
            className={`flex-1 min-h-0 min-w-0 flex flex-col ${
              isDesktopLayout ? 'overflow-y-auto' : 'overflow-hidden'
            }`}
          >
            {/* SINGLE NATIVE CINEMA PLAYER INSTANCE (z-50 IN MODO CINE SO VIDEO STANDS ABOVE bg-black/80!) */}
            <div
              className={
                isDockedMini
                  ? `fixed ${
                      isDesktopLayout ? 'bottom-5 right-5 w-[340px]' : 'bottom-[66px] right-3 w-[256px]'
                    } z-40 transition-all duration-200`
                  : `shrink-0 w-full min-w-0 ${
                      showCinemaOverlay ? 'relative z-50' : ''
                    } ${
                      isPlayerActive
                        ? isDesktopLayout
                          ? 'block max-w-[1200px] mx-auto px-6 pt-5'
                          : 'block border-b border-white/[0.08]'
                        : isDesktopLayout
                        ? 'block max-w-[1200px] mx-auto px-6 pt-5'
                        : 'hidden'
                    }`
              }
            >
              <div
                className={
                  isDockedMini
                    ? ''
                    : showCinemaOverlay
                    ? isDesktopLayout
                      ? 'rounded-2xl ring-1 ring-white/20 shadow-[0_28px_110px_rgba(0,0,0,0.98)]'
                      : 'ring-1 ring-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.95)]'
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
                  isMinimized={isDockedMini}
                  onToggleMinimize={() => {
                    setIsPlayerMinimized((prev) => {
                      const next = !prev;
                      if (next) {
                        setCinemaModePersist(false);
                      } else {
                        mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                      return next;
                    });
                  }}
                  onClosePlayer={handleClosePlayer}
                  onOpenCatalogSection={(sec) => {
                    setCatalogSection(sec);
                    if (sec === 'movies' || sec === 'series') setMobileTab('movies');
                    else if (sec === 'sports') setMobileTab('sports');
                    else if (sec === 'youtube') setMobileTab('youtube');
                  }}
                />
              </div>
            </div>

            {/* Mobile Chat / Room View */}
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
                  initialView={mobileTab === 'room' ? 'room' : 'chat'}
                  hideInternalTabs
                  onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
                  onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
                  onTransferHost={(newId) => socketService.transferHost(newId)}
                  onUpdateProfile={handleUpdateProfile}
                />
              </div>
            )}

            {/* Scrollable Catalog Hub */}
            <div
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
              <div className="w-full min-w-0 max-w-[1200px] mx-auto space-y-4 pb-6">
                {/* Instant "Continue Where You Left Off + Room / Profile Quick Bar" when idle */}
                {!isPlayerActive && latestHistoryEntry && (
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-[#11131B] border border-white/[0.1] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {latestHistoryEntry.poster ? (
                        <img
                          src={latestHistoryEntry.poster}
                          alt={latestHistoryEntry.title}
                          referrerPolicy="no-referrer"
                          className="w-11 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-[#FB7185]">
                          {lang === 'es'
                            ? 'Seguir donde lo dejaste'
                            : 'Pick up where you left off'}
                        </div>
                        <div className="font-display font-bold text-sm sm:text-base text-white truncate">
                          {latestHistoryEntry.title}
                        </div>
                        <div className="text-xs text-zinc-400 truncate">
                          {latestHistoryEntry.subtitle}
                          {latestHistoryEntry.resumeTimeSec &&
                          latestHistoryEntry.resumeTimeSec > 5
                            ? ` · ${formatBannerClock(latestHistoryEntry.resumeTimeSec)}`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          handleReplayHistoryItem(latestHistoryEntry, false);
                        }}
                        className="min-h-[40px] px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {latestHistoryEntry.resumeTimeSec &&
                          latestHistoryEntry.resumeTimeSec > 5
                            ? lang === 'es'
                              ? `Seguir en ${formatBannerClock(
                                  latestHistoryEntry.resumeTimeSec
                                )}`
                              : `Resume ${formatBannerClock(
                                  latestHistoryEntry.resumeTimeSec
                                )}`
                            : lang === 'es'
                            ? 'Continuar viendo'
                            : 'Continue watching'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setProfileHubTab('history');
                          setProfileHubOpen(true);
                        }}
                        className="min-h-[40px] px-3 rounded-xl bg-[#191C28] hover:bg-[#232838] border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>{lang === 'es' ? 'Mi Perfil' : 'My Profile'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          handleCreateFreshRoom();
                        }}
                        title={
                          lang === 'es'
                            ? 'Crear otra sala nueva'
                            : 'Create a fresh room'
                        }
                        className="min-h-[40px] px-3 rounded-xl bg-[#191C28] hover:bg-[#232838] border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="hidden sm:inline">
                          {lang === 'es' ? 'Otra sala' : 'New room'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* If user closed their local player while friends are still watching in room */}
                {isPlayerClosedLocally && videoState.mode !== 'idle' && (
                  <div className="p-3.5 rounded-2xl bg-[#11131B] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-[#38BDF8]">
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
                        className="min-h-[38px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{lang === 'es' ? 'Volver a abrir' : 'Reopen'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStopRoomPlaybackForEveryone}
                        className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/12 text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>{lang === 'es' ? 'Detener sala' : 'Stop room'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {extractionError && !isPlayerActive && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-2">
                    <span>{extractionError}</span>
                    <button
                      type="button"
                      onClick={() => setExtractionError(null)}
                      className="text-rose-300 font-semibold px-2 py-1 cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                )}

                <MediaCatalogHub
                  activeSection={catalogSection}
                  onChangeSection={(sec) => {
                    setCatalogSection(sec);
                    if (sec === 'movies' || sec === 'vose' || sec === 'series') {
                      setMobileTab('movies');
                    } else if (sec === 'sports') {
                      setMobileTab('sports');
                    } else if (sec === 'youtube' || sec === 'direct') {
                      setMobileTab('youtube');
                    }
                  }}
                  lang={lang}
                  userName={currentUser.name}
                  activeVideoRawUrl={videoState.rawSourceUrl}
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
                  onPlayYouTubeVideo={handlePlayYouTubeVideo}
                  onPlayCustomUrl={handlePlayCustomUrl}
                  onOpenCloudBrowser={handleOpenCloudBrowser}
                  onAddToQueue={handleAddToQueue}
                  onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
                  onPlayQueueItem={handlePlayQueueItem}
                />
              </div>
            </div>
          </div>

          {/* Desktop Right Party Sidebar */}
          {isDesktopLayout && sidebarOpen && (
            <div className="flex w-[350px] xl:w-[376px] shrink-0 h-full">
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
                onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
                onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
                onTransferHost={(newId) => socketService.transferHost(newId)}
                onUpdateProfile={handleUpdateProfile}
              />
            </div>
          )}
        </div>

        {/* Fixed Ergonomic Mobile Bottom Tab Bar (Shown whenever Mobile View is active) */}
        {!isDesktopLayout && (
          <nav
            className="shrink-0 bg-[#11131B]/95 backdrop-blur-md border-t border-white/[0.08] px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] grid grid-cols-5 z-30"
            aria-label="Navegación móvil NAIM CINE"
          >
            {(
              [
                {
                  id: 'movies',
                  label: lang === 'es' ? 'Cine · Series' : 'Cinema · TV',
                  icon: Film,
                  onSelect: () => {
                    setMobileTab('movies');
                    if (
                      catalogSection !== 'movies' &&
                      catalogSection !== 'vose' &&
                      catalogSection !== 'series'
                    ) {
                      setCatalogSection('movies');
                    }
                  },
                },
                {
                  id: 'sports',
                  label: lang === 'es' ? 'Fútbol' : 'Sports',
                  icon: Trophy,
                  onSelect: () => {
                    setMobileTab('sports');
                    setCatalogSection('sports');
                  },
                },
                {
                  id: 'youtube',
                  label: 'YouTube',
                  icon: Youtube,
                  badge: roomQueue.length || undefined,
                  onSelect: () => {
                    setMobileTab('youtube');
                    setCatalogSection('youtube');
                  },
                },
                {
                  id: 'chat',
                  label: t.tabChat,
                  icon: MessageSquare,
                  badge: unreadChatCount || undefined,
                  onSelect: () => {
                    setMobileTab('chat');
                    setUnreadChatCount(0);
                  },
                },
                {
                  id: 'room',
                  label: `${t.tabRoom} (${participants.length})`,
                  icon: Users,
                  onSelect: () => {
                    setMobileTab('room');
                  },
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = mobileTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    item.onSelect();
                  }}
                  className={`min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-1 relative transition-colors cursor-pointer ${
                    active ? 'text-[#FB7185]' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {active && (
                    <span className="absolute top-0 w-6 h-0.5 rounded-full bg-[#E11D48]" />
                  )}
                  <div className="relative">
                    <Icon className="w-[21px] h-[21px]" />
                    {'badge' in item && item.badge ? (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E11D48] text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

export default App;
