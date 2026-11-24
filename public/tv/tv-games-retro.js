// ===================================================================
// SMART TV RETRO PACK: ARKANOID, SPACE INVADERS & HEXGL 3D (STRICT ES5)
// ===================================================================
(function () {
  var BRICK_SPRITES = [
    'assets/games/puzzle/element_red_rectangle_glossy.png',
    'assets/games/puzzle/element_yellow_rectangle_glossy.png',
    'assets/games/puzzle/element_green_rectangle_glossy.png',
    'assets/games/puzzle/element_blue_rectangle_glossy.png',
    'assets/games/puzzle/element_purple_rectangle_glossy.png',
    'assets/games/puzzle/element_grey_rectangle_glossy.png'
  ];
  var EXPL_SPRITES = [
    'assets/games/explosion/groundExplosion00.png', 'assets/games/explosion/groundExplosion01.png',
    'assets/games/explosion/groundExplosion02.png', 'assets/games/explosion/groundExplosion03.png',
    'assets/games/explosion/groundExplosion04.png', 'assets/games/explosion/groundExplosion05.png',
    'assets/games/explosion/groundExplosion06.png', 'assets/games/explosion/groundExplosion07.png',
    'assets/games/explosion/groundExplosion08.png'
  ];
  var hex3dHandle = null;
  window.closeTvRetroGame = function () {
    if (hex3dHandle && hex3dHandle.dispose) {
      try { hex3dHandle.dispose(); } catch (e0) {}
    }
    hex3dHandle = null;
  };
  function preloadAll(arr) {
    if (typeof window.preloadTvGameSprites === 'function') window.preloadTvGameSprites(arr);
  }
  function spr(ctx, path, cx, cy, w, h, rot) {
    return typeof window.drawTvSprite === 'function' && window.drawTvSprite(ctx, path, cx, cy, w, h, rot);
  }
  function sprRect(ctx, path, x, y, w, h) {
    return typeof window.drawTvSpriteRect === 'function' && window.drawTvSpriteRect(ctx, path, x, y, w, h);
  }
  function tiledBg(ctx, path, w, h, sx, sy) {
    return typeof window.drawTvTiledBg === 'function' && window.drawTvTiledBg(ctx, path, w, h, sx, sy);
  }
  function stepBooms(ctx, booms, dt) {
    for (var i = booms.length - 1; i >= 0; i--) {
      booms[i].t += dt * 22;
      var idx = Math.floor(booms[i].t);
      if (idx >= EXPL_SPRITES.length) { booms.splice(i, 1); continue; }
      spr(ctx, EXPL_SPRITES[idx], booms[i].x, booms[i].y, booms[i].s * 1.4, booms[i].s * 0.72, 0);
    }
  }
  function playSfx(freq, dur, kind, g) {
    if (typeof window.playTvGameBeep === 'function') window.playTvGameBeep(freq, dur, kind, g);
  }
  function loadBest(key) {
    try { return Number(localStorage.getItem(key) || '0') || 0; } catch (e) { return 0; }
  }
  function saveBest(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  function mountShell(scr, prefix, title, best, hintL, hintR) {
    scr.innerHTML =
      '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
      '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
      '<div class="tv-game-top-title">' + title + '</div></div><div class="tv-game-top-right">' +
      '<div class="tv-game-hud-pill accent-purple" id="' + prefix + '-score">PUNTOS: 0</div>' +
      '<div class="tv-game-hud-pill accent-green" id="' + prefix + '-sub">VIDAS: 3</div>' +
      '<div class="tv-game-hud-pill" id="' + prefix + '-best">Récord: ' + best + '</div>' +
      '<button type="button" id="' + prefix + '-qr" class="tv-btn" tabindex="0">📱 QR Gyro</button></div></div>' +
      '<div class="tv-game-arena" id="' + prefix + '-arena">' +
      '<canvas id="' + prefix + '-canvas" class="tv-game-canvas" width="960" height="540"></canvas>' +
      '<div class="tv-game-finish-overlay" id="' + prefix + '-ov"><div class="tv-game-finish-card">' +
      '<div class="tv-game-finish-title" id="' + prefix + '-fin-title">FIN</div>' +
      '<div class="tv-game-finish-sub" id="' + prefix + '-fin-sub">0 puntos</div>' +
      '<div class="tv-game-finish-btns">' +
      '<button type="button" id="' + prefix + '-replay" class="tv-btn-primary" tabindex="0">Jugar de nuevo (OK)</button>' +
      '<button type="button" id="' + prefix + '-exit" class="tv-btn" tabindex="0">Salir</button>' +
      '</div></div></div></div>' +
      '<div class="tv-game-controls-hint"><span>' + hintL + '</span><span>' + hintR + '</span></div>';

    document.getElementById('btn-game-back').onclick = window.closeTvGame;
    document.getElementById(prefix + '-exit').onclick = window.closeTvGame;
  }

  // =================================================================
  // 1. ARKANOID NEON TV (BRICKIT)
  // =================================================================
  function startArkanoidGame(scr) {
    preloadAll(BRICK_SPRITES.concat(EXPL_SPRITES).concat([
      'assets/games/puzzle/paddleBlu.png', 'assets/games/puzzle/paddleRed.png', 'assets/games/puzzle/ballBlue.png',
      'assets/games/space/pill_blue.png', 'assets/games/space/pill_green.png', 'assets/games/space/pill_red.png',
      'assets/games/space/laserRed01.png', 'assets/games/space/blue.png'
    ]));
    var BEST_KEY = 'naim_tv_arkanoid_best_v1', best = loadBest(BEST_KEY);
    mountShell(scr, 'ark', '🧱 BrickIt / Arkanoid Neon', best,
      '◀ ▶ o Ratón/Puntero LG para mover pala', 'OK / ▲: Disparar láser (con mejora)');

    var canvas = document.getElementById('ark-canvas'), ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('ark-score'), subEl = document.getElementById('ark-sub');
    var bestEl = document.getElementById('ark-best'), ov = document.getElementById('ark-ov');
    var finTitle = document.getElementById('ark-fin-title'), finSub = document.getElementById('ark-fin-sub');
    var gyro = typeof window.connectTvGyroBridge === 'function'
      ? window.connectTvGyroBridge('arkanoid', { arenaEl: document.getElementById('ark-arena'), btnEl: document.getElementById('ark-qr'), title: '🧱 Arkanoid · QR Móvil Gyro' })
      : null;

    var BRICK_COLS = ['#F43F5E', '#FACC15', '#22C55E', '#38BDF8', '#A855F7', '#94A3B8'];
    var padX = 480, padW = 132, laserTimer = 0, laserCd = 0, moveDir = 0;
    var balls = [], bricks = [], capsules = [], lasers = [], booms = [];
    var score = 0, lives = 3, level = 1, gameOver = false;

    function buildLevel(lv) {
      bricks = [];
      var rows = Math.min(7, 4 + lv);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < 11; c++) {
          if (lv % 2 === 0 && (r + c) % 4 === 0) continue;
          var sIdx = r === 0 && lv >= 2 ? 5 : r % 5;
          bricks.push({ x: 78 + c * 74, y: 58 + r * 28, w: 68, h: 24, hp: r === 0 && lv >= 2 ? 2 : 1, col: BRICK_COLS[sIdx], sIdx: sIdx });
        }
      }
      balls = [{ x: padX, y: 472, vx: 220 * (Math.random() < 0.5 ? 1 : -1), vy: -320 }];
      capsules = []; lasers = [];
    }
    function syncHud() {
      scoreEl.textContent = 'PUNTOS: ' + score;
      subEl.textContent = 'VIDAS: ' + lives + ' · NV ' + level;
      if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
    }
    function resetGame() {
      score = 0; lives = 3; level = 1; padW = 132; laserTimer = 0; gameOver = false; booms = [];
      ov.style.display = 'none'; buildLevel(1); syncHud();
    }
    canvas.onmousemove = function (e) {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      padX = Math.max(padW / 2 + 12, Math.min(948 - padW / 2, ((e.clientX - rect.left) / rect.width) * 960));
    };
    document.getElementById('ark-replay').onclick = resetGame;
    window.tvGameKeyHandler = function (e, code) {
      if (gameOver) {
        if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetGame(); return true; }
        return false;
      }
      if (code === 37 || code === 21) { moveDir = -1; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { moveDir = 1; if (e.preventDefault) e.preventDefault(); return true; }
      if ((code === 13 || code === 23 || code === 66 || code === 32 || code === 38 || code === 19) && laserTimer > 0) {
        lasers.push({ x: padX - padW / 2 + 12, y: 482 }); lasers.push({ x: padX + padW / 2 - 12, y: 482 });
        playSfx(860, 0.04, 'square', 0.04); if (e.preventDefault) e.preventDefault(); return true;
      }
      return false;
    };
    window.tvGameKeyUpHandler = function (e, code) {
      if ((code === 37 || code === 21) && moveDir < 0) moveDir = 0;
      if ((code === 39 || code === 22) && moveDir > 0) moveDir = 0;
      return false;
    };

    var last = performance.now();
    function frame(now) {
      if (window.TV_GAME_ACTIVE !== 'arkanoid') return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!gameOver) {
        if (laserCd > 0) laserCd -= dt;
        if (gyro && gyro.isActive()) {
          var gp = gyro.getPad();
          var gTarget = Math.max(padW / 2 + 12, Math.min(948 - padW / 2, 480 + gp.steer * 440));
          padX += (gTarget - padX) * Math.min(1, dt * 16);
          if (laserTimer > 0 && (gp.nitro || gp.throttle > 0.4) && laserCd <= 0) {
            lasers.push({ x: padX - padW / 2 + 12, y: 482 }); lasers.push({ x: padX + padW / 2 - 12, y: 482 });
            laserCd = 0.24; playSfx(860, 0.04, 'square', 0.04);
          }
        } else {
          padX = Math.max(padW / 2 + 12, Math.min(948 - padW / 2, padX + moveDir * 560 * dt));
        }
        if (laserTimer > 0) laserTimer = Math.max(0, laserTimer - dt);
        for (var li = lasers.length - 1; li >= 0; li--) {
          lasers[li].y -= 620 * dt;
          if (lasers[li].y < 0) { lasers.splice(li, 1); continue; }
          for (var bi = bricks.length - 1; bi >= 0; bi--) {
            var br = bricks[bi];
            if (lasers[li].x >= br.x && lasers[li].x <= br.x + br.w && lasers[li].y <= br.y + br.h && lasers[li].y >= br.y) {
              br.hp--; score += 30;
              if (br.hp <= 0) { booms.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, s: 46, t: 0 }); bricks.splice(bi, 1); }
              lasers.splice(li, 1); syncHud(); break;
            }
          }
        }
        for (var ci = capsules.length - 1; ci >= 0; ci--) {
          var cap = capsules[ci]; cap.y += 170 * dt;
          if (cap.y >= 486 && cap.y <= 512 && Math.abs(cap.x - padX) < padW / 2 + 14) {
            if (cap.kind === 'W') padW = Math.min(208, padW + 46);
            else if (cap.kind === 'M' && balls.length < 4) {
              var b0 = balls[0] || { x: padX, y: 470, vx: 180, vy: -320 };
              balls.push({ x: b0.x, y: b0.y, vx: -b0.vx, vy: b0.vy }); balls.push({ x: b0.x, y: b0.y, vx: b0.vx * 0.6, vy: -Math.abs(b0.vy) });
            } else if (cap.kind === 'L') laserTimer = 10;
            playSfx(740, 0.1, 'triangle', 0.08); capsules.splice(ci, 1);
          } else if (cap.y > 540) capsules.splice(ci, 1);
        }
        for (var k = balls.length - 1; k >= 0; k--) {
          var bl = balls[k]; bl.x += bl.vx * dt; bl.y += bl.vy * dt;
          if (bl.x < 12) { bl.x = 12; bl.vx = Math.abs(bl.vx); playSfx(320, 0.03, 'sine', 0.04); }
          if (bl.x > 948) { bl.x = 948; bl.vx = -Math.abs(bl.vx); playSfx(320, 0.03, 'sine', 0.04); }
          if (bl.y < 14) { bl.y = 14; bl.vy = Math.abs(bl.vy); playSfx(320, 0.03, 'sine', 0.04); }
          if (bl.vy > 0 && bl.y >= 484 && bl.y <= 504 && Math.abs(bl.x - padX) <= padW / 2 + 8) {
            var hit = (bl.x - padX) / (padW / 2), spd = Math.min(540, Math.hypot(bl.vx, bl.vy) * 1.015);
            bl.vx = hit * spd * 0.85; bl.vy = -Math.sqrt(Math.max(14000, spd * spd - bl.vx * bl.vx)); bl.y = 483;
            playSfx(440, 0.05, 'triangle', 0.06);
          }
          for (var j = bricks.length - 1; j >= 0; j--) {
            var bk = bricks[j];
            if (bl.x + 8 >= bk.x && bl.x - 8 <= bk.x + bk.w && bl.y + 8 >= bk.y && bl.y - 8 <= bk.y + bk.h) {
              bl.vy = -bl.vy; bk.hp--; score += 50;
              if (bk.hp <= 0) {
                booms.push({ x: bk.x + bk.w / 2, y: bk.y + bk.h / 2, s: 46, t: 0 });
                bricks.splice(j, 1);
                if (Math.random() < 0.22) capsules.push({ x: bk.x + bk.w / 2, y: bk.y + 10, kind: ['W', 'M', 'L'][Math.floor(Math.random() * 3)] });
              }
              syncHud(); playSfx(580, 0.05, 'square', 0.05); break;
            }
          }
          if (bl.y > 550) balls.splice(k, 1);
        }
        if (balls.length === 0) {
          lives--; padW = 132; laserTimer = 0; syncHud(); playSfx(140, 0.2, 'sawtooth', 0.09);
          if (lives <= 0) {
            gameOver = true; finTitle.textContent = '🧱 ¡FIN DE PARTIDA!'; finSub.textContent = 'Puntos: ' + score + ' · Nivel ' + level;
            ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
            var btn = document.getElementById('ark-replay'); if (btn && btn.focus) btn.focus();
          } else balls = [{ x: padX, y: 470, vx: 210, vy: -320 }];
        } else if (bricks.length === 0) {
          level++; score += 500; syncHud(); playSfx(880, 0.22, 'triangle', 0.1); buildLevel(level);
        }
      }
      ctx.fillStyle = '#060914'; ctx.fillRect(0, 0, 960, 540);
      ctx.save(); ctx.globalAlpha = 0.25; tiledBg(ctx, 'assets/games/space/blue.png', 960, 540, 0, now * 0.015); ctx.restore();
      for (var bi2 = 0; bi2 < bricks.length; bi2++) {
        var b2 = bricks[bi2];
        if (!sprRect(ctx, BRICK_SPRITES[b2.sIdx] || BRICK_SPRITES[0], b2.x, b2.y, b2.w, b2.h)) {
          ctx.fillStyle = b2.col; ctx.fillRect(b2.x, b2.y, b2.w, b2.h);
        }
        if (b2.hp > 1) { ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2; ctx.strokeRect(b2.x + 2, b2.y + 2, b2.w - 4, b2.h - 4); }
      }
      for (var ci2 = 0; ci2 < capsules.length; ci2++) {
        var cp = capsules[ci2], pUrl = cp.kind === 'M' ? 'assets/games/space/pill_green.png' : cp.kind === 'L' ? 'assets/games/space/pill_red.png' : 'assets/games/space/pill_blue.png';
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, cp.x, cp.y, 26, '56,189,248', 0.4);
        if (!spr(ctx, pUrl, cp.x, cp.y, 28, 22, 0)) {
          ctx.fillStyle = cp.kind === 'M' ? '#22C55E' : cp.kind === 'L' ? '#F43F5E' : '#38BDF8';
          ctx.fillRect(cp.x - 16, cp.y - 9, 32, 18);
        }
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(cp.kind, cp.x, cp.y + 4);
      }
      for (var li2 = 0; li2 < lasers.length; li2++) {
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, lasers[li2].x, lasers[li2].y, 20, '244,63,94', 0.46);
        if (!spr(ctx, 'assets/games/space/laserRed01.png', lasers[li2].x, lasers[li2].y, 8, 24, 0)) {
          ctx.fillStyle = '#F43F5E'; ctx.fillRect(lasers[li2].x - 2, lasers[li2].y - 12, 4, 16);
        }
      }
      var pSpr = laserTimer > 0 ? 'assets/games/puzzle/paddleRed.png' : 'assets/games/puzzle/paddleBlu.png';
      if (!sprRect(ctx, pSpr, padX - padW / 2, 486, padW, 22)) {
        ctx.fillStyle = laserTimer > 0 ? '#F43F5E' : '#7C3AED'; ctx.fillRect(padX - padW / 2, 490, padW, 16);
      }
      for (var k2 = 0; k2 < balls.length; k2++) {
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, balls[k2].x, balls[k2].y, 22, '250,204,21', 0.42);
        if (!spr(ctx, 'assets/games/puzzle/ballBlue.png', balls[k2].x, balls[k2].y, 18, 18, 0)) {
          ctx.fillStyle = '#FDE047'; ctx.beginPath(); ctx.arc(balls[k2].x, balls[k2].y, 8, 0, Math.PI * 2); ctx.fill();
        }
      }
      stepBooms(ctx, booms, dt);
      if (typeof window.drawTvCrtOverlay === 'function') window.drawTvCrtOverlay(ctx, 960, 540, 0.16);
      window.TV_GAME_RAF = requestAnimationFrame(frame);
    }
    resetGame();
    window.TV_GAME_RAF = requestAnimationFrame(frame);
  }
  window.startArkanoidGame = startArkanoidGame;

  // =================================================================
  // 2. SPACE INVADERS RETRO TV
  // =================================================================
  function startInvadersGame(scr) {
    preloadAll(EXPL_SPRITES.concat([
      'assets/games/space/darkPurple.png', 'assets/games/space/playerShip1_blue.png',
      'assets/games/space/enemyRed3.png', 'assets/games/space/enemyGreen2.png', 'assets/games/space/enemyBlue1.png',
      'assets/games/space/ufoRed.png', 'assets/games/space/laserBlue01.png', 'assets/games/space/laserRed01.png',
      'assets/games/space/fire00.png'
    ]));
    var BEST_KEY = 'naim_tv_invaders_best_v1', best = loadBest(BEST_KEY);
    mountShell(scr, 'inv', '👾 Space Invaders Retro', best,
      '◀ ▶ Mover cañón láser · Escudos destructibles', 'OK / ▲ / Espacio: Disparar');

    var canvas = document.getElementById('inv-canvas'), ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('inv-score'), subEl = document.getElementById('inv-sub');
    var bestEl = document.getElementById('inv-best'), ov = document.getElementById('inv-ov');
    var finTitle = document.getElementById('inv-fin-title'), finSub = document.getElementById('inv-fin-sub');
    var gyro = typeof window.connectTvGyroBridge === 'function'
      ? window.connectTvGyroBridge('invaders', { arenaEl: document.getElementById('inv-arena'), btnEl: document.getElementById('inv-qr'), title: '👾 Space Invaders · QR Móvil Gyro' })
      : null;

    var px = 480, moveDir = 0, pBullets = [], aBullets = [], aliens = [], bunkers = [], booms = [];
    var ufo = { active: false, x: 0, vx: 180, timer: 9 };
    var aDir = 1, aStepCd = 0, shootCd = 0, wave = 1, score = 0, lives = 3, gameOver = false;

    function buildWave() {
      aliens = [];
      var cols = ['#F43F5E', '#A855F7', '#A855F7', '#22D3EE', '#22D3EE'], pts = [30, 20, 20, 10, 10];
      for (var r = 0; r < 5; r++) for (var c = 0; c < 11; c++) {
        aliens.push({ x: 150 + c * 58, y: 74 + r * 42, alive: true, col: cols[r], pts: pts[r], row: r });
      }
      bunkers = [];
      for (var b = 0; b < 4; b++) {
        var bx0 = 155 + b * 200;
        for (var br = 0; br < 4; br++) for (var bc = 0; bc < 6; bc++) bunkers.push({ x: bx0 + bc * 12, y: 400 + br * 10, alive: true });
      }
      aDir = 1; pBullets = []; aBullets = [];
    }
    function syncHud() {
      scoreEl.textContent = 'PUNTOS: ' + score;
      subEl.textContent = 'VIDAS: ' + lives + ' · OLEADA ' + wave;
      if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
    }
    function resetGame() {
      score = 0; lives = 3; wave = 1; px = 480; gameOver = false; booms = [];
      ufo = { active: false, x: 0, vx: 180, timer: 8 }; ov.style.display = 'none'; buildWave(); syncHud();
    }
    function fireLaser() {
      if (gameOver || shootCd > 0) return;
      pBullets.push({ x: px, y: 472 }); shootCd = 0.24; playSfx(680, 0.05, 'square', 0.04);
    }
    document.getElementById('inv-replay').onclick = resetGame;
    window.tvGameKeyHandler = function (e, code) {
      if (gameOver) {
        if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetGame(); return true; }
        return false;
      }
      if (code === 37 || code === 21) { moveDir = -1; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { moveDir = 1; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 13 || code === 23 || code === 66 || code === 32 || code === 38 || code === 19) { fireLaser(); if (e.preventDefault) e.preventDefault(); return true; }
      return false;
    };
    window.tvGameKeyUpHandler = function (e, code) {
      if ((code === 37 || code === 21) && moveDir < 0) moveDir = 0;
      if ((code === 39 || code === 22) && moveDir > 0) moveDir = 0;
      return false;
    };

    var last = performance.now();
    function frame(now) {
      if (window.TV_GAME_ACTIVE !== 'invaders') return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (shootCd > 0) shootCd -= dt;
      if (!gameOver) {
        var invDir = moveDir;
        if (gyro && gyro.isActive()) {
          var gp2 = gyro.getPad();
          invDir = Math.abs(gp2.steer) > 0.05 ? gp2.steer * 1.15 : moveDir;
          if (gp2.nitro || gp2.throttle > 0.35 || gp2.swing > 1.0) fireLaser();
        }
        px = Math.max(46, Math.min(914, px + invDir * 440 * dt));
        if (!ufo.active) {
          ufo.timer -= dt;
          if (ufo.timer <= 0) { ufo.active = true; ufo.x = Math.random() < 0.5 ? -40 : 1000; ufo.vx = ufo.x < 0 ? 190 : -190; }
        } else {
          ufo.x += ufo.vx * dt;
          if (ufo.x < -80 || ufo.x > 1040) { ufo.active = false; ufo.timer = 11; }
        }
        for (var i = pBullets.length - 1; i >= 0; i--) {
          var pb = pBullets[i]; pb.y -= 580 * dt;
          if (pb.y < 0) { pBullets.splice(i, 1); continue; }
          if (ufo.active && Math.abs(pb.x - ufo.x) < 28 && pb.y < 54) {
            booms.push({ x: ufo.x, y: 34, s: 72, t: 0 });
            ufo.active = false; ufo.timer = 12; score += 150; syncHud();
            pBullets.splice(i, 1); playSfx(880, 0.14, 'triangle', 0.08); continue;
          }
          var hitSomething = false;
          for (var bk = 0; bk < bunkers.length; bk++) {
            if (bunkers[bk].alive && pb.x >= bunkers[bk].x && pb.x <= bunkers[bk].x + 12 && pb.y >= bunkers[bk].y && pb.y <= bunkers[bk].y + 10) {
              bunkers[bk].alive = false; hitSomething = true; break;
            }
          }
          if (!hitSomething) {
            for (var ai = 0; ai < aliens.length; ai++) {
              var al = aliens[ai];
              if (al.alive && Math.abs(pb.x - al.x) < 20 && Math.abs(pb.y - al.y) < 16) {
                al.alive = false; score += al.pts; syncHud();
                booms.push({ x: al.x, y: al.y, s: 44, t: 0 });
                playSfx(320, 0.05, 'sawtooth', 0.05); hitSomething = true; break;
              }
            }
          }
          if (hitSomething) pBullets.splice(i, 1);
        }
        var aliveAliens = [];
        for (var z = 0; z < aliens.length; z++) if (aliens[z].alive) aliveAliens.push(aliens[z]);
        if (aliveAliens.length === 0) {
          wave++; score += 300; syncHud(); buildWave(); playSfx(780, 0.2, 'triangle', 0.09);
        } else {
          aStepCd -= dt;
          if (aStepCd <= 0) {
            aStepCd = Math.max(0.08, 0.55 * (aliveAliens.length / 55) - (wave - 1) * 0.03);
            var hitEdge = false;
            for (var u = 0; u < aliveAliens.length; u++) {
              var nx = aliveAliens[u].x + aDir * 14;
              if (nx < 46 || nx > 914) { hitEdge = true; break; }
            }
            if (hitEdge) {
              aDir = -aDir;
              for (var v = 0; v < aliveAliens.length; v++) {
                aliveAliens[v].y += 20;
                if (aliveAliens[v].y >= 460) {
                  gameOver = true; finTitle.textContent = '👾 ¡INVASIÓN COMPLETADA!'; finSub.textContent = 'Puntuación final: ' + score;
                  ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
                  var rbtn = document.getElementById('inv-replay'); if (rbtn && rbtn.focus) rbtn.focus();
                }
              }
            } else {
              for (var w = 0; w < aliveAliens.length; w++) aliveAliens[w].x += aDir * 14;
            }
            if (Math.random() < 0.42 && aBullets.length < 4 + wave) {
              var shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
              aBullets.push({ x: shooter.x, y: shooter.y + 14 });
            }
          }
        }
        for (var j = aBullets.length - 1; j >= 0; j--) {
          var ab = aBullets[j]; ab.y += 280 * dt;
          if (ab.y > 530) { aBullets.splice(j, 1); continue; }
          var bHit = false;
          for (var bi2 = 0; bi2 < bunkers.length; bi2++) {
            if (bunkers[bi2].alive && ab.x >= bunkers[bi2].x && ab.x <= bunkers[bi2].x + 12 && ab.y >= bunkers[bi2].y && ab.y <= bunkers[bi2].y + 10) {
              bunkers[bi2].alive = false; bHit = true; break;
            }
          }
          if (bHit) { aBullets.splice(j, 1); continue; }
          if (Math.abs(ab.x - px) < 24 && Math.abs(ab.y - 492) < 16) {
            aBullets.splice(j, 1); lives--; syncHud(); booms.push({ x: px, y: 490, s: 68, t: 0 });
            playSfx(120, 0.22, 'sawtooth', 0.1);
            if (lives <= 0) {
              gameOver = true; finTitle.textContent = '💥 ¡NAVE DESTRUIDA!'; finSub.textContent = 'Puntuación final: ' + score + ' · Oleada ' + wave;
              ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
              var btn = document.getElementById('inv-replay'); if (btn && btn.focus) btn.focus();
            }
          }
        }
      }
      ctx.fillStyle = '#04060d'; ctx.fillRect(0, 0, 960, 540);
      tiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 540, 0, now * 0.025);
      if (typeof window.drawTvNebulaLayer === 'function') window.drawTvNebulaLayer(ctx, 960, 540, now * 0.001, 'space');
      if (ufo.active && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, ufo.x, 34, 42, '244,63,94', 0.45);
      if (ufo.active && !spr(ctx, 'assets/games/space/ufoRed.png', ufo.x, 34, 46, 46, Math.sin(now * 0.005) * 0.15)) {
        ctx.fillStyle = '#EF4444'; ctx.fillRect(ufo.x - 24, 24, 48, 16);
      }
      var bob = Math.sin(now * 0.006) * 2.5;
      for (var ai2 = 0; ai2 < aliens.length; ai2++) {
        var al2 = aliens[ai2]; if (!al2.alive) continue;
        var aSpr = al2.row === 0 ? 'assets/games/space/enemyRed3.png' : al2.row <= 2 ? 'assets/games/space/enemyGreen2.png' : 'assets/games/space/enemyBlue1.png';
        if (!spr(ctx, aSpr, al2.x, al2.y + (al2.row % 2 ? bob : -bob), 34, 28, 0)) {
          ctx.fillStyle = al2.col; ctx.fillRect(al2.x - 15, al2.y - 10, 30, 18);
        }
      }
      ctx.fillStyle = '#22C55E';
      for (var bk2 = 0; bk2 < bunkers.length; bk2++) if (bunkers[bk2].alive) ctx.fillRect(bunkers[bk2].x, bunkers[bk2].y, 11, 9);
      spr(ctx, 'assets/games/space/fire00.png', px, 514, 12, 18 + Math.random() * 6, 0);
      if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, px, 496, 36, '56,189,248', 0.36);
      if (!spr(ctx, 'assets/games/space/playerShip1_blue.png', px, 492, 52, 40, 0)) {
        ctx.fillStyle = '#38BDF8'; ctx.fillRect(px - 24, 488, 48, 16);
      }
      for (var pbi = 0; pbi < pBullets.length; pbi++) {
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, pBullets[pbi].x, pBullets[pbi].y, 18, '56,189,248', 0.45);
        if (!spr(ctx, 'assets/games/space/laserBlue01.png', pBullets[pbi].x, pBullets[pbi].y, 7, 22, 0)) {
          ctx.fillStyle = '#FACC15'; ctx.fillRect(pBullets[pbi].x - 2, pBullets[pbi].y - 10, 4, 14);
        }
      }
      for (var abi = 0; abi < aBullets.length; abi++) {
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, aBullets[abi].x, aBullets[abi].y, 18, '251,113,133', 0.45);
        if (!spr(ctx, 'assets/games/space/laserRed01.png', aBullets[abi].x, aBullets[abi].y, 7, 22, 0)) {
          ctx.fillStyle = '#FB7185'; ctx.fillRect(aBullets[abi].x - 2, aBullets[abi].y, 5, 13);
        }
      }
      stepBooms(ctx, booms, dt);
      if (typeof window.drawTvCrtOverlay === 'function') window.drawTvCrtOverlay(ctx, 960, 540, 0.16);
      window.TV_GAME_RAF = requestAnimationFrame(frame);
    }
    resetGame();
    window.TV_GAME_RAF = requestAnimationFrame(frame);
  }
  window.startInvadersGame = startInvadersGame;

  // =================================================================
  // 3. HEXGL HOVER 3D TUNNEL RACER
  // =================================================================
  function startHexGlGame(scr) {
    preloadAll(EXPL_SPRITES.concat([
      'assets/games/space/darkPurple.png', 'assets/games/space/playerShip3_red.png',
      'assets/games/space/fire00.png', 'assets/games/space/fire01.png',
      'assets/games/space/meteorGrey_big1.png', 'assets/games/space/powerupBlue_bolt.png', 'assets/games/space/powerupBlue_shield.png'
    ]));
    var BEST_KEY = 'naim_tv_hexgl_best_v1', best = loadBest(BEST_KEY);
    mountShell(scr, 'hgl', '🚀 HexGL Hover 3D', best,
      '◀ ▶ Esquivar barreras · Busca los impulsos cyan', 'OK / ▲: Hiper-Turbo · ▼: Freno estabilizador');

    var canvas = document.getElementById('hgl-canvas'), ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('hgl-score'), subEl = document.getElementById('hgl-sub');
    var bestEl = document.getElementById('hgl-best'), ov = document.getElementById('hgl-ov');
    var finTitle = document.getElementById('hgl-fin-title'), finSub = document.getElementById('hgl-fin-sub');
    var gyro = typeof window.connectTvGyroBridge === 'function'
      ? window.connectTvGyroBridge('hexgl', { arenaEl: document.getElementById('hgl-arena'), btnEl: document.getElementById('hgl-qr'), title: '🚀 HexGL 3D · QR Móvil Gyro' })
      : null;

    var shipX = 0, steerDir = 0, speed = 520, boostOn = false, brakeOn = false;
    var shield = 100, dist = 0, trackZ = 0, entities = [], booms = [], gameOver = false;
    var bankVal = 0, hitFlash = 0, pickupSeq = 0, pickupEvent = null;
    if (window.RiffanTvGames && typeof window.RiffanTvGames.mountHexGl3D === 'function') {
      var hArena = document.getElementById('hgl-arena');
      var hStage = document.createElement('div');
      hStage.className = 'tv-3d-stage';
      if (hArena) hArena.insertBefore(hStage, hArena.firstChild);
      try {
        hex3dHandle = window.RiffanTvGames.mountHexGl3D(hStage, {
          getState: function () {
            return { shipX: shipX, bank: bankVal, speed: speed, boost: boostOn, shield: shield, trackZ: trackZ, hitFlash: hitFlash, pickupEvent: pickupEvent, dead: gameOver, entities: entities };
          },
          onPointerX: function (nx) { shipX = Math.max(-1.05, Math.min(1.05, (nx - 0.5) * 2.1)); }
        });
      } catch (eHex) { hex3dHandle = null; }
      if (hex3dHandle && canvas) canvas.style.display = 'none';
      else if (hStage.parentNode) hStage.parentNode.removeChild(hStage);
    }

    function resetGame() {
      shipX = 0; speed = 540; shield = 100; dist = 0; trackZ = 0; entities = []; booms = [];
      boostOn = false; brakeOn = false; gameOver = false; bankVal = 0; hitFlash = 0; ov.style.display = 'none';
      scoreEl.textContent = '0 m'; subEl.textContent = 'ESCUDO 100% · 540 KM/H';
    }
    document.getElementById('hgl-replay').onclick = resetGame;
    window.tvGameKeyHandler = function (e, code) {
      if (gameOver) {
        if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetGame(); return true; }
        return false;
      }
      if (code === 37 || code === 21) { steerDir = -1; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { steerDir = 1; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 38 || code === 19 || code === 13 || code === 23 || code === 66 || code === 32) { boostOn = true; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 40 || code === 20) { brakeOn = true; if (e.preventDefault) e.preventDefault(); return true; }
      return false;
    };
    window.tvGameKeyUpHandler = function (e, code) {
      if ((code === 37 || code === 21) && steerDir < 0) steerDir = 0;
      if ((code === 39 || code === 22) && steerDir > 0) steerDir = 0;
      if (code === 38 || code === 19 || code === 13 || code === 23 || code === 66 || code === 32) boostOn = false;
      if (code === 40 || code === 20) brakeOn = false;
      return false;
    };

    var spawnZ = 0, last = performance.now();
    function frame(now) {
      if (window.TV_GAME_ACTIVE !== 'hexgl') return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!gameOver) {
        var effSteer = steerDir, effBoost = boostOn, effBrake = brakeOn;
        if (gyro && gyro.isActive()) {
          var gp3 = gyro.getPad();
          if (Math.abs(gp3.steer) > 0.04) effSteer = gp3.steer;
          effBoost = boostOn || gp3.nitro || gp3.throttle > 0.45;
          effBrake = brakeOn || gp3.brake > 0.35;
        }
        var targetSpd = effBoost ? 980 : effBrake ? 380 : 640 + Math.min(260, dist * 0.04);
        speed += (targetSpd - speed) * Math.min(1, dt * 4);
        bankVal += (effSteer * 0.36 - bankVal) * Math.min(1, dt * 10);
        hitFlash = Math.max(0, hitFlash - dt * 2.5);
        shipX = Math.max(-1.05, Math.min(1.05, shipX + effSteer * dt * 1.95));
        var dz = speed * dt; trackZ += dz; dist += Math.round(dz * 0.14); spawnZ += dz;
        if (spawnZ > 240) {
          spawnZ = 0;
          var r = Math.random(), kind = r < 0.28 ? 'pad' : r < 0.42 ? 'heal' : 'wall';
          entities.push({ lane: (Math.random() - 0.5) * 1.65, z: 1000, kind: kind, hit: false });
        }
        for (var i = entities.length - 1; i >= 0; i--) {
          var ent = entities[i]; ent.z -= dz * 1.35;
          if (ent.z <= 85 && ent.z >= 10 && !ent.hit && Math.abs(ent.lane - shipX) < 0.34) {
            ent.hit = true;
            pickupSeq += 1; pickupEvent = { seq: pickupSeq, kind: ent.kind, x: shipX };
            if (ent.kind === 'pad') { speed = 1120; dist += 50; playSfx(820, 0.12, 'triangle', 0.08); }
            else if (ent.kind === 'heal') { shield = Math.min(100, shield + 25); playSfx(640, 0.12, 'sine', 0.08); }
            else {
              shield = Math.max(0, shield - 34); speed = 340; hitFlash = 1;
              booms.push({ x: 480 + shipX * 260, y: 448, s: 86, t: 0 });
              playSfx(120, 0.2, 'sawtooth', 0.1);
              if (shield <= 0) {
                gameOver = true; finTitle.textContent = '💥 ¡ESCUDO AGOTADO!';
                finSub.textContent = 'Distancia recorrida: ' + dist + ' m · Récord: ' + Math.max(best, dist) + ' m';
                ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
                var btn = document.getElementById('hgl-replay'); if (btn && btn.focus) btn.focus();
              }
            }
          }
          if (ent.z < -20) entities.splice(i, 1);
        }
        scoreEl.textContent = dist + ' m';
        subEl.textContent = 'ESCUDO ' + Math.round(shield) + '% · ' + Math.round(speed) + ' KM/H';
        if (dist > best) { best = dist; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best + ' m'; }
      }
      if (hex3dHandle) { window.TV_GAME_RAF = requestAnimationFrame(frame); return; }
      var sky = ctx.createLinearGradient(0, 0, 0, 260);
      sky.addColorStop(0, '#040212'); sky.addColorStop(1, '#26104E');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 260);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 960, 260); ctx.clip();
      tiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 260, -shipX * 60, now * 0.02);
      ctx.restore();

      ctx.fillStyle = '#070918'; ctx.fillRect(0, 260, 960, 280);
      var horizonX = 480 - shipX * 90;
      ctx.fillStyle = '#131632';
      ctx.beginPath(); ctx.moveTo(horizonX - 44, 260); ctx.lineTo(horizonX + 44, 260);
      ctx.lineTo(940, 540); ctx.lineTo(20, 540); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(horizonX - 44, 260); ctx.lineTo(20, 540);
      ctx.moveTo(horizonX + 44, 260); ctx.lineTo(940, 540); ctx.stroke();

      for (var g = 0; g < 12; g++) {
        var pz = ((g * 85 - (trackZ % 85) + 85) % 1020) / 1020;
        var pY = 260 + Math.pow(pz, 1.7) * 280, halfW = 44 + (pY - 260) * 1.48;
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.14 + pz * 0.4) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(horizonX - halfW, pY); ctx.lineTo(horizonX + halfW, pY); ctx.stroke();
      }
      entities.sort(function (a, b) { return b.z - a.z; });
      for (var ei = 0; ei < entities.length; ei++) {
        var e2 = entities[ei]; if (e2.z <= 0) continue;
        var frac = 1 - e2.z / 1000, ey = 260 + Math.pow(frac, 1.7) * 280, hw = 44 + (ey - 260) * 1.48;
        var ex = horizonX + e2.lane * hw * 0.78, sc = 0.18 + frac * 1.05;
        if (e2.kind === 'pad') {
          if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, ex, ey - 16 * sc, 28 * sc, '34,211,238', 0.48);
          if (!spr(ctx, 'assets/games/space/powerupBlue_bolt.png', ex, ey - 16 * sc, 34 * sc, 34 * sc, 0)) {
            ctx.fillStyle = '#22D3EE'; ctx.fillRect(ex - 28 * sc, ey - 8 * sc, 56 * sc, 12 * sc);
          }
        } else if (e2.kind === 'heal') {
          if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, ex, ey - 18 * sc, 28 * sc, '34,197,94', 0.45);
          if (!spr(ctx, 'assets/games/space/powerupBlue_shield.png', ex, ey - 18 * sc, 34 * sc, 34 * sc, 0)) {
            ctx.fillStyle = '#22C55E'; ctx.beginPath(); ctx.arc(ex, ey - 18 * sc, 16 * sc, 0, Math.PI * 2); ctx.fill();
          }
        } else if (!spr(ctx, 'assets/games/space/meteorGrey_big1.png', ex, ey - 24 * sc, 60 * sc, 50 * sc, now * 0.003)) {
          ctx.fillStyle = '#F43F5E'; ctx.fillRect(ex - 26 * sc, ey - 46 * sc, 52 * sc, 46 * sc);
        }
      }
      ctx.save(); ctx.translate(480 + shipX * 260, 468); ctx.rotate(steerDir * 0.24);
      var fSpr = boostOn ? 'assets/games/space/fire01.png' : 'assets/games/space/fire00.png';
      spr(ctx, fSpr, -14, 28, 12, boostOn ? 28 : 18, Math.PI);
      spr(ctx, fSpr, 14, 28, 12, boostOn ? 28 : 18, Math.PI);
      if (!spr(ctx, 'assets/games/space/playerShip3_red.png', 0, 0, 82, 62, 0)) {
        ctx.fillStyle = '#22D3EE'; ctx.beginPath();
        ctx.moveTo(0, -34); ctx.lineTo(42, 22); ctx.lineTo(14, 14); ctx.lineTo(0, 26); ctx.lineTo(-14, 14); ctx.lineTo(-42, 22);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, 480 + shipX * 260, 496, boostOn ? 46 : 30, '34,211,238', boostOn ? 0.65 : 0.38);
      if (typeof window.drawTvSpeedlines === 'function' && (boostOn || speed > 680)) window.drawTvSpeedlines(ctx, 960, 540, boostOn ? 0.88 : (speed - 680) / 380, now * 0.001, '#22D3EE');
      stepBooms(ctx, booms, dt);
      window.TV_GAME_RAF = requestAnimationFrame(frame);
    }
    resetGame();
    window.TV_GAME_RAF = requestAnimationFrame(frame);
  }
  window.startHexGlGame = startHexGlGame;
})();
