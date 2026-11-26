(function () {
var SHAPES = [
null,
[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], [[2,0,0],[2,2,2],[0,0,0]],
[[0,0,3],[3,3,3],[0,0,0]], [[4,4],[4,4]], [[0,5,5],[5,5,0],[0,0,0]],
[[0,6,0],[6,6,6],[0,0,0]], [[7,7,0],[0,7,7],[0,0,0]]
];
var TET_COLORS = ['#0f172a', '#22D3EE', '#3B82F6', '#F97316', '#FACC15', '#22C55E', '#A855F7', '#F43F5E'];
var TET_SPRITES = [
'', 'assets/games/puzzle/element_blue_square_glossy.png', 'assets/games/puzzle/element_grey_square_glossy.png',
'assets/games/puzzle/element_grey_square_glossy.png', 'assets/games/puzzle/element_yellow_square_glossy.png',
'assets/games/puzzle/element_green_square_glossy.png', 'assets/games/puzzle/element_purple_square.png',
'assets/games/puzzle/element_red_square_glossy.png'
];
function playSfx(freq, dur, kind, g) { if (typeof window.playTvGameBeep === 'function') window.playTvGameBeep(freq, dur, kind, g); }
function spr(c, p, x, y, w, h, r) { return typeof window.drawTvSprite === 'function' ? window.drawTvSprite(c, p, x, y, w, h, r) : false; }
function sprRect(c, p, x, y, w, h) { return typeof window.drawTvSpriteRect === 'function' ? window.drawTvSpriteRect(c, p, x, y, w, h) : false; }
function tiledBg(c, p, w, h, sx, sy) { return typeof window.drawTvTiledBg === 'function' ? window.drawTvTiledBg(c, p, w, h, sx, sy) : false; }
function preloadPuz() {
if (typeof window.preloadTvGameSprites === 'function') {
window.preloadTvGameSprites([
'assets/games/space/blue.png', 'assets/games/space/darkPurple.png',
'assets/games/puzzle/element_blue_square_glossy.png', 'assets/games/puzzle/element_grey_square_glossy.png',
'assets/games/puzzle/element_yellow_square_glossy.png', 'assets/games/puzzle/element_green_square_glossy.png',
'assets/games/puzzle/element_purple_square.png', 'assets/games/puzzle/element_red_square_glossy.png',
'assets/games/puzzle/particleStar.png', 'assets/games/medals/medalBronze.png',
'assets/games/medals/medalSilver.png', 'assets/games/medals/medalGold.png'
]);
}
}
function loadBest(key) { try { return Number(localStorage.getItem(key) || '0') || 0; } catch (e) { return 0; } }
function saveBest(key, val) { try { localStorage.setItem(key, String(val)); } catch (e) {} }
function mountShell(scr, idPrefix, titleText, bestScore, hintLeft, hintRight) {
scr.innerHTML =
'<div class="tv-game-topbar"><div class="tv-game-top-left">' +
'<button type="button" id="btn-game-back" class="tv-btn" tabindex="0">Volver (Return)</button>' +
'<div class="tv-game-top-title">' + titleText + '</div></div><div class="tv-game-top-right">' +
'<div class="tv-game-hud-pill accent-purple" id="' + idPrefix + '-score">PUNTOS: 0</div>' +
'<div class="tv-game-hud-pill accent-green" id="' + idPrefix + '-sub">NIVEL 1</div>' +
'<div class="tv-game-hud-pill" id="' + idPrefix + '-best">Récord: ' + bestScore + '</div></div></div>' +
'<div class="tv-game-arena">' +
'<canvas id="' + idPrefix + '-canvas" class="tv-game-canvas" width="960" height="540"></canvas>' +
'<div class="tv-game-finish-overlay" id="' + idPrefix + '-ov"><div class="tv-game-finish-card">' +
'<div class="tv-game-finish-title" id="' + idPrefix + '-fin-title">FIN DE PARTIDA</div>' +
'<div class="tv-game-finish-sub" id="' + idPrefix + '-fin-sub">Puntuación: 0</div>' +
'<div class="tv-game-finish-btns">' +
'<button type="button" id="' + idPrefix + '-replay" class="tv-btn-primary" tabindex="0">Jugar de nuevo (OK)</button>' +
'<button type="button" id="' + idPrefix + '-exit" class="tv-btn" tabindex="0">Salir</button>' +
'</div></div></div></div>' +
'<div class="tv-game-controls-hint"><span>' + hintLeft + '</span><span>' + hintRight + '</span></div>';
document.getElementById('btn-game-back').onclick = window.closeTvGame;
document.getElementById(idPrefix + '-exit').onclick = window.closeTvGame;
}
function startTetrisGame(scr) {
var BEST_KEY = 'naim_tv_tetris_best_v1';
var best = loadBest(BEST_KEY);
mountShell(
scr, 'tet', '🧱 Tetris Sprint TV', best,
'◀ ▶ Mover pieza · ▲ Rotar · ▼ Bajar rápido',
'OK / Espacio: Caída instantánea'
);
preloadPuz();
var canvas = document.getElementById('tet-canvas');
var ctx = canvas.getContext('2d');
var scoreEl = document.getElementById('tet-score');
var subEl = document.getElementById('tet-sub');
var bestEl = document.getElementById('tet-best');
var ov = document.getElementById('tet-ov');
var finTitle = document.getElementById('tet-fin-title');
var finSub = document.getElementById('tet-fin-sub');
var COLS = 10, ROWS = 20, CELL = 24;
var BOARD_X = 360, BOARD_Y = 30;
var board = [], bag = [], piece = null, nextType = 1;
var score = 0, lines = 0, level = 1, gameOver = false, dropAcc = 0, flashY = [];
function refillBag() {
var list = [1, 2, 3, 4, 5, 6, 7];
for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
bag = bag.concat(list);
}
function popBag() { if (bag.length < 3) refillBag(); return bag.shift(); }
function cloneMat(m) { var out = []; for (var r = 0; r < m.length; r++) out.push(m[r].slice()); return out; }
function collides(mat, px, py) {
for (var r = 0; r < mat.length; r++) for (var c = 0; c < mat[r].length; c++) {
if (!mat[r][c]) continue;
var nx = px + c, ny = py + r;
if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
if (ny >= 0 && board[ny][nx]) return true;
}
return false;
}
function spawnPiece() {
var type = nextType; nextType = popBag();
var m = cloneMat(SHAPES[type]);
piece = { m: m, x: Math.floor((COLS - m[0].length) / 2), y: -1, type: type };
if (collides(piece.m, piece.x, piece.y + 1)) {
gameOver = true; finTitle.textContent = '🧱 ¡PARTIDA TERMINADA!';
finSub.textContent = 'Puntos: ' + score + ' · Líneas: ' + lines + ' · Nivel ' + level;
ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
var btn = document.getElementById('tet-replay'); if (btn && btn.focus) btn.focus();
playSfx(140, 0.25, 'sawtooth', 0.09);
}
}
function resetGame() {
board = [];
for (var r = 0; r < ROWS; r++) { var row = []; for (var c = 0; c < COLS; c++) row.push(0); board.push(row); }
bag = []; score = 0; lines = 0; level = 1; dropAcc = 0; gameOver = false; flashY = [];
nextType = popBag(); spawnPiece(); ov.style.display = 'none'; syncHud();
}
function syncHud() {
scoreEl.textContent = 'PUNTOS: ' + score; subEl.textContent = 'NIVEL ' + level + ' · ' + lines + ' LÍN.';
if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
}
function rotateMat(mat) {
var n = mat.length, out = [];
for (var r = 0; r < n; r++) { out.push([]); for (var c = 0; c < n; c++) out[r].push(mat[n - 1 - c][r]); }
return out;
}
function tryRotate() {
if (!piece || gameOver) return;
var rot = rotateMat(piece.m), kicks = [0, -1, 1, -2, 2];
for (var i = 0; i < kicks.length; i++) if (!collides(rot, piece.x + kicks[i], piece.y)) {
piece.m = rot; piece.x += kicks[i]; playSfx(520, 0.05, 'triangle', 0.05); return;
}
}
function lockPiece() {
for (var r = 0; r < piece.m.length; r++) {
for (var c = 0; c < piece.m[r].length; c++) {
if (piece.m[r][c] && piece.y + r >= 0) {
board[piece.y + r][piece.x + c] = piece.type;
}
}
}
var cleared = 0;
for (var y = ROWS - 1; y >= 0; y--) {
var full = true;
for (var x = 0; x < COLS; x++) if (!board[y][x]) { full = false; break; }
if (full) {
board.splice(y, 1);
var blank = []; for (var cx = 0; cx < COLS; cx++) blank.push(0);
board.unshift(blank);
cleared++; y++;
}
}
if (cleared > 0) {
var pts = [0, 100, 300, 500, 800][cleared] || 800;
score += pts * level; lines += cleared; level = 1 + Math.floor(lines / 10);
playSfx(cleared >= 4 ? 880 : 620, 0.16, 'triangle', 0.09);
} else playSfx(210, 0.05, 'square', 0.04);
syncHud(); spawnPiece();
}
function hardDrop() {
if (!piece || gameOver) return;
var dist = 0;
while (!collides(piece.m, piece.x, piece.y + 1)) { piece.y++; dist++; }
score += dist * 2;
lockPiece();
}
document.getElementById('tet-replay').onclick = resetGame;
window.tvGameKeyHandler = function (e, code) {
if (gameOver) {
if (code === 13 || code === 23 || code === 66 || code === 32) {
if (e.preventDefault) e.preventDefault(); resetGame(); return true;
}
return false;
}
if (code === 37 || code === 21) { if (!collides(piece.m, piece.x - 1, piece.y)) piece.x--; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 39 || code === 22) { if (!collides(piece.m, piece.x + 1, piece.y)) piece.x++; if (e.preventDefault) e.preventDefault(); return true; }
if (code === 38 || code === 19) { tryRotate(); if (e.preventDefault) e.preventDefault(); return true; }
if (code === 40 || code === 20) {
if (!collides(piece.m, piece.x, piece.y + 1)) { piece.y++; score += 1; syncHud(); }
else lockPiece();
dropAcc = 0;
if (e.preventDefault) e.preventDefault(); return true;
}
if (code === 13 || code === 23 || code === 66 || code === 32) { hardDrop(); if (e.preventDefault) e.preventDefault(); return true; }
return false;
};
var last = performance.now();
function drawCell(x, y, type, alpha, sz) {
var s = sz || (CELL - 2), sp = TET_SPRITES[type];
ctx.globalAlpha = alpha || 1;
if (type === 3) {
ctx.fillStyle = TET_COLORS[3]; ctx.fillRect(x + 1, y + 1, s, s);
ctx.globalAlpha = (alpha || 1) * 0.45; sprRect(ctx, sp, x + 1, y + 1, s, s); ctx.globalAlpha = 1; return;
}
if (sp && sprRect(ctx, sp, x + 1, y + 1, s, s)) { ctx.globalAlpha = 1; return; }
ctx.fillStyle = TET_COLORS[type]; ctx.fillRect(x + 1, y + 1, s, s);
ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 2, y + 2, s - 2, 4);
ctx.globalAlpha = 1;
}
function frame(now) {
if (window.TV_GAME_ACTIVE !== 'tetris') return;
var dt = Math.min(0.05, (now - last) / 1000);
last = now;
if (!gameOver) {
dropAcc += dt;
var interval = Math.max(0.11, 0.72 - (level - 1) * 0.065);
if (dropAcc >= interval) {
dropAcc = 0;
if (!collides(piece.m, piece.x, piece.y + 1)) piece.y++;
else lockPiece();
}
}
ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, 960, 540);
if (tiledBg(ctx, 'assets/games/space/blue.png', 960, 540, now * 0.006, now * 0.01)) {
ctx.fillStyle = 'rgba(6, 9, 19, 0.72)'; ctx.fillRect(0, 0, 960, 540);
}
ctx.fillStyle = '#0d1326'; ctx.fillRect(BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8);
ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 3;
ctx.strokeRect(BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8);
for (var r = 0; r < ROWS; r++) {
for (var c = 0; c < COLS; c++) {
var bx = BOARD_X + c * CELL, by = BOARD_Y + r * CELL;
ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, CELL, CELL);
if (board[r][c]) drawCell(bx, by, board[r][c], 1);
}
}
if (piece && !gameOver) {
var gy = piece.y;
while (!collides(piece.m, piece.x, gy + 1)) gy++;
for (var r1 = 0; r1 < piece.m.length; r1++) {
for (var c1 = 0; c1 < piece.m[r1].length; c1++) {
if (!piece.m[r1][c1]) continue;
if (gy + r1 >= 0) drawCell(BOARD_X + (piece.x + c1) * CELL, BOARD_Y + (gy + r1) * CELL, piece.type, 0.22);
if (piece.y + r1 >= 0) drawCell(BOARD_X + (piece.x + c1) * CELL, BOARD_Y + (piece.y + r1) * CELL, piece.type, 1);
}
}
if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, BOARD_X + (piece.x + 1.5) * CELL, BOARD_Y + (piece.y + 1.5) * CELL, 48, '56,189,248', 0.25);
}
ctx.fillStyle = '#0d1326'; ctx.fillRect(640, 30, 190, 150);
ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.strokeRect(640, 30, 190, 150);
ctx.fillStyle = '#94A3B8'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('SIGUIENTE PIEZA', 735, 56);
var nm = SHAPES[nextType];
if (nm) {
var offX = 735 - (nm[0].length * 22) / 2, offY = 82;
for (var nr = 0; nr < nm.length; nr++) for (var nc = 0; nc < nm[nr].length; nc++) {
if (nm[nr][nc]) drawCell(offX + nc * 22, offY + nr * 22, nextType, 1, 20);
}
}
ctx.fillStyle = '#0d1326'; ctx.fillRect(130, 30, 190, 180);
ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.strokeRect(130, 30, 190, 180);
ctx.fillStyle = '#CBD5E1'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
ctx.fillText('NIVEL: ' + level, 152, 72);
ctx.fillText('LÍNEAS: ' + lines, 152, 108);
ctx.fillText('PUNTOS: ' + score, 152, 144);
ctx.fillStyle = '#FACC15'; ctx.fillText('RÉCORD: ' + best, 152, 180);
if (typeof window.drawTvCrtOverlay === 'function') window.drawTvCrtOverlay(ctx, 960, 540, 0.14);
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
resetGame();
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startTetrisGame = startTetrisGame;
function startHextrisGame(scr) {
var BEST_KEY = 'naim_tv_hextris_best_v1';
var best = loadBest(BEST_KEY);
mountShell(
scr, 'hex', '⬡ Hextris Neon TV', best,
'◀ Girar Izquierda · ▶ Girar Derecha',
'▼ Acelerar caída · Combina 3+ colores iguales'
);
var canvas = document.getElementById('hex-canvas');
var ctx = canvas.getContext('2d');
var scoreEl = document.getElementById('hex-score');
var subEl = document.getElementById('hex-sub');
var bestEl = document.getElementById('hex-best');
var ov = document.getElementById('hex-ov');
var finTitle = document.getElementById('hex-fin-title');
var finSub = document.getElementById('hex-fin-sub');
preloadPuz();
var PALETTE = ['#F43F5E', '#38BDF8', '#22C55E', '#FACC15', '#A855F7'];
var MAX_STACK = 7;
var HEX_R = 56, LAYER_H = 22, SPAWN_R = 290;
var stacks = [[], [], [], [], [], []];
var falling = [], sparks = [];
var rotStep = 0, visualAngle = 0, score = 0, combo = 1, speedMul = 1;
var spawnTimer = 0.6, gameOver = false, fastDrop = false;
function resetGame() {
stacks = [[], [], [], [], [], []];
falling = []; sparks = []; rotStep = 0; visualAngle = 0; score = 0; combo = 1; speedMul = 1;
spawnTimer = 0.4; gameOver = false; fastDrop = false;
ov.style.display = 'none';
syncHud();
}
function syncHud() {
scoreEl.textContent = 'PUNTOS: ' + score;
subEl.textContent = 'COMBO x' + combo;
if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
}
function clearMatches() {
var removed = 0;
for (var s = 0; s < 6; s++) {
var st = stacks[s];
var i = 0;
while (i < st.length) {
var j = i + 1;
while (j < st.length && st[j] === st[i]) j++;
if (j - i >= 3) { st.splice(i, j - i); removed += (j - i); } else i = j;
}
}
for (var h = 0; h < MAX_STACK; h++) {
for (var l = 0; l < 6; l++) {
var c0 = stacks[l][h], l1 = (l + 1) % 6, l2 = (l + 2) % 6;
if (c0 !== undefined && stacks[l1][h] === c0 && stacks[l2][h] === c0) {
stacks[l].splice(h, 1); stacks[l1].splice(h, 1); stacks[l2].splice(h, 1);
removed += 3; h = Math.max(-1, h - 1); break;
}
}
}
if (removed > 0) {
score += removed * 30 * combo; combo = Math.min(8, combo + 1);
speedMul = 1 + Math.min(1.4, score / 4000);
for (var sk = 0; sk < 10; sk++) {
var sa = (sk / 10) * Math.PI * 2, ss = 90 + Math.random() * 140;
sparks.push({ x: 480, y: 270, vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss, life: 0.55 });
}
playSfx(540 + combo * 60, 0.14, 'triangle', 0.08); syncHud();
} else combo = 1;
}
document.getElementById('hex-replay').onclick = resetGame;
window.tvGameKeyHandler = function (e, code) {
if (gameOver) {
if (code === 13 || code === 23 || code === 66 || code === 32) {
if (e.preventDefault) e.preventDefault(); resetGame(); return true;
}
return false;
}
if (code === 37 || code === 21 || code === 65) { rotStep--; playSfx(320, 0.04, 'sine', 0.04); if (e.preventDefault) e.preventDefault(); return true; }
if (code === 39 || code === 22 || code === 68) { rotStep++; playSfx(360, 0.04, 'sine', 0.04); if (e.preventDefault) e.preventDefault(); return true; }
if (code === 40 || code === 20 || code === 32) { fastDrop = true; if (e.preventDefault) e.preventDefault(); return true; }
return false;
};
window.tvGameKeyUpHandler = function (e, code) {
if (code === 40 || code === 20 || code === 32) fastDrop = false;
return false;
};
var last = performance.now();
function frame(now) {
if (window.TV_GAME_ACTIVE !== 'hextris') return;
var dt = Math.min(0.05, (now - last) / 1000);
last = now;
var targetA = rotStep * (Math.PI / 3);
visualAngle += (targetA - visualAngle) * Math.min(1, dt * 16);
if (!gameOver) {
spawnTimer -= dt * (fastDrop ? 1.8 : 1);
if (spawnTimer <= 0) {
falling.push({
lane: Math.floor(Math.random() * 6),
r: SPAWN_R,
col: Math.floor(Math.random() * PALETTE.length)
});
spawnTimer = Math.max(0.55, 1.38 / speedMul);
}
for (var fi = falling.length - 1; fi >= 0; fi--) {
var blk = falling[fi];
blk.r -= dt * (fastDrop ? 260 : 105 * speedMul);
var destLane = ((blk.lane - rotStep) % 6 + 6) % 6;
var stackH = HEX_R + stacks[destLane].length * LAYER_H + LAYER_H * 0.5;
if (blk.r <= stackH) {
falling.splice(fi, 1);
stacks[destLane].push(blk.col);
score += 10;
playSfx(240, 0.04, 'square', 0.04);
if (stacks[destLane].length > MAX_STACK) {
gameOver = true;
finTitle.textContent = '⬡ ¡HEXÁGONO DESBORDADO!';
finSub.textContent = 'Puntuación final: ' + score;
ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
var btn = document.getElementById('hex-replay'); if (btn && btn.focus) btn.focus();
playSfx(130, 0.25, 'sawtooth', 0.09);
} else {
clearMatches();
syncHud();
}
}
}
}
ctx.fillStyle = '#070a15'; ctx.fillRect(0, 0, 960, 540);
if (tiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 540, now * 0.008, now * 0.005)) {
ctx.fillStyle = 'rgba(7, 10, 21, 0.72)'; ctx.fillRect(0, 0, 960, 540);
}
if (typeof window.drawTvNebulaLayer === 'function') window.drawTvNebulaLayer(ctx, 960, 540, now * 0.001, 'cyber');
for (var spi = sparks.length - 1; spi >= 0; spi--) {
var spk = sparks[spi]; spk.x += spk.vx * dt; spk.y += spk.vy * dt; spk.life -= dt;
if (spk.life <= 0) { sparks.splice(spi, 1); continue; }
ctx.globalAlpha = Math.min(1, spk.life * 2);
if (typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, spk.x, spk.y, 18, '56,189,248', 0.42);
spr(ctx, 'assets/games/puzzle/particleStar.png', spk.x, spk.y, 18, 18, spk.life * 6);
ctx.globalAlpha = 1;
}
var cx = 480, cy = 270;
ctx.strokeStyle = 'rgba(244, 63, 94, 0.28)'; ctx.lineWidth = 3;
ctx.beginPath();
for (var i = 0; i < 6; i++) {
var oa = visualAngle + i * (Math.PI / 3);
var ox = cx + Math.cos(oa) * (HEX_R + MAX_STACK * LAYER_H + 8);
var oy = cy + Math.sin(oa) * (HEX_R + MAX_STACK * LAYER_H + 8);
if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
}
ctx.closePath(); ctx.stroke();
ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1.5;
for (var g = 0; g < 6; g++) {
var ga = visualAngle + g * (Math.PI / 3);
ctx.beginPath();
ctx.moveTo(cx + Math.cos(ga) * HEX_R, cy + Math.sin(ga) * HEX_R);
ctx.lineTo(cx + Math.cos(ga) * 320, cy + Math.sin(ga) * 320);
ctx.stroke();
}
function drawTrapezoid(angleCenter, rInner, rOuter, color) {
var a0 = angleCenter - Math.PI / 6 + 0.03, a1 = angleCenter + Math.PI / 6 - 0.03;
ctx.fillStyle = color; ctx.strokeStyle = '#070a15'; ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner);
ctx.lineTo(cx + Math.cos(a1) * rInner, cy + Math.sin(a1) * rInner);
ctx.lineTo(cx + Math.cos(a1) * rOuter, cy + Math.sin(a1) * rOuter);
ctx.lineTo(cx + Math.cos(a0) * rOuter, cy + Math.sin(a0) * rOuter);
ctx.closePath(); ctx.fill(); ctx.stroke();
}
for (var s = 0; s < 6; s++) {
var ang = visualAngle + s * (Math.PI / 3);
for (var h = 0; h < stacks[s].length; h++) {
drawTrapezoid(ang, HEX_R + h * LAYER_H, HEX_R + (h + 1) * LAYER_H - 2, PALETTE[stacks[s][h]]);
}
}
for (var f = 0; f < falling.length; f++) {
var fb = falling[f];
var fa = fb.lane * (Math.PI / 3);
drawTrapezoid(fa, fb.r - 10, fb.r + 10, PALETTE[fb.col]);
}
ctx.fillStyle = '#141b33'; ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 3;
ctx.beginPath();
for (var k = 0; k < 6; k++) {
var ka = visualAngle + k * (Math.PI / 3) - Math.PI / 6;
var kx = cx + Math.cos(ka) * HEX_R, ky = cy + Math.sin(ka) * HEX_R;
if (k === 0) ctx.moveTo(kx, ky); else ctx.lineTo(kx, ky);
}
ctx.closePath(); ctx.fill(); ctx.stroke();
if (combo >= 2 && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, cx, cy, HEX_R * 1.6, '168,85,247', 0.35);
ctx.fillStyle = '#fff'; ctx.font = '900 19px sans-serif'; ctx.textAlign = 'center';
ctx.fillText(String(score), cx, cy + 7);
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
resetGame();
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startHextrisGame = startHextrisGame;
function startGame2048(scr) {
var BEST_KEY = 'naim_tv_2048_best_v1';
var best = loadBest(BEST_KEY);
mountShell(
scr, 'g2048', '🔢 2048 TV Edition', best,
'◀ ▲ ▶ ▼ Deslizar fichas en el tablero',
'OK / Espacio: Deshacer último movimiento'
);
var canvas = document.getElementById('g2048-canvas');
var ctx = canvas.getContext('2d');
var scoreEl = document.getElementById('g2048-score');
var subEl = document.getElementById('g2048-sub');
var bestEl = document.getElementById('g2048-best');
var ov = document.getElementById('g2048-ov');
var finTitle = document.getElementById('g2048-fin-title');
var finSub = document.getElementById('g2048-fin-sub');
var grid = [], prevGrid = null, prevScore = 0, score = 0, maxTile = 2, gameOver = false, wonShown = false;
var TILE_COLORS = {
0: ['#182034', '#475569'], 2: ['#EEE4DA', '#1E293B'], 4: ['#EDE0C8', '#1E293B'],
8: ['#F2B179', '#FFFFFF'], 16: ['#F59563', '#FFFFFF'], 32: ['#F67C5F', '#FFFFFF'],
64: ['#F65E3B', '#FFFFFF'], 128: ['#EDCF72', '#FFFFFF'], 256: ['#EDCC61', '#FFFFFF'],
512: ['#EDC850', '#FFFFFF'], 1024: ['#8B5CF6', '#FFFFFF'], 2048: ['#22C55E', '#FFFFFF']
};
function spawnTile() {
var empties = [];
for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (grid[r][c] === 0) empties.push([r, c]);
if (!empties.length) return;
var pick = empties[Math.floor(Math.random() * empties.length)];
grid[pick[0]][pick[1]] = Math.random() < 0.9 ? 2 : 4;
}
function cloneGrid(g) { return [g[0].slice(), g[1].slice(), g[2].slice(), g[3].slice()]; }
function hasMoves() {
for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
if (grid[r][c] === 0 || (r < 3 && grid[r][c] === grid[r + 1][c]) || (c < 3 && grid[r][c] === grid[r][c + 1])) return true;
}
return false;
}
function syncHud() {
maxTile = 2;
for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (grid[r][c] > maxTile) maxTile = grid[r][c];
scoreEl.textContent = 'PUNTOS: ' + score; subEl.textContent = 'FICHA MÁX: ' + maxTile;
if (score > best) { best = score; saveBest(BEST_KEY, best); bestEl.textContent = 'Récord: ' + best; }
}
function resetGame() {
grid = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
prevGrid = null; score = 0; prevScore = 0; gameOver = false; wonShown = false;
spawnTile(); spawnTile(); ov.style.display = 'none'; syncHud();
}
function slideLine(arr) {
var nz = [];
for (var i = 0; i < 4; i++) if (arr[i] !== 0) nz.push(arr[i]);
var out = [];
for (var j = 0; j < nz.length; j++) {
if (j + 1 < nz.length && nz[j] === nz[j + 1]) { var v = nz[j] * 2; out.push(v); score += v; j++; }
else out.push(nz[j]);
}
while (out.length < 4) out.push(0);
return out;
}
function move(dir) {
if (gameOver) return;
var snap = cloneGrid(grid), snapScore = score;
var changed = false;
for (var idx = 0; idx < 4; idx++) {
var line = [], r, c;
for (var k = 0; k < 4; k++) {
if (dir === 'left') line.push(grid[idx][k]);
else if (dir === 'right') line.push(grid[idx][3 - k]);
else if (dir === 'up') line.push(grid[k][idx]);
else line.push(grid[3 - k][idx]);
}
var next = slideLine(line);
for (var m = 0; m < 4; m++) {
r = (dir === 'left' || dir === 'right') ? idx : (dir === 'up' ? m : 3 - m);
c = (dir === 'up' || dir === 'down') ? idx : (dir === 'left' ? m : 3 - m);
if (grid[r][c] !== next[m]) changed = true;
grid[r][c] = next[m];
}
}
if (!changed) return;
prevGrid = snap; prevScore = snapScore;
spawnTile();
syncHud();
playSfx(maxTile >= 2048 && !wonShown ? 760 : 340, 0.06, 'triangle', 0.06);
if (maxTile >= 2048 && !wonShown) wonShown = true;
if (!hasMoves()) {
gameOver = true;
finTitle.textContent = maxTile >= 2048 ? '🏆 ¡LOGRASTE EL 2048!' : '🔢 ¡SIN MOVIMIENTOS!';
finSub.textContent = 'Puntuación final: ' + score + ' · Ficha máxima: ' + maxTile;
ov.style.display = '-webkit-flex'; ov.style.display = 'flex';
var btn = document.getElementById('g2048-replay'); if (btn && btn.focus) btn.focus();
}
}
document.getElementById('g2048-replay').onclick = resetGame;
window.tvGameKeyHandler = function (e, code) {
if (gameOver) {
if (code === 13 || code === 23 || code === 66 || code === 32) {
if (e.preventDefault) e.preventDefault(); resetGame(); return true;
}
return false;
}
if (code === 37 || code === 21) { move('left'); if (e.preventDefault) e.preventDefault(); return true; }
if (code === 39 || code === 22) { move('right'); if (e.preventDefault) e.preventDefault(); return true; }
if (code === 38 || code === 19) { move('up'); if (e.preventDefault) e.preventDefault(); return true; }
if (code === 40 || code === 20) { move('down'); if (e.preventDefault) e.preventDefault(); return true; }
if ((code === 13 || code === 23 || code === 66 || code === 32) && prevGrid) {
grid = prevGrid; score = prevScore; prevGrid = null; syncHud();
playSfx(240, 0.06, 'sine', 0.05);
if (e.preventDefault) e.preventDefault(); return true;
}
return false;
};
function drawRoundRect(x, y, w, h, rad, fill) {
ctx.fillStyle = fill;
ctx.beginPath();
ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y);
ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
ctx.lineTo(x + w, y + h - rad);
ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
ctx.lineTo(x + rad, y + h);
ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
ctx.lineTo(x, y + rad);
ctx.quadraticCurveTo(x, y, x + rad, y);
ctx.closePath(); ctx.fill();
}
preloadPuz();
function frame(now) {
if (window.TV_GAME_ACTIVE !== 'game2048') return;
ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, 960, 540);
if (tiledBg(ctx, 'assets/games/space/blue.png', 960, 540, (now || 0) * 0.004, (now || 0) * 0.006)) {
ctx.fillStyle = 'rgba(7, 11, 20, 0.76)'; ctx.fillRect(0, 0, 960, 540);
}
var bx = 250, by = 40, bsize = 460, pad = 14, tsize = (bsize - pad * 5) / 4;
drawRoundRect(bx, by, bsize, bsize, 22, '#0e1629');
for (var r = 0; r < 4; r++) {
for (var c = 0; c < 4; c++) {
var v = grid[r][c];
var colPair = TILE_COLORS[v] || ['#38BDF8', '#FFFFFF'];
var tx = bx + pad + c * (tsize + pad), ty = by + pad + r * (tsize + pad);
if (v >= 128 && typeof window.drawTvGlowLight === 'function') window.drawTvGlowLight(ctx, tx + tsize / 2, ty + tsize / 2, tsize * 0.72, v >= 1024 ? '34,197,94' : '250,204,21', 0.34);
drawRoundRect(tx, ty, tsize, tsize, 14, colPair[0]);
if (v > 0) {
drawRoundRect(tx + 3, ty + 3, tsize - 6, tsize * 0.42, 10, 'rgba(255,255,255,0.16)');
ctx.fillStyle = colPair[1];
ctx.font = '900 ' + (v >= 1024 ? 30 : v >= 100 ? 36 : 42) + 'px sans-serif';
ctx.textAlign = 'center';
ctx.fillText(String(v), tx + tsize / 2, ty + tsize / 2 + 13);
}
}
}
var medal = maxTile >= 2048 ? 'assets/games/medals/medalGold.png' : maxTile >= 1024 ? 'assets/games/medals/medalSilver.png' : maxTile >= 512 ? 'assets/games/medals/medalBronze.png' : '';
if (medal) spr(ctx, medal, 800, 120, 68, 71, 0);
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
resetGame();
window.TV_GAME_RAF = requestAnimationFrame(frame);
}
window.startGame2048 = startGame2048;
})();
