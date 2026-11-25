import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CarFront,
  Compass,
  Flame,
  Gauge,
  Map as MapIcon,
  QrCode,
  RotateCcw,
  Smartphone,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../../../types';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import { socketService } from '../../../services/socket';
import { useDirectDeviceGyro } from '../../../hooks/useDirectDeviceGyro';
import { pickLang } from '../../../utils/i18n';
import { triggerHaptic } from '../../../utils/haptics';
import { createRacing3dEngine } from './racing3dEngine';
import { DualGyroQrPanel } from './DualGyroQrPanel';
import {
  RACING_CAR_CATALOG,
  RACING_TRACK_CATALOG,
  getRacingCarSpec,
  getRacingTrackSpec,
  type RacingCarId,
  type RacingCarTelemetry,
  type RacingEngineHandle,
  type RacingTrackId,
} from './racingTypes';

interface Racing3DStageProps {
  lang: AppLanguage;
  roomId: string;
  userName: string;
  onClose: () => void;
}

const STORAGE_CAR_KEY = 'riffan_racing_car_v1';
const STORAGE_TRACK_KEY = 'riffan_racing_track_v1';

function readSavedCarId(): RacingCarId {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_CAR_KEY) : null;
    return getRacingCarSpec(raw).id;
  } catch {
    return 'ferrari';
  }
}

function readSavedTrackId(): RacingTrackId {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_TRACK_KEY) : null;
    return getRacingTrackSpec(raw).id;
  } catch {
    return 'metropolis';
  }
}

function formatLapMs(ms: number): string {
  if (!ms || ms <= 0) return '--:--.--';
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export const Racing3DStage: React.FC<Racing3DStageProps> = ({
  lang,
  roomId,
  userName,
  onClose,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngineHandle | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const lastTelemetrySendRef = useRef(0);

  const [selectedCarId, setSelectedCarId] = useState<RacingCarId>(() => readSavedCarId());
  const [selectedTrackId, setSelectedTrackId] = useState<RacingTrackId>(() => readSavedTrackId());
  const [showGarage, setShowGarage] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [autoGas, setAutoGas] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [muted, setMuted] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [connectedControllers, setConnectedControllers] = useState<
    Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>
  >([]);
  const [telemetry, setTelemetry] = useState<RacingCarTelemetry>({
    speedKmh: 0,
    rpmPct: 14,
    gear: 1,
    lap: 1,
    totalLaps: 3,
    position: 4,
    totalCars: 4,
    nitroPct: 100,
    collisionImpact: 0,
    offroad: false,
    raceState: 'countdown',
    countdownValue: 3,
    lapTimeMs: 0,
    bestLapMs: 0,
    totalTimeMs: 0,
    cameraMode: 'chase',
    wrongWay: false,
    carId: selectedCarId,
    trackId: selectedTrackId,
    autoGas,
  });
  const [finishSummary, setFinishSummary] = useState<{
    position: number;
    totalTimeMs: number;
    bestLapMs: number;
    winnerSlot?: 1 | 2;
  } | null>(null);

  const selectedCarSpec = useMemo(() => getRacingCarSpec(selectedCarId), [selectedCarId]);
  const selectedTrackSpec = useMemo(() => getRacingTrackSpec(selectedTrackId), [selectedTrackId]);

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || 'race-local').trim().toLowerCase(),
    [roomId]
  );

  const directGyro = useDirectDeviceGyro({ maxDeg: 28, deadzoneDeg: 2.6 });

  useEffect(() => {
    if (!directGyro.active) return;
    const id = window.setInterval(() => {
      const g = directGyro.gyroRef.current;
      if (!g.active) return;
      const throttle = pressedKeysRef.current.has('TouchUp') || g.pitch >= -0.35 ? 1 : 0;
      const brake = g.pitch < -0.45 ? Math.min(1, (-g.pitch - 0.45) * 1.8) : 0;
      engineRef.current?.setGyroInput(
        {
          playerSlot: 1,
          steer: g.steer,
          throttle,
          brake,
          nitro: g.swing > 1.2 || pressedKeysRef.current.has('TouchNitro'),
          handbrake: false,
          cameraCycle: false,
          horn: false,
        },
        220,
        1
      );
    }, 40);
    return () => window.clearInterval(id);
  }, [directGyro.active, directGyro.gyroRef]);

  const handleSelectCar = useCallback((carId: RacingCarId) => {
    triggerHaptic('medium');
    setSelectedCarId(carId);
    engineRef.current?.setPlayerCar?.(carId);
    try {
      window.localStorage.setItem(STORAGE_CAR_KEY, carId);
    } catch {
      // ignore storage failure
    }
    setShowGarage(false);
  }, []);

  const handleSelectTrack = useCallback((trackId: RacingTrackId) => {
    triggerHaptic('medium');
    const resolved = engineRef.current?.setTrack?.(trackId) || getRacingTrackSpec(trackId).id;
    setSelectedTrackId(resolved);
    setFinishSummary(null);
    try {
      window.localStorage.setItem(STORAGE_TRACK_KEY, resolved);
    } catch {
      // ignore storage failure
    }
    setShowTracks(false);
  }, []);

  const handleToggleAutoGas = useCallback(() => {
    triggerHaptic('light');
    setAutoGas((prev) => {
      const next = !prev;
      engineRef.current?.setAutoGas?.(next);
      return next;
    });
  }, []);

  // Mount Three.js PBR 3D Engine
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const handle = createRacing3dEngine(
      el,
      {
        onTelemetry: (t) => {
          setTelemetry(t);
          if (t.carId) setSelectedCarId(t.carId);
          if (t.trackId) setSelectedTrackId(t.trackId);
          if (typeof t.autoGas === 'boolean') {
            setAutoGas(t.autoGas);
          }
          const now = performance.now();
          if (
            socketService.isConnected() &&
            socketService.getActiveRoomId() &&
            now - lastTelemetrySendRef.current >= 95
          ) {
            lastTelemetrySendRef.current = now;
            socketService.sendRacingTelemetry(
              {
                roomId: socketService.getActiveRoomId() || effectiveRoomId,
                speedKmh: t.speedKmh,
                rpmPct: t.rpmPct,
                gear: t.gear,
                lap: t.lap,
                totalLaps: t.totalLaps,
                position: t.position,
                totalCars: t.totalCars,
                nitroPct: t.nitroPct,
                collisionImpact: t.collisionImpact,
                offroad: t.offroad,
                raceState: t.raceState,
                lapTimeMs: t.lapTimeMs,
                bestLapMs: t.bestLapMs,
                carId: t.carId,
                trackId: t.trackId,
                targetSlot: 1,
              },
              socketService.getActiveRoomId()
            );
            if (t.splitScreenActive && typeof t.p2SpeedKmh === 'number') {
              socketService.sendRacingTelemetry(
                {
                  roomId: socketService.getActiveRoomId() || effectiveRoomId,
                  speedKmh: t.p2SpeedKmh,
                  rpmPct: Math.min(99, 18 + Math.round((t.p2SpeedKmh % 60) * 1.3)),
                  gear: Math.min(7, Math.max(1, Math.floor(t.p2SpeedKmh / 48) + 1)),
                  lap: t.p2Lap || 1,
                  totalLaps: t.totalLaps,
                  position: t.p2Position || 2,
                  totalCars: t.totalCars,
                  nitroPct: t.p2NitroPct ?? 100,
                  collisionImpact: t.p2CollisionImpact || 0,
                  offroad: false,
                  raceState: t.raceState,
                  targetSlot: 2,
                },
                socketService.getActiveRoomId()
              );
            }
          }
        },
        onFinish: (summary) => {
          setFinishSummary(summary);
        },
        onContextLost: () => {
          setContextLost(true);
        },
      },
      {
        initialCarId: selectedCarId,
        initialTrackId: selectedTrackId,
        initialAutoGas: autoGas,
      }
    );
    engineRef.current = handle;

    return () => {
      handle.destroy();
      engineRef.current = null;
    };
  }, []);

  // Join WS gyro display channel + relay incoming phone gyro inputs
  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-r3d-${effectiveRoomId}`,
          name: `${userName || 'Pantalla'} (3D)`,
          avatar: '🏎️',
          color: '#22d3ee',
          role: 'host',
          isHost: true,
          joinedAt: Date.now(),
        },
        `Sala ${effectiveRoomId.toUpperCase()}`
      );
    } else {
      socketService.joinGyroChannel('display', `${userName || 'Pantalla'} (3D)`, effectiveRoomId, {
        gameId: 'racing3d',
      });
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>)
          : [];
        setConnectedControllers(list);
        const hasP2 = list.length >= 2 || list.some((c) => c.slot === 2);
        engineRef.current?.setPlayer2Connected?.(hasP2);
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        const slot: 1 | 2 = ev.payload.playerSlot === 2 ? 2 : 1;
        engineRef.current?.setGyroInput(
          {
            playerSlot: slot,
            steer: Number(ev.payload.steer || 0),
            throttle: Number(ev.payload.throttle || 0),
            brake: Number(ev.payload.brake || 0),
            nitro: Boolean(ev.payload.nitro),
            handbrake: Boolean(ev.payload.handbrake),
            cameraCycle: Boolean(ev.payload.cameraCycle),
            horn: Boolean(ev.payload.horn),
            carSelect: ev.payload.carSelect as RacingCarId | 'next' | undefined,
            trackSelect: ev.payload.trackSelect as RacingTrackId | 'next' | 'prev' | undefined,
            autoGasToggle: Boolean(ev.payload.autoGasToggle),
          },
          950,
          slot
        );
      } else if (ev.type === 'ROOM_STATE') {
        socketService.joinGyroChannel('display', `${userName || 'Pantalla'} (3D)`, effectiveRoomId, {
          gameId: 'racing3d',
        });
      }
    });

    return () => unsub();
  }, [effectiveRoomId, userName]);

  // Keyboard & Remote Control bindings
  const syncKeysToEngine = useCallback(() => {
    const keys = pressedKeysRef.current;
    engineRef.current?.setKeyboardState({
      left: keys.has('ArrowLeft') || keys.has('KeyA'),
      right: keys.has('ArrowRight') || keys.has('KeyD'),
      up: keys.has('ArrowUp') || keys.has('KeyW'),
      down: keys.has('ArrowDown') || keys.has('KeyS'),
      nitro: keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyN'),
      handbrake: keys.has('Space'),
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'KeyC') {
        engineRef.current?.cycleCamera();
        return;
      }
      if (e.code === 'KeyG') {
        setShowTracks(false);
        setShowGarage((v) => !v);
        return;
      }
      if (e.code === 'KeyM') {
        setShowGarage(false);
        setShowTracks((v) => !v);
        return;
      }
      if (e.code === 'KeyT') {
        handleToggleAutoGas();
        return;
      }
      if (e.code.startsWith('Digit')) {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        if (showTracks && idx >= 0 && idx < RACING_TRACK_CATALOG.length) {
          handleSelectTrack(RACING_TRACK_CATALOG[idx].id);
          return;
        }
        if (idx >= 0 && idx < RACING_CAR_CATALOG.length) {
          handleSelectCar(RACING_CAR_CATALOG[idx].id);
          return;
        }
      }
      if (e.code === 'KeyR') {
        setFinishSummary(null);
        engineRef.current?.resetRace();
        return;
      }
      pressedKeysRef.current.add(e.code);
      syncKeysToEngine();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
      syncKeysToEngine();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleSelectCar, handleSelectTrack, handleToggleAutoGas, showTracks, syncKeysToEngine]);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface relative w-full h-[520px] sm:h-[640px] rounded-3xl overflow-hidden bg-[#070a14] border border-white/10 select-none"
    >
      {/* Three.js PBR Urban GP 3D Engine */}
      <div ref={stageRef} className="w-full h-full" />

      {/* Unified Top HUD Container (non-overlapping on mobile & desktop) */}
      <div className="pointer-events-none absolute inset-x-2.5 sm:inset-x-3 top-2.5 sm:top-3 z-20 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[#090c16]/90 border border-white/15 flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-black">
            <span className="text-amber-300">
              POS {telemetry.position}/{telemetry.totalCars}
            </span>
            <span className="text-white">
              VUELTA {telemetry.lap}/{telemetry.totalLaps}
            </span>
            <span className="font-mono text-cyan-300">{formatLapMs(telemetry.lapTimeMs)}</span>
          </div>

          <div className="hidden md:flex px-2.5 py-1.5 rounded-xl bg-[#090c16]/85 border border-white/15 items-center gap-2 text-[11px] font-bold text-zinc-200">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedCarSpec.cssColor }}
            />
            <span>{selectedCarSpec.name}</span>
            <span className="text-zinc-500">·</span>
            <span style={{ color: selectedTrackSpec.cssAccent }}>{selectedTrackSpec.shortName}</span>
          </div>

          {connectedControllers.map((ctrl, idx) => {
            const slot = ctrl.slot || (idx === 0 ? 1 : 2);
            return (
              <div
                key={`${ctrl.userId}-${slot}`}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold text-white flex items-center gap-1.5 ${
                  slot === 2
                    ? 'bg-rose-600/85 border-rose-400/50'
                    : 'bg-emerald-600/85 border-emerald-400/50'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>J{slot}: {ctrl.deviceName}</span>
              </div>
            );
          })}

          {telemetry.splitScreenActive && (
            <div className="px-2.5 py-1 rounded-xl bg-rose-600/90 border border-rose-300/50 text-[11px] font-black text-white">
              SPLIT 2P · J2: {telemetry.p2SpeedKmh || 0} KM/H · POS #{telemetry.p2Position || 2}
            </div>
          )}
        </div>

        {/* Top Right Toolbar */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 flex-wrap justify-end ml-auto">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowGarage(false);
            setShowTracks((v) => !v);
          }}
          className={`game-touch-btn min-h-10 px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg ${
            showTracks
              ? 'bg-cyan-500/30 border-cyan-400 text-cyan-100'
              : 'bg-[#090c16]/90 border-cyan-400/40 text-cyan-200 hover:bg-[#14192b]'
          }`}
          title="Elegir circuito (M)"
        >
          <MapIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Circuitos</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowTracks(false);
            setShowGarage((v) => !v);
          }}
          className={`game-touch-btn min-h-10 px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg ${
            showGarage
              ? 'bg-amber-500/30 border-amber-400 text-amber-100'
              : 'bg-[#090c16]/90 border-amber-400/40 text-amber-200 hover:bg-[#14192b]'
          }`}
          title="Elegir coche (G)"
        >
          <CarFront className="w-4 h-4" />
          <span className="hidden sm:inline">Coches (5)</span>
        </button>

        <button
          type="button"
          onClick={handleToggleAutoGas}
          className={`game-touch-btn min-h-10 px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-lg ${
            autoGas
              ? 'bg-emerald-600/30 border-emerald-400 text-emerald-100'
              : 'bg-[#090c16]/90 border-white/15 text-zinc-300 hover:bg-[#14192b]'
          }`}
          title="Auto-Acelerador (T)"
        >
          <Gauge className="w-4 h-4" />
          <span className="hidden sm:inline">{autoGas ? 'Auto-Gas' : 'Manual'}</span>
        </button>

        {directGyro.supported && (
          <button
            type="button"
            onClick={() => void directGyro.toggle()}
            className={`game-touch-btn min-h-10 px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg ${
              directGyro.active
                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                : 'bg-[#090c16]/90 border-white/15 text-zinc-200 hover:bg-[#14192b]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span className="hidden sm:inline">{directGyro.active ? 'Gyro ON' : 'Giroscopio'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowQrModal((v) => !v);
          }}
          className="game-touch-btn min-h-10 px-2.5 sm:px-3 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg"
        >
          <QrCode className="w-4 h-4" />
          <span className="hidden sm:inline">
            {pickLang(lang, { es: 'Volante Móvil', ca: 'Volant Mòbil', en: 'Phone Gyro' })}
          </span>
        </button>

        <button
          type="button"
          onClick={() => engineRef.current?.cycleCamera()}
          className="min-w-10 min-h-10 rounded-xl bg-[#090c16]/90 hover:bg-[#14192b] border border-white/15 text-zinc-100 flex items-center justify-center cursor-pointer"
          title="Cambiar cámara (C)"
        >
          <Camera className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            engineRef.current?.setMuted(next);
          }}
          className="min-w-10 min-h-10 rounded-xl bg-[#090c16]/90 hover:bg-[#14192b] border border-white/15 text-zinc-100 flex items-center justify-center cursor-pointer"
          title="Audio"
        >
          {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => {
            setFinishSummary(null);
            engineRef.current?.resetRace();
          }}
          className="min-w-10 min-h-10 rounded-xl bg-[#090c16]/90 hover:bg-[#14192b] border border-white/15 text-zinc-100 flex items-center justify-center cursor-pointer"
          title="Reiniciar carrera (R)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="min-w-10 min-h-10 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center cursor-pointer"
          title="Cerrar juego"
        >
          <X className="w-4 h-4" />
        </button>
        </div>
      </div>

      {telemetry.splitScreenActive && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] bg-gradient-to-b from-cyan-400 via-white/80 to-rose-500 shadow-[0_0_16px_rgba(34,211,238,0.8)] z-10" />
      )}

      {/* Garage Car Selector Overlay (5 Modelos) */}
      {showGarage && (
        <div className="absolute inset-0 bg-[#050711]/95 z-25 p-4 sm:p-6 flex flex-col justify-between overflow-y-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base sm:text-xl font-black text-white flex items-center gap-2">
                <CarFront className="w-5 h-5 text-amber-400" />
                Garaje GP · 5 Modelos
              </h3>
              <p className="text-xs text-zinc-400">
                Cada vehículo tiene geometría 3D, aceleración, giro y velocidad punta propias (teclas 1-5)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGarage(false)}
              className="min-h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 my-auto">
            {RACING_CAR_CATALOG.map((car, index) => {
              const active = car.id === selectedCarId;
              return (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => handleSelectCar(car.id)}
                  className={`text-left rounded-2xl border p-3 transition-all cursor-pointer flex flex-col gap-2 ${
                    active
                      ? 'bg-[#181f38] border-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.28)]'
                      : 'bg-[#0e1324] border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-16 h-11 rounded-xl overflow-hidden shrink-0 border border-white/15 flex items-center justify-center relative"
                      style={{
                        background: `linear-gradient(135deg, ${car.cssColor}44, #090c18)`,
                      }}
                    >
                      {car.previewPath ? (
                        <img
                          src={resolveGameAssetUrl(car.previewPath)}
                          alt={car.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg viewBox="0 0 80 42" className="w-13 h-8" aria-hidden="true">
                          <path
                            d="M12 28 L16 17 L30 14 L52 14 L64 20 L68 28 Z"
                            fill={car.cssColor}
                            stroke={car.cssAccent}
                            strokeWidth="2"
                          />
                          <circle cx="24" cy="29" r="5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.8" />
                          <circle cx="56" cy="29" r="5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.8" />
                        </svg>
                      )}
                      <span className="absolute top-0.5 left-1 text-[9px] font-mono font-black text-white/90 bg-black/60 px-1 rounded">
                        {index + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-white truncate">{car.name}</div>
                      <div className="text-[10px] font-bold text-cyan-300">{car.category}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{car.tagline}</div>
                    </div>
                  </div>

                  <div className="space-y-1 text-[10px] font-bold text-zinc-300">
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-zinc-400">VEL</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-cyan-400" style={{ width: `${car.stats.speed}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-zinc-400">ACEL</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${car.stats.accel}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-zinc-400">GIRO</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-emerald-400" style={{ width: `${car.stats.handling}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Circuit Selector Overlay (5 Circuitos 3D) */}
      {showTracks && (
        <div className="absolute inset-0 bg-[#050711]/95 z-25 p-4 sm:p-6 flex flex-col justify-between overflow-y-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base sm:text-xl font-black text-white flex items-center gap-2">
                <MapIcon className="w-5 h-5 text-cyan-400" />
                Campeonato · 5 Circuitos 3D
              </h3>
              <p className="text-xs text-zinc-400">
                Cada circuito cambia trazado, bioma 3D, iluminación HDRI y velocidad de curvas (teclas 1-5)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTracks(false)}
              className="min-h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 my-auto">
            {RACING_TRACK_CATALOG.map((track, index) => {
              const active = track.id === selectedTrackId;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleSelectTrack(track.id)}
                  className={`text-left rounded-2xl border p-3 transition-all cursor-pointer flex items-center gap-3 ${
                    active
                      ? 'bg-[#181f38] border-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.28)]'
                      : 'bg-[#0e1324] border-white/10 hover:border-white/30'
                  }`}
                >
                  <div
                    className="w-16 h-16 rounded-xl shrink-0 border border-white/15 flex items-center justify-center relative"
                    style={{
                      background: `linear-gradient(155deg, ${track.skyTop}, ${track.skyHorizon})`,
                    }}
                  >
                    <svg viewBox="0 0 100 100" className="w-13 h-13" aria-hidden="true">
                      <path
                        d={track.svgPath}
                        fill="none"
                        stroke="#090c16"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={track.svgPath}
                        fill="none"
                        stroke={track.cssAccent}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="absolute top-0.5 left-1 text-[9px] font-mono font-black text-white/90 bg-black/60 px-1 rounded">
                      {index + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-black text-white truncate">{track.name}</div>
                    <div className="text-[10px] font-bold" style={{ color: track.cssAccent }}>
                      {track.environment} · {track.difficulty}
                    </div>
                    <div className="text-[10px] text-zinc-400 line-clamp-2 leading-snug">
                      {track.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Countdown Lights */}
      {telemetry.raceState === 'countdown' && telemetry.countdownValue > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="px-8 py-4 rounded-3xl bg-[#090c16]/90 border-2 border-[#7C3AED]/70 text-6xl font-black text-white shadow-2xl">
            {telemetry.countdownValue}
          </div>
        </div>
      )}

      {telemetry.wrongWay && (
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-black tracking-wider">
          SENTIDO CONTRARIO
        </div>
      )}

      {/* Bottom Right Digital Speedometer & Nitro */}
      <div className="pointer-events-none absolute bottom-[74px] sm:bottom-3 right-3 px-3 py-1.5 sm:px-3.5 sm:py-2.5 rounded-2xl bg-[#090c16]/92 border border-white/15 flex items-center gap-3 sm:gap-4">
        <div className="text-right">
          <div className="text-xl sm:text-3xl font-mono font-black text-cyan-300 tabular-nums leading-none">
            {telemetry.speedKmh}
          </div>
          <div className="text-[10px] font-bold text-zinc-400">KM/H</div>
        </div>
        <div className="px-2 sm:px-2.5 py-1 rounded-lg bg-[#7C3AED]/30 border border-[#7C3AED]/60 text-xs sm:text-sm font-black">
          M{telemetry.gear || 'R'}
        </div>
        <div className="w-16 sm:w-20">
          <div className="flex items-center justify-between text-[10px] font-bold text-cyan-200 mb-1">
            <span className="flex items-center gap-0.5">
              <Flame className="w-3 h-3" /> NITRO
            </span>
            <span>{telemetry.nitroPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-100"
              style={{ width: `${telemetry.nitroPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Left & Right Ergonomic Mobile Controls */}
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              engineRef.current?.setKeyboardState({ left: true });
            }}
            onPointerUp={() => engineRef.current?.setKeyboardState({ left: false })}
            onPointerCancel={() => engineRef.current?.setKeyboardState({ left: false })}
            onLostPointerCapture={() => engineRef.current?.setKeyboardState({ left: false })}
            className="game-touch-btn w-14 h-12 rounded-2xl bg-[#090c16]/92 border-2 border-white/25 text-white text-lg font-black"
          >
            ◀
          </button>
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              engineRef.current?.setKeyboardState({ right: true });
            }}
            onPointerUp={() => engineRef.current?.setKeyboardState({ right: false })}
            onPointerCancel={() => engineRef.current?.setKeyboardState({ right: false })}
            onLostPointerCapture={() => engineRef.current?.setKeyboardState({ right: false })}
            className="game-touch-btn w-14 h-12 rounded-2xl bg-[#090c16]/92 border-2 border-white/25 text-white text-lg font-black"
          >
            ▶
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              engineRef.current?.setKeyboardState({ down: true });
            }}
            onPointerUp={() => engineRef.current?.setKeyboardState({ down: false })}
            onPointerCancel={() => engineRef.current?.setKeyboardState({ down: false })}
            onLostPointerCapture={() => engineRef.current?.setKeyboardState({ down: false })}
            className="game-touch-btn px-3 h-12 rounded-2xl bg-rose-600/90 text-white text-xs font-black"
          >
            FRENO
          </button>
          {!autoGas && (
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                pressedKeysRef.current.add('TouchUp');
                engineRef.current?.setKeyboardState({ up: true });
              }}
              onPointerUp={() => {
                pressedKeysRef.current.delete('TouchUp');
                engineRef.current?.setKeyboardState({ up: false });
              }}
              onPointerCancel={() => {
                pressedKeysRef.current.delete('TouchUp');
                engineRef.current?.setKeyboardState({ up: false });
              }}
              onLostPointerCapture={() => {
                pressedKeysRef.current.delete('TouchUp');
                engineRef.current?.setKeyboardState({ up: false });
              }}
              className="game-touch-btn px-3.5 h-12 rounded-2xl bg-emerald-600/95 text-white text-xs font-black"
            >
              GAS
            </button>
          )}
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              pressedKeysRef.current.add('TouchNitro');
              engineRef.current?.setKeyboardState({ nitro: true });
            }}
            onPointerUp={() => {
              pressedKeysRef.current.delete('TouchNitro');
              engineRef.current?.setKeyboardState({ nitro: false });
            }}
            onPointerCancel={() => {
              pressedKeysRef.current.delete('TouchNitro');
              engineRef.current?.setKeyboardState({ nitro: false });
            }}
            onLostPointerCapture={() => {
              pressedKeysRef.current.delete('TouchNitro');
              engineRef.current?.setKeyboardState({ nitro: false });
            }}
            className="game-touch-btn px-3 h-12 rounded-2xl bg-cyan-500/95 text-slate-950 text-xs font-black inline-flex items-center gap-1"
          >
            <Flame className="w-3.5 h-3.5" /> NITRO
          </button>
        </div>
      </div>

      <div className="pointer-events-none hidden sm:flex absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-[#090c16]/85 border border-white/10 text-[11px] font-semibold text-zinc-300">
        WASD / Flechas · Shift: Nitro · G: Coches · M: Circuitos · T: Auto-Gas · C: Cámara
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId="racing3d"
          title="Volante Móvil Nitro GP 3D (J1 y J2)"
          controllers={connectedControllers}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Race Finished Overlay */}
      {finishSummary && (
        <div className="absolute inset-0 bg-[#05070e]/90 flex items-center justify-center p-4 z-20">
          <div className="w-full max-w-sm rounded-3xl bg-[#111526] border border-[#7C3AED]/60 p-6 text-center space-y-4 shadow-2xl">
            <Trophy className="w-12 h-12 text-amber-400 mx-auto" />
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                Fin de Carrera
              </div>
              <h3 className="text-2xl font-black text-white">
                {finishSummary.winnerSlot === 2
                  ? '🏆 Victoria J2 (Móvil 2)'
                  : `Posición #${finishSummary.position}`}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="text-zinc-400">Tiempo Total</div>
                <div className="font-mono font-black text-white">
                  {formatLapMs(finishSummary.totalTimeMs)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.05] border border-white/10">
                <div className="text-zinc-400">Mejor Vuelta</div>
                <div className="font-mono font-black text-cyan-300">
                  {formatLapMs(finishSummary.bestLapMs)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setFinishSummary(null);
                  engineRef.current?.resetRace();
                }}
                className="flex-1 min-h-11 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
              >
                Volver a correr
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-11 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white cursor-pointer"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3 p-6 text-center z-30">
          <p className="text-sm font-bold text-white">Contexto 3D WebGL pausado por la GPU</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-5 rounded-xl bg-[#7C3AED] text-xs font-black text-white cursor-pointer"
          >
            Volver al menú de juegos
          </button>
        </div>
      )}
    </div>
  );
};

