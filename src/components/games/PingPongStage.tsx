import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, QrCode, RotateCcw, Users, Volume2, VolumeX, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { useDirectDeviceGyro } from '../../hooks/useDirectDeviceGyro';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { VictoryCelebrationOverlay, playGameSfx } from './GameEffects';
import { DualGyroQrPanel } from './racing/DualGyroQrPanel';
import { PixiGameFxLayer, type PixiGameFxHandle } from './arcade/PixiGameFxLayer';
import {
  PingPong3DViewport,
  type PingPong3DSnapshot,
} from './three/PingPong3DViewport';

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
  const pixiFxRef = useRef<PixiGameFxHandle | null>(null);
  const simRef = useRef<PingPong3DSnapshot>({
    p1: { x: 0, y: 0.88, vx: 0, smashT: 0 },
    p2: { x: 0, y: -0.88, vx: 0, smashT: 0 },
    ball: { x: 0, y: 0.65, z: 0.25, vx: 0, vy: 0, spin: 0, lastHit: 1 },
    rings: [],
    banner: 'SACA J1',
    bannerCol: '#22D3EE',
    over: false,
  });

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
    banner: 'SACA J1',
    bannerCol: '#22D3EE',
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

  const directGyro = useDirectDeviceGyro({ maxDeg: 26, pitchMaxDeg: 22, deadzoneDeg: 2.4 });

  useEffect(() => {
    if (!directGyro.active) return;
    const id = window.setInterval(() => {
      const g = directGyro.gyroRef.current;
      if (!g.active) return;
      gyroP1Ref.current = {
        steer: g.steer,
        pitch: g.pitch,
        throttle: Math.max(0, g.pitch),
        brake: Math.max(0, -g.pitch),
        nitro: keysRef.current.p1Smash || g.swing > 1.0,
        handbrake: false,
        swing: g.swing,
        expiresAt: Date.now() + 240,
      };
    }, 40);
    return () => window.clearInterval(id);
  }, [directGyro.active, directGyro.gyroRef]);

  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-pp-${effectiveRoomId}`,
          name: `${userName || 'TV'} (PingPong)`,
          avatar: '🏓',
          color: '#f43f5e',
          role: 'host',
          isHost: true,
          joinedAt: Date.now(),
        },
        `Sala ${effectiveRoomId.toUpperCase()}`
      );
    } else {
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
      } else if (ev.type === 'ROOM_STATE') {
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
    let rafId = 0;
    let lastTs = performance.now();
    let hitSeq = 0;
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
      p1: { x: 0, y: 0.88, vx: 0, smashT: 0 },
      p2: { x: 0, y: -0.88, vx: 0, smashT: 0 },
      ball: { x: 0, y: 0.65, z: 0.25, vx: 0, vy: 0, vz: 0, spin: 0, lastHit: 1 as 1 | 2 },
      rings: [] as Array<{ x: number; y: number; life: number; col: string }>,
    };

    const serveBall = (srv: 1 | 2) => {
      st.server = srv;
      st.rally = 0;
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
      const nextSrv: 1 | 2 =
        totalPts >= 20
          ? totalPts % 2 === 0
            ? 1
            : 2
          : Math.floor(totalPts / 2) % 2 === 0
            ? 1
            : 2;

      if ((st.s1 >= 11 || st.s2 >= 11) && Math.abs(st.s1 - st.s2) >= 2) {
        st.over = true;
        const p1Won = st.s1 > st.s2;
        pixiFxRef.current?.emitBurst(0.5, 0.45, p1Won ? 'victory' : 'goal', 32);
        playGameSfx(p1Won ? 'victory' : 'defeat', mutedRef.current);
        pushTargetTelemetry(p1Won ? 1 : 2, 120, 'pingpong_point', st.s1, st.s2, 0, true);
        setFinishSummary({
          title: p1Won ? '🏆 ¡VICTORIA J1!' : '🏓 ¡VICTORIA J2!',
          sub: `${st.s1} - ${st.s2} · Rally ${st.rally} golpes`,
          won: p1Won,
        });
      } else {
        pixiFxRef.current?.emitBurst(0.5, winner === 1 ? 0.25 : 0.75, 'goal', 18);
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
          const aimX = st.ball.vy < 0 ? Math.max(-0.92, Math.min(0.92, st.ball.x)) : 0;
          const aiSpd = 1.68;
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
                const winner: 1 | 2 = b.y > 0 ? 2 : 1;
                awardPoint(winner, 'FUERA');
                break;
              }
            }

            if (Math.abs(b.y) < 0.04 && b.z < 0.11) {
              b.vy *= -0.4;
              b.y = b.y >= 0 ? 0.045 : -0.045;
              playGameSfx('pingpong_bounce', mutedRef.current);
            }

            if (b.vy > 0 && Math.abs(b.y - st.p1.y) < 0.11 && Math.abs(b.x - st.p1.x) < 0.25 && b.z < 0.58) {
              const smash = st.p1.smashT > 0 || (useG1 && gyroP1Ref.current.nitro);
              const spinBoost = useG1 && gyroP1Ref.current.handbrake ? 1.45 : 1;
              const offset = (b.x - st.p1.x) / 0.25;
              b.y = st.p1.y - 0.11;
              b.vy = -(smash ? 2.28 : 1.65) - Math.min(0.45, st.rally * 0.03);
              b.vx = offset * 1.45 + st.p1.vx * 0.28;
              b.vz = smash ? 0.92 : 1.08;
              b.spin = (-st.p1.vx * 0.45 + offset * 0.8) * spinBoost;
              b.lastHit = 1;
              st.rally += 1;
              hitSeq += 1;
              simRef.current.hitEvent = { seq: hitSeq, x: b.x, y: b.y, z: Math.max(0, b.z), smash };
              pixiFxRef.current?.emitBurst(0.5 + b.x * 0.28, 0.78, smash ? 'smash' : 'hit', smash ? 14 : 8);
              playGameSfx('pingpong_hit', mutedRef.current);
              pushTargetTelemetry(1, smash ? 65 : 32, 'pingpong_hit', st.s1, st.s2, Math.abs(b.vy) * 85, false);
            }

            if (b.vy < 0 && Math.abs(b.y - st.p2.y) < 0.11 && Math.abs(b.x - st.p2.x) < 0.25 && b.z < 0.58) {
              const smash2 = st.p2.smashT > 0 || (useG2 && gyroP2Ref.current.nitro);
              const spinBoost2 = useG2 && gyroP2Ref.current.handbrake ? 1.45 : 1;
              const offset2 = (b.x - st.p2.x) / 0.25;
              b.y = st.p2.y + 0.11;
              b.vy = (smash2 ? 2.28 : 1.65) + Math.min(0.45, st.rally * 0.03);
              b.vx = offset2 * 1.45 + st.p2.vx * 0.28;
              b.vz = smash2 ? 0.92 : 1.08;
              b.spin = (-st.p2.vx * 0.45 + offset2 * 0.8) * spinBoost2;
              b.lastHit = 2;
              st.rally += 1;
              hitSeq += 1;
              simRef.current.hitEvent = { seq: hitSeq, x: b.x, y: b.y, z: Math.max(0, b.z), smash: smash2 };
              pixiFxRef.current?.emitBurst(0.5 + b.x * 0.28, 0.24, smash2 ? 'smash' : 'hit', smash2 ? 14 : 8);
              playGameSfx('pingpong_hit', mutedRef.current);
              if (p2Human) {
                pushTargetTelemetry(2, smash2 ? 65 : 32, 'pingpong_hit', st.s1, st.s2, Math.abs(b.vy) * 85, false);
              }
            }

            if (b.y > 1.32) {
              awardPoint(2, 'WIN J2');
              break;
            } else if (b.y < -1.32) {
              awardPoint(1, 'ACE J1');
              break;
            }
          }
        }
      }

      simRef.current.p1 = st.p1;
      simRef.current.p2 = st.p2;
      simRef.current.ball = st.ball;
      simRef.current.rings = st.rings;
      simRef.current.banner = st.banner;
      simRef.current.bannerCol = st.bannerCol;
      simRef.current.over = st.over;

      if (now - lastHudPush > 90) {
        lastHudPush = now;
        setHud({
          s1: st.s1,
          s2: st.s2,
          server: st.server,
          rally: st.rally,
          p2Human,
          banner: st.banner,
          bannerCol: st.bannerCol,
        });
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [effectiveRoomId, resetNonce]);

  const j1Connected = controllers.some((c, i) => c.slot === 1 || (!c.slot && i === 0));
  const j2Connected = controllers.some((c, i) => c.slot === 2 || (!c.slot && i === 1));

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface w-full max-w-5xl mx-auto flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#0D0E17] border border-white/10 px-3.5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-lg">🏓</span>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              {pickLang(lang, {
                es: 'Ping Pong 3D Pro',
                ca: 'Ping Pong 3D Pro',
                en: 'Ping Pong 3D Pro',
              })}
            </h3>
            <p className="text-[11px] text-zinc-400">
              {controllers.length > 0
                ? `${controllers.length}/2 móviles (${j1Connected ? 'J1 Azul' : ''}${j2Connected ? ' · J2 Rojo' : ''})`
                : pickLang(lang, {
                    es: 'Arrastra o usa A/D + Espacio para rematar · QR 2P',
                    ca: 'Arrossega o usa A/D + Espai per rematar · QR 2P',
                    en: 'Drag or A/D + Space to smash · 2P QR',
                  })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs font-black tabular-nums">
            <span className="text-cyan-300">
              J1 {hud.s1} — {hud.s2} {hud.p2Human ? 'J2' : 'CPU'}
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-zinc-300 inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-400" /> Rally {hud.rally}
            </span>
          </div>

          {directGyro.supported && (
            <button
              type="button"
              onClick={() => void directGyro.toggle()}
              className={`game-touch-btn min-h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                directGyro.active
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/15 text-zinc-200'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>{directGyro.active ? 'Gyro ON' : 'Giroscopio'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowQrModal(true);
            }}
            className="game-touch-btn min-h-10 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 inline-flex items-center gap-1.5 cursor-pointer"
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

      <div className="relative rounded-3xl overflow-hidden bg-[#050915] border border-white/12 shadow-2xl">
        <PingPong3DViewport
          simRef={simRef}
          onPointerMoveX={(nx) => {
            pointerXRef.current = nx;
          }}
          onPointerLeave={() => {
            pointerXRef.current = null;
          }}
          onSmashChange={(active) => {
            keysRef.current.p1Smash = active;
          }}
        />
        <PixiGameFxLayer ref={pixiFxRef} />

        {hud.banner && !finishSummary && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-[#070b18]/85 border border-white/15 text-xs sm:text-sm font-black tracking-wide shadow-xl" style={{ color: hud.bannerCol }}>
            {hud.banner}
          </div>
        )}

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

      {/* Mobile Touch Controls */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            pointerXRef.current = null;
            keysRef.current.p1Left = true;
          }}
          onPointerUp={() => { keysRef.current.p1Left = false; }}
          onPointerCancel={() => { keysRef.current.p1Left = false; }}
          onLostPointerCapture={() => { keysRef.current.p1Left = false; }}
          className="game-touch-btn flex-1 min-h-12 rounded-2xl bg-[#111525] border border-white/15 font-black text-white"
        >
          ◀ IZQ
        </button>
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            triggerHaptic('medium');
            keysRef.current.p1Smash = true;
          }}
          onPointerUp={() => { keysRef.current.p1Smash = false; }}
          onPointerCancel={() => { keysRef.current.p1Smash = false; }}
          onLostPointerCapture={() => { keysRef.current.p1Smash = false; }}
          className="game-touch-btn flex-1 min-h-12 rounded-2xl bg-[#7C3AED] font-black text-white"
        >
          ⚡ SMASH
        </button>
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            pointerXRef.current = null;
            keysRef.current.p1Right = true;
          }}
          onPointerUp={() => { keysRef.current.p1Right = false; }}
          onPointerCancel={() => { keysRef.current.p1Right = false; }}
          onLostPointerCapture={() => { keysRef.current.p1Right = false; }}
          className="game-touch-btn flex-1 min-h-12 rounded-2xl bg-[#111525] border border-white/15 font-black text-white"
        >
          DER ▶
        </button>
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId="pingpong"
          title="Raqueta Móvil Ping Pong 3D Pro 2P"
          controllers={controllers}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
};
