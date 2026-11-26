import { useEffect, useRef, type MutableRefObject } from 'react';
import Hls from 'hls.js';
import { pickLang } from '../../utils/i18n';
import { socketService } from '../../services/socket';
import type { AppLanguage, VideoState } from '../../types';
import { formatTimecode, type StreamRefreshPhase } from './playerTypes';
import {
  createLivePlaybackHealthMonitor,
  isAndroidChromeBrowser,
} from './hlsHealthWatchdog';

const ABR_BW_STORAGE_KEY = 'riffan_abr_bw_bps';
const DEFAULT_ABR_BW_BPS = 8_500_000;

function readSavedAbrBandwidthBps(): number {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_ABR_BW_BPS;
  try {
    const raw = Number(window.localStorage.getItem(ABR_BW_STORAGE_KEY) || '');
    if (Number.isFinite(raw) && raw >= 600_000 && raw <= 28_000_000) {
      return Math.round(raw);
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_ABR_BW_BPS;
}

function saveAbrBandwidthBps(bps: unknown): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const num = Number(bps);
  if (!Number.isFinite(num) || num < 600_000) return;
  const clamped = Math.min(28_000_000, Math.max(600_000, Math.round(num)));
  try {
    window.localStorage.setItem(ABR_BW_STORAGE_KEY, String(clamped));
  } catch {
    // ignore storage errors
  }
}

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
  setStreamRefreshPhase: (phase: StreamRefreshPhase) => void;
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
    setStreamRefreshPhase,
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
    let liveStartupSlaTimer: ReturnType<typeof setTimeout> | null = null;
    let frameHealthInterval: ReturnType<typeof setInterval> | null = null;
    let liveAutoReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let didTriggerBackupSwitch = false;
    let triedInlineBackupUrl = false;
    let firstFrameBuffered = false;
    let lastBackupSwitchAt = 0;
    let lastAbrSaveAt = 0;
    const isAndroidChrome = isAndroidChromeBrowser();
    const liveHealthMonitor = createLivePlaybackHealthMonitor();
    const targetResumeSec =
      !videoState.isLive && Number.isFinite(videoState.currentTime) && videoState.currentTime > 3
        ? Math.floor(videoState.currentTime)
        : 0;

    const triggerBackupSwitch = (reason: string) => {
      const now = Date.now();
      if (
        cancelled ||
        !onAutoSwitchBackupTrack ||
        (videoState.tracks?.length || 0) <= 1 ||
        (didTriggerBackupSwitch && now - lastBackupSwitchAt < 10_000)
      ) {
        return false;
      }
      didTriggerBackupSwitch = true;
      lastBackupSwitchAt = now;
      setStreamRefreshPhase('switching');
      setIsBuffering(true);
      const liveOrCurrentSec = videoState.isLive
        ? 0
        : Math.max(targetResumeSec, Math.floor(video.currentTime || 0));
      onAutoSwitchBackupTrack(reason, liveOrCurrentSec);
      return true;
    };
    streamLoadStartRef.current = Date.now();
    rebufferCountRef.current = 0;
    qoeStartupSentForUrlRef.current = '';
    setStreamRefreshPhase('idle');
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
      const isFastLocalLiveUrl =
        /\/api\/(?:dvb-live|belix\/stream|xtream\/stream|iptv\/live|providers\/stream|stream\b)/i.test(
          videoState.url
        );
      const isSmartTvUa =
        typeof navigator !== 'undefined' &&
        /Tizen|SMART-TV|Web0S|webOS|BRAVIA|VIDAA|NetCast|AFT[A-Z]/i.test(
          navigator.userAgent || ''
        );
      const hls = new Hls({
        enableWorker: !isSmartTvUa,
        lowLatencyMode: false,
        startFragPrefetch: true,
        startPosition: targetResumeSec > 3 ? targetResumeSec : -1,
        liveSyncDurationCount: videoState.isLive ? 2 : 3,
        liveMaxLatencyDurationCount: 6,
        maxLiveSyncPlaybackRate: videoState.isLive ? 1.04 : 1,
        backBufferLength: 24,
        maxBufferLength: videoState.isLive ? 28 : 38,
        maxMaxBufferLength: videoState.isLive ? 60 : 80,
        maxBufferHole: 0.6,
        maxFragLookUpTolerance: 0.35,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: videoState.isLive ? 0.08 : 0.1,
        nudgeMaxRetry: 10,
        stretchShortVideoTrack: !videoState.isLive,
        maxAudioFramesDrift: videoState.isLive ? 3 : 4,
        abrEwmaFastLive: 2.0,
        abrEwmaSlowLive: 6.0,
        abrEwmaDefaultEstimate: readSavedAbrBandwidthBps(),
        manifestLoadingTimeOut: videoState.isLive ? 4_500 : isFastLocalLiveUrl ? 5_000 : 5_500,
        manifestLoadingMaxRetry: videoState.isLive ? 1 : 2,
        manifestLoadingRetryDelay: 100,
        levelLoadingTimeOut: videoState.isLive ? 4_500 : 5_500,
        levelLoadingMaxRetry: videoState.isLive ? 1 : 2,
        levelLoadingRetryDelay: 100,
        fragLoadingTimeOut: videoState.isLive ? 5_500 : 7_000,
        fragLoadingMaxRetry: videoState.isLive ? 1 : 2,
        fragLoadingRetryDelay: 100,
      });
      hlsRef.current = hls;

      if (videoState.isLive) {
        const hasInlineBackup =
          Boolean(videoState.backupStreamUrl) && videoState.backupStreamUrl !== videoState.url;
        const slaMs = hasInlineBackup
          ? 2_400
          : (videoState.tracks?.length || 0) > 1
            ? 3_800
            : 5_800;
        liveStartupSlaTimer = setTimeout(() => {
          if (cancelled || firstFrameBuffered || hlsRef.current !== hls) return;
          if (video.readyState < 2 || video.videoWidth === 0) {
            if (
              hasInlineBackup &&
              !triedInlineBackupUrl &&
              videoState.backupStreamUrl
            ) {
              triedInlineBackupUrl = true;
              setStreamRefreshPhase('switching');
              setIsBuffering(true);
              try {
                hls.stopLoad();
                hls.loadSource(videoState.backupStreamUrl);
                hls.startLoad(-1);
                liveStartupSlaTimer = setTimeout(() => {
                  if (!cancelled && !firstFrameBuffered && hlsRef.current === hls) {
                    if (video.readyState < 2 || video.videoWidth === 0) {
                      triggerBackupSwitch('live_startup_sla_exceeded');
                    }
                  }
                }, 3_200);
                return;
              } catch {
                // fall through to track switch
              }
            }
            triggerBackupSwitch('live_startup_sla_exceeded');
          }
        }, slaMs);
      }

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

        const getBufferedAheadSec = (): number => {
          let ahead = 0;
          try {
            for (let i = 0; i < video.buffered.length; i++) {
              const bStart = video.buffered.start(i);
              const bEnd = video.buffered.end(i);
              if (video.currentTime >= bStart - 0.15 && video.currentTime <= bEnd) {
                ahead = Math.max(ahead, bEnd - video.currentTime);
              }
            }
          } catch {
            // ignore
          }
          return ahead;
        };

        if (videoState.isLive) {
          if (frameHealthInterval) clearInterval(frameHealthInterval);
          liveHealthMonitor.reset();
          let lastSoftReconnectAt = 0;
          frameHealthInterval = setInterval(() => {
            if (cancelled || !video || hlsRef.current !== hls) return;
            const res = liveHealthMonitor.check(video, Date.now(), videoState.isPlaying);
            if (res.action === 'healthy' && !res.isStalled && video.readyState >= 3 && !video.paused) {
              setStreamRefreshPhase('idle');
              clearBufferingIndicator();
            }
            if (res.isStalled) {
              setIsBuffering(true);
            }
            if (res.action === 'recover_signal') {
              setStreamRefreshPhase('recovering');
              setIsBuffering(true);
              try {
                let nudged = false;
                const bufferedAhead = getBufferedAheadSec();
                for (let i = 0; i < video.buffered.length; i++) {
                  const bStart = video.buffered.start(i);
                  const bEnd = video.buffered.end(i);
                  if (bStart > video.currentTime + 0.08 && bStart - video.currentTime <= 4 && bEnd - bStart >= 0.3) {
                    video.currentTime = bStart + 0.05;
                    video.play().catch(() => {});
                    nudged = true;
                    break;
                  }
                }
                if (!nudged && bufferedAhead < 1.5) {
                  hls.startLoad(-1);
                }
              } catch {
                // ignore
              }
            } else if (res.action === 'recover_media') {
              setStreamRefreshPhase('recovering');
              setIsBuffering(true);
              try {
                hls.recoverMediaError();
              } catch {
                // ignore
              }
            } else if (res.action === 'soft_reconnect') {
              const bufferedAhead = getBufferedAheadSec();
              const nowMs = Date.now();
              setStreamRefreshPhase('reconnecting');
              setIsBuffering(true);
              try {
                if (bufferedAhead < 0.4 && nowMs - lastSoftReconnectAt >= 12_000) {
                  lastSoftReconnectAt = nowMs;
                  hls.stopLoad();
                  hls.loadSource(videoState.url);
                }
                hls.startLoad(-1);
                video.play().catch(() => {});
              } catch {
                // ignore
              }
            } else if (res.action === 'switch_backup') {
              const switched = triggerBackupSwitch(res.reason || 'live_corruption');
              if (!switched) {
                const nowMs = Date.now();
                setStreamRefreshPhase('reconnecting');
                setIsBuffering(true);
                try {
                  if (nowMs - lastSoftReconnectAt >= 8_000) {
                    lastSoftReconnectAt = nowMs;
                    hls.stopLoad();
                    hls.loadSource(videoState.url);
                  }
                  hls.startLoad(-1);
                  video.play().catch(() => {});
                } catch {
                  // ignore
                }
              }
            }
          }, 1000);
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
      let singleTrackLiveRetries = 0;
      let parsingBurstErrors = 0;
      let liveNetworkStallBurst = 0;
      let lastNonFatalRecoverAt = 0;

      const getNonFatalBufferedAhead = (): number => {
        let ahead = 0;
        try {
          for (let i = 0; i < video.buffered.length; i++) {
            const bStart = video.buffered.start(i);
            const bEnd = video.buffered.end(i);
            if (video.currentTime >= bStart - 0.15 && video.currentTime <= bEnd) {
              ahead = Math.max(ahead, bEnd - video.currentTime);
            }
          }
        } catch {
          // ignore
        }
        return ahead;
      };

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        const nowAbr = Date.now();
        if (nowAbr - lastAbrSaveAt >= 6_000) {
          lastAbrSaveAt = nowAbr;
          saveAbrBandwidthBps((hls as unknown as { bandwidthEstimate?: number }).bandwidthEstimate);
        }
        if (video.videoWidth > 0 && video.readyState >= 2) {
          firstFrameBuffered = true;
          if (liveStartupSlaTimer) {
            clearTimeout(liveStartupSlaTimer);
            liveStartupSlaTimer = null;
          }
          networkRecoveries = 0;
          singleTrackLiveRetries = 0;
          parsingBurstErrors = 0;
          liveNetworkStallBurst = 0;
          setStreamError(null);
          setStreamRefreshPhase('idle');
          clearBufferingIndicator();
        }
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) {
          if (
            videoState.isLive &&
            (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
              data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
              data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
              data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
              data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT ||
              data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR)
          ) {
            liveNetworkStallBurst += 1;
            const bufferedAhead = getNonFatalBufferedAhead();
            const genuinelyStarved = bufferedAhead < 0.8 || video.readyState < 3;
            if (liveNetworkStallBurst >= 2 && genuinelyStarved) {
              setStreamRefreshPhase(liveNetworkStallBurst >= 3 ? 'reconnecting' : 'recovering');
              setIsBuffering(true);
            }
            if (liveNetworkStallBurst >= 3 && Date.now() - lastNonFatalRecoverAt > 3500) {
              lastNonFatalRecoverAt = Date.now();
              const stillInStartupWindow =
                !firstFrameBuffered && Date.now() - streamLoadStartRef.current < 5_500;
              if (stillInStartupWindow || !triggerBackupSwitch(`live_${data.details}`)) {
                try {
                  hls.startLoad(-1);
                } catch {
                  // ignore
                }
              }
            }
            return;
          }
          if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR ||
              data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR)
          ) {
            parsingBurstErrors += 1;
            const threshold = isAndroidChrome ? 3 : 5;
            if (parsingBurstErrors === 2 && Date.now() - lastNonFatalRecoverAt > 15_000) {
              lastNonFatalRecoverAt = Date.now();
              setStreamRefreshPhase('recovering');
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

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
          networkRecoveries += 1;
          setStreamRefreshPhase(networkRecoveries >= 2 ? 'reconnecting' : 'recovering');
          setIsBuffering(true);
          setTimeout(() => {
            if (!cancelled && hlsRef.current === hls) {
              hls.startLoad(-1);
            }
          }, 350);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < maxMediaRecoveries) {
          mediaRecoveries += 1;
          setStreamRefreshPhase('recovering');
          setIsBuffering(true);
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
              clearBufferingIndicator();
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
        } else if (videoState.isLive && singleTrackLiveRetries < 2) {
          singleTrackLiveRetries += 1;
          setStreamError(null);
          setStreamRefreshPhase('reconnecting');
          setIsBuffering(true);
          if (liveAutoReconnectTimer) clearTimeout(liveAutoReconnectTimer);
          liveAutoReconnectTimer = setTimeout(() => {
            if (cancelled || hlsRef.current !== hls) return;
            networkRecoveries = 0;
            mediaRecoveries = 0;
            try {
              hls.stopLoad();
              hls.loadSource(videoState.url);
              hls.startLoad(-1);
              video.play().catch(() => {});
            } catch {
              // ignore
            }
          }, 1200);
        } else {
          if (!video.paused && video.readyState >= 3) return;
          clearBufferingIndicator();
          setStreamRefreshPhase('idle');
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
      let triedTranscodeFallback = /[?&](?:transcode=1|remux=mp4)\b/i.test(videoState.url);
      let directStartupTimer: ReturnType<typeof setTimeout> | null = null;

      const tryTranscodeRetry = (): boolean => {
        if (cancelled || triedTranscodeFallback) return false;
        if (!/^\/api\/(?:stream|xtream\/vod\/|providers\/stream\/)/i.test(videoState.url)) return false;
        triedTranscodeFallback = true;
        setIsBuffering(true);
        const sep = videoState.url.includes('?') ? '&' : '?';
        video.src = `${videoState.url}${sep}transcode=1`;
        video.load();
        return true;
      };

      const onDirectLoaded = () => {
        if (directStartupTimer) {
          clearTimeout(directStartupTimer);
          directStartupTimer = null;
        }
        // Detect audio-only MKV/HEVC containers early and switch seamlessly to ?transcode=1
        if (
          video.readyState >= 1 &&
          video.videoWidth === 0 &&
          /^\/api\/(?:stream|xtream\/vod\/|providers\/stream\/)/i.test(videoState.url) &&
          !triedTranscodeFallback
        ) {
          directStartupTimer = setTimeout(() => {
            if (!cancelled && video.videoWidth === 0) {
              tryTranscodeRetry();
            }
          }, 550);
          return;
        }
        setIsBuffering(false);
        startPlaybackSafely();
      };
      const onDirectError = () => {
        if (cancelled) return;
        if (tryTranscodeRetry()) return;
        if (directStartupTimer) {
          clearTimeout(directStartupTimer);
          directStartupTimer = null;
        }
        if (triggerBackupSwitch('direct_mp4_error')) {
          setIsBuffering(true);
          return;
        }
        setIsBuffering(false);
        setStreamError(
          pickLang(lang, {
            es: 'Esta señal directa no responde ahora mismo. Pulsa Reintentar o elige otro servidor.',
            ca: 'Aquest senyal directe no respon ara mateix. Prem Reintentar o tria un altre servidor.',
            en: 'This direct video stream failed to load. Press Retry or choose another server.',
          })
        );
      };

      if (/^\/api\/(?:stream|xtream\/vod\/|providers\/stream\/)/i.test(videoState.url) && !triedTranscodeFallback) {
        directStartupTimer = setTimeout(() => {
          if (!cancelled && (video.readyState === 0 || video.videoWidth === 0)) {
            tryTranscodeRetry();
          }
        }, 2_600);
      }

      cleanupDirectListeners = () => {
        if (directStartupTimer) {
          clearTimeout(directStartupTimer);
          directStartupTimer = null;
        }
        video.removeEventListener('loadedmetadata', onDirectLoaded);
        video.removeEventListener('loadeddata', onDirectLoaded);
        video.removeEventListener('error', onDirectError);
      };
      video.addEventListener('loadedmetadata', onDirectLoaded, { once: true });
      video.addEventListener('loadeddata', onDirectLoaded, { once: true });
      video.addEventListener('error', onDirectError);
      video.src = videoState.url;
    }

    return () => {
      cancelled = true;
      cleanupDirectListeners?.();
      if (videoWatchdogTimer) clearTimeout(videoWatchdogTimer);
      if (liveStartupSlaTimer) clearTimeout(liveStartupSlaTimer);
      if (frameHealthInterval) clearInterval(frameHealthInterval);
      if (liveAutoReconnectTimer) clearTimeout(liveAutoReconnectTimer);
      setStreamRefreshPhase('idle');
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

  // Continuous 3s Watch-Party clock-drift monitor (smooth 0.95x-1.06x catch-up using NTP-calibrated clock)
  useEffect(() => {
    if (
      videoState.isLive ||
      !videoState.isPlaying ||
      !videoState.url ||
      (videoState.mode !== 'hls' && videoState.mode !== 'direct')
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.seeking || video.readyState < 2) return;
      if (isApplyingRemoteRef.current) return;
      if (!Number.isFinite(videoState.currentTime) || !Number.isFinite(videoState.lastUpdated) || videoState.lastUpdated <= 0) {
        return;
      }

      const baseRate = playbackSpeedRef.current || 1;
      // socketService.serverClockOffsetMs tracks NTP RTT/2 accuracy for logging/telemetry;
      // videoState.lastUpdated is already normalized to local clock on receipt.
      void socketService.serverClockOffsetMs;
      const rawElapsedSec = Math.max(0, (Date.now() - videoState.lastUpdated) / 1000);
      if (rawElapsedSec >= 12 * 3600) return;

      const expectedTime =
        videoState.currentTime + rawElapsedSec * baseRate + prevSyncOffsetMsRef.current / 1000;
      const signedDrift = expectedTime - (video.currentTime || 0);
      const absDrift = Math.abs(signedDrift);

      if (absDrift > 4.0) {
        isApplyingRemoteRef.current = true;
        try {
          video.playbackRate = baseRate;
          video.currentTime = Math.max(0, expectedTime);
        } catch {
          // ignore
        }
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 300);
      } else if (absDrift >= 0.45) {
        const targetRate =
          signedDrift > 0
            ? Math.min(1.06, baseRate * (absDrift > 1.5 ? 1.05 : 1.03))
            : Math.max(0.95, baseRate * (absDrift > 1.5 ? 0.95 : 0.97));
        if (Math.abs((video.playbackRate || 1) - targetRate) > 0.005) {
          try {
            video.playbackRate = targetRate;
          } catch {
            // ignore
          }
        }
      } else if (Math.abs((video.playbackRate || 1) - baseRate) > 0.005) {
        try {
          video.playbackRate = baseRate;
        } catch {
          // ignore
        }
      }
    }, 3_000);

    return () => clearInterval(intervalId);
  }, [
    videoState.isLive,
    videoState.isPlaying,
    videoState.url,
    videoState.mode,
    videoState.currentTime,
    videoState.lastUpdated,
    isApplyingRemoteRef,
    videoRef,
  ]);
}
