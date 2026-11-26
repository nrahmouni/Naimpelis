var tvSpWs = null;
var tvSpHasP1 = false;
var tvSpHasP2 = false;
var tvSpGyro1 = { steer: 0, pitch: 0, roll: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
var tvSpGyro2 = { steer: 0, pitch: 0, roll: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
var tvSp3dHandle = null;
function closeTvSoccerPongGame() {
if (tvSp3dHandle && tvSp3dHandle.dispose) {
try { tvSp3dHandle.dispose(); } catch (e0) {}
}
tvSp3dHandle = null;
if (tvSpWs) {
tvSpWs.onclose = null;
try { tvSpWs.close(); } catch (e) {}
tvSpWs = null;
}
tvSpHasP1 = false;
tvSpHasP2 = false;
tvSpGyro1 = { steer: 0, pitch: 0, roll: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
tvSpGyro2 = { steer: 0, pitch: 0, roll: 0, nitro: false, handbrake: false, swing: 0, expiresAt: 0 };
}
window.closeTvSoccerPongGame = closeTvSoccerPongGame;
function pushTvSoccerPongTelemetry(roomId, targetSlot, pulseMs, tag, s1, s2, spd, over) {
if (!tvSpWs || tvSpWs.readyState !== 1) return;
if (!tvSpHasP1 && !tvSpHasP2) return;
try {
tvSpWs.send(JSON.stringify({
type: 'RACING_TV_TELEMETRY',
payload: {
roomId: roomId,
speedKmh: Math.min(350, Math.max(0, Math.round(spd || 0))),
rpmPct: 84,
gear: 2,
lap: 1,
totalLaps: 1,
position: 1,
totalCars: 2,
nitroPct: 100,
collisionImpact: tag === 'pingpong_hit' ? 0.72 : 1,
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
function startTvSoccerPongGame(scr) {
var roomId = (typeof currentRoomId === 'string' && currentRoomId)
? currentRoomId
: ('sp-' + (typeof pairingCode === 'string' && pairingCode ? pairingCode : ('tv' + Math.floor(1000 + Math.random() * 9000))));
scr.innerHTML =
'<div class="tv-game-topbar"><div class="tv-game-top-left">' +
'<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
'<div class="tv-game-top-title">⚽ Fútbol Pong 3D · 1P / 2P Móvil</div></div><div class="tv-game-top-right">' +
'<div class="tv-game-hud-pill accent-purple" id="sp-gyro-pill">📱 Esperando Móviles</div>' +
'<div class="tv-game-hud-pill accent-green" id="sp-score-pill">AZUL 0 - 0 ROJO</div>' +
'<div class="tv-game-hud-pill" id="sp-goal-pill">A 7 GOLES</div></div></div>' +
'<div class="tv-game-arena" id="sp-arena">' +
'<canvas id="tv-sp-canvas" class="tv-game-canvas" width="920" height="520"></canvas>' +
'<div class="tv-game-finish-overlay" id="sp-finish-ov"><div class="tv-game-finish-card">' +
'<div class="tv-game-finish-title" id="sp-fin-title">🏆 ¡VICTORIA!</div>' +
'<div class="tv-game-finish-sub" id="sp-fin-sub">Marcador final</div>' +
'<div class="tv-game-finish-btns">' +
'<button type="button" id="btn-sp-replay" class="tv-btn-primary" tabindex="0">Revancha (OK)</button>' +
'<button type="button" id="btn-sp-exit" class="tv-btn" tabindex="0">Salir al Menú</button>' +
'</div></div></div></div>' +
'<div class="tv-game-controls-hint">' +
'<span>Móvil (Vertical): Inclina o pulsa ▲ / ▼ para mover · ⚡ Power Tiro · 2 Móviles = Azul vs Rojo</span>' +
'<span>Mando TV: ▲ / ▼ Subir/Bajar pala · OK Tiro Power · Primero a 7 goles</span></div>';
document.getElementById('btn-game-back').onclick = closeTvGame;
document.getElementById('btn-sp-exit').onclick = closeTvGame;
var canvas = document.getElementById('tv-sp-canvas');
var ctx = canvas.getContext('2d');
var arenaEl = document.getElementById('sp-arena');
var scorePill = document.getElementById('sp-score-pill');
var goalPill = document.getElementById('sp-goal-pill');
var gyroPill = document.getElementById('sp-gyro-pill');
var finOv = document.getElementById('sp-finish-ov');
var finTitle = document.getElementById('sp-fin-title');
var finSub = document.getElementById('sp-fin-sub');
var spLobby = typeof window.createTvDualQrLobby === 'function'
? window.createTvDualQrLobby(arenaEl, { roomId: roomId, gameId: 'soccerpong', title: '⚽ Fútbol Pong 3D · QR J1 y J2' })
: null;
function connectSpWs() {
if (!window.WebSocket || typeof getTvRacingWsUrl !== 'function') return;
try {
var ws = new WebSocket(getTvRacingWsUrl());
tvSpWs = ws;
ws.onopen = function () {
if (tvSpWs !== ws) return;
ws.send(JSON.stringify({
type: 'JOIN_ROOM',
payload: { roomId: roomId, roomName: 'SOCCERPONG', user: { id: 'tv-sp-' + roomId, name: 'Smart TV', avatar: '⚽', color: '#22C55E', isHost: true } }
}));
ws.send(JSON.stringify({
type: 'GYRO_CONTROLLER_JOIN',
payload: { roomId: roomId, role: 'display', deviceName: 'Fútbol Pong TV', gameId: 'soccerpong' }
}));
};
ws.onmessage = function (ev) {
if (tvSpWs !== ws) return;
try {
var msg = JSON.parse(ev.data);
if (msg.type === 'GYRO_PEER_STATUS' && msg.payload) {
var list = msg.payload.controllers || [];
if (spLobby) spLobby.onStatus(list);
tvSpHasP1 = false;
tvSpHasP2 = false;
for (var ci = 0; ci < list.length; ci++) {
if (list[ci].slot === 2 || (ci === 1 && !list[ci].slot)) tvSpHasP2 = true;
else tvSpHasP1 = true;
}
if (gyroPill) {
if (tvSpHasP1 || tvSpHasP2) {
gyroPill.className = 'tv-game-hud-pill accent-green';
gyroPill.textContent = tvSpHasP2 ? '📱 2 Móviles (Azul vs Rojo)' : '📱 J1 Azul Conectado';
} else {
gyroPill.className = 'tv-game-hud-pill accent-purple';
gyroPill.textContent = '📱 Esperando Móviles';
}
}
} else if (msg.type === 'GYRO_INPUT_RELAY' && msg.payload) {
var p = msg.payload;
var tgt = p.playerSlot === 2 ? tvSpGyro2 : tvSpGyro1;
tgt.steer = typeof p.steer === 'number' ? p.steer : 0;
tgt.pitch = typeof p.pitch === 'number' ? p.pitch : 0;
tgt.roll = typeof p.roll === 'number' ? p.roll : 0;
tgt.nitro = Boolean(p.nitro);
tgt.handbrake = Boolean(p.handbrake);
tgt.swing = typeof p.swing === 'number' ? p.swing : 0;
tgt.expiresAt = Date.now() + 1400;
}
} catch (e) {}
};
ws.onclose = function () {
if (tvSpWs === ws && TV_GAME_ACTIVE === 'soccerpong') {
setTimeout(function () { if (TV_GAME_ACTIVE === 'soccerpong') connectSpWs(); }, 2500);
}
};
} catch (e) {}
}
connectSpWs();
var W = 920, H = 520, WIN_GOALS = 7;
var keys = { up: false, down: false, power: false };
var pointerTarget = { y: 0, expiresAt: 0 };
var hitSeq = 0, wallSeq = 0, goalSeq = 0;
var kickoffPause = 0.65;
var over = false;
var st = {
s1: 0, s2: 0, paused: false,
p1: { y: 0, vy: 0, hitT: 0, powerT: 0 },
p2: { y: 0, vy: 0, hitT: 0, powerT: 0 },
ball: { x: 0, y: 0, vx: 0.85, vy: 0.25, power: false, lastHit: 1 },
hitEvent: { seq: 0, x: 0, y: 0, color: '#3b82f6', power: false },
wallHitEvent: { seq: 0, side: 'top', x: 0 },
goalEvent: { seq: 0, scorer: 1 }
};
if (arenaEl && window.RiffanTvGames && typeof window.RiffanTvGames.mountSoccerPong3D === 'function') {
var spStage = document.createElement('div');
spStage.className = 'tv-3d-stage';
arenaEl.insertBefore(spStage, arenaEl.firstChild);
try {
tvSp3dHandle = window.RiffanTvGames.mountSoccerPong3D(spStage, {
getState: function () { return st; },
onPointerMoveY: function (ny) { pointerTarget.y = ny; pointerTarget.expiresAt = Date.now() + 450; },
onPointerDownField: function (ny) { pointerTarget.y = ny; pointerTarget.expiresAt = Date.now() + 450; st.p1.powerT = 0.25; },
onCenterTogglePause: function () { st.paused = !st.paused; }
});
} catch (eSp) { tvSp3dHandle = null; }
if (tvSp3dHandle) {
if (canvas) canvas.style.display = 'none';
} else if (spStage.parentNode) {
spStage.parentNode.removeChild(spStage);
}
}
function serveBall(dir) {
var angle = (Math.random() - 0.5) * 0.78;
var spd = 0.88;
st.ball = {
x: 0, y: 0,
vx: Math.cos(angle) * spd * dir,
vy: Math.sin(angle) * spd,
power: false,
lastHit: dir === 1 ? 1 : 2
};
kickoffPause = 0.6;
}
function syncHud(p2Human) {
scorePill.textContent = 'AZUL ' + st.s1 + ' - ' + st.s2 + (p2Human ? ' ROJO' : ' CPU');
goalPill.textContent = st.paused ? 'PAUSA' : 'A ' + WIN_GOALS + ' GOLES';
}
function resetSp() {
st.s1 = 0; st.s2 = 0; st.paused = false; over = false;
st.p1 = { y: 0, vy: 0, hitT: 0, powerT: 0 };
st.p2 = { y: 0, vy: 0, hitT: 0, powerT: 0 };
finOv.style.display = 'none';
serveBall(1);
syncHud(tvSpHasP2);
}
document.getElementById('btn-sp-replay').onclick = resetSp;
tvGameKeyHandler = function (e, code) {
if (over && (code === 13 || code === 23 || code === 66 || code === 32)) {
if (e.preventDefault) e.preventDefault(); resetSp(); return true;
}
if (code === 38 || code === 19 || code === 37 || code === 21) { keys.up = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 40 || code === 20 || code === 39 || code === 22) { keys.down = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 13 || code === 23 || code === 66 || code === 32) { keys.power = true; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 80) { st.paused = !st.paused; syncHud(tvSpHasP2); if (e.preventDefault) e.preventDefault(); return true; }
return false;
};
tvGameKeyUpHandler = function (_e, code) {
if (code === 38 || code === 19 || code === 37 || code === 21) { keys.up = false; return true; }
if (code === 40 || code === 20 || code === 39 || code === 22) { keys.down = false; return true; }
if (code === 13 || code === 23 || code === 66 || code === 32) { keys.power = false; return true; }
return false;
};
var lastTs = performance.now();
function frame(now) {
if (TV_GAME_ACTIVE !== 'soccerpong') return;
var dt = Math.min(0.032, Math.max(0.004, (now - lastTs) / 1000));
lastTs = now;
var epoch = Date.now();
var useG1 = epoch < tvSpGyro1.expiresAt;
var useG2 = epoch < tvSpGyro2.expiresAt;
var padSpeed = 2.05;
if (!st.paused && !over && (!spLobby || spLobby.isReady())) {
var p1TargetVy = 0;
if (epoch < pointerTarget.expiresAt) {
var pd = pointerTarget.y - st.p1.y;
p1TargetVy = Math.max(-1, Math.min(1, pd * 7.5)) * padSpeed * 1.4;
} else if (useG1) {
var btn1 = tvSpGyro1.roll || 0;
var axis1 = Math.abs(btn1) > 0.1
? btn1
: (Math.abs(tvSpGyro1.pitch) > Math.abs(tvSpGyro1.steer) ? -tvSpGyro1.pitch : tvSpGyro1.steer);
p1TargetVy = axis1 * padSpeed * 1.35;
} else {
p1TargetVy = ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * padSpeed;
}
var prevY1 = st.p1.y;
st.p1.y = Math.max(-1, Math.min(1, st.p1.y + p1TargetVy * dt));
st.p1.vy = (st.p1.y - prevY1) / Math.max(0.005, dt);
if (keys.power || (useG1 && (tvSpGyro1.nitro || tvSpGyro1.swing > 0.55))) {
st.p1.powerT = 0.28;
} else {
st.p1.powerT = Math.max(0, st.p1.powerT - dt);
}
var p2TargetVy = 0;
if (useG2) {
var btn2 = tvSpGyro2.roll || 0;
var axis2 = Math.abs(btn2) > 0.1
? btn2
: (Math.abs(tvSpGyro2.pitch) > Math.abs(tvSpGyro2.steer) ? -tvSpGyro2.pitch : tvSpGyro2.steer);
p2TargetVy = axis2 * padSpeed * 1.35;
if (tvSpGyro2.nitro || tvSpGyro2.swing > 0.55) st.p2.powerT = 0.28;
else st.p2.powerT = Math.max(0, st.p2.powerT - dt);
} else {
var aiAim = st.ball.vx > 0 ? st.ball.y * 1.08 : st.ball.y * 0.45;
var aiDelta = aiAim - st.p2.y;
if (Math.abs(aiDelta) > 0.05) {
p2TargetVy = (aiDelta > 0 ? 1 : -1) * Math.min(1.52, Math.abs(aiDelta) * 5.2);
}
st.p2.powerT = Math.max(0, st.p2.powerT - dt);
}
var prevY2 = st.p2.y;
st.p2.y = Math.max(-1, Math.min(1, st.p2.y + p2TargetVy * dt));
st.p2.vy = (st.p2.y - prevY2) / Math.max(0.005, dt);
st.p1.hitT = Math.max(0, st.p1.hitT - dt * 3.8);
st.p2.hitT = Math.max(0, st.p2.hitT - dt * 3.8);
if (kickoffPause > 0) {
kickoffPause = Math.max(0, kickoffPause - dt);
} else {
var sub = 2, sdt = dt / sub;
for (var s = 0; s < sub; s++) {
var b = st.ball;
b.x += b.vx * sdt;
b.y += b.vy * sdt;
if (b.y <= -0.92 && b.vy < 0) {
b.y = -0.92; b.vy = -b.vy;
wallSeq += 1; st.wallHitEvent = { seq: wallSeq, side: 'top', x: b.x };
playTvGameBeep(480, 0.035, 'triangle', 0.07);
} else if (b.y >= 0.92 && b.vy > 0) {
b.y = 0.92; b.vy = -b.vy;
wallSeq += 1; st.wallHitEvent = { seq: wallSeq, side: 'bottom', x: b.x };
playTvGameBeep(480, 0.035, 'triangle', 0.07);
}
var pHalf = 0.255, p1X = -0.865, p2X = 0.865;
if (b.vx < 0 && b.x <= p1X + 0.06 && b.x >= p1X - 0.08 && Math.abs(b.y - st.p1.y * 0.74) <= pHalf) {
var off1 = Math.max(-1, Math.min(1, (b.y - st.p1.y * 0.74) / pHalf));
var pw1 = st.p1.powerT > 0;
var sp1 = Math.min(1.95, Math.sqrt(b.vx * b.vx + b.vy * b.vy) * (pw1 ? 1.24 : 1.045) + (pw1 ? 0.22 : 0.03));
var ang1 = off1 * 0.92 + Math.max(-0.22, Math.min(0.22, st.p1.vy * 0.14));
b.vx = Math.cos(ang1) * sp1; b.vy = Math.sin(ang1) * sp1; b.x = p1X + 0.065;
b.power = pw1 || sp1 > 1.38; b.lastHit = 1; st.p1.hitT = 1;
hitSeq += 1; st.hitEvent = { seq: hitSeq, x: b.x, y: b.y, color: '#3b82f6', power: b.power };
playTvGameBeep(b.power ? 680 : 540, 0.05, 'triangle', 0.09);
pushTvSoccerPongTelemetry(roomId, 1, b.power ? 65 : 30, 'pingpong_hit', st.s1, st.s2, sp1 * 90, false);
} else if (b.vx > 0 && b.x >= p2X - 0.06 && b.x <= p2X + 0.08 && Math.abs(b.y - st.p2.y * 0.74) <= pHalf) {
var off2 = Math.max(-1, Math.min(1, (b.y - st.p2.y * 0.74) / pHalf));
var pw2 = st.p2.powerT > 0;
var sp2 = Math.min(1.95, Math.sqrt(b.vx * b.vx + b.vy * b.vy) * (pw2 ? 1.22 : 1.045) + (pw2 ? 0.18 : 0.03));
var ang2 = off2 * 0.92 + Math.max(-0.22, Math.min(0.22, st.p2.vy * 0.14));
b.vx = -Math.cos(ang2) * sp2; b.vy = Math.sin(ang2) * sp2; b.x = p2X - 0.065;
b.power = pw2 || sp2 > 1.38; b.lastHit = 2; st.p2.hitT = 1;
hitSeq += 1; st.hitEvent = { seq: hitSeq, x: b.x, y: b.y, color: '#ef4444', power: b.power };
playTvGameBeep(b.power ? 640 : 490, 0.05, 'triangle', 0.09);
if (useG2) pushTvSoccerPongTelemetry(roomId, 2, b.power ? 65 : 30, 'pingpong_hit', st.s1, st.s2, sp2 * 90, false);
}
if (Math.abs(b.x) > 0.94 && Math.abs(b.y) > 0.78) {
b.vy = (b.y >= 0 ? -1 : 1) * Math.max(0.45, Math.abs(b.vy));
b.vx = (b.x >= 0 ? -1 : 1) * Math.max(0.55, Math.abs(b.vx));
b.x = (b.x >= 0 ? 1 : -1) * 0.93;
playTvGameBeep(420, 0.035, 'sine', 0.06);
}
if (b.x < -1.03 || b.x > 1.03) {
var scorer = b.x > 1.03 ? 1 : 2;
if (scorer === 1) st.s1 += 1; else st.s2 += 1;
goalSeq += 1; st.goalEvent = { seq: goalSeq, scorer: scorer };
playTvGameBeep(scorer === 1 ? 760 : 340, 0.18, 'triangle', 0.12);
if (st.s1 >= WIN_GOALS || st.s2 >= WIN_GOALS) {
over = true;
var p1Won = st.s1 > st.s2;
pushTvSoccerPongTelemetry(roomId, scorer, 140, 'pingpong_point', st.s1, st.s2, 0, true);
finTitle.textContent = p1Won ? '🏆 ¡VICTORIA EQUIPO AZUL!' : (useG2 ? '🏆 ¡VICTORIA EQUIPO ROJO!' : '🏆 ¡GANA EL RIVAL ROJO!');
finSub.textContent = 'Marcador final: AZUL ' + st.s1 + ' - ' + st.s2;
finOv.style.display = '-webkit-flex'; finOv.style.display = 'flex';
var rb = document.getElementById('btn-sp-replay'); if (rb && rb.focus) rb.focus();
} else {
pushTvSoccerPongTelemetry(roomId, scorer, 85, 'pingpong_point', st.s1, st.s2, 120, false);
serveBall(scorer === 1 ? -1 : 1);
}
break;
}
}
}
syncHud(useG2);
}
if (tvSp3dHandle) {
TV_GAME_RAF = requestAnimationFrame(frame);
return;
}
ctx.fillStyle = '#ddd2af';
ctx.fillRect(0, 0, W, H);
var pX = 96, pY = 72, pW = W - 192, pH = H - 144;
for (var bi = 0; bi < 8; bi++) {
ctx.fillStyle = bi % 2 === 0 ? '#66b938' : '#56a62c';
ctx.fillRect(pX, pY + bi * (pH / 8), pW, pH / 8 + 1);
}
ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 4;
ctx.strokeRect(pX + 10, pY + 8, pW - 20, pH - 16);
ctx.beginPath(); ctx.moveTo(W * 0.5, pY + 8); ctx.lineTo(W * 0.5, pY + pH - 8); ctx.stroke();
ctx.beginPath(); ctx.arc(W * 0.5, H * 0.5, 62, 0, Math.PI * 2); ctx.stroke();
for (var si = 0; si < 5; si++) {
var bx = pX + 18 + si * 144;
ctx.fillStyle = si % 2 === 0 ? '#d8e0e8' : '#e6ebf0';
ctx.fillRect(bx, pY - 28, 128, 30);
ctx.fillRect(bx, pY + pH - 2, 128, 30);
ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
ctx.strokeRect(bx, pY - 28, 128, 30); ctx.strokeRect(bx, pY + pH - 2, 128, 30);
}
ctx.fillStyle = '#7c4a1e';
ctx.fillRect(pX - 18, pY - 10, 18, pH + 20);
ctx.fillRect(pX + pW, pY - 10, 18, pH + 20);
ctx.fillStyle = '#f8fafc';
ctx.fillRect(pX - 54, H * 0.5 - 30, 56, 60);
ctx.fillRect(pX + pW - 2, H * 0.5 - 30, 56, 60);
ctx.font = '900 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#1e293b';
ctx.fillText(String(st.s1), pX - 26, H * 0.5 + 13);
ctx.fillText(String(st.s2), pX + pW + 26, H * 0.5 + 13);
var p1Y = H * 0.5 + st.p1.y * (pH * 0.34);
var p2Y = H * 0.5 + st.p2.y * (pH * 0.34);
ctx.fillStyle = '#2563eb'; ctx.fillRect(pX + 44, p1Y - 48, 22, 96);
ctx.fillStyle = '#ef4444'; ctx.fillRect(pX + pW - 66, p2Y - 48, 22, 96);
var ballX = W * 0.5 + st.ball.x * (pW * 0.46);
var ballY = H * 0.5 + st.ball.y * (pH * 0.44);
ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ballX, ballY, 16, 0, Math.PI * 2); ctx.fill();
ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.stroke();
TV_GAME_RAF = requestAnimationFrame(frame);
}
resetSp();
TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startTvSoccerPongGame = startTvSoccerPongGame;
