import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, QrCode, RotateCcw, Smartphone, Volume2, VolumeX, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { socketService } from '../../services/socket';
import { useDirectDeviceGyro } from '../../hooks/useDirectDeviceGyro';
import { triggerHaptic } from '../../utils/haptics';
import { DualGyroQrPanel, type DualGyroControllerPeer } from './racing/DualGyroQrPanel';
import { playArcadeSfx } from './arcade/arcadeAudio';
import { fireVictoryConfetti, preloadOnlineGameAssets } from './arcade/arcadeAnimations';
import { VictoryCelebrationOverlay } from './GameEffects';
import { Bowling3DViewport, type BowlingSimSnapshot } from './three/Bowling3DViewport';
import { Tennis3DViewport, type TennisSimSnapshot } from './three/Tennis3DViewport';
import { Labyrinth3DViewport, type Labyrinth3DSnapshot } from './three/Labyrinth3DViewport';

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

// USBC Frame Score Calculator (supports 6 frames cleanly)
function computeUsbcFrames(
  frames: Array<{ r1: number | null; r2: number | null }>,
  maxFrames: number
): Array<{ r1: number | null; r2: number | null; cumul: number | null }> {
  const flatRolls: number[] = [];
  const frameRollStart: number[] = [];
  for (let i = 0; i < maxFrames; i += 1) {
    const f = frames[i];
    if (!f || f.r1 === null) {
      frameRollStart.push(-1);
      continue;
    }
    frameRollStart.push(flatRolls.length);
    flatRolls.push(f.r1);
    if (f.r1 < 10 && f.r2 !== null) {
      flatRolls.push(f.r2);
    }
  }

  let running = 0;
  return Array.from({ length: maxFrames }, (_, i) => {
    const f = frames[i] || { r1: null, r2: null };
    const idx = frameRollStart[i];
    if (idx < 0 || f.r1 === null) return { r1: f.r1, r2: f.r2, cumul: null };

    if (f.r1 === 10) {
      // Strike: 10 + next 2 rolls (if available, or use current accumulated rolls)
      const b1 = flatRolls[idx + 1] ?? 0;
      const b2 = flatRolls[idx + 2] ?? 0;
      running += 10 + b1 + b2;
      return { r1: f.r1, r2: f.r2, cumul: running };
    }
    if (f.r2 === null) {
      return { r1: f.r1, r2: null, cumul: null };
    }
    const base = f.r1 + f.r2;
    if (base === 10) {
      const b1 = flatRolls[idx + 2] ?? 0;
      running += 10 + b1;
      return { r1: f.r1, r2: f.r2, cumul: running };
    }
    running += base;
    return { r1: f.r1, r2: f.r2, cumul: running };
  });
}

const LAB_LEVELS: string[][] = [
  [
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
  ],
  [
    '###################',
    '#S..#.*.....O...*.#',
    '#.#.#.#####.###.#.#',
    '#.#...#...#...#.#.#',
    '#.###.#.O.###.#.#.#',
    '#.*.#.....#.*...#.#',
    '#.#######.#####.#.#',
    '#...O...#.....#...#',
    '###.###.#.###.###.#',
    '#*....#...O.....*E#',
    '###################',
  ],
  [
    '###################',
    '#S.O..*...#.*...O*#',
    '#.#.#####.#.###.#.#',
    '#.#.#...#...#...#.#',
    '#...#.O.###.#.###.#',
    '###.#.....#.#...*E#',
    '#.*.#.###.#.#####.#',
    '#.#...#...O.....#.#',
    '#.#####.#######.#.#',
    '#...*.....O...*...#',
    '###################',
  ],
];

export const GyroMotionPackStage: React.FC<GyroMotionPackStageProps> = ({
  gameId,
  lang,
  roomId,
  userName,
  onClose,
}) => {
  const bowlingSimRef = useRef<BowlingSimSnapshot>({
    phase: 'aim',
    turnPlayer: 1,
    aimX: 0,
    spin: 0,
    ball: { x: 0, y: 0.06, rot: 0 },
    pins: [],
    outcomeSeq: 0,
    outcomeKind: 'none',
  });
  const tennisSimRef = useRef<TennisSimSnapshot>({
    p1: { x: 0, y: 0.85, swingT: 0 },
    p2: { x: 0, y: -0.85, swingT: 0 },
    ball: { x: 0, y: 0, z: 0.25, vx: 0.25, vy: 1.05 },
    surface: 'grass',
    shotTag: 'normal',
    over: false,
    hitSeq: 0,
    pointSeq: 0,
    lastScorer: 1,
  });
  const labSimRef = useRef<Labyrinth3DSnapshot>({
    level: 1,
    cols: 19,
    rows: 11,
    grid: LAB_LEVELS[0].map((r) => r.split('')),
    tiltX: 0,
    tiltZ: 0,
    twoHumans: false,
    ball1: { x: 1.5, y: 1.5, vx: 0, vy: 0 },
    ball2: null,
    collectSeq: 0,
    fallSeq: 0,
    winSeq: 0,
  });

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
  const labDragTiltRef = useRef<{ active: boolean; startX: number; startY: number; ax: number; ay: number }>({
    active: false,
    startX: 0,
    startY: 0,
    ax: 0,
    ay: 0,
  });

  // Bowling UI Controls State & Smooth Power Ref
  const [bowlSpinUi, setBowlSpinUi] = useState(0);
  const [bowlFramesUi, setBowlFramesUi] = useState<
    Array<{ r1: number | null; r2: number | null; cumul: number | null }>
  >(() => Array.from({ length: 6 }, () => ({ r1: null, r2: null, cumul: null })));
  const bowlPowerFillRef = useRef<HTMLDivElement | null>(null);
  const bowlPowerTextRef = useRef<HTMLSpanElement | null>(null);
  const bowlManualActionRef = useRef(false);
  const bowlSteerOffsetRef = useRef(0);
  const bowlSpinOverrideRef = useRef(0);

  // Tennis UI State
  const [tennisSurface, setTennisSurface] = useState<'grass' | 'clay' | 'hard'>('grass');
  const [tennisShotMode, setTennisShotMode] = useState<'normal' | 'smash' | 'lob'>('normal');
  const tennisShotModeRef = useRef<'normal' | 'smash' | 'lob'>('normal');
  tennisShotModeRef.current = tennisShotMode;

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
        ? 'FRAME 1/6 · J1 0'
        : gameId === 'gyrotennis'
        ? 'J1 0 - 0 CPU'
        : 'ESTRELLAS 0/6',
    rightText:
      gameId === 'gyrobowling'
        ? 'TIRO 1 · 10 BOLOS'
        : gameId === 'gyrotennis'
        ? 'A 7 PUNTOS · HIERBA'
        : 'NIVEL 1/3 · 65s',
  });
  const [finishSummary, setFinishSummary] = useState<{ title: string; sub: string } | null>(null);
  const [arenaBanner, setArenaBanner] = useState<string>('');
  const [resetNonce, setResetNonce] = useState(0);

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || `${gameId}-local`).trim().toLowerCase(),
    [gameId, roomId]
  );

  const directGyro = useDirectDeviceGyro({ maxDeg: 26, pitchMaxDeg: 22, deadzoneDeg: 2.5 });

  useEffect(() => {
    if (!directGyro.active) return;
    const id = window.setInterval(() => {
      const g = directGyro.gyroRef.current;
      if (!g.active) return;
      gyroP1Ref.current = {
        steer: g.steer,
        pitch: g.pitch,
        roll: g.steer * 0.65,
        swing: g.swing,
        throttle: Math.max(0, g.pitch),
        brake: Math.max(0, -g.pitch),
        nitro: keysRef.current.action || g.swing > 1.15,
        handbrake: false,
        expiresAt: Date.now() + 240,
      };
    }, 40);
    return () => window.clearInterval(id);
  }, [directGyro.active, directGyro.gyroRef]);

  useEffect(() => {
    preloadOnlineGameAssets();
  }, []);

  useEffect(() => {
    if (!finishSummary) return;
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
      else if (k === 'r' || k === 'R') setResetNonce((n) => n + 1);
      else if (gameId === 'gyrobowling' && (k === 'q' || k === 'Q')) {
        bowlSpinOverrideRef.current = Math.max(-1, Number((bowlSpinOverrideRef.current - 0.35).toFixed(2)));
        setBowlSpinUi(bowlSpinOverrideRef.current);
      } else if (gameId === 'gyrobowling' && (k === 'e' || k === 'E')) {
        bowlSpinOverrideRef.current = Math.min(1, Number((bowlSpinOverrideRef.current + 0.35).toFixed(2)));
        setBowlSpinUi(bowlSpinOverrideRef.current);
      } else if (gameId === 'gyrotennis' && k === '1') {
        setTennisShotMode('normal');
      } else if (gameId === 'gyrotennis' && k === '2') {
        setTennisShotMode('smash');
      } else if (gameId === 'gyrotennis' && k === '3') {
        setTennisShotMode('lob');
      }
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
  }, [gameId]);

  useEffect(() => {
    let rafId = 0;
    let alive = true;
    let lastTs = performance.now();
    setFinishSummary(null);
    setArenaBanner('');

    const pushScoreTelemetry = (s1: number, s2: number, tag?: string, pulse?: number) => {
      if (!socketService.isConnected()) return;
      socketService.sendRacingTelemetry(
        {
          roomId: socketService.getActiveRoomId() || effectiveRoomId,
          speedKmh: 0,
          rpmPct: 60,
          gear: 1,
          lap: 1,
          totalLaps: 6,
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
    // 1. GYRO BOWLING 3D PRO (USBC 6-Frame Scoring + Hook & Power Meter)
    // -----------------------------------------------------------------
    if (gameId === 'gyrobowling') {
      const MAX_FRAMES = 6;
      const makePins = () => {
        const out: Array<{ x: number; y: number; vx: number; vy: number; up: boolean; rot: number }> = [];
        for (let r = 0; r < 4; r += 1) {
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

      const blankFrames = () =>
        Array.from({ length: MAX_FRAMES }, () => ({ r1: null as number | null, r2: null as number | null }));

      const st = {
        frame: 1,
        rollNum: 1 as 1 | 2,
        turnPlayer: 1 as 1 | 2,
        p1Frames: blankFrames(),
        p2Frames: blankFrames(),
        standingBeforeRoll: 10,
        aimX: 0,
        spin: 0,
        powerPct: 78,
        powerDir: 1,
        phase: 'aim' as 'aim' | 'roll' | 'settle' | 'over',
        ball: { x: 0, y: 0.06, vx: 0, vy: 0, curve: 0, rot: 0 },
        pins: makePins(),
        settleT: 0,
        banner: '',
        bannerT: 0,
      };

      const prevThrow = { p1: false, p2: false };
      bowlSteerOffsetRef.current = 0;
      bowlSpinOverrideRef.current = 0;
      setBowlSpinUi(0);
      setBowlFramesUi(computeUsbcFrames(st.p1Frames, MAX_FRAMES));
      setHud({ leftText: 'FRAME 1/6 · J1 0', rightText: 'TIRO 1 · 10 BOLOS' });

      const getLatestScore = (frames: Array<{ r1: number | null; r2: number | null }>) => {
        const calc = computeUsbcFrames(frames, MAX_FRAMES);
        let best = 0;
        calc.forEach((c) => {
          if (c.cumul !== null) best = c.cumul;
        });
        return best;
      };

      const frameLoop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
        lastTs = now;

        const twoHumans = controllersRef.current.length >= 2 || controllersRef.current.some((c) => c.slot === 2);
        const pad = st.turnPlayer === 2 && twoHumans ? gyroP2Ref.current : gyroP1Ref.current;
        const padFresh = pad.expiresAt > Date.now();
        const keySteer = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
        if (keySteer !== 0) {
          bowlSteerOffsetRef.current = Math.max(-0.82, Math.min(0.82, bowlSteerOffsetRef.current + keySteer * dt * 1.15));
        }

        const effectiveAimX = padFresh ? Math.max(-0.82, Math.min(0.82, pad.steer * 0.85)) : bowlSteerOffsetRef.current;
        const hookInput = padFresh ? pad.roll : bowlSpinOverrideRef.current;
        const swingNow =
          bowlManualActionRef.current ||
          (padFresh ? pad.swing > 1.05 || pad.nitro || pad.throttle > 0.5 : keysRef.current.action);
        bowlManualActionRef.current = false;

        const pKey = st.turnPlayer === 2 && twoHumans ? 'p2' : 'p1';
        const triggered = swingNow && !prevThrow[pKey];
        prevThrow[pKey] = swingNow;

        if (st.bannerT > 0) st.bannerT = Math.max(0, st.bannerT - dt);

        if (st.phase === 'aim') {
          st.aimX = effectiveAimX;
          st.spin = hookInput;
          st.powerPct += st.powerDir * 68 * dt;
          if (st.powerPct >= 100) {
            st.powerPct = 100;
            st.powerDir = -1;
          } else if (st.powerPct <= 52) {
            st.powerPct = 52;
            st.powerDir = 1;
          }
          if (bowlPowerFillRef.current) {
            bowlPowerFillRef.current.style.width = `${Math.round(st.powerPct)}%`;
            bowlPowerFillRef.current.style.backgroundColor = st.powerPct >= 82 ? '#facc15' : '#38bdf8';
          }
          if (bowlPowerTextRef.current) {
            bowlPowerTextRef.current.textContent = `${Math.round(st.powerPct)}%`;
          }

          if (triggered) {
            st.phase = 'roll';
            st.standingBeforeRoll = st.pins.filter((p) => p.up).length;
            const powerMult = padFresh
              ? Math.min(1.48, Math.max(0.95, 0.95 + pad.swing * 0.25))
              : 0.72 + (st.powerPct / 100) * 0.65;
            st.ball = {
              x: st.aimX,
              y: 0.06,
              vx: effectiveAimX * 0.14,
              vy: 0.85 * powerMult,
              curve: hookInput * 0.55,
              rot: 0,
            };
            playArcadeSfx(240, 0.12, 'triangle', 0.08, mutedRef.current);
            pushScoreTelemetry(getLatestScore(st.p1Frames), getLatestScore(st.p2Frames), 'bowling_roll', 45);
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
            if (Math.hypot(dx, dy) < 0.145 && !inGutter) {
              pin.up = false;
              pin.vx = dx * 9.5 + b.vx * 1.45 + (Math.random() - 0.5) * 0.8;
              pin.vy = dy * 6.5 + 0.95;
              playArcadeSfx(620 + Math.random() * 140, 0.07, 'square', 0.07, mutedRef.current);
            }
          }
          for (const pA of st.pins) {
            if (pA.up) continue;
            pA.x += pA.vx * dt;
            pA.y += pA.vy * dt;
            pA.rot += dt * 9;
            for (const pB of st.pins) {
              if (!pB.up) continue;
              if (Math.hypot(pA.x - pB.x, pA.y - pB.y) < 0.225) {
                pB.up = false;
                pB.vx = (pB.x - pA.x) * 4.2 + (Math.random() - 0.5) * 0.6;
                pB.vy = 0.72;
                playArcadeSfx(540, 0.06, 'triangle', 0.05, mutedRef.current);
              }
            }
          }

          if (b.y >= 1.12) {
            st.phase = 'settle';
            st.settleT = 1.05;
            const upNow = st.pins.filter((p) => p.up).length;
            const pinsThisRoll = Math.max(0, st.standingBeforeRoll - upNow);
            const activeFrames = st.turnPlayer === 1 ? st.p1Frames : st.p2Frames;
            const fObj = activeFrames[st.frame - 1];
            if (st.rollNum === 1) fObj.r1 = pinsThisRoll;
            else fObj.r2 = pinsThisRoll;

            const s1 = getLatestScore(st.p1Frames);
            const s2 = getLatestScore(st.p2Frames);
            if (st.turnPlayer === 1 || !twoHumans) {
              setBowlFramesUi(computeUsbcFrames(st.p1Frames, MAX_FRAMES));
            }

            if (pinsThisRoll === 10 && st.rollNum === 1) {
              st.banner = '⚡ ¡STRIKE PERFECTO! (X)';
              st.bannerT = 1.3;
              bowlingSimRef.current.outcomeSeq += 1;
              bowlingSimRef.current.outcomeKind = 'strike';
              setArenaBanner(st.banner);
              playArcadeSfx(880, 0.28, 'triangle', 0.1, mutedRef.current);
              pushScoreTelemetry(s1, s2, 'bowling_strike', 120);
            } else if (upNow === 0 && st.rollNum === 2) {
              st.banner = '✨ ¡SPARE! (/)';
              st.bannerT = 1.1;
              bowlingSimRef.current.outcomeSeq += 1;
              bowlingSimRef.current.outcomeKind = 'spare';
              setArenaBanner(st.banner);
              playArcadeSfx(740, 0.2, 'triangle', 0.09, mutedRef.current);
              pushScoreTelemetry(s1, s2, undefined, 70);
            } else {
              st.banner = pinsThisRoll === 0 ? 'Canaleta (0)' : `${pinsThisRoll} BOLOS DERRIBADOS`;
              st.bannerT = 0.95;
              if (pinsThisRoll > 0) {
                bowlingSimRef.current.outcomeSeq += 1;
                bowlingSimRef.current.outcomeKind = 'hit';
              }
              setArenaBanner(st.banner);
              pushScoreTelemetry(s1, s2, undefined, 35);
            }
          }
        } else if (st.phase === 'settle') {
          st.settleT -= dt;
          if (st.settleT <= 0) {
            setArenaBanner('');
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
              if (st.frame > MAX_FRAMES) {
                st.phase = 'over';
                const s1 = getLatestScore(st.p1Frames);
                const s2 = getLatestScore(st.p2Frames);
                const winTitle = twoHumans
                  ? s1 >= s2
                    ? `🏆 Gana Jugador 1 (${s1} pts)`
                    : `🏆 Gana Jugador 2 (${s2} pts)`
                  : `🏆 Partida USBC completada · ${s1} pts`;
                setFinishSummary({
                  title: winTitle,
                  sub: twoHumans ? `J1 ${s1} - ${s2} J2` : `Puntuación oficial en ${MAX_FRAMES} frames`,
                });
              } else {
                st.pins = makePins();
                st.phase = 'aim';
              }
            }
            const upCount = st.pins.filter((p) => p.up).length;
            const s1 = getLatestScore(st.p1Frames);
            const s2 = getLatestScore(st.p2Frames);
            setHud({
              leftText: `FRAME ${Math.min(st.frame, MAX_FRAMES)}/${MAX_FRAMES} · J1 ${s1}${twoHumans ? ` / J2 ${s2}` : ''}`,
              rightText: `TURNO J${st.turnPlayer} · TIRO ${st.rollNum} · ${upCount} BOLOS`,
            });
          }
        }

        const snap = bowlingSimRef.current;
        snap.phase = st.phase;
        snap.turnPlayer = st.turnPlayer;
        snap.aimX = st.aimX;
        snap.spin = st.spin;
        snap.powerPct = st.powerPct;
        snap.ball = { x: st.ball.x, y: st.ball.y, rot: st.ball.rot };
        snap.pins = st.pins;
        if (st.bannerT <= 0 && st.banner) {
          st.banner = '';
          setArenaBanner('');
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
    // 2. GYRO TENNIS SLAM PRO 2P (1-Bounce, Net Faults, OUT Lines, Shot Styles, Surfaces)
    // -----------------------------------------------------------------
    if (gameId === 'gyrotennis') {
      const WIN_PTS = 7;
      const st = {
        s1: 0,
        s2: 0,
        over: false,
        pauseT: 0.7,
        p1: { x: 0, y: 0.86, swingT: 0 },
        p2: { x: 0, y: -0.86, swingT: 0 },
        ball: {
          x: 0,
          y: 0,
          z: 0.35,
          vx: 0.2,
          vy: 1.05,
          vz: 0.35,
          lastHitter: 1 as 1 | 2,
          bouncesOnSide: 0,
        },
        banner: '¡SAQUE INICIAL!',
      };

      const awardPoint = (winner: 1 | 2, reason: string) => {
        if (winner === 1) st.s1 += 1;
        else st.s2 += 1;
        st.banner = `${reason} · Punto J${winner}`;
        setArenaBanner(st.banner);
        tennisSimRef.current.pointSeq += 1;
        tennisSimRef.current.lastScorer = winner;
        playArcadeSfx(winner === 1 ? 740 : 240, 0.2, winner === 1 ? 'triangle' : 'sawtooth', 0.08, mutedRef.current);
        pushScoreTelemetry(st.s1, st.s2, 'pingpong_point', 90);

        const twoH = controllersRef.current.length >= 2 || controllersRef.current.some((c) => c.slot === 2);
        if (st.s1 >= WIN_PTS) {
          st.over = true;
          setFinishSummary({ title: '🏆 ¡Campeón Grand Slam J1!', sub: `${st.s1} - ${st.s2}` });
        } else if (st.s2 >= WIN_PTS) {
          st.over = true;
          setFinishSummary({ title: twoH ? '🏆 Victoria Jugador 2' : '🎾 Victoria de la CPU', sub: `${st.s1} - ${st.s2}` });
        } else {
          // Reset serve to loser/next server
          const dirY = winner === 1 ? 1 : -1;
          st.ball = {
            x: (Math.random() - 0.5) * 0.3,
            y: dirY * -0.45,
            z: 0.42,
            vx: (Math.random() - 0.5) * 0.35,
            vy: dirY * 1.15,
            vz: 0.35,
            lastHitter: winner === 1 ? 2 : 1,
            bouncesOnSide: 0,
          };
          st.pauseT = 0.72;
        }
      };

      const frameLoop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
        lastTs = now;

        const twoHumans = controllersRef.current.length >= 2 || controllersRef.current.some((c) => c.slot === 2);
        const g1 = gyroP1Ref.current;
        const g2 = gyroP2Ref.current;
        const surf = tennisSimRef.current.surface || 'grass';
        const bounceRestitution = surf === 'clay' ? 0.8 : surf === 'hard' ? 0.74 : 0.66;
        const speedSurfaceMult = surf === 'clay' ? 0.92 : surf === 'hard' ? 1.02 : 1.12;

        if (!st.over) {
          const p1Fresh = g1.expiresAt > Date.now();
          const p1TargetX = p1Fresh
            ? Math.max(-0.96, Math.min(0.96, g1.steer * 1.1))
            : Math.max(-0.96, Math.min(0.96, st.p1.x + ((keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0)) * dt * 1.95));
          st.p1.x += (p1TargetX - st.p1.x) * Math.min(1, dt * 14);
          const p1DepthTarget = (keysRef.current.up ? -0.18 : 0) + (keysRef.current.down ? 0.08 : 0) + 0.84;
          st.p1.y += (Math.max(0.55, Math.min(0.95, p1DepthTarget)) - st.p1.y) * Math.min(1, dt * 8);

          if ((p1Fresh && (g1.swing > 1 || g1.nitro)) || keysRef.current.action) {
            st.p1.swingT = 0.26;
          }
          st.p1.swingT = Math.max(0, st.p1.swingT - dt);

          if (twoHumans && g2.expiresAt > Date.now()) {
            const p2TargetX = Math.max(-0.96, Math.min(0.96, g2.steer * 1.1));
            st.p2.x += (p2TargetX - st.p2.x) * Math.min(1, dt * 14);
            if (g2.swing > 1 || g2.nitro) st.p2.swingT = 0.26;
          } else {
            // Predictive CPU intercepting cross-court trajectory
            const predictX = st.ball.vy < 0 ? st.ball.x + st.ball.vx * 0.25 : 0;
            const targetCpuX = Math.max(-0.88, Math.min(0.88, predictX));
            const diffX = targetCpuX - st.p2.x;
            st.p2.x += Math.max(-dt * 1.35, Math.min(dt * 1.35, diffX * 3.8));
          }
          st.p2.swingT = Math.max(0, st.p2.swingT - dt);

          if (st.pauseT > 0) {
            st.pauseT -= dt;
          } else {
            if (st.banner) {
              st.banner = '';
              setArenaBanner('');
            }
            const b = st.ball;
            const prevY = b.y;
            b.x += b.vx * dt * speedSurfaceMult;
            b.y += b.vy * dt * speedSurfaceMult;
            b.vz -= 2.3 * dt;
            b.z += b.vz * dt;

            // Net Cord Check at y = 0 (net height approx z < 0.16)
            if ((prevY > 0 && b.y <= 0) || (prevY < 0 && b.y >= 0)) {
              if (b.z < 0.14) {
                awardPoint(b.lastHitter === 1 ? 2 : 1, '🌐 ¡A LA RED!');
              }
            }

            // Ground Bounce & 1-Bounce + OUT Rule
            if (!st.over && b.z <= 0) {
              b.z = 0;
              const isOutX = Math.abs(b.x) > 0.94;
              const isOutY = Math.abs(b.y) > 0.99;
              if (b.bouncesOnSide === 0 && (isOutX || isOutY)) {
                awardPoint(b.lastHitter === 1 ? 2 : 1, '🚫 ¡FUERA (OUT)!');
              } else {
                b.bouncesOnSide += 1;
                if (b.bouncesOnSide >= 2) {
                  awardPoint(b.lastHitter, '🎾 ¡DOBLE BOTE!');
                } else {
                  b.vz = Math.max(0.42, Math.abs(b.vz) * bounceRestitution);
                }
              }
            }

            // P1 bottom return
            if (!st.over && b.vy > 0 && b.y >= st.p1.y - 0.14 && b.y <= st.p1.y + 0.16 && Math.abs(b.x - st.p1.x) < 0.28) {
              const mode = tennisShotModeRef.current;
              const isSmash = mode === 'smash' || st.p1.swingT > 0;
              const isLob = mode === 'lob' || (p1Fresh && g1.handbrake);
              tennisSimRef.current.shotTag = isLob ? 'lob' : isSmash ? 'smash' : 'topspin';
              const spd = isSmash ? 1.44 : isLob ? 0.85 : 1.08;
              b.vy = -Math.min(2.25, Math.max(1.05, Math.abs(b.vy) * spd + 0.12));
              b.vx = Math.max(-0.75, Math.min(0.75, (b.x - st.p1.x) * 2.1 + (p1Fresh ? g1.steer * 0.45 : 0)));
              b.vz = isLob ? 1.05 : isSmash ? 0.36 : 0.62;
              b.lastHitter = 1;
              b.bouncesOnSide = 0;
              tennisSimRef.current.hitSeq += 1;
              playArcadeSfx(isSmash ? 660 : 490, 0.08, 'triangle', 0.08, mutedRef.current);
              pushScoreTelemetry(st.s1, st.s2, 'tennis_hit', isSmash ? 75 : 35);
            }

            // P2 top return
            if (!st.over && b.vy < 0 && b.y <= st.p2.y + 0.14 && b.y >= st.p2.y - 0.16 && Math.abs(b.x - st.p2.x) < 0.27) {
              const smashBoost = st.p2.swingT > 0 ? 1.32 : 1.05;
              tennisSimRef.current.shotTag = st.p2.swingT > 0 ? 'smash' : 'normal';
              b.vy = Math.min(2.15, Math.max(1.0, Math.abs(b.vy) * smashBoost + 0.1));
              b.vx = Math.max(-0.72, Math.min(0.72, (b.x - st.p2.x) * 2.0 + (Math.random() - 0.5) * 0.2));
              b.vz = 0.56;
              b.lastHitter = 2;
              b.bouncesOnSide = 0;
              tennisSimRef.current.hitSeq += 1;
              playArcadeSfx(420, 0.08, 'triangle', 0.07, mutedRef.current);
            }

            // Ball sailed deep past baseline without bouncing in bounds
            if (!st.over && b.y > 1.24) {
              awardPoint(2, b.bouncesOnSide === 0 ? '🚫 ¡PASADA DE FONDO!' : '🔥 ¡WINNER J2!');
            } else if (!st.over && b.y < -1.24) {
              awardPoint(1, b.bouncesOnSide === 0 ? '🚫 ¡PASADA DE FONDO!' : '🔥 ¡WINNER J1!');
            }
          }
        }

        const surfLabel = surf === 'clay' ? 'TIERRA' : surf === 'hard' ? 'PISTA DURA' : 'HIERBA';
        setHud({
          leftText: `J1 ${st.s1} - ${st.s2} ${twoHumans ? 'J2' : 'CPU'}`,
          rightText: `A ${WIN_PTS} PUNTOS · ${surfLabel}`,
        });

        const tSnap = tennisSimRef.current;
        tSnap.p1 = { x: st.p1.x, y: st.p1.y, swingT: st.p1.swingT };
        tSnap.p2 = { x: st.p2.x, y: st.p2.y, swingT: st.p2.swingT };
        tSnap.ball = { x: st.ball.x, y: st.ball.y, z: st.ball.z, vx: st.ball.vx, vy: st.ball.vy };
        tSnap.over = st.over;

        rafId = requestAnimationFrame(frameLoop);
      };
      rafId = requestAnimationFrame(frameLoop);
      return () => {
        alive = false;
        cancelAnimationFrame(rafId);
      };
    }

    // -----------------------------------------------------------------
    // 3. GYRO LABYRINTH 3D PRO (Real 3D Tiltable Board + 3 Levels)
    // -----------------------------------------------------------------
    const COLS = 19;
    const ROWS = 11;
    let levelIdx = 0;
    let grid: string[][] = [];
    let starsTotal = 0;
    let starsCollected = 0;
    let totalStarsAllLevels = 0;
    let timerLeft = 65;
    let labOver = false;
    let ball1 = { x: 1.5, y: 1.5, vx: 0, vy: 0 };
    let ball2 = { x: 1.5, y: 1.5, vx: 0, vy: 0 };

    const loadLevel = (idx: number) => {
      levelIdx = idx;
      grid = LAB_LEVELS[idx].map((r) => r.split(''));
      starsTotal = 0;
      starsCollected = 0;
      timerLeft = 65;
      ball1 = { x: 1.5, y: 1.5, vx: 0, vy: 0 };
      ball2 = { x: 1.5, y: 1.5, vx: 0, vy: 0 };
      grid.forEach((row) => row.forEach((c) => { if (c === '*') starsTotal += 1; }));
      labSimRef.current.level = idx + 1;
      labSimRef.current.grid = grid;
      setHud({
        leftText: `ESTRELLAS 0/${starsTotal}`,
        rightText: `NIVEL ${idx + 1}/${LAB_LEVELS.length} · ${Math.ceil(timerLeft)}s`,
      });
    };
    loadLevel(0);

    const stepSphere = (b: typeof ball1, ax: number, ay: number, dt: number, slot: 1 | 2) => {
      b.vx = (b.vx + ax * 16.5 * dt) * Math.pow(0.28, dt);
      b.vy = (b.vy + ay * 16.5 * dt) * Math.pow(0.28, dt);
      const maxSpd = 7.4;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > maxSpd) {
        b.vx = (b.vx / sp) * maxSpd;
        b.vy = (b.vy / sp) * maxSpd;
      }

      const subSteps = 2;
      const subDt = dt / subSteps;
      const r = 0.28;
      for (let stepIdx = 0; stepIdx < subSteps; stepIdx += 1) {
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;
        const cMin = Math.max(0, Math.floor(b.x) - 1);
        const cMax = Math.min(COLS - 1, Math.floor(b.x) + 1);
        const rMin = Math.max(0, Math.floor(b.y) - 1);
        const rMax = Math.min(ROWS - 1, Math.floor(b.y) + 1);
        for (let rr = rMin; rr <= rMax; rr += 1) {
          for (let cc = cMin; cc <= cMax; cc += 1) {
            if (grid[rr][cc] !== '#') continue;
            const closestX = Math.max(cc, Math.min(b.x, cc + 1));
            const closestY = Math.max(rr, Math.min(b.y, rr + 1));
            const dx = b.x - closestX;
            const dy = b.y - closestY;
            const distSq = dx * dx + dy * dy;
            if (distSq < r * r) {
              const dist = Math.sqrt(distSq);
              if (dist > 0.0001) {
                const nx = dx / dist;
                const ny = dy / dist;
                const pen = r - dist;
                b.x += nx * pen;
                b.y += ny * pen;
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) {
                  b.vx -= 1.25 * vn * nx;
                  b.vy -= 1.25 * vn * ny;
                }
              } else {
                b.x -= b.vx * subDt;
                b.y -= b.vy * subDt;
                b.vx *= -0.3;
                b.vy *= -0.3;
              }
            }
          }
        }
      }

      const gc = Math.floor(b.x);
      const gr = Math.floor(b.y);
      const cell = grid[gr]?.[gc];
      if (cell === '*') {
        grid[gr][gc] = '.';
        starsCollected += 1;
        totalStarsAllLevels += 1;
        labSimRef.current.collectSeq += 1;
        playArcadeSfx(760, 0.12, 'triangle', 0.08, mutedRef.current);
        pushScoreTelemetry(totalStarsAllLevels, Math.ceil(timerLeft), 'pingpong_hit', 45);
      } else if (cell === 'O') {
        const holeDist = Math.hypot(b.x - (gc + 0.5), b.y - (gr + 0.5));
        if (holeDist < 0.36) {
          labSimRef.current.fallSeq += 1;
          b.x = 1.5;
          b.y = 1.5;
          b.vx = 0;
          b.vy = 0;
          playArcadeSfx(160, 0.2, 'sawtooth', 0.08, mutedRef.current);
          pushScoreTelemetry(totalStarsAllLevels, Math.ceil(timerLeft), undefined, 95);
        }
      } else if (cell === 'E') {
        labSimRef.current.winSeq += 1;
        playArcadeSfx(920, 0.3, 'triangle', 0.1, mutedRef.current);
        pushScoreTelemetry(totalStarsAllLevels, Math.ceil(timerLeft), 'lab_win', 130);
        if (levelIdx + 1 < LAB_LEVELS.length) {
          setArenaBanner(`✨ ¡Nivel ${levelIdx + 1} superado! Siguiente laberinto...`);
          window.setTimeout(() => setArenaBanner(''), 1400);
          loadLevel(levelIdx + 1);
        } else {
          labOver = true;
          setFinishSummary({
            title: `🏆 ¡Laberinto 3D Completado (J${slot})!`,
            sub: `${totalStarsAllLevels} estrellas totales · ${Math.ceil(timerLeft)}s sobrantes`,
          });
        }
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
          setFinishSummary({
            title: '⏱️ Tiempo agotado',
            sub: `Nivel ${levelIdx + 1}/${LAB_LEVELS.length} · ${starsCollected}/${starsTotal} estrellas`,
          });
        }
        const g1 = gyroP1Ref.current;
        const p1Fresh = g1.expiresAt > Date.now();
        const keyAx = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
        const keyAy = (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0);
        const dragTilt = labDragTiltRef.current;
        const ax1 = dragTilt.active
          ? dragTilt.ax
          : p1Fresh
          ? Math.abs(keyAx) > 0
            ? keyAx
            : g1.steer
          : keyAx;
        const ay1 = dragTilt.active
          ? dragTilt.ay
          : p1Fresh
          ? Math.abs(keyAy) > 0
            ? keyAy
            : -g1.pitch
          : keyAy;
        labSimRef.current.tiltX = ax1;
        labSimRef.current.tiltZ = ay1;

        stepSphere(ball1, ax1, ay1, dt, 1);

        if (twoHumans) {
          const g2 = gyroP2Ref.current;
          const p2Fresh = g2.expiresAt > Date.now();
          stepSphere(ball2, p2Fresh ? g2.steer : 0, p2Fresh ? -g2.pitch : 0, dt, 2);
        }

        labSimRef.current.twoHumans = twoHumans;
        labSimRef.current.ball1 = { ...ball1 };
        labSimRef.current.ball2 = twoHumans ? { ...ball2 } : null;

        setHud({
          leftText: `ESTRELLAS ${starsCollected}/${starsTotal}`,
          rightText: `NIVEL ${levelIdx + 1}/${LAB_LEVELS.length} · ${Math.ceil(timerLeft)}s`,
        });
      }

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
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface w-full max-w-5xl mx-auto space-y-3 select-none"
    >
      {/* Top Bar Header (Zero-Pill clean unboxed metadata) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-[#0e1222] border border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm sm:text-base font-black text-white truncate">{titleText}</span>
          <span className="text-zinc-600 hidden sm:inline">·</span>
          <span className="text-xs font-semibold text-zinc-300 inline-flex items-center gap-1 whitespace-nowrap">
            <Smartphone className={`w-3.5 h-3.5 ${controllers.length > 0 ? 'text-emerald-400' : 'text-purple-400'}`} />
            {controllers.length >= 2
              ? '2 Móviles'
              : controllers.length === 1
              ? '1 Móvil'
              : 'Mando listo'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-xs font-bold text-zinc-200 flex items-center gap-2 tabular-nums">
            <span className="text-emerald-300">{hud.leftText}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-purple-300">{hud.rightText}</span>
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

      {/* True Three.js 3D WebGL Viewport for All 3 Sports/Motion Games */}
      <div
        onPointerDown={(e) => {
          if (gameId !== 'gyrolab') return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          labDragTiltRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            ax: 0,
            ay: 0,
          };
        }}
        onPointerMove={(e) => {
          if (gameId !== 'gyrolab' || !labDragTiltRef.current.active) return;
          const dx = e.clientX - labDragTiltRef.current.startX;
          const dy = e.clientY - labDragTiltRef.current.startY;
          labDragTiltRef.current.ax = Math.max(-1, Math.min(1, dx / 52));
          labDragTiltRef.current.ay = Math.max(-1, Math.min(1, dy / 52));
        }}
        onPointerUp={() => {
          labDragTiltRef.current.active = false;
          labDragTiltRef.current.ax = 0;
          labDragTiltRef.current.ay = 0;
        }}
        onPointerCancel={() => {
          labDragTiltRef.current.active = false;
          labDragTiltRef.current.ax = 0;
          labDragTiltRef.current.ay = 0;
        }}
        className={`relative rounded-3xl overflow-hidden bg-[#050811] border border-white/12 shadow-2xl ${
          gameId === 'gyrolab' ? 'touch-none' : ''
        }`}
      >
        {gameId === 'gyrobowling' ? (
          <Bowling3DViewport simRef={bowlingSimRef} />
        ) : gameId === 'gyrotennis' ? (
          <Tennis3DViewport simRef={tennisSimRef} />
        ) : (
          <Labyrinth3DViewport simRef={labSimRef} />
        )}

        {arenaBanner && !finishSummary && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2 rounded-2xl bg-[#090d1a]/92 border-2 border-amber-400/75 text-sm sm:text-lg font-black text-amber-200 shadow-2xl text-center">
            {arenaBanner}
          </div>
        )}

        {finishSummary && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={finishSummary.title}
            subtitle={finishSummary.sub}
            outcome={
              finishSummary.title.includes('CPU') || finishSummary.title.includes('agotado')
                ? 'defeat'
                : 'win'
            }
            primaryLabel="Jugar de nuevo"
            onPrimaryAction={() => setResetNonce((n) => n + 1)}
          />
        )}
      </div>

      {/* Bowling USBC 6-Frame Scoreboard & Hook/Power Dock */}
      {gameId === 'gyrobowling' && (
        <div className="rounded-2xl bg-[#0e1222] border border-white/10 p-3 space-y-2.5">
          <div className="grid grid-cols-6 gap-1.5">
            {bowlFramesUi.map((f, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-black/45 border border-white/10 overflow-hidden text-center"
              >
                <div className="text-[10px] font-bold text-zinc-400 bg-white/[0.04] py-0.5">F{idx + 1}</div>
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-zinc-200 py-0.5 tabular-nums">
                  <span>{f.r1 === 10 ? 'X' : f.r1 ?? '-'}</span>
                  <span className="text-zinc-600">|</span>
                  <span>
                    {f.r1 === 10
                      ? ''
                      : f.r2 !== null && f.r1 !== null && f.r1 + f.r2 === 10
                      ? '/'
                      : f.r2 ?? '-'}
                  </span>
                </div>
                <div className="text-xs font-black text-amber-300 pb-1 tabular-nums">
                  {f.cumul !== null ? f.cumul : '·'}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-zinc-400">Efecto (Q/E):</span>
              <button
                type="button"
                onClick={() => {
                  bowlSpinOverrideRef.current = Math.max(-1, Number((bowlSpinOverrideRef.current - 0.35).toFixed(2)));
                  setBowlSpinUi(bowlSpinOverrideRef.current);
                }}
                className="game-touch-btn min-h-10 px-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-bold text-zinc-200 cursor-pointer"
              >
                ↶ Izq
              </button>
              <button
                type="button"
                onClick={() => {
                  bowlSpinOverrideRef.current = 0;
                  setBowlSpinUi(0);
                }}
                className="game-touch-btn min-h-10 px-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-bold text-zinc-300 cursor-pointer tabular-nums"
              >
                {bowlSpinUi === 0 ? 'Recto' : `${bowlSpinUi > 0 ? '+' : ''}${Math.round(bowlSpinUi * 100)}%`}
              </button>
              <button
                type="button"
                onClick={() => {
                  bowlSpinOverrideRef.current = Math.min(1, Number((bowlSpinOverrideRef.current + 0.35).toFixed(2)));
                  setBowlSpinUi(bowlSpinOverrideRef.current);
                }}
                className="game-touch-btn min-h-10 px-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-bold text-zinc-200 cursor-pointer"
              >
                Der ↷
              </button>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[140px] max-w-xs">
              <span className="text-[11px] font-bold text-zinc-400">Fuerza</span>
              <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div ref={bowlPowerFillRef} className="h-full rounded-full" style={{ width: '78%', backgroundColor: '#38bdf8' }} />
              </div>
              <span ref={bowlPowerTextRef} className="text-[11px] font-mono font-bold text-zinc-200 w-8 text-right tabular-nums">
                78%
              </span>
            </div>

            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                bowlManualActionRef.current = true;
              }}
              className="game-touch-btn min-h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
            >
              🎳 LANZAR
            </button>
          </div>
        </div>
      )}

      {/* Tennis Court Surface & Shot Style Controls */}
      {gameId === 'gyrotennis' && (
        <div className="rounded-2xl bg-[#0e1222] border border-white/10 p-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-zinc-400">Pista:</span>
            {(
              [
                { id: 'grass', label: '🌿 Hierba' },
                { id: 'clay', label: '🧱 Tierra' },
                { id: 'hard', label: '🏟️ Dura' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setTennisSurface(s.id);
                  tennisSimRef.current.surface = s.id;
                  triggerHaptic('light');
                }}
                className={`game-touch-btn min-h-10 px-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                  tennisSurface === s.id
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : 'bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/[0.1]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-zinc-400">Golpe (1/2/3):</span>
            {(
              [
                { id: 'normal', label: '🎾 Topspin' },
                { id: 'smash', label: '🔥 Smash' },
                { id: 'lob', label: '✨ Globo' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setTennisShotMode(m.id);
                  triggerHaptic('light');
                }}
                className={`game-touch-btn min-h-10 px-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                  tennisShotMode === m.id
                    ? 'bg-[#7C3AED] border-purple-400 text-white'
                    : 'bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/[0.1]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Controls: T-Cross D-Pad for Labyrinth, Action Strip for Sports */}
      {gameId === 'gyrolab' ? (
        <div className="sm:hidden flex flex-col items-center gap-2 pt-1">
          <div className="grid grid-cols-3 gap-2 w-56">
            <div />
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                keysRef.current.up = true;
              }}
              onPointerUp={() => { keysRef.current.up = false; }}
              onPointerCancel={() => { keysRef.current.up = false; }}
              onLostPointerCapture={() => { keysRef.current.up = false; }}
              className="game-touch-btn h-14 rounded-2xl bg-[#11172a] border-2 border-cyan-400/35 font-black text-white text-lg"
            >
              ▲
            </button>
            <div />
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                keysRef.current.left = true;
              }}
              onPointerUp={() => { keysRef.current.left = false; }}
              onPointerCancel={() => { keysRef.current.left = false; }}
              onLostPointerCapture={() => { keysRef.current.left = false; }}
              className="game-touch-btn h-14 rounded-2xl bg-[#11172a] border-2 border-cyan-400/35 font-black text-white text-lg"
            >
              ◀
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                keysRef.current.down = true;
              }}
              onPointerUp={() => { keysRef.current.down = false; }}
              onPointerCancel={() => { keysRef.current.down = false; }}
              onLostPointerCapture={() => { keysRef.current.down = false; }}
              className="game-touch-btn h-14 rounded-2xl bg-[#11172a] border-2 border-cyan-400/35 font-black text-white text-lg"
            >
              ▼
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                keysRef.current.right = true;
              }}
              onPointerUp={() => { keysRef.current.right = false; }}
              onPointerCancel={() => { keysRef.current.right = false; }}
              onLostPointerCapture={() => { keysRef.current.right = false; }}
              className="game-touch-btn h-14 rounded-2xl bg-[#11172a] border-2 border-cyan-400/35 font-black text-white text-lg"
            >
              ▶
            </button>
          </div>
          <p className="text-[11px] font-semibold text-zinc-400">
            Desliza sobre el tablero o usa la cruceta / giroscopio
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              keysRef.current.left = true;
            }}
            onPointerUp={() => { keysRef.current.left = false; }}
            onPointerCancel={() => { keysRef.current.left = false; }}
            onLostPointerCapture={() => { keysRef.current.left = false; }}
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
              keysRef.current.action = true;
              if (gameId === 'gyrobowling') bowlManualActionRef.current = true;
            }}
            onPointerUp={() => { keysRef.current.action = false; }}
            onPointerCancel={() => { keysRef.current.action = false; }}
            onLostPointerCapture={() => { keysRef.current.action = false; }}
            className="game-touch-btn flex-1 min-h-12 rounded-2xl bg-[#7C3AED] font-black text-white"
          >
            {gameId === 'gyrobowling' ? '🎳 LANZAR' : '🎾 GOLPEAR'}
          </button>
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              keysRef.current.right = true;
            }}
            onPointerUp={() => { keysRef.current.right = false; }}
            onPointerCancel={() => { keysRef.current.right = false; }}
            onLostPointerCapture={() => { keysRef.current.right = false; }}
            className="game-touch-btn flex-1 min-h-12 rounded-2xl bg-[#111525] border border-white/15 font-black text-white"
          >
            DER ▶
          </button>
        </div>
      )}

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
