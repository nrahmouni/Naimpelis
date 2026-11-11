import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  ChatMessage,
  CloudBrowserState,
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
  getRecentRooms,
  getStoredProfile,
  getWatchHistory,
  removeWatchHistoryItem,
  saveStoredProfile,
  StoredProfile,
  wasGuestPopupDismissed,
} from './utils/storage';
import { socketService } from './services/socket';
import { playCinemaSound, triggerHaptic } from './utils/haptics';
import { buildShortInviteUrl, parseRoomFromWindow } from './utils/shortLink';
import { NaimBrandLogo } from './components/NaimBrandLogo';
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

type MobileNavTab = 'movies' | 'sports' | 'youtube' | 'chat' | 'room';

export function App() {
  const [lang, setLang] = useState<AppLanguage>('es');
  const [profile, setProfile] = useState<StoredProfile>(() => getStoredProfile());
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(() =>
    getWatchHistory()
  );

  const initialRoute = parseRoomFromWindow();
  const initialUrlRoom = initialRoute.roomId;
  const isTvMode = initialRoute.isTvMode;

  // Show Netflix-inspired NAIM CINE Intro on main launch (skip on direct invite link so invited friends enter immediately!)
  const [showIntro, setShowIntro] = useState<boolean>(
    () => !isTvMode && !initialUrlRoom
  );
  const [introWithSound, setIntroWithSound] = useState<boolean>(false);

  const [roomId, setRoomId] = useState<string>(initialUrlRoom);
  const [roomName, setRoomName] = useState<string>(
    initialUrlRoom ? `Sala ${initialUrlRoom.toUpperCase()}` : ''
  );
  const [inRoom, setInRoom] = useState<boolean>(Boolean(initialUrlRoom));

  // Player Minimize (docked corner mini-player while searching) & Local Close state
  const [isPlayerMinimized, setIsPlayerMinimized] = useState<boolean>(false);
  const [isPlayerClosedLocally, setIsPlayerClosedLocally] = useState<boolean>(false);

  // Non-intrusive Guest Welcome Popup when invited via link (/code or ?room=...) with random name
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
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  const t = UI_COPY[lang];

  const currentUser: Participant = {
    id: profile.id,
    name: isTvMode ? `${profile.name} (TV)` : profile.name,
    avatar: isTvMode ? '📺' : profile.avatar,
    color: profile.color,
    isHost: hostId === profile.id,
    joinedAt: Date.now(),
  };

  // Helper to persist a watched movie or TV episode into local Watch History
  const recordStateInWatchHistory = useCallback((vState: VideoState) => {
    if (
      (vState.mode !== 'hls' && vState.mode !== 'direct') ||
      vState.isLive ||
      !vState.url
    ) {
      return;
    }

    if (vState.seriesMeta) {
      const sm = vState.seriesMeta;
      const activeTr = vState.tracks?.[vState.activeTrackIndex];
      const nextHist = addWatchHistoryItem({
        id: `tv-${sm.tmdbId}-${sm.season}-${sm.episode}`,
        mediaType: 'tv',
        tmdbId: sm.tmdbId,
        title: sm.seriesTitle,
        subtitle: `${sm.season}x${String(sm.episode).padStart(2, '0')} · ${sm.episodeTitle || 'Episodio'}`,
        poster: sm.poster || vState.poster || '',
        backdrop: sm.backdrop || vState.backdrop || sm.poster || '',
        season: sm.season,
        episode: sm.episode,
        episodeTitle: sm.episodeTitle,
        preferLang: activeTr?.lang === 'EN' ? 'EN' : 'ES',
      });
      setWatchHistory(nextHist);
    } else if (vState.poster || vState.backdrop) {
      const activeTr = vState.tracks?.[vState.activeTrackIndex];
      const tmdbMatch = vState.rawSourceUrl?.match(/\/(\d+)(?:\/|$)/);
      const parsedTmdbId = tmdbMatch ? Number(tmdbMatch[1]) : undefined;
      const histId = parsedTmdbId
        ? `movie-${parsedTmdbId}`
        : `movie-${vState.rawSourceUrl || vState.title}`;

      const nextHist = addWatchHistoryItem({
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
      });
      setWatchHistory(nextHist);
    }
  }, []);

  useEffect(() => {
    if (!inRoom || !roomId) return;

    const userPayload: Participant = {
      id: profile.id,
      name: isTvMode ? `${profile.name} (TV)` : profile.name,
      avatar: isTvMode ? '📺' : profile.avatar,
      color: profile.color,
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

  const handleClosePlayer = () => {
    triggerHaptic('light');
    setIsPlayerMinimized(false);
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
    const customizedProfile: StoredProfile = { ...nextProfile, isCustomized: true };
    saveStoredProfile(customizedProfile, true);
    setProfile(customizedProfile);
    setShowGuestPopup(false);
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
    setRoomId(targetRoomId);
    setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    setInRoom(true);
    setIntroWithSound(true);
    setShowIntro(true);
  };

  const handleLeaveRoom = () => {
    triggerHaptic('light');
    socketService.disconnect();
    setInRoom(false);
    setShowGuestPopup(false);
    setIsPlayerMinimized(false);
    setIsPlayerClosedLocally(false);
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
  const handlePlayMovie = async (movie: CatalogMovie, preferLang: 'ES' | 'EN') => {
    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(movie.id);
    setExtractionError(null);
    setExtractionLabel(`${movie.title} · Preparando HLS HD...`);

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

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: movie.bingetrixUrl || movie.movidyUrl || movie.id,
        title: movie.title,
        subtitle: `${movie.year || 'HD'} · ${tracks[activeIdx]?.label || preferLang}`,
        poster: movie.poster,
        backdrop: movie.backdrop,
        currentTime: 0,
        isPlaying: true,
        isLive: false,
        tracks,
        activeTrackIndex: activeIdx,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profile.name,
      };

      const nextHist = addWatchHistoryItem({
        id: movie.tmdbId ? `movie-${movie.tmdbId}` : `movie-${movie.id}`,
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
      });
      setWatchHistory(nextHist);

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
    preferLang: 'ES' | 'EN'
  ) => {
    const epLoadId = `tv-${series.tmdbId}-${episode.seasonNumber}-${episode.episodeNumber}`;
    scrollDesktopToPlayer();
    setIsExtracting(true);
    setLoadingItemId(epLoadId);
    setExtractionError(null);
    setExtractionLabel(
      `${series.title} (${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')}) · Preparando HD...`
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

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${series.title} · ${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')}`,
        subtitle: `${episode.title} · ${tracks[activeIdx]?.label || preferLang}`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop,
        currentTime: 0,
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

      const nextHist = addWatchHistoryItem({
        id: epLoadId,
        mediaType: 'tv',
        tmdbId: series.tmdbId,
        title: series.title,
        subtitle: `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')} · ${episode.title}`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop || series.poster,
        year: series.year,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        episodeTitle: episode.title,
        preferLang,
      });
      setWatchHistory(nextHist);

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

  const handleReplayHistoryItem = async (item: WatchHistoryItem) => {
    if (item.mediaType === 'tv' && item.tmdbId && item.season && item.episode) {
      const epLoadId = `tv-${item.tmdbId}-${item.season}-${item.episode}`;
      scrollDesktopToPlayer();
      setIsExtracting(true);
      setLoadingItemId(item.id);
      setExtractionError(null);
      setExtractionLabel(
        `${item.title} (${item.season}x${String(item.episode).padStart(2, '0')}) · Reanudando...`
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

        const nextState: VideoState = {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          rawSourceUrl: epLoadId,
          title: `${item.title} · ${item.season}x${String(item.episode).padStart(2, '0')}`,
          subtitle: item.episodeTitle || tracks[activeIdx]?.label || item.preferLang,
          poster: item.poster,
          backdrop: item.backdrop || item.poster,
          currentTime: 0,
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

        setWatchHistory(
          addWatchHistoryItem({
            ...item,
          })
        );
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
      item.preferLang || 'ES'
    );
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
      `${meta.seriesTitle} (${nextSeason}x${String(nextEp).padStart(2, '0')}) · Siguiente episodio...`
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

      const epLoadId = `tv-${meta.tmdbId}-${nextSeason}-${nextEp}`;
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

      setWatchHistory(
        addWatchHistoryItem({
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
        })
      );

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

  const handlePlayYouTubeVideo = (item: YouTubeSearchItem) => {
    scrollDesktopToPlayer();
    setExtractionError(null);
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
      avatar: nextAvatar,
      color: nextColor,
      isCustomized: true,
    };
    saveStoredProfile(updated, true);
    setProfile(updated);
    setShowGuestPopup(false);
    socketService.updateProfile(profile.id, nextName, nextAvatar, nextColor);
  };

  const handleDismissGuestPopup = () => {
    dismissGuestPopupForRoom(roomId);
    setShowGuestPopup(false);
  };

  // ============================================================================
  // RENDER 1: LOBBY SCREEN (+ KINEMATIC NAIM CINE INTRO)
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
      <div className="w-screen h-dvh bg-black overflow-hidden">
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

  // ============================================================================
  // RENDER 3: UNIFIED SINGLE-PLAYER MOBILE-FIRST + 1440PX DESKTOP WORKSPACE
  // ============================================================================
  return (
    <div className="h-dvh w-full bg-[#090A0F] text-[#F4F5F8] flex flex-col overflow-hidden pt-safe animate-room-warp">
      <OfflineIndicator lang={lang} />
      <PWAInstallNotification lang={lang} />

      {showIntro && (
        <NaimcineIntro
          withSound={introWithSound}
          subtitle={roomName ? `Entrando a ${roomName}` : undefined}
          onComplete={() => setShowIntro(false)}
        />
      )}

      {/* Non-intrusive Guest Welcome Card when entering via invite link */}
      {showGuestPopup && !showIntro && (
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

      {/* Strict 3-Zone Top Bar (52px Mobile / 60px Desktop) */}
      <header className="h-[52px] lg:h-[60px] px-3 sm:px-6 bg-[#090A0F]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 z-30">
        {/* Zone 1: Flat Professional NAIM CINE Emblem & Room Name */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIntroWithSound(true);
              setShowIntro(true);
            }}
            title="NAIM CINE"
            className="shrink-0 cursor-pointer rounded-xl overflow-hidden shadow-[0_0_20px_rgba(225,29,72,0.22)]"
          >
            <NaimBrandLogo size={34} />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-display font-bold text-xs sm:text-sm tracking-[0.12em] text-white leading-tight truncate">
              NAIM <span className="text-[#E11D48]">CINE</span>
              <span className="text-zinc-500 font-normal mx-1.5 hidden sm:inline">·</span>
              <span className="font-semibold text-zinc-200 tracking-normal hidden sm:inline">
                {roomName || `Sala ${roomId.toUpperCase()}`}
              </span>
            </span>
            <span className="text-[10px] text-zinc-400 sm:hidden truncate max-w-[125px] font-mono">
              #{roomId}
            </span>
          </div>
        </div>

        {/* Zone 2: Clean Single-Line Text Navigation Links (Desktop lg+) */}
        <nav
          className="hidden lg:flex items-center gap-6 text-sm font-medium"
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
                label: `${t.tabDirect}${roomQueue.length ? ` (${roomQueue.length})` : ''}`,
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

        {/* Zone 3: Install App + Primary Short Invite CTA + Essential Room Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton lang={lang} compact />

          <button
            type="button"
            onClick={handleShareOrCopyHeaderInvite}
            className="min-h-[40px] px-3 sm:px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-95 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all shadow-md shadow-[#E11D48]/25"
          >
            {copiedHeaderInvite ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{t.copied}</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>{t.invite}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden lg:flex w-10 h-10 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] items-center justify-center text-zinc-300 cursor-pointer transition-colors"
            title={sidebarOpen ? 'Modo Teatro' : 'Mostrar Chat'}
            aria-label="Alternar panel lateral"
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={handleLeaveRoom}
            className="w-10 h-10 sm:w-auto sm:px-3 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] text-xs font-medium text-zinc-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            title={t.leaveRoom}
            aria-label={t.leaveRoom}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{t.leaveRoom}</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Workspace (Single Mounted Player Instance!) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <div
          ref={mainScrollRef}
          className="flex-1 min-h-0 flex flex-col overflow-hidden lg:overflow-y-auto"
        >
          {/* SINGLE NATIVE CINEMA PLAYER INSTANCE (EXPANDED OR FLOATING MINI-PLAYER) */}
          <div
            className={
              isDockedMini
                ? 'fixed bottom-[66px] lg:bottom-5 right-3 sm:right-5 z-40 w-[256px] sm:w-[340px] transition-all duration-200'
                : `shrink-0 w-full ${
                    isPlayerActive
                      ? 'block border-b border-white/[0.08] lg:border-none'
                      : 'hidden lg:block'
                  } lg:max-w-[1200px] lg:mx-auto lg:px-6 lg:pt-5`
            }
          >
            <div
              className={
                isDockedMini
                  ? ''
                  : 'lg:rounded-3xl lg:shadow-[0_20px_70px_rgba(225,29,72,0.12)]'
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
                isMinimized={isDockedMini}
                onToggleMinimize={() => {
                  setIsPlayerMinimized((prev) => {
                    const next = !prev;
                    if (!next) {
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
          <div
            className={`lg:hidden flex-1 min-h-0 ${
              mobileTab === 'chat' || mobileTab === 'room' ? 'flex flex-col' : 'hidden'
            }`}
          >
            <PartySidebar
              roomId={roomId}
              currentUser={currentUser}
              hostId={hostId}
              participants={participants}
              messages={messages}
              lang={lang}
              initialView={mobileTab === 'room' ? 'room' : 'chat'}
              hideInternalTabs
              onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
              onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
              onTransferHost={(newId) => socketService.transferHost(newId)}
              onUpdateProfile={handleUpdateProfile}
            />
          </div>

          {/* Scrollable Catalog Hub */}
          <div
            className={`flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-visible px-3.5 sm:px-6 py-4 sm:py-6 ${
              mobileTab === 'chat' || mobileTab === 'room' ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="max-w-[1200px] mx-auto space-y-4 pb-6">
              {/* If user closed their local player while friends are still watching in room */}
              {isPlayerClosedLocally && videoState.mode !== 'idle' && (
                <div className="p-3.5 rounded-2xl bg-[#12141D] border border-white/12 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
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
                <div className="lg:hidden p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-2">
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
                onPlayMovie={handlePlayMovie}
                onPlaySeriesEpisode={handlePlaySeriesEpisode}
                onReplayHistoryItem={handleReplayHistoryItem}
                onRemoveHistoryItem={(id) => setWatchHistory(removeWatchHistoryItem(id))}
                onClearHistory={() => setWatchHistory(clearWatchHistory())}
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
        {sidebarOpen && (
          <div className="hidden lg:flex w-[350px] xl:w-[376px] shrink-0 h-full">
            <PartySidebar
              roomId={roomId}
              currentUser={currentUser}
              hostId={hostId}
              participants={participants}
              messages={messages}
              lang={lang}
              onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
              onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
              onTransferHost={(newId) => socketService.transferHost(newId)}
              onUpdateProfile={handleUpdateProfile}
            />
          </div>
        )}
      </div>

      {/* Fixed Ergonomic Mobile Thumb-Zone Bottom Tab Bar (5 Tabs <=15% sticky budget) */}
      <nav
        className="lg:hidden shrink-0 bg-[#12141D]/95 backdrop-blur-md border-t border-white/[0.08] px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] grid grid-cols-5 z-30"
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
    </div>
  );
}

export default App;
