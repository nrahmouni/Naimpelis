// Core State & DOM Refs (ES5)
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
var activeLiveFilter = 'all';
var activeAdrarCountry = 'all';
var activeLiveSearch = '';
var activeLiveVisibleLimit = 60;
var lastHubFocusedEl = null;

var pairingWs = null;
var roomWs = null;
var hlsInstance = null;
var ytPlayer = null;
var ytReady = false;
var pendingYtVideoId = '';
var pendingYtStart = 0;
var pendingYtPlay = true;

var hubScreen = document.getElementById('tv-hub-screen');
var hubScrollBody = document.getElementById('hub-scroll-body');
var hubDynamicContent = document.getElementById('hub-dynamic-content');
var hubPairCodeEl = document.getElementById('hub-pair-code');
var pairingScreen = document.getElementById('pairing-screen');
var playerScreen = document.getElementById('player-screen');
var standbyOverlay = document.getElementById('standby-overlay');
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

var toastTimer = null;
var fsPromptTimer = null;
var videoWatchdogTimer = null;
var aspectModeIndex = 0;
var activeHubTab = 'home';
var autoFailoverLock = false;

// Google TV Hub Catalog + Live EPG Store
var catalogData = {
  loaded: false,
  cinemaReleases: [],
  newSeasons: [],
  movies: [],
  series: [],
  anime: [],
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
  }, 3000);
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
  var ids = ['btn-pairing-fs', 'btn-dock-fs', 'btn-hub-fs'];
  for (var i = 0; i < ids.length; i++) {
    var b = document.getElementById(ids[i]);
    if (b) {
      b.textContent = active ? tvT('fsActive') : tvT('fsBtn');
      b.className = active ? 'tv-btn-fullscreen active-fs' : 'tv-btn-fullscreen';
    }
  }
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
    if (currentMode !== 'idle') {
      if (hudEl) hudEl.className = 'hidden-hud';
      if (bottomDockEl) bottomDockEl.className = 'hidden-hud';
    }
  }, 4800);
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
  if (btnDockRew) btnDockRew.style.display = isLiveFlag ? 'none' : 'inline-block';
  if (btnDockFf) btnDockFf.style.display = isLiveFlag ? 'none' : 'inline-block';
  if (btnDockChPrev) btnDockChPrev.style.display = isLiveFlag && activeLiveChannel ? 'inline-block' : 'none';
  if (btnDockChNext) btnDockChNext.style.display = isLiveFlag && activeLiveChannel ? 'inline-block' : 'none';
  if (isLiveFlag) {
    var chEpg = activeLiveChannel && catalogData.epg ? catalogData.epg[activeLiveChannel.id] : null;
    if (dockTimeCur) dockTimeCur.textContent = tvT('liveNow');
    if (dockTimeDur) dockTimeDur.textContent = chEpg && chEpg.now ? chEpg.now.startLabel + '-' + chEpg.now.stopLabel : '24/7 HD';
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
    }, 60);
  } else if (mode === 'pairing') {
    setTimeout(function () {
      var btn = document.getElementById('btn-unlock-audio');
      if (btn && btn.focus) btn.focus();
    }, 60);
  } else if (mode === 'player') {
    setTimeout(function () {
      var target = standbyOverlay.style.display !== 'none'
        ? document.getElementById('btn-standby-exit')
        : document.getElementById('btn-hud-playpause');
      if (target && target.focus) target.focus();
    }, 90);
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
// AUTOMATIC VERSION CONTROL & OTA SYNC
// ===================================================================
function runTvVersionCheck() {
  xhrJson('GET', '/api/app/latest?platform=tv&_=' + Date.now(), null, function (err, data) {
    if (err || !data) return;
    var remoteWebVer = String((data.web && data.web.version) || data.versionName || '');
    if (remoteWebVer) {
      var prevVer = TV_WEB_VERSION;
      try {
        prevVer = localStorage.getItem(TV_WEB_VER_KEY) || TV_WEB_VERSION;
        localStorage.setItem(TV_WEB_VER_KEY, remoteWebVer);
      } catch (e) {}

      if (remoteWebVer !== TV_WEB_VERSION && remoteWebVer !== prevVer) {
        var lastReload = 0;
        try {
          lastReload = Number(sessionStorage.getItem(TV_RELOAD_GUARD_KEY) || '0');
        } catch (e) {}
        if (Date.now() - lastReload > 60000) {
          try {
            sessionStorage.setItem(TV_RELOAD_GUARD_KEY, String(Date.now()));
          } catch (e) {}
          window.location.reload();
          return;
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
runTvVersionCheck();
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') runTvVersionCheck();
});
setInterval(runTvVersionCheck, 10 * 60 * 1000);

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
            String(msg.payload.claimedBy || msg.payload.pairedBy || 'tu móvil')
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
        String(data.claimedBy || 'tu móvil')
      );
    } else if (data.expired) {
      requestPairingCode(true);
    } else if (data.success) {
      setServerReady(true);
    }
  });
}, 2000);
