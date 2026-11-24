import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const DRACO_CDN_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
const BASIS_CDN_PATH = 'https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/basis/';

let sharedDracoLoader: DRACOLoader | null = null;
let sharedKtx2Loader: KTX2Loader | null = null;

/**
 * Safely attaches Draco, Meshopt, and optional KTX2 decoders to any GLTFLoader.
 * Guarded against headless/jsdom environments where Web Workers or WASM may not exist.
 */
export function attachSafeMeshDecoders(
  loader: GLTFLoader,
  renderer?: THREE.WebGLRenderer | null
): void {
  if (typeof window === 'undefined') return;
  try {
    if (!sharedDracoLoader && typeof Worker !== 'undefined') {
      sharedDracoLoader = new DRACOLoader();
      sharedDracoLoader.setDecoderPath(DRACO_CDN_PATH);
    }
    if (sharedDracoLoader) {
      loader.setDRACOLoader(sharedDracoLoader);
    }
  } catch {
    // Keep standard GLB loading if Draco worker fails
  }

  try {
    if (MeshoptDecoder) {
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
  } catch {
    // Ignore meshopt fallback
  }

  if (renderer) {
    try {
      if (!sharedKtx2Loader) {
        sharedKtx2Loader = new KTX2Loader();
        sharedKtx2Loader.setTranscoderPath(BASIS_CDN_PATH);
      }
      sharedKtx2Loader.detectSupport(renderer);
      loader.setKTX2Loader(sharedKtx2Loader);
    } catch {
      // Ignore KTX2 support errors on constrained contexts
    }
  }
}

export interface FresnelRimOptions {
  colorHex?: number | string;
  power?: number;
  intensity?: number;
}

/**
 * Extends MeshStandardMaterial / MeshPhysicalMaterial with a view-angle Fresnel rim glow
 * via onBeforeCompile while preserving built-in PBR lighting and environment reflections.
 */
export function applyFresnelRimShader(
  material: THREE.Material | null | undefined,
  opts?: FresnelRimOptions
): void {
  if (!material || material.userData?.__fresnelPatched) return;
  const stdMat = material as THREE.MeshStandardMaterial;
  if (!stdMat.isMeshStandardMaterial && !(material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
    return;
  }

  const rimCol = new THREE.Color(opts?.colorHex ?? 0x38bdf8);
  const rimPower = opts?.power ?? 3.1;
  const rimIntensity = opts?.intensity ?? 0.55;

  material.userData.__fresnelPatched = true;
  const prevOnBeforeCompile = stdMat.onBeforeCompile;
  const prevCacheKey = typeof stdMat.customProgramCacheKey === 'function' ? stdMat.customProgramCacheKey.bind(stdMat) : null;

  stdMat.customProgramCacheKey = () => {
    const baseKey = prevCacheKey ? prevCacheKey() : '';
    return `${baseKey}|fresnel_rim_v1`;
  };

  stdMat.onBeforeCompile = (shader, renderer) => {
    if (typeof prevOnBeforeCompile === 'function') {
      prevOnBeforeCompile.call(stdMat, shader, renderer);
    }
    shader.uniforms.uFresnelColor = { value: rimCol };
    shader.uniforms.uFresnelPower = { value: rimPower };
    shader.uniforms.uFresnelIntensity = { value: rimIntensity };

    if (!shader.fragmentShader.includes('uFresnelColor')) {
      shader.fragmentShader =
        `uniform vec3 uFresnelColor;\nuniform float uFresnelPower;\nuniform float uFresnelIntensity;\n` +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
          float _fresnelTerm = pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), uFresnelPower);
          outgoingLight += uFresnelColor * (_fresnelTerm * uFresnelIntensity);
          #include <opaque_fragment>
          `
        );
    }
  };
  stdMat.needsUpdate = true;
}

export function applyFresnelRimToGroup(root: THREE.Object3D, opts?: FresnelRimOptions): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => applyFresnelRimShader(m, opts));
    } else {
      applyFresnelRimShader(mesh.material, opts);
    }
  });
}

// Scratch math objects for ribbon trail (zero GC allocations inside render loop)
const _ribForward = new THREE.Vector3();
const _ribToCam = new THREE.Vector3();
const _ribSide = new THREE.Vector3();
const _ribHead = new THREE.Color();

export interface RibbonTrail3DHandle {
  mesh: THREE.Mesh;
  push: (x: number, y: number, z: number, camPos?: THREE.Vector3, colorHex?: number | string) => void;
  setColor: (colorHex: number | string) => void;
  setVisible: (visible: boolean) => void;
  reset: () => void;
  dispose: () => void;
}

/**
 * Volumetric camera-facing quad-strip ribbon with tapered width and vertex alpha fade.
 * Replaces hairline 1px THREE.Line trails cleanly with zero per-frame allocations.
 */
export function create3dRibbonTrail(
  maxPoints = 18,
  colorHex: number | string = 0x38bdf8,
  baseWidth = 0.28,
  opts?: { opacity?: number; additive?: boolean }
): RibbonTrail3DHandle {
  const countMax = Math.max(4, maxPoints);
  const pointsX = new Float32Array(countMax);
  const pointsY = new Float32Array(countMax);
  const pointsZ = new Float32Array(countMax);
  let length = 0;

  const vertCount = countMax * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];
  for (let i = 0; i < countMax - 1; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  geo.setIndex(indices);
  geo.setDrawRange(0, 0);

  _ribHead.set(colorHex);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: opts?.opacity ?? 0.85,
    blending: opts?.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  const rebuild = (camPos?: THREE.Vector3) => {
    if (length < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    const cx = camPos ? camPos.x : 0;
    const cy = camPos ? camPos.y : 4;
    const cz = camPos ? camPos.z : 12;

    for (let i = 0; i < length; i += 1) {
      const px = pointsX[i];
      const py = pointsY[i];
      const pz = pointsZ[i];

      const prevIdx = Math.max(0, i - 1);
      const nextIdx = Math.min(length - 1, i + 1);
      _ribForward.set(
        pointsX[prevIdx] - pointsX[nextIdx],
        pointsY[prevIdx] - pointsY[nextIdx],
        pointsZ[prevIdx] - pointsZ[nextIdx]
      );
      if (_ribForward.lengthSq() < 1e-6) {
        _ribForward.set(0, 0, 1);
      } else {
        _ribForward.normalize();
      }

      _ribToCam.set(cx - px, cy - py, cz - pz);
      if (_ribToCam.lengthSq() < 1e-6) _ribToCam.set(0, 1, 0);
      else _ribToCam.normalize();

      _ribSide.crossVectors(_ribForward, _ribToCam);
      if (_ribSide.lengthSq() < 1e-6) _ribSide.set(1, 0, 0);
      else _ribSide.normalize();

      const t = 1 - i / Math.max(1, length - 1);
      const halfW = baseWidth * 0.5 * t;
      const ox = _ribSide.x * halfW;
      const oy = _ribSide.y * halfW;
      const oz = _ribSide.z * halfW;

      const v0 = i * 2;
      const v1 = v0 + 1;
      positions[v0 * 3] = px - ox;
      positions[v0 * 3 + 1] = py - oy;
      positions[v0 * 3 + 2] = pz - oz;
      positions[v1 * 3] = px + ox;
      positions[v1 * 3 + 1] = py + oy;
      positions[v1 * 3 + 2] = pz + oz;

      const fade = t * t;
      colors[v0 * 3] = _ribHead.r * fade;
      colors[v0 * 3 + 1] = _ribHead.g * fade;
      colors[v0 * 3 + 2] = _ribHead.b * fade;
      colors[v1 * 3] = _ribHead.r * fade;
      colors[v1 * 3 + 1] = _ribHead.g * fade;
      colors[v1 * 3 + 2] = _ribHead.b * fade;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.setDrawRange(0, (length - 1) * 6);
  };

  return {
    mesh,
    push: (x, y, z, camPos, newColor) => {
      if (newColor !== undefined) {
        _ribHead.set(newColor);
      }
      // Shift newest sample to index 0
      const limit = Math.min(length, countMax - 1);
      for (let i = limit; i >= 1; i -= 1) {
        pointsX[i] = pointsX[i - 1];
        pointsY[i] = pointsY[i - 1];
        pointsZ[i] = pointsZ[i - 1];
      }
      pointsX[0] = x;
      pointsY[0] = y;
      pointsZ[0] = z;
      if (length < countMax) length += 1;
      mesh.visible = length >= 2;
      rebuild(camPos);
    },
    setColor: (c) => {
      _ribHead.set(c);
    },
    setVisible: (v) => {
      mesh.visible = v && length >= 2;
    },
    reset: () => {
      length = 0;
      geo.setDrawRange(0, 0);
      mesh.visible = false;
    },
    dispose: () => {
      if (mesh.parent) mesh.parent.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}

export interface InstancedGrassHandle {
  mesh: THREE.InstancedMesh;
  update: (elapsedSec: number) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * GPU-instanced wind-swaying turf grass blades for stadium & court perimeters.
 */
export function createInstancedGrassField(
  parent: THREE.Object3D,
  opts: {
    count?: number;
    innerHalfW: number;
    innerHalfZ: number;
    outerPad?: number;
    bladeHeight?: number;
  }
): InstancedGrassHandle {
  const count = opts.count ?? 900;
  const bladeH = opts.bladeHeight ?? 0.34;
  const pad = opts.outerPad ?? 8;

  // Crossed 2-blade tuft geometry (4 triangles total)
  const w = 0.065;
  const pos = new Float32Array([
    -w, 0, 0,  w, 0, 0,  0, bladeH, 0.02,
    0, 0, -w,  0, 0, w,  0.02, bladeH, 0,
  ]);
  const norm = new Float32Array([
    0, 0.4, 1,  0, 0.4, 1,  0, 1, 0.3,
    1, 0.4, 0,  1, 0.4, 0,  0.3, 1, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));

  const windUniform = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  mat.customProgramCacheKey = () => 'instanced_grass_wind_v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader =
      `uniform float uWindTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float _bladeY = max(0.0, position.y);
        float _wx = instanceMatrix[3][0];
        float _wz = instanceMatrix[3][2];
        float _gust = sin(uWindTime * 2.1 + _wx * 0.55 + _wz * 0.45) * 0.14 + cos(uWindTime * 1.3 + _wx * 0.25) * 0.05;
        transformed.x += _gust * (_bladeY / ${bladeH.toFixed(3)});
        `
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const shades = [0x15803d, 0x16a34a, 0x22c55e, 0x14532d, 0x4ade80];

  for (let i = 0; i < count; i += 1) {
    // Place tufts outside the main playable lines in a perimeter collar
    const angle = (i * 2.399963) % (Math.PI * 2);
    const band = (i % 97) / 97;
    const rx = opts.innerHalfW + 0.5 + band * pad;
    const rz = opts.innerHalfZ + 0.5 + band * pad;
    let gx = Math.cos(angle) * rx;
    let gz = Math.sin(angle) * rz;
    if (Math.abs(gx) < opts.innerHalfW + 0.3 && Math.abs(gz) < opts.innerHalfZ + 0.3) {
      if (Math.abs(gx) / opts.innerHalfW > Math.abs(gz) / opts.innerHalfZ) {
        gx = Math.sign(gx || 1) * (opts.innerHalfW + 0.45 + band * 3.5);
      } else {
        gz = Math.sign(gz || 1) * (opts.innerHalfZ + 0.45 + band * 3.5);
      }
    }
    dummy.position.set(gx, 0, gz);
    dummy.rotation.y = (i * 1.17) % (Math.PI * 2);
    const s = 0.72 + ((i * 13) % 7) * 0.11;
    dummy.scale.set(s, s * (0.85 + ((i * 5) % 5) * 0.1), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setHex(shades[(i * 7) % shades.length]);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);

  return {
    mesh,
    update: (elapsedSec) => {
      windUniform.value = elapsedSec;
    },
    setVisible: (v) => {
      mesh.visible = v;
    },
    dispose: () => {
      if (mesh.parent) mesh.parent.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * Soft view-angle Fresnel volumetric floodlight cone material with vertical fadeout.
 */
export function createVolumetricBeamMaterial(
  colorHex: number | string = 0xe0f2fe,
  opacity = 0.2
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec2 vUv;
      void main() {
        float viewDot = abs(dot(normalize(vNormalView), normalize(vViewPos)));
        float edgeFade = pow(clamp(viewDot, 0.0, 1.0), 1.85);
        float verticalFade = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
        float alpha = edgeFade * verticalFade * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export const SpeedRadialShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0.0 },
    uBoost: { value: 0.0 },
    uHitFlash: { value: 0.0 },
    uTime: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSpeed;
    uniform float uBoost;
    uniform float uHitFlash;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);
      vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);

      // Subtle velocity + impact chromatic aberration on peripheral pixels
      float edgeMask = smoothstep(0.24, 0.72, dist);
      float caShift = (uSpeed * 0.0022 + uBoost * 0.0038 + uHitFlash * 0.006) * edgeMask;

      float r = texture2D(tDiffuse, clamp(vUv + dir * caShift, 0.0, 1.0)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, clamp(vUv - dir * caShift, 0.0, 1.0)).b;
      vec3 col = vec3(r, g, b);

      // Procedural high-speed radial speedlines near screen borders
      float speedActive = clamp(uSpeed * 0.65 + uBoost * 0.85, 0.0, 1.0);
      if (speedActive > 0.04) {
        float ang = atan(centered.y, centered.x);
        float streak = sin(ang * 42.0 + uTime * 22.0) * sin(ang * 19.0 - uTime * 15.0);
        float lineMask = smoothstep(0.68, 0.96, streak) * smoothstep(0.36, 0.74, dist);
        vec3 streakCol = mix(vec3(0.22, 0.74, 0.98), vec3(0.98, 0.8, 0.14), uBoost);
        col += streakCol * lineMask * speedActive * 0.36;
      }

      if (uHitFlash > 0.01) {
        col = mix(col, vec3(0.96, 0.25, 0.37), uHitFlash * edgeMask * 0.42);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface ProPostComposerOptions {
  width: number;
  height: number;
  isSoftwareGl: boolean;
  bloom?: { strength: number; radius: number; threshold: number };
  ssao?: boolean;
  smaa?: boolean;
  speedRadial?: boolean;
  bokeh?: boolean;
}

export interface ProPostComposerHandle {
  composer: EffectComposer;
  render: () => void;
  setSize: (width: number, height: number) => void;
  setSpeedFx: (speed01: number, boost01: number, hitFlash01: number, elapsedSec: number) => void;
  setDofActive: (active: boolean, focusDist?: number) => void;
  dispose: () => void;
}

/**
 * Production post-processing pipeline with WebGL2 MSAA render target,
 * optional SSAO contact occlusion, HDR Bloom, velocity SpeedRadial/Chromatic pass,
 * celebration Bokeh DoF, optional SMAA antialiasing, and ACES OutputPass.
 */
export function createProPostComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  opts: ProPostComposerOptions
): ProPostComposerHandle | null {
  if (opts.isSoftwareGl || typeof window === 'undefined') return null;

  const w = Math.max(160, Math.round(opts.width));
  const h = Math.max(120, Math.round(opts.height));
  let renderTarget: THREE.WebGLRenderTarget | null = null;
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let ssaoPass: SSAOPass | null = null;
  let speedPass: ShaderPass | null = null;
  let bokehPass: BokehPass | null = null;
  let smaaPass: SMAAPass | null = null;

  try {
    const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);
    renderTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: isWebGL2 ? 4 : 0,
    });
    composer = new EffectComposer(renderer, renderTarget);
  } catch {
    renderTarget?.dispose();
    renderTarget = null;
    try {
      composer = new EffectComposer(renderer);
    } catch {
      return null;
    }
  }

  try {
    composer.addPass(new RenderPass(scene, camera));

    if (opts.ssao) {
      try {
        ssaoPass = new SSAOPass(scene, camera, w, h, 16);
        ssaoPass.kernelRadius = 5.5;
        ssaoPass.minDistance = 0.002;
        ssaoPass.maxDistance = 0.075;
        composer.addPass(ssaoPass);
      } catch {
        ssaoPass = null;
      }
    }

    const bloomCfg = opts.bloom ?? { strength: 0.34, radius: 0.42, threshold: 0.86 };
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bloomCfg.strength, bloomCfg.radius, bloomCfg.threshold);
    composer.addPass(bloomPass);

    if (opts.speedRadial) {
      speedPass = new ShaderPass(SpeedRadialShader);
      composer.addPass(speedPass);
    }

    if (opts.bokeh) {
      try {
        bokehPass = new BokehPass(scene, camera, {
          focus: 8.5,
          aspect: w / h,
          aperture: 0.00018,
          maxblur: 0.008,
        });
        bokehPass.enabled = false;
        composer.addPass(bokehPass);
      } catch {
        bokehPass = null;
      }
    }

    if (opts.smaa !== false) {
      try {
        smaaPass = new SMAAPass();
        composer.addPass(smaaPass);
      } catch {
        smaaPass = null;
      }
    }

    composer.addPass(new OutputPass());
  } catch {
    composer.dispose();
    renderTarget?.dispose();
    return null;
  }

  return {
    composer,
    render: () => {
      composer?.render();
    },
    setSize: (nextW, nextH) => {
      const nw = Math.max(160, Math.round(nextW));
      const nh = Math.max(120, Math.round(nextH));
      composer?.setSize(nw, nh);
      bloomPass?.resolution.set(nw, nh);
      ssaoPass?.setSize(nw, nh);
      smaaPass?.setSize(nw, nh);
      if (bokehPass?.uniforms) {
        const u = bokehPass.uniforms as Record<string, { value: number }>;
        if (u.aspect) u.aspect.value = nw / nh;
      }
    },
    setSpeedFx: (speed01, boost01, hitFlash01, elapsedSec) => {
      if (!speedPass?.uniforms) return;
      speedPass.uniforms.uSpeed.value = Math.max(0, Math.min(1, speed01));
      speedPass.uniforms.uBoost.value = Math.max(0, Math.min(1, boost01));
      speedPass.uniforms.uHitFlash.value = Math.max(0, Math.min(1, hitFlash01));
      speedPass.uniforms.uTime.value = elapsedSec;
    },
    setDofActive: (active, focusDist) => {
      if (!bokehPass) return;
      bokehPass.enabled = active;
      if (active && typeof focusDist === 'number' && bokehPass.uniforms) {
        const u = bokehPass.uniforms as Record<string, { value: number }>;
        if (u.focus) u.focus.value = focusDist;
      }
    },
    dispose: () => {
      try {
        bloomPass?.dispose();
      } catch {
        // ignore
      }
      try {
        ssaoPass?.dispose();
      } catch {
        // ignore
      }
      try {
        bokehPass?.dispose();
      } catch {
        // ignore
      }
      try {
        smaaPass?.dispose();
      } catch {
        // ignore
      }
      try {
        composer?.dispose();
      } catch {
        // ignore
      }
      renderTarget?.dispose();
    },
  };
}

export interface DrsControllerHandle {
  sample: (frameDtSec: number) => number;
  getCurrentRatio: () => number;
}

/**
 * Dynamic Resolution Scaling (DRS): smoothly tunes WebGLRenderer pixelRatio
 * between minRatio (default 0.75) and maxRatio based on moving-average frame times.
 */
export function createDrsController(
  renderer: THREE.WebGLRenderer,
  opts?: {
    minRatio?: number;
    maxRatio?: number;
    isSoftwareGl?: boolean;
    onScaleChange?: (ratio: number) => void;
  }
): DrsControllerHandle {
  const minRatio = opts?.minRatio ?? 0.75;
  const maxRatio = opts?.maxRatio ?? (opts?.isSoftwareGl ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
  let currentRatio = maxRatio;
  let avgMs = 16.6;
  let frameCounter = 0;

  return {
    sample: (frameDtSec: number) => {
      if (opts?.isSoftwareGl) return currentRatio;
      const clampedMs = Math.max(4, Math.min(60, frameDtSec * 1000));
      avgMs = avgMs * 0.88 + clampedMs * 0.12;
      frameCounter += 1;

      if (frameCounter >= 18) {
        frameCounter = 0;
        let nextRatio = currentRatio;
        if (avgMs > 23.5 && currentRatio > minRatio) {
          nextRatio = Math.max(minRatio, Math.round((currentRatio - 0.15) * 20) / 20);
        } else if (avgMs < 14.5 && currentRatio < maxRatio) {
          nextRatio = Math.min(maxRatio, Math.round((currentRatio + 0.1) * 20) / 20);
        }
        if (Math.abs(nextRatio - currentRatio) >= 0.04) {
          currentRatio = nextRatio;
          try {
            renderer.setPixelRatio(currentRatio);
            opts?.onScaleChange?.(currentRatio);
          } catch {
            // ignore
          }
        }
      }
      return currentRatio;
    },
    getCurrentRatio: () => currentRatio,
  };
}
