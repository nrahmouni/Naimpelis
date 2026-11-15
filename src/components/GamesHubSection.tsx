import React, { useEffect, useState } from 'react';
import {
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
  ChessPromotionPiece,
  KartInputState,
  KartTrackId,
  Participant,
  PinturilloGameState,
  PinturilloStroke,
  TurboKartState,
} from '../types';
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
  PARTY_COLORS,
  type PartyColor,
  type PartyGameState,
  type PartyGameType,
} from '../shared/partyGames';
import { getUnoCardSvgSrc } from '../assets/uno';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { RoomBoardGamePanel } from './RoomBoardGamePanel';
import { PartyGamesStage, type PartyOnlineAction } from './PartyGamesStage';
import { PinturilloStage } from './PinturilloStage';
import { TurboKartStage } from './TurboKartStage';
import { GameMuteButton, useGameSoundMute } from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

type UnifiedGameId =
  | 'parchis'
  | 'uno'
  | 'pinturillo'
  | 'kart'
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
  roomKartGame?: TurboKartState | null;
  gameMoveError?: string | null;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
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
  onPinturilloPickWord?: (wordId: string) => void;
  onPinturilloStroke?: (stroke: PinturilloStroke) => void;
  onPinturilloUndo?: () => void;
  onPinturilloClear?: () => void;
  onPinturilloGuess?: (text: string) => void;
  onPinturilloRematch?: () => void;
  onCloseRoomPinturillo?: () => void;
  onStartRoomKart?: (trackId?: KartTrackId) => void;
  onKartSelectTrack?: (trackId: KartTrackId) => void;
  onKartBeginRace?: () => void;
  onKartInput?: (input: KartInputState) => void;
  onKartUseItem?: () => void;
  onKartRematch?: (trackId?: KartTrackId) => void;
  onCloseRoomKart?: () => void;
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
  roomKartGame = null,
  gameMoveError = null,
  isHost = false,
  voiceChat,
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
  onPinturilloPickWord,
  onPinturilloStroke,
  onPinturilloUndo,
  onPinturilloClear,
  onPinturilloGuess,
  onPinturilloRematch,
  onCloseRoomPinturillo,
  onStartRoomKart,
  onKartSelectTrack,
  onKartBeginRace,
  onKartInput,
  onKartUseItem,
  onKartRematch,
  onCloseRoomKart,
}) => {
  const [selectedGame, setSelectedGame] = useState<UnifiedGameId | null>(null);
  const [hubMode, setHubMode] = useState<'offline' | 'online'>('online');
  const [localBoardGame, setLocalBoardGame] = useState<BoardGameState | null>(null);
  const [localMoveErr, setLocalMoveErr] = useState<string | null>(null);
  const [muted, toggleMute] = useGameSoundMute();

  // Track room-pushed games so when another room user launches a game, it opens cleanly unless dismissed
  const prevRoomGameKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    const incomingKey = roomKartGame
      ? `kart:${roomKartGame.updatedAt}`
      : roomPinturilloGame
      ? `pinturillo:${roomPinturilloGame.updatedAt}`
      : roomPartyGame
      ? `party:${roomPartyGame.gameType}:${roomPartyGame.updatedAt}`
      : roomBoardGame
      ? `board:${roomBoardGame.gameType}:${roomBoardGame.updatedAt}`
      : null;

    if (!incomingKey) {
      prevRoomGameKeyRef.current = null;
      return;
    }

    const incomingType: UnifiedGameId = roomKartGame
      ? 'kart'
      : roomPinturilloGame
      ? 'pinturillo'
      : roomPartyGame
      ? roomPartyGame.gameType
      : roomBoardGame!.gameType;

    // Auto-open on first transition from null -> active game
    if (!prevRoomGameKeyRef.current) {
      setHubMode('online');
      setSelectedGame(incomingType);
    }
    prevRoomGameKeyRef.current = incomingType;
  }, [roomKartGame, roomPinturilloGame, roomPartyGame, roomBoardGame]);

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

    if (gt === 'pinturillo') {
      if (!roomPinturilloGame) {
        onStartRoomPinturillo?.();
      }
    } else if (gt === 'kart') {
      if (!roomKartGame) {
        onStartRoomKart?.();
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
      } else if (selectedGame === 'pinturillo') {
        if (isHost && roomPinturilloGame) {
          onCloseRoomPinturillo?.();
        }
      } else if (selectedGame === 'kart') {
        if (isHost && roomKartGame) {
          onCloseRoomKart?.();
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
      if (selectedGame === 'pinturillo') {
        if (!roomPinturilloGame) {
          onStartRoomPinturillo?.();
        }
      } else if (selectedGame === 'kart') {
        if (!roomKartGame) {
          onStartRoomKart?.();
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
    const isKart = selectedGame === 'kart';
    const activeBoardState =
      !isParty && !isPinturillo && !isKart
        ? hubMode === 'offline'
          ? localBoardGame
          : roomBoardGame?.gameType === selectedGame
          ? roomBoardGame
          : null
        : null;

    const activePartyState = isParty
      ? hubMode === 'offline'
        ? null
        : roomPartyGame?.gameType === selectedGame
        ? roomPartyGame
        : null
      : null;

    const showPartyWaitingColors =
      isParty && hubMode === 'online' && activePartyState?.status === 'waiting';

    const titleMap: Record<UnifiedGameId, string> = {
      parchis: pickLang(lang, { es: '🎲 Parchís', ca: '🎲 Parxís', en: '🎲 Parchís' }),
      uno: '🃏 UNO',
      pinturillo: '🎨 Pinturillo',
      kart: '🏎️ Turbo Kart',
      chess: pickLang(lang, { es: '♟️ Ajedrez', ca: '♟️ Escacs', en: '♟️ Chess' }),
      checkers: pickLang(lang, { es: '🔴 Damas', ca: '🔴 Dames', en: '🔴 Checkers' }),
      connect4: pickLang(lang, { es: '🟡 Conecta 4', ca: '🟡 Connecta 4', en: '🟡 Connect 4' }),
    };

    return (
      <div
        data-game-fullscreen="true"
        className="fixed inset-0 z-[185] h-[100dvh] w-full max-w-[100vw] bg-[#0B0D14] nc-tabletop-slate overflow-hidden flex flex-col pt-safe pb-safe"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2 sm:p-3.5 max-w-4xl w-full mx-auto gap-1.5">
          {/* Header: ← Back to Games | Title | Sound Mute */}
          <div className="flex items-center justify-between gap-2 shrink-0 px-0.5">
            <button
              type="button"
              onClick={handleBackToGames}
              className="min-h-9 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>{pickLang(lang, { es: 'Volver a Juegos', ca: 'Tornar a Jocs', en: 'Back to Games' })}</span>
            </button>

            <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
              {titleMap[selectedGame]}
            </h2>

            <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
          </div>

          {/* Single Compact Control Bar Above the Board: Online vs AI | Seat/Color Picker | Voice Mic */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] shrink-0 overflow-x-auto no-scrollbar">
            {/* 1. Online vs AI Toggle */}
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

            {/* 2. Party Color Picker (Only shown while waiting before match starts) */}
            {showPartyWaitingColors && (
              <div className="flex items-center gap-1 shrink-0">
                {PARTY_COLORS.map((col, idx) => {
                  const seat = activePartyState?.players[idx];
                  const isMine = seat && !seat.isBot && seat.userId === currentUser.id;
                  const canClaim =
                    hubMode === 'online' &&
                    activePartyState?.status === 'waiting' &&
                    Boolean(seat?.isBot);
                  return (
                    <button
                      key={col}
                      type="button"
                      disabled={!canClaim}
                      onClick={() => {
                        if (!canClaim) return;
                        triggerHaptic('light');
                        onRoomPartyAction?.('join_seat', { seatIndex: idx });
                      }}
                      aria-label={col}
                      className={`h-7 px-2 rounded-lg text-[10px] font-extrabold flex items-center gap-1 border whitespace-nowrap ${
                        isMine
                          ? 'border-white bg-white/15 text-white'
                          : canClaim
                          ? 'border-white/20 bg-white/[0.05] hover:bg-white/[0.12] text-zinc-200 cursor-pointer'
                          : 'border-white/10 bg-white/[0.03] text-zinc-400 opacity-75 cursor-default'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PARTY_COLOR_HEX[col].hex }}
                      />
                      <span>{PARTY_COLOR_HEX[col].short}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. Voice Call Mic Button */}
            {hubMode === 'online' && voiceChat && (
              <div className="flex items-center gap-1 shrink-0">
                {voiceChat.isJoined ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        voiceChat.toggleMute();
                      }}
                      className={`h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap border cursor-pointer ${
                        voiceChat.isMuted
                          ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                          : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      }`}
                    >
                      {voiceChat.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      <span>{voiceChat.isMuted ? 'Mute' : 'Voz'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        voiceChat.leaveVoice();
                      }}
                      aria-label="Colgar voz"
                      className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.1] flex items-center justify-center text-zinc-300 hover:text-rose-200 cursor-pointer"
                    >
                      <PhoneOff className="w-3 h-3" />
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
                    className="h-7 px-2.5 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-[10px] font-bold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    {voiceChat.status === 'requesting' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <PhoneCall className="w-3 h-3" />
                    )}
                    <span>Voz</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Single Game Stage */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {isKart ? (
              <TurboKartStage
                key={`kart-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                kartGameState={hubMode === 'offline' ? null : roomKartGame}
                isOffline={hubMode === 'offline'}
                isHost={isHost}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onSelectTrackOnline={onKartSelectTrack}
                onBeginRaceOnline={onKartBeginRace}
                onSendInputOnline={onKartInput}
                onUseItemOnline={onKartUseItem}
                onRematchOnline={onKartRematch}
              />
            ) : isPinturillo ? (
              <PinturilloStage
                key={`pinturillo-${hubMode}`}
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                pinturilloState={hubMode === 'offline' ? null : roomPinturilloGame}
                isOffline={hubMode === 'offline'}
                voiceChat={voiceChat}
                mutedOverride={muted}
                onStartOnline={onStartRoomPinturillo}
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
  // ULTRA-CLEAN ZERO-SCROLL 2-COLUMN GAME HUB (7 GAMES, ZERO SCROLL)
  // ==========================================================================
  return (
    <div className="w-full max-w-2xl mx-auto px-1 py-0.5">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {/* 1. TURBO KART (Featured Full-Width Arcade Banner) */}
        <button
          type="button"
          onClick={() => openGameCard('kart')}
          className="col-span-2 group relative rounded-2xl px-3.5 py-2.5 sm:py-3.5 nc-tabletop-slate border border-amber-400/25 hover:border-amber-400/70 text-left flex items-center justify-between gap-3 min-h-[72px] sm:min-h-[84px] cursor-pointer active:scale-[0.99] transition-all overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-11 rounded-xl bg-gradient-to-br from-[#F43F5E] via-[#F59E0B] to-[#9146FF] border border-white/25 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-2xl leading-none" aria-hidden="true">🏎️</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-extrabold text-sm sm:text-base text-white tracking-tight truncate">
                Turbo Kart
              </h3>
              <p className="text-[11px] text-zinc-300 truncate">
                {pickLang(lang, {
                  es: '3 circuitos · Caparazones, Nitro y 6 jugadores',
                  ca: '3 circuits · Closques, Nitro i 6 jugadors',
                  en: '3 tracks · Shells, Nitro & 6 players',
                })}
              </p>
            </div>
          </div>
          <span className="text-xs font-black text-amber-300 group-hover:translate-x-0.5 transition-transform shrink-0">
            →
          </span>
        </button>

        {/* 2. PARCHÍS */}
        <button
          type="button"
          onClick={() => openGameCard('parchis')}
          className="group relative rounded-2xl p-2.5 sm:p-3.5 nc-tabletop-slate border border-white/[0.11] hover:border-amber-400/55 text-left flex flex-col justify-between gap-2 min-h-[88px] sm:min-h-[104px] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-1.5">
              {(['red', 'blue', 'yellow', 'green'] as PartyColor[]).map((col) => (
                <span
                  key={col}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white/85 shadow-md"
                  style={{
                    background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.88) 0%, ${PARTY_COLOR_HEX[col].hex} 46%, #111 95%)`,
                  }}
                />
              ))}
            </div>
            <span className="text-base sm:text-lg leading-none" aria-hidden="true">🎲</span>
          </div>
          <div>
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight">
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
          className="group relative rounded-2xl p-2.5 sm:p-3.5 nc-tabletop-slate border border-white/[0.11] hover:border-rose-400/55 text-left flex flex-col justify-between gap-2 min-h-[88px] sm:min-h-[104px] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-2.5">
              <img
                src={getUnoCardSvgSrc('red', '7')}
                alt=""
                aria-hidden="true"
                className="w-7 h-10 object-contain -rotate-8 drop-shadow-md pointer-events-none"
              />
              <img
                src={getUnoCardSvgSrc('wild', 'wild4')}
                alt=""
                aria-hidden="true"
                className="w-7 h-10 object-contain rotate-8 drop-shadow-md pointer-events-none"
              />
            </div>
            <span className="text-[11px] font-black tracking-tight text-amber-300">108</span>
          </div>
          <div>
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight">
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
          className="group relative rounded-2xl p-2.5 sm:p-3.5 nc-tabletop-slate border border-white/[0.11] hover:border-emerald-400/55 text-left flex flex-col justify-between gap-2 min-h-[88px] sm:min-h-[104px] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500 border border-white/60" />
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-white/60" />
              <span className="w-3.5 h-3.5 rounded-full bg-sky-500 border border-white/60" />
            </div>
            <span className="text-base sm:text-lg leading-none" aria-hidden="true">🎨</span>
          </div>
          <div>
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight">
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
          className="group relative rounded-2xl p-2.5 sm:p-3.5 nc-tabletop-slate border border-white/[0.11] hover:border-[#9146FF]/65 text-left flex flex-col justify-between gap-2 min-h-[88px] sm:min-h-[104px] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6c7488] to-[#2a2f3d] border border-white/15 flex items-center justify-center shadow-inner">
              <svg viewBox="0 0 45 45" className="w-6 h-6" aria-hidden="true">
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
          <div>
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight">
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
          className="group relative rounded-2xl p-2.5 sm:p-3.5 nc-tabletop-slate border border-white/[0.11] hover:border-rose-400/55 text-left flex flex-col justify-between gap-2 min-h-[88px] sm:min-h-[104px] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#FB7185] via-[#E11D48] to-[#881337] border border-rose-200/80 shadow-md flex items-center justify-center">
                <Crown className="w-3.5 h-3.5 fill-amber-300 text-amber-400" />
              </div>
              <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#FFFDF7] to-[#C8B99B] border border-white shadow-md" />
            </div>
            <span className="text-[10px] font-mono text-zinc-400">8×8</span>
          </div>
          <div>
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight">
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
          className="group relative rounded-2xl p-2.5 sm:p-3.5 nc-tabletop-slate border border-white/[0.11] hover:border-blue-400/60 text-left flex flex-col justify-between gap-2 min-h-[88px] sm:min-h-[104px] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="w-11 h-8 rounded-lg bg-gradient-to-b from-[#2563EB] to-[#172554] border border-blue-300/35 p-1 grid grid-cols-3 grid-rows-2 gap-0.5 shrink-0 shadow-md">
              <span className="rounded-full bg-[#060912]" />
              <span className="rounded-full bg-amber-400" />
              <span className="rounded-full bg-[#060912]" />
              <span className="rounded-full bg-rose-500" />
              <span className="rounded-full bg-amber-400" />
              <span className="rounded-full bg-rose-500" />
            </div>
            <span className="text-[10px] font-mono text-zinc-400">7×6</span>
          </div>
          <div>
            <h3 className="font-display font-extrabold text-xs sm:text-sm text-white tracking-tight">
              {pickLang(lang, { es: 'Conecta 4', ca: 'Connecta 4', en: 'Connect 4' })}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 truncate">
              {pickLang(lang, { es: '1v1 · Gravedad 7×6', ca: '1v1 · Gravetat 7×6', en: '1v1 · 7×6 Gravity' })}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};
