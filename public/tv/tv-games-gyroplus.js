(function () {
var plusWs = null;
var pad1 = { steer: 0, pitch: 0, roll: 0, swing: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
var pad2 = { steer: 0, pitch: 0, roll: 0, swing: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
var hasCtrl = false;
var twoHumans = false;
var active3dHandle = null;
function dispose3d() {
if (active3dHandle && active3dHandle.dispose) {
try { active3dHandle.dispose(); } catch (e0) {}
}
active3dHandle = null;
}
function mount3dStage(arenaEl, canvasEl, fnName, opts) {
dispose3d();
if (!arenaEl || !window.RiffanTvGames || typeof window.RiffanTvGames[fnName] !== 'function') return null;
var stEl = document.createElement('div');
stEl.className = 'tv-3d-stage';
arenaEl.insertBefore(stEl, arenaEl.firstChild);
try { active3dHandle = window.RiffanTvGames[fnName](stEl, opts); } catch (eM) { active3dHandle = null; }
if (active3dHandle) {
if (canvasEl) canvasEl.style.display = 'none';
return active3dHandle;
}
if (stEl.parentNode) stEl.parentNode.removeChild(stEl);
return null;
}
function spr(c, p, x, y, w, h, r) { return typeof window.drawTvSprite === 'function' ? window.drawTvSprite(c, p, x, y, w, h, r) : false; }
function sprRect(c, p, x, y, w, h) { return typeof window.drawTvSpriteRect === 'function' ? window.drawTvSpriteRect(c, p, x, y, w, h) : false; }
function beep(f, d, t, g) { if (typeof window.playTvGameBeep === 'function') window.playTvGameBeep(f, d, t, g); }
function closeTvGyroPlusGame() {
dispose3d();
if (plusWs) { plusWs.onclose = null; try { plusWs.close(); } catch (e) {} plusWs = null; }
hasCtrl = false; twoHumans = false;
pad1 = { steer: 0, pitch: 0, roll: 0, swing: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
pad2 = { steer: 0, pitch: 0, roll: 0, swing: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, expiresAt: 0 };
}
window.closeTvGyroPlusGame = closeTvGyroPlusGame;
function pushPlusTel(roomId, s1, s2, tag, pulseMs) {
if (!plusWs || plusWs.readyState !== 1 || !hasCtrl) return;
try {
plusWs.send(JSON.stringify({
type: 'RACING_TV_TELEMETRY',
payload: {
roomId: roomId, speedKmh: 0, rpmPct: 70, gear: 1, lap: 1, totalLaps: 5,
position: 1, totalCars: 2, nitroPct: 100, raceState: 'racing',
scoreP1: s1, scoreP2: s2, eventTag: tag, hapticPulseMs: pulseMs
}
}));
} catch (e) {}
}
function connectPlusWs(roomId, gameId, pillEl, lobby) {
if (!window.WebSocket || typeof getTvRacingWsUrl !== 'function') return;
try {
var ws = new WebSocket(getTvRacingWsUrl());
plusWs = ws;
ws.onopen = function () {
if (plusWs !== ws) return;
ws.send(JSON.stringify({
type: 'JOIN_ROOM',
payload: { roomId: roomId, roomName: gameId.toUpperCase(), user: { id: 'tv-gp-' + roomId, name: 'Smart TV', avatar: '🎮', color: '#38BDF8', isHost: true } }
}));
ws.send(JSON.stringify({
type: 'GYRO_CONTROLLER_JOIN',
payload: { roomId: roomId, role: 'display', deviceName: 'Smart TV Gyro', gameId: gameId }
}));
};
ws.onmessage = function (ev) {
if (plusWs !== ws) return;
try {
var msg = JSON.parse(ev.data);
if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
var list = msg.payload.controllers || [];
hasCtrl = Boolean(msg.payload.hasController);
twoHumans = list.length >= 2 || (list[0] && list[0].slot === 2);
if (lobby) lobby.onStatus(list);
if (pillEl) {
pillEl.className = hasCtrl ? 'tv-game-hud-pill accent-green' : 'tv-game-hud-pill accent-purple';
pillEl.textContent = twoHumans ? '📱 2 Móviles (J1 + J2)' : hasCtrl ? '📱 J1 Móvil Conectado' : '📱 Esperando Móviles';
}
} else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
var p = msg.payload, tgt = p.playerSlot === 2 ? pad2 : pad1;
tgt.steer = typeof p.steer === 'number' ? p.steer : 0;
tgt.pitch = typeof p.pitch === 'number' ? p.pitch : 0;
tgt.roll = typeof p.roll === 'number' ? p.roll : 0;
tgt.swing = typeof p.swing === 'number' ? p.swing : 0;
tgt.throttle = typeof p.throttle === 'number' ? p.throttle : 0;
tgt.brake = typeof p.brake === 'number' ? p.brake : 0;
tgt.nitro = Boolean(p.nitro);
tgt.handbrake = Boolean(p.handbrake);
tgt.expiresAt = Date.now() + 1400;
}
} catch (e) {}
};
ws.onclose = function () {
if (plusWs === ws && window.TV_GAME_ACTIVE === gameId) {
setTimeout(function () { if (window.TV_GAME_ACTIVE === gameId) connectPlusWs(roomId, gameId, pillEl, lobby); }, 2500);
}
};
} catch (e) {}
}
function mountPlusShell(scr, prefix, title, pillL, pillR, hintL, hintR) {
scr.innerHTML =
'<div class="tv-game-topbar"><div class="tv-game-top-left">' +
'<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
'<div class="tv-game-top-title">' + title + '</div></div><div class="tv-game-top-right">' +
'<div class="tv-game-hud-pill accent-purple" id="' + prefix + '-gyro-pill">📱 Esperando Móviles</div>' +
'<div class="tv-game-hud-pill accent-green" id="' + prefix + '-p1">' + pillL + '</div>' +
'<div class="tv-game-hud-pill" id="' + prefix + '-p2">' + pillR + '</div></div></div>' +
'<div class="tv-game-arena" id="' + prefix + '-arena">' +
'<canvas id="' + prefix + '-canvas" class="tv-game-canvas" width="920" height="520"></canvas>' +
'<div class="tv-game-finish-overlay" id="' + prefix + '-ov"><div class="tv-game-finish-card">' +
'<div class="tv-game-finish-title" id="' + prefix + '-ft">FIN</div>' +
'<div class="tv-game-finish-sub" id="' + prefix + '-fs">Marcador</div>' +
'<div class="tv-game-finish-btns">' +
'<button type="button" id="' + prefix + '-replay" class="tv-btn-primary" tabindex="0">Jugar de nuevo (OK)</button>' +
'<button type="button" id="' + prefix + '-exit" class="tv-btn" tabindex="0">Salir</button>' +
'</div></div></div></div>' +
'<div class="tv-game-controls-hint"><span>' + hintL + '</span><span>' + hintR + '</span></div>';
document.getElementById('btn-game-back').onclick = window.closeTvGame;
document.getElementById(prefix + '-exit').onclick = window.closeTvGame;
}
function startGyroBowlingGame(scr) {
if (typeof window.preloadTvGameSprites === 'function') {
window.preloadTvGameSprites(['assets/games/arenas/bowling_alley.jpg', 'assets/games/sports/ball_bowling1.png', 'assets/games/sports/ball_bowling2.png', 'assets/games/particles/star_07.png', 'assets/games/particles/spark_01.png']);
}
var roomId = (typeof currentRoomId === 'string' && currentRoomId) ? currentRoomId : ('bw-' + Math.floor(1000 + Math.random() * 9000));
mountPlusShell(scr, 'bw', '🎳 Bolos Pro 3D Gyro', 'FRAME 1/5 · J1 0', 'TIRO 1 · 10 BOLOS',
'Móvil Vertical: Inclina para apuntar + Lanza (o pulsa LANZAR)', 'Mando TV: ◀ ▶ Apuntar · OK Lanzar bola');
var canvas = document.getElementById('bw-canvas'), ctx = canvas.getContext('2d');
var p1El = document.getElementById('bw-p1'), p2El = document.getElementById('bw-p2'), ov = document.getElementById('bw-ov');
var ftEl = document.getElementById('bw-ft'), fsEl = document.getElementById('bw-fs');
var lobby = typeof window.createTvDualQrLobby === 'function'
? window.createTvDualQrLobby(document.getElementById('bw-arena'), { roomId: roomId, gameId: 'gyrobowling', title: '🎳 Bolos Pro 3D · QR J1 y J2' })
: null;
connectPlusWs(roomId, 'gyrobowling', document.getElementById('bw-gyro-pill'), lobby);
var W = 920, H = 520, keys = { left: false, right: false, fire: false }, prevTrig = false;
function makePins() {
var out = [];
for (var r = 0; r < 4; r++) for (var c = 0; c <= r; c++) {
out.push({ x: (c - r * 0.5) * 0.24, y: 0.9 - r * 0.045, vx: 0, vy: 0, up: true, rot: 0 });
}
return out;
}
var st = { frame: 1, roll: 1, turn: 1, s1: 0, s2: 0, aimX: 0, spin: 0, phase: 'aim', settleT: 0, banner: '', bannerT: 0, ball: { x: 0, y: 0.06, vx: 0, vy: 0, curve: 0, rot: 0 }, pins: makePins(), sparks: [], outcomeSeq: 0, outcomeKind: 'none' };
var use3dBw = Boolean(mount3dStage(document.getElementById('bw-arena'), canvas, 'mountBowling3D', {
getState: function () {
return { phase: st.phase, turnPlayer: st.turn === 2 ? 2 : 1, aimX: st.aimX, spin: st.spin, ball: { x: st.ball.x, y: st.ball.y, rot: st.ball.rot }, pins: st.pins, outcomeSeq: st.outcomeSeq, outcomeKind: st.outcomeKind };
}
}));
function resetBowl() {
st.frame = 1; st.roll = 1; st.turn = 1; st.s1 = 0; st.s2 = 0; st.phase = 'aim'; st.pins = makePins(); st.banner = ''; st.bannerT = 0; st.sparks = []; st.outcomeKind = 'none';
ov.style.display = 'none'; p1El.textContent = 'FRAME 1/5 · J1 0'; p2El.textContent = 'TIRO 1 · 10 BOLOS';
}
document.getElementById('bw-replay').onclick = resetBowl;
window.tvGameKeyHandler = function (e, code) {
if (st.phase === 'over' && (code === 13 || code === 23 || code === 66 || code === 32)) { if (e.preventDefault) e.preventDefault(); resetBowl(); return true; }
if (code === 37 || code === 21) { keys.left = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 39 || code === 22) { keys.right = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 13 || code === 23 || code === 66 || code === 32) { keys.fire = true; if (e.preventDefault) e.preventDefault(); return true; }
return false;
};
window.tvGameKeyUpHandler = function (_e, code) {
if (code === 37 || code === 21) { keys.left = false; return true; }
if (code === 39 || code === 22) { keys.right = false; return true; }
if (code === 13 || code === 23 || code === 66 || code === 32) { keys.fire = false; return true; }
return false;
};
var topW = 240, botW = 540, laneTopY = 148, laneBotY = H - 12;
function proj(lx, ly) {
var d = Math.max(0, Math.min(1.15, ly)), hw = (botW * 0.5) * (1 - d * 0.54);
return { sx: W / 2 + lx * hw, sy: laneBotY - d * (laneBotY - laneTopY), sc: 1 - d * 0.48 };
}
var last = performance.now();
function frame(now) {
if (window.TV_GAME_ACTIVE !== 'gyrobowling') return;
var dt = Math.min(0.035, Math.max(0.005, (now - last) / 1000)); last = now;
if (st.bannerT > 0) st.bannerT = Math.max(0, st.bannerT - dt);
for (var si = st.sparks.length - 1; si >= 0; si--) {
st.sparks[si].x += st.sparks[si].vx * dt; st.sparks[si].y += st.sparks[si].vy * dt; st.sparks[si].life -= dt;
if (st.sparks[si].life <= 0) st.sparks.splice(si, 1);
}
if (st.phase !== 'over' && (!lobby || lobby.isReady())) {
var pad = (st.turn === 2 && twoHumans) ? pad2 : pad1, fresh = pad.expiresAt > Date.now();
var steer = fresh ? pad.steer : ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 0.8;
var trigNow = fresh ? (pad.swing > 1.05 || pad.nitro || pad.throttle > 0.5) : keys.fire;
var fired = trigNow && !prevTrig; prevTrig = trigNow;
if (st.phase === 'aim') {
st.aimX = Math.max(-0.82, Math.min(0.82, steer * 0.85)); st.spin = fresh ? pad.roll : 0;
if (fired) {
st.phase = 'roll';
var spdM = fresh ? Math.min(1.45, Math.max(0.95, 0.95 + pad.swing * 0.25)) : 1.15;
st.ball = { x: st.aimX, y: 0.06, vx: steer * 0.16, vy: 0.85 * spdM, curve: st.spin * 0.5, rot: 0 };
beep(240, 0.12, 'triangle', 0.08); pushPlusTel(roomId, st.s1, st.s2, 'bowling_roll', 45);
}
} else if (st.phase === 'roll') {
var b = st.ball; b.vx += b.curve * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 14;
var gutter = Math.abs(b.x) > 0.86; if (gutter) b.vx *= 0.85;
for (var i = 0; i < st.pins.length; i++) {
var pn = st.pins[i];
if (pn.up && !gutter && Math.hypot(pn.x - b.x, pn.y - b.y) < 0.14) {
pn.up = false; pn.vx = (pn.x - b.x) * 9 + b.vx * 1.4; pn.vy = 0.95; beep(640, 0.07, 'square', 0.06);
for (var k = 0; k < 4; k++) st.sparks.push({ x: 460 + pn.x * 165, y: 165 + (1 - pn.y) * 290, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 140, life: 0.45 });
}
}
for (var a = 0; a < st.pins.length; a++) if (!st.pins[a].up) {
st.pins[a].x += st.pins[a].vx * dt; st.pins[a].y += st.pins[a].vy * dt; st.pins[a].rot += dt * 9;
for (var c = 0; c < st.pins.length; c++) if (st.pins[c].up && Math.hypot(st.pins[a].x - st.pins[c].x, st.pins[a].y - st.pins[c].y) < 0.22) {
st.pins[c].up = false; st.pins[c].vx = (st.pins[c].x - st.pins[a].x) * 4; st.pins[c].vy = 0.7;
}
}
if (b.y >= 1.12) {
st.phase = 'settle'; st.settleT = 1.05;
var down = 0; for (var j = 0; j < st.pins.length; j++) if (!st.pins[j].up) down++;
if (down === 10 && st.roll === 1) {
st.banner = '⚡ ¡STRIKE PERFECTO! (+20)'; st.bannerT = 1.3;
st.outcomeSeq += 1; st.outcomeKind = 'strike';
if (st.turn === 1) st.s1 += 20; else st.s2 += 20;
beep(880, 0.25, 'triangle', 0.1); pushPlusTel(roomId, st.s1, st.s2, 'bowling_strike', 120);
} else {
if (st.turn === 1) st.s1 += down + (down === 10 ? 2 : 0); else st.s2 += down + (down === 10 ? 2 : 0);
st.outcomeSeq += 1; st.outcomeKind = down === 10 ? 'spare' : (down > 0 ? 'hit' : 'none');
st.banner = down === 10 ? '✨ ¡SPARE! (+12)' : (down + ' BOLOS DERRIBADOS'); st.bannerT = 1.0;
pushPlusTel(roomId, st.s1, st.s2, 'bowling_roll', 40);
}
}
} else if (st.phase === 'settle') {
st.settleT -= dt;
if (st.settleT <= 0) {
var leftPins = 0; for (var u = 0; u < st.pins.length; u++) if (st.pins[u].up) leftPins++;
if (st.roll === 1 && leftPins > 0) { st.roll = 2; st.phase = 'aim'; }
else {
st.roll = 1;
if (twoHumans && st.turn === 1) st.turn = 2;
else { st.turn = 1; st.frame += 1; }
if (st.frame > 5) {
st.phase = 'over';
ftEl.textContent = twoHumans ? (st.s1 >= st.s2 ? '🏆 ¡GANA JUGADOR 1!' : '🏆 ¡GANA JUGADOR 2!') : ('🏆 PARTIDA FINALIZADA · ' + st.s1 + ' PTS');
fsEl.textContent = twoHumans ? ('J1 ' + st.s1 + ' - ' + st.s2 + ' J2') : '5 rondas completadas';
ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
var rb = document.getElementById('bw-replay'); if (rb && rb.focus) rb.focus();
} else { st.pins = makePins(); st.phase = 'aim'; }
}
var remP = 0; for (var r2 = 0; r2 < st.pins.length; r2++) if (st.pins[r2].up) remP++;
p1El.textContent = 'FRAME ' + Math.min(st.frame, 5) + '/5 · J1 ' + st.s1 + (twoHumans ? (' / J2 ' + st.s2) : '');
p2El.textContent = 'TURNO J' + st.turn + ' · TIRO ' + st.roll + ' · ' + remP + ' BOLOS';
}
}
}
if (use3dBw) { window.TV_GAME_RAF = requestAnimationFrame(frame); return; }
if (!sprRect(ctx, 'assets/games/arenas/bowling_alley.jpg', 0, 0, W, H)) { ctx.fillStyle = '#090d1b'; ctx.fillRect(0, 0, W, H); }
ctx.fillStyle = 'rgba(5, 8, 20, 0.22)'; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = 'rgba(180, 108, 42, 0.42)';
ctx.beginPath(); ctx.moveTo(W / 2 - topW / 2, laneTopY); ctx.lineTo(W / 2 + topW / 2, laneTopY);
ctx.lineTo(W / 2 + botW / 2, laneBotY); ctx.lineTo(W / 2 - botW / 2, laneBotY); ctx.closePath(); ctx.fill();
ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.stroke();
if (st.phase === 'aim') {
var a0 = proj(st.aimX, 0.08), a1 = proj(st.aimX + st.spin * 0.3, 0.88);
ctx.strokeStyle = st.turn === 2 ? '#F43F5E' : '#38BDF8'; ctx.setLineDash([8, 6]); ctx.lineWidth = 3;
ctx.beginPath(); ctx.moveTo(a0.sx, a0.sy); ctx.lineTo(a1.sx, a1.sy); ctx.stroke(); ctx.setLineDash([]);
}
for (var pi = 0; pi < st.pins.length; pi++) {
var pk = st.pins[pi], pp = proj(pk.x, pk.y);
ctx.save(); ctx.translate(pp.sx, pp.sy); ctx.rotate(pk.rot); ctx.scale(pp.sc, pp.sc);
ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(0, -14, 10, 22, 0, 0, Math.PI * 2); ctx.fill();
ctx.beginPath(); ctx.arc(0, -34, 7, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = '#DC2626'; ctx.fillRect(-7, -26, 14, 4); ctx.restore();
}
var bp = st.phase === 'aim' ? proj(st.aimX, 0.06) : proj(st.ball.x, st.ball.y), br = 26 * bp.sc;
if (!spr(ctx, st.turn === 2 ? 'assets/games/sports/ball_bowling2.png' : 'assets/games/sports/ball_bowling1.png', bp.sx, bp.sy, br * 2, br * 2, st.ball.rot)) {
ctx.fillStyle = '#0284C7'; ctx.beginPath(); ctx.arc(bp.sx, bp.sy, br, 0, Math.PI * 2); ctx.fill();
}
if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, bp.sx, bp.sy, br, W * 0.5, 40, 0.75);
if (st.phase === 'roll' && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, bp.sx, bp.sy, br * 1.9, st.turn === 2 ? '244,63,94' : '56,189,248', 0.36);
for (var s2 = 0; s2 < st.sparks.length; s2++) spr(ctx, s2 % 2 === 0 ? 'assets/games/particles/star_07.png' : 'assets/games/particles/spark_01.png', st.sparks[s2].x, st.sparks[s2].y, 26, 26, st.sparks[s2].life * 6);
if (st.bannerT > 0 && st.banner) {
ctx.fillStyle = 'rgba(8,12,24,0.85)'; ctx.fillRect(W / 2 - 210, 52, 420, 56);
ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 2.5; ctx.strokeRect(W / 2 - 210, 52, 420, 56);
ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#FEF08A'; ctx.textAlign = 'center'; ctx.fillText(st.banner, W / 2, 88);
}
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startGyroBowlingGame = startGyroBowlingGame;
function startGyroTennisGame(scr) {
if (typeof window.preloadTvGameSprites === 'function') {
window.preloadTvGameSprites(['assets/games/arenas/tennis_court.jpg', 'assets/games/sports/racket_metal.png', 'assets/games/sports/racket_wood.png', 'assets/games/sports/ball_tennis1.png', 'assets/games/sports/character_blue_1.png', 'assets/games/sports/character_blue_2.png', 'assets/games/sports/character_red_1.png', 'assets/games/sports/character_red_2.png', 'assets/games/particles/slash_01.png']);
}
var roomId = (typeof currentRoomId === 'string' && currentRoomId) ? currentRoomId : ('tn-' + Math.floor(1000 + Math.random() * 9000));
mountPlusShell(scr, 'tn', '🎾 Tenis Slam Pro 2P', 'J1 0 - 0 CPU', 'A 7 PUNTOS',
'Móvil Vertical (1P/2P): Inclina ◀ ▶ + Golpe Smash / Globo', 'Mando TV: ◀ ▶ Mover · OK Smash');
var canvas = document.getElementById('tn-canvas'), ctx = canvas.getContext('2d');
var p1El = document.getElementById('tn-p1'), ov = document.getElementById('tn-ov');
var ftEl = document.getElementById('tn-ft'), fsEl = document.getElementById('tn-fs');
var lobby = typeof window.createTvDualQrLobby === 'function'
? window.createTvDualQrLobby(document.getElementById('tn-arena'), { roomId: roomId, gameId: 'gyrotennis', title: '🎾 Tenis Slam Pro 2P · QR J1 y J2' })
: null;
connectPlusWs(roomId, 'gyrotennis', document.getElementById('tn-gyro-pill'), lobby);
var W = 920, H = 520, keys = { left: false, right: false, fire: false };
var st = { s1: 0, s2: 0, over: false, pauseT: 0.7, p1: { x: 0, y: 0.86, swingT: 0 }, p2: { x: 0, y: -0.86, swingT: 0 }, ball: { x: 0, y: 0, z: 0.3, vx: 0.25, vy: 1.05, vz: 0.4 }, banner: '¡SAQUE INICIAL!', surface: 'grass', hitSeq: 0, pointSeq: 0, lastScorer: 1 };
var use3dTn = Boolean(mount3dStage(document.getElementById('tn-arena'), canvas, 'mountTennis3D', {
getState: function () { return st; }
}));
function resetPt(dy) { st.ball = { x: (Math.random() - 0.5) * 0.4, y: 0, z: 0.32, vx: (Math.random() - 0.5) * 0.55, vy: dy * 1.15, vz: 0.45 }; st.pauseT = 0.65; }
function resetMatch() { st.s1 = 0; st.s2 = 0; st.over = false; ov.style.display = 'none'; resetPt(1); p1El.textContent = 'J1 0 - 0 ' + (twoHumans ? 'J2' : 'CPU'); }
document.getElementById('tn-replay').onclick = resetMatch;
window.tvGameKeyHandler = function (e, code) {
if (st.over && (code === 13 || code === 23 || code === 66 || code === 32)) { if (e.preventDefault) e.preventDefault(); resetMatch(); return true; }
if (code === 37 || code === 21) { keys.left = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 39 || code === 22) { keys.right = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 13 || code === 23 || code === 66 || code === 32) { keys.fire = true; if (e.preventDefault) e.preventDefault(); return true; }
return false;
};
window.tvGameKeyUpHandler = function (_e, code) {
if (code === 37 || code === 21) { keys.left = false; return true; }
if (code === 39 || code === 22) { keys.right = false; return true; }
if (code === 13 || code === 23 || code === 66 || code === 32) { keys.fire = false; return true; }
return false;
};
function proj(cx, cy) {
var t = (cy + 1) * 0.5;
return { x: W / 2 + cx * (140 + t * 185), y: 152 + t * 318, sc: 0.58 + t * 0.6 };
}
var last = performance.now();
function frame(now) {
if (window.TV_GAME_ACTIVE !== 'gyrotennis') return;
var dt = Math.min(0.035, Math.max(0.005, (now - last) / 1000)); last = now;
if (!st.over && (!lobby || lobby.isReady())) {
var f1 = pad1.expiresAt > Date.now(), f2 = twoHumans && pad2.expiresAt > Date.now();
var t1 = f1 ? Math.max(-1, Math.min(1, pad1.steer * 1.15)) : Math.max(-1, Math.min(1, st.p1.x + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * dt * 1.9));
st.p1.x += (t1 - st.p1.x) * Math.min(1, dt * 14);
if ((f1 && (pad1.swing > 1 || pad1.nitro)) || keys.fire) st.p1.swingT = 0.25;
st.p1.swingT = Math.max(0, st.p1.swingT - dt);
if (f2) {
st.p2.x += (Math.max(-1, Math.min(1, pad2.steer * 1.15)) - st.p2.x) * Math.min(1, dt * 14);
if (pad2.swing > 1 || pad2.nitro) st.p2.swingT = 0.25;
} else st.p2.x += Math.max(-dt * 1.15, Math.min(dt * 1.15, (st.ball.x - st.p2.x) * 3));
st.p2.swingT = Math.max(0, st.p2.swingT - dt);
if (st.pauseT > 0) st.pauseT -= dt;
else {
st.banner = '';
var b = st.ball; b.x += b.vx * dt; b.y += b.vy * dt; b.vz -= 2.4 * dt; b.z += b.vz * dt;
if (b.z <= 0) { b.z = 0; b.vz = Math.max(0.45, Math.abs(b.vz) * 0.72); }
if (b.x < -1.02 || b.x > 1.02) { b.vx *= -0.9; b.x = Math.max(-1.02, Math.min(1.02, b.x)); }
if (b.vy > 0 && b.y >= 0.72 && b.y <= 0.98 && Math.abs(b.x - st.p1.x) < 0.28) {
var sm1 = st.p1.swingT > 0 ? 1.38 : 1.04;
b.vy = -Math.min(2.3, Math.abs(b.vy) * sm1 + 0.14); b.vx = (b.x - st.p1.x) * 2.2; b.vz = (f1 && pad1.handbrake) ? 0.95 : 0.56;
st.hitSeq += 1; beep(sm1 > 1.2 ? 640 : 480, 0.08, 'triangle', 0.08); pushPlusTel(roomId, st.s1, st.s2, 'tennis_hit', sm1 > 1.2 ? 75 : 35);
}
if (b.vy < 0 && b.y <= -0.72 && b.y >= -0.98 && Math.abs(b.x - st.p2.x) < 0.26) {
var sm2 = st.p2.swingT > 0 ? 1.35 : 1.04;
b.vy = Math.min(2.2, Math.abs(b.vy) * sm2 + 0.12); b.vx = (b.x - st.p2.x) * 2.1; b.vz = 0.55; st.hitSeq += 1; beep(420, 0.08, 'triangle', 0.07);
}
if (b.y > 1.18) {
st.s2 += 1; st.pointSeq += 1; st.lastScorer = 2; st.banner = twoHumans ? '🎾 ¡PUNTO J2!' : '🎾 ¡PUNTO CPU!'; beep(240, 0.2, 'sawtooth', 0.08);
if (st.s2 >= 7) { st.over = true; ftEl.textContent = twoHumans ? '🏆 VICTORIA JUGADOR 2' : '🎾 VICTORIA CPU'; fsEl.textContent = st.s1 + ' - ' + st.s2; ov.style.display = 'flex'; } else resetPt(-1);
} else if (b.y < -1.18) {
st.s1 += 1; st.pointSeq += 1; st.lastScorer = 1; st.banner = '🏆 ¡PUNTO JUGADOR 1!'; beep(740, 0.2, 'triangle', 0.09);
if (st.s1 >= 7) { st.over = true; ftEl.textContent = '🏆 ¡CAMPEÓN GRAND SLAM J1!'; fsEl.textContent = st.s1 + ' - ' + st.s2; ov.style.display = 'flex'; } else resetPt(1);
}
p1El.textContent = 'J1 ' + st.s1 + ' - ' + st.s2 + (twoHumans ? ' J2' : ' CPU');
}
}
if (use3dTn) { window.TV_GAME_RAF = requestAnimationFrame(frame); return; }
if (!sprRect(ctx, 'assets/games/arenas/tennis_court.jpg', 0, 0, W, H)) { ctx.fillStyle = '#14532d'; ctx.fillRect(0, 0, W, H); }
var p2s = proj(st.p2.x, -0.82), p1s = proj(st.p1.x, 0.82), bs = proj(st.ball.x, st.ball.y), lift = st.ball.z * 78 * bs.sc;
var af = (Math.floor(now * 0.008) % 3) + 1;
spr(ctx, 'assets/games/sports/character_red_' + af + '.png', p2s.x, p2s.y - 14 * p2s.sc, 44 * p2s.sc, 44 * p2s.sc, Math.PI);
spr(ctx, 'assets/games/sports/racket_wood.png', p2s.x + 24 * p2s.sc, p2s.y, 44 * p2s.sc, 44 * p2s.sc, 1.3 + (st.p2.swingT > 0 ? 0.5 : 0));
spr(ctx, 'assets/games/sports/character_blue_' + af + '.png', p1s.x, p1s.y + 18 * p1s.sc, 50 * p1s.sc, 50 * p1s.sc, 0);
spr(ctx, 'assets/games/sports/racket_metal.png', p1s.x + 28 * p1s.sc, p1s.y - 6 * p1s.sc, 52 * p1s.sc, 52 * p1s.sc, -0.55 - (st.p1.swingT > 0 ? 0.85 : 0));
if (st.p1.swingT > 0.16) {
if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, p1s.x, p1s.y - 14, 52, '250,204,21', 0.45);
spr(ctx, 'assets/games/particles/slash_01.png', p1s.x, p1s.y - 18, 70, 70, now * 0.02);
}
ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(bs.x, bs.y + 4, 11 * bs.sc, 5 * bs.sc, 0, 0, Math.PI * 2); ctx.fill();
if (!spr(ctx, 'assets/games/sports/ball_tennis1.png', bs.x, bs.y - lift, 24 * bs.sc, 24 * bs.sc, now * 0.012)) {
ctx.fillStyle = '#BEF264'; ctx.beginPath(); ctx.arc(bs.x, bs.y - lift, 11 * bs.sc, 0, Math.PI * 2); ctx.fill();
}
if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, bs.x, bs.y - lift, 11 * bs.sc, W * 0.5, 40, 0.68);
if (st.banner) { ctx.fillStyle = 'rgba(6,12,22,0.8)'; ctx.fillRect(W / 2 - 170, 44, 340, 44); ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#BEF264'; ctx.textAlign = 'center'; ctx.fillText(st.banner, W / 2, 72); }
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startGyroTennisGame = startGyroTennisGame;
function startGyroLabGame(scr) {
if (typeof window.preloadTvGameSprites === 'function') {
window.preloadTvGameSprites(['assets/games/arenas/labyrinth_board.jpg', 'assets/games/rolling/block_corner_large.png', 'assets/games/rolling/ball_blue_large.png', 'assets/games/rolling/ball_red_large.png', 'assets/games/rolling/hole_large.png', 'assets/games/rolling/hole_large_end.png', 'assets/games/particles/star_04.png', 'assets/games/particles/circle_02.png']);
}
var roomId = (typeof currentRoomId === 'string' && currentRoomId) ? currentRoomId : ('lb-' + Math.floor(1000 + Math.random() * 9000));
mountPlusShell(scr, 'lb', '🧭 Laberinto Esfera 3D', 'ESTRELLAS 0/5', 'TIEMPO 60s',
'Móvil Vertical: Inclina en 2 ejes para rodar la esfera · Evita agujeros rojos', 'Mando TV: ◀ ▲ ▶ ▼ Rodar esfera hasta el portal verde');
var canvas = document.getElementById('lb-canvas'), ctx = canvas.getContext('2d');
var p1El = document.getElementById('lb-p1'), p2El = document.getElementById('lb-p2'), ov = document.getElementById('lb-ov');
var ftEl = document.getElementById('lb-ft'), fsEl = document.getElementById('lb-fs');
var lobby = typeof window.createTvDualQrLobby === 'function'
? window.createTvDualQrLobby(document.getElementById('lb-arena'), { roomId: roomId, gameId: 'gyrolab', title: '🧭 Laberinto Esfera 3D · QR J1 y J2' })
: null;
connectPlusWs(roomId, 'gyrolab', document.getElementById('lb-gyro-pill'), lobby);
var W = 920, H = 520, COLS = 19, ROWS = 11, CELL = 44, OX = Math.floor((W - COLS * CELL) / 2), OY = Math.floor((H - ROWS * CELL) / 2);
var LAB_LEVELS = [
['###################', '#S...*..#.....*...#', '###.###.#.#####.#.#', '#...#.*.......#.#.#', '#.O.#.###.###.#.#.#', '#...#...#.#...#...#', '#.#####.#.#.#####.#', '#*..#...#...#O..*.#', '###.#.#####.#.###.#', '#...*.......#....E#', '###################'],
['###################', '#S..#.*.......#..*#', '#.#.#.#####.#.#.#.#', '#.#...#...#.#...#.#', '#.###.#.O.#.###.#.#', '#.*.#.......#*..#.#', '#.#######.###.###.#', '#...O...#...#..*..#', '#.#####.#.#.#.###.#', '#.*.......#..O...E#', '###################'],
['###################', '#S...*....#.*.....#', '#.##.####.#.###.#.#', '#.#O.#..#...#...#.#', '#....#..###.#.###.#', '####.#....#...*..E#', '#.*..####.#####.#.#', '#.#..#..O.......#.#', '#.#.##.########.#.#', '#...*.......*O..*.#', '###################']
];
var grid = [], lvlIdx = 0, starsT = 0, starsC = 0, starsAll = 0, tLeft = 65, over = false, keys = { l: false, r: false, u: false, d: false };
var b1 = { x: 1.5, y: 1.5, vx: 0, vy: 0 }, b2 = { x: 1.5, y: 1.5, vx: 0, vy: 0 };
var lbTiltX = 0, lbTiltZ = 0, collectSeq = 0, fallSeq = 0, winSeq = 0;
function loadLabLevel(idx) {
lvlIdx = idx; grid = []; starsT = 0; starsC = 0; tLeft = 65; over = false;
b1 = { x: 1.5, y: 1.5, vx: 0, vy: 0 }; b2 = { x: 1.5, y: 1.5, vx: 0, vy: 0 };
var tpl = LAB_LEVELS[idx] || LAB_LEVELS[0];
for (var r = 0; r < ROWS; r++) {
var row = [];
for (var c = 0; c < COLS; c++) { var ch = tpl[r].charAt(c); if (ch === '*') starsT++; row.push(ch); }
grid.push(row);
}
ov.style.display = 'none'; p1El.textContent = 'ESTRELLAS 0/' + starsT; p2El.textContent = 'NIVEL ' + (lvlIdx + 1) + '/3 · 65s';
}
function initLab() { starsAll = 0; loadLabLevel(0); }
initLab();
var use3dLb = Boolean(mount3dStage(document.getElementById('lb-arena'), canvas, 'mountLabyrinth3D', {
getState: function () {
return { level: lvlIdx + 1, cols: COLS, rows: ROWS, grid: grid, tiltX: lbTiltX, tiltZ: lbTiltZ, twoHumans: twoHumans, ball1: b1, ball2: twoHumans ? b2 : null, collectSeq: collectSeq, fallSeq: fallSeq, winSeq: winSeq };
}
}));
document.getElementById('lb-replay').onclick = initLab;
window.tvGameKeyHandler = function (e, code) {
if (over && (code === 13 || code === 23 || code === 66 || code === 32)) { if (e.preventDefault) e.preventDefault(); initLab(); return true; }
if (code === 37 || code === 21) { keys.l = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 39 || code === 22) { keys.r = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 38 || code === 19) { keys.u = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 40 || code === 20) { keys.d = true; if (e.preventDefault) e.preventDefault(); return true; }
return false;
};
window.tvGameKeyUpHandler = function (_e, code) {
if (code === 37 || code === 21) { keys.l = false; return true; }
if (code === 39 || code === 22) { keys.r = false; return true; }
if (code === 38 || code === 19) { keys.u = false; return true; }
if (code === 40 || code === 20) { keys.d = false; return true; }
return false;
};
function stepBall(b, ax, ay, dt, slot) {
var rad = 0.33, sub = 2, sdt = dt / sub, damp = Math.pow(0.28, sdt);
for (var s = 0; s < sub; s++) {
b.vx = (b.vx + ax * 15.5 * sdt) * damp;
b.vy = (b.vy + ay * 15.5 * sdt) * damp;
b.x += b.vx * sdt; b.y += b.vy * sdt;
var cr = Math.floor(b.y), cc = Math.floor(b.x);
for (var rr = cr - 1; rr <= cr + 1; rr++) {
for (var cc2 = cc - 1; cc2 <= cc + 1; cc2++) {
var wall = rr < 0 || rr >= ROWS || cc2 < 0 || cc2 >= COLS || grid[rr][cc2] === '#';
if (!wall) continue;
var clX = Math.max(cc2, Math.min(b.x, cc2 + 1)), clY = Math.max(rr, Math.min(b.y, rr + 1));
var dx = b.x - clX, dy = b.y - clY, d2 = dx * dx + dy * dy;
if (d2 < rad * rad) {
var d = Math.sqrt(d2) || 0.0001;
var nx = dx / d, ny = dy / d, pen = rad - d;
b.x += nx * pen; b.y += ny * pen;
var vn = b.vx * nx + b.vy * ny;
if (vn < 0) { b.vx -= nx * vn * 1.22; b.vy -= ny * vn * 1.22; }
}
}
}
}
var gc = Math.floor(b.x), gr = Math.floor(b.y), ch = grid[gr] && grid[gr][gc];
if (ch === '*') { grid[gr][gc] = '.'; starsC++; starsAll++; collectSeq++; beep(760, 0.12, 'triangle', 0.08); pushPlusTel(roomId, starsAll, Math.ceil(tLeft), 'pingpong_hit', 45); }
else if (ch === 'O' && Math.hypot(b.x - (gc + 0.5), b.y - (gr + 0.5)) < 0.34) {
b.x = 1.5; b.y = 1.5; b.vx = 0; b.vy = 0; fallSeq++; beep(160, 0.2, 'sawtooth', 0.08); pushPlusTel(roomId, starsAll, Math.ceil(tLeft), 'trap', 95);
} else if (ch === 'E') {
winSeq++; beep(920, 0.28, 'triangle', 0.1); pushPlusTel(roomId, starsAll, Math.ceil(tLeft), 'lab_win', 130);
if (lvlIdx + 1 < LAB_LEVELS.length) { loadLabLevel(lvlIdx + 1); }
else {
over = true;
ftEl.textContent = '🏆 ¡LABERINTO 3D COMPLETADO (J' + slot + ')!';
fsEl.textContent = starsAll + ' estrellas totales · ' + Math.ceil(tLeft) + 's sobrantes';
ov.style.display = 'flex';
}
}
}
var last = performance.now();
function frame(now) {
if (window.TV_GAME_ACTIVE !== 'gyrolab') return;
var dt = Math.min(0.035, Math.max(0.005, (now - last) / 1000)); last = now;
if (!over && (!lobby || lobby.isReady())) {
tLeft = Math.max(0, tLeft - dt);
if (tLeft <= 0) { over = true; ftEl.textContent = '⏱️ TIEMPO AGOTADO'; fsEl.textContent = starsC + '/' + starsT + ' estrellas'; ov.style.display = 'flex'; }
var f1 = pad1.expiresAt > Date.now();
var ax1 = f1 ? pad1.steer : ((keys.r ? 1 : 0) - (keys.l ? 1 : 0));
var ay1 = f1 ? -pad1.pitch : ((keys.d ? 1 : 0) - (keys.u ? 1 : 0));
lbTiltX = ay1 * 0.08; lbTiltZ = -ax1 * 0.08;
stepBall(b1, ax1, ay1, dt, 1);
if (twoHumans) { var f2 = pad2.expiresAt > Date.now(); stepBall(b2, f2 ? pad2.steer : 0, f2 ? -pad2.pitch : 0, dt, 2); }
p1El.textContent = 'ESTRELLAS ' + starsC + '/' + starsT; p2El.textContent = 'TIEMPO ' + Math.ceil(tLeft) + 's';
}
if (use3dLb) { window.TV_GAME_RAF = requestAnimationFrame(frame); return; }
if (!sprRect(ctx, 'assets/games/arenas/labyrinth_board.jpg', 0, 0, W, H)) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H); }
ctx.fillStyle = 'rgba(4,7,16,0.34)'; ctx.fillRect(0, 0, W, H);
for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
var ch = grid[r][c], x = OX + c * CELL, y = OY + r * CELL;
if (ch === '#') sprRect(ctx, 'assets/games/rolling/block_corner_large.png', x + 1, y + 1, CELL - 2, CELL - 2);
else if (ch === 'O') spr(ctx, 'assets/games/rolling/hole_large.png', x + CELL / 2, y + CELL / 2, 34, 34, 0);
else if (ch === '*') { if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, x + CELL / 2, y + CELL / 2, 24, '250,204,21', 0.42); spr(ctx, 'assets/games/particles/star_04.png', x + CELL / 2, y + CELL / 2, 32, 32, now * 0.004); }
else if (ch === 'E') { if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, x + CELL / 2, y + CELL / 2, 34, '34,197,94', 0.46); spr(ctx, 'assets/games/particles/circle_02.png', x + CELL / 2, y + CELL / 2, 42, 42, -now * 0.003); spr(ctx, 'assets/games/rolling/hole_large_end.png', x + CELL / 2, y + CELL / 2, 36, 36, 0); }
}
spr(ctx, 'assets/games/rolling/ball_blue_large.png', OX + b1.x * CELL, OY + b1.y * CELL, 30, 30, b1.x * 2.5);
if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, OX + b1.x * CELL, OY + b1.y * CELL, 14, W * 0.5, 40, 0.7);
if (twoHumans) {
spr(ctx, 'assets/games/rolling/ball_red_large.png', OX + b2.x * CELL, OY + b2.y * CELL, 30, 30, b2.x * 2.5);
if (typeof window.drawTvDirectionalBall === 'function') window.drawTvDirectionalBall(ctx, OX + b2.x * CELL, OY + b2.y * CELL, 14, W * 0.5, 40, 0.7);
}
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startGyroLabGame = startGyroLabGame;
})();
