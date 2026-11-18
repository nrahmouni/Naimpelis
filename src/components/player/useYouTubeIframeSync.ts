import React, { useEffect } from 'react';
import type { VideoState } from '../../types';
import { socketService } from '../../services/socket';
import type { YouTubePlayerEvent, YouTubePlayerInstance } from './playerTypes';

interface UseYouTubeIframeSyncParams {
  videoState: VideoState;
  ytPlayerRef: React.MutableRefObject<YouTubePlayerInstance | null>;
  ytContainerId: React.MutableRefObject<string>;
  isApplyingRemoteRef: React.MutableRefObject<boolean>;
  smoothDriftTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  syncOffsetMs: number;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  setLocalPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
}

export function useYouTubeIframeSync({
  videoState,
  ytPlayerRef,
  ytContainerId,
  isApplyingRemoteRef,
  smoothDriftTimerRef,
  syncOffsetMs,
  setIsMuted,
  setVolume,
  setLocalPlaying,
  onSyncAction,
}: UseYouTubeIframeSyncParams) {
  useEffect(() => {
    if (videoState.mode !== 'youtube' || !videoState.url) {
      if (ytPlayerRef.current?.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const mountYtPlayer = () => {
      if (cancelled || !window.YT?.Player) return;
      if (ytPlayerRef.current?.loadVideoById) {
        ytPlayerRef.current.loadVideoById(videoState.url, videoState.currentTime || 0);
        try {
          ytPlayerRef.current.unMute?.();
          ytPlayerRef.current.setVolume?.(100);
          setIsMuted(false);
          setVolume(1);
        } catch {
          // ignore
        }
        return;
      }

      ytPlayerRef.current = new window.YT.Player(ytContainerId.current, {
        videoId: videoState.url,
        playerVars: {
          autoplay: 1,
          mute: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: Math.floor(videoState.currentTime || 0),
        },
        events: {
          onReady: (e: YouTubePlayerEvent) => {
            try {
              e.target.unMute?.();
              e.target.setVolume?.(100);
              setIsMuted(false);
              setVolume(1);
            } catch {
              // ignore
            }
            if (videoState.isPlaying) {
              e.target.playVideo();
            } else {
              e.target.pauseVideo();
            }
          },
          onStateChange: (e: YouTubePlayerEvent) => {
            if (e.data === 1) {
              try {
                if (e.target.isMuted?.()) {
                  e.target.unMute?.();
                }
                if ((e.target.getVolume?.() ?? 100) === 0) {
                  e.target.setVolume?.(100);
                }
                setIsMuted(Boolean(e.target.isMuted?.()));
              } catch {
                // ignore
              }
            }
            if (isApplyingRemoteRef.current) return;
            if (e.data === 1) {
              setLocalPlaying(true);
              onSyncAction('play', {
                isPlaying: true,
                currentTime: e.target.getCurrentTime?.() || 0,
              });
            } else if (e.data === 2) {
              setLocalPlaying(false);
              onSyncAction('pause', {
                isPlaying: false,
                currentTime: e.target.getCurrentTime?.() || 0,
              });
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountYtPlayer();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        mountYtPlayer();
      };
    }

    return () => {
      cancelled = true;
    };
  }, [videoState.mode, videoState.url]);

  useEffect(() => {
    if (videoState.mode !== 'youtube' || !ytPlayerRef.current?.getPlayerState) return;
    isApplyingRemoteRef.current = true;
    const yt = ytPlayerRef.current;
    const serverNow = Date.now() + socketService.serverClockOffsetMs;
    const elapsedSec =
      videoState.isPlaying && Number.isFinite(videoState.lastUpdated) && videoState.lastUpdated > 0
        ? Math.max(0, Math.min(12, (serverNow - videoState.lastUpdated) / 1000))
        : 0;
    const expectedTime = videoState.currentTime + elapsedSec + syncOffsetMs / 1000;
    const ytTime = yt.getCurrentTime?.() || 0;
    const signedDrift = expectedTime - ytTime;
    const absDrift = Math.abs(signedDrift);

    if (absDrift > 2.5) {
      yt.setPlaybackRate?.(1);
      yt.seekTo?.(Math.max(0, expectedTime), true);
    } else if (videoState.isPlaying && absDrift >= 0.45 && absDrift <= 2.0) {
      yt.setPlaybackRate?.(signedDrift > 0 ? 1.05 : 0.95);
      if (smoothDriftTimerRef.current) clearTimeout(smoothDriftTimerRef.current);
      smoothDriftTimerRef.current = setTimeout(() => {
        ytPlayerRef.current?.setPlaybackRate?.(1);
      }, 2400);
    } else {
      yt.setPlaybackRate?.(1);
    }

    if (videoState.isPlaying) {
      yt.playVideo?.();
    } else {
      yt.pauseVideo?.();
    }
    const timer = setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [
    videoState.isPlaying,
    videoState.currentTime,
    videoState.lastUpdated,
    videoState.mode,
    syncOffsetMs,
  ]);
}
