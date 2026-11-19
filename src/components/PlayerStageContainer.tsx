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
import { CinemaPlaybackDocks } from './player/CinemaPlaybackDocks';

const NativeCinemaPlayer = React.lazy(() =>
  import('./NativeCinemaPlayer').then((m) => ({ default: m.NativeCinemaPlayer }))
);

interface PlayerStageContainerProps {
  lang: AppLanguage;
  userName: string;
  currentUserId: string;
  roomId: string;
  roomDisplayName: string;
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
                      ? 'sticky top-0 z-30 block w-full max-w-none px-3 pt-1.5 pb-1.5 bg-[#0B0B0E]/95 backdrop-blur-md border-b border-white/[0.08] transition-all duration-200'
                      : 'sticky top-0 z-30 block w-full max-w-none px-2 pt-2 sm:px-4 sm:pt-2 bg-[#0B0B0E] transition-all duration-200'
                    : isAutoImmersiveLandscape
                    ? 'block h-full flex-1 bg-black'
                    : isScrollCompressed
                    ? 'block bg-[#0B0B0E]/95 border-b border-white/[0.08] transition-all duration-200'
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
            />
          </React.Suspense>

          {isPlayerActive && !isDockedMini && !isExtracting && secondaryStream && (
            <div className="px-3 py-1.5 bg-[#18181B] border-t border-white/[0.08] flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#EFEFF1] truncate">
                📺 2ª Pantalla Activa: {secondaryStream.title}
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSecondaryStream();
                }}
                className="min-h-7 px-2.5 rounded-full bg-[#9146FF]/20 border border-[#9146FF]/45 text-[11px] font-bold text-[#BF94FF] whitespace-nowrap cursor-pointer hover:bg-[#9146FF]/35 transition-colors"
              >
                Cerrar 2ª Pantalla
              </button>
            </div>
          )}
        </div>
      </div>

      {lockNoticeToast && (
        <div className="fixed top-17 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-[#18181B]/95 backdrop-blur-md border border-white/15 text-zinc-100 text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-fade-in">
          <Lock className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
          <span>{lockNoticeToast}</span>
        </div>
      )}

      {queueAddedNotice && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md px-3.5 py-2.5 rounded-2xl bg-[#18181B]/95 backdrop-blur-xl border border-white/15 text-white text-xs shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-between gap-2.5 animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <ListVideo className="w-4 h-4 text-[#BF94FF] shrink-0" />
            <span className="truncate font-medium">
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
            className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
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
