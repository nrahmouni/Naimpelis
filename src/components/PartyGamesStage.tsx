import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, X, Bot, ArrowLeft, Play } from 'lucide-react';
import type { AppLanguage, Participant } from '../types';
import {
  PARTY_COLORS,
  PARTY_TURN_DECISION_MS,
  PARCHIS_SAFE_SQUARES,
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
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './games/GameVoiceBar';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  playGameSfx,
  useGameFloatingReaction,
  useGameSoundMute,
} from './games/GameEffects';
import {
  PARTY_COLOR_STYLES,
  getParchisPieceCoord,
  type BoardBurstEvent,
  type PartyOnlineAction,
} from './games/partyBoardConstants';
import { ParchisBoardView } from './games/ParchisBoardView';
import { UnoTableView } from './games/UnoTableView';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export type { PartyOnlineAction };

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
  hideHeaderChrome?: boolean;
  hideVoiceBar?: boolean;
  initialOfflineGameType?: PartyGameType | null;
  mutedOverride?: boolean;
  onToggleMuteOverride?: () => void;
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

  const [diceAnimSeq, setDiceAnimSeq] = useState(0);
  const [hopProgressMap, setHopProgressMap] = useState<Record<string, number>>({});
  const [burstEvents, setBurstEvents] = useState<BoardBurstEvent[]>([]);
  const prevParchisProgressRef = useRef<Record<string, number>>({});
  const prevDiceValueRef = useRef<number | null>(null);
  const prevTurnLogLenRef = useRef<number>(0);

  const [unoWaveColor, setUnoWaveColor] = useState<PartyColor | null>(null);
  const [unoWaveKey, setUnoWaveKey] = useState(0);
  const [drawPileShakeKey, setDrawPileShakeKey] = useState(0);
  const prevUnoDiscardLenRef = useRef<number>(0);
  const prevUnoStatusRef = useRef<string | null>(null);

  const activeState = isOffline ? localState : partyGameState;

  useEffect(() => {
    onActiveStateChange?.(Boolean(activeState));
  }, [activeState, onActiveStateChange]);

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

  // Parchís transition detector
  useEffect(() => {
    if (!activeState || activeState.gameType !== 'parchis') {
      prevParchisProgressRef.current = {};
      prevDiceValueRef.current = null;
      return;
    }
    const pState = activeState as ParchisGameState;
    const logLen = pState.log.length;

    if (
      pState.dice !== null &&
      (pState.dice !== prevDiceValueRef.current || logLen > prevTurnLogLenRef.current) &&
      pState.phase === 'move'
    ) {
      setDiceAnimSeq((s) => s + 1);
      playGameSfx('dice_roll', muted);
    }
    prevDiceValueRef.current = pState.dice;
    prevTurnLogLenRef.current = logLen;

    if (pState.status === 'finished' && prevUnoStatusRef.current !== 'finished') {
      playGameSfx('victory', muted);
    }
    prevUnoStatusRef.current = pState.status;

    const prevMap = prevParchisProgressRef.current;
    const nextMap: Record<string, number> = {};
    const stepTimers: number[] = [];

    for (const c of PARTY_COLORS) {
      for (const piece of pState.pieces[c]) {
        const key = `${c}-${piece.id}`;
        nextMap[key] = piece.progress;
        const prevProg = prevMap[key];

        if (typeof prevProg === 'number' && prevProg !== piece.progress) {
          if (prevProg >= 0 && piece.progress === -1) {
            const [capRow, capCol] = getParchisPieceCoord(c, piece.id, prevProg);
            const eid = Date.now() + Math.random();
            setBurstEvents((prev) => [
              ...prev.slice(-4),
              { id: eid, row: capRow, col: capCol, kind: 'capture', colorHex: PARTY_COLOR_STYLES[c].hex },
            ]);
            playGameSfx('parchis_capture', muted);
            const t = window.setTimeout(() => {
              setBurstEvents((prev) => prev.filter((ev) => ev.id !== eid));
            }, 720);
            stepTimers.push(t);
          } else if (piece.progress > prevProg && prevProg >= 0) {
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

  // UNO transition detector
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
            const cs = PARTY_COLOR_STYLES[pl.color];
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

  if (activeState.gameType === 'parchis') {
    return (
      <ParchisBoardView
        lang={lang}
        currentUser={currentUser}
        pState={activeState as ParchisGameState}
        activeSeat={activeSeat}
        winnerSeat={winnerSeat}
        isMyTurn={isMyTurn}
        remainingSec={remainingSec}
        isOffline={isOffline}
        fullScreenMode={fullScreenMode}
        hideHeaderChrome={hideHeaderChrome}
        hideVoiceBar={hideVoiceBar}
        muted={muted}
        toggleMute={toggleMute}
        voiceChat={voiceChat}
        voicePeerMap={voicePeerMap}
        diceAnimSeq={diceAnimSeq}
        hopProgressMap={hopProgressMap}
        burstEvents={burstEvents}
        hoveredPieceId={hoveredPieceId}
        setHoveredPieceId={setHoveredPieceId}
        parchisMovePreviews={parchisMovePreviews}
        sendReaction={sendReaction}
        dispatchAction={dispatchAction}
        closeActiveGame={closeActiveGame}
      />
    );
  }

  return (
    <UnoTableView
      lang={lang}
      currentUser={currentUser}
      uState={activeState as UnoGameState}
      mySeatIndex={mySeatIndex}
      activeSeat={activeSeat}
      winnerSeat={winnerSeat}
      isMyTurn={isMyTurn}
      remainingSec={remainingSec}
      isOffline={isOffline}
      fullScreenMode={fullScreenMode}
      hideHeaderChrome={hideHeaderChrome}
      hideVoiceBar={hideVoiceBar}
      muted={muted}
      toggleMute={toggleMute}
      voiceChat={voiceChat}
      voicePeerMap={voicePeerMap}
      unoWaveColor={unoWaveColor}
      unoWaveKey={unoWaveKey}
      drawPileShakeKey={drawPileShakeKey}
      pendingWildCardId={pendingWildCardId}
      setPendingWildCardId={setPendingWildCardId}
      floatingReaction={floatingReaction}
      sendReaction={sendReaction}
      dispatchAction={dispatchAction}
      closeActiveGame={closeActiveGame}
    />
  );
};

