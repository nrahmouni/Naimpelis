import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, RotateCcw, Smartphone, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { triggerHaptic } from '../../utils/haptics';
import { DualGyroQrPanel, type DualGyroControllerPeer } from './racing/DualGyroQrPanel';
import { playArcadeSfx } from './arcade/arcadeAudio';
import {
  animateModalEntrance,
  fireVictoryConfetti,
  GameSpriteVfxPool,
  preloadOnlineGameAssets,
} from './arcade/arcadeAnimations';
import { RobotMascot3DBadge } from './arcade/RobotMascot3DBadge';
import {
  drawArcadeSprite,
  drawArcadeSpriteRect,
} from './arcade/arcadeSprites';

export type GyroMotionGameId = 'gyrobowling' | 'gyrotennis' | 'gyrolab';

interface GyroMotionPackStageProps {
  gameId: GyroMotionGameId;
  lang: AppLanguage;
  roomId: string;
  userName: string;
  onClose?: () => void;
}

interface GyroPadInput {
  steer: number;
  pitch: number;
  roll: number;
  swing: number;
  throttle: number;
  brake: number;
  nitro: boolean;
  handbrake: boolean;
  expiresAt: number;
}

const EMPTY_PAD: GyroPadInput = {
  steer: 0,
  pitch: 0,
  roll: 0,
  swing: 0,
  throttle: 0,
  brake: 0,
  nitro: false,
  handbrake: false,
  expiresAt: 0,
};

function loadBackdrop(src: string, onLoad: (img: HTMLImageElement) => void): void {
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.src = src;
  img.onload = () => onLoad(img);
}

export const GyroMotionPackStage: React.FC<GyroMotionPackStageProps> = ({
  gameId,
  roomId,
  userName,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropRef = useRef<HTMLImageElement | null>(null);
  const gyroP1Ref = useRef<GyroPadInput>({ ...EMPTY_PAD });
  const gyroP2Ref = useRef<GyroPadInput>({ ...EMPTY_PAD });
  const keysRef = useRef({
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    alt: false,
  });

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [showQrModal, setShowQrModal] = useState(false);
  const [controllers, setControllers] = useState<DualGyroControllerPeer[]>([]);
  const controllersRef = useRef<DualGyroControllerPeer[]>([]);
  controllersRef.current = controllers;

  const [hud, setHud] = useState({
    leftText:
      gameId === 'gyrobowling'
        ? 'FRAME 1/5 · J1 0'
        : gameId === 'gyrotennis'
        ? 'J1 0 - 0 CPU'
        : 'ESTRELLAS 0/5',
    rightText:
      gameId === 'gyrobowling'
        ? 'TIRO 1 · 10 BOLOS'
        : gameId === 'gyrotennis'
        ? 'A 7 PUNTOS'
        : 'NIVEL 1 · 60s',
  });
  const [finishSummary, setFinishSummary] = useState<{ title: string; sub: string } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || `${gameId}-local`).trim().toLowerCase(),
    [gameId, roomId]
  );

  const finishCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bgSrc =
      gameId === 'gyrobowling'
        ? '/assets/games/arenas/bowling_alley.jpg'
        : gameId === 'gyrotennis'
        ? '/assets/games/arenas/tennis_court.jpg'
        : '/assets/games/arenas/labyrinth_board.jpg';
    loadBackdrop(bgSrc, (img) => {
      backdropRef.current = img;
    });
    preloadOnlineGameAssets();
  }, [gameId]);

  useEffect(() => {
    if (!finishSummary) return;
    animateModalEntrance(finishCardRef.current);
    fireVictoryConfetti(
      gameId === 'gyrobowling' ? 'strike' : gameId === 'gyrotennis' ? 'gold' : 'arcade'
    );
  }, [finishSummary, gameId]);

  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-gm-${effectiveRoomId}`,
          name: `${userName || 'Jugador'} (${gameId})`,
          avatar: gameId === 'gyrobowling' ? '🎳' : gameId === 'gyrotennis' ? '🎾' : '🧿',
          color: '#22d3ee',
          role: 'host',
          isHost: true,
          joinedAt: Date.now(),
        },
        `Sala ${effectiveRoomId.toUpperCase()}`
      );
    } else {
      socketService.joinGyroChannel('display', `${userName || 'Jugador'} (${gameId})`, effectiveRoomId, {
        gameId,
      });
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'ROOM_STATE') {
        socketService.joinGyroChannel('display', `${userName || 'Jugador'} (${gameId})`, effectiveRoomId, {
          gameId,
        });
      } else if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as DualGyroControllerPeer[])
          : [];
        setControllers(list);
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot = ev.payload.playerSlot === 2 ? 2 : 1;
        const tgt = slot === 2 ? gyroP2Ref : gyroP1Ref;
        tgt.current = {
          steer: Number(ev.payload.steer || 0),
          pitch: Number(ev.payload.pitch || 0),
          roll: Number(ev.payload.roll || 0),
          swing: Number(ev.payload.swing || 0),
          throttle: Number(ev.payload.throttle || 0),
          brake: Number(ev.payload.brake || 0),
          nitro: Boolean(ev.payload.nitro),
          handbrake: Boolean(ev.payload.handbrake),
          expiresAt: Date.now() + 1400,
        };
      }
    });
    return () => unsub();
  }, [effectiveRoomId, gameId, userName]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysRef.current.left = true;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keysRef.current.right = true;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.up = true;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') keysRef.current.down = true;
      else if (k === ' ' || k === 'Enter') {
        keysRef.current.action = true;
        e.preventDefault();
      } else if (k === 'Shift') keysRef.current.alt = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysRef.current.left = false;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keysRef.current.right = false;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.up = false;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') keysRef.current.down = false;
      else if (k === ' ' || k === 'Enter') keysRef.current.action = false;
      else if (k === 'Shift') keysRef.current.alt = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 920;
    const H = 520;
    let rafId = 0;
    let alive = true;
    let lastTs = performance.now();
    const vfx = new GameSpriteVfxPool();
    setFinishSummary(null);

    const pushScoreTelemetry = (s1: number, s2: number, tag?: string, pulse?: number) => {
      if (!socketService.isConnected()) return;
      socketService.sendRacingTelemetry(
        {
          roomId: socketService.getActiveRoomId() || effectiveRoomId,
          speedKmh: 0,
          rpmPct: 60,
          gear: 1,
          lap: 1,
          totalLaps: 5,
          position: 1,
          totalCars: 2,
          nitroPct: 100,
          raceState: 'racing',
          scoreP1: s1,
          scoreP2: s2,
          eventTag: tag,
          hapticPulseMs: pulse,
        },
        socketService.getActiveRoomId() || effectiveRoomId
      );
    };

    // -----------------------------------------------------------------
    // 1. GYRO BOWLING 3D PRO
    // -----------------------------------------------------------------
    if (gameId === 'gyrobowling') {
      const makePins = () => {
        const out: Array<{ x: number; y: number; vx: number; vy: number; up: boolean; rot: number }> = [];
        const rows = 4;
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c <= r; c += 1) {
            out.push({
              x: (c - r * 0.5) * 0.24,
              y: 0.9 - r * 0.045,
              vx: 0,
              vy: 0,
              up: true,
              rot: 0,
            });
          }
        }
        return out;
      };

      const st = {
        frame: 1,
        maxFrames: 5,
        rollNum: 1,
        turnPlayer: 1 as 1 | 2,
        scores: [0, 0],
        aimX: 0,
        spin: 0,
        phase: 'aim' as 'aim' | 'roll' | 'settle' | 'over',
        ball: { x: 0, y: 0.06, vx: 0, vy: 0, curve: 0, rot: 0 },
        pins: makePins(),
        settleT: 0,
        banner: '',
        bannerT: 0,
        sparks: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number }>,
      };

      const prevThrow = { p1: false, p2: false };

      const resetBowl = () => {
        st.frame = 1;
        st.rollNum = 1;
        st.turnPlayer = 1;
        st.scores = [0, 0];
        st.phase = 'aim';
        st.pins = makePins();
        st.banner = '';
        st.bannerT = 0;
        setHud({ leftText: 'FRAME 1/5 · J1 0', rightText: 'TIRO 1 · 10 BOLOS' });
      };
      resetBowl();

      const frameLoop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
        lastTs = now;

        const twoHumans = controllersRef.current.length >= 2 || controllersRef.current.some((c) => c.slot === 2);
        const pad = st.turnPlayer === 2 && twoHumans ? gyroP2Ref.current : gyroP1Ref.current;
        const padFresh = pad.expiresAt > Date.now();
        const steer = padFresh
          ? pad.steer
          : (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
        const hookInput = padFresh ? pad.roll : 0;
        const swingNow = padFresh ? pad.swing > 1.05 || pad.nitro || pad.throttle > 0.5 : keysRef.current.action;
        const pKey = st.turnPlayer === 2 && twoHumans ? 'p2' : 'p1';
        const triggered = swingNow && !prevThrow[pKey];
        prevThrow[pKey] = swingNow;

        if (st.bannerT > 0) st.bannerT = Math.max(0, st.bannerT - dt);
        for (let i = st.sparks.length - 1; i >= 0; i -= 1) {
          const sp = st.sparks[i];
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          sp.life -= dt;
          if (sp.life <= 0) st.sparks.splice(i, 1);
        }

        if (st.phase === 'aim') {
          st.aimX = Math.max(-0.82, Math.min(0.82, steer * 0.85));
          st.spin = hookInput;
          if (triggered) {
            st.phase = 'roll';
            const speedMult = padFresh ? Math.min(1.45, Math.max(0.95, 0.95 + pad.swing * 0.25)) : 1.15;
            st.ball = {
              x: st.aimX,
              y: 0.06,
              vx: steer * 0.16,
              vy: 0.85 * speedMult,
              curve: hookInput * 0.52,
              rot: 0,
            };
            playArcadeSfx(240, 0.12, 'triangle', 0.08, mutedRef.current);
            pushScoreTelemetry(st.scores[0], st.scores[1], 'bowling_roll', 45);
          }
        } else if (st.phase === 'roll') {
          const b = st.ball;
          b.vx += b.curve * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += dt * 14;
          const inGutter = Math.abs(b.x) > 0.86;
          if (inGutter) b.vx *= 0.85;

          for (const pin of st.pins) {
            if (!pin.up) continue;
            const dx = pin.x - b.x;
            const dy = pin.y - b.y;
            if (Math.hypot(dx, dy) < 0.14 && !inGutter) {
              pin.up = false;
              pin.vx = dx * 9 + b.vx * 1.4 + (Math.random() - 0.5) * 0.8;
              pin.vy = dy * 6 + 0.9;
              playArcadeSfx(620 + Math.random() * 140, 0.07, 'square', 0.07, mutedRef.current);
              for (let k = 0; k < 5; k += 1) {
                st.sparks.push({
                  x: 460 + pin.x * 165,
                  y: 165 + (1 - pin.y) * 290,
                  vx: (Math.random() - 0.5) * 220,
                  vy: -80 - Math.random() * 140,
                  life: 0.45,
                });
              }
              vfx.emitBurst(
                460 + pin.x * 165,
                165 + (1 - pin.y) * 290,
                ['assets/games/particles/spark_01.png', 'assets/games/particles/star_07.png', 'assets/games/particles/flare_01.png'],
                4,
                190,
                32,
                0.42
              );
            }
          }
          // Pin-to-pin domino chain
          for (const pA of st.pins) {
            if (pA.up) continue;
            pA.x += pA.vx * dt;
            pA.y += pA.vy * dt;
            pA.rot += dt * 9;
            for (const pB of st.pins) {
              if (!pB.up) continue;
              if (Math.hypot(pA.x - pB.x, pA.y - pB.y) < 0.22) {
                pB.up = false;
                pB.vx = (pB.x - pA.x) * 4 + (Math.random() - 0.5) * 0.6;
                pB.vy = 0.7;
                playArcadeSfx(540, 0.06, 'triangle', 0.05, mutedRef.current);
              }
            }
          }

          if (b.y >= 1.12) {
            st.phase = 'settle';
            st.settleT = 1.05;
            const knockedTotal = st.pins.filter((p) => !p.up).length;
            if (knockedTotal === 10 && st.rollNum === 1) {
              st.banner = '⚡ ¡STRIKE PERFECTO! (+20)';
              st.bannerT = 1.3;
              st.scores[st.turnPlayer - 1] += 20;
              playArcadeSfx(880, 0.28, 'triangle', 0.1, mutedRef.current);
              pushScoreTelemetry(st.scores[0], st.scores[1], 'bowling_strike', 120);
            } else {
              const pts = knockedTotal;
              st.scores[st.turnPlayer - 1] += st.rollNum === 1 ? pts : Math.max(0, pts - 0);
              if (knockedTotal === 10) {
                st.banner = '✨ ¡SPARE! (+12)';
                st.scores[st.turnPlayer - 1] += 2;
              } else {
                st.banner = `${knockedTotal} BOLOS DERRIBADOS`;
              }
              st.bannerT = 1.0;
              pushScoreTelemetry(st.scores[0], st.scores[1], undefined, 40);
            }
          }
        } else if (st.phase === 'settle') {
          st.settleT -= dt;
          if (st.settleT <= 0) {
            const upLeft = st.pins.filter((p) => p.up).length;
            if (st.rollNum === 1 && upLeft > 0) {
              st.rollNum = 2;
              st.phase = 'aim';
            } else {
              st.rollNum = 1;
              if (twoHumans && st.turnPlayer === 1) {
                st.turnPlayer = 2;
              } else {
                st.turnPlayer = 1;
                st.frame += 1;
              }
              if (st.frame > st.maxFrames) {
                st.phase = 'over';
                const winTitle = twoHumans
                  ? st.scores[0] >= st.scores[1]
                    ? `🏆 Gana Jugador 1 (${st.scores[0]} pts)`
                    : `🏆 Gana Jugador 2 (${st.scores[1]} pts)`
                  : `🏆 Partida completada · ${st.scores[0]} pts`;
                setFinishSummary({
                  title: winTitle,
                  sub: twoHumans ? `J1 ${st.scores[0]} - ${st.scores[1]} J2` : `${st.frame - 1} rondas jugadas`,
                });
              } else {
                st.pins = makePins();
                st.phase = 'aim';
              }
            }
            const upCount = st.pins.filter((p) => p.up).length;
            setHud({
              leftText: `FRAME ${Math.min(st.frame, st.maxFrames)}/${st.maxFrames} · J1 ${st.scores[0]}${twoHumans ? ' / J2 ' + st.scores[1] : ''}`,
              rightText: `TURNO J${st.turnPlayer} · TIRO ${st.rollNum} · ${upCount} BOLOS`,
            });
          }
        }

        // DRAW BOWLING ARENA
        ctx.clearRect(0, 0, W, H);
        if (backdropRef.current) {
          ctx.drawImage(backdropRef.current, 0, 0, W, H);
          ctx.fillStyle = 'rgba(5, 8, 20, 0.24)';
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = '#090d1b';
          ctx.fillRect(0, 0, W, H);
        }

        // Perspective hardwood lane overlay for ultra clear pin & ball alignment
        const topW = 240;
        const botW = 540;
        const laneTopY = 148;
        const laneBotY = H - 12;
        ctx.fillStyle = 'rgba(180, 108, 42, 0.42)';
        ctx.beginPath();
        ctx.moveTo(W / 2 - topW / 2, laneTopY);
        ctx.lineTo(W / 2 + topW / 2, laneTopY);
        ctx.lineTo(W / 2 + botW / 2, laneBotY);
        ctx.lineTo(W / 2 - botW / 2, laneBotY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();

        const projectLane = (lx: number, ly: number) => {
          const depth = Math.max(0, Math.min(1.15, ly));
          const halfW = (botW * 0.5) * (1 - depth * 0.54);
          return {
            sx: W / 2 + lx * halfW,
            sy: laneBotY - depth * (laneBotY - laneTopY),
            scale: 1 - depth * 0.48,
          };
        };

        // Aim arrow + curve preview when aiming
        if (st.phase === 'aim') {
          const p0 = projectLane(st.aimX, 0.08);
          const p1 = projectLane(st.aimX + st.spin * 0.3, 0.88);
          ctx.strokeStyle = st.turnPlayer === 2 ? 'rgba(244,63,94,0.85)' : 'rgba(56,189,248,0.85)';
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(p0.sx, p0.sy);
          ctx.quadraticCurveTo(p0.sx - st.spin * 60, (p0.sy + p1.sy) * 0.5, p1.sx, p1.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw Pins back-to-front
        for (const pin of st.pins) {
          const pp = projectLane(pin.x, pin.y);
          ctx.save();
          ctx.translate(pp.sx, pp.sy);
          ctx.rotate(pin.rot);
          ctx.scale(pp.scale, pp.scale);
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.ellipse(0, 6, 12, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          const pg = ctx.createLinearGradient(-10, -42, 10, 6);
          pg.addColorStop(0, '#ffffff');
          pg.addColorStop(1, '#cbd5e1');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.ellipse(0, -14, 10, 22, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, -34, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(-7, -26, 14, 4);
          ctx.restore();
        }

        // Draw Bowling Ball sprite (Kenney Sports Pack)
        const ballPos = st.phase === 'aim' ? projectLane(st.aimX, 0.06) : projectLane(st.ball.x, st.ball.y);
        const br = 26 * ballPos.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(ballPos.sx, ballPos.sy + br * 0.5, br * 0.9, br * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        if (
          !drawArcadeSprite(
            ctx,
            st.turnPlayer === 2 ? 'assets/games/sports/ball_bowling2.png' : 'assets/games/sports/ball_bowling1.png',
            ballPos.sx,
            ballPos.sy,
            br * 2,
            br * 2,
            st.ball.rot
          )
        ) {
          ctx.fillStyle = st.turnPlayer === 2 ? '#e11d48' : '#0284c7';
          ctx.beginPath();
          ctx.arc(ballPos.sx, ballPos.sy, br, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const sp of st.sparks) {
          drawArcadeSprite(ctx, 'assets/games/particles/star_07.png', sp.x, sp.y, 24, 24, sp.life * 6);
        }
        vfx.stepAndDraw(ctx, dt);

        if (st.bannerT > 0 && st.banner) {
          ctx.fillStyle = 'rgba(8, 12, 24, 0.85)';
          ctx.fillRect(W / 2 - 210, 52, 420, 56);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(W / 2 - 210, 52, 420, 56);
          ctx.font = 'bold 24px sans-serif';
          ctx.fillStyle = '#fef08a';
          ctx.textAlign = 'center';
          ctx.fillText(st.banner, W / 2, 88);
        }

        rafId = requestAnimationFrame(frameLoop);
      };
      rafId = requestAnimationFrame(frameLoop);
      return () => {
        alive = false;
        cancelAnimationFrame(rafId);
      };
    }

    // -----------------------------------------------------------------
    // 2. GYRO TENNIS SLAM PRO 2P
    // -----------------------------------------------------------------
    if (gameId === 'gyrotennis') {
      const WIN_PTS = 7;
      const st = {
        s1: 0,
        s2: 0,
        over: false,
        pauseT: 0.7,
        p1: { x: 0, y: 0.85, swingT: 0 },
        p2: { x: 0, y: -0.85, swingT: 0 },
        ball: { x: 0, y: 0, z: 0.25, vx: 0.25, vy: 1.05, vz: 0.4, lastHit: 0 },
        banner: '¡SAQUE INICIAL!',
      };

      const resetPoint = (dirY: number) => {
        st.ball = {
          x: (Math.random() - 0.5) * 0.4,
          y: 0,
          z: 0.32,
          vx: (Math.random() - 0.5) * 0.55,
          vy: dirY * 1.15,
          vz: 0.45,
          lastHit: 0,
        };
        st.pauseT = 0.65;
      };
      resetPoint(1);

      const frameLoop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
        lastTs = now;

        const twoHumans = controllersRef.current.length >= 2 || controllersRef.current.some((c) => c.slot === 2);
        const g1 = gyroP1Ref.current;
        const g2 = gyroP2Ref.current;

        if (!st.over) {
          const p1Fresh = g1.expiresAt > Date.now();
          const p1TargetX = p1Fresh
            ? Math.max(-1, Math.min(1, g1.steer * 1.15))
            : Math.max(-1, Math.min(1, st.p1.x + ((keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0)) * dt * 1.9));
          st.p1.x += (p1TargetX - st.p1.x) * Math.min(1, dt * 14);
          if ((p1Fresh && (g1.swing > 1 || g1.nitro)) || keysRef.current.action) {
            st.p1.swingT = 0.25;
          }
          st.p1.swingT = Math.max(0, st.p1.swingT - dt);

          if (twoHumans && g2.expiresAt > Date.now()) {
            const p2TargetX = Math.max(-1, Math.min(1, g2.steer * 1.15));
            st.p2.x += (p2TargetX - st.p2.x) * Math.min(1, dt * 14);
            if (g2.swing > 1 || g2.nitro) st.p2.swingT = 0.25;
          } else {
            const diffX = st.ball.x - st.p2.x;
            st.p2.x += Math.max(-dt * 1.15, Math.min(dt * 1.15, diffX * 3));
          }
          st.p2.swingT = Math.max(0, st.p2.swingT - dt);

          if (st.pauseT > 0) {
            st.pauseT -= dt;
          } else {
            st.banner = '';
            const b = st.ball;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.vz -= 2.4 * dt;
            b.z += b.vz * dt;
            if (b.z <= 0) {
              b.z = 0;
              b.vz = Math.max(0.45, Math.abs(b.vz) * 0.72);
            }
            if (b.x < -1.02 || b.x > 1.02) {
              b.vx *= -0.9;
              b.x = Math.max(-1.02, Math.min(1.02, b.x));
            }

            // P1 bottom court return
            if (b.vy > 0 && b.y >= 0.72 && b.y <= 0.98 && Math.abs(b.x - st.p1.x) < 0.28) {
              const smashBoost = st.p1.swingT > 0 ? 1.38 : 1.04;
              const lob = p1Fresh && g1.handbrake ? 0.95 : 0.56;
              b.vy = -Math.min(2.3, Math.abs(b.vy) * smashBoost + 0.14);
              b.vx = (b.x - st.p1.x) * 2.2 + (p1Fresh ? g1.steer * 0.5 : 0);
              b.vz = lob;
              playArcadeSfx(smashBoost > 1.2 ? 640 : 480, 0.08, 'triangle', 0.08, mutedRef.current);
              pushScoreTelemetry(st.s1, st.s2, 'tennis_hit', smashBoost > 1.2 ? 75 : 35);
            }
            // P2 top court return
            if (b.vy < 0 && b.y <= -0.72 && b.y >= -0.98 && Math.abs(b.x - st.p2.x) < 0.26) {
              const smashBoost = st.p2.swingT > 0 ? 1.35 : 1.04;
              b.vy = Math.min(2.2, Math.abs(b.vy) * smashBoost + 0.12);
              b.vx = (b.x - st.p2.x) * 2.1;
              b.vz = 0.55;
              playArcadeSfx(420, 0.08, 'triangle', 0.07, mutedRef.current);
            }

            if (b.y > 1.18) {
              st.s2 += 1;
              st.banner = twoHumans ? '🎾 ¡PUNTO J2!' : '🎾 ¡PUNTO CPU!';
              playArcadeSfx(240, 0.2, 'sawtooth', 0.08, mutedRef.current);
              pushScoreTelemetry(st.s1, st.s2, 'pingpong_point', 90);
              if (st.s2 >= WIN_PTS) {
                st.over = true;
                setFinishSummary({ title: twoHumans ? '🏆 Victoria Jugador 2' : '🎾 Victoria de la CPU', sub: `${st.s1} - ${st.s2}` });
              } else resetPoint(-1);
            } else if (b.y < -1.18) {
              st.s1 += 1;
              st.banner = '🏆 ¡PUNTO JUGADOR 1!';
              playArcadeSfx(740, 0.2, 'triangle', 0.09, mutedRef.current);
              pushScoreTelemetry(st.s1, st.s2, 'pingpong_point', 90);
              if (st.s1 >= WIN_PTS) {
                st.over = true;
                setFinishSummary({ title: '🏆 ¡Campeón Grand Slam J1!', sub: `${st.s1} - ${st.s2}` });
              } else resetPoint(1);
            }
            setHud({ leftText: `J1 ${st.s1} - ${st.s2} ${twoHumans ? 'J2' : 'CPU'}`, rightText: `A ${WIN_PTS} PUNTOS` });
          }
        }

        // DRAW WIMBLEDON STADIUM TENNIS
        ctx.clearRect(0, 0, W, H);
        if (backdropRef.current) {
          ctx.drawImage(backdropRef.current, 0, 0, W, H);
          ctx.fillStyle = 'rgba(4, 16, 8, 0.18)';
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = '#14532d';
          ctx.fillRect(0, 0, W, H);
        }

        const projCourt = (cx: number, cy: number) => {
          const t = (cy + 1) * 0.5; // 0 = far top (-1), 1 = near bottom (+1)
          const halfW = 140 + t * 185;
          const sy = 152 + t * 318;
          return { x: W / 2 + cx * halfW, y: sy, sc: 0.58 + t * 0.6 };
        };

        // Top Player (P2) + Bottom Player (P1) with animated Kenney Sports Pack characters & rackets
        const p2s = projCourt(st.p2.x, -0.82);
        const p2AnimFrame = Math.floor(now * 0.008) % 3 + 1;
        drawArcadeSprite(
          ctx,
          `assets/games/sports/character_red_${p2AnimFrame}.png`,
          p2s.x,
          p2s.y - 14 * p2s.sc,
          44 * p2s.sc,
          44 * p2s.sc,
          Math.PI
        );
        if (!drawArcadeSprite(ctx, 'assets/games/sports/racket_wood.png', p2s.x + 24 * p2s.sc, p2s.y, 44 * p2s.sc, 44 * p2s.sc, 1.3 + (st.p2.swingT > 0 ? 0.5 : 0))) {
          ctx.fillStyle = '#e11d48';
          ctx.fillRect(p2s.x - 35, p2s.y - 8, 70, 16);
        }

        const p1s = projCourt(st.p1.x, 0.82);
        const p1AnimFrame = Math.floor(now * 0.009) % 3 + 1;
        drawArcadeSprite(
          ctx,
          `assets/games/sports/character_blue_${p1AnimFrame}.png`,
          p1s.x,
          p1s.y + 18 * p1s.sc,
          50 * p1s.sc,
          50 * p1s.sc,
          0
        );
        if (!drawArcadeSprite(ctx, 'assets/games/sports/racket_metal.png', p1s.x + 28 * p1s.sc, p1s.y - 6 * p1s.sc, 52 * p1s.sc, 52 * p1s.sc, -0.55 - (st.p1.swingT > 0 ? 0.85 : 0))) {
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(p1s.x - 45, p1s.y - 10, 90, 20);
        }
        if (st.p1.swingT > 0.21) {
          vfx.emitHitRing(p1s.x, p1s.y - 18, 'assets/games/particles/slash_01.png', 78);
        }

        // Tennis Ball (Kenney Sports Pack) + dynamic elevation shadow
        const bs = projCourt(st.ball.x, st.ball.y);
        const lift = st.ball.z * 78 * bs.sc;
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath();
        ctx.ellipse(bs.x, bs.y + 4, 11 * bs.sc, 5 * bs.sc, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!drawArcadeSprite(ctx, 'assets/games/sports/ball_tennis1.png', bs.x, bs.y - lift, 24 * bs.sc, 24 * bs.sc, now * 0.012)) {
          ctx.fillStyle = '#bef264';
          ctx.beginPath();
          ctx.arc(bs.x, bs.y - lift, 11 * bs.sc, 0, Math.PI * 2);
          ctx.fill();
        }
        vfx.stepAndDraw(ctx, dt);

        if (st.banner) {
          ctx.fillStyle = 'rgba(6, 12, 22, 0.8)';
          ctx.fillRect(W / 2 - 170, 44, 340, 44);
          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = '#bef264';
          ctx.textAlign = 'center';
          ctx.fillText(st.banner, W / 2, 72);
        }
        rafId = requestAnimationFrame(frameLoop);
      };
      rafId = requestAnimationFrame(frameLoop);
      return () => {
        alive = false;
        cancelAnimationFrame(rafId);
      };
    }

    // -----------------------------------------------------------------
    // 3. GYRO LABYRINTH SPHERE 3D (2-AXIS TILT STEER + PITCH)
    // -----------------------------------------------------------------
    const COLS = 19;
    const ROWS = 11;
    const CELL = 44;
    const OX = Math.floor((W - COLS * CELL) / 2);
    const OY = Math.floor((H - ROWS * CELL) / 2);
    const LAB_TPL = [
      '###################',
      '#S..*...#.....O..*#',
      '###.###.#.#####.###',
      '#...#...*...#.....#',
      '#.O.#.#####.#.###.#',
      '#...#.....#...#..*#',
      '#.#######.###.#.###',
      '#*......#...O.#...#',
      '###.###.#.#####.#.#',
      '#...*.....#...O..E#',
      '###################',
    ];
    let grid: string[][] = [];
    let starsTotal = 0;
    let starsCollected = 0;
    let timerLeft = 60;
    let labOver = false;
    let ball1 = { x: 1.5, y: 1.5, vx: 0, vy: 0, rot: 0 };
    let ball2 = { x: 1.5, y: 1.5, vx: 0, vy: 0, rot: 0 };

    const initLab = () => {
      grid = LAB_TPL.map((row) => row.split(''));
      starsTotal = 0;
      starsCollected = 0;
      timerLeft = 60;
      labOver = false;
      ball1 = { x: 1.5, y: 1.5, vx: 0, vy: 0, rot: 0 };
      ball2 = { x: 1.5, y: 1.5, vx: 0, vy: 0, rot: 0 };
      grid.forEach((row) => row.forEach((c) => { if (c === '*') starsTotal += 1; }));
      setHud({ leftText: `ESTRELLAS 0/${starsTotal}`, rightText: `TIEMPO 60s` });
    };
    initLab();

    const stepSphere = (b: typeof ball1, ax: number, ay: number, dt: number, slot: 1 | 2) => {
      b.vx = (b.vx + ax * 14 * dt) * Math.pow(0.25, dt);
      b.vy = (b.vy + ay * 14 * dt) * Math.pow(0.25, dt);
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const r = 0.34;
      const isWallAt = (wx: number, wy: number) => {
        const c = Math.floor(wx);
        const rw = Math.floor(wy);
        if (rw < 0 || rw >= ROWS || c < 0 || c >= COLS) return true;
        return grid[rw][c] === '#';
      };
      if (!isWallAt(nx - r, b.y) && !isWallAt(nx + r, b.y)) b.x = nx;
      else b.vx *= -0.45;
      if (!isWallAt(b.x, ny - r) && !isWallAt(b.x, ny + r)) b.y = ny;
      else b.vy *= -0.45;

      const gc = Math.floor(b.x);
      const gr = Math.floor(b.y);
      const cell = grid[gr]?.[gc];
      if (cell === '*') {
        grid[gr][gc] = '.';
        starsCollected += 1;
        playArcadeSfx(760, 0.12, 'triangle', 0.08, mutedRef.current);
        pushScoreTelemetry(starsCollected, timerLeft, 'pingpong_hit', 45);
      } else if (cell === 'O') {
        b.x = 1.5;
        b.y = 1.5;
        b.vx = 0;
        b.vy = 0;
        playArcadeSfx(160, 0.2, 'sawtooth', 0.08, mutedRef.current);
        pushScoreTelemetry(starsCollected, timerLeft, undefined, 95);
      } else if (cell === 'E') {
        labOver = true;
        playArcadeSfx(920, 0.3, 'triangle', 0.1, mutedRef.current);
        pushScoreTelemetry(starsCollected, Math.ceil(timerLeft), 'lab_win', 130);
        setFinishSummary({
          title: `🏆 ¡Salida Alcanzada (Jugador ${slot})!`,
          sub: `${starsCollected}/${starsTotal} estrellas · ${Math.ceil(timerLeft)}s sobrantes`,
        });
      }
    };

    const frameLoop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
      lastTs = now;

      const twoHumans = controllersRef.current.length >= 2 || controllersRef.current.some((c) => c.slot === 2);
      if (!labOver) {
        timerLeft = Math.max(0, timerLeft - dt);
        if (timerLeft <= 0) {
          labOver = true;
          setFinishSummary({ title: '⏱️ Tiempo agotado', sub: `${starsCollected}/${starsTotal} estrellas` });
        }
        const g1 = gyroP1Ref.current;
        const p1Fresh = g1.expiresAt > Date.now();
        const ax1 = p1Fresh ? g1.steer : (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
        const ay1 = p1Fresh ? -g1.pitch : (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0);
        stepSphere(ball1, ax1, ay1, dt, 1);

        if (twoHumans) {
          const g2 = gyroP2Ref.current;
          const p2Fresh = g2.expiresAt > Date.now();
          stepSphere(ball2, p2Fresh ? g2.steer : 0, p2Fresh ? -g2.pitch : 0, dt, 2);
        }
        setHud({
          leftText: `ESTRELLAS ${starsCollected}/${starsTotal}`,
          rightText: `TIEMPO ${Math.ceil(timerLeft)}s`,
        });
      }

      ctx.clearRect(0, 0, W, H);
      if (backdropRef.current) {
        ctx.drawImage(backdropRef.current, 0, 0, W, H);
        ctx.fillStyle = 'rgba(4, 7, 16, 0.36)';
        ctx.fillRect(0, 0, W, H);
      }

      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const ch = grid[r][c];
          const x = OX + c * CELL;
          const y = OY + r * CELL;
          if (ch === '#') {
            if (!drawArcadeSpriteRect(ctx, 'assets/games/rolling/block_corner_large.png', x + 1, y + 1, CELL - 2, CELL - 2)) {
              ctx.fillStyle = '#334155';
              ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            }
          } else if (ch === 'O') {
            if (!drawArcadeSprite(ctx, 'assets/games/rolling/hole_large.png', x + CELL / 2, y + CELL / 2, 34, 34)) {
              ctx.fillStyle = '#020617';
              ctx.beginPath();
              ctx.arc(x + CELL / 2, y + CELL / 2, 15, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (ch === '*') {
            drawArcadeSprite(ctx, 'assets/games/particles/star_04.png', x + CELL / 2, y + CELL / 2, 32, 32, now * 0.004);
          } else if (ch === 'E') {
            drawArcadeSprite(ctx, 'assets/games/particles/circle_02.png', x + CELL / 2, y + CELL / 2, 42, 42, -now * 0.003);
            drawArcadeSprite(ctx, 'assets/games/rolling/hole_large_end.png', x + CELL / 2, y + CELL / 2, 36, 36);
          }
        }
      }

      drawArcadeSprite(
        ctx,
        'assets/games/rolling/ball_blue_large.png',
        OX + ball1.x * CELL,
        OY + ball1.y * CELL,
        30,
        30,
        ball1.x * 2.5
      );
      if (twoHumans) {
        drawArcadeSprite(
          ctx,
          'assets/games/rolling/ball_red_large.png',
          OX + ball2.x * CELL,
          OY + ball2.y * CELL,
          30,
          30,
          ball2.x * 2.5
        );
      }
      vfx.stepAndDraw(ctx, dt);

      rafId = requestAnimationFrame(frameLoop);
    };
    rafId = requestAnimationFrame(frameLoop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [effectiveRoomId, gameId, resetNonce]);

  const titleText =
    gameId === 'gyrobowling'
      ? '🎳 Bolos Pro 3D Gyro'
      : gameId === 'gyrotennis'
      ? '🎾 Tenis Slam Pro 2P'
      : '🧿 Laberinto Esfera 3D';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3 select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[#0e1222] border border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm sm:text-base font-black text-white truncate">{titleText}</span>
          <span
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 ${
              controllers.length > 0
                ? 'bg-emerald-500/15 border border-emerald-400/50 text-emerald-300'
                : 'bg-[#7C3AED]/20 border border-[#7C3AED]/45 text-purple-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {controllers.length >= 2
              ? '2 Móviles (J1+J2)'
              : controllers.length === 1
              ? '1 Móvil Conectado'
              : 'Mando Vertical Listo'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs font-black text-emerald-200 tabular-nums">
            {hud.leftText}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/45 text-xs font-black text-purple-200 tabular-nums">
            {hud.rightText}
          </span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowQrModal(true);
            }}
            className="min-h-10 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>QR J1 / J2</span>
          </button>
          <button
            type="button"
            onClick={() => setResetNonce((n) => n + 1)}
            className="min-w-10 min-h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-200 cursor-pointer"
            aria-label="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="min-w-10 min-h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-200 cursor-pointer"
            aria-label="Sonido"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-w-10 min-h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-200 cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative rounded-3xl overflow-hidden bg-[#050811] border border-white/12 shadow-2xl">
        <canvas ref={canvasRef} width={920} height={520} className="w-full h-auto block" />
        {finishSummary && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
            <div ref={finishCardRef} className="w-full max-w-sm rounded-3xl bg-[#101322] border-2 border-[#7C3AED] p-6 text-center space-y-4 shadow-2xl">
              <div className="w-24 h-24 mx-auto">
                <RobotMascot3DBadge clip="ThumbsUp" className="w-full h-full" />
              </div>
              <h4 className="text-xl font-black text-white">{finishSummary.title}</h4>
              <p className="text-sm font-semibold text-zinc-300">{finishSummary.sub}</p>
              <button
                type="button"
                onClick={() => setResetNonce((n) => n + 1)}
                className="min-h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer inline-flex items-center gap-2 mx-auto"
              >
                <Trophy className="w-4 h-4 text-amber-300" />
                <span>Jugar de nuevo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId={gameId}
          title={titleText}
          controllers={controllers}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
};
