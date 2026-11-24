import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  applyPolyHavenHdri,
  applyResponsiveCameraFov,
  create3dParticleBurstSystem,
  createResilientWebGlRenderer,
  createSkyDomeTexture,
  createThreeFramePacer,
  createWoodPlankTexture,
  detectSoftwareGl,
  getMaxSafeAnisotropy,
  initRoomEnvironment,
  loadCachedPbrTexture,
} from '../arcade/threeProHelpers';
import {
  applyFresnelRimShader,
  createDrsController,
  createProPostComposer,
} from '../arcade/threePostFxHelpers';

export interface Labyrinth3DSnapshot {
  level: number;
  cols: number;
  rows: number;
  grid: string[][];
  tiltX: number;
  tiltZ: number;
  twoHumans: boolean;
  ball1: { x: number; y: number; vx: number; vy: number };
  ball2: { x: number; y: number; vx: number; vy: number } | null;
  collectSeq: number;
  fallSeq: number;
  winSeq: number;
}

interface Labyrinth3DViewportProps {
  simRef: React.MutableRefObject<Labyrinth3DSnapshot>;
}

const CELL_SIZE = 0.82;

export const Labyrinth3DViewport: React.FC<Labyrinth3DViewportProps> = ({ simRef }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = createResilientWebGlRenderer(isSoftwareGl, { exposure: 1.08 });
    if (!renderer) return;

    renderer.domElement.className = 'w-full h-full block touch-none';
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const labSkyTex = createSkyDomeTexture({
      topHex: '#070b1a',
      midHex: '#111b36',
      horizonHex: '#1e2f56',
      sunGlowHex: 'rgba(56, 189, 248, 0.28)',
    });
    const scene = new THREE.Scene();
    scene.background = labSkyTex;
    scene.fog = new THREE.FogExp2('#090e1f', 0.02);

    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
    camera.position.set(0, 11.4, 9.6);
    camera.lookAt(0, -0.2, 0.25);

    const roomEnv = initRoomEnvironment(scene, renderer);
    const hdri = applyPolyHavenHdri(
      scene,
      renderer,
      'assets/games/hdri/studio_small_09_1k.hdr',
      isSoftwareGl,
      { envIntensity: 0.55 }
    );

    scene.add(new THREE.HemisphereLight('#e0f2fe', '#1e1b4b', 0.56));
    const keyLight = new THREE.DirectionalLight('#fffbeb', 1.48);
    keyLight.position.set(7, 15, 9);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 36;
      keyLight.shadow.camera.left = -10;
      keyLight.shadow.camera.right = 10;
      keyLight.shadow.camera.top = 10;
      keyLight.shadow.camera.bottom = -10;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.58);
    rimLight.position.set(-9, 6, -8);
    scene.add(rimLight);

    const disposables: Array<{ dispose: () => void }> = [labSkyTex];

    // Studio table surface underneath the gimbaled wooden board
    const deskGeo = new THREE.PlaneGeometry(42, 42);
    const deskMat = new THREE.MeshStandardMaterial({ color: '#050814', roughness: 0.78 });
    const deskMesh = new THREE.Mesh(deskGeo, deskMat);
    deskMesh.rotation.x = -Math.PI / 2;
    deskMesh.position.y = -1.6;
    scene.add(deskMesh);
    disposables.push(deskGeo, deskMat);

    // Tiltable Wooden & Cyber Gimbal Board Group
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const cols = simRef.current.cols || 19;
    const rows = simRef.current.rows || 11;
    const boardW = cols * CELL_SIZE;
    const boardD = rows * CELL_SIZE;

    const maxAniso = getMaxSafeAnisotropy(renderer, isSoftwareGl);
    const boardWoodTex = createWoodPlankTexture('#cb8e51', '#b4763c', maxAniso);
    boardWoodTex.repeat.set(2, 2);
    disposables.push(boardWoodTex);

    const floorGeo = new THREE.BoxGeometry(boardW + 0.55, 0.24, boardD + 0.55);
    const floorMat = new THREE.MeshPhysicalMaterial({
      map: boardWoodTex,
      color: '#f7e4cd',
      roughness: 0.32,
      metalness: 0.05,
      clearcoat: 0.58,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.12;
    floorMesh.receiveShadow = true;
    boardGroup.add(floorMesh);
    disposables.push(floorGeo, floorMat);

    void loadCachedPbrTexture('assets/games/arenas/labyrinth_board.jpg', {
      srgb: true,
      repeatX: 2,
      repeatY: 2,
    }).then((tex) => {
      if (tex) {
        floorMat.map = tex;
        floorMat.color.set('#f5dec3');
        floorMat.needsUpdate = true;
      }
    });
    void loadCachedPbrTexture('assets/games/pbr/oak_rough.jpg', {
      srgb: false,
      repeatX: 2,
      repeatY: 2,
    }).then((tex) => {
      if (tex) {
        floorMat.roughnessMap = tex;
        floorMat.needsUpdate = true;
      }
    });

    // Outer Mahogany Tray Trim
    const trimMat = new THREE.MeshStandardMaterial({ color: '#3b1d0e', roughness: 0.42, metalness: 0.1 });
    const trimH = 0.52;
    const trimT = 0.28;
    const topTrimGeo = new THREE.BoxGeometry(boardW + trimT * 2 + 0.4, trimH, trimT);
    const sideTrimGeo = new THREE.BoxGeometry(trimT, trimH, boardD + 0.4);
    disposables.push(trimMat, topTrimGeo, sideTrimGeo);

    [-1, 1].forEach((s) => {
      const tb = new THREE.Mesh(topTrimGeo, trimMat);
      tb.position.set(0, 0.12, s * (boardD * 0.5 + 0.24));
      tb.castShadow = !isSoftwareGl;
      const sb = new THREE.Mesh(sideTrimGeo, trimMat);
      sb.position.set(s * (boardW * 0.5 + 0.24), 0.12, 0);
      sb.castShadow = !isSoftwareGl;
      boardGroup.add(tb, sb);
    });

    // Brass Corner Bracket Accents
    const brassGeo = new THREE.BoxGeometry(0.45, 0.58, 0.45);
    const brassMat = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.85, roughness: 0.22 });
    disposables.push(brassGeo, brassMat);
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        const cap = new THREE.Mesh(brassGeo, brassMat);
        cap.position.set(sx * (boardW * 0.5 + 0.24), 0.14, sz * (boardD * 0.5 + 0.24));
        boardGroup.add(cap);
      });
    });

    // Shared Geometries & Materials for Dynamic Maze Cells
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE * 0.94, 0.52, CELL_SIZE * 0.94);
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.28,
    });
    const wallCapGeo = new THREE.BoxGeometry(CELL_SIZE * 0.86, 0.06, CELL_SIZE * 0.86);
    const wallCapMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.42,
      roughness: 0.3,
    });

    const holeGeo = new THREE.CylinderGeometry(CELL_SIZE * 0.34, CELL_SIZE * 0.34, 0.04, 18);
    const holeMat = new THREE.MeshBasicMaterial({ color: '#020617' });
    const holeRimGeo = new THREE.TorusGeometry(CELL_SIZE * 0.35, 0.035, 8, 22);
    const holeRimMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#dc2626',
      emissiveIntensity: 1.1,
    });

    const starGeo = new THREE.OctahedronGeometry(0.22, 0);
    const starMat = new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#eab308',
      emissiveIntensity: 1.4,
      metalness: 0.65,
      roughness: 0.18,
    });

    const exitGeo = new THREE.CylinderGeometry(CELL_SIZE * 0.38, CELL_SIZE * 0.38, 0.05, 20);
    const exitMat = new THREE.MeshStandardMaterial({
      color: '#10b981',
      emissive: '#10b981',
      emissiveIntensity: 1.6,
    });
    const exitRingGeo = new THREE.TorusGeometry(CELL_SIZE * 0.42, 0.045, 8, 24);
    const exitRingMat = new THREE.MeshStandardMaterial({
      color: '#34d399',
      emissive: '#10b981',
      emissiveIntensity: 1.8,
    });
    disposables.push(
      wallGeo, wallMat, wallCapGeo, wallCapMat,
      holeGeo, holeMat, holeRimGeo, holeRimMat,
      starGeo, starMat, exitGeo, exitMat, exitRingGeo, exitRingMat
    );

    const dynamicGroup = new THREE.Group();
    boardGroup.add(dynamicGroup);

    const starMeshes = new Map<string, THREE.Mesh>();
    let exitPortalRing: THREE.Mesh | null = null;
    let builtLevel = -1;

    const cellToLocal = (gx: number, gy: number) => ({
      x: (gx - cols * 0.5) * CELL_SIZE,
      z: (gy - rows * 0.5) * CELL_SIZE,
    });

    const rebuildMaze = (snap: Labyrinth3DSnapshot) => {
      while (dynamicGroup.children.length > 0) {
        dynamicGroup.remove(dynamicGroup.children[0]);
      }
      starMeshes.clear();
      exitPortalRing = null;
      builtLevel = snap.level;

      for (let r = 0; r < snap.rows; r += 1) {
        for (let c = 0; c < snap.cols; c += 1) {
          const ch = snap.grid[r]?.[c];
          const pos = cellToLocal(c + 0.5, r + 0.5);
          if (ch === '#') {
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(pos.x, 0.26, pos.z);
            wall.castShadow = !isSoftwareGl;
            wall.receiveShadow = true;
            const cap = new THREE.Mesh(wallCapGeo, wallCapMat);
            cap.position.set(pos.x, 0.55, pos.z);
            dynamicGroup.add(wall, cap);
          } else if (ch === 'O') {
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set(pos.x, 0.008, pos.z);
            const rim = new THREE.Mesh(holeRimGeo, holeRimMat);
            rim.rotation.x = Math.PI / 2;
            rim.position.set(pos.x, 0.02, pos.z);
            dynamicGroup.add(hole, rim);
          } else if (ch === '*') {
            const star = new THREE.Mesh(starGeo, starMat);
            star.position.set(pos.x, 0.34, pos.z);
            dynamicGroup.add(star);
            starMeshes.set(`${r},${c}`, star);
          } else if (ch === 'E') {
            const pad = new THREE.Mesh(exitGeo, exitMat);
            pad.position.set(pos.x, 0.012, pos.z);
            const ring = new THREE.Mesh(exitRingGeo, exitRingMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(pos.x, 0.28, pos.z);
            dynamicGroup.add(pad, ring);
            exitPortalRing = ring;
          }
        }
      }
    };
    rebuildMaze(simRef.current);

    // Chrome Reflective Spheres (P1 Steel Blue & P2 Ruby) + Shadows
    const sphereGeo = new THREE.SphereGeometry(0.27, 24, 18);
    const ball1Mat = new THREE.MeshPhysicalMaterial({
      color: '#bae6fd',
      metalness: 0.94,
      roughness: 0.08,
      clearcoat: 1.0,
    });
    const ball2Mat = new THREE.MeshPhysicalMaterial({
      color: '#fda4af',
      metalness: 0.94,
      roughness: 0.08,
      clearcoat: 1.0,
    });
    applyFresnelRimShader(ball1Mat, { colorHex: '#38bdf8', power: 2.6, intensity: 0.55 });
    applyFresnelRimShader(ball2Mat, { colorHex: '#fb7185', power: 2.6, intensity: 0.55 });
    applyFresnelRimShader(exitRingMat, { colorHex: '#6ee7b7', power: 2.4, intensity: 0.5 });
    const shadowGeo = new THREE.CircleGeometry(0.28, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    const ball1Mesh = new THREE.Mesh(sphereGeo, ball1Mat);
    ball1Mesh.castShadow = !isSoftwareGl;
    const ball1Shadow = new THREE.Mesh(shadowGeo, shadowMat);
    ball1Shadow.rotation.x = -Math.PI / 2;
    ball1Shadow.position.y = 0.015;
    boardGroup.add(ball1Mesh, ball1Shadow);

    const ball2Mesh = new THREE.Mesh(sphereGeo, ball2Mat);
    ball2Mesh.castShadow = !isSoftwareGl;
    const ball2Shadow = new THREE.Mesh(shadowGeo, shadowMat);
    ball2Shadow.rotation.x = -Math.PI / 2;
    ball2Shadow.position.y = 0.015;
    boardGroup.add(ball2Mesh, ball2Shadow);

    disposables.push(sphereGeo, ball1Mat, ball2Mat, shadowGeo, shadowMat);

    const burstSystem = create3dParticleBurstSystem(boardGroup, 96);

    const initW = Math.max(320, host.clientWidth || 920);
    const initH = Math.max(200, host.clientHeight || Math.round((initW * 9) / 16));
    const composer = createProPostComposer(renderer, scene, camera, {
      width: initW,
      height: initH,
      isSoftwareGl,
      bloom: { strength: 0.14, radius: 0.22, threshold: 1.24 },
      ssao: true,
      smaa: true,
    });
    const drs = createDrsController(renderer, {
      isSoftwareGl,
      onScaleChange: () => {
        const w = Math.max(320, host.clientWidth || 920);
        const h = Math.max(200, host.clientHeight || Math.round((w * 9) / 16));
        composer?.setSize(w, h);
      },
    });

    const updateSize = () => {
      const w = Math.max(320, host.clientWidth || 920);
      const h = Math.max(200, host.clientHeight || Math.round((w * 9) / 16));
      renderer.setSize(w, h, false);
      applyResponsiveCameraFov(camera, w / h, 42, 42, 66);
      composer?.setSize(w, h);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(host);

    let lastCollectSeq = simRef.current.collectSeq;
    let lastFallSeq = simRef.current.fallSeq;
    let lastWinSeq = simRef.current.winSeq;
    let elapsed = 0;
    let lastTime = performance.now();
    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      const snap = simRef.current;
      if (snap.level !== builtLevel) {
        rebuildMaze(snap);
      }

      // Physical 2-axis board tilt driven by gyro/keyboard input
      boardGroup.rotation.z = THREE.MathUtils.damp(boardGroup.rotation.z, -snap.tiltX * 0.14, 9, dt);
      boardGroup.rotation.x = THREE.MathUtils.damp(boardGroup.rotation.x, snap.tiltZ * 0.14, 9, dt);

      // Sync star visibility & idle spin
      starMeshes.forEach((mesh, key) => {
        const [rStr, cStr] = key.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        const active = snap.grid[r]?.[c] === '*';
        mesh.visible = active;
        if (active) {
          mesh.rotation.y = elapsed * 2.6 + r * 0.5;
          mesh.position.y = 0.34 + Math.sin(elapsed * 3.5 + c) * 0.06;
        }
      });

      if (exitPortalRing) {
        exitPortalRing.rotation.z = elapsed * 2.2;
        exitPortalRing.position.y = 0.25 + Math.sin(elapsed * 3) * 0.05;
      }

      // Sync spheres
      const b1p = cellToLocal(snap.ball1.x, snap.ball1.y);
      ball1Mesh.position.set(b1p.x, 0.27, b1p.z);
      ball1Mesh.rotation.z -= snap.ball1.vx * dt * 1.4;
      ball1Mesh.rotation.x += snap.ball1.vy * dt * 1.4;
      ball1Shadow.position.set(b1p.x, 0.015, b1p.z);

      const showB2 = snap.twoHumans && snap.ball2 !== null;
      ball2Mesh.visible = showB2;
      ball2Shadow.visible = showB2;
      if (showB2 && snap.ball2) {
        const b2p = cellToLocal(snap.ball2.x, snap.ball2.y);
        ball2Mesh.position.set(b2p.x, 0.27, b2p.z);
        ball2Mesh.rotation.z -= snap.ball2.vx * dt * 1.4;
        ball2Mesh.rotation.x += snap.ball2.vy * dt * 1.4;
        ball2Shadow.position.set(b2p.x, 0.015, b2p.z);
      }

      if (snap.collectSeq !== lastCollectSeq) {
        lastCollectSeq = snap.collectSeq;
        burstSystem.emit(b1p.x, 0.35, b1p.z, 0xfacc15, 22, 4.2);
      }
      if (snap.fallSeq !== lastFallSeq) {
        lastFallSeq = snap.fallSeq;
        burstSystem.emit(b1p.x, 0.2, b1p.z, 0xef4444, 20, 3.8);
      }
      if (snap.winSeq !== lastWinSeq) {
        lastWinSeq = snap.winSeq;
        burstSystem.emit(b1p.x, 0.5, b1p.z, 0x10b981, 40, 6.0);
      }

      drs.sample(dt);
      burstSystem.update(dt);
      if (composer) composer.render();
      else renderer.render(scene, camera);

      pacer.schedule(tick);
    };

    pacer.schedule(tick);

    return () => {
      pacer.cancel();
      ro.disconnect();
      burstSystem.dispose();
      roomEnv.dispose();
      hdri.dispose();
      composer?.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [simRef]);

  return (
    <div
      ref={hostRef}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full aspect-video bg-[#070b17] overflow-hidden"
    />
  );
};
