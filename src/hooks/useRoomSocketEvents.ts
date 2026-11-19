import React, { useEffect } from 'react';
import { socketService } from '../services/socket';
import { playCinemaSound, triggerHaptic } from '../utils/haptics';
import { addRecentRoom, getRecentRooms, type StoredProfile } from '../utils/storage';
import { dispatchRoomSocketEvent } from './roomSocketMessageDispatcher';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type { SessionMode } from '../store/useAppStore';
import { isDedicatedAppPath } from '../shared/dedicatedRoutes';
import type {
  AppLanguage,
  BlackjackGameState,
  BoardGameState,
  ChatMessage,
  CloudBrowserState,
  CloudSavedRoom,
  FloatingReaction,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  OnlineAppUser,
  Participant,
  PartyGameState,
  PinturilloGameState,
  PokerGameState,
  PollProposalItem,
  Pool8BallState,
  RestoredRoomBlueprint,
  RoomPollState,
  RoomQueueItem,
  VideoState,
} from '../types';
import type { RoomGameInvite, RoomGameInviteType, RoomMatchResponsesState } from '../shared/protocol';

interface UseRoomSocketEventsOptions {
  sessionMode: SessionMode;
  hasAuthUser: boolean;
  inRoom: boolean;
  roomId: string;
  roomName: string;
  isTvMode: boolean;
  isTvPairLobby: boolean;
  tvAuthToken: string;
  isKidsRouteMode: boolean;
  lang: AppLanguage;
  profile: StoredProfile;
  mobileTabRef: React.MutableRefObject<MobileNavTab>;
  hostIdRef: React.MutableRefObject<string>;
  roomQueueRef: React.MutableRefObject<RoomQueueItem[]>;
  videoStateUrlRef: React.MutableRefObject<string>;
  savedRoomsRef: React.MutableRefObject<CloudSavedRoom[]>;
  sessionPinMapRef: React.MutableRefObject<Record<string, string>>;
  isExtractingRef: React.MutableRefObject<boolean>;
  activeHubGameRef: React.MutableRefObject<RoomGameInviteType | null>;
  catalogSectionRef: React.MutableRefObject<CatalogSection>;
  handlePlayQueueItemRef: React.MutableRefObject<(item: RoomQueueItem) => void>;
  inviteFeedbackTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  friendNoticeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  seenFriendNoticeBySenderRef: React.MutableRefObject<Map<string, number>>;
  tvClaimTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pendingSoloUpgradeVideoStateRef: React.MutableRefObject<VideoState | null>;
  recordStateInWatchHistory: (vState: VideoState) => void;
  rememberSessionPin: (targetCode: string, pinCode: string) => void;
  showHostLockNotice: (hostDisplayName?: string, reason?: string) => void;
  setTypingUser: (userId: string, userName: string, isTyping: boolean) => void;
  pushNotification: (n: {
    category: 'invite' | 'system' | 'football' | 'series' | 'update';
    title: string;
    body: string;
    roomId?: string;
    actionLabel?: string;
  }) => void;
  setOnlineUsers: React.Dispatch<React.SetStateAction<OnlineAppUser[]>>;
  setIncomingInvite: React.Dispatch<React.SetStateAction<IncomingRoomInvite | null>>;
  setFriendAddedNotice: React.Dispatch<React.SetStateAction<IncomingFriendAddedNotice | null>>;
  setInviteSentFeedback: React.Dispatch<React.SetStateAction<string | null>>;
  setRoomName: React.Dispatch<React.SetStateAction<string>>;
  setHostId: React.Dispatch<React.SetStateAction<string>>;
  setCreatorId: React.Dispatch<React.SetStateAction<string>>;
  setHostOnlyControl: React.Dispatch<React.SetStateAction<boolean>>;
  setRoomHasPin: React.Dispatch<React.SetStateAction<boolean>>;
  setPinPromptState: React.Dispatch<
    React.SetStateAction<{ open: boolean; roomName: string; invalidAttempt: boolean }>
  >;
  setActivePoll: React.Dispatch<React.SetStateAction<RoomPollState | null>>;
  setRoomGameState: React.Dispatch<React.SetStateAction<BoardGameState | null>>;
  setPartyGameState: React.Dispatch<React.SetStateAction<PartyGameState | null>>;
  setPinturilloState: React.Dispatch<React.SetStateAction<PinturilloGameState | null>>;
  setPoolGameState: React.Dispatch<React.SetStateAction<Pool8BallState | null>>;
  setChapasGameState: React.Dispatch<React.SetStateAction<FutbolChapasState | null>>;
  setHeadSoccerGameState: React.Dispatch<React.SetStateAction<HeadSoccerOnlineState | null>>;
  setHeadSoccerPeerInput: React.Dispatch<
    React.SetStateAction<{ side: 0 | 1; input: HeadSoccerInput; seq: number } | null>
  >;
  setHeadSoccerSyncSnapshot: React.Dispatch<
    React.SetStateAction<{ seq: number; sim: HeadSoccerSimulation } | null>
  >;
  setPokerGameState: React.Dispatch<React.SetStateAction<PokerGameState | null>>;
  setBlackjackGameState: React.Dispatch<React.SetStateAction<BlackjackGameState | null>>;
  setMatchResponses: React.Dispatch<React.SetStateAction<RoomMatchResponsesState | null>>;
  setGameMoveError: React.Dispatch<React.SetStateAction<string | null>>;
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setPinnedMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
  setRoomQueue: React.Dispatch<React.SetStateAction<RoomQueueItem[]>>;
  setRecentRooms: React.Dispatch<React.SetStateAction<ReturnType<typeof getRecentRooms>>>;
  setVideoState: React.Dispatch<React.SetStateAction<VideoState>>;
  setIsPlayerClosedLocally: React.Dispatch<React.SetStateAction<boolean>>;
  setCloudFrame: React.Dispatch<React.SetStateAction<string | null>>;
  setCloudState: React.Dispatch<React.SetStateAction<CloudBrowserState | null>>;
  setUnreadChatCount: React.Dispatch<React.SetStateAction<number>>;
  setFloatingReactions: React.Dispatch<React.SetStateAction<FloatingReaction[]>>;
  setTvClaimStatus: React.Dispatch<
    React.SetStateAction<{ type: 'success' | 'error'; message: string } | null>
  >;
  setIncomingGameInvite: React.Dispatch<React.SetStateAction<RoomGameInvite | null>>;
  setForcedOpenGame: React.Dispatch<
    React.SetStateAction<{ gameType: RoomGameInviteType; seq: number } | null>
  >;
}

export function useRoomSocketEvents(opts: UseRoomSocketEventsOptions) {
  const {
    sessionMode,
    hasAuthUser,
    inRoom,
    roomId,
    roomName,
    isTvMode,
    isTvPairLobby,
    tvAuthToken,
    isKidsRouteMode,
    lang,
    profile,
    mobileTabRef,
    hostIdRef,
    roomQueueRef,
    videoStateUrlRef,
    savedRoomsRef,
    sessionPinMapRef,
    isExtractingRef,
    activeHubGameRef,
    catalogSectionRef,
    handlePlayQueueItemRef,
    inviteFeedbackTimerRef,
    friendNoticeTimerRef,
    seenFriendNoticeBySenderRef,
    tvClaimTimerRef,
    pendingSoloUpgradeVideoStateRef,
    recordStateInWatchHistory,
    rememberSessionPin,
    showHostLockNotice,
    setTypingUser,
    pushNotification,
    setOnlineUsers,
    setIncomingInvite,
    setFriendAddedNotice,
    setInviteSentFeedback,
    setRoomName,
    setHostId,
    setCreatorId,
    setHostOnlyControl,
    setRoomHasPin,
    setPinPromptState,
    setActivePoll,
    setRoomGameState,
    setPartyGameState,
    setPinturilloState,
    setPoolGameState,
    setChapasGameState,
    setHeadSoccerGameState,
    setHeadSoccerPeerInput,
    setHeadSoccerSyncSnapshot,
    setPokerGameState,
    setBlackjackGameState,
    setMatchResponses,
    setGameMoveError,
    setParticipants,
    setMessages,
    setPinnedMessage,
    setRoomQueue,
    setRecentRooms,
    setVideoState,
    setIsPlayerClosedLocally,
    setCloudFrame,
    setCloudState,
    setUnreadChatCount,
    setFloatingReactions,
    setTvClaimStatus,
    setIncomingGameInvite,
    setForcedOpenGame,
  } = opts;

  // Keep presence connected on LobbyScreen or when authenticated in Solo mode so friends can still invite us
  useEffect(() => {
    if (isTvPairLobby) return;
    if (inRoom && sessionMode !== 'solo') return;
    if (sessionMode === 'solo' && !hasAuthUser) return;
    socketService.connectPresenceOnly({
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar || '🎬',
      color: profile.color || '#9146FF',
      isHost: false,
      joinedAt: Date.now(),
    });
  }, [
    inRoom,
    sessionMode,
    hasAuthUser,
    isTvPairLobby,
    profile.id,
    profile.name,
    profile.avatar,
    profile.color,
  ]);

  // Global listener for online users, incoming room invitations, and friend-added notices
  useEffect(() => {
    const unsubGlobal = socketService.subscribe((event) => {
      const { type, payload } = event;
      if (type === 'ONLINE_USERS_UPDATED') {
        if (Array.isArray(payload?.users)) {
          setOnlineUsers(payload.users as OnlineAppUser[]);
        }
      } else if (type === 'INCOMING_ROOM_INVITE') {
        if (payload?.roomId && payload?.fromUserId !== profile.id) {
          playCinemaSound('join');
          triggerHaptic('medium');
          const inv = payload as unknown as IncomingRoomInvite;
          setIncomingInvite(inv);
          pushNotification({
            category: 'invite',
            title: `Invitación de ${inv.fromUserName || 'un amigo'}`,
            body: `Únete a ${inv.roomName || `Sala ${inv.roomId}`}${
              payload.activeMediaTitle ? ` · Viendo ${String(payload.activeMediaTitle)}` : ''
            }`,
            roomId: inv.roomId,
            actionLabel: 'Entrar a sala',
          });
        }
      } else if (type === 'INCOMING_FRIEND_ADDED') {
        const senderId = String(payload?.fromUserId || '').trim();
        if (senderId && senderId !== profile.id) {
          const now = Date.now();
          const prevSeenAt = seenFriendNoticeBySenderRef.current.get(senderId) || 0;
          if (now - prevSeenAt < 45_000) {
            return;
          }
          seenFriendNoticeBySenderRef.current.set(senderId, now);
          playCinemaSound('reaction');
          const notice = payload as unknown as IncomingFriendAddedNotice;
          setFriendAddedNotice(notice);
          if (friendNoticeTimerRef.current) clearTimeout(friendNoticeTimerRef.current);
          friendNoticeTimerRef.current = setTimeout(() => {
            setFriendAddedNotice((curr) => (curr?.id === notice.id ? null : curr));
          }, 7000);
          pushNotification({
            category: 'invite',
            title: `${notice.fromUserName || 'Nuevo amigo'} te añadió a sus amigos`,
            body: 'Ya podéis invitaros con 1 toque a cualquier sala de RiffanTV.',
          });
        }
      } else if (type === 'ROOM_INVITE_SENT_ACK') {
        if (payload?.targetName) {
          if (inviteFeedbackTimerRef.current) clearTimeout(inviteFeedbackTimerRef.current);
          setInviteSentFeedback(
            payload.deliveredLive
              ? `✓ ¡${payload.targetName} ha recibido tu invitación en pantalla!`
              : `✓ Invitación guardada para ${payload.targetName} (la verá al abrir la app)`
          );
          inviteFeedbackTimerRef.current = setTimeout(() => {
            setInviteSentFeedback(null);
          }, 3800);
        }
      }
    });
    return () => unsubGlobal();
  }, [
    profile.id,
    pushNotification,
    setOnlineUsers,
    setIncomingInvite,
    setFriendAddedNotice,
    setInviteSentFeedback,
    seenFriendNoticeBySenderRef,
    friendNoticeTimerRef,
    inviteFeedbackTimerRef,
  ]);

  // Active Room Socket Synchronization & Multiplayer Game Protocol
  useEffect(() => {
    if (!inRoom || !roomId || sessionMode === 'solo') return;

    const cleanCode = roomId.trim().toLowerCase();
    const matchedSaved = savedRoomsRef.current.find(
      (r) => r.roomCode.toLowerCase() === cleanCode
    );
    const knownPin =
      sessionPinMapRef.current[cleanCode] ||
      (matchedSaved?.hasPin ? matchedSaved.pinCode : undefined);

    const restoredBlueprint: RestoredRoomBlueprint | undefined = matchedSaved
      ? {
          roomName: matchedSaved.roomName,
          hostOnlyControl: matchedSaved.hostOnlyControl,
          pinCode: matchedSaved.hasPin ? matchedSaved.pinCode : undefined,
          queueItems: matchedSaved.queueItems,
        }
      : undefined;

    const userPayload: Participant = {
      id: profile.id,
      name: isTvMode ? `${profile.name} (TV)` : profile.name,
      avatar: isTvMode ? '📺' : profile.avatar || '🎬',
      color: profile.color || '#9146FF',
      isHost: false,
      joinedAt: Date.now(),
    };

    const resolvedInitialName =
      matchedSaved?.roomName || roomName || `Sala ${roomId.toUpperCase()}`;

    socketService.connect(roomId, userPayload, resolvedInitialName, {
      pin: knownPin,
      tvAuthToken: tvAuthToken || undefined,
      restoredBlueprint,
    });
    addRecentRoom({ id: roomId, name: resolvedInitialName });
    setRecentRooms(getRecentRooms());

    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname.toLowerCase();
      if (currentPath !== '/kids' && !isKidsRouteMode) {
        if (isDedicatedAppPath(window.location.pathname)) {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('room', roomId);
            if (isTvMode) url.searchParams.set('tv', '1');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
          } catch {
            // ignore
          }
        } else {
          const shortPath = isTvMode
            ? `/${encodeURIComponent(roomId)}?tv=1`
            : `/${encodeURIComponent(roomId)}`;
          window.history.replaceState({}, '', shortPath);
        }
      }
    }

    const unsubscribe = socketService.subscribe((event) => {
      dispatchRoomSocketEvent(event, {
        roomId,
        isTvMode,
        lang,
        profileId: profile.id,
        profileName: profile.name,
        mobileTabRef,
        hostIdRef,
        roomQueueRef,
        videoStateUrlRef,
        isExtractingRef,
        activeHubGameRef,
        catalogSectionRef,
        handlePlayQueueItemRef,
        tvClaimTimerRef,
        pendingSoloUpgradeVideoStateRef,
        recordStateInWatchHistory,
        rememberSessionPin,
        showHostLockNotice,
        setTypingUser,
        setRoomName,
        setHostId,
        setCreatorId,
        setHostOnlyControl,
        setRoomHasPin,
        setPinPromptState,
        setActivePoll,
        setRoomGameState,
        setPartyGameState,
        setPinturilloState,
        setPoolGameState,
        setChapasGameState,
        setHeadSoccerGameState,
        setHeadSoccerPeerInput,
        setHeadSoccerSyncSnapshot,
        setPokerGameState,
        setBlackjackGameState,
        setMatchResponses,
        setGameMoveError,
        setParticipants,
        setMessages,
        setPinnedMessage,
        setRoomQueue,
        setRecentRooms,
        setVideoState,
        setIsPlayerClosedLocally,
        setCloudFrame,
        setCloudState,
        setUnreadChatCount,
        setFloatingReactions,
        setTvClaimStatus,
        setIncomingGameInvite,
        setForcedOpenGame,
      });
    });

    return () => {
      unsubscribe();
      socketService.disconnect();
    };
  }, [
    sessionMode,
    inRoom,
    roomId,
    isTvMode,
    tvAuthToken,
    lang,
    profile.id,
    isKidsRouteMode,
    recordStateInWatchHistory,
    rememberSessionPin,
    showHostLockNotice,
    setTypingUser,
    // Setters and refs are stable
  ]);
}
