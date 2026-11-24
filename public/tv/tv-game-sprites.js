// ===================================================================
// SMART TV GAME SPRITE LOADER & RENDER HELPERS (STRICT ES5)
// Caches CC0 sprites from assets/games/* with instant vector fallback
// ===================================================================
(function () {
  var CACHE = {};

  var KENNEY_CDN = 'https://raw.githubusercontent.com/shorepine/kenney/main/';
  var THREE_CDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/';
  var POLYHAVEN_HDR_CDN = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/';
  var POLYHAVEN_TEX_CDN = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
  var CDN_EXACT = {
    'penalty/stadium_backdrop.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/NotreDameStadiumNight.jpg/1280px-NotreDameStadiumNight.jpg',
    'arenas/soccer_stadium.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Camp_Nou_aerial_%28cropped%29.jpg/1280px-Camp_Nou_aerial_%28cropped%29.jpg',
    'arenas/bowling_alley.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Sunset_Lanes_bowling_alley_-_Beaverton%2C_OR_%282015%29.jpg/1280px-Sunset_Lanes_bowling_alley_-_Beaverton%2C_OR_%282015%29.jpg',
    'arenas/tennis_court.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Wimbledon_Centre_Court_2017_cropped.jpg/1280px-Wimbledon_Centre_Court_2017_cropped.jpg',
    'arenas/labyrinth_board.jpg': POLYHAVEN_TEX_CDN + 'oak_veneer_01/oak_veneer_01_diff_1k.jpg',
    'hdri/moonless_golf_1k.hdr': POLYHAVEN_HDR_CDN + 'moonless_golf_1k.hdr',
    'hdri/puresky_1k.hdr': POLYHAVEN_HDR_CDN + 'kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    'hdri/studio_small_09_1k.hdr': POLYHAVEN_HDR_CDN + 'studio_small_09_1k.hdr',
    'hdri/venice_sunset_1k.hdr': POLYHAVEN_HDR_CDN + 'venice_sunset_1k.hdr',
    'hdri/evening_road_01_1k.hdr': POLYHAVEN_HDR_CDN + 'evening_road_01_1k.hdr',
    'hdri/lebombo_1k.hdr': POLYHAVEN_HDR_CDN + 'lebombo_1k.hdr',
    'rive/skills.riv': 'https://cdn.rive.app/animations/vehicles.riv',
    'rive/vehicles.riv': 'https://cdn.rive.app/animations/vehicles.riv',
    'pbr/oak_diff.jpg': POLYHAVEN_TEX_CDN + 'oak_veneer_01/oak_veneer_01_diff_1k.jpg',
    'pbr/oak_rough.jpg': POLYHAVEN_TEX_CDN + 'oak_veneer_01/oak_veneer_01_rough_1k.jpg',
    'pbr/wood_floor_diff.jpg': POLYHAVEN_TEX_CDN + 'wood_floor_deck/wood_floor_deck_diff_1k.jpg',
    'pbr/wood_floor_nor.jpg': POLYHAVEN_TEX_CDN + 'wood_floor_deck/wood_floor_deck_nor_gl_1k.jpg',
    'pbr/asphalt_diff.jpg': POLYHAVEN_TEX_CDN + 'asphalt_track/asphalt_track_diff_1k.jpg',
    'pbr/asphalt_nor.jpg': POLYHAVEN_TEX_CDN + 'asphalt_track/asphalt_track_nor_gl_1k.jpg',
    'pbr/asphalt_rough.jpg': POLYHAVEN_TEX_CDN + 'asphalt_track/asphalt_track_rough_1k.jpg',
    'pbr/concrete_worn_diff.jpg': POLYHAVEN_TEX_CDN + 'concrete_floor_worn_001/concrete_floor_worn_001_diff_1k.jpg',
    'pbr/grass_diff.jpg': POLYHAVEN_TEX_CDN + 'aerial_grass_rock/aerial_grass_rock_diff_1k.jpg',
    'pbr/forrest_ground_diff.jpg': POLYHAVEN_TEX_CDN + 'forrest_ground_01/forrest_ground_01_diff_1k.jpg',
    'pbr/rubber_tiles_diff.jpg': POLYHAVEN_TEX_CDN + 'rubber_tiles/rubber_tiles_diff_1k.jpg',
    'models/ferrari.glb': THREE_CDN + 'ferrari.glb',
    'models/ferrari_ao.png': THREE_CDN + 'ferrari_ao.png',
    'models/endurance.glb': 'https://cdn.jsdelivr.net/gh/drcollect/collect-cars@main/models/endurance.glb',
    'models/hypercar.glb': 'https://cdn.jsdelivr.net/gh/drcollect/collect-cars@main/models/hypercar.glb',
    'models/rally.glb': 'https://cdn.jsdelivr.net/gh/drcollect/collect-cars@main/models/rally.glb',
    'models/wedge.glb': 'https://cdn.jsdelivr.net/gh/drcollect/collect-cars@main/models/wedge.glb',
    'models/RobotExpressive.glb': THREE_CDN + 'RobotExpressive/RobotExpressive.glb',
    'models/Soldier.glb': THREE_CDN + 'Soldier.glb',
    'models/Xbot.glb': THREE_CDN + 'Xbot.glb',
    'models/Michelle.glb': THREE_CDN + 'Michelle.glb',
    'models/CesiumMan.glb': 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/CesiumMan/glTF-Binary/CesiumMan.glb',
    'models/Fox.glb': 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Fox/glTF-Binary/Fox.glb',
    'models/race-future.glb': KENNEY_CDN + '3d/car/race-future.glb',
    'models/race.glb': KENNEY_CDN + '3d/car/race.glb',
    'models/sedan-sports.glb': KENNEY_CDN + '3d/car/sedan-sports.glb',
    'models/hatchback-sports.glb': KENNEY_CDN + '3d/car/hatchback-sports.glb',
    'models/suv-luxury.glb': KENNEY_CDN + '3d/car/suv-luxury.glb',
    'models/police.glb': KENNEY_CDN + '3d/car/police.glb',
    'models/grandStandCovered.glb': KENNEY_CDN + '3d/racing/grandStandCovered.glb',
    'models/grandStandCoveredRound.glb': KENNEY_CDN + '3d/racing/grandStandCoveredRound.glb',
    'models/overheadLights.glb': KENNEY_CDN + '3d/racing/overheadLights.glb',
    'models/lightPostLarge.glb': KENNEY_CDN + '3d/racing/lightPostLarge.glb',
    'models/pitsGarage.glb': KENNEY_CDN + '3d/racing/pitsGarage.glb',
    'models/barrierRed.glb': KENNEY_CDN + '3d/racing/barrierRed.glb',
    'models/barrierWhite.glb': KENNEY_CDN + '3d/racing/barrierWhite.glb',
    'models/barrierWall.glb': KENNEY_CDN + '3d/racing/barrierWall.glb',
    'models/billboard.glb': KENNEY_CDN + '3d/racing/billboard.glb',
    'models/bannerTowerRed.glb': KENNEY_CDN + '3d/racing/bannerTowerRed.glb',
    'models/bannerTowerGreen.glb': KENNEY_CDN + '3d/racing/bannerTowerGreen.glb',
    'models/flagCheckers.glb': KENNEY_CDN + '3d/racing/flagCheckers.glb',
    'models/treeLarge.glb': KENNEY_CDN + '3d/racing/treeLarge.glb',
    'models/treeSmall.glb': KENNEY_CDN + '3d/racing/treeSmall.glb',
    'toon/male_idle.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_idle.png',
    'toon/male_run0.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_run0.png',
    'toon/male_run1.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_run1.png',
    'toon/male_run2.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_run2.png',
    'toon/male_kick.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_kick.png',
    'toon/male_jump.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_jump.png',
    'toon/male_cheer0.png': KENNEY_CDN + '2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_cheer0.png',
    'toon/female_idle.png': KENNEY_CDN + '2d/Toon%20Characters/Female%20person/Poses%20HD/character_femalePerson_idle.png',
    'toon/female_kick.png': KENNEY_CDN + '2d/Toon%20Characters/Female%20person/Poses%20HD/character_femalePerson_kick.png',
    'toon/female_cheer0.png': KENNEY_CDN + '2d/Toon%20Characters/Female%20person/Poses%20HD/character_femalePerson_cheer0.png',
    'toon/robot_idle.png': KENNEY_CDN + '2d/Toon%20Characters/Robot/Poses%20HD/character_robot_idle.png',
    'toon/robot_cheer0.png': KENNEY_CDN + '2d/Toon%20Characters/Robot/Poses%20HD/character_robot_cheer0.png',
    'space/blue.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Backgrounds/blue.png',
    'space/darkPurple.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Backgrounds/darkPurple.png',
    'space/playerShip1_blue.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/playerShip1_blue.png',
    'space/playerShip2_orange.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/playerShip2_orange.png',
    'space/playerShip3_red.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/playerShip3_red.png',
    'space/ufoRed.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/ufoRed.png',
    'space/enemyBlue1.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Enemies/enemyBlue1.png',
    'space/enemyGreen2.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Enemies/enemyGreen2.png',
    'space/enemyRed3.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Enemies/enemyRed3.png',
    'space/laserBlue01.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Lasers/laserBlue01.png',
    'space/laserRed01.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Lasers/laserRed01.png',
    'space/meteorBrown_big1.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Meteors/meteorBrown_big1.png',
    'space/meteorGrey_big1.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Meteors/meteorGrey_big1.png',
    'space/fire00.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Effects/fire00.png',
    'space/fire01.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Effects/fire01.png',
    'space/shield3.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Effects/shield3.png',
    'space/pill_blue.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Power-ups/pill_blue.png',
    'space/pill_green.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Power-ups/pill_green.png',
    'space/pill_red.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Power-ups/pill_red.png',
    'space/powerupBlue_bolt.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Power-ups/powerupBlue_bolt.png',
    'space/powerupBlue_shield.png': KENNEY_CDN + '2d/Space%20Shooter%20Remastered/Power-ups/powerupBlue_shield.png'
  };

  function resolveSpriteUrl(relPath) {
    var raw = String(relPath || '');
    if (!raw) return '';
    if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0 || raw.indexOf('data:') === 0) return raw;
    var clean = raw.replace(/^(\.\/|\/)+/, '').replace(/^assets\/games\//, '');
    if (CDN_EXACT[clean]) return CDN_EXACT[clean];
    var slash = clean.indexOf('/');
    var folder = slash > 0 ? clean.slice(0, slash) : '';
    var file = slash > 0 ? clean.slice(slash + 1) : clean;
    if (folder === 'explosion') return KENNEY_CDN + '2d/Explosion%20Pack/Ground%20explosion/' + file;
    if (folder === 'puzzle') return KENNEY_CDN + '2d/Puzzle%20Pack%201/Double/' + file;
    if (folder === 'rolling') return KENNEY_CDN + '2d/Rolling%20Ball%20Assets/Retina/' + file;
    if (folder === 'particles') return KENNEY_CDN + '2d/Particle%20Pack/PNG%20(Transparent)/' + file;
    if (folder === 'medals') return KENNEY_CDN + '2d/Tappy%20Plane/UI/' + file;
    if (folder === 'tappy') {
      if (file.indexOf('plane') === 0) return KENNEY_CDN + '2d/Tappy%20Plane/Planes/' + file;
      return KENNEY_CDN + '2d/Tappy%20Plane/' + file;
    }
    if (folder === 'bomberman') {
      if (file.indexOf('player_') === 0) return KENNEY_CDN + '2d/Sokoban%20Pack/Retina/Player/' + file;
      if (file.indexOf('ground_') === 0) return KENNEY_CDN + '2d/Sokoban%20Pack/Retina/Ground/' + file;
      if (file.indexOf('block_') === 0) return KENNEY_CDN + '2d/Sokoban%20Pack/Retina/Blocks/' + file;
      if (file.indexOf('crate_') === 0) return KENNEY_CDN + '2d/Sokoban%20Pack/Retina/Crates/' + file;
    }
    if (folder === 'sports') {
      if (file.indexOf('character_blue_') === 0) {
        return KENNEY_CDN + '2d/Sports%20Pack/Blue/' + encodeURIComponent('characterBlue (' + file.replace('character_blue_', '').replace('.png', '') + ').png');
      }
      if (file.indexOf('character_red_') === 0) {
        return KENNEY_CDN + '2d/Sports%20Pack/Red/' + encodeURIComponent('characterRed (' + file.replace('character_red_', '').replace('.png', '') + ').png');
      }
      return KENNEY_CDN + '2d/Sports%20Pack/Equipment/' + file;
    }
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      return './assets/games/' + clean;
    }
    return '/assets/games/' + clean;
  }

  function getTvGameSprite(relPath) {
    if (!relPath) return null;
    var key = String(relPath).replace(/^(\.\/|\/)+/, '');
    var entry = CACHE[key];
    if (!entry) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      entry = { img: img, failed: false };
      img.onerror = function () { entry.failed = true; };
      img.src = resolveSpriteUrl(key);
      CACHE[key] = entry;
      return null;
    }
    if (entry.failed) return null;
    if (entry.img && entry.img.complete && entry.img.naturalWidth > 0) {
      return entry.img;
    }
    return null;
  }

  function preloadTvGameSprites(list) {
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      getTvGameSprite(list[i]);
    }
  }

  function drawTvSprite(ctx, relPath, cx, cy, w, h, rot) {
    var img = getTvGameSprite(relPath);
    if (!img) return false;
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  function drawTvSpriteRect(ctx, relPath, x, y, w, h) {
    var img = getTvGameSprite(relPath);
    if (!img) return false;
    ctx.drawImage(img, x, y, w, h);
    return true;
  }

  function drawTvTiledBg(ctx, relPath, canvasW, canvasH, scrollX, scrollY) {
    var img = getTvGameSprite(relPath);
    if (!img || !img.naturalWidth || !img.naturalHeight) return false;
    var tw = img.naturalWidth;
    var th = img.naturalHeight;
    var ox = ((scrollX || 0) % tw + tw) % tw - tw;
    var oy = ((scrollY || 0) % th + th) % th - th;
    for (var x = ox; x < canvasW; x += tw) {
      for (var y = oy; y < canvasH; y += th) {
        ctx.drawImage(img, x, y, tw, th);
      }
    }
    return true;
  }

  var TV_ZZFX_CTX = null;
  function playTvZzfxPreset(preset) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!TV_ZZFX_CTX) TV_ZZFX_CTX = new AC();
      if (TV_ZZFX_CTX.state === 'suspended' && TV_ZZFX_CTX.resume) TV_ZZFX_CTX.resume();
      var R = TV_ZZFX_CTX.sampleRate || 44100;
      var dur = preset === 'explosion' ? 0.34 : preset === 'powerup' ? 0.22 : 0.1;
      var f0 = preset === 'explosion' ? 140 : preset === 'laser' ? 960 : preset === 'powerup' ? 420 : 620;
      var f1 = preset === 'explosion' ? 38 : preset === 'laser' ? 240 : preset === 'powerup' ? 1120 : 410;
      var noise = preset === 'explosion' ? 0.72 : preset === 'laser' ? 0.05 : 0;
      var len = Math.max(128, Math.floor(R * dur));
      var buf = TV_ZZFX_CTX.createBuffer(1, len, R);
      var ch = buf.getChannelData(0), phase = 0;
      for (var i = 0; i < len; i++) {
        var t = i / len, env = Math.pow(1 - t, 1.4);
        phase += (Math.PI * 2 * (f0 + (f1 - f0) * t)) / R;
        ch[i] = (Math.sin(phase) * (1 - noise) + (Math.random() * 2 - 1) * noise) * env * 0.11;
      }
      var src = TV_ZZFX_CTX.createBufferSource();
      src.buffer = buf; src.connect(TV_ZZFX_CTX.destination); src.start();
    } catch (e) {}
  }

  function buildTvVolanteUrl(roomId, gameId, slot) {
    var origin = (typeof window.getTvRacingPublicOrigin === 'function')
      ? window.getTvRacingPublicOrigin()
      : (window.location && window.location.origin ? window.location.origin : ('https://' + ((window.location && window.location.host) || 'localhost')));
    return origin + '/volante?room=' + encodeURIComponent(roomId || '') + '&game=' + encodeURIComponent(gameId || '') + '&slot=' + (slot === 2 ? '2' : '1');
  }

  function createTvDualQrLobby(arenaEl, opts) {
    var cfg = opts || {};
    var ready = false;
    var waitTimer = null;
    var p1Ready = false;
    var p2Ready = false;
    var overlay = null;
    var slot1El = null;
    var slot2El = null;
    var badge1El = null;
    var badge2El = null;
    var statusEl = null;
    var btnStart = null;
    var btnSolo = null;

    function clearWaitTimer() {
      if (waitTimer) {
        clearInterval(waitTimer);
        waitTimer = null;
      }
    }

    function markReady(mode) {
      if (ready) return;
      ready = true;
      clearWaitTimer();
      if (overlay) overlay.style.display = 'none';
      if (arenaEl) {
        arenaEl.tabIndex = -1;
        try { arenaEl.focus(); } catch (e) {}
      }
      if (typeof cfg.onStartReady === 'function') cfg.onStartReady(mode || 'auto');
    }

    if (arenaEl && typeof document !== 'undefined') {
      var u1 = buildTvVolanteUrl(cfg.roomId, cfg.gameId, 1);
      var u2 = buildTvVolanteUrl(cfg.roomId, cfg.gameId, 2);
      var qr1 = typeof window.buildQrSvgMarkup === 'function' ? window.buildQrSvgMarkup(u1) : '';
      var qr2 = typeof window.buildQrSvgMarkup === 'function' ? window.buildQrSvgMarkup(u2) : '';
      var esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : function (s) { return String(s || ''); };

      overlay = document.createElement('div');
      overlay.className = 'tv-dual-qr-overlay';
      overlay.innerHTML =
        '<div class="tv-dual-qr-card">' +
        '<div class="tv-dual-qr-head">' + esc(cfg.title || 'ESPERANDO MANDOS MÓVILES') + '</div>' +
        '<div class="tv-dual-qr-sub" id="tv-dqr-status">Escanea J1 o J2 en vertical (entra directo sin código) · El juego espera a tu móvil</div>' +
        '<div class="tv-dual-qr-grid">' +
        '<div class="tv-dual-qr-slot j1" id="tv-dqr-slot1">' +
        '<div class="tv-dual-qr-pill" id="tv-dqr-b1">JUGADOR 1 · AZUL</div>' +
        '<div class="tv-dual-qr-box">' + qr1 + '</div>' +
        '<div style="font-size:11px;color:#cbd5e1;font-weight:700;">Mando Vertical + Botones Laterales</div>' +
        '</div>' +
        '<div class="tv-dual-qr-slot j2" id="tv-dqr-slot2">' +
        '<div class="tv-dual-qr-pill" id="tv-dqr-b2">JUGADOR 2 · ROJO (OPCIONAL)</div>' +
        '<div class="tv-dual-qr-box">' + qr2 + '</div>' +
        '<div style="font-size:11px;color:#cbd5e1;font-weight:700;">Escanea para Duelo 2 Jugadores</div>' +
        '</div></div>' +
        '<div class="tv-dual-qr-actions">' +
        '<button type="button" class="tv-btn-primary" id="tv-dqr-start" tabindex="0">Empezar ya (OK)</button>' +
        '<button type="button" class="tv-btn" id="tv-dqr-solo" tabindex="0">Jugar con Mando TV</button>' +
        '</div></div>';

      arenaEl.appendChild(overlay);
      slot1El = overlay.querySelector('#tv-dqr-slot1');
      slot2El = overlay.querySelector('#tv-dqr-slot2');
      badge1El = overlay.querySelector('#tv-dqr-b1');
      badge2El = overlay.querySelector('#tv-dqr-b2');
      statusEl = overlay.querySelector('#tv-dqr-status');
      btnStart = overlay.querySelector('#tv-dqr-start');
      btnSolo = overlay.querySelector('#tv-dqr-solo');
      if (btnStart) btnStart.onclick = function () { markReady('start'); };
      if (btnSolo) btnSolo.onclick = function () { markReady('solo'); };
      if (btnSolo && btnSolo.focus) {
        setTimeout(function () { if (!ready && btnSolo && btnSolo.focus) btnSolo.focus(); }, 60);
      }
    }

    function onStatus(controllers) {
      var list = controllers || [];
      p1Ready = false;
      p2Ready = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].slot === 2 || (i === 1 && !list[i].slot)) p2Ready = true;
        else p1Ready = true;
      }
      if (slot1El) slot1El.className = 'tv-dual-qr-slot j1' + (p1Ready ? ' connected' : '');
      if (slot2El) slot2El.className = 'tv-dual-qr-slot j2' + (p2Ready ? ' connected' : '');
      if (badge1El) badge1El.textContent = p1Ready ? '✓ J1 CONECTADO' : 'JUGADOR 1 · AZUL';
      if (badge2El) badge2El.textContent = p2Ready ? '✓ J2 CONECTADO' : 'JUGADOR 2 · ROJO (OPCIONAL)';

      if (p1Ready && p2Ready) {
        if (statusEl) statusEl.textContent = '¡2 Móviles conectados! Empezando partida...';
        markReady('auto');
      } else if ((p1Ready || p2Ready) && !ready && !waitTimer) {
        var left = 2;
        if (statusEl) statusEl.textContent = '✓ Mando conectado · Esperando J2 (' + left + 's) o pulsa Empezar...';
        waitTimer = setInterval(function () {
          left -= 1;
          if (left <= 0) markReady('auto');
          else if (statusEl) statusEl.textContent = '✓ Mando conectado · Arrancando en ' + left + 's...';
        }, 1000);
      }
    }

    return {
      isReady: function () { return ready; },
      onStatus: onStatus,
      onRemoteBypass: function () { markReady('solo'); },
      forceShow: function () {
        ready = false;
        clearWaitTimer();
        if (overlay) overlay.style.display = 'flex';
        if (btnSolo && btnSolo.focus) setTimeout(function () { btnSolo.focus(); }, 40);
      },
      destroy: function () {
        clearWaitTimer();
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
    };
  }

  var ACTIVE_BRIDGE_WS = null;
  var ACTIVE_BRIDGE_LOBBY = null;
  var ACTIVE_BRIDGE_GAME = '';

  function closeTvGyroBridge() {
    ACTIVE_BRIDGE_GAME = '';
    if (ACTIVE_BRIDGE_WS) {
      ACTIVE_BRIDGE_WS.onclose = null;
      try { ACTIVE_BRIDGE_WS.close(); } catch (e) {}
      ACTIVE_BRIDGE_WS = null;
    }
    if (ACTIVE_BRIDGE_LOBBY && typeof ACTIVE_BRIDGE_LOBBY.destroy === 'function') {
      ACTIVE_BRIDGE_LOBBY.destroy();
    }
    ACTIVE_BRIDGE_LOBBY = null;
  }

  function connectTvGyroBridge(gameId, opts) {
    closeTvGyroBridge();
    ACTIVE_BRIDGE_GAME = String(gameId || '');
    var cfg = opts || {};
    var roomId = (typeof window.currentRoomId === 'string' && window.currentRoomId)
      ? window.currentRoomId
      : (ACTIVE_BRIDGE_GAME.slice(0, 3) + '-' + Math.floor(1000 + Math.random() * 9000));
    var pad = { steer: 0, pitch: 0, roll: 0, swing: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
    var hasCtrl = false;
    var lobby = null;
    var btnEl = cfg.btnEl || null;

    function updateBtn() {
      if (!btnEl) return;
      btnEl.textContent = hasCtrl ? '📱 Móvil OK' : '📱 QR Gyro';
    }

    function openQr() {
      if (!cfg.arenaEl) return;
      if (!lobby) {
        lobby = createTvDualQrLobby(cfg.arenaEl, {
          roomId: roomId,
          gameId: ACTIVE_BRIDGE_GAME,
          title: cfg.title || '📱 MANDO GIROSCOPIO QR',
          onStartReady: function () {}
        });
        ACTIVE_BRIDGE_LOBBY = lobby;
      } else if (typeof lobby.forceShow === 'function') {
        lobby.forceShow();
      }
    }
    if (btnEl) btnEl.onclick = openQr;

    function openWs() {
      if (!window.WebSocket || typeof window.getTvRacingWsUrl !== 'function') return;
      try {
        var ws = new WebSocket(window.getTvRacingWsUrl());
        ACTIVE_BRIDGE_WS = ws;
        ws.onopen = function () {
          if (ACTIVE_BRIDGE_WS !== ws) return;
          ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { roomId: roomId, roomName: ACTIVE_BRIDGE_GAME.toUpperCase(), user: { id: 'tv-gb-' + roomId, name: 'Smart TV', avatar: '🎮', color: '#22D3EE', isHost: true } }
          }));
          ws.send(JSON.stringify({
            type: 'GYRO_CONTROLLER_JOIN',
            payload: { roomId: roomId, role: 'display', deviceName: 'Smart TV Gyro', gameId: ACTIVE_BRIDGE_GAME }
          }));
        };
        ws.onmessage = function (ev) {
          if (ACTIVE_BRIDGE_WS !== ws) return;
          try {
            var msg = JSON.parse(ev.data);
            if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
              hasCtrl = Boolean(msg.payload.hasController);
              updateBtn();
              if (lobby) lobby.onStatus(msg.payload.controllers || []);
            } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload && msg.payload.playerSlot !== 2) {
              var p = msg.payload;
              pad.steer = typeof p.steer === 'number' ? p.steer : 0;
              pad.pitch = typeof p.pitch === 'number' ? p.pitch : 0;
              pad.roll = typeof p.roll === 'number' ? p.roll : 0;
              pad.swing = typeof p.swing === 'number' ? p.swing : 0;
              pad.throttle = typeof p.throttle === 'number' ? p.throttle : 0;
              pad.brake = typeof p.brake === 'number' ? p.brake : 0;
              pad.nitro = Boolean(p.nitro);
              pad.handbrake = Boolean(p.handbrake);
              pad.expiresAt = Date.now() + 1400;
            }
          } catch (e) {}
        };
        ws.onclose = function () {
          if (ACTIVE_BRIDGE_WS === ws && window.TV_GAME_ACTIVE === ACTIVE_BRIDGE_GAME) {
            setTimeout(function () { if (window.TV_GAME_ACTIVE === ACTIVE_BRIDGE_GAME) openWs(); }, 2500);
          }
        };
      } catch (e) {}
    }
    openWs();

    return {
      isActive: function () { return Date.now() < pad.expiresAt; },
      getPad: function () { return pad; },
      showQr: openQr,
      close: closeTvGyroBridge
    };
  }

  function drawTvCrtOverlay(ctx, w, h, intensity) {
    if (!ctx || !w || !h) return;
    var a = typeof intensity === 'number' ? intensity : 0.16;
    if (a <= 0.01) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (a * 0.65).toFixed(3) + ')';
    for (var y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }
    var vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.34, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.45, a * 1.45).toFixed(3) + ')');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawTvGlowLight(ctx, x, y, rad, rgb, alpha) {
    if (!ctx || !rad || rad <= 0) return;
    var r = rad;
    var a = typeof alpha === 'number' ? alpha : 0.45;
    var col = rgb || '56,189,248';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + col + ',' + Math.min(0.95, a).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.38).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTvSpeedlines(ctx, w, h, intensity, timeSec, col) {
    if (!ctx || !w || !h) return;
    var k = Math.max(0, Math.min(1, typeof intensity === 'number' ? intensity : 0.5));
    if (k < 0.08) return;
    var cx = w * 0.5;
    var cy = h * 0.5;
    var maxR = Math.max(w, h) * 0.68;
    var t = (timeSec || 0) * 14;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col || '#38BDF8';
    ctx.lineCap = 'round';
    var count = 24;
    for (var i = 0; i < count; i++) {
      var ang = (i / count) * Math.PI * 2 + Math.sin(i * 7.3) * 0.1;
      var phase = (t + i * 1.37) % 3;
      var r0 = maxR * (0.44 + (phase / 3) * 0.14);
      var r1 = r0 + (45 + k * 135);
      ctx.globalAlpha = (0.14 + 0.34 * k) * (1 - phase / 3.4);
      ctx.lineWidth = 1.5 + k * 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTvDirectionalBall(ctx, cx, cy, r, lx, ly, alpha) {
    if (!ctx || !r || r <= 1) return;
    var dx = (lx || 0) - cx;
    var dy = (ly || 0) - cy;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / len;
    var ny = dy / len;
    var a = typeof alpha === 'number' ? alpha : 0.72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    var sh = ctx.createRadialGradient(cx + nx * r * 0.42, cy + ny * r * 0.42, r * 0.1, cx - nx * r * 0.25, cy - ny * r * 0.25, r * 1.4);
    sh.addColorStop(0, 'rgba(255,255,255,' + (0.42 * a).toFixed(3) + ')');
    sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(2,6,23,' + (0.48 * a).toFixed(3) + ')');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2);
    ctx.beginPath();
    ctx.arc(cx + nx * r * 0.38, cy + ny * r * 0.38, Math.max(1.5, r * 0.24), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.62 * a).toFixed(3) + ')';
    ctx.fill();
    ctx.restore();
  }

  function drawTvCameraFlashes(ctx, w, topY, botY, timeSec, excite) {
    if (!ctx || !w) return;
    var span = Math.max(12, (botY || 120) - (topY || 0));
    var t = timeSec || 0;
    var n = excite ? 18 : 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var bucket = Math.floor(t * (excite ? 6 : 3) + i * 2.13);
      var h = Math.sin(bucket * 12.9898 + i * 78.233) * 43758.5453;
      var frac = h - Math.floor(h);
      if (frac > (excite ? 0.42 : 0.22)) continue;
      var fx = ((Math.sin(bucket * 4.1 + i * 19.7) * 0.5 + 0.5) * (w - 40)) + 20;
      var fy = (topY || 0) + ((Math.cos(bucket * 3.3 + i * 11.1) * 0.5 + 0.5) * span);
      var rad = (excite ? 16 : 10) + frac * 14;
      var g = ctx.createRadialGradient(fx, fy, 0, fx, fy, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.35, 'rgba(186,230,253,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTvNebulaLayer(ctx, w, h, timeSec, theme) {
    if (!ctx || !w || !h) return;
    var t = timeSec || 0;
    ctx.save();
    if (theme === 'sky') {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (var c = 0; c < 4; c++) {
        var cx = ((w + 260) - ((t * (18 + c * 7) + c * 280) % (w + 260))) - 80;
        var cy = 58 + c * 42 + Math.sin(t + c) * 8;
        ctx.beginPath();
        ctx.arc(cx, cy, 34 + (c % 2) * 10, 0, Math.PI * 2);
        ctx.arc(cx + 32, cy - 10, 28, 0, Math.PI * 2);
        ctx.arc(cx + 62, cy + 2, 24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    var cols = theme === 'cyber'
      ? ['56,189,248', '168,85,247', '34,211,238']
      : ['99,102,241', '236,72,153', '14,165,233'];
    for (var i = 0; i < 3; i++) {
      var bx = w * (0.25 + i * 0.25) + Math.sin(t * (0.22 + i * 0.08) + i * 2) * (w * 0.09);
      var by = h * (0.3 + (i % 2) * 0.35) + Math.cos(t * (0.19 + i * 0.06) + i) * (h * 0.08);
      var rr = Math.min(w, h) * (0.34 + (i % 2) * 0.1);
      var ng = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      ng.addColorStop(0, 'rgba(' + cols[i] + ',0.13)');
      ng.addColorStop(0.55, 'rgba(' + cols[i] + ',0.04)');
      ng.addColorStop(1, 'rgba(' + cols[i] + ',0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(bx, by, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  window.resolveTvGameAssetUrl = resolveSpriteUrl;
  window.getTvGameSprite = getTvGameSprite;
  window.preloadTvGameSprites = preloadTvGameSprites;
  window.drawTvSprite = drawTvSprite;
  window.drawTvSpriteRect = drawTvSpriteRect;
  window.drawTvTiledBg = drawTvTiledBg;
  window.playTvZzfxPreset = playTvZzfxPreset;
  window.buildTvVolanteUrl = buildTvVolanteUrl;
  window.createTvDualQrLobby = createTvDualQrLobby;
  window.connectTvGyroBridge = connectTvGyroBridge;
  window.closeTvGyroBridge = closeTvGyroBridge;
  window.drawTvCrtOverlay = drawTvCrtOverlay;
  window.drawTvGlowLight = drawTvGlowLight;
  window.drawTvSpeedlines = drawTvSpeedlines;
  window.drawTvDirectionalBall = drawTvDirectionalBall;
  window.drawTvCameraFlashes = drawTvCameraFlashes;
  window.drawTvNebulaLayer = drawTvNebulaLayer;
})();

