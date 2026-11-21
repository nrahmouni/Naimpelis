import type {
  AppLanguage,
  ChatMessage,
  ChatReplyReference,
  CloudBrowserState,
  FloatingReaction,
  LanguageNoticePopup,
  OnlineAppUser,
  Participant,
  SavedFriend,
  SecondaryStreamState,
  TvRemoteCommandType,
  VideoState,
} from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import type { HalftimeChiringuitoState } from '../../hooks/useHalftimeChiringuitoBreak';
import type { PlayerMatchContext } from './tacticalVisionTypes';

export interface YouTubePlayerInstance {
  unMute?: () => void;
  mute?: () => void;
  isMuted?: () => boolean;
  setVolume?: (volume: number) => void;
  getVolume?: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  setPlaybackRate?: (rate: number) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  loadVideoById?: (videoId: string, startSeconds?: number) => void;
  destroy?: () => void;
}

export interface YouTubePlayerEvent {
  target: YouTubePlayerInstance;
  data: number;
}

export interface YouTubeNamespace {
  Player: new (
    elementId: string,
    config: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: YouTubePlayerEvent) => void;
        onStateChange?: (e: YouTubePlayerEvent) => void;
      };
    }
  ) => YouTubePlayerInstance;
}

export interface CastSessionLike {
  getCastDevice?: () => { friendlyName?: string };
  endSession?: (stopCasting: boolean) => void;
  loadMedia?: (req: unknown) => Promise<unknown>;
}

export interface CastContextLike {
  setOptions: (opts: Record<string, unknown>) => void;
  addEventListener: (eventType: string, listener: (ev: { sessionState: string }) => void) => void;
  getCurrentSession: () => CastSessionLike | null;
  requestSession: () => Promise<void>;
}

export interface CastNamespace {
  framework?: {
    CastContext: { getInstance: () => CastContextLike };
    CastContextEventType: { SESSION_STATE_CHANGED: string };
    SessionState: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDED: string };
  };
}

export interface ChromeCastNamespace {
  cast?: {
    AutoJoinPolicy: { ORIGIN_SCOPED: string };
    Image?: new (url: string) => unknown;
    media?: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: string;
      StreamType: { LIVE: string; BUFFERED: string };
      HlsSegmentFormat?: { TS?: string; MPEG2_TS?: string; FMP4: string };
      HlsVideoSegmentFormat?: { MPEG2_TS?: string; FMP4: string };
      MetadataType?: { GENERIC: number };
      GenericMediaMetadata?: new () => { title?: string; subtitle?: string; images?: unknown[] };
      LoadRequest?: new (mediaInfo: unknown) => { autoplay?: boolean; currentTime?: number };
      MediaInfo: new (url: string, contentType: string) => {
        streamType: string;
        hlsSegmentFormat?: string;
        hlsVideoSegmentFormat?: string;
        metadata?: unknown;
      };
    };
  };
}

export interface PresentationConnectionLike {
  state?: string;
  close?: () => void;
  terminate?: () => void;
  send?: (data: string) => void;
  addEventListener?: (ev: string, cb: () => void) => void;
}

export interface WebKitVideoElement extends HTMLVideoElement {
  autoPictureInPicture?: boolean;
  webkitPresentationMode?: 'inline' | 'picture-in-picture' | 'fullscreen';
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitEnterFullscreen?: () => void;
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}

export interface WakeLockSentinelLike {
  release?: () => Promise<void>;
}

export interface ScreenOrientationWithLock {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    __naimCastApiReady?: boolean;
    cast?: CastNamespace;
    chrome?: ChromeCastNamespace;
    webkitAudioContext?: typeof AudioContext;
    PresentationRequest?: new (urls: string[]) => {
      start: () => Promise<PresentationConnectionLike>;
    };
  }
}

export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export type StreamRefreshPhase = 'idle' | 'recovering' | 'reconnecting' | 'switching';

export interface NativeCinemaPlayerProps {
  videoState: VideoState;
  lang: AppLanguage;
  userName: string;
  isExtracting: boolean;
  extractionLabel?: string;
  extractionError?: string | null;
  cloudFrame: string | null;
  cloudState: CloudBrowserState | null;
  floatingReactions: FloatingReaction[];
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onAutoSwitchBackupTrack?: (reason?: string, atSec?: number) => void;
  onPromoteCloudStreamToNative: (proxiedStreamUrl: string) => void;
  onOpenCatalogSection?: (
    section:
      | 'movies'
      | 'series'
      | 'castellano'
      | 'catala'
      | 'anime'
      | 'tdt'
      | 'sports'
      | 'youtube'
      | 'games'
      | 'direct'
  ) => void;
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  onProgressUpdate?: (currentTimeSec: number, durationSec: number) => void;
  isCinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  secondaryStream?: SecondaryStreamState | null;
  onSwapSecondaryStream?: () => void;
  onToggleSecondaryLayout?: () => void;
  onCloseSecondaryStream?: () => void;
  canControlRoom?: boolean;
  isMinimized?: boolean;
  isCompressed?: boolean;
  onExpandCompressed?: () => void;
  onToggleMinimize?: () => void;
  onClosePlayer?: () => void;
  onCancelExtraction?: () => void;
  isTvMode?: boolean;
  roomCode?: string;
  roomDisplayName?: string;
  participantCount?: number;
  participants?: Participant[];
  onExitTvMode?: () => void;
  onOpenSmartTvModal?: () => void;
  hasConnectedSmartTv?: boolean;
  onSendTvRemoteCommand?: (cmd: TvRemoteCommandType) => void;
  languageNotice?: LanguageNoticePopup | null;
  onDismissLanguageNotice?: () => void;
  messages?: ChatMessage[];
  currentUserId?: string;
  onSendMessage?: (text: string, replyTo?: ChatReplyReference) => void;
  onSendReaction?: (emoji: string) => void;
  floatingChatOpen?: boolean;
  onToggleFloatingChat?: () => void;
  unreadChatCount?: number;
  compactVideoForMobileKeyboard?: boolean;
  onOpenInCloudBrowser?: (url: string) => void;
  voiceChat?: GameVoiceChatState;
  savedFriends?: SavedFriend[];
  onlineUsers?: OnlineAppUser[];
  onOpenFriendsModal?: () => void;
  onSendDirectRoomInvite?: (friend: {
    friendId: string;
    name: string;
    friendCode?: string;
  }) => void;
  onVideoEnded?: () => void;
  sessionMode?: 'solo' | 'party';
  onUpgradeSoloToParty?: () => void;
  onShareCurrentMedia?: () => void;
  matchContext?: PlayerMatchContext | null;
  halftimeBreak?: HalftimeChiringuitoState | null;
}
