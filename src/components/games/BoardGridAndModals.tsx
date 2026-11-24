import React from 'react';
import { ChevronDown, ChevronUp, Flag, RotateCcw, Trophy } from 'lucide-react';
import type {
  AppLanguage,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
} from '../../types';
import { getConnect4DropRow, type LegalBoardMove } from '../../shared/boardGames';
import { VictoryCelebrationOverlay } from './GameEffects';
import { BOARD_FILES, CheckersToken3D, StauntonChessPiece } from './ChessCheckersPieces';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

interface BoardGridAndModalsProps {
  lang: AppLanguage;
  gameState: BoardGameState;
  fullScreenMode: boolean;
  canInteractCurrentTurn: boolean;
  selected: BoardCoord | null;
  setSelected: React.Dispatch<React.SetStateAction<BoardCoord | null>>;
  hoverCol: number | null;
  setHoverCol: React.Dispatch<React.SetStateAction<number | null>>;
  connect4WinningLine: BoardCoord[] | null;
  displayRows: number[];
  displayCols: number[];
  legalMoves: LegalBoardMove[];
  chessTheme: 'classic' | 'neon';
  moveSeqKey: number;
  turnLabel: string;
  winSubtitle: string;
  mySide: BoardSide | 'both' | null;
  pendingPromo: { from: BoardCoord; to: BoardCoord } | null;
  setPendingPromo: React.Dispatch<React.SetStateAction<{ from: BoardCoord; to: BoardCoord } | null>>;
  showHistory: boolean;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  handleSquareClick: (r: number, c: number) => void;
  onMove: (from: BoardCoord, to: BoardCoord, promotionPiece?: ChessPromotionPiece) => void;
  onResign: () => void;
  onReset: (opts?: { gameType?: BoardGameType; swapColors?: boolean; clockMinutes?: BoardClockMinutes }) => void;
}

export const BoardGridAndModals: React.FC<BoardGridAndModalsProps> = ({
  lang,
  gameState,
  fullScreenMode,
  canInteractCurrentTurn,
  selected,
  setSelected,
  hoverCol,
  setHoverCol,
  connect4WinningLine,
  displayRows,
  displayCols,
  legalMoves,
  chessTheme,
  moveSeqKey,
  turnLabel,
  winSubtitle,
  mySide,
  pendingPromo,
  setPendingPromo,
  showHistory,
  setShowHistory,
  handleSquareClick,
  onMove,
  onResign,
  onReset,
}) => {
  const matchHistory = gameState.matchHistory || [];

  return (
    <>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {gameState.gameType === 'connect4' ? (
          <div
            className={`relative mx-auto rounded-2xl p-2 sm:p-2.5 nc-tabletop-slate border border-white/[0.12] select-none touch-manipulation ${
              fullScreenMode ? 'w-[min(90vw,52dvh)] max-w-[440px] aspect-[7/6]' : 'w-full aspect-[7/6]'
            }`}
          >
            {/* 3D Beveled Cobalt Blue Connect-4 Chassis */}
            <div className="relative w-full h-full rounded-xl p-1.5 sm:p-2 bg-gradient-to-b from-[#1D4ED8] via-[#1E40AF] to-[#0F172A] border border-blue-400/35 shadow-[inset_0_2px_4px_rgba(255,255,255,0.35),inset_0_-8px_16px_rgba(7,14,35,0.85),0_12px_32px_rgba(0,0,0,0.7)] overflow-hidden">
              <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 rotate-45" /></span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 -rotate-45" /></span>
              <span className="absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 -rotate-12" /></span>
              <span className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 rotate-90" /></span>

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.06] to-transparent z-15" />

              <div className="grid grid-cols-7 grid-rows-6 gap-1.5 w-full h-full relative z-10">
                {Array.from({ length: 6 }).map((_, r) =>
                  Array.from({ length: 7 }).map((__, c) => {
                    const cell = gameState.board[r]?.[c] ?? null;
                    const isLastDrop =
                      gameState.lastMove?.to.r === r && gameState.lastMove?.to.c === c;
                    const nextDropRow = getConnect4DropRow(gameState.board, c);
                    const isPreviewTarget =
                      hoverCol === c && nextDropRow === r && canInteractCurrentTurn && !cell;
                    const isWinDisc = Boolean(
                      connect4WinningLine?.some((wCoord) => wCoord.r === r && wCoord.c === c)
                    );

                    const isHoveredCol =
                      hoverCol === c && canInteractCurrentTurn && nextDropRow !== null;

                    return (
                      <button
                        key={`c4-${r}-${c}`}
                        type="button"
                        onMouseEnter={() => setHoverCol(c)}
                        onMouseLeave={() => setHoverCol((curr) => (curr === c ? null : curr))}
                        onClick={() => handleSquareClick(r, c)}
                        aria-label={`Columna ${c + 1} Fila ${r + 1}`}
                        className={`relative w-full h-full rounded-full cursor-pointer flex items-center justify-center border shadow-[inset_0_4px_8px_rgba(0,0,0,0.95),inset_0_-1px_2px_rgba(147,197,253,0.25)] transition-all active:scale-95 ${
                          isHoveredCol
                            ? 'bg-[#0C172B] border-sky-400/55 ring-1 ring-sky-400/30'
                            : 'bg-[#070B14] border-blue-950/90'
                        }`}
                      >
                        {cell ? (
                          <div
                            key={isLastDrop ? `drop-${moveSeqKey}` : undefined}
                            style={
                              isLastDrop
                                ? ({ '--drop-rows': r + 1.4 } as React.CSSProperties)
                                : undefined
                            }
                            className={`w-[88%] h-[88%] rounded-full flex items-center justify-center ${
                              isLastDrop ? 'nc-c4-drop' : ''
                            } ${
                              cell === 'w'
                                ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#B45309] border border-yellow-100 shadow-[0_3px_8px_rgba(0,0,0,0.65),inset_0_2px_3px_rgba(255,255,255,0.9),inset_0_-3px_5px_rgba(113,63,18,0.65)]'
                                : 'bg-gradient-to-b from-[#FDA4AF] via-[#E11D48] to-[#881337] border border-rose-200/90 shadow-[0_3px_8px_rgba(0,0,0,0.7),inset_0_2px_3px_rgba(255,255,255,0.65),inset_0_-3px_5px_rgba(76,5,25,0.75)]'
                            } ${
                              isWinDisc
                                ? 'ring-2 ring-white ring-offset-1 ring-offset-amber-400 brightness-110 shadow-[0_0_16px_rgba(250,204,21,0.9)] animate-pulse'
                                : ''
                            }`}
                          >
                            <div
                              className={`w-[60%] h-[60%] rounded-full border ${
                                cell === 'w'
                                  ? 'border-amber-200/70 shadow-inner'
                                  : 'border-rose-200/50 shadow-inner'
                              }`}
                            />
                          </div>
                        ) : (
                          isPreviewTarget && (
                            <div
                              className={`w-[82%] h-[82%] rounded-full border-2 border-dashed flex items-center justify-center ${
                                gameState.turn === 'w'
                                  ? 'bg-amber-400/30 border-amber-300/80 text-amber-200'
                                  : 'bg-rose-400/30 border-rose-300/80 text-rose-200'
                              }`}
                            >
                              <ChevronDown className="w-4 h-4 animate-bounce" />
                            </div>
                          )
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {connect4WinningLine && connect4WinningLine.length === 4 && (
                <svg
                  viewBox="0 0 7 6"
                  className="pointer-events-none absolute inset-1.5 sm:inset-2 w-[calc(100%-0.75rem)] sm:w-[calc(100%-1rem)] h-[calc(100%-0.75rem)] sm:h-[calc(100%-1rem)] z-20"
                >
                  <line
                    x1={connect4WinningLine[0].c + 0.5}
                    y1={connect4WinningLine[0].r + 0.5}
                    x2={connect4WinningLine[3].c + 0.5}
                    y2={connect4WinningLine[3].r + 0.5}
                    stroke="#FFFFFF"
                    strokeWidth="0.24"
                    strokeLinecap="round"
                    opacity="0.6"
                  />
                  <line
                    x1={connect4WinningLine[0].c + 0.5}
                    y1={connect4WinningLine[0].r + 0.5}
                    x2={connect4WinningLine[3].c + 0.5}
                    y2={connect4WinningLine[3].r + 0.5}
                    stroke="#FACC15"
                    strokeWidth="0.12"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>

            <div className="absolute -bottom-2.5 inset-x-8 flex justify-between pointer-events-none z-0">
              <div className="w-10 h-3 rounded-b-lg bg-[#0F172A] border-b-2 border-x border-blue-400/35 shadow-[0_4px_8px_rgba(0,0,0,0.85)]" />
              <div className="w-10 h-3 rounded-b-lg bg-[#0F172A] border-b-2 border-x border-blue-400/35 shadow-[0_4px_8px_rgba(0,0,0,0.85)]" />
            </div>

            {gameState.status === 'finished' && (
              <VictoryCelebrationOverlay
                lang={lang}
                title={turnLabel}
                subtitle={winSubtitle}
                primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
                onPrimaryAction={() => {
                  triggerHaptic('medium');
                  onReset({ swapColors: false });
                }}
                secondaryLabel={pickLang(lang, {
                  es: 'Cambiar turnos',
                  ca: 'Canviar torns',
                  en: 'Swap starter',
                })}
                onSecondaryAction={() => {
                  triggerHaptic('light');
                  onReset({ swapColors: true });
                }}
              />
            )}
          </div>
        ) : (
          <div
            className={`relative mx-auto rounded-2xl p-2 sm:p-2.5 select-none touch-manipulation shadow-[0_14px_34px_rgba(0,0,0,0.75)] ${
              chessTheme === 'neon' && gameState.gameType === 'chess'
                ? 'nc-tabletop-slate border border-cyan-500/30'
                : 'bg-gradient-to-b from-[#3E271A] via-[#2A1910] to-[#1A0F09] border-2 border-[#6A4730]'
            } ${
              fullScreenMode ? 'w-[min(88vw,50dvh)] max-w-[430px] aspect-square' : 'w-full aspect-square'
            }`}
          >
            <div
              className={`grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden shadow-inner ${
                gameState.gameType === 'checkers'
                  ? 'border-2 border-[#180E0A] ring-1 ring-amber-900/30'
                  : chessTheme === 'neon'
                  ? 'border border-cyan-500/25'
                  : 'border-2 border-[#1B100A]'
              }`}
            >
              {displayRows.map((r, dispR) =>
                displayCols.map((c, dispC) => {
                  const isDark = (r + c) % 2 === 1;
                  const piece = gameState.board[r][c];
                  const isSelected = selected?.r === r && selected?.c === c;
                  const isLastFrom =
                    gameState.lastMove?.from.r === r && gameState.lastMove?.from.c === c;
                  const isLastTo =
                    gameState.lastMove?.to.r === r && gameState.lastMove?.to.c === c;
                  const legalTarget = legalMoves.find((m) => m.r === r && m.c === c);
                  const isKingInCheck =
                    gameState.gameType === 'chess' &&
                    gameState.inCheck &&
                    piece === `${gameState.inCheck}K`;

                  let squareBg = '';
                  if (gameState.gameType === 'checkers') {
                    if (isSelected) {
                      squareBg = 'bg-amber-600/75 shadow-[inset_0_0_10px_rgba(245,158,11,0.9)]';
                    } else if (isLastTo) {
                      squareBg = isDark ? 'bg-[#55301E]' : 'bg-[#D2B997]';
                    } else if (isLastFrom) {
                      squareBg = isDark ? 'bg-[#3D2114]' : 'bg-[#DFCDAF]';
                    } else if (isDark) {
                      squareBg = 'bg-[#231610] shadow-[inset_0_2px_4px_rgba(0,0,0,0.65)]';
                    } else {
                      squareBg = 'bg-[#ECE3CD]';
                    }
                  } else if (chessTheme === 'neon') {
                    if (isKingInCheck) {
                      squareBg = 'bg-rose-700/90 nc-check-aura';
                    } else if (isSelected) {
                      squareBg = 'bg-cyan-500/50 shadow-[inset_0_0_12px_rgba(6,182,212,0.8)]';
                    } else if (isLastTo) {
                      squareBg = isDark ? 'bg-[#163B54]' : 'bg-[#215777]';
                    } else if (isLastFrom) {
                      squareBg = isDark ? 'bg-[#102B3E]' : 'bg-[#1B435C]';
                    } else if (isDark) {
                      squareBg = 'bg-[#090F1C] border border-cyan-950/40';
                    } else {
                      squareBg = 'bg-[#16233B] border border-cyan-800/30';
                    }
                  } else {
                    if (isKingInCheck) {
                      squareBg = 'bg-rose-700/90 nc-check-aura';
                    } else if (isSelected) {
                      squareBg = 'bg-amber-500/75 shadow-[inset_0_0_12px_rgba(245,158,11,0.9)]';
                    } else if (isLastTo) {
                      squareBg = isDark ? 'bg-[#8F7A3E]' : 'bg-[#CDD26A]';
                    } else if (isLastFrom) {
                      squareBg = isDark ? 'bg-[#7A6836]' : 'bg-[#BFC460]';
                    } else if (isDark) {
                      squareBg = 'bg-[#946B49]';
                    } else {
                      squareBg = 'bg-[#EBD9B7]';
                    }
                  }

                  const showRank = c === displayCols[0];
                  const showFile = r === displayRows[7];

                  let animClass = '';
                  let animStyle: React.CSSProperties | undefined;
                  if (isLastTo && gameState.lastMove) {
                    const fromDispR = displayRows.indexOf(gameState.lastMove.from.r);
                    const fromDispC = displayCols.indexOf(gameState.lastMove.from.c);
                    if (fromDispR >= 0 && fromDispC >= 0) {
                      const dCols = fromDispC - dispC;
                      const dRows = fromDispR - dispR;
                      if (gameState.gameType === 'chess') {
                        animClass = 'nc-chess-glide';
                        animStyle = {
                          '--glide-x': `${dCols * 100}%`,
                          '--glide-y': `${dRows * 100}%`,
                        } as React.CSSProperties;
                      } else if (gameState.gameType === 'checkers') {
                        animClass = gameState.lastMove.captured ? 'nc-checkers-arc' : 'nc-chess-glide';
                        animStyle = gameState.lastMove.captured
                          ? ({
                              '--jump-x': `${dCols * 100}%`,
                              '--jump-y': `${dRows * 100}%`,
                            } as React.CSSProperties)
                          : ({
                              '--glide-x': `${dCols * 100}%`,
                              '--glide-y': `${dRows * 100}%`,
                            } as React.CSSProperties);
                      }
                    }
                  }

                  const renderSquarePiece = () => {
                    if (!piece) return null;
                    if (gameState.gameType === 'checkers') {
                      const isWhite = piece === 'w' || piece === 'W';
                      const isKing = piece === 'W' || piece === 'B';
                      return (
                        <CheckersToken3D
                          isWhite={isWhite}
                          isKing={isKing}
                          animateCrownDrop={Boolean(isLastTo && gameState.lastMove?.promoted)}
                        />
                      );
                    }
                    const side = (piece[0] as BoardSide) || 'w';
                    const kind = piece[1] || 'P';
                    return <StauntonChessPiece side={side} kind={kind} theme={chessTheme} />;
                  };

                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => handleSquareClick(r, c)}
                      aria-label={`${BOARD_FILES[c]}${8 - r}`}
                      className={`relative w-full h-full flex items-center justify-center cursor-pointer transition-colors ${squareBg}`}
                    >
                      {showRank && (
                        <span
                          className={`absolute top-0.5 left-0.5 text-[8px] font-mono font-bold leading-none pointer-events-none ${
                            chessTheme !== 'neon' && !isDark
                              ? 'text-[#5C3D28]/80'
                              : 'text-white/75'
                          }`}
                        >
                          {8 - r}
                        </span>
                      )}
                      {showFile && (
                        <span
                          className={`absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold leading-none pointer-events-none ${
                            chessTheme !== 'neon' && !isDark
                              ? 'text-[#5C3D28]/80'
                              : 'text-white/75'
                          }`}
                        >
                          {BOARD_FILES[c]}
                        </span>
                      )}

                      {piece && (
                        <div
                          key={isLastTo ? `move-${moveSeqKey}` : undefined}
                          style={animStyle}
                          className={`w-full h-full flex items-center justify-center ${animClass}`}
                        >
                          {renderSquarePiece()}
                        </div>
                      )}

                      {legalTarget && (
                        <span
                          className={`pointer-events-none absolute z-10 ${
                            legalTarget.isCapture
                              ? 'inset-1.5 rounded-full border-[3px] border-rose-400/95 shadow-[0_0_14px_rgba(244,63,94,0.95)] animate-pulse'
                              : 'w-[28%] h-[28%] rounded-full bg-emerald-400/95 shadow-[0_0_10px_rgba(16,185,129,0.85)] animate-pulse'
                          }`}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {pendingPromo && (
              <div className="absolute inset-0 z-20 rounded-2xl bg-black/78 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  {pickLang(lang, {
                    es: 'Promocionar peón a:',
                    ca: 'Promocionar peó a:',
                    en: 'Promote pawn to:',
                  })}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {(['Q', 'R', 'B', 'N'] as ChessPromotionPiece[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onMove(pendingPromo.from, pendingPromo.to, p);
                        setPendingPromo(null);
                        setSelected(null);
                      }}
                      className="w-13 h-13 rounded-2xl bg-[#26262C] hover:bg-[#9146FF] border border-white/20 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                    >
                      <StauntonChessPiece side={gameState.turn} kind={p} theme={chessTheme} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState.status === 'finished' && (
              <VictoryCelebrationOverlay
                lang={lang}
                title={turnLabel}
                subtitle={winSubtitle}
                primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
                onPrimaryAction={() => {
                  triggerHaptic('medium');
                  onReset({ swapColors: false });
                }}
                secondaryLabel={pickLang(lang, {
                  es: 'Cambiar colores',
                  ca: 'Canviar colors',
                  en: 'Swap colors',
                })}
                onSecondaryAction={() => {
                  triggerHaptic('light');
                  onReset({ swapColors: true });
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom Move History & Controls */}
      <div className="flex items-center justify-between gap-2 pt-0.5 shrink-0">
        <div className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap text-[11px] font-mono tabular-nums text-zinc-400 bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-1.5 no-scrollbar">
          {gameState.moveHistory.length === 0
            ? pickLang(lang, { es: 'Sin jugadas', ca: 'Sense jugades', en: 'No moves' })
            : gameState.moveHistory.slice(-8).join(' · ')}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {mySide && gameState.status !== 'finished' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onResign();
              }}
              title={pickLang(lang, { es: 'Rendirse', ca: 'Rendir-se', en: 'Resign' })}
              className="h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 border border-white/[0.08] text-[11px] font-semibold text-zinc-300 hover:text-rose-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Flag className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Rendirse', ca: 'Rendir-se', en: 'Resign' })}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onReset({ swapColors: false });
            }}
            title={pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Reset' })}
            className="h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Reset' })}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Match History */}
      {matchHistory.length > 0 && !fullScreenMode && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-zinc-300 hover:text-white cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {pickLang(lang, {
                  es: `Historial (${matchHistory.length})`,
                  ca: `Historial (${matchHistory.length})`,
                  en: `History (${matchHistory.length})`,
                })}
              </span>
            </span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showHistory && (
            <div className="px-3 pb-2 space-y-1 border-t border-white/[0.06] pt-1.5 max-h-32 overflow-y-auto custom-scrollbar">
              {[...matchHistory].reverse().map((mh) => (
                <div key={mh.id} className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="truncate">
                    <strong className="text-zinc-200">{mh.winnerName}</strong> · {mh.gameType}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                    {mh.reason || 'fin'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};
