import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  SPATIAL_PRESET_LIST,
  SPATIAL_PRESET_ORDER,
  SPATIAL_PRESETS,
  getSpatialPresetConfig,
  normalizeSpatialPresetId,
} from '../src/components/music/spatialPresets.ts';
import {
  applySmoothParam,
  computeSpatialTrajectorySample,
  getCachedRoomImpulseResponse,
  resumeSpatialContext,
} from '../src/audio/spatialEngine.ts';
import { useMusicStore } from '../src/store/useMusicStore.ts';
import type { CanonicalSpatialPresetId, SpatialTrajectory } from '../src/types/music.ts';
import type { MusicLang } from '../src/components/music/musicI18n.ts';

function createMockAudioContext(sampleRate = 44100): AudioContext {
  const createBuffer = vi.fn((channels: number, length: number, sr: number) => {
    const chData = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: sr,
      duration: length / sr,
      getChannelData: (c: number) => chData[c],
    } as unknown as AudioBuffer;
  });

  return {
    sampleRate,
    currentTime: 1.25,
    state: 'suspended',
    createBuffer,
    resume: vi.fn(async () => undefined),
  } as unknown as AudioContext;
}

describe('8D Spatial Audio Presets & Web Audio DSP Engine', () => {
  const expectedIds: CanonicalSpatialPresetId[] = [
    'orbit_drift',
    'arena_live',
    'deep_3d',
    'dynamic_groove',
    'intimate_room',
  ];
  const langs: MusicLang[] = ['es', 'en', 'fr', 'zh', 'ca'];

  it('defines 5 pre-tuned acoustic profiles with 130-155 Hz bass crossover & full 5-language localization', () => {
    expect(SPATIAL_PRESET_ORDER).toEqual(expectedIds);
    expect(SPATIAL_PRESET_LIST).toHaveLength(5);

    for (const id of expectedIds) {
      const preset = SPATIAL_PRESETS[id];
      expect(preset).toBeDefined();
      expect(preset.crossoverHz).toBeGreaterThanOrEqual(130);
      expect(preset.crossoverHz).toBeLessThanOrEqual(155);
      expect(preset.reverbWetMix).toBeGreaterThan(0);
      expect(preset.reverbWetMix).toBeLessThanOrEqual(0.5);
      expect(preset.rearOcclusionHz).toBeLessThan(preset.frontAirHz);
      expect(preset.compressorRatio).toBeGreaterThanOrEqual(2);

      for (const lang of langs) {
        expect(preset.names[lang].trim().length).toBeGreaterThan(2);
        expect(preset.subtitles[lang].trim().length).toBeGreaterThan(10);
      }
    }
  });

  it('normalizes legacy 8D preset identifiers and invalid values cleanly', () => {
    expect(normalizeSpatialPresetId('orbit')).toBe('orbit_drift');
    expect(normalizeSpatialPresetId('concert')).toBe('arena_live');
    expect(normalizeSpatialPresetId('club')).toBe('dynamic_groove');
    expect(normalizeSpatialPresetId('deep_3d')).toBe('deep_3d');
    expect(normalizeSpatialPresetId('intimate_room')).toBe('intimate_room');
    expect(normalizeSpatialPresetId('unknown_mode')).toBe('orbit_drift');
    expect(normalizeSpatialPresetId(null)).toBe('orbit_drift');
    expect(getSpatialPresetConfig('concert').id).toBe('arena_live');
  });

  it('computes bounded 3D coordinates, stereo pan, and air occlusion cutoff across all trajectories', () => {
    const trajectories: SpatialTrajectory[] = ['orbit', 'pendulum', 'figure8', 'elevated'];
    const angles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI, Math.PI * 1.5, Math.PI * 2];

    for (const preset of SPATIAL_PRESET_LIST) {
      for (const traj of trajectories) {
        for (const angle of angles) {
          const sample = computeSpatialTrajectorySample(preset, angle, traj);
          expect(Number.isFinite(sample.x)).toBe(true);
          expect(Number.isFinite(sample.y)).toBe(true);
          expect(Number.isFinite(sample.z)).toBe(true);
          expect(sample.stereoPan).toBeGreaterThanOrEqual(-1);
          expect(sample.stereoPan).toBeLessThanOrEqual(1);
          expect(sample.airCutoffHz).toBeGreaterThanOrEqual(preset.rearOcclusionHz - 1e-6);
          expect(sample.airCutoffHz).toBeLessThanOrEqual(preset.frontAirHz + 1e-6);
        }
      }
    }
  });

  it('caches stereo room impulse responses per AudioContext and preset id without zeroed tails', () => {
    const ctxA = createMockAudioContext(48000);
    const ctxB = createMockAudioContext(44100);
    const orbitPreset = SPATIAL_PRESETS.orbit_drift;
    const arenaPreset = SPATIAL_PRESETS.arena_live;

    const ir1 = getCachedRoomImpulseResponse(ctxA, orbitPreset);
    const ir2 = getCachedRoomImpulseResponse(ctxA, orbitPreset);
    const irArena = getCachedRoomImpulseResponse(ctxA, arenaPreset);
    const irOtherCtx = getCachedRoomImpulseResponse(ctxB, orbitPreset);

    expect(ir1).toBe(ir2);
    expect(irArena).not.toBe(ir1);
    expect(irOtherCtx).not.toBe(ir1);
    expect((ctxA.createBuffer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect(ir1.numberOfChannels).toBe(2);

    const left = ir1.getChannelData(0);
    const energy = left.reduce((acc, v) => acc + Math.abs(v), 0);
    expect(energy).toBeGreaterThan(0);
  });

  it('applies smooth AudioParam ramps and resumes suspended AudioContexts safely', async () => {
    const ctx = createMockAudioContext();
    const setTargetAtTime = vi.fn();
    const fakeParam = { setTargetAtTime } as unknown as AudioParam;

    applySmoothParam(fakeParam, 0.75, ctx, 0.05);
    expect(setTargetAtTime).toHaveBeenCalledWith(0.75, 1.25, 0.05);

    applySmoothParam(fakeParam, Number.NaN, ctx);
    expect(setTargetAtTime).toHaveBeenCalledTimes(1);

    await resumeSpatialContext(ctx);
    expect(ctx.resume as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('updates spatial preset & enable flags cleanly inside useMusicStore', () => {
    const store = useMusicStore.getState();
    store.setSpatial8dEnabled(false);
    store.setSpatial8dMode('concert');

    expect(useMusicStore.getState().spatial8dMode).toBe('arena_live');
    store.toggleSpatial8d();
    expect(useMusicStore.getState().spatial8dEnabled).toBe(true);

    store.setSpatial8dMode('deep_3d');
    expect(useMusicStore.getState().spatial8dMode).toBe('deep_3d');
  });

  it('enforces minimalist #000000 preset-selector UI with zero DAW sliders', () => {
    const modalSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/music/SpatialAudioPresetModal.tsx'),
      'utf8'
    );
    expect(modalSrc).toContain('bg-[#000000]');
    expect(modalSrc).toContain('SPATIAL_PRESET_LIST.map');
    expect(modalSrc).not.toContain('type="range"');
  });
});
