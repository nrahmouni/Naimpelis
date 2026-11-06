import React, { useEffect, useRef, useState } from 'react';
import Player from '@vimeo/player';
import { RefreshCw } from 'lucide-react';
import { VideoState } from '../types';

export interface VimeoController {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
}

interface VimeoPlayerProps {
  videoId: string;
  videoState: VideoState;
  isHost: boolean;
  onStateChange: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onProgress: (time: number, duration: number, isPlaying: boolean) => void;
  onController: (controller: VimeoController | null) => void;
}

function getTargetTime(state: VideoState) {
  const elapsed = state.isPlaying ? Math.max(0, (Date.now() - state.lastUpdated) / 1000) : 0;
  return Math.max(0, state.currentTime + elapsed);
}

export const VimeoPlayer: React.FC<VimeoPlayerProps> = ({
  videoId,
  videoState,
  isHost,
  onStateChange,
  onProgress,
  onController,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const videoStateRef = useRef(videoState);
  const isHostRef = useRef(isHost);
  const onStateChangeRef = useRef(onStateChange);
  const onProgressRef = useRef(onProgress);
  const onControllerRef = useRef(onController);
  const lastPlayingRef = useRef<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  videoStateRef.current = videoState;
  isHostRef.current = isHost;
  onStateChangeRef.current = onStateChange;
  onProgressRef.current = onProgress;
  onControllerRef.current = onController;

  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    const player = new Player(mountRef.current, {
      id: Number(videoId),
      controls: isHost,
      responsive: true,
      playsinline: true,
      autoplay: false,
      dnt: true,
    });
    playerRef.current = player;

    const controller: VimeoController = {
      play: () => { void player.play().catch(() => setNeedsGesture(true)); },
      pause: () => { void player.pause().catch(() => undefined); },
      seekTo: (seconds) => { void player.setCurrentTime(seconds).catch(() => undefined); },
    };

    player.on('play', (event) => {
      lastPlayingRef.current = true;
      if (isHostRef.current) onStateChangeRef.current('play', event.seconds, true);
      onProgressRef.current(event.seconds, event.duration, true);
      setNeedsGesture(false);
    });
    player.on('pause', (event) => {
      lastPlayingRef.current = false;
      if (isHostRef.current) onStateChangeRef.current('pause', event.seconds, false);
      onProgressRef.current(event.seconds, event.duration, false);
    });
    player.on('seeked', (event) => {
      if (isHostRef.current) onStateChangeRef.current('seek', event.seconds, lastPlayingRef.current ?? false);
      onProgressRef.current(event.seconds, event.duration, lastPlayingRef.current ?? false);
    });
    player.on('timeupdate', (event) => {
      onProgressRef.current(event.seconds, event.duration, lastPlayingRef.current ?? false);
    });

    player.ready()
      .then(async () => {
        if (disposed) return;
        onControllerRef.current(controller);
        const state = videoStateRef.current;
        await player.setCurrentTime(getTargetTime(state)).catch(() => undefined);
        lastPlayingRef.current = state.isPlaying;
        if (state.isPlaying) {
          await player.play().catch(() => setNeedsGesture(true));
        }
        const [time, duration, paused] = await Promise.all([
          player.getCurrentTime(),
          player.getDuration(),
          player.getPaused(),
        ]);
        onProgressRef.current(time, duration, !paused);
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });

    player.on('error', () => {
      if (!disposed) setLoadError(true);
    });

    return () => {
      disposed = true;
      onControllerRef.current(null);
      if (playerRef.current === player) playerRef.current = null;
      void player.destroy().catch(() => undefined);
    };
  }, [videoId, isHost]);

  useEffect(() => {
    if (isHost || !playerRef.current) return;
    const player = playerRef.current;
    const targetTime = getTargetTime(videoState);
    void player.getCurrentTime().then((time) => {
      if (Math.abs(time - targetTime) > 1.25) return player.setCurrentTime(targetTime);
      return undefined;
    }).then(() => {
      if (videoState.isPlaying) return player.play().catch(() => setNeedsGesture(true));
      return player.pause().catch(() => undefined);
    }).catch(() => undefined);
  }, [videoState.lastUpdated, videoState.currentTime, videoState.isPlaying, isHost]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={mountRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
      {!isHost && (needsGesture || videoState.isPlaying) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
          <button
            type="button"
            onClick={() => {
              const player = playerRef.current;
              if (!player) return;
              void player.setCurrentTime(getTargetTime(videoStateRef.current))
                .then(() => videoStateRef.current.isPlaying ? player.play() : player.pause())
                .then(() => setNeedsGesture(false))
                .catch(() => setNeedsGesture(true));
            }}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-black/80 px-4 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur transition-colors hover:bg-black"
          >
            <RefreshCw className="h-4 w-4 text-emerald-200" />
            {needsGesture ? 'Iniciar y sincronizar' : 'Alinear con la sala'}
          </button>
        </div>
      )}
      {loadError && (
        <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-6 text-center text-sm text-slate-200">
          No se pudo cargar este vídeo de Vimeo. Comprueba los permisos de inserción del propietario.
        </div>
      )}
    </div>
  );
};