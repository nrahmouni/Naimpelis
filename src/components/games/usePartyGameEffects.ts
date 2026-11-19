import React, { useEffect, useRef, useState } from 'react';
import {
  PARTY_COLORS,
  PARTY_TURN_DECISION_MS,
  chooseBotParchisAction,
  chooseBotUnoMove,
  drawUnoCardsAndAdvance,
  moveParchisPiece,
  playUnoCard,
  resolveUnoWild4Challenge,
  rollParchisDice,
  type ParchisGameState,
  type PartyColor,
  type PartyGameState,
  type UnoGameState,
} from '../../shared/partyGames';
import { playGameSfx } from './GameEffects';
import {
  PARTY_COLOR_STYLES,
  getParchisPieceCoord,
  type BoardBurstEvent,
} from './partyBoardConstants';

interface UsePartyGameEffectsOptions {
  isOffline: boolean;
  localState: PartyGameState | null;
  setLocalState: React.Dispatch<React.SetStateAction<PartyGameState | null>>;
  activeState: PartyGameState | null;
  muted: boolean;
}

export function usePartyGameEffects({
  isOffline,
  localState,
  setLocalState,
  activeState,
  muted,
}: UsePartyGameEffectsOptions) {
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
  }, [isOffline, localState, setLocalState]);

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

  return {
    diceAnimSeq,
    hopProgressMap,
    burstEvents,
    unoWaveColor,
    unoWaveKey,
    drawPileShakeKey,
  };
}
