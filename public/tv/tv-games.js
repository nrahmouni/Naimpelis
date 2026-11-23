// ===================================================================
// SMART TV ARCADE GAMES: PENALTIS MUNDIAL PRO + FUTBOL CABEZONES TV
// Strict ES5 for Samsung Tizen WebKit, LG webOS & Google TV WebView
// ===================================================================
var TV_GAME_ACTIVE = '';
var TV_GAME_RAF = null;
var TV_GAME_CTX_AUDIO = null;
var TV_PENALTY_BEST_KEY = 'naim_tv_penalty_best_v1';
var tvGameKeyHandler = null;
var tvGameKeyUpHandler = null;

function playTvGameBeep(freq, durSec, typeName, gainVal) {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!TV_GAME_CTX_AUDIO) TV_GAME_CTX_AUDIO = new AC();
    if (TV_GAME_CTX_AUDIO.state === 'suspended' && TV_GAME_CTX_AUDIO.resume) {
      TV_GAME_CTX_AUDIO.resume();
    }
    var osc = TV_GAME_CTX_AUDIO.createOscillator();
    var g = TV_GAME_CTX_AUDIO.createGain();
    osc.type = typeName || 'sine';
    osc.frequency.value = freq || 440;
    g.gain.value = gainVal || 0.08;
    osc.connect(g);
    g.connect(TV_GAME_CTX_AUDIO.destination);
    var now = TV_GAME_CTX_AUDIO.currentTime;
    osc.start(now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (durSec || 0.14));
    osc.stop(now + (durSec || 0.14));
  } catch (e) {}
}

function isTvGameActive() {
  return Boolean(TV_GAME_ACTIVE);
}
window.isTvGameActive = isTvGameActive;

function handleTvGameKeyDown(e) {
  if (!TV_GAME_ACTIVE) return false;
  var code = e.keyCode || e.which;
  if (code === 27 || code === 8 || code === 4 || code === 10009 || code === 461) {
    if (e.preventDefault) e.preventDefault();
    closeTvGame();
    return true;
  }
  if (tvGameKeyHandler) {
    return tvGameKeyHandler(e, code);
  }
  return false;
}
window.handleTvGameKeyDown = handleTvGameKeyDown;

function handleTvGameKeyUp(e) {
  if (!TV_GAME_ACTIVE) return false;
  var code = e.keyCode || e.which;
  if (tvGameKeyUpHandler) {
    return tvGameKeyUpHandler(e, code);
  }
  return false;
}
window.handleTvGameKeyUp = handleTvGameKeyUp;

function closeTvGame() {
  if (TV_GAME_RAF) {
    cancelAnimationFrame(TV_GAME_RAF);
    TV_GAME_RAF = null;
  }
  tvGameKeyHandler = null;
  tvGameKeyUpHandler = null;
  if (TV_GAME_ACTIVE === 'racing3d' && typeof window.closeTvRacingGame === 'function') {
    window.closeTvRacingGame();
  }
  TV_GAME_ACTIVE = '';
  var scr = document.getElementById('tv-games-screen');
  if (scr) {
    scr.style.display = 'none';
    scr.innerHTML = '';
  }
  setTimeout(function () {
    if (lastHubFocusedEl && lastHubFocusedEl.focus) {
      lastHubFocusedEl.focus();
    } else {
      var firstCard = document.querySelector('#hub-dynamic-content .tv-game-card, #hub-nav-tabs .hub-tab-btn.active');
      if (firstCard && firstCard.focus) firstCard.focus();
    }
  }, 40);
}
window.closeTvGame = closeTvGame;

function renderTvGamesCatalogInto(container) {
  if (!container) return;
  container.innerHTML = '';

  var hero = document.createElement('div');
  hero.className = 'tv-games-hero';
  hero.innerHTML =
    '<div>' +
    '<div class="tv-game-badge" style="margin-bottom:8px;background:#4c1d95;">ARCADE SMART TV · MANDO + GIROSCOPIO</div>' +
    '<div class="tv-games-hero-title">Juegos Interactivos en Pantalla Grande</div>' +
    '<div class="tv-games-hero-sub">Juega directo con las flechas y OK del mando de la tele, o escanea el QR con tu móvil para usar el volante giroscópico 3D.</div>' +
    '</div>';
  container.appendChild(hero);

  var games = [
    {
      id: 'racing3d',
      cls: 'racing',
      badge: '3D WebGL · Volante Móvil QR',
      icon: '🏎️',
      title: 'Nitro GP 3D · Coches con Móvil',
      desc: 'Circuito 3D fluido con turbos, partículas y físicas reales. Usa tu teléfono como volante con giroscopio escaneando el QR o con las flechas del mando.',
      cta: 'Arrancar Carrera 3D'
    },
    {
      id: 'penalty',
      cls: 'penalty',
      badge: 'Fútbol · Mando TV (Flechas + OK)',
      icon: '⚽',
      title: 'Penaltis Mundial Pro',
      desc: 'Tanda de 5 penaltis y muerte súbita con portería 3D, red física animada, efectos de tiro con rosca y rondas alternas de tirador y portero.',
      cta: 'Jugar Penaltis'
    },
    {
      id: 'headsoccer',
      cls: 'soccer',
      badge: 'Fútbol Arcade · 60 FPS Mando TV',
      icon: '🥅',
      title: 'Fútbol Cabezones Stadium TV',
      desc: 'Partido 1 contra 1 en el estadio a 60 FPS. Muévete con Izquierda/Derecha, salta con Arriba y chuta con OK contra la IA.',
      cta: 'Saltar al Campo'
    }
  ];

  var grid = document.createElement('div');
  grid.className = 'tv-games-grid';

  for (var i = 0; i < games.length; i++) {
    (function (g) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tv-game-card';
      btn.tabIndex = 0;
      btn.setAttribute('data-tv-game', g.id);
      btn.innerHTML =
        '<div class="tv-game-card-stage ' + g.cls + '">' +
        '<div class="tv-game-badge-row"><span class="tv-game-badge">' + escapeHtml(g.badge) + '</span></div>' +
        '<div class="tv-game-icon-big">' + g.icon + '</div>' +
        '</div>' +
        '<div class="tv-game-card-body">' +
        '<div class="tv-game-card-title">' + escapeHtml(g.title) + '</div>' +
        '<div class="tv-game-card-desc">' + escapeHtml(g.desc) + '</div>' +
        '<span class="tv-game-card-cta">' + escapeHtml(g.cta) + '</span>' +
        '</div>';
      btn.onclick = function () {
        lastHubFocusedEl = btn;
        openTvGame(g.id);
      };
      grid.appendChild(btn);
    })(games[i]);
  }
  container.appendChild(grid);
}
window.renderTvGamesCatalogInto = renderTvGamesCatalogInto;

function openTvGame(gameId) {
  closeTvGame();
  if (typeof unlockAudio === 'function') unlockAudio();
  var scr = document.getElementById('tv-games-screen');
  if (!scr) return;
  TV_GAME_ACTIVE = gameId;
  scr.style.display = '-webkit-flex';
  scr.style.display = 'flex';

  if (gameId === 'racing3d' && typeof window.startTvRacingGame === 'function') {
    window.startTvRacingGame(scr);
    return;
  }
  if (gameId === 'penalty') {
    startPenaltyGame(scr);
    return;
  }
  if (typeof window.startHeadSoccerGame === 'function') {
    window.startHeadSoccerGame(scr);
  }
}
window.openTvGame = openTvGame;

// ===================================================================
// GAME 1: PENALTIS MUNDIAL PRO (HTML5 CANVAS 3D STADIUM SHOOTOUT)
// ===================================================================
function startPenaltyGame(scr) {
  var bestScore = 0;
  try {
    bestScore = Number(localStorage.getItem(TV_PENALTY_BEST_KEY) || '0') || 0;
  } catch (e) {}

  scr.innerHTML =
    '<div class="tv-game-topbar">' +
    '<div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">⚽ Penaltis Mundial Pro</div>' +
    '</div>' +
    '<div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-green" id="pen-score-pill">TÚ 0 - 0 CPU</div>' +
    '<div class="tv-game-hud-pill accent-purple" id="pen-round-pill">RONDA 1/5 · TIRADOR</div>' +
    '<div class="tv-game-hud-pill" id="pen-best-pill">Récord: ' + bestScore + '</div>' +
    '</div></div>' +
    '<div class="tv-game-arena">' +
    '<canvas id="tv-penalty-canvas" class="tv-game-canvas" width="960" height="540"></canvas>' +
    '<div class="tv-game-finish-overlay" id="pen-finish-ov">' +
    '<div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="pen-fin-title">¡CAMPEÓN!</div>' +
    '<div class="tv-game-finish-sub" id="pen-fin-sub">Resultado final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-pen-replay" class="tv-btn-primary" tabindex="0">Jugar otra tanda (OK)</button>' +
    '<button type="button" id="btn-pen-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Tirador: ◀ ▲ ▶ ▼ para apuntar en la portería + OK para chutar con efecto</span>' +
    '<span>Portero: ◀ Izquierda · ▲ Centro/Alto · ▶ Derecha para parar el tiro</span>' +
    '</div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-pen-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-penalty-canvas');
  var ctx = canvas.getContext('2d');
  var scorePill = document.getElementById('pen-score-pill');
  var roundPill = document.getElementById('pen-round-pill');
  var bestPill = document.getElementById('pen-best-pill');
  var finOv = document.getElementById('pen-finish-ov');
  var finTitle = document.getElementById('pen-fin-title');
  var finSub = document.getElementById('pen-fin-sub');

  var goalLeft = 240;
  var goalRight = 720;
  var goalTop = 104;
  var goalBottom = 304;
  var spotX = 480;
  var spotY = 468;

  var state = {
    role: 'kick', // 'kick' | 'save'
    round: 1,
    myScore: 0,
    cpuScore: 0,
    myHistory: [],
    cpuHistory: [],
    phase: 'aim', // 'aim' | 'flight' | 'result' | 'wait_save' | 'finished'
    aimX: 480,
    aimY: 196,
    powerPhase: 0,
    flightT: 0,
    startX: spotX,
    startY: spotY,
    targetX: 480,
    targetY: 190,
    curveDx: 0,
    keeperX: 480,
    keeperTargetX: 480,
    keeperDiveY: 0,
    bannerMsg: 'APUNTA CON LAS FLECHAS Y PULSA OK',
    bannerColor: '#FDE047',
    netWave: 0,
    resultTimer: 0,
    cpuWaitTimer: 0,
    cpuChosenZone: 0
  };

  function resetPenaltyMatch() {
    state.role = 'kick';
    state.round = 1;
    state.myScore = 0;
    state.cpuScore = 0;
    state.myHistory = [];
    state.cpuHistory = [];
    state.phase = 'aim';
    state.aimX = 480;
    state.aimY = 196;
    state.keeperX = 480;
    state.keeperTargetX = 480;
    state.keeperDiveY = 0;
    state.netWave = 0;
    state.bannerMsg = 'APUNTA CON LAS FLECHAS Y PULSA OK';
    state.bannerColor = '#FDE047';
    finOv.style.display = 'none';
    syncHud();
  }
  document.getElementById('btn-pen-replay').onclick = resetPenaltyMatch;

  function syncHud() {
    scorePill.textContent = 'TÚ ' + state.myScore + ' - ' + state.cpuScore + ' CPU';
    var roundLabel = state.round > 5 ? 'MUERTE SÚBITA' : 'RONDA ' + state.round + '/5';
    roundPill.textContent = roundLabel + ' · ' + (state.role === 'kick' ? 'TIRADOR' : 'PORTERO');
  }

  function isMatchDecided() {
    if (state.round <= 5) {
      var myLeft = 5 - state.myHistory.length;
      var cpuLeft = 5 - state.cpuHistory.length;
      if (state.myScore - state.cpuScore > cpuLeft) return true;
      if (state.cpuScore - state.myScore > myLeft) return true;
      return state.myHistory.length >= 5 && state.cpuHistory.length >= 5 && state.myScore !== state.cpuScore;
    }
    return state.myHistory.length === state.cpuHistory.length && state.myScore !== state.cpuScore;
  }

  function nextTurn() {
    if (isMatchDecided()) {
      state.phase = 'finished';
      var won = state.myScore > state.cpuScore;
      finTitle.textContent = won ? '🏆 ¡HAS GANADO LA TANDA!' : '🧤 VICTORIA PARA LA CPU';
      finSub.textContent = 'Marcador final: TÚ ' + state.myScore + ' - ' + state.cpuScore + ' CPU';
      if (won) {
        bestScore += 1;
        try { localStorage.setItem(TV_PENALTY_BEST_KEY, String(bestScore)); } catch (e) {}
        bestPill.textContent = 'Récord: ' + bestScore;
        playTvGameBeep(660, 0.25, 'triangle', 0.1);
      }
      finOv.style.display = '-webkit-flex';
      finOv.style.display = 'flex';
      var rBtn = document.getElementById('btn-pen-replay');
      if (rBtn && rBtn.focus) rBtn.focus();
      return;
    }

    if (state.role === 'kick') {
      state.role = 'save';
      state.phase = 'wait_save';
      state.keeperX = 480;
      state.keeperTargetX = 480;
      state.keeperDiveY = 0;
      state.cpuWaitTimer = 2.1;
      state.cpuChosenZone = Math.floor(Math.random() * 3) - 1; // -1 left, 0 center, +1 right
      state.bannerMsg = 'ERES EL PORTERO · ELIGE ◀ ▲ ▶ ANTES DEL DISPARO';
      state.bannerColor = '#38BDF8';
    } else {
      state.role = 'kick';
      state.round += 1;
      state.phase = 'aim';
      state.aimX = 480;
      state.aimY = 196;
      state.keeperX = 480;
      state.keeperTargetX = 480;
      state.keeperDiveY = 0;
      state.bannerMsg = 'TU TURNO · APUNTA CON LAS FLECHAS Y CHUTA CON OK';
      state.bannerColor = '#FDE047';
    }
    syncHud();
  }

  function shootPlayerBall() {
    if (state.phase !== 'aim') return;
    var pwr = 0.5 + 0.5 * Math.sin(state.powerPhase * 3.8);
    var spread = (1 - pwr) * 18;
    state.targetX = state.aimX + (Math.random() - 0.5) * spread;
    state.targetY = state.aimY + (Math.random() - 0.5) * spread * 0.7;
    state.curveDx = (480 - state.targetX) * 0.22;
    state.flightT = 0;
    state.phase = 'flight';
    var diveChoice = Math.random();
    if (diveChoice < 0.38) state.keeperTargetX = goalLeft + 58;
    else if (diveChoice < 0.76) state.keeperTargetX = goalRight - 58;
    else state.keeperTargetX = 480;
    state.keeperDiveY = Math.random() > 0.45 ? -22 : 6;
    playTvGameBeep(190, 0.12, 'triangle', 0.14);
  }

  function triggerSaveDive(dir) {
    if (state.phase !== 'wait_save') return;
    state.keeperTargetX = dir < 0 ? goalLeft + 62 : dir > 0 ? goalRight - 62 : 480;
    state.keeperDiveY = dir === 0 ? -18 : 6;
    launchCpuShot();
  }

  function launchCpuShot() {
    var z = state.cpuChosenZone;
    state.targetX = z < 0 ? goalLeft + 52 + Math.random() * 55 : z > 0 ? goalRight - 52 - Math.random() * 55 : 440 + Math.random() * 80;
    state.targetY = goalTop + 34 + Math.random() * 115;
    state.curveDx = (480 - state.targetX) * 0.16;
    state.flightT = 0;
    state.phase = 'flight';
    playTvGameBeep(210, 0.11, 'triangle', 0.12);
  }

  function resolveShotOutcome() {
    var inGoalX = state.targetX >= goalLeft + 10 && state.targetX <= goalRight - 10;
    var inGoalY = state.targetY >= goalTop + 10 && state.targetY <= goalBottom - 8;
    var distToKeeper = Math.hypot(state.targetX - state.keeperX, state.targetY - (232 + state.keeperDiveY));
    var saved = inGoalX && inGoalY && distToKeeper < 64;
    var scored = inGoalX && inGoalY && !saved;

    if (state.role === 'kick') {
      state.myHistory.push(scored ? 'G' : 'X');
      if (scored) state.myScore += 1;
    } else {
      state.cpuHistory.push(scored ? 'G' : 'X');
      if (scored) state.cpuScore += 1;
    }

    if (scored) {
      state.netWave = 1;
      state.bannerMsg = state.role === 'kick' ? '⚽ ¡GOOOOLAZO!' : '⚽ ¡GOL DE LA CPU!';
      state.bannerColor = '#4ADE80';
      playTvGameBeep(523, 0.22, 'sawtooth', 0.09);
    } else if (saved) {
      state.bannerMsg = state.role === 'save' ? '🧤 ¡PARADÓN ESPECTACULAR!' : '🧤 ¡PARADA DEL PORTERO!';
      state.bannerColor = '#38BDF8';
      playTvGameBeep(310, 0.18, 'square', 0.08);
    } else {
      state.bannerMsg = '❌ ¡FUERA / AL LARGUERO!';
      state.bannerColor = '#FB7185';
      playTvGameBeep(130, 0.22, 'sawtooth', 0.09);
    }
    state.phase = 'result';
    state.resultTimer = 1.65;
    syncHud();
  }

  tvGameKeyHandler = function (e, code) {
    if (state.phase === 'finished') {
      if (code === 13 || code === 23 || code === 66 || code === 32) {
        if (e.preventDefault) e.preventDefault();
        resetPenaltyMatch();
        return true;
      }
      return false;
    }
    var step = 28;
    if (state.phase === 'aim' && state.role === 'kick') {
      if (code === 37 || code === 21) { state.aimX = Math.max(goalLeft - 18, state.aimX - step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { state.aimX = Math.min(goalRight + 18, state.aimX + step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 38 || code === 19) { state.aimY = Math.max(goalTop - 10, state.aimY - step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 40 || code === 20) { state.aimY = Math.min(goalBottom - 16, state.aimY + step); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); shootPlayerBall(); return true; }
    } else if (state.phase === 'wait_save' && state.role === 'save') {
      if (code === 37 || code === 21) { if (e.preventDefault) e.preventDefault(); triggerSaveDive(-1); return true; }
      if (code === 39 || code === 22) { if (e.preventDefault) e.preventDefault(); triggerSaveDive(1); return true; }
      if (code === 38 || code === 19 || code === 13 || code === 23 || code === 66 || code === 32) {
        if (e.preventDefault) e.preventDefault();
        triggerSaveDive(0);
        return true;
      }
    }
    return false;
  };

  var lastTs = performance.now();
  function frame(now) {
    if (TV_GAME_ACTIVE !== 'penalty') return;
    var dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    state.powerPhase += dt;
    state.netWave = Math.max(0, state.netWave - dt * 1.4);

    if (state.phase === 'wait_save') {
      state.cpuWaitTimer -= dt;
      if (state.cpuWaitTimer <= 0) {
        launchCpuShot();
      }
    } else if (state.phase === 'flight') {
      state.flightT = Math.min(1, state.flightT + dt * 1.85);
      state.keeperX += (state.keeperTargetX - state.keeperX) * Math.min(1, dt * 8.5);
      if (state.flightT >= 1) resolveShotOutcome();
    } else if (state.phase === 'result') {
      state.resultTimer -= dt;
      if (state.resultTimer <= 0) nextTurn();
    }

    drawStadiumScene();
    TV_GAME_RAF = requestAnimationFrame(frame);
  }

  function drawStadiumScene() {
    var skyGrad = ctx.createLinearGradient(0, 0, 0, 290);
    skyGrad.addColorStop(0, '#070b18');
    skyGrad.addColorStop(1, '#111b36');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 960, 290);

    // Crowd stands + floodlights
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 175, 960, 125);
    ctx.fillStyle = 'rgba(253, 224, 71, 0.12)';
    ctx.beginPath(); ctx.arc(150, 48, 72, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(810, 48, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.arc(150, 48, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(810, 48, 12, 0, Math.PI * 2); ctx.fill();

    // Pitch stripes
    var turf = ctx.createLinearGradient(0, 290, 0, 540);
    turf.addColorStop(0, '#0f6d34');
    turf.addColorStop(1, '#15803d');
    ctx.fillStyle = turf;
    ctx.fillRect(0, 290, 960, 250);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 340, 960, 48);
    ctx.fillRect(0, 440, 960, 52);

    // Penalty box lines
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(140, 296, 680, 195);
    ctx.beginPath(); ctx.arc(spotX, spotY, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

    // Goal Net Mesh with ripple physics
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.4;
    for (var gx = goalLeft; gx <= goalRight; gx += 24) {
      var wave = state.netWave > 0 ? Math.sin(gx * 0.08 + state.powerPhase * 18) * state.netWave * 12 : 0;
      ctx.beginPath();
      ctx.moveTo(gx, goalTop);
      ctx.quadraticCurveTo(gx + wave, (goalTop + goalBottom) / 2, gx, goalBottom);
      ctx.stroke();
    }
    for (var gy = goalTop; gy <= goalBottom; gy += 22) {
      var hWave = state.netWave > 0 ? Math.sin(gy * 0.1 + state.powerPhase * 20) * state.netWave * 10 : 0;
      ctx.beginPath();
      ctx.moveTo(goalLeft, gy);
      ctx.quadraticCurveTo(480, gy + hWave, goalRight, gy);
      ctx.stroke();
    }

    // 3D Goalposts
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalBottom);
    ctx.lineTo(goalLeft, goalTop);
    ctx.lineTo(goalRight, goalTop);
    ctx.lineTo(goalRight, goalBottom);
    ctx.stroke();

    // Goalkeeper
    var kx = state.keeperX;
    var ky = 248 + state.keeperDiveY;
    ctx.fillStyle = state.role === 'save' ? '#38BDF8' : '#F97316';
    ctx.fillRect(kx - 20, ky - 28, 40, 52);
    ctx.fillStyle = '#FDBA74';
    ctx.beginPath(); ctx.arc(kx, ky - 42, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(kx - 32, ky - 14, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(kx + 32, ky - 14, 11, 0, Math.PI * 2); ctx.fill();

    // Aiming reticle + power meter (Striker aim)
    if (state.phase === 'aim' && state.role === 'kick') {
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(state.aimX, state.aimY, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(state.aimX - 30, state.aimY); ctx.lineTo(state.aimX + 30, state.aimY);
      ctx.moveTo(state.aimX, state.aimY - 30); ctx.lineTo(state.aimX, state.aimY + 30);
      ctx.stroke();

      var pVal = 0.5 + 0.5 * Math.sin(state.powerPhase * 3.8);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(340, 502, 280, 14);
      ctx.fillStyle = pVal > 0.72 ? '#4ADE80' : '#FACC15';
      ctx.fillRect(340, 502, 280 * pVal, 14);
    }

    // Ball (Bezier curved shot with perspective scaling)
    var bx = spotX;
    var by = spotY;
    var bScale = 1;
    if (state.phase === 'flight' || state.phase === 'result') {
      var t = state.phase === 'result' ? 1 : state.flightT;
      var inv = 1 - t;
      var ctrlX = (spotX + state.targetX) / 2 + state.curveDx;
      var ctrlY = Math.min(spotY, state.targetY) - 48;
      bx = inv * inv * spotX + 2 * inv * t * ctrlX + t * t * state.targetX;
      by = inv * inv * spotY + 2 * inv * t * ctrlY + t * t * state.targetY;
      bScale = 1 - 0.52 * t;
    }
    var r = 18 * bScale;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(bx, by + r + 5, r * 1.05, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Shootout Dots + Banner
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = state.bannerColor;
    ctx.fillText(state.bannerMsg, 480, 56);
    drawDots(190, 82, 'TÚ', state.myHistory);
    drawDots(610, 82, 'CPU', state.cpuHistory);
  }

  function drawDots(x0, y0, label, hist) {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(label, x0 - 42, y0 + 5);
    for (var i = 0; i < Math.max(5, hist.length); i++) {
      var v = hist[i];
      ctx.fillStyle = v === 'G' ? '#22C55E' : v === 'X' ? '#EF4444' : '#334155';
      ctx.beginPath();
      ctx.arc(x0 + i * 24, y0, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resetPenaltyMatch();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
