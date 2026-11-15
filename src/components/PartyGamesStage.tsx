import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dices,
  RotateCcw,
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
  preserveSeatsForRematch,
  resolveUnoWild4Challenge,
  rollParchisDice,
  startPartyMatch,
  type ParchisGameState,
  type PartyColor,
  type PartyGameState,
  type PartyGameType,
  type UnoGameState,
} from '../shared/partyGames';
import { UNO_CARD_BACK_SRC, getUnoCardSvgSrc } from '../assets/uno';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './games/GameVoiceBar';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  VictoryCelebrationOverlay,
  playGameSfx,
  useGameFloatingReaction,
  useGameSoundMute,
} from './games/GameEffects';
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
  /** Controlled chrome options when embedded inside GamesHubSection */
  hideHeaderChrome?: boolean;
  hideVoiceBar?: boolean;
  initialOfflineGameType?: PartyGameType | null;
  mutedOverride?: boolean;
  onToggleMuteOverride?: () => void;
}

const COLOR_STYLES: Record<
  PartyColor,
  {
    labelEs: string;
    labelCa: string;
    labelEn: string;
    hex: string;
    darkHex: string;
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
    darkHex: '#991b1b',
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
    darkHex: '#1e3a8a',
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
    darkHex: '#854d0e',
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
    darkHex: '#166534',
    bgClass: 'bg-emerald-500',
    borderClass: 'border-emerald-300',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
    ringClass: 'ring-emerald-300',
  },
};

const PARCHIS_68_COORDS: Array<[number, number]> = [
  [18, 10], [17, 10], [16, 10], [15, 10], [14, 10], [13, 10], [12, 10], [11, 10],
  [10, 11], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16], [10, 17], [10, 18],
  [9, 18],
  [8, 18], [8, 17], [8, 16], [8, 15], [8, 14], [8, 13], [8, 12], [8, 11],
  [7, 10], [6, 10], [5, 10], [4, 10], [3, 10], [2, 10], [1, 10], [0, 10],
  [0, 9],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8],
  [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [9, 0],
  [10, 0], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7],
  [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 8], [18, 8],
  [18, 9],
];

const PARCHIS_HOME_COLUMNS: Record<PartyColor, Array<[number, number]>> = {
  red: [[1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9]],
  blue: [[9, 17], [9, 16], [9, 15], [9, 14], [9, 13], [9, 12], [9, 11]],
  yellow: [[17, 9], [16, 9], [15, 9], [14, 9], [13, 9], [12, 9], [11, 9]],
  green: [[9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7]],
};

const PARCHIS_YARD_SLOTS: Record<PartyColor, Array<[number, number]>> = {
  red: [[2.5, 2.5], [2.5, 4.5], [4.5, 2.5], [4.5, 4.5]],
  blue: [[2.5, 13.5], [2.5, 15.5], [4.5, 13.5], [4.5, 15.5]],
  yellow: [[13.5, 13.5], [13.5, 15.5], [15.5, 13.5], [15.5, 15.5]],
  green: [[13.5, 2.5], [13.5, 4.5], [15.5, 2.5], [15.5, 4.5]],
};

const PARCHIS_GOAL_SLOTS: Record<PartyColor, [number, number]> = {
  red: [8.2, 9],
  blue: [9, 9.8],
  yellow: [9.8, 9],
  green: [9, 8.2],
};

function getParchisPieceCoord(color: PartyColor, pieceId: number, progress: number): [number, number] {
  if (progress < 0) return PARCHIS_YARD_SLOTS[color][pieceId % 4];
  if (progress >= 71) return PARCHIS_GOAL_SLOTS[color];
  if (progress >= 64) return PARCHIS_HOME_COLUMNS[color][Math.min(6, progress - 64)];
  const sq = parchisGlobalSquare(color, progress);
  if (sq !== null && PARCHIS_68_COORDS[sq]) return PARCHIS_68_COORDS[sq];
  return PARCHIS_YARD_SLOTS[color][0];
}

// 3x3 grid dot layout for physical cube dice faces (1..6)
const DICE_PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const DiceFacePips: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => {
  const active = DICE_PIP_POSITIONS[value] || DICE_PIP_POSITIONS[1];
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 gap-[3px] p-2 w-full h-full rounded-[11px] bg-gradient-to-br from-[#FFFDF7] via-[#F2E9D5] to-[#D4C5A3] border border-white/85 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_-2px_4px_rgba(0,0,0,0.22)] ${className}`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="flex items-center justify-center">
          {active.includes(i) && (
            <span
              className={`rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.75)] ${
                value === 1 ? 'bg-rose-600 w-[9px] h-[9px]' : 'bg-zinc-900 w-[6.5px] h-[6.5px]'
              }`}
            />
          )}
        </span>
      ))}
    </div>
  );
};

/** Interactive 3D Cube Dice with real pips + roll tumble & bounce */
const Interactive3DDice: React.FC<{
  value: number | null;
  rollingKey: number;
  accentHex?: string;
  canRoll: boolean;
  onRoll: () => void;
}> = ({ value, rollingKey, accentHex = '#9146FF', canRoll, onRoll }) => {
  const [tumbling, setTumbling] = useState(false);

  useEffect(() => {
    if (rollingKey === 0) return;
    setTumbling(true);
    const id = window.setTimeout(() => setTumbling(false), 500);
    return () => window.clearTimeout(id);
  }, [rollingKey]);

  const faceVal = value && value >= 1 && value <= 6 ? value : 5;
  const isSix = faceVal === 6 && !tumbling;

  return (
    <button
      type="button"
      disabled={!canRoll}
      onClick={() => {
        if (!canRoll) return;
        triggerHaptic('medium');
        onRoll();
      }}
      aria-label="Dado 3D · Tocar para tirar"
      className={`nc-dice-scene relative w-14 h-14 p-1 rounded-2xl shrink-0 transition-all ${
        canRoll
          ? 'cursor-pointer hover:scale-110 active:scale-95 ring-2 ring-amber-300/90 animate-pulse'
          : 'cursor-default opacity-90'
      } ${isSix ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.85)]' : ''}`}
      style={{
        boxShadow: isSix
          ? '0 0 28px rgba(251,191,36,0.85), 0 0 10px rgba(244,63,94,0.6)'
          : canRoll
          ? `0 0 24px ${accentHex}99`
          : '0 4px 12px rgba(0,0,0,0.5)',
        backgroundColor: isSix ? 'rgba(245,158,11,0.25)' : canRoll ? `${accentHex}38` : `${accentHex}20`,
      }}
    >
      {isSix && (
        <>
          <span className="absolute -top-1.5 -right-1 text-xs animate-bounce pointer-events-none z-20">✨</span>
          <span className="absolute -bottom-1 -left-1 text-xs animate-pulse pointer-events-none z-20">🔥</span>
        </>
      )}
      <div className={`nc-dice-cube ${tumbling ? 'nc-dice-tumbling' : ''}`}>
        <div
          className="absolute inset-0"
          style={{ transform: 'translateZ(24px)' }}
        >
          <DiceFacePips value={faceVal} />
        </div>
        <div
          className="absolute inset-0 opacity-75"
          style={{ transform: 'rotateY(90deg) translateZ(24px)' }}
        >
          <DiceFacePips value={((faceVal + 1) % 6) + 1} />
        </div>
        <div
          className="absolute inset-0 opacity-75"
          style={{ transform: 'rotateX(90deg) translateZ(24px)' }}
        >
          <DiceFacePips value={((faceVal + 3) % 6) + 1} />
        </div>
      </div>
    </button>
  );
};

interface BoardBurstEvent {
  id: number;
  row: number;
  col: number;
  kind: 'capture' | 'goal';
  colorHex: string;
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
  hideHeaderChrome = false,
  hideVoiceBar = false,
  initialOfflineGameType = null,
  mutedOverride,
  onToggleMuteOverride,
}) => {
  const [localState, setLocalState] = useState<PartyGameState | null>(() => {
    if (isOffline && initialOfflineGameType) {
      const human = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
      return initialOfflineGameType === 'uno'
        ? createInitialUnoState([human], { waitForHost: true })
        : createInitialParchisState([human], { waitForHost: true });
    }
    return null;
  });
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [hoveredPieceId, setHoveredPieceId] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [localMuted, toggleLocalMute] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;
  const toggleMute = onToggleMuteOverride || toggleLocalMute;

  // Parchís animation state: hop-by-hop piece paths, 3D dice roll counter, burst particles
  const [diceAnimSeq, setDiceAnimSeq] = useState(0);
  const [hopProgressMap, setHopProgressMap] = useState<Record<string, number>>({});
  const [burstEvents, setBurstEvents] = useState<BoardBurstEvent[]>([]);
  const prevParchisProgressRef = useRef<Record<string, number>>({});
  const prevDiceValueRef = useRef<number | null>(null);
  const prevTurnLogLenRef = useRef<number>(0);

  // UNO animation state: neon color-wave + draw pile shake + arc card flight
  const [unoWaveColor, setUnoWaveColor] = useState<PartyColor | null>(null);
  const [unoWaveKey, setUnoWaveKey] = useState(0);
  const [drawPileShakeKey, setDrawPileShakeKey] = useState(0);
  const prevUnoDiscardLenRef = useRef<number>(0);
  const prevUnoStatusRef = useRef<string | null>(null);

  const activeState = isOffline ? localState : partyGameState;

  useEffect(() => {
    onActiveStateChange?.(Boolean(activeState));
  }, [activeState, onActiveStateChange]);

  // Reset local state if `initialOfflineGameType` changes while offline
  useEffect(() => {
    if (!isOffline) return;
    if (!initialOfflineGameType) return;
    setLocalState((curr) => {
      if (curr && curr.gameType === initialOfflineGameType) return curr;
      const human = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
      return initialOfflineGameType === 'uno'
        ? createInitialUnoState([human], { waitForHost: true })
        : createInitialParchisState([human], { waitForHost: true });
    });
  }, [isOffline, initialOfflineGameType, currentUser.id, currentUser.name, currentUser.avatar]);

  // Live 15s turn timer
  useEffect(() => {
    if (!activeState || activeState.status !== 'playing') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [activeState?.status, activeState?.turnDeadlineAt, activeState?.updatedAt]);

  // Offline AI bot loop + 15s human auto-move
  useEffect(() => {
    if (!isOffline || !localState || localState.status !== 'playing') return;
    const seat = localState.players[localState.turnSeat];
    if (!seat) return;

    const isBot = Boolean(seat.isBot);
    const delayMs = isBot
      ? 720
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

  // Parchís transition detector: 3D dice spin, hop-by-hop movement, captures, gold meta sparks, victory SFX
  useEffect(() => {
    if (!activeState || activeState.gameType !== 'parchis') {
      prevParchisProgressRef.current = {};
      prevDiceValueRef.current = null;
      return;
    }
    const pState = activeState as ParchisGameState;
    const logLen = pState.log.length;

    // 1) Dice roll trigger
    if (pState.dice !== null && (pState.dice !== prevDiceValueRef.current || logLen > prevTurnLogLenRef.current) && pState.phase === 'move') {
      setDiceAnimSeq((s) => s + 1);
      playGameSfx('dice_roll', muted);
    }
    prevDiceValueRef.current = pState.dice;
    prevTurnLogLenRef.current = logLen;

    // 2) Victory sound
    if (pState.status === 'finished' && prevUnoStatusRef.current !== 'finished') {
      playGameSfx('victory', muted);
    }
    prevUnoStatusRef.current = pState.status;

    // 3) Piece progress transitions (hop-by-hop, capture back to home, or meta arrival)
    const prevMap = prevParchisProgressRef.current;
    const nextMap: Record<string, number> = {};
    const stepTimers: number[] = [];

    for (const c of PARTY_COLORS) {
      for (const piece of pState.pieces[c]) {
        const key = `${c}-${piece.id}`;
        nextMap[key] = piece.progress;
        const prevProg = prevMap[key];

        if (typeof prevProg === 'number' && prevProg !== piece.progress) {
          // Captured back to home!
          if (prevProg >= 0 && piece.progress === -1) {
            const [capRow, capCol] = getParchisPieceCoord(c, piece.id, prevProg);
            const eid = Date.now() + Math.random();
            setBurstEvents((prev) => [
              ...prev.slice(-4),
              { id: eid, row: capRow, col: capCol, kind: 'capture', colorHex: COLOR_STYLES[c].hex },
            ]);
            playGameSfx('parchis_capture', muted);
            const t = window.setTimeout(() => {
              setBurstEvents((prev) => prev.filter((ev) => ev.id !== eid));
            }, 720);
            stepTimers.push(t);
          } else if (piece.progress > prevProg && prevProg >= 0) {
            // Hop-by-hop step animation along squares!
            const totalSteps = Math.min(20, piece.progress - prevProg);
            for (let s = 1; s <= totalSteps; s++) {
              const targetStep = prevProg + s;
              const t = window.setTimeout(() => {
                setHopProgressMap((curr) => ({ ...curr, [key]: targetStep }));
                playGameSfx('parchis_hop', muted);
                if (s === totalSteps) {
                  const clr = window.setTimeout(() => {
                    setHopProgressMap((curr) => {
                      const copy = { ...curr };
                      delete copy[key];
                      return copy;
                    });
                  }, 140);
                  stepTimers.push(clr);
                }
              }, (s - 1) * 95);
              stepTimers.push(t);
            }
          }

          // Reached goal!
          if (piece.progress === 71 && prevProg < 71) {
            const eid = Date.now() + Math.random();
            setBurstEvents((prev) => [
              ...prev.slice(-4),
              { id: eid, row: 9, col: 9, kind: 'goal', colorHex: '#FACC15' },
            ]);
            playGameSfx('parchis_goal', muted);
            const t = window.setTimeout(() => {
              setBurstEvents((prev) => prev.filter((ev) => ev.id !== eid));
            }, 760);
            stepTimers.push(t);
          }
        }
      }
    }

    prevParchisProgressRef.current = nextMap;
    return () => {
      for (const t of stepTimers) window.clearTimeout(t);
    };
  }, [activeState, muted]);

  // UNO transition detector: flying arc card SFX + neon wave & draw-pile shake on +2/+4/Wild
  useEffect(() => {
    if (!activeState || activeState.gameType !== 'uno') {
      prevUnoDiscardLenRef.current = 0;
      return;
    }
    const uState = activeState as UnoGameState;
    const discardLen = uState.discardPile.length;

    if (uState.status === 'finished' && prevUnoStatusRef.current !== 'finished') {
      playGameSfx('victory', muted);
    }
    prevUnoStatusRef.current = uState.status;

    if (discardLen > prevUnoDiscardLenRef.current && prevUnoDiscardLenRef.current > 0) {
      const top = uState.discardPile[discardLen - 1];
      if (top && (top.value === 'draw2' || top.value === 'wild' || top.value === 'wild4')) {
        setUnoWaveColor(uState.activeColor);
        setUnoWaveKey((k) => k + 1);
        if (top.value === 'draw2' || top.value === 'wild4') {
          setDrawPileShakeKey((k) => k + 1);
        }
        playGameSfx('wild_wave', muted);
      } else {
        playGameSfx('card_play', muted);
      }
    }
    prevUnoDiscardLenRef.current = discardLen;
  }, [activeState, muted]);

  const { floatingReaction, sendReaction } = useGameFloatingReaction(isOffline);

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
    if (action === 'draw_card') playGameSfx('card_draw', muted);
    if (action === 'call_uno') playGameSfx('uno_shout', muted);

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
        const preservedSeats = preserveSeatsForRematch(curr.players, [human]);
        return curr.gameType === 'uno'
          ? createInitialUnoState([human], {
              waitForHost: false,
              existingScores: maxScore >= UNO_TARGET_SCORE ? [0, 0, 0, 0] : existingScores,
              preservedSeats,
            })
          : createInitialParchisState([human], { waitForHost: false, preservedSeats });
      }
      if (action === 'start_match') return startPartyMatch(curr);
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
    if (isOffline) setLocalState(null);
    else onCloseOnline?.();
  };

  const mySeatIndex = useMemo(() => {
    if (!activeState) return -1;
    return activeState.players.findIndex((p) => !p.isBot && p.userId === currentUser.id);
  }, [activeState, currentUser.id]);

  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

  const activeSeat = activeState ? activeState.players[activeState.turnSeat] : undefined;
  const isMyTurn = Boolean(
    activeState &&
      activeState.status === 'playing' &&
      activeSeat &&
      !activeSeat.isBot &&
      activeSeat.userId === currentUser.id
  );

  // Parchís precomputed previews & piece positions (Top-level hook — never conditional!)
  const parchisMovePreviews = useMemo(() => {
    if (!activeState || activeState.gameType !== 'parchis' || activeState.status !== 'playing') {
      return [];
    }
    const pState = activeState as ParchisGameState;
    const stepsNeeded = pState.bonusSteps > 0 ? pState.bonusSteps : pState.dice || 0;
    const previewColor = activeSeat?.color;
    if (!previewColor || pState.phase !== 'move' || stepsNeeded <= 0) return [];
    const activeLegalForPreview = getLegalParchisPieceIds(pState, stepsNeeded);
    if (activeLegalForPreview.length === 0) return [];
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
  }, [activeState, activeSeat]);

  // ============================================================================
  // 1. SIDEBAR FALLBACK LAUNCHER VIEW
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

        {!isOffline && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.09] space-y-3 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎲</span>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">Parchís Español 4P</h4>
                <p className="text-[11px] text-zinc-400">68 casillas · 15s por turno</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => (isOffline ? startOfflineGame('parchis') : onStartOnline?.('parchis'))}
              className="min-h-10 w-full px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95"
            >
              {isOffline ? <Bot className="w-4 h-4 shrink-0" /> : <Users className="w-4 h-4 shrink-0" />}
              <span>{isOffline ? 'Jugar vs Bots IA' : 'Abrir Parchís'}</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.09] space-y-3 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🃏</span>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">UNO Oficial 1971</h4>
                <p className="text-[11px] text-zinc-400">108 cartas · Desafío +4</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => (isOffline ? startOfflineGame('uno') : onStartOnline?.('uno'))}
              className="min-h-10 w-full px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95"
            >
              {isOffline ? <Bot className="w-4 h-4 shrink-0" /> : <Users className="w-4 h-4 shrink-0" />}
              <span>{isOffline ? 'Jugar UNO vs Bots' : 'Abrir UNO'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const winnerSeat =
    activeState.winnerSeat !== null ? activeState.players[activeState.winnerSeat] : null;
  const remainingSec =
    activeState.status === 'playing' && activeState.turnDeadlineAt
      ? Math.max(0, Math.ceil((activeState.turnDeadlineAt - nowTs) / 1000))
      : 15;
  const canStartAsHost = isOffline || isHost;

  // ============================================================================
  // 2. PRE-GAME COLOR PICKER LOBBY
  // ============================================================================
  if (activeState.status === 'waiting') {
    const gameTitle =
      activeState.gameType === 'parchis'
        ? pickLang(lang, { es: '🎲 Parchís Español', ca: '🎲 Parxís Espanyol', en: '🎲 Spanish Parchís' })
        : pickLang(lang, { es: '🃏 UNO Oficial 1971', ca: '🃏 UNO Oficial 1971', en: '🃏 Official UNO' });

    return (
      <div className="relative flex-1 flex flex-col justify-between p-2.5 sm:p-4 overflow-hidden gap-3">
        {!hideHeaderChrome && (
          <GameFloatingReactionToast reaction={floatingReaction} className="top-12 right-2" />
        )}
        {!hideHeaderChrome && (
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="text-sm sm:text-base font-extrabold text-white truncate">{gameTitle}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              <GameReactionButton
                lang={lang}
                compact
                onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
              />
              <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
              <button
                type="button"
                onClick={closeActiveGame}
                className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!isOffline && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 min-h-0 content-center max-w-3xl w-full mx-auto">
          {activeState.players.map((pl) => {
            const cs = COLOR_STYLES[pl.color];
            const isMe = !pl.isBot && pl.userId === currentUser.id;
            const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
            const voiceLevel = !pl.isBot ? voiceChat?.audioLevels?.[pl.userId] ?? 0 : 0;
            const isSpeaking =
              !pl.isBot &&
              !voiceInfo?.isMuted &&
              (voiceLevel > 0.06 || Boolean(voiceChat?.speakingUserIds.includes(pl.userId)));
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
                className={`p-3 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-2 min-h-[104px] ${
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
                      audioLevel={voiceLevel}
                    />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>

                <div>
                  <div className="text-xs font-bold text-white truncate">
                    {pl.isBot ? pickLang(lang, { es: 'Libre · Bot IA', ca: 'Lliure · Bot IA', en: 'Open · AI Bot' }) : pl.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5 whitespace-nowrap">
                    {isMe
                      ? pickLang(lang, { es: 'Tu color', ca: 'El teu color', en: 'Your color' })
                      : clickable
                      ? pickLang(lang, { es: 'Tocar para elegir', ca: 'Toca per triar', en: 'Tap to pick' })
                      : pickLang(lang, { es: 'Listo', ca: 'Llest', en: 'Ready' })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 rounded-2xl nc-tabletop-slate border border-white/[0.08] max-w-3xl w-full mx-auto shrink-0">
          <span className="text-xs text-zinc-300 text-center sm:text-left">
            {canStartAsHost
              ? pickLang(lang, {
                  es: 'Elige tu color y pulsa Play (15s por turno)',
                  ca: 'Tria color i prem Play (15s per torn)',
                  en: 'Pick your color & click Play (15s/turn)',
                })
              : pickLang(lang, {
                  es: 'Esperando a que el anfitrión pulse Play…',
                  ca: 'Esperant que l’amfitrió premi Play…',
                  en: 'Waiting for host to press Play…',
                })}
          </span>
          {canStartAsHost && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                dispatchAction('start_match');
              }}
              className="min-h-10 px-6 rounded-xl bg-gradient-to-r from-[#9146FF] to-emerald-500 hover:brightness-110 text-xs font-extrabold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 transition-all shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{pickLang(lang, { es: 'Play · Empezar', ca: 'Play · Començar', en: 'Play · Start' })}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. PARCHÍS ESPAÑOL (68 CASILLAS) ACTIVE TABLE
  // ============================================================================
  if (activeState.gameType === 'parchis') {
    const pState = activeState as ParchisGameState;
    const stepsNeeded = pState.bonusSteps > 0 ? pState.bonusSteps : pState.dice || 0;
    const legalIds =
      pState.phase === 'move' && isMyTurn ? getLegalParchisPieceIds(pState, stepsNeeded) : [];
    const previewColor = activeSeat?.color;

    const positionedPieces: Array<{
      color: PartyColor;
      id: number;
      progress: number;
      row: number;
      col: number;
      legal: boolean;
      hopping: boolean;
      stackIndex: number;
      stackTotal: number;
    }> = [];

    const coordBuckets = new Map<
      string,
      Array<{ color: PartyColor; id: number; progress: number; row: number; col: number; hopping: boolean }>
    >();
    for (const c of PARTY_COLORS) {
      for (const piece of pState.pieces[c]) {
        const key = `${c}-${piece.id}`;
        const animProg = hopProgressMap[key];
        const effectiveProgress = typeof animProg === 'number' ? animProg : piece.progress;
        const [row, col] = getParchisPieceCoord(c, piece.id, effectiveProgress);
        const bucketKey = `${row.toFixed(1)},${col.toFixed(1)}`;
        const arr = coordBuckets.get(bucketKey) || [];
        arr.push({
          color: c,
          id: piece.id,
          progress: piece.progress,
          row,
          col,
          hopping: typeof animProg === 'number',
        });
        coordBuckets.set(bucketKey, arr);
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
      ? 'w-[min(88vw,52dvh)] max-w-[440px] aspect-square'
      : 'w-full max-w-[440px] aspect-square';

    return (
      <div className={`flex-1 flex flex-col ${fullScreenMode ? 'justify-between overflow-hidden p-1.5 sm:p-2 gap-1.5' : 'overflow-y-auto p-3 space-y-2.5 custom-scrollbar'}`}>
        {!hideHeaderChrome && (
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-extrabold text-white truncate">
                🎲 {pickLang(lang, { es: 'Parchís 68 Casillas', ca: 'Parxís 68 Caselles', en: 'Spanish Parchís' })}
              </span>
              {pState.status === 'playing' && (
                <span
                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${
                    remainingSec <= 4
                      ? 'bg-rose-500/25 border border-rose-400/50 text-rose-200'
                      : 'bg-white/[0.08] text-zinc-200'
                  }`}
                >
                  <Timer className="w-3 h-3" />
                  <span>{remainingSec}s</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <GameReactionButton
                lang={lang}
                compact
                onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
              />
              <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
              <button
                type="button"
                onClick={() => dispatchAction('rematch')}
                className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{pickLang(lang, { es: 'Nueva', ca: 'Nova', en: 'New' })}</span>
              </button>
              <button
                type="button"
                onClick={closeActiveGame}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {!isOffline && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

        {/* 4 Player Seats */}
        <div className="grid grid-cols-4 gap-1.5 shrink-0">
          {pState.players.map((pl) => {
            const isTurn = pState.status === 'playing' && pState.turnSeat === pl.seatIndex;
            const cs = COLOR_STYLES[pl.color];
            const finishedCount = pState.pieces[pl.color].filter((p) => p.progress === 71).length;
            const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
            const voiceLevel = !pl.isBot ? voiceChat?.audioLevels?.[pl.userId] ?? 0 : 0;
            const isSpeaking =
              !pl.isBot &&
              !voiceInfo?.isMuted &&
              (voiceLevel > 0.06 || Boolean(voiceChat?.speakingUserIds.includes(pl.userId)));
            return (
              <div
                key={pl.seatIndex}
                className={`p-1.5 sm:p-2 rounded-xl border text-left transition-all min-w-0 ${
                  isSpeaking
                    ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60'
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
                      audioLevel={voiceLevel}
                    />
                  ) : (
                    <Bot className="w-3 h-3 opacity-70 shrink-0 ml-auto" />
                  )}
                </div>
                <div className="text-[9px] sm:text-[10px] opacity-80 font-mono tabular-nums mt-0.5 flex items-center justify-between">
                  <span>🏁 {finishedCount}/4</span>
                  {isTurn && pState.status === 'playing' && (
                    <span className={remainingSec <= 4 ? 'text-rose-300 font-bold' : ''}>{remainingSec}s</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive 3D Dice + Turn Prompt Bar */}
        <div className="p-2 rounded-xl nc-tabletop-slate border border-white/[0.09] flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Interactive3DDice
              value={pState.dice}
              rollingKey={diceAnimSeq}
              accentHex={activeSeat ? COLOR_STYLES[activeSeat.color].hex : '#9146FF'}
              canRoll={pState.status === 'playing' && isMyTurn && pState.phase === 'roll'}
              onRoll={() => dispatchAction('roll_dice')}
            />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-white truncate">
                {pState.status === 'finished' && winnerSeat
                  ? `🏆 ${winnerSeat.name}`
                  : isMyTurn
                  ? pState.phase === 'roll'
                    ? pickLang(lang, {
                        es: 'Tu turno · Toca el dado para tirar',
                        ca: 'El teu torn · Toca el dau',
                        en: 'Your turn · Tap the die',
                      })
                    : pState.bonusSteps > 0
                    ? pickLang(lang, {
                        es: `Bonus +${pState.bonusSteps} · Elige ficha`,
                        ca: `Bonus +${pState.bonusSteps} · Tria fitxa`,
                        en: `Bonus +${pState.bonusSteps} · Pick piece`,
                      })
                    : pickLang(lang, {
                        es: `Sacaste ${pState.dice} · Elige ficha`,
                        ca: `Has tret ${pState.dice} · Tria fitxa`,
                        en: `Rolled ${pState.dice} · Move piece`,
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

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => dispatchAction('rematch')}
              title={pickLang(lang, { es: 'Nueva partida', ca: 'Nova partida', en: 'New match' })}
              className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 19x19 Interactive Spanish 68-Square Parchís Tabletop */}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className={`relative mx-auto rounded-2xl p-2 nc-tabletop-slate border border-white/[0.14] select-none touch-manipulation ${boardSizeClass}`}>
            <div className="relative w-full h-full rounded-xl overflow-hidden bg-[#12141c] border border-white/15">
              {/* 4 Corner Casa Quadrants */}
              <div className="absolute top-0 left-0 w-[42.105%] h-[42.105%] bg-red-600/20 border-r border-b border-white/15 p-1.5">
                <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-red-400/45 flex items-end justify-start p-1.5">
                  <span className="text-[9px] font-black uppercase text-red-300/85">Rojo</span>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-[42.105%] h-[42.105%] bg-blue-600/20 border-l border-b border-white/15 p-1.5">
                <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-blue-400/45 flex items-end justify-end p-1.5">
                  <span className="text-[9px] font-black uppercase text-blue-300/85">Azul</span>
                </div>
              </div>
              <div className="absolute bottom-0 right-0 w-[42.105%] h-[42.105%] bg-yellow-500/20 border-l border-t border-white/15 p-1.5">
                <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-yellow-400/45 flex items-start justify-end p-1.5">
                  <span className="text-[9px] font-black uppercase text-yellow-300/85">Amarillo</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-[42.105%] h-[42.105%] bg-emerald-600/20 border-r border-t border-white/15 p-1.5">
                <div className="w-full h-full rounded-xl bg-[#0e1017]/90 border border-emerald-400/45 flex items-start justify-start p-1.5">
                  <span className="text-[9px] font-black uppercase text-emerald-300/85">Verde</span>
                </div>
              </div>

              {/* Center Meta with Radiant Rayburst and 3D Golden Trophy */}
              <div className="absolute top-[42.105%] left-[42.105%] w-[15.79%] h-[15.79%] border border-amber-300/40 bg-gradient-to-br from-amber-500/35 via-[#9146FF]/30 to-emerald-500/30 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.45)]">
                <div className="absolute inset-0 nc-ray-spin opacity-35 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.65)_0%,transparent_70%)] pointer-events-none" />
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)] relative z-10" />
              </div>

              {/* 68 Outer Ring Squares */}
              {PARCHIS_68_COORDS.map(([r, c], sqIdx) => {
                const isStartYellow = sqIdx === PARCHIS_START_OFFSETS.yellow;
                const isStartBlue = sqIdx === PARCHIS_START_OFFSETS.blue;
                const isStartRed = sqIdx === PARCHIS_START_OFFSETS.red;
                const isStartGreen = sqIdx === PARCHIS_START_OFFSETS.green;
                const isSafe = PARCHIS_SAFE_SQUARES.has(sqIdx);

                const bgCls = isStartRed
                  ? 'bg-red-500/45'
                  : isStartBlue
                  ? 'bg-blue-500/45'
                  : isStartYellow
                  ? 'bg-yellow-500/45'
                  : isStartGreen
                  ? 'bg-emerald-500/45'
                  : isSafe
                  ? 'bg-amber-400/20 border-amber-300/40'
                  : 'bg-white/[0.03]';

                return (
                  <div
                    key={`ring-${sqIdx}`}
                    style={{
                      top: `${(r / 19) * 100}%`,
                      left: `${(c / 19) * 100}%`,
                      width: `${100 / 19}%`,
                      height: `${100 / 19}%`,
                    }}
                    className={`absolute border-[0.5px] border-white/15 flex items-center justify-center text-[7px] text-white/55 font-mono ${bgCls}`}
                  >
                    {isSafe ? <span className="text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.95)] font-bold text-[8px]">★</span> : ''}
                  </div>
                );
              })}

              {/* Colored Home Columns */}
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

              {/* Dashed Movement Preview Lines */}
              {previewColor && parchisMovePreviews.length > 0 && (
                <svg
                  viewBox="0 0 19 19"
                  className="absolute inset-0 w-full h-full pointer-events-none z-[15]"
                >
                  {parchisMovePreviews.map((pv) => {
                    const isEmphasized = hoveredPieceId === null || hoveredPieceId === pv.pieceId;
                    const hex = COLOR_STYLES[previewColor].hex;
                    return (
                      <g key={`pv-${pv.pieceId}`} opacity={isEmphasized ? 0.95 : 0.25}>
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
                          fill={`${hex}35`}
                          stroke={hex}
                          strokeWidth={0.14}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Clickable Destination Ghosts */}
              {previewColor &&
                parchisMovePreviews.map((pv) => {
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
                        width: '5.5%',
                        height: '5.5%',
                        transform: 'translate(-50%, -50%)',
                        borderColor: cs.hex,
                        backgroundColor: `${cs.hex}35`,
                      }}
                      className={`absolute z-[18] rounded-full border-2 border-dashed flex items-center justify-center text-[7px] font-black text-white shadow-md transition-opacity ${
                        isEmphasized ? 'opacity-100' : 'opacity-30'
                      } ${isMyTurn ? 'cursor-pointer' : 'pointer-events-none'}`}
                    >
                      {pv.canCapture ? '⚔️' : pv.reachesGoal ? '🏁' : `+${pv.wasInBase ? 5 : stepsNeeded}`}
                    </button>
                  );
                })}

              {/* Burst Particles on Captures & Gold Goal Sparks */}
              {burstEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    top: `${((ev.row + 0.5) / 19) * 100}%`,
                    left: `${((ev.col + 0.5) / 19) * 100}%`,
                  }}
                  className="absolute z-[25] pointer-events-none"
                  aria-hidden="true"
                >
                  {Array.from({ length: 10 }).map((_, idx) => {
                    const angle = (idx / 10) * Math.PI * 2;
                    const dist = ev.kind === 'goal' ? 30 : 24;
                    const bx = `${Math.round(Math.cos(angle) * dist)}px`;
                    const by = `${Math.round(Math.sin(angle) * dist)}px`;
                    return (
                      <span
                        key={idx}
                        style={
                          {
                            '--bx': bx,
                            '--by': by,
                            backgroundColor: ev.kind === 'goal' ? (idx % 2 === 0 ? '#FACC15' : '#FEF08A') : ev.colorHex,
                          } as React.CSSProperties
                        }
                        className="nc-particle-burst absolute w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                      />
                    );
                  })}
                </div>
              ))}

              {/* 16 Glossy 3D Resin Tokens */}
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
                      width: `${item.legal ? 5.6 : 4.7}%`,
                      height: `${item.legal ? 5.6 : 4.7}%`,
                      transform: 'translate(-50%, -50%)',
                      background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.88) 0%, ${cs.hex} 40%, ${cs.darkHex} 92%)`,
                      boxShadow: item.legal
                        ? `0 0 12px ${cs.hex}, 0 4px 8px rgba(0,0,0,0.85), inset 0 -2px 3px rgba(0,0,0,0.45)`
                        : '0 3px 6px rgba(0,0,0,0.8), inset 0 -2px 3px rgba(0,0,0,0.45)',
                    }}
                    aria-label={`${item.color} #${item.id + 1}`}
                    className={`absolute z-10 rounded-full border border-white/85 flex items-center justify-center text-[8px] font-black text-white drop-shadow transition-[top,left,width,height] duration-100 ${
                      item.hopping ? 'nc-parchis-hop z-30' : ''
                    } ${
                      item.legal
                        ? 'ring-2 ring-white cursor-pointer hover:scale-125 z-20'
                        : 'cursor-default'
                    }`}
                  >
                    {item.progress === 71 ? '★' : item.id + 1}
                  </button>
                );
              })}

              {pState.status === 'finished' && winnerSeat && (
                <VictoryCelebrationOverlay
                  lang={lang}
                  title={pickLang(lang, {
                    es: `¡${winnerSeat.name} gana el Parchís!`,
                    ca: `${winnerSeat.name} guanya el Parxís!`,
                    en: `${winnerSeat.name} wins Parchís!`,
                  })}
                  subtitle={pickLang(lang, {
                    es: '4 fichas en Meta',
                    ca: '4 fitxes a Meta',
                    en: 'All 4 tokens reached Goal',
                  })}
                  primaryLabel={pickLang(lang, { es: 'Jugar otra vez', ca: 'Tornar a jugar', en: 'Play Again' })}
                  onPrimaryAction={() => dispatchAction('rematch')}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. UNO OFICIAL (1971 MATTEL · SVG CARDS & INTERACTIVE FAN HAND)
  // ============================================================================
  const uState = activeState as UnoGameState;
  const myHand = mySeatIndex >= 0 ? uState.hands[mySeatIndex] || [] : [];
  const topDiscard = uState.discardPile[uState.discardPile.length - 1];
  const prevDiscard1 = uState.discardPile[uState.discardPile.length - 2];
  const prevDiscard2 = uState.discardPile[uState.discardPile.length - 3];
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

  // Natural deterministic slight rotation for discard cards (-7deg .. +7deg)
  const discardRotDeg = ((uState.discardPile.length * 13) % 15) - 7;

  // Dynamic curved fan layout without horizontal scrollbar
  const handLen = myHand.length;
  const fanMid = (handLen - 1) / 2;
  const maxFanDeg = Math.min(4.2, handLen > 1 ? 30 / (handLen - 1) : 0);
  // Overlap so up to 14+ cards still fit cleanly inside mobile 340px viewport
  const cardOverlapPx =
    handLen <= 5 ? -6 : handLen <= 8 ? -16 : handLen <= 11 ? -24 : -30;

  return (
    <div className={`relative flex-1 flex flex-col ${fullScreenMode ? 'justify-between overflow-hidden p-1.5 sm:p-2 gap-1.5' : 'overflow-y-auto p-3 space-y-2.5 custom-scrollbar'}`}>
      {!hideHeaderChrome && (
        <GameFloatingReactionToast reaction={floatingReaction} className="top-12 right-2" />
      )}
      {!hideHeaderChrome && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              🃏 UNO Oficial · {uState.deck.length} mazo
            </span>
            <span className="text-[10px] font-semibold text-zinc-300 shrink-0">
              {uState.direction === 1 ? '↻ Horario' : '↺ Antihorario'}
            </span>
            {uState.status === 'playing' && (
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 shrink-0 ${
                  remainingSec <= 4 ? 'bg-rose-500/25 text-rose-200' : 'bg-white/[0.08] text-zinc-200'
                }`}
              >
                <Timer className="w-3 h-3" />
                <span>{remainingSec}s</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <GameReactionButton
              lang={lang}
              compact
              onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
            />
            <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
            <button
              type="button"
              onClick={() => dispatchAction('rematch')}
              className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Nueva', ca: 'Nova', en: 'New' })}</span>
            </button>
            <button
              type="button"
              onClick={closeActiveGame}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {!isOffline && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} compact />}

      {/* 4 Seats Status */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        {uState.players.map((pl) => {
          const isTurn = uState.status === 'playing' && uState.turnSeat === pl.seatIndex;
          const cardCount = (uState.hands[pl.seatIndex] || []).length;
          const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
          const voiceLevel = !pl.isBot ? voiceChat?.audioLevels?.[pl.userId] ?? 0 : 0;
          const isSpeaking =
            !pl.isBot &&
            !voiceInfo?.isMuted &&
            (voiceLevel > 0.06 || Boolean(voiceChat?.speakingUserIds.includes(pl.userId)));
          return (
            <div
              key={pl.seatIndex}
              className={`p-1.5 sm:p-2 rounded-xl border min-w-0 transition-all ${
                isSpeaking
                  ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60'
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
                    audioLevel={voiceLevel}
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
                <span>
                  {isTurn && uState.status === 'playing' ? `${remainingSec}s` : `${pl.score}/${UNO_TARGET_SCORE}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matte Slate UNO Felt Tabletop */}
      <div
        className="relative p-3 sm:p-4 rounded-2xl nc-tabletop-slate border border-white/[0.12] flex flex-col items-center justify-center gap-2.5 flex-1 min-h-0 overflow-hidden"
        style={{
          boxShadow: `inset 0 0 38px ${activeCs.hex}22, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {/* Neon Color-Wave Ring Pulse on +2 / +4 / Wild */}
        {unoWaveColor && unoWaveKey > 0 && (
          <div
            key={`wave-${unoWaveKey}`}
            className="pointer-events-none absolute inset-2 rounded-2xl nc-uno-wave z-10"
            style={{
              border: `3px solid ${COLOR_STYLES[unoWaveColor].hex}`,
              boxShadow: `0 0 32px ${COLOR_STYLES[unoWaveColor].hex}, inset 0 0 28px ${COLOR_STYLES[unoWaveColor].hex}88`,
            }}
          />
        )}

        <div className="relative z-10 flex items-center justify-center gap-5 sm:gap-7">
          {/* Draw Deck Stack / Pass Drawn Card */}
          {uState.drawnPlayableCardId && isMyTurn ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                dispatchAction('pass_turn');
              }}
              className="w-[74px] h-[111px] sm:w-[86px] sm:h-[129px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border-2 border-amber-400/75 flex flex-col items-center justify-center gap-1 shadow-2xl cursor-pointer active:scale-95 transition-all"
            >
              <span className="text-xs font-black text-amber-200 uppercase">Pasar</span>
              <span className="text-[10px] text-zinc-200 text-center px-1.5">Guardar</span>
            </button>
          ) : (
            <div className="relative w-[74px] h-[111px] sm:w-[86px] sm:h-[129px]">
              {/* Stack depth edges */}
              <div className="absolute inset-0 rounded-xl bg-zinc-800 border border-white/10 translate-y-1.5 translate-x-1 -rotate-2 shadow-sm pointer-events-none" />
              <div className="absolute inset-0 rounded-xl bg-zinc-700 border border-white/10 translate-y-0.5 -translate-x-0.5 rotate-1 shadow-sm pointer-events-none" />
              <button
                key={`draw-${drawPileShakeKey}`}
                type="button"
                disabled={!isMyTurn || Boolean(uState.pendingWild4Challenge)}
                onClick={() => {
                  triggerHaptic('light');
                  dispatchAction('draw_card');
                }}
                aria-label={pickLang(lang, { es: 'Robar 1 carta', ca: 'Robar 1 carta', en: 'Draw 1 card' })}
                className={`relative w-full h-full rounded-xl shadow-[0_12px_28px_rgba(0,0,0,0.75)] transition-transform ${
                  drawPileShakeKey > 0 ? 'nc-uno-shake' : ''
                } ${
                  isMyTurn && !uState.pendingWild4Challenge
                    ? 'cursor-pointer hover:-translate-y-1.5 active:scale-95 ring-2 ring-[#9146FF]/75'
                    : 'opacity-80 cursor-default'
                }`}
              >
                <img
                  src={UNO_CARD_BACK_SRC}
                  alt="Mazo UNO"
                  className="w-full h-full object-contain rounded-xl pointer-events-none select-none"
                  draggable={false}
                />
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-zinc-950/90 border border-white/20 text-[9px] font-bold text-zinc-100 whitespace-nowrap shadow">
                  {pickLang(lang, { es: `Robar (${uState.deck.length})`, ca: `Robar (${uState.deck.length})`, en: `Draw (${uState.deck.length})` })}
                </span>
              </button>
            </div>
          )}

          {/* Stacked Discard Pile with Arc Flying Animation */}
          <div className="relative w-[78px] h-[117px] sm:w-[90px] sm:h-[135px] flex items-center justify-center">
            {prevDiscard2 && (
              <img
                src={getUnoCardSvgSrc(prevDiscard2.color, prevDiscard2.value)}
                alt=""
                aria-hidden="true"
                style={{ transform: 'rotate(-9deg) translate(-4px, 2px)' }}
                className="absolute inset-0 w-full h-full object-contain opacity-60 pointer-events-none select-none"
                draggable={false}
              />
            )}
            {prevDiscard1 && (
              <img
                src={getUnoCardSvgSrc(prevDiscard1.color, prevDiscard1.value)}
                alt=""
                aria-hidden="true"
                style={{ transform: 'rotate(7deg) translate(3px, -1px)' }}
                className="absolute inset-0 w-full h-full object-contain opacity-85 pointer-events-none select-none"
                draggable={false}
              />
            )}
            {topDiscard && (
              <div
                key={`${topDiscard.id}-${uState.discardPile.length}`}
                style={{ '--uno-rot': `${discardRotDeg}deg` } as React.CSSProperties}
                className="nc-uno-arc relative w-full h-full drop-shadow-[0_14px_26px_rgba(0,0,0,0.82)]"
              >
                <img
                  src={getUnoCardSvgSrc(topDiscard.color, topDiscard.value)}
                  alt={`${topDiscard.color} ${topDiscard.value}`}
                  className="w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              </div>
            )}
            {/* Active Color Indicator Dot */}
            <div
              className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full border border-white/30 bg-zinc-950/90 flex items-center gap-1.5 shadow-md whitespace-nowrap"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: activeCs.hex, boxShadow: `0 0 8px ${activeCs.hex}` }}
              />
              <span className="text-[9px] font-extrabold uppercase text-white">
                {pickLang(lang, { es: activeCs.labelEs, ca: activeCs.labelCa, en: activeCs.labelEn })}
              </span>
            </div>
          </div>
        </div>

        {/* Status Message + Prominent ¡UNO! / Catch UNO actions */}
        <div className="relative z-10 text-center space-y-1 max-w-md pt-1">
          <div className="text-xs font-bold text-white">
            {uState.status === 'finished' && winnerSeat
              ? `🏆 ${winnerSeat.name} (+${uState.roundPointsWon || 0} pts)`
              : uState.drawnPlayableCardId && isMyTurn
              ? pickLang(lang, {
                  es: 'Robaste carta jugable · Tírala o pasa',
                  ca: 'Carta jugable robada · Tira o passa',
                  en: 'Playable card drawn · Play or pass',
                })
              : isMyTurn
              ? pickLang(lang, {
                  es: 'Tu turno · Tira una carta o roba',
                  ca: 'El teu torn · Tira o roba',
                  en: 'Your turn · Play a card or draw',
                })
              : pickLang(lang, {
                  es: `Turno de ${activeSeat?.name || '...'}`,
                  ca: `Torn de ${activeSeat?.name || '...'}`,
                  en: `${activeSeat?.name || '...'}'s turn`,
                })}
          </div>
          {uState.log.length > 0 && (
            <div className="text-[10px] text-zinc-400 truncate max-w-[300px] mx-auto">
              {uState.log[uState.log.length - 1]}
            </div>
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
                  className="min-h-9 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:brightness-110 text-xs font-black text-white flex items-center gap-1.5 shadow-[0_0_20px_rgba(225,29,72,0.7)] ring-2 ring-white/80 cursor-pointer active:scale-95"
                >
                  <Megaphone className="w-4 h-4" />
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
                  className="min-h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-zinc-950 flex items-center gap-1.5 shadow-lg cursor-pointer active:scale-95"
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
                es: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} tiró +4. ¿Aceptas o desafías?`,
                ca: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} ha tirat +4. Acceptes o desafies?`,
                en: `${uState.players[uState.pendingWild4Challenge.offenderSeat]?.name} played Wild +4. Accept or Challenge?`,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => dispatchAction('accept_wild4')}
                className="min-h-10 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white cursor-pointer"
              >
                {pickLang(lang, { es: 'Aceptar (+4)', ca: 'Acceptar (+4)', en: 'Accept (+4)' })}
              </button>
              <button
                type="button"
                onClick={() => dispatchAction('challenge_wild4')}
                className="min-h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-zinc-950 cursor-pointer"
              >
                {pickLang(lang, { es: '¡Desafiar +4!', ca: 'Desafiar +4!', en: 'Challenge +4!' })}
              </button>
            </div>
          </div>
        )}

        {/* 4-Color Radial Picker Overlay for Wild Cards */}
        {pendingWildCardId && (
          <div className="absolute inset-0 z-25 rounded-2xl bg-black/82 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
            <div className="relative w-44 h-44 rounded-full p-1 bg-white/10 shadow-[0_18px_48px_rgba(0,0,0,0.85)]">
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full rounded-full overflow-hidden gap-1.5">
                {(['red', 'blue', 'green', 'yellow'] as PartyColor[]).map((col, qIdx) => {
                  const corners = [
                    'rounded-tl-full',
                    'rounded-tr-full',
                    'rounded-bl-full',
                    'rounded-br-full',
                  ];
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => {
                        const cardId = pendingWildCardId;
                        setPendingWildCardId(null);
                        triggerHaptic('medium');
                        dispatchAction('play_card', { cardId, chosenColor: col });
                      }}
                      aria-label={col}
                      style={{ backgroundColor: COLOR_STYLES[col].hex }}
                      className={`w-full h-full ${corners[qIdx]} hover:brightness-115 active:scale-95 transition-all cursor-pointer border-2 border-white/60 shadow-inner`}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setPendingWildCardId(null)}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-[#11131b] border-2 border-white/75 text-[10px] font-extrabold uppercase text-white flex items-center justify-center shadow-xl cursor-pointer hover:bg-zinc-800"
              >
                {pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Cancel' })}
              </button>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              {pickLang(lang, { es: 'Elige color', ca: 'Tria color', en: 'Pick color' })}
            </span>
          </div>
        )}

        {uState.status === 'finished' && winnerSeat && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={
              winnerSeat.score >= UNO_TARGET_SCORE
                ? `${winnerSeat.name} · ¡Campeón ${UNO_TARGET_SCORE} pts!`
                : pickLang(lang, {
                    es: `${winnerSeat.name} gana la ronda`,
                    ca: `${winnerSeat.name} guanya la ronda`,
                    en: `${winnerSeat.name} wins round`,
                  })
            }
            subtitle={`+${uState.roundPointsWon || 0} pts`}
            primaryLabel={
              winnerSeat.score >= UNO_TARGET_SCORE
                ? pickLang(lang, { es: 'Nueva Partida', ca: 'Nova Partida', en: 'New Match' })
                : pickLang(lang, { es: 'Siguiente Ronda', ca: 'Següent Ronda', en: 'Next Round' })
            }
            onPrimaryAction={() => dispatchAction('rematch')}
          />
        )}
      </div>

      {/* Interactive Curved Fan Player Hand (Zero Horizontal Scroll Cutoff) */}
      {mySeatIndex >= 0 && (
        <div className="shrink-0 pt-1 pb-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 px-1 mb-1.5">
            <span className="font-semibold text-zinc-200 shrink-0">
              {pickLang(lang, {
                es: `Tu mano (${myHand.length})`,
                ca: `La teva mà (${myHand.length})`,
                en: `Your hand (${myHand.length})`,
              })}
            </span>

            {canCallUno ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  dispatchAction('call_uno');
                }}
                className="min-h-8 px-3.5 rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 hover:brightness-110 text-xs font-black text-white flex items-center gap-1.5 shadow-[0_0_22px_rgba(244,63,94,0.85)] ring-2 ring-white/90 animate-pulse cursor-pointer active:scale-95 shrink-0"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>¡UNO!</span>
              </button>
            ) : uState.status === 'playing' && myHand.length <= 2 && uState.unoCalledSeats.includes(mySeatIndex) ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-black text-emerald-200 shrink-0">
                ✓ ¡UNO! cantado
              </span>
            ) : (
              <span className="text-[10px] text-zinc-400 truncate">
                {isMyTurn
                  ? pickLang(lang, { es: 'Toca una carta iluminada', ca: 'Toca una carta', en: 'Tap highlighted card' })
                  : pickLang(lang, { es: 'Esperando turno', ca: 'Esperant torn', en: 'Waiting turn' })}
              </span>
            )}
          </div>

          <div className="relative flex items-end justify-center min-h-[104px] sm:min-h-[120px] px-2 overflow-visible select-none">
            {myHand.map((card, idx) => {
              const playable = isMyTurn && isUnoCardPlayable(uState, card);
              const offset = idx - fanMid;
              const angle = offset * maxFanDeg;
              const arcY = Math.pow(Math.abs(offset), 1.35) * (handLen > 8 ? 1.4 : 2.2);

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
                  style={{
                    marginLeft: idx === 0 ? 0 : `${cardOverlapPx}px`,
                    transform: `translateY(${arcY - (playable ? 10 : 0)}px) rotate(${angle}deg)`,
                    zIndex: playable ? 20 + idx : idx,
                  }}
                  aria-label={`${card.color} ${card.value}`}
                  className={`relative w-[58px] h-[87px] sm:w-[68px] sm:h-[102px] rounded-xl shrink-0 transition-transform duration-150 origin-bottom ${
                    playable
                      ? 'cursor-pointer hover:-translate-y-5 hover:scale-115 hover:z-40 active:scale-95 drop-shadow-[0_10px_22px_rgba(255,255,255,0.36)]'
                      : 'opacity-45 grayscale-[70%] cursor-not-allowed brightness-65'
                  }`}
                >
                  <img
                    src={getUnoCardSvgSrc(card.color, card.value)}
                    alt={`${card.color} ${card.value}`}
                    className={`w-full h-full object-contain rounded-xl pointer-events-none select-none ${
                      playable ? 'ring-2 ring-white/95 shadow-md' : ''
                    }`}
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
