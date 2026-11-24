import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Compass,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { useDirectDeviceGyro } from '../../hooks/useDirectDeviceGyro';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { VictoryCelebrationOverlay, playGameSfx } from './GameEffects';
import { DualGyroQrPanel } from './racing/DualGyroQrPanel';
import {
  SoccerPong3DViewport,
  type SoccerPong3DSnapshot,
} from './three/SoccerPong3DViewport';

export interface SoccerPongStageProps {
  lang: AppLanguage;
  roomId: string;
  userName: string;
  onClose?: () => void;
}

interface GyroPadInput {
  steer: number;
  pitch: number;
  roll?: number;
  nitro: boolean;
  handbrake: boolean;
  expiresAt: number;
}

const WIN_GOALS = 7;

export const SoccerPongStage: React.FC<SoccerPongStageProps> = ({
  lang,
  roomId,
  userName,
  onClose,
}) => {
  const simRef = useRef<SoccerPong3DSnapshot>({
    s1: 0,
    s2: 0,
    p1: { y: 0, vy: 0, hitT: 0, powerT: 0 },
    p2: { y: 0, vy: 0, hitT: 0, powerT: 0 },
    ball: { x: 0, y: 0, vx: 0.72, vy: 0.25, power: false, lastHit: 1 },
    paused: false,
  });

  const keysRef = useRef({
    p1Up: false,
    p1Down: false,
    p1Power: false,
    p2Up: false,
    p2Down: false,
    p2Power: false,
  });
  const pointerTargetYRef = useRef<{ y: number; expiresAt: number } | null>(null);
  const gyroP1Ref = useRef<GyroPadInput>({ steer: 0, pitch: 0, nitro: false, handbrake: false, expiresAt: 0 });
  const gyroP2Ref = useRef<GyroPadInput>({ steer: 0, pitch: 0, nitro: false, handbrake: false, expiresAt: 0 });

  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'pro'>('normal');
  const diffRef = useRef<'easy' | 'normal' | 'pro'>('normal');
  diffRef.current = difficulty;

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [showQrModal, setShowQrModal] = useState(false);
  const [controllers, setControllers] = useState<
    Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>
  >([]);
  const [hud, setHud] = useState({ s1: 0, s2: 0, p2Human: false, goalFlash: 0 as 0 | 1 | 2 });
  const [finishSummary, setFinishSummary] = useState<{
    title: string;
    sub: string;
    won: boolean;
  } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || 'sp-local').trim().toLowerCase(),
    [roomId]
  );

  const directGyro = useDirectDeviceGyro({ maxDeg: 26, pitchMaxDeg: 22, deadzoneDeg: 2.2 });

  useEffect(() => {
    if (!directGyro.active) return;
    const id = window.setInterval(() => {
      const g = directGyro.gyroRef.current;
      if (!g.active) return;
      gyroP1Ref.current = {
        steer: g.steer,
        pitch: g.pitch,
        nitro: keysRef.current.p1Power || g.swing > 1.15,
        handbrake: false,
        expiresAt: Date.now() + 260,
      };
    }, 36);
    return () => window.clearInterval(id);
  }, [directGyro.active, directGyro.gyroRef]);

  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-sp-${effectiveRoomId}`,
          name: `${userName || 'TV'} (Fútbol Pong)`,
          avatar: '⚽',
          color: '#2563eb',
          role: 'host',
          isHost: true,
          joinedAt: Date.now(),
        },
        `Sala ${effectiveRoomId.toUpperCase()}`
      );
    } else {
      socketService.joinGyroChannel('display', `${userName || 'TV'} (Fútbol Pong)`, effectiveRoomId, {
        gameId: 'soccerpong',
      });
    }
    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>)
          : [];
        setControllers(list);
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot = ev.payload.playerSlot === 2 ? 2 : 1;
        const target = slot === 2 ? gyroP2Ref : gyroP1Ref;
        target.current = {
          steer: Number(ev.payload.steer || 0),
          pitch: Number(ev.payload.pitch || 0),
          roll: Number(ev.payload.roll || 0),
          nitro: Boolean(ev.payload.nitro),
          handbrake: Boolean(ev.payload.handbrake),
          expiresAt: Date.now() + 1400,
        };
      } else if (ev.type === 'ROOM_STATE') {
        socketService.joinGyroChannel('display', `${userName || 'TV'} (Fútbol Pong)`, effectiveRoomId, {
          gameId: 'soccerpong',
        });
      }
    });
    return () => unsub();
  }, [effectiveRoomId, userName]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') {
        keysRef.current.p1Up = true;
        if (k === 'ArrowUp') e.preventDefault();
      } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
        keysRef.current.p1Down = true;
        if (k === 'ArrowDown') e.preventDefault();
      } else if (k === ' ') {
        keysRef.current.p1Power = true;
        e.preventDefault();
      } else if (k === 'i' || k === 'I') keysRef.current.p2Up = true;
      else if (k === 'k' || k === 'K') keysRef.current.p2Down = true;
      else if (k === 'Enter') keysRef.current.p2Power = true;
      else if (k === 'p' || k === 'P') setPaused((prev) => !prev);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.p1Up = false;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') keysRef.current.p1Down = false;
      else if (k === ' ') keysRef.current.p1Power = false;
      else if (k === 'i' || k === 'I') keysRef.current.p2Up = false;
      else if (k === 'k' || k === 'K') keysRef.current.p2Down = false;
      else if (k === 'Enter') keysRef.current.p2Power = false;
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
    let wallHitSeq = 0;
    let goalSeq = 0;
    let kickoffPause = 0.65;
    let over = false;
    setFinishSummary(null);

    const serveBall = (dir: 1 | -1) => {
      const angle = (Math.random() - 0.5) * 0.8;
      const spd = 0.88;
      simRef.current.ball = {
        x: 0,
        y: 0,
        vx: Math.cos(angle) * spd * dir,
        vy: Math.sin(angle) * spd,
        power: false,
        lastHit: dir === 1 ? 1 : 2,
      };
      kickoffPause = 0.6;
    };

    simRef.current = {
      s1: 0,
      s2: 0,
      p1: { y: 0, vy: 0, hitT: 0, powerT: 0 },
      p2: { y: 0, vy: 0, hitT: 0, powerT: 0 },
      ball: { x: 0, y: 0, vx: 0.85, vy: 0.28, power: false, lastHit: 1 },
      paused: false,
    };
    setHud({ s1: 0, s2: 0, p2Human: false, goalFlash: 0 });

    const pushGoalTelemetry = (winner: 1 | 2, matchOver: boolean) => {
      if (!socketService.isConnected() || !socketService.getActiveRoomId()) return;
      socketService.sendRacingTelemetry({
        roomId: socketService.getActiveRoomId() || effectiveRoomId,
        speedKmh: 120,
        rpmPct: 90,
        gear: 2,
        lap: 1,
        totalLaps: 1,
        position: 1,
        totalCars: 2,
        nitroPct: 100,
        collisionImpact: 1,
        offroad: false,
        raceState: matchOver ? 'finished' : 'racing',
        targetSlot: winner,
        hapticPulseMs: matchOver ? 140 : 85,
        scoreP1: simRef.current.s1,
        scoreP2: simRef.current.s2,
        eventTag: 'pingpong_point',
      });
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.036, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;
      const st = simRef.current;
      st.paused = pausedRef.current;

      const epoch = Date.now();
      const useG1 = epoch < gyroP1Ref.current.expiresAt;
      const useG2 = epoch < gyroP2Ref.current.expiresAt || keysRef.current.p2Up || keysRef.current.p2Down;

      if (!pausedRef.current && !over) {
        const padSpeed = 2.05;
        // Player 1 movement (pointer drag, gyro tilt, or buttons/keys)
        let p1TargetVy = 0;
        const ptr = pointerTargetYRef.current;
        if (ptr && epoch < ptr.expiresAt) {
          const diff = ptr.y - st.p1.y;
          p1TargetVy = Math.max(-1, Math.min(1, diff * 7.5)) * padSpeed * 1.4;
        } else if (useG1) {
          // Support SUBIR/BAJAR buttons (roll) OR either pitch/steer gyro tilt
          const btnDir = gyroP1Ref.current.roll || 0;
          const tiltAxis =
            Math.abs(btnDir) > 0.1
              ? btnDir
              : Math.abs(gyroP1Ref.current.pitch) > Math.abs(gyroP1Ref.current.steer)
              ? -gyroP1Ref.current.pitch
              : gyroP1Ref.current.steer;
          p1TargetVy = tiltAxis * padSpeed * 1.35;
        } else {
          const dir1 = (keysRef.current.p1Down ? 1 : 0) - (keysRef.current.p1Up ? 1 : 0);
          p1TargetVy = dir1 * padSpeed;
        }

        const prevY1 = st.p1.y;
        st.p1.y = Math.max(-1, Math.min(1, st.p1.y + p1TargetVy * dt));
        st.p1.vy = (st.p1.y - prevY1) / Math.max(0.005, dt);
        if (keysRef.current.p1Power || (useG1 && gyroP1Ref.current.nitro)) {
          st.p1.powerT = 0.28;
        } else {
          st.p1.powerT = Math.max(0, st.p1.powerT - dt);
        }

        // Player 2 movement (Phone 2, P2 keys, or smart CPU)
        let p2TargetVy = 0;
        if (epoch < gyroP2Ref.current.expiresAt) {
          const g2 = gyroP2Ref.current;
          const btnDir2 = g2.roll || 0;
          const tAxis =
            Math.abs(btnDir2) > 0.1
              ? btnDir2
              : Math.abs(g2.pitch) > Math.abs(g2.steer)
              ? -g2.pitch
              : g2.steer;
          p2TargetVy = tAxis * padSpeed * 1.35;
          if (g2.nitro) st.p2.powerT = 0.28;
        } else if (keysRef.current.p2Up || keysRef.current.p2Down) {
          p2TargetVy = ((keysRef.current.p2Down ? 1 : 0) - (keysRef.current.p2Up ? 1 : 0)) * padSpeed;
          if (keysRef.current.p2Power) st.p2.powerT = 0.28;
        } else {
          const aiSpeed = diffRef.current === 'pro' ? 1.88 : diffRef.current === 'easy' ? 1.05 : 1.48;
          const aimY = st.ball.vx > 0 ? st.ball.y * 1.08 : st.ball.y * 0.45;
          const delta = aimY - st.p2.y;
          if (Math.abs(delta) > 0.05) {
            p2TargetVy = Math.sign(delta) * Math.min(aiSpeed, Math.abs(delta) * 5.2);
          }
        }
        const prevY2 = st.p2.y;
        st.p2.y = Math.max(-1, Math.min(1, st.p2.y + p2TargetVy * dt));
        st.p2.vy = (st.p2.y - prevY2) / Math.max(0.005, dt);
        st.p2.powerT = Math.max(0, st.p2.powerT - dt);

        st.p1.hitT = Math.max(0, st.p1.hitT - dt * 3.8);
        st.p2.hitT = Math.max(0, st.p2.hitT - dt * 3.8);

        if (kickoffPause > 0) {
          kickoffPause = Math.max(0, kickoffPause - dt);
        } else {
          // 2 substeps prevent tunneling even on Power Shots
          const subSteps = 2;
          const sdt = dt / subSteps;
          for (let s = 0; s < subSteps; s += 1) {
            const b = st.ball;
            b.x += b.vx * sdt;
            b.y += b.vy * sdt;

            // Stone block top/bottom boundary bounce
            if (b.y <= -0.92 && b.vy < 0) {
              b.y = -0.92;
              b.vy = -b.vy;
              wallHitSeq += 1;
              st.wallHitEvent = { seq: wallHitSeq, side: 'top', x: b.x };
              playGameSfx('pingpong_bounce', mutedRef.current);
            } else if (b.y >= 0.92 && b.vy > 0) {
              b.y = 0.92;
              b.vy = -b.vy;
              wallHitSeq += 1;
              st.wallHitEvent = { seq: wallHitSeq, side: 'bottom', x: b.x };
              playGameSfx('pingpong_bounce', mutedRef.current);
            }

            // Paddle collision geometry (normalized coordinates)
            const p1HalfSpan = 0.255;
            const pad1X = -0.865;
            const pad2X = 0.865;

            if (b.vx < 0 && b.x <= pad1X + 0.06 && b.x >= pad1X - 0.08 && Math.abs(b.y - st.p1.y * 0.74) <= p1HalfSpan) {
              const offset = Math.max(-1, Math.min(1, (b.y - st.p1.y * 0.74) / p1HalfSpan));
              const powerHit = st.p1.powerT > 0;
              const nextSpeed = Math.min(1.95, Math.hypot(b.vx, b.vy) * (powerHit ? 1.24 : 1.045) + (powerHit ? 0.22 : 0.03));
              const angle = offset * 0.92 + Math.max(-0.22, Math.min(0.22, st.p1.vy * 0.14));
              b.vx = Math.cos(angle) * nextSpeed;
              b.vy = Math.sin(angle) * nextSpeed;
              b.x = pad1X + 0.065;
              b.power = powerHit || nextSpeed > 1.38;
              b.lastHit = 1;
              st.p1.hitT = 1;
              hitSeq += 1;
              st.hitEvent = { seq: hitSeq, x: b.x, y: b.y, color: '#3b82f6', power: b.power };
              playGameSfx('pingpong_hit', mutedRef.current);
              triggerHaptic(b.power ? 'medium' : 'light');
            } else if (
              b.vx > 0 &&
              b.x >= pad2X - 0.06 &&
              b.x <= pad2X + 0.08 &&
              Math.abs(b.y - st.p2.y * 0.74) <= p1HalfSpan
            ) {
              const offset = Math.max(-1, Math.min(1, (b.y - st.p2.y * 0.74) / p1HalfSpan));
              const powerHit = st.p2.powerT > 0;
              const nextSpeed = Math.min(1.95, Math.hypot(b.vx, b.vy) * (powerHit ? 1.22 : 1.045) + (powerHit ? 0.18 : 0.03));
              const angle = offset * 0.92 + Math.max(-0.22, Math.min(0.22, st.p2.vy * 0.14));
              b.vx = -Math.cos(angle) * nextSpeed;
              b.vy = Math.sin(angle) * nextSpeed;
              b.x = pad2X - 0.065;
              b.power = powerHit || nextSpeed > 1.38;
              b.lastHit = 2;
              st.p2.hitT = 1;
              hitSeq += 1;
              st.hitEvent = { seq: hitSeq, x: b.x, y: b.y, color: '#ef4444', power: b.power };
              playGameSfx('pingpong_hit', mutedRef.current);
              triggerHaptic(b.power ? 'medium' : 'light');
            }

            // Wooden corner brace deflection on extreme Y near goals
            if (Math.abs(b.x) > 0.94 && Math.abs(b.y) > 0.78) {
              b.vy = -Math.sign(b.y) * Math.max(0.45, Math.abs(b.vy));
              b.vx = -Math.sign(b.x) * Math.max(0.55, Math.abs(b.vx));
              b.x = Math.sign(b.x) * 0.93;
              playGameSfx('pingpong_bounce', mutedRef.current);
            }

            // Goal crossed left or right wooden line
            if (b.x < -1.03 || b.x > 1.03) {
              const scorer: 1 | 2 = b.x > 1.03 ? 1 : 2;
              if (scorer === 1) st.s1 += 1;
              else st.s2 += 1;
              goalSeq += 1;
              st.goalEvent = { seq: goalSeq, scorer };
              playGameSfx('pingpong_point', mutedRef.current);
              triggerHaptic('warning');

              if (st.s1 >= WIN_GOALS || st.s2 >= WIN_GOALS) {
                over = true;
                pushGoalTelemetry(scorer, true);
                const p1Won = st.s1 > st.s2;
                setFinishSummary({
                  title: p1Won
                    ? pickLang(lang, { es: '¡VICTORIA EQUIPO AZUL!', ca: 'VICTÒRIA EQUIP BLAU!', en: 'BLUE TEAM WINS!' })
                    : useG2
                    ? pickLang(lang, { es: '¡VICTORIA EQUIPO ROJO!', ca: 'VICTÒRIA EQUIP VERMELL!', en: 'RED TEAM WINS!' })
                    : pickLang(lang, { es: '¡GANA EL RIVAL ROJO!', ca: 'GUANYA EL RIVAL VERMELL!', en: 'RED RIVAL WINS!' }),
                  sub: `${st.s1} - ${st.s2}`,
                  won: p1Won,
                });
              } else {
                pushGoalTelemetry(scorer, false);
                serveBall(scorer === 1 ? -1 : 1);
              }
              setHud({ s1: st.s1, s2: st.s2, p2Human: useG2, goalFlash: scorer });
              break;
            }
          }
        }
      }

      if (Math.random() < 0.14) {
        setHud((prev) =>
          prev.s1 === st.s1 && prev.s2 === st.s2 && prev.p2Human === useG2
            ? prev
            : { ...prev, s1: st.s1, s2: st.s2, p2Human: useG2 }
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [effectiveRoomId, lang, resetNonce]);

  const setHoldKey = (field: 'p1Up' | 'p1Down' | 'p1Power', active: boolean) => {
    keysRef.current[field] = active;
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Compact Top Match Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-[#10131e] border border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <span className="text-blue-400 tabular-nums">J1 {hud.s1}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-red-400 tabular-nums">{hud.s2} {hud.p2Human ? 'J2' : 'CPU'}</span>
          </div>
          <span className="hidden sm:inline text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Primero a 7 goles · Arrastra o usa ▲ ▼',
              ca: 'Primer a 7 gols · Arrossega o usa ▲ ▼',
              en: 'First to 7 goals · Drag or ▲ ▼',
            })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!hud.p2Human && (
            <div className="flex items-center bg-black/40 rounded-xl p-0.5 border border-white/10">
              {(['easy', 'normal', 'pro'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDifficulty(lvl)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap ${
                    difficulty === lvl
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {lvl === 'easy' ? 'Fácil' : lvl === 'pro' ? 'Pro' : 'Normal'}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void directGyro.toggle()}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap min-h-[38px] ${
              directGyro.active
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-white/5 border-white/15 text-zinc-200 hover:bg-white/10'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{directGyro.active ? 'Gyro ON' : 'Giroscopio'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/85 hover:bg-indigo-500 text-white flex items-center gap-1.5 whitespace-nowrap min-h-[38px]"
          >
            <QrCode className="w-4 h-4" />
            <span>QR {controllers.length > 0 ? `(${controllers.length})` : '1P/2P'}</span>
          </button>

          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Reanudar' : 'Pausar'}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 border border-white/10 min-w-[38px] min-h-[38px] flex items-center justify-center"
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 border border-white/10 min-w-[38px] min-h-[38px] flex items-center justify-center"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setResetNonce((n) => n + 1)}
            aria-label="Reiniciar partido"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 border border-white/10 min-w-[38px] min-h-[38px] flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar juego"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 border border-white/10 min-w-[38px] min-h-[38px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main 3D Soccer Pong Pitch Viewport */}
      <div className="relative w-full aspect-[16/10] sm:aspect-video max-h-[68vh] rounded-2xl overflow-hidden border border-white/15 bg-[#e8dfb6] shadow-2xl">
        <SoccerPong3DViewport
          simRef={simRef}
          onPointerMoveY={(ny) => {
            pointerTargetYRef.current = { y: ny, expiresAt: Date.now() + 260 };
          }}
          onPointerDownField={(ny) => {
            pointerTargetYRef.current = { y: ny, expiresAt: Date.now() + 260 };
          }}
          onCenterTogglePause={() => setPaused((p) => !p)}
        />

        {paused && !finishSummary && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center z-10">
            <button
              type="button"
              onClick={() => setPaused(false)}
              className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base shadow-xl flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              <span>{pickLang(lang, { es: 'Continuar partido', ca: 'Continuar partit', en: 'Resume match' })}</span>
            </button>
          </div>
        )}

        {finishSummary && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={finishSummary.title}
            subtitle={finishSummary.sub}
            outcome={finishSummary.won ? 'win' : 'defeat'}
            scoreBadge={finishSummary.sub}
            primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
            onPrimaryAction={() => setResetNonce((n) => n + 1)}
          />
        )}
      </div>

      {/* Tactile Touch Controls Bar (Large >= 48px Targets) */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onPointerDown={() => setHoldKey('p1Up', true)}
          onPointerUp={() => setHoldKey('p1Up', false)}
          onPointerLeave={() => setHoldKey('p1Up', false)}
          onPointerCancel={() => setHoldKey('p1Up', false)}
          className="h-12 sm:h-14 rounded-2xl bg-blue-600/85 active:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-2 border border-blue-400/40 select-none touch-none"
        >
          <ArrowUp className="w-5 h-5" />
          <span>SUBIR</span>
        </button>

        <button
          type="button"
          onPointerDown={() => setHoldKey('p1Power', true)}
          onPointerUp={() => setHoldKey('p1Power', false)}
          onPointerLeave={() => setHoldKey('p1Power', false)}
          onPointerCancel={() => setHoldKey('p1Power', false)}
          className="h-12 sm:h-14 rounded-2xl bg-amber-500/90 active:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 border border-amber-300/60 select-none touch-none"
        >
          <Zap className="w-5 h-5" />
          <span>TIRO</span>
        </button>

        <button
          type="button"
          onPointerDown={() => setHoldKey('p1Down', true)}
          onPointerUp={() => setHoldKey('p1Down', false)}
          onPointerLeave={() => setHoldKey('p1Down', false)}
          onPointerCancel={() => setHoldKey('p1Down', false)}
          className="h-12 sm:h-14 rounded-2xl bg-blue-600/85 active:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-2 border border-blue-400/40 select-none touch-none"
        >
          <ArrowDown className="w-5 h-5" />
          <span>BAJAR</span>
        </button>
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId="soccerpong"
          title={pickLang(lang, {
            es: 'Fútbol Pong 3D · Mando Móvil 1P / 2P',
            ca: 'Futbol Pong 3D · Comandament Mòbil 1P / 2P',
            en: 'Soccer Pong 3D · 1P / 2P Phone Controller',
          })}
          controllers={controllers}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
};
