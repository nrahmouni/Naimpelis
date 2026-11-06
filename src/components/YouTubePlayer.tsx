import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { VideoState } from '../types';

interface YouTubePlayerApi {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayerApi }) => void;
        onStateChange: (event: { data: number; target: YouTubePlayerApi }) => void;
      };
    }
  ) => YouTubePlayerApi;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubeController {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
}

interface YouTubePlayerProps {
  videoId: string;
  videoState: VideoState;
  isHost: boolean;
  onStateChange: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onProgress: (time: number, duration: number, isPlaying: boolean) => void;
  onController: (controller: YouTubeController | null) => void;
}

let apiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube Player API failed to initialize'));
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube Player API failed to load'));
    };
  });

  return apiPromise;
}

function getTargetTime(state: VideoState) {
  const elapsed = state.isPlaying ? Math.max(0, (Date.now() - state.lastUpdated) / 1000) : 0;
  return Math.max(0, state.currentTime + elapsed);
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  videoState,
  isHost,
  onStateChange,
  onProgress,
  onController,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const videoStateRef = useRef(videoState);
  const isHostRef = useRef(isHost);
  const onStateChangeRef = useRef(onStateChange);
  const onProgressRef = useRef(onProgress);
  const onControllerRef = useRef(onController);
  const [loadError, setLoadError] = useState(false);

  videoStateRef.current = videoState;
  isHostRef.current = isHost;
  onStateChangeRef.current = onStateChange;
  onProgressRef.current = onProgress;
  onControllerRef.current = onController;

  useEffect(() => {
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let previousTime: number | null = null;
    let previousPollAt = 0;
    let lastPlayingState: boolean | null = null;

    loadYouTubeApi()
      .then((youtube) => {
        if (disposed || !mountRef.current) return;
        const player = new youtube.Player(mountRef.current, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: isHostRef.current ? 1 : 0,
            disablekb: isHostRef.current ? 0 : 1,
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (disposed) return;
              playerRef.current = event.target;
              const controller: YouTubeController = {
                play: () => event.target.playVideo(),
                pause: () => event.target.pauseVideo(),
                seekTo: (seconds) => event.target.seekTo(seconds, true),
              };
              onControllerRef.current(controller);
              lastPlayingState = videoStateRef.current.isPlaying;
              const targetTime = getTargetTime(videoStateRef.current);
              if (Math.abs(event.target.getCurrentTime() - targetTime) > 1) {
                event.target.seekTo(targetTime, true);
              }
              if (videoStateRef.current.isPlaying) event.target.playVideo();
              else event.target.pauseVideo();

              previousPollAt = performance.now();
              pollTimer = setInterval(() => {
                const now = performance.now();
                const time = event.target.getCurrentTime();
                const duration = event.target.getDuration();
                const isPlaying = lastPlayingState ?? false;
                if (previousTime !== null && isHostRef.current) {
                  const expectedTime = previousTime + (isPlaying ? (now - previousPollAt) / 1000 : 0);
                  if (Math.abs(time - expectedTime) > 2) {
                    onStateChangeRef.current('seek', time, isPlaying);
                  }
                }
                previousTime = time;
                previousPollAt = now;
                onProgressRef.current(time, duration, isPlaying);
              }, 500);
            },
            onStateChange: (event) => {
              if (disposed) return;
              if (event.data === youtube.PlayerState.PLAYING || event.data === youtube.PlayerState.PAUSED || event.data === youtube.PlayerState.ENDED) {
                const isPlaying = event.data === youtube.PlayerState.PLAYING;
                if (isHostRef.current && lastPlayingState !== null && lastPlayingState !== isPlaying) {
                  onStateChangeRef.current(isPlaying ? 'play' : 'pause', event.target.getCurrentTime(), isPlaying);
                }
                lastPlayingState = isPlaying;
                onProgressRef.current(event.target.getCurrentTime(), event.target.getDuration(), isPlaying);
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      playerRef.current?.destroy();
      playerRef.current = null;
      onControllerRef.current(null);
    };
  }, [videoId, isHost]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || isHost) return;
    const targetTime = getTargetTime(videoState);
    if (Math.abs(player.getCurrentTime() - targetTime) > 1.25) player.seekTo(targetTime, true);
    if (videoState.isPlaying) player.playVideo();
    else player.pauseVideo();
  }, [videoState.lastUpdated, videoState.currentTime, videoState.isPlaying, isHost]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={mountRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
      {!isHost && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10" aria-label="Reproducción controlada por el anfitrión">
          <button
            type="button"
            onClick={() => {
              const player = playerRef.current;
              if (!player) return;
              const state = videoStateRef.current;
              player.seekTo(getTargetTime(state), true);
              if (state.isPlaying) player.playVideo();
              else player.pauseVideo();
            }}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-black/80 px-4 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur transition-colors hover:bg-black"
          >
            <RefreshCw className="h-4 w-4 text-emerald-200" />
            {videoState.isPlaying ? 'Iniciar y sincronizar' : 'Alinear con la sala'}
          </button>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-6 text-center text-sm text-slate-200">
          No se pudo cargar el reproductor de YouTube.
        </div>
      )}
      {!isHost && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3 py-1.5 text-xs text-white backdrop-blur">
          <RefreshCw className="h-3.5 w-3.5 text-emerald-300" />
          Sincronización controlada por el anfitrión
        </div>
      )}
    </div>
  );
};