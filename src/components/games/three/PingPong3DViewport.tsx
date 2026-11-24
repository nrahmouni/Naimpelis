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
  createWovenNetTexture,
  detectSoftwareGl,
  getMaxSafeAnisotropy,
  initRoomEnvironment,
  observeHostResize,
} from '../arcade/threeProHelpers';
import {
  applyFresnelRimShader,
  applyFresnelRimToGroup,
  create3dRibbonTrail,
  createDrsController,
  createProPostComposer,
} from '../arcade/threePostFxHelpers';

export interface PingPong3DSnapshot {
  p1: { x: number; y: number; vx: number; smashT: number };
  p2: { x: number; y: number; vx: number; smashT: number };
  ball: { x: number; y: number; z: number; vx: number; vy: number; spin: number; lastHit: 1 | 2 };
  rings: Array<{ x: number; y: number; life: number; col: string }>;
  hitEvent?: { seq: number; x: number; y: number; z: number; smash: boolean };
  banner: string;
  bannerCol: string;
  over: boolean;
}

interface PingPong3DViewportProps {
  simRef: React.MutableRefObject<PingPong3DSnapshot>;
  onPointerMoveX: (nx: number) => void;
  onPointerLeave: () => void;
  onSmashChange: (active: boolean) => void;
}

const TABLE_Y = 0.76;
const HALF_W = 1.65;
const HALF_L = 2.95;

function createTableTennisRacket(rubberHex: string, rimHex: string): {
  group: THREE.Group;
  disposables: Array<{ dispose: () => void }>;
} {
  const disposables: Array<{ dispose: () => void }> = [];
  const g = new THREE.Group();

  const rubberMat = new THREE.MeshStandardMaterial({
    color: rubberHex,
    roughness: 0.42,
    metalness: 0.08,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.62,
    metalness: 0.04,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: rimHex,
    roughness: 0.5,
    metalness: 0.18,
  });

  // 1. Wooden core blade
  const coreGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.02, 24);
  const core = new THREE.Mesh(coreGeo, woodMat);
  core.rotation.x = Math.PI / 2;
  core.scale.set(0.92, 1, 1.08);
  core.position.y = 0.28;
  core.castShadow = true;

  // 2-3. Front & back rubber sponges
  const faceGeo = new THREE.CylinderGeometry(0.228, 0.228, 0.026, 24);
  const face = new THREE.Mesh(faceGeo, rubberMat);
  face.rotation.x = Math.PI / 2;
  face.scale.set(0.92, 1, 1.08);
  face.position.y = 0.28;

  // 4. Flared handle + 5. Collar tape
  const handleGeo = new THREE.CylinderGeometry(0.032, 0.044, 0.22, 12);
  const handle = new THREE.Mesh(handleGeo, woodMat);
  handle.position.y = -0.02;

  const tapeGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.04, 12);
  const tape = new THREE.Mesh(tapeGeo, handleMat);
  tape.position.y = 0.07;

  g.add(core, face, handle, tape);
  disposables.push(rubberMat, woodMat, handleMat, coreGeo, faceGeo, handleGeo, tapeGeo);
  return { group: g, disposables };
}

export interface PingPong3DMountOptions {
  getState: () => PingPong3DSnapshot;
  onPointerMoveX?: (nx: number) => void;
  onPointerLeave?: () => void;
  onSmashChange?: (active: boolean) => void;
}

export function mountPingPong3D(
  host: HTMLElement,
  opts: PingPong3DMountOptions
): { dispose: () => void } | null {
  const isSoftwareGl = detectSoftwareGl();
  const renderer = createResilientWebGlRenderer(isSoftwareGl, { exposure: 1.08 });
  if (!renderer) return null;

  renderer.domElement.className = 'w-full h-full block touch-none cursor-crosshair';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  host.innerHTML = '';
  host.appendChild(renderer.domElement);

    const arenaSkyTex = createSkyDomeTexture({
      topHex: '#040814',
      midHex: '#0e1936',
      horizonHex: '#182952',
      sunGlowHex: 'rgba(34, 211, 238, 0.25)',
    });
    const scene = new THREE.Scene();
    scene.background = arenaSkyTex;
    scene.fog = new THREE.FogExp2('#070d1f', 0.024);

    const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 80);
    camera.position.set(0, 2.95, 5.45);
    camera.lookAt(0, 0.84, -0.35);

    const roomEnv = initRoomEnvironment(scene, renderer);
    const hdri = applyPolyHavenHdri(
      scene,
      renderer,
      'assets/games/hdri/studio_small_09_1k.hdr',
      isSoftwareGl,
      { envIntensity: 0.52 }
    );
    scene.add(new THREE.HemisphereLight('#7dd3fc', '#0f172a', 0.55));

    const overheadKey = new THREE.DirectionalLight('#ffffff', 1.48);
    overheadKey.position.set(3.5, 8.5, 4.2);
    if (!isSoftwareGl) {
      overheadKey.castShadow = true;
      overheadKey.shadow.mapSize.set(1024, 1024);
      overheadKey.shadow.camera.near = 1;
      overheadKey.shadow.camera.far = 22;
      overheadKey.shadow.camera.left = -4.5;
      overheadKey.shadow.camera.right = 4.5;
      overheadKey.shadow.camera.top = 5.5;
      overheadKey.shadow.camera.bottom = -5.5;
      overheadKey.shadow.bias = -0.0005;
    }
    scene.add(overheadKey);

    const cyanRim = new THREE.DirectionalLight('#22d3ee', 0.68);
    cyanRim.position.set(-5, 3, -4);
    const roseRim = new THREE.DirectionalLight('#fb7185', 0.68);
    roseRim.position.set(5, 3, 4);
    scene.add(cyanRim, roseRim);

    const disposables: Array<{ dispose: () => void }> = [arenaSkyTex];

    // Gym Parquet Arena Floor + Tournament Court Barriers
    const maxAniso = getMaxSafeAnisotropy(renderer, isSoftwareGl);
    const gymWoodTex = createWoodPlankTexture('#1f2d47', '#18243a', maxAniso);
    gymWoodTex.repeat.set(8, 8);
    disposables.push(gymWoodTex);
    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gymWoodTex,
      roughness: 0.52,
      metalness: 0.14,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    disposables.push(floorGeo, floorMat);

    const barrierGeo = new THREE.BoxGeometry(9.6, 0.72, 0.14);
    const barrierMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.25,
      roughness: 0.38,
    });
    const backBarrier = new THREE.Mesh(barrierGeo, barrierMat);
    backBarrier.position.set(0, 0.36, -5.2);
    const sideBarrierGeo = new THREE.BoxGeometry(0.14, 0.72, 10.4);
    const leftBarrier = new THREE.Mesh(sideBarrierGeo, barrierMat);
    leftBarrier.position.set(-4.8, 0.36, 0);
    const rightBarrier = leftBarrier.clone();
    rightBarrier.position.x = 4.8;
    scene.add(backBarrier, leftBarrier, rightBarrier);
    disposables.push(barrierGeo, barrierMat, sideBarrierGeo);

    const floorRingGeo = new THREE.RingGeometry(3.8, 3.92, 48);
    const floorRingMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const floorRing = new THREE.Mesh(floorRingGeo, floorRingMat);
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.01;
    scene.add(floorRing);
    disposables.push(floorRingGeo, floorRingMat);

    // Tournament Ping Pong Table
    const deckGeo = new THREE.BoxGeometry(HALF_W * 2, 0.08, HALF_L * 2);
    const deckMat = new THREE.MeshPhysicalMaterial({
      color: '#0a4a75',
      roughness: 0.34,
      metalness: 0.08,
      clearcoat: 0.45,
    });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, TABLE_Y - 0.04, 0);
    deck.receiveShadow = true;
    deck.castShadow = !isSoftwareGl;
    scene.add(deck);

    const apronGeo = new THREE.BoxGeometry(HALF_W * 2 - 0.16, 0.14, HALF_L * 2 - 0.16);
    const apronMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.42,
      metalness: 0.65,
    });
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.set(0, TABLE_Y - 0.14, 0);
    scene.add(apron);

    const legGeo = new THREE.CylinderGeometry(0.055, 0.045, TABLE_Y - 0.1, 10);
    [
      [-HALF_W + 0.28, -HALF_L + 0.42],
      [HALF_W - 0.28, -HALF_L + 0.42],
      [-HALF_W + 0.28, HALF_L - 0.42],
      [HALF_W - 0.28, HALF_L - 0.42],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, apronMat);
      leg.position.set(lx, (TABLE_Y - 0.1) * 0.5, lz);
      leg.castShadow = !isSoftwareGl;
      scene.add(leg);
    });
    disposables.push(deckGeo, deckMat, apronGeo, apronMat, legGeo);

    // Crisp White Table Lines (coplanar offset to prevent Z-fighting)
    const lineMat = new THREE.MeshBasicMaterial({
      color: '#f8fafc',
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    disposables.push(lineMat);
    const addLine = (x: number, z: number, w: number, l: number) => {
      const geo = new THREE.PlaneGeometry(w, l);
      const m = new THREE.Mesh(geo, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, TABLE_Y + 0.004, z);
      scene.add(m);
      disposables.push(geo);
    };
    addLine(-HALF_W + 0.03, 0, 0.045, HALF_L * 2);
    addLine(HALF_W - 0.03, 0, 0.045, HALF_L * 2);
    addLine(0, -HALF_L + 0.03, HALF_W * 2, 0.045);
    addLine(0, HALF_L - 0.03, HALF_W * 2, 0.045);
    addLine(0, 0, 0.025, HALF_L * 2 - 0.08);

    // Center Woven Mesh Net + Posts + Top Tape
    const netTex = createWovenNetTexture(isSoftwareGl ? 1 : 4);
    netTex.repeat.set(16, 2);
    const netMat = new THREE.MeshBasicMaterial({
      map: netTex,
      color: '#e2e8f0',
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const netGeo = new THREE.PlaneGeometry(HALF_W * 2 + 0.24, 0.22);
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, TABLE_Y + 0.11, 0);
    scene.add(netMesh);

    const tapeGeo = new THREE.BoxGeometry(HALF_W * 2 + 0.26, 0.022, 0.024);
    const tapeMesh = new THREE.Mesh(tapeGeo, lineMat);
    tapeMesh.position.set(0, TABLE_Y + 0.22, 0);
    scene.add(tapeMesh);

    const postGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.26, 10);
    const postL = new THREE.Mesh(postGeo, apronMat);
    postL.position.set(-HALF_W - 0.12, TABLE_Y + 0.12, 0);
    const postR = postL.clone();
    postR.position.x = HALF_W + 0.12;
    scene.add(postL, postR);
    disposables.push(netTex, netMat, netGeo, tapeGeo, postGeo);

    // Composite 3D Rackets (P1 Cyan vs P2 Coral) + Fresnel Rim Glow
    const racket1 = createTableTennisRacket('#06b6d4', '#22d3ee');
    const racket2 = createTableTennisRacket('#e11d48', '#fda4af');
    applyFresnelRimToGroup(racket1.group, { colorHex: '#22d3ee', power: 2.8, intensity: 0.48 });
    applyFresnelRimToGroup(racket2.group, { colorHex: '#fb7185', power: 2.8, intensity: 0.48 });
    scene.add(racket1.group, racket2.group);
    disposables.push(...racket1.disposables, ...racket2.disposables);

    // 3-Star Ping Pong Ball + Fresnel + Contact Shadow + Volumetric Flight Ribbon
    const ballGeo = new THREE.SphereGeometry(0.068, 18, 14);
    const ballMat = new THREE.MeshPhysicalMaterial({
      color: '#fb923c',
      emissive: '#f97316',
      emissiveIntensity: 0.42,
      roughness: 0.28,
      clearcoat: 0.8,
    });
    applyFresnelRimShader(ballMat, { colorHex: '#fde047', power: 2.6, intensity: 0.5 });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = !isSoftwareGl;
    scene.add(ballMesh);

    const bShadowGeo = new THREE.CircleGeometry(0.085, 16);
    const bShadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const ballShadow = new THREE.Mesh(bShadowGeo, bShadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);

    const ballRibbon = create3dRibbonTrail(16, '#22d3ee', 0.14, { opacity: 0.8 });
    scene.add(ballRibbon.mesh);
    disposables.push(ballGeo, ballMat, bShadowGeo, bShadowMat, ballRibbon);

    // Pooled Bounce Ripple Rings
    const RING_POOL = 8;
    const ringGeo = new THREE.RingGeometry(0.08, 0.13, 24);
    const ringMeshes = Array.from({ length: RING_POOL }, () => {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: '#22d3ee',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      disposables.push(m.material as THREE.Material);
      return m;
    });
    disposables.push(ringGeo);

    const burstSystem = create3dParticleBurstSystem(scene, 84);

    const initW = Math.max(160, host.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 920));
    const initH = Math.max(120, host.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 520));
    const composer = createProPostComposer(renderer, scene, camera, {
      width: initW,
      height: initH,
      isSoftwareGl,
      bloom: { strength: 0.16, radius: 0.24, threshold: 1.24 },
      ssao: true,
      smaa: true,
    });
    const drs = createDrsController(renderer, {
      isSoftwareGl,
      onScaleChange: () => {
        const w = Math.max(160, host.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 920));
        const h = Math.max(120, host.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 520));
        composer?.setSize(w, h);
      },
    });

    const stopResize = observeHostResize(host, (w, h) => {
      renderer.setSize(w, h, false);
      applyResponsiveCameraFov(camera, w / h, 44, 44, 65);
      composer?.setSize(w, h);
    });

    const handleMove = (e: PointerEvent) => {
      if (!opts.onPointerMoveX) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      opts.onPointerMoveX(Math.max(-1.05, Math.min(1.05, nx * 1.35)));
    };
    const handleLeave = () => {
      opts.onPointerLeave?.();
    };
    const handleDown = (e: PointerEvent) => {
      if (!opts.onSmashChange) return;
      e.preventDefault();
      opts.onSmashChange(true);
    };
    const handleUp = () => {
      opts.onSmashChange?.(false);
    };

    renderer.domElement.addEventListener('pointermove', handleMove);
    renderer.domElement.addEventListener('pointerleave', handleLeave);
    renderer.domElement.addEventListener('pointerdown', handleDown);
    renderer.domElement.addEventListener('pointerup', handleUp);
    renderer.domElement.addEventListener('pointercancel', handleUp);

    let lastTime = performance.now();
    let lastHitSeq = -1;
    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;

      const st = opts.getState();

      // Update P1 & P2 Rackets
      const p1Punch = st.p1.smashT > 0 ? -0.26 : 0;
      racket1.group.position.set(st.p1.x * HALF_W, TABLE_Y + 0.08, st.p1.y * HALF_L + p1Punch);
      racket1.group.rotation.z = THREE.MathUtils.clamp(-st.p1.vx * 0.14, -0.55, 0.55);
      racket1.group.rotation.x = st.p1.smashT > 0 ? -0.45 : -0.15;

      const p2Punch = st.p2.smashT > 0 ? 0.26 : 0;
      racket2.group.position.set(st.p2.x * HALF_W, TABLE_Y + 0.08, st.p2.y * HALF_L + p2Punch);
      racket2.group.rotation.z = THREE.MathUtils.clamp(st.p2.vx * 0.14, -0.55, 0.55);
      racket2.group.rotation.x = st.p2.smashT > 0 ? 0.45 : 0.15;

      // Update Ball & Shadow
      const bx = st.ball.x * HALF_W;
      const bz = st.ball.y * HALF_L;
      const by = TABLE_Y + 0.068 + Math.max(0, st.ball.z) * 0.92;
      ballMesh.position.set(bx, by, bz);
      ballMesh.rotation.x += st.ball.vy * dt * 6;
      ballMesh.rotation.z -= st.ball.spin * dt * 8;

      const onTable = Math.abs(st.ball.x) <= 1.05 && Math.abs(st.ball.y) <= 1.04;
      ballShadow.visible = onTable;
      ballShadow.position.set(bx, TABLE_Y + 0.008, bz);
      const sScale = Math.max(0.4, 1.15 - Math.max(0, st.ball.z) * 0.45);
      ballShadow.scale.setScalar(sScale);
      bShadowMat.opacity = Math.max(0.12, 0.38 - Math.max(0, st.ball.z) * 0.15);

      // Volumetric Ball Ribbon Trail
      ballRibbon.push(bx, by, bz, camera.position, st.ball.lastHit === 1 ? '#22d3ee' : '#fb7185');

      // Bounce Rings
      for (let i = 0; i < RING_POOL; i += 1) {
        const r = st.rings[i];
        const rm = ringMeshes[i];
        if (!r) {
          rm.visible = false;
          continue;
        }
        rm.visible = true;
        rm.position.set(r.x * HALF_W, TABLE_Y + 0.01, r.y * HALF_L);
        rm.scale.setScalar(1 + (1 - r.life) * 2.2);
        const mat = rm.material as THREE.MeshBasicMaterial;
        mat.color.set(r.col);
        mat.opacity = Math.max(0, r.life * 0.8);
      }

      if (st.hitEvent && st.hitEvent.seq !== lastHitSeq) {
        lastHitSeq = st.hitEvent.seq;
        burstSystem.emit(
          st.hitEvent.x * HALF_W,
          TABLE_Y + 0.15 + st.hitEvent.z * 0.85,
          st.hitEvent.y * HALF_L,
          st.hitEvent.smash ? 0xfacc15 : 0x22d3ee,
          st.hitEvent.smash ? 22 : 12,
          st.hitEvent.smash ? 4.2 : 2.6
        );
      }

      // Smooth Damped Arena Broadcast Camera
      const targetCamX = THREE.MathUtils.clamp(bx * 0.22 + st.p1.x * 0.25, -0.75, 0.75);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 6, dt);
      camera.lookAt(bx * 0.12, TABLE_Y + 0.16, -0.25);

      drs.sample(dt);
      burstSystem.update(dt);
      if (composer) composer.render();
      else renderer.render(scene, camera);
      pacer.schedule(tick);
    };

    pacer.schedule(tick);

    return {
      dispose: () => {
        pacer.cancel();
        stopResize();
        renderer.domElement.removeEventListener('pointermove', handleMove);
        renderer.domElement.removeEventListener('pointerleave', handleLeave);
        renderer.domElement.removeEventListener('pointerdown', handleDown);
        renderer.domElement.removeEventListener('pointerup', handleUp);
        renderer.domElement.removeEventListener('pointercancel', handleUp);
        burstSystem.dispose();
        roomEnv.dispose();
        hdri.dispose();
        composer?.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      },
    };
}

export const PingPong3DViewport: React.FC<PingPong3DViewportProps> = ({
  simRef,
  onPointerMoveX,
  onPointerLeave,
  onSmashChange,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef({ onPointerMoveX, onPointerLeave, onSmashChange });
  cbRef.current = { onPointerMoveX, onPointerLeave, onSmashChange };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountPingPong3D(host, {
      getState: () => simRef.current,
      onPointerMoveX: (nx) => cbRef.current.onPointerMoveX(nx),
      onPointerLeave: () => cbRef.current.onPointerLeave(),
      onSmashChange: (active) => cbRef.current.onSmashChange(active),
    });
    return () => {
      handle?.dispose();
    };
  }, [simRef]);

  return (
    <div
      ref={hostRef}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full aspect-video bg-[#050915] overflow-hidden"
    />
  );
};
