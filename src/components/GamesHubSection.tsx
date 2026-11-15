import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Crown,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Users,
} from 'lucide-react';
import type {
  AppLanguage,
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
  Participant,
  PinturilloGameState,
  PinturilloStroke,
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
import { GameMuteButton, useGameSoundMute } from './games/GameEffects';
import { VoiceWaveBars } from './games/GameVoiceBar';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

type UnifiedGameId =
  | 'parchis'
  | 'uno'
  | 'pinturillo'
  | 'pool'
  | 'chapas'
  | 'chess'
  | 'checkers'
  | 'connect4';

interface GamesHubSectionProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  roomBoardGame: BoardGameState | null;
  roomPartyGame: PartyGameState | null;
  roomPinturilloGame?: PinturilloGameState | null;
  roomPoolGame?: Pool8BallState | null;
  roomChapasGame?: FutbolChapasState | null;
  matchResponses?: RoomMatchResponsesState | null;
  gameMoveError?: string | null;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  requestedGameOpen?: { gameType: UnifiedGameId; seq: number } | null;
  onSelectedGameChange?: (game: UnifiedGameId | null) => void;
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
  currentUser,
  participants,
  roomBoardGame,
  roomPartyGame,
  roomPinturilloGame = null,
  roomPoolGame = null,
  roomChapasGame = null,
  matchResponses = null,
  gameMoveError = null,
  isHost = false,
  voiceChat,
  requestedGameOpen = null,
  onSelectedGameChange,
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
}) => {
  const [selectedGame, setSelectedGame] = useState<UnifiedGameId | null>(null);
  const [hubMode, setHubMode] = useState<'offline' | 'online'>('online');
  const [localBoardGame, setLocalBoardGame] = useState<BoardGameState | null>(null);
  const [localMoveErr, setLocalMoveErr] = useState<string | null>(null);
  const [muted, toggleMute] = useGameSoundMute();

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

  // Exit non-host guest cleanly if the currently viewed online game closes or switches to another game
  const prevRoomGameKeyRef = React.useRef<UnifiedGameId | null>(null);
  useEffect(() => {
    const incomingType: UnifiedGameId | null = roomChapasGame
      ? 'chapas'
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
    if (!isHost && hubMode === 'online' && selectedGame) {
      if ((prevType && !incomingType) || (incomingType && incomingType !== selectedGame)) {
        setSelectedGame(null);
      }
    }
    prevRoomGameKeyRef.current = incomingType;
  }, [
    roomChapasGame,
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
    const activeBoardState =
      !isParty && !isPinturillo && !isPool && !isChapas
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

    return (
      <div
        data-game-fullscreen="true"
        className="fixed inset-0 z-[185] h-[100dvh] w-full max-w-[100vw] bg-[#0B0D14] nc-tabletop-slate overflow-hidden flex flex-col pt-safe pb-safe"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-1.5 sm:p-3 max-w-5xl w-full mx-auto gap-1.5">
          {isPool ? (
            /* Ultra-compact single-row mobile header for Billar Bola 8 */
            <div className="flex items-center justify-between gap-1.5 px-1.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.09] shrink-0 min-w-0">
              <button
                type="button"
                onClick={handleBackToGames}
                aria-label={pickLang(lang, { es: 'Volver a Juegos', ca: 'Tornar a Jocs', en: 'Back to Games' })}
                className="h-8 px-2 sm:px-2.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-[11px] font-bold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
                </span>
              </button>

              <div className="flex items-center gap-1 min-w-0 flex-1">
                <h2 className="text-xs sm:text-sm font-extrabold text-white truncate">
                  {titleMap.pool}
                </h2>
                {hubMode === 'online' && roomPoolGame && (
                  <span className="text-[10px] font-bold text-emerald-300 truncate hidden sm:inline">
                    · {poolGroupShort}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#090A10] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => switchModeForActiveGame('online')}
                    className={`h-6 px-1.5 sm:px-2 rounded-md text-[10px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                      hubMode === 'online' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3 h-3 shrink-0" />
                    <span className="hidden sm:inline">1v1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchModeForActiveGame('offline')}
                    className={`h-6 px-1.5 sm:px-2 rounded-md text-[10px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                      hubMode === 'offline' ? 'bg-[#9146FF] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Bot className="w-3 h-3 shrink-0" />
                    <span className="hidden sm:inline">IA</span>
                  </button>
                </div>
                <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
                {renderVoiceCompact(true)}
              </div>
            </div>
          ) : (
            <>
              {/* Header: ← Back to Games | Title | Sound Mute */}
              <div className="flex items-center justify-between gap-2 shrink-0 px-0.5 min-w-0">
                <button
                  type="button"
                  onClick={handleBackToGames}
                  className="min-h-8 sm:min-h-9 px-2.5 sm:px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-[11px] sm:text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>{pickLang(lang, { es: 'Volver a Juegos', ca: 'Tornar a Jocs', en: 'Back to Games' })}</span>
                </button>

                <h2 className="text-xs sm:text-base font-extrabold text-white truncate min-w-0 text-center">
                  {titleMap[selectedGame]}
                </h2>

                <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
              </div>

              {/* Clean Non-Clipping Control Bar Above the Board: Online vs AI | Voice Call */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] shrink-0">
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#090A10] border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    onClick={() => switchModeForActiveGame('online')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                      hubMode === 'online' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3 h-3 shrink-0" />
                    <span>Online</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchModeForActiveGame('offline')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                      hubMode === 'offline' ? 'bg-[#9146FF] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Bot className="w-3 h-3 shrink-0" />
                    <span>vs IA</span>
                  </button>
                </div>

                {renderVoiceCompact(false)}
              </div>
            </>
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
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {isChapas ? (
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
      </div>
    );
  }

  // ==========================================================================
  // ULTRA-CLEAN ZERO-SCROLL 2-COLUMN GAME HUB (7 UNIFORM CARDS, ZERO SCROLL)
  // ==========================================================================
  return (
    <div className="w-full max-w-3xl mx-auto flex-1 min-h-0 flex flex-col px-0.5 py-0.5">
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-4 lg:grid-rows-none lg:auto-rows-[112px] gap-1.5 sm:gap-2.5">
        {/* 1. BILLAR BOLA 8 */}
        <button
          type="button"
          onClick={() => openGameCard('pool')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-emerald-400/25 hover:border-emerald-400/65 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#064E3B] via-[#0F766E] to-[#111827] border border-emerald-300/30 flex items-center justify-center shadow-md shrink-0">
              <span className="w-4.5 h-4.5 sm:w-5.5 sm:h-5.5 rounded-full bg-zinc-950 border border-white/25 flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-white text-[8px] font-black text-zinc-950 flex items-center justify-center leading-none">
                  8
                </span>
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-300">8-BALL</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Billar Bola 8', ca: 'Billar Bola 8', en: '8-Ball Pool' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 whitespace-nowrap truncate">
              {pickLang(lang, {
                es: 'Física 60fps · 1v1 y IA',
                ca: 'Física 60fps · 1v1 i IA',
                en: '60fps Physics · 1v1 & AI',
              })}
            </p>
          </div>
        </button>

        {/* 2. PARCHÍS */}
        <button
          type="button"
          onClick={() => openGameCard('parchis')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-white/[0.11] hover:border-amber-400/55 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-1.5">
              {(['red', 'blue', 'yellow', 'green'] as PartyColor[]).map((col) => (
                <span
                  key={col}
                  className="w-4.5 h-4.5 sm:w-5.5 sm:h-5.5 rounded-full border border-white/85 shadow-md"
                  style={{
                    background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.88) 0%, ${PARTY_COLOR_HEX[col].hex} 46%, #111 95%)`,
                  }}
                />
              ))}
            </div>
            <span className="text-base sm:text-lg leading-none" aria-hidden="true">🎲</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Parchís', ca: 'Parxís', en: 'Parchís' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: '4 jugadores · 68 casillas', ca: '4 jugadors · 68 caselles', en: '4 players · 68 squares' })}
            </p>
          </div>
        </button>

        {/* 3. UNO */}
        <button
          type="button"
          onClick={() => openGameCard('uno')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-white/[0.11] hover:border-rose-400/55 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-2">
              <img
                src={getUnoCardSvgSrc('red', '7')}
                alt=""
                aria-hidden="true"
                className="w-5.5 h-7 sm:w-7 sm:h-9 object-contain -rotate-8 drop-shadow-md pointer-events-none"
              />
              <img
                src={getUnoCardSvgSrc('wild', 'wild4')}
                alt=""
                aria-hidden="true"
                className="w-5.5 h-7 sm:w-7 sm:h-9 object-contain rotate-8 drop-shadow-md pointer-events-none"
              />
            </div>
            <span className="text-[11px] font-black tracking-tight text-amber-300">108</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              UNO
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: '4 jugadores · Oficial 1971', ca: '4 jugadors · Oficial', en: '4 players · Official deck' })}
            </p>
          </div>
        </button>

        {/* 4. PINTURILLO */}
        <button
          type="button"
          onClick={() => openGameCard('pinturillo')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-white/[0.11] hover:border-emerald-400/55 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500 border border-white/60" />
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-white/60" />
              <span className="w-3.5 h-3.5 rounded-full bg-sky-500 border border-white/60" />
            </div>
            <span className="text-base sm:text-lg leading-none" aria-hidden="true">🎨</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              Pinturillo
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: 'Dibuja y adivina · 2-6 jug.', ca: 'Dibuixa i endevina · 2-6', en: 'Draw & guess · 2-6 pl.' })}
            </p>
          </div>
        </button>

        {/* 5. AJEDREZ */}
        <button
          type="button"
          onClick={() => openGameCard('chess')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-white/[0.11] hover:border-[#9146FF]/65 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#6c7488] to-[#2a2f3d] border border-white/15 flex items-center justify-center shadow-inner">
              <svg viewBox="0 0 45 45" className="w-4.5 h-4.5 sm:w-6 sm:h-6" aria-hidden="true">
                <path
                  d="M22.5 11.63V6M20 8h5"
                  stroke="#292018"
                  strokeWidth="2.1"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
                  fill="#FFFDF7"
                  stroke="#292018"
                  strokeWidth="1.6"
                />
                <path
                  d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"
                  fill="#FFFDF7"
                  stroke="#292018"
                  strokeWidth="1.6"
                />
              </svg>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">FIDE</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Ajedrez', ca: 'Escacs', en: 'Chess' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: '1v1 · Piezas Staunton', ca: '1v1 · Peces Staunton', en: '1v1 · Staunton Chess' })}
            </p>
          </div>
        </button>

        {/* 6. DAMAS */}
        <button
          type="button"
          onClick={() => openGameCard('checkers')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-white/[0.11] hover:border-rose-400/55 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-b from-[#FB7185] via-[#E11D48] to-[#881337] border border-rose-200/80 shadow-md flex items-center justify-center">
                <Crown className="w-3 h-3 fill-amber-300 text-amber-400" />
              </div>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-b from-[#FFFDF7] to-[#C8B99B] border border-white shadow-md" />
            </div>
            <span className="text-[10px] font-mono text-zinc-400">8×8</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Damas', ca: 'Dames', en: 'Checkers' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: '1v1 · Captura múltiple', ca: '1v1 · Captura múltiple', en: '1v1 · Multi-jump' })}
            </p>
          </div>
        </button>

        {/* 7. CONECTA 4 */}
        <button
          type="button"
          onClick={() => openGameCard('connect4')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-white/[0.11] hover:border-blue-400/60 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-6.5 sm:w-11 sm:h-8 rounded-lg bg-gradient-to-b from-[#2563EB] to-[#172554] border border-blue-300/35 p-1 grid grid-cols-3 grid-rows-2 gap-0.5 shrink-0 shadow-md">
              <span className="rounded-full bg-[#060912]" />
              <span className="rounded-full bg-amber-400" />
              <span className="rounded-full bg-[#060912]" />
              <span className="rounded-full bg-rose-500" />
              <span className="rounded-full bg-amber-400" />
              <span className="rounded-full bg-rose-500" />
            </div>
            <span className="text-[10px] font-mono text-zinc-400">7×6</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Conecta 4', ca: 'Connecta 4', en: 'Connect 4' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: '1v1 · Gravedad 7×6', ca: '1v1 · Gravetat 7×6', en: '1v1 · 7×6 Gravity' })}
            </p>
          </div>
        </button>

        {/* 8. FÚTBOL CHAPAS */}
        <button
          type="button"
          onClick={() => openGameCard('chapas')}
          className="group relative rounded-2xl p-2 sm:p-3 nc-tabletop-slate border border-emerald-400/25 hover:border-lime-400/65 text-left flex flex-col justify-between gap-1 sm:gap-1.5 min-h-0 cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-7 sm:w-11 sm:h-8 rounded-xl bg-gradient-to-br from-[#3F7B21] via-[#2B5915] to-[#17330A] border border-lime-300/35 flex items-center justify-center shadow-md shrink-0 relative overflow-hidden">
              <svg viewBox="0 0 40 28" className="w-8 h-6" aria-hidden="true">
                <line x1="20" y1="2" x2="20" y2="26" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
                <circle cx="20" cy="14" r="6" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
                <circle cx="13" cy="14" r="5" fill="#E2E8F0" stroke="#1E293B" strokeWidth="1" />
                <circle cx="13" cy="14" r="3.4" fill="#75AADB" />
                <circle cx="27" cy="14" r="5" fill="#E2E8F0" stroke="#1E293B" strokeWidth="1" />
                <circle cx="27" cy="14" r="3.4" fill="#FFC400" />
              </svg>
            </div>
            <span className="text-[10px] font-mono text-lime-300">2v2</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight truncate">
              {pickLang(lang, { es: 'Fútbol Chapas', ca: 'Futbol Xapes', en: 'Soccer Caps' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 whitespace-nowrap truncate">
              {pickLang(lang, {
                es: 'Estadio · 1v1 / 2v2 y IA',
                ca: 'Estadi · 1v1 / 2v2 i IA',
                en: 'Stadium · 1v1 / 2v2 & AI',
              })}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};
