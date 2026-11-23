// ===================================================================
// ROW-AWARE SPATIAL 10-FOOT D-PAD, MINI-GUIDE & TIZEN REMOTE (ES5)
// ===================================================================
function getFocusableRoot() {
  if (voiceModal && voiceModal.style.display === 'block') return voiceModal;
  if (seriesModal && seriesModal.style.display === 'block') return seriesModal;
  if (fsPromptBanner && fsPromptBanner.style.display === 'block') return fsPromptBanner;
  if (activeScreen === 'player' && isMiniGuideOpen && miniGuideDrawer) return miniGuideDrawer;
  if (activeScreen === 'player') return playerScreen;
  if (activeScreen === 'pairing') return pairingScreen;
  return hubScreen;
}

function getVisibleFocusables() {
  var root = getFocusableRoot();
  var all = root.querySelectorAll('button, input, a[href], [tabindex="0"]');
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (el.disabled) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) continue;
    out.push({ el: el, rect: rect });
  }
  return out;
}

function ensureFocusVisibleInContainer(el) {
  if (!el) return;
  try {
    var parent = el.parentNode;
    while (parent && parent !== document.body) {
      if (parent.className && (parent.className.indexOf('tv-rail') !== -1 || parent.className.indexOf('mg-channel-list') !== -1)) {
        var pRect = parent.getBoundingClientRect();
        var eRect = el.getBoundingClientRect();
        if (parent.className.indexOf('tv-rail') !== -1) {
          if (eRect.right > pRect.right - 28 || eRect.left < pRect.left + 28) {
            parent.scrollLeft += (eRect.left + eRect.width / 2) - (pRect.left + pRect.width / 2);
          }
        }
      }
      parent = parent.parentNode;
    }
    if (hubScrollBody && hubDynamicContent && hubDynamicContent.contains(el)) {
      var sRect = hubScrollBody.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      if (elRect.bottom > sRect.bottom - 28) {
        hubScrollBody.scrollTop += (elRect.bottom - sRect.bottom) + 44;
      } else if (elRect.top < sRect.top + 20) {
        hubScrollBody.scrollTop -= (sRect.top - elRect.top) + 36;
      }
    } else if (el.scrollIntoView) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  } catch (e) {}
}

function moveFocusDirection(dir) {
  var list = getVisibleFocusables();
  if (!list.length) return;
  var active = document.activeElement;
  var activeRect = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].el === active) {
      activeRect = list[i].rect;
      break;
    }
  }
  if (!activeRect) {
    list[0].el.focus();
    ensureFocusVisibleInContainer(list[0].el);
    return;
  }

  var cx = activeRect.left + activeRect.width / 2;
  var cy = activeRect.top + activeRect.height / 2;
  var isHorizontal = dir === 'left' || dir === 'right';
  var bestSameBand = null;
  var bestSameBandScore = Infinity;
  var bestAny = null;
  var bestAnyScore = Infinity;

  for (var j = 0; j < list.length; j++) {
    var cand = list[j];
    if (cand.el === active) continue;
    var r = cand.rect;
    var tx = r.left + r.width / 2;
    var ty = r.top + r.height / 2;
    var dx = tx - cx;
    var dy = ty - cy;

    var valid = false;
    var primary = 0;
    var secondary = 0;
    if (dir === 'left' && dx < -6) {
      valid = true;
      primary = -dx;
      secondary = Math.abs(dy) * 2.8;
    } else if (dir === 'right' && dx > 6) {
      valid = true;
      primary = dx;
      secondary = Math.abs(dy) * 2.8;
    } else if (dir === 'up' && dy < -6) {
      valid = true;
      primary = -dy;
      secondary = Math.abs(dx) * 1.4;
    } else if (dir === 'down' && dy > 6) {
      valid = true;
      primary = dy;
      secondary = Math.abs(dx) * 1.4;
    }
    if (!valid) continue;

    var score = primary + secondary;
    if (isHorizontal && Math.abs(dy) < Math.max(activeRect.height, r.height) * 0.75) {
      if (score < bestSameBandScore) {
        bestSameBandScore = score;
        bestSameBand = cand.el;
      }
    }
    if (score < bestAnyScore) {
      bestAnyScore = score;
      bestAny = cand.el;
    }
  }

  var chosen = bestSameBand || bestAny;
  if (chosen) {
    chosen.focus();
    ensureFocusVisibleInContainer(chosen);
  }
}

// Expand/Collapse left sidebar rail cleanly on D-pad focus
if (tvSideRail && tvSideRail.addEventListener) {
  tvSideRail.addEventListener('focusin', function () {
    tvSideRail.className = 'tv-side-rail expanded';
  });
  tvSideRail.addEventListener('focusout', function (ev) {
    setTimeout(function () {
      if (!tvSideRail.contains(document.activeElement)) {
        tvSideRail.className = 'tv-side-rail';
      }
    }, 30);
  });
}

// ===================================================================
// UI WIRE-UP & SMART TV VOICE ASSISTANT (ES5)
// ===================================================================
var tabBtns = document.querySelectorAll('#hub-nav-tabs .hub-tab-btn');
for (var t = 0; t < tabBtns.length; t++) {
  (function (tb) {
    tb.onclick = function () {
      for (var k = 0; k < tabBtns.length; k++) {
        var dk = tabBtns[k].getAttribute('data-tab');
        tabBtns[k].className = dk === 'search' ? 'hub-tab-btn rail-item search-left-btn' : 'hub-tab-btn rail-item';
      }
      var curTab = tb.getAttribute('data-tab') || 'home';
      tb.className = (curTab === 'search' ? 'hub-tab-btn rail-item search-left-btn active' : 'hub-tab-btn rail-item active');
      activeHubTab = curTab;
      if (hubScrollBody) hubScrollBody.scrollTop = 0;
      renderHubContent();
    };
  })(tabBtns[t]);
}

var mgFilterBtns = document.querySelectorAll('#mg-filter-row .mg-filter-btn');
for (var mgi = 0; mgi < mgFilterBtns.length; mgi++) {
  (function (fb) {
    fb.onclick = function () {
      for (var k = 0; k < mgFilterBtns.length; k++) {
        mgFilterBtns[k].className = 'mg-filter-btn';
      }
      fb.className = 'mg-filter-btn active';
      activeMiniGuideFilter = fb.getAttribute('data-mg-filter') || 'es_tdt';
      renderMiniGuideList();
    };
  })(mgFilterBtns[mgi]);
}

var langBtns = document.querySelectorAll('#sm-lang-row .series-pill-btn');
for (var l = 0; l < langBtns.length; l++) {
  (function (lb) {
    lb.onclick = function () {
      for (var k = 0; k < langBtns.length; k++) {
        langBtns[k].className = 'series-pill-btn';
      }
      lb.className = 'series-pill-btn active';
      activeSeriesLang = lb.getAttribute('data-lang') || 'ES';
      showToast(tvT('langChosen') + activeSeriesLang);
    };
  })(langBtns[l]);
}

function cycleTvLanguage() {
  var nextL = activeTvLang === 'es' ? 'ca' : (activeTvLang === 'ca' ? 'en' : 'es');
  applyTvLanguage(nextL);
  showToast(tvT('langToast'));
  loadTvCatalog();
}
var btnHubLang = document.getElementById('btn-hub-lang');
if (btnHubLang) btnHubLang.onclick = cycleTvLanguage;
var btnPairingLang = document.getElementById('btn-pairing-lang');
if (btnPairingLang) btnPairingLang.onclick = cycleTvLanguage;

document.getElementById('btn-close-series-modal').onclick = function () {
  seriesModal.style.display = 'none';
  if (lastHubFocusedEl && lastHubFocusedEl.focus) {
    setTimeout(function () { lastHubFocusedEl.focus(); }, 30);
  }
};

var tvVoicePrevItems = [];
var tvVoiceReplyEl = document.getElementById('tv-voice-reply');
var tvVoiceInputEl = document.getElementById('tv-voice-input');
var tvVoiceResultsEl = document.getElementById('tv-voice-results');
var tvVoiceBtn = document.getElementById('btn-hub-voice');
var tvVoiceMicBtn = document.getElementById('btn-tv-voice-mic');

function speakTvText(txt) {
  try {
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(txt);
      u.lang = activeTvLang === 'ca' ? 'ca-ES' : (activeTvLang === 'en' ? 'en-US' : 'es-ES');
      window.speechSynthesis.speak(u);
    }
  } catch (e) {}
}

function playTvVoiceCandidate(item) {
  if (!item) return;
  if (voiceModal) voiceModal.style.display = 'none';
  unlockAudio();
  if (item.kind === 'channel' && item.channel) {
    playTdtChannelOnTv(item.channel, 0);
  } else if (item.kind === 'series' && item.media) {
    openSeriesModalOnTv(item.media);
  } else if (item.media) {
    playMovieOnTv(item.media);
  }
}

function submitTvVoiceQuery(qStr) {
  var cleanQ = String(qStr || '').replace(/^\s+|\s+$/g, '');
  if (!cleanQ) return;
  if (tvVoiceReplyEl) tvVoiceReplyEl.textContent = 'Buscando "' + cleanQ + '"...';
  xhrJson(
    'POST',
    '/api/ai/voice-assistant',
    { query: cleanQ, userName: 'Smart TV', lang: activeTvLang, previousItems: tvVoicePrevItems },
    function (err, data) {
      if (err || !data) {
        if (tvVoiceReplyEl) tvVoiceReplyEl.textContent = 'No pude conectar con el asistente.';
        return;
      }
      var replyTxt = data.spokenReply || 'Aquí tienes las opciones.';
      if (tvVoiceReplyEl) tvVoiceReplyEl.textContent = replyTxt;
      speakTvText(replyTxt);
      var list = Array.isArray(data.items) ? data.items : [];
      tvVoicePrevItems = list;
      if (data.autoPlay && list.length > 0) {
        setTimeout(function () { playTvVoiceCandidate(list[0]); }, 450);
        return;
      }
      if (tvVoiceResultsEl) {
        tvVoiceResultsEl.innerHTML = '';
        for (var vi = 0; vi < list.length; vi++) {
          (function (vItem) {
            var cardEl = vItem.kind === 'channel' && vItem.channel
              ? buildCardButton(vItem.channel, 'tdt')
              : buildCardButton(vItem.media || { title: vItem.title, poster: vItem.imageUrl, mediaType: vItem.kind === 'series' ? 'tv' : 'movie' }, 'media');
            cardEl.onclick = function () { playTvVoiceCandidate(vItem); };
            tvVoiceResultsEl.appendChild(cardEl);
          })(list[vi]);
        }
        setTimeout(function () {
          var firstRes = tvVoiceResultsEl.querySelector('.tv-card');
          if (firstRes && firstRes.focus) firstRes.focus();
        }, 40);
      }
    }
  );
}

function startTvVoiceRecognition() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (tvVoiceInputEl && tvVoiceInputEl.focus) tvVoiceInputEl.focus();
    showToast('Escribe tu petición o elige una sugerencia');
    return;
  }
  try {
    var rec = new SR();
    rec.lang = activeTvLang === 'ca' ? 'ca-ES' : (activeTvLang === 'en' ? 'en-US' : 'es-ES');
    rec.interimResults = false;
    if (tvVoiceMicBtn) tvVoiceMicBtn.textContent = 'Escuchando...';
    rec.onresult = function (ev) {
      if (ev.results && ev.results[0] && ev.results[0][0]) {
        var heard = ev.results[0][0].transcript;
        if (tvVoiceInputEl) tvVoiceInputEl.value = heard;
        submitTvVoiceQuery(heard);
      }
    };
    rec.onend = function () {
      if (tvVoiceMicBtn) tvVoiceMicBtn.textContent = 'Hablar';
    };
    rec.onerror = function () {
      if (tvVoiceMicBtn) tvVoiceMicBtn.textContent = 'Hablar';
    };
    rec.start();
  } catch (e) {}
}

if (tvVoiceBtn) {
  tvVoiceBtn.onclick = function () {
    lastHubFocusedEl = tvVoiceBtn;
    if (voiceModal) voiceModal.style.display = 'block';
    if (tvVoiceResultsEl) tvVoiceResultsEl.innerHTML = '';
    tvVoicePrevItems = [];
    var greet = '¡Hola! ¿Qué canal o película quieres ver?';
    if (tvVoiceReplyEl) tvVoiceReplyEl.textContent = greet;
    speakTvText(greet);
    setTimeout(function () {
      if (tvVoiceMicBtn && tvVoiceMicBtn.focus) tvVoiceMicBtn.focus();
    }, 40);
  };
}
var btnCloseVoice = document.getElementById('btn-close-voice-modal');
if (btnCloseVoice) {
  btnCloseVoice.onclick = function () {
    if (voiceModal) voiceModal.style.display = 'none';
    if (lastHubFocusedEl && lastHubFocusedEl.focus) lastHubFocusedEl.focus();
  };
}
if (tvVoiceMicBtn) tvVoiceMicBtn.onclick = startTvVoiceRecognition;
var tvVoiceFormEl = document.getElementById('tv-voice-form');
if (tvVoiceFormEl) {
  tvVoiceFormEl.onsubmit = function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (tvVoiceInputEl) submitTvVoiceQuery(tvVoiceInputEl.value);
    return false;
  };
}
var vChips = document.querySelectorAll('.tv-voice-chip');
for (var vc = 0; vc < vChips.length; vc++) {
  (function (vcEl) {
    vcEl.onclick = function () {
      var q = vcEl.getAttribute('data-vq');
      if (tvVoiceInputEl) tvVoiceInputEl.value = q;
      submitTvVoiceQuery(q);
    };
  })(vChips[vc]);
}

document.getElementById('btn-go-pairing').onclick = function () {
  lastHubFocusedEl = document.getElementById('btn-go-pairing');
  switchTvScreen('pairing');
};
var btnStagePairShortcut = document.getElementById('btn-stage-pair-shortcut');
if (btnStagePairShortcut) {
  btnStagePairShortcut.onclick = function () {
    lastHubFocusedEl = btnStagePairShortcut;
    switchTvScreen('pairing');
  };
}
if (btnCheckTvUpdate) {
  btnCheckTvUpdate.onclick = function () {
    runTvVersionCheck(true);
  };
}
document.getElementById('btn-back-to-hub').onclick = function () {
  switchTvScreen('hub');
};
document.getElementById('btn-hub-fs').onclick = function () {
  unlockAudio();
  requestTvFullscreen(false);
};
document.getElementById('btn-unlock-audio').onclick = function () {
  unlockAudio();
  if (!isBrowserInFullscreen()) requestTvFullscreen(false);
};
document.getElementById('btn-unmute-now').onclick = function () {
  unlockAudio();
};
document.getElementById('btn-pairing-fs').onclick = function () {
  unlockAudio();
  requestTvFullscreen(false);
};
document.getElementById('btn-dock-fs').onclick = function () {
  unlockAudio();
  requestTvFullscreen(false);
};
if (btnConfirmRemoteFs) {
  btnConfirmRemoteFs.onclick = function () {
    if (fsPromptBanner) fsPromptBanner.style.display = 'none';
    unlockAudio();
    requestTvFullscreen(false);
  };
}
document.getElementById('btn-dock-aspect').onclick = cycleVideoAspect;
if (btnStandbyRetry) {
  btnStandbyRetry.onclick = function () {
    autoFailoverLock = false;
    triggerPlaybackFailover('Manual retry');
  };
}
if (btnDockGuide) {
  btnDockGuide.onclick = function () {
    openMiniGuideDrawer();
  };
}
var btnCloseMiniGuide = document.getElementById('btn-close-miniguide');
if (btnCloseMiniGuide) {
  btnCloseMiniGuide.onclick = function () {
    closeMiniGuideDrawer();
  };
}
if (btnDockChPrev) {
  btnDockChPrev.onclick = function () { zapLiveChannel(-1); };
}
if (btnDockChNext) {
  btnDockChNext.onclick = function () { zapLiveChannel(1); };
}
document.getElementById('btn-dock-rew').onclick = function () {
  if (!currentIsLive && (currentMode === 'hls' || currentMode === 'direct')) {
    videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) - 15);
    showToast('-15s');
  } else if (!currentIsLive && currentMode === 'youtube' && ytPlayer && ytPlayer.getCurrentTime) {
    ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 15), true);
    showToast('-15s');
  }
};
document.getElementById('btn-dock-ff').onclick = function () {
  if (!currentIsLive && (currentMode === 'hls' || currentMode === 'direct')) {
    videoEl.currentTime = (videoEl.currentTime || 0) + 15;
    showToast('+15s');
  } else if (!currentIsLive && currentMode === 'youtube' && ytPlayer && ytPlayer.getCurrentTime) {
    ytPlayer.seekTo(ytPlayer.getCurrentTime() + 15, true);
    showToast('+15s');
  }
};
if (btnDockAudio) {
  btnDockAudio.onclick = function () {
    if (!localTracks || localTracks.length < 2) return;
    var nextIdx = (localTrackIdx + 1) % localTracks.length;
    if (activeLiveChannel) {
      showToast(tvT('changingSignal'));
      playTdtChannelOnTv(activeLiveChannel, nextIdx);
    } else {
      var resumeT = !currentIsLive && videoEl.currentTime > 2 ? videoEl.currentTime : 0;
      showToast(tvT('changingTrack'));
      switchToLocalTrack(nextIdx, resumeT);
    }
  };
}
document.getElementById('btn-dock-voldown').onclick = function () { handleRemoteCommand('vol_down'); };
document.getElementById('btn-dock-volup').onclick = function () { handleRemoteCommand('vol_up'); };
document.getElementById('btn-dock-mute').onclick = function () { handleRemoteCommand('toggle_mute'); };
document.getElementById('btn-new-code').onclick = function () { requestPairingCode(true); };
document.getElementById('btn-web-mode').onclick = function () { window.location.href = '/?web=1'; };
document.getElementById('btn-standby-exit').onclick = exitPlayerToHubOrPairing;
document.getElementById('btn-hud-exit').onclick = exitPlayerToHubOrPairing;
document.getElementById('btn-hud-reload').onclick = function () { handleRemoteCommand('reload_tv'); };
document.getElementById('btn-hud-playpause').onclick = function () {
  unlockAudio();
  if (currentMode === 'hls' || currentMode === 'direct') {
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
    syncPlayPauseButton();
  } else if (currentMode === 'youtube' && ytPlayer) {
    var st = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
    if (st === 1) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  }
};

document.getElementById('direct-room-form').onsubmit = function (e) {
  if (e && e.preventDefault) e.preventDefault();
  var raw = document.getElementById('direct-room-input').value || '';
  var clean = raw.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
  if (!clean) return false;
  unlockAudio();
  enterRoomReceiver(clean, tvT('roomPrefix') + clean.toUpperCase(), '', tvT('tvRemoteLabel'));
  return false;
};

document.addEventListener('fullscreenchange', syncFullscreenButtons);
document.addEventListener('webkitfullscreenchange', syncFullscreenButtons);
document.addEventListener('mousemove', function () {
  if (activeScreen === 'player' && !isMiniGuideOpen) revealHud();
});
document.addEventListener('click', function () {
  if (activeScreen === 'player' && !isMiniGuideOpen) revealHud();
});

document.addEventListener('keydown', function (e) {
  var code = e.keyCode || e.which;
  var keyName = e.key || '';
  var activeEl = document.activeElement;
  var targetTag = activeEl && activeEl.tagName ? String(activeEl.tagName).toUpperCase() : '';

  // 0-9 remote numeric dial zapping (when not typing inside an INPUT)
  if (targetTag !== 'INPUT' && (!voiceModal || voiceModal.style.display !== 'block') && (!seriesModal || seriesModal.style.display !== 'block')) {
    if (code >= 48 && code <= 57) {
      if (e.preventDefault) e.preventDefault();
      handleDialDigit(String(code - 48));
      return;
    }
    if (code >= 96 && code <= 105) {
      if (e.preventDefault) e.preventDefault();
      handleDialDigit(String(code - 96));
      return;
    }
  }

  if (keyName === 'ChannelUp' || code === 166 || code === 427) {
    if (activeScreen === 'player' && activeLiveChannel) {
      if (e.preventDefault) e.preventDefault();
      zapLiveChannel(1);
      return;
    }
  }
  if (keyName === 'ChannelDown' || code === 167 || code === 428) {
    if (activeScreen === 'player' && activeLiveChannel) {
      if (e.preventDefault) e.preventDefault();
      zapLiveChannel(-1);
      return;
    }
  }

  if (activeScreen === 'player' && !isMiniGuideOpen && currentMode !== 'idle' && !isHudVisible() && standbyOverlay.style.display === 'none') {
    if (code === 23 || code === 66 || code === 13 || code === 32) {
      if (e.preventDefault) e.preventDefault();
      revealHud();
      if (btnPlayPause && btnPlayPause.focus) btnPlayPause.focus();
      return;
    }
    if ((code === 37 || code === 21) && activeLiveChannel) {
      if (e.preventDefault) e.preventDefault();
      openMiniGuideDrawer();
      return;
    }
    if ((code === 38 || code === 19) && activeLiveChannel && keyName !== 'MediaPause') {
      if (e.preventDefault) e.preventDefault();
      zapLiveChannel(-1);
      return;
    }
    if ((code === 40 || code === 20) && activeLiveChannel) {
      if (e.preventDefault) e.preventDefault();
      zapLiveChannel(1);
      return;
    }
    if (code === 37 || code === 21 || code === 39 || code === 22 || code === 38 || code === 40 || code === 19 || code === 20) {
      if (e.preventDefault) e.preventDefault();
      revealHud();
      if (btnPlayPause && btnPlayPause.focus) btnPlayPause.focus();
      return;
    }
  }

  if (code === 37 || code === 21) {
    if (targetTag === 'INPUT' && activeEl.selectionStart > 0) return;
    if (e.preventDefault) e.preventDefault();
    if (activeScreen === 'player' && !isMiniGuideOpen) revealHud();
    moveFocusDirection('left');
    return;
  }
  if (code === 38 || code === 19) {
    if (keyName === 'MediaPause') {
      if (activeScreen === 'player' && videoEl && !videoEl.paused) videoEl.pause();
      return;
    }
    if (e.preventDefault) e.preventDefault();
    if (activeScreen === 'player' && !isMiniGuideOpen) revealHud();
    moveFocusDirection('up');
    return;
  }
  if (code === 39 || code === 22) {
    if (targetTag === 'INPUT' && activeEl.selectionEnd < (activeEl.value || '').length) return;
    if (e.preventDefault) e.preventDefault();
    if (activeScreen === 'player' && !isMiniGuideOpen) revealHud();
    moveFocusDirection('right');
    return;
  }
  if (code === 40 || code === 20) {
    if (e.preventDefault) e.preventDefault();
    if (activeScreen === 'player' && !isMiniGuideOpen) revealHud();
    moveFocusDirection('down');
    return;
  }
  if (code === 23 || code === 66 || (code === 13 && targetTag !== 'INPUT')) {
    if (activeEl && activeEl.click) {
      if (e.preventDefault) e.preventDefault();
      activeEl.click();
    }
    return;
  }

  if (targetTag === 'INPUT' && code !== 27 && code !== 10009) return;

  // Back / Escape / Tizen Return (10009) / LG webOS Back (461) / Android Back (4)
  if (code === 27 || code === 8 || code === 4 || code === 10009 || code === 461) {
    if (targetTag === 'INPUT') {
      if (e.preventDefault) e.preventDefault();
      activeEl.blur();
      return;
    }
    if (activeScreen === 'player' && isMiniGuideOpen) {
      if (e.preventDefault) e.preventDefault();
      closeMiniGuideDrawer();
      return;
    }
    if (voiceModal && voiceModal.style.display === 'block') {
      if (e.preventDefault) e.preventDefault();
      voiceModal.style.display = 'none';
      if (lastHubFocusedEl && lastHubFocusedEl.focus) lastHubFocusedEl.focus();
      return;
    }
    if (seriesModal && seriesModal.style.display === 'block') {
      if (e.preventDefault) e.preventDefault();
      seriesModal.style.display = 'none';
      if (lastHubFocusedEl && lastHubFocusedEl.focus) lastHubFocusedEl.focus();
      return;
    }
    if (activeScreen === 'player') {
      if (isBrowserInFullscreen()) {
        if (e.preventDefault) e.preventDefault();
        try {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (fsErr) {}
        setTimeout(syncFullscreenButtons, 120);
        return;
      }
      if (e.preventDefault) e.preventDefault();
      exitPlayerToHubOrPairing();
      return;
    }
    if (activeScreen === 'pairing') {
      if (e.preventDefault) e.preventDefault();
      switchTvScreen('hub');
      return;
    }
    if (activeScreen === 'hub' && code === 10009 && window.tizen && window.tizen.application) {
      if (e.preventDefault) e.preventDefault();
      var nowTs = Date.now();
      if (window.__riffanBackExitTs && nowTs - window.__riffanBackExitTs < 2600) {
        try { window.tizen.application.getCurrentApplication().exit(); } catch (exitErr) {}
      } else {
        window.__riffanBackExitTs = nowTs;
        showToast('Pulsa Volver otra vez para salir de RiffanTV');
      }
      return;
    }
  }

  // Samsung Tizen MediaStop (413): stop playback cleanly and return to hub
  if (code === 413) {
    if (activeScreen === 'player') {
      if (e.preventDefault) e.preventDefault();
      try { if (videoEl) { videoEl.pause(); } } catch (err) {}
      exitPlayerToHubOrPairing();
      return;
    }
  }

  if (activeScreen !== 'player') return;
  revealHud();
  if (code === 32 && (currentMode === 'hls' || currentMode === 'direct')) {
    if (e.preventDefault) e.preventDefault();
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
    syncPlayPauseButton();
  } else if (code === 415 || code === 126) {
    if (videoEl.paused) videoEl.play();
    syncPlayPauseButton();
  } else if (code === 10252 || code === 179 || code === 85) {
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
    syncPlayPauseButton();
  } else if (code === 412 && !currentIsLive) {
    videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) - 15);
  } else if (code === 417 && !currentIsLive) {
    videoEl.currentTime = (videoEl.currentTime || 0) + 15;
  }
});

// Register Samsung Tizen TV hardware remote keys + numeric keys + screensaver protection (ES5-safe)
try {
  if (/Tizen/i.test(uaStr)) {
    var platformTagEl = document.getElementById('rail-platform-tag');
    if (platformTagEl) platformTagEl.textContent = 'Samsung Tizen';
  }
  if (window.tizen && window.tizen.tvinputdevice) {
    if (window.tizen.tvinputdevice.registerKeyBatch) {
      window.tizen.tvinputdevice.registerKeyBatch([
        'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
        'MediaRewind', 'MediaFastForward', 'ChannelUp', 'ChannelDown'
      ]);
    }
    if (window.tizen.tvinputdevice.registerKey) {
      var numKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      for (var nk = 0; nk < numKeys.length; nk++) {
        try { window.tizen.tvinputdevice.registerKey(numKeys[nk]); } catch (nkErr) {}
      }
    }
  }
  if (videoEl && videoEl.addEventListener) {
    var setTvScreenSaver = function (prevent) {
      try {
        if (window.webapis && window.webapis.appcommon && window.webapis.appcommon.setScreenSaver) {
          window.webapis.appcommon.setScreenSaver(prevent ? 0 : 1);
        }
      } catch (err) {}
    };
    videoEl.addEventListener('play', function () { setTvScreenSaver(true); });
    videoEl.addEventListener('pause', function () { setTvScreenSaver(false); });
    videoEl.addEventListener('ended', function () { setTvScreenSaver(false); });
  }
} catch (tizenErr) {}

applyTvLanguage(activeTvLang);
syncFullscreenButtons();

// Boot sequence
var roomMatch = searchStr.match(/[?&]room=([a-zA-Z0-9-_]+)/);
var pairMatch = searchStr.match(/[?&]pair=1\b/);
requestPairingCode(false);
connectPairingWs();
loadTvCatalog();
if (catalogData.loaded) renderHubContent();

if (roomMatch && roomMatch[1]) {
  enterRoomReceiver(roomMatch[1], tvT('roomPrefix') + roomMatch[1].toUpperCase(), '', tvT('directLinkLabel'));
} else if (pairMatch) {
  switchTvScreen('pairing');
} else {
  switchTvScreen('hub');
  setTimeout(function () {
    var activeTabEl = document.querySelector('#hub-nav-tabs .hub-tab-btn.active');
    if (activeTabEl && activeTabEl.focus) activeTabEl.focus();
  }, 80);
}
