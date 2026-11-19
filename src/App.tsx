import React from 'react';
import { MotionConfig } from 'motion/react';
import { RiffanLoaderR } from './components/ui/RiffanIcons';
import { TvEpisodeItem, TvSeriesDetails } from './types';
import type { RoomGameInviteType } from './shared/protocol';
import { pickLang } from './utils/i18n';
import { socketService } from './services/socket';
import { triggerHaptic } from './utils/haptics';
import { NaimBrandLogo } from './components/NaimBrandLogo';
import { getMonogramInitials } from './components/MobileViewportGuard';
import { OfflineIndicator } from './components/PWAInstallPrompt';
import { PreviewAutoEscapeBanner } from './components/player/PreviewAutoEscapeBanner';
import { EntryHomeScreen } from './components/EntryHomeScreen';
import { WorldShell } from './components/worlds/WorldShell';
import { FloatingRoomBubble } from './components/FloatingRoomBubble';
import { AppGlobalModalsLayer } from './components/AppGlobalModalsLayer';
import { AppEarlyRouteView } from './components/AppEarlyRouteView';
import { MediaCatalogHub } from './components/MediaCatalogHub';
import { PlayerStageContainer } from './components/PlayerStageContainer';
import { useAppController } from './hooks/useAppController';

const GamesHubSection = React.lazy(() =>
  import('./components/GamesHubSection').then((m) => ({ default: m.GamesHubSection }))
);
const RiffanKidsHub = React.lazy(() =>
  import('./components/kids/RiffanKidsHub').then((m) => ({ default: m.RiffanKidsHub }))
);
const PartySidebar = React.lazy(() =>
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
    setTvAuthToken, savedRooms, pinPromptState, tvClaimStatus, smartTvModalOpen, setSmartTvModalOpen,
    showIntro, setShowIntro, introWithSound, setIntroWithSound,
    showWatchlistOnly, setShowWatchlistOnly, showVoiceAssistant, setShowVoiceAssistant,
    kidsExitPromptSeq, quickPool, quickPoolLoading, nativeApkUpdate, setNativeApkUpdate,
    reducedMotion, activeWorld, lastUsedWorld, cineTab, setCineTab,
    cineCastellano, setCineCastellano, futbolTab, setFutbolTab,
    isFloatingRoomOpen, setIsFloatingRoomOpen, showDesignSystem, setShowDesignSystem,
    showLegalModal, setShowLegalModal, showNotificationCenter, setShowNotificationCenter,
    showCommandSearch, setShowCommandSearch, showSurpriseModal, setShowSurpriseModal,
    aiSearchLaunch, setAiSearchLaunch, typingUsers, swUpdate, applySwUpdateNow,
    deferredAppUpdateVersion, unreadNotificationsCount,
    roomId, setRoomId, roomName, setRoomName, inRoom, setInRoom,
    worldSearchQuery, setWorldSearchQuery, avatarMenuOpen, setAvatarMenuOpen,
    settingsSheetOpen, setSettingsSheetOpen, isPlayerMinimized, setIsPlayerMinimized,
    setPinFullPlayerOnChat, isPlayerClosedLocally, setIsPlayerClosedLocally,
    isCinemaMode, setCinemaModePersist, showGuestPopup,
    catalogScrollRef, mainScrollRef,
    roomState, visualViewportHeight, isMobileKeyboardOpen,
    activeSportsMatch, activeMatchDetails, loadingActiveMatchDetails,
    showLiveMatchDock, setShowLiveMatchDock, refreshActiveMatchDetails,
    isHostUser, currentUser, canChangeMedia, canControlRoom, voiceChat,
    liveMatchesCount, homeFootballMatches,
    activePortalTransition, portalOriginRect, portalLandingActive, preloadWorld, enterWorld,
    showHostLockNotice, isCurrentRoomPermanent, currentHostPin, roomHasPin,
    socialActions, isOnMobileSocialTab, effectiveVideoState,
    isPlayerActive, isDockedMini, miniDrag, roomGameActions,
    handleToggleCinemaMode, playback, handleClaimTvCode, handleSendTvRemoteCommand,
    lifecycle, isScrollCompressed, showCinemaOverlay, hasConnectedSmartTv,
    isMobileChatWithKeyboard, isAutoImmersiveLandscape, hideBrowseBelowPlayer,
    isMoviePlaybackDockVisible, isChannelGuideDockVisible, lockMainWorkspaceScroll,
  } = c;

  if (showDesignSystem || isAdsPageOpen || isTvPairLobby || !inRoom || isTvMode) {
    return (
      <AppEarlyRouteView
        showDesignSystem={showDesignSystem}
        isAdsPageOpen={isAdsPageOpen}
        isTvPairLobby={isTvPairLobby}
        inRoom={inRoom}
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
  }

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
      <div
        style={
          !isDesktopLayout && visualViewportHeight
            ? { height: `${visualViewportHeight}px` }
            : undefined
        }
        className="h-[100dvh] w-full max-w-[100vw] bg-[#0B0B0E] text-[#EFEFF1] overflow-hidden"
      >
        <div
          className={`h-full w-full flex flex-col overflow-hidden pt-safe animate-room-warp ${
            isFramedMobileOnPc
              ? 'max-w-[27rem] mx-auto bg-[#0B0B0E] border-x border-white/[0.08] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
              : 'bg-[#0B0B0E]'
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
            <header className="shrink-0 z-30 h-14 px-4 bg-[#07080C]/92 backdrop-blur-2xl border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.45)] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                aria-label="RiffanTV"
                className="flex items-center min-h-11 py-1 cursor-pointer active:scale-95 transition-transform group"
              >
                <NaimBrandLogo variant="full" size={32} />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setAvatarMenuOpen(true);
                }}
                aria-label={pickLang(lang, {
                  es: 'Menú de perfil',
                  ca: 'Menú de perfil',
                  en: 'Profile menu',
                })}
                className="relative w-10 h-10 rounded-2xl border border-white/15 flex items-center justify-center text-sm font-bold text-white cursor-pointer active:scale-95 transition-transform shrink-0 overflow-visible"
                style={{ backgroundColor: profile.color || '#9146FF' }}
              >
                {authUser?.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt={profile.name}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  <span>{getMonogramInitials(profile.name)}</span>
                )}
                {unreadNotificationsCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#EB0400] ring-2 ring-[#0B0B0E]"
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
                onDismissLanguageNotice={() => playback.setLanguageNotice(null)}
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
                onClearExtractionError={() => playback.setExtractionError(null)}
              />

              {hideBrowseBelowPlayer ? null : activeWorld === 'entry' ? (
                <div ref={catalogScrollRef} className="w-full min-w-0 shrink-0">
                  <EntryHomeScreen
                    lang={lang}
                    displayName={profile.name}
                    isGuestName={!profile.isCustomized}
                    onUpdateDisplayName={(newName) =>
                      socialActions.handleUpdateProfile(
                        newName,
                        profile.avatar,
                        profile.color
                      )
                    }
                    watchHistory={watchHistory}
                    onResumeHistoryItem={(item) => {
                      void playback.handleReplayHistoryItem(item, false);
                    }}
                    onOpenContinueWatchingAll={() => {
                      setProfileHubTab('history');
                      setProfileHubOpen(true);
                    }}
                    onOpenSurpriseMe={() => {
                      setAiSearchLaunch((prev) => ({
                        query: '',
                        mediaType: 'all',
                        mode: 'surprise',
                        seq: (prev?.seq || 0) + 1,
                      }));
                      setShowSurpriseModal(true);
                    }}
                    onSelectWorld={(world, originRect) =>
                      enterWorld(world, {
                        withPortal:
                          world === 'cine' ||
                          world === 'futbol' ||
                          world === 'tv' ||
                          world === 'juegos' ||
                          world === 'kids' ||
                          world === 'sala',
                        originRect,
                      })
                    }
                    onPreloadWorld={preloadWorld}
                    lastUsedWorld={lastUsedWorld}
                    liveMatchesCount={liveMatchesCount}
                    roomParticipantsCount={roomState.participants.length}
                    movies={quickPool.movies}
                    series={quickPool.series}
                    tdtChannels={quickPool.tdt}
                    liveMatches={homeFootballMatches}
                    onPlayMovie={(movieItem) => {
                      void playback.handlePlayMovie(
                        movieItem,
                        cineCastellano ? 'ES' : 'VOSE'
                      );
                    }}
                    onPlaySeries={async (seriesItem, targetSeason, targetEpisode) => {
                      if (seriesItem.tmdbId) {
                        try {
                          const seasonNum = targetSeason || seriesItem.seasonNumber || 1;
                          const res = await fetch(
                            `/api/catalog/tv/${seriesItem.tmdbId}?season=${seasonNum}&lang=${lang}`
                          );
                          const data = await res.json();
                          const episodes = (data?.details?.episodes || []) as TvEpisodeItem[];
                          if (episodes.length > 0) {
                            const episodeNum =
                              targetEpisode || seriesItem.episodeNumber || 1;
                            const targetEp =
                              episodes.find((ep) => ep.episodeNumber === episodeNum) ||
                              episodes[episodeNum - 1] ||
                              episodes[0];
                            await playback.handlePlaySeriesEpisode(
                              data.details as TvSeriesDetails,
                              targetEp,
                              cineCastellano ? 'ES' : 'VOSE'
                            );
                            return;
                          }
                        } catch {
                          // fallback
                        }
                      }
                      enterWorld('cine');
                    }}
                    onOpenDesignSystem={() => setShowDesignSystem(true)}
                    onChangeLang={setLang}
                    onPlayChannel={(ch) => {
                      void playback.handlePlayTdtChannel(ch, 0);
                    }}
                    onPlayMatch={(matchItem) => {
                      void playback.handlePlaySportsMatch(matchItem, 0);
                    }}
                    onSelectGame={(gid) => {
                      const mappedGame = (
                        gid === 'billar' ? 'pool' : gid
                      ) as RoomGameInviteType;
                      roomState.setForcedOpenGame({ gameType: mappedGame, seq: Date.now() });
                      roomState.setIsInActiveGame(true);
                      enterWorld('juegos', { withPortal: true });
                    }}
                    onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                  />
                </div>
              ) : activeWorld === 'sala' ? (
                <WorldShell
                  world="sala"
                  title={pickLang(lang, {
                    es: 'Sala con Amigos',
                    ca: 'Sala amb Amics',
                    en: 'Watch Party',
                  })}
                  lang={lang}
                  onBack={() => enterWorld('entry')}
                  onGoHome={() => enterWorld('entry')}
                  onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                  fullHeight
                  className={portalLandingActive ? 'rtv-world-touchdown' : ''}
                >
                  {renderPartySidebar()}
                </WorldShell>
              ) : activeWorld === 'juegos' ? (
                <WorldShell
                  world="juegos"
                  title={pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
                  lang={lang}
                  onBack={() => {
                    if (roomState.isInActiveGame) {
                      roomState.setIsInActiveGame(false);
                      roomState.setForcedOpenGame(null);
                    }
                    enterWorld('entry');
                  }}
                  onGoHome={() => enterWorld('entry')}
                  onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                  fullHeight={roomState.isInActiveGame}
                  className={portalLandingActive ? 'rtv-world-touchdown' : ''}
                >
                  <div
                    className={
                      roomState.isInActiveGame
                        ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
                        : 'w-full flex flex-col'
                    }
                  >
                    <GamesHubSection
                      lang={lang}
                      roomId={roomId}
                      currentUser={currentUser}
                      participants={roomState.participants}
                      roomBoardGame={roomState.roomGameState}
                      roomPartyGame={roomState.partyGameState}
                      roomPinturilloGame={roomState.pinturilloState}
                      roomPoolGame={roomState.poolGameState}
                      roomChapasGame={roomState.chapasGameState}
                      roomHeadSoccerGame={roomState.headSoccerGameState}
                      headSoccerSyncSnapshot={roomState.headSoccerSyncSnapshot}
                      headSoccerPeerInput={roomState.headSoccerPeerInput}
                      roomPokerGame={roomState.pokerGameState}
                      roomBlackjackGame={roomState.blackjackGameState}
                      matchResponses={roomState.matchResponses}
                      gameMoveError={roomState.gameMoveError}
                      isHost={isHostUser}
                      voiceChat={voiceChat}
                      requestedGameOpen={roomState.forcedOpenGame}
                      onSelectedGameChange={(game) => {
                        roomState.activeHubGameRef.current = game;
                        roomState.setIsInActiveGame(game !== null);
                      }}
                      {...roomGameActions}
                    />
                  </div>
                </WorldShell>
              ) : activeWorld === 'kids' ? (
                <div className="fixed inset-0 z-50 w-full h-[100dvh] overflow-hidden bg-[#0A0E23] flex flex-col">
                  <RiffanKidsHub
                    shellLang={lang}
                    exitPromptSeq={kidsExitPromptSeq}
                    onOpenSmartTv={() => setSmartTvModalOpen(true)}
                    onExitKids={() => enterWorld('entry')}
                  />
                </div>
              ) : (
                <WorldShell
                  world={activeWorld}
                  className={portalLandingActive ? 'rtv-world-touchdown' : ''}
                  title={
                    activeWorld === 'cine'
                      ? pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Cinema' })
                      : activeWorld === 'futbol'
                      ? pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })
                      : activeWorld === 'tv'
                      ? pickLang(lang, {
                          es: 'TV en Directo',
                          ca: 'TV en Directe',
                          en: 'Live TV',
                        })
                      : 'YouTube'
                  }
                  lang={lang}
                  onBack={() => enterWorld('entry')}
                  onGoHome={() => enterWorld('entry')}
                  onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
                  searchValue={worldSearchQuery}
                  onSearchChange={setWorldSearchQuery}
                  searchPlaceholder={
                    activeWorld === 'cine'
                      ? pickLang(lang, {
                          es: 'Buscar película, serie o enlace...',
                          ca: 'Cercar pel·lícula, sèrie o enllaç...',
                          en: 'Search movie, series or URL...',
                        })
                      : activeWorld === 'futbol'
                      ? pickLang(lang, {
                          es: 'Buscar partido, equipo o canal...',
                          ca: 'Cercar partit, equip o canal...',
                          en: 'Search match, team or channel...',
                        })
                      : activeWorld === 'tv'
                      ? pickLang(lang, {
                          es: 'Buscar canal o programa...',
                          ca: 'Cercar canal o programa...',
                          en: 'Search channel or show...',
                        })
                      : pickLang(lang, {
                          es: 'Buscar en YouTube...',
                          ca: 'Cercar a YouTube...',
                          en: 'Search YouTube...',
                        })
                  }
                >
                  <MediaCatalogHub
                    worldMode={activeWorld}
                    externalSearchQuery={worldSearchQuery}
                    onExternalSearchChange={setWorldSearchQuery}
                    cineTab={cineTab}
                    onCineTabChange={setCineTab}
                    cineCastellano={cineCastellano}
                    onCineCastellanoChange={setCineCastellano}
                    futbolTab={futbolTab}
                    onFutbolTabChange={setFutbolTab}
                    activeSection={roomState.catalogSection}
                    onChangeSection={(sec) => {
                      if (sec === 'tdt') enterWorld('tv');
                      else if (sec === 'sports') enterWorld('futbol');
                      else if (sec === 'youtube') enterWorld('youtube');
                      else if (sec === 'games') enterWorld('juegos');
                      else if (sec === 'direct') enterWorld('sala');
                      else roomState.setCatalogSection(sec);
                    }}
                    lang={lang}
                    userName={currentUser.name}
                    activeVideoRawUrl={roomState.videoState.rawSourceUrl}
                    activeMediaTitle={
                      roomState.videoState.mode !== 'idle' ? roomState.videoState.title : ''
                    }
                    loadingItemId={playback.loadingItemId}
                    roomQueue={roomState.roomQueue}
                    watchHistory={watchHistory}
                    watchlist={watchlist}
                    favoriteChannels={favoriteChannels}
                    onToggleCatalogFavorite={socialActions.handleToggleCatalogFavorite}
                    onToggleChannelFavorite={socialActions.handleToggleChannelFavorite}
                    onPlayFavoriteChannel={playback.handlePlayFavoriteChannel}
                    onPlayMovie={playback.handlePlayMovie}
                    onPlaySeriesEpisode={playback.handlePlaySeriesEpisode}
                    onPlayCatalaEpisode={playback.handlePlayCatalaEpisode}
                    onReplayHistoryItem={playback.handleReplayHistoryItem}
                    onRemoveHistoryItem={socialActions.handleRemoveHistoryItem}
                    onClearHistory={socialActions.handleClearAllHistory}
                    onPlaySportsMatch={playback.handlePlaySportsMatch}
                    onPlayTdtChannel={playback.handlePlayTdtChannel}
                    onPlayYouTubeVideo={playback.handlePlayYouTubeVideo}
                    onPlayCustomUrl={playback.handlePlayCustomUrl}
                    onOpenCloudBrowser={lifecycle.handleOpenCloudBrowser}
                    onAddToQueue={lifecycle.handleAddToQueue}
                    onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
                    onPlayQueueItem={playback.handlePlayQueueItem}
                    onStartPollFromQueue={lifecycle.handleStartPollFromQueue}
                    onPlaySecondaryChannel={playback.handlePlaySecondaryChannel}
                    hasConnectedSmartTv={hasConnectedSmartTv}
                    onCreateNewRoom={lifecycle.handleCreateFreshRoom}
                    showWatchlistOnly={showWatchlistOnly}
                    onWatchlistOnlyChange={setShowWatchlistOnly}
                    currentUser={currentUser}
                    participants={roomState.participants}
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
                    onOpenSurpriseMe={() => {
                      setAiSearchLaunch((prev) => ({
                        query: '',
                        mediaType: 'all',
                        mode: 'surprise',
                        seq: (prev?.seq || 0) + 1,
                      }));
                      setShowSurpriseModal(true);
                    }}
                  />
                </WorldShell>
              )}
            </div>
          </div>

          <FloatingRoomBubble
            lang={lang}
            visible={inRoom && activeWorld !== 'sala' && activeWorld !== 'kids' && !isTvMode}
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
            onAcceptGameInvite={(invite) => {
              socketService.respondToGameInvite(invite.gameType, 'accepted', invite.id);
              roomState.setIncomingGameInvite(null);
              setCinemaModePersist(false);
              roomState.setFloatingChatOpen(false);
              if (roomState.videoStateRef.current.mode !== 'idle') setIsPlayerMinimized(true);
              enterWorld('juegos');
              roomState.setForcedOpenGame({ gameType: invite.gameType, seq: Date.now() });
              roomState.setIsInActiveGame(true);
            }}
            onDismissGameInvite={() => {
              if (roomState.incomingGameInvite) {
                socketService.respondToGameInvite(
                  roomState.incomingGameInvite.gameType,
                  'declined',
                  roomState.incomingGameInvite.id
                );
              }
              roomState.setIncomingGameInvite(null);
            }}
            onAcceptIncomingInvite={lifecycle.handleAcceptIncomingRoomInvite}
            onDismissIncomingInvite={() => setIncomingInvite(null)}
            onAddFriend={socialActions.handleAddFriend}
            onRemoveFriend={socialActions.handleRemoveFriend}
            onDismissFriendNotice={() => {
              if (friendNoticeTimerRef.current) clearTimeout(friendNoticeTimerRef.current);
              setFriendAddedNotice(null);
            }}
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
        </div>
      </div>
    </MotionConfig>
  );
}

export default App;
