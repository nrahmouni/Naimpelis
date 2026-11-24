// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import * as THREE from 'three';

import {
  applyFresnelRimShader,
  applyFresnelRimToGroup,
  create3dRibbonTrail,
  createInstancedGrassField,
  createVolumetricBeamMaterial,
  SpeedRadialShader,
  createProPostComposer,
  createDrsController,
} from '../src/components/games/arcade/threePostFxHelpers';

import {
  CrtOverlayLayer,
  drawCanvas2dCrtOverlay,
  drawDynamicPointLight,
  drawDynamicBallShadowAndSpec,
  computeSquashStretch,
  drawMotionSmearTrail,
  drawProceduralNebulaBackdrop,
  drawStadiumCameraFlashes,
} from '../src/components/games/arcade/canvas2dFxHelpers';

function createMock2dContext(): CanvasRenderingContext2D {
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

const mountedContainers: Array<{ root: Root; el: HTMLElement }> = [];
afterEach(() => {
  while (mountedContainers.length > 0) {
    const item = mountedContainers.pop()!;
    act(() => {
      item.root.unmount();
    });
    item.el.remove();
  }
});

describe('20 Graphics Improvements — 3D WebGL Helpers', () => {
  it('patches MeshStandardMaterial with Fresnel rim shader idempotently', () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    applyFresnelRimShader(mat, { colorHex: 0x38bdf8, power: 3.0, intensity: 0.6 });
    expect(mat.userData.__fresnelPatched).toBe(true);
    expect(mat.customProgramCacheKey()).toContain('fresnel_rim_v1');

    const prevKey = mat.customProgramCacheKey();
    applyFresnelRimShader(mat, { colorHex: 0xff0000 });
    expect(mat.customProgramCacheKey()).toBe(prevKey);

    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    grp.add(mesh);
    applyFresnelRimToGroup(grp);
    expect((mesh.material as THREE.Material).userData.__fresnelPatched).toBe(true);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mat.dispose();
  });

  it('creates, updates, resets, and disposes 3D ribbon trails without allocations', () => {
    const trail = create3dRibbonTrail(10, 0x22d3ee, 0.35);
    expect(trail.mesh.visible).toBe(true);
    trail.push(0, 1, 0, new THREE.Vector3(0, 5, 10));
    expect(trail.mesh.visible).toBe(false);
    trail.push(1, 1.2, -1, new THREE.Vector3(0, 5, 10), 0xfacc15);
    expect(trail.mesh.visible).toBe(true);
    trail.reset();
    expect(trail.mesh.visible).toBe(false);
    trail.dispose();
  });

  it('creates GPU instanced grass perimeter field and updates wind uniform', () => {
    const parent = new THREE.Group();
    const grass = createInstancedGrassField(parent, {
      count: 64,
      innerHalfW: 8,
      innerHalfZ: 12,
      outerPad: 4,
    });
    expect(parent.children.length).toBe(1);
    expect(grass.mesh.count).toBe(64);
    grass.update(1.25);
    grass.setVisible(false);
    expect(grass.mesh.visible).toBe(false);
    grass.dispose();
    expect(parent.children.length).toBe(0);
  });

  it('builds volumetric spotlight cone material & speed radial shader', () => {
    const beamMat = createVolumetricBeamMaterial(0xe0f2fe, 0.22);
    expect(beamMat.transparent).toBe(true);
    expect(beamMat.blending).toBe(THREE.AdditiveBlending);
    expect(beamMat.uniforms.uOpacity.value).toBeCloseTo(0.22, 3);
    beamMat.dispose();

    expect(SpeedRadialShader.uniforms).toHaveProperty('uSpeed');
    expect(SpeedRadialShader.uniforms).toHaveProperty('uBoost');
    expect(SpeedRadialShader.fragmentShader).toContain('tDiffuse');
  });

  it('skips EffectComposer on software WebGL and throttles DRS safely', () => {
    const mockRenderer = { setPixelRatio: vi.fn(), capabilities: { isWebGL2: false } } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(60, 1.77, 0.1, 100);

    const skipped = createProPostComposer(mockRenderer, scene, cam, {
      width: 960,
      height: 540,
      isSoftwareGl: true,
    });
    expect(skipped).toBeNull();

    const swDrs = createDrsController(mockRenderer, { isSoftwareGl: true });
    for (let i = 0; i < 24; i += 1) swDrs.sample(0.05);
    expect(mockRenderer.setPixelRatio).not.toHaveBeenCalled();

    const hwDrs = createDrsController(mockRenderer, { minRatio: 0.75, maxRatio: 1.5, isSoftwareGl: false });
    for (let i = 0; i < 40; i += 1) hwDrs.sample(0.045);
    expect(hwDrs.getCurrentRatio()).toBeLessThan(1.5);
  });
});

describe('20 Graphics Improvements — 2D Canvas, CRT & Foil', () => {
  it('renders CrtOverlayLayer without backdrop-filter and toggles cleanly', () => {
    const offEl = document.createElement('div');
    document.body.appendChild(offEl);
    const offRoot = createRoot(offEl);
    mountedContainers.push({ root: offRoot, el: offEl });
    act(() => {
      offRoot.render(<CrtOverlayLayer enabled={false} />);
    });
    expect(offEl.firstChild).toBeNull();

    const onEl = document.createElement('div');
    document.body.appendChild(onEl);
    const onRoot = createRoot(onEl);
    mountedContainers.push({ root: onRoot, el: onEl });
    act(() => {
      onRoot.render(<CrtOverlayLayer enabled={true} />);
    });
    const el = onEl.firstChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.backgroundImage).toContain('repeating-linear-gradient');
    expect(el.style.backdropFilter || '').toBe('');
  });

  it('preserves volume on computeSquashStretch and executes 2D FX helpers cleanly', () => {
    const sq = computeSquashStretch(0.8, 320, 0.35);
    expect(sq.scaleX * sq.scaleY).toBeCloseTo(1, 2);

    const ctx = createMock2dContext();
    drawCanvas2dCrtOverlay(ctx, 800, 450, 0.2);
    drawDynamicPointLight(ctx, 120, 90, 48, '56,189,248', 0.5);
    const ballFx = drawDynamicBallShadowAndSpec(ctx, 200, 180, 14, 400, 40, 0.6);
    ballFx.drawShadow();
    ballFx.drawSpecular();
    drawMotionSmearTrail(ctx, [{ x: 10, y: 10 }, { x: 24, y: 18 }, { x: 40, y: 22 }], 12, '34,211,238', 0.45);
    drawProceduralNebulaBackdrop(ctx, 800, 450, 4.2, 'space');
    drawProceduralNebulaBackdrop(ctx, 800, 450, 4.2, 'sky');
    drawStadiumCameraFlashes(ctx, 800, 20, 220, 3.5, 0.9);
    expect((ctx.save as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(5);
  });

  it('keeps CSS foil shimmer and Smart TV CSS free of backdrop-filter', () => {
    const appCss = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(appCss).toContain('.card-foil-shimmer');
    expect(appCss).toContain('@keyframes rtv-foil-sheen');
    const foilSection = appCss.slice(appCss.indexOf('.card-foil-shimmer'));
    expect(foilSection).not.toMatch(/backdrop-filter/i);

    const tvCss = fs.readFileSync(path.resolve(process.cwd(), 'public/tv/tv-games.css'), 'utf8');
    expect(tvCss).toContain('.tv-crt-scanlines');
    expect(tvCss).toContain('.tv-card-foil');
    expect(tvCss).not.toMatch(/backdrop-filter/i);
  });
});

describe('20 Graphics Improvements — Smart TV ES5 Parity & Line Caps', () => {
  const tvFiles = [
    'public/tv/tv-game-sprites.js',
    'public/tv/tv-games.js',
    'public/tv/tv-games-racing.js',
    'public/tv/tv-games-soccer.js',
    'public/tv/tv-games-penalty.js',
    'public/tv/tv-games-pingpong.js',
    'public/tv/tv-games-puzzle.js',
    'public/tv/tv-games-action.js',
    'public/tv/tv-games-retro.js',
    'public/tv/tv-games-gyro.js',
    'public/tv/tv-games-gyroplus.js',
    'public/tv/tv-games-quiz.js',
  ];

  it('keeps every TV game script <= 700 lines and strictly ES5 compatible', () => {
    for (const rel of tvFiles) {
      const code = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(code.split('\n').length).toBeLessThanOrEqual(700);
      expect(code).not.toMatch(/\b(let|const)\s+/);
      expect(code).not.toContain('=>');
      expect(code).not.toContain('`');
      expect(code).not.toContain('.roundRect');
      expect(() => new vm.Script(code)).not.toThrow();
    }
  });

  it('registers all 6 Smart TV Canvas 2D FX helpers on window', () => {
    const code = fs.readFileSync(path.resolve(process.cwd(), 'public/tv/tv-game-sprites.js'), 'utf8');
    const sandbox: Record<string, unknown> = { window: {}, document: {}, location: { origin: 'http://localhost:3000', host: 'localhost:3000' } };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    const ctx = createMock2dContext();
    const fns = [
      'drawTvCrtOverlay',
      'drawTvGlowLight',
      'drawTvSpeedlines',
      'drawTvDirectionalBall',
      'drawTvCameraFlashes',
      'drawTvNebulaLayer',
    ] as const;

    for (const fn of fns) {
      expect(typeof sandbox[fn]).toBe('function');
    }

    (sandbox.drawTvCrtOverlay as (c: CanvasRenderingContext2D, w: number, h: number, i: number) => void)(ctx, 960, 540, 0.16);
    (sandbox.drawTvGlowLight as (c: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) => void)(ctx, 100, 100, 30, '56,189,248', 0.4);
    (sandbox.drawTvSpeedlines as (c: CanvasRenderingContext2D, w: number, h: number, k: number, t: number, col: string) => void)(ctx, 960, 540, 0.8, 1.5, '#22D3EE');
    (sandbox.drawTvDirectionalBall as (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, lx: number, ly: number, a: number) => void)(ctx, 200, 200, 14, 480, 30, 0.7);
    (sandbox.drawTvCameraFlashes as (c: CanvasRenderingContext2D, w: number, topY: number, botY: number, t: number, ex: boolean) => void)(ctx, 960, 20, 220, 2.0, true);
    (sandbox.drawTvNebulaLayer as (c: CanvasRenderingContext2D, w: number, h: number, t: number, theme: string) => void)(ctx, 960, 540, 2.0, 'space');
    expect((ctx.save as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});
