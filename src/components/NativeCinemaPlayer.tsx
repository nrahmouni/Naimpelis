import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { SecondaryHlsStage } from './SecondaryHlsStage';
import { useAppStore } from '../store/useAppStore';
import { useFocusTrap } from '../utils/useFocusTrap';
import {
  type NativeCinemaPlayerProps,
  type YouTubePlayerInstance,
} from './player/playerTypes';
import { useDirectCast } from './player/useDirectCast';
import { CloudBrowserOverlay } from './player/CloudBrowserOverlay';
import { PlayerProSettingsModal } from './player/PlayerProSettingsModal';
import { VoiceWaveBars } from './games/GameVoiceBar';
import { resolveTrackLang } from './player/trackLabelUtils';
import { IdleStandbyStage } from './player/IdleStandbyStage';
import { EmbedStagePanel } from './player/EmbedStagePanel';
import { PlayerTransportBar } from './player/PlayerTransportBar';
import { MiniPlayerHud } from './player/MiniPlayerHud';
import { useEmbedExternalWindow } from './player/useEmbedExternalWindow';
import { usePlayerSubtitles } from './player/usePlayerSubtitles';
import { useYouTubeIframeSync } from './player/useYouTubeIframeSync';
import { useCinemaPlatformApis } from './player/useCinemaPlatformApis';
import { useTvReceiverRemote } from './player/useTvReceiverRemote';
import { useHlsPlaybackEngine } from './player/useHlsPlaybackEngine';
import { usePlayerControls } from './player/usePlayerControls';
import { PlayerTopHudBar } from './player/PlayerTopHudBar';
import { PlayerBottomControlStrip } from './player/PlayerBottomControlStrip';
import { PlayerStageOverlays } from './player/PlayerStageOverlays';
import { usePlayerVideoCallbacks } from './player/usePlayerVideoCallbacks';
import { PlayerFullscreenVoiceControls } from './player/PlayerFullscreenVoiceControls';
import { useNativePlayerStageState } from './player/useNativePlayerStageState';
import { PlayerVoiceBanner, PlayerYoutubeStage } from './player/PlayerYoutubeAndVoiceAlert';
import { PlayerStripVoiceControls } from './player/PlayerStripVoiceControls';
import { UI_COPY } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export const NativeCinemaPlayer: React.FC<NativeCinemaPlayerProps> = ({
  videoState,
  lang,
  isExtracting,
  extractionLabel,
  extractionError,
  cloudFrame,
  cloudState,
  floatingReactions,
  onSyncAction,
  onSelectTrack,
  onPromoteCloudStreamToNative,
  onOpenCatalogSection,
  onPrevEpisode,
  onNextEpisode,
  onProgressUpdate,
  isCinemaMode = false,
  onToggleCinemaMode,
  secondaryStream = null,
  onSwapSecondaryStream,
  onToggleSecondaryLayout,
  onCloseSecondaryStream,
  canControlRoom = true,
  isMinimized = false,
  isCompressed = false,
  onExpandCompressed,
  onToggleMinimize,
  onClosePlayer,
  onCancelExtraction,
  isTvMode = false,
  roomCode,
  roomDisplayName,
  participantCount = 1,
  onExitTvMode,
  onOpenSmartTvModal,
  hasConnectedSmartTv = false,
  onSendTvRemoteCommand,
  languageNotice = null,
  onDismissLanguageNotice,
  messages = [],
  currentUserId = '',
  floatingChatOpen = false,
  onToggleFloatingChat,
  unreadChatCount = 0,
  compactVideoForMobileKeyboard = false,
  onOpenInCloudBrowser,
  voiceChat,
  onVideoEnded,
}) => {
  const { subtitleStyle, setSubtitleStyle, syncOffsetMs, setSyncOffsetMs } = useAppStore();
  const t = UI_COPY[lang];
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
  const [batterySaverTvMode, setBatterySaverTvMode] = useState<boolean>(false);

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  const clearBufferingIndicator = useCallback(() => {
    if (bufferingDelayTimerRef.current) {
      clearTimeout(bufferingDelayTimerRef.current);
      bufferingDelayTimerRef.current = null;
    }
    setIsBuffering(false);
  }, []);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tvAspectMode, setTvAspectMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [isInPiP, setIsInPiP] = useState(false);
  const [isHorizontalFullscreen, setIsHorizontalFullscreen] = useState(false);
  const [forceLandscapeRotation, setForceLandscapeRotation] = useState(true);
  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 390, h: 844 }
  );
  const [showControls, setShowControls] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<
    { index: number; height: number; bitrate?: number }[]
  >([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [autoActiveHeight, setAutoActiveHeight] = useState<number | null>(null);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<
    { id: number; name: string; lang: string; default?: boolean }[]
  >([]);
  const [selectedHlsAudioTrack, setSelectedHlsAudioTrack] = useState<number>(-1);
  const [activeHudMenu, setActiveHudMenu] = useState<'quality' | 'audio' | null>(null);
  const [cloudUrlInput, setCloudUrlInput] = useState('');
  const [seekRipple, setSeekRipple] = useState<'left' | 'right' | null>(null);

  const [playerToast, setPlayerToast] = useState<string | null>(null);
  const [embedRescueDismissedUrl, setEmbedRescueDismissedUrl] = useState<string>('');
  const latestCurrentTimeRef = useRef<number>(0);

  const [showProMenu, setShowProMenu] = useState<boolean>(false);
  const proMenuRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showProMenu, () => setShowProMenu(false), proMenuRef);
  const [ambilightEnabled, setAmbilightEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('naim_ambilight_v1');
      if (stored !== null) return stored === 'true';
      return typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
    } catch {
      return false;
    }
  });
  const [vocalBoostEnabled, setVocalBoostEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('naim_vocal_boost_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [autoNextCancelledForUrl, setAutoNextCancelledForUrl] = useState<string>('');
  const autoNextTriggeredUrlRef = useRef<string>('');

  const showTransientToast = useCallback((msg: string) => {
    setPlayerToast(msg);
    setTimeout(() => {
      setPlayerToast((cur) => (cur === msg ? null : cur));
    }, 3400);
  }, []);

  latestCurrentTimeRef.current = currentTime;

  const {
    externalWinState,
    externalTargetUrl,
    embedWatchdogPhase,
    activeEmbedInlineUrl,
    activeEmbedDirectUrl,
    lastAttemptedEmbedUrl,
    isMobileExternal,
    openControlledExternalWindow,
    handleFocusExternalWindow,
    handleCloseExternalWindow,
    handleSelectExternalServer,
    handleMarkInlineServerWorking,
    handleRetryInlineEmbed,
  } = useEmbedExternalWindow({
    videoState,
    isExtracting,
    currentTime,
    onSelectTrack,
    showTransientToast,
  });

  const { isCastingToTv, castDeviceName, handleDirectCastToTv } = useDirectCast({
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
  });

  const {
    localLangPopup,
    setLocalLangPopup,
    recentIncomingChatBubble,
    setRecentIncomingChatBubble,
    triggerLocalLanguagePopup,
    scheduleHideControls,
    hideControlsImmediately,
    revealControls,
    isStageFullscreen,
    shouldRotate90,
  } = useNativePlayerStageState({
    videoState,
    cloudState,
    messages,
    currentUserId,
    floatingChatOpen,
    canControlRoom,
    isMinimized,
    showProMenu,
    currentTime,
    duration,
    autoNextCancelledForUrl,
    onNextEpisode,
    videoRef,
    controlsTimeoutRef,
    showControlsRef,
    lastManualHideAtRef,
    autoNextTriggeredUrlRef,
    setShowControls,
    setIsFullscreen,
    setIsHorizontalFullscreen,
    setViewportDims,
    setAutoNextCountdown,
    setCloudUrlInput,
    isFullscreen,
    isHorizontalFullscreen,
    forceLandscapeRotation,
    viewportDims,
  });

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  const {
    subtitleTracks,
    activeSubId,
    parsedCues,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleSize,
    setSubtitleSize,
    subtitleFileInputRef,
    handleSelectSubtitleTrack,
    handleUploadLocalSubtitle,
  } = usePlayerSubtitles({
    videoState,
    lang,
    showTransientToast,
    onResetMenus: () => {
      setShowProMenu(false);
      setActiveHudMenu(null);
    },
  });

  useTvReceiverRemote({
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
  });

  const { toggleVocalBoost } = useCinemaPlatformApis({
    lang,
    videoState,
    stageWrapperRef,
    videoRef,
    ambilightEnabled,
    vocalBoostEnabled,
    setVocalBoostEnabled,
    isMinimized,
    isCompressed,
    isTvMode,
    isStageFullscreen,
    isCinemaMode,
    localPlaying,
    currentTime,
    duration,
    playbackSpeed,
    setIsInPiP,
    showTransientToast,
    onNextEpisode,
    onSyncAction,
  });


  useHlsPlaybackEngine({
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
  });

  useYouTubeIframeSync({
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
  });

  const {
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
  } = usePlayerControls({
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
  });

  const videoCallbacks = usePlayerVideoCallbacks({
    videoState,
    isTvMode,
    playbackSpeed,
    currentTime,
    activeSubId,
    autoNextCancelledForUrl,
    cloudUrlInput,
    videoRef,
    autoNextTriggeredUrlRef,
    latestCurrentTimeRef,
    showControlsRef,
    lastProgressEmitRef,
    bufferingDelayTimerRef,
    controlsTimeoutRef,
    qoeStartupSentForUrlRef,
    streamLoadStartRef,
    rebufferCountRef,
    setAutoNextCountdown,
    setCurrentTime,
    setDuration,
    setIsBuffering,
    setLocalPlaying,
    setStreamError,
    setShowControls,
    setIsMuted,
    setVolume,
    clearBufferingIndicator,
    scheduleHideControls,
    onVideoEnded,
    onNextEpisode,
    canControlRoom,
    onProgressUpdate,
  });

  const canUseNativePiPOrCast = videoState.mode === 'hls' || videoState.mode === 'direct';
  const activeLanguagePopup = localLangPopup || languageNotice;
  const activeTrackObj = videoState.tracks?.[videoState.activeTrackIndex];
  const activeTrackLangCode = resolveTrackLang(activeTrackObj, {
    subtitle: videoState.subtitle,
    title: videoState.title,
  });

  const fullscreenVoiceSlot =
    !isTvMode && (isFullscreen || isHorizontalFullscreen) && voiceChat ? (
      <PlayerFullscreenVoiceControls lang={lang} voiceChat={voiceChat} />
    ) : null;

  const stripVoiceSlot = voiceChat ? (
    <PlayerStripVoiceControls
      lang={lang}
      voiceChat={voiceChat}
      waveSlot={
        <VoiceWaveBars
          active={
            !voiceChat.isMuted &&
            (voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0)
          }
          level={voiceChat.localAudioLevel}
          size="sm"
        />
      }
    />
  ) : null;

  return (
    <section
      className={`w-full ${
        isTvMode
          ? 'h-screen h-full overflow-hidden bg-black'
          : isMinimized
            ? 'overflow-hidden bg-black rounded-2xl border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9)]'
            : isCinemaMode
              ? 'bg-transparent'
              : 'overflow-hidden bg-black lg:rounded-2xl lg:border lg:border-white/[0.08] lg:shadow-2xl lg:shadow-black/60'
      }`}
    >
      <div
        ref={stageWrapperRef}
        onPointerMove={(e) => {
          if (isMinimized) return;
          if (e.pointerType === 'mouse') {
            if (Date.now() - lastManualHideAtRef.current < 350) return;
            const prev = lastMousePosRef.current;
            if (
              prev &&
              Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6 &&
              !showControlsRef.current
            ) {
              return;
            }
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            revealControls();
          }
        }}
        onPointerDownCapture={() => {
          if (showControlsRef.current) scheduleHideControls();
        }}
        onPointerMoveCapture={(e) => {
          if (e.pointerType !== 'mouse' && showControlsRef.current) scheduleHideControls();
        }}
        style={
          isStageFullscreen
            ? {
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 250,
                borderRadius: 0,
              }
            : undefined
        }
        className={`relative w-full bg-black overflow-hidden select-none transition-[height] duration-200 ${
          isTvMode || isStageFullscreen
            ? 'h-full'
            : compactVideoForMobileKeyboard
            ? 'h-[122px] sm:aspect-video'
            : isCompressed && !isMinimized
            ? 'h-[136px] sm:h-[210px] lg:h-[238px]'
            : 'aspect-video'
        } ${
          isCinemaMode && !isMinimized && !isCompressed && !isTvMode && !isStageFullscreen
            ? 'z-50 lg:rounded-2xl ring-1 ring-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        <div
          style={
            shouldRotate90
              ? {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${viewportDims.h}px`,
                  height: `${viewportDims.w}px`,
                  maxWidth: `${viewportDims.h}px`,
                  maxHeight: `${viewportDims.w}px`,
                  transform: 'translate(-50%, -50%) rotate(90deg)',
                  transformOrigin: 'center center',
                }
              : undefined
          }
          className="relative w-full h-full overflow-hidden select-none"
        >
          <PlayerTopHudBar
            videoState={videoState}
            isTvMode={isTvMode}
            isMinimized={isMinimized}
            isCompressed={isCompressed}
            isStageFullscreen={isStageFullscreen}
            isFullscreen={isFullscreen}
            isHorizontalFullscreen={isHorizontalFullscreen}
            showControls={showControls}
            localPlaying={localPlaying}
            duration={duration}
            currentTime={currentTime}
            playbackSpeed={playbackSpeed}
            isCastingToTv={isCastingToTv}
            hasConnectedSmartTv={hasConnectedSmartTv}
            showProMenu={showProMenu}
            isCinemaMode={isCinemaMode}
            isInPiP={isInPiP}
            vocalBoostEnabled={vocalBoostEnabled}
            activeSubId={activeSubId}
            canUseNativePiPOrCast={canUseNativePiPOrCast}
            voiceSlot={fullscreenVoiceSlot}
            onDirectCastToTv={handleDirectCastToTv}
            onOpenProMenu={() => setShowProMenu(true)}
            onTogglePiP={handleTogglePiP}
            onToggleMinimize={onToggleMinimize}
            onToggleFullscreen={handleToggleFullscreen}
            onExitTvMode={onExitTvMode}
            onClosePlayer={onClosePlayer}
          />

          {videoState.mode === 'idle' && !isExtracting && !isMinimized && (
            <IdleStandbyStage
              lang={lang}
              isTvMode={isTvMode}
              isFullscreen={isFullscreen}
              roomCode={roomCode}
              roomDisplayName={roomDisplayName}
              participantCount={participantCount}
              extractionError={extractionError}
              onToggleFullscreen={handleToggleFullscreen}
              onExitTvMode={onExitTvMode}
              onOpenCatalogSection={onOpenCatalogSection}
            />
          )}

          <div
            onClick={handleVideoSurfaceTap}
            className={`w-full h-full ${
              videoState.mode === 'hls' || videoState.mode === 'direct'
                ? secondaryStream && !isMinimized
                  ? 'flex items-stretch'
                  : 'block'
                : 'hidden'
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              x-webkit-airplay="allow"
              onClick={handleVideoSurfaceTap}
              onLoadedMetadata={videoCallbacks.onLoadedMetadata}
              onEnded={videoCallbacks.onEnded}
              onTimeUpdate={videoCallbacks.onTimeUpdate}
              onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
              onCanPlay={clearBufferingIndicator}
              onCanPlayThrough={clearBufferingIndicator}
              onWaiting={videoCallbacks.onWaiting}
              onPlaying={videoCallbacks.onPlaying}
              onPause={videoCallbacks.onPause}
              onVolumeChange={videoCallbacks.onVolumeChange}
              className={`${
                secondaryStream && !isMinimized && secondaryStream.layout === 'split'
                  ? 'w-1/2'
                  : 'w-full'
              } h-full ${
                tvAspectMode === 'cover'
                  ? 'object-cover'
                  : tvAspectMode === 'fill'
                  ? 'object-fill'
                  : 'object-contain'
              } bg-black cursor-pointer [transform:translateZ(0)]`}
            />

            <video
              ref={castBridgeVideoRef}
              preload="metadata"
              playsInline
              muted
              x-webkit-airplay="allow"
              className="fixed bottom-0 right-0 w-[2px] h-[2px] opacity-[0.01] pointer-events-none -z-10"
            />

            {secondaryStream &&
              !isMinimized &&
              secondaryStream.layout === 'split' &&
              onSwapSecondaryStream &&
              onToggleSecondaryLayout &&
              onCloseSecondaryStream && (
                <SecondaryHlsStage
                  secondaryStream={secondaryStream}
                  lang={lang}
                  onSwapWithPrimary={onSwapSecondaryStream}
                  onToggleLayout={onToggleSecondaryLayout}
                  onCloseSecondary={onCloseSecondaryStream}
                />
              )}
          </div>

          {secondaryStream &&
            !isMinimized &&
            secondaryStream.layout === 'corner' &&
            (videoState.mode === 'hls' || videoState.mode === 'direct') &&
            onSwapSecondaryStream &&
            onToggleSecondaryLayout &&
            onCloseSecondaryStream && (
              <SecondaryHlsStage
                secondaryStream={secondaryStream}
                lang={lang}
                onSwapWithPrimary={onSwapSecondaryStream}
                onToggleLayout={onToggleSecondaryLayout}
                onCloseSecondary={onCloseSecondaryStream}
              />
            )}

          <input
            ref={subtitleFileInputRef}
            type="file"
            accept=".srt,.vtt,text/plain"
            onChange={handleUploadLocalSubtitle}
            className="hidden"
          />

          <PlayerStageOverlays
            lang={lang}
            videoState={videoState}
            isMinimized={isMinimized}
            isCompressed={isCompressed}
            isTvMode={isTvMode}
            isStageFullscreen={isStageFullscreen}
            isExtracting={isExtracting}
            isBuffering={isBuffering}
            streamError={streamError}
            extractionLabel={extractionLabel}
            extractingTitleCopy={t.extractingTitle}
            extractingSubCopy={t.extractingSub}
            floatingReactions={floatingReactions}
            seekRipple={seekRipple}
            activeLanguagePopup={activeLanguagePopup}
            playerToast={playerToast}
            recentIncomingChatBubble={recentIncomingChatBubble}
            floatingChatOpen={floatingChatOpen}
            isCastingToTv={isCastingToTv}
            batterySaverTvMode={batterySaverTvMode}
            hasConnectedSmartTv={hasConnectedSmartTv}
            castDeviceName={castDeviceName}
            showControls={showControls}
            localPlaying={localPlaying}
            currentTime={currentTime}
            activeSubId={activeSubId}
            parsedCues={parsedCues}
            subtitleOffsetSec={subtitleOffsetSec}
            subtitleSize={subtitleSize}
            subtitleStyle={subtitleStyle}
            autoNextCountdown={autoNextCountdown}
            onDismissLocalLangPopup={() => setLocalLangPopup(null)}
            onDismissLanguageNotice={onDismissLanguageNotice}
            onDismissChatBubble={() => setRecentIncomingChatBubble(null)}
            onToggleFloatingChat={onToggleFloatingChat}
            onDisableBatterySaverTvMode={() => setBatterySaverTvMode(false)}
            onExpandCompressed={onExpandCompressed}
            onCancelExtraction={onCancelExtraction}
            onForceReloadStream={handleForceReloadStream}
            onSelectTrack={onSelectTrack}
            onSeekRelative={handleSeekRelative}
            onTogglePlay={handleTogglePlay}
            onNextEpisode={onNextEpisode}
            onAcceptAutoNext={() => {
              triggerHaptic('success');
              autoNextTriggeredUrlRef.current = videoState.url;
              setAutoNextCountdown(null);
              onNextEpisode?.();
            }}
            onCancelAutoNext={() => {
              setAutoNextCancelledForUrl(videoState.url);
              setAutoNextCountdown(null);
            }}
          />

          {videoState.mode === 'youtube' && (
            <PlayerYoutubeStage
              containerId={ytContainerId.current}
              isMinimized={isMinimized}
              isMuted={isMuted}
              lang={lang}
              onToggleMute={handleToggleMute}
            />
          )}

          {videoState.mode === 'embed' && videoState.url && (
            <EmbedStagePanel
              lang={lang}
              videoState={videoState}
              isExtracting={isExtracting}
              isMinimized={isMinimized}
              isMobileExternal={isMobileExternal}
              externalWinState={externalWinState}
              externalTargetUrl={externalTargetUrl}
              embedWatchdogPhase={embedWatchdogPhase}
              activeEmbedInlineUrl={activeEmbedInlineUrl}
              activeEmbedDirectUrl={activeEmbedDirectUrl}
              lastAttemptedEmbedUrl={lastAttemptedEmbedUrl}
              embedRescueDismissedUrl={embedRescueDismissedUrl}
              setEmbedRescueDismissedUrl={setEmbedRescueDismissedUrl}
              onPrevEpisode={onPrevEpisode}
              onNextEpisode={onNextEpisode}
              onOpenControlledExternalWindow={openControlledExternalWindow}
              onFocusExternalWindow={handleFocusExternalWindow}
              onCloseExternalWindow={handleCloseExternalWindow}
              onSelectExternalServer={handleSelectExternalServer}
              onMarkInlineServerWorking={handleMarkInlineServerWorking}
              onRetryInlineEmbed={handleRetryInlineEmbed}
              onOpenInCloudBrowser={onOpenInCloudBrowser}
            />
          )}

          {videoState.mode === 'cloud' && (
            <CloudBrowserOverlay
              lang={lang}
              videoState={videoState}
              cloudFrame={cloudFrame}
              cloudState={cloudState}
              cloudUrlInput={cloudUrlInput}
              setCloudUrlInput={setCloudUrlInput}
              isTvMode={isTvMode}
              isCinemaMode={isCinemaMode}
              onToggleCinemaMode={onToggleCinemaMode}
              onClosePlayer={onClosePlayer}
              onPromoteCloudStreamToNative={onPromoteCloudStreamToNative}
              onCloudWheel={videoCallbacks.handleCloudWheel}
              onCloudNavigate={videoCallbacks.handleCloudNavigate}
              onCloudCanvasClick={videoCallbacks.handleCloudCanvasClick}
            />
          )}

          {!isMinimized && (videoState.mode === 'hls' || videoState.mode === 'direct') && (
            <PlayerTransportBar
              lang={lang}
              mode={videoState.mode}
              isLive={videoState.isLive}
              duration={duration}
              currentTime={currentTime}
              shouldRotate90={shouldRotate90}
              showControls={showControls}
              localPlaying={localPlaying}
              isMuted={isMuted}
              volume={volume}
              hlsAudioTracks={hlsAudioTracks}
              selectedHlsAudioTrack={selectedHlsAudioTrack}
              qualityLevels={qualityLevels}
              selectedQuality={selectedQuality}
              autoActiveHeight={autoActiveHeight}
              activeHudMenu={activeHudMenu}
              setActiveHudMenu={setActiveHudMenu}
              canUseNativePiPOrCast={canUseNativePiPOrCast}
              isInPiP={isInPiP}
              isFullscreen={isFullscreen}
              isHorizontalFullscreen={isHorizontalFullscreen}
              forceLandscapeRotation={forceLandscapeRotation}
              revealControls={revealControls}
              onScrub={handleScrub}
              onTogglePlay={handleTogglePlay}
              onToggleMute={handleToggleMute}
              onVolumeSlider={handleVolumeSlider}
              onSelectHlsAudioTrack={handleSelectHlsAudioTrack}
              onChangeQuality={handleChangeQuality}
              onTogglePiP={handleTogglePiP}
              onToggleLandscapeRotation={handleToggleLandscapeRotation}
              onToggleFullscreen={handleToggleFullscreen}
            />
          )}

          {isMinimized && (
            <MiniPlayerHud
              lang={lang}
              title={videoState.title}
              mode={videoState.mode}
              isLive={videoState.isLive}
              duration={duration}
              currentTime={currentTime}
              localPlaying={localPlaying}
              isMuted={isMuted}
              volume={volume}
              canUseNativePiPOrCast={canUseNativePiPOrCast}
              onToggleMinimize={onToggleMinimize}
              onClosePlayer={onClosePlayer}
              onTogglePlay={handleTogglePlay}
              onToggleMute={handleToggleMute}
            />
          )}
        </div>
      </div>

      {!isTvMode &&
        !isMinimized &&
        !isCompressed &&
        !compactVideoForMobileKeyboard &&
        videoState.mode !== 'idle' &&
        videoState.mode !== 'cloud' && (
          <PlayerBottomControlStrip
            lang={lang}
            videoState={videoState}
            activeTrackLangCode={activeTrackLangCode}
            currentTime={currentTime}
            externalWinState={externalWinState}
            isMobileExternal={isMobileExternal}
            participantCount={participantCount}
            floatingChatOpen={floatingChatOpen}
            unreadChatCount={unreadChatCount}
            hasConnectedSmartTv={hasConnectedSmartTv}
            batterySaverTvMode={batterySaverTvMode}
            isCastingToTv={isCastingToTv}
            voiceSlot={stripVoiceSlot}
            onQuickLanguageSwitch={handleQuickLanguageSwitch}
            onSelectTrack={onSelectTrack}
            onSelectExternalServer={handleSelectExternalServer}
            onOpenControlledExternalWindow={openControlledExternalWindow}
            onOpenInCloudBrowser={onOpenInCloudBrowser}
            onToggleFloatingChat={onToggleFloatingChat}
            onToggleBatterySaverTvMode={() => setBatterySaverTvMode((v) => !v)}
            onDirectCastToTv={handleDirectCastToTv}
            onOpenProMenu={() => setShowProMenu(true)}
          />
        )}

      {!isTvMode && !isMinimized && !isCompressed && voiceChat && (
        <PlayerVoiceBanner lang={lang} voiceChat={voiceChat} />
      )}

      <PlayerProSettingsModal
        isOpen={showProMenu}
        onClose={() => setShowProMenu(false)}
        proMenuRef={proMenuRef}
        lang={lang}
        videoState={videoState}
        currentTime={currentTime}
        isCinemaMode={isCinemaMode}
        onToggleCinemaMode={onToggleCinemaMode}
        canUseNativePiPOrCast={canUseNativePiPOrCast}
        isInPiP={isInPiP}
        onTogglePiP={handleTogglePiP}
        hlsAudioTracks={hlsAudioTracks}
        selectedHlsAudioTrack={selectedHlsAudioTrack}
        onSelectHlsAudioTrack={handleSelectHlsAudioTrack}
        activeTrackLangCode={activeTrackLangCode}
        onQuickLanguageSwitch={handleQuickLanguageSwitch}
        onTriggerLanguagePopup={triggerLocalLanguagePopup}
        onSelectTrack={onSelectTrack}
        subtitleFileInputRef={subtitleFileInputRef}
        activeSubId={activeSubId}
        onSelectSubtitleTrack={handleSelectSubtitleTrack}
        subtitleTracks={subtitleTracks}
        subtitleOffsetSec={subtitleOffsetSec}
        setSubtitleOffsetSec={setSubtitleOffsetSec}
        subtitleSize={subtitleSize}
        setSubtitleSize={setSubtitleSize}
        subtitleStyle={subtitleStyle}
        setSubtitleStyle={setSubtitleStyle}
        syncOffsetMs={syncOffsetMs}
        setSyncOffsetMs={setSyncOffsetMs}
        vocalBoostEnabled={vocalBoostEnabled}
        onToggleVocalBoost={toggleVocalBoost}
        ambilightEnabled={ambilightEnabled}
        setAmbilightEnabled={setAmbilightEnabled}
        playbackSpeed={playbackSpeed}
        onSelectSpeed={handleSelectSpeed}
        qualityLevels={qualityLevels}
        selectedQuality={selectedQuality}
        autoActiveHeight={autoActiveHeight}
        onChangeQuality={handleChangeQuality}
      />
    </section>
  );
};
