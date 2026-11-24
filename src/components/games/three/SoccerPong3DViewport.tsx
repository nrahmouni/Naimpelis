import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  applyPolyHavenHdri,
  applyResponsiveCameraFov,
  create3dParticleBurstSystem,
  createFootballTexture,
  createResilientWebGlRenderer,
  createThreeFramePacer,
  detectSoftwareGl,
  getMaxSafeAnisotropy,
  initRoomEnvironment,
  loadCachedGltf,
  loadCachedPbrTexture,
  observeHostResize,
} from '../arcade/threeProHelpers';
import { create3dRibbonTrail, createDrsController } from '../arcade/threePostFxHelpers';

export interface SoccerPong3DSnapshot {
  s1: number;
  s2: number;
  p1: { y: number; vy: number; hitT: number; powerT: number };
  p2: { y: number; vy: number; hitT: number; powerT: number };
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    power: boolean;
    lastHit: 1 | 2;
  };
  paused: boolean;
  hitEvent?: { seq: number; x: number; y: number; color: string; power: boolean };
  wallHitEvent?: { seq: number; side: 'top' | 'bottom'; x: number };
  goalEvent?: { seq: number; scorer: 1 | 2 };
}

export interface SoccerPong3DMountOptions {
  getState: () => SoccerPong3DSnapshot;
  onPointerMoveY?: (ny: number) => void;
  onPointerDownField?: (ny: number) => void;
  onCenterTogglePause?: () => void;
}

const PITCH_HALF_X = 6.2;
const PITCH_HALF_Y = 3.3;

function createStripedSoccerFieldTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const ctx = c.getContext('2d');
  if (ctx) {
    // Alternating lush mowed grass stripes (top-to-bottom horizontal bands matching photo)
    const bands = 10;
    const bandH = c.height / bands;
    for (let i = 0; i < bands; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#66b938' : '#56a62c';
      ctx.fillRect(0, i * bandH, c.width, bandH + 1);
    }

    // Subtle organic lawn grain
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 600; i += 1) {
      const gx = (i * 197) % c.width;
      const gy = (i * 313) % c.height;
      ctx.fillRect(gx, gy, 3, 2);
    }

    // White pitch markings
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.72)';
    ctx.lineWidth = 8;

    // Outer touchline inset
    ctx.strokeRect(24, 18, c.width - 48, c.height - 36);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(c.width / 2, 18);
    ctx.lineTo(c.width / 2, c.height - 18);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, 96, 0, Math.PI * 2);
    ctx.stroke();

    // Center spot circle + pause bars inside center circle (matching reference photo)
    ctx.fillStyle = 'rgba(248, 250, 252, 0.35)';
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(102, 185, 56, 0.92)';
    ctx.fillRect(c.width / 2 - 7, c.height / 2 - 9, 5, 18);
    ctx.fillRect(c.width / 2 + 2, c.height / 2 - 9, 5, 18);

    // Goal penalty creases left & right
    ctx.strokeRect(24, c.height / 2 - 120, 76, 240);
    ctx.strokeRect(c.width - 100, c.height / 2 - 120, 76, 240);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createScorePlaqueTexture(score: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    // White square card with subtle warm bevel border
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 244, 244);

    // Bold dark-navy score number
    ctx.fillStyle = '#1e293b';
    ctx.font = '900 162px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(score), 128, 136);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createPaddleGroup(
  mainHex: string,
  sideHex: string
): { group: THREE.Group; bodyMesh: THREE.Mesh; glowMat: THREE.MeshBasicMaterial; disposables: Array<{ dispose: () => void }> } {
  const disposables: Array<{ dispose: () => void }> = [];
  const g = new THREE.Group();

  // Extruded beveled 3D rectangular prism block
  const shape = new THREE.Shape();
  const hw = 0.34;
  const hd = 0.86;
  const r = 0.08;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.56,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);

  const topMat = new THREE.MeshPhysicalMaterial({
    color: mainHex,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    color: sideHex,
    roughness: 0.44,
    metalness: 0.05,
  });

  const bodyMesh = new THREE.Mesh(geo, [topMat, sideMat]);
  bodyMesh.position.y = 0.06;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;

  // Power-kick rim halo beneath paddle
  const haloGeo = new THREE.RingGeometry(0.48, 0.72, 24);
  const glowMat = new THREE.MeshBasicMaterial({
    color: mainHex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(haloGeo, glowMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.025;

  // Ground contact shadow
  const shGeo = new THREE.PlaneGeometry(0.95, 2.05);
  const shMat = new THREE.MeshBasicMaterial({
    color: 0x062409,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shGeo, shMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.06, 0.015, 0.08);

  g.add(shadow, halo, bodyMesh);
  disposables.push(geo, topMat, sideMat, haloGeo, glowMat, shGeo, shMat);
  return { group: g, bodyMesh, glowMat, disposables };
}

export function mountSoccerPong3D(
  host: HTMLElement,
  opts: SoccerPong3DMountOptions
): { dispose: () => void } | null {
  const isSoftwareGl = detectSoftwareGl();
  const renderer = createResilientWebGlRenderer(isSoftwareGl, { exposure: 1.05 });
  if (!renderer) return null;

  renderer.domElement.className = 'w-full h-full block touch-none select-none cursor-grab active:cursor-grabbing';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  host.innerHTML = '';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8dfb6');
  scene.fog = new THREE.Fog('#e8dfb6', 28, 52);

  // Overhead stylized 3D angle matching the reference TV screenshot
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 80);
  camera.position.set(0, 14.6, 4.9);
  camera.lookAt(0, 0, 0.15);

  const roomEnv = initRoomEnvironment(scene, renderer);
  const hdri = applyPolyHavenHdri(
    scene,
    renderer,
    'hdri/puresky_1k.hdr',
    isSoftwareGl,
    { envIntensity: 0.42 }
  );

  scene.add(new THREE.HemisphereLight('#f0f9ff', '#86efac', 0.88));
  const sunKey = new THREE.DirectionalLight('#fffbeb', 1.42);
  sunKey.position.set(5.5, 16, 7.5);
  if (!isSoftwareGl) {
    sunKey.castShadow = true;
    sunKey.shadow.mapSize.set(1024, 1024);
    sunKey.shadow.camera.near = 2;
    sunKey.shadow.camera.far = 36;
    sunKey.shadow.camera.left = -9;
    sunKey.shadow.camera.right = 9;
    sunKey.shadow.camera.top = 7;
    sunKey.shadow.camera.bottom = -7;
    sunKey.shadow.bias = -0.0005;
    sunKey.shadow.normalBias = 0.02;
  }
  scene.add(sunKey);

  const disposables: Array<{ dispose: () => void }> = [];
  const maxAniso = getMaxSafeAnisotropy(renderer, isSoftwareGl);

  // 1. Cream-beige sunlit meadow surround
  const outerGeo = new THREE.PlaneGeometry(42, 28);
  const outerMat = new THREE.MeshStandardMaterial({
    color: '#ede5be',
    roughness: 0.92,
    metalness: 0.0,
  });
  const outerGround = new THREE.Mesh(outerGeo, outerMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.03;
  outerGround.receiveShadow = true;
  scene.add(outerGround);
  disposables.push(outerGeo, outerMat);

  // Outer lush green apron under the stone & wood boundary
  const apronGeo = new THREE.BoxGeometry(PITCH_HALF_X * 2 + 2.4, 0.05, PITCH_HALF_Y * 2 + 1.9);
  const apronMat = new THREE.MeshStandardMaterial({
    color: '#73c63d',
    roughness: 0.86,
    metalness: 0.0,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = -0.025;
  apron.receiveShadow = true;
  scene.add(apron);
  disposables.push(apronGeo, apronMat);

  // 2. Striped Soccer Pitch with white lines + center pause icon
  const pitchTex = createStripedSoccerFieldTexture(maxAniso);
  const pitchGeo = new THREE.PlaneGeometry(PITCH_HALF_X * 2, PITCH_HALF_Y * 2);
  const pitchMat = new THREE.MeshStandardMaterial({
    map: pitchTex,
    roughness: 0.84,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.position.y = 0.005;
  pitchMesh.receiveShadow = true;
  scene.add(pitchMesh);
  disposables.push(pitchTex, pitchGeo, pitchMat);

  // Async Poly Haven grass normal/roughness enhancement (zero-404 safe)
  let disposed = false;
  void loadCachedPbrTexture('pbr/forrest_ground_nor.jpg', {
    repeatX: 4,
    repeatY: 2,
    anisotropy: maxAniso,
  }).then((norTex) => {
    if (disposed || !norTex) {
      norTex?.dispose();
      return;
    }
    pitchMat.normalMap = norTex;
    pitchMat.normalScale.set(0.28, 0.28);
    pitchMat.needsUpdate = true;
    disposables.push(norTex);
  });

  // 3. Top & Bottom Chunky Icy-Stone Wall Blocks (matching photo's beveled pale-blue stone slabs)
  const stoneBlocks: Array<{ mesh: THREE.Mesh; baseY: number; mat: THREE.MeshStandardMaterial; x: number; side: 'top' | 'bottom' }> = [];
  const stoneMatBase = new THREE.MeshStandardMaterial({
    color: '#c9e0f5',
    roughness: 0.56,
    metalness: 0.06,
  });
  disposables.push(stoneMatBase);

  const stoneWidths = [1.85, 2.05, 1.95, 2.1, 1.85, 1.75];
  const createStoneRow = (side: 'top' | 'bottom') => {
    const zBase = side === 'top' ? -PITCH_HALF_Y - 0.34 : PITCH_HALF_Y + 0.34;
    let curX = -PITCH_HALF_X + 0.72;
    for (let i = 0; i < stoneWidths.length; i += 1) {
      const w = stoneWidths[i];
      const geo = new THREE.BoxGeometry(w, 0.58, 0.62);
      const mat = stoneMatBase.clone();
      // Slight subtle tint variance per stone block
      if (i % 2 === 1) mat.color.set('#b8d4ee');
      const m = new THREE.Mesh(geo, mat);
      const jitterZ = ((i % 3) - 1) * 0.04;
      const tiltY = ((i % 2 === 0 ? 1 : -1) * 0.035);
      m.position.set(curX + w * 0.5, 0.28, zBase + jitterZ);
      m.rotation.y = tiltY;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      stoneBlocks.push({ mesh: m, baseY: 0.28, mat, x: m.position.x, side });
      disposables.push(geo, mat);
      curX += w + 0.09;
    }
  };
  createStoneRow('top');
  createStoneRow('bottom');

  // Enhance stone wall blocks with Poly Haven stone_wall normal & roughness
  void Promise.all([
    loadCachedPbrTexture('pbr/stone_wall_nor.jpg', { repeatX: 2, repeatY: 1, anisotropy: maxAniso }),
    loadCachedPbrTexture('pbr/stone_wall_rough.jpg', { repeatX: 2, repeatY: 1, anisotropy: maxAniso }),
  ]).then(([sNor, sRough]) => {
    if (disposed) {
      sNor?.dispose();
      sRough?.dispose();
      return;
    }
    for (let i = 0; i < stoneBlocks.length; i += 1) {
      const mat = stoneBlocks[i].mat;
      if (sNor) {
        mat.normalMap = sNor;
        mat.normalScale.set(0.45, 0.45);
      }
      if (sRough) mat.roughnessMap = sRough;
      mat.needsUpdate = true;
    }
    if (sNor) disposables.push(sNor);
    if (sRough) disposables.push(sRough);
  });

  // 4. Left & Right Wooden Goal Posts, Corner Braces & Live 3D Scoreboard Plaques
  const woodMat = new THREE.MeshStandardMaterial({
    color: '#c27a3c',
    roughness: 0.62,
    metalness: 0.04,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: '#f1f5f9',
    roughness: 0.38,
    metalness: 0.08,
  });
  disposables.push(woodMat, capMat);

  void Promise.all([
    loadCachedPbrTexture('pbr/oak_diff.jpg', { srgb: true, repeatX: 1, repeatY: 2, anisotropy: maxAniso }),
    loadCachedPbrTexture('pbr/oak_nor.jpg', { repeatX: 1, repeatY: 2, anisotropy: maxAniso }),
  ]).then(([oDiff, oNor]) => {
    if (disposed) {
      oDiff?.dispose();
      oNor?.dispose();
      return;
    }
    if (oDiff) woodMat.map = oDiff;
    if (oNor) {
      woodMat.normalMap = oNor;
      woodMat.normalScale.set(0.5, 0.5);
    }
    woodMat.needsUpdate = true;
    if (oDiff) disposables.push(oDiff);
    if (oNor) disposables.push(oNor);
  });

  let scoreTex1 = createScorePlaqueTexture(0);
  let scoreTex2 = createScorePlaqueTexture(0);
  let lastScore1 = 0;
  let lastScore2 = 0;
  const plaqueMat1 = new THREE.MeshStandardMaterial({ map: scoreTex1, roughness: 0.45 });
  const plaqueMat2 = new THREE.MeshStandardMaterial({ map: scoreTex2, roughness: 0.45 });
  disposables.push(scoreTex1, scoreTex2, plaqueMat1, plaqueMat2);

  const buildWoodenGoalSide = (side: 'left' | 'right', cardMat: THREE.MeshStandardMaterial) => {
    const dir = side === 'left' ? -1 : 1;
    const gx = dir * (PITCH_HALF_X + 0.36);

    // Main vertical wooden goal bar
    const postGeo = new THREE.CylinderGeometry(0.24, 0.24, PITCH_HALF_Y * 2 + 0.75, 14);
    const postMesh = new THREE.Mesh(postGeo, woodMat);
    postMesh.rotation.x = Math.PI / 2;
    postMesh.position.set(gx, 0.28, 0);
    postMesh.castShadow = true;
    postMesh.receiveShadow = true;
    scene.add(postMesh);
    disposables.push(postGeo);

    // Top & Bottom rounded corner posts + white caps + diagonal wooden corner braces
    const cornerPostGeo = new THREE.CylinderGeometry(0.32, 0.34, 0.92, 16);
    const capGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16);
    const braceGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.38, 12);
    disposables.push(cornerPostGeo, capGeo, braceGeo);

    for (const zSign of [-1, 1]) {
      const cz = zSign * (PITCH_HALF_Y + 0.28);
      const cp = new THREE.Mesh(cornerPostGeo, woodMat);
      cp.position.set(gx, 0.46, cz);
      cp.castShadow = true;
      scene.add(cp);

      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(gx, 0.94, cz);
      scene.add(cap);

      // Diagonal corner timber brace linking goal frame into stone perimeter
      const brace = new THREE.Mesh(braceGeo, woodMat);
      brace.position.set(gx - dir * 0.48, 0.46, cz - zSign * 0.26);
      brace.rotation.z = Math.PI / 2;
      brace.rotation.y = dir * zSign * 0.56;
      brace.castShadow = true;
      scene.add(brace);
    }

    // Wooden scoreboard plaque frame behind/over center of goal bar
    const boardGeo = new THREE.BoxGeometry(1.18, 0.14, 1.18);
    const board = new THREE.Mesh(boardGeo, woodMat);
    board.position.set(gx + dir * 0.08, 0.58, 0);
    board.castShadow = true;
    scene.add(board);

    const cardGeo = new THREE.PlaneGeometry(0.88, 0.88);
    const card = new THREE.Mesh(cardGeo, cardMat);
    card.rotation.x = -Math.PI / 2;
    card.position.set(gx + dir * 0.08, 0.66, 0);
    scene.add(card);

    disposables.push(boardGeo, cardGeo);
  };

  buildWoodenGoalSide('left', plaqueMat1);
  buildWoodenGoalSide('right', plaqueMat2);

  // 5. Outer Meadow Daisies (procedural flowers + async Kenney nature flower GLBs)
  const daisyFlowerCoords: Array<[number, number]> = [
    [-7.1, -4.15],
    [-2.8, -4.2],
    [1.6, -4.18],
    [6.6, -4.15],
    [-6.9, 4.18],
    [-1.4, 4.22],
    [3.8, 4.16],
    [7.0, 4.12],
  ];
  const flowerCenterGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8);
  const flowerCenterMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.6 });
  const petalGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.025, 7);
  const petalMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  disposables.push(flowerCenterGeo, flowerCenterMat, petalGeo, petalMat);

  for (let i = 0; i < daisyFlowerCoords.length; i += 1) {
    const [fx, fz] = daisyFlowerCoords[i];
    const p = new THREE.Mesh(petalGeo, petalMat);
    p.position.set(fx, 0.015, fz);
    const cMesh = new THREE.Mesh(flowerCenterGeo, flowerCenterMat);
    cMesh.position.set(fx, 0.032, fz);
    scene.add(p, cMesh);
  }

  // Load Kenney 3D nature flowers & corner stone props asynchronously for extra depth
  void Promise.all([
    loadCachedGltf('models/soccer_pong/flower_yellowA.glb'),
    loadCachedGltf('models/soccer_pong/flower_purpleA.glb'),
    loadCachedGltf('models/soccer_pong/cliff_corner_stone.glb'),
  ]).then(([flY, flP, cornerStone]) => {
    if (disposed) return;
    const placeFlower = (gltf: Awaited<ReturnType<typeof loadCachedGltf>>, x: number, z: number, sc: number) => {
      if (!gltf?.scene) return;
      const m = gltf.scene.clone(true);
      m.position.set(x, -0.02, z);
      m.scale.setScalar(sc);
      scene.add(m);
    };
    placeFlower(flY, -7.45, -2.5, 0.75);
    placeFlower(flP, 7.45, 2.4, 0.75);
    placeFlower(flY, 7.45, -2.2, 0.7);
    placeFlower(flP, -7.45, 2.6, 0.7);
    if (cornerStone?.scene) {
      for (const [cx, cz, ry] of [
        [-PITCH_HALF_X - 1.15, -PITCH_HALF_Y - 1.05, 0],
        [PITCH_HALF_X + 1.15, -PITCH_HALF_Y - 1.05, -Math.PI / 2],
        [-PITCH_HALF_X - 1.15, PITCH_HALF_Y + 1.05, Math.PI / 2],
        [PITCH_HALF_X + 1.15, PITCH_HALF_Y + 1.05, Math.PI],
      ] as Array<[number, number, number]>) {
        const rock = cornerStone.scene.clone(true);
        rock.position.set(cx, -0.04, cz);
        rock.rotation.y = ry;
        rock.scale.setScalar(0.45);
        rock.traverse((ch) => {
          const mesh = ch as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.material = stoneMatBase;
            mesh.castShadow = true;
          }
        });
        scene.add(rock);
      }
    }
  });

  // 6. Player 1 (Cobalt Blue) & Player 2 (Crimson Red) 3D Paddles
  const pad1 = createPaddleGroup('#1d4ed8', '#1e3a8a');
  pad1.group.position.set(-PITCH_HALF_X + 0.76, 0, 0);
  scene.add(pad1.group);
  disposables.push(...pad1.disposables);

  const pad2 = createPaddleGroup('#dc2626', '#991b1b');
  pad2.group.position.set(PITCH_HALF_X - 0.76, 0, 0);
  scene.add(pad2.group);
  disposables.push(...pad2.disposables);

  // 7. Classic Black-and-White 3D Soccer Ball + Ground Shadow + Trail + Particle Bursts
  const ballTex = createFootballTexture(maxAniso);
  const ballGeo = new THREE.SphereGeometry(0.32, 24, 18);
  const ballMat = new THREE.MeshPhysicalMaterial({
    map: ballTex,
    roughness: 0.34,
    metalness: 0.04,
    clearcoat: 0.25,
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.position.set(0, 0.32, 0);
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  const ballShadowGeo = new THREE.CircleGeometry(0.34, 18);
  const ballShadowMat = new THREE.MeshBasicMaterial({
    color: 0x052e16,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.016;
  scene.add(ballShadow);
  disposables.push(ballTex, ballGeo, ballMat, ballShadowGeo, ballShadowMat);

  const particles = create3dParticleBurstSystem(scene, isSoftwareGl ? 36 : 80);
  const trail = create3dRibbonTrail(isSoftwareGl ? 10 : 18, '#facc15', 0.28);
  scene.add(trail.mesh);
  disposables.push(trail);

  // Direct vertical drag / click mapping on the 3D field
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  let dragging = false;

  const mapClientToNormalizedY = (clientX: number, clientY: number): { nx: number; ny: number } | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
      return {
        nx: THREE.MathUtils.clamp(hitPoint.x / PITCH_HALF_X, -1, 1),
        ny: THREE.MathUtils.clamp(hitPoint.z / (PITCH_HALF_Y - 0.86), -1, 1),
      };
    }
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    const pt = mapClientToNormalizedY(e.clientX, e.clientY);
    if (!pt) return;
    if (Math.abs(pt.nx) < 0.14 && Math.abs(pt.ny) < 0.24 && opts.onCenterTogglePause) {
      opts.onCenterTogglePause();
      return;
    }
    opts.onPointerDownField?.(pt.ny);
    opts.onPointerMoveY?.(pt.ny);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging && e.pointerType !== 'mouse') return;
    const pt = mapClientToNormalizedY(e.clientX, e.clientY);
    if (pt) opts.onPointerMoveY?.(pt.ny);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  const drs = createDrsController(renderer, { isSoftwareGl });
  const cleanupResize = observeHostResize(host, (w, h) => {
    camera.aspect = w / h;
    applyResponsiveCameraFov(camera, 36, w, h, 46);
    renderer.setSize(w, h, false);
  });

  const pacer = createThreeFramePacer(renderer, isSoftwareGl);
  let lastTs = performance.now();
  let lastHitSeq = 0;
  let lastWallHitSeq = 0;
  let lastGoalSeq = 0;
  const wallBump = new Float32Array(stoneBlocks.length);

  const tick = () => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;
    drs.sample(dt);

    const st = opts.getState();

    // Update mounted 3D scoreboards ONLY when score changes
    if (st.s1 !== lastScore1) {
      lastScore1 = st.s1;
      const oldTex = scoreTex1;
      scoreTex1 = createScorePlaqueTexture(st.s1);
      plaqueMat1.map = scoreTex1;
      plaqueMat1.needsUpdate = true;
      oldTex.dispose();
    }
    if (st.s2 !== lastScore2) {
      lastScore2 = st.s2;
      const oldTex = scoreTex2;
      scoreTex2 = createScorePlaqueTexture(st.s2);
      plaqueMat2.map = scoreTex2;
      plaqueMat2.needsUpdate = true;
      oldTex.dispose();
    }

    // Smooth paddle positioning & impact squash/stretch
    const maxZ = PITCH_HALF_Y - 0.86;
    pad1.group.position.z = THREE.MathUtils.damp(pad1.group.position.z, st.p1.y * maxZ, 24, dt);
    pad2.group.position.z = THREE.MathUtils.damp(pad2.group.position.z, st.p2.y * maxZ, 24, dt);

    const hitScale1 = st.p1.hitT > 0 ? 1 + st.p1.hitT * 0.42 : 1;
    pad1.bodyMesh.scale.set(hitScale1, 1 + st.p1.hitT * 0.25, 1 / Math.sqrt(hitScale1));
    pad1.glowMat.opacity = st.p1.powerT > 0 ? Math.min(0.85, st.p1.powerT * 2.2) : 0;

    const hitScale2 = st.p2.hitT > 0 ? 1 + st.p2.hitT * 0.42 : 1;
    pad2.bodyMesh.scale.set(hitScale2, 1 + st.p2.hitT * 0.25, 1 / Math.sqrt(hitScale2));
    pad2.glowMat.opacity = st.p2.powerT > 0 ? Math.min(0.85, st.p2.powerT * 2.2) : 0;

    // Ball position & natural spin
    const bx = st.ball.x * PITCH_HALF_X;
    const bz = st.ball.y * PITCH_HALF_Y;
    ballMesh.position.set(bx, 0.32 + (st.ball.power ? Math.abs(Math.sin(now * 0.02)) * 0.08 : 0), bz);
    ballMesh.rotation.z -= st.ball.vx * dt * 2.8;
    ballMesh.rotation.x += st.ball.vy * dt * 2.8;
    ballShadow.position.set(bx + 0.06, 0.016, bz + 0.08);

    const showTrail = st.ball.power || Math.hypot(st.ball.vx, st.ball.vy) > 1.32;
    trail.push(bx, 0.28, bz, camera.position, showTrail ? '#facc15' : '#38bdf8');
    trail.setVisible(showTrail);

    if (st.hitEvent && st.hitEvent.seq !== lastHitSeq) {
      lastHitSeq = st.hitEvent.seq;
      const pColHex = st.hitEvent.color === '#ef4444' ? 0xef4444 : 0x3b82f6;
      particles.emit(
        st.hitEvent.x * PITCH_HALF_X,
        0.36,
        st.hitEvent.y * PITCH_HALF_Y,
        pColHex,
        st.hitEvent.power ? 24 : 12,
        4.2
      );
    }
    if (st.wallHitEvent && st.wallHitEvent.seq !== lastWallHitSeq) {
      lastWallHitSeq = st.wallHitEvent.seq;
      const wx = st.wallHitEvent.x * PITCH_HALF_X;
      for (let i = 0; i < stoneBlocks.length; i += 1) {
        if (stoneBlocks[i].side === st.wallHitEvent.side && Math.abs(stoneBlocks[i].x - wx) < 1.5) {
          wallBump[i] = 1;
        }
      }
      particles.emit(
        wx,
        0.34,
        st.wallHitEvent.side === 'top' ? -PITCH_HALF_Y : PITCH_HALF_Y,
        0xbae6fd,
        8,
        3.2
      );
    }
    if (st.goalEvent && st.goalEvent.seq !== lastGoalSeq) {
      lastGoalSeq = st.goalEvent.seq;
      const gx = st.goalEvent.scorer === 1 ? PITCH_HALF_X : -PITCH_HALF_X;
      const gCol = st.goalEvent.scorer === 1 ? 0x3b82f6 : 0xef4444;
      particles.emit(gx, 0.55, 0, gCol, 34, 5.4);
    }

    for (let i = 0; i < stoneBlocks.length; i += 1) {
      if (wallBump[i] > 0.01) {
        wallBump[i] = Math.max(0, wallBump[i] - dt * 4.5);
        stoneBlocks[i].mesh.position.y = stoneBlocks[i].baseY + wallBump[i] * 0.14;
      }
    }

    particles.update(dt);
    renderer.render(scene, camera);
    pacer.schedule(tick);
  };

  pacer.schedule(tick);

  return {
    dispose: () => {
      disposed = true;
      pacer.cancel();
      cleanupResize();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      particles.dispose();
      trail.dispose();
      hdri.dispose();
      roomEnv.dispose();
      scoreTex1.dispose();
      scoreTex2.dispose();
      for (let i = 0; i < disposables.length; i += 1) {
        try {
          disposables[i].dispose();
        } catch {
          // ignore
        }
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    },
  };
}

export const SoccerPong3DViewport: React.FC<{
  simRef: React.MutableRefObject<SoccerPong3DSnapshot>;
  onPointerMoveY: (ny: number) => void;
  onPointerDownField: (ny: number) => void;
  onCenterTogglePause: () => void;
}> = ({ simRef, onPointerMoveY, onPointerDownField, onCenterTogglePause }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef({ onPointerMoveY, onPointerDownField, onCenterTogglePause });
  cbRef.current = { onPointerMoveY, onPointerDownField, onCenterTogglePause };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountSoccerPong3D(host, {
      getState: () => simRef.current,
      onPointerMoveY: (ny) => cbRef.current.onPointerMoveY(ny),
      onPointerDownField: (ny) => cbRef.current.onPointerDownField(ny),
      onCenterTogglePause: () => cbRef.current.onCenterTogglePause(),
    });
    return () => handle?.dispose();
  }, [simRef]);

  return <div ref={hostRef} className="w-full h-full relative" />;
};
