export type RacingCameraMode = 'chase' | 'hood' | 'far';

export interface RacingGyroControlState {
  playerSlot?: 1 | 2;
  steer: number; // -1 (left) .. +1 (right)
  throttle: number; // 0 .. 1
  brake: number; // 0 .. 1
  nitro: boolean;
  handbrake: boolean;
  cameraCycle?: boolean;
  horn?: boolean;
}

export interface RacingCarTelemetry {
  speedKmh: number;
  rpmPct: number;
  gear: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalCars: number;
  nitroPct: number;
  collisionImpact: number;
  offroad: boolean;
  raceState: 'countdown' | 'racing' | 'finished';
  countdownValue: number; // 3, 2, 1, 0
  lapTimeMs: number;
  bestLapMs: number;
  totalTimeMs: number;
  cameraMode: RacingCameraMode;
  wrongWay: boolean;
  splitScreenActive?: boolean;
  p2SpeedKmh?: number;
  p2Lap?: number;
  p2Position?: number;
  p2NitroPct?: number;
  p2CollisionImpact?: number;
}

export interface RacingEngineCallbacks {
  onTelemetry?: (telemetry: RacingCarTelemetry) => void;
  onFinish?: (summary: { position: number; totalTimeMs: number; bestLapMs: number; winnerSlot?: 1 | 2 }) => void;
  onContextLost?: () => void;
}

export interface RacingEngineHandle {
  setGyroInput: (input: Partial<RacingGyroControlState>, expiresInMs?: number, playerSlot?: 1 | 2) => void;
  setPlayer2Connected?: (connected: boolean) => void;
  setKeyboardState: (keys: {
    left?: boolean;
    right?: boolean;
    up?: boolean;
    down?: boolean;
    nitro?: boolean;
    handbrake?: boolean;
  }) => void;
  cycleCamera: () => RacingCameraMode;
  resetRace: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  triggerHorn: () => void;
  destroy: () => void;
}

export const TOTAL_RACE_LAPS = 3;
export const TRACK_HALF_WIDTH = 9.5;
export const TRACK_BARRIER_HALF_WIDTH = 12.2;

export const RIVAL_LIVERIES = [
  { name: 'Riffan Pulse', primary: 0x7c3aed, accent: 0x22d3ee },
  { name: 'Scuderia Corsa', primary: 0xe11d48, accent: 0xfacc15 },
  { name: 'Emerald Apex', primary: 0x10b981, accent: 0xa7f3d0 },
  { name: 'Solar GT', primary: 0xf59e0b, accent: 0xfef08a },
] as const;
