import React, { useEffect, type MutableRefObject } from 'react';
import Hls from 'hls.js';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { resolveTrackLang } from './trackLabelUtils';
import type { AppLanguage, LanguageNoticePopup, VideoState } from '../../types';
import type {
  ScreenOrientationWithLock,
  WebKitVideoElement,
  YouTubePlayerInstance,
} from './playerTypes';

interface UsePlayerControlsOptions {
  lang: AppLanguage;
  videoState: VideoState;
  stageWrapperRef: MutableRefObject<HTMLDivElement | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  hlsRef: MutableRefObject<Hls | null>;
  ytPlayerRef: MutableRefObject<YouTubePlayerInstance | null>;
  showControlsRef: MutableRefObject<boolean>;
  lastMousePosRef: MutableRefObject<{ x: number; y: number } | null>;
  isMinimized: boolean;
  isTvMode: boolean;
  isCinemaMode: boolean;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  setVolume: (vol: number) => void;
  localPlaying: boolean;
  setLocalPlaying: (playing: boolean) => void;
  currentTime: number;
  setCurrentTime: (sec: number) => void;
  duration: number;
  isFullscreen: boolean;
  setIsFullscreen: (fs: boolean) => void;
  isHorizontalFullscreen: boolean;
  setIsHorizontalFullscreen: (fs: boolean) => void;
  forceLandscapeRotation: boolean;
  setForceLandscapeRotation: (force: boolean) => void;
  setViewportDims: (dims: { w: number; h: number }) => void;
  setIsInPiP: (pip: boolean) => void;
  qualityLevels: { index: number; height: number; bitrate?: number }[];
  setSelectedQuality: (idx: number) => void;
  hlsAudioTracks: { id: number; name: string; lang: string; default?: boolean }[];
  setSelectedHlsAudioTrack: (id: number) => void;
  setActiveHudMenu: (menu: 'quality' | 'audio' | null) => void;
  setStreamError: (err: string | null) => void;
  setPlaybackSpeed: (rate: number) => void;
  setSeekRipple: (side: 'left' | 'right' | null) => void;
  subtitleTracks: { id: string; label: string; lang: string; url?: string }[];
  activeSubId: string;
  handleSelectSubtitleTrack: (id: string) => void;
  revealControls: () => void;
  hideControlsImmediately: () => void;
  showTransientToast: (msg: string) => void;
  triggerLocalLanguagePopup: (popup: Omit<LanguageNoticePopup, 'id'>) => void;
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onToggleCinemaMode?: () => void;
}

export function usePlayerControls(opts: UsePlayerControlsOptions) {
  const {
    lang,
    videoState,
    stageWrapperRef,
    videoRef,
    hlsRef,
    ytPlayerRef,
    showControlsRef,
    lastMousePosRef,
    isMinimized,
    isTvMode,
    isCinemaMode,
    isMuted,
    setIsMuted,
    setVolume,
    localPlaying,
    setLocalPlaying,
    currentTime,
    setCurrentTime,
    duration,
    isFullscreen,
    setIsFullscreen,
    isHorizontalFullscreen,
    setIsHorizontalFullscreen,
    forceLandscapeRotation,
    setForceLandscapeRotation,
    setViewportDims,
    setIsInPiP,
    qualityLevels,
    setSelectedQuality,
    hlsAudioTracks,
    setSelectedHlsAudioTrack,
    setActiveHudMenu,
    setStreamError,
    setPlaybackSpeed,
    setSeekRipple,
    subtitleTracks,
    activeSubId,
    handleSelectSubtitleTrack,
    revealControls,
    hideControlsImmediately,
    showTransientToast,
    triggerLocalLanguagePopup,
    onSyncAction,
    onSelectTrack,
    onToggleCinemaMode,
  } = opts;

  const handleSelectSpeed = (rate: number) => {
    setPlaybackSpeed(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    if (ytPlayerRef.current?.setPlaybackRate) {
      try {
        ytPlayerRef.current.setPlaybackRate(rate);
      } catch {
        // ignore
      }
    }
  };

  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('light');
    revealControls();

    if (videoState.mode === 'youtube' && ytPlayerRef.current) {
      const state = ytPlayerRef.current.getPlayerState?.();
      if (state === 1) {
        ytPlayerRef.current.pauseVideo?.();
        setLocalPlaying(false);
        onSyncAction('pause', {
          isPlaying: false,
          currentTime: ytPlayerRef.current.getCurrentTime?.() || 0,
        });
      } else {
        ytPlayerRef.current.playVideo?.();
        setLocalPlaying(true);
        onSyncAction('play', {
          isPlaying: true,
          currentTime: ytPlayerRef.current.getCurrentTime?.() || 0,
        });
      }
      return;
    }

    const video = videoRef.current;
    if (!video || (videoState.mode !== 'hls' && videoState.mode !== 'direct')) return;

    if (video.paused || !localPlaying) {
      video.play().catch(() => {});
      setLocalPlaying(true);
      onSyncAction('play', {
        isPlaying: true,
        currentTime: video.currentTime || currentTime || 0,
      });
    } else {
      video.pause();
      setLocalPlaying(false);
      onSyncAction('pause', {
        isPlaying: false,
        currentTime: video.currentTime || currentTime || 0,
      });
    }
  };

  const handleSeekRelative = (deltaSec: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoState.isLive) return;
    triggerHaptic('light');
    revealControls();

    const side: 'left' | 'right' = deltaSec < 0 ? 'left' : 'right';
    setSeekRipple(side);
    setTimeout(() => setSeekRipple(null), 550);

    if (videoState.mode === 'youtube' && ytPlayerRef.current?.seekTo) {
      const baseTime = ytPlayerRef.current.getCurrentTime?.() || currentTime || 0;
      const target = Math.max(0, baseTime + deltaSec);
      ytPlayerRef.current.seekTo(target, true);
      setCurrentTime(target);
      onSyncAction('seek', { currentTime: target, isPlaying: localPlaying });
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    const baseTime =
      Number.isFinite(video.currentTime) && video.currentTime > 0
        ? video.currentTime
        : currentTime || videoState.currentTime || 0;
    const maxDur =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : duration > 0
        ? duration
        : Infinity;
    const target = Math.max(0, Math.min(maxDur, baseTime + deltaSec));
    try {
      video.currentTime = target;
    } catch {
      // ignore if media not yet seekable
    }
    setCurrentTime(target);
    onSyncAction('seek', { currentTime: target, isPlaying: !video.paused });
  };

  const handleVideoSurfaceTap = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (isMinimized) {
      return;
    }
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (showControlsRef.current) {
      hideControlsImmediately();
    } else {
      revealControls();
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    if (videoState.mode === 'youtube' && ytPlayerRef.current) {
      try {
        const currentlyMuted = Boolean(ytPlayerRef.current.isMuted?.()) || isMuted;
        if (currentlyMuted) {
          ytPlayerRef.current.unMute?.();
          ytPlayerRef.current.setVolume?.(100);
          ytPlayerRef.current.playVideo?.();
          setIsMuted(false);
          setVolume(1);
        } else {
          ytPlayerRef.current.mute?.();
          setIsMuted(true);
        }
      } catch {
        // ignore
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && video.volume === 0) {
      video.volume = 0.85;
      setVolume(0.85);
    }
  };

  const handleVolumeSlider = (val: number) => {
    setVolume(val);
    if (videoState.mode === 'youtube' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume?.(Math.round(val * 100));
        if (val > 0) {
          ytPlayerRef.current.unMute?.();
          setIsMuted(false);
        } else {
          ytPlayerRef.current.mute?.();
          setIsMuted(true);
        }
      } catch {
        // ignore
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    video.muted = val === 0;
    setIsMuted(val === 0);
  };

  const handleScrub = (nextSec: number) => {
    const video = videoRef.current;
    if (!video || videoState.isLive) return;
    video.currentTime = nextSec;
    setCurrentTime(nextSec);
    onSyncAction('seek', { currentTime: nextSec, isPlaying: !video.paused });
  };

  const handleToggleFullscreen = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('light');
    revealControls();
    const container = stageWrapperRef.current;
    const video = videoRef.current as WebKitVideoElement | null;

    const currentlyFull = Boolean(document.fullscreenElement) || isHorizontalFullscreen;
    if (currentlyFull) {
      setIsHorizontalFullscreen(false);
      setIsFullscreen(false);
      try {
        (window.screen?.orientation as unknown as ScreenOrientationWithLock)?.unlock?.();
      } catch {
        // ignore
      }
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
      setTimeout(() => {
        setViewportDims({ w: window.innerWidth, h: window.innerHeight });
      }, 120);
      return;
    }

    setForceLandscapeRotation(true);
    setIsHorizontalFullscreen(true);
    setIsFullscreen(true);
    setViewportDims({ w: window.innerWidth, h: window.innerHeight });

    try {
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch {
      // Fallback: CSS Horizontal Fullscreen Stage is already active via isHorizontalFullscreen
    }

    try {
      const ori = window.screen?.orientation as unknown as ScreenOrientationWithLock | undefined;
      if (ori?.lock) {
        await ori.lock('landscape');
      }
    } catch {
      // ignore
    }

    setTimeout(() => {
      setViewportDims({ w: window.innerWidth, h: window.innerHeight });
    }, 120);
    setTimeout(() => {
      setViewportDims({ w: window.innerWidth, h: window.innerHeight });
    }, 350);

    showTransientToast(
      pickLang(lang, {
        es: 'Pantalla completa horizontal (16:9) activada',
        ca: 'Pantalla completa horitzontal (16:9) activada',
        en: 'Landscape fullscreen enabled',
      })
    );
  };

  const handleToggleLandscapeRotation = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('medium');
    revealControls();

    if (!isHorizontalFullscreen && !isFullscreen) {
      await handleToggleFullscreen(e);
      return;
    }

    const nextForce = !forceLandscapeRotation;
    setForceLandscapeRotation(nextForce);
    try {
      const ori = window.screen?.orientation as unknown as ScreenOrientationWithLock | undefined;
      if (nextForce && ori?.lock) {
        await ori.lock('landscape');
      } else if (!nextForce && ori?.unlock) {
        ori.unlock();
      }
    } catch {
      // ignore
    }
    showTransientToast(
      nextForce
        ? pickLang(lang, {
            es: 'Vista horizontal (16:9) activada',
            ca: 'Vista horitzontal (16:9) activada',
            en: 'Horizontal view enabled',
          })
        : pickLang(lang, {
            es: 'Vista vertical activada',
            ca: 'Vista vertical activada',
            en: 'Vertical view enabled',
          })
    );
  };

  const handleTogglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const video = videoRef.current as WebKitVideoElement | null;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsInPiP(false);
        return;
      }
      if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsInPiP(true);
        return;
      }
      if (video.webkitSupportsPresentationMode?.('picture-in-picture') && video.webkitSetPresentationMode) {
        const nextMode =
          video.webkitPresentationMode === 'picture-in-picture'
            ? 'inline'
            : 'picture-in-picture';
        video.webkitSetPresentationMode(nextMode);
        setIsInPiP(nextMode === 'picture-in-picture');
        return;
      }
      showTransientToast(
        pickLang(lang, {
          es: 'Tu navegador actual no soporta ventana superpuesta en este formato',
          ca: 'El teu navegador actual no admet finestra flotant en aquest format',
          en: 'Floating window is not supported for this stream format',
        })
      );
    } catch {
      showTransientToast(
        pickLang(lang, {
          es: 'Inicia la reproducción un segundo antes de activar pantalla flotante',
          ca: 'Inicia la reproducció un segon abans d’activar la pantalla flotant',
          en: 'Play the video first to enable floating PiP window',
        })
      );
    }
  };

  const handleChangeQuality = (levelIndex: number) => {
    setSelectedQuality(levelIndex);
    setActiveHudMenu(null);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    const chosenLevel = qualityLevels.find((q) => q.index === levelIndex);
    showTransientToast(
      levelIndex === -1
        ? pickLang(lang, {
            es: 'Calidad: Automática (ABR)',
            ca: 'Qualitat: Automàtica (ABR)',
            en: 'Quality: Auto (ABR)',
          })
        : pickLang(lang, {
            es: `Calidad fijada en ${chosenLevel?.height || ''}p`,
            ca: `Qualitat fixada a ${chosenLevel?.height || ''}p`,
            en: `Quality locked to ${chosenLevel?.height || ''}p`,
          })
    );
  };

  const handleSelectHlsAudioTrack = (trackId: number) => {
    setSelectedHlsAudioTrack(trackId);
    setActiveHudMenu(null);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    }
    const found = hlsAudioTracks.find((tr) => tr.id === trackId);
    showTransientToast(
      pickLang(lang, {
        es: `Audio: ${found?.name || `Pista ${trackId + 1}`}`,
        ca: `Àudio: ${found?.name || `Pista ${trackId + 1}`}`,
        en: `Audio: ${found?.name || `Track ${trackId + 1}`}`,
      })
    );
  };

  const handleForceReloadStream = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    triggerHaptic('medium');
    setStreamError(null);
    if (videoState.tracks.length > 0) {
      onSelectTrack(videoState.activeTrackIndex, currentTime);
    } else if (hlsRef.current) {
      hlsRef.current.startLoad();
    } else if (videoRef.current && videoState.url) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  const handleQuickLanguageSwitch = (targetLangCode: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT') => {
    triggerHaptic('light');
    const langDisplayNames: Record<'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT', string> = {
      ES: 'Castellano (España)',
      CAT: 'Català',
      LAT: 'Español Latino',
      VOSE: 'Subtitulado (VOSE)',
      EN: 'Inglés Original (EN)',
    };
    const requestedName = langDisplayNames[targetLangCode];

    const matchingIdx = (videoState.tracks || []).findIndex(
      (tr) =>
        resolveTrackLang(tr, {
          subtitle: videoState.subtitle,
          title: videoState.title,
        }) === targetLangCode
    );

    if (matchingIdx === -1) {
      const availableLabels = Array.from(
        new Set((videoState.tracks || []).map((tr) => tr.label).filter(Boolean))
      );
      triggerLocalLanguagePopup({
        type: 'warning',
        title: `Idioma no disponible: ${requestedName}`,
        subtitle:
          availableLabels.length > 0
            ? `Este título solo está disponible en: ${availableLabels.join(' · ')}`
            : 'No hay pistas alternativas disponibles para este contenido.',
      });
      return;
    }

    const targetTrack = videoState.tracks[matchingIdx];
    if (matchingIdx === videoState.activeTrackIndex) {
      triggerLocalLanguagePopup({
        type: 'success',
        title: `Reproduciendo en: ${targetTrack.label}`,
        subtitle: 'Este idioma ya se encuentra activo en el reproductor.',
      });
      return;
    }

    triggerLocalLanguagePopup({
      type: 'success',
      title: `Cambiando idioma a: ${targetTrack.label}`,
      subtitle: 'Sincronizando señal de audio HD en la sala...',
    });
    onSelectTrack(matchingIdx, currentTime);
  };

  // Keyboard shortcuts for Modo Cine (T / Escape) when player is active
  useEffect(() => {
    if (isTvMode || videoState.mode === 'idle') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape' && isCinemaMode && !document.fullscreenElement) {
        onToggleCinemaMode?.();
      } else if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        onToggleCinemaMode?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isTvMode, videoState.mode, isCinemaMode, onToggleCinemaMode]);

  // Global PC Keyboard Shortcuts (Space/K, F, M, J/ArrowLeft, L/ArrowRight, C)
  useEffect(() => {
    if (videoState.mode === 'idle' || videoState.mode === 'cloud') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        e.preventDefault();
        handleTogglePlay();
      } else if (key === 'f') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (key === 'm') {
        e.preventDefault();
        const v = videoRef.current;
        if (v) {
          const next = !v.muted;
          v.muted = next;
          setIsMuted(next);
          showTransientToast(next ? '🔇 Silenciado' : '🔊 Sonido activo');
        }
      } else if ((key === 'arrowleft' || key === 'j') && !videoState.isLive) {
        e.preventDefault();
        handleSeekRelative(-10);
        setSeekRipple('left');
        setTimeout(() => setSeekRipple(null), 500);
      } else if ((key === 'arrowright' || key === 'l') && !videoState.isLive) {
        e.preventDefault();
        handleSeekRelative(10);
        setSeekRipple('right');
        setTimeout(() => setSeekRipple(null), 500);
      } else if (key === 'c' && subtitleTracks.length > 0) {
        e.preventDefault();
        const subOptions = ['off', ...subtitleTracks.map((s) => s.id)];
        const curIdx = Math.max(0, subOptions.indexOf(activeSubId));
        const nextSub = subOptions[(curIdx + 1) % subOptions.length];
        handleSelectSubtitleTrack(nextSub);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videoState.mode, videoState.isLive, subtitleTracks, activeSubId]);

  return {
    handleSelectSpeed,
    handleTogglePlay,
    handleSeekRelative,
    handleVideoSurfaceTap,
    handleToggleMute,
    handleVolumeSlider,
    handleScrub,
    handleToggleFullscreen,
    handleToggleLandscapeRotation,
    handleTogglePiP,
    handleChangeQuality,
    handleSelectHlsAudioTrack,
    handleForceReloadStream,
    handleQuickLanguageSwitch,
  };
}
