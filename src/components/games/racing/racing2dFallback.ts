import { RacingSoundEngine } from './racingAudio';
import {
  RIVAL_LIVERIES,
  TOTAL_RACE_LAPS,
  type RacingCameraMode,
  type RacingEngineCallbacks,
  type RacingEngineHandle,
  type RacingGyroControlState,
} from './racingTypes';

interface FallbackRival {
  s: number;
  lateral: number;
  targetLateral: number;
  speedMps: number;
  basePace: number;
  lap: number;
  lastS: number;
  passedHalf: boolean;
  primary: string;
  accent: string;
}

const TRACK_CURVATURES: Array<{ from: number; to: number; curve: number }> = [
  { from: 0.08, to: 0.22, curve: 0.72 },
  { from: 0.26, to: 0.4, curve: -0.95 },
  { from: 0.46, to: 0.58, curve: 1.05 },
  { from: 0.64, to: 0.78, curve: -0.68 },
  { from: 0.84, to: 0.94, curve: 0.55 },
];

function hexCss(num: number): string {
  return '#' + num.toString(16).padStart(6, '0');
}

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapS(v: number): number {
  const r = v % 1;
  return r < 0 ? r + 1 : r;
}

function sampleTrackCurveAt(s: number): number {
  const norm = wrapS(s);
  for (const seg of TRACK_CURVATURES) {
    if (norm >= seg.from && norm <= seg.to) {
      const mid = (seg.from + seg.to) * 0.5;
      const half = (seg.to - seg.from) * 0.5;
      const bell = Math.cos(((norm - mid) / half) * (Math.PI * 0.5));
      return seg.curve * Math.max(0, bell);
    }
  }
  return 0;
}

/**
 * Pseudo-3D OutRun-style HTML5 Canvas 2D racing fallback engine.
 * Activates automatically on Smart TVs where WebGL context creation fails or is disabled,
 * preserving the full RacingEngineHandle contract, mobile gyro steering, sound & telemetry.
 */
export function createRacing2dFallbackEngine(
  container: HTMLElement,
  callbacks: RacingEngineCallbacks = {}
): RacingEngineHandle {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(640, container.clientWidth || 1280);
  canvas.height = Math.max(360, container.clientHeight || 720);
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const audio = new RacingSoundEngine();
  const TRACK_LENGTH_M = 1650;

  let destroyed = false;
  let rafId = 0;
  let cameraMode: RacingCameraMode = 'chase';
  let lastFrameMs = performance.now();
  let lastTelemetryEmitMs = 0;

  let playerS = 0.99;
  let playerLastS = 0.99;
  let playerPassedHalf = false;
  let playerLap = 1;
  let lateral = 0.35; // [-1.25 .. 1.25] normalized road half-width
  let headingOffset = 0;
  let speedMps = 0;
  let nitroPct = 100;
  let collisionFlash = 0;
  let raceState: 'countdown' | 'racing' | 'finished' = 'countdown';
  let countdownTimer = 3.2;
  let lastBeepStep = 4;
  let raceElapsedMs = 0;
  let currentLapStartMs = 0;
  let bestLapMs = 0;
  let lastCycleCameraToggle = false;
  let lastHornToggle = false;

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

  const rivals: FallbackRival[] = [1, 2, 3].map((idx) => ({
    s: 0.991 + idx * 0.002,
    lateral: idx % 2 === 0 ? -0.45 : 0.45,
    targetLateral: idx % 2 === 0 ? -0.4 : 0.4,
    speedMps: 0,
    basePace: idx === 1 ? 66 : idx === 2 ? 62 : 58,
    lap: 1,
    lastS: 0.991,
    passedHalf: false,
    primary: hexCss(RIVAL_LIVERIES[idx].primary),
    accent: hexCss(RIVAL_LIVERIES[idx].accent),
  }));

  function resetGrid(): void {
    playerS = 0.99;
    playerLastS = 0.99;
    playerPassedHalf = false;
    playerLap = 1;
    lateral = 0.35;
    headingOffset = 0;
    speedMps = 0;
    nitroPct = 100;
    collisionFlash = 0;
    raceState = 'countdown';
    countdownTimer = 3.2;
    lastBeepStep = 4;
    raceElapsedMs = 0;
    currentLapStartMs = 0;
    bestLapMs = 0;
    rivals.forEach((r, idx) => {
      r.s = 0.992 + idx * 0.002;
      r.lastS = r.s;
      r.passedHalf = false;
      r.lap = 1;
      r.speedMps = 0;
      r.lateral = idx % 2 === 0 ? -0.42 : 0.42;
      r.targetLateral = r.lateral;
    });
  }

  function computePosition(): number {
    const score = playerLap + playerS;
    let rank = 1;
    for (const r of rivals) {
      if (r.lap + r.s > score) rank += 1;
    }
    return rank;
  }

  function drawCarSprite(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number,
    primary: string,
    accent: string,
    steerSkew: number,
    boosting: boolean,
    braking: boolean
  ): void {
    const w = 136 * scale;
    const h = 68 * scale;
    c.save();
    c.translate(cx, cy);
    c.transform(1, 0, steerSkew * 0.14, 1, 0, 0);

    // Ground shadow
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath();
    c.ellipse(0, h * 0.38, w * 0.56, h * 0.24, 0, 0, Math.PI * 2);
    c.fill();

    // Rear tires
    c.fillStyle = '#0f172a';
    c.fillRect(-w * 0.5, -h * 0.05, w * 0.16, h * 0.42);
    c.fillRect(w * 0.34, -h * 0.05, w * 0.16, h * 0.42);

    // Main chassis
    c.fillStyle = primary;
    c.beginPath();
    c.moveTo(-w * 0.38, h * 0.28);
    c.lineTo(-w * 0.3, -h * 0.24);
    c.lineTo(w * 0.3, -h * 0.24);
    c.lineTo(w * 0.38, h * 0.28);
    c.closePath();
    c.fill();

    // Cockpit glass
    c.fillStyle = '#090d16';
    c.beginPath();
    c.moveTo(-w * 0.18, -h * 0.12);
    c.lineTo(-w * 0.13, -h * 0.36);
    c.lineTo(w * 0.13, -h * 0.36);
    c.lineTo(w * 0.18, -h * 0.12);
    c.closePath();
    c.fill();

    // Accent racing stripe + rear wing
    c.fillStyle = accent;
    c.fillRect(-w * 0.38, -h * 0.34, w * 0.76, h * 0.11);
    c.fillRect(-w * 0.05, -h * 0.1, w * 0.1, h * 0.38);

    // Taillights
    c.fillStyle = braking ? '#ff2a55' : '#b91c1c';
    c.fillRect(-w * 0.3, h * 0.06, w * 0.14, h * 0.09);
    c.fillRect(w * 0.16, h * 0.06, w * 0.14, h * 0.09);

    // Nitro exhaust flames
    if (boosting) {
      c.fillStyle = '#38bdf8';
      c.beginPath();
      c.ellipse(-w * 0.12, h * 0.35, w * 0.06, h * (0.2 + Math.random() * 0.14), 0, 0, Math.PI * 2);
      c.ellipse(w * 0.12, h * 0.35, w * 0.06, h * (0.2 + Math.random() * 0.14), 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function renderFrame(
    c: CanvasRenderingContext2D,
    curve: number,
    steerInput: number,
    boosting: boolean,
    brakeInput: number
  ): void {
    const w = canvas.width;
    const h = canvas.height;
    const horizon = Math.round(h * (cameraMode === 'far' ? 0.39 : 0.43));

    // Sky + stadium night gradient
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#050814');
    sky.addColorStop(0.65, '#131b38');
    sky.addColorStop(1, '#1e1b4b');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, horizon);

    // Distant skyline + stadium lights
    const parallax = (-playerS * 900) % w;
    c.fillStyle = '#090d1f';
    for (let x = parallax - w; x < w * 2; x += 92) {
      const bh = 28 + ((Math.abs(Math.round(x * 13)) % 5) * 14);
      c.fillRect(x, horizon - bh, 64, bh);
    }

    // Turf ground
    const grass = c.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, '#064e3b');
    grass.addColorStop(1, '#022c22');
    c.fillStyle = grass;
    c.fillRect(0, horizon, w, h - horizon);

    // Pseudo-3D scanline stripes for smooth 60 FPS perspective depth
    const stripes = 36;
    const roadBottomHalf = w * 0.44;
    const roadTopHalf = w * 0.042;
    const phase = (playerS * 140) % 2;

    for (let i = 0; i < stripes; i += 1) {
      const t0 = i / stripes;
      const t1 = (i + 1) / stripes;
      const p0 = Math.pow(t0, 1.85);
      const p1 = Math.pow(t1, 1.85);
      const y0 = horizon + (h - horizon) * p0;
      const y1 = horizon + (h - horizon) * p1;

      const xShift0 = Math.pow(1 - p0, 2) * curve * (w * 0.16) - lateral * (w * 0.28) * p0;
      const xShift1 = Math.pow(1 - p1, 2) * curve * (w * 0.16) - lateral * (w * 0.28) * p1;
      const cx0 = w * 0.5 + xShift0;
      const cx1 = w * 0.5 + xShift1;
      const hw0 = roadTopHalf + (roadBottomHalf - roadTopHalf) * p0;
      const hw1 = roadTopHalf + (roadBottomHalf - roadTopHalf) * p1;

      const alt = Math.floor(i + phase) % 2 === 0;

      // Curbs
      c.fillStyle = alt ? '#ef4444' : '#f8fafc';
      c.beginPath();
      c.moveTo(cx0 - hw0 * 1.12, y0);
      c.lineTo(cx0 + hw0 * 1.12, y0);
      c.lineTo(cx1 + hw1 * 1.12, y1);
      c.lineTo(cx1 - hw1 * 1.12, y1);
      c.closePath();
      c.fill();

      // Asphalt surface
      c.fillStyle = alt ? '#1b202d' : '#151a26';
      c.beginPath();
      c.moveTo(cx0 - hw0, y0);
      c.lineTo(cx0 + hw0, y0);
      c.lineTo(cx1 + hw1, y1);
      c.lineTo(cx1 - hw1, y1);
      c.closePath();
      c.fill();

      // Center lane dash
      if (alt) {
        c.fillStyle = 'rgba(248, 250, 252, 0.72)';
        c.beginPath();
        c.moveTo(cx0 - hw0 * 0.03, y0);
        c.lineTo(cx0 + hw0 * 0.03, y0);
        c.lineTo(cx1 + hw1 * 0.03, y1);
        c.lineTo(cx1 - hw1 * 0.03, y1);
        c.closePath();
        c.fill();
      }
    }

    // Draw visible ahead rivals sorted far-to-near
    const visibleRivals = rivals
      .map((r) => {
        let rel = r.s - playerS;
        if (rel < -0.5) rel += 1;
        if (rel > 0.5) rel -= 1;
        return { r, rel };
      })
      .filter((it) => it.rel > 0.001 && it.rel < 0.075)
      .sort((a, b) => b.rel - a.rel);

    for (const it of visibleRivals) {
      const depth = clampNum(1 - it.rel / 0.075, 0.05, 1);
      const persp = Math.pow(depth, 1.85);
      const ry = horizon + (h - horizon) * persp;
      const roadCenter = w * 0.5 + Math.pow(1 - persp, 2) * curve * (w * 0.16) - lateral * (w * 0.28) * persp;
      const rw = roadTopHalf + (roadBottomHalf - roadTopHalf) * persp;
      const rx = roadCenter + it.r.lateral * rw * 0.75;
      drawCarSprite(c, rx, ry - 12 * depth, 0.26 + depth * 0.85, it.r.primary, it.r.accent, 0, false, false);
    }

    // Draw player GT car
    if (cameraMode !== 'hood') {
      const carScale = cameraMode === 'far' ? 0.92 : 1.12;
      drawCarSprite(
        c,
        w * 0.5 + headingOffset * 28,
        h * 0.82,
        carScale,
        hexCss(RIVAL_LIVERIES[0].primary),
        hexCss(RIVAL_LIVERIES[0].accent),
        -steerInput,
        boosting,
        brakeInput > 0.1
      );
    }

    // Subtle TV WebGL-fallback badge & countdown banner
    c.font = '700 13px sans-serif';
    c.textAlign = 'left';
    c.fillStyle = 'rgba(203, 213, 225, 0.75)';
    c.fillText('GP HD COMPATIBLE · 60 FPS', 20, 28);

    if (raceState === 'countdown') {
      const countNum = Math.max(1, Math.ceil(countdownTimer));
      c.font = '900 72px sans-serif';
      c.textAlign = 'center';
      c.fillStyle = countNum === 1 ? '#4ade80' : '#facc15';
      c.fillText(String(countNum), w * 0.5, h * 0.36);
    }
  }

  function stepAndDraw(nowMs: number): void {
    if (destroyed) return;
    rafId = window.requestAnimationFrame(stepAndDraw);

    const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;

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

    const gyroActive = nowMs < gyroState.expiresAt;
    let steerInput = (keysState.right ? 1 : 0) - (keysState.left ? 1 : 0);
    let throttleInput = keysState.up ? 1 : 0;
    let brakeInput = keysState.down ? 1 : 0;
    let nitroWanted = keysState.nitro;
    let handbrakeWanted = keysState.handbrake;

    if (gyroActive) {
      if (Math.abs(gyroState.steer) > 0.01 || steerInput === 0) {
        steerInput = clampNum(gyroState.steer + steerInput * 0.5, -1, 1);
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
      throttleInput = 0.25;
      brakeInput = 0;
      nitroWanted = false;
    }

    const offroad = Math.abs(lateral) > 0.96;
    const nitroUsing = raceState === 'racing' && nitroWanted && nitroPct > 2;
    if (nitroUsing) nitroPct = Math.max(0, nitroPct - 28 * dt);
    else nitroPct = Math.min(100, nitroPct + (offroad ? 4 : 9.5) * dt);

    const topSpeed = offroad ? 46 : nitroUsing ? 94 : 76;
    const accel = nitroUsing ? 52 : 34;
    if (throttleInput > 0) speedMps += throttleInput * accel * dt;
    if (brakeInput > 0) speedMps -= brakeInput * (speedMps > 2 ? 48 : 18) * dt;
    speedMps -= speedMps * (offroad ? 2.1 : 0.48) * dt;
    if (throttleInput === 0 && brakeInput === 0 && Math.abs(speedMps) < 0.6) speedMps = 0;
    speedMps = clampNum(speedMps, -16, topSpeed);

    const curve = sampleTrackCurveAt(playerS);
    const steerGain = (handbrakeWanted ? 1.55 : 1.15) * clampNum(Math.abs(speedMps) / 28, 0.2, 1);
    lateral += steerInput * steerGain * dt - curve * (speedMps / 78) * 0.58 * dt;
    if (Math.abs(lateral) > 1.24) {
      lateral = clampNum(lateral, -1.24, 1.24);
      speedMps *= 0.85;
      collisionFlash = Math.min(1, Math.abs(speedMps) / 70);
    } else {
      collisionFlash = Math.max(0, collisionFlash - dt * 3);
    }
    headingOffset += (steerInput * 0.9 - headingOffset) * Math.min(1, dt * 8);

    playerLastS = playerS;
    playerS = wrapS(playerS + (speedMps * dt) / TRACK_LENGTH_M);
    if (playerS > 0.4 && playerS < 0.65) playerPassedHalf = true;
    if (playerLastS > 0.85 && playerS < 0.15 && playerPassedHalf && raceState === 'racing') {
      playerPassedHalf = false;
      const lapDuration = raceElapsedMs - currentLapStartMs;
      if (lapDuration > 5000 && (bestLapMs === 0 || lapDuration < bestLapMs)) bestLapMs = lapDuration;
      currentLapStartMs = raceElapsedMs;
      if (playerLap < TOTAL_RACE_LAPS) {
        playerLap += 1;
        audio.playLapChime(false);
      } else {
        raceState = 'finished';
        audio.playLapChime(true);
        callbacks.onFinish?.({
          position: computePosition(),
          totalTimeMs: Math.round(raceElapsedMs),
          bestLapMs: Math.round(bestLapMs || lapDuration),
        });
      }
    }

    for (const r of rivals) {
      if (raceState !== 'countdown') {
        const gap = playerLap + playerS - (r.lap + r.s);
        const targetSpd = Math.max(44, r.basePace + clampNum(gap * 11, -8, 12));
        r.speedMps += (targetSpd - r.speedMps) * Math.min(1, dt * 2.2);
        r.lastS = r.s;
        r.s = wrapS(r.s + (r.speedMps * dt) / TRACK_LENGTH_M);
        if (r.s > 0.4 && r.s < 0.65) r.passedHalf = true;
        if (r.lastS > 0.85 && r.s < 0.15 && r.passedHalf) {
          r.passedHalf = false;
          r.lap += 1;
        }
        if (Math.random() < 0.015) r.targetLateral = (Math.random() - 0.5) * 1.1;
        r.lateral += (r.targetLateral - r.lateral) * Math.min(1, dt * 1.6);
      }
    }

    if (ctx) {
      renderFrame(ctx, curve, steerInput, nitroUsing, brakeInput);
    }

    const speedKmh = Math.max(0, Math.round(Math.abs(speedMps) * 3.6));
    const gear = Math.min(7, Math.max(1, Math.floor(speedKmh / 48) + 1));
    const rpmPct = speedKmh < 4 ? 14 : Math.min(99, 28 + ((speedKmh % 48) / 48) * 66 + (nitroUsing ? 6 : 0));
    audio.updateFrame(rpmPct, throttleInput, Math.abs(steerInput) * 0.4, nitroUsing);

    if (nowMs - lastTelemetryEmitMs >= 50) {
      lastTelemetryEmitMs = nowMs;
      callbacks.onTelemetry?.({
        speedKmh,
        rpmPct: Math.round(rpmPct),
        gear: speedMps < -1 ? 0 : gear,
        lap: playerLap,
        totalLaps: TOTAL_RACE_LAPS,
        position: computePosition(),
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
        wrongWay: speedMps < -3,
      });
    }
  }

  const handleResize = () => {
    if (destroyed) return;
    canvas.width = Math.max(640, container.clientWidth || window.innerWidth || 1280);
    canvas.height = Math.max(360, container.clientHeight || window.innerHeight || 720);
  };
  window.addEventListener('resize', handleResize);
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null;
  if (ro) ro.observe(container);

  const unlockAudioHandler = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudioHandler, { passive: true });
  window.addEventListener('keydown', unlockAudioHandler, { passive: true });

  resetGrid();
  rafId = window.requestAnimationFrame(stepAndDraw);

  return {
    setGyroInput: (input, expiresInMs = 950) => {
      audio.unlock();
      if (typeof input.steer === 'number') gyroState.steer = clampNum(input.steer, -1, 1);
      if (typeof input.throttle === 'number') gyroState.throttle = clampNum(input.throttle, 0, 1);
      if (typeof input.brake === 'number') gyroState.brake = clampNum(input.brake, 0, 1);
      if (typeof input.nitro === 'boolean') gyroState.nitro = input.nitro;
      if (typeof input.handbrake === 'boolean') gyroState.handbrake = input.handbrake;
      if (input.cameraCycle && !lastCycleCameraToggle) {
        const order: RacingCameraMode[] = ['chase', 'hood', 'far'];
        cameraMode = order[(order.indexOf(cameraMode) + 1) % order.length];
      }
      lastCycleCameraToggle = Boolean(input.cameraCycle);
      if (input.horn && !lastHornToggle) audio.playHorn();
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
      resetGrid();
    },
    setMuted: (muted: boolean) => audio.setMuted(muted),
    isMuted: () => audio.isMuted(),
    triggerHorn: () => audio.playHorn(),
    destroy: () => {
      destroyed = true;
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', unlockAudioHandler);
      window.removeEventListener('keydown', unlockAudioHandler);
      audio.destroy();
      if (canvas.parentNode === container) container.removeChild(canvas);
    },
  };
}
