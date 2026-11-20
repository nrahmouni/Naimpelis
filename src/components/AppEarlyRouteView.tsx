import React from 'react';
import { MotionConfig } from 'motion/react';
import type { User } from 'firebase/auth';
import type {
  AppLanguage,
  CloudBrowserState,
  FloatingReaction,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  LanguageNoticePopup,
  Participant,
  SavedFriend,
  VideoState,
} from '../types';
import type { RecentRoomEntry, StoredProfile } from '../utils/storage';
import type { EffectiveViewMode } from './MobileViewportGuard';
import { PreviewAutoEscapeBanner } from './player/PreviewAutoEscapeBanner';
import { GlobalIncomingInviteBanner } from './FriendsInviteModal';
import { NaimcineIntro } from './NaimcineIntro';
import { LobbyScreen } from './LobbyScreen';
import { RoomPinPromptModal } from './RoomPinPromptModal';
import { socketService } from '../services/socket';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const TvReceiverPairingScreen = lazyWithRetry(() =>
  import('./TvReceiverPairingScreen').then((m) => ({
    default: m.TvReceiverPairingScreen,
  }))
);
const NaimCineAdsPage = lazyWithRetry(() =>
  import('./NaimCineAdsPage').then((m) => ({ default: m.NaimCineAdsPage }))
);
const DesignSystemShowcase = lazyWithRetry(() =>
  import('./DesignSystemShowcase').then((m) => ({
    default: m.DesignSystemShowcase,
  }))
);
const NativeCinemaPlayer = lazyWithRetry(() =>
  import('./NativeCinemaPlayer').then((m) => ({ default: m.NativeCinemaPlayer }))
);

interface AppEarlyRouteViewProps {
  showDesignSystem: boolean;
  isAdsPageOpen: boolean;
  isTvPairLobby: boolean;
  inRoom: boolean;
  hasEnteredApp: boolean;
  isTvMode: boolean;
  reducedMotion: boolean;
  lang: AppLanguage;
  roomId: string;
  roomName: string;
  profile: StoredProfile;
  recentRooms: RecentRoomEntry[];
  effectiveView: EffectiveViewMode;
  isFramedMobileOnPc: boolean;
  authUser: User | null;
  authLoading: boolean;
  showIntro: boolean;
  introWithSound: boolean;
  incomingInvite: IncomingRoomInvite | null;
  friendAddedNotice: IncomingFriendAddedNotice | null;
  savedFriends: SavedFriend[];
  pinPromptState: { open: boolean; roomName: string; invalidAttempt: boolean };
  videoState: VideoState;
  currentUser: Participant;
  isExtracting: boolean;
  extractionLabel: string;
  extractionError: string | null;
  languageNotice: LanguageNoticePopup | null;
  cloudFrame: string | null;
  cloudState: CloudBrowserState | null;
  floatingReactions: FloatingReaction[];
  participantCount: number;
  setShowDesignSystem: (open: boolean) => void;
  setIsAdsPageOpen: (open: boolean) => void;
  setIsTvPairLobby: (open: boolean) => void;
  setIsTvMode: (open: boolean) => void;
  setTvAuthToken: (token: string) => void;
  setRoomId: (id: string) => void;
  setRoomName: (name: string) => void;
  setInRoom: (inRoom: boolean) => void;
  setShowIntro: (show: boolean) => void;
  setIntroWithSound: (withSound: boolean) => void;
  setIncomingInvite: (inv: IncomingRoomInvite | null) => void;
  setFriendAddedNotice: (notice: IncomingFriendAddedNotice | null) => void;
  setLanguageNotice: (notice: LanguageNoticePopup | null) => void;
  clearManualLobbyStay: () => void;
  clearFriendNoticeTimer: () => void;
  toggleViewMode: () => void;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onChangeLang: (l: AppLanguage) => void;
  onEnterSolo: (nextProfile: StoredProfile) => void;
  onEnterRoom: (targetRoomId: string, nextProfile: StoredProfile, customName?: string) => void;
  onAcceptIncomingRoomInvite: (invite: IncomingRoomInvite) => void;
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
  onSubmitGuestPin: (pin: string) => void;
  onLeaveRoom: () => void;
  onCancelMediaExtraction: () => void;
  onSyncPlayerAction: (type: any, patch: any) => void;
  onSelectTrack: (trackIndex: number, seekSec?: number) => void;
  onPromoteCloudStreamToNative: (rawUrl: string) => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
}

export const AppEarlyRouteView: React.FC<AppEarlyRouteViewProps> = ({
  showDesignSystem,
  isAdsPageOpen,
  isTvPairLobby,
  inRoom,
  hasEnteredApp,
  isTvMode,
  reducedMotion,
  lang,
  roomId,
  roomName,
  profile,
  recentRooms,
  effectiveView,
  isFramedMobileOnPc,
  authUser,
  authLoading,
  showIntro,
  introWithSound,
  incomingInvite,
  friendAddedNotice,
  savedFriends,
  pinPromptState,
  videoState,
  currentUser,
  isExtracting,
  extractionLabel,
  extractionError,
  languageNotice,
  cloudFrame,
  cloudState,
  floatingReactions,
  participantCount,
  setShowDesignSystem,
  setIsAdsPageOpen,
  setIsTvPairLobby,
  setIsTvMode,
  setTvAuthToken,
  setRoomId,
  setRoomName,
  setInRoom,
  setShowIntro,
  setIntroWithSound,
  setIncomingInvite,
  setFriendAddedNotice,
  setLanguageNotice,
  clearManualLobbyStay,
  clearFriendNoticeTimer,
  toggleViewMode,
  onGoogleSignIn,
  onGoogleSignOut,
  onChangeLang,
  onEnterSolo,
  onEnterRoom,
  onAcceptIncomingRoomInvite,
  onAddFriend,
  onSubmitGuestPin,
  onLeaveRoom,
  onCancelMediaExtraction,
  onSyncPlayerAction,
  onSelectTrack,
  onPromoteCloudStreamToNative,
  onPrevEpisode,
  onNextEpisode,
}) => {
  if (showDesignSystem) {
    return (
      <React.Suspense fallback={null}>
        <DesignSystemShowcase
          onClose={() => {
            setShowDesignSystem(false);
            if (
              typeof window !== 'undefined' &&
              window.location.pathname.toLowerCase().includes('/design-system')
            ) {
              window.history.replaceState({}, '', inRoom && roomId ? `/${roomId}` : '/');
            }
          }}
        />
      </React.Suspense>
    );
  }

  if (isAdsPageOpen) {
    return (
      <React.Suspense fallback={null}>
        <NaimCineAdsPage
          onBack={() => {
            setIsAdsPageOpen(false);
            if (
              typeof window !== 'undefined' &&
              (/^\/(ads|naimcine-ads)\b/i.test(window.location.pathname) ||
                window.location.search.includes('ads=1'))
            ) {
              window.history.replaceState({}, '', inRoom && roomId ? `/${roomId}` : '/');
            }
          }}
        />
      </React.Suspense>
    );
  }

  if (isTvPairLobby) {
    return (
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
        <React.Suspense fallback={null}>
          <TvReceiverPairingScreen
            lang={lang}
            onPaired={({ roomId: pairedCode, roomName: pairedTitle, tvAuthToken: token }) => {
              clearManualLobbyStay();
              setTvAuthToken(token);
              setIsTvPairLobby(false);
              setIsTvMode(true);
              setRoomId(pairedCode);
              setRoomName(pairedTitle || `Sala ${pairedCode.toUpperCase()}`);
              setInRoom(true);
            }}
            onExitTvLobby={() => {
              setIsTvPairLobby(false);
              if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
            }}
          />
        </React.Suspense>
      </MotionConfig>
    );
  }

  if (!inRoom && !hasEnteredApp) {
    return (
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
        <PreviewAutoEscapeBanner variant="floating" />
        {showIntro && (
          <NaimcineIntro
            withSound={introWithSound}
            lang={lang}
            onComplete={() => setShowIntro(false)}
          />
        )}
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
          onAcceptInvite={onAcceptIncomingRoomInvite}
          onDismissInvite={() => setIncomingInvite(null)}
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
            setFriendAddedNotice(null);
          }}
          onDismissFriendNotice={() => {
            clearFriendNoticeTimer();
            setFriendAddedNotice(null);
          }}
        />
        <LobbyScreen
          initialProfile={profile}
          recentRooms={recentRooms}
          lang={lang}
          effectiveView={effectiveView}
          isFramedMobileOnPc={isFramedMobileOnPc}
          onToggleViewMode={toggleViewMode}
          authUser={authUser}
          authLoading={authLoading}
          onSignIn={onGoogleSignIn}
          onSignOut={onGoogleSignOut}
          onChangeLang={onChangeLang}
          onReplayIntro={() => {
            setIntroWithSound(true);
            setShowIntro(true);
          }}
          onEnterSolo={onEnterSolo}
          onEnterRoom={onEnterRoom}
          onOpenTvPairLobby={() => {
            if (typeof window !== 'undefined') window.location.href = '/tv';
            else setIsTvPairLobby(true);
          }}
          onOpenAdsPage={() => {
            setIsAdsPageOpen(true);
            if (typeof window !== 'undefined') window.history.pushState({}, '', '/ads');
          }}
        />
      </MotionConfig>
    );
  }

  if (isTvMode) {
    return (
      <div className="w-full h-[100dvh] bg-[#0B0B0F] overflow-hidden">
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
          <NativeCinemaPlayer
            videoState={videoState}
            lang={lang}
            userName={currentUser.name}
            isExtracting={isExtracting}
            extractionLabel={extractionLabel}
            extractionError={extractionError}
            onCancelExtraction={onCancelMediaExtraction}
            languageNotice={languageNotice}
            onDismissLanguageNotice={() => setLanguageNotice(null)}
            cloudFrame={cloudFrame}
            cloudState={cloudState}
            floatingReactions={floatingReactions}
            onSyncAction={onSyncPlayerAction}
            onSelectTrack={onSelectTrack}
            onPromoteCloudStreamToNative={onPromoteCloudStreamToNative}
            onPrevEpisode={onPrevEpisode}
            onNextEpisode={onNextEpisode}
            roomCode={roomId}
            roomDisplayName={roomName || `Sala ${roomId.toUpperCase()}`}
            participantCount={participantCount}
            onExitTvMode={() => {
              socketService.disconnect();
              setInRoom(false);
              setIsTvMode(false);
              setTvAuthToken('');
              setIsTvPairLobby(true);
              if (typeof window !== 'undefined') window.history.replaceState({}, '', '/tv');
            }}
            isTvMode
          />
        </React.Suspense>
      </div>
    );
  }

  return null;
};
