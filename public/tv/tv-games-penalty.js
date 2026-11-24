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
var tvPen3dHandle = null;

function disposeTvPen3d() {
  if (tvPen3dHandle && tvPen3dHandle.dispose) {
    try { tvPen3dHandle.dispose(); } catch (e0) {}
  }
  tvPen3dHandle = null;
}

function closeTvPenaltyGame() {
  disposeTvPen3d();
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

  if (typeof window.preloadTvGameSprites === 'function') {
    window.preloadTvGameSprites(['assets/games/penalty/stadium_backdrop.jpg', 'assets/games/sports/ball_soccer1.png', 'assets/games/toon/male_idle.png', 'assets/games/toon/male_run0.png', 'assets/games/toon/male_run1.png', 'assets/games/toon/male_run2.png', 'assets/games/toon/male_kick.png', 'assets/games/particles/star_07.png', 'assets/games/particles/spark_01.png']);
  } else if (!tvPenStadiumImg && typeof Image !== 'undefined') {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = typeof window.resolveTvGameAssetUrl === 'function'
      ? window.resolveTvGameAssetUrl('assets/games/penalty/stadium_backdrop.jpg')
      : '/assets/games/penalty/stadium_backdrop.jpg';
    img.onload = function () { tvPenStadiumImg = img; };
  }

  var roomId = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('pen-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  scr.innerHTML =
    '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver</button>' +
    '<div class="tv-game-top-title">⚽ Penaltis Mundial Pro</div>' +
    '<button type="button" id="btn-pen-c1" class="tv-btn" tabindex="0">J1: ESP</button>' +
    '<button type="button" id="btn-pen-c2" class="tv-btn" tabindex="0">J2: ARG</button>' +
    '<button type="button" id="btn-pen-mode" class="tv-btn" tabindex="0">Modo: 1vIA</button>' +
    '</div><div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="pen-gyro-pill">📱 Esperando Móviles</div>' +
    '<div class="tv-game-hud-pill accent-green" id="pen-score-pill">ESP 0 - 0 ARG</div>' +
    '<div class="tv-game-hud-pill" id="pen-round-pill">RONDA 1/5 · 8.0s</div>' +
    '<div class="tv-game-hud-pill" id="pen-best-pill">Récord: ' + bestScore + '</div></div></div>' +
    '<div class="tv-game-arena" id="pen-arena">' +
    '<canvas id="tv-penalty-canvas" class="tv-game-canvas" width="960" height="540"></canvas>' +
    '<div class="tv-game-finish-overlay" id="pen-finish-ov"><div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="pen-fin-title">¡CAMPEÓN!</div>' +
    '<div class="tv-game-finish-sub" id="pen-fin-sub">Resultado final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-pen-replay" class="tv-btn-primary" tabindex="0">Jugar otra tanda (OK)</button>' +
    '<button type="button" id="btn-pen-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Móvil Vertical (1P/2P): Apunta inclinando · Mantén ROSCA ↶/↷ + CHUTAR · Portero J2 secreto</span>' +
    '<span>Mando TV: Flechas apuntan · CH-/CH+ o Q/E Rosca · OK Chuta / Para · Tiempo límite 8s por tiro</span></div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-pen-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-penalty-canvas');
  var ctx = canvas.getContext('2d');
  var arenaEl = document.getElementById('pen-arena');
  var scorePill = document.getElementById('pen-score-pill');
  var roundPill = document.getElementById('pen-round-pill');
  var bestPill = document.getElementById('pen-best-pill');
  var gyroPill = document.getElementById('pen-gyro-pill');
  var btnC1 = document.getElementById('btn-pen-c1');
  var btnC2 = document.getElementById('btn-pen-c2');
  var btnMode = document.getElementById('btn-pen-mode');
  var finOv = document.getElementById('pen-finish-ov');
  var finTitle = document.getElementById('pen-fin-title');
  var finSub = document.getElementById('pen-fin-sub');
  var penLobby = typeof window.createTvDualQrLobby === 'function'
    ? window.createTvDualQrLobby(arenaEl, { roomId: roomId, gameId: 'penalty', title: '⚽ Penaltis Mundial · QR J1 y J2' })
    : null;

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
    turnTime: 8.0, resultTimer: 0, lastOutcome: 'goal',
    bannerMsg: 'APUNTA Y CHUTA ANTES DE QUE ACABE EL TIEMPO', bannerColor: '#FDE047'
  };

  function getPenalty3dSnap() {
    var ay = Math.max(0.08, Math.min(0.96, 1 - (state.aimY - goalTop) / (goalBottom - goalTop)));
    var ty = Math.max(0.08, Math.min(0.96, 1 - (state.targetY - goalTop) / (goalBottom - goalTop)));
    return {
      aimX: (state.aimX - 480) / 260,
      aimY: ay,
      curve: state.curve,
      shotStyle: 'placed',
      keeperX: (state.keeperX - 480) / 260,
      keeperDiveY: state.keeperDiveY < 0 ? 0.65 : (Math.abs(state.keeperX - 480) > 60 ? 0.35 : 0),
      strikerRunT: state.strikerRun,
      strikerKicking: state.kickingRun,
      netRipple: state.netWave,
      netImpactX: (state.targetX - 480) / 260,
      cameraShake: state.shake,
      attacker: state.attacker,
      winner: state.phase === 'finished' ? (state.s1 > state.s2 ? 1 : 2) : null,
      ball: {
        active: state.phase === 'flight' || state.phase === 'result',
        t: state.phase === 'result' ? 1 : state.flightT,
        endX: (state.targetX - 480) / 260,
        endY: ty,
        curve: state.curve,
        outcome: state.lastOutcome || 'goal',
        resolved: state.phase === 'result',
        spinAngle: state.flightT * 12
      }
    };
  }

  function remountPenalty3d() {
    disposeTvPen3d();
    if (!arenaEl || !window.RiffanTvGames || typeof window.RiffanTvGames.mountPenalty3D !== 'function') {
      if (canvas) canvas.style.display = 'block';
      return;
    }
    var stage = arenaEl.querySelector('.tv-3d-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'tv-3d-stage';
      arenaEl.insertBefore(stage, arenaEl.firstChild);
    }
    try {
      tvPen3dHandle = window.RiffanTvGames.mountPenalty3D(stage, {
        getState: getPenalty3dSnap,
        getContext: function () {
          var c1 = getC1(), c2 = getC2();
          return {
            p1: { id: c1.id, name: c1.name, flag: c1.flag || '⚽', code: c1.code, jersey: c1.jersey, trim: c1.trim, shorts: c1.shorts, gkJersey: c1.gkJersey, gkTrim: c1.gkTrim },
            p2: { id: c2.id, name: c2.name, flag: c2.flag || '⚽', code: c2.code, jersey: c2.jersey, trim: c2.trim, shorts: c2.shorts, gkJersey: c2.gkJersey, gkTrim: c2.gkTrim },
            matchMode: state.mode2p ? '2p' : 'cpu'
          };
        },
        onGoalClick: function (ax, ay) {
          if (state.phase === 'aim') {
            state.aimX = 480 + ax * 260;
            state.aimY = goalTop + (1 - Math.max(0.08, Math.min(0.96, ay))) * (goalBottom - goalTop);
            launchKick();
          }
        }
      });
    } catch (ePen) { tvPen3dHandle = null; }
    if (tvPen3dHandle) {
      if (canvas) canvas.style.display = 'none';
    } else {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
      if (canvas) canvas.style.display = 'block';
    }
  }

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
        ws.send(JSON.stringify({ type: 'GYRO_CONTROLLER_JOIN', payload: { roomId: roomId, role: 'display', deviceName: 'Smart TV Penaltis', gameId: 'penalty' } }));
      };
      ws.onmessage = function (ev) {
        if (tvPenWs !== ws) return;
        try {
          var msg = JSON.parse(ev.data);
          if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
            var list = msg.payload.controllers || [];
            if (penLobby) penLobby.onStatus(list);
            tvPenHasP1 = list.length >= 1;
            tvPenHasP2 = list.length >= 2;
            if (tvPenHasP2 && !state.mode2p) {
              state.mode2p = true;
              btnMode.textContent = 'Modo: 2P';
              syncHud();
            }
            if (gyroPill) {
              gyroPill.className = tvPenHasP1 ? 'tv-game-hud-pill accent-green' : 'tv-game-hud-pill accent-purple';
              gyroPill.textContent = tvPenHasP2 ? '📱 2 Móviles (J1 vs J2)' : tvPenHasP1 ? '📱 J1 Conectado' : '📱 Esperando Móviles';
            }
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
  btnC1.onclick = function () { state.c1Idx = (state.c1Idx + 1) % TV_PENALTY_COUNTRIES.length; syncHud(); remountPenalty3d(); };
  btnC2.onclick = function () { state.c2Idx = (state.c2Idx + 1) % TV_PENALTY_COUNTRIES.length; syncHud(); remountPenalty3d(); };
  btnMode.onclick = function () { state.mode2p = !state.mode2p; resetPenaltyMatch(); remountPenalty3d(); };

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
    state.lastOutcome = scored ? 'goal' : hitPost ? 'post' : saved ? 'saved' : 'miss';
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

    if ((state.phase === 'aim' || state.phase === 'wait_save') && (!penLobby || penLobby.isReady())) {
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

    if (!tvPen3dHandle) drawStadiumScene();
    TV_GAME_RAF = requestAnimationFrame(frame);
  }

  function drawStadiumScene() {
    var c1 = getC1(), c2 = getC2();
    var kKit = state.attacker === 1 ? c1 : c2, dKit = state.attacker === 1 ? c2 : c1;
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake * 10, (Math.random() - 0.5) * state.shake * 10);

    var drewPhoto = (typeof window.drawTvSpriteRect === 'function') && window.drawTvSpriteRect(ctx, 'assets/games/penalty/stadium_backdrop.jpg', 0, 0, 960, 326);
    if (!drewPhoto && tvPenStadiumImg && tvPenStadiumImg.complete && tvPenStadiumImg.naturalWidth > 0) {
      ctx.drawImage(tvPenStadiumImg, 0, 0, 960, 326);
      drewPhoto = true;
    }
    if (drewPhoto) {
      var fog = ctx.createLinearGradient(0, 0, 0, 305);
      fog.addColorStop(0, 'rgba(5,9,20,0.42)'); fog.addColorStop(0.7, 'rgba(9,16,32,0.16)'); fog.addColorStop(1, 'rgba(10,48,24,0.45)');
      ctx.fillStyle = fog; ctx.fillRect(0, 0, 960, 305);
    } else {
      var skyGrad = ctx.createLinearGradient(0, 0, 0, 290);
      skyGrad.addColorStop(0, '#050918'); skyGrad.addColorStop(1, '#132046');
      ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, 960, 290);
    }
    if (typeof window.drawTvCameraFlashes === 'function') window.drawTvCameraFlashes(ctx, 960, 18, 250, state.powerPhase, state.phase === 'result');

    ctx.fillStyle = 'rgba(7,11,24,0.92)'; ctx.fillRect(0, 266, 960, 26);
    ctx.strokeStyle = kKit.jersey; ctx.lineWidth = 2; ctx.strokeRect(0, 266, 960, 26);
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#E2E8F0';
    ctx.fillText(c1.code + '  vs  ' + c2.code + '   ·   MUNDIAL PENALTY ARENA HD   ·   RIFFAN TV', 480, 283);

    var turf = ctx.createLinearGradient(0, 292, 0, 540);
    turf.addColorStop(0, '#146B33'); turf.addColorStop(0.5, '#15803D'); turf.addColorStop(1, '#0C4A22');
    ctx.fillStyle = turf; ctx.fillRect(0, 292, 960, 248);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (var sBand = 0; sBand < 5; sBand++) ctx.fillRect(0, 294 + sBand * 48, 960, 22);

    ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(76, 400); ctx.lineTo(884, 400); ctx.lineTo(950, 540); ctx.moveTo(76, 400); ctx.lineTo(10, 540); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(202, 304); ctx.lineTo(758, 304); ctx.lineTo(806, 344); ctx.lineTo(154, 344); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(spotX, 346, 68, 0.22, Math.PI - 0.22); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(spotX, spotY + 12, 11, 4.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();

    // 3D Stanchion Goal Net
    var bL = goalLeft + 26, bR = goalRight - 26, bT = goalTop + 20, bB = goalBottom - 16;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.36)'; ctx.fillRect(bL, bT, bR - bL, bB - bT);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)'; ctx.lineWidth = 1.4;
    for (var gIdx = 0; gIdx <= 18; gIdx++) {
      var u = gIdx / 18, fx = goalLeft + (goalRight - goalLeft) * u, bxN = bL + (bR - bL) * u;
      var wave = state.netWave > 0 ? Math.sin(u * 8 + state.powerPhase * 18) * state.netWave * 14 : 0;
      ctx.beginPath(); ctx.moveTo(fx, goalTop); ctx.quadraticCurveTo(bxN + wave, (bT + bB) * 0.5, bxN, bB); ctx.stroke();
    }
    for (var gy = 0; gy <= 8; gy++) {
      var v = gy / 8, yF = goalTop + (goalBottom - goalTop) * v, yB = bT + (bB - bT) * v;
      var hWave = state.netWave > 0 ? Math.sin(v * 6 + state.powerPhase * 20) * state.netWave * 9 : 0;
      ctx.beginPath(); ctx.moveTo(goalLeft, yF); ctx.lineTo(bL, yB); ctx.quadraticCurveTo(480, yB + hWave, bR, yB); ctx.lineTo(goalRight, yF); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(goalLeft + 3, goalBottom + 2); ctx.lineTo(goalLeft + 3, goalTop + 3); ctx.lineTo(goalRight + 3, goalTop + 3); ctx.lineTo(goalRight + 3, goalBottom + 2); ctx.stroke();
    ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 9.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(goalLeft, goalBottom); ctx.lineTo(goalLeft, goalTop); ctx.lineTo(goalRight, goalTop); ctx.lineTo(goalRight, goalBottom); ctx.stroke();

    // Articulated Diving Goalkeeper in Defending Nation Kit
    var kx = state.keeperX, ky = 250 + state.keeperDiveY, diveTilt = (kx - 480) * 0.0026;
    ctx.save(); ctx.translate(kx, ky);
    ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.beginPath(); ctx.ellipse(0, 50, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(diveTilt);
    ctx.fillStyle = '#0F172A'; ctx.fillRect(-13, 18, 10, 22); ctx.fillRect(3, 18, 10, 22);
    ctx.fillStyle = dKit.gkTrim; ctx.fillRect(-14, 34, 11, 7); ctx.fillRect(3, 34, 11, 7);
    ctx.fillStyle = dKit.gkJersey; ctx.fillRect(-18, -22, 36, 42);
    ctx.fillStyle = dKit.gkTrim; ctx.fillRect(-18, -8, 36, 6);
    ctx.strokeStyle = dKit.gkJersey; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-16, -12); ctx.lineTo(-39, -22); ctx.moveTo(16, -12); ctx.lineTo(39, -22); ctx.stroke();
    ctx.fillStyle = '#F8FAFC'; ctx.strokeStyle = dKit.gkTrim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-41, -24, 9.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(41, -24, 9.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FED7AA'; ctx.beginPath(); ctx.arc(0, -34, 12.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1E293B'; ctx.beginPath(); ctx.arc(0, -39, 12, Math.PI, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Aim & Curve Preview
    if (state.phase === 'aim') {
      var previewX = state.aimX + state.curve * 68;
      var ctrlAx = (spotX + previewX) / 2 - state.curve * 120;
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
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

    // Running Striker Figure (Kenney Toon animated run/kick sprites)
    if (state.phase !== 'flight' || state.flightT < 0.35) {
      var rp = state.kickingRun ? state.strikerRun : 0;
      var sx = 372 + rp * (spotX - 38 - 372), sy = 508 - rp * 34;
      var pose = !state.kickingRun ? 'assets/games/toon/male_idle.png' : (rp > 0.72 ? 'assets/games/toon/male_kick.png' : ('assets/games/toon/male_run' + (Math.floor(rp * 9) % 3) + '.png'));
      ctx.save(); ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(0, 24, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (!(typeof window.drawTvSprite === 'function' && window.drawTvSprite(ctx, pose, 0, -14, 70, 84, 0))) {
        ctx.fillStyle = kKit.jersey; ctx.fillRect(-14, -28, 28, 32);
      }
      ctx.fillStyle = kKit.jersey; ctx.fillRect(-11, 14, 22, 6);
      ctx.restore();
    }

    // 3D Shaded Geodesic Spinning Ball (Kenney Sports Pack) + Curve Trail
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
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(bx, by + r + 5, r * 1.15, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    if (!(typeof window.drawTvSprite === 'function' && window.drawTvSprite(ctx, 'assets/games/sports/ball_soccer1.png', bx, by, r * 2.15, r * 2.15, state.flightT * (10 + Math.abs(state.curve) * 14)))) {
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    }
    if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, bx, by, r, 480, 40, 0.72);
    if (state.phase === 'flight' && Math.abs(state.curve) > 0.3 && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, bx, by, r * 2.4, '250,204,21', 0.44);

    for (var s2 = 0; s2 < sparks.length; s2++) {
      ctx.globalAlpha = Math.max(0, sparks[s2].l);
      if (!(typeof window.drawTvSprite === 'function' && window.drawTvSprite(ctx, s2 % 2 === 0 ? 'assets/games/particles/star_07.png' : 'assets/games/particles/spark_01.png', sparks[s2].x, sparks[s2].y, 20, 20, sparks[s2].l * 6))) {
        ctx.fillStyle = sparks[s2].c; ctx.fillRect(sparks[s2].x - 3, sparks[s2].y - 3, 6, 6);
      }
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
  remountPenalty3d();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startPenaltyGame = startPenaltyGame;
