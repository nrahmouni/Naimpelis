import { useCallback, useRef, useState } from 'react';
import { socketService } from '../services/socket';
import { triggerHaptic } from '../utils/haptics';
import { INITIAL_VIDEO_STATE } from '../utils/appSessionHelpers';
import type { LanguageNoticePopup, VideoState } from '../types';
import type {
  PlaybackCoreContext,
  PreExtractionSnapshot,
  UsePlaybackOrchestratorOptions,
} from './playback/playbackTypes';
import { useWatchHistorySync } from './playback/useWatchHistorySync';
import { useVodAndCatalaPlayback } from './playback/useVodAndCatalaPlayback';
import { useLiveAndQueuePlayback } from './playback/useLiveAndQueuePlayback';

export type { UsePlaybackOrchestratorOptions } from './playback/playbackTypes';

export function usePlaybackOrchestrator(opts: UsePlaybackOrchestratorOptions) {
  const {
    sessionMode,
    profileName,
    canChangeMedia,
    canControlRoom,
    hostId,
    participants,
    isNestedSandboxFrame,
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
    activeMovieContextRef,
    setActiveMovieContext,
    setSecondaryStream,
    showHostLockNotice,
  } = opts;

  const [extractionLabel, setExtractionLabel] = useState<string>('');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [languageNotice, setLanguageNotice] = useState<LanguageNoticePopup | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const langNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractionReqSeqRef = useRef<number>(0);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const preExtractionSnapshotRef = useRef<PreExtractionSnapshot | null>(null);

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
    if (!snap || snap.videoState.mode === 'idle') {
      optsRef.current.onRestorePlaybackOrigin?.({ reason: 'cancel' });
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

  const {
    livePlaybackSec,
    getLivePlaybackSec,
    activeHistoryIdRef,
    findSavedResumeSec,
    recordStateInWatchHistory,
    handlePlayerProgressUpdate,
  } = useWatchHistorySync({
    isNestedSandboxFrame,
    videoStateRef,
    watchHistoryRef,
    setWatchHistory,
  });

  const commitVideoStateSync = useCallback(
    (action: 'play' | 'pause' | 'seek' | 'change_url', nextState: VideoState) => {
      if (sessionMode === 'solo') return;
      socketService.syncVideoState(action, nextState, profileName);
    },
    [sessionMode, profileName]
  );

  const handleClosePlayer = useCallback(() => {
    const o = optsRef.current;
    triggerHaptic('light');
    clearExtractionSnapshot();
    o.setIsPlayerMinimized(false);
    o.setCinemaModePersist(false);
    o.setSecondaryStream(null);
    o.setActiveSportsMatch(null);
    o.setActiveMatchDetails(null);
    o.setActiveMovieContext(null);
    if (o.videoStateRef.current.mode === 'cloud' && o.sessionMode !== 'solo') {
      socketService.stopCloudBrowser();
    }
    if (o.sessionMode === 'solo' || (o.participants.length <= 1 && o.canChangeMedia)) {
      const idleNext: VideoState = {
        ...INITIAL_VIDEO_STATE,
        lastUpdated: Date.now(),
        updatedBy: o.profileName,
      };
      o.setVideoState(idleNext);
      o.setIsPlayerClosedLocally(false);
      commitVideoStateSync('change_url', idleNext);
    } else {
      o.setIsPlayerClosedLocally(true);
    }
    o.onRestorePlaybackOrigin?.({ reason: 'close' });
  }, [clearExtractionSnapshot, commitVideoStateSync]);

  const handleStopRoomPlaybackForEveryone = useCallback(() => {
    const o = optsRef.current;
    if (!o.canChangeMedia) {
      const hostName = o.participants.find((p) => p.id === o.hostId)?.name;
      o.showHostLockNotice(hostName);
      return;
    }
    triggerHaptic('medium');
    clearExtractionSnapshot();
    o.setIsPlayerMinimized(false);
    o.setIsPlayerClosedLocally(false);
    o.setCinemaModePersist(false);
    o.setSecondaryStream(null);
    o.setActiveSportsMatch(null);
    o.setActiveMatchDetails(null);
    o.setActiveMovieContext(null);
    const idleNext: VideoState = {
      ...INITIAL_VIDEO_STATE,
      lastUpdated: Date.now(),
      updatedBy: o.profileName,
    };
    o.setVideoState(idleNext);
    commitVideoStateSync('change_url', idleNext);
    o.onRestorePlaybackOrigin?.({ reason: 'close' });
  }, [clearExtractionSnapshot, commitVideoStateSync]);

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
        commitVideoStateSync(action, updated);
        return updated;
      });
    },
    [
      canChangeMedia,
      canControlRoom,
      participants,
      hostId,
      showHostLockNotice,
      profileName,
      setVideoState,
      commitVideoStateSync,
    ]
  );

  const coreCtx: PlaybackCoreContext = {
    opts,
    extractionReqSeqRef,
    activeHistoryIdRef,
    beginMediaExtraction,
    clearExtractionSnapshot,
    showLanguageNotice,
    setExtractionLabel,
    setExtractionError,
    setLoadingItemId,
    findSavedResumeSec,
    commitVideoStateSync,
  };

  const vodHandlers = useVodAndCatalaPlayback(coreCtx);
  const liveHandlers = useLiveAndQueuePlayback(coreCtx, {
    handlePlayMovie: vodHandlers.handlePlayMovie,
    handleReplayHistoryItem: vodHandlers.handleReplayHistoryItem,
    handlePlayYouTubeVideo: vodHandlers.handlePlayYouTubeVideo,
  });

  const combinedHandlersRef = useRef({ ...vodHandlers, ...liveHandlers });
  combinedHandlersRef.current = { ...vodHandlers, ...liveHandlers };

  const stablePlayMovie = useCallback(
    (...args: Parameters<typeof vodHandlers.handlePlayMovie>) =>
      combinedHandlersRef.current.handlePlayMovie(...args),
    []
  );
  const stablePlaySeriesEpisode = useCallback(
    (...args: Parameters<typeof vodHandlers.handlePlaySeriesEpisode>) =>
      combinedHandlersRef.current.handlePlaySeriesEpisode(...args),
    []
  );
  const stableReplayHistoryItem = useCallback(
    (...args: Parameters<typeof vodHandlers.handleReplayHistoryItem>) =>
      combinedHandlersRef.current.handleReplayHistoryItem(...args),
    []
  );
  const stablePlayFromProfileCatalog = useCallback(
    (...args: Parameters<typeof vodHandlers.handlePlayFromProfileCatalog>) =>
      combinedHandlersRef.current.handlePlayFromProfileCatalog(...args),
    []
  );
  const stablePlayCatalaEpisode = useCallback(
    (...args: Parameters<typeof vodHandlers.handlePlayCatalaEpisode>) =>
      combinedHandlersRef.current.handlePlayCatalaEpisode(...args),
    []
  );
  const stablePlayYouTubeVideo = useCallback(
    (...args: Parameters<typeof vodHandlers.handlePlayYouTubeVideo>) =>
      combinedHandlersRef.current.handlePlayYouTubeVideo(...args),
    []
  );
  const stablePlaySportsMatch = useCallback(
    (...args: Parameters<typeof liveHandlers.handlePlaySportsMatch>) =>
      combinedHandlersRef.current.handlePlaySportsMatch(...args),
    []
  );
  const stablePlayTdtChannel = useCallback(
    (...args: Parameters<typeof liveHandlers.handlePlayTdtChannel>) =>
      combinedHandlersRef.current.handlePlayTdtChannel(...args),
    []
  );
  const stablePlayFavoriteChannel = useCallback(
    (...args: Parameters<typeof liveHandlers.handlePlayFavoriteChannel>) =>
      combinedHandlersRef.current.handlePlayFavoriteChannel(...args),
    []
  );
  const stableSelectTrack = useCallback(
    (...args: Parameters<typeof liveHandlers.handleSelectTrack>) =>
      combinedHandlersRef.current.handleSelectTrack(...args),
    []
  );
  const stablePlayQueueItem = useCallback(
    (...args: Parameters<typeof liveHandlers.handlePlayQueueItem>) =>
      combinedHandlersRef.current.handlePlayQueueItem(...args),
    []
  );
  const stablePlayCustomUrl = useCallback(
    (...args: Parameters<typeof liveHandlers.handlePlayCustomUrl>) =>
      combinedHandlersRef.current.handlePlayCustomUrl(...args),
    []
  );
  const stablePlaySecondaryChannel = useCallback(
    (...args: Parameters<typeof liveHandlers.handlePlaySecondaryChannel>) =>
      combinedHandlersRef.current.handlePlaySecondaryChannel(...args),
    []
  );

  return {
    isExtracting,
    extractionLabel,
    extractionError,
    setExtractionError,
    loadingItemId,
    languageNotice,
    setLanguageNotice,
    livePlaybackSec,
    getLivePlaybackSec,
    clearExtractionSnapshot,
    beginMediaExtraction,
    handleCancelMediaExtraction,
    recordStateInWatchHistory,
    handlePlayerProgressUpdate,
    handleClosePlayer,
    handleStopRoomPlaybackForEveryone,
    handleSyncPlayerAction,
    ...vodHandlers,
    ...liveHandlers,
    handlePlayMovie: stablePlayMovie,
    handlePlaySeriesEpisode: stablePlaySeriesEpisode,
    handleReplayHistoryItem: stableReplayHistoryItem,
    handlePlayFromProfileCatalog: stablePlayFromProfileCatalog,
    handlePlayCatalaEpisode: stablePlayCatalaEpisode,
    handlePlayYouTubeVideo: stablePlayYouTubeVideo,
    handlePlaySportsMatch: stablePlaySportsMatch,
    handlePlayTdtChannel: stablePlayTdtChannel,
    handlePlayFavoriteChannel: stablePlayFavoriteChannel,
    handleSelectTrack: stableSelectTrack,
    handlePlayQueueItem: stablePlayQueueItem,
    handlePlayCustomUrl: stablePlayCustomUrl,
    handlePlaySecondaryChannel: stablePlaySecondaryChannel,
  };
}
