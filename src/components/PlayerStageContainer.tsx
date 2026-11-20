import React from 'react';
import type { PointerEventHandler } from 'react';
import { ListVideo, Lock } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  ChatMessage,
  CloudBrowserState,
  FloatingReaction,
  LanguageNoticePopup,
  OnlineAppUser,
  Participant,
  SavedFriend,
  SecondaryStreamState,
  SpanishTdtChannel,
  TvEpisodeItem,
  TvSeriesDetails,
  VideoState,
} from '../types';
import type { ActiveSportsMatchMeta } from '../hooks/useLiveSportsMatchDetails';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import type { ActiveMovieContext } from './MoviePlaybackDock';
import type { CatalogSection } from './MediaCatalogHub';
import type { WorldId } from '../store/useAppStore';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { shareDedicatedLink } from '../utils/shareDedicatedLink';
import type { CanonicalLinkInput } from '../shared/dedicatedRoutes';
import { CinemaPlaybackDocks } from './player/CinemaPlaybackDocks';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const NativeCinemaPlayer = lazyWithRetry(() =>
  import('./NativeCinemaPlayer').then((m) => ({ default: m.NativeCinemaPlayer }))
);

interface PlayerStageContainerProps {
  lang: AppLanguage;
  userName: string;
  currentUserId: string;
  roomId: string;
  roomDisplayName: string;
  sessionMode?: 'solo' | 'party';
  onUpgradeSoloToParty?: () => void;
  effectiveVideoState: VideoState;
  isPlayerActive: boolean;
  isDockedMini: boolean;
  isDesktopLayout: boolean;
  isScrollCompressed: boolean;
  showCinemaOverlay: boolean;
  isAutoImmersiveLandscape: boolean;
  isMobileKeyboardOpen: boolean;
  activeWorld: WorldId;
  miniCornerPositionClasses: string;
  miniDragOffset: { x: number; y: number } | null;
  handleMiniPointerDown: PointerEventHandler<HTMLDivElement>;
  handleMiniPointerMove: PointerEventHandler<HTMLDivElement>;
  handleMiniPointerUp: PointerEventHandler<HTMLDivElement>;
  isExtracting: boolean;
  extractionLabel: string;
  extractionError: string | null;
  languageNotice: LanguageNoticePopup | null;
  onDismissLanguageNotice: () => void;
  cloudFrame: string | null;
  cloudState: CloudBrowserState | null;
  floatingReactions: FloatingReaction[];
  isCinemaMode: boolean;
  onToggleCinemaMode: () => void;
  secondaryStream: SecondaryStreamState | null;
  onSwapSecondaryStream: () => void;
  onToggleSecondaryLayout: () => void;
  onCloseSecondaryStream: () => void;
  canControlRoom: boolean;
  hasConnectedSmartTv: boolean;
  participants: Participant[];
  savedFriends: SavedFriend[];
  onlineUsers: OnlineAppUser[];
  messages: ChatMessage[];
  floatingChatOpen: boolean;
  unreadChatCount: number;
  voiceChat: GameVoiceChatState;
  lockNoticeToast: string | null;
  queueAddedNotice: string | null;
  roomQueueLength: number;
  isPlayerClosedLocally: boolean;
  isPlayerMinimized: boolean;
  activeSportsMatch: ActiveSportsMatchMeta | null;
  showLiveMatchDock: boolean;
  activeMatchDetails: any;
  loadingActiveMatchDetails: boolean;
  loadingItemId: string | null;
  activeMovieContext: ActiveMovieContext | null;
  isMoviePlaybackDockVisible: boolean;
  isChannelGuideDockVisible: boolean;
  tdtChannels: SpanishTdtChannel[];
  onExpandCompressed: () => void;
  onToggleMinimize: () => void;
  onClosePlayer: () => void;
  onCancelExtraction: () => void;
  onOpenSmartTvModal: () => void;
  onSendTvRemoteCommand: (cmd: any) => void;
  onOpenFriendsModal: () => void;
  onSendDirectRoomInvite: (f: { friendId: string; name: string; friendCode?: string }) => void;
  onSendMessage: (txt: string) => void;
  onSendReaction: (em: string) => void;
  onOpenInCloudBrowser: (targetUrl: string) => void;
  onToggleFloatingChat: () => void;
  onOpenCatalogSection: (sec: CatalogSection) => void;
  onSyncAction: (type: any, patch: any) => void;
  onSelectTrack: (idx: number, seekSec?: number) => void;
  onAutoSwitchBackupTrack?: (reason?: string) => void;
  onPromoteCloudStreamToNative: (rawUrl: string) => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onProgressUpdate: (sec: number, dur: number) => void;
  onOpenRoomQueueView: () => void;
  onRefreshMatchDetails: () => void;
  onCloseMatchDock: () => void;
  onShowMatchDock: () => void;
  onSelectEpisode: (series: TvSeriesDetails, episode: TvEpisodeItem, pLang?: any) => void;
  onSelectMovie: (movieItem: CatalogMovie, pLang?: any) => void;
  onSelectChannel: (ch: SpanishTdtChannel, progHint?: string) => void;
  onReopenPlayer: () => void;
  onStopRoomPlayback: () => void;
  onClearExtractionError: () => void;
}

export const PlayerStageContainer: React.FC<PlayerStageContainerProps> = ({
  lang,
  userName,
  currentUserId,
  roomId,
  roomDisplayName,
  sessionMode = 'party',
  onUpgradeSoloToParty,
  effectiveVideoState,
  isPlayerActive,
  isDockedMini,
  isDesktopLayout,
  isScrollCompressed,
  showCinemaOverlay,
  isAutoImmersiveLandscape,
  isMobileKeyboardOpen,
  activeWorld,
  miniCornerPositionClasses,
  miniDragOffset,
  handleMiniPointerDown,
  handleMiniPointerMove,
  handleMiniPointerUp,
  isExtracting,
  extractionLabel,
  extractionError,
  languageNotice,
  onDismissLanguageNotice,
  cloudFrame,
  cloudState,
  floatingReactions,
  isCinemaMode,
  onToggleCinemaMode,
  secondaryStream,
  onSwapSecondaryStream,
  onToggleSecondaryLayout,
  onCloseSecondaryStream,
  canControlRoom,
  hasConnectedSmartTv,
  participants,
  savedFriends,
  onlineUsers,
  messages,
  floatingChatOpen,
  unreadChatCount,
  voiceChat,
  lockNoticeToast,
  queueAddedNotice,
  roomQueueLength,
  isPlayerClosedLocally,
  isPlayerMinimized,
  activeSportsMatch,
  showLiveMatchDock,
  activeMatchDetails,
  loadingActiveMatchDetails,
  loadingItemId,
  activeMovieContext,
  isMoviePlaybackDockVisible,
  isChannelGuideDockVisible,
  tdtChannels,
  onExpandCompressed,
  onToggleMinimize,
  onClosePlayer,
  onCancelExtraction,
  onOpenSmartTvModal,
  onSendTvRemoteCommand,
  onOpenFriendsModal,
  onSendDirectRoomInvite,
  onSendMessage,
  onSendReaction,
  onOpenInCloudBrowser,
  onToggleFloatingChat,
  onOpenCatalogSection,
  onSyncAction,
  onSelectTrack,
  onAutoSwitchBackupTrack,
  onPromoteCloudStreamToNative,
  onPrevEpisode,
  onNextEpisode,
  onProgressUpdate,
  onOpenRoomQueueView,
  onRefreshMatchDetails,
  onCloseMatchDock,
  onShowMatchDock,
  onSelectEpisode,
  onSelectMovie,
  onSelectChannel,
  onReopenPlayer,
  onStopRoomPlayback,
  onClearExtractionError,
}) => {
  const handleShareCurrentMedia = () => {
    let target: CanonicalLinkInput = { kind: 'home' };
    if (effectiveVideoState.seriesMeta?.tmdbId) {
      target = {
        kind: 'series',
        tmdbId: effectiveVideoState.seriesMeta.tmdbId,
        title: effectiveVideoState.seriesMeta.seriesTitle || effectiveVideoState.title,
        season: effectiveVideoState.seriesMeta.season,
        episode: effectiveVideoState.seriesMeta.episode,
      };
    } else if (activeMovieContext?.tmdbId) {
      target = {
        kind: 'movie',
        tmdbId: activeMovieContext.tmdbId,
        title: activeMovieContext.title || effectiveVideoState.title,
      };
    } else if (activeSportsMatch) {
      target = {
        kind: 'match',
        eventId: activeSportsMatch.eventId || activeSportsMatch.fotmobMatchId,
        homeTeam: activeSportsMatch.homeTeam,
        awayTeam: activeSportsMatch.awayTeam,
      };
    } else if (effectiveVideoState.isLive) {
      const matchedTdt = tdtChannels.find(
        (ch) =>
          (effectiveVideoState.rawSourceUrl &&
            ch.channels.some((tr) => tr.sourceUrl === effectiveVideoState.rawSourceUrl)) ||
          (effectiveVideoState.title &&
            ch.name.toLowerCase() === effectiveVideoState.title.toLowerCase())
      );
      if (matchedTdt) {
        target = { kind: 'channel', id: matchedTdt.id, name: matchedTdt.name };
      } else if (effectiveVideoState.title) {
        target = { kind: 'channel', id: effectiveVideoState.title, name: effectiveVideoState.title };
      }
    } else if (effectiveVideoState.title) {
      target = { kind: 'movie', title: effectiveVideoState.title };
    }

    void shareDedicatedLink({
      target,
      roomId: sessionMode !== 'solo' && roomId ? roomId : undefined,
      title: effectiveVideoState.title || 'RiffanTV',
    });
  };

  return (
    <>
      <div
        onPointerDown={isDockedMini ? handleMiniPointerDown : undefined}
        onPointerMove={isDockedMini ? handleMiniPointerMove : undefined}
        onPointerUp={isDockedMini ? handleMiniPointerUp : undefined}
        onPointerCancel={isDockedMini ? handleMiniPointerUp : undefined}
        style={
          isDockedMini && miniDragOffset
            ? {
                transform: `translate3d(${miniDragOffset.x}px, ${miniDragOffset.y}px, 0)`,
                transition: 'none',
              }
            : undefined
        }
        className={
          isDockedMini
            ? `fixed ${miniCornerPositionClasses} ${
                isDesktopLayout ? 'w-80' : 'w-56'
              } z-[55] touch-none select-none cursor-grab active:cursor-grabbing transition-all duration-300 ease-out`
            : `shrink-0 w-full min-w-0 ${
                isPlayerActive
                  ? isDesktopLayout
                    ? isScrollCompressed
                      ? 'sticky top-0 z-30 block w-full max-w-none px-3 pt-1.5 pb-1.5 bg-[#000000]/95 backdrop-blur-md border-b border-white/[0.08] transition-all duration-200'
                      : 'sticky top-0 z-30 block w-full max-w-none px-2 pt-2 sm:px-4 sm:pt-2 bg-[#000000] transition-all duration-200'
                    : isAutoImmersiveLandscape
                    ? 'block h-full flex-1 bg-black'
                    : isScrollCompressed
                    ? 'block bg-[#000000]/95 border-b border-white/[0.08] transition-all duration-200'
                    : 'block border-b border-white/[0.08] transition-all duration-200'
                  : 'hidden'
              }`
        }
      >
        <div
          className={
            isDockedMini || showCinemaOverlay || isScrollCompressed
              ? 'relative'
              : isDesktopLayout
              ? 'relative rounded-3xl shadow-[0_32px_90px_rgba(0,0,0,0.9)]'
              : 'relative'
          }
        >
          {isPlayerActive &&
            !isDockedMini &&
            !isScrollCompressed &&
            (effectiveVideoState.backdrop || effectiveVideoState.poster) && (
              <img
                src={effectiveVideoState.backdrop || effectiveVideoState.poster}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="hidden sm:block absolute -inset-6 w-[calc(100%+3rem)] h-[calc(100%+3rem)] object-cover blur-3xl opacity-30 scale-105 pointer-events-none select-none -z-10"
              />
            )}
          <React.Suspense fallback={null}>
            <NativeCinemaPlayer
              videoState={effectiveVideoState}
              lang={lang}
              userName={userName}
              isExtracting={isExtracting}
              extractionLabel={extractionLabel}
              extractionError={extractionError}
              languageNotice={languageNotice}
              onDismissLanguageNotice={onDismissLanguageNotice}
              cloudFrame={cloudFrame}
              cloudState={cloudState}
              floatingReactions={floatingReactions}
              onSyncAction={onSyncAction}
              onSelectTrack={onSelectTrack}
              onAutoSwitchBackupTrack={onAutoSwitchBackupTrack}
              onPromoteCloudStreamToNative={onPromoteCloudStreamToNative}
              onPrevEpisode={onPrevEpisode}
              onNextEpisode={onNextEpisode}
              onProgressUpdate={onProgressUpdate}
              isCinemaMode={isCinemaMode}
              onToggleCinemaMode={onToggleCinemaMode}
              secondaryStream={secondaryStream}
              onSwapSecondaryStream={onSwapSecondaryStream}
              onToggleSecondaryLayout={onToggleSecondaryLayout}
              onCloseSecondaryStream={onCloseSecondaryStream}
              canControlRoom={canControlRoom}
              isMinimized={isDockedMini}
              isCompressed={isScrollCompressed}
              onExpandCompressed={onExpandCompressed}
              onToggleMinimize={onToggleMinimize}
              onClosePlayer={onClosePlayer}
              onCancelExtraction={onCancelExtraction}
              onOpenSmartTvModal={onOpenSmartTvModal}
              hasConnectedSmartTv={hasConnectedSmartTv}
              onSendTvRemoteCommand={onSendTvRemoteCommand}
              roomCode={roomId}
              roomDisplayName={roomDisplayName}
              participantCount={participants.length}
              participants={participants}
              savedFriends={savedFriends}
              onlineUsers={onlineUsers}
              onOpenFriendsModal={onOpenFriendsModal}
              onSendDirectRoomInvite={onSendDirectRoomInvite}
              messages={messages}
              currentUserId={currentUserId}
              onSendMessage={onSendMessage}
              onSendReaction={onSendReaction}
              onOpenInCloudBrowser={onOpenInCloudBrowser}
              floatingChatOpen={floatingChatOpen}
              unreadChatCount={unreadChatCount}
              onToggleFloatingChat={onToggleFloatingChat}
              voiceChat={voiceChat}
              compactVideoForMobileKeyboard={
                !isDesktopLayout && isMobileKeyboardOpen && activeWorld === 'sala'
              }
              onOpenCatalogSection={onOpenCatalogSection}
              sessionMode={sessionMode}
              onUpgradeSoloToParty={onUpgradeSoloToParty}
              onShareCurrentMedia={handleShareCurrentMedia}
            />
          </React.Suspense>

          {isPlayerActive && !isDockedMini && !isExtracting && secondaryStream && (
            <div className="px-4 py-2 bg-[#0D0D12] border-t border-white/[0.08] flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white break-words">
                📺 2ª Pantalla Activa: {secondaryStream.title}
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSecondaryStream();
                }}
                className="min-h-8 px-3 rounded-full bg-[#7C3AED]/20 border border-[#8B5CF6]/45 text-[11px] font-bold text-[#A78BFA] whitespace-nowrap cursor-pointer hover:bg-[#7C3AED]/35 active:scale-95 transition-all"
              >
                Cerrar 2ª Pantalla
              </button>
            </div>
          )}
        </div>
      </div>

      {lockNoticeToast && (
        <div className="fixed top-17 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-[#0D0D12]/95 backdrop-blur-md border border-white/[0.08] text-zinc-100 text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-fade-in">
          <Lock className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
          <span>{lockNoticeToast}</span>
        </div>
      )}

      {queueAddedNotice && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md px-4 py-2.5 rounded-2xl bg-[#0D0D12]/95 backdrop-blur-xl border border-white/[0.08] text-white text-xs shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <ListVideo className="w-4 h-4 text-[#A78BFA] shrink-0" />
            <span className="font-medium break-words leading-snug">
              {pickLang(lang, {
                es: 'En la cola:',
                ca: 'A la cua:',
                en: 'Queued:',
              })}{' '}
              <strong className="text-white">{queueAddedNotice}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenRoomQueueView}
            className="min-h-10 px-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            {pickLang(lang, {
              es: `Ver Cola (${roomQueueLength})`,
              ca: `Veure Cua (${roomQueueLength})`,
              en: `View Queue (${roomQueueLength})`,
            })}
          </button>
        </div>
      )}

      <CinemaPlaybackDocks
        videoState={effectiveVideoState}
        lang={lang}
        isPlayerClosedLocally={isPlayerClosedLocally}
        isPlayerMinimized={isPlayerMinimized}
        isAutoImmersiveLandscape={isAutoImmersiveLandscape}
        isPlayerActive={isPlayerActive}
        isExtracting={isExtracting}
        extractionError={extractionError}
        activeSportsMatch={activeSportsMatch}
        showLiveMatchDock={showLiveMatchDock}
        activeMatchDetails={activeMatchDetails}
        loadingActiveMatchDetails={loadingActiveMatchDetails}
        loadingItemId={loadingItemId}
        activeMovieContext={activeMovieContext}
        isMoviePlaybackDockVisible={isMoviePlaybackDockVisible}
        isChannelGuideDockVisible={isChannelGuideDockVisible}
        tdtChannels={tdtChannels}
        onSelectTrack={(idx, seekSec) => {
          void onSelectTrack(idx, seekSec || 0);
        }}
        onRefreshMatchDetails={onRefreshMatchDetails}
        onCloseMatchDock={onCloseMatchDock}
        onShowMatchDock={onShowMatchDock}
        onSelectEpisode={onSelectEpisode}
        onSelectMovie={onSelectMovie}
        onSelectChannel={onSelectChannel}
        onReopenPlayer={onReopenPlayer}
        onStopRoomPlayback={onStopRoomPlayback}
        onClearExtractionError={onClearExtractionError}
      />
    </>
  );
};
