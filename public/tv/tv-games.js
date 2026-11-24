// ===================================================================
// SMART TV ARCADE HUB CATALOG & DISPATCHER (STRICT ES5, <= 700 LOC)
// Renders 19 HD Smart TV & Mobile 1P/2P Gyro Games
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
    if (TV_GAME_CTX_AUDIO.state === 'suspended' && TV_GAME_CTX_AUDIO.resume) TV_GAME_CTX_AUDIO.resume();
    var osc = TV_GAME_CTX_AUDIO.createOscillator();
    var g = TV_GAME_CTX_AUDIO.createGain();
    osc.type = typeName || 'sine';
    osc.frequency.value = freq || 440;
    g.gain.value = gainVal || 0.08;
    osc.connect(g); g.connect(TV_GAME_CTX_AUDIO.destination);
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

function getVisibleOverlayButtons(scr) {
  if (!scr) return null;
  var ovs = scr.querySelectorAll('.tv-dual-qr-overlay, .tv-game-finish-overlay');
  for (var i = 0; i < ovs.length; i++) {
    var ov = ovs[i];
    if (ov.style.display !== 'none' && ov.offsetWidth > 0 && ov.offsetHeight > 0) {
      var raw = ov.querySelectorAll('button');
      var vis = [];
      for (var j = 0; j < raw.length; j++) {
        if (!raw[j].disabled && raw[j].offsetWidth > 0 && raw[j].offsetHeight > 0) vis.push(raw[j]);
      }
      if (vis.length) return vis;
    }
  }
  return null;
}

function handleTvGameKeyDown(e) {
  if (!TV_GAME_ACTIVE) return false;
  var code = e.keyCode || e.which;
  if (code === 27 || code === 8 || code === 4 || code === 10009 || code === 461) {
    if (e.preventDefault) e.preventDefault();
    closeTvGame();
    return true;
  }
  var scr = document.getElementById('tv-games-screen');
  var ovBtns = getVisibleOverlayButtons(scr);
  var activeEl = document.activeElement;
  if (ovBtns) {
    var idx = -1;
    for (var k = 0; k < ovBtns.length; k++) {
      if (ovBtns[k] === activeEl) { idx = k; break; }
    }
    if (code === 37 || code === 21 || code === 38 || code === 19) {
      if (e.preventDefault) e.preventDefault();
      var prevBtn = idx > 0 ? ovBtns[idx - 1] : ovBtns[ovBtns.length - 1];
      if (prevBtn && prevBtn.focus) prevBtn.focus();
      return true;
    }
    if (code === 39 || code === 22 || code === 40 || code === 20) {
      if (e.preventDefault) e.preventDefault();
      var nextBtn = (idx >= 0 && idx + 1 < ovBtns.length) ? ovBtns[idx + 1] : ovBtns[0];
      if (nextBtn && nextBtn.focus) nextBtn.focus();
      return true;
    }
    if (code === 13 || code === 23 || code === 66 || code === 32) {
      if (e.preventDefault) e.preventDefault();
      var targetBtn = idx >= 0 ? ovBtns[idx] : (scr.querySelector('#tv-dqr-solo') || ovBtns[0]);
      if (targetBtn && targetBtn.click) targetBtn.click();
      return true;
    }
    return true;
  }
  var topbar = scr ? scr.querySelector('.tv-game-topbar') : null;
  if (topbar && activeEl && topbar.contains(activeEl)) {
    if (code === 13 || code === 23 || code === 66) {
      if (e.preventDefault) e.preventDefault();
      if (activeEl.click) activeEl.click();
      return true;
    }
    if (code === 40 || code === 20) {
      if (e.preventDefault) e.preventDefault();
      if (activeEl.blur) activeEl.blur();
      var arena = scr.querySelector('.tv-game-arena');
      if (arena) { arena.tabIndex = -1; if (arena.focus) arena.focus(); }
      return true;
    }
  }
  if (tvGameKeyHandler) return tvGameKeyHandler(e, code);
  return false;
}
window.handleTvGameKeyDown = handleTvGameKeyDown;

function handleTvGameKeyUp(e) {
  if (!TV_GAME_ACTIVE) return false;
  var code = e.keyCode || e.which;
  if (tvGameKeyUpHandler) return tvGameKeyUpHandler(e, code);
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
  if (TV_GAME_ACTIVE === 'headsoccer' && typeof window.closeTvSoccerGame === 'function') {
    window.closeTvSoccerGame();
  }
  if ((TV_GAME_ACTIVE === 'gyrohockey' || TV_GAME_ACTIVE === 'gyrospace') && typeof window.closeTvGyroArcadeGame === 'function') {
    window.closeTvGyroArcadeGame();
  }
  if ((TV_GAME_ACTIVE === 'gyrobowling' || TV_GAME_ACTIVE === 'gyrotennis' || TV_GAME_ACTIVE === 'gyrolab') && typeof window.closeTvGyroPlusGame === 'function') {
    window.closeTvGyroPlusGame();
  }
  if (TV_GAME_ACTIVE === 'pingpong' && typeof window.closeTvPingPongGame === 'function') {
    window.closeTvPingPongGame();
  }
  if (TV_GAME_ACTIVE === 'soccerpong' && typeof window.closeTvSoccerPongGame === 'function') {
    window.closeTvSoccerPongGame();
  }
  if (TV_GAME_ACTIVE === 'penalty' && typeof window.closeTvPenaltyGame === 'function') {
    window.closeTvPenaltyGame();
  }
  if (TV_GAME_ACTIVE === 'tvtrivia' && typeof window.closeTvTriviaGame === 'function') {
    window.closeTvTriviaGame();
  }
  if (typeof window.closeTvRetroGame === 'function') {
    window.closeTvRetroGame();
  }
  if (typeof window.closeTvGyroBridge === 'function') {
    window.closeTvGyroBridge();
  }
  TV_GAME_ACTIVE = '';
  var scr = document.getElementById('tv-games-screen');
  if (scr) { scr.style.display = 'none'; scr.innerHTML = ''; }
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

function getTvCardSvg(gameId) {
  if (gameId === 'racing3d') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<defs><linearGradient id="gR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient></defs>' +
      '<polygon points="18,92 84,16 156,16 222,92" fill="#0B1120" stroke="#38BDF8" stroke-width="1.5"/>' +
      '<line x1="120" y1="18" x2="120" y2="92" stroke="#F8FAFC" stroke-width="2" stroke-dasharray="6 6"/>' +
      '<path d="M56,64 L78,38 L138,38 L156,64 Z" fill="url(#gR)" stroke="#22D3EE" stroke-width="2"/>' +
      '<rect x="52" y="62" width="108" height="14" rx="5" fill="#1E1B4B" stroke="#A78BFA" stroke-width="1.5"/>' +
      '<circle cx="72" cy="76" r="8" fill="#22D3EE"/><circle cx="142" cy="76" r="8" fill="#22D3EE"/>' +
      '<path d="M148,50 L166,30 L204,30 L218,50 Z" fill="#E11D48" stroke="#FDA4AF" stroke-width="1.5"/></svg>';
  }
  if (gameId === 'pingpong') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<polygon points="34,16 206,16 224,84 16,84" fill="#065F46" stroke="#FFFFFF" stroke-width="2.5"/>' +
      '<line x1="120" y1="16" x2="120" y2="84" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>' +
      '<rect x="24" y="45" width="192" height="5" fill="#F8FAFC"/>' +
      '<ellipse cx="70" cy="64" rx="18" ry="14" fill="#0284C7" stroke="#E0F2FE" stroke-width="2"/>' +
      '<ellipse cx="172" cy="30" rx="15" ry="11" fill="#E11D48" stroke="#FFE4E6" stroke-width="2"/>' +
      '<circle cx="122" cy="40" r="7" fill="#FACC15" stroke="#FFF" stroke-width="1.5"/></svg>';
  }
  if (gameId === 'soccerpong') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect width="240" height="92" fill="#DDD2AF"/>' +
      '<rect x="22" y="14" width="196" height="64" fill="#63B836"/>' +
      '<rect x="22" y="27" width="196" height="12" fill="#529E2A"/><rect x="22" y="52" width="196" height="12" fill="#529E2A"/>' +
      '<rect x="26" y="18" width="188" height="56" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>' +
      '<line x1="120" y1="18" x2="120" y2="74" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>' +
      '<circle cx="120" cy="46" r="13" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>' +
      '<rect x="26" y="7" width="44" height="9" rx="2" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="74" y="7" width="44" height="9" rx="2" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="122" y="7" width="44" height="9" rx="2" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="170" y="7" width="44" height="9" rx="2" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="26" y="76" width="44" height="9" rx="2" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="74" y="76" width="44" height="9" rx="2" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="122" y="76" width="44" height="9" rx="2" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="170" y="76" width="44" height="9" rx="2" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1"/>' +
      '<rect x="16" y="12" width="7" height="68" rx="2" fill="#78350F"/><rect x="217" y="12" width="7" height="68" rx="2" fill="#78350F"/>' +
      '<rect x="7" y="37" width="16" height="18" rx="2" fill="#F8FAFC" stroke="#78350F" stroke-width="1.5"/><text x="15" y="50" text-anchor="middle" font-size="11" font-weight="900" fill="#1E293B">6</text>' +
      '<rect x="217" y="37" width="16" height="18" rx="2" fill="#F8FAFC" stroke="#78350F" stroke-width="1.5"/><text x="225" y="50" text-anchor="middle" font-size="11" font-weight="900" fill="#1E293B">4</text>' +
      '<rect x="38" y="32" width="12" height="28" rx="3" fill="#2563EB"/><rect x="190" y="35" width="12" height="28" rx="3" fill="#EF4444"/>' +
      '<circle cx="136" cy="46" r="7.5" fill="#F8FAFC" stroke="#0F172A" stroke-width="1.5"/></svg>';
  }
  if (gameId === 'gyrohockey') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="18" y="8" width="204" height="76" rx="12" fill="#071226" stroke="#22D3EE" stroke-width="2.5"/>' +
      '<line x1="120" y1="8" x2="120" y2="84" stroke="#7C3AED" stroke-width="2" stroke-dasharray="4 4"/>' +
      '<circle cx="120" cy="46" r="18" fill="none" stroke="rgba(56,189,248,0.45)" stroke-width="2"/>' +
      '<circle cx="64" cy="46" r="16" fill="#0284C7" stroke="#22D3EE" stroke-width="3"/>' +
      '<circle cx="176" cy="46" r="16" fill="#E11D48" stroke="#FDA4AF" stroke-width="3"/>' +
      '<circle cx="120" cy="46" r="8" fill="#FDE047" stroke="#FFF" stroke-width="1.5"/></svg>';
  }
  if (gameId === 'gyrospace') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<circle cx="34" cy="22" r="2" fill="#BAE6FD"/><circle cx="195" cy="18" r="2.5" fill="#FDE047"/><circle cx="212" cy="70" r="2" fill="#E9D5FF"/>' +
      '<polygon points="94,14 128,74 106,64 94,76 82,64 60,74" fill="#2563EB" stroke="#22D3EE" stroke-width="2.5"/>' +
      '<polygon points="158,20 186,74 166,65 158,76 150,65 130,74" fill="#EA580C" stroke="#FDBA74" stroke-width="2"/>' +
      '<rect x="92" y="4" width="4" height="16" rx="2" fill="#38BDF8"/><rect x="156" y="8" width="4" height="16" rx="2" fill="#FB7185"/></svg>';
  }
  if (gameId === 'gyrobowling' || gameId === 'gyrotennis' || gameId === 'gyrolab' || gameId === 'headsoccer' || gameId === 'penalty') {
    var imgName = gameId === 'gyrobowling'
      ? 'assets/games/arenas/bowling_alley.jpg'
      : gameId === 'gyrotennis'
      ? 'assets/games/arenas/tennis_court.jpg'
      : gameId === 'gyrolab'
      ? 'assets/games/arenas/labyrinth_board.jpg'
      : gameId === 'penalty'
      ? 'assets/games/penalty/stadium_backdrop.jpg'
      : 'assets/games/arenas/soccer_stadium.jpg';
    var resolvedSrc = typeof window.resolveTvGameAssetUrl === 'function'
      ? window.resolveTvGameAssetUrl(imgName)
      : ('/' + imgName);
    return '<img src="' + resolvedSrc + '" alt="" crossorigin="anonymous" />';
  }
  if (gameId === 'tetris') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="70" y="14" width="22" height="22" rx="3" fill="#22D3EE"/><rect x="94" y="14" width="22" height="22" rx="3" fill="#22D3EE"/>' +
      '<rect x="118" y="14" width="22" height="22" rx="3" fill="#22D3EE"/><rect x="142" y="14" width="22" height="22" rx="3" fill="#22D3EE"/>' +
      '<rect x="82" y="42" width="22" height="22" rx="3" fill="#A855F7"/><rect x="58" y="64" width="22" height="22" rx="3" fill="#A855F7"/>' +
      '<rect x="82" y="64" width="22" height="22" rx="3" fill="#A855F7"/><rect x="106" y="64" width="22" height="22" rx="3" fill="#A855F7"/>' +
      '<rect x="148" y="42" width="22" height="22" rx="3" fill="#FACC15"/><rect x="172" y="42" width="22" height="22" rx="3" fill="#FACC15"/>' +
      '<rect x="148" y="64" width="22" height="22" rx="3" fill="#FACC15"/><rect x="172" y="64" width="22" height="22" rx="3" fill="#FACC15"/></svg>';
  }
  if (gameId === 'hextris') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<polygon points="120,10 156,28 156,64 120,82 84,64 84,28" fill="#1E293B" stroke="#38BDF8" stroke-width="3.5"/>' +
      '<polygon points="120,24 140,35 140,57 120,68 100,57 100,35" fill="#7C3AED" stroke="#F43F5E" stroke-width="2.5"/>' +
      '<rect x="44" y="38" width="24" height="14" rx="3" fill="#22C55E"/><rect x="172" y="38" width="24" height="14" rx="3" fill="#FACC15"/></svg>';
  }
  if (gameId === 'game2048') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="52" y="10" width="42" height="32" rx="6" fill="#EEE4DA"/><text x="73" y="32" text-anchor="middle" font-size="14" font-weight="900" fill="#1E293B">2</text>' +
      '<rect x="100" y="10" width="42" height="32" rx="6" fill="#F2B179"/><text x="121" y="32" text-anchor="middle" font-size="14" font-weight="900" fill="#FFF">8</text>' +
      '<rect x="148" y="10" width="42" height="32" rx="6" fill="#F65E3B"/><text x="169" y="32" text-anchor="middle" font-size="14" font-weight="900" fill="#FFF">64</text>' +
      '<rect x="52" y="48" width="42" height="32" rx="6" fill="#EDCF72"/><text x="73" y="70" text-anchor="middle" font-size="13" font-weight="900" fill="#FFF">512</text>' +
      '<rect x="100" y="48" width="90" height="32" rx="6" fill="#22C55E"/><text x="145" y="70" text-anchor="middle" font-size="16" font-weight="900" fill="#FFF">2048</text></svg>';
  }
  if (gameId === 'pacman') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="18" y="10" width="204" height="72" rx="10" fill="#060D24" stroke="#2563EB" stroke-width="3"/>' +
      '<path d="M72,46 L94,30 A24,24 0 1,0 94,62 Z" fill="#FACC15"/>' +
      '<circle cx="118" cy="46" r="4" fill="#FDE68A"/><circle cx="140" cy="46" r="4" fill="#FDE68A"/>' +
      '<path d="M164,46 A16,16 0 0,1 196,46 V64 H164 Z" fill="#F43F5E"/>' +
      '<circle cx="174" cy="43" r="3.5" fill="#FFF"/><circle cx="186" cy="43" r="3.5" fill="#FFF"/></svg>';
  }
  if (gameId === 'bomberman') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="34" y="14" width="38" height="38" rx="6" fill="#B45309" stroke="#78350F" stroke-width="2"/>' +
      '<rect x="168" y="40" width="38" height="38" rx="6" fill="#B45309" stroke="#78350F" stroke-width="2"/>' +
      '<circle cx="120" cy="52" r="22" fill="#0F172A" stroke="#38BDF8" stroke-width="2.5"/>' +
      '<path d="M126,31 Q136,18 148,22" fill="none" stroke="#FACC15" stroke-width="3"/>' +
      '<circle cx="152" cy="22" r="7" fill="#F97316"/><circle cx="152" cy="22" r="3.5" fill="#FEF08A"/></svg>';
  }
  if (gameId === 'flappy') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="162" y="0" width="28" height="30" fill="#22C55E" stroke="#14532D" stroke-width="2"/>' +
      '<rect x="162" y="64" width="28" height="28" fill="#22C55E" stroke="#14532D" stroke-width="2"/>' +
      '<ellipse cx="96" cy="46" rx="19" ry="15" fill="#FACC15" stroke="#0F172A" stroke-width="2.5"/>' +
      '<circle cx="104" cy="41" r="5" fill="#FFF"/><circle cx="106" cy="41" r="2" fill="#000"/>' +
      '<polygon points="113,44 126,48 113,52" fill="#F97316"/></svg>';
  }
  if (gameId === 'arkanoid') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="32" y="12" width="40" height="12" rx="2" fill="#F43F5E"/><rect x="78" y="12" width="40" height="12" rx="2" fill="#F97316"/>' +
      '<rect x="124" y="12" width="40" height="12" rx="2" fill="#22C55E"/><rect x="170" y="12" width="40" height="12" rx="2" fill="#38BDF8"/>' +
      '<circle cx="128" cy="48" r="7" fill="#FDE047"/>' +
      '<rect x="76" y="72" width="88" height="11" rx="5" fill="#7C3AED" stroke="#38BDF8" stroke-width="2"/></svg>';
  }
  if (gameId === 'invaders') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="54" y="16" width="24" height="16" rx="2" fill="#F43F5E"/><rect x="108" y="16" width="24" height="16" rx="2" fill="#A855F7"/>' +
      '<rect x="162" y="16" width="24" height="16" rx="2" fill="#F43F5E"/><rect x="80" y="40" width="24" height="16" rx="2" fill="#22D3EE"/>' +
      '<rect x="136" y="40" width="24" height="16" rx="2" fill="#22D3EE"/>' +
      '<rect x="104" y="72" width="32" height="11" fill="#38BDF8"/><rect x="117" y="64" width="6" height="9" fill="#FACC15"/></svg>';
  }
  if (gameId === 'hexgl') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<polygon points="36,92 104,22 136,22 204,92" fill="#131632" stroke="#7C3AED" stroke-width="2.5"/>' +
      '<polygon points="120,38 156,74 120,66 84,74" fill="#22D3EE" stroke="#FFF" stroke-width="2"/>' +
      '<polygon points="120,44 134,68 120,63 106,68" fill="#7C3AED"/></svg>';
  }
  if (gameId === 'tvtrivia') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="28" y="12" width="184" height="28" rx="8" fill="#312E81" stroke="#A78BFA" stroke-width="2"/>' +
      '<text x="120" y="31" text-anchor="middle" font-size="14" font-weight="900" fill="#FFF">QUIZ TV</text>' +
      '<rect x="28" y="48" width="88" height="16" rx="5" fill="#151D36" stroke="#38BDF8" stroke-width="1.5"/>' +
      '<rect x="124" y="48" width="88" height="16" rx="5" fill="#065F46" stroke="#34D399" stroke-width="1.5"/>' +
      '<rect x="28" y="69" width="88" height="16" rx="5" fill="#151D36" stroke="#38BDF8" stroke-width="1.5"/>' +
      '<rect x="124" y="69" width="88" height="16" rx="5" fill="#151D36" stroke="#38BDF8" stroke-width="1.5"/></svg>';
  }
  return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
    '<rect x="0" y="62" width="240" height="30" fill="#15803D"/>' +
    '<circle cx="42" cy="14" r="7" fill="rgba(254,240,138,0.4)"/><circle cx="198" cy="14" r="7" fill="rgba(254,240,138,0.4)"/>' +
    '<path d="M50,66 V14 H190 V66" fill="rgba(255,255,255,0.08)" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round"/>' +
    '<circle cx="164" cy="30" r="11" fill="none" stroke="#FACC15" stroke-width="2.5" stroke-dasharray="4 3"/>' +
    '<path d="M88,82 Q132,34 164,30" fill="none" stroke="#FACC15" stroke-width="2.5" stroke-dasharray="5 4"/>' +
    '<rect x="108" y="40" width="24" height="22" rx="5" fill="#DC2626"/>' +
    '<circle cx="120" cy="31" r="8" fill="#FDBA74"/>' +
    '<circle cx="88" cy="80" r="9" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/></svg>';
}

function renderTvGamesCatalogInto(container) {
  if (!container) return;
  container.innerHTML = '';

  var hero = document.createElement('div');
  hero.className = 'tv-games-hero';
  hero.innerHTML =
    '<div>' +
    '<div class="tv-game-badge" style="margin-bottom:8px;background:#4c1d95;">ARCADE SMART TV · 1P / 2P MÓVIL VERTICAL</div>' +
    '<div class="tv-games-hero-title">Juegos Interactivos HD en Pantalla Grande</div>' +
    '<div class="tv-games-hero-sub">Escanea el QR de Jugador 1 o Jugador 2 con tu móvil en vertical (entra directo sin código) o juega con el mando de tu Smart TV.</div>' +
    '</div>';
  container.appendChild(hero);

  var games = [
    {
      id: 'racing3d', cls: 'racing',
      badge: '3D Split Screen 2P · Volante QR',
      title: 'Nitro GP 3D · 1P / 2P',
      desc: 'Circuito 3D con pantalla dividida para 2 móviles simultáneos, turbos y derrapes con el volante horizontal.',
      cta: 'Arrancar Carrera 3D'
    },
    {
      id: 'pingpong', cls: 'pingpong',
      badge: 'Nuevo 2P Móvil · Raqueta Gyro',
      title: 'Ping Pong Pro 2P · Raqueta',
      desc: 'Usa 1 o 2 móviles como raqueta real con acelerómetro, efecto topspin y remates smash a 11 puntos.',
      cta: 'Jugar Ping Pong 2P'
    },
    {
      id: 'soccerpong', cls: 'soccerpong',
      badge: 'Estadio 3D · 1P / 2P Móvil',
      title: 'Fútbol Pong 3D · 1P / 2P',
      desc: 'Césped 3D con bloques de piedra, porterías de madera con marcador vivo, palas Azul vs Rojo y control desde el móvil o mando.',
      cta: 'Jugar Fútbol Pong 3D'
    },
    {
      id: 'penalty', cls: 'penalty',
      badge: 'Mundial 2P · 10 Países + Rosca',
      title: 'Penaltis Mundial Pro',
      desc: 'Elige entre 10 selecciones Top Mundiales, chuta desde el móvil con rosca y reloj de 8s o páralos en secreto (1P/2P).',
      cta: 'Jugar Penaltis'
    },
    {
      id: 'gyrohockey', cls: 'hockey',
      badge: '1P / 2P Móvil · Air Hockey Gyro',
      title: 'Neon Air Hockey Gyro',
      desc: 'Duelo de hockey neon a 60 FPS para 1 o 2 móviles simultáneos con Super Smash y chispas.',
      cta: 'Jugar Air Hockey'
    },
    {
      id: 'gyrospace', cls: 'space',
      badge: 'Cooperativo 2P · Nave Espacial',
      title: 'Galaxia Interceptor Gyro',
      desc: 'Pilota en solitario o con 2 móviles cooperativos esquivando meteoritos y alienígenas.',
      cta: 'Despegar Nave'
    },
    {
      id: 'gyrobowling', cls: 'bowling',
      badge: 'Nuevo 1P/2P · Giroscopio Real',
      title: 'Bolos Pro 3D Gyro',
      desc: 'Apunta inclinando tu móvil en vertical y lanza la bola con efecto hacia los 10 bolos en neón.',
      cta: 'Jugar a los Bolos'
    },
    {
      id: 'gyrotennis', cls: 'tennis',
      badge: 'Nuevo 2P · Raqueta Móvil',
      title: 'Tenis Slam Pro 2P',
      desc: 'Partido en estadio Grand Slam para 1 o 2 móviles simultáneos con globo y remate smash.',
      cta: 'Saltar a la Pista'
    },
    {
      id: 'gyrolab', cls: 'labyrinth',
      badge: 'Nuevo · Inclinación 2 Ejes',
      title: 'Laberinto Esfera 3D',
      desc: 'Inclina tu móvil en 2 ejes para rodar la esfera recogiendo estrellas sin caer en trampas.',
      cta: 'Resolver Laberinto'
    },
    {
      id: 'headsoccer', cls: 'soccer',
      badge: 'Estadio 2P · Mando + Móvil',
      title: 'Fútbol Cabezones Stadium TV',
      desc: 'Estadio HD real, goles limpios, balón con efecto y soporte para 2 móviles o mando TV.',
      cta: 'Saltar al Campo'
    },
    { id: 'bomberman', cls: 'bomberman', badge: '4 Jug. · Bots · Móvil Gyro', title: 'Bomberman Party Arena', desc: 'Laberinto con cajas destructibles, mejoras de llama, 3 bots rivales y soporte Móvil Gyro.', cta: 'Jugar Bomberman' },
    { id: 'pacman', cls: 'pacman', badge: 'Laberinto HD · Móvil Gyro', title: 'Pac-Man Arcade HD', desc: 'Laberinto clásico, píldoras de poder para cazar fantasmas y giroscopio desde el móvil.', cta: 'Jugar Pac-Man' },
    { id: 'tetris', cls: 'tetris', badge: 'Arcade Clásico · 7-Bag', title: 'Tetris Sprint TV', desc: 'Pieza fantasma, caída instantánea con OK y niveles de velocidad crecientes.', cta: 'Jugar Tetris' },
    { id: 'hextris', cls: 'hextris', badge: 'Puzzle Neon · Combos', title: 'Hextris Neon TV', desc: 'Gira el hexágono con ◀ ▶ y combina 3 colores iguales antes de desbordar.', cta: 'Jugar Hextris' },
    { id: 'game2048', cls: 'game2048', badge: 'Lógica · Con Deshacer OK', title: '2048 TV Edition', desc: 'Desliza fichas por el tablero 4×4, fusiona números hasta 2048 y supera tu récord.', cta: 'Jugar 2048' },
    { id: 'flappy', cls: 'flappy', badge: '1 Botón · Móvil Gyro', title: 'Clumsy Bird TV', desc: 'Vuela entre tuberías pulsando OK o agitando el móvil en modo Giroscopio.', cta: 'Volar Ahora' },
    { id: 'hexgl', cls: 'hexgl', badge: '3D Alta Velocidad · Móvil Gyro', title: 'HexGL Hover 3D', desc: 'Pilota tu deslizador anti-gravedad inclinando el móvil o el mando TV.', cta: 'Pilotar Nave' },
    { id: 'arkanoid', cls: 'arkanoid', badge: 'Multibola & Láser · Móvil Gyro', title: 'BrickIt / Arkanoid Neon', desc: 'Destruye muros de neón controlando la pala con el giroscopio del móvil o mando TV.', cta: 'Jugar Arkanoid' },
    { id: 'invaders', cls: 'invaders', badge: 'Retro 1978 · Móvil Gyro', title: 'Space Invaders Retro', desc: 'Escudos destructibles, formación alienígena y OVNIs con mando TV o giroscopio móvil.', cta: 'Defender Tierra' },
    { id: 'tvtrivia', cls: 'tvtrivia', badge: 'Concurso Sofá · 1-4 Jug.', title: 'Riffan TV Quiz Show', desc: 'Preguntas en español de Cine, Fútbol, Música y Ciencia con comodín 50/50.', cta: 'Abrir Concurso' }
  ];

  var grid = document.createElement('div');
  grid.className = 'tv-games-grid';

  for (var i = 0; i < games.length; i++) {
    (function (g) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tv-game-card' + (i < 4 ? ' tv-card-foil' : '');
      btn.tabIndex = 0;
      btn.setAttribute('data-tv-game', g.id);
      btn.innerHTML =
        '<div class="tv-game-card-stage ' + g.cls + '">' +
        '<div class="tv-game-badge-row"><span class="tv-game-badge">' + escapeHtml(g.badge) + '</span></div>' +
        '<div class="tv-game-icon-big">' + getTvCardSvg(g.id) + '</div>' +
        '</div>' +
        '<div class="tv-game-card-body">' +
        '<div class="tv-game-card-title">' + escapeHtml(g.title) + '</div>' +
        '<div class="tv-game-card-desc">' + escapeHtml(g.desc) + '</div>' +
        '<span class="tv-game-card-cta">' + escapeHtml(g.cta) + '</span>' +
        '</div>';
      btn.onclick = function () { lastHubFocusedEl = btn; openTvGame(g.id); };
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
    window.startTvRacingGame(scr); return;
  }
  if (gameId === 'pingpong' && typeof window.startTvPingPongGame === 'function') {
    window.startTvPingPongGame(scr); return;
  }
  if (gameId === 'soccerpong' && typeof window.startTvSoccerPongGame === 'function') {
    window.startTvSoccerPongGame(scr); return;
  }
  if (gameId === 'gyrohockey' && typeof window.startGyroHockeyGame === 'function') {
    window.startGyroHockeyGame(scr); return;
  }
  if (gameId === 'gyrospace' && typeof window.startGyroSpaceGame === 'function') {
    window.startGyroSpaceGame(scr); return;
  }
  if (gameId === 'gyrobowling' && typeof window.startGyroBowlingGame === 'function') {
    window.startGyroBowlingGame(scr); return;
  }
  if (gameId === 'gyrotennis' && typeof window.startGyroTennisGame === 'function') {
    window.startGyroTennisGame(scr); return;
  }
  if (gameId === 'gyrolab' && typeof window.startGyroLabGame === 'function') {
    window.startGyroLabGame(scr); return;
  }
  if (gameId === 'penalty' && typeof window.startPenaltyGame === 'function') {
    window.startPenaltyGame(scr); return;
  }
  if (gameId === 'tetris' && typeof window.startTetrisGame === 'function') { window.startTetrisGame(scr); return; }
  if (gameId === 'hextris' && typeof window.startHextrisGame === 'function') { window.startHextrisGame(scr); return; }
  if (gameId === 'game2048' && typeof window.startGame2048 === 'function') { window.startGame2048(scr); return; }
  if (gameId === 'pacman' && typeof window.startPacmanGame === 'function') { window.startPacmanGame(scr); return; }
  if (gameId === 'bomberman' && typeof window.startBombermanGame === 'function') { window.startBombermanGame(scr); return; }
  if (gameId === 'flappy' && typeof window.startFlappyGame === 'function') { window.startFlappyGame(scr); return; }
  if (gameId === 'arkanoid' && typeof window.startArkanoidGame === 'function') { window.startArkanoidGame(scr); return; }
  if (gameId === 'invaders' && typeof window.startInvadersGame === 'function') { window.startInvadersGame(scr); return; }
  if (gameId === 'hexgl' && typeof window.startHexGlGame === 'function') { window.startHexGlGame(scr); return; }
  if (gameId === 'tvtrivia' && typeof window.startTvTriviaGame === 'function') { window.startTvTriviaGame(scr); return; }
  if (typeof window.startHeadSoccerGame === 'function') {
    window.startHeadSoccerGame(scr);
  }
}
window.openTvGame = openTvGame;
