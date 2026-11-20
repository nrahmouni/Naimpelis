import { useCallback, useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { AppLanguage, TvRemoteCommandType, VideoState } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type { CastSessionLike, WebKitVideoElement } from './playerTypes';

export function useDirectCast(params: {
  lang: AppLanguage;
  roomCode?: string;
  videoState: VideoState;
  hasConnectedSmartTv: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  castBridgeVideoRef: React.RefObject<HTMLVideoElement | null>;
  hlsRef: React.RefObject<Hls | null>;
  setIsMuted: (muted: boolean) => void;
  setBatterySaverTvMode: React.Dispatch<React.SetStateAction<boolean>>;
  showTransientToast: (msg: string) => void;
  onOpenSmartTvModal?: () => void;
  onSendTvRemoteCommand?: (cmd: TvRemoteCommandType) => void;
}) {
  const {
    lang,
    roomCode,
    videoState,
    hasConnectedSmartTv,
    videoRef,
    castBridgeVideoRef,
    hlsRef,
    setIsMuted,
    setBatterySaverTvMode,
    showTransientToast,
    onOpenSmartTvModal,
    onSendTvRemoteCommand,
  } = params;

  const [castSdkReady, setCastSdkReady] = useState(false);
  const [isCastingToTv, setIsCastingToTv] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string>('');
  const videoPlayingRef = useRef(videoState.isPlaying);
  videoPlayingRef.current = videoState.isPlaying;

  const getCastPublicOrigin = useCallback(() => {
    if (typeof window === 'undefined') return '';
    if (
      /^ais-dev-/i.test(window.location.hostname || '') &&
      import.meta.env?.VITE_PUBLIC_APP_HOST
    ) {
      return `https://${String(import.meta.env.VITE_PUBLIC_APP_HOST)}`;
    }
    return window.location.origin;
  }, []);

  const buildCastCompatibleStreamUrl = useCallback(
    (rawUrl: string, mode: string) => {
      const publicOrigin = getCastPublicOrigin() || window.location.origin;
      const absUrl = new URL(rawUrl, publicOrigin).href;
      if (mode !== 'hls') {
        try {
          const p = new URL(absUrl);
          if (p.pathname.startsWith('/api/ts-proxy/')) {
            return `${publicOrigin}${p.pathname}${p.search}`;
          }
        } catch {
          // ignore
        }
        return absUrl;
      }
      try {
        const parsed = new URL(absUrl);
        if (parsed.pathname.startsWith('/api/hls-proxy')) {
          const sp = new URLSearchParams(parsed.search);
          sp.set('abs', '1');
          return `${publicOrigin}${parsed.pathname}?${sp.toString()}`;
        }
        if (parsed.origin !== publicOrigin) {
          return `${publicOrigin}/api/hls-proxy/stream.m3u8?url=${encodeURIComponent(
            absUrl
          )}&referer=${encodeURIComponent(parsed.origin + '/')}&abs=1`;
        }
      } catch {
        // ignore
      }
      return absUrl;
    },
    [getCastPublicOrigin]
  );

  const syncBridgeVideoSource = useCallback(() => {
    const bridgeVid = castBridgeVideoRef.current;
    const mainVid = videoRef.current;
    if (
      !bridgeVid ||
      (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
      !videoState.url
    ) {
      return '';
    }
    try {
      const absUrl = buildCastCompatibleStreamUrl(videoState.url, videoState.mode);
      if (bridgeVid.getAttribute('src') !== absUrl) {
        bridgeVid.setAttribute('src', absUrl);
        bridgeVid.load();
      }
      if (!videoState.isLive && mainVid && mainVid.currentTime > 1) {
        try {
          bridgeVid.currentTime = mainVid.currentTime;
        } catch {
          // ignore
        }
      }
      return absUrl;
    } catch {
      return videoState.url;
    }
  }, [castBridgeVideoRef, videoRef, videoState.mode, videoState.url, videoState.isLive, buildCastCompatibleStreamUrl]);

  const switchMainVideoToDirectCastUrl = useCallback(() => {
    const mainVid = videoRef.current;
    if (
      !mainVid ||
      (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
      !videoState.url
    ) {
      return;
    }
    try {
      const absUrl = buildCastCompatibleStreamUrl(videoState.url, videoState.mode);
      const savedTime = !videoState.isLive ? mainVid.currentTime || videoState.currentTime || 0 : 0;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mainVid.getAttribute('src') !== absUrl) {
        mainVid.setAttribute('src', absUrl);
        mainVid.load();
        if (savedTime > 1) {
          mainVid.addEventListener(
            'loadedmetadata',
            () => {
              try {
                mainVid.currentTime = savedTime;
              } catch {
                // ignore
              }
            },
            { once: true }
          );
        }
      }
    } catch {
      // ignore
    }
  }, [
    hlsRef,
    videoRef,
    videoState.mode,
    videoState.url,
    videoState.isLive,
    videoState.currentTime,
    buildCastCompatibleStreamUrl,
  ]);

  const loadStreamIntoCastSession = useCallback(
    async (session: CastSessionLike | null): Promise<boolean> => {
      if (
        !session ||
        !window.chrome?.cast?.media ||
        (videoState.mode !== 'hls' && videoState.mode !== 'direct') ||
        !videoState.url
      ) {
        return false;
      }

      const absoluteStreamUrl = buildCastCompatibleStreamUrl(videoState.url, videoState.mode);
      const contentType =
        videoState.mode === 'direct' ? 'video/mp4' : 'application/x-mpegurl';
      const mediaInfo = new window.chrome.cast.media.MediaInfo(
        absoluteStreamUrl,
        contentType
      );

      mediaInfo.streamType = videoState.isLive
        ? window.chrome.cast.media.StreamType.LIVE
        : window.chrome.cast.media.StreamType.BUFFERED;

      if (videoState.mode === 'hls') {
        const isFmp4 = /\.m4s|\.cmfv/i.test(videoState.rawSourceUrl || videoState.url);
        const hlsSegFmt = window.chrome.cast.media.HlsSegmentFormat;
        const hlsVidFmt = window.chrome.cast.media.HlsVideoSegmentFormat;
        if (isFmp4) {
          if (hlsSegFmt?.FMP4) mediaInfo.hlsSegmentFormat = hlsSegFmt.FMP4;
          if (hlsVidFmt?.FMP4) mediaInfo.hlsVideoSegmentFormat = hlsVidFmt.FMP4;
        } else {
          const tsFmt = hlsSegFmt?.TS || hlsSegFmt?.MPEG2_TS;
          if (tsFmt) mediaInfo.hlsSegmentFormat = tsFmt;
          if (hlsVidFmt?.MPEG2_TS) mediaInfo.hlsVideoSegmentFormat = hlsVidFmt.MPEG2_TS;
        }
      }

      if (window.chrome.cast.media.GenericMediaMetadata) {
        const metadata = new window.chrome.cast.media.GenericMediaMetadata();
        metadata.title = videoState.title || 'RiffanTV';
        metadata.subtitle =
          videoState.subtitle || (videoState.isLive ? 'TV en Directo HD' : 'Proyección Directa 1080p');
        if (videoState.poster && /^https?:\/\//i.test(videoState.poster) && window.chrome.cast.Image) {
          metadata.images = [new window.chrome.cast.Image(videoState.poster)];
        }
        mediaInfo.metadata = metadata;
      }

      if (!window.chrome.cast.media.LoadRequest || !session.loadMedia) return false;
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      if (!videoState.isLive) {
        request.currentTime = Math.floor(
          videoRef.current?.currentTime || videoState.currentTime || 0
        );
      }

      await session.loadMedia(request);

      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.pause();
        setIsMuted(true);
      }
      const friendlyName = session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
      setCastDeviceName(friendlyName);
      setIsCastingToTv(true);
      showTransientToast(`✓ Transmitiendo Vídeo + Audio en ${friendlyName}`);
      return true;
    },
    [
      videoRef,
      videoState.mode,
      videoState.url,
      videoState.rawSourceUrl,
      videoState.isLive,
      videoState.title,
      videoState.subtitle,
      videoState.poster,
      videoState.currentTime,
      setIsMuted,
      showTransientToast,
      buildCastCompatibleStreamUrl,
    ]
  );

  useEffect(() => {
    const initCastFramework = () => {
      if (!window.cast?.framework || !window.chrome?.cast) return;
      try {
        const context = window.cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: window.chrome.cast.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845',
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        setCastSdkReady(true);

        context.addEventListener(
          window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: { sessionState: string }) => {
            const state = event.sessionState;
            const SESSION_STARTED = window.cast?.framework?.SessionState.SESSION_STARTED;
            const SESSION_RESUMED = window.cast?.framework?.SessionState.SESSION_RESUMED;
            const SESSION_ENDED = window.cast?.framework?.SessionState.SESSION_ENDED;

            if (state === SESSION_STARTED || state === SESSION_RESUMED) {
              const session = context.getCurrentSession();
              setCastDeviceName(
                session?.getCastDevice?.()?.friendlyName || 'Chromecast TV'
              );
              setIsCastingToTv(true);
            } else if (state === SESSION_ENDED) {
              setIsCastingToTv(false);
              setCastDeviceName('');
              if (videoRef.current) {
                videoRef.current.muted = false;
                setIsMuted(false);
                if (videoPlayingRef.current) {
                  videoRef.current.play().catch(() => {});
                }
              }
            }
          }
        );
      } catch {
        // ignore if inside restricted sandbox
      }
    };

    if ((window.cast?.framework && window.chrome?.cast) || window.__naimCastApiReady) {
      initCastFramework();
    }
    const onCastReady = () => initCastFramework();
    window.addEventListener('naim-cast-api-ready', onCastReady);
    const prevCallback = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (typeof prevCallback === 'function') prevCallback(isAvailable);
      if (isAvailable) initCastFramework();
    };
    return () => {
      window.removeEventListener('naim-cast-api-ready', onCastReady);
    };
  }, [setIsMuted, videoRef]);

  useEffect(() => {
    const bridgeVid = castBridgeVideoRef.current as WebKitVideoElement | null;
    const mainVid = videoRef.current as WebKitVideoElement | null;

    const onRemoteConnect = (ev?: Event) => {
      setIsCastingToTv(true);
      setCastDeviceName('Smart TV (Cast Directo)');
      if (ev?.currentTarget === mainVid && hlsRef.current && mainVid) {
        switchMainVideoToDirectCastUrl();
        mainVid.muted = false;
        mainVid.play?.().catch(() => {});
      } else if (bridgeVid && bridgeVid.getAttribute('src')) {
        if (mainVid) {
          mainVid.muted = true;
          setIsMuted(true);
        }
        try {
          if (!videoState.isLive && (mainVid?.currentTime ?? 0) > 1 && mainVid) {
            bridgeVid.currentTime = mainVid.currentTime;
          }
          bridgeVid.muted = false;
          bridgeVid.play?.().catch(() => {});
        } catch {
          // ignore
        }
      }
      showTransientToast('✓ Transmitiendo Vídeo + Audio en tu Smart TV');
    };

    const onRemoteDisconnect = () => {
      setIsCastingToTv(false);
      setCastDeviceName('');
      if (bridgeVid) {
        try {
          bridgeVid.pause?.();
        } catch {
          // ignore
        }
      }
      if (mainVid) {
        mainVid.muted = false;
        setIsMuted(false);
      }
    };

    const onWebkitWirelessChange = (e: Event) => {
      const target = e.currentTarget as WebKitVideoElement | null;
      if (target?.webkitCurrentPlaybackTargetIsWireless) {
        if (target === mainVid && hlsRef.current) {
          switchMainVideoToDirectCastUrl();
        }
        target.muted = false;
        target.play?.().catch(() => {});
        setIsCastingToTv(true);
        setCastDeviceName('AirPlay TV');
        showTransientToast('✓ Transmitiendo Vídeo + Audio por AirPlay 2 en tu TV');
      } else {
        setIsCastingToTv(false);
        setCastDeviceName('');
      }
    };

    try {
      bridgeVid?.remote?.addEventListener?.('connect', onRemoteConnect);
      bridgeVid?.remote?.addEventListener?.('disconnect', onRemoteDisconnect);
      mainVid?.remote?.addEventListener?.('connect', onRemoteConnect);
      mainVid?.remote?.addEventListener?.('disconnect', onRemoteDisconnect);
      bridgeVid?.addEventListener?.(
        'webkitcurrentplaybacktargetiswirelesschanged',
        onWebkitWirelessChange
      );
      mainVid?.addEventListener?.(
        'webkitcurrentplaybacktargetiswirelesschanged',
        onWebkitWirelessChange
      );
    } catch {
      // ignore
    }

    return () => {
      try {
        bridgeVid?.remote?.removeEventListener?.('connect', onRemoteConnect);
        bridgeVid?.remote?.removeEventListener?.('disconnect', onRemoteDisconnect);
        mainVid?.remote?.removeEventListener?.('connect', onRemoteConnect);
        mainVid?.remote?.removeEventListener?.('disconnect', onRemoteDisconnect);
        bridgeVid?.removeEventListener?.(
          'webkitcurrentplaybacktargetiswirelesschanged',
          onWebkitWirelessChange
        );
        mainVid?.removeEventListener?.(
          'webkitcurrentplaybacktargetiswirelesschanged',
          onWebkitWirelessChange
        );
      } catch {
        // ignore
      }
    };
  }, [castBridgeVideoRef, hlsRef, setIsMuted, videoRef, videoState.isLive, showTransientToast, switchMainVideoToDirectCastUrl]);

  useEffect(() => {
    if (!isCastingToTv) return;
    syncBridgeVideoSource();
    if (castSdkReady && window.cast?.framework) {
      const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
      if (session && (videoState.mode === 'hls' || videoState.mode === 'direct') && videoState.url) {
        loadStreamIntoCastSession(session).catch(() => {});
      }
    }
  }, [
    isCastingToTv,
    castSdkReady,
    videoState.url,
    videoState.mode,
    loadStreamIntoCastSession,
    syncBridgeVideoSource,
  ]);

  const handleDirectCastToTv = useCallback(
    async (e?: React.MouseEvent | Event) => {
      if (e && 'stopPropagation' in e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      triggerHaptic('medium');
      const mainVideo = videoRef.current as WebKitVideoElement | null;
      const bridgeVideo = castBridgeVideoRef.current as WebKitVideoElement | null;
      const hasNativeStream =
        (videoState.mode === 'hls' || videoState.mode === 'direct') && Boolean(videoState.url);

      if (hasNativeStream) {
        syncBridgeVideoSource();
      }

      if (hasNativeStream) {
        if (mainVideo?.webkitShowPlaybackTargetPicker) {
          try {
            if (hlsRef.current) {
              switchMainVideoToDirectCastUrl();
            }
            mainVideo.webkitShowPlaybackTargetPicker();
            showTransientToast('Selecciona tu televisor en el menú AirPlay');
            return;
          } catch {
            // fallback to bridgeVideo
          }
        }
        if (bridgeVideo?.webkitShowPlaybackTargetPicker) {
          try {
            bridgeVideo.webkitShowPlaybackTargetPicker();
            showTransientToast('Selecciona tu televisor en el menú AirPlay');
            return;
          } catch {
            // continue to Cast SDK
          }
        }
      }

      if (window.cast?.framework && window.chrome?.cast) {
        try {
          const context = window.cast.framework.CastContext.getInstance();
          const existingSession = context.getCurrentSession();
          if (existingSession && isCastingToTv) {
            existingSession.endSession?.(true);
            setIsCastingToTv(false);
            setCastDeviceName('');
            showTransientToast(
              pickLang(lang, {
                es: 'Transmisión Chromecast finalizada',
                ca: 'Transmissió Chromecast finalitzada',
                en: 'Chromecast disconnected',
              })
            );
            return;
          }

          await context.requestSession();
          const session = context.getCurrentSession();
          if (session) {
            if (hasNativeStream) {
              try {
                await loadStreamIntoCastSession(session);
                return;
              } catch {
                session.endSession?.(true);
              }
            } else {
              const friendlyName =
                session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
              setCastDeviceName(friendlyName);
              setIsCastingToTv(true);
              showTransientToast(
                `${pickLang(lang, {
                  es: '✓ Conectado a',
                  ca: '✓ Connectat a',
                  en: '✓ Connected to',
                })} ${friendlyName}`
              );
              return;
            }
          }
        } catch (err: unknown) {
          const errObj = err as { code?: string };
          if (err === 'cancel' || errObj?.code === 'cancel') return;
        }
      }

      if (typeof window !== 'undefined' && window.PresentationRequest) {
        try {
          const castOrigin = getCastPublicOrigin() || window.location.origin;
          const targetTvUrl = roomCode
            ? `${castOrigin}/${encodeURIComponent(roomCode)}?tv=1`
            : `${castOrigin}/tv`;
          const presentationReq = new window.PresentationRequest([targetTvUrl]);
          const conn = await presentationReq.start();
          setIsCastingToTv(true);
          setCastDeviceName('Smart TV (Cast)');
          conn.addEventListener?.('terminate', () => {
            setIsCastingToTv(false);
            setCastDeviceName('');
          });
          conn.addEventListener?.('close', () => {
            setIsCastingToTv(false);
            setCastDeviceName('');
          });
          showTransientToast(
            pickLang(lang, {
              es: '✓ Pantalla enviada directamente a tu Smart TV',
              ca: '✓ Pantalla enviada directament a la teva Smart TV',
              en: '✓ Screen sent directly to your Smart TV',
            })
          );
          return;
        } catch (err: unknown) {
          const errObj = err as { name?: string };
          if (errObj?.name === 'AbortError' || errObj?.name === 'NotAllowedError') {
            return;
          }
        }
      }

      if (hasNativeStream) {
        if (bridgeVideo?.remote?.prompt) {
          try {
            syncBridgeVideoSource();
            await bridgeVideo.remote.prompt();
            if (!videoState.isLive && mainVideo && mainVideo.currentTime > 1) {
              bridgeVideo.currentTime = mainVideo.currentTime;
            }
            bridgeVideo.muted = false;
            await bridgeVideo.play().catch(() => {});
            if (mainVideo) {
              mainVideo.muted = true;
              mainVideo.pause?.();
              setIsMuted(true);
            }
            setIsCastingToTv(true);
            setCastDeviceName('Smart TV (Cast Directo)');
            showTransientToast(
              pickLang(lang, {
                es: '✓ Transmitiendo Vídeo + Audio directamente en tu TV',
                ca: '✓ Transmetent Vídeo + Àudio directament a la teva TV',
                en: '✓ Casting Video + Audio directly to your TV',
              })
            );
            return;
          } catch (err: unknown) {
            const errObj = err as { name?: string };
            if (errObj?.name === 'AbortError' || errObj?.name === 'NotAllowedError') {
              return;
            }
          }
        }

        if (mainVideo?.remote?.prompt) {
          try {
            if (hlsRef.current) {
              switchMainVideoToDirectCastUrl();
            }
            await mainVideo.remote.prompt();
            mainVideo.muted = false;
            await mainVideo.play?.().catch(() => {});
            setIsCastingToTv(true);
            setCastDeviceName('Smart TV (Cast Directo)');
            showTransientToast(
              pickLang(lang, {
                es: '✓ Transmitiendo Vídeo + Audio directamente en tu TV',
                ca: '✓ Transmetent Vídeo + Àudio directament a la teva TV',
                en: '✓ Casting Video + Audio directly to your TV',
              })
            );
            return;
          } catch (err: unknown) {
            const errObj = err as { name?: string };
            if (errObj?.name === 'AbortError' || errObj?.name === 'NotAllowedError') {
              return;
            }
          }
        }
      }

      if (hasConnectedSmartTv) {
        onSendTvRemoteCommand?.('reload_tv');
        setBatterySaverTvMode((v) => !v);
        showTransientToast(
          pickLang(lang, {
            es: '✓ Sincronizado directamente en tu Smart TV vinculada',
            ca: '✓ Sincronitzat directament a la teva Smart TV vinculada',
            en: '✓ Synced directly on your paired Smart TV',
          })
        );
        return;
      }

      if (onOpenSmartTvModal) {
        showTransientToast(
          hasNativeStream
            ? pickLang(lang, {
                es: 'Conecta tu LG webOS, Samsung o Google TV con código de 4 dígitos o AirPlay 2',
                ca: 'Connecta la teva LG webOS, Samsung o Google TV amb codi de 4 dígits o AirPlay 2',
                en: 'Connect your LG webOS, Samsung, or Google TV with a 4-digit code or AirPlay 2',
              })
            : pickLang(lang, {
                es: 'Elige un título o vincula tu Smart TV LG / Samsung en /tv con 4 dígitos',
                ca: 'Tria un títol o vincula la teva Smart TV LG / Samsung a /tv amb 4 dígits',
                en: 'Pick a title or pair your LG / Samsung Smart TV at /tv with 4 digits',
              })
        );
        onOpenSmartTvModal();
        return;
      }

      showTransientToast(
        pickLang(lang, {
          es: 'Usa Smart TV arriba para abrir /tv en tu LG webOS (código 4 dígitos) o AirPlay 2',
          ca: 'Fes servir Smart TV amunt per obrir /tv a la teva LG webOS (codi 4 dígits) o AirPlay 2',
          en: 'Use Smart TV above to open /tv on LG webOS (4-digit code) or AirPlay 2',
        })
      );
    },
    [
      castBridgeVideoRef,
      hlsRef,
      videoRef,
      videoState.mode,
      videoState.url,
      videoState.isLive,
      isCastingToTv,
      hasConnectedSmartTv,
      roomCode,
      lang,
      getCastPublicOrigin,
      loadStreamIntoCastSession,
      onOpenSmartTvModal,
      onSendTvRemoteCommand,
      setBatterySaverTvMode,
      setIsMuted,
      showTransientToast,
      syncBridgeVideoSource,
      switchMainVideoToDirectCastUrl,
    ]
  );

  useEffect(() => {
    const onGlobalDirectCast = (ev: Event) => {
      handleDirectCastToTv(ev);
    };
    window.addEventListener('naim-trigger-direct-cast', onGlobalDirectCast);
    return () => {
      window.removeEventListener('naim-trigger-direct-cast', onGlobalDirectCast);
    };
  }, [handleDirectCastToTv]);

  return {
    isCastingToTv,
    castDeviceName,
    syncBridgeVideoSource,
    handleDirectCastToTv,
  };
}
