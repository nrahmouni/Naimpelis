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
  Play,
  Timer,
  AlertTriangle,
  Megaphone,
  ShieldAlert,
} from 'lucide-react';
import type { AppLanguage, Participant } from '../types';
import {
  PARTY_COLORS,
  PARTY_TURN_DECISION_MS,
  PARCHIS_SAFE_SQUARES,
  PARCHIS_START_OFFSETS,
  UNO_TARGET_SCORE,
  callUnoAction,
  catchUnoFailureAction,
  chooseBotParchisAction,
  chooseBotUnoMove,
  claimPartyBotSeat,
  createInitialParchisState,
  createInitialUnoState,
  drawUnoCardsAndAdvance,
  getLegalParchisPieceIds,
  isUnoCardPlayable,
  moveParchisPiece,
  parchisGlobalSquare,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
  startPartyMatch,
  type ParchisGameState,
  type PartyColor,
  type PartyGameState,
  type PartyGameType,
  type UnoCard,
  type UnoGameState,
} from '../shared/partyGames';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './games/GameVoiceBar';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export type PartyOnlineAction =
  | 'roll_dice'
  | 'move_piece'
  | 'play_card'
  | 'draw_card'
  | 'pass_turn'
  | 'call_uno'
  | 'catch_uno'
  | 'accept_wild4'
  | 'challenge_wild4'
  | 'join_seat'
  | 'start_match'
  | 'rematch';

interface PartyGamesStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  partyGameState: PartyGameState | null;
  isOffline?: boolean;
  isHost?: boolean;
  fullScreenMode?: boolean;
  voiceChat?: GameVoiceChatState;
  onStartOnline?: (gameType: PartyGameType) => void;
  onOnlineAction?: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  onCloseOnline?: () => void;
  onBack?: () => void;
  onActiveStateChange?: (active: boolean) => void;
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

/**
 * 68-Square Spanish Parchís Outer Ring on a 19x19 grid [row, col] (0..18).
 * Index 0 = Physical Square 1, Index 67 = Physical Square 68 (Yellow home entrance).
 * Yellow Start = 4 (Square 5), Blue Start = 21 (Square 22), Red Start = 38 (Square 39), Green Start = 55 (Square 56).
 */
const PARCHIS_68_COORDS: Array<[number, number]> = [
  // Squares 1..8: Up bottom-right column (col 10, rows 18..11)
  [18, 10], [17, 10], [16, 10], [15, 10], [14, 10], [13, 10], [12, 10], [11, 10],
  // Squares 9..16: Right along bottom edge of right arm (row 10, cols 11..18)
  [10, 11], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16], [10, 17], [10, 18],
  // Square 17: Right arm tip (Blue entrance safe)
  [9, 18],
  // Squares 18..25: Left along top edge of right arm (row 8, cols 18..11)
  [8, 18], [8, 17], [8, 16], [8, 15], [8, 14], [8, 13], [8, 12], [8, 11],
  // Squares 26..33: Up right edge of top arm (col 10, rows 7..0)
  [7, 10], [6, 10], [5, 10], [4, 10], [3, 10], [2, 10], [1, 10], [0, 10],
  // Square 34: Top arm tip (Red entrance safe)
  [0, 9],
  // Squares 35..42: Down left edge of top arm (col 8, rows 0..7)
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8],
  // Squares 43..50: Left along top edge of left arm (row 8, cols 7..0)
  [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  // Square 51: Left arm tip (Green entrance safe)
  [9, 0],
  // Squares 52..59: Right along bottom edge of left arm (row 10, cols 0..7)
  [10, 0], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7],
  // Squares 60..67: Down left edge of bottom arm (col 8, rows 11..18)
  [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 8], [18, 8],
  // Square 68: Bottom arm tip (Yellow entrance safe)
  [18, 9],
];

// 7 colored pasillo squares (progress 64..70)
const PARCHIS_HOME_COLUMNS: Record<PartyColor, Array<[number, number]>> = {
  red: [[1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9]],
  blue: [[9, 17], [9, 16], [9, 15], [9, 14], [9, 13], [9, 12], [9, 11]],
  yellow: [[17, 9], [16, 9], [15, 9], [14, 9], [13, 9], [12, 9], [11, 9]],
  green: [[9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7]],
};

// Corner yards (Red=TopLeft, Blue=TopRight, Yellow=BottomRight, Green=BottomLeft)
const PARCHIS_YARD_SLOTS: Record<PartyColor, Array<[number, number]>> = {
  red: [[2.5, 2.5], [2.5, 4.5], [4.5, 2.5], [4.5, 4.5]],
  blue: [[2.5, 13.5], [2.5, 15.5], [4.5, 13.5], [4.5, 15.5]],
  yellow: [[13.5, 13.5], [13.5, 15.5], [15.5, 13.5], [15.5, 15.5]],
  green: [[13.5, 2.5], [13.5, 4.5], [15.5, 2.5], [15.5, 4.5]],
};

// Center 3x3 Meta (rows 8..10, cols 8..10)
const PARCHIS_GOAL_SLOTS: Record<PartyColor, [number, number]> = {
  red: [8.2, 9],
  blue: [9, 9.8],
  yellow: [9.8, 9],
  green: [9, 8.2],
};

function getParchisPieceCoord(color: PartyColor, pieceId: number, progress: number): [number, number] {
  if (progress < 0) {
    return PARCHIS_YARD_SLOTS[color][pieceId % 4];
  }
  if (progress >= 71) {
    return PARCHIS_GOAL_SLOTS[color];
  }
  if (progress >= 64) {
    const colIdx = Math.min(6, progress - 64);
    return PARCHIS_HOME_COLUMNS[color][colIdx];
  }
  const sq = parchisGlobalSquare(color, progress);
  if (sq !== null && PARCHIS_68_COORDS[sq]) {
    return PARCHIS_68_COORDS[sq];
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
  isHost = false,
  fullScreenMode = false,
  voiceChat,
  onStartOnline,
  onOnlineAction,
  onCloseOnline,
  onBack,
  onActiveStateChange,
}) => {
  const [localState, setLocalState] = useState<PartyGameState | null>(null);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [hoveredPieceId, setHoveredPieceId] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const activeState = isOffline ? localState : partyGameState;

  useEffect(() => {
    onActiveStateChange?.(Boolean(activeState));
  }, [activeState, onActiveStateChange]);

  // Live 15s turn timer display + offline human timeout auto-move
  useEffect(() => {
    if (!activeState || activeState.status !== 'playing') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [activeState?.status, activeState?.turnDeadlineAt, activeState?.updatedAt]);

  // Offline AI bot loop + offline 15s human timeout auto-move
  useEffect(() => {
    if (!isOffline || !localState || localState.status !== 'playing') return;
    const seat = localState.players[localState.turnSeat];
    if (!seat) return;

    const isBot = Boolean(seat.isBot);
    const delayMs = isBot
      ? 750
      : Math.max(250, (localState.turnDeadlineAt || Date.now() + PARTY_TURN_DECISION_MS) - Date.now());

    const timer = window.setTimeout(() => {
      setLocalState((curr) => {
        if (!curr || curr.status !== 'playing') return curr;
        const currSeat = curr.players[curr.turnSeat];
        if (!currSeat) return curr;

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
        if (unoDecision.action === 'accept_wild4' || unoDecision.action === 'challenge_wild4') {
          const res = resolveUnoWild4Challenge(
            curr,
            currSeat.userId,
            unoDecision.action === 'challenge_wild4' && isBot ? 'challenge' : 'accept'
          );
          return res.ok ? res.state : curr;
        }
        if (unoDecision.action === 'play_card' && unoDecision.cardId) {
          const res = playUnoCard(curr, currSeat.userId, unoDecision.cardId, unoDecision.chosenColor);
          if (res.ok) {
            let nextUno = res.state;
            if (
              isBot &&
              nextUno.status === 'playing' &&
              nextUno.vulnerableUnoSeat === currSeat.seatIndex &&
              Math.random() < 0.78
            ) {
              nextUno = {
                ...nextUno,
                vulnerableUnoSeat: null,
                unoCalledSeats: Array.from(new Set([...nextUno.unoCalledSeats, currSeat.seatIndex])),
                log: [...nextUno.log.slice(-14), `📣 ¡${currSeat.name} gritó ¡UNO!!`],
              };
            }
            return nextUno;
          }
          return curr;
        }
        const drawRes = drawUnoCardsAndAdvance(curr, currSeat.userId);
        return drawRes.ok ? drawRes.state : curr;
      });
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isOffline, localState]);

  const startOfflineGame = (gameType: PartyGameType) => {
    triggerHaptic('medium');
    setPendingWildCardId(null);
    const human = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
    setLocalState(
      gameType === 'uno'
        ? createInitialUnoState([human], { waitForHost: true })
        : createInitialParchisState([human], { waitForHost: true })
    );
  };

  const dispatchAction = (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => {
    if (!isOffline) {
      onOnlineAction?.(action, opts);
      return;
    }
    setLocalState((curr) => {
      if (!curr) return curr;
      if (action === 'rematch') {
        const existingScores = curr.players.map((p) => p.score);
        const human = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
        const maxScore = Math.max(...existingScores, 0);
        return curr.gameType === 'uno'
          ? createInitialUnoState([human], {
              waitForHost: false,
              existingScores: maxScore >= UNO_TARGET_SCORE ? [0, 0, 0, 0] : existingScores,
            })
          : createInitialParchisState([human], { waitForHost: false });
      }
      if (action === 'start_match') {
        return startPartyMatch(curr);
      }
      if (action === 'join_seat') {
        const res = claimPartyBotSeat(
          curr,
          { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar },
          opts?.seatIndex
        );
        return res.ok ? res.state : curr;
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
      if (action === 'call_uno') {
        const res = callUnoAction(curr, currentUser.id);
        return res.ok ? res.state : curr;
      }
      if (action === 'catch_uno') {
        const res = catchUnoFailureAction(curr, currentUser.id);
        return res.ok ? res.state : curr;
      }
      if (action === 'accept_wild4' || action === 'challenge_wild4') {
        const res = resolveUnoWild4Challenge(
          curr,
          currentUser.id,
          action === 'challenge_wild4' ? 'challenge' : 'accept'
        );
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
    return activeState.players.findIndex((p) => !p.isBot && p.userId === currentUser.id);
  }, [activeState, currentUser.id]);

  // Helper to check if a user is connected / speaking in Voice
  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

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

        {!isOffline && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

        <div className="p-4 rounded-2xl nc-specular-surface border border-white/[0.1] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
            <Sparkles className="w-4 h-4" />
            <span>
              {isOffline
                ? pickLang(lang, {
                    es: 'Juegos Party Offline vs Bots IA (Reglas Oficiales)',
                    ca: 'Jocs Party Offline vs Bots IA (Regles Oficials)',
                    en: 'Offline 4P Party Games (Official Rules)',
                  })
                : pickLang(lang, {
                    es: 'Juegos Online 4 Jugadores con Chat de Voz',
                    ca: 'Jocs Online 4 Jugadors amb Xat de Veu',
                    en: 'Online 4-Player Games with Live Voice',
                  })}
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {pickLang(lang, {
              es: 'Todos escogen su color antes de empezar. El anfitrión pulsa Play y cada turno tiene 15 segundos de reloj (si se acaba, la máquina mueve por ti).',
              ca: 'Tothom tria color abans de començar. L’amfitrió prem Play i cada torn té 15 segons.',
              en: 'Players pick their colors in the lobby, host clicks Play, and each turn has a 15s decision timer.',
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
                  {pickLang(lang, { es: 'Parchís Español 4P', ca: 'Parxís Espanyol 4P', en: 'Spanish Parchís 4P' })}
                </h4>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  {pickLang(lang, {
                    es: '68 casillas · Sal con 5 · Puentes y barreras · Comer (+20) · Meta (+10) · 3 seises',
                    ca: '68 caselles · Surt amb 5 · Ponts · Menjar (+20) · Meta (+10)',
                    en: '68 squares · Exit on 5 · Bridges · Capture (+20) · Goal (+10)',
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
                  ? pickLang(lang, { es: 'Jugar Parchís vs Bots', ca: 'Jugar Parxís vs Bots', en: 'Play vs 3 AI Bots' })
                  : pickLang(lang, { es: 'Abrir Sala de Parchís', ca: 'Obrir Sala de Parxís', en: 'Open Parchís Lobby' })}
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
                  {pickLang(lang, { es: 'UNO Oficial 1971 (4P)', ca: 'UNO Oficial 1971 (4P)', en: 'Official UNO 1971 (4P)' })}
                </h4>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  {pickLang(lang, {
                    es: '108 cartas Mattel · Sin acumular +2/+4 · Desafío +4 · Grita ¡UNO! (+2 penalización)',
                    ca: '108 cartes Mattel · Sense acumular +2/+4 · Desafiament +4 · Crida UNO',
                    en: '108-card Mattel deck · No stacking · +4 Challenge · Call UNO',
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
                  ? pickLang(lang, { es: 'Jugar UNO vs Bots', ca: 'Jugar UNO vs Bots', en: 'Play UNO vs 3 Bots' })
                  : pickLang(lang, { es: 'Abrir Sala de UNO', ca: 'Obrir Sala d’UNO', en: 'Open UNO Lobby' })}
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
  const remainingSec =
    activeState.status === 'playing' && activeState.turnDeadlineAt
      ? Math.max(0, Math.ceil((activeState.turnDeadlineAt - nowTs) / 1000))
      : 15;
  const canStartAsHost = isOffline || isHost;

  // ============================================================================
  // SHARED PRE-GAME LOBBY (CHOOSE COLOR + WAIT FOR HOST PLAY BUTTON)
  // ============================================================================
  if (activeState.status === 'waiting') {
    const gameTitle =
      activeState.gameType === 'parchis'
        ? pickLang(lang, { es: '🎲 Lobby Parchís Español (68 Casillas)', ca: '🎲 Lobby Parxís Espanyol', en: '🎲 Spanish Parchís Lobby' })
        : pickLang(lang, { es: '🃏 Lobby UNO Oficial (108 Cartas)', ca: '🃏 Lobby UNO Oficial', en: '🃏 Official UNO Lobby' });

    return (
      <div className="flex-1 flex flex-col justify-between p-3 sm:p-5 overflow-hidden gap-3">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-extrabold text-white truncate">{gameTitle}</h3>
            <p className="text-[11px] text-zinc-400 truncate">
              {pickLang(lang, {
                es: 'Haz clic en cualquier color disponible para elegir tu ficha antes de empezar.',
                ca: 'Fes clic en qualsevol color lliure per triar fitxa abans de començar.',
                en: 'Click any open color card to pick your seat before the host presses Play.',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={closeActiveGame}
            className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isOffline && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 min-h-0 content-center max-w-3xl w-full mx-auto">
          {activeState.players.map((pl) => {
            const cs = COLOR_STYLES[pl.color];
            const isMe = !pl.isBot && pl.userId === currentUser.id;
            const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
            const isSpeaking = !pl.isBot && Boolean(voiceChat?.speakingUserIds.includes(pl.userId));
            const clickable = pl.isBot;

            return (
              <button
                key={pl.seatIndex}
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (!clickable) return;
                  triggerHaptic('medium');
                  dispatchAction('join_seat', { seatIndex: pl.seatIndex });
                }}
                className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-2 min-h-[112px] ${
                  isMe
                    ? `${cs.badgeClass} ring-2 ${cs.ringClass} shadow-lg`
                    : isSpeaking
                    ? 'bg-emerald-500/15 border-emerald-400/70'
                    : clickable
                    ? 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.1] hover:border-white/30 cursor-pointer active:scale-95'
                    : 'bg-white/[0.04] border-white/[0.12] cursor-default'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase text-white ${cs.bgClass}`}>
                    {pickLang(lang, { es: cs.labelEs, ca: cs.labelCa, en: cs.labelEn })}
                  </span>
                  {!pl.isBot ? (
                    <VoiceSpeakerIndicator
                      inVoice={Boolean(voiceInfo)}
                      isSpeaking={isSpeaking}
                      isMuted={Boolean(voiceInfo?.isMuted)}
                    />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>

                <div>
                  <div className="text-xs font-bold text-white truncate">
                    {pl.isBot
                      ? pickLang(lang, { es: `${pl.name} (Libre)`, ca: `${pl.name} (Lliure)`, en: `${pl.name} (Open)` })
                      : pl.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {isMe
                      ? pickLang(lang, { es: 'Tu color seleccionado', ca: 'El teu color', en: 'Your selected color' })
                      : clickable
                      ? pickLang(lang, { es: 'Toca para elegir este color', ca: 'Toca per triar', en: 'Tap to pick color' })
                      : pickLang(lang, { es: 'Jugador listo', ca: 'Jugador llest', en: 'Player ready' })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] max-w-3xl w-full mx-auto shrink-0">
          <div className="text-xs text-zinc-300 text-center sm:text-left">
            {canStartAsHost
              ? pickLang(lang, {
                  es: 'Cuando todos hayan escogido su color, pulsa Play para arrancar con turnos de 15s.',
                  ca: 'Quan tothom hagi triat color, prem Play per començar amb torns de 15s.',
                  en: 'Once everyone picks a color, click Play to start with 15s turn timers.',
                })
              : pickLang(lang, {
                  es: 'Esperando a que el anfitrión de la sala pulse Play...',
                  ca: 'Esperant que l’amfitrió premi Play...',
                  en: 'Waiting for the room host to press Play...',
                })}
          </div>
          {canStartAsHost && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                dispatchAction('start_match');
              }}
              className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-[#9146FF] to-emerald-500 hover:brightness-110 text-xs font-extrabold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 transition-all shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{pickLang(lang, { es: 'Play · Iniciar Partida', ca: 'Play · Iniciar', en: 'Play · Start Match' })}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // PARCHÍS ESPAÑOL (68 CASILLAS) ACTIVE TABLE
  // ============================================================================
  if (activeState.gameType === 'parchis') {
    const pState = activeState as ParchisGameState;
    const stepsNeeded = pState.bonusSteps > 0 ? pState.bonusSteps : pState.dice || 0;
    const legalIds =
      pState.phase === 'move' && isMyTurn ? getLegalParchisPieceIds(pState, stepsNeeded) : [];

    // Also compute visual movement previews for any rolled dice (active turn player)
    const previewColor = activeSeat?.color;
    const activeLegalForPreview =
      pState.status === 'playing' && pState.phase === 'move' && stepsNeeded > 0
        ? getLegalParchisPieceIds(pState, stepsNeeded)
        : [];

    const movePreviews = useMemo(() => {
      if (!previewColor || activeLegalForPreview.length === 0) return [];
      return activeLegalForPreview.map((pid) => {
        const piece = pState.pieces[previewColor].find((x) => x.id === pid)!;
        const fromCoord = getParchisPieceCoord(previewColor, pid, piece.progress);
        const destProgress = piece.progress === -1 ? 0 : piece.progress + stepsNeeded;
        const toCoord = getParchisPieceCoord(previewColor, pid, destProgress);
        const destSq = parchisGlobalSquare(previewColor, destProgress);
        const canCapture =
          destSq !== null &&
          !PARCHIS_SAFE_SQUARES.has(destSq) &&
          PARTY_COLORS.some(
            (c) =>
              c !== previewColor &&
              pState.pieces[c].some((op) => parchisGlobalSquare(c, op.progress) === destSq)
          );
        return {
          pieceId: pid,
          fromCoord,
          toCoord,
          wasInBase: piece.progress === -1,
          reachesGoal: destProgress === 71,
          canCapture,
        };
      });
    }, [pState, previewColor, activeLegalForPreview, stepsNeeded]);

    // Group pieces stacked on same grid coordinate
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

    const coordBuckets = new Map<
      string,
      Array<{ color: PartyColor; id: number; progress: number; row: number; col: number }>
    >();
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

    const boardSizeClass = fullScreenMode
      ? 'w-[min(86vw,54dvh)] max-w-[440px] aspect-square'
      : 'w-full max-w-[440px] aspect-square';

    return (
      <div className={`flex-1 flex flex-col ${fullScreenMode ? 'justify-between overflow-hidden p-2.5 sm:p-3.5 gap-2' : 'overflow-y-auto p-3 space-y-2.5 custom-scrollbar'}`}>
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              🎲 {pickLang(lang, { es: 'Parchís Español · 68 Casillas', ca: 'Parxís Espanyol · 68 Caselles', en: 'Spanish Parchís · 68 Squares' })}
            </span>
            {pState.status === 'playing' && (
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${
                  remainingSec <= 4
                    ? 'bg-rose-500/25 border border-rose-400/50 text-rose-200 animate-pulse'
                    : remainingSec <= 7
                    ? 'bg-amber-500/25 border border-amber-400/45 text-amber-200'
                    : 'bg-white/[0.08] text-zinc-200'
                }`}
              >
                <Timer className="w-3 h-3" />
                <span>{remainingSec}s</span>
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

        {!isOffline && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

        {/* 4 Player Seats */}
        <div className="grid grid-cols-4 gap-1.5 shrink-0">
          {pState.players.map((pl) => {
            const isTurn = pState.status === 'playing' && pState.turnSeat === pl.seatIndex;
            const cs = COLOR_STYLES[pl.color];
            const finishedCount = pState.pieces[pl.color].filter((p) => p.progress === 71).length;
            const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
            const isSpeaking = !pl.isBot && Boolean(voiceChat?.speakingUserIds.includes(pl.userId));
            return (
              <div
                key={pl.seatIndex}
                className={`p-1.5 sm:p-2 rounded-xl border text-left transition-all min-w-0 ${
                  isSpeaking
                    ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : isTurn
                    ? `${cs.badgeClass} ring-1 ${cs.ringClass}`
                    : 'bg-white/[0.03] border-white/[0.07] text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cs.bgClass}`} />
                  <span className="text-[10px] sm:text-[11px] font-bold truncate">{pl.name}</span>
                  {!pl.isBot ? (
                    <VoiceSpeakerIndicator
                      inVoice={Boolean(voiceInfo)}
                      isSpeaking={isSpeaking}
                      isMuted={Boolean(voiceInfo?.isMuted)}
                    />
                  ) : (
                    <Bot className="w-3 h-3 opacity-70 shrink-0 ml-auto" />
                  )}
                </div>
                <div className="text-[9px] sm:text-[10px] opacity-80 font-mono tabular-nums mt-0.5 truncate">
                  🏁 {finishedCount}/4
                </div>
              </div>
            );
          })}
        </div>

        {/* Turn / Dice Bar */}
        <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="w-9 h-9 rounded-xl border flex items-center justify-center font-mono text-base font-black text-white shrink-0"
              style={{
                backgroundColor: activeSeat ? `${COLOR_STYLES[activeSeat.color].hex}30` : undefined,
                borderColor: activeSeat ? `${COLOR_STYLES[activeSeat.color].hex}88` : undefined,
              }}
            >
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
                        es: `Sacaste ${pState.dice} · Elige ficha (previsualización en ${COLOR_STYLES[activeSeat.color].labelEs})`,
                        ca: `Has tret ${pState.dice} · Toca una fitxa`,
                        en: `Rolled ${pState.dice} · Preview shown in your color`,
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
              className="min-h-9 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <Dices className="w-4 h-4 shrink-0" />
              <span>{pickLang(lang, { es: 'Tirar Dado', ca: 'Tirar Dau', en: 'Roll Dice' })}</span>
            </button>
          )}
        </div>

        {/* 19x19 Interactive Spanish 68-Square Parchís Board */}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className={`relative mx-auto rounded-2xl overflow-hidden border border-white/[0.18] bg-[#14151c] shadow-2xl select-none touch-manipulation ${boardSizeClass}`}>
            {/* 4 Corner Casa Quadrants (8x8/19 = 42.105%) */}
            <div className="absolute top-0 left-0 w-[42.105%] h-[42.105%] bg-red-600/25 border-r border-b border-white/15 p-2">
              <div className="w-full h-full rounded-2xl bg-[#101118]/85 border border-red-400/45 flex items-end justify-start p-1.5">
                <span className="text-[9px] font-black uppercase text-red-300/80">Rojo · 5</span>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-[42.105%] h-[42.105%] bg-blue-600/25 border-l border-b border-white/15 p-2">
              <div className="w-full h-full rounded-2xl bg-[#101118]/85 border border-blue-400/45 flex items-end justify-end p-1.5">
                <span className="text-[9px] font-black uppercase text-blue-300/80">Azul · 5</span>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-[42.105%] h-[42.105%] bg-yellow-500/25 border-l border-t border-white/15 p-2">
              <div className="w-full h-full rounded-2xl bg-[#101118]/85 border border-yellow-400/45 flex items-start justify-end p-1.5">
                <span className="text-[9px] font-black uppercase text-yellow-300/80">Amarillo · 5</span>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 w-[42.105%] h-[42.105%] bg-emerald-600/25 border-r border-t border-white/15 p-2">
              <div className="w-full h-full rounded-2xl bg-[#101118]/85 border border-emerald-400/45 flex items-start justify-start p-1.5">
                <span className="text-[9px] font-black uppercase text-emerald-300/80">Verde · 5</span>
              </div>
            </div>

            {/* Center 3x3 Meta (top 42.105%, left 42.105%, size 15.79%) */}
            <div className="absolute top-[42.105%] left-[42.105%] w-[15.79%] h-[15.79%] border border-white/25 bg-gradient-to-br from-amber-500/30 via-[#9146FF]/30 to-emerald-500/30 flex items-center justify-center">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 opacity-85" />
            </div>

            {/* 68 Shared Outer Ring Squares */}
            {PARCHIS_68_COORDS.map(([r, c], sqIdx) => {
              const isStartYellow = sqIdx === PARCHIS_START_OFFSETS.yellow;
              const isStartBlue = sqIdx === PARCHIS_START_OFFSETS.blue;
              const isStartRed = sqIdx === PARCHIS_START_OFFSETS.red;
              const isStartGreen = sqIdx === PARCHIS_START_OFFSETS.green;
              const isSafe = PARCHIS_SAFE_SQUARES.has(sqIdx);

              const bgCls = isStartRed
                ? 'bg-red-500/50'
                : isStartBlue
                ? 'bg-blue-500/50'
                : isStartYellow
                ? 'bg-yellow-500/50'
                : isStartGreen
                ? 'bg-emerald-500/50'
                : isSafe
                ? 'bg-white/[0.16]'
                : 'bg-white/[0.04]';

              return (
                <div
                  key={`ring-${sqIdx}`}
                  style={{
                    top: `${(r / 19) * 100}%`,
                    left: `${(c / 19) * 100}%`,
                    width: `${100 / 19}%`,
                    height: `${100 / 19}%`,
                  }}
                  className={`absolute border-[0.5px] border-white/15 flex items-center justify-center text-[7px] text-white/60 font-mono ${bgCls}`}
                >
                  {isSafe ? '●' : ''}
                </div>
              );
            })}

            {/* Colored 7-square Pasillos */}
            {PARTY_COLORS.map((col) =>
              PARCHIS_HOME_COLUMNS[col].map(([r, c], idx) => (
                <div
                  key={`hc-${col}-${idx}`}
                  style={{
                    top: `${(r / 19) * 100}%`,
                    left: `${(c / 19) * 100}%`,
                    width: `${100 / 19}%`,
                    height: `${100 / 19}%`,
                  }}
                  className={`absolute border-[0.5px] border-white/20 ${COLOR_STYLES[col].bgClass}/35`}
                />
              ))
            )}

            {/* SVG Dashed Movement Preview Overlay in Active Player's Color */}
            {previewColor && movePreviews.length > 0 && (
              <svg
                viewBox="0 0 19 19"
                className="absolute inset-0 w-full h-full pointer-events-none z-[15]"
              >
                {movePreviews.map((pv) => {
                  const isEmphasized = hoveredPieceId === null || hoveredPieceId === pv.pieceId;
                  const hex = COLOR_STYLES[previewColor].hex;
                  return (
                    <g key={`pv-${pv.pieceId}`} opacity={isEmphasized ? 0.95 : 0.28}>
                      <line
                        x1={pv.fromCoord[1] + 0.5}
                        y1={pv.fromCoord[0] + 0.5}
                        x2={pv.toCoord[1] + 0.5}
                        y2={pv.toCoord[0] + 0.5}
                        stroke={hex}
                        strokeWidth={hoveredPieceId === pv.pieceId ? 0.22 : 0.14}
                        strokeDasharray="0.32 0.22"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={pv.toCoord[1] + 0.5}
                        cy={pv.toCoord[0] + 0.5}
                        r={0.44}
                        fill={`${hex}38`}
                        stroke={hex}
                        strokeWidth={0.14}
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Clickable Destination Ghost Markers */}
            {previewColor &&
              movePreviews.map((pv) => {
                const cs = COLOR_STYLES[previewColor];
                const isEmphasized = hoveredPieceId === null || hoveredPieceId === pv.pieceId;
                return (
                  <button
                    key={`dest-${pv.pieceId}`}
                    type="button"
                    disabled={!isMyTurn}
                    onClick={() => {
                      if (!isMyTurn) return;
                      triggerHaptic('light');
                      dispatchAction('move_piece', { pieceId: pv.pieceId });
                    }}
                    style={{
                      top: `${((pv.toCoord[0] + 0.5) / 19) * 100}%`,
                      left: `${((pv.toCoord[1] + 0.5) / 19) * 100}%`,
                      width: '5.4%',
                      height: '5.4%',
                      transform: 'translate(-50%, -50%)',
                      borderColor: cs.hex,
                      backgroundColor: `${cs.hex}35`,
                    }}
                    title={
                      pv.wasInBase
                        ? 'Salida (5)'
                        : pv.canCapture
                        ? `Comer (+${stepsNeeded} -> +20)`
                        : `Mover ficha #${pv.pieceId + 1} (+${stepsNeeded})`
                    }
                    className={`absolute z-[18] rounded-full border-2 border-dashed flex items-center justify-center text-[7px] font-black text-white shadow-md transition-opacity ${
                      isEmphasized ? 'opacity-100' : 'opacity-30'
                    } ${isMyTurn ? 'cursor-pointer animate-pulse' : 'pointer-events-none'}`}
                  >
                    {pv.canCapture ? '⚔️' : pv.reachesGoal ? '🏁' : `+${pv.wasInBase ? 5 : stepsNeeded}`}
                  </button>
                );
              })}

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
                  onMouseEnter={() => {
                    if (item.legal) setHoveredPieceId(item.id);
                  }}
                  onMouseLeave={() => setHoveredPieceId((prev) => (prev === item.id ? null : prev))}
                  onClick={() => {
                    if (!item.legal) return;
                    triggerHaptic('light');
                    dispatchAction('move_piece', { pieceId: item.id });
                  }}
                  style={{
                    top: `${((item.row + 0.5) / 19) * 100 + offsetY}%`,
                    left: `${((item.col + 0.5) / 19) * 100 + offsetX}%`,
                    width: `${item.legal ? 5.2 : 4.4}%`,
                    height: `${item.legal ? 5.2 : 4.4}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  aria-label={`${item.color} #${item.id + 1}`}
                  className={`absolute z-10 rounded-full border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,0.85)] flex items-center justify-center text-[8px] font-black text-white transition-all ${
                    cs.bgClass
                  } ${
                    item.legal
                      ? 'ring-2 ring-white animate-pulse cursor-pointer hover:scale-125 z-20'
                      : 'cursor-default opacity-95'
                  }`}
                >
                  {item.progress === 71 ? '★' : item.id + 1}
                </button>
              );
            })}

            {/* Winner Overlay */}
            {pState.status === 'finished' && winnerSeat && (
              <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 text-center">
                <div className="text-3xl">🏆</div>
                <div className="text-base font-extrabold text-white">
                  {pickLang(lang, {
                    es: `${winnerSeat.name} gana el Parchís Español`,
                    ca: `${winnerSeat.name} guanya el Parxís Espanyol`,
                    en: `${winnerSeat.name} wins Spanish Parchís!`,
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
      </div>
    );
  }

  // ============================================================================
  // UNO OFICIAL (1971 MATTEL · 108 CARTAS) ACTIVE TABLE
  // ============================================================================
  const uState = activeState as UnoGameState;
  const myHand = mySeatIndex >= 0 ? uState.hands[mySeatIndex] || [] : [];
  const topDiscard = uState.discardPile[uState.discardPile.length - 1];
  const activeCs = COLOR_STYLES[uState.activeColor];
  const challengePrompt =
    uState.pendingWild4Challenge &&
    mySeatIndex === uState.pendingWild4Challenge.victimSeat &&
    isMyTurn;
  const canCallUno =
    mySeatIndex >= 0 &&
    uState.status === 'playing' &&
    myHand.length <= 2 &&
    !uState.unoCalledSeats.includes(mySeatIndex);
  const canCatchUno =
    mySeatIndex >= 0 &&
    uState.status === 'playing' &&
    uState.vulnerableUnoSeat !== null &&
    uState.vulnerableUnoSeat !== undefined &&
    uState.vulnerableUnoSeat !== mySeatIndex;

  return (
    <div className={`flex-1 flex flex-col ${fullScreenMode ? 'justify-between overflow-hidden p-2.5 sm:p-3.5 gap-2' : 'overflow-y-auto p-3 space-y-2.5 custom-scrollbar'}`}>
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-extrabold text-white truncate">
            🃏 UNO Oficial 1971 · {uState.deck.length} mazo
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-semibold text-zinc-200 shrink-0">
            {uState.direction === 1 ? '↻ Horario' : '↺ Antihorario'}
          </span>
          {uState.status === 'playing' && (
            <span
              className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${
                remainingSec <= 4
                  ? 'bg-rose-500/25 border border-rose-400/50 text-rose-200 animate-pulse'
                  : 'bg-white/[0.08] text-zinc-200'
              }`}
            >
              <Timer className="w-3 h-3" />
              <span>{remainingSec}s</span>
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
            aria-label={pickLang(lang, { es: 'Cerrar UNO', ca: 'Tancar UNO', en: 'Close UNO' })}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isOffline && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

      {/* 4 Seats Status */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        {uState.players.map((pl) => {
          const isTurn = uState.status === 'playing' && uState.turnSeat === pl.seatIndex;
          const cardCount = (uState.hands[pl.seatIndex] || []).length;
          const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
          const isSpeaking = !pl.isBot && Boolean(voiceChat?.speakingUserIds.includes(pl.userId));
          return (
            <div
              key={pl.seatIndex}
              className={`p-1.5 sm:p-2 rounded-xl border min-w-0 transition-all ${
                isSpeaking
                  ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : isTurn
                  ? 'bg-[#9146FF]/20 border-[#9146FF]/65 ring-1 ring-[#9146FF]/45'
                  : 'bg-white/[0.03] border-white/[0.07]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-white truncate">{pl.name}</span>
                {!pl.isBot ? (
                  <VoiceSpeakerIndicator
                    inVoice={Boolean(voiceInfo)}
                    isSpeaking={isSpeaking}
                    isMuted={Boolean(voiceInfo?.isMuted)}
                  />
                ) : (
                  <Bot className="w-3 h-3 opacity-75 shrink-0" />
                )}
              </div>
              <div className="text-[9px] sm:text-[10px] text-zinc-400 font-mono tabular-nums mt-0.5 flex items-center justify-between gap-1">
                <span className="flex items-center gap-0.5">
                  <Layers className="w-2.5 h-2.5" />
                  {cardCount}
                </span>
                <span>{pl.score}/{UNO_TARGET_SCORE}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center Felt Table */}
      <div className="relative p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-[#131520] via-[#171225] to-[#0E0F16] border border-white/[0.12] flex flex-col items-center justify-center gap-2.5 flex-1 min-h-0">
        <div className="flex items-center justify-center gap-4">
          {/* Draw 1 / Pass Button */}
          {uState.drawnPlayableCardId && isMyTurn ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                dispatchAction('pass_turn');
              }}
              className="w-20 h-24 sm:h-28 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border-2 border-amber-400/70 flex flex-col items-center justify-center gap-1 shadow-xl cursor-pointer active:scale-95 transition-all"
            >
              <span className="text-xs font-black text-amber-200 uppercase">Pasar</span>
              <span className="text-[10px] text-zinc-200 text-center px-1">Guardar carta</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!isMyTurn || Boolean(uState.pendingWild4Challenge)}
              onClick={() => {
                triggerHaptic('light');
                dispatchAction('draw_card');
              }}
              className={`w-20 h-24 sm:h-28 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 border-2 flex flex-col items-center justify-center gap-1 shadow-xl transition-all ${
                isMyTurn && !uState.pendingWild4Challenge
                  ? 'border-[#9146FF]/80 hover:-translate-y-1 cursor-pointer active:scale-95'
                  : 'border-white/15 opacity-70 cursor-default'
              }`}
            >
              <span className="text-lg font-black text-[#BF94FF]">UNO</span>
              <span className="text-[10px] font-bold text-zinc-300">
                {pickLang(lang, { es: 'Robar 1', ca: 'Robar 1', en: 'Draw 1' })}
              </span>
            </button>
          )}

          {/* Discard Pile */}
          {topDiscard && (
            <div
              className={`w-20 h-24 sm:h-28 rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center relative ${getUnoCardPalette(
                topDiscard
              )}`}
            >
              <span className="text-3xl font-black leading-none drop-shadow">
                {getUnoCardLabel(topDiscard.value)}
              </span>
              <span className="mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border bg-black/50 text-white border-white/25">
                {pickLang(lang, {
                  es: activeCs.labelEs,
                  ca: activeCs.labelCa,
                  en: activeCs.labelEn,
                })}
              </span>
            </div>
          )}
        </div>

        {/* Status Message + UNO! / Catch UNO buttons */}
        <div className="text-center space-y-1 max-w-md">
          <div className="text-xs font-bold text-white">
            {uState.status === 'finished' && winnerSeat
              ? `🏆 ${winnerSeat.name} (+${uState.roundPointsWon || 0} pts)`
              : uState.drawnPlayableCardId && isMyTurn
              ? pickLang(lang, {
                  es: 'Robaste una carta jugable · Tírala ahora o pulsa Pasar',
                  ca: 'Has robat una carta jugable · Tira-la o passa',
                  en: 'Drawn card is playable · Play it or Pass',
                })
              : isMyTurn
              ? pickLang(lang, {
                  es: 'Tu turno · Tira una carta válida o roba 1',
                  ca: 'El teu torn · Tira una carta o roba 1',
                  en: 'Your turn · Play a valid card or draw 1',
                })
              : pickLang(lang, {
                  es: `Turno de ${activeSeat?.name || '...'}`,
                  ca: `Torn de ${activeSeat?.name || '...'}`,
                  en: `${activeSeat?.name || '...'}'s turn`,
                })}
          </div>
          {uState.log.length > 0 && (
            <div className="text-[10px] text-zinc-400 truncate">{uState.log[uState.log.length - 1]}</div>
          )}

          {(canCallUno || canCatchUno) && (
            <div className="flex items-center justify-center gap-2 pt-1">
              {canCallUno && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    dispatchAction('call_uno');
                  }}
                  className="min-h-8 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white flex items-center gap-1.5 shadow-lg animate-bounce cursor-pointer"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>¡UNO!</span>
                </button>
              )}
              {canCatchUno && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    dispatchAction('catch_uno');
                  }}
                  className="min-h-8 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-zinc-950 flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>¡No gritó UNO! (+2)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Wild +4 Official Challenge Overlay */}
        {challengePrompt && uState.pendingWild4Challenge && (
          <div className="absolute inset-0 z-25 rounded-2xl bg-black/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-4 text-center">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
            <div className="text-xs sm:text-sm font-bold text-white max-w-xs">
              {pickLang(lang, {
                es: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} tiró un +4. ¿Aceptas robar 4 o le desafías?`,
                ca: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} ha tirat +4. Acceptes o desafies?`,
                en: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} played Wild +4. Accept 4 or Challenge?`,
              })}
            </div>
            <p className="text-[10px] text-zinc-400 max-w-xs">
              {pickLang(lang, {
                es: 'Si tenía carta del color anterior, él roba 4. Si no tenía, tú robas 6.',
                ca: 'Si tenia carta del color anterior, roba 4. Si no, tu robes 6.',
                en: 'If guilty, offender draws 4. If innocent, challenger draws 6.',
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => dispatchAction('accept_wild4')}
                className="min-h-9 px-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white cursor-pointer"
              >
                {pickLang(lang, { es: 'Aceptar (+4)', ca: 'Acceptar (+4)', en: 'Accept (+4)' })}
              </button>
              <button
                type="button"
                onClick={() => dispatchAction('challenge_wild4')}
                className="min-h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-zinc-950 cursor-pointer"
              >
                {pickLang(lang, { es: '¡Desafiar +4!', ca: 'Desafiar +4!', en: 'Challenge +4!' })}
              </button>
            </div>
          </div>
        )}

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
              {winnerSeat.score >= UNO_TARGET_SCORE
                ? `${winnerSeat.name} ¡Campeón de 500 pts!`
                : `${winnerSeat.name} gana la ronda (+${uState.roundPointsWon || 0} pts)`}
            </div>
            <button
              type="button"
              onClick={() => dispatchAction('rematch')}
              className="min-h-10 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {winnerSeat.score >= UNO_TARGET_SCORE
                  ? pickLang(lang, { es: 'Nueva Partida (0 pts)', ca: 'Nova Partida', en: 'New 500pt Match' })
                  : pickLang(lang, { es: 'Siguiente Ronda', ca: 'Següent Ronda', en: 'Next Round' })}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Player Hand */}
      {mySeatIndex >= 0 && (
        <div className="space-y-1 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            <span className="font-semibold text-zinc-200">
              {pickLang(lang, {
                es: `Tu mano (${myHand.length})`,
                ca: `La teva mà (${myHand.length})`,
                en: `Your hand (${myHand.length})`,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-1.5 px-1 custom-scrollbar">
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
                  className={`w-12 h-18 sm:w-14 sm:h-20 rounded-xl border-2 flex flex-col items-center justify-center shrink-0 shadow-lg transition-all ${getUnoCardPalette(
                    card
                  )} ${
                    playable
                      ? '-translate-y-1.5 ring-2 ring-white cursor-pointer hover:scale-105 active:scale-95'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-base sm:text-lg font-black leading-none">
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
