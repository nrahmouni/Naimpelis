import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type {
  ChapasCap,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  FutbolChapasState,
  Participant,
} from '../../types';
import {
  type ChapasBall,
  CHAPAS_CAP_RADIUS,
  CHAPAS_MAX_SHOT_SPEED,
  CHAPAS_MIN_POWER,
  chooseChapasAiShot,
  createInitialChapasState,
  shootChapasCap,
} from '../../shared/futbolChapas';
import { socketService } from '../../services/socket';
import { playGameSfx } from './GameEffects';
import type { ImpactParticle } from './chapasRenderer';

export interface ActiveChapasPlayback {
  caps: ChapasCap[];
  ball: ChapasBall;
  frameCount: number;
  authoritativeState: FutbolChapasState;
  goalBannerShown: boolean;
  ballTrail: Array<{ x: number; y: number }>;
}

interface UseChapasOnlineAndBotParams {
  currentUser: Participant;
  isOffline: boolean;
  localState: FutbolChapasState;
  activeState: FutbolChapasState | null;
  activeStateRef: React.MutableRefObject<FutbolChapasState | null>;
  muted: boolean;
  mutedRef: React.MutableRefObject<boolean>;
  isOfflineRef: React.MutableRefObject<boolean>;
  playbackRef: React.MutableRefObject<ActiveChapasPlayback | null>;
  particlesRef: React.MutableRefObject<ImpactParticle[]>;
  isSimulatingUI: boolean;
  setLocalState: React.Dispatch<React.SetStateAction<FutbolChapasState>>;
  setIsSimulatingUI: React.Dispatch<React.SetStateAction<boolean>>;
  setGoalBanner: React.Dispatch<React.SetStateAction<{ team: ChapasTeamId; flag: ChapasFlagId } | null>>;
  setNowTs: React.Dispatch<React.SetStateAction<number>>;
  setFloatingReaction: React.Dispatch<React.SetStateAction<{ emoji: string; senderName?: string; id: number } | null>>;
  onShootOnline?: (shot: ChapasShotInput) => void;
}

export function useChapasOnlineAndBot({
  currentUser,
  isOffline,
  localState,
  activeState,
  activeStateRef,
  muted,
  mutedRef,
  isOfflineRef,
  playbackRef,
  particlesRef,
  isSimulatingUI,
  setLocalState,
  setIsSimulatingUI,
  setGoalBanner,
  setNowTs,
  setFloatingReaction,
  onShootOnline,
}: UseChapasOnlineAndBotParams) {
  const reactionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOffline) return;
    playbackRef.current = null;
    particlesRef.current = [];
    setIsSimulatingUI(false);
    setGoalBanner(null);
    setLocalState(
      createInitialChapasState(
        [
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            color: currentUser.color,
          },
        ],
        { waitForHost: false, botsEnabled: true }
      )
    );
  }, [isOffline, currentUser.id, currentUser.name, currentUser.avatar, currentUser.color]);

  useEffect(() => {
    if (!activeState || activeState.status !== 'playing') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [activeState?.status, activeState?.turnDeadlineAt]);

  const triggerFloatingReactionToast = useCallback(
    (emoji: string, senderName?: string) => {
      if (reactionTimerRef.current) {
        window.clearTimeout(reactionTimerRef.current);
      }
      setFloatingReaction({ emoji, senderName, id: Date.now() });
      reactionTimerRef.current = window.setTimeout(() => {
        setFloatingReaction(null);
        reactionTimerRef.current = null;
      }, 1700);
    },
    [setFloatingReaction]
  );

  useEffect(() => {
    return () => {
      if (reactionTimerRef.current) {
        window.clearTimeout(reactionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOffline) return;
    const unsub = socketService.subscribe((evt) => {
      if (evt.type === 'FLOATING_REACTION' && evt.payload?.emoji) {
        triggerFloatingReactionToast(
          String(evt.payload.emoji),
          typeof evt.payload.senderName === 'string' ? evt.payload.senderName : undefined
        );
      }
      if (evt.type !== 'CHAPAS_SHOT_BROADCAST') return;
      const payload = evt.payload;
      const preShot = payload?.preShotState as FutbolChapasState | undefined;
      const authState = payload?.authoritativeState as FutbolChapasState | undefined;
      const shot = payload?.shot as (ChapasShotInput & { shooterUserId?: string }) | undefined;
      if (!authState || !shot) return;

      const baseCaps = (preShot?.caps || activeStateRef.current?.caps || authState.caps).map((c) => ({
        ...c,
        vx: 0,
        vy: 0,
      }));
      const baseBall: ChapasBall = {
        ...(preShot?.ball || activeStateRef.current?.ball || authState.ball),
        vx: 0,
        vy: 0,
      };

      const shooterCap = baseCaps.find((c) => c.id === shot.capId);
      if (shooterCap) {
        const spd = Math.max(CHAPAS_MIN_POWER, Math.min(1, shot.power)) * CHAPAS_MAX_SHOT_SPEED;
        shooterCap.vx = Math.cos(shot.angle) * spd;
        shooterCap.vy = Math.sin(shot.angle) * spd;
        particlesRef.current.push({
          x: shooterCap.x,
          y: shooterCap.y,
          vx: 0,
          vy: 0,
          r: CHAPAS_CAP_RADIUS * 0.85,
          maxR: CHAPAS_CAP_RADIUS * 2.1,
          alpha: 0.65,
          color: '#FFFFFF',
          kind: 'ring',
        });
      }

      playGameSfx('board_move', mutedRef.current);
      playbackRef.current = {
        caps: baseCaps,
        ball: baseBall,
        frameCount: 0,
        authoritativeState: authState,
        goalBannerShown: false,
        ballTrail: [],
      };
      setIsSimulatingUI(true);
    });
    return unsub;
  }, [isOffline, triggerFloatingReactionToast]);

  const executeShot = useCallback(
    (shot: ChapasShotInput, actorId: string) => {
      const curr = activeStateRef.current;
      if (!curr || curr.status !== 'playing' || playbackRef.current) return;

      if (!isOfflineRef.current) {
        onShootOnline?.(shot);
        return;
      }

      const simResult = shootChapasCap(curr, actorId, shot);
      if (!simResult.ok) return;

      const startCaps = curr.caps.map((c) => ({ ...c, vx: 0, vy: 0 }));
      const startBall: ChapasBall = { ...curr.ball, vx: 0, vy: 0 };
      const targetCap = startCaps.find((c) => c.id === shot.capId);
      if (targetCap) {
        const spd = Math.max(CHAPAS_MIN_POWER, Math.min(1, shot.power)) * CHAPAS_MAX_SHOT_SPEED;
        targetCap.vx = Math.cos(shot.angle) * spd;
        targetCap.vy = Math.sin(shot.angle) * spd;
        particlesRef.current.push({
          x: targetCap.x,
          y: targetCap.y,
          vx: 0,
          vy: 0,
          r: CHAPAS_CAP_RADIUS * 0.85,
          maxR: CHAPAS_CAP_RADIUS * 2.1,
          alpha: 0.65,
          color: '#FFFFFF',
          kind: 'ring',
        });
      }

      playGameSfx('board_move', mutedRef.current);
      playbackRef.current = {
        caps: startCaps,
        ball: startBall,
        frameCount: 0,
        authoritativeState: simResult.state,
        goalBannerShown: false,
        ballTrail: [],
      };
      setIsSimulatingUI(true);
    },
    [onShootOnline]
  );

  useEffect(() => {
    if (!isOffline || isSimulatingUI || localState.status !== 'playing') return;
    const seat = localState.players[localState.activeSeatIndex];
    if (!seat?.isBot) return;

    const timer = window.setTimeout(() => {
      const aiShot = chooseChapasAiShot(localState);
      if (aiShot) {
        executeShot(aiShot, seat.userId);
      }
    }, 680);

    return () => window.clearTimeout(timer);
  }, [isOffline, isSimulatingUI, localState, executeShot]);

  const prevWinnerRef = useRef<ChapasTeamId | null>(null);
  useEffect(() => {
    const w = activeState?.winnerTeam ?? null;
    if (w !== null && prevWinnerRef.current === null) {
      playGameSfx('victory', muted);
    }
    prevWinnerRef.current = w;
  }, [activeState?.winnerTeam, muted]);

  return {
    executeShot,
    triggerFloatingReactionToast,
  };
}
