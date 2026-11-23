// ===================================================================
// SMART TV 3D CAR RACING + MOBILE PHONE GYROSCOPE SYNC (STRICT ES5)
// Connects window.RiffanRacing3D WebGL engine with /volante?room=CODE
// Includes dynamic script retry + built-in ES5 OutRun 2.5D fallback
// ===================================================================
var tvRacingWs = null;
var tvRacingRoomId = '';
var tvRacingTelemetryPushAt = 0;
var tvRacingHasController = false;
var tvRacingFinished = false;
var tvRacingEngineHandle = null;
var tvRacingUsingFallback = false;
var tvRacingRemoteKeys = { left: false, right: false, up: false, down: false, nitro: false, handbrake: false };

function getTvRacingPublicOrigin() {
  if (typeof window.__RIFFAN_API_ORIGIN__ === 'string' && window.__RIFFAN_API_ORIGIN__.indexOf('http') === 0) {
    return window.__RIFFAN_API_ORIGIN__.replace(/\/+$/, '');
  }
  return window.location.origin || ('https://' + (window.location.host || 'localhost'));
}

function getTvRacingWsUrl() {
  var origin = getTvRacingPublicOrigin();
  if (origin.indexOf('https://') === 0) return 'wss://' + origin.slice(8) + '/ws';
  if (origin.indexOf('http://') === 0) return 'ws://' + origin.slice(7) + '/ws';
  var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + window.location.host + '/ws';
}

function unmountActiveRacingEngine() {
  if (tvRacingEngineHandle && tvRacingEngineHandle.destroy) {
    try { tvRacingEngineHandle.destroy(); } catch (e0) {}
    tvRacingEngineHandle = null;
  }
  if (window.RiffanRacing3D && window.RiffanRacing3D.unmount) {
    try { window.RiffanRacing3D.unmount(); } catch (e1) {}
  }
  tvRacingUsingFallback = false;
}

function closeTvRacingGame() {
  unmountActiveRacingEngine();
  if (tvRacingWs) {
    tvRacingWs.onclose = null;
    try { tvRacingWs.close(); } catch (e2) {}
    tvRacingWs = null;
  }
  tvRacingRemoteKeys = { left: false, right: false, up: false, down: false, nitro: false, handbrake: false };
  tvRacingHasController = false;
  tvRacingFinished = false;
  tvRacingRoomId = '';
}
window.closeTvRacingGame = closeTvRacingGame;

function formatLapClockMs(ms) {
  var total = Math.max(0, Math.floor(ms || 0));
  var mins = Math.floor(total / 60000);
  var secs = Math.floor((total % 60000) / 1000);
  var tenths = Math.floor((total % 1000) / 100);
  return (mins < 10 ? '0' + mins : String(mins)) + ':' + (secs < 10 ? '0' + secs : String(secs)) + '.' + tenths;
}

// Pure ES5 60FPS Pseudo-3D OutRun GP Fallback for Smart TVs without WebGL/ES2015
function mountEs5RacingFallback(stageEl, opts) {
  stageEl.innerHTML = '';
  var canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.objectFit = 'cover';
  stageEl.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var W = 960;
  var H = 540;
  var horizonY = 216;
  var totalLaps = 3;
  var lapLen = 1400;
  var destroyed = false;
  var rafId = 0;
  var camModeIdx = 0;

  var keyState = { left: false, right: false, up: false, down: false, nitro: false, handbrake: false };
  var gyroState = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
  var p2GyroState = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };

  var car = {
    x: 0, z: 0, speed: 0, lap: 1, nitroPct: 100,
    raceStartAt: Date.now() + 2200, lapStartAt: 0, bestLapMs: 0, finished: false,
    rivals: [
      { z: 65, x: -0.45, spd: 122, color: '#ef4444', trim: '#fecaca' },
      { z: 125, x: 0.45, spd: 118, color: '#22d3ee', trim: '#cffafe' },
      { z: 185, x: -0.15, spd: 114, color: '#facc15', trim: '#fef08a' }
    ]
  };

  function resetRace() {
    car.x = 0; car.z = 0; car.speed = 0; car.lap = 1; car.nitroPct = 100;
    car.raceStartAt = Date.now() + 2000; car.lapStartAt = 0; car.bestLapMs = 0; car.finished = false;
    car.rivals[0].z = 65; car.rivals[1].z = 125; car.rivals[2].z = 185;
  }

  function roadCurveAt(zPos) {
    return Math.sin(zPos * 0.0085) * 0.9 + Math.cos(zPos * 0.0042) * 0.55;
  }

  var lastTs = Date.now();
  function loop() {
    if (destroyed) return;
    var now = Date.now();
    var dt = Math.min(0.05, Math.max(0.008, (now - lastTs) / 1000));
    lastTs = now;

    var countingDown = now < car.raceStartAt;
    var countdownSec = countingDown ? Math.ceil((car.raceStartAt - now) / 1000) : 0;
    if (!countingDown && car.lapStartAt === 0) car.lapStartAt = now;

    var useGyro = now < gyroState.expiresAt;
    var steerIn = useGyro ? gyroState.steer : ((keyState.right ? 1 : 0) - (keyState.left ? 1 : 0));
    var gasIn = useGyro ? Math.max(gyroState.throttle, keyState.up ? 1 : 0) : (keyState.up ? 1 : (useGyro ? 0 : 0.72));
    var brakeIn = useGyro ? Math.max(gyroState.brake, keyState.down ? 1 : 0) : (keyState.down ? 1 : 0);
    var nitroIn = (useGyro && gyroState.nitro) || keyState.nitro;
    var driftIn = (useGyro && gyroState.handbrake) || keyState.handbrake;

    if (countingDown || car.finished) {
      gasIn = 0;
      brakeIn = 0.6;
      nitroIn = false;
    }

    var nitroActive = nitroIn && car.nitroPct > 4 && car.speed > 20;
    if (nitroActive) car.nitroPct = Math.max(0, car.nitroPct - dt * 28);
    else car.nitroPct = Math.min(100, car.nitroPct + dt * 9);

    var maxSpd = nitroActive ? 195 : 152;
    if (gasIn > 0.05) {
      car.speed += (nitroActive ? 145 : 92) * gasIn * dt;
    } else if (brakeIn > 0.05) {
      car.speed -= 160 * brakeIn * dt;
    } else {
      car.speed -= 34 * dt;
    }
    car.speed = Math.max(0, Math.min(maxSpd, car.speed));

    var curve = roadCurveAt(car.z);
    var speedFactor = car.speed / 150;
    car.x += steerIn * dt * (driftIn ? 2.55 : 1.95) * (0.35 + speedFactor * 0.75);
    car.x -= curve * speedFactor * dt * 0.72;
    var offroad = Math.abs(car.x) > 1.05;
    if (offroad && car.speed > 78) car.speed -= 75 * dt;
    car.x = Math.max(-1.45, Math.min(1.45, car.x));

    car.z += car.speed * dt;
    var collisionImpact = 0;

    for (var ri = 0; ri < car.rivals.length; ri++) {
      var rv = car.rivals[ri];
      if (!countingDown) {
        if (ri === 0 && now < p2GyroState.expiresAt) {
          var p2TargetSpd = p2GyroState.throttle > 0.05 ? (p2GyroState.nitro ? 185 : 148) : (p2GyroState.brake > 0.05 ? 45 : 88);
          rv.spd += (p2TargetSpd - rv.spd) * Math.min(1, dt * 4);
          rv.x = Math.max(-1.35, Math.min(1.35, rv.x + p2GyroState.steer * dt * 1.4));
        }
        rv.z += rv.spd * dt;
      }
      var dz = Math.abs(rv.z - car.z);
      if (dz < 8 && Math.abs(rv.x - car.x) < 0.34) {
        collisionImpact = 0.7;
        car.speed *= 0.74;
        car.x += car.x >= rv.x ? 0.25 : -0.25;
      }
    }

    var curLap = Math.floor(car.z / lapLen) + 1;
    if (curLap > car.lap && !car.finished) {
      var lapElapsed = now - car.lapStartAt;
      if (car.bestLapMs === 0 || lapElapsed < car.bestLapMs) car.bestLapMs = lapElapsed;
      car.lapStartAt = now;
      car.lap = curLap;
      if (car.lap > totalLaps) {
        car.lap = totalLaps;
        car.finished = true;
      }
    }

    var myPos = 1;
    for (var pi = 0; pi < car.rivals.length; pi++) {
      if (car.rivals[pi].z > car.z) myPos += 1;
    }

    // Draw twilight sky & neon mountains
    var sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#07091b');
    sky.addColorStop(0.65, '#1e1b4b');
    sky.addColorStop(1, '#4c1d95');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY);

    // Sun glow
    ctx.fillStyle = 'rgba(244, 114, 182, 0.32)';
    ctx.beginPath(); ctx.arc(W / 2 - curve * 70, horizonY - 14, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(W / 2 - curve * 70, horizonY - 12, 34, 0, Math.PI * 2); ctx.fill();

    // Horizon skyline silhouettes
    ctx.fillStyle = '#0f172a';
    for (var si = 0; si < 16; si++) {
      var bx = ((si * 82 - curve * 110) % (W + 120)) - 60;
      var bh = 18 + ((si * 29) % 44);
      ctx.fillRect(bx, horizonY - bh, 52, bh);
    }

    // Pseudo-3D scanline road projection
    var strips = 54;
    var segH = (H - horizonY) / strips;
    var totalH = H - horizonY;
    for (var i = 0; i < strips; i++) {
      var p1 = i / strips;
      var p2 = (i + 1) / strips;
      var y1 = horizonY + p1 * totalH;
      var y2 = horizonY + p2 * totalH;
      var depth = 0.08 + Math.pow(p1, 1.35) * 0.92;
      var worldZ = car.z + (1 - p1) * 42;
      var band = Math.floor(worldZ * 0.48) % 2 === 0;

      ctx.fillStyle = band ? '#064e3b' : '#065f46';
      ctx.fillRect(0, y1, W, Math.ceil(y2 - y1 + 1));

      var curveOff = roadCurveAt(car.z + (1 - p1) * 28) * Math.pow(1 - p1, 1.8) * 180;
      var cx = W / 2 - car.x * depth * 290 + curveOff;
      var rw = 26 + depth * 410;
      var curbW = Math.max(4, rw * 0.08);

      ctx.fillStyle = band ? '#ef4444' : '#f8fafc';
      ctx.fillRect(cx - rw - curbW, y1, rw * 2 + curbW * 2, Math.ceil(y2 - y1 + 1));

      ctx.fillStyle = band ? '#1e293b' : '#26334a';
      ctx.fillRect(cx - rw, y1, rw * 2, Math.ceil(y2 - y1 + 1));

      if (band) {
        ctx.fillStyle = 'rgba(248,250,252,0.8)';
        var lw = Math.max(2, depth * 7);
        ctx.fillRect(cx - lw / 2, y1, lw, Math.ceil(y2 - y1 + 1));
      }
    }

    // Draw Rival Cars sorted by distance
    for (var di = 0; di < car.rivals.length; di++) {
      var rCar = car.rivals[di];
      var relZ = rCar.z - car.z;
      if (relZ > 1 && relZ < 42) {
        var norm = 1 - relZ / 42;
        var ry = horizonY + Math.pow(norm, 1.25) * totalH;
        var dep = 0.08 + Math.pow(norm, 1.35) * 0.92;
        var rCurveOff = roadCurveAt(rCar.z) * Math.pow(1 - norm, 1.8) * 180;
        var rx = W / 2 + (rCar.x - car.x) * dep * 290 + rCurveOff;
        var sc = 0.2 + dep * 1.15;
        drawFallbackCar(rx, ry, sc, rCar.color, rCar.trim, 0, false);
      }
    }

    // Player Car (offset slightly by camera mode)
    var playerY = camModeIdx === 1 ? H - 36 : camModeIdx === 2 ? H - 56 : H - 72;
    drawFallbackCar(W / 2, playerY, camModeIdx === 1 ? 1.35 : 1.12, '#7c3aed', '#22d3ee', steerIn * 0.14, nitroActive);

    if (nitroActive) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 3;
      for (var sl = 0; sl < 8; sl++) {
        var sx = (sl % 2 === 0 ? 40 : W - 40) + (Math.random() - 0.5) * 90;
        var sy = 90 + Math.random() * 320;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + 70); ctx.stroke();
      }
    }

    if (countingDown && countdownSec > 0) {
      ctx.fillStyle = 'rgba(5, 8, 18, 0.72)';
      ctx.fillRect(W / 2 - 90, 96, 180, 90);
      ctx.font = 'bold 54px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = countdownSec === 1 ? '#4ade80' : '#facc15';
      ctx.fillText(String(countdownSec), W / 2, 160);
    }

    if (opts && opts.onTelemetry) {
      var kmh = Math.round(car.speed * 1.75);
      opts.onTelemetry({
        speedKmh: kmh,
        rpmPct: Math.min(98, Math.max(12, Math.round((kmh % 65) * 1.45 + 15))),
        gear: Math.max(1, Math.min(6, 1 + Math.floor(kmh / 52))),
        lap: car.lap,
        totalLaps: totalLaps,
        position: myPos,
        totalCars: 4,
        nitroPct: Math.round(car.nitroPct),
        collisionImpact: collisionImpact,
        offroad: offroad,
        raceState: car.finished ? 'finished' : countingDown ? 'countdown' : 'racing',
        lapTimeMs: car.lapStartAt > 0 ? now - car.lapStartAt : 0,
        bestLapMs: car.bestLapMs
      });
    }

    if (car.finished) {
      if (opts && opts.onFinish) {
        opts.onFinish({
          position: myPos,
          totalTimeMs: Math.max(1000, now - car.raceStartAt),
          bestLapMs: car.bestLapMs
        });
      }
      return;
    }

    rafId = requestAnimationFrame(loop);
  }

  function drawFallbackCar(x, y, sc, bodyCol, trimCol, tiltRad, nitroOn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.rotate(tiltRad);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, 12, 54, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#090d16';
    ctx.fillRect(-50, -10, 14, 22);
    ctx.fillRect(36, -10, 14, 22);
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-42, 8); ctx.lineTo(-34, -22); ctx.lineTo(34, -22); ctx.lineTo(42, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trimCol; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-22, -20, 44, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-32, -3, 14, 7);
    ctx.fillRect(18, -3, 14, 7);
    if (nitroOn) {
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath(); ctx.arc(-16, 12, 7 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(16, 12, 7 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  rafId = requestAnimationFrame(loop);

  return {
    setGyroInput: function (inp, ttlMs, playerSlot) {
      var slot = playerSlot || inp.playerSlot || 1;
      var target = slot === 2 ? p2GyroState : gyroState;
      target.steer = inp.steer || 0;
      target.throttle = inp.throttle || 0;
      target.brake = inp.brake || 0;
      target.nitro = Boolean(inp.nitro);
      target.handbrake = Boolean(inp.handbrake);
      target.expiresAt = Date.now() + (ttlMs || 900);
    },
    setRemoteKey: function (k) {
      keyState.left = Boolean(k.left);
      keyState.right = Boolean(k.right);
      keyState.up = Boolean(k.up);
      keyState.down = Boolean(k.down);
      keyState.nitro = Boolean(k.nitro);
      keyState.handbrake = Boolean(k.handbrake);
    },
    cycleCamera: function () { camModeIdx = (camModeIdx + 1) % 3; },
    triggerHorn: function () { if (typeof playTvGameBeep === 'function') playTvGameBeep(390, 0.14, 'sawtooth', 0.08); },
    resetRace: function () { resetRace(); if (!rafId && !destroyed) rafId = requestAnimationFrame(loop); },
    destroy: function () {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      stageEl.innerHTML = '';
    }
  };
}

function connectTvRacingGyroWs(roomId, statusBadgeEl) {
  if (!window.WebSocket) return;
  try {
    var ws = new WebSocket(getTvRacingWsUrl());
    tvRacingWs = ws;
    ws.onopen = function () {
      if (tvRacingWs !== ws) return;
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomId: roomId, roomName: 'Nitro GP 3D', user: { id: 'tv-race-' + roomId, name: 'Smart TV 3D', avatar: '🏎️', color: '#7C3AED', isHost: true } }
      }));
      ws.send(JSON.stringify({
        type: 'GYRO_CONTROLLER_JOIN',
        payload: { roomId: roomId, role: 'display', deviceName: isTizenDevice ? 'Samsung Tizen 3D' : 'Smart TV 3D' }
      }));
    };
    ws.onmessage = function (ev) {
      if (tvRacingWs !== ws) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
          tvRacingHasController = Boolean(msg.payload.hasController);
          var cList = msg.payload.controllers || [];
          var hasP2 = cList.length >= 2;
          for (var ci = 0; ci < cList.length; ci++) {
            if (cList[ci] && cList[ci].slot === 2) hasP2 = true;
          }
          if (window.RiffanRacing3D && window.RiffanRacing3D.setPlayer2Connected) {
            window.RiffanRacing3D.setPlayer2Connected(hasP2);
          }
          if (statusBadgeEl) {
            if (tvRacingHasController) {
              var dev = cList[0] && cList[0].deviceName ? cList[0].deviceName : 'Móvil';
              statusBadgeEl.className = 'tv-game-hud-pill accent-green';
              statusBadgeEl.textContent = hasP2
                ? '📱 2P Split Screen (' + cList.length + ' móviles)'
                : '📱 Volante conectado (' + dev + ')';
            } else {
              statusBadgeEl.className = 'tv-game-hud-pill accent-purple';
              statusBadgeEl.textContent = '📱 Escanea el QR con 1 o 2 móviles';
            }
          }
        } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
          var inp = msg.payload;
          var pSlot = inp.playerSlot === 2 ? 2 : 1;
          var parsedInp = {
            playerSlot: pSlot,
            steer: typeof inp.steer === 'number' ? inp.steer : 0,
            throttle: typeof inp.throttle === 'number' ? inp.throttle : 0,
            brake: typeof inp.brake === 'number' ? inp.brake : 0,
            nitro: Boolean(inp.nitro),
            handbrake: Boolean(inp.handbrake),
            cameraCycle: Boolean(inp.cameraCycle),
            horn: Boolean(inp.horn)
          };
          if (tvRacingEngineHandle && tvRacingEngineHandle.setGyroInput) {
            tvRacingEngineHandle.setGyroInput(parsedInp, 900, pSlot);
          } else if (window.RiffanRacing3D && window.RiffanRacing3D.setGyroInput) {
            window.RiffanRacing3D.setGyroInput(parsedInp, 900, pSlot);
          }
          if (pSlot === 1 && inp.cameraCycle) {
            if (tvRacingEngineHandle && tvRacingEngineHandle.cycleCamera) tvRacingEngineHandle.cycleCamera();
          }
          if (inp.horn) {
            if (tvRacingEngineHandle && tvRacingEngineHandle.triggerHorn) tvRacingEngineHandle.triggerHorn();
            else if (window.RiffanRacing3D && window.RiffanRacing3D.triggerHorn) window.RiffanRacing3D.triggerHorn();
          }
        }
      } catch (e) {}
    };
    ws.onclose = function () {
      if (tvRacingWs === ws && TV_GAME_ACTIVE === 'racing3d') {
        setTimeout(function () {
          if (TV_GAME_ACTIVE === 'racing3d') connectTvRacingGyroWs(roomId, statusBadgeEl);
        }, 2500);
      }
    };
  } catch (e) {}
}

function startTvRacingGame(scr) {
  var raceRoom = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('race-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  tvRacingRoomId = raceRoom;
  tvRacingFinished = false;
  tvRacingHasController = false;
  tvRacingUsingFallback = false;

  var volanteUrl = getTvRacingPublicOrigin() + '/volante?room=' + encodeURIComponent(raceRoom) + '&game=racing3d';
  var qrMarkup = typeof buildQrSvgMarkup === 'function' ? buildQrSvgMarkup(volanteUrl) : '';

  scr.innerHTML =
    '<div class="tv-game-topbar">' +
    '<div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">🏎️ Nitro GP 3D</div>' +
    '</div>' +
    '<div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="race-gyro-pill">📱 Escanea el QR con tu móvil</div>' +
    '<button type="button" id="btn-race-cam" class="tv-btn" tabindex="0">Cámara</button>' +
    '<button type="button" id="btn-race-restart" class="tv-btn" tabindex="0">Reiniciar</button>' +
    '</div></div>' +
    '<div class="tv-game-arena">' +
    '<div id="tv-racing-stage" class="tv-racing-stage"></div>' +
    '<div class="tv-game-qr-card" id="race-qr-card">' +
    '<div class="tv-game-qr-title">VOLANTE GIROSCÓPICO</div>' +
    '<div class="tv-game-qr-box" id="race-qr-box">' + qrMarkup + '</div>' +
    '<div style="font-size:11px;color:#cbd5e1;font-weight:700;">Abre en tu teléfono o ve a /volante</div>' +
    '<div class="tv-game-qr-code">Sala: ' + escapeHtml(raceRoom) + '</div>' +
    '</div>' +
    '<div class="tv-racing-telemetry-bar">' +
    '<div class="tv-racing-stat"><div class="tv-racing-stat-lbl">VELOCIDAD</div><div class="tv-racing-stat-val" id="race-hud-kmh">0 KM/H</div></div>' +
    '<div class="tv-racing-stat"><div class="tv-racing-stat-lbl">MARCHA</div><div class="tv-racing-stat-val" id="race-hud-gear">1</div></div>' +
    '<div class="tv-racing-stat"><div class="tv-racing-stat-lbl">VUELTA</div><div class="tv-racing-stat-val" id="race-hud-lap">1/3</div></div>' +
    '<div class="tv-racing-stat"><div class="tv-racing-stat-lbl">POS</div><div class="tv-racing-stat-val" id="race-hud-pos">4/4</div></div>' +
    '<div class="tv-racing-stat" style="margin-right:0;"><div class="tv-racing-stat-lbl">NITRO</div><div class="tv-racing-stat-val" id="race-hud-nitro">100%</div></div>' +
    '</div>' +
    '<div class="tv-game-finish-overlay" id="race-finish-ov">' +
    '<div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="race-fin-title">🏁 ¡META ALCANZADA!</div>' +
    '<div class="tv-game-finish-sub" id="race-fin-sub">Posición final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-race-replay" class="tv-btn-primary" tabindex="0">Correr otra vez (OK)</button>' +
    '<button type="button" id="btn-race-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Mando TV: ▲ Acelerar · ▼ Freno · ◀ ▶ Girar · OK Nitro</span>' +
    '<span>Móvil: Escanea el QR para conducir inclinando tu smartphone (Giroscopio 30Hz + Vibración)</span>' +
    '</div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-race-exit').onclick = closeTvGame;
  document.getElementById('btn-race-cam').onclick = function () {
    if (tvRacingEngineHandle && tvRacingEngineHandle.cycleCamera) tvRacingEngineHandle.cycleCamera();
    else if (window.RiffanRacing3D && window.RiffanRacing3D.cycleCamera) window.RiffanRacing3D.cycleCamera();
  };
  function restartRace() {
    tvRacingFinished = false;
    var ov = document.getElementById('race-finish-ov');
    if (ov) ov.style.display = 'none';
    if (tvRacingEngineHandle && tvRacingEngineHandle.resetRace) tvRacingEngineHandle.resetRace();
    else if (window.RiffanRacing3D && window.RiffanRacing3D.resetRace) window.RiffanRacing3D.resetRace();
  }
  document.getElementById('btn-race-restart').onclick = restartRace;
  document.getElementById('btn-race-replay').onclick = restartRace;

  var stageEl = document.getElementById('tv-racing-stage');
  var statusPill = document.getElementById('race-gyro-pill');
  var kmhEl = document.getElementById('race-hud-kmh');
  var gearEl = document.getElementById('race-hud-gear');
  var lapEl = document.getElementById('race-hud-lap');
  var posEl = document.getElementById('race-hud-pos');
  var nitroEl = document.getElementById('race-hud-nitro');
  var finOv = document.getElementById('race-finish-ov');
  var finTitle = document.getElementById('race-fin-title');
  var finSub = document.getElementById('race-fin-sub');

  var racingHooks = {
    onTelemetry: function (t) {
      if (kmhEl) kmhEl.textContent = Math.round(t.speedKmh || 0) + ' KM/H';
      if (gearEl) gearEl.textContent = String(t.gear || 1);
      if (lapEl) lapEl.textContent = String(t.lap || 1) + '/' + String(t.totalLaps || 3);
      if (posEl) posEl.textContent = String(t.position || 1) + '/' + String(t.totalCars || 4);
      if (nitroEl) nitroEl.textContent = Math.round(t.nitroPct || 0) + '%';

      var nowMs = Date.now();
      if (tvRacingWs && tvRacingWs.readyState === 1 && tvRacingHasController && nowMs - tvRacingTelemetryPushAt >= 65) {
        tvRacingTelemetryPushAt = nowMs;
        try {
          tvRacingWs.send(JSON.stringify({
            type: 'RACING_TV_TELEMETRY',
            payload: {
              roomId: raceRoom, speedKmh: t.speedKmh, rpmPct: t.rpmPct, gear: t.gear, lap: t.lap, totalLaps: t.totalLaps,
              position: t.position, totalCars: t.totalCars, nitroPct: t.nitroPct, collisionImpact: t.collisionImpact,
              offroad: Boolean(t.offroad), raceState: t.raceState, lapTimeMs: t.lapTimeMs, bestLapMs: t.bestLapMs, targetSlot: 1
            }
          }));
          if (t.splitScreenActive && typeof t.p2SpeedKmh === 'number') {
            tvRacingWs.send(JSON.stringify({
              type: 'RACING_TV_TELEMETRY',
              payload: {
                roomId: raceRoom, speedKmh: t.p2SpeedKmh, rpmPct: Math.min(99, 18 + Math.round((t.p2SpeedKmh % 60) * 1.3)),
                gear: Math.min(7, Math.max(1, Math.floor(t.p2SpeedKmh / 48) + 1)), lap: t.p2Lap || 1, totalLaps: t.totalLaps,
                position: t.p2Position || 2, totalCars: t.totalCars, nitroPct: typeof t.p2NitroPct === 'number' ? t.p2NitroPct : 100,
                collisionImpact: t.p2CollisionImpact || 0, offroad: false, raceState: t.raceState, targetSlot: 2
              }
            }));
          }
        } catch (e) {}
      }
    },
    onFinish: function (summary) {
      tvRacingFinished = true;
      if (finTitle) {
        finTitle.textContent = summary.position === 1 ? '🏆 ¡1º PUESTO · CAMPEÓN GP!' : '🏁 ¡POSICIÓN #' + summary.position + '!';
      }
      if (finSub) {
        finSub.textContent = 'Tiempo total: ' + formatLapClockMs(summary.totalTimeMs) +
          (summary.bestLapMs > 0 ? ' · Mejor vuelta: ' + formatLapClockMs(summary.bestLapMs) : '');
      }
      if (finOv) {
        finOv.style.display = '-webkit-flex';
        finOv.style.display = 'flex';
      }
      var rb = document.getElementById('btn-race-replay');
      if (rb && rb.focus) rb.focus();
    },
    onContextLost: function () {
      if (typeof showToast === 'function') showToast('Cambiando a modo GP turbo fluido...');
      if (!tvRacingUsingFallback && stageEl && TV_GAME_ACTIVE === 'racing3d') {
        unmountActiveRacingEngine();
        tvRacingUsingFallback = true;
        tvRacingEngineHandle = mountEs5RacingFallback(stageEl, racingHooks);
      }
    }
  };

  function bootRacingEngineOrFallback() {
    if (TV_GAME_ACTIVE !== 'racing3d' || !stageEl) return;
    if (window.RiffanRacing3D && window.RiffanRacing3D.mount) {
      try {
        window.RiffanRacing3D.mount(stageEl, racingHooks);
        return;
      } catch (mountErr) {}
    }
    tvRacingUsingFallback = true;
    tvRacingEngineHandle = mountEs5RacingFallback(stageEl, racingHooks);
  }

  if (window.RiffanRacing3D && window.RiffanRacing3D.mount) {
    bootRacingEngineOrFallback();
  } else {
    if (stageEl) {
      stageEl.innerHTML = '<div style="padding:48px 24px;text-align:center;color:#e2e8f0;font-size:18px;font-weight:800;">Iniciando Nitro GP 3D...</div>';
    }
    var mountedOnce = false;
    var safetyTimer = setTimeout(function () {
      if (mountedOnce || TV_GAME_ACTIVE !== 'racing3d') return;
      mountedOnce = true;
      bootRacingEngineOrFallback();
    }, 1400);

    try {
      var sEl = document.createElement('script');
      sEl.src = '/vendor/riffan-racing-3d.iife.js?_upd=' + Date.now();
      sEl.async = true;
      sEl.onload = function () {
        if (mountedOnce || TV_GAME_ACTIVE !== 'racing3d') return;
        mountedOnce = true;
        clearTimeout(safetyTimer);
        bootRacingEngineOrFallback();
      };
      sEl.onerror = function () {
        if (mountedOnce || TV_GAME_ACTIVE !== 'racing3d') return;
        mountedOnce = true;
        clearTimeout(safetyTimer);
        bootRacingEngineOrFallback();
      };
      document.head.appendChild(sEl);
    } catch (eLoad) {
      mountedOnce = true;
      clearTimeout(safetyTimer);
      bootRacingEngineOrFallback();
    }
  }

  connectTvRacingGyroWs(raceRoom, statusPill);

  function syncRemoteKeys() {
    if (tvRacingEngineHandle && tvRacingEngineHandle.setRemoteKey) tvRacingEngineHandle.setRemoteKey(tvRacingRemoteKeys);
    else if (window.RiffanRacing3D && window.RiffanRacing3D.setRemoteKey) window.RiffanRacing3D.setRemoteKey(tvRacingRemoteKeys);
  }
  tvGameKeyHandler = function (e, code) {
    if (tvRacingFinished && (code === 13 || code === 23 || code === 66 || code === 32)) { if (e.preventDefault) e.preventDefault(); restartRace(); return true; }
    if (code === 37 || code === 21) { tvRacingRemoteKeys.left = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 39 || code === 22) { tvRacingRemoteKeys.right = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 38 || code === 19) { tvRacingRemoteKeys.up = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 40 || code === 20) { tvRacingRemoteKeys.down = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { tvRacingRemoteKeys.nitro = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 67 || code === 166 || code === 427) {
      if (tvRacingEngineHandle && tvRacingEngineHandle.cycleCamera) tvRacingEngineHandle.cycleCamera();
      else if (window.RiffanRacing3D && window.RiffanRacing3D.cycleCamera) window.RiffanRacing3D.cycleCamera();
      if (e.preventDefault) e.preventDefault(); return true;
    }
    if (code === 82) { restartRace(); if (e.preventDefault) e.preventDefault(); return true; }
    return false;
  };
  tvGameKeyUpHandler = function (_e, code) {
    if (code === 37 || code === 21) { tvRacingRemoteKeys.left = false; syncRemoteKeys(); return true; }
    if (code === 39 || code === 22) { tvRacingRemoteKeys.right = false; syncRemoteKeys(); return true; }
    if (code === 38 || code === 19) { tvRacingRemoteKeys.up = false; syncRemoteKeys(); return true; }
    if (code === 40 || code === 20) { tvRacingRemoteKeys.down = false; syncRemoteKeys(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { tvRacingRemoteKeys.nitro = false; syncRemoteKeys(); return true; }
    return false;
  };
}
window.startTvRacingGame = startTvRacingGame;
