import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  applyPolyHavenHdri,
  create3dParticleBurstSystem,
  createResilientWebGlRenderer,
  createSkyDomeTexture,
  createThreeFramePacer,
  detectSoftwareGl,
  getMaxSafeAnisotropy,
  initRoomEnvironment,
} from '../arcade/threeProHelpers';
import {
  applyFresnelRimShader,
  applyFresnelRimToGroup,
  create3dRibbonTrail,
  createDrsController,
  createProPostComposer,
} from '../arcade/threePostFxHelpers';

export interface HexGL3DEntity {
  lane: number;
  z: number;
  kind: 'pad' | 'heal' | 'wall';
  hit: boolean;
}

export interface HexGL3DSnapshot {
  shipX: number;
  bank: number;
  speed: number;
  boost: boolean;
  shield: number;
  trackZ: number;
  hitFlash: number;
  pickupEvent?: { seq: number; kind: 'pad' | 'heal' | 'wall'; x: number };
  dead: boolean;
  entities: HexGL3DEntity[];
}

interface HexGL3DViewportProps {
  simRef: React.MutableRefObject<HexGL3DSnapshot>;
  onPointerX: (norm01: number) => void;
}

function createCyberTrackTexture(anisotropy = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#090e24';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt lanes
  ctx.fillStyle = '#0f1738';
  ctx.fillRect(28, 0, 456, 512);

  // Neon cyan grid lines
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.34)';
  ctx.lineWidth = 3;
  for (let x = 32; x <= 480; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(484, y);
    ctx.stroke();
  }

  // Center lane chevrons
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
  ctx.lineWidth = 4;
  for (let y = 32; y < 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(220, y + 24);
    ctx.lineTo(256, y);
    ctx.lineTo(292, y + 24);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 14);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createHoverCraftGroup(): {
  group: THREE.Group;
  flameL: THREE.Mesh;
  flameR: THREE.Mesh;
  shieldDome: THREE.Mesh;
  disposables: Array<{ dispose: () => void }>;
} {
  const disposables: Array<{ dispose: () => void }> = [];
  const group = new THREE.Group();

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: '#0ea5e9',
    roughness: 0.24,
    metalness: 0.72,
    clearcoat: 0.9,
  });
  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.48,
    metalness: 0.45,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.35,
    roughness: 0.1,
    metalness: 0.25,
    clearcoat: 1,
  });
  const neonTrimMat = new THREE.MeshStandardMaterial({
    color: '#22d3ee',
    emissive: '#22d3ee',
    emissiveIntensity: 1.8,
  });
  const flameMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.92,
  });
  const shieldMat = new THREE.MeshBasicMaterial({
    color: '#34d399',
    wireframe: true,
    transparent: true,
    opacity: 0,
  });

  // 1. Primary aerodynamic nose fuselage
  const hullGeo = new THREE.ConeGeometry(0.46, 2.35, 6);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.rotation.x = -Math.PI / 2;
  hull.scale.set(1.15, 1, 0.48);
  hull.position.set(0, 0.28, 0);
  hull.castShadow = true;

  // 2. Cockpit canopy
  const canopyGeo = new THREE.CapsuleGeometry(0.18, 0.56, 6, 12);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.rotation.x = Math.PI / 2;
  canopy.position.set(0, 0.42, -0.1);

  // 3-4. Swept delta wings + neon wingtip rails
  const wingGeo = new THREE.BoxGeometry(1.15, 0.08, 0.72);
  const wingL = new THREE.Mesh(wingGeo, darkCarbonMat);
  wingL.position.set(-0.78, 0.22, 0.35);
  wingL.rotation.set(0.04, 0.28, -0.14);
  const wingR = new THREE.Mesh(wingGeo, darkCarbonMat);
  wingR.position.set(0.78, 0.22, 0.35);
  wingR.rotation.set(0.04, -0.28, 0.14);

  const railGeo = new THREE.BoxGeometry(0.08, 0.08, 0.84);
  const railL = new THREE.Mesh(railGeo, neonTrimMat);
  railL.position.set(-1.32, 0.16, 0.52);
  const railR = railL.clone();
  railR.position.x = 1.32;

  // 5-6. Twin rear turbine pods + dorsal fin
  const podGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.72, 12);
  const podL = new THREE.Mesh(podGeo, darkCarbonMat);
  podL.rotation.x = Math.PI / 2;
  podL.position.set(-0.34, 0.27, 0.84);
  const podR = podL.clone();
  podR.position.x = 0.34;

  const finGeo = new THREE.BoxGeometry(0.06, 0.34, 0.56);
  const fin = new THREE.Mesh(finGeo, neonTrimMat);
  fin.position.set(0, 0.52, 0.68);
  fin.rotation.x = -0.3;

  // 7-8. Twin thruster flames
  const flameGeo = new THREE.ConeGeometry(0.13, 0.75, 10);
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.rotation.x = Math.PI / 2;
  flameL.position.set(-0.34, 0.27, 1.48);
  const flameR = flameL.clone();
  flameR.position.x = 0.34;

  // Energy shield dome
  const shieldGeo = new THREE.IcosahedronGeometry(1.55, 1);
  const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
  shieldDome.position.set(0, 0.35, 0.15);

  group.add(hull, canopy, wingL, wingR, railL, railR, podL, podR, fin, flameL, flameR, shieldDome);
  disposables.push(
    hullMat,
    darkCarbonMat,
    canopyMat,
    neonTrimMat,
    flameMat,
    shieldMat,
    hullGeo,
    canopyGeo,
    wingGeo,
    railGeo,
    podGeo,
    finGeo,
    flameGeo,
    shieldGeo
  );
  return { group, flameL, flameR, shieldDome, disposables };
}

export const HexGL3DViewport: React.FC<HexGL3DViewportProps> = ({ simRef, onPointerX }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onPointerXRef = useRef(onPointerX);
  onPointerXRef.current = onPointerX;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = createResilientWebGlRenderer(isSoftwareGl, { exposure: 1.15 });
    if (!renderer) {
      const fbCanvas = document.createElement('canvas');
      fbCanvas.width = 960;
      fbCanvas.height = 540;
      fbCanvas.className = 'w-full h-full block touch-none cursor-crosshair';
      host.innerHTML = '';
      host.appendChild(fbCanvas);

      const handleFbPointer = (e: PointerEvent) => {
        const rect = fbCanvas.getBoundingClientRect();
        if (!rect.width) return;
        onPointerXRef.current(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
      };
      fbCanvas.addEventListener('pointermove', handleFbPointer);
      fbCanvas.addEventListener('pointerdown', handleFbPointer);

      let fbRaf = 0;
      const drawFb = () => {
        const ctx = fbCanvas.getContext('2d');
        if (ctx) {
          const st = simRef.current;
          const W = fbCanvas.width;
          const H = fbCanvas.height;
          ctx.fillStyle = '#040714';
          ctx.fillRect(0, 0, W, H);
          const horizonY = H * 0.42;
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.lineWidth = 2;
          for (let lane = -2; lane <= 2; lane += 1) {
            ctx.beginPath();
            ctx.moveTo(W * 0.5 + lane * 48, horizonY);
            ctx.lineTo(W * 0.5 + lane * 185, H);
            ctx.stroke();
          }
          for (let i = 0; i < st.entities.length; i += 1) {
            const ent = st.entities[i];
            if (ent.hit && ent.kind !== 'wall') continue;
            const depth = Math.max(0.03, Math.min(1, 1 - ent.z / 1000));
            const sy = horizonY + depth * (H - horizonY);
            const sx = W * 0.5 + ent.lane * (70 + depth * 290);
            ctx.fillStyle = ent.kind === 'pad' ? '#22d3ee' : ent.kind === 'heal' ? '#34d399' : '#f43f5e';
            ctx.fillRect(sx - 18 * depth, sy - 10 * depth, 36 * depth, 16 * depth);
          }
          if (!st.dead) {
            const shipPx = W * 0.5 + st.shipX * 310;
            const shipPy = H * 0.84;
            ctx.save();
            ctx.translate(shipPx, shipPy);
            ctx.rotate(st.bank * 0.35);
            ctx.fillStyle = st.boost ? '#facc15' : '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(0, -24);
            ctx.lineTo(22, 16);
            ctx.lineTo(0, 8);
            ctx.lineTo(-22, 16);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        fbRaf = requestAnimationFrame(drawFb);
      };
      fbRaf = requestAnimationFrame(drawFb);

      return () => {
        cancelAnimationFrame(fbRaf);
        fbCanvas.removeEventListener('pointermove', handleFbPointer);
        fbCanvas.removeEventListener('pointerdown', handleFbPointer);
        if (fbCanvas.parentNode === host) host.removeChild(fbCanvas);
      };
    }

    renderer.domElement.className = 'w-full h-full block touch-none cursor-crosshair';
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const cyberSkyTex = createSkyDomeTexture({
      topHex: '#040614',
      midHex: '#0e173a',
      horizonHex: '#311c5c',
      sunGlowHex: 'rgba(56, 189, 248, 0.34)',
      stars: true,
    });
    const scene = new THREE.Scene();
    scene.background = cyberSkyTex;
    scene.fog = new THREE.FogExp2('#070b1f', 0.0095);

    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 190);
    camera.position.set(0, 2.75, 5.8);
    camera.lookAt(0, 0.8, -14);

    const roomEnv = initRoomEnvironment(scene, renderer);
    const hdri = applyPolyHavenHdri(
      scene,
      renderer,
      'assets/games/hdri/moonless_golf_1k.hdr',
      isSoftwareGl,
      { envIntensity: 0.95 }
    );
    scene.add(new THREE.HemisphereLight('#38bdf8', '#1e1b4b', 0.9));

    const keyLight = new THREE.DirectionalLight('#e0f2fe', 1.9);
    keyLight.position.set(8, 16, 10);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 45;
      keyLight.shadow.camera.left = -10;
      keyLight.shadow.camera.right = 10;
      keyLight.shadow.camera.top = 12;
      keyLight.shadow.camera.bottom = -12;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#a855f7', 1.4);
    rimLight.position.set(-10, 6, -24);
    scene.add(rimLight);

    const disposables: Array<{ dispose: () => void }> = [cyberSkyTex];

    // Scrolling Neon Highway Deck (width 11.2 units covering lane [-1.05..1.05] * 4.2)
    const trackTex = createCyberTrackTexture(getMaxSafeAnisotropy(renderer, isSoftwareGl));
    const trackGeo = new THREE.PlaneGeometry(11.6, 150);
    const trackMat = new THREE.MeshStandardMaterial({
      map: trackTex,
      roughness: 0.35,
      metalness: 0.45,
    });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(0, 0, -64);
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);
    disposables.push(trackTex, trackGeo, trackMat);

    // Side Cyber Guardrails + Under-Void Grid
    const railGeo = new THREE.BoxGeometry(0.26, 0.42, 150);
    const railMatL = new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#06b6d4',
      emissiveIntensity: 1.45,
      roughness: 0.25,
    });
    const railMatR = new THREE.MeshStandardMaterial({
      color: '#a855f7',
      emissive: '#9333ea',
      emissiveIntensity: 1.45,
      roughness: 0.25,
    });
    const guardL = new THREE.Mesh(railGeo, railMatL);
    guardL.position.set(-5.85, 0.21, -64);
    const guardR = new THREE.Mesh(railGeo, railMatR);
    guardR.position.set(5.85, 0.21, -64);
    scene.add(guardL, guardR);
    disposables.push(railGeo, railMatL, railMatR);

    // Repeating Overhead Neon Cyber Arches
    const ARCH_COUNT = 8;
    const ARCH_SPACING = 18;
    const archGroupPool: THREE.Group[] = [];
    const pillarGeo = new THREE.BoxGeometry(0.32, 4.8, 0.36);
    const beamGeo = new THREE.BoxGeometry(12.2, 0.28, 0.36);
    const archMat = new THREE.MeshStandardMaterial({
      color: '#1e1b4b',
      emissive: '#6366f1',
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.6,
    });
    disposables.push(pillarGeo, beamGeo, archMat);

    for (let i = 0; i < ARCH_COUNT; i += 1) {
      const ag = new THREE.Group();
      const pL = new THREE.Mesh(pillarGeo, archMat);
      pL.position.set(-5.9, 2.4, 0);
      const pR = new THREE.Mesh(pillarGeo, archMat);
      pR.position.set(5.9, 2.4, 0);
      const top = new THREE.Mesh(beamGeo, archMat);
      top.position.set(0, 4.85, 0);
      ag.add(pL, pR, top);
      ag.position.z = -i * ARCH_SPACING;
      scene.add(ag);
      archGroupPool.push(ag);
    }

    // Flanking Futuristic Skyline Towers (InstancedMesh)
    const towerGeo = new THREE.BoxGeometry(2.8, 1, 2.8);
    const towerMat = new THREE.MeshStandardMaterial({
      color: '#0b1029',
      emissive: '#38bdf8',
      emissiveIntensity: 0.22,
      roughness: 0.42,
      metalness: 0.55,
    });
    const TOWER_COUNT = 32;
    const skylineInst = new THREE.InstancedMesh(towerGeo, towerMat, TOWER_COUNT);
    const tDummy = new THREE.Object3D();
    for (let i = 0; i < TOWER_COUNT; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const h = 8 + ((i * 7) % 18);
      tDummy.position.set(side * (11.5 + (i % 3) * 4.5), h * 0.5 - 4, -8 - i * 4.2);
      tDummy.scale.set(1 + (i % 2) * 0.4, h, 1 + ((i + 1) % 2) * 0.4);
      tDummy.updateMatrix();
      skylineInst.setMatrixAt(i, tDummy.matrix);
    }
    skylineInst.instanceMatrix.needsUpdate = true;
    scene.add(skylineInst);
    disposables.push(towerGeo, towerMat);

    // Hovercraft Ship + Fresnel Silhouette + Twin Thruster Ribbons + Contact Shadow
    const craft = createHoverCraftGroup();
    applyFresnelRimToGroup(craft.group, { colorHex: '#22d3ee', power: 2.9, intensity: 0.55 });
    scene.add(craft.group);
    disposables.push(...craft.disposables);

    const ribbonL = create3dRibbonTrail(14, '#22d3ee', 0.24, { opacity: 0.78 });
    const ribbonR = create3dRibbonTrail(14, '#22d3ee', 0.24, { opacity: 0.78 });
    scene.add(ribbonL.mesh, ribbonR.mesh);
    disposables.push(ribbonL, ribbonR);

    const shadowGeo = new THREE.CircleGeometry(1.15, 18);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const craftShadow = new THREE.Mesh(shadowGeo, shadowMat);
    craftShadow.rotation.x = -Math.PI / 2;
    craftShadow.position.set(0, 0.02, 0);
    scene.add(craftShadow);
    disposables.push(shadowGeo, shadowMat);

    // Pooled Obstacle / Powerup Meshes (zero per-frame allocations)
    const POOL_SIZE = 28;
    const padGeo = new THREE.BoxGeometry(1.55, 0.14, 2.2);
    const padMat = new THREE.MeshStandardMaterial({
      color: '#22d3ee',
      emissive: '#06b6d4',
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });
    const healGeo = new THREE.TorusGeometry(0.58, 0.12, 10, 22);
    const healMat = new THREE.MeshStandardMaterial({
      color: '#34d399',
      emissive: '#10b981',
      emissiveIntensity: 1.9,
      roughness: 0.2,
    });
    const wallGeo = new THREE.BoxGeometry(1.48, 1.55, 0.95);
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#f43f5e',
      emissive: '#e11d48',
      emissiveIntensity: 1.25,
      roughness: 0.25,
      metalness: 0.4,
    });
    applyFresnelRimShader(wallMat, { colorHex: '#fda4af', power: 2.6, intensity: 0.45 });
    disposables.push(padGeo, padMat, healGeo, healMat, wallGeo, wallMat);

    const padPool = Array.from({ length: POOL_SIZE }, () => {
      const m = new THREE.Mesh(padGeo, padMat);
      m.visible = false;
      scene.add(m);
      return m;
    });
    const healPool = Array.from({ length: POOL_SIZE }, () => {
      const m = new THREE.Mesh(healGeo, healMat);
      m.visible = false;
      scene.add(m);
      return m;
    });
    const wallPool = Array.from({ length: POOL_SIZE }, () => {
      const m = new THREE.Mesh(wallGeo, wallMat);
      m.visible = false;
      m.castShadow = !isSoftwareGl;
      scene.add(m);
      return m;
    });

    const burstSystem = create3dParticleBurstSystem(scene, 110);

    const initW = Math.max(320, host.clientWidth || 960);
    const initH = Math.max(200, host.clientHeight || Math.round((initW * 9) / 16));
    const composer = createProPostComposer(renderer, scene, camera, {
      width: initW,
      height: initH,
      isSoftwareGl,
      bloom: { strength: 0.52, radius: 0.45, threshold: 0.78 },
      speedRadial: true,
      smaa: true,
    });
    const drs = createDrsController(renderer, {
      isSoftwareGl,
      onScaleChange: () => {
        const w = Math.max(320, host.clientWidth || 960);
        const h = Math.max(200, host.clientHeight || Math.round((w * 9) / 16));
        composer?.setSize(w, h);
      },
    });

    const updateSize = () => {
      const w = Math.max(320, host.clientWidth || 960);
      const h = Math.max(200, host.clientHeight || Math.round((w * 9) / 16));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      composer?.setSize(w, h);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(host);

    const handlePointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width) return;
      onPointerXRef.current(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    };
    renderer.domElement.addEventListener('pointermove', handlePointer);
    renderer.domElement.addEventListener('pointerdown', handlePointer);

    let lastTime = performance.now();
    let elapsed = 0;
    let lastEventSeq = -1;
    let shieldPulse = 0;
    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      const st = simRef.current;
      const worldX = st.shipX * 4.25;

      // Track scrolling texture & overhead cyber arches
      trackTex.offset.y = -(st.trackZ * 0.018) % 1;
      const archMod = (st.trackZ * 0.115) % ARCH_SPACING;
      for (let i = 0; i < ARCH_COUNT; i += 1) {
        const z = -i * ARCH_SPACING + archMod;
        archGroupPool[i].position.z = z > 8 ? z - ARCH_COUNT * ARCH_SPACING : z;
      }

      // Hovercraft position, banking roll, and hover float
      craft.group.position.x = THREE.MathUtils.damp(craft.group.position.x, worldX, 16, dt);
      craft.group.position.y = 0.2 + Math.sin(elapsed * 5.2) * 0.055;
      craft.group.rotation.z = THREE.MathUtils.damp(craft.group.rotation.z, -st.bank * 0.52, 12, dt);
      craft.group.visible = !st.dead;
      craftShadow.position.x = craft.group.position.x;
      craftShadow.visible = !st.dead;

      // Dynamic thruster flames
      const flameScale = st.boost ? 1.85 + Math.sin(elapsed * 40) * 0.25 : 0.8 + (st.speed / 1000) * 0.45;
      craft.flameL.scale.set(1, flameScale, 1);
      craft.flameR.scale.set(1, flameScale, 1);
      (craft.flameL.material as THREE.MeshBasicMaterial).color.set(st.boost ? '#facc15' : '#38bdf8');
      if (!st.dead) {
        const ribCol = st.boost ? '#facc15' : '#22d3ee';
        const cosB = Math.cos(craft.group.rotation.z);
        const sinB = Math.sin(craft.group.rotation.z);
        ribbonL.push(
          craft.group.position.x - 0.34 * cosB,
          craft.group.position.y + 0.27 - 0.34 * sinB,
          1.45,
          camera.position,
          ribCol
        );
        ribbonR.push(
          craft.group.position.x + 0.34 * cosB,
          craft.group.position.y + 0.27 + 0.34 * sinB,
          1.45,
          camera.position,
          ribCol
        );
      } else {
        ribbonL.reset();
        ribbonR.reset();
      }

      if (st.pickupEvent && st.pickupEvent.seq !== lastEventSeq) {
        lastEventSeq = st.pickupEvent.seq;
        const bx = st.pickupEvent.x * 4.25;
        if (st.pickupEvent.kind === 'pad') {
          burstSystem.emit(bx, 0.5, 0, 0x22d3ee, 24, 5.5);
        } else if (st.pickupEvent.kind === 'heal') {
          burstSystem.emit(bx, 0.7, 0, 0x34d399, 24, 4.8);
          shieldPulse = 0.8;
        } else {
          burstSystem.emit(bx, 0.8, 0, 0xf43f5e, 32, 6.8);
        }
      }

      shieldPulse = Math.max(0, shieldPulse - dt * 1.4);
      const shieldMat = craft.shieldDome.material as THREE.MeshBasicMaterial;
      shieldMat.opacity = Math.max(shieldPulse * 0.55, st.hitFlash * 0.45);
      shieldMat.color.set(st.hitFlash > 0.1 ? '#f43f5e' : '#34d399');
      craft.shieldDome.rotation.y += dt * 2.2;

      // Update pooled entity meshes from simulation entities
      let pIdx = 0;
      let hIdx = 0;
      let wIdx = 0;
      for (let i = 0; i < st.entities.length; i += 1) {
        const ent = st.entities[i];
        if (ent.hit && ent.kind !== 'wall') continue;
        // Map simulation z [1000 .. -20] -> 3D world z [-112 .. +2.5]
        const wz = 0.2 - (ent.z / 1000) * 114;
        const wx = ent.lane * 4.25;
        if (ent.kind === 'pad' && pIdx < POOL_SIZE) {
          const m = padPool[pIdx++];
          m.visible = true;
          m.position.set(wx, 0.08, wz);
        } else if (ent.kind === 'heal' && hIdx < POOL_SIZE) {
          const m = healPool[hIdx++];
          m.visible = true;
          m.position.set(wx, 0.75 + Math.sin(elapsed * 4 + i) * 0.14, wz);
          m.rotation.y = elapsed * 2.8 + i;
        } else if (ent.kind === 'wall' && wIdx < POOL_SIZE) {
          const m = wallPool[wIdx++];
          m.visible = true;
          m.position.set(wx, 0.78, wz);
        }
      }
      for (let i = pIdx; i < POOL_SIZE; i += 1) padPool[i].visible = false;
      for (let i = hIdx; i < POOL_SIZE; i += 1) healPool[i].visible = false;
      for (let i = wIdx; i < POOL_SIZE; i += 1) wallPool[i].visible = false;

      // Smooth Chase Camera + Turbo Responsive FOV
      const aspectBoost = camera.aspect < 1.3 ? Math.min(14, (1.3 - camera.aspect) * 20) : 0;
      const targetFov = (st.boost ? 62 : 48 + Math.min(8, (st.speed - 500) * 0.015)) + aspectBoost;
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, dt);
      camera.updateProjectionMatrix();

      const shake = st.hitFlash * 0.24;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, worldX * 0.45, 9, dt) + (Math.random() - 0.5) * shake;
      camera.position.y = THREE.MathUtils.damp(camera.position.y, st.boost ? 2.45 : 2.78, 8, dt) + (Math.random() - 0.5) * shake;
      camera.position.z = 5.75;
      camera.lookAt(worldX * 0.28, 0.75, -18);

      drs.sample(dt);
      composer?.setSpeedFx(
        Math.max(0, Math.min(1, (st.speed - 450) / 700)),
        st.boost ? 1 : 0,
        st.hitFlash,
        elapsed
      );
      burstSystem.update(dt);
      if (composer) composer.render();
      else renderer.render(scene, camera);
      pacer.schedule(tick);
    };

    pacer.schedule(tick);

    return () => {
      pacer.cancel();
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', handlePointer);
      renderer.domElement.removeEventListener('pointerdown', handlePointer);
      burstSystem.dispose();
      roomEnv.dispose();
      hdri.dispose();
      composer?.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [simRef]);

  return (
    <div
      ref={hostRef}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full aspect-video bg-[#040714] overflow-hidden"
    />
  );
};
