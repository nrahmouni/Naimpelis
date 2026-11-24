import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyPolyHavenHdri, createSkyDomeTexture, createThreeFramePacer } from '../arcade/threeProHelpers';
import {
  createDrsController,
  createProPostComposer,
  type ProPostComposerHandle,
} from '../arcade/threePostFxHelpers';
import { buildFormulaGtCar, type BuiltCarRig } from './racingCarBuilder';
import { buildGpCircuitScene } from './racingTrackBuilder';
import { RacingSoundEngine } from './racingAudio';
import { createRacing2dFallbackEngine } from './racing2dFallback';
import {
  RIVAL_LIVERIES,
  TOTAL_RACE_LAPS,
  TRACK_BARRIER_HALF_WIDTH,
  TRACK_HALF_WIDTH,
  type RacingCameraMode,
  type RacingEngineCallbacks,
  type RacingEngineHandle,
  type RacingGyroControlState,
} from './racingTypes';

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
}

interface AiRivalState {
  rig: BuiltCarRig;
  s: number;
  lateral: number;
  targetLateral: number;
  speedMps: number;
  basePace: number;
  lap: number;
  lastS: number;
  passedHalf: boolean;
  wheelAngle: number;
}

// Pre-allocated scratch math objects (zero GC churn inside animation loop)
const _vPos = new THREE.Vector3();
const _vTan = new THREE.Vector3();
const _vNorm = new THREE.Vector3();
const _vCamTarget = new THREE.Vector3();
const _vCamLook = new THREE.Vector3();
const _vMatDummy = new THREE.Object3D();
const _qDesired = new THREE.Quaternion();
const _mRot = new THREE.Matrix4();
const _vUp = new THREE.Vector3(0, 1, 0);

function detectSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe/i.test(rendererStr);
  } catch {
    return false;
  }
}

function createResilientWebGlRenderer(): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    try {
      return new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      return null;
    }
  }
}

export function createRacing3dEngine(
  container: HTMLElement,
  callbacks: RacingEngineCallbacks = {}
): RacingEngineHandle {
  const maybeRenderer = createResilientWebGlRenderer();
  if (!maybeRenderer) {
    return createRacing2dFallbackEngine(container, callbacks);
  }
  const renderer = maybeRenderer;
  const isSoftwareGl = detectSoftwareGl(renderer);
  const dpr = Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(
    Math.max(1, container.clientWidth || window.innerWidth || 1280),
    Math.max(1, container.clientHeight || window.innerHeight || 720)
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  if (!isSoftwareGl) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const skyDomeTex = createSkyDomeTexture({
    topHex: '#070e22',
    midHex: '#18305b',
    horizonHex: '#c26d38',
    sunGlowHex: 'rgba(251, 191, 36, 0.45)',
    stars: true,
  });
  const scene = new THREE.Scene();
  scene.background = skyDomeTex;
  scene.fog = new THREE.FogExp2(0x0b152a, 0.0024);

  let pmrem: THREE.PMREMGenerator | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    envScene.dispose();
  } catch {
    // Older WebGL1 Smart TV GPUs can fail compiling PMREM shaders; directional/hemi lights still illuminate cleanly
    envTarget?.dispose();
    pmrem?.dispose();
    envTarget = null;
    pmrem = null;
  }

  // Upgrade to photorealistic Poly Haven 1K dusk HDRI reflections (keep crisp skyDomeTex as background to avoid white HDR sky bloom)
  const hdriHandle = applyPolyHavenHdri(
    scene,
    renderer,
    'assets/games/hdri/evening_road_01_1k.hdr',
    isSoftwareGl,
    { setBackground: false, envIntensity: 0.42 }
  );

  const camera = new THREE.PerspectiveCamera(
    60,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.25,
    800
  );
  const cameraP2 = new THREE.PerspectiveCamera(
    60,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.25,
    800
  );

  // Lighting rig (balanced twilight motorsport contrast with natural green turf)
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1a2e1a, 0.54);
  const keyLight = new THREE.DirectionalLight(0xfff4dc, 1.42);
  keyLight.position.set(110, 140, 80);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 20;
    keyLight.shadow.camera.far = 420;
    keyLight.shadow.camera.left = -220;
    keyLight.shadow.camera.right = 220;
    keyLight.shadow.camera.top = 220;
    keyLight.shadow.camera.bottom = -220;
  }
  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.34);
  rimLight.position.set(-90, 45, -110);
  scene.add(hemiLight, keyLight, rimLight);

  const circuit = buildGpCircuitScene(scene, isSoftwareGl);
  const audio = new RacingSoundEngine();

  // GPU Post-Processing (MSAA + SMAA + SpeedRadial + Finish Bokeh + restrained HDR Bloom) + Dynamic Resolution Scaling
  const w0 = Math.max(1, container.clientWidth || window.innerWidth || 1280);
  const h0 = Math.max(1, container.clientHeight || window.innerHeight || 720);
  const composer: ProPostComposerHandle | null = createProPostComposer(renderer, scene, camera, {
    width: w0,
    height: h0,
    isSoftwareGl,
    bloom: { strength: 0.14, radius: 0.22, threshold: 1.28 },
    speedRadial: true,
    bokeh: true,
    smaa: true,
  });
  const drs = createDrsController(renderer, {
    minRatio: 0.75,
    maxRatio: dpr,
    isSoftwareGl,
    onScaleChange: () => {
      const cw = Math.max(1, container.clientWidth || window.innerWidth || 1280);
      const ch = Math.max(1, container.clientHeight || window.innerHeight || 720);
      composer?.setSize(cw, ch);
    },
  });

  // Player + 3 AI Rivals
  const playerCar = buildFormulaGtCar(RIVAL_LIVERIES[0].primary, RIVAL_LIVERIES[0].accent, {
    castShadow: !isSoftwareGl,
    isPlayer: true,
  });
  scene.add(playerCar.root);

  const rivals: AiRivalState[] = [1, 2, 3].map((idx) => {
    const livery = RIVAL_LIVERIES[idx];
    const rig = buildFormulaGtCar(livery.primary, livery.accent, {
      castShadow: !isSoftwareGl,
      isPlayer: false,
      rivalIndex: idx,
    });
    scene.add(rig.root);
    return {
      rig,
      s: 0,
      lateral: idx % 2 === 0 ? -3.2 : 3.2,
      targetLateral: idx % 2 === 0 ? -2.8 : 2.8,
      speedMps: 0,
      basePace: idx === 1 ? 68 : idx === 2 ? 64 : 60,
      lap: 1,
      lastS: 0,
      passedHalf: false,
      wheelAngle: 0,
    };
  });

  // Pre-allocated Tire Smoke & Nitro Spark Pool
  const PARTICLE_COUNT = 48;
  const particleGeo = new THREE.SphereGeometry(0.24, 6, 6);
  const particleMat = new THREE.MeshBasicMaterial({
    color: 0xcbd5e1,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_COUNT);
  scene.add(particleMesh);
  const particles: ParticleSlot[] = Array.from({ length: PARTICLE_COUNT }, () => ({
    active: false,
    life: 0,
    maxLife: 0.45,
    x: 0,
    y: -50,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    scale: 0.01,
  }));
  let particleCursor = 0;

  function spawnParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const slot = particles[particleCursor];
    particleCursor = (particleCursor + 1) % PARTICLE_COUNT;
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.38 + Math.random() * 0.22;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.scale = 0.7 + Math.random() * 0.7;
  }

  // Mutable simulation state
  let destroyed = false;
  let contextLost = false;
  let cameraMode: RacingCameraMode = 'chase';
  let lastTelemetryEmitMs = 0;

  // Player vehicle physics state
  let px = 0;
  let pz = 0;
  let heading = 0; // radians: sin(heading), cos(heading) = forward direction
  let speedMps = 0;
  let steerVisual = 0;
  let bodyRoll = 0;
  let bodyPitch = 0;
  let wheelSpinAngle = 0;
  let trackHintIdx = 0;
  let nitroPct = 100;
  let padBoostTimer = 0;
  let collisionFlash = 0;
  let playerS = 0;
  let playerLastS = 0;
  let playerPassedHalf = false;
  let playerLap = 1;
  let raceState: 'countdown' | 'racing' | 'finished' = 'countdown';
  let countdownTimer = 3.2;
  let lastBeepStep = 4;
  let raceElapsedMs = 0;
  let currentLapStartMs = 0;
  let bestLapMs = 0;
  let lastCycleCameraToggle = false;
  let lastHornToggle = false;

  // Player 2 (slot 2 phone) physics driving rivals[0]
  let p2Connected = false;
  let px2 = 0;
  let pz2 = 0;
  let heading2 = 0;
  let speedMps2 = 0;
  let steerVisual2 = 0;
  let bodyRoll2 = 0;
  let bodyPitch2 = 0;
  let wheelSpinAngle2 = 0;
  let trackHintIdx2 = 0;
  let nitroPct2 = 100;
  let padBoostTimer2 = 0;
  let collisionFlash2 = 0;
  let cameraMode2: RacingCameraMode = 'chase';
  let lastCycleCameraToggle2 = false;
  let splitScreenActive = false;

  // Input channels (keyboard + remote mobile gyro)
  const keysState = {
    left: false,
    right: false,
    up: false,
    down: false,
    nitro: false,
    handbrake: false,
  };

  const gyroState: RacingGyroControlState & { expiresAt: number } = {
    steer: 0,
    throttle: 0,
    brake: 0,
    nitro: false,
    handbrake: false,
    expiresAt: 0,
  };

  const p2GyroState: RacingGyroControlState & { expiresAt: number } = {
    steer: 0,
    throttle: 0,
    brake: 0,
    nitro: false,
    handbrake: false,
    expiresAt: 0,
  };

  function placeGridStart() {
    // Player starts P4 on clean tarmac behind rivals
    const startOffsets = [0.992, 0.995, 0.997, 0.99];
    const lateralOffsets = [-3.0, 3.0, -3.0, 3.0];

    // Position player at s = 0.99
    circuit.sampleAtS(startOffsets[3], _vPos, _vTan, _vNorm);
    px = _vPos.x + _vNorm.x * lateralOffsets[3];
    pz = _vPos.z + _vNorm.z * lateralOffsets[3];
    heading = Math.atan2(_vTan.x, _vTan.z);
    speedMps = 0;
    steerVisual = 0;
    bodyRoll = 0;
    bodyPitch = 0;
    nitroPct = 100;
    padBoostTimer = 0;
    collisionFlash = 0;
    playerS = startOffsets[3];
    playerLastS = startOffsets[3];
    playerPassedHalf = false;
    playerLap = 1;
    raceState = 'countdown';
    countdownTimer = 3.2;
    lastBeepStep = 4;
    raceElapsedMs = 0;
    currentLapStartMs = 0;
    bestLapMs = 0;
    trackHintIdx = Math.floor(startOffsets[3] * circuit.samples.length);

    playerCar.root.position.set(px, 0, pz);
    playerCar.root.rotation.set(0, heading + Math.PI, 0);

    rivals.forEach((rival, idx) => {
      rival.s = startOffsets[idx];
      rival.lastS = startOffsets[idx];
      rival.passedHalf = false;
      rival.lap = 1;
      rival.lateral = lateralOffsets[idx];
      rival.targetLateral = lateralOffsets[idx];
      rival.speedMps = 0;
      circuit.sampleAtS(rival.s, _vPos, _vTan, _vNorm);
      rival.rig.root.position.set(
        _vPos.x + _vNorm.x * rival.lateral,
        0,
        _vPos.z + _vNorm.z * rival.lateral
      );
      rival.rig.root.rotation.set(0, Math.atan2(_vTan.x, _vTan.z) + Math.PI, 0);
      if (idx === 0) {
        px2 = _vPos.x + _vNorm.x * rival.lateral;
        pz2 = _vPos.z + _vNorm.z * rival.lateral;
        heading2 = Math.atan2(_vTan.x, _vTan.z);
        speedMps2 = 0;
        steerVisual2 = 0;
        bodyRoll2 = 0;
        bodyPitch2 = 0;
        nitroPct2 = 100;
        padBoostTimer2 = 0;
        collisionFlash2 = 0;
        trackHintIdx2 = Math.floor(startOffsets[0] * circuit.samples.length);
      }
    });

    // Snap cameras behind P1 & P2 immediately
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    camera.position.set(px - fwdX * 10.5, 4.4, pz - fwdZ * 10.5);
    camera.lookAt(px + fwdX * 12, 1.4, pz + fwdZ * 12);

    const fwdX2 = Math.sin(heading2);
    const fwdZ2 = Math.cos(heading2);
    cameraP2.position.set(px2 - fwdX2 * 10.5, 4.4, pz2 - fwdZ2 * 10.5);
    cameraP2.lookAt(px2 + fwdX2 * 12, 1.4, pz2 + fwdZ2 * 12);
  }

  placeGridStart();

  const clock = new THREE.Clock();

  function stepSimulation(dt: number, nowMs: number) {
    // 1. Countdown logic
    if (raceState === 'countdown') {
      countdownTimer -= dt;
      const step = Math.ceil(countdownTimer);
      if (step < lastBeepStep && step >= 1 && step <= 3) {
        lastBeepStep = step;
        audio.playCountdownBeep(false);
      }
      if (countdownTimer <= 0) {
        raceState = 'racing';
        audio.playCountdownBeep(true);
      }
    } else if (raceState === 'racing') {
      raceElapsedMs += dt * 1000;
    }

    // 2. Merge keyboard + active gyro inputs
    const gyroActive = nowMs < gyroState.expiresAt;
    let steerInput = (keysState.left ? 1 : 0) - (keysState.right ? 1 : 0);
    let throttleInput = keysState.up ? 1 : 0;
    let brakeInput = keysState.down ? 1 : 0;
    let nitroWanted = keysState.nitro;
    let handbrakeWanted = keysState.handbrake;

    if (gyroActive) {
      // gyroState.steer: -1 left, +1 right -> positive yaw turns left (+heading in Three.js XZ right-handed)
      const gyroSteer = -gyroState.steer;
      if (Math.abs(gyroSteer) > 0.01 || steerInput === 0) {
        steerInput = Math.max(-1, Math.min(1, gyroSteer + steerInput * 0.5));
      }
      throttleInput = Math.max(throttleInput, gyroState.throttle);
      brakeInput = Math.max(brakeInput, gyroState.brake);
      nitroWanted = nitroWanted || gyroState.nitro;
      handbrakeWanted = handbrakeWanted || gyroState.handbrake;
    }

    if (raceState === 'countdown') {
      throttleInput = 0;
      brakeInput = 0;
      nitroWanted = false;
    } else if (raceState === 'finished') {
      throttleInput = 0.25; // Victory cruise
      brakeInput = 0;
      nitroWanted = false;
    }

    // 3. Projection & track surface check
    const projected = circuit.projectOntoTrack(px, pz, trackHintIdx);
    trackHintIdx = projected.sampleIndex;
    const proj = projected.proj;
    const absLat = Math.abs(proj.distFromCenter);
    const offroad = absLat > TRACK_HALF_WIDTH;

    // Check nitro boost pads
    for (const pad of circuit.boostPads) {
      const ds = Math.abs(((proj.s - pad.s + 1.5) % 1) - 0.5);
      if (ds < 0.012 && Math.abs(proj.distFromCenter - pad.lateralOffset) < 2.8) {
        padBoostTimer = 0.9;
        nitroPct = Math.min(100, nitroPct + 18);
      }
    }

    padBoostTimer = Math.max(0, padBoostTimer - dt);
    const nitroUsing = raceState === 'racing' && nitroWanted && nitroPct > 2;
    if (nitroUsing) {
      nitroPct = Math.max(0, nitroPct - 28 * dt);
    } else {
      nitroPct = Math.min(100, nitroPct + (offroad ? 4 : 9.5) * dt);
    }
    const boosting = nitroUsing || padBoostTimer > 0;

    // 4. Longitudinal & lateral vehicle dynamics
    const topSpeed = offroad ? 46 : boosting ? 96 : 78; // ~280-345 km/h scale
    const accel = boosting ? 54 : 34;
    if (throttleInput > 0) {
      speedMps += throttleInput * accel * dt;
    }
    if (brakeInput > 0) {
      if (speedMps > 2) speedMps -= brakeInput * 48 * dt;
      else speedMps -= brakeInput * 18 * dt;
    }

    // Aerodynamic drag + rolling resistance
    const dragFactor = offroad ? 2.1 : 0.48;
    speedMps -= speedMps * dragFactor * dt;
    if (throttleInput === 0 && brakeInput === 0 && Math.abs(speedMps) < 0.6) {
      speedMps = 0;
    }
    speedMps = Math.max(-18, Math.min(topSpeed, speedMps));

    // Steering angular velocity scaled smoothly by speed
    const speedRatio = Math.min(1, Math.abs(speedMps) / 22);
    const driftMultiplier = handbrakeWanted ? 1.48 : 1.0;
    const dirSign = speedMps >= -0.5 ? 1 : -1;
    const steerRate = 2.05 * driftMultiplier * (0.28 + 0.72 * speedRatio);
    heading += steerInput * steerRate * dirSign * dt;

    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    px += fwdX * speedMps * dt;
    pz += fwdZ * speedMps * dt;

    // Soft guardrail containment (never traps the player)
    const afterProj = circuit.projectOntoTrack(px, pz, trackHintIdx);
    const pAfter = afterProj.proj;
    if (Math.abs(pAfter.distFromCenter) > TRACK_BARRIER_HALF_WIDTH) {
      const sign = Math.sign(pAfter.distFromCenter);
      px = pAfter.closestX + pAfter.normalX * sign * TRACK_BARRIER_HALF_WIDTH;
      pz = pAfter.closestZ + pAfter.normalZ * sign * TRACK_BARRIER_HALF_WIDTH;
      if (Math.abs(speedMps) > 15) {
        collisionFlash = Math.min(1, Math.abs(speedMps) / 70);
        audio.playImpact(collisionFlash);
      }
      speedMps *= 0.78;
      // Nudge heading gently toward track tangent
      const trackYaw = Math.atan2(pAfter.tangentX, pAfter.tangentZ);
      const diff = Math.atan2(Math.sin(trackYaw - heading), Math.cos(trackYaw - heading));
      heading += diff * 0.28;
    } else {
      collisionFlash = Math.max(0, collisionFlash - dt * 3.5);
    }

    // 5. Lap progression with anti-cheat half-lap sector
    playerLastS = playerS;
    playerS = pAfter.s;
    if (playerS > 0.4 && playerS < 0.65) {
      playerPassedHalf = true;
    }
    if (playerLastS > 0.85 && playerS < 0.15 && playerPassedHalf && raceState === 'racing') {
      playerPassedHalf = false;
      const lapDuration = raceElapsedMs - currentLapStartMs;
      if (lapDuration > 5000 && (bestLapMs === 0 || lapDuration < bestLapMs)) {
        bestLapMs = lapDuration;
      }
      currentLapStartMs = raceElapsedMs;
      if (playerLap < TOTAL_RACE_LAPS) {
        playerLap += 1;
        audio.playLapChime(false);
      } else {
        raceState = 'finished';
        audio.playLapChime(true);
        const pos = computePlayerPosition();
        callbacks.onFinish?.({
          position: pos,
          totalTimeMs: Math.round(raceElapsedMs),
          bestLapMs: Math.round(bestLapMs || lapDuration),
        });
      }
    }

    // 6. Visual car body animation (roll, pitch, steering wheels, nitro flames, brake lights)
    steerVisual = THREE.MathUtils.damp(steerVisual, steerInput * 0.44, 12, dt);
    const targetRoll = -steerInput * Math.min(1, Math.abs(speedMps) / 45) * 0.085;
    const targetPitch =
      (throttleInput * (boosting ? 0.05 : 0.025) - brakeInput * 0.045) *
      (speedMps > 2 ? 1 : 0);
    bodyRoll = THREE.MathUtils.damp(bodyRoll, targetRoll, 10, dt);
    bodyPitch = THREE.MathUtils.damp(bodyPitch, targetPitch, 10, dt);

    playerCar.root.position.set(px, 0, pz);
    playerCar.root.rotation.set(0, heading + Math.PI, 0);
    playerCar.bodyGroup.rotation.z = bodyRoll;
    playerCar.bodyGroup.rotation.x = bodyPitch;

    playerCar.frontWheelPivots[0].rotation.y = steerVisual;
    playerCar.frontWheelPivots[1].rotation.y = steerVisual;
    wheelSpinAngle -= speedMps * dt * 2.4;
    for (const w of playerCar.wheelSpinGroups) {
      w.rotation.x = wheelSpinAngle;
    }
    for (const rw of playerCar.realWheelSpins) {
      rw.obj.rotation.x = rw.baseRotX + wheelSpinAngle;
    }
    for (const rfs of playerCar.realFrontSteerNodes) {
      rfs.obj.rotation.z = rfs.baseRotZ - steerVisual * 0.65;
    }

    playerCar.brakeLightMaterial.emissiveIntensity = brakeInput > 0.1 ? 3.2 : 0.9;
    const showFlames = boosting && speedMps > 8;
    playerCar.nitroFlames[0].visible = showFlames;
    playerCar.nitroFlames[1].visible = showFlames;
    if (showFlames) {
      const flicker = 0.8 + Math.random() * 0.55;
      playerCar.nitroFlames[0].scale.set(1, 1, flicker);
      playerCar.nitroFlames[1].scale.set(1, 1, flicker);
    }

    // Emit drift smoke / nitro sparks & persistent asphalt tire skidmarks
    const driftIntensity =
      Math.abs(speedMps) > 22
        ? Math.min(1, Math.abs(steerInput) * (handbrakeWanted ? 1.0 : 0.45))
        : 0;
    if ((driftIntensity > 0.32 || brakeInput > 0.65) && !offroad && Math.abs(speedMps) > 16) {
      const sideX = Math.cos(heading);
      const sideZ = -Math.sin(heading);
      circuit.addSkidMark(px - fwdX * 1.4 - sideX * 0.9, pz - fwdZ * 1.4 - sideZ * 0.9, heading, 0.85);
      circuit.addSkidMark(px - fwdX * 1.4 + sideX * 0.9, pz - fwdZ * 1.4 + sideZ * 0.9, heading, 0.85);
    }
    if ((driftIntensity > 0.35 || offroad) && Math.abs(speedMps) > 12 && Math.random() < 0.65) {
      spawnParticle(
        px - fwdX * 1.6 + (Math.random() - 0.5) * 1.4,
        0.22,
        pz - fwdZ * 1.6 + (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 2.2,
        1.1 + Math.random() * 1.4,
        (Math.random() - 0.5) * 2.2
      );
    }

    // 7. Update P2 (on rivals[0] when split-screen active) + AI rivals
    const p2Driving = p2Connected || nowMs < p2GyroState.expiresAt;
    splitScreenActive = p2Driving;

    if (p2Driving && rivals.length > 0) {
      const r0 = rivals[0];
      let p2Steer = nowMs < p2GyroState.expiresAt ? -p2GyroState.steer : 0;
      let p2Throttle = nowMs < p2GyroState.expiresAt ? p2GyroState.throttle : 0;
      let p2Brake = nowMs < p2GyroState.expiresAt ? p2GyroState.brake : 0;
      let p2NitroWanted = nowMs < p2GyroState.expiresAt && p2GyroState.nitro;
      const p2Handbrake = nowMs < p2GyroState.expiresAt && p2GyroState.handbrake;

      if (raceState === 'countdown') {
        p2Throttle = 0;
        p2Brake = 0;
        p2NitroWanted = false;
      } else if (raceState === 'finished') {
        p2Throttle = 0.25;
        p2Brake = 0;
        p2NitroWanted = false;
      }

      const proj2Info = circuit.projectOntoTrack(px2, pz2, trackHintIdx2);
      trackHintIdx2 = proj2Info.sampleIndex;
      const p2Proj = proj2Info.proj;
      const offroad2 = Math.abs(p2Proj.distFromCenter) > TRACK_HALF_WIDTH;

      for (const pad of circuit.boostPads) {
        const ds = Math.abs(((p2Proj.s - pad.s + 1.5) % 1) - 0.5);
        if (ds < 0.012 && Math.abs(p2Proj.distFromCenter - pad.lateralOffset) < 2.8) {
          padBoostTimer2 = 0.9;
          nitroPct2 = Math.min(100, nitroPct2 + 18);
        }
      }

      padBoostTimer2 = Math.max(0, padBoostTimer2 - dt);
      const nitroUsing2 = raceState === 'racing' && p2NitroWanted && nitroPct2 > 2;
      if (nitroUsing2) nitroPct2 = Math.max(0, nitroPct2 - 28 * dt);
      else nitroPct2 = Math.min(100, nitroPct2 + (offroad2 ? 4 : 9.5) * dt);
      const boosting2 = nitroUsing2 || padBoostTimer2 > 0;

      const topSpeed2 = offroad2 ? 46 : boosting2 ? 96 : 78;
      const accel2 = boosting2 ? 54 : 34;
      if (p2Throttle > 0) speedMps2 += p2Throttle * accel2 * dt;
      if (p2Brake > 0) {
        if (speedMps2 > 2) speedMps2 -= p2Brake * 48 * dt;
        else speedMps2 -= p2Brake * 18 * dt;
      }
      speedMps2 -= speedMps2 * (offroad2 ? 2.1 : 0.48) * dt;
      if (p2Throttle === 0 && p2Brake === 0 && Math.abs(speedMps2) < 0.6) speedMps2 = 0;
      speedMps2 = Math.max(-18, Math.min(topSpeed2, speedMps2));

      const speedRatio2 = Math.min(1, Math.abs(speedMps2) / 22);
      const dirSign2 = speedMps2 >= -0.5 ? 1 : -1;
      const steerRate2 = 2.05 * (p2Handbrake ? 1.48 : 1.0) * (0.28 + 0.72 * speedRatio2);
      heading2 += p2Steer * steerRate2 * dirSign2 * dt;

      const fwdX2 = Math.sin(heading2);
      const fwdZ2 = Math.cos(heading2);
      px2 += fwdX2 * speedMps2 * dt;
      pz2 += fwdZ2 * speedMps2 * dt;

      const after2 = circuit.projectOntoTrack(px2, pz2, trackHintIdx2).proj;
      if (Math.abs(after2.distFromCenter) > TRACK_BARRIER_HALF_WIDTH) {
        const sign2 = Math.sign(after2.distFromCenter);
        px2 = after2.closestX + after2.normalX * sign2 * TRACK_BARRIER_HALF_WIDTH;
        pz2 = after2.closestZ + after2.normalZ * sign2 * TRACK_BARRIER_HALF_WIDTH;
        if (Math.abs(speedMps2) > 15) {
          collisionFlash2 = Math.min(1, Math.abs(speedMps2) / 70);
          audio.playImpact(collisionFlash2 * 0.7);
        }
        speedMps2 *= 0.78;
        const trackYaw2 = Math.atan2(after2.tangentX, after2.tangentZ);
        const diff2 = Math.atan2(Math.sin(trackYaw2 - heading2), Math.cos(trackYaw2 - heading2));
        heading2 += diff2 * 0.28;
      } else {
        collisionFlash2 = Math.max(0, collisionFlash2 - dt * 3.5);
      }

      r0.lastS = r0.s;
      r0.s = after2.s;
      r0.lateral = after2.distFromCenter;
      r0.speedMps = speedMps2;
      if (r0.s > 0.4 && r0.s < 0.65) r0.passedHalf = true;
      if (r0.lastS > 0.85 && r0.s < 0.15 && r0.passedHalf && raceState === 'racing') {
        r0.passedHalf = false;
        if (r0.lap < TOTAL_RACE_LAPS) {
          r0.lap += 1;
          audio.playLapChime(false);
        } else {
          raceState = 'finished';
          audio.playLapChime(true);
          callbacks.onFinish?.({
            position: 1,
            totalTimeMs: Math.round(raceElapsedMs),
            bestLapMs: Math.round(bestLapMs || raceElapsedMs),
            winnerSlot: 2,
          });
        }
      }

      steerVisual2 = THREE.MathUtils.damp(steerVisual2, p2Steer * 0.44, 12, dt);
      bodyRoll2 = THREE.MathUtils.damp(bodyRoll2, -p2Steer * Math.min(1, Math.abs(speedMps2) / 45) * 0.085, 10, dt);
      bodyPitch2 = THREE.MathUtils.damp(
        bodyPitch2,
        (p2Throttle * (boosting2 ? 0.05 : 0.025) - p2Brake * 0.045) * (speedMps2 > 2 ? 1 : 0),
        10,
        dt
      );
      r0.rig.root.position.set(px2, 0, pz2);
      r0.rig.root.rotation.set(0, heading2 + Math.PI, 0);
      r0.rig.bodyGroup.rotation.z = bodyRoll2;
      r0.rig.bodyGroup.rotation.x = bodyPitch2;
      r0.rig.frontWheelPivots[0].rotation.y = steerVisual2;
      r0.rig.frontWheelPivots[1].rotation.y = steerVisual2;
      wheelSpinAngle2 -= speedMps2 * dt * 2.4;
      for (const w of r0.rig.wheelSpinGroups) w.rotation.x = wheelSpinAngle2;
      for (const rw of r0.rig.realWheelSpins) rw.obj.rotation.x = rw.baseRotX + wheelSpinAngle2;
      for (const rfs of r0.rig.realFrontSteerNodes) rfs.obj.rotation.z = rfs.baseRotZ - steerVisual2 * 0.65;
      r0.rig.brakeLightMaterial.emissiveIntensity = p2Brake > 0.1 ? 3.2 : 0.9;
      const showFlames2 = boosting2 && speedMps2 > 8;
      r0.rig.nitroFlames[0].visible = showFlames2;
      r0.rig.nitroFlames[1].visible = showFlames2;

      // Update P2 Chase Camera
      if (cameraMode2 === 'hood') {
        _vCamTarget.set(px2 + fwdX2 * 0.45, 1.38, pz2 + fwdZ2 * 0.45);
        _vCamLook.set(px2 + fwdX2 * 32, 1.15, pz2 + fwdZ2 * 32);
        cameraP2.position.lerp(_vCamTarget, 0.72);
      } else {
        const backDist2 = cameraMode2 === 'far' ? 12.6 : 8.4;
        const height2 = cameraMode2 === 'far' ? 4.8 : 3.25;
        const lookAhead2 = cameraMode2 === 'far' ? 14 : 11;
        _vCamTarget.set(px2 - fwdX2 * backDist2, height2, pz2 - fwdZ2 * backDist2);
        _vCamLook.set(px2 + fwdX2 * lookAhead2, 1.25, pz2 + fwdZ2 * lookAhead2);
        cameraP2.position.x = THREE.MathUtils.damp(cameraP2.position.x, _vCamTarget.x, 7.2, dt);
        cameraP2.position.y = THREE.MathUtils.damp(cameraP2.position.y, _vCamTarget.y, 7.2, dt);
        cameraP2.position.z = THREE.MathUtils.damp(cameraP2.position.z, _vCamTarget.z, 7.2, dt);
      }
      _mRot.lookAt(cameraP2.position, _vCamLook, _vUp);
      _qDesired.setFromRotationMatrix(_mRot);
      cameraP2.quaternion.slerp(_qDesired, cameraMode2 === 'hood' ? 0.55 : 0.22);
      const speedKmh2 = Math.max(0, Math.round(Math.abs(speedMps2) * 3.6));
      const targetFov2 = 58 + Math.min(20, (speedKmh2 / 330) * 18) + (boosting2 ? 4 : 0);
      if (Math.abs(cameraP2.fov - targetFov2) > 0.1) {
        cameraP2.fov = THREE.MathUtils.damp(cameraP2.fov, targetFov2, 6, dt);
        cameraP2.updateProjectionMatrix();
      }
    }

    for (let i = p2Driving ? 1 : 0; i < rivals.length; i += 1) {
      const r = rivals[i];
      if (raceState !== 'countdown') {
        const playerProgress = playerLap + playerS;
        const rivalProgress = r.lap + r.s;
        const gap = playerProgress - rivalProgress;
        const rubberBand = THREE.MathUtils.clamp(gap * 12, -8, 12);
        const targetSpeed = Math.max(46, r.basePace + rubberBand);
        r.speedMps = THREE.MathUtils.damp(r.speedMps, targetSpeed, 1.8, dt);

        r.lastS = r.s;
        r.s = (r.s + (r.speedMps * dt) / circuit.totalLength) % 1;
        if (r.s > 0.4 && r.s < 0.65) r.passedHalf = true;
        if (r.lastS > 0.85 && r.s < 0.15 && r.passedHalf) {
          r.passedHalf = false;
          r.lap += 1;
        }
        if (Math.random() < 0.012) {
          r.targetLateral = (Math.random() - 0.5) * (TRACK_HALF_WIDTH * 1.2);
        }
        r.lateral = THREE.MathUtils.damp(r.lateral, r.targetLateral, 1.6, dt);
      }

      circuit.sampleAtS(r.s, _vPos, _vTan, _vNorm);
      const rx = _vPos.x + _vNorm.x * r.lateral;
      const rz = _vPos.z + _vNorm.z * r.lateral;
      r.rig.root.position.set(rx, 0, rz);
      r.rig.root.rotation.set(0, Math.atan2(_vTan.x, _vTan.z) + Math.PI, 0);
      r.wheelAngle -= r.speedMps * dt * 2.4;
      for (const w of r.rig.wheelSpinGroups) {
        w.rotation.x = r.wheelAngle;
      }
      for (const rw of r.rig.realWheelSpins) {
        rw.obj.rotation.x = rw.baseRotX + r.wheelAngle;
      }

      if (i === 0) {
        px2 = rx;
        pz2 = rz;
        heading2 = Math.atan2(_vTan.x, _vTan.z);
        speedMps2 = r.speedMps;
      }

      // Car-to-P2 collision if split screen active
      if (p2Driving) {
        const dx2 = px2 - rx;
        const dz2 = pz2 - rz;
        const dSq2 = dx2 * dx2 + dz2 * dz2;
        if (dSq2 > 0.001 && dSq2 < 2.95 * 2.95) {
          const dist2 = Math.sqrt(dSq2);
          const push2 = (2.95 - dist2) * 0.65;
          px2 += (dx2 / dist2) * push2;
          pz2 += (dz2 / dist2) * push2;
          speedMps2 *= 0.86;
          collisionFlash2 = 0.65;
        }
      }

      // Car-to-player collision check
      const dx = px - rx;
      const dz = pz - rz;
      const distSq = dx * dx + dz * dz;
      const minSep = 2.95;
      if (distSq > 0.001 && distSq < minSep * minSep) {
        const dist = Math.sqrt(distSq);
        const push = (minSep - dist) * 0.65;
        px += (dx / dist) * push;
        pz += (dz / dist) * push;
        speedMps *= 0.86;
        collisionFlash = 0.65;
        audio.playImpact(0.6);
      }
    }

    // P1-to-P2 direct collision check when split-screen active
    if (p2Driving && rivals.length > 0) {
      const dx12 = px - px2;
      const dz12 = pz - pz2;
      const dSq12 = dx12 * dx12 + dz12 * dz12;
      if (dSq12 > 0.001 && dSq12 < 2.95 * 2.95) {
        const dist12 = Math.sqrt(dSq12);
        const halfPush = (2.95 - dist12) * 0.45;
        px += (dx12 / dist12) * halfPush;
        pz += (dz12 / dist12) * halfPush;
        px2 -= (dx12 / dist12) * halfPush;
        pz2 -= (dz12 / dist12) * halfPush;
        speedMps *= 0.9;
        speedMps2 *= 0.9;
        collisionFlash = 0.6;
        collisionFlash2 = 0.6;
        audio.playImpact(0.55);
      }
    }

    // 8. Update Instanced Particle Pool
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const slot = particles[i];
      if (!slot.active) {
        _vMatDummy.position.set(0, -100, 0);
        _vMatDummy.scale.setScalar(0.001);
        _vMatDummy.updateMatrix();
        particleMesh.setMatrixAt(i, _vMatDummy.matrix);
        continue;
      }
      slot.life += dt;
      if (slot.life >= slot.maxLife) {
        slot.active = false;
        continue;
      }
      slot.x += slot.vx * dt;
      slot.y += slot.vy * dt;
      slot.z += slot.vz * dt;
      const progress = slot.life / slot.maxLife;
      const s = slot.scale * (1 + progress * 1.8) * (1 - progress * 0.85);
      _vMatDummy.position.set(slot.x, slot.y, slot.z);
      _vMatDummy.scale.setScalar(Math.max(0.01, s));
      _vMatDummy.updateMatrix();
      particleMesh.setMatrixAt(i, _vMatDummy.matrix);
    }
    particleMesh.instanceMatrix.needsUpdate = true;

    // 9. Smooth Damped Chase / Hood / Far Camera + Speed FOV Surge
    if (cameraMode === 'hood') {
      _vCamTarget.set(px + fwdX * 0.45, 1.38, pz + fwdZ * 0.45);
      _vCamLook.set(px + fwdX * 32, 1.15, pz + fwdZ * 32);
      camera.position.lerp(_vCamTarget, 0.72);
    } else {
      const backDist = cameraMode === 'far' ? 12.6 : 8.4;
      const height = cameraMode === 'far' ? 4.8 : 3.25;
      const lookAhead = cameraMode === 'far' ? 14 : 11;
      _vCamTarget.set(px - fwdX * backDist, height, pz - fwdZ * backDist);
      _vCamLook.set(px + fwdX * lookAhead, 1.25, pz + fwdZ * lookAhead);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _vCamTarget.x, 7.2, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _vCamTarget.y, 7.2, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _vCamTarget.z, 7.2, dt);
    }
    _mRot.lookAt(camera.position, _vCamLook, _vUp);
    _qDesired.setFromRotationMatrix(_mRot);
    camera.quaternion.slerp(_qDesired, cameraMode === 'hood' ? 0.55 : 0.22);

    const speedKmh = Math.max(0, Math.round(Math.abs(speedMps) * 3.6));
    const narrowPad = camera.aspect < 1.25 ? Math.min(12, (1.25 - camera.aspect) * 18) : 0;
    const targetFov = 58 + Math.min(20, (speedKmh / 330) * 18) + (boosting ? 4 : 0) + narrowPad;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
      camera.updateProjectionMatrix();
    }

    // 10. Audio synthesis + Telemetry callback (~20Hz)
    const gear = Math.min(7, Math.max(1, Math.floor(speedKmh / 48) + 1));
    const rpmPct =
      speedKmh < 4
        ? 14
        : Math.min(99, 28 + ((speedKmh % 48) / 48) * 66 + (boosting ? 6 : 0));

    audio.updateFrame(rpmPct, throttleInput, driftIntensity, boosting);

    if (nowMs - lastTelemetryEmitMs >= 50) {
      lastTelemetryEmitMs = nowMs;
      const dotHeading = fwdX * pAfter.tangentX + fwdZ * pAfter.tangentZ;
      const p2Pos = p2Driving && rivals[0] ? computeScorePosition(rivals[0].lap + rivals[0].s) : undefined;
      callbacks.onTelemetry?.({
        speedKmh,
        rpmPct: Math.round(rpmPct),
        gear: speedMps < -1 ? 0 : gear,
        lap: playerLap,
        totalLaps: TOTAL_RACE_LAPS,
        position: computePlayerPosition(),
        totalCars: rivals.length + 1,
        nitroPct: Math.round(nitroPct),
        collisionImpact: Number(collisionFlash.toFixed(2)),
        offroad,
        raceState,
        countdownValue: Math.max(0, Math.ceil(countdownTimer)),
        lapTimeMs: Math.round(Math.max(0, raceElapsedMs - currentLapStartMs)),
        bestLapMs: Math.round(bestLapMs),
        totalTimeMs: Math.round(raceElapsedMs),
        cameraMode,
        wrongWay: dotHeading < -0.35 && speedKmh > 25,
        splitScreenActive,
        p2SpeedKmh: p2Driving ? Math.max(0, Math.round(Math.abs(speedMps2) * 3.6)) : undefined,
        p2Lap: p2Driving && rivals[0] ? rivals[0].lap : undefined,
        p2Position: p2Pos,
        p2NitroPct: p2Driving ? Math.round(nitroPct2) : undefined,
        p2CollisionImpact: p2Driving ? Number(collisionFlash2.toFixed(2)) : undefined,
      });
    }
  }

  function computeScorePosition(targetScore: number): number {
    let rank = 1;
    if (playerLap + playerS > targetScore) rank += 1;
    for (const r of rivals) {
      if (r.lap + r.s > targetScore) rank += 1;
    }
    return rank;
  }

  function computePlayerPosition(): number {
    const playerScore = playerLap + playerS;
    let rank = 1;
    for (const r of rivals) {
      if (r.lap + r.s > playerScore) rank += 1;
    }
    return rank;
  }

  const framePacer = createThreeFramePacer(renderer, isSoftwareGl);

  function animate() {
    if (destroyed) return;
    framePacer.schedule(animate);
    if (contextLost) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    drs.sample(dt);
    stepSimulation(dt, performance.now());
    circuit.setCelebration(raceState === 'finished');
    circuit.updateActors(dt);

    const speedNorm = Math.max(0, Math.min(1, (Math.abs(speedMps) - 36) / 56));
    const boostingVisual = (raceState === 'racing' && nitroPct > 2 && keysState.nitro) || padBoostTimer > 0;
    composer?.setSpeedFx(speedNorm, boostingVisual ? 1 : 0, collisionFlash, raceElapsedMs / 1000);
    composer?.setDofActive(raceState === 'finished', 10.5);

    const w = Math.max(1, container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, container.clientHeight || window.innerHeight || 720);

    if (splitScreenActive) {
      const halfW = Math.floor(w / 2);
      const rightW = Math.max(1, w - halfW);
      const leftAspect = halfW / h;
      const rightAspect = rightW / h;
      if (Math.abs(camera.aspect - leftAspect) > 0.01) {
        camera.aspect = leftAspect;
        camera.updateProjectionMatrix();
      }
      if (Math.abs(cameraP2.aspect - rightAspect) > 0.01) {
        cameraP2.aspect = rightAspect;
        cameraP2.updateProjectionMatrix();
      }
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, halfW, h);
      renderer.setScissor(0, 0, halfW, h);
      renderer.render(scene, camera);

      renderer.setViewport(halfW, 0, rightW, h);
      renderer.setScissor(halfW, 0, rightW, h);
      renderer.render(scene, cameraP2);
    } else {
      renderer.setScissorTest(false);
      const fullAspect = w / h;
      if (Math.abs(camera.aspect - fullAspect) > 0.01) {
        camera.aspect = fullAspect;
        camera.updateProjectionMatrix();
      }
      renderer.setViewport(0, 0, w, h);
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    }
  }

  framePacer.schedule(animate);

  const handleResize = () => {
    if (destroyed) return;
    const w = Math.max(1, container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, container.clientHeight || window.innerHeight || 720);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer?.setSize(w, h);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => handleResize());
  }
  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
  resizeObserver?.observe(container);
  window.addEventListener('resize', handleResize);

  const onContextLost = (ev: Event) => {
    ev.preventDefault();
    contextLost = true;
    callbacks.onContextLost?.();
  };
  const onContextRestored = () => {
    contextLost = false;
    clock.getDelta();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  const unlockAudioHandler = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudioHandler, { passive: true });
  window.addEventListener('keydown', unlockAudioHandler, { passive: true });

  return {
    setGyroInput: (input, expiresInMs = 950, playerSlot) => {
      audio.unlock();
      const targetSlot = playerSlot ?? input.playerSlot ?? 1;
      const targetGyro = targetSlot === 2 ? p2GyroState : gyroState;
      if (targetSlot === 2) p2Connected = true;
      if (typeof input.steer === 'number') {
        targetGyro.steer = THREE.MathUtils.clamp(input.steer, -1, 1);
      }
      if (typeof input.throttle === 'number') {
        targetGyro.throttle = THREE.MathUtils.clamp(input.throttle, 0, 1);
      }
      if (typeof input.brake === 'number') {
        targetGyro.brake = THREE.MathUtils.clamp(input.brake, 0, 1);
      }
      if (typeof input.nitro === 'boolean') targetGyro.nitro = input.nitro;
      if (typeof input.handbrake === 'boolean') targetGyro.handbrake = input.handbrake;
      if (targetSlot === 2) {
        if (input.cameraCycle && !lastCycleCameraToggle2) {
          const order: RacingCameraMode[] = ['chase', 'hood', 'far'];
          cameraMode2 = order[(order.indexOf(cameraMode2) + 1) % order.length];
        }
        lastCycleCameraToggle2 = Boolean(input.cameraCycle);
      } else {
        if (input.cameraCycle && !lastCycleCameraToggle) {
          const order: RacingCameraMode[] = ['chase', 'hood', 'far'];
          cameraMode = order[(order.indexOf(cameraMode) + 1) % order.length];
        }
        lastCycleCameraToggle = Boolean(input.cameraCycle);
      }
      if (input.horn && !lastHornToggle) {
        audio.playHorn();
      }
      lastHornToggle = Boolean(input.horn);
      targetGyro.expiresAt = performance.now() + expiresInMs;
    },
    setPlayer2Connected: (connected: boolean) => {
      p2Connected = connected;
      if (!connected) {
        p2GyroState.expiresAt = 0;
        splitScreenActive = false;
      }
    },
    setKeyboardState: (keys) => {
      audio.unlock();
      if (typeof keys.left === 'boolean') keysState.left = keys.left;
      if (typeof keys.right === 'boolean') keysState.right = keys.right;
      if (typeof keys.up === 'boolean') keysState.up = keys.up;
      if (typeof keys.down === 'boolean') keysState.down = keys.down;
      if (typeof keys.nitro === 'boolean') keysState.nitro = keys.nitro;
      if (typeof keys.handbrake === 'boolean') keysState.handbrake = keys.handbrake;
    },
    cycleCamera: () => {
      audio.unlock();
      const order: RacingCameraMode[] = ['chase', 'hood', 'far'];
      cameraMode = order[(order.indexOf(cameraMode) + 1) % order.length];
      return cameraMode;
    },
    resetRace: () => {
      audio.unlock();
      placeGridStart();
    },
    setMuted: (muted: boolean) => {
      audio.setMuted(muted);
    },
    isMuted: () => audio.isMuted(),
    triggerHorn: () => {
      audio.playHorn();
    },
    destroy: () => {
      destroyed = true;
      framePacer.cancel();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', unlockAudioHandler);
      window.removeEventListener('keydown', unlockAudioHandler);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      playerCar.dispose();
      rivals.forEach((r) => r.rig.dispose());
      circuit.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      skyDomeTex.dispose();
      hdriHandle.dispose();
      composer?.dispose();
      envTarget?.dispose();
      pmrem?.dispose();
      audio.destroy();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
