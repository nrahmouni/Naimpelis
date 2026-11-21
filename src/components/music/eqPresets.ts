import type { EqPresetId } from '../../types/music';
import type { MusicLang } from './musicI18n';

export type ExtendedEqPresetId =
  | EqPresetId
  | 'sub_deep'
  | 'reggaeton'
  | 'hiphop'
  | 'pop'
  | 'rock'
  | 'flamenco'
  | 'arabic_oriental'
  | 'jazz'
  | 'classical'
  | 'lofi'
  | 'car_audio'
  | 'night'
  | 'custom';

export const EQ_BAND_FREQUENCIES_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_BAND_LABELS = ['32', '64', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'] as const;

export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

export interface EqPresetDefinition {
  id: ExtendedEqPresetId;
  category: 'studio' | 'bass' | 'urban' | 'vocal' | 'global' | 'custom';
  labels: Record<MusicLang, string>;
  gains: number[];
}

export const EQ_PRESET_LIST: EqPresetDefinition[] = [
  {
    id: 'flat',
    category: 'studio',
    labels: { es: 'Plano', en: 'Flat', fr: 'Neutre', zh: '原声平坦', ca: 'Pla' },
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 'bass',
    category: 'bass',
    labels: { es: 'Sub Bass', en: 'Sub Bass', fr: 'Sub Bass', zh: '重低音', ca: 'Sub Bass' },
    gains: [7, 6, 4.5, 1.5, 0, 0, 0.5, 1.5, 2, 2],
  },
  {
    id: 'sub_deep',
    category: 'bass',
    labels: { es: 'Deep 808', en: 'Deep 808', fr: 'Deep 808', zh: '超深 808', ca: 'Deep 808' },
    gains: [9.5, 7.5, 3.5, 0, -1, 0, 1, 2, 3, 2.5],
  },
  {
    id: 'reggaeton',
    category: 'urban',
    labels: { es: 'Reggaeton / Urbano', en: 'Reggaeton / Urban', fr: 'Reggaeton / Urbain', zh: '雷鬼顿 / 都市', ca: 'Reggaeton / Urbà' },
    gains: [6.5, 6, 4.5, 1, -1.5, 1, 3, 4, 4.5, 3],
  },
  {
    id: 'hiphop',
    category: 'urban',
    labels: { es: 'Hip-Hop / Trap', en: 'Hip-Hop / Trap', fr: 'Hip-Hop / Trap', zh: '嘻哈 / Trap', ca: 'Hip-Hop / Trap' },
    gains: [7.5, 6, 3.5, 0.5, -1.5, 0.5, 2.5, 3.5, 4, 3],
  },
  {
    id: 'club',
    category: 'bass',
    labels: { es: 'Club / EDM', en: 'Club / EDM', fr: 'Club / Électro', zh: '派对 / 电音', ca: 'Club / EDM' },
    gains: [6, 5, 3, 0, -2, 0.5, 2.5, 4.5, 5.5, 5],
  },
  {
    id: 'pop',
    category: 'studio',
    labels: { es: 'Pop Hits', en: 'Pop Hits', fr: 'Pop Hits', zh: '流行金曲', ca: 'Pop Hits' },
    gains: [2, 3, 1.5, -0.5, -1, 1.5, 3.5, 4, 3.5, 2.5],
  },
  {
    id: 'rock',
    category: 'studio',
    labels: { es: 'Rock / Guitarra', en: 'Rock / Guitar', fr: 'Rock / Guitare', zh: '摇滚吉他', ca: 'Rock / Guitarra' },
    gains: [4, 3, 1.5, -1.5, -2, 1, 3.5, 4.5, 5, 4],
  },
  {
    id: 'vocal',
    category: 'vocal',
    labels: { es: 'Voz Clara', en: 'Clear Vocal', fr: 'Voix Claire', zh: '清澈人声', ca: 'Veu Clara' },
    gains: [-3, -2, -1, 0.5, 2.5, 4.5, 5, 4, 2, 1],
  },
  {
    id: 'acoustic',
    category: 'vocal',
    labels: { es: 'Acústico', en: 'Acoustic', fr: 'Acoustique', zh: '原声木吉他', ca: 'Acústic' },
    gains: [2.5, 2, 1.5, 1, 1.5, 2, 3, 3.5, 3, 2],
  },
  {
    id: 'flamenco',
    category: 'global',
    labels: { es: 'Flamenco / Raíz', en: 'Flamenco / Roots', fr: 'Flamenco', zh: '弗拉明戈', ca: 'Flamenc / Arrel' },
    gains: [3, 2.5, 1, 0, 2, 3.5, 4, 3.5, 4, 3],
  },
  {
    id: 'arabic_oriental',
    category: 'global',
    labels: { es: 'Árabe / Chaabi / Raï', en: 'Arabic / Chaabi / Raï', fr: 'Arabe / Chaabi / Raï', zh: '阿拉伯 / Raï', ca: 'Àrab / Chaabi / Raï' },
    gains: [5, 4, 2, 0, 1.5, 3.5, 4.5, 3, 4, 4.5],
  },
  {
    id: 'jazz',
    category: 'studio',
    labels: { es: 'Jazz & Soul', en: 'Jazz & Soul', fr: 'Jazz & Soul', zh: '爵士灵魂', ca: 'Jazz & Soul' },
    gains: [3, 2.5, 1, 1.5, -1, -0.5, 1.5, 2.5, 3.5, 4],
  },
  {
    id: 'classical',
    category: 'studio',
    labels: { es: 'Clásica / Cine', en: 'Classical / OST', fr: 'Classique / OST', zh: '古典 / 原声', ca: 'Clàssica / OST' },
    gains: [2.5, 1.5, 0.5, 0, -0.5, 0, 1.5, 2.5, 3.5, 4.5],
  },
  {
    id: 'lofi',
    category: 'vocal',
    labels: { es: 'Lo-Fi / Chill', en: 'Lo-Fi / Chill', fr: 'Lo-Fi / Chill', zh: 'Lo-Fi 放松', ca: 'Lo-Fi / Chill' },
    gains: [3.5, 4, 2.5, 1, -0.5, -1, -2, -3, -4.5, -6],
  },
  {
    id: 'car_audio',
    category: 'bass',
    labels: { es: 'Coche / Loudness', en: 'Car / Loudness', fr: 'Voiture / Loudness', zh: '车载环绕', ca: 'Cotxe / Loudness' },
    gains: [7, 5.5, 3, -1, -1.5, 1, 3, 4.5, 5.5, 4.5],
  },
  {
    id: 'night',
    category: 'vocal',
    labels: { es: 'Modo Noche', en: 'Night Mode', fr: 'Mode Nuit', zh: '夜间护耳', ca: 'Mode Nit' },
    gains: [-3, -1.5, 0, 1.5, 3, 3.5, 3, 1.5, -1, -2.5],
  },
  {
    id: 'custom',
    category: 'custom',
    labels: { es: 'Personalizado', en: 'Custom', fr: 'Personnalisé', zh: '自定义', ca: 'Personalitzat' },
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
];

export const EQ_PRESETS: Record<ExtendedEqPresetId, EqPresetDefinition> = EQ_PRESET_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ExtendedEqPresetId, EqPresetDefinition>
);

export function clampEqBandDb(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round(Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, val)) * 2) / 2;
}

export function normalizeCustomEqBands(bands?: number[]): number[] {
  return EQ_BAND_FREQUENCIES_HZ.map((_, idx) => clampEqBandDb(bands?.[idx] ?? 0));
}

export function resolveEqGains(preset: ExtendedEqPresetId, customBands?: number[]): number[] {
  if (preset === 'custom') {
    return normalizeCustomEqBands(customBands);
  }
  return EQ_PRESETS[preset]?.gains || EQ_PRESETS.flat.gains;
}
