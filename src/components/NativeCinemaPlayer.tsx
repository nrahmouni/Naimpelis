import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useFocusTrap } from '../utils/useFocusTrap';
import { type NativeCinemaPlayerProps } from './player/playerTypes';
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
  onAutoSwitchBackupTrack,
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
  sessionMode = 'party',
  onUpgradeSoloToParty,
  onShareCurrentMedia,
}) => {
  const subtitleStyle = useAppStore((s) => s.subtitleStyle);
  const setSubtitleStyle = useAppStore((s) => s.setSubtitleStyle);
  const syncOffsetMs = useAppStore((s) => s.syncOffsetMs);
  const setSyncOffsetMs = useAppStore((s) => s.setSyncOffsetMs);
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

  const clearBufferingIndicator = useCallback(() => {
    if (bufferingDelayTimerRef.current) {
      clearTimeout(bufferingDelayTimerRef.current);
      bufferingDelayTimerRef.current = null;
    }
    setIsBuffering(false);
  }, []);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInPiP, setIsInPiP] = useState(false);
  const [isHorizontalFullscreen, setIsHorizontalFullscreen] = useState(false);
  const [forceLandscapeRotation, setForceLandscapeRotation] = useState(true);
  const [viewportDims, setViewportDims] = useState<{ w: number; h: number }>(() =>
    typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 390, h: 844 }
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
  });

  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [autoNextCancelledForUrl, setAutoNextCancelledForUrl] = useState<string>('');

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

  const stagePointerHandlers = createStagePointerHandlers({
    isMinimized, lastManualHideAtRef, lastMousePosRef, showControlsRef, revealControls, scheduleHideControls,
  });

  return (
    <section className={getPlayerSectionClass({ isTvMode, isMinimized, isCinemaMode })}>
      <div
        ref={stageWrapperRef}
        {...stagePointerHandlers}
        style={getStageWrapperStyle(isStageFullscreen)}
        className={getStageWrapperClass({
          isTvMode, isStageFullscreen, compactVideoForMobileKeyboard, isCompressed, isMinimized, isCinemaMode,
        })}
      >
        <PlayerViewportContent
          lang={lang}
          videoState={videoState}
          isTvMode={isTvMode}
          isMinimized={isMinimized}
          isCompressed={isCompressed}
          isStageFullscreen={isStageFullscreen}
          isFullscreen={isFullscreen}
          isHorizontalFullscreen={isHorizontalFullscreen}
          forceLandscapeRotation={forceLandscapeRotation}
          shouldRotate90={shouldRotate90}
          viewportDims={viewportDims}
          showControls={showControls}
          localPlaying={localPlaying}
          duration={duration}
          currentTime={currentTime}
          playbackSpeed={playbackSpeed}
          isMuted={isMuted}
          volume={volume}
          isBuffering={isBuffering}
          isExtracting={isExtracting}
          streamError={streamError}
          extractionLabel={extractionLabel}
          extractionError={extractionError}
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
          showProMenu={showProMenu}
          isCinemaMode={isCinemaMode}
          isInPiP={isInPiP}
          vocalBoostEnabled={vocalBoostEnabled}
          canUseNativePiPOrCast={canUseNativePiPOrCast}
          roomCode={roomCode}
          roomDisplayName={roomDisplayName}
          participantCount={participantCount}
          tvAspectMode={tvAspectMode}
          secondaryStream={secondaryStream}
          activeSubId={activeSubId}
          parsedCues={parsedCues}
          subtitleOffsetSec={subtitleOffsetSec}
          subtitleSize={subtitleSize}
          subtitleStyle={subtitleStyle}
          subtitleFileInputRef={subtitleFileInputRef}
          autoNextCountdown={autoNextCountdown}
          autoNextTriggeredUrlRef={autoNextTriggeredUrlRef}
          ytContainerId={ytContainerId.current}
          videoRef={videoRef}
          castBridgeVideoRef={castBridgeVideoRef}
          cloudFrame={cloudFrame}
          cloudState={cloudState}
          cloudUrlInput={cloudUrlInput}
          setCloudUrlInput={setCloudUrlInput}
          isMobileExternal={isMobileExternal}
          externalWinState={externalWinState}
          externalTargetUrl={externalTargetUrl}
          embedWatchdogPhase={embedWatchdogPhase}
          activeEmbedInlineUrl={activeEmbedInlineUrl}
          activeEmbedDirectUrl={activeEmbedDirectUrl}
          lastAttemptedEmbedUrl={lastAttemptedEmbedUrl}
          embedRescueDismissedUrl={embedRescueDismissedUrl}
          setEmbedRescueDismissedUrl={setEmbedRescueDismissedUrl}
          hlsAudioTracks={hlsAudioTracks}
          selectedHlsAudioTrack={selectedHlsAudioTrack}
          qualityLevels={qualityLevels}
          selectedQuality={selectedQuality}
          autoActiveHeight={autoActiveHeight}
          activeHudMenu={activeHudMenu}
          setActiveHudMenu={setActiveHudMenu}
          voiceSlot={fullscreenVoiceSlot}
          setDuration={setDuration}
          clearBufferingIndicator={clearBufferingIndicator}
          revealControls={revealControls}
          setLocalLangPopup={setLocalLangPopup}
          setRecentIncomingChatBubble={setRecentIncomingChatBubble}
          setBatterySaverTvMode={setBatterySaverTvMode}
          setShowProMenu={setShowProMenu}
          setAutoNextCancelledForUrl={setAutoNextCancelledForUrl}
          setAutoNextCountdown={setAutoNextCountdown}
          onDismissLanguageNotice={onDismissLanguageNotice}
          onToggleFloatingChat={onToggleFloatingChat}
          onExpandCompressed={onExpandCompressed}
          onCancelExtraction={onCancelExtraction}
          onToggleMinimize={onToggleMinimize}
          onClosePlayer={onClosePlayer}
          onExitTvMode={onExitTvMode}
          onToggleCinemaMode={onToggleCinemaMode}
          onOpenCatalogSection={onOpenCatalogSection}
          onPrevEpisode={onPrevEpisode}
          onNextEpisode={onNextEpisode}
          onSelectTrack={onSelectTrack}
          onPromoteCloudStreamToNative={onPromoteCloudStreamToNative}
          onSwapSecondaryStream={onSwapSecondaryStream}
          onToggleSecondaryLayout={onToggleSecondaryLayout}
          onCloseSecondaryStream={onCloseSecondaryStream}
          onOpenInCloudBrowser={onOpenInCloudBrowser}
          handleDirectCastToTv={handleDirectCastToTv}
          handleTogglePiP={handleTogglePiP}
          handleToggleFullscreen={handleToggleFullscreen}
          handleToggleLandscapeRotation={handleToggleLandscapeRotation}
          handleVideoSurfaceTap={handleVideoSurfaceTap}
          handleUploadLocalSubtitle={handleUploadLocalSubtitle}
          handleForceReloadStream={handleForceReloadStream}
          handleSeekRelative={handleSeekRelative}
          handleTogglePlay={handleTogglePlay}
          handleToggleMute={handleToggleMute}
          handleVolumeSlider={handleVolumeSlider}
          handleScrub={handleScrub}
          handleSelectHlsAudioTrack={handleSelectHlsAudioTrack}
          handleChangeQuality={handleChangeQuality}
          openControlledExternalWindow={openControlledExternalWindow}
          handleFocusExternalWindow={handleFocusExternalWindow}
          handleCloseExternalWindow={handleCloseExternalWindow}
          handleSelectExternalServer={handleSelectExternalServer}
          handleMarkInlineServerWorking={handleMarkInlineServerWorking}
          handleRetryInlineEmbed={handleRetryInlineEmbed}
          isTouchLocked={isTouchLocked}
          onToggleTouchLock={() => {
            setIsTouchLocked((prev) => !prev);
            revealControls();
          }}
          videoCallbacks={videoCallbacks}
        />
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
            voiceSlot={sessionMode === 'solo' ? null : stripVoiceSlot}
            sessionMode={sessionMode}
            onUpgradeSoloToParty={onUpgradeSoloToParty}
            onShareCurrentMedia={onShareCurrentMedia}
            onQuickLanguageSwitch={handleQuickLanguageSwitch}
            onSelectTrack={onSelectTrack}
            onSelectExternalServer={handleSelectExternalServer}
            onOpenControlledExternalWindow={openControlledExternalWindow}
            onOpenInCloudBrowser={onOpenInCloudBrowser}
            onToggleFloatingChat={onToggleFloatingChat}
            onToggleBatterySaverTvMode={() => setBatterySaverTvMode((v) => !v)}
            onDirectCastToTv={handleDirectCastToTv}
            onOpenProMenu={() => setShowProMenu(true)}
            subtitleTracks={subtitleTracks}
            activeSubId={activeSubId}
            onSelectSubtitleTrack={handleSelectSubtitleTrack}
            subtitleFileInputRef={subtitleFileInputRef}
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
