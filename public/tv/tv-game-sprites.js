// ===================================================================
// SMART TV GAME SPRITE LOADER & RENDER HELPERS (STRICT ES5)
// Caches CC0 sprites from assets/games/* with instant vector fallback
// ===================================================================
(function () {
  var CACHE = {};

  function resolveSpriteUrl(relPath) {
    var clean = String(relPath || '').replace(/^\/+/, '');
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      return './' + clean;
    }
    return '/' + clean;
  }

  function getTvGameSprite(relPath) {
    if (!relPath) return null;
    var entry = CACHE[relPath];
    if (!entry) {
      var img = new Image();
      entry = { img: img, failed: false };
      img.onerror = function () { entry.failed = true; };
      img.src = resolveSpriteUrl(relPath);
      CACHE[relPath] = entry;
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

    function markReady() {
      if (ready) return;
      ready = true;
      clearWaitTimer();
      if (overlay) overlay.style.display = 'none';
      if (typeof cfg.onStartReady === 'function') cfg.onStartReady();
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
      if (btnStart) btnStart.onclick = markReady;
      if (btnSolo) btnSolo.onclick = markReady;
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
        markReady();
      } else if ((p1Ready || p2Ready) && !ready && !waitTimer) {
        var left = 2;
        if (statusEl) statusEl.textContent = '✓ Mando conectado · Esperando J2 (' + left + 's) o pulsa Empezar...';
        waitTimer = setInterval(function () {
          left -= 1;
          if (left <= 0) markReady();
          else if (statusEl) statusEl.textContent = '✓ Mando conectado · Arrancando en ' + left + 's...';
        }, 1000);
      }
    }

    return {
      isReady: function () { return ready; },
      onStatus: onStatus,
      onRemoteBypass: markReady,
      forceShow: function () {
        ready = false;
        clearWaitTimer();
        if (overlay) overlay.style.display = 'flex';
      },
      destroy: function () {
        clearWaitTimer();
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
    };
  }

  window.getTvGameSprite = getTvGameSprite;
  window.preloadTvGameSprites = preloadTvGameSprites;
  window.drawTvSprite = drawTvSprite;
  window.drawTvSpriteRect = drawTvSpriteRect;
  window.drawTvTiledBg = drawTvTiledBg;
  window.playTvZzfxPreset = playTvZzfxPreset;
  window.buildTvVolanteUrl = buildTvVolanteUrl;
  window.createTvDualQrLobby = createTvDualQrLobby;
})();
