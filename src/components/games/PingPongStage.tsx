import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, RotateCcw, Smartphone, Users, Volume2, VolumeX, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { resolvePublicLinkOrigin } from '../../utils/shortLink';
import { VictoryCelebrationOverlay, playGameSfx } from './GameEffects';

export interface PingPongStageProps {
  lang: AppLanguage;
  roomId: string;
  userName: string;
  onClose?: () => void;
}

interface GyroPadState {
  steer: number;
  pitch: number;
  throttle: number;
  brake: number;
  nitro: boolean;
  handbrake: boolean;
  swing: number;
  expiresAt: number;
}

const EMPTY_PAD_GYRO: GyroPadState = {
  steer: 0,
  pitch: 0,
  throttle: 0,
  brake: 0,
  nitro: false,
  handbrake: false,
  swing: 0,
  expiresAt: 0,
};

export const PingPongStage: React.FC<PingPongStageProps> = ({
  lang,
  roomId,
  userName,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef({
    p1Left: false,
    p1Right: false,
    p1Up: false,
    p1Down: false,
    p1Smash: false,
    p2Left: false,
    p2Right: false,
    p2Up: false,
    p2Down: false,
    p2Smash: false,
  });
  const pointerXRef = useRef<number | null>(null);
  const gyroP1Ref = useRef<GyroPadState>({ ...EMPTY_PAD_GYRO });
  const gyroP2Ref = useRef<GyroPadState>({ ...EMPTY_PAD_GYRO });

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [showQrModal, setShowQrModal] = useState(false);
  const [controllers, setControllers] = useState<
    Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>
  >([]);
  const [hud, setHud] = useState({
    s1: 0,
    s2: 0,
    server: 1 as 1 | 2,
    rally: 0,
    p2Human: false,
  });
  const [finishSummary, setFinishSummary] = useState<{
    title: string;
    sub: string;
    won: boolean;
  } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || 'pp-local').trim().toLowerCase(),
    [roomId]
  );

  const controllerUrl = useMemo(() => {
    const base =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : resolvePublicLinkOrigin();
    return `${base}/volante?room=${encodeURIComponent(effectiveRoomId)}&game=pingpong`;
  }, [effectiveRoomId]);

  useEffect(() => {
    if (socketService.isConnected() && socketService.getActiveRoomId()) {
      socketService.joinGyroChannel('display', `${userName || 'TV'} (PingPong)`, effectiveRoomId, {
        gameId: 'pingpong',
      });
    }
    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as Array<{
              userId: string;
              deviceName: string;
              slot?: 1 | 2;
            }>)
          : [];
        setControllers(list);
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot = ev.payload.playerSlot === 2 ? 2 : 1;
        const target = slot === 2 ? gyroP2Ref : gyroP1Ref;
        target.current = {
          steer: Number(ev.payload.steer || 0),
          pitch: Number(ev.payload.pitch || 0),
          throttle: Number(ev.payload.throttle || 0),
          brake: Number(ev.payload.brake || 0),
          nitro: Boolean(ev.payload.nitro),
          handbrake: Boolean(ev.payload.handbrake),
          swing: Number(ev.payload.swing || 0),
          expiresAt: Date.now() + 1400,
        };
      } else if (ev.type === 'ROOM_STATE' && socketService.getActiveRoomId()) {
        socketService.joinGyroChannel('display', `${userName || 'TV'} (PingPong)`, effectiveRoomId, {
          gameId: 'pingpong',
        });
      }
    });
    return () => unsub();
  }, [effectiveRoomId, userName]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysRef.current.p1Left = true;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keysRef.current.p1Right = true;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.p1Up = true;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') keysRef.current.p1Down = true;
      else if (k === ' ') {
        keysRef.current.p1Smash = true;
        e.preventDefault();
      } else if (k === 'j' || k === 'J') keysRef.current.p2Left = true;
      else if (k === 'l' || k === 'L') keysRef.current.p2Right = true;
      else if (k === 'i' || k === 'I') keysRef.current.p2Up = true;
      else if (k === 'k' || k === 'K') keysRef.current.p2Down = true;
      else if (k === 'Enter') keysRef.current.p2Smash = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysRef.current.p1Left = false;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keysRef.current.p1Right = false;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.p1Up = false;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') keysRef.current.p1Down = false;
      else if (k === ' ') keysRef.current.p1Smash = false;
      else if (k === 'j' || k === 'J') keysRef.current.p2Left = false;
      else if (k === 'l' || k === 'L') keysRef.current.p2Right = false;
      else if (k === 'i' || k === 'I') keysRef.current.p2Up = false;
      else if (k === 'k' || k === 'K') keysRef.current.p2Down = false;
      else if (k === 'Enter') keysRef.current.p2Smash = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 920;
    const H = 520;
    const TOP_W = 370;
    const BOT_W = 690;
    const TABLE_TOP = 64;
    const TABLE_BOT = H - 56;
    const TABLE_H = TABLE_BOT - TABLE_TOP;
    const NET_Y = TABLE_TOP + TABLE_H * 0.48;

    let rafId = 0;
    let lastTs = performance.now();
    setFinishSummary(null);

    const pushTargetTelemetry = (
      targetSlot: 1 | 2,
      hapticPulseMs: number,
      eventTag: 'pingpong_hit' | 'pingpong_point',
      scoreP1: number,
      scoreP2: number,
      speedKmh: number,
      over: boolean
    ) => {
      if (!socketService.isConnected() || !socketService.getActiveRoomId()) return;
      socketService.sendRacingTelemetry(
        {
          roomId: socketService.getActiveRoomId() || effectiveRoomId,
          speedKmh: Math.min(350, Math.max(0, Math.round(speedKmh))),
          rpmPct: 80,
          gear: 1,
          lap: 1,
          totalLaps: 1,
          position: 1,
          totalCars: 2,
          nitroPct: 100,
          collisionImpact: eventTag === 'pingpong_hit' ? 0.65 : 1,
          offroad: false,
          raceState: over ? 'finished' : 'racing',
          targetSlot,
          hapticPulseMs,
          scoreP1,
          scoreP2,
          eventTag,
        },
        socketService.getActiveRoomId()
      );
    };

    const st = {
      s1: 0,
      s2: 0,
      server: 1 as 1 | 2,
      rally: 0,
      over: false,
      pauseT: 0.75,
      banner: 'SACA J1',
      bannerCol: '#22D3EE',
      p1: { x: 0, y: 0.88, vx: 0, smashT: 0 }, // normalized [-1, 1] width, y in [0.55, 1.04]
      p2: { x: 0, y: -0.88, vx: 0, smashT: 0 }, // y in [-1.04, -0.55]
      ball: { x: 0, y: 0.65, z: 0.25, vx: 0, vy: 0, vz: 0, spin: 0, lastHit: 1 as 1 | 2 },
      rings: [] as Array<{ x: number; y: number; life: number; col: string }>,
      trail: [] as Array<{ x: number; y: number; z: number }>,
    };

    // Normalized table coords: nx in [-1, 1], ny in [-1, 1] (-1 = top edge, +1 = bottom edge)
    const proj = (nx: number, ny: number, z = 0) => {
      const t = (ny + 1) * 0.5; // 0 at top, 1 at bottom
      const halfW = (TOP_W + (BOT_W - TOP_W) * t) * 0.5;
      const sx = W * 0.5 + nx * halfW;
      const sy = TABLE_TOP + t * TABLE_H - z * 115;
      const scale = 0.64 + 0.44 * t;
      return { x: sx, y: sy, scale, halfW };
    };

    const serveBall = (srv: 1 | 2) => {
      st.server = srv;
      st.rally = 0;
      st.trail = [];
      st.ball = {
        x: srv === 1 ? st.p1.x * 0.5 : st.p2.x * 0.5,
        y: srv === 1 ? 0.72 : -0.72,
        z: 0.26,
        vx: (Math.random() - 0.5) * 0.45,
        vy: srv === 1 ? -1.42 : 1.42,
        vz: 0.88,
        spin: 0,
        lastHit: srv,
      };
    };

    const awardPoint = (winner: 1 | 2, reason: string) => {
      if (winner === 1) st.s1 += 1;
      else st.s2 += 1;
      playGameSfx('pingpong_point', mutedRef.current);
      pushTargetTelemetry(winner, 65, 'pingpong_point', st.s1, st.s2, 120, false);

      const totalPts = st.s1 + st.s2;
      const nextSrv: 1 | 2 = totalPts >= 20 ? (totalPts % 2 === 0 ? 1 : 2) : Math.floor(totalPts / 2) % 2 === 0 ? 1 : 2;
      if ((st.s1 >= 11 || st.s2 >= 11) && Math.abs(st.s1 - st.s2) >= 2) {
        st.over = true;
        const p1Won = st.s1 > st.s2;
        playGameSfx(p1Won ? 'victory' : 'defeat', mutedRef.current);
        pushTargetTelemetry(p1Won ? 1 : 2, 120, 'pingpong_point', st.s1, st.s2, 0, true);
        setFinishSummary({
          title: p1Won ? '🏆 ¡VICTORIA J1!' : '🏓 ¡VICTORIA J2!',
          sub: `${st.s1} - ${st.s2} · Rally máximo ${st.rally} golpes`,
          won: p1Won,
        });
      } else {
        st.pauseT = 1.05;
        st.banner = winner === 1 ? `PUNTO J1 · ${reason}` : `PUNTO J2 · ${reason}`;
        st.bannerCol = winner === 1 ? '#22D3EE' : '#FB7185';
        serveBall(nextSrv);
      }
    };

    let lastHudPush = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;

      const tNow = Date.now();
      const useG1 = tNow < gyroP1Ref.current.expiresAt;
      const useG2 = tNow < gyroP2Ref.current.expiresAt;
      const p2Human = useG2 || keysRef.current.p2Left || keysRef.current.p2Right;

      for (let i = st.rings.length - 1; i >= 0; i -= 1) {
        st.rings[i].life -= dt * 2.2;
        if (st.rings[i].life <= 0) st.rings.splice(i, 1);
      }

      if (!st.over) {
        // Update P1 Paddle
        const prevP1x = st.p1.x;
        if (useG1) {
          const targetX = Math.max(-1.05, Math.min(1.05, gyroP1Ref.current.steer * 1.15));
          st.p1.x += (targetX - st.p1.x) * Math.min(1, dt * 19);
          const targetY = Math.max(0.55, Math.min(1.05, 0.88 - gyroP1Ref.current.pitch * 0.28));
          st.p1.y += (targetY - st.p1.y) * Math.min(1, dt * 14);
          if (gyroP1Ref.current.swing > 0.45 || gyroP1Ref.current.nitro) {
            st.p1.smashT = Math.max(st.p1.smashT, 0.24);
          }
        } else if (pointerXRef.current !== null) {
          st.p1.x += (pointerXRef.current - st.p1.x) * Math.min(1, dt * 22);
        } else {
          const dir1 = (keysRef.current.p1Right ? 1 : 0) - (keysRef.current.p1Left ? 1 : 0);
          const dirY1 = (keysRef.current.p1Down ? 1 : 0) - (keysRef.current.p1Up ? 1 : 0);
          st.p1.x = Math.max(-1.08, Math.min(1.08, st.p1.x + dir1 * 2.15 * dt));
          st.p1.y = Math.max(0.56, Math.min(1.04, st.p1.y + dirY1 * 1.2 * dt));
        }
        if (keysRef.current.p1Smash) st.p1.smashT = 0.22;
        st.p1.smashT = Math.max(0, st.p1.smashT - dt);
        st.p1.vx = (st.p1.x - prevP1x) / dt;

        // Update P2 Paddle (Phone 2 / Keyboard J-L OR Smart AI)
        const prevP2x = st.p2.x;
        if (useG2) {
          const targetX2 = Math.max(-1.05, Math.min(1.05, gyroP2Ref.current.steer * 1.15));
          st.p2.x += (targetX2 - st.p2.x) * Math.min(1, dt * 19);
          const targetY2 = Math.max(-1.05, Math.min(-0.55, -0.88 + gyroP2Ref.current.pitch * 0.28));
          st.p2.y += (targetY2 - st.p2.y) * Math.min(1, dt * 14);
          if (gyroP2Ref.current.swing > 0.45 || gyroP2Ref.current.nitro) {
            st.p2.smashT = Math.max(st.p2.smashT, 0.24);
          }
        } else if (keysRef.current.p2Left || keysRef.current.p2Right) {
          const dir2 = (keysRef.current.p2Right ? 1 : 0) - (keysRef.current.p2Left ? 1 : 0);
          st.p2.x = Math.max(-1.08, Math.min(1.08, st.p2.x + dir2 * 2.15 * dt));
          if (keysRef.current.p2Smash) st.p2.smashT = 0.22;
        } else {
          // Reactive AI
          const aimX = st.ball.vy < 0 ? Math.max(-0.92, Math.min(0.92, st.ball.x)) : 0;
          const aiSpd = 1.65;
          const diff = aimX - st.p2.x;
          st.p2.x += Math.max(-aiSpd * dt, Math.min(aiSpd * dt, diff));
          st.p2.y += (-0.88 - st.p2.y) * Math.min(1, dt * 8);
        }
        st.p2.smashT = Math.max(0, st.p2.smashT - dt);
        st.p2.vx = (st.p2.x - prevP2x) / dt;

        if (st.pauseT > 0) {
          st.pauseT -= dt;
          if (st.pauseT <= 0) st.banner = '';
        } else {
          const sub = 3;
          const sDt = dt / sub;
          for (let k = 0; k < sub; k += 1) {
            const b = st.ball;
            b.vx += b.spin * 0.55 * sDt;
            b.x += b.vx * sDt;
            b.y += b.vy * sDt;
            b.vz -= 2.85 * sDt;
            b.z += b.vz * sDt;

            // Table bounce inside bounds
            if (b.z <= 0 && b.vz < 0) {
              if (Math.abs(b.x) <= 1.03 && Math.abs(b.y) <= 1.02) {
                b.z = 0;
                b.vz = Math.max(0.75, Math.abs(b.vz) * 0.86);
                st.rings.push({
                  x: b.x,
                  y: b.y,
                  life: 1,
                  col: b.y > 0 ? '#22D3EE' : '#FB7185',
                });
                playGameSfx('pingpong_bounce', mutedRef.current);
              } else {
                // Missed the table after a shot!
                const winner: 1 | 2 = b.y > 0 ? 2 : 1;
                awardPoint(winner, 'FUERA');
                break;
              }
            }

            // Net collision around y = 0
            if (Math.abs(b.y) < 0.04 && b.z < 0.11) {
              b.vy *= -0.4;
              b.y = b.y >= 0 ? 0.045 : -0.045;
              playGameSfx('pingpong_bounce', mutedRef.current);
            }

            // Paddle 1 collision (bottom)
            if (b.vy > 0 && Math.abs(b.y - st.p1.y) < 0.1 && Math.abs(b.x - st.p1.x) < 0.24 && b.z < 0.55) {
              const smash = st.p1.smashT > 0 || (useG1 && gyroP1Ref.current.nitro);
              const spinBoost = useG1 && gyroP1Ref.current.handbrake ? 1.45 : 1;
              const offset = (b.x - st.p1.x) / 0.24;
              b.y = st.p1.y - 0.11;
              b.vy = -(smash ? 2.28 : 1.65) - Math.min(0.45, st.rally * 0.03);
              b.vx = offset * 1.45 + st.p1.vx * 0.28;
              b.vz = smash ? 0.92 : 1.08;
              b.spin = (-st.p1.vx * 0.45 + offset * 0.8) * spinBoost;
              b.lastHit = 1;
              st.rally += 1;
              playGameSfx('pingpong_hit', mutedRef.current);
              pushTargetTelemetry(1, smash ? 65 : 32, 'pingpong_hit', st.s1, st.s2, Math.abs(b.vy) * 85, false);
            }

            // Paddle 2 collision (top)
            if (b.vy < 0 && Math.abs(b.y - st.p2.y) < 0.1 && Math.abs(b.x - st.p2.x) < 0.24 && b.z < 0.55) {
              const smash2 = st.p2.smashT > 0 || (useG2 && gyroP2Ref.current.nitro);
              const spinBoost2 = useG2 && gyroP2Ref.current.handbrake ? 1.45 : 1;
              const offset2 = (b.x - st.p2.x) / 0.24;
              b.y = st.p2.y + 0.11;
              b.vy = (smash2 ? 2.28 : 1.65) + Math.min(0.45, st.rally * 0.03);
              b.vx = offset2 * 1.45 + st.p2.vx * 0.28;
              b.vz = smash2 ? 0.92 : 1.08;
              b.spin = (-st.p2.vx * 0.45 + offset2 * 0.8) * spinBoost2;
              b.lastHit = 2;
              st.rally += 1;
              playGameSfx('pingpong_hit', mutedRef.current);
              if (p2Human) {
                pushTargetTelemetry(2, smash2 ? 65 : 32, 'pingpong_hit', st.s1, st.s2, Math.abs(b.vy) * 85, false);
              }
            }

            // Out past ends
            if (b.y > 1.32) {
              awardPoint(2, 'WIN J2');
              break;
            } else if (b.y < -1.32) {
              awardPoint(1, 'ACE J1');
              break;
            }
          }

          st.trail.push({ x: st.ball.x, y: st.ball.y, z: st.ball.z });
          if (st.trail.length > 12) st.trail.shift();
        }
      }

      if (now - lastHudPush > 90) {
        lastHudPush = now;
        setHud({
          s1: st.s1,
          s2: st.s2,
          server: st.server,
          rally: st.rally,
          p2Human,
        });
      }

      // Draw Pseudo-3D Neon Ping Pong Arena
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#040814');
      bg.addColorStop(0.55, '#0b1530');
      bg.addColorStop(1, '#050812');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Ambient stadium spotlight glow
      const spot = ctx.createRadialGradient(W * 0.5, NET_Y, 40, W * 0.5, NET_Y, W * 0.55);
      spot.addColorStop(0, 'rgba(34, 211, 238, 0.14)');
      spot.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);

      const tl = proj(-1, -1);
      const tr = proj(1, -1);
      const bl = proj(-1, 1);
      const br = proj(1, 1);

      // Table drop skirt (depth thickness)
      ctx.fillStyle = '#0c2340';
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(br.x, br.y + 18);
      ctx.lineTo(bl.x, bl.y + 18);
      ctx.closePath();
      ctx.fill();

      // Table felt surface
      const tGrad = ctx.createLinearGradient(0, TABLE_TOP, 0, TABLE_BOT);
      tGrad.addColorStop(0, '#09436b');
      tGrad.addColorStop(0.5, '#0d5b8f');
      tGrad.addColorStop(1, '#083a5e');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();

      // White table markings + center service line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 4;
      ctx.stroke();

      const midTop = proj(0, -1);
      const midBot = proj(0, 1);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(midTop.x, midTop.y);
      ctx.lineTo(midBot.x, midBot.y);
      ctx.stroke();

      // Bounce impact rings
      for (const r of st.rings) {
        const p = proj(r.x, r.y, 0);
        const rad = (1 - r.life) * 26 + 8;
        ctx.globalAlpha = Math.max(0, r.life);
        ctx.strokeStyle = r.col;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rad, rad * 0.52, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Top Paddle (P2 Coral / AI)
      const p2P = proj(st.p2.x, st.p2.y, 0.08);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(p2P.x, p2P.y + 12, 34 * p2P.scale, 10 * p2P.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#E11D48';
      ctx.strokeStyle = st.p2.smashT > 0 ? '#FACC15' : '#FDA4AF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p2P.x, p2P.y, 44 * p2P.scale, 19 * p2P.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 3D Net mesh across center
      const netL = proj(-1.04, 0, 0);
      const netR = proj(1.04, 0, 0);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.22)';
      ctx.fillRect(netL.x, netL.y - 26, netR.x - netL.x, 26);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(netL.x, netL.y - 26);
      ctx.lineTo(netR.x, netR.y - 26);
      ctx.stroke();

      // Ball trail
      for (let i = 0; i < st.trail.length; i += 1) {
        const trP = proj(st.trail[i].x, st.trail[i].y, Math.max(0, st.trail[i].z));
        ctx.globalAlpha = (i / st.trail.length) * 0.32;
        ctx.fillStyle = st.ball.lastHit === 1 ? '#22D3EE' : '#FB7185';
        ctx.beginPath();
        ctx.arc(trP.x, trP.y, 7 * trP.scale * (i / st.trail.length), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Ball shadow + 3D ball
      const bShadow = proj(st.ball.x, st.ball.y, 0);
      const sScale = Math.max(0.35, 1 - st.ball.z * 0.45);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
      ctx.beginPath();
      ctx.ellipse(bShadow.x, bShadow.y, 12 * bShadow.scale * sScale, 5.5 * bShadow.scale * sScale, 0, 0, Math.PI * 2);
      ctx.fill();

      const bPos = proj(st.ball.x, st.ball.y, Math.max(0, st.ball.z));
      const bR = 11 * bPos.scale;
      const bGrad = ctx.createRadialGradient(bPos.x - 3, bPos.y - 3, 1.5, bPos.x, bPos.y, bR);
      bGrad.addColorStop(0, '#FFFFFF');
      bGrad.addColorStop(0.75, '#FDE047');
      bGrad.addColorStop(1, '#F59E0B');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bPos.x, bPos.y, bR, 0, Math.PI * 2);
      ctx.fill();

      // Bottom Paddle (P1 Cyan Racket)
      const p1P = proj(st.p1.x, st.p1.y, 0.08);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(p1P.x, p1P.y + 14, 42 * p1P.scale, 12 * p1P.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0891B2';
      ctx.strokeStyle = st.p1.smashT > 0 ? '#FACC15' : '#67E8F9';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(p1P.x, p1P.y, 50 * p1P.scale, 22 * p1P.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Handle on P1 racket
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(p1P.x - 6 * p1P.scale, p1P.y + 16 * p1P.scale, 12 * p1P.scale, 20 * p1P.scale);

      if (st.banner) {
        ctx.fillStyle = 'rgba(5, 8, 18, 0.84)';
        ctx.fillRect(W / 2 - 210, H / 2 - 34, 420, 68);
        ctx.strokeStyle = st.bannerCol;
        ctx.lineWidth = 3;
        ctx.strokeRect(W / 2 - 210, H / 2 - 34, 420, 68);
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = st.bannerCol;
        ctx.fillText(st.banner, W / 2, H / 2 + 9);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [effectiveRoomId, resetNonce]);

  const j1Connected = controllers.some((c, i) => c.slot === 1 || (!c.slot && i === 0));
  const j2Connected = controllers.some((c, i) => c.slot === 2 || (!c.slot && i === 1));

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#0D0E17] border border-white/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🏓</span>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              {pickLang(lang, {
                es: 'Ping Pong Pro 2P · Raqueta Móvil',
                ca: 'Ping Pong Pro 2P · Raqueta Mòbil',
                en: 'Ping Pong Pro 2P · Mobile Racket',
              })}
            </h3>
            <p className="text-[11px] text-zinc-400">
              {controllers.length > 0
                ? `${controllers.length}/2 móviles conectados (${j1Connected ? 'J1 Azul' : ''} ${j2Connected ? '· J2 Rojo' : ''})`
                : pickLang(lang, {
                    es: 'Escanea el QR con 1 o 2 móviles o usa A/D + Espacio',
                    ca: 'Escaneja el QR amb 1 o 2 mòbils o usa A/D + Espai',
                    en: 'Scan QR with 1 or 2 phones or use A/D + Space',
                  })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-xs font-black text-cyan-200 tabular-nums">
            J1 {hud.s1} - {hud.s2} {hud.p2Human ? 'J2' : 'CPU'}
          </span>
          <span className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-bold text-zinc-300 tabular-nums inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-emerald-300" />
            Rally {hud.rally}
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
            <span>Mando Móvil 2P QR</span>
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

      <div className="relative rounded-3xl overflow-hidden bg-[#040814] border border-white/12 shadow-2xl">
        <canvas
          ref={canvasRef}
          width={920}
          height={520}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
            pointerXRef.current = Math.max(-1.05, Math.min(1.05, nx * 1.35));
          }}
          onPointerLeave={() => {
            pointerXRef.current = null;
          }}
          onPointerDown={() => {
            keysRef.current.p1Smash = true;
          }}
          onPointerUp={() => {
            keysRef.current.p1Smash = false;
          }}
          className="w-full h-auto block touch-none"
        />

        {finishSummary && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={finishSummary.title}
            subtitle={finishSummary.sub}
            outcome={finishSummary.won ? 'win' : 'defeat'}
            scoreBadge={`${hud.s1} - ${hud.s2}`}
            onPrimaryAction={() => setResetNonce((n) => n + 1)}
            secondaryLabel={onClose ? pickLang(lang, { es: 'Salir', ca: 'Sortir', en: 'Exit' }) : undefined}
            onSecondaryAction={onClose}
          />
        )}
      </div>

      {showQrModal && (
        <div
          className="fixed inset-0 z-[210] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#101322] border border-cyan-400/50 p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-400" /> Raqueta Móvil 2P
              </span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="inline-block p-3 rounded-2xl bg-white">
              <QRCodeSVG value={controllerUrl} size={184} />
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Escanea con 1 móvil para jugar vs CPU o con 2 móviles para duelo 1v1 (J1 Azul vs J2 Rojo). Mueve o golpea con la muñeca en horizontal.
            </p>
            <p className="text-[11px] font-mono text-cyan-300 break-all">{controllerUrl}</p>
          </div>
        </div>
      )}
    </div>
  );
};
