import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Share2,
  Shuffle,
  Users,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  BlackjackGameState,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  Participant,
  PinturilloGameState,
  PinturilloStroke,
  PokerActionType,
  PokerGameState,
  Pool8BallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
} from '../types';
import type { RoomMatchResponsesState } from '../shared/protocol';
import {
  BOARD_TURN_DECISION_MS,
  applyBoardMove,
  chooseAutoBoardMove,
  createInitialBoardGameState,
  resetBoardGame,
  resignBoardGame,
  startBoardMatch,
} from '../shared/boardGames';
import { type PartyColor, type PartyGameState, type PartyGameType } from '../shared/partyGames';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { RoomBoardGamePanel } from './RoomBoardGamePanel';
import { PartyGamesStage, type PartyOnlineAction } from './PartyGamesStage';
import { PinturilloStage } from './PinturilloStage';
import { Pool8BallStage } from './Pool8BallStage';
import { FutbolChapasStage } from './FutbolChapasStage';
import { HeadSoccerStage } from './HeadSoccerStage';
import { PokerHoldemStage } from './PokerHoldemStage';
import { BlackjackStage } from './BlackjackStage';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  useGameFloatingReaction,
  useGameSoundMute,
} from './games/GameEffects';
import { VoiceWaveBars } from './games/GameVoiceBar';
import { GamesHubLobby } from './games/GamesHubLobby';
import type { UnifiedGameId } from './games/GameLogos';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { buildGameInviteUrl } from '../utils/shortLink';

interface GamesHubSectionProps {
  lang: AppLanguage;
  roomId?: string;
  currentUser: Participant;
  participants: Participant[];
  roomBoardGame: BoardGameState | null;
  roomPartyGame: PartyGameState | null;
  roomPinturilloGame?: PinturilloGameState | null;
  roomPoolGame?: Pool8BallState | null;
  roomChapasGame?: FutbolChapasState | null;
  roomHeadSoccerGame?: HeadSoccerOnlineState | null;
  headSoccerSyncSnapshot?: { seq: number; sim: HeadSoccerSimulation } | null;
  headSoccerPeerInput?: { side: 0 | 1; input: HeadSoccerInput; seq: number } | null;
  roomPokerGame?: PokerGameState | null;
  roomBlackjackGame?: BlackjackGameState | null;
  matchResponses?: RoomMatchResponsesState | null;
  gameMoveError?: string | null;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  requestedGameOpen?: { gameType: UnifiedGameId; seq: number } | null;
  onSelectedGameChange?: (game: UnifiedGameId | null) => void;
  onSwitchRoomGame?: (game: UnifiedGameId) => void;
  onStartRoomBoardGame?: (gt: BoardGameType, soloLocal?: boolean, clockMinutes?: BoardClockMinutes) => void;
  onJoinBoardSeat?: (side: 'w' | 'b' | 'spectate') => void;
  onStartBoardMatch?: () => void;
  onMoveBoardGame?: (from: BoardCoord, to: BoardCoord, promo?: ChessPromotionPiece) => void;
  onResignBoardGame?: () => void;
  onResetBoardGame?: (opts?: { gameType?: BoardGameType; swapColors?: boolean; clockMinutes?: BoardClockMinutes }) => void;
  onCloseBoardGame?: () => void;
  onStartRoomPartyGame?: (gt: PartyGameType) => void;
  onRoomPartyAction?: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  onCloseRoomPartyGame?: () => void;
  onStartRoomPinturillo?: () => void;
  onStartPinturilloMatch?: () => void;
  onPinturilloPickWord?: (wordId: string) => void;
  onPinturilloStroke?: (stroke: PinturilloStroke) => void;
  onPinturilloUndo?: () => void;
  onPinturilloClear?: () => void;
  onPinturilloGuess?: (text: string) => void;
  onPinturilloRematch?: () => void;
  onCloseRoomPinturillo?: () => void;
  onStartRoomPool?: (difficulty?: PoolDifficulty) => void;
  onStartPoolMatch?: () => void;
  onPoolJoinSeat?: (seatIndex: 0 | 1 | 'spectate') => void;
  onPoolCallPocket?: (pocketId: PoolPocketId) => void;
  onPoolPlaceCue?: (x: number, y: number) => void;
  onPoolTakeShot?: (shot: PoolShotInput) => void;
  onPoolSyncChecksum?: (turnNumber: number, checksum: number) => void;
  onPoolForfeit?: () => void;
  onPoolRematch?: () => void;
  onCloseRoomPool?: () => void;
  onStartRoomChapas?: (opts?: { botsEnabled?: boolean }) => void;
  onChapasJoinSeat?: (seatIndex: 0 | 1 | 2 | 3 | 'spectate') => void;
  onChapasUpdateTeam?: (team: ChapasTeamId, flag: ChapasFlagId) => void;
  onChapasToggleBots?: (botsEnabled: boolean) => void;
  onChapasStartMatch?: () => void;
  onChapasShoot?: (shot: ChapasShotInput) => void;
  onChapasForfeit?: () => void;
  onChapasRematch?: () => void;
  onCloseRoomChapas?: () => void;
  onStartRoomHeadSoccer?: () => void;
  onHeadSoccerJoinSeat?: (seatIndex: 0 | 1 | 'spectate') => void;
  onHeadSoccerSelectSkin?: (skinId: HeadSoccerSkinId) => void;
  onHeadSoccerStartMatch?: () => void;
  onHeadSoccerInput?: (side: 0 | 1, input: HeadSoccerInput) => void;
  onHeadSoccerSyncState?: (sim: HeadSoccerSimulation) => void;
  onHeadSoccerRematch?: () => void;
  onCloseRoomHeadSoccer?: () => void;
  onStartRoomPoker?: (botsEnabled?: boolean) => void;
  onPokerJoinSeat?: (seatIndex?: number | 'spectate') => void;
  onPokerToggleBots?: (botsEnabled: boolean) => void;
  onPokerStartMatch?: () => void;
  onPokerAction?: (action: PokerActionType, raiseTo?: number) => void;
  onPokerRebuy?: () => void;
  onCloseRoomPoker?: () => void;
  onStartRoomBlackjack?: () => void;
  onBlackjackJoinSeat?: (seatIndex?: number | 'spectate') => void;
  onBlackjackBet?: (op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }) => void;
  onBlackjackDeal?: () => void;
  onBlackjackAction?: (action: 'hit' | 'stand' | 'double' | 'split') => void;
  onBlackjackNewRound?: () => void;
  onCloseRoomBlackjack?: () => void;
}

function isPartyGame(id: UnifiedGameId): id is PartyGameType {
  return id === 'parchis' || id === 'uno';
}

function isBoardGameId(id: UnifiedGameId): id is BoardGameType {
  return id === 'chess' || id === 'checkers' || id === 'connect4';
}

export const GamesHubSection: React.FC<GamesHubSectionProps> = ({
  lang,
  roomId = '',
  currentUser,
  participants,
  roomBoardGame,
  roomPartyGame,
  roomPinturilloGame = null,
  roomPoolGame = null,
  roomChapasGame = null,
  roomHeadSoccerGame = null,
  headSoccerSyncSnapshot = null,
  headSoccerPeerInput = null,
  roomPokerGame = null,
  roomBlackjackGame = null,
  matchResponses = null,
  gameMoveError = null,
  isHost = false,
  voiceChat,
  requestedGameOpen = null,
  onSelectedGameChange,
  onSwitchRoomGame,
  onStartRoomBoardGame,
  onJoinBoardSeat,
  onStartBoardMatch,
  onMoveBoardGame,
  onResignBoardGame,
  onResetBoardGame,
  onCloseBoardGame,
  onStartRoomPartyGame,
  onRoomPartyAction,
  onCloseRoomPartyGame,
  onStartRoomPinturillo,
  onStartPinturilloMatch,
  onPinturilloPickWord,
  onPinturilloStroke,
  onPinturilloUndo,
  onPinturilloClear,
  onPinturilloGuess,
  onPinturilloRematch,
  onCloseRoomPinturillo,
  onStartRoomPool,
  onStartPoolMatch,
  onPoolJoinSeat,
  onPoolCallPocket,
  onPoolPlaceCue,
  onPoolTakeShot,
  onPoolSyncChecksum,
  onPoolForfeit,
  onPoolRematch,
  onCloseRoomPool,
  onStartRoomChapas,
  onChapasJoinSeat,
  onChapasUpdateTeam,
  onChapasToggleBots,
  onChapasStartMatch,
  onChapasShoot,
  onChapasForfeit,
  onChapasRematch,
  onCloseRoomChapas,
  onStartRoomHeadSoccer,
  onHeadSoccerJoinSeat,
  onHeadSoccerSelectSkin,
  onHeadSoccerStartMatch,
  onHeadSoccerInput,
  onHeadSoccerSyncState,
  onHeadSoccerRematch,
  onCloseRoomHeadSoccer,
  onStartRoomPoker,
  onPokerJoinSeat,
  onPokerToggleBots,
  onPokerStartMatch,
  onPokerAction,
  onPokerRebuy,
  onCloseRoomPoker,
  onStartRoomBlackjack,
  onBlackjackJoinSeat,
  onBlackjackBet,
  onBlackjackDeal,
  onBlackjackAction,
  onBlackjackNewRound,
  onCloseRoomBlackjack,
}) => {
  const [selectedGame, setSelectedGame] = useState<UnifiedGameId | null>(null);
  const [showGameSwitcher, setShowGameSwitcher] = useState(false);
  const [hubMode, setHubMode] = useState<'offline' | 'online'>('online');
  const [localBoardGame, setLocalBoardGame] = useState<BoardGameState | null>(null);
  const [localMoveErr, setLocalMoveErr] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [muted, toggleMute] = useGameSoundMute();
  const { floatingReaction, sendReaction } = useGameFloatingReaction(hubMode === 'offline');

  const handleInviteGame = async (gt: UnifiedGameId) => {
    triggerHaptic('medium');
    const url = roomId ? buildGameInviteUrl(roomId, gt) : typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    const shareTitle = `RiffanTV · ${gt.toUpperCase()}`;
    const shareText = pickLang(lang, {
      es: `¡Únete a mi partida de ${gt} en RiffanTV! Solo pon tu nombre y a jugar:`,
      ca: `Uneix-te a la meva partida de ${gt} a RiffanTV! Només posa el teu nom i a jugar:`,
      en: `Join my ${gt} match on RiffanTV! Just enter your name to play:`,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url });
        return;
      } catch {
        // user canceled or unsupported -> fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2600);
    } catch {
      // ignore clipboard errors
    }
  };

  useEffect(() => {
    onSelectedGameChange?.(selectedGame);
  }, [selectedGame, onSelectedGameChange]);

  useEffect(() => {
    return () => {
      onSelectedGameChange?.(null);
    };
  }, [onSelectedGameChange]);

  const lastHandledRequestSeqRef = React.useRef<number>(0);
  useEffect(() => {
    if (!requestedGameOpen || requestedGameOpen.seq === lastHandledRequestSeqRef.current) return;
    lastHandledRequestSeqRef.current = requestedGameOpen.seq;
    setHubMode('online');
    setLocalMoveErr(null);
    setSelectedGame(requestedGameOpen.gameType);
  }, [requestedGameOpen]);

  // Close switcher dropdown when game changes or Escape is pressed
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

  // Keep players synchronized seamlessly when room switches games or closes
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

  // Offline AI Bot turn + 15s human decision auto-move
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

  // Lock body scroll while progressive single-game board view is active
  useEffect(() => {
    if (!selectedGame || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedGame]);

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

    if (gt === 'chapas') {
      if (!roomChapasGame) {
        onStartRoomChapas?.();
      }
    } else if (gt === 'headsoccer') {
      if (!roomHeadSoccerGame) {
        onStartRoomHeadSoccer?.();
      }
    } else if (gt === 'poker') {
      if (!roomPokerGame) {
        onStartRoomPoker?.(true);
      }
    } else if (gt === 'blackjack') {
      if (!roomBlackjackGame) {
        onStartRoomBlackjack?.();
      }
    } else if (gt === 'pinturillo') {
      if (!roomPinturilloGame) {
        onStartRoomPinturillo?.();
      }
    } else if (gt === 'pool') {
      if (!roomPoolGame) {
        onStartRoomPool?.();
      }
    } else if (isPartyGame(gt)) {
      if (!roomPartyGame || roomPartyGame.gameType !== gt) {
        onStartRoomPartyGame?.(gt);
      }
    } else if (isBoardGameId(gt)) {
      if (!roomBoardGame || roomBoardGame.gameType !== gt) {
        onStartRoomBoardGame?.(gt, false, 0);
      }
    }
  };

  const handleBackToGames = () => {
    triggerHaptic('light');
    if (selectedGame) {
      if (hubMode === 'offline') {
        setLocalBoardGame(null);
        setLocalMoveErr(null);
      } else if (selectedGame === 'chapas') {
        if (isHost && roomChapasGame) {
          onCloseRoomChapas?.();
        }
      } else if (selectedGame === 'headsoccer') {
        if (isHost && roomHeadSoccerGame) {
          onCloseRoomHeadSoccer?.();
        }
      } else if (selectedGame === 'poker') {
        if (isHost && roomPokerGame) {
          onCloseRoomPoker?.();
        }
      } else if (selectedGame === 'blackjack') {
        if (isHost && roomBlackjackGame) {
          onCloseRoomBlackjack?.();
        }
      } else if (selectedGame === 'pinturillo') {
        if (isHost && roomPinturilloGame) {
          onCloseRoomPinturillo?.();
        }
      } else if (selectedGame === 'pool') {
        if (isHost && roomPoolGame) {
          onCloseRoomPool?.();
        }
      } else if (isPartyGame(selectedGame)) {
        if (isHost && roomPartyGame?.gameType === selectedGame) {
          onCloseRoomPartyGame?.();
        }
      } else if (isHost && roomBoardGame?.gameType === selectedGame) {
        onCloseBoardGame?.();
      }
    }
    setSelectedGame(null);
  };

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
      if (selectedGame === 'chapas') {
        if (!roomChapasGame) {
          onStartRoomChapas?.();
        }
      } else if (selectedGame === 'headsoccer') {
        if (!roomHeadSoccerGame) {
          onStartRoomHeadSoccer?.();
        }
      } else if (selectedGame === 'poker') {
        if (!roomPokerGame) {
          onStartRoomPoker?.(true);
        }
      } else if (selectedGame === 'blackjack') {
        if (!roomBlackjackGame) {
          onStartRoomBlackjack?.();
        }
      } else if (selectedGame === 'pinturillo') {
        if (!roomPinturilloGame) {
          onStartRoomPinturillo?.();
        }
      } else if (selectedGame === 'pool') {
        if (!roomPoolGame) {
          onStartRoomPool?.();
        }
      } else if (isPartyGame(selectedGame)) {
        if (!roomPartyGame || roomPartyGame.gameType !== selectedGame) {
          onStartRoomPartyGame?.(selectedGame);
        }
      } else if (isBoardGameId(selectedGame)) {
        if (!roomBoardGame || roomBoardGame.gameType !== selectedGame) {
          onStartRoomBoardGame?.(selectedGame, false, 0);
        }
      }
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

  // ==========================================================================
  // PROGRESSIVE SINGLE-GAME SCREEN (AFTER TAPPING A GAME CARD)
  // ==========================================================================
  if (selectedGame) {
    const isParty = isPartyGame(selectedGame);
    const isPinturillo = selectedGame === 'pinturillo';
    const isPool = selectedGame === 'pool';
    const isChapas = selectedGame === 'chapas';
    const isHeadSoccer = selectedGame === 'headsoccer';
    const isPoker = selectedGame === 'poker';
    const isBlackjack = selectedGame === 'blackjack';
    const activeBoardState =
      !isParty && !isPinturillo && !isPool && !isChapas && !isHeadSoccer && !isPoker && !isBlackjack
        ? hubMode === 'offline'
          ? localBoardGame
          : roomBoardGame?.gameType === selectedGame
          ? roomBoardGame
          : null
        : null;

    const titleMap: Record<UnifiedGameId, string> = {
      parchis: pickLang(lang, { es: '🎲 Parchís', ca: '🎲 Parxís', en: '🎲 Parchís' }),
      uno: '🃏 UNO',
      pinturillo: '🎨 Pinturillo',
      pool: pickLang(lang, { es: '🎱 Billar Bola 8', ca: '🎱 Billar Bola 8', en: '🎱 8-Ball Pool' }),
      chapas: pickLang(lang, { es: '⚽ Fútbol Chapas', ca: '⚽ Futbol Xapes', en: '⚽ Soccer Caps' }),
      headsoccer: pickLang(lang, { es: '🥅 Fútbol Cabezones', ca: '🥅 Futbol Capgrossos', en: '🥅 Head Soccer' }),
      poker: pickLang(lang, { es: '♠️ Póker Hold’em', ca: '♠️ Pòquer Hold’em', en: '♠️ Texas Hold’em' }),
      blackjack: '🃏 Blackjack 21',
      chess: pickLang(lang, { es: '♟️ Ajedrez', ca: '♟️ Escacs', en: '♟️ Chess' }),
      checkers: pickLang(lang, { es: '🔴 Damas', ca: '🔴 Dames', en: '🔴 Checkers' }),
      connect4: pickLang(lang, { es: '🟡 Conecta 4', ca: '🟡 Connecta 4', en: '🟡 Connect 4' }),
    };

    const poolMySeat =
      hubMode === 'online' && roomPoolGame
        ? roomPoolGame.players[0]?.userId === currentUser.id
          ? roomPoolGame.players[0]
          : roomPoolGame.players[1]?.userId === currentUser.id
          ? roomPoolGame.players[1]
          : null
        : null;
    const poolGroupShort =
      poolMySeat?.group === 'solids'
        ? pickLang(lang, { es: 'Lisas', ca: 'Llises', en: 'Solids' })
        : poolMySeat?.group === 'stripes'
        ? pickLang(lang, { es: 'Rayadas', ca: 'Ratllades', en: 'Stripes' })
        : pickLang(lang, { es: 'Abierta', ca: 'Oberta', en: 'Open' });

    const renderVoiceCompact = (ultraCompact = false) => {
      if (!voiceChat) return null;
      const isLocalSpeaking =
        voiceChat.isJoined &&
        !voiceChat.isMuted &&
        (voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0);
      const voicePeerCount = voiceChat.voicePeers.length;

      return (
        <div className="flex items-center gap-1 shrink-0">
          {voiceChat.isJoined ? (
            <>
              <button
                type="button"
                aria-pressed={voiceChat.isMuted}
                onClick={() => {
                  triggerHaptic('light');
                  voiceChat.toggleMute();
                }}
                className={`${
                  ultraCompact ? 'h-7 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]'
                } rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap border cursor-pointer transition-all shrink-0 ${
                  voiceChat.isMuted
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/55 text-rose-200'
                    : isLocalSpeaking
                    ? 'bg-emerald-500/30 hover:bg-emerald-500/40 border-emerald-300 text-emerald-100 ring-2 ring-emerald-400/75 shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50 text-emerald-200'
                }`}
              >
                {voiceChat.isMuted ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {ultraCompact
                        ? 'Mute'
                        : pickLang(lang, { es: 'Silenciado', ca: 'Silenciat', en: 'Muted' })}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <VoiceWaveBars active={isLocalSpeaking} level={voiceChat.localAudioLevel} size="sm" />
                    <span className={ultraCompact ? 'hidden sm:inline' : 'inline'}>
                      {voiceChat.localAudioLevel > 0.08
                        ? pickLang(lang, { es: 'Hablando', ca: 'Parlant', en: 'Speaking' })
                        : pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
                    </span>
                    {voicePeerCount > 1 && (
                      <span className="px-1 rounded bg-black/30 text-[9px] font-mono tabular-nums text-emerald-100">
                        {voicePeerCount}
                      </span>
                    )}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  voiceChat.leaveVoice();
                }}
                aria-label={pickLang(lang, {
                  es: 'Colgar voz',
                  ca: 'Penjar veu',
                  en: 'Leave voice',
                })}
                title={pickLang(lang, {
                  es: 'Colgar voz',
                  ca: 'Penjar veu',
                  en: 'Leave voice',
                })}
                className="w-7 h-7 rounded-lg bg-white/[0.07] hover:bg-rose-500/25 border border-white/[0.12] flex items-center justify-center text-zinc-200 hover:text-rose-200 cursor-pointer shrink-0 transition-colors"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={voiceChat.status === 'requesting'}
              onClick={() => {
                triggerHaptic('medium');
                void voiceChat.joinVoice();
              }}
              className={`${
                ultraCompact ? 'h-7 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]'
              } rounded-lg bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-65 font-bold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0`}
            >
              {voiceChat.status === 'requesting' ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <PhoneCall className="w-3 h-3 shrink-0" />
              )}
              <span>
                {voiceChat.status === 'requesting'
                  ? '...'
                  : ultraCompact
                  ? 'Voz'
                  : pickLang(lang, { es: 'Abrir voz', ca: 'Obrir veu', en: 'Voice' })}
              </span>
            </button>
          )}
        </div>
      );
    };

    const GAME_SIGNATURES: Record<UnifiedGameId, { color: string; label: string }> = {
      parchis: { color: '#F59E0B', label: 'Parchís' },
      uno: { color: '#E11D48', label: 'UNO' },
      pinturillo: { color: '#EC4899', label: 'Pinturillo' },
      pool: { color: '#10B981', label: 'Billar' },
      chapas: { color: '#84CC16', label: 'Fútbol Chapas' },
      headsoccer: { color: '#38BDF8', label: 'Cabezones' },
      poker: { color: '#A855F7', label: 'Póker' },
      blackjack: { color: '#10B981', label: 'Blackjack' },
      chess: { color: '#9146FF', label: 'Ajedrez' },
      checkers: { color: '#F43F5E', label: 'Damas' },
      connect4: { color: '#3B82F6', label: 'Conecta 4' },
    };

    const switcherOptions: Array<{
      id: UnifiedGameId;
      label: string;
      subtitle: string;
      color: string;
    }> = [
      { id: 'headsoccer', label: titleMap.headsoccer, subtitle: '1v1 · 60s', color: GAME_SIGNATURES.headsoccer.color },
      { id: 'pool', label: titleMap.pool, subtitle: '1v1 · Bola 8', color: GAME_SIGNATURES.pool.color },
      { id: 'chapas', label: titleMap.chapas, subtitle: '1v1 / 2v2', color: GAME_SIGNATURES.chapas.color },
      { id: 'poker', label: titleMap.poker, subtitle: '2–6 jug.', color: GAME_SIGNATURES.poker.color },
      { id: 'blackjack', label: titleMap.blackjack, subtitle: '21 Casino', color: GAME_SIGNATURES.blackjack.color },
      { id: 'uno', label: titleMap.uno, subtitle: '2–4 jug.', color: GAME_SIGNATURES.uno.color },
      { id: 'parchis', label: titleMap.parchis, subtitle: '2–4 jug.', color: GAME_SIGNATURES.parchis.color },
      { id: 'pinturillo', label: titleMap.pinturillo, subtitle: 'Dibuja', color: GAME_SIGNATURES.pinturillo.color },
      { id: 'chess', label: titleMap.chess, subtitle: '1v1 Tablero', color: GAME_SIGNATURES.chess.color },
      { id: 'checkers', label: titleMap.checkers, subtitle: '1v1 Tablero', color: GAME_SIGNATURES.checkers.color },
      { id: 'connect4', label: titleMap.connect4, subtitle: '1v1 Tablero', color: GAME_SIGNATURES.connect4.color },
    ];

    const getActiveSeatedPlayers = (): Array<{ id: string; name: string; avatar: string }> => {
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
      } else if (isParty && roomPartyGame) {
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

    const activeSeatedPlayers = showGameSwitcher ? getActiveSeatedPlayers() : [];

    return (
      <div
        data-game-fullscreen="true"
        className="fixed inset-0 z-[185] h-[100dvh] w-full max-w-[100vw] bg-[#070B14] nc-tabletop-slate overflow-hidden flex flex-col pt-safe pb-safe"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-1.5 sm:p-3 max-w-5xl w-full mx-auto gap-1.5">
          {/* Unified Ultra-Clean Glassmorphism Bar: ← Juegos | Switcher Title | Online/IA Pill | Mute | Voz */}
          <div
            className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-2xl nc-arcade-glass border border-white/[0.12] shrink-0 min-w-0"
            style={{
              boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 18px ${GAME_SIGNATURES[selectedGame].color}22`,
            }}
          >
            <button
              type="button"
              onClick={handleBackToGames}
              aria-label={pickLang(lang, { es: 'Volver a Juegos', ca: 'Tornar a Jocs', en: 'Back to Games' })}
              className="h-8 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.12] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
              </span>
            </button>

            <div className="flex items-center gap-1.5 min-w-0 flex-1 px-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowGameSwitcher((v) => !v);
                }}
                aria-expanded={showGameSwitcher}
                aria-label={pickLang(lang, {
                  es: 'Cambiar de juego sin salir',
                  ca: 'Canviar de joc sense sortir',
                  en: 'Switch game without leaving',
                })}
                className="flex items-center gap-1.5 min-w-0 max-w-full px-2 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] cursor-pointer active:scale-[0.98] transition-all"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                  style={{
                    backgroundColor: GAME_SIGNATURES[selectedGame].color,
                    boxShadow: `0 0 10px ${GAME_SIGNATURES[selectedGame].color}`,
                  }}
                />
                <span className="text-xs sm:text-sm font-extrabold text-white truncate tracking-tight">
                  {titleMap[selectedGame]}
                </span>
                <span className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[10px] font-bold text-zinc-300 shrink-0">
                  <Shuffle className="w-2.5 h-2.5" />
                  {pickLang(lang, { es: 'Cambiar', ca: 'Canviar', en: 'Switch' })}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-300 shrink-0 transition-transform duration-200 ${
                    showGameSwitcher ? 'rotate-180 text-[#D8B4FE]' : ''
                  }`}
                />
              </button>
              {isPool && hubMode === 'online' && roomPoolGame && (
                <span className="text-[10px] font-bold text-emerald-300 truncate hidden sm:inline">
                  · {poolGroupShort}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Animated Sliding Pill for Online vs IA */}
              <div className="flex items-center p-0.5 rounded-xl bg-zinc-950/80 border border-white/[0.1] shadow-inner">
                <button
                  type="button"
                  onClick={() => switchModeForActiveGame('online')}
                  className={`h-6.5 px-2 rounded-lg text-[10px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                    hubMode === 'online'
                      ? 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">
                    {isPool ? '1v1' : 'Online'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => switchModeForActiveGame('offline')}
                  className={`h-6.5 px-2 rounded-lg text-[10px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                    hubMode === 'offline'
                      ? 'bg-gradient-to-r from-[#9146FF] to-[#7E22CE] text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Bot className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">IA</span>
                </button>
              </div>
              {!isChapas && (
                <GameReactionButton
                  lang={lang}
                  compact
                  onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
                />
              )}
              <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
              {roomId && (
                <button
                  type="button"
                  onClick={() => void handleInviteGame(selectedGame)}
                  aria-label={pickLang(lang, { es: 'Invitar a la partida', ca: 'Convidar a la partida', en: 'Invite to match' })}
                  className={`h-7 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0 ${
                    inviteCopied
                      ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
                      : 'bg-[#9146FF] hover:bg-[#7C2AE8] border-[#9146FF] text-white shadow-[0_2px_12px_rgba(145,70,255,0.4)]'
                  }`}
                >
                  {inviteCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })}</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden xs:inline sm:inline">
                        {pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}
                      </span>
                    </>
                  )}
                </button>
              )}
              {renderVoiceCompact(true)}
            </div>
          </div>

          {!isChapas && (
            <GameFloatingReactionToast reaction={floatingReaction} className="top-14 right-3" />
          )}

          {voiceChat?.errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-amber-400/45 bg-amber-500/12 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-100 shrink-0"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="leading-snug truncate sm:whitespace-normal">{voiceChat.errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  void voiceChat.joinVoice();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-400/25 hover:bg-amber-400/35 border border-amber-300/45 text-[10px] font-bold text-amber-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
              </button>
            </div>
          )}

          {/* Live Invitee Responses Banner while match waits in Lobby */}
          {hubMode === 'online' &&
            matchResponses &&
            matchResponses.gameType === selectedGame &&
            matchResponses.responses.length > 0 &&
            ((selectedGame === 'chapas' && roomChapasGame?.status === 'waiting') ||
              (selectedGame === 'headsoccer' && roomHeadSoccerGame?.status === 'waiting') ||
              (selectedGame === 'poker' && roomPokerGame?.status === 'waiting') ||
              (selectedGame === 'blackjack' && roomBlackjackGame?.phase === 'betting') ||
              (selectedGame === 'pool' && roomPoolGame?.status === 'waiting') ||
              (selectedGame === 'pinturillo' && roomPinturilloGame?.status === 'waiting') ||
              (isParty && roomPartyGame?.gameType === selectedGame && roomPartyGame.status === 'waiting') ||
              (isBoardGameId(selectedGame) && roomBoardGame?.gameType === selectedGame && roomBoardGame.status === 'waiting')) && (
              <div className="rounded-xl border border-purple-400/35 bg-purple-500/12 px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0 overflow-x-auto no-scrollbar">
                <span className="font-bold text-purple-200 whitespace-nowrap shrink-0">
                  {pickLang(lang, { es: 'Invitaciones:', ca: 'Invitacions:', en: 'Invites:' })}
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  {matchResponses.responses.map((r) => (
                    <span
                      key={r.userId}
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold whitespace-nowrap ${
                        r.status === 'accepted'
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                          : r.status === 'declined'
                          ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                          : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                      }`}
                    >
                      {r.userName}:{' '}
                      {r.status === 'accepted'
                        ? pickLang(lang, { es: 'Aceptó', ca: 'Acceptat', en: 'Joined' })
                        : r.status === 'declined'
                        ? pickLang(lang, { es: 'No ahora', ca: 'Ara no', en: 'Declined' })
                        : pickLang(lang, { es: 'Esperando…', ca: 'Esperant…', en: 'Waiting…' })}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {/* Single Game Stage */}
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar">
            {isHeadSoccer ? (
              <HeadSoccerStage
                key={`headsoccer-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                headSoccerState={hubMode === 'offline' ? null : roomHeadSoccerGame}
                latestSyncSnapshot={headSoccerSyncSnapshot}
                remotePeerInput={headSoccerPeerInput}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={() => onStartRoomHeadSoccer?.()}
                onJoinSeatOnline={onHeadSoccerJoinSeat}
                onSelectSkinOnline={onHeadSoccerSelectSkin}
                onStartMatchOnline={onHeadSoccerStartMatch}
                onSendInputOnline={onHeadSoccerInput}
                onSendSyncStateOnline={onHeadSoccerSyncState}
                onRematchOnline={onHeadSoccerRematch}
              />
            ) : isPoker ? (
              <PokerHoldemStage
                key={`poker-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                pokerState={hubMode === 'offline' ? null : roomPokerGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={onStartRoomPoker}
                onJoinSeatOnline={onPokerJoinSeat}
                onToggleBotsOnline={onPokerToggleBots}
                onStartMatchOnline={onPokerStartMatch}
                onActionOnline={onPokerAction}
                onRebuyOnline={onPokerRebuy}
              />
            ) : isBlackjack ? (
              <BlackjackStage
                key={`blackjack-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                blackjackState={hubMode === 'offline' ? null : roomBlackjackGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={() => onStartRoomBlackjack?.()}
                onJoinSeatOnline={onBlackjackJoinSeat}
                onBetOnline={onBlackjackBet}
                onDealOnline={onBlackjackDeal}
                onActionOnline={onBlackjackAction}
                onNewRoundOnline={onBlackjackNewRound}
              />
            ) : isChapas ? (
              <FutbolChapasStage
                key={`chapas-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                chapasState={hubMode === 'offline' ? null : roomChapasGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={() => onStartRoomChapas?.()}
                onJoinSeatOnline={onChapasJoinSeat}
                onUpdateTeamOnline={onChapasUpdateTeam}
                onToggleBotsOnline={onChapasToggleBots}
                onStartMatchOnline={onChapasStartMatch}
                onShootOnline={onChapasShoot}
                onForfeitOnline={onChapasForfeit}
                onRematchOnline={onChapasRematch}
              />
            ) : isPool ? (
              <Pool8BallStage
                key={`pool-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                poolState={hubMode === 'offline' ? null : roomPoolGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={onStartRoomPool}
                onStartMatchOnline={onStartPoolMatch}
                onJoinSeatOnline={onPoolJoinSeat}
                onPlaceCueOnline={onPoolPlaceCue}
                onCallPocketOnline={onPoolCallPocket}
                onTakeShotOnline={onPoolTakeShot}
                onForfeitOnline={onPoolForfeit}
                onRematchOnline={onPoolRematch}
                onSyncChecksumOnline={onPoolSyncChecksum}
              />
            ) : isPinturillo ? (
              <PinturilloStage
                key={`pinturillo-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                pinturilloState={hubMode === 'offline' ? null : roomPinturilloGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={onStartRoomPinturillo}
                onStartMatchOnline={onStartPinturilloMatch}
                onPickWordOnline={onPinturilloPickWord}
                onSendStrokeOnline={onPinturilloStroke}
                onUndoOnline={onPinturilloUndo}
                onClearOnline={onPinturilloClear}
                onSendGuessOnline={onPinturilloGuess}
                onRematchOnline={onPinturilloRematch}
              />
            ) : isParty ? (
              <PartyGamesStage
                key={`${selectedGame}-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                partyGameState={hubMode === 'offline' ? null : roomPartyGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                fullScreenMode={true}
                voiceChat={voiceChat}
                initialOfflineGameType={hubMode === 'offline' ? selectedGame : null}
                hideHeaderChrome={true}
                hideVoiceBar={true}
                mutedOverride={muted}
                onToggleMuteOverride={toggleMute}
                onStartOnline={onStartRoomPartyGame}
                onOnlineAction={onRoomPartyAction}
                onCloseOnline={handleBackToGames}
              />
            ) : hubMode === 'offline' ? (
              <RoomBoardGamePanel
                key={`${selectedGame}-offline`}
                gameState={localBoardGame}
                currentUser={currentUser}
                lang={lang}
                moveError={localMoveErr}
                isOnlineRoom={false}
                isHost={true}
                fullScreenMode={true}
                hideGameSwitcher={true}
                hideVoiceBar={true}
                mutedOverride={muted}
                onToggleMuteOverride={toggleMute}
                onStartGame={(gt) => setLocalBoardGame(makeOfflineBoardState(gt, 'w'))}
                onJoinSeat={handleJoinOfflineBoardSeat}
                onStartMatch={() =>
                  setLocalBoardGame((curr) => (curr ? startBoardMatch(curr) : curr))
                }
                onMove={(from, to, promo) => {
                  if (!localBoardGame || localBoardGame.status !== 'playing') return;
                  const activeSeat = localBoardGame.players[localBoardGame.turn];
                  if (activeSeat?.userId !== currentUser.id) return;
                  const res = applyBoardMove(localBoardGame, currentUser.id, from, to, promo || 'Q');
                  if (!res.ok) {
                    setLocalMoveErr(res.error);
                    return;
                  }
                  setLocalMoveErr(null);
                  setLocalBoardGame(res.state);
                }}
                onResign={() => {
                  if (!localBoardGame) return;
                  const resigned = resignBoardGame(localBoardGame, currentUser.id);
                  if (resigned) setLocalBoardGame(resigned);
                }}
                onReset={(opts) => {
                  if (!localBoardGame) return;
                  setLocalMoveErr(null);
                  setLocalBoardGame(resetBoardGame(localBoardGame, opts));
                }}
                onCloseGame={handleBackToGames}
              />
            ) : (
              <RoomBoardGamePanel
                key={`${selectedGame}-online`}
                gameState={activeBoardState}
                currentUser={currentUser}
                lang={lang}
                moveError={gameMoveError}
                voiceChat={voiceChat}
                isOnlineRoom={true}
                isHost={isHost}
                fullScreenMode={true}
                hideGameSwitcher={true}
                hideVoiceBar={true}
                mutedOverride={muted}
                onToggleMuteOverride={toggleMute}
                onStartGame={(gt, solo, clockMin) => onStartRoomBoardGame?.(gt, solo, clockMin)}
                onJoinSeat={(side) => onJoinBoardSeat?.(side)}
                onStartMatch={onStartBoardMatch}
                onMove={(from, to, promo) => onMoveBoardGame?.(from, to, promo)}
                onResign={() => onResignBoardGame?.()}
                onReset={(opts) => onResetBoardGame?.(opts)}
                onCloseGame={handleBackToGames}
              />
            )}
          </div>
        </div>

        {/* In-Game Switcher Modal (switches game seamlessly preserving seated players) */}
        {showGameSwitcher && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pickLang(lang, {
              es: 'Cambiar de juego sin salir',
              ca: 'Canviar de joc sense sortir',
              en: 'Switch game without leaving',
            })}
            className="fixed inset-0 z-[195] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-2.5 sm:p-4 animate-fade-in"
            onClick={() => setShowGameSwitcher(false)}
          >
            <div
              className="w-full max-w-lg rounded-3xl bg-[#10121E]/95 border border-white/[0.14] shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[84dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Shuffle className="w-4 h-4 text-[#BF94FF] shrink-0" />
                    <h3 className="font-display font-extrabold text-sm sm:text-base text-white truncate">
                      {pickLang(lang, {
                        es: 'Cambiar de juego',
                        ca: 'Canviar de joc',
                        en: 'Switch game',
                      })}
                    </h3>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {pickLang(lang, {
                      es: 'Cambia al instante sin salir · Se mantienen los jugadores en mesa',
                      ca: 'Canvia a l’instant sense sortir · Es mantenen els jugadors a taula',
                      en: 'Switch instantly without exiting · Seated players stay together',
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGameSwitcher(false)}
                  aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
                  className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Seated players strip */}
              {activeSeatedPlayers.length > 0 && (
                <div className="px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 whitespace-nowrap shrink-0">
                    {pickLang(lang, {
                      es: 'En mesa:',
                      ca: 'A taula:',
                      en: 'Seated:',
                    })}
                  </span>
                  {activeSeatedPlayers.map((p) => (
                    <span
                      key={p.id}
                      className="px-2 py-0.5 rounded-lg bg-white/[0.07] border border-white/[0.1] text-[11px] font-semibold text-zinc-100 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>{p.avatar}</span>
                      <span className="max-w-[96px] truncate">{p.name}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Games Grid */}
              <div className="p-3 overflow-y-auto custom-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-2">
                {switcherOptions.map((opt) => {
                  const isCurrent = opt.id === selectedGame;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSwitchGameInPlace(opt.id)}
                      className={`p-2.5 rounded-2xl border text-left flex flex-col gap-1 cursor-pointer active:scale-[0.97] transition-all ${
                        isCurrent
                          ? 'bg-[#9146FF]/20 border-[#9146FF] shadow-[0_0_16px_rgba(145,70,255,0.28)]'
                          : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.09] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
                        />
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded bg-[#9146FF] text-[9px] font-black uppercase text-white">
                            {pickLang(lang, { es: 'Actual', ca: 'Actual', en: 'Playing' })}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold text-white truncate">
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-zinc-400 truncate">
                        {opt.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // REDESIGNED RIFFANTV ARCADE & TABLETOP LOUNGE
  // ==========================================================================
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

  return (
    <GamesHubLobby
      lang={lang}
      roomId={roomId}
      participants={participants}
      hubMode={hubMode}
      onChangeHubMode={setHubMode}
      isLiveGame={isLiveGame}
      onOpenGame={openGameCard}
      onInviteGame={handleInviteGame}
      inviteCopied={inviteCopied}
    />
  );
};
