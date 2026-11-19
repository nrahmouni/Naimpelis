import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  createInitialPoolState,
  createPoolSimRuntime,
  isOnEightBall,
  isValidCueBallPlacement,
} from '../shared/pool8Ball';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { useGameSoundMute } from './games/GameEffects';
import { unlockPoolAudio } from './games/poolAudio';
import type {
  PendingStrikeShot,
  PocketFlashAnim,
  SinkAnim,
} from './games/poolCanvasRenderer';
import { PoolShotDock } from './games/PoolShotDock';
import { PoolStageHeader } from './games/PoolStageHeader';
import {
  PoolEmptySetupCard,
  PoolTableCanvasOverlays,
} from './games/PoolTableOverlays';
import { usePoolInputHandlers } from './games/usePoolInputHandlers';
import { usePoolMatchEffects } from './games/usePoolMatchEffects';
import {
  usePoolPhysicsLoop,
  type PoolCanvasTransform,
  type PoolSimMeta,
} from './games/usePoolPhysicsLoop';

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

  const isOnlinePlaying = !isOffline && activeState?.status === 'playing';

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

  usePoolMatchEffects({
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
  });

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

  const {
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
  } = usePoolInputHandlers({
    lang,
    currentUser,
    activeState,
    difficulty,
    isOffline,
    isMyTurn,
    isSimulatingUI,
    amIOnEightBall,
    muted,
    pullPower,
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
  });

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

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden select-none">
      <PoolStageHeader
        lang={lang}
        activeState={activeState}
        isOffline={isOffline}
        difficulty={difficulty}
        voiceChat={voiceChat}
        voicePeerMap={voicePeerMap}
        aiThinking={aiThinking}
        shotErrorMsg={shotErrorMsg}
        nowTs={nowTs}
        onChangeDifficulty={startOfflineWithDifficulty}
        onJoinSeatOnline={onJoinSeatOnline}
      />

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
