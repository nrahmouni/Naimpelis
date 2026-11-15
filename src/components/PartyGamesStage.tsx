import React, { useEffect, useMemo, useState } from 'react';
import {
  Dices,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  X,
  Bot,
  Layers,
  ArrowLeft,
} from 'lucide-react';
import type { AppLanguage, Participant } from '../types';
import {
  PARTY_COLORS,
  chooseBotParchisAction,
  chooseBotUnoMove,
  createInitialParchisState,
  createInitialUnoState,
  drawUnoCardsAndAdvance,
  getLegalParchisPieceIds,
  isUnoCardPlayable,
  moveParchisPiece,
  parchisGlobalSquare,
  playUnoCard,
  rollParchisDice,
  type ParchisGameState,
  type PartyColor,
  type PartyGameState,
  type PartyGameType,
  type UnoCard,
  type UnoGameState,
} from '../shared/partyGames';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface PartyGamesStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  partyGameState: PartyGameState | null;
  isOffline?: boolean;
  onStartOnline?: (gameType: PartyGameType) => void;
  onOnlineAction?: (
    action: 'roll_dice' | 'move_piece' | 'play_card' | 'draw_card' | 'pass_turn' | 'rematch',
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor }
  ) => void;
  onCloseOnline?: () => void;
  onBack?: () => void;
}

const COLOR_STYLES: Record<
  PartyColor,
  {
    labelEs: string;
    labelCa: string;
    labelEn: string;
    hex: string;
    bgClass: string;
    borderClass: string;
    badgeClass: string;
    ringClass: string;
  }
> = {
  red: {
    labelEs: 'Rojo',
    labelCa: 'Vermell',
    labelEn: 'Red',
    hex: '#ef4444',
    bgClass: 'bg-red-500',
    borderClass: 'border-red-400',
    badgeClass: 'bg-red-500/20 text-red-200 border-red-400/45',
    ringClass: 'ring-red-400',
  },
  blue: {
    labelEs: 'Azul',
    labelCa: 'Blau',
    labelEn: 'Blue',
    hex: '#3b82f6',
    bgClass: 'bg-blue-500',
    borderClass: 'border-blue-400',
    badgeClass: 'bg-blue-500/20 text-blue-200 border-blue-400/45',
    ringClass: 'ring-blue-400',
  },
  yellow: {
    labelEs: 'Amarillo',
    labelCa: 'Groc',
    labelEn: 'Yellow',
    hex: '#eab308',
    bgClass: 'bg-yellow-500',
    borderClass: 'border-yellow-300',
    badgeClass: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/45',
    ringClass: 'ring-yellow-300',
  },
  green: {
    labelEs: 'Verde',
    labelCa: 'Verd',
    labelEn: 'Green',
    hex: '#22c55e',
    bgClass: 'bg-emerald-500',
    borderClass: 'border-emerald-300',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
    ringClass: 'ring-emerald-300',
  },
};

// 52-square outer track coordinates on 15x15 grid [row, col]
const PARCHIS_RING_COORDS: Array<[number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const PARCHIS_HOME_COLUMNS: Record<PartyColor, Array<[number, number]>> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  blue: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  green: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

const PARCHIS_YARD_SLOTS: Record<PartyColor, Array<[number, number]>> = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  blue: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  green: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};

const PARCHIS_GOAL_SLOTS: Record<PartyColor, [number, number]> = {
  red: [7, 6.3],
  blue: [6.3, 7],
  yellow: [7, 7.7],
  green: [7.7, 7],
};

const SAFE_SQUARE_SET = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function getParchisPieceCoord(color: PartyColor, pieceId: number, progress: number): [number, number] {
  if (progress < 0) {
    return PARCHIS_YARD_SLOTS[color][pieceId % 4];
  }
  if (progress >= 57) {
    return PARCHIS_GOAL_SLOTS[color];
  }
  if (progress >= 51) {
    const colIdx = Math.min(5, progress - 51);
    return PARCHIS_HOME_COLUMNS[color][colIdx];
  }
  const sq = parchisGlobalSquare(color, progress);
  if (sq !== null && PARCHIS_RING_COORDS[sq]) {
    return PARCHIS_RING_COORDS[sq];
  }
  return PARCHIS_YARD_SLOTS[color][0];
}

function getUnoCardLabel(value: UnoCard['value']): string {
  switch (value) {
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return '🌈';
    case 'wild4':
      return '+4';
    default:
      return value;
  }
}

function getUnoCardPalette(card: UnoCard): string {
  switch (card.color) {
    case 'red':
      return 'bg-gradient-to-br from-red-500 to-rose-700 border-red-300/60 text-white';
    case 'blue':
      return 'bg-gradient-to-br from-blue-500 to-indigo-700 border-blue-300/60 text-white';
    case 'yellow':
      return 'bg-gradient-to-br from-amber-400 to-yellow-600 border-yellow-200/70 text-zinc-950';
    case 'green':
      return 'bg-gradient-to-br from-emerald-500 to-green-700 border-emerald-300/60 text-white';
    default:
      return 'bg-gradient-to-br from-zinc-800 via-[#9146FF]/80 to-zinc-950 border-white/40 text-white';
  }
}

export const PartyGamesStage: React.FC<PartyGamesStageProps> = ({
  lang,
  currentUser,
  partyGameState,
  isOffline = false,
  onStartOnline,
  onOnlineAction,
  onCloseOnline,
  onBack,
}) => {
  const [localState, setLocalState] = useState<PartyGameState | null>(null);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);

  const activeState = isOffline ? localState : partyGameState;

  // Offline AI bot loop (runs 750ms after bot becomes turnSeat)
  useEffect(() => {
    if (!isOffline || !localState || localState.status === 'finished') return;
    const seat = localState.players[localState.turnSeat];
    if (!seat || !seat.isBot) return;

    const timer = window.setTimeout(() => {
      setLocalState((curr) => {
        if (!curr || curr.status === 'finished') return curr;
        const currSeat = curr.players[curr.turnSeat];
        if (!currSeat?.isBot) return curr;

        if (curr.gameType === 'parchis') {
          const decision = chooseBotParchisAction(curr);
          if (decision.action === 'roll_dice') {
            const res = rollParchisDice(curr, currSeat.userId);
            return res.ok ? res.state : curr;
          }
          if (decision.action === 'move_piece' && typeof decision.pieceId === 'number') {
            const res = moveParchisPiece(curr, currSeat.userId, decision.pieceId);
            return res.ok ? res.state : curr;
          }
          return curr;
        }

        const unoDecision = chooseBotUnoMove(curr);
        if (unoDecision.action === 'play_card' && unoDecision.cardId) {
          const res = playUnoCard(curr, currSeat.userId, unoDecision.cardId, unoDecision.chosenColor);
          return res.ok ? res.state : curr;
        }
        const drawRes = drawUnoCardsAndAdvance(curr, currSeat.userId);
        return drawRes.ok ? drawRes.state : curr;
      });
    }, 750);

    return () => window.clearTimeout(timer);
  }, [isOffline, localState]);

  const startOfflineGame = (gameType: PartyGameType) => {
    triggerHaptic('medium');
    setPendingWildCardId(null);
    const human = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
    setLocalState(
      gameType === 'uno' ? createInitialUnoState([human]) : createInitialParchisState([human])
    );
  };

  const dispatchAction = (
    action: 'roll_dice' | 'move_piece' | 'play_card' | 'draw_card' | 'pass_turn' | 'rematch',
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor }
  ) => {
    if (!isOffline) {
      onOnlineAction?.(action, opts);
      return;
    }
    setLocalState((curr) => {
      if (!curr) return curr;
      if (action === 'rematch') {
        const human = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
        return curr.gameType === 'uno'
          ? createInitialUnoState([human])
          : createInitialParchisState([human]);
      }
      if (curr.gameType === 'parchis') {
        if (action === 'roll_dice') {
          const res = rollParchisDice(curr, currentUser.id);
          return res.ok ? res.state : curr;
        }
        if (action === 'move_piece' && typeof opts?.pieceId === 'number') {
          const res = moveParchisPiece(curr, currentUser.id, opts.pieceId);
          return res.ok ? res.state : curr;
        }
        return curr;
      }
      if (action === 'play_card' && opts?.cardId) {
        const res = playUnoCard(curr, currentUser.id, opts.cardId, opts.chosenColor);
        return res.ok ? res.state : curr;
      }
      if (action === 'draw_card' || action === 'pass_turn') {
        const res = drawUnoCardsAndAdvance(curr, currentUser.id);
        return res.ok ? res.state : curr;
      }
      return curr;
    });
  };

  const closeActiveGame = () => {
    setPendingWildCardId(null);
    if (isOffline) {
      setLocalState(null);
    } else {
      onCloseOnline?.();
    }
  };

  const mySeatIndex = useMemo(() => {
    if (!activeState) return -1;
    return activeState.players.findIndex((p) => p.userId === currentUser.id);
  }, [activeState, currentUser.id]);

  // ============================================================================
  // LAUNCHER VIEW
  // ============================================================================
  if (!activeState) {
    return (
      <div className="p-3.5 space-y-3 overflow-y-auto custom-scrollbar flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}</span>
          </button>
        )}

        <div className="p-4 rounded-2xl nc-specular-surface border border-white/[0.1] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
            <Sparkles className="w-4 h-4" />
            <span>
              {isOffline
                ? pickLang(lang, {
                    es: 'Juegos Party Offline vs Bots IA (4 Jugadores)',
                    ca: 'Jocs Party Offline vs Bots IA (4 Jugadors)',
                    en: 'Offline 4-Player Party Games vs AI Bots',
                  })
                : pickLang(lang, {
                    es: 'Juegos Party 4 Jugadores (Bots automáticos en huecos libres)',
                    ca: 'Jocs Party 4 Jugadors (Bots automàtics als llocs lliures)',
                    en: '4-Player Party Games (Auto AI Bots in open seats)',
                  })}
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {pickLang(lang, {
              es: 'Juega al Parchís clásico o al UNO con hasta 4 personas de la sala. Si faltan jugadores, la IA ocupa los asientos al instante.',
              ca: 'Juga al Parxís clàssic o a l’UNO amb fins a 4 persones de la sala. Si falten jugadors, la IA ocupa els seients.',
              en: 'Play classic Ludo or UNO with up to 4 friends in this room. Any open seats are automatically filled by smart AI bots.',
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Parchís Card */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.09] space-y-3 flex flex-col justify-between">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/25 via-red-500/20 to-emerald-500/25 border border-white/15 flex items-center justify-center text-xl shrink-0">
                🎲
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">
                  {pickLang(lang, { es: 'Parchís 4P', ca: 'Parxís 4P', en: 'Parchís / Ludo 4P' })}
                </h4>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  {pickLang(lang, {
                    es: '4 colores · Sal con 5 o 6 · Capturas (+20 pasos) · Meta (+10 pasos)',
                    ca: '4 colors · Surt amb 5 o 6 · Captures (+20) · Meta (+10)',
                    en: '4 colors · Roll 5/6 to exit · Captures (+20) · Goal (+10)',
                  })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => (isOffline ? startOfflineGame('parchis') : onStartOnline?.('parchis'))}
              className="min-h-10 w-full px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
            >
              {isOffline ? <Bot className="w-4 h-4 shrink-0" /> : <Users className="w-4 h-4 shrink-0" />}
              <span>
                {isOffline
                  ? pickLang(lang, { es: 'Jugar vs 3 Bots', ca: 'Jugar vs 3 Bots', en: 'Play vs 3 AI Bots' })
                  : pickLang(lang, { es: 'Abrir Mesa de Parchís', ca: 'Obrir Taula de Parxís', en: 'Start Parchís Table' })}
              </span>
            </button>
          </div>

          {/* UNO Card */}
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.09] space-y-3 flex flex-col justify-between">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/30 via-blue-500/20 to-yellow-500/25 border border-white/15 flex items-center justify-center text-xl shrink-0">
                🃏
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">
                  {pickLang(lang, { es: 'UNO Party 4P', ca: 'UNO Party 4P', en: 'UNO Party 4P' })}
                </h4>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  {pickLang(lang, {
                    es: 'Acumula +2/+4 · Cambio sentido · Salto · Comodín de color',
                    ca: 'Acumula +2/+4 · Canvi sentit · Salt · Comodí de color',
                    en: 'Stack +2/+4 · Reverse · Skip · Wild color picker',
                  })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => (isOffline ? startOfflineGame('uno') : onStartOnline?.('uno'))}
              className="min-h-10 w-full px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
            >
              {isOffline ? <Bot className="w-4 h-4 shrink-0" /> : <Users className="w-4 h-4 shrink-0" />}
              <span>
                {isOffline
                  ? pickLang(lang, { es: 'Jugar UNO vs 3 Bots', ca: 'Jugar UNO vs 3 Bots', en: 'Play UNO vs 3 Bots' })
                  : pickLang(lang, { es: 'Abrir Mesa de UNO', ca: 'Obrir Taula d’UNO', en: 'Start UNO Table' })}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeSeat = activeState.players[activeState.turnSeat];
  const isMyTurn =
    activeState.status === 'playing' &&
    activeSeat &&
    !activeSeat.isBot &&
    activeSeat.userId === currentUser.id;
  const winnerSeat =
    activeState.winnerSeat !== null ? activeState.players[activeState.winnerSeat] : null;

  // ============================================================================
  // PARCHÍS ACTIVE TABLE
  // ============================================================================
  if (activeState.gameType === 'parchis') {
    const pState = activeState as ParchisGameState;
    const stepsNeeded = pState.bonusSteps > 0 ? pState.bonusSteps : pState.dice || 0;
    const legalIds =
      pState.phase === 'move' && isMyTurn ? getLegalParchisPieceIds(pState, stepsNeeded) : [];

    // Group pieces stacked on same grid coordinate so multiple pieces remain clickable
    const positionedPieces: Array<{
      color: PartyColor;
      id: number;
      progress: number;
      row: number;
      col: number;
      legal: boolean;
      stackIndex: number;
      stackTotal: number;
    }> = [];

    const coordBuckets = new Map<string, Array<{ color: PartyColor; id: number; progress: number; row: number; col: number }>>();
    for (const c of PARTY_COLORS) {
      for (const piece of pState.pieces[c]) {
        const [row, col] = getParchisPieceCoord(c, piece.id, piece.progress);
        const key = `${row.toFixed(1)},${col.toFixed(1)}`;
        const arr = coordBuckets.get(key) || [];
        arr.push({ color: c, id: piece.id, progress: piece.progress, row, col });
        coordBuckets.set(key, arr);
      }
    }

    coordBuckets.forEach((group) => {
      group.forEach((entry, idx) => {
        const isCurrentColor = activeSeat?.color === entry.color;
        const legal = isCurrentColor && legalIds.includes(entry.id);
        positionedPieces.push({
          ...entry,
          legal,
          stackIndex: idx,
          stackTotal: group.length,
        });
      });
    });

    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              🎲 {pickLang(lang, { es: 'Parchís 4P', ca: 'Parxís 4P', en: 'Ludo / Parchís 4P' })}
            </span>
            {isOffline && (
              <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-bold text-zinc-300 shrink-0">
                Offline IA
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => dispatchAction('rematch')}
              className="h-7 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Nueva', ca: 'Nova', en: 'New' })}</span>
            </button>
            <button
              type="button"
              onClick={closeActiveGame}
              aria-label={pickLang(lang, { es: 'Cerrar Parchís', ca: 'Tancar Parxís', en: 'Close Parchís' })}
              className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Player Seats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {pState.players.map((pl) => {
            const isTurn = pState.status === 'playing' && pState.turnSeat === pl.seatIndex;
            const cs = COLOR_STYLES[pl.color];
            const finishedCount = pState.pieces[pl.color].filter((p) => p.progress === 57).length;
            return (
              <div
                key={pl.seatIndex}
                className={`p-2 rounded-xl border text-left transition-all min-w-0 ${
                  isTurn
                    ? `${cs.badgeClass} ring-1 ${cs.ringClass}`
                    : 'bg-white/[0.03] border-white/[0.07] text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cs.bgClass}`} />
                  <span className="text-[11px] font-bold truncate">{pl.name}</span>
                  {pl.isBot && <Bot className="w-3 h-3 opacity-70 shrink-0 ml-auto" />}
                </div>
                <div className="text-[10px] opacity-80 font-mono tabular-nums mt-0.5">
                  🏁 {finishedCount}/4 · {pl.score} pts
                </div>
              </div>
            );
          })}
        </div>

        {/* Turn / Dice Bar */}
        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#9146FF]/20 border border-[#9146FF]/45 flex items-center justify-center font-mono text-base font-black text-white shrink-0">
              {pState.dice ?? '🎲'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {pState.status === 'finished' && winnerSeat
                  ? `🏆 ${winnerSeat.name}`
                  : isMyTurn
                  ? pState.phase === 'roll'
                    ? pickLang(lang, { es: 'Tu turno · Tira el dado', ca: 'El teu torn · Tira el dau', en: 'Your turn · Roll dice' })
                    : pState.bonusSteps > 0
                    ? pickLang(lang, {
                        es: `Bonus +${pState.bonusSteps} · Elige ficha`,
                        ca: `Bonus +${pState.bonusSteps} · Tria fitxa`,
                        en: `Bonus +${pState.bonusSteps} · Pick piece`,
                      })
                    : pickLang(lang, {
                        es: `Sacaste ${pState.dice} · Toca una ficha iluminada`,
                        ca: `Has tret ${pState.dice} · Toca una fitxa`,
                        en: `Rolled ${pState.dice} · Tap highlighted piece`,
                      })
                  : pickLang(lang, {
                      es: `Turno de ${activeSeat?.name || '...'}`,
                      ca: `Torn de ${activeSeat?.name || '...'}`,
                      en: `${activeSeat?.name || '...'}'s turn`,
                    })}
              </div>
              {pState.log.length > 0 && (
                <div className="text-[10px] text-zinc-400 truncate">{pState.log[pState.log.length - 1]}</div>
              )}
            </div>
          </div>

          {pState.status === 'playing' && isMyTurn && pState.phase === 'roll' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                dispatchAction('roll_dice');
              }}
              className="min-h-9 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all"
            >
              <Dices className="w-4 h-4 shrink-0" />
              <span>{pickLang(lang, { es: 'Tirar Dado', ca: 'Tirar Dau', en: 'Roll Dice' })}</span>
            </button>
          )}
        </div>

        {/* 15x15 Interactive Parchís Board */}
        <div className="relative w-full max-w-[440px] mx-auto aspect-square rounded-2xl overflow-hidden border border-white/[0.15] bg-[#14151c] shadow-2xl select-none touch-manipulation">
          {/* Yard Quadrants */}
          <div className="absolute top-0 left-0 w-[40%] h-[40%] bg-red-600/25 border-r border-b border-white/15 p-2">
            <div className="w-full h-full rounded-2xl bg-[#101118]/80 border border-red-400/40" />
          </div>
          <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/25 border-l border-b border-white/15 p-2">
            <div className="w-full h-full rounded-2xl bg-[#101118]/80 border border-blue-400/40" />
          </div>
          <div className="absolute bottom-0 right-0 w-[40%] h-[40%] bg-yellow-500/25 border-l border-t border-white/15 p-2">
            <div className="w-full h-full rounded-2xl bg-[#101118]/80 border border-yellow-400/40" />
          </div>
          <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-emerald-600/25 border-r border-t border-white/15 p-2">
            <div className="w-full h-full rounded-2xl bg-[#101118]/80 border border-emerald-400/40" />
          </div>

          {/* Center Goal */}
          <div className="absolute top-[40%] left-[40%] w-[20%] h-[20%] border border-white/20 bg-gradient-to-br from-amber-500/25 via-[#9146FF]/25 to-emerald-500/25 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-amber-300 opacity-80" />
          </div>

          {/* 52 Ring Squares */}
          {PARCHIS_RING_COORDS.map(([r, c], sqIdx) => {
            const startColor =
              sqIdx === 0
                ? 'bg-red-500/45'
                : sqIdx === 13
                ? 'bg-blue-500/45'
                : sqIdx === 26
                ? 'bg-yellow-500/45'
                : sqIdx === 39
                ? 'bg-emerald-500/45'
                : SAFE_SQUARE_SET.has(sqIdx)
                ? 'bg-white/[0.14]'
                : 'bg-white/[0.04]';
            return (
              <div
                key={`ring-${sqIdx}`}
                style={{
                  top: `${(r / 15) * 100}%`,
                  left: `${(c / 15) * 100}%`,
                  width: `${100 / 15}%`,
                  height: `${100 / 15}%`,
                }}
                className={`absolute border-[0.5px] border-white/15 flex items-center justify-center text-[9px] text-white/60 ${startColor}`}
              >
                {SAFE_SQUARE_SET.has(sqIdx) ? '★' : ''}
              </div>
            );
          })}

          {/* Colored Home Columns */}
          {PARTY_COLORS.map((col) =>
            PARCHIS_HOME_COLUMNS[col].slice(0, 5).map(([r, c], idx) => (
              <div
                key={`hc-${col}-${idx}`}
                style={{
                  top: `${(r / 15) * 100}%`,
                  left: `${(c / 15) * 100}%`,
                  width: `${100 / 15}%`,
                  height: `${100 / 15}%`,
                }}
                className={`absolute border-[0.5px] border-white/20 ${COLOR_STYLES[col].bgClass}/35`}
              />
            ))
          )}

          {/* 16 Interactive Pieces */}
          {positionedPieces.map((item) => {
            const offsetX =
              item.stackTotal > 1 ? ((item.stackIndex % 2) - 0.5) * 1.4 : 0;
            const offsetY =
              item.stackTotal > 2 ? (Math.floor(item.stackIndex / 2) - 0.5) * 1.4 : 0;
            const cs = COLOR_STYLES[item.color];

            return (
              <button
                key={`piece-${item.color}-${item.id}`}
                type="button"
                disabled={!item.legal}
                onClick={() => {
                  if (!item.legal) return;
                  triggerHaptic('light');
                  dispatchAction('move_piece', { pieceId: item.id });
                }}
                style={{
                  top: `${((item.row + 0.5) / 15) * 100 + offsetY}%`,
                  left: `${((item.col + 0.5) / 15) * 100 + offsetX}%`,
                  width: `${item.legal ? 6.2 : 5.1}%`,
                  height: `${item.legal ? 6.2 : 5.1}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                aria-label={`${item.color} #${item.id + 1}`}
                className={`absolute z-10 rounded-full border-2 border-white shadow-[0_3px_8px_rgba(0,0,0,0.85)] flex items-center justify-center text-[9px] font-black text-white transition-all ${
                  cs.bgClass
                } ${
                  item.legal
                    ? 'ring-2 ring-white animate-pulse cursor-pointer hover:scale-125 z-20'
                    : 'cursor-default opacity-95'
                }`}
              >
                {item.progress === 57 ? '★' : item.id + 1}
              </button>
            );
          })}

          {/* Winner Overlay */}
          {pState.status === 'finished' && winnerSeat && (
            <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 text-center">
              <div className="text-3xl">🏆</div>
              <div className="text-base font-extrabold text-white">
                {pickLang(lang, {
                  es: `${winnerSeat.name} gana el Parchís`,
                  ca: `${winnerSeat.name} guanya el Parxís`,
                  en: `${winnerSeat.name} wins Parchís!`,
                })}
              </div>
              <button
                type="button"
                onClick={() => dispatchAction('rematch')}
                className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Jugar otra vez', ca: 'Tornar a jugar', en: 'Play Again' })}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // UNO ACTIVE TABLE
  // ============================================================================
  const uState = activeState as UnoGameState;
  const myHand = mySeatIndex >= 0 ? uState.hands[mySeatIndex] || [] : [];
  const topDiscard = uState.discardPile[uState.discardPile.length - 1];
  const activeCs = COLOR_STYLES[uState.activeColor];

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-extrabold text-white truncate">
            🃏 UNO Party 4P
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-semibold text-zinc-200 shrink-0">
            {uState.direction === 1
              ? pickLang(lang, { es: '↻ Horario', ca: '↻ Horari', en: '↻ Clockwise' })
              : pickLang(lang, { es: '↺ Antihorario', ca: '↺ Antihorari', en: '↺ Counter' })}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => dispatchAction('rematch')}
            className="h-7 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{pickLang(lang, { es: 'Nueva', ca: 'Nova', en: 'New' })}</span>
          </button>
          <button
            type="button"
            onClick={closeActiveGame}
            aria-label={pickLang(lang, { es: 'Cerrar UNO', ca: 'Tancar UNO', en: 'Close UNO' })}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Seats Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {uState.players.map((pl) => {
          const isTurn = uState.status === 'playing' && uState.turnSeat === pl.seatIndex;
          const cardCount = (uState.hands[pl.seatIndex] || []).length;
          return (
            <div
              key={pl.seatIndex}
              className={`p-2 rounded-xl border min-w-0 transition-all ${
                isTurn
                  ? 'bg-[#9146FF]/20 border-[#9146FF]/65 ring-1 ring-[#9146FF]/45'
                  : 'bg-white/[0.03] border-white/[0.07]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-white truncate">{pl.name}</span>
                {cardCount === 1 && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black shrink-0">
                    ¡UNO!
                  </span>
                )}
              </div>
              <div className="text-[10px] text-zinc-400 font-mono tabular-nums mt-0.5 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                <span>
                  {cardCount} {cardCount === 1 ? 'carta' : 'cartas'}
                </span>
                {pl.isBot && <Bot className="w-3 h-3 ml-auto opacity-75" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Center Felt Table */}
      <div className="relative p-4 rounded-2xl bg-gradient-to-br from-[#131520] via-[#171225] to-[#0E0F16] border border-white/[0.12] flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-4">
          {/* Draw Deck */}
          <button
            type="button"
            disabled={!isMyTurn}
            onClick={() => {
              triggerHaptic('light');
              dispatchAction('draw_card');
            }}
            className={`w-20 h-28 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 border-2 flex flex-col items-center justify-center gap-1 shadow-xl transition-all ${
              isMyTurn
                ? 'border-[#9146FF]/80 hover:-translate-y-1 cursor-pointer active:scale-95'
                : 'border-white/15 opacity-70 cursor-default'
            }`}
          >
            <span className="text-lg font-black text-[#BF94FF]">UNO</span>
            <span className="text-[10px] font-bold text-zinc-300">
              {uState.pendingDraw > 0
                ? pickLang(lang, {
                    es: `Robar +${uState.pendingDraw}`,
                    ca: `Robar +${uState.pendingDraw}`,
                    en: `Draw +${uState.pendingDraw}`,
                  })
                : pickLang(lang, { es: 'Robar', ca: 'Robar', en: 'Draw' })}
            </span>
          </button>

          {/* Discard Pile */}
          {topDiscard && (
            <div
              className={`w-20 h-28 rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center relative ${getUnoCardPalette(
                topDiscard
              )}`}
            >
              <span className="text-3xl font-black leading-none drop-shadow">
                {getUnoCardLabel(topDiscard.value)}
              </span>
              <span
                className={`mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border bg-black/45 text-white border-white/25`}
              >
                {pickLang(lang, {
                  es: activeCs.labelEs,
                  ca: activeCs.labelCa,
                  en: activeCs.labelEn,
                })}
              </span>
            </div>
          )}
        </div>

        {/* Status Message */}
        <div className="text-center space-y-0.5">
          <div className="text-xs font-bold text-white">
            {uState.status === 'finished' && winnerSeat
              ? `🏆 ${winnerSeat.name}`
              : isMyTurn
              ? uState.pendingDraw > 0
                ? pickLang(lang, {
                    es: `¡Tu turno! Tira un +2/+4 o roba ${uState.pendingDraw} cartas`,
                    ca: `El teu torn! Tira +2/+4 o roba ${uState.pendingDraw}`,
                    en: `Your turn! Stack +2/+4 or draw ${uState.pendingDraw}`,
                  })
                : pickLang(lang, {
                    es: 'Tu turno · Tira una carta o roba del mazo',
                    ca: 'El teu torn · Tira una carta o roba',
                    en: 'Your turn · Play a card or draw',
                  })
              : pickLang(lang, {
                  es: `Turno de ${activeSeat?.name || '...'}`,
                  ca: `Torn de ${activeSeat?.name || '...'}`,
                  en: `${activeSeat?.name || '...'}'s turn`,
                })}
          </div>
          {uState.log.length > 0 && (
            <div className="text-[11px] text-zinc-400">{uState.log[uState.log.length - 1]}</div>
          )}
        </div>

        {/* Wild Color Picker Overlay */}
        {pendingWildCardId && (
          <div className="absolute inset-0 z-20 rounded-2xl bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              {pickLang(lang, { es: 'Elige color activo', ca: 'Tria color actiu', en: 'Pick active color' })}
            </span>
            <div className="grid grid-cols-4 gap-2">
              {PARTY_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => {
                    const cardId = pendingWildCardId;
                    setPendingWildCardId(null);
                    triggerHaptic('medium');
                    dispatchAction('play_card', { cardId, chosenColor: col });
                  }}
                  className={`w-12 h-12 rounded-2xl ${COLOR_STYLES[col].bgClass} border-2 border-white/80 cursor-pointer active:scale-95 shadow-lg`}
                  aria-label={col}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingWildCardId(null)}
              className="text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              {pickLang(lang, { es: 'Cancelar', ca: 'Cancel·lar', en: 'Cancel' })}
            </button>
          </div>
        )}

        {/* Winner Overlay */}
        {uState.status === 'finished' && winnerSeat && (
          <div className="absolute inset-0 z-30 rounded-2xl bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="text-3xl">🏆</div>
            <div className="text-base font-extrabold text-white">
              {pickLang(lang, {
                es: `${winnerSeat.name} ganó UNO`,
                ca: `${winnerSeat.name} ha guanyat UNO`,
                en: `${winnerSeat.name} won UNO!`,
              })}
            </div>
            <button
              type="button"
              onClick={() => dispatchAction('rematch')}
              className="min-h-10 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}</span>
            </button>
          </div>
        )}
      </div>

      {/* Player Hand */}
      {mySeatIndex >= 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="font-semibold text-zinc-200">
              {pickLang(lang, {
                es: `Tu mano (${myHand.length})`,
                ca: `La teva mà (${myHand.length})`,
                en: `Your hand (${myHand.length})`,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-2 px-1 custom-scrollbar">
            {myHand.map((card) => {
              const playable = isMyTurn && isUnoCardPlayable(uState, card);
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!playable}
                  onClick={() => {
                    if (!playable) return;
                    triggerHaptic('light');
                    if (card.color === 'wild') {
                      setPendingWildCardId(card.id);
                    } else {
                      dispatchAction('play_card', { cardId: card.id });
                    }
                  }}
                  className={`w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center shrink-0 shadow-lg transition-all ${getUnoCardPalette(
                    card
                  )} ${
                    playable
                      ? '-translate-y-1.5 ring-2 ring-white cursor-pointer hover:scale-105 active:scale-95'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-lg font-black leading-none">
                    {getUnoCardLabel(card.value)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
