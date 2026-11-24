import { useRef, useState } from 'react';
import type {
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
  Participant,
  PartyGameState,
  PinturilloGameState,
  PokerGameState,
  Pool8BallState,
  RoomPollState,
  RoomQueueItem,
  SecondaryStreamState,
  VideoState,
  WatchHistoryItem,
} from '../types';
import type { RoomGameInvite, RoomGameInviteType, RoomMatchResponsesState } from '../shared/protocol';
import type { ActiveMovieContext } from '../components/MoviePlaybackDock';
import type { CatalogSection } from '../components/MediaCatalogHub';
import {
  INITIAL_VIDEO_STATE,
  loadCachedSavedRooms,
  loadSessionRoomPins,
  MobileNavTab,
  normalizeDeepLinkGameType,
} from '../utils/appSessionHelpers';

export function useRoomAuthoritativeState(params: {
  effectiveInitialRoom: string;
  initialDeepLinkGame: RoomGameInviteType | null;
  watchHistory: WatchHistoryItem[];
  isTvPairLobby: boolean;
  savedRooms: CloudSavedRoom[];
  sessionPinMap: Record<string, string>;
  isCinemaMode: boolean;
  isPlayerMinimized: boolean;
  isPlayerClosedLocally: boolean;
}) {
  const [hostId, setHostId] = useState<string>('');
  const [creatorId, setCreatorId] = useState<string>('');
  const [hostOnlyControl, setHostOnlyControl] = useState<boolean>(true);
  const [activePoll, setActivePoll] = useState<RoomPollState | null>(null);
  const [roomGameState, setRoomGameState] = useState<BoardGameState | null>(null);
  const [partyGameState, setPartyGameState] = useState<PartyGameState | null>(null);
  const [pinturilloState, setPinturilloState] = useState<PinturilloGameState | null>(null);
  const [poolGameState, setPoolGameState] = useState<Pool8BallState | null>(null);
  const [chapasGameState, setChapasGameState] = useState<FutbolChapasState | null>(null);
  const [headSoccerGameState, setHeadSoccerGameState] =
    useState<HeadSoccerOnlineState | null>(null);
  const [headSoccerSyncSnapshot, setHeadSoccerSyncSnapshot] = useState<{
    seq: number;
    sim: HeadSoccerSimulation;
  } | null>(null);
  const [headSoccerPeerInput, setHeadSoccerPeerInput] = useState<{
    side: 0 | 1;
    input: HeadSoccerInput;
    seq: number;
  } | null>(null);
  const [pokerGameState, setPokerGameState] = useState<PokerGameState | null>(null);
  const [blackjackGameState, setBlackjackGameState] = useState<BlackjackGameState | null>(null);
  const [matchResponses, setMatchResponses] = useState<RoomMatchResponsesState | null>(null);
  const [gameMoveError, setGameMoveError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [roomQueue, setRoomQueue] = useState<RoomQueueItem[]>([]);
  const [videoState, setVideoState] = useState<VideoState>(INITIAL_VIDEO_STATE);
  const [secondaryStreams, setSecondaryStreams] = useState<SecondaryStreamState[]>([]);
  const [activeAudioSlot, setActiveAudioSlot] = useState<number>(0);

  const secondaryStream: SecondaryStreamState | null = secondaryStreams[0] ?? null;
  const setSecondaryStream: React.Dispatch<React.SetStateAction<SecondaryStreamState | null>> =
    React.useCallback((updater) => {
      setSecondaryStreams((prev) => {
        const currentFirst = prev[0] ?? null;
        const nextFirst = typeof updater === 'function' ? updater(currentFirst) : updater;
        if (!nextFirst) {
          return prev.slice(1);
        }
        return [nextFirst, ...prev.slice(1)].slice(0, 3);
      });
    }, []);
  const [lockNoticeToast, setLockNoticeToast] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [cloudFrame, setCloudFrame] = useState<string | null>(null);
  const [cloudState, setCloudState] = useState<CloudBrowserState | null>(null);

  const [catalogSection, setCatalogSection] = useState<CatalogSection>(() =>
    params.effectiveInitialRoom && params.initialDeepLinkGame ? 'games' : 'home'
  );
  const [mobileTab, setMobileTab] = useState<MobileNavTab>(() =>
    params.effectiveInitialRoom && params.initialDeepLinkGame ? 'games' : 'home'
  );
  const [openQueueTrigger, setOpenQueueTrigger] = useState<number>(0);
  const [queueAddedNotice, setQueueAddedNotice] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState<boolean>(false);
  const [activeMovieContext, setActiveMovieContext] =
    useState<ActiveMovieContext | null>(null);
  const [isInActiveGame, setIsInActiveGame] = useState<boolean>(() =>
    Boolean(params.effectiveInitialRoom && params.initialDeepLinkGame)
  );
  const [incomingGameInvite, setIncomingGameInvite] = useState<RoomGameInvite | null>(null);
  const [forcedOpenGame, setForcedOpenGame] = useState<{
    gameType: RoomGameInviteType;
    seq: number;
  } | null>(() =>
    params.effectiveInitialRoom && params.initialDeepLinkGame
      ? { gameType: params.initialDeepLinkGame, seq: Date.now() }
      : null
  );

  const mobileTabRef = useRef<MobileNavTab>(mobileTab);
  mobileTabRef.current = mobileTab;
  const hostIdRef = useRef<string>(hostId);
  hostIdRef.current = hostId;
  const roomQueueRef = useRef<RoomQueueItem[]>(roomQueue);
  roomQueueRef.current = roomQueue;
  const videoStateUrlRef = useRef<string>(videoState.url);
  videoStateUrlRef.current = videoState.url;
  const videoStateRef = useRef<VideoState>(videoState);
  videoStateRef.current = videoState;
  const isCinemaModeRef = useRef<boolean>(params.isCinemaMode);
  isCinemaModeRef.current = params.isCinemaMode;
  const handlePlayQueueItemRef = useRef<(item: RoomQueueItem) => void>(() => {});
  const lockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualLobbyStayRef = useRef<boolean>(false);
  const hadActivePlaybackRef = useRef<boolean>(false);
  const activeHubGameRef = useRef<RoomGameInviteType | null>(null);
  const catalogSectionRef = useRef<CatalogSection>(catalogSection);
  catalogSectionRef.current = catalogSection;
  const watchHistoryRef = useRef<WatchHistoryItem[]>(params.watchHistory);
  watchHistoryRef.current = params.watchHistory;
  const isTvPairLobbyRef = useRef<boolean>(params.isTvPairLobby);
  isTvPairLobbyRef.current = params.isTvPairLobby;
  const savedRoomsRef = useRef<CloudSavedRoom[]>(params.savedRooms);
  savedRoomsRef.current = params.savedRooms;
  const sessionPinMapRef = useRef<Record<string, string>>(params.sessionPinMap);
  sessionPinMapRef.current = params.sessionPinMap;
  const tvClaimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExtractingRef = useRef<boolean>(isExtracting);
  isExtractingRef.current = isExtracting;
  const activeMovieContextRef = useRef(activeMovieContext);
  activeMovieContextRef.current = activeMovieContext;
  const isPlayerClosedLocallyRef = useRef(params.isPlayerClosedLocally);
  isPlayerClosedLocallyRef.current = params.isPlayerClosedLocally;
  const isPlayerMinimizedRef = useRef(params.isPlayerMinimized);
  isPlayerMinimizedRef.current = params.isPlayerMinimized;
  const pendingSoloUpgradeVideoStateRef = useRef<VideoState | null>(null);

  return {
    hostId,
    setHostId,
    creatorId,
    setCreatorId,
    hostOnlyControl,
    setHostOnlyControl,
    activePoll,
    setActivePoll,
    roomGameState,
    setRoomGameState,
    partyGameState,
    setPartyGameState,
    pinturilloState,
    setPinturilloState,
    poolGameState,
    setPoolGameState,
    chapasGameState,
    setChapasGameState,
    headSoccerGameState,
    setHeadSoccerGameState,
    headSoccerSyncSnapshot,
    setHeadSoccerSyncSnapshot,
    headSoccerPeerInput,
    setHeadSoccerPeerInput,
    pokerGameState,
    setPokerGameState,
    blackjackGameState,
    setBlackjackGameState,
    matchResponses,
    setMatchResponses,
    gameMoveError,
    setGameMoveError,
    participants,
    setParticipants,
    messages,
    setMessages,
    pinnedMessage,
    setPinnedMessage,
    roomQueue,
    setRoomQueue,
    videoState,
    setVideoState,
    secondaryStream,
    setSecondaryStream,
    secondaryStreams,
    setSecondaryStreams,
    activeAudioSlot,
    setActiveAudioSlot,
    lockNoticeToast,
    setLockNoticeToast,
    floatingReactions,
    setFloatingReactions,
    cloudFrame,
    setCloudFrame,
    cloudState,
    setCloudState,
    catalogSection,
    setCatalogSection,
    mobileTab,
    setMobileTab,
    openQueueTrigger,
    setOpenQueueTrigger,
    queueAddedNotice,
    setQueueAddedNotice,
    unreadChatCount,
    setUnreadChatCount,
    isExtracting,
    setIsExtracting,
    floatingChatOpen,
    setFloatingChatOpen,
    activeMovieContext,
    setActiveMovieContext,
    isInActiveGame,
    setIsInActiveGame,
    incomingGameInvite,
    setIncomingGameInvite,
    forcedOpenGame,
    setForcedOpenGame,
    mobileTabRef,
    hostIdRef,
    roomQueueRef,
    videoStateUrlRef,
    videoStateRef,
    isCinemaModeRef,
    handlePlayQueueItemRef,
    lockToastTimerRef,
    queueToastTimerRef,
    manualLobbyStayRef,
    hadActivePlaybackRef,
    activeHubGameRef,
    catalogSectionRef,
    watchHistoryRef,
    isTvPairLobbyRef,
    savedRoomsRef,
    sessionPinMapRef,
    tvClaimTimerRef,
    isExtractingRef,
    activeMovieContextRef,
    isPlayerClosedLocallyRef,
    isPlayerMinimizedRef,
    pendingSoloUpgradeVideoStateRef,
  };
}

export { loadCachedSavedRooms, loadSessionRoomPins, normalizeDeepLinkGameType };
