// ===================================================================
// SMART TV PING PONG PRO 2P · RAQUETA MOVIL (STRICT ES5, <= 450 LOC)
// Controls: Phone 1/2 Gyroscope (/volante?game=pingpong) or TV D-Pad
// ===================================================================
var tvPpWs = null;
var tvPpHasP1 = false;
var tvPpHasP2 = false;
var tvPpGyro1 = { steer: 0, pitch: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
var tvPpGyro2 = { steer: 0, pitch: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };

function closeTvPingPongGame() {
  if (tvPpWs) {
    tvPpWs.onclose = null;
    try { tvPpWs.close(); } catch (e) {}
    tvPpWs = null;
  }
  tvPpHasP1 = false;
  tvPpHasP2 = false;
  tvPpGyro1 = { steer: 0, pitch: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
  tvPpGyro2 = { steer: 0, pitch: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
}
window.closeTvPingPongGame = closeTvPingPongGame;

function pushTvPingPongTelemetry(roomId, targetSlot, pulseMs, tag, s1, s2, spd, over) {
  if (!tvPpWs || tvPpWs.readyState !== 1) return;
  if (!tvPpHasP1 && !tvPpHasP2) return;
  try {
    tvPpWs.send(JSON.stringify({
      type: 'RACING_TV_TELEMETRY',
      payload: {
        roomId: roomId,
        speedKmh: Math.min(350, Math.max(0, Math.round(spd || 0))),
        rpmPct: 80,
        gear: 1,
        lap: 1,
        totalLaps: 1,
        position: 1,
        totalCars: 2,
        nitroPct: 100,
        collisionImpact: tag === 'pingpong_hit' ? 0.65 : 1,
        offroad: false,
        raceState: over ? 'finished' : 'racing',
        targetSlot: targetSlot,
        hapticPulseMs: pulseMs,
        scoreP1: s1,
        scoreP2: s2,
        eventTag: tag
      }
    }));
  } catch (e) {}
}

function startTvPingPongGame(scr) {
  var roomId = (typeof currentRoomId === 'string' && currentRoomId)
    ? currentRoomId
    : ('pp-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
  scr.innerHTML =
    '<div class="tv-game-topbar"><div class="tv-game-top-left">' +
    '<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
    '<div class="tv-game-top-title">🏓 Ping Pong Pro 2P · Raqueta Móvil</div></div><div class="tv-game-top-right">' +
    '<div class="tv-game-hud-pill accent-purple" id="pp-gyro-pill">📱 Esperando Móviles</div>' +
    '<div class="tv-game-hud-pill accent-green" id="pp-score-pill">J1 0 - 0 CPU</div>' +
    '<div class="tv-game-hud-pill" id="pp-rally-pill">RALLY: 0</div></div></div>' +
    '<div class="tv-game-arena" id="pp-arena">' +
    '<canvas id="tv-pp-canvas" class="tv-game-canvas" width="920" height="520"></canvas>' +
    '<div class="tv-game-finish-overlay" id="pp-finish-ov"><div class="tv-game-finish-card">' +
    '<div class="tv-game-finish-title" id="pp-fin-title">🏆 ¡VICTORIA!</div>' +
    '<div class="tv-game-finish-sub" id="pp-fin-sub">Marcador final</div>' +
    '<div class="tv-game-finish-btns">' +
    '<button type="button" id="btn-pp-replay" class="tv-btn-primary" tabindex="0">Revancha (OK)</button>' +
    '<button type="button" id="btn-pp-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
    '</div></div></div></div>' +
    '<div class="tv-game-controls-hint">' +
    '<span>Móvil (Vertical): Mueve muñeca ◀ ▶ + Golpe Smash · 2 Móviles = Duelo J1 vs J2</span>' +
    '<span>Mando TV: ◀ ▶ Mover pala · ▲/▼ Profundidad · OK Smash · Primero a 11 puntos</span></div>';

  document.getElementById('btn-game-back').onclick = closeTvGame;
  document.getElementById('btn-pp-exit').onclick = closeTvGame;

  var canvas = document.getElementById('tv-pp-canvas');
  var ctx = canvas.getContext('2d');
  var arenaEl = document.getElementById('pp-arena');
  var scorePill = document.getElementById('pp-score-pill');
  var rallyPill = document.getElementById('pp-rally-pill');
  var gyroPill = document.getElementById('pp-gyro-pill');
  var finOv = document.getElementById('pp-finish-ov');
  var finTitle = document.getElementById('pp-fin-title');
  var finSub = document.getElementById('pp-fin-sub');
  var ppLobby = typeof window.createTvDualQrLobby === 'function'
    ? window.createTvDualQrLobby(arenaEl, { roomId: roomId, gameId: 'pingpong', title: '🏓 Ping Pong Pro 2P · QR J1 y J2' })
    : null;

  function connectPpWs() {
    if (!window.WebSocket || typeof getTvRacingWsUrl !== 'function') return;
    try {
      var ws = new WebSocket(getTvRacingWsUrl());
      tvPpWs = ws;
      ws.onopen = function () {
        if (tvPpWs !== ws) return;
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          payload: { roomId: roomId, roomName: 'PINGPONG', user: { id: 'tv-pp-' + roomId, name: 'Smart TV', avatar: '🏓', color: '#22D3EE', isHost: true } }
        }));
        ws.send(JSON.stringify({
          type: 'GYRO_CONTROLLER_JOIN',
          payload: { roomId: roomId, role: 'display', deviceName: 'Ping Pong TV', gameId: 'pingpong' }
        }));
      };
      ws.onmessage = function (ev) {
        if (tvPpWs !== ws) return;
        try {
          var msg = JSON.parse(ev.data);
          if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
            var list = msg.payload.controllers || [];
            if (ppLobby) ppLobby.onStatus(list);
            tvPpHasP1 = false;
            tvPpHasP2 = false;
            for (var ci = 0; ci < list.length; ci++) {
              if (list[ci].slot === 2 || (ci === 1 && !list[ci].slot)) tvPpHasP2 = true;
              else tvPpHasP1 = true;
            }
            if (gyroPill) {
              if (tvPpHasP1 || tvPpHasP2) {
                gyroPill.className = 'tv-game-hud-pill accent-green';
                gyroPill.textContent = tvPpHasP2 ? '📱 2 Móviles (J1 vs J2)' : '📱 J1 Móvil Conectado';
              } else {
                gyroPill.className = 'tv-game-hud-pill accent-purple';
                gyroPill.textContent = '📱 Esperando Móviles';
              }
            }
          } else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
            var p = msg.payload;
            var tgt = p.playerSlot === 2 ? tvPpGyro2 : tvPpGyro1;
            tgt.steer = typeof p.steer === 'number' ? p.steer : 0;
            tgt.pitch = typeof p.pitch === 'number' ? p.pitch : 0;
            tgt.nitro = Boolean(p.nitro);
            tgt.handbrake = Boolean(p.handbrake);
            tgt.swing = typeof p.swing === 'number' ? p.swing : 0;
            tgt.expiresAt = Date.now() + 1400;
          }
        } catch (e) {}
      };
      ws.onclose = function () {
        if (tvPpWs === ws && TV_GAME_ACTIVE === 'pingpong') {
          setTimeout(function () { if (TV_GAME_ACTIVE === 'pingpong') connectPpWs(); }, 2500);
        }
      };
    } catch (e) {}
  }
  connectPpWs();

  var W = 920, H = 520, TOP_W = 370, BOT_W = 690, T_TOP = 64, T_BOT = H - 56, T_H = T_BOT - T_TOP;
  var keys = { left: false, right: false, up: false, down: false, smash: false };
  var st = {
    s1: 0, s2: 0, rally: 0, over: false, pauseT: 0.75, banner: 'SACA J1', bannerCol: '#22D3EE',
    p1: { x: 0, y: 0.88, vx: 0, smashT: 0 },
    p2: { x: 0, y: -0.88, vx: 0, smashT: 0 },
    ball: { x: 0, y: 0.65, z: 0.25, vx: 0, vy: 0, vz: 0, spin: 0, lastHit: 1 },
    rings: [], trail: []
  };

  function proj(nx, ny, z) {
    var t = (ny + 1) * 0.5;
    var halfW = (TOP_W + (BOT_W - TOP_W) * t) * 0.5;
    return { x: W * 0.5 + nx * halfW, y: T_TOP + t * T_H - (z || 0) * 115, scale: 0.64 + 0.44 * t };
  }

  function serveBall(srv) {
    st.rally = 0; st.trail = [];
    st.ball = {
      x: srv === 1 ? st.p1.x * 0.5 : st.p2.x * 0.5,
      y: srv === 1 ? 0.72 : -0.72, z: 0.26,
      vx: (Math.random() - 0.5) * 0.45, vy: srv === 1 ? -1.42 : 1.42, vz: 0.88, spin: 0, lastHit: srv
    };
  }

  function resetPp() {
    st.s1 = 0; st.s2 = 0; st.rally = 0; st.over = false; st.pauseT = 0.75;
    st.banner = 'SACA J1'; st.bannerCol = '#22D3EE'; st.rings = [];
    finOv.style.display = 'none';
    serveBall(1);
    syncHud(false);
  }
  document.getElementById('btn-pp-replay').onclick = resetPp;

  function syncHud(p2Human) {
    scorePill.textContent = 'J1 ' + st.s1 + ' - ' + st.s2 + (p2Human ? ' J2' : ' CPU');
    rallyPill.textContent = 'RALLY: ' + st.rally;
  }

  function awardPoint(winner, reason) {
    if (winner === 1) st.s1 += 1; else st.s2 += 1;
    playTvGameBeep(winner === 1 ? 740 : 320, 0.16, 'triangle', 0.11);
    pushTvPingPongTelemetry(roomId, winner, 65, 'pingpong_point', st.s1, st.s2, 110, false);
    var totalPts = st.s1 + st.s2;
    var nextSrv = totalPts >= 20 ? (totalPts % 2 === 0 ? 1 : 2) : (Math.floor(totalPts / 2) % 2 === 0 ? 1 : 2);
    if ((st.s1 >= 11 || st.s2 >= 11) && Math.abs(st.s1 - st.s2) >= 2) {
      st.over = true;
      var p1Won = st.s1 > st.s2;
      finTitle.textContent = p1Won ? '🏆 ¡VICTORIA PARA J1!' : '🏆 ¡VICTORIA PARA J2!';
      finSub.textContent = 'Marcador final: J1 ' + st.s1 + ' - ' + st.s2;
      pushTvPingPongTelemetry(roomId, p1Won ? 1 : 2, 120, 'pingpong_point', st.s1, st.s2, 0, true);
      finOv.style.display = '-webkit-flex'; finOv.style.display = 'flex';
      var rb = document.getElementById('btn-pp-replay'); if (rb && rb.focus) rb.focus();
    } else {
      st.pauseT = 1.05;
      st.banner = (winner === 1 ? 'PUNTO J1 · ' : 'PUNTO J2 · ') + reason;
      st.bannerCol = winner === 1 ? '#22D3EE' : '#FB7185';
      serveBall(nextSrv);
    }
  }

  tvGameKeyHandler = function (e, code) {
    if (st.over && (code === 13 || code === 23 || code === 66 || code === 32)) {
      if (e.preventDefault) e.preventDefault(); resetPp(); return true;
    }
    if (code === 37 || code === 21) { keys.left = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 39 || code === 22) { keys.right = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 38 || code === 19) { keys.up = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 40 || code === 20) { keys.down = true; if (e.preventDefault) e.preventDefault(); return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.smash = true; if (e.preventDefault) e.preventDefault(); return true; }
    return false;
  };
  tvGameKeyUpHandler = function (_e, code) {
    if (code === 37 || code === 21) { keys.left = false; return true; }
    if (code === 39 || code === 22) { keys.right = false; return true; }
    if (code === 38 || code === 19) { keys.up = false; return true; }
    if (code === 40 || code === 20) { keys.down = false; return true; }
    if (code === 13 || code === 23 || code === 66 || code === 32) { keys.smash = false; return true; }
    return false;
  };

  var lastTs = performance.now();
  function frame(now) {
    if (TV_GAME_ACTIVE !== 'pingpong') return;
    var dt = Math.min(0.032, Math.max(0.004, (now - lastTs) / 1000));
    lastTs = now;
    var tNow = Date.now();
    var useG1 = tNow < tvPpGyro1.expiresAt;
    var useG2 = tNow < tvPpGyro2.expiresAt;

    for (var ri = st.rings.length - 1; ri >= 0; ri--) {
      st.rings[ri].life -= dt * 2.2;
      if (st.rings[ri].life <= 0) st.rings.splice(ri, 1);
    }

    if (!st.over && (!ppLobby || ppLobby.isReady())) {
      var prevP1x = st.p1.x;
      if (useG1) {
        var tx1 = Math.max(-1.05, Math.min(1.05, tvPpGyro1.steer * 1.15));
        st.p1.x += (tx1 - st.p1.x) * Math.min(1, dt * 19);
        var ty1 = Math.max(0.55, Math.min(1.05, 0.88 - tvPpGyro1.pitch * 0.28));
        st.p1.y += (ty1 - st.p1.y) * Math.min(1, dt * 14);
        if (tvPpGyro1.swing > 0.45 || tvPpGyro1.nitro) st.p1.smashT = Math.max(st.p1.smashT, 0.24);
      } else {
        st.p1.x = Math.max(-1.08, Math.min(1.08, st.p1.x + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 2.15 * dt));
        st.p1.y = Math.max(0.56, Math.min(1.04, st.p1.y + ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * 1.2 * dt));
      }
      if (keys.smash) st.p1.smashT = 0.22;
      st.p1.smashT = Math.max(0, st.p1.smashT - dt);
      st.p1.vx = (st.p1.x - prevP1x) / dt;

      var prevP2x = st.p2.x;
      if (useG2) {
        var tx2 = Math.max(-1.05, Math.min(1.05, tvPpGyro2.steer * 1.15));
        st.p2.x += (tx2 - st.p2.x) * Math.min(1, dt * 19);
        var ty2 = Math.max(-1.05, Math.min(-0.55, -0.88 + tvPpGyro2.pitch * 0.28));
        st.p2.y += (ty2 - st.p2.y) * Math.min(1, dt * 14);
        if (tvPpGyro2.swing > 0.45 || tvPpGyro2.nitro) st.p2.smashT = Math.max(st.p2.smashT, 0.24);
      } else {
        var aimX = st.ball.vy < 0 ? Math.max(-0.92, Math.min(0.92, st.ball.x)) : 0;
        st.p2.x += Math.max(-1.65 * dt, Math.min(1.65 * dt, aimX - st.p2.x));
        st.p2.y += (-0.88 - st.p2.y) * Math.min(1, dt * 8);
      }
      st.p2.smashT = Math.max(0, st.p2.smashT - dt);
      st.p2.vx = (st.p2.x - prevP2x) / dt;

      if (st.pauseT > 0) {
        st.pauseT -= dt;
        if (st.pauseT <= 0) st.banner = '';
      } else {
        var sub = 3, sDt = dt / sub;
        for (var k = 0; k < sub; k++) {
          var b = st.ball;
          b.vx += b.spin * 0.55 * sDt;
          b.x += b.vx * sDt; b.y += b.vy * sDt;
          b.vz -= 2.85 * sDt; b.z += b.vz * sDt;

          if (b.z <= 0 && b.vz < 0) {
            if (Math.abs(b.x) <= 1.03 && Math.abs(b.y) <= 1.02) {
              b.z = 0; b.vz = Math.max(0.75, Math.abs(b.vz) * 0.86);
              st.rings.push({ x: b.x, y: b.y, life: 1, col: b.y > 0 ? '#22D3EE' : '#FB7185' });
              playTvGameBeep(980, 0.03, 'sine', 0.06);
            } else {
              awardPoint(b.y > 0 ? 2 : 1, 'FUERA'); break;
            }
          }
          if (Math.abs(b.y) < 0.04 && b.z < 0.11) {
            b.vy *= -0.4; b.y = b.y >= 0 ? 0.045 : -0.045;
            playTvGameBeep(420, 0.04, 'sine', 0.05);
          }
          if (b.vy > 0 && Math.abs(b.y - st.p1.y) < 0.1 && Math.abs(b.x - st.p1.x) < 0.24 && b.z < 0.55) {
            var sm1 = st.p1.smashT > 0 || (useG1 && tvPpGyro1.nitro);
            var sp1 = useG1 && tvPpGyro1.handbrake ? 1.45 : 1;
            var off1 = (b.x - st.p1.x) / 0.24;
            b.y = st.p1.y - 0.11; b.vy = -(sm1 ? 2.28 : 1.65) - Math.min(0.45, st.rally * 0.03);
            b.vx = off1 * 1.45 + st.p1.vx * 0.28; b.vz = sm1 ? 0.92 : 1.08;
            b.spin = (-st.p1.vx * 0.45 + off1 * 0.8) * sp1; b.lastHit = 1; st.rally += 1;
            playTvGameBeep(sm1 ? 660 : 540, 0.045, 'triangle', 0.08);
            pushTvPingPongTelemetry(roomId, 1, sm1 ? 65 : 32, 'pingpong_hit', st.s1, st.s2, Math.abs(b.vy) * 85, false);
          }
          if (b.vy < 0 && Math.abs(b.y - st.p2.y) < 0.1 && Math.abs(b.x - st.p2.x) < 0.24 && b.z < 0.55) {
            var sm2 = st.p2.smashT > 0 || (useG2 && tvPpGyro2.nitro);
            var sp2 = useG2 && tvPpGyro2.handbrake ? 1.45 : 1;
            var off2 = (b.x - st.p2.x) / 0.24;
            b.y = st.p2.y + 0.11; b.vy = (sm2 ? 2.28 : 1.65) + Math.min(0.45, st.rally * 0.03);
            b.vx = off2 * 1.45 + st.p2.vx * 0.28; b.vz = sm2 ? 0.92 : 1.08;
            b.spin = (-st.p2.vx * 0.45 + off2 * 0.8) * sp2; b.lastHit = 2; st.rally += 1;
            playTvGameBeep(sm2 ? 620 : 480, 0.045, 'triangle', 0.08);
            if (useG2) pushTvPingPongTelemetry(roomId, 2, sm2 ? 65 : 32, 'pingpong_hit', st.s1, st.s2, Math.abs(b.vy) * 85, false);
          }
          if (b.y > 1.32) { awardPoint(2, 'WIN J2'); break; }
          else if (b.y < -1.32) { awardPoint(1, 'ACE J1'); break; }
        }
        st.trail.push({ x: st.ball.x, y: st.ball.y, z: st.ball.z });
        if (st.trail.length > 12) st.trail.shift();
      }
      syncHud(useG2);
    }

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#040814'); bg.addColorStop(0.55, '#0b1530'); bg.addColorStop(1, '#050812');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    var spot = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.46, W * 0.55);
    spot.addColorStop(0, 'rgba(34, 211, 238, 0.14)'); spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);

    var tl = proj(-1, -1), tr = proj(1, -1), bl = proj(-1, 1), br = proj(1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.moveTo(bl.x + 14, bl.y + 20); ctx.lineTo(br.x - 14, br.y + 20); ctx.lineTo(br.x - 24, br.y + 42); ctx.lineTo(bl.x + 24, bl.y + 42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0F2942';
    ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.lineTo(br.x, br.y + 20); ctx.lineTo(bl.x, bl.y + 20); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();

    var tGrad = ctx.createLinearGradient(0, T_TOP, 0, T_BOT);
    tGrad.addColorStop(0, '#09436b'); tGrad.addColorStop(0.5, '#0e669e'); tGrad.addColorStop(1, '#083a5e');
    ctx.fillStyle = tGrad;
    ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 4; ctx.stroke();
    var mT = proj(0, -1), mB = proj(0, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.52)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(mT.x, mT.y); ctx.lineTo(mB.x, mB.y); ctx.stroke();

    for (var r2 = 0; r2 < st.rings.length; r2++) {
      var rg = st.rings[r2], rp = proj(rg.x, rg.y, 0), rRad = (1 - rg.life) * 26 + 8;
      ctx.globalAlpha = Math.max(0, rg.life); ctx.strokeStyle = rg.col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rRad, rRad * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    function drawPaddle(nx, ny, mainCol, rimCol, woodCol, handleDown, smashT, big) {
      var sh = proj(nx, ny, 0), p = proj(nx, ny, 0.08), rx = (big ? 50 : 44) * p.scale, ry = (big ? 22 : 19) * p.scale;
      ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y + 4, rx * 0.9, ry * 0.65, 0, 0, Math.PI * 2); ctx.fill();
      if (smashT > 0) {
        if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, p.x, p.y, rx * 1.35, '250,204,21', 0.46);
        ctx.strokeStyle = 'rgba(250,204,21,0.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(p.x, p.y, rx + 7, ry + 5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = woodCol; ctx.fillRect(p.x - 6 * p.scale, handleDown ? p.y + ry * 0.72 : p.y - ry * 1.55, 12 * p.scale, 18 * p.scale);
      var rGrad = ctx.createRadialGradient(p.x - rx * 0.3, p.y - ry * 0.35, 3, p.x, p.y, rx);
      rGrad.addColorStop(0, rimCol); rGrad.addColorStop(0.65, mainCol); rGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = rGrad; ctx.strokeStyle = smashT > 0 ? '#FACC15' : rimCol; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    drawPaddle(st.p2.x, st.p2.y, '#E11D48', '#FDA4AF', '#92400E', false, st.p2.smashT, false);

    var netL = proj(-1.04, 0, 0), netR = proj(1.04, 0, 0);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'; ctx.fillRect(netL.x, netL.y - 26, netR.x - netL.x, 26);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)'; ctx.lineWidth = 1;
    for (var nxG = netL.x; nxG <= netR.x; nxG += 16) { ctx.beginPath(); ctx.moveTo(nxG, netL.y - 26); ctx.lineTo(nxG, netL.y); ctx.stroke(); }
    for (var nyG = netL.y - 20; nyG < netL.y; nyG += 7) { ctx.beginPath(); ctx.moveTo(netL.x, nyG); ctx.lineTo(netR.x, nyG); ctx.stroke(); }
    ctx.fillStyle = '#475569'; ctx.fillRect(netL.x - 4, netL.y - 28, 7, 30); ctx.fillRect(netR.x - 3, netR.y - 28, 7, 30);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(netL.x, netL.y - 26); ctx.lineTo(netR.x, netR.y - 26); ctx.stroke();

    for (var ti = 0; ti < st.trail.length; ti++) {
      var trP = proj(st.trail[ti].x, st.trail[ti].y, Math.max(0, st.trail[ti].z));
      ctx.globalAlpha = (ti / st.trail.length) * 0.32; ctx.fillStyle = st.ball.lastHit === 1 ? '#22D3EE' : '#FB7185';
      ctx.beginPath(); ctx.arc(trP.x, trP.y, 7 * trP.scale * (ti / st.trail.length), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    var bSh = proj(st.ball.x, st.ball.y, 0), sSc = Math.max(0.35, 1 - st.ball.z * 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath();
    ctx.ellipse(bSh.x, bSh.y, 12 * bSh.scale * sSc, 5.5 * bSh.scale * sSc, 0, 0, Math.PI * 2); ctx.fill();
    var bPos = proj(st.ball.x, st.ball.y, Math.max(0, st.ball.z)), bR = 11 * bPos.scale;
    var ballGrad = ctx.createRadialGradient(bPos.x - bR * 0.35, bPos.y - bR * 0.35, bR * 0.15, bPos.x, bPos.y, bR);
    ballGrad.addColorStop(0, '#FFFFFF'); ballGrad.addColorStop(0.55, '#FEF08A'); ballGrad.addColorStop(1, '#EA580C');
    ctx.fillStyle = ballGrad; ctx.beginPath(); ctx.arc(bPos.x, bPos.y, bR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, bPos.x, bPos.y, bR, W * 0.5, 40, 0.65);

    drawPaddle(st.p1.x, st.p1.y, '#0891B2', '#67E8F9', '#92400E', true, st.p1.smashT, true);

    if (st.banner) {
      ctx.fillStyle = 'rgba(5, 8, 18, 0.84)'; ctx.fillRect(W / 2 - 210, H / 2 - 34, 420, 68);
      ctx.strokeStyle = st.bannerCol; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 210, H / 2 - 34, 420, 68);
      ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = st.bannerCol;
      ctx.fillText(st.banner, W / 2, H / 2 + 9);
    }
    TV_GAME_RAF = requestAnimationFrame(frame);
  }
  resetPp();
  TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startTvPingPongGame = startTvPingPongGame;
