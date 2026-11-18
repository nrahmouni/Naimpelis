import React, { useEffect } from 'react';
import type Hls from 'hls.js';
import type { SubtitleTrackItem, VideoState } from '../../types';
import { socketService } from '../../services/socket';
import type { YouTubePlayerInstance } from './playerTypes';

interface UseTvReceiverRemoteParams {
  isTvMode: boolean;
  videoState: VideoState;
  stageWrapperRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hlsRef: React.MutableRefObject<Hls | null>;
  ytPlayerRef: React.MutableRefObject<YouTubePlayerInstance | null>;
  subtitleTracks: SubtitleTrackItem[];
  activeSubId: string;
  currentTime: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setTvAspectMode: React.Dispatch<React.SetStateAction<'contain' | 'cover' | 'fill'>>;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  setAmbilightEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  handleSelectSubtitleTrack: (trackId: string) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onExitTvMode?: () => void;
  showTransientToast: (msg: string) => void;
}

export function useTvReceiverRemote({
  isTvMode,
  videoState,
  stageWrapperRef,
  videoRef,
  hlsRef,
  ytPlayerRef,
  subtitleTracks,
  activeSubId,
  currentTime,
  setVolume,
  setIsMuted,
  setTvAspectMode,
  setShowControls,
  setAmbilightEnabled,
  handleSelectSubtitleTrack,
  onSelectTrack,
  onExitTvMode,
  showTransientToast,
}: UseTvReceiverRemoteParams) {
  useEffect(() => {
    if (!isTvMode) return;
    const unsub = socketService.subscribe((event) => {
      if (event.type !== 'TV_REMOTE_COMMAND') return;
      const cmd = event.payload?.command;
      if (cmd === 'vol_up' || cmd === 'vol_down') {
        setVolume((prev) => {
          const delta = cmd === 'vol_up' ? 0.15 : -0.15;
          const nextVol = Math.max(0, Math.min(1, Number((prev + delta).toFixed(2))));
          if (videoRef.current) {
            videoRef.current.volume = nextVol;
            if (nextVol > 0) videoRef.current.muted = false;
          }
          try {
            if (ytPlayerRef.current?.setVolume) {
              ytPlayerRef.current.setVolume(Math.round(nextVol * 100));
              if (nextVol > 0 && ytPlayerRef.current?.unMute) {
                ytPlayerRef.current.unMute();
              }
            }
          } catch {
            // ignore
          }
          if (nextVol > 0) setIsMuted(false);
          showTransientToast(`🔊 Volumen TV · ${Math.round(nextVol * 100)}%`);
          return nextVol;
        });
      } else if (cmd === 'toggle_mute') {
        setIsMuted((prev) => {
          const nextMuted = !prev;
          if (videoRef.current) {
            videoRef.current.muted = nextMuted;
          }
          try {
            if (nextMuted) ytPlayerRef.current?.mute?.();
            else ytPlayerRef.current?.unMute?.();
          } catch {
            // ignore
          }
          showTransientToast(nextMuted ? '🔇 Televisor silenciado' : '🔊 Sonido TV activado');
          return nextMuted;
        });
      } else if (cmd === 'toggle_fullscreen') {
        const container = stageWrapperRef.current || document.documentElement;
        const video = videoRef.current as
          | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
          | null;
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          showTransientToast('Saliendo de pantalla completa');
        } else if (container?.requestFullscreen) {
          container
            .requestFullscreen()
            .then(() => showTransientToast('✓ Pantalla Completa activada'))
            .catch(() => {
              if (video?.webkitEnterFullscreen) {
                try {
                  video.webkitEnterFullscreen();
                  return;
                } catch {
                  // ignore
                }
              }
              showTransientToast('Pulsa Pantalla Completa en la TV para ocultar la barra');
            });
        }
      } else if (cmd === 'toggle_aspect') {
        setTvAspectMode((prev) => {
          const next = prev === 'contain' ? 'cover' : prev === 'cover' ? 'fill' : 'contain';
          showTransientToast(
            next === 'cover'
              ? 'Formato TV · Pantalla Rellena sin bordes negros'
              : next === 'fill'
              ? 'Formato TV · Estirado 16:9 completo'
              : 'Formato TV · Original sin recorte'
          );
          return next;
        });
      } else if (cmd === 'toggle_hud') {
        setShowControls((prev) => !prev);
      } else if (cmd === 'reload_tv') {
        if (hlsRef.current) hlsRef.current.startLoad();
        else if (videoRef.current && videoState.url) {
          videoRef.current.load();
          videoRef.current.play().catch(() => {});
        }
        showTransientToast('Resincronizando señal HD en TV...');
      } else if (cmd === 'toggle_ambilight') {
        setAmbilightEnabled((prev) => {
          const next = !prev;
          showTransientToast(next ? '✨ Ambilight TV activado' : 'Ambilight TV desactivado');
          return next;
        });
      } else if (cmd === 'cycle_subtitles') {
        const subOptions = ['off', ...subtitleTracks.map((s) => s.id)];
        if (subOptions.length <= 1) {
          showTransientToast('💬 No hay subtítulos adicionales en este título');
        } else {
          const curIdx = Math.max(0, subOptions.indexOf(activeSubId));
          const nextSubId = subOptions[(curIdx + 1) % subOptions.length];
          handleSelectSubtitleTrack(nextSubId);
          const nextLabel =
            nextSubId === 'off'
              ? 'Desactivados'
              : subtitleTracks.find((s) => s.id === nextSubId)?.label || 'Activados';
          showTransientToast(`💬 Subtítulos TV: ${nextLabel}`);
        }
      } else if (cmd === 'cycle_audio') {
        if (videoState.tracks && videoState.tracks.length > 1) {
          const nextIdx = (videoState.activeTrackIndex + 1) % videoState.tracks.length;
          const nextTrack = videoState.tracks[nextIdx];
          onSelectTrack(nextIdx, videoRef.current?.currentTime || currentTime || 0);
          showTransientToast(`🔊 Audio TV: ${nextTrack?.label || `Pista ${nextIdx + 1}`}`);
        } else {
          showTransientToast('🔊 Audio original único en esta señal');
        }
      } else if (cmd === 'disconnect_tv') {
        onExitTvMode?.();
      }
    });
    return () => unsub();
  }, [
    isTvMode,
    onExitTvMode,
    showTransientToast,
    videoState.url,
    videoState.tracks,
    videoState.activeTrackIndex,
    subtitleTracks,
    activeSubId,
    currentTime,
    onSelectTrack,
  ]);
}
