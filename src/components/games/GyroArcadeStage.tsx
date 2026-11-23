import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, RotateCcw, Smartphone, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { resolvePublicLinkOrigin } from '../../utils/shortLink';
import { playGameSfx } from './GameEffects';
import {
  drawArcadeSprite,
  drawArcadeTiledBg,
  EXPLOSION_FRAMES,
  preloadArcadeSprites,
} from './arcade/arcadeSprites';

export type GyroArcadeGameId = 'gyrohockey' | 'gyrospace';

interface GyroArcadeStageProps {
  gameId: GyroArcadeGameId;
  lang: AppLanguage;
  roomId: string;
  userName: string;
  onClose?: () => void;
}

const SPACE_BEST_KEY = 'riffan_gyro_space_best_v1';

export const GyroArcadeStage: React.FC<GyroArcadeStageProps> = ({
  gameId,
  lang,
  roomId,
  userName,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef({ left: false, right: false, up: false, down: false, action: false });
  const gyroP1Ref = useRef({ steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 });
  const gyroP2Ref = useRef({ steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 });
  const lastTelemRef = useRef(0);

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [showQrModal, setShowQrModal] = useState(false);
  const [connectedControllers, setConnectedControllers] = useState<Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>>([]);
  const [hud, setHud] = useState({
    leftText: gameId === 'gyrohockey' ? 'J1 0 - 0 CPU' : 'PUNTOS: 0 (x1)',
    rightText: gameId === 'gyrohockey' ? 'SMASH 100%' : 'ESCUDO: 100%',
  });
  const [finishSummary, setFinishSummary] = useState<{ title: string; sub: string } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || `${gameId === 'gyrohockey' ? 'ah' : 'sp'}-local`).trim().toLowerCase(),
    [gameId, roomId]
  );

  const controllerUrl = useMemo(() => {
    const base =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : resolvePublicLinkOrigin();
    return `${base}/volante?room=${encodeURIComponent(effectiveRoomId)}&game=${encodeURIComponent(gameId)}`;
  }, [effectiveRoomId, gameId]);

  useEffect(() => {
    if (socketService.isConnected() && socketService.getActiveRoomId()) {
      socketService.joinGyroChannel('display', `${userName || 'Jugador'} (${gameId})`, effectiveRoomId, { gameId });
    }
    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>)
          : [];
        setConnectedControllers(list);
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot = ev.payload.playerSlot === 2 ? 2 : 1;
        const target = slot === 2 ? gyroP2Ref : gyroP1Ref;
        target.current = {
          steer: Number(ev.payload.steer || 0),
          throttle: Number(ev.payload.throttle || 0),
          brake: Number(ev.payload.brake || 0),
          nitro: Boolean(ev.payload.nitro),
          handbrake: Boolean(ev.payload.handbrake),
          expiresAt: Date.now() + 1400,
        };
      } else if (ev.type === 'ROOM_STATE' && socketService.getActiveRoomId()) {
        socketService.joinGyroChannel('display', `${userName || 'Jugador'} (${gameId})`, effectiveRoomId, { gameId });
      }
    });
    return () => unsub();
  }, [effectiveRoomId, gameId, userName]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keysRef.current.left = true; }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keysRef.current.right = true; }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { keysRef.current.up = true; }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { keysRef.current.down = true; }
      else if (k === ' ' || k === 'Enter') { keysRef.current.action = true; e.preventDefault(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keysRef.current.left = false; }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keysRef.current.right = false; }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { keysRef.current.up = false; }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { keysRef.current.down = false; }
      else if (k === ' ' || k === 'Enter') { keysRef.current.action = false; }
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
    let rafId = 0;
    let lastTs = performance.now();
    setFinishSummary(null);

    preloadArcadeSprites([
      'assets/games/space/darkPurple.png',
      'assets/games/space/playerShip1_blue.png',
      'assets/games/space/playerShip2_orange.png',
      'assets/games/space/fire00.png',
      'assets/games/space/shield3.png',
      'assets/games/space/enemyRed3.png',
      'assets/games/space/meteorBrown_big1.png',
      'assets/games/space/laserBlue01.png',
      'assets/games/space/laserRed01.png',
      'assets/games/puzzle/ballGrey.png',
      'assets/games/puzzle/particleStar.png',
      ...EXPLOSION_FRAMES,
    ]);

    const pushTelemetry = (
      speedKmh: number,
      scoreL: number,
      scoreR: number,
      energy: number,
      impact: number,
      over: boolean,
      targetSlot?: 1 | 2,
      hapticPulseMs?: number
    ) => {
      const now = performance.now();
      if (!socketService.isConnected() || !socketService.getActiveRoomId()) return;
      if (!hapticPulseMs && now - lastTelemRef.current < 95) return;
      lastTelemRef.current = now;
      socketService.sendRacingTelemetry(
        {
          roomId: socketService.getActiveRoomId() || effectiveRoomId,
          speedKmh: Math.min(500, Math.max(0, Math.round(speedKmh))),
          rpmPct: Math.min(100, Math.max(0, Math.round(energy))),
          gear: Math.min(8, Math.max(1, scoreL || 1)),
          lap: Math.min(99, Math.max(1, scoreL + 1)),
          totalLaps: Math.min(99, Math.max(1, scoreR || 5)),
          position: 1,
          totalCars: 2,
          nitroPct: Math.min(100, Math.max(0, Math.round(energy))),
          collisionImpact: Math.min(1, Math.max(0, impact)),
          offroad: false,
          raceState: over ? 'finished' : 'racing',
          targetSlot,
          hapticPulseMs,
          scoreP1: scoreL,
          scoreP2: scoreR,
        },
        socketService.getActiveRoomId()
      );
    };

    if (gameId === 'gyrohockey') {
      const pad = 28;
      const goalHalfW = 114;
      const goalLeft = W / 2 - goalHalfW;
      const goalRight = W / 2 + goalHalfW;
      const MR = 29;
      const PR = 17;
      const sparks: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }> = [];
      let puckTrail: Array<{ x: number; y: number }> = [];
      const st = {
        sMe: 0, sCpu: 0, over: false, pauseT: 0, banner: '', bannerCol: '#38BDF8',
        smashCharge: 100, impactFlash: 0,
        me: { x: W / 2, y: H - 78, vx: 0, vy: 0 },
        cpu: { x: W / 2, y: 78, vx: 0, vy: 0 },
        puck: { x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 260, vy: 260 },
      };

      const spawnSparks = (x: number, y: number, color: string, count: number) => {
        for (let i = 0; i < count; i += 1) {
          const a = Math.random() * Math.PI * 2;
          const v = 120 + Math.random() * 320;
          sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, color });
        }
      };

      const hitMallet = (m: { x: number; y: number; vx: number; vy: number }, smashPower: number, slot: 1 | 2) => {
        const pk = st.puck;
        const dx = pk.x - m.x;
        const dy = pk.y - m.y;
        const minD = MR + PR;
        const dSq = dx * dx + dy * dy;
        if (dSq >= minD * minD || dSq < 0.001) return;
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const ny = dy / d;
        pk.x = m.x + nx * (minD + 1.5);
        pk.y = m.y + ny * (minD + 1.5);
        const spd = Math.min(1150, Math.max(460, Math.hypot(pk.vx, pk.vy) * 1.06 + smashPower));
        pk.vx = nx * spd + m.vx * 0.35;
        pk.vy = ny * spd + m.vy * 0.35;
        st.impactFlash = 0.7;
        spawnSparks(pk.x - nx * PR, pk.y - ny * PR, smashPower > 120 ? '#FACC15' : '#38BDF8', 12);
        playGameSfx('chapas_kick', mutedRef.current);
        pushTelemetry(spd * 0.32, st.sMe, st.sCpu, st.smashCharge, 0.85, st.over, slot, smashPower > 120 ? 70 : 35);
      };

      const servePuck = (dirY: number) => {
        st.me = { x: W / 2, y: H - 78, vx: 0, vy: 0 };
        st.cpu = { x: W / 2, y: 78, vx: 0, vy: 0 };
        st.puck = { x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 260, vy: dirY * 260 };
        puckTrail = [];
      };

      const stepHockey = (now: number) => {
        const dt = Math.min(0.033, Math.max(0.004, (now - lastTs) / 1000));
        lastTs = now;
        st.impactFlash = Math.max(0, st.impactFlash - dt * 2.5);

        for (let i = sparks.length - 1; i >= 0; i -= 1) {
          sparks[i].x += sparks[i].vx * dt;
          sparks[i].y += sparks[i].vy * dt;
          sparks[i].life -= dt;
          if (sparks[i].life <= 0) sparks.splice(i, 1);
        }

        if (!st.over) {
          if (st.pauseT > 0) {
            st.pauseT -= dt;
            if (st.pauseT <= 0) {
              st.banner = '';
              servePuck(st.sMe > st.sCpu ? -1 : 1);
            }
          } else {
            const tNow = Date.now();
            const useGyro = tNow < gyroP1Ref.current.expiresAt;
            const useGyroP2 = tNow < gyroP2Ref.current.expiresAt;
            const smashOn = (keysRef.current.action || (useGyro && gyroP1Ref.current.nitro)) && st.smashCharge > 10;
            const p2SmashOn = useGyroP2 && gyroP2Ref.current.nitro;
            st.smashCharge = smashOn ? Math.max(0, st.smashCharge - dt * 45) : Math.min(100, st.smashCharge + dt * 22);

            const sub = 3;
            const sDt = dt / sub;
            for (let k = 0; k < sub; k += 1) {
              const prevMx = st.me.x;
              const prevMy = st.me.y;
              if (useGyro && Math.abs(gyroP1Ref.current.steer) > 0.03) {
                const targetX = W / 2 + gyroP1Ref.current.steer * (W / 2 - pad - MR - 12);
                st.me.x += (targetX - st.me.x) * Math.min(1, sDt * 24);
              } else {
                const dirX = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
                st.me.x += dirX * 580 * sDt;
              }
              let dirY = (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0);
              if (dirY === 0 && useGyro) {
                dirY = gyroP1Ref.current.throttle > 0.3 ? -1 : gyroP1Ref.current.brake > 0.3 ? 1 : 0;
              }
              st.me.y += dirY * 460 * sDt;
              st.me.x = Math.max(pad + MR, Math.min(W - pad - MR, st.me.x));
              st.me.y = Math.max(H / 2 + MR + 6, Math.min(H - pad - MR, st.me.y));
              st.me.vx = (st.me.x - prevMx) / sDt;
              st.me.vy = (st.me.y - prevMy) / sDt;

              const prevCx = st.cpu.x;
              const prevCy = st.cpu.y;
              if (useGyroP2) {
                const targetX2 = W / 2 + gyroP2Ref.current.steer * (W / 2 - pad - MR - 12);
                st.cpu.x += (targetX2 - st.cpu.x) * Math.min(1, sDt * 24);
                const dirY2 = gyroP2Ref.current.throttle > 0.3 ? 1 : gyroP2Ref.current.brake > 0.3 ? -1 : 0;
                st.cpu.y += dirY2 * 460 * sDt;
              } else {
                const aiX = st.puck.y < H * 0.56 ? Math.max(pad + MR + 30, Math.min(W - pad - MR - 30, st.puck.x)) : W / 2;
                const aiY = st.puck.y < H * 0.45 && st.puck.vy >= -40 ? Math.min(H / 2 - MR - 12, st.puck.y - 16) : 82;
                st.cpu.x += Math.max(-440 * sDt, Math.min(440 * sDt, aiX - st.cpu.x));
                st.cpu.y += Math.max(-340 * sDt, Math.min(340 * sDt, aiY - st.cpu.y));
              }
              st.cpu.x = Math.max(pad + MR, Math.min(W - pad - MR, st.cpu.x));
              st.cpu.y = Math.max(pad + MR, Math.min(H / 2 - MR - 6, st.cpu.y));
              st.cpu.vx = (st.cpu.x - prevCx) / sDt;
              st.cpu.vy = (st.cpu.y - prevCy) / sDt;

              st.puck.x += st.puck.vx * sDt;
              st.puck.y += st.puck.vy * sDt;
              st.puck.vx *= Math.pow(0.996, sDt * 60);
              st.puck.vy *= Math.pow(0.996, sDt * 60);

              if (st.puck.x < pad + PR) { st.puck.x = pad + PR; st.puck.vx = Math.abs(st.puck.vx) * 0.92; spawnSparks(pad, st.puck.y, '#22D3EE', 5); }
              if (st.puck.x > W - pad - PR) { st.puck.x = W - pad - PR; st.puck.vx = -Math.abs(st.puck.vx) * 0.92; spawnSparks(W - pad, st.puck.y, '#22D3EE', 5); }

              const inMouth = st.puck.x > goalLeft + PR * 0.5 && st.puck.x < goalRight - PR * 0.5;
              if (!inMouth) {
                if (st.puck.y < pad + PR) { st.puck.y = pad + PR; st.puck.vy = Math.abs(st.puck.vy) * 0.92; spawnSparks(st.puck.x, pad, '#F43F5E', 5); }
                if (st.puck.y > H - pad - PR) { st.puck.y = H - pad - PR; st.puck.vy = -Math.abs(st.puck.vy) * 0.92; spawnSparks(st.puck.x, H - pad, '#8B5CF6', 5); }
              } else if (st.puck.y < pad - 6) {
                st.sMe += 1; st.pauseT = 1.2; st.banner = '⚡ ¡GOLAZO J1!'; st.bannerCol = '#4ADE80';
                spawnSparks(st.puck.x, pad, '#4ADE80', 26); playGameSfx('chapas_goal', mutedRef.current);
                pushTelemetry(0, st.sMe, st.sCpu, st.smashCharge, 1, st.over, 1, 90);
                break;
              } else if (st.puck.y > H - pad + 6) {
                st.sCpu += 1; st.pauseT = 1.2; st.banner = useGyroP2 ? '💥 ¡GOLAZO J2!' : '💥 ¡PUNTO CPU!'; st.bannerCol = '#FB7185';
                spawnSparks(st.puck.x, H - pad, '#FB7185', 22); playGameSfx('board_capture', mutedRef.current);
                if (useGyroP2) pushTelemetry(0, st.sMe, st.sCpu, st.smashCharge, 1, st.over, 2, 90);
                break;
              }
              hitMallet(st.me, smashOn ? 240 : 60, 1);
              hitMallet(st.cpu, p2SmashOn ? 220 : 40, 2);
            }

            puckTrail.push({ x: st.puck.x, y: st.puck.y });
            if (puckTrail.length > 10) puckTrail.shift();

            if ((st.sMe >= 5 || st.sCpu >= 5) && st.pauseT <= 0) {
              st.over = true;
              const won = st.sMe > st.sCpu;
              playGameSfx(won ? 'victory' : 'defeat', mutedRef.current);
              setFinishSummary({
                title: won ? '🏆 ¡CAMPEÓN J1 AIR HOCKEY!' : useGyroP2 ? '🏆 ¡CAMPEÓN J2!' : '🤖 VICTORIA PARA LA CPU',
                sub: `Marcador final: J1 ${st.sMe} - ${st.sCpu} ${useGyroP2 ? 'J2' : 'CPU'}`,
              });
            }
            setHud({ leftText: `J1 ${st.sMe} - ${st.sCpu} ${useGyroP2 ? 'J2' : 'CPU'}`, rightText: `SMASH ${Math.round(st.smashCharge)}%` });
            pushTelemetry(Math.hypot(st.puck.vx, st.puck.vy) * 0.32, st.sMe, st.sCpu, st.smashCharge, st.impactFlash, st.over);
          }
        }

        ctx.fillStyle = '#050814'; ctx.fillRect(0, 0, W, H);
        const grad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
        grad.addColorStop(0, '#0f1b38'); grad.addColorStop(1, '#080e1f');
        ctx.fillStyle = grad; ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 6; ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

        ctx.fillStyle = '#04060e';
        ctx.fillRect(goalLeft, pad - 10, goalHalfW * 2, 16);
        ctx.fillRect(goalLeft, H - pad - 6, goalHalfW * 2, 16);
        ctx.strokeStyle = '#FB7185'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(goalLeft, pad); ctx.lineTo(goalRight, pad); ctx.stroke();
        ctx.strokeStyle = '#34D399'; ctx.beginPath(); ctx.moveTo(goalLeft, H - pad); ctx.lineTo(goalRight, H - pad); ctx.stroke();

        for (let i = 0; i < puckTrail.length; i += 1) {
          ctx.globalAlpha = (i / puckTrail.length) * 0.35; ctx.fillStyle = '#FACC15';
          ctx.beginPath(); ctx.arc(puckTrail[i].x, puckTrail[i].y, PR * (0.45 + 0.5 * (i / puckTrail.length)), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (!drawArcadeSprite(ctx, 'assets/games/puzzle/ballGrey.png', st.puck.x, st.puck.y, PR * 2.15, PR * 2.15)) {
          ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(st.puck.x, st.puck.y, PR, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5; ctx.stroke();
        }

        const drawM = (x: number, y: number, fill: string, ring: string) => {
          ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, MR, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = ring; ctx.lineWidth = 4; ctx.stroke();
          ctx.fillStyle = '#0F172A'; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
        };
        drawM(st.me.x, st.me.y, '#7C3AED', '#22D3EE');
        drawM(st.cpu.x, st.cpu.y, '#E11D48', '#FDA4AF');

        for (const sp of sparks) {
          if (!drawArcadeSprite(ctx, 'assets/games/puzzle/particleStar.png', sp.x, sp.y, 12, 12, sp.life * 8, Math.max(0, sp.life * 2.2))) {
            ctx.globalAlpha = Math.max(0, sp.life * 2.2); ctx.fillStyle = sp.color;
            ctx.fillRect(sp.x - 2, sp.y - 2, 5, 5);
          }
        }
        ctx.globalAlpha = 1;

        if (st.banner) {
          ctx.fillStyle = 'rgba(5, 8, 18, 0.85)'; ctx.fillRect(W / 2 - 200, H / 2 - 34, 400, 68);
          ctx.strokeStyle = st.bannerCol; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 200, H / 2 - 34, 400, 68);
          ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = st.bannerCol;
          ctx.fillText(st.banner, W / 2, H / 2 + 10);
        }

        rafId = requestAnimationFrame(stepHockey);
      };
      rafId = requestAnimationFrame(stepHockey);
      return () => cancelAnimationFrame(rafId);
    }

    // gyrospace mode
    let best = 0;
    try { best = Number(localStorage.getItem(SPACE_BEST_KEY) || 0) || 0; } catch { best = 0; }
    const stars = Array.from({ length: 75 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.4 + Math.random() * 1.6 }));
    const sp = {
      x: W / 2, y: H - 72, bank: 0, hp: 100, score: 0, wave: 1, combo: 1,
      x2: W * 0.65, y2: H - 72, bank2: 0, p2FireCd: 0, p2ShieldOn: false,
      fireCd: 0, spawnCd: 0.4, shieldFlash: 0, over: false, bgScroll: 0, shieldOn: false,
      bullets: [] as Array<{ x: number; y: number; vy: number; p2?: boolean }>,
      enemies: [] as Array<{ x: number; y: number; vx: number; vy: number; r: number; hp: number; kind: 'alien' | 'rock'; rot: number }>,
      parts: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; col: string }>,
      booms: [] as Array<{ x: number; y: number; size: number; t: number; dur: number }>,
    };

    const boom = (x: number, y: number, col: string, n: number) => {
      sp.booms.push({ x, y, size: n > 15 ? 74 : 56, t: 0, dur: 0.36 });
      for (let i = 0; i < n; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 240;
        sp.parts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.5, col });
      }
    };

    const stepSpace = (now: number) => {
      const dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
      lastTs = now;
      sp.shieldFlash = Math.max(0, sp.shieldFlash - dt * 2.5);
      sp.bgScroll += (68 + sp.wave * 14) * dt;

      for (const s of stars) {
        s.y += (90 + sp.wave * 18) * s.z * dt;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
      }
      for (let i = sp.parts.length - 1; i >= 0; i -= 1) {
        sp.parts[i].x += sp.parts[i].vx * dt;
        sp.parts[i].y += sp.parts[i].vy * dt;
        sp.parts[i].life -= dt;
        if (sp.parts[i].life <= 0) sp.parts.splice(i, 1);
      }
      for (let i = sp.booms.length - 1; i >= 0; i -= 1) {
        sp.booms[i].t += dt;
        if (sp.booms[i].t >= sp.booms[i].dur) sp.booms.splice(i, 1);
      }

      const tNowSp = Date.now();
      const useG2Sp = tNowSp < gyroP2Ref.current.expiresAt;

      if (!sp.over) {
        const useGyro = tNowSp < gyroP1Ref.current.expiresAt;
        const moveIn = useGyro ? gyroP1Ref.current.steer : ((keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0));
        const fireOn = keysRef.current.action || (useGyro && (gyroP1Ref.current.throttle > 0.2 || gyroP1Ref.current.nitro));
        sp.shieldOn = keysRef.current.up || (useGyro && gyroP1Ref.current.handbrake);

        sp.x = Math.max(40, Math.min(W - 40, sp.x + moveIn * 520 * dt));
        sp.bank += (moveIn * 0.42 - sp.bank) * Math.min(1, dt * 14);
        sp.score += dt * 12;
        sp.wave = 1 + Math.floor(sp.score / 250);

        sp.fireCd -= dt;
        if (fireOn && sp.fireCd <= 0) {
          sp.fireCd = 0.14;
          sp.bullets.push({ x: sp.x - 14, y: sp.y - 18, vy: -760 }, { x: sp.x + 14, y: sp.y - 18, vy: -760 });
          playGameSfx('chapas_kick', mutedRef.current);
        }

        if (useG2Sp) {
          const moveIn2 = gyroP2Ref.current.steer;
          const fire2 = gyroP2Ref.current.throttle > 0.2 || gyroP2Ref.current.nitro;
          sp.p2ShieldOn = gyroP2Ref.current.handbrake;
          sp.x2 = Math.max(40, Math.min(W - 40, sp.x2 + moveIn2 * 520 * dt));
          sp.bank2 += (moveIn2 * 0.42 - sp.bank2) * Math.min(1, dt * 14);
          sp.p2FireCd -= dt;
          if (fire2 && sp.p2FireCd <= 0) {
            sp.p2FireCd = 0.14;
            sp.bullets.push({ x: sp.x2 - 14, y: sp.y2 - 18, vy: -760, p2: true }, { x: sp.x2 + 14, y: sp.y2 - 18, vy: -760, p2: true });
            playGameSfx('chapas_kick', mutedRef.current);
          }
        }

        sp.spawnCd -= dt;
        if (sp.spawnCd <= 0) {
          sp.spawnCd = Math.max(0.24, 0.78 - sp.wave * 0.05);
          const kind = Math.random() < 0.35 ? 'alien' : 'rock';
          sp.enemies.push({
            x: 42 + Math.random() * (W - 84), y: -30,
            vx: kind === 'alien' ? (Math.random() - 0.5) * 140 : (Math.random() - 0.5) * 60,
            vy: (kind === 'alien' ? 195 : 165) + sp.wave * 22,
            r: kind === 'alien' ? 20 : 18 + Math.random() * 14,
            hp: kind === 'alien' ? 2 : 1, kind, rot: Math.random() * 6,
          });
        }

        for (let i = sp.bullets.length - 1; i >= 0; i -= 1) {
          sp.bullets[i].y += sp.bullets[i].vy * dt;
          if (sp.bullets[i].y < -20) sp.bullets.splice(i, 1);
        }

        let impact = 0;
        for (let i = sp.enemies.length - 1; i >= 0; i -= 1) {
          const en = sp.enemies[i];
          en.x += en.vx * dt; en.y += en.vy * dt; en.rot += dt * 2.2;
          if (en.x < en.r || en.x > W - en.r) en.vx *= -1;

          let destroyed = false;
          for (let b = sp.bullets.length - 1; b >= 0; b -= 1) {
            if (Math.hypot(sp.bullets[b].x - en.x, sp.bullets[b].y - en.y) < en.r + 7) {
              sp.bullets.splice(b, 1);
              en.hp -= 1;
              if (en.hp <= 0) {
                sp.score += (en.kind === 'alien' ? 45 : 25) * sp.combo;
                sp.combo = Math.min(8, sp.combo + 1);
                boom(en.x, en.y, en.kind === 'alien' ? '#F43F5E' : '#38BDF8', 14);
                playGameSfx('board_move', mutedRef.current);
                sp.enemies.splice(i, 1); destroyed = true; break;
              }
            }
          }
          if (destroyed) continue;

          const hitP1 = Math.hypot(en.x - sp.x, en.y - sp.y) < en.r + 22;
          const hitP2 = useG2Sp && Math.hypot(en.x - sp.x2, en.y - sp.y2) < en.r + 22;
          if (hitP1 || hitP2) {
            sp.hp -= (hitP2 ? sp.p2ShieldOn : sp.shieldOn) ? 14 : 34; sp.combo = 1; sp.shieldFlash = 1; impact = 0.9;
            boom(en.x, en.y, '#FB7185', 18); playGameSfx('board_capture', mutedRef.current);
            pushTelemetry(210, sp.wave, sp.combo, sp.hp, 1, sp.over, hitP2 ? 2 : 1, 75);
            sp.enemies.splice(i, 1);
            if (sp.hp <= 0) {
              sp.over = true;
              const pts = Math.floor(sp.score);
              if (pts > best) { best = pts; try { localStorage.setItem(SPACE_BEST_KEY, String(best)); } catch {} }
              playGameSfx('defeat', mutedRef.current);
              setFinishSummary({ title: '💥 NAVE DESTRUIDA', sub: `Puntuación: ${pts} · Oleada ${sp.wave} · Récord: ${best}` });
            }
            continue;
          }
          if (en.y > H + 40) sp.enemies.splice(i, 1);
        }

        setHud({ leftText: `PUNTOS: ${Math.floor(sp.score)} (x${sp.combo})`, rightText: `ESCUDO: ${Math.max(0, Math.round(sp.hp))}% · OLA ${sp.wave}` });
        pushTelemetry(210 + sp.wave * 35, sp.wave, sp.combo, sp.hp, impact, sp.over);
      }

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#040611'); bg.addColorStop(0.55, '#0b1026'); bg.addColorStop(1, '#180c2e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      drawArcadeTiledBg(ctx, 'assets/games/space/darkPurple.png', W, H, 0, sp.bgScroll);

      for (const s of stars) { ctx.fillStyle = s.z > 1.3 ? '#BAE6FD' : '#64748B'; ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2.5); }
      for (const bl of sp.bullets) {
        const lasPath = bl.p2 ? 'assets/games/space/laserRed01.png' : 'assets/games/space/laserBlue01.png';
        if (!drawArcadeSprite(ctx, lasPath, bl.x, bl.y, 10, 30)) {
          ctx.fillStyle = bl.p2 ? '#FB923C' : '#22D3EE'; ctx.fillRect(bl.x - 2.5, bl.y - 12, 5, 18);
        }
      }

      for (const en of sp.enemies) {
        if (en.kind === 'alien') {
          if (!drawArcadeSprite(ctx, 'assets/games/space/enemyRed3.png', en.x, en.y, 44, 38, Math.sin(en.rot) * 0.16)) {
            ctx.save(); ctx.translate(en.x, en.y); ctx.rotate(en.rot);
            ctx.fillStyle = '#E11D48'; ctx.beginPath();
            ctx.moveTo(0, en.r); ctx.lineTo(-en.r, -en.r * 0.7); ctx.lineTo(0, -en.r * 0.25); ctx.lineTo(en.r, -en.r * 0.7);
            ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 2; ctx.stroke();
            ctx.restore();
          }
        } else if (!drawArcadeSprite(ctx, 'assets/games/space/meteorBrown_big1.png', en.x, en.y, en.r * 2.15, en.r * 2.05, en.rot)) {
          ctx.save(); ctx.translate(en.x, en.y); ctx.rotate(en.rot);
          ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, 0, en.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.restore();
        }
      }

      for (const pt of sp.parts) { ctx.globalAlpha = Math.max(0, pt.life * 2); ctx.fillStyle = pt.col; ctx.fillRect(pt.x - 2, pt.y - 2, 5, 5); }
      ctx.globalAlpha = 1;
      for (const bm of sp.booms) {
        const fIdx = Math.min(EXPLOSION_FRAMES.length - 1, Math.floor((bm.t / bm.dur) * EXPLOSION_FRAMES.length));
        drawArcadeSprite(ctx, EXPLOSION_FRAMES[fIdx], bm.x, bm.y, bm.size, bm.size);
      }

      if (!sp.over) {
        ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.bank);
        drawArcadeSprite(ctx, 'assets/games/space/fire00.png', -12, 24, 12, 22);
        drawArcadeSprite(ctx, 'assets/games/space/fire00.png', 12, 24, 12, 22);
        if (!drawArcadeSprite(ctx, 'assets/games/space/playerShip1_blue.png', 0, 0, 54, 42)) {
          ctx.fillStyle = '#38BDF8';
          ctx.beginPath(); ctx.arc(-11, 22, 5 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(11, 22, 5 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#7C3AED'; ctx.beginPath();
          ctx.moveTo(0, -28); ctx.lineTo(-28, 18); ctx.lineTo(-10, 12); ctx.lineTo(0, 22); ctx.lineTo(10, 12); ctx.lineTo(28, 18);
          ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#22D3EE'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = '#E0F2FE'; ctx.beginPath(); ctx.ellipse(0, -6, 6, 12, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (sp.shieldOn || sp.shieldFlash > 0) {
          if (!drawArcadeSprite(ctx, 'assets/games/space/shield3.png', 0, 0, 76, 72, 0, sp.shieldFlash > 0 ? 0.88 : 0.58)) {
            ctx.strokeStyle = 'rgba(251, 113, 133, 0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.restore();
        if (useG2Sp) {
          ctx.save(); ctx.translate(sp.x2, sp.y2); ctx.rotate(sp.bank2);
          drawArcadeSprite(ctx, 'assets/games/space/fire00.png', -12, 24, 12, 22);
          drawArcadeSprite(ctx, 'assets/games/space/fire00.png', 12, 24, 12, 22);
          if (!drawArcadeSprite(ctx, 'assets/games/space/playerShip2_orange.png', 0, 0, 54, 42)) {
            ctx.fillStyle = '#FB923C'; ctx.beginPath();
            ctx.moveTo(0, -28); ctx.lineTo(-28, 18); ctx.lineTo(0, 12); ctx.lineTo(28, 18); ctx.closePath(); ctx.fill();
          }
          if (sp.p2ShieldOn || sp.shieldFlash > 0) {
            drawArcadeSprite(ctx, 'assets/games/space/shield3.png', 0, 0, 76, 72, 0, sp.shieldFlash > 0 ? 0.88 : 0.58);
          }
          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(stepSpace);
    };
    rafId = requestAnimationFrame(stepSpace);
    return () => cancelAnimationFrame(rafId);
  }, [effectiveRoomId, gameId, resetNonce]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#0D0E17] border border-white/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{gameId === 'gyrohockey' ? '🏒' : '🚀'}</span>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              {gameId === 'gyrohockey' ? 'Neon Air Hockey Gyro' : 'Galaxia Interceptor Gyro'}
            </h3>
            <p className="text-[11px] text-zinc-400">
              {connectedControllers.length > 0
                ? `📱 ${connectedControllers.length}/2 Móviles: ${connectedControllers.map((c, idx) => `J${c.slot || idx + 1}`).join(' · ')}`
                : pickLang(lang, { es: 'Teclado / Táctil o QR Giroscopio Móvil (1-2P)', ca: 'Teclat / Tàctil o QR Giroscopi Mòbil (1-2P)', en: 'Keyboard / Touch or QR Phone Gyro (1-2P)' })}
            </p>
          </div>
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
            onClick={() => { triggerHaptic('light'); setShowQrModal(true); }}
            className="min-h-10 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>Mando Móvil QR</span>
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
            <div className="w-full max-w-sm rounded-3xl bg-[#101322] border-2 border-[#7C3AED] p-6 text-center space-y-4">
              <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
              <h4 className="text-xl font-black text-white">{finishSummary.title}</h4>
              <p className="text-sm font-semibold text-zinc-300">{finishSummary.sub}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setResetNonce((n) => n + 1)}
                  className="min-h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
                >
                  Jugar de nuevo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Touch Arcade Strip for Mobile/Tablet Direct Play */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onPointerDown={() => { keysRef.current.left = true; }}
          onPointerUp={() => { keysRef.current.left = false; }}
          onPointerCancel={() => { keysRef.current.left = false; }}
          className="flex-1 min-h-12 rounded-2xl bg-[#111525] border border-white/15 font-black text-white"
        >
          ◀ IZQ
        </button>
        <button
          type="button"
          onPointerDown={() => { keysRef.current.action = true; }}
          onPointerUp={() => { keysRef.current.action = false; }}
          onPointerCancel={() => { keysRef.current.action = false; }}
          className="flex-1 min-h-12 rounded-2xl bg-[#7C3AED] font-black text-white"
        >
          {gameId === 'gyrohockey' ? '⚡ SMASH' : '🔫 LÁSER'}
        </button>
        <button
          type="button"
          onPointerDown={() => { keysRef.current.right = true; }}
          onPointerUp={() => { keysRef.current.right = false; }}
          onPointerCancel={() => { keysRef.current.right = false; }}
          className="flex-1 min-h-12 rounded-2xl bg-[#111525] border border-white/15 font-black text-white"
        >
          DER ▶
        </button>
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
                <Smartphone className="w-4 h-4 text-cyan-400" /> Mando Giroscopio Móvil
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
              Escanea el QR con tu móvil para controlar inclinando el teléfono en tiempo real.
            </p>
            <p className="text-[11px] font-mono text-cyan-300 break-all">{controllerUrl}</p>
          </div>
        </div>
      )}
    </div>
  );
};
