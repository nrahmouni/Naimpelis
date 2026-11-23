import type React from 'react';
import type { User } from 'firebase/auth';
import type { PortalOriginRect, WorldPortalKind } from '../home/WorldPortalTransition';
import type { ProfileHubTab } from '../UserProfileHubModal';
import type { ActiveMovieContext } from '../MoviePlaybackDock';
import type { ActiveSportsMatchMeta } from '../../hooks/useLiveSportsMatchDetails';
import type { CatalogSection } from '../MediaCatalogHub';
import type { WorldId } from '../../store/useAppStore';
import type { RecentRoomEntry, StoredProfile } from '../../utils/storage';
import type { NativeApkUpdateAvailable } from '../../utils/versionSync';
import type {
  AppLanguage,
  CatalogMovie,
  CloudSavedRoom,
  FavoriteChannelItem,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  OnlineAppUser,
  Participant,
  RoomQueueItem,
  SavedFriend,
  SpanishTdtChannel,
  SportsMatch,
  TvEpisodeItem,
  TvRemoteCommandType,
  TvSeriesDetails,
  VideoState,
  WatchHistoryItem,
} from '../../types';
import type { RoomGameInvite } from '../../shared/protocol';

export interface AppGlobalModalsLayerProps {
  lang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  inRoom: boolean;
  sessionMode?: 'solo' | 'party';
  roomId: string;
  roomName: string;
  profile: StoredProfile;
  currentUser: Participant;
  participants: Participant[];
  authUser: User | null;
  authLoading: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  effectiveView: 'desktop' | 'mobile';
  onToggleViewMode: () => void;
  videoState: VideoState;
  activeSportsMatch: ActiveSportsMatchMeta | null;
  activeMovieContext: ActiveMovieContext | null;
  watchHistory: WatchHistoryItem[];
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  recentRooms: RecentRoomEntry[];
  savedRooms: CloudSavedRoom[];
  isCurrentRoomPermanent: boolean;
  savedFriends: SavedFriend[];
  onlineUsers: OnlineAppUser[];
  incomingInvite: IncomingRoomInvite | null;
  friendAddedNotice: IncomingFriendAddedNotice | null;
  inviteSentFeedback: string | null;
  friendsModalOpen: boolean;
  setFriendsModalOpen: (open: boolean) => void;
  showIntro: boolean;
  introWithSound: boolean;
  setShowIntro: (show: boolean) => void;
  pinPromptState: { open: boolean; roomName: string; invalidAttempt: boolean };
  smartTvModalOpen: boolean;
  setSmartTvModalOpen: (open: boolean) => void;
  hasConnectedSmartTv: boolean;
  tvClaimStatus: { type: 'success' | 'error'; message: string } | null;
  profileHubOpen: boolean;
  setProfileHubOpen: (open: boolean) => void;
  profileHubTab: ProfileHubTab;
  setProfileHubTab: (tab: ProfileHubTab) => void;
  avatarMenuOpen: boolean;
  setAvatarMenuOpen: (open: boolean) => void;
  settingsSheetOpen: boolean;
  setSettingsSheetOpen: (open: boolean) => void;
  unreadNotificationsCount: number;
  showGuestPopup: boolean;
  showNotificationCenter: boolean;
  setShowNotificationCenter: (open: boolean) => void;
  showCommandSearch: boolean;
  setShowCommandSearch: (open: boolean) => void;
  showSurpriseModal: boolean;
  setShowSurpriseModal: (open: boolean) => void;
  aiSearchLaunch: {
    query: string;
    mediaType?: 'all' | 'movie' | 'tv';
    mode?: 'surprise' | 'request';
    seq: number;
  } | null;
  setAiSearchLaunch: React.Dispatch<
    React.SetStateAction<{
      query: string;
      mediaType?: 'all' | 'movie' | 'tv';
      mode?: 'surprise' | 'request';
      seq: number;
    } | null>
  >;
  showVoiceAssistant: boolean;
  setShowVoiceAssistant: (open: boolean) => void;
  showLegalModal: boolean;
  setShowLegalModal: (open: boolean) => void;
  setShowDesignSystem: (open: boolean) => void;
  onOpenAdminConsole?: () => void;
  quickPool: {
    movies: CatalogMovie[];
    series: CatalogMovie[];
    tdt: SpanishTdtChannel[];
  };
  quickPoolLoading: boolean;
  loadQuickPool: () => Promise<void>;
  cineCastellano: boolean;
  swUpdate: boolean;
  applySwUpdateNow: () => void;
  deferredAppUpdateVersion: string | null;
  nativeApkUpdate: NativeApkUpdateAvailable | null;
  setNativeApkUpdate: (u: NativeApkUpdateAvailable | null) => void;
  activePortalTransition: WorldPortalKind | null;
  portalOriginRect: PortalOriginRect | null;
  incomingGameInvite: RoomGameInvite | null;
  onAcceptGameInvite: (invite: RoomGameInvite) => void;
  onDismissGameInvite: () => void;
  onAcceptIncomingInvite: (invite: IncomingRoomInvite) => void;
  onDismissIncomingInvite: () => void;
  onAddFriend: (
    entry: {
      friendId: string;
      name: string;
      avatar: string;
      color: string;
      friendCode?: string;
    },
    opts?: { skipNotify?: boolean }
  ) => void;
  onRemoveFriend: (friendId: string) => void;
  onDismissFriendNotice: () => void;
  onSendDirectRoomInvite: (friend: { friendId: string; name: string; friendCode?: string }) => void;
  onSubmitGuestPin: (pin: string) => void;
  onUpgradeSoloToParty?: () => void;
  onLeaveRoom: () => void;
  onClaimTvCode: (code: string) => void;
  onRemoteTogglePlay: () => void;
  onRemoteSeekDelta: (delta: number) => void;
  onSendTvRemoteCommand: (cmd: TvRemoteCommandType) => void;
  onSwitchThisDeviceToTvLobby: () => void;
  onUpdateProfile: (name: string, avatar: string, color: string) => void;
  onDismissGuestPopup: () => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => Promise<void>;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onPlayFromProfileCatalog: (item: CatalogMovie) => Promise<void>;
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onPlayFavoriteChannel: (ch: FavoriteChannelItem) => Promise<void>;
  onToggleChannelFavorite: (ch: FavoriteChannelItem) => void;
  onCreateNewRoom: (name?: string) => void;
  onSwitchRoom: (code: string, name?: string) => void;
  onTogglePermanentRoom: () => Promise<void>;
  onDeleteSavedRoom: (code: string) => Promise<void>;
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang?: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => Promise<void>;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    ep: TvEpisodeItem,
    preferLang: string,
    opts?: number | { startAtSec?: number; forceSpanish?: boolean }
  ) => Promise<void>;
  loadingItemId: string | null;
  worldSearchQuery: string;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onPlayChannel: (ch: SpanishTdtChannel) => void;
  onPlayMatch: (m: SportsMatch) => void;
  onSyncPlayerAction: (action: 'play' | 'pause' | 'seek' | 'change_url', patch: Partial<VideoState>) => void;
  onNextEpisode: () => void;
  setCatalogSection: (sec: CatalogSection) => void;
  enterWorld: (world: WorldId, opts?: { withPortal?: boolean; originRect?: PortalOriginRect }) => void;
}
