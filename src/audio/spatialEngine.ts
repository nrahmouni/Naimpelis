import type { CanonicalSpatialPresetId, SpatialTrajectory } from '../types/music';
import { getSpatialPresetConfig, type SpatialPresetConfig } from '../components/music/spatialPresets';

const roomImpulseCache = new WeakMap<AudioContext, Map<CanonicalSpatialPresetId, AudioBuffer>>();

/**
 * Generates or retrieves a cached stereo room Impulse Response tailored to each spatial profile.
 * - High-passes sub-160 Hz so reverberation never muddies the anchored bassline.
 * - Applies frequency-dependent air damping so highs decay naturally like physical walls.
 */
export function getCachedRoomImpulseResponse(
  ctx: AudioContext,
  preset: SpatialPresetConfig
): AudioBuffer {
  let ctxCache = roomImpulseCache.get(ctx);
  if (!ctxCache) {
    ctxCache = new Map();
    roomImpulseCache.set(ctx, ctxCache);
  }
  const cached = ctxCache.get(preset.id);
  if (cached) return cached;

  const sampleRate = ctx.sampleRate || 44100;
  const durationSec = Math.max(0.4, Math.min(3.5, preset.reverbDurationSec));
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);

  const hpAlpha = Math.exp((-2 * Math.PI * 165) / sampleRate);
  const lpAlpha = Math.exp((-2 * Math.PI * preset.reverbDampHz) / sampleRate);
  const earlyTapsSec =
    preset.id === 'arena_live'
      ? [0.014, 0.029, 0.048, 0.074, 0.108]
      : preset.id === 'intimate_room'
      ? [0.006, 0.013, 0.022]
      : [0.011, 0.024, 0.041, 0.063];

  // Deterministic pseudo-random generator for reproducible acoustic IR texture
  let seed = 0x5f3759df ^ (preset.id.length * 997);
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let prevRaw = 0;
    let prevHp = 0;
    let prevLp = 0;

    for (let i = 0; i < length; i++) {
      const progress = i / length;
      const white = nextRand();
      const hp = hpAlpha * (prevHp + white - prevRaw);
      prevRaw = white;
      prevHp = hp;

      const lp = (1 - lpAlpha) * hp + lpAlpha * prevLp;
      prevLp = lp;

      const preDelaySamples = preset.id === 'arena_live' ? sampleRate * 0.018 : sampleRate * 0.006;
      const attackEnv = i < preDelaySamples ? i / Math.max(1, preDelaySamples) : 1;
      const decayEnv = Math.pow(1 - progress, preset.reverbDecay);
      data[i] = lp * attackEnv * decayEnv * 0.58;
    }

    earlyTapsSec.forEach((tapSec, idx) => {
      const stereoOffset = ch === 0 ? 0 : 0.0048;
      const tapIdx = Math.floor((tapSec + stereoOffset) * sampleRate);
      if (tapIdx > 0 && tapIdx < length) {
        data[tapIdx] += (ch === 0 ? 1 : -0.92) * (0.2 / (idx + 1));
      }
    });
  }

  ctxCache.set(preset.id, buffer);
  return buffer;
}

export interface SpatialTrajectorySample {
  x: number;
  y: number;
  z: number;
  stereoPan: number;
  airCutoffHz: number;
  itdLeftSec: number;
  itdRightSec: number;
  proximityGain: number;
}

export function computeSpatialTrajectorySample(
  presetOrMode: SpatialPresetConfig | string,
  angleRad: number,
  overrideTrajectory?: SpatialTrajectory,
  overrideStereoWidth?: number
): SpatialTrajectorySample {
  const preset =
    typeof presetOrMode === 'string' ? getSpatialPresetConfig(presetOrMode) : presetOrMode;
  const traj = overrideTrajectory || preset.trajectory;
  const r = preset.radius;
  const width = overrideStereoWidth ?? preset.stereoWidth;

  let x = r * Math.sin(angleRad);
  let y = preset.elevationBias + preset.elevationAmp * Math.sin(angleRad * 2);
  let z = -r * Math.cos(angleRad);

  if (traj === 'pendulum') {
    const swing = Math.sin(angleRad);
    x = r * swing;
    y = preset.elevationBias + preset.elevationAmp * Math.cos(angleRad * 2);
    z = -(r * 0.72 + r * 0.28 * Math.cos(angleRad));
  } else if (traj === 'figure8') {
    x = r * Math.sin(angleRad);
    y = preset.elevationBias + preset.elevationAmp * Math.sin(angleRad * 2);
    z = -(r * 0.85 * Math.sin(angleRad * 2) + r * 0.25);
  } else if (traj === 'elevated') {
    x = r * Math.sin(angleRad);
    y = preset.elevationBias + preset.elevationAmp * Math.abs(Math.sin(angleRad * 0.5));
    z = -(r * 0.88 * Math.cos(angleRad) + r * 0.16);
  }

  // Smooth air absorption cutoff: bright in front (-z near front/side), warmer when passing behind listener
  const normFront = Math.max(-1, Math.min(1, -z / Math.max(0.35, r)));
  const rearWeight = normFront < 0 ? Math.abs(normFront) : 0;
  const smoothRear = 0.5 - 0.5 * Math.cos(rearWeight * Math.PI);
  const airCutoffHz =
    preset.frontAirHz - (preset.frontAirHz - preset.rearOcclusionHz) * smoothRear;

  const pan = Math.max(-1, Math.min(1, Math.sin(angleRad) * width));
  // Subtle interaural time difference (0..0.38ms): when source is on right (+pan), left ear trails slightly
  const maxItdSec = 0.00038;
  const itdLeftSec = pan > 0 ? pan * maxItdSec : 0;
  const itdRightSec = pan < 0 ? Math.abs(pan) * maxItdSec : 0;
  // Front-to-back loudness envelope so orbiting behind the head feels physically deeper
  const proximityGain = 1.06 - smoothRear * 0.24;

  return {
    x,
    y,
    z,
    stereoPan: pan,
    airCutoffHz,
    itdLeftSec,
    itdRightSec,
    proximityGain,
  };
}

export function applySmoothParam(
  param: AudioParam | undefined | null,
  value: number,
  ctx: AudioContext | null | undefined,
  timeConstant = 0.045
): void {
  if (!param || !ctx || !Number.isFinite(value)) return;
  try {
    param.setTargetAtTime(value, ctx.currentTime, timeConstant);
  } catch {
    // ignore transient Web Audio scheduling guard
  }
}

export async function resumeSpatialContext(ctx: AudioContext | null | undefined): Promise<void> {
  if (!ctx || ctx.state === 'running') return;
  try {
    await ctx.resume();
  } catch {
    // ignore autoplay policy block until user gesture
  }
}
