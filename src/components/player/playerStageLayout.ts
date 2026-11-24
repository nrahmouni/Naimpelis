import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type React from 'react';
import type Hls from 'hls.js';
import type { YouTubePlayerInstance } from './playerTypes';

export function usePlayerStageRefs() {
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const castBridgeVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<YouTubePlayerInstance | null>(null);
  const ytContainerId = useRef(`yt-stage-${Math.random().toString(36).slice(2, 8)}`);
  const isApplyingRemoteRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControlsRef = useRef<boolean>(true);
  const lastManualHideAtRef = useRef<number>(0);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastProgressEmitRef = useRef<number>(0);
  const streamLoadStartRef = useRef<number>(Date.now());
  const qoeStartupSentForUrlRef = useRef<string>('');
  const rebufferCountRef = useRef<number>(0);
  const smoothDriftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCurrentTimeRef = useRef<number>(0);
  const autoNextTriggeredUrlRef = useRef<string>('');

  const [playerToast, setPlayerToast] = useState<string | null>(null);
  const showTransientToast = useCallback((msg: string) => {
    setPlayerToast(msg);
    setTimeout(() => {
      setPlayerToast((cur) => (cur === msg ? null : cur));
    }, 3400);
  }, []);

  return {
    stageWrapperRef,
    videoRef,
    castBridgeVideoRef,
    hlsRef,
    ytPlayerRef,
    ytContainerId,
    isApplyingRemoteRef,
    controlsTimeoutRef,
    bufferingDelayTimerRef,
    showControlsRef,
    lastManualHideAtRef,
    lastMousePosRef,
    lastProgressEmitRef,
    streamLoadStartRef,
    qoeStartupSentForUrlRef,
    rebufferCountRef,
    smoothDriftTimerRef,
    latestCurrentTimeRef,
    autoNextTriggeredUrlRef,
    playerToast,
    showTransientToast,
  };
}

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === 'true';
  } catch {
    // ignore storage errors
  }
  return fallback;
}

function readVolumePref(): number {
  try {
    const raw = Number(localStorage.getItem('riffantv_player_volume_v1'));
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
  } catch {
    return 1;
  }
}

export function usePlayerStagePrefs(opts: {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  videoUrl: string;
  videoMode: string;
  isStageFullscreen: boolean;
  isMinimized: boolean;
  forcePrimaryMuted?: boolean;
}) {
  const [batterySaverTvMode, setBatterySaverTvMode] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() =>
    readBoolPref('riffantv_player_muted_v1', false)
  );
  const [volume, setVolume] = useState<number>(() => readVolumePref());
  const [isTouchLocked, setIsTouchLocked] = useState(false);
  const [tvAspectMode, setTvAspectMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [ambilightEnabled, setAmbilightEnabled] = useState<boolean>(() => {
    const fallback = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
    return readBoolPref('naim_ambilight_v1', fallback);
  });
  const [vocalBoostEnabled, setVocalBoostEnabled] = useState<boolean>(() =>
    readBoolPref('naim_vocal_boost_v1', false)
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  useEffect(() => {
    try {
      localStorage.setItem('riffantv_player_muted_v1', String(isMuted));
      localStorage.setItem('riffantv_player_volume_v1', String(volume));
    } catch {
      // ignore storage errors
    }
  }, [isMuted, volume]);

  useEffect(() => {
    const vid = opts.videoRef.current;
    if (!vid) return;
    const effectiveMuted = Boolean(opts.forcePrimaryMuted) || isMuted;
    if (Math.abs(vid.volume - volume) > 0.01) vid.volume = volume;
    if (vid.muted !== effectiveMuted) vid.muted = effectiveMuted;
  }, [opts.videoRef, opts.videoUrl, opts.videoMode, opts.forcePrimaryMuted, volume, isMuted]);

  useEffect(() => {
    if (!opts.isStageFullscreen || opts.isMinimized || opts.videoMode === 'idle') {
      setIsTouchLocked(false);
    }
  }, [opts.isStageFullscreen, opts.isMinimized, opts.videoMode]);

  return {
    batterySaverTvMode,
    setBatterySaverTvMode,
    isMuted,
    setIsMuted,
    volume,
    setVolume,
    isTouchLocked,
    setIsTouchLocked,
    tvAspectMode,
    setTvAspectMode,
    ambilightEnabled,
    setAmbilightEnabled,
    vocalBoostEnabled,
    setVocalBoostEnabled,
    playbackSpeed,
    setPlaybackSpeed,
  };
}

export function getPlayerSectionClass(opts: {
  isTvMode: boolean;
  isMinimized: boolean;
  isCinemaMode: boolean;
}): string {
  if (opts.isTvMode) return 'w-full h-screen h-full overflow-hidden bg-black';
  if (opts.isMinimized) {
    return 'w-full overflow-hidden bg-black rounded-2xl border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9)]';
  }
  if (opts.isCinemaMode) return 'w-full bg-transparent';
  return 'w-full overflow-hidden bg-black lg:rounded-2xl lg:border lg:border-white/[0.08] lg:shadow-2xl lg:shadow-black/60';
}

export function getStageWrapperStyle(isStageFullscreen: boolean): React.CSSProperties | undefined {
  if (!isStageFullscreen) return undefined;
  return {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 250,
    borderRadius: 0,
  };
}

export function getStageWrapperClass(opts: {
  isTvMode: boolean;
  isStageFullscreen: boolean;
  compactVideoForMobileKeyboard: boolean;
  isCompressed: boolean;
  isMinimized: boolean;
  isCinemaMode: boolean;
  multiScreenCount?: number;
  multiScreenLayout?: 'corner' | 'split';
}): string {
  const isMultiSplitActive =
    !opts.isMinimized &&
    (opts.multiScreenCount ?? 1) >= 2 &&
    (opts.multiScreenLayout === 'split' || (opts.multiScreenCount ?? 1) >= 3);

  const heightCls =
    opts.isTvMode || opts.isStageFullscreen
      ? 'h-full'
      : opts.compactVideoForMobileKeyboard
      ? 'h-[122px] sm:aspect-video'
      : opts.isCompressed && !opts.isMinimized
      ? 'h-[136px] sm:h-[210px] lg:h-[238px]'
      : isMultiSplitActive
      ? 'h-[72dvh] sm:h-[75dvh] min-h-[380px] max-h-[82vh]'
      : 'aspect-video';

  const cinemaRingCls =
    opts.isCinemaMode &&
    !opts.isMinimized &&
    !opts.isCompressed &&
    !opts.isTvMode &&
    !opts.isStageFullscreen
      ? 'z-50 lg:rounded-2xl ring-1 ring-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.96)]'
      : '';

  return `relative w-full bg-black overflow-hidden select-none transition-[height] duration-200 ${heightCls} ${cinemaRingCls}`;
}

export function createStagePointerHandlers(opts: {
  isMinimized: boolean;
  lastManualHideAtRef: React.MutableRefObject<number>;
  lastMousePosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  showControlsRef: React.MutableRefObject<boolean>;
  revealControls: () => void;
  scheduleHideControls: () => void;
}) {
  return {
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (opts.isMinimized) return;
      if (e.pointerType === 'mouse') {
        if (Date.now() - opts.lastManualHideAtRef.current < 350) return;
        const prev = opts.lastMousePosRef.current;
        if (
          prev &&
          Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6 &&
          !opts.showControlsRef.current
        ) {
          return;
        }
        opts.lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        opts.revealControls();
      }
    },
    onPointerDownCapture: () => {
      if (opts.showControlsRef.current) opts.scheduleHideControls();
    },
    onPointerMoveCapture: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse' && opts.showControlsRef.current) opts.scheduleHideControls();
    },
  };
}
