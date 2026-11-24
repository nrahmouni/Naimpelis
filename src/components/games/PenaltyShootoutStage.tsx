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
import { fireVictoryConfetti } from './arcade/arcadeAnimations';
import { Penalty3DViewport } from './three/Penalty3DViewport';
import { getCircleFlagCdnUrl } from '../../shared/gameAssetsCdn';

const FlagBadge: React.FC<{ code: string; fallback: string; size?: number }> = ({
  code,
  fallback,
  size = 18,
}) => (
  <img
    src={getCircleFlagCdnUrl(code)}
    alt={code}
    width={size}
    height={size}
    loading="lazy"
    onError={(e) => {
      const el = e.currentTarget;
      el.style.display = 'none';
      const next = el.nextElementSibling as HTMLElement | null;
      if (next) next.style.display = 'inline';
    }}
    className="rounded-full object-cover shrink-0 ring-1 ring-white/25 bg-slate-900"
    style={{ width: size, height: size }}
  />
);

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
  const [shotStyleUi, setShotStyleUi] = useState<'placed' | 'power' | 'panenka'>('placed');
  const [timeLeftUi, setTimeLeftUi] = useState(TURN_SECONDS);
  const [keeperLockedUi, setKeeperLockedUi] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [winner, setWinner] = useState<TurnAttacker | null>(null);
  const [hasKickedOnce, setHasKickedOnce] = useState(false);
  const powerFillRef = useRef<HTMLDivElement | null>(null);
  const powerLabelRef = useRef<HTMLSpanElement | null>(null);
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
    shotStyle: 'placed' as 'placed' | 'power' | 'panenka',
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

      setHasKickedOnce(true);
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
          // CPU shoots at P1 keeper with varied styles & 2D reach check
          const styles: Array<'placed' | 'power' | 'panenka'> = ['placed', 'placed', 'power', 'panenka'];
          const cpuStyle = styles[Math.floor(Math.random() * styles.length)];
          cur.shotStyle = cpuStyle;
          const cpuEndX =
            cpuStyle === 'panenka'
              ? (Math.random() - 0.5) * 0.28
              : [-0.86, -0.5, 0.04, 0.5, 0.86][Math.floor(Math.random() * 5)];
          const cpuEndY = cpuStyle === 'panenka' ? 0.62 + Math.random() * 0.16 : 0.18 + Math.random() * 0.72;
          const cpuCurve = cpuStyle === 'panenka' ? 0 : (Math.random() - 0.5) * 1.1;
          const p1Dive = cur.keeperSecretDive !== null ? cur.keeperSecretDive : 0;
          cur.keeperTargetX = p1Dive;
          cur.keeperDiveY = Math.abs(p1Dive) > 0.2 ? 0.28 : 0.12;

          const keeperReachX = p1Dive * 0.96;
          const keeperReachY = Math.abs(p1Dive) > 0.2 ? 0.54 : 0.44;
          const diveDist = Math.hypot((cpuEndX - keeperReachX) * 1.08, (cpuEndY - keeperReachY) * 1.32);
          const panenkaFakesKeeper = cpuStyle === 'panenka' && Math.abs(p1Dive) > 0.45;
          const saved = !panenkaFakesKeeper && diveDist < (cpuStyle === 'power' ? 0.36 : 0.44);
          const outcome: KickOutcome = saved ? 'saved' : 'goal';

          cur.ball = {
            active: true,
            t: 0,
            duration: cpuStyle === 'power' ? 0.39 : cpuStyle === 'panenka' ? 0.76 : 0.54,
            endX: cpuEndX,
            endY: cpuEndY,
            curve: cpuCurve,
            outcome,
            resolved: false,
            spinAngle: 0,
          };
        } else {
          // Human kick (P1 always, or P2 in 2P mode)
          const style = cur.shotStyle;
          const keeperPick =
            matchModeRef.current === '2p'
              ? cur.keeperSecretDive !== null
                ? cur.keeperSecretDive
                : 0
              : [-0.84, 0, 0.84][Math.floor(Math.random() * 3)];

          cur.keeperTargetX = keeperPick;
          cur.keeperDiveY = Math.abs(keeperPick) > 0.2 ? 0.28 : 0.12;

          const curveScale = style === 'power' ? 0.12 : style === 'panenka' ? 0.08 : 0.22;
          const baseEndX = style === 'panenka' ? shotAimX * 0.45 : shotAimX;
          const effectiveEndX = Math.max(-1.14, Math.min(1.14, baseEndX + shotCurve * curveScale));

          const sweetSpot = cur.powerPct >= 75 && cur.powerPct <= 92;
          const overPowerLimit = style === 'power' ? 96.5 : 98.5;
          const overPower = cur.powerPct > overPowerLimit || shotAimY > 1.02;
          const hitPost = !overPower && Math.abs(effectiveEndX) > 0.91 && Math.abs(effectiveEndX) < 1.04;
          const wideMiss = !overPower && Math.abs(effectiveEndX) >= 1.04;

          const keeperReachX = keeperPick * 0.96;
          const keeperReachY = Math.abs(keeperPick) > 0.2 ? 0.54 : 0.44;
          const diveDist = Math.hypot((effectiveEndX - keeperReachX) * 1.08, (shotAimY - keeperReachY) * 1.32);
          const panenkaBeatsDive = style === 'panenka' && Math.abs(keeperPick) > 0.45;
          const saveRadius = style === 'power' && sweetSpot ? 0.31 : style === 'power' ? 0.37 : sweetSpot ? 0.35 : 0.41;
          const savedByKeeper = !overPower && !hitPost && !wideMiss && !panenkaBeatsDive && diveDist < saveRadius;

          let outcome: KickOutcome = 'goal';
          if (overPower || wideMiss) outcome = 'miss';
          else if (hitPost) outcome = 'post';
          else if (savedByKeeper) outcome = 'saved';

          cur.ball = {
            active: true,
            t: 0,
            duration: style === 'power' ? 0.39 : style === 'panenka' ? 0.76 : 0.54,
            endX: overPower ? effectiveEndX * 1.08 : effectiveEndX,
            endY: overPower ? 1.24 : shotAimY,
            curve: style === 'panenka' ? shotCurve * 0.25 : shotCurve,
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
      if (st.winner && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
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
      } else if (e.code === 'Digit1') {
        st.shotStyle = 'placed';
        setShotStyleUi('placed');
      } else if (e.code === 'Digit2') {
        st.shotStyle = 'power';
        setShotStyleUi('power');
      } else if (e.code === 'Digit3') {
        st.shotStyle = 'panenka';
        setShotStyleUi('panenka');
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        executeKickWithRunup();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjustCurve, executeKickWithRunup, lockKeeperDive, resetMatch]);

  // 60FPS Simulation Loop (3D WebGL viewport renders from stateRef)
  useEffect(() => {
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
        st.powerPct += st.powerDir * 64 * dt;
        if (st.powerPct >= 99) {
          st.powerPct = 99;
          st.powerDir = -1;
        } else if (st.powerPct <= 46) {
          st.powerPct = 46;
          st.powerDir = 1;
        }
        if (powerFillRef.current) {
          powerFillRef.current.style.width = `${Math.round(st.powerPct)}%`;
          powerFillRef.current.style.backgroundColor =
            st.powerPct > 95 ? '#f43f5e' : st.powerPct >= 75 ? '#10b981' : '#38bdf8';
        }
        if (powerLabelRef.current) {
          powerLabelRef.current.textContent = `${Math.round(st.powerPct)}%`;
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
            fireVictoryConfetti('goal');
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
              fireVictoryConfetti('gold');
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
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [executeKickWithRunup, lockKeeperDive, sendControllerHaptic]);

  const handleGoalClick = useCallback(
    (aimX: number, aimY: number) => {
      const st = stateRef.current;
      if (st.ball.active || st.winner || st.waitingNext || st.strikerKicking) return;
      if (matchModeRef.current === 'cpu' && st.attacker === 2) return;
      st.aimX = aimX;
      st.aimY = aimY;
      executeKickWithRunup(aimX, aimY, st.curve);
    },
    [executeKickWithRunup]
  );

  const attackerCountry = attacker === 1 ? p1Country : p2Country;
  const defenderCountry = attacker === 1 ? p2Country : p1Country;
  const p1PhoneOnline = controllers.some((c) => (c.slot ?? 1) === 1);
  const p2PhoneOnline = controllers.some((c) => c.slot === 2);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface w-full max-w-5xl mx-auto space-y-3 select-none"
    >
      {/* World Cup Scoreboard & Mode Bar */}
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPickingSlot(pickingSlot === 1 ? null : 1)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            title="Elegir selección J1"
          >
            <FlagBadge code={p1Country.code} fallback={p1Country.flag} size={18} />
            <span className="hidden">{p1Country.flag}</span>
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
            <FlagBadge code={p2Country.code} fallback={p2Country.flag} size={18} />
            <span className="hidden">{p2Country.flag}</span>
          </button>

          <span className="text-xs font-bold text-zinc-300 hidden sm:inline">
            {round > 5 ? 'MUERTE SÚBITA' : `Ronda ${round}/5`} ·{' '}
            <span className="text-cyan-300">
              {matchMode === 'cpu' && attacker === 2
                ? pickLang(lang, { es: 'Para el penalti', ca: 'Atura el penal', en: 'Save Kick' })
                : `Chuta J${attacker} (${attackerCountry.code}) · Para ${defenderCountry.code}`}
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
                  <FlagBadge code={c.code} fallback={c.flag} size={20} />
                  <span className="hidden text-base">{c.flag}</span>
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

        <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300 tabular-nums">
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

      {/* Three.js 3D WebGL Stadium Arena + Animated GLB Athletes */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#060b16] shadow-2xl">
        <Penalty3DViewport
          stateRef={stateRef}
          p1Country={p1Country}
          p2Country={p2Country}
          matchMode={matchMode}
          onGoalClick={handleGoalClick}
        />

        {!hasKickedOnce && !banner && !winner && !(matchMode === 'cpu' && attacker === 2) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
            <div className="px-3.5 py-1.5 rounded-full bg-[#090d1a]/88 border border-cyan-400/50 text-[11px] font-bold text-cyan-100 shadow-lg">
              {pickLang(lang, {
                es: 'Toca cualquier rincón de la portería para chutar',
                ca: 'Toca qualsevol racó de la porteria per xutar',
                en: 'Tap any corner of the goal to shoot',
              })}
            </div>
          </div>
        )}

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
            title={`🏆 ${winner === 1 ? p1Country.name : p2Country.name} Campeón`}
            subtitle={`Marcador final: ${p1Country.code} ${p1Score} — ${p2Score} ${p2Country.code}`}
            outcome={matchMode === 'cpu' && winner === 2 ? 'defeat' : 'win'}
            scoreBadge={`${p1Score} - ${p2Score}`}
            primaryLabel="Jugar otra tanda"
            onPrimaryAction={resetMatch}
          />
        )}
      </div>

      {/* Shot Style + Curve (Rosca) + Sweet-Spot Power + Kick / Keeper Controls */}
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 p-3 space-y-2.5">
        {matchMode === 'cpu' && attacker === 2 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); lockKeeperDive(-1, true); }}
              className="game-touch-btn min-h-11 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-4 h-4" /> Izquierda (◀)
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); lockKeeperDive(0, true); }}
              className="game-touch-btn min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
            >
              Centro (▲)
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); lockKeeperDive(1, true); }}
              className="game-touch-btn min-h-11 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              Derecha (▶) <Shield className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Shot Style Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-zinc-400 hidden sm:inline">Estilo:</span>
                {(
                  [
                    { id: 'placed', label: '🎯 Colocado' },
                    { id: 'power', label: '🔥 Potente' },
                    { id: 'panenka', label: '✨ Panenka' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      stateRef.current.shotStyle = s.id;
                      setShotStyleUi(s.id);
                      triggerHaptic('light');
                    }}
                    className={`game-touch-btn min-h-10 px-2.5 rounded-xl border text-[11px] font-black cursor-pointer transition-colors ${
                      shotStyleUi === s.id
                        ? 'bg-[#7C3AED] border-purple-400 text-white'
                        : 'bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/[0.1]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Sweet-Spot Power Bar */}
              <div className="flex items-center gap-2 flex-1 min-w-[160px] max-w-xs">
                <span className="text-[11px] font-bold text-zinc-400">Potencia</span>
                <div className="relative flex-1 h-3 rounded-full bg-white/10 overflow-hidden border border-white/10">
                  <div
                    className="absolute inset-y-0 left-[75%] right-[8%] bg-emerald-400/20 pointer-events-none"
                    title="Zona dulce (75-92%)"
                  />
                  <div
                    ref={powerFillRef}
                    className="h-full rounded-full transition-none"
                    style={{ width: '72%', backgroundColor: '#38bdf8' }}
                  />
                </div>
                <span ref={powerLabelRef} className="text-[11px] font-mono font-bold text-zinc-200 w-8 text-right tabular-nums">
                  72%
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-zinc-400">Rosca:</span>
                <button
                  type="button"
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => { e.preventDefault(); adjustCurve(-0.35); }}
                  className={`game-touch-btn min-h-10 px-3 rounded-xl border text-xs font-black cursor-pointer ${
                    curveUi < -0.15
                      ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                      : 'bg-white/[0.06] border-white/10 text-zinc-200'
                  }`}
                >
                  ↶ Izq (Q)
                </button>
                <button
                  type="button"
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    stateRef.current.curve = 0;
                    setCurveUi(0);
                  }}
                  className="game-touch-btn min-h-10 px-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-bold text-zinc-300 cursor-pointer tabular-nums"
                >
                  {curveUi === 0 ? 'Recto' : `${curveUi > 0 ? '+' : ''}${Math.round(curveUi * 100)}%`}
                </button>
                <button
                  type="button"
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => { e.preventDefault(); adjustCurve(0.35); }}
                  className={`game-touch-btn min-h-10 px-3 rounded-xl border text-xs font-black cursor-pointer ${
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
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => { e.preventDefault(); lockKeeperDive(-1, false); }}
                      className="game-touch-btn min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-cyan-500/20 border border-white/10 font-bold text-white cursor-pointer"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => { e.preventDefault(); lockKeeperDive(0, false); }}
                      className="game-touch-btn min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-cyan-500/20 border border-white/10 font-bold text-white cursor-pointer"
                    >
                      ●
                    </button>
                    <button
                      type="button"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => { e.preventDefault(); lockKeeperDive(1, false); }}
                      className="game-touch-btn min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-cyan-500/20 border border-white/10 font-bold text-white cursor-pointer"
                    >
                      ▶
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => { e.preventDefault(); executeKickWithRunup(); }}
                  className="game-touch-btn min-h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white cursor-pointer"
                >
                  ⚽ CHUTAR (Enter)
                </button>
              </div>
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
