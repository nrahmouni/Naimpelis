import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  AppLanguage,
  CloudBrowserState,
  IncomingRoomInvite,
  Participant,
  PollProposalItem,
  RoomQueueItem,
  SecondaryStreamState,
  VideoState,
} from '../types';
import type { StoredProfile } from '../utils/storage';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import type { SessionMode, WorldId } from '../store/useAppStore';
import type { RoomGameInviteType } from '../shared/protocol';
import { pickLang } from '../utils/i18n';
import { playCinemaSound, triggerHaptic } from '../utils/haptics';
import {
  buildShortInviteUrl,
  generateShortRoomCode,
  parseRoomFromWindow,
} from '../utils/shortLink';
import { INITIAL_VIDEO_STATE, normalizeDeepLinkGameType } from '../utils/appSessionHelpers';
import { getLastBackPopHandledAt } from '../lib/backInterceptor';
import { socketService } from '../services/socket';
import { isDedicatedAppPath } from '../shared/dedicatedRoutes';
import { copyTextToClipboard, showAppShareToast } from '../utils/shareDedicatedLink';

interface UseRoomLifecycleActionsParams {
  sessionMode: SessionMode;
  sessionModeRef: MutableRefObject<SessionMode>;
  setSessionMode: (mode: SessionMode) => void;
  setHasEnteredApp: (entered: boolean) => void;
  pendingSoloUpgradeVideoStateRef: MutableRefObject<VideoState | null>;
  getLivePlaybackSec: () => number;
  lang: AppLanguage;
  profile: StoredProfile;
  hostId: string;
  participants: Participant[];
  canChangeMedia: boolean;
  videoState: VideoState;
  roomQueue: RoomQueueItem[];
  inRoomRef: MutableRefObject<boolean>;
  manualLobbyStayRef: MutableRefObject<boolean>;
  queueToastTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setProfile: Dispatch<SetStateAction<StoredProfile>>;
  setShowGuestPopup: Dispatch<SetStateAction<boolean>>;
  setIsPlayerMinimized: Dispatch<SetStateAction<boolean>>;
  setIsPlayerClosedLocally: Dispatch<SetStateAction<boolean>>;
  setSecondaryStream: Dispatch<SetStateAction<SecondaryStreamState | null>>;
  setCatalogSection: Dispatch<SetStateAction<CatalogSection>>;
  setMobileTab: Dispatch<SetStateAction<MobileNavTab>>;
  setActiveWorld: (w: WorldId) => void;
  setForcedOpenGame: Dispatch<
    SetStateAction<{ gameType: RoomGameInviteType; seq: number } | null>
  >;
  setIsInActiveGame: Dispatch<SetStateAction<boolean>>;
  setWorldSearchQuery: Dispatch<SetStateAction<string>>;
  setAvatarMenuOpen: Dispatch<SetStateAction<boolean>>;
  setRoomId: Dispatch<SetStateAction<string>>;
  setRoomName: Dispatch<SetStateAction<string>>;
  setInRoom: Dispatch<SetStateAction<boolean>>;
  setIntroWithSound: Dispatch<SetStateAction<boolean>>;
  setShowIntro: Dispatch<SetStateAction<boolean>>;
  setIsTvPairLobby: Dispatch<SetStateAction<boolean>>;
  setIsTvMode: Dispatch<SetStateAction<boolean>>;
  setTvAuthToken: Dispatch<SetStateAction<string>>;
  setPinPromptState: Dispatch<
    SetStateAction<{ open: boolean; roomName: string; invalidAttempt: boolean }>
  >;
  setCinemaModePersist: (next: boolean) => void;
  setActivePoll: Dispatch<SetStateAction<any>>;
  setRoomGameState: Dispatch<SetStateAction<any>>;
  setPartyGameState: Dispatch<SetStateAction<any>>;
  setPinnedMessage: Dispatch<SetStateAction<any>>;
  setGameMoveError: Dispatch<SetStateAction<string | null>>;
  setHostId: Dispatch<SetStateAction<string>>;
  setCreatorId: Dispatch<SetStateAction<string>>;
  setHostOnlyControl: Dispatch<SetStateAction<boolean>>;
  setRoomHasPin: Dispatch<SetStateAction<boolean>>;
  setVideoState: Dispatch<SetStateAction<VideoState>>;
  setCloudFrame: Dispatch<SetStateAction<string | null>>;
  setCloudState: Dispatch<SetStateAction<CloudBrowserState | null>>;
  setIsFloatingRoomOpen: (open: boolean) => void;
  setQueueAddedNotice: Dispatch<SetStateAction<string | null>>;
  setOpenQueueTrigger: Dispatch<SetStateAction<number>>;
  setExtractionError: Dispatch<SetStateAction<string | null>>;
  setIncomingInvite: Dispatch<SetStateAction<IncomingRoomInvite | null>>;
  setFriendsModalOpen: Dispatch<SetStateAction<boolean>>;
  clearExtractionSnapshot: () => void;
  enterWorld: (w: WorldId) => void;
  showHostLockNotice: (hostDisplayName?: string, reason?: string) => void;
  scrollDesktopToPlayer: () => void;
  handleSyncPlayerAction: (type: any, patch: any) => void;
}

export function useRoomLifecycleActions(p: UseRoomLifecycleActionsParams) {
  const handleEnterRoom = (
    targetRoomId: string,
    nextProfile: StoredProfile,
    customName?: string
  ) => {
    p.manualLobbyStayRef.current = false;
    const isCustom = nextProfile.isCustomized !== false;
    const finalProfile: StoredProfile = { ...nextProfile, isCustomized: isCustom };
    import('../utils/storage').then(({ saveStoredProfile }) =>
      saveStoredProfile(finalProfile, isCustom)
    );
    p.setProfile(finalProfile);
    import('../services/userCloudSync').then(({ updateCloudUserProfile }) =>
      updateCloudUserProfile(finalProfile).catch(() => {})
    );
    p.setShowGuestPopup(false);
    p.setIsPlayerMinimized(false);
    p.setIsPlayerClosedLocally(false);
    p.setSecondaryStream(null);
    const deepLinkGame =
      typeof window !== 'undefined'
        ? normalizeDeepLinkGameType(parseRoomFromWindow().gameType)
        : null;
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/') {
        window.history.pushState(
          { naimInRoom: true },
          '',
          `/${encodeURIComponent(targetRoomId)}`
        );
      } else if (deepLinkGame) {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('game')) {
            url.searchParams.delete('game');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
          }
        } catch {
          // ignore
        }
      }
    }
    if (deepLinkGame) {
      p.setCatalogSection('games');
      p.setMobileTab('games');
      p.setActiveWorld('juegos');
      p.setForcedOpenGame({ gameType: deepLinkGame, seq: Date.now() });
      p.setIsInActiveGame(true);
    } else {
      p.setCatalogSection('home');
      p.setMobileTab('home');
      p.setActiveWorld('entry');
      p.setIsInActiveGame(false);
    }
    p.setWorldSearchQuery('');
    p.setAvatarMenuOpen(false);
    p.setSessionMode('party');
    p.setHasEnteredApp(true);
    p.setRoomId(targetRoomId);
    p.setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    p.setInRoom(true);
    p.setIntroWithSound(true);
    p.setShowIntro(true);
  };

  const handleEnterSolo = useCallback(
    (nextProfile?: StoredProfile) => {
      triggerHaptic('medium');
      p.manualLobbyStayRef.current = false;
      p.pendingSoloUpgradeVideoStateRef.current = null;
      if (nextProfile) {
        const isCustom = nextProfile.isCustomized !== false;
        const finalProfile: StoredProfile = { ...nextProfile, isCustomized: isCustom };
        import('../utils/storage').then(({ saveStoredProfile }) =>
          saveStoredProfile(finalProfile, isCustom)
        );
        p.setProfile(finalProfile);
        import('../services/userCloudSync').then(({ updateCloudUserProfile }) =>
          updateCloudUserProfile(finalProfile).catch(() => {})
        );
      }
      socketService.disconnect();
      p.setShowGuestPopup(false);
      p.setIsPlayerMinimized(false);
      p.setIsPlayerClosedLocally(false);
      p.setSecondaryStream(null);
      p.setAvatarMenuOpen(false);
      p.setIsFloatingRoomOpen(false);
      p.setRoomId('');
      p.setRoomName('');
      p.setInRoom(false);
      p.setSessionMode('solo');
      p.setHasEnteredApp(true);
      p.setActiveWorld('entry');
      p.setCatalogSection('home');
      p.setMobileTab('home');
      p.setIsInActiveGame(false);
      p.setWorldSearchQuery('');
      if (typeof window !== 'undefined' && isDedicatedAppPath(window.location.pathname) === false) {
        window.history.replaceState({}, '', '/');
      }
      playCinemaSound('join');
    },
    [p]
  );

  const upgradeSoloToPartyRoom = useCallback(
    (opts?: { keepDedicatedUrl?: boolean; targetWorld?: WorldId; customRoomName?: string }) => {
      triggerHaptic('success');
      playCinemaSound('join');
      const freshCode = generateShortRoomCode(4);
      const firstName = p.profile.name?.split(' ')[0] || 'Cine';
      const customTitle = opts?.customRoomName?.trim() || `Sala de ${firstName}`;

      if (p.videoState.mode !== 'idle' && p.videoState.url) {
        const liveSec = p.videoState.isLive
          ? 0
          : Math.max(p.videoState.currentTime || 0, p.getLivePlaybackSec());
        p.pendingSoloUpgradeVideoStateRef.current = {
          ...p.videoState,
          currentTime: liveSec,
          lastUpdated: Date.now(),
          updatedBy: p.profile.name,
        };
      } else {
        p.pendingSoloUpgradeVideoStateRef.current = null;
      }

      p.manualLobbyStayRef.current = false;
      p.setShowGuestPopup(false);
      p.setSessionMode('party');
      p.setHasEnteredApp(true);
      p.setRoomId(freshCode);
      p.setRoomName(customTitle);
      p.setInRoom(true);

      if (opts?.targetWorld) {
        p.enterWorld(opts.targetWorld);
      }

      let inviteUrl = buildShortInviteUrl(freshCode);
      if (typeof window !== 'undefined') {
        const currentPathname = window.location.pathname;
        if (opts?.keepDedicatedUrl || isDedicatedAppPath(currentPathname)) {
          try {
            const u = new URL(window.location.href);
            u.searchParams.set('room', freshCode);
            window.history.replaceState({}, '', `${u.pathname}${u.search}${u.hash}`);
            const publicOrigin = buildShortInviteUrl(freshCode).replace(/\/[^/]+$/, '');
            inviteUrl = `${publicOrigin}${u.pathname}${u.search}`;
          } catch {
            // fallback to short invite URL
          }
        }
      }

      void copyTextToClipboard(inviteUrl);
      showAppShareToast(
        pickLang(p.lang, {
          es: `Sala ${freshCode.toUpperCase()} creada · Enlace de invitación copiado`,
          ca: `Sala ${freshCode.toUpperCase()} creada · Enllaç d’invitació copiat`,
          en: `Room ${freshCode.toUpperCase()} created · Invite link copied`,
        })
      );

      return freshCode;
    },
    [p]
  );

  const resetRoomUiState = useCallback(() => {
    p.setIsTvPairLobby(false);
    p.setIsTvMode(false);
    p.setTvAuthToken('');
    p.setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
    p.setIsPlayerMinimized(false);
    p.setIsPlayerClosedLocally(false);
    p.setCinemaModePersist(false);
    p.setSecondaryStream(null);
    p.setActivePoll(null);
    p.setRoomGameState(null);
    p.setPartyGameState(null);
    p.setPinnedMessage(null);
    p.setGameMoveError(null);
    p.setHostId('');
    p.setCreatorId('');
    p.setHostOnlyControl(true);
    p.setRoomHasPin(false);
    p.setVideoState(INITIAL_VIDEO_STATE);
    p.setCloudFrame(null);
    p.setCloudState(null);
  }, [p]);

  const handleSwitchActiveRoom = (targetRoomId: string, customName?: string) => {
    p.manualLobbyStayRef.current = false;
    p.pendingSoloUpgradeVideoStateRef.current = null;
    p.clearExtractionSnapshot();
    resetRoomUiState();
    p.setCatalogSection('home');
    p.setMobileTab('home');
    p.setActiveWorld('entry');
    p.setIsInActiveGame(false);
    p.setWorldSearchQuery('');
    p.setAvatarMenuOpen(false);
    p.setSessionMode('party');
    p.setHasEnteredApp(true);
    p.setRoomId(targetRoomId);
    p.setRoomName(customName || `Sala ${targetRoomId.toUpperCase()}`);
    p.setInRoom(true);
  };

  const handleCreateFreshRoom = (customRoomName?: string) => {
    triggerHaptic('success');
    const freshCode = generateShortRoomCode(4);
    const firstName = p.profile.name?.split(' ')[0] || 'Cine';
    const trimmed = typeof customRoomName === 'string' ? customRoomName.trim() : '';
    handleSwitchActiveRoom(freshCode, trimmed || `Sala de ${firstName}`);
  };

  const handleLeaveRoom = () => {
    triggerHaptic('light');
    p.clearExtractionSnapshot();
    p.pendingSoloUpgradeVideoStateRef.current = null;
    p.manualLobbyStayRef.current = true;
    socketService.disconnect();
    p.setInRoom(false);
    p.setHasEnteredApp(false);
    p.setActiveWorld('entry');
    p.setIsInActiveGame(false);
    p.setWorldSearchQuery('');
    p.setAvatarMenuOpen(false);
    p.setIsFloatingRoomOpen(false);
    p.setShowGuestPopup(false);
    resetRoomUiState();
    p.setRoomId('');
    p.setRoomName('');
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
  };

  useEffect(() => {
    const onPopState = () => {
      if (Date.now() - getLastBackPopHandledAt() < 120) return;
      const parsed = parseRoomFromWindow();
      if (!parsed.roomId && !parsed.isTvPairLobby && p.inRoomRef.current) {
        p.manualLobbyStayRef.current = true;
        socketService.disconnect();
        p.setInRoom(false);
        p.setShowGuestPopup(false);
        if (parsed.isDedicatedEntry) {
          p.setSessionMode('solo');
          p.setHasEnteredApp(true);
        } else {
          resetRoomUiState();
        }
        p.setRoomId('');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [resetRoomUiState, p]);

  const handleAddToQueue = (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => {
    const newItem: RoomQueueItem = {
      ...item,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      addedBy: p.profile.name,
    };
    socketService.addToQueue(newItem);
    if (p.queueToastTimerRef.current) clearTimeout(p.queueToastTimerRef.current);
    p.setQueueAddedNotice(item.title);
    p.queueToastTimerRef.current = setTimeout(() => p.setQueueAddedNotice(null), 3600);
  };

  const handleOpenRoomQueueView = () => {
    p.setQueueAddedNotice(null);
    p.enterWorld('sala');
    p.setOpenQueueTrigger((n) => n + 1);
  };

  const handleStartPollFromQueue = () => {
    if (p.roomQueue.length < 2) return;
    if (!p.canChangeMedia) {
      p.showHostLockNotice(p.participants.find((part) => part.id === p.hostId)?.name);
      return;
    }
    triggerHaptic('success');
    const proposals: PollProposalItem[] = p.roomQueue
      .slice(0, 4)
      .map(({ id: _id, addedBy: _addedBy, ...proposal }) => proposal);
    socketService.startPoll(
      pickLang(p.lang, {
        es: '¿Qué vemos ahora en la sala?',
        ca: 'Què veiem ara a la sala?',
        en: 'What should we watch next?',
      }),
      proposals,
      25
    );
    p.enterWorld('sala');
  };

  const handleRemoteTogglePlay = () => {
    if (p.videoState.mode === 'idle') return;
    const nextPlaying = !p.videoState.isPlaying;
    p.handleSyncPlayerAction(nextPlaying ? 'play' : 'pause', { isPlaying: nextPlaying });
  };

  const handleRemoteSeekDelta = (deltaSec: number) => {
    if (p.videoState.mode === 'idle' || p.videoState.isLive) return;
    const targetSec = Math.max(0, (p.videoState.currentTime || 0) + deltaSec);
    p.handleSyncPlayerAction('seek', { currentTime: targetSec });
  };

  const handleOpenCloudBrowser = (url: string) => {
    if (!p.canChangeMedia) {
      p.showHostLockNotice(p.participants.find((part) => part.id === p.hostId)?.name);
      return;
    }
    p.scrollDesktopToPlayer();
    p.setExtractionError(null);
    socketService.startCloudBrowser(url, p.profile.name);
  };

  const handleAcceptIncomingRoomInvite = (invite: IncomingRoomInvite) => {
    triggerHaptic('success');
    playCinemaSound('join');
    p.setIncomingInvite(null);
    p.setFriendsModalOpen(false);
    p.manualLobbyStayRef.current = false;
    resetRoomUiState();
    p.setTvAuthToken(invite.inviteAuthToken || '');
    p.setCatalogSection('home');
    p.setMobileTab('home');
    p.setActiveWorld('entry');
    p.setIsInActiveGame(false);
    p.setWorldSearchQuery('');
    p.setSessionMode('party');
    p.setHasEnteredApp(true);
    p.setRoomId(invite.roomId);
    p.setRoomName(invite.roomName || `Sala ${invite.roomId.toUpperCase()}`);
    p.setInRoom(true);
  };

  const handleSwitchThisDeviceToTvLobby = () => {
    socketService.disconnect();
    if (typeof window !== 'undefined') {
      window.location.href = '/tv';
      return;
    }
    p.setInRoom(false);
    p.setIsTvMode(false);
    p.setTvAuthToken('');
    p.setIsTvPairLobby(true);
  };

  return {
    handleEnterRoom,
    handleEnterSolo,
    upgradeSoloToPartyRoom,
    resetRoomUiState,
    handleSwitchActiveRoom,
    handleCreateFreshRoom,
    handleLeaveRoom,
    handleAddToQueue,
    handleOpenRoomQueueView,
    handleStartPollFromQueue,
    handleRemoteTogglePlay,
    handleRemoteSeekDelta,
    handleOpenCloudBrowser,
    handleAcceptIncomingRoomInvite,
    handleSwitchThisDeviceToTvLobby,
  };
}
