import type { AudioEffectId, AudioFxParams } from '../../types/music';
import type { MusicLang } from './musicI18n';

export const AUDIO_FX_LIMITS = {
  minRate: 0.65,
  maxRate: 1.45,
  minReverb: 0,
  maxReverb: 0.85,
  minEcho: 0,
  maxEcho: 0.6,
  minEchoMs: 90,
  maxEchoMs: 480,
  minLowpassHz: 350,
  maxLowpassHz: 20000,
  minHighpassHz: 20,
  maxHighpassHz: 600,
  minSaturation: 0,
  maxSaturation: 1,
  minChorus: 0,
  maxChorus: 0.8,
  minShelfDb: -8,
  maxShelfDb: 10,
} as const;

export const DEFAULT_AUDIO_FX_PARAMS: AudioFxParams = {
  playbackRate: 1,
  preservePitch: true,
  reverbMix: 0,
  echoMix: 0,
  echoTimeMs: 220,
  lowpassHz: 20000,
  highpassHz: 20,
  saturation: 0,
  chorusMix: 0,
  bassBoostDb: 0,
  trebleBoostDb: 0,
};

export interface AudioEffectDefinition {
  id: AudioEffectId;
  params: AudioFxParams;
  labels: Record<MusicLang, string>;
  subs: Record<MusicLang, string>;
}

export const AUDIO_EFFECTS: Record<AudioEffectId, AudioEffectDefinition> = {
  none: {
    id: 'none',
    params: { ...DEFAULT_AUDIO_FX_PARAMS },
    labels: {
      es: 'Original',
      en: 'Original',
      fr: 'Original',
      zh: '原声',
      ca: 'Original',
    },
    subs: {
      es: 'Sonido natural sin coloración',
      en: 'Clean natural master audio',
      fr: 'Son naturel sans coloration',
      zh: '纯净原音无染色',
      ca: 'So natural sense coloració',
    },
  },
  slowed_reverb: {
    id: 'slowed_reverb',
    params: {
      playbackRate: 0.85,
      preservePitch: false,
      reverbMix: 0.48,
      echoMix: 0.12,
      echoTimeMs: 265,
      lowpassHz: 11800,
      highpassHz: 20,
      saturation: 0.12,
      chorusMix: 0.14,
      bassBoostDb: 2.5,
      trebleBoostDb: -1,
    },
    labels: {
      es: 'Slowed + Reverb',
      en: 'Slowed + Reverb',
      fr: 'Slowed + Reverb',
      zh: '慢速 + 混响',
      ca: 'Slowed + Reverb',
    },
    subs: {
      es: '0.85x · Tono profundo y sala envolvente',
      en: '0.85x · Deeper pitch & lush hall tail',
      fr: '0.85x · Grave profond & réverbe ample',
      zh: '0.85倍速 · 深沉降调与空间混响',
      ca: '0.85x · To profund i sala envoltant',
    },
  },
  nightcore: {
    id: 'nightcore',
    params: {
      playbackRate: 1.22,
      preservePitch: false,
      reverbMix: 0.1,
      echoMix: 0,
      echoTimeMs: 180,
      lowpassHz: 20000,
      highpassHz: 28,
      saturation: 0.08,
      chorusMix: 0.08,
      bassBoostDb: 1.5,
      trebleBoostDb: 3.5,
    },
    labels: {
      es: 'Nightcore / Sped Up',
      en: 'Nightcore / Sped Up',
      fr: 'Nightcore / Accéléré',
      zh: 'Nightcore / 加速高音',
      ca: 'Nightcore / Sped Up',
    },
    subs: {
      es: '1.22x · Ritmo rápido y brillo vibrante',
      en: '1.22x · Fast tempo & bright lifted pitch',
      fr: '1.22x · Tempo rapide & éclat aigu',
      zh: '1.22倍速 · 动感加速与清亮高频',
      ca: '1.22x · Ritme ràpid i brillantor vibrant',
    },
  },
  bass_boost: {
    id: 'bass_boost',
    params: {
      playbackRate: 1,
      preservePitch: true,
      reverbMix: 0.06,
      echoMix: 0,
      echoTimeMs: 180,
      lowpassHz: 18500,
      highpassHz: 20,
      saturation: 0.36,
      chorusMix: 0,
      bassBoostDb: 8.5,
      trebleBoostDb: 1.5,
    },
    labels: {
      es: 'Bass Boost Extreme',
      en: 'Bass Boost Extreme',
      fr: 'Bass Boost Extrême',
      zh: '重低音增强',
      ca: 'Bass Boost Extrem',
    },
    subs: {
      es: 'Subgraves profundos + calidez analógica',
      en: 'Deep sub-bass punch + analog warmth',
      fr: 'Basses profondes + chaleur analogique',
      zh: '强劲超重低音 + 模拟饱和感',
      ca: 'Subgreus profunds + calidesa analògica',
    },
  },
  lofi_vinyl: {
    id: 'lofi_vinyl',
    params: {
      playbackRate: 0.94,
      preservePitch: false,
      reverbMix: 0.26,
      echoMix: 0.08,
      echoTimeMs: 210,
      lowpassHz: 4600,
      highpassHz: 95,
      saturation: 0.42,
      chorusMix: 0.28,
      bassBoostDb: 2,
      trebleBoostDb: -4,
    },
    labels: {
      es: 'Lo-Fi / Vinilo',
      en: 'Lo-Fi / Vinyl',
      fr: 'Lo-Fi / Vinyle',
      zh: 'Lo-Fi 黑胶',
      ca: 'Lo-Fi / Vinil',
    },
    subs: {
      es: 'Cinta cálida, agudos suaves y nostalgia',
      en: 'Warm tape saturation & chill soft highs',
      fr: 'Bande chaude, aigus doux & nostalgie',
      zh: '复古磁带质感与柔和温暖音色',
      ca: 'Cinta càlida i aguts suaus',
    },
  },
  underwater: {
    id: 'underwater',
    params: {
      playbackRate: 0.96,
      preservePitch: true,
      reverbMix: 0.42,
      echoMix: 0.18,
      echoTimeMs: 290,
      lowpassHz: 620,
      highpassHz: 20,
      saturation: 0.15,
      chorusMix: 0.26,
      bassBoostDb: 4,
      trebleBoostDb: -6,
    },
    labels: {
      es: 'Bajo el Agua / Club',
      en: 'Underwater / Muffled',
      fr: 'Sous l’eau / Étouffé',
      zh: '水下闷响 / 门外夜店',
      ca: 'Sota l’aigua / Club',
    },
    subs: {
      es: 'Efecto sumergido · como fuera de la disco',
      en: 'Submerged 620 Hz filter + deep club thump',
      fr: 'Filtre immergé 620 Hz & basses profondes',
      zh: '深水低通滤波 + 隔墙脉冲低音',
      ca: 'Filtre submergit 620 Hz i greus profunds',
    },
  },
  stadium_echo: {
    id: 'stadium_echo',
    params: {
      playbackRate: 1,
      preservePitch: true,
      reverbMix: 0.64,
      echoMix: 0.34,
      echoTimeMs: 195,
      lowpassHz: 16500,
      highpassHz: 35,
      saturation: 0.12,
      chorusMix: 0.32,
      bassBoostDb: 2,
      trebleBoostDb: 2,
    },
    labels: {
      es: 'Estadio / Concierto',
      en: 'Stadium / Concert',
      fr: 'Stade / Concert',
      zh: '体育场现场',
      ca: 'Estadi / Concert',
    },
    subs: {
      es: 'Eco en directo y acústica de gran recinto',
      en: 'Live arena echo & huge spatial acoustics',
      fr: 'Écho live & acoustique de grande salle',
      zh: '万人体育场回声与宽广现场声场',
      ca: 'Eco en directe i acústica de gran recinte',
    },
  },
  vaporwave: {
    id: 'vaporwave',
    params: {
      playbackRate: 0.78,
      preservePitch: false,
      reverbMix: 0.56,
      echoMix: 0.26,
      echoTimeMs: 310,
      lowpassHz: 9200,
      highpassHz: 25,
      saturation: 0.18,
      chorusMix: 0.62,
      bassBoostDb: 3,
      trebleBoostDb: -2,
    },
    labels: {
      es: 'Vaporwave / Dreamy',
      en: 'Vaporwave / Dreamy',
      fr: 'Vaporwave / Rêveur',
      zh: '蒸汽波梦幻',
      ca: 'Vaporwave / Dreamy',
    },
    subs: {
      es: '0.78x · Coro estéreo hipnótico y reverb',
      en: '0.78x · Hypnotic stereo chorus & dreamy tail',
      fr: '0.78x · Chorus stéréo hypnotique & réverbe',
      zh: '0.78倍速 · 迷幻立体声合唱与梦境混响',
      ca: '0.78x · Cor estèreo hipnòtic i reverb',
    },
  },
  radio_vintage: {
    id: 'radio_vintage',
    params: {
      playbackRate: 1,
      preservePitch: true,
      reverbMix: 0.08,
      echoMix: 0,
      echoTimeMs: 160,
      lowpassHz: 3400,
      highpassHz: 440,
      saturation: 0.55,
      chorusMix: 0,
      bassBoostDb: 0,
      trebleBoostDb: 1,
    },
    labels: {
      es: 'Radio / Teléfono',
      en: 'Vintage Radio',
      fr: 'Radio Vintage',
      zh: '复古收音机 / 电话',
      ca: 'Ràdio Vintage',
    },
    subs: {
      es: 'Banda estrecha retro 440 Hz – 3.4 kHz',
      en: 'Retro megaphone bandpass 440 Hz – 3.4 kHz',
      fr: 'Bande passante rétro 440 Hz – 3.4 kHz',
      zh: '经典窄带电话失真质感',
      ca: 'Banda estreta retro 440 Hz – 3.4 kHz',
    },
  },
  club_pingpong: {
    id: 'club_pingpong',
    params: {
      playbackRate: 1.04,
      preservePitch: true,
      reverbMix: 0.28,
      echoMix: 0.38,
      echoTimeMs: 150,
      lowpassHz: 19000,
      highpassHz: 24,
      saturation: 0.22,
      chorusMix: 0.24,
      bassBoostDb: 4.5,
      trebleBoostDb: 3,
    },
    labels: {
      es: 'Club Eco DJ',
      en: 'Club DJ Echo',
      fr: 'Club Écho DJ',
      zh: '夜店 DJ 回音',
      ca: 'Club Eco DJ',
    },
    subs: {
      es: 'Delay rítmico + pegada y brillo de cabina',
      en: 'Rhythmic DJ echo + crisp club punch',
      fr: 'Delay rythmique + punch club',
      zh: '节奏型 DJ 延迟 + 舞曲冲击力',
      ca: 'Delay rítmic + pegada de cabina',
    },
  },
  custom: {
    id: 'custom',
    params: { ...DEFAULT_AUDIO_FX_PARAMS },
    labels: {
      es: 'Personalizado',
      en: 'Custom FX',
      fr: 'Personnalisé',
      zh: '自定义音效',
      ca: 'Personalitzat',
    },
    subs: {
      es: 'Tu mezcla exacta de efectos en tiempo real',
      en: 'Your exact live FX rack combination',
      fr: 'Votre mix d’effets sur mesure',
      zh: '你的专属实时音效组合',
      ca: 'La teva mescla d’efectes en directe',
    },
  },
};

export const AUDIO_EFFECT_LIST: AudioEffectDefinition[] = [
  AUDIO_EFFECTS.none,
  AUDIO_EFFECTS.slowed_reverb,
  AUDIO_EFFECTS.nightcore,
  AUDIO_EFFECTS.bass_boost,
  AUDIO_EFFECTS.lofi_vinyl,
  AUDIO_EFFECTS.underwater,
  AUDIO_EFFECTS.stadium_echo,
  AUDIO_EFFECTS.vaporwave,
  AUDIO_EFFECTS.radio_vintage,
  AUDIO_EFFECTS.club_pingpong,
  AUDIO_EFFECTS.custom,
];

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeAudioFxParams(raw?: Partial<AudioFxParams> | null): AudioFxParams {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUDIO_FX_PARAMS };
  return {
    playbackRate: clampNum(raw.playbackRate, AUDIO_FX_LIMITS.minRate, AUDIO_FX_LIMITS.maxRate, 1),
    preservePitch: typeof raw.preservePitch === 'boolean' ? raw.preservePitch : true,
    reverbMix: clampNum(raw.reverbMix, AUDIO_FX_LIMITS.minReverb, AUDIO_FX_LIMITS.maxReverb, 0),
    echoMix: clampNum(raw.echoMix, AUDIO_FX_LIMITS.minEcho, AUDIO_FX_LIMITS.maxEcho, 0),
    echoTimeMs: clampNum(raw.echoTimeMs, AUDIO_FX_LIMITS.minEchoMs, AUDIO_FX_LIMITS.maxEchoMs, 220),
    lowpassHz: clampNum(raw.lowpassHz, AUDIO_FX_LIMITS.minLowpassHz, AUDIO_FX_LIMITS.maxLowpassHz, 20000),
    highpassHz: clampNum(raw.highpassHz, AUDIO_FX_LIMITS.minHighpassHz, AUDIO_FX_LIMITS.maxHighpassHz, 20),
    saturation: clampNum(raw.saturation, AUDIO_FX_LIMITS.minSaturation, AUDIO_FX_LIMITS.maxSaturation, 0),
    chorusMix: clampNum(raw.chorusMix, AUDIO_FX_LIMITS.minChorus, AUDIO_FX_LIMITS.maxChorus, 0),
    bassBoostDb: clampNum(raw.bassBoostDb, AUDIO_FX_LIMITS.minShelfDb, AUDIO_FX_LIMITS.maxShelfDb, 0),
    trebleBoostDb: clampNum(raw.trebleBoostDb, AUDIO_FX_LIMITS.minShelfDb, AUDIO_FX_LIMITS.maxShelfDb, 0),
  };
}

export function resolveAudioFxParams(
  presetId: AudioEffectId,
  customParams?: AudioFxParams
): AudioFxParams {
  if (presetId === 'custom') {
    return normalizeAudioFxParams(customParams);
  }
  const def = AUDIO_EFFECTS[presetId] || AUDIO_EFFECTS.none;
  return { ...def.params };
}

export function hasActiveAudioFx(params: AudioFxParams): boolean {
  return (
    Math.abs(params.playbackRate - 1) > 0.005 ||
    params.reverbMix > 0.01 ||
    params.echoMix > 0.01 ||
    params.lowpassHz < 19500 ||
    params.highpassHz > 25 ||
    params.saturation > 0.01 ||
    params.chorusMix > 0.01 ||
    Math.abs(params.bassBoostDb) > 0.2 ||
    Math.abs(params.trebleBoostDb) > 0.2
  );
}
