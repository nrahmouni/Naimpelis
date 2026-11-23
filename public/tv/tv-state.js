// Core State, Pure ES5 QR Generator, Zero-Reinstall Auto-Sync & DOM Refs (ES5)
var activeScreen = 'hub';
var pairingCode = '';
var isPaired = false;
var isLocalPlayback = false;
var currentRoomId = '';
var currentRoomName = '';
var tvAuthToken = '';
var tvDeviceId = 'tv-' + Math.floor(100000 + Math.random() * 900000);
var audioUnlocked = false;
var currentMode = 'idle';
var currentUrl = '';
var currentIsLive = false;
var currentVolume = 1;
var lastRemoteSeq = 0;
var hudTimer = null;
var localTracks = [];
var localTrackIdx = 0;
var activeLiveChannel = null;
var activeLiveTrackIdx = 0;
var activeLiveFilter = 'es_priority';
var activeAdrarCountry = 'all';
var activeLiveSearch = '';
var activeLiveVisibleLimit = 36;
var lastHubFocusedEl = null;

var currentTvBuildSig = typeof window.__RIFFAN_TV_BUILD__ === 'string' ? window.__RIFFAN_TV_BUILD__ : '';
var pendingTvAutoUpdateBuild = '';
var isMiniGuideOpen = false;
var activeMiniGuideFilter = 'es_tdt';
var dialBuffer = '';
var dialBufferTimer = null;
var zapOsdTimer = null;

var liveExtractCache = {};
var tvPrewarmInFlight = {};
var tvPrewarmTimer = null;

var pairingWs = null;
var roomWs = null;
var hlsInstance = null;
var ytPlayer = null;
var ytReady = false;
var pendingYtVideoId = '';
var pendingYtStart = 0;
var pendingYtPlay = true;

var hubScreen = document.getElementById('tv-hub-screen');
var tvSideRail = document.getElementById('tv-side-rail');
var hubScrollBody = document.getElementById('hub-scroll-body');
var hubDynamicContent = document.getElementById('hub-dynamic-content');
var hubPairCodeEl = document.getElementById('hub-pair-code');
var tvStageTitleEl = document.getElementById('tv-stage-title');
var tvLiveClockEl = document.getElementById('tv-live-clock');
var playerHudClockEl = document.getElementById('player-hud-clock');
var tvAutoUpdatePill = document.getElementById('tv-autoupdate-pill');
var tvOtaStatusSub = document.getElementById('tv-ota-status-sub');
var btnCheckTvUpdate = document.getElementById('btn-check-tv-update');
var pairingQrBox = document.getElementById('pairing-qr-box');

var pairingScreen = document.getElementById('pairing-screen');
var playerScreen = document.getElementById('player-screen');
var standbyOverlay = document.getElementById('standby-overlay');
var standbyChannelBadge = document.getElementById('standby-channel-badge');
var standbyLogoImg = document.getElementById('standby-logo-img');
var standbySpinner = document.getElementById('standby-spinner');
var standbyRoomPill = document.getElementById('standby-room-pill');
var standbyTitleText = document.getElementById('standby-title-text');
var standbySubText = document.getElementById('standby-sub-text');
var btnStandbyRetry = document.getElementById('btn-standby-retry');
var connBadge = document.getElementById('conn-badge');
var pairedBanner = document.getElementById('paired-banner');
var pairingControls = document.getElementById('pairing-controls');
var videoEl = document.getElementById('tv-video');
var ytWrap = document.getElementById('yt-wrap');
var embedWrap = document.getElementById('embed-wrap');
var embedFrame = document.getElementById('embed-frame');
var hudEl = document.getElementById('player-hud');
var bottomDockEl = document.getElementById('player-bottom-dock');
var fsPromptBanner = document.getElementById('fs-prompt-banner');
var btnConfirmRemoteFs = document.getElementById('btn-confirm-remote-fs');
var hudTitle = document.getElementById('hud-title');
var hudSub = document.getElementById('hud-sub');
var toastEl = document.getElementById('tv-toast');
var unmuteBanner = document.getElementById('unmute-banner');
var reactionsLayer = document.getElementById('reactions-layer');
var btnDockAudio = document.getElementById('btn-dock-audio');
var btnDockGuide = document.getElementById('btn-dock-guide');
var btnDockRew = document.getElementById('btn-dock-rew');
var btnDockFf = document.getElementById('btn-dock-ff');
var btnDockChPrev = document.getElementById('btn-dock-chprev');
var btnDockChNext = document.getElementById('btn-dock-chnext');
var btnPlayPause = document.getElementById('btn-hud-playpause');
var dockTimeCur = document.getElementById('dock-time-cur');
var dockTimeDur = document.getElementById('dock-time-dur');
var dockProgressFill = document.getElementById('dock-progress-fill');
var seriesModal = document.getElementById('tv-series-modal');
var voiceModal = document.getElementById('tv-voice-modal');
var hudLogoWrap = document.getElementById('hud-logo-wrap');
var hudLogoImg = document.getElementById('hud-logo-img');
var otaBanner = document.getElementById('ota-update-banner');
var otaText = document.getElementById('ota-update-text');
var btnOtaInstall = document.getElementById('btn-ota-install');

var miniGuideDrawer = document.getElementById('tv-miniguide-drawer');
var mgChannelList = document.getElementById('mg-channel-list');
var tvDialOsd = document.getElementById('tv-dial-osd');
var tvDialOsdNum = document.getElementById('tv-dial-osd-num');
var tvZapOsd = document.getElementById('tv-zap-osd');

var toastTimer = null;
var fsPromptTimer = null;
var videoWatchdogTimer = null;
var videoStallWatchInterval = null;
var videoLastProgressTime = -1;
var videoStallStartedAt = 0;
var aspectModeIndex = 0;
var activeHubTab = 'home';
var autoFailoverLock = false;
var activeLiveFailedTrackIdxs = {};
var activeLiveFailedHostKeys = {};
var pendingTizenAutoLaunchAntena3 = false;
var tizenAutoLaunchTriggered = false;
var tizenAutoLaunchFallbackTimer = null;

// Clean _upd cache-buster parameter once loaded
try {
  if (/[?&]_upd=/.test(window.location.search || '') && window.history && window.history.replaceState) {
    var cleanedSearch = (window.location.search || '')
      .replace(/([?&])_upd=[^&]*&?/, '$1')
      .replace(/[?&]$/, '');
    window.history.replaceState({}, '', window.location.pathname + cleanedSearch);
  }
} catch (e) {}

// Smart TV Hub Catalog + Live EPG Store
var catalogData = {
  loaded: false,
  cinemaReleases: [],
  newSeasons: [],
  movies: [],
  series: [],
  anime: [],
  kidsMovies: [],
  kidsSeries: [],
  tdtBase: [],
  worldTv: [],
  tdt: [],
  epg: {},
  searchQuery: '',
  searchResults: [],
  searching: false
};

var activeSeriesItem = null;
var activeSeriesDetails = null;
var activeSeriesLang = 'ES';
var activeSeriesSeason = 1;

function updateTvClocks() {
  var d = new Date();
  var hh = d.getHours();
  var mm = d.getMinutes();
  var str = (hh < 10 ? '0' + hh : String(hh)) + ':' + (mm < 10 ? '0' + mm : String(mm));
  if (tvLiveClockEl) tvLiveClockEl.textContent = str;
  if (playerHudClockEl) playerHudClockEl.textContent = str;
}
updateTvClocks();
setInterval(updateTvClocks, 15000);

function saveLastWatchedChannel(ch) {
  if (!ch || !ch.id) return;
  try {
    localStorage.setItem(TV_LAST_CHANNEL_KEY, JSON.stringify({
      id: ch.id,
      name: ch.name || '',
      dial: ch.dial || ''
    }));
  } catch (e) {}
}

function getLastWatchedChannelObj() {
  try {
    var raw = localStorage.getItem(TV_LAST_CHANNEL_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.id || !catalogData.tdt || !catalogData.tdt.length) return null;
    for (var i = 0; i < catalogData.tdt.length; i++) {
      if (catalogData.tdt[i] && catalogData.tdt[i].id === parsed.id) return catalogData.tdt[i];
    }
  } catch (e) {}
  return null;
}

// Pure ES5 ISO 18004 QR Code Matrix Encoder (Version 2-L / 3-L / 4-L, Byte mode)
function buildQrSvgMarkup(text) {
  var bytes = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else bytes.push(63);
  }
  var specs = [
    { ver: 2, size: 25, dataCap: 34, ecCount: 10, align: [18] },
    { ver: 3, size: 29, dataCap: 55, ecCount: 15, align: [22] },
    { ver: 4, size: 33, dataCap: 80, ecCount: 20, align: [26] }
  ];
  var spec = specs[2];
  for (var sIdx = 0; sIdx < specs.length; sIdx++) {
    if (bytes.length + 2 <= specs[sIdx].dataCap) {
      spec = specs[sIdx];
      break;
    }
  }
  var n = spec.size;
  var grid = [];
  var reserved = [];
  for (var r = 0; r < n; r++) {
    grid[r] = [];
    reserved[r] = [];
    for (var c2 = 0; c2 < n; c2++) {
      grid[r][c2] = 0;
      reserved[r][c2] = 0;
    }
  }
  function setMod(row, col, val, lock) {
    if (row < 0 || row >= n || col < 0 || col >= n) return;
    grid[row][col] = val ? 1 : 0;
    if (lock) reserved[row][col] = 1;
  }
  function drawFinder(top, left) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var rr = top + dr;
        var cc = left + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        var isSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        var isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        var isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setMod(rr, cc, !isSep && (isOuter || isInner), true);
      }
    }
  }
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Alignment pattern (center [a, a])
  var aPos = spec.align[0];
  for (var ar = -2; ar <= 2; ar++) {
    for (var ac = -2; ac <= 2; ac++) {
      var aDark = Math.max(Math.abs(ar), Math.abs(ac)) !== 1;
      setMod(aPos + ar, aPos + ac, aDark, true);
    }
  }
  // Timing patterns
  for (var tp = 8; tp < n - 8; tp++) {
    setMod(6, tp, tp % 2 === 0, true);
    setMod(tp, 6, tp % 2 === 0, true);
  }
  setMod(n - 8, 8, 1, true); // dark module

  // Reserve format info strips
  for (var fi = 0; fi < 9; fi++) {
    if (fi !== 6) {
      reserved[8][fi] = 1;
      reserved[fi][8] = 1;
    }
  }
  for (var fi2 = 0; fi2 < 8; fi2++) {
    reserved[8][n - 1 - fi2] = 1;
    reserved[n - 1 - fi2][8] = 1;
  }

  // Encode byte stream into codewords
  var bits = [];
  function pushBits(val, len) {
    for (var b = len - 1; b >= 0; b--) bits.push((val >> b) & 1);
  }
  pushBits(4, 4); // Byte mode
  pushBits(bytes.length, 8);
  for (var bi = 0; bi < bytes.length; bi++) pushBits(bytes[bi], 8);
  var totalDataBits = spec.dataCap * 8;
  for (var tz = 0; tz < 4 && bits.length < totalDataBits; tz++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  var padBytes = [236, 17];
  var pIdx = 0;
  while (bits.length < totalDataBits) {
    pushBits(padBytes[pIdx % 2], 8);
    pIdx++;
  }
  var dataCw = [];
  for (var dw = 0; dw < spec.dataCap; dw++) {
    var bVal = 0;
    for (var k = 0; k < 8; k++) bVal = (bVal << 1) | bits[dw * 8 + k];
    dataCw.push(bVal);
  }

  // GF(256) Reed-Solomon ECC
  var gfExp = new Array(512);
  var gfLog = new Array(256);
  var x = 1;
  for (var gi = 0; gi < 255; gi++) {
    gfExp[gi] = x;
    gfLog[x] = gi;
    x <<= 1;
    if (x & 256) x ^= 285;
  }
  for (var gi2 = 255; gi2 < 512; gi2++) gfExp[gi2] = gfExp[gi2 - 255];
  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]];
  }
  var gen = [1];
  for (var g = 0; g < spec.ecCount; g++) {
    var nextGen = new Array(gen.length + 1);
    for (var ng = 0; ng < nextGen.length; ng++) nextGen[ng] = 0;
    var factor = gfExp[g];
    for (var gj = 0; gj < gen.length; gj++) {
      nextGen[gj] ^= gen[gj];
      nextGen[gj + 1] ^= gfMul(gen[gj], factor);
    }
    gen = nextGen;
  }
  var rem = new Array(spec.ecCount);
  for (var ri = 0; ri < spec.ecCount; ri++) rem[ri] = 0;
  for (var di = 0; di < dataCw.length; di++) {
    var lead = dataCw[di] ^ rem[0];
    for (var rj = 0; rj < spec.ecCount - 1; rj++) {
      rem[rj] = rem[rj + 1] ^ gfMul(gen[rj + 1], lead);
    }
    rem[spec.ecCount - 1] = gfMul(gen[spec.ecCount], lead);
  }
  var allCw = dataCw.concat(rem);

  // Place data bits in zig-zag + Mask 0 ((row + col) % 2 === 0)
  var bitCursor = 0;
  var totalBits = allCw.length * 8;
  var col = n - 1;
  var up = true;
  while (col > 0) {
    if (col === 6) col--;
    for (var step = 0; step < n; step++) {
      var row = up ? (n - 1 - step) : step;
      for (var dx = 0; dx < 2; dx++) {
        var cc2 = col - dx;
        if (!reserved[row][cc2]) {
          var bit = 0;
          if (bitCursor < totalBits) {
            bit = (allCw[bitCursor >> 3] >> (7 - (bitCursor & 7))) & 1;
            bitCursor++;
          }
          if ((row + cc2) % 2 === 0) bit ^= 1;
          grid[row][cc2] = bit;
        }
      }
    }
    up = !up;
    col -= 2;
  }

  // Write format string for EC=L (01), Mask=0 (000) -> 0x77C4 (MSB first)
  var fmtBits = 0x77c4;
  for (var f = 0; f < 15; f++) {
    var fBit = (fmtBits >> (14 - f)) & 1;
    if (f < 6) setMod(8, f, fBit, false);
    else if (f === 6) setMod(8, 7, fBit, false);
    else if (f === 7) setMod(8, 8, fBit, false);
    else if (f === 8) setMod(7, 8, fBit, false);
    else setMod(14 - f, 8, fBit, false);

    if (f < 8) setMod(n - 1 - f, 8, fBit, false);
    else setMod(8, n - 15 + f, fBit, false);
  }

  var qz = 2;
  var vb = n + qz * 2;
  var pathParts = [];
  for (var py = 0; py < n; py++) {
    for (var px = 0; px < n; px++) {
      if (grid[py][px]) {
        pathParts.push('M' + (px + qz) + ',' + (py + qz) + 'h1v1h-1z');
      }
    }
  }
  return '<svg viewBox="0 0 ' + vb + ' ' + vb + '" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="' + vb + '" height="' + vb + '" fill="#FFFFFF"/>' +
    '<path d="' + pathParts.join('') + '" fill="#090A10"/>' +
    '</svg>';
}

function renderPairingQrSvg(code) {
  if (!pairingQrBox) return;
  if (!code || code.length !== 4) {
    pairingQrBox.innerHTML = '<div style="color:#090A10;font-weight:800;font-size:14px;">••••</div>';
    return;
  }
  var origin = window.location.origin || ('https://' + (window.location.host || 'localhost'));
  var url = origin + '/?pair=' + encodeURIComponent(code);
  pairingQrBox.innerHTML = buildQrSvgMarkup(url);
}

function xhrJson(method, url, bodyObj, cb) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    if (bodyObj) {
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    }
    xhr.timeout = 18000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          cb(null, JSON.parse(xhr.responseText));
        } catch (err) {
          cb(err, null);
        }
      } else {
        var errObj = new Error('HTTP ' + xhr.status);
        try {
          cb(errObj, JSON.parse(xhr.responseText));
        } catch (e2) {
          cb(errObj, null);
        }
      }
    };
    xhr.ontimeout = function () { cb(new Error('Timeout'), null); };
    xhr.onerror = function () { cb(new Error('Network error'), null); };
    xhr.send(bodyObj ? JSON.stringify(bodyObj) : null);
  } catch (err) {
    cb(err, null);
  }
}

function formatSecClock(sec) {
  var total = Math.max(0, Math.floor(sec || 0));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  var mm = m < 10 ? '0' + m : String(m);
  var ss = s < 10 ? '0' + s : String(s);
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.style.display = 'none';
  }, 2800);
}

function isBrowserInFullscreen() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
  );
}

function syncFullscreenButtons() {
  var active = isBrowserInFullscreen();
  var ids = ['btn-pairing-fs', 'btn-dock-fs'];
  for (var i = 0; i < ids.length; i++) {
    var b = document.getElementById(ids[i]);
    if (b) {
      b.textContent = active ? tvT('fsActive') : tvT('fsBtn');
      b.className = active ? 'tv-btn-fullscreen active-fs' : 'tv-btn-fullscreen';
    }
  }
  var lblFs = document.getElementById('lbl-rail-fs');
  if (lblFs) lblFs.textContent = active ? tvT('fsActive') : tvT('railFs');
  if (active && fsPromptBanner) {
    fsPromptBanner.style.display = 'none';
  }
}

function requestTvFullscreen(fromRemote) {
  var root = document.documentElement;
  if (isBrowserInFullscreen()) {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
    setTimeout(syncFullscreenButtons, 150);
    return;
  }
  var req =
    root.requestFullscreen ||
    root.webkitRequestFullscreen ||
    root.mozRequestFullScreen ||
    root.msRequestFullscreen;
  if (req) {
    try {
      var res = req.call(root);
      if (res && res.then) {
        res.then(
          function () { syncFullscreenButtons(); },
          function () { if (fromRemote) showRemoteFullscreenOkPrompt(); }
        );
      }
    } catch (err) {
      if (fromRemote) showRemoteFullscreenOkPrompt();
    }
  }
  setTimeout(syncFullscreenButtons, 240);
}

function showRemoteFullscreenOkPrompt() {
  if (!fsPromptBanner) return;
  fsPromptBanner.style.display = 'block';
  if (btnConfirmRemoteFs && btnConfirmRemoteFs.focus) btnConfirmRemoteFs.focus();
  if (fsPromptTimer) clearTimeout(fsPromptTimer);
  fsPromptTimer = setTimeout(function () {
    fsPromptBanner.style.display = 'none';
  }, 8000);
}

function cycleVideoAspect() {
  aspectModeIndex = (aspectModeIndex + 1) % 3;
  if (!videoEl) return;
  var aspectBtn = document.getElementById('btn-dock-aspect');
  if (aspectModeIndex === 0) {
    videoEl.className = '';
    if (aspectBtn) aspectBtn.textContent = tvT('aspectOrig');
    showToast(tvT('aspectToastOrig'));
  } else if (aspectModeIndex === 1) {
    videoEl.className = 'aspect-cover';
    if (aspectBtn) aspectBtn.textContent = tvT('aspectCover');
    showToast(tvT('aspectToastCover'));
  } else {
    videoEl.className = 'aspect-fill';
    if (aspectBtn) aspectBtn.textContent = tvT('aspectFill');
    showToast(tvT('aspectToastFill'));
  }
}

function isHudVisible() {
  return Boolean(hudEl && hudEl.className !== 'hidden-hud');
}

function hideHudImmediately() {
  if (hudTimer) clearTimeout(hudTimer);
  if (hudEl && currentMode !== 'idle') hudEl.className = 'hidden-hud';
  if (bottomDockEl && currentMode !== 'idle') bottomDockEl.className = 'hidden-hud';
}

function revealHud() {
  if (hudEl) hudEl.className = '';
  if (bottomDockEl) bottomDockEl.className = currentMode === 'idle' ? 'hidden-hud' : '';
  if (hudTimer) clearTimeout(hudTimer);
  hudTimer = setTimeout(function () {
    if (currentMode !== 'idle' && !isMiniGuideOpen) {
      if (hudEl) hudEl.className = 'hidden-hud';
      if (bottomDockEl) bottomDockEl.className = 'hidden-hud';
    }
  }, 4600);
}

function syncPlayPauseButton() {
  if (!btnPlayPause) return;
  if (currentMode === 'hls' || currentMode === 'direct') {
    btnPlayPause.textContent = videoEl && videoEl.paused ? tvT('resumeBtn') : tvT('pauseBtn');
  } else {
    btnPlayPause.textContent = tvT('playPauseBtn');
  }
}

function syncPlayerDockMode(isLiveFlag) {
  if (btnDockRew) btnDockRew.style.display = isLiveFlag ? 'none' : 'inline-flex';
  if (btnDockFf) btnDockFf.style.display = isLiveFlag ? 'none' : 'inline-flex';
  var vodVolBtns = document.querySelectorAll('.dock-vod-vol');
  for (var v = 0; v < vodVolBtns.length; v++) {
    vodVolBtns[v].style.display = isLiveFlag ? 'none' : 'inline-flex';
  }
  if (btnDockGuide) {
    btnDockGuide.style.display = isLiveFlag && activeLiveChannel ? 'inline-flex' : 'none';
  }
  if (btnDockChPrev) btnDockChPrev.style.display = isLiveFlag && activeLiveChannel ? 'inline-flex' : 'none';
  if (btnDockChNext) btnDockChNext.style.display = isLiveFlag && activeLiveChannel ? 'inline-flex' : 'none';
  if (isLiveFlag) {
    var chEpg = activeLiveChannel && catalogData.epg ? catalogData.epg[activeLiveChannel.id] : null;
    if (dockTimeCur) dockTimeCur.textContent = tvT('liveNow');
    if (dockTimeDur) dockTimeDur.textContent = chEpg && chEpg.now ? chEpg.now.startLabel + ' - ' + chEpg.now.stopLabel : '24/7 HD';
    if (dockProgressFill) {
      dockProgressFill.className = 'dock-progress-fill live-fill';
      dockProgressFill.style.width = '100%';
    }
  } else if (dockProgressFill) {
    dockProgressFill.className = 'dock-progress-fill';
    dockProgressFill.style.width = '0%';
  }
}

function switchTvScreen(mode) {
  activeScreen = mode;
  hubScreen.style.display = mode === 'hub' ? 'flex' : 'none';
  pairingScreen.style.display = mode === 'pairing' ? 'flex' : 'none';
  playerScreen.style.display = mode === 'player' ? 'block' : 'none';
  if (mode === 'hub') {
    setTimeout(function () {
      if (lastHubFocusedEl && document.body.contains(lastHubFocusedEl) && lastHubFocusedEl.focus) {
        lastHubFocusedEl.focus();
        return;
      }
      var activeTabBtn = document.querySelector('#hub-nav-tabs .hub-tab-btn.active');
      if (activeTabBtn && activeTabBtn.focus) activeTabBtn.focus();
    }, 50);
  } else if (mode === 'pairing') {
    renderPairingQrSvg(pairingCode);
    setTimeout(function () {
      var btn = document.getElementById('btn-unlock-audio');
      if (btn && btn.focus) btn.focus();
    }, 50);
  } else if (mode === 'player') {
    setTimeout(function () {
      var target = standbyOverlay.style.display !== 'none'
        ? document.getElementById('btn-standby-exit')
        : document.getElementById('btn-hud-playpause');
      if (target && target.focus) target.focus();
    }, 80);
  }
}

function renderDigits(code) {
  var chars = code && code.length === 4 ? code.split('') : ['•', '•', '•', '•'];
  for (var i = 0; i < 4; i++) {
    var tile = document.getElementById('d' + i);
    if (tile) tile.textContent = chars[i];
  }
  if (hubPairCodeEl) {
    hubPairCodeEl.textContent = code && code.length === 4 ? code : '••••';
  }
  renderPairingQrSvg(code);
}

function setServerReady(ready) {
  if (!connBadge) return;
  if (ready) {
    connBadge.className = 'status-badge';
    connBadge.textContent = tvT('tvReady');
  } else {
    connBadge.className = 'status-badge connecting';
    connBadge.textContent = tvT('connecting');
  }
}

function unlockAudio() {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      var ctx = new AudioCtx();
      if (ctx.resume) ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0.001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(ctx.currentTime + 0.04);
    }
  } catch (e) {}
  try {
    if (videoEl) {
      videoEl.muted = false;
      videoEl.volume = currentVolume;
      if (currentMode === 'hls' || currentMode === 'direct') {
        var p = videoEl.play();
        if (p && p.catch) p.catch(function () {});
      }
    }
  } catch (e) {}
  audioUnlocked = true;
  unmuteBanner.style.display = 'none';
  var btnAudio = document.getElementById('btn-unlock-audio');
  if (btnAudio) {
    btnAudio.className = 'tv-btn-primary unlocked';
    btnAudio.textContent = tvT('audioUnlocked');
  }
}

// ===================================================================
// ZERO-REINSTALL AUTOMATIC VERSION CONTROL & SILENT TIZEN OTA SYNC
// ===================================================================
function clearTvCachesForUpdate() {
  try {
    localStorage.removeItem('naim_tv_tdt_snap_v2');
  } catch (e) {}
  liveExtractCache = {};
  try {
    if (window.caches && window.caches.keys) {
      window.caches.keys().then(function (keys) {
        for (var i = 0; i < keys.length; i++) {
          window.caches.delete(keys[i]);
        }
      });
    }
  } catch (e) {}
}

// Clear stale channel snapshot immediately if server build changed since last boot
try {
  if (currentTvBuildSig) {
    var prevBootBuild = localStorage.getItem(TV_WEB_BUILD_KEY) || '';
    if (prevBootBuild && prevBootBuild !== currentTvBuildSig) {
      clearTvCachesForUpdate();
    }
    localStorage.setItem(TV_WEB_BUILD_KEY, currentTvBuildSig);
  }
} catch (e) {}

function applyPendingTvAutoUpdate(forceBuildSig, forceManualReload) {
  var nextBuild = forceBuildSig || pendingTvAutoUpdateBuild || currentTvBuildSig;
  if (!nextBuild) return false;
  var lastReload = 0;
  try {
    lastReload = Number(sessionStorage.getItem(TV_RELOAD_GUARD_KEY) || '0');
  } catch (e) {}
  if (!forceManualReload && Date.now() - lastReload < 25000) return false;
  try {
    sessionStorage.setItem(TV_RELOAD_GUARD_KEY, String(Date.now()));
    localStorage.setItem(TV_WEB_BUILD_KEY, String(nextBuild));
  } catch (e) {}
  clearTvCachesForUpdate();
  var apiOrigin = (typeof window.__RIFFAN_API_ORIGIN__ === 'string' && window.__RIFFAN_API_ORIGIN__.indexOf('http') === 0)
    ? window.__RIFFAN_API_ORIGIN__.replace(/\/+$/, '')
    : '';
  var baseTvPath = (window.location && window.location.protocol === 'file:' && apiOrigin)
    ? (apiOrigin + '/tv')
    : '/tv';
  var targetUrl = baseTvPath + '?_upd=' + encodeURIComponent(nextBuild + '-' + Date.now());
  if (typeof isTizenDevice !== 'undefined' && isTizenDevice) {
    targetUrl += '&platform=tizen';
  }
  if (isPaired && currentRoomId) {
    targetUrl += '&room=' + encodeURIComponent(currentRoomId);
  }
  showToast(tvT('otaApplyingToast'));
  setTimeout(function () {
    if (window.location && window.location.protocol === 'file:' && !apiOrigin) {
      window.location.reload();
    } else {
      window.location.replace(targetUrl);
    }
  }, 180);
  return true;
}

function updateOtaStatusLabels(remoteBuild) {
  var shortSig = String(remoteBuild || currentTvBuildSig || TV_WEB_VERSION).slice(0, 8);
  if (pendingTvAutoUpdateBuild) {
    if (tvAutoUpdatePill) tvAutoUpdatePill.textContent = tvT('autoSyncQueued');
    if (tvOtaStatusSub) tvOtaStatusSub.textContent = tvT('otaStatusQueued');
  } else {
    if (tvAutoUpdatePill) tvAutoUpdatePill.textContent = tvT('autoSyncIdle') + ' · ' + shortSig;
    if (tvOtaStatusSub) tvOtaStatusSub.textContent = tvT('otaStatusSynced') + shortSig;
  }
}

function runTvVersionCheck(isManual) {
  if (isManual && btnCheckTvUpdate) {
    btnCheckTvUpdate.textContent = tvT('otaChecking');
  }
  xhrJson('GET', '/api/app/latest?platform=tv&_=' + Date.now(), null, function (err, data) {
    if (isManual && btnCheckTvUpdate) {
      btnCheckTvUpdate.textContent = tvT('otaCheckBtn');
    }
    if (err || !data) {
      if (isManual) showToast(tvT('otaUpdatedToast'));
      return;
    }
    var remoteWebVer = String((data.web && data.web.version) || data.versionName || '');
    var remoteBuild = String((data.tvWeb && data.tvWeb.build) || (data.web && data.web.build) || remoteWebVer || '');

    if (remoteWebVer) {
      try { localStorage.setItem(TV_WEB_VER_KEY, remoteWebVer); } catch (e) {}
    }

    if (remoteBuild) {
      var prevBuild = currentTvBuildSig;
      if (!prevBuild) {
        try { prevBuild = localStorage.getItem(TV_WEB_BUILD_KEY) || ''; } catch (e) {}
        currentTvBuildSig = remoteBuild;
      }
      try { localStorage.setItem(TV_WEB_BUILD_KEY, remoteBuild); } catch (e) {}

      if (prevBuild && remoteBuild !== prevBuild) {
        pendingTvAutoUpdateBuild = remoteBuild;
        updateOtaStatusLabels(remoteBuild);
        var activelyWatching = activeScreen === 'player' && currentMode !== 'idle';
        if (!activelyWatching || isManual) {
          if (applyPendingTvAutoUpdate(remoteBuild, Boolean(isManual))) return;
        }
      } else {
        updateOtaStatusLabels(remoteBuild);
        if (isManual) {
          // Allow manual click to force a clean cache-free reload & fresh channel catalog
          clearTvCachesForUpdate();
          if (typeof loadTvCatalog === 'function') loadTvCatalog();
          applyPendingTvAutoUpdate(remoteBuild, true);
        }
      }
    }

    if (installedApkCode > 0 && data.tv && Number(data.tv.versionCode) > installedApkCode) {
      if (otaBanner && otaText && btnOtaInstall) {
        otaText.textContent = 'Nueva APK Google TV v' + (data.tv.versionName || remoteWebVer) + ' disponible';
        otaBanner.style.display = 'flex';
        btnOtaInstall.onclick = function () {
          window.location.href = data.tv.apkUrl || '/RIFFAN-TV-TV.apk';
        };
      }
    }
  });
}

updateOtaStatusLabels(currentTvBuildSig);
runTvVersionCheck(false);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') runTvVersionCheck(false);
});
setInterval(function () {
  runTvVersionCheck(false);
}, 45 * 1000);

// ===================================================================
// PAIRING ENGINE (WORKS IN BACKGROUND)
// ===================================================================
function requestPairingCode(forceNew) {
  xhrJson(
    'POST',
    '/api/tv/register',
    { forceNew: Boolean(forceNew), existingCode: forceNew ? '' : pairingCode },
    function (err, data) {
      if (!err && data && data.success && data.code) {
        pairingCode = String(data.code);
        renderDigits(pairingCode);
        setServerReady(true);
        if (pairingWs && pairingWs.readyState === 1) {
          try {
            pairingWs.send(
              JSON.stringify({
                type: 'TV_REGISTER_PAIRING',
                payload: { existingCode: pairingCode }
              })
            );
          } catch (e) {}
        }
      }
    }
  );
}

function connectPairingWs() {
  if (isPaired || !window.WebSocket) return;
  try {
    var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + window.location.host + '/ws');
    pairingWs = ws;
    ws.onopen = function () {
      if (isPaired) return;
      setServerReady(true);
      ws.send(
        JSON.stringify({
          type: 'TV_REGISTER_PAIRING',
          payload: { existingCode: pairingCode }
        })
      );
    };
    ws.onmessage = function (ev) {
      if (isPaired) return;
      try {
        var msg = JSON.parse(ev.data);
        if (
          (msg.type === 'TV_PAIRING_READY' || msg.type === 'TV_PAIRING_CODE') &&
          msg.payload &&
          msg.payload.code
        ) {
          pairingCode = String(msg.payload.code);
          renderDigits(pairingCode);
          setServerReady(true);
        } else if (msg.type === 'TV_PAIRED_REDIRECT' && msg.payload && msg.payload.roomId) {
          enterRoomReceiver(
            String(msg.payload.roomId),
            String(msg.payload.roomName || ''),
            String(msg.payload.tvAuthToken || ''),
            String(msg.payload.claimedBy || msg.payload.pairedBy || tvT('yourPhone'))
          );
        }
      } catch (e) {}
    };
    ws.onclose = function () {
      if (!isPaired) setTimeout(connectPairingWs, 3500);
    };
  } catch (e) {}
}

setInterval(function () {
  if (isPaired) return;
  if (!pairingCode) {
    requestPairingCode(false);
    return;
  }
  xhrJson('GET', '/api/tv/poll/' + encodeURIComponent(pairingCode), null, function (err, data) {
    if (err || !data || isPaired) return;
    if (data.paired && data.roomId) {
      enterRoomReceiver(
        String(data.roomId),
        String(data.roomName || ''),
        String(data.tvAuthToken || ''),
        String(data.claimedBy || tvT('yourPhone'))
      );
    } else if (data.expired) {
      requestPairingCode(true);
    } else if (data.success) {
      setServerReady(true);
    }
  });
}, 2000);
