import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import {
  isConstrainedTvDevice,
  loadCachedPbrTexture,
  spawnRigged3dActor,
  type RiggedActorHandle,
} from '../arcade/threeProHelpers';
import { attachSafeMeshDecoders } from '../arcade/threePostFxHelpers';
import {
  TRACK_BARRIER_HALF_WIDTH,
  TRACK_HALF_WIDTH,
  getRacingTrackSpec,
  type RacingTrackId,
} from './racingTypes';

const TRACK_GLB_CACHE = new Map<string, Promise<THREE.Group | null>>();
const trackGltfLoader = new GLTFLoader();
trackGltfLoader.setCrossOrigin('anonymous');
attachSafeMeshDecoders(trackGltfLoader);

function loadCachedTrackProp(relPath: string): Promise<THREE.Group | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return Promise.resolve(null);
  const url = resolveGameAssetUrl(relPath);
  const existing = TRACK_GLB_CACHE.get(url);
  if (existing) return existing;
  const p = new Promise<THREE.Group | null>((resolve) => {
    trackGltfLoader.load(
      url,
      (gltf) => resolve(gltf?.scene || null),
      undefined,
      () => resolve(null)
    );
  });
  TRACK_GLB_CACHE.set(url, p);
  return p;
}

export interface TrackSample {
  s: number;
  dist: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface TrackProjection {
  s: number;
  distFromCenter: number;
  closestX: number;
  closestZ: number;
  closestY: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
}

export interface BoostPadZone {
  s: number;
  lateralOffset: number;
}

export interface BuiltCircuit {
  trackId: RacingTrackId;
  curve: THREE.CatmullRomCurve3;
  totalLength: number;
  samples: TrackSample[];
  boostPads: BoostPadZone[];
  projectOntoTrack: (x: number, z: number, hintIndex?: number) => {
    proj: TrackProjection;
    sampleIndex: number;
  };
  sampleAtS: (s: number, outPos: THREE.Vector3, outTan: THREE.Vector3, outNorm: THREE.Vector3) => void;
  updateActors: (dt: number) => void;
  setCelebration: (celebrating: boolean) => void;
  addSkidMark: (x: number, z: number, yaw: number, intensity?: number) => void;
  dispose: () => void;
}

function getTrackWaypoints(trackId: RacingTrackId): THREE.Vector3[] {
  switch (trackId) {
    case 'coast':
      return [
        new THREE.Vector3(-30, 0, 145),
        new THREE.Vector3(-30, 0, 20),
        new THREE.Vector3(-24, 0, -110),
        new THREE.Vector3(24, 0, -195),
        new THREE.Vector3(110, 0, -215),
        new THREE.Vector3(215, 0, -170),
        new THREE.Vector3(245, 0, -68),
        new THREE.Vector3(195, 0, 12),
        new THREE.Vector3(222, 0, 108),
        new THREE.Vector3(190, 0, 204),
        new THREE.Vector3(96, 0, 232),
        new THREE.Vector3(12, 0, 204),
      ];
    case 'alpine':
      return [
        new THREE.Vector3(0, 0, 130),
        new THREE.Vector3(-18, 0, 28),
        new THREE.Vector3(38, 0, -56),
        new THREE.Vector3(-12, 0, -148),
        new THREE.Vector3(64, 0, -222),
        new THREE.Vector3(156, 0, -196),
        new THREE.Vector3(198, 0, -108),
        new THREE.Vector3(128, 0, -40),
        new THREE.Vector3(198, 0, 44),
        new THREE.Vector3(216, 0, 146),
        new THREE.Vector3(148, 0, 224),
        new THREE.Vector3(58, 0, 208),
      ];
    case 'neotokyo':
      return [
        new THREE.Vector3(0, 0, 140),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -140),
        new THREE.Vector3(36, 0, -205),
        new THREE.Vector3(124, 0, -212),
        new THREE.Vector3(198, 0, -162),
        new THREE.Vector3(204, 0, -64),
        new THREE.Vector3(138, 0, -18),
        new THREE.Vector3(138, 0, 56),
        new THREE.Vector3(208, 0, 114),
        new THREE.Vector3(192, 0, 205),
        new THREE.Vector3(96, 0, 226),
        new THREE.Vector3(24, 0, 198),
      ];
    case 'desert':
      return [
        new THREE.Vector3(-10, 0, 150),
        new THREE.Vector3(-10, 0, 15),
        new THREE.Vector3(-10, 0, -125),
        new THREE.Vector3(35, 0, -210),
        new THREE.Vector3(135, 0, -230),
        new THREE.Vector3(236, 0, -172),
        new THREE.Vector3(248, 0, -62),
        new THREE.Vector3(178, 0, 6),
        new THREE.Vector3(144, 0, 74),
        new THREE.Vector3(196, 0, 168),
        new THREE.Vector3(136, 0, 236),
        new THREE.Vector3(44, 0, 224),
      ];
    case 'metropolis':
    default:
      return [
        new THREE.Vector3(0, 0, 120),
        new THREE.Vector3(0, 0, 20),
        new THREE.Vector3(0, 0, -90),
        new THREE.Vector3(24, 0, -175),
        new THREE.Vector3(95, 0, -210),
        new THREE.Vector3(175, 0, -180),
        new THREE.Vector3(215, 0, -105),
        new THREE.Vector3(180, 0, -28),
        new THREE.Vector3(132, 0, 18),
        new THREE.Vector3(165, 0, 92),
        new THREE.Vector3(225, 0, 152),
        new THREE.Vector3(185, 0, 224),
        new THREE.Vector3(96, 0, 232),
        new THREE.Vector3(34, 0, 186),
      ];
  }
}

function createAsphaltTexture(trackId: RacingTrackId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const baseBg =
    trackId === 'neotokyo'
      ? '#111324'
      : trackId === 'desert'
      ? '#2b2623'
      : trackId === 'alpine'
      ? '#1f262d'
      : '#181d29';
  ctx.fillStyle = baseBg;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4000; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 20 + Math.floor(Math.random() * 24);
    ctx.fillStyle =
      trackId === 'desert'
        ? `rgb(${shade + 12},${shade + 6},${shade})`
        : `rgb(${shade},${shade + 4},${shade + 10})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
  grooveGrad.addColorStop(0.28, 'rgba(5,7,12,0.32)');
  grooveGrad.addColorStop(0.5, 'rgba(5,7,12,0.1)');
  grooveGrad.addColorStop(0.72, 'rgba(5,7,12,0.32)');
  grooveGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grooveGrad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = trackId === 'neotokyo' ? '#22d3ee' : '#e2e8f0';
  ctx.fillRect(16, 0, 12, 512);
  ctx.fillRect(484, 0, 12, 512);

  ctx.fillStyle =
    trackId === 'neotokyo'
      ? 'rgba(236, 72, 153, 0.85)'
      : trackId === 'coast'
      ? 'rgba(56, 189, 248, 0.82)'
      : 'rgba(250, 204, 21, 0.78)';
  for (let y = 16; y < 512; y += 64) {
    ctx.fillRect(251, y, 10, 34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 72);
  return tex;
}

function createStartCheckeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGroundPatternTexture(trackId: RacingTrackId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (trackId === 'coast') {
    ctx.fillStyle = '#c89d66';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(245, 222, 179, 0.28)' : 'rgba(161, 114, 58, 0.2)';
      ctx.fillRect((i * 79) % 512, (i * 149) % 512, 3, 2);
    }
  } else if (trackId === 'alpine') {
    ctx.fillStyle = '#1b4328';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3200; i += 1) {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(52, 211, 153, 0.16)' : 'rgba(15, 45, 24, 0.34)';
      ctx.fillRect((i * 67) % 512, (i * 131) % 512, 3, 3);
    }
  } else if (trackId === 'desert') {
    ctx.fillStyle = '#c27835';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.12)';
    ctx.lineWidth = 4;
    for (let y = 0; y < 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + 14, 340, y - 14, 512, y);
      ctx.stroke();
    }
  } else if (trackId === 'neotokyo') {
    ctx.fillStyle = '#090916';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#182132';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#1f2b40';
    for (let y = 0; y < 512; y += 128) {
      for (let x = 0; x < 512; x += 128) {
        ctx.fillRect(x + 8, y + 8, 112, 112);
      }
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(32, 32);
  return tex;
}

function createSkyscraperFacadeTexture(accentHex: string, tintHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = tintHex;
  ctx.fillRect(0, 0, 256, 512);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.48)';
  for (let y = 0; y < 512; y += 24) {
    ctx.fillRect(0, y, 256, 5);
  }

  const cols = 8;
  const rows = 20;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const hash = (r * 31 + c * 17) % 11;
      if (hash === 0 || hash === 3 || hash === 6 || hash === 9) {
        ctx.fillStyle = hash === 9 ? accentHex : hash === 3 ? '#fef08a' : '#bae6fd';
      } else {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      }
      ctx.fillRect(10 + c * 30, 10 + r * 24, 18, 13);
    }
  }

  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 476, 256, 36);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fillRect(14, 482, 228, 22);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildGpCircuitScene(
  scene: THREE.Scene,
  isSoftwareGl: boolean,
  trackIdInput: RacingTrackId = 'metropolis'
): BuiltCircuit {
  const trackSpec = getRacingTrackSpec(trackIdInput);
  const trackId = trackSpec.id;
  const disposables: Array<{ dispose: () => void }> = [];
  const tvConstrained = isConstrainedTvDevice();
  const castPropShadow = !isSoftwareGl && !tvConstrained;
  let circuitDisposed = false;

  // All circuit meshes live inside circuitRoot so switching tracks disposes 100% cleanly on Tizen
  const circuitRoot = new THREE.Group();
  scene.add(circuitRoot);

  const waypoints = getTrackWaypoints(trackId);
  const curve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.48);
  const totalLength = curve.getLength();
  const SAMPLE_COUNT = 360;
  const samples: TrackSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const s = i / SAMPLE_COUNT;
    const point = curve.getPointAt(s);
    const tangent = curve.getTangentAt(s).setY(0).normalize();
    const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    samples.push({
      s,
      dist: s * totalLength,
      point,
      tangent,
      normal,
    });
  }

  function isClearOfTrack(wx: number, wz: number, extraMargin: number): boolean {
    const minDistSq =
      (TRACK_BARRIER_HALF_WIDTH + extraMargin) * (TRACK_BARRIER_HALF_WIDTH + extraMargin);
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const p = samples[i].point;
      const dx = wx - p.x;
      const dz = wz - p.z;
      if (dx * dx + dz * dz < minDistSq) return false;
    }
    return true;
  }

  // Terrain Ground Plane tailored per circuit
  const groundTex = createGroundPatternTexture(trackId);
  groundTex.anisotropy = isSoftwareGl ? 1 : 4;
  const groundGeo = new THREE.PlaneGeometry(1450, 1450);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    color: 0xffffff,
    roughness: trackId === 'neotokyo' ? 0.48 : 0.88,
    metalness: trackId === 'neotokyo' ? 0.25 : 0.06,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(100, -0.08, 10);
  ground.receiveShadow = !isSoftwareGl;
  circuitRoot.add(ground);
  disposables.push(groundGeo, groundMat, groundTex);

  // Coast Sunset: Sparkling Mediterranean Sea Plane along West/South Coastline
  if (trackId === 'coast') {
    const oceanGeo = new THREE.PlaneGeometry(720, 1450);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.35,
      roughness: 0.14,
      metalness: 0.55,
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-415, -0.04, 0);
    circuitRoot.add(ocean);
    disposables.push(oceanGeo, oceanMat);
  } else if (trackId === 'metropolis') {
    const parkGeo = new THREE.CircleGeometry(46, 28);
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x164e2e, roughness: 0.9 });
    const parkMesh = new THREE.Mesh(parkGeo, parkMat);
    parkMesh.rotation.x = -Math.PI / 2;
    parkMesh.position.set(95, -0.055, -108);
    parkMesh.receiveShadow = !isSoftwareGl;
    circuitRoot.add(parkMesh);
    disposables.push(parkGeo, parkMat);
  }

  // Sidewalk / Shoulder Verges
  const vergeColor =
    trackId === 'desert'
      ? 0xb45309
      : trackId === 'alpine'
      ? 0x3f6212
      : trackId === 'coast'
      ? 0xd6b078
      : trackId === 'neotokyo'
      ? 0x1e1b4b
      : 0x334155;
  const sidewalkGeo = new THREE.BoxGeometry(3.2, 0.14, totalLength / SAMPLE_COUNT + 0.5);
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: vergeColor, roughness: 0.85, metalness: 0.1 });
  const sidewalkInst = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, SAMPLE_COUNT * 2);
  disposables.push(sidewalkGeo, sidewalkMat);

  // Asphalt Ribbon Geometry + Curbs + Guardrails
  const roadPos: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];

  const curbGeo = new THREE.BoxGeometry(1.15, 0.14, totalLength / SAMPLE_COUNT + 0.35);
  const curbRedMat = new THREE.MeshStandardMaterial({
    color: trackSpec.curbPrimaryHex,
    emissive: trackId === 'neotokyo' ? trackSpec.curbPrimaryHex : 0x000000,
    emissiveIntensity: trackId === 'neotokyo' ? 0.55 : 0,
    roughness: 0.72,
  });
  const curbWhiteMat = new THREE.MeshStandardMaterial({
    color: trackSpec.curbSecondaryHex,
    emissive: trackId === 'neotokyo' ? trackSpec.curbSecondaryHex : 0x000000,
    emissiveIntensity: trackId === 'neotokyo' ? 0.45 : 0,
    roughness: 0.75,
  });
  disposables.push(curbGeo, curbRedMat, curbWhiteMat);

  const redMatrices: THREE.Matrix4[] = [];
  const whiteMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let swIdx = 0;

  for (let i = 0; i <= SAMPLE_COUNT; i += 1) {
    const smp = samples[i % SAMPLE_COUNT];
    const lx = smp.point.x + smp.normal.x * TRACK_HALF_WIDTH;
    const lz = smp.point.z + smp.normal.z * TRACK_HALF_WIDTH;
    const rx = smp.point.x - smp.normal.x * TRACK_HALF_WIDTH;
    const rz = smp.point.z - smp.normal.z * TRACK_HALF_WIDTH;

    roadPos.push(lx, 0.01, lz, rx, 0.01, rz);
    const vCoord = i / SAMPLE_COUNT;
    roadUv.push(0, vCoord, 1, vCoord);

    if (i < SAMPLE_COUNT) {
      const base = i * 2;
      roadIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);

      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z);
      [-1, 1].forEach((side) => {
        const offset = side * (TRACK_HALF_WIDTH + 0.52);
        dummy.position.set(
          smp.point.x + smp.normal.x * offset,
          0.06,
          smp.point.z + smp.normal.z * offset
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        if (i % 2 === 0) redMatrices.push(dummy.matrix.clone());
        else whiteMatrices.push(dummy.matrix.clone());

        if (swIdx < SAMPLE_COUNT * 2) {
          dummy.position.set(
            smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 1.5),
            0.04,
            smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 1.5)
          );
          dummy.updateMatrix();
          sidewalkInst.setMatrixAt(swIdx, dummy.matrix);
          swIdx += 1;
        }
      });
    }
  }
  sidewalkInst.instanceMatrix.needsUpdate = true;
  circuitRoot.add(sidewalkInst);

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();

  const asphaltTex = createAsphaltTexture(trackId);
  asphaltTex.anisotropy = isSoftwareGl ? 1 : 8;
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: trackId === 'neotokyo' ? 0.42 : 0.78,
    metalness: trackId === 'neotokyo' ? 0.24 : 0.08,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = !isSoftwareGl;
  circuitRoot.add(roadMesh);
  disposables.push(roadGeo, asphaltTex, roadMat);

  if (!isSoftwareGl && !tvConstrained) {
    const pbrGroundPath =
      trackId === 'alpine'
        ? 'assets/games/pbr/forrest_ground_diff.jpg'
        : trackId === 'metropolis' || trackId === 'neotokyo'
        ? 'assets/games/pbr/concrete_worn_diff.jpg'
        : null;
    if (pbrGroundPath) {
      void loadCachedPbrTexture(pbrGroundPath, {
        srgb: true,
        repeatX: 28,
        repeatY: 28,
        anisotropy: 4,
      }).then((tex) => {
        if (!tex || circuitDisposed) return;
        groundMat.map = tex;
        groundMat.color.setHex(
          trackId === 'neotokyo' ? 0x1e293b : trackId === 'alpine' ? 0x6ee7b7 : 0x3a475c
        );
        groundMat.needsUpdate = true;
      });
    }
    void loadCachedPbrTexture('assets/games/pbr/asphalt_nor.jpg', {
      srgb: false,
      repeatX: 1,
      repeatY: 72,
      anisotropy: 8,
    }).then((nor) => {
      if (!nor || circuitDisposed) return;
      roadMat.normalMap = nor;
      roadMat.normalScale.set(0.65, 0.65);
      roadMat.needsUpdate = true;
    });
  }

  // Wet Reflective Puddles on Metropolis & Neo-Tokyo
  if (trackId === 'metropolis' || trackId === 'neotokyo') {
    const puddleGeo = new THREE.CircleGeometry(3.4, 20);
    const puddleMat = new THREE.MeshPhysicalMaterial({
      color: trackId === 'neotokyo' ? 0x1e1b4b : 0x091326,
      roughness: 0.06,
      metalness: 0.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    [0.08, 0.26, 0.48, 0.68, 0.84].forEach((sVal, idx) => {
      const smp = samples[Math.floor(sVal * SAMPLE_COUNT) % SAMPLE_COUNT];
      const side = idx % 2 === 0 ? -2.8 : 2.6;
      const pud = new THREE.Mesh(puddleGeo, puddleMat);
      pud.rotation.x = -Math.PI / 2;
      pud.scale.set(1.35, 2.2, 1);
      pud.rotation.z = Math.atan2(smp.tangent.x, smp.tangent.z);
      pud.position.set(
        smp.point.x + smp.normal.x * side,
        0.018,
        smp.point.z + smp.normal.z * side
      );
      circuitRoot.add(pud);
    });
    disposables.push(puddleGeo, puddleMat);
  }

  // Persistent Tire Skidmark Pool
  const SKID_POOL = 220;
  const skidGeo = new THREE.PlaneGeometry(0.42, 1.35);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x05070c,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const skidInst = new THREE.InstancedMesh(skidGeo, skidMat, SKID_POOL);
  skidInst.frustumCulled = false;
  const skidDummy = new THREE.Object3D();
  for (let i = 0; i < SKID_POOL; i += 1) {
    skidDummy.position.set(0, -50, 0);
    skidDummy.scale.setScalar(0.001);
    skidDummy.updateMatrix();
    skidInst.setMatrixAt(i, skidDummy.matrix);
  }
  skidInst.instanceMatrix.needsUpdate = true;
  circuitRoot.add(skidInst);
  disposables.push(skidGeo, skidMat);
  let skidCursor = 0;

  const redCurbs = new THREE.InstancedMesh(curbGeo, curbRedMat, redMatrices.length);
  redMatrices.forEach((m, idx) => redCurbs.setMatrixAt(idx, m));
  const whiteCurbs = new THREE.InstancedMesh(curbGeo, curbWhiteMat, whiteMatrices.length);
  whiteMatrices.forEach((m, idx) => whiteCurbs.setMatrixAt(idx, m));
  circuitRoot.add(redCurbs, whiteCurbs);

  // Guardrail Barriers (colored per theme)
  const postStep = 4;
  const postCount = Math.floor(SAMPLE_COUNT / postStep) * 2;
  const postGeo = new THREE.BoxGeometry(0.48, 1.0, 2.4);
  const postMat = new THREE.MeshStandardMaterial({
    color: trackId === 'desert' ? 0x92400e : trackId === 'alpine' ? 0x451a03 : 0x1e293b,
    emissive: trackSpec.padColorHex,
    emissiveIntensity: trackId === 'neotokyo' ? 0.65 : trackId === 'metropolis' ? 0.35 : 0.14,
    roughness: 0.45,
    metalness: 0.55,
  });
  const barrierPosts = new THREE.InstancedMesh(postGeo, postMat, postCount);
  let pIdx = 0;
  for (let i = 0; i < SAMPLE_COUNT; i += postStep) {
    const smp = samples[i];
    const yaw = Math.atan2(smp.tangent.x, smp.tangent.z);
    for (const side of [-1, 1]) {
      if (pIdx >= postCount) break;
      dummy.position.set(
        smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 0.4),
        0.5,
        smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 0.4)
      );
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      barrierPosts.setMatrixAt(pIdx, dummy.matrix);
      pIdx += 1;
    }
  }
  circuitRoot.add(barrierPosts);
  disposables.push(postGeo, postMat);

  // Start / Finish Checkered Strip & Lit Gantry
  const startSmp = samples[0];
  const startYaw = Math.atan2(startSmp.tangent.x, startSmp.tangent.z);
  const checkeredTex = createStartCheckeredTexture();
  const startLineMat = new THREE.MeshBasicMaterial({ map: checkeredTex });
  const startLineGeo = new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 1.96, 3.6);
  const startLine = new THREE.Mesh(startLineGeo, startLineMat);
  startLine.position.set(startSmp.point.x, 0.025, startSmp.point.z);
  startLine.rotation.set(-Math.PI / 2, 0, startYaw);
  circuitRoot.add(startLine);
  disposables.push(checkeredTex, startLineMat, startLineGeo);

  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSmp.point);
  gantryGroup.rotation.y = startYaw;
  const pillarGeo = new THREE.BoxGeometry(0.9, 8.2, 0.9);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
  const neonBannerGeo = new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2 + 2.4, 1.8, 0.8);
  const neonBannerMat = new THREE.MeshStandardMaterial({
    color: trackSpec.curbPrimaryHex,
    emissive: trackSpec.padColorHex,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });
  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
  leftPillar.position.set(-(TRACK_HALF_WIDTH + 1.1), 4.1, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
  rightPillar.position.set(TRACK_HALF_WIDTH + 1.1, 4.1, 0);
  const topBanner = new THREE.Mesh(neonBannerGeo, neonBannerMat);
  topBanner.position.set(0, 7.6, 0);
  gantryGroup.add(leftPillar, rightPillar, topBanner);
  circuitRoot.add(gantryGroup);
  disposables.push(pillarGeo, pillarMat, neonBannerGeo, neonBannerMat);

  // Scenery Specific to Each of the 5 Circuits (Frame 0 Instant + Async CC0 GLBs)
  const buildCityDistrict = (accentPalette: [string, string, string], towerHeightBoost = 0) => {
    const facadeTexA = createSkyscraperFacadeTexture(accentPalette[0], '#141e30');
    const facadeTexB = createSkyscraperFacadeTexture(accentPalette[1], '#1b2234');
    const facadeTexC = createSkyscraperFacadeTexture(accentPalette[2], '#17192d');
    const bldgMats = [
      new THREE.MeshStandardMaterial({ map: facadeTexA, roughness: 0.45, metalness: 0.4, emissive: 0x0b1628, emissiveIntensity: 0.48 }),
      new THREE.MeshStandardMaterial({ map: facadeTexB, roughness: 0.5, metalness: 0.32, emissive: 0x18141c, emissiveIntensity: 0.44 }),
      new THREE.MeshStandardMaterial({ map: facadeTexC, roughness: 0.42, metalness: 0.48, emissive: 0x160f28, emissiveIntensity: 0.48 }),
    ];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72, metalness: 0.5 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: trackId === 'neotokyo' ? 0x22d3ee : 0xf43f5e });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    disposables.push(facadeTexA, facadeTexB, facadeTexC, ...bldgMats, roofMat, beaconMat, boxGeo);

    for (let i = 0; i < SAMPLE_COUNT; i += 8) {
      const smp = samples[i];
      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z);
      const sides = i % 16 === 0 ? [1, -1] : [i % 2 === 0 ? 1 : -1];
      for (const side of sides) {
        const distOut = TRACK_BARRIER_HALF_WIDTH + 16 + ((i * 11) % 24);
        const bx = smp.point.x + smp.normal.x * side * distOut;
        const bz = smp.point.z + smp.normal.z * side * distOut;
        const w = 11 + ((i * 7) % 10);
        const d = 11 + ((i * 13) % 10);
        if (!isClearOfTrack(bx, bz, Math.max(w, d) * 0.65 + 4.5)) continue;
        const h = 16 + towerHeightBoost + ((i * 19 + (side > 0 ? 7 : 3)) % 42);
        const bGroup = new THREE.Group();
        bGroup.position.set(bx, 0, bz);
        bGroup.rotation.y = yaw;
        const baseMesh = new THREE.Mesh(boxGeo, bldgMats[(i + (side > 0 ? 1 : 2)) % 3]);
        baseMesh.scale.set(w, h, d);
        baseMesh.position.y = h * 0.5;
        baseMesh.castShadow = castPropShadow;
        baseMesh.receiveShadow = !isSoftwareGl;
        bGroup.add(baseMesh);
        if (h > 34) {
          const crown = new THREE.Mesh(boxGeo, bldgMats[(i + 1) % 3]);
          crown.scale.set(w * 0.66, h * 0.25, d * 0.66);
          crown.position.y = h + h * 0.125;
          const beacon = new THREE.Mesh(boxGeo, beaconMat);
          beacon.scale.set(0.95, 0.95, 0.95);
          beacon.position.y = h * 1.25 + 1.5;
          bGroup.add(crown, beacon);
        }
        circuitRoot.add(bGroup);
      }
    }
  };

  if (trackId === 'metropolis') {
    buildCityDistrict(['#38bdf8', '#f59e0b', '#a855f7'], 0);
  } else if (trackId === 'neotokyo') {
    buildCityDistrict(['#ec4899', '#22d3ee', '#a855f7'], 10);
    // Glowing Cyber Neon Arches over corners
    const archGeo = new THREE.TorusGeometry(TRACK_HALF_WIDTH + 2.2, 0.42, 8, 22, Math.PI);
    const archMatA = new THREE.MeshBasicMaterial({ color: 0xec4899 });
    const archMatB = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    [0.12, 0.28, 0.46, 0.65, 0.82, 0.94].forEach((sVal, idx) => {
      const smp = samples[Math.floor(sVal * SAMPLE_COUNT) % SAMPLE_COUNT];
      const arch = new THREE.Mesh(archGeo, idx % 2 === 0 ? archMatA : archMatB);
      arch.position.set(smp.point.x, 0.1, smp.point.z);
      arch.rotation.y = Math.atan2(smp.tangent.x, smp.tangent.z);
      circuitRoot.add(arch);
    });
    disposables.push(archGeo, archMatA, archMatB);
  } else if (trackId === 'alpine') {
    // Jagged Alpine Peaks & Mountain Pines
    const peakGeo = new THREE.ConeGeometry(22, 52, 6);
    const peakMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, flatShading: true });
    const snowGeo = new THREE.ConeGeometry(9.5, 16, 6);
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72, flatShading: true });
    for (let i = 0; i < 20; i += 1) {
      const ang = (i / 20) * Math.PI * 2;
      const dist = 290 + (i % 3) * 45;
      const mx = 90 + Math.cos(ang) * dist;
      const mz = 10 + Math.sin(ang) * dist;
      const scl = 0.85 + (i % 4) * 0.28;
      const peak = new THREE.Mesh(peakGeo, peakMat);
      peak.position.set(mx, 24 * scl, mz);
      peak.scale.set(scl, scl * 1.15, scl);
      const cap = new THREE.Mesh(snowGeo, snowMat);
      cap.position.set(mx, 44 * scl, mz);
      cap.scale.set(scl, scl, scl);
      circuitRoot.add(peak, cap);
    }
    disposables.push(peakGeo, peakMat, snowGeo, snowMat);
  } else if (trackId === 'desert') {
    // Sandstone Mesa Buttes & Terracotta Canyon Monoliths
    const mesaGeo = new THREE.CylinderGeometry(16, 24, 34, 7);
    const mesaMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9, flatShading: true });
    const topMesaGeo = new THREE.CylinderGeometry(10, 14, 14, 7);
    const topMesaMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85, flatShading: true });
    for (let i = 0; i < 18; i += 1) {
      const ang = (i / 18) * Math.PI * 2;
      const dist = 160 + (i % 4) * 58;
      const mx = 105 + Math.cos(ang) * dist;
      const mz = 5 + Math.sin(ang) * dist;
      if (!isClearOfTrack(mx, mz, 28)) continue;
      const m = new THREE.Mesh(mesaGeo, mesaMat);
      m.position.set(mx, 17, mz);
      const cap = new THREE.Mesh(topMesaGeo, topMesaMat);
      cap.position.set(mx, 40, mz);
      circuitRoot.add(m, cap);
    }
    disposables.push(mesaGeo, mesaMat, topMesaGeo, topMesaMat);
  } else if (trackId === 'coast') {
    // Coastal Resort Pavilions & Beach Lighthouse Towers
    const villaGeo = new THREE.BoxGeometry(12, 8, 12);
    const villaMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.65 });
    const roofVillaGeo = new THREE.ConeGeometry(9.5, 4.5, 4);
    const roofVillaMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.72 });
    for (let i = 10; i < SAMPLE_COUNT; i += 24) {
      const smp = samples[i];
      const bx = smp.point.x + smp.normal.x * (TRACK_BARRIER_HALF_WIDTH + 18);
      const bz = smp.point.z + smp.normal.z * (TRACK_BARRIER_HALF_WIDTH + 18);
      if (bx < -80 || !isClearOfTrack(bx, bz, 12)) continue;
      const v = new THREE.Mesh(villaGeo, villaMat);
      v.position.set(bx, 4, bz);
      const r = new THREE.Mesh(roofVillaGeo, roofVillaMat);
      r.position.set(bx, 10.2, bz);
      r.rotation.y = Math.PI / 4;
      circuitRoot.add(v, r);
    }
    disposables.push(villaGeo, villaMat, roofVillaGeo, roofVillaMat);
  }

  // Streetlamps (Metropolis / Coast / Neo-Tokyo)
  if (trackId === 'metropolis' || trackId === 'coast' || trackId === 'neotokyo') {
    const towerPoleGeo = new THREE.CylinderGeometry(0.24, 0.34, 12.5, 8);
    const towerArmGeo = new THREE.BoxGeometry(0.24, 0.24, 2.8);
    const towerHeadGeo = new THREE.BoxGeometry(1.4, 0.32, 0.7);
    const towerHeadMat = new THREE.MeshBasicMaterial({
      color: trackId === 'neotokyo' ? 0x22d3ee : 0xfef08a,
    });
    for (let i = 10; i < SAMPLE_COUNT; i += 22) {
      const smp = samples[i];
      const side = i % 44 === 10 ? 1 : -1;
      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z);
      const lx = smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 3.2);
      const lz = smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 3.2);
      const lamp = new THREE.Group();
      lamp.position.set(lx, 0, lz);
      lamp.rotation.y = yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const pole = new THREE.Mesh(towerPoleGeo, pillarMat);
      pole.position.y = 6.25;
      const arm = new THREE.Mesh(towerArmGeo, pillarMat);
      arm.position.set(0, 12.3, 1.3);
      const head = new THREE.Mesh(towerHeadGeo, towerHeadMat);
      head.position.set(0, 12.1, 2.4);
      lamp.add(pole, arm, head);
      circuitRoot.add(lamp);
    }
    disposables.push(towerPoleGeo, towerArmGeo, towerHeadGeo, towerHeadMat);
  }

  // Nitro Boost Pads
  const boostPads: BoostPadZone[] =
    trackId === 'neotokyo'
      ? [
          { s: 0.12, lateralOffset: -2.0 },
          { s: 0.24, lateralOffset: 2.0 },
          { s: 0.42, lateralOffset: 0 },
          { s: 0.58, lateralOffset: -2.2 },
          { s: 0.74, lateralOffset: 2.0 },
          { s: 0.9, lateralOffset: 0 },
        ]
      : [
          { s: 0.14, lateralOffset: -2.2 },
          { s: 0.42, lateralOffset: 2.0 },
          { s: 0.72, lateralOffset: -1.8 },
          { s: 0.89, lateralOffset: 1.8 },
        ];
  const padGeo = new THREE.PlaneGeometry(3.4, 7.5);
  const padMat = new THREE.MeshBasicMaterial({
    color: trackSpec.padColorHex,
    transparent: true,
    opacity: 0.88,
  });
  boostPads.forEach((pad) => {
    const idx = Math.floor(pad.s * SAMPLE_COUNT) % SAMPLE_COUNT;
    const smp = samples[idx];
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(
      smp.point.x + smp.normal.x * pad.lateralOffset,
      0.032,
      smp.point.z + smp.normal.z * pad.lateralOffset
    );
    padMesh.rotation.order = 'YXZ';
    padMesh.rotation.y = Math.atan2(smp.tangent.x, smp.tangent.z);
    padMesh.rotation.x = -Math.PI / 2;
    circuitRoot.add(padMesh);
  });
  disposables.push(padGeo, padMat);

  // Foliage / Desert Cacti / Pines per circuit (InstancedMesh)
  const propCount = trackId === 'alpine' ? 68 : 44;
  const trunkGeo = new THREE.CylinderGeometry(
    trackId === 'desert' ? 0.45 : 0.28,
    trackId === 'desert' ? 0.5 : 0.42,
    trackId === 'coast' ? 4.4 : 2.8,
    6
  );
  const trunkMat = new THREE.MeshStandardMaterial({
    color: trackId === 'desert' ? 0x15803d : 0x4a2f1b,
    roughness: 0.88,
  });
  const crownGeo =
    trackId === 'alpine'
      ? new THREE.ConeGeometry(2.3, 6.2, 7)
      : trackId === 'desert'
      ? new THREE.CylinderGeometry(0.32, 0.32, 2.2, 6)
      : new THREE.SphereGeometry(2.1, 8, 7);
  const crownMat = new THREE.MeshStandardMaterial({
    color: trackId === 'alpine' ? 0x065f46 : trackId === 'coast' ? 0x22c55e : 0x15803d,
    roughness: 0.8,
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, propCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, propCount);
  const tDummy = new THREE.Object3D();
  for (let i = 0; i < propCount; i += 1) {
    const smp = samples[(i * 5 + 2) % SAMPLE_COUNT];
    const side = i % 2 === 0 ? 1 : -1;
    const dist = TRACK_BARRIER_HALF_WIDTH + 6.5 + ((i * 3) % 8);
    const tx = smp.point.x + smp.normal.x * side * dist;
    const tz = smp.point.z + smp.normal.z * side * dist;
    const scl = 0.82 + ((i * 5) % 5) * 0.14;
    tDummy.position.set(tx, (trackId === 'coast' ? 2.2 : 1.4) * scl, tz);
    tDummy.scale.setScalar(scl);
    tDummy.updateMatrix();
    trunks.setMatrixAt(i, tDummy.matrix);
    tDummy.position.set(
      tx,
      (trackId === 'coast' ? 4.8 : trackId === 'alpine' ? 4.4 : 3.2) * scl,
      tz
    );
    tDummy.updateMatrix();
    crowns.setMatrixAt(i, tDummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  circuitRoot.add(trunks, crowns);

  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.25, 10);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 });
  const tireCount = 34;
  const tireInst = new THREE.InstancedMesh(tireGeo, tireMat, tireCount);
  for (let i = 0; i < tireCount; i += 1) {
    const smp = samples[(i * 10 + 3) % SAMPLE_COUNT];
    const side = i % 2 === 0 ? 1 : -1;
    tDummy.position.set(
      smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 1.4),
      0.62,
      smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 1.4)
    );
    tDummy.scale.setScalar(1);
    tDummy.updateMatrix();
    tireInst.setMatrixAt(i, tDummy.matrix);
  }
  tireInst.instanceMatrix.needsUpdate = true;
  circuitRoot.add(tireInst);
  disposables.push(trunkGeo, trunkMat, crownGeo, crownMat, tireGeo, tireMat);

  // Night Sky Starfield on Metropolis & Neo-Tokyo
  if (!isSoftwareGl && trackSpec.stars) {
    const starCount = 340;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 280 + Math.random() * 240;
      starPositions[i * 3] = 90 + Math.cos(ang) * rad;
      starPositions[i * 3 + 1] = 45 + Math.random() * 140;
      starPositions[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xcbd5e1, size: 1.4, sizeAttenuation: true });
    circuitRoot.add(new THREE.Points(starGeo, starMat));
    disposables.push(starGeo, starMat);
  }

  // Async Verified CC0 3D Props tailored per circuit
  const placePropNormalized = (
    source: THREE.Group,
    targetWidth: number,
    px: number,
    py: number,
    pz: number,
    rotY: number
  ) => {
    const clone = source.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(0.1, size.x, size.z);
    const scale = targetWidth / maxDim;
    clone.scale.setScalar(scale);
    clone.position.set(px, py - box.min.y * scale, pz);
    clone.rotation.y = rotY;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = castPropShadow;
        child.receiveShadow = !isSoftwareGl;
      }
    });
    circuitRoot.add(clone);
  };

  if (trackId === 'metropolis' || trackId === 'neotokyo') {
    [
      'assets/games/models/city/building-skyscraper-a.glb',
      'assets/games/models/city/building-skyscraper-b.glb',
      'assets/games/models/city/building-skyscraper-c.glb',
    ].forEach((asset, assetIdx) => {
      void loadCachedTrackProp(asset).then((src) => {
        if (!src || circuitDisposed) return;
        for (let i = assetIdx * 24; i < SAMPLE_COUNT; i += 108) {
          const smp = samples[i % SAMPLE_COUNT];
          const side = assetIdx % 2 === 0 ? 1 : -1;
          const bx = smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 22);
          const bz = smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 22);
          if (!isClearOfTrack(bx, bz, 12)) continue;
          const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          placePropNormalized(src, 16, bx, 0, bz, yaw);
        }
      });
    });
  } else if (trackId === 'alpine') {
    ['assets/games/models/soccer_pong/cliff_block_stone.glb', 'assets/games/models/treeLarge.glb'].forEach(
      (asset, assetIdx) => {
        void loadCachedTrackProp(asset).then((src) => {
          if (!src || circuitDisposed) return;
          for (let i = assetIdx * 18; i < SAMPLE_COUNT; i += 44) {
            const smp = samples[i % SAMPLE_COUNT];
            const side = i % 2 === 0 ? 1 : -1;
            const bx = smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 12);
            const bz = smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 12);
            if (!isClearOfTrack(bx, bz, 9)) continue;
            placePropNormalized(src, assetIdx === 0 ? 14 : 9, bx, 0, bz, i * 0.4);
          }
        });
      }
    );
  } else if (trackId === 'coast') {
    void loadCachedTrackProp('assets/games/models/treeLarge.glb').then((src) => {
      if (!src || circuitDisposed) return;
      for (let i = 6; i < SAMPLE_COUNT; i += 24) {
        const smp = samples[i % SAMPLE_COUNT];
        const bx = smp.point.x + smp.normal.x * (TRACK_BARRIER_HALF_WIDTH + 9);
        const bz = smp.point.z + smp.normal.z * (TRACK_BARRIER_HALF_WIDTH + 9);
        if (!isClearOfTrack(bx, bz, 6)) continue;
        placePropNormalized(src, 8.5, bx, 0, bz, i * 0.5);
      }
    });
  }

  void loadCachedTrackProp('assets/games/models/grandStandCovered.glb').then((src) => {
    if (!src || circuitDisposed) return;
    [8, 110, 275].forEach((idx, n) => {
      const smp = samples[idx % SAMPLE_COUNT];
      const side = n % 2 === 0 ? 1 : -1;
      const bx = smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 11);
      const bz = smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 11);
      if (!isClearOfTrack(bx, bz, 8)) return;
      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      placePropNormalized(src, 22, bx, 0, bz, yaw);
    });
  });

  void loadCachedTrackProp('assets/games/models/flagCheckers.glb').then((src) => {
    if (!src || circuitDisposed) return;
    [-1, 1].forEach((side) => {
      placePropNormalized(
        src,
        5.5,
        startSmp.point.x + startSmp.normal.x * side * (TRACK_HALF_WIDTH + 3.2),
        0,
        startSmp.point.z + startSmp.normal.z * side * (TRACK_HALF_WIDTH + 3.2),
        startYaw
      );
    });
  });

  // Animated 3D Crew at Start-Finish (Desktop/Mobile GPU)
  const actors: RiggedActorHandle[] = [];
  if (!isSoftwareGl && !tvConstrained) {
    const marshalRobot = spawnRigged3dActor(circuitRoot, 'assets/games/models/RobotExpressive.glb', {
      position: [
        startSmp.point.x + startSmp.normal.x * (TRACK_HALF_WIDTH + 3.4),
        0,
        startSmp.point.z + startSmp.normal.z * (TRACK_HALF_WIDTH + 3.4),
      ],
      rotationY: startYaw - Math.PI * 0.45,
      targetHeight: 2.8,
      defaultClips: ['Wave', 'Dance', 'Idle'],
      castShadow: true,
    });
    const marshalXbot = spawnRigged3dActor(circuitRoot, 'assets/games/models/Xbot.glb', {
      position: [
        startSmp.point.x - startSmp.normal.x * (TRACK_HALF_WIDTH + 3.6),
        0,
        startSmp.point.z - startSmp.normal.z * (TRACK_HALF_WIDTH + 3.6),
      ],
      rotationY: startYaw + Math.PI * 0.5,
      targetHeight: 2.5,
      defaultClips: ['idle', 'walk', 'run'],
      castShadow: true,
    });
    actors.push(marshalRobot, marshalXbot);
  }
  let celebratingState = false;

  function sampleAtS(
    sRaw: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outNorm: THREE.Vector3
  ): void {
    const s = ((sRaw % 1) + 1) % 1;
    const fIdx = s * SAMPLE_COUNT;
    const i0 = Math.floor(fIdx) % SAMPLE_COUNT;
    const i1 = (i0 + 1) % SAMPLE_COUNT;
    const alpha = fIdx - Math.floor(fIdx);
    const a = samples[i0];
    const b = samples[i1];
    outPos.lerpVectors(a.point, b.point, alpha);
    outTan.lerpVectors(a.tangent, b.tangent, alpha).normalize();
    outNorm.lerpVectors(a.normal, b.normal, alpha).normalize();
  }

  function projectOntoTrack(x: number, z: number, hintIndex?: number) {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (typeof hintIndex === 'number' && hintIndex >= 0 && hintIndex < SAMPLE_COUNT) {
      for (let offset = -24; offset <= 24; offset += 1) {
        const idx = (hintIndex + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        const p = samples[idx].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = idx;
        }
      }
    }

    if (bestDistSq > 900) {
      for (let idx = 0; idx < SAMPLE_COUNT; idx += 1) {
        const p = samples[idx].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = idx;
        }
      }
    }

    const smp = samples[bestIdx];
    const relX = x - smp.point.x;
    const relZ = z - smp.point.z;
    const forwardProj = relX * smp.tangent.x + relZ * smp.tangent.z;
    const lateralProj = relX * smp.normal.x + relZ * smp.normal.z;
    const s = ((smp.s + forwardProj / totalLength) % 1 + 1) % 1;

    return {
      sampleIndex: bestIdx,
      proj: {
        s,
        distFromCenter: lateralProj,
        closestX: smp.point.x + smp.tangent.x * forwardProj,
        closestZ: smp.point.z + smp.tangent.z * forwardProj,
        closestY: smp.point.y,
        tangentX: smp.tangent.x,
        tangentZ: smp.tangent.z,
        normalX: smp.normal.x,
        normalZ: smp.normal.z,
      },
    };
  }

  return {
    trackId,
    curve,
    totalLength,
    samples,
    boostPads,
    projectOntoTrack,
    sampleAtS,
    updateActors: (dt: number) => {
      for (let i = 0; i < actors.length; i += 1) {
        actors[i].update(dt);
      }
    },
    setCelebration: (celebrating: boolean) => {
      if (celebrating === celebratingState) return;
      celebratingState = celebrating;
      if (actors[0]) actors[0].playClip(celebrating ? ['Dance', 'Jump', 'Wave'] : ['Wave', 'Idle']);
      if (actors[1]) actors[1].playClip(celebrating ? ['run', 'walk', 'idle'] : ['idle', 'walk']);
    },
    addSkidMark: (x: number, z: number, yaw: number, intensity = 1) => {
      if (circuitDisposed) return;
      skidDummy.position.set(x, 0.022, z);
      skidDummy.rotation.set(0, yaw, 0);
      const scl = Math.max(0.5, Math.min(1.3, intensity));
      skidDummy.scale.set(scl, 1, scl);
      skidDummy.updateMatrix();
      skidInst.setMatrixAt(skidCursor, skidDummy.matrix);
      skidInst.instanceMatrix.needsUpdate = true;
      skidCursor = (skidCursor + 1) % SKID_POOL;
    },
    dispose: () => {
      circuitDisposed = true;
      actors.forEach((a) => a.dispose());
      if (circuitRoot.parent) circuitRoot.parent.remove(circuitRoot);
      disposables.forEach((d) => d.dispose());
    },
  };
}
