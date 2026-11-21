import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioFxParams, Spatial8dMode, VocalStemMode } from '../types/music';
import { DEFAULT_AUDIO_FX_PARAMS } from '../components/music/audioEffects';

export interface UseAudio8DOptions {
  /** Ref al elemento `<audio>` o `<video>` cuya señal será espacializada */
  mediaElementRef: React.RefObject<HTMLMediaElement | null>;
  /** Indica si la reproducción está activa para avanzar la órbita LFO */
  isPlaying?: boolean;
  /** Indica si el motor HTMLMediaElement es la salida activa actual */
  isActiveBackend?: boolean;
  /** Estado inicial no controlado (por defecto: false) */
  initialEnabled?: boolean;
  /** Velocidad inicial en segundos por vuelta completa (2s..25s, por defecto: 10s) */
  initialSpeed?: number;
  /** Mezcla Wet inicial de reverberación de sala (0.0..0.6, por defecto: 0.25) */
  initialReverbAmount?: number;
  /** Radio inicial de la órbita espacial en metros virtuales (por defecto: 1.8) */
  initialDepth?: number;
  /** Prop controlada opcional para sincronizar activación con store externo */
  enabled?: boolean;
  /** Perfil espacial 8D activo ('orbit' | 'concert' | 'club') */
  spatialMode?: Spatial8dMode;
  /** Mezcla de pista en tiempo real ('both' | 'vocals' | 'instrumental') */
  stemMode?: VocalStemMode;
  /** Efectos de audio en tiempo real (Slowed+Reverb, Nightcore, Bass, Lo-Fi, Bajo el Agua, Estadio, etc.) */
  fxParams?: AudioFxParams;
  /** Prop controlada opcional para velocidad de rotación (s/vuelta) */
  speed?: number;
  /** Prop controlada opcional para mezcla Wet de reverb (0.0..0.6) */
  reverbAmount?: number;
  /** Prop controlada opcional para radio/profundidad orbital */
  depth?: number;
  /** Ganancias en dB para ecualizador ISO de 10 bandas [32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k] */
  eqGainsDb?: number[];
  /** Callbacks opcionales para modo controlado */
  onEnabledChange?: (enabled: boolean) => void;
  onSpeedChange?: (speed: number) => void;
  onReverbAmountChange?: (amount: number) => void;
  onDepthChange?: (depth: number) => void;
}

export interface Audio8DTelemetry {
  angleRad: number;
  x: number;
  y: number;
  z: number;
  occlusionCutoffHz: number;
  isWebAudioActive: boolean;
}

export interface UseAudio8DReturn {
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;
  toggle: () => void;
  speed: number;
  setSpeed: (secondsPerOrbit: number) => void;
  reverbAmount: number;
  setReverbAmount: (amount: number) => void;
  depth: number;
  setDepth: (radius: number) => void;
  resumeAudioContext: () => Promise<void>;
  getTelemetry: () => Audio8DTelemetry;
  getAnalyserNode: () => AnalyserNode | null;
}

interface CachedMediaSource {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
}

/**
 * Caché por instancia DOM para cumplir la restricción de Web Audio API:
 * un HTMLMediaElement solo puede vincularse una única vez a createMediaElementSource().
 */
const mediaSourceCache = new WeakMap<HTMLMediaElement, CachedMediaSource>();

const EQ_FREQUENCIES_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const AUDIO_8D_LIMITS = {
  minSpeedSec: 2,
  maxSpeedSec: 25,
  defaultSpeedSec: 10,
  minReverb: 0.0,
  maxReverb: 0.6,
  defaultReverb: 0.25,
  minDepth: 0.6,
  maxDepth: 3.5,
  defaultDepth: 1.8,
  frontCutoffHz: 20000,
  sideCutoffHz: 11200,
  rearCutoffHz: 3200,
} as const;

export function clamp8dSpeed(val: number): number {
  if (!Number.isFinite(val)) return AUDIO_8D_LIMITS.defaultSpeedSec;
  return Math.min(AUDIO_8D_LIMITS.maxSpeedSec, Math.max(AUDIO_8D_LIMITS.minSpeedSec, val));
}

export function clamp8dReverb(val: number): number {
  if (!Number.isFinite(val)) return AUDIO_8D_LIMITS.defaultReverb;
  return Math.min(AUDIO_8D_LIMITS.maxReverb, Math.max(AUDIO_8D_LIMITS.minReverb, val));
}

export function clamp8dDepth(val: number): number {
  if (!Number.isFinite(val)) return AUDIO_8D_LIMITS.defaultDepth;
  return Math.min(AUDIO_8D_LIMITS.maxDepth, Math.max(AUDIO_8D_LIMITS.minDepth, val));
}

/** Registro global de contextos activos para desbloqueo síncrono en el primer gesto táctil */
const registeredAudioContexts = new Set<AudioContext>();

export function unlockGlobalAudio8dContexts(): void {
  registeredAudioContexts.forEach((ctx) => {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  });
}

/**
 * Genera matemáticamente un Impulse Response (IR) estéreo limpio de ~2.05s
 * con reflexiones tempranas decorreladas L/R y recorte de subgraves
 * para crear sensación de sala de conciertos real mientras la voz gira alrededor.
 */
function generateCleanHallImpulseResponse(
  ctx: AudioContext,
  durationSec = 2.05,
  decayPower = 2.55
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const irBuffer = ctx.createBuffer(2, length, sampleRate);

  const earlyTapTimesSec = [0.009, 0.019, 0.032, 0.049, 0.071, 0.098];
  const hpAlpha = Math.exp((-2 * Math.PI * 185) / sampleRate);
  const lpAlpha = Math.exp((-2 * Math.PI * 7600) / sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const channelData = irBuffer.getChannelData(channel);
    let prevRaw = 0;
    let prevHp = 0;
    let prevLp = 0;

    for (let i = 0; i < length; i++) {
      const progress = i / length;
      const white = Math.random() * 2 - 1;

      const hp = hpAlpha * (prevHp + white - prevRaw);
      prevRaw = white;
      prevHp = hp;

      const lp = (1 - lpAlpha) * hp + lpAlpha * prevLp;
      prevLp = lp;

      const attackEnv = Math.min(1, i / Math.max(1, sampleRate * 0.008));
      const decayEnv = Math.pow(1 - progress, decayPower);
      channelData[i] = lp * attackEnv * decayEnv * 0.56;
    }

    earlyTapTimesSec.forEach((tapSec, idx) => {
      const stereoOffset = channel === 0 ? 0 : 0.0062;
      const tapIndex = Math.floor((tapSec + stereoOffset) * sampleRate);
      if (tapIndex > 0 && tapIndex < length) {
        channelData[tapIndex] += (channel === 0 ? 1 : -1) * (0.22 / (idx + 1));
      }
    });
  }

  return irBuffer;
}

/**
 * Curva analógica suave de saturación (Soft-Clip / Tape Warmth) para Bass Boost, Lo-Fi y Radio Vintage.
 */
function buildSoftSaturationCurve(driveAmount = 4.2, samples = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  const norm = Math.tanh(driveAmount) || 1;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * driveAmount) / norm;
  }
  return curve;
}

function configureFrontPositiveListener(ctx: AudioContext) {
  const listener = ctx.listener;
  if (!listener) return;
  try {
    if ('positionX' in listener && listener.positionX) {
      listener.positionX.value = 0;
      listener.positionY.value = 0;
      listener.positionZ.value = 0;
      listener.forwardX.value = 0;
      listener.forwardY.value = 0;
      listener.forwardZ.value = 1;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else if (
      typeof (listener as unknown as { setPosition?: (...args: number[]) => void }).setPosition ===
      'function'
    ) {
      (listener as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(
        0,
        0,
        0
      );
      (listener as unknown as { setOrientation: (...args: number[]) => void }).setOrientation(
        0,
        0,
        1,
        0,
        1,
        0
      );
    }
  } catch {
    // Algunos navegadores restringen propiedades de solo lectura en ciertos estados
  }
}

/**
 * Calcula la frecuencia de corte del filtro paso bajo de oclusión craneal:
 * - Frente (z > 0): entre 11.2 kHz (lateral) y 20 kHz (frente directo)
 * - Atrás (z < 0): desciende suavemente hasta 3.2 kHz simulando bloqueo físico del cráneo
 */
function computeSkullOcclusionCutoff(z: number, radiusZ: number): number {
  const normZ = Math.max(-1, Math.min(1, z / Math.max(0.2, radiusZ)));
  if (normZ >= 0) {
    return (
      AUDIO_8D_LIMITS.sideCutoffHz +
      (AUDIO_8D_LIMITS.frontCutoffHz - AUDIO_8D_LIMITS.sideCutoffHz) * Math.pow(normZ, 0.85)
    );
  }
  const rearDepth = Math.abs(normZ);
  const smoothRear = 0.5 - 0.5 * Math.cos(rearDepth * Math.PI);
  return (
    AUDIO_8D_LIMITS.sideCutoffHz -
    (AUDIO_8D_LIMITS.sideCutoffHz - AUDIO_8D_LIMITS.rearCutoffHz) * smoothRear
  );
}

/**
 * Hook DSP completo para Riffan Music:
 * 1) Ecualizador ISO de 10 bandas (32 Hz – 16 kHz) con protección automática de headroom.
 * 2) Separador de Pistas en Tiempo Real (Mid/Side + Spectral):
 *    - 'both': Estéreo original completo.
 *    - 'vocals': Solo Voz (extrae canal Mid central, filtra <210Hz y realza presencia vocal 2.3kHz).
 *    - 'instrumental': Solo Base (conserva graves <175Hz intactos + extrae campo estéreo L-R sin voz principal).
 * 3) Motor 8D Binaural Profesional:
 *    - Fuente puntual enfocada (channelCount=1) -> PannerNode HRTF en órbita 360° real.
 *    - Sombreado craneal dinámico por oído (Rayleigh Head-Shadow LPF + ILD L/R sincronizado).
 *    - Oclusión física trasera (Lowpass 20kHz->3.2kHz + muesca pinna -3.5dB @ 7.2kHz).
 *    - Reverb de sala fija pre-órbita (Convolver 2.05s) + ancla de subgraves (<105Hz) + DynamicsCompressor.
 *    - Resiliencia con pantalla bloqueada (rAF + fallback setInterval 80ms).
 */
export function useAudio8D(options: UseAudio8DOptions): UseAudio8DReturn {
  const {
    mediaElementRef,
    isPlaying = false,
    isActiveBackend = true,
    initialEnabled = false,
    initialSpeed = AUDIO_8D_LIMITS.defaultSpeedSec,
    initialReverbAmount = AUDIO_8D_LIMITS.defaultReverb,
    initialDepth = AUDIO_8D_LIMITS.defaultDepth,
    enabled: controlledEnabled,
    spatialMode = 'orbit',
    stemMode = 'both',
    fxParams = DEFAULT_AUDIO_FX_PARAMS,
    speed: controlledSpeed,
    reverbAmount: controlledReverb,
    depth: controlledDepth,
    eqGainsDb,
    onEnabledChange,
    onSpeedChange,
    onReverbAmountChange,
    onDepthChange,
  } = options;

  const [internalEnabled, setInternalEnabled] = useState(initialEnabled);
  const [internalSpeed, setInternalSpeed] = useState(() => clamp8dSpeed(initialSpeed));
  const [internalReverb, setInternalReverb] = useState(() => clamp8dReverb(initialReverbAmount));
  const [internalDepth, setInternalDepth] = useState(() => clamp8dDepth(initialDepth));

  const isEnabled = controlledEnabled !== undefined ? controlledEnabled : internalEnabled;
  const speed = clamp8dSpeed(controlledSpeed !== undefined ? controlledSpeed : internalSpeed);
  const reverbAmount = clamp8dReverb(
    controlledReverb !== undefined ? controlledReverb : internalReverb
  );
  const depth = clamp8dDepth(controlledDepth !== undefined ? controlledDepth : internalDepth);

  // Refs mutables para el bucle continuo sin recrear el grafo de nodos
  const enabledRef = useRef(isEnabled);
  const spatialModeRef = useRef<Spatial8dMode>(spatialMode);
  const stemModeRef = useRef<VocalStemMode>(stemMode);
  const fxParamsRef = useRef<AudioFxParams>(fxParams);
  const speedRef = useRef(speed);
  const reverbRef = useRef(reverbAmount);
  const depthRef = useRef(depth);
  const isPlayingRef = useRef(isPlaying);
  const isActiveBackendRef = useRef(isActiveBackend);

  enabledRef.current = isEnabled;
  spatialModeRef.current = spatialMode;
  stemModeRef.current = stemMode;
  fxParamsRef.current = fxParams;
  speedRef.current = speed;
  reverbRef.current = reverbAmount;
  depthRef.current = depth;
  isPlayingRef.current = isPlaying;
  isActiveBackendRef.current = isActiveBackend;

  // Refs de nodos Web Audio
  const ctxRef = useRef<AudioContext | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const preOutGainRef = useRef<GainNode | null>(null);

  // FX Studio refs
  const fxHighpassRef = useRef<BiquadFilterNode | null>(null);
  const fxBassShelfRef = useRef<BiquadFilterNode | null>(null);
  const fxTrebleShelfRef = useRef<BiquadFilterNode | null>(null);
  const fxSatDryGainRef = useRef<GainNode | null>(null);
  const fxSatWetGainRef = useRef<GainNode | null>(null);
  const fxPostSatTrimRef = useRef<GainNode | null>(null);
  const fxLowpassRef = useRef<BiquadFilterNode | null>(null);
  const fxChorusWetGainRef = useRef<GainNode | null>(null);
  const fxEchoDelayRef = useRef<DelayNode | null>(null);
  const fxEchoFeedbackRef = useRef<GainNode | null>(null);
  const fxEchoWetGainRef = useRef<GainNode | null>(null);
  const fxReverbStandaloneWetRef = useRef<GainNode | null>(null);

  // Stem mode gains
  const stemBothStereoGainRef = useRef<GainNode | null>(null);
  const stemVocalsGainRef = useRef<GainNode | null>(null);
  const stemInstStereoGainRef = useRef<GainNode | null>(null);
  const stemInstMonoGainRef = useRef<GainNode | null>(null);

  // Spatial 8D nodes
  const bypassGainRef = useRef<GainNode | null>(null);
  const spatialMasterGainRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<PannerNode | null>(null);
  const leftShadowLpRef = useRef<BiquadFilterNode | null>(null);
  const rightShadowLpRef = useRef<BiquadFilterNode | null>(null);
  const leftEarGainRef = useRef<GainNode | null>(null);
  const rightEarGainRef = useRef<GainNode | null>(null);
  const occlusionFilterRef = useRef<BiquadFilterNode | null>(null);
  const pinnaRearNotchRef = useRef<BiquadFilterNode | null>(null);
  const subAnchorGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const telemetryRef = useRef<Audio8DTelemetry>({
    angleRad: 0,
    x: 0,
    y: 0,
    z: depth,
    occlusionCutoffHz: AUDIO_8D_LIMITS.frontCutoffHz,
    isWebAudioActive: false,
  });

  const resumeAudioContext = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignorado si el navegador aún exige interacción del usuario
      }
    }
  }, []);

  const setIsEnabled = useCallback(
    (next: boolean) => {
      if (controlledEnabled === undefined) {
        setInternalEnabled(next);
      }
      onEnabledChange?.(next);
      void resumeAudioContext();
    },
    [controlledEnabled, onEnabledChange, resumeAudioContext]
  );

  const toggle = useCallback(() => {
    setIsEnabled(!enabledRef.current);
  }, [setIsEnabled]);

  const setSpeed = useCallback(
    (secondsPerOrbit: number) => {
      const clamped = clamp8dSpeed(secondsPerOrbit);
      if (controlledSpeed === undefined) {
        setInternalSpeed(clamped);
      }
      onSpeedChange?.(clamped);
    },
    [controlledSpeed, onSpeedChange]
  );

  const setReverbAmount = useCallback(
    (amount: number) => {
      const clamped = clamp8dReverb(amount);
      if (controlledReverb === undefined) {
        setInternalReverb(clamped);
      }
      onReverbAmountChange?.(clamped);
    },
    [controlledReverb, onReverbAmountChange]
  );

  const setDepth = useCallback(
    (radius: number) => {
      const clamped = clamp8dDepth(radius);
      if (controlledDepth === undefined) {
        setInternalDepth(clamped);
      }
      onDepthChange?.(clamped);
    },
    [controlledDepth, onDepthChange]
  );

  // Construcción y limpieza completa del grafo Web Audio API
  useEffect(() => {
    const mediaEl = mediaElementRef.current;
    if (!mediaEl || typeof window === 'undefined') return;

    if (!mediaEl.crossOrigin) {
      mediaEl.crossOrigin = 'anonymous';
    }

    const AudioCtxCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return;

    let cached = mediaSourceCache.get(mediaEl);
    if (!cached) {
      const ctx = new AudioCtxCtor();
      const source = ctx.createMediaElementSource(mediaEl);
      cached = { ctx, source };
      mediaSourceCache.set(mediaEl, cached);
    }

    const { ctx, source } = cached;
    ctxRef.current = ctx;
    registeredAudioContexts.add(ctx);
    configureFrontPositiveListener(ctx);

    try {
      source.disconnect();
    } catch {
      // Sin conexiones previas
    }

    // ------------------------------------------------------------------
    // 1. CADENA EQ DE 10 BANDAS ISO + COMPENSACIÓN DE HEADROOM
    // ------------------------------------------------------------------
    const eqFilters = EQ_FREQUENCIES_HZ.map((freq, idx) => {
      const filter = ctx.createBiquadFilter();
      filter.type =
        idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES_HZ.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = idx === 0 || idx === EQ_FREQUENCIES_HZ.length - 1 ? 0.75 : 1.35;
      const g = eqGainsDb?.[idx] ?? 0;
      filter.gain.value = Math.max(-12, Math.min(12, Number.isFinite(g) ? g : 0));
      return filter;
    });

    const preOutGain = ctx.createGain();
    const peakBoost = eqFilters.reduce((acc, f) => Math.max(acc, Math.max(0, f.gain.value)), 0);
    preOutGain.gain.value = peakBoost > 4 ? Math.max(0.68, 1 - (peakBoost - 4) * 0.045) : 1;

    let cursor: AudioNode = source;
    for (const eqFilter of eqFilters) {
      cursor.connect(eqFilter);
      cursor = eqFilter;
    }
    cursor.connect(preOutGain);

    // ------------------------------------------------------------------
    // 1B. RACK DE EFECTOS EN TIEMPO REAL (FX STUDIO)
    //     Highpass -> Bass/Treble Shelf -> Tape Saturation -> Lowpass -> Chorus & Echo
    // ------------------------------------------------------------------
    const initFx = fxParamsRef.current || DEFAULT_AUDIO_FX_PARAMS;

    const fxHighpass = ctx.createBiquadFilter();
    fxHighpass.type = 'highpass';
    fxHighpass.frequency.value = initFx.highpassHz;
    fxHighpass.Q.value = 0.72;

    const fxBassShelf = ctx.createBiquadFilter();
    fxBassShelf.type = 'lowshelf';
    fxBassShelf.frequency.value = 90;
    fxBassShelf.gain.value = initFx.bassBoostDb;

    const fxTrebleShelf = ctx.createBiquadFilter();
    fxTrebleShelf.type = 'highshelf';
    fxTrebleShelf.frequency.value = 9500;
    fxTrebleShelf.gain.value = initFx.trebleBoostDb;

    const fxSatDryGain = ctx.createGain();
    fxSatDryGain.gain.value = 1 - initFx.saturation * 0.65;
    const fxSatShaper = ctx.createWaveShaper();
    fxSatShaper.curve = buildSoftSaturationCurve(4.2);
    fxSatShaper.oversample = '2x';
    const fxSatWetGain = ctx.createGain();
    fxSatWetGain.gain.value = initFx.saturation * 0.65;
    const fxPostSatTrim = ctx.createGain();
    fxPostSatTrim.gain.value =
      initFx.bassBoostDb > 4 ? Math.max(0.68, 1 - (initFx.bassBoostDb - 4) * 0.045) : 1;

    const fxLowpass = ctx.createBiquadFilter();
    fxLowpass.type = 'lowpass';
    fxLowpass.frequency.value = initFx.lowpassHz;
    fxLowpass.Q.value = 0.75;

    // Stereo Shimmer Chorus (para Vaporwave, Slowed, Lo-Fi y Estadio)
    const fxChorusDelay = ctx.createDelay(0.1);
    fxChorusDelay.delayTime.value = 0.018;
    const fxChorusLfo = ctx.createOscillator();
    fxChorusLfo.type = 'sine';
    fxChorusLfo.frequency.value = 1.25;
    const fxChorusLfoDepth = ctx.createGain();
    fxChorusLfoDepth.gain.value = 0.0042;
    fxChorusLfo.connect(fxChorusLfoDepth);
    fxChorusLfoDepth.connect(fxChorusDelay.delayTime);
    fxChorusLfo.start();
    const fxChorusWetGain = ctx.createGain();
    fxChorusWetGain.gain.value = initFx.chorusMix * 0.45;

    // Stereo Feedback Echo (para Estadio, Club DJ, Underwater, Slowed)
    const fxEchoDelay = ctx.createDelay(1.0);
    fxEchoDelay.delayTime.value = initFx.echoTimeMs / 1000;
    const fxEchoFeedback = ctx.createGain();
    fxEchoFeedback.gain.value = Math.min(0.55, initFx.echoMix * 0.72);
    const fxEchoDampLp = ctx.createBiquadFilter();
    fxEchoDampLp.type = 'lowpass';
    fxEchoDampLp.frequency.value = 4600;
    const fxEchoWetGain = ctx.createGain();
    fxEchoWetGain.gain.value = initFx.echoMix * 0.58;

    const fxStageOut = ctx.createGain();

    preOutGain.connect(fxHighpass);
    fxHighpass.connect(fxBassShelf);
    fxBassShelf.connect(fxTrebleShelf);

    fxTrebleShelf.connect(fxSatDryGain);
    fxSatDryGain.connect(fxPostSatTrim);
    fxTrebleShelf.connect(fxSatShaper);
    fxSatShaper.connect(fxSatWetGain);
    fxSatWetGain.connect(fxPostSatTrim);

    fxPostSatTrim.connect(fxLowpass);
    fxLowpass.connect(fxStageOut);

    fxLowpass.connect(fxChorusDelay);
    fxChorusDelay.connect(fxChorusWetGain);
    fxChorusWetGain.connect(fxStageOut);

    fxLowpass.connect(fxEchoDelay);
    fxEchoDelay.connect(fxEchoDampLp);
    fxEchoDampLp.connect(fxEchoFeedback);
    fxEchoFeedback.connect(fxEchoDelay);
    fxEchoDampLp.connect(fxEchoWetGain);
    fxEchoWetGain.connect(fxStageOut);

    // ------------------------------------------------------------------
    // 2. SEPARADOR DE PISTAS EN TIEMPO REAL ('both' | 'vocals' | 'instrumental')
    // ------------------------------------------------------------------
    const stemStereoOut = ctx.createGain(); // salida estéreo hacia Bypass + Reverb fija
    const stemMonoFor8d = ctx.createGain(); // punto focal no-cancelable hacia motor 8D

    const stemSplitter = ctx.createChannelSplitter(2);
    fxStageOut.connect(stemSplitter);

    // 2A. Modo 'both' (estéreo puro bit-exacto)
    const stemBothStereoGain = ctx.createGain();
    stemBothStereoGain.gain.value = stemModeRef.current === 'both' ? 1 : 0;
    fxStageOut.connect(stemBothStereoGain);
    stemBothStereoGain.connect(stemStereoOut);
    stemBothStereoGain.connect(stemMonoFor8d);

    // Sumador Mid común: 0.5 * (L + R)
    const midBus = ctx.createGain();
    const midLeftTap = ctx.createGain();
    midLeftTap.gain.value = 0.5;
    const midRightTap = ctx.createGain();
    midRightTap.gain.value = 0.5;
    stemSplitter.connect(midLeftTap, 0);
    stemSplitter.connect(midRightTap, 1);
    midLeftTap.connect(midBus);
    midRightTap.connect(midBus);

    // 2B. Modo 'vocals' (Solo Voz: aísla el canal central vocal y limpia subgraves/platillos)
    const vocalHp = ctx.createBiquadFilter();
    vocalHp.type = 'highpass';
    vocalHp.frequency.value = 210;
    vocalHp.Q.value = 0.85;

    const vocalPresence = ctx.createBiquadFilter();
    vocalPresence.type = 'peaking';
    vocalPresence.frequency.value = 2300;
    vocalPresence.Q.value = 0.95;
    vocalPresence.gain.value = 5.5;

    const vocalLp = ctx.createBiquadFilter();
    vocalLp.type = 'lowpass';
    vocalLp.frequency.value = 7600;
    vocalLp.Q.value = 0.75;

    const stemVocalsGain = ctx.createGain();
    stemVocalsGain.gain.value = stemModeRef.current === 'vocals' ? 1.38 : 0;

    midBus.connect(vocalHp);
    vocalHp.connect(vocalPresence);
    vocalPresence.connect(vocalLp);
    vocalLp.connect(stemVocalsGain);
    stemVocalsGain.connect(stemStereoOut);
    stemVocalsGain.connect(stemMonoFor8d);

    // 2C. Modo 'instrumental' (Solo Base: graves/bombo intactos + campo estéreo L-R sin voz central)
    const bassKeepLp = ctx.createBiquadFilter();
    bassKeepLp.type = 'lowpass';
    bassKeepLp.frequency.value = 175;
    bassKeepLp.Q.value = 0.75;
    const bassKeepGain = ctx.createGain();
    bassKeepGain.gain.value = 0.88;
    midBus.connect(bassKeepLp);
    bassKeepLp.connect(bassKeepGain);

    // Side = L - R (> 175 Hz)
    const sideRawBus = ctx.createGain();
    const sidePlusL = ctx.createGain();
    sidePlusL.gain.value = 1;
    const sideMinusR = ctx.createGain();
    sideMinusR.gain.value = -1;
    stemSplitter.connect(sidePlusL, 0);
    stemSplitter.connect(sideMinusR, 1);
    sidePlusL.connect(sideRawBus);
    sideMinusR.connect(sideRawBus);

    const sideBandHp = ctx.createBiquadFilter();
    sideBandHp.type = 'highpass';
    sideBandHp.frequency.value = 175;
    sideBandHp.Q.value = 0.75;
    const sideInvertR = ctx.createGain();
    sideInvertR.gain.value = -1;

    sideRawBus.connect(sideBandHp);
    sideBandHp.connect(sideInvertR);

    const instMerger = ctx.createChannelMerger(2);
    // Canal L = bass + side; Canal R = bass - side (M/S puro para estéreo)
    bassKeepGain.connect(instMerger, 0, 0);
    sideBandHp.connect(instMerger, 0, 0);
    bassKeepGain.connect(instMerger, 0, 1);
    sideInvertR.connect(instMerger, 0, 1);

    const stemInstStereoGain = ctx.createGain();
    stemInstStereoGain.gain.value = stemModeRef.current === 'instrumental' ? 1.12 : 0;
    instMerger.connect(stemInstStereoGain);
    stemInstStereoGain.connect(stemStereoOut);

    // Para el motor 8D mono, sumamos bassKeep + sideBand sin inversión (-side) para evitar cancelación L+R
    const instMonoSum = ctx.createGain();
    bassKeepGain.connect(instMonoSum);
    sideBandHp.connect(instMonoSum);
    const stemInstMonoGain = ctx.createGain();
    stemInstMonoGain.gain.value = stemModeRef.current === 'instrumental' ? 1.15 : 0;
    instMonoSum.connect(stemInstMonoGain);
    stemInstMonoGain.connect(stemMonoFor8d);

    // ------------------------------------------------------------------
    // 3. BYPASS LIMPIO VS MOTOR 8D BINAURAL DE ESTUDIO
    // ------------------------------------------------------------------
    const bypassGain = ctx.createGain();
    bypassGain.gain.value = enabledRef.current ? 0 : 1;

    const spatialMasterGain = ctx.createGain();
    spatialMasterGain.gain.value = enabledRef.current ? 1.16 : 0;

    // Enfoque de fuente puntual (mono estricto antes del HRTF para un giro 360° nítido e inequívoco)
    const monoPointFocus = ctx.createGain();
    monoPointFocus.channelCount = 1;
    monoPointFocus.channelCountMode = 'explicit';
    monoPointFocus.channelInterpretation = 'speakers';

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.0;
    panner.maxDistance = 42;
    panner.rolloffFactor = 0.52;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 1;
    panner.channelCount = 1;
    panner.channelCountMode = 'explicit';
    panner.channelInterpretation = 'speakers';
    panner.positionX.value = 0;
    panner.positionY.value = 0;
    panner.positionZ.value = depthRef.current;

    // Sombreado craneal dinámico por oído (Rayleigh Head-Shadow LPF + ILD L/R)
    const earSplitter = ctx.createChannelSplitter(2);
    const earMerger = ctx.createChannelMerger(2);

    const leftShadowLp = ctx.createBiquadFilter();
    leftShadowLp.type = 'lowpass';
    leftShadowLp.Q.value = 0.65;
    leftShadowLp.frequency.value = AUDIO_8D_LIMITS.frontCutoffHz;
    const leftEarGain = ctx.createGain();
    leftEarGain.gain.value = 0.96;

    const rightShadowLp = ctx.createBiquadFilter();
    rightShadowLp.type = 'lowpass';
    rightShadowLp.Q.value = 0.65;
    rightShadowLp.frequency.value = AUDIO_8D_LIMITS.frontCutoffHz;
    const rightEarGain = ctx.createGain();
    rightEarGain.gain.value = 0.96;

    // Filtro de oclusión trasera (cráneo + muesca pinna detrás de la cabeza)
    const occlusionFilter = ctx.createBiquadFilter();
    occlusionFilter.type = 'lowpass';
    occlusionFilter.Q.value = 0.78;
    occlusionFilter.frequency.value = AUDIO_8D_LIMITS.frontCutoffHz;

    const pinnaRearNotch = ctx.createBiquadFilter();
    pinnaRearNotch.type = 'peaking';
    pinnaRearNotch.frequency.value = 7200;
    pinnaRearNotch.Q.value = 1.5;
    pinnaRearNotch.gain.value = 0;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - reverbRef.current * 0.18;

    // Ancla sutil de subgraves (< 105 Hz) centrada para conservar pegada física en auriculares
    const subAnchorLp = ctx.createBiquadFilter();
    subAnchorLp.type = 'lowpass';
    subAnchorLp.frequency.value = 105;
    subAnchorLp.Q.value = 0.7;
    const subAnchorGain = ctx.createGain();
    subAnchorGain.gain.value = spatialModeRef.current === 'club' ? 0.28 : 0.18;

    // Reverb fija de sala (tomada PRE-Panner para envolver ambos oídos mientras el sonido orbita)
    const reverbHp = ctx.createBiquadFilter();
    reverbHp.type = 'highpass';
    reverbHp.frequency.value = 185;
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = generateCleanHallImpulseResponse(ctx, 2.05, 2.55);
    const wetGain = ctx.createGain();
    wetGain.gain.value = reverbRef.current * 1.18;

    // ------------------------------------------------------------------
    // 4. ANALIZADOR DE ESPECTRO + COMPRESOR PROTECTOR DE SALIDA
    // ------------------------------------------------------------------
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;

    // Bypass & Reverb FX independiente (actúa incluso con 8D desactivado para Slowed+Reverb, Lo-Fi, Estadio...)
    const fxReverbStandaloneWet = ctx.createGain();
    fxReverbStandaloneWet.gain.value = enabledRef.current ? 0 : initFx.reverbMix * 0.92;
    bypassGain.gain.value = enabledRef.current ? 0 : 1 - initFx.reverbMix * 0.14;
    wetGain.gain.value =
      Math.max(reverbRef.current, initFx.reverbMix * 0.72) * 1.18;

    // Cableado Bypass + Reverb FX independiente
    stemStereoOut.connect(bypassGain);
    bypassGain.connect(analyser);

    // Cableado Ruta 8D
    stemMonoFor8d.connect(monoPointFocus);
    monoPointFocus.connect(panner);
    panner.connect(earSplitter);

    earSplitter.connect(leftShadowLp, 0);
    leftShadowLp.connect(leftEarGain);
    leftEarGain.connect(earMerger, 0, 0);

    earSplitter.connect(rightShadowLp, 1);
    rightShadowLp.connect(rightEarGain);
    rightEarGain.connect(earMerger, 0, 1);

    earMerger.connect(occlusionFilter);
    occlusionFilter.connect(pinnaRearNotch);
    pinnaRearNotch.connect(dryGain);
    dryGain.connect(spatialMasterGain);

    // Ancla de subgraves + Sala fija pre-órbita
    stemMonoFor8d.connect(subAnchorLp);
    subAnchorLp.connect(subAnchorGain);
    subAnchorGain.connect(spatialMasterGain);

    stemStereoOut.connect(reverbHp);
    reverbHp.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(spatialMasterGain);
    convolver.connect(fxReverbStandaloneWet);
    fxReverbStandaloneWet.connect(analyser);

    spatialMasterGain.connect(analyser);

    analyser.connect(compressor);
    compressor.connect(ctx.destination);

    eqFiltersRef.current = eqFilters;
    preOutGainRef.current = preOutGain;
    fxHighpassRef.current = fxHighpass;
    fxBassShelfRef.current = fxBassShelf;
    fxTrebleShelfRef.current = fxTrebleShelf;
    fxSatDryGainRef.current = fxSatDryGain;
    fxSatWetGainRef.current = fxSatWetGain;
    fxPostSatTrimRef.current = fxPostSatTrim;
    fxLowpassRef.current = fxLowpass;
    fxChorusWetGainRef.current = fxChorusWetGain;
    fxEchoDelayRef.current = fxEchoDelay;
    fxEchoFeedbackRef.current = fxEchoFeedback;
    fxEchoWetGainRef.current = fxEchoWetGain;
    fxReverbStandaloneWetRef.current = fxReverbStandaloneWet;
    stemBothStereoGainRef.current = stemBothStereoGain;
    stemVocalsGainRef.current = stemVocalsGain;
    stemInstStereoGainRef.current = stemInstStereoGain;
    stemInstMonoGainRef.current = stemInstMonoGain;
    bypassGainRef.current = bypassGain;
    spatialMasterGainRef.current = spatialMasterGain;
    pannerRef.current = panner;
    leftShadowLpRef.current = leftShadowLp;
    rightShadowLpRef.current = rightShadowLp;
    leftEarGainRef.current = leftEarGain;
    rightEarGainRef.current = rightEarGain;
    occlusionFilterRef.current = occlusionFilter;
    pinnaRearNotchRef.current = pinnaRearNotch;
    subAnchorGainRef.current = subAnchorGain;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;
    analyserRef.current = analyser;

    // Desbloqueo automático de AudioContext ante cualquier gesto del usuario
    const handleResumeTrigger = () => {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    };
    mediaEl.addEventListener('play', handleResumeTrigger);
    mediaEl.addEventListener('playing', handleResumeTrigger);
    window.addEventListener('pointerdown', handleResumeTrigger, { passive: true, capture: true });
    window.addEventListener('touchstart', handleResumeTrigger, { passive: true, capture: true });
    window.addEventListener('keydown', handleResumeTrigger, { passive: true, capture: true });

    const createdNodes: AudioNode[] = [
      ...eqFilters,
      preOutGain,
      fxHighpass,
      fxBassShelf,
      fxTrebleShelf,
      fxSatDryGain,
      fxSatShaper,
      fxSatWetGain,
      fxPostSatTrim,
      fxLowpass,
      fxChorusDelay,
      fxChorusLfo,
      fxChorusLfoDepth,
      fxChorusWetGain,
      fxEchoDelay,
      fxEchoFeedback,
      fxEchoDampLp,
      fxEchoWetGain,
      fxStageOut,
      stemStereoOut,
      stemMonoFor8d,
      stemSplitter,
      stemBothStereoGain,
      midBus,
      midLeftTap,
      midRightTap,
      vocalHp,
      vocalPresence,
      vocalLp,
      stemVocalsGain,
      bassKeepLp,
      bassKeepGain,
      sideRawBus,
      sidePlusL,
      sideMinusR,
      sideBandHp,
      sideInvertR,
      instMerger,
      stemInstStereoGain,
      instMonoSum,
      stemInstMonoGain,
      bypassGain,
      fxReverbStandaloneWet,
      spatialMasterGain,
      monoPointFocus,
      panner,
      earSplitter,
      earMerger,
      leftShadowLp,
      leftEarGain,
      rightShadowLp,
      rightEarGain,
      occlusionFilter,
      pinnaRearNotch,
      dryGain,
      subAnchorLp,
      subAnchorGain,
      reverbHp,
      convolver,
      wetGain,
      analyser,
      compressor,
    ];

    return () => {
      mediaEl.removeEventListener('play', handleResumeTrigger);
      mediaEl.removeEventListener('playing', handleResumeTrigger);
      window.removeEventListener('pointerdown', handleResumeTrigger, { capture: true });
      window.removeEventListener('touchstart', handleResumeTrigger, { capture: true });
      window.removeEventListener('keydown', handleResumeTrigger, { capture: true });
      registeredAudioContexts.delete(ctx);

      try {
        fxChorusLfo.stop();
      } catch {
        // ignore
      }
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      for (const node of createdNodes) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
      convolver.buffer = null;
      eqFiltersRef.current = [];
      preOutGainRef.current = null;
      fxHighpassRef.current = null;
      fxBassShelfRef.current = null;
      fxTrebleShelfRef.current = null;
      fxSatDryGainRef.current = null;
      fxSatWetGainRef.current = null;
      fxPostSatTrimRef.current = null;
      fxLowpassRef.current = null;
      fxChorusWetGainRef.current = null;
      fxEchoDelayRef.current = null;
      fxEchoFeedbackRef.current = null;
      fxEchoWetGainRef.current = null;
      fxReverbStandaloneWetRef.current = null;
      stemBothStereoGainRef.current = null;
      stemVocalsGainRef.current = null;
      stemInstStereoGainRef.current = null;
      stemInstMonoGainRef.current = null;
      bypassGainRef.current = null;
      spatialMasterGainRef.current = null;
      pannerRef.current = null;
      leftShadowLpRef.current = null;
      rightShadowLpRef.current = null;
      leftEarGainRef.current = null;
      rightEarGainRef.current = null;
      occlusionFilterRef.current = null;
      pinnaRearNotchRef.current = null;
      subAnchorGainRef.current = null;
      dryGainRef.current = null;
      wetGainRef.current = null;
      analyserRef.current = null;
      telemetryRef.current.isWebAudioActive = false;
    };
    // Solo reconstruimos el grafo si cambia el elemento DOM de origen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaElementRef]);

  // Crossfade suave del modo de mezcla de pistas ('both' | 'vocals' | 'instrumental')
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      stemBothStereoGainRef.current?.gain.setTargetAtTime(stemMode === 'both' ? 1 : 0, now, 0.03);
      stemVocalsGainRef.current?.gain.setTargetAtTime(stemMode === 'vocals' ? 1.38 : 0, now, 0.03);
      stemInstStereoGainRef.current?.gain.setTargetAtTime(
        stemMode === 'instrumental' ? 1.12 : 0,
        now,
        0.03
      );
      stemInstMonoGainRef.current?.gain.setTargetAtTime(
        stemMode === 'instrumental' ? 1.15 : 0,
        now,
        0.03
      );
    } catch {
      // ignore
    }
  }, [stemMode]);

  // Sincronización suave de Efectos FX (Lowpass/Highpass/Saturación/Chorus/Eco/Bass/Treble/Reverb FX)
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      fxHighpassRef.current?.frequency.setTargetAtTime(fxParams.highpassHz, now, 0.04);
      fxBassShelfRef.current?.gain.setTargetAtTime(fxParams.bassBoostDb, now, 0.04);
      fxTrebleShelfRef.current?.gain.setTargetAtTime(fxParams.trebleBoostDb, now, 0.04);
      fxSatDryGainRef.current?.gain.setTargetAtTime(1 - fxParams.saturation * 0.65, now, 0.04);
      fxSatWetGainRef.current?.gain.setTargetAtTime(fxParams.saturation * 0.65, now, 0.04);
      const satTrim =
        fxParams.bassBoostDb > 4 ? Math.max(0.68, 1 - (fxParams.bassBoostDb - 4) * 0.045) : 1;
      fxPostSatTrimRef.current?.gain.setTargetAtTime(satTrim, now, 0.045);
      fxLowpassRef.current?.frequency.setTargetAtTime(fxParams.lowpassHz, now, 0.045);
      fxChorusWetGainRef.current?.gain.setTargetAtTime(fxParams.chorusMix * 0.45, now, 0.045);
      fxEchoDelayRef.current?.delayTime.setTargetAtTime(fxParams.echoTimeMs / 1000, now, 0.05);
      fxEchoFeedbackRef.current?.gain.setTargetAtTime(
        Math.min(0.55, fxParams.echoMix * 0.72),
        now,
        0.045
      );
      fxEchoWetGainRef.current?.gain.setTargetAtTime(fxParams.echoMix * 0.58, now, 0.045);
    } catch {
      // ignore
    }
  }, [fxParams]);

  // Sincronización suave de ganancias 8D / Bypass / Dry-Wet Reverb / Ancla Subgraves
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (isEnabled && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    try {
      bypassGainRef.current?.gain.setTargetAtTime(
        isEnabled ? 0 : 1 - fxParams.reverbMix * 0.14,
        now,
        0.035
      );
      fxReverbStandaloneWetRef.current?.gain.setTargetAtTime(
        isEnabled ? 0 : fxParams.reverbMix * 0.92,
        now,
        0.04
      );
      spatialMasterGainRef.current?.gain.setTargetAtTime(isEnabled ? 1.16 : 0, now, 0.035);
      dryGainRef.current?.gain.setTargetAtTime(1 - reverbAmount * 0.18, now, 0.045);
      const effective8dWet = Math.max(reverbAmount, fxParams.reverbMix * 0.72);
      wetGainRef.current?.gain.setTargetAtTime(effective8dWet * 1.18, now, 0.045);
      const anchorVal =
        stemMode === 'vocals'
          ? 0
          : spatialMode === 'club'
          ? 0.28
          : spatialMode === 'concert'
          ? 0.15
          : 0.18;
      subAnchorGainRef.current?.gain.setTargetAtTime(anchorVal, now, 0.045);
    } catch {
      // ignore
    }
  }, [isEnabled, reverbAmount, spatialMode, stemMode, fxParams.reverbMix]);

  // Sincronización suave de las 10 bandas de EQ y compensación de headroom
  useEffect(() => {
    if (!eqGainsDb || eqFiltersRef.current.length === 0) return;
    const now = ctxRef.current?.currentTime ?? 0;
    let maxPos = 0;
    eqFiltersRef.current.forEach((filter, idx) => {
      try {
        const raw = eqGainsDb[idx] ?? 0;
        const clamped = Math.max(-12, Math.min(12, Number.isFinite(raw) ? raw : 0));
        if (clamped > maxPos) maxPos = clamped;
        filter.gain.setTargetAtTime(clamped, now, 0.04);
      } catch {
        // ignore
      }
    });
    const trim = maxPos > 4 ? Math.max(0.68, 1 - (maxPos - 4) * 0.045) : 1;
    try {
      preOutGainRef.current?.gain.setTargetAtTime(trim, now, 0.05);
    } catch {
      // ignore
    }
  }, [eqGainsDb]);

  // Bucle LFO de órbita 360° (60fps rAF + respaldo 80ms para pantalla apagada / segundo plano)
  useEffect(() => {
    const panner = pannerRef.current;
    const occlusionFilter = occlusionFilterRef.current;
    const pinnaRearNotch = pinnaRearNotchRef.current;
    const ctx = ctxRef.current;

    if (!isEnabled) {
      telemetryRef.current.isWebAudioActive = false;
      if (ctx && panner && occlusionFilter) {
        const now = ctx.currentTime;
        try {
          panner.positionX.setTargetAtTime(0, now, 0.05);
          panner.positionY.setTargetAtTime(0, now, 0.05);
          panner.positionZ.setTargetAtTime(depthRef.current, now, 0.05);
          leftEarGainRef.current?.gain.setTargetAtTime(0.96, now, 0.05);
          rightEarGainRef.current?.gain.setTargetAtTime(0.96, now, 0.05);
          leftShadowLpRef.current?.frequency.setTargetAtTime(AUDIO_8D_LIMITS.frontCutoffHz, now, 0.05);
          rightShadowLpRef.current?.frequency.setTargetAtTime(AUDIO_8D_LIMITS.frontCutoffHz, now, 0.05);
          occlusionFilter.frequency.setTargetAtTime(AUDIO_8D_LIMITS.frontCutoffHz, now, 0.05);
          pinnaRearNotch?.gain.setTargetAtTime(0, now, 0.05);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (isPlaying && ctx?.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    let rafId = 0;
    let lastTs = performance.now();

    const advanceOrbit = (ts: number) => {
      const dtSec = Math.min(0.14, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      const activeNow = isActiveBackendRef.current;
      telemetryRef.current.isWebAudioActive = activeNow && enabledRef.current;

      if (isPlayingRef.current && activeNow) {
        const cCtx = ctxRef.current;
        if (cCtx && cCtx.state === 'suspended') {
          void cCtx.resume().catch(() => {});
        }

        const omega = (Math.PI * 2) / clamp8dSpeed(speedRef.current);
        const nextAngle = (telemetryRef.current.angleRad + omega * dtSec) % (Math.PI * 2);

        const mode = spatialModeRef.current;
        const baseRadius = clamp8dDepth(depthRef.current);
        const radiusX = baseRadius * (mode === 'concert' ? 1.75 : mode === 'club' ? 1.55 : 1.65);
        const radiusZ = baseRadius * (mode === 'concert' ? 1.35 : 1.15);
        const elevAmp = baseRadius * (mode === 'concert' ? 0.55 : 0.36);

        // Coordenadas espaciales 3D alrededor de la cabeza del oyente
        const panSin = Math.sin(nextAngle); // -1 izquierda .. +1 derecha
        const frontCos = Math.cos(nextAngle); // +1 frente .. -1 atrás
        const x = panSin * radiusX;
        const z = frontCos * radiusZ;
        const y = Math.sin(nextAngle * 2) * elevAmp + (mode === 'concert' ? 0.25 : 0);

        const cutoffHz = computeSkullOcclusionCutoff(z, radiusZ);
        const rearAmount = frontCos < 0 ? Math.abs(frontCos) : 0;
        const pinnaNotchDb = -3.8 * rearAmount;

        // Sombreado Rayleigh por oído: contraste claro entre oreja cercana y opuesta
        const minFarEarGain = mode === 'club' ? 0.22 : 0.27;
        const maxNearEarGain = 1.14;
        const rightNorm = Math.max(0, panSin);
        const leftNorm = Math.max(0, -panSin);

        const leftEarGainVal =
          rightNorm > 0
            ? 0.96 - (0.96 - minFarEarGain) * Math.pow(rightNorm, 0.82)
            : 0.96 + (maxNearEarGain - 0.96) * leftNorm;
        const rightEarGainVal =
          leftNorm > 0
            ? 0.96 - (0.96 - minFarEarGain) * Math.pow(leftNorm, 0.82)
            : 0.96 + (maxNearEarGain - 0.96) * rightNorm;

        // Oído opuesto también atenúa agudos (>3.8kHz) por bloqueo físico del cráneo
        const leftShadowHz =
          rightNorm > 0 ? 20000 - (20000 - 3800) * Math.pow(rightNorm, 0.85) : 20000;
        const rightShadowHz =
          leftNorm > 0 ? 20000 - (20000 - 3800) * Math.pow(leftNorm, 0.85) : 20000;

        telemetryRef.current = {
          angleRad: nextAngle,
          x,
          y,
          z,
          occlusionCutoffHz: cutoffHz,
          isWebAudioActive: true,
        };

        const cPanner = pannerRef.current;
        const cFilter = occlusionFilterRef.current;
        if (cCtx && cPanner && cFilter) {
          const now = cCtx.currentTime;
          try {
            cPanner.positionX.setTargetAtTime(x, now, 0.022);
            cPanner.positionY.setTargetAtTime(y, now, 0.022);
            cPanner.positionZ.setTargetAtTime(z, now, 0.022);
            leftEarGainRef.current?.gain.setTargetAtTime(leftEarGainVal, now, 0.022);
            rightEarGainRef.current?.gain.setTargetAtTime(rightEarGainVal, now, 0.022);
            leftShadowLpRef.current?.frequency.setTargetAtTime(leftShadowHz, now, 0.026);
            rightShadowLpRef.current?.frequency.setTargetAtTime(rightShadowHz, now, 0.026);
            cFilter.frequency.setTargetAtTime(cutoffHz, now, 0.028);
            pinnaRearNotchRef.current?.gain.setTargetAtTime(pinnaNotchDb, now, 0.03);
          } catch {
            // ignore
          }
        }
      }
    };

    const stepRaf = (ts: number) => {
      advanceOrbit(ts);
      rafId = requestAnimationFrame(stepRaf);
    };

    rafId = requestAnimationFrame(stepRaf);

    // Respaldo de segundo plano: rAF se detiene al apagar pantalla o cambiar app; esto mantiene el giro 8D
    const bgTimer = window.setInterval(() => {
      const now = performance.now();
      if (document.hidden || now - lastTs > 90) {
        advanceOrbit(now);
      }
    }, 80);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(bgTimer);
      telemetryRef.current.isWebAudioActive = false;
    };
  }, [isEnabled, isPlaying, isActiveBackend]);

  const getTelemetry = useCallback(() => telemetryRef.current, []);
  const getAnalyserNode = useCallback(() => analyserRef.current, []);

  return {
    isEnabled,
    setIsEnabled,
    toggle,
    speed,
    setSpeed,
    reverbAmount,
    setReverbAmount,
    depth,
    setDepth,
    resumeAudioContext,
    getTelemetry,
    getAnalyserNode,
  };
}
