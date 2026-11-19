import React from 'react';
import { SecondaryHlsStage } from '../SecondaryHlsStage';
import type {
  AppLanguage,
  ChatMessage,
  CloudBrowserState,
  FloatingReaction,
  LanguageNoticePopup,
  SecondaryStreamState,
  SubtitleStyleSettings,
  VideoState,
} from '../../types';
import type { ParsedSubtitleCue } from '../../utils/subtitles';
import { triggerHaptic } from '../../utils/haptics';
import type { NativeCinemaPlayerProps } from './playerTypes';
import { CloudBrowserOverlay } from './CloudBrowserOverlay';
import { EmbedStagePanel } from './EmbedStagePanel';
import { IdleStandbyStage } from './IdleStandbyStage';
import { MiniPlayerHud } from './MiniPlayerHud';
import { PlayerStageOverlays } from './PlayerStageOverlays';
import { PlayerTopHudBar } from './PlayerTopHudBar';
import { PlayerTransportBar } from './PlayerTransportBar';
import { PlayerYoutubeStage } from './PlayerYoutubeAndVoiceAlert';

export interface PlayerViewportContentProps {
  lang: AppLanguage;
  videoState: VideoState;
  isTvMode: boolean;
  isMinimized: boolean;
  isCompressed: boolean;
  isStageFullscreen: boolean;
  isFullscreen: boolean;
  isHorizontalFullscreen: boolean;
  forceLandscapeRotation: boolean;
  shouldRotate90: boolean;
  viewportDims: { w: number; h: number };
  showControls: boolean;
  localPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackSpeed: number;
  isMuted: boolean;
  volume: number;
  isBuffering: boolean;
  isExtracting: boolean;
  streamError: string | null;
  extractionLabel?: string;
  extractionError?: string | null;
  extractingTitleCopy: string;
  extractingSubCopy: string;
  floatingReactions: FloatingReaction[];
  seekRipple: 'left' | 'right' | null;
  activeLanguagePopup: LanguageNoticePopup | null;
  playerToast: string | null;
  recentIncomingChatBubble: ChatMessage | null;
  floatingChatOpen: boolean;
  isCastingToTv: boolean;
  batterySaverTvMode: boolean;
  hasConnectedSmartTv: boolean;
  castDeviceName?: string | null;
  showProMenu: boolean;
  isCinemaMode: boolean;
  isInPiP: boolean;
  vocalBoostEnabled: boolean;
  canUseNativePiPOrCast: boolean;
  roomCode?: string;
  roomDisplayName?: string;
  participantCount: number;
  tvAspectMode: 'contain' | 'cover' | 'fill';
  secondaryStream: SecondaryStreamState | null;
  activeSubId: string;
  parsedCues: ParsedSubtitleCue[];
  subtitleOffsetSec: number;
  subtitleSize: 'sm' | 'md' | 'lg';
  subtitleStyle: SubtitleStyleSettings;
  subtitleFileInputRef: React.RefObject<HTMLInputElement | null>;
  autoNextCountdown: number | null;
  autoNextTriggeredUrlRef: React.MutableRefObject<string>;
  ytContainerId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  castBridgeVideoRef: React.RefObject<HTMLVideoElement | null>;
  cloudFrame: string | null;
  cloudState: CloudBrowserState | null;
  cloudUrlInput: string;
  setCloudUrlInput: (v: string) => void;
  isMobileExternal: boolean;
  externalWinState: 'idle' | 'open' | 'closed' | 'blocked';
  externalTargetUrl: string;
  embedWatchdogPhase: 'watching' | 'verified' | 'window_preferred' | 'exhausted';
  activeEmbedInlineUrl: string;
  activeEmbedDirectUrl: string;
  lastAttemptedEmbedUrl: string;
  embedRescueDismissedUrl: string;
  setEmbedRescueDismissedUrl: (u: string) => void;
  hlsAudioTracks: { id: number; name: string; lang: string; default?: boolean }[];
  selectedHlsAudioTrack: number;
  qualityLevels: { index: number; height: number; bitrate?: number }[];
  selectedQuality: number;
  autoActiveHeight: number | null;
  activeHudMenu: 'quality' | 'audio' | null;
  setActiveHudMenu: React.Dispatch<React.SetStateAction<'quality' | 'audio' | null>>;
  voiceSlot: React.ReactNode;
  setDuration: (d: number) => void;
  clearBufferingIndicator: () => void;
  revealControls: () => void;
  setLocalLangPopup: (p: null) => void;
  setRecentIncomingChatBubble: (b: null) => void;
  setBatterySaverTvMode: (v: boolean) => void;
  setShowProMenu: (v: boolean) => void;
  setAutoNextCancelledForUrl: (u: string) => void;
  setAutoNextCountdown: (n: number | null) => void;
  onDismissLanguageNotice?: () => void;
  onToggleFloatingChat?: () => void;
  onExpandCompressed?: () => void;
  onCancelExtraction?: () => void;
  onToggleMinimize?: () => void;
  onClosePlayer?: () => void;
  onExitTvMode?: () => void;
  onToggleCinemaMode?: () => void;
  onOpenCatalogSection?: NativeCinemaPlayerProps['onOpenCatalogSection'];
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onPromoteCloudStreamToNative: (url: string) => void;
  onSwapSecondaryStream?: () => void;
  onToggleSecondaryLayout?: () => void;
  onCloseSecondaryStream?: () => void;
  onOpenInCloudBrowser?: (url: string) => void;
  handleDirectCastToTv: (e?: React.MouseEvent) => void | Promise<void>;
  handleTogglePiP: () => void;
  handleToggleFullscreen: (e?: React.MouseEvent) => void;
  handleToggleLandscapeRotation: () => void;
  handleVideoSurfaceTap: (e: React.MouseEvent<HTMLElement>) => void;
  handleUploadLocalSubtitle: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleForceReloadStream: () => void;
  handleSeekRelative: (delta: number, e?: React.MouseEvent) => void;
  handleTogglePlay: (e?: React.MouseEvent) => void;
  handleToggleMute: (e: React.MouseEvent) => void;
  handleVolumeSlider: (val: number) => void;
  handleScrub: (sec: number) => void;
  handleSelectHlsAudioTrack: (id: number) => void;
  handleChangeQuality: (idx: number) => void;
  openControlledExternalWindow: (urlOverride?: string) => void;
  handleFocusExternalWindow: () => void;
  handleCloseExternalWindow: () => void;
  handleSelectExternalServer: (trackIndex: number) => void;
  handleMarkInlineServerWorking: () => void;
  handleRetryInlineEmbed: () => void;
  isTouchLocked?: boolean;
  onToggleTouchLock?: () => void;
  videoCallbacks: {
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onEnded: () => void;
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onWaiting: () => void;
    onPlaying: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onPause: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onVolumeChange: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    handleCloudWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
    handleCloudNavigate: (e: React.FormEvent) => void;
    handleCloudCanvasClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  };
}

export const PlayerViewportContent: React.FC<PlayerViewportContentProps> = (p) => {
  return (
    <div
      style={
        p.shouldRotate90
          ? {
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: `${p.viewportDims.h}px`,
              height: `${p.viewportDims.w}px`,
              maxWidth: `${p.viewportDims.h}px`,
              maxHeight: `${p.viewportDims.w}px`,
              transform: 'translate(-50%, -50%) rotate(90deg)',
              transformOrigin: 'center center',
            }
          : undefined
      }
      className="relative w-full h-full overflow-hidden select-none"
    >
      <PlayerTopHudBar
        videoState={p.videoState}
        isTvMode={p.isTvMode}
        isMinimized={p.isMinimized}
        isCompressed={p.isCompressed}
        isStageFullscreen={p.isStageFullscreen}
        isFullscreen={p.isFullscreen}
        isHorizontalFullscreen={p.isHorizontalFullscreen}
        showControls={p.showControls}
        localPlaying={p.localPlaying}
        duration={p.duration}
        currentTime={p.currentTime}
        playbackSpeed={p.playbackSpeed}
        isCastingToTv={p.isCastingToTv}
        hasConnectedSmartTv={p.hasConnectedSmartTv}
        showProMenu={p.showProMenu}
        isCinemaMode={p.isCinemaMode}
        isInPiP={p.isInPiP}
        vocalBoostEnabled={p.vocalBoostEnabled}
        activeSubId={p.activeSubId}
        canUseNativePiPOrCast={p.canUseNativePiPOrCast}
        voiceSlot={p.voiceSlot}
        onDirectCastToTv={() => {
          void p.handleDirectCastToTv();
        }}
        onOpenProMenu={() => p.setShowProMenu(true)}
        onTogglePiP={p.handleTogglePiP}
        onToggleMinimize={p.onToggleMinimize}
        onToggleFullscreen={p.handleToggleFullscreen}
        onExitTvMode={p.onExitTvMode}
        onClosePlayer={p.onClosePlayer}
        isTouchLocked={p.isTouchLocked}
        onToggleTouchLock={p.onToggleTouchLock}
      />

      {p.videoState.mode === 'idle' && !p.isExtracting && !p.isMinimized && (
        <IdleStandbyStage
          lang={p.lang}
          isTvMode={p.isTvMode}
          isFullscreen={p.isFullscreen}
          roomCode={p.roomCode}
          roomDisplayName={p.roomDisplayName}
          participantCount={p.participantCount}
          extractionError={p.extractionError}
          onToggleFullscreen={p.handleToggleFullscreen}
          onExitTvMode={p.onExitTvMode}
          onOpenCatalogSection={p.onOpenCatalogSection}
        />
      )}

      <div
        onClick={p.isTouchLocked ? () => p.revealControls() : p.handleVideoSurfaceTap}
        className={`w-full h-full ${
          p.videoState.mode === 'hls' || p.videoState.mode === 'direct'
            ? p.secondaryStream && !p.isMinimized
              ? 'flex items-stretch'
              : 'block'
            : 'hidden'
        }`}
      >
        <video
          ref={p.videoRef}
          playsInline
          x-webkit-airplay="allow"
          onClick={p.isTouchLocked ? () => p.revealControls() : p.handleVideoSurfaceTap}
          onLoadedMetadata={p.videoCallbacks.onLoadedMetadata}
          onEnded={p.videoCallbacks.onEnded}
          onTimeUpdate={p.videoCallbacks.onTimeUpdate}
          onDurationChange={(e) => p.setDuration(e.currentTarget.duration || 0)}
          onCanPlay={p.clearBufferingIndicator}
          onCanPlayThrough={p.clearBufferingIndicator}
          onWaiting={p.videoCallbacks.onWaiting}
          onPlaying={p.videoCallbacks.onPlaying}
          onPause={p.videoCallbacks.onPause}
          onVolumeChange={p.videoCallbacks.onVolumeChange}
          className={`${
            p.secondaryStream && !p.isMinimized && p.secondaryStream.layout === 'split'
              ? 'w-1/2'
              : 'w-full'
          } h-full ${
            p.tvAspectMode === 'cover'
              ? 'object-cover'
              : p.tvAspectMode === 'fill'
              ? 'object-fill'
              : 'object-contain'
          } bg-black cursor-pointer [transform:translateZ(0)]`}
        />

        <video
          ref={p.castBridgeVideoRef}
          preload="metadata"
          playsInline
          muted
          x-webkit-airplay="allow"
          className="fixed bottom-0 right-0 w-[2px] h-[2px] opacity-[0.01] pointer-events-none -z-10"
        />

        {p.secondaryStream &&
          !p.isMinimized &&
          p.secondaryStream.layout === 'split' &&
          p.onSwapSecondaryStream &&
          p.onToggleSecondaryLayout &&
          p.onCloseSecondaryStream && (
            <SecondaryHlsStage
              secondaryStream={p.secondaryStream}
              lang={p.lang}
              onSwapWithPrimary={p.onSwapSecondaryStream}
              onToggleLayout={p.onToggleSecondaryLayout}
              onCloseSecondary={p.onCloseSecondaryStream}
            />
          )}
      </div>

      {p.secondaryStream &&
        !p.isMinimized &&
        p.secondaryStream.layout === 'corner' &&
        (p.videoState.mode === 'hls' || p.videoState.mode === 'direct') &&
        p.onSwapSecondaryStream &&
        p.onToggleSecondaryLayout &&
        p.onCloseSecondaryStream && (
          <SecondaryHlsStage
            secondaryStream={p.secondaryStream}
            lang={p.lang}
            onSwapWithPrimary={p.onSwapSecondaryStream}
            onToggleLayout={p.onToggleSecondaryLayout}
            onCloseSecondary={p.onCloseSecondaryStream}
          />
        )}

      <input
        ref={p.subtitleFileInputRef}
        type="file"
        accept=".srt,.vtt,text/plain"
        onChange={p.handleUploadLocalSubtitle}
        className="hidden"
      />

      <PlayerStageOverlays
        lang={p.lang}
        videoState={p.videoState}
        isMinimized={p.isMinimized}
        isCompressed={p.isCompressed}
        isTvMode={p.isTvMode}
        isStageFullscreen={p.isStageFullscreen}
        isExtracting={p.isExtracting}
        isBuffering={p.isBuffering}
        streamError={p.streamError}
        extractionLabel={p.extractionLabel}
        extractingTitleCopy={p.extractingTitleCopy}
        extractingSubCopy={p.extractingSubCopy}
        floatingReactions={p.floatingReactions}
        seekRipple={p.seekRipple}
        activeLanguagePopup={p.activeLanguagePopup}
        playerToast={p.playerToast}
        recentIncomingChatBubble={p.recentIncomingChatBubble}
        floatingChatOpen={p.floatingChatOpen}
        isCastingToTv={p.isCastingToTv}
        batterySaverTvMode={p.batterySaverTvMode}
        hasConnectedSmartTv={p.hasConnectedSmartTv}
        castDeviceName={p.castDeviceName}
        showControls={p.showControls}
        localPlaying={p.localPlaying}
        currentTime={p.currentTime}
        activeSubId={p.activeSubId}
        parsedCues={p.parsedCues}
        subtitleOffsetSec={p.subtitleOffsetSec}
        subtitleSize={p.subtitleSize}
        subtitleStyle={p.subtitleStyle}
        autoNextCountdown={p.autoNextCountdown}
        onDismissLocalLangPopup={() => p.setLocalLangPopup(null)}
        onDismissLanguageNotice={p.onDismissLanguageNotice}
        onDismissChatBubble={() => p.setRecentIncomingChatBubble(null)}
        onToggleFloatingChat={p.onToggleFloatingChat}
        onDisableBatterySaverTvMode={() => p.setBatterySaverTvMode(false)}
        onExpandCompressed={p.onExpandCompressed}
        onCancelExtraction={p.onCancelExtraction}
        onForceReloadStream={p.handleForceReloadStream}
        onSelectTrack={p.onSelectTrack}
        onSeekRelative={p.handleSeekRelative}
        onTogglePlay={p.handleTogglePlay}
        onNextEpisode={p.onNextEpisode}
        onAcceptAutoNext={() => {
          triggerHaptic('success');
          p.autoNextTriggeredUrlRef.current = p.videoState.url;
          p.setAutoNextCountdown(null);
          p.onNextEpisode?.();
        }}
        onCancelAutoNext={() => {
          p.setAutoNextCancelledForUrl(p.videoState.url);
          p.setAutoNextCountdown(null);
        }}
        isTouchLocked={p.isTouchLocked}
        onToggleTouchLock={p.onToggleTouchLock}
      />

      {p.videoState.mode === 'youtube' && (
        <PlayerYoutubeStage
          containerId={p.ytContainerId}
          isMinimized={p.isMinimized}
          isMuted={p.isMuted}
          lang={p.lang}
          onToggleMute={p.handleToggleMute}
        />
      )}

      {p.videoState.mode === 'embed' && p.videoState.url && (
        <EmbedStagePanel
          lang={p.lang}
          videoState={p.videoState}
          isExtracting={p.isExtracting}
          isMinimized={p.isMinimized}
          isMobileExternal={p.isMobileExternal}
          externalWinState={p.externalWinState}
          externalTargetUrl={p.externalTargetUrl}
          embedWatchdogPhase={p.embedWatchdogPhase}
          activeEmbedInlineUrl={p.activeEmbedInlineUrl}
          activeEmbedDirectUrl={p.activeEmbedDirectUrl}
          lastAttemptedEmbedUrl={p.lastAttemptedEmbedUrl}
          embedRescueDismissedUrl={p.embedRescueDismissedUrl}
          setEmbedRescueDismissedUrl={p.setEmbedRescueDismissedUrl}
          onPrevEpisode={p.onPrevEpisode}
          onNextEpisode={p.onNextEpisode}
          onOpenControlledExternalWindow={p.openControlledExternalWindow}
          onFocusExternalWindow={p.handleFocusExternalWindow}
          onCloseExternalWindow={p.handleCloseExternalWindow}
          onSelectExternalServer={p.handleSelectExternalServer}
          onMarkInlineServerWorking={p.handleMarkInlineServerWorking}
          onRetryInlineEmbed={p.handleRetryInlineEmbed}
          onOpenInCloudBrowser={p.onOpenInCloudBrowser}
        />
      )}

      {p.videoState.mode === 'cloud' && (
        <CloudBrowserOverlay
          lang={p.lang}
          videoState={p.videoState}
          cloudFrame={p.cloudFrame}
          cloudState={p.cloudState}
          cloudUrlInput={p.cloudUrlInput}
          setCloudUrlInput={p.setCloudUrlInput}
          isTvMode={p.isTvMode}
          isCinemaMode={p.isCinemaMode}
          onToggleCinemaMode={p.onToggleCinemaMode}
          onClosePlayer={p.onClosePlayer}
          onPromoteCloudStreamToNative={p.onPromoteCloudStreamToNative}
          onCloudWheel={p.videoCallbacks.handleCloudWheel}
          onCloudNavigate={p.videoCallbacks.handleCloudNavigate}
          onCloudCanvasClick={p.videoCallbacks.handleCloudCanvasClick}
        />
      )}

      {!p.isMinimized && (p.videoState.mode === 'hls' || p.videoState.mode === 'direct') && (
        <PlayerTransportBar
          lang={p.lang}
          mode={p.videoState.mode}
          isLive={p.videoState.isLive}
          duration={p.duration}
          currentTime={p.currentTime}
          shouldRotate90={p.shouldRotate90}
          showControls={p.showControls}
          localPlaying={p.localPlaying}
          isMuted={p.isMuted}
          volume={p.volume}
          hlsAudioTracks={p.hlsAudioTracks}
          selectedHlsAudioTrack={p.selectedHlsAudioTrack}
          qualityLevels={p.qualityLevels}
          selectedQuality={p.selectedQuality}
          autoActiveHeight={p.autoActiveHeight}
          activeHudMenu={p.activeHudMenu}
          setActiveHudMenu={p.setActiveHudMenu}
          canUseNativePiPOrCast={p.canUseNativePiPOrCast}
          isInPiP={p.isInPiP}
          isFullscreen={p.isFullscreen}
          isHorizontalFullscreen={p.isHorizontalFullscreen}
          forceLandscapeRotation={p.forceLandscapeRotation}
          revealControls={p.revealControls}
          onScrub={p.handleScrub}
          onTogglePlay={p.handleTogglePlay}
          onToggleMute={p.handleToggleMute}
          onVolumeSlider={p.handleVolumeSlider}
          onSelectHlsAudioTrack={p.handleSelectHlsAudioTrack}
          onChangeQuality={p.handleChangeQuality}
          onTogglePiP={p.handleTogglePiP}
          onToggleLandscapeRotation={p.handleToggleLandscapeRotation}
          onToggleFullscreen={p.handleToggleFullscreen}
          isTouchLocked={p.isTouchLocked}
          onSeekRelative={p.handleSeekRelative}
        />
      )}

      {p.isMinimized && (
        <MiniPlayerHud
          lang={p.lang}
          title={p.videoState.title}
          mode={p.videoState.mode}
          isLive={p.videoState.isLive}
          duration={p.duration}
          currentTime={p.currentTime}
          localPlaying={p.localPlaying}
          isMuted={p.isMuted}
          volume={p.volume}
          canUseNativePiPOrCast={p.canUseNativePiPOrCast}
          onToggleMinimize={p.onToggleMinimize}
          onClosePlayer={p.onClosePlayer}
          onTogglePlay={p.handleTogglePlay}
          onToggleMute={p.handleToggleMute}
        />
      )}
    </div>
  );
};
