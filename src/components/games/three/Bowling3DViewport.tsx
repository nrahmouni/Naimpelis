import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  applyPolyHavenHdri,
  applyResponsiveCameraFov,
  create3dParticleBurstSystem,
  createBowlingPinGroup,
  createMarbledBallTexture,
  createResilientWebGlRenderer,
  createSkyDomeTexture,
  createThreeFramePacer,
  createWoodPlankTexture,
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
  createProPostComposer,
} from '../arcade/threePostFxHelpers';

export interface BowlingSimSnapshot {
  phase: 'aim' | 'roll' | 'settle' | 'over';
  turnPlayer: 1 | 2;
  aimX: number;
  spin: number;
  powerPct?: number;
  ball: { x: number; y: number; rot: number };
  pins: Array<{ x: number; y: number; up: boolean; rot: number }>;
  outcomeSeq: number;
  outcomeKind: 'strike' | 'spare' | 'hit' | 'none';
}

interface Bowling3DViewportProps {
  simRef: React.MutableRefObject<BowlingSimSnapshot>;
}

const LANE_HALF_W = 1.18;
const PIN_DECK_Z = -8.6;
const FOUL_Z = 9.8;

function laneToWorld(lx: number, ly: number): { x: number; z: number } {
  return {
    x: lx * LANE_HALF_W,
    z: FOUL_Z - ly * (FOUL_Z - PIN_DECK_Z - 0.6),
  };
}

export const Bowling3DViewport: React.FC<Bowling3DViewportProps> = ({ simRef }) => {
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

    const alleySkyTex = createSkyDomeTexture({
      topHex: '#070918',
      midHex: '#1b1138',
      horizonHex: '#311b58',
      sunGlowHex: 'rgba(168, 85, 247, 0.35)',
    });
    const scene = new THREE.Scene();
    scene.background = alleySkyTex;
    scene.fog = new THREE.FogExp2('#0b0c1f', 0.017);

    const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 100);
    const camPos = new THREE.Vector3(0, 3.25, 13.6);
    const camLook = new THREE.Vector3(0, 0.65, -3.5);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    const roomEnv = initRoomEnvironment(scene, renderer);
    const hdri = applyPolyHavenHdri(
      scene,
      renderer,
      'assets/games/hdri/studio_small_09_1k.hdr',
      isSoftwareGl,
      { envIntensity: 1.0 }
    );

    scene.add(new THREE.HemisphereLight('#c7d2fe', '#1e1b4b', 0.85));
    const pinSpot = new THREE.SpotLight('#fef3c7', 3.6, 36, Math.PI / 4, 0.45, 1);
    pinSpot.position.set(0, 9.5, -5.5);
    pinSpot.target.position.set(0, 0.4, -8.5);
    if (!isSoftwareGl) {
      pinSpot.castShadow = true;
      pinSpot.shadow.mapSize.set(1024, 1024);
    }
    scene.add(pinSpot, pinSpot.target);

    const approachLight = new THREE.DirectionalLight('#60a5fa', 1.3);
    approachLight.position.set(6, 8, 12);
    scene.add(approachLight);

    const disposables: Array<{ dispose: () => void }> = [alleySkyTex];

    // Bowling Alley Floor Surround + Glossy Maple Lane + Oil Pattern Sheen
    const surroundGeo = new THREE.PlaneGeometry(38, 42);
    const surroundMat = new THREE.MeshStandardMaterial({
      color: '#0b1022',
      roughness: 0.78,
      metalness: 0.12,
    });
    const surroundMesh = new THREE.Mesh(surroundGeo, surroundMat);
    surroundMesh.rotation.x = -Math.PI / 2;
    surroundMesh.position.y = -0.08;
    surroundMesh.receiveShadow = true;
    scene.add(surroundMesh);
    disposables.push(surroundGeo, surroundMat);

    const maxAniso = getMaxSafeAnisotropy(renderer, isSoftwareGl);
    const laneWoodTex = createWoodPlankTexture('#c88848', '#ad6c31', maxAniso);
    laneWoodTex.repeat.set(1, 5);
    disposables.push(laneWoodTex);

    let laneReflector: Reflector | null = null;
    if (!isSoftwareGl) {
      try {
        const refGeo = new THREE.PlaneGeometry(LANE_HALF_W * 2, 22.5);
        laneReflector = new Reflector(refGeo, {
          clipBias: 0.003,
          textureWidth: 512,
          textureHeight: 512,
          color: 0x3b4861,
        });
        laneReflector.rotation.x = -Math.PI / 2;
        laneReflector.position.set(0, -0.004, 0.2);
        scene.add(laneReflector);
        disposables.push(refGeo, laneReflector);
      } catch {
        laneReflector = null;
      }
    }

    const laneMat = new THREE.MeshPhysicalMaterial({
      map: laneWoodTex,
      color: '#f7dec2',
      roughness: 0.16,
      metalness: 0.06,
      clearcoat: 0.96,
      clearcoatRoughness: 0.08,
      transparent: Boolean(laneReflector),
      opacity: laneReflector ? 0.78 : 1,
    });
    const laneGeo = new THREE.BoxGeometry(LANE_HALF_W * 2, 0.12, 22.5);
    const laneMesh = new THREE.Mesh(laneGeo, laneMat);
    laneMesh.position.set(0, -0.06, 0.2);
    laneMesh.receiveShadow = true;
    scene.add(laneMesh);
    disposables.push(laneGeo, laneMat);

    // Subtle oil sheen strip down center lane
    const oilGeo = new THREE.PlaneGeometry(1.1, 14.5);
    const oilMat = new THREE.MeshPhysicalMaterial({
      color: '#fde68a',
      transparent: true,
      opacity: 0.08,
      roughness: 0.06,
      clearcoat: 1.0,
      depthWrite: false,
    });
    const oilMesh = new THREE.Mesh(oilGeo, oilMat);
    oilMesh.rotation.x = -Math.PI / 2;
    oilMesh.position.set(0, 0.005, 1.8);
    scene.add(oilMesh);
    disposables.push(oilGeo, oilMat);

    void loadCachedPbrTexture('assets/games/arenas/labyrinth_board.jpg', {
      srgb: true,
      repeatX: 1,
      repeatY: 6,
    }).then((tex) => {
      if (tex) {
        laneMat.map = tex;
        laneMat.color.set('#f6d7b0');
        laneMat.needsUpdate = true;
      }
    });
    void loadCachedPbrTexture('assets/games/pbr/oak_rough.jpg', {
      srgb: false,
      repeatX: 1,
      repeatY: 6,
    }).then((tex) => {
      if (tex) {
        laneMat.roughnessMap = tex;
        laneMat.needsUpdate = true;
      }
    });

    // Illuminated Foul Line + Gutters + Neon Edge Rails
    const foulGeo = new THREE.BoxGeometry(LANE_HALF_W * 2 + 0.1, 0.018, 0.1);
    const foulMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#dc2626',
      emissiveIntensity: 1.35,
    });
    const foulLine = new THREE.Mesh(foulGeo, foulMat);
    foulLine.position.set(0, 0.006, FOUL_Z);
    scene.add(foulLine);
    disposables.push(foulGeo, foulMat);

    const gutterGeo = new THREE.BoxGeometry(0.32, 0.06, 22.5);
    const gutterMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.6 });
    const neonGeo = new THREE.BoxGeometry(0.06, 0.08, 22.5);
    const neonMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#38bdf8',
      emissiveIntensity: 1.5,
    });
    disposables.push(gutterGeo, gutterMat, neonGeo, neonMat);

    [-1, 1].forEach((side) => {
      const gutter = new THREE.Mesh(gutterGeo, gutterMat);
      gutter.position.set(side * (LANE_HALF_W + 0.17), -0.05, 0.2);
      const rail = new THREE.Mesh(neonGeo, neonMat);
      rail.position.set(side * (LANE_HALF_W + 0.36), 0.02, 0.2);
      scene.add(gutter, rail);
    });

    // Lane Chevron Arrows
    const arrowGeo = new THREE.ConeGeometry(0.075, 0.24, 3);
    const arrowMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
    disposables.push(arrowGeo, arrowMat);
    [-0.65, -0.32, 0, 0.32, 0.65].forEach((ax, idx) => {
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(ax, 0.008, 4.4 - Math.abs(idx - 2) * 0.45);
      scene.add(arrow);
    });

    // Pinsetter Back Hood + Glowing Arch + Mechanical Sweep Bar
    const hoodGeo = new THREE.BoxGeometry(3.4, 2.35, 1.9);
    const hoodMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      metalness: 0.65,
      roughness: 0.32,
    });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(0, 1.18, -11.4);

    const archBarGeo = new THREE.BoxGeometry(3.5, 0.18, 0.25);
    const archBarMat = new THREE.MeshStandardMaterial({
      color: '#7c3aed',
      emissive: '#a855f7',
      emissiveIntensity: 1.5,
    });
    const archBar = new THREE.Mesh(archBarGeo, archBarMat);
    archBar.position.set(0, 2.38, -10.45);

    const sweepGeo = new THREE.BoxGeometry(LANE_HALF_W * 2 + 0.1, 0.18, 0.12);
    const sweepMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.8,
      roughness: 0.25,
    });
    const sweepBar = new THREE.Mesh(sweepGeo, sweepMat);
    sweepBar.position.set(0, 1.45, -7.2);

    scene.add(hood, archBar, sweepBar);
    disposables.push(hoodGeo, hoodMat, archBarGeo, archBarMat, sweepGeo, sweepMat);

    // 10 USBC 3D Bowling Pins + Fresnel Rim Separation
    const pinMeshes = Array.from({ length: 10 }, () => {
      const p = createBowlingPinGroup();
      applyFresnelRimToGroup(p, { colorHex: '#e0f2fe', power: 3.2, intensity: 0.35 });
      scene.add(p);
      return p;
    });

    // PBR Marbled Bowling Ball (P1 Cyan / P2 Crimson swirl) + Fresnel + Ribbon + Shadow
    const ballTexP1 = createMarbledBallTexture('#0284c7', '#bae6fd', '#082f49');
    const ballTexP2 = createMarbledBallTexture('#e11d48', '#fecdd3', '#4c0519');
    disposables.push(ballTexP1, ballTexP2);
    const ballGeo = new THREE.SphereGeometry(0.24, 28, 22);
    const ballMat = new THREE.MeshPhysicalMaterial({
      map: ballTexP1,
      color: '#ffffff',
      roughness: 0.14,
      metalness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    applyFresnelRimShader(ballMat, { colorHex: '#38bdf8', power: 2.8, intensity: 0.5 });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = !isSoftwareGl;
    scene.add(ballMesh);

    const ballRibbon = create3dRibbonTrail(18, '#38bdf8', 0.28, { opacity: 0.72 });
    scene.add(ballRibbon.mesh);
    disposables.push(ballRibbon);

    const ballShadowGeo = new THREE.CircleGeometry(0.27, 16);
    const ballShadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.y = 0.01;
    scene.add(ballShadow);
    disposables.push(ballGeo, ballMat, ballShadowGeo, ballShadowMat);

    // Aim Curve Guide Line
    const guideCount = 20;
    const guidePositions = new Float32Array(guideCount * 3);
    const guideGeo = new THREE.BufferGeometry();
    guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePositions, 3));
    const guideMat = new THREE.LineBasicMaterial({ color: '#38bdf8' });
    const guideLine = new THREE.Line(guideGeo, guideMat);
    scene.add(guideLine);
    disposables.push(guideGeo, guideMat);

    // Animated Bowler Mascot (RobotExpressive.glb)
    const bowlerActor = spawnRigged3dActor(scene, 'assets/games/models/RobotExpressive.glb', {
      position: [-1.85, 0, 10.6],
      rotationY: Math.PI - 0.18,
      targetHeight: 1.95,
      defaultClips: ['Idle'],
      castShadow: !isSoftwareGl,
      primaryHex: '#0ea5e9',
      secondaryHex: '#facc15',
    });

    const burstSystem = create3dParticleBurstSystem(scene, 96);

    const initW = Math.max(320, host.clientWidth || 920);
    const initH = Math.max(200, host.clientHeight || Math.round((initW * 9) / 16));
    const composer = createProPostComposer(renderer, scene, camera, {
      width: initW,
      height: initH,
      isSoftwareGl,
      bloom: { strength: 0.3, radius: 0.45, threshold: 0.88 },
      bokeh: true,
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
      applyResponsiveCameraFov(camera, w / h, 44, 44, 64);
      composer?.setSize(w, h);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(host);

    let lastOutcomeSeq = simRef.current.outcomeSeq;
    let prevPhase: BowlingSimSnapshot['phase'] = simRef.current.phase;
    let lastTime = performance.now();
    const pacer = createThreeFramePacer(renderer, isSoftwareGl);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;

      const sim = simRef.current;

      if (prevPhase === 'aim' && sim.phase === 'roll') {
        bowlerActor.playClip(['Punch', 'Run'], 0.12, { loopOnce: true, returnTo: ['Idle'] });
      }
      prevPhase = sim.phase;

      // Sync Ball Marbled Texture & Transform
      const nextTex = sim.turnPlayer === 2 ? ballTexP2 : ballTexP1;
      if (ballMat.map !== nextTex) {
        ballMat.map = nextTex;
        ballMat.needsUpdate = true;
      }
      neonMat.emissive.set(sim.turnPlayer === 2 ? '#f43f5e' : '#38bdf8');
      const bw =
        sim.phase === 'aim'
          ? laneToWorld(sim.aimX, 0.06)
          : laneToWorld(sim.ball.x, sim.ball.y);
      const inGutter = sim.phase === 'roll' && Math.abs(sim.ball.x) > 0.86;
      const by = inGutter ? 0.16 : 0.24;
      ballMesh.position.set(bw.x, by, bw.z);
      ballMesh.rotation.x -= sim.phase === 'roll' ? dt * 16 : 0;
      ballMesh.rotation.z = sim.ball.rot * 0.25;
      ballShadow.position.set(bw.x, 0.01, bw.z);
      if (sim.phase === 'roll') {
        ballRibbon.push(bw.x, by, bw.z, camera.position, sim.turnPlayer === 2 ? '#fb7185' : '#38bdf8');
      } else {
        ballRibbon.reset();
      }

      // Smooth Pinsetter Sweep Bar during settle
      const sweepTargetY = sim.phase === 'settle' ? 0.22 : 1.55;
      const sweepTargetZ = sim.phase === 'settle' ? -9.5 : -7.2;
      sweepBar.position.y = THREE.MathUtils.damp(sweepBar.position.y, sweepTargetY, 7, dt);
      sweepBar.position.z = THREE.MathUtils.damp(sweepBar.position.z, sweepTargetZ, 5, dt);

      // Update 10 Pins
      sim.pins.forEach((pin, idx) => {
        const mesh = pinMeshes[idx];
        if (!mesh) return;
        const pw = laneToWorld(pin.x, pin.y);
        mesh.position.set(pw.x, pin.up ? 0 : 0.14, pw.z);
        if (pin.up) {
          mesh.rotation.set(0, 0, 0);
        } else {
          mesh.rotation.set(Math.PI * 0.44, pin.rot * 0.5, pin.rot);
        }
      });

      // Aim Curve Guide
      guideLine.visible = sim.phase === 'aim';
      if (sim.phase === 'aim') {
        guideMat.color.set(sim.turnPlayer === 2 ? '#fb7185' : '#38bdf8');
        const p0 = laneToWorld(sim.aimX, 0.08);
        const p1 = laneToWorld(sim.aimX + sim.spin * 0.34, 0.88);
        const midX = (p0.x + p1.x) * 0.5 - sim.spin * 0.65;
        const midZ = (p0.z + p1.z) * 0.5;
        const attr = guideGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < guideCount; i += 1) {
          const t = i / (guideCount - 1);
          const inv = 1 - t;
          const gx = inv * inv * p0.x + 2 * inv * t * midX + t * t * p1.x;
          const gz = inv * inv * p0.z + 2 * inv * t * midZ + t * t * p1.z;
          attr.setXYZ(i, gx, 0.04, gz);
        }
        attr.needsUpdate = true;
      }

      // Trigger Celebrate / Particle Bursts on Pin Impact or Strike
      if (sim.outcomeSeq !== lastOutcomeSeq) {
        lastOutcomeSeq = sim.outcomeSeq;
        if (sim.outcomeKind === 'strike') {
          burstSystem.emit(0, 0.8, PIN_DECK_Z, 0xfacc15, 42, 6.2);
          bowlerActor.playClip(['Dance', 'Jump', 'ThumbsUp'], 0.16, {
            loopOnce: true,
            returnTo: ['Idle'],
          });
        } else if (sim.outcomeKind === 'spare') {
          burstSystem.emit(0, 0.7, PIN_DECK_Z, 0x38bdf8, 28, 4.8);
          bowlerActor.playClip(['ThumbsUp', 'Wave'], 0.16, {
            loopOnce: true,
            returnTo: ['Idle'],
          });
        } else if (sim.outcomeKind === 'hit') {
          burstSystem.emit(0, 0.6, PIN_DECK_Z, 0xa855f7, 16, 3.6);
        }
      }

      // Dynamic Smooth Follow-Cam toward Pin Deck during Roll
      const followZ = sim.phase === 'roll' ? Math.min(1, Math.max(0, sim.ball.y)) : 0;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, bw.x * 0.22, 6, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 3.25 - followZ * 0.85, 6, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, 13.6 - followZ * 7.2, 6, dt);
      camera.lookAt(0, 0.58, -3.5 - followZ * 4.5);

      drs.sample(dt);
      bowlerActor.update(dt);
      burstSystem.update(dt);
      composer?.setDofActive(sim.phase === 'settle' && (sim.outcomeKind === 'strike' || sim.outcomeKind === 'spare'), 11.5);
      if (composer) composer.render();
      else renderer.render(scene, camera);

      pacer.schedule(tick);
    };

    pacer.schedule(tick);

    return () => {
      pacer.cancel();
      ro.disconnect();
      bowlerActor.dispose();
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
      className="w-full aspect-video bg-[#070a18] overflow-hidden"
    />
  );
};
