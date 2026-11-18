import React, { useCallback, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Download, RefreshCw } from 'lucide-react';
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
import type { ProfileHubTab } from './UserProfileHubModal';
import type { ActiveMovieContext } from './MoviePlaybackDock';
import type { ActiveSportsMatchMeta } from '../hooks/useLiveSportsMatchDetails';
import type { CatalogSection } from './MediaCatalogHub';
import type { WorldId } from '../store/useAppStore';
import type { RecentRoomEntry, StoredProfile } from '../utils/storage';
import type { NativeApkUpdateAvailable } from '../utils/versionSync';
import { triggerApkDownload } from '../utils/apkDownload';
import { clearStaleCachesAndReload } from '../utils/versionSync';
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

const UserProfileHubModal = React.lazy(() =>
  import('./UserProfileHubModal').then((m) => ({ default: m.UserProfileHubModal }))
);
const GuestWelcomePopup = React.lazy(() =>
  import('./GuestWelcomePopup').then((m) => ({ default: m.GuestWelcomePopup }))
);
const RoomPinPromptModal = React.lazy(() =>
  import('./RoomPinPromptModal').then((m) => ({ default: m.RoomPinPromptModal }))
);
const SmartTvQuickModal = React.lazy(() =>
  import('./SmartTvQuickModal').then((m) => ({ default: m.SmartTvQuickModal }))
);
const NotificationCenterSheet = React.lazy(() =>
  import('./NotificationCenterSheet').then((m) => ({ default: m.NotificationCenterSheet }))
);
const CommandSearchModal = React.lazy(() =>
  import('./CommandSearchModal').then((m) => ({ default: m.CommandSearchModal }))
);
const SurpriseMeModal = React.lazy(() =>
  import('./SurpriseMeModal').then((m) => ({ default: m.SurpriseMeModal }))
);
const VoiceAssistantModal = React.lazy(() =>
  import('./VoiceAssistantModal').then((m) => ({ default: m.VoiceAssistantModal }))
);
const LegalPrivacyModal = React.lazy(() =>
  import('./LegalPrivacyModal').then((m) => ({ default: m.LegalPrivacyModal }))
);

interface AppGlobalModalsLayerProps {
  lang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  inRoom: boolean;
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
  onPlayMovie: (movie: CatalogMovie, preferLang?: string) => Promise<void>;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    ep: TvEpisodeItem,
    preferLang: string
  ) => Promise<void>;
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
    onPlayChannel,
    onPlayMatch,
    onSyncPlayerAction,
    onNextEpisode,
    setCatalogSection,
    enterWorld,
  } = p;

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

      <React.Suspense fallback={null}>
        <RoomPinPromptModal
          isOpen={pinPromptState.open}
          roomName={pinPromptState.roomName}
          roomCode={roomId}
          invalidAttempt={pinPromptState.invalidAttempt}
          lang={lang}
          onSubmitPin={onSubmitGuestPin}
          onLeaveProtectedRoom={onLeaveRoom}
        />

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
          roomName={roomName}
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

      {(swUpdate || nativeApkUpdate || deferredAppUpdateVersion) && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-[70] max-w-xs px-4 py-3 rounded-2xl bg-[#18181B]/95 backdrop-blur-xl border border-[#9146FF]/40 shadow-2xl flex items-center justify-between gap-3">
          <div className="text-xs text-white font-semibold">
            {nativeApkUpdate
              ? pickLang(lang, {
                  es: `Nueva APK v${nativeApkUpdate.versionName} lista`,
                  ca: `Nova APK v${nativeApkUpdate.versionName} llesta`,
                  en: `New APK v${nativeApkUpdate.versionName} ready`,
                })
              : pickLang(lang, {
                  es: `Nueva versión ${deferredAppUpdateVersion || ''} lista`.trim(),
                  ca: `Nova versió ${deferredAppUpdateVersion || ''} llesta`.trim(),
                  en: `Update ${deferredAppUpdateVersion || ''} ready`.trim(),
                })}
          </div>
          {nativeApkUpdate ? (
            <button
              type="button"
              onClick={() => {
                const filename =
                  nativeApkUpdate.flavor === 'tv' ? 'RIFFAN-TV-TV.apk' : 'RIFFAN-TV.apk';
                void triggerApkDownload(nativeApkUpdate.apkUrl, filename);
                setNativeApkUpdate(null);
              }}
              className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Instalar', ca: 'Instal·lar', en: 'Install' })}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (swUpdate) {
                  applySwUpdateNow();
                } else if (deferredAppUpdateVersion) {
                  void clearStaleCachesAndReload();
                }
              }}
              className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Actualizar', ca: 'Actualitzar', en: 'Update' })}</span>
            </button>
          )}
        </div>
      )}

      <React.Suspense fallback={null}>
        <NotificationCenterSheet
          isOpen={showNotificationCenter}
          onClose={() => setShowNotificationCenter(false)}
          lang={lang}
          onActionNotification={(item) => {
            setShowNotificationCenter(false);
            if (item.roomId && item.roomId !== roomId) {
              onSwitchRoom(item.roomId);
            }
          }}
        />

        <CommandSearchModal
          isOpen={showCommandSearch}
          onClose={() => setShowCommandSearch(false)}
          lang={lang}
          movies={quickPool.movies}
          series={quickPool.series}
          tdtChannels={quickPool.tdt}
          onSelectCatalogItem={async (item) => {
            if (item.mediaType === 'tv' && item.tmdbId) {
              setCatalogSection('series');
              try {
                const seasonNum = item.seasonNumber || 1;
                const res = await fetch(
                  `/api/catalog/tv/${item.tmdbId}?season=${seasonNum}&lang=${lang}`
                );
                const data = await res.json();
                if (data?.details?.episodes?.length > 0) {
                  await onPlaySeriesEpisode(
                    data.details as TvSeriesDetails,
                    data.details.episodes[0] as TvEpisodeItem,
                    'ES'
                  );
                }
              } catch {
                // fallback already focused series section
              }
            } else {
              await onPlayMovie(item, 'ES');
            }
          }}
          onSelectChannel={onPlayChannel}
          onSearchWithAi={(query, mediaType = 'all') => {
            setShowCommandSearch(false);
            setAiSearchLaunch((prev) => ({
              query,
              mediaType,
              mode: 'request',
              seq: (prev?.seq || 0) + 1,
            }));
            setShowSurpriseModal(true);
          }}
        />

        <SurpriseMeModal
          isOpen={showSurpriseModal}
          onClose={() => setShowSurpriseModal(false)}
          lang={lang}
          movies={quickPool.movies}
          series={quickPool.series}
          isLoading={quickPoolLoading}
          initialRequest={aiSearchLaunch}
          onRetryLoad={() => {
            void loadQuickPool();
          }}
          onPlayItem={async (item) => {
            if (item.mediaType === 'tv' && item.tmdbId) {
              setCatalogSection('series');
              try {
                const seasonNum = item.seasonNumber || 1;
                const res = await fetch(
                  `/api/catalog/tv/${item.tmdbId}?season=${seasonNum}&lang=${lang}`
                );
                const data = await res.json();
                if (data?.details?.episodes?.length > 0) {
                  await onPlaySeriesEpisode(
                    data.details as TvSeriesDetails,
                    data.details.episodes[0] as TvEpisodeItem,
                    'ES'
                  );
                }
              } catch {
                // keep series tab focused
              }
            } else {
              await onPlayMovie(item, 'ES');
            }
          }}
        />

        <VoiceAssistantModal
          isOpen={showVoiceAssistant}
          onClose={() => setShowVoiceAssistant(false)}
          lang={lang}
          userName={profile.name}
          activeMediaTitle={videoState.mode !== 'idle' ? videoState.title : ''}
          watchHistory={watchHistory}
          onPlayMovie={(movieItem, preferLang = 'ES') => {
            void onPlayMovie(movieItem, preferLang);
          }}
          onPlaySeries={async (seriesItem, targetSeason, targetEpisode) => {
            if (seriesItem.tmdbId) {
              setCatalogSection('series');
              try {
                const seasonNum = targetSeason || seriesItem.seasonNumber || 1;
                const res = await fetch(
                  `/api/catalog/tv/${seriesItem.tmdbId}?season=${seasonNum}&lang=${lang}`
                );
                const data = await res.json();
                const episodes = (data?.details?.episodes || []) as TvEpisodeItem[];
                if (episodes.length > 0) {
                  const episodeNum = targetEpisode || seriesItem.episodeNumber || 1;
                  const targetEp =
                    episodes.find((ep) => ep.episodeNumber === episodeNum) ||
                    episodes[episodeNum - 1] ||
                    episodes[0];
                  await onPlaySeriesEpisode(
                    data.details as TvSeriesDetails,
                    targetEp,
                    cineCastellano ? 'ES' : 'VOSE'
                  );
                  return;
                }
              } catch {
                // fallback below
              }
            }
            enterWorld('cine');
          }}
          onPlayChannel={onPlayChannel}
          onPlayMatch={onPlayMatch}
          onAppAction={(action) => {
            if (action.type === 'open_world' && action.payload) {
              const target = action.payload as WorldId;
              enterWorld(target, {
                withPortal:
                  target === 'cine' ||
                  target === 'futbol' ||
                  target === 'tv' ||
                  target === 'juegos' ||
                  target === 'sala',
              });
            } else if (action.type === 'open_friends') {
              setFriendsModalOpen(true);
            } else if (action.type === 'surprise_me') {
              setAiSearchLaunch((prev) => ({
                query: '',
                mediaType: 'all',
                mode: 'surprise',
                seq: (prev?.seq || 0) + 1,
              }));
              setShowSurpriseModal(true);
            } else if (action.type === 'player_control') {
              const cmd = action.payload;
              if (cmd === 'play' || cmd === 'pause') {
                onSyncPlayerAction(cmd, { isPlaying: cmd === 'play' });
              } else if (cmd === 'next_episode') {
                onNextEpisode();
              } else if (cmd === 'mute' || cmd === 'unmute') {
                const vid = document.querySelector('video');
                if (vid) vid.muted = cmd === 'mute';
              } else if (cmd === 'fullscreen') {
                if (document.fullscreenElement) {
                  void document.exitFullscreen?.();
                } else {
                  void document.documentElement.requestFullscreen?.();
                }
              }
            }
          }}
        />

        <LegalPrivacyModal
          isOpen={showLegalModal}
          onClose={() => setShowLegalModal(false)}
          lang={lang}
        />
      </React.Suspense>

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
    </>
  );
};
