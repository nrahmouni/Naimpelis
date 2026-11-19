import type React from 'react';
import { useEffect, useRef } from 'react';
import type {
  Pool8BallState,
  PoolBallState,
  PoolPocketId,
  PoolShotInput,
  PoolSimRuntime,
} from '../../types';
import {
  POOL_BALL_R,
  POOL_FIXED_DT,
  POOL_MAX_FRAME_DT,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
  computePoolChecksum,
  resolvePoolShotOutcome,
  stepPoolPhysicsSubstep,
  isPoolRuntimeMoving,
} from '../../shared/pool8Ball';
import {
  playPoolClack,
  playPoolCueStrike,
  playPoolCushion,
  playPoolFoul,
  playPoolPocketDrop,
} from './poolAudio';
import {
  RAIL_PAD,
  buildStaticTableCache,
  createBallShadeSprite,
  createBallShadowSprite,
  drawPoolDynamicOverlay,
  type PendingStrikeShot,
  type PocketFlashAnim,
  type SinkAnim,
} from './poolCanvasRenderer';

function normalizeAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function vibratePoolShot(power: number): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const ms = Math.round(12 + Math.max(0, Math.min(1, power)) * 42);
      navigator.vibrate(ms);
    }
  } catch {
    // Fail silently on unsupported devices
  }
}

export interface PoolSimMeta {
  shot: PoolShotInput;
  baseState: Pool8BallState;
  authoritativeState?: Pool8BallState;
  expectedChecksum?: number;
}

export interface PoolCanvasTransform {
  cssW: number;
  cssH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  portrait: boolean;
}

interface UsePoolPhysicsLoopParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  simRuntimeRef: React.MutableRefObject<PoolSimRuntime | null>;
  prevSimBallsRef: React.MutableRefObject<PoolBallState[] | null>;
  simMetaRef: React.MutableRefObject<PoolSimMeta | null>;
  simAccumulatorRef: React.MutableRefObject<number>;
  sinkAnimsRef: React.MutableRefObject<SinkAnim[]>;
  pocketFlashesRef: React.MutableRefObject<PocketFlashAnim[]>;
  pendingStrikeRef: React.MutableRefObject<PendingStrikeShot | null>;
  cueFollowThroughRef: React.MutableRefObject<{
    active: boolean;
    startedAt: number;
    angle: number;
    cueX: number;
    cueY: number;
  }>;
  targetAimAngleRef: React.MutableRefObject<number>;
  currentAimAngleRef: React.MutableRefObject<number>;
  isDraggingAimRef: React.MutableRefObject<boolean>;
  pullPowerRef: React.MutableRefObject<number>;
  spinRef: React.MutableRefObject<{ x: number; y: number }>;
  isPortraitRef: React.MutableRefObject<boolean>;
  transformRef: React.MutableRefObject<PoolCanvasTransform>;
  activeStateRef: React.MutableRefObject<Pool8BallState | null>;
  mutedRef: React.MutableRefObject<boolean>;
  cueGhostRef: React.MutableRefObject<{ x: number; y: number; valid: boolean } | null>;
  localCalledPocketRef: React.MutableRefObject<PoolPocketId | null>;
  aiThinkingRef: React.MutableRefObject<boolean>;
  onSyncChecksumOnlineRef: React.MutableRefObject<((turnNumber: number, checksum: number) => void) | undefined>;
  isOffline: boolean;
  currentUserId: string;
  setIsSimulatingUI: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalState: React.Dispatch<React.SetStateAction<Pool8BallState>>;
}

export function usePoolPhysicsLoop({
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
  currentUserId,
  setIsSimulatingUI,
  setLocalState,
}: UsePoolPhysicsLoopParams): void {
  const feltPatternRef = useRef<CanvasPattern | null>(null);
  const tableCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const ballShadeSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const ballShadowSpriteRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    if (!ballShadeSpriteRef.current) {
      ballShadeSpriteRef.current = createBallShadeSprite();
    }
    if (!ballShadowSpriteRef.current) {
      ballShadowSpriteRef.current = createBallShadowSprite();
    }

    const tick = (now: number) => {
      const dt = Math.min(POOL_MAX_FRAME_DT, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (!isDraggingAimRef.current) {
        const angleDiff = normalizeAngleDelta(currentAimAngleRef.current, targetAimAngleRef.current);
        if (Math.abs(angleDiff) > 0.0004) {
          currentAimAngleRef.current += angleDiff * Math.min(1, dt * 18);
        } else {
          currentAimAngleRef.current = targetAimAngleRef.current;
        }
      }

      let strikeCuePullDist: number | null = null;
      const pending = pendingStrikeRef.current;
      if (pending) {
        const elapsed = now - pending.startedAt;
        if (elapsed >= pending.durationMs) {
          pendingStrikeRef.current = null;
          simRuntimeRef.current = pending.runtime;
          prevSimBallsRef.current = pending.prevBalls;
          simMetaRef.current = pending.meta;
          cueFollowThroughRef.current = {
            active: true,
            startedAt: now,
            angle: pending.angle,
            cueX: pending.cueX,
            cueY: pending.cueY,
          };
          playPoolCueStrike(pending.power, mutedRef.current);
          vibratePoolShot(pending.power);
        } else {
          const p = Math.max(0, Math.min(1, elapsed / pending.durationMs));
          const easeIn = p * p * p;
          strikeCuePullDist = pending.startPullDist + (POOL_BALL_R - pending.startPullDist) * easeIn;
        }
      }

      let renderBalls: PoolBallState[] | null = null;
      const runtime = simRuntimeRef.current;

      if (runtime) {
        simAccumulatorRef.current += dt;
        let subSteps = 0;
        let finishedThisFrame = false;

        while (simAccumulatorRef.current >= POOL_FIXED_DT && subSteps < 10) {
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
              const pocket = POOL_POCKETS.find((pk) => pk.id === ev.pocketId);
              sinkAnimsRef.current.push({
                ballId: ev.ballA,
                startX: b ? b.x : ev.x,
                startY: b ? b.y : ev.y,
                pocketX: ev.x,
                pocketY: ev.y,
                rollAngle: b ? b.rollAngle : 0,
                rollPhase: b ? b.rollPhase : 0,
                startedAt: now,
              });
              pocketFlashesRef.current.push({
                x: ev.x,
                y: ev.y,
                r: pocket ? pocket.captureR : 24,
                startedAt: now,
              });
            }
          }

          if (!isPoolRuntimeMoving(runtime)) {
            finishedThisFrame = true;
            break;
          }
        }

        if (subSteps >= 10 && simAccumulatorRef.current > POOL_FIXED_DT * 2) {
          simAccumulatorRef.current = POOL_FIXED_DT;
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
              onSyncChecksumOnlineRef.current?.(meta.authoritativeState.turnNumber, localSum);
            }
          }
        } else if (prevSimBallsRef.current) {
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

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        const cssW = Math.max(220, Math.floor(rect.width));
        const cssH = Math.max(180, Math.floor(rect.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);

        if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
          canvas.width = Math.floor(cssW * dpr);
          canvas.height = Math.floor(cssH * dpr);
        }

        const portrait = cssH > cssW * 1.05;
        isPortraitRef.current = portrait;
        const canonicalTotalW = (portrait ? POOL_TABLE_H : POOL_TABLE_W) + RAIL_PAD * 2;
        const canonicalTotalH = (portrait ? POOL_TABLE_W : POOL_TABLE_H) + RAIL_PAD * 2;
        const scale = Math.min(cssW / canonicalTotalW, cssH / canonicalTotalH);
        const offsetX = (cssW - canonicalTotalW * scale) * 0.5;
        const offsetY = (cssH - canonicalTotalH * scale) * 0.5;

        transformRef.current = { cssW, cssH, scale, offsetX, offsetY, portrait };

        const cacheKey = `${cssW}x${cssH}@${dpr}:${portrait ? 1 : 0}`;
        if (!tableCacheRef.current || tableCacheRef.current.key !== cacheKey) {
          tableCacheRef.current = {
            key: cacheKey,
            canvas: buildStaticTableCache(
              cssW,
              cssH,
              dpr,
              scale,
              offsetX,
              offsetY,
              portrait,
              feltPatternRef
            ),
          };
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.drawImage(tableCacheRef.current.canvas, 0, 0);

          ctx.scale(dpr, dpr);
          ctx.translate(offsetX, offsetY);
          ctx.scale(scale, scale);

          if (portrait) {
            ctx.translate(0, POOL_TABLE_W + RAIL_PAD * 2);
            ctx.rotate(-Math.PI / 2);
          }

          ctx.translate(RAIL_PAD, RAIL_PAD);

          drawPoolDynamicOverlay({
            ctx,
            now,
            scale,
            portrait,
            state: activeStateRef.current,
            renderBalls,
            isSimulating: Boolean(simRuntimeRef.current),
            isOffline,
            currentUserId,
            aiThinking: aiThinkingRef.current,
            calledPocket:
              activeStateRef.current?.calledPocketId || localCalledPocketRef.current,
            cueGhost: cueGhostRef.current,
            spin: spinRef.current,
            currentAimAngle: currentAimAngleRef.current,
            pullPower: pullPowerRef.current,
            strikeCuePullDist,
            pendingStrike: pendingStrikeRef.current,
            cueFollowThrough: cueFollowThroughRef.current,
            pocketFlashesRef,
            sinkAnimsRef,
            shadowSprite: ballShadowSpriteRef.current,
            shadeSprite: ballShadeSpriteRef.current,
          });

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOffline, currentUserId]);
}
