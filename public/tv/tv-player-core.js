// ===================================================================
// PLAYER ENGINES (HLS.JS / MP4 / YOUTUBE / WEB EMBED + FAST ZAP)
// ===================================================================
function ensureYouTubeApi(cb) {
  if (window.YT && window.YT.Player) {
    cb();
    return;
  }
  window.onYouTubeIframeAPIReady = function () {
    cb();
  };
  if (!document.getElementById('yt-api-script')) {
    var tag = document.createElement('script');
    tag.id = 'yt-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
}

function loadYouTubeVideo(videoId, startSec, shouldPlay) {
  pendingYtVideoId = videoId;
  pendingYtStart = Math.max(0, Math.floor(startSec || 0));
  pendingYtPlay = Boolean(shouldPlay);
  ensureYouTubeApi(function () {
    if (ytPlayer && ytReady && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById({
        videoId: pendingYtVideoId,
        startSeconds: pendingYtStart
      });
      if (!pendingYtPlay && ytPlayer.pauseVideo) {
        setTimeout(function () { ytPlayer.pauseVideo(); }, 400);
      }
      standbyOverlay.style.display = 'none';
      return;
    }
    ytReady = false;
    ytPlayer = new window.YT.Player('yt-player', {
      videoId: pendingYtVideoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        playsinline: 1,
        start: pendingYtStart
      },
      events: {
        onReady: function (ev) {
          ytReady = true;
          standbyOverlay.style.display = 'none';
          try {
            ev.target.setVolume(Math.round(currentVolume * 100));
            if (pendingYtPlay) ev.target.playVideo();
            else ev.target.pauseVideo();
          } catch (e) {}
        },
        onError: function () {
          triggerPlaybackFailover('YouTube error');
        }
      }
    });
  });
}

function destroyHls() {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (e) {}
    hlsInstance = null;
  }
}

function clearEmbedFrame() {
  if (embedWrap) embedWrap.style.display = 'none';
  if (embedFrame) {
    try { embedFrame.src = 'about:blank'; } catch (e) {}
  }
}

function clearVideoWatchdog() {
  if (videoWatchdogTimer) {
    clearTimeout(videoWatchdogTimer);
    videoWatchdogTimer = null;
  }
}

function markVideoFrameActive() {
  clearVideoWatchdog();
  autoFailoverLock = false;
  if (standbyOverlay && standbyOverlay.style.display !== 'none') {
    standbyOverlay.style.display = 'none';
  }
  syncPlayPauseButton();
}

if (videoEl) {
  videoEl.addEventListener('playing', markVideoFrameActive);
  videoEl.addEventListener('pause', syncPlayPauseButton);
  videoEl.addEventListener('loadeddata', function () {
    if (videoEl.videoWidth > 0) markVideoFrameActive();
  });
  videoEl.addEventListener('timeupdate', function () {
    if (!currentIsLive && videoEl.duration && !isNaN(videoEl.duration) && videoEl.duration > 0) {
      if (dockTimeCur) dockTimeCur.textContent = formatSecClock(videoEl.currentTime || 0);
      if (dockTimeDur) dockTimeDur.textContent = formatSecClock(videoEl.duration);
      if (dockProgressFill) {
        var pct = Math.min(100, Math.max(0, (videoEl.currentTime / videoEl.duration) * 100));
        dockProgressFill.style.width = pct.toFixed(1) + '%';
      }
    }
  });
  videoEl.addEventListener('error', function () {
    if (currentMode === 'idle' || currentMode === 'embed' || currentMode === 'youtube') return;
    if (!isLocalPlayback) {
      if (currentMode === 'hls' && currentUrl && currentUrl.indexOf('/api/hls-proxy') !== -1 && currentUrl.indexOf('abs=1') === -1) {
        var absUrl = currentUrl + (currentUrl.indexOf('?') === -1 ? '?' : '&') + 'abs=1';
        applyVideoState({
          mode: 'hls',
          url: absUrl,
          title: hudTitle.textContent,
          subtitle: hudSub.textContent,
          currentTime: videoEl.currentTime || 0,
          isPlaying: true,
          isLive: currentIsLive
        }, true);
        return;
      }
      showStandbyError(hudTitle.textContent || 'RIFFAN TV', tvT('signalTempUnavail') + ' (Smart TV Decode Error).');
      return;
    }
    triggerPlaybackFailover('Video decode error');
  });
}

function playVideoSafely(targetResumeSec, shouldPlay) {
  if (targetResumeSec > 3) {
    try {
      if (Math.abs((videoEl.currentTime || 0) - targetResumeSec) > 2.5) {
        videoEl.currentTime = targetResumeSec;
      }
    } catch (e) {}
  }
  if (!shouldPlay) {
    try { videoEl.pause(); } catch (e) {}
    syncPlayPauseButton();
    return;
  }
  videoEl.muted = false;
  videoEl.volume = currentVolume;
  var playPromise = videoEl.play();
  if (playPromise && playPromise.then) {
    playPromise.then(
      function () {
        unmuteBanner.style.display = 'none';
        syncPlayPauseButton();
      },
      function () {
        videoEl.muted = true;
        var p2 = videoEl.play();
        if (p2 && p2.catch) p2.catch(function () {});
        unmuteBanner.style.display = 'block';
        syncPlayPauseButton();
      }
    );
  }
}

function triggerPlaybackFailover(reasonText) {
  if (autoFailoverLock) return;
  if (!isLocalPlayback) {
    autoFailoverLock = true;
    clearVideoWatchdog();
    if (currentUrl && currentUrl.indexOf('/api/hls-proxy') !== -1 && currentUrl.indexOf('abs=1') === -1) {
      var upgraded = currentUrl + (currentUrl.indexOf('?') === -1 ? '?' : '&') + 'abs=1';
      autoFailoverLock = false;
      applyVideoState({
        mode: currentMode,
        url: upgraded,
        title: hudTitle.textContent,
        subtitle: hudSub.textContent,
        currentTime: videoEl.currentTime || 0,
        isPlaying: true,
        isLive: currentIsLive
      }, true);
      return;
    }
    showStandbyError(hudTitle.textContent || 'RIFFAN TV', tvT('signalTempUnavail') + (reasonText ? ' (' + reasonText + ')' : '') + '.');
    return;
  }
  autoFailoverLock = true;
  clearVideoWatchdog();

  // Live TV channel multi-track & IPTV failover
  if (activeLiveChannel) {
    var ch = activeLiveChannel;
    var totalChTracks = ch.channels ? ch.channels.length : 0;
    if (activeLiveTrackIdx + 1 < totalChTracks) {
      showToast(tvT('switchingBackup'));
      setTimeout(function () {
        autoFailoverLock = false;
        playTdtChannelOnTv(ch, activeLiveTrackIdx + 1);
      }, 150);
      return;
    }
    if (ch.id && currentUrl.indexOf('/api/iptv/live/') === -1) {
      showToast(tvT('connectingIptv'));
      setTimeout(function () {
        autoFailoverLock = false;
        applyVideoState(
          {
            mode: 'hls',
            url: '/api/iptv/live/' + encodeURIComponent(ch.id) + '.m3u8',
            title: ch.name,
            subtitle: (ch.network || 'TDT / TV') + ' · IPTV',
            logoUrl: ch.logoUrl || '',
            isPlaying: true,
            isLive: true,
            currentTime: 0
          },
          true
        );
      }, 150);
      return;
    }
    showStandbyError(ch.name, tvT('signalTempUnavail') + (reasonText ? ' (' + reasonText + ')' : '') + '.');
    return;
  }

  // VOD Movie / Series multi-track failover
  if (localTracks && localTrackIdx + 1 < localTracks.length) {
    showToast(tvT('switchingServer'));
    setTimeout(function () {
      autoFailoverLock = false;
      switchToLocalTrack(localTrackIdx + 1, !currentIsLive ? (videoEl.currentTime || 0) : 0);
    }, 200);
    return;
  }

  showStandbyError(hudTitle.textContent || 'RIFFAN TV', tvT('noServerAvail'));
}

function showStandbyError(titleStr, msgStr) {
  destroyHls();
  clearEmbedFrame();
  try {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  } catch (e) {}
  videoEl.style.display = 'none';
  if (standbySpinner) standbySpinner.style.display = 'none';
  if (btnStandbyRetry) {
    btnStandbyRetry.style.display = (localTracks && localTracks.length > 1) ? 'inline-flex' : 'none';
  }
  standbyOverlay.style.display = 'flex';
  standbyRoomPill.textContent = tvT('signalUnavailable');
  standbyTitleText.textContent = titleStr || 'RIFFAN TV';
  standbySubText.textContent = msgStr || tvT('standbySubFallback');
  setTimeout(function () {
    var exitB = document.getElementById('btn-standby-exit');
    if (exitB && exitB.focus) exitB.focus();
  }, 60);
}

function applyVideoState(vs, forceReload) {
  if (!vs) return;
  var nextMode = vs.mode || 'idle';
  var nextUrl = vs.url || '';
  var shouldPlay = Boolean(vs.isPlaying);
  var isLive = Boolean(vs.isLive);
  var targetSec = !isLive && vs.currentTime > 0 ? Number(vs.currentTime) : 0;

  hudTitle.textContent = vs.title || 'RIFFAN TV';
  hudSub.textContent = vs.subtitle || (isPaired ? tvT('roomPrefix') + currentRoomId.toUpperCase() + ' · 1080p' : 'Smart TV 1080p');
  var chLogo = vs.logoUrl || (activeLiveChannel && activeLiveChannel.logoUrl) || '';
  if (hudLogoWrap && hudLogoImg) {
    if (chLogo) {
      hudLogoImg.src = chLogo;
      hudLogoWrap.style.display = 'flex';
    } else {
      hudLogoWrap.style.display = 'none';
    }
  }
  if (standbyChannelBadge && standbyLogoImg) {
    if (chLogo) {
      standbyLogoImg.src = chLogo;
      standbyChannelBadge.style.display = 'flex';
    } else {
      standbyChannelBadge.style.display = 'none';
    }
  }
  syncPlayerDockMode(isLive);

  if (nextMode === 'idle' || !nextUrl) {
    currentMode = 'idle';
    currentUrl = '';
    clearVideoWatchdog();
    destroyHls();
    clearEmbedFrame();
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch (e) {}
    if (ytPlayer && ytPlayer.stopVideo) {
      try { ytPlayer.stopVideo(); } catch (e) {}
    }
    ytWrap.style.display = 'none';
    videoEl.style.display = 'none';
    if (standbySpinner) standbySpinner.style.display = 'none';
    if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
    standbyOverlay.style.display = 'flex';
    unmuteBanner.style.display = 'none';
    return;
  }

  if (!forceReload && nextMode === currentMode && nextUrl === currentUrl) {
    if (nextMode === 'hls' || nextMode === 'direct') {
      if (!isLive && Math.abs((videoEl.currentTime || 0) - targetSec) > 3.5) {
        try { videoEl.currentTime = targetSec; } catch (e) {}
      }
      if (shouldPlay && videoEl.paused) playVideoSafely(0, true);
      else if (!shouldPlay && !videoEl.paused) videoEl.pause();
    } else if (nextMode === 'youtube' && ytPlayer && ytReady) {
      try {
        var ytTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
        if (!isLive && Math.abs(ytTime - targetSec) > 4) ytPlayer.seekTo(targetSec, true);
        var state = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
        if (shouldPlay && state !== 1 && state !== 3) ytPlayer.playVideo();
        else if (!shouldPlay && state === 1) ytPlayer.pauseVideo();
      } catch (e) {}
    }
    return;
  }

  currentMode = nextMode;
  currentUrl = nextUrl;
  currentIsLive = isLive;
  autoFailoverLock = false;
  clearVideoWatchdog();
  if (!isLive) {
    revealHud();
  }

  // Mode 1: YouTube Embed
  if (nextMode === 'youtube') {
    destroyHls();
    clearEmbedFrame();
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch (e) {}
    videoEl.style.display = 'none';
    ytWrap.style.display = 'block';
    if (standbySpinner) standbySpinner.style.display = 'block';
    standbyOverlay.style.display = 'flex';
    loadYouTubeVideo(nextUrl, targetSec, shouldPlay);
    return;
  }

  // Mode 2: Web Embed
  if (nextMode === 'embed' || nextMode === 'cloud') {
    destroyHls();
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch (e) {}
    if (ytPlayer && ytPlayer.stopVideo) {
      try { ytPlayer.stopVideo(); } catch (e) {}
    }
    ytWrap.style.display = 'none';
    videoEl.style.display = 'none';
    if (embedWrap && embedFrame) {
      embedWrap.style.display = 'block';
      if (standbySpinner) standbySpinner.style.display = 'block';
      standbyOverlay.style.display = 'flex';
      embedFrame.onload = function () {
        standbyOverlay.style.display = 'none';
      };
      embedFrame.src = nextUrl;
      setTimeout(function () {
        if (currentMode === 'embed' || currentMode === 'cloud') {
          standbyOverlay.style.display = 'none';
        }
      }, 2400);
    }
    return;
  }

  // Mode 3 & 4: Native MP4 (`direct`) or HLS (`hls`)
  if (ytPlayer && ytPlayer.stopVideo) {
    try { ytPlayer.stopVideo(); } catch (e) {}
  }
  ytWrap.style.display = 'none';
  clearEmbedFrame();
  videoEl.style.display = 'block';
  if (standbySpinner) standbySpinner.style.display = 'block';
  if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
  standbyOverlay.style.display = 'flex';
  destroyHls();

  videoWatchdogTimer = setTimeout(function () {
    if (currentMode !== nextMode || currentUrl !== nextUrl) return;
    if (!videoEl.videoWidth || videoEl.videoWidth === 0 || videoEl.readyState < 2) {
      triggerPlaybackFailover('Tiempo de carga agotado');
    }
  }, isLive ? 11500 : 18500);

  if (nextMode === 'direct') {
    videoEl.src = nextUrl;
    videoEl.onloadedmetadata = function () {
      playVideoSafely(targetSec, shouldPlay);
    };
    return;
  }

  if (window.Hls && window.Hls.isSupported()) {
    var directCorsRetried = false;
    var fallbackNativeTried = false;
    var netErrorCount = 0;
    var mediaErrorCount = 0;

    var switchToNativeHls = function () {
      if (fallbackNativeTried) {
        triggerPlaybackFailover('Error de reproducción HLS');
        return;
      }
      fallbackNativeTried = true;
      var resumeT = !isLive && videoEl.currentTime > 1 ? videoEl.currentTime : targetSec;
      destroyHls();
      videoEl.src = nextUrl;
      videoEl.onloadedmetadata = function () {
        playVideoSafely(resumeT, shouldPlay);
      };
    };

    var hls = new window.Hls({
      enableWorker: !isSmartTvUa,
      lowLatencyMode: false,
      startFragPrefetch: true,
      startPosition: isLive ? -1 : targetSec,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: isLive ? 10 : 12,
      maxLiveSyncPlaybackRate: 1,
      backBufferLength: isLive ? 18 : 30,
      maxBufferLength: isLive ? 28 : 40,
      maxMaxBufferLength: isLive ? 60 : 80,
      maxBufferHole: isLive ? 0.5 : 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: isLive ? 0.1 : 0.1,
      nudgeMaxRetry: 10,
      capLevelToPlayerSize: true,
      maxAudioFramesDrift: isLive ? 3 : 4,
      abrEwmaDefaultEstimate: isLive ? 4500000 : 5500000,
      manifestLoadingTimeOut: 12000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 350,
      levelLoadingTimeOut: 12000,
      levelLoadingMaxRetry: 4,
      levelLoadingRetryDelay: 350,
      fragLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 400
    });
    hlsInstance = hls;
    hls.loadSource(nextUrl);
    hls.attachMedia(videoEl);
    hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
      playVideoSafely(targetSec, shouldPlay);
    });
    var nonFatalMediaErrors = 0;
    var lastNonFatalMediaAt = 0;
    hls.on(window.Hls.Events.FRAG_BUFFERED, function () {
      nonFatalMediaErrors = 0;
    });
    hls.on(window.Hls.Events.ERROR, function (_ev, data) {
      if (!data) return;
      if (!data.fatal) {
        if (
          data.type === window.Hls.ErrorTypes.MEDIA_ERROR &&
          (data.details === window.Hls.ErrorDetails.FRAG_PARSING_ERROR ||
            data.details === window.Hls.ErrorDetails.BUFFER_APPEND_ERROR)
        ) {
          nonFatalMediaErrors++;
          var nowMs = Date.now();
          if (nonFatalMediaErrors >= 3 && nowMs - lastNonFatalMediaAt > 12000) {
            lastNonFatalMediaAt = nowMs;
            nonFatalMediaErrors = 0;
            try { hls.recoverMediaError(); } catch (e) {}
          }
        }
        return;
      }
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        netErrorCount++;
        if (!directCorsRetried && nextUrl.indexOf('http') === 0 && nextUrl.indexOf('/api/') === -1) {
          directCorsRetried = true;
          var proxied = '/api/hls-proxy/stream.m3u8?abs=1&url=' + encodeURIComponent(nextUrl);
          currentUrl = proxied;
          hls.loadSource(proxied);
          return;
        }
        if (!directCorsRetried && currentUrl.indexOf('/api/hls-proxy') !== -1 && currentUrl.indexOf('abs=1') === -1) {
          directCorsRetried = true;
          var absProxied = currentUrl + (currentUrl.indexOf('?') === -1 ? '?' : '&') + 'abs=1';
          currentUrl = absProxied;
          hls.loadSource(absProxied);
          return;
        }
        if (netErrorCount <= 2) {
          setTimeout(function () {
            if (hlsInstance === hls) hls.startLoad();
          }, 350);
        } else {
          triggerPlaybackFailover('Señal de red interrumpida');
        }
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        mediaErrorCount++;
        if (mediaErrorCount <= 2) {
          hls.recoverMediaError();
        } else if (videoEl.canPlayType && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          switchToNativeHls();
        } else {
          triggerPlaybackFailover('Error de códec de vídeo');
        }
      } else {
        if (videoEl.canPlayType && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          switchToNativeHls();
        } else {
          triggerPlaybackFailover('Error de formato HLS');
        }
      }
    });
  } else {
    videoEl.src = nextUrl;
    videoEl.onloadedmetadata = function () {
      playVideoSafely(targetSec, shouldPlay);
    };
  }
}

function handleRemoteCommand(cmd) {
  if (cmd === 'vol_up' || cmd === 'vol_down') {
    var delta = cmd === 'vol_up' ? 0.15 : -0.15;
    currentVolume = Math.max(0, Math.min(1, Math.round((currentVolume + delta) * 100) / 100));
    if (videoEl) {
      videoEl.volume = currentVolume;
      if (currentVolume > 0) videoEl.muted = false;
    }
    if (ytPlayer && ytPlayer.setVolume) {
      try {
        ytPlayer.setVolume(Math.round(currentVolume * 100));
        if (currentVolume > 0 && ytPlayer.unMute) ytPlayer.unMute();
      } catch (e) {}
    }
    showToast(tvT('volumeToast') + Math.round(currentVolume * 100) + '%');
  } else if (cmd === 'toggle_mute') {
    if (videoEl) {
      videoEl.muted = !videoEl.muted;
      showToast(videoEl.muted ? tvT('mutedToast') : tvT('unmutedToast'));
    }
    if (ytPlayer) {
      try {
        if (ytPlayer.isMuted && ytPlayer.isMuted()) ytPlayer.unMute();
        else if (ytPlayer.mute) ytPlayer.mute();
      } catch (e) {}
    }
  } else if (cmd === 'toggle_fullscreen') {
    requestTvFullscreen(true);
  } else if (cmd === 'toggle_aspect') {
    cycleVideoAspect();
  } else if (cmd === 'toggle_hud') {
    if (!isHudVisible()) revealHud();
    else hideHudImmediately();
  } else if (cmd === 'reload_tv') {
    if (activeLiveChannel) {
      playTdtChannelOnTv(activeLiveChannel, activeLiveTrackIdx);
      showToast(tvT('resyncCh'));
    } else if (currentMode !== 'idle' && currentUrl) {
      applyVideoState(
        {
          mode: currentMode,
          url: currentUrl,
          title: hudTitle.textContent,
          subtitle: hudSub.textContent,
          currentTime: videoEl.currentTime || 0,
          isPlaying: true,
          isLive: currentIsLive
        },
        true
      );
      showToast(tvT('resyncHd'));
    }
  } else if (cmd === 'disconnect_tv') {
    exitPlayerToHubOrPairing();
  }
}

function spawnReaction(emoji, sender) {
  if (!reactionsLayer) return;
  var el = document.createElement('div');
  el.className = 'tv-reaction';
  el.style.left = Math.floor(12 + Math.random() * 75) + '%';
  el.innerHTML = emoji + '<span>' + escapeHtml(sender || '') + '</span>';
  reactionsLayer.appendChild(el);
  setTimeout(function () {
    el.style.bottom = '170px';
    el.style.opacity = '0';
  }, 40);
  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 2500);
}
