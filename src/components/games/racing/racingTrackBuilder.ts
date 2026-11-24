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

  ctx.fillStyle = '#181d29';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4200; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 18 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 10})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
  grooveGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
  grooveGrad.addColorStop(0.28, 'rgba(5,7,12,0.34)');
  grooveGrad.addColorStop(0.5, 'rgba(5,7,12,0.12)');
  grooveGrad.addColorStop(0.72, 'rgba(5,7,12,0.34)');
  grooveGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grooveGrad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(16, 0, 12, 512);
  ctx.fillRect(484, 0, 12, 512);

  ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
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

function createCityPavementTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#182132';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle city grid avenues & plaza sidewalks
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
  for (let i = 0; i < 2400; i += 1) {
    const shade = 22 + ((i * 19) % 20);
    ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 14})`;
    ctx.fillRect((i * 73) % 512, (i * 137) % 512, 2, 2);
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

  // Floor mullions
  ctx.fillStyle = 'rgba(15, 23, 42, 0.48)';
  for (let y = 0; y < 512; y += 24) {
    ctx.fillRect(0, y, 256, 5);
  }

  // Lit architectural windows
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

  // Ground-floor illuminated retail storefront band
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

export function buildGpCircuitScene(scene: THREE.Scene, isSoftwareGl: boolean): BuiltCircuit {
  const disposables: Array<{ dispose: () => void }> = [];
  const tvConstrained = isConstrainedTvDevice();
  const castPropShadow = !isSoftwareGl && !tvConstrained;
  let circuitDisposed = false;
  const sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);

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

  function isClearOfTrack(wx: number, wz: number, extraMargin: number): boolean {
    const minDistSq = (TRACK_BARRIER_HALF_WIDTH + extraMargin) * (TRACK_BARRIER_HALF_WIDTH + extraMargin);
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const p = samples[i].point;
      const dx = wx - p.x;
      const dz = wz - p.z;
      if (dx * dx + dz * dz < minDistSq) return false;
    }
    return true;
  }

  // City Urban Ground Plane (asphalt plaza grid textured on Frame 0)
  const cityPaveTex = createCityPavementTexture();
  cityPaveTex.anisotropy = isSoftwareGl ? 1 : 4;
  const groundGeo = new THREE.PlaneGeometry(1400, 1400);
  const groundMat = new THREE.MeshStandardMaterial({
    map: cityPaveTex,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.08,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(85, -0.08, 10);
  ground.receiveShadow = !isSoftwareGl;
  scene.add(ground);
  disposables.push(groundGeo, groundMat, cityPaveTex);

  // Inner city central park / stadium island pocket
  const parkGeo = new THREE.CircleGeometry(46, 28);
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x164e2e, roughness: 0.9 });
  const parkMesh = new THREE.Mesh(parkGeo, parkMat);
  parkMesh.rotation.x = -Math.PI / 2;
  parkMesh.position.set(95, -0.055, -108);
  parkMesh.receiveShadow = !isSoftwareGl;
  scene.add(parkMesh);
  disposables.push(parkGeo, parkMat);

  // Urban Raised Concrete Sidewalk Verges flanking both edges of the street circuit
  const sidewalkGeo = new THREE.BoxGeometry(3.2, 0.16, totalLength / SAMPLE_COUNT + 0.5);
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, metalness: 0.1 });
  const sidewalkInst = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, SAMPLE_COUNT * 2);
  disposables.push(sidewalkGeo, sidewalkMat);

  // Procedural Ribbon Asphalt Geometry + Red/White Curbs + Guardrails
  const roadPos: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];

  const curbGeo = new THREE.BoxGeometry(1.15, 0.14, totalLength / SAMPLE_COUNT + 0.35);
  const curbRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.78 });
  const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
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
  scene.add(sidewalkInst);

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

  if (!isSoftwareGl && !tvConstrained) {
    void loadCachedPbrTexture('assets/games/pbr/concrete_worn_diff.jpg', {
      srgb: true,
      repeatX: 28,
      repeatY: 28,
      anisotropy: 4,
    }).then((tex) => {
      if (!tex || circuitDisposed) return;
      groundMat.map = tex;
      groundMat.color.setHex(0x3a475c);
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

  // Wet Reflective Asphalt Puddles at apex zones
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

  // Persistent Tire Skidmark Pool
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

  const redCurbs = new THREE.InstancedMesh(curbGeo, curbRedMat, redMatrices.length);
  redMatrices.forEach((m, idx) => redCurbs.setMatrixAt(idx, m));
  const whiteCurbs = new THREE.InstancedMesh(curbGeo, curbWhiteMat, whiteMatrices.length);
  whiteMatrices.forEach((m, idx) => whiteCurbs.setMatrixAt(idx, m));
  scene.add(redCurbs, whiteCurbs);

  // Outer Illuminated Street Barrier Walls
  const postStep = 4;
  const postCount = Math.floor(SAMPLE_COUNT / postStep) * 2;
  const postGeo = new THREE.BoxGeometry(0.48, 1.0, 2.4);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
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
        0.5,
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

  // Start / Finish Checkered Strip & Lit Steel Gantry
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

  // Urban Skyscraper & Mid-Rise District (Rendered immediately on Frame 0 so city looks full!)
  const facadeTexA = createSkyscraperFacadeTexture('#38bdf8', '#141e30');
  const facadeTexB = createSkyscraperFacadeTexture('#f59e0b', '#1b2234');
  const facadeTexC = createSkyscraperFacadeTexture('#a855f7', '#17192d');
  const bldgMats = [
    new THREE.MeshStandardMaterial({ map: facadeTexA, roughness: 0.45, metalness: 0.4, emissive: 0x0b1628, emissiveIntensity: 0.45 }),
    new THREE.MeshStandardMaterial({ map: facadeTexB, roughness: 0.5, metalness: 0.32, emissive: 0x18141c, emissiveIntensity: 0.4 }),
    new THREE.MeshStandardMaterial({ map: facadeTexC, roughness: 0.42, metalness: 0.48, emissive: 0x160f28, emissiveIntensity: 0.45 }),
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72, metalness: 0.5 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
  const roofBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(facadeTexA, facadeTexB, facadeTexC, ...bldgMats, roofMat, beaconMat, roofBoxGeo);

  const cityLots: Array<{ x: number; z: number; yaw: number; w: number; d: number; h: number; variant: number }> = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 7) {
    const smp = samples[i];
    const yaw = Math.atan2(smp.tangent.x, smp.tangent.z);
    const sides = i % 14 === 0 ? [1, -1] : [i % 2 === 0 ? 1 : -1];
    for (const side of sides) {
      const distOut = TRACK_BARRIER_HALF_WIDTH + 16 + ((i * 11) % 24);
      const bx = smp.point.x + smp.normal.x * side * distOut;
      const bz = smp.point.z + smp.normal.z * side * distOut;
      const w = 11 + ((i * 7) % 10);
      const d = 11 + ((i * 13) % 10);
      const halfSpan = Math.max(w, d) * 0.65;
      if (!isClearOfTrack(bx, bz, halfSpan + 4.5)) continue;
      const h = 16 + ((i * 19 + (side > 0 ? 7 : 3)) % 44);
      cityLots.push({ x: bx, z: bz, yaw, w, d, h, variant: (i + (side > 0 ? 1 : 2)) % 3 });
    }
  }
  // Outer city skyline towers for horizon density
  const outerRingAnchors = [
    [-65, -140, 68], [-70, 0, 56], [-62, 130, 64], [110, -275, 76], [235, -245, 72],
    [285, -90, 66], [275, 85, 70], [285, 225, 62], [115, 305, 74], [-35, 255, 58],
    [95, -95, 54], [95, -125, 42],
  ];
  outerRingAnchors.forEach(([ox, oz, oh], idx) => {
    if (isClearOfTrack(ox, oz, 14)) {
      cityLots.push({ x: ox, z: oz, yaw: idx * 0.4, w: 18, d: 18, h: oh, variant: idx % 3 });
    }
  });

  cityLots.forEach((lot, idx) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(lot.x, 0, lot.z);
    bGroup.rotation.y = lot.yaw;
    const baseMesh = new THREE.Mesh(roofBoxGeo, bldgMats[lot.variant]);
    baseMesh.scale.set(lot.w, lot.h, lot.d);
    baseMesh.position.y = lot.h * 0.5;
    baseMesh.castShadow = castPropShadow;
    baseMesh.receiveShadow = !isSoftwareGl;
    bGroup.add(baseMesh);

    if (lot.h > 32) {
      const crown = new THREE.Mesh(roofBoxGeo, bldgMats[(lot.variant + 1) % 3]);
      crown.scale.set(lot.w * 0.68, lot.h * 0.28, lot.d * 0.68);
      crown.position.y = lot.h + lot.h * 0.14;
      const spire = new THREE.Mesh(roofBoxGeo, roofMat);
      spire.scale.set(0.45, 8, 0.45);
      spire.position.y = lot.h * 1.28 + 4;
      const beacon = new THREE.Mesh(roofBoxGeo, beaconMat);
      beacon.scale.set(0.85, 0.85, 0.85);
      beacon.position.y = lot.h * 1.28 + 8.3;
      bGroup.add(crown, spire, beacon);
    } else if (idx % 2 === 0) {
      const cap = new THREE.Mesh(roofBoxGeo, roofMat);
      cap.scale.set(lot.w * 0.52, 2.2, lot.d * 0.52);
      cap.position.y = lot.h + 1.1;
      bGroup.add(cap);
    }
    sceneryGroup.add(bGroup);
  });

  // Illuminated Streetlamps flanking the circuit every 18 samples
  const towerPoleGeo = new THREE.CylinderGeometry(0.24, 0.34, 12.5, 8);
  const towerArmGeo = new THREE.BoxGeometry(0.24, 0.24, 2.8);
  const towerHeadGeo = new THREE.BoxGeometry(1.4, 0.32, 0.7);
  const towerHeadMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  for (let i = 10; i < SAMPLE_COUNT; i += 20) {
    const smp = samples[i];
    const side = i % 40 === 10 ? 1 : -1;
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
    sceneryGroup.add(lamp);
  }
  disposables.push(towerPoleGeo, towerArmGeo, towerHeadGeo, towerHeadMat);

  // Glowing Cyan Nitro Boost Pads
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

  // Urban Avenue Trees & Tire Barriers
  const treeCount = 44;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.8, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1b, roughness: 0.9 });
  const crownGeo = new THREE.SphereGeometry(2.1, 8, 7);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const tDummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i += 1) {
    const smp = samples[(i * 8 + 2) % SAMPLE_COUNT];
    const side = i % 2 === 0 ? 1 : -1;
    const tx = smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 6.5);
    const tz = smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 6.5);
    const scl = 0.8 + ((i * 5) % 5) * 0.12;
    tDummy.position.set(tx, 1.4 * scl, tz);
    tDummy.scale.setScalar(scl);
    tDummy.updateMatrix();
    trunks.setMatrixAt(i, tDummy.matrix);
    tDummy.position.set(tx, 3.8 * scl, tz);
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

  if (!isSoftwareGl) {
    const starCount = 380;
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
    scene.add(new THREE.Points(starGeo, starMat));
    disposables.push(starGeo, starMat);
  }

  // Asynchronous Verified CC0 3D City Architecture & Racing Kits
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
    sceneryGroup.add(clone);
  };

  // Load verified Kenney City Commercial skyscrapers & buildings into open urban lots
  const citySkyscraperAssets = [
    'assets/games/models/city/building-skyscraper-a.glb',
    'assets/games/models/city/building-skyscraper-b.glb',
    'assets/games/models/city/building-skyscraper-c.glb',
    'assets/games/models/city/building-skyscraper-d.glb',
    'assets/games/models/city/building-skyscraper-e.glb',
  ];
  const cityCommercialAssets = [
    'assets/games/models/city/building-a.glb',
    'assets/games/models/city/building-b.glb',
    'assets/games/models/city/building-c.glb',
    'assets/games/models/city/building-d.glb',
    'assets/games/models/city-builder/building-small-a.glb',
    'assets/games/models/city-builder/building-small-c.glb',
    'assets/games/models/city-builder/building-garage.glb',
  ];

  citySkyscraperAssets.forEach((asset, assetIdx) => {
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

  cityCommercialAssets.forEach((asset, assetIdx) => {
    void loadCachedTrackProp(asset).then((src) => {
      if (!src || circuitDisposed) return;
      for (let i = 10 + assetIdx * 17; i < SAMPLE_COUNT; i += 84) {
        const smp = samples[i % SAMPLE_COUNT];
        const side = assetIdx % 2 === 0 ? -1 : 1;
        const bx = smp.point.x + smp.normal.x * side * (TRACK_BARRIER_HALF_WIDTH + 13.5);
        const bz = smp.point.z + smp.normal.z * side * (TRACK_BARRIER_HALF_WIDTH + 13.5);
        if (!isClearOfTrack(bx, bz, 7.5)) continue;
        const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        placePropNormalized(src, 12, bx, 0, bz, yaw);
      }
    });
  });

  void loadCachedTrackProp('assets/games/models/city-builder/pavement-fountain.glb').then((src) => {
    if (!src || circuitDisposed) return;
    if (isClearOfTrack(95, -108, 10)) {
      placePropNormalized(src, 18, 95, 0, -108, 0);
    }
  });

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

  void loadCachedTrackProp('assets/games/models/pitsGarage.glb').then((src) => {
    if (!src || circuitDisposed) return;
    [350, 6].forEach((idx) => {
      const smp = samples[idx % SAMPLE_COUNT];
      const bx = smp.point.x - smp.normal.x * (TRACK_BARRIER_HALF_WIDTH + 10.5);
      const bz = smp.point.z - smp.normal.z * (TRACK_BARRIER_HALF_WIDTH + 10.5);
      if (!isClearOfTrack(bx, bz, 7.5)) return;
      const yaw = Math.atan2(smp.tangent.x, smp.tangent.z) + Math.PI / 2;
      placePropNormalized(src, 15, bx, 0, bz, yaw);
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

  if (!isSoftwareGl && !tvConstrained) {
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
  }

  // Animated 3D Crew at Start-Finish
  const actors: RiggedActorHandle[] = [];
  if (!isSoftwareGl && !tvConstrained) {
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
      if (sceneryGroup.parent) sceneryGroup.parent.remove(sceneryGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
