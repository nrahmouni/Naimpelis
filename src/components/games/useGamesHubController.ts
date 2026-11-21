import React, { useEffect, useState } from 'react';
import type {
  BlackjackGameState,
  BoardClockMinutes,
  BoardGameState,
  BoardGameType,
  BoardSide,
  FutbolChapasState,
  HeadSoccerOnlineState,
  Participant,
  PinturilloGameState,
  PokerGameState,
  Pool8BallState,
  PoolDifficulty,
} from '../../types';
import {
  BOARD_TURN_DECISION_MS,
  applyBoardMove,
  chooseAutoBoardMove,
  createInitialBoardGameState,
} from '../../shared/boardGames';
import { type PartyGameState, type PartyGameType } from '../../shared/partyGames';
import type { UnifiedGameId } from './GameLogos';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { buildCanonicalShareUrl } from '../../shared/dedicatedRoutes';
import { resolvePublicLinkOrigin } from '../../utils/shortLink';
import { copyTextToClipboard, showAppShareToast } from '../../utils/shareDedicatedLink';
import { useAppStore } from '../../store/useAppStore';
import { useBackInterceptor } from '../../lib/backInterceptor';
import type { AppLanguage } from '../../types';

export function isPartyGame(id: UnifiedGameId): id is PartyGameType {
  return id === 'parchis' || id === 'uno';
}

export function isBoardGameId(id: UnifiedGameId): id is BoardGameType {
  return id === 'chess' || id === 'checkers' || id === 'connect4';
}

interface UseGamesHubControllerParams {
  lang: AppLanguage;
  roomId: string;
  currentUser: Participant;
  hubMode: 'offline' | 'online';
  setHubMode: React.Dispatch<React.SetStateAction<'offline' | 'online'>>;
  isHost: boolean;
  requestedGameOpen: { gameType: UnifiedGameId; seq: number } | null;
  roomBoardGame: BoardGameState | null;
  roomPartyGame: PartyGameState | null;
  roomPinturilloGame: PinturilloGameState | null;
  roomPoolGame: Pool8BallState | null;
  roomChapasGame: FutbolChapasState | null;
  roomHeadSoccerGame: HeadSoccerOnlineState | null;
  roomPokerGame: PokerGameState | null;
  roomBlackjackGame: BlackjackGameState | null;
  onSelectedGameChange?: (game: UnifiedGameId | null) => void;
  onSwitchRoomGame?: (game: UnifiedGameId) => void;
  onStartRoomBoardGame?: (gt: BoardGameType, soloLocal?: boolean, clockMinutes?: BoardClockMinutes) => void;
  onCloseBoardGame?: () => void;
  onStartRoomPartyGame?: (gt: PartyGameType) => void;
  onCloseRoomPartyGame?: () => void;
  onStartRoomPinturillo?: () => void;
  onCloseRoomPinturillo?: () => void;
  onStartRoomPool?: (difficulty?: PoolDifficulty) => void;
  onCloseRoomPool?: () => void;
  onStartRoomChapas?: (opts?: { botsEnabled?: boolean }) => void;
  onCloseRoomChapas?: () => void;
  onStartRoomHeadSoccer?: () => void;
  onCloseRoomHeadSoccer?: () => void;
  onStartRoomPoker?: (botsEnabled?: boolean) => void;
  onCloseRoomPoker?: () => void;
  onStartRoomBlackjack?: () => void;
  onCloseRoomBlackjack?: () => void;
}

export function useGamesHubController({
  lang,
  roomId,
  currentUser,
  hubMode,
  setHubMode,
  isHost,
  requestedGameOpen,
  roomBoardGame,
  roomPartyGame,
  roomPinturilloGame,
  roomPoolGame,
  roomChapasGame,
  roomHeadSoccerGame,
  roomPokerGame,
  roomBlackjackGame,
  onSelectedGameChange,
  onSwitchRoomGame,
  onStartRoomBoardGame,
  onCloseBoardGame,
  onStartRoomPartyGame,
  onCloseRoomPartyGame,
  onStartRoomPinturillo,
  onCloseRoomPinturillo,
  onStartRoomPool,
  onCloseRoomPool,
  onStartRoomChapas,
  onCloseRoomChapas,
  onStartRoomHeadSoccer,
  onCloseRoomHeadSoccer,
  onStartRoomPoker,
  onCloseRoomPoker,
  onStartRoomBlackjack,
  onCloseRoomBlackjack,
}: UseGamesHubControllerParams) {
  const [selectedGame, setSelectedGame] = useState<UnifiedGameId | null>(null);
  const [showGameSwitcher, setShowGameSwitcher] = useState(false);
  const [localBoardGame, setLocalBoardGame] = useState<BoardGameState | null>(null);
  const [localMoveErr, setLocalMoveErr] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const handleInviteGame = async (gt: UnifiedGameId) => {
    triggerHaptic('medium');
    const sessionMode = useAppStore.getState().sessionMode;
    const url = buildCanonicalShareUrl(
      { kind: 'game', gameId: gt },
      {
        roomId: sessionMode !== 'solo' && roomId ? roomId : undefined,
        origin: resolvePublicLinkOrigin(),
      }
    );
    const shareTitle = `RiffanTV · ${gt.toUpperCase()}`;
    const shareText = pickLang(lang, {
      es: `¡Únete a jugar a ${gt} en RiffanTV!`,
      ca: `Uneix-te a jugar a ${gt} a RiffanTV!`,
      en: `Play ${gt} on RiffanTV!`,
    });
    const isTouchMobile =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: coarse)').matches &&
      window.matchMedia?.('(max-width: 768px)').matches;
    if (isTouchMobile) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url });
        showAppShareToast(`Enlace listo · ${url}`);
        return;
      } catch {
        // user canceled or unsupported -> fallback to clipboard
      }
    }
    const copied = await copyTextToClipboard(url);
    if (copied) {
      setInviteCopied(true);
      showAppShareToast(`Enlace copiado · ${url}`);
      window.setTimeout(() => setInviteCopied(false), 2600);
    }
  };

  const onSelectedGameChangeRef = React.useRef(onSelectedGameChange);
  onSelectedGameChangeRef.current = onSelectedGameChange;

  useEffect(() => {
    onSelectedGameChangeRef.current?.(selectedGame);
  }, [selectedGame]);

  useEffect(() => {
    return () => {
      onSelectedGameChangeRef.current?.(null);
    };
  }, []);

  const lastHandledRequestSeqRef = React.useRef<number>(0);
  useEffect(() => {
    if (!requestedGameOpen || requestedGameOpen.seq === lastHandledRequestSeqRef.current) return;
    lastHandledRequestSeqRef.current = requestedGameOpen.seq;
    setHubMode('online');
    setLocalMoveErr(null);
    setSelectedGame(requestedGameOpen.gameType);
  }, [requestedGameOpen, setHubMode]);

  useEffect(() => {
    setShowGameSwitcher(false);
  }, [selectedGame]);

  useEffect(() => {
    if (!showGameSwitcher || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGameSwitcher(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGameSwitcher]);

  const prevRoomGameKeyRef = React.useRef<UnifiedGameId | null>(null);
  useEffect(() => {
    const incomingType: UnifiedGameId | null = roomChapasGame
      ? 'chapas'
      : roomHeadSoccerGame
      ? 'headsoccer'
      : roomPokerGame
      ? 'poker'
      : roomBlackjackGame
      ? 'blackjack'
      : roomPoolGame
      ? 'pool'
      : roomPinturilloGame
      ? 'pinturillo'
      : roomPartyGame
      ? roomPartyGame.gameType
      : roomBoardGame
      ? roomBoardGame.gameType
      : null;

    const prevType = prevRoomGameKeyRef.current;
    if (hubMode === 'online' && selectedGame && incomingType !== prevType) {
      if (incomingType && incomingType !== selectedGame) {
        setLocalMoveErr(null);
        setSelectedGame(incomingType);
      } else if (!isHost && prevType && !incomingType) {
        setSelectedGame(null);
      }
    }
    prevRoomGameKeyRef.current = incomingType;
  }, [
    roomChapasGame,
    roomHeadSoccerGame,
    roomPokerGame,
    roomBlackjackGame,
    roomPoolGame,
    roomPinturilloGame,
    roomPartyGame,
    roomBoardGame,
    isHost,
    hubMode,
    selectedGame,
  ]);

  const makeOfflineBoardState = (gt: BoardGameType, humanSide: BoardSide = 'w'): BoardGameState => {
    const created = createInitialBoardGameState(
      gt,
      { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar, color: currentUser.color },
      true,
      undefined,
      0,
      [],
      true
    );
    const botSide: BoardSide = humanSide === 'w' ? 'b' : 'w';
    return {
      ...created,
      players: {
        [humanSide]: {
          userId: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar || '🎮',
          color: currentUser.color || '#9146FF',
          score: 0,
        },
        [botSide]: {
          userId: 'bot-board-ia',
          name: 'Bot IA',
          avatar: '🤖',
          color: '#E11D48',
          score: 0,
          isBot: true,
        },
      } as BoardGameState['players'],
    };
  };

  useEffect(() => {
    if (hubMode !== 'offline' || !localBoardGame || localBoardGame.status !== 'playing') return;
    const activeSeat = localBoardGame.players[localBoardGame.turn];
    const isBotTurn = Boolean(activeSeat?.isBot || activeSeat?.userId === 'bot-board-ia');

    const delayMs = isBotTurn
      ? 600
      : Math.max(
          250,
          (localBoardGame.turnDeadlineAt || Date.now() + BOARD_TURN_DECISION_MS) - Date.now()
        );

    const timer = window.setTimeout(() => {
      setLocalBoardGame((curr) => {
        if (!curr || curr.status !== 'playing') return curr;
        const curSeat = curr.players[curr.turn];
        const moveActorId = curSeat?.userId || currentUser.id;
        const autoMove = chooseAutoBoardMove(curr);
        if (!autoMove) return curr;
        const res = applyBoardMove(curr, moveActorId, autoMove.from, autoMove.to, 'Q');
        return res.ok ? res.state : curr;
      });
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [hubMode, localBoardGame, currentUser.id]);

  useEffect(() => {
    if (!selectedGame || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedGame]);

  const startOnlineGameIfNeeded = (gt: UnifiedGameId) => {
    if (gt === 'chapas') {
      if (!roomChapasGame) onStartRoomChapas?.();
    } else if (gt === 'headsoccer') {
      if (!roomHeadSoccerGame) onStartRoomHeadSoccer?.();
    } else if (gt === 'poker') {
      if (!roomPokerGame) onStartRoomPoker?.(true);
    } else if (gt === 'blackjack') {
      if (!roomBlackjackGame) onStartRoomBlackjack?.();
    } else if (gt === 'pinturillo') {
      if (!roomPinturilloGame) onStartRoomPinturillo?.();
    } else if (gt === 'pool') {
      if (!roomPoolGame) onStartRoomPool?.();
    } else if (isPartyGame(gt)) {
      if (!roomPartyGame || roomPartyGame.gameType !== gt) onStartRoomPartyGame?.(gt);
    } else if (isBoardGameId(gt)) {
      if (!roomBoardGame || roomBoardGame.gameType !== gt) onStartRoomBoardGame?.(gt, false, 0);
    }
  };

  const openGameCard = (gt: UnifiedGameId) => {
    triggerHaptic('medium');
    setSelectedGame(gt);
    setLocalMoveErr(null);

    if (hubMode === 'offline') {
      if (isBoardGameId(gt)) {
        setLocalBoardGame(makeOfflineBoardState(gt, 'w'));
      }
      return;
    }

    startOnlineGameIfNeeded(gt);
  };

  const handleBackToGames = () => {
    triggerHaptic('light');
    if (selectedGame) {
      if (hubMode === 'offline') {
        setLocalBoardGame(null);
        setLocalMoveErr(null);
      } else if (selectedGame === 'chapas') {
        if (isHost && roomChapasGame) onCloseRoomChapas?.();
      } else if (selectedGame === 'headsoccer') {
        if (isHost && roomHeadSoccerGame) onCloseRoomHeadSoccer?.();
      } else if (selectedGame === 'poker') {
        if (isHost && roomPokerGame) onCloseRoomPoker?.();
      } else if (selectedGame === 'blackjack') {
        if (isHost && roomBlackjackGame) onCloseRoomBlackjack?.();
      } else if (selectedGame === 'pinturillo') {
        if (isHost && roomPinturilloGame) onCloseRoomPinturillo?.();
      } else if (selectedGame === 'pool') {
        if (isHost && roomPoolGame) onCloseRoomPool?.();
      } else if (isPartyGame(selectedGame)) {
        if (isHost && roomPartyGame?.gameType === selectedGame) onCloseRoomPartyGame?.();
      } else if (isHost && roomBoardGame?.gameType === selectedGame) {
        onCloseBoardGame?.();
      }
    }
    setSelectedGame(null);
  };

  useBackInterceptor(
    showGameSwitcher,
    'games-switcher-modal',
    () => setShowGameSwitcher(false),
    { priority: 15 }
  );

  useBackInterceptor(
    Boolean(selectedGame),
    'games-active-match',
    handleBackToGames,
    { priority: 12 }
  );

  const switchModeForActiveGame = (targetMode: 'online' | 'offline') => {
    if (!selectedGame || targetMode === hubMode) return;
    triggerHaptic('light');
    setHubMode(targetMode);
    setLocalMoveErr(null);

    if (targetMode === 'offline') {
      if (isBoardGameId(selectedGame)) {
        setLocalBoardGame(makeOfflineBoardState(selectedGame, 'w'));
      }
    } else {
      setLocalBoardGame(null);
      startOnlineGameIfNeeded(selectedGame);
    }
  };

  const handleJoinOfflineBoardSeat = (side: 'w' | 'b' | 'spectate') => {
    if (side === 'spectate' || !selectedGame || !isBoardGameId(selectedGame)) return;
    setLocalBoardGame((curr) => {
      if (!curr) return makeOfflineBoardState(selectedGame, side);
      if (curr.status !== 'waiting' && curr.moveHistory.length > 0) return curr;
      return makeOfflineBoardState(selectedGame, side);
    });
  };

  const getActiveSeatedPlayers = (activeBoardState: BoardGameState | null): Array<{ id: string; name: string; avatar: string }> => {
    if (hubMode === 'offline') {
      return [
        { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar || '🎮' },
        { id: 'bot-ia', name: 'Bot IA', avatar: '🤖' },
      ];
    }
    const list: Array<{ id: string; name: string; avatar: string }> = [];
    const seen = new Set<string>();
    const push = (id?: string | null, name?: string, avatar?: string, isBot?: boolean) => {
      if (!id || isBot || id.startsWith('bot-') || seen.has(id)) return;
      seen.add(id);
      list.push({ id, name: name || 'Jugador', avatar: avatar || '🎮' });
    };
    if (selectedGame === 'pool' && roomPoolGame) {
      roomPoolGame.players.forEach((p) => p && push(p.userId, p.name, p.avatar, p.isBot));
    } else if (selectedGame === 'chapas' && roomChapasGame) {
      roomChapasGame.players.forEach((p) => p && push(p.userId, p.name, p.avatar, p.isBot));
    } else if (selectedGame === 'headsoccer' && roomHeadSoccerGame) {
      roomHeadSoccerGame.players.forEach((p) => p && push(p.userId, p.name, p.avatar, p.isBot));
    } else if (selectedGame === 'poker' && roomPokerGame) {
      roomPokerGame.seats.forEach((s) => s && push(s.userId, s.name, s.avatar, s.isBot));
    } else if (selectedGame === 'blackjack' && roomBlackjackGame) {
      roomBlackjackGame.seats.forEach((s) => s && push(s.userId, s.name, s.avatar, false));
    } else if (selectedGame === 'pinturillo' && roomPinturilloGame) {
      roomPinturilloGame.players.forEach((p) => p && push(p.userId, p.name, p.avatar, p.isBot));
    } else if (selectedGame && isPartyGame(selectedGame) && roomPartyGame) {
      roomPartyGame.players.forEach((p) => p && push(p.userId, p.name, p.avatar, p.isBot));
    } else if (activeBoardState) {
      [activeBoardState.players.w, activeBoardState.players.b].forEach(
        (p) => p && push(p.userId, p.name, p.avatar, p.isBot)
      );
    }
    if (list.length === 0) {
      push(currentUser.id, currentUser.name, currentUser.avatar, false);
    }
    return list;
  };

  const handleSwitchGameInPlace = (targetId: UnifiedGameId) => {
    triggerHaptic('medium');
    setShowGameSwitcher(false);
    if (targetId === selectedGame) return;
    setLocalMoveErr(null);

    if (hubMode === 'offline') {
      setSelectedGame(targetId);
      if (isBoardGameId(targetId)) {
        setLocalBoardGame(makeOfflineBoardState(targetId, 'w'));
      } else {
        setLocalBoardGame(null);
      }
      return;
    }

    setSelectedGame(targetId);
    if (onSwitchRoomGame) {
      onSwitchRoomGame(targetId);
    } else {
      openGameCard(targetId);
    }
  };

  const isLiveGame = (gt: UnifiedGameId) => {
    if (gt === 'pool') return Boolean(roomPoolGame);
    if (gt === 'pinturillo') return Boolean(roomPinturilloGame);
    if (gt === 'chapas') return Boolean(roomChapasGame);
    if (gt === 'headsoccer') return Boolean(roomHeadSoccerGame);
    if (gt === 'poker') return Boolean(roomPokerGame);
    if (gt === 'blackjack') return Boolean(roomBlackjackGame);
    if (isPartyGame(gt)) return roomPartyGame?.gameType === gt;
    return roomBoardGame?.gameType === gt;
  };

  return {
    selectedGame,
    showGameSwitcher,
    setShowGameSwitcher,
    localBoardGame,
    setLocalBoardGame,
    localMoveErr,
    setLocalMoveErr,
    inviteCopied,
    handleInviteGame,
    makeOfflineBoardState,
    openGameCard,
    handleBackToGames,
    switchModeForActiveGame,
    handleJoinOfflineBoardSeat,
    getActiveSeatedPlayers,
    handleSwitchGameInPlace,
    isLiveGame,
  };
}
