import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PenaltyCountry } from '../../../shared/penaltyCountries';
import {
  applyPolyHavenHdri,
  applyResponsiveCameraFov,
  create3dParticleBurstSystem,
  createFootballTexture,
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
  create3dRibbonTrail,
  createDrsController,
  createInstancedGrassField,
  createProPostComposer,
  createVolumetricBeamMaterial,
} from '../arcade/threePostFxHelpers';

export interface Penalty3DStateSnapshot {
  aimX: number;
  aimY: number;
  curve: number;
  shotStyle?: 'placed' | 'power' | 'panenka';
  keeperX: number;
  keeperDiveY: number;
  strikerRunT: number;
  strikerKicking: boolean;
  netRipple: number;
  netImpactX: number;
  cameraShake: number;
  attacker: 1 | 2;
  winner: 1 | 2 | null;
  ball: {
    active: boolean;
    t: number;
    endX: number;
    endY: number;
    curve: number;
    outcome: 'goal' | 'saved' | 'post' | 'miss';
    resolved: boolean;
    spinAngle: number;
  };
}

interface Penalty3DViewportProps {
  stateRef: React.MutableRefObject<Penalty3DStateSnapshot>;
  p1Country: PenaltyCountry;
  p2Country: PenaltyCountry;
  matchMode: 'cpu' | '2p';
  onGoalClick: (aimX: number, aimY: number) => void;
}

const GOAL_HALF_W = 3.66;
const GOAL_H = 2.44;
const GOAL_DEPTH = 1.75;
const SPOT_Z = 11.0;

function createKeeperGloves(trimHex: string): { left: THREE.Group; right: THREE.Group } {
  const buildOne = (side: -1 | 1) => {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.17, 0.085),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.38 })
    );
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: trimHex, roughness: 0.35 })
    );
    cuff.position.y = -0.1;
    g.add(palm, cuff);
    g.position.set(side * 0.02, 0.03, 0.03);
    return g;
  };
  return { left: buildOne(-1), right: buildOne(1) };
}

export const Penalty3DViewport: React.FC<Penalty3DViewportProps> = ({
  stateRef,
  p1Country,
  p2Country,
  matchMode,
  onGoalClick,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const countriesRef = useRef({ p1: p1Country, p2: p2Country, matchMode });
  countriesRef.current = { p1: p1Country, p2: p2Country, matchMode };
  const onGoalClickRef = useRef(onGoalClick);
  onGoalClickRef.current = onGoalClick;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = createResilientWebGlRenderer(isSoftwareGl, { exposure: 1.12 });
    if (!renderer) return;

    renderer.domElement.className = 'w-full h-full block cursor-crosshair touch-none';
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyDomeTex = createSkyDomeTexture({
      topHex: '#071127',
      midHex: '#17325c',
      horizonHex: '#335c8d',
      sunGlowHex: 'rgba(186, 230, 253, 0.45)',
      stars: true,
    });
    scene.background = skyDomeTex;
    scene.fog = new THREE.FogExp2('#0b162d', 0.0115);

    const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 160);
    const baseCamPos = new THREE.Vector3(0.75, 3.05, 19.2);
    const baseCamLook = new THREE.Vector3(0, 1.18, 1.2);
    camera.position.copy(baseCamPos);
    camera.lookAt(baseCamLook);

    const roomEnv = initRoomEnvironment(scene, renderer);
    const hdri = applyPolyHavenHdri(
      scene,
      renderer,
      'assets/games/hdri/evening_road_01_1k.hdr',
      isSoftwareGl,
      { setBackground: false, envIntensity: 0.45 }
    );

    scene.add(new THREE.HemisphereLight('#bae6fd', '#14532d', 0.5));
    const keyLight = new THREE.DirectionalLight('#fff7ed', 1.45);
    keyLight.position.set(11, 16, 13);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 44;
      keyLight.shadow.camera.left = -13;
      keyLight.shadow.camera.right = 13;
      keyLight.shadow.camera.top = 11;
      keyLight.shadow.camera.bottom = -11;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.65);
    rimLight.position.set(-12, 9, -10);
    scene.add(rimLight);

    const disposables: Array<{ dispose: () => void }> = [skyDomeTex];

    // Ground Pitch + Mowed Grass + Chalk Lines + GPU-Instanced Perimeter Grass Blades
    const maxAniso = getMaxSafeAnisotropy(renderer, isSoftwareGl);
    const pitchTex = createMowedPitchTexture(maxAniso);
    pitchTex.repeat.set(3, 3);
    disposables.push(pitchTex);

    const pitchMat = new THREE.MeshStandardMaterial({
      map: pitchTex,
      roughness: 0.82,
      metalness: 0.03,
    });
    const pitchGeo = new THREE.PlaneGeometry(86, 68);
    const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    pitchMesh.rotation.x = -Math.PI / 2;
    pitchMesh.receiveShadow = true;
    scene.add(pitchMesh);
    disposables.push(pitchGeo, pitchMat);

    const grassField = createInstancedGrassField(scene, {
      count: isSoftwareGl ? 280 : 840,
      innerHalfW: 20.5,
      innerHalfZ: 17,
      outerPad: 8.5,
      bladeHeight: 0.36,
    });
    disposables.push(grassField);

    void loadCachedPbrTexture('assets/games/pbr/grass_diff.jpg', {
      srgb: true,
      repeatX: 12,
      repeatY: 10,
    }).then((tex) => {
      if (tex) {
        pitchMat.bumpMap = tex;
        pitchMat.bumpScale = 0.035;
        pitchMat.needsUpdate = true;
      }
    });

    const chalkMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
    disposables.push(chalkMat);
    const addChalkLine = (x: number, z: number, w: number, d: number) => {
      const geo = new THREE.PlaneGeometry(w, d);
      const m = new THREE.Mesh(geo, chalkMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.014, z);
      scene.add(m);
      disposables.push(geo);
    };
    addChalkLine(0, 0, 56, 0.12);
    addChalkLine(0, 5.5, 18.32, 0.11);
    addChalkLine(-9.16, 2.75, 0.11, 5.5);
    addChalkLine(9.16, 2.75, 0.11, 5.5);
    addChalkLine(0, 16.5, 40.32, 0.12);
    addChalkLine(-20.16, 8.25, 0.12, 16.5);
    addChalkLine(20.16, 8.25, 0.12, 16.5);

    const spotGeo = new THREE.CircleGeometry(0.18, 20);
    const spotMesh = new THREE.Mesh(spotGeo, chalkMat);
    spotMesh.rotation.x = -Math.PI / 2;
    spotMesh.position.set(0, 0.018, SPOT_Z);
    scene.add(spotMesh);
    disposables.push(spotGeo);

    // Corner Flags on Goal Line
    const cornerPoleGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.5, 8);
    const cornerClothGeo = new THREE.PlaneGeometry(0.42, 0.28);
    const cornerClothMat = new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#ca8a04',
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
    });
    disposables.push(cornerPoleGeo, cornerClothGeo, cornerClothMat);
    [-25.5, 25.5].forEach((cx) => {
      const pole = new THREE.Mesh(cornerPoleGeo, chalkMat);
      pole.position.set(cx, 0.75, 0);
      const cloth = new THREE.Mesh(cornerClothGeo, cornerClothMat);
      cloth.position.set(cx + (cx < 0 ? 0.21 : -0.21), 1.32, 0.04);
      scene.add(pole, cloth);
    });

    // Stadium Perimeter LED Ad Board & Animated Multi-Tier Crowd Grandstands
    const adGeo = new THREE.BoxGeometry(42, 1.05, 0.35);
    const adMat = new THREE.MeshStandardMaterial({
      color: '#0b1328',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.52,
      roughness: 0.32,
    });
    const adBoard = new THREE.Mesh(adGeo, adMat);
    adBoard.position.set(0, 0.52, -4.4);
    scene.add(adBoard);
    disposables.push(adGeo, adMat);

    const mainStands = createStadiumStandsGroup({
      width: 52,
      tiers: 6,
      depth: 10.5,
      accentHex: 0x38bdf8,
    });
    mainStands.group.position.set(0, 0, -7.8);
    scene.add(mainStands.group);
    disposables.push(mainStands);

    const leftStands = createStadiumStandsGroup({
      width: 28,
      tiers: 5,
      depth: 8.5,
      accentHex: 0x9146ff,
    });
    leftStands.group.rotation.y = Math.PI * 0.42;
    leftStands.group.position.set(-22, 0, 5);
    scene.add(leftStands.group);
    disposables.push(leftStands);

    const rightStands = createStadiumStandsGroup({
      width: 28,
      tiers: 5,
      depth: 8.5,
      accentHex: 0x9146ff,
    });
    rightStands.group.rotation.y = -Math.PI * 0.42;
    rightStands.group.position.set(22, 0, 5);
    scene.add(rightStands.group);
    disposables.push(rightStands);

    // 4 Stadium Floodlight Towers + Volumetric Glow Cones
    const towerPoleGeo = new THREE.CylinderGeometry(0.24, 0.36, 19, 10);
    const towerPoleMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.72, roughness: 0.36 });
    const floodHeadGeo = new THREE.BoxGeometry(2.6, 1.15, 0.45);
    const floodHeadMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      emissive: '#fef3c7',
      emissiveIntensity: 2.3,
    });
    const beamConeGeo = new THREE.ConeGeometry(7.2, 26, 16, 1, true);
    const beamConeMat = createVolumetricBeamMaterial('#e0f2fe', 0.16);
    disposables.push(towerPoleGeo, towerPoleMat, floodHeadGeo, floodHeadMat, beamConeGeo, beamConeMat);

    [-19, -8, 8, 19].forEach((tx) => {
      const pole = new THREE.Mesh(towerPoleGeo, towerPoleMat);
      pole.position.set(tx, 9.5, -18.5);
      const head = new THREE.Mesh(floodHeadGeo, floodHeadMat);
      head.position.set(tx, 18.8, -18.0);
      head.lookAt(0, 1, 5);

      const cone = new THREE.Mesh(beamConeGeo, beamConeMat);
      cone.position.set(tx * 0.65, 11.2, -7.2);
      cone.rotation.x = -0.68;
      cone.rotation.z = tx > 0 ? 0.24 : -0.24;
      scene.add(pole, head, cone);
    });

    // 3D Goal Frame (Posts, Crossbar, Stanchions)
    const postMat = new THREE.MeshPhysicalMaterial({
      color: '#f8fafc',
      roughness: 0.18,
      metalness: 0.42,
      clearcoat: 0.85,
    });
    disposables.push(postMat);
    const vPostGeo = new THREE.CylinderGeometry(0.075, 0.075, GOAL_H, 16);
    const hBarGeo = new THREE.CylinderGeometry(0.075, 0.075, GOAL_HALF_W * 2 + 0.15, 16);
    const sideBaseGeo = new THREE.CylinderGeometry(0.05, 0.05, GOAL_DEPTH, 12);
    const backBarGeo = new THREE.CylinderGeometry(0.05, 0.05, GOAL_HALF_W * 2, 12);
    disposables.push(vPostGeo, hBarGeo, sideBaseGeo, backBarGeo);

    const postL = new THREE.Mesh(vPostGeo, postMat);
    postL.position.set(-GOAL_HALF_W, GOAL_H * 0.5, 0);
    postL.castShadow = !isSoftwareGl;

    const postR = new THREE.Mesh(vPostGeo, postMat);
    postR.position.set(GOAL_HALF_W, GOAL_H * 0.5, 0);
    postR.castShadow = !isSoftwareGl;

    const crossbar = new THREE.Mesh(hBarGeo, postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, GOAL_H, 0);
    crossbar.castShadow = !isSoftwareGl;

    const baseL = new THREE.Mesh(sideBaseGeo, postMat);
    baseL.rotation.x = Math.PI / 2;
    baseL.position.set(-GOAL_HALF_W, 0.05, -GOAL_DEPTH * 0.5);

    const baseR = baseL.clone();
    baseR.position.x = GOAL_HALF_W;

    const topL = baseL.clone();
    topL.position.set(-GOAL_HALF_W, GOAL_H - 0.06, -GOAL_DEPTH * 0.5);

    const topR = topL.clone();
    topR.position.x = GOAL_HALF_W;

    const backBottom = new THREE.Mesh(backBarGeo, postMat);
    backBottom.rotation.z = Math.PI / 2;
    backBottom.position.set(0, 0.05, -GOAL_DEPTH);

    scene.add(postL, postR, crossbar, baseL, baseR, topL, topR, backBottom);

    // Woven Hex-Mesh Deformable Goal Net (Back + Sides + Top)
    const netTex = createWovenNetTexture(isSoftwareGl ? 1 : 4);
    netTex.repeat.set(10, 4);
    const netMat = new THREE.MeshBasicMaterial({
      map: netTex,
      color: '#e2e8f0',
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const backNetGeo = new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_H, 24, 10);
    const backNetBasePos = new Float32Array(backNetGeo.attributes.position.array);
    const backNetMesh = new THREE.Mesh(backNetGeo, netMat);
    backNetMesh.position.set(0, GOAL_H * 0.5, -GOAL_DEPTH);

    const sideNetTex = netTex.clone();
    sideNetTex.repeat.set(3, 4);
    sideNetTex.needsUpdate = true;
    const sideNetMat = netMat.clone();
    sideNetMat.map = sideNetTex;
    const sideNetGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_H, 8, 10);
    const sideNetL = new THREE.Mesh(sideNetGeo, sideNetMat);
    sideNetL.rotation.y = Math.PI / 2;
    sideNetL.position.set(-GOAL_HALF_W, GOAL_H * 0.5, -GOAL_DEPTH * 0.5);
    const sideNetR = sideNetL.clone();
    sideNetR.position.x = GOAL_HALF_W;

    const topNetGeo = new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_DEPTH, 24, 6);
    const topNet = new THREE.Mesh(topNetGeo, netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(0, GOAL_H - 0.04, -GOAL_DEPTH * 0.5);

    scene.add(backNetMesh, sideNetL, sideNetR, topNet);
    disposables.push(netTex, sideNetTex, netMat, sideNetMat, backNetGeo, sideNetGeo, topNetGeo);

    // Invisible Raycast Target Plane for Click/Tap Shooting
    const targetPlaneGeo = new THREE.PlaneGeometry(GOAL_HALF_W * 2.35, GOAL_H * 1.45);
    const targetPlaneMat = new THREE.MeshBasicMaterial({ visible: false });
    const targetPlane = new THREE.Mesh(targetPlaneGeo, targetPlaneMat);
    targetPlane.position.set(0, GOAL_H * 0.62, 0.08);
    scene.add(targetPlane);
    disposables.push(targetPlaneGeo, targetPlaneMat);

    // Rigged Animated GLB Goalkeeper (Soldier.glb) + World-Scaled Padded Gloves
    const keeperActor = spawnRigged3dActor(scene, 'assets/games/models/Soldier.glb', {
      position: [0, 0, 0.3],
      rotationY: Math.PI,
      targetHeight: 1.9,
      defaultClips: ['Idle'],
      castShadow: !isSoftwareGl,
      primaryHex: p2Country.gkJersey,
      secondaryHex: p2Country.gkTrim,
    });
    const keeperGloves = createKeeperGloves(p2Country.gkTrim);
    keeperActor.attachToBone(['lefthand', 'hand_l', 'l_hand'], keeperGloves.left);
    keeperActor.attachToBone(['righthand', 'hand_r', 'r_hand'], keeperGloves.right);

    // Rigged Animated GLB Striker (Xbot.glb) positioned cleanly clear of narrow camera lens
    const strikerActor = spawnRigged3dActor(scene, 'assets/games/models/Xbot.glb', {
      position: [-2.35, 0, SPOT_Z + 1.05],
      rotationY: Math.PI + 0.55,
      targetHeight: 1.74,
      defaultClips: ['idle'],
      castShadow: !isSoftwareGl,
      primaryHex: p1Country.jersey,
      secondaryHex: p1Country.shorts,
    });

    // Football 3D Sphere + Fresnel Rim + Contact Shadow + Volumetric Shot Ribbon Trail
    const ballTex = createFootballTexture(maxAniso);
    const ballGeo = new THREE.SphereGeometry(0.22, 24, 18);
    const ballMat = new THREE.MeshPhysicalMaterial({
      map: ballTex,
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    });
    applyFresnelRimShader(ballMat, { colorHex: '#38bdf8', power: 2.8, intensity: 0.48 });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = !isSoftwareGl;
    ballMesh.position.set(0, 0.22, SPOT_Z);
    scene.add(ballMesh);

    const ballShadowGeo = new THREE.CircleGeometry(0.28, 18);
    const ballShadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.set(0, 0.019, SPOT_Z);
    scene.add(ballShadow);

    const ballRibbon = create3dRibbonTrail(18, '#38bdf8', 0.34, { opacity: 0.85 });
    scene.add(ballRibbon.mesh);
    disposables.push(ballTex, ballGeo, ballMat, ballShadowGeo, ballShadowMat, ballRibbon);

    // 3D Aim Reticle + Curve Trajectory Arc
    const reticleGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.28, 0.032, 10, 28);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#22d3ee' });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    const dotGeo = new THREE.SphereGeometry(0.065, 10, 10);
    const dotMesh = new THREE.Mesh(dotGeo, ringMat);
    reticleGroup.add(ringMesh, dotMesh);
    scene.add(reticleGroup);

    const arcPtsCount = 24;
    const arcPositions = new Float32Array(arcPtsCount * 3);
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
    const arcMat = new THREE.LineBasicMaterial({
      color: '#facc15',
      transparent: true,
      opacity: 0.82,
    });
    const arcLine = new THREE.Line(arcGeo, arcMat);
    scene.add(arcLine);
    disposables.push(ringGeo, ringMat, dotGeo, arcGeo, arcMat);

    const burstSystem = create3dParticleBurstSystem(scene, 110);

    // Optional Post-Processing (MSAA + SMAA + Bloom + Goal Bokeh DoF) + DRS
    const initW = Math.max(320, host.clientWidth || 960);
    const initH = Math.max(200, host.clientHeight || Math.round((initW * 9) / 16));
    const composer = createProPostComposer(renderer, scene, camera, {
      width: initW,
      height: initH,
      isSoftwareGl,
      bloom: { strength: 0.14, radius: 0.22, threshold: 1.28 },
      bokeh: true,
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
      applyResponsiveCameraFov(camera, w / h, 46, 46, 68);
      composer?.setSize(w, h);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(host);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(targetPlane, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const aimX = Math.max(-0.96, Math.min(0.96, pt.x / GOAL_HALF_W));
        const aimY = Math.max(0.1, Math.min(0.96, pt.y / GOAL_H));
        onGoalClickRef.current(aimX, aimY);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    let prevActive = false;
    let prevResolved = false;
    let prevStrikerKicking = false;
    let prevAttacker: 1 | 2 = 1;
    let crowdExcitement = 0.25;
    let lastTime = performance.now();
    let elapsed = 0;

    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;
      crowdExcitement = Math.max(0.22, crowdExcitement - dt * 0.45);

      const st = stateRef.current;
      const { p1, p2, matchMode: mode } = countriesRef.current;

      if (st.attacker !== prevAttacker) {
        prevAttacker = st.attacker;
        const kKit = st.attacker === 1 ? p1 : p2;
        const dKit = st.attacker === 1 ? p2 : p1;
        strikerActor.tintKit(kKit.jersey, kKit.shorts);
        keeperActor.tintKit(dKit.gkJersey, dKit.gkTrim);
        adMat.emissive.set(kKit.jersey);
      }

      if (st.strikerKicking && !prevStrikerKicking) {
        strikerActor.playClip(['run', 'walk'], 0.14, { timeScale: 1.45 });
      } else if (!st.strikerKicking && prevStrikerKicking) {
        strikerActor.playClip(['idle'], 0.25);
      }
      prevStrikerKicking = st.strikerKicking;

      const runP = st.strikerKicking ? st.strikerRunT : 0;
      strikerActor.group.position.set(
        -1.95 + runP * 1.45,
        0,
        SPOT_Z + 1.45 - runP * 1.25
      );
      strikerActor.group.visible = !st.ball.active || st.ball.t < 0.35;

      // Full-body Goalkeeper Dive Transform + Clip
      const diving = Math.abs(st.keeperX) > 0.14;
      const diveHeight = Math.max(0, st.keeperDiveY * 0.85);
      keeperActor.group.position.set(
        st.keeperX * (GOAL_HALF_W * 0.85),
        diving ? Math.max(0.08, diveHeight * 0.52) : 0,
        0.3
      );
      keeperActor.group.rotation.z = diving ? -st.keeperX * 1.05 : 0;
      keeperActor.playClip(diving ? ['Run', 'Walk'] : ['Idle'], 0.14);

      if (st.ball.active && !prevActive) {
        burstSystem.emit(0, 0.18, SPOT_Z, 0xa3e635, 16, 2.8);
        ballRibbon.reset();
      }
      prevActive = st.ball.active;

      if (st.ball.active) {
        const t = Math.min(1, st.ball.t);
        const inv = 1 - t;
        const endX = st.ball.endX * GOAL_HALF_W;
        const endY = Math.max(0.22, st.ball.endY * GOAL_H);
        const endZ = st.ball.outcome === 'goal' ? -0.55 : 0.12;
        const ctrlX = endX * 0.5 - st.ball.curve * 2.3;
        const arcBoost = st.shotStyle === 'panenka' ? 1.85 : st.shotStyle === 'power' ? 0.55 : 0.92;
        const ctrlY = Math.max(1.35, endY + arcBoost);
        const ctrlZ = SPOT_Z * 0.5;

        const bx = inv * inv * 0 + 2 * inv * t * ctrlX + t * t * endX;
        const by = inv * inv * 0.22 + 2 * inv * t * ctrlY + t * t * endY;
        const bz = inv * inv * SPOT_Z + 2 * inv * t * ctrlZ + t * t * endZ;

        ballMesh.position.set(bx, by, bz);
        ballMesh.rotation.x -= dt * 18;
        ballMesh.rotation.z = st.ball.spinAngle * 0.4;
        ballShadow.position.set(bx, 0.019, bz);
        const shadowScale = Math.max(0.45, 1.15 - by * 0.22);
        ballShadow.scale.setScalar(shadowScale);
        ballShadowMat.opacity = Math.max(0.14, 0.44 - by * 0.09);

        const ribbonCol =
          st.shotStyle === 'power' ? '#facc15' : st.shotStyle === 'panenka' ? '#e879f9' : '#38bdf8';
        ballRibbon.push(bx, by, bz, camera.position, ribbonCol);

        if (st.ball.resolved && !prevResolved) {
          crowdExcitement = st.ball.outcome === 'goal' ? 1.0 : 0.65;
          const burstColor =
            st.ball.outcome === 'goal'
              ? 0xfacc15
              : st.ball.outcome === 'post'
              ? 0x38bdf8
              : 0x22d3ee;
          burstSystem.emit(endX, endY, 0.1, burstColor, st.ball.outcome === 'goal' ? 38 : 22, 5.2);
        }
        prevResolved = st.ball.resolved;
      } else {
        prevResolved = false;
        ballRibbon.reset();
        ballMesh.position.set(0, 0.22, SPOT_Z);
        ballMesh.rotation.set(0, 0, 0);
        ballShadow.position.set(0, 0.019, SPOT_Z);
        ballShadow.scale.setScalar(1);
        ballShadowMat.opacity = 0.44;
      }

      const showAim = !(mode === 'cpu' && st.attacker === 2) && !st.ball.active && !st.winner;
      reticleGroup.visible = showAim;
      arcLine.visible = showAim;
      if (showAim) {
        const targetX = (st.aimX + st.curve * 0.22) * GOAL_HALF_W * 0.96;
        const targetY = Math.max(0.24, st.aimY * GOAL_H);
        reticleGroup.position.set(targetX, targetY, 0.14);
        reticleGroup.rotation.z = elapsed * 2.2;
        ringMat.color.set(st.attacker === 1 ? '#22d3ee' : '#fb7185');

        const ctrlX = targetX * 0.5 - st.curve * 2.1;
        const arcBoost = st.shotStyle === 'panenka' ? 1.75 : st.shotStyle === 'power' ? 0.52 : 0.85;
        const ctrlY = Math.max(1.25, targetY + arcBoost);
        const attr = arcGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < arcPtsCount; i += 1) {
          const t = i / (arcPtsCount - 1);
          const inv = 1 - t;
          const ax = 2 * inv * t * ctrlX + t * t * targetX;
          const ay = inv * inv * 0.22 + 2 * inv * t * ctrlY + t * t * targetY;
          const az = inv * inv * SPOT_Z + 2 * inv * t * (SPOT_Z * 0.5) + t * t * 0.14;
          attr.setXYZ(i, ax, ay, az);
        }
        attr.needsUpdate = true;
      }

      if (st.netRipple > 0.005) {
        const posAttr = backNetGeo.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const impactWorldX = st.netImpactX * GOAL_HALF_W;
        for (let i = 0; i < arr.length; i += 3) {
          const bx = backNetBasePos[i];
          const by = backNetBasePos[i + 1];
          const dist = Math.hypot(bx - impactWorldX, by - 0.1);
          const falloff = Math.max(0, 1 - dist / 4.2);
          arr[i + 2] =
            backNetBasePos[i + 2] -
            Math.sin(elapsed * 22 - dist * 2.4) * 0.52 * st.netRipple * (0.35 + falloff);
        }
        posAttr.needsUpdate = true;
      }

      const shakeMag = st.cameraShake * 0.14;
      camera.position.set(
        baseCamPos.x + (Math.random() - 0.5) * shakeMag,
        baseCamPos.y + (Math.random() - 0.5) * shakeMag,
        baseCamPos.z - (st.ball.active ? st.ball.t * 1.6 : 0)
      );
      camera.lookAt(baseCamLook);

      drs.sample(dt);
      grassField.update(elapsed);
      mainStands.updateCrowd(elapsed, crowdExcitement);
      leftStands.updateCrowd(elapsed + 1.2, crowdExcitement * 0.8);
      rightStands.updateCrowd(elapsed + 2.4, crowdExcitement * 0.8);
      keeperActor.update(dt);
      strikerActor.update(dt);
      burstSystem.update(dt);
      composer?.setDofActive(Boolean(st.winner || (st.ball.active && st.ball.resolved && st.ball.outcome === 'goal')), 12.5);
      if (composer) composer.render();
      else renderer.render(scene, camera);

      pacer.schedule(tick);
    };

    pacer.schedule(tick);

    return () => {
      pacer.cancel();
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      keeperActor.dispose();
      strikerActor.dispose();
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
  }, [stateRef]);

  return (
    <div
      ref={hostRef}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full aspect-video bg-[#060b18] overflow-hidden"
    />
  );
};
