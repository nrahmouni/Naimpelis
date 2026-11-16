import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type {
  AppLanguage,
  Participant,
} from '../types';
import {
  HS_ARENA_H,
  HS_ARENA_W,
  HS_BALL_RADIUS,
  HS_CROSSBAR_Y,
  HS_GOAL_H,
  HS_GOAL_W,
  HS_GROUND_Y,
  HS_HEAD_RADIUS,
  HS_MATCH_DURATION_SEC,
  HS_POST_RADIUS,
  HS_SKINS,
  chooseHeadSoccerAiInput,
  createHeadSoccerSimulation,
  createInitialHeadSoccerOnlineState,
  getHeadSoccerSkin,
  stepHeadSoccerFrame,
  type HeadSoccerInput,
  type HeadSoccerOnlineState,
  type HeadSoccerSimulation,
  type HeadSoccerSkinId,
} from '../shared/headSoccer';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './games/GameVoiceBar';
import { VictoryCelebrationOverlay, playGameSfx, useGameSoundMute } from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export interface HeadSoccerStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  headSoccerState: HeadSoccerOnlineState | null;
  latestSyncSnapshot?: { seq: number; sim: HeadSoccerSimulation } | null;
  remotePeerInput?: { side: 0 | 1; input: HeadSoccerInput; seq: number } | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: () => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 'spectate') => void;
  onSelectSkinOnline?: (skinId: HeadSoccerSkinId) => void;
  onStartMatchOnline?: () => void;
  onSendInputOnline?: (side: 0 | 1, input: HeadSoccerInput) => void;
  onSendSyncStateOnline?: (sim: HeadSoccerSimulation) => void;
  onRematchOnline?: () => void;
}

const EMPTY_INPUT: HeadSoccerInput = { left: false, right: false, jump: false, kick: false };

interface ConfettiDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
}

function drawStadiumAndField(ctx: CanvasRenderingContext2D, timeSec: number) {
  // 1. Night stadium sky + floodlights
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HS_GROUND_Y);
  skyGrad.addColorStop(0, '#090b1a');
  skyGrad.addColorStop(0.55, '#131836');
  skyGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, HS_ARENA_W, HS_GROUND_Y);

  // Floodlight beams
  for (const fx of [140, 450, 760]) {
    const beam = ctx.createRadialGradient(fx, 26, 8, fx, 140, 290);
    beam.addColorStop(0, 'rgba(255, 255, 235, 0.25)');
    beam.addColorStop(0.5, 'rgba(148, 163, 255, 0.08)');
    beam.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, HS_ARENA_W, HS_GROUND_Y);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(fx - 26, 12, 52, 10);
    ctx.fillStyle = '#fef08a';
    for (let i = -20; i <= 20; i += 10) {
      ctx.beginPath();
      ctx.arc(fx + i, 22, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Stadium grandstand silhouette & animated crowd dots
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 255, HS_ARENA_W, HS_GROUND_Y - 255);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 295, HS_ARENA_W, 10);
  ctx.fillRect(0, 345, HS_ARENA_W, 10);

  const crowdColors = ['#9146FF', '#FACC15', '#38BDF8', '#EF4444', '#10B981', '#F8FAFC'];
  for (let row = 0; row < 3; row += 1) {
    const baseY = 278 + row * 38;
    for (let i = 0; i < 42; i += 1) {
      const cx = 14 + i * 21.5 + (row % 2) * 10;
      const bounce = Math.sin(timeSec * 3.4 + i * 0.9 + row) * 2.1;
      ctx.fillStyle = crowdColors[(i + row * 2) % crowdColors.length];
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(cx, baseY + bounce, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Perimeter LED boards
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, HS_GROUND_Y - 26, HS_ARENA_W, 26);
  ctx.strokeStyle = 'rgba(145, 70, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HS_GROUND_Y - 26);
  ctx.lineTo(HS_ARENA_W, HS_GROUND_Y - 26);
  ctx.stroke();

  ctx.fillStyle = 'rgba(191, 148, 255, 0.72)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let bx = 90; bx < HS_ARENA_W; bx += 220) {
    ctx.fillText('RIFFANTV · COPA CABEZONES', bx, HS_GROUND_Y - 9);
  }

  // 2. Mowed striped turf
  const stripeW = HS_ARENA_W / 10;
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
    ctx.fillRect(i * stripeW, HS_GROUND_Y, stripeW + 1, HS_ARENA_H - HS_GROUND_Y);
  }

  // Turf top sheen & touchline
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(0, HS_GROUND_Y, HS_ARENA_W, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(HS_GOAL_W, HS_GROUND_Y + 1, HS_ARENA_W - HS_GOAL_W * 2, 2.5);
  // Center pitch spot & arc
  ctx.beginPath();
  ctx.arc(HS_ARENA_W / 2, HS_GROUND_Y + 16, 42, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(HS_ARENA_W / 2, HS_GROUND_Y + 3, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoals(ctx: CanvasRenderingContext2D) {
  const drawSingleGoal = (side: 'left' | 'right') => {
    const xStart = side === 'left' ? 8 : HS_ARENA_W - HS_GOAL_W;
    const w = side === 'left' ? HS_GOAL_W - 8 : HS_GOAL_W - 8;
    const postX = side === 'left' ? HS_GOAL_W : HS_ARENA_W - HS_GOAL_W;

    // Net shadow fill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.fillRect(xStart, HS_CROSSBAR_Y, w, HS_GOAL_H);

    // Net diamond/grid mesh
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.34)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = xStart; x <= xStart + w; x += 12) {
      ctx.moveTo(x, HS_CROSSBAR_Y);
      ctx.lineTo(x, HS_GROUND_Y);
    }
    for (let y = HS_CROSSBAR_Y; y <= HS_GROUND_Y; y += 12) {
      ctx.moveTo(xStart, y);
      ctx.lineTo(xStart + w, y);
    }
    ctx.stroke();

    // Back diagonal brace
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(postX, HS_CROSSBAR_Y);
      ctx.lineTo(10, HS_CROSSBAR_Y + 14);
      ctx.lineTo(10, HS_GROUND_Y);
    } else {
      ctx.moveTo(postX, HS_CROSSBAR_Y);
      ctx.lineTo(HS_ARENA_W - 10, HS_CROSSBAR_Y + 14);
      ctx.lineTo(HS_ARENA_W - 10, HS_GROUND_Y);
    }
    ctx.stroke();

    // Metallic white crossbar + upright post
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side === 'left' ? 10 : HS_ARENA_W - 10, HS_CROSSBAR_Y);
    ctx.lineTo(postX, HS_CROSSBAR_Y);
    ctx.lineTo(postX, HS_GROUND_Y);
    ctx.stroke();

    // Corner post joint highlight
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(postX, HS_CROSSBAR_Y, HS_POST_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  drawSingleGoal('left');
  drawSingleGoal('right');
}

function drawCaricaturePlayer(
  ctx: CanvasRenderingContext2D,
  player: HeadSoccerSimulation['players'][number],
  ballX: number,
  ballY: number,
  skinId: HeadSoccerSkinId
) {
  const skin = getHeadSoccerSkin(skinId);
  const { x, y, facing, kickTimer, onGround } = player;

  // Ground shadow
  const heightAboveGround = Math.max(0, HS_GROUND_Y - HS_HEAD_RADIUS - y);
  const shadowScale = Math.max(0.42, 1 - heightAboveGround / 240);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(x, HS_GROUND_Y + 4, 24 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Articulated kicking boot & leg
  const swingProgress = kickTimer > 0 ? 1 - kickTimer / 0.2 : 0;
  const bootAngle = facing * (kickTimer > 0 ? -Math.sin(swingProgress * Math.PI) * 1.15 : 0.08);
  const bootOffsetX = facing * (10 + Math.sin(swingProgress * Math.PI) * 20);
  const bootOffsetY = HS_HEAD_RADIUS - 2 - Math.sin(swingProgress * Math.PI) * 12;

  ctx.save();
  ctx.translate(x + bootOffsetX, y + bootOffsetY);
  ctx.rotate(bootAngle);
  // Sock
  ctx.fillStyle = skin.secondary;
  ctx.fillRect(-5, -10, 10, 10);
  // Boot body
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = skin.boot;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-8, -2, 22, 12, 5);
  ctx.fill();
  ctx.stroke();
  // Studs
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(-5, 10, 4, 3);
  ctx.fillRect(3, 10, 4, 3);
  ctx.restore();

  // Compact jersey torso beneath big head
  ctx.save();
  ctx.fillStyle = skin.primary;
  ctx.strokeStyle = skin.secondary;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x - 13, y + HS_HEAD_RADIUS - 11, 26, 15, 7);
  ctx.fill();
  ctx.stroke();
  // Collar stripe
  ctx.fillStyle = skin.boot;
  ctx.fillRect(x - 6, y + HS_HEAD_RADIUS - 9, 12, 3);
  ctx.restore();

  // Oversized caricature head
  ctx.save();
  ctx.translate(x, y);
  const tilt = Math.max(-0.14, Math.min(0.14, player.vx * 0.00035));
  ctx.rotate(tilt);

  // Head outline & shading
  const headGrad = ctx.createRadialGradient(-7, -9, 6, 0, 0, HS_HEAD_RADIUS);
  headGrad.addColorStop(0, '#ffe8d6');
  headGrad.addColorStop(0.55, skin.skinTone);
  headGrad.addColorStop(1, '#c97a4b');
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, HS_HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hair / Headband / Crown style
  ctx.fillStyle = skin.hair;
  if (skinId === 'striker') {
    // Spiky hair + primary headband
    ctx.beginPath();
    ctx.moveTo(-24, -10);
    ctx.lineTo(-18, -32);
    ctx.lineTo(-6, -24);
    ctx.lineTo(2, -35);
    ctx.lineTo(13, -24);
    ctx.lineTo(23, -31);
    ctx.lineTo(25, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = skin.primary;
    ctx.fillRect(-26, -13, 52, 6);
  } else if (skinId === 'furia') {
    // Slick fade + red/gold sweatband
    ctx.beginPath();
    ctx.arc(0, -6, HS_HEAD_RADIUS - 1, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-26, -11, 52, 5);
  } else if (skinId === 'ninja' || skinId === 'astro') {
    // Ninja / Astro visor band
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, -5, HS_HEAD_RADIUS, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.boot;
    ctx.fillRect(facing > 0 ? -2 : -22, -9, 24, 9);
  } else {
    // Maestro / Titan classic wavy hair
    ctx.beginPath();
    ctx.arc(0, -8, HS_HEAD_RADIUS - 1, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }

  // Expressive caricature eyes looking toward the ball
  const lookAngle = Math.atan2(ballY - y, ballX - x);
  const px = Math.cos(lookAngle) * 2.5;
  const py = Math.sin(lookAngle) * 2.5;
  const eyeCenterX = facing * 8;
  for (const dx of [-7, 7]) {
    const ex = eyeCenterX + dx;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(ex, -1, 5.5, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(ex + px, -1 + py, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + px - 1, -2.5 + py, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrow & smile / effort mouth
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(eyeCenterX - 11, -10);
  ctx.lineTo(eyeCenterX - 3, -8);
  ctx.moveTo(eyeCenterX + 3, -8);
  ctx.lineTo(eyeCenterX + 11, -10);
  ctx.stroke();

  ctx.beginPath();
  if (kickTimer > 0 || !onGround) {
    ctx.fillStyle = '#7f1d1d';
    ctx.ellipse(facing * 9, 13, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(facing * 8, 11, 6.5, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSoccerBall(ctx: CanvasRenderingContext2D, ball: HeadSoccerSimulation['ball']) {
  // Ground shadow
  const height = Math.max(0, HS_GROUND_Y - HS_BALL_RADIUS - ball.y);
  const scale = Math.max(0.35, 1 - height / 280);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(ball.x, HS_GROUND_Y + 4, HS_BALL_RADIUS * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball sphere
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.angle);

  const grad = ctx.createRadialGradient(-5, -5, 3, 0, 0, HS_BALL_RADIUS);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.75, '#e2e8f0');
  grad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, HS_BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Classic pentagons
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const px = Math.cos(a) * 6.5;
    const py = Math.sin(a) * 6.5;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const cx = Math.cos(a) * 14.5;
    const cy = Math.sin(a) * 14.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export const HeadSoccerStage: React.FC<HeadSoccerStageProps> = ({
  lang,
  currentUser,
  headSoccerState,
  latestSyncSnapshot = null,
  remotePeerInput = null,
  isOffline = false,
  isHost = false,
  voiceChat,
  mutedOverride,
  onStartOnline,
  onJoinSeatOnline,
  onSelectSkinOnline,
  onStartMatchOnline,
  onSendInputOnline,
  onSendSyncStateOnline,
  onRematchOnline,
}) => {
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride ?? localMuted;

  const [offlineSkin, setOfflineSkin] = useState<HeadSoccerSkinId>('striker');
  const [offlineSim, setOfflineSim] = useState<HeadSoccerSimulation>(() =>
    createHeadSoccerSimulation('striker', 'furia')
  );
  const [hudSnapshot, setHudSnapshot] = useState<{
    scores: [number, number];
    timeLeftSec: number;
    isGoldenGoal: boolean;
    phase: HeadSoccerSimulation['phase'];
    goalBannerSide: 0 | 1 | null;
    winnerSide: 0 | 1 | null;
  }>({
    scores: [0, 0],
    timeLeftSec: HS_MATCH_DURATION_SEC,
    isGoldenGoal: false,
    phase: 'playing',
    goalBannerSide: null,
    winnerSide: null,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<HeadSoccerSimulation>(createHeadSoccerSimulation('striker', 'furia'));
  const localInputRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const touchButtonsRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const keyButtonsRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const remoteInputRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const activePointersRef = useRef<Map<number, keyof HeadSoccerInput>>(new Map());
  const confettiRef = useRef<ConfettiDot[]>([]);
  const lastSyncSentAtRef = useRef(0);
  const lastInputSentJsonRef = useRef('');
  const lastSeqAppliedRef = useRef(-1);

  const effectiveState = isOffline ? null : headSoccerState;

  const mySeatSide: 0 | 1 | null = useMemo(() => {
    if (isOffline) return 0;
    if (!effectiveState) return null;
    if (effectiveState.players[0]?.userId === currentUser.id) return 0;
    if (effectiveState.players[1]?.userId === currentUser.id) return 1;
    return null;
  }, [isOffline, effectiveState, currentUser.id]);

  // Host or solo offline runs authoritative 60fps simulation
  const isSimAuthority = isOffline || mySeatSide === 0 || (mySeatSide === null && isHost);

  // Reset sim cleanly when online match transitions into 'playing'
  const onlineMatchStartKey = `${effectiveState?.status || 'none'}:${effectiveState?.startedAt || 0}`;
  useEffect(() => {
    if (isOffline) return;
    if (!effectiveState) return;
    const s0 = effectiveState.players[0]?.skinId || 'striker';
    const s1 = effectiveState.players[1]?.skinId || 'furia';
    if (effectiveState.status === 'playing') {
      const fresh = createHeadSoccerSimulation(s0, s1);
      simRef.current = fresh;
      confettiRef.current = [];
      lastSeqAppliedRef.current = -1;
      setHudSnapshot({
        scores: fresh.scores,
        timeLeftSec: fresh.timeLeftSec,
        isGoldenGoal: fresh.isGoldenGoal,
        phase: fresh.phase,
        goalBannerSide: fresh.goalBannerSide,
        winnerSide: fresh.winnerSide,
      });
    }
  }, [isOffline, onlineMatchStartKey]);

  // Apply remote peer input
  useEffect(() => {
    if (!remotePeerInput || isOffline) return;
    if (mySeatSide !== remotePeerInput.side) {
      remoteInputRef.current = remotePeerInput.input;
    }
  }, [remotePeerInput, isOffline, mySeatSide]);

  // Apply authoritative host sync snapshots on non-host clients
  useEffect(() => {
    if (isOffline || isSimAuthority || !latestSyncSnapshot) return;
    if (latestSyncSnapshot.seq <= lastSeqAppliedRef.current) return;
    lastSeqAppliedRef.current = latestSyncSnapshot.seq;
    const prevPhase = simRef.current.phase;
    simRef.current = latestSyncSnapshot.sim;
    if (prevPhase !== 'goal' && latestSyncSnapshot.sim.phase === 'goal') {
      playGameSfx('chapas_goal', muted);
      triggerHaptic('success');
    } else if (prevPhase !== 'finished' && latestSyncSnapshot.sim.phase === 'finished') {
      const won = mySeatSide !== null && latestSyncSnapshot.sim.winnerSide === mySeatSide;
      playGameSfx(won ? 'victory' : 'defeat', muted);
    }
    setHudSnapshot({
      scores: latestSyncSnapshot.sim.scores,
      timeLeftSec: latestSyncSnapshot.sim.timeLeftSec,
      isGoldenGoal: latestSyncSnapshot.sim.isGoldenGoal,
      phase: latestSyncSnapshot.sim.phase,
      goalBannerSide: latestSyncSnapshot.sim.goalBannerSide,
      winnerSide: latestSyncSnapshot.sim.winnerSide,
    });
  }, [latestSyncSnapshot, isOffline, isSimAuthority, muted, mySeatSide]);

  const syncMergedInput = useCallback(() => {
    const k = keyButtonsRef.current;
    const t = touchButtonsRef.current;
    const merged: HeadSoccerInput = {
      left: k.left || t.left,
      right: k.right || t.right,
      jump: k.jump || t.jump,
      kick: k.kick || t.kick,
    };
    localInputRef.current = merged;

    if (!isOffline && mySeatSide !== null && mySeatSide === 1 && effectiveState?.status === 'playing') {
      const json = `${merged.left ? 1 : 0}${merged.right ? 1 : 0}${merged.jump ? 1 : 0}${merged.kick ? 1 : 0}`;
      if (json !== lastInputSentJsonRef.current) {
        lastInputSentJsonRef.current = json;
        onSendInputOnline?.(mySeatSide, merged);
      }
    }
  }, [isOffline, mySeatSide, effectiveState?.status, onSendInputOnline]);

  // Keyboard bindings (WASD + Arrows + Space)
  useEffect(() => {
    const mapKey = (e: KeyboardEvent): keyof HeadSoccerInput | null => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          return 'left';
        case 'ArrowRight':
        case 'KeyD':
          return 'right';
        case 'ArrowUp':
        case 'KeyW':
          return 'jump';
        case 'Space':
        case 'KeyJ':
        case 'Enter':
          return 'kick';
        default:
          return null;
      }
    };

    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const action = mapKey(e);
      if (!action) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!keyButtonsRef.current[action]) {
        keyButtonsRef.current[action] = true;
        syncMergedInput();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const action = mapKey(e);
      if (!action) return;
      if (keyButtonsRef.current[action]) {
        keyButtonsRef.current[action] = false;
        syncMergedInput();
      }
    };

    const onBlur = () => {
      keyButtonsRef.current = { ...EMPTY_INPUT };
      touchButtonsRef.current = { ...EMPTY_INPUT };
      activePointersRef.current.clear();
      syncMergedInput();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [syncMergedInput]);

  // Recompute touch buttons from active multi-touch pointers
  const updateTouchPointer = useCallback(
    (pointerId: number, action: keyof HeadSoccerInput | null) => {
      if (action === null) {
        activePointersRef.current.delete(pointerId);
      } else {
        activePointersRef.current.set(pointerId, action);
      }
      const next: HeadSoccerInput = { ...EMPTY_INPUT };
      activePointersRef.current.forEach((act) => {
        next[act] = true;
      });
      touchButtonsRef.current = next;
      syncMergedInput();
    },
    [syncMergedInput]
  );

  // Main 60fps simulation + Canvas 2D render loop
  useEffect(() => {
    const isPlayingNow = isOffline
      ? offlineSim.phase !== 'finished' || hudSnapshot.phase !== 'finished'
      : effectiveState?.status === 'playing' || effectiveState?.status === 'finished';

    if (!isOffline && !effectiveState) return;

    let rafId = 0;
    let lastTs = performance.now();
    let lastHudUpdate = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.033, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;

      const canvas = canvasRef.current;
      const sim = simRef.current;

      const matchActive = isOffline
        ? sim.phase !== 'finished'
        : effectiveState?.status === 'playing' && sim.phase !== 'finished';

      if (matchActive && isSimAuthority) {
        const leftInp = localInputRef.current;
        const seat1IsBot = isOffline || Boolean(effectiveState?.players[1]?.isBot);
        const rightInp = seat1IsBot ? chooseHeadSoccerAiInput(sim, 1) : remoteInputRef.current;
        const events = stepHeadSoccerFrame(sim, [leftInp, rightInp], dt);

        if (events.kicked) {
          playGameSfx('chapas_kick', muted);
          triggerHaptic('light');
        } else if (events.headed) {
          playGameSfx('board_move', muted);
        } else if (events.postHit) {
          playGameSfx('chapas_bounce', muted);
        }

        if (events.goalScoredBy !== undefined) {
          playGameSfx('chapas_goal', muted);
          triggerHaptic('success');
          const gx = events.goalScoredBy === 0 ? HS_ARENA_W - HS_GOAL_W : HS_GOAL_W;
          const colors = ['#FACC15', '#9146FF', '#22C55E', '#38BDF8', '#FFFFFF'];
          for (let c = 0; c < 36; c += 1) {
            const ang = (Math.random() - 0.5) * Math.PI * 1.4 - Math.PI / 2;
            const spd = 160 + Math.random() * 340;
            confettiRef.current.push({
              x: gx,
              y: HS_CROSSBAR_Y + 60,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 80,
              color: colors[c % colors.length],
              size: 4 + Math.random() * 5,
              life: 1.5,
            });
          }
        }

        if (events.matchEnded) {
          const won = sim.winnerSide === 0;
          playGameSfx(won ? 'victory' : 'defeat', muted);
        }

        // Broadcast sync snapshot for online room
        if (
          !isOffline &&
          effectiveState?.status === 'playing' &&
          (events.goalScoredBy !== undefined || events.matchEnded || now - lastSyncSentAtRef.current >= 70)
        ) {
          lastSyncSentAtRef.current = now;
          onSendSyncStateOnline?.(sim);
        }
      }

      // Sync lightweight HUD state at ~15fps or immediately on phase changes
      if (now - lastHudUpdate > 65 || sim.phase !== hudSnapshot.phase || sim.scores[0] !== hudSnapshot.scores[0] || sim.scores[1] !== hudSnapshot.scores[1]) {
        lastHudUpdate = now;
        setHudSnapshot({
          scores: [sim.scores[0], sim.scores[1]],
          timeLeftSec: sim.timeLeftSec,
          isGoldenGoal: sim.isGoldenGoal,
          phase: sim.phase,
          goalBannerSide: sim.goalBannerSide,
          winnerSide: sim.winnerSide,
        });
      }

      // Update confetti
      if (confettiRef.current.length > 0) {
        confettiRef.current = confettiRef.current
          .map((d) => ({
            ...d,
            x: d.x + d.vx * dt,
            y: d.y + d.vy * dt,
            vy: d.vy + 420 * dt,
            life: d.life - dt,
          }))
          .filter((d) => d.life > 0);
      }

      // Render Canvas 2D
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const targetW = HS_ARENA_W * dpr;
        const targetH = HS_ARENA_H * dpr;
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          drawStadiumAndField(ctx, now / 1000);
          drawCaricaturePlayer(
            ctx,
            sim.players[0],
            sim.ball.x,
            sim.ball.y,
            effectiveState?.players[0]?.skinId || offlineSkin
          );
          drawCaricaturePlayer(
            ctx,
            sim.players[1],
            sim.ball.x,
            sim.ball.y,
            effectiveState?.players[1]?.skinId || 'furia'
          );
          drawSoccerBall(ctx, sim.ball);
          drawGoals(ctx);

          // Confetti
          for (const d of confettiRef.current) {
            ctx.globalAlpha = Math.max(0, Math.min(1, d.life));
            ctx.fillStyle = d.color;
            ctx.fillRect(d.x, d.y, d.size, d.size * 1.3);
          }
          ctx.globalAlpha = 1;

          // Goal Banner Overlay inside Canvas
          if (sim.phase === 'goal' && sim.goalBannerSide !== null) {
            ctx.fillStyle = 'rgba(7, 10, 22, 0.52)';
            ctx.fillRect(0, 0, HS_ARENA_W, HS_ARENA_H);
            ctx.save();
            ctx.translate(HS_ARENA_W / 2, HS_ARENA_H / 2 - 20);
            ctx.fillStyle = '#FACC15';
            ctx.strokeStyle = '#090b1a';
            ctx.lineWidth = 8;
            ctx.font = '900 72px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const text = '¡GOOOOL!';
            ctx.strokeText(text, 0, 0);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          }

          ctx.restore();
        }
      }

      if (isPlayingNow || effectiveState?.status === 'playing') {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    isOffline,
    isSimAuthority,
    effectiveState?.status,
    effectiveState?.players,
    offlineSkin,
    offlineSim.phase,
    muted,
    onSendSyncStateOnline,
  ]);

  const handleOfflineRestart = (nextSkin?: HeadSoccerSkinId) => {
    triggerHaptic('medium');
    const chosen = nextSkin || offlineSkin;
    const rival = chosen === 'furia' ? 'maestro' : 'furia';
    const fresh = createHeadSoccerSimulation(chosen, rival);
    simRef.current = fresh;
    confettiRef.current = [];
    setOfflineSim(fresh);
    setHudSnapshot({
      scores: fresh.scores,
      timeLeftSec: fresh.timeLeftSec,
      isGoldenGoal: fresh.isGoldenGoal,
      phase: fresh.phase,
      goalBannerSide: null,
      winnerSide: null,
    });
  };

  // Online Pre-Match Lobby
  if (!isOffline && (!effectiveState || effectiveState.status === 'waiting')) {
    const state = effectiveState || createInitialHeadSoccerOnlineState({
      id: currentUser.id,
      name: currentUser.name,
      avatar: currentUser.avatar || '⚽',
      color: currentUser.color || '#9146FF',
    });
    const mySeat = state.players.find((p) => p?.userId === currentUser.id) || null;
    const canStart = isHost || state.players[0]?.userId === currentUser.id;

    return (
      <div className="w-full max-w-3xl mx-auto rounded-2xl bg-[#0e1120] border border-white/10 p-4 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-black text-lg text-white flex items-center gap-2">
              <span>⚽</span>
              <span>{pickLang(lang, { es: 'Fútbol Cabezones 1v1', ca: 'Futbol Capgrossos 1v1', en: 'Head Soccer 1v1' })}</span>
            </h3>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'Elige portería, selecciona tu cabezón y salta al estadio.',
                ca: 'Tria porteria, selecciona el teu jugador i salta a l’estadi.',
                en: 'Pick a side, choose your caricature head and kick off.',
              })}
            </p>
          </div>
          {!effectiveState && onStartOnline && (
            <button
              type="button"
              onClick={() => onStartOnline()}
              className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-bold cursor-pointer"
            >
              {pickLang(lang, { es: 'Abrir estadio', ca: 'Obrir estadi', en: 'Open stadium' })}
            </button>
          )}
        </div>

        {/* 2 Player Seats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([0, 1] as const).map((idx) => {
            const seat = state.players[idx];
            const isMine = seat?.userId === currentUser.id;
            const skin = getHeadSoccerSkin(seat?.skinId || (idx === 0 ? 'striker' : 'furia'));
            return (
              <div
                key={idx}
                className={`rounded-2xl p-3.5 border transition-all ${
                  isMine
                    ? 'bg-[#9146FF]/15 border-[#9146FF]/50'
                    : 'bg-white/[0.03] border-white/[0.08]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black border border-white/15 shrink-0"
                      style={{ backgroundColor: skin.primary }}
                    >
                      {seat ? seat.avatar : idx === 0 ? '🥅' : '🤖'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {seat ? seat.name : idx === 1 ? 'Libre (o Bot IA)' : 'Portería Izquierda'}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {seat ? skin.name : idx === 0 ? 'Local' : 'Visitante'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      if (!effectiveState) onStartOnline?.();
                      onJoinSeatOnline?.(isMine ? 'spectate' : idx);
                    }}
                    className={`min-h-9 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                      isMine
                        ? 'bg-white/10 hover:bg-white/20 text-zinc-200'
                        : 'bg-[#9146FF] hover:bg-[#7C2AE8] text-white'
                    }`}
                  >
                    {isMine ? 'Salir' : 'Unirme'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Skin Picker */}
        {mySeat && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              {pickLang(lang, { es: 'Tu Cabezón', ca: 'El teu jugador', en: 'Your Character' })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {HS_SKINS.map((sk) => {
                const selected = mySeat.skinId === sk.id;
                return (
                  <button
                    key={sk.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectSkinOnline?.(sk.id);
                    }}
                    className={`min-h-11 px-3 py-2 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all ${
                      selected
                        ? 'bg-white/10 border-[#BF94FF] text-white'
                        : 'bg-white/[0.03] border-white/[0.07] text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-white/25 shrink-0"
                      style={{ backgroundColor: sk.primary }}
                    />
                    <span className="text-xs font-bold truncate">{sk.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-zinc-400">
            {pickLang(lang, {
              es: 'Partido de 60 segundos · Gol de Oro si hay empate.',
              ca: 'Partit de 60 segons · Gol d’Or si hi ha empat.',
              en: '60s match · Golden Goal overtime on ties.',
            })}
          </span>
          {canStart && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                if (!effectiveState) onStartOnline?.();
                onStartMatchOnline?.();
              }}
              className="min-h-11 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 text-white text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{pickLang(lang, { es: '¡Empezar Partido!', ca: 'Començar Partit!', en: 'Kick Off!' })}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const leftPlayerName = isOffline
    ? currentUser.name
    : effectiveState?.players[0]?.name || 'Jugador 1';
  const rightPlayerName = isOffline
    ? 'Bot Furia'
    : effectiveState?.players[1]?.name || 'Jugador 2';

  const leftSkin = getHeadSoccerSkin(
    isOffline ? offlineSkin : effectiveState?.players[0]?.skinId || 'striker'
  );
  const rightSkin = getHeadSoccerSkin(
    isOffline
      ? offlineSkin === 'furia'
        ? 'maestro'
        : 'furia'
      : effectiveState?.players[1]?.skinId || 'furia'
  );

  const isFinished = hudSnapshot.phase === 'finished';
  const myWon =
    mySeatSide !== null && hudSnapshot.winnerSide === mySeatSide;
  const secondsDisplay = Math.ceil(hudSnapshot.timeLeftSec);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-2 select-none">
      {/* Live Stadium Scoreboard */}
      <div className="rounded-2xl bg-[#0e1120] border border-white/10 px-3 py-2 flex items-center justify-between gap-2 shadow-lg">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-xl border border-white/20 flex items-center justify-center text-xs font-black text-white shrink-0"
            style={{ backgroundColor: leftSkin.primary }}
          >
            {isOffline ? currentUser.avatar || '⚽' : effectiveState?.players[0]?.avatar || '⚽'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate flex items-center gap-1">
              <span>{leftPlayerName}</span>
              {!isOffline && effectiveState?.players[0] && voiceChat && (() => {
                const uId = effectiveState.players[0]!.userId;
                const peer = voiceChat.voicePeers.find((p) => p.userId === uId);
                const level = voiceChat.audioLevels?.[uId] ?? 0;
                const speaking = Boolean(
                  peer && !peer.isMuted && (level > 0.06 || voiceChat.speakingUserIds.includes(uId))
                );
                return (
                  <VoiceSpeakerIndicator
                    inVoice={Boolean(peer)}
                    isSpeaking={speaking}
                    isMuted={Boolean(peer?.isMuted)}
                    audioLevel={level}
                  />
                );
              })()}
            </div>
            <div className="text-[10px] text-zinc-400">{leftSkin.name}</div>
          </div>
        </div>

        {/* Center Score & Match Clock */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-xl bg-black/50 border border-white/10 shrink-0">
          <span className="font-display font-black text-xl text-white tabular-nums">
            {hudSnapshot.scores[0]}
          </span>
          <div className="flex flex-col items-center leading-none px-1">
            {hudSnapshot.isGoldenGoal ? (
              <span className="text-[10px] font-black text-amber-300 flex items-center gap-0.5 uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                GOL ORO
              </span>
            ) : (
              <span
                className={`font-mono text-xs font-black tabular-nums ${
                  secondsDisplay <= 10 ? 'text-rose-400 animate-pulse' : 'text-emerald-300'
                }`}
              >
                {secondsDisplay}s
              </span>
            )}
          </div>
          <span className="font-display font-black text-xl text-white tabular-nums">
            {hudSnapshot.scores[1]}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate flex items-center justify-end gap-1">
              {!isOffline && effectiveState?.players[1] && voiceChat && (() => {
                const uId = effectiveState.players[1]!.userId;
                const peer = voiceChat.voicePeers.find((p) => p.userId === uId);
                const level = voiceChat.audioLevels?.[uId] ?? 0;
                const speaking = Boolean(
                  peer && !peer.isMuted && (level > 0.06 || voiceChat.speakingUserIds.includes(uId))
                );
                return (
                  <VoiceSpeakerIndicator
                    inVoice={Boolean(peer)}
                    isSpeaking={speaking}
                    isMuted={Boolean(peer?.isMuted)}
                    audioLevel={level}
                  />
                );
              })()}
              <span>{rightPlayerName}</span>
            </div>
            <div className="text-[10px] text-zinc-400 flex items-center justify-end gap-1">
              {(isOffline || effectiveState?.players[1]?.isBot) && (
                <Bot className="w-3 h-3 text-amber-300" />
              )}
              <span>{rightSkin.name}</span>
            </div>
          </div>
          <div
            className="w-8 h-8 rounded-xl border border-white/20 flex items-center justify-center text-xs font-black text-white shrink-0"
            style={{ backgroundColor: rightSkin.primary }}
          >
            {isOffline ? '🤖' : effectiveState?.players[1]?.avatar || '🤖'}
          </div>
        </div>
      </div>

      {/* Offline quick skin switcher & restart strip */}
      {isOffline && (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {HS_SKINS.map((sk) => (
              <button
                key={sk.id}
                type="button"
                onClick={() => {
                  setOfflineSkin(sk.id);
                  handleOfflineRestart(sk.id);
                }}
                className={`min-h-8 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border cursor-pointer shrink-0 transition-all ${
                  offlineSkin === sk.id
                    ? 'bg-[#9146FF]/25 border-[#BF94FF] text-white'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: sk.primary }}
                />
                <span>{sk.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleOfflineRestart()}
            className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-bold text-zinc-200 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reiniciar</span>
          </button>
        </div>
      )}

      {/* Stadium Canvas */}
      <div className="relative w-full aspect-[900/520] rounded-2xl overflow-hidden border border-white/15 bg-[#090b1a] shadow-[0_18px_45px_rgba(0,0,0,0.65)]">
        <canvas
          ref={canvasRef}
          className="w-full h-full block touch-none"
        />

        {isFinished && (
          <VictoryCelebrationOverlay
            lang={lang}
            outcome={
              mySeatSide === null
                ? 'win'
                : myWon
                ? 'win'
                : 'defeat'
            }
            title={
              hudSnapshot.winnerSide === 0
                ? `${leftPlayerName} gana!`
                : `${rightPlayerName} gana!`
            }
            subtitle={
              myWon
                ? pickLang(lang, {
                    es: '¡Victoria épica en el estadio!',
                    ca: 'Victòria èpica a l’estadi!',
                    en: 'Epic stadium victory!',
                  })
                : pickLang(lang, {
                    es: 'Buen partido, pide la revancha.',
                    ca: 'Bon partit, demana la revenja.',
                    en: 'Great match — run it back!',
                  })
            }
            scoreBadge={`${hudSnapshot.scores[0]} - ${hudSnapshot.scores[1]}`}
            onPrimaryAction={() => {
              if (isOffline) handleOfflineRestart();
              else onRematchOnline?.();
            }}
          />
        )}
      </div>

      {/* Ergonomic Multi-Touch Mobile & Arcade Controls */}
      {(isOffline || mySeatSide !== null) && (
        <div className="flex items-center justify-between gap-3 pt-1 px-1 touch-none">
          {/* Left Side: Movement Arrows */}
          <div className="flex items-center gap-2.5">
            {(
              [
                { action: 'left' as const, label: '◀', aria: 'Mover izquierda' },
                { action: 'right' as const, label: '▶', aria: 'Mover derecha' },
              ]
            ).map((btn) => (
              <button
                key={btn.action}
                type="button"
                aria-label={btn.aria}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  updateTouchPointer(e.pointerId, btn.action);
                }}
                onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
                onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
                className="min-w-16 min-h-14 sm:min-w-20 sm:min-h-14 rounded-2xl bg-white/[0.08] active:bg-[#9146FF] border border-white/15 text-xl font-black text-white flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 font-mono">
              A / D · ◀ ▶
            </span>
            <span className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 font-mono">
              W / ▲ Saltar
            </span>
            <span className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 font-mono">
              Espacio Chutar
            </span>
          </div>

          {/* Right Side: Jump & Kick */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Saltar"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                updateTouchPointer(e.pointerId, 'jump');
              }}
              onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
              onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
              className="min-w-16 min-h-14 sm:min-w-20 sm:min-h-14 px-3 rounded-2xl bg-sky-500/25 active:bg-sky-500 border border-sky-400/40 text-xs sm:text-sm font-black text-sky-100 flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors"
            >
              ⬆ Saltar
            </button>
            <button
              type="button"
              aria-label="Chutar"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                updateTouchPointer(e.pointerId, 'kick');
              }}
              onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
              onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
              className="min-w-18 min-h-14 sm:min-w-24 sm:min-h-14 px-3.5 rounded-2xl bg-amber-500/25 active:bg-amber-500 border border-amber-400/45 text-xs sm:text-sm font-black text-amber-100 flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors"
            >
              ⚡ Chutar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
