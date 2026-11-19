import { useCallback, useRef } from 'react';
import type React from 'react';
import type {
  AppLanguage,
  Pool8BallState,
  PoolBallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from '../../types';
import {
  POOL_MIN_SHOT_POWER,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  createInitialPoolState,
  findNearestValidCueBallSpot,
  isValidCueBallPlacement,
  placePoolCueBall,
} from '../../shared/pool8Ball';
import { playGameSfx } from './GameEffects';
import { unlockPoolAudio } from './poolAudio';
import {
  RAIL_PAD,
  type PendingStrikeShot,
  type PocketFlashAnim,
  type SinkAnim,
} from './poolCanvasRenderer';
import type { PoolCanvasTransform, PoolSimMeta } from './usePoolPhysicsLoop';
import { pickLang } from '../../utils/i18n';

interface UsePoolInputHandlersArgs {
  lang: AppLanguage;
  currentUser: { id: string; name: string; avatar: string; color?: string };
  activeState: Pool8BallState | null;
  difficulty: PoolDifficulty;
  isOffline: boolean;
  isMyTurn: boolean;
  isSimulatingUI: boolean;
  amIOnEightBall: boolean;
  muted: boolean;
  pullPower: number;
  isPullingPower: boolean;
  effectiveCalledPocket: PoolPocketId | null;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  spinPadRef: React.MutableRefObject<HTMLDivElement | null>;
  powerSliderRef: React.MutableRefObject<HTMLDivElement | null>;
  powerFillRef: React.MutableRefObject<HTMLDivElement | null>;
  powerHandleRef: React.MutableRefObject<HTMLDivElement | null>;
  powerPctRef: React.MutableRefObject<HTMLSpanElement | null>;
  transformRef: React.MutableRefObject<PoolCanvasTransform>;
  simRuntimeRef: React.MutableRefObject<PoolSimRuntime | null>;
  prevSimBallsRef: React.MutableRefObject<PoolBallState[] | null>;
  simMetaRef: React.MutableRefObject<PoolSimMeta | null>;
  pendingStrikeRef: React.MutableRefObject<PendingStrikeShot | null>;
  cueFollowThroughRef: React.MutableRefObject<{
    active: boolean;
    startedAt: number;
    angle: number;
    cueX: number;
    cueY: number;
  }>;
  sinkAnimsRef: React.MutableRefObject<SinkAnim[]>;
  pocketFlashesRef: React.MutableRefObject<PocketFlashAnim[]>;
  targetAimAngleRef: React.MutableRefObject<number>;
  currentAimAngleRef: React.MutableRefObject<number>;
  isDraggingAimRef: React.MutableRefObject<boolean>;
  pullPowerRef: React.MutableRefObject<number>;
  spinRef: React.MutableRefObject<{ x: number; y: number }>;
  cueGhostRef: React.MutableRefObject<{ x: number; y: number; valid: boolean } | null>;
  setDifficulty: React.Dispatch<React.SetStateAction<PoolDifficulty>>;
  setLocalState: React.Dispatch<React.SetStateAction<Pool8BallState>>;
  setLocalCalledPocket: React.Dispatch<React.SetStateAction<PoolPocketId | null>>;
  setCueGhostPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number; valid: boolean } | null>
  >;
  setPullPower: React.Dispatch<React.SetStateAction<number>>;
  setIsPullingPower: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSimulatingUI: React.Dispatch<React.SetStateAction<boolean>>;
  setShotErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;
  setSpinX: React.Dispatch<React.SetStateAction<number>>;
  setSpinY: React.Dispatch<React.SetStateAction<number>>;
  fireShot: (shot: PoolShotInput) => void;
  onCallPocketOnline?: (pocketId: PoolPocketId) => void;
  onPlaceCueOnline?: (x: number, y: number) => void;
  onRematchOnline?: () => void;
}

export function usePoolInputHandlers({
  lang,
  currentUser,
  activeState,
  difficulty,
  isOffline,
  isMyTurn,
  isSimulatingUI,
  amIOnEightBall,
  muted,
  isPullingPower,
  effectiveCalledPocket,
  canvasRef,
  spinPadRef,
  powerSliderRef,
  powerFillRef,
  powerHandleRef,
  powerPctRef,
  transformRef,
  simRuntimeRef,
  prevSimBallsRef,
  simMetaRef,
  pendingStrikeRef,
  cueFollowThroughRef,
  sinkAnimsRef,
  pocketFlashesRef,
  targetAimAngleRef,
  currentAimAngleRef,
  isDraggingAimRef,
  pullPowerRef,
  spinRef,
  cueGhostRef,
  setDifficulty,
  setLocalState,
  setLocalCalledPocket,
  setCueGhostPos,
  setPullPower,
  setIsPullingPower,
  setIsSimulatingUI,
  setShotErrorMsg,
  setSpinX,
  setSpinY,
  fireShot,
  onCallPocketOnline,
  onPlaceCueOnline,
  onRematchOnline,
}: UsePoolInputHandlersArgs) {
  const tableDragModeRef = useRef<'none' | 'aim' | 'place_cue'>('none');
  const spinDragActiveRef = useRef(false);

  const screenToTable = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: POOL_TABLE_W / 2, y: POOL_TABLE_H / 2 };
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const tr = transformRef.current;
      const wx = (sx - tr.offsetX) / tr.scale;
      const wy = (sy - tr.offsetY) / tr.scale;
      if (!tr.portrait) {
        return { x: wx - RAIL_PAD, y: wy - RAIL_PAD };
      }
      return { x: POOL_TABLE_W - (wy - RAIL_PAD), y: wx - RAIL_PAD };
    },
    [canvasRef, transformRef]
  );

  const handleTablePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    unlockPoolAudio();
    const state = activeState;
    if (!state || !isMyTurn || isSimulatingUI) return;
    const pt = screenToTable(e.clientX, e.clientY);

    if (amIOnEightBall) {
      for (const p of POOL_POCKETS) {
        if (Math.hypot(pt.x - p.x, pt.y - p.y) <= p.captureR + 18) {
          setLocalCalledPocket(p.id);
          if (!isOffline) onCallPocketOnline?.(p.id);
          playGameSfx('board_move', muted);
          return;
        }
      }
    }

    const cue = state.balls.find((b) => b.id === 0);
    if (!cue) return;

    const distCue = Math.hypot(pt.x - cue.x, pt.y - cue.y);
    const canPlaceCue = state.phase === 'BALL_IN_HAND' || (state.isBreakShot && distCue <= 34);
    if (state.phase === 'BALL_IN_HAND' || canPlaceCue) {
      if (state.phase === 'BALL_IN_HAND' && distCue <= 44) {
        tableDragModeRef.current = 'place_cue';
        e.currentTarget.setPointerCapture(e.pointerId);
        const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
        const valid = isValidCueBallPlacement(state.balls, pt.x, pt.y, behindHead);
        setCueGhostPos({ x: pt.x, y: pt.y, valid });
        return;
      }
      if (state.phase === 'BALL_IN_HAND' && distCue > 44) {
        const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
        if (isValidCueBallPlacement(state.balls, pt.x, pt.y, behindHead)) {
          if (isOffline) {
            const res = placePoolCueBall(state, currentUser.id, pt.x, pt.y);
            if (res.ok) setLocalState(res.state);
          } else {
            onPlaceCueOnline?.(pt.x, pt.y);
          }
          playGameSfx('board_move', muted);
          return;
        }
      }
    }

    tableDragModeRef.current = 'aim';
    isDraggingAimRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const nextAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    targetAimAngleRef.current = nextAngle;
    currentAimAngleRef.current = nextAngle;
  };

  const handleTablePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = tableDragModeRef.current;
    const state = activeState;
    if (mode === 'none' || !state || !isMyTurn) return;
    const pt = screenToTable(e.clientX, e.clientY);

    if (mode === 'place_cue') {
      const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
      const valid = isValidCueBallPlacement(state.balls, pt.x, pt.y, behindHead);
      setCueGhostPos({ x: pt.x, y: pt.y, valid });
      return;
    }

    if (mode === 'aim') {
      const cue = state.balls.find((b) => b.id === 0);
      if (!cue) return;
      const nextAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
      targetAimAngleRef.current = nextAngle;
      currentAimAngleRef.current = nextAngle;
    }
  };

  const handleTablePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = tableDragModeRef.current;
    tableDragModeRef.current = 'none';
    isDraggingAimRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (mode === 'place_cue' && activeState && cueGhostRef.current) {
      const behindHead = activeState.isBreakShot && activeState.breakOnlyBehindHeadString;
      const spot = cueGhostRef.current.valid
        ? { x: cueGhostRef.current.x, y: cueGhostRef.current.y }
        : findNearestValidCueBallSpot(
            activeState.balls,
            cueGhostRef.current.x,
            cueGhostRef.current.y,
            behindHead
          );
      setCueGhostPos(null);
      if (isOffline) {
        const res = placePoolCueBall(activeState, currentUser.id, spot.x, spot.y);
        if (res.ok) setLocalState(res.state);
      } else {
        onPlaceCueOnline?.(spot.x, spot.y);
      }
      playGameSfx('board_move', muted);
    }
  };

  const syncPowerBarDom = (value: number) => {
    pullPowerRef.current = value;
    if (powerFillRef.current) {
      powerFillRef.current.style.width = `${value * 100}%`;
      powerFillRef.current.style.background =
        value < POOL_MIN_SHOT_POWER
          ? 'rgba(244,63,94,0.45)'
          : 'linear-gradient(90deg, #10B981 0%, #FACC15 65%, #E11D48 100%)';
    }
    if (powerHandleRef.current) {
      powerHandleRef.current.style.left = `${Math.max(4, Math.min(96, value * 100))}%`;
    }
    if (powerPctRef.current) {
      powerPctRef.current.textContent = `${Math.round(value * 100)}%`;
    }
  };

  const updatePowerFromPointer = (clientX: number) => {
    const el = powerSliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const prev = pullPowerRef.current;
    syncPowerBarDom(raw);
    if ((prev < POOL_MIN_SHOT_POWER) !== (raw < POOL_MIN_SHOT_POWER)) {
      setPullPower(raw);
    }
  };

  const handlePowerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unlockPoolAudio();
    if (!isMyTurn || isSimulatingUI) return;
    if (amIOnEightBall && !effectiveCalledPocket) {
      setShotErrorMsg(
        pickLang(lang, {
          es: 'Toca primero una tronera en la mesa para cantar la Bola 8',
          ca: 'Toca primer una tronera per cantar la Bola 8',
          en: 'Tap a pocket on the table to call the 8-ball first',
        })
      );
      window.setTimeout(() => setShotErrorMsg(null), 2600);
      playGameSfx('error', muted);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPullingPower(true);
    updatePowerFromPointer(e.clientX);
  };

  const handlePowerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPullingPower) return;
    updatePowerFromPointer(e.clientX);
  };

  const handlePowerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPullingPower) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsPullingPower(false);
    const power = pullPowerRef.current;
    if (power < POOL_MIN_SHOT_POWER) {
      syncPowerBarDom(0);
      setPullPower(0);
      return;
    }
    syncPowerBarDom(0);
    fireShot({
      angle: currentAimAngleRef.current,
      power,
      spinX: spinRef.current.x,
      spinY: spinRef.current.y,
      calledPocketId: effectiveCalledPocket,
    });
  };

  const updateSpinFromPointer = (clientX: number, clientY: number) => {
    const el = spinPadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(1, rect.width * 0.42);
    let nx = (clientX - cx) / maxR;
    let ny = -(clientY - cy) / maxR;
    const mag = Math.hypot(nx, ny);
    if (mag > 1) {
      nx /= mag;
      ny /= mag;
    }
    setSpinX(Number(nx.toFixed(2)));
    setSpinY(Number(ny.toFixed(2)));
  };

  const clearSimulationRefs = () => {
    simRuntimeRef.current = null;
    prevSimBallsRef.current = null;
    simMetaRef.current = null;
    pendingStrikeRef.current = null;
    cueFollowThroughRef.current.active = false;
    sinkAnimsRef.current = [];
    pocketFlashesRef.current = [];
    syncPowerBarDom(0);
    setPullPower(0);
    setIsSimulatingUI(false);
  };

  const startOfflineWithDifficulty = (nextDiff: PoolDifficulty) => {
    setDifficulty(nextDiff);
    clearSimulationRefs();
    setLocalState(
      createInitialPoolState(
        [
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            color: currentUser.color || '#9146FF',
          },
        ],
        { offlineVsAi: true, difficulty: nextDiff }
      )
    );
  };

  const handleRematch = () => {
    clearSimulationRefs();
    if (isOffline) {
      startOfflineWithDifficulty(difficulty);
    } else {
      onRematchOnline?.();
    }
  };

  return {
    spinDragActiveRef,
    handleTablePointerDown,
    handleTablePointerMove,
    handleTablePointerUp,
    syncPowerBarDom,
    handlePowerPointerDown,
    handlePowerPointerMove,
    handlePowerPointerUp,
    updateSpinFromPointer,
    startOfflineWithDifficulty,
    handleRematch,
  };
}
