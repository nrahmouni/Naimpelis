import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Flag,
  Maximize2,
  Minimize2,
  RotateCcw,
  RefreshCw,
  ArrowUpDown,
  Volume2,
  VolumeX,
  Users,
  Sparkles,
  X,
  ArrowLeft,
  Swords,
} from 'lucide-react';
import {
  AppLanguage,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
  Participant,
} from '../types';
import {
  getLegalMovesForSquare,
  getPieceSide,
} from '../shared/boardGames';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface RoomBoardGamePanelProps {
  gameState: BoardGameState | null;
  currentUser: Participant;
  lang: AppLanguage;
  onStartGame: (gameType: BoardGameType, soloLocal?: boolean) => void;
  onJoinSeat: (side: 'w' | 'b' | 'spectate') => void;
  onMove: (from: BoardCoord, to: BoardCoord, promotionPiece?: ChessPromotionPiece) => void;
  onResign: () => void;
  onReset: (opts?: { gameType?: BoardGameType; swapColors?: boolean }) => void;
  onCloseGame: () => void;
  moveError?: string | null;
  onBack?: () => void;
}

// Clean Web Audio tactile feedback without external sound files
let sharedAudioCtx: AudioContext | null = null;
function playBoardSfx(kind: 'move' | 'capture' | 'check' | 'win' | 'error') {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    const tone = (freq: number, dur: number, type: OscillatorType, gainVal: number, delay = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(gainVal, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur);
    };

    if (kind === 'move') {
      tone(220, 0.055, 'triangle', 0.09);
    } else if (kind === 'capture') {
      tone(160, 0.07, 'sawtooth', 0.07);
      tone(310, 0.06, 'triangle', 0.08, 0.02);
    } else if (kind === 'check') {
      tone(587, 0.1, 'sine', 0.08);
      tone(880, 0.14, 'sine', 0.07, 0.07);
    } else if (kind === 'win') {
      tone(523.25, 0.12, 'triangle', 0.09, 0);
      tone(659.25, 0.12, 'triangle', 0.09, 0.09);
      tone(783.99, 0.22, 'triangle', 0.1, 0.18);
    } else if (kind === 'error') {
      tone(150, 0.11, 'sawtooth', 0.06);
    }
  } catch {
    // ignore audio errors cleanly
  }
}

const CHESS_GLYPHS: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function renderBoardPiece(piece: string) {
  if (piece === 'w' || piece === 'W' || piece === 'b' || piece === 'B') {
    const isWhite = piece === 'w' || piece === 'W';
    const isKing = piece === 'W' || piece === 'B';
    return (
      <div
        className={`w-[76%] h-[76%] rounded-full flex items-center justify-center shadow-[0_3px_6px_rgba(0,0,0,0.65)] transition-transform duration-150 ${
          isWhite
            ? 'bg-gradient-to-b from-zinc-50 to-zinc-300 border-2 border-white ring-1 ring-black/30 text-amber-600'
            : 'bg-gradient-to-b from-rose-500 to-rose-700 border-2 border-rose-300/80 ring-1 ring-black/50 text-amber-200'
        }`}
      >
        <div
          className={`w-[66%] h-[66%] rounded-full flex items-center justify-center border ${
            isWhite ? 'border-zinc-400/50' : 'border-rose-200/35'
          }`}
        >
          {isKing && <Crown className="w-[65%] h-[65%] fill-current drop-shadow-sm" />}
        </div>
      </div>
    );
  }

  const side = piece[0] as BoardSide;
  const kind = piece[1] || 'P';
  const glyph = CHESS_GLYPHS[kind] || '♟';
  const isWhite = side === 'w';

  return (
    <span
      className="select-none leading-none font-serif transition-transform duration-150"
      style={{
        fontSize: 'clamp(1.25rem, 4.2vw, 2rem)',
        color: isWhite ? '#FAFAFA' : '#18181B',
        textShadow: isWhite
          ? '0 1px 2px rgba(0,0,0,0.92), 0 0 1px rgba(0,0,0,0.95)'
          : '0 0 1.5px rgba(255,255,255,0.85), 0 1px 3px rgba(0,0,0,0.7)',
        WebkitTextStroke: isWhite ? '0.6px #18181B' : '0.6px #E4E4E7',
      }}
    >
      {glyph}
    </span>
  );
}

export const RoomBoardGamePanel: React.FC<RoomBoardGamePanelProps> = ({
  gameState,
  currentUser,
  lang,
  onStartGame,
  onJoinSeat,
  onMove,
  onResign,
  onReset,
  onCloseGame,
  moveError,
  onBack,
}) => {
  const [selected, setSelected] = useState<BoardCoord | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: BoardCoord; to: BoardCoord } | null>(null);
  const [manualFlip, setManualFlip] = useState<boolean | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [muted, setMuted] = useState(false);

  // Clear selection whenever turn or board updates
  useEffect(() => {
    setSelected(null);
    setPendingPromo(null);
  }, [gameState?.updatedAt, gameState?.turn, gameState?.gameType]);

  // Play tactile SFX when authoritative state transitions
  useEffect(() => {
    if (muted || !gameState) return;
    if (gameState.status === 'finished' && gameState.winner) {
      playBoardSfx('win');
      return;
    }
    if (gameState.inCheck) {
      playBoardSfx('check');
      return;
    }
    if (gameState.lastMove) {
      playBoardSfx(gameState.lastMove.captured ? 'capture' : 'move');
    }
  }, [gameState?.updatedAt, muted]);

  useEffect(() => {
    if (!muted && moveError) {
      playBoardSfx('error');
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
    if (!gameState || gameState.status === 'finished') return false;
    if (gameState.soloLocal) return true;
    const activeSeat = gameState.players[gameState.turn];
    return Boolean(activeSeat && activeSeat.userId === currentUser.id);
  }, [gameState, currentUser.id]);

  // Keep forced checkers chain selected automatically
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
    if (!gameState || !selected) return [];
    return getLegalMovesForSquare(gameState, selected);
  }, [gameState, selected]);

  const isFlipped = manualFlip !== null ? manualFlip : mySide === 'b';

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (!gameState || gameState.status === 'finished') return;
      if (!canInteractCurrentTurn) {
        triggerHaptic('light');
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

  // ==========================================================================
  // 1. GAME LAUNCHER VIEW (NO ACTIVE BOARD YET)
  // ==========================================================================
  if (!gameState) {
    return (
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Volver a Sala', ca: 'Tornar a la Sala', en: 'Back to Room' })}</span>
          </button>
        )}

        <div className="p-4 rounded-3xl nc-specular-surface border border-white/[0.1] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
            <Swords className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Juegos en Sala Online',
                ca: 'Jocs a la Sala Online',
                en: 'Live Room Board Games',
              })}
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {pickLang(lang, {
              es: 'Reta en tiempo real a tus amigos en esta sala mientras veis la película o el partido. Los turnos y reglas se validan al instante en el servidor.',
              ca: 'Repta en temps real els teus amics en aquesta sala mentre mireu la pel·lícula o el partit.',
              en: 'Challenge friends live inside this room while watching together. Moves and rules are validated server-side.',
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {/* Checkers Card */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/25 to-zinc-800 border border-rose-400/35 flex items-center justify-center text-lg shrink-0">
                  🔴
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">
                    {pickLang(lang, { es: 'Damas Clásicas', ca: 'Dames Clàssiques', en: 'Checkers' })}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {pickLang(lang, {
                      es: 'Captura obligatoria · Captura múltiple · Coronación',
                      ca: 'Captura obligatòria · Captura múltiple · Coronació',
                      en: 'Forced jump · Multi-jump · King promotion',
                    })}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onStartGame('checkers', false);
                }}
                className="min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>{pickLang(lang, { es: 'Jugar Online', ca: 'Jugar Online', en: 'Play Online' })}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onStartGame('checkers', true);
                }}
                className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                <span>{pickLang(lang, { es: 'Modo Libre (Solo)', ca: 'Mode Lliure', en: 'Solo Practice' })}</span>
              </button>
            </div>
          </div>

          {/* Chess Card */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9146FF]/30 to-zinc-800 border border-[#9146FF]/40 flex items-center justify-center text-lg shrink-0">
                  ♟️
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">
                    {pickLang(lang, { es: 'Ajedrez 1v1', ca: 'Escacs 1v1', en: 'Chess 1v1' })}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {pickLang(lang, {
                      es: 'Enroque · Al paso · Promoción · Jaque mate',
                      ca: 'Enroc · Al pas · Promoció · Escac i mat',
                      en: 'Castling · En passant · Promotion · Checkmate',
                    })}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onStartGame('chess', false);
                }}
                className="min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>{pickLang(lang, { es: 'Jugar Online', ca: 'Jugar Online', en: 'Play Online' })}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onStartGame('chess', true);
                }}
                className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                <span>{pickLang(lang, { es: 'Modo Libre (Solo)', ca: 'Mode Lliure', en: 'Solo Practice' })}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 2. ACTIVE BOARD VIEW (RENDERED INLINE OR INSIDE EXPANDED MODAL)
  // ==========================================================================
  const whiteSeat = gameState.players.w;
  const blackSeat = gameState.players.b;
  const displayRows = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const turnLabel =
    gameState.status === 'finished'
      ? gameState.winner === 'draw'
        ? pickLang(lang, { es: 'Tablas', ca: 'Taules', en: 'Draw' })
        : pickLang(lang, {
            es: `Gana ${
              gameState.winner === 'w'
                ? whiteSeat?.name || 'Blancas'
                : blackSeat?.name || 'Negras'
            }`,
            ca: `Guanya ${
              gameState.winner === 'w'
                ? whiteSeat?.name || 'Blanques'
                : blackSeat?.name || 'Negres'
            }`,
            en: `${
              gameState.winner === 'w'
                ? whiteSeat?.name || 'White'
                : blackSeat?.name || 'Black'
            } wins`,
          })
      : gameState.soloLocal
      ? `${pickLang(lang, { es: 'Modo Libre', ca: 'Mode Lliure', en: 'Free Play' })} · ${
          gameState.turn === 'w'
            ? pickLang(lang, { es: 'Mueven Blancas', ca: 'Mouen Blanques', en: 'White to move' })
            : gameState.gameType === 'checkers'
            ? pickLang(lang, { es: 'Mueven Rojas', ca: 'Mouen Roges', en: 'Red to move' })
            : pickLang(lang, { es: 'Mueven Negras', ca: 'Mouen Negres', en: 'Black to move' })
        }`
      : !whiteSeat || !blackSeat
      ? pickLang(lang, {
          es: 'Esperando que se siente rival',
          ca: 'Esperant que segui rival',
          en: 'Waiting for opponent seat',
        })
      : canInteractCurrentTurn
      ? pickLang(lang, { es: 'Tu turno · Mueve ficha', ca: 'El teu torn', en: 'Your turn' })
      : pickLang(lang, {
          es: `Turno de ${
            gameState.turn === 'w'
              ? whiteSeat?.name || 'Blancas'
              : blackSeat?.name || 'Negras'
          }`,
          ca: `Torn de ${
            gameState.turn === 'w'
              ? whiteSeat?.name || 'Blanques'
              : blackSeat?.name || 'Negres'
          }`,
          en: `${
            gameState.turn === 'w'
              ? whiteSeat?.name || 'White'
              : blackSeat?.name || 'Black'
          }'s turn`,
        });

  const renderBoardContent = (largeMode: boolean) => (
    <div className={`flex flex-col ${largeMode ? 'gap-3 max-w-[540px] w-full mx-auto' : 'gap-2.5 w-full'}`}>
      {/* Top Action Strip: Game Switcher + Expand + Close */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-xl border border-white/[0.08]">
          {(['checkers', 'chess'] as BoardGameType[]).map((gt) => {
            const active = gameState.gameType === gt;
            return (
              <button
                key={gt}
                type="button"
                onClick={() => {
                  if (gt !== gameState.gameType) {
                    triggerHaptic('light');
                    onReset({ gameType: gt });
                  }
                }}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#9146FF] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {gt === 'checkers'
                  ? pickLang(lang, { es: '🔴 Damas', ca: '🔴 Dames', en: '🔴 Checkers' })
                  : pickLang(lang, { es: '♟️ Ajedrez', ca: '♟️ Escacs', en: '♟️ Chess' })}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setManualFlip((f) => !(f ?? isFlipped))}
            title={pickLang(lang, { es: 'Girar tablero', ca: 'Girar tauler', en: 'Flip board' })}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            title={muted ? 'Activar sonido' : 'Silenciar'}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 cursor-pointer"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5 text-zinc-500" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            title={largeMode ? 'Reducir' : 'Ampliar tablero'}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-[#BF94FF] cursor-pointer"
          >
            {largeMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsExpanded(false);
              onCloseGame();
            }}
            title={pickLang(lang, { es: 'Cerrar juego', ca: 'Tancar joc', en: 'Close game' })}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Player Seats Row (White vs Black) */}
      <div className="grid grid-cols-2 gap-2">
        {(['w', 'b'] as BoardSide[]).map((side) => {
          const seat = gameState.players[side];
          const isTurn = gameState.status !== 'finished' && gameState.turn === side;
          const isMe = seat?.userId === currentUser.id;
          const sideLabel =
            side === 'w'
              ? pickLang(lang, { es: 'Blancas', ca: 'Blanques', en: 'White' })
              : gameState.gameType === 'checkers'
              ? pickLang(lang, { es: 'Rojas', ca: 'Roges', en: 'Red' })
              : pickLang(lang, { es: 'Negras', ca: 'Negres', en: 'Black' });

          return (
            <div
              key={side}
              className={`p-2 rounded-xl border transition-colors flex items-center justify-between gap-1.5 min-w-0 ${
                isTurn
                  ? 'bg-[#9146FF]/15 border-[#9146FF]/60 shadow-[0_0_16px_rgba(145,70,255,0.2)]'
                  : 'bg-white/[0.03] border-white/[0.07]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3.5 h-3.5 rounded-full shrink-0 border ${
                    side === 'w'
                      ? 'bg-zinc-100 border-zinc-400'
                      : gameState.gameType === 'checkers'
                      ? 'bg-rose-600 border-rose-300'
                      : 'bg-zinc-900 border-zinc-500'
                  }`}
                />
                {seat ? (
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                      <span className="truncate">{seat.name}</span>
                      {isMe && <span className="text-[10px] text-[#BF94FF]">· Tú</span>}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono tabular-nums">
                      {sideLabel} · {seat.score} pts
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-zinc-400 truncate">
                      {sideLabel}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {pickLang(lang, { es: 'Libre', ca: 'Lliure', en: 'Open' })}
                    </div>
                  </div>
                )}
              </div>

              {!seat && !gameState.soloLocal && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onJoinSeat(side);
                  }}
                  className="h-7 px-2 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-[10px] font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {pickLang(lang, { es: 'Jugar', ca: 'Jugar', en: 'Join' })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Turn / Alert Status Strip */}
      <div
        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
          gameState.status === 'finished'
            ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
            : gameState.inCheck
            ? 'bg-rose-500/20 border-rose-400/50 text-rose-200 animate-pulse'
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
                en: 'Multi-jump capture required',
              })}`
            : turnLabel}
        </span>
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

      {moveError && (
        <div className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200">
          {moveError}
        </div>
      )}

      {/* 8x8 Interactive Board */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-white/[0.14] shadow-[0_14px_40px_rgba(0,0,0,0.65)] select-none touch-manipulation">
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
          {displayRows.map((r) =>
            displayCols.map((c) => {
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

              const squareBg = isKingInCheck
                ? 'bg-rose-600/80'
                : isSelected
                ? 'bg-[#9146FF]/65'
                : isLastTo || isLastFrom
                ? isDark
                  ? 'bg-[#4C3575]'
                  : 'bg-[#6F5899]'
                : isDark
                ? 'bg-[#282834]'
                : 'bg-[#525263]';

              const showRank = c === displayCols[0];
              const showFile = r === displayRows[7];

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => handleSquareClick(r, c)}
                  aria-label={`${FILES[c]}${8 - r}`}
                  className={`relative w-full h-full flex items-center justify-center cursor-pointer transition-colors ${squareBg}`}
                >
                  {showRank && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] font-mono leading-none opacity-55 text-white pointer-events-none">
                      {8 - r}
                    </span>
                  )}
                  {showFile && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono leading-none opacity-55 text-white pointer-events-none">
                      {FILES[c]}
                    </span>
                  )}

                  {piece && renderBoardPiece(piece)}

                  {legalTarget && (
                    <span
                      className={`pointer-events-none absolute ${
                        legalTarget.isCapture
                          ? 'inset-1 rounded-full border-[3px] border-emerald-400/90 shadow-[0_0_10px_rgba(16,185,129,0.75)]'
                          : 'w-[28%] h-[28%] rounded-full bg-emerald-400/85 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                      }`}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Chess Promotion Picker Overlay */}
        {pendingPromo && (
          <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
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
                  className="w-12 h-12 rounded-2xl bg-[#26262C] hover:bg-[#9146FF] border border-white/20 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                >
                  {renderBoardPiece(`${gameState.turn}${p}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Finished Overlay with 1-Tap Rematch */}
        {gameState.status === 'finished' && (
          <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-2xl">
              🏆
            </div>
            <div>
              <h4 className="text-base font-extrabold text-white">{turnLabel}</h4>
              <p className="text-xs text-zinc-300 mt-0.5">
                {gameState.winReason === 'checkmate'
                  ? pickLang(lang, { es: 'Jaque mate', ca: 'Escac i mat', en: 'Checkmate' })
                  : gameState.winReason === 'stalemate'
                  ? pickLang(lang, { es: 'Rey ahogado', ca: 'Rei ofegat', en: 'Stalemate' })
                  : gameState.winReason === 'resign'
                  ? pickLang(lang, { es: 'Por rendición', ca: 'Per rendició', en: 'By resignation' })
                  : gameState.winReason === 'no_moves'
                  ? pickLang(lang, { es: 'Sin movimientos legales', ca: 'Sense moviments', en: 'No legal moves' })
                  : pickLang(lang, { es: 'Sin fichas rivales', ca: 'Sense fitxes rivals', en: 'All pieces captured' })}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onReset({ swapColors: false });
                }}
                className="min-h-9 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onReset({ swapColors: true });
                }}
                className="min-h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Cambiar colores', ca: 'Canviar colors', en: 'Swap colors' })}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Move History & Controls */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap text-[11px] font-mono tabular-nums text-zinc-400 bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-1.5">
          {gameState.moveHistory.length === 0
            ? pickLang(lang, {
                es: 'Sin jugadas aún · Empiezan Blancas',
                ca: 'Sense jugades encara · Comencen Blanques',
                en: 'No moves yet · White opens',
              })
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
            title={pickLang(lang, { es: 'Nueva partida', ca: 'Nova partida', en: 'New match' })}
            className="h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Reset' })}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Volver a Sala', ca: 'Tornar a la Sala', en: 'Back to Room' })}</span>
          </button>
        )}
        {renderBoardContent(false)}
      </div>

      {/* Expanded Full-Viewport Board Overlay for Comfortable Play */}
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
