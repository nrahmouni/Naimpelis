import React from 'react';
import { socketService } from '../../services/socket';
import type { VideoState } from '../../types';
import type { StreamRefreshPhase } from './playerTypes';
import { shouldAdvanceEpisodeOnEnded } from './playerAutoNextGuard';

interface UsePlayerVideoCallbacksParams {
  videoState: VideoState;
  isTvMode: boolean;
  isExtracting: boolean;
  playbackSpeed: number;
  currentTime: number;
  activeSubId: string;
  autoNextCancelledForUrl: string;
  cloudUrlInput: string;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  autoNextTriggeredUrlRef: React.MutableRefObject<string>;
  latestCurrentTimeRef: React.MutableRefObject<number>;
  showControlsRef: React.MutableRefObject<boolean>;
  lastProgressEmitRef: React.MutableRefObject<number>;
  bufferingDelayTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  controlsTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  qoeStartupSentForUrlRef: React.MutableRefObject<string>;
  streamLoadStartRef: React.MutableRefObject<number>;
  rebufferCountRef: React.MutableRefObject<number>;
  setAutoNextCountdown: (n: number | null) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setIsBuffering: (b: boolean) => void;
  setStreamRefreshPhase?: (phase: StreamRefreshPhase) => void;
  setLocalPlaying: (p: boolean) => void;
  setStreamError: (err: string | null) => void;
  setShowControls: (s: boolean) => void;
  setIsMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  clearBufferingIndicator: () => void;
  scheduleHideControls: () => void;
  onVideoEnded?: () => void;
  onNextEpisode?: () => void;
  canControlRoom: boolean;
  onProgressUpdate?: (currentTime: number, duration: number) => void;
}

export function usePlayerVideoCallbacks(p: UsePlayerVideoCallbacksParams) {
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (p.playbackSpeed !== 1) {
      e.currentTarget.playbackRate = p.playbackSpeed;
    }
  };

  const onEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget || p.videoRef.current;
    const domCurrentTime = vid && Number.isFinite(vid.currentTime) ? vid.currentTime : 0;
    const domDuration = vid && Number.isFinite(vid.duration) ? vid.duration : 0;
    if (p.videoState.url && domDuration >= 10 && domCurrentTime >= domDuration - 10) {
      p.onVideoEnded?.();
    }
    if (
      shouldAdvanceEpisodeOnEnded({
        hasSeriesMeta: Boolean(p.videoState.seriesMeta),
        hasNextEpisode: Boolean(p.onNextEpisode),
        isLive: Boolean(p.videoState.isLive),
        isExtracting: p.isExtracting,
        canControlRoom: p.canControlRoom,
        videoMode: p.videoState.mode,
        videoUrl: p.videoState.url,
        autoNextCancelledForUrl: p.autoNextCancelledForUrl,
        autoNextTriggeredForUrl: p.autoNextTriggeredUrlRef.current,
        domCurrentTime,
        domDuration,
      })
    ) {
      p.autoNextTriggeredUrlRef.current = p.videoState.url;
      p.setAutoNextCountdown(null);
      p.onNextEpisode?.();
    }
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const ct = e.currentTarget.currentTime;
    const dur = e.currentTarget.duration || 0;
    const advanced = Math.abs(ct - p.latestCurrentTimeRef.current) >= 0.03;
    p.latestCurrentTimeRef.current = ct;
    if (!e.currentTarget.paused && (advanced || e.currentTarget.readyState >= 3)) {
      p.clearBufferingIndicator();
    }
    if (
      !p.videoState.isLive &&
      (p.showControlsRef.current || p.activeSubId !== 'off' || Math.abs(ct - p.currentTime) >= 1)
    ) {
      p.setCurrentTime(ct);
    }
    if (
      p.onProgressUpdate &&
      !p.videoState.isLive &&
      ct > 4 &&
      Date.now() - p.lastProgressEmitRef.current > 5000
    ) {
      p.lastProgressEmitRef.current = Date.now();
      p.onProgressUpdate(ct, dur);
    }
  };

  const handleStallSignal = (immediate: boolean) => {
    const vNow = p.videoRef.current;
    const waitAtTime = vNow ? vNow.currentTime : 0;
    const hasStartedPlayback = Boolean(vNow && ((vNow.currentTime || 0) > 0.25 || vNow.readyState >= 2));

    if (immediate && hasStartedPlayback && p.videoState.isLive && vNow && !vNow.paused) {
      p.setStreamRefreshPhase?.('recovering');
      p.setIsBuffering(true);
    }

    if (p.bufferingDelayTimerRef.current) {
      clearTimeout(p.bufferingDelayTimerRef.current);
    }
    const delayMs = p.videoState.isLive ? (immediate ? 250 : 550) : 1500;
    p.bufferingDelayTimerRef.current = setTimeout(() => {
      const v = p.videoRef.current;
      if (!v || v.paused) return;
      for (let i = 0; i < v.buffered.length; i++) {
        const bStart = v.buffered.start(i);
        const bEnd = v.buffered.end(i);
        if (bStart > v.currentTime && bStart - v.currentTime <= 3.5 && bEnd - bStart >= 0.35) {
          try {
            v.currentTime = bStart + 0.06;
            v.play().catch(() => {});
            return;
          } catch {
            // ignore
          }
        }
      }
      if (Math.abs((v.currentTime || 0) - waitAtTime) < 0.08) {
        if (p.videoState.isLive && ((v.currentTime || 0) > 0.25 || v.readyState >= 2)) {
          p.setStreamRefreshPhase?.('recovering');
        }
        p.setIsBuffering(true);
      } else if (v.readyState < 3) {
        p.setIsBuffering(true);
      }
    }, delayMs);
  };

  const onWaiting = () => {
    handleStallSignal(false);
  };

  const onStalled = () => {
    handleStallSignal(true);
  };

  const onPlaying = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    p.clearBufferingIndicator();
    p.setLocalPlaying(true);
    p.setStreamError(null);
    if (p.videoState.url && p.qoeStartupSentForUrlRef.current !== p.videoState.url) {
      p.qoeStartupSentForUrlRef.current = p.videoState.url;
      const startupMs = Math.max(0, Math.min(60_000, Date.now() - p.streamLoadStartRef.current));
      const activeTrack = p.videoState.tracks?.[p.videoState.activeTrackIndex];
      const v = e.currentTarget;
      const resolution =
        v.videoHeight >= 1080
          ? '1080p'
          : v.videoHeight >= 720
          ? '720p'
          : v.videoHeight > 0
          ? `${v.videoHeight}p`
          : undefined;
      fetch('/api/metrics/qoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: p.isTvMode ? 'smart-tv' : 'web',
          startupMs,
          rebufferCount: p.rebufferCountRef.current,
          resolution,
          stallFailoverUsed: false,
          sourceUrl: activeTrack?.sourceUrl || p.videoState.url,
        }),
      }).catch(() => {});
    }
    if (p.showControlsRef.current) {
      p.scheduleHideControls();
    }
  };

  const onPause = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    p.setLocalPlaying(false);
    if (p.controlsTimeoutRef.current) {
      clearTimeout(p.controlsTimeoutRef.current);
      p.controlsTimeoutRef.current = null;
    }
    p.showControlsRef.current = true;
    p.setShowControls(true);
    if (p.onProgressUpdate && !p.videoState.isLive && e.currentTarget.currentTime > 4) {
      p.lastProgressEmitRef.current = Date.now();
      p.onProgressUpdate(e.currentTarget.currentTime, e.currentTarget.duration || 0);
    }
  };

  const onVolumeChange = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    p.setIsMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
    p.setVolume(e.currentTarget.volume);
  };

  const handleCloudCanvasClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 720);
    socketService.sendCloudBrowserInput({ type: 'click', x, y });
  };

  const handleCloudWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    socketService.sendCloudBrowserInput({ type: 'scroll', deltaY: Math.round(e.deltaY) });
  };

  const handleCloudNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.cloudUrlInput.trim()) return;
    socketService.sendCloudBrowserInput({ type: 'navigate', url: p.cloudUrlInput.trim() });
  };

  return {
    onLoadedMetadata,
    onEnded,
    onTimeUpdate,
    onWaiting,
    onStalled,
    onPlaying,
    onPause,
    onVolumeChange,
    handleCloudCanvasClick,
    handleCloudWheel,
    handleCloudNavigate,
  };
}
