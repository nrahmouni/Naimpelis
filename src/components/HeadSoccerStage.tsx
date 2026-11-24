import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, RotateCcw, Sparkles } from 'lucide-react';
import type { AppLanguage, Participant } from '../types';
import {
  HS_ARENA_H,
  HS_ARENA_W,
  HS_CROSSBAR_Y,
  HS_GOAL_W,
  HS_MATCH_DURATION_SEC,
  HS_SKINS,
  chooseHeadSoccerAiInput,
  createHeadSoccerSimulation,
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
import {
  drawCaricaturePlayer,
  drawGoals,
  drawSoccerBall,
  drawStadiumAndField,
  type ConfettiDot,
} from './games/headSoccerRenderer';
import {
  HeadSoccerTouchControls,
  HeadSoccerWaitingLobby,
} from './games/HeadSoccerLobbyAndControls';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { socketService } from '../services/socket';
import { drawArcadeSprite } from './games/arcade/arcadeSprites';
import { fireVictoryConfetti } from './games/arcade/arcadeAnimations';
import { PixiGameFxLayer, type PixiGameFxHandle } from './games/arcade/PixiGameFxLayer';

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

const EMPTY_INPUT: HeadSoccerInput = { left: false, right: false, jump: false, kick: false, superKick: false };

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
    superCharge: [number, number];
    timeLeftSec: number;
    isGoldenGoal: boolean;
    phase: HeadSoccerSimulation['phase'];
    goalBannerSide: 0 | 1 | null;
    winnerSide: 0 | 1 | null;
  }>({
    scores: [0, 0],
    superCharge: [30, 30],
    timeLeftSec: HS_MATCH_DURATION_SEC,
    isGoldenGoal: false,
    phase: 'playing',
    goalBannerSide: null,
    winnerSide: null,
  });
  const [showControlHint, setShowControlHint] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixiFxRef = useRef<PixiGameFxHandle | null>(null);
  const simRef = useRef<HeadSoccerSimulation>(createHeadSoccerSimulation('striker', 'furia'));
  const localInputRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const touchButtonsRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const keyButtonsRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const remoteInputRef = useRef<HeadSoccerInput>({ ...EMPTY_INPUT });
  const gyroP1Ref = useRef<{ steer: number; jump: boolean; kick: boolean; expiresAt: number }>({ steer: 0, jump: false, kick: false, expiresAt: 0 });
  const gyroP2Ref = useRef<{ steer: number; jump: boolean; kick: boolean; expiresAt: number }>({ steer: 0, jump: false, kick: false, expiresAt: 0 });
  const activePointersRef = useRef<Map<number, keyof HeadSoccerInput>>(new Map());
  const confettiRef = useRef<ConfettiDot[]>([]);
  const lastSyncSentAtRef = useRef(0);
  const lastInputSentJsonRef = useRef('');
  const lastSeqAppliedRef = useRef(-1);

  useEffect(() => {
    const activeRid = socketService.getActiveRoomId();
    if (socketService.isConnected() && activeRid) {
      socketService.joinGyroChannel('display', `${currentUser.name || 'TV'} (HeadSoccer)`, activeRid, { gameId: 'headsoccer' });
    }
    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot = ev.payload.playerSlot === 2 ? 2 : 1;
        const tgt = slot === 2 ? gyroP2Ref : gyroP1Ref;
        const st = Number(ev.payload.steer || 0);
        tgt.current = {
          steer: st,
          jump: Number(ev.payload.throttle || 0) > 0.35 || Boolean(ev.payload.handbrake),
          kick: Boolean(ev.payload.nitro),
          expiresAt: Date.now() + 1200,
        };
      }
    });
    return () => unsub();
  }, [currentUser.name]);

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
        superCharge: fresh.superCharge ?? [30, 30],
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
      superCharge: latestSyncSnapshot.sim.superCharge ?? [0, 0],
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
      superKick: Boolean(k.superKick || t.superKick),
    };
    localInputRef.current = merged;

    if (!isOffline && mySeatSide !== null && mySeatSide === 1 && effectiveState?.status === 'playing') {
      const json = `${merged.left ? 1 : 0}${merged.right ? 1 : 0}${merged.jump ? 1 : 0}${merged.kick ? 1 : 0}${merged.superKick ? 1 : 0}`;
      if (json !== lastInputSentJsonRef.current) {
        lastInputSentJsonRef.current = json;
        onSendInputOnline?.(mySeatSide, merged);
      }
    }
  }, [isOffline, mySeatSide, effectiveState?.status, onSendInputOnline]);

  // Keyboard bindings (WASD + Arrows + Space + E/Shift for Super Shot)
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
        case 'KeyE':
        case 'ShiftLeft':
        case 'ShiftRight':
          return 'superKick';
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
      setShowControlHint(false);
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
      if (action !== null) setShowControlHint(false);
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
        const tNowHs = Date.now();
        const useG1Hs = tNowHs < gyroP1Ref.current.expiresAt;
        const useG2Hs = tNowHs < gyroP2Ref.current.expiresAt;
        const baseLeft = localInputRef.current;
        const leftInp: HeadSoccerInput = useG1Hs
          ? {
              left: baseLeft.left || gyroP1Ref.current.steer < -0.14,
              right: baseLeft.right || gyroP1Ref.current.steer > 0.14,
              jump: baseLeft.jump || gyroP1Ref.current.jump,
              kick: baseLeft.kick || gyroP1Ref.current.kick,
            }
          : baseLeft;
        const seat1IsBot = !useG2Hs && (isOffline || Boolean(effectiveState?.players[1]?.isBot));
        const rightInp: HeadSoccerInput = useG2Hs
          ? {
              left: gyroP2Ref.current.steer < -0.14,
              right: gyroP2Ref.current.steer > 0.14,
              jump: gyroP2Ref.current.jump,
              kick: gyroP2Ref.current.kick,
            }
          : seat1IsBot
          ? chooseHeadSoccerAiInput(sim, 1)
          : remoteInputRef.current;
        const events = stepHeadSoccerFrame(sim, [leftInp, rightInp], dt);

        if (events.superShot) {
          playGameSfx('chapas_goal', muted);
          triggerHaptic('success');
          pixiFxRef.current?.emitBurst(
            Math.max(0.05, Math.min(0.95, sim.ball.x / HS_ARENA_W)),
            Math.max(0.1, Math.min(0.9, sim.ball.y / HS_ARENA_H)),
            'smash',
            26
          );
        } else if (events.kicked) {
          playGameSfx('chapas_kick', muted);
          triggerHaptic('light');
        } else if (events.headed) {
          playGameSfx('board_move', muted);
        } else if (events.postHit) {
          playGameSfx('chapas_bounce', muted);
          pixiFxRef.current?.emitBurst(
            Math.max(0.05, Math.min(0.95, sim.ball.x / HS_ARENA_W)),
            Math.max(0.1, Math.min(0.9, sim.ball.y / HS_ARENA_H)),
            'spark',
            12
          );
        }

        if (events.goalScoredBy !== undefined) {
          playGameSfx('chapas_goal', muted);
          triggerHaptic('success');
          fireVictoryConfetti('goal');
          pixiFxRef.current?.emitBurst(events.goalScoredBy === 0 ? 0.92 : 0.08, 0.58, 'goal', 24);
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
          if (won) fireVictoryConfetti('gold');
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
        const sc = sim.superCharge ?? [0, 0];
        setHudSnapshot({
          scores: [sim.scores[0], sim.scores[1]],
          superCharge: [sc[0], sc[1]],
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

          drawStadiumAndField(ctx, now / 1000, sim.phase === 'goal');
          drawCaricaturePlayer(
            ctx,
            sim.players[0],
            sim.ball.x,
            sim.ball.y,
            effectiveState?.players[0]?.skinId || offlineSkin,
            sim.superCharge?.[0] ?? 0
          );
          drawCaricaturePlayer(
            ctx,
            sim.players[1],
            sim.ball.x,
            sim.ball.y,
            effectiveState?.players[1]?.skinId || 'furia',
            sim.superCharge?.[1] ?? 0
          );
          drawSoccerBall(ctx, sim.ball);
          drawGoals(ctx, sim.netRipple ?? 0, sim.goalBannerSide, now / 1000);

          // Confetti (Kenney Particle Pack stars + ribbons)
          for (let ci = 0; ci < confettiRef.current.length; ci += 1) {
            const d = confettiRef.current[ci];
            const alpha = Math.max(0, Math.min(1, d.life));
            if (ci % 3 === 0) {
              if (!drawArcadeSprite(ctx, 'assets/games/particles/star_07.png', d.x, d.y, 18, 18, d.life * 5, alpha)) {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = d.color;
                ctx.fillRect(d.x, d.y, d.size, d.size * 1.3);
              }
            } else {
              ctx.globalAlpha = alpha;
              ctx.fillStyle = d.color;
              ctx.fillRect(d.x, d.y, d.size, d.size * 1.3);
            }
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
      superCharge: fresh.superCharge ?? [30, 30],
      timeLeftSec: fresh.timeLeftSec,
      isGoldenGoal: fresh.isGoldenGoal,
      phase: fresh.phase,
      goalBannerSide: null,
      winnerSide: null,
    });
  };

  if (!isOffline && (!effectiveState || effectiveState.status === 'waiting')) {
    return (
      <HeadSoccerWaitingLobby
        lang={lang}
        currentUser={currentUser}
        effectiveState={effectiveState}
        isHost={isHost}
        onStartOnline={onStartOnline}
        onJoinSeatOnline={onJoinSeatOnline}
        onSelectSkinOnline={onSelectSkinOnline}
        onStartMatchOnline={onStartMatchOnline}
      />
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
  const mySideIndex = mySeatSide === 1 ? 1 : 0;
  const mySuperReady = hudSnapshot.superCharge[mySideIndex] >= 100;

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
          <div className="min-w-0 flex-1 max-w-[140px]">
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
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, hudSnapshot.superCharge[0])}%`,
                    backgroundColor: hudSnapshot.superCharge[0] >= 100 ? '#facc15' : '#38bdf8',
                  }}
                />
              </div>
              <span className="text-[9px] font-bold text-zinc-400 tabular-nums">
                {hudSnapshot.superCharge[0] >= 100 ? '🔥' : `${Math.round(hudSnapshot.superCharge[0])}%`}
              </span>
            </div>
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
                  secondsDisplay <= 10 ? 'text-rose-400' : 'text-emerald-300'
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
          <div className="min-w-0 flex-1 max-w-[140px]">
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
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className="text-[9px] font-bold text-zinc-400 tabular-nums">
                {hudSnapshot.superCharge[1] >= 100 ? '🔥' : `${Math.round(hudSnapshot.superCharge[1])}%`}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, hudSnapshot.superCharge[1])}%`,
                    backgroundColor: hudSnapshot.superCharge[1] >= 100 ? '#facc15' : '#fb7185',
                  }}
                />
              </div>
              {(isOffline || effectiveState?.players[1]?.isBot) && (
                <Bot className="w-3 h-3 text-amber-300 shrink-0" />
              )}
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
          width={HS_ARENA_W}
          height={HS_ARENA_H}
          className="w-full h-full block touch-none"
        />
        <PixiGameFxLayer ref={pixiFxRef} />

        {showControlHint && !isFinished && hudSnapshot.phase === 'playing' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center px-3">
            <div className="px-3.5 py-1 rounded-full bg-[#090b1a]/88 border border-white/20 text-[11px] font-bold text-slate-200 shadow-lg">
              {pickLang(lang, {
                es: 'Muévete con ◀ ▶, salta ▲ y chuta con ⚽',
                ca: 'Mou-te amb ◀ ▶, salta ▲ i xuta amb ⚽',
                en: 'Move with ◀ ▶, jump ▲ and shoot with ⚽',
              })}
            </div>
          </div>
        )}

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

      {(isOffline || mySeatSide !== null) && (
        <HeadSoccerTouchControls updateTouchPointer={updateTouchPointer} superReady={mySuperReady} />
      )}
    </div>
  );
};
