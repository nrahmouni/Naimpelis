import React from 'react';
import { socketService } from '../services/socket';
import { playCinemaSound } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { addRecentRoom, getRecentRooms } from '../utils/storage';
import type { MobileNavTab } from '../utils/appSessionHelpers';
import type { CatalogSection } from '../components/MediaCatalogHub';
import type {
  AppLanguage,
  BlackjackGameState,
  BoardGameState,
  ChatMessage,
  CloudBrowserState,
  FloatingReaction,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  Participant,
  PartyGameState,
  PinturilloGameState,
  PokerGameState,
  PollProposalItem,
  Pool8BallState,
  RoomPollState,
  RoomQueueItem,
  VideoState,
} from '../types';
import type { SocketEvent } from '../services/socketTypes';
import type {
  RoomGameInvite,
  RoomGameInviteType,
  RoomMatchResponsesState,
} from '../shared/protocol';

export interface RoomSocketDispatchContext {
  roomId: string;
  isTvMode: boolean;
  lang: AppLanguage;
  profileId: string;
  profileName: string;
  mobileTabRef: React.MutableRefObject<MobileNavTab>;
  hostIdRef: React.MutableRefObject<string>;
  roomQueueRef: React.MutableRefObject<RoomQueueItem[]>;
  videoStateUrlRef: React.MutableRefObject<string>;
  isExtractingRef: React.MutableRefObject<boolean>;
  activeHubGameRef: React.MutableRefObject<RoomGameInviteType | null>;
  catalogSectionRef: React.MutableRefObject<CatalogSection>;
  handlePlayQueueItemRef: React.MutableRefObject<(item: RoomQueueItem) => void>;
  tvClaimTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pendingSoloUpgradeVideoStateRef?: React.MutableRefObject<VideoState | null>;
  recordStateInWatchHistory: (vState: VideoState) => void;
  rememberSessionPin: (targetCode: string, pinCode: string) => void;
  showHostLockNotice: (hostDisplayName?: string, reason?: string) => void;
  setTypingUser: (userId: string, userName: string, isTyping: boolean) => void;
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

function normalizeServerVideoStateToLocalClock(
  vs: VideoState,
  serverTime?: unknown
): VideoState {
  if (!vs || !Number.isFinite(vs.lastUpdated) || vs.lastUpdated <= 0) return vs;
  const offsetMs =
    typeof serverTime === 'number' && Number.isFinite(serverTime)
      ? serverTime - Date.now()
      : socketService.serverClockOffsetMs;
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) < 150) return vs;
  return {
    ...vs,
    lastUpdated: vs.lastUpdated - offsetMs,
  };
}

export function dispatchRoomSocketEvent(event: SocketEvent, ctx: RoomSocketDispatchContext) {
  const { type, payload } = event;
  const {
    roomId,
    isTvMode,
    lang,
    profileId,
    profileName,
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
  } = ctx;

  if (type === 'ROOM_STATE') {
    const nextRoomTitle = payload.name || `Sala ${roomId.toUpperCase()}`;
    setRoomName(nextRoomTitle);
    setHostId(payload.hostId || '');
    setCreatorId(payload.creatorId || payload.hostId || '');
    setHostOnlyControl(
      payload.hostOnlyControl !== undefined ? Boolean(payload.hostOnlyControl) : true
    );
    setRoomHasPin(Boolean(payload.hasPin));
    setPinPromptState({ open: false, roomName: '', invalidAttempt: false });
    setParticipants(payload.participants || []);
    React.startTransition(() => {
      setActivePoll(payload.activePoll || null);
      setRoomGameState(payload.gameState || null);
      setPartyGameState(payload.partyGameState || null);
      setPinturilloState(payload.pinturilloState || null);
      setPoolGameState(payload.poolGameState || null);
      setChapasGameState(payload.chapasState || null);
      setHeadSoccerGameState(payload.headSoccerState || null);
      setPokerGameState(payload.pokerGameState || null);
      setBlackjackGameState(payload.blackjackState || null);
      setMatchResponses(payload.matchResponses || null);
      setGameMoveError(null);
      setMessages(() => {
        const raw: ChatMessage[] = payload.messages || [];
        const out: ChatMessage[] = [];
        const seenIds = new Set<string>();
        const recentJoins = new Map<string, number>();
        for (const m of raw) {
          if (seenIds.has(m.id)) continue;
          seenIds.add(m.id);
          if (m.isSystem && m.systemType === 'join') {
            const key = (m.systemUserId || m.text.trim()).toLowerCase();
            const prevTs = recentJoins.get(key);
            if (prevTs !== undefined && Math.abs(m.timestamp - prevTs) < 180_000) continue;
            recentJoins.set(key, m.timestamp);
          }
          out.push(m);
        }
        return out.slice(-150);
      });
      setPinnedMessage(payload.pinnedMessage || null);
      setRoomQueue(payload.queue || []);
      addRecentRoom({ id: roomId, name: nextRoomTitle });
      setRecentRooms(getRecentRooms());
    });
    const pendingSoloVs = pendingSoloUpgradeVideoStateRef?.current || null;
    if (pendingSoloUpgradeVideoStateRef) {
      pendingSoloUpgradeVideoStateRef.current = null;
    }

    const rawRoomVs = payload.videoState;
    if (pendingSoloVs && pendingSoloVs.mode !== 'idle' && pendingSoloVs.url) {
      const upgradedVs: VideoState = {
        ...pendingSoloVs,
        lastUpdated: Date.now(),
        updatedBy: profileName,
      };
      if (!rawRoomVs || rawRoomVs.mode === 'idle' || !rawRoomVs.url) {
        videoStateUrlRef.current = upgradedVs.url;
        socketService.syncVideoState('change_url', upgradedVs, profileName);
        recordStateInWatchHistory(upgradedVs);
      }
    } else if (rawRoomVs && !isExtractingRef.current) {
      const roomVs = normalizeServerVideoStateToLocalClock(rawRoomVs, payload.serverTime);
      const effectiveCreatorId = payload.creatorId || payload.hostId || '';
      const humanParticipants = (payload.participants || []).filter(
        (p) => !p.name?.includes('(TV)') && p.avatar !== '📺'
      );
      const isSoleOrControllingHost =
        !isTvMode &&
        (humanParticipants.length <= 1 ||
          (effectiveCreatorId === profileId &&
            (!roomVs.updatedBy || roomVs.updatedBy === profileName)));

      setVideoState((prev) => {
        if (
          prev.url &&
          prev.mode !== 'idle' &&
          (roomVs.lastUpdated || 0) < (prev.lastUpdated || 0)
        ) {
          return prev;
        }
        if (
          prev.url &&
          prev.url === roomVs.url &&
          prev.mode === roomVs.mode &&
          prev.mode !== 'idle' &&
          ((roomVs.lastUpdated || 0) <= (prev.lastUpdated || 0) || isSoleOrControllingHost)
        ) {
          return prev;
        }
        videoStateUrlRef.current = roomVs.url;
        return roomVs;
      });
      recordStateInWatchHistory(roomVs);
    }
  } else if (type === 'ROOM_PIN_REQUIRED') {
    setPinPromptState({
      open: true,
      roomName: payload?.roomName || `Sala ${roomId.toUpperCase()}`,
      invalidAttempt: Boolean(payload?.invalidAttempt),
    });
  } else if (type === 'ROOM_PIN_UPDATED') {
    const nextHasPin = Boolean(payload?.hasPin);
    setRoomHasPin(nextHasPin);
    if (!nextHasPin) rememberSessionPin(roomId, '');
    if (payload?.message) setMessages((prev) => [...prev.slice(-149), payload.message!]);
  } else if (type === 'ROOM_RENAMED') {
    if (payload?.roomName) {
      setRoomName(payload.roomName);
      addRecentRoom({ id: roomId, name: payload.roomName });
      setRecentRooms(getRecentRooms());
    }
    if (payload?.message) setMessages((prev) => [...prev.slice(-149), payload.message!]);
  } else if (type === 'TV_CLAIM_RESULT') {
    if (tvClaimTimerRef.current) clearTimeout(tvClaimTimerRef.current);
    if (payload?.success) {
      playCinemaSound('join');
      setTvClaimStatus({
        type: 'success',
        message: pickLang(lang, {
          es: '✓ Smart TV vinculada y proyectando en esta sala',
          ca: '✓ Smart TV vinculada i projectant en aquesta sala',
          en: '✓ Smart TV paired and projecting in this room',
        }),
      });
    } else {
      setTvClaimStatus({
        type: 'error',
        message:
          payload?.error ||
          pickLang(lang, {
            es: 'Código de TV no encontrado o caducado.',
            ca: 'Codi de TV no trobat o caducat.',
            en: 'TV code not found or expired.',
          }),
      });
    }
    tvClaimTimerRef.current = setTimeout(() => setTvClaimStatus(null), 5000);
  } else if (type === 'PARTICIPANTS_UPDATED') {
    setParticipants(payload.participants || []);
    if (payload.hostId) setHostId(payload.hostId);
    const joinMsg = payload.message as ChatMessage | undefined;
    if (joinMsg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === joinMsg.id)) return prev;
        if (joinMsg.isSystem && joinMsg.systemType === 'join') {
          const key = (joinMsg.systemUserId || joinMsg.text.trim()).toLowerCase();
          const isDupJoin = prev.slice(-20).some(
            (m) =>
              m.isSystem &&
              m.systemType === 'join' &&
              (m.systemUserId || m.text.trim()).toLowerCase() === key &&
              Math.abs(joinMsg.timestamp - m.timestamp) < 180_000
          );
          if (isDupJoin) return prev;
        }
        return [...prev.slice(-149), joinMsg];
      });
      playCinemaSound('join');
    }
  } else if (type === 'VIDEO_STATE_UPDATED') {
    if (payload.action === 'sync_request') return;
    const rawNextVideoState = payload.videoState;
    if (rawNextVideoState) {
      const nextVideoState = normalizeServerVideoStateToLocalClock(
        rawNextVideoState,
        payload.serverTime
      );
      const prevUrl = videoStateUrlRef.current;
      videoStateUrlRef.current = nextVideoState.url;
      setVideoState((prev) => {
        if (
          payload.action === 'change_url' &&
          !isTvMode &&
          prev.url &&
          prev.mode !== 'idle' &&
          prev.url === nextVideoState.url &&
          prev.mode === nextVideoState.mode &&
          prev.isPlaying === nextVideoState.isPlaying &&
          nextVideoState.updatedBy === profileName &&
          Math.abs((nextVideoState.currentTime || 0) - (prev.currentTime || 0)) < 3
        ) {
          return prev;
        }
        if (nextVideoState.url && nextVideoState.url !== prev.url && nextVideoState.mode !== 'idle') {
          setIsPlayerClosedLocally(false);
        }
        return nextVideoState;
      });
      if (nextVideoState.url && nextVideoState.url !== prevUrl) {
        recordStateInWatchHistory(nextVideoState);
      }
      if (nextVideoState.mode !== 'cloud') {
        setCloudFrame(null);
        setCloudState(null);
      }
    }
    const vidMsg = payload.message;
    if (vidMsg) {
      setMessages((prev) => (prev.some((m) => m.id === vidMsg.id) ? prev : [...prev.slice(-149), vidMsg]));
    }
  } else if (type === 'QUEUE_UPDATED') {
    setRoomQueue(payload.queue || []);
    const qMsg = payload.message;
    if (qMsg) {
      setMessages((prev) => (prev.some((m) => m.id === qMsg.id) ? prev : [...prev.slice(-149), qMsg]));
    }
  } else if (type === 'NEW_CHAT_MESSAGE') {
    const incomingChat = payload as unknown as ChatMessage;
    setMessages((prev) =>
      prev.some((m) => m.id === incomingChat.id) ? prev : [...prev.slice(-149), incomingChat]
    );
    if (mobileTabRef.current !== 'chat' && payload.senderId !== profileId) {
      setUnreadChatCount((c) => c + 1);
    }
  } else if (type === 'FLOATING_REACTION') {
    const reaction = payload as unknown as FloatingReaction;
    setFloatingReactions((prev) => [...prev.slice(-18), reaction]);
    playCinemaSound('reaction');
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
    }, 2800);
  } else if (type === 'HOST_TRANSFERRED') {
    setHostId(payload.hostId || '');
    if (payload.creatorId) setCreatorId(payload.creatorId);
    setParticipants(payload.participants || []);
    if (payload.message) setMessages((prev) => [...prev.slice(-149), payload.message!]);
  } else if (type === 'HOST_LOCK_UPDATED') {
    setHostOnlyControl(Boolean(payload.hostOnlyControl));
    if (payload.message) setMessages((prev) => [...prev.slice(-149), payload.message!]);
  } else if (type === 'HOST_LOCK_REJECTED') {
    if (payload?.videoState) setVideoState(payload.videoState);
    showHostLockNotice(payload?.hostName, payload?.reason);
  } else if (type === 'POLL_UPDATED') {
    setActivePoll(payload.poll || null);
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
    if (payload.justFinished) {
      playCinemaSound('reaction');
      if (payload.winnerItem && hostIdRef.current === profileId) {
        const winnerProposal = payload.winnerItem as PollProposalItem;
        const matchedInQueue = roomQueueRef.current.find(
          (q) =>
            q.title === winnerProposal.title &&
            (q.tmdbId === winnerProposal.tmdbId ||
              q.youtubeId === winnerProposal.youtubeId ||
              q.url === winnerProposal.url)
        );
        handlePlayQueueItemRef.current({
          ...winnerProposal,
          id: matchedInQueue?.id || `poll-win-${Date.now()}`,
          addedBy: profileName,
        });
      }
      const finishedPollId = payload.poll?.id;
      if (finishedPollId) {
        setTimeout(() => {
          setActivePoll((curr) => (curr && curr.id === finishedPollId && curr.isClosed ? null : curr));
        }, 14000);
      }
    }
  } else if (type === 'CLOUD_BROWSER_FRAME') {
    setCloudFrame(payload.image || null);
    setCloudState({
      active: true,
      url: payload.url || '',
      title: payload.title || '',
      isLoading: Boolean(payload.isLoading),
      detectedStreamUrl: payload.detectedStreamUrl ?? undefined,
    });
  } else if (type === 'TYPING_UPDATED') {
    if (payload.userId && payload.userId !== profileId) {
      setTypingUser(String(payload.userId), String(payload.userName || 'Amigo'), Boolean(payload.isTyping));
    }
  } else if (type === 'GAME_STATE_UPDATED') {
    const nextBoard = payload.gameState || null;
    setRoomGameState(nextBoard);
    setGameMoveError(null);
    if (!nextBoard) {
      setIncomingGameInvite((prev) =>
        prev && (prev.gameType === 'chess' || prev.gameType === 'checkers' || prev.gameType === 'connect4')
          ? null
          : prev
      );
    }
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
  } else if (type === 'GAME_MOVE_REJECTED') {
    if (payload.gameState !== undefined) setRoomGameState(payload.gameState || null);
    setGameMoveError(String(payload.error || 'Jugada no válida'));
    setTimeout(() => setGameMoveError(null), 3200);
  } else if (type === 'PINNED_MESSAGE_UPDATED') {
    setPinnedMessage(payload.pinnedMessage || null);
  } else if (type === 'PARTY_GAME_STATE_UPDATED') {
    const nextParty = payload.partyGameState || null;
    setPartyGameState(nextParty);
    if (!nextParty) {
      setIncomingGameInvite((prev) =>
        prev && (prev.gameType === 'parchis' || prev.gameType === 'uno') ? null : prev
      );
    }
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
  } else if (type === 'PINTURILLO_STATE_UPDATED') {
    const nextPint = payload.pinturilloState || null;
    setPinturilloState(nextPint);
    if (!nextPint) {
      setIncomingGameInvite((prev) => (prev && prev.gameType === 'pinturillo' ? null : prev));
    }
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
  } else if (type === 'POOL_STATE_UPDATED') {
    const nextPool = payload.poolGameState || null;
    setPoolGameState(nextPool);
    if (!nextPool) setIncomingGameInvite((prev) => (prev && prev.gameType === 'pool' ? null : prev));
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
  } else if (type === 'POOL_SHOT_BROADCAST') {
    setPoolGameState((payload.authoritativeState as Pool8BallState | null) || null);
  } else if (type === 'CHAPAS_STATE_UPDATED') {
    const nextChapas = (payload.chapasState as FutbolChapasState | null) || null;
    setChapasGameState(nextChapas);
    if (!nextChapas) setIncomingGameInvite((prev) => (prev && prev.gameType === 'chapas' ? null : prev));
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
  } else if (type === 'CHAPAS_SHOT_BROADCAST') {
    setChapasGameState((payload.authoritativeState as FutbolChapasState | null) || null);
  } else if (type === 'HEADSOCCER_STATE_UPDATED') {
    const nextHs = (payload.headSoccerState as HeadSoccerOnlineState | null) || null;
    setHeadSoccerGameState(nextHs);
    if (!nextHs) setIncomingGameInvite((prev) => (prev && prev.gameType === 'headsoccer' ? null : prev));
  } else if (type === 'HEADSOCCER_INPUT_RELAY') {
    if (payload.input && (payload.side === 0 || payload.side === 1)) {
      setHeadSoccerPeerInput({ side: payload.side, input: payload.input, seq: Number(payload.seq) || Date.now() });
    }
  } else if (type === 'HEADSOCCER_SYNC_BROADCAST') {
    if (payload.sim) setHeadSoccerSyncSnapshot({ seq: Number(payload.seq) || Date.now(), sim: payload.sim });
  } else if (type === 'POKER_STATE_UPDATED') {
    const nextPoker = (payload.pokerGameState as PokerGameState | null) || null;
    setPokerGameState(nextPoker);
    if (!nextPoker) setIncomingGameInvite((prev) => (prev && prev.gameType === 'poker' ? null : prev));
  } else if (type === 'BLACKJACK_STATE_UPDATED') {
    const nextBj = (payload.blackjackState as BlackjackGameState | null) || null;
    setBlackjackGameState(nextBj);
    if (!nextBj) setIncomingGameInvite((prev) => (prev && prev.gameType === 'blackjack' ? null : prev));
  } else if (type === 'GAME_SWITCHED') {
    const rs = payload.roomState;
    if (rs) {
      setRoomGameState(rs.gameState ?? null);
      setPartyGameState(rs.partyGameState ?? null);
      setPinturilloState(rs.pinturilloState ?? null);
      setPoolGameState(rs.poolGameState ?? null);
      setChapasGameState(rs.chapasState ?? null);
      setHeadSoccerGameState(rs.headSoccerState ?? null);
      setPokerGameState(rs.pokerGameState ?? null);
      setBlackjackGameState(rs.blackjackState ?? null);
      setMatchResponses(rs.matchResponses ?? null);
    }
    setIncomingGameInvite(null);
    if (payload.message) {
      setMessages((prev) => [...prev.slice(-149), payload.message!]);
      if (mobileTabRef.current !== 'chat') setUnreadChatCount((c) => c + 1);
    }
    if (
      payload.targetGame &&
      (activeHubGameRef.current !== null ||
        (Array.isArray(payload.seatedUserIds) && payload.seatedUserIds.includes(profileId)))
    ) {
      setForcedOpenGame({ gameType: payload.targetGame, seq: Date.now() });
    }
  } else if (type === 'GAME_INVITE_STATUS_UPDATED') {
    setMatchResponses(payload.matchResponses || null);
  } else if (type === 'GAME_MATCH_INVITE') {
    if (isTvMode) return;
    const invite = payload as unknown as RoomGameInvite;
    if (!invite || !invite.gameType || invite.inviterId === profileId) return;
    const alreadyViewingThisGame =
      catalogSectionRef.current === 'games' &&
      mobileTabRef.current !== 'chat' &&
      mobileTabRef.current !== 'room' &&
      activeHubGameRef.current === invite.gameType;
    if (alreadyViewingThisGame) return;
    setIncomingGameInvite(invite);
  }
}
