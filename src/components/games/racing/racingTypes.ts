export type RacingCameraMode = 'chase' | 'hood' | 'far';

export type RacingCarId =
  | 'ferrari'
  | 'hypercar'
  | 'endurance'
  | 'rally'
  | 'wedge'
  | 'streamliner';

export interface RacingCarSpec {
  id: RacingCarId;
  name: string;
  category: string;
  glbPath: string;
  aoPath?: string;
  previewPath?: string;
  yawOffset: number;
  primaryHex: number;
  accentHex: number;
  cssColor: string;
  cssAccent: string;
  topSpeed: number;
  boostTopSpeed: number;
  accel: number;
  steerRate: number;
  offroadSpeed: number;
  nitroBurn: number;
  stats: {
    speed: number;
    accel: number;
    handling: number;
  };
}

export const RACING_CAR_CATALOG: readonly RacingCarSpec[] = [
  {
    id: 'ferrari',
    name: 'Scuderia F400 GT',
    category: 'Superdeportivo',
    glbPath: 'assets/games/models/ferrari.glb',
    aoPath: 'assets/games/models/ferrari_ao.png',
    yawOffset: 0,
    primaryHex: 0x7c3aed,
    accentHex: 0x22d3ee,
    cssColor: '#7c3aed',
    cssAccent: '#22d3ee',
    topSpeed: 80,
    boostTopSpeed: 98,
    accel: 35,
    steerRate: 2.15,
    offroadSpeed: 48,
    nitroBurn: 27,
    stats: { speed: 92, accel: 88, handling: 90 },
  },
  {
    id: 'hypercar',
    name: 'Apex Hyperion V12',
    category: 'Hipercoche',
    glbPath: 'assets/games/models/hypercar.glb',
    previewPath: 'assets/games/cars/hypercar-thumb.jpg',
    yawOffset: Math.PI,
    primaryHex: 0xe11d48,
    accentHex: 0xfacc15,
    cssColor: '#e11d48',
    cssAccent: '#facc15',
    topSpeed: 86,
    boostTopSpeed: 104,
    accel: 34,
    steerRate: 2.02,
    offroadSpeed: 45,
    nitroBurn: 29,
    stats: { speed: 99, accel: 86, handling: 82 },
  },
  {
    id: 'endurance',
    name: 'LeMans Prototype 9X',
    category: 'Prototipo LMP',
    glbPath: 'assets/games/models/endurance.glb',
    previewPath: 'assets/games/cars/endurance-thumb.jpg',
    yawOffset: Math.PI,
    primaryHex: 0x0284c7,
    accentHex: 0x38bdf8,
    cssColor: '#0284c7',
    cssAccent: '#38bdf8',
    topSpeed: 83,
    boostTopSpeed: 100,
    accel: 36,
    steerRate: 2.24,
    offroadSpeed: 47,
    nitroBurn: 25,
    stats: { speed: 94, accel: 91, handling: 94 },
  },
  {
    id: 'rally',
    name: 'Urbano RS Turbo',
    category: 'Rally Urbano',
    glbPath: 'assets/games/models/rally.glb',
    previewPath: 'assets/games/cars/rally-thumb.jpg',
    yawOffset: Math.PI,
    primaryHex: 0x10b981,
    accentHex: 0xa7f3d0,
    cssColor: '#10b981',
    cssAccent: '#a7f3d0',
    topSpeed: 76,
    boostTopSpeed: 94,
    accel: 39,
    steerRate: 2.38,
    offroadSpeed: 60,
    nitroBurn: 24,
    stats: { speed: 84, accel: 96, handling: 98 },
  },
  {
    id: 'wedge',
    name: 'Cyber Wedge 88',
    category: 'Concepto Turbo',
    glbPath: 'assets/games/models/wedge.glb',
    previewPath: 'assets/games/cars/wedge-thumb.jpg',
    yawOffset: Math.PI,
    primaryHex: 0xf59e0b,
    accentHex: 0xfef08a,
    cssColor: '#f59e0b',
    cssAccent: '#fef08a',
    topSpeed: 82,
    boostTopSpeed: 99,
    accel: 37,
    steerRate: 2.18,
    offroadSpeed: 49,
    nitroBurn: 24,
    stats: { speed: 91, accel: 92, handling: 89 },
  },
  {
    id: 'streamliner',
    name: 'Silver Arrow GP',
    category: 'Monoplaza Aero',
    glbPath: 'assets/games/models/streamliner.glb',
    previewPath: 'assets/games/cars/streamliner-thumb.jpg',
    yawOffset: Math.PI,
    primaryHex: 0x6366f1,
    accentHex: 0xe0e7ff,
    cssColor: '#6366f1',
    cssAccent: '#e0e7ff',
    topSpeed: 84,
    boostTopSpeed: 102,
    accel: 36,
    steerRate: 2.2,
    offroadSpeed: 46,
    nitroBurn: 26,
    stats: { speed: 96, accel: 90, handling: 91 },
  },
] as const;

export function getRacingCarSpec(id?: string | null): RacingCarSpec {
  return RACING_CAR_CATALOG.find((c) => c.id === id) || RACING_CAR_CATALOG[0];
}

export interface RacingGyroControlState {
  playerSlot?: 1 | 2;
  steer: number; // -1 (left) .. +1 (right)
  throttle: number; // 0 .. 1
  brake: number; // 0 .. 1
  nitro: boolean;
  handbrake: boolean;
  cameraCycle?: boolean;
  horn?: boolean;
  carSelect?: RacingCarId | 'next' | 'prev';
  autoGasToggle?: boolean;
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
  carId?: RacingCarId;
  autoGas?: boolean;
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

export interface RacingEngineOptions {
  initialCarId?: RacingCarId;
  initialAutoGas?: boolean;
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
  setPlayerCar?: (carId: RacingCarId) => void;
  getPlayerCar?: () => RacingCarId;
  setAutoGas?: (enabled: boolean) => void;
  getAutoGas?: () => boolean;
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
