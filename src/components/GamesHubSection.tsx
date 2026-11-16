import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Dices,
  Gamepad2,
  Loader2,
  Mic,
  MicOff,
  Palette,
  PhoneCall,
  PhoneOff,
  Play,
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
import {
  type PartyColor,
  type PartyGameState,
  type PartyGameType,
} from '../shared/partyGames';
import { getUnoCardSvgSrc } from '../assets/uno';
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
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { buildGameInviteUrl } from '../utils/shortLink';

type UnifiedGameId =
  | 'parchis'
  | 'uno'
  | 'pinturillo'
  | 'pool'
  | 'chapas'
  | 'headsoccer'
  | 'poker'
  | 'blackjack'
  | 'chess'
  | 'checkers'
  | 'connect4';

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

const PARTY_COLOR_HEX: Record<PartyColor, { hex: string; short: string }> = {
  red: { hex: '#ef4444', short: 'R' },
  blue: { hex: '#3b82f6', short: 'A' },
  yellow: { hex: '#eab308', short: 'Am' },
  green: { hex: '#22c55e', short: 'V' },
};

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
  const [activeCategory, setActiveCategory] = useState<'all' | 'arcade' | 'party' | 'board'>('all');
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

  interface GameCatalogCard {
    id: UnifiedGameId;
    category: 'arcade' | 'party' | 'board';
    title: string;
    meta: string;
    supportsOffline: boolean;
    accentBorder: string;
    stageBg: string;
    renderStage: () => React.ReactNode;
  }

  const gameCatalog: GameCatalogCard[] = [
    {
      id: 'headsoccer',
      category: 'arcade',
      title: pickLang(lang, { es: 'Fútbol Cabezones', ca: 'Futbol Capgrossos', en: 'Head Soccer' }),
      meta: pickLang(lang, { es: 'Estadio 1v1 · 60s · IA', ca: 'Estadi 1v1 · 60s · IA', en: '1v1 Stadium · 60s · AI' }),
      supportsOffline: true,
      accentBorder: 'hover:border-sky-400/65',
      stageBg: 'from-[#0D1E3A] via-[#10263A] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-5 bg-emerald-700/80 border-t border-white/30" />
          <div className="relative z-10 flex items-end gap-3 pb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 border-2 border-zinc-950 flex items-center justify-center shadow-lg">
              <div className="w-full h-2 bg-[#9146FF] -mt-3" />
            </div>
            <span className="w-6 h-6 rounded-full bg-white border-2 border-zinc-900 shadow-md mb-1 flex items-center justify-center text-[10px]">
              ⚽
            </span>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-200 to-rose-400 border-2 border-zinc-950 flex items-center justify-center shadow-lg">
              <div className="w-full h-2 bg-rose-600 -mt-3" />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'poker',
      category: 'party',
      title: pickLang(lang, { es: 'Póker Hold’em', ca: 'Pòquer Hold’em', en: 'Texas Hold’em' }),
      meta: pickLang(lang, { es: 'No-Limit · 2–6 jug. · Bots', ca: 'No-Limit · 2–6 jug. · Bots', en: 'No-Limit · 2–6 pl. · Bots' }),
      supportsOffline: true,
      accentBorder: 'hover:border-purple-400/65',
      stageBg: 'from-[#2A1348] via-[#190B2E] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="flex items-center -space-x-2">
            <div className="w-10 h-14 rounded-lg bg-white border border-zinc-300 shadow-lg -rotate-12 p-1 flex flex-col justify-between text-zinc-950 font-black text-[10px]">
              <span>A♠</span>
              <span className="self-center text-base leading-none">♠</span>
            </div>
            <div className="w-10 h-14 rounded-lg bg-white border border-amber-300 shadow-xl rotate-12 p-1 flex flex-col justify-between text-rose-600 font-black text-[10px]">
              <span>K♥</span>
              <span className="self-center text-base leading-none">♥</span>
            </div>
          </div>
          <span className="absolute bottom-2 right-3 w-6 h-6 rounded-full bg-amber-400 border-2 border-dashed border-zinc-900 text-[9px] font-black text-zinc-950 flex items-center justify-center shadow-md">
            $
          </span>
        </div>
      ),
    },
    {
      id: 'blackjack',
      category: 'party',
      title: 'Blackjack 21',
      meta: pickLang(lang, { es: 'Casino vs Crupier · 3:2', ca: 'Casino vs Crupier · 3:2', en: 'Casino vs Dealer · 3:2' }),
      supportsOffline: true,
      accentBorder: 'hover:border-emerald-400/65',
      stageBg: 'from-[#0D3829] via-[#08241B] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="flex items-center -space-x-2">
            <div className="w-10 h-14 rounded-lg bg-white border border-zinc-300 shadow-lg -rotate-6 p-1 flex flex-col justify-between text-zinc-950 font-black text-[10px]">
              <span>A♠</span>
              <span className="self-center text-base leading-none">♠</span>
            </div>
            <div className="w-10 h-14 rounded-lg bg-white border border-emerald-300 shadow-xl rotate-6 p-1 flex flex-col justify-between text-rose-600 font-black text-[10px]">
              <span>J♦</span>
              <span className="self-center text-base leading-none">♦</span>
            </div>
          </div>
          <span className="absolute bottom-2 left-3 px-1.5 py-0.5 rounded-md bg-emerald-400 text-zinc-950 text-[10px] font-black shadow">
            21
          </span>
        </div>
      ),
    },
    {
      id: 'pool',
      category: 'arcade',
      title: pickLang(lang, { es: 'Billar Bola 8', ca: 'Billar Bola 8', en: '8-Ball Pool' }),
      meta: pickLang(lang, { es: '1v1 · Física pro · IA', ca: '1v1 · Física pro · IA', en: '1v1 · Pro physics · AI' }),
      supportsOffline: true,
      accentBorder: 'hover:border-emerald-400/60',
      stageBg: 'from-[#0B3B2E] via-[#082920] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="absolute inset-2 rounded-xl border-2 border-[#6B3F22]/70 bg-[#0D4A3A] shadow-inner">
            <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-black/90" />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-black/90" />
            <span className="absolute bottom-1 left-1 w-2.5 h-2.5 rounded-full bg-black/90" />
            <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-black/90" />
          </div>
          <div className="relative z-10 flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-white to-zinc-300 shadow-[0_4px_12px_rgba(0,0,0,0.6)]" />
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 via-zinc-950 to-black border border-white/20 flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.75)]">
              <span className="w-4 h-4 rounded-full bg-white text-[10px] font-black text-zinc-950 flex items-center justify-center leading-none">
                8
              </span>
            </span>
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 border border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.6)]" />
          </div>
        </div>
      ),
    },
    {
      id: 'chapas',
      category: 'arcade',
      title: pickLang(lang, { es: 'Fútbol Chapas', ca: 'Futbol Xapes', en: 'Soccer Caps' }),
      meta: pickLang(lang, { es: 'Estadio · 1v1 / 2v2 · IA', ca: 'Estadi · 1v1 / 2v2 · IA', en: 'Stadium · 1v1 / 2v2 · AI' }),
      supportsOffline: true,
      accentBorder: 'hover:border-lime-400/60',
      stageBg: 'from-[#1B4214] via-[#132E10] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <svg viewBox="0 0 180 90" className="w-full h-full" aria-hidden="true">
            <rect x="10" y="10" width="160" height="70" rx="10" fill="#1F5118" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
            <line x1="90" y1="10" x2="90" y2="80" stroke="rgba(255,255,255,0.28)" strokeWidth="1.4" />
            <circle cx="90" cy="45" r="15" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.4" />
            <circle cx="56" cy="45" r="11" fill="#E2E8F0" stroke="#0F172A" strokeWidth="1.5" />
            <circle cx="56" cy="45" r="7.5" fill="#38BDF8" />
            <circle cx="124" cy="45" r="11" fill="#E2E8F0" stroke="#0F172A" strokeWidth="1.5" />
            <circle cx="124" cy="45" r="7.5" fill="#9146FF" />
            <circle cx="90" cy="45" r="5" fill="#FFFFFF" stroke="#18181B" strokeWidth="1" />
          </svg>
        </div>
      ),
    },
    {
      id: 'uno',
      category: 'party',
      title: 'UNO',
      meta: pickLang(lang, { es: '2–4 jugadores · 108 cartas', ca: '2–4 jugadors · 108 cartes', en: '2–4 players · 108 cards' }),
      supportsOffline: true,
      accentBorder: 'hover:border-rose-400/60',
      stageBg: 'from-[#2A101B] via-[#1B0D17] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="flex items-center -space-x-3 pt-1">
            <img
              src={getUnoCardSvgSrc('red', '7')}
              alt=""
              aria-hidden="true"
              className="w-11 h-16 object-contain -rotate-12 drop-shadow-[0_8px_14px_rgba(0,0,0,0.65)] pointer-events-none"
            />
            <img
              src={getUnoCardSvgSrc('wild', 'wild4')}
              alt=""
              aria-hidden="true"
              className="w-12 h-17 object-contain z-10 drop-shadow-[0_10px_18px_rgba(0,0,0,0.75)] pointer-events-none"
            />
            <img
              src={getUnoCardSvgSrc('blue', 'reverse')}
              alt=""
              aria-hidden="true"
              className="w-11 h-16 object-contain rotate-12 drop-shadow-[0_8px_14px_rgba(0,0,0,0.65)] pointer-events-none"
            />
          </div>
        </div>
      ),
    },
    {
      id: 'parchis',
      category: 'party',
      title: pickLang(lang, { es: 'Parchís', ca: 'Parxís', en: 'Parchís' }),
      meta: pickLang(lang, { es: 'Hasta 4 jugadores · Bots', ca: 'Fins a 4 jugadors · Bots', en: 'Up to 4 players · Bots' }),
      supportsOffline: true,
      accentBorder: 'hover:border-[#9146FF]/70',
      stageBg: 'from-[#1F1638] via-[#141326] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center gap-3 overflow-hidden">
          <div className="grid grid-cols-2 gap-1 p-1.5 rounded-xl bg-black/45 border border-white/10 shadow-md">
            {(['red', 'blue', 'yellow', 'green'] as PartyColor[]).map((col) => (
              <span
                key={col}
                className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ backgroundColor: `${PARTY_COLOR_HEX[col].hex}30` }}
              >
                <span
                  className="w-3 h-3 rounded-full border border-white/80 shadow-sm"
                  style={{ backgroundColor: PARTY_COLOR_HEX[col].hex }}
                />
              </span>
            ))}
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/15 flex items-center justify-center text-[#D8B4FE] shadow-md rotate-6">
            <Dices className="w-5 h-5" />
          </div>
        </div>
      ),
    },
    {
      id: 'pinturillo',
      category: 'party',
      title: 'Pinturillo',
      meta: pickLang(lang, { es: 'Dibuja y adivina · 2–6 jug.', ca: 'Dibuixa i endevina · 2–6', en: 'Draw & guess · 2–6 pl.' }),
      supportsOffline: true,
      accentBorder: 'hover:border-sky-400/60',
      stageBg: 'from-[#102235] via-[#0F1726] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden px-4">
          <svg viewBox="0 0 160 72" className="w-full h-full" aria-hidden="true">
            <path
              d="M20 48 C 44 12, 72 60, 102 24 S 134 46, 146 28"
              fill="none"
              stroke="url(#pintBrush)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="pintBrush" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#F43F5E" />
                <stop offset="50%" stopColor="#9146FF" />
                <stop offset="100%" stopColor="#38BDF8" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute right-3 bottom-2.5 w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/35 flex items-center justify-center text-sky-300">
            <Palette className="w-4 h-4" />
          </span>
        </div>
      ),
    },
    {
      id: 'chess',
      category: 'board',
      title: pickLang(lang, { es: 'Ajedrez', ca: 'Escacs', en: 'Chess' }),
      meta: pickLang(lang, { es: 'FIDE · 1v1 y contra IA', ca: 'FIDE · 1v1 i contra IA', en: 'FIDE · 1v1 & vs AI' }),
      supportsOffline: true,
      accentBorder: 'hover:border-amber-300/55',
      stageBg: 'from-[#221D19] via-[#17161E] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="grid grid-cols-4 grid-rows-2 w-28 h-14 rounded-lg overflow-hidden border border-white/15 opacity-75">
            {Array.from({ length: 8 }).map((_, idx) => {
              const light = (Math.floor(idx / 4) + (idx % 4)) % 2 === 0;
              return (
                <span
                  key={idx}
                  className={light ? 'bg-[#E5D5BA]' : 'bg-[#6F533D]'}
                />
              );
            })}
          </div>
          <svg viewBox="0 0 45 45" className="absolute w-11 h-11 drop-shadow-[0_6px_12px_rgba(0,0,0,0.8)]" aria-hidden="true">
            <path d="M22.5 11.63V6M20 8h5" stroke="#1E1813" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#FFFDF7" stroke="#1E1813" strokeWidth="1.6" />
            <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#FFFDF7" stroke="#1E1813" strokeWidth="1.6" />
          </svg>
        </div>
      ),
    },
    {
      id: 'checkers',
      category: 'board',
      title: pickLang(lang, { es: 'Damas', ca: 'Dames', en: 'Checkers' }),
      meta: pickLang(lang, { es: '8×8 · Captura múltiple · IA', ca: '8×8 · Captura múltiple · IA', en: '8×8 · Multi-jump · AI' }),
      supportsOffline: true,
      accentBorder: 'hover:border-rose-400/60',
      stageBg: 'from-[#28131D] via-[#191119] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center gap-2 overflow-hidden">
          <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#FB7185] via-[#E11D48] to-[#881337] border-2 border-rose-200/80 shadow-[0_8px_18px_rgba(225,29,72,0.4)] flex items-center justify-center">
            <Crown className="w-4.5 h-4.5 fill-white text-white" />
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#FFFDF7] to-[#C8B99B] border-2 border-white/90 shadow-[0_8px_18px_rgba(0,0,0,0.65)]" />
        </div>
      ),
    },
    {
      id: 'connect4',
      category: 'board',
      title: pickLang(lang, { es: 'Conecta 4', ca: 'Connecta 4', en: 'Connect 4' }),
      meta: pickLang(lang, { es: '7×6 · 1v1 y contra IA', ca: '7×6 · 1v1 i contra IA', en: '7×6 · 1v1 & vs AI' }),
      supportsOffline: true,
      accentBorder: 'hover:border-blue-400/60',
      stageBg: 'from-[#111D3B] via-[#101528] to-[#0B0D14]',
      renderStage: () => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div className="w-24 h-16 rounded-xl bg-gradient-to-b from-[#2563EB] to-[#172554] border border-blue-300/35 p-1.5 grid grid-cols-4 grid-rows-3 gap-1 shadow-[0_10px_22px_rgba(37,99,235,0.3)]">
            {[
              0, 0, 1, 0,
              2, 1, 2, 0,
              2, 2, 1, 1,
            ].map((cell, i) => (
              <span
                key={i}
                className={`rounded-full ${
                  cell === 1
                    ? 'bg-[#9146FF] shadow-inner'
                    : cell === 2
                    ? 'bg-rose-500 shadow-inner'
                    : 'bg-[#070B17]'
                }`}
              />
            ))}
          </div>
        </div>
      ),
    },
  ];

  const activeLiveGame = gameCatalog.find((g) => isLiveGame(g.id)) || null;
  const featuredGame = activeLiveGame || gameCatalog[0];
  const filteredGames = gameCatalog.filter(
    (g) => activeCategory === 'all' || g.category === activeCategory
  );

  return (
    <div className="w-full max-w-5xl mx-auto flex-1 min-h-0 overflow-y-auto custom-scrollbar smooth-scroll-area px-2.5 sm:px-4 pt-2 pb-5 space-y-3.5">
      {/* 1. COMPACT ARCADE HEADER & MODE SWITCHER */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-[#BF94FF] shrink-0" />
            <h2 className="font-display font-extrabold text-lg sm:text-xl text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Salón de Juegos', ca: 'Saló de Jocs', en: 'Games Lounge' })}
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {hubMode === 'online'
              ? pickLang(lang, {
                  es: `Sala en directo · ${participants.length} conectado${participants.length === 1 ? '' : 's'}`,
                  ca: `Sala en directe · ${participants.length} connectat${participants.length === 1 ? '' : 's'}`,
                  en: `Live room · ${participants.length} connected`,
                })
              : pickLang(lang, {
                  es: 'Modo entrenamiento offline contra IA',
                  ca: 'Mode entrenament offline contra IA',
                  en: 'Offline practice mode vs AI',
                })}
          </p>
        </div>

        {/* Clean Online vs Solo Mode Toggle */}
        <div className="flex items-center p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setHubMode('online');
            }}
            className={`min-h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              hubMode === 'online'
                ? 'bg-[#9146FF] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Online', ca: 'Online', en: 'Online' })}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setHubMode('offline');
            }}
            className={`min-h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              hubMode === 'offline'
                ? 'bg-[#9146FF] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Contra IA', ca: 'Contra IA', en: 'Vs AI' })}</span>
          </button>
        </div>
      </div>

      {/* 2. CATEGORY TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pr-6 shrink-0">
        {(
          [
            { id: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
            { id: 'arcade', label: pickLang(lang, { es: 'Arcade', ca: 'Arcade', en: 'Arcade' }) },
            { id: 'party', label: pickLang(lang, { es: 'Cartas & Party', ca: 'Cartes & Party', en: 'Cards & Party' }) },
            { id: 'board', label: pickLang(lang, { es: 'Mesa Clásica', ca: 'Taula Clàssica', en: 'Classic Board' }) },
          ] as const
        ).map((tab) => {
          const active = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveCategory(tab.id);
              }}
              className={`min-h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all border ${
                active
                  ? 'bg-white text-zinc-950 border-white shadow-sm'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border-white/[0.08]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 3. FEATURED SPOTLIGHT (ACTIVE LIVE MATCH OR 8-BALL SHOWCASE) */}
      {activeCategory === 'all' && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => openGameCard(featuredGame.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openGameCard(featuredGame.id);
            }
          }}
          className={`group relative rounded-3xl overflow-hidden bg-gradient-to-br ${featuredGame.stageBg} border ${
            activeLiveGame ? 'border-[#00F593]/50' : 'border-white/[0.12]'
          } hover:border-[#9146FF] p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 cursor-pointer active:scale-[0.99] transition-all shadow-[0_18px_46px_rgba(0,0,0,0.55)]`}
        >
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
              <span className={activeLiveGame ? 'text-[#00F593]' : 'text-[#BF94FF]'}>
                {activeLiveGame
                  ? pickLang(lang, { es: 'PARTIDA EN CURSO EN SALA', ca: 'PARTIDA EN CURS A LA SALA', en: 'ACTIVE ROOM MATCH' })
                  : pickLang(lang, { es: 'DESTACADO HOY', ca: 'DESTACAT AVUI', en: 'FEATURED TODAY' })}
              </span>
            </div>

            <div>
              <h3 className="font-display font-black text-xl sm:text-2xl text-white tracking-tight leading-tight">
                {featuredGame.title}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 mt-1">{featuredGame.meta}</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="min-h-10 px-4 rounded-xl bg-[#9146FF] group-hover:bg-[#7C2AE8] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-[0_8px_20px_rgba(145,70,255,0.35)] transition-colors">
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {activeLiveGame
                    ? pickLang(lang, { es: 'Entrar a la mesa', ca: 'Entrar a la taula', en: 'Join table' })
                    : pickLang(lang, { es: 'Jugar ahora', ca: 'Jugar ara', en: 'Play now' })}
                </span>
              </span>
              {roomId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleInviteGame(featuredGame.id);
                  }}
                  className="min-h-10 px-3 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {inviteCopied ? <Check className="w-3.5 h-3.5 text-[#00F593]" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{inviteCopied ? 'Copiado' : 'Invitar'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="w-full sm:w-52 h-28 sm:h-32 rounded-2xl bg-black/35 border border-white/[0.1] shrink-0 overflow-hidden">
            {featuredGame.renderStage()}
          </div>
        </div>
      )}

      {/* 4. ILLUSTRATED GAME CARDS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pb-3">
        {filteredGames.map((game) => {
          const live = isLiveGame(game.id);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => openGameCard(game.id)}
              className={`group rounded-3xl bg-[#10121B] border border-white/[0.09] ${game.accentBorder} overflow-hidden text-left flex flex-col cursor-pointer active:scale-[0.97] transition-all shadow-[0_12px_30px_rgba(0,0,0,0.45)] hover:shadow-[0_16px_34px_rgba(145,70,255,0.2)]`}
            >
              {/* Custom Atmospheric Miniature Stage */}
              <div className={`relative w-full h-24 sm:h-28 bg-gradient-to-br ${game.stageBg} border-b border-white/[0.06] overflow-hidden`}>
                <div className="w-full h-full group-hover:scale-105 transition-transform duration-300">
                  {game.renderStage()}
                </div>
                {live && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-[#00F593] text-zinc-950 text-[10px] font-black uppercase tracking-wider shadow-md">
                    {pickLang(lang, { es: 'En sala', ca: 'En sala', en: 'Live' })}
                  </span>
                )}
              </div>

              {/* Clean Game Title + Metadata */}
              <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between gap-1.5 w-full min-w-0">
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white tracking-tight truncate group-hover:text-[#D8B4FE] transition-colors">
                    {game.title}
                  </h3>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-400 truncate">
                  {game.meta}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
