import React from 'react';
import {
  FriendsInviteModal,
  GlobalIncomingInviteBanner,
} from './FriendsInviteModal';
import { NaimcineIntro } from './NaimcineIntro';
import { WorldPortalTransition } from './home/WorldPortalTransition';
import { AvatarMenuSheet } from './AvatarMenuSheet';
import { SettingsBottomSheet } from './SettingsBottomSheet';
import { PWAInstallOptionsSheet } from './PWAInstallPrompt';
import { GameMatchInviteModal } from './games/GameMatchInviteModal';
import { AppDiscoveryModalsGroup } from './app/AppDiscoveryModalsGroup';
import { GlobalVodModals } from './catalog/GlobalVodModals';
import { RoomPinPromptModal } from './RoomPinPromptModal';
import { GlobalA11yHost, SkipToContentLink } from './ui/A11yUtilities';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { pickLang } from '../utils/i18n';
import type { SpanishTdtChannel } from '../types';
import type { AppGlobalModalsLayerProps } from './app/appGlobalModalsTypes';

const UserProfileHubModal = lazyWithRetry(() =>
  import('./UserProfileHubModal').then((m) => ({ default: m.UserProfileHubModal }))
);
const GuestWelcomePopup = lazyWithRetry(() =>
  import('./GuestWelcomePopup').then((m) => ({ default: m.GuestWelcomePopup }))
);
const SmartTvQuickModal = lazyWithRetry(() =>
  import('./SmartTvQuickModal').then((m) => ({ default: m.SmartTvQuickModal }))
);
const SpotifyYtmImportModal = lazyWithRetry(() =>
  import('./music/SpotifyYtmImportModal').then((m) => ({ default: m.SpotifyYtmImportModal }))
);
const SpainVpnGatewayModal = lazyWithRetry(() =>
  import('./settings/SpainVpnGatewayModal').then((m) => ({ default: m.SpainVpnGatewayModal }))
);

export const AppGlobalModalsLayer: React.FC<AppGlobalModalsLayerProps> = (p) => {
  const [installSheetOpen, setInstallSheetOpen] = React.useState(false);
  const [vpnGatewayOpen, setVpnGatewayOpen] = React.useState(false);

  const playTdtChannelById = React.useCallback(
    async (channelId: 'tdt-antena3' | 'tdt-lasexta' | 'tdt-energy') => {
      const poolList = p.quickPool?.tdt || [];
      let target = poolList.find((c) => c.id === channelId) || null;
      if (!target) {
        try {
          const res = await fetch('/api/catalog/tdt');
          const data = (await res.json()) as { channels?: SpanishTdtChannel[] };
          if (Array.isArray(data?.channels)) {
            target = data.channels.find((c) => c.id === channelId) || null;
          }
        } catch {
          // ignore fetch error
        }
      }
      if (target) {
        p.onPlayChannel(target);
      }
    },
    [p.quickPool?.tdt, p.onPlayChannel]
  );

  React.useEffect(() => {
    const onOpenInstall = () => setInstallSheetOpen(true);
    const onOpenVpn = () => setVpnGatewayOpen(true);
    const onPlayTdtId = (ev: Event) => {
      const chId = (ev as CustomEvent<{ channelId?: string }>)?.detail?.channelId;
      if (chId === 'tdt-antena3' || chId === 'tdt-lasexta' || chId === 'tdt-energy') {
        void playTdtChannelById(chId);
      }
    };
    window.addEventListener('riffan:open-install', onOpenInstall);
    window.addEventListener('riffan:open-vpn-gateway', onOpenVpn);
    window.addEventListener('riffan:play-tdt-id', onPlayTdtId);
    return () => {
      window.removeEventListener('riffan:open-install', onOpenInstall);
      window.removeEventListener('riffan:open-vpn-gateway', onOpenVpn);
      window.removeEventListener('riffan:play-tdt-id', onPlayTdtId);
    };
  }, [playTdtChannelById]);

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

  const shareRoomId = sessionMode !== 'solo' && roomId ? roomId : undefined;

  return (
    <>
      <SkipToContentLink lang={lang} />
      <GlobalA11yHost lang={lang} />
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
          onOpenInstallApp={() => setInstallSheetOpen(true)}
          onOpenAdminConsole={p.onOpenAdminConsole}
          inRoom={inRoom}
          sessionMode={sessionMode}
          roomName={roomName}
          onUpgradeSoloToParty={onUpgradeSoloToParty}
          onLeaveRoom={onLeaveRoom}
          onSignOut={onSignOut}
        />

        <PWAInstallOptionsSheet
          isOpen={installSheetOpen}
          onClose={() => setInstallSheetOpen(false)}
          lang={lang}
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
          onPlayChannelById={playTdtChannelById}
        />

        {vpnGatewayOpen && (
          <SpainVpnGatewayModal
            isOpen={vpnGatewayOpen}
            onClose={() => setVpnGatewayOpen(false)}
            lang={lang}
            onPlayChannelById={playTdtChannelById}
          />
        )}

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

        <SpotifyYtmImportModal />
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
    </>
  );
};
