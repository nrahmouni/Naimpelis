import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';
import {
  loadCachedPbrTexture,
  spawnRigged3dActor,
  type RiggedActorHandle,
} from '../arcade/threeProHelpers';
import { attachSafeMeshDecoders } from '../arcade/threePostFxHelpers';
import { TRACK_BARRIER_HALF_WIDTH, TRACK_HALF_WIDTH } from './racingTypes';

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
  s: number; // normalized [0..1)
  dist: number; // arc distance from start
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

function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain
  for (let i = 0; i < 4200; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 20 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 9})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle darker rubber racing groove in middle lanes
  const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
  grooveGrad.addColorStop(0.28, 'rgba(5,7,12,0.34)');
  grooveGrad.addColorStop(0.5, 'rgba(5,7,12,0.12)');
  grooveGrad.addColorStop(0.72, 'rgba(5,7,12,0.34)');
  grooveGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grooveGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Crisp off-white boundary lines (avoid HDR bloom glare)
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(18, 0, 12, 512);
  ctx.fillRect(482, 0, 12, 512);

  // Dashed center line
  ctx.fillStyle = 'rgba(226, 232, 240, 0.64)';
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

export function buildGpCircuitScene(scene: THREE.Scene, isSoftwareGl: boolean): BuiltCircuit {
  const disposables: Array<{ dispose: () => void }> = [];
  let circuitDisposed = false;
  const sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);

  // Sweeping Grand Prix Circuit Waypoints (~820m lap length)
  const waypoints = [
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

  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 256;
  grassCanvas.height = 256;
  const gCtx = grassCanvas.getContext('2d')!;
  gCtx.fillStyle = '#1f4228';
  gCtx.fillRect(0, 0, 256, 256);
  gCtx.fillStyle = '#275132';
  gCtx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1800; i += 1) {
    const gx = Math.random() * 256;
    const gy = Math.random() * 256;
    const v = 35 + Math.floor(Math.random() * 28);
    gCtx.fillStyle = `rgb(${Math.round(v * 0.68)},${v + 24},${Math.round(v * 0.55)})`;
    gCtx.fillRect(gx, gy, 2, 2);
  }
  const grassFallbackTex = new THREE.CanvasTexture(grassCanvas);
  grassFallbackTex.colorSpace = THREE.SRGBColorSpace;
  grassFallbackTex.wrapS = THREE.RepeatWrapping;
  grassFallbackTex.wrapT = THREE.RepeatWrapping;
  grassFallbackTex.repeat.set(42, 42);

  // Stadium Grass Turf Ground Plane (textured immediately on Frame 0)
  const groundGeo = new THREE.PlaneGeometry(1400, 1400);
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassFallbackTex,
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(85, -0.08, 10);
  ground.receiveShadow = !isSoftwareGl;
  scene.add(ground);
  disposables.push(groundGeo, groundMat, grassFallbackTex);

  // Procedural Ribbon Asphalt Geometry + Red/White Curbs + Guardrails
  const roadPos: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];

  const curbGeo = new THREE.BoxGeometry(1.15, 0.14, totalLength / SAMPLE_COUNT + 0.35);
  const curbRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.78 });
  const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });
  disposables.push(curbGeo, curbRedMat, curbWhiteMat);

  const redMatrices: THREE.Matrix4[] = [];
  const whiteMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

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

      // Alternating curbstones on every segment
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
      });
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();

  const asphaltTex = createAsphaltTexture();
  asphaltTex.anisotropy = isSoftwareGl ? 1 : 8;
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.78,
    metalness: 0.08,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = !isSoftwareGl;
  scene.add(roadMesh);
  disposables.push(roadGeo, asphaltTex, roadMat);

  // Wet Reflective Asphalt Puddles at key apex zones
  const puddleGeo = new THREE.CircleGeometry(3.4, 22);
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0x091326,
    roughness: 0.06,
    metalness: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.46,
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
    scene.add(pud);
  });
  disposables.push(puddleGeo, puddleMat);

  // Persistent Tire Skidmark Instanced Ring Buffer
  const SKID_POOL = 240;
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
  scene.add(skidInst);
  disposables.push(skidGeo, skidMat);
  let skidCursor = 0;

  if (!isSoftwareGl) {
    void loadCachedPbrTexture('assets/games/pbr/grass_diff.jpg', {
      srgb: true,
      repeatX: 34,
      repeatY: 34,
      anisotropy: 8,
    }).then((tex) => {
      if (!tex || circuitDisposed) return;
      groundMat.map = tex;
      groundMat.color.setHex(0x9fb88f);
      groundMat.needsUpdate = true;
    });
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
    void loadCachedPbrTexture('assets/games/pbr/asphalt_rough.jpg', {
      srgb: false,
      repeatX: 1,
      repeatY: 72,
      anisotropy: 8,
    }).then((rough) => {
      if (!rough || circuitDisposed) return;
      roadMat.roughnessMap = rough;
      roadMat.needsUpdate = true;
    });
  }

  // Instanced Red & White Curbs (2 draw calls total)
  const redCurbs = new THREE.InstancedMesh(curbGeo, curbRedMat, redMatrices.length);
  redMatrices.forEach((m, idx) => redCurbs.setMatrixAt(idx, m));
  const whiteCurbs = new THREE.InstancedMesh(curbGeo, curbWhiteMat, whiteMatrices.length);
  whiteMatrices.forEach((m, idx) => whiteCurbs.setMatrixAt(idx, m));
  scene.add(redCurbs, whiteCurbs);

  // Outer Glowing Neon Barrier Posts (InstancedMesh)
  const postStep = 6;
  const postCount = Math.floor(SAMPLE_COUNT / postStep) * 2;
  const postGeo = new THREE.BoxGeometry(0.45, 0.95, 2.2);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x7c3aed,
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.6,
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
        0.48,
        smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 0.4)
      );
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      barrierPosts.setMatrixAt(pIdx, dummy.matrix);
      pIdx += 1;
    }
  }
  scene.add(barrierPosts);
  disposables.push(postGeo, postMat);

  // Start / Finish Checkered Strip & Illuminated Gantry Arch
  const startSmp = samples[0];
  const startYaw = Math.atan2(startSmp.tangent.x, startSmp.tangent.z);
  const checkeredTex = createStartCheckeredTexture();
  const startLineMat = new THREE.MeshBasicMaterial({ map: checkeredTex });
  const startLineGeo = new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 1.96, 3.6);
  const startLine = new THREE.Mesh(startLineGeo, startLineMat);
  startLine.position.set(startSmp.point.x, 0.025, startSmp.point.z);
  startLine.rotation.set(-Math.PI / 2, 0, startYaw);
  scene.add(startLine);
  disposables.push(checkeredTex, startLineMat, startLineGeo);

  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSmp.point);
  gantryGroup.rotation.y = startYaw;
  const pillarGeo = new THREE.BoxGeometry(0.9, 8.2, 0.9);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
  const neonBannerGeo = new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2 + 2.4, 1.8, 0.8);
  const neonBannerMat = new THREE.MeshStandardMaterial({
    color: 0x7c3aed,
    emissive: 0x8b5cf6,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
  leftPillar.position.set(-(TRACK_HALF_WIDTH + 1.1), 4.1, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
  rightPillar.position.set(TRACK_HALF_WIDTH + 1.1, 4.1, 0);
  const topBanner = new THREE.Mesh(neonBannerGeo, neonBannerMat);
  topBanner.position.set(0, 7.6, 0);
  gantryGroup.add(leftPillar, rightPillar, topBanner);
  scene.add(gantryGroup);
  disposables.push(pillarGeo, pillarMat, neonBannerGeo, neonBannerMat);

  // Stadium Floodlight Towers along circuit perimeter
  const towerPoleGeo = new THREE.CylinderGeometry(0.32, 0.48, 19, 8);
  const towerHeadGeo = new THREE.BoxGeometry(3.6, 1.2, 1.2);
  const towerHeadMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
  for (let i = 15; i < SAMPLE_COUNT; i += 45) {
    const smp = samples[i];
    const side = i % 90 === 15 ? 1 : -1;
    const pole = new THREE.Mesh(towerPoleGeo, pillarMat);
    pole.position.set(
      smp.point.x + smp.normal.x * side * 19,
      9.5,
      smp.point.z + smp.normal.z * side * 19
    );
    const head = new THREE.Mesh(towerHeadGeo, towerHeadMat);
    head.position.set(pole.position.x, 19, pole.position.z);
    head.lookAt(smp.point.x, 2, smp.point.z);
    scene.add(pole, head);
  }
  disposables.push(towerPoleGeo, towerHeadGeo, towerHeadMat);

  // Glowing Cyan Nitro Boost Pads placed on key straights
  const boostPads: BoostPadZone[] = [
    { s: 0.14, lateralOffset: -2.2 },
    { s: 0.42, lateralOffset: 2.0 },
    { s: 0.72, lateralOffset: -1.8 },
    { s: 0.89, lateralOffset: 1.8 },
  ];
  const padGeo = new THREE.PlaneGeometry(3.4, 7.5);
  const padMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.85,
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
    scene.add(padMesh);
  });
  disposables.push(padGeo, padMat);

  // Trackside Stylized Pine Trees & Deformable Tire Stacks (InstancedMesh, ES2015-safe)
  const treeCount = 72;
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.48, 3.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1b, roughness: 0.9 });
  const crownGeo = new THREE.ConeGeometry(2.3, 6.2, 7);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const tDummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i += 1) {
    const smp = samples[(i * 5) % SAMPLE_COUNT];
    const side = i % 2 === 0 ? 1 : -1;
    const distOut = TRACK_BARRIER_HALF_WIDTH + 9 + ((i * 7) % 16);
    const tx = smp.point.x + smp.normal.x * side * distOut;
    const tz = smp.point.z + smp.normal.z * side * distOut;
    const scl = 0.85 + ((i * 11) % 6) * 0.14;
    tDummy.position.set(tx, 1.5 * scl, tz);
    tDummy.scale.setScalar(scl);
    tDummy.updateMatrix();
    trunks.setMatrixAt(i, tDummy.matrix);
    tDummy.position.set(tx, 5.2 * scl, tz);
    tDummy.updateMatrix();
    crowns.setMatrixAt(i, tDummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);

  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.25, 10);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 });
  const tireCount = 36;
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
  scene.add(tireInst);
  disposables.push(trunkGeo, trunkMat, crownGeo, crownMat, tireGeo, tireMat);

  // Twilight Starfield Sky Points (lightweight single Points draw call)
  if (!isSoftwareGl) {
    const starCount = 450;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 280 + Math.random() * 240;
      starPositions[i * 3] = 90 + Math.cos(ang) * rad;
      starPositions[i * 3 + 1] = 35 + Math.random() * 140;
      starPositions[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xcbd5e1, size: 1.4, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));
    disposables.push(starGeo, starMat);
  }

  // Asynchronous Online Kenney 3D Racing Scenery (zero startup blocking, zero local assets)
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
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(0.1, size.x, size.z);
    const scale = targetWidth / maxDim;
    clone.scale.setScalar(scale);
    clone.position.set(px, py - box.min.y * scale, pz);
    clone.rotation.y = rotY;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = !isSoftwareGl;
        child.receiveShadow = !isSoftwareGl;
      }
    });
    sceneryGroup.add(clone);
  };

  void loadCachedTrackProp('assets/games/models/grandStandCovered.glb').then((src) => {
    if (!src || circuitDisposed) return;
    [8, 32, 110, 190, 275, 330].forEach((idx, n) => {
      const smp = samples[idx % SAMPLE_COUNT];
      const side = n % 2 === 0 ? 1 : -1;
      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      placePropNormalized(
        src,
        24,
        smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 14),
        0,
        smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 14),
        yaw
      );
    });
  });

  void loadCachedTrackProp('assets/games/models/pitsGarage.glb').then((src) => {
    if (!src || circuitDisposed) return;
    [348, 354, 6, 14].forEach((idx) => {
      const smp = samples[idx % SAMPLE_COUNT];
      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + Math.PI / 2;
      placePropNormalized(
        src,
        16,
        smp.point.x - smp.normal.x * (TRACK_BARRIER_HALF_WIDTH + 11),
        0,
        smp.point.z - smp.normal.z * (TRACK_BARRIER_HALF_WIDTH + 11),
        yaw
      );
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

  if (!isSoftwareGl) {
    void loadCachedTrackProp('assets/games/models/lightPostLarge.glb').then((src) => {
      if (!src || circuitDisposed) return;
      for (let i = 20; i < SAMPLE_COUNT; i += 30) {
        const smp = samples[i];
        const side = i % 60 === 20 ? 1 : -1;
        const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        placePropNormalized(
          src,
          7.5,
          smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 3.5),
          0,
          smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 3.5),
          yaw
        );
      }
    });

    void loadCachedTrackProp('assets/games/models/billboard.glb').then((src) => {
      if (!src || circuitDisposed) return;
      [42, 130, 218, 305].forEach((idx, n) => {
        const smp = samples[idx % SAMPLE_COUNT];
        const side = n % 2 === 0 ? 1 : -1;
        const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        placePropNormalized(
          src,
          10.5,
          smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 4.8),
          0,
          smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 4.8),
          yaw
        );
      });
    });

    void loadCachedTrackProp('assets/games/models/bannerTowerRed.glb').then((src) => {
      if (!src || circuitDisposed) return;
      [18, 175].forEach((idx, n) => {
        const smp = samples[idx % SAMPLE_COUNT];
        const side = n === 0 ? 1 : -1;
        const yaw = Math.atan2(smp.tangent.x, smp.tangent.z);
        placePropNormalized(
          src,
          6.2,
          smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 4.2),
          0,
          smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 4.2),
          yaw
        );
      });
    });
  }

  // Animated 3D Rigged Flag Marshals / Crew at Start-Finish & Pit Stand
  const actors: RiggedActorHandle[] = [];
  if (!isSoftwareGl) {
    const marshalRobot = spawnRigged3dActor(sceneryGroup, 'assets/games/models/RobotExpressive.glb', {
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
    const marshalXbot = spawnRigged3dActor(sceneryGroup, 'assets/games/models/Xbot.glb', {
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
    const marshalSoldier = spawnRigged3dActor(sceneryGroup, 'assets/games/models/Soldier.glb', {
      position: [
        startSmp.point.x + startSmp.normal.x * (TRACK_HALF_WIDTH + 5.6) + startSmp.tangent.x * 6.0,
        0,
        startSmp.point.z + startSmp.normal.z * (TRACK_HALF_WIDTH + 5.6) + startSmp.tangent.z * 6.0,
      ],
      rotationY: startYaw - Math.PI * 0.65,
      targetHeight: 2.55,
      defaultClips: ['Idle', 'Walk'],
      castShadow: true,
      primaryHex: '#f59e0b',
      secondaryHex: '#0f172a',
    });
    actors.push(marshalRobot, marshalXbot, marshalSoldier);
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

    // Fallback global scan if far away or unhinted
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
      if (actors[2]) actors[2].playClip(celebrating ? ['Run', 'Walk'] : ['Idle']);
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
      if (sceneryGroup.parent) sceneryGroup.parent.remove(sceneryGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
