import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Flag,
  Play,
  RotateCcw,
  Shield,
  Smile,
  Users,
} from 'lucide-react';
import type {
  AppLanguage,
  ChapasCap,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  FutbolChapasState,
  Participant,
} from '../types';
import {
  type ChapasBall,
  CHAPAS_ARENA_H,
  CHAPAS_ARENA_W,
  CHAPAS_BALL_RADIUS,
  CHAPAS_CAP_RADIUS,
  CHAPAS_GOAL_DEPTH,
  CHAPAS_GOAL_LEFT,
  CHAPAS_GOAL_RIGHT,
  CHAPAS_MAX_SHOT_SPEED,
  CHAPAS_MAX_SIM_FRAMES,
  CHAPAS_MIN_POWER,
  CHAPAS_PITCH_BOTTOM,
  CHAPAS_PITCH_H,
  CHAPAS_PITCH_LEFT,
  CHAPAS_PITCH_RIGHT,
  CHAPAS_PITCH_TOP,
  CHAPAS_PITCH_W,
  CHAPAS_TEAM_PRESETS,
  CHAPAS_TURN_TIMEOUT_MS,
  chooseChapasAiShot,
  createInitialChapasState,
  joinChapasSeat,
  shootChapasCap,
  startChapasMatch,
  stepChapasPhysicsFrame,
  toggleChapasBots,
  updateChapasTeamFlag,
} from '../shared/futbolChapas';
import { socketService } from '../services/socket';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './games/GameVoiceBar';
import { VictoryCelebrationOverlay, playGameSfx, useGameSoundMute } from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export interface FutbolChapasStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  chapasState: FutbolChapasState | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: () => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 2 | 3 | 'spectate') => void;
  onUpdateTeamOnline?: (team: ChapasTeamId, flag: ChapasFlagId) => void;
  onToggleBotsOnline?: (botsEnabled: boolean) => void;
  onStartMatchOnline?: () => void;
  onShootOnline?: (shot: ChapasShotInput) => void;
  onForfeitOnline?: () => void;
  onRematchOnline?: () => void;
}

interface ActiveSimPlayback {
  caps: ChapasCap[];
  ball: ChapasBall;
  frameCount: number;
  authoritativeState: FutbolChapasState;
  goalBannerShown: boolean;
  ballTrail: Array<{ x: number; y: number }>;
}

interface AimDragState {
  capId: string;
  pointerId: number;
  angle: number;
  power: number;
}

interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  maxR?: number;
  alpha: number;
  color: string;
  kind: 'spark' | 'ring';
}

interface CrowdSpectator {
  x: number;
  y: number;
  color: string;
  phase: number;
}

const CROWD_PALETTE = [
  '#EF4444',
  '#F59E0B',
  '#38BDF8',
  '#FFFFFF',
  '#10B981',
  '#F472B6',
  '#FACC15',
  '#3B82F6',
  '#E5E7EB',
];

const QUICK_EMOJIS = ['⚽', '🔥', '👏', '😂', '😱', '🏆'];

function buildGrandstandCrowd(): CrowdSpectator[] {
  const specs: CrowdSpectator[] = [];
  const rows = 4;
  const cols = 44;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let side = 0; side < 2; side += 1) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const baseX = side === 0 ? 11 + r * 8.4 : CHAPAS_ARENA_W - 11 - r * 8.4;
        const t = c / (cols - 1);
        const yMin = 122 + r * 4;
        const yMax = CHAPAS_ARENA_H - 122 - r * 4;
        const y = yMin + t * (yMax - yMin) + (rand() - 0.5) * 3.2;
        const x = baseX + (rand() - 0.5) * 2.4;
        specs.push({
          x,
          y,
          color: CROWD_PALETTE[Math.floor(rand() * CROWD_PALETTE.length)],
          phase: rand() * Math.PI * 2,
        });
      }
    }
  }
  return specs;
}

const GRANDSTAND_CROWD = buildGrandstandCrowd();

/**
 * Draws a classic 21-tooth crimped metallic bottle-cap ("chapa") outer crown path.
 */
function traceBottleCapCrownPath(
  ctx: CanvasRenderingContext2D,
  outerR: number,
  innerR: number,
  teeth = 21
): void {
  const steps = teeth * 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i * Math.PI) / teeth;
    const rad = i % 2 === 0 ? outerR : innerR;
    const px = Math.cos(angle) * rad;
    const py = Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawFlagEmblem(
  ctx: CanvasRenderingContext2D,
  flag: ChapasFlagId,
  r: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  if (flag === 'ar') {
    ctx.fillStyle = '#6FAEE3';
    ctx.fillRect(-r, -r, r * 2, r * 0.67);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r, -r * 0.33, r * 2, r * 0.66);
    ctx.fillStyle = '#6FAEE3';
    ctx.fillRect(-r, r * 0.33, r * 2, r * 0.67);
    ctx.fillStyle = '#F6B40E';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.23, 0, Math.PI * 2);
    ctx.fill();
  } else if (flag === 'es') {
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(-r, -r, r * 2, r * 0.52);
    ctx.fillStyle = '#FFC400';
    ctx.fillRect(-r, -r * 0.48, r * 2, r * 0.96);
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(-r, r * 0.48, r * 2, r * 0.52);
    ctx.fillStyle = '#AD1519';
    ctx.fillRect(-r * 0.36, -r * 0.22, r * 0.28, r * 0.42);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-r * 0.34, -r * 0.3, r * 0.24, r * 0.1);
  } else if (flag === 'br') {
    ctx.fillStyle = '#009C3B';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = '#FFDF00';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.72);
    ctx.lineTo(r * 0.78, 0);
    ctx.lineTo(0, r * 0.72);
    ctx.lineTo(-r * 0.78, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#002776';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 0.38, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  } else if (flag === 'fr') {
    ctx.fillStyle = '#002395';
    ctx.fillRect(-r, -r, r * 0.67, r * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.33, -r, r * 0.66, r * 2);
    ctx.fillStyle = '#ED2939';
    ctx.fillRect(r * 0.33, -r, r * 0.67, r * 2);
  } else if (flag === 'ma') {
    ctx.fillStyle = '#C1272D';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = '#006233';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const idx = (i * 2) % 5;
      const ang = -Math.PI / 2 + (idx * 2 * Math.PI) / 5;
      const px = Math.cos(ang) * r * 0.44;
      const py = Math.sin(ang) * r * 0.44;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (flag === 'pt') {
    ctx.fillStyle = '#046A38';
    ctx.fillRect(-r, -r, r * 0.85, r * 2);
    ctx.fillStyle = '#DA291C';
    ctx.fillRect(-r * 0.15, -r, r * 1.15, r * 2);
    ctx.fillStyle = '#FFE900';
    ctx.beginPath();
    ctx.arc(-r * 0.15, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.25, -r * 0.15, r * 0.2, r * 0.3);
  } else if (flag === 'it') {
    ctx.fillStyle = '#009246';
    ctx.fillRect(-r, -r, r * 0.67, r * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-r * 0.33, -r, r * 0.66, r * 2);
    ctx.fillStyle = '#CE2B37';
    ctx.fillRect(r * 0.33, -r, r * 0.67, r * 2);
  } else {
    ctx.fillStyle = '#111111';
    ctx.fillRect(-r, -r, r * 2, r * 0.67);
    ctx.fillStyle = '#DD0000';
    ctx.fillRect(-r, -r * 0.33, r * 2, r * 0.66);
    ctx.fillStyle = '#FFCE00';
    ctx.fillRect(-r, r * 0.33, r * 2, r * 0.67);
  }

  ctx.restore();
}

export const FutbolChapasStage: React.FC<FutbolChapasStageProps> = ({
  lang,
  currentUser,
  chapasState,
  isOffline = false,
  isHost = false,
  voiceChat,
  mutedOverride,
  onStartOnline,
  onJoinSeatOnline,
  onUpdateTeamOnline,
  onToggleBotsOnline,
  onStartMatchOnline,
  onShootOnline,
  onForfeitOnline,
  onRematchOnline,
}) => {
  const [localState, setLocalState] = useState<FutbolChapasState>(() =>
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
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [isSimulatingUI, setIsSimulatingUI] = useState(false);
  const [goalBanner, setGoalBanner] = useState<{ team: ChapasTeamId; flag: ChapasFlagId } | null>(null);
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false);
  const [floatingReaction, setFloatingReaction] = useState<{ emoji: string; id: number } | null>(null);
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playbackRef = useRef<ActiveSimPlayback | null>(null);
  const aimDragRef = useRef<AimDragState | null>(null);
  const particlesRef = useRef<ImpactParticle[]>([]);
  const transformRef = useRef<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const activeState = isOffline ? localState : chapasState;
  const activeStateRef = useRef<FutbolChapasState | null>(activeState);
  activeStateRef.current = activeState;
  const mutedRef = useRef<boolean>(muted);
  mutedRef.current = muted;
  const isOfflineRef = useRef<boolean>(isOffline);
  isOfflineRef.current = isOffline;

  // Reset local state whenever entering offline mode
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

  // Turn countdown tick
  useEffect(() => {
    if (!activeState || activeState.status !== 'playing') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [activeState?.status, activeState?.turnDeadlineAt]);

  // Listen to online CHAPAS_SHOT_BROADCAST for 60fps smooth replay
  useEffect(() => {
    if (isOffline) return;
    const unsub = socketService.subscribe((evt) => {
      if (evt.type === 'REACTION' && evt.payload?.emoji) {
        setFloatingReaction({ emoji: String(evt.payload.emoji), id: Date.now() });
        window.setTimeout(() => setFloatingReaction(null), 1600);
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
  }, [isOffline]);

  const mySeats = useMemo(() => {
    if (!activeState) return [];
    return activeState.players.filter((p): p is NonNullable<typeof p> =>
      Boolean(p && !p.isBot && p.userId === currentUser.id)
    );
  }, [activeState, currentUser.id]);

  const activeSeat = activeState ? activeState.players[activeState.activeSeatIndex] : null;
  const isMyTurn = Boolean(
    activeState &&
      activeState.status === 'playing' &&
      !isSimulatingUI &&
      activeSeat &&
      !activeSeat.isBot &&
      activeSeat.userId === currentUser.id
  );

  // Execute shot (offline smooth animation OR online dispatch)
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

  // Offline AI Bot turn scheduler
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

  // Sound effect on victory
  const prevWinnerRef = useRef<ChapasTeamId | null>(null);
  useEffect(() => {
    const w = activeState?.winnerTeam ?? null;
    if (w !== null && prevWinnerRef.current === null) {
      playGameSfx('victory', muted);
    }
    prevWinnerRef.current = w;
  }, [activeState?.winnerTeam, muted]);

  // Pointer coordinate converter
  const screenToArena = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: CHAPAS_ARENA_W / 2, y: CHAPAS_ARENA_H / 2 };
    const r = canvas.getBoundingClientRect();
    const tr = transformRef.current;
    return {
      x: (clientX - r.left - tr.offsetX) / Math.max(0.1, tr.scale),
      y: (clientY - r.top - tr.offsetY) / Math.max(0.1, tr.scale),
    };
  }, []);

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
      executeShot(
        { capId: drag.capId, angle: drag.angle, power: drag.power },
        currentUser.id
      );
    }
  };

  // ============================================================================
  // 60FPS CANVAS STADIUM RENDERER + REALTIME PHYSICS + PARTICLES LOOP
  // ============================================================================
  useEffect(() => {
    let rafId = 0;

    const spawnBurst = (x: number, y: number, count: number, palette: string[]) => {
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
    };

    const renderFrame = (ts: number) => {
      rafId = window.requestAnimationFrame(renderFrame);

      const canvas = canvasRef.current;
      const container = containerRef.current;
      const st = activeStateRef.current;
      if (!canvas || !container || !st) return;

      // 1. Step active physics playback if running
      const pb = playbackRef.current;
      let renderCaps = st.caps;
      let renderBall = st.ball;
      let netRipple = 0;

      if (pb) {
        const step = stepChapasPhysicsFrame(pb.caps, pb.ball);
        pb.frameCount += 1;

        const ballSpd = Math.hypot(pb.ball.vx, pb.ball.vy);
        if (ballSpd > 2.2) {
          pb.ballTrail.push({ x: pb.ball.x, y: pb.ball.y });
          if (pb.ballTrail.length > 10) pb.ballTrail.shift();
        } else if (pb.ballTrail.length > 0) {
          pb.ballTrail.shift();
        }

        if (step.capHitCount > 0) {
          playGameSfx('board_move', mutedRef.current);
          spawnBurst(pb.ball.x, pb.ball.y, 4, ['#E2E8F0', '#FDE047']);
        }
        if (step.ballHitCount > 0) {
          playGameSfx('board_drop', mutedRef.current);
          particlesRef.current.push({
            x: pb.ball.x,
            y: pb.ball.y,
            vx: 0,
            vy: 0,
            r: CHAPAS_BALL_RADIUS,
            maxR: CHAPAS_BALL_RADIUS * 2.8,
            alpha: 0.72,
            color: '#FDE047',
            kind: 'ring',
          });
          spawnBurst(pb.ball.x, pb.ball.y, 6, ['#FFFFFF', '#A3E635', '#FDE047']);
        }
        if (step.postHitCount > 0) {
          playGameSfx('parchis_hop', mutedRef.current);
          spawnBurst(pb.ball.x, pb.ball.y, 8, ['#FFFFFF', '#CBD5E1']);
        }

        if (step.goalScoredBy && !pb.goalBannerShown) {
          pb.goalBannerShown = true;
          playGameSfx('parchis_goal', mutedRef.current);
          triggerHaptic('success');
          spawnBurst(
            CHAPAS_ARENA_W / 2,
            step.goalScoredBy === 'B' ? CHAPAS_PITCH_TOP : CHAPAS_PITCH_BOTTOM,
            26,
            ['#FACC15', '#34D399', '#38BDF8', '#F43F5E', '#FFFFFF']
          );
          setGoalBanner({
            team: step.goalScoredBy,
            flag: st.teamFlags[step.goalScoredBy],
          });
          window.setTimeout(() => setGoalBanner(null), 1750);
        }

        if (pb.goalBannerShown) {
          netRipple = Math.sin(ts * 0.025) * 4.5;
        }

        renderCaps = pb.caps;
        renderBall = pb.ball;

        if (!step.anyMoving || pb.frameCount >= CHAPAS_MAX_SIM_FRAMES) {
          const finalState = pb.authoritativeState;
          playbackRef.current = null;
          if (isOfflineRef.current) {
            setLocalState(finalState);
          }
          setIsSimulatingUI(false);
        }
      }

      // Update particles
      if (particlesRef.current.length > 0) {
        const nextP: ImpactParticle[] = [];
        for (const p of particlesRef.current) {
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
        particlesRef.current = nextP;
      }

      // 2. Fit canvas to container DPR
      const rect = container.getBoundingClientRect();
      const cssW = Math.max(240, Math.floor(rect.width));
      const cssH = Math.max(300, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scale = Math.min(cssW / CHAPAS_ARENA_W, cssH / CHAPAS_ARENA_H);
      const offsetX = (cssW - CHAPAS_ARENA_W * scale) * 0.5;
      const offsetY = (cssH - CHAPAS_ARENA_H * scale) * 0.5;
      transformRef.current = { scale, offsetX, offsetY };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Seamless full-bleed stadium mowed grass canvas surround
      const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      bgGrad.addColorStop(0, '#365F1E');
      bgGrad.addColorStop(0.5, '#3E6B22');
      bgGrad.addColorStop(1, '#2D4F18');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Subtle floodlight illumination over pitch center
      const apronGrad = ctx.createRadialGradient(
        CHAPAS_ARENA_W / 2,
        CHAPAS_ARENA_H / 2,
        75,
        CHAPAS_ARENA_W / 2,
        CHAPAS_ARENA_H / 2,
        460
      );
      apronGrad.addColorStop(0, 'rgba(132, 204, 22, 0.22)');
      apronGrad.addColorStop(0.65, 'rgba(54, 95, 30, 0.08)');
      apronGrad.addColorStop(1, 'rgba(15, 23, 42, 0.35)');
      ctx.fillStyle = apronGrad;
      ctx.fillRect(0, 0, CHAPAS_ARENA_W, CHAPAS_ARENA_H);

      // ================================================================
      // LEFT & RIGHT 3D STADIUM GRANDSTANDS / BLEACHERS + LED AD BOARDS
      // ================================================================
      const drawBleacherWing = (side: 'left' | 'right') => {
        ctx.save();
        const isL = side === 'left';
        const outerX = isL ? 3 : CHAPAS_ARENA_W - 3;
        const innerX = isL ? 47 : CHAPAS_ARENA_W - 47;

        // Drop shadow under stand
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.moveTo(outerX, 108);
        ctx.lineTo(innerX + (isL ? 4 : -4), 134);
        ctx.lineTo(innerX + (isL ? 4 : -4), CHAPAS_ARENA_H - 134);
        ctx.lineTo(outerX, CHAPAS_ARENA_H - 108);
        ctx.closePath();
        ctx.fill();

        // Concrete & steel tiered stand trapezoid
        const wingGrad = ctx.createLinearGradient(outerX, 0, innerX, 0);
        wingGrad.addColorStop(0, '#1E293B');
        wingGrad.addColorStop(0.45, '#334155');
        wingGrad.addColorStop(1, '#0F172A');
        ctx.fillStyle = wingGrad;
        ctx.beginPath();
        ctx.moveTo(outerX, 104);
        ctx.lineTo(innerX, 126);
        ctx.lineTo(innerX, CHAPAS_ARENA_H - 126);
        ctx.lineTo(outerX, CHAPAS_ARENA_H - 104);
        ctx.closePath();
        ctx.fill();

        // Stepped terrace lines
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        for (let r = 1; r <= 3; r += 1) {
          const rx = outerX + (innerX - outerX) * (r / 4);
          const pad = r * 5.2;
          ctx.beginPath();
          ctx.moveTo(rx, 106 + pad);
          ctx.lineTo(rx, CHAPAS_ARENA_H - 106 - pad);
          ctx.stroke();
        }

        // LED Perimeter Ad Board along pitch-facing wall
        const boardX = isL ? innerX - 4 : innerX;
        ctx.fillStyle = '#090D16';
        ctx.fillRect(boardX, 155, 4, CHAPAS_ARENA_H - 310);
        ctx.fillStyle = isL ? '#9146FF' : '#10B981';
        ctx.fillRect(boardX + 0.8, 220, 2.4, 96);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(boardX + 0.8, 360, 2.4, 70);
        ctx.fillStyle = isL ? '#38BDF8' : '#E11D48';
        ctx.fillRect(boardX + 0.8, 470, 2.4, 96);

        // Front metallic balustrade rail
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(innerX, 126);
        ctx.lineTo(innerX, CHAPAS_ARENA_H - 126);
        ctx.stroke();
        ctx.restore();
      };

      drawBleacherWing('left');
      drawBleacherWing('right');

      // Animated Crowd Spectators
      const crowdExcite = goalBanner || pb?.goalBannerShown ? 1 : 0;
      for (const sp of GRANDSTAND_CROWD) {
        const wave = Math.sin(ts * 0.004 + sp.phase);
        const bounce = crowdExcite
          ? Math.abs(Math.sin(ts * 0.018 + sp.phase)) * 4.2
          : wave > 0.92
          ? 1.2
          : 0;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y - bounce, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ================================================================
      // ALTERNATING MOWED GREEN GRASS STRIPES INSIDE PITCH
      // ================================================================
      ctx.save();
      ctx.beginPath();
      ctx.rect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, CHAPAS_PITCH_W, CHAPAS_PITCH_H);
      ctx.clip();

      const stripeCount = 10;
      const stripeH = CHAPAS_PITCH_H / stripeCount;
      for (let i = 0; i < stripeCount; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? '#5B9633' : '#4F852A';
        ctx.fillRect(
          CHAPAS_PITCH_LEFT,
          CHAPAS_PITCH_TOP + i * stripeH,
          CHAPAS_PITCH_W,
          stripeH + 0.5
        );
      }

      // Subtle stadium center light reflection
      const turfGlow = ctx.createRadialGradient(
        CHAPAS_ARENA_W / 2,
        CHAPAS_ARENA_H / 2,
        20,
        CHAPAS_ARENA_W / 2,
        CHAPAS_ARENA_H / 2,
        270
      );
      turfGlow.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
      turfGlow.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
      ctx.fillStyle = turfGlow;
      ctx.fillRect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, CHAPAS_PITCH_W, CHAPAS_PITCH_H);

      // Crisp White Pitch Markings
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.6;
      const midX = CHAPAS_ARENA_W / 2;
      const midY = (CHAPAS_PITCH_TOP + CHAPAS_PITCH_BOTTOM) / 2;

      ctx.strokeRect(
        CHAPAS_PITCH_LEFT + 1.5,
        CHAPAS_PITCH_TOP + 1.5,
        CHAPAS_PITCH_W - 3,
        CHAPAS_PITCH_H - 3
      );

      // Halfway line & center circle
      ctx.beginPath();
      ctx.moveTo(CHAPAS_PITCH_LEFT, midY);
      ctx.lineTo(CHAPAS_PITCH_RIGHT, midY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(midX, midY, 64, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(midX, midY, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Penalty & Goal Boxes
      const penW = 224;
      const penH = 98;
      const goalBoxW = 144;
      const goalBoxH = 38;

      ctx.strokeRect(midX - penW / 2, CHAPAS_PITCH_TOP, penW, penH);
      ctx.strokeRect(midX - goalBoxW / 2, CHAPAS_PITCH_TOP, goalBoxW, goalBoxH);
      ctx.beginPath();
      ctx.arc(midX, CHAPAS_PITCH_TOP + 68, 44, 0.24 * Math.PI, 0.76 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(midX, CHAPAS_PITCH_TOP + 68, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeRect(midX - penW / 2, CHAPAS_PITCH_BOTTOM - penH, penW, penH);
      ctx.strokeRect(midX - goalBoxW / 2, CHAPAS_PITCH_BOTTOM - goalBoxH, goalBoxW, goalBoxH);
      ctx.beginPath();
      ctx.arc(midX, CHAPAS_PITCH_BOTTOM - 68, 44, 1.24 * Math.PI, 1.76 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(midX, CHAPAS_PITCH_BOTTOM - 68, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Corner arcs
      const cR = 14;
      const corners: Array<[number, number, number, number]> = [
        [CHAPAS_PITCH_LEFT, CHAPAS_PITCH_TOP, 0, Math.PI * 0.5],
        [CHAPAS_PITCH_RIGHT, CHAPAS_PITCH_TOP, Math.PI * 0.5, Math.PI],
        [CHAPAS_PITCH_RIGHT, CHAPAS_PITCH_BOTTOM, Math.PI, Math.PI * 1.5],
        [CHAPAS_PITCH_LEFT, CHAPAS_PITCH_BOTTOM, Math.PI * 1.5, Math.PI * 2],
      ];
      for (const [cx, cy, a0, a1] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, cR, a0, a1);
        ctx.stroke();
      }
      ctx.restore();

      // ================================================================
      // BRUSHED METALLIC PERIMETER PITCH RAILS + FLUTTERING CORNER FLAGS
      // ================================================================
      const railW = 7;
      const railGrad = ctx.createLinearGradient(CHAPAS_PITCH_LEFT, 0, CHAPAS_PITCH_RIGHT, 0);
      railGrad.addColorStop(0, '#94A3B8');
      railGrad.addColorStop(0.5, '#E2E8F0');
      railGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = railGrad;

      ctx.fillRect(
        CHAPAS_PITCH_LEFT - railW,
        CHAPAS_PITCH_TOP - railW,
        railW,
        CHAPAS_PITCH_H + railW * 2
      );
      ctx.fillRect(
        CHAPAS_PITCH_RIGHT,
        CHAPAS_PITCH_TOP - railW,
        railW,
        CHAPAS_PITCH_H + railW * 2
      );
      ctx.fillRect(
        CHAPAS_PITCH_LEFT,
        CHAPAS_PITCH_TOP - railW,
        CHAPAS_GOAL_LEFT - CHAPAS_PITCH_LEFT,
        railW
      );
      ctx.fillRect(
        CHAPAS_GOAL_RIGHT,
        CHAPAS_PITCH_TOP - railW,
        CHAPAS_PITCH_RIGHT - CHAPAS_GOAL_RIGHT,
        railW
      );
      ctx.fillRect(
        CHAPAS_PITCH_LEFT,
        CHAPAS_PITCH_BOTTOM,
        CHAPAS_GOAL_LEFT - CHAPAS_PITCH_LEFT,
        railW
      );
      ctx.fillRect(
        CHAPAS_GOAL_RIGHT,
        CHAPAS_PITCH_BOTTOM,
        CHAPAS_PITCH_RIGHT - CHAPAS_GOAL_RIGHT,
        railW
      );

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(
        CHAPAS_PITCH_LEFT - railW,
        CHAPAS_PITCH_TOP - railW,
        CHAPAS_PITCH_W + railW * 2,
        CHAPAS_PITCH_H + railW * 2
      );

      // Animated Corner Flags
      const flagSway = Math.sin(ts * 0.008) * 1.4;
      const drawCornerFlag = (x: number, y: number, color: string, flipX: number, flipY: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(flipX * 8, flipY * 10);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(flipX * 8, flipY * 10);
        ctx.lineTo(flipX * 19, flipY * 5 + flagSway);
        ctx.lineTo(flipX * 6, flipY * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      drawCornerFlag(CHAPAS_PITCH_LEFT - 2, CHAPAS_PITCH_TOP - 2, '#EF4444', -1, -1);
      drawCornerFlag(CHAPAS_PITCH_RIGHT + 2, CHAPAS_PITCH_TOP - 2, '#EF4444', 1, -1);
      drawCornerFlag(CHAPAS_PITCH_LEFT - 2, CHAPAS_PITCH_BOTTOM + 2, '#38BDF8', -1, 1);
      drawCornerFlag(CHAPAS_PITCH_RIGHT + 2, CHAPAS_PITCH_BOTTOM + 2, '#38BDF8', 1, 1);

      // ================================================================
      // 3D GOAL FRAMES & WHITE MESH NETS (TOP & BOTTOM)
      // ================================================================
      const drawGoalNet = (isTop: boolean) => {
        const yMouth = isTop ? CHAPAS_PITCH_TOP : CHAPAS_PITCH_BOTTOM;
        const yBack = isTop
          ? CHAPAS_PITCH_TOP - CHAPAS_GOAL_DEPTH + netRipple
          : CHAPAS_PITCH_BOTTOM + CHAPAS_GOAL_DEPTH + netRipple;
        const gx0 = CHAPAS_GOAL_LEFT;
        const gx1 = CHAPAS_GOAL_RIGHT;

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
        ctx.beginPath();
        ctx.moveTo(gx0, yMouth);
        ctx.lineTo(gx0 + 6, yBack);
        ctx.lineTo(gx1 - 6, yBack);
        ctx.lineTo(gx1, yMouth);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
        ctx.lineWidth = 1;
        const cols = 12;
        for (let i = 0; i <= cols; i += 1) {
          const frac = i / cols;
          const xM = gx0 + (gx1 - gx0) * frac;
          const xB = gx0 + 6 + (gx1 - gx0 - 12) * frac;
          ctx.beginPath();
          ctx.moveTo(xM, yMouth);
          ctx.lineTo(xB, yBack);
          ctx.stroke();
        }
        const rows = 4;
        for (let r = 1; r <= rows; r += 1) {
          const frac = r / rows;
          const ry = yMouth + (yBack - yMouth) * frac;
          const rx0 = gx0 + 6 * frac;
          const rx1 = gx1 - 6 * frac;
          ctx.beginPath();
          ctx.moveTo(rx0, ry);
          ctx.lineTo(rx1, ry);
          ctx.stroke();
        }

        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(gx0, yMouth);
        ctx.lineTo(gx0 + 6, yBack);
        ctx.lineTo(gx1 - 6, yBack);
        ctx.lineTo(gx1, yMouth);
        ctx.stroke();

        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(gx0, yMouth);
        ctx.lineTo(gx1, yMouth);
        ctx.stroke();

        for (const px of [gx0, gx1]) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px, yMouth, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#64748B';
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
        ctx.restore();
      };

      drawGoalNet(true);
      drawGoalNet(false);

      // ================================================================
      // AIMING RING, PREDICTIVE SIGHTLINE & DIRECTIONAL ARROW
      // ================================================================
      const drag = aimDragRef.current;
      if (drag && st.status === 'playing' && !pb) {
        const draggedCap = renderCaps.find((c) => c.id === drag.capId);
        if (draggedCap) {
          const ringR = CHAPAS_CAP_RADIUS + 18 + drag.power * 52;
          const belowMin = drag.power < CHAPAS_MIN_POWER;

          ctx.save();
          ctx.translate(draggedCap.x, draggedCap.y);

          ctx.fillStyle = belowMin
            ? 'rgba(244, 63, 94, 0.24)'
            : 'rgba(15, 23, 42, 0.44)';
          ctx.beginPath();
          ctx.arc(0, 0, ringR, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = belowMin
            ? 'rgba(251, 113, 133, 0.9)'
            : 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 2;
          ctx.stroke();

          if (!belowMin) {
            // Elastic slingshot tension band opposite to shot angle
            const pullDist = drag.power * 68;
            const bandColor = drag.power > 0.75 ? '#EF4444' : drag.power > 0.4 ? '#F59E0B' : '#10B981';
            ctx.save();
            ctx.rotate(drag.angle);
            ctx.strokeStyle = bandColor;
            ctx.lineWidth = 2.4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-CHAPAS_CAP_RADIUS * 0.75, -CHAPAS_CAP_RADIUS * 0.6);
            ctx.lineTo(-CHAPAS_CAP_RADIUS - pullDist, 0);
            ctx.lineTo(-CHAPAS_CAP_RADIUS * 0.75, CHAPAS_CAP_RADIUS * 0.6);
            ctx.stroke();

            // Subtle dotted forward predictive sightline
            const guideLen = 90 + drag.power * 160;
            ctx.setLineDash([5, 6]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(CHAPAS_CAP_RADIUS + 8, 0);
            ctx.lineTo(guideLen, 0);
            ctx.stroke();
            ctx.setLineDash([]);

            // Dynamic Tri-Color Gradient Tactical Launch Arrow (Green -> Amber -> Red)
            const arrowLen = CHAPAS_CAP_RADIUS + 20 + drag.power * 68;
            const arrowGrad = ctx.createLinearGradient(CHAPAS_CAP_RADIUS + 4, 0, arrowLen, 0);
            arrowGrad.addColorStop(0, '#10B981');
            arrowGrad.addColorStop(0.5, '#FACC15');
            arrowGrad.addColorStop(1, '#EF4444');

            ctx.fillStyle = arrowGrad;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 5;

            ctx.beginPath();
            ctx.moveTo(CHAPAS_CAP_RADIUS + 4, -5.5);
            ctx.lineTo(arrowLen - 17, -5.5);
            ctx.lineTo(arrowLen - 17, -13);
            ctx.lineTo(arrowLen, 0);
            ctx.lineTo(arrowLen - 17, 13);
            ctx.lineTo(arrowLen - 17, 5.5);
            ctx.lineTo(CHAPAS_CAP_RADIUS + 4, 5.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Clean power % tag opposite drag pull
            const pct = Math.round(drag.power * 100);
            ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
            ctx.beginPath();
            ctx.roundRect(-22, -ringR - 22, 44, 18, 9);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '800 10px Plus Jakarta Sans, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${pct}%`, 0, -ringR - 13);
          }

          ctx.restore();
        }
      }

      // ================================================================
      // SCALLOPED 21-TOOTH BOTTLE CAPS (CHAPAS #1..#6) + NATIONAL FLAGS
      // ================================================================
      const activeTeamPulse = 0.65 + 0.35 * Math.sin(ts * 0.007);
      const seatIsHumanTurn = Boolean(
        st.status === 'playing' &&
          !pb &&
          st.players[st.activeSeatIndex] &&
          !st.players[st.activeSeatIndex]!.isBot
      );

      for (const cap of renderCaps) {
        const isMovable = st.status === 'playing' && !pb && cap.team === st.activeTeam;
        const flag = st.teamFlags[cap.team];
        const r = CHAPAS_CAP_RADIUS;

        ctx.save();
        ctx.translate(cap.x, cap.y);

        // Pulsing outer ring halo around active team's chapas
        if (isMovable) {
          const haloColor =
            cap.team === 'A'
              ? `rgba(251, 146, 60, ${0.46 * activeTeamPulse})`
              : `rgba(56, 189, 248, ${0.48 * activeTeamPulse})`;
          ctx.strokeStyle = haloColor;
          ctx.lineWidth = seatIsHumanTurn ? 6.5 : 4.5;
          ctx.beginPath();
          ctx.arc(0, 0, r + 5.2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Soft cast drop shadow on grass
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(2.5, 4.2, r + 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 21-tooth crimped metallic bottle-cap silhouette
        const crownGrad = ctx.createLinearGradient(-r, -r, r, r);
        crownGrad.addColorStop(0, '#FFFFFF');
        crownGrad.addColorStop(0.45, '#CBD5E1');
        crownGrad.addColorStop(1, '#475569');
        ctx.fillStyle = crownGrad;
        traceBottleCapCrownPath(ctx, r + 2.1, r - 0.8, 21);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Brushed inner metallic bezel
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(0, 0, r - 2.6, 0, Math.PI * 2);
        ctx.fill();

        // Enamel National Flag Emblem
        drawFlagEmblem(ctx, flag, r - 4.1);

        // Curved glass dome reflection highlight
        const sheen = ctx.createRadialGradient(-r * 0.32, -r * 0.38, 1, 0, 0, r);
        sheen.addColorStop(0, 'rgba(255,255,255,0.48)');
        sheen.addColorStop(0.42, 'rgba(255,255,255,0.08)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.24)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.arc(0, 0, r - 4.1, 0, Math.PI * 2);
        ctx.fill();

        // Crisp jersey number badge (#1..#6) at bottom center
        const badgeY = r * 0.78;
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(0, badgeY, 8.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 10.5px Plus Jakarta Sans, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cap.number), 0, badgeY + 0.5);

        ctx.restore();
      }

      // ================================================================
      // BALL MOTION TRAIL + CLASSIC SOCCER BALL
      // ================================================================
      if (pb && pb.ballTrail.length > 1) {
        for (let i = 0; i < pb.ballTrail.length; i += 1) {
          const pt = pb.ballTrail[i];
          const frac = (i + 1) / pb.ballTrail.length;
          ctx.fillStyle = `rgba(255, 255, 255, ${frac * 0.2})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, CHAPAS_BALL_RADIUS * (0.45 + frac * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.save();
      ctx.translate(renderBall.x, renderBall.y);
      const br = CHAPAS_BALL_RADIUS;

      ctx.fillStyle = 'rgba(0,0,0,0.44)';
      ctx.beginPath();
      ctx.arc(2.2, 3.2, br + 0.6, 0, Math.PI * 2);
      ctx.fill();

      const ballGrad = ctx.createRadialGradient(-br * 0.35, -br * 0.35, 1, 0, 0, br);
      ballGrad.addColorStop(0, '#FFFFFF');
      ballGrad.addColorStop(0.75, '#E2E8F0');
      ballGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(0, 0, br, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, br, 0, Math.PI * 2);
      ctx.clip();
      ctx.rotate(renderBall.spinAngle);

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = Math.cos(a) * br * 0.38;
        const py = Math.sin(a) * br * 0.38;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      for (let i = 0; i < 5; i += 1) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * br * 0.96, Math.sin(a) * br * 0.96, br * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(15,23,42,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ================================================================
      // COLLISION SHOCKWAVES & IMPACT PARTICLES
      // ================================================================
      for (const p of particlesRef.current) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        if (p.kind === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ================================================================
      // NON-OVERLAPPING BOTTOM APRON HUD PILLS (LEFT & RIGHT OF GOAL)
      // Bottom goal spans x = 202..338, y = 716..752 -> keep labels strictly
      // in left gap [62..194] and right gap [346..478]!
      // ================================================================
      const goalsLabel = `${pickLang(lang, { es: 'Goles', ca: 'Gols', en: 'Goals' })}: ${st.goalsToWin}`;
      const passesLabel = `${pickLang(lang, { es: 'Pases', ca: 'Passades', en: 'Passes' })}: ${st.passesUsed}/${st.maxPasses}`;

      ctx.save();
      ctx.font = '800 12px Plus Jakarta Sans, system-ui, sans-serif';
      ctx.textBaseline = 'middle';

      // Left apron pill (before goal x=202)
      ctx.fillStyle = 'rgba(9, 13, 22, 0.72)';
      ctx.beginPath();
      ctx.roundRect(CHAPAS_PITCH_LEFT, CHAPAS_PITCH_BOTTOM + 14, 108, 26, 13);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.fillText(goalsLabel, CHAPAS_PITCH_LEFT + 54, CHAPAS_PITCH_BOTTOM + 27.5);

      // Right apron pill (after goal x=338)
      ctx.fillStyle = 'rgba(9, 13, 22, 0.72)';
      ctx.beginPath();
      ctx.roundRect(CHAPAS_PITCH_RIGHT - 108, CHAPAS_PITCH_BOTTOM + 14, 108, 26, 13);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = st.passesUsed > 0 ? '#A3E635' : '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.fillText(passesLabel, CHAPAS_PITCH_RIGHT - 54, CHAPAS_PITCH_BOTTOM + 27.5);

      ctx.restore();

      ctx.restore(); // end canonical transform
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [lang]);

  // ============================================================================
  // LOBBY & ACTION HANDLERS
  // ============================================================================
  const handleJoinSeat = (idx: 0 | 1 | 2 | 3 | 'spectate') => {
    triggerHaptic('light');
    if (isOffline) {
      setLocalState((curr) => {
        const res = joinChapasSeat(
          curr,
          { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar, color: currentUser.color },
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
              color: currentUser.color,
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
    setFloatingReaction({ emoji, id: Date.now() });
    window.setTimeout(() => setFloatingReaction(null), 1600);
    if (!isOffline) {
      socketService.sendReaction(currentUser, emoji);
    }
  };

  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

  if (!activeState) {
    return (
      <div className="flex-1 min-h-0 rounded-2xl nc-tabletop-slate border border-white/[0.1] flex flex-col items-center justify-center gap-3 p-4 text-center">
        <span className="text-3xl" aria-hidden="true">⚽</span>
        <p className="text-sm font-bold text-white">
          {pickLang(lang, {
            es: 'Preparando estadio de Fútbol Chapas…',
            ca: 'Preparant estadi de Futbol Xapes…',
            en: 'Preparing Soccer Caps stadium…',
          })}
        </p>
        {!isOffline && (
          <button
            type="button"
            onClick={() => onStartOnline?.()}
            className="min-h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
          >
            {pickLang(lang, { es: 'Abrir estadio', ca: 'Obrir estadi', en: 'Open Pitch' })}
          </button>
        )}
      </div>
    );
  }

  const flagA = CHAPAS_TEAM_PRESETS.find((f) => f.id === activeState.teamFlags.A) || CHAPAS_TEAM_PRESETS[0];
  const flagB = CHAPAS_TEAM_PRESETS.find((f) => f.id === activeState.teamFlags.B) || CHAPAS_TEAM_PRESETS[1];

  const turnRemainingMs =
    activeState.status === 'playing' && activeState.turnDeadlineAt > 0
      ? Math.max(0, activeState.turnDeadlineAt - nowTs)
      : CHAPAS_TURN_TIMEOUT_MS;
  const turnRatio = Math.max(0, Math.min(1, turnRemainingMs / CHAPAS_TURN_TIMEOUT_MS));

  const renderSeatSlot = (seatIndex: 0 | 1 | 2 | 3) => {
    const seat = activeState.players[seatIndex];
    const isActive = activeState.status === 'playing' && activeState.activeSeatIndex === seatIndex;
    const isMe = Boolean(seat && !seat.isBot && seat.userId === currentUser.id);
    const voiceInfo = seat && !seat.isBot ? voicePeerMap.get(seat.userId) : undefined;
    const voiceLevel = seat && !seat.isBot ? voiceChat?.audioLevels?.[seat.userId] ?? 0 : 0;
    const isSpeaking = Boolean(
      seat &&
        !seat.isBot &&
        !voiceInfo?.isMuted &&
        (voiceLevel > 0.06 || voiceChat?.speakingUserIds.includes(seat.userId))
    );
    const canJoinThisSeat =
      !isOffline &&
      activeState.status === 'waiting' &&
      (!seat || seat.isBot);

    return (
      <button
        key={seatIndex}
        type="button"
        disabled={!canJoinThisSeat && !isMe}
        onClick={() => {
          if (canJoinThisSeat) handleJoinSeat(seatIndex);
        }}
        className={`relative flex flex-col items-center min-w-0 px-1 py-0.5 rounded-xl transition-all ${
          canJoinThisSeat ? 'cursor-pointer hover:bg-white/[0.08]' : 'cursor-default'
        }`}
      >
        {/* 15s turn bar above active player */}
        <div className="w-10 h-1.5 rounded-full bg-black/50 border border-white/15 overflow-hidden mb-0.5">
          {isActive && (
            <div
              className={`h-full transition-[width] duration-150 ${
                turnRatio < 0.3 ? 'bg-rose-500' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.round(turnRatio * 100)}%` }}
            />
          )}
        </div>

        {/* Avatar Circle */}
        <div
          className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm sm:text-base border-2 transition-all ${
            isSpeaking
              ? 'border-emerald-400 ring-2 ring-emerald-400/60 bg-emerald-500/20'
              : isActive
              ? 'border-sky-400 bg-sky-500/20 shadow-[0_0_12px_rgba(56,189,248,0.5)]'
              : seat
              ? 'border-white/35 bg-white/[0.1]'
              : 'border-dashed border-white/25 bg-white/[0.03]'
          }`}
        >
          <span>{seat ? seat.avatar : '+'}</span>
          {seat && !seat.isBot && voiceInfo && (
            <span className="absolute -top-1 -right-1">
              <VoiceSpeakerIndicator
                inVoice
                isSpeaking={isSpeaking}
                isMuted={voiceInfo.isMuted}
                audioLevel={voiceLevel}
              />
            </span>
          )}
          {seat?.isBot && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-zinc-900 border border-white/25 flex items-center justify-center">
              <Bot className="w-2 h-2 text-emerald-300" />
            </span>
          )}
        </div>

        {/* Name + green online status dot */}
        <div className="flex items-center gap-0.5 max-w-[64px] sm:max-w-[84px] mt-0.5">
          <span className="text-[10px] font-bold text-white truncate">
            {seat
              ? seat.name
              : canJoinThisSeat
              ? pickLang(lang, { es: 'Unirse', ca: 'Unir-se', en: 'Join' })
              : '—'}
          </span>
          {seat && !seat.isBot && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          )}
        </div>

        {/* Blue "Tu turno" pill under active human user */}
        {isActive && isMe && (
          <span className="mt-0.5 px-1.5 py-px rounded-md bg-sky-500 text-white text-[8px] font-black leading-tight whitespace-nowrap shadow">
            {pickLang(lang, { es: 'Tu turno', ca: 'El teu torn', en: 'Your turn' })}
          </span>
        )}
      </button>
    );
  };

  const canConfigureLobby = isOffline || isHost;
  const winnerFlag =
    activeState.winnerTeam === 'A'
      ? flagA
      : activeState.winnerTeam === 'B'
      ? flagB
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden select-none">
      {/* Integrated Translucent Stadium HUD + 4 Player Avatars + Score */}
      <div className="px-2 py-1 rounded-xl bg-gradient-to-b from-[#2E551A] via-[#244414] to-[#1A330E] border border-emerald-400/25 flex items-center justify-between gap-1 shrink-0 shadow-md">
        <div className="flex items-center gap-1 min-w-0">
          {renderSeatSlot(0)}
          {renderSeatSlot(1)}
        </div>

        <div className="flex flex-col items-center justify-center px-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full border border-white/70 shrink-0"
              style={{ backgroundColor: flagA.primary }}
              title={flagA.name}
            />
            <span className="text-base sm:text-xl font-black font-mono tabular-nums text-white tracking-tight drop-shadow">
              {activeState.scores.A} - {activeState.scores.B}
            </span>
            <span
              className="w-3 h-3 rounded-full border border-white/70 shrink-0"
              style={{ backgroundColor: flagB.primary }}
              title={flagB.name}
            />
          </div>
          <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-100/85 truncate max-w-[125px] sm:max-w-[200px]">
            {isSimulatingUI
              ? pickLang(lang, { es: 'Jugada en curso…', ca: 'Jugada en curs…', en: 'Shot in play…' })
              : activeState.statusMessage}
          </span>
        </div>

        <div className="flex items-center gap-1 min-w-0">
          {renderSeatSlot(2)}
          {renderSeatSlot(3)}
        </div>
      </div>

      {/* Main High-DPI Stadium Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-2xl bg-[#2E5218] border border-white/[0.14] overflow-hidden shadow-inner"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
          className={`w-full h-full block ${
            isMyTurn ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
          }`}
        />

        {/* Quick Emoji Reaction Dock on Right Edge */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex flex-col items-end gap-1.5">
          {emojiMenuOpen && (
            <div className="p-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 flex flex-col gap-1 shadow-xl">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => sendQuickReaction(em)}
                  className="w-8 h-8 rounded-xl hover:bg-white/15 flex items-center justify-center text-base cursor-pointer active:scale-90 transition-transform"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setEmojiMenuOpen((o) => !o)}
            aria-label={pickLang(lang, { es: 'Reacciones', ca: 'Reaccions', en: 'Reactions' })}
            className="w-9 h-9 rounded-full bg-amber-400/90 hover:bg-amber-300 text-zinc-950 shadow-lg border border-white/50 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
          >
            <Smile className="w-5 h-5" />
          </button>
        </div>

        {/* Floating Reaction Toast */}
        {floatingReaction && (
          <div
            key={floatingReaction.id}
            className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 z-20 text-4xl animate-bounce drop-shadow-2xl"
          >
            {floatingReaction.emoji}
          </div>
        )}

        {/* Animated Goal Celebration Banner with Kinetic 3D Typography */}
        {goalBanner && (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center p-4 overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
              <div className="w-[360px] h-[360px] nc-ray-spin opacity-45 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.6)_0%,transparent_70%)]" />
            </div>
            <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-2">
              <div className="nc-goal-kinetic text-4xl sm:text-6xl font-black italic tracking-wider text-amber-300 drop-shadow-[0_10px_25px_rgba(245,158,11,0.9)]">
                ⚽ ¡GOOOL!
              </div>
              <div className="px-4 py-1.5 rounded-full bg-black/85 border border-amber-400/80 shadow-lg text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                <span>{CHAPAS_TEAM_PRESETS.find((f) => f.id === goalBanner.flag)?.name || ''}</span>
                <span className="text-amber-300 font-mono font-bold">
                  ({activeState.scores.A} - {activeState.scores.B})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Waiting Lobby Overlay Bar */}
        {activeState.status === 'waiting' && (
          <div className="absolute inset-x-2.5 bottom-2.5 z-20 rounded-2xl bg-[#0D1310]/92 backdrop-blur-md border border-emerald-400/30 p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xl">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={!canConfigureLobby}
                onClick={() => handleCycleTeamFlag('A')}
                className="min-h-9 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] disabled:opacity-65 border border-white/15 text-[11px] font-extrabold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span
                  className="w-3 h-3 rounded-full border border-white/70"
                  style={{ backgroundColor: flagA.primary }}
                />
                <span>Eq.1: {flagA.short}</span>
              </button>

              <button
                type="button"
                disabled={!canConfigureLobby}
                onClick={() => handleCycleTeamFlag('B')}
                className="min-h-9 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] disabled:opacity-65 border border-white/15 text-[11px] font-extrabold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span
                  className="w-3 h-3 rounded-full border border-white/70"
                  style={{ backgroundColor: flagB.primary }}
                />
                <span>Eq.2: {flagB.short}</span>
              </button>

              {canConfigureLobby && (
                <button
                  type="button"
                  onClick={handleToggleBots}
                  className={`min-h-9 px-2.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                    activeState.botsEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-zinc-800/80 border-white/15 text-zinc-300'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>
                    {activeState.botsEnabled
                      ? pickLang(lang, { es: 'Bots: Sí', ca: 'Bots: Sí', en: 'Bots: On' })
                      : pickLang(lang, { es: 'Bots: No', ca: 'Bots: No', en: 'Bots: Off' })}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {!isOffline && mySeats.length === 0 && (
                <button
                  type="button"
                  onClick={() => handleJoinSeat(2)}
                  className="min-h-9 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-extrabold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{pickLang(lang, { es: 'Unirse', ca: 'Unir-se', en: 'Join' })}</span>
                </button>
              )}

              {canConfigureLobby ? (
                <button
                  type="button"
                  onClick={handleStartMatch}
                  className="min-h-9 px-4 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:brightness-110 text-xs font-black text-zinc-950 flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{pickLang(lang, { es: 'Play · Sacar', ca: 'Play · Treure', en: 'Play · Kickoff' })}</span>
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-zinc-300 px-2">
                  {pickLang(lang, {
                    es: 'Esperando al anfitrión…',
                    ca: "Esperant l'amfitrió…",
                    en: 'Waiting for host…',
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Match Finished Overlay */}
        {activeState.status === 'finished' && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={
              winnerFlag
                ? `🏆 ${winnerFlag.name} ${pickLang(lang, { es: 'gana', ca: 'guanya', en: 'wins' })}!`
                : pickLang(lang, { es: 'Partido terminado', ca: 'Partit acabat', en: 'Match Over' })
            }
            subtitle={`${activeState.scores.A} - ${activeState.scores.B} · ${activeState.statusMessage}`}
            primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
            onPrimaryAction={handleRematch}
          />
        )}
      </div>

      {/* Compact Footer Hint & Reset/Forfeit */}
      <div className="px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-2 shrink-0 text-[11px] text-zinc-300">
        <div className="flex items-center gap-1.5 min-w-0">
          <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">
            {activeState.status === 'playing'
              ? isMyTurn
                ? pickLang(lang, {
                    es: 'Arrastra una chapa hacia atrás y suelta para chutar',
                    ca: 'Arrossega una xapa enrere i deixa anar per xutar',
                    en: 'Pull any of your caps back & release to flick',
                  })
                : pickLang(lang, {
                    es: `Turno de ${activeSeat?.name || 'rival'}`,
                    ca: `Torn de ${activeSeat?.name || 'rival'}`,
                    en: `${activeSeat?.name || 'Opponent'}'s turn`,
                  })
              : pickLang(lang, {
                  es: 'Hasta 3 pases seguidos · Primero a 3 goles',
                  ca: 'Fins a 3 passades seguides · Primer a 3 gols',
                  en: 'Up to 3 passes per possession · First to 3 goals',
                })}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isOffline ? (
            <button
              type="button"
              onClick={handleRematch}
              title={pickLang(lang, { es: 'Reiniciar partido', ca: 'Reiniciar partit', en: 'Restart match' })}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          ) : (
            activeState.status === 'playing' &&
            mySeats.length > 0 && (
              <button
                type="button"
                onClick={() => onForfeitOnline?.()}
                title={pickLang(lang, { es: 'Abandonar partido', ca: 'Abandonar partit', en: 'Forfeit match' })}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 border border-white/[0.1] flex items-center justify-center text-zinc-200 hover:text-rose-200 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
