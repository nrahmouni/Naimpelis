import { createRacing3dEngine } from './racing3dEngine';
import { createRacing2dFallbackEngine } from './racing2dFallback';
import {
  RACING_CAR_CATALOG,
  RACING_TRACK_CATALOG,
  type RacingCarId,
  type RacingCarTelemetry,
  type RacingEngineHandle,
  type RacingEngineOptions,
  type RacingGyroControlState,
  type RacingTrackId,
} from './racingTypes';
import { mountPenalty3D } from '../three/Penalty3DViewport';
import { mountPingPong3D } from '../three/PingPong3DViewport';
import { mountSoccerPong3D } from '../three/SoccerPong3DViewport';
import { mountBowling3D } from '../three/Bowling3DViewport';
import { mountTennis3D } from '../three/Tennis3DViewport';
import { mountLabyrinth3D } from '../three/Labyrinth3DViewport';
import { mountHexGl3D } from '../three/HexGL3DViewport';

let activeEngine: RacingEngineHandle | null = null;

export function mount(
  container: HTMLElement,
  callbacks?: {
    onTelemetry?: (t: RacingCarTelemetry) => void;
    onFinish?: (s: { position: number; totalTimeMs: number; bestLapMs: number; winnerSlot?: 1 | 2 }) => void;
    onContextLost?: () => void;
  },
  options?: RacingEngineOptions
): void {
  unmount();
  try {
    activeEngine = createRacing3dEngine(container, callbacks || {}, options);
  } catch {
    activeEngine = createRacing2dFallbackEngine(container, callbacks || {}, options);
  }
}

export function setGyroInput(
  input: Partial<RacingGyroControlState>,
  expiresInMs = 950,
  playerSlot?: 1 | 2
): void {
  activeEngine?.setGyroInput(input, expiresInMs, playerSlot ?? input.playerSlot);
}

export function setPlayer2Connected(connected: boolean): void {
  activeEngine?.setPlayer2Connected?.(connected);
}

export function setRemoteKey(keys: {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
  nitro?: boolean;
  handbrake?: boolean;
}): void {
  activeEngine?.setKeyboardState(keys);
}

export function setPlayerCar(carId: RacingCarId): void {
  activeEngine?.setPlayerCar?.(carId);
}

export function getPlayerCar(): RacingCarId {
  return activeEngine?.getPlayerCar?.() || 'ferrari';
}

export function setTrack(trackId: RacingTrackId): RacingTrackId {
  return activeEngine?.setTrack?.(trackId) || 'metropolis';
}

export function getTrack(): RacingTrackId {
  return activeEngine?.getTrack?.() || 'metropolis';
}

export function setAutoGas(enabled: boolean): void {
  activeEngine?.setAutoGas?.(enabled);
}

export function getAutoGas(): boolean {
  return activeEngine?.getAutoGas?.() ?? true;
}

export function cycleCamera(): string {
  return activeEngine ? activeEngine.cycleCamera() : 'chase';
}

export function resetRace(): void {
  activeEngine?.resetRace();
}

export function setMuted(muted: boolean): void {
  activeEngine?.setMuted(muted);
}

export function triggerHorn(): void {
  activeEngine?.triggerHorn();
}

export function unmount(): void {
  if (activeEngine) {
    activeEngine.destroy();
    activeEngine = null;
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).RiffanRacing3D = {
    mount,
    setGyroInput,
    setPlayer2Connected,
    setRemoteKey,
    setPlayerCar,
    getPlayerCar,
    setTrack,
    getTrack,
    setAutoGas,
    getAutoGas,
    carCatalog: RACING_CAR_CATALOG,
    trackCatalog: RACING_TRACK_CATALOG,
    cycleCamera,
    resetRace,
    setMuted,
    triggerHorn,
    unmount,
  };
  (window as unknown as Record<string, unknown>).RiffanTvGames = {
    mountPenalty3D,
    mountPingPong3D,
    mountSoccerPong3D,
    mountBowling3D,
    mountTennis3D,
    mountLabyrinth3D,
    mountHexGl3D,
  };
}

