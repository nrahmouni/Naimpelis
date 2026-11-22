import type { CanonicalSpatialPresetId, Spatial8dMode, SpatialTrajectory } from '../../types/music';
import type { MusicLang } from './musicI18n';

export interface SpatialPresetConfig {
  id: CanonicalSpatialPresetId;
  crossoverHz: number;
  orbitPeriodSec: number;
  trajectory: SpatialTrajectory;
  radius: number;
  elevationBias: number;
  elevationAmp: number;
  stereoWidth: number;
  centerAnchorMix: number;
  lowAnchorGain: number;
  spatialBranchGain: number;
  warmthDb: number;
  reverbDurationSec: number;
  reverbDecay: number;
  reverbDampHz: number;
  reverbWetMix: number;
  frontAirHz: number;
  rearOcclusionHz: number;
  compressorThresholdDb: number;
  compressorRatio: number;
  rolloffFactor: number;
  names: Record<MusicLang, string>;
  subtitles: Record<MusicLang, string>;
}

export const SPATIAL_PRESETS: Record<CanonicalSpatialPresetId, SpatialPresetConfig> = {
  orbit_drift: {
    id: 'orbit_drift',
    crossoverHz: 140,
    orbitPeriodSec: 7.4,
    trajectory: 'orbit',
    radius: 1.75,
    elevationBias: 0.08,
    elevationAmp: 0.18,
    stereoWidth: 0.86,
    centerAnchorMix: 0.1,
    lowAnchorGain: 1.0,
    spatialBranchGain: 1.02,
    warmthDb: 1.8,
    reverbDurationSec: 1.35,
    reverbDecay: 3.0,
    reverbDampHz: 6400,
    reverbWetMix: 0.24,
    frontAirHz: 19000,
    rearOcclusionHz: 5600,
    compressorThresholdDb: -12,
    compressorRatio: 2.8,
    rolloffFactor: 0.48,
    names: {
      es: 'Órbita Suave',
      en: 'Orbit Drift',
      fr: 'Orbite Douce',
      zh: '柔顺环绕',
      ca: 'Òrbita Suau',
    },
    subtitles: {
      es: 'Giro circular fluido alrededor de tu cabeza con graves firmes y cero fatiga',
      en: 'Smooth 360° circular drift with anchored low-end and relaxed room air',
      fr: 'Rotation circulaire fluide à 360° avec basses ancrées sans fatigue',
      zh: '流畅360°环绕声场，低频稳固居中，久听不累',
      ca: 'Gir circular fluid al voltant del cap amb greus ferms i zero fatiga',
    },
  },
  arena_live: {
    id: 'arena_live',
    crossoverHz: 138,
    orbitPeriodSec: 9.2,
    trajectory: 'elevated',
    radius: 2.25,
    elevationBias: 0.24,
    elevationAmp: 0.38,
    stereoWidth: 0.84,
    centerAnchorMix: 0.14,
    lowAnchorGain: 1.04,
    spatialBranchGain: 1.04,
    warmthDb: 2.2,
    reverbDurationSec: 2.4,
    reverbDecay: 2.05,
    reverbDampHz: 5400,
    reverbWetMix: 0.38,
    frontAirHz: 19200,
    rearOcclusionHz: 5200,
    compressorThresholdDb: -12,
    compressorRatio: 3.0,
    rolloffFactor: 0.4,
    names: {
      es: 'Estadio Envolvente',
      en: 'Arena Live Space',
      fr: 'Stade Enveloppant',
      zh: '震撼体育馆',
      ca: 'Estadi Envolupant',
    },
    subtitles: {
      es: 'Recinto amplio de concierto con reflexión natural y pegada frontal intacta',
      en: 'Expansive live venue acoustics with balanced hall tail and frontal punch',
      fr: 'Grande scène de concert avec réverbération naturelle et frappe frontale',
      zh: '开阔现场演出厅声场，兼具自然混响与正面冲击力',
      ca: 'Recinte ampli de concert amb reflexió natural i pegada frontal intacta',
    },
  },
  deep_3d: {
    id: 'deep_3d',
    crossoverHz: 148,
    orbitPeriodSec: 6.0,
    trajectory: 'figure8',
    radius: 2.0,
    elevationBias: 0.05,
    elevationAmp: 0.42,
    stereoWidth: 0.96,
    centerAnchorMix: 0.04,
    lowAnchorGain: 1.0,
    spatialBranchGain: 1.08,
    warmthDb: 1.6,
    reverbDurationSec: 1.5,
    reverbDecay: 2.8,
    reverbDampHz: 5900,
    reverbWetMix: 0.26,
    frontAirHz: 19600,
    rearOcclusionHz: 3800,
    compressorThresholdDb: -13,
    compressorRatio: 3.2,
    rolloffFactor: 0.56,
    names: {
      es: 'Binaural Profundo',
      en: 'Deep 3D',
      fr: 'Binaural Profond',
      zh: '深度 3D 双耳',
      ca: 'Binaural Profund',
    },
    subtitles: {
      es: 'Separación HRTF tridimensional máxima al frente, arriba y detrás con auriculares',
      en: 'High-contrast 3D HRTF holography wrapping above and behind your head',
      fr: 'Holographie HRTF 3D haute précision autour et derrière la tête',
      zh: '高对比度3D HRTF全息空间感，佩戴耳机体验最佳',
      ca: 'Separació HRTF tridimensional màxima al davant, dalt i darrere',
    },
  },
  dynamic_groove: {
    id: 'dynamic_groove',
    crossoverHz: 145,
    orbitPeriodSec: 4.8,
    trajectory: 'orbit',
    radius: 1.75,
    elevationBias: 0.06,
    elevationAmp: 0.22,
    stereoWidth: 0.9,
    centerAnchorMix: 0.12,
    lowAnchorGain: 1.08,
    spatialBranchGain: 1.04,
    warmthDb: 3.0,
    reverbDurationSec: 0.95,
    reverbDecay: 3.6,
    reverbDampHz: 6800,
    reverbWetMix: 0.17,
    frontAirHz: 19500,
    rearOcclusionHz: 6800,
    compressorThresholdDb: -11,
    compressorRatio: 3.5,
    rolloffFactor: 0.45,
    names: {
      es: 'Pulso Dinámico',
      en: 'Dynamic Groove',
      fr: 'Pulsation Dynamique',
      zh: '律动节拍',
      ca: 'Pols Dinàmic',
    },
    subtitles: {
      es: 'Movimiento ágil, subgrave sólido y agudos limpios sin embarrar el ritmo',
      en: 'Agile rhythmic motion, tight sub-bass anchor and crisp percussion clarity',
      fr: 'Mouvement rythmique vif, graves solides et aigus nets pour le groove',
      zh: '灵动节拍轨迹，低音紧实不浑浊，节奏明快透亮',
      ca: 'Moviment àgil, subgreu sòlid i aguts nets sense enfangar el ritme',
    },
  },
  intimate_room: {
    id: 'intimate_room',
    crossoverHz: 135,
    orbitPeriodSec: 8.6,
    trajectory: 'pendulum',
    radius: 1.35,
    elevationBias: 0.02,
    elevationAmp: 0.1,
    stereoWidth: 0.76,
    centerAnchorMix: 0.16,
    lowAnchorGain: 0.98,
    spatialBranchGain: 0.98,
    warmthDb: 1.4,
    reverbDurationSec: 0.78,
    reverbDecay: 4.0,
    reverbDampHz: 5000,
    reverbWetMix: 0.18,
    frontAirHz: 17000,
    rearOcclusionHz: 6200,
    compressorThresholdDb: -14,
    compressorRatio: 2.5,
    rolloffFactor: 0.34,
    names: {
      es: 'Cámara Íntima',
      en: 'Intimate Room',
      fr: 'Salon Intime',
      zh: '私享室内声场',
      ca: 'Cambra Íntima',
    },
    subtitles: {
      es: 'Estudio cercano de madera cálida ideal para voces, acústico y escucha nocturna',
      en: 'Warm close-field acoustic booth tailored for vocals, jazz and late-night focus',
      fr: 'Studio chaleureux de proximité idéal pour les voix, l’acoustique et le soir',
      zh: '近场温暖木质录音室氛围，适合人声、原声与深夜聆听',
      ca: 'Estudi proper de fusta càlida ideal per a veus, acústic i escolta nocturna',
    },
  },
};

export const SPATIAL_PRESET_ORDER: CanonicalSpatialPresetId[] = [
  'orbit_drift',
  'arena_live',
  'deep_3d',
  'dynamic_groove',
  'intimate_room',
];

export const SPATIAL_PRESET_LIST: SpatialPresetConfig[] = SPATIAL_PRESET_ORDER.map(
  (id) => SPATIAL_PRESETS[id]
);

export function normalizeSpatialPresetId(
  mode?: Spatial8dMode | string | null
): CanonicalSpatialPresetId {
  switch (mode) {
    case 'arena_live':
    case 'concert':
      return 'arena_live';
    case 'deep_3d':
      return 'deep_3d';
    case 'dynamic_groove':
    case 'club':
      return 'dynamic_groove';
    case 'intimate_room':
      return 'intimate_room';
    case 'orbit_drift':
    case 'orbit':
    default:
      return 'orbit_drift';
  }
}

export function getSpatialPresetConfig(mode?: Spatial8dMode | string | null): SpatialPresetConfig {
  return SPATIAL_PRESETS[normalizeSpatialPresetId(mode)];
}
