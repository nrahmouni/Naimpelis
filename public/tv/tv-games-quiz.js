// ===================================================================
// SMART TV GAME SHOW: RIFFAN TV QUIZ SHOW (STRICT ES5, <= 680 LOC)
// 1-4 jugadores en sofá con el mismo mando TV · 45 preguntas en español
// ===================================================================
(function () {
  var QUESTIONS = [
    { cat: 'cine', q: '¿Qué director dirigió "Origen" e "Interstellar"?', opts: ['Christopher Nolan', 'Denis Villeneuve', 'Ridley Scott', 'Steven Spielberg'], ans: 0 },
    { cat: 'cine', q: '¿Cómo se llama el planeta natal de Luke Skywalker en Star Wars?', opts: ['Hoth', 'Naboo', 'Tatooine', 'Endor'], ans: 2 },
    { cat: 'cine', q: '¿Qué actor interpreta a Tony Stark / Iron Man?', opts: ['Chris Evans', 'Robert Downey Jr.', 'Mark Ruffalo', 'Paul Rudd'], ans: 1 },
    { cat: 'cine', q: '¿Cuál fue el primer largometraje de animación por ordenador de Pixar?', opts: ['Bichos', 'Monstruos S.A.', 'Toy Story', 'Buscando a Nemo'], ans: 2 },
    { cat: 'cine', q: '¿En qué serie aparece el restaurante "Los Pollos Hermanos"?', opts: ['The Wire', 'Breaking Bad', 'Narcos', 'Ozark'], ans: 1 },
    { cat: 'cine', q: '¿Qué película española ganó el Óscar a Mejor Película Extranjera en 1999?', opts: ['Todo sobre mi madre', 'Mar adentro', 'Volver', 'Tesis'], ans: 0 },
    { cat: 'cine', q: '¿Cuál es el nombre real del protagonista de "Matrix"?', opts: ['Morfeo', 'Trinity', 'Thomas Anderson', 'Cypher'], ans: 2 },
    { cat: 'cine', q: '¿Qué estudio japonés creó "El viaje de Chihiro"?', opts: ['Toei Animation', 'Studio Ghibli', 'Madhouse', 'Kyoto Animation'], ans: 1 },
    { cat: 'futbol', q: '¿En qué año ganó España su primer Mundial de fútbol masculino?', opts: ['2006', '2008', '2010', '2012'], ans: 2 },
    { cat: 'futbol', q: '¿Quién marcó el gol de España en la final del Mundial de Sudáfrica?', opts: ['Fernando Torres', 'David Villa', 'Andrés Iniesta', 'Xavi Hernández'], ans: 2 },
    { cat: 'futbol', q: '¿Qué club posee más títulos de la UEFA Champions League?', opts: ['AC Milan', 'FC Barcelona', 'Bayern Múnich', 'Real Madrid'], ans: 3 },
    { cat: 'futbol', q: '¿Qué futbolista ha ganado más Balones de Oro en la historia?', opts: ['Cristiano Ronaldo', 'Lionel Messi', 'Johan Cruyff', 'Michel Platini'], ans: 1 },
    { cat: 'futbol', q: '¿Cuál es el estadio del Athletic Club en Bilbao?', opts: ['Anoeta', 'Mestalla', 'San Mamés', 'El Sadar'], ans: 2 },
    { cat: 'futbol', q: '¿Cuántos minutos dura un partido reglamentario sin prórroga?', opts: ['80 minutos', '90 minutos', '100 minutos', '75 minutos'], ans: 1 },
    { cat: 'futbol', q: '¿Qué selección ganó la Eurocopa 2024 en Alemania?', opts: ['Francia', 'Inglaterra', 'España', 'Alemania'], ans: 2 },
    { cat: 'musica', q: '¿Qué cantante española lanzó el álbum "Motomami"?', opts: ['Aitana', 'Rosalía', 'Bad Gyal', 'Lola Índigo'], ans: 1 },
    { cat: 'musica', q: '¿De qué ciudad británica eran originarios The Beatles?', opts: ['Mánchester', 'Londres', 'Liverpool', 'Birmingham'], ans: 2 },
    { cat: 'musica', q: '¿Cuántas cuerdas tiene normalmente una guitarra española estándar?', opts: ['4', '5', '6', '8'], ans: 2 },
    { cat: 'musica', q: '¿Qué grupo español compuso "La Flaca"?', opts: ['Estopa', 'Jarabe de Palo', 'Fito & Fitipaldis', 'El Canto del Loco'], ans: 1 },
    { cat: 'musica', q: '¿Quién interpretó "Bohemian Rhapsody" como vocalista de Queen?', opts: ['Freddie Mercury', 'David Bowie', 'Elton John', 'George Michael'], ans: 0 },
    { cat: 'musica', q: '¿Qué instrumento tocaba principalmente Miles Davis?', opts: ['Saxofón', 'Piano', 'Trompeta', 'Batería'], ans: 2 },
    { cat: 'ciencia', q: '¿Cuál es el planeta más cercano al Sol?', opts: ['Venus', 'Mercurio', 'Marte', 'Tierra'], ans: 1 },
    { cat: 'ciencia', q: '¿Cuál es el símbolo químico del oro en la tabla periódica?', opts: ['Ag', 'Or', 'Au', 'Fe'], ans: 2 },
    { cat: 'ciencia', q: '¿Cuántos corazones tiene un pulpo?', opts: ['1', '2', '3', '4'], ans: 2 },
    { cat: 'ciencia', q: '¿Qué gas compone aproximadamente el 78% de la atmósfera terrestre?', opts: ['Oxígeno', 'Dióxido de carbono', 'Nitrógeno', 'Argón'], ans: 2 },
    { cat: 'ciencia', q: '¿Qué científica ganó dos premios Nobel en Física y Química?', opts: ['Rosalind Franklin', 'Marie Curie', 'Ada Lovelace', 'Jane Goodall'], ans: 1 },
    { cat: 'ciencia', q: '¿Cuál es el hueso más largo del cuerpo humano?', opts: ['Húmero', 'Tibia', 'Fémur', 'Radio'], ans: 2 },
    { cat: 'ciencia', q: '¿A qué velocidad aproximada viaja la luz en el vacío?', opts: ['300.000 km/s', '150.000 km/s', '30.000 km/s', '1.000 km/s'], ans: 0 },
    { cat: 'cultura', q: '¿En qué ciudad se encuentra el Museo del Prado?', opts: ['Barcelona', 'Madrid', 'Sevilla', 'Valencia'], ans: 1 },
    { cat: 'cultura', q: '¿Quién escribió "Don Quijote de la Mancha"?', opts: ['Lope de Vega', 'Miguel de Cervantes', 'Francisco de Quevedo', 'Calderón de la Barca'], ans: 1 },
    { cat: 'cultura', q: '¿Cuál es el río más caudaloso del mundo?', opts: ['Nilo', 'Misisipi', 'Amazonas', 'Yangtsé'], ans: 2 },
    { cat: 'cultura', q: '¿Qué océano separa Europa de América?', opts: ['Índico', 'Pacífico', 'Atlántico', 'Ártico'], ans: 2 },
    { cat: 'cultura', q: '¿En qué año llegó el ser humano a la Luna con el Apolo 11?', opts: ['1965', '1969', '1972', '1959'], ans: 1 },
    { cat: 'cultura', q: '¿Cuál es la capital de Japón?', opts: ['Kioto', 'Osaka', 'Tokio', 'Nagoya'], ans: 2 },
    { cat: 'cultura', q: '¿Quién pintó "El Guernica"?', opts: ['Salvador Dalí', 'Pablo Picasso', 'Joan Miró', 'Diego Velázquez'], ans: 1 },
    { cat: 'cine', q: '¿Cómo se llama el dragón de "Cómo entrenar a tu dragón"?', opts: ['Smaug', 'Desdentao', 'Mushu', 'Furia'], ans: 1 },
    { cat: 'futbol', q: '¿Qué país ha ganado más Copas del Mundo masculinas?', opts: ['Alemania', 'Italia', 'Argentina', 'Brasil'], ans: 3 },
    { cat: 'cultura', q: '¿Cuántos lados tiene un dodecágono?', opts: ['10', '12', '14', '20'], ans: 1 },
    { cat: 'musica', q: '¿Qué ciudad andaluza da nombre a la mítica canción de Sabina "Princesa" o de Los del Río "Macarena"?', opts: ['Sevilla', 'Granada', 'Málaga', 'Córdoba'], ans: 0 },
    { cat: 'ciencia', q: '¿Qué órgano del cuerpo humano produce la insulina?', opts: ['Hígado', 'Riñón', 'Páncreas', 'Estómago'], ans: 2 }
  ];

  var CAT_LABELS = {
    all: 'Todas',
    cine: 'Cine y Series',
    futbol: 'Fútbol',
    musica: 'Música',
    ciencia: 'Ciencia',
    cultura: 'Cultura'
  };

  function playSfx(freq, dur, kind, g) {
    if (typeof window.playTvGameBeep === 'function') window.playTvGameBeep(freq, dur, kind, g);
  }

  function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function startTvTriviaGame(scr) {
    var BEST_KEY = 'naim_tv_trivia_best_v1';
    var best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY) || '0') || 0; } catch (e) {}

    scr.innerHTML =
      '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
      '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
      '<div class="tv-game-top-title">🧠 Riffan TV Quiz Show</div></div><div class="tv-game-top-right">' +
      '<div class="tv-game-hud-pill accent-purple" id="qz-round">PREGUNTA 1/10</div>' +
      '<div class="tv-game-hud-pill accent-green" id="qz-turn">JUGADOR 1</div>' +
      '<div class="tv-game-hud-pill" id="qz-best">Récord: ' + best + '</div></div></div>' +
      '<div class="tv-game-arena" id="qz-stage" style="padding:24px;"></div>' +
      '<div class="tv-game-controls-hint">' +
      '<span>◀ ▲ ▶ ▼ para mover foco · OK para responder o elegir</span>' +
      '<span>Comodín 50/50 elimina 2 opciones falsas · Hasta 4 jugadores en sofá</span></div>';

    document.getElementById('btn-game-back').onclick = window.closeTvGame;
    var stage = document.getElementById('qz-stage');
    var roundEl = document.getElementById('qz-round');
    var turnEl = document.getElementById('qz-turn');
    var bestEl = document.getElementById('qz-best');

    var playerCount = 1, catFilter = 'all', players = [], deck = [], qIdx = 0, turnIdx = 0;
    var phase = 'setup', timeLeft = 15, locked = false, hiddenOpts = {}, focusIdx = 0;
    var timerInterval = null;

    function clearQuizTimers() {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }
    window.closeTvTriviaGame = clearQuizTimers;

    function renderSetup() {
      clearQuizTimers();
      phase = 'setup';
      roundEl.textContent = 'CONFIGURACIÓN';
      turnEl.textContent = 'MODO SOFÁ';
      stage.innerHTML =
        '<div style="width:100%;max-width:780px;background:#0e1427;border:2px solid rgba(167,139,250,0.45);border-radius:24px;padding:28px;color:#fff;">' +
        '<div style="font-size:26px;font-weight:900;margin-bottom:6px;">El Gran Concurso de la Tele</div>' +
        '<div style="font-size:15px;color:#94a3b8;margin-bottom:22px;">Elige cuántos jugáis en la habitación y vuestra temática favorita.</div>' +
        '<div style="font-size:13px;font-weight:800;color:#c4b5fd;margin-bottom:8px;">JUGADORES</div>' +
        '<div id="qz-pcount-row" style="display:-webkit-flex;display:flex;margin-bottom:20px;"></div>' +
        '<div style="font-size:13px;font-weight:800;color:#c4b5fd;margin-bottom:8px;">CATEGORÍA</div>' +
        '<div id="qz-cat-row" style="display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin-bottom:24px;"></div>' +
        '<button type="button" id="qz-start-btn" class="tv-btn-primary" tabindex="0" style="padding:14px 28px;font-size:18px;">Empezar Concurso (10 preguntas)</button>' +
        '</div>';

      var pRow = document.getElementById('qz-pcount-row');
      for (var p = 1; p <= 4; p++) {
        (function (cnt) {
          var b = document.createElement('button');
          b.type = 'button'; b.tabIndex = 0;
          b.className = playerCount === cnt ? 'tv-btn-primary' : 'tv-btn';
          b.style.marginRight = '10px';
          b.textContent = cnt === 1 ? '1 Jugador (Solo)' : cnt + ' Jugadores';
          b.onclick = function () { playerCount = cnt; renderSetup(); };
          pRow.appendChild(b);
        })(p);
      }

      var cRow = document.getElementById('qz-cat-row');
      var cats = ['all', 'cine', 'futbol', 'musica', 'ciencia', 'cultura'];
      for (var ci = 0; ci < cats.length; ci++) {
        (function (ck) {
          var b = document.createElement('button');
          b.type = 'button'; b.tabIndex = 0;
          b.className = catFilter === ck ? 'tv-btn-primary' : 'tv-btn';
          b.style.marginRight = '10px'; b.style.marginBottom = '8px';
          b.textContent = CAT_LABELS[ck];
          b.onclick = function () { catFilter = ck; renderSetup(); };
          cRow.appendChild(b);
        })(cats[ci]);
      }

      var startBtn = document.getElementById('qz-start-btn');
      startBtn.onclick = beginMatch;
      if (startBtn.focus) startBtn.focus();
    }

    function beginMatch() {
      players = [];
      for (var i = 0; i < playerCount; i++) {
        players.push({ name: 'JUGADOR ' + (i + 1), score: 0, streak: 0, fifty: 2 });
      }
      var pool = [];
      for (var q = 0; q < QUESTIONS.length; q++) {
        if (catFilter === 'all' || QUESTIONS[q].cat === catFilter) pool.push(QUESTIONS[q]);
      }
      if (pool.length < 10) pool = QUESTIONS.slice();
      deck = shuffle(pool).slice(0, 10);
      qIdx = 0; turnIdx = 0;
      showQuestion();
    }

    function showQuestion() {
      clearQuizTimers();
      if (window.TV_GAME_ACTIVE !== 'tvtrivia') return;
      if (qIdx >= deck.length) { showPodium(); return; }
      phase = 'question'; locked = false; hiddenOpts = {}; timeLeft = 15; focusIdx = 0;
      var q = deck[qIdx];
      var pl = players[turnIdx];
      roundEl.textContent = 'PREGUNTA ' + (qIdx + 1) + '/' + deck.length;
      turnEl.textContent = pl.name + ' · ' + pl.score + ' PTS';

      var optHtml = '';
      var letters = ['A', 'B', 'C', 'D'];
      for (var i = 0; i < 4; i++) {
        optHtml +=
          '<button type="button" class="qz-opt-btn" data-opt="' + i + '" tabindex="0" ' +
          'style="width:48%;margin:0 2% 14px 0;padding:18px 20px;border-radius:16px;background:#151d36;border:2px solid rgba(255,255,255,0.16);color:#fff;text-align:left;font-size:17px;font-weight:800;cursor:pointer;">' +
          '<span style="color:#a78bfa;margin-right:10px;">' + letters[i] + '.</span>' + q.opts[i] + '</button>';
      }

      var scoresHtml = '';
      for (var s = 0; s < players.length; s++) {
        var activeBorder = s === turnIdx ? 'border:2px solid #22D3EE;background:#12253f;' : 'border:1px solid rgba(255,255,255,0.12);background:#0b1122;';
        scoresHtml += '<div style="padding:8px 14px;border-radius:12px;margin-right:10px;' + activeBorder + '">' +
          '<div style="font-size:11px;color:#94a3b8;font-weight:800;">' + players[s].name + '</div>' +
          '<div style="font-size:18px;font-weight:900;color:#fff;">' + players[s].score + '</div></div>';
      }

      stage.innerHTML =
        '<div style="width:100%;max-width:860px;background:#0e1427;border:2px solid rgba(167,139,250,0.4);border-radius:24px;padding:24px 28px;color:#fff;">' +
        '<div style="display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;-webkit-align-items:center;align-items:center;margin-bottom:14px;">' +
        '<div style="display:-webkit-flex;display:flex;">' + scoresHtml + '</div>' +
        '<button type="button" id="qz-5050" class="tv-btn" tabindex="0">Comodín 50/50 (' + pl.fifty + ')</button>' +
        '</div>' +
        '<div style="height:8px;width:100%;background:#1e293b;border-radius:99px;overflow:hidden;margin-bottom:18px;">' +
        '<div id="qz-tbar" style="height:100%;width:100%;background:#22D3EE;"></div></div>' +
        '<div style="font-size:12px;font-weight:800;color:#38BDF8;text-transform:uppercase;margin-bottom:6px;">' + (CAT_LABELS[q.cat] || q.cat) + '</div>' +
        '<div style="font-size:24px;font-weight:900;line-height:1.3;margin-bottom:22px;">' + q.q + '</div>' +
        '<div style="display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;" id="qz-opts-wrap">' + optHtml + '</div>' +
        '<div id="qz-feedback" style="font-size:16px;font-weight:900;min-height:24px;"></div></div>';

      var optBtns = stage.querySelectorAll('.qz-opt-btn');
      for (var j = 0; j < optBtns.length; j++) {
        (function (idx, btn) {
          btn.onclick = function () { submitAnswer(idx); };
        })(j, optBtns[j]);
      }
      if (optBtns[0] && optBtns[0].focus) optBtns[0].focus();

      var fiftyBtn = document.getElementById('qz-5050');
      fiftyBtn.onclick = function () {
        if (locked || pl.fifty <= 0) return;
        pl.fifty--; fiftyBtn.textContent = 'Comodín 50/50 (' + pl.fifty + ')';
        var wrong = [];
        for (var w = 0; w < 4; w++) if (w !== q.ans) wrong.push(w);
        wrong = shuffle(wrong);
        hiddenOpts[wrong[0]] = true; hiddenOpts[wrong[1]] = true;
        for (var k = 0; k < optBtns.length; k++) {
          if (hiddenOpts[k]) { optBtns[k].style.opacity = '0.2'; optBtns[k].disabled = true; }
        }
        playSfx(620, 0.08, 'sine', 0.06);
      };

      var tbar = document.getElementById('qz-tbar');
      timerInterval = setInterval(function () {
        if (window.TV_GAME_ACTIVE !== 'tvtrivia' || locked) return;
        timeLeft -= 0.25;
        var pct = Math.max(0, (timeLeft / 15) * 100);
        if (tbar) { tbar.style.width = pct + '%'; tbar.style.background = pct < 30 ? '#F43F5E' : '#22D3EE'; }
        if (timeLeft <= 0) submitAnswer(-1);
      }, 250);
    }

    function submitAnswer(chosenIdx) {
      if (locked) return;
      locked = true;
      clearQuizTimers();
      var q = deck[qIdx], pl = players[turnIdx];
      var correct = chosenIdx === q.ans;
      var btns = stage.querySelectorAll('.qz-opt-btn');
      for (var i = 0; i < btns.length; i++) {
        if (i === q.ans) {
          btns[i].style.background = '#065F46'; btns[i].style.borderColor = '#34D399';
        } else if (i === chosenIdx) {
          btns[i].style.background = '#7F1D1D'; btns[i].style.borderColor = '#FB7185';
        }
      }
      var fb = document.getElementById('qz-feedback');
      if (correct) {
        pl.streak++;
        var gained = 100 + Math.round(timeLeft * 8) + (pl.streak - 1) * 25;
        pl.score += gained;
        if (pl.score > best) {
          best = pl.score;
          try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
          bestEl.textContent = 'Récord: ' + best;
        }
        if (fb) { fb.style.color = '#4ADE80'; fb.textContent = '¡CORRECTO! +' + gained + ' puntos (Racha x' + pl.streak + ')'; }
        playSfx(660, 0.16, 'triangle', 0.09);
      } else {
        pl.streak = 0;
        if (fb) {
          fb.style.color = '#FB7185';
          fb.textContent = chosenIdx < 0 ? '¡TIEMPO AGOTADO! Respuesta correcta: ' + q.opts[q.ans] : '¡INCORRECTO! Respuesta correcta: ' + q.opts[q.ans];
        }
        playSfx(160, 0.22, 'sawtooth', 0.08);
      }

      setTimeout(function () {
        if (window.TV_GAME_ACTIVE !== 'tvtrivia') return;
        qIdx++;
        turnIdx = (turnIdx + 1) % players.length;
        showQuestion();
      }, 1650);
    }

    function showPodium() {
      clearQuizTimers();
      phase = 'podium';
      var sorted = players.slice().sort(function (a, b) { return b.score - a.score; });
      var rows = '';
      for (var i = 0; i < sorted.length; i++) {
        rows += '<div style="display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;padding:12px 16px;border-radius:14px;background:#151d36;margin-bottom:8px;font-size:18px;font-weight:900;">' +
          '<span>' + (i === 0 ? '🏆 ' : (i + 1) + '. ') + sorted[i].name + '</span>' +
          '<span style="color:#4ADE80;">' + sorted[i].score + ' pts</span></div>';
      }
      stage.innerHTML =
        '<div style="width:100%;max-width:560px;background:#0e1427;border:2px solid #A78BFA;border-radius:24px;padding:28px;color:#fff;text-align:center;">' +
        '<div style="font-size:28px;font-weight:900;margin-bottom:14px;">🏆 PODIO FINAL</div>' +
        rows +
        '<div style="margin-top:20px;display:-webkit-flex;display:flex;-webkit-justify-content:center;justify-content:center;">' +
        '<button type="button" id="qz-again" class="tv-btn-primary" tabindex="0" style="margin-right:10px;">Jugar otra partida</button>' +
        '<button type="button" id="qz-quit" class="tv-btn" tabindex="0">Salir</button></div></div>';

      document.getElementById('qz-again').onclick = renderSetup;
      document.getElementById('qz-quit').onclick = window.closeTvGame;
      var ag = document.getElementById('qz-again'); if (ag && ag.focus) ag.focus();
      playSfx(740, 0.25, 'triangle', 0.1);
    }

    window.tvGameKeyHandler = function (e, code) {
      if (phase === 'question' && !locked) {
        if (code >= 49 && code <= 52) {
          var nIdx = code - 49;
          if (!hiddenOpts[nIdx]) submitAnswer(nIdx);
          if (e.preventDefault) e.preventDefault(); return true;
        }
      }
      return false;
    };

    renderSetup();
  }
  window.startTvTriviaGame = startTvTriviaGame;
})();
