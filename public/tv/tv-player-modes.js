// ===================================================================
// PAIRED ROOM RECEIVER, MINI-GUIDE DRAWER, ZAP OSD & NUMERIC DIAL (ES5)
// ===================================================================
var roomHttpTimer = null;

function getLiveExtractCacheKey(rType, streamUrl) {
  return String(rType || 'tdt_hls') + '|' + String(streamUrl || '');
}

function getCachedLiveExtract(rType, streamUrl) {
  var k = getLiveExtractCacheKey(rType, streamUrl);
  var hit = liveExtractCache[k];
  if (hit && hit.expiresAt > Date.now() && hit.data && hit.data.streamUrl) {
    return hit.data;
  }
  return null;
}

function setCachedLiveExtract(rType, streamUrl, data) {
  if (!data || !data.success || !data.streamUrl) return;
  var k = getLiveExtractCacheKey(rType, streamUrl);
  liveExtractCache[k] = {
    data: data,
    expiresAt: Date.now() + 90 * 1000
  };
}

function isDirectCorsPublicStream(urlStr) {
  return /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(String(urlStr || ''));
}

function prewarmTdtChannelOnTv(ch, trackIndex) {
  if (!ch || !ch.channels || !ch.channels.length) return;
  var idx = typeof trackIndex === 'number' ? trackIndex : 0;
  var track = ch.channels[idx];
  if (!track) return;
  var streamUrl = track.resolvedStreamUrl || track.sourceUrl || track.url || '';
  if (!streamUrl || streamUrl.indexOf('/api/') === 0 || isDirectCorsPublicStream(streamUrl)) return;

  var rType = track.resolverType || 'tdt_hls';
  if (getCachedLiveExtract(rType, streamUrl)) return;

  var k = getLiveExtractCacheKey(rType, streamUrl);
  if (tvPrewarmInFlight[k]) return;
  tvPrewarmInFlight[k] = true;

  var q =
    'resolverType=' + encodeURIComponent(rType) +
    '&url=' + encodeURIComponent(streamUrl) +
    '&title=' + encodeURIComponent(ch.name || 'Live TV');

  xhrJson('GET', '/api/extract/stream?' + q, null, function (err, data) {
    delete tvPrewarmInFlight[k];
    if (!err && data && data.success && data.streamUrl) {
      setCachedLiveExtract(rType, streamUrl, data);
    }
  });
}

function scheduleNextChannelPrewarm(currentCh) {
  if (!currentCh || !catalogData || !catalogData.tdt || !catalogData.tdt.length) return;
  setTimeout(function () {
    if (!isLocalPlayback || activeLiveChannel !== currentCh) return;
    var pool = typeof filterTdtChannels === 'function' ? filterTdtChannels(activeLiveFilter) : catalogData.tdt;
    if (!pool || !pool.length) pool = catalogData.tdt;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] && pool[i].id === currentCh.id) {
        var nextCh = pool[(i + 1) % pool.length];
        var prevCh = pool[(i - 1 + pool.length) % pool.length];
        if (nextCh) prewarmTdtChannelOnTv(nextCh, 0);
        if (prevCh && prevCh !== nextCh) prewarmTdtChannelOnTv(prevCh, 0);
        break;
      }
    }
  }, 550);
}

// Broadcast Zapping OSD Card (bottom-left when changing channels)
function hideLiveZapOsd() {
  if (zapOsdTimer) clearTimeout(zapOsdTimer);
  if (tvZapOsd) tvZapOsd.style.display = 'none';
}

function showLiveZapOsd(ch, trackIdx) {
  if (!tvZapOsd || !ch) return;
  var dialEl = document.getElementById('zap-dial-num');
  var logoImg = document.getElementById('zap-logo-img');
  var chName = document.getElementById('zap-channel-name');
  var liveTag = document.getElementById('zap-live-tag');
  var sigMeta = document.getElementById('zap-signal-meta');
  var nowTitle = document.getElementById('zap-now-title');
  var progFill = document.getElementById('zap-progress-fill');
  var nextTitle = document.getElementById('zap-next-title');

  var dialNum = ch.dial ? (ch.dial < 10 ? '0' + ch.dial : String(ch.dial)) : '--';
  if (dialEl) dialEl.textContent = dialNum;
  if (logoImg) logoImg.src = ch.logoUrl || '/icon.svg';
  if (chName) chName.textContent = ch.name || 'TV';
  if (liveTag) liveTag.textContent = tvT('liveNow');

  var tr = ch.channels && ch.channels[trackIdx] ? ch.channels[trackIdx] : null;
  if (sigMeta) {
    sigMeta.textContent = tr ? (tr.label || (tr.quality || 'HD')) : (ch.network || 'HD');
  }

  var chEpg = catalogData.epg ? catalogData.epg[ch.id] : null;
  if (nowTitle) {
    nowTitle.textContent = chEpg && chEpg.now ? chEpg.now.title : (ch.description || ch.network || tvT('broadcast247'));
  }
  if (progFill) {
    var pct = chEpg && typeof chEpg.progressPct === 'number' ? Math.max(5, Math.min(100, chEpg.progressPct)) : 35;
    progFill.style.width = pct + '%';
  }
  if (nextTitle) {
    nextTitle.textContent = chEpg && chEpg.next
      ? tvT('nextPrefix') + (chEpg.next.startLabel ? chEpg.next.startLabel + ' · ' : '') + chEpg.next.title
      : '';
  }

  tvZapOsd.style.display = 'flex';
  if (zapOsdTimer) clearTimeout(zapOsdTimer);
  zapOsdTimer = setTimeout(hideLiveZapOsd, 4200);
}

// Slide-Out Mini-Guide Drawer
function renderMiniGuideList() {
  if (!mgChannelList || typeof filterTdtChannels !== 'function') return;
  mgChannelList.innerHTML = '';
  var list = filterTdtChannels(activeMiniGuideFilter, '');
  if (!list || !list.length) list = catalogData.tdt || [];
  var limit = Math.min(80, list.length);
  var activeBtn = null;

  var frag = document.createDocumentFragment();
  for (var i = 0; i < limit; i++) {
    (function (ch, idxPos) {
      var row = document.createElement('button');
      row.type = 'button';
      var isCurrent = activeLiveChannel && activeLiveChannel.id === ch.id;
      row.className = 'mg-ch-row' + (isCurrent ? ' active-ch' : '');
      row.tabIndex = 0;
      var dialStr = ch.dial ? String(ch.dial) : String(idxPos + 1);
      var chEpg = catalogData.epg ? catalogData.epg[ch.id] : null;
      var epgStr = chEpg && chEpg.now ? chEpg.now.title : (ch.network || tvT('broadcast247'));
      var logoHtml = ch.logoUrl
        ? '<img src="' + escapeHtml(ch.logoUrl) + '" alt="" referrerpolicy="no-referrer" />'
        : '<span style="font-weight:900;font-size:12px;">' + escapeHtml(ch.shortMark || ch.name || 'TV') + '</span>';
      row.innerHTML =
        '<div class="mg-ch-dial">' + escapeHtml(dialStr) + '</div>' +
        '<div class="mg-ch-logo">' + logoHtml + '</div>' +
        '<div class="mg-ch-info">' +
        '<div class="mg-ch-name">' + escapeHtml(ch.name) + '</div>' +
        '<div class="mg-ch-epg">' + escapeHtml(epgStr) + '</div>' +
        '</div>';
      row.onclick = function () {
        closeMiniGuideDrawer();
        playTdtChannelOnTv(ch, 0);
      };
      frag.appendChild(row);
      if (isCurrent) activeBtn = row;
    })(list[i], i);
  }
  mgChannelList.appendChild(frag);

  setTimeout(function () {
    var focusTarget = activeBtn || mgChannelList.querySelector('.mg-ch-row');
    if (focusTarget && focusTarget.focus) focusTarget.focus();
  }, 40);
}

function openMiniGuideDrawer() {
  if (!miniGuideDrawer || activeScreen !== 'player') return;
  isMiniGuideOpen = true;
  miniGuideDrawer.className = 'open';
  hideHudImmediately();
  renderMiniGuideList();
}

function closeMiniGuideDrawer() {
  if (!miniGuideDrawer) return;
  isMiniGuideOpen = false;
  miniGuideDrawer.className = '';
}

function tuneByNumericDial(dialNum) {
  var list = catalogData.tdt || [];
  if (!list.length) return;
  var match = null;
  for (var i = 0; i < list.length; i++) {
    if (Number(list[i].dial) === dialNum) {
      match = list[i];
      break;
    }
  }
  if (!match && dialNum >= 1 && dialNum <= list.length) {
    match = list[dialNum - 1];
  }
  if (match) {
    if (activeScreen !== 'player') switchTvScreen('player');
    unlockAudio();
    playTdtChannelOnTv(match, 0);
  } else {
    showToast(tvT('noDialMatch') + dialNum);
  }
}

function handleDialDigit(digitStr) {
  if (!/^\d$/.test(digitStr)) return;
  if (dialBuffer.length >= 3) dialBuffer = '';
  dialBuffer += digitStr;
  if (tvDialOsd && tvDialOsdNum) {
    tvDialOsdNum.textContent = dialBuffer;
    tvDialOsd.style.display = 'flex';
  }
  if (dialBufferTimer) clearTimeout(dialBufferTimer);
  dialBufferTimer = setTimeout(function () {
    var targetNum = parseInt(dialBuffer, 10);
    dialBuffer = '';
    if (tvDialOsd) tvDialOsd.style.display = 'none';
    if (!isNaN(targetNum) && targetNum > 0) {
      tuneByNumericDial(targetNum);
    }
  }, 1100);
}

function enterRoomReceiver(roomId, roomName, token, claimedBy) {
  if (isPaired && currentRoomId === roomId) return;
  isPaired = true;
  isLocalPlayback = false;
  activeLiveChannel = null;
  localTracks = [];
  closeMiniGuideDrawer();
  if (btnDockAudio) btnDockAudio.style.display = 'none';
  currentRoomId = roomId.toLowerCase();
  currentRoomName = roomName || tvT('roomPrefix') + currentRoomId.toUpperCase();
  tvAuthToken = token || '';
  seriesModal.style.display = 'none';

  if (pairingWs) {
    pairingWs.onclose = null;
    try { pairingWs.close(); } catch (e) {}
    pairingWs = null;
  }
  if (pairedBanner) {
    pairedBanner.style.display = 'block';
    pairedBanner.textContent =
      tvT('pairedWith') + (claimedBy || tvT('yourPhone')) + ' · ' + tvT('enteringRoom') + currentRoomName + '...';
  }
  if (pairingControls) pairingControls.style.display = 'none';
  try {
    window.history.replaceState({}, '', '/tv?room=' + encodeURIComponent(currentRoomId));
  } catch (e) {}

  setTimeout(function () {
    switchTvScreen('player');
    standbyRoomPill.textContent = tvT('tvConnected') + currentRoomName;
    standbyTitleText.textContent = tvT('tvReadyTitle');
    standbySubText.textContent = tvT('tvReadySub');
    if (standbyChannelBadge) standbyChannelBadge.style.display = 'none';
    revealHud();
    connectRoomWs();
    pollRoomStateHttp();
    if (roomHttpTimer) clearInterval(roomHttpTimer);
    roomHttpTimer = setInterval(pollRoomStateHttp, 2200);
  }, 350);
}

function connectRoomWs() {
  if (!isPaired || !window.WebSocket) return;
  try {
    var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + window.location.host + '/ws');
    roomWs = ws;
    ws.onopen = function () {
      ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomId: currentRoomId,
            roomName: currentRoomName,
            tvAuthToken: tvAuthToken,
            user: { id: tvDeviceId, name: 'Smart TV', avatar: 'TV', color: '#7C3AED' }
          }
        })
      );
    };
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'ROOM_STATE' && msg.payload) {
          if (msg.payload.name) {
            currentRoomName = msg.payload.name;
            standbyRoomPill.textContent = tvT('tvConnected') + currentRoomName;
          }
          if (msg.payload.videoState) applyVideoState(msg.payload.videoState, false);
        } else if (msg.type === 'VIDEO_STATE_UPDATED' && msg.payload && msg.payload.videoState) {
          applyVideoState(msg.payload.videoState, false);
        } else if (msg.type === 'TV_REMOTE_COMMAND' && msg.payload) {
          if (msg.payload.seq) lastRemoteSeq = msg.payload.seq;
          handleRemoteCommand(msg.payload.command);
        } else if (msg.type === 'NEW_REACTION' && msg.payload) {
          spawnReaction(msg.payload.emoji || '🔥', msg.payload.senderName || '');
        }
      } catch (e) {}
    };
    ws.onclose = function () {
      if (isPaired) setTimeout(connectRoomWs, 3500);
    };
  } catch (e) {}
}

function pollRoomStateHttp() {
  if (!isPaired || !currentRoomId) return;
  var wsOpen = roomWs && roomWs.readyState === 1;
  var q =
    '/api/rooms/' +
    encodeURIComponent(currentRoomId) +
    '?tv=1&tvId=' +
    encodeURIComponent(tvDeviceId) +
    '&tvName=' +
    encodeURIComponent('Smart TV') +
    '&tvAuthToken=' +
    encodeURIComponent(tvAuthToken);

  xhrJson('GET', q, null, function (err, data) {
    if (err || !data) return;
    if (!wsOpen && data.videoState) applyVideoState(data.videoState, false);
    if (
      data.lastTvRemoteCommand &&
      data.lastTvRemoteCommand.seq &&
      data.lastTvRemoteCommand.seq > lastRemoteSeq
    ) {
      var isFirst = lastRemoteSeq === 0;
      lastRemoteSeq = data.lastTvRemoteCommand.seq;
      if (!isFirst) handleRemoteCommand(data.lastTvRemoteCommand.command);
    }
  });
}

function exitPlayerToHubOrPairing() {
  var wasPaired = isPaired;
  pendingTizenAutoLaunchAntena3 = false;
  if (tizenAutoLaunchFallbackTimer) {
    clearTimeout(tizenAutoLaunchFallbackTimer);
    tizenAutoLaunchFallbackTimer = null;
  }
  isPaired = false;
  isLocalPlayback = false;
  activeLiveChannel = null;
  activeLiveFailedTrackIdxs = {};
  activeLiveFailedHostKeys = {};
  currentRoomId = '';
  currentMode = 'idle';
  currentUrl = '';
  localTracks = [];
  autoFailoverLock = false;
  closeMiniGuideDrawer();
  hideLiveZapOsd();
  if (tvDialOsd) tvDialOsd.style.display = 'none';
  if (btnDockAudio) btnDockAudio.style.display = 'none';
  if (standbyChannelBadge) standbyChannelBadge.style.display = 'none';
  clearVideoWatchdog();
  if (typeof stopLiveStallMonitor === 'function') stopLiveStallMonitor();
  if (roomHttpTimer) {
    clearInterval(roomHttpTimer);
    roomHttpTimer = null;
  }
  if (roomWs) {
    roomWs.onclose = null;
    try { roomWs.close(); } catch (e) {}
    roomWs = null;
  }
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
  if (pairedBanner) pairedBanner.style.display = 'none';
  if (pairingControls) pairingControls.style.display = 'flex';
  try {
    var cleanExitPath = (typeof isTizenDevice !== 'undefined' && isTizenDevice)
      ? '/tv?platform=tizen&hub=1'
      : ((typeof isWebOsDevice !== 'undefined' && isWebOsDevice) ? '/tv?platform=webos&hub=1' : '/tv');
    window.history.replaceState({}, '', cleanExitPath);
  } catch (e) {}

  if (pendingTvAutoUpdateBuild && typeof applyPendingTvAutoUpdate === 'function') {
    if (applyPendingTvAutoUpdate()) return;
  }

  switchTvScreen('hub');
  if (wasPaired) {
    requestPairingCode(true);
    connectPairingWs();
  }
}

// ===================================================================
// SMART TV DIRECT CATALOG PLAYBACK & SERIES EPISODE PICKER
// ===================================================================
function switchToLocalTrack(trackIdx, resumeSec) {
  if (!localTracks || !localTracks.length) return;
  localTrackIdx = trackIdx % localTracks.length;
  var nextTr = localTracks[localTrackIdx];
  if (!nextTr) return;
  if (btnDockAudio) {
    btnDockAudio.textContent = nextTr.label || 'Señal ' + (localTrackIdx + 1);
  }
  if (nextTr.resolvedStreamUrl && (nextTr.resolvedStreamUrl.indexOf('/api/') === 0 || nextTr.resolvedStreamUrl.indexOf('http') === 0 || nextTr.resolverType === 'youtube')) {
    var directMode = nextTr.resolverType === 'youtube'
      ? 'youtube'
      : (nextTr.resolverType === 'web_embed' ? 'embed' : 'hls');
    applyVideoState(
      {
        mode: directMode,
        url: nextTr.resolvedStreamUrl,
        title: hudTitle.textContent,
        subtitle: nextTr.label || hudSub.textContent,
        isPlaying: true,
        isLive: currentIsLive,
        currentTime: resumeSec || 0
      },
      true
    );
    return;
  }

  var rawSource = nextTr.sourceUrl || nextTr.resolvedStreamUrl || '';
  if (!rawSource) {
    triggerPlaybackFailover('Pista vacía');
    return;
  }
  standbyOverlay.style.display = 'flex';
  if (standbySpinner) standbySpinner.style.display = 'block';
  standbyRoomPill.textContent = tvT('tryingAltServer');
  var q =
    'resolverType=' + encodeURIComponent(nextTr.resolverType || '') +
    '&url=' + encodeURIComponent(rawSource) +
    '&preferLang=' + encodeURIComponent(nextTr.lang || 'ES') +
    '&title=' + encodeURIComponent(hudTitle.textContent || '');
  xhrJson('GET', '/api/extract/stream?' + q, null, function (err, data) {
    if (!isLocalPlayback) return;
    if (err || !data || !data.success || !data.streamUrl) {
      triggerPlaybackFailover('Backup server error');
      return;
    }
    nextTr.resolvedStreamUrl = data.streamUrl;
    applyVideoState(
      {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        title: hudTitle.textContent,
        subtitle: nextTr.label || hudSub.textContent,
        isPlaying: true,
        isLive: currentIsLive,
        currentTime: resumeSec || 0
      },
      true
    );
  });
}

function playLocalStream(itemTitle, itemSub, extractQueryUrl) {
  pendingTizenAutoLaunchAntena3 = false;
  if (tizenAutoLaunchFallbackTimer) {
    clearTimeout(tizenAutoLaunchFallbackTimer);
    tizenAutoLaunchFallbackTimer = null;
  }
  isLocalPlayback = true;
  isPaired = false;
  activeLiveChannel = null;
  activeLiveFailedTrackIdxs = {};
  activeLiveFailedHostKeys = {};
  autoFailoverLock = false;
  closeMiniGuideDrawer();
  hideLiveZapOsd();
  switchTvScreen('player');
  if (standbyChannelBadge) standbyChannelBadge.style.display = 'none';
  if (standbySpinner) standbySpinner.style.display = 'block';
  if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
  standbyOverlay.style.display = 'flex';
  standbyRoomPill.textContent = tvT('loadingHdTv');
  standbyTitleText.textContent = itemTitle;
  standbySubText.textContent = itemSub || tvT('connectingEngine');
  syncPlayerDockMode(false);
  revealHud();

  xhrJson('GET', '/api/extract/stream?' + extractQueryUrl, null, function (err, data) {
    if (!isLocalPlayback) return;
    if (err || !data || !data.success || !data.streamUrl) {
      showStandbyError(itemTitle, (data && data.error) || tvT('pickAnotherSource'));
      showToast(tvT('signalTempUnavail'));
      return;
    }
    localTracks = Array.isArray(data.tracks) ? data.tracks : [];
    localTrackIdx = 0;
    for (var i = 0; i < localTracks.length; i++) {
      if (localTracks[i] && localTracks[i].resolvedStreamUrl === data.streamUrl) {
        localTrackIdx = i;
        break;
      }
    }
    if (btnDockAudio) {
      if (localTracks.length > 1) {
        btnDockAudio.style.display = 'inline-flex';
        btnDockAudio.textContent = localTracks[localTrackIdx].label || tvT('trackBtn');
      } else {
        btnDockAudio.style.display = 'none';
      }
    }
    applyVideoState(
      {
        mode: data.mode || 'hls',
        url: data.streamUrl,
        title: itemTitle,
        subtitle: itemSub + (data.resolvedLabel ? ' · ' + data.resolvedLabel : ''),
        isPlaying: true,
        isLive: Boolean(data.isLive),
        currentTime: 0
      },
      true
    );
  });
}

function playTdtChannelOnTv(ch, trackIndex, isFailoverAttempt) {
  if (!ch || !ch.channels || !ch.channels.length) return;
  pendingTizenAutoLaunchAntena3 = false;
  if (tizenAutoLaunchFallbackTimer) {
    clearTimeout(tizenAutoLaunchFallbackTimer);
    tizenAutoLaunchFallbackTimer = null;
  }
  if (!isFailoverAttempt) {
    activeLiveFailedTrackIdxs = {};
    activeLiveFailedHostKeys = {};
  }
  var idx = typeof trackIndex === 'number' ? trackIndex : 0;
  if (idx >= ch.channels.length) idx = 0;
  var track = ch.channels[idx];
  var streamUrl = track.resolvedStreamUrl || track.sourceUrl || track.url || '';
  if (!streamUrl) {
    activeLiveFailedTrackIdxs[idx] = true;
    if (idx + 1 < ch.channels.length) {
      playTdtChannelOnTv(ch, idx + 1, true);
    }
    return;
  }

  isLocalPlayback = true;
  isPaired = false;
  activeLiveChannel = ch;
  activeLiveTrackIdx = idx;
  localTracks = ch.channels;
  localTrackIdx = idx;
  autoFailoverLock = false;
  saveLastWatchedChannel(ch);
  switchTvScreen('player');
  hideHudImmediately();
  showLiveZapOsd(ch, idx);

  if (btnDockAudio) {
    if (ch.channels.length > 1) {
      btnDockAudio.style.display = 'inline-flex';
      btnDockAudio.textContent = track.label || 'Señal ' + (idx + 1);
    } else {
      btnDockAudio.style.display = 'none';
    }
  }

  var chEpg = catalogData.epg ? catalogData.epg[ch.id] : null;
  var epgLabel = chEpg && chEpg.now ? chEpg.now.title : (ch.description || ch.network || tvT('liveBadge'));
  var rType = track.resolverType || 'tdt_hls';
  var titleFull = ch.name + (ch.dial ? ' · ' + tvT('dialPrefix') + ch.dial : '');
  var subFull = (chEpg && chEpg.now ? tvT('nowPrefix') + chEpg.now.title : (ch.network || tvT('broadcast247'))) + ' · ' + (track.quality || 'HD');

  if (standbyChannelBadge && standbyLogoImg) {
    if (ch.logoUrl) {
      standbyLogoImg.src = ch.logoUrl;
      standbyChannelBadge.style.display = 'flex';
    } else {
      standbyChannelBadge.style.display = 'none';
    }
  }
  if (standbySpinner) standbySpinner.style.display = 'block';
  if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
  standbyOverlay.style.display = 'flex';
  standbyRoomPill.textContent = tvT('tuningLive');
  standbyTitleText.textContent = ch.name;
  standbySubText.textContent = epgLabel;
  syncPlayerDockMode(true);

  if (streamUrl.indexOf('/api/') === 0 || (rType === 'tdt_hls' && isDirectCorsPublicStream(streamUrl))) {
    applyVideoState(
      {
        mode: /\.(mp4|mkv|webm)(\?|$)/i.test(streamUrl) ? 'direct' : 'hls',
        url: streamUrl,
        title: titleFull,
        subtitle: subFull,
        logoUrl: ch.logoUrl || '',
        isPlaying: true,
        isLive: true,
        currentTime: 0
      },
      true
    );
    scheduleNextChannelPrewarm(ch);
    return;
  }

  var cachedExtract = getCachedLiveExtract(rType, streamUrl);
  if (cachedExtract) {
    applyVideoState(
      {
        mode: cachedExtract.mode || 'hls',
        url: cachedExtract.streamUrl,
        title: titleFull,
        subtitle: subFull,
        logoUrl: ch.logoUrl || '',
        isPlaying: true,
        isLive: true,
        currentTime: 0
      },
      true
    );
    scheduleNextChannelPrewarm(ch);
    return;
  }

  var q =
    'resolverType=' + encodeURIComponent(rType) +
    '&url=' + encodeURIComponent(streamUrl) +
    '&title=' + encodeURIComponent(ch.name || 'Live TV');

  xhrJson('GET', '/api/extract/stream?' + q, null, function (err, data) {
    if (!isLocalPlayback || activeLiveChannel !== ch) return;
    if (!err && data && data.success && data.streamUrl) {
      setCachedLiveExtract(rType, streamUrl, data);
      applyVideoState(
        {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          title: titleFull,
          subtitle: subFull,
          logoUrl: ch.logoUrl || '',
          isPlaying: true,
          isLive: true,
          currentTime: 0
        },
        true
      );
      scheduleNextChannelPrewarm(ch);
      return;
    }
    if (typeof triggerPlaybackFailover === 'function') {
      triggerPlaybackFailover('Error al conectar señal');
    } else if (idx + 1 < ch.channels.length) {
      playTdtChannelOnTv(ch, idx + 1, true);
    } else if (ch.id) {
      applyVideoState(
        {
          mode: 'hls',
          url: '/api/iptv/live/' + encodeURIComponent(ch.id) + '.m3u8',
          title: titleFull,
          subtitle: (chEpg && chEpg.now ? tvT('nowPrefix') + chEpg.now.title : (ch.network || 'IPTV HD')),
          logoUrl: ch.logoUrl || '',
          isPlaying: true,
          isLive: true,
          currentTime: 0
        },
        true
      );
      scheduleNextChannelPrewarm(ch);
    } else {
      showStandbyError(ch.name, tvT('noBroadcast'));
    }
  });
}

function zapLiveChannel(step) {
  if (!activeLiveChannel || !catalogData.tdt.length) return;
  var pool = filterTdtChannels(activeLiveFilter);
  if (!pool.length) pool = catalogData.tdt;
  var curIdx = -1;
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].id === activeLiveChannel.id) {
      curIdx = i;
      break;
    }
  }
  var nextIdx = curIdx === -1 ? 0 : (curIdx + step + pool.length) % pool.length;
  var nextCh = pool[nextIdx];
  if (nextCh) {
    playTdtChannelOnTv(nextCh, 0);
  }
}

function playMovieOnTv(movie) {
  if (!movie) return;
  var parts = [
    'mediaType=movie',
    'preferLang=ES',
    'title=' + encodeURIComponent(movie.title || '')
  ];
  if (movie.tmdbId) parts.push('tmdbId=' + encodeURIComponent(String(movie.tmdbId)));
  if (movie.movidyUrl) parts.push('movidyUrl=' + encodeURIComponent(movie.movidyUrl));
  if (movie.vestUrl) parts.push('vestUrl=' + encodeURIComponent(movie.vestUrl));
  playLocalStream(movie.title, (movie.year || 'HD') + ' · ' + tvT('movieLabel'), parts.join('&'));
}

function openSeriesModalOnTv(item) {
  if (!item) return;
  activeSeriesItem = item;
  activeSeriesSeason = item.seasonNumber || 1;
  if (item._forceEs) {
    activeSeriesLang = 'ES';
    var langPills = document.querySelectorAll('#sm-lang-row .series-pill-btn');
    for (var lp = 0; lp < langPills.length; lp++) {
      var dl = langPills[lp].getAttribute('data-lang');
      langPills[lp].className = 'series-pill-btn' + (dl === 'ES' ? ' active' : '');
    }
  }
  var smTitle = document.getElementById('sm-title');
  var smOverview = document.getElementById('sm-overview');
  var smBadge = document.getElementById('sm-badge');
  var smPoster = document.getElementById('sm-poster');
  var smSeasons = document.getElementById('sm-seasons-row');
  var smEpisodes = document.getElementById('sm-episodes-grid');

  smTitle.textContent = item.title || tvT('seriesLabel');
  smOverview.textContent = item.overview || tvT('loadingSeasons');
  smBadge.textContent = item.year ? tvT('smBadge') + ' · ' + item.year : tvT('smBadge');
  smPoster.src = item.poster || '/icon.svg';
  smSeasons.innerHTML = '';
  smEpisodes.innerHTML = '<div style="color:#adadb8;font-size:16px;padding:14px;">' + escapeHtml(tvT('loadingEpisodes')) + '</div>';
  seriesModal.style.display = 'block';

  if (!item.tmdbId) {
    smEpisodes.innerHTML = '<div style="color:#fda4af;font-size:16px;">' + escapeHtml(tvT('noTmdbId')) + '</div>';
    setTimeout(function () {
      var cBtn = document.getElementById('btn-close-series-modal');
      if (cBtn && cBtn.focus) cBtn.focus();
    }, 40);
    return;
  }
  loadTvSeriesSeason(item.tmdbId, activeSeriesSeason);
}

function loadTvSeriesSeason(tmdbId, seasonNum) {
  var smSeasons = document.getElementById('sm-seasons-row');
  var smEpisodes = document.getElementById('sm-episodes-grid');
  smEpisodes.innerHTML = '<div style="color:#adadb8;font-size:16px;padding:14px;">' + escapeHtml(tvT('loadingSeasonNum') + seasonNum) + '...</div>';
  var reqLang = activeSeriesItem && activeSeriesItem._forceEs ? 'es' : activeTvLang;

  xhrJson('GET', '/api/catalog/tv/' + encodeURIComponent(String(tmdbId)) + '?season=' + seasonNum + '&lang=' + encodeURIComponent(reqLang), null, function (err, res) {
    if (err || !res || !res.details) {
      smEpisodes.innerHTML = '<div style="color:#fda4af;font-size:16px;">' + escapeHtml(tvT('episodesLoadErr')) + '</div>';
      return;
    }
    var details = res.details;
    activeSeriesDetails = details;
    if (details.overview) {
      document.getElementById('sm-overview').textContent = details.overview;
    }
    var seasons = Array.isArray(details.seasons) ? details.seasons : [];
    smSeasons.innerHTML = '';
    for (var i = 0; i < seasons.length; i++) {
      (function (s) {
        var sb = document.createElement('button');
        sb.type = 'button';
        sb.className = 'series-pill-btn' + (Number(s.seasonNumber) === Number(details.activeSeason || seasonNum) ? ' active' : '');
        sb.textContent = s.name || tvT('seasonFallback') + s.seasonNumber;
        sb.tabIndex = 0;
        sb.onclick = function () {
          activeSeriesSeason = s.seasonNumber;
          loadTvSeriesSeason(tmdbId, s.seasonNumber);
        };
        smSeasons.appendChild(sb);
      })(seasons[i]);
    }

    var eps = Array.isArray(details.episodes) ? details.episodes : [];
    smEpisodes.innerHTML = '';
    if (!eps.length) {
      smEpisodes.innerHTML = '<div style="color:#adadb8;font-size:16px;padding:14px;">' + escapeHtml(tvT('noEpisodesSeason')) + '</div>';
      return;
    }
    for (var j = 0; j < eps.length; j++) {
      (function (ep) {
        var eb = document.createElement('button');
        eb.type = 'button';
        eb.className = 'ep-tile-btn';
        eb.tabIndex = 0;
        var epNumStr = String(ep.episodeNumber < 10 ? '0' + ep.episodeNumber : ep.episodeNumber);
        eb.innerHTML =
          '<div class="ep-tile-num">' + ep.seasonNumber + 'x' + epNumStr + '</div>' +
          '<div class="ep-tile-title">' + escapeHtml(ep.title || tvT('episodeFallback') + ep.episodeNumber) + '</div>';
        eb.onclick = function () {
          unlockAudio();
          seriesModal.style.display = 'none';
          var q = [
            'mediaType=tv',
            'tmdbId=' + encodeURIComponent(String(details.tmdbId || tmdbId)),
            'season=' + encodeURIComponent(String(ep.seasonNumber)),
            'episode=' + encodeURIComponent(String(ep.episodeNumber)),
            'preferLang=' + encodeURIComponent(activeSeriesLang),
            'title=' + encodeURIComponent(details.title || activeSeriesItem.title || ''),
            'episodeTitle=' + encodeURIComponent(ep.title || '')
          ].join('&');
          playLocalStream(
            (details.title || activeSeriesItem.title) + ' (' + ep.seasonNumber + 'x' + epNumStr + ')',
            (ep.title || tvT('episodeFallback')) + ' · ' + activeSeriesLang,
            q
          );
        };
        smEpisodes.appendChild(eb);
      })(eps[j]);
    }
    setTimeout(function () {
      var firstEpBtn = smEpisodes.querySelector('.ep-tile-btn');
      if (firstEpBtn && firstEpBtn.focus) firstEpBtn.focus();
    }, 60);
  });
}
