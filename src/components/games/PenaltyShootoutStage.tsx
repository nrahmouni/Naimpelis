import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  QrCode,
  RotateCcw,
  Shield,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PENALTY_COUNTRIES, type PenaltyCountry } from '../../shared/penaltyCountries';
import { VictoryCelebrationOverlay } from './GameEffects';
import { DualGyroQrPanel } from './racing/DualGyroQrPanel';

export interface PenaltyShootoutStageProps {
  lang: AppLanguage;
  roomId?: string;
  userName?: string;
  onClose?: () => void;
}

type KickOutcome = 'goal' | 'saved' | 'post' | 'miss';
type TurnAttacker = 1 | 2;
type MatchMode = 'cpu' | '2p';

interface BallFlight {
  active: boolean;
  t: number;
  duration: number;
  endX: number;
  endY: number;
  curve: number; // -1 (left bend) .. +1 (right bend)
  outcome: KickOutcome;
  resolved: boolean;
  spinAngle: number;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface GyroControllerData {
  steer: number;
  pitch: number;
  roll: number;
  swing: number;
  nitro: boolean;
  throttle: number;
  handbrake: boolean;
  brake: number;
  expiresAt: number;
}

const EMPTY_GYRO: GyroControllerData = {
  steer: 0,
  pitch: 0,
  roll: 0,
  swing: 0,
  nitro: false,
  throttle: 0,
  handbrake: false,
  brake: 0,
  expiresAt: 0,
};

const BEST_SCORE_KEY = 'riffan_penalty_best_streak_v2';
const TURN_SECONDS = 8.0;

function playPenaltySound(
  kind: 'kick' | 'goal' | 'save' | 'post' | 'whistle' | 'tick',
  muted: boolean
) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);

    if (kind === 'kick') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(44, now + 0.14);
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (kind === 'post') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(390, now + 0.36);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.37);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (kind === 'goal') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.22);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (kind === 'save') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(105, now + 0.22);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (kind === 'tick') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      g.gain.setValueAtTime(0.06, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.start(now);
      osc.stop(now + 0.06);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2680, now);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 600);
  } catch {
    // ignore audio unlock errors
  }
}

export const PenaltyShootoutStage: React.FC<PenaltyShootoutStageProps> = ({
  lang,
  roomId = '',
  userName = 'Jugador',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stadiumImgRef = useRef<HTMLImageElement | null>(null);

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [matchMode, setMatchMode] = useState<MatchMode>('cpu');
  const matchModeRef = useRef<MatchMode>('cpu');
  matchModeRef.current = matchMode;

  const [p1Country, setP1Country] = useState<PenaltyCountry>(PENALTY_COUNTRIES[0]); // ESP
  const [p2Country, setP2Country] = useState<PenaltyCountry>(PENALTY_COUNTRIES[1]); // ARG
  const p1CountryRef = useRef<PenaltyCountry>(p1Country);
  const p2CountryRef = useRef<PenaltyCountry>(p2Country);
  p1CountryRef.current = p1Country;
  p2CountryRef.current = p2Country;

  const [pickingSlot, setPickingSlot] = useState<1 | 2 | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [controllers, setControllers] = useState<
    Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>
  >([]);

  const [attacker, setAttacker] = useState<TurnAttacker>(1);
  const [round, setRound] = useState(1);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1History, setP1History] = useState<Array<'goal' | 'miss'>>([]);
  const [p2History, setP2History] = useState<Array<'goal' | 'miss'>>([]);
  const [curveUi, setCurveUi] = useState(0);
  const [timeLeftUi, setTimeLeftUi] = useState(TURN_SECONDS);
  const [keeperLockedUi, setKeeperLockedUi] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [winner, setWinner] = useState<TurnAttacker | null>(null);
  const [bestStreak, setBestStreak] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_SCORE_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  });

  const gyroP1Ref = useRef<GyroControllerData>({ ...EMPTY_GYRO });
  const gyroP2Ref = useRef<GyroControllerData>({ ...EMPTY_GYRO });
  const prevP1ActionRef = useRef(false);
  const prevP2ActionRef = useRef(false);
  const lastTimerBeepSecRef = useRef<number>(99);

  const effectiveRoomId = useMemo(() => {
    const clean = (roomId || socketService.getActiveRoomId() || '').trim().toLowerCase();
    if (clean) return clean;
    return `pen-${Math.floor(1000 + Math.random() * 9000)}`;
  }, [roomId]);

  const stateRef = useRef({
    aimX: 0,
    aimY: 0.48,
    curve: 0, // -1 .. +1
    powerPct: 72,
    powerDir: 1,
    keeperSecretDive: null as number | null, // -0.82 .. +0.82 hidden during 2P until shot!
    keeperX: 0,
    keeperTargetX: 0,
    keeperDiveY: 0,
    strikerRunT: 0, // 0 = standing, 0..1 = running up to kick
    strikerKicking: false,
    netRipple: 0,
    netImpactX: 0,
    cameraShake: 0,
    attacker: 1 as TurnAttacker,
    round: 1,
    p1Score: 0,
    p2Score: 0,
    p1Hist: [] as Array<'goal' | 'miss'>,
    p2Hist: [] as Array<'goal' | 'miss'>,
    winner: null as TurnAttacker | null,
    waitingNext: false,
    turnTimeLeft: TURN_SECONDS,
    particles: [] as DustParticle[],
    trail: [] as Array<{ x: number; y: number }>,
    ball: {
      active: false,
      t: 0,
      duration: 0.56,
      endX: 0,
      endY: 0,
      curve: 0,
      outcome: 'goal' as KickOutcome,
      resolved: false,
      spinAngle: 0,
    } as BallFlight,
  });

  // Preload realistic stadium photo backdrop & online CC0 sprite packs
  useEffect(() => {
    preloadOnlineGameAssets();
    if (typeof Image === 'undefined') return;
    const img = new Image();
    img.src = '/assets/games/penalty/stadium_backdrop.jpg';
    img.onload = () => {
      stadiumImgRef.current = img;
    };
  }, []);

  // Connect WebSocket for 1P/2P phone pairing
  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-pen-${effectiveRoomId}`,
          name: `${userName || 'TV'} (Penaltis)`,
          avatar: '⚽',
          color: '#10b981',
          role: 'host',
          isHost: true,
          joinedAt: Date.now(),
        },
        `Sala ${effectiveRoomId.toUpperCase()}`
      );
    } else {
      socketService.joinGyroChannel('display', `${userName || 'Jugador'} (Penaltis)`, effectiveRoomId, {
        gameId: 'penalty',
      });
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'ROOM_STATE') {
        socketService.joinGyroChannel('display', `${userName || 'Jugador'} (Penaltis)`, effectiveRoomId, {
          gameId: 'penalty',
        });
      } else if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>)
          : [];
        setControllers(list);
        if (list.length >= 2) {
          setMatchMode('2p');
        }
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot = ev.payload.playerSlot === 2 ? 2 : 1;
        const target = slot === 2 ? gyroP2Ref : gyroP1Ref;
        target.current = {
          steer: Number(ev.payload.steer || 0),
          pitch: Number(ev.payload.pitch || 0),
          roll: Number(ev.payload.roll || 0),
          swing: Number(ev.payload.swing || 0),
          nitro: Boolean(ev.payload.nitro),
          throttle: Number(ev.payload.throttle || 0),
          handbrake: Boolean(ev.payload.handbrake),
          brake: Number(ev.payload.brake || 0),
          expiresAt: Date.now() + 1400,
        };
      }
    });
    return () => unsub();
  }, [effectiveRoomId, userName]);

  const sendControllerHaptic = useCallback(
    (targetSlot: 1 | 2, hapticPulseMs: number, eventTag: string) => {
      const st = stateRef.current;
      const rId = socketService.getActiveRoomId() || effectiveRoomId;
      if (!socketService.isConnected()) return;
      socketService.sendRacingTelemetry(
        {
          roomId: rId,
          speedKmh: 0,
          rpmPct: Math.round(st.powerPct),
          gear: st.round,
          lap: st.round,
          totalLaps: 5,
          position: 1,
          totalCars: 2,
          nitroPct: 100,
          raceState: st.winner ? 'finished' : 'racing',
          targetSlot,
          hapticPulseMs,
          scoreP1: st.p1Score,
          scoreP2: st.p2Score,
          eventTag,
        },
        rId
      );
    },
    [effectiveRoomId]
  );

  const resetMatch = useCallback(() => {
    triggerHaptic('medium');
    const st = stateRef.current;
    st.aimX = 0;
    st.aimY = 0.48;
    st.curve = 0;
    st.powerPct = 72;
    st.keeperSecretDive = null;
    st.keeperX = 0;
    st.keeperTargetX = 0;
    st.keeperDiveY = 0;
    st.strikerRunT = 0;
    st.strikerKicking = false;
    st.netRipple = 0;
    st.cameraShake = 0;
    st.attacker = 1;
    st.round = 1;
    st.p1Score = 0;
    st.p2Score = 0;
    st.p1Hist = [];
    st.p2Hist = [];
    st.winner = null;
    st.waitingNext = false;
    st.turnTimeLeft = TURN_SECONDS;
    st.particles = [];
    st.trail = [];
    st.ball.active = false;
    lastTimerBeepSecRef.current = 99;
    setCurveUi(0);
    setTimeLeftUi(TURN_SECONDS);
    setKeeperLockedUi(false);
    setAttacker(1);
    setRound(1);
    setP1Score(0);
    setP2Score(0);
    setP1History([]);
    setP2History([]);
    setBanner(null);
    setWinner(null);
    playPenaltySound('whistle', mutedRef.current);
  }, []);

  const spawnTurfDust = (x: number, y: number, color: string, count: number) => {
    const st = stateRef.current;
    for (let i = 0; i < count; i += 1) {
      const ang = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
      const spd = 80 + Math.random() * 190;
      st.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd + (Math.random() - 0.5) * 90,
        vy: Math.sin(ang) * spd - 40,
        life: 0.45 + Math.random() * 0.45,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  };

  const executeKickWithRunup = useCallback(
    (customAimX?: number, customAimY?: number, customCurve?: number) => {
      const st = stateRef.current;
      if (st.winner || st.ball.active || st.waitingNext || st.strikerKicking) return;

      st.strikerKicking = true;
      st.strikerRunT = 0;

      const shotAimX = typeof customAimX === 'number' ? customAimX : st.aimX;
      const shotAimY = typeof customAimY === 'number' ? customAimY : st.aimY;
      const shotCurve = typeof customCurve === 'number' ? customCurve : st.curve;

      // In CPU mode when P1 shoots, CPU dives immediately. When P2/CPU shoots vs P1 keeper, P1 uses keeperSecretDive.
      window.setTimeout(() => {
        const cur = stateRef.current;
        if (cur.winner || cur.ball.active || cur.waitingNext) return;

        playPenaltySound('kick', mutedRef.current);
        triggerHaptic('medium');
        spawnTurfDust(480, 464, '#a3e635', 14);
        sendControllerHaptic(cur.attacker, 65, 'penalty_kick');

        if (matchModeRef.current === 'cpu' && cur.attacker === 2) {
          // CPU shoots at P1 keeper
          const cpuEndX = [-0.84, -0.45, 0.04, 0.46, 0.84][Math.floor(Math.random() * 5)];
          const cpuEndY = 0.2 + Math.random() * 0.68;
          const cpuCurve = (Math.random() - 0.5) * 1.1;
          const p1Dive = cur.keeperSecretDive !== null ? cur.keeperSecretDive : 0;
          cur.keeperTargetX = p1Dive;
          cur.keeperDiveY = Math.abs(p1Dive) > 0.2 ? 0.16 : -0.1;

          const saved =
            Math.abs(cpuEndX - p1Dive) < 0.42 &&
            (Math.abs(p1Dive) > 0.15 || cpuEndY < 0.72);
          const outcome: KickOutcome = saved ? 'saved' : 'goal';

          cur.ball = {
            active: true,
            t: 0,
            duration: 0.54,
            endX: cpuEndX,
            endY: cpuEndY,
            curve: cpuCurve,
            outcome,
            resolved: false,
            spinAngle: 0,
          };
        } else {
          // Human kick (P1 always, or P2 in 2P mode)
          const keeperPick =
            matchModeRef.current === '2p'
              ? cur.keeperSecretDive !== null
                ? cur.keeperSecretDive
                : 0
              : [-0.84, 0, 0.84][Math.floor(Math.random() * 3)];

          cur.keeperTargetX = keeperPick;
          cur.keeperDiveY = Math.abs(keeperPick) > 0.2 ? 0.16 : -0.1;

          // Final ball placement includes realistic Magnus bend contribution
          const effectiveEndX = Math.max(-1.12, Math.min(1.12, shotAimX + shotCurve * 0.22));
          const overPower = cur.powerPct > 96 || shotAimY > 1.01;
          const hitPost = !overPower && Math.abs(effectiveEndX) > 0.91 && Math.abs(effectiveEndX) < 1.04;
          const wideMiss = !overPower && Math.abs(effectiveEndX) >= 1.04;
          const savedByKeeper =
            !overPower &&
            !hitPost &&
            !wideMiss &&
            Math.abs(effectiveEndX - keeperPick) < 0.37 &&
            shotAimY < 0.88;

          let outcome: KickOutcome = 'goal';
          if (overPower || wideMiss) outcome = 'miss';
          else if (hitPost) outcome = 'post';
          else if (savedByKeeper) outcome = 'saved';

          cur.ball = {
            active: true,
            t: 0,
            duration: 0.54,
            endX: overPower ? effectiveEndX * 1.08 : effectiveEndX,
            endY: overPower ? 1.24 : shotAimY,
            curve: shotCurve,
            outcome,
            resolved: false,
            spinAngle: 0,
          };
        }
        cur.strikerKicking = false;
      }, 240);
    },
    [sendControllerHaptic]
  );

  const lockKeeperDive = useCallback(
    (dir: -1 | 0 | 1, immediateCpuTrigger = false) => {
      const st = stateRef.current;
      if (st.winner || st.ball.active || st.waitingNext || st.strikerKicking) return;
      st.keeperSecretDive = dir * 0.84;
      setKeeperLockedUi(true);
      triggerHaptic('light');
      if (immediateCpuTrigger && matchModeRef.current === 'cpu' && st.attacker === 2) {
        executeKickWithRunup();
      }
    },
    [executeKickWithRunup]
  );

  const adjustCurve = useCallback((delta: number) => {
    const st = stateRef.current;
    if (st.winner || st.ball.active || st.waitingNext) return;
    st.curve = Math.max(-1, Math.min(1, Number((st.curve + delta).toFixed(2))));
    setCurveUi(st.curve);
    triggerHaptic('light');
  }, []);

  // Keyboard & 2P local controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (e.code === 'KeyR') {
        resetMatch();
        return;
      }
      if (st.winner || st.ball.active || st.waitingNext || st.strikerKicking) return;

      const isCpuTurnToKick = matchModeRef.current === 'cpu' && st.attacker === 2;

      // Keeper controls: J/K/L always work for defender in 2P, or Arrows when defending vs CPU
      if (isCpuTurnToKick) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          lockKeeperDive(-1, true);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          lockKeeperDive(1, true);
        } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          lockKeeperDive(0, true);
        }
        return;
      }

      // 2P Secret Keeper keys (J = left, K = center, L = right)
      if (matchModeRef.current === '2p') {
        if (e.code === 'KeyJ') {
          e.preventDefault();
          lockKeeperDive(-1, false);
          return;
        }
        if (e.code === 'KeyK') {
          e.preventDefault();
          lockKeeperDive(0, false);
          return;
        }
        if (e.code === 'KeyL') {
          e.preventDefault();
          lockKeeperDive(1, false);
          return;
        }
      }

      // Striker Aiming + Curve (Q / E) + Kick (Enter / Space)
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        st.aimX = Math.max(-0.96, st.aimX - 0.14);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        st.aimX = Math.min(0.96, st.aimX + 0.14);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        st.aimY = Math.min(0.96, st.aimY + 0.12);
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        st.aimY = Math.max(0.1, st.aimY - 0.12);
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        adjustCurve(-0.35);
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        adjustCurve(0.35);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        executeKickWithRunup();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjustCurve, executeKickWithRunup, lockKeeperDive, resetMatch]);

  // 60FPS Simulation & Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let prevTs = performance.now();

    const frame = (ts: number) => {
      rafId = window.requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0.004, (ts - prevTs) / 1000));
      prevTs = ts;
      const nowMs = Date.now();
      const st = stateRef.current;

      // Apply Live Mobile Gyro Telemetry for Attacker & Defender!
      const p1Alive = nowMs < gyroP1Ref.current.expiresAt;
      const p2Alive = nowMs < gyroP2Ref.current.expiresAt;
      const g1 = gyroP1Ref.current;
      const g2 = gyroP2Ref.current;

      const strikerGyro = st.attacker === 1 ? (p1Alive ? g1 : null) : p2Alive ? g2 : null;
      const keeperGyro =
        matchModeRef.current === '2p'
          ? st.attacker === 1
            ? p2Alive
              ? g2
              : null
            : p1Alive
            ? g1
            : null
          : st.attacker === 2 && p1Alive
          ? g1
          : null;

      if (!st.winner && !st.ball.active && !st.waitingNext && !st.strikerKicking) {
        // Countdown timer ("tiempo atrás")
        st.turnTimeLeft = Math.max(0, st.turnTimeLeft - dt);
        const ceilSec = Math.ceil(st.turnTimeLeft);
        setTimeLeftUi(Number(st.turnTimeLeft.toFixed(1)));
        if (st.turnTimeLeft <= 3.0 && ceilSec > 0 && ceilSec !== lastTimerBeepSecRef.current) {
          lastTimerBeepSecRef.current = ceilSec;
          playPenaltySound('tick', mutedRef.current);
        }

        // Striker Mobile Aim + Rosca + Flick Kick
        if (strikerGyro && (matchModeRef.current === '2p' || st.attacker === 1)) {
          if (Math.abs(strikerGyro.steer) > 0.06) {
            st.aimX = Math.max(-0.96, Math.min(0.96, strikerGyro.steer * 0.96));
          }
          if (Math.abs(strikerGyro.pitch) > 0.06) {
            st.aimY = Math.max(0.12, Math.min(0.95, 0.5 + strikerGyro.pitch * 0.45));
          }
          if (strikerGyro.roll !== 0 || strikerGyro.handbrake || strikerGyro.brake > 0.5) {
            const targetCurve = strikerGyro.handbrake ? -0.9 : strikerGyro.brake > 0.5 ? 0.9 : strikerGyro.roll;
            st.curve = targetCurve;
            setCurveUi(Number(targetCurve.toFixed(2)));
          }
          const wantsKick =
            strikerGyro.nitro || strikerGyro.throttle > 0.5 || strikerGyro.swing > 0.95;
          const prevRef = st.attacker === 1 ? prevP1ActionRef : prevP2ActionRef;
          if (wantsKick && !prevRef.current) {
            prevRef.current = true;
            executeKickWithRunup();
          } else if (!wantsKick) {
            prevRef.current = false;
          }
        }

        // Defender Mobile Dive Selection (secret!)
        if (keeperGyro) {
          const wantsDive =
            keeperGyro.nitro || keeperGyro.throttle > 0.5 || keeperGyro.swing > 0.95;
          const diveSide: -1 | 0 | 1 =
            keeperGyro.steer < -0.25 ? -1 : keeperGyro.steer > 0.25 ? 1 : 0;
          if (Math.abs(keeperGyro.steer) > 0.22) {
            st.keeperSecretDive = keeperGyro.steer * 0.85;
            setKeeperLockedUi(true);
          }
          if (wantsDive) {
            lockKeeperDive(diveSide, matchModeRef.current === 'cpu' && st.attacker === 2);
          }
        }

        // Auto-kick or auto-dive when countdown hits 0
        if (st.turnTimeLeft <= 0) {
          if (matchModeRef.current === 'cpu' && st.attacker === 2) {
            lockKeeperDive(0, true);
          } else {
            executeKickWithRunup();
          }
        }

        // Oscillate power meter
        st.powerPct += st.powerDir * 66 * dt;
        if (st.powerPct >= 99) {
          st.powerPct = 99;
          st.powerDir = -1;
        } else if (st.powerPct <= 46) {
          st.powerPct = 46;
          st.powerDir = 1;
        }
      }

      if (st.strikerKicking) {
        st.strikerRunT = Math.min(1, st.strikerRunT + dt * 4.1);
      }

      st.keeperX += (st.keeperTargetX - st.keeperX) * Math.min(1, dt * 11);
      st.netRipple = Math.max(0, st.netRipple - dt * 2.1);
      st.cameraShake = Math.max(0, st.cameraShake - dt * 3.5);

      for (let i = st.particles.length - 1; i >= 0; i -= 1) {
        const pt = st.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 420 * dt;
        pt.life -= dt;
        if (pt.life <= 0) st.particles.splice(i, 1);
      }

      // Ball Flight Step
      if (st.ball.active) {
        st.ball.t += dt / st.ball.duration;
        st.ball.spinAngle += (st.ball.curve * 16 + 7) * dt;
        if (st.ball.t >= 1 && !st.ball.resolved) {
          st.ball.t = 1;
          st.ball.resolved = true;
          st.waitingNext = true;

          const defenderSlot: 1 | 2 = st.attacker === 1 ? 2 : 1;

          if (st.ball.outcome === 'goal') {
            st.netRipple = 1;
            st.netImpactX = st.ball.endX;
            spawnTurfDust(480 + st.ball.endX * 260, 290 - st.ball.endY * 185, '#facc15', 24);
            playPenaltySound('goal', mutedRef.current);
            sendControllerHaptic(st.attacker, 140, 'goal');
            sendControllerHaptic(defenderSlot, 70, 'penalty_save');
          } else if (st.ball.outcome === 'post') {
            st.cameraShake = 1;
            spawnTurfDust(480 + st.ball.endX * 260, 290 - st.ball.endY * 185, '#38bdf8', 18);
            playPenaltySound('post', mutedRef.current);
            sendControllerHaptic(st.attacker, 110, 'penalty_post');
          } else {
            spawnTurfDust(480 + st.ball.endX * 260, 290 - st.ball.endY * 185, '#22d3ee', 14);
            playPenaltySound('save', mutedRef.current);
            sendControllerHaptic(defenderSlot, 130, 'penalty_save');
          }

          const scored = st.ball.outcome === 'goal';
          if (st.attacker === 1) {
            if (scored) st.p1Score += 1;
            st.p1Hist.push(scored ? 'goal' : 'miss');
            setP1Score(st.p1Score);
            setP1History([...st.p1Hist]);
          } else {
            if (scored) st.p2Score += 1;
            st.p2Hist.push(scored ? 'goal' : 'miss');
            setP2Score(st.p2Score);
            setP2History([...st.p2Hist]);
          }

          setBanner(
            scored
              ? `⚽ ¡GOOOL DE ${st.attacker === 1 ? p1CountryRef.current.name.toUpperCase() : p2CountryRef.current.name.toUpperCase()}!`
              : st.ball.outcome === 'post'
              ? '💥 ¡AL PALO / LARGUERO!'
              : st.ball.outcome === 'saved'
              ? '🧤 ¡PARADÓN ESPECTACULAR!'
              : '❌ ¡FUERA DE PORTERÍA!'
          );

          window.setTimeout(() => {
            const cur = stateRef.current;
            cur.ball.active = false;
            cur.keeperTargetX = 0;
            cur.keeperDiveY = 0;
            cur.keeperSecretDive = null;
            cur.waitingNext = false;
            cur.trail = [];
            cur.turnTimeLeft = TURN_SECONDS;
            lastTimerBeepSecRef.current = 99;
            setKeeperLockedUi(false);
            setTimeLeftUi(TURN_SECONDS);
            setBanner(null);

            const k1 = cur.p1Hist.length;
            const k2 = cur.p2Hist.length;
            const bothKicked = k1 === k2;

            if (k1 <= 5 && k2 <= 5) {
              const rem1 = 5 - k1;
              const rem2 = 5 - k2;
              if (cur.p1Score > cur.p2Score + rem2) cur.winner = 1;
              else if (cur.p2Score > cur.p1Score + rem1) cur.winner = 2;
              else if (bothKicked && k1 === 5 && cur.p1Score !== cur.p2Score) {
                cur.winner = cur.p1Score > cur.p2Score ? 1 : 2;
              }
            } else if (bothKicked && cur.p1Score !== cur.p2Score) {
              cur.winner = cur.p1Score > cur.p2Score ? 1 : 2;
            }

            if (cur.winner) {
              setWinner(cur.winner);
              if (cur.winner === 1) {
                setBestStreak((prev) => {
                  const next = Math.max(prev, cur.p1Score);
                  try {
                    localStorage.setItem(BEST_SCORE_KEY, String(next));
                  } catch {
                    // ignore
                  }
                  return next;
                });
              }
              return;
            }

            if (cur.attacker === 1) {
              cur.attacker = 2;
              setAttacker(2);
            } else {
              cur.attacker = 1;
              cur.round += 1;
              setAttacker(1);
              setRound(cur.round);
            }
          }, 1350);
        }
      }

      // ================= RENDER REALISTIC STADIUM SCENE =================
      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      if (st.cameraShake > 0) {
        const mag = st.cameraShake * 7;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }
      ctx.clearRect(0, 0, w, h);

      const turfY = h * 0.55;
      if (stadiumImgRef.current) {
        ctx.drawImage(stadiumImgRef.current, 0, 0, w, turfY + 60);
        // Subtle vignette to frame goal
        const fog = ctx.createLinearGradient(0, 0, 0, turfY + 30);
        fog.addColorStop(0, 'rgba(5,9,20,0.42)');
        fog.addColorStop(0.7, 'rgba(9,16,32,0.18)');
        fog.addColorStop(1, 'rgba(10,48,24,0.45)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, w, turfY + 30);
      } else {
        const sky = ctx.createLinearGradient(0, 0, 0, turfY);
        sky.addColorStop(0, '#050814');
        sky.addColorStop(1, '#122142');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, turfY);
      }

      // Perimeter World Cup LED Ad Board
      const kKit = st.attacker === 1 ? p1CountryRef.current : p2CountryRef.current;
      const dKit = st.attacker === 1 ? p2CountryRef.current : p1CountryRef.current;

      ctx.fillStyle = 'rgba(7, 11, 24, 0.92)';
      ctx.fillRect(0, turfY - 26, w, 26);
      ctx.strokeStyle = kKit.jersey;
      ctx.lineWidth = 2;
      ctx.strokeRect(0, turfY - 26, w, 26);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(
        `${p1CountryRef.current.flag} ${p1CountryRef.current.code}  vs  ${p2CountryRef.current.code} ${p2CountryRef.current.flag}   ·   MUNDIAL PENALTY ARENA HD`,
        w * 0.5,
        turfY - 9
      );

      // Mowed Perspective Pitch Turf
      const turfGrad = ctx.createLinearGradient(0, turfY, 0, h);
      turfGrad.addColorStop(0, '#146b33');
      turfGrad.addColorStop(0.5, '#15803d');
      turfGrad.addColorStop(1, '#0c4a22');
      ctx.fillStyle = turfGrad;
      ctx.fillRect(0, turfY, w, h - turfY);

      // Alternating mowed bands
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let s = 0; s < 5; s += 1) {
        const yTop = turfY + s * 48;
        ctx.fillRect(0, yTop, w, 22);
      }

      // Chalk Penalty Box + 6-yard Box + Penalty Arc
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.74);
      ctx.lineTo(w * 0.92, h * 0.74);
      ctx.lineTo(w * 0.99, h);
      ctx.moveTo(w * 0.08, h * 0.74);
      ctx.lineTo(w * 0.01, h);
      ctx.stroke();

      // 6-yard goal box
      ctx.beginPath();
      ctx.moveTo(w * 0.21, turfY + 12);
      ctx.lineTo(w * 0.79, turfY + 12);
      ctx.lineTo(w * 0.84, turfY + 52);
      ctx.lineTo(w * 0.16, turfY + 52);
      ctx.closePath();
      ctx.stroke();

      const spotX = w * 0.5;
      const spotY = h * 0.86;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(spotX, spotY + 14, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3D Goal Geometry
      const gLeft = w * 0.22;
      const gRight = w * 0.78;
      const gTop = h * 0.19;
      const gBottom = turfY + 10;
      const gW = gRight - gLeft;
      const gH = gBottom - gTop;

      // Back depth posts (stanchions)
      const backLeft = gLeft + 26;
      const backRight = gRight - 26;
      const backTop = gTop + 20;
      const backBottom = gBottom - 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.fillRect(backLeft, backTop, backRight - backLeft, backBottom - backTop);

      // Side depth net triangles
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i <= 18; i += 1) {
        const u = i / 18;
        const fx = gLeft + gW * u;
        const bx = backLeft + (backRight - backLeft) * u;
        const localImpact = Math.max(0, 1 - Math.abs(u * 2 - 1 - st.netImpactX) * 2.2);
        const ripple = Math.sin(ts * 0.032 + u * 8) * 14 * st.netRipple * (0.4 + localImpact);
        ctx.beginPath();
        ctx.moveTo(fx, gTop);
        ctx.quadraticCurveTo(bx + ripple, (backTop + backBottom) * 0.5, bx, backBottom);
        ctx.stroke();
      }
      for (let j = 0; j <= 8; j += 1) {
        const v = j / 8;
        const yFront = gTop + gH * v;
        const yBack = backTop + (backBottom - backTop) * v;
        const rippleH = Math.sin(ts * 0.034 + v * 6) * 9 * st.netRipple;
        ctx.beginPath();
        ctx.moveTo(gLeft, yFront);
        ctx.lineTo(backLeft, yBack);
        ctx.quadraticCurveTo(w * 0.5, yBack + rippleH, backRight, yBack);
        ctx.lineTo(gRight, yFront);
        ctx.stroke();
      }

      // Metallic shaded Goalposts + Crossbar
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(gLeft + 3, gBottom + 2);
      ctx.lineTo(gLeft + 3, gTop + 3);
      ctx.lineTo(gRight + 3, gTop + 3);
      ctx.lineTo(gRight + 3, gBottom + 2);
      ctx.stroke();

      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 9.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(gLeft, gBottom);
      ctx.lineTo(gLeft, gTop);
      ctx.lineTo(gRight, gTop);
      ctx.lineTo(gRight, gBottom);
      ctx.stroke();

      // Articulated Diving Goalkeeper in Defending Nation Kit
      const gkCenterX = gLeft + gW * 0.5 + st.keeperX * (gW * 0.42);
      const gkTilt = st.keeperX * 0.72;
      const gkY = gBottom - 54 + Math.abs(st.keeperX) * 20 + st.keeperDiveY * 26;

      ctx.save();
      ctx.translate(gkCenterX, gkY);
      // Ground shadow under keeper
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      ctx.beginPath();
      ctx.ellipse(0, 52 - Math.abs(st.keeperX) * 14, 28, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(gkTilt);
      // Legs + socks + boots
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-13, 18, 10, 22);
      ctx.fillRect(3, 18, 10, 22);
      ctx.fillStyle = dKit.gkTrim;
      ctx.fillRect(-14, 34, 11, 7);
      ctx.fillRect(3, 34, 11, 7);

      // Goalkeeper Jersey Torso
      ctx.fillStyle = dKit.gkJersey;
      ctx.beginPath();
      ctx.roundRect(-18, -22, 36, 44, 6);
      ctx.fill();
      ctx.fillStyle = dKit.gkTrim;
      ctx.fillRect(-18, -8, 36, 6);

      // Outstretched Arms
      ctx.strokeStyle = dKit.gkJersey;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, -12);
      ctx.lineTo(-39, -22);
      ctx.moveTo(16, -12);
      ctx.lineTo(39, -22);
      ctx.stroke();

      // Padded Goalkeeper Gloves
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = dKit.gkTrim;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-41, -24, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(41, -24, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Head + Hair
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(0, -34, 12.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(0, -39, 12, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Aim Reticle & Curve Arc Preview (hidden if CPU shoots at P1!)
      const showAim = !(matchModeRef.current === 'cpu' && st.attacker === 2);
      if (showAim && !st.ball.active && !st.winner) {
        const rx = gLeft + gW * 0.5 + (st.aimX + st.curve * 0.22) * (gW * 0.48);
        const ry = gBottom - st.aimY * gH;
        const ctrlX = (spotX + rx) * 0.5 - st.curve * 110;
        const ctrlY = Math.min(spotY, ry) - 42;

        ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(spotX, spotY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, rx, ry);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = st.attacker === 1 ? '#22d3ee' : '#fb7185';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(rx, ry, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - 26, ry);
        ctx.lineTo(rx + 26, ry);
        ctx.moveTo(rx, ry - 26);
        ctx.lineTo(rx, ry + 26);
        ctx.stroke();
      }

      // Compute & Draw Geodesic Realistic Match Ball + Trail
      let bx = spotX;
      let by = spotY;
      let bRadius = 21;
      if (st.ball.active) {
        const t = Math.min(1, st.ball.t);
        const inv = 1 - t;
        const endPx = gLeft + gW * 0.5 + st.ball.endX * (gW * 0.48);
        const endPy = gBottom - st.ball.endY * gH;
        const ctrlPx = (spotX + endPx) * 0.5 - st.ball.curve * 135;
        const ctrlPy = Math.min(spotY, endPy) - 52;
        bx = inv * inv * spotX + 2 * inv * t * ctrlPx + t * t * endPx;
        by = inv * inv * spotY + 2 * inv * t * ctrlPy + t * t * endPy;
        bRadius = 21 - t * 10;
        st.trail.push({ x: bx, y: by });
        if (st.trail.length > 10) st.trail.shift();
      }

      if (st.trail.length > 1) {
        for (let tr = 0; tr < st.trail.length - 1; tr += 1) {
          ctx.strokeStyle = `rgba(250, 204, 21, ${(tr / st.trail.length) * 0.45})`;
          ctx.lineWidth = 3 + (tr / st.trail.length) * 6;
          ctx.beginPath();
          ctx.moveTo(st.trail[tr].x, st.trail[tr].y);
          ctx.lineTo(st.trail[tr + 1].x, st.trail[tr + 1].y);
          ctx.stroke();
        }
      }

      // Ball turf shadow
      ctx.fillStyle = 'rgba(0,0,0,0.44)';
      ctx.beginPath();
      ctx.ellipse(bx, by + bRadius + 5, bRadius * 1.15, bRadius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3D Shaded Football (Kenney Sports Pack sprite with procedural fallback)
      if (!drawArcadeSprite(ctx, 'assets/games/sports/ball_soccer1.png', bx, by, bRadius * 2.15, bRadius * 2.15, st.ball.spinAngle)) {
        ctx.save();
        ctx.translate(bx, by);
        const ballGrad = ctx.createRadialGradient(-bRadius * 0.35, -bRadius * 0.35, bRadius * 0.15, 0, 0, bRadius);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.7, '#e2e8f0');
        ballGrad.addColorStop(1, '#64748b');
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(0, 0, bRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Running Striker Figure (Kenney Toon animated run/kick pose + nation badge)
      if (!st.ball.active || st.ball.t < 0.35) {
        const runP = st.strikerKicking ? st.strikerRunT : 0;
        const sx = w * 0.39 + runP * (spotX - 36 - w * 0.39);
        const sy = h * 0.95 - runP * 36;
        const strikerPose = !st.strikerKicking
          ? 'assets/games/toon/male_idle.png'
          : runP > 0.72
          ? 'assets/games/toon/male_kick.png'
          : `assets/games/toon/male_run${Math.floor(runP * 9) % 3}.png`;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(0, 26, 20, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!drawArcadeSprite(ctx, strikerPose, 0, -14, 72, 86, 0)) {
          ctx.fillStyle = kKit.jersey;
          ctx.fillRect(-15, -30, 30, 34);
        }
        ctx.fillStyle = kKit.jersey;
        ctx.fillRect(-11, 14, 22, 6);
        ctx.restore();
      }

      // Turf dust & goal sparks (Kenney Particle Pack)
      for (let pi = 0; pi < st.particles.length; pi += 1) {
        const pt = st.particles[pi];
        const alpha = Math.max(0, Math.min(1, pt.life * 1.4));
        const pSprite = pi % 2 === 0 ? 'assets/games/particles/star_07.png' : 'assets/games/particles/spark_01.png';
        if (!drawArcadeSprite(ctx, pSprite, pt.x, pt.y, pt.size * 3.4, pt.size * 3.4, pt.life * 6, alpha)) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = pt.color;
          ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
        }
      }
      ctx.globalAlpha = 1;

      // On-canvas Countdown Timer Bar + Power Bar
      if (!st.ball.active && !st.winner && !st.waitingNext) {
        const pct = Math.max(0, Math.min(1, st.turnTimeLeft / TURN_SECONDS));
        ctx.fillStyle = 'rgba(8, 12, 24, 0.85)';
        ctx.fillRect(w * 0.5 - 120, 16, 240, 24);
        ctx.fillStyle = pct < 0.35 ? '#ef4444' : pct < 0.6 ? '#f59e0b' : '#10b981';
        ctx.fillRect(w * 0.5 - 118, 18, 236 * pct, 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w * 0.5 - 120, 16, 240, 24);
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`⏱ ${st.turnTimeLeft.toFixed(1)}s`, w * 0.5, 32);
      }

      ctx.restore();
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [executeKickWithRunup, lockKeeperDive, sendControllerHaptic]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const st = stateRef.current;
    if (!canvas || st.ball.active || st.winner || st.waitingNext || st.strikerKicking) return;
    if (matchModeRef.current === 'cpu' && st.attacker === 2) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const aimX = Math.max(-0.96, Math.min(0.96, (nx - 0.5) / 0.28));
    const aimY = Math.max(0.1, Math.min(0.96, (0.56 - ny) / 0.36));
    st.aimX = aimX;
    st.aimY = aimY;
    executeKickWithRunup(aimX, aimY, st.curve);
  };

  const attackerCountry = attacker === 1 ? p1Country : p2Country;
  const defenderCountry = attacker === 1 ? p2Country : p1Country;
  const p1PhoneOnline = controllers.some((c) => (c.slot ?? 1) === 1);
  const p2PhoneOnline = controllers.some((c) => c.slot === 2);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3 select-none">
      {/* World Cup Scoreboard & Mode Bar */}
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPickingSlot(pickingSlot === 1 ? null : 1)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            title="Elegir selección J1"
          >
            <span>{p1Country.flag}</span>
            <span>{p1Country.code}</span>
          </button>

          <div className="px-3 py-1.5 rounded-xl bg-[#7C3AED]/25 border border-[#7C3AED]/50 text-sm font-black text-white tabular-nums">
            {p1Score} — {p2Score}
          </div>

          <button
            type="button"
            onClick={() => setPickingSlot(pickingSlot === 2 ? null : 2)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            title="Elegir selección J2"
          >
            <span>{p2Country.code}</span>
            <span>{p2Country.flag}</span>
          </button>

          <span className="text-xs font-bold text-zinc-300 hidden sm:inline">
            {round > 5 ? 'MUERTE SÚBITA' : `Ronda ${round}/5`} ·{' '}
            <span className="text-cyan-300">
              {matchMode === 'cpu' && attacker === 2
                ? pickLang(lang, { es: 'Para el penalti', ca: 'Atura el penal', en: 'Save Kick' })
                : `Chuta ${attackerCountry.flag} J${attacker} · Para ${defenderCountry.flag}`}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* 1vIA / 2P Toggle */}
          <div className="flex rounded-xl bg-white/[0.05] border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => {
                setMatchMode('cpu');
                resetMatch();
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                matchMode === 'cpu' ? 'bg-[#7C3AED] text-white' : 'text-zinc-400'
              }`}
            >
              1 vs IA
            </button>
            <button
              type="button"
              onClick={() => {
                setMatchMode('2p');
                resetMatch();
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer ${
                matchMode === '2p' ? 'bg-emerald-600 text-white' : 'text-zinc-400'
              }`}
            >
              <Users className="w-3 h-3" /> 2 Jugadores
            </button>
          </div>

          {/* Mobile Gyro QR Button */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="h-9 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-[11px] font-black text-cyan-200 flex items-center gap-1.5 cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Móvil QR</span>
            {p1PhoneOnline && <span className="w-2 h-2 rounded-full bg-cyan-400" title="J1 Móvil" />}
            {p2PhoneOnline && <span className="w-2 h-2 rounded-full bg-rose-400" title="J2 Móvil" />}
          </button>

          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1 px-1.5">
            <Trophy className="w-3.5 h-3.5" /> {bestStreak}
          </span>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={resetMatch}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 10 World Cup Countries Picker Drawer (when clicking P1 or P2 flag) */}
      {pickingSlot !== null && (
        <div className="rounded-2xl bg-[#101628] border border-cyan-400/35 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-black text-cyan-200">
            <span>
              Elige selección Top Mundial para Jugador {pickingSlot}
            </span>
            <button
              type="button"
              onClick={() => setPickingSlot(null)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {PENALTY_COUNTRIES.map((c) => {
              const active = (pickingSlot === 1 ? p1Country.id : p2Country.id) === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (pickingSlot === 1) setP1Country(c);
                    else setP2Country(c);
                    setPickingSlot(null);
                  }}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#7C3AED]/35 border-[#7C3AED] text-white'
                      : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-zinc-200'
                  }`}
                >
                  <span className="text-base">{c.flag}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Kick Markers + Countdown Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs font-bold">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-300">
            {p1Country.flag} {p1Country.code}:
          </span>
          {Array.from({ length: Math.max(5, p1History.length) }, (_, idx) => {
            const res = p1History[idx];
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border ${
                  res === 'goal'
                    ? 'bg-emerald-400 border-emerald-200'
                    : res === 'miss'
                    ? 'bg-rose-500 border-rose-300'
                    : 'bg-white/10 border-white/20'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300">
          <Clock className="w-3.5 h-3.5" />
          <span>{timeLeftUi.toFixed(1)}s</span>
          {matchMode === '2p' && keeperLockedUi && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-sans">
              🧤 Portero listo
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-zinc-300">
            {p2Country.flag} {p2Country.code}:
          </span>
          {Array.from({ length: Math.max(5, p2History.length) }, (_, idx) => {
            const res = p2History[idx];
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border ${
                  res === 'goal'
                    ? 'bg-emerald-400 border-emerald-200'
                    : res === 'miss'
                    ? 'bg-rose-500 border-rose-300'
                    : 'bg-white/10 border-white/20'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Realistic Stadium Canvas */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#070b16] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onClick={handleCanvasClick}
          className="w-full h-auto block cursor-crosshair"
        />

        {banner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="px-7 py-3 rounded-2xl bg-[#090d1a]/92 border-2 border-cyan-400/70 text-xl sm:text-3xl font-black text-white shadow-2xl text-center">
              {banner}
            </div>
          </div>
        )}

        {winner && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={`🏆 ${winner === 1 ? `${p1Country.flag} ${p1Country.name}` : `${p2Country.flag} ${p2Country.name}`} Campeón`}
            subtitle={`Marcador final: ${p1Country.code} ${p1Score} — ${p2Score} ${p2Country.code}`}
            outcome={matchMode === 'cpu' && winner === 2 ? 'defeat' : 'win'}
            scoreBadge={`${p1Score} - ${p2Score}`}
            primaryLabel="Jugar otra tanda"
            onPrimaryAction={resetMatch}
          />
        )}
      </div>

      {/* Curve (Rosca) + Kick / Keeper Controls */}
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 p-2.5 flex flex-wrap items-center justify-between gap-2">
        {matchMode === 'cpu' && attacker === 2 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            <button
              type="button"
              onClick={() => lockKeeperDive(-1, true)}
              className="min-h-11 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-4 h-4" /> Izquierda (◀)
            </button>
            <button
              type="button"
              onClick={() => lockKeeperDive(0, true)}
              className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
            >
              Centro (▲)
            </button>
            <button
              type="button"
              onClick={() => lockKeeperDive(1, true)}
              className="min-h-11 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              Derecha (▶) <Shield className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-zinc-400">Rosca / Efecto:</span>
              <button
                type="button"
                onClick={() => adjustCurve(-0.35)}
                className={`h-9 px-3 rounded-lg border text-xs font-black cursor-pointer ${
                  curveUi < -0.15
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                    : 'bg-white/[0.06] border-white/10 text-zinc-200'
                }`}
              >
                ↶ Izq (Q)
              </button>
              <button
                type="button"
                onClick={() => {
                  stateRef.current.curve = 0;
                  setCurveUi(0);
                }}
                className="h-9 px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-bold text-zinc-300 cursor-pointer"
              >
                {curveUi === 0 ? 'Recto' : `${curveUi > 0 ? '+' : ''}${Math.round(curveUi * 100)}%`}
              </button>
              <button
                type="button"
                onClick={() => adjustCurve(0.35)}
                className={`h-9 px-3 rounded-lg border text-xs font-black cursor-pointer ${
                  curveUi > 0.15
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                    : 'bg-white/[0.06] border-white/10 text-zinc-200'
                }`}
              >
                Der ↷ (E)
              </button>
            </div>

            <div className="flex items-center gap-2">
              {matchMode === '2p' && (
                <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <span>Portero (J/K/L):</span>
                  <button
                    type="button"
                    onClick={() => lockKeeperDive(-1, false)}
                    className="h-9 px-2.5 rounded-lg bg-white/[0.06] hover:bg-cyan-500/20 border border-white/10 font-bold text-white cursor-pointer"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => lockKeeperDive(0, false)}
                    className="h-9 px-2.5 rounded-lg bg-white/[0.06] hover:bg-cyan-500/20 border border-white/10 font-bold text-white cursor-pointer"
                  >
                    ●
                  </button>
                  <button
                    type="button"
                    onClick={() => lockKeeperDive(1, false)}
                    className="h-9 px-2.5 rounded-lg bg-white/[0.06] hover:bg-cyan-500/20 border border-white/10 font-bold text-white cursor-pointer"
                  >
                    ▶
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => executeKickWithRunup()}
                className="min-h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white cursor-pointer"
              >
                ⚽ CHUTAR (Enter)
              </button>
            </div>
          </>
        )}
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId="penalty"
          title="Penaltis Mundial Pro · J1 y J2"
          subtitle="Escanea en vertical con 1 o 2 móviles · Inclina para apuntar, rosca y chuta o para"
          controllers={controllers}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
};
