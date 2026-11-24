import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  applyPolyHavenHdri,
  applyResponsiveCameraFov,
  create3dParticleBurstSystem,
  createCompositeRacketGroup,
  createMowedPitchTexture,
  createResilientWebGlRenderer,
  createSkyDomeTexture,
  createStadiumStandsGroup,
  createThreeFramePacer,
  createWovenNetTexture,
  detectSoftwareGl,
  getMaxSafeAnisotropy,
  initRoomEnvironment,
  loadCachedPbrTexture,
  spawnRigged3dActor,
} from '../arcade/threeProHelpers';
import {
  applyFresnelRimShader,
  applyFresnelRimToGroup,
  create3dRibbonTrail,
  createDrsController,
  createInstancedGrassField,
  createProPostComposer,
} from '../arcade/threePostFxHelpers';

export interface TennisSimSnapshot {
  p1: { x: number; y: number; swingT: number };
  p2: { x: number; y: number; swingT: number };
  ball: { x: number; y: number; z: number; vx: number; vy: number };
  surface?: 'grass' | 'clay' | 'hard';
  shotTag?: 'topspin' | 'lob' | 'smash' | 'normal';
  over: boolean;
  hitSeq: number;
  pointSeq: number;
  lastScorer: 1 | 2;
}

interface Tennis3DViewportProps {
  simRef: React.MutableRefObject<TennisSimSnapshot>;
}

const COURT_HALF_W = 4.2;
const COURT_HALF_L = 9.2;

function createUmpireHighChairGroup(): { group: THREE.Group; disposables: Array<{ dispose: () => void }> } {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.78, roughness: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#064e3b', roughness: 0.65, metalness: 0.15 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#047857', roughness: 0.5 });

  // 4 Tubular angled legs
  const legGeo = new THREE.CylinderGeometry(0.032, 0.038, 2.25, 8);
  const legCoords: Array<[number, number, number, number]> = [
    [-0.34, -0.34, 0.08, -0.08],
    [0.34, -0.34, 0.08, 0.08],
    [-0.36, 0.36, -0.08, -0.08],
    [0.36, 0.36, -0.08, 0.08],
  ];
  legCoords.forEach(([lx, lz, rx, rz]) => {
    const leg = new THREE.Mesh(legGeo, metalMat);
    leg.position.set(lx, 1.1, lz);
    leg.rotation.set(rx, 0, rz);
    leg.castShadow = true;
    g.add(leg);
  });

  // Ladder rungs
  const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.66, 8);
  for (let i = 0; i < 4; i += 1) {
    const rung = new THREE.Mesh(rungGeo, metalMat);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, 0.42 + i * 0.42, 0.34 - i * 0.02);
    g.add(rung);
  }

  // Footrest & Seat Cushion & Backrest
  const deckGeo = new THREE.BoxGeometry(0.76, 0.06, 0.68);
  const deck = new THREE.Mesh(deckGeo, darkMat);
  deck.position.set(0, 1.72, 0.14);

  const seatGeo = new THREE.BoxGeometry(0.68, 0.1, 0.56);
  const seat = new THREE.Mesh(seatGeo, darkMat);
  seat.position.set(0, 2.15, -0.04);

  const backGeo = new THREE.BoxGeometry(0.68, 0.52, 0.09);
  const back = new THREE.Mesh(backGeo, darkMat);
  back.position.set(0, 2.45, -0.28);

  // Sun shade canopy + pole
  const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8);
  const pole = new THREE.Mesh(poleGeo, metalMat);
  pole.position.set(0, 2.9, -0.3);

  const roofGeo = new THREE.BoxGeometry(0.95, 0.05, 0.92);
  const roof = new THREE.Mesh(roofGeo, canopyMat);
  roof.position.set(0, 3.45, -0.05);
  roof.rotation.x = 0.08;

  g.add(deck, seat, back, pole, roof);
  return {
    group: g,
    disposables: [metalMat, darkMat, canopyMat, legGeo, rungGeo, deckGeo, seatGeo, backGeo, poleGeo, roofGeo],
  };
}

export const Tennis3DViewport: React.FC<Tennis3DViewportProps> = ({ simRef }) => {
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

    const grassSkyTex = createSkyDomeTexture({
      topHex: '#1d4ed8',
      midHex: '#38bdf8',
      horizonHex: '#bae6fd',
      sunGlowHex: 'rgba(254, 240, 138, 0.55)',
    });
    const claySkyTex = createSkyDomeTexture({
      topHex: '#431407',
      midHex: '#c2410c',
      horizonHex: '#fdba74',
      sunGlowHex: 'rgba(253, 224, 71, 0.6)',
    });
    const hardSkyTex = createSkyDomeTexture({
      topHex: '#060c1f',
      midHex: '#172554',
      horizonHex: '#1e40af',
      sunGlowHex: 'rgba(56, 189, 248, 0.45)',
      stars: true,
    });

    const scene = new THREE.Scene();
    scene.background = grassSkyTex;
    scene.fog = new THREE.FogExp2('#153328', 0.009);

    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 150);
    camera.position.set(0, 8.8, 16.4);
    camera.lookAt(0, 0.65, -0.4);

    const roomEnv = initRoomEnvironment(scene, renderer);
    const hdri = applyPolyHavenHdri(
      scene,
      renderer,
      'assets/games/hdri/puresky_1k.hdr',
      isSoftwareGl,
      { setBackground: true, backgroundBlur: 0.05, envIntensity: 0.92 }
    );

    scene.add(new THREE.HemisphereLight('#e0f2fe', '#14532d', 0.92));
    const sun = new THREE.DirectionalLight('#fffbeb', 2.25);
    sun.position.set(11, 19, 13);
    if (!isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 52;
      sun.shadow.camera.left = -14;
      sun.shadow.camera.right = 14;
      sun.shadow.camera.top = 15;
      sun.shadow.camera.bottom = -15;
      sun.shadow.bias = -0.0005;
    }
    scene.add(sun);

    const disposables: Array<{ dispose: () => void }> = [grassSkyTex, claySkyTex, hardSkyTex];

    // Outer Stadium Surround
    const surroundGeo = new THREE.PlaneGeometry(58, 58);
    const surroundMat = new THREE.MeshStandardMaterial({ color: '#0c351e', roughness: 0.9 });
    const surround = new THREE.Mesh(surroundGeo, surroundMat);
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.025;
    surround.receiveShadow = true;
    scene.add(surround);
    disposables.push(surroundGeo, surroundMat);

    // Grass / Clay / Hard Court Surface + Instanced Wind-Swaying Perimeter Grass
    const maxAniso = getMaxSafeAnisotropy(renderer, isSoftwareGl);
    const courtTex = createMowedPitchTexture(maxAniso);
    courtTex.repeat.set(2, 3);
    disposables.push(courtTex);
    const courtMat = new THREE.MeshStandardMaterial({
      map: courtTex,
      roughness: 0.78,
      metalness: 0.03,
    });
    const courtGeo = new THREE.PlaneGeometry(COURT_HALF_W * 2 + 2.4, COURT_HALF_L * 2 + 2.6);
    const courtMesh = new THREE.Mesh(courtGeo, courtMat);
    courtMesh.rotation.x = -Math.PI / 2;
    courtMesh.receiveShadow = true;
    scene.add(courtMesh);
    disposables.push(courtGeo, courtMat);

    const grassField = createInstancedGrassField(scene, {
      count: isSoftwareGl ? 220 : 620,
      innerHalfW: COURT_HALF_W + 1.4,
      innerHalfZ: COURT_HALF_L + 1.5,
      outerPad: 5.0,
      bladeHeight: 0.26,
    });
    disposables.push(grassField);

    void loadCachedPbrTexture('assets/games/pbr/grass_diff.jpg', {
      srgb: true,
      repeatX: 6,
      repeatY: 10,
    }).then((tex) => {
      if (tex) {
        courtMat.bumpMap = tex;
        courtMat.bumpScale = 0.022;
        courtMat.needsUpdate = true;
      }
    });

    // White Chalk Court Lines
    const lineMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
    disposables.push(lineMat);
    const addCourtLine = (x: number, z: number, w: number, d: number) => {
      const geo = new THREE.PlaneGeometry(w, d);
      const m = new THREE.Mesh(geo, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      scene.add(m);
      disposables.push(geo);
    };
    addCourtLine(0, -COURT_HALF_L, COURT_HALF_W * 2, 0.11);
    addCourtLine(0, COURT_HALF_L, COURT_HALF_W * 2, 0.11);
    addCourtLine(-COURT_HALF_W, 0, 0.11, COURT_HALF_L * 2);
    addCourtLine(COURT_HALF_W, 0, 0.11, COURT_HALF_L * 2);
    addCourtLine(-COURT_HALF_W * 0.78, 0, 0.09, COURT_HALF_L * 2);
    addCourtLine(COURT_HALF_W * 0.78, 0, 0.09, COURT_HALF_L * 2);
    addCourtLine(0, -COURT_HALF_L * 0.52, COURT_HALF_W * 1.56, 0.09);
    addCourtLine(0, COURT_HALF_L * 0.52, COURT_HALF_W * 1.56, 0.09);
    addCourtLine(0, 0, 0.09, COURT_HALF_L * 1.04);

    // 3D Woven Tennis Net + Posts + Center Strap + Top Tape
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.08, 14);
    const postMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.7, roughness: 0.32 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-COURT_HALF_W - 0.55, 0.54, 0);
    const postR = postL.clone();
    postR.position.x = COURT_HALF_W + 0.55;

    const netTex = createWovenNetTexture(isSoftwareGl ? 1 : 4);
    netTex.repeat.set(14, 3);
    const netGeo = new THREE.PlaneGeometry((COURT_HALF_W + 0.55) * 2, 0.92, 24, 4);
    const netMat = new THREE.MeshBasicMaterial({
      map: netTex,
      color: '#e2e8f0',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, 0.48, 0);

    const tapeGeo = new THREE.BoxGeometry((COURT_HALF_W + 0.55) * 2, 0.09, 0.06);
    const tapeMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.set(0, 0.96, 0);

    const strapGeo = new THREE.BoxGeometry(0.08, 0.96, 0.08);
    const strap = new THREE.Mesh(strapGeo, tapeMat);
    strap.position.set(0, 0.48, 0);

    scene.add(postL, postR, netMesh, tape, strap);
    disposables.push(postGeo, postMat, netTex, netGeo, netMat, tapeGeo, tapeMat, strapGeo);

    // Grand Slam Back Wall + Multi-Tier Animated Crowd Stands + Umpire High Chair
    const wallGeo = new THREE.BoxGeometry(COURT_HALF_W * 2 + 8, 1.15, 0.4);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#064e3b', roughness: 0.52 });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 0.58, -COURT_HALF_L - 3.6);
    scene.add(backWall);
    disposables.push(wallGeo, wallMat);

    const northStands = createStadiumStandsGroup({
      width: 34,
      tiers: 5,
      depth: 8.5,
      accentHex: 0x22c55e,
    });
    northStands.group.position.set(0, 0, -COURT_HALF_L - 5.2);
    scene.add(northStands.group);
    disposables.push(northStands);

    const westStands = createStadiumStandsGroup({
      width: 22,
      tiers: 4,
      depth: 7,
      accentHex: 0xfacc15,
    });
    westStands.group.rotation.y = Math.PI * 0.5;
    westStands.group.position.set(-COURT_HALF_W - 6.8, 0, -1);
    scene.add(westStands.group);
    disposables.push(westStands);

    const eastStands = createStadiumStandsGroup({
      width: 22,
      tiers: 4,
      depth: 7,
      accentHex: 0xfacc15,
    });
    eastStands.group.rotation.y = -Math.PI * 0.5;
    eastStands.group.position.set(COURT_HALF_W + 6.8, 0, -1);
    scene.add(eastStands.group);
    disposables.push(eastStands);

    const umpireChair = createUmpireHighChairGroup();
    umpireChair.group.rotation.y = Math.PI / 2;
    umpireChair.group.position.set(-COURT_HALF_W - 1.55, 0, 0);
    scene.add(umpireChair.group);
    disposables.push(...umpireChair.disposables);

    // Rigged Animated GLB Players + Bone-Following Composite Rackets
    const p1Actor = spawnRigged3dActor(scene, 'assets/games/models/Xbot.glb', {
      position: [0, 0, 7.6],
      rotationY: Math.PI,
      targetHeight: 1.84,
      defaultClips: ['idle'],
      castShadow: !isSoftwareGl,
      primaryHex: '#0284c7',
      secondaryHex: '#f8fafc',
    });
    const p1RacketPivot = new THREE.Group();
    const p1Racket = createCompositeRacketGroup('#22d3ee');
    applyFresnelRimToGroup(p1Racket, { colorHex: '#22d3ee', power: 2.9, intensity: 0.45 });
    p1Racket.scale.setScalar(0.92);
    p1Racket.rotation.set(Math.PI * 0.42, 0, -0.25);
    p1RacketPivot.add(p1Racket);
    p1Actor.attachToBone(['righthand', 'hand_r', 'mixamorigrighthand'], p1RacketPivot);

    const p2Actor = spawnRigged3dActor(scene, 'assets/games/models/Michelle.glb', {
      position: [0, 0, -7.6],
      rotationY: 0,
      targetHeight: 1.78,
      defaultClips: ['Idle'],
      castShadow: !isSoftwareGl,
      primaryHex: '#e11d48',
      secondaryHex: '#fef08a',
    });
    const p2RacketPivot = new THREE.Group();
    const p2Racket = createCompositeRacketGroup('#fb7185');
    applyFresnelRimToGroup(p2Racket, { colorHex: '#fb7185', power: 2.9, intensity: 0.45 });
    p2Racket.scale.setScalar(0.92);
    p2Racket.rotation.set(Math.PI * 0.42, 0, -0.25);
    p2RacketPivot.add(p2Racket);
    p2Actor.attachToBone(['righthand', 'hand_r', 'mixamorigrighthand'], p2RacketPivot);

    // Optic-Yellow Tennis Ball + Fresnel Rim + Contact Shadow + Bounce Ring + Volumetric Ribbon Trail
    const ballGeo = new THREE.SphereGeometry(0.16, 20, 16);
    const ballMat = new THREE.MeshStandardMaterial({
      color: '#bef264',
      emissive: '#65a30d',
      emissiveIntensity: 0.42,
      roughness: 0.62,
    });
    applyFresnelRimShader(ballMat, { colorHex: '#fef08a', power: 2.5, intensity: 0.55 });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = !isSoftwareGl;
    scene.add(ballMesh);

    const shadowGeo = new THREE.CircleGeometry(0.22, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    const ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.y = 0.015;
    scene.add(ballShadow);

    const bounceRingGeo = new THREE.RingGeometry(0.14, 0.28, 24);
    const bounceRingMat = new THREE.MeshBasicMaterial({
      color: '#bef264',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const bounceRing = new THREE.Mesh(bounceRingGeo, bounceRingMat);
    bounceRing.rotation.x = -Math.PI / 2;
    bounceRing.position.y = 0.02;
    scene.add(bounceRing);

    const ballRibbon = create3dRibbonTrail(16, '#bef264', 0.24, { opacity: 0.78 });
    scene.add(ballRibbon.mesh);

    disposables.push(ballGeo, ballMat, shadowGeo, shadowMat, bounceRingGeo, bounceRingMat, ballRibbon);

    const burstSystem = create3dParticleBurstSystem(scene, 96);

    const initW = Math.max(320, host.clientWidth || 920);
    const initH = Math.max(200, host.clientHeight || Math.round((initW * 9) / 16));
    const composer = createProPostComposer(renderer, scene, camera, {
      width: initW,
      height: initH,
      isSoftwareGl,
      bloom: { strength: 0.28, radius: 0.4, threshold: 0.9 },
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
      applyResponsiveCameraFov(camera, w / h, 42, 42, 64);
      composer?.setSize(w, h);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(host);

    let prevP1X = 0;
    let prevP2X = 0;
    let prevBallZ = 0.25;
    let bounceAlpha = 0;
    let crowdExcite = 0.2;
    let lastSurface: string = 'grass';
    let lastHitSeq = simRef.current.hitSeq;
    let lastPointSeq = simRef.current.pointSeq;
    let lastTime = performance.now();
    let elapsed = 0;
    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;
      crowdExcite = Math.max(0.2, crowdExcite - dt * 0.4);

      const sim = simRef.current;

      // Live Court Surface Color Switch (Grass / Clay / Hard)
      const surf = sim.surface || 'grass';
      if (surf !== lastSurface) {
        lastSurface = surf;
        grassField.setVisible(surf === 'grass');
        if (surf === 'clay') {
          courtMat.color.set('#e06834');
          surroundMat.color.set('#7c2d12');
          scene.background = claySkyTex;
          scene.fog = new THREE.FogExp2('#431407', 0.009);
        } else if (surf === 'hard') {
          courtMat.color.set('#2563eb');
          surroundMat.color.set('#0f172a');
          scene.background = hardSkyTex;
          scene.fog = new THREE.FogExp2('#091328', 0.009);
        } else {
          courtMat.color.set('#ffffff');
          surroundMat.color.set('#0c351e');
          scene.background = grassSkyTex;
          scene.fog = new THREE.FogExp2('#153328', 0.009);
        }
      }

      const p1Wx = sim.p1.x * (COURT_HALF_W * 0.92);
      const p2Wx = sim.p2.x * (COURT_HALF_W * 0.92);
      const p1Speed = Math.abs(p1Wx - prevP1X) / Math.max(0.005, dt);
      const p2Speed = Math.abs(p2Wx - prevP2X) / Math.max(0.005, dt);
      prevP1X = p1Wx;
      prevP2X = p2Wx;

      p1Actor.group.position.set(p1Wx, 0, sim.p1.y * (COURT_HALF_L * 0.9));
      p2Actor.group.position.set(p2Wx, 0, sim.p2.y * (COURT_HALF_L * 0.9));

      p1Actor.playClip(p1Speed > 0.9 ? ['run', 'walk'] : ['idle'], 0.16);
      p2Actor.playClip(p2Speed > 0.9 ? ['Run', 'Walk'] : ['Idle'], 0.16);

      p1Actor.update(dt);
      p2Actor.update(dt);

      // Apply subtle extra racket swing arc over bone follow
      const swing1 = sim.p1.swingT > 0 ? Math.sin((1 - sim.p1.swingT / 0.25) * Math.PI) : 0;
      p1RacketPivot.rotation.x += -swing1 * 1.15;
      p1RacketPivot.rotation.z += swing1 * 0.65;

      const swing2 = sim.p2.swingT > 0 ? Math.sin((1 - sim.p2.swingT / 0.25) * Math.PI) : 0;
      p2RacketPivot.rotation.x += swing2 * 1.15;
      p2RacketPivot.rotation.z -= swing2 * 0.65;

      const bx = sim.ball.x * (COURT_HALF_W * 0.95);
      const by = 0.16 + sim.ball.z * 2.25;
      const bz = sim.ball.y * (COURT_HALF_L * 0.92);
      ballMesh.position.set(bx, by, bz);
      ballMesh.rotation.x += dt * 14;
      ballShadow.position.set(bx, 0.015, bz);
      ballShadow.scale.setScalar(Math.max(0.45, 1.15 - sim.ball.z * 0.6));

      const ribbonCol =
        sim.shotTag === 'smash' ? '#f97316' : sim.shotTag === 'lob' ? '#38bdf8' : '#bef264';
      ballRibbon.push(bx, by, bz, camera.position, ribbonCol);

      if (prevBallZ > 0.06 && sim.ball.z <= 0.06) {
        bounceRing.position.set(bx, 0.02, bz);
        bounceRing.scale.setScalar(0.6);
        bounceAlpha = 0.95;
      }
      prevBallZ = sim.ball.z;

      if (bounceAlpha > 0) {
        bounceAlpha = Math.max(0, bounceAlpha - dt * 2.6);
        bounceRingMat.opacity = bounceAlpha;
        bounceRing.scale.addScalar(dt * 3.8);
      } else {
        bounceRingMat.opacity = 0;
      }

      if (sim.hitSeq !== lastHitSeq) {
        lastHitSeq = sim.hitSeq;
        burstSystem.emit(bx, by, bz, sim.shotTag === 'smash' ? 0xf97316 : 0xbef264, 15, 4.0);
      }
      if (sim.pointSeq !== lastPointSeq) {
        lastPointSeq = sim.pointSeq;
        crowdExcite = 0.95;
        const scorerPos = sim.lastScorer === 1 ? p1Actor.group.position : p2Actor.group.position;
        burstSystem.emit(scorerPos.x, 1.4, scorerPos.z, 0xfacc15, 30, 5.4);
      }

      camera.position.x += (bx * 0.24 - camera.position.x) * Math.min(1, dt * 4);
      camera.lookAt(bx * 0.1, 0.62, -0.3);

      drs.sample(dt);
      grassField.update(elapsed);
      northStands.updateCrowd(elapsed, crowdExcite);
      westStands.updateCrowd(elapsed + 1.1, crowdExcite * 0.8);
      eastStands.updateCrowd(elapsed + 2.2, crowdExcite * 0.8);
      burstSystem.update(dt);

      if (composer) composer.render();
      else renderer.render(scene, camera);

      pacer.schedule(tick);
    };

    pacer.schedule(tick);

    return () => {
      pacer.cancel();
      ro.disconnect();
      p1Actor.dispose();
      p2Actor.dispose();
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
      className="w-full aspect-video bg-[#091b14] overflow-hidden"
    />
  );
};
