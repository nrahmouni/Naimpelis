import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Flame,
  Gauge,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Video,
  Volume2,
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
}

type SensitivityLevel = 'soft' | 'normal' | 'pro';

function getScreenAngleDeg(): number {
  if (typeof window === 'undefined') return 0;
  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return window.screen.orientation.angle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

function normalizeWheelTiltDeg(ev: DeviceOrientationEvent): number {
  const beta = typeof ev.beta === 'number' ? ev.beta : 0;
  const gamma = typeof ev.gamma === 'number' ? ev.gamma : 0;
  const angle = ((getScreenAngleDeg() % 360) + 360) % 360;
  if (angle === 90) return beta;
  if (angle === 270) return -beta;
  if (angle === 180) return -gamma;
  return gamma;
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
  const [wsConnected, setWsConnected] = useState(false);
  const [gyroState, setGyroState] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle');
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('normal');
  const [visualSteer, setVisualSteer] = useState(0);
  const [gasPressed, setGasPressed] = useState(false);
  const [brakePressed, setBrakePressed] = useState(false);
  const [nitroPressed, setNitroPressed] = useState(false);
  const [driftPressed, setDriftPressed] = useState(false);
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
  const zeroOffsetRef = useRef(0);
  const filteredSteerRef = useRef(0);
  const touchSteerRef = useRef<number | null>(null);
  const gasRef = useRef(false);
  const brakeRef = useRef(false);
  const nitroRef = useRef(false);
  const driftRef = useRef(false);
  const camTogglePendingRef = useRef(false);
  const hornTogglePendingRef = useRef(false);
  const seqRef = useRef(0);
  const lastLapRef = useRef(1);
  const lastHapticAtRef = useRef(0);
  const sensitivityRef = useRef<SensitivityLevel>(sensitivity);
  sensitivityRef.current = sensitivity;

  const participantPayload = useMemo(
    () => ({
      id: userId || `ctrl-${Math.random().toString(36).slice(2, 8)}`,
      name: userName || 'Piloto Móvil',
      avatar: '🏎️',
      color: userColor,
      role: 'viewer' as const,
      isHost: false,
      joinedAt: Date.now(),
    }),
    [userId, userName, userColor]
  );

  // Connect WS room and listen for live telemetry + peer status
  useEffect(() => {
    if (!activeRoomId) return;

    const alreadyInRoom = socketService.getActiveRoomId() === activeRoomId && socketService.isConnected();
    if (!alreadyInRoom) {
      socketService.connect(activeRoomId, participantPayload, `Carrera ${activeRoomId.toUpperCase()}`);
    } else {
      setWsConnected(true);
      socketService.joinGyroChannel('controller', `${participantPayload.name} (Volante)`, activeRoomId);
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'CONNECTION_STATUS') {
        const up = Boolean(ev.payload.connected);
        setWsConnected(up);
        if (up) {
          socketService.joinGyroChannel('controller', `${participantPayload.name} (Volante)`, activeRoomId);
        }
      } else if (ev.type === 'ROOM_STATE') {
        setWsConnected(true);
        socketService.joinGyroChannel('controller', `${participantPayload.name} (Volante)`, activeRoomId);
      } else if (ev.type === 'RACING_TELEMETRY_RELAY') {
        const p = ev.payload;
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
        });

        const now = Date.now();
        if (nextLap > lastLapRef.current) {
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
  }, [activeRoomId, participantPayload]);

  // DeviceOrientation listener
  useEffect(() => {
    if (gyroState !== 'active' || typeof window === 'undefined') return;

    const onOrientation = (ev: DeviceOrientationEvent) => {
      const tilt = normalizeWheelTiltDeg(ev);
      rawTiltRef.current = tilt;
    };

    window.addEventListener('deviceorientation', onOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
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
          setGyroState('active');
        } else {
          setGyroState('denied');
        }
      } else {
        zeroOffsetRef.current = rawTiltRef.current;
        setGyroState('active');
      }
    } catch {
      setGyroState('denied');
    }
  }, []);

  const handleCalibrate = useCallback(() => {
    triggerHaptic('light');
    zeroOffsetRef.current = rawTiltRef.current;
    filteredSteerRef.current = 0;
    setVisualSteer(0);
  }, []);

  const sendCurrentFrame = useCallback(() => {
    if (!activeRoomId || !socketService.isConnected()) return;

    const maxDeg =
      sensitivityRef.current === 'pro' ? 28 : sensitivityRef.current === 'soft' ? 52 : 38;

    let targetSteer = 0;
    if (touchSteerRef.current !== null) {
      targetSteer = touchSteerRef.current;
    } else if (gyroState === 'active') {
      const delta = rawTiltRef.current - zeroOffsetRef.current;
      const deadzone = 3.2;
      if (Math.abs(delta) > deadzone) {
        const adjusted = (Math.abs(delta) - deadzone) * Math.sign(delta);
        targetSteer = Math.max(-1, Math.min(1, adjusted / (maxDeg - deadzone)));
      }
    }

    // Exponential smoothing filter
    filteredSteerRef.current = filteredSteerRef.current * 0.62 + targetSteer * 0.38;
    const roundedSteer = Number(filteredSteerRef.current.toFixed(3));
    setVisualSteer(roundedSteer);

    seqRef.current += 1;
    socketService.sendGyroInput(
      {
        roomId: activeRoomId,
        steer: roundedSteer,
        throttle: gasRef.current ? 1 : 0,
        brake: brakeRef.current ? 1 : 0,
        nitro: nitroRef.current,
        handbrake: driftRef.current,
        cameraCycle: camTogglePendingRef.current,
        horn: hornTogglePendingRef.current,
        seq: seqRef.current,
        ts: Date.now(),
      },
      activeRoomId
    );
    camTogglePendingRef.current = false;
    hornTogglePendingRef.current = false;
  }, [activeRoomId, gyroState]);

  // 30Hz (33ms) continuous steering & pedal telemetry stream
  useEffect(() => {
    if (!activeRoomId) return;
    const id = window.setInterval(sendCurrentFrame, 33);
    return () => window.clearInterval(id);
  }, [activeRoomId, sendCurrentFrame]);

  // Touch drag fallback directly on the SVG steering wheel
  const wheelDragStartXRef = useRef<number | null>(null);
  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    wheelDragStartXRef.current = e.clientX;
    touchSteerRef.current = 0;
  };
  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wheelDragStartXRef.current === null) return;
    const dx = e.clientX - wheelDragStartXRef.current;
    touchSteerRef.current = Math.max(-1, Math.min(1, dx / 95));
  };
  const handleWheelPointerUp = () => {
    wheelDragStartXRef.current = null;
    touchSteerRef.current = null;
  };

  if (!activeRoomId) {
    return (
      <div className="min-h-[100dvh] bg-[#070910] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-[#10131e] border border-white/10 p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#A78BFA]">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">Volante Gyro Pro</h1>
                <p className="text-xs text-zinc-400">Sincroniza tu móvil con la Smart TV</p>
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
              Conectar Volante
            </button>
          </form>
        </div>
      </div>
    );
  }

  const rpmLitCount = Math.round((telemetry.rpmPct / 100) * 10);

  return (
    <div className="min-h-[100dvh] w-full bg-[#06080f] text-white flex flex-col justify-between p-3 sm:p-5 select-none touch-none overflow-hidden">
      {/* Top Bar Telemetry + Connection + Calibration */}
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#0f1320] border border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onExit}
            className="min-w-11 min-h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center cursor-pointer"
            aria-label="Salir"
          >
            <RiffanBackIcon size={18} />
          </button>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-extrabold tracking-tight">
              {wsConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              )}
              <span>{activeRoomId.toUpperCase()}</span>
            </div>
            <span className="text-[11px] text-zinc-400">
              {gyroState === 'active'
                ? pickLang(lang, { es: 'Giroscopio activo', ca: 'Giroscopi actiu', en: 'Gyroscope live' })
                : pickLang(lang, { es: 'Modo táctil listo', ca: 'Mode tàctil llest', en: 'Touch wheel ready' })}
            </span>
          </div>
        </div>

        {/* Live RPM Shift LED Bar + Speed/Gear/Lap */}
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 mb-1">
              {Array.from({ length: 10 }, (_, idx) => {
                const active = idx < rpmLitCount;
                const color =
                  idx >= 8 ? 'bg-rose-500' : idx >= 5 ? 'bg-amber-400' : 'bg-emerald-400';
                return (
                  <span
                    key={idx}
                    className={`w-2 h-2 rounded-full ${active ? color : 'bg-white/15'}`}
                  />
                );
              })}
            </div>
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-xl sm:text-2xl font-black text-cyan-300 tabular-nums">
                {telemetry.speedKmh}
              </span>
              <span className="text-[10px] text-zinc-400 font-bold">KM/H</span>
              <span className="px-1.5 py-0.5 rounded bg-[#7C3AED]/30 border border-[#7C3AED]/50 text-xs font-black">
                M{telemetry.gear || 'R'}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-bold text-zinc-300">
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10">
              P{telemetry.position}/{telemetry.totalCars}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10">
              V{telemetry.lap}/{telemetry.totalLaps}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCalibrate}
            className="min-h-11 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-cyan-300" />
            <span className="hidden sm:inline">Calibrar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSensitivity((s) => (s === 'soft' ? 'normal' : s === 'normal' ? 'pro' : 'soft'));
            }}
            className="min-h-11 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#A78BFA]" />
            <span>{sensitivity === 'soft' ? 'Suave' : sensitivity === 'pro' ? 'Pro' : 'Normal'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              camTogglePendingRef.current = true;
              sendCurrentFrame();
            }}
            className="min-w-11 min-h-11 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center cursor-pointer"
            aria-label="Cambiar cámara"
          >
            <Video className="w-4 h-4 text-zinc-200" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              hornTogglePendingRef.current = true;
              sendCurrentFrame();
            }}
            className="min-w-11 min-h-11 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center cursor-pointer"
            aria-label="Claxon"
          >
            <Volume2 className="w-4 h-4 text-amber-300" />
          </button>
        </div>
      </header>

      {/* iOS Explicit Gyro Permission Prompt if needed */}
      {gyroState === 'idle' && (
        <div className="my-2 mx-auto w-full max-w-md rounded-2xl bg-[#7C3AED]/20 border border-[#7C3AED]/60 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-zinc-100">
            <Compass className="w-5 h-5 text-cyan-300 shrink-0" />
            <span>Pulsa para activar el giroscopio real de tu móvil</span>
          </div>
          <button
            type="button"
            onClick={() => void handleActivateGyro()}
            className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white shrink-0 cursor-pointer"
          >
            Activar Giroscopio
          </button>
        </div>
      )}

      {/* Main Split Cockpit Controls: Left Pedals | Center Wheel | Right Pedals */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3 items-stretch py-2">
        {/* Left Thumb Zone: Brake / Reverse + Drift */}
        <div className="col-span-4 sm:col-span-3 flex flex-col gap-3">
          <button
            type="button"
            onPointerDown={() => {
              driftRef.current = true;
              setDriftPressed(true);
              triggerHaptic('light');
              sendCurrentFrame();
            }}
            onPointerUp={() => {
              driftRef.current = false;
              setDriftPressed(false);
              sendCurrentFrame();
            }}
            onPointerCancel={() => {
              driftRef.current = false;
              setDriftPressed(false);
            }}
            className={`min-h-14 rounded-2xl border-2 font-black text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2 transition-transform cursor-pointer ${
              driftPressed
                ? 'bg-amber-500/35 border-amber-400 text-amber-100 scale-95'
                : 'bg-[#121625] border-white/15 text-amber-300'
            }`}
          >
            DRIFT
          </button>

          <button
            type="button"
            onPointerDown={() => {
              brakeRef.current = true;
              setBrakePressed(true);
              triggerHaptic('medium');
              sendCurrentFrame();
            }}
            onPointerUp={() => {
              brakeRef.current = false;
              setBrakePressed(false);
              sendCurrentFrame();
            }}
            onPointerCancel={() => {
              brakeRef.current = false;
              setBrakePressed(false);
            }}
            className={`flex-1 min-h-28 rounded-3xl border-2 font-black text-base sm:text-xl tracking-wider flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer ${
              brakePressed
                ? 'bg-rose-600/45 border-rose-400 text-white scale-95'
                : 'bg-[#15101b] border-rose-500/45 text-rose-200'
            }`}
          >
            <span>FRENO</span>
            <span className="text-[10px] font-semibold opacity-75">MARCHA ATRÁS</span>
          </button>
        </div>

        {/* Center Zone: Animated F1/GT Steering Wheel (Also draggable fallback) */}
        <div className="col-span-4 sm:col-span-6 flex flex-col items-center justify-center gap-2">
          <div
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={handleWheelPointerUp}
            onPointerCancel={handleWheelPointerUp}
            className="relative w-40 h-40 sm:w-56 sm:h-56 flex items-center justify-center cursor-grab active:cursor-grabbing"
          >
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full drop-shadow-[0_14px_30px_rgba(124,58,237,0.3)] transition-transform duration-75"
              style={{ transform: `rotate(${Math.round(visualSteer * 58)}deg)` }}
            >
              <circle
                cx="100"
                cy="100"
                r="82"
                fill="none"
                stroke="#1e293b"
                strokeWidth="18"
              />
              <circle
                cx="100"
                cy="100"
                r="82"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="4"
                strokeDasharray="110 410"
                strokeDashoffset="55"
              />
              {/* Top center alignment marker */}
              <rect x="94" y="10" width="12" height="16" rx="4" fill="#22d3ee" />
              {/* Spokes */}
              <rect x="22" y="92" width="156" height="16" rx="8" fill="#1e293b" />
              <rect x="90" y="95" width="20" height="82" rx="8" fill="#1e293b" />
              <circle cx="100" cy="100" r="30" fill="#0f172a" stroke="#38bdf8" strokeWidth="3" />
              <text
                x="100"
                y="105"
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="13"
                fontWeight="900"
                fontFamily="monospace"
              >
                GP3D
              </text>
            </svg>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {gyroState === 'active'
                ? 'Inclina el móvil para girar (o arrastra el volante)'
                : 'Arrastra el volante izquierda / derecha'}
            </span>
          </div>
        </div>

        {/* Right Thumb Zone: Nitro + Gas Pedal */}
        <div className="col-span-4 sm:col-span-3 flex flex-col gap-3">
          <button
            type="button"
            onPointerDown={() => {
              nitroRef.current = true;
              setNitroPressed(true);
              triggerHaptic('success');
              sendCurrentFrame();
            }}
            onPointerUp={() => {
              nitroRef.current = false;
              setNitroPressed(false);
              sendCurrentFrame();
            }}
            onPointerCancel={() => {
              nitroRef.current = false;
              setNitroPressed(false);
            }}
            className={`min-h-14 rounded-2xl border-2 font-black text-xs sm:text-sm tracking-wide flex flex-col items-center justify-center px-2 py-1.5 transition-transform cursor-pointer ${
              nitroPressed
                ? 'bg-cyan-500/40 border-cyan-300 text-white scale-95'
                : 'bg-[#0d1926] border-cyan-500/45 text-cyan-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-cyan-300" />
              NITRO {telemetry.nitroPct}%
            </span>
            <div className="w-full h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-100"
                style={{ width: `${telemetry.nitroPct}%` }}
              />
            </div>
          </button>

          <button
            type="button"
            onPointerDown={() => {
              gasRef.current = true;
              setGasPressed(true);
              triggerHaptic('light');
              sendCurrentFrame();
            }}
            onPointerUp={() => {
              gasRef.current = false;
              setGasPressed(false);
              sendCurrentFrame();
            }}
            onPointerCancel={() => {
              gasRef.current = false;
              setGasPressed(false);
            }}
            className={`flex-1 min-h-28 rounded-3xl border-2 font-black text-base sm:text-xl tracking-wider flex flex-col items-center justify-center gap-1 transition-transform cursor-pointer ${
              gasPressed
                ? 'bg-emerald-500/45 border-emerald-300 text-white scale-95'
                : 'bg-[#0c1b18] border-emerald-500/50 text-emerald-200'
            }`}
          >
            <span>GAS</span>
            <span className="text-[10px] font-semibold opacity-75">ACELERADOR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
