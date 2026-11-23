// ===================================================================
// SMART TV MOBILE GYROSCOPE ARCADE GAMES (STRICT ES5, <= 700 LOC)
// 1. gyrohockey — Neon Air Hockey & Smash Gyro (/volante?game=gyrohockey)
// 2. gyrospace  — Galaxia Interceptor Gyro     (/volante?game=gyrospace)
// ===================================================================
var tvGyroArcadeWs = null;
var tvGyroInput = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
var tvGyroHasController = false;
var tvGyroTelemPushAt = 0;
var GYRO_BOOM_FRAMES = [
  'assets/games/explosion/groundExplosion00.png', 'assets/games/explosion/groundExplosion01.png',
  'assets/games/explosion/groundExplosion02.png', 'assets/games/explosion/groundExplosion03.png',
  'assets/games/explosion/groundExplosion04.png', 'assets/games/explosion/groundExplosion05.png',
  'assets/games/explosion/groundExplosion06.png', 'assets/games/explosion/groundExplosion07.png',
  'assets/games/explosion/groundExplosion08.png'
];
function gyroSpr(c, p, x, y, w, h, r) { return typeof window.drawTvSprite === 'function' ? window.drawTvSprite(c, p, x, y, w, h, r) : false; }
function gyroTiled(c, p, w, h, sx, sy) { return typeof window.drawTvTiledBg === 'function' ? window.drawTvTiledBg(c, p, w, h, sx, sy) : false; }
function preloadGyroSpr() {
  if (typeof window.preloadTvGameSprites === 'function') {
    window.preloadTvGameSprites([
      'assets/games/space/darkPurple.png', 'assets/games/space/playerShip1_blue.png',
      'assets/games/space/fire00.png', 'assets/games/space/shield3.png',
      'assets/games/space/enemyRed3.png', 'assets/games/space/meteorBrown_big1.png',
      'assets/games/space/laserBlue01.png', 'assets/games/puzzle/ballGrey.png',
      'assets/games/puzzle/particleStar.png'
    ].concat(GYRO_BOOM_FRAMES));
  }
}

function closeTvGyroArcadeGame() {
  if (tvGyroArcadeWs) {
    tvGyroArcadeWs.onclose = null;
    try { tvGyroArcadeWs.close(); } catch (e) {}
    tvGyroArcadeWs = null;
  }
  tvGyroInput = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
  tvGyroHasController = false;
}
window.closeTvGyroArcadeGame = closeTvGyroArcadeGame;

function buildGyroVolanteUrl(roomId, gameId) {
  var origin = (typeof getTvRacingPublicOrigin === 'function')
    ? getTvRacingPublicOrigin()
    : (window.location.origin || ('https://' + (window.location.host || 'localhost')));
  return origin + '/volante?room=' + encodeURIComponent(roomId) + '&game=' + encodeURIComponent(gameId);
}

function connectGyroArcadeWs(roomId, gameId, statusPillEl) {
  if (!window.WebSocket || typeof getTvRacingWsUrl !== 'function') return;
  try {
    var ws = new WebSocket(getTvRacingWsUrl());
    tvGyroArcadeWs = ws;
    ws.onopen = function () {
      if (tvGyroArcadeWs !== ws) return;
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomId: roomId, roomName: gameId.toUpperCase(), user: { id: 'tv-gyro-' + roomId, name: 'Smart TV', avatar: '🎮', color: '#7C3AED', isHost: true } }
      }));
      ws.send(JSON.stringify({
        type: 'GYRO_CONTROLLER_JOIN',
        payload: { roomId: roomId, role: 'display', deviceName: 'Smart TV Arcade' }
      }));
    };
    ws.onmessage = function (ev) {
      if (tvGyroArcadeWs !== ws) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
          tvGyroHasController = Boolean(msg.payload.hasController);
          if (statusPillEl) {
            if (tvGyroHasController) {
              var list = msg.payload.controllers || [];
              var dev = list[0] && list[0].deviceName ? list[0].deviceName : 'Móvil';
              statusPillEl.className = 'tv-game-hud-pill accent-green';
              statusPillEl.textContent = '📱 Gyro conectado (' + dev + ')';
            } else {
              statusPillEl.className = 'tv-game-hud-pill accent-purple';
              statusPillEl.textContent = '📱 Escanea el QR para Giroscopio';
            }
          }
        } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
          var p = msg.payload;
          tvGyroInput.steer = typeof p.steer === 'number' ? p.steer : 0;
          tvGyroInput.throttle = typeof p.throttle === 'number' ? p.throttle : 0;
          tvGyroInput.brake = typeof p.brake === 'number' ? p.brake : 0;
          tvGyroInput.nitro = Boolean(p.nitro);
          tvGyroInput.handbrake = Boolean(p.handbrake);
          tvGyroInput.expiresAt = Date.now() + 900;
        }
      } catch (e) {}
    };
    ws.onclose = function () {
      if (tvGyroArcadeWs === ws && (TV_GAME_ACTIVE === 'gyrohockey' || TV_GAME_ACTIVE === 'gyrospace')) {
        setTimeout(function () {
          if (TV_GAME_ACTIVE === gameId) connectGyroArcadeWs(roomId, gameId, statusPillEl);
        }, 2500);
      }
    };
  } catch (e) {}
}

function pushGyroArcadeTelemetry(roomId, speedKmh, scoreLeft, scoreRight, energyPct, impact, stateStr) {
  var now = Date.now();
  if (!tvGyroArcadeWs || tvGyroArcadeWs.readyState !== 1 || !tvGyroHasController) return;
  if (now - tvGyroTelemPushAt < 85) return;
  tvGyroTelemPushAt = now;
  try {
    tvGyroArcadeWs.send(JSON.stringify({
      type: 'RACING_TV_TELEMETRY',
      payload: {
        roomId: roomId,
        speedKmh: Math.min(500, Math.max(0, Math.round(speedKmh || 0))),
        rpmPct: Math.min(100, Math.max(0, Math.round(energyPct || 50))),
        gear: Math.min(8, Math.max(1, Number(scoreLeft || 1))),
        lap: Math.min(99, Math.max(1, Number(scoreLeft || 0) + 1)),
        totalLaps: Math.min(99, Math.max(1, Number(scoreRight || 5))),
        position: 1, totalCars: 2,
        nitroPct: Math.min(100, Math.max(0, Math.round(energyPct || 0))),
        collisionImpact: Math.min(1, Math.max(0, impact || 0)),
        offroad: false, raceState: stateStr || 'racing'
      }
    }));
  } catch (e) {}
}

// ===================================================================
// GAME 4: NEON AIR HOCKEY GYRO (60FPS 3-SUBSTEP + SPARKS + SMASH)
// ===================================================================
function startGyroHockeyGame(scr) {
  var roomId = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('ah-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  var ctrlUrl = buildGyroVolanteUrl(roomId, 'gyrohockey');
  var qrMarkup = typeof buildQrSvgMarkup === 'function' ? buildQrSvgMarkup(ctrlUrl) : '';

  scr.innerHTML =
    '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">🏒 Neon Air Hockey Gyro</div></div><div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="ah-gyro-pill">📱 Escanea el QR para Giroscopio</div>' +
    '<div class="tv-game-hud-pill accent-green" id="ah-score-pill">TÚ 0 - 0 CPU</div>' +
    '<div class="tv-game-hud-pill" id="ah-smash-pill">SMASH 100%</div></div></div>' +
    '<div class="tv-game-arena">' +
    '<canvas id="tv-ah-canvas" class="tv-game-canvas" width="920" height="520"></canvas>' +
    '<div class="tv-game-qr-card" style="width:172px;padding:9px;top:12px;right:12px;">' +
    '<div class="tv-game-qr-title" style="font-size:11px;">PALA GIROSCÓPICA</div>' +
    '<div class="tv-game-qr-box" style="width:108px;height:108px;margin:5px auto;">' + qrMarkup + '</div>' +
    '<div class="tv-game-qr-code" style="font-size:11px;">Sala: ' + escapeHtml(roomId) + '</div></div>' +
    '<div class="tv-game-finish-overlay" id="ah-finish-ov"><div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="ah-fin-title">🏆 ¡CAMPEÓN NEON!</div>' +
    '<div class="tv-game-finish-sub" id="ah-fin-sub">Marcador final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-ah-replay" class="tv-btn-primary" tabindex="0">Jugar otra vez (OK)</button>' +
    '<button type="button" id="btn-ah-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Móvil: Inclina ◀ ▶ para mover la pala · Botón SMASH para remate supersónico</span>' +
    '<span>Mando TV: ◀ ▶ ▲ ▼ Mover pala · OK Super Smash · Primero a 5 goles</span></div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-ah-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-ah-canvas');
  var ctx = canvas.getContext('2d');
  var scorePill = document.getElementById('ah-score-pill');
  var smashPill = document.getElementById('ah-smash-pill');
  var finOv = document.getElementById('ah-finish-ov');
  var finTitle = document.getElementById('ah-fin-title');
  var finSub = document.getElementById('ah-fin-sub');

  preloadGyroSpr();
  connectGyroArcadeWs(roomId, 'gyrohockey', document.getElementById('ah-gyro-pill'));

  var W = 920, H = 520, pad = 28, goalHalfW = 114;
  var goalLeft = W / 2 - goalHalfW, goalRight = W / 2 + goalHalfW, MR = 29, PR = 17;
  var keys = { left: false, right: false, up: false, down: false, smash: false };
  var sparks = [], puckTrail = [];
  var st = {
    sMe: 0, sCpu: 0, over: false, pauseT: 0, banner: '', bannerCol: '#38BDF8',
    smashCharge: 100, impactFlash: 0,
    me: { x: W / 2, y: H - 78, vx: 0, vy: 0 },
    cpu: { x: W / 2, y: 78, vx: 0, vy: 0 },
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 }
  };

  function servePuck(dirY) {
    st.me.x = W / 2; st.me.y = H - 78; st.me.vx = 0; st.me.vy = 0;
    st.cpu.x = W / 2; st.cpu.y = 78; st.cpu.vx = 0; st.cpu.vy = 0;
    st.puck.x = W / 2; st.puck.y = H / 2;
    st.puck.vx = (Math.random() - 0.5) * 260; st.puck.vy = dirY * 260;
    puckTrail = [];
  }

  function resetHockey() {
    st.sMe = 0; st.sCpu = 0; st.over = false; st.pauseT = 0; st.banner = ''; st.smashCharge = 100;
    finOv.style.display = 'none'; servePuck(1); syncHud();
  }
  document.getElementById('btn-ah-replay').onclick = resetHockey;

  function syncHud() {
    scorePill.textContent = 'TÚ ' + st.sMe + ' - ' + st.sCpu + ' CPU';
    smashPill.textContent = 'SMASH ' + Math.round(st.smashCharge) + '%';
  }

  function spawnSparks(x, y, col, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 340;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, color: col });
    }
  }

  tvGameKeyHandler = function (e, code) {
    if (st.over && (code === 13 || code === 23 || code === 66 || code === 32)) {
      if (e.preventDefault) e.preventDefault();
      resetHockey(); return true;
    }
    if (code === 37 || code === 21) { keys.left = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 39 || code === 22) { keys.right = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 38 || code === 19) { keys.up = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 40 || code === 20) { keys.down = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.smash = true; if (e.preventDefault) e.preventDefault(); return true; }
    return false;
  };
  tvGameKeyUpHandler = function (_e, code) {
    if (code === 37 || code === 21) { keys.left = false; return true; }
    if (code === 39 || code === 22) { keys.right = false; return true; }
    if (code === 38 || code === 19) { keys.up = false; return true; }
    if (code === 40 || code === 20) { keys.down = false; return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.smash = false; return true; }
    return false;
  };

  function hitMallet(m, smashPower) {
    var pk = st.puck, dx = pk.x - m.x, dy = pk.y - m.y, minD = MR + PR, dSq = dx * dx + dy * dy;
    if (dSq >= minD * minD || dSq < 0.001) return false;
    var d = Math.sqrt(dSq), nx = dx / d, ny = dy / d;
    pk.x = m.x + nx * (minD + 1.5); pk.y = m.y + ny * (minD + 1.5);
    var spd = Math.min(1150, Math.max(460, Math.hypot(pk.vx, pk.vy) * 1.06 + smashPower));
    pk.vx = nx * spd + m.vx * 0.35; pk.vy = ny * spd + m.vy * 0.35;
    spawnSparks(pk.x - nx * PR, pk.y - ny * PR, smashPower > 120 ? '#FACC15' : '#38BDF8', 12);
    st.impactFlash = 0.7;
    playTvGameBeep(smashPower > 120 ? 520 : 340, 0.07, 'triangle', 0.08);
    return true;
  }

  var lastTs = performance.now();
  function loop(now) {
    if (TV_GAME_ACTIVE !== 'gyrohockey') return;
    var dt = Math.min(0.033, Math.max(0.004, (now - lastTs) / 1000));
    lastTs = now;
    st.impactFlash = Math.max(0, st.impactFlash - dt * 2.5);

    for (var si = sparks.length - 1; si >= 0; si--) {
      sparks[si].x += sparks[si].vx * dt; sparks[si].y += sparks[si].vy * dt; sparks[si].life -= dt;
      if (sparks[si].life <= 0) sparks.splice(si, 1);
    }

    if (!st.over) {
      if (st.pauseT > 0) {
        st.pauseT -= dt;
        if (st.pauseT <= 0) { st.banner = ''; servePuck(st.sMe > st.sCpu ? -1 : 1); }
      } else {
        var useGyro = Date.now() < tvGyroInput.expiresAt;
        var smashOn = (keys.smash || (useGyro && tvGyroInput.nitro)) && st.smashCharge > 10;
        st.smashCharge = smashOn ? Math.max(0, st.smashCharge - dt * 45) : Math.min(100, st.smashCharge + dt * 22);

        var sub = 3, sDt = dt / sub;
        for (var k = 0; k < sub; k++) {
          var prevMx = st.me.x, prevMy = st.me.y;
          if (useGyro && Math.abs(tvGyroInput.steer) > 0.03) {
            var targetX = W / 2 + tvGyroInput.steer * (W / 2 - pad - MR - 12);
            st.me.x += (targetX - st.me.x) * Math.min(1, sDt * 24);
          } else {
            st.me.x += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 580 * sDt;
          }
          var dirY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
          if (dirY === 0 && useGyro) dirY = tvGyroInput.throttle > 0.3 ? -1 : tvGyroInput.brake > 0.3 ? 1 : 0;
          st.me.y += dirY * 460 * sDt;
          st.me.x = Math.max(pad + MR, Math.min(W - pad - MR, st.me.x));
          st.me.y = Math.max(H / 2 + MR + 6, Math.min(H - pad - MR, st.me.y));
          st.me.vx = (st.me.x - prevMx) / sDt; st.me.vy = (st.me.y - prevMy) / sDt;

          var prevCx = st.cpu.x, prevCy = st.cpu.y;
          var aiGoalX = st.puck.y < H * 0.56 ? Math.max(pad + MR + 30, Math.min(W - pad - MR - 30, st.puck.x)) : W / 2;
          var aiGoalY = st.puck.y < H * 0.45 && st.puck.vy >= -40 ? Math.min(H / 2 - MR - 12, st.puck.y - 16) : 82;
          st.cpu.x += Math.max(-440 * sDt, Math.min(440 * sDt, aiGoalX - st.cpu.x));
          st.cpu.y += Math.max(-340 * sDt, Math.min(340 * sDt, aiGoalY - st.cpu.y));
          st.cpu.vx = (st.cpu.x - prevCx) / sDt; st.cpu.vy = (st.cpu.y - prevCy) / sDt;

          st.puck.x += st.puck.vx * sDt; st.puck.y += st.puck.vy * sDt;
          st.puck.vx *= Math.pow(0.996, sDt * 60); st.puck.vy *= Math.pow(0.996, sDt * 60);

          if (st.puck.x < pad + PR) { st.puck.x = pad + PR; st.puck.vx = Math.abs(st.puck.vx) * 0.92; spawnSparks(pad, st.puck.y, '#22D3EE', 5); }
          if (st.puck.x > W - pad - PR) { st.puck.x = W - pad - PR; st.puck.vx = -Math.abs(st.puck.vx) * 0.92; spawnSparks(W - pad, st.puck.y, '#22D3EE', 5); }

          var inGoalMouth = st.puck.x > goalLeft + PR * 0.5 && st.puck.x < goalRight - PR * 0.5;
          if (!inGoalMouth) {
            if (st.puck.y < pad + PR) { st.puck.y = pad + PR; st.puck.vy = Math.abs(st.puck.vy) * 0.92; spawnSparks(st.puck.x, pad, '#F43F5E', 5); }
            if (st.puck.y > H - pad - PR) { st.puck.y = H - pad - PR; st.puck.vy = -Math.abs(st.puck.vy) * 0.92; spawnSparks(st.puck.x, H - pad, '#8B5CF6', 5); }
          } else {
            if (st.puck.y < pad - 6) {
              st.sMe += 1; st.pauseT = 1.2; st.banner = '⚡ ¡GOLAZO NEON TUYO!'; st.bannerCol = '#4ADE80';
              spawnSparks(st.puck.x, pad, '#4ADE80', 28); playTvGameBeep(620, 0.24, 'triangle', 0.12); break;
            } else if (st.puck.y > H - pad + 6) {
              st.sCpu += 1; st.pauseT = 1.2; st.banner = '💥 ¡PUNTO PARA LA CPU!'; st.bannerCol = '#FB7185';
              spawnSparks(st.puck.x, H - pad, '#FB7185', 24); playTvGameBeep(200, 0.24, 'sawtooth', 0.1); break;
            }
          }
          hitMallet(st.me, smashOn ? 240 : 60);
          hitMallet(st.cpu, 40);
        }

        puckTrail.push({ x: st.puck.x, y: st.puck.y });
        if (puckTrail.length > 10) puckTrail.shift();

        if ((st.sMe >= 5 || st.sCpu >= 5) && st.pauseT <= 0) {
          st.over = true;
          finTitle.textContent = st.sMe > st.sCpu ? '🏆 ¡CAMPEÓN AIR HOCKEY!' : '🤖 VICTORIA PARA LA CPU';
          finSub.textContent = 'Resultado final: TÚ ' + st.sMe + ' - ' + st.sCpu + ' CPU';
          finOv.style.display = '-webkit-flex'; finOv.style.display = 'flex';
          var rb = document.getElementById('btn-ah-replay'); if (rb && rb.focus) rb.focus();
        }
        syncHud();
        pushGyroArcadeTelemetry(roomId, Math.hypot(st.puck.vx, st.puck.vy) * 0.32, st.sMe, st.sCpu, st.smashCharge, st.impactFlash, st.over ? 'finished' : 'racing');
      }
    }

    // Draw Cyber Neon Air Hockey Table
    ctx.fillStyle = '#050814'; ctx.fillRect(0, 0, W, H);
    var tableGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
    tableGrad.addColorStop(0, '#0f1b38'); tableGrad.addColorStop(1, '#080e1f');
    ctx.fillStyle = tableGrad; ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)'; ctx.lineWidth = 1;
    for (var gx = pad + 40; gx < W - pad; gx += 48) { ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, H - pad); ctx.stroke(); }
    for (var gy = pad + 40; gy < H - pad; gy += 48) { ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke(); }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, pad, 76, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H - pad, 76, Math.PI, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 6; ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

    ctx.fillStyle = '#04060e';
    ctx.fillRect(goalLeft, pad - 10, goalHalfW * 2, 16);
    ctx.fillRect(goalLeft, H - pad - 6, goalHalfW * 2, 16);
    ctx.strokeStyle = '#FB7185'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(goalLeft, pad); ctx.lineTo(goalRight, pad); ctx.stroke();
    ctx.strokeStyle = '#34D399'; ctx.beginPath(); ctx.moveTo(goalLeft, H - pad); ctx.lineTo(goalRight, H - pad); ctx.stroke();

    for (var ti = 0; ti < puckTrail.length; ti++) {
      ctx.globalAlpha = (ti / puckTrail.length) * 0.36; ctx.fillStyle = '#FACC15';
      ctx.beginPath(); ctx.arc(puckTrail[ti].x, puckTrail[ti].y, PR * (0.45 + 0.5 * (ti / puckTrail.length)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!gyroSpr(ctx, 'assets/games/puzzle/ballGrey.png', st.puck.x, st.puck.y, PR * 2.15, PR * 2.15, 0)) {
      ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(st.puck.x, st.puck.y, PR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5; ctx.stroke();
    }

    drawMallet(st.me.x, st.me.y, '#7C3AED', '#22D3EE');
    drawMallet(st.cpu.x, st.cpu.y, '#E11D48', '#FDA4AF');

    for (var spi = 0; spi < sparks.length; spi++) {
      var spk = sparks[spi]; ctx.globalAlpha = Math.max(0, spk.life * 2.2);
      if (!gyroSpr(ctx, 'assets/games/puzzle/particleStar.png', spk.x, spk.y, 12, 12, spk.life * 8)) {
        ctx.fillStyle = spk.color; ctx.fillRect(spk.x - 2, spk.y - 2, 5, 5);
      }
    }
    ctx.globalAlpha = 1;

    if (st.banner) {
      ctx.fillStyle = 'rgba(5, 8, 18, 0.85)'; ctx.fillRect(W / 2 - 220, H / 2 - 36, 440, 72);
      ctx.strokeStyle = st.bannerCol; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 220, H / 2 - 36, 440, 72);
      ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = st.bannerCol;
      ctx.fillText(st.banner, W / 2, H / 2 + 10);
    }
    TV_GAME_RAF = requestAnimationFrame(loop);
  }

  function drawMallet(x, y, fill, ring) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(x, y + 4, MR + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, MR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#0F172A'; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
  }

  resetHockey();
  TV_GAME_RAF = requestAnimationFrame(loop);
}
window.startGyroHockeyGame = startGyroHockeyGame;

// ===================================================================
// GAME 5: GALAXIA INTERCEPTOR GYRO (60FPS STARFIGHTER + ASTEROIDS)
// ===================================================================
function startGyroSpaceGame(scr) {
  var best = 0;
  try { best = Number(localStorage.getItem('naim_tv_space_best_v1') || '0') || 0; } catch (e) {}
  var roomId = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('sp-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  var ctrlUrl = buildGyroVolanteUrl(roomId, 'gyrospace');
  var qrMarkup = typeof buildQrSvgMarkup === 'function' ? buildQrSvgMarkup(ctrlUrl) : '';

  scr.innerHTML =
    '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">🚀 Galaxia Interceptor Gyro</div></div><div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="sp-gyro-pill">📱 Escanea el QR para Giroscopio</div>' +
    '<div class="tv-game-hud-pill accent-green" id="sp-score-pill">PUNTOS: 0</div>' +
    '<div class="tv-game-hud-pill" id="sp-hp-pill">ESCUDO: 100% · RÉCORD: ' + best + '</div></div></div>' +
    '<div class="tv-game-arena">' +
    '<canvas id="tv-sp-canvas" class="tv-game-canvas" width="920" height="520"></canvas>' +
    '<div class="tv-game-qr-card" style="width:172px;padding:9px;top:12px;right:12px;">' +
    '<div class="tv-game-qr-title" style="font-size:11px;">TIMÓN ESPACIAL GYRO</div>' +
    '<div class="tv-game-qr-box" style="width:108px;height:108px;margin:5px auto;">' + qrMarkup + '</div>' +
    '<div class="tv-game-qr-code" style="font-size:11px;">Sala: ' + escapeHtml(roomId) + '</div></div>' +
    '<div class="tv-game-finish-overlay" id="sp-finish-ov"><div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="sp-fin-title">💥 NAVE DESTRUIDA</div>' +
    '<div class="tv-game-finish-sub" id="sp-fin-sub">Puntuación final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-sp-replay" class="tv-btn-primary" tabindex="0">Despegar de nuevo (OK)</button>' +
    '<button type="button" id="btn-sp-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Móvil: Inclina ◀ ▶ para esquivar asteroides · Botón LÁSER / HIPER-ESCUDO</span>' +
    '<span>Mando TV: ◀ ▶ Esquivar · ▲ Escudo · OK Láser Doble</span></div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-sp-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-sp-canvas');
  var ctx = canvas.getContext('2d');
  var scorePill = document.getElementById('sp-score-pill');
  var hpPill = document.getElementById('sp-hp-pill');
  var finOv = document.getElementById('sp-finish-ov');
  var finSub = document.getElementById('sp-fin-sub');

  preloadGyroSpr();
  connectGyroArcadeWs(roomId, 'gyrospace', document.getElementById('sp-gyro-pill'));

  var W = 920, H = 520, keys = { left: false, right: false, up: false, fire: false };
  var stars = [];
  for (var si = 0; si < 75; si++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.4 + Math.random() * 1.6 });

  var sp = { x: W / 2, y: H - 72, bank: 0, hp: 100, score: 0, wave: 1, combo: 1, fireCd: 0, spawnCd: 0.4, shieldFlash: 0, over: false, bgScroll: 0, shieldOn: false, bullets: [], enemies: [], parts: [], booms: [] };

  function resetSpace() {
    sp.x = W / 2; sp.y = H - 72; sp.bank = 0; sp.hp = 100; sp.score = 0; sp.wave = 1; sp.combo = 1;
    sp.fireCd = 0; sp.spawnCd = 0.5; sp.shieldFlash = 0; sp.over = false; sp.bgScroll = 0; sp.shieldOn = false;
    sp.bullets = []; sp.enemies = []; sp.parts = []; sp.booms = []; finOv.style.display = 'none'; syncHud();
  }
  document.getElementById('btn-sp-replay').onclick = resetSpace;

  function syncHud() {
    scorePill.textContent = 'PUNTOS: ' + Math.floor(sp.score) + ' (x' + sp.combo + ')';
    hpPill.textContent = 'ESCUDO: ' + Math.max(0, Math.round(sp.hp)) + '% · RÉCORD: ' + best;
  }

  function boom(x, y, col, n) {
    sp.booms.push({ x: x, y: y, size: n > 15 ? 74 : 56, t: 0, dur: 0.36 });
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, spd = 70 + Math.random() * 240;
      sp.parts.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.5, col: col });
    }
  }

  tvGameKeyHandler = function (e, code) {
    if (sp.over && (code === 13 || code === 23 || code === 66 || code === 32)) {
      if (e.preventDefault) e.preventDefault(); resetSpace(); return true;
    }
    if (code === 37 || code === 21) { keys.left = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 39 || code === 22) { keys.right = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 38 || code === 19) { keys.up = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.fire = true; if (e.preventDefault) e.preventDefault(); return true; }
    return false;
  };
  tvGameKeyUpHandler = function (_e, code) {
    if (code === 37 || code === 21) { keys.left = false; return true; }
    if (code === 39 || code === 22) { keys.right = false; return true; }
    if (code === 38 || code === 19) { keys.up = false; return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.fire = false; return true; }
    return false;
  };

  var lastTs = performance.now();
  function frame(now) {
    if (TV_GAME_ACTIVE !== 'gyrospace') return;
    var dt = Math.min(0.035, Math.max(0.005, (now - lastTs) / 1000));
    lastTs = now;
    sp.shieldFlash = Math.max(0, sp.shieldFlash - dt * 2.5);
    sp.bgScroll += (68 + sp.wave * 14) * dt;

    for (var sIdx = 0; sIdx < stars.length; sIdx++) {
      var stStar = stars[sIdx];
      stStar.y += (90 + sp.wave * 18) * stStar.z * dt;
      if (stStar.y > H) { stStar.y = -4; stStar.x = Math.random() * W; }
    }
    for (var pi = sp.parts.length - 1; pi >= 0; pi--) {
      sp.parts[pi].x += sp.parts[pi].vx * dt; sp.parts[pi].y += sp.parts[pi].vy * dt; sp.parts[pi].life -= dt;
      if (sp.parts[pi].life <= 0) sp.parts.splice(pi, 1);
    }
    for (var xmi = sp.booms.length - 1; xmi >= 0; xmi--) {
      sp.booms[xmi].t += dt;
      if (sp.booms[xmi].t >= sp.booms[xmi].dur) sp.booms.splice(xmi, 1);
    }

    if (!sp.over) {
      var useGyro = Date.now() < tvGyroInput.expiresAt;
      var moveIn = useGyro ? tvGyroInput.steer : ((keys.right ? 1 : 0) - (keys.left ? 1 : 0));
      var fireOn = keys.fire || (useGyro && (tvGyroInput.throttle > 0.2 || tvGyroInput.nitro));
      sp.shieldOn = keys.up || (useGyro && tvGyroInput.handbrake);

      sp.x = Math.max(40, Math.min(W - 40, sp.x + moveIn * 520 * dt));
      sp.bank += (moveIn * 0.42 - sp.bank) * Math.min(1, dt * 14);
      sp.score += dt * 12;
      sp.wave = 1 + Math.floor(sp.score / 250);

      sp.fireCd -= dt;
      if (fireOn && sp.fireCd <= 0) {
        sp.fireCd = 0.14;
        sp.bullets.push({ x: sp.x - 14, y: sp.y - 18, vy: -760 });
        sp.bullets.push({ x: sp.x + 14, y: sp.y - 18, vy: -760 });
        playTvGameBeep(680, 0.04, 'square', 0.03);
      }

      sp.spawnCd -= dt;
      if (sp.spawnCd <= 0) {
        sp.spawnCd = Math.max(0.24, 0.78 - sp.wave * 0.05);
        var kind = Math.random() < 0.35 ? 'alien' : 'rock';
        sp.enemies.push({
          x: 42 + Math.random() * (W - 84), y: -30,
          vx: kind === 'alien' ? (Math.random() - 0.5) * 140 : (Math.random() - 0.5) * 60,
          vy: (kind === 'alien' ? 195 : 165) + sp.wave * 22,
          r: kind === 'alien' ? 20 : 18 + Math.random() * 14,
          hp: kind === 'alien' ? 2 : 1, kind: kind, rot: Math.random() * 6
        });
      }

      for (var bi = sp.bullets.length - 1; bi >= 0; bi--) {
        sp.bullets[bi].y += sp.bullets[bi].vy * dt;
        if (sp.bullets[bi].y < -20) sp.bullets.splice(bi, 1);
      }

      var hitImpact = 0;
      for (var ei = sp.enemies.length - 1; ei >= 0; ei--) {
        var en = sp.enemies[ei];
        en.x += en.vx * dt; en.y += en.vy * dt; en.rot += dt * 2.2;
        if (en.x < en.r || en.x > W - en.r) en.vx *= -1;

        var destroyed = false;
        for (var b2 = sp.bullets.length - 1; b2 >= 0; b2--) {
          if (Math.hypot(sp.bullets[b2].x - en.x, sp.bullets[b2].y - en.y) < en.r + 7) {
            sp.bullets.splice(b2, 1); en.hp -= 1;
            if (en.hp <= 0) {
              sp.score += (en.kind === 'alien' ? 45 : 25) * sp.combo;
              sp.combo = Math.min(8, sp.combo + 1);
              boom(en.x, en.y, en.kind === 'alien' ? '#F43F5E' : '#38BDF8', 14);
              playTvGameBeep(260, 0.08, 'triangle', 0.06);
              sp.enemies.splice(ei, 1); destroyed = true; break;
            }
          }
        }
        if (destroyed) continue;

        if (Math.hypot(en.x - sp.x, en.y - sp.y) < en.r + 22) {
          sp.hp -= sp.shieldOn ? 14 : 34; sp.combo = 1; sp.shieldFlash = 1; hitImpact = 0.9;
          boom(en.x, en.y, '#FB7185', 18); playTvGameBeep(140, 0.2, 'sawtooth', 0.11);
          sp.enemies.splice(ei, 1);
          if (sp.hp <= 0) {
            sp.over = true;
            var finalPts = Math.floor(sp.score);
            if (finalPts > best) { best = finalPts; try { localStorage.setItem('naim_tv_space_best_v1', String(best)); } catch (eb) {} }
            finSub.textContent = 'Puntuación: ' + finalPts + ' · Oleada ' + sp.wave + ' · Récord: ' + best;
            finOv.style.display = '-webkit-flex'; finOv.style.display = 'flex';
            var rb = document.getElementById('btn-sp-replay'); if (rb && rb.focus) rb.focus();
          }
          continue;
        }
        if (en.y > H + 40) sp.enemies.splice(ei, 1);
      }
      syncHud();
      pushGyroArcadeTelemetry(roomId, 210 + sp.wave * 35, sp.wave, sp.combo, sp.hp, hitImpact, sp.over ? 'finished' : 'racing');
    }

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#040611'); bg.addColorStop(0.55, '#0b1026'); bg.addColorStop(1, '#180c2e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    gyroTiled(ctx, 'assets/games/space/darkPurple.png', W, H, 0, sp.bgScroll);

    for (var s2 = 0; s2 < stars.length; s2++) {
      var sr = stars[s2]; ctx.fillStyle = sr.z > 1.3 ? '#BAE6FD' : '#64748B';
      ctx.fillRect(sr.x, sr.y, sr.z * 2, sr.z * 2.5);
    }

    for (var bi2 = 0; bi2 < sp.bullets.length; bi2++) {
      var bl = sp.bullets[bi2];
      if (!gyroSpr(ctx, 'assets/games/space/laserBlue01.png', bl.x, bl.y, 10, 30, 0)) {
        ctx.fillStyle = '#22D3EE'; ctx.fillRect(bl.x - 2.5, bl.y - 12, 5, 18);
      }
    }

    for (var ei2 = 0; ei2 < sp.enemies.length; ei2++) {
      var eObj = sp.enemies[ei2];
      if (eObj.kind === 'alien') {
        if (!gyroSpr(ctx, 'assets/games/space/enemyRed3.png', eObj.x, eObj.y, 44, 38, Math.sin(eObj.rot) * 0.16)) {
          ctx.save(); ctx.translate(eObj.x, eObj.y); ctx.rotate(eObj.rot);
          ctx.fillStyle = '#E11D48'; ctx.beginPath();
          ctx.moveTo(0, eObj.r); ctx.lineTo(-eObj.r, -eObj.r * 0.7); ctx.lineTo(0, -eObj.r * 0.25); ctx.lineTo(eObj.r, -eObj.r * 0.7);
          ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
      } else if (!gyroSpr(ctx, 'assets/games/space/meteorBrown_big1.png', eObj.x, eObj.y, eObj.r * 2.15, eObj.r * 2.05, eObj.rot)) {
        ctx.save(); ctx.translate(eObj.x, eObj.y); ctx.rotate(eObj.rot);
        ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, 0, eObj.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
      }
    }

    for (var p2 = 0; p2 < sp.parts.length; p2++) {
      ctx.globalAlpha = Math.max(0, sp.parts[p2].life * 2); ctx.fillStyle = sp.parts[p2].col;
      ctx.fillRect(sp.parts[p2].x - 2, sp.parts[p2].y - 2, 5, 5);
    }
    ctx.globalAlpha = 1;
    for (var b3 = 0; b3 < sp.booms.length; b3++) {
      var bm = sp.booms[b3], fIdx = Math.min(GYRO_BOOM_FRAMES.length - 1, Math.floor((bm.t / bm.dur) * GYRO_BOOM_FRAMES.length));
      gyroSpr(ctx, GYRO_BOOM_FRAMES[fIdx], bm.x, bm.y, bm.size, bm.size, 0);
    }

    if (!sp.over) {
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.bank);
      gyroSpr(ctx, 'assets/games/space/fire00.png', -12, 24, 12, 22, 0);
      gyroSpr(ctx, 'assets/games/space/fire00.png', 12, 24, 12, 22, 0);
      if (!gyroSpr(ctx, 'assets/games/space/playerShip1_blue.png', 0, 0, 54, 42, 0)) {
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath(); ctx.arc(-11, 22, 5 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(11, 22, 5 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7C3AED'; ctx.beginPath();
        ctx.moveTo(0, -28); ctx.lineTo(-28, 18); ctx.lineTo(-10, 12); ctx.lineTo(0, 22); ctx.lineTo(10, 12); ctx.lineTo(28, 18);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#22D3EE'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#E0F2FE'; ctx.beginPath(); ctx.ellipse(0, -6, 6, 12, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (sp.shieldOn || sp.shieldFlash > 0) {
        ctx.globalAlpha = sp.shieldFlash > 0 ? 0.88 : 0.58;
        if (!gyroSpr(ctx, 'assets/games/space/shield3.png', 0, 0, 76, 72, 0)) {
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.8)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    TV_GAME_RAF = requestAnimationFrame(frame);
  }

  resetSpace();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startGyroSpaceGame = startGyroSpaceGame;
