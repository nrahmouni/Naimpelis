import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  ArrowUpDown,
  Sparkles,
  X,
  ArrowLeft,
  Play,
  Timer,
} from 'lucide-react';
import {
  AppLanguage,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
  Participant,
} from '../types';
import {
  findConnect4WinningLine,
  getConnect4DropRow,
  getLegalMovesForSquare,
  getPieceSide,
} from '../shared/boardGames';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { GameVoiceBar } from './games/GameVoiceBar';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  playGameSfx,
  useGameFloatingReaction,
  useGameSoundMute,
} from './games/GameEffects';
import {
  BoardLauncherView,
  BoardPlayerSeatsRow,
  computeCheckersCaptured,
  computeChessMaterial,
} from './games/BoardPanelLauncherAndSeats';
import { BoardGridAndModals } from './games/BoardGridAndModals';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface RoomBoardGamePanelProps {
  gameState: BoardGameState | null;
  currentUser: Participant;
  lang: AppLanguage;
  onStartGame: (gameType: BoardGameType, soloLocal?: boolean, clockMinutes?: BoardClockMinutes) => void;
  onJoinSeat: (side: 'w' | 'b' | 'spectate') => void;
  onStartMatch?: () => void;
  onMove: (from: BoardCoord, to: BoardCoord, promotionPiece?: ChessPromotionPiece) => void;
  onResign: () => void;
  onReset: (opts?: { gameType?: BoardGameType; swapColors?: boolean; clockMinutes?: BoardClockMinutes }) => void;
  onCloseGame: () => void;
  moveError?: string | null;
  onBack?: () => void;
  voiceChat?: GameVoiceChatState;
  isOnlineRoom?: boolean;
  isHost?: boolean;
  fullScreenMode?: boolean;
  hideGameSwitcher?: boolean;
  hideVoiceBar?: boolean;
  mutedOverride?: boolean;
  onToggleMuteOverride?: () => void;
}

export const RoomBoardGamePanel: React.FC<RoomBoardGamePanelProps> = ({
  gameState,
  currentUser,
  lang,
  onStartGame,
  onJoinSeat,
  onStartMatch,
  onMove,
  onResign,
  onReset,
  onCloseGame,
  moveError,
  onBack,
  voiceChat,
  isOnlineRoom = false,
  isHost = false,
  fullScreenMode = false,
  hideGameSwitcher = false,
  hideVoiceBar = false,
  mutedOverride,
  onToggleMuteOverride,
}) => {
  const [selected, setSelected] = useState<BoardCoord | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: BoardCoord; to: BoardCoord } | null>(null);
  const [manualFlip, setManualFlip] = useState<boolean | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localMuted, toggleLocalMute] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;
  const toggleMute = onToggleMuteOverride || toggleLocalMute;
  const [selectedClockMin, setSelectedClockMin] = useState<BoardClockMinutes>(0);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [chessTheme, setChessTheme] = useState<'classic' | 'neon'>('classic');
  const prevMoveCountRef = useRef<number>(0);

  const chessMaterial = useMemo(() => computeChessMaterial(gameState), [gameState]);
  const checkersCaptured = useMemo(() => computeCheckersCaptured(gameState), [gameState]);

  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [gameState?.status, gameState?.turnDeadlineAt, gameState?.updatedAt]);

  useEffect(() => {
    setSelected(null);
    setPendingPromo(null);
  }, [gameState?.updatedAt, gameState?.turn, gameState?.gameType]);

  // Tactile sound effects synced cleanly to board updates
  useEffect(() => {
    if (!gameState) {
      prevMoveCountRef.current = 0;
      return;
    }
    const moveCount = gameState.moveHistory?.length || 0;
    const isFreshMove = moveCount > prevMoveCountRef.current;
    prevMoveCountRef.current = moveCount;

    if (muted) return;
    if (gameState.status === 'finished' && gameState.winner && gameState.winner !== 'draw') {
      playGameSfx('victory', false);
      return;
    }
    if (!isFreshMove) return;
    if (gameState.inCheck) {
      playGameSfx('board_check', false);
      return;
    }
    if (gameState.lastMove?.promoted) {
      playGameSfx('crown_drop', false);
      return;
    }
    if (gameState.gameType === 'connect4' && gameState.lastMove) {
      playGameSfx('board_drop', false);
      return;
    }
    if (gameState.lastMove) {
      playGameSfx(gameState.lastMove.captured ? 'board_capture' : 'board_move', false);
    }
  }, [gameState?.updatedAt, gameState?.status, gameState?.inCheck, muted]);

  useEffect(() => {
    if (!muted && moveError) {
      playGameSfx('error', false);
    }
  }, [moveError, muted]);

  const mySide: BoardSide | 'both' | null = useMemo(() => {
    if (!gameState) return null;
    if (gameState.soloLocal) return 'both';
    const isW = gameState.players.w?.userId === currentUser.id;
    const isB = gameState.players.b?.userId === currentUser.id;
    if (isW && isB) return 'both';
    if (isW) return 'w';
    if (isB) return 'b';
    return null;
  }, [gameState, currentUser.id]);

  const canInteractCurrentTurn = useMemo(() => {
    if (!gameState || gameState.status !== 'playing') return false;
    if (gameState.soloLocal) return true;
    const activeSeat = gameState.players[gameState.turn];
    return Boolean(activeSeat && activeSeat.userId === currentUser.id);
  }, [gameState, currentUser.id]);

  useEffect(() => {
    if (
      gameState?.gameType === 'checkers' &&
      gameState.mustContinueFrom &&
      canInteractCurrentTurn
    ) {
      setSelected(gameState.mustContinueFrom);
    }
  }, [gameState?.mustContinueFrom, gameState?.gameType, canInteractCurrentTurn]);

  const legalMoves = useMemo(() => {
    if (!gameState || !selected || gameState.gameType === 'connect4') return [];
    return getLegalMovesForSquare(gameState, selected);
  }, [gameState, selected]);

  const connect4WinningLine = useMemo(() => {
    if (!gameState || gameState.gameType !== 'connect4' || gameState.status !== 'finished') {
      return null;
    }
    if (gameState.winningLine && gameState.winningLine.length === 4) {
      return gameState.winningLine;
    }
    if (gameState.winner === 'w' || gameState.winner === 'b') {
      return findConnect4WinningLine(gameState.board, gameState.winner);
    }
    return null;
  }, [gameState]);

  const isFlipped = manualFlip !== null ? manualFlip : mySide === 'b';

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (!gameState || gameState.status === 'finished') return;
      if (!canInteractCurrentTurn) {
        triggerHaptic('light');
        return;
      }

      if (gameState.gameType === 'connect4') {
        const dropRow = getConnect4DropRow(gameState.board, c);
        if (dropRow >= 0) {
          triggerHaptic('light');
          onMove({ r: 0, c }, { r: dropRow, c });
        }
        return;
      }

      const targetMove = legalMoves.find((m) => m.r === r && m.c === c);
      if (selected && targetMove) {
        if (gameState.gameType === 'chess' && targetMove.isPromotion) {
          setPendingPromo({ from: selected, to: { r, c } });
          return;
        }
        triggerHaptic('light');
        onMove(selected, { r, c });
        setSelected(null);
        return;
      }

      const piece = gameState.board[r][c];
      const pieceSide = getPieceSide(piece);
      if (piece && pieceSide === gameState.turn) {
        if (
          gameState.gameType === 'checkers' &&
          gameState.mustContinueFrom &&
          (gameState.mustContinueFrom.r !== r || gameState.mustContinueFrom.c !== c)
        ) {
          return;
        }
        const movesForPiece = getLegalMovesForSquare(gameState, { r, c });
        if (movesForPiece.length > 0) {
          triggerHaptic('light');
          setSelected({ r, c });
        } else {
          setSelected(null);
        }
      } else {
        setSelected(null);
      }
    },
    [gameState, canInteractCurrentTurn, legalMoves, selected, onMove]
  );

  if (!gameState) {
    return (
      <BoardLauncherView
        lang={lang}
        onBack={onBack}
        isOnlineRoom={isOnlineRoom}
        hideVoiceBar={hideVoiceBar}
        voiceChat={voiceChat}
        selectedClockMin={selectedClockMin}
        setSelectedClockMin={setSelectedClockMin}
        onStartGame={onStartGame}
      />
    );
  }

  // ==========================================================================
  // 2. ACTIVE BOARD VIEW
  // ==========================================================================
  const whiteSeat = gameState.players.w;
  const blackSeat = gameState.players.b;
  const displayRows = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const getSideClockMs = (side: BoardSide): number | null => {
    if (!gameState.clockMinutes || !gameState.clocksMs) return null;
    const base = gameState.clocksMs[side] ?? 0;
    if (gameState.status === 'playing' && gameState.turn === side && gameState.turnStartedAt) {
      return Math.max(0, base - Math.max(0, nowTs - gameState.turnStartedAt));
    }
    return base;
  };

  const getSideLabel = (side: BoardSide) => {
    if (gameState.gameType === 'connect4') {
      return side === 'w'
        ? pickLang(lang, { es: 'Amarillas', ca: 'Grogues', en: 'Yellow' })
        : pickLang(lang, { es: 'Rojas', ca: 'Roges', en: 'Red' });
    }
    if (side === 'w') return pickLang(lang, { es: 'Blancas', ca: 'Blanques', en: 'White' });
    return gameState.gameType === 'checkers'
      ? pickLang(lang, { es: 'Rojas', ca: 'Roges', en: 'Red' })
      : pickLang(lang, { es: 'Negras', ca: 'Negres', en: 'Black' });
  };

  const turnLabel =
    gameState.status === 'finished'
      ? gameState.winner === 'draw'
        ? pickLang(lang, { es: 'Empate', ca: 'Empat', en: 'Draw' })
        : pickLang(lang, {
            es: `Gana ${
              gameState.winner === 'w'
                ? whiteSeat?.name || getSideLabel('w')
                : blackSeat?.name || getSideLabel('b')
            }`,
            ca: `Guanya ${
              gameState.winner === 'w'
                ? whiteSeat?.name || getSideLabel('w')
                : blackSeat?.name || getSideLabel('b')
            }`,
            en: `${
              gameState.winner === 'w'
                ? whiteSeat?.name || getSideLabel('w')
                : blackSeat?.name || getSideLabel('b')
            } wins`,
          })
      : gameState.soloLocal
      ? `${pickLang(lang, { es: 'Modo Libre', ca: 'Mode Lliure', en: 'Free Play' })} · ${
          gameState.turn === 'w' ? getSideLabel('w') : getSideLabel('b')
        }`
      : gameState.status === 'waiting'
      ? pickLang(lang, {
          es: 'Elige color y pulsa Play',
          ca: 'Tria color i prem Play',
          en: 'Pick side & press Play',
        })
      : canInteractCurrentTurn
      ? pickLang(lang, { es: 'Tu turno', ca: 'El teu torn', en: 'Your turn' })
      : pickLang(lang, {
          es: `Turno: ${
            gameState.turn === 'w'
              ? whiteSeat?.name || getSideLabel('w')
              : blackSeat?.name || getSideLabel('b')
          }`,
          ca: `Torn: ${
            gameState.turn === 'w'
              ? whiteSeat?.name || getSideLabel('w')
              : blackSeat?.name || getSideLabel('b')
          }`,
          en: `Turn: ${
            gameState.turn === 'w'
              ? whiteSeat?.name || getSideLabel('w')
              : blackSeat?.name || getSideLabel('b')
          }`,
        });

  const matchHistory = gameState.matchHistory || [];
  const remainingTurnSec =
    gameState.status === 'playing' && gameState.turnDeadlineAt
      ? Math.max(0, Math.ceil((gameState.turnDeadlineAt - nowTs) / 1000))
      : 15;

  const moveSeqKey = gameState.moveHistory.length;

  const winSubtitle =
    gameState.winReason === 'connect4'
      ? pickLang(lang, { es: '4 en raya', ca: '4 en ratlla', en: '4 in a row!' })
      : gameState.winReason === 'checkmate'
      ? pickLang(lang, { es: 'Jaque mate', ca: 'Escac i mat', en: 'Checkmate' })
      : gameState.winReason === 'stalemate'
      ? pickLang(lang, { es: 'Rey ahogado (Tablas)', ca: 'Rei ofegat', en: 'Stalemate (Draw)' })
      : gameState.winReason === 'threefold_repetition'
      ? pickLang(lang, { es: 'Triple repetición', ca: 'Triple repetició', en: 'Threefold repetition' })
      : gameState.winReason === 'fifty_moves'
      ? pickLang(lang, { es: 'Regla 50 jugadas', ca: 'Regla 50 jugades', en: '50-move draw' })
      : gameState.winReason === 'insufficient_material'
      ? pickLang(lang, { es: 'Material insuficiente', ca: 'Material insuficient', en: 'Insufficient material' })
      : gameState.winReason === 'timeout'
      ? pickLang(lang, { es: 'Tiempo agotado', ca: 'Temps esgotat', en: 'Time out' })
      : gameState.winReason === 'resign'
      ? pickLang(lang, { es: 'Por rendición', ca: 'Per rendició', en: 'By resignation' })
      : gameState.winReason === 'no_moves'
      ? pickLang(lang, { es: 'Sin movimientos', ca: 'Sense moviments', en: 'No legal moves' })
      : gameState.winner === 'draw'
      ? pickLang(lang, { es: 'Empate', ca: 'Empat', en: 'Draw' })
      : pickLang(lang, { es: 'Todas las fichas capturadas', ca: 'Totes capturades', en: 'All captured' });

  const { floatingReaction, sendReaction } = useGameFloatingReaction(!isOnlineRoom);

  const renderBoardContent = (largeMode: boolean) => (
    <div
      className={`relative flex flex-col ${
        fullScreenMode
          ? 'justify-between h-full overflow-hidden gap-2 max-w-[600px] w-full mx-auto'
          : largeMode
          ? 'gap-3 max-w-[540px] w-full mx-auto'
          : 'gap-2 w-full'
      }`}
    >
      {!fullScreenMode && (
        <GameFloatingReactionToast reaction={floatingReaction} className="top-10 right-2" />
      )}
      {/* Compact Utility Bar (No multi-game switcher strip) */}
      {!hideGameSwitcher && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              {gameState.gameType === 'connect4'
                ? pickLang(lang, { es: '🟡 Conecta 4', ca: '🟡 Connecta 4', en: '🟡 Connect 4' })
                : gameState.gameType === 'checkers'
                ? pickLang(lang, { es: '🔴 Damas Españolas', ca: '🔴 Dames Espanyoles', en: '🔴 Checkers' })
                : pickLang(lang, { es: '♟️ Ajedrez FIDE', ca: '♟️ Escacs FIDE', en: '♟️ FIDE Chess' })}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {gameState.gameType === 'chess' && (
              <button
                type="button"
                onClick={() => setChessTheme((t) => (t === 'classic' ? 'neon' : 'classic'))}
                title={chessTheme === 'classic' ? 'Tema Neón' : 'Tema Clásico'}
                className="h-8 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center gap-1 text-[11px] font-bold text-zinc-300 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-[#BF94FF]" />
                <span className="hidden sm:inline">{chessTheme === 'classic' ? 'Clásico' : 'Neón'}</span>
              </button>
            )}
            {gameState.gameType !== 'connect4' && (
              <button
                type="button"
                onClick={() => setManualFlip((f) => !(f ?? isFlipped))}
                title={pickLang(lang, { es: 'Girar tablero', ca: 'Girar tauler', en: 'Flip board' })}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            )}
            {!fullScreenMode && (
              <GameReactionButton
                lang={lang}
                compact
                onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
              />
            )}
            <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
            {!fullScreenMode && (
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={largeMode ? 'Reducir' : 'Ampliar'}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-[#BF94FF] cursor-pointer"
              >
                {largeMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onCloseGame();
              }}
              title={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {isOnlineRoom && !hideVoiceBar && !gameState.soloLocal && voiceChat && (
        <GameVoiceBar lang={lang} voice={voiceChat} compact />
      )}

      <BoardPlayerSeatsRow
        lang={lang}
        gameState={gameState}
        currentUser={currentUser}
        voiceChat={voiceChat}
        voicePeerMap={voicePeerMap}
        chessMaterial={chessMaterial}
        checkersCaptured={checkersCaptured}
        getSideLabel={getSideLabel}
        getSideClockMs={getSideClockMs}
        onJoinSeat={onJoinSeat}
      />

      {/* Turn / Play Status Bar */}
      <div
        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 shrink-0 ${
          gameState.status === 'finished'
            ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
            : gameState.inCheck
            ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
            : canInteractCurrentTurn
            ? 'bg-[#9146FF]/15 border-[#9146FF]/40 text-[#DFCCFF]'
            : 'bg-white/[0.03] border-white/[0.06] text-zinc-300'
        }`}
      >
        <span className="truncate">
          {gameState.inCheck && gameState.status !== 'finished'
            ? `⚠️ ${pickLang(lang, { es: '¡JAQUE!', ca: 'ESCAC!', en: 'CHECK!' })} · ${turnLabel}`
            : gameState.mustContinueFrom
            ? `⚡ ${pickLang(lang, {
                es: 'Captura múltiple obligatoria',
                ca: 'Captura múltiple obligatòria',
                en: 'Multi-jump required',
              })}`
            : turnLabel}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {gameState.status === 'waiting' && (isHost || gameState.soloLocal) && onStartMatch && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onStartMatch();
              }}
              className="h-7 px-3 rounded-lg bg-gradient-to-r from-[#9146FF] to-emerald-500 text-[11px] font-extrabold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 shrink-0 shadow-md"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Play</span>
            </button>
          )}
          {gameState.status === 'playing' && (
            <span
              className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 ${
                remainingTurnSec <= 4
                  ? 'bg-rose-500/25 text-rose-200'
                  : 'bg-white/[0.08] text-zinc-200'
              }`}
            >
              <Timer className="w-3 h-3" />
              <span>{remainingTurnSec}s</span>
            </span>
          )}
          {gameState.gameType !== 'connect4' && hideGameSwitcher && (
            <button
              type="button"
              onClick={() => setManualFlip((f) => !(f ?? isFlipped))}
              title={pickLang(lang, { es: 'Girar tablero', ca: 'Girar tauler', en: 'Flip board' })}
              className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 cursor-pointer"
            >
              <ArrowUpDown className="w-3 h-3" />
            </button>
          )}
          {mySide && mySide !== 'both' && !gameState.soloLocal && gameState.status !== 'finished' && (
            <button
              type="button"
              onClick={() => onJoinSeat('spectate')}
              className="text-[10px] text-zinc-400 hover:text-white underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pickLang(lang, { es: 'Espectar', ca: 'Mirar', en: 'Spectate' })}
            </button>
          )}
        </div>
      </div>

      {moveError && (
        <div className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200 shrink-0">
          {moveError}
        </div>
      )}

      <BoardGridAndModals
        lang={lang}
        gameState={gameState}
        fullScreenMode={fullScreenMode}
        canInteractCurrentTurn={canInteractCurrentTurn}
        selected={selected}
        setSelected={setSelected}
        hoverCol={hoverCol}
        setHoverCol={setHoverCol}
        connect4WinningLine={connect4WinningLine}
        displayRows={displayRows}
        displayCols={displayCols}
        legalMoves={legalMoves}
        chessTheme={chessTheme}
        moveSeqKey={moveSeqKey}
        turnLabel={turnLabel}
        winSubtitle={winSubtitle}
        mySide={mySide}
        pendingPromo={pendingPromo}
        setPendingPromo={setPendingPromo}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        handleSquareClick={handleSquareClick}
        onMove={onMove}
        onResign={onResign}
        onReset={onReset}
      />
    </div>
  );

  return (
    <>
      <div
        className={`flex-1 ${
          fullScreenMode
            ? 'h-full overflow-hidden p-1.5 sm:p-2 flex flex-col'
            : 'overflow-y-auto p-3 space-y-2.5 custom-scrollbar'
        }`}
      >
        {onBack && !hideGameSwitcher && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}</span>
          </button>
        )}
        {renderBoardContent(false)}
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 z-[195] bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full max-w-[580px] rounded-3xl bg-[#141418] border border-white/[0.12] p-4 sm:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.9)] max-h-[94dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {renderBoardContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
