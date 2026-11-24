import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CarFront,
  Compass,
  Flame,
  Gauge,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { AppLanguage } from '../../../types';
import { socketService } from '../../../services/socket';
import { pickLang } from '../../../utils/i18n';
import { triggerHaptic } from '../../../utils/haptics';
import { RiffanBackIcon } from '../../ui/RiffanIcons';
import { RACING_CAR_CATALOG, type RacingCarId } from './racingTypes';

interface PhoneGyroControllerProps {
  lang: AppLanguage;
  initialRoomId?: string;
  initialPairCode?: string;
  userId: string;
  userName: string;
  userColor?: string;
  onExit: () => void;
}

interface TelemetrySnapshot {
  speedKmh: number;
  rpmPct: number;
  gear: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalCars: number;
  nitroPct: number;
  offroad: boolean;
  raceState: 'countdown' | 'racing' | 'finished';
  scoreP1?: number;
  scoreP2?: number;
}

type SensitivityLevel = 'soft' | 'normal' | 'pro';
export type GyroControllerGame =
  | 'racing3d'
  | 'penalty'
  | 'pingpong'
  | 'soccerpong'
  | 'gyrohockey'
  | 'gyrospace'
  | 'headsoccer'
  | 'gyrobowling'
  | 'gyrotennis'
  | 'gyrolab'
  | 'hexgl'
  | 'arkanoid'
  | 'invaders'
  | 'pacman'
  | 'bomberman'
  | 'flappy';

const GYRO_MODE_ORDER: GyroControllerGame[] = [
  'racing3d',
  'penalty',
  'pingpong',
  'soccerpong',
  'gyrobowling',
  'gyrotennis',
  'gyrolab',
  'gyrohockey',
  'gyrospace',
  'headsoccer',
  'hexgl',
  'arkanoid',
  'invaders',
  'pacman',
  'bomberman',
  'flappy',
];

function parseGyroControllerGameFromRaw(rawVal?: string | null): GyroControllerGame | null {
  const raw = (rawVal || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'gyrohockey' || raw === 'air-hockey' || raw === 'hockey-gyro') return 'gyrohockey';
  if (raw === 'gyrospace' || raw === 'galaxia-gyro' || raw === 'space-gyro') return 'gyrospace';
  if (raw === 'pingpong' || raw === 'ping-pong') return 'pingpong';
  if (raw === 'soccerpong' || raw === 'futbol-pong' || raw === 'soccer-pong') return 'soccerpong';
  if (raw === 'headsoccer' || raw === 'head-soccer' || raw === 'cabezones') return 'headsoccer';
  if (raw === 'penalty' || raw === 'penaltis' || raw === 'penalties') return 'penalty';
  if (raw === 'gyrobowling' || raw === 'bolos-gyro' || raw === 'bolos' || raw === 'bowling') {
    return 'gyrobowling';
  }
  if (raw === 'gyrotennis' || raw === 'tenis-gyro' || raw === 'tenis-pro' || raw === 'tenis') {
    return 'gyrotennis';
  }
  if (raw === 'gyrolab' || raw === 'laberinto-gyro' || raw === 'esfera-gyro') return 'gyrolab';
  if (raw === 'hexgl' || raw === 'hex-gl' || raw === 'hover-3d') return 'hexgl';
  if (raw === 'arkanoid' || raw === 'brickit' || raw === 'brick-it') return 'arkanoid';
  if (raw === 'invaders' || raw === 'space-invaders') return 'invaders';
  if (raw === 'pacman' || raw === 'pac-man') return 'pacman';
  if (raw === 'bomberman' || raw === 'bomberman-arena') return 'bomberman';
  if (raw === 'flappy' || raw === 'clumsy-bird' || raw === 'flappy-bird') return 'flappy';
  if (raw === 'racing3d' || raw === 'nitro-gp' || raw === 'coches-3d') return 'racing3d';
  return null;
}

function parseGyroControllerGameFromUrl(): { game: GyroControllerGame; explicit: boolean } {
  if (typeof window === 'undefined') return { game: 'racing3d', explicit: false };
  const raw = new URLSearchParams(window.location.search).get('game');
  const parsed = parseGyroControllerGameFromRaw(raw);
  return {
    game: parsed || 'racing3d',
    explicit: parsed !== null,
  };
}

function parsePreferredSlotFromUrl(): 1 | 2 | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = (new URLSearchParams(window.location.search).get('slot') || '').trim();
  if (raw === '2') return 2;
  if (raw === '1') return 1;
  return undefined;
}

function normalizeVerticalTiltDeg(ev: DeviceOrientationEvent): { tiltX: number; tiltY: number } {
  // Portrait ergonomic calibration:
  // gamma = left/right tilt (-90..90)
  // beta = forward/back vertical pitch (upright ~45-70 deg; leaning top away lowers beta)
  const beta = typeof ev.beta === 'number' ? ev.beta : 45;
  const gamma = typeof ev.gamma === 'number' ? ev.gamma : 0;
  return { tiltX: gamma, tiltY: beta };
}

function playPhoneFeedbackTone(tag: string, muted: boolean): void {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const w = window as unknown as { __riffanPhoneAudioCtx?: AudioContext };
    if (!w.__riffanPhoneAudioCtx) {
      w.__riffanPhoneAudioCtx = new AudioCtx();
    }
    const ctx = w.__riffanPhoneAudioCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    if (tag === 'pingpong_hit' || tag === 'tennis_hit') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(tag === 'tennis_hit' ? 520 : 640, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (tag === 'pingpong_point' || tag === 'goal' || tag === 'bowling_strike' || tag === 'lab_win') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(784, now + 0.07);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = tag === 'penalty_kick' || tag === 'bowling_roll' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(tag === 'penalty_post' ? 760 : 320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch {
    // ignore WebAudio restrictions
  }
}

export const PhoneGyroController: React.FC<PhoneGyroControllerProps> = ({
  lang,
  initialRoomId = '',
  initialPairCode = '',
  userId,
  userName,
  userColor = '#7c3aed',
  onExit,
}) => {
  const cleanInitialRoom = useMemo(
    () => (initialRoomId || (initialPairCode ? `race-${initialPairCode}` : '')).trim().toLowerCase(),
    [initialRoomId, initialPairCode]
  );

  const urlGameInfo = useMemo(() => parseGyroControllerGameFromUrl(), []);
  const urlPreferredSlot = useMemo(() => parsePreferredSlotFromUrl(), []);

  const [activeRoomId, setActiveRoomId] = useState(cleanInitialRoom);
  const [gyroGameMode, setGyroGameMode] = useState<GyroControllerGame>(urlGameInfo.game);
  const [explicitGameFromUrl] = useState(urlGameInfo.explicit);
  const [wsConnected, setWsConnected] = useState(false);
  const [searchingStatus, setSearchingStatus] = useState(
    'Buscando partida abierta en TV o Web...'
  );
  const [searchTick, setSearchTick] = useState(0);

  const [mySlot, setMySlot] = useState<1 | 2>(urlPreferredSlot || 1);
  const mySlotRef = useRef<1 | 2>(urlPreferredSlot || 1);
  mySlotRef.current = mySlot;

  const preferredSlotRef = useRef<1 | 2 | undefined>(urlPreferredSlot);

  const [gyroState, setGyroState] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle');
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('normal');
  const [phoneSoundMuted, setPhoneSoundMuted] = useState(false);
  const phoneSoundMutedRef = useRef(false);
  phoneSoundMutedRef.current = phoneSoundMuted;

  const [visualSteer, setVisualSteer] = useState(0);
  const [visualPitch, setVisualPitch] = useState(0);
  const [visualSwing, setVisualSwing] = useState(0);

  // Portrait thumb-zone 2x2 action buttons (2 left column + 2 right column)
  const [l1Pressed, setL1Pressed] = useState(false);
  const [l2Pressed, setL2Pressed] = useState(false);
  const [r1Pressed, setR1Pressed] = useState(false);
  const [r2Pressed, setR2Pressed] = useState(false);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    speedKmh: 0,
    rpmPct: 14,
    gear: 1,
    lap: 1,
    totalLaps: 3,
    position: 4,
    totalCars: 4,
    nitroPct: 100,
    offroad: false,
    raceState: 'countdown',
  });

  const rawTiltRef = useRef(0);
  const rawPitchRef = useRef(45);
  const zeroOffsetRef = useRef(0);
  const zeroPitchRef = useRef<number | null>(null);
  const filteredSteerRef = useRef(0);
  const filteredPitchRef = useRef(0);
  const touchSteerRef = useRef<number | null>(null);
  const touchPitchRef = useRef<number | null>(null);
  const swingPowerRef = useRef(0);
  const lastSwingBurstAtRef = useRef(0);

  const l1Ref = useRef(false);
  const l2Ref = useRef(false);
  const r1Ref = useRef(false);
  const r2Ref = useRef(false);
  const [selectedCarId, setSelectedCarId] = useState<RacingCarId>('ferrari');
  const selectedCarRef = useRef<RacingCarId>('ferrari');
  const carSelectHoldRef = useRef<RacingCarId | undefined>(undefined);
  const autoGasToggleHoldRef = useRef(false);
  const [phoneAutoGas, setPhoneAutoGas] = useState(false);

  const seqRef = useRef(0);
  const lastLapRef = useRef(1);
  const lastHapticAtRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const sensitivityRef = useRef<SensitivityLevel>(sensitivity);
  sensitivityRef.current = sensitivity;

  const participantPayload = useMemo(
    () => ({
      id: userId || `ctrl-${Math.random().toString(36).slice(2, 8)}`,
      name: userName || 'Piloto Móvil',
      avatar: '🎮',
      color: userColor,
      role: 'viewer' as const,
      isHost: false,
      joinedAt: Date.now(),
    }),
    [userId, userName, userColor]
  );

  // Auto-discover active TV/Web gyro display room with zero manual room code entry
  useEffect(() => {
    if (activeRoomId) return;
    let cancelled = false;

    const discoverRoom = async () => {
      try {
        const res = await fetch('/api/gyro/active-room', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          active?: {
            roomId?: string;
            gameId?: string;
            controllersCount?: number;
          } | null;
        };
        if (cancelled) return;
        if (data?.active?.roomId) {
          const detectedGame = parseGyroControllerGameFromRaw(data.active.gameId);
          if (detectedGame && !explicitGameFromUrl) {
            setGyroGameMode(detectedGame);
          }
          setActiveRoomId(data.active.roomId.toLowerCase());
        } else {
          setSearchingStatus(
            'Abre cualquier juego en tu Smart TV o Web para emparejar al instante...'
          );
        }
      } catch {
        if (!cancelled) {
          setSearchingStatus('Esperando conexión con el servidor...');
        }
      }
    };

    void discoverRoom();
    const pollId = window.setInterval(() => {
      void discoverRoom();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [activeRoomId, explicitGameFromUrl, searchTick]);

  // Keep phone screen awake while controller is paired
  useEffect(() => {
    if (!activeRoomId || typeof navigator === 'undefined') return;
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible' && !cancelled) {
          sentinel = await nav.wakeLock!.request('screen');
        }
      } catch {
        // ignore if unsupported or blocked
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => {});
    };
  }, [activeRoomId]);

  // Connect WS room and listen for assigned slot + live telemetry
  useEffect(() => {
    if (!activeRoomId) return;

    const joinChannel = () => {
      socketService.joinGyroChannel(
        'controller',
        `${participantPayload.name} (J${preferredSlotRef.current || mySlotRef.current})`,
        activeRoomId,
        {
          preferredSlot: preferredSlotRef.current,
          gameId: gyroGameMode,
        }
      );
    };

    const alreadyInRoom =
      socketService.getActiveRoomId() === activeRoomId && socketService.isConnected();
    if (!alreadyInRoom) {
      socketService.connect(
        activeRoomId,
        participantPayload,
        `Sala ${activeRoomId.toUpperCase()}`
      );
    } else {
      setWsConnected(true);
      joinChannel();
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'CONNECTION_STATUS') {
        const up = Boolean(ev.payload.connected);
        setWsConnected(up);
        if (up) joinChannel();
      } else if (ev.type === 'ROOM_STATE') {
        setWsConnected(true);
        joinChannel();
      } else if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers) ? ev.payload.controllers : [];
        const mine = list.find((c) => c.userId === participantPayload.id);
        if (mine && (mine.slot === 1 || mine.slot === 2)) {
          setMySlot(mine.slot);
        }
        const peerGame = parseGyroControllerGameFromRaw(
          typeof ev.payload.gameId === 'string' ? ev.payload.gameId : ''
        );
        if (peerGame && !explicitGameFromUrl) {
          setGyroGameMode(peerGame);
        }
      } else if (ev.type === 'RACING_TELEMETRY_RELAY') {
        const p = ev.payload;
        if (p.targetSlot && p.targetSlot !== mySlotRef.current) {
          if (typeof p.scoreP1 === 'number' || typeof p.scoreP2 === 'number') {
            setTelemetry((prev) => ({
              ...prev,
              scoreP1: typeof p.scoreP1 === 'number' ? p.scoreP1 : prev.scoreP1,
              scoreP2: typeof p.scoreP2 === 'number' ? p.scoreP2 : prev.scoreP2,
            }));
          }
          return;
        }
        const nextLap = Number(p.lap || 1);
        const impact = Number(p.collisionImpact || 0);
        const offroad = Boolean(p.offroad);
        setTelemetry({
          speedKmh: Math.round(Number(p.speedKmh || 0)),
          rpmPct: Math.round(Number(p.rpmPct || 0)),
          gear: Number(p.gear || 1),
          lap: nextLap,
          totalLaps: Number(p.totalLaps || 3),
          position: Number(p.position || 1),
          totalCars: Number(p.totalCars || 4),
          nitroPct: Math.round(Number(p.nitroPct ?? 100)),
          offroad,
          raceState:
            p.raceState === 'racing' || p.raceState === 'finished' ? p.raceState : 'countdown',
          scoreP1: typeof p.scoreP1 === 'number' ? p.scoreP1 : undefined,
          scoreP2: typeof p.scoreP2 === 'number' ? p.scoreP2 : undefined,
        });

        const now = Date.now();
        if (p.eventTag && now - lastEventAtRef.current > 85) {
          lastEventAtRef.current = now;
          playPhoneFeedbackTone(p.eventTag, phoneSoundMutedRef.current);
        }
        if (p.hapticPulseMs && p.hapticPulseMs > 0 && now - lastHapticAtRef.current > 90) {
          lastHapticAtRef.current = now;
          try {
            navigator.vibrate?.(Math.min(350, p.hapticPulseMs));
          } catch {
            // ignore
          }
        } else if (nextLap > lastLapRef.current) {
          lastLapRef.current = nextLap;
          try {
            navigator.vibrate?.([50, 40, 80]);
          } catch {
            // ignore
          }
        } else if (impact > 0.25 && now - lastHapticAtRef.current > 220) {
          lastHapticAtRef.current = now;
          try {
            navigator.vibrate?.(Math.min(110, Math.round(45 + impact * 65)));
          } catch {
            // ignore
          }
        } else if (offroad && now - lastHapticAtRef.current > 180) {
          lastHapticAtRef.current = now;
          try {
            navigator.vibrate?.(22);
          } catch {
            // ignore
          }
        }
      }
    });

    return () => {
      unsub();
    };
  }, [activeRoomId, explicitGameFromUrl, gyroGameMode, participantPayload]);

  // Portrait DeviceOrientation + DeviceMotion listeners
  useEffect(() => {
    if (gyroState !== 'active' || typeof window === 'undefined') return;

    const onOrientation = (ev: DeviceOrientationEvent) => {
      const { tiltX, tiltY } = normalizeVerticalTiltDeg(ev);
      rawTiltRef.current = tiltX;
      rawPitchRef.current = tiltY;
      if (zeroPitchRef.current === null) {
        zeroPitchRef.current = tiltY;
      }
    };

    const onMotion = (ev: DeviceMotionEvent) => {
      const acc = ev.acceleration || ev.accelerationIncludingGravity;
      if (!acc) return;
      const ax = acc.x || 0;
      const ay = acc.y || 0;
      const az = acc.z || 0;
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);
      const net = ev.acceleration ? mag : Math.abs(mag - 9.81);
      if (net > 4.0) {
        const normalized = Math.min(3, (net - 3.2) / 5.2);
        if (normalized > swingPowerRef.current) {
          swingPowerRef.current = normalized;
          lastSwingBurstAtRef.current = Date.now();
        }
      }
    };

    window.addEventListener('deviceorientation', onOrientation, true);
    window.addEventListener('devicemotion', onMotion, true);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      window.removeEventListener('devicemotion', onMotion, true);
    };
  }, [gyroState]);

  // Auto-enable sensors when DeviceOrientation exists without explicit permission gate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('DeviceOrientationEvent' in window)) {
      setGyroState('unsupported');
      return;
    }
    const reqPerm = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission;
    if (typeof reqPerm !== 'function') {
      setGyroState('active');
    }
  }, []);

  const handleActivateGyro = useCallback(async () => {
    triggerHaptic('medium');
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setGyroState('unsupported');
      return;
    }
    const devOri = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    const devMot = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : {}) as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (typeof devOri.requestPermission === 'function') {
        const res = await devOri.requestPermission();
        if (typeof devMot.requestPermission === 'function') {
          await devMot.requestPermission().catch(() => 'granted');
        }
        if (res === 'granted') {
          zeroOffsetRef.current = rawTiltRef.current;
          zeroPitchRef.current = rawPitchRef.current;
          setGyroState('active');
        } else {
          setGyroState('denied');
        }
      } else {
        zeroOffsetRef.current = rawTiltRef.current;
        zeroPitchRef.current = rawPitchRef.current;
        setGyroState('active');
      }
    } catch {
      setGyroState('denied');
    }
  }, []);

  const handleCalibrate = useCallback(() => {
    triggerHaptic('light');
    zeroOffsetRef.current = rawTiltRef.current;
    zeroPitchRef.current = rawPitchRef.current;
    filteredSteerRef.current = 0;
    filteredPitchRef.current = 0;
    setVisualSteer(0);
    setVisualPitch(0);
  }, []);

  const handleSwitchPreferredSlot = useCallback(() => {
    if (!activeRoomId || !socketService.isConnected()) return;
    const nextSlot: 1 | 2 = mySlotRef.current === 1 ? 2 : 1;
    preferredSlotRef.current = nextSlot;
    triggerHaptic('medium');
    setMySlot(nextSlot);
    socketService.joinGyroChannel(
      'controller',
      `${participantPayload.name} (J${nextSlot})`,
      activeRoomId,
      {
        preferredSlot: nextSlot,
        gameId: gyroGameMode,
      }
    );
  }, [activeRoomId, gyroGameMode, participantPayload.name]);

  const sendCurrentFrame = useCallback(() => {
    if (!activeRoomId || !socketService.isConnected()) return;

    const maxDeg =
      sensitivityRef.current === 'pro' ? 22 : sensitivityRef.current === 'soft' ? 44 : 32;

    let targetSteer = 0;
    let targetPitch = 0;
    if (touchSteerRef.current !== null) {
      targetSteer = touchSteerRef.current;
      if (touchPitchRef.current !== null) {
        targetPitch = touchPitchRef.current;
      }
    } else if (gyroState === 'active') {
      const delta = rawTiltRef.current - zeroOffsetRef.current;
      const deadzone = 2.6;
      if (Math.abs(delta) > deadzone) {
        const adjusted = (Math.abs(delta) - deadzone) * Math.sign(delta);
        targetSteer = Math.max(-1, Math.min(1, adjusted / (maxDeg - deadzone)));
      }
      const zeroP = zeroPitchRef.current ?? 45;
      // Tilting top of phone forward lowers beta -> positive forward/upward pitch
      const deltaPitch = zeroP - rawPitchRef.current;
      if (Math.abs(deltaPitch) > 3.0) {
        targetPitch = Math.max(-1, Math.min(1, (deltaPitch - Math.sign(deltaPitch) * 3.0) / 26));
      }
    }

    filteredSteerRef.current = filteredSteerRef.current * 0.6 + targetSteer * 0.4;
    filteredPitchRef.current = filteredPitchRef.current * 0.62 + targetPitch * 0.38;
    const roundedSteer = Number(filteredSteerRef.current.toFixed(3));
    const roundedPitch = Number(filteredPitchRef.current.toFixed(3));
    setVisualSteer(roundedSteer);
    setVisualPitch(roundedPitch);

    if (Date.now() - lastSwingBurstAtRef.current > 240) {
      swingPowerRef.current = Math.max(0, swingPowerRef.current * 0.72);
    }
    const activeSwing = Number(
      Math.max(swingPowerRef.current, r1Ref.current ? 1.85 : r2Ref.current ? 1.15 : 0).toFixed(2)
    );
    setVisualSwing(activeSwing);

    const curveRoll = l1Ref.current && !l2Ref.current ? -1 : l2Ref.current && !l1Ref.current ? 1 : 0;

    seqRef.current += 1;
    socketService.sendGyroInput(
      {
        roomId: activeRoomId,
        playerSlot: mySlotRef.current,
        steer: roundedSteer,
        pitch: roundedPitch,
        swing: activeSwing,
        roll: curveRoll,
        gameMode: gyroGameMode,
        throttle: r2Ref.current ? 1 : 0,
        brake: l2Ref.current ? 1 : 0,
        nitro: r1Ref.current,
        handbrake: l1Ref.current,
        carSelect: carSelectHoldRef.current,
        autoGasToggle: autoGasToggleHoldRef.current,
        seq: seqRef.current,
        ts: Date.now(),
      },
      activeRoomId
    );
  }, [activeRoomId, gyroGameMode, gyroState]);

  useEffect(() => {
    if (!activeRoomId) return;
    const id = window.setInterval(sendCurrentFrame, 33);
    return () => window.clearInterval(id);
  }, [activeRoomId, sendCurrentFrame]);

  // Touch drag fallback directly inside center interactive dial
  const wheelDragStartXRef = useRef<number | null>(null);
  const wheelDragStartYRef = useRef<number | null>(null);
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    wheelDragStartXRef.current = e.clientX;
    wheelDragStartYRef.current = e.clientY;
    touchSteerRef.current = 0;
    touchPitchRef.current = 0;
  };
  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wheelDragStartXRef.current === null) return;
    const dx = e.clientX - wheelDragStartXRef.current;
    const dy = (wheelDragStartYRef.current ?? e.clientY) - e.clientY;
    touchSteerRef.current = Math.max(-1, Math.min(1, dx / 82));
    touchPitchRef.current = Math.max(-1, Math.min(1, dy / 68));
  };
  const handleWheelPointerUp = () => {
    wheelDragStartXRef.current = null;
    wheelDragStartYRef.current = null;
    touchSteerRef.current = null;
    touchPitchRef.current = null;
  };

  const buttonConfig = useMemo(() => {
    switch (gyroGameMode) {
      case 'gyrobowling':
        return {
          l1Title: 'EFECTO ↶',
          l1Sub: 'CURVA IZQ',
          l2Title: 'EFECTO ↷',
          l2Sub: 'CURVA DER',
          r1Title: '🎳 LANZAR',
          r1Sub: 'O AGITA',
          r2Title: '⚡ POTENCIA',
          r2Sub: 'TIRO FUERTE',
          dialTitle: 'BOLOS',
          accent: '#f59e0b',
        };
      case 'gyrotennis':
        return {
          l1Title: 'GLOBO',
          l1Sub: 'ELEVADO',
          l2Title: 'DEJADA',
          l2Sub: 'SUAVE RED',
          r1Title: '🔥 SMASH',
          r1Sub: 'REMATE PRO',
          r2Title: '🎾 GOLPEAR',
          r2Sub: 'RAQUETA',
          dialTitle: 'TENIS',
          accent: '#84cc16',
        };
      case 'gyrolab':
        return {
          l1Title: 'FRENAR',
          l1Sub: 'PRECISIÓN',
          l2Title: 'REINICIAR',
          l2Sub: 'CHECKPOINT',
          r1Title: '⚡ IMPULSO',
          r1Sub: 'SALTO / DASH',
          r2Title: '🎯 IMÁN',
          r2Sub: 'ESTABILIZAR',
          dialTitle: 'ESFERA 3D',
          accent: '#38bdf8',
        };
      case 'pingpong':
        return {
          l1Title: 'TOPSPIN',
          l1Sub: 'EFECTO',
          l2Title: 'DEJADA',
          l2Sub: 'CORTA RED',
          r1Title: 'SMASH',
          r1Sub: 'REMATE',
          r2Title: 'GOLPE',
          r2Sub: 'RAQUETA',
          dialTitle: 'PING PONG',
          accent: '#f43f5e',
        };
      case 'soccerpong':
        return {
          l1Title: 'SUBIR ▲',
          l1Sub: 'ARRIBA',
          l2Title: 'BAJAR ▼',
          l2Sub: 'ABAJO',
          r1Title: '⚡ POWER',
          r1Sub: 'TIRO FUERTE',
          r2Title: '⚽ BLOQUEO',
          r2Sub: 'DEFENSA',
          dialTitle: 'FÚTBOL PONG',
          accent: '#22c55e',
        };
      case 'gyrohockey':
        return {
          l1Title: 'FRENO',
          l1Sub: 'POSICIÓN',
          l2Title: 'DEFENDER',
          l2Sub: 'PORTERÍA',
          r1Title: `SMASH ${telemetry.nitroPct}%`,
          r1Sub: 'POTENCIA',
          r2Title: 'ATACAR',
          r2Sub: 'AVANZAR',
          dialTitle: 'HOCKEY',
          accent: '#22d3ee',
        };
      case 'gyrospace':
        return {
          l1Title: 'ESCUDO',
          l1Sub: 'BARRERA',
          l2Title: 'FRENAR',
          l2Sub: 'RETROCESO',
          r1Title: 'HIPER-LÁSER',
          r1Sub: 'RÁFAGA PRO',
          r2Title: 'LÁSER',
          r2Sub: 'DISPARO',
          dialTitle: 'GALAXIA',
          accent: '#a855f7',
        };
      case 'headsoccer':
        return {
          l1Title: 'SPRINT',
          l1Sub: 'VELOCIDAD',
          l2Title: 'BAJAR',
          l2Sub: 'AGACHAR',
          r1Title: 'CHUTAR',
          r1Sub: 'TIRO PUERTA',
          r2Title: 'SALTAR',
          r2Sub: 'CABEZAZO',
          dialTitle: 'FÚTBOL',
          accent: '#22c55e',
        };
      case 'penalty':
        return {
          l1Title: 'ROSCA ↶',
          l1Sub: 'EFECTO IZQ',
          l2Title: 'ROSCA ↷',
          l2Sub: 'EFECTO DER',
          r1Title: '⚽ CHUTAR',
          r1Sub: 'O PARAR',
          r2Title: '🎯 COLOCAR',
          r2Sub: 'RASO / CENTRO',
          dialTitle: 'PENALTIS',
          accent: '#10b981',
        };
      case 'hexgl':
        return {
          l1Title: 'ESTAB.',
          l1Sub: 'PRECISIÓN',
          l2Title: 'FRENO',
          l2Sub: 'REDUCIR',
          r1Title: '🔥 HIPER-TURBO',
          r1Sub: 'MANTENER',
          r2Title: '⚡ TURBO',
          r2Sub: 'ACELERAR',
          dialTitle: 'HEXGL 3D',
          accent: '#22d3ee',
        };
      case 'arkanoid':
        return {
          l1Title: 'SOLO IZQ',
          l1Sub: 'PRECISIÓN',
          l2Title: 'REINICIAR',
          l2Sub: 'PARTIDA',
          r1Title: '🔴 LÁSER PRO',
          r1Sub: 'RÁFAGA',
          r2Title: '🔫 DISPARAR',
          r2Sub: 'CAÑÓN PALA',
          dialTitle: 'ARKANOID',
          accent: '#3b82f6',
        };
      case 'invaders':
        return {
          l1Title: 'ESCUDO',
          l1Sub: 'CUBRIR',
          l2Title: 'REINICIAR',
          l2Sub: 'OLEADA',
          r1Title: '⚡ FUEGO RÁPIDO',
          r1Sub: 'MANTENER',
          r2Title: '🔫 LÁSER',
          r2Sub: 'DISPARAR',
          dialTitle: 'INVADERS',
          accent: '#10b981',
        };
      case 'pacman':
        return {
          l1Title: 'GIRO ◀',
          l1Sub: 'IZQUIERDA',
          l2Title: 'GIRO ▼',
          l2Sub: 'ABAJO',
          r1Title: 'GIRO ▲',
          r1Sub: 'ARRIBA',
          r2Title: 'GIRO ▶',
          r2Sub: 'DERECHA',
          dialTitle: 'PAC-MAN',
          accent: '#facc15',
        };
      case 'bomberman':
        return {
          l1Title: 'PASO ◀',
          l1Sub: 'IZQUIERDA',
          l2Title: 'REINICIAR',
          l2Sub: 'ARENA',
          r1Title: '💣 BOMBA',
          r1Sub: 'COLOCAR',
          r2Title: '💣 BOMBA EX',
          r2Sub: 'PULSAR',
          dialTitle: 'BOMBER',
          accent: '#f97316',
        };
      case 'flappy':
        return {
          l1Title: 'ALETEAR',
          l1Sub: 'SALTO SUAVE',
          l2Title: 'REINICIAR',
          l2Sub: 'VUELO',
          r1Title: '🐦 IMPULSO',
          r1Sub: 'AGITA O TOCA',
          r2Title: '🐦 ALETEAR',
          r2Sub: 'TOCAR / AGITAR',
          dialTitle: 'CLUMSY',
          accent: '#38bdf8',
        };
      default:
        return {
          l1Title: 'DRIFT',
          l1Sub: 'DERRAPE',
          l2Title: 'FRENO',
          l2Sub: 'ATRÁS',
          r1Title: `NITRO ${telemetry.nitroPct}%`,
          r1Sub: 'TURBO',
          r2Title: 'GAS',
          r2Sub: 'ACELERAR',
          dialTitle: 'GP 3D',
          accent: '#7c3aed',
        };
    }
  }, [gyroGameMode, telemetry.nitroPct]);

  if (!activeRoomId) {
    return (
      <div className="min-h-[100dvh] bg-[#070910] text-white flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-sm rounded-3xl bg-[#10131e] border border-cyan-400/25 p-6 space-y-5 text-center shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-left">
              <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight">Mando Vertical Gyro</h1>
                <p className="text-[11px] text-zinc-400">
                  {urlPreferredSlot ? `Jugador ${urlPreferredSlot}` : 'Emparejamiento automático'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="min-w-11 min-h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center cursor-pointer"
              aria-label="Volver"
            >
              <RiffanBackIcon size={18} />
            </button>
          </div>

          <div className="rounded-2xl bg-[#070a14] border border-white/10 p-5 space-y-3">
            <RefreshCw className="w-9 h-9 text-cyan-300 mx-auto animate-spin" />
            <p className="text-sm font-bold text-white leading-snug">{searchingStatus}</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No necesitas introducir ningún código. En cuanto entres en un juego en tu TV o navegador, este móvil se enlazará solo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSearchTick((n) => n + 1)}
            className="w-full min-h-12 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] font-bold text-sm text-white cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Buscar partida ahora</span>
          </button>
        </div>
      </div>
    );
  }

  const rpmLitCount = Math.round((telemetry.rpmPct / 100) * 8);
  const slotBorderClass =
    mySlot === 2
      ? 'bg-rose-600/25 border-rose-400/60 text-rose-200'
      : 'bg-cyan-600/25 border-cyan-400/60 text-cyan-200';

  const modeBadgeLabel =
    gyroGameMode === 'penalty'
      ? '⚽ Penaltis'
      : gyroGameMode === 'pingpong'
      ? '🏓 Ping Pong'
      : gyroGameMode === 'soccerpong'
      ? '⚽ Fútbol Pong'
      : gyroGameMode === 'gyrobowling'
      ? '🎳 Bolos'
      : gyroGameMode === 'gyrotennis'
      ? '🎾 Tenis'
      : gyroGameMode === 'gyrolab'
      ? '🧿 Laberinto'
      : gyroGameMode === 'gyrohockey'
      ? '🏒 Hockey'
      : gyroGameMode === 'gyrospace'
      ? '🚀 Galaxia'
      : gyroGameMode === 'headsoccer'
      ? '🥅 Fútbol'
      : gyroGameMode === 'hexgl'
      ? '🛸 HexGL 3D'
      : gyroGameMode === 'arkanoid'
      ? '🧱 Arkanoid'
      : gyroGameMode === 'invaders'
      ? '👾 Invaders'
      : gyroGameMode === 'pacman'
      ? '🟡 Pac-Man'
      : gyroGameMode === 'bomberman'
      ? '💣 Bomberman'
      : gyroGameMode === 'flappy'
      ? '🐦 Clumsy'
      : '🏎️ GP3D';

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface h-[100dvh] w-full max-w-md mx-auto bg-[#06080f] text-white flex flex-col justify-between p-3 select-none touch-none overflow-hidden"
    >
      {/* Compact Vertical Top Bar */}
      <header className="flex items-center justify-between gap-1.5 rounded-2xl bg-[#0f1320] border border-white/10 px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Salir"
          >
            <RiffanBackIcon size={16} />
          </button>

          {wsConnected ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}

          <button
            type="button"
            onClick={handleSwitchPreferredSlot}
            className={`px-2 py-1 rounded-lg border text-[11px] font-black cursor-pointer shrink-0 ${slotBorderClass}`}
            title="Cambiar entre Jugador 1 y Jugador 2"
          >
            J{mySlot} {mySlot === 1 ? 'AZUL' : 'ROJO'}
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setGyroGameMode((m) => {
                const idx = GYRO_MODE_ORDER.indexOf(m);
                return GYRO_MODE_ORDER[(idx + 1) % GYRO_MODE_ORDER.length];
              });
            }}
            className="h-9 px-2.5 rounded-xl bg-[#7C3AED]/25 hover:bg-[#7C3AED]/40 border border-[#7C3AED]/50 text-[11px] font-black text-purple-200 cursor-pointer whitespace-nowrap"
          >
            {modeBadgeLabel}
          </button>

          <button
            type="button"
            onClick={handleCalibrate}
            className="w-9 h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center cursor-pointer"
            title="Calibrar centro"
            aria-label="Calibrar centro"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-300" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSensitivity((s) => (s === 'soft' ? 'normal' : s === 'normal' ? 'pro' : 'soft'));
            }}
            className="h-9 px-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            aria-label="Sensibilidad"
          >
            <SlidersHorizontal className="w-3 h-3 text-[#A78BFA]" />
            <span>{sensitivity === 'soft' ? 'Suave' : sensitivity === 'pro' ? 'Pro' : 'Norm'}</span>
          </button>

          <button
            type="button"
            onClick={() => setPhoneSoundMuted((m) => !m)}
            className="w-9 h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center cursor-pointer"
            aria-label="Sonido móvil"
          >
            {phoneSoundMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
            )}
          </button>
        </div>
      </header>

      {/* Clean Telemetry / Permission Bar */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1 py-1 shrink-0 tabular-nums">
        <span>
          Sala <strong className="text-zinc-200">{activeRoomId.toUpperCase()}</strong>
        </span>
        {typeof telemetry.scoreP1 === 'number' ? (
          <span className="font-mono font-black text-white">
            <span className="text-cyan-300">J1 {telemetry.scoreP1}</span>
            {' · '}
            <span className="text-rose-400">{telemetry.scoreP2 ?? 0} J2</span>
          </span>
        ) : gyroGameMode === 'racing3d' ? (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 8 }, (_, idx) => (
                <span
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full ${
                    idx < rpmLitCount
                      ? idx >= 6
                        ? 'bg-rose-500'
                        : idx >= 4
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                      : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
            <span className="font-mono font-black text-cyan-300">{telemetry.speedKmh} KM/H</span>
          </div>
        ) : (
          <span className="font-semibold text-zinc-300">
            {gyroState === 'active' ? 'Giroscopio Vertical Activo' : 'Control Táctil / Sensor'}
          </span>
        )}
      </div>

      {gyroGameMode === 'racing3d' && (
        <div className="my-1 flex items-center gap-1.5 overflow-x-auto pb-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setPhoneAutoGas((v) => !v);
              autoGasToggleHoldRef.current = true;
              sendCurrentFrame();
              window.setTimeout(() => {
                autoGasToggleHoldRef.current = false;
              }, 160);
            }}
            className={`h-8 px-2.5 rounded-xl border text-[11px] font-black shrink-0 flex items-center gap-1 cursor-pointer ${
              phoneAutoGas
                ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100'
                : 'bg-[#0f1320] border-white/15 text-zinc-300'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{phoneAutoGas ? 'Auto-Gas ON' : 'Auto-Gas'}</span>
          </button>
          {RACING_CAR_CATALOG.map((car) => {
            const active = car.id === selectedCarId;
            return (
              <button
                key={car.id}
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setSelectedCarId(car.id);
                  selectedCarRef.current = car.id;
                  carSelectHoldRef.current = car.id;
                  sendCurrentFrame();
                  window.setTimeout(() => {
                    carSelectHoldRef.current = undefined;
                  }, 180);
                }}
                className={`h-8 px-2.5 rounded-xl border text-[10px] font-black shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  active
                    ? 'bg-cyan-500/25 border-cyan-400 text-white'
                    : 'bg-[#0f1320] border-white/10 text-zinc-400'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: car.cssColor }}
                />
                <CarFront className="w-3 h-3 shrink-0" />
                <span>{car.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      {gyroState === 'idle' && (
        <div className="my-1 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/60 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
            <Compass className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>Activa los sensores del móvil</span>
          </div>
          <button
            type="button"
            onClick={() => void handleActivateGyro()}
            className="h-8 px-3 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white shrink-0 cursor-pointer"
          >
            Activar
          </button>
        </div>
      )}

      {/* CENTER PORTRAIT GYRO TELEMETRY & DRAG ZONE */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 py-1">
        <div
          onPointerDown={handleWheelPointerDown}
          onPointerMove={handleWheelPointerMove}
          onPointerUp={handleWheelPointerUp}
          onPointerCancel={handleWheelPointerUp}
          onLostPointerCapture={handleWheelPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          className="game-touch-btn relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl bg-[#0b101d] border border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-inner overflow-hidden"
        >
          {gyroGameMode === 'gyrobowling' ? (
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <polygon points="56,22 144,22 174,184 26,184" fill="#92400e" stroke="#f59e0b" strokeWidth="2.5" />
              <line x1="76" y1="22" x2="62" y2="184" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
              <line x1="100" y1="22" x2="100" y2="184" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
              <line x1="124" y1="22" x2="138" y2="184" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
              {/* Mini 10 pins */}
              {[
                [85, 34], [95, 34], [105, 34], [115, 34],
                [90, 44], [100, 44], [110, 44],
                [95, 54], [105, 54],
                [100, 64],
              ].map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r="3.5" fill="#f8fafc" stroke="#dc2626" strokeWidth="1.2" />
              ))}
              {/* Hook trajectory */}
              <path
                d={`M ${100 + visualSteer * 46} 152 Q ${100 + visualSteer * 46 + (l1Pressed ? -28 : l2Pressed ? 28 : 0)} 98 ${100 + visualSteer * 24} 64`}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeDasharray="5 4"
              />
              {/* Bowling Ball */}
              <circle
                cx={100 + visualSteer * 46}
                cy={152 - visualPitch * 14}
                r={visualSwing > 0.7 ? 20 : 17}
                fill={mySlot === 2 ? '#e11d48' : '#0284c7'}
                stroke="#f8fafc"
                strokeWidth="2.5"
              />
              <text x="100" y="195" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="900" fontFamily="monospace">
                APUNTA INCLINANDO · AGITA PARA LANZAR
              </text>
            </svg>
          ) : gyroGameMode === 'soccerpong' ? (
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <rect x="24" y="20" width="152" height="160" rx="10" fill="#4f9d29" stroke="#cbd5e1" strokeWidth="5" />
              <line x1="100" y1="20" x2="100" y2="180" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" />
              <circle cx="100" cy="100" r="24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" />
              <rect
                x={mySlot === 2 ? 148 : 38}
                y={80 - visualPitch * 46 + visualSteer * 32}
                width="14"
                height="40"
                rx="4"
                fill={mySlot === 2 ? '#ef4444' : '#2563eb'}
                stroke="#f8fafc"
                strokeWidth="2.5"
              />
              <circle cx="100" cy="100" r="10" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
              <text x="100" y="194" textAnchor="middle" fill="#bbf7d0" fontSize="10" fontWeight="900" fontFamily="monospace">
                INCLINA ARRIBA/ABAJO · PALA J{mySlot}
              </text>
            </svg>
          ) : gyroGameMode === 'gyrotennis' || gyroGameMode === 'pingpong' ? (
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {gyroGameMode === 'gyrotennis' && (
                <>
                  <rect x="26" y="22" width="148" height="156" rx="8" fill="#166534" stroke="#f8fafc" strokeWidth="2.5" />
                  <line x1="26" y1="100" x2="174" y2="100" stroke="#e2e8f0" strokeWidth="3" />
                  <line x1="46" y1="22" x2="46" y2="178" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                  <line x1="154" y1="22" x2="154" y2="178" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                </>
              )}
              <g
                transform={`translate(${visualSteer * 44}, ${-visualPitch * 22}) rotate(${Math.round(visualSteer * 38)} 100 105)`}
              >
                <rect x="92" y="138" width="16" height="44" rx="6" fill="#78350f" stroke="#d97706" strokeWidth="2.5" />
                <ellipse
                  cx="100"
                  cy="92"
                  rx="46"
                  ry="52"
                  fill={gyroGameMode === 'gyrotennis' ? 'rgba(132,204,22,0.35)' : mySlot === 2 ? '#e11d48' : '#0284c7'}
                  stroke="#f8fafc"
                  strokeWidth="4"
                />
                <text x="100" y="96" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="900" fontFamily="monospace">
                  {gyroGameMode === 'gyrotennis' ? 'TENIS J' + mySlot : 'PING PONG J' + mySlot}
                </text>
              </g>
            </svg>
          ) : gyroGameMode === 'gyrolab' ? (
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <g
                style={{
                  transform: `perspective(320px) rotateX(${Math.round(visualPitch * 18)}deg) rotateY(${Math.round(visualSteer * 18)}deg)`,
                  transformOrigin: '100px 100px',
                }}
              >
                <rect x="24" y="24" width="152" height="152" rx="14" fill="#1e293b" stroke="#38bdf8" strokeWidth="3" />
                <rect x="24" y="64" width="96" height="10" rx="4" fill="#64748b" />
                <rect x="80" y="122" width="96" height="10" rx="4" fill="#64748b" />
                <circle cx="52" cy="144" r="11" fill="#020617" stroke="#f43f5e" strokeWidth="2" />
                <circle cx="148" cy="48" r="11" fill="#020617" stroke="#f43f5e" strokeWidth="2" />
                <circle cx="150" cy="152" r="11" fill="#10b981" opacity="0.85" />
              </g>
              <circle
                cx={100 + visualSteer * 56}
                cy={100 - visualPitch * 56}
                r="13"
                fill={mySlot === 2 ? '#fb7185' : '#38bdf8'}
                stroke="#f8fafc"
                strokeWidth="3"
              />
            </svg>
          ) : gyroGameMode === 'penalty' ? (
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <rect x="20" y="34" width="160" height="86" rx="6" fill="rgba(16,185,129,0.08)" stroke="#f8fafc" strokeWidth="4" />
              <line x1="73" y1="34" x2="73" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
              <line x1="127" y1="34" x2="127" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
              <circle
                cx={100 + visualSteer * 66}
                cy={78 - visualPitch * 32}
                r="11"
                fill="none"
                stroke={mySlot === 2 ? '#fb7185' : '#22d3ee'}
                strokeWidth="3"
              />
              <circle cx={100 + visualSteer * 66} cy={78 - visualPitch * 32} r="3" fill="#facc15" />
              {(l1Pressed || l2Pressed) && (
                <path
                  d={`M 100 156 Q ${l1Pressed ? 48 : 152} 110 ${100 + visualSteer * 66} ${78 - visualPitch * 32}`}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="2.8"
                  strokeDasharray="5 4"
                />
              )}
              <circle
                cx="100"
                cy="158"
                r={visualSwing > 0.7 ? 24 : 21}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="2.5"
              />
              <polygon points="100,147 109,154 106,165 94,165 91,154" fill="#18181b" />
            </svg>
          ) : gyroGameMode === 'pacman' || gyroGameMode === 'bomberman' ? (
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <circle cx="100" cy="100" r="72" fill="#0f172a" stroke={buttonConfig.accent} strokeWidth="3" />
              <line x1="100" y1="36" x2="100" y2="164" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
              <line x1="36" y1="100" x2="164" y2="100" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
              <circle
                cx={100 + visualSteer * 48}
                cy={100 - visualPitch * 48}
                r="18"
                fill={buttonConfig.accent}
                stroke="#ffffff"
                strokeWidth="3"
              />
              <text x="100" y="188" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="900" fontFamily="monospace">
                INCLINA EN 4 DIRECCIONES
              </text>
            </svg>
          ) : (
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full drop-shadow-[0_14px_30px_rgba(124,58,237,0.3)] transition-transform duration-75"
              style={{ transform: `rotate(${Math.round(visualSteer * 58)}deg)` }}
            >
              <circle cx="100" cy="100" r="78" fill="none" stroke="#1e293b" strokeWidth="18" />
              <circle
                cx="100"
                cy="100"
                r="78"
                fill="none"
                stroke={mySlot === 2 ? '#f43f5e' : buttonConfig.accent}
                strokeWidth="5"
                strokeDasharray="115 410"
                strokeDashoffset="55"
              />
              <rect x="94" y="14" width="12" height="16" rx="4" fill="#22d3ee" />
              <rect x="26" y="92" width="148" height="16" rx="8" fill="#1e293b" />
              <rect x="90" y="95" width="20" height="76" rx="8" fill="#1e293b" />
              <circle
                cx="100"
                cy="100"
                r="30"
                fill="#0f172a"
                stroke={mySlot === 2 ? '#fb7185' : '#38bdf8'}
                strokeWidth="3"
              />
              <text x="100" y="98" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="900" fontFamily="monospace">
                {buttonConfig.dialTitle}
              </text>
              <text
                x="100"
                y="114"
                textAnchor="middle"
                fill={mySlot === 2 ? '#fda4af' : '#67e8f9'}
                fontSize="10"
                fontWeight="900"
                fontFamily="monospace"
              >
                J{mySlot}
              </text>
            </svg>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 text-center">
          <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">
            {gyroGameMode === 'gyrolab' || gyroGameMode === 'pacman' || gyroGameMode === 'bomberman'
              ? 'Inclina el móvil en 2 ejes (X/Y) o desliza en el visor'
              : gyroGameMode === 'gyrobowling'
              ? 'Inclina lateralmente para apuntar y agita o pulsa Lanzar'
              : gyroGameMode === 'flappy'
              ? 'Agita el móvil o pulsa Aletear para volar'
              : gyroGameMode === 'gyrotennis' || gyroGameMode === 'pingpong'
              ? 'Mueve el móvil en vertical o agita para rematar'
              : gyroGameMode === 'soccerpong'
              ? 'Inclina el móvil o desliza arriba/abajo para mover tu pala'
              : pickLang(lang, {
                  es: 'Inclina el móvil en vertical o desliza en el visor',
                  ca: 'Inclina el mòbil en vertical o llisca al visor',
                  en: 'Tilt phone upright or drag inside the dial',
                })}
          </span>
        </div>
      </div>

      {/* PORTRAIT BOTTOM THUMB ZONE: 2x2 ACTION BUTTON GRID */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0 pb-1">
        <button
          type="button"
          data-side="left-1"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            l1Ref.current = true;
            setL1Pressed(true);
            triggerHaptic('light');
            sendCurrentFrame();
          }}
          onPointerUp={() => {
            l1Ref.current = false;
            setL1Pressed(false);
            sendCurrentFrame();
          }}
          onPointerCancel={() => {
            l1Ref.current = false;
            setL1Pressed(false);
          }}
          onLostPointerCapture={() => {
            l1Ref.current = false;
            setL1Pressed(false);
          }}
          className={`game-touch-btn min-h-14 py-2.5 px-3 rounded-2xl border-2 font-black text-xs tracking-wide flex flex-col items-center justify-center transition-transform cursor-pointer ${
            l1Pressed
              ? 'bg-amber-500/35 border-amber-400 text-amber-100 scale-95'
              : 'bg-[#121625] border-white/15 text-amber-300'
          }`}
        >
          <span>{buttonConfig.l1Title}</span>
          <span className="text-[10px] font-semibold opacity-75">{buttonConfig.l1Sub}</span>
        </button>

        <button
          type="button"
          data-side="right-1"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            r1Ref.current = true;
            setR1Pressed(true);
            triggerHaptic('success');
            sendCurrentFrame();
          }}
          onPointerUp={() => {
            r1Ref.current = false;
            setR1Pressed(false);
            sendCurrentFrame();
          }}
          onPointerCancel={() => {
            r1Ref.current = false;
            setR1Pressed(false);
          }}
          onLostPointerCapture={() => {
            r1Ref.current = false;
            setR1Pressed(false);
          }}
          className={`game-touch-btn min-h-14 py-2.5 px-3 rounded-2xl border-2 font-black text-xs tracking-wide flex flex-col items-center justify-center transition-transform cursor-pointer ${
            r1Pressed
              ? 'bg-cyan-500/40 border-cyan-300 text-white scale-95'
              : 'bg-[#0d1926] border-cyan-500/45 text-cyan-200'
          }`}
        >
          <span className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-cyan-300" />
            {buttonConfig.r1Title}
          </span>
          <span className="text-[10px] font-semibold opacity-75">{buttonConfig.r1Sub}</span>
        </button>

        <button
          type="button"
          data-side="left-2"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            l2Ref.current = true;
            setL2Pressed(true);
            triggerHaptic('medium');
            sendCurrentFrame();
          }}
          onPointerUp={() => {
            l2Ref.current = false;
            setL2Pressed(false);
            sendCurrentFrame();
          }}
          onPointerCancel={() => {
            l2Ref.current = false;
            setL2Pressed(false);
          }}
          onLostPointerCapture={() => {
            l2Ref.current = false;
            setL2Pressed(false);
          }}
          className={`game-touch-btn min-h-16 py-3 px-3 rounded-3xl border-2 font-black text-sm tracking-wider flex flex-col items-center justify-center transition-transform cursor-pointer ${
            l2Pressed
              ? 'bg-rose-600/45 border-rose-400 text-white scale-95'
              : 'bg-[#15101b] border-rose-500/45 text-rose-200'
          }`}
        >
          <span>{buttonConfig.l2Title}</span>
          <span className="text-[10px] font-semibold opacity-75">{buttonConfig.l2Sub}</span>
        </button>

        <button
          type="button"
          data-side="right-2"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            r2Ref.current = true;
            setR2Pressed(true);
            triggerHaptic('light');
            sendCurrentFrame();
          }}
          onPointerUp={() => {
            r2Ref.current = false;
            setR2Pressed(false);
            sendCurrentFrame();
          }}
          onPointerCancel={() => {
            r2Ref.current = false;
            setR2Pressed(false);
          }}
          onLostPointerCapture={() => {
            r2Ref.current = false;
            setR2Pressed(false);
          }}
          className={`game-touch-btn min-h-16 py-3 px-3 rounded-3xl border-2 font-black text-sm tracking-wider flex flex-col items-center justify-center transition-transform cursor-pointer ${
            r2Pressed
              ? 'bg-emerald-500/45 border-emerald-300 text-white scale-95'
              : 'bg-[#0c1b18] border-emerald-500/50 text-emerald-200'
          }`}
        >
          <span>{buttonConfig.r2Title}</span>
          <span className="text-[10px] font-semibold opacity-75">{buttonConfig.r2Sub}</span>
        </button>
      </div>
    </div>
  );
};
