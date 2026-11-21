import Hls from 'hls.js';
import type React from 'react';
import type { AppLanguage, SubtitleTrackItem, VideoState } from '../../types';
import { useCinemaPlatformApis } from './useCinemaPlatformApis';
import { useHlsPlaybackEngine } from './useHlsPlaybackEngine';
import { useTvReceiverRemote } from './useTvReceiverRemote';
import { useYouTubeIframeSync } from './useYouTubeIframeSync';
import type {
  NativeCinemaPlayerProps,
  StreamRefreshPhase,
  YouTubePlayerInstance,
} from './playerTypes';

interface UseCinemaEnginesBundleArgs {
  lang: AppLanguage;
  videoState: VideoState;
  stageWrapperRef: React.MutableRefObject<HTMLDivElement | null>;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  hlsRef: React.MutableRefObject<Hls | null>;
  ytPlayerRef: React.MutableRefObject<YouTubePlayerInstance | null>;
  ytContainerId: React.MutableRefObject<string>;
  isApplyingRemoteRef: React.MutableRefObject<boolean>;
  streamLoadStartRef: React.MutableRefObject<number>;
  qoeStartupSentForUrlRef: React.MutableRefObject<string>;
  rebufferCountRef: React.MutableRefObject<number>;
  smoothDriftTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  subtitleTracks: SubtitleTrackItem[];
  activeSubId: string;
  ambilightEnabled: boolean;
  vocalBoostEnabled: boolean;
  setVocalBoostEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isMinimized: boolean;
  isCompressed: boolean;
  isTvMode: boolean;
  isStageFullscreen: boolean;
  isCinemaMode: boolean;
  isCastingToTv: boolean;
  hasConnectedSmartTv: boolean;
  batterySaverTvMode: boolean;
  setBatterySaverTvMode: React.Dispatch<React.SetStateAction<boolean>>;
  localPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  syncOffsetMs: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setTvAspectMode: React.Dispatch<React.SetStateAction<'contain' | 'cover' | 'fill'>>;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  setAmbilightEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setIsInPiP: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamRefreshPhase: React.Dispatch<React.SetStateAction<StreamRefreshPhase>>;
  clearBufferingIndicator: () => void;
  setStreamError: React.Dispatch<React.SetStateAction<string | null>>;
  setQualityLevels: React.Dispatch<
    React.SetStateAction<{ index: number; height: number; bitrate?: number }[]>
  >;
  setSelectedQuality: React.Dispatch<React.SetStateAction<number>>;
  setAutoActiveHeight: React.Dispatch<React.SetStateAction<number | null>>;
  setHlsAudioTracks: React.Dispatch<
    React.SetStateAction<{ id: number; name: string; lang: string; default?: boolean }[]>
  >;
  setSelectedHlsAudioTrack: React.Dispatch<React.SetStateAction<number>>;
  setActiveHudMenu: React.Dispatch<React.SetStateAction<'quality' | 'audio' | null>>;
  setLocalPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  handleSelectSubtitleTrack: (subId: string) => void;
  scheduleHideControls: () => void;
  showTransientToast: (msg: string) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onAutoSwitchBackupTrack?: (reason?: string, atSec?: number) => void;
  onExitTvMode?: () => void;
  onNextEpisode?: () => void;
  onSyncAction: NativeCinemaPlayerProps['onSyncAction'];
}

export function useCinemaEnginesBundle(args: UseCinemaEnginesBundleArgs) {
  useTvReceiverRemote({
    isTvMode: args.isTvMode,
    videoState: args.videoState,
    stageWrapperRef: args.stageWrapperRef,
    videoRef: args.videoRef,
    hlsRef: args.hlsRef,
    ytPlayerRef: args.ytPlayerRef,
    subtitleTracks: args.subtitleTracks,
    activeSubId: args.activeSubId,
    currentTime: args.currentTime,
    setVolume: args.setVolume,
    setIsMuted: args.setIsMuted,
    setTvAspectMode: args.setTvAspectMode,
    setShowControls: args.setShowControls,
    setAmbilightEnabled: args.setAmbilightEnabled,
    handleSelectSubtitleTrack: args.handleSelectSubtitleTrack,
    onSelectTrack: args.onSelectTrack,
    onExitTvMode: args.onExitTvMode,
    showTransientToast: args.showTransientToast,
  });

  const { toggleVocalBoost } = useCinemaPlatformApis({
    lang: args.lang,
    videoState: args.videoState,
    stageWrapperRef: args.stageWrapperRef,
    videoRef: args.videoRef,
    ambilightEnabled: args.ambilightEnabled,
    vocalBoostEnabled: args.vocalBoostEnabled,
    setVocalBoostEnabled: args.setVocalBoostEnabled,
    isMinimized: args.isMinimized,
    isCompressed: args.isCompressed,
    isTvMode: args.isTvMode,
    isStageFullscreen: args.isStageFullscreen,
    isCinemaMode: args.isCinemaMode,
    localPlaying: args.localPlaying,
    currentTime: args.currentTime,
    duration: args.duration,
    playbackSpeed: args.playbackSpeed,
    setIsInPiP: args.setIsInPiP,
    showTransientToast: args.showTransientToast,
    onNextEpisode: args.onNextEpisode,
    onSyncAction: args.onSyncAction,
  });

  useHlsPlaybackEngine({
    lang: args.lang,
    videoState: args.videoState,
    videoRef: args.videoRef,
    hlsRef: args.hlsRef,
    isApplyingRemoteRef: args.isApplyingRemoteRef,
    streamLoadStartRef: args.streamLoadStartRef,
    qoeStartupSentForUrlRef: args.qoeStartupSentForUrlRef,
    rebufferCountRef: args.rebufferCountRef,
    smoothDriftTimerRef: args.smoothDriftTimerRef,
    isCastingToTv: args.isCastingToTv,
    hasConnectedSmartTv: args.hasConnectedSmartTv,
    batterySaverTvMode: args.batterySaverTvMode,
    setBatterySaverTvMode: args.setBatterySaverTvMode,
    isTvMode: args.isTvMode,
    playbackSpeed: args.playbackSpeed,
    syncOffsetMs: args.syncOffsetMs,
    setIsBuffering: args.setIsBuffering,
    setStreamRefreshPhase: args.setStreamRefreshPhase,
    clearBufferingIndicator: args.clearBufferingIndicator,
    setStreamError: args.setStreamError,
    setQualityLevels: args.setQualityLevels,
    setSelectedQuality: args.setSelectedQuality,
    setAutoActiveHeight: args.setAutoActiveHeight,
    setHlsAudioTracks: args.setHlsAudioTracks,
    setSelectedHlsAudioTrack: args.setSelectedHlsAudioTrack,
    setActiveHudMenu: args.setActiveHudMenu,
    setIsMuted: args.setIsMuted,
    setLocalPlaying: args.setLocalPlaying,
    scheduleHideControls: args.scheduleHideControls,
    showTransientToast: args.showTransientToast,
    onAutoSwitchBackupTrack: args.onAutoSwitchBackupTrack,
  });

  useYouTubeIframeSync({
    videoState: args.videoState,
    ytPlayerRef: args.ytPlayerRef,
    ytContainerId: args.ytContainerId,
    isApplyingRemoteRef: args.isApplyingRemoteRef,
    smoothDriftTimerRef: args.smoothDriftTimerRef,
    syncOffsetMs: args.syncOffsetMs,
    setIsMuted: args.setIsMuted,
    setVolume: args.setVolume,
    setLocalPlaying: args.setLocalPlaying,
    onSyncAction: args.onSyncAction,
  });

  return { toggleVocalBoost };
}
