export type RacingCameraMode = 'chase' | 'hood' | 'far';

export type RacingCarId =
  | 'ferrari'
  | 'hypercar'
  | 'endurance'
  | 'rally'
  | 'streamliner';

export type RacingTrackId =
  | 'metropolis'
  | 'coast'
  | 'alpine'
  | 'neotokyo'
  | 'desert';

export interface RacingCarSpec {
  id: RacingCarId;
  name: string;
  category: string;
  tagline: string;
  glbPath: string;
  aoPath?: string;
  previewPath?: string;
  yawOffset: number;
  shapeVariant: 'gt' | 'hyper' | 'lmp' | 'rally' | 'formula';
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
    category: 'Superdeportivo V8',
    tagline: 'Equilibrio perfecto en curva rápida',
    glbPath: 'assets/games/models/ferrari.glb',
    aoPath: 'assets/games/models/ferrari_ao.png',
    yawOffset: 0,
    shapeVariant: 'gt',
    primaryHex: 0xdc2626,
    accentHex: 0xfacc15,
    cssColor: '#dc2626',
    cssAccent: '#facc15',
    topSpeed: 82,
    boostTopSpeed: 100,
    accel: 36,
    steerRate: 2.18,
    offroadSpeed: 49,
    nitroBurn: 26,
    stats: { speed: 93, accel: 90, handling: 91 },
  },
  {
    id: 'hypercar',
    name: 'Apex Hyperion V12',
    category: 'Hipercoche Biturbo',
    tagline: 'Velocidad punta extrema en rectas',
    glbPath: 'assets/games/models/hypercar.glb',
    previewPath: 'assets/games/cars/hypercar-thumb.jpg',
    yawOffset: Math.PI,
    shapeVariant: 'hyper',
    primaryHex: 0x7c3aed,
    accentHex: 0x22d3ee,
    cssColor: '#7c3aed',
    cssAccent: '#22d3ee',
    topSpeed: 88,
    boostTopSpeed: 106,
    accel: 34,
    steerRate: 2.04,
    offroadSpeed: 45,
    nitroBurn: 29,
    stats: { speed: 99, accel: 86, handling: 83 },
  },
  {
    id: 'endurance',
    name: 'LeMans Prototype 9X',
    category: 'Prototipo LMP1',
    tagline: 'Máxima carga aerodinámica y agarre',
    glbPath: 'assets/games/models/endurance.glb',
    previewPath: 'assets/games/cars/endurance-thumb.jpg',
    yawOffset: Math.PI,
    shapeVariant: 'lmp',
    primaryHex: 0x0284c7,
    accentHex: 0x38bdf8,
    cssColor: '#0284c7',
    cssAccent: '#38bdf8',
    topSpeed: 84,
    boostTopSpeed: 101,
    accel: 37,
    steerRate: 2.28,
    offroadSpeed: 48,
    nitroBurn: 25,
    stats: { speed: 94, accel: 92, handling: 95 },
  },
  {
    id: 'rally',
    name: 'Urbano RS Turbo',
    category: 'Rally 4x4',
    tagline: 'Salida explosiva y control fuera de pista',
    glbPath: 'assets/games/models/rally.glb',
    previewPath: 'assets/games/cars/rally-thumb.jpg',
    yawOffset: Math.PI,
    shapeVariant: 'rally',
    primaryHex: 0x10b981,
    accentHex: 0xa7f3d0,
    cssColor: '#10b981',
    cssAccent: '#a7f3d0',
    topSpeed: 77,
    boostTopSpeed: 96,
    accel: 41,
    steerRate: 2.4,
    offroadSpeed: 64,
    nitroBurn: 23,
    stats: { speed: 85, accel: 97, handling: 98 },
  },
  {
    id: 'streamliner',
    name: 'Silver Arrow GP',
    category: 'Monoplaza Aero',
    tagline: 'Nitro duradero y precisión quirúrgica',
    glbPath: 'assets/games/models/streamliner.glb',
    previewPath: 'assets/games/cars/streamliner-thumb.jpg',
    yawOffset: Math.PI,
    shapeVariant: 'formula',
    primaryHex: 0xf59e0b,
    accentHex: 0xfef08a,
    cssColor: '#f59e0b',
    cssAccent: '#fef08a',
    topSpeed: 85,
    boostTopSpeed: 103,
    accel: 37,
    steerRate: 2.22,
    offroadSpeed: 47,
    nitroBurn: 21,
    stats: { speed: 96, accel: 91, handling: 92 },
  },
] as const;

export function getRacingCarSpec(id?: string | null): RacingCarSpec {
  if (id === 'wedge') return RACING_CAR_CATALOG[4];
  return RACING_CAR_CATALOG.find((c) => c.id === id) || RACING_CAR_CATALOG[0];
}

export interface RacingTrackSpec {
  id: RacingTrackId;
  name: string;
  shortName: string;
  environment: string;
  difficulty: 'Fácil' | 'Media' | 'Alta';
  surfaceLabel: string;
  description: string;
  cssAccent: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  sunGlow: string;
  stars: boolean;
  fogHex: number;
  fogDensity: number;
  hdriPath: string;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  keyColorHex: number;
  keyIntensity: number;
  rimColorHex: number;
  curbPrimaryHex: number;
  curbSecondaryHex: number;
  padColorHex: number;
  svgPath: string;
}

export const RACING_TRACK_CATALOG: readonly RacingTrackSpec[] = [
  {
    id: 'metropolis',
    name: 'Metrópolis GP Nocturno',
    shortName: 'Metrópolis',
    environment: 'Ciudad 3D',
    difficulty: 'Media',
    surfaceLabel: 'Asfalto urbano húmedo',
    description: 'Rascacielos iluminados, chicanes urbanas y rectas rápidas al atardecer.',
    cssAccent: '#8b5cf6',
    skyTop: '#070e22',
    skyMid: '#18305b',
    skyHorizon: '#c26d38',
    sunGlow: 'rgba(251, 191, 36, 0.45)',
    stars: true,
    fogHex: 0x0b152a,
    fogDensity: 0.0022,
    hdriPath: 'assets/games/hdri/evening_road_01_1k.hdr',
    hemiSkyHex: 0xdbeafe,
    hemiGroundHex: 0x1a2e1a,
    hemiIntensity: 0.56,
    keyColorHex: 0xfff4dc,
    keyIntensity: 1.42,
    rimColorHex: 0x93c5fd,
    curbPrimaryHex: 0xdc2626,
    curbSecondaryHex: 0xe2e8f0,
    padColorHex: 0x06b6d4,
    svgPath: 'M 22 72 L 22 24 Q 22 10 42 12 Q 70 16 74 34 Q 76 48 56 54 Q 78 68 74 84 Q 68 92 42 88 Q 22 86 22 72 Z',
  },
  {
    id: 'coast',
    name: 'Riviera Costa Sunset',
    shortName: 'Costa Sunset',
    environment: 'Autopista Costera',
    difficulty: 'Fácil',
    surfaceLabel: 'Asfalto costero rápido',
    description: 'Curvas amplias frente al mar, palmeras y puesta de sol dorada.',
    cssAccent: '#0ea5e9',
    skyTop: '#17153b',
    skyMid: '#9d174d',
    skyHorizon: '#fb923c',
    sunGlow: 'rgba(253, 224, 71, 0.55)',
    stars: false,
    fogHex: 0x3b1f3a,
    fogDensity: 0.0018,
    hdriPath: 'assets/games/hdri/venice_sunset_1k.hdr',
    hemiSkyHex: 0xfde68a,
    hemiGroundHex: 0x0e7490,
    hemiIntensity: 0.64,
    keyColorHex: 0xffedd5,
    keyIntensity: 1.48,
    rimColorHex: 0x38bdf8,
    curbPrimaryHex: 0x0ea5e9,
    curbSecondaryHex: 0xfef3c7,
    padColorHex: 0x38bdf8,
    svgPath: 'M 14 70 L 14 26 Q 16 10 38 14 Q 62 20 82 18 Q 92 32 82 52 Q 66 72 80 86 Q 52 92 26 84 Q 14 82 14 70 Z',
  },
  {
    id: 'alpine',
    name: 'Rally Bosque Alpino',
    shortName: 'Bosque Alpino',
    environment: 'Montaña y Pinos',
    difficulty: 'Alta',
    surfaceLabel: 'Tramo técnico de montaña',
    description: 'Horquillas cerradas entre acantilados de piedra y bosques de pinos.',
    cssAccent: '#10b981',
    skyTop: '#0369a1',
    skyMid: '#38bdf8',
    skyHorizon: '#bae6fd',
    sunGlow: 'rgba(255, 255, 255, 0.45)',
    stars: false,
    fogHex: 0x7dd3fc,
    fogDensity: 0.0017,
    hdriPath: 'assets/games/hdri/puresky_1k.hdr',
    hemiSkyHex: 0xe0f2fe,
    hemiGroundHex: 0x14532d,
    hemiIntensity: 0.72,
    keyColorHex: 0xfffbeb,
    keyIntensity: 1.55,
    rimColorHex: 0x6ee7b7,
    curbPrimaryHex: 0x10b981,
    curbSecondaryHex: 0xf8fafc,
    padColorHex: 0xfacc15,
    svgPath: 'M 20 76 C 14 50 38 44 26 24 C 18 10 50 8 64 20 C 78 32 52 44 74 58 C 92 70 74 90 50 86 C 34 84 24 88 20 76 Z',
  },
  {
    id: 'neotokyo',
    name: 'Estadio Neo-Tokyo Cyber',
    shortName: 'Neo-Tokyo',
    environment: 'Estadio Neón',
    difficulty: 'Media',
    surfaceLabel: 'Pista GP iluminada',
    description: 'Gradas cubiertas, arcos de neón y doble recta de turbo continuo.',
    cssAccent: '#ec4899',
    skyTop: '#040312',
    skyMid: '#1e0a3c',
    skyHorizon: '#701a75',
    sunGlow: 'rgba(236, 72, 153, 0.42)',
    stars: true,
    fogHex: 0x130726,
    fogDensity: 0.0021,
    hdriPath: 'assets/games/hdri/moonless_golf_1k.hdr',
    hemiSkyHex: 0xf5d0fe,
    hemiGroundHex: 0x0f172a,
    hemiIntensity: 0.54,
    keyColorHex: 0xe0f2fe,
    keyIntensity: 1.38,
    rimColorHex: 0xf472b6,
    curbPrimaryHex: 0xec4899,
    curbSecondaryHex: 0x22d3ee,
    padColorHex: 0xf43f5e,
    svgPath: 'M 18 76 L 18 22 Q 18 12 34 12 L 66 12 Q 84 12 84 26 L 84 40 Q 84 52 66 52 L 52 52 Q 44 60 56 68 L 76 68 Q 86 78 72 88 L 32 88 Q 18 88 18 76 Z',
  },
  {
    id: 'desert',
    name: 'Cañón Sahara Sprint',
    shortName: 'Sahara Canyon',
    environment: 'Desierto y Mesetas',
    difficulty: 'Media',
    surfaceLabel: 'Asfalto seco de alta velocidad',
    description: 'Recta infinita del oasis, mesetas rojas y derrapes a más de 320 km/h.',
    cssAccent: '#f59e0b',
    skyTop: '#1e3a8a',
    skyMid: '#d97706',
    skyHorizon: '#fde68a',
    sunGlow: 'rgba(251, 191, 36, 0.55)',
    stars: false,
    fogHex: 0xb45309,
    fogDensity: 0.0017,
    hdriPath: 'assets/games/hdri/lebombo_1k.hdr',
    hemiSkyHex: 0xfef3c7,
    hemiGroundHex: 0x78350f,
    hemiIntensity: 0.68,
    keyColorHex: 0xfff7ed,
    keyIntensity: 1.56,
    rimColorHex: 0xfbbf24,
    curbPrimaryHex: 0xf59e0b,
    curbSecondaryHex: 0xfef3c7,
    padColorHex: 0x22d3ee,
    svgPath: 'M 16 74 L 16 20 Q 20 8 46 12 Q 86 18 88 38 Q 88 54 62 54 Q 44 54 54 70 Q 66 88 36 88 Q 16 88 16 74 Z',
  },
] as const;

export function getRacingTrackSpec(id?: string | null): RacingTrackSpec {
  return RACING_TRACK_CATALOG.find((t) => t.id === id) || RACING_TRACK_CATALOG[0];
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
  trackSelect?: RacingTrackId | 'next' | 'prev';
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
  trackId?: RacingTrackId;
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
  initialTrackId?: RacingTrackId;
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
  setTrack?: (trackId: RacingTrackId) => RacingTrackId;
  getTrack?: () => RacingTrackId;
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
  { name: 'Scuderia Corsa', primary: 0xdc2626, accent: 0xfacc15 },
  { name: 'Riffan Pulse', primary: 0x7c3aed, accent: 0x22d3ee },
  { name: 'Emerald Apex', primary: 0x10b981, accent: 0xa7f3d0 },
  { name: 'Solar GT', primary: 0xf59e0b, accent: 0xfef08a },
] as const;
