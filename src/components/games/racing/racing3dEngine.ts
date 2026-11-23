import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
  renderer.toneMappingExposure = 1.12;
  if (!isSoftwareGl) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a14);
  scene.fog = new THREE.FogExp2(0x070a14, 0.0028);

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

  const camera = new THREE.PerspectiveCamera(
    60,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.25,
    800
  );

  // Lighting rig
  const hemiLight = new THREE.HemisphereLight(0xa5b4fc, 0x0f172a, 0.72);
  const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
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
  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
  rimLight.position.set(-90, 45, -110);
  scene.add(hemiLight, keyLight, rimLight);

  const circuit = buildGpCircuitScene(scene, isSoftwareGl);
  const audio = new RacingSoundEngine();

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
  let rafId = 0;
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
    });

    // Snap camera behind player immediately
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    camera.position.set(px - fwdX * 10.5, 4.4, pz - fwdZ * 10.5);
    camera.lookAt(px + fwdX * 12, 1.4, pz + fwdZ * 12);
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

    playerCar.brakeLightMaterial.emissiveIntensity = brakeInput > 0.1 ? 3.2 : 0.9;
    const showFlames = boosting && speedMps > 8;
    playerCar.nitroFlames[0].visible = showFlames;
    playerCar.nitroFlames[1].visible = showFlames;
    if (showFlames) {
      const flicker = 0.8 + Math.random() * 0.55;
      playerCar.nitroFlames[0].scale.set(1, 1, flicker);
      playerCar.nitroFlames[1].scale.set(1, 1, flicker);
    }

    // Emit drift smoke / nitro sparks
    const driftIntensity =
      Math.abs(speedMps) > 22
        ? Math.min(1, Math.abs(steerInput) * (handbrakeWanted ? 1.0 : 0.45))
        : 0;
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

    // 7. Update AI rivals along spline + car-to-car bump avoidance
    for (let i = 0; i < rivals.length; i += 1) {
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
    const targetFov = 58 + Math.min(20, (speedKmh / 330) * 18) + (boosting ? 4 : 0);
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
      });
    }
  }

  function computePlayerPosition(): number {
    const playerScore = playerLap + playerS;
    let rank = 1;
    for (const r of rivals) {
      if (r.lap + r.s > playerScore) rank += 1;
    }
    return rank;
  }

  function animate() {
    if (destroyed) return;
    rafId = window.requestAnimationFrame(animate);
    if (contextLost) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    stepSimulation(dt, performance.now());
    renderer.render(scene, camera);
  }

  rafId = window.requestAnimationFrame(animate);

  const handleResize = () => {
    if (destroyed) return;
    const w = Math.max(1, container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, container.clientHeight || window.innerHeight || 720);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
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
    setGyroInput: (input, expiresInMs = 950) => {
      audio.unlock();
      if (typeof input.steer === 'number') {
        gyroState.steer = THREE.MathUtils.clamp(input.steer, -1, 1);
      }
      if (typeof input.throttle === 'number') {
        gyroState.throttle = THREE.MathUtils.clamp(input.throttle, 0, 1);
      }
      if (typeof input.brake === 'number') {
        gyroState.brake = THREE.MathUtils.clamp(input.brake, 0, 1);
      }
      if (typeof input.nitro === 'boolean') gyroState.nitro = input.nitro;
      if (typeof input.handbrake === 'boolean') gyroState.handbrake = input.handbrake;
      if (input.cameraCycle && !lastCycleCameraToggle) {
        const order: RacingCameraMode[] = ['chase', 'hood', 'far'];
        cameraMode = order[(order.indexOf(cameraMode) + 1) % order.length];
      }
      lastCycleCameraToggle = Boolean(input.cameraCycle);
      if (input.horn && !lastHornToggle) {
        audio.playHorn();
      }
      lastHornToggle = Boolean(input.horn);
      gyroState.expiresAt = performance.now() + expiresInMs;
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
      window.cancelAnimationFrame(rafId);
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
