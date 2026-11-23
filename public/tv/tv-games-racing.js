// ===================================================================
// SMART TV 3D CAR RACING + MOBILE PHONE GYROSCOPE SYNC (STRICT ES5)
// Connects window.RiffanRacing3D WebGL engine with /volante?room=CODE
// ===================================================================
var tvRacingWs = null;
var tvRacingRoomId = '';
var tvRacingTelemetryPushAt = 0;
var tvRacingHasController = false;
var tvRacingFinished = false;
var tvRacingRemoteKeys = {
  left: false,
  right: false,
  up: false,
  down: false,
  nitro: false,
  handbrake: false
};

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

function closeTvRacingGame() {
  if (window.RiffanRacing3D && window.RiffanRacing3D.unmount) {
    try { window.RiffanRacing3D.unmount(); } catch (e) {}
  }
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

function connectTvRacingGyroWs(roomId, statusBadgeEl) {
  if (!window.WebSocket) return;
  try {
    var ws = new WebSocket(getTvRacingWsUrl());
    tvRacingWs = ws;
    ws.onopen = function () {
      if (tvRacingWs !== ws) return;
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: {
          roomId: roomId,
          roomName: 'Nitro GP 3D',
          user: {
            id: 'tv-race-' + roomId,
            name: 'Smart TV 3D',
            avatar: '🏎️',
            color: '#7C3AED',
            isHost: true
          }
        }
      }));
      ws.send(JSON.stringify({
        type: 'GYRO_CONTROLLER_JOIN',
        payload: {
          roomId: roomId,
          role: 'display',
          deviceName: isTizenDevice ? 'Samsung Tizen 3D' : 'Smart TV 3D'
        }
      }));
    };
    ws.onmessage = function (ev) {
      if (tvRacingWs !== ws) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
          tvRacingHasController = Boolean(msg.payload.hasController);
          if (statusBadgeEl) {
            if (tvRacingHasController) {
              var cList = msg.payload.controllers || [];
              var dev = cList[0] && cList[0].deviceName ? cList[0].deviceName : 'Móvil';
              statusBadgeEl.className = 'tv-game-hud-pill accent-green';
              statusBadgeEl.textContent = '📱 Volante conectado (' + dev + ')';
            } else {
              statusBadgeEl.className = 'tv-game-hud-pill accent-purple';
              statusBadgeEl.textContent = '📱 Escanea el QR con tu móvil';
            }
          }
        } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload && window.RiffanRacing3D) {
          var inp = msg.payload;
          window.RiffanRacing3D.setGyroInput({
            steer: typeof inp.steer === 'number' ? inp.steer : 0,
            throttle: typeof inp.throttle === 'number' ? inp.throttle : 0,
            brake: typeof inp.brake === 'number' ? inp.brake : 0,
            nitro: Boolean(inp.nitro),
            handbrake: Boolean(inp.handbrake)
          }, 900);
          if (inp.cameraCycle && window.RiffanRacing3D.cycleCamera) {
            window.RiffanRacing3D.cycleCamera();
          }
          if (inp.horn && window.RiffanRacing3D.triggerHorn) {
            window.RiffanRacing3D.triggerHorn();
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

  var volanteUrl = getTvRacingPublicOrigin() + '/volante?room=' + encodeURIComponent(raceRoom);
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
    if (window.RiffanRacing3D && window.RiffanRacing3D.cycleCamera) window.RiffanRacing3D.cycleCamera();
  };
  function restartRace() {
    tvRacingFinished = false;
    var ov = document.getElementById('race-finish-ov');
    if (ov) ov.style.display = 'none';
    if (window.RiffanRacing3D && window.RiffanRacing3D.resetRace) window.RiffanRacing3D.resetRace();
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

  if (!window.RiffanRacing3D || !window.RiffanRacing3D.mount) {
    if (stageEl) {
      stageEl.innerHTML = '<div style="padding:40px;text-align:center;color:#fda4af;font-size:18px;font-weight:800;">Motor 3D cargando... Recarga o comprueba WebGL en este televisor.</div>';
    }
    return;
  }

  window.RiffanRacing3D.mount(stageEl, {
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
              roomId: raceRoom,
              speedKmh: t.speedKmh,
              rpmPct: t.rpmPct,
              gear: t.gear,
              lap: t.lap,
              totalLaps: t.totalLaps,
              position: t.position,
              totalCars: t.totalCars,
              nitroPct: t.nitroPct,
              collisionImpact: t.collisionImpact,
              offroad: Boolean(t.offroad),
              raceState: t.raceState,
              lapTimeMs: t.lapTimeMs,
              bestLapMs: t.bestLapMs
            }
          }));
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
      if (typeof showToast === 'function') showToast('WebGL TV liberó memoria. Reiniciando vista...');
    }
  });

  connectTvRacingGyroWs(raceRoom, statusPill);

  function syncRemoteKeys() {
    if (window.RiffanRacing3D && window.RiffanRacing3D.setRemoteKey) {
      window.RiffanRacing3D.setRemoteKey(tvRacingRemoteKeys);
    }
  }

  tvGameKeyHandler = function (e, code) {
    if (tvRacingFinished && (code === 13 || code === 23 || code === 66 || code === 32)) {
      if (e.preventDefault) e.preventDefault();
      restartRace();
      return true;
    }
    if (code === 37 || code === 21) { tvRacingRemoteKeys.left = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 39 || code === 22) { tvRacingRemoteKeys.right = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 38 || code === 19) { tvRacingRemoteKeys.up = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 40 || code === 20) { tvRacingRemoteKeys.down = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { tvRacingRemoteKeys.nitro = true; syncRemoteKeys(); if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 67 || code === 166 || code === 427) {
      if (window.RiffanRacing3D && window.RiffanRacing3D.cycleCamera) window.RiffanRacing3D.cycleCamera();
      if (e.preventDefault) e.preventDefault();
      return true;
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
