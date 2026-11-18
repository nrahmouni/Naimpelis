import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoState } from '../../types';
import {
  getEmbedServerStatus,
  isMobileExternalTabContext,
  setEmbedServerStatus,
  unwrapEmbedUrl,
} from './embedWindowUtils';

interface UseEmbedExternalWindowParams {
  videoState: VideoState;
  isExtracting: boolean;
  currentTime: number;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  showTransientToast: (msg: string) => void;
}

export function useEmbedExternalWindow({
  videoState,
  isExtracting,
  currentTime,
  onSelectTrack,
  showTransientToast,
}: UseEmbedExternalWindowParams) {
  const externalWinRef = useRef<Window | null>(null);
  const lastNavigatedExternalUrlRef = useRef<string>('');
  const triedEmbedIndicesRef = useRef<Set<number>>(new Set());
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttemptedEmbedUrlRef = useRef<string>('');
  const latestSelectTrackRef = useRef(onSelectTrack);
  latestSelectTrackRef.current = onSelectTrack;
  const latestCurrentTimeRef = useRef<number>(currentTime);
  latestCurrentTimeRef.current = currentTime;

  const [externalWinState, setExternalWinState] = useState<
    'idle' | 'open' | 'closed' | 'blocked'
  >('idle');
  const [externalTargetUrl, setExternalTargetUrl] = useState<string>('');
  const [embedWatchdogPhase, setEmbedWatchdogPhase] = useState<
    'watching' | 'verified' | 'window_preferred' | 'exhausted'
  >('watching');
  const [inlineRetryUrl, setInlineRetryUrl] = useState<string>('');
  const [inlineRetryNonce, setInlineRetryNonce] = useState<number>(0);

  const activeEmbedInlineUrl =
    videoState.mode === 'embed'
      ? videoState.tracks[videoState.activeTrackIndex]?.resolvedStreamUrl ||
        videoState.tracks[videoState.activeTrackIndex]?.sourceUrl ||
        videoState.url ||
        ''
      : '';
  const rawActiveEmbedUrl =
    videoState.mode === 'embed'
      ? videoState.tracks[videoState.activeTrackIndex]?.sourceUrl ||
        videoState.tracks[videoState.activeTrackIndex]?.resolvedStreamUrl ||
        videoState.url ||
        ''
      : '';
  const activeEmbedDirectUrl =
    videoState.mode === 'embed' ? unwrapEmbedUrl(rawActiveEmbedUrl || videoState.url) : '';
  const isMobileExternal = isMobileExternalTabContext();
  const embedMediaIdentityKey =
    videoState.mode === 'embed'
      ? `${videoState.rawSourceUrl || ''}::${videoState.seriesMeta?.season || ''}::${videoState.seriesMeta?.episode || ''}`
      : '';

  // Reset tried-track chain whenever movie or series episode changes
  useEffect(() => {
    if (!embedMediaIdentityKey) return;
    triedEmbedIndicesRef.current = new Set([videoState.activeTrackIndex]);
    setInlineRetryUrl('');
  }, [embedMediaIdentityKey]);

  // Poll `ref.closed` every 1s while controlled external window is open
  useEffect(() => {
    if (externalWinState !== 'open') return;
    const pollId = window.setInterval(() => {
      const w = externalWinRef.current;
      if (!w || w.closed) {
        externalWinRef.current = null;
        setExternalWinState('closed');
      }
    }, 1000);
    return () => {
      window.clearInterval(pollId);
    };
  }, [externalWinState]);

  // If external window is already open and episode/season/server changes, navigate that SAME window
  useEffect(() => {
    if (videoState.mode !== 'embed' || !activeEmbedDirectUrl) return;
    if (externalWinState !== 'open') return;
    const w = externalWinRef.current;
    if (!w || w.closed) {
      externalWinRef.current = null;
      setExternalWinState('closed');
      return;
    }
    if (lastNavigatedExternalUrlRef.current !== activeEmbedDirectUrl) {
      lastNavigatedExternalUrlRef.current = activeEmbedDirectUrl;
      setExternalTargetUrl(activeEmbedDirectUrl);
      try {
        w.location.href = activeEmbedDirectUrl;
      } catch {
        // ignore cross-origin restrictions if browser blocks location write
      }
    }
  }, [videoState.mode, activeEmbedDirectUrl, externalWinState]);

  // Inline Embed Watchdog (17s) + localStorage per-server preference
  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (
      videoState.mode !== 'embed' ||
      !activeEmbedDirectUrl ||
      isExtracting ||
      externalWinState === 'open'
    ) {
      return;
    }

    triedEmbedIndicesRef.current.add(videoState.activeTrackIndex);
    lastAttemptedEmbedUrlRef.current = activeEmbedDirectUrl;

    const savedStatus = getEmbedServerStatus(activeEmbedDirectUrl);
    if (savedStatus === 'inline_ok') {
      setEmbedWatchdogPhase('verified');
      return;
    }
    if (savedStatus === 'window_required' && inlineRetryUrl !== activeEmbedDirectUrl) {
      setEmbedWatchdogPhase('window_preferred');
      return;
    }

    setEmbedWatchdogPhase('watching');
    const snapshotUrl = activeEmbedDirectUrl;
    const snapshotIdx = videoState.activeTrackIndex;

    watchdogTimerRef.current = setTimeout(() => {
      watchdogTimerRef.current = null;
      setEmbedServerStatus(snapshotUrl, 'window_required');

      const webIndices = videoState.tracks
        .map((tr, i) => ({ tr, i }))
        .filter(({ tr, i }) => i !== snapshotIdx && tr.resolverType === 'web_embed')
        .map(({ i }) => i);

      const nextUntriedIdx = webIndices.find((i) => !triedEmbedIndicesRef.current.has(i));

      if (nextUntriedIdx !== undefined) {
        triedEmbedIndicesRef.current.add(nextUntriedIdx);
        latestSelectTrackRef.current(nextUntriedIdx, latestCurrentTimeRef.current);
      } else {
        lastAttemptedEmbedUrlRef.current = snapshotUrl;
        setEmbedWatchdogPhase('exhausted');
      }
    }, 17_000);

    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [
    videoState.mode,
    videoState.activeTrackIndex,
    videoState.tracks,
    activeEmbedDirectUrl,
    isExtracting,
    externalWinState,
    inlineRetryUrl,
    inlineRetryNonce,
  ]);

  // Listen for iframe playback / VidFast ready status postMessage to immediately verify inline playback
  useEffect(() => {
    if (videoState.mode !== 'embed' || !activeEmbedDirectUrl) return;
    const onMessage = (ev: MessageEvent) => {
      const d = ev?.data;
      if (!d || typeof d !== 'object') return;
      const isProxyReady =
        d.source === 'naim-embed-proxy' &&
        (d.event === 'playing' || d.event === 'loadeddata');
      const isVidfastReady = d.event === 'status' && Number(d.data) === 200;
      const isGenericPlayerReady =
        d.type === 'PLAYER_EVENT' || (d.event === 'ready' && Boolean(d.data));
      if (isProxyReady || isVidfastReady || isGenericPlayerReady) {
        setEmbedServerStatus(activeEmbedDirectUrl, 'inline_ok');
        setEmbedWatchdogPhase('verified');
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [videoState.mode, activeEmbedDirectUrl]);

  // Clear timers on unmount without force-closing user's external window
  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, []);

  const openControlledExternalWindow = useCallback(
    (urlOverride?: string) => {
      const targetUrl = unwrapEmbedUrl(
        urlOverride ||
          externalTargetUrl ||
          lastAttemptedEmbedUrlRef.current ||
          activeEmbedDirectUrl
      );
      if (!targetUrl) return;
      setExternalTargetUrl(targetUrl);

      if (externalWinRef.current && !externalWinRef.current.closed) {
        lastNavigatedExternalUrlRef.current = targetUrl;
        try {
          externalWinRef.current.location.href = targetUrl;
          externalWinRef.current.focus();
        } catch {
          // ignore
        }
        setExternalWinState('open');
        return;
      }

      const features = isMobileExternal
        ? undefined
        : 'width=1280,height=720,menubar=no,toolbar=no';
      let opened: Window | null = null;
      try {
        opened = window.open(targetUrl, 'cineplayer', features);
      } catch {
        opened = null;
      }

      if (!opened) {
        setExternalWinState('blocked');
        showTransientToast('Permite ventanas emergentes para este sitio');
        return;
      }

      externalWinRef.current = opened;
      lastNavigatedExternalUrlRef.current = targetUrl;
      setExternalWinState('open');
      try {
        opened.focus();
      } catch {
        // ignore
      }
    },
    [externalTargetUrl, activeEmbedDirectUrl, isMobileExternal, showTransientToast]
  );

  const handleFocusExternalWindow = useCallback(() => {
    const w = externalWinRef.current;
    if (!w || w.closed) {
      externalWinRef.current = null;
      setExternalWinState('closed');
      return;
    }
    try {
      w.focus();
    } catch {
      // ignore
    }
  }, []);

  const handleCloseExternalWindow = useCallback(() => {
    const w = externalWinRef.current;
    externalWinRef.current = null;
    try {
      w?.close();
    } catch {
      // ignore
    }
    setExternalWinState('idle');
  }, []);

  const handleSelectExternalServer = useCallback(
    (trackIdx: number) => {
      const track = videoState.tracks[trackIdx];
      if (!track) return;
      const targetUrl = unwrapEmbedUrl(track.sourceUrl || track.resolvedStreamUrl || '');
      if (targetUrl && externalWinRef.current && !externalWinRef.current.closed) {
        lastNavigatedExternalUrlRef.current = targetUrl;
        setExternalTargetUrl(targetUrl);
        try {
          externalWinRef.current.location.href = targetUrl;
        } catch {
          // ignore
        }
      }
      onSelectTrack(trackIdx, currentTime);
    },
    [videoState.tracks, onSelectTrack, currentTime]
  );

  const handleMarkInlineServerWorking = useCallback(() => {
    if (!activeEmbedDirectUrl) return;
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    setEmbedServerStatus(activeEmbedDirectUrl, 'inline_ok');
    setEmbedWatchdogPhase('verified');
    showTransientToast('Servidor guardado como funcional');
  }, [activeEmbedDirectUrl, showTransientToast]);

  const handleRetryInlineEmbed = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    setExternalWinState('idle');
    setInlineRetryUrl(activeEmbedDirectUrl);
    setInlineRetryNonce((n) => n + 1);
    setEmbedWatchdogPhase('watching');
  }, [activeEmbedDirectUrl]);

  return {
    externalWinState,
    externalTargetUrl,
    embedWatchdogPhase,
    activeEmbedInlineUrl,
    activeEmbedDirectUrl,
    lastAttemptedEmbedUrl: lastAttemptedEmbedUrlRef.current,
    isMobileExternal,
    openControlledExternalWindow,
    handleFocusExternalWindow,
    handleCloseExternalWindow,
    handleSelectExternalServer,
    handleMarkInlineServerWorking,
    handleRetryInlineEmbed,
  };
}
