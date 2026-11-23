import * as THREE from 'three';
import { TRACK_BARRIER_HALF_WIDTH, TRACK_HALF_WIDTH } from './racingTypes';

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

  // White boundary lines
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(18, 0, 12, 512);
  ctx.fillRect(482, 0, 12, 512);

  // Dashed center line
  ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
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

  // Stadium Twilight Ground Plane
  const groundGeo = new THREE.PlaneGeometry(1400, 1400);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0b151e,
    roughness: 0.96,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(85, -0.08, 10);
  ground.receiveShadow = !isSoftwareGl;
  scene.add(ground);
  disposables.push(groundGeo, groundMat);

  // Procedural Ribbon Asphalt Geometry + Red/White Curbs + Guardrails
  const roadPos: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];

  const curbGeo = new THREE.BoxGeometry(1.15, 0.14, totalLength / SAMPLE_COUNT + 0.35);
  const curbRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.65 });
  const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
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
  asphaltTex.anisotropy = isSoftwareGl ? 2 : 8;
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.78,
    metalness: 0.08,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = !isSoftwareGl;
  scene.add(roadMesh);
  disposables.push(roadGeo, asphaltTex, roadMat);

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
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
