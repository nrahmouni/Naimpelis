import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppLanguage,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  FutbolChapasState,
  Participant,
} from '../types';
import {
  CHAPAS_ARENA_H,
  CHAPAS_ARENA_W,
  CHAPAS_BALL_RADIUS,
  CHAPAS_CAP_RADIUS,
  CHAPAS_MAX_SIM_FRAMES,
  CHAPAS_PITCH_BOTTOM,
  CHAPAS_PITCH_LEFT,
  CHAPAS_PITCH_RIGHT,
  CHAPAS_PITCH_TOP,
  CHAPAS_TEAM_PRESETS,
  CHAPAS_TURN_TIMEOUT_MS,
  createInitialChapasState,
  isChapasFlippedForTeam,
  stepChapasPhysicsFrame,
} from '../shared/futbolChapas';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VictoryCelebrationOverlay, playGameSfx, useGameSoundMute } from './games/GameEffects';
import {
  drawChapasAimingGuides,
  drawChapasBallAndParticles,
  drawChapasStadiumBackdrop,
  drawFlagEmblem,
  getChapasFlagImage,
  type ImpactParticle,
} from './games/chapasRenderer';
import { PixiGameFxLayer, type PixiGameFxHandle } from './games/arcade/PixiGameFxLayer';
import {
  ChapasEmojiReactionDock,
  ChapasWaitingLobbyBar,
} from './games/ChapasLobbyAndHud';
import {
  ChapasScoreboardBar,
  ChapasGoalBannerOverlay,
  ChapasFooterBar,
} from './games/ChapasMatchHud';
import {
  useChapasOnlineAndBot,
  type ActiveChapasPlayback,
} from './games/useChapasOnlineAndBot';
import {
  spawnChapasBurst,
  stepChapasParticles,
  useChapasInteractions,
  type ChapasAimDragState,
} from './games/useChapasInteractions';
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
  const [floatingReaction, setFloatingReaction] = useState<{
    emoji: string;
    senderName?: string;
    id: number;
  } | null>(null);
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixiFxRef = useRef<PixiGameFxHandle | null>(null);
  const playbackRef = useRef<ActiveChapasPlayback | null>(null);
  const aimDragRef = useRef<ChapasAimDragState | null>(null);
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
  const isFlippedViewRef = useRef<boolean>(false);

  const { executeShot, triggerFloatingReactionToast } = useChapasOnlineAndBot({
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
  });

  const mySeats = useMemo(() => {
    if (!activeState) return [];
    return activeState.players.filter((p): p is NonNullable<typeof p> =>
      Boolean(p && !p.isBot && p.userId === currentUser.id)
    );
  }, [activeState, currentUser.id]);

  const mySeatForView = useMemo(() => {
    if (!activeState || mySeats.length === 0) return null;
    return mySeats.find((s) => s.team === activeState.activeTeam) || mySeats[0];
  }, [activeState, mySeats]);

  const isFlippedView = isChapasFlippedForTeam(mySeatForView?.team);
  isFlippedViewRef.current = isFlippedView;

  const activeSeat = activeState ? activeState.players[activeState.activeSeatIndex] : null;
  const isMyTurn = Boolean(
    activeState &&
      activeState.status === 'playing' &&
      !isSimulatingUI &&
      activeSeat &&
      !activeSeat.isBot &&
      activeSeat.userId === currentUser.id
  );

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleJoinSeat,
    handleCycleTeamFlag,
    handleToggleBots,
    handleStartMatch,
    handleRematch,
    sendQuickReaction,
  } = useChapasInteractions({
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
  });

  // ============================================================================
  // 60FPS CANVAS STADIUM RENDERER + REALTIME PHYSICS + PARTICLES LOOP
  // ============================================================================
  useEffect(() => {
    let rafId = 0;
    const spawnBurst = (x: number, y: number, count: number, palette: string[]) => {
      spawnChapasBurst(particlesRef, x, y, count, palette);
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
          pixiFxRef.current?.emitBurst(
            0.5,
            step.goalScoredBy === 'B' ? 0.14 : 0.86,
            'goal',
            26
          );
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
        particlesRef.current = stepChapasParticles(particlesRef.current);
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

      const flipped = isFlippedViewRef.current;
      if (flipped) {
        ctx.save();
        ctx.translate(CHAPAS_ARENA_W / 2, CHAPAS_ARENA_H / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-CHAPAS_ARENA_W / 2, -CHAPAS_ARENA_H / 2);
      }

      drawChapasStadiumBackdrop(
        ctx,
        ts,
        Boolean(goalBanner || pb?.goalBannerShown),
        netRipple
      );

      const drag = aimDragRef.current;
      if (drag && st.status === 'playing' && !pb) {
        const draggedCap = renderCaps.find((c) => c.id === drag.capId);
        if (draggedCap) {
          drawChapasAimingGuides(ctx, draggedCap, drag, flipped);
        }
      }

      // ================================================================
      // GLOSSY CHROME-BEZEL GLASS-DOMED TOKENS + CIRCLE-FLAGS SVG
      // ================================================================
      getChapasFlagImage(st.teamFlags.A);
      getChapasFlagImage(st.teamFlags.B);
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
        if (flipped) {
          ctx.rotate(Math.PI);
        }

        // Warm glowing orange aura ring around active movable tokens (Plato signature)
        if (isMovable) {
          const glowGrad = ctx.createRadialGradient(0, 0, r * 0.72, 0, 0, r + 9);
          glowGrad.addColorStop(0, 'rgba(251, 146, 60, 0)');
          glowGrad.addColorStop(0.55, `rgba(251, 146, 60, ${0.52 * activeTeamPulse})`);
          glowGrad.addColorStop(0.85, `rgba(249, 115, 22, ${0.72 * activeTeamPulse})`);
          glowGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = seatIsHumanTurn
            ? `rgba(255, 214, 153, ${0.88 * activeTeamPulse})`
            : `rgba(251, 146, 60, ${0.5 * activeTeamPulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, r + 4.2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Soft cast drop shadow on grass
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.beginPath();
        ctx.arc(2.2, 3.6, r + 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Smooth brushed silver/chrome outer bezel ring
        const bezelGrad = ctx.createLinearGradient(-r, -r, r, r);
        bezelGrad.addColorStop(0, '#FFFFFF');
        bezelGrad.addColorStop(0.35, '#E2E8F0');
        bezelGrad.addColorStop(0.7, '#94A3B8');
        bezelGrad.addColorStop(1, '#475569');
        ctx.fillStyle = bezelGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r + 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Subtle scalloped micro-rim accent
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Recessed metallic inner lip
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(0, 0, r - 2.3, 0, Math.PI * 2);
        ctx.fill();

        // High-DPI SVG Circle Flag Emblem
        drawFlagEmblem(ctx, flag, r - 3.2);

        // Curved glass dome reflection & soft lower rim vignette
        const sheen = ctx.createRadialGradient(-r * 0.34, -r * 0.38, 0.8, 0, 0, r);
        sheen.addColorStop(0, 'rgba(255,255,255,0.52)');
        sheen.addColorStop(0.38, 'rgba(255,255,255,0.12)');
        sheen.addColorStop(0.75, 'rgba(0,0,0,0.02)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.arc(0, 0, r - 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Subtle number pill tucked cleanly on lower-right edge without covering flag center
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.arc(r * 0.62, r * 0.62, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 8.5px Plus Jakarta Sans, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cap.number), r * 0.62, r * 0.64);

        ctx.restore();
      }

      drawChapasBallAndParticles(ctx, renderBall, pb?.ballTrail, particlesRef.current);

      if (flipped) {
        ctx.restore(); // restore 180° pitch flip before drawing upright apron HUD pills
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

  const canConfigureLobby = isOffline || isHost;
  const winnerFlag =
    activeState.winnerTeam === 'A'
      ? flagA
      : activeState.winnerTeam === 'B'
      ? flagB
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden select-none">
      <ChapasScoreboardBar
        lang={lang}
        activeState={activeState}
        flagA={flagA}
        flagB={flagB}
        currentUserId={currentUser.id}
        isOffline={isOffline}
        isSimulatingUI={isSimulatingUI}
        turnRatio={turnRatio}
        voiceChat={voiceChat}
        voicePeerMap={voicePeerMap}
        onJoinSeat={handleJoinSeat}
      />

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
        <PixiGameFxLayer ref={pixiFxRef} />

        {/* Subtle First-Shot Gloved-Hand Flick Hint */}
        {activeState.status === 'playing' &&
          isMyTurn &&
          activeState.passesUsed === 0 &&
          activeState.scores.A === 0 &&
          activeState.scores.B === 0 && (
            <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/75 border border-amber-300/45 text-[11px] font-bold text-amber-100 flex items-center gap-1.5 shadow-lg animate-pulse whitespace-nowrap">
              <span>👆</span>
              <span>
                {pickLang(lang, {
                  es: 'Arrastra cualquier chapa iluminada para disparar',
                  ca: 'Arrossega qualsevol xapa il·luminada per xutar',
                  en: 'Drag any glowing cap back & release to flick',
                })}
              </span>
            </div>
          )}

        <ChapasEmojiReactionDock
          lang={lang}
          emojiMenuOpen={emojiMenuOpen}
          onToggleOpen={() => setEmojiMenuOpen((o) => !o)}
          onSendEmoji={sendQuickReaction}
        />

        {/* Non-Intrusive Floating Reaction Toast */}
        {floatingReaction && (
          <div
            key={floatingReaction.id}
            aria-live="polite"
            className="pointer-events-none select-none absolute right-3 top-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-[#0D1017]/82 backdrop-blur-md border border-white/15 shadow-xl animate-bounce"
          >
            <span className="text-2xl leading-none">{floatingReaction.emoji}</span>
            {floatingReaction.senderName && (
              <span className="text-[10px] font-bold text-zinc-100 max-w-[90px] truncate">
                {floatingReaction.senderName}
              </span>
            )}
          </div>
        )}

        {goalBanner && (
          <ChapasGoalBannerOverlay goalBanner={goalBanner} scores={activeState.scores} />
        )}

        {activeState.status === 'waiting' && (
          <ChapasWaitingLobbyBar
            lang={lang}
            activeState={activeState}
            flagA={flagA}
            flagB={flagB}
            canConfigureLobby={canConfigureLobby}
            isOffline={isOffline}
            hasMySeat={mySeats.length > 0}
            onCycleTeamFlag={handleCycleTeamFlag}
            onToggleBots={handleToggleBots}
            onJoinSeat={handleJoinSeat}
            onStartMatch={handleStartMatch}
          />
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

      <ChapasFooterBar
        lang={lang}
        status={activeState.status}
        isMyTurn={isMyTurn}
        activeSeatName={activeSeat?.name}
        isOffline={isOffline}
        hasMySeats={mySeats.length > 0}
        onRematch={handleRematch}
        onForfeitOnline={onForfeitOnline}
      />
    </div>
  );
};
