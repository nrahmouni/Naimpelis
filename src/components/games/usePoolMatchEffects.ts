import { useEffect, useRef } from 'react';
import type React from 'react';
import type {
  Pool8BallState,
  PoolBallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
} from '../../types';
import {
  choosePoolAiShot,
  createPoolSimRuntime,
  getBallGroup,
  isOnEightBall,
  placePoolCueBall,
  type PoolPlayerSeat,
} from '../../shared/pool8Ball';
import { socketService } from '../../services/socket';
import { playGameSfx } from './GameEffects';
import type {
  PendingStrikeShot,
  PocketFlashAnim,
  ShotAnimPayload,
  SinkAnim,
} from './poolCanvasRenderer';

interface UsePoolMatchEffectsArgs {
  isOffline: boolean;
  isOnlinePlaying: boolean;
  isSimulatingUI: boolean;
  isMyTurn: boolean;
  muted: boolean;
  difficulty: PoolDifficulty;
  activeState: Pool8BallState | null;
  activeSeat: PoolPlayerSeat | null;
  localState: Pool8BallState;
  activeStateRef: React.MutableRefObject<Pool8BallState | null>;
  sinkAnimsRef: React.MutableRefObject<SinkAnim[]>;
  pocketFlashesRef: React.MutableRefObject<PocketFlashAnim[]>;
  simAccumulatorRef: React.MutableRefObject<number>;
  targetAimAngleRef: React.MutableRefObject<number>;
  currentAimAngleRef: React.MutableRefObject<number>;
  pendingStrikeRef: React.MutableRefObject<PendingStrikeShot | null>;
  setNowTs: React.Dispatch<React.SetStateAction<number>>;
  setLocalCalledPocket: React.Dispatch<React.SetStateAction<PoolPocketId | null>>;
  setCueGhostPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number; valid: boolean } | null>
  >;
  setIsSimulatingUI: React.Dispatch<React.SetStateAction<boolean>>;
  setAiThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalState: React.Dispatch<React.SetStateAction<Pool8BallState>>;
  setSpinX: React.Dispatch<React.SetStateAction<number>>;
  setSpinY: React.Dispatch<React.SetStateAction<number>>;
  setPullPower: React.Dispatch<React.SetStateAction<number>>;
  fireShot: (shot: PoolShotInput) => void;
}

export function usePoolMatchEffects({
  isOffline,
  isOnlinePlaying,
  isSimulatingUI,
  isMyTurn,
  muted,
  difficulty,
  activeState,
  activeSeat,
  localState,
  activeStateRef,
  sinkAnimsRef,
  pocketFlashesRef,
  simAccumulatorRef,
  targetAimAngleRef,
  currentAimAngleRef,
  pendingStrikeRef,
  setNowTs,
  setLocalCalledPocket,
  setCueGhostPos,
  setIsSimulatingUI,
  setAiThinking,
  setLocalState,
  setSpinX,
  setSpinY,
  setPullPower,
  fireShot,
}: UsePoolMatchEffectsArgs) {
  // Countdown tick only for active online shot clock (zero idle re-renders offline)
  useEffect(() => {
    if (!isOnlinePlaying) return;
    const iv = window.setInterval(() => setNowTs(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [isOnlinePlaying, setNowTs]);

  // Reset local called pocket when turn changes
  useEffect(() => {
    setLocalCalledPocket(null);
    setCueGhostPos(null);
  }, [activeState?.turnNumber, activeState?.id, setLocalCalledPocket, setCueGhostPos]);

  // Listen for online POOL_SHOT_BROADCAST from server so both clients animate deterministically
  useEffect(() => {
    if (isOffline) return;
    const unsub = socketService.subscribe((evt) => {
      if (evt.type !== 'POOL_SHOT_BROADCAST') return;
      const payload = evt.payload as unknown as ShotAnimPayload & {
        preShotBalls?: PoolBallState[];
      };
      if (!payload?.shot || !payload?.authoritativeState) return;

      const preShotState = activeStateRef.current;
      const baseBalls = payload.preShotBalls || preShotState?.balls;
      if (!baseBalls) return;

      const startBalls = baseBalls.map((b) =>
        b.id === 0
          ? {
              ...b,
              x: payload.shot.cueStartX,
              y: payload.shot.cueStartY,
              pocketed: false,
              pocketId: null,
            }
          : { ...b }
      );

      sinkAnimsRef.current = [];
      pocketFlashesRef.current = [];
      simAccumulatorRef.current = 0;
      const runtime = createPoolSimRuntime(startBalls, payload.shot);
      const startPullDist = 18 + Math.max(0.1, payload.shot.power) * 86;
      targetAimAngleRef.current = payload.shot.angle;
      currentAimAngleRef.current = payload.shot.angle;
      pendingStrikeRef.current = {
        runtime,
        prevBalls: startBalls.map((b) => ({ ...b })),
        meta: {
          shot: payload.shot,
          baseState: preShotState
            ? { ...preShotState, balls: startBalls }
            : { ...payload.authoritativeState, balls: startBalls },
          authoritativeState: payload.authoritativeState,
          expectedChecksum: payload.checksum,
        },
        startedAt: performance.now(),
        durationMs: 80,
        startPullDist,
        angle: payload.shot.angle,
        power: payload.shot.power,
        cueX: payload.shot.cueStartX,
        cueY: payload.shot.cueStartY,
      };
      setIsSimulatingUI(true);
    });
    return unsub;
  }, [
    isOffline,
    activeStateRef,
    sinkAnimsRef,
    pocketFlashesRef,
    simAccumulatorRef,
    targetAimAngleRef,
    currentAimAngleRef,
    pendingStrikeRef,
    setIsSimulatingUI,
  ]);

  // Smart default aim toward closest legal ball whenever turn arrives
  useEffect(() => {
    if (!activeState || activeState.status !== 'playing' || !isMyTurn) return;
    const cue = activeState.balls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;
    const grp = activeSeat?.group ?? null;
    const on8 = isOnEightBall(activeState.balls, grp);
    const targets = activeState.balls.filter((b) => {
      if (b.pocketed || b.id === 0) return false;
      if (activeState.isBreakShot || grp === null) return b.id !== 8;
      if (on8) return b.id === 8;
      return getBallGroup(b.id) === grp;
    });
    if (targets.length > 0) {
      let best = targets[0];
      let bestD = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.x - cue.x, t.y - cue.y);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      const nextA = activeState.isBreakShot ? 0 : Math.atan2(best.y - cue.y, best.x - cue.x);
      targetAimAngleRef.current = nextA;
      currentAimAngleRef.current = nextA;
    }
  }, [activeState?.turnNumber, activeState?.id, isMyTurn]);

  // Offline AI Bot turn scheduler
  useEffect(() => {
    if (!isOffline || isSimulatingUI) return;
    if (localState.status !== 'playing' || localState.phase === 'GAME_OVER') return;
    const seat = localState.players[localState.turnSeat];
    if (!seat?.isBot) return;

    setAiThinking(true);
    const thinkMs = difficulty === 'hard' ? 1050 : difficulty === 'medium' ? 880 : 720;
    let aimTimer = 0;
    let shootTimer = 0;

    aimTimer = window.setTimeout(() => {
      const planned = choosePoolAiShot(localState, difficulty);
      if (localState.phase === 'BALL_IN_HAND') {
        const placed = placePoolCueBall(localState, seat.userId, planned.cueX, planned.cueY);
        if (placed.ok) {
          setLocalState(placed.state);
        }
      }
      if (planned.calledPocketId && isOnEightBall(localState.balls, seat.group)) {
        setLocalCalledPocket(planned.calledPocketId);
      }

      targetAimAngleRef.current = planned.angle;
      setSpinX(planned.spinX);
      setSpinY(planned.spinY);
      setPullPower(planned.power * 0.72);

      shootTimer = window.setTimeout(() => {
        setAiThinking(false);
        fireShot(planned);
      }, 460);
    }, thinkMs);

    return () => {
      window.clearTimeout(aimTimer);
      window.clearTimeout(shootTimer);
      setAiThinking(false);
    };
  }, [
    isOffline,
    isSimulatingUI,
    localState,
    difficulty,
    fireShot,
    setAiThinking,
    setLocalState,
    setLocalCalledPocket,
    targetAimAngleRef,
    setSpinX,
    setSpinY,
    setPullPower,
  ]);

  const prevWinnerRef = useRef<0 | 1 | null>(null);
  useEffect(() => {
    const w = activeState?.winnerSeat ?? null;
    if (w !== null && prevWinnerRef.current === null) {
      playGameSfx('victory', muted);
    }
    prevWinnerRef.current = w;
  }, [activeState?.winnerSeat, muted]);
}
