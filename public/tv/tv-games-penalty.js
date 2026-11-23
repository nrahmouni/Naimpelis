// ===================================================================
// PENALTIS MUNDIAL PRO · SMART TV HD (STRICT ES5, <= 650 LOC)
// 10 Top Nations, 8s Countdown, Curve/Efecto, 1P/2P Mobile Gyro QR
// ===================================================================
var TV_PENALTY_COUNTRIES = [
  { id: 'ESP', name: 'España', code: 'ESP', jersey: '#DC2626', trim: '#FACC15', shorts: '#1D4ED8', gkJersey: '#06B6D4', gkTrim: '#0F172A' },
  { id: 'ARG', name: 'Argentina', code: 'ARG', jersey: '#38BDF8', trim: '#FFFFFF', shorts: '#0F172A', gkJersey: '#10B981', gkTrim: '#064E3B' },
  { id: 'FRA', name: 'Francia', code: 'FRA', jersey: '#1D4ED8', trim: '#FFFFFF', shorts: '#1E3A8A', gkJersey: '#F59E0B', gkTrim: '#1E293B' },
  { id: 'BRA', name: 'Brasil', code: 'BRA', jersey: '#FACC15', trim: '#16A34A', shorts: '#1D4ED8', gkJersey: '#334155', gkTrim: '#38BDF8' },
  { id: 'GER', name: 'Alemania', code: 'GER', jersey: '#F8FAFC', trim: '#18181B', shorts: '#09090B', gkJersey: '#8B5CF6', gkTrim: '#E9D5FF' },
  { id: 'ENG', name: 'Inglaterra', code: 'ENG', jersey: '#FFFFFF', trim: '#DC2626', shorts: '#1E3A8A', gkJersey: '#22C55E', gkTrim: '#052E16' },
  { id: 'POR', name: 'Portugal', code: 'POR', jersey: '#991B1B', trim: '#16A34A', shorts: '#14532D', gkJersey: '#0EA5E9', gkTrim: '#FFFFFF' },
  { id: 'MAR', name: 'Marruecos', code: 'MAR', jersey: '#B91C1C', trim: '#15803D', shorts: '#166534', gkJersey: '#EAB308', gkTrim: '#1E293B' },
  { id: 'NED', name: 'Países Bajos', code: 'NED', jersey: '#F97316', trim: '#FFFFFF', shorts: '#0F172A', gkJersey: '#0284C7', gkTrim: '#E0F2FE' },
  { id: 'ITA', name: 'Italia', code: 'ITA', jersey: '#2563EB', trim: '#FFFFFF', shorts: '#FFFFFF', gkJersey: '#E11D48', gkTrim: '#FFE4E6' }
];

var tvPenWs = null;
var tvPenHasP1 = false;
var tvPenHasP2 = false;
var tvPenGyro1 = { steer: 0, pitch: 0, roll: 0, swing: 0, nitro: false, throttle: 0, handbrake: false, brake: 0, expiresAt: 0 };
var tvPenGyro2 = { steer: 0, pitch: 0, roll: 0, swing: 0, nitro: false, throttle: 0, handbrake: false, brake: 0, expiresAt: 0 };
var tvPenStadiumImg = null;

function closeTvPenaltyGame() {
  if (tvPenWs) {
    tvPenWs.onclose = null;
    try { tvPenWs.close(); } catch (e) {}
    tvPenWs = null;
  }
  tvPenHasP1 = false;
  tvPenHasP2 = false;
  tvPenGyro1 = { steer: 0, pitch: 0, roll: 0, swing: 0, nitro: false, throttle: 0, handbrake: false, brake: 0, expiresAt: 0 };
  tvPenGyro2 = { steer: 0, pitch: 0, roll: 0, swing: 0, nitro: false, throttle: 0, handbrake: false, brake: 0, expiresAt: 0 };
}
window.closeTvPenaltyGame = closeTvPenaltyGame;

function pushTvPenaltyTelemetry(roomId, targetSlot, pulseMs, tag, s1, s2, over) {
  if (!tvPenWs || tvPenWs.readyState !== 1) return;
  if (!tvPenHasP1 && !tvPenHasP2) return;
  try {
    tvPenWs.send(JSON.stringify({
      type: 'RACING_TV_TELEMETRY',
      payload: {
        roomId: roomId,
        speedKmh: 0,
        rpmPct: 75,
        gear: 1,
        lap: 1,
        totalLaps: 5,
        position: 1,
        totalCars: 2,
        nitroPct: 100,
        collisionImpact: tag === 'penalty_post' ? 0.9 : 0.6,
        offroad: false,
        raceState: over ? 'finished' : 'racing',
        targetSlot: targetSlot,
        hapticPulseMs: pulseMs,
        scoreP1: s1,
        scoreP2: s2,
        eventTag: tag
      }
    }));
  } catch (e) {}
}

function startPenaltyGame(scr) {
  var bestScore = 0;
  try { bestScore = Number(localStorage.getItem(TV_PENALTY_BEST_KEY) || '0') || 0; } catch (e) {}

  if (!tvPenStadiumImg && typeof Image !== 'undefined') {
    var img = new Image();
    img.src = 'assets/games/penalty/stadium_backdrop.jpg';
    img.onload = function () { tvPenStadiumImg = img; };
  }

  var roomId = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('pen-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  var origin = (typeof getTvRacingPublicOrigin === 'function')
    ? getTvRacingPublicOrigin()
    : (window.location.origin || ('https://' + (window.location.host || 'localhost')));
  var ctrlUrl = origin + '/volante?room=' + encodeURIComponent(roomId) + '&game=penalty';
  var qrMarkup = typeof buildQrSvgMarkup === 'function' ? buildQrSvgMarkup(ctrlUrl) : '';

  scr.innerHTML =
    '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver</button>' +
    '<div class="tv-game-top-title">⚽ Penaltis Mundial Pro</div>' +
    '<button type="button" id="btn-pen-c1" class="tv-btn" tabindex="0">J1: ESP</button>' +
    '<button type="button" id="btn-pen-c2" class="tv-btn" tabindex="0">J2: ARG</button>' +
    '<button type="button" id="btn-pen-mode" class="tv-btn" tabindex="0">Modo: 1vIA</button>' +
    '</div><div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="pen-gyro-pill">📱 QR Móvil</div>' +
    '<div class="tv-game-hud-pill accent-green" id="pen-score-pill">ESP 0 - 0 ARG</div>' +
    '<div class="tv-game-hud-pill" id="pen-round-pill">RONDA 1/5 · 8.0s</div>' +
    '<div class="tv-game-hud-pill" id="pen-best-pill">Récord: ' + bestScore + '</div></div></div>' +
    '<div class="tv-game-arena">' +
    '<canvas id="tv-penalty-canvas" class="tv-game-canvas" width="960" height="540"></canvas>' +
    '<div class="tv-game-qr-card" id="pen-qr-card" style="width:166px;padding:9px;top:12px;right:12px;">' +
    '<div class="tv-game-qr-title" style="font-size:11px;">CHUTA DESDE MÓVIL</div>' +
    '<div class="tv-game-qr-box" style="width:102px;height:102px;margin:5px auto;">' + qrMarkup + '</div>' +
    '<div class="tv-game-qr-code" style="font-size:11px;">Sala: ' + escapeHtml(roomId) + '</div></div>' +
    '<div class="tv-game-finish-overlay" id="pen-finish-ov"><div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="pen-fin-title">¡CAMPEÓN!</div>' +
    '<div class="tv-game-finish-sub" id="pen-fin-sub">Resultado final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-pen-replay" class="tv-btn-primary" tabindex="0">Jugar otra tanda (OK)</button>' +
    '<button type="button" id="btn-pen-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Móvil Horizontal (1P/2P): Apunta inclinando · Mantén ROSCA ↶/↷ + CHUTAR (o agita) · Portero J2 secreto</span>' +
    '<span>Mando TV: Flechas apuntan · CH-/CH+ o Q/E Rosca · OK Chuta / Para · Tiempo límite 8s por tiro</span></div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-pen-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-penalty-canvas');
  var ctx = canvas.getContext('2d');
  var scorePill = document.getElementById('pen-score-pill');
  var roundPill = document.getElementById('pen-round-pill');
  var bestPill = document.getElementById('pen-best-pill');
  var gyroPill = document.getElementById('pen-gyro-pill');
  var qrCard = document.getElementById('pen-qr-card');
  var btnC1 = document.getElementById('btn-pen-c1');
  var btnC2 = document.getElementById('btn-pen-c2');
  var btnMode = document.getElementById('btn-pen-mode');
  var finOv = document.getElementById('pen-finish-ov');
  var finTitle = document.getElementById('pen-fin-title');
  var finSub = document.getElementById('pen-fin-sub');

  var goalLeft = 220, goalRight = 740, goalTop = 104, goalBottom = 304, spotX = 480, spotY = 466;
  var sparks = [], trail = [];
  var prevP1Kick = false, prevP2Kick = false, lastBeepSec = 99;

  var state = {
    c1Idx: 0, c2Idx: 1, mode2p: false, attacker: 1, round: 1, s1: 0, s2: 0,
    h1: [], h2: [], phase: 'aim',
    aimX: 480, aimY: 196, curve: 0, powerPhase: 0, flightT: 0,
    targetX: 480, targetY: 190, curveDx: 0,
    keeperX: 480, keeperTargetX: 480, keeperDiveY: 0, keeperSecretX: null,
    strikerRun: 0, kickingRun: false, shake: 0, netWave: 0,
    turnTime: 8.0, resultTimer: 0,
    bannerMsg: 'APUNTA Y CHUTA ANTES DE QUE ACABE EL TIEMPO', bannerColor: '#FDE047'
  };

  function connectPenWs() {
    if (!window.WebSocket || typeof getTvRacingWsUrl !== 'function') return;
    try {
      var ws = new WebSocket(getTvRacingWsUrl());
      tvPenWs = ws;
      ws.onopen = function () {
        if (tvPenWs !== ws) return;
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          payload: { roomId: roomId, roomName: 'PENALTY', user: { id: 'tv-pen-' + roomId, name: 'Smart TV', avatar: '⚽', color: '#10B981', isHost: true } }
        }));
        ws.send(JSON.stringify({ type: 'GYRO_CONTROLLER_JOIN', payload: { roomId: roomId, role: 'display', deviceName: 'Smart TV Penaltis' } }));
      };
      ws.onmessage = function (ev) {
        if (tvPenWs !== ws) return;
        try {
          var msg = JSON.parse(ev.data);
          if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
            var list = msg.payload.controllers || [];
            tvPenHasP1 = list.length >= 1;
            tvPenHasP2 = list.length >= 2;
            if (tvPenHasP2 && !state.mode2p) {
              state.mode2p = true;
              btnMode.textContent = 'Modo: 2P';
              syncHud();
            }
            if (gyroPill) {
              gyroPill.className = tvPenHasP1 ? 'tv-game-hud-pill accent-green' : 'tv-game-hud-pill accent-purple';
              gyroPill.textContent = tvPenHasP2 ? '📱 2 Móviles (J1 vs J2)' : tvPenHasP1 ? '📱 J1 Conectado' : '📱 QR Móvil';
            }
            if (qrCard && tvPenHasP2) qrCard.style.display = 'none';
          } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
            var p = msg.payload;
            var tgt = p.playerSlot === 2 ? tvPenGyro2 : tvPenGyro1;
            tgt.steer = typeof p.steer === 'number' ? p.steer : 0;
            tgt.pitch = typeof p.pitch === 'number' ? p.pitch : 0;
            tgt.roll = typeof p.roll === 'number' ? p.roll : 0;
            tgt.swing = typeof p.swing === 'number' ? p.swing : 0;
            tgt.nitro = Boolean(p.nitro);
            tgt.throttle = typeof p.throttle === 'number' ? p.throttle : 0;
            tgt.handbrake = Boolean(p.handbrake);
            tgt.brake = typeof p.brake === 'number' ? p.brake : 0;
            tgt.expiresAt = Date.now() + 1400;
          }
        } catch (e) {}
      };
      ws.onclose = function () { if (tvPenWs === ws) tvPenWs = null; };
    } catch (e) {}
  }
  connectPenWs();

  function getC1() { return TV_PENALTY_COUNTRIES[state.c1Idx]; }
  function getC2() { return TV_PENALTY_COUNTRIES[state.c2Idx]; }

  function syncHud() {
    var c1 = getC1(), c2 = getC2();
    btnC1.textContent = 'J1: ' + c1.code;
    btnC2.textContent = 'J2: ' + c2.code;
    btnMode.textContent = 'Modo: ' + (state.mode2p ? '2P' : '1vIA');
    scorePill.textContent = c1.code + ' ' + state.s1 + ' - ' + state.s2 + ' ' + c2.code;
    var rLbl = state.round > 5 ? 'MUERTE SÚBITA' : 'RONDA ' + state.round + '/5';
    roundPill.textContent = rLbl + ' · J' + state.attacker + ' · ' + state.turnTime.toFixed(1) + 's';
  }

  function resetPenaltyMatch() {
    state.attacker = 1; state.round = 1; state.s1 = 0; state.s2 = 0;
    state.h1 = []; state.h2 = []; state.phase = 'aim';
    state.aimX = 480; state.aimY = 196; state.curve = 0;
    state.keeperX = 480; state.keeperTargetX = 480; state.keeperDiveY = 0; state.keeperSecretX = null;
    state.strikerRun = 0; state.kickingRun = false; state.shake = 0; state.netWave = 0;
    state.turnTime = 8.0; sparks = []; trail = []; lastBeepSec = 99;
    state.bannerMsg = 'CHUTA ' + getC1().name.toUpperCase() + ' · TIEMPO 8s';
    state.bannerColor = '#FDE047';
    finOv.style.display = 'none';
    syncHud();
    playTvGameBeep(2650, 0.14, 'sine', 0.08);
  }
  document.getElementById('btn-pen-replay').onclick = resetPenaltyMatch;
  btnC1.onclick = function () { state.c1Idx = (state.c1Idx + 1) % TV_PENALTY_COUNTRIES.length; syncHud(); };
  btnC2.onclick = function () { state.c2Idx = (state.c2Idx + 1) % TV_PENALTY_COUNTRIES.length; syncHud(); };
  btnMode.onclick = function () { state.mode2p = !state.mode2p; resetPenaltyMatch(); };

  function isMatchDecided() {
    if (state.round <= 5) {
      var l1 = 5 - state.h1.length, l2 = 5 - state.h2.length;
      if (state.s1 - state.s2 > l2 || state.s2 - state.s1 > l1) return true;
      return state.h1.length >= 5 && state.h2.length >= 5 && state.s1 !== state.s2;
    }
    return state.h1.length === state.h2.length && state.s1 !== state.s2;
  }

  function nextTurn() {
    if (isMatchDecided()) {
      state.phase = 'finished';
      var c1 = getC1(), c2 = getC2(), p1Won = state.s1 > state.s2;
      finTitle.textContent = '🏆 ¡CAMPEÓN ' + (p1Won ? c1.name.toUpperCase() : c2.name.toUpperCase()) + '!';
      finSub.textContent = 'Marcador final: ' + c1.code + ' ' + state.s1 + ' - ' + state.s2 + ' ' + c2.code;
      if (p1Won) {
        bestScore += 1;
        try { localStorage.setItem(TV_PENALTY_BEST_KEY, String(bestScore)); } catch (e) {}
        bestPill.textContent = 'Récord: ' + bestScore;
        playTvGameBeep(660, 0.25, 'triangle', 0.1);
      }
      finOv.style.display = '-webkit-flex'; finOv.style.display = 'flex';
      var rBtn = document.getElementById('btn-pen-replay'); if (rBtn && rBtn.focus) rBtn.focus();
      return;
    }
    if (state.attacker === 1) {
      state.attacker = 2;
      state.phase = state.mode2p ? 'aim' : 'wait_save';
      state.bannerMsg = state.mode2p
        ? ('CHUTA ' + getC2().name.toUpperCase() + ' · PORTERO J1 SECRETO')
        : ('PARA EL TIRO DE ' + getC2().name.toUpperCase() + ' (◀ ▲ ▶)');
      state.bannerColor = '#38BDF8';
    } else {
      state.attacker = 1; state.round += 1; state.phase = 'aim';
      state.bannerMsg = 'CHUTA ' + getC1().name.toUpperCase() + ' · ROSCA Y POTENCIA';
      state.bannerColor = '#FDE047';
    }
    state.aimX = 480; state.aimY = 196; state.curve = 0;
    state.keeperX = 480; state.keeperTargetX = 480; state.keeperDiveY = 0; state.keeperSecretX = null;
    state.strikerRun = 0; state.kickingRun = false; state.turnTime = 8.0; trail = []; lastBeepSec = 99;
    syncHud();
  }

  function launchKick(forcedCpuDive) {
    if (state.phase !== 'aim' && state.phase !== 'wait_save') return;
    if (state.kickingRun) return;
    state.kickingRun = true;
    state.strikerRun = 0;
    setTimeout(function () {
      if (TV_GAME_ACTIVE !== 'penalty') return;
      state.kickingRun = false;
      playTvGameBeep(185, 0.12, 'triangle', 0.14);
      pushTvPenaltyTelemetry(roomId, state.attacker, 65, 'penalty_kick', state.s1, state.s2, false);

      if (!state.mode2p && state.attacker === 2) {
        var dir = typeof forcedCpuDive === 'number' ? forcedCpuDive : 0;
        var zone = Math.floor(Math.random() * 5) - 2;
        state.keeperTargetX = dir < 0 ? goalLeft + 62 : dir > 0 ? goalRight - 62 : 480;
        state.keeperDiveY = dir === 0 ? -16 : 8;
        state.targetX = 480 + zone * 95 + (Math.random() - 0.5) * 32;
        state.targetY = goalTop + 32 + Math.random() * 125;
        state.curveDx = (Math.random() - 0.5) * 140;
      } else {
        var bendPx = state.curve * 68;
        state.targetX = Math.max(goalLeft - 36, Math.min(goalRight + 36, state.aimX + bendPx));
        state.targetY = state.aimY;
        state.curveDx = -state.curve * 120;
        if (state.mode2p && state.keeperSecretX !== null) {
          state.keeperTargetX = state.keeperSecretX;
        } else {
          var rc = Math.random();
          state.keeperTargetX = rc < 0.36 ? goalLeft + 62 : rc < 0.72 ? goalRight - 62 : 480;
        }
        state.keeperDiveY = Math.abs(state.keeperTargetX - 480) > 60 ? 8 : -16;
      }
      state.flightT = 0;
      state.phase = 'flight';
    }, 210);
  }

  function resolveShotOutcome() {
    var inGoalX = state.targetX >= goalLeft + 10 && state.targetX <= goalRight - 10;
    var inGoalY = state.targetY >= goalTop + 10 && state.targetY <= goalBottom - 8;
    var hitPost = (Math.abs(state.targetX - goalLeft) < 12 || Math.abs(state.targetX - goalRight) < 12) && state.targetY >= goalTop - 6;
    var distK = Math.hypot(state.targetX - state.keeperX, state.targetY - (232 + state.keeperDiveY));
    var saved = !hitPost && inGoalX && inGoalY && distK < 66;
    var scored = !hitPost && inGoalX && inGoalY && !saved;

    if (state.attacker === 1) { state.h1.push(scored ? 'G' : 'X'); if (scored) state.s1 += 1; }
    else { state.h2.push(scored ? 'G' : 'X'); if (scored) state.s2 += 1; }

    var defSlot = state.attacker === 1 ? 2 : 1;
    if (scored) {
      state.netWave = 1;
      state.bannerMsg = '⚽ ¡GOOOOL DE ' + (state.attacker === 1 ? getC1().name : getC2().name).toUpperCase() + '!';
      state.bannerColor = '#4ADE80';
      for (var si = 0; si < 28; si++) {
        var ang = Math.random() * Math.PI * 2, spd = 90 + Math.random() * 240;
        sparks.push({ x: state.targetX, y: state.targetY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, c: ['#FACC15', '#4ADE80', '#38BDF8', '#FFF'][si % 4], l: 1.1 });
      }
      playTvGameBeep(523, 0.24, 'sawtooth', 0.1);
      pushTvPenaltyTelemetry(roomId, state.attacker, 130, 'goal', state.s1, state.s2, false);
    } else if (hitPost) {
      state.shake = 1; state.bannerMsg = '💥 ¡AL PALO / LARGUERO!'; state.bannerColor = '#38BDF8';
      playTvGameBeep(740, 0.24, 'sine', 0.1);
      pushTvPenaltyTelemetry(roomId, state.attacker, 100, 'penalty_post', state.s1, state.s2, false);
    } else if (saved) {
      state.bannerMsg = '🧤 ¡PARADÓN ESPECTACULAR!'; state.bannerColor = '#38BDF8';
      playTvGameBeep(310, 0.18, 'square', 0.08);
      pushTvPenaltyTelemetry(roomId, defSlot, 120, 'penalty_save', state.s1, state.s2, false);
    } else {
      state.bannerMsg = '❌ ¡FUERA DE PORTERÍA!'; state.bannerColor = '#FB7185';
      playTvGameBeep(130, 0.22, 'sawtooth', 0.09);
    }
    state.phase = 'result'; state.resultTimer = 1.65; syncHud();
  }

  tvGameKeyHandler = function (e, code) {
    if (state.phase === 'finished') {
      if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetPenaltyMatch(); return true; }
      return false;
    }
    var step = 28;
    if (state.phase === 'aim') {
      if (code === 37 || code === 21) { state.aimX = Math.max(goalLeft - 18, state.aimX - step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { state.aimX = Math.min(goalRight + 18, state.aimX + step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 38 || code === 19) { state.aimY = Math.max(goalTop - 8, state.aimY - step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 40 || code === 20) { state.aimY = Math.min(goalBottom - 14, state.aimY + step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 81) { state.curve = Math.max(-1, state.curve - 0.35); return true; }
      if (code === 69) { state.curve = Math.min(1, state.curve + 0.35); return true; }
      if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); launchKick(); return true; }
    } else if (state.phase === 'wait_save') {
      if (code === 37 || code === 21) { if (e.preventDefault) e.preventDefault(); launchKick(-1); return true; }
      if (code === 39 || code === 22) { if (e.preventDefault) e.preventDefault(); launchKick(1); return true; }
      if (code === 38 || code === 19 || code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); launchKick(0); return true; }
    }
    return false;
  };

  var lastTs = performance.now();
  function frame(now) {
    if (TV_GAME_ACTIVE !== 'penalty') return;
    var dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    var tNow = Date.now();

    state.powerPhase += dt;
    state.netWave = Math.max(0, state.netWave - dt * 1.4);
    state.shake = Math.max(0, state.shake - dt * 3);
    if (state.kickingRun) state.strikerRun = Math.min(1, state.strikerRun + dt * 4.5);

    for (var sIdx = sparks.length - 1; sIdx >= 0; sIdx--) {
      sparks[sIdx].x += sparks[sIdx].vx * dt; sparks[sIdx].y += sparks[sIdx].vy * dt;
      sparks[sIdx].vy += 300 * dt; sparks[sIdx].l -= dt;
      if (sparks[sIdx].l <= 0) sparks.splice(sIdx, 1);
    }

    if (state.phase === 'aim' || state.phase === 'wait_save') {
      state.turnTime = Math.max(0, state.turnTime - dt);
      var cSec = Math.ceil(state.turnTime);
      if (state.turnTime <= 3.0 && cSec > 0 && cSec !== lastBeepSec) { lastBeepSec = cSec; playTvGameBeep(880, 0.05, 'sine', 0.05); }

      var gAtt = state.attacker === 1 ? (tNow < tvPenGyro1.expiresAt ? tvPenGyro1 : null) : (tNow < tvPenGyro2.expiresAt ? tvPenGyro2 : null);
      var gDef = state.mode2p ? (state.attacker === 1 ? (tNow < tvPenGyro2.expiresAt ? tvPenGyro2 : null) : (tNow < tvPenGyro1.expiresAt ? tvPenGyro1 : null)) : (state.attacker === 2 && tNow < tvPenGyro1.expiresAt ? tvPenGyro1 : null);

      if (state.phase === 'aim' && gAtt) {
        if (Math.abs(gAtt.steer) > 0.05) state.aimX = 480 + gAtt.steer * ((goalRight - goalLeft) * 0.5);
        if (Math.abs(gAtt.pitch) > 0.05) state.aimY = (goalTop + goalBottom) * 0.5 - gAtt.pitch * 85;
        if (gAtt.handbrake) state.curve = -0.9; else if (gAtt.brake > 0.5) state.curve = 0.9; else if (gAtt.roll !== 0) state.curve = gAtt.roll;
        var wantK = gAtt.nitro || gAtt.throttle > 0.5 || gAtt.swing > 0.95;
        var prevK = state.attacker === 1 ? prevP1Kick : prevP2Kick;
        if (wantK && !prevK) { if (state.attacker === 1) prevP1Kick = true; else prevP2Kick = true; launchKick(); }
        else if (!wantK) { if (state.attacker === 1) prevP1Kick = false; else prevP2Kick = false; }
      }
      if (gDef) {
        if (Math.abs(gDef.steer) > 0.22) state.keeperSecretX = 480 + gDef.steer * 195;
        if (state.phase === 'wait_save' && (gDef.nitro || gDef.throttle > 0.5 || gDef.swing > 0.95)) {
          launchKick(gDef.steer < -0.25 ? -1 : gDef.steer > 0.25 ? 1 : 0);
        }
      }
      if (state.turnTime <= 0) launchKick(0);
      syncHud();
    } else if (state.phase === 'flight') {
      state.flightT = Math.min(1, state.flightT + dt * 1.85);
      state.keeperX += (state.keeperTargetX - state.keeperX) * Math.min(1, dt * 9);
      if (state.flightT >= 1) resolveShotOutcome();
    } else if (state.phase === 'result') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) nextTurn();
    }

    drawStadiumScene();
    TV_GAME_RAF = requestAnimationFrame(frame);
  }

  function drawStadiumScene() {
    var c1 = getC1(), c2 = getC2();
    var kKit = state.attacker === 1 ? c1 : c2, dKit = state.attacker === 1 ? c2 : c1;
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake * 10, (Math.random() - 0.5) * state.shake * 10);

    if (tvPenStadiumImg && tvPenStadiumImg.complete && tvPenStadiumImg.naturalWidth > 0) {
      ctx.drawImage(tvPenStadiumImg, 0, 0, 960, 320);
      ctx.fillStyle = 'rgba(5,9,20,0.34)'; ctx.fillRect(0, 0, 960, 300);
    } else {
      var skyGrad = ctx.createLinearGradient(0, 0, 0, 290);
      skyGrad.addColorStop(0, '#050918'); skyGrad.addColorStop(1, '#132046');
      ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, 960, 290);
    }

    ctx.fillStyle = 'rgba(9,13,28,0.92)'; ctx.fillRect(0, 266, 960, 24);
    ctx.strokeStyle = kKit.jersey; ctx.lineWidth = 2; ctx.strokeRect(0, 266, 960, 24);
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#38BDF8';
    ctx.fillText(c1.code + '  vs  ' + c2.code + '  ·  COPA MUNDIAL PRO  ·  RIFFAN STADIUM HD', 480, 282);

    var turf = ctx.createLinearGradient(0, 290, 0, 540);
    turf.addColorStop(0, '#0f6d34'); turf.addColorStop(1, '#168740');
    ctx.fillStyle = turf; ctx.fillRect(0, 290, 960, 250);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 326, 960, 34); ctx.fillRect(0, 400, 960, 42); ctx.fillRect(0, 480, 960, 46);

    ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 3;
    ctx.strokeRect(120, 296, 720, 200);
    ctx.beginPath(); ctx.arc(spotX, 342, 74, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(spotX, spotY, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

    // 3D Back Net
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.fillRect(goalLeft + 22, goalTop + 14, goalRight - goalLeft - 44, goalBottom - goalTop - 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.4;
    for (var gx = goalLeft; gx <= goalRight; gx += 24) {
      var wave = state.netWave > 0 ? Math.sin(gx * 0.08 + state.powerPhase * 18) * state.netWave * 14 : 0;
      ctx.beginPath(); ctx.moveTo(gx, goalTop); ctx.quadraticCurveTo(gx + wave, (goalTop + goalBottom) / 2, gx, goalBottom); ctx.stroke();
    }
    for (var gy = goalTop; gy <= goalBottom; gy += 20) {
      var hWave = state.netWave > 0 ? Math.sin(gy * 0.1 + state.powerPhase * 20) * state.netWave * 11 : 0;
      ctx.beginPath(); ctx.moveTo(goalLeft, gy); ctx.quadraticCurveTo(480, gy + hWave, goalRight, gy); ctx.stroke();
    }

    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 9; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(goalLeft, goalBottom); ctx.lineTo(goalLeft, goalTop); ctx.lineTo(goalRight, goalTop); ctx.lineTo(goalRight, goalBottom); ctx.stroke();

    // Diving Goalkeeper in Defending Nation Kit
    var kx = state.keeperX, ky = 250 + state.keeperDiveY, diveTilt = (kx - 480) * 0.0024;
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(diveTilt);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 38, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dKit.gkJersey; ctx.fillRect(-19, -24, 38, 46);
    ctx.fillStyle = dKit.gkTrim; ctx.fillRect(-19, -8, 38, 6);
    ctx.fillStyle = '#0F172A'; ctx.fillRect(-15, 22, 12, 18); ctx.fillRect(3, 22, 12, 18);
    ctx.fillStyle = '#FDBA74'; ctx.beginPath(); ctx.arc(0, -37, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = dKit.gkTrim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-36, -14, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(36, -14, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Aim & Curve Preview
    if (state.phase === 'aim') {
      var previewX = state.aimX + state.curve * 68;
      var ctrlAx = (spotX + previewX) / 2 - state.curve * 120;
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)'; ctx.lineWidth = 2.4; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(spotX, spotY); ctx.quadraticCurveTo(ctrlAx, Math.min(spotY, state.aimY) - 48, previewX, state.aimY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = state.attacker === 1 ? '#22D3EE' : '#FB7185'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(previewX, state.aimY, 21, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(previewX - 28, state.aimY); ctx.lineTo(previewX + 28, state.aimY);
      ctx.moveTo(previewX, state.aimY - 28); ctx.lineTo(previewX, state.aimY + 28); ctx.stroke();
    }

    // Countdown Bar
    if (state.phase === 'aim' || state.phase === 'wait_save') {
      var pct = Math.max(0, Math.min(1, state.turnTime / 8.0));
      ctx.fillStyle = 'rgba(7,10,20,0.85)'; ctx.fillRect(360, 12, 240, 22);
      ctx.fillStyle = pct < 0.35 ? '#EF4444' : pct < 0.6 ? '#F59E0B' : '#10B981';
      ctx.fillRect(362, 14, 236 * pct, 18);
      ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
      ctx.fillText('⏱ ' + state.turnTime.toFixed(1) + 's', 480, 27);
    }

    // Running Striker Figure
    if (state.phase !== 'flight' || state.flightT < 0.3) {
      var rp = state.kickingRun ? state.strikerRun : 0;
      var sx = 375 + rp * (spotX - 36 - 375), sy = 510 - rp * 34;
      ctx.save(); ctx.translate(sx, sy);
      ctx.fillStyle = kKit.shorts; ctx.fillRect(-10, 2, 9, 14); ctx.fillRect(1, 2, 9, 14);
      ctx.fillStyle = kKit.jersey; ctx.fillRect(-14, -28, 28, 32);
      ctx.fillStyle = kKit.trim; ctx.fillRect(-14, -16, 28, 5);
      ctx.fillStyle = '#FDBA74'; ctx.beginPath(); ctx.arc(0, -37, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Spinning Ball + Curve Trail
    var bx = spotX, by = spotY, bScale = 1;
    if (state.phase === 'flight' || state.phase === 'result') {
      var t = state.phase === 'result' ? 1 : state.flightT, inv = 1 - t;
      var ctrlX = (spotX + state.targetX) / 2 + state.curveDx, ctrlY = Math.min(spotY, state.targetY) - 48;
      bx = inv * inv * spotX + 2 * inv * t * ctrlX + t * t * state.targetX;
      by = inv * inv * spotY + 2 * inv * t * ctrlY + t * t * state.targetY;
      bScale = 1 - 0.52 * t;
      if (state.phase === 'flight') { trail.push({ x: bx, y: by }); if (trail.length > 9) trail.shift(); }
    }
    for (var ti = 0; ti < trail.length - 1; ti++) {
      ctx.strokeStyle = 'rgba(250,204,21,' + ((ti / trail.length) * 0.45) + ')';
      ctx.lineWidth = 3 + ti * 0.6;
      ctx.beginPath(); ctx.moveTo(trail[ti].x, trail[ti].y); ctx.lineTo(trail[ti + 1].x, trail[ti + 1].y); ctx.stroke();
    }
    var r = 18 * bScale;
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(bx, by + r + 5, r * 1.1, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(bx, by); ctx.rotate(state.flightT * (10 + Math.abs(state.curve) * 14));
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#18181B'; ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    for (var s2 = 0; s2 < sparks.length; s2++) {
      ctx.globalAlpha = Math.max(0, sparks[s2].l); ctx.fillStyle = sparks[s2].c;
      ctx.fillRect(sparks[s2].x - 3, sparks[s2].y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = state.bannerColor;
    ctx.fillText(state.bannerMsg, 480, 58);
    drawDots(155, 82, c1.code, state.h1); drawDots(635, 82, c2.code, state.h2);
    ctx.restore();
  }

  function drawDots(x0, y0, label, hist) {
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#CBD5E1';
    ctx.fillText(label, x0 - 44, y0 + 5);
    for (var i = 0; i < Math.max(5, hist.length); i++) {
      var v = hist[i];
      ctx.fillStyle = v === 'G' ? '#22C55E' : v === 'X' ? '#EF4444' : '#334155';
      ctx.beginPath(); ctx.arc(x0 + i * 24, y0, 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  resetPenaltyMatch();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startPenaltyGame = startPenaltyGame;
