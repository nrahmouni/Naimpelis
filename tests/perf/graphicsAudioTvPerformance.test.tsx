// @vitest-environment jsdom
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  create3dRibbonTrail,
  createDrsController,
  createInstancedGrassField,
} from '../../src/components/games/arcade/threePostFxHelpers';
import { create3dParticleBurstSystem } from '../../src/components/games/arcade/threeProHelpers';
import {
  computeSquashStretch,
  drawCanvas2dCrtOverlay,
  drawDynamicBallShadowAndSpec,
  drawDynamicPointLight,
  drawMotionSmearTrail,
  drawProceduralNebulaBackdrop,
  drawStadiumCameraFlashes,
} from '../../src/components/games/arcade/canvas2dFxHelpers';
import {
  computeSpatialTrajectorySample,
  getCachedRoomImpulseResponse,
} from '../../src/audio/spatialEngine';
import { getSpatialPresetConfig } from '../../src/components/music/spatialPresets';
import { generateTizenConfigXml } from '../../src/utils/tizenConfigGenerator';
import { buildHostedTizenLauncherAssets } from '../../src/utils/tizenWgtBuilder';
import {
  benchmarkBatchThroughput,
  benchmarkSyncOps,
  getHeapUsedMb,
} from './perfHarness';

function createMock2dCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clip: vi.fn(),
    createRadialGradient: vi.fn(() => grad),
    createLinearGradient: vi.fn(() => grad),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
  } as unknown as CanvasRenderingContext2D;
}

describe('Performance & Speed — 3D WebGL, 2D FX, Spatial 8D Audio & Smart TV ES5 Runtime', () => {
  it('sustains 60FPS+ frame budget in 3D ribbon trail, instanced grass wind & GPU particle bursts with low GC pressure', () => {
    const camPos = new THREE.Vector3(0, 5, 16);
    const trail = create3dRibbonTrail(24, 0x38bdf8, 0.35);
    const heapBefore = getHeapUsedMb();

    const ribbonStats = benchmarkSyncOps('Three.js create3dRibbonTrail.push (n=4,000)', 4_000, (i) => {
      const a = i * 0.05;
      trail.push(Math.sin(a) * 3, 1.2 + Math.cos(a) * 0.4, -i * 0.02, camPos, 0x22d3ee);
    });
    const ribbonHeapDelta = Number((getHeapUsedMb() - heapBefore).toFixed(2));
    trail.dispose();

    expect(ribbonStats.p95Ms).toBeLessThan(0.5);
    expect(ribbonHeapDelta).toBeLessThan(12);

    const parent = new THREE.Group();
    const grass = createInstancedGrassField(parent, {
      count: 800,
      innerHalfW: 12,
      innerHalfZ: 16,
      outerPad: 5,
    });
    const grassStats = benchmarkSyncOps('Three.js InstancedGrass wind update (800 blades, n=1,000)', 1_000, (i) => {
      grass.update(i * 0.016);
    });
    grass.dispose();
    expect(grassStats.p95Ms).toBeLessThan(2.0);

    const particles = create3dParticleBurstSystem(parent, 128);
    const particleStats = benchmarkSyncOps('Three.js Instanced ParticleBurst emit+update (n=1,200)', 1_200, (i) => {
      if (i % 20 === 0) particles.emit(0, 1, 0, 0xfacc15, 24, 4.5);
      particles.update(0.016);
    });
    particles.dispose();
    expect(particleStats.p95Ms).toBeLessThan(1.5);

    const mockRenderer = { setPixelRatio: vi.fn() } as unknown as THREE.WebGLRenderer;
    const drs = createDrsController(mockRenderer, { minRatio: 0.75, maxRatio: 1.5, isSoftwareGl: false });
    const drsBench = benchmarkBatchThroughput('DRS Controller frame sampling (20,000 frames)', 20_000, () => {
      for (let i = 0; i < 20_000; i += 1) {
        drs.sample(i % 2 === 0 ? 0.014 : 0.032);
      }
    });
    expect(drsBench.opsPerSec).toBeGreaterThan(200_000);
  });

  it('executes 2D Canvas pro FX pipeline well under 16.6ms per-frame 60FPS ceiling', () => {
    const ctx = createMock2dCtx();
    const pts = [
      { x: 100, y: 120 },
      { x: 125, y: 132 },
      { x: 152, y: 140 },
      { x: 185, y: 148 },
    ];

    const fxStats = benchmarkSyncOps('Canvas 2D Pro FX composite frame (n=600)', 600, (i) => {
      const t = i * 0.016;
      computeSquashStretch(0.75, 420, 0.35);
      drawProceduralNebulaBackdrop(ctx, 960, 540, t, 'space');
      drawDynamicPointLight(ctx, 480, 270, 90, '56,189,248', 0.45);
      const ballFx = drawDynamicBallShadowAndSpec(ctx, 480, 260, 16, 480, 40, 0.7);
      ballFx.drawShadow();
      ballFx.drawSpecular();
      drawMotionSmearTrail(ctx, pts, 14, '34,211,238', 0.5);
      drawStadiumCameraFlashes(ctx, 960, 20, 180, t, true);
      drawCanvas2dCrtOverlay(ctx, 960, 540, 0.16);
    });

    expect(fxStats.p95Ms).toBeLessThan(3.0);
  });

  it('computes Spatial 8D Audio trajectories at >100k ops/sec and caches Room Impulse Responses with massive speedup', () => {
    const presets = ['orbit_drift', 'arena_live', 'headphone_club', 'warm_studio'] as const;
    const trajBench = benchmarkBatchThroughput('Spatial 8D trajectory math (40,000 samples)', 40_000, () => {
      for (let i = 0; i < 40_000; i += 1) {
        const p = presets[i & 3];
        computeSpatialTrajectorySample(p, i * 0.02);
      }
    });
    expect(trajBench.opsPerSec).toBeGreaterThan(100_000);

    const mockCtx = {
      sampleRate: 44100,
      createBuffer: (channels: number, length: number) => {
        const chData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          getChannelData: (c: number) => chData[c],
        } as unknown as AudioBuffer;
      },
    } as unknown as AudioContext;

    const arenaPreset = getSpatialPresetConfig('arena_live');
    const tCold0 = performance.now();
    const irCold = getCachedRoomImpulseResponse(mockCtx, arenaPreset);
    const coldMs = performance.now() - tCold0;

    const warmBench = benchmarkBatchThroughput('Spatial 8D Impulse Response cache hit (10,000 lookups)', 10_000, () => {
      for (let i = 0; i < 10_000; i += 1) {
        const cached = getCachedRoomImpulseResponse(mockCtx, arenaPreset);
        if (cached !== irCold) throw new Error('Expected cached IR buffer');
      }
    });

    console.info(`[PERF AUDIO IR] Cold convolution synth=${coldMs.toFixed(2)}ms | Warm 10k lookups=${warmBench.totalMs}ms`);
    expect(coldMs).toBeLessThan(150);
    expect(warmBench.totalMs).toBeLessThan(50);
  });

  it('compiles all 13 Smart TV ES5 game scripts quickly and runs Tizen FX & .wgt packaging at high speed', () => {
    const tvFiles = [
      'public/tv/tv-game-sprites.js',
      'public/tv/tv-games.js',
      'public/tv/tv-games-racing.js',
      'public/tv/tv-games-soccer.js',
      'public/tv/tv-games-penalty.js',
      'public/tv/tv-games-pingpong.js',
      'public/tv/tv-games-soccerpong.js',
      'public/tv/tv-games-puzzle.js',
      'public/tv/tv-games-action.js',
      'public/tv/tv-games-retro.js',
      'public/tv/tv-games-gyro.js',
      'public/tv/tv-games-gyroplus.js',
      'public/tv/tv-games-quiz.js',
    ];

    const compileBench = benchmarkBatchThroughput('Smart TV ES5 vm.Script parse (all 13 files)', tvFiles.length, () => {
      for (const rel of tvFiles) {
        const code = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        new vm.Script(code);
      }
    });
    expect(compileBench.totalMs).toBeLessThan(500);

    const spritesCode = fs.readFileSync(path.resolve(process.cwd(), 'public/tv/tv-game-sprites.js'), 'utf8');
    const sandbox: Record<string, unknown> = {
      window: {},
      document: {},
      location: { origin: 'http://localhost:3000', host: 'localhost:3000' },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(spritesCode, sandbox);

    const ctx = createMock2dCtx();
    const drawCrt = sandbox.drawTvCrtOverlay as (c: CanvasRenderingContext2D, w: number, h: number, i: number) => void;
    const drawGlow = sandbox.drawTvGlowLight as (c: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) => void;
    const drawSpeed = sandbox.drawTvSpeedlines as (c: CanvasRenderingContext2D, w: number, h: number, k: number, t: number, col: string) => void;
    const drawBall = sandbox.drawTvDirectionalBall as (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, lx: number, ly: number, a: number) => void;
    const drawFlash = sandbox.drawTvCameraFlashes as (c: CanvasRenderingContext2D, w: number, topY: number, botY: number, t: number, ex: boolean) => void;
    const drawNeb = sandbox.drawTvNebulaLayer as (c: CanvasRenderingContext2D, w: number, h: number, t: number, theme: string) => void;

    const tvFxStats = benchmarkSyncOps('Smart TV ES5 Canvas 2D FX composite frame (n=500)', 500, (i) => {
      const t = i * 0.016;
      drawNeb(ctx, 960, 540, t, 'space');
      drawGlow(ctx, 480, 270, 64, '56,189,248', 0.45);
      drawBall(ctx, 480, 270, 18, 900, 40, 0.72);
      drawSpeed(ctx, 960, 540, 0.85, t, '#22D3EE');
      drawFlash(ctx, 960, 20, 200, t, true);
      drawCrt(ctx, 960, 540, 0.16);
    });
    expect(tvFxStats.p95Ms).toBeLessThan(3.0);

    const wgtBench = benchmarkBatchThroughput('Tizen config.xml + Launcher generation (500 builds)', 500, () => {
      for (let i = 0; i < 500; i += 1) {
        generateTizenConfigXml({ packageId: 'RiffanTv01', appName: 'RiffanTV', version: '1.0.0' });
        buildHostedTizenLauncherAssets('RiffanTV', 'https://riffan.ai.studio');
      }
    });
    expect(wgtBench.totalMs).toBeLessThan(350);
  });
});
