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

  window.getTvGameSprite = getTvGameSprite;
  window.preloadTvGameSprites = preloadTvGameSprites;
  window.drawTvSprite = drawTvSprite;
  window.drawTvSpriteRect = drawTvSpriteRect;
  window.drawTvTiledBg = drawTvTiledBg;
  window.playTvZzfxPreset = playTvZzfxPreset;
})();
