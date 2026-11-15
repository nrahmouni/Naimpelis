import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Crosshair,
  Flag,
  RotateCcw,
  Target,
  Timer,
  Users,
} from 'lucide-react';
import type {
  AppLanguage,
  Participant,
  Pool8BallState,
  PoolBallGroup,
  PoolBallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from '../types';
import {
  POOL_BALL_R,
  POOL_FIXED_DT,
  POOL_FOOT_SPOT_Y,
  POOL_HEAD_STRING_X,
  POOL_MAX_FRAME_DT,
  POOL_MIN_SHOT_POWER,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  applyPoolShot,
  callPoolPocket,
  choosePoolAiShot,
  computeAimPrediction,
  computePoolChecksum,
  createInitialPoolState,
  createPoolSimRuntime,
  findNearestValidCueBallSpot,
  forfeitPoolMatch,
  getBallGroup,
  isOnEightBall,
  isPoolRuntimeMoving,
  isValidCueBallPlacement,
  placePoolCueBall,
  resolvePoolShotOutcome,
  stepPoolPhysicsSubstep,
} from '../shared/pool8Ball';
import { socketService } from '../services/socket';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VictoryCelebrationOverlay, playGameSfx, useGameSoundMute } from './games/GameEffects';
import {
  playPoolClack,
  playPoolCueStrike,
  playPoolCushion,
  playPoolFoul,
  playPoolPocketDrop,
  unlockPoolAudio,
} from './games/poolAudio';
import { pickLang } from '../utils/i18n';

export interface PoolStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  poolState: Pool8BallState | null;
  isOffline?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: (difficulty?: PoolDifficulty) => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 'spectate') => void;
  onPlaceCueOnline?: (x: number, y: number) => void;
  onCallPocketOnline?: (pocketId: PoolPocketId) => void;
  onTakeShotOnline?: (shot: PoolShotInput) => void;
  onForfeitOnline?: () => void;
  onRematchOnline?: () => void;
  onSyncChecksumOnline?: (turnNumber: number, checksum: number) => void;
}

interface SinkAnim {
  ballId: number;
  startX: number;
  startY: number;
  pocketX: number;
  pocketY: number;
  startedAt: number;
}

interface ShotAnimPayload {
  shot: PoolShotInput & {
    shooterUserId: string;
    turnNumber: number;
    cueStartX: number;
    cueStartY: number;
  };
  authoritativeState: Pool8BallState;
  checksum: number;
}

const BALL_COLORS: Record<number, { main: string; stripe: boolean }> = {
  0: { main: '#FAF8F2', stripe: false },
  1: { main: '#FACC15', stripe: false },
  2: { main: '#2563EB', stripe: false },
  3: { main: '#DC2626', stripe: false },
  4: { main: '#7C3AED', stripe: false },
  5: { main: '#F97316', stripe: false },
  6: { main: '#16A34A', stripe: false },
  7: { main: '#881337', stripe: false },
  8: { main: '#18181B', stripe: false },
  9: { main: '#FACC15', stripe: true },
  10: { main: '#2563EB', stripe: true },
  11: { main: '#DC2626', stripe: true },
  12: { main: '#7C3AED', stripe: true },
  13: { main: '#F97316', stripe: true },
  14: { main: '#16A34A', stripe: true },
  15: { main: '#881337', stripe: true },
};

const RAIL_PAD = 44; // Wooden/metal bezel thickness in canonical space

function vibrateShot(power: number): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const ms = Math.round(12 + Math.max(0, Math.min(1, power)) * 42);
      navigator.vibrate(ms);
    }
  } catch {
    // Fail silently on unsupported devices
  }
}

function createFeltNoisePattern(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const off = document.createElement('canvas');
  off.width = 96;
  off.height = 96;
  const ctx = off.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(96, 96);
  let seed = 1337;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = (seed >>> 24) & 0xff;
    const delta = ((v & 15) - 7) * 1.4;
    img.data[i] = Math.max(0, Math.min(255, 11 + delta));
    img.data[i + 1] = Math.max(0, Math.min(255, 68 + delta));
    img.data[i + 2] = Math.max(0, Math.min(255, 51 + delta));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return off;
}

function normalizeAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const Pool8BallStage: React.FC<PoolStageProps> = ({
  lang,
  currentUser,
  poolState,
  isOffline = false,
  mutedOverride,
  onStartOnline,
  onJoinSeatOnline,
  onPlaceCueOnline,
  onCallPocketOnline,
  onTakeShotOnline,
  onForfeitOnline,
  onRematchOnline,
  onSyncChecksumOnline,
}) => {
  const [difficulty, setDifficulty] = useState<PoolDifficulty>('medium');
  const [localState, setLocalState] = useState<Pool8BallState>(() =>
    createInitialPoolState(
      [
        {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          color: currentUser.color,
        },
      ],
      { offlineVsAi: true, difficulty: 'medium' }
    )
  );
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;

  // Aim / Power / Spin / Cue placement local UI controls
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [pullPower, setPullPower] = useState<number>(0);
  const [isPullingPower, setIsPullingPower] = useState<boolean>(false);
  const [spinX, setSpinX] = useState<number>(0);
  const [spinY, setSpinY] = useState<number>(0);
  const [localCalledPocket, setLocalCalledPocket] = useState<PoolPocketId | null>(null);
  const [isSimulatingUI, setIsSimulatingUI] = useState<boolean>(false);
  const [aiThinking, setAiThinking] = useState<boolean>(false);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [cueGhostPos, setCueGhostPos] = useState<{ x: number; y: number; valid: boolean } | null>(
    null
  );
  const [shotErrorMsg, setShotErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spinPadRef = useRef<HTMLDivElement | null>(null);
  const powerSliderRef = useRef<HTMLDivElement | null>(null);

  // Refs used inside 60fps rAF loop
  const simRuntimeRef = useRef<PoolSimRuntime | null>(null);
  const prevSimBallsRef = useRef<PoolBallState[] | null>(null);
  const simMetaRef = useRef<{
    shot: PoolShotInput;
    baseState: Pool8BallState;
    authoritativeState?: Pool8BallState;
    expectedChecksum?: number;
  } | null>(null);
  const simAccumulatorRef = useRef<number>(0);
  const sinkAnimsRef = useRef<SinkAnim[]>([]);
  const cueLungeRef = useRef<{ active: boolean; startedAt: number; angle: number; power: number }>({
    active: false,
    startedAt: 0,
    angle: 0,
    power: 0,
  });

  const targetAimAngleRef = useRef<number>(0);
  const currentAimAngleRef = useRef<number>(0);
  const pullPowerRef = useRef<number>(0);
  const spinRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPortraitRef = useRef<boolean>(false);
  const transformRef = useRef<{
    cssW: number;
    cssH: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    portrait: boolean;
  }>({ cssW: 600, cssH: 320, scale: 0.5, offsetX: 0, offsetY: 0, portrait: false });

  const feltPatternRef = useRef<CanvasPattern | null>(null);
  const rawActiveState = isOffline ? localState : poolState;
  const activeState =
    isSimulatingUI && simMetaRef.current ? simMetaRef.current.baseState : rawActiveState;
  const activeStateRef = useRef<Pool8BallState | null>(activeState);
  const mutedRef = useRef<boolean>(muted);
  const cueGhostRef = useRef<{ x: number; y: number; valid: boolean } | null>(cueGhostPos);

  activeStateRef.current = activeState;
  mutedRef.current = muted;
  pullPowerRef.current = pullPower;
  spinRef.current = { x: spinX, y: spinY };
  cueGhostRef.current = cueGhostPos;

  // Countdown tick for online shot clock
  useEffect(() => {
    const iv = window.setInterval(() => setNowTs(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, []);

  // Reset local called pocket when turn changes
  useEffect(() => {
    setLocalCalledPocket(null);
    setCueGhostPos(null);
  }, [activeState?.turnNumber, activeState?.id]);

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

      // Ensure cue ball starts at exact broadcast start coordinates
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
      simAccumulatorRef.current = 0;
      const runtime = createPoolSimRuntime(startBalls, payload.shot);
      simRuntimeRef.current = runtime;
      prevSimBallsRef.current = startBalls.map((b) => ({ ...b }));
      simMetaRef.current = {
        shot: payload.shot,
        baseState: preShotState
          ? { ...preShotState, balls: startBalls }
          : { ...payload.authoritativeState, balls: startBalls },
        authoritativeState: payload.authoritativeState,
        expectedChecksum: payload.checksum,
      };

      playPoolCueStrike(payload.shot.power, mutedRef.current);
      setIsSimulatingUI(true);
    });
    return unsub;
  }, [isOffline]);

  const mySeatIndex = useMemo<0 | 1 | null>(() => {
    if (!activeState) return null;
    if (activeState.players[0]?.userId === currentUser.id) return 0;
    if (activeState.players[1]?.userId === currentUser.id) return 1;
    return null;
  }, [activeState, currentUser.id]);

  const activeSeat = activeState ? activeState.players[activeState.turnSeat] : null;
  const isMyTurn = Boolean(
    activeState &&
      activeState.status === 'playing' &&
      activeState.phase !== 'GAME_OVER' &&
      !isSimulatingUI &&
      (isOffline ? activeState.turnSeat === 0 : activeSeat?.userId === currentUser.id)
  );

  const myPlayer = mySeatIndex !== null && activeState ? activeState.players[mySeatIndex] : null;
  const amIOnEightBall = Boolean(
    activeState && myPlayer && isOnEightBall(activeState.balls, myPlayer.group)
  );
  const effectiveCalledPocket = activeState?.calledPocketId || localCalledPocket;

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
      setAimAngle(nextA);
    }
  }, [activeState?.turnNumber, activeState?.id, isMyTurn]);

  // Execute a shot locally (offline) or dispatch to server (online)
  const fireShot = useCallback(
    (shot: PoolShotInput) => {
      const state = activeStateRef.current;
      if (!state || state.status !== 'playing' || isSimulatingUI) return;
      if (shot.power < POOL_MIN_SHOT_POWER) {
        setPullPower(0);
        return;
      }

      unlockPoolAudio();
      vibrateShot(shot.power);

      const finalCall = shot.calledPocketId ?? state.calledPocketId ?? localCalledPocket ?? null;
      const cue = state.balls.find((b) => b.id === 0);
      const shotWithCall: PoolShotInput = {
        ...shot,
        calledPocketId: finalCall,
        cueX: shot.cueX ?? cueGhostRef.current?.x ?? cue?.x,
        cueY: shot.cueY ?? cueGhostRef.current?.y ?? cue?.y,
      };

      // Quick cue strike lunge animation + sound
      cueLungeRef.current = {
        active: true,
        startedAt: performance.now(),
        angle: shot.angle,
        power: shot.power,
      };

      if (!isOffline) {
        setPullPower(0);
        setIsPullingPower(false);
        onTakeShotOnline?.(shotWithCall);
        return;
      }

      // Offline simulation setup (runs real-time 60fps in rAF loop)
      let startState = state;
      if (
        typeof shotWithCall.cueX === 'number' &&
        typeof shotWithCall.cueY === 'number' &&
        (state.phase === 'BALL_IN_HAND' || state.isBreakShot)
      ) {
        const behindHead = state.isBreakShot && state.breakOnlyBehindHeadString;
        if (isValidCueBallPlacement(state.balls, shotWithCall.cueX, shotWithCall.cueY, behindHead)) {
          startState = {
            ...state,
            balls: state.balls.map((b) =>
              b.id === 0
                ? { ...b, x: shotWithCall.cueX!, y: shotWithCall.cueY!, pocketed: false }
                : { ...b }
            ),
          };
        }
      }

      sinkAnimsRef.current = [];
      simAccumulatorRef.current = 0;
      const runtime = createPoolSimRuntime(startState.balls, shotWithCall);
      simRuntimeRef.current = runtime;
      prevSimBallsRef.current = startState.balls.map((b) => ({ ...b }));
      simMetaRef.current = {
        shot: shotWithCall,
        baseState: startState,
      };

      playPoolCueStrike(shotWithCall.power, mutedRef.current);
      setPullPower(0);
      setIsPullingPower(false);
      setIsSimulatingUI(true);
    },
    [isOffline, isSimulatingUI, localCalledPocket, onTakeShotOnline]
  );

  // Offline AI Bot turn scheduler: 0.8–1.4s thinking + animated aim sweep -> fire
  useEffect(() => {
    if (!isOffline || isSimulatingUI) return;
    if (localState.status !== 'playing' || localState.phase === 'GAME_OVER') return;
    const seat = localState.players[localState.turnSeat];
    if (!seat?.isBot) return;

    setAiThinking(true);
    const thinkMs = difficulty === 'hard' ? 1250 : difficulty === 'medium' ? 1050 : 850;
    let aimTimer = 0;
    let shootTimer = 0;

    aimTimer = window.setTimeout(() => {
      const planned = choosePoolAiShot(localState, difficulty);
      // Place cue ball if BALL_IN_HAND
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
      setAimAngle(planned.angle);
      setSpinX(planned.spinX);
      setSpinY(planned.spinY);
      setPullPower(planned.power * 0.72);

      shootTimer = window.setTimeout(() => {
        setAiThinking(false);
        fireShot(planned);
      }, 480);
    }, thinkMs);

    return () => {
      window.clearTimeout(aimTimer);
      window.clearTimeout(shootTimer);
      setAiThinking(false);
    };
  }, [isOffline, isSimulatingUI, localState, difficulty, fireShot]);

  // Trigger victory SFX when match finishes
  const prevWinnerRef = useRef<0 | 1 | null>(null);
  useEffect(() => {
    const w = activeState?.winnerSeat ?? null;
    if (w !== null && prevWinnerRef.current === null) {
      playGameSfx('victory', muted);
    }
    prevWinnerRef.current = w;
  }, [activeState?.winnerSeat, muted]);

  // ============================================================================
  // COORDINATE MAPPING (Landscape <-> Portrait Canonical Table Space)
  // ============================================================================

  const screenToTable = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
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
    // Portrait rotation: screen X = table H - y, screen Y = x
    // Specifically: screen_wx = RAIL_PAD + (POOL_TABLE_H - tableY), screen_wy = RAIL_PAD + tableX
    const tableX = wy - RAIL_PAD;
    const tableY = POOL_TABLE_H - (wx - RAIL_PAD);
    return { x: tableX, y: tableY };
  }, []);

  // ============================================================================
  // 60FPS PHYSICS ACCUMULATOR & CANVAS 2D TOURNAMENT RENDERER
  // ============================================================================

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const drawBall = (
      ctx: CanvasRenderingContext2D,
      ball: PoolBallState,
      scale: number,
      radiusOverride?: number,
      alphaOverride = 1
    ) => {
      const r = radiusOverride ?? POOL_BALL_R;
      const meta = BALL_COLORS[ball.id] || BALL_COLORS[1];

      ctx.save();
      ctx.globalAlpha = alphaOverride;
      ctx.translate(ball.x, ball.y);

      // Soft table drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.arc(2.4, 3.2, r * 1.02, 0, Math.PI * 2);
      ctx.fill();

      // Base sphere fill
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();

      if (meta.stripe) {
        ctx.fillStyle = '#F7F4EC';
        ctx.fillRect(-r, -r, r * 2, r * 2);
        // Rolling colored stripe band
        ctx.save();
        ctx.rotate(ball.rollAngle);
        const shift = Math.sin(ball.rollPhase) * r * 0.25;
        ctx.fillStyle = meta.main;
        ctx.fillRect(-r * 1.1, -r * 0.56 + shift * 0.35, r * 2.2, r * 1.12);
        ctx.restore();
      } else {
        ctx.fillStyle = meta.main;
        ctx.fillRect(-r, -r, r * 2, r * 2);
      }

      // 3D spherical shading gradient
      const shadeGrad = ctx.createRadialGradient(-r * 0.32, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
      shadeGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
      shadeGrad.addColorStop(0.55, 'rgba(0,0,0,0.0)');
      shadeGrad.addColorStop(1, 'rgba(0,0,0,0.48)');
      ctx.fillStyle = shadeGrad;
      ctx.fillRect(-r, -r, r * 2, r * 2);

      // White number disc (shifted smoothly on roll for tactile depth, upright text)
      if (ball.id > 0) {
        const rollOx = Math.cos(ball.rollAngle) * Math.sin(ball.rollPhase) * (r * 0.16);
        const rollOy = Math.sin(ball.rollAngle) * Math.sin(ball.rollPhase) * (r * 0.16);
        ctx.fillStyle = '#FAF8F2';
        ctx.beginPath();
        ctx.arc(rollOx, rollOy, r * 0.48, 0, Math.PI * 2);
        ctx.fill();

        // Keep number upright regardless of portrait/landscape canvas transform
        if (isPortraitRef.current) {
          ctx.save();
          ctx.translate(rollOx, rollOy);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = '#111827';
          ctx.font = `800 ${Math.max(7, Math.round(r * 0.62))}px Plus Jakarta Sans, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(ball.id), 0, 0.5);
          ctx.restore();
        } else {
          ctx.fillStyle = '#111827';
          ctx.font = `800 ${Math.max(7, Math.round(r * 0.62))}px Plus Jakarta Sans, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(ball.id), rollOx, rollOy + 0.5);
        }
      } else {
        // Subtle red spin indicator dot on cue ball
        const sx = spinRef.current.x * r * 0.36;
        const sy = -spinRef.current.y * r * 0.36;
        if (Math.abs(sx) > 0.4 || Math.abs(sy) > 0.4) {
          ctx.fillStyle = 'rgba(225, 29, 72, 0.72)';
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Glossy specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.34, r * 0.28, r * 0.16, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // end clip

      // Subtle outer rim crispness
      ctx.strokeStyle = ball.id === 8 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(0.6, 1 / Math.max(0.5, scale));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min(POOL_MAX_FRAME_DT, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      // 1) Smooth aim interpolation
      const angleDiff = normalizeAngleDelta(currentAimAngleRef.current, targetAimAngleRef.current);
      if (Math.abs(angleDiff) > 0.0004) {
        currentAimAngleRef.current += angleDiff * Math.min(1, dt * 18);
      }

      // 2) Fixed-timestep (1/120s) physics accumulator & interpolation
      let renderBalls: PoolBallState[] | null = null;
      const runtime = simRuntimeRef.current;

      if (runtime) {
        simAccumulatorRef.current += dt;
        let subSteps = 0;
        let finishedThisFrame = false;

        while (simAccumulatorRef.current >= POOL_FIXED_DT && subSteps < 8) {
          prevSimBallsRef.current = runtime.balls.map((b) => ({ ...b }));
          const events = stepPoolPhysicsSubstep(runtime, POOL_FIXED_DT);
          simAccumulatorRef.current -= POOL_FIXED_DT;
          subSteps += 1;

          for (const ev of events) {
            if (ev.type === 'ball_ball') {
              playPoolClack(ev.speed, mutedRef.current);
            } else if (ev.type === 'cushion') {
              playPoolCushion(ev.speed, mutedRef.current);
            } else if (ev.type === 'pocket_drop') {
              playPoolPocketDrop(mutedRef.current);
              const b = runtime.balls.find((item) => item.id === ev.ballA);
              sinkAnimsRef.current.push({
                ballId: ev.ballA,
                startX: b ? b.x : ev.x,
                startY: b ? b.y : ev.y,
                pocketX: ev.x,
                pocketY: ev.y,
                startedAt: now,
              });
            }
          }

          if (!isPoolRuntimeMoving(runtime)) {
            finishedThisFrame = true;
            break;
          }
        }

        if (finishedThisFrame) {
          for (const b of runtime.balls) {
            b.vx = 0;
            b.vy = 0;
          }
          const meta = simMetaRef.current;
          simRuntimeRef.current = null;
          prevSimBallsRef.current = null;
          simMetaRef.current = null;
          setIsSimulatingUI(false);

          if (meta) {
            if (isOffline) {
              const resolved = resolvePoolShotOutcome(
                meta.baseState,
                runtime,
                meta.shot.calledPocketId ?? meta.baseState.calledPocketId ?? null,
                meta.shot
              );
              if (resolved.foul) {
                playPoolFoul(mutedRef.current);
              }
              setLocalState(resolved.nextState);
            } else if (meta.authoritativeState) {
              // Deterministic validation & checksum verification
              const localResolved = resolvePoolShotOutcome(
                meta.baseState,
                runtime,
                meta.shot.calledPocketId ?? meta.baseState.calledPocketId ?? null,
                meta.shot,
                meta.authoritativeState.updatedAt
              );
              const localSum = computePoolChecksum(localResolved.nextState);
              if (meta.authoritativeState.lastFoul) {
                playPoolFoul(mutedRef.current);
              }
              if (meta.expectedChecksum !== undefined && localSum !== meta.expectedChecksum) {
                // Resync immediately with authoritative server state on any divergence
                onSyncChecksumOnline?.(meta.authoritativeState.turnNumber, localSum);
              } else {
                onSyncChecksumOnline?.(meta.authoritativeState.turnNumber, localSum);
              }
            }
          }
        } else if (prevSimBallsRef.current) {
          // Interpolate between previous 120Hz step and current 120Hz step
          const alpha = Math.max(0, Math.min(1, simAccumulatorRef.current / POOL_FIXED_DT));
          renderBalls = runtime.balls.map((curr, idx) => {
            const prev = prevSimBallsRef.current![idx];
            if (!prev || curr.pocketed) return curr;
            return {
              ...curr,
              x: prev.x + (curr.x - prev.x) * alpha,
              y: prev.y + (curr.y - prev.y) * alpha,
              rollPhase: prev.rollPhase + (curr.rollPhase - prev.rollPhase) * alpha,
            };
          });
        } else {
          renderBalls = runtime.balls;
        }
      }

      // 3) Render Tournament Table Canvas
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        const cssW = Math.max(220, Math.floor(rect.width));
        const cssH = Math.max(180, Math.floor(rect.height));
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);

        if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
          canvas.width = Math.floor(cssW * dpr);
          canvas.height = Math.floor(cssH * dpr);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, cssW, cssH);

          // Auto-orient table cleanly to fit any portrait or landscape viewport without scrolling
          const portrait = cssH > cssW * 1.05;
          isPortraitRef.current = portrait;
          const canonicalTotalW = (portrait ? POOL_TABLE_H : POOL_TABLE_W) + RAIL_PAD * 2;
          const canonicalTotalH = (portrait ? POOL_TABLE_W : POOL_TABLE_H) + RAIL_PAD * 2;
          const scale = Math.min(cssW / canonicalTotalW, cssH / canonicalTotalH);
          const offsetX = (cssW - canonicalTotalW * scale) * 0.5;
          const offsetY = (cssH - canonicalTotalH * scale) * 0.5;

          transformRef.current = { cssW, cssH, scale, offsetX, offsetY, portrait };

          ctx.translate(offsetX, offsetY);
          ctx.scale(scale, scale);

          if (portrait) {
            ctx.translate(POOL_TABLE_H + RAIL_PAD * 2, 0);
            ctx.rotate(Math.PI / 2);
          }

          ctx.translate(RAIL_PAD, RAIL_PAD);

          // Outer Beveled Mahogany / Slate Tournament Frame
          const outerX = -RAIL_PAD;
          const outerY = -RAIL_PAD;
          const outerW = POOL_TABLE_W + RAIL_PAD * 2;
          const outerH = POOL_TABLE_H + RAIL_PAD * 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetY = 8;
          const woodGrad = ctx.createLinearGradient(outerX, outerY, outerX, outerY + outerH);
          woodGrad.addColorStop(0, '#4E2A1B');
          woodGrad.addColorStop(0.5, '#331A10');
          woodGrad.addColorStop(1, '#221009');
          ctx.fillStyle = woodGrad;
          ctx.beginPath();
          ctx.roundRect(outerX, outerY, outerW, outerH, 26);
          ctx.fill();
          ctx.restore();

          // Brushed brass/chrome rail trim & bevel highlight
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(outerX + 3, outerY + 3, outerW - 6, outerH - 6, 23);
          ctx.stroke();

          // Brushed gunmetal corner pocket castings
          ctx.fillStyle = '#3F4451';
          const cornerSize = 36;
          [
            [outerX, outerY],
            [outerX + outerW - cornerSize, outerY],
            [outerX, outerY + outerH - cornerSize],
            [outerX + outerW - cornerSize, outerY + outerH - cornerSize],
          ].forEach(([cx, cy]) => {
            ctx.beginPath();
            ctx.roundRect(cx, cy, cornerSize, cornerSize, 10);
            ctx.fill();
          });

          // Inner Emerald-Slate Cushion Bezel Shadow
          ctx.fillStyle = '#07271E';
          ctx.beginPath();
          ctx.roundRect(-14, -14, POOL_TABLE_W + 28, POOL_TABLE_H + 28, 12);
          ctx.fill();

          // Tournament Felt Surface + Procedural Baize Texture
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, POOL_TABLE_W, POOL_TABLE_H);
          ctx.clip();

          if (!feltPatternRef.current) {
            const patCanvas = createFeltNoisePattern();
            if (patCanvas) {
              feltPatternRef.current = ctx.createPattern(patCanvas, 'repeat');
            }
          }
          ctx.fillStyle = feltPatternRef.current || '#0B4635';
          ctx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

          // Overhead tournament table lighting vignette
          const feltLight = ctx.createRadialGradient(
            POOL_TABLE_W * 0.5,
            POOL_TABLE_H * 0.5,
            40,
            POOL_TABLE_W * 0.5,
            POOL_TABLE_H * 0.5,
            POOL_TABLE_W * 0.65
          );
          feltLight.addColorStop(0, 'rgba(34, 197, 94, 0.14)');
          feltLight.addColorStop(0.6, 'rgba(6, 78, 59, 0.05)');
          feltLight.addColorStop(1, 'rgba(2, 18, 14, 0.45)');
          ctx.fillStyle = feltLight;
          ctx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

          // Inner cushion drop shadow around felt perimeter
          ctx.strokeStyle = 'rgba(0,0,0,0.48)';
          ctx.lineWidth = 10;
          ctx.strokeRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

          // Head String (kitchen line) & Foot Spot
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(POOL_HEAD_STRING_X, 0);
          ctx.lineTo(POOL_HEAD_STRING_X, POOL_TABLE_H);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.beginPath();
          ctx.arc(750, POOL_FOOT_SPOT_Y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Cushion Rails (slanted green rail lips between pockets)
          ctx.fillStyle = '#0D5742';
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          const drawRail = (pts: Array<[number, number]>) => {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          };
          drawRail([[20, -14], [478, -14], [472, 0], [30, 0]]);
          drawRail([[522, -14], [980, -14], [970, 0], [528, 0]]);
          drawRail([[20, POOL_TABLE_H + 14], [478, POOL_TABLE_H + 14], [472, POOL_TABLE_H], [30, POOL_TABLE_H]]);
          drawRail([[522, POOL_TABLE_H + 14], [980, POOL_TABLE_H + 14], [970, POOL_TABLE_H], [528, POOL_TABLE_H]]);
          drawRail([[-14, 20], [0, 30], [0, 470], [-14, 480]]);
          drawRail([[POOL_TABLE_W + 14, 20], [POOL_TABLE_W, 30], [POOL_TABLE_W, 470], [POOL_TABLE_W + 14, 480]]);

          // Rail Diamond Sights (3 per half rail)
          ctx.fillStyle = '#E5D3B3';
          const diamondX = [125, 250, 375, 625, 750, 875];
          const diamondY = [125, 250, 375];
          const drawDiamond = (x: number, y: number) => {
            ctx.beginPath();
            ctx.moveTo(x, y - 3.5);
            ctx.lineTo(x + 3.5, y);
            ctx.lineTo(x, y + 3.5);
            ctx.lineTo(x - 3.5, y);
            ctx.closePath();
            ctx.fill();
          };
          for (const dx of diamondX) {
            drawDiamond(dx, -25);
            drawDiamond(dx, POOL_TABLE_H + 25);
          }
          for (const dy of diamondY) {
            drawDiamond(-25, dy);
            drawDiamond(POOL_TABLE_W + 25, dy);
          }

          // Pockets (Recessed Cup + Shadows + Highlight for 8-ball call!)
          const state = activeStateRef.current;
          const activeTurnSeat = state ? state.players[state.turnSeat] : null;
          const activeUserIsMe = Boolean(
            state &&
              state.status === 'playing' &&
              !simRuntimeRef.current &&
              (isOffline ? state.turnSeat === 0 : activeTurnSeat?.userId === currentUser.id)
          );
          const showPocketCallTargets = Boolean(
            state &&
              activeUserIsMe &&
              activeTurnSeat &&
              isOnEightBall(state.balls, activeTurnSeat.group)
          );
          const calledPocket = state?.calledPocketId || localCalledPocket;

          for (const p of POOL_POCKETS) {
            // Outer rim leather shadow
            ctx.fillStyle = '#1E1510';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.captureR + 5, 0, Math.PI * 2);
            ctx.fill();

            // Deep dark pocket hole
            const pGrad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.captureR);
            pGrad.addColorStop(0, '#020305');
            pGrad.addColorStop(0.75, '#090B10');
            pGrad.addColorStop(1, '#1A1C22');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.captureR, 0, Math.PI * 2);
            ctx.fill();

            if (calledPocket === p.id) {
              ctx.strokeStyle = '#FACC15';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.captureR + 3, 0, Math.PI * 2);
              ctx.stroke();
            } else if (showPocketCallTargets) {
              const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
              ctx.strokeStyle = `rgba(250, 204, 21, ${0.35 + pulse * 0.45})`;
              ctx.lineWidth = 2;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.captureR + 3, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // Active Sink Animations (balls shrinking & fading into pockets)
          if (sinkAnimsRef.current.length > 0) {
            const nextAnims: SinkAnim[] = [];
            for (const sa of sinkAnimsRef.current) {
              const prog = Math.min(1, (now - sa.startedAt) / 280);
              if (prog < 1) {
                nextAnims.push(sa);
                const ease = 1 - Math.pow(1 - prog, 2);
                const bx = sa.startX + (sa.pocketX - sa.startX) * ease;
                const by = sa.startY + (sa.pocketY - sa.startY) * ease;
                const sinkBall: PoolBallState = {
                  id: sa.ballId,
                  x: bx,
                  y: by,
                  vx: 0,
                  vy: 0,
                  pocketed: false,
                  pocketId: null,
                  rollPhase: ease * 4,
                  rollAngle: 0,
                };
                drawBall(ctx, sinkBall, scale, POOL_BALL_R * (1 - ease * 0.58), 1 - ease * 0.9);
              }
            }
            sinkAnimsRef.current = nextAnims;
          }

          // Draw Active Balls
          const ballsToDraw = renderBalls || state?.balls || [];
          const ghost = cueGhostRef.current;

          for (const b of ballsToDraw) {
            if (b.pocketed) continue;
            if (b.id === 0 && ghost) continue; // Draw ghost instead while dragging cue
            drawBall(ctx, b, scale);
          }

          // Ball-in-Hand Placement Ghost
          if (ghost && state) {
            ctx.save();
            ctx.globalAlpha = 0.78;
            drawBall(
              ctx,
              {
                id: 0,
                x: ghost.x,
                y: ghost.y,
                vx: 0,
                vy: 0,
                pocketed: false,
                pocketId: null,
                rollPhase: 0,
                rollAngle: 0,
              },
              scale
            );
            ctx.strokeStyle = ghost.valid ? '#10B981' : '#F43F5E';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(ghost.x, ghost.y, POOL_BALL_R + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // Ball-in-Hand Hint Ring when idle in BALL_IN_HAND
          const cueBall = ballsToDraw.find((b) => b.id === 0);
          if (state?.phase === 'BALL_IN_HAND' && activeUserIsMe && cueBall && !ghost) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.007);
            ctx.strokeStyle = `rgba(16, 185, 129, ${0.45 + pulse * 0.5})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(cueBall.x, cueBall.y, POOL_BALL_R + 6 + pulse * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Aiming Guides, Ghost Ball, Predicted Post-Impact Paths & Cue Stick
          const showAiming =
            state &&
            state.status === 'playing' &&
            !simRuntimeRef.current &&
            cueBall &&
            !cueBall.pocketed &&
            !ghost &&
            (activeUserIsMe || (isOffline && state.players[state.turnSeat]?.isBot && aiThinking));

          if (showAiming && cueBall) {
            const angle = currentAimAngleRef.current;
            const pred = computeAimPrediction(ballsToDraw, angle, spinRef.current.y);

            // Dotted line from cue ball to first contact point
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.68)';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(cueBall.x, cueBall.y);
            ctx.lineTo(pred.ghostX, pred.ghostY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Ghost ball at first contact
            const hitBall =
              pred.hitBallId !== null ? ballsToDraw.find((b) => b.id === pred.hitBallId) : null;
            const targetLegal = (() => {
              if (!hitBall || !activeTurnSeat) return true;
              if (state.isBreakShot || activeTurnSeat.group === null) return hitBall.id !== 8;
              if (isOnEightBall(ballsToDraw, activeTurnSeat.group)) return hitBall.id === 8;
              return getBallGroup(hitBall.id) === activeTurnSeat.group;
            })();

            ctx.strokeStyle =
              pred.hitType === 'ball'
                ? targetLegal
                  ? 'rgba(255,255,255,0.85)'
                  : 'rgba(244, 63, 94, 0.9)'
                : 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(pred.ghostX, pred.ghostY, POOL_BALL_R, 0, Math.PI * 2);
            ctx.stroke();

            if (pred.hitType === 'ball') {
              // Target ball predicted path
              ctx.strokeStyle = targetLegal
                ? 'rgba(250, 204, 21, 0.85)'
                : 'rgba(244, 63, 94, 0.85)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(hitBall!.x, hitBall!.y);
              ctx.lineTo(pred.targetEndX, pred.targetEndY);
              ctx.stroke();

              // Cue ball post-impact deflection path
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(pred.ghostX, pred.ghostY);
              ctx.lineTo(pred.cueDeflectX, pred.cueDeflectY);
              ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.restore();

            // Cue Stick with Pull-Back Power & Strike Lunge Animation
            let pullDist = 18 + pullPowerRef.current * 92;
            let stickAngle = angle;
            if (cueLungeRef.current.active) {
              const elapsed = now - cueLungeRef.current.startedAt;
              if (elapsed < 90) {
                const p = elapsed / 90;
                pullDist = 18 + (1 - p) * cueLungeRef.current.power * 75;
                stickAngle = cueLungeRef.current.angle;
              } else {
                cueLungeRef.current.active = false;
              }
            }

            ctx.save();
            ctx.translate(cueBall.x, cueBall.y);
            ctx.rotate(stickAngle + Math.PI); // Extends behind cue ball

            const cueLen = 280;
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;

            // Blue chalked tip
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(pullDist, -2.1, 4, 4.2);

            // White ferrule
            ctx.fillStyle = '#F8FAFC';
            ctx.fillRect(pullDist + 4, -2.3, 8, 4.6);

            // Tapered Maple Shaft -> Rosewood Butt
            const shaftGrad = ctx.createLinearGradient(pullDist + 12, 0, pullDist + cueLen, 0);
            shaftGrad.addColorStop(0, '#F3DEC0');
            shaftGrad.addColorStop(0.58, '#E0B984');
            shaftGrad.addColorStop(0.59, '#2B1810');
            shaftGrad.addColorStop(0.88, '#5C2218');
            shaftGrad.addColorStop(1, '#111827');

            ctx.fillStyle = shaftGrad;
            ctx.beginPath();
            ctx.moveTo(pullDist + 12, -2.4);
            ctx.lineTo(pullDist + cueLen, -5.2);
            ctx.lineTo(pullDist + cueLen, 5.2);
            ctx.lineTo(pullDist + 12, 2.4);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
          }

          ctx.restore(); // end DPR & translate
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOffline, currentUser.id, localCalledPocket, aiThinking, onSyncChecksumOnline]);

  // ============================================================================
  // TABLE POINTER HANDLERS (Aiming / Ball-in-Hand Drag / 8-Ball Pocket Call)
  // ============================================================================

  const tableDragModeRef = useRef<'none' | 'aim' | 'place_cue'>('none');

  const handleTablePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    unlockPoolAudio();
    const state = activeState;
    if (!state || !isMyTurn || isSimulatingUI) return;
    const pt = screenToTable(e.clientX, e.clientY);

    // 1) Check if tapping a pocket to call it when on the 8-ball
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

    // 2) Ball-in-hand placement (or break placement behind head string)
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
        // Clicking directly on an open spot places cue ball there cleanly if valid
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

    // 3) Aim anywhere on the table
    tableDragModeRef.current = 'aim';
    e.currentTarget.setPointerCapture(e.pointerId);
    const nextAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    targetAimAngleRef.current = nextAngle;
    setAimAngle(nextAngle);
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
      setAimAngle(nextAngle);
    }
  };

  const handleTablePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = tableDragModeRef.current;
    tableDragModeRef.current = 'none';
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

  // ============================================================================
  // PULL-BACK POWER SLIDER HANDLERS
  // ============================================================================

  const updatePowerFromPointer = (clientX: number) => {
    const el = powerSliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setPullPower(raw);
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
      setPullPower(0);
      return;
    }
    fireShot({
      angle: currentAimAngleRef.current,
      power,
      spinX: spinRef.current.x,
      spinY: spinRef.current.y,
      calledPocketId: effectiveCalledPocket,
    });
  };

  // ============================================================================
  // SPIN CONTACT-POINT SELECTOR HANDLERS
  // ============================================================================

  const spinDragActiveRef = useRef(false);
  const updateSpinFromPointer = (clientX: number, clientY: number) => {
    const el = spinPadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(1, rect.width * 0.42);
    let nx = (clientX - cx) / maxR;
    let ny = -(clientY - cy) / maxR; // +Y up = topspin
    const mag = Math.hypot(nx, ny);
    if (mag > 1) {
      nx /= mag;
      ny /= mag;
    }
    setSpinX(Number(nx.toFixed(2)));
    setSpinY(Number(ny.toFixed(2)));
  };

  // ============================================================================
  // OFFLINE DIFFICULTY & REMATCH HELPERS
  // ============================================================================

  const startOfflineWithDifficulty = (nextDiff: PoolDifficulty) => {
    setDifficulty(nextDiff);
    simRuntimeRef.current = null;
    prevSimBallsRef.current = null;
    simMetaRef.current = null;
    setIsSimulatingUI(false);
    setLocalState(
      createInitialPoolState(
        [
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            color: currentUser.color,
          },
        ],
        { offlineVsAi: true, difficulty: nextDiff }
      )
    );
  };

  const handleRematch = () => {
    simRuntimeRef.current = null;
    prevSimBallsRef.current = null;
    simMetaRef.current = null;
    setIsSimulatingUI(false);
    sinkAnimsRef.current = [];
    if (isOffline) {
      startOfflineWithDifficulty(difficulty);
    } else {
      onRematchOnline?.();
    }
  };

  // Group & pocketed rack summary for HUD
  const renderPocketedChips = (group: PoolBallGroup | null) => {
    if (!activeState || !group) return null;
    const ids = group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    return (
      <div className="flex items-center gap-0.5">
        {ids.map((id) => {
          const b = activeState.balls.find((item) => item.id === id);
          const remaining = b && !b.pocketed;
          const color = BALL_COLORS[id]?.main || '#fff';
          return (
            <span
              key={id}
              title={String(id)}
              className={`w-3 h-3 rounded-full border text-[7px] font-black flex items-center justify-center tabular-nums transition-opacity ${
                remaining ? 'opacity-95 border-white/60' : 'opacity-25 border-white/20'
              }`}
              style={{
                background: BALL_COLORS[id]?.stripe
                  ? `linear-gradient(180deg, #fff 25%, ${color} 25%, ${color} 75%, #fff 75%)`
                  : color,
                color: id === 1 || id === 9 ? '#111' : '#fff',
              }}
            >
              {id}
            </span>
          );
        })}
      </div>
    );
  };

  // ============================================================================
  // RENDER: ONLINE WAITING FOR 2ND PLAYER OR ACTIVE TABLE
  // ============================================================================

  if (!activeState) {
    return (
      <div className="flex-1 min-h-0 rounded-2xl nc-tabletop-slate border border-white/[0.1] flex flex-col items-center justify-center gap-3 p-4 text-center">
        <span className="text-3xl" aria-hidden="true">🎱</span>
        <p className="text-sm font-bold text-white">
          {pickLang(lang, {
            es: 'Preparando mesa de Billar Bola 8…',
            ca: 'Preparant taula de Billar Bola 8…',
            en: 'Setting up 8-Ball Pool table…',
          })}
        </p>
        {!isOffline && (
          <button
            type="button"
            onClick={() => onStartOnline?.(difficulty)}
            className="min-h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
          >
            {pickLang(lang, { es: 'Abrir mesa', ca: 'Obrir taula', en: 'Open Table' })}
          </button>
        )}
      </div>
    );
  }

  const p0 = activeState.players[0];
  const p1 = activeState.players[1];
  const turnSecsLeft =
    !isOffline && activeState.status === 'playing' && activeState.turnDeadlineAt > 0
      ? Math.max(0, Math.ceil((activeState.turnDeadlineAt - nowTs) / 1000))
      : null;

  const groupLabel = (grp: PoolBallGroup | null, balls: PoolBallState[]): string => {
    if (!grp) return pickLang(lang, { es: 'Abierta', ca: 'Oberta', en: 'Open' });
    if (isOnEightBall(balls, grp)) return pickLang(lang, { es: 'Bola 8', ca: 'Bola 8', en: '8-Ball' });
    return grp === 'solids'
      ? pickLang(lang, { es: 'Lisas', ca: 'Llises', en: 'Solids' })
      : pickLang(lang, { es: 'Rayadas', ca: 'Ratllades', en: 'Stripes' });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden select-none">
      {/* Compact Scoreboard / Players / Difficulty / Turn Strip */}
      <div className="px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-1.5 shrink-0">
        {/* Player 0 */}
        <div
          className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg border transition-colors ${
            activeState.status === 'playing' && activeState.turnSeat === 0
              ? 'bg-emerald-500/15 border-emerald-400/55'
              : 'bg-black/25 border-white/[0.06]'
          }`}
        >
          <span className="text-sm shrink-0" aria-hidden="true">{p0?.avatar || '🎱'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] font-bold text-white truncate max-w-[92px] sm:max-w-[130px]">
              <span className="truncate">{p0?.name || 'Jugador 1'}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
              <span>{groupLabel(p0?.group ?? null, activeState.balls)}</span>
              <span className="hidden sm:inline">{renderPocketedChips(p0?.group ?? null)}</span>
            </div>
          </div>
        </div>

        {/* Center Status / Clock / AI Difficulty */}
        <div className="flex flex-col items-center justify-center min-w-0 px-1 text-center">
          {isOffline ? (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#090A10] border border-white/[0.08]">
              {(['easy', 'medium', 'hard'] as PoolDifficulty[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => startOfflineWithDifficulty(lvl)}
                  className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    difficulty === lvl
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {lvl === 'easy'
                    ? pickLang(lang, { es: 'Fácil', ca: 'Fàcil', en: 'Easy' })
                    : lvl === 'medium'
                    ? pickLang(lang, { es: 'Medio', ca: 'Mitjà', en: 'Med' })
                    : pickLang(lang, { es: 'Difícil', ca: 'Difícil', en: 'Hard' })}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums text-zinc-200">
              {turnSecsLeft !== null && (
                <span
                  className={`flex items-center gap-0.5 font-bold ${
                    turnSecsLeft <= 10 ? 'text-rose-400' : 'text-emerald-300'
                  }`}
                >
                  <Timer className="w-3 h-3" />
                  {turnSecsLeft}s
                </span>
              )}
            </div>
          )}
          <span className="text-[9px] sm:text-[10px] text-zinc-300 truncate max-w-[140px] sm:max-w-[240px]">
            {aiThinking
              ? pickLang(lang, { es: 'Bot calculando tiro…', ca: 'Bot pensant tir…', en: 'AI aiming…' })
              : shotErrorMsg || activeState.statusMessage}
          </span>
        </div>

        {/* Player 1 */}
        <div
          className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg border transition-colors ${
            activeState.status === 'playing' && activeState.turnSeat === 1
              ? 'bg-emerald-500/15 border-emerald-400/55'
              : 'bg-black/25 border-white/[0.06]'
          }`}
        >
          {p1 ? (
            <>
              <div className="min-w-0 text-right">
                <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-white truncate max-w-[92px] sm:max-w-[130px]">
                  {p1.isBot && <Bot className="w-3 h-3 text-emerald-400 shrink-0" />}
                  <span className="truncate">{p1.name}</span>
                  {p1.connected === false && (
                    <span className="text-[9px] text-amber-400">(offline)</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-300">
                  <span className="hidden sm:inline">{renderPocketedChips(p1.group)}</span>
                  <span>{groupLabel(p1.group, activeState.balls)}</span>
                </div>
              </div>
              <span className="text-sm shrink-0" aria-hidden="true">{p1.avatar}</span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onJoinSeatOnline?.(1)}
              className="px-2 py-1 rounded-md bg-[#E11D48] hover:bg-[#BE123C] text-[10px] font-bold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Users className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Unirse', ca: 'Unir-se', en: 'Join' })}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Table Container */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-2xl bg-[#07090E] border border-white/[0.09] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleTablePointerDown}
          onPointerMove={handleTablePointerMove}
          onPointerUp={handleTablePointerUp}
          onPointerCancel={handleTablePointerUp}
          className="w-full h-full block touch-none cursor-crosshair"
        />

        {/* Contextual Helper Banner (Ball-in-Hand / Call 8-Ball / Waiting) */}
        {activeState.status === 'waiting' && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl bg-black/80 border border-white/15 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-200">
              {pickLang(lang, {
                es: 'Esperando a un rival de la sala en el Asiento 2…',
                ca: 'Esperant un rival de la sala…',
                en: 'Waiting for opponent in Seat 2…',
              })}
            </span>
            {mySeatIndex === null && (
              <button
                type="button"
                onClick={() => onJoinSeatOnline?.(1)}
                className="min-h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white whitespace-nowrap cursor-pointer"
              >
                {pickLang(lang, { es: 'Jugar aquí', ca: 'Jugar aquí', en: 'Join Seat 2' })}
              </button>
            )}
          </div>
        )}

        {activeState.status === 'playing' && isMyTurn && activeState.phase === 'BALL_IN_HAND' && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-emerald-500/90 text-zinc-950 text-[11px] font-extrabold whitespace-nowrap shadow-md">
            {pickLang(lang, {
              es: '✋ Bola en mano: arrastra la blanca',
              ca: '✋ Bola en mà: arrossega la blanca',
              en: '✋ Ball in hand: drag cue ball',
            })}
          </div>
        )}

        {activeState.status === 'playing' && isMyTurn && amIOnEightBall && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-400/95 text-zinc-950 text-[11px] font-extrabold whitespace-nowrap shadow-md flex items-center gap-1">
            <Target className="w-3.5 h-3.5" />
            <span>
              {effectiveCalledPocket
                ? pickLang(lang, {
                    es: `Bola 8 cantada: ${POOL_POCKETS.find((p) => p.id === effectiveCalledPocket)?.label || effectiveCalledPocket}`,
                    ca: `Bola 8 cantada: ${effectiveCalledPocket}`,
                    en: `8-Ball called: ${effectiveCalledPocket}`,
                  })
                : pickLang(lang, {
                    es: 'Toca una tronera para cantar la Bola 8',
                    ca: 'Toca una tronera per cantar la Bola 8',
                    en: 'Tap a pocket to call the 8-Ball',
                  })}
            </span>
          </div>
        )}

        {/* Victory Overlay */}
        {activeState.status === 'finished' && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={
              activeState.winnerSeat !== null
                ? `🎱 ${activeState.players[activeState.winnerSeat]?.name || 'Ganador'} gana`
                : pickLang(lang, { es: 'Partida terminada', ca: 'Partida acabada', en: 'Match Over' })
            }
            subtitle={activeState.statusMessage}
            primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
            onPrimaryAction={handleRematch}
          />
        )}
      </div>

      {/* Bottom Touch-First Shot Dock: Power Pull Slider + Spin Selector + Forfeit/Reset */}
      <div className="px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-2 shrink-0">
        {/* 1. Compact Cue-Ball Spin Contact Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            ref={spinPadRef}
            onPointerDown={(e) => {
              unlockPoolAudio();
              spinDragActiveRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              updateSpinFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (spinDragActiveRef.current) updateSpinFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              spinDragActiveRef.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onDoubleClick={() => {
              setSpinX(0);
              setSpinY(0);
            }}
            title={pickLang(lang, {
              es: 'Efecto de bola blanca (doble clic para centrar)',
              ca: 'Efecte de bola blanca',
              en: 'Cue ball spin (double-click to center)',
            })}
            className="relative w-11 h-11 rounded-full bg-gradient-to-br from-[#FFFDF7] to-[#D4CFC3] border border-white/60 shadow-inner touch-none cursor-pointer shrink-0"
          >
            {/* Crosshair lines */}
            <span className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-zinc-400/50" />
            <span className="pointer-events-none absolute inset-y-2 left-1/2 w-px bg-zinc-400/50" />
            {/* Contact dot */}
            <span
              className="pointer-events-none absolute w-3 h-3 rounded-full bg-[#E11D48] border border-white shadow-sm -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${50 + spinX * 38}%`,
                top: `${50 - spinY * 38}%`,
              }}
            />
          </div>
          {(Math.abs(spinX) > 0.05 || Math.abs(spinY) > 0.05) && (
            <button
              type="button"
              onClick={() => {
                setSpinX(0);
                setSpinY(0);
              }}
              aria-label="Centrar efecto"
              className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-bold text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <Crosshair className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 2. Dedicated Pull-Back Power Slider (Fires on Release, Cancels below threshold) */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300 px-0.5">
            <span>
              {!isMyTurn
                ? isSimulatingUI
                  ? pickLang(lang, { es: 'Bolas en movimiento…', ca: 'Boles en moviment…', en: 'Balls in motion…' })
                  : pickLang(lang, { es: 'Turno del rival', ca: 'Torn del rival', en: "Opponent's turn" })
                : pullPower > 0 && pullPower < POOL_MIN_SHOT_POWER
                ? pickLang(lang, { es: 'Suelta para cancelar', ca: 'Deixa anar per cancel·lar', en: 'Release to cancel' })
                : pickLang(lang, { es: 'Desliza y suelta para tirar', ca: 'Llisca i deixa anar', en: 'Slide & release to shoot' })}
            </span>
            <span className="font-mono tabular-nums text-amber-300">
              {Math.round(pullPower * 100)}%
            </span>
          </div>

          <div
            ref={powerSliderRef}
            onPointerDown={handlePowerPointerDown}
            onPointerMove={handlePowerPointerMove}
            onPointerUp={handlePowerPointerUp}
            onPointerCancel={() => {
              setIsPullingPower(false);
              setPullPower(0);
            }}
            role="slider"
            aria-label={pickLang(lang, { es: 'Potencia de tiro', ca: 'Potència de tir', en: 'Shot power' })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pullPower * 100)}
            className={`relative h-9 rounded-xl border overflow-hidden touch-none flex items-center ${
              isMyTurn && !isSimulatingUI
                ? 'bg-[#0B0D14] border-white/15 cursor-ew-resize'
                : 'bg-[#090A10]/60 border-white/[0.06] opacity-50 cursor-not-allowed'
            }`}
          >
            {/* Minimum threshold marker */}
            <div
              className="absolute inset-y-0 w-px bg-white/25 z-10 pointer-events-none"
              style={{ left: `${POOL_MIN_SHOT_POWER * 100}%` }}
            />
            {/* Power fill bar */}
            <div
              className="h-full transition-[width] duration-75"
              style={{
                width: `${pullPower * 100}%`,
                background:
                  pullPower < POOL_MIN_SHOT_POWER
                    ? 'rgba(244,63,94,0.45)'
                    : 'linear-gradient(90deg, #10B981 0%, #FACC15 65%, #E11D48 100%)',
              }}
            />
            {/* Mini Cue Handle Visual */}
            <div
              className="pointer-events-none absolute top-1 bottom-1 w-3 rounded-md bg-white shadow-md border border-zinc-300 -translate-x-1/2"
              style={{ left: `${Math.max(4, Math.min(96, pullPower * 100))}%` }}
            />
          </div>
        </div>

        {/* 3. Quick Reset (Offline) or Forfeit (Online) */}
        <div className="flex items-center gap-1 shrink-0">
          {isOffline ? (
            <button
              type="button"
              onClick={handleRematch}
              title={pickLang(lang, { es: 'Reiniciar mesa', ca: 'Reiniciar taula', en: 'Reset rack' })}
              className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            mySeatIndex !== null &&
            activeState.status === 'playing' && (
              <button
                type="button"
                onClick={() => onForfeitOnline?.()}
                title={pickLang(lang, { es: 'Abandonar partida', ca: 'Abandonar partida', en: 'Forfeit match' })}
                className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 border border-white/[0.1] flex items-center justify-center text-zinc-200 hover:text-rose-200 cursor-pointer"
              >
                <Flag className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
