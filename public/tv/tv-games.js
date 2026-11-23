// ===================================================================
// SMART TV ARCADE HUB + PENALTIS MUNDIAL PRO (STRICT ES5, <= 700 LOC)
// Renders 5 vector-illustrated Smart TV & Gyro games + HD Penalty Arena
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

function handleTvGameKeyDown(e) {
  if (!TV_GAME_ACTIVE) return false;
  var code = e.keyCode || e.which;
  if (code === 27 || code === 8 || code === 4 || code === 10009 || code === 461) {
    if (e.preventDefault) e.preventDefault();
    closeTvGame();
    return true;
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
  if (TV_GAME_ACTIVE === 'tvtrivia' && typeof window.closeTvTriviaGame === 'function') {
    window.closeTvTriviaGame();
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
      '<polygon points="28,92 86,18 154,18 212,92" fill="#0f172a" stroke="#38BDF8" stroke-width="1.5"/>' +
      '<line x1="120" y1="22" x2="120" y2="92" stroke="#F8FAFC" stroke-width="2" stroke-dasharray="6 6"/>' +
      '<path d="M74,64 L92,40 L148,40 L166,64 Z" fill="#7C3AED" stroke="#22D3EE" stroke-width="2"/>' +
      '<rect x="68" y="62" width="104" height="14" rx="5" fill="#1E1B4B" stroke="#A78BFA" stroke-width="1.5"/>' +
      '<circle cx="84" cy="76" r="8" fill="#22D3EE"/><circle cx="156" cy="76" r="8" fill="#22D3EE"/>' +
      '<circle cx="120" cy="52" r="7" fill="#FACC15"/></svg>';
  }
  if (gameId === 'gyrohockey') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="18" y="8" width="204" height="76" rx="12" fill="#071226" stroke="#22D3EE" stroke-width="2.5"/>' +
      '<line x1="120" y1="8" x2="120" y2="84" stroke="#7C3AED" stroke-width="2" stroke-dasharray="4 4"/>' +
      '<circle cx="120" cy="46" r="18" fill="none" stroke="rgba(56,189,248,0.45)" stroke-width="2"/>' +
      '<circle cx="64" cy="46" r="16" fill="#7C3AED" stroke="#22D3EE" stroke-width="3"/>' +
      '<circle cx="176" cy="46" r="16" fill="#E11D48" stroke="#FDA4AF" stroke-width="3"/>' +
      '<circle cx="120" cy="46" r="8" fill="#FDE047" stroke="#FFF" stroke-width="1.5"/></svg>';
  }
  if (gameId === 'gyrospace') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<circle cx="34" cy="22" r="2" fill="#BAE6FD"/><circle cx="195" cy="18" r="2.5" fill="#FDE047"/><circle cx="212" cy="70" r="2" fill="#E9D5FF"/>' +
      '<polygon points="120,10 156,74 132,64 120,76 108,64 84,74" fill="#7C3AED" stroke="#22D3EE" stroke-width="2.5"/>' +
      '<ellipse cx="120" cy="40" rx="7" ry="13" fill="#E0F2FE"/>' +
      '<rect x="74" y="12" width="4" height="20" rx="2" fill="#38BDF8"/><rect x="162" y="12" width="4" height="20" rx="2" fill="#38BDF8"/>' +
      '<circle cx="48" cy="60" r="13" fill="#334155" stroke="#38BDF8" stroke-width="2"/>' +
      '<polygon points="196,30 212,48 180,48" fill="#E11D48" stroke="#FACC15" stroke-width="1.5"/></svg>';
  }
  if (gameId === 'headsoccer') {
    return '<svg viewBox="0 0 240 92" aria-hidden="true">' +
      '<rect x="0" y="68" width="240" height="24" fill="#14532D"/><rect x="0" y="68" width="240" height="3" fill="#4ADE80"/>' +
      '<circle cx="70" cy="46" r="19" fill="#9333EA" stroke="#0B0B0F" stroke-width="2.5"/>' +
      '<rect x="54" y="34" width="32" height="6" rx="2" fill="#FFF"/>' +
      '<circle cx="170" cy="46" r="19" fill="#E11D48" stroke="#0B0B0F" stroke-width="2.5"/>' +
      '<rect x="154" y="34" width="32" height="6" rx="2" fill="#FACC15"/>' +
      '<circle cx="120" cy="36" r="13" fill="#FFFFFF" stroke="#0F172A" stroke-width="2.5"/>' +
      '<polygon points="120,29 126,34 124,41 116,41 114,34" fill="#18181B"/></svg>';
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
    '<path d="M50,66 V14 H190 V66" fill="rgba(255,255,255,0.08)" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round"/>' +
    '<circle cx="164" cy="32" r="12" fill="none" stroke="#FACC15" stroke-width="2.5" stroke-dasharray="4 3"/>' +
    '<path d="M88,82 Q126,48 164,32" fill="none" stroke="#4ADE80" stroke-width="2.5" stroke-dasharray="5 4"/>' +
    '<rect x="108" y="42" width="24" height="20" rx="5" fill="#F97316"/>' +
    '<circle cx="120" cy="32" r="8" fill="#FDBA74"/>' +
    '<circle cx="88" cy="80" r="9" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/></svg>';
}

function renderTvGamesCatalogInto(container) {
  if (!container) return;
  container.innerHTML = '';

  var hero = document.createElement('div');
  hero.className = 'tv-games-hero';
  hero.innerHTML =
    '<div>' +
    '<div class="tv-game-badge" style="margin-bottom:8px;background:#4c1d95;">ARCADE SMART TV · MANDO + GIROSCOPIO MÓVIL</div>' +
    '<div class="tv-games-hero-title">Juegos Interactivos HD en Pantalla Grande</div>' +
    '<div class="tv-games-hero-sub">Controla con las flechas y OK del mando de tu tele, o escanea el QR para usar tu smartphone como volante, pala o nave giroscópica.</div>' +
    '</div>';
  container.appendChild(hero);

  var games = [
    {
      id: 'racing3d', cls: 'racing',
      badge: '3D Circuito · Volante Móvil QR',
      title: 'Nitro GP 3D · Coches con Móvil',
      desc: 'Circuito 3D fluido con turbos, partículas y motor pseudo-3D compatible con cualquier TV. Escanea el QR para usar el volante giroscópico.',
      cta: 'Arrancar Carrera 3D'
    },
    {
      id: 'gyrohockey', cls: 'hockey',
      badge: 'Nuevo · Air Hockey Giroscopio QR',
      title: 'Neon Air Hockey Gyro',
      desc: 'Duelo de hockey neon a 60 FPS con remate Super Smash, chispas y físicas reales. Inclina el móvil para mover tu pala o usa el mando TV.',
      cta: 'Jugar Air Hockey'
    },
    {
      id: 'gyrospace', cls: 'space',
      badge: 'Nuevo · Nave Espacial Gyro QR',
      title: 'Galaxia Interceptor Gyro',
      desc: 'Pilota tu caza espacial esquivando asteroides y naves alienígenas con láser doble e hiper-escudo usando el giroscopio del móvil.',
      cta: 'Despegar Nave'
    },
    {
      id: 'headsoccer', cls: 'soccer',
      badge: 'Estadio HD · Mando + Giroscopio',
      title: 'Fútbol Cabezones Stadium TV',
      desc: 'Goles de ángulo limpio sin rebotes fantasma, público animado, balón con efecto y control por mando TV o giroscopio móvil.',
      cta: 'Saltar al Campo'
    },
    {
      id: 'penalty', cls: 'penalty',
      badge: 'Mundial HD · Tanda de Penaltis',
      title: 'Penaltis Mundial Pro',
      desc: 'Tanda de 5 tiros y muerte súbita con focos de estadio, red 3D animada, efecto con rosca y rondas de tirador y portero.',
      cta: 'Jugar Penaltis'
    },
    { id: 'bomberman', cls: 'bomberman', badge: 'Arena 4 Jugadores · vs Bots', title: 'Bomberman Party Arena', desc: 'Laberinto con cajas destructibles, mejoras de llama y 3 bots rivales inteligentes.', cta: 'Jugar Bomberman' },
    { id: 'pacman', cls: 'pacman', badge: 'Laberinto HD · Fantasmas IA', title: 'Pac-Man Arcade HD', desc: 'Laberinto clásico, píldoras de poder para cazar fantasmas y giros suaves con el mando.', cta: 'Jugar Pac-Man' },
    { id: 'tetris', cls: 'tetris', badge: 'Arcade Clásico · 7-Bag', title: 'Tetris Sprint TV', desc: 'Pieza fantasma, caída instantánea con OK y niveles de velocidad crecientes.', cta: 'Jugar Tetris' },
    { id: 'hextris', cls: 'hextris', badge: 'Puzzle Neon · Combos', title: 'Hextris Neon TV', desc: 'Gira el hexágono con ◀ ▶ y combina 3 colores iguales antes de desbordar.', cta: 'Jugar Hextris' },
    { id: 'game2048', cls: 'game2048', badge: 'Lógica · Con Deshacer OK', title: '2048 TV Edition', desc: 'Desliza fichas por el tablero 4×4, fusiona números hasta 2048 y supera tu récord.', cta: 'Jugar 2048' },
    { id: 'flappy', cls: 'flappy', badge: '1 Botón · Toda la Familia', title: 'Clumsy Bird TV', desc: 'Vuela entre tuberías pulsando solo OK / ▲ y consigue medallas de Platino.', cta: 'Volar Ahora' },
    { id: 'hexgl', cls: 'hexgl', badge: '3D Alta Velocidad · Turbo', title: 'HexGL Hover 3D', desc: 'Pilota tu deslizador anti-gravedad a más de 1000 km/h esquivando barreras.', cta: 'Pilotar Nave' },
    { id: 'arkanoid', cls: 'arkanoid', badge: 'Multibola & Láser', title: 'BrickIt / Arkanoid Neon', desc: 'Destruye muros de neón recogiendo cápsulas de pala ancha, multibola y láser.', cta: 'Jugar Arkanoid' },
    { id: 'invaders', cls: 'invaders', badge: 'Retro 1978 · Oleadas + OVNI', title: 'Space Invaders Retro', desc: 'Escudos destructibles, formación alienígena y OVNIs misteriosos con el mando.', cta: 'Defender Tierra' },
    { id: 'tvtrivia', cls: 'tvtrivia', badge: 'Concurso Sofá · 1-4 Jug.', title: 'Riffan TV Quiz Show', desc: 'Preguntas en español de Cine, Fútbol, Música y Ciencia con comodín 50/50.', cta: 'Abrir Concurso' }
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
  if (gameId === 'gyrohockey' && typeof window.startGyroHockeyGame === 'function') {
    window.startGyroHockeyGame(scr); return;
  }
  if (gameId === 'gyrospace' && typeof window.startGyroSpaceGame === 'function') {
    window.startGyroSpaceGame(scr); return;
  }
  if (gameId === 'penalty') { startPenaltyGame(scr); return; }
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

// ===================================================================
// PENALTIS MUNDIAL PRO (HD FLOODLIT STADIUM + 3D NET + CONFETTI)
// ===================================================================
function startPenaltyGame(scr) {
  var bestScore = 0;
  try { bestScore = Number(localStorage.getItem(TV_PENALTY_BEST_KEY) || '0') || 0; } catch (e) {}

  scr.innerHTML =
    '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">⚽ Penaltis Mundial Pro</div></div><div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-green" id="pen-score-pill">TÚ 0 - 0 CPU</div>' +
    '<div class="tv-game-hud-pill accent-purple" id="pen-round-pill">RONDA 1/5 · TIRADOR</div>' +
    '<div class="tv-game-hud-pill" id="pen-best-pill">Récord: ' + bestScore + '</div></div></div>' +
    '<div class="tv-game-arena">' +
    '<canvas id="tv-penalty-canvas" class="tv-game-canvas" width="960" height="540"></canvas>' +
    '<div class="tv-game-finish-overlay" id="pen-finish-ov"><div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="pen-fin-title">¡CAMPEÓN!</div>' +
    '<div class="tv-game-finish-sub" id="pen-fin-sub">Resultado final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-pen-replay" class="tv-btn-primary" tabindex="0">Jugar otra tanda (OK)</button>' +
    '<button type="button" id="btn-pen-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Tirador: ◀ ▲ ▶ ▼ para apuntar en la portería + OK para chutar con efecto</span>' +
    '<span>Portero: ◀ Izquierda · ▲ Centro/Alto · ▶ Derecha para parar el tiro</span></div>';

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

  var goalLeft = 240, goalRight = 720, goalTop = 104, goalBottom = 304, spotX = 480, spotY = 468;
  var fans = [], sparks = [];
  for (var fi = 0; fi < 46; fi++) {
    fans.push({
      x: 20 + fi * 20.5, y: 184 + (fi % 3) * 18,
      c: ['#7C3AED', '#38BDF8', '#F43F5E', '#FACC15', '#22C55E'][fi % 5],
      ph: fi * 0.7
    });
  }

  var state = {
    role: 'kick', round: 1, myScore: 0, cpuScore: 0, myHistory: [], cpuHistory: [], phase: 'aim',
    aimX: 480, aimY: 196, powerPhase: 0, flightT: 0, targetX: 480, targetY: 190, curveDx: 0,
    keeperX: 480, keeperTargetX: 480, keeperDiveY: 0, bannerMsg: 'APUNTA CON LAS FLECHAS Y PULSA OK',
    bannerColor: '#FDE047', netWave: 0, resultTimer: 0, cpuWaitTimer: 0, cpuChosenZone: 0
  };

  function resetPenaltyMatch() {
    state.role = 'kick'; state.round = 1; state.myScore = 0; state.cpuScore = 0;
    state.myHistory = []; state.cpuHistory = []; state.phase = 'aim';
    state.aimX = 480; state.aimY = 196; state.keeperX = 480; state.keeperTargetX = 480;
    state.keeperDiveY = 0; state.netWave = 0; sparks = [];
    state.bannerMsg = 'APUNTA CON LAS FLECHAS Y PULSA OK'; state.bannerColor = '#FDE047';
    finOv.style.display = 'none'; syncHud();
  }
  document.getElementById('btn-pen-replay').onclick = resetPenaltyMatch;

  function syncHud() {
    scorePill.textContent = 'TÚ ' + state.myScore + ' - ' + state.cpuScore + ' CPU';
    var roundLabel = state.round > 5 ? 'MUERTE SÚBITA' : 'RONDA ' + state.round + '/5';
    roundPill.textContent = roundLabel + ' · ' + (state.role === 'kick' ? 'TIRADOR' : 'PORTERO');
  }

  function isMatchDecided() {
    if (state.round <= 5) {
      var myLeft = 5 - state.myHistory.length, cpuLeft = 5 - state.cpuHistory.length;
      if (state.myScore - state.cpuScore > cpuLeft || state.cpuScore - state.myScore > myLeft) return true;
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
      finOv.style.display = '-webkit-flex'; finOv.style.display = 'flex';
      var rBtn = document.getElementById('btn-pen-replay'); if (rBtn && rBtn.focus) rBtn.focus();
      return;
    }
    if (state.role === 'kick') {
      state.role = 'save'; state.phase = 'wait_save';
      state.keeperX = 480; state.keeperTargetX = 480; state.keeperDiveY = 0;
      state.cpuWaitTimer = 2.1; state.cpuChosenZone = Math.floor(Math.random() * 3) - 1;
      state.bannerMsg = 'ERES EL PORTERO · ELIGE ◀ ▲ ▶ ANTES DEL DISPARO'; state.bannerColor = '#38BDF8';
    } else {
      state.role = 'kick'; state.round += 1; state.phase = 'aim';
      state.aimX = 480; state.aimY = 196; state.keeperX = 480; state.keeperTargetX = 480; state.keeperDiveY = 0;
      state.bannerMsg = 'TU TURNO · APUNTA CON LAS FLECHAS Y CHUTA CON OK'; state.bannerColor = '#FDE047';
    }
    syncHud();
  }

  function shootPlayerBall() {
    if (state.phase !== 'aim') return;
    var pwr = 0.5 + 0.5 * Math.sin(state.powerPhase * 3.8);
    var spread = (1 - pwr) * 16;
    state.targetX = state.aimX + (Math.random() - 0.5) * spread;
    state.targetY = state.aimY + (Math.random() - 0.5) * spread * 0.7;
    state.curveDx = (480 - state.targetX) * 0.22;
    state.flightT = 0; state.phase = 'flight';
    var diveChoice = Math.random();
    state.keeperTargetX = diveChoice < 0.38 ? goalLeft + 58 : diveChoice < 0.76 ? goalRight - 58 : 480;
    state.keeperDiveY = Math.random() > 0.45 ? -22 : 6;
    playTvGameBeep(190, 0.12, 'triangle', 0.14);
  }

  function triggerSaveDive(dir) {
    if (state.phase !== 'wait_save') return;
    state.keeperTargetX = dir < 0 ? goalLeft + 62 : dir > 0 ? goalRight - 62 : 480;
    state.keeperDiveY = dir === 0 ? -18 : 6;
    var z = state.cpuChosenZone;
    state.targetX = z < 0 ? goalLeft + 52 + Math.random() * 55 : z > 0 ? goalRight - 52 - Math.random() * 55 : 440 + Math.random() * 80;
    state.targetY = goalTop + 34 + Math.random() * 115;
    state.curveDx = (480 - state.targetX) * 0.16;
    state.flightT = 0; state.phase = 'flight';
    playTvGameBeep(210, 0.11, 'triangle', 0.12);
  }

  function resolveShotOutcome() {
    var inGoalX = state.targetX >= goalLeft + 10 && state.targetX <= goalRight - 10;
    var inGoalY = state.targetY >= goalTop + 10 && state.targetY <= goalBottom - 8;
    var distToKeeper = Math.hypot(state.targetX - state.keeperX, state.targetY - (232 + state.keeperDiveY));
    var saved = inGoalX && inGoalY && distToKeeper < 64;
    var scored = inGoalX && inGoalY && !saved;

    if (state.role === 'kick') { state.myHistory.push(scored ? 'G' : 'X'); if (scored) state.myScore += 1; }
    else { state.cpuHistory.push(scored ? 'G' : 'X'); if (scored) state.cpuScore += 1; }

    if (scored) {
      state.netWave = 1;
      state.bannerMsg = state.role === 'kick' ? '⚽ ¡GOOOOLAZO MUNDIAL!' : '⚽ ¡GOL DE LA CPU!';
      state.bannerColor = '#4ADE80';
      for (var si = 0; si < 28; si++) {
        var ang = Math.random() * Math.PI * 2, spd = 90 + Math.random() * 240;
        sparks.push({ x: state.targetX, y: state.targetY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, c: ['#FACC15', '#4ADE80', '#38BDF8', '#FFF'][si % 4], l: 1.1 });
      }
      playTvGameBeep(523, 0.22, 'sawtooth', 0.09);
    } else if (saved) {
      state.bannerMsg = state.role === 'save' ? '🧤 ¡PARADÓN ESPECTACULAR!' : '🧤 ¡PARADA DEL PORTERO!';
      state.bannerColor = '#38BDF8';
      playTvGameBeep(310, 0.18, 'square', 0.08);
    } else {
      state.bannerMsg = '❌ ¡FUERA / AL LARGUERO!'; state.bannerColor = '#FB7185';
      playTvGameBeep(130, 0.22, 'sawtooth', 0.09);
    }
    state.phase = 'result'; state.resultTimer = 1.65; syncHud();
  }

  tvGameKeyHandler = function (e, code) {
    if (state.phase === 'finished') {
      if (code === 13 || code === 23 || code === 66 || code === 32) {
        if (e.preventDefault) e.preventDefault(); resetPenaltyMatch(); return true;
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
        if (e.preventDefault) e.preventDefault(); triggerSaveDive(0); return true;
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
    for (var sIdx = sparks.length - 1; sIdx >= 0; sIdx--) {
      sparks[sIdx].x += sparks[sIdx].vx * dt; sparks[sIdx].y += sparks[sIdx].vy * dt;
      sparks[sIdx].vy += 280 * dt; sparks[sIdx].l -= dt;
      if (sparks[sIdx].l <= 0) sparks.splice(sIdx, 1);
    }
    if (state.phase === 'wait_save') {
      state.cpuWaitTimer -= dt;
      if (state.cpuWaitTimer <= 0) triggerSaveDive(0);
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
    skyGrad.addColorStop(0, '#050918'); skyGrad.addColorStop(1, '#132046');
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, 960, 290);

    // Floodlight beams + stadium stands
    ctx.fillStyle = 'rgba(186, 230, 253, 0.08)';
    ctx.beginPath(); ctx.moveTo(140, 38); ctx.lineTo(350, 310); ctx.lineTo(20, 310); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(820, 38); ctx.lineTo(940, 310); ctx.lineTo(610, 310); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0c1428'; ctx.fillRect(0, 174, 960, 118);

    // Cheering stadium crowd silhouettes
    var jumpBoost = state.netWave > 0.1 ? 7 : 1.5;
    for (var fi = 0; fi < fans.length; fi++) {
      var fn = fans[fi], jy = Math.abs(Math.sin(state.powerPhase * (state.netWave > 0 ? 14 : 3.2) + fn.ph)) * jumpBoost;
      ctx.fillStyle = fn.c; ctx.beginPath(); ctx.arc(fn.x, fn.y - jy, 5.5, 0, Math.PI * 2); ctx.fill();
    }

    // Perimeter LED advertising board
    ctx.fillStyle = '#090d1c'; ctx.fillRect(0, 266, 960, 24);
    ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 2; ctx.strokeRect(0, 266, 960, 24);
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#38BDF8';
    ctx.fillText('COPA MUNDIAL PRO  ·  RIFFAN STADIUM HD  ·  PENALTY SHOOTOUT', 480, 282);

    // Light towers
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.arc(140, 38, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(820, 38, 12, 0, Math.PI * 2); ctx.fill();

    // Perspective Pitch Stripes + Penalty Arc
    var turf = ctx.createLinearGradient(0, 290, 0, 540);
    turf.addColorStop(0, '#0f6d34'); turf.addColorStop(1, '#168740');
    ctx.fillStyle = turf; ctx.fillRect(0, 290, 960, 250);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 326, 960, 34); ctx.fillRect(0, 400, 960, 42); ctx.fillRect(0, 480, 960, 46);

    ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 3;
    ctx.strokeRect(140, 296, 680, 196);
    ctx.beginPath(); ctx.arc(spotX, 342, 74, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(spotX, spotY, 5.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

    // 3D Back Net & Stanchions
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.fillRect(goalLeft + 22, goalTop + 14, goalRight - goalLeft - 44, goalBottom - goalTop - 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.4;
    for (var gx = goalLeft; gx <= goalRight; gx += 22) {
      var wave = state.netWave > 0 ? Math.sin(gx * 0.08 + state.powerPhase * 18) * state.netWave * 13 : 0;
      ctx.beginPath(); ctx.moveTo(gx, goalTop); ctx.quadraticCurveTo(gx + wave, (goalTop + goalBottom) / 2, gx, goalBottom); ctx.stroke();
    }
    for (var gy = goalTop; gy <= goalBottom; gy += 20) {
      var hWave = state.netWave > 0 ? Math.sin(gy * 0.1 + state.powerPhase * 20) * state.netWave * 11 : 0;
      ctx.beginPath(); ctx.moveTo(goalLeft, gy); ctx.quadraticCurveTo(480, gy + hWave, goalRight, gy); ctx.stroke();
    }

    // 3D Goalposts
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(goalLeft, goalBottom); ctx.lineTo(goalLeft, goalTop); ctx.lineTo(goalRight, goalTop); ctx.lineTo(goalRight, goalBottom); ctx.stroke();

    // Articulated Diving Goalkeeper
    var kx = state.keeperX, ky = 250 + state.keeperDiveY, diveTilt = (kx - 480) * 0.0022;
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(diveTilt);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(0, 36, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = state.role === 'save' ? '#0284C7' : '#EA580C'; ctx.fillRect(-20, -24, 40, 48);
    ctx.fillStyle = '#0F172A'; ctx.fillRect(-16, 22, 13, 18); ctx.fillRect(3, 22, 13, 18);
    ctx.fillStyle = '#FDBA74'; ctx.beginPath(); ctx.arc(0, -38, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-34, -12, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(34, -12, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Aiming Trajectory & Crosshair
    if (state.phase === 'aim' && state.role === 'kick') {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)'; ctx.lineWidth = 2.2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(spotX, spotY); ctx.quadraticCurveTo((spotX + state.aimX) / 2 + (480 - state.aimX) * 0.22, Math.min(spotY, state.aimY) - 48, state.aimX, state.aimY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(state.aimX, state.aimY, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(state.aimX - 30, state.aimY); ctx.lineTo(state.aimX + 30, state.aimY);
      ctx.moveTo(state.aimX, state.aimY - 30); ctx.lineTo(state.aimX, state.aimY + 30); ctx.stroke();

      var pVal = 0.5 + 0.5 * Math.sin(state.powerPhase * 3.8);
      ctx.fillStyle = '#0F172A'; ctx.fillRect(340, 502, 280, 14);
      ctx.fillStyle = pVal > 0.72 ? '#4ADE80' : '#FACC15'; ctx.fillRect(340, 502, 280 * pVal, 14);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.strokeRect(340, 502, 280, 14);
    }

    // Geodesic Spinning Ball
    var bx = spotX, by = spotY, bScale = 1;
    if (state.phase === 'flight' || state.phase === 'result') {
      var t = state.phase === 'result' ? 1 : state.flightT, inv = 1 - t;
      var ctrlX = (spotX + state.targetX) / 2 + state.curveDx, ctrlY = Math.min(spotY, state.targetY) - 48;
      bx = inv * inv * spotX + 2 * inv * t * ctrlX + t * t * state.targetX;
      by = inv * inv * spotY + 2 * inv * t * ctrlY + t * t * state.targetY;
      bScale = 1 - 0.52 * t;
    }
    var r = 18 * bScale;
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(bx, by + r + 5, r * 1.1, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(bx, by); ctx.rotate(state.flightT * 10);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#18181B'; ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    for (var s2 = 0; s2 < sparks.length; s2++) {
      ctx.globalAlpha = Math.max(0, sparks[s2].l); ctx.fillStyle = sparks[s2].c;
      ctx.fillRect(sparks[s2].x - 3, sparks[s2].y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = state.bannerColor;
    ctx.fillText(state.bannerMsg, 480, 56);
    drawDots(190, 82, 'TÚ', state.myHistory); drawDots(610, 82, 'CPU', state.cpuHistory);
  }

  function drawDots(x0, y0, label, hist) {
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#CBD5E1';
    ctx.fillText(label, x0 - 42, y0 + 5);
    for (var i = 0; i < Math.max(5, hist.length); i++) {
      var v = hist[i];
      ctx.fillStyle = v === 'G' ? '#22C55E' : v === 'X' ? '#EF4444' : '#334155';
      ctx.beginPath(); ctx.arc(x0 + i * 24, y0, 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  resetPenaltyMatch();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
