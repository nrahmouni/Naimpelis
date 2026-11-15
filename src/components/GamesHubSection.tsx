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
  applyBoardMove,
  createInitialBoardGameState,
  getAllLegalMovesForSide,
  getConnect4DropRow,
  resetBoardGame,
  resignBoardGame,
} from '../shared/boardGames';
import type { PartyColor, PartyGameState, PartyGameType } from '../shared/partyGames';
import { RoomBoardGamePanel } from './RoomBoardGamePanel';
import { PartyGamesStage } from './PartyGamesStage';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface GamesHubSectionProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  roomBoardGame: BoardGameState | null;
  roomPartyGame: PartyGameState | null;
  gameMoveError?: string | null;
  onStartRoomBoardGame?: (gt: BoardGameType, soloLocal?: boolean, clockMinutes?: BoardClockMinutes) => void;
  onJoinBoardSeat?: (side: 'w' | 'b' | 'spectate') => void;
  onMoveBoardGame?: (from: BoardCoord, to: BoardCoord, promo?: ChessPromotionPiece) => void;
  onResignBoardGame?: () => void;
  onResetBoardGame?: (opts?: { gameType?: BoardGameType; swapColors?: boolean; clockMinutes?: BoardClockMinutes }) => void;
  onCloseBoardGame?: () => void;
  onStartRoomPartyGame?: (gt: PartyGameType) => void;
  onRoomPartyAction?: (
    action: 'roll_dice' | 'move_piece' | 'play_card' | 'draw_card' | 'pass_turn' | 'rematch',
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor }
  ) => void;
  onCloseRoomPartyGame?: () => void;
}

function chooseLocalBotBoardMove(state: BoardGameState): {
  from: BoardCoord;
  to: BoardCoord;
} | null {
  if (state.gameType === 'connect4') {
    const validCols = [3, 2, 4, 1, 5, 0, 6].filter((c) => getConnect4DropRow(state.board, c) >= 0);
    if (validCols.length === 0) return null;
    // Prefer center column or random tactical column
    const col = validCols[Math.random() < 0.55 ? 0 : Math.floor(Math.random() * validCols.length)];
    const row = getConnect4DropRow(state.board, col);
    return { from: { r: 0, c: col }, to: { r: row, c: col } };
  }
  const all = getAllLegalMovesForSide(state, 'b');
  if (all.length === 0) return null;
  const captures = all.filter((m) => m.move.isCapture);
  const pickList = captures.length > 0 ? captures : all;
  const chosen = pickList[Math.floor(Math.random() * pickList.length)];
  return { from: chosen.from, to: { r: chosen.move.r, c: chosen.move.c } };
}

export const GamesHubSection: React.FC<GamesHubSectionProps> = ({
  lang,
  currentUser,
  participants,
  roomBoardGame,
  roomPartyGame,
  gameMoveError = null,
  onStartRoomBoardGame,
  onJoinBoardSeat,
  onMoveBoardGame,
  onResignBoardGame,
  onResetBoardGame,
  onCloseBoardGame,
  onStartRoomPartyGame,
  onRoomPartyAction,
  onCloseRoomPartyGame,
}) => {
  const [hubMode, setHubMode] = useState<'offline' | 'online'>('offline');
  const [categoryTab, setCategoryTab] = useState<'party' | 'board'>('party');
  const [localBoardGame, setLocalBoardGame] = useState<BoardGameState | null>(null);
  const [localMoveErr, setLocalMoveErr] = useState<string | null>(null);

  // Offline Bot responds automatically on 'b' turn for local board game
  useEffect(() => {
    if (hubMode !== 'offline' || !localBoardGame || localBoardGame.status !== 'playing') return;
    if (localBoardGame.turn !== 'b') return;

    const timer = window.setTimeout(() => {
      setLocalBoardGame((curr) => {
        if (!curr || curr.status !== 'playing' || curr.turn !== 'b') return curr;
        const botMove = chooseLocalBotBoardMove(curr);
        if (!botMove) return curr;
        const res = applyBoardMove(curr, currentUser.id, botMove.from, botMove.to, 'Q');
        return res.ok ? res.state : curr;
      });
    }, 600);

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
      clockMinutes
    );
    setLocalBoardGame({
      ...created,
      players: {
        w: created.players.w,
        b: {
          userId: 'bot-board-ia',
          name: 'Bot NAIM IA',
          avatar: '🤖',
          color: '#E11D48',
          score: 0,
        },
      },
    });
  };

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
                  es: 'Sala de Juegos · NAIM Play',
                  ca: 'Sala de Jocs · NAIM Play',
                  en: 'Games Hub · NAIM Play',
                })}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {pickLang(lang, {
                  es: 'Parchís 4P, UNO, Conecta 4, Damas y Ajedrez offline vs IA o en directo con tu sala',
                  ca: 'Parxís 4P, UNO, Connecta 4, Dames i Escacs offline o en directe a la sala',
                  en: '4P Parchís, UNO, Connect 4, Checkers & Chess offline vs AI or live in this room',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
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
              <span>{pickLang(lang, { es: 'Solo Offline', ca: 'Només Offline', en: 'Solo Offline' })}</span>
            </button>
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
              <span>{pickLang(lang, { es: 'En Sala Online', ca: 'A la Sala Online', en: 'Room Online' })}</span>
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
        {categoryTab === 'party' ? (
          <PartyGamesStage
            lang={lang}
            currentUser={currentUser}
            participants={participants}
            partyGameState={roomPartyGame}
            isOffline={hubMode === 'offline'}
            onStartOnline={onStartRoomPartyGame}
            onOnlineAction={onRoomPartyAction}
            onCloseOnline={onCloseRoomPartyGame}
          />
        ) : hubMode === 'offline' ? (
          <RoomBoardGamePanel
            gameState={localBoardGame}
            currentUser={currentUser}
            lang={lang}
            moveError={localMoveErr}
            onStartGame={handleStartOfflineBoard}
            onJoinSeat={() => {}}
            onMove={(from, to, promo) => {
              if (!localBoardGame || localBoardGame.turn !== 'w') return;
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
            onStartGame={(gt, solo, clockMin) => onStartRoomBoardGame?.(gt, solo, clockMin)}
            onJoinSeat={(side) => onJoinBoardSeat?.(side)}
            onMove={(from, to, promo) => onMoveBoardGame?.(from, to, promo)}
            onResign={() => onResignBoardGame?.()}
            onReset={(opts) => onResetBoardGame?.(opts)}
            onCloseGame={() => onCloseBoardGame?.()}
          />
        )}
      </div>
    </div>
  );
};
