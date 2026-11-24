// ===================================================================
// SMART TV ACTION PACK: PAC-MAN, BOMBERMAN & CLUMSY BIRD (STRICT ES5)
// ===================================================================
(function () {
  var EXPL_SPRITES = [
    'assets/games/explosion/groundExplosion00.png', 'assets/games/explosion/groundExplosion01.png',
    'assets/games/explosion/groundExplosion02.png', 'assets/games/explosion/groundExplosion03.png',
    'assets/games/explosion/groundExplosion04.png', 'assets/games/explosion/groundExplosion05.png',
    'assets/games/explosion/groundExplosion06.png', 'assets/games/explosion/groundExplosion07.png',
    'assets/games/explosion/groundExplosion08.png'
  ];
  function preloadAll(arr) { if (typeof window.preloadTvGameSprites === 'function') window.preloadTvGameSprites(arr); }
  function spr(ctx, path, cx, cy, w, h, rot) { return typeof window.drawTvSprite === 'function' && window.drawTvSprite(ctx, path, cx, cy, w, h, rot); }
  function sprRect(ctx, path, x, y, w, h) { return typeof window.drawTvSpriteRect === 'function' && window.drawTvSpriteRect(ctx, path, x, y, w, h); }
  function tiledBg(ctx, path, w, h, sx, sy) { return typeof window.drawTvTiledBg === 'function' && window.drawTvTiledBg(ctx, path, w, h, sx, sy); }
  function playSfx(freq, dur, kind, g) { if (typeof window.playTvGameBeep === 'function') window.playTvGameBeep(freq, dur, kind, g); }
  function loadBest(key) { try { return Number(localStorage.getItem(key) || '0') || 0; } catch (e) { return 0; } }
  function saveBest(key, val) { try { localStorage.setItem(key, String(val)); } catch (e) {} }

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
  // 1. PAC-MAN ARCADE HD
  // =================================================================
  function startPacmanGame(scr) {
    preloadAll([
      'assets/games/puzzle/particleStar.png',
      'assets/games/puzzle/element_blue_square_glossy.png',
      'assets/games/space/darkPurple.png',
      'assets/games/space/pill_red.png'
    ]);
    var BEST_KEY = 'naim_tv_pacman_best_v1', best = loadBest(BEST_KEY);
    mountShell(scr, 'pac', '🟡 Pac-Man Arcade HD', best,
      '◀ ▲ ▶ ▼ Mover por el laberinto', 'Come las estrellas de poder para cazar fantasmas');

    var canvas = document.getElementById('pac-canvas'), ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('pac-score'), subEl = document.getElementById('pac-sub');
    var bestEl = document.getElementById('pac-best'), ov = document.getElementById('pac-ov');
    var finTitle = document.getElementById('pac-fin-title'), finSub = document.getElementById('pac-fin-sub');
    var gyro = typeof window.connectTvGyroBridge === 'function'
      ? window.connectTvGyroBridge('pacman', { arenaEl: document.getElementById('pac-arena'), btnEl: document.getElementById('pac-qr'), title: '🟡 Pac-Man · QR Móvil Gyro' })
      : null;

    var MAP_TPL = [
      '###################', '#O.......#.......O#', '#.##.###.#.###.##.#', '#.................#',
      '#.##.#.#####.#.##.#', '#....#...#...#....#', '####.### # ###.####', '   #.#       #.#   ',
      '####.# ##-## #.####', '#........ ........#', '#.##.###.#.###.##.#', '#O.#...........#.O#',
      '##.#.#.#####.#.#.##', '#....#...#...#....#', '###################'
    ];
    var ROWS = MAP_TPL.length, COLS = MAP_TPL[0].length, CELL = 32;
    var OX = Math.floor((960 - COLS * CELL) / 2), OY = Math.floor((540 - ROWS * CELL) / 2);
    var grid = [], dotsLeft = 0, score = 0, lives = 3, level = 1, frightTimer = 0, gameOver = false;
    var pac = { x: 9, y: 9, dx: 0, dy: 0, ndx: -1, ndy: 0, mouth: 0 }, ghosts = [];
    var GHOST_COLS = ['#EF4444', '#EC4899', '#22D3EE', '#F97316'];

    function initMap(keepScore) {
      grid = []; dotsLeft = 0;
      for (var r = 0; r < ROWS; r++) {
        var row = [];
        for (var c = 0; c < COLS; c++) {
          var ch = MAP_TPL[r].charAt(c); if (ch === '.' || ch === 'O') dotsLeft++; row.push(ch);
        }
        grid.push(row);
      }
      if (!keepScore) { score = 0; lives = 3; level = 1; }
      resetPositions(); syncHud();
    }
    function resetPositions() {
      pac = { x: 9, y: 9, dx: -1, dy: 0, ndx: -1, ndy: 0, mouth: 0 }; frightTimer = 0;
      ghosts = [
        { x: 9, y: 7, dx: 1, dy: 0, col: GHOST_COLS[0] }, { x: 8, y: 7, dx: -1, dy: 0, col: GHOST_COLS[1] },
        { x: 10, y: 7, dx: 1, dy: 0, col: GHOST_COLS[2] }, { x: 9, y: 6, dx: 0, dy: -1, col: GHOST_COLS[3] }
      ];
    }
    function syncHud() {
      scoreEl.textContent = 'PUNTOS: ' + score; subEl.textContent = 'VIDAS: ' + lives + ' · NIVEL ' + level;
      if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
    }
    function isWall(gx, gy) {
      var tx = ((Math.round(gx) % COLS) + COLS) % COLS, ty = Math.round(gy);
      if (ty < 0 || ty >= ROWS) return true;
      var ch = grid[ty][tx];
      return ch === '#' || ch === '-';
    }
    function resetAll() { gameOver = false; ov.style.display = 'none'; initMap(false); }
    document.getElementById('pac-replay').onclick = resetAll;

    window.tvGameKeyHandler = function (e, code) {
      if (gameOver) {
        if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetAll(); return true; }
        return false;
      }
      if (code === 37 || code === 21) { pac.ndx = -1; pac.ndy = 0; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { pac.ndx = 1; pac.ndy = 0; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 38 || code === 19) { pac.ndx = 0; pac.ndy = -1; if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 40 || code === 20) { pac.ndx = 0; pac.ndy = 1; if (e.preventDefault) e.preventDefault(); return true; }
      return false;
    };

    var last = performance.now();
    function frame(now) {
      if (window.TV_GAME_ACTIVE !== 'pacman') return;
      var dt = Math.min(0.04, (now - last) / 1000); last = now; pac.mouth += dt * 12;
      if (!gameOver) {
        if (gyro && gyro.isActive()) {
          var gp = gyro.getPad();
          var ax = gp.steer, ay = -gp.pitch;
          if (Math.abs(ax) > 0.28 || Math.abs(ay) > 0.28) {
            if (Math.abs(ax) >= Math.abs(ay)) { pac.ndx = ax > 0 ? 1 : -1; pac.ndy = 0; }
            else { pac.ndx = 0; pac.ndy = ay > 0 ? 1 : -1; }
          }
        }
        if (frightTimer > 0) frightTimer = Math.max(0, frightTimer - dt);
        var speed = 5.6 + Math.min(2.2, (level - 1) * 0.35), moveStep = dt * speed;
        if (pac.ndx === -pac.dx && pac.ndy === -pac.dy && (pac.ndx !== 0 || pac.ndy !== 0)) {
          pac.dx = pac.ndx; pac.dy = pac.ndy;
        }
        var rx = Math.round(pac.x), ry = Math.round(pac.y);
        if (pac.dx === 0 && pac.dy === 0) {
          if ((pac.ndx !== 0 || pac.ndy !== 0) && !isWall(rx + pac.ndx, ry + pac.ndy)) {
            pac.x = rx; pac.y = ry; pac.dx = pac.ndx; pac.dy = pac.ndy;
          }
        }
        if (pac.dx !== 0 || pac.dy !== 0) {
          var prevX = pac.x, prevY = pac.y;
          var nextX = prevX + pac.dx * moveStep, nextY = prevY + pac.dy * moveStep;
          var cxG = Math.round(prevX), cyG = Math.round(prevY);
          var crossX = pac.dx > 0 ? (prevX <= cxG + 0.001 && nextX >= cxG) : pac.dx < 0 ? (prevX >= cxG - 0.001 && nextX <= cxG) : Math.abs(prevX - cxG) < 0.1;
          var crossY = pac.dy > 0 ? (prevY <= cyG + 0.001 && nextY >= cyG) : pac.dy < 0 ? (prevY >= cyG - 0.001 && nextY <= cyG) : Math.abs(prevY - cyG) < 0.1;
          if (crossX && crossY) {
            var rem = Math.max(Math.abs(nextX - cxG), Math.abs(nextY - cyG));
            if ((pac.ndx !== pac.dx || pac.ndy !== pac.dy) && (pac.ndx !== 0 || pac.ndy !== 0) && !isWall(cxG + pac.ndx, cyG + pac.ndy)) {
              pac.x = cxG; pac.y = cyG; pac.dx = pac.ndx; pac.dy = pac.ndy;
              if (!isWall(cxG + pac.dx, cyG + pac.dy)) { pac.x += pac.dx * rem; pac.y += pac.dy * rem; }
            } else if (isWall(cxG + pac.dx, cyG + pac.dy)) {
              pac.x = cxG; pac.y = cyG; pac.dx = 0; pac.dy = 0;
            } else {
              pac.x = nextX; pac.y = nextY;
            }
          } else {
            pac.x = nextX; pac.y = nextY;
          }
          if (isWall(Math.round(pac.x), Math.round(pac.y))) {
            pac.x = cxG; pac.y = cyG; pac.dx = 0; pac.dy = 0;
          }
        }
        if (pac.x < -0.5) pac.x = COLS - 0.5; if (pac.x > COLS - 0.5) pac.x = -0.5;
        var cx = ((Math.round(pac.x) % COLS) + COLS) % COLS, cy = Math.round(pac.y);
        if (cy >= 0 && cy < ROWS && (grid[cy][cx] === '.' || grid[cy][cx] === 'O')) {
          var isPower = grid[cy][cx] === 'O'; grid[cy][cx] = ' '; dotsLeft--; score += isPower ? 50 : 10;
          if (isPower) { frightTimer = 7.0; playSfx(740, 0.16, 'triangle', 0.08); } else playSfx(420, 0.03, 'sine', 0.03);
          syncHud();
          if (dotsLeft <= 0) { level++; score += 500; playSfx(880, 0.25, 'triangle', 0.1); initMap(true); }
        }
        var gSpeed = frightTimer > 0 ? moveStep * 0.65 : moveStep * 0.85;
        for (var gi = 0; gi < ghosts.length; gi++) {
          var g = ghosts[gi], gPrevX = g.x, gPrevY = g.y, grx = Math.round(g.x), gry = Math.round(g.y);
          var gNextX = gPrevX + g.dx * gSpeed, gNextY = gPrevY + g.dy * gSpeed;
          var gCrossX = g.dx > 0 ? (gPrevX <= grx + 0.001 && gNextX >= grx) : g.dx < 0 ? (gPrevX >= grx - 0.001 && gNextX <= grx) : Math.abs(gPrevX - grx) < 0.12;
          var gCrossY = g.dy > 0 ? (gPrevY <= gry + 0.001 && gNextY >= gry) : g.dy < 0 ? (gPrevY >= gry - 0.001 && gNextY <= gry) : Math.abs(gPrevY - gry) < 0.12;
          if (gCrossX && gCrossY) {
            g.x = grx; g.y = gry;
            var dirs = [[1,0],[-1,0],[0,1],[0,-1]], valid = [];
            for (var d = 0; d < 4; d++) {
              if (dirs[d][0] === -g.dx && dirs[d][1] === -g.dy) continue;
              if (!isWall(grx + dirs[d][0], gry + dirs[d][1])) valid.push(dirs[d]);
            }
            if (!valid.length) valid.push([-g.dx, -g.dy]);
            valid.sort(function (a, b) {
              var da = Math.pow(grx + a[0] - pac.x, 2) + Math.pow(gry + a[1] - pac.y, 2);
              var db = Math.pow(grx + b[0] - pac.x, 2) + Math.pow(gry + b[1] - pac.y, 2);
              return frightTimer > 0 ? db - da : da - db;
            });
            var pick = (Math.random() < 0.72 || valid.length === 1) ? valid[0] : valid[Math.floor(Math.random() * valid.length)];
            g.dx = pick[0]; g.dy = pick[1];
            g.x += g.dx * gSpeed * 0.5; g.y += g.dy * gSpeed * 0.5;
          } else {
            g.x = gNextX; g.y = gNextY;
          }
          if (g.x < -0.5) g.x = COLS - 0.5; if (g.x > COLS - 0.5) g.x = -0.5;
          if (Math.hypot(g.x - pac.x, g.y - pac.y) < 0.65) {
            if (frightTimer > 0) { score += 200; syncHud(); g.x = 9; g.y = 7; playSfx(860, 0.14, 'square', 0.08); }
            else {
              lives--; syncHud(); playSfx(140, 0.25, 'sawtooth', 0.1);
              if (lives <= 0) {
                gameOver = true; finTitle.textContent = '👻 ¡ATRAPADO POR LOS FANTASMAS!'; finSub.textContent = 'Puntuación final: ' + score + ' · Nivel ' + level;
                ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
                var btn = document.getElementById('pac-replay'); if (btn && btn.focus) btn.focus();
              } else resetPositions();
              break;
            }
          }
        }
      }
      ctx.fillStyle = '#050812'; ctx.fillRect(0, 0, 960, 540);
      tiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 540, 0, 0);
      ctx.fillStyle = 'rgba(4, 7, 18, 0.72)'; ctx.fillRect(0, 0, 960, 540);
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var cell = grid[r][c], x = OX + c * CELL, y = OY + r * CELL;
        if (cell === '#') {
          if (!sprRect(ctx, 'assets/games/puzzle/element_blue_square_glossy.png', x + 1, y + 1, CELL - 2, CELL - 2)) {
            ctx.fillStyle = '#1D4ED8'; ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
            ctx.fillStyle = '#0B1738'; ctx.fillRect(x + 5, y + 5, CELL - 10, CELL - 10);
          }
        } else if (cell === '-') {
          if (!sprRect(ctx, 'assets/games/space/pill_red.png', x + 4, y + 11, CELL - 8, 10)) {
            ctx.fillStyle = '#F43F5E'; ctx.fillRect(x + 2, y + 13, CELL - 4, 6);
          }
        } else if (cell === '.') {
          ctx.fillStyle = '#FDE68A'; ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 3.6, 0, Math.PI * 2); ctx.fill();
        } else if (cell === 'O') {
          var pr = 20 + Math.sin(pac.mouth * 0.7) * 3.5;
          if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, x + CELL / 2, y + CELL / 2, 22, '250,204,21', 0.46);
          if (!spr(ctx, 'assets/games/puzzle/particleStar.png', x + CELL / 2, y + CELL / 2, pr, pr, now * 0.004)) {
            ctx.fillStyle = '#FACC15'; ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 7.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      var px = OX + (pac.x + 0.5) * CELL, py = OY + (pac.y + 0.5) * CELL;
      var ang = pac.dx < 0 ? Math.PI : pac.dy > 0 ? Math.PI / 2 : pac.dy < 0 ? -Math.PI / 2 : 0;
      var jaw = 0.15 + Math.abs(Math.sin(pac.mouth)) * 0.48;
      var pGrad = ctx.createRadialGradient(px - 4, py - 4, 2, px, py, CELL * 0.46);
      pGrad.addColorStop(0, '#FEF08A'); pGrad.addColorStop(0.7, '#FACC15'); pGrad.addColorStop(1, '#CA8A04');
      ctx.fillStyle = pGrad; ctx.beginPath(); ctx.moveTo(px, py);
      ctx.arc(px, py, CELL * 0.45, ang + jaw, ang + Math.PI * 2 - jaw); ctx.closePath(); ctx.fill();
      if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, px, py, 28, '250,204,21', 0.36);
      for (var j = 0; j < ghosts.length; j++) {
        var gh = ghosts[j], gx = OX + (gh.x + 0.5) * CELL, gy = OY + (gh.y + 0.5) * CELL;
        if (frightTimer > 0 && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, gx, gy, 24, '56,189,248', 0.45);
        ctx.fillStyle = frightTimer > 0 ? (frightTimer < 2 && Math.floor(frightTimer * 8) % 2 === 0 ? '#FFFFFF' : '#2563EB') : gh.col;
        ctx.beginPath(); ctx.arc(gx, gy - 2, CELL * 0.41, Math.PI, 0); ctx.lineTo(gx + CELL * 0.41, gy + CELL * 0.41); ctx.lineTo(gx - CELL * 0.41, gy + CELL * 0.41); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(gx - 4.5, gy - 3, 3.6, 0, Math.PI * 2); ctx.arc(gx + 4.5, gy - 3, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0F172A'; ctx.beginPath(); ctx.arc(gx - 4.5 + gh.dx * 1.5, gy - 3 + gh.dy * 1.5, 1.8, 0, Math.PI * 2); ctx.arc(gx + 4.5 + gh.dx * 1.5, gy - 3 + gh.dy * 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      if (typeof window.drawTvCrtOverlay === 'function') window.drawTvCrtOverlay(ctx, 960, 540, 0.15);
      window.TV_GAME_RAF = requestAnimationFrame(frame);
    }
    initMap(false);
    window.TV_GAME_RAF = requestAnimationFrame(frame);
  }
  window.startPacmanGame = startPacmanGame;

  // =================================================================
  // 2. BOMBERMAN PARTY ARENA
  // =================================================================
  function startBombermanGame(scr) {
    var ACTOR_SPRITES = [
      'assets/games/bomberman/player_05.png', 'assets/games/bomberman/player_01.png',
      'assets/games/bomberman/player_11.png', 'assets/games/bomberman/player_17.png'
    ];
    preloadAll(EXPL_SPRITES.concat(ACTOR_SPRITES).concat([
      'assets/games/bomberman/ground_06.png', 'assets/games/bomberman/block_01.png',
      'assets/games/bomberman/crate_01.png', 'assets/games/space/powerupBlue_bolt.png', 'assets/games/space/pill_red.png'
    ]));
    var BEST_KEY = 'naim_tv_bomberman_best_v1', best = loadBest(BEST_KEY);
    mountShell(scr, 'bomb', '💣 Bomberman Party Arena', best,
      '◀ ▲ ▶ ▼ Mover personaje · Destruye cajas para mejoras', 'OK / Espacio: Colocar Bomba');

    var canvas = document.getElementById('bomb-canvas'), ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('bomb-score'), subEl = document.getElementById('bomb-sub');
    var bestEl = document.getElementById('bomb-best'), ov = document.getElementById('bomb-ov');
    var finTitle = document.getElementById('bomb-fin-title'), finSub = document.getElementById('bomb-fin-sub');
    var gyro = typeof window.connectTvGyroBridge === 'function'
      ? window.connectTvGyroBridge('bomberman', { arenaEl: document.getElementById('bomb-arena'), btnEl: document.getElementById('bomb-qr'), title: '💣 Bomberman · QR Móvil Gyro' })
      : null;
    var gyroCd = 0, prevBombBtn = false;

    var COLS = 13, ROWS = 11, CELL = 44;
    var OX = Math.floor((960 - COLS * CELL) / 2), OY = Math.floor((540 - ROWS * CELL) / 2);
    var board = [], bombs = [], flames = [], items = [], actors = [], wins = 0, roundOver = false;

    function resetArena() {
      board = []; bombs = []; flames = []; items = []; roundOver = false;
      for (var r = 0; r < ROWS; r++) {
        var row = [];
        for (var c = 0; c < COLS; c++) {
          if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) row.push(1);
          else {
            var near = (r <= 2 && c <= 2) || (r <= 2 && c >= COLS - 3) || (r >= ROWS - 3 && c <= 2) || (r >= ROWS - 3 && c >= COLS - 3);
            row.push(!near && Math.random() < 0.62 ? 2 : 0);
          }
        }
        board.push(row);
      }
      actors = [
        { id: 0, isBot: false, x: 1, y: 1, range: 2, maxBombs: 1, activeBombs: 0, alive: true, col: '#22D3EE', cd: 0 },
        { id: 1, isBot: true, x: COLS - 2, y: 1, range: 2, maxBombs: 1, activeBombs: 0, alive: true, col: '#F43F5E', cd: 0 },
        { id: 2, isBot: true, x: 1, y: ROWS - 2, range: 2, maxBombs: 1, activeBombs: 0, alive: true, col: '#FACC15', cd: 0 },
        { id: 3, isBot: true, x: COLS - 2, y: ROWS - 2, range: 2, maxBombs: 1, activeBombs: 0, alive: true, col: '#22C55E', cd: 0 }
      ];
      ov.style.display = 'none'; syncHud();
    }
    function syncHud() {
      var botsLeft = 0; for (var i = 1; i < actors.length; i++) if (actors[i].alive) botsLeft++;
      var p = actors[0];
      scoreEl.textContent = 'LLAMA ' + p.range + ' · BOMBAS ' + p.maxBombs; subEl.textContent = 'RIVALES: ' + botsLeft + '/3';
      if (wins > best) { best = wins; saveBest(BEST_KEY, best); }
      bestEl.textContent = 'Victorias: ' + best;
    }
    function hasBombAt(x, y) { for (var i = 0; i < bombs.length; i++) if (bombs[i].x === x && bombs[i].y === y) return true; return false; }
    function dropBomb(actor) {
      if (!actor.alive || actor.activeBombs >= actor.maxBombs || hasBombAt(actor.x, actor.y)) return;
      actor.activeBombs++; bombs.push({ x: actor.x, y: actor.y, range: actor.range, timer: 2.3, owner: actor });
      playSfx(180, 0.08, 'triangle', 0.06);
    }
    function tryMove(actor, dx, dy) {
      if (!actor.alive || roundOver) return false;
      var nx = actor.x + dx, ny = actor.y + dy;
      if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1 || board[ny][nx] !== 0 || hasBombAt(nx, ny)) return false;
      actor.x = nx; actor.y = ny;
      for (var i = items.length - 1; i >= 0; i--) if (items[i].x === nx && items[i].y === ny) {
        if (items[i].kind === 'flame') actor.range = Math.min(6, actor.range + 1);
        else actor.maxBombs = Math.min(4, actor.maxBombs + 1);
        items.splice(i, 1); playSfx(720, 0.1, 'triangle', 0.08); syncHud();
      }
      return true;
    }
    function detonate(b) {
      b.owner.activeBombs = Math.max(0, b.owner.activeBombs - 1); playSfx(110, 0.22, 'sawtooth', 0.11);
      var dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1]]; flames.push({ x: b.x, y: b.y, timer: 0.48 });
      for (var d = 1; d < dirs.length; d++) for (var step = 1; step <= b.range; step++) {
        var fx = b.x + dirs[d][0] * step, fy = b.y + dirs[d][1] * step;
        if (board[fy][fx] === 1) break;
        flames.push({ x: fx, y: fy, timer: 0.48 });
        if (board[fy][fx] === 2) { board[fy][fx] = 0; if (Math.random() < 0.35) items.push({ x: fx, y: fy, kind: Math.random() < 0.55 ? 'flame' : 'bomb' }); break; }
        for (var bi = bombs.length - 1; bi >= 0; bi--) if (bombs[bi].x === fx && bombs[bi].y === fy && bombs[bi].timer > 0.05) bombs[bi].timer = 0.04;
      }
    }
    function isDangerTile(tx, ty) {
      for (var i = 0; i < bombs.length; i++) if ((bombs[i].x === tx && Math.abs(bombs[i].y - ty) <= bombs[i].range) || (bombs[i].y === ty && Math.abs(bombs[i].x - tx) <= bombs[i].range)) return true;
      for (var j = 0; j < flames.length; j++) if (flames[j].x === tx && flames[j].y === ty) return true;
      return false;
    }
    document.getElementById('bomb-replay').onclick = resetArena;
    window.tvGameKeyHandler = function (e, code) {
      if (roundOver) {
        if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetArena(); return true; }
        return false;
      }
      var p = actors[0];
      if (code === 37 || code === 21) { tryMove(p, -1, 0); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 39 || code === 22) { tryMove(p, 1, 0); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 38 || code === 19) { tryMove(p, 0, -1); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 40 || code === 20) { tryMove(p, 0, 1); if (e.preventDefault) e.preventDefault(); return true; }
      if (code === 13 || code === 23 || code === 66 || code === 32) { dropBomb(p); if (e.preventDefault) e.preventDefault(); return true; }
      return false;
    };

    var last = performance.now();
    function frame(now) {
      if (window.TV_GAME_ACTIVE !== 'bomberman') return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!roundOver) {
        if (gyroCd > 0) gyroCd -= dt;
        if (gyro && gyro.isActive()) {
          var gp2 = gyro.getPad();
          var bx = gp2.steer, by = -gp2.pitch;
          if (gyroCd <= 0 && (Math.abs(bx) > 0.34 || Math.abs(by) > 0.34)) {
            if (Math.abs(bx) >= Math.abs(by)) tryMove(actors[0], bx > 0 ? 1 : -1, 0);
            else tryMove(actors[0], 0, by > 0 ? 1 : -1);
            gyroCd = 0.16;
          }
          var bTrig = gp2.nitro || gp2.throttle > 0.65 || gp2.swing > 1.1;
          if (bTrig && !prevBombBtn) dropBomb(actors[0]);
          prevBombBtn = bTrig;
        } else { prevBombBtn = false; }
        for (var bi = bombs.length - 1; bi >= 0; bi--) { bombs[bi].timer -= dt; if (bombs[bi].timer <= 0) detonate(bombs.splice(bi, 1)[0]); }
        for (var fi = flames.length - 1; fi >= 0; fi--) {
          flames[fi].timer -= dt;
          for (var ai = 0; ai < actors.length; ai++) if (actors[ai].alive && actors[ai].x === flames[fi].x && actors[ai].y === flames[fi].y) { actors[ai].alive = false; syncHud(); }
          if (flames[fi].timer <= 0) flames.splice(fi, 1);
        }
        for (var k = 1; k < actors.length; k++) {
          var bot = actors[k]; if (!bot.alive) continue;
          bot.cd -= dt;
          if (bot.cd <= 0) {
            bot.cd = 0.28 + Math.random() * 0.14;
            var dirs = [[1,0],[-1,0],[0,1],[0,-1]], safe = [], allOpen = [];
            for (var d = 0; d < 4; d++) {
              var nx = bot.x + dirs[d][0], ny = bot.y + dirs[d][1];
              if (board[ny][nx] === 0 && !hasBombAt(nx, ny)) { allOpen.push(dirs[d]); if (!isDangerTile(nx, ny)) safe.push(dirs[d]); }
            }
            if (isDangerTile(bot.x, bot.y) && safe.length) {
              var ps = safe[Math.floor(Math.random() * safe.length)]; tryMove(bot, ps[0], ps[1]);
            } else {
              var nearCrate = false; for (var d2 = 0; d2 < 4; d2++) if (board[bot.y + dirs[d2][1]][bot.x + dirs[d2][0]] === 2) nearCrate = true;
              if ((nearCrate || Math.abs(bot.x - actors[0].x) + Math.abs(bot.y - actors[0].y) <= 2) && Math.random() < 0.36) dropBomb(bot);
              var pool = safe.length ? safe : allOpen;
              if (pool.length) { var mv = pool[Math.floor(Math.random() * pool.length)]; tryMove(bot, mv[0], mv[1]); }
            }
          }
        }
        var botsAlive = 0; for (var z = 1; z < actors.length; z++) if (actors[z].alive) botsAlive++;
        if (!actors[0].alive || botsAlive === 0) {
          roundOver = true; var won = actors[0].alive;
          if (won) { wins++; syncHud(); playSfx(720, 0.25, 'triangle', 0.11); } else playSfx(120, 0.25, 'sawtooth', 0.1);
          finTitle.textContent = won ? '🏆 ¡CAMPEÓN DE LA ARENA!' : '💥 ¡HAS SIDO ELIMINADO!';
          finSub.textContent = won ? 'Has derrotado a los 3 rivales' : 'Quedaban ' + botsAlive + ' bots activos';
          ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
          var btn = document.getElementById('bomb-replay'); if (btn && btn.focus) btn.focus();
        }
      }
      ctx.fillStyle = '#070b15'; ctx.fillRect(0, 0, 960, 540);
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var tx = OX + c * CELL, ty = OY + r * CELL;
        if (!sprRect(ctx, 'assets/games/bomberman/ground_06.png', tx, ty, CELL, CELL)) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#14532D' : '#166534'; ctx.fillRect(tx, ty, CELL, CELL);
        }
        if (board[r][c] === 1 && !sprRect(ctx, 'assets/games/bomberman/block_01.png', tx, ty, CELL, CELL)) {
          ctx.fillStyle = '#334155'; ctx.fillRect(tx + 2, ty + 2, CELL - 4, CELL - 4);
        } else if (board[r][c] === 2 && !sprRect(ctx, 'assets/games/bomberman/crate_01.png', tx + 1, ty + 1, CELL - 2, CELL - 2)) {
          ctx.fillStyle = '#B45309'; ctx.fillRect(tx + 3, ty + 3, CELL - 6, CELL - 6);
        }
      }
      for (var ii = 0; ii < items.length; ii++) {
        var it = items[ii], ix = OX + (it.x + 0.5) * CELL, iy = OY + (it.y + 0.5) * CELL;
        var iSpr = it.kind === 'flame' ? 'assets/games/space/powerupBlue_bolt.png' : 'assets/games/space/pill_red.png';
        if (!spr(ctx, iSpr, ix, iy, 28, 28, 0)) { ctx.fillStyle = it.kind === 'flame' ? '#F97316' : '#38BDF8'; ctx.beginPath(); ctx.arc(ix, iy, 13, 0, Math.PI * 2); ctx.fill(); }
      }
      for (var bi2 = 0; bi2 < bombs.length; bi2++) {
        var bm = bombs[bi2], bpx = OX + (bm.x + 0.5) * CELL, bpy = OY + (bm.y + 0.5) * CELL;
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, bpx, bpy, 28, '250,204,21', 0.4);
        ctx.fillStyle = '#0F172A'; ctx.beginPath(); ctx.arc(bpx, bpy, 13 + Math.sin(bm.timer * 14) * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#FACC15'; ctx.beginPath(); ctx.arc(bpx + 5, bpy - 8, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      for (var fi2 = 0; fi2 < flames.length; fi2++) {
        var fl = flames[fi2], fx = OX + (fl.x + 0.5) * CELL, fy = OY + (fl.y + 0.5) * CELL;
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, fx, fy, CELL * 0.85, '249,115,22', 0.48);
        var fIdx = Math.min(EXPL_SPRITES.length - 1, Math.max(0, Math.floor((1 - fl.timer / 0.48) * EXPL_SPRITES.length)));
        if (!spr(ctx, EXPL_SPRITES[fIdx], fx, fy, CELL * 1.15, CELL * 0.95, 0)) {
          ctx.fillStyle = 'rgba(249,115,22,0.85)'; ctx.fillRect(OX + fl.x * CELL + 2, OY + fl.y * CELL + 2, CELL - 4, CELL - 4);
        }
      }
      for (var a = 0; a < actors.length; a++) {
        var ac = actors[a]; if (!ac.alive) continue;
        var ax = OX + (ac.x + 0.5) * CELL, ay = OY + (ac.y + 0.5) * CELL;
        ctx.strokeStyle = ac.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay + 8, 16, 0, Math.PI * 2); ctx.stroke();
        if (!spr(ctx, ACTOR_SPRITES[a % ACTOR_SPRITES.length], ax, ay - 2, CELL * 0.95, CELL * 0.95, 0)) {
          ctx.fillStyle = ac.col; ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI * 2); ctx.fill();
        }
      }
      window.TV_GAME_RAF = requestAnimationFrame(frame);
    }
    resetArena();
    window.TV_GAME_RAF = requestAnimationFrame(frame);
  }
  window.startBombermanGame = startBombermanGame;

  // =================================================================
  // 3. CLUMSY BIRD TV
  // =================================================================
  function startFlappyGame(scr) {
    var PLANE_FRAMES = [
      'assets/games/tappy/planeYellow1.png', 'assets/games/tappy/planeYellow2.png', 'assets/games/tappy/planeYellow3.png'
    ];
    preloadAll(PLANE_FRAMES.concat([
      'assets/games/tappy/background.png', 'assets/games/tappy/groundGrass.png',
      'assets/games/tappy/rockGrass.png', 'assets/games/tappy/rockGrassDown.png', 'assets/games/tappy/puffLarge.png'
    ]));
    var BEST_KEY = 'naim_tv_flappy_best_v1', best = loadBest(BEST_KEY);
    mountShell(scr, 'flap', '🐦 Clumsy Bird TV', best,
      'Pulsa OK, ▲, Espacio o Haz Clic para volar', 'Supera las rocas · 1 botón para toda la familia');

    var canvas = document.getElementById('flap-canvas'), ctx = canvas.getContext('2d');
    var scoreEl = document.getElementById('flap-score'), subEl = document.getElementById('flap-sub');
    var bestEl = document.getElementById('flap-best'), ov = document.getElementById('flap-ov');
    var finTitle = document.getElementById('flap-fin-title'), finSub = document.getElementById('flap-fin-sub');
    var gyro = typeof window.connectTvGyroBridge === 'function'
      ? window.connectTvGyroBridge('flappy', { arenaEl: document.getElementById('flap-arena'), btnEl: document.getElementById('flap-qr'), title: '🐦 Clumsy Bird · QR Móvil Gyro' })
      : null;
    var prevFlapTrig = false;

    var bird = { y: 240, vy: 0 }, pipes = [], puffs = [], score = 0, started = false, dead = false, scroll = 0;
    function resetGame() {
      bird = { y: 240, vy: 0 }; pipes = []; puffs = []; score = 0; started = false; dead = false; scroll = 0;
      ov.style.display = 'none'; scoreEl.textContent = 'PUNTOS: 0'; subEl.textContent = 'LISTO PARA VOLAR';
    }
    function flap() {
      if (dead) return;
      started = true; bird.vy = -345; puffs.push({ x: 215, y: bird.y + 4, life: 0.45 });
      subEl.textContent = 'EN VUELO'; playSfx(520, 0.06, 'triangle', 0.06);
    }
    canvas.onclick = flap;
    document.getElementById('flap-replay').onclick = resetGame;
    window.tvGameKeyHandler = function (e, code) {
      if (dead) {
        if (code === 13 || code === 23 || code === 66 || code === 32) { if (e.preventDefault) e.preventDefault(); resetGame(); return true; }
        return false;
      }
      if (code === 13 || code === 23 || code === 66 || code === 32 || code === 38 || code === 19) { flap(); if (e.preventDefault) e.preventDefault(); return true; }
      return false;
    };

    var spawnX = 0, last = performance.now();
    function frame(now) {
      if (window.TV_GAME_ACTIVE !== 'flappy') return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!dead && gyro && gyro.isActive()) {
        var gp3 = gyro.getPad();
        var fTrig = gp3.nitro || gp3.throttle > 0.45 || gp3.swing > 0.9 || gp3.pitch > 0.42;
        if (fTrig && !prevFlapTrig) flap();
        prevFlapTrig = fTrig;
      } else { prevFlapTrig = false; }
      for (var pfi = puffs.length - 1; pfi >= 0; pfi--) {
        puffs[pfi].x -= 140 * dt; puffs[pfi].life -= dt; if (puffs[pfi].life <= 0) puffs.splice(pfi, 1);
      }
      if (started && !dead) {
        scroll += 235 * dt; bird.vy += 980 * dt; bird.y += bird.vy * dt; spawnX += 235 * dt;
        if (spawnX >= 270) { spawnX = 0; pipes.push({ x: 980, gapY: 130 + Math.random() * 200, gapH: 156, passed: false }); }
        for (var i = pipes.length - 1; i >= 0; i--) {
          var p = pipes[i]; p.x -= 235 * dt;
          if (!p.passed && p.x + 68 < 240) {
            p.passed = true; score++; scoreEl.textContent = 'PUNTOS: ' + score;
            if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
            playSfx(740, 0.07, 'sine', 0.06);
          }
          if (p.x + 64 > 224 && p.x + 6 < 258 && (bird.y - 14 < p.gapY - p.gapH / 2 || bird.y + 14 > p.gapY + p.gapH / 2)) dead = true;
          if (p.x < -100) pipes.splice(i, 1);
        }
        if (bird.y > 474 || bird.y < 14) dead = true;
        if (dead) {
          var medal = score >= 30 ? '💎 Platino' : score >= 15 ? '🥇 Oro' : score >= 7 ? '🥈 Plata' : '🥉 Bronce';
          finTitle.textContent = '🐦 ¡CHOQUE! · ' + medal; finSub.textContent = 'Rocas superadas: ' + score + ' · Récord: ' + best;
          ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
          var btn = document.getElementById('flap-replay'); if (btn && btn.focus) btn.focus();
          playSfx(135, 0.24, 'sawtooth', 0.1);
        }
      } else if (!started) { scroll += 90 * dt; bird.y = 240 + Math.sin(now * 0.005) * 14; }

      var sky = ctx.createLinearGradient(0, 0, 0, 490);
      sky.addColorStop(0, '#0C4A6E'); sky.addColorStop(1, '#38BDF8');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 490);
      tiledBg(ctx, 'assets/games/tappy/background.png', 960, 480, -scroll * 0.35, 0);
      if (typeof window.drawTvNebulaLayer === 'function') window.drawTvNebulaLayer(ctx, 960, 540, now * 0.001, 'sky');

      for (var pi = 0; pi < pipes.length; pi++) {
        var pp = pipes[pi], topH = pp.gapY - pp.gapH / 2, botY = pp.gapY + pp.gapH / 2;
        if (topH > 0) {
          var hTop = Math.max(239, topH);
          if (!sprRect(ctx, 'assets/games/tappy/rockGrassDown.png', pp.x - 10, topH - hTop, 88, hTop)) {
            ctx.fillStyle = '#22C55E'; ctx.fillRect(pp.x, 0, 68, topH);
          }
        }
        var hBot = Math.max(239, 495 - botY);
        if (!sprRect(ctx, 'assets/games/tappy/rockGrass.png', pp.x - 10, botY, 88, hBot)) {
          ctx.fillStyle = '#22C55E'; ctx.fillRect(pp.x, botY, 68, 490 - botY);
        }
      }
      for (var pf = 0; pf < puffs.length; pf++) spr(ctx, 'assets/games/tappy/puffLarge.png', puffs[pf].x, puffs[pf].y, 26, 22, 0);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 470, 960, 70); ctx.clip();
      if (!tiledBg(ctx, 'assets/games/tappy/groundGrass.png', 960, 540, -scroll, 470)) {
        ctx.fillStyle = '#15803D'; ctx.fillRect(0, 490, 960, 10); ctx.fillStyle = '#D97706'; ctx.fillRect(0, 500, 960, 40);
      }
      ctx.restore();

      var rot = Math.max(-0.45, Math.min(0.95, bird.vy * 0.0018));
      if (!spr(ctx, PLANE_FRAMES[Math.floor(now / 75) % 3], 240, bird.y, 52, 43, rot)) {
        ctx.fillStyle = '#FACC15'; ctx.beginPath(); ctx.ellipse(240, bird.y, 19, 15, rot, 0, Math.PI * 2); ctx.fill();
      }
      if (!started) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'; ctx.fillRect(280, 100, 400, 62);
        ctx.fillStyle = '#FFF'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('PULSA OK / ▲ PARA DESPEGAR', 480, 139);
      }
      window.TV_GAME_RAF = requestAnimationFrame(frame);
    }
    resetGame();
    window.TV_GAME_RAF = requestAnimationFrame(frame);
  }
  window.startFlappyGame = startFlappyGame;
})();
