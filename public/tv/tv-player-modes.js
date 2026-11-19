// ===================================================================
// PAIRED ROOM RECEIVER MODE (ES5)
// ===================================================================
var roomHttpTimer = null;

function enterRoomReceiver(roomId, roomName, token, claimedBy) {
  if (isPaired && currentRoomId === roomId) return;
  isPaired = true;
  isLocalPlayback = false;
  activeLiveChannel = null;
  localTracks = [];
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
            user: { id: tvDeviceId, name: 'Google TV', avatar: '📺', color: '#9146FF' }
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
    encodeURIComponent('Google TV') +
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
  isPaired = false;
  isLocalPlayback = false;
  activeLiveChannel = null;
  currentRoomId = '';
  currentMode = 'idle';
  currentUrl = '';
  localTracks = [];
  autoFailoverLock = false;
  if (btnDockAudio) btnDockAudio.style.display = 'none';
  clearVideoWatchdog();
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
  if (pairingControls) pairingControls.style.display = 'block';
  try {
    window.history.replaceState({}, '', '/tv');
  } catch (e) {}

  switchTvScreen('hub');
  if (wasPaired) {
    requestPairingCode(true);
    connectPairingWs();
  }
}

// ===================================================================
// GOOGLE TV 10-FOOT DIRECT CATALOG PLAYBACK & SERIES EPISODE PICKER
// ===================================================================
function switchToLocalTrack(trackIdx, resumeSec) {
  if (!localTracks || !localTracks.length) return;
  localTrackIdx = trackIdx % localTracks.length;
  var nextTr = localTracks[localTrackIdx];
  if (!nextTr) return;
  if (btnDockAudio) {
    btnDockAudio.textContent = '🌐 ' + (nextTr.label || 'Servidor ' + (localTrackIdx + 1));
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
  isLocalPlayback = true;
  isPaired = false;
  activeLiveChannel = null;
  autoFailoverLock = false;
  switchTvScreen('player');
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
        btnDockAudio.style.display = 'inline-block';
        btnDockAudio.textContent = '🌐 ' + (localTracks[localTrackIdx].label || 'Audio');
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

function playTdtChannelOnTv(ch, trackIndex) {
  if (!ch || !ch.channels || !ch.channels.length) return;
  var idx = typeof trackIndex === 'number' ? trackIndex : 0;
  if (idx >= ch.channels.length) idx = 0;
  var track = ch.channels[idx];
  var streamUrl = track.resolvedStreamUrl || track.sourceUrl || track.url || '';
  if (!streamUrl) {
    if (idx + 1 < ch.channels.length) {
      playTdtChannelOnTv(ch, idx + 1);
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
  switchTvScreen('player');

  if (btnDockAudio) {
    if (ch.channels.length > 1) {
      btnDockAudio.style.display = 'inline-block';
      btnDockAudio.textContent = '📡 ' + (track.label || 'Signal ' + (idx + 1));
    } else {
      btnDockAudio.style.display = 'none';
    }
  }

  var chEpg = catalogData.epg ? catalogData.epg[ch.id] : null;
  var epgLabel = chEpg && chEpg.now ? chEpg.now.title : (ch.description || ch.network || tvT('liveBadge'));
  var rType = track.resolverType || 'tdt_hls';
  var q =
    'resolverType=' + encodeURIComponent(rType) +
    '&url=' + encodeURIComponent(streamUrl) +
    '&title=' + encodeURIComponent(ch.name || 'Live TV');

  if (standbySpinner) standbySpinner.style.display = 'block';
  if (btnStandbyRetry) btnStandbyRetry.style.display = 'none';
  standbyOverlay.style.display = 'flex';
  standbyRoomPill.textContent = tvT('tuningLive');
  standbyTitleText.textContent = ch.name;
  standbySubText.textContent = epgLabel;
  syncPlayerDockMode(true);

  xhrJson('GET', '/api/extract/stream?' + q, null, function (err, data) {
    if (!isLocalPlayback || activeLiveChannel !== ch) return;
    if (!err && data && data.success && data.streamUrl) {
      applyVideoState(
        {
          mode: data.mode || 'hls',
          url: data.streamUrl,
          title: ch.name + (ch.dial ? ' · ' + tvT('dialPrefix') + ch.dial : ''),
          subtitle: (chEpg && chEpg.now ? tvT('nowPrefix') + chEpg.now.title : (ch.network || tvT('broadcast247'))) + ' · ' + (track.quality || 'HD'),
          isPlaying: true,
          isLive: true,
          currentTime: 0
        },
        true
      );
      return;
    }
    if (idx + 1 < ch.channels.length) {
      playTdtChannelOnTv(ch, idx + 1);
    } else if (ch.id) {
      applyVideoState(
        {
          mode: 'hls',
          url: '/api/iptv/live/' + encodeURIComponent(ch.id) + '.m3u8',
          title: ch.name + (ch.dial ? ' · ' + tvT('dialPrefix') + ch.dial : ''),
          subtitle: (chEpg && chEpg.now ? tvT('nowPrefix') + chEpg.now.title : (ch.network || 'IPTV HD')),
          isPlaying: true,
          isLive: true,
          currentTime: 0
        },
        true
      );
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
    showToast((nextCh.dial ? tvT('dialPrefix') + nextCh.dial + ' · ' : '') + nextCh.name);
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
  smEpisodes.innerHTML = '<div style="color:#adadb8;font-size:14px;padding:12px;">' + escapeHtml(tvT('loadingEpisodes')) + '</div>';
  seriesModal.style.display = 'block';

  if (!item.tmdbId) {
    smEpisodes.innerHTML = '<div style="color:#fda4af;font-size:14px;">' + escapeHtml(tvT('noTmdbId')) + '</div>';
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
  smEpisodes.innerHTML = '<div style="color:#adadb8;font-size:14px;padding:12px;">' + escapeHtml(tvT('loadingSeasonNum') + seasonNum) + '...</div>';

  xhrJson('GET', '/api/catalog/tv/' + encodeURIComponent(String(tmdbId)) + '?season=' + seasonNum + '&lang=' + encodeURIComponent(activeTvLang), null, function (err, res) {
    if (err || !res || !res.details) {
      smEpisodes.innerHTML = '<div style="color:#fda4af;font-size:14px;">' + escapeHtml(tvT('episodesLoadErr')) + '</div>';
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
      smEpisodes.innerHTML = '<div style="color:#adadb8;font-size:14px;padding:12px;">' + escapeHtml(tvT('noEpisodesSeason')) + '</div>';
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
