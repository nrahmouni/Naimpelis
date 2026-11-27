import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useFocusTrap } from '../utils/useFocusTrap';
import { useBackInterceptor } from '../lib/backInterceptor';
import { type NativeCinemaPlayerProps, type StreamRefreshPhase } from './player/playerTypes';
import { useDirectCast } from './player/useDirectCast';
import { PlayerProSettingsModal } from './player/PlayerProSettingsModal';
import { VoiceWaveBars } from './games/GameVoiceBar';
import { resolveTrackLang } from './player/trackLabelUtils';
import { useEmbedExternalWindow } from './player/useEmbedExternalWindow';
import { usePlayerSubtitles } from './player/usePlayerSubtitles';
import { useCinemaEnginesBundle } from './player/useCinemaEnginesBundle';
import { usePlayerControls } from './player/usePlayerControls';
import { PlayerBottomControlStrip } from './player/PlayerBottomControlStrip';
import { usePlayerVideoCallbacks } from './player/usePlayerVideoCallbacks';
import { PlayerFullscreenVoiceControls } from './player/PlayerFullscreenVoiceControls';
import { useNativePlayerStageState } from './player/useNativePlayerStageState';
import { PlayerVoiceBanner } from './player/PlayerYoutubeAndVoiceAlert';
import { PlayerStripVoiceControls } from './player/PlayerStripVoiceControls';
import { PlayerViewportContent } from './player/PlayerViewportContent';
import { SportsbookLiveTrackerPanel } from './player/SportsbookLiveTrackerPanel';
import { useTacticalVideoAnalysis } from './player/useTacticalVideoAnalysis';
import { HalftimeChiringuitoBar } from './player/HalftimeChiringuitoBar';
import {
  buildCinemaProSettingsProps,
  shouldRenderBottomControlStrip,
  shouldRenderSportsbookBelowPlayer,
} from './player/buildCinemaPlayerProps';
import {
  createStagePointerHandlers,
  getPlayerSectionClass,
  getStageWrapperClass,
  getStageWrapperStyle,
  usePlayerStagePrefs,
  usePlayerStageRefs,
} from './player/playerStageLayout';
import { UI_COPY } from '../utils/i18n';

export const NativeCinemaPlayer: React.FC<NativeCinemaPlayerProps> = ({
  videoState, lang, isExtracting, extractionLabel, extractionError,
  cloudFrame, cloudState, floatingReactions, onSyncAction, onSelectTrack,
  onAutoSwitchBackupTrack, onPromoteCloudStreamToNative, onOpenCatalogSection,
  onPrevEpisode, onNextEpisode, onProgressUpdate, isCinemaMode = false,
  onToggleCinemaMode, secondaryStream = null, secondaryStreams = [], activeAudioSlot = 0,
  onSetMultiAudioSlot, onSwapSecondaryStream,
  onToggleSecondaryLayout, onRetrySecondarySlot, onCloseSecondaryStream, canControlRoom = true,
  isMinimized = false, isCompressed = false, onExpandCompressed,
  onToggleMinimize, onClosePlayer, onCancelExtraction, isTvMode = false,
  roomCode, roomDisplayName, participantCount = 1, onExitTvMode,
  onOpenSmartTvModal, hasConnectedSmartTv = false, onSendTvRemoteCommand,
  languageNotice = null, onDismissLanguageNotice, messages = [],
  currentUserId = '', floatingChatOpen = false, onToggleFloatingChat,
  unreadChatCount = 0, compactVideoForMobileKeyboard = false,
  onOpenInCloudBrowser, voiceChat, onVideoEnded, sessionMode = 'party',
  onUpgradeSoloToParty, onShareCurrentMedia, matchContext = null, halftimeBreak = null,
}) => {
  const subtitleStyle = useAppStore((s) => s.subtitleStyle);
  const setSubtitleStyle = useAppStore((s) => s.setSubtitleStyle);
  const syncOffsetMs = useAppStore((s) => s.syncOffsetMs);
  const setSyncOffsetMs = useAppStore((s) => s.setSyncOffsetMs);
  const tacticalVisionEnabled = useAppStore((s) => s.tacticalVisionEnabled);
  const toggleTacticalVision = useAppStore((s) => s.toggleTacticalVision);
  const t = UI_COPY[lang];
  const {
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
  } = usePlayerStageRefs();
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamRefreshPhase, setStreamRefreshPhase] = useState<StreamRefreshPhase>('idle');

  const clearBufferingIndicator = useCallback(() => {
    if (bufferingDelayTimerRef.current) {
      clearTimeout(bufferingDelayTimerRef.current);
      bufferingDelayTimerRef.current = null;
    }
    setIsBuffering(false);
    setStreamRefreshPhase('idle');
  }, []);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInPiP, setIsInPiP] = useState(false);
  const [isHorizontalFullscreen, setIsHorizontalFullscreen] = useState(false);
  const [forceLandscapeRotation, setForceLandscapeRotation] = useState(true);
  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined'
      ? {
          w: Math.round(window.visualViewport?.width || window.innerWidth || 390),
          h: Math.round(window.visualViewport?.height || window.innerHeight || 844),
        }
      : { w: 390, h: 844 }
  );
  const [showControls, setShowControls] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<{ index: number; height: number; bitrate?: number }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [autoActiveHeight, setAutoActiveHeight] = useState<number | null>(null);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<{ id: number; name: string; lang: string; default?: boolean }[]>([]);
  const [selectedHlsAudioTrack, setSelectedHlsAudioTrack] = useState<number>(-1);
  const [activeHudMenu, setActiveHudMenu] = useState<'quality' | 'audio' | null>(null);
  const [cloudUrlInput, setCloudUrlInput] = useState('');
  const [seekRipple, setSeekRipple] = useState<'left' | 'right' | null>(null);
  const [embedRescueDismissedUrl, setEmbedRescueDismissedUrl] = useState<string>('');
  const [showProMenu, setShowProMenu] = useState<boolean>(false);
  const proMenuRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showProMenu, () => setShowProMenu(false), proMenuRef);
  const isFullscreenLike = isFullscreen || isHorizontalFullscreen;
  const {
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
  } = usePlayerStagePrefs({
    videoRef,
    videoUrl: videoState.url,
    videoMode: videoState.mode,
    isStageFullscreen: isTvMode || isFullscreenLike,
    isMinimized,
    forcePrimaryMuted:
      activeAudioSlot > 0 &&
      ((secondaryStreams && secondaryStreams.length > 0) || Boolean(secondaryStream)),
  });

  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [autoNextCancelledForUrl, setAutoNextCancelledForUrl] = useState<string>('');

  latestCurrentTimeRef.current = currentTime;

  useEffect(() => {
    latestCurrentTimeRef.current = 0;
    setCurrentTime(0);
    setDuration(0);
    setAutoNextCountdown(null);
    setStreamError(null);
    if (!videoState.url) {
      autoNextTriggeredUrlRef.current = '';
    }
  }, [
    videoState.url,
    videoState.mode,
    videoState.seriesMeta?.tmdbId,
    videoState.seriesMeta?.season,
    videoState.seriesMeta?.episode,
  ]);

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
    isExtracting,
    showProMenu,
    currentTime,
    duration,
    autoNextCancelledForUrl,
    onNextEpisode,
    stageWrapperRef,
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

  const { toggleVocalBoost } = useCinemaEnginesBundle({
    lang,
    videoState,
    stageWrapperRef,
    videoRef,
    hlsRef,
    ytPlayerRef,
    ytContainerId,
    isApplyingRemoteRef,
    streamLoadStartRef,
    qoeStartupSentForUrlRef,
    rebufferCountRef,
    smoothDriftTimerRef,
    subtitleTracks,
    activeSubId,
    ambilightEnabled,
    vocalBoostEnabled,
    setVocalBoostEnabled,
    isMinimized,
    isCompressed,
    isTvMode,
    isStageFullscreen,
    isCinemaMode,
    isCastingToTv,
    hasConnectedSmartTv,
    batterySaverTvMode,
    setBatterySaverTvMode,
    localPlaying,
    currentTime,
    duration,
    playbackSpeed,
    syncOffsetMs,
    setVolume,
    setIsMuted,
    setTvAspectMode,
    setShowControls,
    setAmbilightEnabled,
    setIsInPiP,
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
    setLocalPlaying,
    handleSelectSubtitleTrack,
    scheduleHideControls,
    showTransientToast,
    onSelectTrack,
    onAutoSwitchBackupTrack,
    onExitTvMode,
    onNextEpisode,
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

  useBackInterceptor(
    showProMenu,
    'player-pro-settings',
    () => setShowProMenu(false),
    { priority: 30 }
  );

  useBackInterceptor(
    activeHudMenu !== null,
    'player-hud-menu',
    () => setActiveHudMenu(null),
    { priority: 29 }
  );

  useBackInterceptor(
    isHorizontalFullscreen && !isTvMode && !isMinimized,
    'player-horizontal-fullscreen',
    () => {
      void handleToggleFullscreen();
    },
    { priority: 21 }
  );

  const videoCallbacks = usePlayerVideoCallbacks({
    videoState,
    isTvMode,
    isExtracting,
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
    setStreamRefreshPhase,
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

  const tacticalVision = useTacticalVideoAnalysis({
    enabled: tacticalVisionEnabled,
    lang,
    videoState,
    videoRef,
    cloudFrame,
    matchContext,
  });

  const stagePointerHandlers = createStagePointerHandlers({
    isMinimized, lastManualHideAtRef, lastMousePosRef, showControlsRef, revealControls, scheduleHideControls,
  });

  const showBottomStrip = shouldRenderBottomControlStrip({
    isTvMode,
    isMinimized,
    isCompressed,
    compactVideoForMobileKeyboard,
    tacticalVisionEnabled,
    videoMode: videoState.mode,
  });
  const showSportsbookBelow = shouldRenderSportsbookBelowPlayer({
    isTvMode,
    isMinimized,
    isCompressed,
    isFullscreenLike,
    compactVideoForMobileKeyboard,
    videoMode: videoState.mode,
  });

  const proSettingsProps = buildCinemaProSettingsProps({
    showProMenu,
    onClose: () => setShowProMenu(false),
    proMenuRef,
    lang,
    videoState,
    currentTime,
    isCinemaMode,
    onToggleCinemaMode,
    canUseNativePiPOrCast,
    isInPiP,
    onTogglePiP: handleTogglePiP,
    hlsAudioTracks,
    selectedHlsAudioTrack,
    onSelectHlsAudioTrack: handleSelectHlsAudioTrack,
    activeTrackLangCode,
    onQuickLanguageSwitch: handleQuickLanguageSwitch,
    onTriggerLanguagePopup: triggerLocalLanguagePopup,
    onSelectTrack,
    subtitleFileInputRef,
    activeSubId,
    onSelectSubtitleTrack: handleSelectSubtitleTrack,
    subtitleTracks,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleSize,
    setSubtitleSize,
    subtitleStyle,
    setSubtitleStyle,
    syncOffsetMs,
    setSyncOffsetMs,
    vocalBoostEnabled,
    onToggleVocalBoost: toggleVocalBoost,
    ambilightEnabled,
    setAmbilightEnabled,
    playbackSpeed,
    onSelectSpeed: handleSelectSpeed,
    qualityLevels,
    selectedQuality,
    autoActiveHeight,
    onChangeQuality: handleChangeQuality,
  });

  const effectiveMultiCount =
    (videoState.mode === 'hls' || videoState.mode === 'direct') && !isMinimized
      ? 1 + (secondaryStreams.length > 0 ? secondaryStreams.length : secondaryStream ? 1 : 0)
      : 1;
  const effectiveMultiLayout: 'corner' | 'split' =
    effectiveMultiCount >= 3
      ? 'split'
      : secondaryStreams[0]?.layout || secondaryStream?.layout || 'corner';

  return (
    <section className={getPlayerSectionClass({ isTvMode, isMinimized, isCinemaMode })}>
      <div
        ref={stageWrapperRef}
        {...stagePointerHandlers}
        style={getStageWrapperStyle(isStageFullscreen)}
        className={getStageWrapperClass({
          isTvMode,
          isStageFullscreen,
          compactVideoForMobileKeyboard,
          isCompressed,
          isMinimized,
          isCinemaMode,
          multiScreenCount: effectiveMultiCount,
          multiScreenLayout: effectiveMultiLayout,
        })}
      >
        <PlayerViewportContent
          lang={lang} videoState={videoState} isTvMode={isTvMode} isMinimized={isMinimized}
          isCompressed={isCompressed} isStageFullscreen={isStageFullscreen} isFullscreen={isFullscreen}
          isHorizontalFullscreen={isHorizontalFullscreen} forceLandscapeRotation={forceLandscapeRotation}
          shouldRotate90={shouldRotate90} viewportDims={viewportDims} showControls={showControls}
          localPlaying={localPlaying} duration={duration} currentTime={currentTime}
          playbackSpeed={playbackSpeed} isMuted={isMuted} volume={volume} isBuffering={isBuffering}
          streamRefreshPhase={streamRefreshPhase} isExtracting={isExtracting} streamError={streamError}
          extractionLabel={extractionLabel} extractionError={extractionError}
          extractingTitleCopy={t.extractingTitle} extractingSubCopy={t.extractingSub}
          floatingReactions={floatingReactions} seekRipple={seekRipple}
          activeLanguagePopup={activeLanguagePopup} playerToast={playerToast}
          recentIncomingChatBubble={recentIncomingChatBubble} floatingChatOpen={floatingChatOpen}
          isCastingToTv={isCastingToTv} batterySaverTvMode={batterySaverTvMode}
          hasConnectedSmartTv={hasConnectedSmartTv} castDeviceName={castDeviceName}
          showProMenu={showProMenu} isCinemaMode={isCinemaMode} isInPiP={isInPiP}
          vocalBoostEnabled={vocalBoostEnabled} canUseNativePiPOrCast={canUseNativePiPOrCast}
          roomCode={roomCode} roomDisplayName={roomDisplayName} participantCount={participantCount}
          tvAspectMode={tvAspectMode} secondaryStream={secondaryStream}
          secondaryStreams={secondaryStreams} activeAudioSlot={activeAudioSlot}
          activeSubId={activeSubId}
          parsedCues={parsedCues} subtitleOffsetSec={subtitleOffsetSec} subtitleSize={subtitleSize}
          subtitleStyle={subtitleStyle} subtitleFileInputRef={subtitleFileInputRef}
          autoNextCountdown={autoNextCountdown} autoNextTriggeredUrlRef={autoNextTriggeredUrlRef}
          ytContainerId={ytContainerId.current} videoRef={videoRef} castBridgeVideoRef={castBridgeVideoRef}
          cloudFrame={cloudFrame} cloudState={cloudState} cloudUrlInput={cloudUrlInput}
          setCloudUrlInput={setCloudUrlInput} isMobileExternal={isMobileExternal}
          externalWinState={externalWinState} externalTargetUrl={externalTargetUrl}
          embedWatchdogPhase={embedWatchdogPhase} activeEmbedInlineUrl={activeEmbedInlineUrl}
          activeEmbedDirectUrl={activeEmbedDirectUrl} lastAttemptedEmbedUrl={lastAttemptedEmbedUrl}
          embedRescueDismissedUrl={embedRescueDismissedUrl} setEmbedRescueDismissedUrl={setEmbedRescueDismissedUrl}
          hlsAudioTracks={hlsAudioTracks} selectedHlsAudioTrack={selectedHlsAudioTrack}
          qualityLevels={qualityLevels} selectedQuality={selectedQuality} autoActiveHeight={autoActiveHeight}
          activeHudMenu={activeHudMenu} setActiveHudMenu={setActiveHudMenu} voiceSlot={fullscreenVoiceSlot}
          setDuration={setDuration} clearBufferingIndicator={clearBufferingIndicator}
          revealControls={revealControls} setLocalLangPopup={setLocalLangPopup}
          setRecentIncomingChatBubble={setRecentIncomingChatBubble} setBatterySaverTvMode={setBatterySaverTvMode}
          setShowProMenu={(v) => setShowProMenu((prev) => (typeof v === 'boolean' ? v : !prev))}
          setAutoNextCancelledForUrl={setAutoNextCancelledForUrl}
          setAutoNextCountdown={setAutoNextCountdown} onDismissLanguageNotice={onDismissLanguageNotice}
          onToggleFloatingChat={onToggleFloatingChat} onExpandCompressed={onExpandCompressed}
          onCancelExtraction={onCancelExtraction} onToggleMinimize={onToggleMinimize}
          onClosePlayer={onClosePlayer} onExitTvMode={onExitTvMode} onToggleCinemaMode={onToggleCinemaMode}
          onOpenCatalogSection={onOpenCatalogSection} onPrevEpisode={onPrevEpisode} onNextEpisode={onNextEpisode}
          onSelectTrack={onSelectTrack} onPromoteCloudStreamToNative={onPromoteCloudStreamToNative}
          onSetMultiAudioSlot={onSetMultiAudioSlot}
          onSwapSecondaryStream={onSwapSecondaryStream} onToggleSecondaryLayout={onToggleSecondaryLayout}
          onRetrySecondarySlot={onRetrySecondarySlot}
          onCloseSecondaryStream={onCloseSecondaryStream} onOpenInCloudBrowser={onOpenInCloudBrowser}
          handleDirectCastToTv={handleDirectCastToTv} handleTogglePiP={handleTogglePiP}
          handleToggleFullscreen={handleToggleFullscreen}
          handleToggleLandscapeRotation={handleToggleLandscapeRotation}
          handleVideoSurfaceTap={handleVideoSurfaceTap}
          handleUploadLocalSubtitle={handleUploadLocalSubtitle}
          handleForceReloadStream={handleForceReloadStream} handleSeekRelative={handleSeekRelative}
          handleTogglePlay={handleTogglePlay} handleToggleMute={handleToggleMute}
          handleVolumeSlider={handleVolumeSlider} handleScrub={handleScrub}
          handleSelectHlsAudioTrack={handleSelectHlsAudioTrack} handleChangeQuality={handleChangeQuality}
          openControlledExternalWindow={openControlledExternalWindow}
          handleFocusExternalWindow={handleFocusExternalWindow}
          handleCloseExternalWindow={handleCloseExternalWindow}
          handleSelectExternalServer={handleSelectExternalServer}
          handleMarkInlineServerWorking={handleMarkInlineServerWorking}
          handleRetryInlineEmbed={handleRetryInlineEmbed} isTouchLocked={isTouchLocked}
          onToggleTouchLock={() => {
            setIsTouchLocked((prev) => !prev);
            revealControls();
          }}
          tacticalVisionEnabled={tacticalVisionEnabled}
          onToggleTacticalVision={toggleTacticalVision}
          proSettingsProps={proSettingsProps}
          videoCallbacks={videoCallbacks}
        />
      </div>

      {showBottomStrip && (
        <PlayerBottomControlStrip
          lang={lang} videoState={videoState} activeTrackLangCode={activeTrackLangCode}
          currentTime={currentTime} externalWinState={externalWinState} isMobileExternal={isMobileExternal}
          participantCount={participantCount} floatingChatOpen={floatingChatOpen}
          unreadChatCount={unreadChatCount} hasConnectedSmartTv={hasConnectedSmartTv}
          batterySaverTvMode={batterySaverTvMode} isCastingToTv={isCastingToTv}
          voiceSlot={sessionMode === 'solo' ? null : stripVoiceSlot} sessionMode={sessionMode}
          onUpgradeSoloToParty={onUpgradeSoloToParty} onShareCurrentMedia={onShareCurrentMedia}
          onQuickLanguageSwitch={handleQuickLanguageSwitch} onSelectTrack={onSelectTrack}
          onSelectExternalServer={handleSelectExternalServer}
          onOpenControlledExternalWindow={openControlledExternalWindow}
          onOpenInCloudBrowser={onOpenInCloudBrowser} onToggleFloatingChat={onToggleFloatingChat}
          onToggleBatterySaverTvMode={() => setBatterySaverTvMode((v) => !v)}
          onDirectCastToTv={handleDirectCastToTv} onOpenProMenu={() => setShowProMenu(true)}
          subtitleTracks={subtitleTracks} activeSubId={activeSubId}
          onSelectSubtitleTrack={handleSelectSubtitleTrack} subtitleFileInputRef={subtitleFileInputRef}
          tacticalVisionEnabled={tacticalVisionEnabled} onToggleTacticalVision={toggleTacticalVision}
        />
      )}

      {!isTvMode && !isMinimized && !isCompressed && !isFullscreenLike && halftimeBreak && (
        <HalftimeChiringuitoBar state={halftimeBreak} />
      )}

      {showSportsbookBelow && (
        <SportsbookLiveTrackerPanel
          lang={lang}
          enabled={tacticalVisionEnabled}
          analysis={tacticalVision.analysis}
          isAnalyzing={tacticalVision.isAnalyzing}
          captureStatus={tacticalVision.captureStatus}
          homeTeamLabel={tacticalVision.resolvedTeams.homeShort || tacticalVision.resolvedTeams.homeTeam}
          awayTeamLabel={tacticalVision.resolvedTeams.awayShort || tacticalVision.resolvedTeams.awayTeam}
          homeScore={tacticalVision.resolvedTeams.homeScore}
          awayScore={tacticalVision.resolvedTeams.awayScore}
          statusLabel={tacticalVision.resolvedTeams.statusLabel}
          competition={tacticalVision.resolvedTeams.competition}
          matchContext={matchContext}
          onDisable={toggleTacticalVision}
          onRefreshNow={() => {
            void tacticalVision.refreshNow();
          }}
        />
      )}

      {!isTvMode && !isMinimized && !isCompressed && voiceChat && (
        <PlayerVoiceBanner lang={lang} voiceChat={voiceChat} />
      )}

      {!isStageFullscreen && <PlayerProSettingsModal {...proSettingsProps} />}
    </section>
  );
};
