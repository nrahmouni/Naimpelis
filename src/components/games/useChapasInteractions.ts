import { useCallback } from 'react';
import type React from 'react';
import type {
  ChapasCap,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  FutbolChapasState,
  Participant,
} from '../../types';
import {
  CHAPAS_ARENA_H,
  CHAPAS_ARENA_W,
  CHAPAS_CAP_RADIUS,
  CHAPAS_MIN_POWER,
  CHAPAS_TEAM_PRESETS,
  createInitialChapasState,
  joinChapasSeat,
  orientChapasArenaPoint,
  startChapasMatch,
  toggleChapasBots,
  updateChapasTeamFlag,
} from '../../shared/futbolChapas';
import { socketService } from '../../services/socket';
import { triggerHaptic } from '../../utils/haptics';
import type { ImpactParticle } from './chapasRenderer';
import type { ActiveChapasPlayback } from './useChapasOnlineAndBot';

export interface ChapasAimDragState {
  capId: string;
  pointerId: number;
  angle: number;
  power: number;
}

export function stepChapasParticles(particles: ImpactParticle[]): ImpactParticle[] {
  const nextP: ImpactParticle[] = [];
  for (const p of particles) {
    if (p.kind === 'ring') {
      p.r += 2.2;
      p.alpha -= 0.055;
      if (p.alpha > 0.04 && (!p.maxR || p.r < p.maxR)) nextP.push(p);
    } else {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.alpha -= 0.045;
      if (p.alpha > 0.04) nextP.push(p);
    }
  }
  return nextP;
}

export function spawnChapasBurst(
  particlesRef: React.MutableRefObject<ImpactParticle[]>,
  x: number,
  y: number,
  count: number,
  palette: string[]
): void {
  for (let i = 0; i < count; i += 1) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.4 + Math.random() * 3.8;
    particlesRef.current.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: 1.8 + Math.random() * 2.4,
      alpha: 0.95,
      color: palette[i % palette.length],
      kind: 'spark',
    });
  }
}

interface UseChapasInteractionsArgs {
  currentUser: Participant;
  isOffline: boolean;
  activeState: FutbolChapasState | null;
  activeStateRef: React.MutableRefObject<FutbolChapasState | null>;
  isFlippedViewRef: React.MutableRefObject<boolean>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  transformRef: React.MutableRefObject<{ scale: number; offsetX: number; offsetY: number }>;
  playbackRef: React.MutableRefObject<ActiveChapasPlayback | null>;
  aimDragRef: React.MutableRefObject<ChapasAimDragState | null>;
  particlesRef: React.MutableRefObject<ImpactParticle[]>;
  setLocalState: React.Dispatch<React.SetStateAction<FutbolChapasState>>;
  setIsSimulatingUI: React.Dispatch<React.SetStateAction<boolean>>;
  setGoalBanner: React.Dispatch<
    React.SetStateAction<{ team: ChapasTeamId; flag: ChapasFlagId } | null>
  >;
  setEmojiMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  executeShot: (shot: ChapasShotInput, userId: string) => void;
  triggerFloatingReactionToast: (emoji: string, senderName?: string) => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 2 | 3 | 'spectate') => void;
  onUpdateTeamOnline?: (team: ChapasTeamId, flag: ChapasFlagId) => void;
  onToggleBotsOnline?: (botsEnabled: boolean) => void;
  onStartMatchOnline?: () => void;
  onRematchOnline?: () => void;
}

export function useChapasInteractions({
  currentUser,
  isOffline,
  activeState,
  activeStateRef,
  isFlippedViewRef,
  canvasRef,
  transformRef,
  playbackRef,
  aimDragRef,
  particlesRef,
  setLocalState,
  setIsSimulatingUI,
  setGoalBanner,
  setEmojiMenuOpen,
  executeShot,
  triggerFloatingReactionToast,
  onJoinSeatOnline,
  onUpdateTeamOnline,
  onToggleBotsOnline,
  onStartMatchOnline,
  onRematchOnline,
}: UseChapasInteractionsArgs) {
  const screenToArena = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: CHAPAS_ARENA_W / 2, y: CHAPAS_ARENA_H / 2 };
      const r = canvas.getBoundingClientRect();
      const tr = transformRef.current;
      const rawX = (clientX - r.left - tr.offsetX) / Math.max(0.1, tr.scale);
      const rawY = (clientY - r.top - tr.offsetY) / Math.max(0.1, tr.scale);
      return orientChapasArenaPoint(rawX, rawY, isFlippedViewRef.current);
    },
    [canvasRef, transformRef, isFlippedViewRef]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = activeStateRef.current;
    if (!st || st.status !== 'playing' || playbackRef.current) return;
    const seat = st.players[st.activeSeatIndex];
    if (!seat || seat.isBot || seat.userId !== currentUser.id) return;

    const pt = screenToArena(e.clientX, e.clientY);
    let hitCap: ChapasCap | null = null;
    let bestDist = CHAPAS_CAP_RADIUS * 1.52;
    for (const c of st.caps) {
      if (c.team !== st.activeTeam) continue;
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d <= bestDist) {
        bestDist = d;
        hitCap = c;
      }
    }
    if (!hitCap) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    aimDragRef.current = {
      capId: hitCap.id,
      pointerId: e.pointerId,
      angle: 0,
      power: 0,
    };
    triggerHaptic('light');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = aimDragRef.current;
    const st = activeStateRef.current;
    if (!drag || !st || drag.pointerId !== e.pointerId) return;
    const cap = st.caps.find((c) => c.id === drag.capId);
    if (!cap) return;

    const pt = screenToArena(e.clientX, e.clientY);
    const dx = cap.x - pt.x;
    const dy = cap.y - pt.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      drag.power = 0;
      return;
    }
    drag.angle = Math.atan2(dy, dx);
    drag.power = Math.min(1, dist / 118);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = aimDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    aimDragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag.power >= CHAPAS_MIN_POWER) {
      triggerHaptic('medium');
      executeShot({ capId: drag.capId, angle: drag.angle, power: drag.power }, currentUser.id);
    }
  };

  const handleJoinSeat = (idx: 0 | 1 | 2 | 3 | 'spectate') => {
    triggerHaptic('light');
    if (isOffline) {
      setLocalState((curr) => {
        const res = joinChapasSeat(
          curr,
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            color: currentUser.color || '#9146FF',
          },
          idx
        );
        return res.ok ? res.state : curr;
      });
    } else {
      onJoinSeatOnline?.(idx);
    }
  };

  const handleCycleTeamFlag = (team: ChapasTeamId) => {
    if (!activeState) return;
    triggerHaptic('light');
    const curFlag = activeState.teamFlags[team];
    const idx = CHAPAS_TEAM_PRESETS.findIndex((f) => f.id === curFlag);
    const nextFlag = CHAPAS_TEAM_PRESETS[(idx + 1) % CHAPAS_TEAM_PRESETS.length].id;
    if (isOffline) {
      setLocalState((curr) => updateChapasTeamFlag(curr, team, nextFlag));
    } else {
      onUpdateTeamOnline?.(team, nextFlag);
    }
  };

  const handleToggleBots = () => {
    if (!activeState) return;
    triggerHaptic('light');
    const nextBots = !activeState.botsEnabled;
    if (isOffline) {
      setLocalState((curr) => toggleChapasBots(curr, nextBots));
    } else {
      onToggleBotsOnline?.(nextBots);
    }
  };

  const handleStartMatch = () => {
    triggerHaptic('success');
    if (isOffline) {
      setLocalState((curr) => {
        const res = startChapasMatch(curr);
        return res.ok ? res.state : curr;
      });
    } else {
      onStartMatchOnline?.();
    }
  };

  const handleRematch = () => {
    triggerHaptic('medium');
    playbackRef.current = null;
    particlesRef.current = [];
    setIsSimulatingUI(false);
    setGoalBanner(null);
    if (isOffline) {
      setLocalState((curr) =>
        createInitialChapasState(
          [
            {
              id: currentUser.id,
              name: currentUser.name,
              avatar: currentUser.avatar,
              color: currentUser.color || '#9146FF',
            },
          ],
          { waitForHost: false, botsEnabled: true, teamFlags: curr.teamFlags }
        )
      );
    } else {
      onRematchOnline?.();
    }
  };

  const sendQuickReaction = (emoji: string) => {
    setEmojiMenuOpen(false);
    triggerHaptic('light');
    triggerFloatingReactionToast(emoji, currentUser.name);
    if (!isOffline) {
      socketService.sendReaction(currentUser, emoji);
    }
  };

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleJoinSeat,
    handleCycleTeamFlag,
    handleToggleBots,
    handleStartMatch,
    handleRematch,
    sendQuickReaction,
  };
}
