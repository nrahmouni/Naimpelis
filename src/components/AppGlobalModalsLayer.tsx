import React from 'react';
import type { User } from 'firebase/auth';
import {
  FriendsInviteModal,
  GlobalIncomingInviteBanner,
} from './FriendsInviteModal';
import { NaimcineIntro } from './NaimcineIntro';
import {
  WorldPortalTransition,
  type PortalOriginRect,
  type WorldPortalKind,
} from './home/WorldPortalTransition';
import { AvatarMenuSheet } from './AvatarMenuSheet';
import { SettingsBottomSheet } from './SettingsBottomSheet';
import { GameMatchInviteModal } from './games/GameMatchInviteModal';
import { AppDiscoveryModalsGroup } from './app/AppDiscoveryModalsGroup';
import { GlobalVodModals } from './catalog/GlobalVodModals';
import { RoomPinPromptModal } from './RoomPinPromptModal';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import type { ProfileHubTab } from './UserProfileHubModal';
import type { ActiveMovieContext } from './MoviePlaybackDock';
import type { ActiveSportsMatchMeta } from '../hooks/useLiveSportsMatchDetails';
import type { CatalogSection } from './MediaCatalogHub';
import { useAppStore, type WorldId } from '../store/useAppStore';
import type { RecentRoomEntry, StoredProfile } from '../utils/storage';
import type { NativeApkUpdateAvailable } from '../utils/versionSync';
import { pickLang } from '../utils/i18n';
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
} from '../types';
import type { RoomGameInvite } from '../shared/protocol';

const UserProfileHubModal = lazyWithRetry(() =>
  import('./UserProfileHubModal').then((m) => ({ default: m.UserProfileHubModal }))
);
const GuestWelcomePopup = lazyWithRetry(() =>
  import('./GuestWelcomePopup').then((m) => ({ default: m.GuestWelcomePopup }))
);
const SmartTvQuickModal = lazyWithRetry(() =>
  import('./SmartTvQuickModal').then((m) => ({ default: m.SmartTvQuickModal }))
);

interface AppGlobalModalsLayerProps {
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

export const AppGlobalModalsLayer: React.FC<AppGlobalModalsLayerProps> = (p) => {
  const {
    lang,
    onChangeLang,
    inRoom,
    sessionMode = 'party',
    roomId,
    roomName,
    profile,
    currentUser,
    participants,
    authUser,
    authLoading,
    onSignIn,
    onSignOut,
    effectiveView,
    onToggleViewMode,
    videoState,
    activeSportsMatch,
    activeMovieContext,
    watchHistory,
    watchlist,
    favoriteChannels,
    recentRooms,
    savedRooms,
    isCurrentRoomPermanent,
    savedFriends,
    onlineUsers,
    incomingInvite,
    friendAddedNotice,
    inviteSentFeedback,
    friendsModalOpen,
    setFriendsModalOpen,
    showIntro,
    introWithSound,
    setShowIntro,
    pinPromptState,
    smartTvModalOpen,
    setSmartTvModalOpen,
    hasConnectedSmartTv,
    tvClaimStatus,
    profileHubOpen,
    setProfileHubOpen,
    profileHubTab,
    setProfileHubTab,
    avatarMenuOpen,
    setAvatarMenuOpen,
    settingsSheetOpen,
    setSettingsSheetOpen,
    unreadNotificationsCount,
    showGuestPopup,
    showNotificationCenter,
    setShowNotificationCenter,
    showCommandSearch,
    setShowCommandSearch,
    showSurpriseModal,
    setShowSurpriseModal,
    aiSearchLaunch,
    setAiSearchLaunch,
    showVoiceAssistant,
    setShowVoiceAssistant,
    showLegalModal,
    setShowLegalModal,
    setShowDesignSystem,
    quickPool,
    quickPoolLoading,
    loadQuickPool,
    cineCastellano,
    swUpdate,
    applySwUpdateNow,
    deferredAppUpdateVersion,
    nativeApkUpdate,
    setNativeApkUpdate,
    activePortalTransition,
    portalOriginRect,
    incomingGameInvite,
    onAcceptGameInvite,
    onDismissGameInvite,
    onAcceptIncomingInvite,
    onDismissIncomingInvite,
    onAddFriend,
    onRemoveFriend,
    onDismissFriendNotice,
    onSendDirectRoomInvite,
    onSubmitGuestPin,
    onUpgradeSoloToParty,
    onLeaveRoom,
    onClaimTvCode,
    onRemoteTogglePlay,
    onRemoteSeekDelta,
    onSendTvRemoteCommand,
    onSwitchThisDeviceToTvLobby,
    onUpdateProfile,
    onDismissGuestPopup,
    onReplayHistoryItem,
    onRemoveHistoryItem,
    onClearHistory,
    onPlayFromProfileCatalog,
    onToggleCatalogFavorite,
    onPlayFavoriteChannel,
    onToggleChannelFavorite,
    onCreateNewRoom,
    onSwitchRoom,
    onTogglePermanentRoom,
    onDeleteSavedRoom,
    onPlayMovie,
    onPlaySeriesEpisode,
    loadingItemId,
    worldSearchQuery,
    onAddToQueue,
    onPlayChannel,
    onPlayMatch,
    onSyncPlayerAction,
    onNextEpisode,
    setCatalogSection,
    enterWorld,
  } = p;

  const activeWorld = useAppStore((s) => s.activeWorld);
  const shareRoomId = sessionMode !== 'solo' && roomId ? roomId : undefined;

  return (
    <>
      <GlobalIncomingInviteBanner
        invite={incomingInvite}
        friendAddedNotice={friendAddedNotice}
        lang={lang}
        isAlreadyFriend={
          Boolean(friendAddedNotice) &&
          savedFriends.some(
            (f) =>
              f.friendId === friendAddedNotice?.fromUserId ||
              f.friendCode === friendAddedNotice?.fromFriendCode
          )
        }
        onAcceptInvite={onAcceptIncomingInvite}
        onDismissInvite={onDismissIncomingInvite}
        onAcceptFriendBack={(notice) => {
          onAddFriend(
            {
              friendId: notice.fromUserId,
              name: notice.fromUserName,
              avatar: notice.fromUserAvatar,
              color: notice.fromUserColor,
              friendCode: notice.fromFriendCode,
            },
            { skipNotify: true }
          );
          onDismissFriendNotice();
        }}
        onDismissFriendNotice={onDismissFriendNotice}
      />

      <FriendsInviteModal
        isOpen={friendsModalOpen}
        onClose={() => setFriendsModalOpen(false)}
        lang={lang}
        roomId={roomId}
        roomName={roomName || `Sala ${roomId.toUpperCase()}`}
        activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : undefined}
        activeMediaPoster={
          videoState.mode !== 'idle' ? videoState.poster || videoState.backdrop : undefined
        }
        activeMediaIsLive={videoState.mode !== 'idle' && Boolean(videoState.isLive)}
        activeSportsMatch={
          activeSportsMatch
            ? {
                homeTeam: activeSportsMatch.homeTeam,
                awayTeam: activeSportsMatch.awayTeam,
                homeLogo: activeSportsMatch.homeLogo,
                awayLogo: activeSportsMatch.awayLogo,
                competition: activeSportsMatch.competition,
                score:
                  activeSportsMatch.homeScore !== undefined &&
                  activeSportsMatch.awayScore !== undefined
                    ? `${activeSportsMatch.homeScore} - ${activeSportsMatch.awayScore}`
                    : undefined,
              }
            : null
        }
        activeMovie={
          activeMovieContext
            ? {
                title: activeMovieContext.title,
                year: activeMovieContext.year,
                poster: activeMovieContext.poster,
                rating: '8.0',
                season: videoState.seriesMeta?.season,
                episode: videoState.seriesMeta?.episode,
              }
            : null
        }
        currentUser={currentUser}
        participants={participants}
        savedFriends={savedFriends}
        onlineUsers={onlineUsers}
        onAddFriend={onAddFriend}
        onRemoveFriend={onRemoveFriend}
        onSendDirectRoomInvite={onSendDirectRoomInvite}
        onJoinFriendRoom={(targetCode, targetName) => {
          setFriendsModalOpen(false);
          onSwitchRoom(targetCode, targetName);
        }}
        inviteSentFeedback={inviteSentFeedback}
      />

      {showIntro && (
        <NaimcineIntro
          withSound={introWithSound}
          lang={lang}
          subtitle={
            roomName
              ? `${pickLang(lang, {
                  es: 'Entrando a',
                  ca: 'Entrant a',
                  en: 'Entering',
                })} ${roomName}`
              : undefined
          }
          onComplete={() => setShowIntro(false)}
        />
      )}

      {pinPromptState.open && (
        <RoomPinPromptModal
          isOpen={pinPromptState.open}
          roomName={pinPromptState.roomName}
          roomCode={roomId}
          invalidAttempt={pinPromptState.invalidAttempt}
          lang={lang}
          onSubmitPin={onSubmitGuestPin}
          onLeaveProtectedRoom={onLeaveRoom}
        />
      )}

      <React.Suspense fallback={null}>

        <SmartTvQuickModal
          isOpen={smartTvModalOpen}
          onClose={() => setSmartTvModalOpen(false)}
          lang={lang}
          roomId={roomId}
          hasConnectedSmartTv={hasConnectedSmartTv}
          onClaimTvCode={onClaimTvCode}
          tvClaimStatus={tvClaimStatus}
          isRoomPlaying={videoState.mode !== 'idle' && videoState.isPlaying}
          onRemoteTogglePlay={onRemoteTogglePlay}
          onRemoteSeekDelta={onRemoteSeekDelta}
          onSendTvRemoteCommand={onSendTvRemoteCommand}
          onSwitchThisDeviceToTvLobby={onSwitchThisDeviceToTvLobby}
          onTriggerAirPlayPicker={() => {
            const v = document.querySelector('video') as
              | (HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })
              | null;
            if (v?.webkitShowPlaybackTargetPicker) {
              try {
                v.webkitShowPlaybackTargetPicker();
                return true;
              } catch {
                return false;
              }
            }
            return false;
          }}
        />

        <UserProfileHubModal
          isOpen={profileHubOpen}
          initialTab={profileHubTab}
          onClose={() => setProfileHubOpen(false)}
          lang={lang}
          onChangeLang={onChangeLang}
          onOpenLegalModal={() => {
            setProfileHubOpen(false);
            setShowLegalModal(true);
          }}
          onOpenDesignSystem={() => {
            setProfileHubOpen(false);
            setShowDesignSystem(true);
          }}
          authUser={authUser}
          authLoading={authLoading}
          displayName={profile.name}
          roomId={roomId}
          roomName={roomName}
          recentRooms={recentRooms}
          watchHistory={watchHistory}
          watchlist={watchlist}
          favoriteChannels={favoriteChannels}
          effectiveView={effectiveView}
          onToggleViewMode={onToggleViewMode}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onUpdateDisplayName={(newName) =>
            onUpdateProfile(newName, profile.avatar, profile.color)
          }
          onReplayHistoryItem={onReplayHistoryItem}
          onRemoveHistoryItem={onRemoveHistoryItem}
          onClearHistory={onClearHistory}
          onPlayCatalogItem={onPlayFromProfileCatalog}
          onToggleCatalogFavorite={onToggleCatalogFavorite}
          onPlayFavoriteChannel={onPlayFavoriteChannel}
          onRemoveFavoriteChannel={(ch) => onToggleChannelFavorite(ch)}
          onCreateNewRoom={onCreateNewRoom}
          onSwitchRoom={onSwitchRoom}
          savedRooms={savedRooms}
          isCurrentRoomPermanent={isCurrentRoomPermanent}
          onToggleCurrentRoomPermanent={onTogglePermanentRoom}
          onDeleteSavedRoom={onDeleteSavedRoom}
          onLeaveRoom={onLeaveRoom}
        />

        <AvatarMenuSheet
          isOpen={avatarMenuOpen}
          onClose={() => setAvatarMenuOpen(false)}
          lang={lang}
          displayName={profile.name}
          avatar={profile.avatar || '🎬'}
          color={profile.color || '#9146FF'}
          authUser={authUser}
          unreadNotificationsCount={unreadNotificationsCount}
          hasConnectedSmartTv={hasConnectedSmartTv}
          onOpenProfile={() => {
            setProfileHubTab('account');
            setProfileHubOpen(true);
          }}
          onOpenContinueWatching={() => {
            setProfileHubTab('history');
            setProfileHubOpen(true);
          }}
          onOpenSaved={() => {
            setProfileHubTab('favorites');
            setProfileHubOpen(true);
          }}
          onOpenNotifications={() => setShowNotificationCenter(true)}
          onOpenFriends={() => setFriendsModalOpen(true)}
          onOpenSmartTv={() => setSmartTvModalOpen(true)}
          onOpenYouTube={() => enterWorld('youtube')}
          onOpenSettings={() => setSettingsSheetOpen(true)}
          inRoom={inRoom}
          sessionMode={sessionMode}
          roomName={roomName}
          onUpgradeSoloToParty={onUpgradeSoloToParty}
          onLeaveRoom={onLeaveRoom}
          onSignOut={onSignOut}
        />

        <SettingsBottomSheet
          isOpen={settingsSheetOpen}
          onClose={() => setSettingsSheetOpen(false)}
          lang={lang}
          onChangeLang={onChangeLang}
          effectiveView={effectiveView}
          onToggleViewMode={onToggleViewMode}
          authUser={authUser}
          authLoading={authLoading}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          hasConnectedSmartTv={hasConnectedSmartTv}
          onOpenSmartTv={() => setSmartTvModalOpen(true)}
          onOpenTvPairLobby={onSwitchThisDeviceToTvLobby}
          roomId={roomId}
          onClaimTvCode={onClaimTvCode}
          onLeaveRoom={onLeaveRoom}
        />

        {showGuestPopup && !showIntro && !authUser && !pinPromptState.open && (
          <GuestWelcomePopup
            currentName={profile.name}
            currentAvatar={profile.avatar}
            currentColor={profile.color}
            roomName={roomName || `Sala ${roomId.toUpperCase()}`}
            lang={lang}
            onSaveIdentity={onUpdateProfile}
            onDismissKeepRandom={onDismissGuestPopup}
          />
        )}
      </React.Suspense>

      <AppDiscoveryModalsGroup
        lang={lang}
        roomId={roomId}
        profile={profile}
        videoState={videoState}
        watchHistory={watchHistory}
        quickPool={quickPool}
        quickPoolLoading={quickPoolLoading}
        loadQuickPool={loadQuickPool}
        cineCastellano={cineCastellano}
        swUpdate={swUpdate}
        applySwUpdateNow={applySwUpdateNow}
        deferredAppUpdateVersion={deferredAppUpdateVersion}
        nativeApkUpdate={nativeApkUpdate}
        setNativeApkUpdate={setNativeApkUpdate}
        showNotificationCenter={showNotificationCenter}
        setShowNotificationCenter={setShowNotificationCenter}
        showCommandSearch={showCommandSearch}
        setShowCommandSearch={setShowCommandSearch}
        showSurpriseModal={showSurpriseModal}
        setShowSurpriseModal={setShowSurpriseModal}
        aiSearchLaunch={aiSearchLaunch}
        setAiSearchLaunch={setAiSearchLaunch}
        showVoiceAssistant={showVoiceAssistant}
        setShowVoiceAssistant={setShowVoiceAssistant}
        showLegalModal={showLegalModal}
        setShowLegalModal={setShowLegalModal}
        setFriendsModalOpen={setFriendsModalOpen}
        onSwitchRoom={onSwitchRoom}
        onPlayMovie={onPlayMovie}
        onPlaySeriesEpisode={onPlaySeriesEpisode}
        onPlayChannel={onPlayChannel}
        onPlayMatch={onPlayMatch}
        onSyncPlayerAction={onSyncPlayerAction}
        onNextEpisode={onNextEpisode}
        setCatalogSection={setCatalogSection}
        enterWorld={enterWorld}
      />

      <WorldPortalTransition
        portal={activePortalTransition}
        originRect={portalOriginRect}
        lang={lang}
      />

      <GameMatchInviteModal
        invite={incomingGameInvite}
        lang={lang}
        onAccept={onAcceptGameInvite}
        onDismiss={onDismissGameInvite}
      />

      {activeWorld !== 'kids' && (
        <GlobalVodModals
          lang={lang}
          shareRoomId={shareRoomId}
          loadingItemId={loadingItemId}
          watchHistory={watchHistory}
          watchlist={watchlist}
          worldSearchQuery={worldSearchQuery}
          effectiveCineCastellano={cineCastellano}
          onToggleCatalogFavorite={onToggleCatalogFavorite}
          onPlayMovie={(movie, preferLang, opts) => {
            void onPlayMovie(movie, preferLang, opts);
          }}
          onPlaySeriesEpisode={(series, episode, preferLang, opts) => {
            void onPlaySeriesEpisode(series, episode, preferLang, opts);
          }}
          onReplayHistoryItem={(item, forceRestart) => {
            void onReplayHistoryItem(item, forceRestart);
          }}
          onAddToQueue={onAddToQueue}
        />
      )}
    </>
  );
};
