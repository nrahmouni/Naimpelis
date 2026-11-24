// ===================================================================
// SMART TV GAME: FUTBOL CABEZONES STADIUM TV (60FPS 1v1 REMOTE + GYRO)
// Strict ES5 for Samsung Tizen WebKit, LG webOS & Google TV WebView
// Fixes goal-line wall bug, adds crossbar/post physics, stadium HD gfx
// ===================================================================
var tvSoccerWs = null;
var tvSoccerGyro1 = { steer: 0, throttle: 0, nitro: false, handbrake: false, expiresAt: 0 };
var tvSoccerGyro2 = { steer: 0, throttle: 0, nitro: false, handbrake: false, expiresAt: 0 };

function closeTvSoccerGame() {
  if (tvSoccerWs) {
    tvSoccerWs.onclose = null;
    try { tvSoccerWs.close(); } catch (e) {}
    tvSoccerWs = null;
  }
  tvSoccerGyro1 = { steer: 0, throttle: 0, nitro: false, handbrake: false, expiresAt: 0 };
  tvSoccerGyro2 = { steer: 0, throttle: 0, nitro: false, handbrake: false, expiresAt: 0 };
}
window.closeTvSoccerGame = closeTvSoccerGame;

function startHeadSoccerGame(scr) {
  var soccerRoom = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('hs-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  if (typeof window.preloadTvGameSprites === 'function') {
    window.preloadTvGameSprites(['assets/games/arenas/soccer_stadium.jpg', 'assets/games/sports/ball_soccer1.png', 'assets/games/particles/star_07.png']);
  }

  scr.innerHTML =
    '<div class="tv-game-topbar">' +
    '<div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">🥅 Fútbol Cabezones Stadium TV</div>' +
    '</div>' +
    '<div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="hs-gyro-pill">📱 Esperando Móviles</div>' +
    '<div class="tv-game-hud-pill accent-green" id="hs-score-pill">TÚ 0 - 0 CPU</div>' +
    '<div class="tv-game-hud-pill accent-purple" id="hs-clock-pill">60s</div>' +
    '</div></div>' +
    '<div class="tv-game-arena" id="hs-arena">' +
    '<canvas id="tv-hs-canvas" class="tv-game-canvas" width="920" height="460"></canvas>' +
    '<div class="tv-game-finish-overlay" id="hs-finish-ov">' +
    '<div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="hs-fin-title">¡FINAL DEL PARTIDO!</div>' +
    '<div class="tv-game-finish-sub" id="hs-fin-sub">Marcador final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-hs-replay" class="tv-btn-primary" tabindex="0">Revancha (OK)</button>' +
    '<button type="button" id="btn-hs-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Mover: ◀ Izquierda / ▶ Derecha · Saltar: ▲ Arriba · Chutar / Remate aéreo: OK (Enter)</span>' +
    '<span>Gol de Oro si hay empate · Escanea J1/J2 en vertical sin escribir código</span>' +
    '</div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-hs-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-hs-canvas');
  var ctx = canvas.getContext('2d');
  var arenaEl = document.getElementById('hs-arena');
  var scorePill = document.getElementById('hs-score-pill');
  var clockPill = document.getElementById('hs-clock-pill');
  var gyroPill = document.getElementById('hs-gyro-pill');
  var finOv = document.getElementById('hs-finish-ov');
  var finTitle = document.getElementById('hs-fin-title');
  var finSub = document.getElementById('hs-fin-sub');
  var lobby = typeof window.createTvDualQrLobby === 'function'
    ? window.createTvDualQrLobby(arenaEl, { roomId: soccerRoom, gameId: 'headsoccer', title: '🥅 Fútbol Cabezones · QR J1 y J2' })
    : null;

  // Connect Mobile Gyro WS for Head Soccer
  if (window.WebSocket && typeof getTvRacingWsUrl === 'function') {
    try {
      var ws = new WebSocket(getTvRacingWsUrl());
      tvSoccerWs = ws;
      ws.onopen = function () {
        if (tvSoccerWs !== ws) return;
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomId: soccerRoom,
            roomName: 'Fútbol Cabezones',
            user: { id: 'tv-hs-' + soccerRoom, name: 'Smart TV', avatar: '🥅', color: '#7C3AED', isHost: true }
          }
        }));
        ws.send(JSON.stringify({
          type: 'GYRO_CONTROLLER_JOIN',
          payload: { roomId: soccerRoom, role: 'display', deviceName: 'Cabezones TV', gameId: 'headsoccer' }
        }));
      };
      ws.onmessage = function (ev) {
        if (tvSoccerWs !== ws) return;
        try {
          var msg = JSON.parse(ev.data);
          if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
            var cList = msg.payload.controllers || [];
            if (lobby) lobby.onStatus(cList);
            if (gyroPill) {
              if (msg.payload.hasController) {
                gyroPill.className = 'tv-game-hud-pill accent-green';
                gyroPill.textContent = cList.length >= 2 ? '📱 2 Móviles Activos (J1 vs J2)' : '📱 Mando Móvil Activo';
              } else {
                gyroPill.className = 'tv-game-hud-pill accent-purple';
                gyroPill.textContent = '📱 Esperando Móviles';
              }
            }
          } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
            var p = msg.payload;
            var tgt = p.playerSlot === 2 ? tvSoccerGyro2 : tvSoccerGyro1;
            var plr = p.playerSlot === 2 ? match.p2 : match.p1;
            tgt.steer = typeof p.steer === 'number' ? p.steer : 0;
            tgt.throttle = typeof p.throttle === 'number' ? p.throttle : 0;
            tgt.handbrake = Boolean(p.handbrake);
            tgt.nitro = Boolean(p.nitro);
            tgt.expiresAt = Date.now() + 1200;
            if (tgt.nitro && plr.kickCd <= 0 && !match.over && (!lobby || lobby.isReady())) {
              plr.kickT = 0.22;
              plr.kickCd = 0.32;
            }
          }
        } catch (e) {}
      };
    } catch (eWs) {}
  }

  var W = 920;
  var H = 460;
  var GY = 392;
  var GW = 66;
  var GH = 150;
  var POST_R = 7;
  var PR = 27;
  var BR = 16;

  var keys = { left: false, right: false, jump: false, kick: false };
  var confetti = [];
  var trail = [];
  var netRippleL = 0;
  var netRippleR = 0;
  var match = {
    sL: 0, sR: 0, timeLeft: 60, over: false, goalPause: 0, banner: '', bannerColor: '#FACC15',
    p1: { x: 225, y: GY - PR, vx: 0, vy: 0, kickT: 0, kickCd: 0 },
    p2: { x: W - 225, y: GY - PR, vx: 0, vy: 0, kickT: 0, kickCd: 0 },
    ball: { x: W / 2, y: 170, vx: 0, vy: 0, angle: 0, spin: 0 }
  };

  function resetPositions() {
    match.p1 = { x: 225, y: GY - PR, vx: 0, vy: 0, kickT: 0, kickCd: 0 };
    match.p2 = { x: W - 225, y: GY - PR, vx: 0, vy: 0, kickT: 0, kickCd: 0 };
    match.ball = { x: W / 2, y: 165, vx: (Math.random() - 0.5) * 90, vy: 0, angle: 0, spin: 0 };
    trail = [];
  }

  function resetHsMatch() {
    match.sL = 0; match.sR = 0; match.timeLeft = 60; match.over = false; match.goalPause = 0; match.banner = '';
    confetti = [];
    netRippleL = 0; netRippleR = 0;
    finOv.style.display = 'none';
    resetPositions();
    syncHsHud();
  }
  document.getElementById('btn-hs-replay').onclick = resetHsMatch;

  function syncHsHud(p2Human) {
    scorePill.textContent = 'J1 ' + match.sL + ' - ' + match.sR + (p2Human ? ' J2' : ' CPU');
    clockPill.textContent = match.timeLeft <= 0 ? 'GOL DE ORO' : Math.ceil(match.timeLeft) + 's';
  }

  function spawnGoalConfetti(gx) {
    var colors = ['#FACC15', '#7C3AED', '#22C55E', '#38BDF8', '#FFFFFF'];
    for (var i = 0; i < 34; i++) {
      var ang = (Math.random() - 0.5) * 2.4 - Math.PI / 2;
      var spd = 160 + Math.random() * 320;
      confetti.push({
        x: gx, y: GY - GH * 0.5,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 60,
        color: colors[i % colors.length], size: 4 + Math.random() * 5, life: 1.4
      });
    }
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
      if (match.p1.kickCd <= 0) {
        match.p1.kickT = 0.22;
        match.p1.kickCd = 0.32;
      }
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
    var spd = 365;
    p.vx += (dir * spd - p.vx) * Math.min(1, dt * 18);
    p.vy += 1550 * dt;
    if (jumpWant && p.y >= GY - PR - 1.5) {
      p.vy = -660;
      playTvGameBeep(260, 0.08, 'sine', 0.05);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y > GY - PR) { p.y = GY - PR; p.vy = 0; }
    // Allow player near goal mouth to clear balls cleanly
    p.x = Math.max(24 + PR, Math.min(W - 24 - PR, p.x));
    if (p.kickT > 0) p.kickT = Math.max(0, p.kickT - dt);
    if (p.kickCd > 0) p.kickCd = Math.max(0, p.kickCd - dt);
  }

  function collideCircleCircle(ax, ay, avx, avy, ar, bx, by, bvx, bvy, br, restitution) {
    var dx = bx - ax;
    var dy = by - ay;
    var minD = ar + br;
    var distSq = dx * dx + dy * dy;
    if (distSq >= minD * minD || distSq < 0.0001) return false;
    var dist = Math.sqrt(distSq);
    var nx = dx / dist;
    var ny = dy / dist;
    var overlap = minD - dist;
    match.ball.x = bx + nx * (overlap + 0.5);
    match.ball.y = by + ny * (overlap + 0.5);
    var rvx = bvx - avx;
    var rvy = bvy - avy;
    var vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      var imp = -(1 + restitution) * vn;
      match.ball.vx = bvx + nx * imp;
      match.ball.vy = bvy + ny * imp;
    }
    return true;
  }

  function collideBallPlayer(p, facing) {
    var b = match.ball;
    if (collideCircleCircle(p.x, p.y, p.vx, p.vy, PR, b.x, b.y, b.vx, b.vy, BR, 0.86)) {
      b.vx += p.vx * 0.34;
      b.vy -= (p.vy < -40 ? 90 : 35);
      b.spin = facing * 6;
      playTvGameBeep(320, 0.06, 'triangle', 0.06);
    }

    var bootR = p.kickT > 0 ? 20 : 13;
    var bootOffX = facing * (p.kickT > 0 ? 26 : 13);
    var bootX = p.x + bootOffX;
    var bootY = p.y + PR - (p.kickT > 0 ? 10 : 4);
    var dx = b.x - bootX;
    var dy = b.y - bootY;
    var minD = bootR + BR;
    if (dx * dx + dy * dy < minD * minD) {
      var dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      b.x = bootX + (dx / dist) * (minD + 1);
      b.y = bootY + (dy / dist) * (minD + 1);
      if (p.kickT > 0) {
        b.vx = facing * 710 + p.vx * 0.42;
        b.vy = -420 + Math.min(0, p.vy * 0.25);
        b.spin = facing * 15;
        p.kickT = 0.04;
        playTvGameBeep(210, 0.09, 'triangle', 0.09);
      } else {
        b.vx += p.vx * 0.5 + (dx / dist) * 115;
        b.vy = Math.min(b.vy, -110);
      }
    }
  }

  var lastTs = performance.now();
  function frame(now) {
    if (TV_GAME_ACTIVE !== 'headsoccer') return;
    var dt = Math.min(0.033, Math.max(0.004, (now - lastTs) / 1000));
    lastTs = now;
    netRippleL = Math.max(0, netRippleL - dt * 1.4);
    netRippleR = Math.max(0, netRippleR - dt * 1.4);

    for (var ci = confetti.length - 1; ci >= 0; ci--) {
      var cf = confetti[ci];
      cf.x += cf.vx * dt;
      cf.y += cf.vy * dt;
      cf.vy += 420 * dt;
      cf.life -= dt;
      if (cf.life <= 0) confetti.splice(ci, 1);
    }

    if (!match.over && (!lobby || lobby.isReady())) {
      if (match.goalPause > 0) {
        match.goalPause -= dt;
        // Let ball settle gently inside the net during celebration
        match.ball.vx *= 0.9;
        match.ball.vy += 650 * dt;
        match.ball.x += match.ball.vx * dt;
        match.ball.y += match.ball.vy * dt;
        if (match.ball.y > GY - BR) { match.ball.y = GY - BR; match.ball.vy = -Math.abs(match.ball.vy) * 0.35; }
        if (match.goalPause <= 0) {
          match.banner = '';
          resetPositions();
        }
      } else {
        if (match.timeLeft > 0) match.timeLeft = Math.max(0, match.timeLeft - dt);
        var tNowHs = Date.now();
        var useGyro1 = tNowHs < tvSoccerGyro1.expiresAt;
        var useGyro2 = tNowHs < tvSoccerGyro2.expiresAt;
        var p1Dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        if (p1Dir === 0 && useGyro1 && Math.abs(tvSoccerGyro1.steer) > 0.12) p1Dir = tvSoccerGyro1.steer;
        var p1Jump = keys.jump || (useGyro1 && (tvSoccerGyro1.throttle > 0.35 || tvSoccerGyro1.handbrake));

        var aiDir = 0, aiJump = false;
        if (useGyro2) {
          aiDir = Math.abs(tvSoccerGyro2.steer) > 0.12 ? tvSoccerGyro2.steer : 0;
          aiJump = tvSoccerGyro2.throttle > 0.35 || tvSoccerGyro2.handbrake;
        } else {
          var aiTargetX = match.ball.x > W * 0.42 ? match.ball.x + 26 : W - 185;
          if (match.ball.x > W - 165 && match.ball.vx > 0) aiTargetX = W - 115;
          aiDir = match.p2.x < aiTargetX - 12 ? 1 : match.p2.x > aiTargetX + 12 ? -1 : 0;
          aiJump = match.ball.y < GY - 98 && Math.abs(match.ball.x - match.p2.x) < 62;
          if (Math.hypot(match.ball.x - match.p2.x, match.ball.y - match.p2.y) < 58 && match.p2.kickCd <= 0) {
            match.p2.kickT = 0.2; match.p2.kickCd = 0.45;
          }
        }

        var goalTopY = GY - GH;
        var subSteps = 2;
        var subDt = dt / subSteps;

        for (var st = 0; st < subSteps; st++) {
          stepPlayer(match.p1, p1Dir, p1Jump, subDt);
          stepPlayer(match.p2, aiDir, aiJump, subDt);

          // Player vs Player bump
          var pdx = match.p2.x - match.p1.x;
          var pdy = match.p2.y - match.p1.y;
          var pDistSq = pdx * pdx + pdy * pdy;
          var pMin = PR * 2;
          if (pDistSq > 0.01 && pDistSq < pMin * pMin) {
            var pDist = Math.sqrt(pDistSq);
            var pnx = pdx / pDist;
            var pny = pdy / pDist;
            var half = (pMin - pDist) * 0.5;
            match.p1.x -= pnx * half; match.p1.y -= pny * half;
            match.p2.x += pnx * half; match.p2.y += pny * half;
          }

          var b = match.ball;
          b.vy += 1220 * subDt;
          b.vx *= Math.pow(0.992, subDt * 60);
          b.x += b.vx * subDt;
          b.y += b.vy * subDt;
          b.angle += (b.vx / BR) * subDt + b.spin * subDt;
          b.spin *= 0.985;

          // Pitch & ceiling
          if (b.y > GY - BR) {
            b.y = GY - BR;
            b.vy = Math.abs(b.vy) > 45 ? -Math.abs(b.vy) * 0.77 : 0;
            b.vx *= 0.96;
          }
          if (b.y < BR + 14) { b.y = BR + 14; b.vy = Math.abs(b.vy) * 0.8; }

          // Crossbar top roof bounce
          if (b.x - BR < GW && b.y < goalTopY + POST_R && b.y + BR > goalTopY - POST_R && b.vy > 0 && b.x < GW - 6) {
            b.y = goalTopY - POST_R - BR;
            b.vy = -Math.abs(b.vy) * 0.75;
          }
          if (b.x + BR > W - GW && b.y < goalTopY + POST_R && b.y + BR > goalTopY - POST_R && b.vy > 0 && b.x > W - GW + 6) {
            b.y = goalTopY - POST_R - BR;
            b.vy = -Math.abs(b.vy) * 0.75;
          }

          // Crossbar post corner circle collisions
          collideCircleCircle(GW, goalTopY, 0, 0, POST_R, b.x, b.y, b.vx, b.vy, BR, 0.84);
          collideCircleCircle(W - GW, goalTopY, 0, 0, POST_R, b.x, b.y, b.vx, b.vy, BR, 0.84);

          // Side walls ONLY ABOVE crossbar vs Back net INSIDE goal mouth!
          if (b.y <= goalTopY + POST_R) {
            if (b.x < 8 + BR) { b.x = 8 + BR; b.vx = Math.abs(b.vx) * 0.82; }
            else if (b.x > W - 8 - BR) { b.x = W - 8 - BR; b.vx = -Math.abs(b.vx) * 0.82; }
          } else {
            if (b.x < 8 + BR) { b.x = 8 + BR; b.vx = Math.abs(b.vx) * 0.35; }
            else if (b.x > W - 8 - BR) { b.x = W - 8 - BR; b.vx = -Math.abs(b.vx) * 0.35; }
          }

          collideBallPlayer(match.p1, 1);
          collideBallPlayer(match.p2, -1);

          // Clamp max speed
          var bSpd = Math.hypot(b.vx, b.vy);
          if (bSpd > 1050) { b.vx *= 1050 / bSpd; b.vy *= 1050 / bSpd; }

          // GOAL CHECK (clean goal-line crossing below crossbar — NO invisible wall!)
          if (b.y > goalTopY + 3) {
            if (b.x < GW - 4) {
              match.sR += 1;
              match.goalPause = 1.5;
              match.banner = useGyro2 ? '⚽ ¡GOL DE J2!' : '¡GOL DE LA CPU!';
              match.bannerColor = '#FB7185';
              netRippleL = 1;
              spawnGoalConfetti(GW);
              playTvGameBeep(220, 0.25, 'sawtooth', 0.1);
              break;
            } else if (b.x > W - GW + 4) {
              match.sL += 1;
              match.goalPause = 1.5;
              match.banner = '⚽ ¡GOOOOL DE J1!';
              match.bannerColor = '#4ADE80';
              netRippleR = 1;
              spawnGoalConfetti(W - GW);
              playTvGameBeep(580, 0.25, 'triangle', 0.12);
              break;
            }
          }
        }

        trail.push({ x: match.ball.x, y: match.ball.y });
        if (trail.length > 8) trail.shift();

        if (match.timeLeft <= 0 && match.sL !== match.sR && match.goalPause <= 0) {
          match.over = true;
          finTitle.textContent = match.sL > match.sR ? '🏆 ¡VICTORIA EN EL ESTADIO!' : (useGyro2 ? '🏆 ¡VICTORIA PARA J2!' : '⚽ FINAL DEL PARTIDO');
          finSub.textContent = 'Marcador final: J1 ' + match.sL + ' - ' + match.sR + (useGyro2 ? ' J2' : ' CPU');
          finOv.style.display = '-webkit-flex';
          finOv.style.display = 'flex';
          var rb = document.getElementById('btn-hs-replay');
          if (rb && rb.focus) rb.focus();
        }
        syncHsHud(useGyro2);
      }
    }

    drawStadiumScene(now / 1000);
    TV_GAME_RAF = requestAnimationFrame(frame);
  }

  function drawStadiumScene(tSec) {
    if (typeof window.drawTvSpriteRect === 'function' && window.drawTvSpriteRect(ctx, 'assets/games/arenas/soccer_stadium.jpg', 0, 0, W, GY + 14)) {
      ctx.fillStyle = 'rgba(7, 11, 24, 0.28)';
      ctx.fillRect(0, 0, W, GY);
    } else {
      var skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
      skyGrad.addColorStop(0, '#070a18'); skyGrad.addColorStop(0.6, '#121b38'); skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GY);
    }
    if (typeof window.drawTvCameraFlashes === 'function') window.drawTvCameraFlashes(ctx, W, 20, GY - 34, tSec, match.goalPause > 0);
    ctx.fillStyle = '#090d16'; ctx.fillRect(0, GY - 22, W, 22);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.72)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GY - 22); ctx.lineTo(W, GY - 22); ctx.stroke();
    ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    for (var bx = 115; bx < W; bx += 230) ctx.fillText('RIFFAN TV · COPA CABEZONES PRO', bx, GY - 7);

    // Striped grass pitch + markings
    var stripeW = W / 10;
    for (var si = 0; si < 10; si++) {
      ctx.fillStyle = si % 2 === 0 ? '#15803d' : '#166534';
      ctx.fillRect(si * stripeW, GY, stripeW + 1, H - GY);
    }
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, GY, W, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(GW, GY + 1, W - GW * 2, 2.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(W / 2, GY + 16, 40, Math.PI, Math.PI * 2); ctx.stroke();

    // Caricature Players
    drawHeadPlayer(match.p1, '#7C3AED', '#22D3EE', '#FFFFFF', 1, match.ball.x, match.ball.y);
    drawHeadPlayer(match.p2, '#E11D48', '#FACC15', '#FDE047', -1, match.ball.x, match.ball.y);

    // Ball velocity trail
    for (var ti = 0; ti < trail.length; ti++) {
      ctx.globalAlpha = (ti / trail.length) * 0.24;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(trail[ti].x, trail[ti].y, BR * (0.4 + 0.5 * (ti / trail.length)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ball ground shadow + spinning geodesic ball
    var groundRatio = Math.max(0.25, 1 - (GY - BR - match.ball.y) / 280);
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath(); ctx.ellipse(match.ball.x, GY + 2, BR * 1.15 * groundRatio, 5 * groundRatio, 0, 0, Math.PI * 2); ctx.fill();

    if (!(typeof window.drawTvSprite === 'function' && window.drawTvSprite(ctx, 'assets/games/sports/ball_soccer1.png', match.ball.x, match.ball.y, BR * 2.15, BR * 2.15, match.ball.angle))) {
      ctx.save();
      ctx.translate(match.ball.x, match.ball.y);
      ctx.rotate(match.ball.angle);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(0, 0, BR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, match.ball.x, match.ball.y, BR, W * 0.5, 24, 0.7);
    if (Math.hypot(match.ball.vx, match.ball.vy) > 520 && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, match.ball.x, match.ball.y, BR * 2.3, '56,189,248', 0.42);

    // 3D Goals drawn AFTER ball so net frames over goal mouth cleanly
    drawSingleGoal('left', netRippleL, tSec);
    drawSingleGoal('right', netRippleR, tSec);

    // Confetti burst (Kenney Particle Pack stars + ribbons)
    for (var cfi = 0; cfi < confetti.length; cfi++) {
      var c = confetti[cfi];
      ctx.globalAlpha = Math.max(0, Math.min(1, c.life));
      if (cfi % 3 === 0 && typeof window.drawTvSprite === 'function') {
        window.drawTvSprite(ctx, 'assets/games/particles/star_07.png', c.x, c.y, 18, 18, c.life * 5);
      } else {
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x, c.y, c.size, c.size * 1.4);
      }
    }
    ctx.globalAlpha = 1;

    if (match.banner) {
      ctx.fillStyle = 'rgba(6, 9, 20, 0.72)';
      ctx.fillRect(W / 2 - 220, 74, 440, 66);
      ctx.strokeStyle = match.bannerColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(W / 2 - 220, 74, 440, 66);
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = match.bannerColor;
      ctx.fillText(match.banner, W / 2, 118);
    }
  }

  function drawSingleGoal(side, ripple, tSec) {
    var xStart = side === 'left' ? 8 : W - GW;
    var w = GW - 8;
    var postX = side === 'left' ? GW : W - GW;
    var topY = GY - GH;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
    ctx.fillRect(xStart, topY, w, GH);

    ctx.strokeStyle = 'rgba(241, 245, 249, 0.36)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var gx = xStart; gx <= xStart + w; gx += 12) {
      var rx = ripple > 0 ? Math.sin(tSec * 28 + gx * 0.2) * ripple * 8 : 0;
      ctx.moveTo(gx, topY);
      ctx.quadraticCurveTo(gx + rx, topY + GH * 0.5, gx, GY);
    }
    for (var gy = topY; gy <= GY; gy += 12) {
      var ry = ripple > 0 ? Math.cos(tSec * 24 + gy * 0.2) * ripple * 6 : 0;
      ctx.moveTo(xStart, gy);
      ctx.quadraticCurveTo(xStart + w * 0.5, gy + ry, xStart + w, gy);
    }
    ctx.stroke();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(postX, topY);
    ctx.lineTo(side === 'left' ? 10 : W - 10, topY + 14);
    ctx.lineTo(side === 'left' ? 10 : W - 10, GY);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side === 'left' ? 10 : W - 10, topY);
    ctx.lineTo(postX, topY);
    ctx.lineTo(postX, GY);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.arc(postX, topY, POST_R, 0, Math.PI * 2); ctx.fill();
  }

  function drawHeadPlayer(p, jersey, trim, headband, dir, ballX, ballY) {
    // Ground shadow
    var gRatio = Math.max(0.3, 1 - (GY - PR - p.y) / 220);
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath(); ctx.ellipse(p.x, GY + 3, 24 * gRatio, 6 * gRatio, 0, 0, Math.PI * 2); ctx.fill();

    // Articulated Boot
    var swing = p.kickT > 0 ? Math.sin((1 - p.kickT / 0.22) * Math.PI) : 0;
    var bootX = p.x + dir * (11 + swing * 24);
    var bootY = p.y + PR - 4 - swing * 12;
    ctx.save();
    ctx.translate(bootX, bootY);
    ctx.rotate(dir * swing * -0.55);
    ctx.fillStyle = trim;
    ctx.fillRect(-10, -5, 22, 11);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-10, 4, 22, 3);
    ctx.restore();

    // Compact Jersey Torso
    ctx.fillStyle = jersey;
    ctx.fillRect(p.x - 12, p.y + 13, 24, 15);
    ctx.fillStyle = trim;
    ctx.fillRect(p.x - 12, p.y + 24, 24, 4);

    // Caricature Big Head
    var hGrad = ctx.createRadialGradient(p.x - dir * 6, p.y - 8, 4, p.x, p.y, PR);
    hGrad.addColorStop(0, jersey);
    hGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = hGrad;
    ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.stroke();

    // Headband
    ctx.fillStyle = headband;
    ctx.fillRect(p.x - PR + 2, p.y - 13, (PR - 2) * 2, 7);

    // Expressive Eye tracking ball
    var ex = p.x + dir * 11;
    var ey = p.y - 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(ex, ey, 6.2, 0, Math.PI * 2); ctx.fill();
    var lookA = Math.atan2(ballY - ey, ballX - ex);
    ctx.fillStyle = '#09090B';
    ctx.beginPath(); ctx.arc(ex + Math.cos(lookA) * 2.2, ey + Math.sin(lookA) * 2.2, 3, 0, Math.PI * 2); ctx.fill();
  }

  resetHsMatch();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startHeadSoccerGame = startHeadSoccerGame;
