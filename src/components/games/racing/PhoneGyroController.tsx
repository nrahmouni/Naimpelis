import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Flame,
  Gauge,
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
type GyroControllerGame =
  | 'racing3d'
  | 'gyrohockey'
  | 'gyrospace'
  | 'pingpong'
  | 'headsoccer'
  | 'penalty';

function parseGyroControllerGameFromUrl(): GyroControllerGame {
  if (typeof window === 'undefined') return 'racing3d';
  const raw = (new URLSearchParams(window.location.search).get('game') || '').trim().toLowerCase();
  if (raw === 'gyrohockey' || raw === 'air-hockey') return 'gyrohockey';
  if (raw === 'gyrospace' || raw === 'galaxia-gyro') return 'gyrospace';
  if (raw === 'pingpong' || raw === 'ping-pong' || raw === 'tenis') return 'pingpong';
  if (raw === 'headsoccer' || raw === 'cabezones') return 'headsoccer';
  if (raw === 'penalty' || raw === 'penaltis' || raw === 'penalties') return 'penalty';
  return 'racing3d';
}

function getScreenAngleDeg(): number {
  if (typeof window === 'undefined') return 0;
  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return window.screen.orientation.angle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

function normalizeWheelTiltDeg(ev: DeviceOrientationEvent): { roll: number; pitch: number } {
  const beta = typeof ev.beta === 'number' ? ev.beta : 0;
  const gamma = typeof ev.gamma === 'number' ? ev.gamma : 0;
  const angle = ((getScreenAngleDeg() % 360) + 360) % 360;
  if (angle === 90) return { roll: beta, pitch: -gamma };
  if (angle === 270) return { roll: -beta, pitch: gamma };
  if (angle === 180) return { roll: -gamma, pitch: -beta };
  return { roll: gamma, pitch: beta };
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
    if (tag === 'pingpong_hit') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.055);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } else if (tag === 'pingpong_point' || tag === 'goal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(784, now + 0.07);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (tag === 'hockey_hit' || tag === 'penalty_save' || tag === 'penalty_kick') {
      osc.type = tag === 'penalty_kick' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(tag === 'penalty_kick' ? 190 : 420, now);
      osc.frequency.exponentialRampToValueAtTime(tag === 'penalty_kick' ? 58 : 180, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } else if (tag === 'penalty_post') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.25);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.27);
    }
  } catch {
    // ignore WebAudio restrictions
  }
}

async function tryLockLandscape(): Promise<void> {
  try {
    const ori = window.screen?.orientation as unknown as {
      lock?: (orientation: 'landscape' | 'landscape-primary') => Promise<void>;
    };
    if (ori && typeof ori.lock === 'function') {
      await ori.lock('landscape').catch(() => {});
    }
  } catch {
    // desktop / iOS Safari does not allow screen.orientation.lock
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

  const [roomInput, setRoomInput] = useState(cleanInitialRoom);
  const [activeRoomId, setActiveRoomId] = useState(cleanInitialRoom);
  const [gyroGameMode, setGyroGameMode] = useState<GyroControllerGame>(() => parseGyroControllerGameFromUrl());
  const [wsConnected, setWsConnected] = useState(false);
  const [mySlot, setMySlot] = useState<1 | 2>(1);
  const mySlotRef = useRef<1 | 2>(1);
  mySlotRef.current = mySlot;

  const [gyroState, setGyroState] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle');
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('normal');
  const [phoneSoundMuted, setPhoneSoundMuted] = useState(false);
  const phoneSoundMutedRef = useRef(false);
  phoneSoundMutedRef.current = phoneSoundMuted;

  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth && window.innerWidth < 900 : false
  );
  const [portraitDismissed, setPortraitDismissed] = useState(false);

  const [visualSteer, setVisualSteer] = useState(0);
  const [visualPitch, setVisualPitch] = useState(0);
  const [visualSwing, setVisualSwing] = useState(0);

  // Strictly 4 lateral buttons max: 2 Left (L1 top, L2 bottom) + 2 Right (R1 top, R2 bottom)
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
  const rawPitchRef = useRef(0);
  const zeroOffsetRef = useRef(0);
  const zeroPitchRef = useRef(0);
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

  // Track device portrait/landscape orientation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => {
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      setIsPortrait(portrait);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

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

    const alreadyInRoom = socketService.getActiveRoomId() === activeRoomId && socketService.isConnected();
    if (!alreadyInRoom) {
      socketService.connect(activeRoomId, participantPayload, `Sala ${activeRoomId.toUpperCase()}`);
    } else {
      setWsConnected(true);
      socketService.joinGyroChannel('controller', `${participantPayload.name} (Mando)`, activeRoomId, {
        gameId: gyroGameMode,
      });
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'CONNECTION_STATUS') {
        const up = Boolean(ev.payload.connected);
        setWsConnected(up);
        if (up) {
          socketService.joinGyroChannel('controller', `${participantPayload.name} (Mando)`, activeRoomId, {
            gameId: gyroGameMode,
          });
        }
      } else if (ev.type === 'ROOM_STATE') {
        setWsConnected(true);
        socketService.joinGyroChannel('controller', `${participantPayload.name} (Mando)`, activeRoomId, {
          gameId: gyroGameMode,
        });
      } else if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers) ? ev.payload.controllers : [];
        const mine = list.find((c) => c.userId === participantPayload.id);
        if (mine && (mine.slot === 1 || mine.slot === 2)) {
          setMySlot(mine.slot);
        } else if (list.length >= 2) {
          setMySlot(2);
        }
      } else if (ev.type === 'RACING_TELEMETRY_RELAY') {
        const p = ev.payload;
        if (p.targetSlot && p.targetSlot !== mySlotRef.current) {
          // Still update scoreboard if present, skip targeted haptics
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
  }, [activeRoomId, gyroGameMode, participantPayload]);

  // DeviceOrientation + DeviceMotion (Accelerometer swing/smash) listeners
  useEffect(() => {
    if (gyroState !== 'active' || typeof window === 'undefined') return;

    const onOrientation = (ev: DeviceOrientationEvent) => {
      const { roll, pitch } = normalizeWheelTiltDeg(ev);
      rawTiltRef.current = roll;
      rawPitchRef.current = pitch;
    };

    const onMotion = (ev: DeviceMotionEvent) => {
      const acc = ev.acceleration || ev.accelerationIncludingGravity;
      if (!acc) return;
      const ax = acc.x || 0;
      const ay = acc.y || 0;
      const az = acc.z || 0;
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);
      const net = ev.acceleration ? mag : Math.abs(mag - 9.81);
      if (net > 4.2) {
        const normalized = Math.min(3, (net - 3.5) / 5.5);
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

  // Auto-enable on Android / non-iOS browsers if DeviceOrientation exists without requestPermission
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
    void tryLockLandscape();
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
  }, []);

  const handleSwitchPreferredSlot = useCallback(() => {
    if (!activeRoomId || !socketService.isConnected()) return;
    const nextSlot: 1 | 2 = mySlotRef.current === 1 ? 2 : 1;
    triggerHaptic('medium');
    setMySlot(nextSlot);
    socketService.joinGyroChannel('controller', `${participantPayload.name} (J${nextSlot})`, activeRoomId, {
      preferredSlot: nextSlot,
      gameId: gyroGameMode,
    });
  }, [activeRoomId, gyroGameMode, participantPayload.name]);

  const sendCurrentFrame = useCallback(() => {
    if (!activeRoomId || !socketService.isConnected()) return;

    const maxDeg =
      sensitivityRef.current === 'pro' ? 24 : sensitivityRef.current === 'soft' ? 48 : 34;

    let targetSteer = 0;
    let targetPitch = 0;
    if (touchSteerRef.current !== null) {
      targetSteer = touchSteerRef.current;
      if (touchPitchRef.current !== null) {
        targetPitch = touchPitchRef.current;
      }
    } else if (gyroState === 'active') {
      const delta = rawTiltRef.current - zeroOffsetRef.current;
      const deadzone = 2.8;
      if (Math.abs(delta) > deadzone) {
        const adjusted = (Math.abs(delta) - deadzone) * Math.sign(delta);
        targetSteer = Math.max(-1, Math.min(1, adjusted / (maxDeg - deadzone)));
      }
      const deltaPitch = rawPitchRef.current - zeroPitchRef.current;
      if (Math.abs(deltaPitch) > 3.5) {
        targetPitch = Math.max(-1, Math.min(1, (deltaPitch - Math.sign(deltaPitch) * 3.5) / 30));
      }
    }

    filteredSteerRef.current = filteredSteerRef.current * 0.62 + targetSteer * 0.38;
    filteredPitchRef.current = filteredPitchRef.current * 0.65 + targetPitch * 0.35;
    const roundedSteer = Number(filteredSteerRef.current.toFixed(3));
    const roundedPitch = Number(filteredPitchRef.current.toFixed(3));
    setVisualSteer(roundedSteer);
    setVisualPitch(roundedPitch);

    // Decay accelerometer swing burst
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
        seq: seqRef.current,
        ts: Date.now(),
      },
      activeRoomId
    );
  }, [activeRoomId, gyroGameMode, gyroState]);

  // 30Hz (33ms) continuous gyro & button telemetry stream
  useEffect(() => {
    if (!activeRoomId) return;
    const id = window.setInterval(sendCurrentFrame, 33);
    return () => window.clearInterval(id);
  }, [activeRoomId, sendCurrentFrame]);

  // Touch drag fallback directly on the center interactive dial
  const wheelDragStartXRef = useRef<number | null>(null);
  const wheelDragStartYRef = useRef<number | null>(null);
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    wheelDragStartXRef.current = e.clientX;
    wheelDragStartYRef.current = e.clientY;
    touchSteerRef.current = 0;
    touchPitchRef.current = 0;
  };
  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wheelDragStartXRef.current === null) return;
    const dx = e.clientX - wheelDragStartXRef.current;
    const dy = (wheelDragStartYRef.current ?? e.clientY) - e.clientY;
    touchSteerRef.current = Math.max(-1, Math.min(1, dx / 88));
    touchPitchRef.current = Math.max(-1, Math.min(1, dy / 72));
  };
  const handleWheelPointerUp = () => {
    wheelDragStartXRef.current = null;
    wheelDragStartYRef.current = null;
    touchSteerRef.current = null;
    touchPitchRef.current = null;
  };

  const buttonConfig = useMemo(() => {
    switch (gyroGameMode) {
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
          r1Sub: 'RAFAGA PRO',
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
          r2Sub: 'CENTRO / RASO',
          dialTitle: 'PENALTIS',
          accent: '#10b981',
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
        <div className="w-full max-w-md rounded-3xl bg-[#10131e] border border-white/10 p-6 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA]">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">Mando Horizontal Pro</h1>
                <p className="text-xs text-zinc-400">Volante / Raqueta 2P sincronizado con tu TV</p>
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = roomInput.trim().toLowerCase();
              if (!clean) return;
              const resolved = /^\d{4}$/.test(clean) ? `race-${clean}` : clean;
              void tryLockLandscape();
              setActiveRoomId(resolved);
            }}
            className="space-y-3"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Código de Sala o Código TV (4 dígitos)
            </label>
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Ej: race-4812 o k8x4"
              className="w-full min-h-12 px-4 rounded-2xl bg-[#070910] border border-white/15 text-base font-mono font-bold text-white focus:outline-none focus:border-[#7C3AED]"
            />
            <button
              type="submit"
              disabled={!roomInput.trim()}
              className="w-full min-h-12 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] disabled:opacity-45 font-bold text-sm cursor-pointer transition-colors"
            >
              Conectar en Horizontal
            </button>
          </form>
        </div>
      </div>
    );
  }

  const rpmLitCount = Math.round((telemetry.rpmPct / 100) * 8);
  const slotBorderClass =
    mySlot === 2
      ? 'bg-rose-600/25 border-rose-400/60 text-rose-200'
      : 'bg-cyan-600/25 border-cyan-400/60 text-cyan-200';

  return (
    <div className="relative h-[100dvh] w-full bg-[#06080f] text-white flex flex-col justify-between p-2.5 sm:p-4 select-none touch-none overflow-hidden">
      {/* Landscape Orientation Guard Overlay when held upright on a phone */}
      {isPortrait && !portraitDismissed && (
        <div className="fixed inset-0 z-50 bg-[#05070e]/96 flex flex-col items-center justify-center p-6 text-center gap-5">
          <div className="w-20 h-14 rounded-2xl border-2 border-cyan-400 flex items-center justify-center rotate-90 shadow-[0_0_25px_rgba(34,211,238,0.35)]">
            <Smartphone className="w-8 h-8 text-cyan-300" />
          </div>
          <div className="space-y-1.5 max-w-xs">
            <h2 className="text-lg font-black tracking-tight text-white">
              {pickLang(lang, {
                es: 'Gira el móvil en horizontal',
                ca: 'Gira el mòbil en horitzontal',
                en: 'Rotate phone to landscape',
              })}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Mando ergonómico horizontal: sujetar con ambas manos (2 botones a la izquierda y 2 a la derecha).
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button
              type="button"
              onClick={() => {
                void tryLockLandscape();
                void handleActivateGyro();
              }}
              className="w-full min-h-11 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
            >
              Activar Horizontal y Sensores
            </button>
            <button
              type="button"
              onClick={() => setPortraitDismissed(true)}
              className="w-full min-h-10 rounded-xl bg-white/[0.06] text-[11px] font-bold text-zinc-300 cursor-pointer"
            >
              Continuar así
            </button>
          </div>
        </div>
      )}

      {/* Compact Top Telemetry Strip */}
      <header className="flex items-center justify-between gap-2 rounded-2xl bg-[#0f1320] border border-white/10 px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Salir"
          >
            <RiffanBackIcon size={16} />
          </button>

          <div className="flex items-center gap-1.5 text-xs font-extrabold truncate">
            {wsConnected ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="truncate">{activeRoomId.toUpperCase()}</span>
          </div>

          <button
            type="button"
            onClick={handleSwitchPreferredSlot}
            className={`px-2 py-1 rounded-lg border text-[11px] font-black cursor-pointer shrink-0 ${slotBorderClass}`}
            title="Cambiar entre Jugador 1 y Jugador 2"
          >
            J{mySlot} {mySlot === 1 ? 'AZUL' : 'ROJO'}
          </button>
        </div>

        {/* Live Telemetry Pill */}
        <div className="hidden sm:flex items-center gap-3">
          {(gyroGameMode === 'pingpong' || gyroGameMode === 'penalty' || gyroGameMode === 'headsoccer') &&
          typeof telemetry.scoreP1 === 'number' ? (
            <div className="flex items-center gap-2 font-mono text-sm font-black">
              <span className="text-cyan-300">J1 {telemetry.scoreP1}</span>
              <span className="text-zinc-500">-</span>
              <span className="text-rose-400">{telemetry.scoreP2 ?? 0} J2</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
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
              <span className="font-mono text-base font-black text-cyan-300 tabular-nums">
                {telemetry.speedKmh}
              </span>
              <span className="text-[10px] font-bold text-zinc-400">KM/H</span>
            </div>
          )}
        </div>

        {/* Compact Settings Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setGyroGameMode((m) =>
                m === 'racing3d'
                  ? 'penalty'
                  : m === 'penalty'
                  ? 'pingpong'
                  : m === 'pingpong'
                  ? 'gyrohockey'
                  : m === 'gyrohockey'
                  ? 'gyrospace'
                  : m === 'gyrospace'
                  ? 'headsoccer'
                  : 'racing3d'
              );
            }}
            className="h-9 px-2.5 rounded-xl bg-[#7C3AED]/25 hover:bg-[#7C3AED]/40 border border-[#7C3AED]/50 text-[11px] font-black text-purple-200 cursor-pointer"
          >
            {gyroGameMode === 'penalty'
              ? '⚽ Penaltis'
              : gyroGameMode === 'pingpong'
              ? '🏓 Ping Pong'
              : gyroGameMode === 'gyrohockey'
              ? '🏒 Hockey'
              : gyroGameMode === 'gyrospace'
              ? '🚀 Nave'
              : gyroGameMode === 'headsoccer'
              ? '🥅 Fútbol'
              : '🏎️ GP3D'}
          </button>

          <button
            type="button"
            onClick={handleCalibrate}
            className="h-9 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            title="Calibrar centro"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden md:inline">Centro</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSensitivity((s) => (s === 'soft' ? 'normal' : s === 'normal' ? 'pro' : 'soft'));
            }}
            className="h-9 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>{sensitivity === 'soft' ? 'Suave' : sensitivity === 'pro' ? 'Pro' : 'Normal'}</span>
          </button>

          <button
            type="button"
            onClick={() => setPhoneSoundMuted((m) => !m)}
            className="w-9 h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center cursor-pointer"
            aria-label="Sonido móvil"
          >
            {phoneSoundMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-300" />
            )}
          </button>
        </div>
      </header>

      {/* iOS Explicit Gyro Permission Prompt if needed */}
      {gyroState === 'idle' && (
        <div className="my-1 mx-auto w-full max-w-md rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/60 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
            <Compass className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>Activa giroscopio y acelerómetro del móvil</span>
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

      {/* STRICT LANDSCAPE COCKPIT: MAX 2 BUTTONS LEFT | CENTER SENSOR DIAL | MAX 2 BUTTONS RIGHT */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 items-stretch pt-2 pb-0.5">
        {/* LEFT SIDE: STRICTLY 2 BUTTONS (L1 + L2) */}
        <div className="col-span-3 flex flex-col gap-2.5">
          <button
            type="button"
            data-side="left-1"
            onPointerDown={() => {
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
            className={`flex-1 min-h-14 rounded-2xl border-2 font-black text-xs sm:text-sm tracking-wide flex flex-col items-center justify-center transition-transform cursor-pointer ${
              l1Pressed
                ? 'bg-amber-500/35 border-amber-400 text-amber-100 scale-95'
                : 'bg-[#121625] border-white/15 text-amber-300'
            }`}
          >
            <span>{buttonConfig.l1Title}</span>
            <span className="text-[10px] font-semibold opacity-70">{buttonConfig.l1Sub}</span>
          </button>

          <button
            type="button"
            data-side="left-2"
            onPointerDown={() => {
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
            className={`flex-[1.35] min-h-20 rounded-3xl border-2 font-black text-sm sm:text-lg tracking-wider flex flex-col items-center justify-center transition-transform cursor-pointer ${
              l2Pressed
                ? 'bg-rose-600/45 border-rose-400 text-white scale-95'
                : 'bg-[#15101b] border-rose-500/45 text-rose-200'
            }`}
          >
            <span>{buttonConfig.l2Title}</span>
            <span className="text-[10px] font-semibold opacity-75">{buttonConfig.l2Sub}</span>
          </button>
        </div>

        {/* CENTER ZONE: Interactive Gyro Wheel / Physical Ping Pong Racket */}
        <div className="col-span-6 flex flex-col items-center justify-center gap-1 min-h-0">
          <div
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={handleWheelPointerUp}
            onPointerCancel={handleWheelPointerUp}
            className="relative w-36 h-36 sm:w-52 sm:h-52 flex items-center justify-center cursor-grab active:cursor-grabbing"
          >
            {gyroGameMode === 'pingpong' ? (
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full drop-shadow-[0_12px_26px_rgba(244,63,94,0.3)] transition-transform duration-75"
                style={{
                  transform: `rotate(${Math.round(visualSteer * 48)}deg) scale(${
                    visualSwing > 1 ? 1.09 : 1
                  })`,
                }}
              >
                {/* Racket Handle */}
                <rect x="88" y="138" width="24" height="52" rx="8" fill="#78350f" stroke="#d97706" strokeWidth="3" />
                <rect x="88" y="158" width="24" height="8" fill="#fbbf24" />
                {/* Racket Blade & Rubber */}
                <ellipse
                  cx="100"
                  cy="86"
                  rx="64"
                  ry="70"
                  fill={mySlot === 2 ? '#e11d48' : '#0284c7'}
                  stroke="#f8fafc"
                  strokeWidth="5"
                />
                <ellipse
                  cx="100"
                  cy="86"
                  rx="54"
                  ry="60"
                  fill="none"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="2"
                />
                <text
                  x="100"
                  y="83"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="14"
                  fontWeight="900"
                  fontFamily="monospace"
                >
                  RAQUETA
                </text>
                <text
                  x="100"
                  y="102"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="800"
                  fontFamily="monospace"
                >
                  J{mySlot} · {visualSwing > 0.7 ? 'SMASH!' : 'LISTA'}
                </text>
              </svg>
            ) : gyroGameMode === 'penalty' ? (
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full drop-shadow-[0_12px_26px_rgba(16,185,129,0.35)]"
              >
                {/* Mini goal frame */}
                <rect x="20" y="34" width="160" height="86" rx="6" fill="rgba(16,185,129,0.08)" stroke="#f8fafc" strokeWidth="4" />
                <line x1="20" y1="62" x2="180" y2="62" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                <line x1="20" y1="90" x2="180" y2="90" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                <line x1="73" y1="34" x2="73" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                <line x1="127" y1="34" x2="127" y2="120" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                {/* Live aim target inside goal */}
                <circle
                  cx={100 + visualSteer * 66}
                  cy={78 - visualPitch * 32}
                  r="11"
                  fill="none"
                  stroke={mySlot === 2 ? '#fb7185' : '#22d3ee'}
                  strokeWidth="3"
                />
                <circle cx={100 + visualSteer * 66} cy={78 - visualPitch * 32} r="3" fill="#facc15" />
                {/* Curve trajectory arc indicator */}
                {(l1Pressed || l2Pressed) && (
                  <path
                    d={`M 100 156 Q ${l1Pressed ? 48 : 152} 110 ${100 + visualSteer * 66} ${78 - visualPitch * 32}`}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="2.8"
                    strokeDasharray="5 4"
                  />
                )}
                {/* Football at penalty spot */}
                <circle
                  cx="100"
                  cy="158"
                  r={visualSwing > 0.7 ? 24 : 21}
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                />
                <polygon points="100,147 109,154 106,165 94,165 91,154" fill="#18181b" />
                <text x="100" y="193" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="900" fontFamily="monospace">
                  J{mySlot} · {l1Pressed ? 'ROSCA ↶' : l2Pressed ? 'ROSCA ↷' : 'APUNTA Y CHUTA'}
                </text>
              </svg>
            ) : (
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full drop-shadow-[0_14px_30px_rgba(124,58,237,0.3)] transition-transform duration-75"
                style={{ transform: `rotate(${Math.round(visualSteer * 58)}deg)` }}
              >
                <circle cx="100" cy="100" r="80" fill="none" stroke="#1e293b" strokeWidth="18" />
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke={mySlot === 2 ? '#f43f5e' : buttonConfig.accent}
                  strokeWidth="5"
                  strokeDasharray="115 410"
                  strokeDashoffset="55"
                />
                <rect x="94" y="12" width="12" height="16" rx="4" fill="#22d3ee" />
                <rect x="24" y="92" width="152" height="16" rx="8" fill="#1e293b" />
                <rect x="90" y="95" width="20" height="78" rx="8" fill="#1e293b" />
                <circle
                  cx="100"
                  cy="100"
                  r="30"
                  fill="#0f172a"
                  stroke={mySlot === 2 ? '#fb7185' : '#38bdf8'}
                  strokeWidth="3"
                />
                <text
                  x="100"
                  y="98"
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="11"
                  fontWeight="900"
                  fontFamily="monospace"
                >
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

          <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400">
            <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">
              {gyroGameMode === 'pingpong'
                ? 'Inclina lateralmente o agita para rematar'
                : gyroGameMode === 'penalty'
                ? 'Desliza o inclina para apuntar · Mantén Rosca + Chutar (o agita)'
                : gyroState === 'active'
                ? 'Inclina en horizontal para girar (o desliza centro)'
                : 'Desliza izquierda / derecha en el centro'}
            </span>
          </div>
        </div>

        {/* RIGHT SIDE: STRICTLY 2 BUTTONS (R1 + R2) */}
        <div className="col-span-3 flex flex-col gap-2.5">
          <button
            type="button"
            data-side="right-1"
            onPointerDown={() => {
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
            className={`flex-1 min-h-14 rounded-2xl border-2 font-black text-xs sm:text-sm tracking-wide flex flex-col items-center justify-center px-2 py-1 transition-transform cursor-pointer ${
              r1Pressed
                ? 'bg-cyan-500/40 border-cyan-300 text-white scale-95'
                : 'bg-[#0d1926] border-cyan-500/45 text-cyan-200'
            }`}
          >
            <span className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-cyan-300" />
              {buttonConfig.r1Title}
            </span>
            <span className="text-[10px] font-semibold opacity-70">{buttonConfig.r1Sub}</span>
          </button>

          <button
            type="button"
            data-side="right-2"
            onPointerDown={() => {
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
            className={`flex-[1.35] min-h-20 rounded-3xl border-2 font-black text-sm sm:text-lg tracking-wider flex flex-col items-center justify-center transition-transform cursor-pointer ${
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
    </div>
  );
};
