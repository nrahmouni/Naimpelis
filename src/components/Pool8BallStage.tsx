import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Timer,
  Users,
} from 'lucide-react';
import type {
  AppLanguage,
  Participant,
  Pool8BallState,
  PoolBallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from '../types';
import {
  POOL_FOOT_SPOT_Y,
  POOL_HEAD_STRING_X,
  POOL_MIN_SHOT_POWER,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  choosePoolAiShot,
  createInitialPoolState,
  createPoolSimRuntime,
  findNearestValidCueBallSpot,
  getBallGroup,
  isOnEightBall,
  isValidCueBallPlacement,
  placePoolCueBall,
} from '../shared/pool8Ball';
import { socketService } from '../services/socket';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './games/GameVoiceBar';
import { playGameSfx, useGameSoundMute } from './games/GameEffects';
import { unlockPoolAudio } from './games/poolAudio';
import {
  RAIL_PAD,
  type PendingStrikeShot,
  type PocketFlashAnim,
  type ShotAnimPayload,
  type SinkAnim,
} from './games/poolCanvasRenderer';
import { PoolShotDock } from './games/PoolShotDock';
import {
  PoolEmptySetupCard,
  PoolPocketedChips,
  PoolTableCanvasOverlays,
  poolGroupLabel,
} from './games/PoolTableOverlays';
import {
  usePoolPhysicsLoop,
  type PoolCanvasTransform,
  type PoolSimMeta,
} from './games/usePoolPhysicsLoop';
import { pickLang } from '../utils/i18n';

export interface PoolStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  poolState: Pool8BallState | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: (difficulty?: PoolDifficulty) => void;
  onStartMatchOnline?: () => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 'spectate') => void;
  onPlaceCueOnline?: (x: number, y: number) => void;
  onCallPocketOnline?: (pocketId: PoolPocketId) => void;
  onTakeShotOnline?: (shot: PoolShotInput) => void;
  onForfeitOnline?: () => void;
  onRematchOnline?: () => void;
  onSyncChecksumOnline?: (turnNumber: number, checksum: number) => void;
}

export const Pool8BallStage: React.FC<PoolStageProps> = ({
  lang,
  currentUser,
  poolState,
  isOffline = false,
  isHost = false,
  voiceChat,
  mutedOverride,
  onStartOnline,
  onStartMatchOnline,
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

  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

  // Aim / Power / Spin / Cue placement local UI controls
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
  const powerFillRef = useRef<HTMLDivElement | null>(null);
  const powerHandleRef = useRef<HTMLDivElement | null>(null);
  const powerPctRef = useRef<HTMLSpanElement | null>(null);

  // Refs used inside 60fps rAF loop
  const simRuntimeRef = useRef<PoolSimRuntime | null>(null);
  const prevSimBallsRef = useRef<PoolBallState[] | null>(null);
  const simMetaRef = useRef<PoolSimMeta | null>(null);
  const simAccumulatorRef = useRef<number>(0);
  const sinkAnimsRef = useRef<SinkAnim[]>([]);
  const pocketFlashesRef = useRef<PocketFlashAnim[]>([]);
  const pendingStrikeRef = useRef<PendingStrikeShot | null>(null);
  const cueFollowThroughRef = useRef<{
    active: boolean;
    startedAt: number;
    angle: number;
    cueX: number;
    cueY: number;
  }>({
    active: false,
    startedAt: 0,
    angle: 0,
    cueX: 0,
    cueY: 0,
  });

  const targetAimAngleRef = useRef<number>(0);
  const currentAimAngleRef = useRef<number>(0);
  const isDraggingAimRef = useRef<boolean>(false);
  const pullPowerRef = useRef<number>(0);
  const spinRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPortraitRef = useRef<boolean>(false);
  const transformRef = useRef<PoolCanvasTransform>({
    cssW: 600,
    cssH: 320,
    scale: 0.5,
    offsetX: 0,
    offsetY: 0,
    portrait: false,
  });

  const rawActiveState = isOffline ? localState : poolState;
  const activeState =
    isSimulatingUI && simMetaRef.current ? simMetaRef.current.baseState : rawActiveState;
  const activeStateRef = useRef<Pool8BallState | null>(activeState);
  const mutedRef = useRef<boolean>(muted);
  const cueGhostRef = useRef<{ x: number; y: number; valid: boolean } | null>(cueGhostPos);
  const localCalledPocketRef = useRef<PoolPocketId | null>(localCalledPocket);
  const aiThinkingRef = useRef<boolean>(aiThinking);
  const onSyncChecksumOnlineRef = useRef(onSyncChecksumOnline);

  activeStateRef.current = activeState;
  mutedRef.current = muted;
  spinRef.current = { x: spinX, y: spinY };
  cueGhostRef.current = cueGhostPos;
  localCalledPocketRef.current = localCalledPocket;
  aiThinkingRef.current = aiThinking;
  onSyncChecksumOnlineRef.current = onSyncChecksumOnline;

  // Keep DOM power bar synchronized on non-drag resets
  useEffect(() => {
    pullPowerRef.current = pullPower;
    if (powerFillRef.current) {
      powerFillRef.current.style.width = `${pullPower * 100}%`;
      powerFillRef.current.style.background =
        pullPower < POOL_MIN_SHOT_POWER
          ? 'rgba(244,63,94,0.45)'
          : 'linear-gradient(90deg, #10B981 0%, #FACC15 65%, #E11D48 100%)';
    }
    if (powerHandleRef.current) {
      powerHandleRef.current.style.left = `${Math.max(4, Math.min(96, pullPower * 100))}%`;
    }
    if (powerPctRef.current) {
      powerPctRef.current.textContent = `${Math.round(pullPower * 100)}%`;
    }
  }, [pullPower]);

  // Countdown tick only for active online shot clock (zero idle re-renders offline)
  const isOnlinePlaying = !isOffline && activeState?.status === 'playing';
  useEffect(() => {
    if (!isOnlinePlaying) return;
    const iv = window.setInterval(() => setNowTs(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [isOnlinePlaying]);

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

      const finalCall = shot.calledPocketId ?? state.calledPocketId ?? localCalledPocket ?? null;
      const cue = state.balls.find((b) => b.id === 0);
      const shotWithCall: PoolShotInput = {
        ...shot,
        calledPocketId: finalCall,
        cueX: shot.cueX ?? cueGhostRef.current?.x ?? cue?.x,
        cueY: shot.cueY ?? cueGhostRef.current?.y ?? cue?.y,
      };

      if (!isOffline) {
        setPullPower(0);
        setIsPullingPower(false);
        onTakeShotOnline?.(shotWithCall);
        return;
      }

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
      pocketFlashesRef.current = [];
      simAccumulatorRef.current = 0;
      const runtime = createPoolSimRuntime(startState.balls, shotWithCall);
      const startCue = startState.balls.find((b) => b.id === 0);
      const startPullDist = 18 + Math.max(pullPowerRef.current, shotWithCall.power) * 86;

      targetAimAngleRef.current = shotWithCall.angle;
      currentAimAngleRef.current = shotWithCall.angle;
      pendingStrikeRef.current = {
        runtime,
        prevBalls: startState.balls.map((b) => ({ ...b })),
        meta: {
          shot: shotWithCall,
          baseState: startState,
        },
        startedAt: performance.now(),
        durationMs: 78,
        startPullDist,
        angle: shotWithCall.angle,
        power: shotWithCall.power,
        cueX: shotWithCall.cueX ?? startCue?.x ?? POOL_HEAD_STRING_X,
        cueY: shotWithCall.cueY ?? startCue?.y ?? POOL_FOOT_SPOT_Y,
      };

      setPullPower(0);
      setIsPullingPower(false);
      setIsSimulatingUI(true);
    },
    [isOffline, isSimulatingUI, localCalledPocket, onTakeShotOnline]
  );

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
  }, [isOffline, isSimulatingUI, localState, difficulty, fireShot]);

  const prevWinnerRef = useRef<0 | 1 | null>(null);
  useEffect(() => {
    const w = activeState?.winnerSeat ?? null;
    if (w !== null && prevWinnerRef.current === null) {
      playGameSfx('victory', muted);
    }
    prevWinnerRef.current = w;
  }, [activeState?.winnerSeat, muted]);

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
    const tableX = POOL_TABLE_W - (wy - RAIL_PAD);
    const tableY = wx - RAIL_PAD;
    return { x: tableX, y: tableY };
  }, []);

  // 60FPS Physics Accumulator & Canvas Renderer
  usePoolPhysicsLoop({
    canvasRef,
    containerRef,
    simRuntimeRef,
    prevSimBallsRef,
    simMetaRef,
    simAccumulatorRef,
    sinkAnimsRef,
    pocketFlashesRef,
    pendingStrikeRef,
    cueFollowThroughRef,
    targetAimAngleRef,
    currentAimAngleRef,
    isDraggingAimRef,
    pullPowerRef,
    spinRef,
    isPortraitRef,
    transformRef,
    activeStateRef,
    mutedRef,
    cueGhostRef,
    localCalledPocketRef,
    aiThinkingRef,
    onSyncChecksumOnlineRef,
    isOffline,
    currentUserId: currentUser.id,
    setIsSimulatingUI,
    setLocalState,
  });

  const tableDragModeRef = useRef<'none' | 'aim' | 'place_cue'>('none');

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

  const spinDragActiveRef = useRef(false);
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

  const startOfflineWithDifficulty = (nextDiff: PoolDifficulty) => {
    setDifficulty(nextDiff);
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
    pendingStrikeRef.current = null;
    cueFollowThroughRef.current.active = false;
    sinkAnimsRef.current = [];
    pocketFlashesRef.current = [];
    syncPowerBarDom(0);
    setPullPower(0);
    setIsSimulatingUI(false);
    if (isOffline) {
      startOfflineWithDifficulty(difficulty);
    } else {
      onRematchOnline?.();
    }
  };

  if (!activeState) {
    return (
      <PoolEmptySetupCard
        lang={lang}
        isOffline={isOffline}
        difficulty={difficulty}
        onStartOnline={onStartOnline}
      />
    );
  }

  const p0 = activeState.players[0];
  const p1 = activeState.players[1];
  const p0Voice = p0 && !p0.isBot ? voicePeerMap.get(p0.userId) : undefined;
  const p1Voice = p1 && !p1.isBot ? voicePeerMap.get(p1.userId) : undefined;
  const p0Level = p0 && !p0.isBot ? voiceChat?.audioLevels?.[p0.userId] ?? 0 : 0;
  const p1Level = p1 && !p1.isBot ? voiceChat?.audioLevels?.[p1.userId] ?? 0 : 0;
  const p0Speaking = Boolean(
    p0 && !p0.isBot && !p0Voice?.isMuted && (p0Level > 0.06 || voiceChat?.speakingUserIds.includes(p0.userId))
  );
  const p1Speaking = Boolean(
    p1 && !p1.isBot && !p1Voice?.isMuted && (p1Level > 0.06 || voiceChat?.speakingUserIds.includes(p1.userId))
  );
  const turnSecsLeft =
    !isOffline && activeState.status === 'playing' && activeState.turnDeadlineAt > 0
      ? Math.max(0, Math.ceil((activeState.turnDeadlineAt - nowTs) / 1000))
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden select-none">
      <div className="px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-1.5 shrink-0">
        <div
          className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg border transition-all ${
            p0Speaking
              ? 'ring-2 ring-emerald-400 bg-emerald-500/20 border-emerald-400/75 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
              : activeState.status === 'playing' && activeState.turnSeat === 0
              ? 'bg-emerald-500/15 border-emerald-400/55'
              : 'bg-black/25 border-white/[0.06]'
          }`}
        >
          <span className="text-sm shrink-0" aria-hidden="true">{p0?.avatar || '🎱'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] font-bold text-white truncate max-w-[92px] sm:max-w-[140px]">
              <span className="truncate">{p0?.name || 'Jugador 1'}</span>
              {p0 && !p0.isBot && (
                <VoiceSpeakerIndicator
                  inVoice={Boolean(p0Voice)}
                  isSpeaking={p0Speaking}
                  isMuted={Boolean(p0Voice?.isMuted)}
                  audioLevel={p0Level}
                />
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-zinc-300">
              <span>{poolGroupLabel(lang, p0?.group ?? null, activeState.balls)}</span>
              <span className="hidden sm:inline">
                <PoolPocketedChips balls={activeState.balls} group={p0?.group ?? null} />
              </span>
            </div>
          </div>
        </div>

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

        <div
          className={`flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg border transition-all ${
            p1Speaking
              ? 'ring-2 ring-emerald-400 bg-emerald-500/20 border-emerald-400/75 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
              : activeState.status === 'playing' && activeState.turnSeat === 1
              ? 'bg-emerald-500/15 border-emerald-400/55'
              : 'bg-black/25 border-white/[0.06]'
          }`}
        >
          {p1 ? (
            <>
              <div className="min-w-0 text-right">
                <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-white truncate max-w-[92px] sm:max-w-[140px]">
                  {!p1.isBot && (
                    <VoiceSpeakerIndicator
                      inVoice={Boolean(p1Voice)}
                      isSpeaking={p1Speaking}
                      isMuted={Boolean(p1Voice?.isMuted)}
                      audioLevel={p1Level}
                    />
                  )}
                  {p1.isBot && <Bot className="w-3 h-3 text-emerald-400 shrink-0" />}
                  <span className="truncate">{p1.name}</span>
                  {p1.connected === false && (
                    <span className="text-[9px] text-amber-400">(offline)</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-300">
                  <span className="hidden sm:inline">
                    <PoolPocketedChips balls={activeState.balls} group={p1.group} />
                  </span>
                  <span>{poolGroupLabel(lang, p1.group, activeState.balls)}</span>
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

        <PoolTableCanvasOverlays
          lang={lang}
          activeState={activeState}
          isMyTurn={isMyTurn}
          amIOnEightBall={amIOnEightBall}
          effectiveCalledPocket={effectiveCalledPocket}
          mySeatIndex={mySeatIndex}
          isHost={isHost}
          onJoinSeatOnline={onJoinSeatOnline}
          onStartMatchOnline={onStartMatchOnline}
          onRematch={handleRematch}
        />
      </div>

      <PoolShotDock
        lang={lang}
        spinPadRef={spinPadRef}
        powerSliderRef={powerSliderRef}
        powerFillRef={powerFillRef}
        powerHandleRef={powerHandleRef}
        powerPctRef={powerPctRef}
        spinDragActiveRef={spinDragActiveRef}
        spinX={spinX}
        spinY={spinY}
        setSpinX={setSpinX}
        setSpinY={setSpinY}
        updateSpinFromPointer={updateSpinFromPointer}
        pullPower={pullPower}
        isMyTurn={isMyTurn}
        isSimulatingUI={isSimulatingUI}
        isOffline={isOffline}
        mySeatIndex={mySeatIndex}
        isPlayingStatus={activeState.status === 'playing'}
        onPowerPointerDown={handlePowerPointerDown}
        onPowerPointerMove={handlePowerPointerMove}
        onPowerPointerUp={handlePowerPointerUp}
        onPowerPointerCancel={() => {
          setIsPullingPower(false);
          syncPowerBarDom(0);
          setPullPower(0);
        }}
        onRematch={handleRematch}
        onForfeitOnline={onForfeitOnline}
      />
    </div>
  );
};
