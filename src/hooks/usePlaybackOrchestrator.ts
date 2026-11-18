import React, { useCallback, useRef, useState } from 'react';
import { socketService } from '../services/socket';
import { playCinemaSound, triggerHaptic } from '../utils/haptics';
import {
  addWatchHistoryItem,
  canonicalizeHistoryItemId,
  sanitizeItemKey,
  updateWatchHistoryProgress,
} from '../utils/storage';
import {
  updateCloudWatchProgressOnly,
  upsertCloudWatchHistory,
} from '../services/userCloudSync';
import { INITIAL_VIDEO_STATE, isAbortError } from '../utils/appSessionHelpers';
import type { ActiveMovieContext } from '../components/MoviePlaybackDock';
import type { ActiveSportsMatchMeta } from './useLiveSportsMatchDetails';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import type {
  AppLanguage,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  CatalogMovie,
  CloudBrowserState,
  FavoriteChannelItem,
  FootballMatchDetails,
  LanguageNoticePopup,
  Participant,
  PlaybackEngineMode,
  RoomQueueItem,
  SecondaryStreamState,
  SpanishTdtChannel,
  SportsMatch,
  StreamTrack,
  TvEpisodeItem,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../types';

interface UsePlaybackOrchestratorOptions {
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
  setCatalogSection: React.Dispatch<React.SetStateAction<CatalogSection>>;
  setMobileTab: React.Dispatch<React.SetStateAction<MobileNavTab>>;
  showHostLockNotice: (hostDisplayName?: string, reason?: string) => void;
  scrollDesktopToPlayer: () => void;
}

export function usePlaybackOrchestrator(opts: UsePlaybackOrchestratorOptions) {
  const {
    lang,
    profileName,
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
  } = opts;

  const [extractionLabel, setExtractionLabel] = useState<string>('');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [languageNotice, setLanguageNotice] = useState<LanguageNoticePopup | null>(null);
  const [livePlaybackSec, setLivePlaybackSec] = useState<number>(0);

  const langNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeHistoryIdRef = useRef<string | null>(null);
  const lastCloudProgressSyncRef = useRef<number>(0);
  const nextEpPreloadRef = useRef<string>('');
  const extractionReqSeqRef = useRef<number>(0);
  const extractionAbortRef = useRef<AbortController | null>(null);

  const preExtractionSnapshotRef = useRef<{
    videoState: VideoState;
    activeSportsMatch: ActiveSportsMatchMeta | null;
    activeMatchDetails: FootballMatchDetails | null;
    activeMovieContext: ActiveMovieContext | null;
    isPlayerClosedLocally: boolean;
    isPlayerMinimized: boolean;
    isCinemaMode: boolean;
  } | null>(null);

  const showLanguageNotice = useCallback((popup: Omit<LanguageNoticePopup, 'id'>) => {
    if (langNoticeTimerRef.current) clearTimeout(langNoticeTimerRef.current);
    setLanguageNotice({
      ...popup,
      id: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    langNoticeTimerRef.current = setTimeout(() => {
      setLanguageNotice(null);
    }, 5200);
  }, []);

  const clearExtractionSnapshot = useCallback(() => {
    preExtractionSnapshotRef.current = null;
  }, []);

  const beginMediaExtraction = useCallback(() => {
    if (!isExtractingRef.current && !preExtractionSnapshotRef.current) {
      preExtractionSnapshotRef.current = {
        videoState: videoStateRef.current,
        activeSportsMatch: activeSportsMatchRef.current,
        activeMatchDetails: activeMatchDetailsRef.current,
        activeMovieContext: activeMovieContextRef.current,
        isPlayerClosedLocally: isPlayerClosedLocallyRef.current,
        isPlayerMinimized: isPlayerMinimizedRef.current,
        isCinemaMode: isCinemaModeRef.current,
      };
    }
    if (isPlayerClosedLocallyRef.current) {
      setIsPlayerClosedLocally(false);
    }
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
  }, [
    isExtractingRef,
    videoStateRef,
    activeSportsMatchRef,
    activeMatchDetailsRef,
    activeMovieContextRef,
    isPlayerClosedLocallyRef,
    isPlayerMinimizedRef,
    isCinemaModeRef,
    setIsPlayerClosedLocally,
  ]);

  const handleCancelMediaExtraction = useCallback(() => {
    if (extractionAbortRef.current) {
      try {
        extractionAbortRef.current.abort();
      } catch {
        // ignore
      }
      extractionAbortRef.current = null;
    }
    extractionReqSeqRef.current += 1;
    isExtractingRef.current = false;
    setIsExtracting(false);
    setLoadingItemId(null);
    setExtractionError(null);
    setExtractionLabel('');

    const snap = preExtractionSnapshotRef.current;
    preExtractionSnapshotRef.current = null;
    if (snap) {
      videoStateUrlRef.current = snap.videoState.url;
      setVideoState(snap.videoState);
      setActiveSportsMatch(snap.activeSportsMatch);
      setActiveMatchDetails(snap.activeMatchDetails);
      setActiveMovieContext(snap.activeMovieContext);
      setIsPlayerClosedLocally(snap.isPlayerClosedLocally);
      setIsPlayerMinimized(snap.isPlayerMinimized);
      setCinemaModePersist(snap.isCinemaMode);
    }
    triggerHaptic('light');
  }, [
    isExtractingRef,
    setIsExtracting,
    videoStateUrlRef,
    setVideoState,
    setActiveSportsMatch,
    setActiveMatchDetails,
    setActiveMovieContext,
    setIsPlayerClosedLocally,
    setIsPlayerMinimized,
    setCinemaModePersist,
  ]);

  const findSavedResumeSec = useCallback(
    (rawId: string): number => {
      const cleanId = sanitizeItemKey(rawId);
      const match = watchHistoryRef.current.find((h) => sanitizeItemKey(h.id) === cleanId);
      if (!match || !match.resumeTimeSec || match.resumeTimeSec <= 5) return 0;
      return Math.floor(match.resumeTimeSec);
    },
    [watchHistoryRef]
  );

  const recordStateInWatchHistory = useCallback(
    (vState: VideoState) => {
      if ((vState.mode !== 'hls' && vState.mode !== 'direct') || vState.isLive || !vState.url) {
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
        const movidySlugMatch = vState.rawSourceUrl?.match(/movidy\.[a-z]+\/ver\/([^/?#]+)/i);
        const histId = canonicalizeHistoryItemId({
          id: movidySlugMatch
            ? `movidy-${movidySlugMatch[1]}`
            : vState.rawSourceUrl || vState.title,
          mediaType: 'movie',
          tmdbId: parsedTmdbId,
        });
        activeHistoryIdRef.current = histId;

        const isMovidyRaw = vState.rawSourceUrl?.includes('movidy.');
        const isGnulaRaw = vState.rawSourceUrl?.includes('gnulahd.');
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
          gnulaUrl: isGnulaRaw ? vState.rawSourceUrl : undefined,
          bingetrixUrl: isBingetrixRaw ? vState.rawSourceUrl : undefined,
          resumeTimeSec: vState.currentTime > 5 ? Math.floor(vState.currentTime) : undefined,
        });
        setWatchHistory(list);
        upsertCloudWatchHistory(item).catch(() => {});
      }
    },
    [setWatchHistory]
  );

  const handlePlayerProgressUpdate = useCallback(
    (currentTimeSec: number, durationSec: number) => {
      setLivePlaybackSec(Math.max(0, Math.floor(currentTimeSec)));
      const activeId = activeHistoryIdRef.current;
      if (!activeId || currentTimeSec <= 4) return;

      // Pre-resolve next episode in background when < 2 minutes remain for instant transitions
      const vs = videoStateRef.current;
      const meta = vs.seriesMeta;
      if (meta && !vs.isLive && durationSec > 120 && durationSec - currentTimeSec <= 120) {
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
            const activeTrackLang = String(vs.tracks[vs.activeTrackIndex]?.lang || '').toUpperCase();
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

      const { list, updated } = updateWatchHistoryProgress(activeId, currentTimeSec, durationSec);
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
    [isNestedSandboxFrame, videoStateRef, setWatchHistory]
  );

  const handleClosePlayer = () => {
    triggerHaptic('light');
    clearExtractionSnapshot();
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
        updatedBy: profileName,
      };
      setVideoState(idleNext);
      setIsPlayerClosedLocally(false);
      socketService.syncVideoState('change_url', idleNext, profileName);
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
    clearExtractionSnapshot();
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
      updatedBy: profileName,
    };
    setVideoState(idleNext);
    socketService.syncVideoState('change_url', idleNext, profileName);
  };

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
          updatedBy: profileName,
        };
        socketService.syncVideoState(action, updated, profileName);
        return updated;
      });
    },
    [canChangeMedia, canControlRoom, participants, hostId, showHostLockNotice, profileName, setVideoState]
  );

  const handlePlayMovie = async (
    movie: CatalogMovie,
    preferLang: string = 'ES',
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
    const langFullLabelMap: Record<string, string> = {
      ES: 'Castellano (España)',
      CAT: 'Català',
      LAT: 'Español Latino',
      VOSE: 'Subtitulado (VOSE)',
      EN: 'Inglés Original (EN)',
      NL: 'Flamenco (Vlaams)',
      FR: 'Francés (FR)',
      AR: 'Árabe (AR)',
      ZH: 'Chino (中文)',
      RIF: 'Tarifit (Riffian)',
    };
    const requestedLangName = langFullLabelMap[preferLang] || preferLang || 'Español HD';

    const histId = canonicalizeHistoryItemId({
      id: movie.id,
      mediaType: 'movie',
      tmdbId: movie.tmdbId,
    });
    const resumeAtSec =
      startAtOverrideSec !== undefined ? startAtOverrideSec : findSavedResumeSec(histId);

    const { reqSeq, signal } = beginMediaExtraction();

    const isKidsLive =
      movie.id.startsWith('kids-live-') ||
      movie.platform === 'Riffan Kids Live' ||
      (movie.bingetrixUrl && movie.bingetrixUrl.endsWith('.m3u8'));
    if (isKidsLive) {
      const liveStreamUrl = movie.bingetrixUrl || '';
      if (liveStreamUrl) {
        clearExtractionSnapshot();
        const nextState: VideoState = {
          mode: 'hls',
          url: liveStreamUrl,
          rawSourceUrl: liveStreamUrl,
          title: movie.title,
          subtitle: `${movie.year || '2025'} · En Directo HD Kids`,
          poster: movie.poster,
          backdrop: movie.backdrop,
          currentTime: 0,
          isPlaying: true,
          isLive: true,
          tracks: [
            {
              id: 'live-0',
              label: movie.title,
              lang: 'ES',
              sourceUrl: liveStreamUrl,
              resolverType: 'tdt_hls',
              resolvedStreamUrl: liveStreamUrl,
            },
          ],
          activeTrackIndex: 0,
          lastUpdated: Date.now(),
          updatedBy: profileName,
        };
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profileName);
        playCinemaSound('play');
        setIsExtracting(false);
        setLoadingItemId(null);
        return;
      }
    }

    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
    setActiveMovieContext({
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      poster: movie.poster,
      backdrop: movie.backdrop,
      overview: movie.overview,
      preferLang: preferLang as ActiveMovieContext['preferLang'],
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
        url: movie.bingetrixUrl || movie.movidyUrl || movie.gnulaUrl || movie.vestUrl || '',
        movidyUrl: movie.movidyUrl || '',
        gnulaUrl: movie.gnulaUrl || '',
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
        if (movie.platform === 'Riffan Kids' || movie.id.startsWith('kids-showcase-')) {
          const fallbackUrl =
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
          const nextState: VideoState = {
            mode: 'direct',
            url: fallbackUrl,
            rawSourceUrl: fallbackUrl,
            title: movie.title,
            subtitle: `${movie.year || '2025'} · Animación HD Kids`,
            poster: movie.poster,
            backdrop: movie.backdrop,
            currentTime: resumeAtSec,
            isPlaying: true,
            isLive: false,
            tracks: [
              {
                id: 'kids-fallback-0',
                label: movie.title,
                lang: 'ES',
                sourceUrl: fallbackUrl,
                resolverType: 'direct_mp4',
                resolvedStreamUrl: fallbackUrl,
              },
            ],
            activeTrackIndex: 0,
            lastUpdated: Date.now(),
            updatedBy: profileName,
          };
          clearExtractionSnapshot();
          videoStateUrlRef.current = nextState.url;
          setVideoState(nextState);
          socketService.syncVideoState('change_url', nextState, profileName);
          playCinemaSound('play');
          setIsExtracting(false);
          setLoadingItemId(null);
          return;
        }
        const errMsg = data?.error || 'No se pudo cargar esta película en este momento.';
        setExtractionError(errMsg);
        showLanguageNotice({
          type: 'error',
          title: `⚠️ Película no disponible en ${requestedLangName} ahora mismo`,
          subtitle: errMsg,
        });
        return;
      }

      if (data.mode === 'cloud') {
        clearExtractionSnapshot();
        socketService.startCloudBrowser(data.streamUrl, profileName);
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const activeTrack = tracks[activeIdx];
      const activeLabel = activeTrack?.label || data.resolvedLabel || requestedLangName;

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
        rawSourceUrl:
          movie.bingetrixUrl || movie.movidyUrl || movie.gnulaUrl || movie.vestUrl || movie.id,
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
        updatedBy: profileName,
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
        preferLang: preferLang as WatchHistoryItem['preferLang'],
        bingetrixUrl: movie.bingetrixUrl,
        movidyUrl: movie.movidyUrl,
        gnulaUrl: movie.gnulaUrl,
        vestUrl: movie.vestUrl,
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
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
    preferLang: string,
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
      startAtOverrideSec !== undefined ? startAtOverrideSec : findSavedResumeSec(epLoadId);

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
    const optimisticTitle = `${series.title} · ${epCode}${
      episode.title ? ` · ${episode.title}` : ''
    }`;
    const currentSeasonSummary = series.seasons?.find(
      (s) => s.seasonNumber === episode.seasonNumber
    );

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
      url: '',
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
        setExtractionError(data?.error || 'Este episodio aún no tiene señal directa disponible.');
        return;
      }

      if (data.mode === 'cloud') {
        socketService.startCloudBrowser(data.streamUrl, profileName);
        return;
      }

      const tracks: StreamTrack[] = data.tracks || [];
      const activeIdx = Math.max(
        0,
        tracks.findIndex((tr) => tr.resolvedStreamUrl === data.streamUrl)
      );
      const activeEpLabel = tracks[activeIdx]?.label || data.resolvedLabel || preferLang;

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

      activeHistoryIdRef.current = epLoadId;

      const nextState: VideoState = {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        rawSourceUrl: epLoadId,
        title: `${series.title} · ${episode.seasonNumber}x${String(episode.episodeNumber).padStart(
          2,
          '0'
        )}`,
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
          totalEpisodesInSeason: currentSeasonSummary?.episodeCount || series.episodes.length,
          totalSeasons: series.seasons.length,
          poster: series.poster,
          backdrop: series.backdrop,
        },
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };

      const { list, item } = addWatchHistoryItem({
        id: epLoadId,
        mediaType: 'tv',
        tmdbId: series.tmdbId,
        title: series.title,
        subtitle: `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')} · ${
          episode.title
        }`,
        poster: series.poster,
        backdrop: episode.still || series.backdrop || series.poster,
        year: series.year,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        episodeTitle: episode.title,
        preferLang: preferLang as WatchHistoryItem['preferLang'],
        resumeTimeSec: resumeAtSec,
      });
      setWatchHistory(list);
      upsertCloudWatchHistory(item).catch(() => {});

      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
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

  const handleReplayHistoryItem = async (item: WatchHistoryItem, forceRestart = false) => {
    if (!canChangeMedia) {
      showHostLockNotice(participants.find((p) => p.id === hostId)?.name);
      return;
    }
    const resumeAtSec = forceRestart ? 0 : Math.floor(item.resumeTimeSec || 0);

    if (item.mediaType === 'tv' && item.tmdbId && item.season && item.episode) {
      const epLoadId = sanitizeItemKey(`tv-${item.tmdbId}-${item.season}-${item.episode}`);
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
          clearExtractionSnapshot();
          socketService.startCloudBrowser(data.streamUrl, profileName);
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
          updatedBy: profileName,
        };

        const { list, item: updatedHist } = addWatchHistoryItem({
          ...item,
          id: epLoadId,
          resumeTimeSec: resumeAtSec,
        });
        setWatchHistory(list);
        upsertCloudWatchHistory(updatedHist).catch(() => {});

        clearExtractionSnapshot();
        videoStateUrlRef.current = nextState.url;
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profileName);
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
        gnulaUrl: item.gnulaUrl,
        vestUrl: item.vestUrl,
        languages: [],
      },
      item.preferLang || 'ES',
      resumeAtSec
    );
  };

  const handlePlayFromProfileCatalog = async (item: CatalogMovie) => {
    if (item.mediaType === 'tv') {
      const savedSeriesEp = watchHistoryRef.current.find(
        (h) => h.mediaType === 'tv' && h.tmdbId && h.tmdbId === item.tmdbId
      );
      if (savedSeriesEp) {
        await handleReplayHistoryItem(savedSeriesEp, false);
        return;
      }
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

    const { reqSeq, signal } = beginMediaExtraction();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setExtractionError(null);
    setExtractionLabel(
      `${meta.seriesTitle} (${targetSeason}x${String(targetEp).padStart(2, '0')}) · ${
        delta > 0 ? 'Siguiente episodio...' : 'Capítulo anterior...'
      }`
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
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;
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
        updatedBy: profileName,
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

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
      playCinemaSound('play');
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      setExtractionError(
        delta > 0
          ? 'Error al cargar el siguiente episodio.'
          : 'Error al cargar el capítulo anterior.'
      );
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
      }
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
      setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
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
        clearExtractionSnapshot();
        socketService.startCloudBrowser(data.streamUrl, profileName);
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
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
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
      setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
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
          await handlePlayTdtChannel(tdtCh, signalIndex + 1, liveProgramHint, extraction, true);
          return;
        }
        setExtractionError(
          data?.error ||
            `La emisión de ${tdtCh.name} (${chosenSignal.label}) no responde en este instante.`
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
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
      playCinemaSound('play');
    } catch {
      if (signal.aborted || reqSeq !== extractionReqSeqRef.current) return;
      if (allowSameChannelBackup && signalIndex + 1 < tdtCh.channels.length) {
        await handlePlayTdtChannel(tdtCh, signalIndex + 1, liveProgramHint, extraction, true);
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
    setActiveMovieContext(null);
    setVideoState((prev) => (prev.seriesMeta ? { ...prev, seriesMeta: undefined } : prev));
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
    const favResolver: StreamTrack['resolverType'] = isDirectTdtHls ? 'tdt_hls' : 'sports_channel';

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
        clearExtractionSnapshot();
        socketService.startCloudBrowser(favCh.channelUrl, profileName);
        return;
      }

      if (data.mode === 'cloud') {
        clearExtractionSnapshot();
        socketService.startCloudBrowser(data.streamUrl, profileName);
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
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
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
    clearExtractionSnapshot();
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
      updatedBy: profileName,
    };
    videoStateUrlRef.current = nextState.url;
    setVideoState(nextState);
    socketService.syncVideoState('change_url', nextState, profileName);
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
          clearExtractionSnapshot();
          socketService.startCloudBrowser(data.streamUrl, profileName);
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
          tracks: (data.tracks || []).map((t: StreamTrack) => ({ ...t, lang: 'CAT' })),
          activeTrackIndex: 0,
          seriesMeta: undefined,
          lastUpdated: Date.now(),
          updatedBy: profileName,
        };
        clearExtractionSnapshot();
        videoStateUrlRef.current = nextState.url;
        setActiveMovieContext({
          title: series.title,
          poster: series.poster,
          backdrop: series.backdrop || series.poster,
          year: series.year,
          overview: series.overview,
          tmdbId: series.tmdbId,
          preferLang: 'CAT',
        });
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profileName);
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
      clearExtractionSnapshot();
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
            ? episode.tracks.map((t) => ({ ...t, lang: 'CAT' }))
            : [
                {
                  id: `cat-yt-${episode.id}`,
                  label: 'Arxiu Català · YouTube HD',
                  lang: 'CAT',
                  quality: 'HD',
                  sourceUrl: ytId,
                  resolverType: 'youtube',
                  resolvedStreamUrl: ytId,
                },
              ],
        activeTrackIndex: 0,
        seriesMeta: undefined,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };
      videoStateUrlRef.current = nextState.url;
      setActiveMovieContext({
        title: series.title,
        poster: series.poster,
        backdrop: series.backdrop || series.poster,
        year: series.year,
        overview: series.overview,
        tmdbId: series.tmdbId,
        preferLang: 'CAT',
      });
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
      playCinemaSound('play');
      return;
    }

    if (!episode.streamUrl) {
      setExtractionError('Capítol sense flux directe disponible.');
      return;
    }

    beginMediaExtraction();
    clearExtractionSnapshot();
    isExtractingRef.current = false;
    setIsExtracting(false);
    setLoadingItemId(null);

    const tracks: StreamTrack[] =
      Array.isArray(episode.tracks) && episode.tracks.length > 0
        ? episode.tracks.map((t) => ({ ...t, lang: 'CAT' }))
        : [
            {
              id: `cat-direct-${episode.id}`,
              label: 'Català HD · Directe',
              lang: 'CAT',
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
      updatedBy: profileName,
    };

    videoStateUrlRef.current = nextState.url;
    setActiveMovieContext({
      title: series.title,
      poster: series.poster,
      backdrop: series.backdrop || series.poster,
      year: series.year,
      overview: series.overview,
      tmdbId: series.tmdbId,
      preferLang: 'CAT',
    });
    setVideoState(nextState);
    socketService.syncVideoState('change_url', nextState, profileName);
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
      socketService.startCloudBrowser(targetTrack.sourceUrl, profileName);
      return;
    }

    const resumeAt = videoState.isLive ? 0 : resumeTimeSec;

    if (targetTrack.resolvedStreamUrl) {
      beginMediaExtraction();
      clearExtractionSnapshot();
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
        updatedBy: profileName,
      };
      videoStateUrlRef.current = instantState.url;
      setVideoState(instantState);
      socketService.syncVideoState('change_url', instantState, profileName);
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
          const adjustedBackupIdx = sameLangIdx > trackIndex ? sameLangIdx - 1 : sameLangIdx;
          isExtractingRef.current = false;
          setIsExtracting(false);
          setTimeout(() => {
            void handleSelectTrack(adjustedBackupIdx, resumeAt);
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
        updatedBy: profileName,
      };

      clearExtractionSnapshot();
      videoStateUrlRef.current = nextState.url;
      setVideoState(nextState);
      socketService.syncVideoState('change_url', nextState, profileName);
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
    const { reqSeq, signal } = beginMediaExtraction();
    setActiveSportsMatch(null);
    setActiveMatchDetails(null);
    setActiveMovieContext(null);
    scrollDesktopToPlayer();
    setIsExtracting(true);
    isExtractingRef.current = true;
    setLoadingItemId('custom-url');
    setExtractionError(null);
    setExtractionLabel('Analizando enlace y extrayendo flujo limpio...');

    try {
      const params = new URLSearchParams({
        url: rawUrl,
        ...(isNestedSandboxFrame ? { sandboxed: '1' } : {}),
      });
      const res = await fetch(`/api/extract/stream?${params.toString()}`, { signal });
      const data = await res.json();
      if (reqSeq !== extractionReqSeqRef.current) return;

      if (res.ok && data?.success && data?.streamUrl) {
        if (data.mode === 'cloud') {
          clearExtractionSnapshot();
          socketService.startCloudBrowser(data.streamUrl, profileName);
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
          updatedBy: profileName,
        };
        clearExtractionSnapshot();
        videoStateUrlRef.current = nextState.url;
        setVideoState(nextState);
        socketService.syncVideoState('change_url', nextState, profileName);
        playCinemaSound('play');
      } else {
        clearExtractionSnapshot();
        socketService.startCloudBrowser(rawUrl, profileName);
      }
    } catch (err: unknown) {
      if (isAbortError(err) || reqSeq !== extractionReqSeqRef.current) return;
      clearExtractionSnapshot();
      socketService.startCloudBrowser(rawUrl, profileName);
    } finally {
      if (reqSeq === extractionReqSeqRef.current) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setLoadingItemId(null);
      }
    }
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
      void handleReplayHistoryItem(
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
      void handlePlayMovie(
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
          gnulaUrl: qItem.gnulaUrl,
          vestUrl: qItem.vestUrl,
          languages: [],
        },
        qItem.preferLang || 'ES'
      );
    } else if (qItem.url) {
      void handlePlayCustomUrl(qItem.url);
    }
  };

  const handlePlaySecondaryChannel = async (optsArg: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => {
    const mvResolver: StreamTrack['resolverType'] = /\.m3u8(\?|$)/i.test(optsArg.sourceUrl)
      ? 'tdt_hls'
      : 'sports_channel';

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
          competition: optsArg.subtitle || 'Multicanal HD',
          title: optsArg.title,
          channels: [
            {
              id: 'mv-ch-0',
              label: optsArg.title,
              lang: 'ES',
              sourceUrl: optsArg.sourceUrl,
              resolverType: mvResolver,
            },
          ],
        },
        0
      );
      return;
    }

    scrollDesktopToPlayer();
    setLoadingItemId(`mv-${optsArg.sourceUrl}`);
    setExtractionError(null);

    try {
      const params = new URLSearchParams({
        url: optsArg.sourceUrl,
        resolverType: mvResolver,
        title: optsArg.title,
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
        rawSourceUrl: optsArg.sourceUrl,
        title: optsArg.title,
        subtitle: optsArg.subtitle,
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
      updatedBy: profileName,
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
    socketService.syncVideoState('change_url', promotedMain, profileName);
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
      updatedBy: profileName,
    };
    setVideoState(nextState);
    socketService.syncVideoState('change_url', nextState, profileName);
  };

  return {
    isExtracting,
    extractionLabel,
    extractionError,
    setExtractionError,
    loadingItemId,
    languageNotice,
    setLanguageNotice,
    livePlaybackSec,
    clearExtractionSnapshot,
    beginMediaExtraction,
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
  };
}
