import React, { useCallback } from 'react';
import { Check } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { RiffanBackIcon, RiffanLoaderR } from './components/ui/RiffanIcons';
import { pickLang } from './utils/i18n';
import { socketService } from './services/socket';
import { triggerHaptic } from './utils/haptics';
import { showAppShareToast } from './utils/shareDedicatedLink';
import { NaimBrandLogo } from './components/NaimBrandLogo';
import { getMonogramInitials } from './components/MobileViewportGuard';
import { OfflineIndicator } from './components/PWAInstallPrompt';
import { PreviewAutoEscapeBanner } from './components/player/PreviewAutoEscapeBanner';
import { FloatingRoomBubble } from './components/FloatingRoomBubble';
import { AppGlobalModalsLayer } from './components/AppGlobalModalsLayer';
import { AppEarlyRouteView } from './components/AppEarlyRouteView';
import { AppWorldsContent } from './components/AppWorldsContent';
import { PlayerStageContainer } from './components/PlayerStageContainer';
import { useAppController } from './hooks/useAppController';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { GlobalMusicLayer } from './components/music/GlobalMusicLayer';
import { useMusicStore } from './store/useMusicStore';

const PartySidebar = lazyWithRetry(() =>
  import('./components/PartySidebar').then((m) => ({ default: m.PartySidebar }))
);

export function App() {
  const c = useAppController();
  const {
    lang, setLang, profile, recentRooms, watchHistory, watchlist, favoriteChannels,
    savedFriends, onlineUsers, friendsModalOpen, setFriendsModalOpen,
    incomingInvite, setIncomingInvite, friendAddedNotice, setFriendAddedNotice,
    inviteSentFeedback, friendNoticeTimerRef,
    effectiveView, isDesktopLayout, isFramedMobileOnPc, toggleViewMode,
    authUser, authLoading, profileHubOpen, setProfileHubOpen, profileHubTab, setProfileHubTab,
    isTvMode, setIsTvMode, isTvPairLobby, setIsTvPairLobby, isAdsPageOpen, setIsAdsPageOpen,
    isAdminPage, setIsAdminPage, isSamsungPage, setIsSamsungPage, isWebOsPage, setIsWebOsPage,
    isControllerPage, setIsControllerPage, controllerPairCode,
    setTvAuthToken, savedRooms, pinPromptState, tvClaimStatus, smartTvModalOpen, setSmartTvModalOpen,
    showIntro, setShowIntro, introWithSound, setIntroWithSound,
    showVoiceAssistant, setShowVoiceAssistant,
    quickPool, quickPoolLoading, nativeApkUpdate, setNativeApkUpdate,
    reducedMotion, activeWorld,
    cineCastellano,
    isFloatingRoomOpen, setIsFloatingRoomOpen, showDesignSystem, setShowDesignSystem,
    showLegalModal, setShowLegalModal, showNotificationCenter, setShowNotificationCenter,
    showCommandSearch, setShowCommandSearch, showSurpriseModal, setShowSurpriseModal,
    aiSearchLaunch, setAiSearchLaunch, typingUsers, swUpdate, applySwUpdateNow,
    deferredAppUpdateVersion, unreadNotificationsCount,
    roomId, setRoomId, roomName, setRoomName, inRoom, setInRoom,
    worldSearchQuery, avatarMenuOpen, setAvatarMenuOpen,
    settingsSheetOpen, setSettingsSheetOpen, isPlayerMinimized, setIsPlayerMinimized,
    setPinFullPlayerOnChat, isPlayerClosedLocally, setIsPlayerClosedLocally,
    isCinemaMode, setCinemaModePersist, showGuestPopup,
    catalogScrollRef, mainScrollRef,
    roomState, visualViewportHeight, isMobileKeyboardOpen,
    activeSportsMatch, activeMatchDetails, loadingActiveMatchDetails,
    showLiveMatchDock, setShowLiveMatchDock, refreshActiveMatchDetails,
    currentUser, canChangeMedia, canControlRoom, voiceChat,
    activePortalTransition, portalOriginRect, enterWorld,
    showHostLockNotice, isCurrentRoomPermanent, currentHostPin, roomHasPin,
    socialActions, isOnMobileSocialTab, effectiveVideoState,
    isPlayerActive, isDockedMini, miniDrag,
    handleToggleCinemaMode, playback, handleClaimTvCode, handleSendTvRemoteCommand,
    lifecycle, isScrollCompressed, showCinemaOverlay, hasConnectedSmartTv,
    isMobileChatWithKeyboard, isAutoImmersiveLandscape, hideBrowseBelowPlayer,
    isMoviePlaybackDockVisible, isChannelGuideDockVisible, lockMainWorkspaceScroll,
    sessionMode, hasEnteredApp, shareToast, deepLinkResolving,
    exitToastVisible, restorePlaybackOrigin,
  } = c;

  const hasActiveMusicBar = useMusicStore((s) => Boolean(s.currentTrack || s.activeRadio));

  const handleDismissLanguageNotice = useCallback(() => {
    playback.setLanguageNotice(null);
  }, [playback.setLanguageNotice]);

  const handleClearExtractionError = useCallback(() => {
    playback.setExtractionError(null);
  }, [playback.setExtractionError]);

  const handleAcceptGameInvite = useCallback(
    (invite: NonNullable<typeof roomState.incomingGameInvite>) => {
      socketService.respondToGameInvite(invite.gameType, 'accepted', invite.id);
      roomState.setIncomingGameInvite(null);
      setCinemaModePersist(false);
      roomState.setFloatingChatOpen(false);
      if (roomState.videoStateRef.current.mode !== 'idle') setIsPlayerMinimized(true);
      enterWorld('juegos');
      roomState.setForcedOpenGame({ gameType: invite.gameType, seq: Date.now() });
      roomState.setIsInActiveGame(true);
    },
    [
      roomState.setIncomingGameInvite,
      setCinemaModePersist,
      roomState.setFloatingChatOpen,
      roomState.videoStateRef,
      setIsPlayerMinimized,
      enterWorld,
      roomState.setForcedOpenGame,
      roomState.setIsInActiveGame,
    ]
  );

  const handleDismissGameInvite = useCallback(() => {
    const current = roomState.incomingGameInvite;
    if (current) {
      socketService.respondToGameInvite(current.gameType, 'declined', current.id);
    }
    roomState.setIncomingGameInvite(null);
  }, [roomState.incomingGameInvite, roomState.setIncomingGameInvite]);

  const handleDismissIncomingInvite = useCallback(() => {
    setIncomingInvite(null);
  }, [setIncomingInvite]);

  const handleDismissFriendNotice = useCallback(() => {
    if (friendNoticeTimerRef.current) clearTimeout(friendNoticeTimerRef.current);
    setFriendAddedNotice(null);
  }, [friendNoticeTimerRef, setFriendAddedNotice]);

  const isEarlyRoute =
    isControllerPage || isSamsungPage || isWebOsPage || isAdminPage || showDesignSystem || isAdsPageOpen || isTvPairLobby || (!inRoom && !hasEnteredApp) || isTvMode;

  const handleOpenMusicWorldFromBar = useCallback(() => {
    if (!inRoom && !hasEnteredApp) {
      lifecycle.handleEnterSolo(profile);
    }
    enterWorld('music');
  }, [inRoom, hasEnteredApp, lifecycle, profile, enterWorld]);

  const renderEarlyRoute = () => (
    <AppEarlyRouteView
      showDesignSystem={showDesignSystem}
      isAdsPageOpen={isAdsPageOpen}
      isAdminPage={isAdminPage}
      isSamsungPage={isSamsungPage}
      isWebOsPage={isWebOsPage}
      isControllerPage={isControllerPage}
      controllerPairCode={controllerPairCode}
      isTvPairLobby={isTvPairLobby}
      inRoom={inRoom}
      hasEnteredApp={hasEnteredApp}
      isTvMode={isTvMode}
      reducedMotion={reducedMotion}
      lang={lang}
      roomId={roomId}
      roomName={roomName}
      profile={profile}
      recentRooms={recentRooms}
      effectiveView={effectiveView}
      isFramedMobileOnPc={isFramedMobileOnPc}
      authUser={authUser}
      authLoading={authLoading}
      showIntro={showIntro}
      introWithSound={introWithSound}
      incomingInvite={incomingInvite}
      friendAddedNotice={friendAddedNotice}
      savedFriends={savedFriends}
      pinPromptState={pinPromptState}
      videoState={roomState.videoState}
      currentUser={currentUser}
      isExtracting={roomState.isExtracting}
      extractionLabel={playback.extractionLabel}
      extractionError={playback.extractionError}
      languageNotice={playback.languageNotice}
      cloudFrame={roomState.cloudFrame}
      cloudState={roomState.cloudState}
      floatingReactions={roomState.floatingReactions}
      participantCount={roomState.participants.length}
      setShowDesignSystem={setShowDesignSystem}
      setIsAdsPageOpen={setIsAdsPageOpen}
      setIsAdminPage={setIsAdminPage}
      setIsSamsungPage={setIsSamsungPage}
      setIsWebOsPage={setIsWebOsPage}
      setIsControllerPage={setIsControllerPage}
      setIsTvPairLobby={setIsTvPairLobby}
      setIsTvMode={setIsTvMode}
      setTvAuthToken={setTvAuthToken}
      setRoomId={setRoomId}
      setRoomName={setRoomName}
      setInRoom={setInRoom}
      setShowIntro={setShowIntro}
      setIntroWithSound={setIntroWithSound}
      setIncomingInvite={setIncomingInvite}
      setFriendAddedNotice={setFriendAddedNotice}
      setLanguageNotice={playback.setLanguageNotice}
      clearManualLobbyStay={() => {
        roomState.manualLobbyStayRef.current = false;
      }}
      clearFriendNoticeTimer={() => {
        if (friendNoticeTimerRef.current) clearTimeout(friendNoticeTimerRef.current);
      }}
      toggleViewMode={toggleViewMode}
      onGoogleSignIn={socialActions.handleGoogleSignIn}
      onGoogleSignOut={socialActions.handleGoogleSignOut}
      onChangeLang={setLang}
      onEnterRoom={lifecycle.handleEnterRoom}
      onEnterSolo={lifecycle.handleEnterSolo}
      onAcceptIncomingRoomInvite={lifecycle.handleAcceptIncomingRoomInvite}
      onAddFriend={socialActions.handleAddFriend}
      onSubmitGuestPin={socialActions.handleSubmitGuestPin}
      onLeaveRoom={lifecycle.handleLeaveRoom}
      onCancelMediaExtraction={playback.handleCancelMediaExtraction}
      onSyncPlayerAction={playback.handleSyncPlayerAction}
      onSelectTrack={(idx, sec) => {
        void playback.handleSelectTrack(idx, sec || 0);
      }}
      onPromoteCloudStreamToNative={playback.handlePromoteCloudStreamToNative}
      onPrevEpisode={playback.handlePrevEpisode}
      onNextEpisode={playback.handleNextEpisode}
    />
  );

  const renderPartySidebar = () => (
    <React.Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-6 text-zinc-400">
          <RiffanLoaderR size={40} />
        </div>
      }
    >
      <PartySidebar
        roomId={roomId}
        currentUser={currentUser}
        hostId={roomState.hostId}
        participants={roomState.participants}
        messages={roomState.messages}
        lang={lang}
        effectiveView={effectiveView}
        onToggleViewMode={toggleViewMode}
        authUser={authUser}
        authLoading={authLoading}
        onSignIn={socialActions.handleGoogleSignIn}
        onSignOut={socialActions.handleGoogleSignOut}
        hostOnlyControl={roomState.hostOnlyControl}
        onToggleHostLock={(nextLocked) => {
          triggerHaptic('light');
          socketService.setHostLock(nextLocked);
        }}
        roomName={roomName}
        onRenameRoom={socialActions.handleRenameRoom}
        hasPin={roomHasPin}
        currentHostPin={currentHostPin}
        onSetRoomPin={socialActions.handleSetRoomPin}
        isCurrentRoomPermanent={isCurrentRoomPermanent}
        onTogglePermanentRoom={socialActions.handleTogglePermanentRoom}
        onClaimTvCode={handleClaimTvCode}
        tvClaimStatus={tvClaimStatus}
        isRoomPlaying={roomState.videoState.mode !== 'idle' && roomState.videoState.isPlaying}
        onRemoteTogglePlay={lifecycle.handleRemoteTogglePlay}
        onRemoteSeekDelta={lifecycle.handleRemoteSeekDelta}
        onSendTvRemoteCommand={handleSendTvRemoteCommand}
        onSwitchThisDeviceToTvLobby={lifecycle.handleSwitchThisDeviceToTvLobby}
        activePoll={roomState.activePoll}
        roomQueue={roomState.roomQueue}
        onPlayQueueItem={playback.handlePlayQueueItem}
        onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
        onPromoteQueueItem={(id) => socketService.promoteQueueItem(id)}
        onReorderQueueItem={(id, dir) => socketService.reorderQueueItem(id, dir)}
        onRestoreQueueItem={(item) => socketService.addToQueue(item)}
        onVoteQueueItem={(id) => socketService.voteQueueItem(id, currentUser.id)}
        onSetParticipantRole={(uid, role) => socketService.setParticipantRole(uid, role)}
        pinnedMessage={roomState.pinnedMessage}
        onPinMessage={(msgId) => socketService.pinChatMessage(msgId)}
        onUnpinMessage={() => socketService.unpinChatMessage()}
        typingUsers={typingUsers}
        onTypingChange={(isTyping) => socketService.sendTypingState(currentUser, isTyping)}
        activeMediaTitle={roomState.videoState.mode !== 'idle' ? roomState.videoState.title : ''}
        activeMediaPoster={
          roomState.videoState.mode !== 'idle'
            ? roomState.videoState.poster || roomState.videoState.backdrop || ''
            : ''
        }
        activeMediaIsLive={
          roomState.videoState.mode !== 'idle' && Boolean(roomState.videoState.isLive)
        }
        currentVideoTimeSec={
          roomState.videoState.mode !== 'idle' && !roomState.videoState.isLive
            ? playback.livePlaybackSec || roomState.videoState.currentTime || 0
            : 0
        }
        onSeekToTimestamp={
          roomState.videoState.mode !== 'idle' && !roomState.videoState.isLive
            ? (sec) => playback.handleSyncPlayerAction('seek', { currentTime: sec })
            : undefined
        }
        onPlayCustomUrl={playback.handlePlayCustomUrl}
        onOpenCloudBrowser={lifecycle.handleOpenCloudBrowser}
        onBrowseCatalog={() => {
          setIsFloatingRoomOpen(false);
          enterWorld('cine');
        }}
        onStartPollFromQueue={lifecycle.handleStartPollFromQueue}
        onVotePoll={(pollId, optionId) => socketService.votePoll(pollId, optionId)}
        onClosePoll={(pollId) => socketService.closePoll(pollId)}
        initialView="chat"
        openQueueTrigger={roomState.openQueueTrigger}
        savedFriends={savedFriends}
        onlineUsers={onlineUsers}
        onOpenFriendsModal={() => setFriendsModalOpen(true)}
        onAddFriend={socialActions.handleAddFriend}
        onSendDirectRoomInvite={socialActions.handleSendDirectRoomInvite}
        inviteSentFeedback={inviteSentFeedback}
        onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
        onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
        onTransferHost={(newId) => socketService.transferHost(newId)}
        onUpdateProfile={socialActions.handleUpdateProfile}
        onCreateNewRoom={lifecycle.handleCreateFreshRoom}
        onSwitchRoom={(targetCode) => lifecycle.handleSwitchActiveRoom(targetCode)}
        onLeaveRoom={lifecycle.handleLeaveRoom}
        voiceChat={voiceChat}
      />
    </React.Suspense>
  );

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      {isEarlyRoute ? (
        renderEarlyRoute()
      ) : (
      <div
        style={
          !isDesktopLayout && visualViewportHeight
            ? { height: `${visualViewportHeight}px` }
            : undefined
        }
        className="h-[100dvh] w-full max-w-[100vw] bg-[#000000] text-[#EFEFF1] overflow-hidden"
      >
        <div
          className={`h-full w-full flex flex-col overflow-hidden pt-safe animate-room-warp ${
            isFramedMobileOnPc
              ? 'max-w-[27rem] mx-auto bg-[#000000] border-x border-white/[0.08] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
              : 'bg-[#000000]'
          }`}
        >
          <PreviewAutoEscapeBanner variant="bar" />
          <OfflineIndicator lang={lang} />

          {showCinemaOverlay && (
            <div
              aria-hidden="true"
              className="fixed inset-0 bg-black/80 z-40 pointer-events-none transition-opacity duration-300"
            />
          )}

          {activeWorld === 'entry' && !isMobileChatWithKeyboard && !isAutoImmersiveLandscape && (
            <header className="shrink-0 z-30 h-14 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 bg-[#000000]/92 backdrop-blur-2xl border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('light');
                    c.triggerBackStep();
                  }}
                  aria-label={pickLang(lang, {
                    es: 'Volver atrás',
                    ca: 'Tornar enrere',
                    en: 'Go back',
                    rif: 'Ɣer deffar',
                    zh: '返回',
                  })}
                  title={pickLang(lang, {
                    es: 'Volver atrás',
                    ca: 'Tornar enrere',
                    en: 'Go back',
                    rif: 'Ɣer deffar',
                    zh: '返回',
                  })}
                  className="min-w-11 min-h-11 rounded-2xl bg-[#0D0D12]/90 hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer active:scale-95 transition-all tv-focus-ring shrink-0"
                >
                  <RiffanBackIcon size={19} animate="hover" />
                </button>

                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('light');
                    catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-label="RiffanTV"
                  className="flex items-center min-h-11 py-1 px-1.5 rounded-2xl cursor-pointer active:scale-95 transition-transform group tv-focus-ring"
                >
                  <NaimBrandLogo variant="full" size={30} />
                </button>
              </div>

              <button
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('light');
                  setAvatarMenuOpen(true);
                }}
                aria-label={pickLang(lang, {
                  es: 'Menú de perfil',
                  ca: 'Menú de perfil',
                  en: 'Profile menu',
                  rif: 'Umuɣ n uprufil',
                  zh: '个人菜单',
                })}
                className="relative w-11 h-11 rounded-full border border-white/15 flex items-center justify-center text-sm font-bold text-white cursor-pointer active:scale-95 transition-transform shrink-0 overflow-visible shadow-[0_0_0_2px_rgba(124,58,237,0.22)] tv-focus-ring"
                style={{ backgroundColor: profile.color || '#7C3AED' }}
              >
                {authUser?.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt={profile.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <span>{getMonogramInitials(profile.name)}</span>
                )}
                {unreadNotificationsCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#EB0400] ring-2 ring-[#000000]"
                  />
                )}
              </button>
            </header>
          )}

          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <div
              ref={mainScrollRef}
              onScroll={miniDrag.handleCatalogOrWorkspaceScroll}
              className={
                lockMainWorkspaceScroll
                  ? 'flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden'
                  : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-clip touch-pan-y smooth-scroll-area'
              }
            >
              <PlayerStageContainer
                lang={lang}
                userName={currentUser.name}
                currentUserId={currentUser.id}
                roomId={roomId}
                roomDisplayName={roomName || `Sala ${roomId.toUpperCase()}`}
                sessionMode={sessionMode}
                onUpgradeSoloToParty={() =>
                  void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
                }
                effectiveVideoState={effectiveVideoState}
                isPlayerActive={isPlayerActive}
                isDockedMini={isDockedMini}
                isDesktopLayout={isDesktopLayout}
                isScrollCompressed={isScrollCompressed}
                showCinemaOverlay={showCinemaOverlay}
                isAutoImmersiveLandscape={isAutoImmersiveLandscape}
                isMobileKeyboardOpen={isMobileKeyboardOpen}
                activeWorld={activeWorld}
                miniCornerPositionClasses={miniDrag.miniCornerPositionClasses}
                miniDragOffset={miniDrag.miniDragOffset}
                handleMiniPointerDown={miniDrag.handleMiniPointerDown}
                handleMiniPointerMove={miniDrag.handleMiniPointerMove}
                handleMiniPointerUp={miniDrag.handleMiniPointerUp}
                isExtracting={roomState.isExtracting}
                extractionLabel={playback.extractionLabel}
                extractionError={playback.extractionError}
                languageNotice={playback.languageNotice}
                onDismissLanguageNotice={handleDismissLanguageNotice}
                cloudFrame={roomState.cloudFrame}
                cloudState={roomState.cloudState}
                floatingReactions={roomState.floatingReactions}
                isCinemaMode={isCinemaMode}
                onToggleCinemaMode={handleToggleCinemaMode}
                secondaryStream={roomState.secondaryStream}
                onSwapSecondaryStream={playback.handleSwapSecondaryStream}
                onToggleSecondaryLayout={playback.handleToggleSecondaryLayout}
                onCloseSecondaryStream={playback.handleCloseSecondaryStream}
                canControlRoom={canControlRoom}
                hasConnectedSmartTv={hasConnectedSmartTv}
                participants={roomState.participants}
                savedFriends={savedFriends}
                onlineUsers={onlineUsers}
                messages={roomState.messages}
                floatingChatOpen={isFloatingRoomOpen}
                unreadChatCount={roomState.unreadChatCount}
                voiceChat={voiceChat}
                lockNoticeToast={roomState.lockNoticeToast}
                queueAddedNotice={roomState.queueAddedNotice}
                roomQueueLength={roomState.roomQueue.length}
                isPlayerClosedLocally={isPlayerClosedLocally}
                isPlayerMinimized={isPlayerMinimized}
                activeSportsMatch={activeSportsMatch}
                showLiveMatchDock={showLiveMatchDock}
                activeMatchDetails={activeMatchDetails}
                loadingActiveMatchDetails={loadingActiveMatchDetails}
                loadingItemId={playback.loadingItemId}
                activeMovieContext={roomState.activeMovieContext}
                isMoviePlaybackDockVisible={isMoviePlaybackDockVisible}
                isChannelGuideDockVisible={isChannelGuideDockVisible}
                tdtChannels={quickPool.tdt}
                onExpandCompressed={() => {
                  miniDrag.setIsAutoMiniByScroll(false);
                  mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onToggleMinimize={() => {
                  if (isDockedMini) {
                    setIsPlayerMinimized(false);
                    miniDrag.setIsAutoMiniByScroll(false);
                    if (isOnMobileSocialTab) setPinFullPlayerOnChat(true);
                    else {
                      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  } else {
                    setCinemaModePersist(false);
                    if (isOnMobileSocialTab) setPinFullPlayerOnChat(false);
                    else setIsPlayerMinimized(true);
                    restorePlaybackOrigin({ reason: 'minimize' });
                  }
                }}
                onClosePlayer={playback.handleClosePlayer}
                onCancelExtraction={playback.handleCancelMediaExtraction}
                onOpenSmartTvModal={() => setSmartTvModalOpen(true)}
                onSendTvRemoteCommand={handleSendTvRemoteCommand}
                onOpenFriendsModal={() => setFriendsModalOpen(true)}
                onSendDirectRoomInvite={socialActions.handleSendDirectRoomInvite}
                onSendMessage={(txt) => socketService.sendChatMessage(currentUser, txt)}
                onSendReaction={(em) => socketService.sendReaction(currentUser, em)}
                onOpenInCloudBrowser={(targetUrl) => {
                  if (sessionMode === 'solo') {
                    showAppShareToast(
                      pickLang(lang, {
                        es: 'Activa «Ver con amigos» para usar Cloud HD',
                        ca: 'Activa «Veure amb amics» per usar Cloud HD',
                        en: 'Switch to "Watch with friends" to use Cloud HD',
                      })
                    );
                    return;
                  }
                  if (!canChangeMedia) {
                    showHostLockNotice(
                      roomState.participants.find((p) => p.id === roomState.hostId)?.name
                    );
                    return;
                  }
                  socketService.startCloudBrowser(targetUrl, profile.name);
                }}
                onToggleFloatingChat={() => {
                  const next = !isFloatingRoomOpen;
                  setIsFloatingRoomOpen(next);
                  if (next) roomState.setUnreadChatCount(0);
                }}
                onOpenCatalogSection={(sec) => {
                  roomState.setCatalogSection(sec);
                  if (sec === 'tdt') enterWorld('tv');
                  else if (sec === 'sports') enterWorld('futbol');
                  else if (sec === 'youtube') enterWorld('youtube');
                  else if (sec === 'games') enterWorld('juegos');
                  else enterWorld('cine');
                }}
                onSyncAction={playback.handleSyncPlayerAction}
                onSelectTrack={(idx, seekSec) => {
                  void playback.handleSelectTrack(idx, seekSec || 0);
                }}
                onAutoSwitchBackupTrack={(reason) => {
                  void playback.handleAutoSwitchBackupTrack(reason);
                }}
                onPromoteCloudStreamToNative={playback.handlePromoteCloudStreamToNative}
                onPrevEpisode={playback.handlePrevEpisode}
                onNextEpisode={playback.handleNextEpisode}
                onProgressUpdate={playback.handlePlayerProgressUpdate}
                onOpenRoomQueueView={lifecycle.handleOpenRoomQueueView}
                onRefreshMatchDetails={refreshActiveMatchDetails}
                onCloseMatchDock={() => setShowLiveMatchDock(false)}
                onShowMatchDock={() => setShowLiveMatchDock(true)}
                onSelectEpisode={(series, episode, pLang) => {
                  void playback.handlePlaySeriesEpisode(series, episode, pLang || 'ES');
                }}
                onSelectMovie={(movieItem, pLang) => {
                  void playback.handlePlayMovie(movieItem, (pLang || 'ES') as any);
                }}
                onSelectChannel={(ch, progHint) => {
                  void playback.handlePlayTdtChannel(ch, 0, progHint);
                }}
                onReopenPlayer={() => {
                  setIsPlayerClosedLocally(false);
                  setIsPlayerMinimized(false);
                }}
                onStopRoomPlayback={playback.handleStopRoomPlaybackForEveryone}
                onClearExtractionError={handleClearExtractionError}
              />

              {hideBrowseBelowPlayer ? null : (
                <div className={hasActiveMusicBar && activeWorld !== 'music' ? 'pb-24 sm:pb-28' : ''}>
                  <AppWorldsContent controller={c} renderPartySidebar={renderPartySidebar} />
                </div>
              )}
            </div>
          </div>

          <FloatingRoomBubble
            lang={lang}
            visible={
              inRoom &&
              sessionMode !== 'solo' &&
              activeWorld !== 'sala' &&
              !isTvMode &&
              !showCommandSearch &&
              !showSurpriseModal &&
              !showVoiceAssistant &&
              !showLegalModal &&
              !showNotificationCenter &&
              !showDesignSystem &&
              !isAdminPage &&
              !profileHubOpen &&
              !settingsSheetOpen &&
              !smartTvModalOpen &&
              !aiSearchLaunch
            }
            participantsCount={roomState.participants.length}
            voiceActive={voiceChat.isJoined}
            unreadCount={roomState.unreadChatCount}
            isSheetOpen={isFloatingRoomOpen}
            dockedBelowPlayer={isPlayerActive && !isDockedMini && !isPlayerClosedLocally}
            onOpenSheet={() => {
              setIsFloatingRoomOpen(true);
              roomState.setUnreadChatCount(0);
            }}
            onCloseSheet={() => setIsFloatingRoomOpen(false)}
            onOpenFullSala={() => enterWorld('sala')}
          >
            {renderPartySidebar()}
          </FloatingRoomBubble>

          <AppGlobalModalsLayer
            lang={lang}
            onChangeLang={setLang}
            inRoom={inRoom}
            sessionMode={sessionMode}
            onUpgradeSoloToParty={() =>
              void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
            }
            roomId={roomId}
            roomName={roomName}
            profile={profile}
            currentUser={currentUser}
            participants={roomState.participants}
            authUser={authUser}
            authLoading={authLoading}
            onSignIn={socialActions.handleGoogleSignIn}
            onSignOut={socialActions.handleGoogleSignOut}
            effectiveView={effectiveView}
            onToggleViewMode={toggleViewMode}
            videoState={roomState.videoState}
            activeSportsMatch={activeSportsMatch}
            activeMovieContext={roomState.activeMovieContext}
            watchHistory={watchHistory}
            watchlist={watchlist}
            favoriteChannels={favoriteChannels}
            recentRooms={recentRooms}
            savedRooms={savedRooms}
            isCurrentRoomPermanent={isCurrentRoomPermanent}
            savedFriends={savedFriends}
            onlineUsers={onlineUsers}
            incomingInvite={incomingInvite}
            friendAddedNotice={friendAddedNotice}
            inviteSentFeedback={inviteSentFeedback}
            friendsModalOpen={friendsModalOpen}
            setFriendsModalOpen={setFriendsModalOpen}
            showIntro={showIntro}
            introWithSound={introWithSound}
            setShowIntro={setShowIntro}
            pinPromptState={pinPromptState}
            smartTvModalOpen={smartTvModalOpen}
            setSmartTvModalOpen={setSmartTvModalOpen}
            hasConnectedSmartTv={hasConnectedSmartTv}
            tvClaimStatus={tvClaimStatus}
            profileHubOpen={profileHubOpen}
            setProfileHubOpen={setProfileHubOpen}
            profileHubTab={profileHubTab}
            setProfileHubTab={setProfileHubTab}
            avatarMenuOpen={avatarMenuOpen}
            setAvatarMenuOpen={setAvatarMenuOpen}
            settingsSheetOpen={settingsSheetOpen}
            setSettingsSheetOpen={setSettingsSheetOpen}
            unreadNotificationsCount={unreadNotificationsCount}
            showGuestPopup={showGuestPopup}
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
            setShowDesignSystem={setShowDesignSystem}
            onOpenAdminConsole={() => {
              setIsAdminPage(true);
              if (typeof window !== 'undefined') window.history.pushState({}, '', '/admin');
            }}
            quickPool={quickPool}
            quickPoolLoading={quickPoolLoading}
            loadQuickPool={socialActions.loadQuickPool}
            cineCastellano={cineCastellano}
            swUpdate={Boolean(swUpdate)}
            applySwUpdateNow={applySwUpdateNow}
            deferredAppUpdateVersion={deferredAppUpdateVersion}
            nativeApkUpdate={nativeApkUpdate}
            setNativeApkUpdate={setNativeApkUpdate}
            activePortalTransition={activePortalTransition}
            portalOriginRect={portalOriginRect}
            incomingGameInvite={roomState.incomingGameInvite}
            onAcceptGameInvite={handleAcceptGameInvite}
            onDismissGameInvite={handleDismissGameInvite}
            onAcceptIncomingInvite={lifecycle.handleAcceptIncomingRoomInvite}
            onDismissIncomingInvite={handleDismissIncomingInvite}
            onAddFriend={socialActions.handleAddFriend}
            onRemoveFriend={socialActions.handleRemoveFriend}
            onDismissFriendNotice={handleDismissFriendNotice}
            onSendDirectRoomInvite={socialActions.handleSendDirectRoomInvite}
            onSubmitGuestPin={socialActions.handleSubmitGuestPin}
            onLeaveRoom={lifecycle.handleLeaveRoom}
            onClaimTvCode={handleClaimTvCode}
            onRemoteTogglePlay={lifecycle.handleRemoteTogglePlay}
            onRemoteSeekDelta={lifecycle.handleRemoteSeekDelta}
            onSendTvRemoteCommand={handleSendTvRemoteCommand}
            onSwitchThisDeviceToTvLobby={lifecycle.handleSwitchThisDeviceToTvLobby}
            onUpdateProfile={socialActions.handleUpdateProfile}
            onDismissGuestPopup={socialActions.handleDismissGuestPopup}
            onReplayHistoryItem={playback.handleReplayHistoryItem}
            onRemoveHistoryItem={socialActions.handleRemoveHistoryItem}
            onClearHistory={socialActions.handleClearAllHistory}
            onPlayFromProfileCatalog={playback.handlePlayFromProfileCatalog}
            onToggleCatalogFavorite={socialActions.handleToggleCatalogFavorite}
            onPlayFavoriteChannel={playback.handlePlayFavoriteChannel}
            onToggleChannelFavorite={socialActions.handleToggleChannelFavorite}
            onCreateNewRoom={lifecycle.handleCreateFreshRoom}
            onSwitchRoom={lifecycle.handleSwitchActiveRoom}
            onTogglePermanentRoom={socialActions.handleTogglePermanentRoom}
            onDeleteSavedRoom={socialActions.handleDeleteSavedRoom}
            onPlayMovie={playback.handlePlayMovie}
            onPlaySeriesEpisode={playback.handlePlaySeriesEpisode}
            loadingItemId={playback.loadingItemId}
            worldSearchQuery={worldSearchQuery}
            onAddToQueue={lifecycle.handleAddToQueue}
            onPlayChannel={(ch) => {
              void playback.handlePlayTdtChannel(ch, 0);
            }}
            onPlayMatch={(m) => {
              void playback.handlePlaySportsMatch(m, 0);
            }}
            onSyncPlayerAction={playback.handleSyncPlayerAction}
            onNextEpisode={playback.handleNextEpisode}
            setCatalogSection={roomState.setCatalogSection}
            enterWorld={enterWorld}
          />

          {deepLinkResolving && (
            <div
              role="status"
              aria-live="polite"
              className="fixed top-16 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-2xl bg-[#0D0D12]/96 backdrop-blur-xl border border-[#7C3AED]/50 text-xs font-semibold text-white shadow-[0_14px_40px_rgba(0,0,0,0.85)] flex items-center gap-2.5 pointer-events-none animate-fade-in"
            >
              <RiffanLoaderR size={20} />
              <span>
                {pickLang(lang, {
                  es: 'Abriendo enlace directo...',
                  ca: 'Obrint enllaç directe...',
                  en: 'Opening direct link...',
                })}
              </span>
            </div>
          )}

          {(exitToastVisible || shareToast) && (
            <div
              role="status"
              aria-live="polite"
              className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[135] w-auto max-w-[calc(100%-2rem)] px-4 py-2.5 rounded-2xl bg-[#0D0D12]/96 backdrop-blur-xl text-xs font-semibold text-white shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex items-center gap-2 pointer-events-none animate-fade-in border ${
                exitToastVisible ? 'border-white/20' : 'border-[#7C3AED]/55'
              }`}
            >
              {exitToastVisible ? (
                <span>
                  {pickLang(lang, {
                    es: 'Pulsa atrás de nuevo para salir',
                    ca: 'Prem enrere de nou per sortir',
                    en: 'Press back again to exit',
                  })}
                </span>
              ) : (
                <>
                  <span className="w-5 h-5 rounded-full bg-[#7C3AED]/25 border border-[#8B5CF6]/45 flex items-center justify-center text-[#D8B4FE] shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                  <span className="leading-snug">{shareToast}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}
      {!isTvMode && (
        <GlobalMusicLayer
          isFullscreenVideoActive={
            !isEarlyRoute && isPlayerActive && !isDockedMini && !isPlayerClosedLocally
          }
          onOpenMusicWorld={handleOpenMusicWorldFromBar}
        />
      )}
    </MotionConfig>
  );
}

export default App;
