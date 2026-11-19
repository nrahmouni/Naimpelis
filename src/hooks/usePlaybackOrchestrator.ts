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
  };

  const vodHandlers = useVodAndCatalaPlayback(coreCtx);
  const liveHandlers = useLiveAndQueuePlayback(coreCtx, {
    handlePlayMovie: vodHandlers.handlePlayMovie,
    handleReplayHistoryItem: vodHandlers.handleReplayHistoryItem,
    handlePlayYouTubeVideo: vodHandlers.handlePlayYouTubeVideo,
  });

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
    ...vodHandlers,
    ...liveHandlers,
  };
}
