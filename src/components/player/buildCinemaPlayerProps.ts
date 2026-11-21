import type React from 'react';
import type {
  AppLanguage,
  LanguageNoticePopup,
  StreamTrack,
  SubtitleTrackItem,
  VideoState,
} from '../../types';
import type { PlayerViewportContentProps } from './PlayerViewportContent';
import type { PlayerProSettingsModalProps } from './PlayerProSettingsModal';
import type { ParsedSubtitleCue } from '../../utils/subtitles';
import type { StreamRefreshPhase } from './playerTypes';

export function buildCinemaProSettingsProps(args: {
  showProMenu: boolean;
  onClose: () => void;
  proMenuRef: React.RefObject<HTMLDivElement | null>;
  lang: AppLanguage;
  videoState: VideoState;
  currentTime: number;
  isCinemaMode: boolean;
  onToggleCinemaMode?: () => void;
  canUseNativePiPOrCast: boolean;
  isInPiP: boolean;
  onTogglePiP: PlayerProSettingsModalProps['onTogglePiP'];
  hlsAudioTracks: { id: number; name: string; lang: string; default?: boolean }[];
  selectedHlsAudioTrack: number;
  onSelectHlsAudioTrack: (id: number) => void;
  activeTrackLangCode: string;
  onQuickLanguageSwitch: PlayerProSettingsModalProps['onQuickLanguageSwitch'];
  onTriggerLanguagePopup: (notice: Omit<LanguageNoticePopup, 'id'>) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  subtitleFileInputRef: React.RefObject<HTMLInputElement | null>;
  activeSubId: string;
  onSelectSubtitleTrack: (subId: string) => void;
  subtitleTracks: SubtitleTrackItem[];
  subtitleOffsetSec: number;
  setSubtitleOffsetSec: PlayerProSettingsModalProps['setSubtitleOffsetSec'];
  subtitleSize: 'sm' | 'md' | 'lg';
  setSubtitleSize: (size: 'sm' | 'md' | 'lg') => void;
  subtitleStyle: PlayerProSettingsModalProps['subtitleStyle'];
  setSubtitleStyle: PlayerProSettingsModalProps['setSubtitleStyle'];
  syncOffsetMs: number;
  setSyncOffsetMs: (ms: number) => void;
  vocalBoostEnabled: boolean;
  onToggleVocalBoost: () => void;
  ambilightEnabled: boolean;
  setAmbilightEnabled: PlayerProSettingsModalProps['setAmbilightEnabled'];
  playbackSpeed: number;
  onSelectSpeed: (spd: number) => void;
  qualityLevels: { index: number; height: number; bitrate?: number }[];
  selectedQuality: number;
  autoActiveHeight: number | null;
  onChangeQuality: (idx: number) => void;
}): PlayerProSettingsModalProps {
  return {
    isOpen: args.showProMenu,
    onClose: args.onClose,
    proMenuRef: args.proMenuRef,
    lang: args.lang,
    videoState: args.videoState,
    currentTime: args.currentTime,
    isCinemaMode: args.isCinemaMode,
    onToggleCinemaMode: args.onToggleCinemaMode,
    canUseNativePiPOrCast: args.canUseNativePiPOrCast,
    isInPiP: args.isInPiP,
    onTogglePiP: args.onTogglePiP,
    hlsAudioTracks: args.hlsAudioTracks,
    selectedHlsAudioTrack: args.selectedHlsAudioTrack,
    onSelectHlsAudioTrack: args.onSelectHlsAudioTrack,
    activeTrackLangCode: args.activeTrackLangCode,
    onQuickLanguageSwitch: args.onQuickLanguageSwitch,
    onTriggerLanguagePopup: args.onTriggerLanguagePopup,
    onSelectTrack: args.onSelectTrack,
    subtitleFileInputRef: args.subtitleFileInputRef,
    activeSubId: args.activeSubId,
    onSelectSubtitleTrack: args.onSelectSubtitleTrack,
    subtitleTracks: args.subtitleTracks,
    subtitleOffsetSec: args.subtitleOffsetSec,
    setSubtitleOffsetSec: args.setSubtitleOffsetSec,
    subtitleSize: args.subtitleSize,
    setSubtitleSize: args.setSubtitleSize,
    subtitleStyle: args.subtitleStyle,
    setSubtitleStyle: args.setSubtitleStyle,
    syncOffsetMs: args.syncOffsetMs,
    setSyncOffsetMs: args.setSyncOffsetMs,
    vocalBoostEnabled: args.vocalBoostEnabled,
    onToggleVocalBoost: args.onToggleVocalBoost,
    ambilightEnabled: args.ambilightEnabled,
    setAmbilightEnabled: args.setAmbilightEnabled,
    playbackSpeed: args.playbackSpeed,
    onSelectSpeed: args.onSelectSpeed,
    qualityLevels: args.qualityLevels,
    selectedQuality: args.selectedQuality,
    autoActiveHeight: args.autoActiveHeight,
    onChangeQuality: args.onChangeQuality,
  };
}

export type CinemaViewportSubtitlePick = Pick<
  PlayerViewportContentProps,
  | 'activeSubId'
  | 'parsedCues'
  | 'subtitleOffsetSec'
  | 'subtitleSize'
  | 'subtitleStyle'
  | 'subtitleFileInputRef'
  | 'ytContainerId'
  | 'videoRef'
  | 'castBridgeVideoRef'
>;

export function shouldRenderSportsbookBelowPlayer(args: {
  isTvMode: boolean;
  isMinimized: boolean;
  isCompressed: boolean;
  isFullscreenLike: boolean;
  compactVideoForMobileKeyboard: boolean;
  videoMode: VideoState['mode'];
}): boolean {
  return (
    !args.isTvMode &&
    !args.isMinimized &&
    !args.isCompressed &&
    !args.isFullscreenLike &&
    !args.compactVideoForMobileKeyboard &&
    (args.videoMode === 'hls' || args.videoMode === 'direct' || args.videoMode === 'cloud')
  );
}

export function shouldRenderBottomControlStrip(args: {
  isTvMode: boolean;
  isMinimized: boolean;
  isCompressed: boolean;
  compactVideoForMobileKeyboard: boolean;
  tacticalVisionEnabled?: boolean;
  videoMode: VideoState['mode'];
}): boolean {
  return (
    !args.tacticalVisionEnabled &&
    !args.isTvMode &&
    !args.isMinimized &&
    !args.isCompressed &&
    !args.compactVideoForMobileKeyboard &&
    args.videoMode !== 'idle' &&
    args.videoMode !== 'cloud'
  );
}

export interface CompactCinemaControlsBundle {
  playbackSpeed: number;
  isMuted: boolean;
  volume: number;
  isBuffering: boolean;
  streamRefreshPhase: StreamRefreshPhase;
  streamError: string | null;
  activeSubId: string;
  parsedCues: ParsedSubtitleCue[];
  tracks: StreamTrack[];
}
