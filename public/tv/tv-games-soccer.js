// ===================================================================
// SMART TV GAME: FUTBOL CABEZONES STADIUM TV (60FPS 1v1 REMOTE ARCADE)
// Strict ES5 for Samsung Tizen WebKit, LG webOS & Google TV WebView
// ===================================================================
function startHeadSoccerGame(scr) {
  scr.innerHTML =
    '<div class="tv-game-topbar">' +
    '<div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">🥅 Fútbol Cabezones Stadium TV</div>' +
    '</div>' +
    '<div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-green" id="hs-score-pill">TÚ 0 - 0 CPU</div>' +
    '<div class="tv-game-hud-pill accent-purple" id="hs-clock-pill">60s</div>' +
    '</div></div>' +
    '<div class="tv-game-arena">' +
    '<canvas id="tv-hs-canvas" class="tv-game-canvas" width="920" height="440"></canvas>' +
    '<div class="tv-game-finish-overlay" id="hs-finish-ov">' +
    '<div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="hs-fin-title">¡FINAL DEL PARTIDO!</div>' +
    '<div class="tv-game-finish-sub" id="hs-fin-sub">Marcador final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-hs-replay" class="tv-btn-primary" tabindex="0">Revancha (OK)</button>' +
    '<button type="button" id="btn-hs-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Mover: ◀ Izquierda / ▶ Derecha · Saltar: ▲ Arriba</span>' +
    '<span>Chutar / Remate aéreo: OK (Enter) · Gol de Oro si hay empate</span>' +
    '</div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-hs-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-hs-canvas');
  var ctx = canvas.getContext('2d');
  var scorePill = document.getElementById('hs-score-pill');
  var clockPill = document.getElementById('hs-clock-pill');
  var finOv = document.getElementById('hs-finish-ov');
  var finTitle = document.getElementById('hs-fin-title');
  var finSub = document.getElementById('hs-fin-sub');

  var W = 920;
  var H = 440;
  var GY = 372;
  var GW = 54;
  var GH = 136;
  var PR = 24;
  var BR = 16;

  var keys = { left: false, right: false, jump: false, kick: false };
  var match = {
    sL: 0, sR: 0, timeLeft: 60, over: false, goalPause: 0, banner: '',
    p1: { x: 210, y: GY - PR, vx: 0, vy: 0, kickT: 0 },
    p2: { x: W - 210, y: GY - PR, vx: 0, vy: 0, kickT: 0 },
    ball: { x: W / 2, y: 180, vx: 0, vy: 0 }
  };

  function resetPositions() {
    match.p1 = { x: 210, y: GY - PR, vx: 0, vy: 0, kickT: 0 };
    match.p2 = { x: W - 210, y: GY - PR, vx: 0, vy: 0, kickT: 0 };
    match.ball = { x: W / 2, y: 165, vx: (Math.random() - 0.5) * 90, vy: 0 };
  }

  function resetHsMatch() {
    match.sL = 0; match.sR = 0; match.timeLeft = 60; match.over = false; match.goalPause = 0; match.banner = '';
    finOv.style.display = 'none';
    resetPositions();
    syncHsHud();
  }
  document.getElementById('btn-hs-replay').onclick = resetHsMatch;

  function syncHsHud() {
    scorePill.textContent = 'TÚ ' + match.sL + ' - ' + match.sR + ' CPU';
    clockPill.textContent = match.timeLeft <= 0 ? 'GOL DE ORO' : Math.ceil(match.timeLeft) + 's';
  }

  tvGameKeyHandler = function (e, code) {
    if (match.over && (code === 13 || code === 23 || code === 66 || code === 32)) {
      if (e.preventDefault) e.preventDefault();
      resetHsMatch();
      return true;
    }
    if (code === 37 || code === 21) { keys.left = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 39 || code === 22) { keys.right = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 38 || code === 19) { keys.jump = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) {
      keys.kick = true;
      match.p1.kickT = 0.22;
      if (e.preventDefault) e.preventDefault();
      return true;
    }
    return false;
  };
  tvGameKeyUpHandler = function (_e, code) {
    if (code === 37 || code === 21) { keys.left = false; return true; }
    if (code === 39 || code === 22) { keys.right = false; return true; }
    if (code === 38 || code === 19) { keys.jump = false; return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.kick = false; return true; }
    return false;
  };

  function stepPlayer(p, dir, jumpWant, dt) {
    var spd = 340;
    p.vx = dir * spd;
    p.vy += 1280 * dt;
    if (jumpWant && p.y >= GY - PR - 1) {
      p.vy = -590;
      playTvGameBeep(260, 0.08, 'sine', 0.05);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y > GY - PR) { p.y = GY - PR; p.vy = 0; }
    p.x = Math.max(GW + PR + 4, Math.min(W - GW - PR - 4, p.x));
    if (p.kickT > 0) p.kickT = Math.max(0, p.kickT - dt);
  }

  function collideBallPlayer(p, facing, isKicking) {
    var b = match.ball;
    var dx = b.x - p.x;
    var dy = b.y - p.y;
    var dist = Math.hypot(dx, dy);
    var minD = PR + BR;
    if (dist > 0.01 && dist < minD + (isKicking ? 16 : 0)) {
      var nx = dx / dist;
      var ny = dy / dist;
      b.x = p.x + nx * (minD + 2);
      b.y = p.y + ny * (minD + 2);
      var boost = isKicking ? 640 : 410;
      b.vx = p.vx * 0.55 + nx * boost + (isKicking ? facing * 170 : 0);
      b.vy = Math.min(-240, p.vy * 0.4 + ny * boost - (isKicking ? 160 : 60));
      playTvGameBeep(isKicking ? 210 : 320, 0.08, 'triangle', 0.08);
    }
  }

  var lastTs = performance.now();
  function frame(now) {
    if (TV_GAME_ACTIVE !== 'headsoccer') return;
    var dt = Math.min(0.035, (now - lastTs) / 1000);
    lastTs = now;

    if (!match.over) {
      if (match.goalPause > 0) {
        match.goalPause -= dt;
        if (match.goalPause <= 0) {
          match.banner = '';
          resetPositions();
        }
      } else {
        if (match.timeLeft > 0) match.timeLeft = Math.max(0, match.timeLeft - dt);
        var p1Dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        stepPlayer(match.p1, p1Dir, keys.jump, dt);

        var aiTargetX = match.ball.x > W * 0.45 ? match.ball.x + 26 : W - 180;
        var aiDir = match.p2.x < aiTargetX - 14 ? 1 : match.p2.x > aiTargetX + 14 ? -1 : 0;
        var aiJump = match.ball.y < GY - 95 && Math.abs(match.ball.x - match.p2.x) < 60;
        if (Math.hypot(match.ball.x - match.p2.x, match.ball.y - match.p2.y) < 58 && match.p2.kickT <= 0) {
          match.p2.kickT = 0.18;
        }
        stepPlayer(match.p2, aiDir, aiJump, dt);

        var b = match.ball;
        b.vy += 980 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= 0.995;

        if (b.y > GY - BR) { b.y = GY - BR; b.vy = -Math.abs(b.vy) * 0.78; }
        if (b.y < BR + 10) { b.y = BR + 10; b.vy = Math.abs(b.vy) * 0.8; }
        var goalTopY = GY - GH;
        if (b.x < GW && b.y > goalTopY) {
          match.sR += 1;
          match.goalPause = 1.4;
          match.banner = '¡GOL DE LA CPU!';
          playTvGameBeep(220, 0.25, 'sawtooth', 0.1);
        } else if (b.x > W - GW && b.y > goalTopY) {
          match.sL += 1;
          match.goalPause = 1.4;
          match.banner = '⚽ ¡GOOOOL TUYO!';
          playTvGameBeep(580, 0.25, 'triangle', 0.12);
        } else {
          if (b.x < GW + BR) { b.x = GW + BR; b.vx = Math.abs(b.vx) * 0.82; }
          if (b.x > W - GW - BR) { b.x = W - GW - BR; b.vx = -Math.abs(b.vx) * 0.82; }
        }

        collideBallPlayer(match.p1, 1, match.p1.kickT > 0);
        collideBallPlayer(match.p2, -1, match.p2.kickT > 0);

        if (match.timeLeft <= 0 && match.sL !== match.sR) {
          match.over = true;
          finTitle.textContent = match.sL > match.sR ? '🏆 ¡VICTORIA EN EL ESTADIO!' : '⚽ FINAL DEL PARTIDO';
          finSub.textContent = 'Marcador final: TÚ ' + match.sL + ' - ' + match.sR + ' CPU';
          finOv.style.display = '-webkit-flex';
          finOv.style.display = 'flex';
          var rb = document.getElementById('btn-hs-replay');
          if (rb && rb.focus) rb.focus();
        }
        syncHsHud();
      }
    }

    ctx.fillStyle = '#0B1324';
    ctx.fillRect(0, 0, W, GY);
    ctx.fillStyle = '#15803D';
    ctx.fillRect(0, GY, W, H - GY);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, GY); ctx.lineTo(W / 2, H); ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, GY - GH, GW - 4, GH);
    ctx.strokeRect(W - GW, GY - GH, GW - 4, GH);

    drawHeadPlayer(match.p1, '#7C3AED', '#22D3EE', 1);
    drawHeadPlayer(match.p2, '#E11D48', '#FACC15', -1);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(match.ball.x, match.ball.y, BR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2; ctx.stroke();

    if (match.banner) {
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FACC15';
      ctx.fillText(match.banner, W / 2, 120);
    }

    TV_GAME_RAF = requestAnimationFrame(frame);
  }

  function drawHeadPlayer(p, jersey, trim, dir) {
    ctx.fillStyle = jersey;
    ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(p.x + dir * 9, p.y - 6, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath(); ctx.arc(p.x + dir * 11, p.y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
    var bootOff = p.kickT > 0 ? dir * 24 : dir * 10;
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(p.x + bootOff - 8, p.y + PR - 8, 16, 10);
  }

  resetHsMatch();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startHeadSoccerGame = startHeadSoccerGame;
