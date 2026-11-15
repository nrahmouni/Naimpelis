import React, { useEffect, useState } from 'react';
import { Bot, Gamepad2, Users } from 'lucide-react';
import type {
  AppLanguage,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  ChessPromotionPiece,
  Participant,
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
import type { PartyColor, PartyGameState, PartyGameType } from '../shared/partyGames';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { RoomBoardGamePanel } from './RoomBoardGamePanel';
import { PartyGamesStage, type PartyOnlineAction } from './PartyGamesStage';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface GamesHubSectionProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  roomBoardGame: BoardGameState | null;
  roomPartyGame: PartyGameState | null;
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
}

export const GamesHubSection: React.FC<GamesHubSectionProps> = ({
  lang,
  currentUser,
  participants,
  roomBoardGame,
  roomPartyGame,
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
}) => {
  // Online multiplayer default
  const [hubMode, setHubMode] = useState<'offline' | 'online'>('online');
  const [categoryTab, setCategoryTab] = useState<'party' | 'board'>('party');
  const [localBoardGame, setLocalBoardGame] = useState<BoardGameState | null>(null);
  const [localMoveErr, setLocalMoveErr] = useState<string | null>(null);
  const [offlinePartyOpen, setOfflinePartyOpen] = useState(false);

  // Sync category tab automatically when an online game opens from room chat/sidebar
  useEffect(() => {
    if (hubMode !== 'online') return;
    if (roomPartyGame && !roomBoardGame) setCategoryTab('party');
    else if (roomBoardGame && !roomPartyGame) setCategoryTab('board');
  }, [hubMode, roomPartyGame, roomBoardGame]);

  // Offline AI Bot turn + 15s human decision timeout auto-move
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

  const handleStartOfflineBoard = (
    gt: BoardGameType,
    _soloLocal?: boolean,
    clockMinutes: BoardClockMinutes = 0
  ) => {
    setLocalMoveErr(null);
    const created = createInitialBoardGameState(
      gt,
      { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar, color: currentUser.color },
      true,
      undefined,
      clockMinutes,
      [],
      true
    );
    setLocalBoardGame({
      ...created,
      players: {
        w: {
          userId: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar || '🎮',
          color: currentUser.color || '#9146FF',
          score: 0,
        },
        b: {
          userId: 'bot-board-ia',
          name: 'Bot NAIM IA',
          avatar: '🤖',
          color: '#E11D48',
          score: 0,
          isBot: true,
        },
      },
    });
  };

  const handleJoinOfflineBoardSeat = (side: 'w' | 'b' | 'spectate') => {
    if (side === 'spectate') return;
    setLocalBoardGame((curr) => {
      if (!curr || curr.status !== 'waiting') return curr;
      const otherSide = side === 'w' ? 'b' : 'w';
      return {
        ...curr,
        players: {
          [side]: {
            userId: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar || '🎮',
            color: currentUser.color || '#9146FF',
            score: 0,
          },
          [otherSide]: {
            userId: 'bot-board-ia',
            name: 'Bot NAIM IA',
            avatar: '🤖',
            color: '#E11D48',
            score: 0,
            isBot: true,
          },
        } as BoardGameState['players'],
        updatedAt: Date.now(),
      };
    });
  };

  const isBoardGameOpen =
    categoryTab === 'board' && Boolean(hubMode === 'offline' ? localBoardGame : roomBoardGame);
  const isPartyGameOpen =
    categoryTab === 'party' && Boolean(hubMode === 'offline' ? offlinePartyOpen : roomPartyGame);
  const isFullscreenGame = isBoardGameOpen || isPartyGameOpen;

  // Distraction-free full-screen mode: lock page scroll while a game lobby/match is open
  useEffect(() => {
    if (!isFullscreenGame || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreenGame]);

  const stageElement =
    categoryTab === 'party' ? (
      <PartyGamesStage
        lang={lang}
        currentUser={currentUser}
        participants={participants}
        partyGameState={roomPartyGame}
        isOffline={hubMode === 'offline'}
        isHost={isHost}
        fullScreenMode={isFullscreenGame}
        voiceChat={voiceChat}
        onStartOnline={onStartRoomPartyGame}
        onOnlineAction={onRoomPartyAction}
        onCloseOnline={onCloseRoomPartyGame}
        onActiveStateChange={setOfflinePartyOpen}
      />
    ) : hubMode === 'offline' ? (
      <RoomBoardGamePanel
        gameState={localBoardGame}
        currentUser={currentUser}
        lang={lang}
        moveError={localMoveErr}
        isOnlineRoom={false}
        isHost={true}
        fullScreenMode={isFullscreenGame}
        onStartGame={handleStartOfflineBoard}
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
        onCloseGame={() => {
          setLocalMoveErr(null);
          setLocalBoardGame(null);
        }}
      />
    ) : (
      <RoomBoardGamePanel
        gameState={roomBoardGame}
        currentUser={currentUser}
        lang={lang}
        moveError={gameMoveError}
        voiceChat={voiceChat}
        isOnlineRoom={true}
        isHost={isHost}
        fullScreenMode={isFullscreenGame}
        onStartGame={(gt, solo, clockMin) => onStartRoomBoardGame?.(gt, solo, clockMin)}
        onJoinSeat={(side) => onJoinBoardSeat?.(side)}
        onStartMatch={onStartBoardMatch}
        onMove={(from, to, promo) => onMoveBoardGame?.(from, to, promo)}
        onResign={() => onResignBoardGame?.()}
        onReset={(opts) => onResetBoardGame?.(opts)}
        onCloseGame={() => onCloseBoardGame?.()}
      />
    );

  if (isFullscreenGame) {
    return (
      <div
        data-game-fullscreen="true"
        className="fixed inset-0 z-[185] h-[100dvh] w-full max-w-[100vw] bg-[#0B0B10] overflow-hidden flex flex-col pt-safe pb-safe"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2 sm:p-4 max-w-6xl w-full mx-auto">
          {stageElement}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Top Mode & Game Family Header */}
      <div className="rounded-3xl nc-specular-surface border border-white/[0.1] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#9146FF]/20 border border-[#9146FF]/45 flex items-center justify-center text-[#DFCCFF] shrink-0">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg text-white truncate">
                {pickLang(lang, {
                  es: 'Sala de Juegos Online · NAIM Play',
                  ca: 'Sala de Jocs Online · NAIM Play',
                  en: 'Online Games Hub · NAIM Play',
                })}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {pickLang(lang, {
                  es: 'Parchís Español 68, UNO 1971, Damas Españolas, Ajedrez FIDE y Conecta 4 con chat de voz y turnos de 15s',
                  ca: 'Parxís, UNO, Dames, Escacs FIDE i Connecta 4 en línia amb xat de veu',
                  en: 'Spanish Parchís, UNO 1971, Checkers, FIDE Chess & Connect 4 with live voice & 15s turns',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setHubMode('online');
              }}
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                hubMode === 'online' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>{pickLang(lang, { es: 'Online en Sala', ca: 'Online a la Sala', en: 'Room Online' })}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setHubMode('offline');
              }}
              className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                hubMode === 'offline' ? 'bg-[#9146FF] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>{pickLang(lang, { es: 'Offline vs IA', ca: 'Offline vs IA', en: 'Offline vs AI' })}</span>
            </button>
          </div>
        </div>

        {/* Subcategory Switcher: 4P Party Games | 1v1 Tablero */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setCategoryTab('party');
            }}
            className={`min-h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              categoryTab === 'party'
                ? 'bg-white text-[#050508]'
                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
            }`}
          >
            🎲 {pickLang(lang, { es: 'Parchís & UNO (4P)', ca: 'Parxís & UNO (4P)', en: 'Parchís & UNO (4P)' })}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setCategoryTab('board');
            }}
            className={`min-h-9 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              categoryTab === 'board'
                ? 'bg-white text-[#050508]'
                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200'
            }`}
          >
            ♟️ {pickLang(lang, { es: 'Conecta 4 · Damas · Ajedrez', ca: 'Connecta 4 · Dames · Escacs', en: 'Connect 4 · Checkers · Chess' })}
          </button>
        </div>
      </div>

      {/* Main Play Stage */}
      <div className="rounded-3xl bg-[#0D0E15]/95 border border-white/[0.08] overflow-hidden min-h-[420px] flex flex-col">
        {stageElement}
      </div>
    </div>
  );
};
