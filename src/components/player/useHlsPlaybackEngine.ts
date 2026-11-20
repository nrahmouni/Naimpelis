import { useEffect, useRef, type MutableRefObject } from 'react';
import Hls from 'hls.js';
import { pickLang } from '../../utils/i18n';
import type { AppLanguage, VideoState } from '../../types';
import { formatTimecode } from './playerTypes';
import {
  createLivePlaybackHealthMonitor,
  isAndroidChromeBrowser,
} from './hlsHealthWatchdog';

interface UseHlsPlaybackEngineOptions {
  lang: AppLanguage;
  videoState: VideoState;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  hlsRef: MutableRefObject<Hls | null>;
  isApplyingRemoteRef: MutableRefObject<boolean>;
  streamLoadStartRef: MutableRefObject<number>;
  qoeStartupSentForUrlRef: MutableRefObject<string>;
  rebufferCountRef: MutableRefObject<number>;
  smoothDriftTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isCastingToTv: boolean;
  hasConnectedSmartTv: boolean;
  batterySaverTvMode: boolean;
  setBatterySaverTvMode: (next: boolean) => void;
  isTvMode: boolean;
  playbackSpeed: number;
  syncOffsetMs: number;
  setIsBuffering: (next: boolean) => void;
  clearBufferingIndicator: () => void;
  setStreamError: (err: string | null) => void;
  setQualityLevels: (levels: { index: number; height: number; bitrate?: number }[]) => void;
  setSelectedQuality: (level: number) => void;
  setAutoActiveHeight: (height: number | null) => void;
  setHlsAudioTracks: (
    tracks: { id: number; name: string; lang: string; default?: boolean }[]
  ) => void;
  setSelectedHlsAudioTrack: (trackId: number) => void;
  setActiveHudMenu: (menu: 'quality' | 'audio' | null) => void;
  setIsMuted: (muted: boolean) => void;
  setLocalPlaying: (playing: boolean) => void;
  scheduleHideControls: () => void;
  showTransientToast: (msg: string) => void;
  onAutoSwitchBackupTrack?: (reason?: string, atSec?: number) => void;
}

export function useHlsPlaybackEngine(opts: UseHlsPlaybackEngineOptions) {
  const {
    lang,
    videoState,
    videoRef,
    hlsRef,
    isApplyingRemoteRef,
    streamLoadStartRef,
    qoeStartupSentForUrlRef,
    rebufferCountRef,
    smoothDriftTimerRef,
    isCastingToTv,
    hasConnectedSmartTv,
    batterySaverTvMode,
    setBatterySaverTvMode,
    isTvMode,
    playbackSpeed,
    syncOffsetMs,
    setIsBuffering,
    clearBufferingIndicator,
    setStreamError,
    setQualityLevels,
    setSelectedQuality,
    setAutoActiveHeight,
    setHlsAudioTracks,
    setSelectedHlsAudioTrack,
    setActiveHudMenu,
    setIsMuted,
    setLocalPlaying,
    scheduleHideControls,
    showTransientToast,
    onAutoSwitchBackupTrack,
  } = opts;

  const lastSyncedEventKeyRef = useRef<string>('');
  const prevSyncOffsetMsRef = useRef<number>(syncOffsetMs);
  const playbackSpeedRef = useRef<number>(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  // Pause local phone decoding when Battery Saver Remote Mode is enabled
  useEffect(() => {
    if (!hasConnectedSmartTv && !isCastingToTv) {
      if (batterySaverTvMode) setBatterySaverTvMode(false);
      return;
    }
    const v = videoRef.current;
    if (!v || isTvMode) return;
    if (batterySaverTvMode) {
      v.pause();
    } else if (videoState.isPlaying && v.paused) {
      v.play().catch(() => {});
    }
  }, [
    batterySaverTvMode,
    hasConnectedSmartTv,
    isCastingToTv,
    isTvMode,
    videoState.isPlaying,
    setBatterySaverTvMode,
    videoRef,
  ]);

  // ============================================================================
  // ENGINE 1: NATIVE HTML5 + HLS.JS ENGINE (WITH APPLE NATIVE HLS + VIDEO WATCHDOG)
  // ============================================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setStreamError(null);
    setQualityLevels([]);
    setSelectedQuality(-1);

    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') {
      video.removeAttribute('src');
      video.load();
      return;
    }

    if (!videoState.url) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    let cancelled = false;
    let videoWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let frameHealthInterval: ReturnType<typeof setInterval> | null = null;
    let didTriggerBackupSwitch = false;
    const isAndroidChrome = isAndroidChromeBrowser();
    const liveHealthMonitor = createLivePlaybackHealthMonitor();
    const targetResumeSec =
      !videoState.isLive && Number.isFinite(videoState.currentTime) && videoState.currentTime > 3
        ? Math.floor(videoState.currentTime)
        : 0;

    const triggerBackupSwitch = (reason: string) => {
      if (
        cancelled ||
        didTriggerBackupSwitch ||
        !onAutoSwitchBackupTrack ||
        (videoState.tracks?.length || 0) <= 1
      ) {
        return false;
      }
      didTriggerBackupSwitch = true;
      const liveOrCurrentSec = videoState.isLive
        ? 0
        : Math.max(targetResumeSec, Math.floor(video.currentTime || 0));
      onAutoSwitchBackupTrack(reason, liveOrCurrentSec);
      return true;
    };
    streamLoadStartRef.current = Date.now();
    rebufferCountRef.current = 0;
    qoeStartupSentForUrlRef.current = '';
    setIsBuffering(true);

    const startPlaybackSafely = async () => {
      if (!video || cancelled) return;
      if (targetResumeSec > 3) {
        try {
          if (Math.abs((video.currentTime || 0) - targetResumeSec) > 2) {
            video.currentTime = targetResumeSec;
          }
          showTransientToast(
            `${pickLang(lang, {
              es: 'Reanudando en',
              ca: 'Reprenent a',
              en: 'Resuming at',
            })} ${formatTimecode(targetResumeSec)}`
          );
        } catch {
          // ignore
        }
      }
      if (!videoState.isPlaying) {
        video.pause();
        setLocalPlaying(false);
        return;
      }

      try {
        video.muted = isCastingToTv ? true : false;
        await video.play();
        if (cancelled) {
          video.pause();
          return;
        }
        setIsMuted(video.muted);
        setLocalPlaying(true);
        scheduleHideControls();
      } catch {
        if (cancelled) return;
        video.muted = true;
        setIsMuted(true);
        try {
          await video.play();
          setLocalPlaying(true);
          scheduleHideControls();
        } catch {
          setLocalPlaying(false);
        }
      }
    };

    const attachHlsJs = () => {
      if (!Hls.isSupported() || cancelled) return false;
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startPosition: targetResumeSec > 3 ? targetResumeSec : -1,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1,
        backBufferLength: 20,
        maxBufferLength: 35,
        maxMaxBufferLength: 75,
        maxBufferHole: videoState.isLive ? 0.3 : 0.5,
        maxFragLookUpTolerance: 0.25,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: videoState.isLive ? 0.05 : 0.1,
        nudgeMaxRetry: videoState.isLive ? 5 : 10,
        stretchShortVideoTrack: !videoState.isLive,
        maxAudioFramesDrift: videoState.isLive ? 2 : 4,
        abrEwmaDefaultEstimate: 3_500_000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 8,
        levelLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 700,
      });
      hlsRef.current = hls;

      hls.loadSource(videoState.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        clearBufferingIndicator();
        const bestByHeight = new Map<number, { index: number; height: number; bitrate: number }>();
        (data.levels || []).forEach((lvl, idx) => {
          const height = lvl.height || 0;
          if (height <= 0) return;
          const bitrate = lvl.bitrate || 0;
          const existing = bestByHeight.get(height);
          if (!existing || bitrate > existing.bitrate) {
            bestByHeight.set(height, { index: idx, height, bitrate });
          }
        });
        const dedupedLevels = Array.from(bestByHeight.values()).sort(
          (a, b) => b.height - a.height
        );
        setQualityLevels(dedupedLevels);
        setSelectedQuality(-1);

        const initialAudio = (hls.audioTracks || []).map((tr, idx) => ({
          id: typeof tr.id === 'number' ? tr.id : idx,
          name: tr.name || tr.lang || `Audio ${idx + 1}`,
          lang: (tr.lang || '').toUpperCase(),
          default: Boolean(tr.default),
        }));
        setHlsAudioTracks(initialAudio);
        setSelectedHlsAudioTrack(typeof hls.audioTrack === 'number' ? hls.audioTrack : 0);

        startPlaybackSafely();

        // Watchdog: detect green/flat corrupt H.264 frames or audio-only videoWidth===0 hangs
        // (extra fast threshold on Android Chrome to switch to a clean 1080p satellite track).
        if (videoWatchdogTimer) clearTimeout(videoWatchdogTimer);
        videoWatchdogTimer = setTimeout(() => {
          if (cancelled || !video) return;
          if (!video.paused && video.currentTime > 0.5 && video.videoWidth === 0) {
            const uaWatch = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
            const isRealAppleHls =
              Boolean(video.canPlayType('application/vnd.apple.mpegurl')) &&
              /iPhone|iPad|iPod|Macintosh|AppleTV/i.test(uaWatch) &&
              !/Chrome|CriOS|FxiOS|EdgiOS|Android/i.test(uaWatch);
            if (isAndroidChrome && triggerBackupSwitch('android_no_video_frame')) {
              return;
            }
            if (isRealAppleHls) {
              const savedT = video.currentTime;
              hls.destroy();
              hlsRef.current = null;
              video.src = videoState.url;
              video.addEventListener(
                'loadedmetadata',
                () => {
                  if (savedT > 1) {
                    try {
                      video.currentTime = savedT;
                    } catch {
                      // ignore
                    }
                  }
                  video.play().catch(() => {});
                },
                { once: true }
              );
            } else {
              hls.recoverMediaError();
              setTimeout(() => {
                if (!cancelled && !video.paused && video.videoWidth === 0) {
                  triggerBackupSwitch('persistent_no_video_frame');
                }
              }, 2200);
            }
          }
        }, isAndroidChrome ? 2600 : 4000);

        if (videoState.isLive) {
          if (frameHealthInterval) clearInterval(frameHealthInterval);
          liveHealthMonitor.reset();
          frameHealthInterval = setInterval(() => {
            if (cancelled || !video || video.paused || hlsRef.current !== hls) return;
            const res = liveHealthMonitor.check(video, Date.now());
            if (res.action === 'recover_media') {
              try {
                hls.recoverMediaError();
              } catch {
                // ignore
              }
            } else if (res.action === 'switch_backup') {
              triggerBackupSwitch(res.reason || 'live_corruption');
            }
          }, 2500);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const lvl = hls.levels?.[data.level];
        if (lvl?.height) {
          setAutoActiveHeight(lvl.height);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_evt, data) => {
        const mapped = (data.audioTracks || []).map((tr, idx) => ({
          id: typeof tr.id === 'number' ? tr.id : idx,
          name: tr.name || tr.lang || `Audio ${idx + 1}`,
          lang: (tr.lang || '').toUpperCase(),
          default: Boolean(tr.default),
        }));
        setHlsAudioTracks(mapped);
        if (typeof hls.audioTrack === 'number' && hls.audioTrack >= 0) {
          setSelectedHlsAudioTrack(hls.audioTrack);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
        if (typeof data.id === 'number') {
          setSelectedHlsAudioTrack(data.id);
        }
      });

      let mediaRecoveries = 0;
      let networkRecoveries = 0;
      let parsingBurstErrors = 0;
      let lastNonFatalRecoverAt = 0;

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        networkRecoveries = 0;
        parsingBurstErrors = 0;
        setStreamError(null);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) {
          if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR ||
              data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR)
          ) {
            parsingBurstErrors += 1;
            const threshold = isAndroidChrome ? 3 : 5;
            if (parsingBurstErrors === 2 && Date.now() - lastNonFatalRecoverAt > 15_000) {
              lastNonFatalRecoverAt = Date.now();
              try {
                hls.recoverMediaError();
              } catch {
                // ignore
              }
            } else if (parsingBurstErrors >= threshold) {
              triggerBackupSwitch(`hls_${data.details}`);
            }
          }
          return;
        }
        const uaErr = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
        const isRealAppleHls =
          Boolean(video.canPlayType('application/vnd.apple.mpegurl')) &&
          /iPhone|iPad|iPod|Macintosh|AppleTV/i.test(uaErr) &&
          !/Chrome|CriOS|FxiOS|EdgiOS|Android/i.test(uaErr);
        const maxMediaRecoveries = isAndroidChrome ? 1 : 3;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 6) {
          networkRecoveries += 1;
          setTimeout(() => {
            if (!cancelled && hlsRef.current === hls) {
              hls.startLoad();
            }
          }, 1200);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < maxMediaRecoveries) {
          mediaRecoveries += 1;
          hls.recoverMediaError();
        } else if (triggerBackupSwitch(`fatal_${data.type}_${data.details || 'error'}`)) {
          setIsBuffering(true);
        } else if (isRealAppleHls) {
          const preservedTimeSec = video.currentTime > 3 ? Math.floor(video.currentTime) : targetResumeSec;
          hls.destroy();
          hlsRef.current = null;
          video.src = videoState.url;
          video.addEventListener(
            'loadedmetadata',
            () => {
              setIsBuffering(false);
              if (preservedTimeSec > 3) {
                try {
                  video.currentTime = preservedTimeSec;
                } catch {
                  // ignore
                }
              }
              if (videoState.isPlaying) {
                video.play().catch(() => {
                  video.muted = true;
                  setIsMuted(true);
                  video.play().catch(() => {});
                });
                setLocalPlaying(true);
              }
            },
            { once: true }
          );
        } else {
          if (!video.paused && video.readyState >= 3) return;
          setIsBuffering(false);
          setStreamError(
            pickLang(lang, {
              es: 'Esta señal no responde ahora mismo. Pulsa Reintentar o elige tú otra señal debajo del reproductor.',
              ca: 'Aquest senyal no respon ara mateix. Prem Reintentar o tria un altre senyal sota el reproductor.',
              en: 'This stream is not responding right now. Press Retry or choose another signal below.',
            })
          );
        }
      });
      return true;
    };

    let cleanupDirectListeners: (() => void) | null = null;
    if (videoState.mode === 'hls') {
      // On iOS / iPadOS / macOS Safari, prefer Native Apple HLS first so AirPlay 2 always sends
      // full 1080p Video + Audio to the TV (Hls.js blob: MediaSource only sends audio over AirPlay!).
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const isAppleSafariOrIos =
        Boolean(video.canPlayType('application/vnd.apple.mpegurl')) &&
        /iPhone|iPad|iPod|Macintosh|AppleTV/i.test(ua) &&
        !/Chrome|CriOS|FxiOS|EdgiOS|Android/i.test(ua);

      if (
        isAppleSafariOrIos ||
        (isCastingToTv && Boolean(video.canPlayType('application/vnd.apple.mpegurl')))
      ) {
        video.src = videoState.url;
        const onNativeLoaded = () => {
          setIsBuffering(false);
          startPlaybackSafely();
        };
        const onNativeError = () => {
          video.removeEventListener('loadedmetadata', onNativeLoaded);
          if (!attachHlsJs()) {
            setIsBuffering(false);
          }
        };
        video.addEventListener('loadedmetadata', onNativeLoaded, { once: true });
        video.addEventListener('error', onNativeError, { once: true });
      } else if (!attachHlsJs()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoState.url;
          video.addEventListener(
            'loadedmetadata',
            () => {
              setIsBuffering(false);
              startPlaybackSafely();
            },
            { once: true }
          );
        } else {
          setIsBuffering(false);
          setStreamError('HLS not supported on this browser');
        }
      }
    } else if (videoState.mode === 'direct') {
      const onDirectLoaded = () => {
        setIsBuffering(false);
        startPlaybackSafely();
      };
      const onDirectError = () => {
        if (cancelled) return;
        if (triggerBackupSwitch('direct_mp4_error')) {
          setIsBuffering(true);
          return;
        }
        setIsBuffering(false);
        setStreamError(
          pickLang(lang, {
            es: 'Esta señal MP4 directa no responde ahora mismo. Pulsa Reintentar o elige otro servidor debajo.',
            ca: 'Aquest senyal MP4 directe no respon ara mateix. Prem Reintentar o tria un altre servidor a sota.',
            en: 'This direct MP4 stream failed to load. Press Retry or choose another server below.',
          })
        );
      };
      cleanupDirectListeners = () => {
        video.removeEventListener('loadedmetadata', onDirectLoaded);
        video.removeEventListener('error', onDirectError);
      };
      video.addEventListener('loadedmetadata', onDirectLoaded, { once: true });
      video.addEventListener('error', onDirectError, { once: true });
      video.src = videoState.url;
    }

    return () => {
      cancelled = true;
      cleanupDirectListeners?.();
      if (videoWatchdogTimer) clearTimeout(videoWatchdogTimer);
      if (frameHealthInterval) clearInterval(frameHealthInterval);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setQualityLevels([]);
      setSelectedQuality(-1);
      setAutoActiveHeight(null);
      setHlsAudioTracks([]);
      setSelectedHlsAudioTrack(-1);
      setActiveHudMenu(null);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [videoState.mode, videoState.url]);

  // Apply local playback speed without re-running remote seek drift sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || (videoState.mode !== 'hls' && videoState.mode !== 'direct')) return;
    const nextRate = playbackSpeed || 1;
    if (Math.abs((video.playbackRate || 1) - nextRate) > 0.005) {
      try {
        video.playbackRate = nextRate;
      } catch {
        // ignore
      }
    }
  }, [playbackSpeed, videoState.mode, videoRef]);

  // Apply manual sync offset delta relative to current position instead of resetting to stale videoState.currentTime
  useEffect(() => {
    const deltaMs = syncOffsetMs - prevSyncOffsetMsRef.current;
    prevSyncOffsetMsRef.current = syncOffsetMs;
    if (deltaMs === 0) return;
    const video = videoRef.current;
    if (!video || videoState.isLive || (videoState.mode !== 'hls' && videoState.mode !== 'direct')) {
      return;
    }
    if (video.readyState >= 1) {
      try {
        video.currentTime = Math.max(0, (video.currentTime || 0) + deltaMs / 1000);
      } catch {
        // ignore
      }
    }
  }, [syncOffsetMs, videoState.isLive, videoState.mode, videoRef]);

  // Synchronize remote Play / Pause / Smooth Clock-Offset Drift Compensation
  useEffect(() => {
    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') return;
    const video = videoRef.current;
    if (!video || !videoState.url) return;

    const eventKey = `${videoState.url}|${videoState.isPlaying ? 1 : 0}|${videoState.currentTime}|${videoState.lastUpdated}`;
    const isNewSyncEvent = lastSyncedEventKeyRef.current !== eventKey;
    lastSyncedEventKeyRef.current = eventKey;
    if (!isNewSyncEvent) return;

    isApplyingRemoteRef.current = true;
    if (smoothDriftTimerRef.current) {
      clearTimeout(smoothDriftTimerRef.current);
      smoothDriftTimerRef.current = null;
    }

    const baseRate = playbackSpeedRef.current || 1;

    if (!videoState.isLive && Number.isFinite(videoState.currentTime) && video.readyState >= 1) {
      const now = Date.now();
      const rawElapsedSec =
        videoState.isPlaying && Number.isFinite(videoState.lastUpdated) && videoState.lastUpdated > 0
          ? Math.max(0, (now - videoState.lastUpdated) / 1000)
          : 0;
      const elapsedSec = rawElapsedSec < 12 * 3600 ? rawElapsedSec * baseRate : 0;
      const expectedTime = videoState.currentTime + elapsedSec + prevSyncOffsetMsRef.current / 1000;
      const signedDrift = expectedTime - (video.currentTime || 0); // >0 means local client is behind
      const absDrift = Math.abs(signedDrift);

      if (absDrift > 2.5) {
        try {
          video.playbackRate = baseRate;
          video.currentTime = Math.max(0, expectedTime);
        } catch {
          // ignore
        }
      } else if (videoState.isPlaying && absDrift >= 0.35 && absDrift <= 2.0) {
        // Gentle catch-up without triggering MSE seeks or buffering stalls
        const nudgeRate =
          signedDrift > 0 ? Math.min(1.04, baseRate * 1.02) : Math.max(0.96, baseRate * 0.98);
        try {
          video.playbackRate = nudgeRate;
          smoothDriftTimerRef.current = setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.playbackRate = playbackSpeedRef.current || 1;
            }
          }, 2600);
        } catch {
          // ignore
        }
      } else if (Math.abs((video.playbackRate || 1) - baseRate) > 0.005) {
        try {
          video.playbackRate = baseRate;
        } catch {
          // ignore
        }
      }
    }

    if (videoState.isPlaying && video.paused) {
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
      setLocalPlaying(true);
    } else if (!videoState.isPlaying && !video.paused) {
      video.pause();
      setLocalPlaying(false);
    }

    const timer = setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 350);

    return () => {
      clearTimeout(timer);
      if (smoothDriftTimerRef.current) {
        clearTimeout(smoothDriftTimerRef.current);
        smoothDriftTimerRef.current = null;
      }
    };
  }, [
    videoState.isPlaying,
    videoState.currentTime,
    videoState.lastUpdated,
    videoState.mode,
    videoState.url,
    videoState.isLive,
    isApplyingRemoteRef,
    setIsMuted,
    setLocalPlaying,
    smoothDriftTimerRef,
    videoRef,
  ]);
}
